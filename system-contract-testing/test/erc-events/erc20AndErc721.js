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
  const tokenTransfers = [
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
    await transferContract.cryptoTransferV1(tokenTransfers)
  ).wait();
  console.log(
    "%s FT/NFT cryptoTransferV1 tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
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
  const tokenTransfers = [
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
    await transferContract.cryptoTransferV2(transferList, tokenTransfers)
  ).wait();
  console.log(
    "%s FT/NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
    rc.hash,
    transferList,
    tokenTransfers,
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

async function airdropTokensTest(
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
  const tokenTransfers = [
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
          senderAccountID: treasury,
          receiverAccountID: transferContract,
          serialNumber: serialNumber1,
          isApproval: false,
        },
        {
          senderAccountID: treasury,
          receiverAccountID: nftReceiverContract,
          serialNumber: serialNumber2,
          isApproval: false,
        },
      ],
    },
  ];
  const rc = await (
    await transferContract.airdropTokens(tokenTransfers)
  ).wait();
  console.log(
    "%s FT/NFT airdropTokens tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
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

async function claimAirdropsTest(
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
  const pendingAirdrops = [
    {
      sender: treasury,
      receiver: ftReceiverContract,
      token: ftTokenAddress,
    },
    {
      sender: treasury,
      receiver: transferContract,
      token: ftTokenAddress,
    },
    {
      sender: treasury,
      receiver: nftReceiverContract,
      token: nftTokenAddress,
      serial: serialNumber1,
    },
    {
      sender: treasury,
      receiver: transferContract,
      token: nftTokenAddress,
      serial: serialNumber2,
    },
  ];
  const rc = await (
    await transferContract.claimAirdrops(pendingAirdrops)
  ).wait();
  console.log(
    "%s FT/NFT claimAirdrops pendingAirdrops:%s",
    rc.hash,
    pendingAirdrops,
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

  xit(`${displayAddress} FT/NFT cryptoTransferV1 proxy`, async () => {
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

  xit(`${displayAddress} FT/NFT cryptoTransferV2 proxy`, async () => {
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

  // TODO
  it(`${displayAddress} FT/NFT airdropTokens`, async () => {
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
    await airdropTokensTest(
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

  // TODO
  it(`${displayAddress} FT/NFT claimAirdrops`, async () => {
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
    // send pending airdrop
    await airdropTokensTest(
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
    // claim pending airdrop
    await claimAirdropsTest(
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
