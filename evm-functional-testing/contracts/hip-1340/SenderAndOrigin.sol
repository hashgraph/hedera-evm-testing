// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SenderAndOrigin {
    function logSenderAndOrigin() external {
        C c = new C();
        c.logSenderAndOrigin();
    }
}

contract C {
    event SenderAndOriginEvent(address indexed msgSender, address indexed txOrigin);
    event CodeLengthAndHashEvent(uint256 indexed codeLength, bytes32 indexed codeHash);
    function logSenderAndOrigin() external {
        emit SenderAndOriginEvent(msg.sender, tx.origin);

        emit CodeLengthAndHashEvent(msg.sender.code.length, msg.sender.codehash);
        emit CodeLengthAndHashEvent(tx.origin.code.length, tx.origin.codehash);
    }
}