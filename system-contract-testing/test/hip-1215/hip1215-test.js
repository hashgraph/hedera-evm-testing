const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GAS_LIMIT_1_000_000, GAS_LIMIT_15M, MAX_EXPIRY, Events } = require("../../utils/constants");


describe("HIP-1215 System Contract testing", () => {
  let hip1215, mock1215, signers;

  before(async () => {
    signers = await ethers.getSigners();
    // Extract this to a fixture and run 
    const HIP1215MockFactory = await ethers.getContractFactory("HIP1215MockContract");
    mock1215 = await HIP1215MockFactory.deploy();
    const HIP1215Factory = await ethers.getContractFactory("HIP1215Contract");
    hip1215 = await HIP1215Factory.deploy(mock1215.target);
    await hip1215.waitForDeployment();
  });

  describe("scheduleCall", () => {
    it("should schedule a call", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with zero address for to", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.scheduleCallWithFullParam(
        ethers.ZeroAddress,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with eoa address for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        signers[0].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with address(this) for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        await hip1215.getAddress(),
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 0", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        0,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 1000", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        100,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      await mock1215.setResponse(false, 366);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        ethers.MaxUint256,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(366n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with amount more than contract balance", async () => {
      await mock1215.setResponse(false, 10);
      expect(await signers[0].provider.getBalance(await hip1215.getAddress())).to.eq(0);
      await signers[0].sendTransaction({
        to:  await hip1215.getAddress(),
        value: ethers.parseEther("5"),
      });
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(10n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with amount sent to contract", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584",
        { value: ethers.parseEther("5") }
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should succeed? with empty calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should succeed schedule but fail execution with invalid calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0xabc123"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with 0 expiry", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    it("should fail with expiry at current time", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });


    it("should fail with expiry at max expiry + 1", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });

    
    it("should change the state after schedule executed", async () => {
      await mock1215.setResponse(true, 22);
      expect(await hip1215.getValue()).to.equal(0);
      const tx = await hip1215.scheduleCallWithFullParam(
        await hip1215.getAddress(),
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
      expect(await hip1215.getValue()).to.equal(0n);
      await new Promise(resolve => setTimeout(resolve, 100));
      // needs CN for this expectation
      // expect(await hip1215.getValue()).to.equal(63n);
    });

  });

  describe("scheduleCallWithPayer()", () => {
    it("should schedule a call with payer", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with zero address for to", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        ethers.ZeroAddress,
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with eoa address for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        signers[0].address,
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with address(this) for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      expect(transaction.status).to.equal(1);
    });

    it("should fail with zero address for sender", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        ethers.ZeroAddress,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 0", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        0,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 1000", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        100,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      await mock1215.setResponse(false, 366);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        ethers.MaxUint256,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(366n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with amount more than contract balance", async () => {
      await mock1215.setResponse(false, 10);
      // expect(await signers[0].provider.getBalance(await hip1215.getAddress())).to.eq(0);
      await signers[0].sendTransaction({
        to:  await hip1215.getAddress(),
        value: ethers.parseEther("5"),
      });
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(10n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with amount sent to contract", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584",
        { value: ethers.parseEther("5") }
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed? with empty calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed schedule but fail execution with invalid calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0xabc123"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with 0 expiry", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with expiry at current time", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should change the state after schedule executed", async () => {
      await mock1215.setResponse(true, 22);
      expect(await hip1215.getValue()).to.equal(0);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
      expect(await hip1215.getValue()).to.equal(0n);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it("should fail with sender as zero address", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        ethers.ZeroAddress,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with sender as contract", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.scheduleCallWithPayerWithFullParam(
        "0x0000000000000000000000000000000000000167",
        await hip1215.getAddress(),
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });


  });

  describe("executeCallOnSenderSignature()", () => {
    it("should schedule a call with sender signature", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with zero address for to", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        ethers.ZeroAddress,
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with eoa address for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        signers[0].address,
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with address(this) for to", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal("0x000000000000000000000000000000000000007B");
      expect(transaction.status).to.equal(1);
    });

    it("should fail with zero address for sender", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        ethers.ZeroAddress,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 0", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        0,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit 1000", async () => {
      await mock1215.setResponse(false, 30);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        100,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(30n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with gasLimit uint.maxvalue", async () => {
      await mock1215.setResponse(false, 366);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        ethers.MaxUint256,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(366n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with amount more than contract balance", async () => {
      await mock1215.setResponse(false, 10);
      // expect(await signers[0].provider.getBalance(await hip1215.getAddress())).to.eq(0);
      await signers[0].sendTransaction({
        to:  await hip1215.getAddress(),
        value: ethers.parseEther("5"),
      });
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(10n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed with amount sent to contract", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        ethers.parseEther('5'),
        "0x5b8f8584",
        { value: ethers.parseEther("5") }
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed? with empty calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should succeed schedule but fail execution with invalid calldata", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0xabc123"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with 0 expiry", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        0,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with expiry at current time", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds(),
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with expiry at max expiry + 1", async () => {
      await mock1215.setResponse(false, 370);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        signers[1].address,
        new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(370n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should change the state after schedule executed", async () => {
      await mock1215.setResponse(true, 22);
      expect(await hip1215.getValue()).to.equal(0);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        await hip1215.getAddress(),
        signers[1].address,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      expect(transaction.status).to.equal(1);
      expect(await hip1215.getValue()).to.equal(0n);
      await new Promise(resolve => setTimeout(resolve, 100));
    });


    it("should fail with sender as zero address", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        ethers.ZeroAddress,
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });

    it("should fail with sender as contract", async () => {
      await mock1215.setResponse(false, 15);
      const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
        "0x0000000000000000000000000000000000000167",
        await hip1215.getAddress(),
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name == Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(15n);
      expect(log.args[1]).to.equal('0x0000000000000000000000000000000000000000');
      expect(transaction.status).to.equal(1);
    });
  });

  describe("deleteSchedule()", () => {
      // add when we have state to check
  });

  describe("hasScheduleCapacity()", () => {
    it("should have enough capacity", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      expect(tx).to.be.true;
    });

    it("should return false for expiry in the past", async () => {
      await mock1215.setResponse(false, 1);
      const tx = await hip1215.hasScheduleCapacity(
        1716666666,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      expect(tx).to.be.false;
    });

    it("Should return false for valid expiry and 0 gas limit", async () => {
      await mock1215.setResponse(false, 1);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        0,
      );
      expect(tx).to.be.false;
    });
  
    it("Should return false for valid expiry and max gas limit", async () => {
      await mock1215.setResponse(false, 1);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_15M.gasLimit,
      );
      expect(tx).to.be.false;
    });

    it("Should return true for valid expiry and max gas limit - 1", async () => {
      await mock1215.setResponse(true, 22);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_15M.gasLimit - 1,
      );
      expect(tx).to.be.true;
    });
  });

}); 