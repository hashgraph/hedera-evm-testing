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
const {
  ORIGINAL_CHILDREN,
  deployLifecycleFactory,
  createChild,
  create2Child,
  destroyChild,
  idOf,
} = require("./utils/lifecycle");
const {
  readAccounts,
  codeMismatches,
  contractAddresses,
} = require("./utils/accounts");
const {
  ADMIN_KEY_CHILDREN,
  operatorPublicKey,
  deployWithSdk,
  readAdminKey,
} = require("./utils/admin-key");
const {
  SENT_TRANSFERS,
  createWalletAccount,
  sendTransfer,
  readWalletAccount,
} = require("./utils/wallet-account");
const { HOLLOW_KEY, createHollowAccount } = require("./utils/hollow-account");
const {
  ORIGINAL_STORED_VALUE,
  delegationIndicatorFor,
  deployDelegationTarget,
  createDelegatedAccount,
  storeThroughDelegation,
  readDelegation,
} = require("./utils/delegation");
const {
  PAID_OUT,
  ALLOWANCE,
  FEE_TINYBARS,
  deployTokenManager,
  createFungibleToken,
  setUpAccounts,
  readTokenInfo,
  readTokenAccounts,
} = require("./utils/hts-token");
const {
  SERIALS,
  metadataOf,
  createNft,
  mintNfts,
  setUpNftAccounts,
  readNftInfo,
  readSerials,
  readNftAccounts,
} = require("./utils/hts-nft");
const {
  ercAccounts,
  setUpErcTokens,
  expectedErcGetters,
  getterMismatches,
  transfersTo,
} = require("./utils/erc-tokens");
const { findTransactions, recordHistory } = require("./utils/history");
const { ONE_HBAR } = require("../../utils/constants");

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

  describe("Contract lifecycle", function () {
    it("should create a child with CREATE at the address the factory's nonce gives", async function () {
      this.lifecycleFactory = await deployLifecycleFactory();

      const child = ORIGINAL_CHILDREN.create;
      const { address, expected } = await createChild(
        this.lifecycleFactory,
        child,
      );

      expect(
        address,
        "CREATE address does not follow the factory's nonce",
      ).to.equal(expected);

      const factory = await this.lifecycleFactory.getAddress();
      this.snapshot.lifecycle = {
        factory,
        children: { create: { address, ...child } },
      };
    });

    it("should create a child with CREATE2 at the predicted address", async function () {
      const child = ORIGINAL_CHILDREN.create2;
      const { address, predicted } = await create2Child(
        this.lifecycleFactory,
        child,
      );

      expect(
        predicted.factory,
        "factory and JS predict different CREATE2 addresses",
      ).to.equal(predicted.js);
      expect(address, "CREATE2 address differs from the prediction").to.equal(
        predicted.js,
      );

      this.snapshot.lifecycle.children.create2 = { address, ...child };
    });

    it("should self-destruct a funded child in a later transaction, sending its balance to another child", async function () {
      const child = ORIGINAL_CHILDREN.destroyed;
      const recipient = this.snapshot.lifecycle.children.create.address;
      const { address, relay, consensusNode } = await destroyChild(
        this.lifecycleFactory,
        child,
        recipient,
      );
      const mismatches = findMismatches("self-destruct", relay, {
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(relay.balance, "self-destructed child kept its balance").to.equal(
        "0",
      );
      expect(
        relay.recipientGain,
        "recipient did not get the child's balance",
      ).to.equal(ONE_HBAR.toString());

      this.snapshot.lifecycle.children.destroyed = {
        address,
        ...child,
        outcome: relay,
      };
    });

    it("should call the children from the factory through the relay and the consensus node", async function () {
      const { create, create2 } = this.snapshot.lifecycle.children;
      const mismatches = [];

      for (const child of [create, create2]) {
        const ids = await idOf(this.lifecycleFactory, child.address);

        if (ids.relay !== child.id || ids.consensusNode !== child.id) {
          mismatches.push(
            `idOf(${child.address}): expected ${child.id}, relay ${ids.relay}, consensus node ${ids.consensusNode}`,
          );
        }
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should deploy a contract with an admin key and one without through the SDK", async function () {
      const withKey = await deployWithSdk(ADMIN_KEY_CHILDREN.withKey, true);
      const withoutKey = await deployWithSdk(
        ADMIN_KEY_CHILDREN.withoutKey,
        false,
      );

      withKey.adminKey = await readAdminKey(withKey.address);
      withoutKey.adminKey = await readAdminKey(withoutKey.address);

      expect(withKey.adminKey, "admin key is not the operator key").to.equal(
        operatorPublicKey(),
      );
      // Without an admin key the consensus node reports the contract's own id
      expect(
        withoutKey.adminKey,
        "contract without an admin key reports another key",
      ).to.equal(withoutKey.contractId);

      this.snapshot.lifecycle.adminKeys = { withKey, withoutKey };
    });

    it(`should record an account with nonce ${SENT_TRANSFERS}, matching the relay and the consensus node`, async function () {
      const wallet = await createWalletAccount();

      for (let i = 0; i < SENT_TRANSFERS; i++) {
        await sendTransfer(wallet);
      }

      const { relay, consensusNode, key } = await readWalletAccount(
        wallet.address,
      );
      const mismatches = findMismatches("nonce account", relay, {
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(relay.nonce, "nonce").to.equal(String(SENT_TRANSFERS));

      // A throwaway key on a local test network: verify needs it to send the next transaction
      this.snapshot.lifecycle.nonceAccount = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        ...relay,
        key,
      };
    });

    it("should create a hollow account by sending HBAR to a new EVM address", async function () {
      const wallet = await createHollowAccount();
      const { relay, consensusNode, key } = await readWalletAccount(
        wallet.address,
      );
      const mismatches = findMismatches("hollow account", relay, {
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(key, "hollow account key").to.equal(HOLLOW_KEY);
      expect(relay.nonce, "nonce").to.equal("0");

      // A throwaway key on a local test network: verify needs it to send the first transaction
      this.snapshot.lifecycle.hollowAccount = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        ...relay,
        key,
      };
    });

    it("should delegate an account to a contract with EIP-7702 and store a value through it", async function () {
      const target = await deployDelegationTarget();
      const targetAddress = await target.getAddress();
      const { address, accountId } =
        await createDelegatedAccount(targetAddress);

      const receipt = await storeThroughDelegation(
        target,
        address,
        ORIGINAL_STORED_VALUE,
      );

      expect(receipt.status, "storeAndEmit through the account").to.equal(1);

      const delegation = await readDelegation(address, accountId);
      const { relay, consensusNode, key } = await readWalletAccount(address);
      const mismatches = findMismatches("delegated account", relay, {
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(delegation.code, "code of the delegated account").to.equal(
        delegationIndicatorFor(targetAddress).toLowerCase(),
      );
      expect(
        delegation.delegationAddress,
        "delegation address on the consensus node",
      ).to.equal(targetAddress.toLowerCase());
      expect(BigInt(delegation.slot0), "slot 0 of the account").to.equal(
        ORIGINAL_STORED_VALUE,
      );

      this.snapshot.lifecycle.delegatedAccount = {
        address,
        accountId,
        target: targetAddress,
        ...delegation,
        ...relay,
        key,
      };
    });
  });

  describe("HTS fungible token", function () {
    it("should create a fungible token with a fixed HBAR fee through the HTS system contract", async function () {
      this.tokenManager = await deployTokenManager();
      this.token = await createFungibleToken(this.tokenManager);

      const { relay, consensusNode } = await readTokenInfo(this.token);
      const mismatches = findMismatches("token info", relay, { consensusNode });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(consensusNode.customFeeAmount, "custom fee").to.equal(
        String(FEE_TINYBARS),
      );

      const manager = await this.tokenManager.getAddress();
      this.snapshot.htsFungible = {
        manager,
        token: this.token,
        info: { relay, consensusNode },
      };
    });

    it("should set up a holder with an allowance, a frozen account and a spender", async function () {
      this.timeout(300_000);

      const wallets = await setUpAccounts(this.tokenManager, this.token);

      // Throwaway keys on a local test network: verify needs them to send transactions
      this.snapshot.htsFungible.accounts = Object.fromEntries(
        Object.entries(wallets).map(([name, wallet]) => [
          name,
          { address: wallet.address, privateKey: wallet.privateKey },
        ]),
      );
    });

    it("should read the same balances, allowances, flags and associations through the relay and the consensus node", async function () {
      const { accounts } = this.snapshot.htsFungible;
      const addresses = Object.fromEntries(
        Object.entries(accounts).map(([name, { address }]) => [name, address]),
      );
      const { relay, consensusNode } = await readTokenAccounts(
        this.tokenManager,
        this.token,
        addresses,
        accounts.spender.address,
      );
      const mismatches = findMismatches("token account", relay, {
        consensusNode,
      });
      const expected = {
        "holder balance": String(PAID_OUT),
        "holder allowance": String(ALLOWANCE),
        "holder frozen": "false",
        "frozen balance": String(PAID_OUT),
        "frozen frozen": "true",
        "spender balance": "0",
        "holder kyc": "true",
        "holder associated": "true",
        "frozen associated": "true",
        "spender associated": "true",
      };
      mismatches.push(...findMismatches("token account", expected, { relay }));

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.htsFungible.state = relay;
    });
  });

  describe("HTS NFT", function () {
    before(async function () {
      const { manager, accounts } = this.snapshot.htsFungible;

      this.tokenManager = await ethers.getContractAt("TokenManager", manager);
      this.wallets = Object.fromEntries(
        Object.entries(accounts).map(([name, { privateKey }]) => [
          name,
          new ethers.Wallet(privateKey, ethers.provider),
        ]),
      );
    });

    it(`should create an NFT with a fixed HBAR fee and mint ${SERIALS.length} serials`, async function () {
      this.nft = await createNft(this.tokenManager);
      const minted = await mintNfts(this.tokenManager, this.nft, SERIALS);

      expect(minted, "minted serials").to.deep.equal(SERIALS);

      const { relay, consensusNode } = await readNftInfo(this.nft);
      const mismatches = findMismatches("NFT info", relay, { consensusNode });

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.htsNft = {
        token: this.nft,
        info: { relay, consensusNode },
      };
    });

    it("should give serials to the holder and the frozen account, with single and for-all approvals to the spender", async function () {
      this.timeout(300_000);

      await setUpNftAccounts(this.tokenManager, this.nft, this.wallets);
    });

    it("should read the same owners, approvals and metadata of every serial through the relay and the consensus node", async function () {
      const { holder, frozen, spender } = this.wallets;
      const manager = await this.tokenManager.getAddress();
      const { relay, consensusNode } = await readSerials(
        this.tokenManager,
        this.nft,
        SERIALS,
      );
      const expected = {
        "#1 owner": holder.address,
        "#1 approved": spender.address,
        "#2 owner": holder.address,
        "#3 owner": frozen.address,
        "#4 owner": manager,
        ...Object.fromEntries(
          SERIALS.map((serial) => [`#${serial} metadata`, metadataOf(serial)]),
        ),
      };
      const mismatches = [
        ...findMismatches("serial", relay, { consensusNode }),
        ...findMismatches("serial", expected, { relay }),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.htsNft.serials = relay;
    });

    it("should read the same NFT balances, approvals for all, flags and associations through the relay and the consensus node", async function () {
      const { holder, frozen, spender } = this.wallets;
      const { relay, consensusNode } = await readNftAccounts(
        this.tokenManager,
        this.nft,
        {
          holder: holder.address,
          frozen: frozen.address,
          spender: spender.address,
        },
        spender.address,
      );
      const expected = {
        "holder balance": "2",
        "holder approvedForAll": "true",
        "frozen balance": "1",
        "frozen frozen": "true",
        "spender balance": "0",
        "holder associated": "true",
        "spender associated": "true",
      };
      const mismatches = [
        ...findMismatches("NFT account", relay, { consensusNode }),
        ...findMismatches("NFT account", expected, { relay }),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.htsNft.accounts = relay;
    });
  });

  describe("ERC tokens and events", function () {
    it("should deploy an ERC20, an ERC721 and an ERC1155 and mint, transfer and approve on each", async function () {
      this.timeout(300_000);

      const fromBlock = await ethers.provider.getBlockNumber();
      this.ercTokens = await setUpErcTokens();

      const contracts = {};

      for (const [name, contract] of Object.entries(this.ercTokens)) {
        contracts[name] = await contract.getAddress();
      }

      this.snapshot.erc = { contracts, fromBlock };
    });

    it("should read the same balances, allowances, owners, approvals and URIs through the relay and the consensus node", async function () {
      const expected = await expectedErcGetters();
      const mismatches = [];
      const getters = {};

      for (const [name, values] of Object.entries(expected)) {
        const contract = this.ercTokens[name];
        const contractMismatches = await getterMismatches(
          contract,
          values,
          name,
        );

        mismatches.push(...contractMismatches);
        getters[name] = expectedGetterResults(contract.interface, values);
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.erc.getters = getters;
    });

    it("should find the Transfer events to the receiver from several contracts by event signature", async function () {
      const { receiver } = await ercAccounts();
      const { contracts, fromBlock } = this.snapshot.erc;
      const toBlock = await ethers.provider.getBlockNumber();
      const logs = await transfersTo(receiver.address, fromBlock, toBlock);
      const emitters = new Set(logs.map((log) => log.address.toLowerCase()));

      expect(
        [...emitters],
        "Transfer events to the receiver should come from the ERC20 and the ERC721",
      ).to.have.members([
        contracts.erc20.toLowerCase(),
        contracts.erc721.toLowerCase(),
      ]);

      this.snapshot.erc.transferLogs = { fromBlock, toBlock, logs };
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

  describe("Accounts", function () {
    it("should read the same code, code hash, balance and nonce of every contract through the relay and the consensus node", async function () {
      const addresses = contractAddresses(this.snapshot);
      const reader = await ethers.getContractAt(
        "LifecycleFactory",
        this.snapshot.lifecycle.factory,
      );
      const { relay, consensusNode } = await readAccounts(reader, addresses);
      const mismatches = [
        ...findMismatches("account", relay, { consensusNode }),
        ...codeMismatches(relay, addresses),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;

      this.snapshot.accounts = relay;
    });
  });

  // Last, so it includes every transaction populate sent
  describe("History", function () {
    it("should record every transaction populate sent, with its receipt, block and logs", async function () {
      this.timeout(600_000);

      const [signer] = await ethers.getSigners();
      const fromBlock = this.snapshot.startBlock.number;
      const toBlock = await ethers.provider.getBlockNumber();
      const txHashes = await findTransactions(
        signer.address,
        fromBlock,
        toBlock,
      );

      expect(
        txHashes,
        `no transactions from ${signer.address} in blocks ${fromBlock}-${toBlock}`,
      ).to.not.be.empty;

      const history = await recordHistory(txHashes, fromBlock, toBlock);

      expect(
        Object.keys(history.logsByAddress),
        "no populate transaction emitted a log",
      ).to.not.be.empty;

      this.snapshot.history = history;
    });
  });
});
