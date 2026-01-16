const {
  beforeTests,
  beforeFtTests,
  beforeNftTests,
  afterTests,
} = require("./erc-events-main");
const { erc20EventsRelayTests } = require("./relay/erc20");
const { erc20EventsSdkTests } = require("./sdk/erc20");
const { erc721EventsTests } = require("./relay/erc721");
const { erc20AndErc721EventsTests } = require("./relay/erc20AndErc721");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");

describe("ERC Transfer events", async () => {
  const context = {
    transferContract: "",
    ftTokenAddress: "",
    nftTokenAddress: "",
    receiverContract1: "",
    receiverContract2: "",
    receiverNotAssociated: "",
  }; // using this object to pass 'before' results to tests in other files

  before(async () => {
    [
      context.sdkClient,
      context.treasury,
      context.transferContract,
      context.receiverContract1,
      context.receiverContract2,
      context.receiverNotAssociated,
    ] = await beforeTests(3);
    context.ftTokenAddress = await beforeFtTests(
      context.treasury,
      context.transferContract,
      context.receiverContract1,
      context.receiverContract2,
    );
    [context.nftTokenAddress, context.serialNumbers] = await beforeNftTests(
      context.treasury,
      context.transferContract,
      40,
      context.receiverContract1,
      context.receiverContract2,
    );
  });

  after(async () => {
    await afterTests(context.sdkClient);
  });

  describe("ERC20 events", async () => {
    describe("HTS 0x167", async () => {
      await erc20EventsRelayTests(HTS_ADDRESS, true, context);
    });

    describe("HTS 0x16c", async () => {
      await erc20EventsRelayTests(HTS_ADDRESS_V2, false, context);
    });

    // TODO work on SDK
    // describe("SDK HTS 0x167", async () => {
    //   await erc20EventsSdkTests(HTS_ADDRESS, true, context);
    // });
  });

  describe("ERC721 events", async () => {
    describe("HTS 0x167", async () => {
      await erc721EventsTests(HTS_ADDRESS, true, context);
    });

    describe("HTS 0x16c", async () => {
      await erc721EventsTests(HTS_ADDRESS_V2, false, context);
    });
  });

  describe("ERC20/ERC721 events", async () => {
    describe("HTS 0x167", async () => {
      await erc20AndErc721EventsTests(HTS_ADDRESS,  context);
    });

    describe("HTS 0x16c", async () => {
      await erc20AndErc721EventsTests(HTS_ADDRESS_V2,  context);
    });
  });
});
