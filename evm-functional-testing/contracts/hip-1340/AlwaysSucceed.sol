// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AlwaysSucceed {
    fallback() external payable {
    }
}