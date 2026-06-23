// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract HbarTransferTarget {
    event HbarReceived(address indexed sender, uint256 amount);

    receive() external payable {
        emit HbarReceived(msg.sender, msg.value);
    }
}
