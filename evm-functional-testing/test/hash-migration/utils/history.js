// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");

// Parallel relay requests when scanning blocks
const RELAY_BATCH = 20;

/** Raw JSON-RPC call through the relay, so results are compared exactly as the relay returns them. */
function rpc(method, params) {
  return ethers.provider.send(method, params);
}

/**
 * Hashes of every transaction `sender` sent in blocks fromBlock..toBlock, in block order.
 *
 * @param {string} sender
 * @param {number} fromBlock
 * @param {number} toBlock
 * @returns {Promise<string[]>}
 */
async function findTransactions(sender, fromBlock, toBlock) {
  const found = [];

  for (let first = fromBlock; first <= toBlock; first += RELAY_BATCH) {
    const numbers = [];

    for (let n = first; n <= Math.min(first + RELAY_BATCH - 1, toBlock); n++) {
      numbers.push(n);
    }

    const blocks = await Promise.all(
      numbers.map((n) =>
        rpc("eth_getBlockByNumber", [ethers.toQuantity(n), true]),
      ),
    );

    for (const block of blocks) {
      const sent = block.transactions.filter(
        (tx) => tx.from.toLowerCase() === sender.toLowerCase(),
      );
      found.push(...sent.map((tx) => tx.hash));
    }
  }

  return found;
}

/**
 * Everything verify compares for the given transactions: each transaction and its receipt, each
 * of their blocks with that block's logs, and the logs of every contract they touched.
 *
 * @param {string[]} txHashes
 * @param {number} fromBlock
 * @param {number} toBlock
 */
async function recordHistory(txHashes, fromBlock, toBlock) {
  const transactions = {};
  const blocks = {};
  const addresses = new Set();

  for (const hash of txHashes) {
    const transaction = await rpc("eth_getTransactionByHash", [hash]);
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    // Recorded separately: the relay returns `to` differently here than eth_getTransactionByHash
    // for contract creations, so each method is compared with itself before and after the upgrade
    const byBlockIndex = await rpc("eth_getTransactionByBlockHashAndIndex", [
      receipt.blockHash,
      receipt.transactionIndex,
    ]);
    transactions[hash] = { transaction, receipt, byBlockIndex };

    receipt.logs.forEach((log) => addresses.add(log.address));

    if (!blocks[receipt.blockHash]) {
      const block = await rpc("eth_getBlockByHash", [receipt.blockHash, false]);
      const logs = await rpc("eth_getLogs", [{ blockHash: receipt.blockHash }]);
      blocks[receipt.blockHash] = { block, logs };
    }
  }

  const logsByAddress = {};

  for (const address of addresses) {
    logsByAddress[address] = await rpc("eth_getLogs", [
      logFilter(address, fromBlock, toBlock),
    ]);
  }

  return { fromBlock, toBlock, transactions, blocks, logsByAddress };
}

function logFilter(address, fromBlock, toBlock) {
  return {
    address,
    fromBlock: ethers.toQuantity(fromBlock),
    toBlock: ethers.toQuantity(toBlock),
  };
}

/**
 * Names every top-level field that differs between two JSON-RPC results.
 *
 * @param {string} label e.g. "receipt of 0xabc…"
 * @returns {string[]}
 */
function fieldMismatches(label, expected, actual) {
  if (actual === null || actual === undefined) {
    return [`${label}: not found`];
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const mismatches = [];

  for (const key of keys) {
    const before = JSON.stringify(expected[key]);
    const after = JSON.stringify(actual[key]);

    if (before !== after) {
      mismatches.push(`${label} ${key}: expected ${before}, got ${after}`);
    }
  }

  return mismatches;
}

module.exports = {
  rpc,
  findTransactions,
  recordHistory,
  logFilter,
  fieldMismatches,
};
