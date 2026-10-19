// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SlotReader} from "./SlotReader.sol";

/**
 * Large state fixture for the SHA-384 -> SHA-256 migration test: thousands of slots in one
 * contract, written before the consensus node upgrade and compared after it.
 */
contract LargeStorage is SlotReader {
    mapping(uint256 => uint256) public entries;

    /// Writes entries[firstKey .. firstKey + count - 1]; values are derived so calldata stays small.
    function write(uint256 firstKey, uint256 count, uint256 salt) external {
        for (uint256 key = firstKey; key < firstKey + count; key++) {
            entries[key] = valueOf(key, salt);
        }
    }

    /// Distinct, non-zero value for every key; a different salt changes every value.
    function valueOf(uint256 key, uint256 salt) public pure returns (uint256) {
        return (salt << 128) | (key + 1);
    }

    function layout() external pure returns (uint256 entriesSlot) {
        assembly {
            entriesSlot := entries.slot
        }
    }
}
