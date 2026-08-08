// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Vendor-neutral compliance boundary for the benefit vault.
/// @dev A later Cleanverse adapter can map its confirmed validator ABI to this
///      interface without coupling the vault to an unverified call shape.
interface IComplianceGate {
    function isPoolReady(address pool) external view returns (bool);

    function verifyBeneficiary(address pool, address account) external view returns (bool);

    function verifyMerchant(address pool, address account) external view returns (bool);
}
