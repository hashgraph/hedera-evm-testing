const { ethers } = require("hardhat");
const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

let signers, sdkClient, htsContract, treasury, tokenAddress;

async function beforeFtTests() {
  signers = await ethers.getSigners();
  sdkClient = await createSDKClient();
  // find HTS account //TODO remove HTS contract?
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

async function deployTestContract(
  htsAddress,
  approveAmount,
  associateTransfer = true,
  associateReceiver = true,
) {
  const transferContract = await contractDeployAndFund(
    Constants.Contract.ErcEventsContract,
    0,
    0,
    htsAddress,
  );
  // create receiver contract
  const receiverContract = await contractDeployAndFund(
    Constants.Contract.ErcEventsReceiverContract,
  );
  // associated + KYC for transferContract
  if (associateTransfer) {
    await associateAndKYC(transferContract);
  }
  // associated + KYC for receiverContract
  if (associateReceiver) {
    await associateAndKYC(receiverContract);
  }
  if (approveAmount > 0) {
    // approve for transferContract
    await (
      await treasury.approvePublic(
        tokenAddress,
        transferContract,
        approveAmount,
      )
    ).wait();
    console.log(
      "Token:%s approved:%s to:%s",
      tokenAddress,
      approveAmount,
      transferContract.target,
    );
  } else {
    console.log("Token:%s approved:0", tokenAddress);
  }
  return [transferContract, receiverContract];
}

async function associateAndKYC(contract) {
  await (await contract.associateToken(contract, tokenAddress)).wait();
  await (await treasury.grantTokenKycPublic(tokenAddress, contract)).wait();
  console.log(
    "Token:%s associated and KYC granted to:%s",
    tokenAddress,
    contract.target,
  );
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
