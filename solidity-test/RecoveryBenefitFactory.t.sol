// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RecoveryBenefitFactory} from "../contracts/RecoveryBenefitFactory.sol";
import {IAPassComplianceValidator} from "../contracts/interfaces/IAPassComplianceValidator.sol";
import {MockComplianceValidator} from "../contracts/mocks/MockComplianceValidator.sol";
import {MockCva} from "../contracts/mocks/MockCva.sol";

interface FactoryVm {
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
}

contract PoolStub {}

contract RecoveryBenefitFactoryTest {
    FactoryVm internal constant vm = FactoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant OWNER = address(0xA11CE);
    address internal constant OTHER = address(0xB0B);

    MockComplianceValidator internal validator;
    RecoveryBenefitFactory internal factory;
    PoolStub internal pool;
    MockCva internal cva;

    function setUp() public {
        validator = new MockComplianceValidator();
        factory = new RecoveryBenefitFactory(address(validator), OWNER);
        pool = new PoolStub();
        cva = new MockCva();
        validator.setRegistrar(address(factory), true);
    }

    function testRegistersRuleBeforeCvaAssociation() public {
        IAPassComplianceValidator.RuleV2 memory rule = _restrictiveRule();

        vm.prank(OWNER);
        factory.registerBenefitPool(address(pool), address(cva), address(0), rule);

        (bool registered, address aToken, address fee) = validator.getRegistration(address(pool));
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(pool));
        _assert(registered);
        _assertEq(aToken, address(cva));
        _assertEq(fee, address(0));
        _assertEq(rules.length, 1);
        _assertEq(rules[0].allowedGroup, bytes2("RC"));
        _assertEq(rules[0].minTier, 30);
        _assertEq(rules[0].minSubTier, 7);
    }

    function testRegistrationIsAtomicWhenApassFails() public {
        validator.setFailApass(true);

        vm.prank(OWNER);
        vm.expectRevert(MockComplianceValidator.UnknownPool.selector);
        factory.registerBenefitPool(address(pool), address(cva), address(0), _restrictiveRule());

        _assert(!(validator.isRegistered(address(pool))));
        _assertEq(validator.getRulesV2(address(pool)).length, 0);
    }

    function testOnlyOwnerCanRegister() public {
        vm.prank(OTHER);
        vm.expectRevert(RecoveryBenefitFactory.Unauthorized.selector);
        factory.registerBenefitPool(address(pool), address(cva), address(0), _restrictiveRule());
    }

    function testOwnershipTransferChangesAuthority() public {
        vm.prank(OWNER);
        factory.transferOwnership(OTHER);

        vm.prank(OWNER);
        vm.expectRevert(RecoveryBenefitFactory.Unauthorized.selector);
        factory.registerBenefitPool(address(pool), address(cva), address(0), _restrictiveRule());

        vm.prank(OTHER);
        factory.registerBenefitPool(address(pool), address(cva), address(0), _restrictiveRule());
    }

    function testRejectsNonContractPoolOrCva() public {
        vm.prank(OWNER);
        vm.expectRevert(RecoveryBenefitFactory.InvalidAddress.selector);
        factory.registerBenefitPool(OTHER, address(cva), address(0), _restrictiveRule());

        vm.prank(OWNER);
        vm.expectRevert(RecoveryBenefitFactory.InvalidAddress.selector);
        factory.registerBenefitPool(address(pool), OTHER, address(0), _restrictiveRule());
    }

    function _restrictiveRule() internal pure returns (IAPassComplianceValidator.RuleV2 memory) {
        return IAPassComplianceValidator.RuleV2({
            allowedGroup: bytes2("RC"),
            allowedSubGroup: bytes2("BV"),
            minTier: 30,
            minSubTier: 7,
            // API-calculated country bitmaps are deployment data; this is only a bounded nonzero fixture.
            poolCountryBitmap: 1 << 8
        });
    }

    function _assert(bool condition) internal pure {
        require(condition, "assertion failed");
    }

    function _assertEq(address left, address right) internal pure {
        _assert(left == right);
    }

    function _assertEq(uint256 left, uint256 right) internal pure {
        _assert(left == right);
    }

    function _assertEq(bytes2 left, bytes2 right) internal pure {
        _assert(left == right);
    }
}
