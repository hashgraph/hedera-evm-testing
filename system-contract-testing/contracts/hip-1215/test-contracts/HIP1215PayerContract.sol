// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP755.sol";
import "../../services/HederaResponseCodes.sol";

contract HIP1215PayerContract {

    address internal constant HSS = address(0x16b);

    receive() external payable {}

    event ResponseCode(int64 responseCode);

    function authorizeSchedule(address schedule) external returns (int64 responseCode) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(IHederaScheduleService_HIP755.authorizeSchedule.selector, schedule));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }
}
