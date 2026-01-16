const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../utils/events");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

// ---------------- Test util functions ----------------
async function validateRcWithErcEvent(rc, responseCode, expectedEvents) {
  // check ContractTransactionReceipt has event with correct ResponseCode
  await validateResponseCodeEvent(rc, responseCode.valueOf());
  if (responseCode === ResponseCodeEnum.SUCCESS) {
    // check ERC event
    return validateErcEvent(rc, expectedEvents);
  } else {
    // check there is no ERC events
    return validateErcEvent(rc, []);
  }
}

async function approveFt(transferContract, tokenAddress, amount) {
  const rc = await (
    await transferContract.approve(tokenAddress, amount)
  ).wait();
  console.log("%s approve:%s amount:%s", rc.hash, tokenAddress, amount);
}

// ---------------- Test functions ----------------
async function transferTokenTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
) {
  const amount = 1;
  const rc = await (
    await transferContract.transferToken(
      htsAddress,
      tokenAddress,
      transferContract,
      receiverContract,
      amount,
    )
  ).wait();
  console.log(
    "%s transferToken:%s from:%s to:%s amount:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferFromTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
) {
  const amount = 1;
  const rc = await (
    await transferContract.transferFrom(
      htsAddress,
      tokenAddress,
      transferContract,
      receiverContract,
      amount,
    )
  ).wait();
  console.log(
    "%s transferFrom:%s from:%s to:%s amount:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferFtProxyTest(
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
) {
  const amount = 1;
  const rc = await (
    await transferContract.transferFtProxy(
      tokenAddress,
      receiverContract.target,
      amount,
    )
  ).wait();
  console.log(
    "%s FT transfer proxy:%s from:%s to:%s amount:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferFromFtProxyTest(
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
) {
  const amount = 1;
  const rc = await (
    await transferContract.transferFromFtProxy(
      tokenAddress,
      transferContract,
      receiverContract,
      amount,
    )
  ).wait();
  console.log(
    "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferTokensTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  responseCode,
) {
  const accounts = [transferContract, receiverContract1, receiverContract2];
  const amounts = [-3, 1, 2];
  const rc = await (
    await transferContract.transferTokens(
      htsAddress,
      tokenAddress,
      accounts,
      amounts,
    )
  ).wait();
  console.log(
    "%s FT transferTokens:%s accounts:%s amounts:%s",
    rc.hash,
    tokenAddress,
    accounts,
    amounts,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract1.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      amount: 2,
    },
  ]);
}

async function cryptoTransferV1Test(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  responseCode,
) {
  const tokenTransfers = [
    {
      token: tokenAddress,
      transfers: [
        { accountID: transferContract, amount: -3 },
        { accountID: receiverContract1, amount: 1 },
        { accountID: receiverContract2, amount: 2 },
      ],
      nftTransfers: [],
    },
  ];
  const rc = await (
    await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
  ).wait();
  console.log(
    "%s FT cryptoTransferV1 tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract1.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      amount: 2,
    },
  ]);
}

async function cryptoTransferV2Test(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  responseCode,
) {
  const transferList = {
    transfers: [],
  };
  const tokenTransfers = [
    {
      token: tokenAddress,
      transfers: [
        { accountID: transferContract, amount: -3, isApproval: false },
        { accountID: receiverContract1, amount: 1, isApproval: false },
        { accountID: receiverContract2, amount: 2, isApproval: false },
      ],
      nftTransfers: [],
    },
  ];
  const rc = await (
    await transferContract.cryptoTransferV2(
      htsAddress,
      transferList,
      tokenTransfers,
    )
  ).wait();
  console.log(
    "%s FT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
    rc.hash,
    transferList,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract1.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      amount: 2,
    },
  ]);
}

async function airdropTokensTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
  pendingAirdrops,
) {
  const tokenTransfers = [
    {
      token: tokenAddress,
      transfers: [
        { accountID: transferContract, amount: -1, isApproval: false },
        { accountID: receiverContract, amount: 1, isApproval: false },
      ],
      nftTransfers: [],
    },
  ];
  const rc = await (
    await transferContract.airdropTokens(htsAddress, tokenTransfers)
  ).wait();
  console.log("%s FT airdropTokens tokenTransfers:%s", rc.hash, tokenTransfers);
  await validateRcWithErcEvent(
    rc,
    responseCode,
    pendingAirdrops
      ? []
      : [
          {
            address: tokenAddress,
            from: transferContract.target,
            to: receiverContract.target,
            amount: 1,
          },
        ],
  );
}

async function claimAirdropsTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  responseCode,
) {
  const pendingAirdrops = [
    {
      sender: transferContract,
      receiver: receiverContract,
      token: tokenAddress,
      serial: 0,
    },
  ];
  const rc = await (
    await receiverContract.claimAirdrops(htsAddress, pendingAirdrops)
  ).wait();
  console.log(
    "%s FT claimAirdrops pendingAirdrops:%s",
    rc.hash,
    pendingAirdrops,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: 1,
    },
  ]);
}

/**
 * ERC 20 events tests. Using this method to reuse tests for different HTS addresses
 * @param htsAddress address of the HTS contract
 * @param runProxyTests if we want to run tests with proxy transfers. Because proxy transfers do not use htsAddress,
 * we do not want to run them for each execution
 * @param context test context, holding pre-created data
 * @returns {Promise<void>}
 */
async function erc20EventsTests(htsAddress, runProxyTests, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  describe(`Relay: ${displayAddress} positive cases`, async () => {
    it(`${displayAddress} FT transferToken`, async () => {
      await transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT transferFrom`, async () => {
      await approveFt(context.transferContract, context.ftTokenAddress, 1);
      await transferFromTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
      );
    });

    if (runProxyTests) {
      it(`${displayAddress} FT transfer proxy`, async () => {
        await transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    if (runProxyTests) {
      it(`${displayAddress} FT transferFrom proxy`, async () => {
        await approveFt(context.transferContract, context.ftTokenAddress, 1);
        await transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverContract1,
          ResponseCodeEnum.SUCCESS,
        );
      });
    }

    it(`${displayAddress} FT transferTokens`, async () => {
      await transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT cryptoTransferV1`, async () => {
      await cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT cryptoTransferV2`, async () => {
      await cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT airdropTokens`, async () => {
      await airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SUCCESS,
        false,
      );
    });
  });

  describe(`Relay: ${displayAddress} negative cases`, async () => {
    it(`${displayAddress} FT transferToken TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferTokenTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    if (runProxyTests) {
      it(`${displayAddress} FT transfer proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await transferFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    if (runProxyTests) {
      it(`${displayAddress} FT transferFrom proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await transferFromFtProxyTest(
          context.transferContract,
          context.ftTokenAddress,
          context.receiverNotAssociated,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
        );
      });
    }

    it(`${displayAddress} FT transferTokens TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT cryptoTransferV1 TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT cryptoTransferV2 TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT claimAirdrops`, async () => {
      // not associated receiver for pending aidrop
      const receiver = await contractDeployAndFund(
        Constants.Contract.ErcEventsReceiverContract,
      );
      // send pending airdrop
      await airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.ftTokenAddress,
        receiver,
        ResponseCodeEnum.SUCCESS,
        true,
      );
      // claim pending airdrop
      await claimAirdropsTest(
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
  validateRcWithErcEvent,
  erc20EventsTests,
};
