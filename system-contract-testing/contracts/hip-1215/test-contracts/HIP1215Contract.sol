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

    string[] public tests;

    constructor(IHederaScheduleService_HIP1215 _scheduleServiceAddress) {
        scheduleService = _scheduleServiceAddress;
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

    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode) {
        responseCode = scheduleService.deleteSchedule(scheduleAddress);
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function scheduleCallWithDelegateCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = address(scheduleService).delegatecall(abi.encodeWithSelector(IHederaScheduleService_HIP1215.scheduleCall.selector, to, expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function deleteScheduleProxy(address scheduleAddress) external returns (int64 responseCode) {
        responseCode = IHRC1215ScheduleFacade(scheduleAddress).deleteSchedule();
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // Functions used as scheduled calls
    function addTest(string memory _value) external {
        tests.push(_value);
    }

    function getTests() view external returns (string[] memory) {
        return tests;
    }
}
