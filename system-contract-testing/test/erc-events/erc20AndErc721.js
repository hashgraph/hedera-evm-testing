const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const { deployTestContract } = require("./erc-events-main");
const { validateRcWithErcEvent } = require("./erc20");
const { approveNft } = require("./erc721");

// ---------------- Test functions ----------------
async function cryptoTransferV1Test(
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  treasury,
  ftReceiverContract,
  nftReceiverContract,
  responseCode,
  serialNumber1,
  serialNumber2,
) {
  const tokenTransferList = [
    {
      token: ftTokenAddress,
      transfers: [
        { accountID: treasury, amount: -3 },
        { accountID: transferContract, amount: 1 },
        { accountID: ftReceiverContract, amount: 2 },
      ],
      nftTransfers: [],
    },
    {
      token: nftTokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: treasury,
          receiverAccountID: transferContract,
          serialNumber: serialNumber1,
        },
        {
          senderAccountID: treasury,
          receiverAccountID: nftReceiverContract,
          serialNumber: serialNumber2,
        },
      ],
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
      address: ftTokenAddress,
      from: treasury.target,
      to: transferContract.target,
      amount: 1,
    },
    {
      address: ftTokenAddress,
      from: treasury.target,
      to: ftReceiverContract.target,
      amount: 2,
    },
    {
      address: nftTokenAddress,
      from: treasury.target,
      to: transferContract.target,
      serial: serialNumber1,
    },
    {
      address: nftTokenAddress,
      from: treasury.target,
      to: nftReceiverContract.target,
      serial: serialNumber2,
    },
  ]);
}

async function cryptoTransferV2Test(
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  treasury,
  ftReceiverContract,
  nftReceiverContract,
  responseCode,
  serialNumber1,
  serialNumber2,
) {
  const transferList = {
    transfers: [],
  };
  const tokenTransferList = [
    {
      token: ftTokenAddress,
      transfers: [
        { accountID: treasury, amount: -3, isApproval: false },
        { accountID: transferContract, amount: 1, isApproval: false },
        { accountID: ftReceiverContract, amount: 2, isApproval: false },
      ],
      nftTransfers: [],
    },
    {
      token: nftTokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: treasury.target,
          receiverAccountID: transferContract.target,
          serialNumber: serialNumber1,
          isApproval: false,
        },
        {
          senderAccountID: treasury.target,
          receiverAccountID: nftReceiverContract.target,
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
    "%s FT cryptoTransferV2 TransferList:%s tokenTransferList:%s",
    rc.hash,
    transferList,
    tokenTransferList,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: ftTokenAddress,
      from: treasury.target,
      to: transferContract.target,
      amount: 1,
    },
    {
      address: ftTokenAddress,
      from: treasury.target,
      to: ftReceiverContract.target,
      amount: 2,
    },
    {
      address: nftTokenAddress,
      from: treasury.target,
      to: transferContract.target,
      serial: serialNumber1,
    },
    {
      address: nftTokenAddress,
      from: treasury.target,
      to: nftReceiverContract.target,
      serial: serialNumber2,
    },
  ]);
}

async function erc20AndErc721EventsTests(htsAddress, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  let transferContract, ftReceiverContract, nftReceiverContract;

  before(async () => {
    [transferContract, ftReceiverContract] = await deployTestContract(
      null,
      htsAddress,
      context.treasury,
      context.ftTokenAddress,
      1000,
    );
    [transferContract, nftReceiverContract] = await deployTestContract(
      transferContract,
      htsAddress,
      context.treasury,
      context.nftTokenAddress,
      0,
    );
  });

  it(`${displayAddress} FT cryptoTransferV1 proxy`, async () => {
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
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.treasury,
      ftReceiverContract,
      nftReceiverContract,
      ResponseCodeEnum.SUCCESS,
      serial1,
      serial2,
    );
  });

  it(`${displayAddress} FT cryptoTransferV2 proxy`, async () => {
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
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.treasury,
      ftReceiverContract,
      nftReceiverContract,
      ResponseCodeEnum.SUCCESS,
      serial1,
      serial2,
    );
  });
}

module.exports = {
  erc20AndErc721EventsTests,
};
