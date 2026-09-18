const { randomAddress, randomStorageSlot } = require("../../../utils/random");
const { ethers } = require("hardhat");
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
      const hexKey = numericKey.toString(16);
      storageKeys.push(SLOT_MASK.slice(0, -hexKey.length) + hexKey);
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

/**
 * Converts a value to the minimal big-endian hex RLP requires (no leading
 * zero bytes; zero itself must be the empty byte string "0x").
 * @param { number | bigint | string } value
 * @returns { string } minimal-encoded hex string
 */
function toRlpQuantity(value) {
  const bn = BigInt(value);
  if (bn === 0n) return "0x";
  let hex = bn.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return "0x" + hex;
}

/**
 * Builds and signs a raw EIP-2930 (type 1) transaction, letting the caller
 * override the raw RLP item used for the accessList field. ethers always
 * normalizes accessList to a list (so an empty one serializes to 0xc0);
 * passing "0x" here instead forces that field to be RLP-encoded as a 0-byte
 * string (0x80) instead of the spec-correct empty list, which can only be
 * done by bypassing ethers' Transaction serialization entirely.
 * @param { import("ethers").Wallet } wallet signer used to sign the transaction, must be connected to a provider
 * @param { string } to recipient address
 * @param { string } data calldata
 * @param { number | bigint } [value] value to send, defaults to 0
 * @param { number | bigint } gasLimit gas limit
 * @param { string | Array } accessListRlpItem raw RLP item to use for the accessList field, e.g. [] for a well-formed empty list or "0x" for a 0-byte string
 * @returns { Promise<string> } the signed raw transaction, hex-encoded
 */
async function buildRawAccessListTx({
  wallet,
  to,
  data,
  value = 0n,
  gasLimit,
  accessListRlpItem,
}) {
  const provider = wallet.provider;
  const [network, nonce, feeData] = await Promise.all([
    provider.getNetwork(),
    provider.getTransactionCount(wallet.address),
    provider.getFeeData(),
  ]);

  const fields = [
    toRlpQuantity(network.chainId),
    toRlpQuantity(nonce),
    toRlpQuantity(feeData.gasPrice),
    toRlpQuantity(gasLimit),
    to,
    toRlpQuantity(value),
    data,
    accessListRlpItem,
  ];

  const unsignedPayload = ethers.concat(["0x01", ethers.encodeRlp(fields)]);
  const signature = new ethers.SigningKey(wallet.privateKey).sign(
    ethers.keccak256(unsignedPayload),
  );

  const signedFields = [
    ...fields,
    toRlpQuantity(signature.yParity),
    toRlpQuantity(signature.r),
    toRlpQuantity(signature.s),
  ];

  return ethers.concat(["0x01", ethers.encodeRlp(signedFields)]);
}

module.exports = {
  callWithRandomAccessList,
  callWithAccessList,
  createEoa,
  buildRawAccessListTx,
};
