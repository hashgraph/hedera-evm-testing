const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  HTS_ADDRESS,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_1_000,
  MAX_EXPIRY,
} = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  callData,
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

  // ----------------- Tests
  before(async () => {
    [hip1215, impl1215, signers] = await beforeTests();
  });

  // schedules result check ofter tests passes to save the time
  after(async () => {
    await afterTests(scheduleCheck, balanceCheck);
  });

  describe("positive cases", async () => {

    it("should schedule a call", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with eoa address for to", async () => {
      const tx = await hip1215.scheduleCall(
        signers[0].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall eoa"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    // TODO add test: zero address call with deploy contract code
    //  1. to - zero address, callData - correct, success contract deploy
    //  2. to - zero address, callData - wrong, failed contract deploy

    it("should succeed with address(this) for to", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall address(this)"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    //TODO add test: check that system contract schedule is executed successfully

    it("should succeed with system contract for to", async () => {
      const tx = await hip1215.scheduleCall(
        HTS_ADDRESS,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall address(this)"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with amount sent to contract", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        100_000_000, // 1 HBAR in TINYBARS
        callData("scheduleCall amount"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with empty callData", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
        GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
        0,
        "0x",
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
        GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
        0,
        "0xabc123",
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should change the state after schedule executed", async () => {
      const testId = "scheduleCall state";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create schedule
      const expirySecond = getExpirySecond();
      const scheduleTx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData(testId),
      );
      const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
      expect(await hip1215.getTests()).to.not.contain(testId);
      // sign schedule
      const signTx = await hip1215.authorizeSchedule(scheduleAddress);
      await testResponseCodeEvent(signTx, 22n);
      // execution check in 'after'
      scheduleCheck.push({ id: testId, expirySecond: expirySecond });
    });

    it("should create account with balance change after schedule executed", async () => {
      const testId = "scheduleCall balance";
      // create schedule
      const address = randomAddress();
      const expirySecond = getExpirySecond();
      const balance = 100_000_000n; // 1 HBAR in TINYBARS
      const scheduleTx = await hip1215.scheduleCall(
        address, // hollow account creation
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        balance,
        "0x",
      );
      const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
      // sign schedule
      const signTx = await hip1215.authorizeSchedule(scheduleAddress);
      await testResponseCodeEvent(signTx, 22n);
      // balance check in 'after'
      balanceCheck.push({
        id: testId,
        expirySecond: expirySecond,
        address: address,
        balance: balance * 10_000_000_000n, // converting TINYBAR -> WAIBAR
      });
    });

    // TODO add test: recursive scheduling test

  });

  describe("negative cases", () => {
    it("should fail with gasLimit 0", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        0,
        0,
        callData("scheduleCall fail gasLimit 0"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        callData("scheduleCall fail gasLimit 1000"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        callData("scheduleCall fail uint.maxvalue"),
      );
      await testScheduleCallEvent(tx, 370n);
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall fail expiry 0"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall fail expiry current"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCall fail expiry + 1"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    // TODO add test: schedule create should succeed, execution should fail with amount more than contract balance

  });
});
