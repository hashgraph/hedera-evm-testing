// SPDX-License-Identifier: Apache-2.0

const { NftId, TokenId, TokenNftInfoQuery } = require("@hiero-ledger/sdk");
const { ethers } = require("hardhat");
const Utils = require("../../../utils/utils");
const Constants = require("../../../utils/constants");
const { withClient } = require("./consensus-node");
const { walletOverrides } = require("./wallet-account");
const {
  FEE_TINYBARS,
  HTS_GAS,
  allowToken,
  readTokenInfoOnConsensusNode,
  callManager,
  byAccount,
} = require("./hts-token");

const ERC721 = "@openzeppelin/contracts/token/ERC721/IERC721.sol:IERC721";

// Minted by populate: #1 and #2 to the holder, #3 to the frozen account, #4 stays in the treasury
const SERIALS = [1, 2, 3, 4];
// Minted by verify with the old supply key
const NEW_SERIAL = 5;
// Minting 4 serials uses ~1.2M gas
const MINT_GAS = Constants.GAS_LIMIT_2_000_000;
// What TokenManager.nftAccountStates returns for each account, in order
const ACCOUNT_FIELDS = ["balance", "approvedForAll", "frozen", "kyc"];

const metadataOf = (serial) => `serial-${serial}`;

/**
 * Creates the NFT through the manager, which becomes its treasury and holds its keys.
 *
 * @returns {Promise<string>} the NFT address
 */
async function createNft(manager) {
  const tx = await manager.createNft(FEE_TINYBARS, {
    value: Utils.createTokenCost,
    ...Constants.GAS_LIMIT_1_000_000,
  });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => manager.interface.parseLog(log))
    .find((parsed) => parsed?.name === "TokenCreated");

  return event.args.token;
}

/**
 * Mints one serial per entry, each with metadataOf(serial), into the treasury.
 *
 * @param {number[]} serials the serials the mint is expected to produce
 * @returns {Promise<number[]>} the serials actually minted
 */
async function mintNfts(manager, nft, serials) {
  const metadata = serials.map((serial) =>
    ethers.toUtf8Bytes(metadataOf(serial)),
  );
  const tx = await manager.mintNfts(nft, metadata, MINT_GAS);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => manager.interface.parseLog(log))
    .find((parsed) => parsed?.name === "NftsMinted");

  return event.args.serials.map(Number);
}

/** The NFT as an ERC721 contract, sending from `runner`. */
function erc721(nft, runner) {
  return ethers.getContractAt(ERC721, nft, runner);
}

/**
 * Moves a serial with transferFrom, sent by `wallet` (the owner or an approved spender).
 *
 * @returns {Promise<number>} the receipt status: 0 when the transfer is refused
 */
async function transferNft(wallet, nft, from, to, serial) {
  const contract = await erc721(nft, wallet);
  const overrides = await walletOverrides(HTS_GAS);
  const tx = await contract.transferFrom(from, to, serial, overrides);
  const receipt = await tx.wait().catch((error) => error.receipt);

  return receipt.status;
}

/**
 * Lets the 7a holder, frozen and spender accounts hold the NFT, then: #1 and #2 to the holder, #3 to
 * the frozen account (then frozen); the holder approves the spender for #1 and for all its NFTs.
 *
 * @param {{ holder: import("ethers").Wallet, frozen: import("ethers").Wallet, spender: import("ethers").Wallet }} wallets
 */
async function setUpNftAccounts(manager, nft, wallets) {
  const { holder, frozen, spender } = wallets;

  for (const wallet of [holder, frozen, spender]) {
    await allowToken(manager, wallet, nft);
  }

  for (const [wallet, serial] of [
    [holder, 1],
    [holder, 2],
    [frozen, 3],
  ]) {
    const tx = await manager.payOutNft(nft, wallet.address, serial);
    await tx.wait();
  }

  const freezeTx = await manager.freeze(nft, frozen.address);
  await freezeTx.wait();

  const contract = await erc721(nft, holder);
  const approveOverrides = await walletOverrides(HTS_GAS);
  const approveTx = await contract.approve(
    spender.address,
    1,
    approveOverrides,
  );
  await approveTx.wait();

  const forAllOverrides = await walletOverrides(HTS_GAS);
  const forAllTx = await contract.setApprovalForAll(
    spender.address,
    true,
    forAllOverrides,
  );
  await forAllTx.wait();
}

/**
 * Name, symbol and total supply through the relay; the full token info on the consensus node.
 */
async function readNftInfo(nft) {
  const contract = await ethers.getContractAt("INftMetadataFacade", nft);
  const name = await contract.name();
  const symbol = await contract.symbol();
  const totalSupply = await contract.totalSupply();
  const consensusNode = await readTokenInfoOnConsensusNode(nft);

  return {
    relay: { name, symbol, totalSupply: totalSupply.toString() },
    consensusNode,
  };
}

/**
 * Owner, approved address and metadata of each serial, keyed "#<serial> <field>", through the relay
 * (metadata as tokenURI) and on the consensus node (metadata as raw bytes).
 */
async function readSerials(manager, nft, serials) {
  const states = await callManager(manager, "serialStates", [nft, serials]);
  const metadataContract = await ethers.getContractAt(
    "INftMetadataFacade",
    nft,
  );
  const relay = {};
  const consensusNode = {};

  for (const [i, serial] of serials.entries()) {
    relay[`#${serial} owner`] = states.relay.owners[i];
    relay[`#${serial} approved`] = states.relay.approved[i];
    consensusNode[`#${serial} owner`] = states.consensusNode.owners[i];
    consensusNode[`#${serial} approved`] = states.consensusNode.approved[i];

    const tokenURI = await metadataContract.tokenURI(serial);
    const metadata = await readMetadataOnConsensusNode(nft, serial);

    relay[`#${serial} metadata`] = tokenURI;
    consensusNode[`#${serial} metadata`] = metadata;
  }

  return { relay, consensusNode };
}

function readMetadataOnConsensusNode(nft, serial) {
  return withClient(async (client) => {
    const [info] = await new TokenNftInfoQuery()
      .setNftId(new NftId(TokenId.fromSolidityAddress(nft), serial))
      .execute(client);

    return ethers.toUtf8String(info.metadata);
  });
}

/**
 * NFT balance, approve-for-all to `operator`, freeze flag, KYC flag and association of each
 * account, keyed "<name> <field>", through the relay and on the consensus node.
 *
 * @param {Record<string, string>} accounts name -> address
 */
async function readNftAccounts(manager, nft, accounts, operator) {
  const states = await callManager(manager, "nftAccountStates", [
    nft,
    Object.values(accounts),
    operator,
  ]);

  return byAccount(nft, accounts, ACCOUNT_FIELDS, states);
}

module.exports = {
  SERIALS,
  NEW_SERIAL,
  metadataOf,
  createNft,
  mintNfts,
  transferNft,
  setUpNftAccounts,
  readNftInfo,
  readSerials,
  readNftAccounts,
};
