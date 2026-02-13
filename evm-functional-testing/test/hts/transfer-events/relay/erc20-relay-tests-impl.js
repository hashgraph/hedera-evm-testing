const { ethers } = require("hardhat");
const { ResponseCodeEnum } = require("@hiero-ledger/proto").proto;
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../../../utils/events");

// ---------------- Test util functions ----------------
/**
 * Validates transaction receipt for expected ERC events
 *
 * @param { ethers.ContractTransactionReceipt } receipt receipt of the transaction
 * @param { Number } responseCode expected response code of function execution
 * @param { Array<Object> } expectedEvents expected ERC events of function execution
 * @returns {Promise<void>}
 */
async function validateRcWithErcEvent(receipt, responseCode, expectedEvents) {
  // check ContractTransactionReceipt has event with correct ResponseCode
  await validateResponseCodeEvent(receipt, responseCode.valueOf());
  if (responseCode === ResponseCodeEnum.SUCCESS) {
    // check ERC event
    return validateErcEvent(receipt, expectedEvents);
  } else {
    // check there is no ERC events
    return validateErcEvent(receipt, []);
  }
}

async function approveFt(transferContract, tokenAddress, amount) {
  const receipt = await (
    await transferContract.approve(tokenAddress, amount)
  ).wait();
  console.log("%s approve:%s amount:%s", receipt.hash, tokenAddress, amount);
}

class Erc20RelayTestsImpl {
  engine() {
    return "Relay";
  }

  // ---------------- Test functions ----------------
  async transferTokenTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
  ) {
    const amount = 1;
    const receipt = await (
      await transferContract.transferToken(
        htsAddress,
        tokenAddress,
        transferContract,
        receiverWallet,
        amount,
      )
    ).wait();
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFromTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
  ) {
    const amount = 1;
    const receipt = await (
      await transferContract.transferFrom(
        htsAddress,
        tokenAddress,
        transferContract,
        receiverWallet,
        amount,
      )
    ).wait();
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFtProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
  ) {
    const amount = 1;
    const receipt = await (
      await transferContract.transferFtProxy(
        tokenAddress,
        receiverWallet.address,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFromFtProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
  ) {
    const amount = 1;
    const receipt = await (
      await transferContract.transferFromFtProxy(
        tokenAddress,
        transferContract,
        receiverWallet,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    responseCode,
  ) {
    const accounts = [
      transferContract.target,
      receiverWallet1.address,
      receiverWallet2.address,
    ];
    const amounts = [-3, 1, 2];
    const receipt = await (
      await transferContract.transferTokens(
        htsAddress,
        tokenAddress,
        accounts,
        amounts,
      )
    ).wait();
    console.log(
      "%s FT transferTokens:%s accounts:%s amounts:%s",
      receipt.hash,
      tokenAddress,
      accounts,
      amounts,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3 },
          { accountID: receiverWallet1.address, amount: 1 },
          { accountID: receiverWallet2.address, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const receipt = await (
      await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
    ).wait();
    console.log(
      "%s FT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
      tokenTransfers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    responseCode,
  ) {
    const transferList = {
      transfers: [],
    };
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3, isApproval: false },
          { accountID: receiverWallet1.address, amount: 1, isApproval: false },
          { accountID: receiverWallet2.address, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
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
      "%s FT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      tokenTransfers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
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
              amount: 1,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
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
        serial: 0,
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
        amount: 1,
      },
    ]);
  }
}

module.exports = {
  validateRcWithErcEvent,
  approveFt,
  Erc20RelayTestsImpl,
};
