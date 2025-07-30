/** @type import('hardhat/config').HardhatUserConfig */

require('hardhat-abi-exporter');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');

const {
  OPERATOR_ID_A,
  OPERATOR_KEY_A,
  NETWORKS,
  PRIVATE_KEYS,
} = require('./utils/environemnt');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  mocha: {
    timeout: 3600000,
    color: true,
    failZero: Boolean(process.env.CI),
    forbidOnly: Boolean(process.env.CI),
    reporter: 'mocha-multi-reporters',
    reporterOption: {
      reporterEnabled: 'spec, mocha-junit-reporter',
      mochaJunitReporterReporterOptions: {
        mochaFile: 'test-results.[hash].xml',
        includePending: true,
        outputs: true,
      },
    },
  },
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 500,
      },
      evmVersion: 'cancun',
    },
  },
  abiExporter: {
    path: './abi',
    runOnCompile: true
  },
  // defaultNetwork: 'besu_local',
  networks: {
    besu_local: {
      url: NETWORKS.besu.url,
      allowUnlimitedContractSize: NETWORKS.besu.allowUnlimitedContractSize,
      blockGasLimit: NETWORKS.besu.blockGasLimit,
      gas: NETWORKS.besu.gas,
      timeout: NETWORKS.besu.timeout,
      chainId: NETWORKS.besu.chainId,
      accounts: [
        // private keys are configured in the genesis file https://github.com/hyperledger/besu/blob/main/config/src/main/resources/dev.json#L20
        '0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f',
        '0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
        '0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63'
      ],
    },
  }
};
