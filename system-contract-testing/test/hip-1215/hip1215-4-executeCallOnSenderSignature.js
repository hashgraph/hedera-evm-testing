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
  getSignatureMap,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const Async = require("../../utils/async");
const { contractDeployAndFund } = require("../../utils/contract");

describe("HIP-1215 System Contract testing. executeCallOnSenderSignature()", () => {
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
    it("should schedule a call with sender signature", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with eoa address for to", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        signers[0].address,
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature eoa"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with address(this) for to", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature address(this)"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with system contract for to", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        HTS_ADDRESS,
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature address(this)"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with amount sent to contract", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        100_000_000, // 1 HBAR in TINYBARS
        callData("executeCallOnSenderSignature amount"),
      );
      await testScheduleCallEvent(tx, 22n);
    });

    it("should succeed with empty callData", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
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
      const tx = await hip1215.executeCallOnSenderSignature(
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
      const testId = "executeCallOnSenderSignature state";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create schedule
      const expirySecond = getExpirySecond();
      const tx = await hip1215.executeCallOnSenderSignature(
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
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(testId);
    });

    it("should create account with balance change after schedule executed", async () => {
      // create schedule
      const address = randomAddress();
      const expirySecond = getExpirySecond();
      const balance = 100_000_000n; // 1 HBAR in TINYBARS
      const scheduleTx = await hip1215.executeCallOnSenderSignature(
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
      // execution check just after signing
      await Async.wait(1000);
      expect(await signers[0].provider.getBalance(address)).to.equal(
        balance * 10_000_000_000n, // converting TINYBAR -> WAIBAR
      );
    });

    it("should succeed with contract as a sender", async () => {
      const testId = "executeCallOnSenderSignature sender contract";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create sender contract
      const senderContract = await contractDeployAndFund(
        "HIP1215SenderContract",
        0,
        1,
      );
      // create schedule
      const expirySecond = getExpirySecond();
      const scheduleTx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        await senderContract.getAddress(),
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData(testId),
      );
      const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
      // sign schedule
      const signTx = await senderContract.authorizeSchedule(scheduleAddress);
      await testResponseCodeEvent(signTx, 22n);
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(testId);
    });
  });

  describe("negative cases", () => {
    it("should fail with sender as zero address", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature fail sender zero address"),
      );
      await testScheduleCallEvent(tx, 21n);
    });

    it("should fail with gasLimit 0", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        0,
        0,
        callData("executeCallOnSenderSignature fail gasLimit 0"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature fail gasLimit 1000"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        callData("executeCallOnSenderSignature fail uint.maxvalue"),
      );
      await testScheduleCallEvent(tx, 370n);
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature fail expiry 0"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature fail expiry current"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.executeCallOnSenderSignature(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        callData("executeCallOnSenderSignature fail expiry + 1"),
      );
      await testScheduleCallEvent(tx, 307n);
    });
  });
});
