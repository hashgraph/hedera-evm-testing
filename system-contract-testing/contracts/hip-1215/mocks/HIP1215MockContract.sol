// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP1215.sol";
import "../impl/HederaResponseCodes.sol";

contract HIP1215MockContract is IHederaScheduleService_HIP1215 {
    address private mockScheduleAddress;
    int64 private mockResponseCode; 

    constructor() {
        mockScheduleAddress = address(0);
        mockResponseCode = 15;
    }

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress){
        return (mockResponseCode, mockScheduleAddress);
    }

    function scheduleCallWithSender(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress) {
        return (mockResponseCode, mockScheduleAddress);
    }

    function executeCallOnSenderSignature(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress) {
        return (mockResponseCode, mockScheduleAddress);
    }
   
    function deleteSchedule(address scheduleAddress) public view override returns (int64 responseCode) {
        return mockResponseCode;
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) public view override returns (bool hasCapacity) {
        return mockResponseCode == 22;
    }

    function setResponse(bool _isSuccess, int64 _responseCode) public {
        mockScheduleAddress = _isSuccess ? address(123) : address(0);
        mockResponseCode = _responseCode;
    }
}