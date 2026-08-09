// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";

interface ICvaAssociationPool {
    function cva() external view returns (address);
    function validator() external view returns (address);
    function cvaAssociationAuthority() external view returns (address);
    function cvaAssociationConfirmed() external view returns (bool);
    function cvaAssociationEvidenceHash() external view returns (bytes32);
    function confirmCvaAssociation(address associatedCva, bytes32 evidenceHash) external;
}

/// @title CvaAssociationCoordinator
/// @notice Atomic `registerApass` plus vault-confirmation path for a vendor-approved fallback.
/// @dev This coordinator requires its own validator authorization and must not be used unless
///      Cleanverse confirms association-only registration for the deployed validator.
contract CvaAssociationCoordinator {
    error InvalidAddress();
    error InvalidContract(address target);
    error Unauthorized();
    error PoolBindingMismatch();
    error AssociationNotConfirmed();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CvaAssociated(address indexed pool, address indexed cva, address indexed feeAddress, bytes32 evidenceHash);

    IAPassComplianceValidator public immutable validator;
    address public owner;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address validator_, address owner_) {
        if (validator_ == address(0) || owner_ == address(0)) revert InvalidAddress();
        if (validator_.code.length == 0) revert InvalidContract(validator_);
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

    /// @notice Associates a pre-registered pool and confirms it in one transaction.
    function associate(address pool, address cva, address feeAddress) external onlyOwner {
        if (pool == address(0) || cva == address(0)) revert InvalidAddress();
        if (pool.code.length == 0) revert InvalidContract(pool);
        if (cva.code.length == 0) revert InvalidContract(cva);

        ICvaAssociationPool candidate = ICvaAssociationPool(pool);
        if (
            candidate.validator() != address(validator) || candidate.cva() != cva
                || candidate.cvaAssociationAuthority() != address(this) || candidate.cvaAssociationConfirmed()
        ) revert PoolBindingMismatch();

        validator.registerApass(pool, cva, feeAddress);

        bytes32 evidenceHash = keccak256(abi.encode(block.chainid, address(validator), pool, cva, feeAddress));
        candidate.confirmCvaAssociation(cva, evidenceHash);
        if (!candidate.cvaAssociationConfirmed() || candidate.cvaAssociationEvidenceHash() != evidenceHash) {
            revert AssociationNotConfirmed();
        }

        emit CvaAssociated(pool, cva, feeAddress, evidenceHash);
    }
}
