// SPDX-License-Identifier: Apache-2.0

const { Hbar } = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const Async = require("../../../utils/async");
const { MirrorNode } = require("../../../utils/mirror-node");
const { createEcdsaAliasedAccount } = require("../../hip-1340/utils/sdk");
const { withClient, getAccountOnConsensusNode } = require("./consensus-node");
const { TRANSFER_GAS } = require("./blocks");

// Transactions the account sends in populate, so its nonce is above zero
const SENT_TRANSFERS = 3;
const INITIAL_BALANCE = new Hbar(10);

/**
 * Creates a dedicated account with an EVM address, and waits until the mirror node knows it:
 * until then the relay rejects its transactions.
 *
 * @returns {Promise<import("ethers").Wallet>} connected to the relay
 */
async function createWalletAccount() {
  const [wallet] = await withClient((client) =>
    createEcdsaAliasedAccount(client, ethers.provider, INITIAL_BALANCE),
  );

  await Async.waitForCondition(
    `mirror node account ${wallet.address}`,
    () => new MirrorNode().getAccount(wallet.address),
    (result) => result?.account != null,
    1_000,
    30,
  );

  return wallet;
}

/**
 * Overrides for a transaction sent by a plain ethers wallet. Such a wallet derives a gas price below
 * the relay's minimum, so the relay's gas price is used.
 *
 * @param {number} gasLimit
 * @returns {Promise<{ gasPrice: bigint, gasLimit: number }>}
 */
async function walletOverrides(gasLimit) {
  const { gasPrice } = await ethers.provider.getFeeData();

  return { gasPrice, gasLimit };
}

/**
 * Sends a zero-value transfer to itself and waits for it.
 *
 * @param {import("ethers").Wallet} wallet
 * @param {number} [nonce] defaults to the network's next nonce
 * @returns {Promise<import("ethers").TransactionReceipt>}
 */
async function sendTransfer(wallet, nonce) {
  const overrides = await walletOverrides(TRANSFER_GAS);
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: 0,
    nonce,
    ...overrides,
  });

  return tx.wait();
}

/**
 * Balance (weibars) and nonce through the relay and on the consensus node, plus the account key
 * on the consensus node, as strings so they compare the same way after a snapshot round trip.
 *
 * @param {string} address
 */
async function readWalletAccount(address) {
  const relayBalance = await ethers.provider.getBalance(address);
  const relayNonce = await ethers.provider.getTransactionCount(address);
  const { balance, nonce, key } = await getAccountOnConsensusNode(address);

  return {
    relay: { balance: relayBalance.toString(), nonce: relayNonce.toString() },
    consensusNode: { balance: balance.toString(), nonce: nonce.toString() },
    key,
  };
}

module.exports = {
  SENT_TRANSFERS,
  walletOverrides,
  createWalletAccount,
  sendTransfer,
  readWalletAccount,
};
