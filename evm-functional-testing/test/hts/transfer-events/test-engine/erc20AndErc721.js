const { ResponseCodeEnum } = require("@hiero-ledger/proto").proto;
const { contractDeployAndFund } = require("../../../../utils/contract");
const Constants = require("../../../../utils/constants");

/**
 * ERC20/ERC721 events tests. Using this method to reuse tests for different HTS addresses
 * @param testsImpl an object with tests implementation
 * @param htsAddress address of the HTS contract
 * @param context test context, holding pre-created data
 * @returns {Promise<void>}
 */
async function erc20AndErc721EventsTests(testsImpl, htsAddress, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  it(`should succeed and contain ERC20 and ERC721 events for HTS(${displayAddress}) FT/NFT cryptoTransferV1 proxy`, async () => {
    await testsImpl.cryptoTransferV1Test(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  it(`should succeed and contain ERC20 and ERC721 events for HTS(${displayAddress}) FT/NFT cryptoTransferV2 proxy`, async () => {
    await testsImpl.cryptoTransferV2Test(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  it(`should succeed and contain ERC20 and ERC721 events for HTS(${displayAddress}) FT/NFT airdropTokens`, async () => {
    await testsImpl.airdropTokensTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  it(`should succeed and contain ERC20 and ERC721 events for HTS(${displayAddress}) FT/NFT claimAirdrops`, async () => {
    // not associated receiver for pending airdrop
    const receiver = await contractDeployAndFund(
      Constants.Contract.AirDropClaimAndReceiverContract,
    );
    const serial = context.serialNumbers.shift();
    // send pending airdrop
    await testsImpl.airdropTokensTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      receiver,
      serial,
      ResponseCodeEnum.SUCCESS,
      true,
    );
    // claim pending airdrop
    await testsImpl.claimAirdropsTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      receiver,
      serial,
      ResponseCodeEnum.SUCCESS,
    );
  });
}

module.exports = {
  erc20AndErc721EventsTests,
};
