// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.4.9 <0.9.0;

import "./HederaResponseCodes.sol";
import "../IHRC755ScheduleFacade_HIP1215.sol";

abstract contract IHRC755ScheduleFacade_HIP1215 {

    /// Delete the targeted schedule transaction.
    /// @return responseCode The response code for the status of the request. SUCCESS is 22.
    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode) {
        (bool success, bytes memory result) = scheduleAddress.call(
            abi.encodeWithSelector(IHRC755ScheduleFacade_HIP1215.deleteSchedule.selector));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
    }

}