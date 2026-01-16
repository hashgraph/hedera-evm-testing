const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const { validateRcWithErcEvent } = require("./erc20");
const Constants = require("../../utils/constants");

// ---------------- Test functions ----------------
async function cryptoTransferV1Test(
  htsAddress,
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const tokenTransfers = [
    {
      token: ftTokenAddress,
      transfers: [
        { accountID: transferContract, amount: -1 },
        { accountID: receiverContract, amount: 1 },
      ],
      nftTransfers: [],
    },
    {
      token: nftTokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract,
          serialNumber: serialNumber,
        },
      ],
    },
  ];
  const rc = await (
    await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
  ).wait();
  console.log(
    "%s FT/NFT cryptoTransferV1 tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: ftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: 1,
    },
    {
      address: nftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function cryptoTransferV2Test(
  htsAddress,
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  ftReceiverContract,
  nftReceiverContract,
  serialNumber,
  responseCode,
) {
  const transferList = {
    transfers: [],
  };
  const tokenTransfers = [
    {
      token: ftTokenAddress,
      transfers: [
        { accountID: transferContract, amount: -1, isApproval: false },
        { accountID: ftReceiverContract, amount: 1, isApproval: false },
      ],
      nftTransfers: [],
    },
    {
      token: nftTokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: transferContract.target,
          receiverAccountID: nftReceiverContract.target,
          serialNumber: serialNumber,
          isApproval: false,
        },
      ],
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
    "%s FT/NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
    rc.hash,
    transferList,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: ftTokenAddress,
      from: transferContract.target,
      to: ftReceiverContract.target,
      amount: 1,
    },
    {
      address: nftTokenAddress,
      from: transferContract.target,
      to: nftReceiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function airdropTokensTest(
  htsAddress,
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const tokenTransfers = [
    {
      token: ftTokenAddress,
      transfers: [
        { accountID: transferContract, amount: -1, isApproval: false },
        { accountID: receiverContract, amount: 1, isApproval: false },
      ],
      nftTransfers: [],
    },
    {
      token: nftTokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract,
          serialNumber: serialNumber,
          isApproval: false,
        },
      ],
    },
  ];
  const rc = await (
    await transferContract.airdropTokens(htsAddress, tokenTransfers)
  ).wait();
  console.log(
    "%s FT/NFT airdropTokens tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: ftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: 1,
    },
    {
      address: nftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function claimAirdropsTest(
  htsAddress,
  transferContract,
  ftTokenAddress,
  nftTokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const pendingAirdrops = [
    {
      sender: transferContract,
      receiver: receiverContract,
      token: ftTokenAddress,
    },
    {
      sender: transferContract,
      receiver: receiverContract,
      token: nftTokenAddress,
      serial: serialNumber,
    },
  ];
  const rc = await (
    await transferContract.claimAirdrops(htsAddress, pendingAirdrops)
  ).wait();
  console.log(
    "%s FT/NFT claimAirdrops pendingAirdrops:%s",
    rc.hash,
    pendingAirdrops,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: ftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      amount: 1,
    },
    {
      address: nftTokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function erc20AndErc721EventsTests(htsAddress, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------
  it(`${displayAddress} FT/NFT cryptoTransferV1 proxy`, async () => {
    await cryptoTransferV1Test(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  it(`${displayAddress} FT/NFT cryptoTransferV2 proxy`, async () => {
    await cryptoTransferV2Test(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  // TODO
  it(`${displayAddress} FT/NFT airdropTokens`, async () => {
    await airdropTokensTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      context.receiverContract1,
      context.serialNumbers.shift(),
      ResponseCodeEnum.SUCCESS,
    );
  });

  // TODO
  it(`${displayAddress} FT/NFT claimAirdrops`, async () => {
    // not associated receiver for pending airdrop
    const receiver = await contractDeployAndFund(
      Constants.Contract.ErcEventsReceiverContract,
    );
    const serial = context.serialNumbers.shift();
    // send pending airdrop
    await airdropTokensTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      receiver,
      serial,
      ResponseCodeEnum.SUCCESS,
    );
    // claim pending airdrop
    await claimAirdropsTest(
      htsAddress,
      context.transferContract,
      context.ftTokenAddress,
      context.nftTokenAddress,
      receiver,
      serial,
      ResponseCodeEnum.SUCCESS,
    );
  });
}

module.exports = {
  erc20AndErc721EventsTests,
};
