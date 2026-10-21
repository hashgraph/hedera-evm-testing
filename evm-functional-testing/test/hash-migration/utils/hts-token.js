// SPDX-License-Identifier: Apache-2.0

const { TokenId, TokenInfoQuery } = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const Utils = require("../../../utils/utils");
const Constants = require("../../../utils/constants");
const { withClient, callOnConsensusNode } = require("./consensus-node");
const { walletOverrides, createWalletAccount } = require("./wallet-account");

const ERC20 =
  "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata";

// In the token's smallest unit (2 decimals)
const INITIAL_SUPPLY = 1_000_000;
const PAID_OUT = 1_000;
const ALLOWANCE = 250;
const UPDATED_ALLOWANCE = 500;
const TRANSFERRED = 100;
// Charged in HBAR on every transfer that is not from the treasury: 0.1 HBAR
const FEE_TINYBARS = 10_000_000;
// What TokenManager.accountStates returns for each account, in order
const ACCOUNT_FIELDS = ["balance", "allowance", "frozen", "kyc"];
// HTS calls from a wallet (associate, approve, transfer) use ~730k gas
const HTS_GAS = Constants.GAS_LIMIT_1_000_000.gasLimit;

async function deployTokenManager() {
  const factory = await ethers.getContractFactory("TokenManager");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  return contract;
}

/**
 * Creates the fungible token through the manager, which becomes its treasury and holds its keys.
 *
 * @returns {Promise<string>} the token address
 */
async function createFungibleToken(manager) {
  const tx = await manager.createFungibleToken(INITIAL_SUPPLY, FEE_TINYBARS, {
    value: Utils.createTokenCost,
    ...Constants.GAS_LIMIT_1_000_000,
  });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => manager.interface.parseLog(log))
    .find((parsed) => parsed?.name === "TokenCreated");

  return event.args.token;
}

/** The token as an ERC20 contract, sending from `runner`. */
function erc20(token, runner) {
  return ethers.getContractAt(ERC20, token, runner);
}

/** Associates the wallet with the token (HRC-719), so it can hold it. */
async function associate(wallet, token) {
  const hrc719 = await ethers.getContractAt(
    Constants.Contract.IHRC719TokenFacade,
    token,
    wallet,
  );
  const overrides = await walletOverrides(HTS_GAS);
  const tx = await hrc719.associate(overrides);

  return tx.wait();
}

/**
 * Sends a token transfer from the wallet.
 *
 * @returns {Promise<number>} the receipt status: 0 when the transfer is refused
 */
async function transfer(wallet, token, receiver, amount) {
  const contract = await erc20(token, wallet);
  const overrides = await walletOverrides(HTS_GAS);
  const tx = await contract.transfer(receiver, amount, overrides);
  const receipt = await tx.wait().catch((error) => error.receipt);

  return receipt.status;
}

async function approve(wallet, token, spender, amount) {
  const contract = await erc20(token, wallet);
  const overrides = await walletOverrides(HTS_GAS);
  const tx = await contract.approve(spender, amount, overrides);

  return tx.wait();
}

/**
 * Creates a wallet, associates it with the token and has the manager grant it KYC, so it can
 * receive the token.
 */
async function createTokenHolder(manager, token) {
  const wallet = await createWalletAccount();
  await associate(wallet, token);

  const tx = await manager.grantKyc(token, wallet.address);
  await tx.wait();

  return wallet;
}

/**
 * Three accounts: `holder` holds tokens and gave `spender` an allowance; `frozen` holds tokens and
 * was then frozen. All are associated and have KYC.
 *
 * @returns {Promise<{ holder: import("ethers").Wallet, frozen: import("ethers").Wallet, spender: import("ethers").Wallet }>}
 */
async function setUpAccounts(manager, token) {
  const holder = await createTokenHolder(manager, token);
  const frozen = await createTokenHolder(manager, token);
  const spender = await createTokenHolder(manager, token);

  for (const wallet of [holder, frozen]) {
    const tx = await manager.payOut(token, wallet.address, PAID_OUT);
    await tx.wait();
  }

  const freezeTx = await manager.freeze(token, frozen.address);
  await freezeTx.wait();
  await approve(holder, token, spender.address, ALLOWANCE);

  return { holder, frozen, spender };
}

