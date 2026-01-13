/** @type import('hardhat/config').HardhatUserConfig */

require("hardhat-abi-exporter");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");

const { NETWORKS } = require("./utils/environment");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  mocha: {
    timeout: 60000,
    color: true,
    failZero: Boolean(process.env.CI),
    forbidOnly: Boolean(process.env.CI),
    reporter: "mocha-multi-reporters",
    reporterOption: {
      reporterEnabled: "spec, mocha-junit-reporter",
      mochaJunitReporterReporterOptions: {
        mochaFile: "test-results.[hash].xml",
        includePending: true,
        outputs: true,
      },
    },
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500,
      },
      evmVersion: "cancun",
    },
  },
  abiExporter: {
    path: "./abi",
    runOnCompile: true,
  },
  // defaultNetwork: 'hardhat',
  defaultNetwork: "local",
  // see https://v2.hardhat.org/hardhat-runner/docs/config
  networks: {
    hardhat: {},
    local: {
      url: NETWORKS.local.url,
      chainId: NETWORKS.local.chainId,
      gas: NETWORKS.local.gas,
      timeout: NETWORKS.local.timeout,
      accounts: [
        "0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        "0x748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04",
        "0x3bcb2fbd18610f44eda2bfd58df63d053e2a6b165617a2ef5e5cca079e0c588a",
      ],
      sdkClient: {
        operatorId: "0.0.1002",
        operatorKey: "3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        networkNodeUrl: NETWORKS.local.networkNodeUrl,
        nodeId: NETWORKS.local.nodeId,
        mirrorNode: NETWORKS.local.mirrorNode,
      },
    },
  },
};
