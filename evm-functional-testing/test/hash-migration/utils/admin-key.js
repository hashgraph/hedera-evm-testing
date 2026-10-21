// SPDX-License-Identifier: Apache-2.0

const {
  ContractCreateFlow,
  ContractFunctionParameters,
  ContractUpdateTransaction,
  ContractId,
  PrivateKey,
} = require("@hiero-ledger/sdk");
const hre = require("hardhat");
const { ethers } = hre;
const Utils = require("../../../utils/utils");
const { GAS_LIMIT_1_000_000 } = require("../../../utils/constants");
const { withClient } = require("./consensus-node");

// Ids of the Child contracts deployed through the SDK, with and without an admin key
const ADMIN_KEY_CHILDREN = { withKey: 21, withoutKey: 22 };

/** The operator's public key, used as the admin key. */
function operatorPublicKey() {
  const { operatorKey } = hre.network.config.sdkClient;

  return PrivateKey.fromStringDer(operatorKey).publicKey.toString();
}

/**
 * Deploys a Child through the SDK. Only the SDK can set an admin key; without one the
 * contract can never be updated.
 *
 * @param {number} id
 * @param {boolean} withAdminKey
 * @returns {Promise<{ address: string, contractId: string }>}
 */
function deployWithSdk(id, withAdminKey) {
  return withClient(async (client) => {
    const { bytecode } = await hre.artifacts.readArtifact("Child");
    const flow = new ContractCreateFlow()
      .setBytecode(bytecode)
      .setGas(GAS_LIMIT_1_000_000.gasLimit)
      .setConstructorParameters(
        new ContractFunctionParameters().addUint256(id),
      );

    if (withAdminKey) {
      flow.setAdminKey(client.operatorPublicKey);
    }

    const response = await flow.execute(client);
    const { contractId } = await response.getReceipt(client);
    const address = ethers.getAddress(`0x${contractId.toEvmAddress()}`);

    return { address, contractId: contractId.toString() };
  });
}

/**
 * The contract's admin key on the consensus node: a public key, or the contract's own id when
 * it was deployed without one.
 *
 * @param {string} address
 * @returns {Promise<string>}
 */
function readAdminKey(address) {
  return withClient(async (client) => {
    const info = await Utils.getContractInfo(address, client);

    return info.adminKey.toString();
  });
}

/**
 * Tries to change the contract's memo, signed by the operator.
 *
 * @param {string} contractId
 * @param {string} memo
 * @returns {Promise<string>} the status, e.g. SUCCESS or MODIFYING_IMMUTABLE_CONTRACT
 */
function updateMemo(contractId, memo) {
  return withClient(async (client) => {
    const update = new ContractUpdateTransaction()
      .setContractId(ContractId.fromString(contractId))
      .setContractMemo(memo);

    // A refused update throws, either at precheck or when reading the receipt
    try {
      const response = await update.execute(client);
      const receipt = await response.getReceipt(client);

      return receipt.status.toString();
    } catch (error) {
      return error.status.toString();
    }
  });
}

module.exports = {
  ADMIN_KEY_CHILDREN,
  operatorPublicKey,
  deployWithSdk,
  readAdminKey,
  updateMemo,
};
