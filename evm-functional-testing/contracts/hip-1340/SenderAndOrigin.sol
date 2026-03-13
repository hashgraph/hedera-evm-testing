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
    event CodeDetailsEvent(
        uint256 indexed senderCodeLength,
        bytes32 indexed senderCodeHash,
        uint256 indexed originCodeLength,
        bytes32 originCodeHash
    );
    function logSenderAndOrigin() external {
        emit SenderAndOriginEvent(msg.sender, tx.origin);
        emit CodeDetailsEvent(
            msg.sender.code.length,
            msg.sender.codehash,
            tx.origin.code.length,
            tx.origin.codehash
        );
    }
}