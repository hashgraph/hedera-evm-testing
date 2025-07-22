// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../contracts/impl/HederaScheduleService_HIP1215.sol";
import "../contracts/impl/HRC1215ScheduleFacade.sol";

contract HIP1215Contract is HederaScheduleService_HIP1215 {

    uint256 internal constant SCHEDULE_GAS_LIMIT = 2_000_000;
    uint256 internal constant HAS_SCHEDULE_CAPACITY_GAS_LIMIT = 10_000;

    function scheduleCallExample(uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = scheduleCall(HSS, expiry, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function scheduleCallWithSenderExample(address sender, uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = scheduleCallWithSender(HSS, sender, expiry, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function executeCallOnSenderSignatureExample(address sender, uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
        // schedule call
        (responseCode, scheduleAddress) = executeCallOnSenderSignature(HSS, sender, expiry, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function deleteScheduleProxyExample(address scheduleAddress) external returns (int64 responseCode) {
        responseCode = IHRC1215ScheduleFacade(scheduleAddress).deleteSchedule();
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to delete schedule");
        }
    }

    function scheduleCallWithCapacityCheckAndDeleteExample(uint256 expiry)
    external returns (int64 responseCode) {
        bool hasCapacity = hasScheduleCapacity(expiry, SCHEDULE_GAS_LIMIT);
        if (hasCapacity) {
            // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
            bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, HAS_SCHEDULE_CAPACITY_GAS_LIMIT);
            // schedule call
            address scheduleAddress;
            (responseCode, scheduleAddress) = scheduleCall(HSS, expiry, SCHEDULE_GAS_LIMIT, 0, hasScheduleCapacityBytes);
            if (responseCode != HederaResponseCodes.SUCCESS) {
                revert("Failed to schedule");
            } else {
                // delete the scheduled transaction after success schedule
                responseCode = deleteSchedule(scheduleAddress);
                if (responseCode != HederaResponseCodes.SUCCESS) {
                    revert("Failed to delete schedule");
                }
            }
        } else {
            revert("Failed to schedule. Has no capacity");
        }
    }

    function scheduleCallCycleExample(uint256 expiry, uint256 expiryShift, uint executionIndex)
    external returns (int64 responseCode) {
        if (executionIndex > 0) {
            uint256 nextExecution = expiry + expiryShift;
            // check if nextExecution has capacity for schedule call
            bool hasCapacity = hasScheduleCapacity(nextExecution, SCHEDULE_GAS_LIMIT);
            if (hasCapacity) {
                // prepare next execution callData bytes
                bytes memory nextExecutionBytes = abi.encodeWithSelector(this.scheduleCallCycleExample.selector, nextExecution, expiryShift, executionIndex--);
                // schedule call
                address scheduleAddress;
                (responseCode, scheduleAddress) = scheduleCall(address(this), nextExecution, SCHEDULE_GAS_LIMIT, 0, nextExecutionBytes);
            } else {
                revert("Failed to schedule. Has no capacity");
            }
        } else {
            revert("Schedule cycle finished");
        }
    }
}
