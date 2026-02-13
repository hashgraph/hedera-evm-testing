const { ethers } = require("hardhat");
const { contractDeployAndFund } = require("../../../../utils/contract");
const Constants = require("../../../../utils/constants");

/**
 * Create test contracts, includes token create contract ('TokenCreateContract'),
 * transfer contract ('HTSSystemContractTransfersExecutorContract') and few
 * 'AirDropClaimAndReceiverContract' contracts.
 * @param { Number } receivers amount of receiver ('AirDropClaimAndReceiverContract') contracts to create
 * @param { Number } receiversBalance amount of HBAR to transfer to each receiver
 * @param { ethers.Interface } IHRC904AccountFacade IHRC904 facade for account
 * @returns {Promise<*[]>}
 */
async function createTestContracts(receivers, receiversBalance, IHRC904AccountFacade) {
  // create token create contract
  const tokenContract = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  // create test 'transferContract'
  const transferContract = await contractDeployAndFund(
    Constants.Contract.HTSSystemContractTransfersExecutorContract,
    20,
  );
  const retval = [tokenContract, transferContract];
  // create receiverWallets
  for (let i = 0; i < receivers; i++) {
    retval.push(await createReceiver(receiversBalance, IHRC904AccountFacade));
  }
  return retval;
}

async function createReceiver(receiversBalance, IHRC904AccountFacade) {
  const signers = await ethers.getSigners();
  // create new receiver account
  const receiver = ethers.Wallet.createRandom(ethers.provider);
  await signers[0].sendTransaction({
    to: receiver.address,
    value: Constants.ONE_HBAR * BigInt(receiversBalance),
  });
  // wrap new receiver account to receiverAbiInterface facade
  const receiverFacade = new ethers.Contract(
    receiver.address,
    IHRC904AccountFacade,
    receiver,
  );
  // disable Unlimited Automatic Associations
  await (await receiverFacade.setUnlimitedAutomaticAssociations(false)).wait();
  console.log(
    "Created receiver account address:%s balance:%s HBAR",
    receiver.address,
    receiversBalance,
  );
  return receiver;
}

async function createFungibleTokenAndAssociate(
  tokenContract,
  transferContract,
  receiverWallet1,
  receiverWallet2,
  IHRC719TokenFacade,
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
  // associated for receiverWallets
  const receiverFacade1 = new ethers.Contract(
    tokenAddress,
    IHRC719TokenFacade,
    receiverWallet1,
  );
  await (
    await receiverFacade1.associate({
      gasLimit: 1_000_000, //TODO can we do it w/o gas?
    })
  ).wait();
  const receiverFacade2 = new ethers.Contract(
    tokenAddress,
    IHRC719TokenFacade,
    receiverWallet2,
  );
  await (
    await receiverFacade2.associate({
      gasLimit: 1_000_000, //TODO can we do it w/o gas?
    })
  ).wait();
  return tokenAddress;
}

async function setupFungibleTokenTests(context) {
  if (!context.ftTokenAddress) {
    context.ftTokenAddress = await createFungibleTokenAndAssociate(
      context.treasury,
      context.transferContract,
      context.receiverWallet1,
      context.receiverWallet2,
      context.IHRC719TokenFacade,
    );
  }
}

async function createNonFungibleTokenAndAssociate(
  tokenContract,
  transferContract,
  receiverWallet1,
  receiverWallet2,
  IHRC719TokenFacade,
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
  // associated for receiverWallets
  const receiverFacade1 = new ethers.Contract(
    tokenAddress,
    IHRC719TokenFacade,
    receiverWallet1,
  );
  await (
    await receiverFacade1.associate({
      gasLimit: 1_000_000, //TODO can we do it w/o gas?
    })
  ).wait();
  const receiverFacade2 = new ethers.Contract(
    tokenAddress,
    IHRC719TokenFacade,
    receiverWallet2,
  );
  await (
    await receiverFacade2.associate({
      gasLimit: 1_000_000, //TODO can we do it w/o gas?
    })
  ).wait();
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
      context.receiverWallet1,
      context.receiverWallet2,
      context.IHRC719TokenFacade,
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
  createTestContracts,
  createReceiver,
  setupFungibleTokenTests,
  setupNonFungibleTokenTests,
};
