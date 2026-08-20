// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

/**
 * Bounded ping-pong reentrancy between ReentrancyVictim and ReentrancyAttacker.
 * attack(victim, depth) yields pingCount == pongCount == depth for depth >= 1.
 * guarded() holds a bool lock, so any reentry reverts and rolls the whole call back.
 */
contract ReentrancyVictim {
    uint256 public pingCount;
    uint256 public guardedCount;
    bool private locked;

    function ping(uint256 maxDepth) external {
        pingCount += 1;
        if (maxDepth > 0) {
            (bool ok, ) = msg.sender.call(
                abi.encodeWithSignature("pong(uint256)", maxDepth - 1)
            );
            require(ok, "ReentrancyVictim: pong failed");
        }
    }

    function guarded() external {
        require(!locked, "ReentrancyVictim: reentrancy blocked");
        locked = true;
        guardedCount += 1;
        (bool ok, ) = msg.sender.call(abi.encodeWithSignature("pongGuarded()"));
        require(ok, "ReentrancyVictim: guarded pong failed");
        locked = false;
    }
}

contract ReentrancyAttacker {
    ReentrancyVictim public victim;
    uint256 public pongCount;

    function attack(address victimAddr, uint256 depth) external {
        victim = ReentrancyVictim(victimAddr);
        victim.ping(depth);
    }

    function pong(uint256 remaining) external {
        pongCount += 1;
        if (remaining > 0) {
            victim.ping(remaining);
        }
    }

    function attackGuarded(address victimAddr) external {
        victim = ReentrancyVictim(victimAddr);
        victim.guarded();
    }

    function pongGuarded() external {
        // typed call: the guard's revert bubbles up and fails the whole attackGuarded tx
        victim.guarded();
    }
}
