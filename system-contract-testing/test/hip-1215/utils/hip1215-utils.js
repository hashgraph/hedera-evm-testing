const { expect } = require("chai");
const { ethers } = require("hardhat");
const HashgraphProto = require("@hashgraph/proto");
const {
  PrivateKey,
  AccountId,
  ScheduleId,
} = require("@hashgraph/sdk");
const Utils = require("../../../utils/utils");
const { Events } = require("../../../utils/constants");
const { Logger, HederaMirrorNode } = require("@hashgraphonline/standards-sdk");
const hre = require("hardhat");
const Async = require("../../../utils/async");

const abiStr = ["function addTest(string memory _value)"];
const abi = new ethers.Interface(abiStr);

// Schedule params functions --------------------------------------------------
function getExpirySecond(shift = 10) {
  return Math.floor(Date.now() / 1000) + shift;
}

function callData(value) {
  return abi.encodeFunctionData("addTest", [value]);
}
// ---------------------------------------------------------------------------

// Test checker functions --------------------------------------------------
async function testScheduleCallEvent(tx, responseCode) {
  const rc = await tx.wait();
  const log = rc.logs.find((e) => e.fragment.name === Events.ScheduleCall);
  expect(log.args[0]).to.equal(responseCode);
  const address = log.args[1];
  if (responseCode === 22n) {
    expect(address.length).to.equal(42);
  } else {
    expect(address).to.equal(ethers.ZeroAddress);
  }
  expect(rc.status).to.equal(1);
  return address;
}

async function testResponseCodeEvent(tx, responseCode) {
  const rc = await tx.wait();
  const log = rc.logs.find((e) => e.fragment.name === Events.ResponseCode);
  expect(log.args[0]).to.equal(responseCode);
  expect(rc.status).to.equal(1);
}

async function testHasScheduleCapacityEvent(tx, hasCapacity) {
  const rc = await tx.wait();
  const log = rc.logs.find(
    (e) => e.fragment.name === Events.HasScheduleCapacity,
  );
  expect(log.args[0]).to.equal(hasCapacity);
  expect(rc.status).to.equal(1);
}
// ---------------------------------------------------------------------------

// Sign functions --------------------------------------------------
function convertScheduleIdToUint8Array(scheduleId) {
  const [shard, realm, num] = scheduleId.split(".");

  // size of the buffer is aligned with the services scheduleId to bytes conversion
  // https://github.com/hiero-ledger/hiero-consensus-node/blob/main/hedera-node/hedera-smart-contract-service-impl/src/main/java/com/hedera/node/app/service/contract/impl/utils/SystemContractUtils.java#L153
  const buffer = new ArrayBuffer(24);
  const dataView = new DataView(buffer);

  dataView.setBigUint64(0, BigInt(shard));
  dataView.setBigUint64(8, BigInt(realm));
  dataView.setBigUint64(16, BigInt(num));

  return new Uint8Array(buffer);
}

async function getSignatureMap(accountIndex, scheduleAddress) {
  const privateKey = PrivateKey.fromStringECDSA(
    Utils.getHardhatSignerPrivateKeyByIndex(accountIndex),
  );
  const scheduleIdAsBytes = convertScheduleIdToUint8Array(
    AccountId.fromEvmAddress(0, 0, scheduleAddress).toString(),
  );
  return HashgraphProto.proto.SignatureMap.encode({
    sigPair: [
      {
        pubKeyPrefix: privateKey.publicKey.toBytesRaw(),
        ECDSASecp256k1: privateKey.sign(scheduleIdAsBytes),
      },
    ],
  }).finish();
}
// ---------------------------------------------------------------------------

// Hedera sdk client functions --------------------------------------------------
// (!!!) not used because of CN port forward problem
// async function getScheduledTxStatus(sdkClient, scheduleAddress) {
//   const scheduleId = ScheduleId.fromSolidityAddress(scheduleAddress);
//   const scheduleInfo = await new ScheduleInfoQuery()
//     .setScheduleId(scheduleId)
//     .execute(sdkClient);
//   try {
//     const txReceipt = await new TransactionReceiptQuery()
//       .setTransactionId(scheduleInfo.scheduledTransactionId)
//       .execute(sdkClient);
//     return txReceipt.status;
//   } catch (error) {
//     if (error instanceof StatusError) {
//       return error.status._code;
//     }
//     return -1;
//   }
// }
// ---------------------------------------------------------------------------

// Mirror node client functions --------------------------------------------------
function createMirrorNodeClient() {
  const logger = new Logger({ module: "test/hip-1215", level: "info" });
  const { mirrorNode } =
    hre.config.networks[Utils.getCurrentNetwork()].sdkClient;
  return new HederaMirrorNode("local", logger, {
    customUrl: mirrorNode,
  });
}

async function getScheduledTxStatus(
  mnClient,
  scheduleAddress,
  waitStep = 5000,
  maxAttempts = 10,
) {
  const scheduleId = ScheduleId.fromSolidityAddress(scheduleAddress).toString();
  const scheduleObj = await Async.waitForCondition(
    "executed_timestamp",
    () => mnClient.getScheduleInfo(scheduleId),
    (result) => result.executed_timestamp != null,
    waitStep,
    maxAttempts,
  );
  const transactions = await mnClient.getTransactionByTimestamp(
    scheduleObj.executed_timestamp,
  );
  if (transactions.length > 0) {
    return transactions[0].result;
  } else {
    throw "Cant find scheduled transaction";
  }
}
// ---------------------------------------------------------------------------

module.exports = {
  callData,
  getSignatureMap,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  testHasScheduleCapacityEvent,
  createMirrorNodeClient,
  getScheduledTxStatus,
};
