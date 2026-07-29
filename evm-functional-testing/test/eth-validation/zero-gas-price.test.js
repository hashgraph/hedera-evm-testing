// ETH Validation: zero gas price transactions
//
// On Hedera a state-changing transaction with an offered gas price of zero is fully
// subsidized by the relay operator: the sender offers 0 and the relay covers the entire
// fee, provided it is configured with a sufficient MAX_GAS_ALLOWANCE_HBAR (its default
// "0" rejects such transactions; see local/relay-zero-gas-values.yaml). The transaction
// then executes normally. Ethereum reference EVMs (geth, Hardhat) reject any transaction
// whose gas price is below the current block base fee.
//
// This is an intentional Hedera divergence (documented in
// docs/eth-validation/eth-validation.md). To keep a single network-agnostic test body
// green across Hedera `solo`, `geth` and `hardhat`, each case asserts the Hedera
// behaviour (accepted + correct effect) and, on Ethereum reference networks, asserts
// the divergent rejection instead.
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const { gas, isEthNetwork } = require("../hip-1340/utils/web3");
const {
  tinybarValue,
  ZERO_GAS_PRICE,
  expectedCreateAddress,
} = require("./utils/eth-validation-utils");

describe("ETH Validation - Zero gas price", async () => {
  let signers;

  before(async () => {
    signers = await ethers.getSigners();
  });

  it("should accept a value transfer submitted with a zero gas price", async () => {
    const value = tinybarValue(250_000);
    const recipient = ethers.Wallet.createRandom();
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(0n);

    const send = signers[0]
      .sendTransaction({
        to: recipient.address,
        value,
        gasLimit: gas.base + gas.accountCreationCost(),
        gasPrice: ZERO_GAS_PRICE,
      })
      .then((tx) => tx.wait());

    if (isEthNetwork()) {
      // Reference EVMs reject a gas price below the block base fee.
      await expect(send).to.be.rejected;
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(0n);
      return;
    }

    const receipt = await send;
    expect(receipt.status).to.equal(1);
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(value);
  });

  it("should accept a contract call submitted with a zero gas price", async () => {
    const storage = await contractDeployAndFund(
      Constants.Contract.SimpleStorage,
    );

    const send = storage
      .setValue(42, { gasLimit: 1_000_000, gasPrice: ZERO_GAS_PRICE })
      .then((tx) => tx.wait());

    if (isEthNetwork()) {
      await expect(send).to.be.rejected;
      // storage was deployed with its default value, the call never applied
      expect(await storage.getValue()).to.equal(0);
      return;
    }

    const receipt = await send;
    expect(receipt.status).to.equal(1);
    expect(await storage.getValue()).to.equal(42);
    expect(await storage.lastSender()).to.equal(signers[0].address);
  });

  it("should accept a contract deployment submitted with a zero gas price", async () => {
    const deployer = signers[0];
    const predicted = expectedCreateAddress(
      deployer.address,
      await deployer.getNonce(),
    );
    const factory = await ethers.getContractFactory(
      Constants.Contract.SimpleStorage,
    );

    const send = deployer
      .sendTransaction({
        data: factory.bytecode,
        gasLimit: 1_000_000,
        gasPrice: ZERO_GAS_PRICE,
      })
      .then((tx) => tx.wait());

    if (isEthNetwork()) {
      await expect(send).to.be.rejected;
      expect(await ethers.provider.getCode(predicted)).to.equal("0x");
      return;
    }

    const receipt = await send;
    expect(receipt.status).to.equal(1);
    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
  });
});
