// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const {
  callOnConsensusNode,
  getCodeOnConsensusNode,
  getAccountOnConsensusNode,
} = require("./consensus-node");

/**
 * Code, balance (weibars) and nonce of an account through the relay and on the consensus node,
 * as strings so they compare the same way after a snapshot round trip.
 *
 * @param {string} address
 */
async function readAccount(address) {
  const relayCode = await ethers.provider.getCode(address);
  const relayBalance = await ethers.provider.getBalance(address);
  const relayNonce = await ethers.provider.getTransactionCount(address);

  const consensusNodeCode = await getCodeOnConsensusNode(address);
  const { balance, nonce } = await getAccountOnConsensusNode(address);

  return {
    relay: {
      code: relayCode,
      balance: relayBalance.toString(),
      nonce: relayNonce.toString(),
    },
    consensusNode: {
      code: consensusNodeCode,
      balance: balance.toString(),
      nonce: nonce.toString(),
    },
  };
}

/**
 * EXTCODEHASH of each account, read by a contract on both paths.
 *
 * @param {import("ethers").Contract} reader a LifecycleFactory
 * @param {string[]} addresses
 */
async function readCodeHashes(reader, addresses) {
  const address = await reader.getAddress();
  const data = reader.interface.encodeFunctionData("codeHashes", [addresses]);
  const decode = (result) =>
    reader.interface.decodeFunctionResult("codeHashes", result)[0];

  const relay = await ethers.provider.call({ to: address, data });
  const consensusNode = await callOnConsensusNode(address, data);

  return { relay: decode(relay), consensusNode: decode(consensusNode) };
}

/**
 * Code, code hash, balance and nonce of every account, keyed "<address> <field>".
 *
 * @param {import("ethers").Contract} reader a LifecycleFactory
 * @param {string[]} addresses
 * @returns {Promise<{ relay: Record<string, string>, consensusNode: Record<string, string> }>}
 */
async function readAccounts(reader, addresses) {
  const codeHashes = await readCodeHashes(reader, addresses);
  const relay = {};
  const consensusNode = {};

  for (const [i, address] of addresses.entries()) {
    const account = await readAccount(address);

    for (const [field, value] of Object.entries(account.relay)) {
      relay[`${address} ${field}`] = value;
    }

    for (const [field, value] of Object.entries(account.consensusNode)) {
      consensusNode[`${address} ${field}`] = value;
    }

    relay[`${address} codeHash`] = codeHashes.relay[i];
    consensusNode[`${address} codeHash`] = codeHashes.consensusNode[i];
  }

  return { relay, consensusNode };
}

/**
 * Accounts with no code, or whose EXTCODEHASH is not the keccak256 of their code.
 *
 * @param {Record<string, string>} accounts as returned by readAccounts
 * @param {string[]} addresses
 * @returns {string[]}
 */
function codeMismatches(accounts, addresses) {
  const mismatches = [];

  for (const address of addresses) {
    const code = accounts[`${address} code`];
    const codeHash = accounts[`${address} codeHash`];

    if (code === "0x") {
      mismatches.push(`${address} has no code`);
    } else if (ethers.keccak256(code) !== codeHash) {
      mismatches.push(
        `${address} EXTCODEHASH ${codeHash} is not the hash of its code`,
      );
    }
  }

  return mismatches;
}

/**
 * Every contract populate deployed or created.
 *
 * @param {object} snapshot
 * @returns {string[]}
 */
function contractAddresses(snapshot) {
  const { factory, children, adminKeys } = snapshot.lifecycle;

  return [
    snapshot.valueStorage.address,
    snapshot.collectionStorage.address,
    snapshot.largeStorage.address,
    snapshot.blockHashProbe.address,
    factory,
    ...Object.values(children).map((child) => child.address),
    ...Object.values(adminKeys).map((contract) => contract.address),
  ];
}

module.exports = {
  readAccount,
  readAccounts,
  codeMismatches,
  contractAddresses,
};
