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
  expectedGetterResults,
  readGetters,
  readSlots,
  findMismatches,
} = require("./utils/storage");
const {
  ORIGINAL_VALUES,
  deployValueStorage,
  writeValues,
  expectedGetters,
  usedSlots,
  expectTransientNotKept,
} = require("./utils/value-storage");
const {
  ORIGINAL_COLLECTIONS,
  deployCollectionStorage,
  writeCollections,
  popAndDelete,
  expectedCollections,
  collectionSlots,
  clearedCollectionSlots,
} = require("./utils/collection-storage");
const {
  ORIGINAL_SALT,
  ENTRY_COUNT,
  deployLargeStorage,
  writeEntries,
  expectedSample,
  largeSlots,
} = require("./utils/large-storage");
const { generateBlocksUntil } = require("./utils/blocks");
const {
  PROBE_COUNT,
  BLOCKS_BETWEEN_PROBES,
  FIRST_PROBE_BLOCK,
  deployBlockHashProbe,
  runProbe,
  checkProbe,
} = require("./utils/block-hashes");

// Phase 1 of the SHA-384 -> SHA-256 migration test: runs on the old network and records
// everything 02-verify.test.js compares after the consensus node upgrade.
describe("Hash migration - 01 populate (old network)", function () {
  before(async function () {
    this.snapshot = {};

    // A freshly started mirror node can fail its first EVM simulation while it initialises, so
    // make a throwaway one (a tiny contract-creation estimate) before the real transactions
    const [signer] = await ethers.getSigners();
    await ethers.provider
      .estimateGas({ from: signer.address, data: "0x6000" })
      .catch(() => {});
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

      const address = await this.valueStorage.getAddress();
      this.snapshot.valueStorage = { address };
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

  describe("CollectionStorage", function () {
    it("should deploy CollectionStorage, write every collection, then pop and delete", async function () {
      this.timeout(300_000);

      this.collectionStorage = await deployCollectionStorage();
      await writeCollections(this.collectionStorage, ORIGINAL_COLLECTIONS);
      await popAndDelete(this.collectionStorage);

      const address = await this.collectionStorage.getAddress();
      this.snapshot.collectionStorage = { address };
    });

    it("should return the written entry from every getter through the relay and the consensus node", async function () {
      const expected = expectedGetterResults(
        this.collectionStorage.interface,
        expectedCollections(ORIGINAL_COLLECTIONS, true),
      );
      const actual = await readGetters(
        this.collectionStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.collectionStorage.getters = expected;
    });

    it("should read the same raw storage slots through the relay and the consensus node", async function () {
      const slots = await collectionSlots(
        this.collectionStorage,
        ORIGINAL_COLLECTIONS,
      );
      const { relay, consensusNode } = await readSlots(
        this.collectionStorage,
        slots,
      );
      const mismatches = findMismatches("slot", relay, { consensusNode });

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      // A wrongly computed slot would read zero on both paths and still match, so every slot
      // except the ones freed by pop() and delete must hold data
      const clearedSlots = await clearedCollectionSlots(
        this.collectionStorage,
        ORIGINAL_COLLECTIONS,
      );
      const cleared = clearedSlots.map((slot) => ethers.toBeHex(slot));
      const empty = Object.entries(relay)
        .filter(
          ([slot, value]) => BigInt(value) === 0n && !cleared.includes(slot),
        )
        .map(([slot]) => slot);
      expect(empty, `slots expected to hold data are empty: ${empty}`).to.be
        .empty;

      this.snapshot.collectionStorage.slots = relay;
    });

    it("should clear the slots freed by pop() and delete", async function () {
      const slots = await clearedCollectionSlots(
        this.collectionStorage,
        ORIGINAL_COLLECTIONS,
      );
      const actual = await readSlots(this.collectionStorage, slots);
      const zero = ethers.toBeHex(0, 32);
      const expected = Object.fromEntries(
        slots.map((slot) => [ethers.toBeHex(slot), zero]),
      );
      const mismatches = findMismatches("slot", expected, actual);

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should read the same code through the relay and the consensus node", async function () {
      const address = await this.collectionStorage.getAddress();
      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);

      expect(relayCode, "relay returned no code").to.not.equal("0x");
      expect(
        consensusNodeCode,
        "code differs between relay and consensus node",
      ).to.equal(relayCode);

      this.snapshot.collectionStorage.code = relayCode;
    });
  });

  describe("LargeStorage", function () {
    it(`should deploy LargeStorage and write ${ENTRY_COUNT} entries`, async function () {
      this.timeout(600_000);

      this.largeStorage = await deployLargeStorage();
      await writeEntries(this.largeStorage, ORIGINAL_SALT, {
        first: 0,
        count: ENTRY_COUNT,
      });

      const address = await this.largeStorage.getAddress();
      this.snapshot.largeStorage = { address };
    });

    it("should return the written value from sampled getters through the relay and the consensus node", async function () {
      const expected = expectedGetterResults(
        this.largeStorage.interface,
        expectedSample(false),
      );
      const actual = await readGetters(
        this.largeStorage,
        Object.keys(expected),
      );
      const mismatches = findMismatches("getter", expected, actual);

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.largeStorage.getters = expected;
    });

    it("should read the same raw storage slots through the relay and the consensus node", async function () {
      this.timeout(600_000);

      const slots = await largeSlots(this.largeStorage);
      const { relay, consensusNode } = await readSlots(
        this.largeStorage,
        slots,
      );
      const mismatches = findMismatches("slot", relay, { consensusNode });

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      // A wrongly computed slot would read zero on both paths and still match
      const empty = Object.entries(relay)
        .filter(([, value]) => BigInt(value) === 0n)
        .map(([slot]) => slot);
      expect(empty, `slots expected to hold data are empty: ${empty}`).to.be
        .empty;

      this.snapshot.largeStorage.slots = relay;
    });

    it("should read the same code through the relay and the consensus node", async function () {
      const address = await this.largeStorage.getAddress();
      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);

      expect(relayCode, "relay returned no code").to.not.equal("0x");
      expect(
        consensusNodeCode,
        "code differs between relay and consensus node",
      ).to.equal(relayCode);

      this.snapshot.largeStorage.code = relayCode;
    });
  });

  // Last, so the recorded blocks are as close as possible to the upgrade
  describe("BlockHashProbe", function () {
    it(`should record blockhash() in ${PROBE_COUNT} different blocks, matching the relay and the mirror node`, async function () {
      this.timeout(1_800_000);

      const contract = await deployBlockHashProbe();
      const probes = [];
      const blocks = {};
      const mismatches = [];

      const currentBlock = await ethers.provider.getBlockNumber();
      let nextProbeBlock = Math.max(FIRST_PROBE_BLOCK, currentBlock + 1);

      for (let i = 0; i < PROBE_COUNT; i++) {
        await generateBlocksUntil(nextProbeBlock);
        const probe = await runProbe(contract);
        const checked = await checkProbe(probe);
        mismatches.push(...checked.mismatches);
        Object.assign(blocks, checked.blocks);

        probes.push(probe);
        nextProbeBlock = probe.number + BLOCKS_BETWEEN_PROBES;
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      const address = await contract.getAddress();
      this.snapshot.blockHashProbe = { address, probes, blocks };
    });
  });
});
