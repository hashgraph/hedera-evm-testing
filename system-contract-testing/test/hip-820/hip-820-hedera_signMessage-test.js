const { ethers } = require("hardhat");
const { Wallet, AccountId, PrivateKey, AccountCreateTransaction, fromTinybars } = require("@hashgraph/sdk");
const { proto } = require("@hashgraph/proto");
const { testAccountAuthorization } = require("./utils/hip-820-utils");
const { createSDKClient } = require("../../utils/utils");

// hedera-wallet-connect functions -----------------------------
function prefixMessageToSign(message) {
  return "\x19Hedera Signed Message:\n" + message.length + message;
}

function stringToSignerMessage(message) {
  return [Buffer.from(prefixMessageToSign(message))];
}

function signerSignaturesToSignatureMap(signerSignatures) {
  return proto.SignatureMap.create({
    sigPair: signerSignatures.map((s) =>
      s.publicKey._toProtobufSignature(s.signature),
    ),
  });
}

function signatureMapToBase64String(signatureMap) {
  const encoded = proto.SignatureMap.encode(signatureMap).finish();
  return Buffer.from(encoded).toString("base64");
}

async function hedera_signMessage(id, topic, body, signer) {
  // signer takes an array of Uint8Arrays though spec allows for 1 message to be signed
  const signerSignatures = await signer.sign(stringToSignerMessage(body));
  console.log("signerSignatures:" + signerSignatures);
  const _signatureMap = proto.SignatureMap.create(
    signerSignaturesToSignatureMap(signerSignatures),
  );

  return signatureMapToBase64String(_signatureMap);
}
// hedera-wallet-connect functions -----------------------------

describe("HIP-820 tests", () => {
  let signers, hip820, sdkClient, edPK, edSignerAccount, wallet;

  before(async () => {
    signers = await ethers.getSigners();
    // deploy test contract
    const HIP820Factory = await ethers.getContractFactory("HIP820Contract");
    hip820 = await HIP820Factory.deploy();
    await hip820.waitForDeployment();
    console.log("Deploy hip820:", hip820.target);
    // create ED signer account
    sdkClient = await createSDKClient();
    edPK = PrivateKey.generateED25519();
    edSignerAccount = (
      await (
        await new AccountCreateTransaction()
          .setKeyWithoutAlias(edPK.publicKey)
          .setInitialBalance(fromTinybars(1000))
          .execute(sdkClient)
      ).getReceipt(sdkClient)
    ).accountId;
    // create test hedera wallet that can be obtained from 'hedera-wallet-connect'
    // using //TODO add function
    wallet = await new Wallet(
      AccountId.fromString("0.0.1003"),
      PrivateKey.fromStringED25519(
        "0x748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04",
      ),
    );
  });

  after(async () => {
    if (sdkClient != null) {
      sdkClient.close();
    }
  });

  // TODO example https://github.com/hashgraph/hedera-wallet-connect/blob/3597314461cc981ff6cf6c83f0c35cdc29252dd4/test/wallet/methods/wallet-signMessage.test.ts#L62
  it("hedera_signMessage check with isAuthorizedRaw", async () => {
    const id = 1;
    const topic = "test-topic";
    const message = "Test message";
    const base64EncodedSignatureMap = await hedera_signMessage(
      id,
      topic,
      message,
      wallet,
    );
    console.log("hedera_signMessage result:", base64EncodedSignatureMap);

    const messageHash = Buffer.from(
      ethers
        .hashMessage("\x19Hedera Signed Message:\n" + message.length + message)
        .substring(2),
      "hex",
    );

    const signatureMap = proto.SignatureMap.decode(
      Buffer.from(base64EncodedSignatureMap, "base64"),
    );
    //TODO
    console.log("signerSignatures decoded:" + signerSignatures);
    hip820.isAuthorizedRawPublic(signers[1].address, messageHash);
  });

  it("manual sign with @hashgraph/sdk check with isAuthorizedRaw", async () => {
    const message = "Test message";
    const messageHash = Buffer.from(
      ethers.hashMessage(message).substring(2),
      "hex",
    );
    const signaturesArray = await wallet.sign([messageHash]);
    const hexEncodedSignature =
      "0x" + Buffer.from(signaturesArray[0].signature).toString("hex");

    console.log(
      "Signing message:'%s' messageHash:'%s' hexEncodedSignature:'%s'",
      message,
      messageHash,
      hexEncodedSignature,
    );
    // execute isAuthorizedRaw check
    const tx = await hip820.isAuthorizedRawPublic(
      "0x" + wallet.accountId.toEvmAddress(),
      messageHash,
      hexEncodedSignature,
      { gasLimit: 10_000_000 },
    );
    console.log("Transaction:", tx);
    await testAccountAuthorization(
      tx,
      proto.ResponseCodeEnum.SUCCESS.valueOf(),
      true,
    );
  });
});
