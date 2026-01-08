const { ethers } = require("hardhat");
const { ONE_HBAR } = require("../../utils/constants");
const Async = require("../../utils/async");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const {
  createMirrorNodeClient,
  getScheduledTxStatus,
} = require("./utils/hip1215-utils");

const WAIT_STEP = 2000;
let hip1215, impl1215, signers, mnClient;

async function beforeTests() {
  // provider configs override
  ethers.provider.estimateGas = async () => 2_000_000; //TODO Glib: why do we still have this override?
  signers = await ethers.getSigners();
  // deploy impl contract
  impl1215 = await contractDeployAndFund("HederaScheduleService_HIP1215", 0, 0);
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
  // sdkClient = await Utils.createSDKClient();
  mnClient = createMirrorNodeClient();
  console.log("Done hip1215:", hip1215.target);
  return [hip1215, impl1215, signers, mnClient];
}

async function afterTests(
  scheduleCheck = [],
  balanceCheck = [],
  scheduleTxCheck = [],
) {
  for (const check of scheduleCheck) {
    console.log(
      "'%s': Wait for 'addTests' schedule tx:%s at %s second",
      check.id,
      check.scheduleTx,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    expect(await hip1215.getTests()).to.contain(check.id);
  }
  for (const check of balanceCheck) {
    console.log(
      "'%s': Wait for balance tx:%s at %s second",
      check.id,
      check.scheduleTx,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    expect(await signers[0].provider.getBalance(check.address)).to.equal(
      check.balance,
    );
  }
  for (const check of scheduleTxCheck) {
    console.log(
      "'%s': Wait for schedule status tx:%s at %s second",
      check.id,
      check.scheduleTx,
      check.expirySecond,
    );
    await Async.waitFor(check.expirySecond * 1000 + WAIT_STEP, WAIT_STEP);
    const scheduledTxResult = await getScheduledTxStatus(
      mnClient,
      check.scheduleAddress,
    );
    expect(scheduledTxResult).to.equal(check.executionResult);
  }
}

module.exports = {
  beforeTests,
  afterTests,
};
