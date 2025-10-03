const { expect } = require("chai");
const { ethers } = require("hardhat");
const { PrivateKey, AccountId, ScheduleId } = require("@hashgraph/sdk");
const Utils = require("../../../utils/utils");
const { Events } = require("../../../utils/constants");
const { Logger, HederaMirrorNode } = require("@hashgraphonline/standards-sdk");
const hre = require("hardhat");
const Async = require("../../../utils/async");
const { ResponseCodeEnum, SignatureMap } = require("@hashgraph/proto").proto;

const SUCCESS = ResponseCodeEnum[ResponseCodeEnum.SUCCESS];
const INVALID_ETHEREUM_TRANSACTION =
  ResponseCodeEnum[ResponseCodeEnum.INVALID_ETHEREUM_TRANSACTION];
const INSUFFICIENT_PAYER_BALANCE =
  ResponseCodeEnum[ResponseCodeEnum.INSUFFICIENT_PAYER_BALANCE];
const CONTRACT_REVERT_EXECUTED =
  ResponseCodeEnum[ResponseCodeEnum.CONTRACT_REVERT_EXECUTED];

const addTestAbiStr = ["function addTest(string memory _value)"];
const addTestAbi = new ethers.Interface(addTestAbiStr);
const hasScheduleCapacityAbiStr = [
  "function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit)",
];
const hasScheduleCapacityAbi = new ethers.Interface(hasScheduleCapacityAbiStr);
const payableCallAbiStr = ["function payableCall()"];
const payableCallAbi = new ethers.Interface(payableCallAbiStr);

// Schedule params functions --------------------------------------------------
function getExpirySecond(shift = 10) {
  return Math.floor(Date.now() / 1000) + shift;
}

function addTestCallData(value) {
  return addTestAbi.encodeFunctionData("addTest", [value]);
}

function hasScheduleCapacityCallData(expirySecond, gasLimit) {
  return hasScheduleCapacityAbi.encodeFunctionData("hasScheduleCapacity", [
    expirySecond,
    gasLimit,
  ]);
}

function payableCallData() {
  return payableCallAbi.encodeFunctionData("payableCall");
}
// ---------------------------------------------------------------------------

// Test checker functions --------------------------------------------------
async function testScheduleCallEvent(tx, responseCode) {
  const rc = await tx.wait();
  const log = rc.logs.find((e) => e.fragment.name === Events.ScheduleCall);
  expect(log.args[0]).to.equal(responseCode);
  const address = log.args[1];
  if (responseCode === ResponseCodeEnum.SUCCESS.valueOf()) {
    expect(address.length).to.equal(42);
  } else {
    expect(address).to.equal(ethers.ZeroAddress);
  }
  expect(rc.status).to.equal(ResponseCodeEnum.INVALID_TRANSACTION.valueOf());
  return address;
}

async function testResponseCodeEvent(tx, responseCode) {
  const rc = await tx.wait();
  const log = rc.logs.find((e) => e.fragment.name === Events.ResponseCode);
  expect(log.args[0]).to.equal(responseCode);
  expect(rc.status).to.equal(ResponseCodeEnum.INVALID_TRANSACTION.valueOf());
}

async function testHasScheduleCapacityEvent(tx, hasCapacity) {
  const rc = await tx.wait();
  const log = rc.logs.find(
    (e) => e.fragment.name === Events.HasScheduleCapacity
  );
  expect(log.args[0]).to.equal(hasCapacity);
  expect(rc.status).to.equal(ResponseCodeEnum.INVALID_TRANSACTION.valueOf());
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
    Utils.getHardhatSignerPrivateKeyByIndex(accountIndex)
  );
  const scheduleIdAsBytes = convertScheduleIdToUint8Array(
    AccountId.fromEvmAddress(0, 0, scheduleAddress).toString()
  );
  return SignatureMap.encode({
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
  const logger = new Logger({ module: "test/hip-1215", level: "warn" });
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
  maxAttempts = 10
) {
  const scheduleId = ScheduleId.fromSolidityAddress(scheduleAddress).toString();
  const scheduleObj = await Async.waitForCondition(
    "executed_timestamp",
    () => mnClient.getScheduleInfo(scheduleId),
    (result) => result.executed_timestamp != null,
    waitStep,
    maxAttempts
  );
  const transactions = await mnClient.getTransactionByTimestamp(
    scheduleObj.executed_timestamp
  );
  if (transactions.length > 0) {
    return transactions[0].result;
  } else {
    throw "Cant find scheduled transaction";
  }
}

async function getRecursiveScheduleStatus(
  mnClient,
  scheduleAddress,
  waitStep = 10000,
  maxAttempts = 5
) {
  const scheduleId = ScheduleId.fromSolidityAddress(scheduleAddress).toString();
  const scheduleObj = await Async.waitForCondition(
    "executed_timestamp",
    () => mnClient.getScheduleInfo(scheduleId),
    (result) => result.executed_timestamp != null,
    waitStep,
    maxAttempts
  );

  const transactions = await mnClient.getTransactionByTimestamp(
    scheduleObj.executed_timestamp
  );

  if (transactions.length > 0) {
    const txn = transactions[0];
    const result = txn.result;
    console.log(`Scheduled call by ${scheduleAddress} has status: ${result}`);

    // If the status is SUCCESS, we are checking for the schedule address in the transaction details
    if (result === SUCCESS && txn.scheduled) {
      const newScheduleAddress = await findNewScheduleAddress(
        mnClient,
        txn.consensus_timestamp,
        txn.hash,
        waitStep,
        maxAttempts
      );
      if (newScheduleAddress) {
        console.log(
          `Found new schedule address: ${newScheduleAddress}, recursively checking...`
        );
        // Recursive call with next schedule
        return await getRecursiveScheduleStatus(
          mnClient,
          newScheduleAddress,
          waitStep,
          maxAttempts
        );
      }
    }

    // Final status reached
    console.log(`Schedule ${scheduleAddress} reached final status: ${result}`);
    return result;
  }
}

async function findNewScheduleAddress(
  mnClient,
  timestamp,
  transactionHash,
  waitStep,
  maxAttempts
) {
  const limit = 1;
  // Query MN for contract call logs
  const contractCallLogs = await Async.waitForCondition(
    "contract_call_logs",
    () => mnClient.getContractLogs({ limit, timestamp, transactionHash }),
    (result) => result != null,
    waitStep,
    maxAttempts
  );

  // Check inside the log of the already executed scheduled call for the next schedule
  if (contractCallLogs != null && contractCallLogs.length > 0) {
    const log = contractCallLogs[0].data;
    // We already now that the execution was successful so we only get the last 20 bytes
    const nextScheduleAdrress = "0x" + log.slice(-40);
    return nextScheduleAdrress;
  }

  return null;
}

// ---------------------------------------------------------------------------

module.exports = {
  addTestCallData,
  hasScheduleCapacityCallData,
  payableCallData,
  getSignatureMap,
  getExpirySecond,
  testScheduleCallEvent,
  testResponseCodeEvent,
  testHasScheduleCapacityEvent,
  createMirrorNodeClient,
  getScheduledTxStatus,
  getRecursiveScheduleStatus,
  SUCCESS,
  INVALID_ETHEREUM_TRANSACTION,
  INSUFFICIENT_PAYER_BALANCE,
  CONTRACT_REVERT_EXECUTED,
};
