// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../impl/HederaScheduleService_HIP1215.sol";
import "../impl/HRC1215ScheduleFacade.sol";

contract HIP1215Contract {

    IHederaScheduleService_HIP1215 public scheduleService;

     receive() external payable {}

    event ResponseCode(int64 responseCode);
    event ScheduleCall(int64 responseCode, address scheduleAddress);
    event HasScheduleCapacity(bool hasCapacity);

    int internal variableValue;

    constructor(IHederaScheduleService_HIP1215 _scheduleServiceAddress) {
        scheduleService = _scheduleServiceAddress;
        variableValue = 0;
    }

    function scheduleCallWithFullParam(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (responseCode, scheduleAddress) = scheduleService.scheduleCall(to, expirySecond, gasLimit, value, callData);
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function scheduleCallWithPayerWithFullParam(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (responseCode, scheduleAddress) = scheduleService.scheduleCallWithSender(to, sender, expirySecond, gasLimit, value, callData);
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function executeCallOnSenderSignatureWithFullParam(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (responseCode, scheduleAddress) = scheduleService.executeCallOnSenderSignature(to, sender, expirySecond, gasLimit, value, callData);
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external returns (bool hasCapacity) {
        hasCapacity = scheduleService.hasScheduleCapacity(expirySecond, gasLimit);
        emit HasScheduleCapacity(hasCapacity);
        return hasCapacity;
    }

    // Functions used as scheduled calls
    function setValue(int _value) external {
        variableValue = _value;
    }

    function getValue() view external returns (int) {
        return variableValue;
    }
}