/**
 * Name, symbol, decimals and total supply through the relay; the same plus treasury, keys, custom
 * fee and default flags on the consensus node. Values are strings, like the snapshot.
 */
async function readTokenInfo(token) {
  const contract = await erc20(token, ethers.provider);
  const name = await contract.name();
  const symbol = await contract.symbol();
  const decimals = await contract.decimals();
  const totalSupply = await contract.totalSupply();

  const info = await withClient((client) =>
    new TokenInfoQuery()
      .setTokenId(TokenId.fromSolidityAddress(token))
      .execute(client),
  );
  const [fee] = info.customFees;

  return {
    relay: {
      name,
      symbol,
      decimals: decimals.toString(),
      totalSupply: totalSupply.toString(),
    },
    consensusNode: {
      name: info.name,
      symbol: info.symbol,
      decimals: info.decimals.toString(),
      totalSupply: info.totalSupply.toString(),
      treasury: info.treasuryAccountId.toString(),
      adminKey: info.adminKey.toString(),
      kycKey: info.kycKey.toString(),
      freezeKey: info.freezeKey.toString(),
      supplyKey: info.supplyKey.toString(),
      feeScheduleKey: info.feeScheduleKey.toString(),
      defaultFreezeStatus: String(info.defaultFreezeStatus),
      defaultKycStatus: String(info.defaultKycStatus),
      customFeeCount: String(info.customFees.length),
      customFeeAmount: fee.amount.toString(),
      customFeeToken: String(fee.denominatingTokenId),
      customFeeCollector: fee.feeCollectorAccountId.toString(),
    },
  };
}

/**
 * Balance, allowance to `spender`, freeze flag, KYC flag and association of each account, keyed
 * "<name> <field>", through the relay and on the consensus node.
 *
 * @param {Record<string, string>} accounts name -> address
 */
async function readTokenAccounts(manager, token, accounts, spender) {
  const managerAddress = await manager.getAddress();
  const addresses = Object.values(accounts);
  const data = manager.interface.encodeFunctionData("accountStates", [
    token,
    addresses,
    spender,
  ]);
  const decode = (result) =>
    manager.interface.decodeFunctionResult("accountStates", result);

  const relayResult = await ethers.provider.call({ to: managerAddress, data });
  const consensusNodeResult = await callOnConsensusNode(managerAddress, data);
  const relayStates = decode(relayResult);
  const consensusNodeStates = decode(consensusNodeResult);

  const relay = {};
  const consensusNode = {};

  for (const [i, name] of Object.keys(accounts).entries()) {
    const address = accounts[name];

    for (const [index, field] of ACCOUNT_FIELDS.entries()) {
      relay[`${name} ${field}`] = relayStates[index][i].toString();
      consensusNode[`${name} ${field}`] =
        consensusNodeStates[index][i].toString();
    }

    const relayAssociated = await isAssociatedOnRelay(token, address);
    const consensusNodeAssociated = await isAssociatedOnConsensusNode(
      token,
      address,
    );

    relay[`${name} associated`] = String(relayAssociated);
    consensusNode[`${name} associated`] = String(consensusNodeAssociated);
  }

  return { relay, consensusNode };
}

/** HRC-719 isAssociated() answers for msg.sender, so it is called "from" the account. */
async function isAssociatedOnRelay(token, address) {
  const hrc719 = await ethers.getContractAt(
    Constants.Contract.IHRC719TokenFacade,
    token,
  );
  const data = hrc719.interface.encodeFunctionData("isAssociated");
  const result = await ethers.provider.call({ to: token, data, from: address });

  return hrc719.interface.decodeFunctionResult("isAssociated", result)[0];
}

function isAssociatedOnConsensusNode(token, address) {
  return withClient(async (client) => {
    const info = await Utils.getAccountInfo(address, client);
    const tokenId = TokenId.fromSolidityAddress(token);

    return info.tokenRelationships.get(tokenId) !== null;
  });
}

module.exports = {
  PAID_OUT,
  ALLOWANCE,
  UPDATED_ALLOWANCE,
  TRANSFERRED,
  FEE_TINYBARS,
  deployTokenManager,
  createFungibleToken,
  createTokenHolder,
  setUpAccounts,
  transfer,
  approve,
  readTokenInfo,
  readTokenAccounts,
};
