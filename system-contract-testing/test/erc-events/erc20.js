const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  beforeFtTests,
  deployTestContract,
  afterTests,
} = require("./erc-events-main");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../utils/events");

describe("ERC20 events", () => {
  let sdkClient, treasury, tokenAddress;

  before(async () => {
    [sdkClient, treasury, tokenAddress] = await beforeFtTests();
  });

  after(async () => {
    await afterTests(sdkClient);
  });

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
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  async function transferFromTest(
    transferContract,
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
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  async function transferFtProxyTest(
    transferContract,
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
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async function transferFromFtProxyTest(
    transferContract,
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
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  async function transferTokensTest(
    transferContract,
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
      { from: treasury.target, to: transferContract.target, amount: 1 },
      { from: treasury.target, to: receiverContract.target, amount: 2 },
    ]);
  }

  async function cryptoTransferV1Test(
    transferContract,
    receiverContract,
    responseCode,
  ) {
    const tokenTransferList = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: treasury.target, amount: -3 },
          { accountID: transferContract.target, amount: 1 },
          { accountID: receiverContract.target, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const rc = await (
      await transferContract.cryptoTransferV1(tokenTransferList)
    ).wait();
    console.log(
      "%s FT cryptoTransferV1:%s tokenTransferList:",
      rc.hash,
      tokenAddress,
      tokenTransferList,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: transferContract.target, amount: 1 },
      { from: treasury.target, to: receiverContract.target, amount: 2 },
    ]);
  }

  async function cryptoTransferV2Test(
    transferContract,
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
          { accountID: treasury.target, amount: -3, isApproval: false },
          { accountID: transferContract.target, amount: 1, isApproval: false },
          { accountID: receiverContract.target, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const rc = await (
      await transferContract.cryptoTransferV2(transferList, tokenTransferList)
    ).wait();
    console.log(
      "%s FT cryptoTransferV2:%s TransferList:%s tokenTransferList:",
      rc.hash,
      tokenAddress,
      transferList,
      tokenTransferList,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: transferContract.target, amount: 1 },
      { from: treasury.target, to: receiverContract.target, amount: 2 },
    ]);
  }

  // ---------------- Tests setup ----------------
  async function ercEventsTests(address) {
    const displayAddress = address.replace(/(0)\1+/g, "");

    describe(`Relay: ${displayAddress} positive cases`, async () => {
      let transferContract, receiverContract;

      before(async () => {
        [transferContract, receiverContract] = await deployTestContract(
          address,
          treasury, tokenAddress,
          1000,
        );
      });

      it(`${displayAddress} FT transferToken`, async () => {
        await transferTokenTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT transferFrom`, async () => {
        await transferFromTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT transfer proxy`, async () => {
        // transferFrom treasury->transfer167Contract
        await transferTokenTest(
          transferContract,
          transferContract,
          ResponseCodeEnum.SUCCESS,
        );
        // transfer transfer167Contract->receiverContract
        await transferFtProxyTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT transferFrom proxy`, async () => {
        // transferFrom treasury->transfer167Contract
        await transferFromFtProxyTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT transferTokens proxy`, async () => {
        await transferTokensTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT cryptoTransferV1 proxy`, async () => {
        await cryptoTransferV1Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it(`${displayAddress} FT cryptoTransferV2 proxy`, async () => {
        await cryptoTransferV2Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });
    });

    describe(`Relay: ${displayAddress} negative cases`, async () => {
      let transferNotApprovedContract, receiverContract;

      before(async () => {
        [transferNotApprovedContract, receiverContract] =
          await deployTestContract(address, treasury, tokenAddress, 0);
      });

      it(`${displayAddress} FT transferToken SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferTokenTest(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it(`${displayAddress} FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferFromTest(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it(`${displayAddress} FT transfer proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferFtProxyTest(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
        );
      });

      it(`${displayAddress} FT transferFrom proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferFromFtProxyTest(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
        );
      });

      it(`${displayAddress} FT transferTokens proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await transferTokensTest(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it(`${displayAddress} FT cryptoTransferV1 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await cryptoTransferV1Test(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it(`${displayAddress} FT cryptoTransferV2 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await cryptoTransferV2Test(
          transferNotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });
    });
  }

  describe("HTS 0x167", async () => {
    await ercEventsTests(HTS_ADDRESS);
  });

  describe("HTS 0x16c", async () => {
    await ercEventsTests(HTS_ADDRESS_V2);
  });
});
