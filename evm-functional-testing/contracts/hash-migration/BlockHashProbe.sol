// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/**
 * Block hash fixture for the SHA-384 -> SHA-256 migration test: records what BLOCKHASH returns
 * inside a transaction, so the values come from the consensus node, not the mirror node.
 */
contract BlockHashProbe {
    event Probed(
        uint256 number,
        uint256 timestamp,
        uint256 prevrandao,
        uint256[] offsets,
        bytes32[] hashes,
        bytes32 currentHash,
        bytes32 nextHash
    );
    event HashesRead(uint256 number, uint256[] blockNumbers, bytes32[] hashes);

    /// Emits the hash of earlier blocks (each offset = how many blocks back), and of this and the next block (always zero).
    function probe(uint256[] calldata offsets) external {
        bytes32[] memory hashes = new bytes32[](offsets.length);
        for (uint256 i = 0; i < offsets.length; i++) {
            hashes[i] = blockhash(block.number - offsets[i]);
        }
        emit Probed(
            block.number,
            block.timestamp,
            block.prevrandao,
            offsets,
            hashes,
            blockhash(block.number),
            blockhash(block.number + 1)
        );
    }

    /// blockhash(n) for each given block number, read in a new transaction.
    function readHashes(uint256[] calldata blockNumbers) external {
        bytes32[] memory hashes = new bytes32[](blockNumbers.length);
        for (uint256 i = 0; i < blockNumbers.length; i++) {
            hashes[i] = blockhash(blockNumbers[i]);
        }
        emit HashesRead(block.number, blockNumbers, hashes);
    }
}
