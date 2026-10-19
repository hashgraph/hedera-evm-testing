// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { callOnConsensusNode } = require("./consensus-node");

const IMMUTABLE_VALUE = 0xbeefn;

/**
 * Hex string of `length` bytes counting up from `first`, e.g. bytesFrom(3, 1) = 0x010203.
 * Gives every fixed-size bytes value distinct, non-zero bytes.
 */
function bytesFrom(length, first) {
  return ethers.hexlify(
    Uint8Array.from({ length }, (_, i) => (first + i) % 256),
  );
}

// Written by populate; must survive the upgrade. Keys are the contract's getter names.
const ORIGINAL_VALUES = {
  boolValue: true,
  uint8Value: 0x12,
  uint16Value: 0x1234,
  uint32Value: 0x12345678,
  uint64Value: 0x1234567890abcdefn,
  uint128Value: 0x1234567890abcdef1234567890abcdefn,
  uint256Value: BigInt("0x" + "1234567890abcdef".repeat(4)),
  int8Value: -7,
  int16Value: -1234,
  int32Value: -123456789,
  int64Value: -1234567890123456789n,
  int128Value: -123456789012345678901234567890n,
  int256Value: -BigInt("0x" + "abcdef".repeat(10)),
  addressValue: "0x" + "a1".repeat(20),
  enumValue: 2,
  bytes1Value: bytesFrom(1, 0x01),
  bytes2Value: bytesFrom(2, 0x01),
  bytes4Value: bytesFrom(4, 0x01),
  bytes8Value: bytesFrom(8, 0x01),
  bytes16Value: bytesFrom(16, 0x01),
  bytes20Value: bytesFrom(20, 0x01),
  bytes31Value: bytesFrom(31, 0x01),
  bytes32Value: bytesFrom(32, 0x01),
  shortString: "short string before",
  longString: "long string written before the upgrade, ".repeat(3),
  shortBytes: "0xdeadbeef",
  longBytes: bytesFrom(100, 0x40),
  packedA: 0x1111111111111111n,
  packedB: 0x2222222222222222n,
  packedC: 0x3333333333333333n,
  packedD: 0x4444444444444444n,
  packedStruct: [0x01020304, -321, true, "0x" + "b2".repeat(20)],
};

// Written by verify after the upgrade; every value differs from ORIGINAL_VALUES so a lost write fails.
const UPDATED_VALUES = {
  boolValue: false,
  uint8Value: 0x21,
  uint16Value: 0x4321,
  uint32Value: 0x87654321,
  uint64Value: 0xfedcba0987654321n,
  uint128Value: 0xfedcba0987654321fedcba0987654321n,
  uint256Value: BigInt("0x" + "fedcba0987654321".repeat(4)),
  int8Value: 7,
  int16Value: 1234,
  int32Value: 123456789,
  int64Value: 1234567890123456789n,
  int128Value: 123456789012345678901234567890n,
  int256Value: BigInt("0x" + "fedcba".repeat(10)),
  addressValue: "0x" + "c3".repeat(20),
  enumValue: 1,
  bytes1Value: bytesFrom(1, 0xa0),
  bytes2Value: bytesFrom(2, 0xa0),
  bytes4Value: bytesFrom(4, 0xa0),
  bytes8Value: bytesFrom(8, 0xa0),
  bytes16Value: bytesFrom(16, 0xa0),
  bytes20Value: bytesFrom(20, 0xa0),
  bytes31Value: bytesFrom(31, 0xa0),
  bytes32Value: bytesFrom(32, 0xa0),
  shortString: "short string after",
  longString: "long string written after the upgrade, ".repeat(4),
  shortBytes: "0xfeedface",
  longBytes: bytesFrom(120, 0x80),
  packedA: 0x5555555555555555n,
  packedB: 0x6666666666666666n,
  packedC: 0x7777777777777777n,
  packedD: 0x8888888888888888n,
  packedStruct: [0x0a0b0c0d, 321, false, "0x" + "d4".repeat(20)],
};

// Never written by the setters, so the same before and after the upgrade
const FIXED_VALUES = {
  CONSTANT_VALUE: 0xc0ffeen,
  IMMUTABLE_VALUE,
};

// Which getters each setter writes, in the setter's argument order
const SETTERS = {
  setUnsigned: [
    "boolValue",
    "uint8Value",
    "uint16Value",
    "uint32Value",
    "uint64Value",
    "uint128Value",
    "uint256Value",
  ],
  setSigned: [
    "int8Value",
    "int16Value",
    "int32Value",
    "int64Value",
    "int128Value",
    "int256Value",
  ],
  setAddressAndEnum: ["addressValue", "enumValue"],
  setFixedBytes: [
    "bytes1Value",
    "bytes2Value",
    "bytes4Value",
    "bytes8Value",
    "bytes16Value",
    "bytes20Value",
    "bytes31Value",
    "bytes32Value",
  ],
  setStringsAndBytes: ["shortString", "longString", "shortBytes", "longBytes"],
  setPacked: ["packedA", "packedB", "packedC", "packedD", "packedStruct"],
};

async function deployStorageMatrix() {
  const factory = await ethers.getContractFactory("StorageMatrix");
  const contract = await factory.deploy(IMMUTABLE_VALUE);
  await contract.waitForDeployment();
  return contract;
}

/**
 * Sends one transaction per setter, writing every storage case.
 *
 * @param {import("ethers").Contract} contract
 * @param {object} values ORIGINAL_VALUES or UPDATED_VALUES
 */
