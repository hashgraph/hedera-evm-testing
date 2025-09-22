const { ethers } = require("hardhat");
const { ONE_HBAR } = require("../../utils/constants");
const Async = require("../../utils/async");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Utils = require("../../utils/utils");
const {
  createMirrorNodeClient,
  getScheduledTxStatus,
} = require("./utils/hip1215-utils");

const WAIT_STEP = 2000;
let hip1215, impl1215, signers, sdkClient, mnClient;

async function beforeTests() {
  if (hip1215 == null && impl1215 == null && signers == null) {
    // provider configs override
    ethers.provider.estimateGas = async () => 2_000_000;
    signers = await ethers.getSigners();
    // deploy impl contract
    impl1215 = await contractDeployAndFund(
      "HederaScheduleService_HIP1215",
      0,
      0,
    );
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
  }
  sdkClient = await Utils.createSDKClient();
  mnClient = createMirrorNodeClient();
  return [hip1215, impl1215, signers, mnClient];
}

async function afterTests(
  scheduleCheck = [],
  balanceCheck = [],
  scheduleTxCheck = [],
) {
  for (const check of scheduleCheck) {
    console.log(
      "'%s': Wait for schedule at %s second",
      check.id,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    expect(await hip1215.getTests()).to.contain(check.id);
  }
  for (const check of balanceCheck) {
    console.log(
      "'%s': Wait for balance at %s second",
      check.id,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    expect(await signers[0].provider.getBalance(check.address)).to.equal(
      check.balance,
    );
  }
  for (const check of scheduleTxCheck) {
    console.log(
      "'%s': Wait for tx:%s scheduleAddress:%s at %s second",
      check.id,
      check.scheduleTx,
      check.scheduleAddress,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    const scheduledTxStatus = await getScheduledTxStatus(
      mnClient,
      check.scheduleAddress,
    );
    expect(scheduledTxStatus).to.equal(check.expectedStatus);
  }
}

module.exports = {
  beforeTests,
  afterTests,
};
