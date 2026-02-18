const log = require('node:util').debuglog('hip-1340');
const { ethers } = require('hardhat');

/**
 * Common setup for HIP-1340 EIP-7702 tests
 * @returns {Promise<{provider: ethers.JsonRpcProvider | import('hardhat').HardhatEthersProvider, network: ethers.Network}>}
 */
async function setupProviderAndNetwork() {
    /** @type {ethers.JsonRpcProvider | import('hardhat').HardhatEthersProvider} */
    let provider;

    /** @type {ethers.Network} */
    let network;

    provider = (await ethers.getSigners())[0].provider;
    network = await provider.getNetwork();
    
    return { provider, network, log };
}

module.exports = { setupProviderAndNetwork };
