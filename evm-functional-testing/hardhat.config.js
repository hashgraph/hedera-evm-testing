/** @type import('hardhat/config').HardhatUserConfig */

require("dotenv").config();
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("hardhat-dependency-compiler");

const PREVIEWNET_PRIVATE_KEYS = process.env.PREVIEWNET_PRIVATE_KEYS
  ? process.env.PREVIEWNET_PRIVATE_KEYS.split(",").map((key) => key.trim())
  : [];

const TESTNET_PRIVATE_KEYS = process.env.TESTNET_PRIVATE_KEYS
  ? process.env.TESTNET_PRIVATE_KEYS.split(",").map((key) => key.trim())
  : [];

const MAINNET_PRIVATE_KEYS = process.env.MAINNET_PRIVATE_KEYS
  ? process.env.MAINNET_PRIVATE_KEYS.split(",").map((key) => key.trim())
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  mocha: {
    timeout: 120000,
    color: true,
    failZero: Boolean(process.env.CI),
    forbidOnly: Boolean(process.env.CI),
  },
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500,
      },
      evmVersion: "cancun",
    },
  },
  dependencyCompiler: {
    // TODO after switching to hardhat3 'solidity.npmFilesToBuild' can be used. See https://hardhat.org/docs/cookbook/npm-artifacts
    paths: [
      // used for test/hts/transfer-events
      "@hiero-ledger/hiero-contracts/account-service/IHRC904AccountFacade.sol",
      "@hiero-ledger/hiero-contracts/token-service/IHRC719.sol",
    ],
  },
  defaultNetwork: "solo",
  // see https://v2.hardhat.org/hardhat-runner/docs/config
  networks: {
    hardhat: {
      loggingEnabled: false,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        initialIndex: 0,
        count: 10,
        accountsBalance: "10000000000000000000000000",
      },
    },
    solo: {
      url: "http://localhost:37546",
      chainId: 298,
      gas: 15_000_000,
      timeout: 60_000,
      accounts: [
        // private keys of Solo local network. Configured at 'test.sh' file of this folder
        "0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        "0x748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04",
        "0x3bcb2fbd18610f44eda2bfd58df63d053e2a6b165617a2ef5e5cca079e0c588a",
      ],
      sdkClient: {
        operatorId: "0.0.1001",
        // private key of Solo local network. Configured at 'test.sh' file of this folder
        operatorKey:
          "3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68",
        networkNode: { "127.0.0.1:35211": "0.0.3" },
      },
      mirrorNodeUrl: "http://localhost:38081",
    },
    geth: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: [
        "0xb71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291",
      ],
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
    mainnet: {
      url: "https://mainnet.hashio.io/api",
      chainId: 296,
      gas: 15_000_000,
      timeout: 60_000,
      accounts: MAINNET_PRIVATE_KEYS,
    },
  },
};
