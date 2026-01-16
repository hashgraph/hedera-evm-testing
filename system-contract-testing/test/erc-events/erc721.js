const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const { validateRcWithErcEvent } = require("./erc20");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");

// ---------------- Test util functions ----------------
async function approveNft(treasury, tokenAddress, sender, serialNumber) {
  const rc = await (
    await treasury.approveNftPublic(tokenAddress, sender, serialNumber)
  ).wait();
  console.log(
    "%s approveNftPublic:%s sender:%s serialNumber:%s",
    rc.hash,
    tokenAddress,
    sender,
    serialNumber,
  );
}

// ---------------- Test functions ----------------
async function transferNFTTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const rc = await (
    await transferContract.transferNFT(
      htsAddress,
      tokenAddress,
      transferContract,
      receiverContract,
      serialNumber,
    )
  ).wait();
  console.log(
    "%s transferNFT:%s from:%s to:%s serialNumber:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    serialNumber,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferFromNFTTest(
  htsAddress,
  transferContract,
  tokenAddress,
  senderContract,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const rc = await (
    await transferContract.transferFromNFT(
      htsAddress,
      tokenAddress,
      senderContract,
      receiverContract,
      serialNumber,
    )
  ).wait();
  console.log(
    "%s transferFromNFT:%s from:%s to:%s serialNumber:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    serialNumber,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: senderContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferFromNftProxyTest(
  transferContract,
  tokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const rc = await (
    await transferContract.transferFromNftProxy(
      tokenAddress,
      transferContract,
      receiverContract,
      serialNumber,
    )
  ).wait();
  console.log(
    "%s transferFromNft proxy:%s from:%s to:%s serialNumber:%s",
    rc.hash,
    tokenAddress,
    transferContract.target,
    receiverContract.target,
    serialNumber,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract.target,
      serial: serialNumber,
    },
  ]);
}

async function transferNFTsTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  serialNumber1,
  serialNumber2,
  responseCode,
) {
  const senders = [transferContract, transferContract];
  const receivers = [receiverContract1, receiverContract2];
  const serialNumbers = [serialNumber1, serialNumber2];
  const rc = await (
    await transferContract.transferNFTs(
      htsAddress,
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
      from: transferContract.target,
      to: receiverContract1.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      serial: serialNumber2,
    },
  ]);
}

async function cryptoTransferV1Test(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  serialNumber1,
  serialNumber2,
  responseCode,
) {
  const tokenTransfers = [
    {
      token: tokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract1,
          serialNumber: serialNumber1,
        },
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract2,
          serialNumber: serialNumber2,
        },
      ],
    },
  ];
  const rc = await (
    await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
  ).wait();
  console.log(
    "%s NFT cryptoTransferV1 tokenTransfers:%s",
    rc.hash,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract1.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      serial: serialNumber2,
    },
  ]);
}

async function cryptoTransferV2Test(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract1,
  receiverContract2,
  serialNumber1,
  serialNumber2,
  responseCode,
) {
  const transferList = {
    transfers: [],
  };
  const tokenTransfers = [
    {
      token: tokenAddress,
      transfers: [],
      nftTransfers: [
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract1,
          serialNumber: serialNumber1,
          isApproval: false,
        },
        {
          senderAccountID: transferContract,
          receiverAccountID: receiverContract2,
          serialNumber: serialNumber2,
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
    "%s NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
    rc.hash,
    transferList,
    tokenTransfers,
  );
  await validateRcWithErcEvent(rc, responseCode, [
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract1.target,
      serial: serialNumber1,
    },
    {
      address: tokenAddress,
      from: transferContract.target,
      to: receiverContract2.target,
      serial: serialNumber2,
    },
  ]);
}

async function airdropTokensTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
  pendingAirdrops,
) {
  const tokenTransfers = [
    {
      token: tokenAddress,
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
            serial: serialNumber,
          },
        ],
  );
}

async function claimAirdropsTest(
  htsAddress,
  transferContract,
  tokenAddress,
  receiverContract,
  serialNumber,
  responseCode,
) {
  const pendingAirdrops = [
    {
      sender: transferContract,
      receiver: receiverContract,
      token: tokenAddress,
      serial: serialNumber,
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
      serial: serialNumber,
    },
  ]);
}

// ---------------- Tests setup ----------------
async function erc721EventsTests(htsAddress, runProxyTests, context) {
  const displayAddress = htsAddress.replace(/(0)\1+/g, "");

  // ---------------- Tests setup ----------------

  describe(`Relay: ${displayAddress} positive cases`, async () => {
    it(`${displayAddress} NFT transferNFT`, async () => {
      await transferNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} NFT transferFromNFT`, async () => {
      // mint nft token at treasury
      const serialNumber = (
        await (
          await context.treasury.mintTokenPublic(context.nftTokenAddress, 0, [
            "0x0101",
          ])
        ).wait()
      ).logs.find((e) => e.fragment.name === Constants.Events.MintedToken).args
        .serialNumbers[0];
      // approve minted nft transfer from treasury
      await approveNft(
        context.treasury,
        context.nftTokenAddress,
        context.transferContract,
        serialNumber,
      );
      // transfer from treasury to receiverContract1
      await transferFromNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.treasury,
        context.receiverContract1,
        serialNumber,
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} NFT transferFromNft proxy`, async () => {
      await transferFromNftProxyTest(
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} NFT transferNFTsTest`, async () => {
      await transferNFTsTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} NFT cryptoTransferV1`, async () => {
      await cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} NFT cryptoTransferV2`, async () => {
      await cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverContract2,
        context.serialNumbers.shift(),
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
      );
    });

    it(`${displayAddress} FT airdropTokens`, async () => {
      await airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.serialNumbers.shift(),
        ResponseCodeEnum.SUCCESS,
        false,
      );
    });
  });

  describe(`Relay: ${displayAddress} negative cases`, async () => {
    it(`${displayAddress} NFT transferNFT TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} NFT transferFromNFT SPENDER_DOES_NOT_HAVE_ALLOWANCE`, async () => {
      await transferFromNFTTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.transferContract,
        context.receiverContract1,
        context.serialNumbers[0],
        ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
      );
    });

    it(`${displayAddress} NFT transferFromNft proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferFromNftProxyTest(
        context.transferContract,
        context.nftTokenAddress,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        ResponseCodeEnum.UNKNOWN, // using UNKNOWN instead of TOKEN_NOT_ASSOCIATED_TO_ACCOUNT because we cant get revertReason tri try/catch
      );
    });

    it(`${displayAddress} FT transferTokens proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await transferNFTsTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT cryptoTransferV1 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV1Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT cryptoTransferV2 proxy TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, async () => {
      await cryptoTransferV2Test(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        context.receiverContract1,
        context.receiverNotAssociated,
        context.serialNumbers[0],
        context.serialNumbers[1],
        ResponseCodeEnum.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT,
      );
    });

    it(`${displayAddress} FT claimAirdrops`, async () => {
      // not associated receiver for pending aidrop
      const receiver = await contractDeployAndFund(
        Constants.Contract.ErcEventsReceiverContract,
      );
      const serial = context.serialNumbers.shift();
      // send pending airdrop
      await airdropTokensTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        receiver,
        serial,
        ResponseCodeEnum.SUCCESS,
        true,
      );
      // claim pending airdrop
      await claimAirdropsTest(
        htsAddress,
        context.transferContract,
        context.nftTokenAddress,
        receiver,
        serial,
        ResponseCodeEnum.SUCCESS,
      );
    });
  });
}

module.exports = {
  erc721EventsTests,
};
