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
    [sdkClient, treasury, tokenAddress, serialNumbers] =
      await beforeNftTests(20);
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

  async function approveNft(transferContract) {
    const serial = serialNumbers.shift();
    await (
      await treasury.approveNftPublic(tokenAddress, transferContract, serial)
    ).wait();
    return serial;
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
            isApproval: false,
          },
          {
            senderAccountID: treasury,
            receiverAccountID: receiverContract,
            serialNumber: serialNumber2,
            isApproval: false,
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
    let transferContract, receiverContract;

    before(async () => {
      [transferContract, receiverContract] = await deployTestContract(
        address,
        treasury,
        tokenAddress,
        0, // 0 approve because NFT will require separate approve for each token instance
      );
    });

    describe(`Relay: ${displayAddress} positive cases`, async () => {
      it(`${displayAddress} NFT transferNFT`, async () => {
        const serial = await approveNft(transferContract);
        await transferNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial,
        );
      });

      it(`${displayAddress} NFT transferFromNFT`, async () => {
        const serial = await approveNft(transferContract);
        await transferFromNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial,
        );
      });

      it(`${displayAddress} NFT transferFromNft proxy`, async () => {
        const serial = await approveNft(transferContract);
        // transferFrom treasury->transfer167Contract
        await transferFromNftProxyTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial,
        );
      });

      it(`${displayAddress} NFT transferNFTsTest`, async () => {
        const serial1 = await approveNft(transferContract);
        const serial2 = await approveNft(transferContract);
        await transferNFTsTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial1,
          serial2,
        );
      });

      it(`${displayAddress} NFT cryptoTransferV1`, async () => {
        const serial1 = await approveNft(transferContract);
        const serial2 = await approveNft(transferContract);
        await cryptoTransferV1Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial1,
          serial2,
        );
      });

      it(`${displayAddress} NFT cryptoTransferV2`, async () => {
        const serial1 = await approveNft(transferContract);
        const serial2 = await approveNft(transferContract);
        await cryptoTransferV2Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
          serial1,
          serial2,
        );
      });
    });

    describe(`Relay: ${displayAddress} negative cases`, async () => {
      it(`${displayAddress} NFT transferNFT SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} NFT transferFromNFT SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferFromNFTTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} NFT transferFromNft proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
        await transferFromNftProxyTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT transferTokens proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await transferNFTsTest(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
          serialNumbers.shift(),
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT cryptoTransferV1 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await cryptoTransferV1Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
          serialNumbers.shift(),
          serialNumbers.shift(),
        );
      });

      it(`${displayAddress} FT cryptoTransferV2 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
        await cryptoTransferV2Test(
          transferContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
          serialNumbers.shift(),
          serialNumbers.shift(),
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
