const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:eip7702');

const { expect } = require('chai');
const { ethers } = require('hardhat');
const sdk = require('@hiero-ledger/sdk');

const { MirrorNode } = require('evm-functional-testing/mirror-node');
const { getAccountInfo, getContractByteCode, getTransactionRecord, getAccountRecords } = require('./utils/sdk');
const web3 = require('./utils/web3');
const { gas, deploy, designatorFor, createAndFundEOA, encodeFunctionData, asHexUint256, waitFor, asAddress } = require('./utils/web3');

describe('HIP-1340 - EIP-7702 features', function () {

    /** @type {ethers.JsonRpcProvider} */
    let provider;

    /** @type {ethers.Network} */
    let network;

    before(async function () {
        provider = (await ethers.getSigners())[0].provider;
        network = await provider.getNetwork();
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, network.name, Number(network.chainId));
    });

    it('should create and fund an EOA to ensure account creation is successful', async function () {
        const sender = await createAndFundEOA();
        expect(await web3.getNonces(sender.address)).to.be.deep.equal([0, 0, 0]);
        expect(await provider.getBalance(sender.address)).to.be.equal(1000_0000_0000n * 1_00000_00000n);
    });

    describe('EOA delegation setup via type 4 transactions', function () {

        [
            { fn: () => ethers.Wallet.createRandom(), desc: 'Random EVM address' },
            { fn: () => createAndFundEOA(), desc: 'Pre-funded EOA' },
        ].flatMap(receiver =>
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
                        { fn: () => network.chainId, desc: 'specific chain id of current network' },
                    ].flatMap(delegateToChainId =>
                        [
                            asAddress(1), // a precompile addresses https://www.evm.codes/precompiled?fork=prague
                            asAddress(0x167), // a system contract address https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
                            '0x0000000000000000000000000000000000068cDa', // Long-zero address
                            '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc', // Random address
                        ].flatMap(delegateToAddress => ({ receiver, trigger, value, delegateToChainId, delegateToAddress })))))
        ).forEach(({ receiver, trigger, value, delegateToChainId, delegateToAddress }) => {
            it(`should store delegation designator via type 4 transaction to '${receiver.desc}' from ${trigger} when sending '${value !== 0n ? 'non-' : ''}zero (${value} th)' delegating to '${delegateToChainId.desc}' and '${delegateToAddress}'`, async function () {
                const sender = await createAndFundEOA();
                const to = (await receiver.fn()).address;
                const [delegated, authNonce] = trigger === 'SELF'
                    ? [sender, 1]
                    : [await createAndFundEOA(), 0];

                log('Sending %s th to %s from %s and delegating %s to %s', value, to, sender.address, delegated.address, delegateToAddress);
                const tx = {
                    type: 4,
                    chainId: network.chainId,
                    nonce: 0,
                    maxFeePerGas: ethers.parseUnits('710', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
                    gasLimit: 800_000,
                    value: value * 1_00000_00000n,
                    to,
                    authorizationList: [await delegated.authorize({
                        chainId: delegateToChainId.fn(),
                        nonce: authNonce,
                        address: delegateToAddress,
                    })],
                };
                const resp = await sender.sendTransaction(tx);
                log('receipt', resp.hash);
                let txhash;
                try {
                    await resp.wait();
                } catch (err) {
                    log('Fetch transaction receipt failed:', err.message);
                    txhash = err.replacement.hash;
                }

                const result = await new MirrorNode().getContractResults(txhash);
                const { transactions } = await new MirrorNode().getTransactionsByTimestamp(result.timestamp);
                const transactionId = transactions[0].transaction_id.replace('0.0.2-', '0.0.2@').replace('-', '.');
                log('Authorization sent in transaction', resp.hash, transactionId);

                const [code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
                // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
                // expect(code).to.be.equal(designatorFor(address.toLowerCase()));
                expect(contractBytecode).to.be.equal(designatorFor(delegateToAddress.toLowerCase()));
                expect(delegationAddress).to.be.equal(delegateToAddress.toLowerCase());
            });
        });
    });

    [0n, 10_000n * 1_00000_00000n].forEach(value => {
        it(`should run no-op with value ${value} when delegating to HTS system contract`, async function () {
            const sender = await createAndFundEOA();
            const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), asAddress(0x167));
            const balance = await provider.getBalance(eoa.address);
            const data = encodeFunctionData('approve(address token, address spender, uint256 amount)', [eoa.address, sender.address, 1000]);

            const tx = await sender.sendTransaction({
                chainId: network.chainId,
                nonce: 0,
                gasLimit: 100_000,
                value,
                data,
                to: eoa.address,
            });
            const resp = await tx.wait();
            assert(resp !== null);

            expect(await provider.getBalance(eoa.address, resp.blockNumber)).to.be.equal(balance + value);
        });
    });

    [
        'EXTERNAL',
        'SELF',
    ].flatMap(trigger =>
        [
            'EXTERNAL',
            'SELF',
        ].flatMap(authSenderTrigger => ({ trigger, authSenderTrigger }))
    ).forEach(({ trigger, authSenderTrigger }) => {
        it(`should get store and logs when a delegated EOA is the target of a transaction from \`${trigger}\` ${authSenderTrigger}`, async function () {
            const value = 42;

            const to = await createAndFundEOA();
            const from = await createAndFundEOA();

            const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
            const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
            const eoa = await createAndFundEOA();

            class Nonce {
                #val = 0;
                next() {
                    return this.#val++;
                }
                get cur() {
                    return this.#val;
                }
            }

            const [fromNonce, eoaNonce] = [new Nonce(), new Nonce()];
            // Delegation
            const [authSender, authNonce] = authSenderTrigger === 'SELF' ? [eoa, eoaNonce] : [from, fromNonce];
            const authtx = {
                type: 4,
                chainId: network.chainId,
                nonce: authNonce.next(),
                maxFeePerGas: ethers.parseUnits('710', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
                gasLimit: 800_000,
                value: 321_00000_00000n,
                to,
                authorizationList: [await eoa.authorize({
                    chainId: 0,
                    nonce: eoaNonce.next(),
                    address: smartWallet.address,
                })],
            };
            log('Transaction', authtx);
            const resp = await authSender.sendTransaction(authtx);
            await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

            const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
            // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
            // expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
            expect(contractBytecode).to.be.equal(designatorFor(smartWallet.address.toLowerCase()));
            expect(delegationAddress).to.be.equal(smartWallet.address.toLowerCase());

            // Execution
            const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
            const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

            const [delegatedExecutionSender, delegatedExecutionSenderNonce] = trigger === 'SELF' ? [eoa, eoaNonce] : [from, fromNonce];
            log('Sending delegated execution transaction to %s from %s with nonce %s', eoa.address, delegatedExecutionSender.address, delegatedExecutionSenderNonce.cur);
            const tx = await delegatedExecutionSender.sendTransaction({
                chainId: network.chainId,
                to: eoa.address,
                nonce: delegatedExecutionSenderNonce.next(),
                gasLimit: 1_500_000,
                data,
            });
            const receipt = await tx.wait();
            log('Transaction receipt', receipt);
            assert(receipt !== null, 'Receipt is null');

            log('Logs', receipt.logs);
            expect(receipt.logs.length).to.be.equal(1);
            expect(receipt.logs[0]).to.deep.include({
                address: storeAndEmit.address,
                topics: [
                    ethers.id('StoreAndEmitEvent(uint256)'),
                    asHexUint256(value),
                ],
            });

            const valueSlot = 0;
            const storedValue = await provider.getStorage(storeAndEmit.address, valueSlot);
            log('Stored value at %s:%s is %s', storeAndEmit.address, valueSlot, storedValue);
            expect(storedValue).to.be.equal(asHexUint256(value));
        });

    });

    it('should transfer HTS and ERC20 tokens when EOAs send transactions to themselves', async function () {
        const erc20 = await deploy('contracts/hip-1340/ERC20Mintable', ['Test', 'TST', 10_000_000n]);
        const tx = await erc20.contract.mint(50_000n);
        await tx.wait();
        await new Promise(resolve => setTimeout(resolve, 4000));

        const minterBalance = await erc20.contract.balanceOf(erc20.deployer.address);
        log('Minter balance:', minterBalance);
        assert(minterBalance === 50_000n + 10_000_000n, `Minter balance should be \`initialSupply+mint amount\` but got ${minterBalance}`);

        const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
        const eoa1 = await web3.authorizeEOADelegation(await createAndFundEOA(), smartWallet.address);
        const eoa2 = await web3.authorizeEOADelegation(await createAndFundEOA(), smartWallet.address);

        await waitFor(erc20.contract.transfer(eoa1.address, 5_000n));
        const eoa1Balance = await erc20.contract.balanceOf(eoa1.address);
        assert(eoa1Balance === 5_000n, `EOA1 balance should be 5_000 but got ${eoa1Balance}`);

        await waitFor(erc20.contract.transfer(eoa2.address, 7_000n, { nonce: 3 }));
        const eoa2Balance = await erc20.contract.balanceOf(eoa2.address);
        assert(eoa2Balance === 7_000n, `EOA2 balance should be 7_000 but got ${eoa2Balance}`);

        const receiver = ethers.Wallet.createRandom().address;

        const eoa1Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 1_500n]);
        await waitFor(eoa1.sendTransaction({
            chainId: network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa1.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa1Call]),
        }));

        const eoa2Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 2_300n]);
        await waitFor(eoa2.sendTransaction({
            chainId: network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa2.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa2Call]),
        }));

        const eoa1BalanceAfter = await erc20.contract.balanceOf(eoa1.address);
        expect(eoa1BalanceAfter).to.be.equal(3_500n, `EOA1 balance should be 3_500 but got ${eoa1BalanceAfter}`);

        const eoa2BalanceAfter = await erc20.contract.balanceOf(eoa2.address);
        expect(eoa2BalanceAfter).to.be.equal(4_700n, `EOA2 balance should be 4_700 but got ${eoa2BalanceAfter}`);

        const receiverBalance = await erc20.contract.balanceOf(receiver);
        expect(receiverBalance).to.be.equal(3_800n, `Receiver balance should be 3_800 but got ${receiverBalance}`);
    });

    it('should create the account when an EOA sponsors it', async function () {
        const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const value = 10n * 1_00000_00000n;
        const eoa = await createAndFundEOA();
        const to = await createAndFundEOA();
        const receiver = ethers.Wallet.createRandom();

        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            value,
            to,
            authorizationList: [await receiver.authorize({
                chainId: 0,
                nonce: 0,
                address: delegateAddress,
            })],
        });
        await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

        expect(await provider.getBalance(to.address)).to.be.equal(1000_0000_0000n * 10_000_000_000n + value);

        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(receiver.address)
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(nonce).to.be.equal(1);
        // expect(eth_nonce).to.be.equal(1);
        expect(ethNonce).to.be.equal(1);

        const [_code, contractBytecode, delegationAddress] = await web3.getCodes(receiver.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
        expect(contractBytecode).to.be.equal(designatorFor(delegateAddress));
        expect(delegationAddress).to.be.equal(delegateAddress);
    });

    it('should replace existing delegation indicator when a second authorization transaction is sent', async function () {
        const firstDelegation = ethers.Wallet.createRandom().address;
        const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), firstDelegation);
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        const secondDelegation = ethers.Wallet.createRandom().address;
        const resp = await (await createAndFundEOA()).sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: ethNonce,
                address: secondDelegation,
            })],
        });
        await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(secondDelegation.toLowerCase()));
        expect(contractBytecode).to.be.equal(designatorFor(secondDelegation.toLowerCase()));
        expect(delegationAddress).to.be.equal(secondDelegation.toLowerCase());
    });

    it('should clear existing delegation indicator when delegating to zero address', async function () {
        const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), ethers.Wallet.createRandom().address);
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        const resp = await (await createAndFundEOA()).sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: ethNonce,
                address: asAddress(0),
            })],
        });
        await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(code).to.be.equal('0x');
        expect(contractBytecode).to.be.equal('0x');
        expect(delegationAddress).to.be.equal('0x');
    });

    it('should use the last authorization when multiple authorizations are sent', async function () {
        const eoa = await createAndFundEOA();

        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(3),
            to: ethers.ZeroAddress,
            authorizationList: [
                await eoa.authorize({
                    chainId: 0,
                    nonce: 1,
                    address: asAddress(1),
                }),
                await eoa.authorize({
                    chainId: 0,
                    nonce: 2,
                    address: asAddress(2),
                }),
                await eoa.authorize({
                    chainId: 0,
                    nonce: 3,
                    address: asAddress(3),
                }),
            ],
        });
        await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

        const [nonce, eth_nonce, ethNonce] = await web3.getNonces(eoa.address)
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(nonce).to.be.equal(4);
        // expect(eth_nonce).to.be.equal(4);
        expect(ethNonce).to.be.equal(4);

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(asAddress(3)));
        expect(contractBytecode).to.be.equal(designatorFor(asAddress(3)));
        expect(delegationAddress).to.be.equal(asAddress(3));
    });

    it('should authorize delegation of an existing account when exact gas is sent', async function () {
        const delegateToAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const eoa = await createAndFundEOA();

        const resp = await eoa.sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: delegateToAddress,
            })],
        });
        await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(delegateAddress));
        expect(contractBytecode).to.be.equal(designatorFor(delegateToAddress));
        expect(delegationAddress).to.be.equal(delegateToAddress);
    });

    // TODO(pectra): Enable once intrinsic gas checks are implemented in the Relay
    it.skip('should revert type 4 transaction when not enough gas is sent', async function () {
        const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const eoa = await createAndFundEOA();

        const resp = eoa.sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1) - 1,
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: delegateAddress,
            })],
        });
        await expect(resp).to.be.rejectedWith(/intrinsic gas too low/);
    });
});
