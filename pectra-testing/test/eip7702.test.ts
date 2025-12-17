import { expect } from 'chai';
import { JsonRpcProvider, Transaction, Wallet, parseUnits, type Network } from 'ethers';

import { rpcUrl } from 'pectra-testing/config';
import { deploy, fundEOA } from 'pectra-testing/eoa';
import { designatorFor } from 'pectra-testing/eip7702';
import { log } from 'pectra-testing/log';

describe('eip7702', function() {

    let provider: JsonRpcProvider;
    let network: Network;

    before(async function() {
        provider = new JsonRpcProvider(rpcUrl);
        network = await provider.getNetwork();
    });

    describe('delegation code', function() {
        [
            ...[...Array(0x11).keys()].map(i=>i+1).map(i => `0x00000000000000000000000000000000000000${i.toString(16).padStart(2, '0')}`),
            '0x0000000000000000000000000000000000000167',
            '0x0000000000000000000000000000000000068cDa',
            '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc',
        ].forEach(address => {
            it(`should self-authorize address ${address}`, async function() {
                const eoa = await fundEOA();
                const nonce = await eoa.getNonce();

                const resp = await eoa.sendTransaction(Transaction.from({
                    chainId: network.chainId,
                    nonce,
                    gasPrice: parseUnits('10', 'gwei'),
                    gasLimit: 121_000,
                    value: 10n,
                    to: Wallet.createRandom().address,
                    authorizationList: [ await eoa.authorize({
                        chainId: 0,
                        nonce: nonce + 1,
                        address,
                    }) ],
                }));
                await resp.wait();

                const code = await provider.getCode(eoa.address);
                log('EOA %s code: %s', eoa.address, code);

                expect(code).to.be.equal(designatorFor(address.toLowerCase()));
            });
        });
    });

    describe('e2e', function() {
        it('should pass', async function() {
            const contractAddress = await deploy('Simple7702Account');

            const eoa1 = await fundEOA(contractAddress);
            const eoa2 = await fundEOA(contractAddress);
        });
    });
});
