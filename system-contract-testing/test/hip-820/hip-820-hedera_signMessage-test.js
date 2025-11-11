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
} = require("./utils/hip-820-utils");
const { createSDKClient } = require("../../utils/utils");

describe("HIP-820 tests", () => {
  let signers, hip820, sdkClient, edPK, edSignerAccount, wallet;

  // preconditions before test run
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
    const hexMessageHash = "0x" + messageHash.toString("hex");
    const signaturesArray = await wallet.sign([messageHash]);
    const hexEncodedSignature =
      "0x" + Buffer.from(signaturesArray[0].signature).toString("hex");

    console.log(
      "Signing message:'%s' messageHash:'%s' hexEncodedSignature:'%s'",
      message,
      hexMessageHash,
      hexEncodedSignature,
    );
    // execute isAuthorizedRaw check
    const tx = await hip820.isAuthorizedRawPublic(
      "0x" + wallet.accountId.toEvmAddress(),
      hexMessageHash,
      hexEncodedSignature,
      { gasLimit: 10_000_000 },
    );
    console.log("Transaction.hash:", tx.hash);
    await testAccountAuthorization(
      tx,
      proto.ResponseCodeEnum.SUCCESS.valueOf(),
      true,
    );
  });
});
