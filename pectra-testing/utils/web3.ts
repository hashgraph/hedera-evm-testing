import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import * as ethers from 'ethers';

import { operatorEcdsaKey, rpcUrl } from './config.ts';
import { log } from './log.ts';

/**
 * 
 * @param address - Ethereum address
 * @returns 
 */
export function designatorFor(address: string) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(address), `Invalid Ethereum address: ${address}`);
    return `0xef0100${address.slice(2)}`;
}

/**
 * 
 * @param tinyBarBalance 
 * @returns 
 */
export async function fundEOA(delegation?: string, tinyBarBalance: bigint = 100_000_000n): Promise<ethers.BaseWallet> {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();

    const operator = new ethers.Wallet(operatorEcdsaKey, provider);
    const eoa = ethers.Wallet.createRandom(provider);

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

    const tx = ethers.Transaction.from({
        chainId: network.chainId,
        nonce: await operator.getNonce(),
        maxFeePerGas: ethers.parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
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
 */
export function getArtifact(contractName: string): {
    abi: ethers.JsonFragment[],
    bytecode: { object: string },
    storageLayout: {
        storage: {
            label: string,
            offset: number,
            slot: string,
            type: string,
        }[]
    },
} {
    const file = readFileSync(`./out/${contractName}.sol/${contractName}.json`, 'utf-8');
    const { abi, bytecode, storageLayout } = JSON.parse(file);
    return { abi, bytecode, storageLayout };
}

/**
 * 
 * @param contractName 
 * @param deployer 
 * @param gasLimit 
 */
export async function deploy(contractName: string, args?: unknown[], deployer?: ethers.BaseWallet, gasLimit: number = 5_000_000): Promise<string> {
    if (!deployer) deployer = await fundEOA();

    assert(deployer.provider !== null, 'Deployer wallet must be connected to a provider');
    const network = await deployer.provider.getNetwork();
    const { abi, bytecode } = getArtifact(contractName)

    let consArgs = '';
    if (args && args.length > 0) {
        consArgs = new ethers.Interface(abi).encodeDeploy(args);
        log('Using constructor arguments', consArgs);
        consArgs = consArgs.slice(2);
    }

    log('Deploying contract `%s` from EOA %s', contractName, deployer.address);
    const resp = await deployer.sendTransaction(ethers.Transaction.from({
        chainId: network.chainId,
        nonce: await deployer.getNonce(),
        gasPrice: ethers.parseUnits('10', 'gwei'),
        gasLimit,
        data: bytecode.object + consArgs,
    }));
    const receipt = await resp.wait();
    log('Contract `%s` deployed at %s in transanction %s', contractName, receipt?.contractAddress, resp.hash);

    assert(receipt !== null, 'Transaction receipt is null');
    assert(receipt.contractAddress !== null, 'Contract address is null');
    return receipt.contractAddress;
}

/**
 * 
 * @param functionSignature 
 * @param values 
 * @returns 
 */
export function encodeFunctionData(functionSignature: string, values?: unknown[]): string {
    const iface = new ethers.Interface([`function ${functionSignature}`]);
    const functionName = (iface.fragments[0] as ethers.FunctionFragment).name
    const calldata = iface.encodeFunctionData(functionName, values);
    log(`Calldata for ${functionName}(${values !== undefined ? values.join(', ') : ''}):`, calldata);
    return calldata;
}

/**
 * 
 * @param value 
 * @returns 
 */
export function asHexUint256(value: bigint | number): string {
    return '0x' + value.toString(16).padStart(64, '0');
}
