const { ethers } = require("hardhat");
const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

let signers, sdkClient, htsContract, treasury, tokenAddress;

async function beforeFtTests() {
  signers = await ethers.getSigners();
  sdkClient = await createSDKClient();
  // find HTS account
  htsContract = await ethers.getContractAt(
    "IHederaTokenService",
    Constants.HTS_ADDRESS,
  );
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

  return [signers, sdkClient, htsContract, treasury, tokenAddress];
}

async function deployTestContract(htsAddress, approveAmount) {
  const testContract = await contractDeployAndFund(
    Constants.Contract.ErcEventsContract,
    0,
    0,
    htsAddress,
  );
  // associated + KYC for test contract
  await (await testContract.associateToken(testContract, tokenAddress)).wait();
  await (await treasury.grantTokenKycPublic(tokenAddress, testContract)).wait();
  console.log(
    "Token:%s associated and KYC granted to:%s",
    tokenAddress,
    signers[0].address,
  );
  if (approveAmount > 0) {
    await (
      await treasury.approvePublic(tokenAddress, testContract, approveAmount)
    ).wait();
    console.log(
      "Token:%s approved:%s to:%s",
      tokenAddress,
      approveAmount,
      testContract.target,
    );
  } else {
    console.log("Token:%s approved:0", tokenAddress);
  }
  return testContract;
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
