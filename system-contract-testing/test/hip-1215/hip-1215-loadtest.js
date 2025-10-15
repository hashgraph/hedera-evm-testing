const { ethers } = require("hardhat");
const { ONE_HBAR } = require("../../utils/constants");
const { getExpirySecond } = require("./utils/hip1215-utils");
const { expect } = require("chai");
const Async = require("../../utils/async");

const payableIncrementCallAbiStr = ["function payableIncrementCall(uint _nonce)"];
const payableIncrementCallAbi = new ethers.Interface(
  payableIncrementCallAbiStr,
);

describe("HIP-1215 Loadtest", () => {
  let hip1215;

  before(async () => {
    // provider configs override
    ethers.provider.estimateGas = async () => 2_000_000;
    signers = await ethers.getSigners();
    // deploy test contract
    const HIP1215Factory = await ethers.getContractFactory(
      "LoadTestContract",
    );
    hip1215 = await HIP1215Factory.deploy();
    await hip1215.waitForDeployment();
    // transfer funds to test contract
    await signers[0].sendTransaction({
      to: hip1215.target,
      value: ONE_HBAR,
    });
    console.log("Done hip1215:", hip1215.target);
  });

  it("Schedule increment + value transfer", async () => {
    const scheduleShiftSeconds = 2;
    const callData = payableIncrementCallAbi.encodeFunctionData(
      "payableIncrementCall", [11]
    );
    const scheduleTx = await hip1215.scheduleCall(
      hip1215.target,
      getExpirySecond(scheduleShiftSeconds),
      50_000,
      1000n, // 1000 TINYBARS
      callData,
    );
    console.log("Schedule callData:", callData);
    console.log("Schedule tx:", scheduleTx.hash);
    // wait for schedule to be executed
    await Async.wait((scheduleShiftSeconds + 1) * 1000);
    const scheduleCounter = await hip1215.getScheduleCounter();
    console.log("scheduleCounter:", scheduleCounter);
    expect(scheduleCounter).to.equal(1);
  });

  it("Get count", async () => {
    const HIP1215Factory = await ethers.getContractFactory(
      "LoadTestContract",
    );
    const contract = HIP1215Factory.attach(
      "0x000000000000000000000000000000000005ffaa" // The deployed contract address
    );
    console.log("getScheduleCounter", await contract.getScheduleCounter());

  });
});
