// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";

/// @title RecoveryBenefitFactory
/// @notice Local prototype of the documented Factory-mode registration sequence.
/// @dev Deployment remains blocked until Cleanverse confirms the grant signature, role target and UAT behavior.
contract RecoveryBenefitFactory {
    error InvalidAddress();
    error Unauthorized();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BenefitPoolRegistered(address indexed pool, address indexed cva, address indexed feeAddress);

    IAPassComplianceValidator public immutable validator;
    address public owner;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address validator_, address owner_) {
        if (validator_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        if (validator_.code.length == 0) revert InvalidAddress();

        validator = IAPassComplianceValidator(validator_);
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    /// @notice Registers a vault rule, then associates the vault with its CVA and optional fee account.
    /// @dev The two external calls are atomic. This contract does not activate or fund the vault.
    function registerBenefitPool(
        address pool,
        address cva,
        address feeAddress,
        IAPassComplianceValidator.RuleV2 calldata rule
    ) external onlyOwner {
        if (pool == address(0) || cva == address(0)) revert InvalidAddress();
        if (pool.code.length == 0 || cva.code.length == 0) revert InvalidAddress();

        validator.registerV2(pool, rule);
        validator.registerApass(pool, cva, feeAddress);

        emit BenefitPoolRegistered(pool, cva, feeAddress);
    }
}
