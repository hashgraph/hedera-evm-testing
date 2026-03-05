const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:eip7702');

const { expect } = require('chai');
const { ethers } = require('hardhat');

const web3 = require('./utils/web3');
const { gas, units, deploy, designatorFor, createAndFundEOA, encodeFunctionData, asHexUint256, asAddress } = require('./utils/web3');

class Nonce {
    #val = 0;
    next() {
        return this.#val++;
    }
    get cur() {
        return this.#val;
    }
}

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

    describe('EOA delegation setup via type 4 transactions', function () {
        [
            { fn: () => ethers.Wallet.createRandom(), desc: 'Random EVM address' },
            { fn: () => createAndFundEOA(), desc: 'Pre-funded EOA' },
            { fn: () => deploy('contracts/hip-1340/AlwaysSucceed'), desc: 'Deployed contract that succeeds' },
            // TODO(pectra): To be enabled when Pectra feature branch supports contract revert in type 4 transactions
            // { fn: () => deploy('contracts/hip-1340/AlwaysRevert'), desc: 'Deployed contract that reverts' },
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
                            { fn: () => network.chainId, desc: 'specific chain id of current network' },
                        ].flatMap(delegateToChainId =>
                            [
                                asAddress(1), // a precompile addresses https://www.evm.codes/precompiled?fork=prague
                                asAddress(0x167), // a system contract address https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
                                '0x0000000000000000000000000000000000068cDa', // Long-zero address
                                '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc', // Random address
                            ].flatMap(delegateToAddress => ({ receiver, data, trigger, value, delegateToChainId, delegateToAddress }))))))
        ).forEach(({ receiver, data, trigger, value, delegateToChainId, delegateToAddress }) => {
            it(`should store delegation designator via type 4 transaction to '${receiver.desc}' from ${trigger} when sending '${value !== 0n ? 'non-' : ''}zero (${value} th)' with '${data ? 'data' : 'no data'}' delegating to '${delegateToChainId.desc}' and '${delegateToAddress}'`, async function () {
                const [sender, senderNonce] = [await createAndFundEOA(), new Nonce()];
                const to = (await receiver.fn()).address;
                const [delegated, delegatedNonce] = trigger === 'SELF'
                    ? [sender, senderNonce]
                    : [await createAndFundEOA(), new Nonce()];

                log('Sending %s th to %s from %s and delegating %s to %s', value, to, sender.address, delegated.address, delegateToAddress);
                // In the transaction revert case, Hardhat throws an error when sending the transaction
                await sender.sendTransaction({
                    type: 4,
                    chainId: network.chainId,
                    nonce: senderNonce.next(),
                    gasLimit: 800_000,
                    value: units.tinybar(value),
                    to,
                    data,
                    authorizationList: [await delegated.authorize({
                        chainId: delegateToChainId.fn(),
                        nonce: delegatedNonce.next(),
                        address: delegateToAddress,
                    })],
                }).then(tx => tx.wait()).catch(err => log('Transaction failed with error:', err.message));

                for (const [wallet, walletNonce, walletDesc] of [
                    [sender, senderNonce, 'sender'],
                    [delegated, delegatedNonce, 'delegated'],
                ]) {
                    const [nonce, eth_nonce, ethNonce] = await web3.getNonces(wallet.address)
                    log(walletDesc, 'is', wallet.address, 'CN nonce is', ethNonce, 'expected', walletNonce.cur);
                    // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
                    // expect(nonce).to.be.equal(walletNonce.cur);
                    // expect(eth_nonce).to.be.equal(walletNonce.cur);
                    expect(ethNonce).to.be.equal(walletNonce.cur, `Nonce for '${walletDesc}' should be ${walletNonce.cur} but got ${ethNonce}`);
                }

                const [code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
                // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
                // expect(code).to.be.equal(designatorFor(address.toLowerCase()));
                expect(contractBytecode).to.be.equal(designatorFor(delegateToAddress.toLowerCase()));
                expect(delegationAddress).to.be.equal(delegateToAddress.toLowerCase());
            });
        });
    });

    it(`should not store delegation designator nor increase nonce when chain id doesn't match that of the network`, async function () {
        const sender = await createAndFundEOA();
        const to = await createAndFundEOA();
        const delegated = await createAndFundEOA();

        await sender.sendTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1) + gas.hollow(),
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
            const [nonce, eth_nonce, ethNonce] = await web3.getNonces(wallet.address)
            // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
            // expect(nonce).to.be.equal(walletNonce);
            // expect(eth_nonce).to.be.equal(walletNonce);
            expect(ethNonce).to.be.equal(walletNonce, `Nonce for '${walletName}' should be ${walletNonce} but got ${ethNonce}`);
        }

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal('0x');
        expect(contractBytecode).to.be.equal('0x');
        expect(delegationAddress).to.be.equal('0x');
    });

    [0n, 10_000n * 1_00000_00000n].forEach(value => {
        it(`should run no-op with value ${value} when delegating to HTS system contract`, async function () {
            const sender = await createAndFundEOA();
            const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), asAddress(0x167));
            const balance = await provider.getBalance(eoa.address);
            const data = encodeFunctionData('approve(address token, address spender, uint256 amount)', [eoa.address, sender.address, 1000]);

            const receipt = await sender.sendTransaction({
                chainId: network.chainId,
                nonce: 0,
                gasLimit: 100_000,
                value,
                data,
                to: eoa.address,
            }).then(tx => tx.wait());

            expect(await provider.getBalance(eoa.address, receipt.blockNumber)).to.be.equal(balance + value);
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

            const [fromNonce, eoaNonce] = [new Nonce(), new Nonce()];
            // Delegation
            const [authSender, authNonce] = authSenderTrigger === 'SELF' ? [eoa, eoaNonce] : [from, fromNonce];
            await authSender.sendTransaction({
                type: 4,
                chainId: network.chainId,
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
            const receipt = await delegatedExecutionSender.sendTransaction({
                chainId: network.chainId,
                to: eoa.address,
                nonce: delegatedExecutionSenderNonce.next(),
                gasLimit: 1_500_000,
                data,
            }).then(tx => tx.wait());
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

    it('should get store and logs when delegate execution to EOA in the same type 4 transaction', async function () {
        const value = 42;
        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
        const eoa = await createAndFundEOA();

        // Prepare execution data
        const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
        const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

        // Delegation and execution in the same transaction
        const receipt = await eoa.sendTransaction({
            type: 4,
            chainId: network.chainId,
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

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
        expect(contractBytecode).to.be.equal(designatorFor(smartWallet.address.toLowerCase()));
        expect(delegationAddress).to.be.equal(smartWallet.address.toLowerCase());

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

    it('should transfer ERC20 tokens when EOAs send transactions to themselves', async function () {
        const erc20 = await deploy('contracts/hip-1340/ERC20Mintable', ['Test', 'TST', 10_000_000n]);
        await erc20.contract.mint(50_000n).then(tx => tx.wait());
        await new Promise(resolve => setTimeout(resolve, 4000));

        const minterBalance = await erc20.contract.balanceOf(erc20.deployer.address);
        log('Minter balance:', minterBalance);
        assert(minterBalance === 50_000n + 10_000_000n, `Minter balance should be \`initialSupply+mint amount\` but got ${minterBalance}`);

        const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
        const eoa1 = await web3.authorizeEOADelegation(await createAndFundEOA(), smartWallet.address);
        const eoa2 = await web3.authorizeEOADelegation(await createAndFundEOA(), smartWallet.address);

        await erc20.contract.transfer(eoa1.address, 5_000n).then(tx => tx.wait());
        const eoa1Balance = await erc20.contract.balanceOf(eoa1.address);
        assert(eoa1Balance === 5_000n, `EOA1 balance should be 5_000 but got ${eoa1Balance}`);

        await erc20.contract.transfer(eoa2.address, 7_000n, { nonce: 3 }).then(tx => tx.wait());
        const eoa2Balance = await erc20.contract.balanceOf(eoa2.address);
        assert(eoa2Balance === 7_000n, `EOA2 balance should be 7_000 but got ${eoa2Balance}`);

        const receiver = ethers.Wallet.createRandom().address;

        const eoa1Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 1_500n]);
        await eoa1.sendTransaction({
            chainId: network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa1.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa1Call]),
        }).then(tx => tx.wait());

        const eoa2Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 2_300n]);
        await eoa2.sendTransaction({
            chainId: network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa2.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa2Call]),
        }).then(tx => tx.wait());

        const eoa1BalanceAfter = await erc20.contract.balanceOf(eoa1.address);
        expect(eoa1BalanceAfter).to.be.equal(3_500n, `EOA1 balance should be 3_500 but got ${eoa1BalanceAfter}`);

        const eoa2BalanceAfter = await erc20.contract.balanceOf(eoa2.address);
        expect(eoa2BalanceAfter).to.be.equal(4_700n, `EOA2 balance should be 4_700 but got ${eoa2BalanceAfter}`);

        const receiverBalance = await erc20.contract.balanceOf(receiver);
        expect(receiverBalance).to.be.equal(3_800n, `Receiver balance should be 3_800 but got ${receiverBalance}`);
    });

    it('should get storage and logs from the EOA address itself when the EOA self-executes a delegated contract', async function () {
        const value = 42n;
        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), storeAndEmit.address);

        const receipt = await eoa.sendTransaction({
            chainId: network.chainId,
            to: eoa.address,
            nonce: 1,
            gasLimit: 1_500_000,
            data: encodeFunctionData('storeAndEmit(uint256 value)', [value]),
        }).then(tx => tx.wait());
        log('Transaction receipt', receipt);
        assert(receipt !== null, 'Receipt is null');

        log('Logs', receipt.logs);
        expect(receipt.logs.length).to.be.equal(1);
        expect(receipt.logs[0]).to.deep.include({
            address: eoa.address,
            topics: [
                ethers.id('StoreAndEmitEvent(uint256)'),
                asHexUint256(value),
            ],
        });

        const valueSlot = 0;
        const storedValue = await provider.getStorage(storeAndEmit.address, valueSlot);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(storedValue).to.be.equal(asHexUint256(value), `Stored value at '${storeAndEmit.address}:${valueSlot}' should be '${value}' but got '${BigInt(storedValue)}'`);
    });

    [
        false,
        true,
    ].forEach(receiverSameAsDelegated => {
        it(`should create the account when an EOA sponsors it receiverSameAsDelegated=${receiverSameAsDelegated}`, async function () {
            const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
            const value = 10n * 1_00000_00000n;
            const sender = await createAndFundEOA();
            const delegated = ethers.Wallet.createRandom();
            const [to, initialValue] = !receiverSameAsDelegated
                ? [await createAndFundEOA(), 10_000_000_000n * 1000_0000_0000n]
                : [delegated, 0n];

            await sender.sendTransaction({
                chainId: network.chainId,
                nonce: 0,
                gasLimit: gas.base + gas.auth(1) + gas.hollow(),
                value,
                to,
                authorizationList: [await delegated.authorize({
                    chainId: 0,
                    nonce: 0,
                    address: delegateAddress,
                })],
            }).then(tx => tx.wait());

            expect(await provider.getBalance(to.address)).to.be.equal(initialValue + value);

            for (const [wallet, walletNonce, walletName] of [
                [sender, 1, 'sender'],
                [delegated, 1, 'delegated'],
            ]) {
                const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(wallet.address)
                // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
                // expect(nonce).to.be.equal(1);
                // expect(eth_nonce).to.be.equal(1);
                expect(ethNonce).to.be.equal(walletNonce, `Nonce for '${walletName}' should be ${walletNonce} but got ${ethNonce}`);
            }

            const [_code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
            // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
            // expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
            expect(contractBytecode).to.be.equal(designatorFor(delegateAddress));
            expect(delegationAddress).to.be.equal(delegateAddress);
        });
    });

    it('should replace existing delegation indicator when a second authorization transaction is sent', async function () {
        const firstDelegation = ethers.Wallet.createRandom().address;
        const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), firstDelegation);
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        const secondDelegation = ethers.Wallet.createRandom().address;
        await (await createAndFundEOA()).sendTransaction({
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
        }).then(tx => tx.wait());

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(secondDelegation.toLowerCase()));
        expect(contractBytecode).to.be.equal(designatorFor(secondDelegation.toLowerCase()));
        expect(delegationAddress).to.be.equal(secondDelegation.toLowerCase());
    });

    it('should clear existing delegation indicator when delegating to zero address', async function () {
        const eoa = await web3.authorizeEOADelegation(await createAndFundEOA(), ethers.Wallet.createRandom().address);
        const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(eoa.address);

        await (await createAndFundEOA()).sendTransaction({
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
        }).then(tx => tx.wait());

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        expect(code).to.be.equal('0x');
        expect(contractBytecode).to.be.equal('0x');
        expect(delegationAddress).to.be.equal('0x');
    });

    it(`should use the last authorization when multiple authorizations are sent (and the EOA's nonce should be also incremented multiple times)`, async function () {
        const eoa = await createAndFundEOA();

        await eoa.sendTransaction({
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
        }).then(tx => tx.wait());

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

    it(`should use the last valid (w.r.t. nonce) authorization when multiple authorizations are sent (and the EOA's nonce should be also incremented accordingly)`, async function () {
        const eoa = await createAndFundEOA();

        await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(4),
            to: ethers.ZeroAddress,
            authorizationList: [
                await eoa.authorize({
                    chainId: 0,
                    nonce: 1,
                    address: asAddress(1),
                }),
                await eoa.authorize({
                    chainId: 0,
                    nonce: 1,
                    address: asAddress(0x11),
                }),
                await eoa.authorize({
                    chainId: 0,
                    nonce: 2,
                    address: asAddress(2),
                }),
                await eoa.authorize({
                    chainId: 0,
                    nonce: 4,
                    address: asAddress(4),
                }),
            ],
        }).then(tx => tx.wait());

        const [nonce, eth_nonce, ethNonce] = await web3.getNonces(eoa.address)
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(nonce).to.be.equal(3);
        // expect(eth_nonce).to.be.equal(3);
        expect(ethNonce).to.be.equal(3);

        const [code, contractBytecode, delegationAddress] = await web3.getCodes(eoa.address);
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // expect(code).to.be.equal(designatorFor(asAddress(2)));
        expect(contractBytecode).to.be.equal(designatorFor(asAddress(2)));
        expect(delegationAddress).to.be.equal(asAddress(2));
    });

    it('should authorize delegation of an existing account when exact gas is sent', async function () {
        const delegateToAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
        const eoa = await createAndFundEOA();

        await eoa.sendTransaction({
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
        }).then(tx => tx.wait());

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

        const tx = eoa.sendTransaction({
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
        await expect(tx).to.be.rejectedWith(/intrinsic gas too low/);
    });

    it('should log `msg.sender` and `tx.origin` with code length and hashes from an inner contract call', async function () {
        const senderAndOrigin = await deploy('contracts/hip-1340/SenderAndOrigin', [], undefined, 400_000);
        const sender = await web3.authorizeEOADelegation(await createAndFundEOA(), senderAndOrigin.address);

        const receipt = await sender.sendTransaction({
            chainId: network.chainId,
            to: sender.address,
            nonce: 1,
            gasLimit: 400_000,
            data: encodeFunctionData('logSenderAndOrigin()'),
        }).then(tx => tx.wait());
        log('Transaction receipt', receipt);
        assert(receipt !== null, 'Receipt is null');

        log('Logs', receipt.logs);
        expect(receipt.logs.length).to.be.equal(3);
        expect(receipt.logs[0]).to.deep.include({
            topics: [
                ethers.id('SenderAndOriginEvent(address,address)'),
                asHexUint256(sender.address.toLowerCase()),
                asHexUint256(sender.address.toLowerCase()),
            ],
        });

        const designator = designatorFor(senderAndOrigin.address.toLowerCase());
        [1, 2].forEach(i => {
            expect(receipt.logs[i]).to.deep.include({
                topics: [
                    ethers.id('CodeLengthAndHashEvent(uint256,bytes32)'),
                    asHexUint256((designator.length - 2) / 2),
                    ethers.keccak256(designator),
                ],
            });
        });
    });

    it('should log the result of `codesize` and `codecopy`', async function () {
        const codeSizeAndCopy = await deploy('contracts/hip-1340/CodeSizeAndCopy', [], undefined, 300_000);
        const code = await provider.getCode(codeSizeAndCopy.address);
        const sender = await web3.authorizeEOADelegation(await createAndFundEOA(), codeSizeAndCopy.address);

        const receipt = await sender.sendTransaction({
            chainId: network.chainId,
            to: sender.address,
            nonce: 1,
            gasLimit: 300_000,
            data: encodeFunctionData('logCodeSizeAndCopy()'),
        }).then(tx => tx.wait());
        log('Transaction receipt', receipt);
        assert(receipt !== null, 'Receipt is null');

        const designator = designatorFor(codeSizeAndCopy.address.toLowerCase());
        log('Logs', receipt.logs);
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
