// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "../contracts/impl/HederaScheduleService_HIP1215.sol";
import "../contracts/impl/HRC755ScheduleFacade_HIP1215.sol";

contract HIP1215Contract is HederaScheduleService_HIP1215 {

    function scheduleCallExample(uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, 100_000);
        // schedule call
        (responseCode, scheduleAddress) = scheduleCall(HSS, expiry, 2_000_000, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function scheduleCallWithSenderExample(address sender, uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, 100_000);
        // schedule call
        (responseCode, scheduleAddress) = scheduleCallWithSender(HSS, sender, expiry, 2_000_000, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function executeCallOnSenderSignatureExample(address sender, uint256 expiry)
    external returns (int64 responseCode, address scheduleAddress) {
        // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
        bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, 100_000);
        // schedule call
        (responseCode, scheduleAddress) = executeCallOnSenderSignature(HSS, sender, expiry, 2_000_000, 0, hasScheduleCapacityBytes);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to schedule");
        }
    }

    function deleteScheduleProxyExample(address scheduleAddress) external returns (int64 responseCode) {
        responseCode = IHRC755ScheduleFacade_HIP1215(scheduleAddress).deleteSchedule();
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Failed to delete schedule");
        }
    }

    function scheduleCallWithCapacityCheckAndDeleteExample(uint256 expiry)
    external returns (int64 responseCode) {
        bool hasCapacity = hasScheduleCapacity(expiry, 2_000_000);
        if (hasCapacity) {
            // callData bytes for calling 'hasScheduleCapacity' on 'expiry' + 10 minutes time
            bytes memory hasScheduleCapacityBytes = abi.encodeWithSelector(IHederaScheduleService_HIP1215.hasScheduleCapacity.selector, expiry + 600, 100_000);
            // schedule call
            address scheduleAddress;
            (responseCode, scheduleAddress) = scheduleCall(HSS, expiry, 2_000_000, 0, hasScheduleCapacityBytes);
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

}
