// SPDX-License-Identifier: Apache-2.0

// A receipt normally arrives in seconds; stop waiting after 90 s, inside mocha's 2-minute test limit
const RECEIPT_TIMEOUT_MS = 90_000;

/**
 * Waits for the transaction's receipt, at most RECEIPT_TIMEOUT_MS.
 *
 * @param {import("ethers").TransactionResponse} tx
 * @param {{ allowRevert?: boolean }} [options] return the receipt of a reverted transaction
 * instead of throwing
 * @returns {Promise<import("ethers").TransactionReceipt>}
 */
async function waitForReceipt(tx, { allowRevert = false } = {}) {
  try {
    return await tx.wait(1, RECEIPT_TIMEOUT_MS);
  } catch (error) {
    if (allowRevert && error.receipt) {
      return error.receipt;
    }

    if (error.code === "TIMEOUT") {
      throw new Error(
        `No receipt for transaction ${tx.hash} after ${RECEIPT_TIMEOUT_MS / 1_000} seconds`,
      );
    }

    throw error;
  }
}

module.exports = {
  waitForReceipt,
};
