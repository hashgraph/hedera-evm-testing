const { randomAddress, randomStorageSlot } = require("../../../utils/random");
const {ethers} = require("hardhat");
const Constants = require("../../../utils/constants");

const SLOT_MASK =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function callWithRandomAccessList(
  callerContract,
  targetContractAddress,
  storageKeysCount,
) {
  const accessList = [];
  for (addressKeysCount of storageKeysCount) {
    const storageKeys = [];
    for (let i = 0; i < addressKeysCount; i++) {
      storageKeys.push(randomStorageSlot());
    }
    accessList.push({
      address: randomAddress(),
      storageKeys: storageKeys,
    });
  }
  return await callerContract
    .call(targetContractAddress, {
      gasLimit: 100_000, //TODO remove after MN will support gasEstimate
      accessList: accessList,
    })
    .then((tx) => tx.wait());
}

async function callWithAccessList(
  callerContract,
  targetContractAddress,
  numericStorageKeys,
) {
  const accessList = [];
  const storageKeys = [];
  if (numericStorageKeys) {
    for (numericKey of numericStorageKeys) {
      storageKeys.push(
        SLOT_MASK.slice(0, -numericKey.toString().length) + numericKey,
      );
    }
    accessList.push({
      address: targetContractAddress,
      storageKeys: storageKeys,
    });
  }

  return await callerContract
    .call(targetContractAddress, {
      accessList: accessList,
    })
    .then((tx) => tx.wait());
}

async function createEoa(balance) {
  const signers = await ethers.getSigners();
  // create new receiver account
  const eoa = ethers.Wallet.createRandom(ethers.provider);
  const transaction = await signers[0].sendTransaction({
    to: eoa.address,
    value: Constants.ONE_HBAR * BigInt(balance),
  });
  await transaction.wait(); // wait for receipt
  return eoa;
}

module.exports = {
  callWithRandomAccessList,
  callWithAccessList,
  createEoa,
};
