// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CodeSizeAndCopy {
    event ThisSenderAndOriginEvent(address indexed thisAddress, address indexed msgSender, address indexed txOrigin);
    event CodeSizeAndCopyEvent(uint256 indexed codeLength, bytes32 indexed codeStart);

    function logCodeSizeAndCopy() external {
        emit ThisSenderAndOriginEvent(address(this), msg.sender, tx.origin);
        emit CodeSizeAndCopyEvent(msg.sender.code.length, msg.sender.codehash);

        uint256 size;
        bytes32 codeStart;
        assembly {
            size := codesize()
            codecopy(0x80, 0, 32)
            codeStart := mload(0x80)
        }
        emit CodeSizeAndCopyEvent(size, codeStart);
    }
}
