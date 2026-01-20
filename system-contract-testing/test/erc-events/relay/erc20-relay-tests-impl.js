const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  validateResponseCodeEvent,
  validateErcEvent,
} = require("../../../utils/events");

// ---------------- Test util functions ----------------
async function validateRcWithErcEvent(rc, responseCode, expectedEvents) {
  // check ContractTransactionReceipt has event with correct ResponseCode
  await validateResponseCodeEvent(rc, responseCode.valueOf());
  if (responseCode === ResponseCodeEnum.SUCCESS) {
    // check ERC event
    return validateErcEvent(rc, expectedEvents);
  } else {
    // check there is no ERC events
    return validateErcEvent(rc, []);
  }
}

async function approveFt(transferContract, tokenAddress, amount) {
  const rc = await (
    await transferContract.approve(tokenAddress, amount)
  ).wait();
  console.log("%s approve:%s amount:%s", rc.hash, tokenAddress, amount);
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
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferToken(
        htsAddress,
        tokenAddress,
        transferContract,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFromTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferFrom(
        htsAddress,
        tokenAddress,
        transferContract,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFtProxyTest(
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferFtProxy(
        tokenAddress,
        receiverContract.target,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFromFtProxyTest(
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferFromFtProxy(
        tokenAddress,
        transferContract,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    responseCode,
  ) {
    const accounts = [
      transferContract.target,
      receiverContract1.target,
      receiverContract2.target,
    ];
    const amounts = [-3, 1, 2];
    const rc = await (
      await transferContract.transferTokens(
        htsAddress,
        tokenAddress,
        accounts,
        amounts,
      )
    ).wait();
    console.log(
      "%s FT transferTokens:%s accounts:%s amounts:%s",
      rc.hash,
      tokenAddress,
      accounts,
      amounts,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3 },
          { accountID: receiverContract1.target, amount: 1 },
          { accountID: receiverContract2.target, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const rc = await (
      await transferContract.cryptoTransferV1(htsAddress, tokenTransfers)
    ).wait();
    console.log(
      "%s FT cryptoTransferV1 tokenTransfers:%s",
      rc.hash,
      tokenTransfers,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
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
          { accountID: receiverContract1.target, amount: 1, isApproval: false },
          { accountID: receiverContract2.target, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
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
      "%s FT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      rc.hash,
      transferList,
      tokenTransfers,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
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
              amount: 1,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: tokenAddress,
        serial: 0,
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
