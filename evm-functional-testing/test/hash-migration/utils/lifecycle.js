// SPDX-License-Identifier: Apache-2.0

const hre = require("hardhat");
const { ethers } = hre;
const { callOnConsensusNode } = require("./consensus-node");
const { readAccount } = require("./accounts");
const {
  ONE_HBAR,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_5_000_000,
} = require("../../../utils/constants");
const { waitForReceipt } = require("./network");

// Children created by populate and by verify. Each CREATE2 child needs its own salt.
const ORIGINAL_CHILDREN = {
  create: { id: 1n },
  create2: { id: 2n, salt: ethers.id("populate-create2") },
  destroyed: { id: 3n, salt: ethers.id("populate-destroyed") },
};
const UPDATED_CHILDREN = {
  create: { id: 11n },
  create2: { id: 12n, salt: ethers.id("verify-create2") },
  destroyed: { id: 13n, salt: ethers.id("verify-destroyed") },
};

async function deployLifecycleFactory() {
  const factory = await ethers.getContractFactory("LifecycleFactory");
  const contract = await factory.deploy(GAS_LIMIT_5_000_000);
  await contract.waitForDeployment();

  return contract;
}

function childFrom(factory, receipt) {
  const event = receipt.logs
    .map((log) => factory.interface.parseLog(log))
    .find((parsed) => parsed?.name === "ChildCreated");

  return event.args.child;
}

/**
 * Creates a child with CREATE. Its address must follow from the factory's nonce.
 *
 * @returns {Promise<{ address: string, expected: string }>}
 */
async function createChild(factory, { id }) {
  const factoryAddress = await factory.getAddress();
  const nonce = await ethers.provider.getTransactionCount(factoryAddress);
  const expected = ethers.getCreateAddress({ from: factoryAddress, nonce });

  const tx = await factory.create(id, GAS_LIMIT_1_000_000);
  const receipt = await waitForReceipt(tx);

  return { address: childFrom(factory, receipt), expected };
}

/**
 * The CREATE2 address computed in JS and by the factory itself.
 *
 * @returns {Promise<{ js: string, factory: string }>}
 */
async function predictCreate2(factory, { id, salt }) {
  const factoryAddress = await factory.getAddress();
  const { bytecode } = await hre.artifacts.readArtifact("Child");
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256"],
    [id],
  );
  const initCodeHash = ethers.keccak256(
    ethers.concat([bytecode, constructorArgs]),
  );

  const js = ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
  const predicted = await factory.predict(id, salt);

  return { js, factory: predicted };
}

/**
 * Creates a child with CREATE2. Its address must match both predictions.
 *
 * @returns {Promise<{ address: string, predicted: { js: string, factory: string } }>}
 */
async function create2Child(factory, child) {
  const predicted = await predictCreate2(factory, child);

  const tx = await factory.create2(child.id, child.salt, GAS_LIMIT_1_000_000);
  const receipt = await waitForReceipt(tx);

  return { address: childFrom(factory, receipt), predicted };
}

/**
 * Sends a CREATE2 that reuses an existing child's salt and id, so its address is already taken.
 *
 * @returns {Promise<number>} the receipt status
 */
async function create2Again(factory, { id, salt }) {
  // Reverts and uses up all the gas it was given, so the gas limit is set explicitly
  const tx = await factory.create2(id, salt, GAS_LIMIT_1_000_000);
  const receipt = await waitForReceipt(tx, { allowRevert: true });

  return receipt.status;
}

/** What a self-destruct left behind, compared as strings like the snapshot. */
function destroyOutcome(destroyed, before, after) {
  const recipientGain = BigInt(after.balance) - BigInt(before.balance);

  return {
    codeKept: String(destroyed.code !== "0x"),
    balance: destroyed.balance,
    recipientGain: recipientGain.toString(),
  };
}

/**
 * Creates a child with CREATE2, funds it, then self-destructs it in a later transaction, sending
 * its balance to `recipient`. Returns what the self-destruct left behind, through both sources.
 *
 * @param {string} recipient a contract that accepts HBAR
 * @returns {Promise<{ address: string, relay: object, consensusNode: object }>}
 */
async function destroyChild(factory, child, recipient) {
  const [signer] = await ethers.getSigners();
  const { address } = await create2Child(factory, child);

  const funding = await signer.sendTransaction({
    to: address,
    value: ONE_HBAR,
    ...GAS_LIMIT_1_000_000,
  });
  await waitForReceipt(funding);

  const before = await readAccount(recipient);
  const contract = await ethers.getContractAt("Child", address);
  const tx = await contract.destroy(recipient, GAS_LIMIT_1_000_000);
  await waitForReceipt(tx);

  const destroyed = await readAccount(address);
  const after = await readAccount(recipient);

  return {
    address,
    relay: destroyOutcome(destroyed.relay, before.relay, after.relay),
    consensusNode: destroyOutcome(
      destroyed.consensusNode,
      before.consensusNode,
      after.consensusNode,
    ),
  };
}

/**
 * What `caller.idOf(child)` returns through the relay and on the consensus node.
 *
 * @returns {Promise<{ relay: bigint, consensusNode: bigint }>}
 */
async function idOf(caller, child) {
  const address = await caller.getAddress();
  const data = caller.interface.encodeFunctionData("idOf", [child]);
  const decode = (result) =>
    caller.interface.decodeFunctionResult("idOf", result)[0];

  const relay = await ethers.provider.call({ to: address, data });
  const consensusNode = await callOnConsensusNode(address, data);

  return { relay: decode(relay), consensusNode: decode(consensusNode) };
}

module.exports = {
  ORIGINAL_CHILDREN,
  UPDATED_CHILDREN,
  deployLifecycleFactory,
  createChild,
  create2Child,
  create2Again,
  destroyChild,
  idOf,
};
