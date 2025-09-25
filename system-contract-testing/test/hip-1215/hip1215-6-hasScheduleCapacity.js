const { GAS_LIMIT_1_000_000, GAS_LIMIT_15M } = require("../../utils/constants");
const Async = require("../../utils/async");
const {
  mockSetSuccessResponse,
  mockSetFailResponse,
} = require("./utils/hip1215-mock");
const { MOCK_ENABLED } = require("../../utils/environment");
const {
  getExpirySecond,
  testHasScheduleCapacityEvent,
} = require("./utils/hip1215-utils");
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

  // TODO add hasScheduleCapacity test from a 'view' function when 'hasScheduleCapacity' will be available on MN
  describe("positive cases", () => {
    before(async () => {
      return mockSetSuccessResponse(impl1215);
    });

    it("should have enough capacity", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_1_000_000.gasLimit,
      );
      await testHasScheduleCapacityEvent(tx, true);
    });

    it("should return true for valid expiry and max gas limit - 1", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit - 1,
      );
      await testHasScheduleCapacityEvent(tx, true);
    });
  });

  describe("negative cases", () => {
    before(async () => {
      return (
        mockSetFailResponse(impl1215, 1)
          // somehow Mock state change not always appears just after this call returns on local node.
          // so we are adding 1s wait as a temp fix for this
          .then(() =>
            MOCK_ENABLED ? Async.wait(1000) : Promise.resolve("resolved"),
          )
      );
    });

    it("should return false for expiry in the past", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        1716666666,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      await testHasScheduleCapacityEvent(tx, false);
    });

    it("should return false for 0 expiry", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        0,
        GAS_LIMIT_1_000_000.gasLimit,
      );
      await testHasScheduleCapacityEvent(tx, false);
    });

    it("Should return false for valid expiry and max gas limit + 1", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        GAS_LIMIT_15M.gasLimit + 1,
      );
      await testHasScheduleCapacityEvent(tx, false);
    });

    it("Should return false for valid expiry and max long + 1 gas limit", async () => {
      const tx = await hip1215.hasScheduleCapacity(
        getExpirySecond(),
        BigInt("9223372036854775808"),
      );
      await testHasScheduleCapacityEvent(tx, false);
    });
  });
});
