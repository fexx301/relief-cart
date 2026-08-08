// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RecoveryBenefitVault} from "../contracts/RecoveryBenefitVault.sol";
import {AdversarialCva} from "../contracts/mocks/AdversarialCva.sol";
import {MockComplianceGate} from "../contracts/mocks/MockComplianceGate.sol";

interface AdversarialVm {
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
}

contract RecoveryBenefitVaultAdversarialTest {
    AdversarialVm internal constant vm = AdversarialVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant MERCHANT = address(0xCAFE);
    address internal constant REFUND_RECIPIENT = address(0xFEE1);
    address internal constant OPERATOR = address(0xA11CE);
    uint256 internal constant AMOUNT = 100;

    AdversarialCva internal token;
    MockComplianceGate internal gate;
    RecoveryBenefitVault internal vault;

    function setUp() public {
        token = new AdversarialCva();
        gate = new MockComplianceGate();
        vault = new RecoveryBenefitVault(
            address(token),
            address(gate),
            address(token),
            MERCHANT,
            AMOUNT,
            uint64(block.timestamp + 1 days),
            REFUND_RECIPIENT,
            OPERATOR
        );
        token.mint(address(vault), AMOUNT);
        vm.prank(OPERATOR);
        vault.activate(keccak256("local-adversarial-evidence"));
    }

    function testNoReturnTokenIsAcceptedWithExactDeltas() public {
        token.configure(AdversarialCva.ReturnMode.NoReturn, false, address(0), address(0));
        token.triggerRedeem(address(vault), MERCHANT);

        _assertEq(token.balanceOf(MERCHANT), AMOUNT);
        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Redeemed));
    }

    function testFalseReturnTokenFailsAndRollsBack() public {
        token.configure(AdversarialCva.ReturnMode.FalseReturn, false, address(0), address(0));

        vm.expectRevert(RecoveryBenefitVault.TokenTransferFailed.selector);
        token.triggerRedeem(address(vault), MERCHANT);

        _assertEq(token.balanceOf(address(vault)), AMOUNT);
        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
    }

    function testMalformedReturnTokenFailsAndRollsBack() public {
        token.configure(AdversarialCva.ReturnMode.MalformedReturn, false, address(0), address(0));

        vm.expectRevert(RecoveryBenefitVault.TokenTransferFailed.selector);
        token.triggerRedeem(address(vault), MERCHANT);

        _assertEq(token.balanceOf(address(vault)), AMOUNT);
        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
    }

    function testReentrantTokenFailsAndRollsBack() public {
        token.configure(AdversarialCva.ReturnMode.Standard, true, address(vault), MERCHANT);

        vm.expectRevert(RecoveryBenefitVault.TokenTransferFailed.selector);
        token.triggerRedeem(address(vault), MERCHANT);

        _assertEq(token.balanceOf(address(vault)), AMOUNT);
        _assertEq(token.balanceOf(MERCHANT), 0);
        _assertEq(uint256(vault.status()), uint256(RecoveryBenefitVault.BenefitStatus.Active));
    }

    function _assert(bool condition) internal pure {
        require(condition, "assertion failed");
    }

    function _assertEq(uint256 left, uint256 right) internal pure {
        _assert(left == right);
    }
}
