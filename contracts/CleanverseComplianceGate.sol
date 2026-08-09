// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";
import {IComplianceGate} from "./interfaces/IComplianceGate.sol";

/// @title CleanverseComplianceGate
/// @notice Immutable adapter from ReliefCart's compliance boundary to the documented CVI validator.
/// @dev The vault remains responsible for failing closed when either validator call reverts or returns false.
contract CleanverseComplianceGate is IComplianceGate {
    error InvalidValidator();

    IAPassComplianceValidator public immutable validator;

    constructor(address validator_) {
        if (validator_ == address(0) || validator_.code.length == 0) revert InvalidValidator();
        validator = IAPassComplianceValidator(validator_);
    }

    function isPoolReady(address pool) external view returns (bool) {
        if (!validator.isRegistered(pool)) return false;
        IAPassComplianceValidator.RuleV2[] memory rules = validator.getRulesV2(pool);
        if (rules.length != 1) return false;

        IAPassComplianceValidator.RuleV2 memory rule = rules[0];
        return rule.allowedGroup != bytes2(0) || rule.allowedSubGroup != bytes2(0) || rule.minTier != 0
            || rule.minSubTier != 0 || rule.isBlackList || rule.countryBitmap != 0;
    }

    function verifyBeneficiary(address pool, address account) external view returns (bool) {
        return validator.complianceVerify(pool, account);
    }

    function verifyMerchant(address pool, address account) external view returns (bool) {
        return validator.complianceVerify(pool, account);
    }
}
