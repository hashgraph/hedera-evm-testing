const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const Constants = require("../../../utils/constants");
const { contractDeployAndFund } = require("../../../utils/contract");
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
  describe(`${testsImpl.engine()}: ${displayAddress} positive cases`, async () => {
    it(`${displayAddress} FT transferToken`, async () => {
      await testsImpl.transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT transferFrom`, async () => {
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
      it(`${testsImpl.engine()}: ${displayAddress} FT transfer proxy`, async () => {
        await testsImpl.transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    if (runProxyTests) {
      it(`${testsImpl.engine()}: ${displayAddress} FT transferFrom proxy`, async () => {
        await approveFt(context.transferContract, context.ftTokenAddress, 1);
        await testsImpl.transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    it(`${testsImpl.engine()}: ${displayAddress} FT transferTokens`, async () => {
      await testsImpl.transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT cryptoTransferV1`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT cryptoTransferV2`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT airdropTokens`, async () => {
      await testsImpl.airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
        false,
      );
    });
  });

  describe(`${testsImpl.engine()}: ${displayAddress} negative cases`, async () => {
    it(`${testsImpl.engine()}: ${displayAddress} FT transferToken TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await testsImpl.transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await testsImpl.transferFromTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    if (runProxyTests) {
      it(`${testsImpl.engine()}: ${displayAddress} FT transfer proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await testsImpl.transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    if (runProxyTests) {
      it(`${testsImpl.engine()}: ${displayAddress} FT transferFrom proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await testsImpl.transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    it(`${testsImpl.engine()}: ${displayAddress} FT transferTokens TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await testsImpl.transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT cryptoTransferV1 TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await testsImpl.cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT cryptoTransferV2 TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await testsImpl.cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${testsImpl.engine()}: ${displayAddress} FT claimAirdrops`, async () => {
      // not associated receiver for pending aidrop
      const receiver = await contractDeployAndFund(
        Constants.Contract.ErcEventsReceiverContract,
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
}

module.exports = {
  erc20EventsTests,
};
