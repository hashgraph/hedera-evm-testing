import { strict as assert } from 'node:assert';

import { expect } from 'chai';
import { type FunctionFragment, Interface, JsonRpcProvider, Transaction, Wallet, parseUnits, type Network } from 'ethers';
import * as ethers from 'ethers';

import * as sdk from '@hiero-ledger/sdk';

import { rpcUrl } from 'pectra-testing/config';
import { deploy, fundEOA } from 'pectra-testing/eoa';
import { designatorFor } from 'pectra-testing/eip7702';
import { log } from 'pectra-testing/log';

describe('eip7702', function () {

    let provider: JsonRpcProvider;
    let network: Network;

    before(async function () {
        provider = new JsonRpcProvider(rpcUrl);
        network = await provider.getNetwork();
    });

    describe('delegation code', function () {
        [
            ...[...Array(0x11).keys()].map(i => i + 1).map(i => `0x00000000000000000000000000000000000000${i.toString(16).padStart(2, '0')}`),
            '0x0000000000000000000000000000000000000167',
            '0x0000000000000000000000000000000000068cDa',
            '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc',
        ].forEach(address => {
            it(`should self-authorize address ${address}`, async function () {
                const eoa = await fundEOA();
                const nonce = await eoa.getNonce();

                const resp = await eoa.sendTransaction(Transaction.from({
                    chainId: network.chainId,
                    nonce,
                    gasPrice: parseUnits('10', 'gwei'),
                    gasLimit: 121_000,
                    value: 10n,
                    to: Wallet.createRandom().address,
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
    });

    function encodeFunctionData(functionSignature: string, values?: unknown[]): string {
        const iface = new Interface([`function ${functionSignature}`]);
        const functionName = (iface.fragments[0] as FunctionFragment).name
        return iface.encodeFunctionData(functionName, values);
    }

    describe('e2e', function () {
        it('should get store and logs when EOA sends a transaction to itself', async function () {
            const storeAndEmitAddr = await deploy('StoreAndEmit');
            const smartWalletAddr = await deploy('Simple7702Account', [ethers.ZeroAddress]);
            const eoa = await fundEOA(smartWalletAddr);

            const s = encodeFunctionData('storeAndEmit(uint256 value)', [42]);
            const calldata = encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [storeAndEmitAddr, 0, s]);

            console.log('Calldata for storeAndEmit(42):', calldata);

            const tx = await eoa.sendTransaction({
                chainId: network.chainId,
                to: eoa.address,
                gasPrice: parseUnits('10', 'gwei'),
                gasLimit: 1_500_000,
                data: calldata,
            });
            const receipt = await tx.wait();
            
            log('Transaction hash:', receipt?.hash);
            log('Logs:', receipt?.logs);
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

            // TODO: Phase 1 - Base impl
            new sdk.ContractByteCodeQuery();

            // TODO: Phase 2 - MN impl
            const code = await provider.getCode(tokenAddr);
            expect(code).to.be.equal(designatorFor('0x0000000000000000000000000000000000000167'));
        })
    });
});
