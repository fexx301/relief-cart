// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RecoveryBenefitVault} from "../contracts/RecoveryBenefitVault.sol";
import {MockComplianceGate} from "../contracts/mocks/MockComplianceGate.sol";
import {MockCva} from "../contracts/mocks/MockCva.sol";

interface Vm {
    function warp(uint256 timestamp) external;

    function prank(address sender) external;

    function expectRevert() external;

    function expectRevert(bytes4 selector) external;

    function expectRevert(bytes calldata expectedRevertData) external;
}

contract RecoveryBenefitVaultTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant BENEFICIARY = address(0xBEEF);
    address internal constant MERCHANT = address(0xCAFE);
    address internal constant REFUND_RECIPIENT = address(0xFEE1);
    address internal constant OPERATOR = address(0xA11CE);
    uint256 internal constant BENEFIT_AMOUNT = 100;

    MockCva internal token;
    MockComplianceGate internal gate;
    RecoveryBenefitVault internal vault;

    function setUp() public {
        token = new MockCva();
        gate = new MockComplianceGate();
        vault = _newVault();
        token.mint(address(vault), BENEFIT_AMOUNT);
    }

    function testCannotRedeemBeforeActivation() public {
        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.InvalidStatus.selector);
        vault.redeem(MERCHANT);
    }

    function testActivationAndRedemption() public {
        _activate();

        vm.prank(BENEFICIARY);
        vault.redeem(MERCHANT);

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Redeemed));
        _assertEq(token.balanceOf(MERCHANT), BENEFIT_AMOUNT);
        _assertEq(token.balanceOf(address(vault)), 0);
    }

    function testWrongMerchantReverts() public {
        _activate();

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.MerchantMismatch.selector);
        vault.redeem(address(0x1234));
    }

    function testUnauthorizedBeneficiaryCannotRedeem() public {
        _activate();

        vm.prank(address(0x9999));
        vm.expectRevert(RecoveryBenefitVault.Unauthorized.selector);
        vault.redeem(MERCHANT);
    }

    function testMerchantComplianceFalseRevertsClosed() public {
        _activate();
        gate.setResults(true, false);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.ComplianceRejected.selector);
        vault.redeem(MERCHANT);

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
        _assertEq(token.balanceOf(address(vault)), BENEFIT_AMOUNT);
    }

    function testWrongStatusCannotRecoverOrRevoke() public {
        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.RecoveryNotAllowed.selector);
        vault.recover();

        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.InvalidStatus.selector);
        vault.revoke();
    }

    function testComplianceFalseRevertsClosed() public {
        _activate();
        gate.setResults(false, true);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.ComplianceRejected.selector);
        vault.redeem(MERCHANT);

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
        _assertEq(token.balanceOf(address(vault)), BENEFIT_AMOUNT);
    }

    function testComplianceRevertFailsClosed() public {
        _activate();
        gate.setShouldRevert(true);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.ComplianceRejected.selector);
        vault.redeem(MERCHANT);
    }

    function testExpiryIsStrictAndRefunds() public {
        _activate();
        vm.warp(vault.expiresAt());

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.Expired.selector);
        vault.redeem(MERCHANT);

        vm.prank(OPERATOR);
        vault.recover();

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Refunded));
        _assertEq(token.balanceOf(REFUND_RECIPIENT), BENEFIT_AMOUNT);
        _assertEq(token.balanceOf(address(vault)), 0);
    }

    function testPendingCancellationRefundsFundedVault() public {
        vm.prank(OPERATOR);
        vault.cancel();

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Cancelled));
        _assertEq(token.balanceOf(REFUND_RECIPIENT), BENEFIT_AMOUNT);
        _assertEq(token.balanceOf(address(vault)), 0);
    }

    function testRevocationThenRecovery() public {
        _activate();

        vm.prank(OPERATOR);
        vault.revoke();
        vm.prank(OPERATOR);
        vault.recover();

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Refunded));
        _assertEq(token.balanceOf(REFUND_RECIPIENT), BENEFIT_AMOUNT);
    }

    function testSurplusCanBeRecoveredAfterRedemption() public {
        uint256 surplus = 7;
        token.mint(address(vault), surplus);
        _activate();

        vm.prank(BENEFICIARY);
        vault.redeem(MERCHANT);
        _assertEq(token.balanceOf(address(vault)), surplus);

        vm.prank(OPERATOR);
        vault.recoverSurplus();

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Redeemed));
        _assertEq(token.balanceOf(REFUND_RECIPIENT), surplus);
        _assertEq(token.balanceOf(address(vault)), 0);
    }

    function testFeeOnTransferFailsExactDelta() public {
        _activate();
        token.setFeeOnTransfer(true);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.TransferInvariantFailed.selector);
        vault.redeem(MERCHANT);

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
        _assertEq(token.balanceOf(MERCHANT), 0);
    }

    function testPausedTokenFailsAndRollsBackState() public {
        _activate();
        token.setPaused(true);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.TokenTransferFailed.selector);
        vault.redeem(MERCHANT);

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
    }

    function testRefundFailureRollsBackState() public {
        _activate();
        vm.prank(OPERATOR);
        vault.revoke();
        token.setPaused(true);

        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.TokenTransferFailed.selector);
        vault.recover();

        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Revoked));
    }

    function testDuplicateRedemptionReverts() public {
        _activate();
        vm.prank(BENEFICIARY);
        vault.redeem(MERCHANT);

        vm.prank(BENEFICIARY);
        vm.expectRevert(RecoveryBenefitVault.InvalidStatus.selector);
        vault.redeem(MERCHANT);
    }

    function testActivationRequiresFundingAndEvidence() public {
        RecoveryBenefitVault emptyVault = _newVault();

        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.InvalidEvidence.selector);
        emptyVault.activate(bytes32(0));

        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.RegistrationNotReady.selector);
        emptyVault.activate(keccak256("ready"));

        vm.prank(OPERATOR);
        emptyVault.confirmRegistration(address(token), keccak256("rule"));

        vm.prank(OPERATOR);
        vm.expectRevert(
            abi.encodeWithSelector(RecoveryBenefitVault.InsufficientBalance.selector, uint256(0), BENEFIT_AMOUNT)
        );
        emptyVault.activate(keccak256("ready"));
    }

    function testActivationRequiresLivePoolReadiness() public {
        vm.prank(OPERATOR);
        vault.confirmRegistration(address(token), keccak256("rule"));
        gate.setPoolReady(false);

        vm.prank(OPERATOR);
        vm.expectRevert(RecoveryBenefitVault.RegistrationNotReady.selector);
        vault.activate(keccak256("ready"));
    }

    function testOnlyRegistrationAuthorityCanConfirmRegistration() public {
        vm.prank(address(0x9999));
        vm.expectRevert(RecoveryBenefitVault.Unauthorized.selector);
        vault.confirmRegistration(address(token), keccak256("rule"));
    }

    function testOnlyOperatorCanChangeLifecycle() public {
        vm.prank(address(0x9999));
        vm.expectRevert(RecoveryBenefitVault.Unauthorized.selector);
        vault.cancel();
    }

    function _newVault() internal returns (RecoveryBenefitVault) {
        return new RecoveryBenefitVault(
            address(token),
            address(gate),
            BENEFICIARY,
            MERCHANT,
            BENEFIT_AMOUNT,
            uint64(block.timestamp + 1 days),
            REFUND_RECIPIENT,
            OPERATOR,
            OPERATOR
        );
    }

    function _activate() internal {
        vm.prank(OPERATOR);
        vault.confirmRegistration(address(token), keccak256("rule"));
        vm.prank(OPERATOR);
        vault.activate(keccak256("registration-attestation"));
    }

    function _assert(bool condition) internal pure {
        require(condition, "assertion failed");
    }

    function _assertEq(uint256 left, uint256 right) internal pure {
        _assert(left == right);
    }
}
