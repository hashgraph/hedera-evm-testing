const {
  beforeTests,
  beforeFtTests,
  beforeNftTests,
  afterTests,
} = require("./erc-events-main");
const { erc20EventsTests } = require("./erc20");
const { erc721EventsTests } = require("./erc721");
const { erc20AndErc721EventsTests } = require("./erc20AndErc721");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");

describe("ERC Transfer events", async () => {
  const context = {}; // using this object to pass 'before' results to tests in other files

  before(async () => {
    [context.sdkClient, context.treasury] = await beforeTests();
    context.ftTokenAddress = await beforeFtTests(
      context.sdkClient,
      context.treasury,
    );
    [context.nftTokenAddress, context.serialNumbers] = await beforeNftTests(
      context.sdkClient,
      context.treasury,
      50,
    );
  });

  after(async () => {
    await afterTests(context.sdkClient);
  });

  describe("ERC20 events", async () => {
    describe("HTS 0x167", async () => {
      await erc20EventsTests(HTS_ADDRESS, context);
    });

    describe("HTS 0x16c", async () => {
      await erc20EventsTests(HTS_ADDRESS_V2, context);
    });
  });

  describe("ERC721 events", async () => {
    describe("HTS 0x167", async () => {
      await erc721EventsTests(HTS_ADDRESS, context);
    });

    describe("HTS 0x16c", async () => {
      await erc721EventsTests(HTS_ADDRESS_V2, context);
    });
  });

  describe("ERC20/ERC721 events", async () => {
    describe("HTS 0x167", async () => {
      await erc20AndErc721EventsTests(HTS_ADDRESS, context);
    });

    describe("HTS 0x16c", async () => {
      await erc20AndErc721EventsTests(HTS_ADDRESS_V2, context);
    });
  });
});
