const { expect } = require("chai");
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
  payableCallCallData,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  getSignatureMap,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const { contractDeployAndFund } = require("../../utils/contract");

describe("HIP-1215 System Contract testing. scheduleCallWithPayer()", () => {
  let hip1215, impl1215, signers;
  let gasIncrement = 0;
  const scheduleCheck = [];
  const balanceCheck = [];
  const scheduleTxCheck = [];

  async function testScheduleCallEventAndSign(
    testId,
    to,
    payer,
    value = 0,
    callDataFunction = (testId) => addTestCallData(testId),
    executionExpectedStatus = "SUCCESS",
  ) {
    const expirySecond = getExpirySecond();
    const scheduleTx = await hip1215.scheduleCallWithPayer(
      to,
      payer,
      getExpirySecond(),
      // gasIncrement added to prevent 'IDENTICAL_SCHEDULE_ALREADY_CREATED' with other call test
      GAS_LIMIT_1_000_000.gasLimit + gasIncrement++,
      value,
      callDataFunction(testId, expirySecond),
    );
    const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
    // sign schedule
    const sigMapProtoEncoded = await getSignatureMap(1, scheduleAddress);
    const signTx = await hip1215.signSchedule(
      scheduleAddress,
      sigMapProtoEncoded,
    );
    await testResponseCodeEvent(signTx, 22n);
    // execution check in 'after'
    scheduleTxCheck.push({
      id: testId,
      expirySecond: expirySecond,
      scheduleTx: scheduleTx.hash,
      scheduleAddress: scheduleAddress,
      expectedStatus: executionExpectedStatus,
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

  describe("positive cases", () => {
    it("should schedule a call with payer", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallEventAndSign(
          "scheduleCallWithPayer",
          await hip1215.getAddress(),
          signers[1].address,
        );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should succeed with eoa address for to", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer eoa",
        signers[0].address,
        signers[1].address,
        0,
        (testId) => addTestCallData(testId),
      );
    });

    it("should succeed with address(this) for to", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallEventAndSign(
          "scheduleCallWithPayer address(this)",
          await hip1215.getAddress(),
          signers[1].address,
        );
      // execution check in 'after'
      scheduleCheck.push({
        id: testId,
        expirySecond: expirySecond,
        scheduleTx: scheduleTx.hash,
      });
    });

    it("should succeed with system contract for to", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer system contract",
        HSS_ADDRESS,
        signers[1].address,
        0,
        (testId, expirySecond) =>
          hasScheduleCapacityCallData(
            expirySecond + 10,
            GAS_LIMIT_1_000_000.gasLimit,
          ),
      );
    });

    it("should succeed with amount sent to contract", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer amount",
        await hip1215.getAddress(),
        signers[1].address,
        100_000_000, // 1 HBAR in TINYBARS
        () => payableCallCallData(),
        "SUCCESS",
      );
    });

    it("should succeed with empty callData", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer empty callData",
        await hip1215.getAddress(),
        signers[1].address,
        0,
        () => "0x",
      );
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer invalid callData",
        await hip1215.getAddress(),
        signers[1].address,
        0,
        () => "0xabc123",
        "CONTRACT_REVERT_EXECUTED",
      );
    });

    it("should succeed schedule but fail execution with invalid contract deploy", async () => {
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer fail invalid contract deploy",
        ethers.ZeroAddress,
        signers[1].address,
        0,
        () => "0xabc123",
        "INVALID_ETHEREUM_TRANSACTION",
      );
    });

    it("should succeed schedule but fail execution with valid contract deploy", async () => {
      const deployContract = await ethers.getContractFactory(
        "HIP1215DeployContract",
      );
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer fail valid contract deploy",
        ethers.ZeroAddress,
        signers[1].address,
        0,
        () => deployContract.bytecode,
        "INVALID_ETHEREUM_TRANSACTION",
      );
    });

    it("should change the state after schedule executed", async () => {
      const [testId, expirySecond, scheduleTx] =
        await testScheduleCallEventAndSign(
          "scheduleCallWithPayer state",
          await hip1215.getAddress(),
          signers[1].address,
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
        await testScheduleCallEventAndSign(
          "scheduleCallWithPayer balance",
          address,
          signers[1].address,
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
      await testScheduleCallEventAndSign(
        "scheduleCallWithPayer balance",
        address,
        signers[1].address,
        balance,
        () => "0x",
        "INSUFFICIENT_PAYER_BALANCE",
      );
    });

    it("should succeed with contract as a payer", async () => {
      const testId = "scheduleCallWithPayer payer contract";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create payer contract
      const payerContract = await contractDeployAndFund(
        "HIP1215PayerContract",
        0,
        1,
      );
      // create schedule
      const expirySecond = getExpirySecond();
      const scheduleTx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        await payerContract.getAddress(),
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData(testId),
      );
      const scheduleAddress = await testScheduleCallEvent(scheduleTx, 22n);
      // sign schedule
      const signTx = await payerContract.authorizeSchedule(scheduleAddress);
      await testResponseCodeEvent(signTx, 22n);
      // execution check in 'after'
      scheduleCheck.push({ id: testId, expirySecond: expirySecond });
    });
  });

  describe("negative cases", () => {
    it("should fail with payer as zero address", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCallWithPayer fail payer zero address"),
      );
      await testScheduleCallEvent(tx, 21n);
    });

    it("should fail with gasLimit 0", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        0,
        0,
        addTestCallData("scheduleCallWithPayer fail gasLimit 0"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        addTestCallData("scheduleCallWithPayer fail gasLimit 1000"),
      );
      await testScheduleCallEvent(tx, 30n);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        addTestCallData("scheduleCallWithPayer fail gasLimit uint.maxvalue"),
      );
      await testScheduleCallEvent(tx, 370n);
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCallWithPayer fail expiry 0"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCallWithPayer fail expiry current"),
      );
      await testScheduleCallEvent(tx, 307n);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.scheduleCallWithPayer(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("scheduleCallWithPayer fail expiry + 1"),
      );
      await testScheduleCallEvent(tx, 307n);
    });
  });
});
