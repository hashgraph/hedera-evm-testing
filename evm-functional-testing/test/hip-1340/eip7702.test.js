const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340');

const { expect } = require('chai');
const { ethers } = require('hardhat');
const sdk = require('@hiero-ledger/sdk');

const { MirrorNode } = require('evm-functional-testing/mirror-node');
const { getAccountInfo, getContractByteCode, getTransactionRecord, getAccountRecords } = require('./utils/sdk');
const { gas, deploy, designatorFor, createAndFundEOA, encodeFunctionData, asHexUint256, waitFor, asAddress } = require('./utils/web3');

/**
 * https://www.evm.codes/precompiled?fork=prague
 */
const precompiledAddresses = [...Array(0x11).keys()].map(i => asAddress(i + 1));

/**
 * https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
 */
const systemContractAddresses = [0x167, 0x168, 0x169, 0x16a, 0x16b, 0x16c].map(asAddress);

/**
 * A delegate address used in multiple tests.
 */
const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc';

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
        expect(await sender.getNonce()).to.be.equal(0);
        expect(await provider.getBalance(sender.address)).to.be.equal(1000_0000_0000n * 1_00000_00000n);
    });

    describe('EOA delegation setup via type 4 transactions', function () {

        [
            'HOLLOW',
            'FUNDED',
        ].flatMap(toKind =>
        [
            'EXTERNAL',
            'SELF',
        ].flatMap(trigger =>
        [
            0n,
            1234n,
        ].flatMap(value =>
        [
            asAddress(1), // Precompile addresses
            asAddress(0x167), // System Contract address
            '0x0000000000000000000000000000000000068cDa', // Long-zero address
            '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc', // Random address
        ].flatMap(address => ({ toKind, trigger, value, address }))))
        ).forEach(({ toKind, trigger, value, address }) => {
            it(`should store delegation designator ${toKind} ${trigger} for EOA to ${address} via a type4 transaction sending ${value} th`, async function () {
                const sender = await createAndFundEOA();
                const receiver = toKind === 'FUNDED' ? await createAndFundEOA() : ethers.Wallet.createRandom();
                const [delegated, authNonce] = trigger === 'SELF'
                    ? [sender, 1]
                    : [await createAndFundEOA(), 0];

                log('Sending %s th to %s from %s and delegating %s to %s', value, receiver.address, sender.address, delegated.address, address);
                const tx = {
                    type: 4,
                    chainId: network.chainId,
                    nonce: 0,
                    maxFeePerGas: ethers.parseUnits('710', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
                    gasLimit: 800_000,
                    value: value * 1_00000_00000n,
                    to: receiver.address,
                    authorizationList: [await delegated.authorize({
                        chainId: 0,
                        nonce: authNonce,
                        address,
                    })],
                };
                const resp = await sender.sendTransaction(tx);
                log('receipt', resp.hash); 
                let txhash;
                try {
                    await resp.wait();
                } catch (e) {
                    // console.error('Transaction failed to wait', e);
                    // console.error('replacement hash', e.replacement.hash);
                    txhash = e.replacement.hash;
                }

                const result = await new MirrorNode().getContractResults(txhash);
                const { transactions } = await new MirrorNode().getTransactionsByTimestamp(result.timestamp);
                const transactionId = transactions[0].transaction_id.replace('0.0.2-', '0.0.2@').replace('-', '.');
                log('Authorization sent in transaction', resp.hash, transactionId);

                const { account } = await new MirrorNode().getAccount(delegated.address);
                const contractBytecode = await getContractByteCode(account);
                expect(Buffer.from(contractBytecode).toString('hex')).to.be.equal(designatorFor(address.toLowerCase()).slice(2));
                
                const { delegationAddress } = await getAccountInfo(account);
                expect(Buffer.from(delegationAddress).toString('hex')).to.be.equal(address.toLowerCase().slice(2));

                // TODO: Reenable check once MN and Relay include support for EIP-7702
                // const code = await provider.getCode(delegated.address);
                // expect(code).to.be.equal(designatorFor(address.toLowerCase()));
            });
        });
    });

    [0n, 10_000n].forEach(value => {
        it.skip(`should run no-op with value ${value} when delegating to HTS system contract`, async function () {
            const sender = await createAndFundEOA();
            const eoa = await createAndFundEOA(asAddress(0x167));
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

    ['EXTERNAL', 'SELF'].forEach(trigger => {
    it.skip(`should get store and logs when a delegated EOA is the target of a transaction from \`${trigger}\``, async function () {
        const value = 42;

        const to = await createAndFundEOA();
        const from = await createAndFundEOA();

        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const smartWallet = await deploy('@account-abstraction/contracts/accounts/Simple7702Account');

        // const eoa = await createAndFundEOA(smartWallet.address);
        const eoa = await createAndFundEOA();

        const n = await eoa.getNonce();
        console.log('EOA nonce', n);

        const authtx = {
            type: 4,
            chainId: network.chainId,
            nonce: 0,
            maxFeePerGas: ethers.parseUnits('710', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
            gasLimit: 800_000,
            value: 321_00000_00000n,
            to,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 0,
                address: smartWallet.address,
            })],
        };
        log('Transaction', authtx); 
        const resp = await from.sendTransaction(authtx);

            let txhash;
            try {
                await resp.wait();
            } catch (e) {
                console.error('Transaction failed to wait', e);
                console.error('replacement hash', e.replacement.hash);
                txhash = e.replacement.hash;
            }


            const { account } = await new MirrorNode().getAccount(eoa.address);
            const query = await getContractByteCode(account);
            console.log('contract code query', Buffer.from(query).toString('hex'));

            // const acc = await getAccountInfo(account);
            // console.log('account info', acc);
            // console.log('account info delegationAddress', Buffer.from(acc.delegationAddress).toString('hex'));

        const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
        const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

        // const tx = await eoa.sendTransaction({
        const tx = await (trigger === 'SELF' ? eoa : from).sendTransaction({
            chainId: network.chainId,
            to: eoa.address,
            nonce: 1,
            gasLimit: 1_500_000,
            data,
        });
        // const receipt = await tx.wait();
        let receipt;
            try {
                receipt = await tx.wait();
                console.error('replacement hash exec try', receipt.hash);
            } catch (e) {
                console.error('Transaction failed to wait exec', e);
                // console.error('replacement hash exec catch', e.replacement.hash);
                // txhash = e.replacement.hash;
                receipt = e.receipt;
            }

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
        log('Storage', storedValue);
        expect(storedValue).to.be.equal(asHexUint256(value));
    });

    });

    it.skip('should transfer HTS and ERC20 tokens when EOAs send transactions to themselves', async function () {
        const erc20 = await deploy('contracts/hip-1340/ERC20Mintable', ['Test', 'TST', 10_000_000n]);
        await erc20.contract.mint(50_000n);
        const minterBalance = await erc20.contract.balanceOf(erc20.deployer.address);
        log('Minter balance:', minterBalance);
        assert(minterBalance === 50_000n + 10_000_000n, `Minter balance should be \`initialSupply+mint amount\` but got ${minterBalance}`);

        const smartWallet = await deploy('@account-abstraction/contracts/accounts/Simple7702Account');
        const eoa1 = await createAndFundEOA(smartWallet.address);
        const eoa2 = await createAndFundEOA(smartWallet.address);

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
            gasLimit: 1_500_000,
            to: eoa1.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa1Call]),
        }));

        const eoa2Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 2_300n]);
        await waitFor(eoa2.sendTransaction({
            chainId: network.chainId,
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

    it.skip('should create the account when an EOA sponsors it', async function () {
        const eoa = await createAndFundEOA();
        const to = await createAndFundEOA();
        const receiver = ethers.Wallet.createRandom();

        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            value: 10n,
            to,
            authorizationList: [await receiver.authorize({
                chainId: 0,
                nonce: 0,
                address: delegateAddress,
            })],
        });
        await resp.wait();

        expect(await provider.getBalance(to.address)).to.be.equal(1000000000000000000n + 10n);

        const nonce = await provider.getTransactionCount(receiver.address);
        expect(nonce).to.be.equal(1);

        const code = await provider.getCode(receiver.address);
        log('EOA %s code: %s', receiver.address, code);

        expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
    });

    it.skip('should replace existing delegation when a new authorization is sent', async function () {
        const firstDelegation = ethers.Wallet.createRandom().address;
        const eoa = await createAndFundEOA(firstDelegation);
        const nonce = await eoa.getNonce();

        const secondDelegation = ethers.Wallet.createRandom().address;
        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce,
            gasLimit: gas.base + gas.auth(1),
            to: ethers.ZeroAddress,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: nonce + 1,
                address: secondDelegation,
            })],
        });
        await resp.wait();

        const code = await provider.getCode(eoa.address);
        log('EOA %s code: %s', eoa.address, code);

        expect(code).to.be.equal(designatorFor(secondDelegation.toLowerCase()));
    });

    it.skip('should use the last authorization when multiple authorizations are sent', async function () {
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
        await resp.wait();

        const code = await provider.getCode(eoa.address);
        log('EOA %s code: %s', eoa.address, code);

        expect(code).to.be.equal(designatorFor(asAddress(3)));
    });

    it.skip('should authorize delegation of an existing account when exact gas is sent', async function () {
        const eoa = await createAndFundEOA();

        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await eoa.authorize({
                chainId: 0,
                nonce: 1,
                address: delegateAddress,
            })],
        });
        await resp.wait();

        const code = await provider.getCode(eoa.address);
        log('EOA %s code: %s', eoa.address, code);

        expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
    });

    it.skip('should revert type 4 transaction when not enough gas is sent', async function () {
        const eoa = await createAndFundEOA();

        const resp = eoa.sendTransaction({
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

    it.skip('should return delegation designation to `0x167` when an HTS token is created', async function () {
        const operatorId = sdk.AccountId.fromString(process.env.OPERATOR_ID);
        const operatorKey = sdk.PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);
        const client = sdk.Client.forNetwork({ '127.0.0.1:50211': '0.0.3' });
        client.setOperator(operatorId, operatorKey);

        const tx = new sdk.TokenCreateTransaction({
            tokenName: "Test",
            tokenSymbol: "TST",
            initialSupply: 1000n,
            decimals: 2,
            treasuryAccountId: operatorId,
        });
        const resp = await tx.execute(client);

        const receipt = await resp.getReceipt(client);
        assert(receipt.status === sdk.Status.Success, `Token creation failed with status: ${receipt.status}`);
        log('Token Create Transaction ID:', resp.transactionId.toString(), 'Token ID', receipt.tokenId?.toString());

        const tokenId = receipt.tokenId;
        assert(tokenId !== null, 'Token ID cannot be null');
        console.info('Transaction status:', tokenId.toString());
        const tokenAddr = '0x' + tokenId.toEvmAddress();
        console.info('Transaction status:', tokenAddr);

        client.close();

        // TODO: Phase 1 - Base implementation
        new sdk.ContractByteCodeQuery();

        // TODO: Phase 2 - MN impl
        const code = await provider.getCode(tokenAddr);
        expect(code).to.be.equal(designatorFor('0x0000000000000000000000000000000000000167'));
    })
});
