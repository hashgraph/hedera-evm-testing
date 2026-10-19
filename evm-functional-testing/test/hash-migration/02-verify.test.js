// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { readSnapshot } = require("./utils/snapshot");
const { getCodeOnConsensusNode } = require("./utils/consensus-node");
const { readGetters, readSlots, findMismatches } = require("./utils/storage");
const {
  UPDATED_VALUES,
  writeValues,
  expectedGetters,
  expectTransientNotKept,
} = require("./utils/value-storage");

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

  describe("ValueStorage", function () {
    before(async function () {
      this.valueStorage = await ethers.getContractAt(
        "ValueStorage",
        this.snapshot.valueStorage.address,
      );
    });

    it("should keep every raw storage slot", async function () {
      const expected = this.snapshot.valueStorage.slots;
      const slots = Object.keys(expected).map(BigInt);
      const actual = await readSlots(this.valueStorage, slots);
      const mismatches = findMismatches("slot", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep every getter value", async function () {
      const expected = this.snapshot.valueStorage.getters;
      const actual = await readGetters(
        this.valueStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the contract code", async function () {
      const address = this.snapshot.valueStorage.address;
      const expected = this.snapshot.valueStorage.code;
      expect(await ethers.provider.getCode(address), "code via relay").to.equal(
        expected,
      );
      expect(
        await getCodeOnConsensusNode(address),
        "code via consensus node",
      ).to.equal(expected);
    });

    it("should not keep transient storage between transactions", async function () {
      await expectTransientNotKept(this.valueStorage);
    });

    it("should accept new values for every value case", async function () {
      await writeValues(this.valueStorage, UPDATED_VALUES);

      const expected = expectedGetters(
        this.valueStorage.interface,
        UPDATED_VALUES,
      );
      const actual = await readGetters(
        this.valueStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });
});
