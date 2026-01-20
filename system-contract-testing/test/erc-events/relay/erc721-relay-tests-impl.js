const { validateRcWithErcEvent } = require("./erc20-relay-tests-impl");

// ---------------- Test util functions ----------------
async function approveNft(treasury, tokenAddress, sender, serialNumber) {
  const rc = await (
    await treasury.approveNftPublic(tokenAddress, sender, serialNumber)
  ).wait();
  console.log(
    "%s approveNftPublic:%s sender:%s serialNumber:%s",
    rc.hash,
    tokenAddress,
    sender.target,
    serialNumber,
  );
}

class Erc721RelayTestsImpl {
  engine() {
    return "Relay";
  }

  // ---------------- Test functions ----------------
  async transferNFTTest(
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

  async transferFromNFTTest(
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

  async transferFromNftProxyTest(
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

  async transferNFTsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const senders = [transferContract.target, transferContract.target];
    const receivers = [receiverContract1.target, receiverContract2.target];
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

  async cryptoTransferV1Test(
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
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract1.target,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract2.target,
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

  async cryptoTransferV2Test(
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
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract1.target,
            serialNumber: serialNumber1,
            isApproval: false,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract2.target,
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

  async airdropTokensTest(
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
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract.target,
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
      "%s FT airdropTokens tokenTransfers:%s",
      rc.hash,
      tokenTransfers,
    );
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

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
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
}

module.exports = {
  approveNft,
  Erc721RelayTestsImpl,
};
