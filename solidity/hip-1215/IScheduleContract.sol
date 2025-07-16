// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface IHederaScheduleService_HIP1215 {

    function scheduleCall(address to, uint256 expiry, uint256 gasLimit, uint64 value, bytes memory callData) returns (int64 responseCode, address scheduleAddress);

    function scheduleCallWithSender(address to, address sender, uint256 expiry, uint256 gasLimit, uint64 value, bytes memory callData) returns (int64 responseCode, address scheduleAddress);

    function executeCallOnSenderSignature(address to, address sender, uint256 expiry, uint256 gasLimit, uint64 value, bytes memory callData) returns (int64 responseCode, address scheduleAddress);

    function scheduleDeleteTransaction(address) returns (int64 responseCode);

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) view returns (bool hasCapacity);

}