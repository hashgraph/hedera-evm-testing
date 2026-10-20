// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { readSnapshot } = require("./utils/snapshot");
const { getCodeOnConsensusNode } = require("./utils/consensus-node");
const {
  expectedGetterResults,
  readGetters,
  readSlots,
  findMismatches,
} = require("./utils/storage");
const {
  UPDATED_VALUES,
  writeValues,
  expectedGetters,
  expectTransientNotKept,
} = require("./utils/value-storage");
const {
  UPDATED_COLLECTIONS,
  writeCollections,
  expectedCollections,
} = require("./utils/collection-storage");
const {
  UPDATED_SALT,
  UPDATED_KEYS,
  writeEntries,
  expectedSample,
} = require("./utils/large-storage");
const {
  WINDOW,
  ZERO_HASH,
  reportedHashes,
  readHashesInTransaction,
} = require("./utils/block-hashes");

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

  // First, before any other transaction makes new blocks: old blocks must still be within reach
  describe("BlockHashProbe", function () {
    it("should return the same blockhash() for old blocks in a new transaction", async function () {
      const { address, blocks } = this.snapshot.blockHashProbe;
      const contract = await ethers.getContractAt("BlockHashProbe", address);
      const blockNumbers = Object.keys(blocks).map(Number);
      const { number, hashes } = await readHashesInTransaction(
        contract,
        blockNumbers,
      );
      const inWindow = blockNumbers.filter(
        (n) => n >= number - WINDOW && n < number,
      );

      expect(
        inWindow,
        `no recorded block is within ${WINDOW} blocks of block ${number}`,
      ).to.not.be.empty;

      const mismatches = [];

      for (const n of blockNumbers) {
        if (!inWindow.includes(n)) {
          if (hashes[n] !== ZERO_HASH) {
            mismatches.push(
              `blockhash(${n}) in block ${number} is outside the window but not zero`,
            );
          }
          continue;
        }

        const reported = await reportedHashes(n);

        if (
          hashes[n] !== blocks[n] ||
          reported.relay !== blocks[n] ||
          reported.mirrorNode !== blocks[n]
        ) {
          mismatches.push(
            `block ${n}: snapshot ${blocks[n]}, blockhash() in block ${number} ${hashes[n]}, relay ${reported.relay}, mirror node ${reported.mirrorNode}`,
          );
        }
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
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

  describe("CollectionStorage", function () {
    before(async function () {
      this.collectionStorage = await ethers.getContractAt(
        "CollectionStorage",
        this.snapshot.collectionStorage.address,
      );
    });

    it("should keep every raw storage slot", async function () {
      const expected = this.snapshot.collectionStorage.slots;
      const slots = Object.keys(expected).map(BigInt);
      const actual = await readSlots(this.collectionStorage, slots);
      const mismatches = findMismatches("slot", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep every getter value", async function () {
      const expected = this.snapshot.collectionStorage.getters;
      const actual = await readGetters(
        this.collectionStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the contract code", async function () {
      const address = this.snapshot.collectionStorage.address;
      const expected = this.snapshot.collectionStorage.code;
      expect(await ethers.provider.getCode(address), "code via relay").to.equal(
        expected,
      );
      expect(
        await getCodeOnConsensusNode(address),
        "code via consensus node",
      ).to.equal(expected);
    });

    it("should accept new entries for every collection", async function () {
      this.timeout(300_000);
      await writeCollections(this.collectionStorage, UPDATED_COLLECTIONS);

      const expected = expectedGetterResults(
        this.collectionStorage.interface,
        expectedCollections(UPDATED_COLLECTIONS, false),
      );
      const actual = await readGetters(
        this.collectionStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });

  describe("LargeStorage", function () {
    before(async function () {
      this.largeStorage = await ethers.getContractAt(
        "LargeStorage",
        this.snapshot.largeStorage.address,
      );
    });

    it("should keep every raw storage slot", async function () {
      this.timeout(600_000);
      const expected = this.snapshot.largeStorage.slots;
      const slots = Object.keys(expected).map(BigInt);
      const actual = await readSlots(this.largeStorage, slots);
      const mismatches = findMismatches("slot", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep every sampled getter value", async function () {
      const expected = this.snapshot.largeStorage.getters;
      const actual = await readGetters(
        this.largeStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the contract code", async function () {
      const address = this.snapshot.largeStorage.address;
      const expected = this.snapshot.largeStorage.code;
      expect(await ethers.provider.getCode(address), "code via relay").to.equal(
        expected,
      );
      expect(
        await getCodeOnConsensusNode(address),
        "code via consensus node",
      ).to.equal(expected);
    });

    it("should accept new values for a batch of entries and leave the rest unchanged", async function () {
      this.timeout(300_000);
      await writeEntries(this.largeStorage, UPDATED_SALT, UPDATED_KEYS);

      const expected = expectedGetterResults(
        this.largeStorage.interface,
        expectedSample(true),
      );
      const actual = await readGetters(
        this.largeStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });
});
