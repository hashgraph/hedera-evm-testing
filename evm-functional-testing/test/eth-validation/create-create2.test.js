// ETH Validation: in-EVM contract creation via CREATE and CREATE2 (EIP-1014)
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const { randomStorageSlot } = require("../../utils/random");
const {
  expectedCreateAddress,
  expectedCreate2Address,
  childInitCode,
  deployedAddress,
} = require("./utils/eth-validation-utils");

// PUSH0 PUSH0 REVERT — init code that always reverts without deploying anything
const REVERTING_INITCODE = "0x5f5ffd";

describe("ETH Validation - CREATE and CREATE2", async () => {
  let signers, factory, childContractFactory;

  before(async () => {
    signers = await ethers.getSigners();
    factory = await contractDeployAndFund(Constants.Contract.EthValidationFactory);
    childContractFactory = await ethers.getContractFactory(
      Constants.Contract.SimpleChild,
    );
  });

  async function deployChild(method, ...args) {
    const receipt = await factory[method](...args).then((tx) => tx.wait());
    return deployedAddress(factory, receipt);
  }

  describe("positive cases", async () => {
    it("should deploy a child via CREATE with code and correct constructor state", async () => {
      const childAddress = await deployChild("deployCreate", 7);

      expect(await ethers.provider.getCode(childAddress)).to.not.equal("0x");
      const child = childContractFactory.attach(childAddress);
      expect(await child.seed()).to.equal(7);
    });

    it("should derive the CREATE address from the factory address and nonce", async () => {
      const factoryNonce = await ethers.provider.getTransactionCount(
        factory.target,
      );
      const predicted = expectedCreateAddress(factory.target, factoryNonce);

      const childAddress = await deployChild("deployCreate", 8);
      expect(childAddress).to.equal(predicted);
    });

    it("should produce different addresses for sequential CREATE deployments", async () => {
      const first = await deployChild("deployCreate", 9);
      const second = await deployChild("deployCreate", 9);
      expect(first).to.not.equal(second);
    });

    it("should deploy via CREATE2 at the address predicted on-chain and off-chain", async () => {
      const seed = 21;
      const salt = randomStorageSlot();

      const onChainPrediction = await factory.predictCreate2(seed, salt);
      const offChainPrediction = expectedCreate2Address(
        factory.target,
        salt,
        await childInitCode(seed),
      );
      expect(onChainPrediction).to.equal(offChainPrediction);

      const childAddress = await deployChild("deployCreate2", seed, salt);
      expect(childAddress).to.equal(onChainPrediction);
      const child = childContractFactory.attach(childAddress);
      expect(await child.seed()).to.equal(seed);
    });

    it("should derive CREATE2 addresses deterministically from salt and init code", async () => {
      const seed = 22;
      const saltA = randomStorageSlot();
      const saltB = randomStorageSlot();

      // different salt, same init code -> different address
      expect(await factory.predictCreate2(seed, saltA)).to.not.equal(
        await factory.predictCreate2(seed, saltB),
      );
      // same salt, different init code (constructor args) -> different address
      expect(await factory.predictCreate2(seed, saltA)).to.not.equal(
        await factory.predictCreate2(seed + 1, saltA),
      );
      // same salt + same init code -> same address, from any vantage point
      expect(await factory.predictCreate2(seed, saltA)).to.equal(
        expectedCreate2Address(factory.target, saltA, await childInitCode(seed)),
      );
    });

    it("should deploy a callable child via raw CREATE2 assembly", async () => {
      const seed = 23;
      const salt = randomStorageSlot();
      const initCode = await childInitCode(seed);

      const childAddress = await deployChild("deployCreate2Raw", initCode, salt);
      expect(childAddress).to.equal(
        expectedCreate2Address(factory.target, salt, initCode),
      );
      const child = childContractFactory.attach(childAddress);
      expect(await child.seed()).to.equal(seed);
    });
  });

  describe("negative cases", async () => {
    it("should reject a CREATE2 deployment to an address that already has code", async () => {
      const seed = 31;
      const salt = randomStorageSlot();
      const childAddress = await deployChild("deployCreate2", seed, salt);

      // typed `new SimpleChild{salt: ...}` reverts the whole transaction on collision
      await expect(
        factory
          .deployCreate2(seed, salt, Constants.GAS_LIMIT_1_000_000)
          .then((tx) => tx.wait()),
      ).to.be.rejected;

      // raw CREATE2 reports the collision as address(0) instead of reverting
      const rawResult = await factory.deployCreate2Raw.staticCall(
        await childInitCode(seed),
        salt,
      );
      expect(rawResult).to.equal(ethers.ZeroAddress);

      // the first deployment is untouched
      expect(await ethers.provider.getCode(childAddress)).to.not.equal("0x");
      expect(
        await childContractFactory.attach(childAddress).seed(),
      ).to.equal(seed);
    });

    it("should return address(0) and deploy no code when the init code reverts", async () => {
      const salt = randomStorageSlot();

      expect(
        await factory.deployCreate2Raw.staticCall(REVERTING_INITCODE, salt),
      ).to.equal(ethers.ZeroAddress);
      expect(
        await factory.deployCreateRaw.staticCall(REVERTING_INITCODE),
      ).to.equal(ethers.ZeroAddress);

      // the outer transaction itself still succeeds and no code appears at the target address
      const receipt = await factory
        .deployCreate2Raw(REVERTING_INITCODE, salt, Constants.GAS_LIMIT_1_000_000)
        .then((tx) => tx.wait());
      expect(receipt.status).to.equal(1);
      const predicted = expectedCreate2Address(
        factory.target,
        salt,
        REVERTING_INITCODE,
      );
      expect(await ethers.provider.getCode(predicted)).to.equal("0x");
    });

    // Hedera-divergent: SELFDESTRUCT keeps Hedera entities alive (no address reuse) and
    // post-Cancun EIP-6780 semantics make redeploy-to-same-address unstable on Ethereum too.
    // Documented as out of scope in docs/eth-validation/eth-validation.md.
    xit("should redeploy to the same CREATE2 address after SELFDESTRUCT", async () => {});
  });
});
