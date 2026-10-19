// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SlotReader} from "./SlotReader.sol";

/**
 * Value storage fixture for the SHA-384 -> SHA-256 migration test: one variable per value case,
 * written before the consensus node upgrade and compared after it.
 */
contract ValueStorage is SlotReader {
    enum Color {
        Red,
        Green,
        Blue
    }

    // 4 + 2 + 1 + 20 = 27 bytes, so the whole struct packs into one slot
    struct PackedStruct {
        uint32 a;
        int16 b;
        bool c;
        address d;
    }

    // Live in the code, not in storage
    uint256 public constant CONSTANT_VALUE = 0xC0FFEE;
    uint256 public immutable IMMUTABLE_VALUE;

    // Unsigned value types; bool to uint128 share one slot (1 + 1 + 2 + 4 + 8 + 16 = 32 bytes)
    bool public boolValue;
    uint8 public uint8Value;
    uint16 public uint16Value;
    uint32 public uint32Value;
    uint64 public uint64Value;
    uint128 public uint128Value;
    uint256 public uint256Value;

    // Signed value types
    int8 public int8Value;
    int16 public int16Value;
    int32 public int32Value;
    int64 public int64Value;
    int128 public int128Value;
    int256 public int256Value;

    // Address, enum and fixed-size bytes (representative sizes, not all 32)
    address public addressValue;
    Color public enumValue;
    bytes1 public bytes1Value;
    bytes2 public bytes2Value;
    bytes4 public bytes4Value;
    bytes8 public bytes8Value;
    bytes16 public bytes16Value;
    bytes20 public bytes20Value;
    bytes31 public bytes31Value;
    bytes32 public bytes32Value;

    // Under 32 bytes is stored inline; 32 bytes or more spans keccak256(slot) onwards
    string public shortString;
    string public longString;
    bytes public shortBytes;
    bytes public longBytes;

    // Small variables sharing one slot, plus a packed struct
    uint64 public packedA;
    uint64 public packedB;
    uint64 public packedC;
    uint64 public packedD;
    PackedStruct public packedStruct;

    // Never persisted: reads zero in any later transaction
    uint256 transient transientValue;

    // Marks the end of the layout; its slot number is the number of slots used above
    uint256 private endOfLayout;

    event TransientReadBack(uint256 value);

    constructor(uint256 immutableValue) {
        IMMUTABLE_VALUE = immutableValue;
    }

    function setUnsigned(
        bool b,
        uint8 u8,
        uint16 u16,
        uint32 u32,
        uint64 u64,
        uint128 u128,
        uint256 u256
    ) external {
        boolValue = b;
        uint8Value = u8;
        uint16Value = u16;
        uint32Value = u32;
        uint64Value = u64;
        uint128Value = u128;
        uint256Value = u256;
    }

    function setSigned(int8 i8, int16 i16, int32 i32, int64 i64, int128 i128, int256 i256) external {
        int8Value = i8;
        int16Value = i16;
        int32Value = i32;
        int64Value = i64;
        int128Value = i128;
        int256Value = i256;
    }

    function setAddressAndEnum(address a, Color e) external {
        addressValue = a;
        enumValue = e;
    }

    function setFixedBytes(
        bytes1 b1,
        bytes2 b2,
        bytes4 b4,
        bytes8 b8,
        bytes16 b16,
        bytes20 b20,
        bytes31 b31,
        bytes32 b32
    ) external {
        bytes1Value = b1;
        bytes2Value = b2;
        bytes4Value = b4;
        bytes8Value = b8;
        bytes16Value = b16;
        bytes20Value = b20;
        bytes31Value = b31;
        bytes32Value = b32;
    }

    function setStringsAndBytes(
        string calldata shortS,
        string calldata longS,
        bytes calldata shortB,
        bytes calldata longB
    ) external {
        shortString = shortS;
        longString = longS;
        shortBytes = shortB;
        longBytes = longB;
    }

    function setPacked(uint64 a, uint64 b, uint64 c, uint64 d, PackedStruct calldata s) external {
        packedA = a;
        packedB = b;
        packedC = c;
        packedD = d;
        packedStruct = s;
    }

    /// Writes transient storage and emits the value read back in the same transaction.
    function writeAndReadTransient(uint256 value) external {
        transientValue = value;
        emit TransientReadBack(transientValue);
    }

    function readTransient() external view returns (uint256) {
        return transientValue;
    }

    /// Slots a test must read: every slot below `endOfLayout`, plus the data slots of the long values.
    function layout() external pure returns (uint256 slotCount, uint256 longStringSlot, uint256 longBytesSlot) {
        assembly {
            slotCount := endOfLayout.slot
            longStringSlot := longString.slot
            longBytesSlot := longBytes.slot
        }
    }
}
