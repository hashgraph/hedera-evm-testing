// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  writeSnapshot,
  suiteFailed,
  SNAPSHOT_PATH,
} = require("./utils/snapshot");
const { expectHash32 } = require("./utils/hashes");

// Phase 1 of the SHA-384 -> SHA-256 migration test: runs on the old network and records
// everything 02-verify.test.js compares after the consensus node upgrade.
describe("Hash migration - 01 populate (old network)", function () {
  before(async function () {
    this.snapshot = {};
  });

  after(async function () {
    const complete = !suiteFailed(this.test.parent);
    writeSnapshot(this.snapshot, complete);
    console.log(`Snapshot written to ${SNAPSHOT_PATH} (complete: ${complete})`);
  });

  it("should record the network and the starting block", async function () {
    const { chainId } = await ethers.provider.getNetwork();
    const block = await ethers.provider.getBlock("latest");
    expect(block, "relay returned no latest block").to.not.be.null;
    expectHash32(block.hash, `relay hash of block ${block.number}`);

    this.snapshot.network = { chainId };
    this.snapshot.startBlock = { number: block.number, hash: block.hash };
  });
});
