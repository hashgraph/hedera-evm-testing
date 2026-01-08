const { ResponseCodeEnum } = require("@hashgraph/proto").proto;
const {
  beforeFtTests,
  deployTestContract,
  afterTests,
} = require("./erc-events-main");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");
const {
  validateResponseCodeEvent,
  validateErc20Event,
} = require("../../utils/events");

describe("ERC20 events", () => {
  let sdkClient, treasury, tokenAddress;

  before(async () => {
    [sdkClient, treasury, tokenAddress] = await beforeFtTests();
  });

  after(async () => {
    await afterTests();
  });

  // ---------------- Test functions ----------------
  async function transferTokenTest(testContract) {
    const rc = await (
      await testContract.transferToken(tokenAddress, treasury, testContract, 1)
    ).wait();
    await validateResponseCodeEvent(rc, ResponseCodeEnum.SUCCESS.valueOf());
    await validateErc20Event(rc, [
      { from: treasury.target, to: testContract.target, amount: 1 },
    ]);
  }

  describe("HTS 0x167", async () => {
    let events167Contract;

    before(async () => {
      events167Contract = await deployTestContract(HTS_ADDRESS, 1000);
    });

    describe("Relay: 0x167 positive cases", async () => {
      it("0x167 FT transferToken", async () => {
        await transferTokenTest(events167Contract);
      });
    });

    describe("Relay: 0x167 negative cases", async () => {
      // TODO
    });

    describe("SDK: 0x167 positive cases", async () => {
      // TODO
    });

    describe("SDK: 0x167 negative cases", async () => {
      // TODO
    });
  });

  describe("HTS 0x16c", async () => {
    //TODO
  });
});
