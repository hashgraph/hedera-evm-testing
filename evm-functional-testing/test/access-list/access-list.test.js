// EIP: https://eips.ethereum.org/EIPS/eip-2930
const { ethers } = require("hardhat");
const { strict: assert } = require("node:assert");
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
      console.log("%s legacy transaction", legacyReceipt.hash);
      const emptyAccessListReceipt = await callerContract
        .call(targetContract.target, {
          accessList: [],
        })
        .then((tx) => tx.wait());
      console.log(
        "%s empty accessList transaction",
        emptyAccessListReceipt.hash,
      );
      assert.equal(emptyAccessListReceipt.gasUsed, legacyReceipt.gasUsed);
    });

    it("should increases intrinsic gas with access list", async () => {
      const emptyAccessListGas = (
        await callWithRandomAccessList(
          callerContract,
          targetContract.target,
          [],
        )
      ).gasUsed;
      assert.equal(
        (
          await callWithRandomAccessList(
            callerContract,
            targetContract.target,
            [0],
          )
        ).gasUsed,
        emptyAccessListGas + 2400n, // +2400n for Address
      );
      assert.equal(
        (
          await callWithRandomAccessList(
            callerContract,
            targetContract.target,
            [1],
          )
        ).gasUsed,
        emptyAccessListGas + 2400n + 1900n, // +2400n for Address, +1900 for Storage Slot
      );
      assert.equal(
        (
          await callWithRandomAccessList(
            callerContract,
            targetContract.target,
            [3, 2],
          )
        ).gasUsed,
        emptyAccessListGas + 2400n * 2n + 1900n * 5n, // +2400n x 2 for Addresses, +1900 x 5 for Storage Slots
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
      const sameAddress = randomAddress();
      assert.equal(
        (
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
        ).gasUsed,
        emptyAccessListGas + 2400n * 2n, // +2400n x 2 for Addresses
      );
      const sameSlot = randomStorageSlot();
      assert.equal(
        (
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
        ).gasUsed,
        emptyAccessListGas + 2400n + 1900n * 2n, // +2400n for Address, +1900 x 2 for Storage Slots
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
      assert.equal(
        (
          await callerContract
            .execute({
              gasLimit: 100_000, //TODO remove after MN will support gasEstimate
              accessList: [
                {
                  address: callerContract.target,
                  storageKeys: [
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                  ],
                },
              ],
            })
            .then((tx) => tx.wait())
        ).gasUsed,
        emptyStorageKeysGas - 100n,
      );
      // -100 x 2 for SLOAD x 2
      assert.equal(
        (
          await callerContract
            .execute({
              gasLimit: 100_000, //TODO remove after MN will support gasEstimate
              accessList: [
                {
                  address: callerContract.target,
                  storageKeys: [
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000001",
                  ],
                },
              ],
            })
            .then((tx) => tx.wait())
        ).gasUsed,
        emptyStorageKeysGas - 200n,
      );
      // -100 x 3 for SLOAD x 3, -100 for SSTORE
      assert.equal(
        (
          await callerContract
            .execute({
              gasLimit: 100_000, //TODO remove after MN will support gasEstimate
              accessList: [
                {
                  address: callerContract.target,
                  storageKeys: [
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000001",
                    "0x0000000000000000000000000000000000000000000000000000000000000002",
                  ],
                },
              ],
            })
            .then((tx) => tx.wait())
        ).gasUsed,
        emptyStorageKeysGas - 400n,
      );
    });

    it("should apply discount to SLOAD and SSTORE operations for sub-calls", async () => {
      const emptyAccessListGas = (
        await callWithAccessList(callerContract, targetContract.target, null)
      ).gasUsed;
      assert.equal(
        (await callWithAccessList(callerContract, targetContract.target, []))
          .gasUsed,
        emptyAccessListGas - 100n, // -100 for CALL
      );
      assert.equal(
        (await callWithAccessList(callerContract, targetContract.target, [0]))
          .gasUsed,
        emptyAccessListGas - 200n, // -100 for CALL, -100 for SLOAD
      );
      assert.equal(
        (
          await callWithAccessList(
            callerContract,
            targetContract.target,
            [0, 1],
          )
        ).gasUsed,
        emptyAccessListGas - 300n, // -100 for CALL, -100 x 2 for SLOAD x 2
      );
      assert.equal(
        (
          await callWithAccessList(
            callerContract,
            targetContract.target,
            [0, 1, 2],
          )
        ).gasUsed,
        emptyAccessListGas - 500n, // // -100 for CALL, -100 x 3 for SLOAD x 3, -100 for SSTORE
      );
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
      assert.equal(hssInAccessListGas, emptyAccessListGas - 100n);
    });

    it("should apply discount to SLOAD and SSTORE operations for Code Delegation", async () => {
      const eoa = await createEoa(10);
      // set code delegation
      const rc = await eoa
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
      console.log("%s code delegation tx", rc.hash);
      // check gas
      const callerContractFromEoa = await callerContract.connect(eoa);
      const emptyAccessListGas = (
        await callerContractFromEoa
          .callDelegation({
            gasLimit: 100_000, //TODO remove after MN will support gasEstimate
          })
          .then((tx) => tx.wait())
      ).gasUsed;
      // -100 for CALL
      assert.equal(
        (
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
        ).gasUsed,
        emptyAccessListGas - 100n,
      );
    });

    //TODO this should include a discount after MN will support gasEstimate
    it("should increases eth_estimateGas gas with access list", async () => {
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
            storageKeys: [
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            ],
          },
        ],
        data: data,
      });
      assert.equal(withDiscountGas, noDiscountGas - 200n);
    });

    it("should not change eth_call with access list", async () => {
      const data = encodeFunctionData("call(address target)", [
        targetContract.target,
      ]);
      assert.equal(
        await signers[0].call({
          to: callerContract.target,
          accessList: [
            {
              address: callerContract.target,
              storageKeys: [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000002",
              ],
            },
          ],
          data: data,
        }),
        await signers[0].call({
          to: callerContract.target,
          data: data,
        }),
      );
    });
  });

  describe("negative cases", async () => {
    it("should fail if not enough gas for access list", async () => {
      const emptyAccessListGas = (
        await callerContract.execute().then((tx) => tx.wait())
      ).gasUsed;
      await assert.rejects(
        () =>
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
            .then((tx) => tx.wait()),
        { message: /transaction execution reverted/ },
      );
    });

    it("should fail when required gas exceeds block gas limit", async () => {
      await assert.rejects(
        () =>
          callWithRandomAccessList(
            callerContract,
            targetContract.target,
            Array.from({ length: 100 }, () => 100),
          ),
        { message: /Oversized data/ },
      );
    });
  });
});
