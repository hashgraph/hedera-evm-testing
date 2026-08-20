// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

/**
 * Exercises CALL/DELEGATECALL/STATICCALL semantics against SimpleStorage.
 * Storage layout (slots 0-3) intentionally mirrors SimpleStorage so that
 * delegatecall-ing into SimpleStorage.setValue writes *this* contract's storage.
 */
contract EthValidationCaller {
    uint256 public value; // storage slot 0
    address public lastSender; // storage slot 1
    uint256 public lastValue; // storage slot 2
    address public lastOrigin; // storage slot 3

    function doCall(address target, uint256 newValue)
        external
        payable
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = target.call{value: msg.value}(
            abi.encodeWithSignature("setValue(uint256)", newValue)
        );
    }

    function doCallData(address target, bytes calldata data)
        external
        payable
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = target.call{value: msg.value}(data);
    }

    function doDelegateCall(address target, bytes calldata data)
        external
        payable
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = target.delegatecall(data);
    }

    function doStaticCall(address target, bytes calldata data)
        external
        view
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = target.staticcall(data);
    }

    /// STATICCALL into a state-writing function; must yield ok == false while the outer tx succeeds.
    function doStaticCallWrite(address target, uint256 newValue) external returns (bool ok) {
        (ok, ) = target.staticcall(abi.encodeWithSignature("setValue(uint256)", newValue));
    }

    /// Forwards only `gasAmount` gas to the inner call (subject to the 63/64 rule).
    function callWithGas(address target, uint256 gasAmount, uint256 newValue)
        external
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = target.call{gas: gasAmount}(
            abi.encodeWithSignature("setValue(uint256)", newValue)
        );
    }

    /// CALL with empty calldata, e.g. into an EOA or a non-existent account.
    function callEmpty(address target)
        external
        payable
        returns (bool ok, bytes memory ret, uint256 len)
    {
        (ok, ret) = target.call{value: msg.value}("");
        len = ret.length;
    }

    /// Recursive self-call chain of `depth` hops ending in target.setValue(newValue).
    /// Each hop adds 1 to the returned value, proving return data flows back through every frame.
    function nestedCall(uint256 depth, address target, uint256 newValue)
        external
        returns (uint256)
    {
        if (depth == 0) {
            (bool ok, bytes memory ret) = target.call(
                abi.encodeWithSignature("setValue(uint256)", newValue)
            );
            require(ok, "EthValidationCaller: inner call failed");
            return abi.decode(ret, (uint256));
        }
        (bool ok2, bytes memory ret2) = address(this).call(
            abi.encodeWithSignature("nestedCall(uint256,address,uint256)", depth - 1, target, newValue)
        );
        require(ok2, "EthValidationCaller: nested hop failed");
        return abi.decode(ret2, (uint256)) + 1;
    }

    function whoAmI()
        external
        view
        returns (address self, address sender, address origin)
    {
        return (address(this), msg.sender, tx.origin);
    }
}
