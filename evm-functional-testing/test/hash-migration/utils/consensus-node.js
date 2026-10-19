// SPDX-License-Identifier: Apache-2.0

const {
  Client,
  ContractByteCodeQuery,
  ContractCallQuery,
  ContractId,
  Hbar,
} = require("@hiero-ledger/sdk");
const hre = require("hardhat");
const { ethers } = hre;

const QUERY_GAS = 1_000_000;

// Reads that go straight to the consensus node through the Hiero SDK. The relay answers
// eth_call and eth_getStorageAt from the mirror node's copy of the state, so only these
// reads see the consensus node's own (re-hashed) state.
async function withClient(run) {
  const { networkNode, operatorId, operatorKey } = hre.network.config.sdkClient;
  const client = Client.forNetwork(networkNode).setOperator(
    operatorId,
    operatorKey,
  );
  try {
    return await run(client);
  } finally {
    client.close();
  }
}

/**
 * Runs a read-only call on the consensus node (ContractCallQuery).
 *
 * @param {string} address contract EVM address
 * @param {string} data ABI-encoded call data
 * @returns {Promise<string>} ABI-encoded return data
 */
function callOnConsensusNode(address, data) {
  return withClient(async (client) => {
    const result = await new ContractCallQuery()
      .setContractId(ContractId.fromEvmAddress(0, 0, address))
      .setGas(QUERY_GAS)
      .setFunctionParameters(Buffer.from(data.slice(2), "hex"))
      .setQueryPayment(new Hbar(1))
      .execute(client);
    return ethers.hexlify(result.asBytes());
  });
}

/**
 * Reads a contract's runtime bytecode from the consensus node.
 *
 * @param {string} address contract EVM address
 * @returns {Promise<string>}
 */
function getCodeOnConsensusNode(address) {
  return withClient(async (client) => {
    const code = await new ContractByteCodeQuery()
      .setContractId(ContractId.fromEvmAddress(0, 0, address))
      .execute(client);
    return ethers.hexlify(code);
  });
}

module.exports = {
  callOnConsensusNode,
  getCodeOnConsensusNode,
};
