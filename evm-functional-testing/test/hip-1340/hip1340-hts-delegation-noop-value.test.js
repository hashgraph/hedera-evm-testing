const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Hip1340TestContext } = require('./utils/test-context');

const {
    asLongZeroAddress,
    verifyDelegation,
    encodeFunctionData,
} = require('./utils/web3');

describe('HIP-1340 - EIP-7702 delegation to HTS system contract', function () {

    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
        this.delegateToAddress = asLongZeroAddress(0x167);
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        this.sender = await this.testCtx.createAndFundEOA();
        await this.testCtx.init();
    });

    const executeNoOpWithValue = async (t, { value }) => {
        const eoa = await t.testCtx.authorizeEOADelegation(
            await t.testCtx.createAndFundEOA(),
            t.delegateToAddress
        );
        await verifyDelegation(eoa.address, t.delegateToAddress);

        const balance = await t.provider.getBalance(eoa.address);
        const data = encodeFunctionData('approve(address token, address spender, uint256 amount)', [eoa.address, t.sender.address, 1000]);

        const receipt = await t.sender.sendTransaction({
            chainId: t.network.chainId,
            nonce: 0,
            gasLimit: 100_000,
            value,
            data,
            to: eoa.address,
        }).then(tx => tx.wait());

        return { eoa, receipt, balance };
    };

    const tests = [
        { value: 0n },
        { value: 10_000n * 1_00000_00000n },
    ];

    describe('value transfer behavior', function () {
        tests.forEach(({ value }) => {
            it(`should run no-op with value ${value} when delegating to HTS system contract`, async function () {
                const { eoa, receipt, balance } = await executeNoOpWithValue(this, { value });
                expect(await this.provider.getBalance(eoa.address, receipt.blockNumber)).to.be.equal(balance + value);
            });
        });
    });
});
