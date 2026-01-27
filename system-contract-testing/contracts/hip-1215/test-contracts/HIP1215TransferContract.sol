// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../IHederaScheduleService_HIP1215.sol";
import "../../system-contract-references/IHederaTokenService.sol";
import "../../system-contract-references/HederaResponseCodes.sol";

contract HIP1215TransferContract {

    address internal constant HSS = address(0x16b);
    address internal constant HTS = address(0x167);
    event ScheduleCall(int64 responseCode, address scheduleAddress);

    constructor() payable {}
    receive() external payable {}

    function scheduleCallForTransfer(uint256 expirySecond, uint256 gasLimit, uint64 value, address tokenContract, address receiver) external payable returns (int64 responseCode, address scheduleAddress) {
        bytes memory callData = abi.encodeWithSelector(this.createAssociateAndTransfer.selector, tokenContract, receiver);
        (bool success, bytes memory result) = HSS.call(abi.encodeWithSelector(IHederaScheduleService_HIP1215.scheduleCall.selector, address(this), expirySecond, gasLimit, value, callData));
        (responseCode, scheduleAddress) = success ? abi.decode(result, (int64, address)) : (int64(HederaResponseCodes.UNKNOWN), address(0));
        emit ScheduleCall(responseCode, scheduleAddress);
        return (responseCode, scheduleAddress);
    }

    function createAssociateAndTransfer(address tokenCreateContract, address receiver) external payable returns (int64 responseCode) {

        (bool success, bytes memory result) = tokenCreateContract.call{value: msg.value}(abi.encodeWithSignature("createFungibleTokenPublic(address)", tokenCreateContract));
        address token;
        if (success){
            token = abi.decode(result, (address));
        }
        (success, result) = HTS.call(
            abi.encodeWithSelector(IHederaTokenService.associateToken.selector,
            receiver, token));
        require(success);

        (success, result) = HTS.call(
            abi.encodeWithSelector(IHederaTokenService.transferToken.selector,
            token, address(this), receiver, 10));
        responseCode = success ? abi.decode(result, (int32)) : HederaResponseCodes.UNKNOWN;
        return responseCode;
    }
}   