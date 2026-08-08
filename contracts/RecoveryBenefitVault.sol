// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IComplianceGate} from "./interfaces/IComplianceGate.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

/// @title RecoveryBenefitVault
/// @notice One isolated, merchant-bound recovery benefit.
/// @dev This contract intentionally has no Cleanverse-specific ABI or minting
///      authority. Registration and compliance wiring belongs in a later adapter.
contract RecoveryBenefitVault {
    enum BenefitStatus {
        Pending,
        Active,
        Revoked,
        Cancelled,
        Redeemed,
        Refunded
    }

    error InvalidAddress();
    error InvalidContract(address target);
    error InvalidAmount();
    error InvalidExpiry();
    error SameParty();
    error Unauthorized();
    error InvalidStatus();
    error InvalidEvidence();
    error InvalidRegistration();
    error RegistrationNotReady();
    error Expired();
    error InsufficientBalance(uint256 available, uint256 required);
    error MerchantMismatch();
    error ComplianceRejected();
    error RecoveryNotAllowed();
    error NothingToRecover();
    error TokenCallFailed();
    error TokenTransferFailed();
    error TransferInvariantFailed();
    error Reentrancy();

    event BenefitCreated(address indexed vault, address indexed cva, uint256 amount, uint64 expiresAt);
    event BenefitRegistrationConfirmed(address indexed vault, address indexed cva, bytes32 indexed ruleHash);
    event BenefitActivated(address indexed vault, uint256 fundedBalance, bytes32 evidenceHash);
    event BenefitRevoked(address indexed vault);
    event BenefitCancelled(address indexed vault);
    event BenefitRedeemed(address indexed vault, address indexed merchant, uint256 amount);
    event BenefitRefunded(address indexed vault, address indexed refundRecipient, uint256 amount);
    event SurplusRecovered(address indexed vault, address indexed refundRecipient, uint256 amount);

    IERC20Minimal public immutable cva;
    IComplianceGate public immutable complianceGate;
    address public immutable beneficiary;
    address public immutable merchant;
    address public immutable refundRecipient;
    address public immutable operator;
    address public immutable registrationAuthority;
    uint256 public immutable amount;
    uint64 public immutable expiresAt;
    BenefitStatus public status;
    bool public registrationConfirmed;
    bytes32 public registrationRuleHash;

    bool private _entered;

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(
        address cva_,
        address complianceGate_,
        address beneficiary_,
        address merchant_,
        uint256 amount_,
        uint64 expiresAt_,
        address refundRecipient_,
        address operator_,
        address registrationAuthority_
    ) {
        if (
            cva_ == address(0) || complianceGate_ == address(0) || beneficiary_ == address(0) || merchant_ == address(0)
                || refundRecipient_ == address(0) || operator_ == address(0) || registrationAuthority_ == address(0)
        ) revert InvalidAddress();
        if (cva_.code.length == 0) revert InvalidContract(cva_);
        if (complianceGate_.code.length == 0) revert InvalidContract(complianceGate_);
        if (beneficiary_ == merchant_) revert SameParty();
        if (amount_ == 0) revert InvalidAmount();
        if (expiresAt_ <= block.timestamp) revert InvalidExpiry();

        cva = IERC20Minimal(cva_);
        complianceGate = IComplianceGate(complianceGate_);
        beneficiary = beneficiary_;
        merchant = merchant_;
        refundRecipient = refundRecipient_;
        operator = operator_;
        registrationAuthority = registrationAuthority_;
        amount = amount_;
        expiresAt = expiresAt_;
        status = BenefitStatus.Pending;

        emit BenefitCreated(address(this), cva_, amount_, expiresAt_);
    }

    /// @notice Records the Factory's atomic validator rule and CVA-association transaction.
    function confirmRegistration(address registeredCva, bytes32 ruleHash) external {
        if (msg.sender != registrationAuthority) revert Unauthorized();
        if (status != BenefitStatus.Pending || registrationConfirmed) revert InvalidStatus();
        if (registeredCva != address(cva) || ruleHash == bytes32(0)) revert InvalidRegistration();

        registrationConfirmed = true;
        registrationRuleHash = ruleHash;
        emit BenefitRegistrationConfirmed(address(this), registeredCva, ruleHash);
    }

    /// @notice Operator attestation that registration, rules and funding are ready.
    /// @dev The evidence hash is an attestation only; it is not Cleanverse proof.
    function activate(bytes32 evidenceHash) external onlyOperator {
        if (status != BenefitStatus.Pending) revert InvalidStatus();
        if (block.timestamp >= expiresAt) revert Expired();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();
        if (!registrationConfirmed) revert RegistrationNotReady();

        try complianceGate.isPoolReady(address(this)) returns (bool ready) {
            if (!ready) revert RegistrationNotReady();
        } catch {
            revert RegistrationNotReady();
        }

        uint256 fundedBalance = _balanceOf(address(this));
        if (fundedBalance < amount) revert InsufficientBalance(fundedBalance, amount);

        status = BenefitStatus.Active;
        emit BenefitActivated(address(this), fundedBalance, evidenceHash);
    }

    /// @notice Cancels an unactivated benefit and returns all funds to the fixed recipient.
    function cancel() external onlyOperator nonReentrant {
        if (status != BenefitStatus.Pending) revert InvalidStatus();

        status = BenefitStatus.Cancelled;
        emit BenefitCancelled(address(this));
        _refundAll();
    }

    function revoke() external onlyOperator {
        if (status != BenefitStatus.Active) revert InvalidStatus();
        status = BenefitStatus.Revoked;
        emit BenefitRevoked(address(this));
    }

    function redeem(address presentedMerchant) external nonReentrant {
        if (msg.sender != beneficiary) revert Unauthorized();
        if (status != BenefitStatus.Active) revert InvalidStatus();
        if (block.timestamp >= expiresAt) revert Expired();
        if (presentedMerchant != merchant) revert MerchantMismatch();

        uint256 vaultBalance = _balanceOf(address(this));
        if (vaultBalance < amount) revert InsufficientBalance(vaultBalance, amount);
        _requireCompliance();

        // Consume before the external token call. A failed transfer reverts the
        // entire transaction and therefore rolls this state change back.
        status = BenefitStatus.Redeemed;
        _transferExact(merchant, amount);
        emit BenefitRedeemed(address(this), merchant, amount);
    }

    /// @notice Recovers funds after revocation, cancellation or expiry.
    function recover() external onlyOperator nonReentrant {
        if (!_recoveryAllowed()) revert RecoveryNotAllowed();
        status = BenefitStatus.Refunded;
        _refundAll();
    }

    /// @notice Recovers unsolicited CVA dust after a successful redemption.
    function recoverSurplus() external onlyOperator nonReentrant {
        if (status != BenefitStatus.Redeemed) revert RecoveryNotAllowed();
        uint256 surplus = _balanceOf(address(this));
        if (surplus == 0) revert NothingToRecover();
        _transferExact(refundRecipient, surplus);
        emit SurplusRecovered(address(this), refundRecipient, surplus);
    }

    function _recoveryAllowed() internal view returns (bool) {
        if (status == BenefitStatus.Revoked || status == BenefitStatus.Cancelled) return true;
        if ((status == BenefitStatus.Pending || status == BenefitStatus.Active) && block.timestamp >= expiresAt) {
            return true;
        }
        return false;
    }

    function _refundAll() internal {
        uint256 remaining = _balanceOf(address(this));
        _transferExact(refundRecipient, remaining);
        emit BenefitRefunded(address(this), refundRecipient, remaining);
    }

    function _requireCompliance() internal view {
        try complianceGate.verifyBeneficiary(address(this), beneficiary) returns (bool allowed) {
            if (!allowed) revert ComplianceRejected();
        } catch {
            revert ComplianceRejected();
        }

        try complianceGate.verifyMerchant(address(this), merchant) returns (bool allowed) {
            if (!allowed) revert ComplianceRejected();
        } catch {
            revert ComplianceRejected();
        }
    }

    function _balanceOf(address account) internal view returns (uint256 balance) {
        try cva.balanceOf(account) returns (uint256 value) {
            return value;
        } catch {
            revert TokenCallFailed();
        }
    }

    function _transferExact(address recipient, uint256 transferAmount) internal {
        if (transferAmount == 0) return;

        uint256 vaultBefore = _balanceOf(address(this));
        uint256 recipientBefore = _balanceOf(recipient);

        (bool success, bytes memory returnData) =
            address(cva).call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, recipient, transferAmount));
        if (!success) revert TokenTransferFailed();
        if (returnData.length != 0 && (returnData.length < 32 || !abi.decode(returnData, (bool)))) {
            revert TokenTransferFailed();
        }

        uint256 vaultAfter = _balanceOf(address(this));
        uint256 recipientAfter = _balanceOf(recipient);
        if (
            vaultBefore < vaultAfter || vaultBefore - vaultAfter != transferAmount || recipientAfter < recipientBefore
                || recipientAfter - recipientBefore != transferAmount
        ) revert TransferInvariantFailed();
    }
}
