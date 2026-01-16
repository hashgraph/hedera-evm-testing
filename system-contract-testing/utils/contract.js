const { ethers } = require("hardhat");

async function contractDeployAndFund(name, value = 0) {
  const contract = await ethers.deployContract(name);
  await contract.waitForDeployment();
  // transfer funds to test contract
  if (value > 0) {
    // TODO check why value at deployContract not working here?
    const signers = await ethers.getSigners();
    await signers[0].sendTransaction({
      to: contract.target,
      value: ethers.parseEther(value.toString()),
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
