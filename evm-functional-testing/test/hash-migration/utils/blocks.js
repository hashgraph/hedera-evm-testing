// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");

// A record file (block) closes every 2s, and only if it holds a transaction, so an idle network
// makes no blocks. One transfer per period makes one block.
const BLOCK_PERIOD_MS = 2_100;
const TRANSFER_GAS = 30_000;
// Fail instead of waiting for the test timeout when the chain stops moving
const STALL_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a zero-value self-transfer every block period until the network reaches `targetBlock`.
 * Transfers are not awaited one by one (the relay answers only after consensus), so nonces are
 * set explicitly.
 *
 * @param {number} targetBlock
 */
async function generateBlocksUntil(targetBlock) {
  const [, signer] = await ethers.getSigners();
  let nonce = await ethers.provider.getTransactionCount(signer.address);
  let transferFailed = false;
  const transfers = [];

  let currentBlock = await ethers.provider.getBlockNumber();
  let lastBlock = currentBlock;
  let lastProgressAt = Date.now();

  while (currentBlock < targetBlock) {
    // A failed transfer leaves a nonce gap that blocks every later one, so continue from the
    // network's nonce
    if (transferFailed) {
      nonce = await ethers.provider.getTransactionCount(signer.address);
      transferFailed = false;
    }

    const transfer = signer
      .sendTransaction({
        to: signer.address,
        value: 0,
        nonce: nonce++,
        gasLimit: TRANSFER_GAS,
      })
      .then((tx) => tx.wait());
    transfers.push(
      transfer.catch(() => {
        transferFailed = true;
      }),
    );

    await sleep(BLOCK_PERIOD_MS);
    currentBlock = await ethers.provider.getBlockNumber();

    if (currentBlock > lastBlock) {
      lastBlock = currentBlock;
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) {
      throw new Error(
        `No new block for ${STALL_TIMEOUT_MS / 1000}s: stuck at block ${currentBlock}, target ${targetBlock}`,
      );
    }
  }

  await Promise.all(transfers);
}

module.exports = {
  generateBlocksUntil,
};
