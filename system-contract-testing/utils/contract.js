const { ethers } = require("hardhat");

async function contractDeployAndFund(name, value = 0) {
  const contract = await ethers.deployContract(name, {
    value: ethers.parseEther(value.toString()),
  });
  await contract.waitForDeployment();
  console.log(
    "Deployed '%s' contract address:%s balance:%s HBAR",
    name,
    contract.target,
    value
  );
  return contract;
}

module.exports = {
  contractDeployAndFund,
};
