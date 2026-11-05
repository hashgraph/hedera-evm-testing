// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/**
 * Raw storage reads, so a ContractCallQuery can read slots straight from the consensus node.
 * Has no state of its own, so inheriting it does not change a contract's storage layout.
 */
abstract contract SlotReader {
    function readSlots(uint256[] calldata slots) external view returns (bytes32[] memory values) {
        values = new bytes32[](slots.length);
        for (uint256 i = 0; i < slots.length; i++) {
            uint256 slot = slots[i];
            bytes32 value;
            assembly {
                value := sload(slot)
            }
            values[i] = value;
        }
    }
}
