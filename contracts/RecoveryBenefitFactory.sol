// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";
import {IRegistrationAwarePool} from "./interfaces/IRegistrationAwarePool.sol";

/// @title RecoveryBenefitFactory
/// @notice Local prototype of the documented Factory-mode registration sequence.
/// @dev Deployment remains blocked until Cleanverse confirms the grant signature, role target and UAT behavior.
contract RecoveryBenefitFactory {
    error InvalidAddress();
    error Unauthorized();
    error UnrestrictedRule();
    error RegistrationNotConfirmed();
    error RuleReadbackMismatch();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BenefitPoolRegistered(
        address indexed pool, address indexed cva, address indexed feeAddress, bytes32 ruleHash
    );

    IAPassComplianceValidator public immutable validator;
    address public owner;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address validator_, address owner_) {
        if (validator_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        if (validator_.code.length == 0) revert InvalidAddress();

        validator = IAPassComplianceValidator(validator_);
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    /// @notice Registers a vault rule, then associates the vault with its CVA and optional fee account.
    /// @dev The two external calls are atomic. This contract does not activate or fund the vault.
    function registerBenefitPool(
        address pool,
        address cva,
        address feeAddress,
        IAPassComplianceValidator.RuleV2 calldata rule
    ) external onlyOwner {
        if (pool == address(0) || cva == address(0)) revert InvalidAddress();
        if (pool.code.length == 0 || cva.code.length == 0) revert InvalidAddress();
        if (_isUnrestricted(rule)) revert UnrestrictedRule();

        validator.registerV2(pool, rule);
        validator.registerApass(pool, cva, feeAddress);

        if (!validator.isRegistered(pool)) revert RegistrationNotConfirmed();
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(pool);
        if (rules.length != 1 || !_sameRule(rules[0], rule)) revert RuleReadbackMismatch();

        bytes32 ruleHash = keccak256(
            abi.encode(
                rule.allowedGroup,
                rule.allowedSubGroup,
                rule.minTier,
                rule.minSubTier,
                rule.isBlackList,
                rule.countryBitmap
            )
        );
        IRegistrationAwarePool(pool).confirmRegistration(cva, ruleHash);

        emit BenefitPoolRegistered(pool, cva, feeAddress, ruleHash);
    }

    function _isUnrestricted(IAPassComplianceValidator.RuleV2 calldata rule) internal pure returns (bool) {
        return !rule.isBlackList && rule.allowedGroup == bytes2(0) && rule.allowedSubGroup == bytes2(0)
            && rule.minTier == 0 && rule.minSubTier == 0 && rule.countryBitmap == 0;
    }

    function _sameRule(IAPassComplianceValidator.RuleV2 memory left, IAPassComplianceValidator.RuleV2 calldata right)
        internal
        pure
        returns (bool)
    {
        return left.allowedGroup == right.allowedGroup && left.allowedSubGroup == right.allowedSubGroup
            && left.minTier == right.minTier && left.minSubTier == right.minSubTier
            && left.isBlackList == right.isBlackList && left.countryBitmap == right.countryBitmap;
    }
}
