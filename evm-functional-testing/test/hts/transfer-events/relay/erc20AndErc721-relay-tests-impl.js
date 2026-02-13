const { validateRcWithErcEvent } = require("./erc20-relay-tests-impl");
const {ethers} = require("hardhat");
const {validateErcEvent} = require("../../../../utils/events");

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
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1 },
          { accountID: receiverWallet.address, amount: 1 },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet.address,
            serialNumber: serialNumber,
          },
        ],
      },
    ];
    const receipt = await (
      await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
    ).wait();
    console.log(
      "%s FT/NFT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
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
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet.address,
            serialNumber: serialNumber,
            isApproval: false,
          },
        ],
      },
    ];
    const receipt = await (
      await transferContract.cryptoTransferV2(
        htsAddress,
        transferList,
        tokenTransfers,
      )
    ).wait();
    console.log(
      "%s FT/NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet.address,
            serialNumber: serialNumber,
            isApproval: false,
          },
        ],
      },
    ];
    const receipt = await (
      await transferContract.airdropTokens(htsAddress, tokenTransfers)
    ).wait();
    console.log(
      "%s FT/NFT airdropTokens tokenTransfers:%s",
      receipt.hash,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(
      receipt,
      responseCode,
      pendingAirdrops
        ? []
        : [
            {
              address: ftTokenAddress,
              from: transferContract.target,
              to: receiverWallet.address,
              amount: 1,
            },
            {
              address: nftTokenAddress,
              from: transferContract.target,
              to: receiverWallet.address,
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
    receiverWallet,
    serialNumber,
    responseCode,
    IHederaTokenService,
  ) {
    const htsContract = new ethers.Contract(
      htsAddress,
      IHederaTokenService,
      receiverWallet,
    );
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: ftTokenAddress,
        serial: 0,
      },
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: nftTokenAddress,
        serial: serialNumber,
      },
    ];
    const receipt = await (
      await htsContract.claimAirdrops(pendingAirdrops)
    ).wait();
    console.log(
      "%s FT/NFT claimAirdrops pendingAirdrops:%s",
      receipt.hash,
      JSON.stringify(pendingAirdrops),
    );
    // we are validation just ERC event, without ResponseCode event, because we are requesting htsContract directly
    await validateErcEvent(receipt, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }
}
module.exports = {
  Erc20Erc721RelayTestsImpl,
};
