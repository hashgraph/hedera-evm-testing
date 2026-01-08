// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");

const Events = {
  Success: "success",
  ResponseCode: "ResponseCode",
  AllowanceValue: "AllowanceValue",
  ApprovedAddress: "ApprovedAddress",
  Approved: "Approved",
  Frozen: "Frozen",
  KycGranted: "KycGranted",
  TokenCustomFees: "TokenCustomFees",
  TokenDefaultFreezeStatus: "TokenDefaultFreezeStatus",
  TokenDefaultKycStatus: "TokenDefaultKycStatus",
  TokenExpiryInfo: "TokenExpiryInfo",
  FungibleTokenInfo: "FungibleTokenInfo",
  TokenInfo: "TokenInfo",
  TokenKey: "TokenKey",
  NonFungibleTokenInfo: "NonFungibleTokenInfo",
  IsToken: "IsToken",
  TokenType: "TokenType",
  Approval: "Approval",
  ApprovalForAll: "ApprovalForAll",
  TokenCreated: "TokenCreated",
  TokenCreatedEvent: "tokenCreatedEvent",
  TokenInfoEvent: "TokenInfoEvent",
  FungibleTokenInfoEvent: "FungibleTokenInfoEvent",
  NftMinted: "NftMinted",
  PausedToken: "PausedToken",
  UnpausedToken: "UnpausedToken",
  CreatedToken: "CreatedToken",
  TransferToken: "TransferToken",
  MintedToken: "MintedToken",
  CallResponseEvent: "CallResponseEvent",
  GetTokenInfo: "GetTokenInfo",
  MintedNft: "MintedNft",
  GetFungibleTokenInfo: "GetFungibleTokenInfo",
  GetNonFungibleTokenInfo: "GetNonFungibleTokenInfo",
  TinyBars: "TinyBars",
  TinyCents: "TinyCents",
  PseudoRandomSeed: "PseudoRandomSeed",
  CryptoAllowance: "CryptoAllowance",
  IsAssociated: "IsAssociated",
  ScheduleCall: "ScheduleCall",
  HasScheduleCapacity: "HasScheduleCapacity",
};

const Path = {};

const Contract = {
  HIP1215Contract: "HIP1215Contract",
  TokenCreateContract: "TokenCreateContract",
  ErcEventsContract: "ErcEventsContract",
};

const Cost = {
  CREATE_TOKEN_COST: "35000000000000000000",
};

const TINYBAR_TO_WAIBAR_CORF = 10_000_000_000n;
const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
const HTS_ADDRESS_V2 = "0x000000000000000000000000000000000000016c";
const HSS_ADDRESS = "0x000000000000000000000000000000000000016b";
const CALL_EXCEPTION = "CALL_EXCEPTION";
const CONTRACT_REVERT_EXECUTED_CODE = 3;
const GAS_LIMIT_1_000 = { gasLimit: 1_000 };
const GAS_LIMIT_1_000_000 = { gasLimit: 1_000_000 };
const GAS_LIMIT_2_000_000 = { gasLimit: 2_000_000 };
const GAS_LIMIT_5_000_000 = { gasLimit: 5_000_000 };
const GAS_LIMIT_10_000_000 = { gasLimit: 10_000_000 };
const GAS_LIMIT_15M = { gasLimit: 15_000_000 };
const GAS_LIMIT_800000 = { gasLimit: 800000 };
const GAS_LIMIT_8000000 = { gasLimit: 8000000 };
const ONE_HBAR = ethers.parseEther("1");
const TOKEN_NAME = "tokenName";
const TOKEN_SYMBOL = "tokenSymbol";
const TOKEN_URL = "tokenUrl";
const TX_SUCCESS_CODE = 22;
const SECOND = (WEI = 1);
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const GWEI = 1e9;
const HTS_SYSTEM_CONTRACT_ID = "0.0.359";
const HAS_SYSTEM_CONTRACT_ID = "0.0.362";
const MAX_EXPIRY = 5_356_800; // max expiration for CN config https://github.com/hiero-ledger/hiero-consensus-node/blob/4bf94c67432c373c2abf18e7b6725c482d2e11d4/hedera-node/hedera-config/src/main/java/com/hedera/node/config/data/SchedulingConfig.java#L22

module.exports = {
  Events,
  Path,
  Contract,
  Cost,
  TINYBAR_TO_WAIBAR_CORF,
  HTS_ADDRESS,
  HTS_ADDRESS_V2,
  HSS_ADDRESS,
  CALL_EXCEPTION,
  CONTRACT_REVERT_EXECUTED_CODE,
  GAS_LIMIT_1_000,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_2_000_000,
  GAS_LIMIT_5_000_000,
  GAS_LIMIT_10_000_000,
  GAS_LIMIT_800000,
  GAS_LIMIT_8000000,
  GAS_LIMIT_15M,
  ONE_HBAR,
  TOKEN_URL,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TX_SUCCESS_CODE,
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  WEEK,
  WEI,
  GWEI,
  HTS_SYSTEM_CONTRACT_ID,
  HAS_SYSTEM_CONTRACT_ID,
  MAX_EXPIRY,
};
