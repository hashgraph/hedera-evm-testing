// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { expect } = require("chai");
const Constants = require("../../../utils/constants");
const { isEthNetwork } = require("../../hip-1340/utils/web3");

/**
 * Converts a tinybar amount to the wei-scale value used by JSON-RPC on every network.
 * Hedera's value granularity is 1 tinybar == 1e10 weibar, so any amount built with this
 * helper asserts exactly on both wei (Ethereum) and tinybar (Hedera) chains.
 *
 * @param {number | bigint} tinybars
 * @returns {bigint} value in wei/weibar
 */
function tinybarValue(tinybars) {
  return BigInt(tinybars) * Constants.TINYBAR_TO_WEIBAR_COEF;
}

/**
 * Whether the suite submits transactions at a zero gas price on Hedera.
 *
 * Driven by the EVM_ZERO_GAS_PRICE flag, which is also read by `hardhat.config.js` so
 * the solo network's default gas price matches. This single switch keeps the whole
 * suite consistent: both transactions that inherit the network default and those that
 * set `gasPrice: callGasPrice()` explicitly run at the same price.
 *
 * @returns {boolean}
 */
function zeroGasPriceEnabled() {
  return process.env.EVM_ZERO_GAS_PRICE === "true";
}

/**
 * Legacy gas price for raw transactions on Hedera, `undefined` on Ethereum networks
 * (lets ethers populate fee data). On Hedera this is zero when EVM_ZERO_GAS_PRICE is
 * set, otherwise the relay-compatible fixed price. Kept in lock-step with the solo
 * network default in `hardhat.config.js` so explicit and inherited gas prices agree.
 *
 * @returns {bigint | undefined}
 */
function callGasPrice() {
  if (isEthNetwork()) return undefined;
  return zeroGasPriceEnabled() ? 0n : ethers.parseUnits("710", "gwei");
}

/**
 * A legacy gas price of exactly zero.
 *
 * On Hedera a zero-gas-price transaction is accepted when the network runs in
 * zero-gas-price mode: the relay's paymaster wildcard whitelist lets it through the
 * minimum-gas-price precheck (see local/relay-zero-gas-values.yaml) and the consensus
 * node charges no fee (fees.simpleFeesAreFree=true) — nothing is relay-subsidized.
 * Ethereum reference EVMs (geth, Hardhat) reject any transaction whose gas price is
 * below the current block base fee. The zero-gas-price suite asserts both sides.
 */
const ZERO_GAS_PRICE = 0n;

/**
 * Converts a wei-scale RPC value to the denomination observed inside the EVM
 * (`msg.value`, `address(this).balance`). Hedera's EVM denominates values in
 * tinybars (1 tinybar == 1e10 weibar), Ethereum EVMs in wei.
 *
 * @param {bigint} wei - wei/weibar amount as sent or read over JSON-RPC
 * @returns {bigint} the same amount as seen by contract code
 */
function evmScale(wei) {
  return isEthNetwork() ? wei : wei / Constants.TINYBAR_TO_WEIBAR_COEF;
}

/**
 * CREATE address derived from deployer address and nonce.
 *
 * @param {string} deployer
 * @param {number | bigint} nonce
 * @returns {string}
 */
function expectedCreateAddress(deployer, nonce) {
  return ethers.getCreateAddress({ from: deployer, nonce });
}

/**
 * EIP-1014 CREATE2 address derived from deployer address, salt and full init code.
 *
 * @param {string} deployer
 * @param {string} salt - 32-byte hex string
 * @param {string} initcode - hex string of creation code incl. constructor args
 * @returns {string}
 */
function expectedCreate2Address(deployer, salt, initcode) {
  return ethers.getCreate2Address(deployer, salt, ethers.keccak256(initcode));
}

/**
 * Full init code (creation bytecode + ABI-encoded constructor args) of SimpleChild.
 *
 * @param {number | bigint} seed
 * @returns {Promise<string>} hex string
 */
async function childInitCode(seed) {
  const child = await ethers.getContractFactory(Constants.Contract.SimpleChild);
  return ethers.concat([child.bytecode, child.interface.encodeDeploy([seed])]);
}

/**
 * Sends a raw contract-creation transaction (bypasses ethers' client-side
 * constructor checks, e.g. value against a non-payable constructor).
 *
 * @param {string} name - contract name
 * @param {unknown[]} args - constructor arguments
 * @param {{value?: bigint, gasLimit?: number}} [overrides]
 * @returns {Promise<import('ethers').TransactionResponse>}
 */
async function sendRawDeploy(name, args = [], { value = 0n, gasLimit = 1_000_000 } = {}) {
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory(name);
  const data = ethers.concat([factory.bytecode, factory.interface.encodeDeploy(args)]);
  return deployer.sendTransaction({
    data,
    value,
    gasLimit,
    gasPrice: callGasPrice(),
  });
}

/**
 * Asserts that deploying `name` with `args`/`overrides` is rejected and that no
 * code ends up at the would-be CREATE address.
 *
 * @param {string} name - contract name
 * @param {unknown[]} args - constructor arguments
 * @param {{value?: bigint, gasLimit?: number}} [overrides]
 */
async function deployRevertsWithoutCode(name, args = [], overrides = {}) {
  const [deployer] = await ethers.getSigners();
  const predicted = expectedCreateAddress(deployer.address, await deployer.getNonce());
  await expect(
    sendRawDeploy(name, args, overrides).then((tx) => tx.wait()),
  ).to.be.rejected;
  expect(await ethers.provider.getCode(predicted)).to.equal("0x");
}

/**
 * Extracts the deployed child address from an EthValidationFactory transaction's Deployed event.
 *
 * @param {import('ethers').Contract} factory
 * @param {import('ethers').TransactionReceipt} receipt
 * @returns {string}
 */
function deployedAddress(factory, receipt) {
  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "Deployed");
  expect(event, "Deployed event not found in receipt").to.exist;
  return event.args.addr;
}

module.exports = {
  tinybarValue,
  zeroGasPriceEnabled,
  callGasPrice,
  ZERO_GAS_PRICE,
  evmScale,
  expectedCreateAddress,
  expectedCreate2Address,
  childInitCode,
  sendRawDeploy,
  deployRevertsWithoutCode,
  deployedAddress,
};
