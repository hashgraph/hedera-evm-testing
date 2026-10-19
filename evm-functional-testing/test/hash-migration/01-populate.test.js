// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  writeSnapshot,
  suiteFailed,
  SNAPSHOT_PATH,
} = require("./utils/snapshot");
const { expectHash32 } = require("./utils/hashes");
const { getCodeOnConsensusNode } = require("./utils/consensus-node");
const {
  ORIGINAL_VALUES,
  deployStorageMatrix,
  writeValues,
  expectedGetterResults,
  readGetters,
  usedSlots,
  readSlots,
  findMismatches,
  expectTransientNotKept,
} = require("./utils/storage-matrix");

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

  describe("StorageMatrix", function () {
    it("should deploy StorageMatrix and write every storage case", async function () {
      this.storageMatrix = await deployStorageMatrix();
      await writeValues(this.storageMatrix, ORIGINAL_VALUES);

      this.snapshot.storageMatrix = {
        address: await this.storageMatrix.getAddress(),
      };
    });

    it("should return the written value from every getter through the relay and the consensus node", async function () {
      const expected = expectedGetterResults(
        this.storageMatrix.interface,
        ORIGINAL_VALUES,
      );
      const actual = await readGetters(
        this.storageMatrix,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.storageMatrix.getters = expected;
    });

    it("should read the same raw storage slots through the relay and the consensus node", async function () {
      const slots = await usedSlots(this.storageMatrix, ORIGINAL_VALUES);
      const { relay, consensusNode } = await readSlots(
        this.storageMatrix,
        slots,
      );
      const mismatches = findMismatches("slot", relay, { consensusNode });
      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.storageMatrix.slots = relay;
    });

    it("should read the same code through the relay and the consensus node", async function () {
      const address = await this.storageMatrix.getAddress();
      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);
      expect(relayCode, "relay returned no code").to.not.equal("0x");
      expect(
        consensusNodeCode,
        "code differs between relay and consensus node",
      ).to.equal(relayCode);

      this.snapshot.storageMatrix.code = relayCode;
    });

    it("should not keep transient storage between transactions", async function () {
      await expectTransientNotKept(this.storageMatrix);
    });
  });
});
