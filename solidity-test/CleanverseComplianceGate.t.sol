// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CleanverseComplianceGate} from "../contracts/CleanverseComplianceGate.sol";
import {MockComplianceValidator} from "../contracts/mocks/MockComplianceValidator.sol";

interface ComplianceGateVm {
    function expectRevert(bytes4 selector) external;

    function expectRevert() external;
}

contract CleanverseComplianceGateTest {
    ComplianceGateVm internal constant vm =
        ComplianceGateVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant POOL = address(0xB00C);
    address internal constant BENEFICIARY = address(0xBEEF);
    address internal constant MERCHANT = address(0xCAFE);

    MockComplianceValidator internal validator;
    CleanverseComplianceGate internal gate;

    function setUp() public {
        validator = new MockComplianceValidator();
        gate = new CleanverseComplianceGate(address(validator));
    }

    function testUsesImmutableValidator() public view {
        _assert(address(gate.validator()) == address(validator));
    }

    function testMapsBeneficiaryAndMerchantChecksToComplianceVerify() public {
        validator.setCompliance(POOL, BENEFICIARY, true);
        validator.setCompliance(POOL, MERCHANT, false);

        _assert(gate.verifyBeneficiary(POOL, BENEFICIARY));
        _assert(!gate.verifyMerchant(POOL, MERCHANT));
    }

    function testPropagatesValidatorFailureForVaultToFailClosed() public {
        validator.setRevertCompliance(true);

        vm.expectRevert();
        gate.verifyBeneficiary(POOL, BENEFICIARY);
    }

    function testRejectsZeroAndNonContractValidators() public {
        vm.expectRevert(CleanverseComplianceGate.InvalidValidator.selector);
        new CleanverseComplianceGate(address(0));

        vm.expectRevert(CleanverseComplianceGate.InvalidValidator.selector);
        new CleanverseComplianceGate(address(0x1234));
    }

    function _assert(bool condition) internal pure {
        require(condition, "assertion failed");
    }
}
