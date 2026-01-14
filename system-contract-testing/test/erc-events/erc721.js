const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  beforeNftTests,
  deployTestContract,
  afterTests,
} = require("./erc-events-main");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../utils/events");

describe("ERC721 events", () => {
  let sdkClient, treasury, tokenAddress, serialNumbers;

  before(async () => {
    [sdkClient, treasury, tokenAddress, serialNumbers] = await beforeNftTests();
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
  async function transferNFTTest(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber,
  ) {
    const rc = await (
      await transferContract.transferNFT(
        tokenAddress,
        treasury,
        receiverContract,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferNFT:%s from:%s to:%s serialNumber:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        from: treasury.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async function transferFromNFTTest(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber,
  ) {
    const rc = await (
      await transferContract.transferFromNFT(
        tokenAddress,
        treasury,
        receiverContract,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferFromNFT:%s from:%s to:%s serialNumber:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        from: treasury.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async function transferFromNftProxyTest(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber,
  ) {
    const rc = await (
      await transferContract.transferFromNftProxy(
        tokenAddress,
        treasury,
        receiverContract,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferFromNft proxy:%s from:%s to:%s serialNumber:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        from: treasury.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async function transferNFTsTest(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber1,
    serialNumber2,
  ) {
    const senders = [treasury, treasury];
    const receivers = [transferContract, receiverContract];
    const serialNumbers = [serialNumber1, serialNumber2];
    const rc = await (
      await transferContract.transferNFTs(
        tokenAddress,
        senders,
        receivers,
        serialNumbers,
      )
    ).wait();
    console.log(
      "%s NFT transferNFTs:%s senders:%s receivers:%s serialNumbers:%s",
      rc.hash,
      tokenAddress,
      senders,
      receivers,
      serialNumbers,
    );
    await validateRcWithErcEvent(
      rc,
      responseCode,
      serialNumbers.map((e) => {
        return {
          from: treasury.target,
          to: transferContract.target,
          serial: e,
        };
      }),
    );
  }

  async function cryptoTransferV1Test(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber1,
    serialNumber2,
  ) {
    const tokenTransferList = [
      {
        token: tokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: treasury,
            receiverAccountID: transferContract,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: treasury,
            receiverAccountID: receiverContract,
            serialNumber: serialNumber2,
          },
        ],
      },
    ];
    const rc = await (
      await transferContract.cryptoTransferV1(tokenTransferList)
    ).wait();
    console.log(
      "%s NFT cryptoTransferV1:%s tokenTransferList:",
      rc.hash,
      tokenAddress,
      tokenTransferList,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        from: treasury.target,
        to: transferContract.target,
        serial: serialNumber1,
      },
      {
        from: treasury.target,
        to: receiverContract.target,
        serial: serialNumber2,
      },
    ]);
  }

  async function cryptoTransferV2Test(
    transferContract,
    receiverContract,
    responseCode,
    serialNumber1,
    serialNumber2,
  ) {
    const transferList = {
      transfers: [],
    };
    const tokenTransferList = [
      {
        token: tokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: treasury,
            receiverAccountID: transferContract,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: treasury,
            receiverAccountID: receiverContract,
            serialNumber: serialNumber2,
          },
        ],
      },
    ];
    const rc = await (
      await transferContract.cryptoTransferV2(transferList, tokenTransferList)
    ).wait();
    console.log(
      "%s NFT cryptoTransferV2:%s TransferList:%s tokenTransferList:",
      rc.hash,
      tokenAddress,
      transferList,
      tokenTransferList,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        from: treasury.target,
        to: transferContract.target,
        serial: serialNumber1,
      },
      {
        from: treasury.target,
        to: receiverContract.target,
        serial: serialNumber2,
      },
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
          treasury,
          tokenAddress,
          1000,
        );
      });

      it(`${displayAddress} FT transferNFT`, async () => {
        await transferNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT transferFromNFT`, async () => {
        await transferFromNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT transferFromNftProxy proxy`, async () => {
        // transferFrom treasury->transfer167Contract
        await transferFromNftProxyTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT transferNFTsTest proxy`, async () => {
        await transferNFTsTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serialNumbers.shift(),
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT cryptoTransferV1 proxy`, async () => {
        await cryptoTransferV1Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serialNumbers.shift(),
          serialNumbers.shift(),
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

    //TODO
    xdescribe(`Relay: ${displayAddress} negative cases`, async () => {
      let transferNotApprovedContract, receiverContract;

      before(async () => {
        [transferNotApprovedContract, receiverContract] =
          await deployTestContract(address, 0, false, true);
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
    });
  }

  describe("HTS 0x167", async () => {
    await ercEventsTests(HTS_ADDRESS);
  });

  describe("HTS 0x16c", async () => {
    await ercEventsTests(HTS_ADDRESS_V2);
  });
});
