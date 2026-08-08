// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Callback used by the authorized ReliefCart Factory after validator registration succeeds.
interface IRegistrationAwarePool {
    function confirmRegistration(address cva, bytes32 ruleHash) external;
}
