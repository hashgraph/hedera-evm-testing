const log = require('node:util').debuglog('hip-1340:eip7702:delegation-setup');

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Hip1340TestContext, Nonce } = require('./utils/test-context');

const web3 = require('./utils/web3');
const {
    gas,
    units,
    deploy,
    delegationIndicatorFor,
    encodeFunctionData,
    asLongZeroAddress,
} = require('./utils/web3');

describe('HIP-1340 - EIP-7702 Ethereum Specific tests - delegation setup', function () {
    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, this.network.name, Number(this.network.chainId));
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        await this.testCtx.init();
    });

    describe('EOA delegation setup via type 4 transactions', function () {
        [
            { fn: () => ethers.Wallet.createRandom(), desc: 'Random EVM address' },
            { fn: t => t.testCtx.createAndFundEOA(), desc: 'Pre-funded EOA' },
            { fn: () => deploy('contracts/hip-1340/AlwaysSucceed'), desc: 'Deployed contract that succeeds' },
        ].flatMap(receiver =>
            [
                undefined,
                encodeFunctionData('usedToGenerateSomeCalldata(uint256)', [0x123]),
            ].flatMap(data =>
                [
                    'EXTERNAL',
                    'SELF',
                ].flatMap(trigger =>
                    [
                        0n,
                        1234n,
                    ].flatMap(value =>
                        [
                            { fn: () => 0, desc: 'all chains' },
                            { fn: t => t.network.chainId, desc: 'specific chain id of current network' },
                        ].flatMap(delegateToChainId =>
                            [
                                asLongZeroAddress(1),
                                asLongZeroAddress(0x167),
                                '0x0000000000000000000000000000000000068cDa',
                                '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc',
                            ].flatMap(delegateToAddress => ({ receiver, data, trigger, value, delegateToChainId, delegateToAddress }))))))
        ).forEach(({ receiver, data, trigger, value, delegateToChainId, delegateToAddress }) => {
            it(`should store delegation designator via type 4 transaction to '${receiver.desc}' from ${trigger} when sending '${value !== 0n ? 'non-' : ''}zero (${value} th)' with '${data ? 'data' : 'no data'}' delegating to '${delegateToChainId.desc}' and '${delegateToAddress}'`, async function () {
                const [sender, senderNonce] = [await this.testCtx.createAndFundEOA(), new Nonce()];
                const to = (await receiver.fn(this)).address;
                const [delegated, delegatedNonce] = trigger === 'SELF'
                    ? [sender, senderNonce]
                    : [await this.testCtx.createAndFundEOA(), new Nonce()];

                await sender.sendTransaction({
                    type: 4,
                    chainId: this.network.chainId,
                    nonce: senderNonce.next(),
                    gasLimit: 800_000,
                    value: units.tinybar(value),
                    to,
                    data,
                    authorizationList: [await delegated.authorize({
                        chainId: delegateToChainId.fn(this),
                        nonce: delegatedNonce.next(),
                        address: delegateToAddress,
                    })],
                }).then(tx => tx.wait()).catch(err => log('Transaction failed with error:', err.message));

                for (const [wallet, walletNonce, walletDesc] of [
                    [sender, senderNonce, 'sender'],
                    [delegated, delegatedNonce, 'delegated'],
                ]) {
                    const [_nonce, _ethNonce, ethNonce] = await web3.getNonces(wallet.address);
                    expect(ethNonce).to.be.equal(walletNonce.cur, `Nonce for '${walletDesc}' should be ${walletNonce.cur} but got ${ethNonce}`);
                }

                const [_code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
                expect(contractBytecode).to.be.equal(delegationIndicatorFor(delegateToAddress.toLowerCase()));
                expect(delegationAddress).to.be.equal(delegateToAddress.toLowerCase());
            });
        });
    });

    it(`should not store delegation designator nor increase nonce when chain id doesn't match that of the network`, async function () {
        const sender = await this.testCtx.createAndFundEOA();
        const to = await this.testCtx.createAndFundEOA();
        const delegated = await this.testCtx.createAndFundEOA();

        await sender.sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1) + gas.accountCreationCost(),
            value: units.tinybar(1234n),
            to: to.address,
            authorizationList: [await delegated.authorize({
                chainId: 2,
                nonce: 0,
                address: '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase(),
            })],
        }).then(tx => tx.wait());

        for (const [wallet, walletNonce, walletName] of [
            [sender, 1, 'sender'],
            [delegated, 0, 'delegated'],
        ]) {
            const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(wallet.address);
            expect(ethNonce).to.be.equal(walletNonce, `Nonce for '${walletName}' should be ${walletNonce} but got ${ethNonce}`);
        }

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
        expect(contractBytecode).to.be.equal('0x');
        expect(delegationAddress).to.be.equal('0x');
    });

    it('should replace existing delegation indicator when a second authorization transaction is sent', async function () {
        const firstDelegation = ethers.Wallet.createRandom().address;
        const eoa = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), firstDelegation);
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        const secondDelegation = ethers.Wallet.createRandom().address;
        await (await this.testCtx.createAndFundEOA()).sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: ethNonce,
                address: secondDelegation,
            })],
        }).then(tx => tx.wait());

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(contractBytecode).to.be.equal(delegationIndicatorFor(secondDelegation.toLowerCase()));
        expect(delegationAddress).to.be.equal(secondDelegation.toLowerCase());
    });

    it('should clear existing delegation indicator when delegating to zero address', async function () {
        const eoa = await this.testCtx.authorizeEOADelegation(
            await this.testCtx.createAndFundEOA(),
            ethers.Wallet.createRandom().address
        );
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        await (await this.testCtx.createAndFundEOA()).sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: ethNonce,
                address: asLongZeroAddress(0),
            })],
        }).then(tx => tx.wait());

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(code).to.be.equal('0x');
        expect(contractBytecode).to.be.equal('0x');
        expect(delegationAddress).to.be.equal('0x');
    });

    it(`should use the last authorization when multiple authorizations are sent (and the EOA's nonce should be also incremented multiple times)`, async function () {
        const eoa = await this.testCtx.createAndFundEOA();

        await eoa.sendTransaction({
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(3),
            to: ethers.ZeroAddress,
            authorizationList: [
                await eoa.authorize({ chainId: 0, nonce: 1, address: asLongZeroAddress(1) }),
                await eoa.authorize({ chainId: 0, nonce: 2, address: asLongZeroAddress(2) }),
                await eoa.authorize({ chainId: 0, nonce: 3, address: asLongZeroAddress(3) }),
            ],
        }).then(tx => tx.wait());

        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);
        expect(ethNonce).to.be.equal(4);

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(contractBytecode).to.be.equal(delegationIndicatorFor(asLongZeroAddress(3)));
        expect(delegationAddress).to.be.equal(asLongZeroAddress(3));
    });

    it(`should use the last valid (w.r.t. nonce) authorization when multiple authorizations are sent (and the EOA's nonce should be also incremented accordingly)`, async function () {
        const eoa = await this.testCtx.createAndFundEOA();

        await eoa.sendTransaction({
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(4),
            to: ethers.ZeroAddress,
            authorizationList: [
                await eoa.authorize({ chainId: 0, nonce: 1, address: asLongZeroAddress(1) }),
                await eoa.authorize({ chainId: 0, nonce: 1, address: asLongZeroAddress(0x11) }),
                await eoa.authorize({ chainId: 0, nonce: 2, address: asLongZeroAddress(2) }),
                await eoa.authorize({ chainId: 0, nonce: 4, address: asLongZeroAddress(4) }),
            ],
        }).then(tx => tx.wait());

        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);
        expect(ethNonce).to.be.equal(3);

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(contractBytecode).to.be.equal(delegationIndicatorFor(asLongZeroAddress(2)));
        expect(delegationAddress).to.be.equal(asLongZeroAddress(2));
    });

    it('should authorize delegation of an existing account when exact gas is sent', async function () {
        const delegateToAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const eoa = await this.testCtx.createAndFundEOA();

        await eoa.sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1),
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: delegateToAddress,
            })],
        }).then(tx => tx.wait());

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(contractBytecode).to.be.equal(delegationIndicatorFor(delegateToAddress));
        expect(delegationAddress).to.be.equal(delegateToAddress);
    });

    it.skip('should revert type 4 transaction when not enough gas is sent', async function () {
        const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const eoa = await this.testCtx.createAndFundEOA();

        const tx = eoa.sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.codeAuthorization(1) - 1,
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: delegateAddress,
            })],
        });
        await expect(tx).to.be.rejectedWith(/intrinsic gas too low/);
    });
});
