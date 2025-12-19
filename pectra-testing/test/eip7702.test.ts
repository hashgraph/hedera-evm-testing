import { strict as assert } from 'node:assert';

import { expect } from 'chai';
import * as ethers from 'ethers';
import * as sdk from '@hiero-ledger/sdk';

import { rpcUrl } from 'pectra-testing/config';
import { log } from 'pectra-testing/log';
import { deploy, designatorFor, fundEOA, encodeFunctionData, asHexUint256 } from 'pectra-testing/web3';

describe('eip7702', function () {

    let provider: ethers.JsonRpcProvider;
    let network: ethers.Network;

    before(async function () {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        network = await provider.getNetwork();
    });

    [
        ...[...Array(0x11).keys()].map(i => i + 1).map(i => `0x00000000000000000000000000000000000000${i.toString(16).padStart(2, '0')}`),
        '0x0000000000000000000000000000000000000167',
        '0x0000000000000000000000000000000000068cDa',
        '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc',
    ].forEach(address => {
        it(`should self-authorize address ${address}`, async function () {
            const eoa = await fundEOA();
            const nonce = await eoa.getNonce();

            const resp = await eoa.sendTransaction(ethers.Transaction.from({
                chainId: network.chainId,
                nonce,
                gasPrice: ethers.parseUnits('10', 'gwei'),
                gasLimit: 121_000,
                value: 10n,
                to: ethers.Wallet.createRandom().address,
                authorizationList: [await eoa.authorize({
                    chainId: 0,
                    nonce: nonce + 1,
                    address,
                })],
            }));
            await resp.wait();

            const code = await provider.getCode(eoa.address);
            log('EOA %s code: %s', eoa.address, code);

            expect(code).to.be.equal(designatorFor(address.toLowerCase()));
        });
    });

    it('should get store and logs when EOA sends a transaction to itself', async function () {
        const value = 42;

        const storeAndEmitAddr = await deploy('StoreAndEmit');
        const smartWalletAddr = await deploy('Simple7702Account', [ethers.ZeroAddress]);
        const eoa = await fundEOA(smartWalletAddr);

        const storeAndEmitCall = encodeFunctionData('storeAndEmit(uint256 value)', [value]);
        const data = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmitAddr, 0, storeAndEmitCall]);

        const tx = await eoa.sendTransaction({
            chainId: network.chainId,
            to: eoa.address,
            gasPrice: ethers.parseUnits('10', 'gwei'),
            gasLimit: 1_500_000,
            data,
        });
        const receipt = await tx.wait();

        assert(receipt !== null, 'Receipt is null');

        log('Logs', receipt.logs);
        expect(receipt.logs.length).to.be.equal(1);
        expect(receipt.logs[0]).to.deep.include({
            address: storeAndEmitAddr,
            topics: [
                ethers.id('StoreAndEmitEvent(uint256)'),
                asHexUint256(value),
            ],
        });

        await provider.getStorage(storeAndEmitAddr, 0);
    });

    it.skip('should transfer HTS and ERC20 tokens when EOAs send transactions to themselves', async function () {
        const smartWalletAddr = await deploy('Simple7702Account');

        const eoa1 = await fundEOA(smartWalletAddr);
        const eoa2 = await fundEOA(smartWalletAddr);

        await (await eoa1.sendTransaction({
            to: eoa1.address,
        })).wait();

        await (await eoa2.sendTransaction({
            to: eoa2.address,
        })).wait();
    });

    it.skip('should return delegation designation to `0x167` when an HTS token is created', async function () {
        const operatorId = sdk.AccountId.fromString(process.env.OPERATOR_ID!);
        const operatorKey = sdk.PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY!);
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
