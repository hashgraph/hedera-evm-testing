const { expect } = require("chai");
const { ethers } = require("hardhat");
const Utils = require('../../utils/utils');
const { GAS_LIMIT_1_000_000, GAS_LIMIT_15M, Events } = require("../../utils/constants");


describe("HIP-1215 System Contract testing", () => {
  let hip1215, mock1215;

  before(async () => {
    // provider configs override
    ethers.provider.estimateGas = async() => 1_000_000;
    // Extract this to a fixture and run
    const HIP1215MockFactory = await ethers.getContractFactory("HIP1215MockContract");
      HIP1215MockFactory.memo
    console.log("Deploy mock:");
    mock1215 = await HIP1215MockFactory.deploy();
    const HIP1215Factory = await ethers.getContractFactory("HIP1215Contract");
    console.log("Deploy hip1215 with mock:", mock1215.target);
    hip1215 = await HIP1215Factory.deploy(mock1215.target);
    await hip1215.waitForDeployment();
    console.log("Done hip1215:", hip1215.target);
  });

  describe("scheduleCall", () => {
    it("should schedule a call", async () => {
      await mock1215.setResponse(true);
      const tx = await hip1215.scheduleCallWithFullParam(
        "0x0000000000000000000000000000000000000167",
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        "0x5b8f8584"
      );
      const transaction = await tx.wait();
      const log = transaction.logs.find(
        e => e.fragment.name === Events.ScheduleCall
      );
      expect(log.args[0]).to.equal(22n);
      expect(log.args[1]).to.equal('0x000000000000000000000000000000000000007B');
      // With mocked setup we can only verify that the txn was success/revert
      expect(transaction.status).to.equal(1);
    });
  });

  describe("hasScheduleCapacity()", () => {
    it("should have enough capacity", async () => {
      await mock1215.setResponse(true);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      expect(tx).to.be.true;
    });

    it("should return false for expiry in the past", async () => {
      await mock1215.setResponse(false);
      const tx = await hip1215.hasScheduleCapacity(
        1716666666,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      expect(tx).to.be.false;
    });

    it("Should return false for valid expiry and 0 gas limit", async () => {
      await mock1215.setResponse(false);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        0,
      );
      expect(tx).to.be.false;
    });

    it("Should return false for valid expiry and max gas limit", async () => {
      await mock1215.setResponse(false);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_15M.gasLimit,
      );
      expect(tx).to.be.false;
    });

    it("Should return false for valid expiry and max gas limit", async () => {
      await mock1215.setResponse(true);
      const tx = await hip1215.hasScheduleCapacity(
        new Date().getUTCMilliseconds() + 100,
        GAS_LIMIT_15M.gasLimit - 1,
      );
      expect(tx).to.be.true;
    });
  });

}); 