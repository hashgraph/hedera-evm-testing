const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  ONE_HBAR,
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_1_000,
  GAS_LIMIT_15M,
  MAX_EXPIRY,
  Events,
} = require("../../utils/constants");

const { MOCK_ENABLED } = require("../../utils/environment");

describe("HIP-1215 System Contract testing", () => {
  let hip1215, impl1215, signers;
  const htsAddress = "0x0000000000000000000000000000000000000167";
  const mockedResponseAddress = "0x000000000000000000000000000000000000007B";
  const dayFromNowSeconds = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
  const callData = "0x5b8f8584"; // token freeze signature

  // ----------------- Mock update functions
  function mockSetSuccessResponse() {
    if (MOCK_ENABLED) {
      console.log("Mock: set status success:", 22);
      return impl1215.setResponse(true, 22);
    } else {
      return Promise.resolve("resolved");
    }
  }
  function mockSetFailResponse(_responseCode) {
    if (MOCK_ENABLED) {
      console.log("Mock: set status fail:", _responseCode);
      return impl1215.setResponse(false, _responseCode);
    } else {
      return Promise.resolve("resolved");
    }
  }

  // ----------------- Test helper functions
  async function testScheduleCallEvent(tx, responseCode) {
    const rc = await tx.wait();
    const log = rc.logs.find(
      (e) => e.fragment.name === Events.ScheduleCall,
    );
    expect(log.args[0]).to.equal(responseCode);
    if (responseCode === 22) {
      if (MOCK_ENABLED) {
        expect(log.args[1]).to.equal(mockedResponseAddress);
      } else {
        expect(log.args[1].length).to.equal(42);
      }
    } else {
      expect(log.args[1]).to.equal(ethers.ZeroAddress);
    }
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


  // ----------------- Tests
  before(async () => {
    // provider configs override
    ethers.provider.estimateGas = async () => 1_200_000;
    signers = await ethers.getSigners();
    // Extract this to a fixture and run
    const HIP1215ImplFactory = await ethers.getContractFactory(
      MOCK_ENABLED ? "HIP1215MockContract" : "HederaScheduleService_HIP1215",
    );

    impl1215 = await HIP1215ImplFactory.deploy();
    const HIP1215Factory = await ethers.getContractFactory("HIP1215Contract");
    console.log("Deploy hip1215 with impl:", impl1215.target);
    hip1215 = await HIP1215Factory.deploy(impl1215.target);
    await hip1215.waitForDeployment();
    console.log("Done hip1215:", hip1215.target);
    ethers.provider.estimateGas = async () => 2_000_000;
  });

  describe("scheduleCall", () => {
    describe("positive cases", async () => {
      before(async () => {
        return mockSetSuccessResponse();
      });

      it("should schedule a call", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with eoa address for to", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          signers[0].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with address(this) for to", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          await hip1215.getAddress(),
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          callData,
          { value: ONE_HBAR },
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed? with empty calldata", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed schedule but fail execution with invalid calldata", async () => {
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0xabc123",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should change the state after schedule executed", async () => {
        expect(await hip1215.getValue()).to.equal(0);
        const tx = await hip1215.scheduleCallWithFullParam(
          await hip1215.getAddress(),
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063",
        );
        testScheduleCallEvent(tx, 22n);
        // TODO add execution check logic
        expect(await hip1215.getValue()).to.equal(0n);
        await new Promise((resolve) => setTimeout(resolve, 100));
        // needs CN for this expectation
        // expect(await hip1215.getValue()).to.equal(63n);
      });
    });

    describe("negative cases", () => {
      it("should fail with zero address for to", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.scheduleCallWithFullParam(
          ethers.ZeroAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with gasLimit 0", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          0,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit 1000", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit uint.maxvalue", async () => {
        await mockSetFailResponse(366);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          ethers.MaxUint256,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 366n);
      });

      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(10);
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          callData,
        );
        testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at current time", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          new Date().getUTCMilliseconds(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at max expiry + 1", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithFullParam(
          htsAddress,
          new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });
    });
  });

  describe("scheduleCallWithPayer()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse();
      });

      it("should schedule a call with payer", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with eoa address for to", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          signers[0].address,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with address(this) for to", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          await hip1215.getAddress(),
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          callData,
          { value: ONE_HBAR },
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed? with empty calldata", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed schedule but fail execution with invalid calldata", async () => {
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0xabc123",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should change the state after schedule executed", async () => {
        expect(await hip1215.getValue()).to.equal(0);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          await hip1215.getAddress(),
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063",
        );
        testScheduleCallEvent(tx, 22n);
        // TODO add execution check logic
        expect(await hip1215.getValue()).to.equal(0n);
        // await new Promise((resolve) => setTimeout(resolve, 100));
      });
    });

    describe("negative cases", () => {
      it("should fail with zero address for to", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          ethers.ZeroAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with zero address for sender", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          ethers.ZeroAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with gasLimit 0", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          0,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit 1000", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit uint.maxvalue", async () => {
        await mockSetFailResponse(366);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          ethers.MaxUint256,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 366n);
      });

      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(10);
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          callData,
        );
        testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at current time", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          new Date().getUTCMilliseconds(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at max expiry + 1", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          signers[1].address,
          new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with sender as zero address", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          ethers.ZeroAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with sender as contract", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.scheduleCallWithPayerWithFullParam(
          htsAddress,
          await hip1215.getAddress(),
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });
    });
  });

  describe("executeCallOnSenderSignature()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse();
      });

      it("should schedule a call with sender signature", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with eoa address for to", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          signers[0].address,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with address(this) for to", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          await hip1215.getAddress(),
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed with amount sent to contract", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          ONE_HBAR,
          callData,
          { value: ONE_HBAR },
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed? with empty calldata", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should succeed schedule but fail execution with invalid calldata", async () => {
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0xabc123",
        );
        testScheduleCallEvent(tx, 22n);
      });

      it("should change the state after schedule executed", async () => {
        expect(await hip1215.getValue()).to.equal(0);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          await hip1215.getAddress(),
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          "0x3fb5c1cb0000000000000000000000000000000000000000000000000000000000000063",
        );
        testScheduleCallEvent(tx, 22n);
        // TODO add execution check logic
        expect(await hip1215.getValue()).to.equal(0n);
        // await new Promise((resolve) => setTimeout(resolve, 100));
      });
    });

    describe("negative cases", () => {
      it("should fail with zero address for to", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          ethers.ZeroAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with zero address for sender", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          ethers.ZeroAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with gasLimit 0", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          0,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 30n);
      });

      it("should fail with gasLimit 1000", async () => {
        await mockSetFailResponse(30);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with gasLimit uint.maxvalue", async () => {
        await mockSetFailResponse(366);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          ethers.MaxUint256,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 366n);
      });

      it("should fail with amount more than contract balance", async () => {
        await mockSetFailResponse(10);
        const balance = await signers[0].provider.getBalance(
          await hip1215.getAddress(),
        );
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          balance + ONE_HBAR,
          callData,
        );
        testScheduleCallEvent(tx, 10n);
      });

      it("should fail with 0 expiry", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          0,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at current time", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          new Date().getUTCMilliseconds(),
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with expiry at max expiry + 1", async () => {
        await mockSetFailResponse(370);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          signers[1].address,
          new Date().getUTCMilliseconds() + MAX_EXPIRY + 1,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 370n);
      });

      it("should fail with sender as zero address", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          ethers.ZeroAddress,
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });

      it("should fail with sender as contract", async () => {
        await mockSetFailResponse(15);
        const tx = await hip1215.executeCallOnSenderSignatureWithFullParam(
          htsAddress,
          await hip1215.getAddress(),
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
          0,
          callData,
        );
        testScheduleCallEvent(tx, 15n);
      });
    });
  });

  describe("deleteSchedule()", () => {
    // TODO add when we have state to check
  });

  // TODO add hasScheduleCapacity test from a 'view' function
  describe("hasScheduleCapacity()", () => {
    describe("positive cases", () => {
      before(async () => {
        return mockSetSuccessResponse();
      });

      it("should have enough capacity", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          dayFromNowSeconds,
          GAS_LIMIT_1_000_000.gasLimit,
        );
        testHasScheduleCapacityEvent(tx, true);
      });

      it("should return true for valid expiry and max gas limit - 1", async () => {
        const tx = await hip1215.hasScheduleCapacity(
          dayFromNowSeconds,
          GAS_LIMIT_15M.gasLimit - 1,
        );
        testHasScheduleCapacityEvent(tx, true);
      });
    });

    // TODO implement when hasScheduleCapacity will be implemented with https://github.com/hiero-ledger/hiero-consensus-node/issues/20662
    // describe("negative cases", () => {
    //   before(async () => {
    //     return mockSetFailResponse(1)
    //       // somehow Mock state change not always appears just after this call returns on local node.
    //       // so we are adding 1s wait as a temp fix for this
    //       .then(() => MOCK_ENABLED ? asyncUtils.wait(1000) : Promise.resolve("resolved") );
    //   });
    //
    //   it("should return false for expiry in the past", async () => {
    //     const tx = await hip1215.hasScheduleCapacity(
    //       1716666666,
    //       GAS_LIMIT_1_000_000.gasLimit,
    //     );
    //     expect(tx).to.be.false;
    //   });
    //
    //   it("Should return false for valid expiry and 0 gas limit", async () => {
    //     const tx = await hip1215.hasScheduleCapacity(dayFromNowSeconds, 0);
    //     expect(tx).to.be.false;
    //   });
    //
    //   it("Should return false for valid expiry and max gas limit", async () => {
    //     const tx = await hip1215.hasScheduleCapacity(
    //       dayFromNowSeconds,
    //       GAS_LIMIT_15M.gasLimit,
    //     );
    //     expect(tx).to.be.false;
    //   });
    // });
  });
});
