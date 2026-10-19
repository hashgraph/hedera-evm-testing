// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { callOnConsensusNode } = require("./consensus-node");

// Helpers shared by the storage contracts (ValueStorage, ...): reading getters and raw slots
// through the relay and on the consensus node, and comparing them.

/**
 * ABI-encoded return data each getter must return for the given values.
 *
 * @param {import("ethers").Interface} iface
 * @param {Record<string, unknown>} values keyed by getter name
 * @returns {Record<string, string>}
 */
function expectedGetterResults(iface, values) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
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
 * Data slots of a long string or bytes value stored at `slot`: they start at keccak256(slot).
 *
 * @param {bigint} slot
 * @param {number} byteLength
 * @returns {bigint[]}
 */
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

module.exports = {
  expectedGetterResults,
  readGetters,
  dataSlots,
  readSlots,
  findMismatches,
};
