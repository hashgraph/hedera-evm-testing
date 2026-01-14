const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const { deployTestContract } = require("./erc-events-main");
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../utils/events");

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

// ---------------- Test functions ----------------
async function transferTokenTest(
    transferContract,
    tokenAddress,
    treasury,
    receiverContract,
    responseCode,
) {
  const amount = 1;
  const rc = await (
      await transferContract.transferToken(
          tokenAddress,
          treasury,
          receiverContract,
          amount,
      )
  ).wait();
  console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    { address: tokenAddress, from: treasury.target, to: receiverContract.target, amount: amount },
  ]);
}

async function transferFromTest(
    transferContract,
    tokenAddress,
    treasury,
    receiverContract,
    responseCode,
) {
  const amount = 1;
  const rc = await (
      await transferContract.transferFrom(
          tokenAddress,
          treasury,
          receiverContract,
          amount,
      )
  ).wait();
  console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferFtProxyTest(
    transferContract,
    tokenAddress,
    treasury,
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
    treasury,
    receiverContract,
    responseCode,
) {
  const amount = 1;
  const rc = await (
      await transferContract.transferFromFtProxy(
          tokenAddress,
          treasury,
          receiverContract,
          amount,
      )
  ).wait();
  console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      amount: amount,
    },
  ]);
}

async function transferTokensTest(
    transferContract,
    tokenAddress,
    treasury,
    receiverContract,
    responseCode,
) {
  const accounts = [treasury, transferContract, receiverContract];
  const amounts = [-3, 1, 2];
  const rc = await (
      await transferContract.transferTokens(tokenAddress, accounts, amounts)
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
      from: treasury.target,
      to: transferContract.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      amount: 2,
    },
  ]);
}

async function cryptoTransferV1Test(
    transferContract,
    tokenAddress,
    treasury,
    receiverContract,
    responseCode,
) {
  const tokenTransferList = [
    {
      token: tokenAddress,
      transfers: [
        { accountID: treasury, amount: -3 },
        { accountID: transferContract, amount: 1 },
        { accountID: receiverContract, amount: 2 },
      ],
      nftTransfers: [],
    },
  ];
  const rc = await (
      await transferContract.cryptoTransferV1(tokenTransferList)
  ).wait();
  console.log(
    "%s FT cryptoTransferV1 tokenTransferList:%s",
    rc.hash,
    tokenTransferList,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: transferContract.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      amount: 2,
    },
  ]);
}

async function cryptoTransferV2Test(
    transferContract,
    tokenAddress,
    treasury,
    receiverContract,
    responseCode,
) {
  const transferList = {
    transfers: [],
  };
  const tokenTransferList = [
    {
      token: tokenAddress,
      transfers: [
        { accountID: treasury, amount: -3, isApproval: false },
        { accountID: transferContract, amount: 1, isApproval: false },
        { accountID: receiverContract, amount: 2, isApproval: false },
      ],
      nftTransfers: [],
    },
  ];
  const rc = await (
      await transferContract.cryptoTransferV2(transferList, tokenTransferList)
  ).wait();
  console.log(
    "%s FT cryptoTransferV2 TransferList:%s tokenTransferList:%s",
    rc.hash,
    transferList,
    tokenTransferList,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: transferContract.target,
      amount: 1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      amount: 2,
    },
  ]);
}

async function erc20EventsTests(htsAddress, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  describe(`Relay: ${displayAddress} positive cases`, async () => {
    let transferContract, receiverContract;

    before(async () => {
      [transferContract, receiverContract] = await deployTestContract(
          null,
        htsAddress,
        context.treasury,
        context.ftTokenAddress,
        1000,
      );
    });

    it(`${displayAddress} FT transferToken`, async () => {
      await transferTokenTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT transferFrom`, async () => {
      await transferFromTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT transfer proxy`, async () => {
      // transferFrom treasury->transfer167Contract
      await transferTokenTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        transferContract,
        ResponseCodeEnum.SUCCESS,
      );
      // transfer transfer167Contract->receiverContract
      await transferFtProxyTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT transferFrom proxy`, async () => {
      // transferFrom treasury->transfer167Contract
      await transferFromFtProxyTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT transferTokens proxy`, async () => {
      await transferTokensTest(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT cryptoTransferV1 proxy`, async () => {
      await cryptoTransferV1Test(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT cryptoTransferV2 proxy`, async () => {
      await cryptoTransferV2Test(
        transferContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
      );
    });
  });

  describe(`Relay: ${displayAddress} negative cases`, async () => {
    let transferNotApprovedContract, receiverContract;

    before(async () => {
      [transferNotApprovedContract, receiverContract] =
        await deployTestContract(
          null,
          htsAddress,
          context.treasury,
          context.ftTokenAddress,
          0,
        );
    });

    it(`${displayAddress} FT transferToken SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferTokenTest(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    it(`${displayAddress} FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromTest(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    it(`${displayAddress} FT transfer proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFtProxyTest(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
      );
    });

    it(`${displayAddress} FT transferFrom proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromFtProxyTest(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
      );
    });

    it(`${displayAddress} FT transferTokens proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferTokensTest(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    it(`${displayAddress} FT cryptoTransferV1 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV1Test(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    it(`${displayAddress} FT cryptoTransferV2 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV2Test(
        transferNotApprovedContract,
        context.ftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });
  });
}

module.exports = {
  validateRcWithErcEvent,
  erc20EventsTests,
};
