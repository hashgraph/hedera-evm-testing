const assert = require('node:assert').strict;
const { readFileSync } = require('node:fs');

const { ethers } = require('ethers');

const { operatorEcdsaKey, rpcUrl } = require('./config.js');
const { log } = require('./log.js');

/**
 * Gas cost constants and functions.
 */
const gas = {
    base: 21_000,
    /**
     * @param {number} n 
     * @returns 
     */
    auth: n => n * 25_000,
};

/**
 * Returns EIP-7702's designator code for a given Ethereum address.
 *
 * @param {string} address - An EVM address
 * @returns 
 */
function designatorFor(address) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(address), `Invalid Ethereum address: ${address}`);
    return `0xef0100${address.slice(2)}`;
}

/**
 * Returns the provided value `n` as an EVM address representation.
 * Useful to convert small integers to padded addresses,
 * such as precompile or system contract addresses.
 *
 * @param {number | bigint} n 
 * @returns {string}
 */
function asAddress(n) {
    return `0x${n.toString(16).padStart(40, '0')}`;
}

/**
 * Creates and funds a new Externally Owned Account (EOA) on the connected network.
 * Optionally, the EOA can be set up to delegate to a given address using EIP-7702.
 *
 * @param {string} [delegation]
 * @param {bigint} [tinyBarBalance=100_000_000n]
 * @returns {Promise<ethers.BaseWallet>} The funded EOA wallet
 */
async function createAndFundEOA(delegation, tinyBarBalance = 100_000_000n) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();

    const operator = new ethers.Wallet(operatorEcdsaKey, provider);
    const eoa = ethers.Wallet.createRandom(provider);

    const [type, gasLimit, authorizationList, verifyDelegation] = delegation === undefined
        ? [2, 21_000, null, () => undefined]
        : [
            4,
            146_000,
            [await eoa.authorize({ chainId: 0, nonce: 0, address: delegation })],
            async () => {
                const code = await provider.getCode(eoa.address);
                log('EOA %s delegated code %s', eoa.address, code);
                assert(code === designatorFor(delegation.toLowerCase()), `EOA code does not match delegation address: ${code}`);
            }
        ];

    const tx = ethers.Transaction.from({
        type,
        chainId: network.chainId,
        nonce: await operator.getNonce(),
        maxFeePerGas: ethers.parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        gasLimit,
        value: tinyBarBalance * 10_000_000_000n,
        to: eoa.address,
        authorizationList,
    });
    const response = await operator.sendTransaction(tx);
    const receipt = await response.wait();
    log('EOA %s created at transanction %s', eoa.address, response.hash, receipt);

    await verifyDelegation();
    return eoa;
}

/**
 * Retrieves the compiled artifact for a given contract name.
 *
 * @param {string} contractPath 
 */
function getArtifact(contractPath) {
    const contractName = contractPath.split('/').pop();
    const file = readFileSync(`./artifacts/${contractPath}.sol/${contractName}.json`, 'utf-8');
    const { abi, bytecode, storageLayout } = JSON.parse(file);
    return { abi, bytecode, storageLayout };
}

/**
 * Deploys a contract to the connected network.
 *
 * @param {string} contractName 
 * @param {ethers.BaseWallet} [deployer]
 * @param {number} [gasLimit=5000000]
 * @returns {Promise<{address: string, deployer: ethers.BaseWallet, contract: ethers.Contract}>}
 */
async function deploy(contractName, args, deployer, gasLimit = 5_000_000){
    if (!deployer) deployer = await createAndFundEOA();

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
        data: bytecode + consArgs,
    }));
    const receipt = await resp.wait();
    log('Contract `%s` deployed at %s in transanction %s', contractName, receipt?.contractAddress, resp.hash);

    assert(receipt !== null, 'Transaction receipt is null');
    assert(receipt.contractAddress !== null, 'Contract address is null');

    const contract = new ethers.Contract(receipt.contractAddress, abi, deployer);
    return { address: receipt.contractAddress, deployer, contract };
}

/**
 * Encodes function call data for a given function signature and values.
 * 
 * @param {string} functionSignature 
 * @param {unknown[]} [values]
 * @returns {string}
 */
function encodeFunctionData(functionSignature, values) {
    const iface = new ethers.Interface([`function ${functionSignature}`]);
    const functionName = iface.fragments[0].name
    const calldata = iface.encodeFunctionData(functionName, values);
    log(`Calldata for ${functionName}(${values !== undefined ? values.join(', ') : ''}):`, calldata);
    return calldata;
}

/**
 * Waits for a transaction to be processed and returns its receipt, or null if the transaction failed.
 *
 * @param {Promise<ethers.TransactionResponse>} tx 
 * @returns {Promise<ethers.TransactionReceipt | null>}
 */
async function waitFor(tx) {
    const response = await tx;
    const receipt = await response.wait();
    return receipt;
}

/**
 * Converts a value to a hexadecimal string representing a `uint256`.
 * 
 * @param {bigint | number} value The value to convert.
 * @returns {string} The hexadecimal string representation of the value as a `uint256`.
 */
function asHexUint256(value) {
    return '0x' + value.toString(16).padStart(64, '0');
}

module.exports = { gas, deploy, designatorFor, createAndFundEOA, encodeFunctionData, asHexUint256, getArtifact, waitFor, asAddress };
