const { ethers } = require("hardhat");
const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

const HTS_167 = "0x167";
const HTS_16c = "0x16c";

let signers,
  sdkClient,
  tokenAddress,
  ercEvents167Contract,
  ercEvents16cContract;

async function beforeFtTests() {
  signers = await ethers.getSigners();
  sdkClient = await createSDKClient();

  // create treasure account
  // treasuryAccountPK = PrivateKey.generateED25519();
  // treasuryAccountId = (
  //   await (
  //     await new AccountCreateTransaction()
  //       .setKeyWithoutAlias(treasuryAccountPK.publicKey)
  //       .setInitialBalance(Hbar.fromTinybars(ONE_HBAR))
  //       .execute(sdkClient)
  //   ).getReceipt(sdkClient)
  // ).accountId;
  // create admin account
  // adminAccountPK = PrivateKey.generateED25519();
  // adminAccountId = (
  //   await (
  //     await new AccountCreateTransaction()
  //       .setKeyWithoutAlias(adminAccountPK.publicKey)
  //       .setInitialBalance(Hbar.fromTinybars(ONE_HBAR))
  //       .execute(sdkClient)
  //   ).getReceipt(sdkClient)
  // ).accountId;

  // create test token with 'tokenContract' as a 'treasury'
  const tokenContract = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract
  );
  let tx = await tokenContract.createFungibleTokenPublic(tokenContract);
  console.log("Tx:", tx);
  rc = await tx.wait();
  console.log("Rc:", rc);
  tokenAddress = rc.logs.filter((e) => e.fragment.name === Constants.Events.CreatedToken)[0]
    .args.tokenAddress;
  // tokenAddress = (
  //   await (await tokenContract.createFungibleTokenPublic(tokenContract)).wait()
  // ).logs.filter((e) => e.fragment.name === Constants.Events.CreatedToken)[0]
  //   .args.tokenAddress;
  console.log(
    "Create token contract:%s new token:%s",
    tokenContract,
    tokenAddress,
  );

  // const tx = await new TokenCreateTransaction()
  //   .setTokenName("ERC events test token")
  //   .setTokenSymbol("ERC")
  //   .setTreasuryAccountId(treasuryAccountId)
  //   .setInitialSupply(5000)
  //   .setAdminKey(adminAccountPK.publicKey)
  //   .setMaxTransactionFee(Hbar.fromTinybars(1000))
  //   .freezeWith(sdkClient);
  // tokenId = await (
  //   await (
  //     await (await tx.sign(adminAccountPK)).sign(treasuryAccountPK)
  //   ).execute(sdkClient)
  // ).getReceipt(client).tokenId;
  // console.log("The new token ID:", tokenId);
  // deploy 0x167 contract
  ercEvents167Contract = await contractDeployAndFund(
    "ErcEventsContract",
    0,
    0,
    HTS_167,
  );
  tx = await ercEvents167Contract.createAssociateAndTransfer(
    tokenAddress,
    tokenContract,
    ercEvents167Contract,
    10,
  );
  console.log("Tx:", tx);
  rc = await tx.wait();
  console.log("Rc:", rc);
  // deploy 0x16c contract
  ercEvents16cContract = await contractDeployAndFund(
    "ErcEventsContract",
    0,
    0,
    HTS_16c,
  );

  return [sdkClient, tokenAddress, ercEvents167Contract, ercEvents16cContract];
}

async function afterTests() {
  if (sdkClient != null) {
    console.log("Closing client...")
    sdkClient.close();
  }
}

module.exports = {
  beforeFtTests,
  afterTests,
};
