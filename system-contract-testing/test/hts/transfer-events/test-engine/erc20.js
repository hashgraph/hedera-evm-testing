const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const Constants = require("../../../../utils/constants");
const { contractDeployAndFund } = require("../../../../utils/contract");
const { approveFt } = require("../relay/erc20-relay-tests-impl");

/**
 * ERC20 events tests. Using this method to reuse tests for different HTS addresses
 * @param testsImpl an object with tests implementation
 * @param htsAddress address of the HTS contract
 * @param runProxyTests if we want to run tests with proxy transfers. Because proxy transfers do not use htsAddress,
 * we do not want to run them for each execution
 * @param context test context, holding pre-created data
 * @returns {Promise<void>}
 */
async function erc20EventsTests(testsImpl, htsAddress, runProxyTests, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  describe(`positive cases ERC20 events with HTS(${displayAddress}) using ${testsImpl.engine()}`, async () => {
    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT transferToken`, async () => {
      await testsImpl.transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT transferFrom`, async () => {
      await approveFt(context.transferContract, context.ftTokenAddress, 1);
      await testsImpl.transferFromTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
      );
    });

    if (runProxyTests) {
      it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT transfer proxy`, async () => {
        await testsImpl.transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    if (runProxyTests) {
      it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT transferFrom proxy`, async () => {
        await approveFt(context.transferContract, context.ftTokenAddress, 1);
        await testsImpl.transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT transferTokens`, async () => {
      await testsImpl.transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT cryptoTransferV1`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT cryptoTransferV2`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT airdropTokens`, async () => {
      await testsImpl.airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
        false,
      );
    });

    it(`should succeed and contain ERC20 events for HTS(${displayAddress}) FT claimAirdrops`, async () => {
      // not associated receiver for pending airdrop
      const receiver = await contractDeployAndFund(
        Constants.Contract.AirDropClaimContract,
      );
      // send pending airdrop
      await testsImpl.airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        receiver,
        ResponseCodeEnum.SUCCESS,
        true,
      );
      // claim pending airdrop
      await testsImpl.claimAirdropsTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        receiver,
        ResponseCodeEnum.SUCCESS,
      );
    });
  });

  describe(`negative cases ERC20 events with HTS(${displayAddress}) using ${testsImpl.engine()}`, async () => {
    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT transferToken`, async () => {
      await testsImpl.transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with SPENDER_DOES_NOT_HAVE_ALLOWANCE and NOT contain ERC20 events for HTS(${displayAddress}) FT transferFrom`, async () => {
      await testsImpl.transferFromTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    if (runProxyTests) {
      it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT transfer proxy`, async () => {
        await testsImpl.transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    if (runProxyTests) {
      it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT transferFrom proxy`, async () => {
        await testsImpl.transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT transferTokens`, async () => {
      await testsImpl.transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT cryptoTransferV1`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`should fail with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT and NOT contain ERC20 events for HTS(${displayAddress}) FT cryptoTransferV2`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });
  });
}

module.exports = {
  erc20EventsTests,
};
