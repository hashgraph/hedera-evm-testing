// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { callOnConsensusNode } = require("./consensus-node");

// Helpers shared by the storage contracts (ValueStorage, CollectionStorage, ...): reading getters and raw slots
// through the relay and on the consensus node, and comparing them.

/**
 * Key naming one getter call, e.g. "uint8Value" or "nestedMapping(0xa1…,1)" for a getter with
 * arguments. Used as the snapshot key and in failure messages.
 *
 * @param {string} name
 * @param {unknown[]} args
 * @returns {string}
 */
function getterKey(name, args = []) {
  return args.length ? `${name}(${args.join(",")})` : name;
}

/** Splits a getterKey back into the getter name and its arguments. */
function parseGetterKey(key) {
  const [, name, args] = key.match(/^(\w+)(?:\((.*)\))?$/);
  return { name, args: args ? args.split(",") : [] };
}

/**
 * ABI-encoded return data each getter call must return for the given values.
 *
 * @param {import("ethers").Interface} iface
 * @param {Record<string, unknown>} values keyed by getterKey
 * @returns {Record<string, string>}
 */
function expectedGetterResults(iface, values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const { name } = parseGetterKey(key);
      // A struct getter returns its members as separate values
      const result =
        iface.getFunction(name).outputs.length > 1 ? value : [value];
      return [key, iface.encodeFunctionResult(name, result)];
    }),
  );
}

/**
 * Makes every getter call through the relay and on the consensus node.
 *
 * @param {import("ethers").Contract} contract
 * @param {string[]} keys getterKeys
 * @returns {Promise<{ relay: Record<string, string>, consensusNode: Record<string, string> }>}
 */
async function readGetters(contract, keys) {
  const address = await contract.getAddress();
  const relay = {};
  const consensusNode = {};
  for (const key of keys) {
    const { name, args } = parseGetterKey(key);
    const data = contract.interface.encodeFunctionData(name, args);
    relay[key] = await ethers.provider.call({ to: address, data });
    consensusNode[key] = await callOnConsensusNode(address, data);
  }
  return { relay, consensusNode };
}

/**
 * First slot of a dynamic array's elements (or a long string's data): keccak256(base slot).
 *
 * @param {bigint} slot
 * @returns {bigint}
 */
function arrayDataSlot(slot) {
  return BigInt(ethers.keccak256(ethers.toBeHex(slot, 32)));
}

/**
 * Slot of a mapping entry: keccak256(abi.encode(key, base slot)).
 *
 * @param {string} keyType Solidity type of the key, e.g. "uint256" or "address"
 * @param {unknown} key
 * @param {bigint} slot base slot of the mapping
 * @returns {bigint}
 */
function mappingSlot(keyType, key, slot) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [keyType, "uint256"],
    [key, slot],
  );
  return BigInt(ethers.keccak256(encoded));
}

/**
 * Data slots of a long string or bytes value stored at `slot`.
 *
 * @param {bigint} slot
 * @param {number} byteLength
 * @returns {bigint[]}
 */
function dataSlots(slot, byteLength) {
  const first = arrayDataSlot(slot);
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

module.exports = {
  getterKey,
  expectedGetterResults,
  readGetters,
  arrayDataSlot,
  mappingSlot,
  dataSlots,
  readSlots,
  findMismatches,
};
