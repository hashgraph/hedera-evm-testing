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
    defaultNetwork: 'solo_local',
    networks: {
        hardhat: {},
        solo_local: {
            url: NETWORKS.local.url,
            gas: NETWORKS.local.gas,
            timeout: NETWORKS.local.timeout,
            chainId: NETWORKS.local.chainId,
        },
    }
};
