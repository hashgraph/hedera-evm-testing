const { ethers } = require("hardhat");
const {
  GAS_LIMIT_2_000_000,
  TINYBAR_TO_WEIBAR_COEF,
} = require("../../utils/constants");
const {
  expectScheduleCallEvent,
  getExpirySecond,
  getRecursiveScheduleStatus,
  SUCCESS,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./utils/hip1215-setup");
const { expect } = require("chai");
const { ResponseCodeEnum } = require("@hiero-ledger/proto").proto;

describe("HIP-1215 System Contract testing. Recursive scheduling test", () => {
  let hip1215, signers, mnClient;

  // ----------------- Tests
  before(async () => {
    [hip1215, signers, mnClient] = await beforeTests();
  });

  // schedules result check ofter tests passes to save the time
  after(async () => {
    await afterTests();
  });

  // using separate test class to create separate `hip1215` contract,
  // because we do not want `hip1215` balance to be affected by other tests and test schedules
  describe("Recursive scheduling test", () => {
    it("should create recursive schedules until payer runs out of funds", async () => {
      const contractAddress = await hip1215.getAddress();
      const expirySecond = getExpirySecond();
      const contractBalance =
        (await ethers.provider.getBalance(contractAddress)) /
        TINYBAR_TO_WEIBAR_COEF;
      const expectedGasUsed = await hip1215.recursiveScheduleCall.estimateGas(
        contractAddress,
        expirySecond,
        GAS_LIMIT_2_000_000.gasLimit,
        0,
      );
      console.debug("Estimated gas for call: " + expectedGasUsed);
      // 1_438_769n; // ~ gas usage for used schedule create operation
      const expectedFee = expectedGasUsed * 71n; // ~ fee for schedule create operation
      const expectedCalls = (contractBalance - expectedFee) / expectedFee + 1n;
      const receipt = await hip1215.recursiveScheduleCall(
        contractAddress,
        expirySecond,
        GAS_LIMIT_2_000_000.gasLimit,
        0,
      );

      const scheduleAddress = await expectScheduleCallEvent(
        receipt,
        ResponseCodeEnum.SUCCESS.valueOf(),
      );
      // Validate execution and recursive behaviour
      const { finalResponse, recursiveCounter } =
        await getRecursiveScheduleStatus(mnClient, scheduleAddress);
      expect(finalResponse).to.not.be.null;
      expect(finalResponse).to.not.eq(SUCCESS);
      expect(recursiveCounter).to.eq(expectedCalls);
    }).timeout(300_000); // We are recursively querying MN so we need more time for execution of the test
  });
});
