// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract AccessListCallerContract {

    uint public local1 = 3; // storage slot 0
    uint public local2 = 4; // storage slot 1
    uint public res1 = 7; // storage slot 2

    address internal constant HSS = address(0x16b);

    function execute() public returns (uint256 response) {
        res1 = local1 + local2;
        return res1;
    }

    function call(address target) public returns (uint256 response) {
        (bool success, bytes memory result) = target.call(abi.encodeWithSignature("execute()"));
        if (success) {
            response = abi.decode(result, (uint256));
        } else {
            revert();
        }
    }

    function callHssPrecompile(uint256 expirySecond, uint256 gasLimit) public returns (bool response) {
        (bool success, bytes memory result) = HSS.call(abi.encodeWithSignature("hasScheduleCapacity(uint256,uint256)", expirySecond, gasLimit));
        if (success) {
            response = abi.decode(result, (bool));
        } else {
            revert();
        }
    }

    function callDelegation() public returns (uint256 response) {
        (bool success, bytes memory result) = msg.sender.call(abi.encodeWithSignature("executeDelegation(uint256,uint256)", 12, 13));
        if (success) {
            response = abi.decode(result, (uint256));
        } else {
            revert();
        }
    }
}
