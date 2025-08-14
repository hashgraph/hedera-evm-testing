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
    defaultNetwork: 'hardhat',
    // see https://v2.hardhat.org/hardhat-runner/docs/config
    networks: {
        hardhat: {},
        local: {
            url: NETWORKS.local.url,
            chainId: NETWORKS.local.chainId,
            timeout: NETWORKS.local.timeout,
            accounts: [
                '0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68'
            ]
        },
        testnet: {
            url: NETWORKS.testnet.url,
            chainId: NETWORKS.testnet.chainId,
            accounts: [
                // add your HEX Encoded Private Key
            ]
        },
    }
};
