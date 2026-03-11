const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:eip7702:execution');

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Hip1340TestContext, Nonce } = require('./utils/test-context');

const web3 = require('./utils/web3');
const { deploy, delegationIndicatorFor, encodeFunctionData, asHexUint256, cartesianProduct } = require('./utils/web3');

describe('HIP-1340 - EIP-7702 Ethereum Specific tests - delegated execution', function () {
    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, this.network.name, Number(this.network.chainId));
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        await this.testCtx.init();
    });

    const tests = cartesianProduct(
        ['EXTERNAL', 'SELF'],
        ['EXTERNAL', 'SELF'],
    ).map(([trigger, authSenderTrigger]) => ({ trigger, authSenderTrigger }));

    tests.forEach(({ trigger, authSenderTrigger }) => {
        it(`should get store and logs when a delegated EOA is the target of a transaction from \`${trigger}\` ${authSenderTrigger}`, async function () {
            const value = 42;

            const to = await this.testCtx.createAndFundEOA();
            const from = await this.testCtx.createAndFundEOA();

            const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
            const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
            const eoa = await this.testCtx.createAndFundEOA();

            const [fromNonce, eoaNonce] = [new Nonce(), new Nonce()];
            const [authSender, authNonce] = authSenderTrigger === 'SELF' ? [eoa, eoaNonce] : [from, fromNonce];
            await authSender.sendTransaction({
                type: 4,
                chainId: this.network.chainId,
                nonce: authNonce.next(),
                gasLimit: 800_000,
                value: 321_00000_00000n,
                to,
                authorizationList: [await eoa.authorize({
                    chainId: 0,
                    nonce: eoaNonce.next(),
                    address: smartWallet.address,
                })],
            }).then(tx => tx.wait());

            const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
            expect(contractBytecode).to.be.equal(delegationIndicatorFor(smartWallet.address.toLowerCase()));
            expect(delegationAddress).to.be.equal(smartWallet.address.toLowerCase());

            const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
            const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

            const delegatedExecutionSender = trigger === 'SELF' ? eoa : from;
            const delegatedExecutionSenderNonce = trigger === 'SELF' ? eoaNonce : fromNonce;
            const receipt = await delegatedExecutionSender.sendTransaction({
                chainId: this.network.chainId,
                to: eoa.address,
                nonce: delegatedExecutionSenderNonce.next(),
                gasLimit: 1_500_000,
                data,
            }).then(tx => tx.wait());
            assert(receipt !== null, 'Receipt is null');

            expect(receipt.logs.length).to.be.equal(1);
            expect(receipt.logs[0]).to.deep.include({
                address: storeAndEmit.address,
                topics: [
                    ethers.id('StoreAndEmitEvent(uint256)'),
                    asHexUint256(value),
                ],
            });

            const valueSlot = 0;
            const storedValue = await this.provider.getStorage(storeAndEmit.address, valueSlot);
            expect(storedValue).to.be.equal(asHexUint256(value));
        });
    });

    it('should get store and logs when delegate execution to EOA in the same type 4 transaction', async function () {
        const value = 42;
        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
        const eoa = await this.testCtx.createAndFundEOA();

        const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
        const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

        const receipt = await eoa.sendTransaction({
            type: 4,
            chainId: this.network.chainId,
            nonce: 0,
            gasLimit: 800_000,
            value: 0,
            to: eoa.address,
            data,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: smartWallet.address,
            })],
        }).then(tx => tx.wait());

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(contractBytecode).to.be.equal(delegationIndicatorFor(smartWallet.address.toLowerCase()));
        expect(delegationAddress).to.be.equal(smartWallet.address.toLowerCase());

        expect(receipt.logs.length).to.be.equal(1);
        expect(receipt.logs[0]).to.deep.include({
            address: storeAndEmit.address,
            topics: [
                ethers.id('StoreAndEmitEvent(uint256)'),
                asHexUint256(value),
            ],
        });

        const valueSlot = 0;
        const storedValue = await this.provider.getStorage(storeAndEmit.address, valueSlot);
        expect(storedValue).to.be.equal(asHexUint256(value));
    });

    it('should get storage and logs from the EOA address itself when the EOA self-executes a delegated contract', async function () {
        const value = 42n;
        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const eoa = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), storeAndEmit.address);

        const receipt = await eoa.sendTransaction({
            chainId: this.network.chainId,
            to: eoa.address,
            nonce: 1,
            gasLimit: 1_500_000,
            data: encodeFunctionData('storeAndEmit(uint256 value)', [value]),
        }).then(tx => tx.wait());
        assert(receipt !== null, 'Receipt is null');

        expect(receipt.logs.length).to.be.equal(1);
        expect(receipt.logs[0]).to.deep.include({
            address: eoa.address,
            topics: [
                ethers.id('StoreAndEmitEvent(uint256)'),
                asHexUint256(value),
            ],
        });
    });

    it('should log `msg.sender` and `tx.origin` with code length and hashes from an inner contract call', async function () {
        const senderAndOrigin = await deploy('contracts/hip-1340/SenderAndOrigin', [], undefined, 400_000);
        const sender = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), senderAndOrigin.address);

        const receipt = await sender.sendTransaction({
            chainId: this.network.chainId,
            to: sender.address,
            nonce: 1,
            gasLimit: 400_000,
            data: encodeFunctionData('logSenderAndOrigin()'),
        }).then(tx => tx.wait());
        assert(receipt !== null, 'Receipt is null');

        expect(receipt.logs.length).to.be.equal(2);
        expect(receipt.logs[0]).to.deep.include({
            topics: [
                ethers.id('SenderAndOriginEvent(address,address)'),
                asHexUint256(sender.address.toLowerCase()),
                asHexUint256(sender.address.toLowerCase()),
            ],
        });

        const designator = delegationIndicatorFor(senderAndOrigin.address.toLowerCase());
        expect(receipt.logs[1]).to.deep.include({
            topics: [
                ethers.id('CodeDetailsEvent(uint256,bytes32,uint256,bytes32)'),
                asHexUint256((designator.length - 2) / 2),
                ethers.keccak256(designator),
                asHexUint256((designator.length - 2) / 2),
            ],
        });
        expect(receipt.logs[1].data).to.equal(
            ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [ethers.keccak256(designator)])
        );
    });

    it('should log the result of `codesize` and `codecopy`', async function () {
        const codeSizeAndCopy = await deploy('contracts/hip-1340/CodeSizeAndCopy', [], undefined, 300_000);
        const code = await this.provider.getCode(codeSizeAndCopy.address);
        const sender = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), codeSizeAndCopy.address);

        const receipt = await sender.sendTransaction({
            chainId: this.network.chainId,
            to: sender.address,
            nonce: 1,
            gasLimit: 300_000,
            data: encodeFunctionData('logCodeSizeAndCopy()'),
        }).then(tx => tx.wait());
        assert(receipt !== null, 'Receipt is null');

        const designator = delegationIndicatorFor(codeSizeAndCopy.address.toLowerCase());
        expect(receipt.logs.length).to.be.equal(3);
        expect(receipt.logs[0]).to.deep.include({
            topics: [
                ethers.id('ThisSenderAndOriginEvent(address,address,address)'),
                asHexUint256(sender.address.toLowerCase()),
                asHexUint256(sender.address.toLowerCase()),
                asHexUint256(sender.address.toLowerCase()),
            ],
        });
        expect(receipt.logs[1]).to.deep.include({
            topics: [
                ethers.id('CodeSizeAndCopyEvent(uint256,bytes32)'),
                asHexUint256((designator.length - 2) / 2),
                ethers.keccak256(designator),
            ],
        });
        expect(receipt.logs[2]).to.deep.include({
            topics: [
                ethers.id('CodeSizeAndCopyEvent(uint256,bytes32)'),
                asHexUint256((code.length - 2) / 2),
                asHexUint256(code.slice(0, 2 + 32 * 2)),
            ],
        });
    });
});
