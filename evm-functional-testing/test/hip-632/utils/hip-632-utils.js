const { expect } = require("chai");
const { proto } = require("@hiero-ledger/proto");

async function testAccountAuthorization(receipt, responseCode, isAuthorized) {
  const rc = await receipt.wait();
  const log = rc.logs.find(
    (e) => e.fragment.name === "AccountAuthorizationResponse"
  );
  expect(log.args[0]).to.equal(responseCode);
  expect(log.args[1]).to.equal(isAuthorized);
  return log.args[1];
}

// hedera-wallet-connect functions -----------------------------
function prefixMessageToSign(message) {
  console.log("message:" + message);
  return "\x19Hedera Signed Message:\n" + message.length + message;
}

function stringToSignerMessage(message) {
  const messageWithPrefix = prefixMessageToSign(message);
  console.log("messageWithPrefix:" + messageWithPrefix);
  return [Buffer.from(messageWithPrefix)];
}

function signerSignaturesToSignatureMap(signerSignatures) {
  return proto.SignatureMap.create({
    sigPair: signerSignatures.map((s) =>
      s.publicKey._toProtobufSignature(s.signature)
    ),
  });
}

function signatureMapToBase64String(signatureMap) {
  const encoded = proto.SignatureMap.encode(signatureMap).finish();
  console.log("SignatureMap.encoded:'%s'", encoded);
  return Buffer.from(encoded).toString("base64");
}

async function hedera_signMessage(id, topic, body, signer) {
  // signer takes an array of Uint8Arrays though spec allows for 1 message to be signed
  const signerSignatures = await signer.sign(stringToSignerMessage(body));
  console.log(
    "SignerSignature:" +
      Buffer.from(signerSignatures[0].signature).toString("hex")
  );
  const _signatureMap = proto.SignatureMap.create(
    signerSignaturesToSignatureMap(signerSignatures)
  );
  console.log(
    "SignatureMap:" +
      Buffer.from(_signatureMap.sigPair[0].ed25519).toString("hex")
  );
  return signatureMapToBase64String(_signatureMap);
}
// hedera-wallet-connect functions -----------------------------

module.exports = {
  testAccountAuthorization,
  hedera_signMessage,
};
