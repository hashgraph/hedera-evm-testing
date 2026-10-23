// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { MirrorNode } = require("../../../utils/mirror-node");
const { expectHash32 } = require("./hashes");
const {
  GAS_LIMIT_5_000_000,
  GAS_LIMIT_1_000_000,
} = require("../../../utils/constants");
const { waitForReceipt, readMirrorNode } = require("./network");

// k in blockhash(block.number - k): recent blocks, both edges of the 256-block window, and one past it
const OFFSETS = [1, 2, 10, 255, 256, 257];
const WINDOW = 256;
const PROBE_COUNT = 5;
const BLOCKS_BETWEEN_PROBES = 20;
// The first probe needs 257 earlier blocks for every offset to point at a real block
const FIRST_PROBE_BLOCK = 300;

async function deployBlockHashProbe() {
  const factory = await ethers.getContractFactory("BlockHashProbe");
  const contract = await factory.deploy(GAS_LIMIT_5_000_000);
  await contract.waitForDeployment();

  return contract;
}

function eventArgs(contract, receipt, name) {
  return receipt.logs
    .map((log) => contract.interface.parseLog(log))
    .find((event) => event?.name === name).args;
}

/**
 * Runs one probe transaction and returns what BLOCKHASH returned inside it.
 *
 * @returns {Promise<{ number: number, timestamp: bigint, prevrandao: bigint,
 *   hashes: Record<number, string>, currentHash: string, nextHash: string }>}
 */
async function runProbe(contract) {
  const tx = await contract.probe(OFFSETS, GAS_LIMIT_1_000_000);
  const receipt = await waitForReceipt(tx);
  const args = eventArgs(contract, receipt, "Probed");
  const number = Number(args.number);

  return {
    number,
    timestamp: args.timestamp,
    prevrandao: args.prevrandao,
    hashes: Object.fromEntries(
      args.offsets.map((k, i) => [number - Number(k), args.hashes[i]]),
    ),
    currentHash: args.currentHash,
    nextHash: args.nextHash,
  };
}

/**
 * Hash of a block as the relay and the mirror node report it. The mirror node stores the full
 * 48-byte record file hash; BLOCKHASH and the relay use its first 32 bytes.
 *
 * @param {number} blockNumber
 * @returns {Promise<{ relay: string, mirrorNode: string }>}
 */
async function reportedHashes(blockNumber) {
  const relayBlock = await ethers.provider.getBlock(blockNumber);
  const mirrorNodeBlock = await readMirrorNode(() =>
    new MirrorNode().getBlock(blockNumber),
  );

  return {
    relay: relayBlock.hash,
    mirrorNode: mirrorNodeBlock.hash.slice(0, 66),
  };
}

/**
 * Calls blockhash(n) for each block number in a new transaction.
 *
 * @returns {Promise<{ number: number, hashes: Record<number, string> }>}
 */
async function readHashesInTransaction(contract, blockNumbers) {
  const tx = await contract.readHashes(blockNumbers, GAS_LIMIT_1_000_000);
  const receipt = await waitForReceipt(tx);
  const args = eventArgs(contract, receipt, "HashesRead");

  return {
    number: Number(args.number),
    hashes: Object.fromEntries(
      args.blockNumbers.map((n, i) => [Number(n), args.hashes[i]]),
    ),
  };
}

/**
 * Compares a BLOCKHASH result with the hash the relay and the mirror node report for that block.
 * Also fails if either reported hash is not 32 bytes.
 *
 * @returns {Promise<string | null>} a mismatch description, or null if all three agree
 */
async function compareWithReported(blockNumber, hash, context) {
  const reported = await reportedHashes(blockNumber);
  expectHash32(reported.relay, `relay hash of block ${blockNumber}`);
  expectHash32(reported.mirrorNode, `mirror node hash of block ${blockNumber}`);

  if (
    hash !== ethers.ZeroHash &&
    hash === reported.relay &&
    hash === reported.mirrorNode
  ) {
    return null;
  }

  return `blockhash(${blockNumber}) ${context} = ${hash}, relay = ${reported.relay}, mirror node = ${reported.mirrorNode}`;
}

