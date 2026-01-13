const assert = require('node:assert').strict;

const { expect } = require('chai');
const { ethers } = require('ethers');
const sdk = require('@hashgraph/sdk');

const { rpcUrl } = require('evm-functional-testing/config');
const { log } = require('evm-functional-testing/log');
const { gas, deploy, designatorFor, fundEOA, encodeFunctionData, asHexUint256, getArtifact, waitFor, asAddress } = require('evm-functional-testing/web3');

/**
 * https://www.evm.codes/precompiled?fork=prague
 */
const precompiledAddresses = [...Array(0x11).keys()].map(i => asAddress(i + 1));

/**
 * https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts
 */
const systemContractAddresses = [0x167, 0x168, 0x169, 0x16a, 0x16b, 0x16c].map(asAddress);

describe('HIP-1340 - EIP-7702 features', function () {

    /**
     * @type {ethers.JsonRpcProvider}
     */
    let provider;

    /**
     * @type {ethers.Network}
     */
    let network;

    before(async function () {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        network = await provider.getNetwork();
    });

    [
        ...precompiledAddresses,
        ...systemContractAddresses,
        '0x0000000000000000000000000000000000068cDa',
        '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc',
    ].forEach(address => {
        it(`should create a new EAO delegation to ${address}, via a type4 transaction`, async function () {
            const eoa = await fundEOA();
            const nonce = await eoa.getNonce();

            const resp = await eoa.sendTransaction({
                chainId: network.chainId,
                nonce,
                gasLimit: gas.base + gas.auth(1),
                value: 10n,
                to: ethers.Wallet.createRandom().address,
                authorizationList: [await eoa.authorize({
                    chainId: 0,
                    nonce: nonce + 1,
                    address,
                })],
            });
            await resp.wait();

            const code = await provider.getCode(eoa.address);
            log('EOA %s code: %s', eoa.address, code);

            expect(code).to.be.equal(designatorFor(address.toLowerCase()));
        });
    });

    systemContractAddresses.forEach(address => {
        [0n, 10_000n].forEach(value => {
            it(`should run no-op with value ${value} when delegating to system contract ${address}`, async function () {
                const sender = await fundEOA();
                const eoa = await fundEOA(address);
                const balance = await provider.getBalance(eoa.address);

                const tx = await sender.sendTransaction({
                    chainId: network.chainId,
                    nonce: 0,
                    gasLimit: gas.base,
                    value,
                    to: eoa.address,
                });
                const resp = await tx.wait();
                assert(resp !== null);

                expect(await provider.getBalance(eoa.address, resp.blockNumber)).to.be.equal(balance + value);
            });
        });
    });

    it('should get store and logs when EOA sends a transaction to itself', async function () {
        const value = 42;

        const storeAndEmit = await deploy('contracts/hip-1340/StoreAndEmit');
        const smartWallet = await deploy('@account-abstraction/contracts/accounts/Simple7702Account');
        const eoa = await fundEOA(smartWallet.address);

        const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
        const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmit.address, 0, storeAndEmitCall]);

        const tx = await eoa.sendTransaction({
            chainId: network.chainId,
            to: eoa.address,
            gasLimit: 1_500_000,
            data,
        });
        const receipt = await tx.wait();

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

    it('should transfer HTS and ERC20 tokens when EOAs send transactions to themselves', async function () {
        const erc20 = await deploy('contracts/hip-1340/ERC20Mintable', ['Test', 'TST', 10_000_000n]);
        await erc20.contract.mint(50_000n);
        const minterBalance = await erc20.contract.balanceOf(erc20.deployer.address);
        log('Minter balance:', minterBalance);
        assert(minterBalance === 50_000n + 10_000_000n, `Minter balance should be \`initialSupply+mint amount\` but got ${minterBalance}`);

        const smartWallet = await deploy('@account-abstraction/contracts/accounts/Simple7702Account');
        const eoa1 = await fundEOA(smartWallet.address);
        const eoa2 = await fundEOA(smartWallet.address);

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

    it('should create the account when an EOA sponsors it', async function () {
        const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc';
        const eoa = await fundEOA();
        const receiver = ethers.Wallet.createRandom();

        const resp = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: 0,
            gasLimit: gas.base + gas.auth(1),
            value: 10n,
            to: ethers.Wallet.createRandom().address,
            authorizationList: [await receiver.authorize({
                chainId: 0,
                nonce: 0,
                address: delegateAddress,
            })],
        });
        await resp.wait();

        const nonce = await provider.getTransactionCount(receiver.address);
        expect(nonce).to.be.equal(1);

        const code = await provider.getCode(receiver.address);
        log('EOA %s code: %s', receiver.address, code);

        expect(code).to.be.equal(designatorFor(delegateAddress.toLowerCase()));
    });

    it('should replace existing delegation when a new authorization is sent', async function () {
        const firstDelegation = ethers.Wallet.createRandom().address;
        const eoa = await fundEOA(firstDelegation);
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

    it('should use the last authorization when multiple authorizations are sent', async function () {
        const eoa = await fundEOA();

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
