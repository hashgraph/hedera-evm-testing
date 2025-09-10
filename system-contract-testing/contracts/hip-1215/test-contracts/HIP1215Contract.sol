// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP1215.sol";
import "../IHederaScheduleService_HIP755.sol";
import "../IHRC1215ScheduleFacade.sol";
import "../impl/HederaResponseCodes.sol";

contract HIP1215Contract {

    address internal constant HSS = address(0x16b);
    IHederaScheduleService_HIP1215 public scheduleService;

    receive() external payable {}

    event ResponseCode(int64 responseCode);
    event ScheduleCall(int64 responseCode, address scheduleAddress);
    event HasScheduleCapacity(bool hasCapacity);

    string[] public tests;

    constructor(IHederaScheduleService_HIP1215 _scheduleServiceAddress) {
        scheduleService = _scheduleServiceAddress;
    }

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = address(scheduleService).delegatecall(abi.encodeWithSelector(IHederaScheduleService_HIP1215.scheduleCall.selector, to, expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function scheduleCallWithPayer(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = address(scheduleService).delegatecall(abi.encodeWithSelector(IHederaScheduleService_HIP1215.scheduleCallWithSender.selector, to, sender, expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function executeCallOnSenderSignature(address to, address sender, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = address(scheduleService).delegatecall(abi.encodeWithSelector(IHederaScheduleService_HIP1215.executeCallOnSenderSignature.selector, to, sender, expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
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

    function deleteScheduleProxy(address scheduleAddress) external returns (int64 responseCode) {
        responseCode = IHRC1215ScheduleFacade(scheduleAddress).deleteSchedule();
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function signSchedule(address scheduleAddress) external returns (int64 responseCode) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(IHederaScheduleService_HIP755.authorizeSchedule.selector, scheduleAddress));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // functions used as scheduled calls
    function addTest(string memory _value) external {
        tests.push(_value);
    }

    function getTests() view external returns (string[] memory) {
        return tests;
    }
}
