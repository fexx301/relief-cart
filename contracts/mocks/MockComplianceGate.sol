// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IComplianceGate} from "../interfaces/IComplianceGate.sol";

contract MockComplianceGate is IComplianceGate {
    bool public poolReady = true;
    bool public beneficiaryAllowed = true;
    bool public merchantAllowed = true;
    bool public shouldRevert;

    function setResults(bool beneficiaryResult, bool merchantResult) external {
        beneficiaryAllowed = beneficiaryResult;
        merchantAllowed = merchantResult;
    }

    function setPoolReady(bool value) external {
        poolReady = value;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function isPoolReady(address) external view returns (bool) {
        if (shouldRevert) revert("gate failure");
        return poolReady;
    }

    function verifyBeneficiary(address, address) external view returns (bool) {
        if (shouldRevert) revert("gate failure");
        return beneficiaryAllowed;
    }

    function verifyMerchant(address, address) external view returns (bool) {
        if (shouldRevert) revert("gate failure");
        return merchantAllowed;
    }
}
