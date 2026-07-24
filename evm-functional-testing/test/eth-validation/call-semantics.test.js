// ETH Validation: CALL / DELEGATECALL / STATICCALL semantics (storage context, msg.sender/tx.origin, value)
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const { tinybarValue, evmScale } = require("./utils/eth-validation-utils");

const abi = ethers.AbiCoder.defaultAbiCoder();

describe("ETH Validation - Call semantics", async () => {
  let signers, caller, secondCaller, storage;

  before(async () => {
    signers = await ethers.getSigners();
    caller = await contractDeployAndFund(Constants.Contract.EthValidationCaller);
    secondCaller = await contractDeployAndFund(Constants.Contract.EthValidationCaller);
    storage = await contractDeployAndFund(Constants.Contract.SimpleStorage);
  });

  describe("positive cases", async () => {
    it("should return data from CALL and write the callee's storage", async () => {
      const [ok, ret] = await caller.doCall.staticCall(storage.target, 123);
      expect(ok).to.be.true;
      expect(abi.decode(["uint256"], ret)[0]).to.equal(123n);

      await caller
        .doCall(storage.target, 123, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(await storage.getValue()).to.equal(123);
      // the caller's own slot 0 is untouched — CALL runs in the callee's storage context
      expect(await caller.value()).to.equal(0);
    });

    it("should set msg.sender to the calling contract and tx.origin to the EOA on CALL", async () => {
      await caller
        .doCall(storage.target, 124, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());

      expect(await storage.lastSender()).to.equal(caller.target);
      expect(await storage.lastOrigin()).to.equal(signers[0].address);
    });

    it("should write the caller's storage on DELEGATECALL and leave the callee untouched", async () => {
      const storageValueBefore = await storage.getValue();
      const data = storage.interface.encodeFunctionData("setValue", [456]);

      await caller
        .doDelegateCall(storage.target, data, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());

      expect(await caller.value()).to.equal(456);
      expect(await storage.getValue()).to.equal(storageValueBefore);
    });

    it("should preserve the outer msg.sender and msg.value on DELEGATECALL", async () => {
      const value = tinybarValue(700_000);
      const data = storage.interface.encodeFunctionData("setValue", [457]);

      await caller
        .doDelegateCall(storage.target, data, { value, ...Constants.GAS_LIMIT_1_000_000 })
        .then((tx) => tx.wait());

      // setValue executed in the caller's storage context sees the EOA as msg.sender
      expect(await caller.lastSender()).to.equal(signers[0].address);
      expect(await caller.lastOrigin()).to.equal(signers[0].address);
      // msg.value is EVM-denominated: tinybars on Hedera, wei on Ethereum
      expect(await caller.lastValue()).to.equal(evmScale(value));
    });

    it("should return data from STATICCALL into a view function", async () => {
      await caller
        .doCall(storage.target, 125, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());

      const data = storage.interface.encodeFunctionData("getValue");
      const [ok, ret] = await caller.doStaticCall(storage.target, data);
      expect(ok).to.be.true;
      expect(abi.decode(["uint256"], ret)[0]).to.equal(125n);
    });

    it("should forward value on CALL and expose it as msg.value in the callee", async () => {
      const value = tinybarValue(300_000);
      const balanceBefore = await ethers.provider.getBalance(storage.target);

      await caller
        .doCall(storage.target, 126, { value, ...Constants.GAS_LIMIT_1_000_000 })
        .then((tx) => tx.wait());

      // msg.value and address(this).balance are EVM-denominated: tinybars on Hedera, wei on Ethereum
      expect(await storage.lastValue()).to.equal(evmScale(value));
      expect(await storage.echoBalance()).to.equal(evmScale(balanceBefore + value));
      expect(await ethers.provider.getBalance(storage.target)).to.equal(
        balanceBefore + value,
      );
    });

    it("should propagate calldata, sender and return data through a 2-hop call chain", async () => {
      const innerData = storage.interface.encodeFunctionData("setValue", [77]);
      const midData = secondCaller.interface.encodeFunctionData("doCallData", [
        storage.target,
        innerData,
      ]);

      // return data flows back through both hops
      const [ok, ret] = await caller.doCallData.staticCall(
        secondCaller.target,
        midData,
      );
      expect(ok).to.be.true;
      const [innerOk, innerRet] = abi.decode(["bool", "bytes"], ret);
      expect(innerOk).to.be.true;
      expect(abi.decode(["uint256"], innerRet)[0]).to.equal(77n);

      await caller
        .doCallData(secondCaller.target, midData, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(await storage.getValue()).to.equal(77);
      // msg.sender is the immediate caller (hop 2), tx.origin stays the EOA
      expect(await storage.lastSender()).to.equal(secondCaller.target);
      expect(await storage.lastOrigin()).to.equal(signers[0].address);
    });
  });

  describe("negative cases", async () => {
    it("should fail a STATICCALL into a state-writing function and leave state unchanged", async () => {
      const valueBefore = await storage.getValue();

      const ok = await caller.doStaticCallWrite.staticCall(storage.target, 999);
      expect(ok).to.be.false;

      const receipt = await caller
        .doStaticCallWrite(storage.target, 999, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(receipt.status).to.equal(1);
      expect(await storage.getValue()).to.equal(valueBefore);
    });

    it("should bubble revert data with ok == false from a reverting DELEGATECALL", async () => {
      const data = storage.interface.encodeFunctionData("alwaysRevert");

      const [ok, ret] = await caller.doDelegateCall.staticCall(
        storage.target,
        data,
      );
      expect(ok).to.be.false;
      // Error(string) selector followed by the reason string
      expect(ret.slice(0, 10)).to.equal("0x08c379a0");
      const [reason] = abi.decode(["string"], "0x" + ret.slice(10));
      expect(reason).to.equal("SimpleStorage: forced revert");
    });
  });
});
