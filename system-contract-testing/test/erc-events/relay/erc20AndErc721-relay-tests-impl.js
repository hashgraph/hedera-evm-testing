const { validateRcWithErcEvent } = require("./erc20-relay-tests-impl");

class Erc20Erc721RelayTestsImpl {
  engine() {
    return "Relay";
  }

  // ---------------- Test functions ----------------
  async cryptoTransferV1Test(
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
          { accountID: transferContract.target, amount: -1 },
          { accountID: receiverContract.target, amount: 1 },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract.target,
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

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverContract,
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
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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

  async airdropTokensTest(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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
      "%s FT/NFT airdropTokens tokenTransfers:%s",
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
          ],
    );
  }

  async claimAirdropsTest(
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
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: ftTokenAddress,
        serial: 0,
      },
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: nftTokenAddress,
        serial: serialNumber,
      },
    ];
    const rc = await (
      await receiverContract.claimAirdrops(htsAddress, pendingAirdrops)
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
}
module.exports = {
  Erc20Erc721RelayTestsImpl,
};
