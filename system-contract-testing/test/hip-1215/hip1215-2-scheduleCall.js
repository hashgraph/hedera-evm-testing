const { ethers } = require("hardhat");
const {
  HSS_ADDRESS,
  GAS_LIMIT_1_000_000,
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
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");

describe("HIP-1215 System Contract testing. scheduleCall()", () => {
  let hip1215, impl1215, signers;
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
    value = 0,
    callDataFunction = (testId) => addTestCallData(testId),
    executionExpectedResult = "SUCCESS",
  ) {
    const expirySecond = getExpirySecond();
    const scheduleTx = await hip1215.scheduleCall(
      to,
      getExpirySecond(),
      // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
      GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
      value,
      callDataFunction(testId, expirySecond),
    );
    const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
    // sign schedule
    const signTx = await hip1215.authorizeSchedule(scheduleAddress);
    await testResponseCodeEvent(signTx, 22n);
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
    [hip1215, impl1215, signers] = await beforeTests();
  });

  // schedules result check ofter tests passes to save the time
  after(async () => {
    await afterTests(scheduleCheck, balanceCheck, scheduleTxCheck);
  });

  describe("positive cases", async () => {
    it("should schedule a call", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallAndSign(
          "scheduleCall",
          await hip1215.getAddress(),
        );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should succeed with eoa address for to", async () => {
      await testScheduleCallAndSign(
        "scheduleCall eoa",
        signers[0].address,
        0,
        (testId) => addTestCallData(testId),
      );
    });

    it("should succeed with address(this) for to", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallAndSign(
          "scheduleCall address(this)",
          await hip1215.getAddress(),
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
        0,
        (testId, expirySecond) =>
          hasScheduleCapacityCallData(
            expirySecond + 10,
            GAS_LIMIT_1_000_000.gasLimit,
          ),
      );
    });

    it("should succeed with amount sent to contract", async () => {
      await testScheduleCallAndSign(
        "scheduleCall amount",
        await hip1215.getAddress(),
        100_000_000, // 1 HBAR in TINYBARS
        () => payableCallData(),
        "SUCCESS",
      );
    });

    it("should succeed with empty callData", async () => {
      await testScheduleCallAndSign(
        "scheduleCall empty callData",
        await hip1215.getAddress(),
        0,
        () => "0x",
      );
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      await testScheduleCallAndSign(
        "scheduleCall invalid callData",
        await hip1215.getAddress(),
        0,
        () => "0xabc123",
        "CONTRACT_REVERT_EXECUTED",
      );
    });

    it("should succeed schedule but fail execution with invalid contract deploy", async () => {
      await testScheduleCallAndSign(
        "scheduleCall fail invalid contract deploy",
        ethers.ZeroAddress,
        0,
        () => "0xabc123",
        // in this case schedule creation is SUCCESS, but schedule execution fails with INVALID_ETHEREUM_TRANSACTION
        "INVALID_ETHEREUM_TRANSACTION",
      );
    });

    it("should succeed schedule but fail execution with valid contract deploy", async () => {
      const deployContract = await ethers.getContractFactory(
        "HIP1215DeployContract",
      );
      await testScheduleCallAndSign(
        "scheduleCall fail valid contract deploy",
        ethers.ZeroAddress,
        0,
        () => deployContract.bytecode,
        "INVALID_ETHEREUM_TRANSACTION",
      );
    });

    it("should change the state after schedule executed", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallAndSign(
          "scheduleCall state",
          await hip1215.getAddress(),
          0,
          (testId) => addTestCallData(testId),
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
      const balance = 100_000_000n; // 1 HBAR in TINYBARS
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallAndSign(
          "scheduleCall balance",
          address,
          balance,
          () => "0x",
        );
      // balance check in 'after'
      balanceCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
        address: address,
        balance: balance * 10_000_000_000n, // converting TINYBAR -> WAIBAR
      });
    });

    it("should succeed schedule but fail execution for value more than balance", async () => {
      const address = randomAddress(); // hollow account creation
      const balance = 100_000_000_000_000n; // 1_000_000 HBAR in TINYBARS, more than contact balance
      await testScheduleCallAndSign(
        "scheduleCall balance",
        address,
        balance,
        () => "0x",
        "INSUFFICIENT_PAYER_BALANCE",
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
        addTestCallData("scheduleCall fail gasLimit 0"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail gasLimit 1000"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        addTestCallData("scheduleCall fail uint.maxvalue"),
      );
      await testScheduleCallEvent(tx, 370n);
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry 0"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry current"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCall fail expiry + 1"),
      );
      await testScheduleCallEvent(tx, 307n);
    });
  });
});