/**
 * Checks one probe: the current and next block read zero, blocks outside the 256-block window
 * read zero, and every block inside it matches the relay and the mirror node.
 *
 * @returns {Promise<{ mismatches: string[], blocks: Record<number, string> }>}
 */
async function checkProbe(probe) {
  const at = `in block ${probe.number}`;
  const mismatches = [];
  const blocks = {};

  if (probe.currentHash !== ethers.ZeroHash) {
    mismatches.push(`blockhash(block.number) ${at} is not zero`);
  }

  if (probe.nextHash !== ethers.ZeroHash) {
    mismatches.push(`blockhash(block.number + 1) ${at} is not zero`);
  }

  for (const [n, hash] of Object.entries(probe.hashes)) {
    const blockNumber = Number(n);

    if (blockNumber < probe.number - WINDOW) {
      if (hash !== ethers.ZeroHash) {
        mismatches.push(
          `blockhash(${n}) ${at} is outside the window but not zero`,
        );
      }
      continue;
    }

    const mismatch = await compareWithReported(blockNumber, hash, at);

    if (mismatch) {
      mismatches.push(mismatch);
    }

    blocks[blockNumber] = hash;
  }

  return { mismatches, blocks };
}

/**
 * First block made by a different consensus node version than `afterBlock`, found through the
 * mirror node's hapi_version of each block.
 *
 * @param {number} afterBlock a block made before the upgrade
 * @returns {Promise<{ number: number, oldVersion: string, newVersion: string }>}
 */
async function findUpgradeBlock(afterBlock) {
  const mirrorNode = new MirrorNode();
  const before = await readMirrorNode(() => mirrorNode.getBlock(afterBlock));
  const oldVersion = before.hapi_version;

  for (let n = afterBlock + 1; ; n++) {
    const block = await readMirrorNode(() => mirrorNode.getBlock(n));

    if (block.number === undefined) {
      throw new Error(
        `No block after ${afterBlock} was made by a version other than ${oldVersion}: was the consensus node upgraded?`,
      );
    }

    if (block.hapi_version !== oldVersion) {
      return { number: n, oldVersion, newVersion: block.hapi_version };
    }
  }
}

/**
 * Checks that each block's parent hash equals the previous block's hash, for every block in
 * (from, to], through the relay and the mirror node.
 *
 * @returns {Promise<string[]>} mismatch descriptions
 */
async function parentChainMismatches(from, to) {
  const mirrorNode = new MirrorNode();
  const mismatches = [];

  for (let n = from + 1; n <= to; n++) {
    const relayParent = await ethers.provider.getBlock(n - 1);
    const relayBlock = await ethers.provider.getBlock(n);
    const mirrorNodeParent = await readMirrorNode(() =>
      mirrorNode.getBlock(n - 1),
    );
    const mirrorNodeBlock = await readMirrorNode(() => mirrorNode.getBlock(n));

    if (relayBlock.parentHash !== relayParent.hash) {
      mismatches.push(
        `relay: block ${n} parentHash ${relayBlock.parentHash} != block ${n - 1} hash ${relayParent.hash}`,
      );
    }

    if (mirrorNodeBlock.previous_hash !== mirrorNodeParent.hash) {
      mismatches.push(
        `mirror node: block ${n} previous_hash ${mirrorNodeBlock.previous_hash} != block ${n - 1} hash ${mirrorNodeParent.hash}`,
      );
    }
  }

  return mismatches;
}

module.exports = {
  OFFSETS,
  WINDOW,
  PROBE_COUNT,
  BLOCKS_BETWEEN_PROBES,
  FIRST_PROBE_BLOCK,
  deployBlockHashProbe,
  runProbe,
  reportedHashes,
  readHashesInTransaction,
  compareWithReported,
  checkProbe,
  findUpgradeBlock,
  parentChainMismatches,
};
