const { validateRcWithErcEvent } = require("./erc20-relay-tests-impl");
const {ethers} = require("hardhat");
const {validateErcEvent} = require("../../../../utils/events");

// ---------------- Test util functions ----------------
async function approveNft(treasury, tokenAddress, sender, serialNumber) {
  const receipt = await (
    await treasury.approveNftPublic(tokenAddress, sender, serialNumber)
  ).wait();
  console.log(
    "%s approveNftPublic:%s sender:%s serialNumber:%s",
    receipt.hash,
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
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const receipt = await (
      await transferContract.transferNFT(
        htsAddress,
        tokenAddress,
        transferContract,
        receiverWallet,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNFTTest(
    htsAddress,
    transferContract,
    tokenAddress,
    senderContract,
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const receipt = await (
      await transferContract.transferFromNFT(
        htsAddress,
        tokenAddress,
        senderContract,
        receiverWallet,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferFromNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: senderContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNftProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const receipt = await (
      await transferContract.transferFromNftProxy(
        tokenAddress,
        transferContract,
        receiverWallet,
        serialNumber,
      )
    ).wait();
    console.log(
      "%s transferFromNft proxy:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferNFTsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const senders = [transferContract.target, transferContract.target];
    const receivers = [receiverWallet1.address, receiverWallet2.address];
    const serialNumbers = [serialNumber1, serialNumber2];
    const receipt = await (
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
      receipt.hash,
      tokenAddress,
      senders,
      receivers,
      serialNumbers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
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
            receiverAccountID: receiverWallet1.address,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet2.address,
            serialNumber: serialNumber2,
          },
        ],
      },
    ];
    const receipt = await (
      await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
    ).wait();
    console.log(
      "%s NFT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
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
            receiverAccountID: receiverWallet1.address,
            serialNumber: serialNumber1,
            isApproval: false,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet2.address,
            serialNumber: serialNumber2,
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
      "%s NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
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
      "%s FT airdropTokens tokenTransfers:%s",
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
              address: tokenAddress,
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
    tokenAddress,
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
        token: tokenAddress,
        serial: serialNumber,
      },
    ];
    const receipt = await (
      await htsContract.claimAirdrops(pendingAirdrops)
    ).wait();
    console.log(
      "%s FT claimAirdrops pendingAirdrops:%s",
      receipt.hash,
      JSON.stringify(pendingAirdrops),
    );
    // we are validation just ERC event, without ResponseCode event, because we are requesting htsContract directly
    await validateErcEvent(receipt, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }
}

module.exports = {
  approveNft,
  Erc721RelayTestsImpl,
};
