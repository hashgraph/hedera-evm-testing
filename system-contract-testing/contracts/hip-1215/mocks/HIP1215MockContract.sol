// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP1215.sol";
import "../impl/HederaResponseCodes.sol";

contract HIP1215MockContract is IHederaScheduleService_HIP1215 {
    bool private isSuccess;

    constructor() {
        isSuccess = false;
    }

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress){
        if (isSuccess) {
            return (HederaResponseCodes.SUCCESS, address(123));
        } else {
            return (18, address(0));
        }
    }

    function scheduleCallWithSender(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress) {
       if (isSuccess) {
            return (HederaResponseCodes.SUCCESS, address(123));
        } else {
            return (18, address(0));
        }
    }

   
    function executeCallOnSenderSignature(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData) public view override returns (int64 responseCode, address scheduleAddress) {
        if (isSuccess) {
            return (HederaResponseCodes.SUCCESS, address(123));
        } else {
            return (18, address(0));
        }
    }
   
    function deleteSchedule(address scheduleAddress) public view override returns (int64 responseCode) {
        if (isSuccess) {
            return (HederaResponseCodes.SUCCESS);
        } else {
            return (18);
        }
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) public view override returns (bool hasCapacity) {
        return isSuccess;
    }

    function setResponse(bool _isSuccess) public {
        isSuccess = _isSuccess;
    }
}