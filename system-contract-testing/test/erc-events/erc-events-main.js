const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

async function beforeTests() {
  const sdkClient = await createSDKClient();
  // create 'tokenContract' for creating test tokens
  const treasury = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  return [sdkClient, treasury];
}

async function beforeFtTests(sdkClient, treasury) {
  // create test FT token with 'tokenContract' as a 'treasury'
  const tokenAddress = (
    await (
      await treasury.createFungibleTokenWithoutKYCPublic(treasury, {
        value: Constants.Cost.CREATE_TOKEN_COST,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.CreatedToken).args
    .tokenAddress;
  console.log("Create token:%s treasury:%s", tokenAddress, treasury.target);

  return tokenAddress;
}

async function beforeNftTests(sdkClient, treasury, mintAmount) {
  // create test NFT token with 'tokenContract' as a 'treasury'
  const tokenAddress = (
    await (
      await treasury.createNonFungibleTokenWithoutKYCPublic(treasury, {
        value: Constants.Cost.CREATE_TOKEN_COST,
      })
    ).wait()
  ).logs.find((e) => e.fragment.name === Constants.Events.CreatedToken).args
    .tokenAddress;

  // mint NFTs
  let serialNumbers = [];
  const metadata = Array.from(
    Array(mintAmount)
      .keys()
      .map((e) => `0x${e.toString(16).padStart(2, "0")}`),
  );
  const singleMintSize = 10;
  for (let i = 0; i < metadata.length; i += singleMintSize) {
    const requestMetadata = metadata.slice(i, i + singleMintSize);
    const serialNumbersObject = (
      await (
        await treasury.mintTokenPublic(tokenAddress, 0, requestMetadata)
      ).wait()
    ).logs.find((e) => e.fragment.name === Constants.Events.MintedToken).args
      .serialNumbers;
    serialNumbers = serialNumbers.concat(
      Array.from(serialNumbersObject.values()),
    );
  }

  console.log(
    "Create token:%s treasury:%s serialNumbers:%s",
    tokenAddress,
    treasury.target,
    serialNumbers,
  );

  return [tokenAddress, serialNumbers];
}

async function deployTestContract(
  htsAddress,
  treasury,
  tokenAddress,
  approveAmount,
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
  await (
    await transferContract.associateToken(transferContract, tokenAddress)
  ).wait();
  // associated for receiverContract
  await (
    await receiverContract.associateToken(receiverContract, tokenAddress)
  ).wait();
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

async function afterTests(sdkClient) {
  if (sdkClient != null) {
    console.log("Closing client...");
    sdkClient.close();
  }
}

module.exports = {
  beforeTests,
  beforeFtTests,
  beforeNftTests,
  deployTestContract,
  afterTests,
};
