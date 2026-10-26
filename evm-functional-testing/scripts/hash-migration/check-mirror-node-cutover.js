// SPDX-License-Identifier: Apache-2.0

// Waits until the mirror node imports blocks from the Block Node after the block stream cutover,
// then checks the chain has no gap: SHA-384 record file hashes (48 bytes) up to the cutover,
// SHA-256 block hashes (32 bytes) after it.
// Usage: node scripts/hash-migration/check-mirror-node-cutover.js <mirror node url> <block before the upgrade>

// Checked every 5 seconds for 10 minutes
const LIMIT_MS = 10 * 60_000;
const RETRY_MS = 5_000;
// Block hashes the mirror node must import after the cutover: shows the Block Node keeps serving
const BLOCKS_AFTER_CUTOVER = 3;

/**
 * @param {string} hash 0x-prefixed hex
 * @returns {number} the hash length in bits
 */
function bits(hash) {
  return (hash.length - 2) * 4;
}

/**
 * Every block the mirror node has after `from`, oldest first.
 *
 * @param {string} url mirror node url
 * @param {number} from
 * @returns {Promise<{ number: number, hash: string }[]>}
 */
async function blocksAfter(url, from) {
  const blocks = [];
  let next = `/api/v1/blocks?block.number=gt:${from}&order=asc&limit=100`;

  while (next) {
    const response = await fetch(`${url}${next}`);
    const body = await response.json();

    blocks.push(...body.blocks);
    next = body.links?.next;
  }

  return blocks;
}

/**
 * The mirror node's blocks after `from`, once it has BLOCKS_AFTER_CUTOVER SHA-256 ones.
 *
 * @param {string} url mirror node url
 * @param {number} from
 */
async function waitForCutover(url, from) {
  const started = Date.now();

  for (;;) {
    try {
      const blocks = await blocksAfter(url, from);
      const sha256Blocks = blocks.filter((block) => bits(block.hash) === 256);

      if (sha256Blocks.length >= BLOCKS_AFTER_CUTOVER) {
        return blocks;
      }
    } catch (error) {
      console.log(`mirror node: ${error.message}`);
    }

    if (Date.now() - started > LIMIT_MS) {
      throw new Error(
        `mirror node: no ${BLOCKS_AFTER_CUTOVER} SHA-256 blocks after block ${from} within ${LIMIT_MS / 60_000} minutes`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

async function main() {
  const [url, fromArgument] = process.argv.slice(2);
  const from = Number(fromArgument);
  const blocks = await waitForCutover(url, from);
  const cutover = blocks.findIndex((block) => bits(block.hash) === 256);

  blocks.forEach((block, index) => {
    const expectedBits = index < cutover ? 384 : 256;

    if (block.number !== from + 1 + index) {
      throw new Error(
        `mirror node: block ${from + 1 + index} missing, found block ${block.number}`,
      );
    }

    if (bits(block.hash) !== expectedBits) {
      throw new Error(
        `mirror node: block ${block.number} hash has ${bits(block.hash)} bits, expected ${expectedBits}`,
      );
    }
  });

  if (cutover > 0) {
    console.log(
      `mirror node: blocks ${from + 1}-${blocks[cutover].number - 1} have SHA-384 hashes`,
    );
  }

  console.log(
    `mirror node: blocks ${blocks[cutover].number}-${blocks.at(-1).number} have SHA-256 hashes`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
