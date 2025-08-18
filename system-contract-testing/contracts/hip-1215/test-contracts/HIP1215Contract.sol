// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../impl/HederaScheduleService_HIP1215.sol";
import "../impl/HRC1215ScheduleFacade.sol";

contract HIP1215Contract {

    IHederaScheduleService_HIP1215 public scheduleService;

     receive() external payable {}

    event ResponseCode(int64 responseCode);
    event ScheduleCall(int64 responseCode, address scheduleAddress);

    address internal constant HSS = address(0x16b);
    uint256 internal constant SCHEDULE_GAS_LIMIT = 2_000_000;
    uint256 internal constant HAS_SCHEDULE_CAPACITY_GAS_LIMIT = 10_000;
    int internal variableValue;

    constructor(IHederaScheduleService_HIP1215 _scheduleServiceAddress) {
        scheduleService = _scheduleServiceAddress;
        variableValue = 0;
    }

    function scheduleCallExample(uint256 expiryShift)
    external returns (int64 responseCode, address scheduleAddress) {
        uint256 expirySecond = block.timestamp + expiryShift;
        // callData bytes for calling 'hasScheduleCapacity' on 'expirySecond' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expirySecond + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = scheduleService.scheduleCall(HSS, expirySecond, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function scheduleCallWithSenderExample(address sender, uint256 expiryShift)
    external returns (int64 responseCode, address scheduleAddress) {
        uint256 expirySecond = block.timestamp + expiryShift;
        // callData bytes for calling 'hasScheduleCapacity' on 'expirySecond' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expirySecond + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = scheduleService.scheduleCallWithSender(HSS, sender, expirySecond, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function executeCallOnSenderSignatureExample(address sender, uint256 expiryShift)
    external returns (int64 responseCode, address scheduleAddress) {
        uint256 expirySecond = block.timestamp + expiryShift;
        // callData bytes for calling 'hasScheduleCapacity' on 'expirySecond' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expirySecond + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = scheduleService.executeCallOnSenderSignature(HSS, sender, expirySecond, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function deleteScheduleExample(address scheduleAddress) external returns (int64 responseCode) {
        (responseCode) = scheduleService.deleteSchedule(scheduleAddress);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to delete schedule");
        }
    }

    function deleteScheduleProxyExample(address scheduleAddress) external returns (int64 responseCode) {
        (responseCode) = IHRC1215ScheduleFacade(scheduleAddress).deleteSchedule();
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to delete schedule");
        }
    }

    function hasScheduleCapacityExample(uint256 expiryShift) view external returns (bool hasCapacity) {
        uint256 expirySecond = block.timestamp + expiryShift;
        return scheduleService.hasScheduleCapacity(expirySecond, SCHEDULE_GAS_LIMIT);
    }

    function scheduleCallWithCapacityCheckAndDeleteExample(uint256 expiryShift)
    external returns (int64 responseCode, address scheduleAddress) {
        uint256 expirySecond = block.timestamp + expiryShift;
        bool hasCapacity = scheduleService.hasScheduleCapacity(expirySecond, SCHEDULE_GAS_LIMIT);
        if (hasCapacity) {
            // callData bytes for calling 'hasScheduleCapacity' on 'expirySecond' + 10 minutes time
            bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expirySecond + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
            // schedule call
            (responseCode, scheduleAddress) = scheduleService.scheduleCall(HSS, expirySecond, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
            if (responseCode != HederaResponseCodes.SUCCESS) {
                revert("Failed to schedule");
            } else {
                // delete the scheduled transaction after success schedule
                (responseCode) = scheduleService.deleteSchedule(scheduleAddress);
                if (responseCode != HederaResponseCodes.SUCCESS) {
                    revert("Failed to delete schedule");
                }
            }
        } else {
            revert("Failed to schedule. Has no capacity");
        }
    }

    function scheduleCallCycleExample(uint256 expirySecond, uint256 expiryShift, uint executionIndex)
    external returns (int64 responseCode) {
        if (executionIndex > 0) {
            uint256 nextExecution = expirySecond + expiryShift;
            // check if nextExecution has capacity for schedule call
            bool hasCapacity = scheduleService.hasScheduleCapacity(nextExecution, SCHEDULE_GAS_LIMIT);
            if (hasCapacity) {
                // prepare next execution callData bytes
                bytes memory nextExecutionBytes = abi.encodeWithSelector(this.scheduleCallCycleExample.selector, nextExecution, expiryShift, executionIndex--);
                // schedule call
                address scheduleAddress;
                (responseCode, scheduleAddress) = scheduleService.scheduleCall(address(this), nextExecution, SCHEDULE_GAS_LIMIT, 0, nextExecutionBytes);
            } else {
                revert("Failed to schedule. Has no capacity");
            }
        } else {
            revert("Schedule cycle finished");
        }
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

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) view external returns (bool hasCapacity) {
        hasCapacity = scheduleService.hasScheduleCapacity(expirySecond, gasLimit);
        return hasCapacity;
    }

    function setValue(int _value) external {
        variableValue = _value;
    }

    function getValue() view external returns (int) {
        return variableValue;
    }
}
