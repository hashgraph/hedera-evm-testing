const { ethers } = require("hardhat");
const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  beforeFtTests,
  deployTestContract,
  afterTests,
} = require("./erc-events-main");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");
const {
  validateResponseCodeEvent,
  validateErc20Event,
} = require("../../utils/events");

describe("ERC20 events", () => {
  let signers, sdkClient, htsContract, treasury, tokenAddress;

  before(async () => {
    [signers, sdkClient, htsContract, treasury, tokenAddress] =
      await beforeFtTests();
  });

  after(async () => {
    await afterTests();
  });

  // ---------------- Test util functions ----------------
  async function validateRcWithErcEvent(rc, responseCode, expectedEvents) {
    // check ContractTransactionReceipt has event with correct ResponseCode
    await validateResponseCodeEvent(rc, responseCode.valueOf());
    if (responseCode === ResponseCodeEnum.SUCCESS) {
      // check ERC event
      return validateErc20Event(rc, expectedEvents);
    } else {
      // check there is no ERC events
      return validateErc20Event(rc, []);
    }
  }

  // ---------------- Test functions ----------------
  async function transferTokenTest(
    transferContract,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferToken(
        tokenAddress,
        treasury,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  async function transferFromTest(
    transferContract,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferFrom(
        tokenAddress,
        treasury,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  async function transferFtProxyTest(
    transferContract,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    // TODO
    //  Error raised while fetching estimateGas from mirror-node: {"detail":"","data":"0x","statusCode":400}
    //  Error executing method: rpcMethodName=eth_estimateGas, error=execution reverted
    ethers.provider.estimateGas = async () => 1_000_000;
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
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async function transferFromFtProxyTest(
    transferContract,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const rc = await (
      await transferContract.transferFromFtProxy(
        tokenAddress,
        treasury,
        receiverContract,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: receiverContract.target, amount: amount },
    ]);
  }

  describe("HTS 0x167", async () => {
    describe("Relay: 0x167 positive cases", async () => {
      let transfer167Contract, receiverContract;

      before(async () => {
        [transfer167Contract, receiverContract] = await deployTestContract(
          HTS_ADDRESS,
          1000,
        );
      });

      it("0x167 FT transferToken", async () => {
        await transferTokenTest(
          transfer167Contract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it("0x167 FT transferFrom", async () => {
        await transferFromTest(
          transfer167Contract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it("0x167 FT transfer proxy", async () => {
        // transferFrom treasury->transfer167Contract
        await transferTokenTest(
          transfer167Contract,
          transfer167Contract,
          ResponseCodeEnum.SUCCESS,
        );
        // transfer transfer167Contract->receiverContract
        await transferFtProxyTest(
          transfer167Contract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      it("0x167 FT transferFrom proxy", async () => {
        // transferFrom treasury->transfer167Contract
        await transferFromFtProxyTest(
          transfer167Contract,
          receiverContract,
          ResponseCodeEnum.SUCCESS,
        );
      });
    });

    describe("Relay: 0x167 negative cases", async () => {
      let transfer167NotApprovedContract, receiverContract;

      before(async () => {
        [transfer167NotApprovedContract, receiverContract] =
          await deployTestContract(HTS_ADDRESS, 0, false, true);
      });

      it("0x167 FT transferToken SPENDER_DOES_NOT_HAVE_ALLOWANCE", async () => {
        await transferTokenTest(
          transfer167NotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it("0x167 FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE", async () => {
        await transferFromTest(
          transfer167NotApprovedContract,
          receiverContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      //TODO
      it("0x167 FT transfer proxy INSUFFICIENT_TOKEN_BALANCE", async () => {
        await transferFtProxyTest(
          transfer167NotApprovedContract,
          receiverContract,
          ResponseCodeEnum.UNKNOWN,
        );
      });

      //TODO
      it("0x167 FT transferFrom proxy //TODO error", async () => {
        await transferFromFtProxyTest(
          transfer167NotApprovedContract,
          receiverContract,
          ResponseCodeEnum.UNKNOWN,
        );
      });
    });

    describe("SDK: 0x167 positive cases", async () => {
      // TODO
    });

    describe("SDK: 0x167 negative cases", async () => {
      // TODO
    });
  });

  describe("HTS 0x16c", async () => {
    //TODO
  });
});
