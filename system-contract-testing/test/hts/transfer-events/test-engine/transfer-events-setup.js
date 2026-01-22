const { contractDeployAndFund } = require("../../../../utils/contract");
const Constants = require("../../../../utils/constants");

/**
 * Create test contract, includes token create contract, transfer contract, receiver contracts
 * @param receivers amount of receiver contracts to create
 * @returns {Promise<*[]>}
 */
async function beforeTests(receivers) {
  // create token create contract
  const tokenContract = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  // create test 'transferContract'
  const transferContract = await contractDeployAndFund(
    Constants.Contract.TransferEventsContract,
    20,
  );
  const retval = [tokenContract, transferContract];
  // create receiverContracts
  for (let i = 0; i < receivers; i++) {
    retval.push(
      await contractDeployAndFund(
        Constants.Contract.TransferEventsReceiverContract,
      ),
    );
  }
  return retval;
}

async function createFungibleTokenAndAssociate(
  tokenContract,
  transferContract,
  receiverContract1,
  receiverContract2,
) {
  // create test FT token with 'tokenContract' as a 'treasury'
  const receipt = await (
    await transferContract.createFungibleTokenWithoutKYCPublic(tokenContract, {
      value: Constants.Cost.CREATE_TOKEN_COST,
    })
  ).wait();
  const tokenAddress = receipt.logs.find(
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

async function setupFungibleTokenTests(context) {
  if (!context.ftTokenAddress) {
    context.ftTokenAddress = await createFungibleTokenAndAssociate(
      context.treasury,
      context.transferContract,
      context.receiverContract1,
      context.receiverContract2,
    );
  }
}

async function createNonFungibleTokenAndAssociate(
  tokenContract,
  transferContract,
  receiverContract1,
  receiverContract2,
) {
  // create test NFT token with 'tokenContract' as a 'treasury'
  const receipt = await (
    await transferContract.createNonFungibleTokenWithoutKYCPublic(
      tokenContract,
      {
        value: Constants.Cost.CREATE_TOKEN_COST,
      },
    )
  ).wait();
  const tokenAddress = receipt.logs.find(
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

async function mintForNonFungibleTokenTests(
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

async function setupNonFungibleTokenTests(context, mintAmount) {
  if (!context.nftTokenAddress) {
    context.nftTokenAddress = await createNonFungibleTokenAndAssociate(
      context.treasury,
      context.transferContract,
      context.receiverContract1,
      context.receiverContract2,
    );
  }
  context.serialNumbers = context.serialNumbers.concat(
    await mintForNonFungibleTokenTests(
      context.treasury,
      context.transferContract,
      context.nftTokenAddress,
      mintAmount,
    ),
  );
}

module.exports = {
  beforeTests,
  setupFungibleTokenTests,
  setupNonFungibleTokenTests,
};
