// HIP: https://hips.hedera.com/hip/hip-1249
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { GAS_LIMIT_15M, ONE_HBAR, Contract} = require("../../utils/constants");
const Async = require("../../utils/async");
const { createMirrorNodeClient } = require("../../utils/mirrorNode");

describe("HIP-1249 'ops duration throttling' tests", () => {
  let signers, hip1249, mnClient;

  // preconditions before test run
  before(async () => {
    signers = await ethers.getSigners();
    // deploy test contract
    const HIP1249Factory = await ethers.getContractFactory(Contract.HIP1249Contract);
    hip1249 = await HIP1249Factory.deploy();
    await hip1249.waitForDeployment();
    console.log("Deploy hip1249:", hip1249.target);
    mnClient = createMirrorNodeClient();
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

  async function simulateThrottling(newSigners, cycles, sleep) {
    if (cycles * sleep > 1000) {
      // The idea here is that a single signer can be used to fulfill just 1 OpsDuration bucket (over 1 second)
      // because of the manual nonce tracking problem after the first throttling error.
      throw Error(
        `cycles * sleep cant be more than opsDuration bucket (1000 ms)`,
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
        const tx = hip1249
          .connect(signer)
          .simulateOpsDurationThrottling(62000, {
            gasLimit: GAS_LIMIT_15M.gasLimit,
            nonce: nonce,
          });
        transactions.push(tx);
        console.log(
          "Transaction:%s signer:%s time:%s, nonce:%s",
          n * cycles + i + 1,
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
    const signers = 2; // each signer used to fill 1 opsDuration bucket (1000 ms)
    const cyclesToThrottling = 4;
    const newSigners = await createSigners(signers, cyclesToThrottling * 11);
    const transaction = await simulateThrottling(
      newSigners,
      cyclesToThrottling,
      20,
    );
    await Promise.all(transaction); // wait for all transactions
    await Async.wait(2000); // wait a bit for MN to sync data
    const contractCalls = await Async.waitForCondition(
      "get_contract_results",
      () =>
        mnClient.getContractResultsByContract(hip1249.target, {
          limit: "100",
          order: "desc",
        }),
      (result) =>
        result.length >= signers * cyclesToThrottling || result.length >= 100,
      2000,
      30,
    );
    const throttledTxCount = contractCalls.filter(
      (e) =>
        // "CONSENSUS_GAS_EXHAUSTED" in hex format
        e.error_message === "0x434f4e53454e5355535f4741535f455848415553544544",
    ).length;
    expect(throttledTxCount > 0).is.true;
    console.log("Got '%s' throttled transactions in total", throttledTxCount);
  }).timeout(600000); // locally increate the timeout
});
