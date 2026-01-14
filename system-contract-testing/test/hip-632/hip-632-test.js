// SPDX-License-Identifier: Apache-2.0
const { ethers } = require("hardhat");
const {
  Wallet,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
} = require("@hashgraph/sdk");
const { proto } = require("@hashgraph/proto");
const {
  testAccountAuthorization,
  hedera_signMessage,
} = require("./utils/hip-632-utils");
const { createSDKClient } = require("../../utils/utils");

// https://hips.hedera.com/hip/hip-632#isauthorizedrawaddress-messagehash-signatureblob-function-usage
describe("HIP-632 'isAuthorizedRaw' tests", () => {
  let signers, hip632, sdkClient, edPK, edSignerAccount, wallet;

  // preconditions before test run
  before(async () => {
    signers = await ethers.getSigners();
    // deploy test contract
    const HIP632Factory = await ethers.getContractFactory("HIP632Contract");
    hip632 = await HIP632Factory.deploy();
    await hip632.waitForDeployment();
    console.log("Deploy hip632:", hip632.target);
    // create ED signer account
    sdkClient = await createSDKClient();
    edPK = PrivateKey.generateED25519();
    edSignerAccount = (
      await (
        await new AccountCreateTransaction()
          .setKeyWithoutAlias(edPK.publicKey)
          .setInitialBalance(Hbar.fromTinybars(1000))
          .execute(sdkClient)
      ).getReceipt(sdkClient)
    ).accountId;
    console.log("ED account created:", edSignerAccount.toEvmAddress());
    // create test hedera wallet that can be obtained from 'hedera-wallet-connect'
    // wallet using 'getHederaWallet' function (see https://github.com/hashgraph/hedera-wallet-connect/blob/3597314461cc981ff6cf6c83f0c35cdc29252dd4/src/lib/wallet/index.ts#L102)
    wallet = await new Wallet(edSignerAccount, edPK);
  });

  after(async () => {
    if (sdkClient != null) {
      sdkClient.close();
    }
  });

  it("manual sign with @hashgraph/sdk check with isAuthorizedRaw", async () => {
    const message = "Test message";
    const messageHash = Buffer.from(
      ethers.hashMessage(message).substring(2), // remove '0x'
      "hex",
    );
    const hexMessageHash = "0x" + messageHash.toString("hex");
    const signaturesArray = await wallet.sign([messageHash]);
    const hexEncodedSignature =
      "0x" + Buffer.from(signaturesArray[0].signature).toString("hex");

    console.log(
      "Signing message:'%s' messageHash:'%s' hexEncodedSignature:'%s'",
      message,
      hexMessageHash,
      "0x" + hexEncodedSignature,
    );
    // execute isAuthorizedRaw check
    const tx = await hip632.isAuthorizedRawPublic(
      "0x" + wallet.accountId.toEvmAddress(),
      hexMessageHash,
      hexEncodedSignature,
      { gasLimit: 2_000_000 },
    );
    console.log("Transaction.hash:", tx.hash);
    await testAccountAuthorization(
      tx,
      proto.ResponseCodeEnum.SUCCESS.valueOf(),
      true,
    );
  });

  describe("HIP-820 related tests", () => {
    it("hedera_signMessage check with isAuthorizedRaw", async () => {
      const id = 1;
      const topic = "test-topic";
      const message = "Test message";

      // (!!!) use copy of 'hedera-wallet-connect' function
      const base64EncodedSignatureMap = await hedera_signMessage(
        id,
        topic,
        message,
        wallet,
      );
      console.log("hedera_signMessage result:'%s'", base64EncodedSignatureMap);

      console.log(
        "---------------- Prepare arguments for isAuthorizedRaw ----------------",
      );
      // Prepare arguments for isAuthorizedRaw
      // Message: add prefix as at 'hedera-wallet-connect' -> hash -> Buffer
      const hexMessageHash = ethers.hashMessage(
        "\x19Hedera Signed Message:\n" + message.length + message,
      );
      // TODO row message will be successfully validated by 'isAuthorizedRaw'
      //  if we use SignatureVerifier.MessageType.RAW on CN for validation
      // const hexMessageHash = Buffer.from("\x19Hedera Signed Message:\n" + message.length + message);

      // Signature: base64EncodedSignatureMap is:
      // Message with prefix -> Buffer -> SignerSignature[] -> SignatureMap -> base64 encode
      const revertedSignatureMapEncoded = Buffer.from(
        base64EncodedSignatureMap,
        "base64",
      );
      console.log(
        "Reverted - SignatureMap.encoded:'%s'",
        revertedSignatureMapEncoded,
      );
      const revertedSignatureMap = proto.SignatureMap.decode(
        revertedSignatureMapEncoded,
      );
      const revertedHexSignature = Buffer.from(
        revertedSignatureMap.sigPair[0].ed25519,
      ).toString("hex");
      console.log("Reverted - SignatureMap:'%s'", revertedHexSignature);

      // execute isAuthorizedRaw check
      const tx = await hip632.isAuthorizedRawPublic(
        "0x" + wallet.accountId.toEvmAddress(),
        hexMessageHash,
        "0x" + revertedHexSignature,
        { gasLimit: 2_000_000 },
      );
      console.log("Transaction.hash:", tx.hash);
      //TODO this is returning 'false' because 'hedera_signMessage' is really signing message
      // but 'isAuthorizedRaw' expecting hash(message) to be signed
      // change to 'true' if 'isAuthorizedRaw' behaviour will be changed
      await testAccountAuthorization(
        tx,
        proto.ResponseCodeEnum.SUCCESS.valueOf(),
        false,
      );
    });
  });
});
