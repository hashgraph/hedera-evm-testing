// SPDX-License-Identifier: Apache-2.0

const { network } = require("hardhat");
const Async = require("../../../utils/async");

// A receipt normally arrives in seconds; stop waiting after 90 s, inside mocha's 2-minute test limit
const RECEIPT_TIMEOUT_MS = 90_000;
// A read that gets no answer is tried again: 3 attempts, 2 s apart
const READ_ATTEMPTS = 3;
const READ_RETRY_DELAY_MS = 2_000;
// Errors that mean the read got no answer (dropped connection, timeout, overloaded server, an
// error page instead of JSON), as opposed to an answer with a wrong value, which is never retried
const NO_ANSWER =
  /fetch failed|other side closed|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|Cannot connect to the network|statusCode=50[234]|FAIL_INVALID|UNAVAILABLE|DEADLINE_EXCEEDED|PLATFORM_NOT_ACTIVE|max attempts|Unexpected token|not valid JSON/i;
// Relay methods that send a transaction: never retried, so nothing is sent twice
const SENDS_TRANSACTION = new Set([
  "eth_sendRawTransaction",
  "eth_sendTransaction",
]);

let relayReadsRetried = false;

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

function isNoAnswer(error) {
  return (
    error?.noAnswer === true || NO_ANSWER.test(String(error?.message ?? error))
  );
}

/**
 * Wraps a read-only function so a call that gets no answer is tried again. Only for reads: a
 * transaction must never be sent twice.
 *
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} read
 * @returns {T}
 */
function retryReads(read) {
  return async (...args) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await read(...args);
      } catch (error) {
        if (!isNoAnswer(error) || attempt === READ_ATTEMPTS) {
          throw error;
        }

        await Async.wait(READ_RETRY_DELAY_MS);
      }
    }
  };
}

/**
 * Retries every relay call that gets no answer, except calls that send a transaction. Covers all
 * relay reads of the test file: hardhat-ethers sends every relay call through network.provider.send.
 */
function retryRelayReads() {
  if (relayReadsRetried) {
    return;
  }

  const provider = network.provider;
  const send = provider.send.bind(provider);
  const sendWithRetry = retryReads(send);

  provider.send = (method, params) => {
    if (SENDS_TRANSACTION.has(method)) {
      return send(method, params);
    }

    return sendWithRetry(method, params);
  };
  relayReadsRetried = true;
}

/**
 * Runs a MirrorNode (REST) read, trying again when it gets no answer. MirrorNode returns an error
 * status as a `_status` body instead of throwing, so any error other than "Not found" is no answer.
 *
 * @template T
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 */
function readMirrorNode(read) {
  const readOrThrow = async () => {
    const body = await read();
    const message = body?._status?.messages?.[0]?.message;

    if (message !== undefined && message !== "Not found") {
      const error = new Error(`Mirror node error: ${message}`);
      error.noAnswer = true;
      throw error;
    }

    return body;
  };

  return retryReads(readOrThrow)();
}

module.exports = {
  waitForReceipt,
  retryRelayReads,
  readMirrorNode,
};
