/** @type import('hardhat/config').HardhatUserConfig */

require("hardhat-abi-exporter");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");

const PREVIEWNET_PRIVATE_KEYS = process.env.PREVIEWNET_PRIVATE_KEYS
    ? process.env.TESTNET_PRIVATE_KEYS.split(",").map((key) => key.trim())
    : [];

const TESTNET_PRIVATE_KEYS = process.env.TESTNET_PRIVATE_KEYS
    ? process.env.TESTNET_PRIVATE_KEYS.split(",").map((key) => key.trim())
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  mocha: {
    timeout: 180000,
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
    version: "0.8.24",
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
      url: "http://localhost:7546",
      chainId: 298,
      gas: 15_000_000,
      timeout: 60_000,
      accounts: [
        // private keys of SOLO local network. Configured at 'test.sh' file of this folder
        "0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        "0x748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04",
        "0x3bcb2fbd18610f44eda2bfd58df63d053e2a6b165617a2ef5e5cca079e0c588a",
      ],
      sdkClient: {
        operatorId: "0.0.1002",
        operatorKey:
        // private key of SOLO local network. Configured at 'test.sh' file of this folder
          "3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        networkNodeUrl: "127.0.0.1:50211",
        nodeId: "3",
        mirrorNode: "http://127.0.0.1:8081",
      },
    },
    previewnet: {
      url: "https://previewnet.hashio.io/api",
      chainId: 297,
      gas: 15_000_000,
      timeout: 60_000,
      accounts: PREVIEWNET_PRIVATE_KEYS,
    },
    testnet: {
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      gas: 15_000_000,
      timeout: 60_000,
      accounts: TESTNET_PRIVATE_KEYS,
    },
  },
};
