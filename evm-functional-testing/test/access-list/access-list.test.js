// EIP: https://eips.ethereum.org/EIPS/eip-2930
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const {
  callWithAccessList,
  callWithRandomAccessList,
  createEoa,
} = require("./utils/access-list-utils");
const { encodeFunctionData } = require("../hip-1340/utils/web3");
const { randomAddress, randomStorageSlot } = require("../../utils/random");
const { HSS_ADDRESS } = require("../../utils/constants");

const storageSlot0 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const storageSlot1 =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const storageSlot2 =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
const ADDRESS_COST = 2400n;
const SLOT_COST = 1900n;
const ACCESS_LIST_DISCOUNT = 100n;

describe("EIP-2930 AccessList testing", async () => {
  let signers, callerContract, targetContract;

  before(async () => {
    signers = await ethers.getSigners();
    callerContract = await contractDeployAndFund(
      Constants.Contract.AccessListCallerContract,
    );
    targetContract = await contractDeployAndFund(
      Constants.Contract.AccessListTargetContract,
    );
  });

  describe("positive cases", async () => {
    it("should not charges additional changes in base gas for empty access lists", async () => {
      const feeData = await signers[0].provider.getFeeData();
      const data = encodeFunctionData("call(address target)", [
        targetContract.target,
      ]);
      const legacyReceipt = await signers[0]
        .sendTransaction({
          type: 0,
          gasLimit: 50_000,
          gasPrice: feeData.gasPrice,
          to: callerContract.target,
          data: data,
        })
        .then((tx) => tx.wait());
      const emptyAccessListReceipt = await callerContract
        .call(targetContract.target, {
          accessList: [],
        })
        .then((tx) => tx.wait());
      expect(emptyAccessListReceipt.gasUsed).to.equal(legacyReceipt.gasUsed);
    });

    it("should increases intrinsic gas with access list", async () => {
      const emptyAccessListGas = (
        await callWithRandomAccessList(
          callerContract,
          targetContract.target,
          [],
        )
      ).gasUsed;
      // +2400 for Address
      let actualGas = (
        await callWithRandomAccessList(callerContract, targetContract.target, [
          0,
        ])
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas + ADDRESS_COST);
      // +2400 for Address, +1900 for Storage Slot
      actualGas = (
        await callWithRandomAccessList(callerContract, targetContract.target, [
          1,
        ])
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas + ADDRESS_COST + SLOT_COST);
      // +2400 x 2 for Addresses, +1900 x 5 for Storage Slots
      actualGas = (
        await callWithRandomAccessList(
          callerContract,
          targetContract.target,
          [3, 2],
        )
      ).gasUsed;
      expect(actualGas).to.equal(
        emptyAccessListGas + ADDRESS_COST * 2n + SLOT_COST * 5n,
      );
    });

    it("should increases intrinsic gas with access list with same address or storage slot", async () => {
      const emptyAccessListGas = (
        await callerContract
          .execute({
            accessList: [],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      // +2400 x 2 for Addresses
      const sameAddress = randomAddress();
      let actualGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: sameAddress,
                storageKeys: [],
              },
              {
                address: sameAddress,
                storageKeys: [],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas + ADDRESS_COST * 2n);
      // +2400 for Address, +1900 x 2 for Storage Slots
      const sameSlot = randomStorageSlot();
      actualGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: sameAddress,
                storageKeys: [sameSlot, sameSlot],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(
        emptyAccessListGas + ADDRESS_COST + SLOT_COST * 2n,
      );
    });

    it("should apply discount to SLOAD and SSTORE operations", async () => {
      const emptyStorageKeysGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: callerContract.target,
                storageKeys: [],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      // -100 for SLOAD
      let actualGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: callerContract.target,
                storageKeys: [storageSlot0],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(emptyStorageKeysGas - ACCESS_LIST_DISCOUNT);
      // -100 x 2 for SLOAD x 2
      actualGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: callerContract.target,
                storageKeys: [storageSlot0, storageSlot1],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(emptyStorageKeysGas - ACCESS_LIST_DISCOUNT * 2n);
      // -100 x 3 for SLOAD x 3, -100 for SSTORE
      actualGas = (
        await callerContract
          .execute({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: callerContract.target,
                storageKeys: [storageSlot0, storageSlot1, storageSlot2],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(emptyStorageKeysGas - ACCESS_LIST_DISCOUNT * 4n);
    });

    it("should apply discount to SLOAD and SSTORE operations for sub-calls", async () => {
      const emptyAccessListGas = (
        await callWithAccessList(callerContract, targetContract.target, null)
      ).gasUsed;
      // -100 for CALL
      let actualGas = (
        await callWithAccessList(callerContract, targetContract.target, [])
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas - ACCESS_LIST_DISCOUNT);
      // -100 for CALL, -100 for SLOAD
      actualGas = (
        await callWithAccessList(callerContract, targetContract.target, [0])
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas - ACCESS_LIST_DISCOUNT * 2n);
      // -100 for CALL, -100 x 2 for SLOAD x 2
      actualGas = (
        await callWithAccessList(callerContract, targetContract.target, [0, 1])
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas - ACCESS_LIST_DISCOUNT * 3n);
      // -100 for CALL, -100 x 3 for SLOAD x 3, -100 for SSTORE
      actualGas = (
        await callWithAccessList(
          callerContract,
          targetContract.target,
          [0, 1, 2],
        )
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas - ACCESS_LIST_DISCOUNT *5n);
    });

    it("should apply discount to Hedera Precompiles calls", async () => {
      const expirySecond = Math.floor(Date.now() / 1000) + 10;
      const emptyAccessListGas = (
        await callerContract
          .callHssPrecompile(expirySecond, 1_000_000, {
            accessList: [],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      const hssInAccessListGas = (
        await callerContract
          .callHssPrecompile(expirySecond, 1_000_000, {
            accessList: [
              {
                address: HSS_ADDRESS,
                storageKeys: [],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(hssInAccessListGas).to.equal(
        emptyAccessListGas - ACCESS_LIST_DISCOUNT,
      );
    });

    it("should apply discount to SLOAD and SSTORE operations for Code Delegation", async () => {
      const eoa = await createEoa(10);
      // set code delegation
      await eoa
        .sendTransaction({
          gasLimit: 100_000, //TODO remove after MN will support gasEstimate
          type: 4,
          to: callerContract.target,
          data: encodeFunctionData("callDelegation()"),
          authorizationList: [
            await eoa.authorize({
              chainId: 0,
              nonce: 1,
              address: targetContract.target,
            }),
          ],
        })
        .then((tx) => tx.wait());
      // checking for gas
      const callerContractFromEoa = await callerContract.connect(eoa);
      const emptyAccessListGas = (
        await callerContractFromEoa
          .callDelegation({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      // -100 for CALL
      let actualGas = (
        await callerContractFromEoa
          .callDelegation({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
            accessList: [
              {
                address: targetContract.target,
                storageKeys: [],
              },
            ],
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      expect(actualGas).to.equal(emptyAccessListGas - ACCESS_LIST_DISCOUNT);
    });

    //TODO this should include a discount after MN will support gasEstimate
    xit("should increases eth_estimateGas gas with access list", async () => {
      const data = encodeFunctionData("execute()");
      const noDiscountGas = await signers[0].estimateGas({
        to: callerContract.target,
        accessList: [
          {
            address: callerContract.target,
            storageKeys: [],
          },
        ],
        data: data,
      });
      const withDiscountGas = await signers[0].estimateGas({
        to: callerContract.target,
        accessList: [
          {
            address: callerContract.target,
            storageKeys: [storageSlot0, storageSlot1],
          },
        ],
        data: data,
      });
      expect(withDiscountGas).to.equal(noDiscountGas - ACCESS_LIST_DISCOUNT * 2n);
    });

    it("should not change eth_call with access list", async () => {
      const data = encodeFunctionData("call(address target)", [
        targetContract.target,
      ]);
      const ethCallWithAccessList = await signers[0].call({
        to: callerContract.target,
        accessList: [
          {
            address: callerContract.target,
            storageKeys: [storageSlot0, storageSlot1, storageSlot2],
          },
        ],
        data: data,
      });
      const ethCallWoAccessList = await signers[0].call({
        to: callerContract.target,
        data: data,
      });
      expect(ethCallWithAccessList).to.equal(ethCallWoAccessList);
    });
  });

  describe("negative cases", async () => {
    it("should fail if not enough gas for access list", async () => {
      const emptyAccessListGas = (
        await callerContract.execute().then((tx) => tx.wait())
      ).gasUsed;
      const notEnoughGasCall = async () =>
        callerContract
          .execute({
            gasLimit: emptyAccessListGas + 1000n,
            accessList: [
              {
                address: callerContract.target,
                storageKeys: [],
              },
            ],
          })
          .then((tx) => tx.wait());
      await expect(notEnoughGasCall()).to.be.rejectedWith(
        /transaction execution reverted/,
      );
    });

    it("should fail when required gas exceeds block gas limit", async () => {
      const exceedsBlockGasLimitCall = async () =>
        callWithRandomAccessList(
          callerContract,
          targetContract.target,
          Array.from({ length: 100 }, () => 100),
        );
      await expect(exceedsBlockGasLimitCall()).to.be.rejectedWith(
        /Oversized data/,
      );
    });
  });
});
