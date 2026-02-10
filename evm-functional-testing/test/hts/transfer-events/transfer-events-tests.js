const { ethers } = require("hardhat");
const {
  createTestContracts,
  setupFungibleTokenTests,
  setupNonFungibleTokenTests,
} = require("./test-engine/transfer-events-setup");
const { createSDKClient } = require("../../../utils/utils");
const { readFileSync } = require("node:fs");
const { HTS_ADDRESS, HTS_ADDRESS_V2 } = require("../../../utils/constants");
const { erc20EventsTests } = require("./test-engine/erc20");
const { erc721EventsTests } = require("./test-engine/erc721");
const { erc20AndErc721EventsTests } = require("./test-engine/erc20AndErc721");
const { Erc20RelayTestsImpl } = require("./relay/erc20-relay-tests-impl");
const { Erc721RelayTestsImpl } = require("./relay/erc721-relay-tests-impl");
const {
  Erc20Erc721RelayTestsImpl,
} = require("./relay/erc20AndErc721-relay-tests-impl");
const { Erc20SdkTestsImpl } = require("./sdk/erc20-sdk-tests-impl");
const { Erc721SdkTestsImpl } = require("./sdk/erc721-sdk-tests-impl");
const {
  Erc20Erc721SdkTestsImpl,
} = require("./sdk/erc20AndErc721-sdk-tests-impl");

// fix JSON.stringify - Do not know how to serialize a BigInt
BigInt.prototype["toJSON"] = function () {
  return Number(this);
};

