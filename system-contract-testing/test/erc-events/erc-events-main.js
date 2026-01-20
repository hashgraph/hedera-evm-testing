const { createSDKClient } = require("../../utils/utils");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

async function beforeTests(receivers) {
  const sdkClient = await createSDKClient();
  // create test 'transferContract'
  const tokenContract = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  // create test 'transferContract'
  const transferContract = await contractDeployAndFund(
    Constants.Contract.ErcEventsContract,
    10,
  );
  const retval = [sdkClient, tokenContract, transferContract];
  // create receiverContracts
  for (let i = 0; i < receivers; i++) {
    retval.push(
      await contractDeployAndFund(Constants.Contract.ErcEventsReceiverContract),
    );
  }
  return retval;
}

async function beforeFtTests(
  tokenContract,
  transferContract,
  receiverContract1,
  receiverContract2,
) {
  // create test FT token with 'tokenContract' as a 'treasury'
  const rc = await (
    await transferContract.createFungibleTokenWithoutKYCPublic(tokenContract, {
      value: Constants.Cost.CREATE_TOKEN_COST,
    })
  ).wait();
  const tokenAddress = rc.logs.find(
    (e) => e.fragment.name === Constants.Events.CreatedToken,
  ).args.tokenAddress;
  console.log(
    "Create token:%s treasury:%s",
    tokenAddress,
    transferContract.target,
  );
  // associated for receiverContracts
  await (await receiverContract1.associateToken(tokenAddress)).wait();
  await (await receiverContract2.associateToken(tokenAddress)).wait();
  return tokenAddress;
}

async function beforeNftTests(
  tokenContract,
  transferContract,
  receiverContract1,
  receiverContract2,
) {
  // create test NFT token with 'tokenContract' as a 'treasury'
  const rc = await (
    await transferContract.createNonFungibleTokenWithoutKYCPublic(
      tokenContract,
      {
        value: Constants.Cost.CREATE_TOKEN_COST,
      },
    )
  ).wait();
  const tokenAddress = rc.logs.find(
    (e) => e.fragment.name === Constants.Events.CreatedToken,
  ).args.tokenAddress;
  console.log(
    "Create token:%s treasury:%s",
    tokenAddress,
    transferContract.target,
  );
  // associated for receiverContracts
  await (await receiverContract1.associateToken(tokenAddress)).wait();
  await (await receiverContract2.associateToken(tokenAddress)).wait();
  return tokenAddress;
}

async function mintForNftTests(
  tokenContract,
  transferContract,
  tokenAddress,
  mintAmount,
) {
  // mint NFTs
  let serialNumbers = [];
  const metadata = Array.from(
    Array(mintAmount)
      .keys()
      .map((e) => `0x${e.toString(16).padStart(2, "0")}`),
  );
  const singleMintSize = 10; // 10 is max for a single call
  for (let i = 0; i < metadata.length; i += singleMintSize) {
    const requestMetadata = metadata.slice(i, i + singleMintSize);
    const serialNumbersObject = (
      await (
        await transferContract.mintTokenPublic(
          tokenContract,
          tokenAddress,
          0,
          requestMetadata,
        )
      ).wait()
    ).logs.find((e) => e.fragment.name === Constants.Events.MintedToken).args
      .serialNumbers;
    serialNumbers = serialNumbers.concat(
      Array.from(serialNumbersObject.values()),
    );
  }
  console.log(
    "Mint token:%s treasury:%s serialNumbers:%s",
    tokenAddress,
    transferContract.target,
    serialNumbers,
  );
  return serialNumbers;
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
  mintForNftTests,
  afterTests,
};
