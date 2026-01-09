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
  async function transferTokenTest(testContract, responseCode) {
    const amount = 1;
    const rc = await (
      await testContract.transferToken(
        tokenAddress,
        treasury,
        testContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      testContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: testContract.target, amount: amount },
    ]);
  }

  async function transferFromTest(testContract, responseCode) {
    const amount = 1;
    const rc = await (
      await testContract.transferFrom(
        tokenAddress,
        treasury,
        testContract,
        amount,
      )
    ).wait();
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      testContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: testContract.target, amount: amount },
    ]);
  }

  async function transferFtProxyTest(testContract, responseCode) {
    // associated + KYC for signers[0].address
    await (
      await htsContract.associateToken(signers[0].address, tokenAddress)
    ).wait();
    await (
      await treasury.grantTokenKycPublic(tokenAddress, signers[0].address)
    ).wait();
    const amount = 1;
    // TODO
    //  Error raised while fetching estimateGas from mirror-node: {"detail":"","data":"0x","statusCode":400}
    //  Error executing method: rpcMethodName=eth_estimateGas, error=execution reverted
    ethers.provider.estimateGas = async () => 1_000_000;
    const rc = await (
      await testContract.transferFtProxy(
        tokenAddress,
        signers[0].address,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      testContract.target,
      signers[0].address,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: testContract.target, to: signers[0].address, amount: amount },
    ]);
  }

  async function transferFromFtProxyTest(testContract, responseCode) {
    const amount = 1;
    const rc = await (
      await testContract.transferFromFtProxy(
        tokenAddress,
        treasury,
        testContract,
        amount,
      )
    ).wait();
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      treasury.target,
      testContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      { from: treasury.target, to: testContract.target, amount: amount },
    ]);
  }

  describe("HTS 0x167", async () => {
    describe("Relay: 0x167 positive cases", async () => {
      let events167Contract;

      before(async () => {
        events167Contract = await deployTestContract(HTS_ADDRESS, 1000);
      });

      it("0x167 FT transferToken", async () => {
        await transferTokenTest(events167Contract, ResponseCodeEnum.SUCCESS);
      });

      it("0x167 FT transferFrom", async () => {
        await transferFromTest(events167Contract, ResponseCodeEnum.SUCCESS);
      });

      it("0x167 FT transferFrom proxy + transfer proxy", async () => {
        // transferFrom treasury->events167Contract
        await transferFromFtProxyTest(
          events167Contract,
          ResponseCodeEnum.SUCCESS,
        );
        // transfer events167Contract->signers[0].address
        await transferFtProxyTest(events167Contract, ResponseCodeEnum.SUCCESS);
      });
    });

    describe("Relay: 0x167 negative cases", async () => {
      let events167NotApprovedContract;

      before(async () => {
        events167NotApprovedContract = await deployTestContract(HTS_ADDRESS, 0);
      });

      it("0x167 FT transferToken SPENDER_DOES_NOT_HAVE_ALLOWANCE", async () => {
        await transferTokenTest(
          events167NotApprovedContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      it("0x167 FT transferFrom SPENDER_DOES_NOT_HAVE_ALLOWANCE", async () => {
        await transferFromTest(
          events167NotApprovedContract,
          ResponseCodeEnum.SPENDER_DOES_NOT_HAVE_ALLOWANCE,
        );
      });

      //TODO
      it("0x167 FT transfer proxy INSUFFICIENT_TOKEN_BALANCE", async () => {
        await transferFtProxyTest(
          events167NotApprovedContract,
          ResponseCodeEnum.SUCCESS,
        );
      });

      //TODO
      it("0x167 FT transferFrom proxy //TODO error", async () => {
        await transferFromFtProxyTest(
          events167NotApprovedContract,
          ResponseCodeEnum.SUCCESS,
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
