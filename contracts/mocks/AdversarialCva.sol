// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReentryTarget {
    function redeem(address merchant) external;
}

contract AdversarialCva {
    enum ReturnMode {
        Standard,
        NoReturn,
        FalseReturn,
        MalformedReturn
    }

    mapping(address => uint256) public balances;
    ReturnMode public returnMode;
    bool public reenter;
    address public reentryVault;
    address public reentryMerchant;

    function mint(address account, uint256 value) external {
        balances[account] += value;
    }

    function configure(ReturnMode mode, bool reenter_, address vault, address merchant) external {
        returnMode = mode;
        reenter = reenter_;
        reentryVault = vault;
        reentryMerchant = merchant;
    }

    function triggerRedeem(address vault, address merchant) external {
        IReentryTarget(vault).redeem(merchant);
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    fallback(bytes calldata data) external returns (bytes memory) {
        if (bytes4(data[:4]) != bytes4(keccak256("transfer(address,uint256)"))) revert("unsupported");
        (address recipient, uint256 value) = abi.decode(data[4:], (address, uint256));

        if (reenter) IReentryTarget(reentryVault).redeem(reentryMerchant);
        if (returnMode == ReturnMode.FalseReturn) return abi.encode(false);
        if (returnMode == ReturnMode.MalformedReturn) return hex"01";

        require(balances[msg.sender] >= value, "balance");
        balances[msg.sender] -= value;
        balances[recipient] += value;
        if (returnMode == ReturnMode.NoReturn) return "";
        return abi.encode(true);
    }
}
