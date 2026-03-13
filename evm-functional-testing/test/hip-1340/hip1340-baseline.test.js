const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Hip1340TestContext } = require('./utils/test-context');

const { gas, units, getNonces, EOADefaultBalance } = require('./utils/web3');

describe('HIP-1340 - Baseline Check', function () {
    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        await this.testCtx.init();
    });

    it('should create and fund an EOA to ensure account creation is successful', async function () {
        const sender = await this.testCtx.createAndFundEOA();
        expect(await getNonces(sender.address)).to.be.deep.equal([0, 0, 0]);
        expect(await this.provider.getBalance(sender.address)).to.be.equal(EOADefaultBalance);
    });

    it('should complete hollow account creation by sending a transaction with exact gas', async function () {
        const sender = await this.testCtx.createAndFundEOA();
        const to = ethers.Wallet.createRandom();
        const value = units.tinybar(321n);

        const resp = await sender.sendTransaction({
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.accountCreationCost(),
            to,
            value,
        });
        await resp.wait();

        expect(await getNonces(sender.address)).to.be.deep.equal([1, 1, 1]);
        expect(await this.provider.getBalance(to.address)).to.be.equal(value);
    });
});
