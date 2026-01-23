const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const Constants = require("../../../../utils/constants");
const { contractDeployAndFund } = require("../../../../utils/contract");
const { approveNft } = require("../relay/erc721-relay-tests-impl");

/**
 * ERC721 events tests. Using this method to reuse tests for different HTS addresses
 * @param testsImpl an object with tests implementation
 * @param htsAddress address of the HTS contract
 * @param runProxyTests if we want to run tests with proxy transfers. Because proxy transfers do not use htsAddress,
 * we do not want to run them for each execution
 * @param context test context, holding pre-created data
 * @returns {Promise<void>}
 */
async function erc721EventsTests(
  testsImpl,
  htsAddress,
  runProxyTests,
  context,
) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  describe(`positive cases ERC721 events with HTS(${displayAddress}) using ${testsImpl.engine()}`, async () => {
    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT transferNFT`, async () => {
      await testsImpl.transferNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT transferFromNFT`, async () => {
      // We are minting separate token at treasury because we cant self-approve NFT
      // mint nft token at treasury
      const serialNumber = (
        await (
          await context.treasury.mintTokenPublic(context.nftTokenAddress, 0, [
            "0x0101",
          ])
        ).wait()
      ).logs.find((e) => e.fragment.name === Constants.Events.MintedToken).args
        .serialNumbers[0];
      // approve minted nft transfer from treasury
      await approveNft(
        context.treasury,
        context.nftTokenAddress,
        context.transferContract,
        serialNumber,
      );
      // transfer from treasury to receiverContract1
      await testsImpl.transferFromNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.treasury,
        context.receiverContract1,
        serialNumber,
        ResponseCodeEnum.SUCCESS,
      );
    });

    if (runProxyTests) {
      it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT proxy transferFromNft`, async () => {
        await testsImpl.transferFromNftProxyTest(
          context.transferContract,
          context.nftTokenAddress,
          context.receiverContract1,
          context.serialNumbers.shift(),
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT transferNFTsTest`, async () => {
      await testsImpl.transferNFTsTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT cryptoTransferV1`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT cryptoTransferV2`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT airdropTokens`, async () => {
      await testsImpl.airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
        false,
      );
    });

    it(`should succeed and contain ERC721 events for HTS(${displayAddress}) NFT claimAirdrops`, async () => {
      // not associated receiver for pending airdrop
      const receiver = await contractDeployAndFund(
        Constants.Contract.AirDropClaimContract,
      );
      const serial = context.serialNumbers.shift();
      // send pending airdrop
      await testsImpl.airdropTokensTest(
        htsAddress,
        context.transferContract,
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
        context.nftTokenAddress,
        receiver,
        serial,
        ResponseCodeEnum.SUCCESS,
      );
    });
  });

  describe(`negative cases ERC721 events with HTS(${displayAddress}) using ${testsImpl.engine()}`, async () => {
    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) NFT transferNFT`, async () => {
      await testsImpl.transferNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with SPENDER_DOES_NOT_HAVE_ALLOWANCE and NOT contain ERC20 events for HTS(${displayAddress}) NFT transferFromNFT`, async () => {
      await testsImpl.transferFromNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.transferContract,
        context.receiverContract1,
        context.serialNumbers[0],
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    if (runProxyTests) {
      it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for transferFromNft proxy`, async () => {
        await testsImpl.transferFromNftProxyTest(
          context.transferContract,
          context.nftTokenAddress,
          context.receiverNotAssociated,
          context.serialNumbers[0],
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) NFT transferNFTsTest`, async () => {
      await testsImpl.transferNFTsTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) NFT cryptoTransferV1`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) NFT cryptoTransferV2`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });
  });
}

module.exports = {
  erc721EventsTests,
};