describe("HTS System Contract testing. ERC Transfer events tests", async () => {
  const context = {
    transferContract: "",
    ftTokenAddress: "",
    nftTokenAddress: "",
    serialNumbers: [],
    receiverContract1: "",
    receiverContract2: "",
    receiverNotAssociated: "",
  }; // using this object to pass 'before' results to tests in other files

  before(async () => {
    // Import the ABI for SDK tests and set up an ethers.js interface using the abi
    context.transferAbiInterface = new ethers.Interface(
      JSON.parse(
        readFileSync(
          "./artifacts/contracts/hts/transfer-events/HTSSystemContractTransfersExecutorContract.sol/HTSSystemContractTransfersExecutorContract.json",
          "utf8",
        ),
      ).abi,
    );
    context.receiverAbiInterface = new ethers.Interface(
      JSON.parse(
        readFileSync(
          "./artifacts/contracts/hts/transfer-events/AirDropClaimAndReceiverContract.sol/AirDropClaimAndReceiverContract.json",
          "utf8",
        ),
      ).abi,
    );
    [
      context.treasury,
      context.transferContract,
      context.receiverContract1,
      context.receiverContract2,
      context.receiverNotAssociated,
    ] = await createTestContracts(3);
  });

  describe("Relay -> HTS -> ERC events", async () => {
    describe("Relay -> HTS -> ERC20 events", async () => {
      before(async () => {
        await setupFungibleTokenTests(context);
      });

      describe("Relay -> HTS(0x167) -> ERC20 events", async () => {
        await erc20EventsTests(
          new Erc20RelayTestsImpl(),
          HTS_ADDRESS,
          true,
          context,
        );
      });

      describe("Relay -> HTS(0x16c) -> ERC20 events", async () => {
        await erc20EventsTests(
          new Erc20RelayTestsImpl(),
          HTS_ADDRESS_V2,
          false,
          context,
        );
      });
    });

    describe("Relay -> HTS -> ERC721 events", async () => {
      before(async () => {
        await setupNonFungibleTokenTests(context, 30);
      });

      describe("Relay -> HTS(0x167) -> ERC721 events", async () => {
        await erc721EventsTests(
          new Erc721RelayTestsImpl(),
          HTS_ADDRESS,
          true,
          context,
        );
      });

      describe("Relay -> HTS(0x16c) -> ERC721 events", async () => {
        await erc721EventsTests(
          new Erc721RelayTestsImpl(),
          HTS_ADDRESS_V2,
          false,
          context,
        );
      });
    });

    describe("Relay -> HTS -> ERC20 and ERC721 events", async () => {
      before(async () => {
        await setupFungibleTokenTests(context);
        await setupNonFungibleTokenTests(context, 10);
      });

      describe("Relay -> HTS(0x167) -> ERC20 and ERC721 events", async () => {
        await erc20AndErc721EventsTests(
          new Erc20Erc721RelayTestsImpl(),
          HTS_ADDRESS,
          context,
        );
      });

      describe("Relay -> HTS(0x16c) -> ERC20 and ERC721 events", async () => {
        await erc20AndErc721EventsTests(
          new Erc20Erc721RelayTestsImpl(),
          HTS_ADDRESS_V2,
          context,
        );
      });
    });
  });

  describe("SDK -> HTS -> ERC events", async () => {
    // We are instantiating sdkClient and closing it exactly for 'SDK ERC events'
    // because in case of client inactivity it is failing 'k8s port-forward' with error:
    // E0120 21:23:09.172052   39098 portforward.go:424] "Unhandled Error" err="an error occurred forwarding 50211 -> 50211: error forwarding port 50211 to pod c9f41fb7b0a16561e179d721824d79e8cda557c61d541f5d2bb0a157d7400076, uid : failed to execute portforward in network namespace \"/var/run/netns/cni-7f0d3f76-aa7a-deab-34d6-82ba722243d0\": readfrom tcp4 127.0.0.1:42616->127.0.0.1:50211: write tcp4 127.0.0.1:42616->127.0.0.1:50211: write: broken pipe"
    before(async () => {
      context.sdkClient = await createSDKClient();
    });

    after(async () => {
      if (context.sdkClient) {
        console.log("Closing client...");
        context.sdkClient.close();
        context.sdkClient = null;
      }
    });

    describe("SDK -> HTS -> ERC20 events", async () => {
      before(async () => {
        await setupFungibleTokenTests(context);
      });

      describe("SDK -> HTS(0x167) -> ERC20 events", async () => {
        await erc20EventsTests(
          new Erc20SdkTestsImpl(context),
          HTS_ADDRESS,
          true,
          context,
        );
      });

      describe("SDK -> HTS(0x16c) -> ERC20 events", async () => {
        await erc20EventsTests(
          new Erc20SdkTestsImpl(context),
          HTS_ADDRESS_V2,
          false,
          context,
        );
      });
    });

    describe("SDK -> HTS -> ERC721 events", async () => {
      before(async () => {
        await setupNonFungibleTokenTests(context, 30);
      });

      describe("SDK -> HTS(0x167) -> ERC721 events", async () => {
        await erc721EventsTests(
          new Erc721SdkTestsImpl(context),
          HTS_ADDRESS,
          true,
          context,
        );
      });

      describe("SDK -> HTS(0x16c) -> ERC721 events", async () => {
        await erc721EventsTests(
          new Erc721SdkTestsImpl(context),
          HTS_ADDRESS_V2,
          false,
          context,
        );
      });
    });

    describe("SDK -> HTS -> ERC20 and ERC721 events", async () => {
      before(async () => {
        await setupFungibleTokenTests(context);
        await setupNonFungibleTokenTests(context, 10);
      });

      describe("SDK -> HTS(0x167) -> ERC20 and ERC721 events", async () => {
        await erc20AndErc721EventsTests(
          new Erc20Erc721SdkTestsImpl(context),
          HTS_ADDRESS,
          context,
        );
      });

      describe("SDK -> HTS(0x16c) -> ERC20 and ERC721 events", async () => {
        await erc20AndErc721EventsTests(
          new Erc20Erc721SdkTestsImpl(context),
          HTS_ADDRESS_V2,
          context,
        );
      });
    });
  });
});
