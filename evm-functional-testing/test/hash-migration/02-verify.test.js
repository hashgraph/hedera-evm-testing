// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { readSnapshot } = require("./utils/snapshot");
const {
  getCodeOnConsensusNode,
  getAccountOnConsensusNode,
} = require("./utils/consensus-node");
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
const { generateBlocksUntil } = require("./utils/blocks");
const {
  WINDOW,
  runProbe,
  reportedHashes,
  readHashesInTransaction,
  compareWithReported,
  checkProbe,
  findUpgradeBlock,
  parentChainMismatches,
} = require("./utils/block-hashes");
const {
  UPDATED_CHILDREN,
  deployLifecycleFactory,
  createChild,
  create2Child,
  create2Again,
  destroyChild,
  idOf,
} = require("./utils/lifecycle");
const { readAccounts, contractAddresses } = require("./utils/accounts");
const { readAdminKey, updateMemo } = require("./utils/admin-key");
const { sendTransfer, readWalletAccount } = require("./utils/wallet-account");
const { completedKey } = require("./utils/hollow-account");
const {
  UPDATED_STORED_VALUE,
  storeThroughDelegation,
  readDelegation,
} = require("./utils/delegation");
const {
  PAID_OUT,
  UPDATED_ALLOWANCE,
  TRANSFERRED,
  FEE_TINYBARS,
  createTokenHolder,
  transfer,
  approve,
  readTokenInfo,
  readTokenAccounts,
} = require("./utils/hts-token");
const { TINYBAR_TO_WEIBAR_COEF } = require("../../utils/constants");
const {
  SERIALS,
  NEW_SERIAL,
  metadataOf,
  mintNfts,
  transferNft,
  readNftInfo,
  readSerials,
  readNftAccounts,
} = require("./utils/hts-nft");
const { rpc, logFilter, fieldMismatches } = require("./utils/history");

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
    before(async function () {
      const { address, probes } = this.snapshot.blockHashProbe;
      this.blockHashProbe = await ethers.getContractAt(
        "BlockHashProbe",
        address,
      );
      this.lastProbeBlock = probes.at(-1).number;
    });

    it("should return the same blockhash() for old blocks in a new transaction", async function () {
      const { blocks } = this.snapshot.blockHashProbe;
      const blockNumbers = Object.keys(blocks).map(Number);
      const { number, hashes } = await readHashesInTransaction(
        this.blockHashProbe,
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
          if (hashes[n] !== ethers.ZeroHash) {
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

    it("should link the blocks before and after the upgrade without a gap", async function () {
      this.timeout(300_000);

      const upgrade = await findUpgradeBlock(this.lastProbeBlock);
      const u = upgrade.number;
      const around = [u - 1, u, u + 1];

      // blockhash(U + 1) can only be read from a later block
      await generateBlocksUntil(u + 3);

      const { number, hashes } = await readHashesInTransaction(
        this.blockHashProbe,
        around,
      );
      const mismatches = [];

      for (const n of around) {
        const mismatch = await compareWithReported(
          n,
          hashes[n],
          `in block ${number}`,
        );

        if (mismatch) {
          mismatches.push(mismatch);
        }
      }

      const chainMismatches = await parentChainMismatches(u - 3, u + 2);
      mismatches.push(...chainMismatches);

      expect(
        mismatches,
        `upgrade at block ${u} (${upgrade.oldVersion} -> ${upgrade.newVersion}):\n${mismatches.join("\n")}`,
      ).to.be.empty;
    });

    it("should keep the 256-block window while it still reaches back past the upgrade", async function () {
      const upgrade = await findUpgradeBlock(this.lastProbeBlock);
      const probe = await runProbe(this.blockHashProbe);

      expect(
        probe.number - WINDOW,
        `the window in block ${probe.number} no longer reaches past the upgrade at block ${upgrade.number}`,
      ).to.be.lessThan(upgrade.number);

      const { mismatches } = await checkProbe(probe);

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });

  // Before any test below creates a contract or moves HBAR
  describe("Accounts", function () {
    it("should keep the code, code hash, balance and nonce of every contract", async function () {
      const expected = this.snapshot.accounts;
      const addresses = contractAddresses(this.snapshot);
      const reader = await ethers.getContractAt(
        "LifecycleFactory",
        this.snapshot.lifecycle.factory,
      );
      const actual = await readAccounts(reader, addresses);
      const mismatches = findMismatches("account", expected, actual);

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

      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);

      expect(relayCode, "code via relay").to.equal(expected);
      expect(consensusNodeCode, "code via consensus node").to.equal(expected);
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

      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);

      expect(relayCode, "code via relay").to.equal(expected);
      expect(consensusNodeCode, "code via consensus node").to.equal(expected);
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

      const relayCode = await ethers.provider.getCode(address);
      const consensusNodeCode = await getCodeOnConsensusNode(address);

      expect(relayCode, "code via relay").to.equal(expected);
      expect(consensusNodeCode, "code via consensus node").to.equal(expected);
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

  describe("Contract lifecycle", function () {
    before(async function () {
      this.oldFactory = await ethers.getContractAt(
        "LifecycleFactory",
        this.snapshot.lifecycle.factory,
      );
    });

    it("should create a child with CREATE at the address the factory's old nonce gives", async function () {
      const factory = this.snapshot.lifecycle.factory;
      const nonce = Number(this.snapshot.accounts[`${factory} nonce`]);
      const expected = ethers.getCreateAddress({ from: factory, nonce });

      const { address } = await createChild(
        this.oldFactory,
        UPDATED_CHILDREN.create,
      );

      expect(
        address,
        `CREATE address does not follow the factory's nonce ${nonce}`,
      ).to.equal(expected);

      this.newChild = address;
    });

    it("should create a child with CREATE2 at the predicted address", async function () {
      const { address, predicted } = await create2Child(
        this.oldFactory,
        UPDATED_CHILDREN.create2,
      );

      expect(
        predicted.factory,
        "factory and JS predict different CREATE2 addresses",
      ).to.equal(predicted.js);
      expect(address, "CREATE2 address differs from the prediction").to.equal(
        predicted.js,
      );
    });

    it("should not create a contract at a CREATE2 address taken before the upgrade", async function () {
      const { id, salt } = this.snapshot.lifecycle.children.create2;
      const status = await create2Again(this.oldFactory, { id, salt });

      expect(status, "CREATE2 to an address already taken succeeded").to.equal(
        0,
      );
    });

    it("should self-destruct a new child the same way as before the upgrade", async function () {
      const expected = this.snapshot.lifecycle.children.destroyed.outcome;
      const { relay, consensusNode } = await destroyChild(
        this.oldFactory,
        UPDATED_CHILDREN.destroyed,
        this.newChild,
      );
      const mismatches = findMismatches("self-destruct", expected, {
        relay,
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should let contracts from before and after the upgrade call each other", async function () {
      const { create, create2 } = this.snapshot.lifecycle.children;
      const newFactory = await deployLifecycleFactory();
      const calls = [
        {
          caller: this.oldFactory,
          child: this.newChild,
          id: UPDATED_CHILDREN.create.id,
        },
        { caller: newFactory, child: create.address, id: BigInt(create.id) },
        { caller: newFactory, child: create2.address, id: BigInt(create2.id) },
      ];
      const mismatches = [];

      for (const { caller, child, id } of calls) {
        const ids = await idOf(caller, child);

        if (ids.relay !== id || ids.consensusNode !== id) {
          const callerAddress = await caller.getAddress();
          mismatches.push(
            `${callerAddress}.idOf(${child}): expected ${id}, relay ${ids.relay}, consensus node ${ids.consensusNode}`,
          );
        }
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the admin key of both SDK-deployed contracts", async function () {
      const { adminKeys } = this.snapshot.lifecycle;
      const mismatches = [];

      for (const [name, contract] of Object.entries(adminKeys)) {
        const adminKey = await readAdminKey(contract.address);

        if (adminKey !== contract.adminKey) {
          mismatches.push(
            `${name} ${contract.address}: expected admin key ${contract.adminKey}, got ${adminKey}`,
          );
        }
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should let the admin key update its contract, and refuse to update the contract without one", async function () {
      const { withKey, withoutKey } = this.snapshot.lifecycle.adminKeys;

      const withKeyStatus = await updateMemo(withKey.contractId, "updated");
      const withoutKeyStatus = await updateMemo(
        withoutKey.contractId,
        "updated",
      );

      expect(withKeyStatus, "update signed by the admin key").to.equal(
        "SUCCESS",
      );
      expect(withoutKeyStatus, "update of the contract without one").to.equal(
        "MODIFYING_IMMUTABLE_CONTRACT",
      );
    });

    it("should keep the balance, nonce and key of the account with a nonzero nonce", async function () {
      const { address, balance, nonce, key } =
        this.snapshot.lifecycle.nonceAccount;
      const actual = await readWalletAccount(address);
      const mismatches = findMismatches(
        "nonce account",
        { balance, nonce },
        { relay: actual.relay, consensusNode: actual.consensusNode },
      );

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(actual.key, "account key").to.equal(key);
    });

    it("should accept the next transaction from that account with the next nonce", async function () {
      const { address, privateKey, nonce } =
        this.snapshot.lifecycle.nonceAccount;
      const wallet = new ethers.Wallet(privateKey, ethers.provider);
      const receipt = await sendTransfer(wallet, Number(nonce));
      const nextNonce = await ethers.provider.getTransactionCount(address);

      expect(receipt.status, "transaction status").to.equal(1);
      expect(nextNonce, "nonce after the transaction").to.equal(
        Number(nonce) + 1,
      );
    });

    it("should keep the balance, nonce and empty key of the hollow account", async function () {
      const { address, balance, nonce, key } =
        this.snapshot.lifecycle.hollowAccount;
      const actual = await readWalletAccount(address);
      const mismatches = findMismatches(
        "hollow account",
        { balance, nonce },
        { relay: actual.relay, consensusNode: actual.consensusNode },
      );

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(actual.key, "hollow account key").to.equal(key);
    });

    it("should complete the hollow account with its first transaction", async function () {
      const { address, privateKey } = this.snapshot.lifecycle.hollowAccount;
      const wallet = new ethers.Wallet(privateKey, ethers.provider);
      const receipt = await sendTransfer(wallet);
      const { relay, key } = await readWalletAccount(address);

      expect(receipt.status, "first transaction status").to.equal(1);
      expect(relay.nonce, "nonce after the first transaction").to.equal("1");
      expect(key, "key after the first transaction").to.equal(
        completedKey(privateKey),
      );
    });

    it("should keep the code, delegation, storage, balance and nonce of the delegated account", async function () {
      const {
        address,
        accountId,
        code,
        slot0,
        delegationAddress,
        balance,
        nonce,
        key,
      } = this.snapshot.lifecycle.delegatedAccount;
      const delegation = await readDelegation(address, accountId);
      const account = await readWalletAccount(address);
      const mismatches = [
        ...findMismatches(
          "delegated account",
          { code, slot0, delegationAddress },
          { current: delegation },
        ),
        ...findMismatches(
          "delegated account",
          { balance, nonce },
          { relay: account.relay, consensusNode: account.consensusNode },
        ),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(account.key, "delegated account key").to.equal(key);
    });

    it("should still run the delegated contract code through the account", async function () {
      const { address, accountId, target } =
        this.snapshot.lifecycle.delegatedAccount;
      const targetContract = await ethers.getContractAt("StoreAndEmit", target);
      const receipt = await storeThroughDelegation(
        targetContract,
        address,
        UPDATED_STORED_VALUE,
      );
      const { slot0 } = await readDelegation(address, accountId);

      expect(receipt.status, "storeAndEmit through the account").to.equal(1);
      expect(receipt.logs[0].address, "event emitted by").to.equal(address);
      expect(BigInt(slot0), "slot 0 of the account").to.equal(
        UPDATED_STORED_VALUE,
      );
    });
  });

  describe("HTS fungible token", function () {
    before(async function () {
      const { manager, token, accounts } = this.snapshot.htsFungible;

      this.tokenManager = await ethers.getContractAt("TokenManager", manager);
      this.token = token;
      this.wallets = Object.fromEntries(
        Object.entries(accounts).map(([name, { privateKey }]) => [
          name,
          new ethers.Wallet(privateKey, ethers.provider),
        ]),
      );
    });

    it("should keep the token info and custom fee", async function () {
      const { info } = this.snapshot.htsFungible;
      const actual = await readTokenInfo(this.token);
      const mismatches = [
        ...findMismatches("token info", info.relay, { relay: actual.relay }),
        ...findMismatches("token info", info.consensusNode, {
          consensusNode: actual.consensusNode,
        }),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the balances, allowances, flags and associations", async function () {
      const { accounts, state } = this.snapshot.htsFungible;
      const addresses = Object.fromEntries(
        Object.entries(accounts).map(([name, { address }]) => [name, address]),
      );
      const actual = await readTokenAccounts(
        this.tokenManager,
        this.token,
        addresses,
        accounts.spender.address,
      );
      const mismatches = findMismatches("token account", state, actual);

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should transfer the old token and charge its custom fee", async function () {
      const { holder, spender } = this.wallets;
      const manager = await this.tokenManager.getAddress();
      const before = await getAccountOnConsensusNode(manager);

      const status = await transfer(
        holder,
        this.token,
        spender.address,
        TRANSFERRED,
      );

      const after = await getAccountOnConsensusNode(manager);
      const { relay, consensusNode } = await readTokenAccounts(
        this.tokenManager,
        this.token,
        { holder: holder.address, spender: spender.address },
        spender.address,
      );
      const expected = {
        "holder balance": String(PAID_OUT - TRANSFERRED),
        "spender balance": String(TRANSFERRED),
      };
      const mismatches = findMismatches("token account", expected, {
        relay,
        consensusNode,
      });

      expect(status, "transfer status").to.equal(1);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(after.balance - before.balance, "fee collected").to.equal(
        BigInt(FEE_TINYBARS) * TINYBAR_TO_WEIBAR_COEF,
      );
    });

    it("should set a new allowance on the old token", async function () {
      const { holder, spender } = this.wallets;
      const receipt = await approve(
        holder,
        this.token,
        spender.address,
        UPDATED_ALLOWANCE,
      );
      const { relay, consensusNode } = await readTokenAccounts(
        this.tokenManager,
        this.token,
        { holder: holder.address },
        spender.address,
      );
      const expected = { "holder allowance": String(UPDATED_ALLOWANCE) };
      const mismatches = findMismatches("token account", expected, {
        relay,
        consensusNode,
      });

      expect(receipt.status, "approve status").to.equal(1);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should let a new account associate with the old token and receive it", async function () {
      const wallet = await createTokenHolder(this.tokenManager, this.token);
      const tx = await this.tokenManager.payOut(
        this.token,
        wallet.address,
        PAID_OUT,
      );
      await tx.wait();

      const { relay, consensusNode } = await readTokenAccounts(
        this.tokenManager,
        this.token,
        { newHolder: wallet.address },
        this.wallets.spender.address,
      );
      const expected = {
        "newHolder associated": "true",
        "newHolder kyc": "true",
        "newHolder balance": String(PAID_OUT),
      };
      const mismatches = findMismatches("token account", expected, {
        relay,
        consensusNode,
      });

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should still refuse transfers from the frozen account", async function () {
      const { frozen, spender } = this.wallets;
      const status = await transfer(frozen, this.token, spender.address, 1);

      expect(status, "transfer from the frozen account").to.equal(0);
    });
  });

  describe("HTS NFT", function () {
    before(async function () {
      const { manager, accounts } = this.snapshot.htsFungible;

      this.tokenManager = await ethers.getContractAt("TokenManager", manager);
      this.nft = this.snapshot.htsNft.token;
      this.wallets = Object.fromEntries(
        Object.entries(accounts).map(([name, { privateKey }]) => [
          name,
          new ethers.Wallet(privateKey, ethers.provider),
        ]),
      );
    });

    it("should keep the NFT info and custom fee", async function () {
      const { info } = this.snapshot.htsNft;
      const actual = await readNftInfo(this.nft);
      const mismatches = [
        ...findMismatches("NFT info", info.relay, { relay: actual.relay }),
        ...findMismatches("NFT info", info.consensusNode, {
          consensusNode: actual.consensusNode,
        }),
      ];

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the owner, approval and metadata of every serial", async function () {
      const expected = this.snapshot.htsNft.serials;
      const actual = await readSerials(this.tokenManager, this.nft, SERIALS);
      const mismatches = findMismatches("serial", expected, actual);

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should keep the NFT balances, approvals for all, flags and associations", async function () {
      const { holder, frozen, spender } = this.wallets;
      const actual = await readNftAccounts(
        this.tokenManager,
        this.nft,
        {
          holder: holder.address,
          frozen: frozen.address,
          spender: spender.address,
        },
        spender.address,
      );
      const mismatches = findMismatches(
        "NFT account",
        this.snapshot.htsNft.accounts,
        actual,
      );

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should let the spender move serial #1 with its single approval, charging the holder the custom fee", async function () {
      const { holder, spender } = this.wallets;
      const manager = await this.tokenManager.getAddress();
      const collectorBefore = await getAccountOnConsensusNode(manager);
      const holderBefore = await getAccountOnConsensusNode(holder.address);

      const status = await transferNft(
        spender,
        this.nft,
        holder.address,
        spender.address,
        1,
      );

      const collectorAfter = await getAccountOnConsensusNode(manager);
      const holderAfter = await getAccountOnConsensusNode(holder.address);
      const fee = BigInt(FEE_TINYBARS) * TINYBAR_TO_WEIBAR_COEF;
      const { relay, consensusNode } = await readSerials(
        this.tokenManager,
        this.nft,
        [1],
      );
      const mismatches = findMismatches(
        "serial",
        { "#1 owner": spender.address },
        { relay, consensusNode },
      );

      expect(status, "transferFrom status").to.equal(1);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
      expect(
        collectorAfter.balance - collectorBefore.balance,
        "fee collected",
      ).to.equal(fee);
      expect(
        holderBefore.balance - holderAfter.balance,
        "fee paid by the holder",
      ).to.equal(fee);
    });

    it("should let the spender move serial #2 with its approval for all", async function () {
      const { holder, spender } = this.wallets;
      const status = await transferNft(
        spender,
        this.nft,
        holder.address,
        spender.address,
        2,
      );
      const { relay, consensusNode } = await readSerials(
        this.tokenManager,
        this.nft,
        [2],
      );
      const mismatches = findMismatches(
        "serial",
        { "#2 owner": spender.address },
        { relay, consensusNode },
      );

      expect(status, "transferFrom status").to.equal(1);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it(`should mint serial #${NEW_SERIAL} with the old supply key`, async function () {
      const minted = await mintNfts(this.tokenManager, this.nft, [NEW_SERIAL]);
      const manager = await this.tokenManager.getAddress();
      const { relay, consensusNode } = await readSerials(
        this.tokenManager,
        this.nft,
        [NEW_SERIAL],
      );
      const expected = {
        [`#${NEW_SERIAL} owner`]: manager,
        [`#${NEW_SERIAL} metadata`]: metadataOf(NEW_SERIAL),
      };
      const mismatches = findMismatches("serial", expected, {
        relay,
        consensusNode,
      });

      expect(minted, "minted serials").to.deep.equal([NEW_SERIAL]);
      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should let a new account associate with the old NFT and receive serial #4", async function () {
      const wallet = await createTokenHolder(this.tokenManager, this.nft);
      const tx = await this.tokenManager.payOutNft(this.nft, wallet.address, 4);
      await tx.wait();

      const { relay, consensusNode } = await readSerials(
        this.tokenManager,
        this.nft,
        [4],
      );
      const mismatches = findMismatches(
        "serial",
        { "#4 owner": wallet.address },
        { relay, consensusNode },
      );

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should still refuse NFT transfers from the frozen account", async function () {
      const { frozen, spender } = this.wallets;
      const status = await transferNft(
        frozen,
        this.nft,
        frozen.address,
        spender.address,
        3,
      );

      expect(status, "transfer from the frozen account").to.equal(0);
    });
  });

  describe("History", function () {
    it("should return the same transaction and receipt for every populate transaction", async function () {
      this.timeout(600_000);

      const { transactions } = this.snapshot.history;
      const mismatches = [];

      for (const [hash, expected] of Object.entries(transactions)) {
        const transaction = await rpc("eth_getTransactionByHash", [hash]);
        const receipt = await rpc("eth_getTransactionReceipt", [hash]);

        mismatches.push(
          ...fieldMismatches(
            `transaction ${hash}`,
            expected.transaction,
            transaction,
          ),
          ...fieldMismatches(`receipt of ${hash}`, expected.receipt, receipt),
        );
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should return the same logs for every contract", async function () {
      const { fromBlock, toBlock, logsByAddress } = this.snapshot.history;
      const mismatches = [];

      for (const [address, expected] of Object.entries(logsByAddress)) {
        const logs = await rpc("eth_getLogs", [
          logFilter(address, fromBlock, toBlock),
        ]);

        mismatches.push(
          ...fieldMismatches(`logs of ${address}`, expected, logs),
        );
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should find old blocks, their logs and their transactions by block hash", async function () {
      this.timeout(600_000);

      const { transactions, blocks } = this.snapshot.history;
      const mismatches = [];

      for (const [blockHash, expected] of Object.entries(blocks)) {
        const block = await rpc("eth_getBlockByHash", [blockHash, false]);
        const logs = await rpc("eth_getLogs", [{ blockHash }]);

        mismatches.push(
          ...fieldMismatches(`block ${blockHash}`, expected.block, block),
          ...fieldMismatches(`logs of block ${blockHash}`, expected.logs, logs),
        );
      }

      for (const { receipt, byBlockIndex } of Object.values(transactions)) {
        const { blockHash, transactionIndex } = receipt;
        const found = await rpc("eth_getTransactionByBlockHashAndIndex", [
          blockHash,
          transactionIndex,
        ]);

        mismatches.push(
          ...fieldMismatches(
            `transaction ${transactionIndex} of block ${blockHash}`,
            byBlockIndex,
            found,
          ),
        );
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });

  // Last: makes 256+ new blocks, so the window holds only blocks from the new version
  describe("BlockHashProbe after the window moves past the upgrade", function () {
    before(async function () {
      const { address, probes } = this.snapshot.blockHashProbe;
      this.blockHashProbe = await ethers.getContractAt(
        "BlockHashProbe",
        address,
      );
      this.upgrade = await findUpgradeBlock(probes.at(-1).number);
    });

    it("should keep the 256-block window once it holds only new blocks", async function () {
      this.timeout(1_800_000);

      await generateBlocksUntil(this.upgrade.number + WINDOW + 4);
      const probe = await runProbe(this.blockHashProbe);

      expect(
        probe.number - WINDOW,
        `the window in block ${probe.number} still reaches the upgrade at block ${this.upgrade.number}`,
      ).to.be.greaterThan(this.upgrade.number);

      const { mismatches } = await checkProbe(probe);

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });

    it("should give every new block in the window a unique hash matching the relay and the mirror node", async function () {
      this.timeout(600_000);

      const current = await ethers.provider.getBlockNumber();
      const blockNumbers = [];

      for (let n = current - WINDOW + 10; n < current; n++) {
        blockNumbers.push(n);
      }

      const mismatches = [];
      const seen = new Map();

      // Batches keep each transaction's call data small
      for (let i = 0; i < blockNumbers.length; i += 100) {
        const batch = blockNumbers.slice(i, i + 100);
        const { number, hashes } = await readHashesInTransaction(
          this.blockHashProbe,
          batch,
        );

        for (const n of batch) {
          const mismatch = await compareWithReported(
            n,
            hashes[n],
            `in block ${number}`,
          );

          if (mismatch) {
            mismatches.push(mismatch);
          }

          if (seen.has(hashes[n])) {
            mismatches.push(
              `blocks ${seen.get(hashes[n])} and ${n} have the same hash ${hashes[n]}`,
            );
          }

          seen.set(hashes[n], n);
        }
      }

      expect(mismatches, mismatches.join("\n")).to.be.empty;
    });
  });
});
