const { ethers } = require("hardhat");
const { ONE_HBAR } = require("../../utils/constants");
const Async = require("../../utils/async");
const { expect } = require("chai");

let hip1215, impl1215, signers;

async function beforeTests() {
  if (hip1215 == null && impl1215 == null && signers == null) {
    // provider configs override
    ethers.provider.estimateGas = async () => 1_200_000;
    signers = await ethers.getSigners();
    // deploy impl contract
    const HIP1215ImplFactory = await ethers.getContractFactory(
      "HederaScheduleService_HIP1215",
    );
    impl1215 = await HIP1215ImplFactory.deploy();
    await impl1215.waitForDeployment();
    // deploy test contract
    const HIP1215Factory = await ethers.getContractFactory("HIP1215Contract");
    console.log("Deploy hip1215 with impl:", impl1215.target);
    hip1215 = await HIP1215Factory.deploy(impl1215.target);
    await hip1215.waitForDeployment();
    // transfer funds to test contract
    await signers[0].sendTransaction({
      to: hip1215.target,
      value: ONE_HBAR * 10n,
    });
    console.log("Done hip1215:", hip1215.target);
    ethers.provider.estimateGas = async () => 2_000_000;
  }
  return [hip1215, impl1215, signers];
}

async function afterTests(scheduleCheck = [], balanceCheck = []) {
  for (const check of scheduleCheck) {
    console.log(
      "Wait for schedule '%s' at %s second",
      check.id,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + 2000, 1000);
    expect(await hip1215.getTests()).to.contain(check.id);
  }
  for (const check of balanceCheck) {
    console.log(
      "Wait for balance '%s' at %s second",
      check.id,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + 2000, 1000);
    expect(await signers[0].provider.getBalance(check.address)).to.equal(
      check.balance,
    );
  }
}

module.exports = {
  beforeTests,
  afterTests,
};
