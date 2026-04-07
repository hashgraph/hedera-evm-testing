const { randomAddress, randomStorageSlot } = require("../../../utils/random");

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

module.exports = {
  callWithRandomAccessList,
  callWithAccessList,
};
