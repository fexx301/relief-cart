// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice RuleV2 and registration surface documented by the CVI guide.
/// @dev This interface intentionally contains no deployment-specific addresses or roles beyond REGISTER_ROLE.
interface IAPassComplianceValidator {
    struct RuleV2 {
        bytes2 allowedGroup;
        bytes2 allowedSubGroup;
        uint8 minTier;
        uint8 minSubTier;
        bool isBlackList;
        uint256 countryBitmap;
    }

    function registerV2(address poolAddress, RuleV2 calldata rule) external;
    function registerApass(address poolAddress, address aTokenAddress) external;
    function registerApass(address poolAddress, address aTokenAddress, address feeAddress) external;
    function setRuleV2FromRegistrar(address poolAddress, RuleV2 calldata rule) external;
    function setRuleV2FromContract(RuleV2 calldata rule) external;
    function addRuleV2FromContract(RuleV2 calldata rule) external;
    function removeRuleV2FromContract(uint256 index) external;
    function getRulesV2(address poolAddress) external view returns (RuleV2[] memory);
    function isRegistered(address poolAddress) external view returns (bool);
    function complianceVerify(address poolAddress, address userAddress) external view returns (bool);
}
