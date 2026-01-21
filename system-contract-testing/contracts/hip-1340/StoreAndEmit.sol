// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StoreAndEmit {

    uint256 private _value;

    event StoreAndEmitEvent(uint256 indexed value);

    function storeAndEmit(uint256 value) external {
        _value = value;
        emit StoreAndEmitEvent(value);
    }
}