async function writeValues(contract, values) {
  for (const [setter, getters] of Object.entries(SETTERS)) {
    const tx = await contract[setter](...getters.map((name) => values[name]));
    await tx.wait();
  }
}

/**
 * ABI-encoded return data each getter must return for the given values.
 *
 * @param {import("ethers").Interface} iface
 * @param {object} values ORIGINAL_VALUES or UPDATED_VALUES
 * @returns {Record<string, string>}
 */
function expectedGetterResults(iface, values) {
  const all = { ...values, ...FIXED_VALUES };
  return Object.fromEntries(
    Object.entries(all).map(([name, value]) => {
      // A struct getter returns its members as separate values
      const result =
        iface.getFunction(name).outputs.length > 1 ? value : [value];
      return [name, iface.encodeFunctionResult(name, result)];
    }),
  );
}

/**
 * Calls every getter through the relay and on the consensus node.
 *
 * @returns {Promise<{ relay: Record<string, string>, consensusNode: Record<string, string> }>}
 */
async function readGetters(contract, getterNames) {
  const address = await contract.getAddress();
  const relay = {};
  const consensusNode = {};
  for (const name of getterNames) {
    const data = contract.interface.encodeFunctionData(name);
    relay[name] = await ethers.provider.call({ to: address, data });
    consensusNode[name] = await callOnConsensusNode(address, data);
  }
  return { relay, consensusNode };
}

/**
 * Every slot the contract uses: slots 0 to slotCount - 1, plus the data slots of the long
 * string and bytes, which start at keccak256(slot).
 *
 * @param {import("ethers").Contract} contract
 * @param {object} values the values currently written, to size the long string and bytes
 * @returns {Promise<bigint[]>}
 */
async function usedSlots(contract, values) {
  const [slotCount, longStringSlot, longBytesSlot] = await contract.layout();
  const slots = [];
  for (let slot = 0n; slot < slotCount; slot++) slots.push(slot);
  slots.push(
    ...dataSlots(longStringSlot, ethers.toUtf8Bytes(values.longString).length),
  );
  slots.push(
    ...dataSlots(longBytesSlot, ethers.getBytes(values.longBytes).length),
  );
  return slots;
}

function dataSlots(slot, byteLength) {
  const first = BigInt(ethers.keccak256(ethers.toBeHex(slot, 32)));
  const count = Math.ceil(byteLength / 32);
  return Array.from({ length: count }, (_, i) => first + BigInt(i));
}

/**
 * Reads raw slots through the relay (eth_getStorageAt) and on the consensus node (readSlots).
 *
 * @returns {Promise<{ relay: Record<string, string>, consensusNode: Record<string, string> }>}
 */
async function readSlots(contract, slots) {
  const address = await contract.getAddress();
  const relay = {};
  const consensusNode = {};
  const data = contract.interface.encodeFunctionData("readSlots", [slots]);
  const [cnValues] = contract.interface.decodeFunctionResult(
    "readSlots",
    await callOnConsensusNode(address, data),
  );
  for (const [i, slot] of slots.entries()) {
    const key = ethers.toBeHex(slot);
    const relayValue = await ethers.provider.getStorage(address, slot);
    relay[key] = ethers.toBeHex(BigInt(relayValue), 32);
    consensusNode[key] = cnValues[i];
  }
  return { relay, consensusNode };
}

/**
 * Lists every entry that differs from `expected`, naming the entry and where it was read.
 *
 * @param {string} kind e.g. "getter" or "slot"
 * @param {Record<string, string>} expected
 * @param {Record<string, Record<string, string>>} actualBySource e.g. { relay: {...}, consensusNode: {...} }
 * @returns {string[]}
 */
function findMismatches(kind, expected, actualBySource) {
  const mismatches = [];
  for (const [source, actual] of Object.entries(actualBySource)) {
    for (const [name, value] of Object.entries(expected)) {
      if (actual[name] !== value) {
        mismatches.push(
          `${kind} ${name} via ${source}: expected ${value}, got ${actual[name]}`,
        );
      }
    }
  }
  return mismatches;
}

/**
 * Writes transient storage in one transaction (which must read its own value back), then checks
 * that a later call reads zero through the relay and on the consensus node.
 *
 * @param {import("ethers").Contract} contract
 */
async function expectTransientNotKept(contract) {
  const value = 0x77n;
  const receipt = await (await contract.writeAndReadTransient(value)).wait();
  const [readInSameTx] = receipt.logs
    .map((log) => contract.interface.parseLog(log))
    .find((event) => event?.name === "TransientReadBack").args;
  expect(readInSameTx, "transient value read in the same transaction").to.equal(
    value,
  );

  const { relay, consensusNode } = await readGetters(contract, [
    "readTransient",
  ]);
  const zero = contract.interface.encodeFunctionResult("readTransient", [0]);
  expect(
    relay.readTransient,
    "transient value via relay in a later call",
  ).to.equal(zero);
  expect(
    consensusNode.readTransient,
    "transient value via consensus node in a later call",
  ).to.equal(zero);
}

module.exports = {
  ORIGINAL_VALUES,
  UPDATED_VALUES,
  deployStorageMatrix,
  writeValues,
  expectedGetterResults,
  readGetters,
  usedSlots,
  readSlots,
  findMismatches,
  expectTransientNotKept,
};
