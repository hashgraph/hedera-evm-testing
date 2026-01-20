const { ethers } = require("hardhat");
const {
  GAS_LIMIT_2_000_000,
  GAS_LIMIT_1_000_000,
} = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  addTestCallData,
  expectScheduleCallEvent,
  expectResponseCodeEvent,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const Async = require("../../utils/async");
const Utils = require("../../utils/utils");
const { getMirrorNodeUrl } = require("../../utils/native/utils");
const {
  ScheduleCreateTransaction,
  TransferTransaction,
  Timestamp,
  Hbar,
  PrivateKey,
} = require("@hashgraph/sdk");
const axios = require("axios");
const { expect } = require("chai");
const { ResponseCodeEnum } = require("@hashgraph/proto").proto;

const getScheduleInfoFromMN = async (scheduleAddress) => {
  const url =
    getMirrorNodeUrl(hre.network.name) +
    `/schedules/0.0.${Number(scheduleAddress)}`;

  return axios.get(url).then((r) => r.data);
};

describe("HIP-1215 System Contract testing. deleteSchedule()", () => {
  let hip1215, impl1215, signers;

  // ----------------- Tests
  before(async () => {
    [hip1215, impl1215, signers] = await beforeTests();
  });

  // schedules result check ofter tests passes to save the time
  after(async () => {
    await afterTests();
  });

  describe("positive cases", () => {
    it("should delete schedule", async () => {
      // create schedule
      const createTx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        Math.floor(Date.now() / 1000) + 60,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("deleteSchedule")
      );
      const scheduleAddress = await expectScheduleCallEvent(
        createTx,
        ResponseCodeEnum.SUCCESS.valueOf()
      );
      // delete schedule
      const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
      await expectResponseCodeEvent(deleteTx, ResponseCodeEnum.SUCCESS.valueOf());
    });

    it("should delete a schedule created from sdk", async () => {
      const client = await Utils.createSDKClient();
      const key = PrivateKey.fromStringECDSA(
        Utils.getHardhatSignerPrivateKeyByIndex(0)
      );
      const txn = await new ScheduleCreateTransaction()
        .setScheduledTransaction(
          new TransferTransaction()
            .addHbarTransfer(await signers[0].getAddress(), new Hbar(-1))
            .addHbarTransfer(await signers[1].getAddress(), new Hbar(1))
        )
        .setAdminKey(key.publicKey)
        .setWaitForExpiry(true)
        .setExpirationTime(new Timestamp(Date.now() / 1000 + 500))
        .execute(client);
      const receipt = await txn.getReceipt(client);
      const scheduleAddress = await receipt.scheduleId.toSolidityAddress();
      await client.close();

      const contractIHRC1215 = await ethers.getContractAt(
        "IHRC1215ScheduleFacade",
        "0x" + scheduleAddress,
        signers[0]
      );
      await new Promise((r) => setTimeout(r, 5000));
      const deleteScheduleTx =
        await contractIHRC1215.deleteSchedule(GAS_LIMIT_2_000_000);
      await deleteScheduleTx.wait();

      const scheduleInfo = await getScheduleInfoFromMN(
        Utils.convertAccountIdToLongZeroAddress(scheduleAddress, true)
      );
      expect(scheduleInfo.deleted).to.be.true;
    });

    it("should be able to execute IHRC1215ScheduleFacade.deleteSchedule()", async () => {
      const signerSender = signers[0];
      const signerReceiver = signers[1];
      const genesisSdkClient = await Utils.createSDKClient();
      const senderInfo = await Utils.getAccountInfo(
        signerSender.address,
        genesisSdkClient
      );
      const receiverInfo = await Utils.getAccountInfo(
        signerReceiver.address,
        genesisSdkClient
      );

      const adminPrivateKey = PrivateKey.fromStringECDSA(
        Utils.getHardhatSignerPrivateKeyByIndex(0)
      );
      const { scheduleId } = await Utils.createScheduleTransactionForTransfer(
        senderInfo,
        receiverInfo,
        genesisSdkClient,
        adminPrivateKey,
        10000000000000
      );
      await new Promise((r) => setTimeout(r, 2500));

      const infoBefore = await getScheduleInfoFromMN(parseInt(scheduleId.num));
      expect(infoBefore.deleted).to.be.false;

      const contractIHRC1215 = await ethers.getContractAt(
        "IHRC1215ScheduleFacade",
        Utils.convertAccountIdToLongZeroAddress(scheduleId.toString(), true),
        signerSender
      );
      const deleteScheduleTx =
        await contractIHRC1215.deleteSchedule(GAS_LIMIT_2_000_000);
      await deleteScheduleTx.wait();

      const infoAfter = await getScheduleInfoFromMN(
        Utils.convertAccountIdToLongZeroAddress(scheduleId.toString(), true)
      );

      expect(infoBefore.deleted).to.be.false;
      expect(infoAfter.deleted).to.be.true;
    });

    it("should delete schedule through proxy", async () => {
      // create schedule
      const createTx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        Math.floor(Date.now() / 1000) + 60,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("deleteSchedule proxy")
      );
      const scheduleAddress = await expectScheduleCallEvent(
        createTx,
        ResponseCodeEnum.SUCCESS.valueOf()
      );
      // delete schedule
      const deleteTx = await hip1215.deleteScheduleProxy(scheduleAddress);
      await expectResponseCodeEvent(deleteTx, ResponseCodeEnum.SUCCESS.valueOf());
    });
  });

  describe("negative cases", () => {
    it("should fail with random address for to", async () => {
      const receipt = await hip1215.deleteSchedule(randomAddress());
      await expectResponseCodeEvent(receipt, ResponseCodeEnum.UNKNOWN.valueOf());
    });

    it("should fail with expired address for to", async () => {
      // create schedule
      const receipt = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        Math.floor(Date.now() / 1000) + 2, // just enough to execute transaction
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("deleteSchedule fail expired")
      );
      const scheduleAddress = await expectScheduleCallEvent(
        receipt,
        ResponseCodeEnum.SUCCESS.valueOf()
      );
      await Async.wait(2000);
      // delete schedule
      const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
      await expectResponseCodeEvent(
        deleteTx,
        ResponseCodeEnum.INVALID_SCHEDULE_ID.valueOf()
      );
    });

    it("should fail when invoked with wrong schedule admin key", async () => {
      const client = await Utils.createSDKClient();
      const key = PrivateKey.fromStringECDSA(
        Utils.getHardhatSignerPrivateKeyByIndex(0)
      );
      const txn = await new ScheduleCreateTransaction()
        .setScheduledTransaction(
          new TransferTransaction()
            .addHbarTransfer(await signers[0].getAddress(), new Hbar(-1))
            .addHbarTransfer(await signers[1].getAddress(), new Hbar(1))
        )
        .setAdminKey(key.publicKey)
        .setWaitForExpiry(true)
        .setExpirationTime(new Timestamp(Date.now() / 1000 + 500))
        .execute(client);
      const receipt = await txn.getReceipt(client);
      const scheduleAddress = await receipt.scheduleId.toSolidityAddress();
      await client.close();

      // create a wallet with a different private key (not the admin key)
      // Use signers[2]'s private key which is different from signers[0]
      const invalidPrivateKey = Utils.getHardhatSignerPrivateKeyByIndex(2);
      const invalidWallet = new ethers.Wallet(
        invalidPrivateKey,
        ethers.provider
      );

      // create contract instance with the invalid key wallet
      const hip1215WithInvalidKey = await ethers.getContractAt(
        "HIP1215Contract",
        await hip1215.getAddress(),
        invalidWallet
      );

      // attempt to delete schedule with invalid key - should fail
      const deleteTx = await hip1215WithInvalidKey.deleteSchedule(
        "0x" + scheduleAddress
      );
      await expectResponseCodeEvent(
        deleteTx,
        ResponseCodeEnum.INVALID_SIGNATURE.valueOf()
      );

      // verify schedule is NOT deleted (still exists)
      const scheduleInfo = await getScheduleInfoFromMN(
        Utils.convertAccountIdToLongZeroAddress(scheduleAddress, true)
      );
      expect(scheduleInfo.deleted).to.be.false;
    });
  });
});
