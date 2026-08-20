// ETH Validation: call edge cases (EOA/empty targets, gas forwarding, reentrancy, nesting depth)
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const { randomAddress } = require("../../utils/random");
const { gas } = require("../hip-1340/utils/web3");
const { tinybarValue, callGasPrice } = require("./utils/eth-validation-utils");

describe("ETH Validation - Call edge cases", async () => {
  let signers, caller, storage;

  before(async () => {
    signers = await ethers.getSigners();
    caller = await contractDeployAndFund(Constants.Contract.EthValidationCaller);
    storage = await contractDeployAndFund(Constants.Contract.SimpleStorage);
  });

  async function deployReentrancyPair() {
    const victim = await contractDeployAndFund(
      Constants.Contract.ReentrancyVictim,
    );
    const attacker = await contractDeployAndFund(
      Constants.Contract.ReentrancyAttacker,
    );
    return { victim, attacker };
  }

  describe("positive cases", async () => {
    it("should succeed with empty return data when calling into an EOA", async () => {
      const [ok, ret, len] = await caller.callEmpty.staticCall(
        signers[0].address,
      );
      expect(ok).to.be.true;
      expect(ret).to.equal("0x");
      expect(len).to.equal(0);

      const receipt = await caller
        .callEmpty(signers[0].address, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(receipt.status).to.equal(1);
    });

    it("should succeed with empty return data when calling into a non-existent account", async () => {
      // random address, far outside Hedera's reserved system-contract/precompile ranges
      const target = randomAddress();

      const [ok, ret, len] = await caller.callEmpty.staticCall(target);
      expect(ok).to.be.true;
      expect(ret).to.equal("0x");
      expect(len).to.equal(0);
    });

    it("should increase an EOA's balance by exactly the transferred value", async () => {
      const value = tinybarValue(250_000);
      const recipient = ethers.Wallet.createRandom();
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(0n);

      await signers[0]
        .sendTransaction({
          to: recipient.address,
          value,
          gasLimit: gas.base + gas.accountCreationCost(),
          gasPrice: callGasPrice(),
        })
        .then((tx) => tx.wait());

      expect(await ethers.provider.getBalance(recipient.address)).to.equal(
        value,
      );
    });

    it("should let an inner call with ample forwarded gas succeed (63/64 rule, behavioral)", async () => {
      const [ok] = await caller.callWithGas.staticCall(
        storage.target,
        400_000,
        63,
      );
      expect(ok).to.be.true;

      await caller
        .callWithGas(storage.target, 400_000, 63, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(await storage.getValue()).to.equal(63);
    });

    it("should complete bounded reentrancy with counters reflecting every hop", async () => {
      const { victim, attacker } = await deployReentrancyPair();

      await attacker
        .attack(victim.target, 3, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());

      expect(await victim.pingCount()).to.equal(3);
      expect(await attacker.pongCount()).to.equal(3);
    });

    it("should return correct data through a deeply nested call chain", async () => {
      const depth = 8;
      const result = await caller.nestedCall.staticCall(
        depth,
        storage.target,
        11,
      );
      // each hop adds 1 to the innermost setValue return value
      expect(result).to.equal(11 + depth);

      await caller
        .nestedCall(depth, storage.target, 11, Constants.GAS_LIMIT_2_000_000)
        .then((tx) => tx.wait());
      expect(await storage.getValue()).to.equal(11);
      // the innermost frame was entered from the caller contract itself
      expect(await storage.lastSender()).to.equal(caller.target);
    });
  });

  describe("negative cases", async () => {
    it("should revert guarded reentrancy and roll back all its state changes", async () => {
      const { victim, attacker } = await deployReentrancyPair();

      await expect(
        attacker
          .attackGuarded(victim.target, Constants.GAS_LIMIT_1_000_000)
          .then((tx) => tx.wait()),
      ).to.be.rejected;

      expect(await victim.guardedCount()).to.equal(0);
    });

    it("should fail a gas-starved inner call while the outer transaction succeeds", async () => {
      const valueBefore = await storage.getValue();

      const [ok] = await caller.callWithGas.staticCall(
        storage.target,
        10_000,
        999,
      );
      expect(ok).to.be.false;

      const receipt = await caller
        .callWithGas(storage.target, 10_000, 999, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(receipt.status).to.equal(1);
      expect(await storage.getValue()).to.equal(valueBefore);
    });

    // Hedera-divergent/gas-schedule sensitive: hitting the exact 1024 call-depth boundary
    // depends on precise per-frame gas retention, which is out of scope for parity testing.
    // Documented in docs/eth-validation/eth-validation.md.
    xit("should enforce the exact 1024 call-depth limit", async () => {});
  });
});
