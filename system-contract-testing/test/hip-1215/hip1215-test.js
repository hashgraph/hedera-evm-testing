const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  ONE_HBAR,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_1_000,
  GAS_LIMIT_15M,
  MAX_EXPIRY,
  Events,
} = require("../../utils/constants");
const { Async } = require("../../utils/async");
const { mockSetSuccessResponse, mockSetFailResponse } = require("./mock/utils");
const { MOCK_ENABLED } = require("../../utils/environment");

describe("HIP-1215 System Contract testing", () => {
  let hip1215, impl1215, signers;
  let gasIncrement = 0;
  const htsAddress = "0x0000000000000000000000000000000000000167";
  const mockedResponseAddress = "0x000000000000000000000000000000000000007B";
  const randomAddress = "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97";
  const addTestFunctionSignature = "0xa432d339";
  const abiStr = ["function addTest(string memory _value)"];
  const abi = new ethers.Interface(abiStr);
  const testsCheck = [];

  // ----------------- Test helper functions
  async function testScheduleCallEvent(tx, responseCode) {
    const rc = await tx.wait();
    const log = rc.logs.find((e) => e.fragment.name === Events.ScheduleCall);
    expect(log.args[0]).to.equal(responseCode);
    const address = log.args[1];
    if (responseCode === 22n) {
      if (MOCK_ENABLED) {
        expect(address).to.equal(mockedResponseAddress);
      } else {
        expect(address.length).to.equal(42);
      }
    } else {
      expect(address).to.equal(ethers.ZeroAddress);
    }
    expect(rc.status).to.equal(1);
    return address;
  }

  async function testResponseCodeEvent(tx, responseCode) {
    const rc = await tx.wait();
    const log = rc.logs.find((e) => e.fragment.name === Events.ResponseCode);
    expect(log.args[0]).to.equal(responseCode);
    expect(rc.status).to.equal(1);
  }

  async function testHasScheduleCapacityEvent(tx, hasCapacity) {
    const rc = await tx.wait();
    const log = rc.logs.find(
      (e) => e.fragment.name === Events.HasScheduleCapacity,
    );
    expect(log.args[0]).to.equal(hasCapacity);
    expect(rc.status).to.equal(1);
  }

  function getExpirySecond() {
    return Math.floor(Date.now() / 1000) + 10;
  }

  // ----------------- Tests
  before(async () => {
    // provider configs override
    ethers.provider.estimateGas = async () => 1_200_000;
    signers = await ethers.getSigners();
    // deploy impl contract
    const HIP1215ImplFactory = await ethers.getContractFactory(
      MOCK_ENABLED ? "HIP1215MockContract" : "HederaScheduleService_HIP1215",
    );
    impl1215 = await HIP1215ImplFactory.deploy();
    await impl1215.waitForDeployment();
    // transfer funds to impl contract
    await signers[0].sendTransaction({
      to: impl1215.target,
      value: ONE_HBAR * 10n
    });
    // deploy test contract
    const HIP1215Factory = await ethers.getContractFactory("HIP1215Contract");
    console.log("Deploy hip1215 with impl:", impl1215.target);
    hip1215 = await HIP1215Factory.deploy(impl1215.target);
    await hip1215.waitForDeployment();
    // transfer funds to test contract
    await signers[0].sendTransaction({
      to: hip1215.target,
      value: ONE_HBAR * 10n
    });
    console.log("Done hip1215:", hip1215.target);
    ethers.provider.estimateGas = async () => 2_000_000;
  });

  after(async () => {
    for (const check of testsCheck) {
      console.log("Wait for '%s' at %s second", check.id, check.expirySecond);
      await Async.waitFor(check.expirySecond * 1000 + 3000, 1000);
      expect(await hip1215.getTests()).to.contain(check.id);
    }
  });

  describe("scheduleCall", () => {
    describe("positive cases", async () => {
      before(async () => {
        return mockSetSuccessResponse(impl1215);
      });

      it("should schedule a call", async () => {
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall"]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with eoa address for to", async () => {
        const tx = await hip1215.scheduleCall(
          signers[0].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall eoa"]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with address(this) for to", async () => {
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall address(this)"]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          abi.encodeFunctionData("addTest", ["scheduleCall amount"]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with empty calldata", async () => {
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

      it("should succeed schedule but fail execution with invalid calldata", async () => {
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
          abi.encodeFunctionData("addTest", [testId]),
        );
        const scheduleId = await testScheduleCallEvent(scheduleTx, 22n);
        expect(await hip1215.getTests()).to.not.contain(testId);
        // sign schedule
        const signTx = await hip1215.authorizeSchedule(scheduleId);
        await testResponseCodeEvent(signTx, 22n);
        // execution check in 'after'
        testsCheck.push({ id: testId, expirySecond: expirySecond });
      });
    });

    describe("negative cases", () => {
      it("should fail with gasLimit 0", async () => {
        await mockSetFailResponse(impl1215, 30);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          0,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall fail gasLimit 0"]),
        );
        await testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit 1000", async () => {
        await mockSetFailResponse(impl1215, 30);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          GAS_LIMIT_1_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "scheduleCall fail gasLimit 1000",
          ]),
        );
        await testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit uint.maxvalue", async () => {
        await mockSetFailResponse(impl1215, 370);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          getExpirySecond(),
          ethers.MaxUint256,
          0,
          abi.encodeFunctionData("addTest", [
            "scheduleCall fail uint.maxvalue",
          ]),
        );
        await testScheduleCallEvent(tx, 370n);
      });

      // TODO check balance fail
      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(impl1215, 10);
        const address = await hip1215.getAddress();
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.scheduleCall(
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          abi.encodeFunctionData("addTest", ["scheduleCall fail amount"]),
        );
        await testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall fail expiry 0"]),
        );
        await testScheduleCallEvent(tx, 307n);
      });

      it("should fail with expiry at current time", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          new Date().getUTCSeconds(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "scheduleCall fail expiry current",
          ]),
        );
        await testScheduleCallEvent(tx, 307n);
      });

      it("should fail with expiry at max expiry + 1", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          new Date().getUTCSeconds() + MAX_EXPIRY + 1,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["scheduleCall fail expiry + 1"]),
        );
        await testScheduleCallEvent(tx, 307n);
      });
    });
  });

  describe("scheduleCallWithSender()", () => {
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
          abi.encodeFunctionData("addTest", ["scheduleCallWithSender"]),
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
          abi.encodeFunctionData("addTest", ["scheduleCallWithSender eoa"]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender address(this)",
          ]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.scheduleCallWithSender(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          abi.encodeFunctionData("addTest", ["scheduleCallWithSender amount"]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with empty calldata", async () => {
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

      it("should succeed schedule but fail execution with invalid calldata", async () => {
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
        const expirySecond = getExpirySecond();
        const tx = await hip1215.scheduleCallWithSender(
          await hip1215.getAddress(),
          signers[1].address,
          expirySecond,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [testId]),
        );
        const scheduleId = await testScheduleCallEvent(tx, 22n);
        expect(await hip1215.getTests()).to.not.contain(testId);
        // sign schedule //TODO signers[1].address should sign
        const signTx = await hip1215.authorizeSchedule(scheduleId);
        await testResponseCodeEvent(signTx, 22n);
        // execution check in 'after'
        testsCheck.push({ id: testId, expirySecond: expirySecond });
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail gasLimit 0",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail gasLimit 1000",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail gasLimit uint.maxvalue",
          ]),
        );
        await testScheduleCallEvent(tx, 370n);
      });

      // TODO check balance fail
      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(impl1215, 10);
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.scheduleCallWithSender(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail amount",
          ]),
        );
        await testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.scheduleCallWithSender(
          await hip1215.getAddress(),
          signers[1].address,
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail expiry 0",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail expiry current",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail expiry + 1",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "scheduleCallWithSender fail sender zero address",
          ]),
        );
        await testScheduleCallEvent(tx, 21n);
      });

      // TODO why contract cant be a sender?
      // it("should fail with sender as contract", async () => {
      //   await mockSetFailResponse(impl1215, 210);
      //   const tx = await hip1215.scheduleCallWithSender(
      //     htsAddress,
      //     await hip1215.getAddress(),
      //     getExpirySecond(),
      //     GAS_LIMIT_1_000_000.gasLimit,
      //     0,
      //     abi.encodeFunctionData("addTest", ["scheduleCallWithSender fail sender zero contract"]),
      //   );
      //   await testScheduleCallEvent(tx, 210n);
      // });
    });
  });

  describe("executeCallOnSenderSignature()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse(impl1215);
      });

      it("should schedule a call with sender signature", async () => {
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["executeCallOnSenderSignature"]),
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
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature eoa",
          ]),
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
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature address(this)",
          ]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature amount",
          ]),
        );
        await testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with empty calldata", async () => {
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

      it("should succeed schedule but fail execution with invalid calldata", async () => {
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
        const expirySecond = getExpirySecond();
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          expirySecond,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [testId]),
        );
        const scheduleId = await testScheduleCallEvent(tx, 22n);
        expect(await hip1215.getTests()).to.not.contain(testId);
        // sign schedule //TODO signers[1].address should sign
        const signTx = await hip1215.authorizeSchedule(scheduleId);
        await testResponseCodeEvent(signTx, 22n);
        // execution check in 'after'
        testsCheck.push({ id: testId, expirySecond: expirySecond });
      });
    });

    describe("negative cases", () => {
      it("should fail with gasLimit 0", async () => {
        await mockSetFailResponse(impl1215, 30);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          0,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail gasLimit 0",
          ]),
        );
        await testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit 1000", async () => {
        await mockSetFailResponse(impl1215, 30);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail gasLimit 1000",
          ]),
        );
        await testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit uint.maxvalue", async () => {
        await mockSetFailResponse(impl1215, 370);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          ethers.MaxUint256,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail uint.maxvalue",
          ]),
        );
        await testScheduleCallEvent(tx, 370n);
      });

      // TODO check balance fail
      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(impl1215, 10);
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail amount",
          ]),
        );
        await testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail expiry 0",
          ]),
        );
        await testScheduleCallEvent(tx, 307n);
      });

      it("should fail with expiry at current time", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          new Date().getUTCSeconds(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail expiry current",
          ]),
        );
        await testScheduleCallEvent(tx, 307n);
      });

      it("should fail with expiry at max expiry + 1", async () => {
        await mockSetFailResponse(impl1215, 307);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          signers[1].address,
          new Date().getUTCSeconds() + MAX_EXPIRY + 1,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail expiry + 1",
          ]),
        );
        await testScheduleCallEvent(tx, 307n);
      });

      it("should fail with sender as zero address", async () => {
        await mockSetFailResponse(impl1215, 21);
        const tx = await hip1215.executeCallOnSenderSignature(
          await hip1215.getAddress(),
          ethers.ZeroAddress,
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", [
            "executeCallOnSenderSignature fail sender zero address",
          ]),
        );
        await testScheduleCallEvent(tx, 21n);
      });

      // TODO why contract cant be a sender?
      // it("should fail with sender as contract", async () => {
      //   await mockSetFailResponse(impl1215, 15);
      //   const tx = await hip1215.executeCallOnSenderSignature(
      //     htsAddress,
      //     await hip1215.getAddress(),
      //     getExpirySecond(),
      //     GAS_LIMIT_1_000_000.gasLimit,
      //     0,
      //     abi.encodeFunctionData("addTest", ["executeCallOnSenderSignature fail sender contract"]),
      //   );
      //   await testScheduleCallEvent(tx, 15n);
      // });
    });
  });

  describe("deleteSchedule()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse(impl1215);
      });

      it("should delete schedule", async () => {
        // create schedule
        const createTx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          Math.floor(Date.now() / 1000) + 60,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["deleteSchedule"]),
        );
        const scheduleAddress = await testScheduleCallEvent(createTx, 22n);
        // delete schedule
        const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
        await testResponseCodeEvent(deleteTx, 22n);
      });

      it("should delete schedule through proxy", async () => {
        // create schedule
        const createTx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          Math.floor(Date.now() / 1000) + 60,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["deleteSchedule proxy"]),
        );
        const scheduleAddress = await testScheduleCallEvent(createTx, 22n);
        // delete schedule
        const deleteTx = await hip1215.deleteScheduleProxy(scheduleAddress);
        await testResponseCodeEvent(deleteTx, 22n);
      });
    });

    describe("negative cases", () => {
      it("should fail with random address for to", async () => {
        const tx = await hip1215.deleteSchedule(randomAddress);
        await testResponseCodeEvent(tx, 21n);
      });

      it("should fail with expired address for to", async () => {
        // create schedule
        const tx = await hip1215.scheduleCall(
          await hip1215.getAddress(),
          Math.floor(Date.now() / 1000) + 2, // just enought to execute transaction
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          abi.encodeFunctionData("addTest", ["deleteSchedule fail expired"]),
        );
        const scheduleAddress = await testScheduleCallEvent(tx, 22n);
        await Async.wait(2000);
        // delete schedule
        const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
        await testResponseCodeEvent(deleteTx, 201n);
      });
    });
  });

  // TODO add hasScheduleCapacity test from a 'view' function when 'hasScheduleCapacity' will be available on MN
  describe("hasScheduleCapacity()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse(impl1215);
      });

      it("should have enough capacity", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          getExpirySecond(),
          GAS_LIMIT_1_000_000.gasLimit,
        );
        await testHasScheduleCapacityEvent(tx, true);
      });

      it("should return true for valid expiry and max gas limit - 1", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          getExpirySecond(),
          GAS_LIMIT_15M.gasLimit - 1,
        );
        await testHasScheduleCapacityEvent(tx, true);
      });
    });

    describe("negative cases", () => {
      before(async () => {
        return (
          mockSetFailResponse(impl1215, 1)
            // somehow Mock state change not always appears just after this call returns on local node.
            // so we are adding 1s wait as a temp fix for this
            .then(() =>
              MOCK_ENABLED ? Async.wait(1000) : Promise.resolve("resolved"),
            )
        );
      });

      it("should return false for expiry in the past", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          1716666666,
          GAS_LIMIT_1_000_000.gasLimit,
        );
        await testHasScheduleCapacityEvent(tx, false);
      });

      it("should return false for 0 expiry", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          0,
          GAS_LIMIT_1_000_000.gasLimit,
        );
        await testHasScheduleCapacityEvent(tx, false);
      });

      it("Should return false for valid expiry and max gas limit + 1", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          getExpirySecond(),
          GAS_LIMIT_15M.gasLimit + 1,
        );
        await testHasScheduleCapacityEvent(tx, false);
      });

      it("Should return false for valid expiry and max long + 1 gas limit", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          getExpirySecond(),
          BigInt("9223372036854775808"),
        );
        await testHasScheduleCapacityEvent(tx, false);
      });
    });
  });
});
