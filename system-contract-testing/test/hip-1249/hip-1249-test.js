const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GAS_LIMIT_15M } = require("../../utils/constants");
const Async = require("../../utils/async");

describe("HIP-1249 'ops duration throttling' tests", () => {
  let signers, hip1249;

  // preconditions before test run
  before(async () => {
    signers = await ethers.getSigners();
    // deploy test contract
    const HIP1249Factory = await ethers.getContractFactory("HIP1249Contract");
    hip1249 = await HIP1249Factory.deploy();
    await hip1249.waitForDeployment();
    console.log("Deploy hip1249:", hip1249.target);
  });

  async function simulateOpsDurationThrottling(cycles, startingNonce) {
    // run transactions
    const transactions = [];
    let nonce = startingNonce;
    for (let i = 0; i < cycles; i++) {
      const tx = hip1249.simulateOpsDurationThrottling(130, {
        gasLimit: GAS_LIMIT_15M.gasLimit,
        nonce: nonce,
      });
      transactions.push(tx);
      console.log("Transaction time:%s, nonce:%s", new Date(), nonce);
      nonce++;
      await Async.wait(10); // wait a bit to order the transactions
    }
    return transactions;
  }

  it("simulate ops duration throttling", async () => {
    const nonce = await ethers.provider.getTransactionCount(signers[0].address);
    console.log("Nonce:", signers[0].address, nonce);
    // This is expected to leave the bucket overfilled when complete
    const cycles = 4;
    const transaction = await simulateOpsDurationThrottling(cycles, nonce);
    let throttledTx;
    for (const tx of transaction) {
      const txResult = await tx;
      const txReceipt = await ethers.provider.getTransactionReceipt(txResult.hash);
      console.log("Transaction.hash:%s status:%s", txResult.hash, txReceipt.status);
      if (txReceipt.status === 0) {
        throttledTx = txReceipt;
        break;
      }
    }
    expect(throttledTx).is.exist;
    console.log("Throttled transaction.hash:", throttledTx.hash);
    // TODO should we check "Error Message: CONSENSUS_GAS_EXHAUSTED" somehow?
  });
});
