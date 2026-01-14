const {
  beforeTests,
  beforeFtTests,
  beforeNftTests,
  afterTests,
} = require("./erc-events-main");
const { erc20EventsTests } = require("./erc20");
const { erc721EventsTests } = require("./erc721");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");

describe("ERC Transfer events", async () => {
  const context = {}; // using this object to pass 'before' results to tests in other files

  before(async () => {
    [context.sdkClient, context.treasury] = await beforeTests();
  });

  after(async () => {
    await afterTests(context.sdkClient);
  });

  describe("ERC20 events", async () => {

    before(async () => {
      context.ftTokenAddress = await beforeFtTests(
        context.sdkClient,
        context.treasury,
      );
    });

    describe("HTS 0x167", async () => {
      await erc20EventsTests(HTS_ADDRESS, context);
    });

    describe("HTS 0x16c", async () => {
      await erc20EventsTests(HTS_ADDRESS_V2, context);
    });
  });

  describe("ERC721 events", async () => {

    before(async () => {
      [context.nftTokenAddress, context.serialNumbers] = await beforeNftTests(
        context.sdkClient,
        context.treasury,
        40,
      );
    })

    describe("HTS 0x167", async () => {
      await erc721EventsTests(HTS_ADDRESS, context);
    });

    describe("HTS 0x16c", async () => {
      await erc721EventsTests(HTS_ADDRESS_V2, context);
    });
  });
});
