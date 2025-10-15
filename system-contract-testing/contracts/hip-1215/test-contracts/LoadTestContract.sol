// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP1215.sol";
import "../impl/HederaResponseCodes.sol";

contract LoadTestContract {

    address internal constant HSS = address(0x16b);

    receive() external payable {}

    uint64 public scheduleCounter;

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
    external payable returns (int64 responseCode, address scheduleAddress) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(IHederaScheduleService_HIP1215.scheduleCall.selector, to, expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
        // signSchedule or authorizeSchedule is not required because all signatures are present in this call
        return (responseCode, scheduleAddress);
    }

    // _nonce is used to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' for load test
    function payableIncrementCall(uint _nonce) external payable returns (uint64) {
        scheduleCounter += 1;
        return scheduleCounter;
    }

    function getScheduleCounter() view external returns (uint64) {
        return scheduleCounter;
    }

    function cryptoTransfer(address payable _receiverAddress, uint _amount) payable external {
        require(msg.value >= _amount, "Insufficient amount");
        _receiverAddress.transfer(_amount);
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}
