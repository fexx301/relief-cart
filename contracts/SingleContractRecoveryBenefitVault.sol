// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RecoveryBenefitVault} from "./RecoveryBenefitVault.sol";
import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";

interface IValidatorBoundGate {
    function validator() external view returns (address);
}

interface IValidatorBoundAssociationAuthority {
    function validator() external view returns (address);
}

/// @title SingleContractRecoveryBenefitVault
/// @notice Unfunded fallback for Cleanverse's API-registered single-contract mode.
/// @dev This contract is not a substitute for the documented Factory path. It exists so a
///      vendor-confirmed `/validator/register` route can be tested against a fresh vault without
///      mutating or stranding the deployed Factory-mode candidate.
contract SingleContractRecoveryBenefitVault is RecoveryBenefitVault {
    error ValidatorMismatch();
    error AssociationNotConfirmed();
    error UnrestrictedRule();
    error RuleReadbackMismatch();

    event CvaAssociationConfirmed(bytes32 indexed evidenceHash);
    event ComplianceRegistrationSynchronized(bytes32 indexed ruleHash);
    event ComplianceRuleReplaced(bytes32 indexed ruleHash);
    event ComplianceRuleAdded(bytes32 indexed ruleHash);
    event ComplianceRuleRemoved(uint256 indexed index, bytes32 indexed remainingRuleHash);

    IAPassComplianceValidator public immutable validator;
    address public immutable cvaAssociationAuthority;
    bool public cvaAssociationConfirmed;
    bytes32 public cvaAssociationEvidenceHash;

    constructor(
        address cva_,
        address complianceGate_,
        address validator_,
        address beneficiary_,
        address merchant_,
        uint256 amount_,
        uint64 expiresAt_,
        address refundRecipient_,
        address operator_,
        address cvaAssociationAuthority_
    )
        RecoveryBenefitVault(
            cva_,
            complianceGate_,
            beneficiary_,
            merchant_,
            amount_,
            expiresAt_,
            refundRecipient_,
            operator_,
            address(this)
        )
    {
        if (validator_ == address(0) || validator_.code.length == 0) revert InvalidContract(validator_);
        if (cvaAssociationAuthority_ == address(0)) revert InvalidAddress();
        if (cvaAssociationAuthority_.code.length == 0) revert InvalidContract(cvaAssociationAuthority_);
        if (IValidatorBoundGate(complianceGate_).validator() != validator_) revert ValidatorMismatch();
        if (IValidatorBoundAssociationAuthority(cvaAssociationAuthority_).validator() != validator_) {
            revert ValidatorMismatch();
        }
        validator = IAPassComplianceValidator(validator_);
        cvaAssociationAuthority = cvaAssociationAuthority_;
    }

    /// @notice Ownership surface used by Cleanverse's single-contract registration flow.
    function owner() external view returns (address) {
        return operator;
    }

    /// @notice Records the successful association-only `registerApass` transaction.
    /// @dev The authority should be the coordinator that atomically calls `registerApass` and
    ///      this callback. A user-supplied evidence hash alone is never accepted.
    function confirmCvaAssociation(address associatedCva, bytes32 evidenceHash) external {
        if (msg.sender != cvaAssociationAuthority) revert Unauthorized();
        if (associatedCva != address(cva) || evidenceHash == bytes32(0)) revert InvalidRegistration();
        if (!validator.isRegistered(address(this))) revert RegistrationNotReady();
        if (cvaAssociationConfirmed) revert InvalidStatus();

        cvaAssociationConfirmed = true;
        cvaAssociationEvidenceHash = evidenceHash;
        emit CvaAssociationConfirmed(evidenceHash);
    }

    /// @notice Confirms an API registration only after exact live validator readback.
    /// @dev The vault calls its inherited callback itself; no external account can forge it.
    function syncRegistration(IAPassComplianceValidator.RuleV2 calldata expectedRule) external onlyOperator {
        if (!cvaAssociationConfirmed) revert AssociationNotConfirmed();
        _requireRestrictive(expectedRule);
        _requireExactSingleRule(expectedRule);

        bytes32 ruleHash = _ruleHash(expectedRule);
        this.confirmRegistration(address(cva), ruleHash);
        emit ComplianceRegistrationSynchronized(ruleHash);
    }

    /// @notice Replaces all pool rules through the validator's contract-owned path.
    function setRuleV2(IAPassComplianceValidator.RuleV2 calldata rule) external onlyOperator {
        _requireRestrictive(rule);
        validator.setRuleV2FromContract(rule);
        _requireExactSingleRule(rule);
        emit ComplianceRuleReplaced(_ruleHash(rule));
    }

    /// @notice Adds a restrictive rule while refusing any unrestricted readback.
    /// @dev Activation remains impossible until exactly one rule remains.
    function addRuleV2(IAPassComplianceValidator.RuleV2 calldata rule) external onlyOperator {
        _requireRestrictive(rule);
        IAPassComplianceValidator.RuleV2[] memory beforeRules = validator.getRulesV2(address(this));
        for (uint256 index = 0; index < beforeRules.length; index++) {
            if (_isUnrestricted(beforeRules[index])) revert UnrestrictedRule();
        }

        validator.addRuleV2FromContract(rule);

        IAPassComplianceValidator.RuleV2[] memory afterRules = validator.getRulesV2(address(this));
        if (afterRules.length != beforeRules.length + 1) revert RuleReadbackMismatch();
        for (uint256 index = 0; index < beforeRules.length; index++) {
            if (!_sameMemoryRule(afterRules[index], beforeRules[index])) revert RuleReadbackMismatch();
        }
        if (!_sameRule(afterRules[afterRules.length - 1], rule)) revert RuleReadbackMismatch();
        emit ComplianceRuleAdded(_ruleHash(rule));
    }

    /// @notice Removes one rule only when one restrictive rule remains afterward.
    function removeRuleV2(uint256 index) external onlyOperator {
        IAPassComplianceValidator.RuleV2[] memory beforeRules = validator.getRulesV2(address(this));
        if (beforeRules.length != 2 || index >= beforeRules.length) revert RuleReadbackMismatch();
        IAPassComplianceValidator.RuleV2 memory expectedRemaining = beforeRules[index == 0 ? 1 : 0];

        validator.removeRuleV2FromContract(index);
        IAPassComplianceValidator.RuleV2[] memory afterRules = validator.getRulesV2(address(this));
        if (
            afterRules.length != 1 || _isUnrestricted(afterRules[0])
                || !_sameMemoryRule(afterRules[0], expectedRemaining)
        ) revert RuleReadbackMismatch();
        emit ComplianceRuleRemoved(index, _ruleHash(afterRules[0]));
    }

    function _requireExactSingleRule(IAPassComplianceValidator.RuleV2 calldata expectedRule) internal view {
        if (!validator.isRegistered(address(this))) revert RegistrationNotReady();
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(address(this));
        if (rules.length != 1 || !_sameRule(rules[0], expectedRule)) revert RuleReadbackMismatch();
    }

    function _requireRestrictive(IAPassComplianceValidator.RuleV2 calldata rule) internal pure {
        if (_isUnrestricted(rule)) revert UnrestrictedRule();
    }

    function _isUnrestricted(IAPassComplianceValidator.RuleV2 memory rule) internal pure returns (bool) {
        return rule.allowedGroup == bytes2(0) && rule.allowedSubGroup == bytes2(0) && rule.minTier == 0
            && rule.minSubTier == 0 && rule.poolCountryBitmap == 0;
    }

    function _sameRule(IAPassComplianceValidator.RuleV2 memory left, IAPassComplianceValidator.RuleV2 calldata right)
        internal
        pure
        returns (bool)
    {
        return left.allowedGroup == right.allowedGroup && left.allowedSubGroup == right.allowedSubGroup
            && left.minTier == right.minTier && left.minSubTier == right.minSubTier
            && left.poolCountryBitmap == right.poolCountryBitmap;
    }

    function _sameMemoryRule(
        IAPassComplianceValidator.RuleV2 memory left,
        IAPassComplianceValidator.RuleV2 memory right
    ) internal pure returns (bool) {
        return left.allowedGroup == right.allowedGroup && left.allowedSubGroup == right.allowedSubGroup
            && left.minTier == right.minTier && left.minSubTier == right.minSubTier
            && left.poolCountryBitmap == right.poolCountryBitmap;
    }

    function _ruleHash(IAPassComplianceValidator.RuleV2 memory rule) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(rule.allowedGroup, rule.allowedSubGroup, rule.minTier, rule.minSubTier, rule.poolCountryBitmap)
        );
    }
}
