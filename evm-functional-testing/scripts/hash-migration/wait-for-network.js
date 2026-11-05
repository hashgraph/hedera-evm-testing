// SPDX-License-Identifier: Apache-2.0

// Waits until the mirror node can simulate a call and the network executes a transaction: a
// freshly deployed mirror node and an upgraded consensus node both need time before they do.
// Usage: npx hardhat run --network solo scripts/hash-migration/wait-for-network.js
const { ethers } = require("hardhat");

// Each condition gets 10 minutes, checked every 5 seconds
const LIMIT_MS = 10 * 60_000;
const RETRY_MS = 5_000;
const RECEIPT_TIMEOUT_MS = 90_000;

/**
 * Runs `run` until it succeeds, at most LIMIT_MS.
 *
 * @param {string} name what is being waited for, for the log
 * @param {() => Promise<unknown>} run
 */
async function retryUntil(name, run) {
  const started = Date.now();

  for (;;) {
    try {
      await run();
      console.log(
        `${name} after ${Math.round((Date.now() - started) / 1_000)}s`,
      );

      return;
    } catch (error) {
      if (Date.now() - started > LIMIT_MS) {
        throw new Error(
          `${name}: not within ${LIMIT_MS / 60_000} minutes: ${error.shortMessage ?? error.message}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

async function main() {
  const [, signer] = await ethers.getSigners();

  await retryUntil("mirror node simulates a call", () =>
    ethers.provider.estimateGas({ from: signer.address, data: "0x6000" }),
  );
  await retryUntil("network executes a transaction", async () => {
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0,
      gasLimit: 30_000,
    });

    await tx.wait(1, RECEIPT_TIMEOUT_MS);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
