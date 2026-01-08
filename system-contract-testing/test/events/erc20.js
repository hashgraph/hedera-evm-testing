const { ethers } = require("hardhat");
const { beforeFtTests, afterTests } = require("./events-main");

describe("ERC20 events", () => {

  let sdkClient, tokenAddress, ercEvents167Contract, ercEvents16cContract;

  // ----------------- Tests
  before(async () => {
    [sdkClient, tokenAddress, ercEvents167Contract, ercEvents16cContract] =
      await beforeFtTests();
  });

  after(async () => {
    await afterTests();
  });

  describe("Relay: positive cases", async () => {
    //TODO

    describe("Relay: HTS 0x167", async () => {
      it("0x167 FT transferToken", async () => {
        console.log(ercEvents167Contract); // TODO
      });
    });

    describe("Relay: HTS 0x16c", async () => {
      it("0x167 FT transferToken", async () => {

      });
    });
  });

  describe("Relay: negative cases", () => {
    describe("Relay: HTS 0x167", async () => {
      // TODO
    });

    describe("Relay: HTS 0x16c", async () => {
      // TODO
    });
  });

  describe("SDK: positive cases", async () => {
    describe("SDK: HTS 0x167", async () => {
      // TODO
    });

    describe("SDK: HTS 0x16c", async () => {
      // TODO
    });
  });

  describe("SDK: negative cases", () => {
    describe("SDK: HTS 0x167", async () => {
      // TODO
    });

    describe("SDK: HTS 0x16c", async () => {
      // TODO
    });
  });
});
