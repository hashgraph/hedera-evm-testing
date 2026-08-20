// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

/**
 * Storage and execution-context probe used as the callee for CALL/DELEGATECALL/STATICCALL tests.
 * Storage layout (slots 0-3) is mirrored by EthValidationCaller so delegatecall storage writes are observable.
 */
contract SimpleStorage {
    uint256 public value; // storage slot 0
    address public lastSender; // storage slot 1
    uint256 public lastValue; // storage slot 2
    address public lastOrigin; // storage slot 3

    event Called(address sender, address origin, uint256 value, uint256 arg);

    function setValue(uint256 newValue) public payable returns (uint256) {
        value = newValue;
        lastSender = msg.sender;
        lastOrigin = tx.origin;
        lastValue = msg.value;
        emit Called(msg.sender, tx.origin, msg.value, newValue);
        return newValue;
    }

    function getValue() external view returns (uint256) {
        return value;
    }

    function readContext()
        external
        view
        returns (address sender, address origin, uint256 storedValue)
    {
        return (lastSender, lastOrigin, value);
    }

    function getCodeSizeOf(address target) external view returns (uint256 size) {
        assembly {
            size := extcodesize(target)
        }
    }

    function echoBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function alwaysRevert() external pure {
        revert("SimpleStorage: forced revert");
    }
}
