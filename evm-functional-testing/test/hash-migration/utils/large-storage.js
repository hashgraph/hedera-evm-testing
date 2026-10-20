// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { getterKey, mappingSlot } = require("./storage");

const ENTRY_COUNT = 3_000;
// ~22k gas per new slot, so 500 entries (~11M gas) fit under Hedera's 15M gas per transaction
const BATCH_SIZE = 500;
const WRITE_GAS = { gasLimit: 14_000_000 };

// Salt of the values written by populate, and of the values verify writes after the upgrade
const ORIGINAL_SALT = 1n;
const UPDATED_SALT = 2n;
// Verify rewrites only the first batch; the rest must keep the original values
const UPDATED_KEYS = { first: 0, count: BATCH_SIZE };

// Getter calls checked on top of the raw slots: both ends, the batch edges and the middle
const SAMPLE_KEYS = [0, 1, 499, 500, 1499, 1500, 2999];

/** Same formula as LargeStorage.valueOf. */
function valueOf(key, salt) {
  return (salt << 128n) | (BigInt(key) + 1n);
}

async function deployLargeStorage() {
  const factory = await ethers.getContractFactory("LargeStorage");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  return contract;
}

/**
 * Writes entries[first .. first + count - 1] in batches of BATCH_SIZE, one transaction each.
 *
 * @param {import("ethers").Contract} contract
 * @param {bigint} salt
 * @param {{ first: number, count: number }} keys
 */
async function writeEntries(contract, salt, { first, count }) {
  for (let key = first; key < first + count; key += BATCH_SIZE) {
    const batch = Math.min(BATCH_SIZE, first + count - key);
    const tx = await contract.write(key, batch, salt, WRITE_GAS);
    await tx.wait();
  }
}

/**
 * Value every sampled getter call must return, keyed by getterKey.
 *
 * @param {boolean} updated whether verify has rewritten UPDATED_KEYS
 * @returns {Record<string, bigint>}
 */
function expectedSample(updated) {
  const isUpdated = (key) =>
    updated &&
    key >= UPDATED_KEYS.first &&
    key < UPDATED_KEYS.first + UPDATED_KEYS.count;

  return Object.fromEntries(
    SAMPLE_KEYS.map((key) => [
      getterKey("entries", [key]),
      valueOf(key, isUpdated(key) ? UPDATED_SALT : ORIGINAL_SALT),
    ]),
  );
}

/**
 * Slot of every entry: keccak256(abi.encode(key, entries slot)).
 *
 * @param {import("ethers").Contract} contract
 * @returns {Promise<bigint[]>}
 */
async function largeSlots(contract) {
  const entriesSlot = await contract.layout();

  return Array.from({ length: ENTRY_COUNT }, (_, key) =>
    mappingSlot("uint256", key, entriesSlot),
  );
}

module.exports = {
  ENTRY_COUNT,
  ORIGINAL_SALT,
  UPDATED_SALT,
  UPDATED_KEYS,
  deployLargeStorage,
  writeEntries,
  expectedSample,
  largeSlots,
};
