const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

// ------------------------- FT -------------------------
async function beforeFtTests() {
  const sdkClient = await createSDKClient();
  // create test token with 'tokenContract' as a 'treasury'
  const treasury = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  const tokenAddress = (
    await (
      await treasury.createFungibleTokenWithoutKYCPublic(treasury, {
        value: Constants.Cost.CREATE_TOKEN_COST,
        gasLimit: 1_000_000,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.CreatedToken).args
    .tokenAddress;
  console.log("Create token:%s treasury:%s", tokenAddress, treasury.target);

  return [sdkClient, treasury, tokenAddress];
}

async function deployTestContract(
  htsAddress,
  treasury,
  tokenAddress,
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
  // associated for transferContract
  if (associateTransfer) {
    await (
      await transferContract.associateToken(transferContract, tokenAddress)
    ).wait();
  }
  // associated for receiverContract
  if (associateReceiver) {
    await (
      await receiverContract.associateToken(receiverContract, tokenAddress)
    ).wait();
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

// ------------------------- NFT -------------------------
async function beforeNftTests() {
  const sdkClient = await createSDKClient();
  // create test token with 'tokenContract' as a 'treasury'
  const treasury = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  const tokenAddress = (
    await (
      await treasury.createNonFungibleTokenWithoutKYCPublic(treasury, {
        value: Constants.Cost.CREATE_TOKEN_COST,
        gasLimit: 1_000_000,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.CreatedToken).args
    .tokenAddress;
  const serialNumbers = (
    await (
      await treasury.mintTokenPublic(tokenAddress, 100, [], {
        gasLimit: 1_000_000,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.MintedToken).args
    .serialNumbers;
  console.log(
    "Create token:%s treasury:%s serialNumbers:%s",
    tokenAddress,
    treasury.target,
    serialNumbers,
  );

  return [sdkClient, treasury, tokenAddress, serialNumbers];
}

async function afterTests(sdkClient) {
  if (sdkClient != null) {
    console.log("Closing client...");
    sdkClient.close();
  }
}

module.exports = {
  beforeFtTests,
  deployTestContract,
  beforeNftTests,
  afterTests,
};
