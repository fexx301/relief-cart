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

    function verifyBeneficiary(address pool, address account) external view returns (bool) {
        return validator.complianceVerify(pool, account);
    }

    function verifyMerchant(address pool, address account) external view returns (bool) {
        return validator.complianceVerify(pool, account);
    }
}
