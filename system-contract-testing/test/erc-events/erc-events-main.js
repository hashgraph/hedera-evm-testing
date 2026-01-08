const { ethers } = require("hardhat");
const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

let signers, sdkClient, treasury, tokenAddress;

async function beforeFtTests() {
  signers = await ethers.getSigners();
  sdkClient = await createSDKClient();

  // create test token with 'tokenContract' as a 'treasury'
  treasury = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  tokenAddress = (
    await (
      await treasury.createFungibleTokenPublic(treasury, {
        value: Constants.Cost.CREATE_TOKEN_COST,
        gasLimit: 1_000_000,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.CreatedToken).args
    .tokenAddress;
  console.log("Create token:%s treasury:%s", tokenAddress, treasury.target);

  return [sdkClient, treasury, tokenAddress];
}

async function deployTestContract(htsAddress, approveAmount) {
  const contract = await contractDeployAndFund(
    Constants.Contract.ErcEventsContract,
    0,
    0,
    htsAddress,
  );
  await (await contract.associateToken(contract, tokenAddress)).wait();
  await (await treasury.grantTokenKycPublic(tokenAddress, contract)).wait();
  await (
    await treasury.approvePublic(tokenAddress, contract, approveAmount)
  ).wait();
  return contract;
}

async function afterTests() {
  if (sdkClient != null) {
    console.log("Closing client...");
    sdkClient.close();
  }
}

module.exports = {
  beforeFtTests,
  deployTestContract,
  afterTests,
};
