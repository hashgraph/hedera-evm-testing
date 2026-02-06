// HIP: https://hips.hedera.com/hip/hip-1215
const { GAS_LIMIT_1_000_000, GAS_LIMIT_15M } = require("../../utils/constants");
const {
  getExpirySecond,
  expectHasScheduleCapacityEvent,
} = require("./utils/hip1215-utils");
const { expect } = require("chai");
const { beforeTests, afterTests } = require("./hip1215-1-main");

describe("HIP-1215 System Contract testing. hasScheduleCapacity()", () => {
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
    it("should have enough capacity", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit
      );
      await expectHasScheduleCapacityEvent(receipt, true);
    });

    it("should have enough capacity with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit
      );
      expect(receipt).to.be.true;
    });

    it("should return true for valid expiry and max gas limit - 1", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit - 1
      );
      await expectHasScheduleCapacityEvent(receipt, true);
    });

    it("should return true for valid expiry and max gas limit - 1 with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit - 1
      );
      expect(receipt).to.be.true;
    });
  });

  describe("negative cases", () => {
    it("should return false for expiry in the past", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        1716666666,
        GAS_LIMIT_1_000_000.gasLimit
      );
      await expectHasScheduleCapacityEvent(receipt, false);
    });

    it("should return false for expiry in the past with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        1716666666,
        GAS_LIMIT_1_000_000.gasLimit
      );
      expect(receipt).to.be.false;
    });

    it("should return false for 0 expiry", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        0,
        GAS_LIMIT_1_000_000.gasLimit
      );
      await expectHasScheduleCapacityEvent(receipt, false);
    });

    it("should return false for 0 expiry with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        0,
        GAS_LIMIT_1_000_000.gasLimit
      );
      expect(receipt).to.be.false;
    });

    it("should return false for valid expiry and max gas limit + 1", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit + 1
      );
      await expectHasScheduleCapacityEvent(receipt, false);
    });

    // Skip until we deliver the optimizations
    it.skip("should return false for valid expiry and max gas limit + 1 with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit + 1
      );
      expect(receipt).to.be.false;
    });

    it("should return false for valid expiry and max long + 1 gas limit", async () => {
      const receipt = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        BigInt("9223372036854775808")
      );
      await expectHasScheduleCapacityEvent(receipt, false);
    });

    // Skip until we deliver the optimizations
    it.skip("should return false for valid expiry and max long + 1 gas limit with view context", async () => {
      const receipt = await hip1215.hasScheduleCapacityView(
        getExpirySecond(),
        BigInt("9223372036854775808")
      );
      expect(receipt).to.be.false;
    });
  });
});
