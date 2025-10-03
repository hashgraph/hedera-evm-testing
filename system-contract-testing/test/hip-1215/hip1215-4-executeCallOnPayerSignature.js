const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  TINYBAR_TO_WAIBAR_CORF,
  HSS_ADDRESS,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_1_000,
  MAX_EXPIRY,
} = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  addTestCallData,
  payableCallData,
  hasScheduleCapacityCallData,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  getSignatureMap,
  SUCCESS,
  INSUFFICIENT_PAYER_BALANCE,
  INVALID_ETHEREUM_TRANSACTION,
  CONTRACT_REVERT_EXECUTED,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const Async = require("../../utils/async");
const { contractDeployAndFund } = require("../../utils/contract");
const { ResponseCodeEnum } = require("@hashgraph/proto").proto;

describe("HIP-1215 System Contract testing. executeCallOnPayerSignature()", () => {
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
   * @param payer 'payer' param of the scheduleCall
   * @param value 'value' param of the scheduleCall
   * @param callDataFunction function that returns 'callData' param of the scheduleCall
   * @param executionExpectedResult result of the 'schedule execution' transaction
   * @returns {Promise<*[]>} [testId, expirySecond, schedule transaction object]
   */
  async function testExecuteCallOnPayerSignatureAndSign(
    testId,
    to,
    payer,
    value = 0n,
    callDataFunction = (testId) => addTestCallData(testId),
    executionExpectedResult = SUCCESS
  ) {
    const expirySecond = getExpirySecond();
    const scheduleTx = await hip1215.executeCallOnPayerSignature(
      to,
      payer,
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
    const sigMapProtoEncoded = await getSignatureMap(1, scheduleAddress);
    const signTx = await hip1215.signSchedule(
      scheduleAddress,
      sigMapProtoEncoded
    );
    await testResponseCodeEvent(signTx, ResponseCodeEnum.SUCCESS.valueOf());
    // execution check in 'after'
    scheduleTxCheck.push({
      id: testId,
      expirySecond: expirySecond,
      scheduleTx: scheduleTx.hash,
      scheduleAddress: scheduleAddress,
      executionResult: executionExpectedResult,
    });
    return [testId, scheduleTx];
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
    it("should schedule a call with payer signature", async () => {
      const [testId, scheduleTx] = await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature",
        await hip1215.getAddress(),
        signers[1].address
      );
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(
        testId,
        "Schedule tx:" + scheduleTx.hash
      );
    });

    it("should succeed with eoa address for to", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature eoa",
        signers[0].address,
        signers[1].address
      );
    });

    it("should succeed with address(this) for to", async () => {
      const [testId, scheduleTx] = await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature address(this)",
        await hip1215.getAddress(),
        signers[1].address
      );
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(
        testId,
        "Schedule tx:" + scheduleTx.hash
      );
    });

    it("should succeed with system contract for to", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature system contract",
        HSS_ADDRESS,
        signers[1].address,
        0n,
        (testId, expirySecond) =>
          hasScheduleCapacityCallData(
            expirySecond + 10,
            GAS_LIMIT_1_000_000.gasLimit
          )
      );
    });

    it("should succeed with amount sent to contract", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature amount",
        await hip1215.getAddress(),
        signers[1].address,
        100_000_000n, // 1 HBAR in TINYBARS
        () => payableCallData(),
        SUCCESS
      );
    });

    it("should succeed with empty callData", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature empty callData",
        await hip1215.getAddress(),
        signers[1].address,
        0n,
        () => "0x"
      );
    });

    it("should succeed schedule but fail execution with invalid callData", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature invalid callData",
        await hip1215.getAddress(),
        signers[1].address,
        0n,
        () => "0xabc123",
        CONTRACT_REVERT_EXECUTED
      );
    });

    it("should succeed schedule but fail execution with invalid contract deploy", async () => {
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature fail invalid contract deploy",
        ethers.ZeroAddress,
        signers[1].address,
        0n,
        () => "0xabc123",
        INVALID_ETHEREUM_TRANSACTION
      );
    });

    it("should succeed schedule but fail execution with valid contract deploy", async () => {
      const deployContract = await ethers.getContractFactory(
        "HIP1215DeployContract"
      );
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature fail valid contract deploy",
        ethers.ZeroAddress,
        signers[1].address,
        0n,
        () => deployContract.bytecode,
        INVALID_ETHEREUM_TRANSACTION
      );
    });

    it("should change the state after schedule executed", async () => {
      const [testId, scheduleTx] = await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature state",
        await hip1215.getAddress(),
        signers[1].address,
        0n,
        (testId) => addTestCallData(testId)
      );
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(
        testId,
        "Schedule tx:" + scheduleTx.hash
      );
    });

    it("should create account with balance change after schedule executed", async () => {
      const address = randomAddress(); // hollow account creation
      const value = 100_000_000n; // 1 HBAR in TINYBARS
      const [, scheduleTx] = await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature balance",
        address,
        signers[1].address,
        value,
        () => "0x"
      );
      // execution check just after signing
      await Async.wait(1000);
      expect(await signers[0].provider.getBalance(address)).to.equal(
        value * TINYBAR_TO_WAIBAR_CORF, // converting TINYBAR -> WAIBAR
        "Schedule tx:" + scheduleTx.hash
      );
    });

    it("should succeed schedule but fail execution for value more than balance", async () => {
      const address = randomAddress(); // hollow account creation
      const value = 100_000_000_000_000n; // 1_000_000 HBAR in TINYBARS, more than contact balance
      await testExecuteCallOnPayerSignatureAndSign(
        "executeCallOnPayerSignature balance",
        address,
        signers[1].address,
        value,
        () => "0x",
        INSUFFICIENT_PAYER_BALANCE
      );
    });

    it("should succeed with contract as a payer", async () => {
      const testId = "executeCallOnPayerSignature payer contract";
      expect(await hip1215.getTests()).to.not.contain(testId);
      // create payer contract
      const payerContract = await contractDeployAndFund(
        "HIP1215PayerContract",
        0,
        1
      );
      // create schedule
      const expirySecond = getExpirySecond();
      const scheduleTx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        await payerContract.getAddress(),
        expirySecond,
        GAS_LIMIT_1_000_000.gasLimit,
        0n,
        addTestCallData(testId)
      );
      const scheduleAddress = await testScheduleCallEvent(
        scheduleTx,
        ResponseCodeEnum.SUCCESS.valueOf()
      );
      // sign schedule
      const signTx = await payerContract.authorizeSchedule(scheduleAddress);
      await testResponseCodeEvent(signTx, ResponseCodeEnum.SUCCESS.valueOf());
      // execution check just after signing
      await Async.wait(1000);
      expect(await hip1215.getTests()).to.contain(testId);
    });
  });

  describe("negative cases", () => {
    it("should fail with payer as zero address", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        ethers.ZeroAddress,
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("executeCallOnPayerSignature fail payer zero address")
      );
      await testScheduleCallEvent(tx, ResponseCodeEnum.UNKNOWN.valueOf());
    });

    it("should fail with gasLimit 0", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        0,
        0,
        addTestCallData("executeCallOnPayerSignature fail gasLimit 0")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INSUFFICIENT_GAS.valueOf()
      );
    });

    it("should fail with gasLimit 1000", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        GAS_LIMIT_1_000.gasLimit,
        0,
        addTestCallData("executeCallOnPayerSignature fail gasLimit 1000")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.INSUFFICIENT_GAS.valueOf()
      );
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        getExpirySecond(),
        ethers.MaxUint256,
        0,
        addTestCallData("executeCallOnPayerSignature fail uint.maxvalue")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRY_IS_BUSY.valueOf()
      );
    });

    it("should fail with 0 expiry", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("executeCallOnPayerSignature fail expiry 0")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME.valueOf()
      );
    });

    it("should fail with expiry at current time", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("executeCallOnPayerSignature fail expiry current")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME.valueOf()
      );
    });

    it("should fail with expiry at max expiry + 1", async () => {
      const tx = await hip1215.executeCallOnPayerSignature(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCSeconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("executeCallOnPayerSignature fail expiry + 1")
      );
      await testScheduleCallEvent(
        tx,
        ResponseCodeEnum.SCHEDULE_EXPIRATION_TIME_MUST_BE_HIGHER_THAN_CONSENSUS_TIME.valueOf()
      );
    });
  });
});
