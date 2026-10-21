// SPDX-License-Identifier: Apache-2.0

const { PrivateKey } = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const Async = require("../../../utils/async");
const { MirrorNode } = require("../../../utils/mirror-node");
const {
  createAccountWithDelegation,
  getDelegationAddress,
} = require("../../hip-1340/utils/sdk");
const { delegationIndicatorFor } = require("../../hip-1340/utils/web3");
const { withClient } = require("./consensus-node");

// Stored in the delegated account's own storage (slot 0) through StoreAndEmit, by populate and by verify
const ORIGINAL_STORED_VALUE = 42n;
const UPDATED_STORED_VALUE = 43n;

/** StoreAndEmit (hip-1340): storeAndEmit(value) writes slot 0 and emits the value. */
async function deployDelegationTarget() {
  const factory = await ethers.getContractFactory("StoreAndEmit");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  return contract;
}

/**
 * Creates an account delegated to `targetAddress` (EIP-7702) through the SDK, and waits until the
 * mirror node knows it. The account has no EVM alias, so its address is the long-zero one.
 *
 * @param {string} targetAddress
 * @returns {Promise<{ address: string, accountId: string }>}
 */
async function createDelegatedAccount(targetAddress) {
  const { accountId } = await withClient((client) =>
    createAccountWithDelegation(
      PrivateKey.generateECDSA(),
      targetAddress,
      client,
    ),
  );

  await Async.waitForCondition(
    `mirror node account ${accountId}`,
    () => new MirrorNode().getAccount(accountId.toString()),
    (result) => result?.account != null,
    1_000,
    30,
  );

  const address = ethers.getAddress(`0x${accountId.toEvmAddress()}`);

  return { address, accountId: accountId.toString() };
}

/**
 * Calls storeAndEmit(value) on the delegated account, so the target's code runs in the account.
 *
 * @param {import("ethers").Contract} target
 * @param {string} address the delegated account
 * @param {bigint} value
 * @returns {Promise<import("ethers").TransactionReceipt>}
 */
async function storeThroughDelegation(target, address, value) {
  const account = target.attach(address);
  const tx = await account.storeAndEmit(value);

  return tx.wait();
}

/**
 * The account's code and storage slot 0 through the relay, and its delegation address on the
 * consensus node.
 *
 * @param {string} address
 * @param {string} accountId
 */
async function readDelegation(address, accountId) {
  const code = await ethers.provider.getCode(address);
  const slot0 = await ethers.provider.getStorage(address, 0);
  const delegationAddress = await withClient((client) =>
    getDelegationAddress(accountId, client),
  );

  return { code, slot0, delegationAddress };
}

module.exports = {
  ORIGINAL_STORED_VALUE,
  UPDATED_STORED_VALUE,
  delegationIndicatorFor,
  deployDelegationTarget,
  createDelegatedAccount,
  storeThroughDelegation,
  readDelegation,
};
