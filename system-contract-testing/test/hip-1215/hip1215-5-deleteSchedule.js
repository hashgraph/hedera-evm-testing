const { GAS_LIMIT_1_000_000 } = require("../../utils/constants");
const { randomAddress } = require("../../utils/address");
const {
  addTestCallData,
  testScheduleCallEvent,
  testResponseCodeEvent,
} = require("./utils/hip1215-utils");
const { beforeTests, afterTests } = require("./hip1215-1-main");
const Async = require("../../utils/async");

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
        addTestCallData("deleteSchedule"),
      );
      const scheduleAddress = await testScheduleCallEvent(createTx, 22n);
      // delete schedule
      const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
      await testResponseCodeEvent(deleteTx, 22n);
    });

    it("should delete schedule through proxy", async () => {
      // create schedule
      const createTx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        Math.floor(Date.now() / 1000) + 60,
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("deleteSchedule proxy"),
      );
      const scheduleAddress = await testScheduleCallEvent(createTx, 22n);
      // delete schedule
      const deleteTx = await hip1215.deleteScheduleProxy(scheduleAddress);
      await testResponseCodeEvent(deleteTx, 22n);
    });
  });

  describe("negative cases", () => {
    it("should fail with random address for to", async () => {
      const tx = await hip1215.deleteSchedule(randomAddress());
      await testResponseCodeEvent(tx, 21n);
    });

    it("should fail with expired address for to", async () => {
      // create schedule
      const tx = await hip1215.scheduleCall(
        await hip1215.getAddress(),
        Math.floor(Date.now() / 1000) + 2, // just enough to execute transaction
        GAS_LIMIT_1_000_000.gasLimit,
        0,
        addTestCallData("deleteSchedule fail expired"),
      );
      const scheduleAddress = await testScheduleCallEvent(tx, 22n);
      await Async.wait(2000);
      // delete schedule
      const deleteTx = await hip1215.deleteSchedule(scheduleAddress);
      await testResponseCodeEvent(deleteTx, 201n);
    });
  });
});
