const {Logger, HederaMirrorNode} = require("@hashgraphonline/standards-sdk");
const hre = require("hardhat");
const Utils = require("./utils");

function createMirrorNodeClient() {
    const logger = new Logger({ module: "test/*", level: "warn" });
    const { mirrorNode } =
        hre.config.networks[Utils.getCurrentNetwork()].sdkClient;
    return new HederaMirrorNode("local", logger, {
        customUrl: mirrorNode,
    });
}

module.exports = {
    createMirrorNodeClient,
};
