const log = require('node:util').debuglog('hip-1340:web3');
const { ethers } = require('hardhat');

const { gas, units, getNonces, EOADefaultBalance } = require('./web3');

class Nonce {
    #val = 0;
    next() {
        return this.#val++;
    }
    get cur() {
        return this.#val;
    }
}

class Hip1340TestContext {
    /**
     * @param {import('ethers').Provider} [provider]
     */
    constructor(provider = ethers.provider) {
        this.provider = provider;
        this.seedEOA = undefined;
    }

    /**
     * @param {bigint} [hbarBalance=100_000n]
     * @returns {Promise<void>}
     */
    async init(hbarBalance = 100_000n) {
        await this._getSeedEOA(hbarBalance);
    }

    /**
     * @param {bigint} [hbarBalance=100_000n]
     * @returns {Promise<ethers.BaseWallet>}
     */
    async _getSeedEOA(hbarBalance = 100_000n) {
        if (this.seedEOA !== undefined) return this.seedEOA;

        const network = await this.provider.getNetwork();
        const operator = (await ethers.getSigners())[0];

        // On Ethereum-based local networks, reuse the pre-funded signer directly.
        if ([1337n, 31337n].includes(network.chainId)) {
            this.seedEOA = operator;
            return this.seedEOA;
        }

        const [nonce] = await getNonces(operator.address);

        this.seedEOA = ethers.Wallet.createRandom(this.provider);
        const resp = await operator.sendTransaction({
            type: 2,
            chainId: network.chainId,
            nonce,
            gasLimit: gas.base + gas.accountCreationCost(),
            value: units.hbar(hbarBalance),
            to: this.seedEOA.address,
        });
        await resp.wait();
        log('Seed EOA `%s` created at transaction %s', this.seedEOA.address, resp.hash);

        return this.seedEOA;
    }

    /**
     * @returns {Promise<ethers.BaseWallet>}
     */
    async createAndFundEOA() {
        const network = await this.provider.getNetwork();
        const seed = await this._getSeedEOA();
        const [nonce] = await getNonces(seed.address);

        const eoa = ethers.Wallet.createRandom(this.provider);
        const resp = await seed.sendTransaction({
            type: 2,
            chainId: network.chainId,
            nonce,
            gasLimit: 21_000 + gas.accountCreationCost(),
            value: EOADefaultBalance,
            to: eoa.address,
        });
        await resp.wait();
        log('EOA `%s` created at transanction %s', eoa.address, resp.hash);

        return eoa;
    }

    /**
     * @param {ethers.BaseWallet} eoa
     * @param {string} delegateToAddress
     * @param {number} [eoaNonce]
     * @returns {Promise<ethers.BaseWallet>}
     */
    async authorizeEOADelegation(eoa, delegateToAddress, eoaNonce = undefined) {
        const network = await this.provider.getNetwork();
        await (await this.createAndFundEOA()).sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: eoaNonce,
                address: delegateToAddress,
            })],
        }).then(tx => tx.wait());
        return eoa;
    }
}

module.exports = { Hip1340TestContext, Nonce };
