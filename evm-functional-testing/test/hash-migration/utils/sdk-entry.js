// SPDX-License-Identifier: Apache-2.0

const {
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TransferTransaction,
} = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const Utils = require("../../../utils/utils");
const Async = require("../../../utils/async");
const { MirrorNode } = require("../../../utils/mirror-node");
const { withClient, executeOnConsensusNode } = require("./consensus-node");

// Written by setUnsigned through the SDK after the upgrade: each differs from UPDATED_VALUES
const SDK_UNSIGNED_VALUES = {
  boolValue: true,
  uint8Value: 0x5a,
  uint16Value: 0x5a5a,
  uint32Value: 0x5a5a5a5a,
  uint64Value: 0x5a5a5a5a5a5a5a5an,
  uint128Value: BigInt("0x" + "5a".repeat(16)),
  uint256Value: BigInt("0x" + "5a".repeat(32)),
};
// Id of the Child the old factory creates through the SDK
const SDK_CHILD_ID = 31n;
// Moved through the SDK: ERC20 units and HTS fungible token units
const SDK_ERC20_TRANSFERRED = 10n;
const SDK_HTS_TRANSFERRED = 10;
// The mirror node imports a transaction a few seconds after consensus: check every second, up to 30 s
const MIRROR_NODE_STEP_MS = 1_000;
const MIRROR_NODE_ATTEMPTS = 30;

/**
 * Waits until the mirror node has the transaction, so the relay's reads include it. The SDK returns
 * once the consensus node has the transaction, before the mirror node imports it.
 *
 * @param {import("@hiero-ledger/sdk").TransactionRecord} record
 * @returns {Promise<string>} the receipt status, e.g. SUCCESS
 */
async function waitForMirrorNode(record) {
  const timestamp = record.consensusTimestamp.toString();

  await Async.waitForCondition(
    `mirror node transaction at ${timestamp}`,
    () => new MirrorNode().getTransactionByTimestamp(timestamp),
    (result) => result?.transactions?.length > 0,
    MIRROR_NODE_STEP_MS,
    MIRROR_NODE_ATTEMPTS,
  );

  return record.receipt.status.toString();
}

/**
 * Calls `name(args)` on the contract as a ContractExecuteTransaction sent by the operator.
 *
 * @returns {Promise<string>} the receipt status, e.g. SUCCESS
 */
async function executeWithSdk(contract, name, args) {
  const address = await contract.getAddress();
  const data = contract.interface.encodeFunctionData(name, args);

  const record = await executeOnConsensusNode(address, data);

  return waitForMirrorNode(record);
}

/**
 * Has the factory create a Child through the SDK.
 *
 * @returns {Promise<{ status: string, expected: string }>} the status, and the address the
 * factory's nonce gives
 */
async function createChildWithSdk(factory) {
  const factoryAddress = await factory.getAddress();
  const nonce = await ethers.provider.getTransactionCount(factoryAddress);
  const expected = ethers.getCreateAddress({ from: factoryAddress, nonce });

  const status = await executeWithSdk(factory, "create", [SDK_CHILD_ID]);

  return { status, expected };
}

/**
 * Runs `send(client, accountId, key)` with a client paid by the account of the private key.
 *
 * @param {string} privateKey 0x-prefixed ECDSA key
 * @returns {Promise<string>} the receipt status
 */
async function sendAs(privateKey, send) {
  const wallet = new ethers.Wallet(privateKey);
  const accountId = await withClient((client) =>
    Utils.getAccountId(wallet.address, client),
  );
  const key = PrivateKey.fromStringECDSA(privateKey);
  const client = await Utils.createSDKClient(accountId, key.toStringDer());

  try {
    const response = await send(client, accountId, key);
    const record = await response.getRecord(client);

    return waitForMirrorNode(record);
  } finally {
    client.close();
  }
}

/**
 * Transfers HTS token units natively (TransferTransaction, no EVM involved), paid and signed by
 * the sender.
 *
 * @param {string} token
 * @param {string} senderPrivateKey 0x-prefixed ECDSA key
 * @param {string} receiver EVM address
 * @param {number} amount
 * @returns {Promise<string>} the receipt status
 */
async function transferTokenWithSdk(token, senderPrivateKey, receiver, amount) {
  const receiverId = await withClient((client) =>
    Utils.getAccountId(receiver, client),
  );
  const tokenId = TokenId.fromSolidityAddress(token);

  return sendAs(senderPrivateKey, (client, senderId) =>
    new TransferTransaction()
      .addTokenTransfer(tokenId, senderId, -amount)
      .addTokenTransfer(tokenId, receiverId, amount)
      .execute(client),
  );
}

/**
 * Associates the account with the token natively (TokenAssociateTransaction), paid and signed by
 * the account.
 *
 * @param {string} privateKey 0x-prefixed ECDSA key
 * @param {string} token
 * @returns {Promise<string>} the receipt status
 */
async function associateWithSdk(privateKey, token) {
  const tokenId = TokenId.fromSolidityAddress(token);

  return sendAs(privateKey, async (client, accountId, key) => {
    const transaction = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client);
    const signed = await transaction.sign(key);

    return signed.execute(client);
  });
}

module.exports = {
  SDK_UNSIGNED_VALUES,
  SDK_CHILD_ID,
  SDK_ERC20_TRANSFERRED,
  SDK_HTS_TRANSFERRED,
  executeWithSdk,
  createChildWithSdk,
  transferTokenWithSdk,
  associateWithSdk,
};
