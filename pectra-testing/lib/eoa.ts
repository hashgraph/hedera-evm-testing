import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { type BaseWallet, JsonRpcProvider, Transaction, Wallet, parseUnits } from 'ethers';

import { operatorEcdsaKey, rpcUrl } from './config.ts';
import { log } from './log.ts';
import { designatorFor } from './eip7702.ts';

/**
 * 
 * @param tinyBarBalance 
 * @returns 
 */
export async function fundEOA(delegation?: string, tinyBarBalance: bigint = 100_000_000n): Promise<BaseWallet> {
    const provider = new JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();

    const operator = new Wallet(operatorEcdsaKey, provider);
    const eoa = Wallet.createRandom(provider);

    const [gasLimit, authorizationList, verifyDelegation] = delegation === undefined
        ? [21_000, null, () => undefined]
        : [
            146_000,
            [await eoa.authorize({ chainId: 0, nonce: 0, address: delegation })],
            async () => {
                const code = await provider.getCode(eoa.address);
                log('EOA %s delegated code %s', eoa.address, code);
                assert(code === designatorFor(delegation.toLowerCase()), 'EOA code does not match delegation address');
            }
        ];

    const tx = Transaction.from({
        chainId: network.chainId,
        nonce: await operator.getNonce(),
        maxFeePerGas: parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: parseUnits('2', 'gwei'),
        gasLimit,
        value: tinyBarBalance * 10_000_000_000n,
        to: eoa.address,
        authorizationList,
    });
    const rlpEncodedPayload = await operator.signTransaction(tx);
    const result = await provider.send('eth_sendRawTransaction', [rlpEncodedPayload]);
    await provider.waitForTransaction(result);
    log('EOA %s created at transanction %s', eoa.address, result);

    await verifyDelegation();
    return eoa;
}

/**
 * 
 * @param contractName 
 * @param deployer 
 * @param gasLimit 
 */
export async function deploy(contractName: string, deployer?: BaseWallet, gasLimit: number = 1_000_000): Promise<string> {
    if (!deployer) deployer = await fundEOA();

    assert(deployer.provider !== null, 'Deployer wallet must be connected to a provider');
    const network = await deployer.provider.getNetwork();

    const file = readFileSync(`./out/${contractName}.sol/${contractName}.json`, 'utf-8');
    const { bytecode } = JSON.parse(file);

    log('Deploying contract `%s` from EOA %s', contractName, deployer.address);
    const resp = await deployer.sendTransaction(Transaction.from({
        chainId: network.chainId,
        nonce: await deployer.getNonce(),
        gasPrice: parseUnits('10', 'gwei'),
        gasLimit,
        data: bytecode.object,
    }));
    const receipt = await resp.wait();
    log('Contract `%s` deployed at %s in transanction %s', contractName, receipt?.contractAddress, resp.hash);

    assert(receipt !== null, 'Transaction receipt is null');
    assert(receipt.contractAddress !== null, 'Contract address is null');
    return receipt.contractAddress;
}