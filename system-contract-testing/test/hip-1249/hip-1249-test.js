const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GAS_LIMIT_15M, ONE_HBAR } = require("../../utils/constants");
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

  async function createSigners(count, value) {
    const newSigners = [];
    for (let i = 0; i < count; i++) {
      // create new signer
      const newWallet = ethers.Wallet.createRandom();
      // connect new signer to provider
      const newSigner = await newWallet.connect(ethers.provider);
      newSigners.push(newSigner);
      // transfer funds to new signer
      if (value > 0) {
        await signers[0].sendTransaction({
          to: newSigner.address,
          value: ONE_HBAR * BigInt(value),
        });
      }
      console.log(
        "Signer:%s '%s' balance:%s HBAR",
        i + 1,
        newSigner.address,
        value,
      );
    }
    return newSigners;
  }

  async function simulateOpsDurationThrottling(newSigners, cycles, sleep) {
    if (cycles * sleep > 1000) {
      throw Error(
        `cycles * sleep cant be more change opsDuration bucket (1000 ms)`,
      );
    }
    // we are using single signer up to first possible 'CONSENSUS_GAS_EXHAUSTED' because:
    // 1. we're sending calls in parallel, to make it fast enough to produce CONSENSUS_GAS_EXHAUSTED
    // 2. we cant track the nonce w/o getting the transaction result
    // 3. so we need a new signer with 0 nonce for each new 'cycle' up to possible 'CONSENSUS_GAS_EXHAUSTED'
    const transactions = [];
    for (const [n, signer] of newSigners.entries()) {
      let nonce = 0;
      for (let i = 0; i < cycles; i++) {
        const tx = hip1249.connect(signer).simulateOpsDurationThrottling(130, {
          gasLimit: GAS_LIMIT_15M.gasLimit,
          nonce: nonce,
        });
        transactions.push(tx);
        console.log(
          "Transaction:%s signer:%s time:%s, nonce:%s",
          (n + 1) * (i + 1),
          signer.address,
          new Date(),
          nonce,
        );
        nonce++;
        await Async.wait(sleep); // wait a bit to order the transactions
      }
      await Async.wait(1000 - cycles * sleep); // wait til the next opsDuration bucket (each 1000 ms)
    }
    return transactions;
  }

  it("simulate ops duration throttling", async () => {
    const signers = 10; // each signer used to fill 1 opsDuration bucket (1000 ms)
    const cyclesToThrottling = 4;
    const newSigners = await createSigners(signers, cyclesToThrottling * 10);
    const transaction = await simulateOpsDurationThrottling(
      newSigners,
      cyclesToThrottling,
      50,
    );
    const throttledTxReceipts = [];
    for (const [i, tx] of transaction.entries()) {
      const txResult = await tx;
      const txReceipt = await Async.waitForCondition(
        // sometimes txReceipt can be null, mb because nodes need more time to sync, skipping status for this ones
        "get_receipt",
        () => ethers.provider.getTransactionReceipt(txResult.hash),
        (result) => result != null,
        1000,
        60,
      );
      console.log(
        "Transaction:%s.hash:%s status:%s",
        i + 1,
        txResult.hash,
        txReceipt == null ? null : txReceipt.status,
      );
      if (txReceipt != null && txReceipt.status === 0) {
        throttledTxReceipts.push(txReceipt);
        // TODO should we check each possible throttled tx that its error really 'CONSENSUS_GAS_EXHAUSTED'?
      }
    }
    expect(throttledTxReceipts.length > 0).is.true;
    console.log(
      "Got '%s' throttled transactions in total",
      throttledTxReceipts.length,
    );
  }).timeout(600000);
});
