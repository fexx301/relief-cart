// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CleanverseComplianceGate} from "../contracts/CleanverseComplianceGate.sol";
import {IAPassComplianceValidator} from "../contracts/interfaces/IAPassComplianceValidator.sol";
import {MockComplianceValidator} from "../contracts/mocks/MockComplianceValidator.sol";

interface ComplianceGateVm {
    function expectRevert(bytes4 selector) external;

    function expectRevert() external;
}

contract CleanverseComplianceGateTest {
    ComplianceGateVm internal constant vm = ComplianceGateVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        validator.setRegistrar(address(this), true);
        validator.registerV2(POOL, _restrictiveRule());
        validator.setCompliance(POOL, BENEFICIARY, true);
        validator.setCompliance(POOL, MERCHANT, false);

        _assert(gate.verifyBeneficiary(POOL, BENEFICIARY));
        _assert(!gate.verifyMerchant(POOL, MERCHANT));
        _assert(gate.isPoolReady(POOL));
    }

    function testReportsUnregisteredPoolAsNotReady() public view {
        _assert(!gate.isPoolReady(POOL));
    }

    function testReportsUnrestrictedRegisteredPoolAsNotReady() public {
        validator.setRegistrar(address(this), true);
        IAPassComplianceValidator.RuleV2 memory unrestricted;
        validator.registerV2(POOL, unrestricted);

        _assert(!gate.isPoolReady(POOL));
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

    function _restrictiveRule() internal pure returns (IAPassComplianceValidator.RuleV2 memory) {
        return IAPassComplianceValidator.RuleV2({
            allowedGroup: bytes2("RC"),
            allowedSubGroup: bytes2("BV"),
            minTier: 1,
            minSubTier: 0,
            isBlackList: false,
            countryBitmap: 1
        });
    }
}
