const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_1_000,
  MAX_EXPIRY,
} = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  mockSetSuccessResponse,
  mockSetFailResponse,
} = require("./utils/hip1215-mock");
const {
  callData,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  getSignatureMap,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");

describe("HIP-1215 System Contract testing. scheduleCallWithSender()", () => {
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

  describe("positive cases", () => {
    before(async () => {
      return mockSetSuccessResponse(impl1215);
    });

    it("should schedule a call with payer", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with eoa address for to", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        signers[0].address,
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender eoa"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with address(this) for to", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender address(this)"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with amount sent to contract", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        100_000_000, // 1 HBAR in TINYBARS
        callData("scheduleCallWithSender amount"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with empty callData", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
        GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
        0,
        "0x",
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
        GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
        0,
        "0xabc123",
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should change the state after schedule executed", async () => {
      const testId = "scheduleCallWithSender state";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create schedule
      const expirySecond = getExpirySecond();
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData(testId),
      );
      const scheduleAddress = await testScheduleCallEvent(tx, 22n);
      expect(await hip1215.getTests()).to.not.contain(testId);
      // sign schedule
      const sigMapProtoEncoded = await getSignatureMap(1, scheduleAddress);
      const signTx = await hip1215.signSchedule(
        scheduleAddress,
        sigMapProtoEncoded,
      );
      await testResponseCodeEvent(signTx, 22n);
      // execution check in 'after'
      scheduleCheck.push({ id: testId, expirySecond: expirySecond });
    });

    it("should create account with balance change after schedule executed", async () => {
      const testId = "scheduleCallWithSender balance";
      // create schedule
      const address = randomAddress();
      const expirySecond = getExpirySecond();
      const balance = 100_000_000n; // 1 HBAR in TINYBARS
      const scheduleTx = await hip1215.scheduleCallWithSender(
        address, // hollow account creation
        signers[1].address,
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        balance,
        "0x",
      );
      const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
      // sign schedule
      const sigMapProtoEncoded = await getSignatureMap(1, scheduleAddress);
      const signTx = await hip1215.signSchedule(
        scheduleAddress,
        sigMapProtoEncoded,
      );
      await testResponseCodeEvent(signTx, 22n);
      // balance check in 'after'
      balanceCheck.push({
        id: testId,
        expirySecond: expirySecond,
        address: address,
        balance: balance * 10_000_000_000n, // converting TINYBAR -> WAIBAR
      });
    });
  });

  describe("negative cases", () => {
    it("should fail with gasLimit 0", async () => {
      await mockSetFailResponse(impl1215, 30);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        0,
        0,
        callData("scheduleCallWithSender fail gasLimit 0"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit 1000", async () => {
      await mockSetFailResponse(impl1215, 30);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        callData("scheduleCallWithSender fail gasLimit 1000"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      await mockSetFailResponse(impl1215, 370);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        callData("scheduleCallWithSender fail gasLimit uint.maxvalue"),
      );
      await testScheduleCallEvent(tx, 370n);
    });

    it("should fail with 0 expiry", async () => {
      await mockSetFailResponse(impl1215, 307);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender fail expiry 0"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at current time", async () => {
      await mockSetFailResponse(impl1215, 307);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender fail expiry current"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      await mockSetFailResponse(impl1215, 307);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender fail expiry + 1"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with sender as zero address", async () => {
      await mockSetFailResponse(impl1215, 21);
      const tx = await hip1215.scheduleCallWithSender(
        await hip1215.getAddress(),
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("scheduleCallWithSender fail sender zero address"),
      );
      await testScheduleCallEvent(tx, 21n);
    });
  });
});
