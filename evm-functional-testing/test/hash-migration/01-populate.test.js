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
const { readGetters, readSlots, findMismatches } = require("./utils/storage");
const {
  ORIGINAL_VALUES,
  deployValueStorage,
  writeValues,
  expectedGetters,
  usedSlots,
  expectTransientNotKept,
} = require("./utils/value-storage");

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

  describe("ValueStorage", function () {
    it("should deploy ValueStorage and write every value case", async function () {
      this.valueStorage = await deployValueStorage();
      await writeValues(this.valueStorage, ORIGINAL_VALUES);

      this.snapshot.valueStorage = {
        address: await this.valueStorage.getAddress(),
      };
    });

    it("should return the written value from every getter through the relay and the consensus node", async function () {
      const expected = expectedGetters(
        this.valueStorage.interface,
        ORIGINAL_VALUES,
      );
      const actual = await readGetters(
        this.valueStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.valueStorage.getters = expected;
    });

    it("should read the same raw storage slots through the relay and the consensus node", async function () {
      const slots = await usedSlots(this.valueStorage, ORIGINAL_VALUES);
      const { relay, consensusNode } = await readSlots(
        this.valueStorage,
        slots,
      );
      const mismatches = findMismatches("slot", relay, { consensusNode });
      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.valueStorage.slots = relay;
    });

    it("should read the same code through the relay and the consensus node", async function () {
      const address = await this.valueStorage.getAddress();
      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);
      expect(relayCode, "relay returned no code").to.not.equal("0x");
      expect(
        consensusNodeCode,
        "code differs between relay and consensus node",
      ).to.equal(relayCode);

      this.snapshot.valueStorage.code = relayCode;
    });

    it("should not keep transient storage between transactions", async function () {
      await expectTransientNotKept(this.valueStorage);
    });
  });
});
