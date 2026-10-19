// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { readSnapshot } = require("./utils/snapshot");

// Phase 3 of the SHA-384 -> SHA-256 migration test: runs on the upgraded network and compares
// it with the snapshot written by 01-populate.test.js.
describe("Hash migration - 02 verify (upgraded network)", function () {
  before(async function () {
    this.snapshot = readSnapshot();
  });

  it("should run on the same network the snapshot was taken on", async function () {
    const { chainId } = await ethers.provider.getNetwork();
    expect(chainId.toString(), "chain id differs from the snapshot").to.equal(
      this.snapshot.network.chainId,
    );

    const latest = await ethers.provider.getBlockNumber();
    expect(
      latest,
      "latest block is not past the snapshot's starting block",
    ).to.be.greaterThan(this.snapshot.startBlock.number);
  });
});
