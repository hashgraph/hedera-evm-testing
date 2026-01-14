// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { ONE_HBAR } = require("./constants");

async function contractDeployAndFund(name, gas = 0, value = 0) {
  // provider configs override
  if (gas > 0) {
    ethers.provider.estimateGas = async () => gas;
  }
  signers = await ethers.getSigners();
  // deploy contract
  const factory = await ethers.getContractFactory(name);
  contract = await factory.deploy();
  await contract.waitForDeployment();
  // transfer funds to test contract
  if (value > 0) {
    await signers[0].sendTransaction({
      to: contract.target,
      value: ONE_HBAR * BigInt(value),
    });
  }
  console.log(
    "Deployed '%s' contract address:%s balance:%s HBAR",
    name,
    contract.target,
    value,
  );
  return contract;
}

module.exports = {
  contractDeployAndFund,
};
