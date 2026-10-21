// SPDX-License-Identifier: Apache-2.0

const { KeyList, PrivateKey } = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const { ONE_HBAR } = require("../../../utils/constants");

// A hollow account has no key until it signs its first transaction
const HOLLOW_KEY = new KeyList().toString();

/**
 * Sends 1 HBAR to a new EVM address. Hedera creates a hollow account for it: an account with
 * no key yet.
 *
 * @returns {Promise<import("ethers").Wallet>} the account's wallet, connected to the relay
 */
async function createHollowAccount() {
  const [signer] = await ethers.getSigners();
  const wallet = ethers.Wallet.createRandom(ethers.provider);

  const tx = await signer.sendTransaction({
    to: wallet.address,
    value: ONE_HBAR,
  });
  await tx.wait();

  return wallet;
}

/**
 * The key the account gets once it signs its first transaction.
 *
 * @param {string} privateKey
 * @returns {string}
 */
function completedKey(privateKey) {
  return PrivateKey.fromStringECDSA(privateKey).publicKey.toString();
}

module.exports = {
  HOLLOW_KEY,
  createHollowAccount,
  completedKey,
};
