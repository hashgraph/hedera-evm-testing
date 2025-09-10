const HashgraphProto = require("@hashgraph/proto");
const { PrivateKey, AccountId } = require("@hashgraph/sdk");
const Utils = require("../../../utils/utils");

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

module.exports = {
  getSignatureMap
};
