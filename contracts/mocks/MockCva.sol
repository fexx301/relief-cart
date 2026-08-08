// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockCva {
    mapping(address => uint256) public balances;
    bool public paused;
    bool public feeOnTransfer;

    function mint(address account, uint256 value) external {
        balances[account] += value;
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function setFeeOnTransfer(bool value) external {
        feeOnTransfer = value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function transfer(address recipient, uint256 value) external returns (bool) {
        require(!paused, "paused");
        require(balances[msg.sender] >= value, "balance");
        balances[msg.sender] -= value;
        uint256 received = feeOnTransfer ? value - 1 : value;
        balances[recipient] += received;
        return true;
    }
}
