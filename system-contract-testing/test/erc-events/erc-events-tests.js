const {
  beforeTests,
  beforeFtTests,
  beforeNftTests,
  afterTests,
} = require("./erc-events-main");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../utils/constants");
const { erc20EventsTests } = require("./setup/erc20");
const { erc721EventsTests } = require("./setup/erc721");
const { erc20AndErc721EventsTests } = require("./setup/erc20AndErc721");
const { Erc20RelayTestsImpl } = require("./relay/erc20-relay-tests-impl");
const { Erc721RelayTestsImpl } = require("./relay/erc20-relay-tests-impl");
const {
  Erc20Erc721RelayTestsImpl,
} = require("./relay/erc20AndErc721-relay-tests-impl");
const { Erc20SdkTestsImpl } = require("./sdk/erc20-relay-sdk-impl");

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
  });

  after(async () => {
    await afterTests(context.sdkClient);
  });

  describe("ERC20 events", async () => {
    before(async () => {
      if (!context.ftTokenAddress) {
        context.ftTokenAddress = await beforeFtTests(
          context.treasury,
          context.transferContract,
          context.receiverContract1,
          context.receiverContract2,
        );
      }
    });

    describe("HTS 0x167", async () => {
      await erc20EventsTests(
        new Erc20RelayTestsImpl(),
        HTS_ADDRESS,
        true,
        context,
      );
    });

    describe("HTS 0x16c", async () => {
      await erc20EventsTests(
        new Erc20RelayTestsImpl(),
        HTS_ADDRESS_V2,
        false,
        context,
      );
    });

    // TODO work on SDK
    describe("SDK HTS 0x167", async () => {
      await erc20EventsTests(
        new Erc20SdkTestsImpl(context.sdkClient),
        HTS_ADDRESS,
        true,
        context,
      );
    });
  });

  describe("ERC721 events", async () => {
    before(async () => {
      if (!context.nftTokenAddress) {
        [context.nftTokenAddress, context.serialNumbers] = await beforeNftTests(
          context.treasury,
          context.transferContract,
          40, // TODO move minting separately?
          context.receiverContract1,
          context.receiverContract2,
        );
      }
    });

    describe("HTS 0x167", async () => {
      await erc721EventsTests(
        new Erc721RelayTestsImpl(),
        HTS_ADDRESS,
        true,
        context,
      );
    });

    describe("HTS 0x16c", async () => {
      await erc721EventsTests(
        new Erc721RelayTestsImpl(),
        HTS_ADDRESS_V2,
        false,
        context,
      );
    });
  });

  describe("ERC20/ERC721 events", async () => {
    before(async () => {
      if (!context.nftTokenAddress) {
        if (!context.ftTokenAddress) {
          context.ftTokenAddress = await beforeFtTests(
            context.treasury,
            context.transferContract,
            context.receiverContract1,
            context.receiverContract2,
          );
        }
        [context.nftTokenAddress, context.serialNumbers] = await beforeNftTests(
          context.treasury,
          context.transferContract,
          40,
          context.receiverContract1,
          context.receiverContract2,
        );
      }
    });

    describe("HTS 0x167", async () => {
      await erc20AndErc721EventsTests(
        new Erc20Erc721RelayTestsImpl(),
        HTS_ADDRESS,
        context,
      );
    });

    describe("HTS 0x16c", async () => {
      await erc20AndErc721EventsTests(
        new Erc20Erc721RelayTestsImpl(),
        HTS_ADDRESS_V2,
        context,
      );
    });
  });
});
