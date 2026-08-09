// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CleanverseComplianceGate} from "../contracts/CleanverseComplianceGate.sol";
import {CvaAssociationCoordinator} from "../contracts/CvaAssociationCoordinator.sol";
import {RecoveryBenefitVault} from "../contracts/RecoveryBenefitVault.sol";
import {SingleContractRecoveryBenefitVault} from "../contracts/SingleContractRecoveryBenefitVault.sol";
import {IAPassComplianceValidator} from "../contracts/interfaces/IAPassComplianceValidator.sol";
import {MockComplianceValidator} from "../contracts/mocks/MockComplianceValidator.sol";
import {MockCva} from "../contracts/mocks/MockCva.sol";

interface SingleContractVm {
    function prank(address sender) external;

    function expectRevert(bytes4 selector) external;
}

contract SingleContractRecoveryBenefitVaultTest {
    SingleContractVm internal constant vm = SingleContractVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant BENEFICIARY = address(0xBEEF);
    address internal constant MERCHANT = address(0xCAFE);
    address internal constant OPERATOR = address(0xA11CE);
    uint256 internal constant AMOUNT = 100;

    MockCva internal token;
    MockComplianceValidator internal validator;
    CleanverseComplianceGate internal gate;
    CvaAssociationCoordinator internal coordinator;
    SingleContractRecoveryBenefitVault internal vault;

    function setUp() public {
        token = new MockCva();
        validator = new MockComplianceValidator();
        gate = new CleanverseComplianceGate(address(validator));
        coordinator = new CvaAssociationCoordinator(address(validator), address(this));
        vault = new SingleContractRecoveryBenefitVault(
            address(token),
            address(gate),
            address(validator),
            BENEFICIARY,
            MERCHANT,
            AMOUNT,
            uint64(block.timestamp + 1 days),
            BENEFICIARY,
            OPERATOR,
            address(coordinator)
        );
        validator.setRegistrar(address(this), true);
        validator.setRegistrar(address(coordinator), true);
    }

    function testExposesOwnerAndSelfRegistrationAuthority() public view {
        _assert(vault.owner() == OPERATOR);
        _assert(vault.registrationAuthority() == address(vault));
        _assert(address(vault.validator()) == address(validator));
        _assert(vault.cvaAssociationAuthority() == address(coordinator));
    }

    function testAssociationRequiresAuthorityAndRegisteredPool() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(RecoveryBenefitVault.Unauthorized.selector);
        vault.confirmCvaAssociation(address(token), keccak256("association-receipt"));

        vm.expectRevert(MockComplianceValidator.UnknownPool.selector);
        coordinator.associate(address(vault), address(token), address(0));
    }

    function testRejectsMismatchedGateValidator() public {
        MockComplianceValidator other = new MockComplianceValidator();
        vm.expectRevert(SingleContractRecoveryBenefitVault.ValidatorMismatch.selector);
        new SingleContractRecoveryBenefitVault(
            address(token),
            address(gate),
            address(other),
            BENEFICIARY,
            MERCHANT,
            AMOUNT,
            uint64(block.timestamp + 1 days),
            BENEFICIARY,
            OPERATOR,
            address(coordinator)
        );
    }

    function testSyncRequiresRegisteredExactRestrictiveRule() public {
        IAPassComplianceValidator.RuleV2 memory rule = _rule(50);

        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.AssociationNotConfirmed.selector);
        vault.syncRegistration(rule);

        validator.registerV2(address(vault), rule);
        coordinator.associate(address(vault), address(token), address(0));
        (bool registered, address associatedToken, address feeAddress) = validator.getRegistration(address(vault));
        _assert(registered && associatedToken == address(token) && feeAddress == address(0));

        vm.prank(OPERATOR);
        vault.syncRegistration(rule);

        _assert(vault.registrationConfirmed());
        _assert(vault.registrationRuleHash() == _hash(rule));
    }

    function testSyncRejectsUnrestrictedRule() public {
        IAPassComplianceValidator.RuleV2 memory unrestricted;
        validator.registerV2(address(vault), unrestricted);
        coordinator.associate(address(vault), address(token), address(0));

        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.UnrestrictedRule.selector);
        vault.syncRegistration(unrestricted);
    }

    function testOnlyOperatorCanReplaceRule() public {
        IAPassComplianceValidator.RuleV2 memory initialRule = _rule(1);
        validator.registerV2(address(vault), initialRule);

        vm.prank(address(0xBAD));
        vm.expectRevert(RecoveryBenefitVault.Unauthorized.selector);
        vault.setRuleV2(_rule(50));

        vm.prank(OPERATOR);
        vault.setRuleV2(_rule(50));

        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(vault));
        _assert(rules.length == 1);
        _assert(rules[0].minTier == 50);
    }

    function testAddThenRemoveKeepsOneRestrictiveRule() public {
        IAPassComplianceValidator.RuleV2 memory first = _rule(1);
        IAPassComplianceValidator.RuleV2 memory second = _rule(50);
        validator.registerV2(address(vault), first);

        vm.prank(OPERATOR);
        vault.addRuleV2(second);
        _assert(validator.getRulesV2(address(vault)).length == 2);

        vm.prank(OPERATOR);
        vault.removeRuleV2(0);

        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(vault));
        _assert(rules.length == 1);
        _assert(rules[0].minTier == 50);
    }

    function testNoOpAndWrongAddRollBack() public {
        validator.registerV2(address(vault), _rule(1));

        validator.setRuleMutationBehavior(true, false, false, false);
        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.RuleReadbackMismatch.selector);
        vault.addRuleV2(_rule(50));
        _assert(validator.getRulesV2(address(vault)).length == 1);

        validator.setRuleMutationBehavior(false, true, false, false);
        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.RuleReadbackMismatch.selector);
        vault.addRuleV2(_rule(50));
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(vault));
        _assert(rules.length == 1 && rules[0].minTier == 1);
    }

    function testNoOpAndWrongRemoveRollBack() public {
        validator.registerV2(address(vault), _rule(1));
        vm.prank(OPERATOR);
        vault.addRuleV2(_rule(50));

        validator.setRuleMutationBehavior(false, false, true, false);
        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.RuleReadbackMismatch.selector);
        vault.removeRuleV2(0);
        _assert(validator.getRulesV2(address(vault)).length == 2);

        validator.setRuleMutationBehavior(false, false, false, true);
        vm.prank(OPERATOR);
        vm.expectRevert(SingleContractRecoveryBenefitVault.RuleReadbackMismatch.selector);
        vault.removeRuleV2(0);
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(vault));
        _assert(rules.length == 2 && rules[0].minTier == 1 && rules[1].minTier == 50);
    }

    function testAssociationFailureRollsBackConfirmation() public {
        validator.registerV2(address(vault), _rule(50));
        validator.setFailApass(true);

        vm.expectRevert(MockComplianceValidator.UnknownPool.selector);
        coordinator.associate(address(vault), address(token), address(0));

        _assert(!vault.cvaAssociationConfirmed());
    }

    function testSynchronizedVaultActivatesAndRedeems() public {
        IAPassComplianceValidator.RuleV2 memory rule = _rule(50);
        validator.registerV2(address(vault), rule);
        coordinator.associate(address(vault), address(token), address(0));
        validator.setCompliance(address(vault), BENEFICIARY, true);
        validator.setCompliance(address(vault), MERCHANT, true);
        token.mint(address(vault), AMOUNT);

        vm.prank(OPERATOR);
        vault.syncRegistration(rule);
        vm.prank(OPERATOR);
        vault.activate(keccak256("api-registration-readback"));
        vm.prank(BENEFICIARY);
        vault.redeem(MERCHANT);

        _assert(token.balanceOf(MERCHANT) == AMOUNT);
        _assert(uint256(vault.status()) == uint256(RecoveryBenefitVault.BenefitStatus.Redeemed));
    }

    function _rule(uint8 minTier) internal pure returns (IAPassComplianceValidator.RuleV2 memory) {
        return IAPassComplianceValidator.RuleV2({
            allowedGroup: bytes2(0), allowedSubGroup: bytes2(0), minTier: minTier, minSubTier: 0, poolCountryBitmap: 0
        });
    }

    function _hash(IAPassComplianceValidator.RuleV2 memory rule) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(rule.allowedGroup, rule.allowedSubGroup, rule.minTier, rule.minSubTier, rule.poolCountryBitmap)
        );
    }

    function _assert(bool condition) internal pure {
        require(condition, "assertion failed");
    }
}
