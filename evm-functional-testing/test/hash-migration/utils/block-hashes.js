// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { MirrorNode } = require("../../../utils/mirror-node");

// k in blockhash(block.number - k): recent blocks, both edges of the 256-block window, and one past it
const OFFSETS = [1, 2, 10, 255, 256, 257];
const WINDOW = 256;
const PROBE_COUNT = 5;
const BLOCKS_BETWEEN_PROBES = 20;
// The first probe needs 257 earlier blocks for every offset to point at a real block
const FIRST_PROBE_BLOCK = 300;

const ZERO_HASH = ethers.ZeroHash;

async function deployBlockHashProbe() {
  const factory = await ethers.getContractFactory("BlockHashProbe");
  const contract = await factory.deploy();
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
  const tx = await contract.probe(OFFSETS);
  const receipt = await tx.wait();
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
  const mirrorNodeBlock = await new MirrorNode().getBlock(blockNumber);

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
  const tx = await contract.readHashes(blockNumbers);
  const receipt = await tx.wait();
  const args = eventArgs(contract, receipt, "HashesRead");

  return {
    number: Number(args.number),
    hashes: Object.fromEntries(
      args.blockNumbers.map((n, i) => [Number(n), args.hashes[i]]),
    ),
  };
}

module.exports = {
  OFFSETS,
  WINDOW,
  PROBE_COUNT,
  BLOCKS_BETWEEN_PROBES,
  FIRST_PROBE_BLOCK,
  ZERO_HASH,
  deployBlockHashProbe,
  runProbe,
  reportedHashes,
  readHashesInTransaction,
};
