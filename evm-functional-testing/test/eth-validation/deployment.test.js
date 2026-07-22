// ETH Validation: contract deployment lifecycle (constructors, runtime code, deploy-time value)
const { ethers } = require("hardhat");
const { expect } = require("chai");
const Constants = require("../../utils/constants");
const {
  tinybarValue,
  deployRevertsWithoutCode,
} = require("./utils/eth-validation-utils");

describe("ETH Validation - Contract deployment", async () => {
  let signers;

  before(async () => {
    signers = await ethers.getSigners();
  });

  describe("positive cases", async () => {
    it("should expose constructor arguments after deployment", async () => {
      const contract = await ethers.deployContract(
        Constants.Contract.ContractWithArgs,
        [42, "hello eth-validation"],
      );
      await contract.waitForDeployment();

      expect(await contract.number()).to.equal(42);
      expect(await contract.text()).to.equal("hello eth-validation");
    });

    it("should deploy a contract without functions and still store non-empty runtime code", async () => {
      const contract = await ethers.deployContract(
        Constants.Contract.EmptyContract,
      );
      await contract.waitForDeployment();

      const code = await ethers.provider.getCode(contract.target);
      expect(code).to.not.equal("0x");
    });

    it("should report EXTCODESIZE equal to the runtime code returned by eth_getCode", async () => {
      const contract = await ethers.deployContract(
        Constants.Contract.SimpleStorage,
      );
      await contract.waitForDeployment();

      const code = await ethers.provider.getCode(contract.target);
      const codeSize = await contract.getCodeSizeOf(contract.target);
      expect(codeSize).to.be.greaterThan(0n);
      expect(codeSize).to.equal(BigInt(ethers.getBytes(code).length));
    });

    it("should report EXTCODESIZE == 0 for an EOA", async () => {
      const contract = await ethers.deployContract(
        Constants.Contract.SimpleStorage,
      );
      await contract.waitForDeployment();

      expect(await contract.getCodeSizeOf(signers[0].address)).to.equal(0n);
    });

    it("should store and hold value sent to a payable constructor", async () => {
      const value = tinybarValue(123_456_789);
      const contract = await ethers.deployContract(
        Constants.Contract.PayableCtor,
        { value },
      );
      await contract.waitForDeployment();

      expect(await contract.initialBalance()).to.equal(value);
      expect(await contract.deployer()).to.equal(signers[0].address);
      expect(await ethers.provider.getBalance(contract.target)).to.equal(value);
    });

    it("should produce runtime code independent of constructor arguments", async () => {
      const first = await ethers.deployContract(
        Constants.Contract.ContractWithArgs,
        [1, "a"],
      );
      await first.waitForDeployment();
      const second = await ethers.deployContract(
        Constants.Contract.ContractWithArgs,
        [999, "zzzzzzzzzzzz"],
      );
      await second.waitForDeployment();

      expect(first.target).to.not.equal(second.target);
      expect(await ethers.provider.getCode(first.target)).to.equal(
        await ethers.provider.getCode(second.target),
      );
    });

    it("should deploy a contract whose constructor takes the non-reverting branch", async () => {
      const contract = await ethers.deployContract(
        Constants.Contract.RevertingCtor,
        [false],
      );
      await contract.waitForDeployment();

      expect(await contract.ping()).to.be.true;
    });
  });

  describe("negative cases", async () => {
    it("should reject deployment when the constructor reverts and leave no code behind", async () => {
      await deployRevertsWithoutCode(Constants.Contract.RevertingCtor, [true]);
    });

    it("should reject value sent to a non-payable constructor and leave no code behind", async () => {
      await deployRevertsWithoutCode(
        Constants.Contract.ContractWithArgs,
        [7, "x"],
        { value: tinybarValue(100_000) },
      );
    });
  });
});
