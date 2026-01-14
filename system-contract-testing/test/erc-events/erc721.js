const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const { deployTestContract } = require("./erc-events-main");
const { validateRcWithErcEvent } = require("./erc20");

// ---------------- Test util functions ----------------
async function approveNft(
    treasury,
    tokenAddress,
    transferContract,
    serialNumbers,
) {
  const serial = serialNumbers.shift();
  const rc = await (
      await treasury.approveNftPublic(tokenAddress, transferContract, serial)
  ).wait();
  console.log(
      "%s approveNft:%s spender:%s serialNumber:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      serial,
  );
  return serial;
}

// ---------------- Test functions ----------------
async function transferNFTTest(
    transferContract,
    tokenAddress,
    treasury,
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
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferFromNFTTest(
    transferContract,
    tokenAddress,
    treasury,
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
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferFromNftProxyTest(
    transferContract,
    tokenAddress,
    treasury,
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
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferNFTsTest(
    transferContract,
    tokenAddress,
    treasury,
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
      address: tokenAddress,
      from: treasury.target,
      to: transferContract.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber2,
    },
  ]);
}

async function cryptoTransferV1Test(
    transferContract,
    tokenAddress,
    treasury,
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
    "%s NFT cryptoTransferV1 tokenTransferList:%s",
    rc.hash,
    tokenTransferList,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: transferContract.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber2,
    },
  ]);
}

async function cryptoTransferV2Test(
    transferContract,
    tokenAddress,
    treasury,
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
    "%s NFT cryptoTransferV2 TransferList:%s tokenTransferList:%s",
    rc.hash,
    transferList,
    tokenTransferList,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: treasury.target,
      to: transferContract.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: treasury.target,
      to: receiverContract.target,
      serial: serialNumber2,
    },
  ]);
}

// ---------------- Tests setup ----------------
async function erc721EventsTests(htsAddress, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  let transferContract, receiverContract;

  before(async () => {
    [transferContract, receiverContract] = await deployTestContract(
      null,
      htsAddress,
      context.treasury,
      context.nftTokenAddress,
      0, // 0 approve because NFT will require separate approve for each token instance
    );
  });

  describe(`Relay: ${displayAddress} positive cases`, async () => {
    it(`${displayAddress} NFT transferNFT`, async () => {
      const serial = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      await transferNFTTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
        serial,
      );
    });

    it(`${displayAddress} NFT transferFromNFT`, async () => {
      const serial = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      await transferFromNFTTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
        serial,
      );
    });

    it(`${displayAddress} NFT transferFromNft proxy`, async () => {
      const serial = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      // transferFrom treasury->transfer167Contract
      await transferFromNftProxyTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
        serial,
      );
    });

    it(`${displayAddress} NFT transferNFTsTest`, async () => {
      const serial1 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      const serial2 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      await transferNFTsTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
        serial1,
        serial2,
      );
    });

    it(`${displayAddress} NFT cryptoTransferV1`, async () => {
      const serial1 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      const serial2 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      await cryptoTransferV1Test(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SUCCESS,
        serial1,
        serial2,
      );
    });

    it(`${displayAddress} NFT cryptoTransferV2`, async () => {
      const serial1 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      const serial2 = await approveNft(
        context.treasury,
        context.nftTokenAddress,
        transferContract,
        context.serialNumbers,
      );
      await cryptoTransferV2Test(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
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
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        context.serialNumbers.shift(),
      );
    });

    it(`${displayAddress} NFT transferFromNFT SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromNFTTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        context.serialNumbers.shift(),
      );
    });

    it(`${displayAddress} NFT transferFromNft proxy SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromNftProxyTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of SPENDER_DOES_NOT_HAVE_ALLOWANCE because we cant get revertReason tri try/catch
        context.serialNumbers.shift(),
      );
    });

    it(`${displayAddress} FT transferTokens proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferNFTsTest(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
      );
    });

    it(`${displayAddress} FT cryptoTransferV1 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV1Test(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
      );
    });

    it(`${displayAddress} FT cryptoTransferV2 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV2Test(
        transferContract,
        context.nftTokenAddress,
        context.treasury,
        receiverContract,
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
      );
    });
  });
}

module.exports = {
  approveNft,
  erc721EventsTests,
};
