const { ethers } = require("hardhat");
const {
  TINYBAR_TO_WEIBAR_COEF,
  HSS_ADDRESS,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_2_000_000,
  GAS_LIMIT_1_000,
  MAX_EXPIRY,
} = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  addTestCallData,
  hasScheduleCapacityCallData,
  payableCallData,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  getRecursiveScheduleStatus,
  SUCCESS,
  INSUFFICIENT_PAYER_BALANCE,
  CONTRACT_REVERT_EXECUTED,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const { expect } = require("chai");
const { ResponseCodeEnum } = require("@hashgraph/proto").proto;

describe("HIP-1215 System Contract testing. scheduleCall()", () => {
  let hip1215, impl1215, signers, mnClient;
  let gasIncrement = 0;
  const scheduleCheck = [];
  const balanceCheck = [];
  const scheduleTxCheck = [];

  /**
   * This function create schedule with scheduleCreate*, signs schedule,
   * check the result of the 'schedule execution' in tests 'after' function
   * @param testId unique identifier of the test
   * @param to 'to' param of the scheduleCall
   * @param value 'value' param of the scheduleCall
   * @param callDataFunction function that returns 'callData' param of the scheduleCall
   * @param executionExpectedResult result of the 'schedule execution' transaction
   * @returns {Promise<*[]>} [testId, expirySecond, schedule transaction object]
   */
  async function testScheduleCallAndSign(
    testId,
    to,
    value = 0n,
    callDataFunction = (testId) => addTestCallData(testId),
    executionExpectedResult = SUCCESS
  ) {
    const expirySecond = getExpirySecond();
    const scheduleTx = await hip1215.scheduleCall(
      to,
      getExpirySecond(),
      // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
      GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
      value,
      callDataFunction(testId, expirySecond)
    );

    const scheduleAddress = await testScheduleCallEvent(
      scheduleTx,
      ResponseCodeEnum.SUCCESS.valueOf()
    );
    // sign schedule
    const signTx = await hip1215.authorizeSchedule(scheduleAddress);
    await testResponseCodeEvent(signTx, ResponseCodeEnum.SUCCESS.valueOf());
    // execution check in 'after'
    scheduleTxCheck.push({
      id: testId,
      expirySecond: expirySecond,
      scheduleTx: scheduleTx.hash,
      scheduleAddress: scheduleAddress,
      executionResult: executionExpectedResult,
    });
    return [testId, expirySecond, scheduleTx];
  }

  // ----------------- Tests
  before(async () => {
    [hip1215, impl1215, signers, mnClient] = await beforeTests();
  });

  // schedules result check ofter tests passes to save the time
  after(async () => {
    await afterTests(scheduleCheck, balanceCheck, scheduleTxCheck);
  });

  describe("positive cases", async () => {
    it("should schedule a call", async () => {
      const [testId, expirySecond, scheduleTx] = await testScheduleCallAndSign(
        "scheduleCall",
        await hip1215.getAddress()
      );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should succeed with eoa address for to", async () => {
      await testScheduleCallAndSign("scheduleCall eoa", signers[0].address);
    });

    it("should succeed with address(this) for to", async () => {
      const [testId, expirySecond, scheduleTx] = await testScheduleCallAndSign(
        "scheduleCall address(this)",
        await hip1215.getAddress()
      );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should succeed with system contract for to", async () => {
      await testScheduleCallAndSign(
        "scheduleCall system contract",
        HSS_ADDRESS,
        0n,
        (testId, expirySecond) =>
          hasScheduleCapacityCallData(
            expirySecond + 10,
            GAS_LIMIT_1_000_000.gasLimit
          )
      );
    });

    it("should succeed with amount sent to contract", async () => {
      await testScheduleCallAndSign(
        "scheduleCall amount",
        await hip1215.getAddress(),
        100_000_000n, // 1 HBAR in TINYBARS
        () => payableCallData(),
        SUCCESS
      );
    });

    it("should succeed with empty callData", async () => {
      await testScheduleCallAndSign(
        "scheduleCall empty callData",
        await hip1215.getAddress(),
        0n,
        () => "0x"
      );
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      await testScheduleCallAndSign(
        "scheduleCall invalid callData",
        await hip1215.getAddress(),
        0n,
        () => "0xabc123",
        CONTRACT_REVERT_EXECUTED
      );
    });

    it("should change the state after schedule executed", async () => {
      const [testId, expirySecond, scheduleTx] = await testScheduleCallAndSign(
        "scheduleCall state",
        await hip1215.getAddress(),
        0n,
        (testId) => addTestCallData(testId)
      );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should create account with balance change after schedule executed", async () => {
      const address = randomAddress(); // hollow account creation
      const value = 100_000_000n; // 1 HBAR in TINYBARS
      const [testId, expirySecond, scheduleTx] = await testScheduleCallAndSign(
        "scheduleCall balance",
        address,
        value,
        () => "0x"
      );
      // balance check in 'after'
      balanceCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
        address: address,
        balance: value * TINYBAR_TO_WEIBAR_COEF, // converting TINYBAR -> WAIBAR
      });
    });

    it("should succeed schedule but fail execution for value more than balance", async () => {
      const address = randomAddress(); // hollow account creation
      const value = 100_000_000_000_000n; // 1_000_000 HBAR in TINYBARS, more than contact balance
      await testScheduleCallAndSign(
        "scheduleCall balance",
        address,
        value,
        () => "0x",
        INSUFFICIENT_PAYER_BALANCE
      );
    });
  });

  describe("negative cases", () => {
    it("should fail with gasLimit 0", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        0,
        0,
        addTestCallData("scheduleCall fail gasLimit 0")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INSUFFICIENT_GAS.valueOf()
      );
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail gasLimit 1000")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INSUFFICIENT_GAS.valueOf()
      );
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        addTestCallData("scheduleCall fail uint.maxvalue")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRY_IS_BUSY.valueOf()
      );
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry 0")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME.valueOf()
      );
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry current")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME.valueOf()
      );
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        // adding +100 to exclude consensus time shift
        Math.floor(Date.now() / 1000) + MAX_EXPIRY + 100 + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry + 1")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE.valueOf()
      );
    });

    it("should fail with zero 'to' address and invalid contract deploy", async () => {
      const tx = await hip1215.scheduleCall(
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0xabc123"
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INVALID_CONTRACT_ID.valueOf()
      );
    });

    it("should fail with zero 'to' address and valid contract deploy", async () => {
      const deployContract = await ethers.getContractFactory(
        "HIP1215DeployContract"
      );
      const tx = await hip1215.scheduleCall(
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        deployContract.bytecode
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INVALID_CONTRACT_ID.valueOf()
      );
    });
  });

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
        0
      );
      console.debug("Estimated gas for call: " + expectedGasUsed);
      // 1_438_769n; // ~ gas usage for used schedule create operation
      const expectedFee = expectedGasUsed * 71n; // ~ fee for schedule create operation
      const expectedHasCapacityFee = 2_000_000n * 71n; // max fee for schedule create operation, calculated based on schedule gasLimit
      const expectedCalls =
        (contractBalance - expectedHasCapacityFee) / expectedFee + 1n;
      const tx = await hip1215.recursiveScheduleCall(
        contractAddress,
        expirySecond,
        GAS_LIMIT_2_000_000.gasLimit,
        0
      );

      const scheduleAddress = await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SUCCESS.valueOf()
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
