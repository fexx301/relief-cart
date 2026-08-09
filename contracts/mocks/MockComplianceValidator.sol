// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAPassComplianceValidator} from "../interfaces/IAPassComplianceValidator.sol";

contract MockComplianceValidator is IAPassComplianceValidator {
    error NotRegistrar();
    error AlreadyRegistered();
    error UnknownPool();

    struct Registration {
        bool registered;
        address aToken;
        address fee;
        RuleV2[] rules;
    }

    mapping(address => bool) public registrar;
    mapping(address => Registration) private registrations;
    mapping(address => mapping(address => bool)) public compliant;
    bool public revertCompliance;
    bool public failApass;
    bool public noOpAdd;
    bool public wrongAdd;
    bool public noOpRemove;
    bool public wrongRemove;

    event MockRegistered(address indexed pool, address indexed aToken, address indexed fee);
    event MockRuleSet(address indexed pool, RuleV2 rule);

    function setRegistrar(address account, bool allowed) external {
        registrar[account] = allowed;
    }

    function setCompliance(address pool, address account, bool allowed) external {
        compliant[pool][account] = allowed;
    }

    function setRevertCompliance(bool value) external {
        revertCompliance = value;
    }

    function setFailApass(bool value) external {
        failApass = value;
    }

    function setRuleMutationBehavior(bool noOpAdd_, bool wrongAdd_, bool noOpRemove_, bool wrongRemove_) external {
        noOpAdd = noOpAdd_;
        wrongAdd = wrongAdd_;
        noOpRemove = noOpRemove_;
        wrongRemove = wrongRemove_;
    }

    function registerV2(address poolAddress, RuleV2 calldata rule) external {
        if (!registrar[msg.sender]) revert NotRegistrar();
        Registration storage record = registrations[poolAddress];
        if (record.registered) revert AlreadyRegistered();
        record.registered = true;
        record.rules.push(rule);
        emit MockRuleSet(poolAddress, rule);
    }

    function registerApass(address poolAddress, address aTokenAddress) external {
        registerApass(poolAddress, aTokenAddress, address(0));
    }

    function registerApass(address poolAddress, address aTokenAddress, address feeAddress) public {
        if (!registrar[msg.sender]) revert NotRegistrar();
        if (failApass) revert UnknownPool();
        Registration storage record = registrations[poolAddress];
        if (!record.registered) revert UnknownPool();
        record.aToken = aTokenAddress;
        record.fee = feeAddress;
        emit MockRegistered(poolAddress, aTokenAddress, feeAddress);
    }

    function setRuleV2FromRegistrar(address poolAddress, RuleV2 calldata rule) external {
        if (!registrar[msg.sender]) revert NotRegistrar();
        Registration storage record = registrations[poolAddress];
        if (!record.registered) revert UnknownPool();
        delete record.rules;
        record.rules.push(rule);
        emit MockRuleSet(poolAddress, rule);
    }

    function setRuleV2FromContract(RuleV2 calldata rule) external {
        Registration storage record = registrations[msg.sender];
        if (!record.registered) revert UnknownPool();
        delete record.rules;
        record.rules.push(rule);
        emit MockRuleSet(msg.sender, rule);
    }

    function addRuleV2FromContract(RuleV2 calldata rule) external {
        Registration storage record = registrations[msg.sender];
        if (!record.registered) revert UnknownPool();
        if (noOpAdd) return;
        if (wrongAdd) {
            RuleV2 memory wrongRule = rule;
            wrongRule.minTier = rule.minTier == type(uint8).max ? 1 : rule.minTier + 1;
            record.rules.push(wrongRule);
            emit MockRuleSet(msg.sender, wrongRule);
            return;
        }
        record.rules.push(rule);
        emit MockRuleSet(msg.sender, rule);
    }

    function removeRuleV2FromContract(uint256 index) external {
        Registration storage record = registrations[msg.sender];
        if (!record.registered) revert UnknownPool();
        if (noOpRemove) return;
        uint256 last = record.rules.length - 1;
        if (index != last) record.rules[index] = record.rules[last];
        record.rules.pop();
        if (wrongRemove && record.rules.length > 0) {
            uint8 minTier = record.rules[0].minTier;
            record.rules[0].minTier = minTier == type(uint8).max ? 1 : minTier + 1;
        }
    }

    function getRulesV2(address poolAddress) external view returns (RuleV2[] memory) {
        return registrations[poolAddress].rules;
    }

    function isRegistered(address poolAddress) external view returns (bool) {
        return registrations[poolAddress].registered;
    }

    function complianceVerify(address poolAddress, address userAddress) external view returns (bool) {
        if (revertCompliance) revert("mock compliance failure");
        return compliant[poolAddress][userAddress];
    }

    function getRegistration(address poolAddress) external view returns (bool registered, address aToken, address fee) {
        Registration storage value = registrations[poolAddress];
        return (value.registered, value.aToken, value.fee);
    }
}
