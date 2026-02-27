const { expect } = require('chai');
const { ethers } = require('hardhat');

const { gas, createAndFundEOA, getNonces } = require('./utils/web3');

describe('HIP-1340 - Baseline Check', function () {

    /** @type {ethers.JsonRpcProvider} */
    let provider;

    /** @type {ethers.Network} */
    let network;

    before(async function () {
        provider = (await ethers.getSigners())[0].provider;
        network = await provider.getNetwork();
    });

    it('should create and fund an EOA to ensure account creation is successful', async function () {
        const sender = await createAndFundEOA();
        expect(await getNonces(sender.address)).to.be.deep.equal([0, 0, 0]);
        expect(await provider.getBalance(sender.address)).to.be.equal(1000_0000_0000n * 1_00000_00000n);
    });

    it('should complete hollow account creation by sending a transaction with exact gas', async function () {
        const sender = await createAndFundEOA();
        const to = ethers.Wallet.createRandom();
        const value = 321n * 1_00000_00000n;

        const resp = await sender.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base,
            to,
            value,
        });
        await resp.wait();

        expect(await getNonces(sender.address)).to.be.deep.equal([1, 1, 1]);
        expect(await provider.getBalance(to.address)).to.be.equal(value);
    });
});
