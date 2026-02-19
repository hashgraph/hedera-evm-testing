const { strict: assert, strictEqual: assertEq } = require('node:assert');
const { readFileSync } = require('node:fs');
const log = require('node:util').debuglog('hip-1340:web3');

const { ethers } = require('hardhat');

const { MirrorNode } = require('evm-functional-testing/mirror-node');
const { HTS_ADDRESS } = require('../../../utils/constants');
const { getAccountInfo, getContractByteCode } = require('./sdk.js');

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
 * @param {string} address 
 * @returns {Promise<[number, number, number]>} An array containing the nonces from the JSON-RPC Relay, Mirror Node, and Consensus Node (SDK) respectively.
 */
async function getNonces(address) {
    const provider = ethers.provider;

    const nonce = await provider.getTransactionCount(address);
    const { account, ethereum_nonce } = await new MirrorNode().getAccount(address);
    const accountInfo = await getAccountInfo(account);
    log('Nonces for `%s:%s`: RN%s:MN%s:CN%s', account, address, nonce, ethereum_nonce, accountInfo.ethereumNonce);

    return [nonce, ethereum_nonce, accountInfo.ethereumNonce.toNumber()];
}

/**
 * @param {string} address 
 * @returns {Promise<[string, string, string]>} An array containing the code from the JSON-RPC Relay, Mirror Node (SDK), and delegation address respectively. 
 */
async function getCodes(address) {
    const toStr = buf => '0x' + Buffer.from(buf).toString('hex');

    const provider = ethers.provider;
    const code = await provider.getCode(address);
    const { account } = await new MirrorNode().getAccount(address);
    const contractBytecode = await getContractByteCode(account);
    const { delegationAddress } = await getAccountInfo(account);

    return [code, toStr(contractBytecode), toStr(delegationAddress)];
}

/**
 * @type {ethers.BaseWallet}
 */
let seedEOA = undefined;

async function getSeedEOA(tinyBarBalance = 1_000_000_0000_0000n) {
    if (seedEOA !== undefined) {
        return seedEOA;
    }

    const provider = ethers.provider;
    const network = await provider.getNetwork();

    const operator = (await ethers.getSigners())[0];
    const nonce = await operator.getNonce();

    const account = await new MirrorNode().getAccount(operator.address);
    const accountInfo = await getAccountInfo(account.account);
    log('Using operator EOA `%s:%s` (nonce CN%s:MN%s:RN%s)', account.account, operator.address, accountInfo.ethereumNonce, account.ethereum_nonce, nonce);
    assertEq(account.evm_address, operator.address.toLowerCase(), 'Seed account EVM address sanity check');
    assertEq(account.ethereum_nonce, accountInfo.ethereumNonce.toNumber(), 'Nonce mismatch between Mirror Node and SDK');
    assertEq(nonce, account.ethereum_nonce, 'Nonce mismatch between JSON-RPC Relay and Mirror Node');

    seedEOA = ethers.Wallet.createRandom(provider);
    const response = await operator.sendTransaction({
        type: 2,
        chainId: network.chainId,
        nonce: nonce,
        maxFeePerGas: ethers.parseUnits('710', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
        gasLimit: 21_000 + 800_000,
        value: tinyBarBalance * 10_000_000_000n,
        to: seedEOA.address,
    });
    await response.wait();
    log('Seed EOA `%s` created at transanction %s', seedEOA.address, response.hash);

    return seedEOA;
}

/**
 * Creates and funds a new Externally Owned Account (EOA) on the connected network.
 * Optionally, the EOA can be set up to delegate to a given address using EIP-7702.
 *
 * @param {string} [delegation]
 * @param {bigint} [tinyBarBalance=100_000_000n]
 * @returns {Promise<ethers.BaseWallet>} The funded EOA wallet
 */
async function createAndFundEOA(delegation, tinyBarBalance = 1000_0000_0000n) {
    const provider = ethers.provider;
    const network = await provider.getNetwork();

    const seed = await getSeedEOA();
    let nonce = await seed.getNonce();

    const account = await new MirrorNode().getAccount(seed.address);
    const accountInfo = await getAccountInfo(account.account);
    log('Using seed EOA `%s:%s` (nonce CN%s:MN%s:RN%s)', account.account, seed.address, accountInfo.ethereumNonce, account.ethereum_nonce, nonce);
    assertEq(account.evm_address, seed.address.toLowerCase(), 'Seed account EVM address sanity check');
    assertEq(account.ethereum_nonce, accountInfo.ethereumNonce.toNumber(), 'Nonce mismatch between Mirror Node and SDK');
    assertEq(nonce, account.ethereum_nonce, 'Nonce mismatch between JSON-RPC Relay and Mirror Node');

    const eoa = ethers.Wallet.createRandom(provider);
    const [type, gasLimit, authorizationList, verifyDelegation] = delegation === undefined
        ? [2, 21_000 + 800_000, undefined, () => undefined]
        : [
            4,
            // 146_000,
            800_000,
            [await eoa.authorize({ chainId: 0, nonce: 0, address: delegation })],
            async () => {
                const code = await provider.getCode(eoa.address);
                log('EOA %s delegated code %s', eoa.address, code);
                assert(code === designatorFor(delegation.toLowerCase()), `EOA code does not match delegation address: ${code}`);
            }
        ];

    if (authorizationList !== undefined) {
        const resp = await seed.sendTransaction({
            type: 2,
            chainId: network.chainId,
            nonce: nonce,
            maxFeePerGas: ethers.parseUnits('710', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
            // gasPrice: ethers.parseUnits('710', 'gwei'),
            gasLimit,
            value: 543210_000_000_000n,
            to: eoa.address,
        });
        await resp.wait();
        log('EOA `%s` created and funded at transanction %s', eoa.address, resp.hash);
        nonce++;
    }

    const response = await seed.sendTransaction({
        type,
        chainId: network.chainId,
        nonce: nonce,
        maxFeePerGas: ethers.parseUnits('710', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
        // gasPrice: ethers.parseUnits('710', 'gwei'),
        gasLimit,
        value: authorizationList === undefined ? tinyBarBalance * 10_000_000_000n : 0n,
        to: authorizationList === undefined ? eoa.address : ethers.ZeroAddress,
        authorizationList,
    });
    await response.wait();
    log('EOA `%s` created at transanction %s', eoa.address, response.hash);

    await verifyDelegation();
    return eoa;
}

async function authorizeEOADelegation(eoa, delegateToAddress, eoaNonce = undefined) {
    assert(delegateToAddress !== asAddress(0), 'Delegation to zero address clears the delegation indicator');

    const provider = ethers.provider;
    const network = await provider.getNetwork();

    const resp = await (await createAndFundEOA()).sendTransaction({
        type: 4,
        chainId: network.chainId,
        nonce: 0,
        gasLimit: gas.base + gas.auth(1),
        to: ethers.ZeroAddress,
        maxFeePerGas: ethers.parseUnits('710', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
        authorizationList: [await eoa.authorize({
            chainId: 0,
            nonce: eoaNonce,
            address: delegateToAddress,
        })],
    });
    await resp.wait().catch(err => log('Fetch transaction receipt failed:', err.message));

    const [code, contractBytecode, delegationAddress] = await getCodes(eoa.address);
    // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
    // assert(code === designatorFor(delegateToAddress.toLowerCase()));
    assert(contractBytecode === designatorFor(delegateToAddress.toLowerCase()));
    assert(delegationAddress === delegateToAddress.toLowerCase());
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
async function deploy(contractName, args, deployer, gasLimit = 5_000_000) {
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
    const resp = await deployer.sendTransaction({
        chainId: network.chainId,
        nonce: await deployer.getNonce(),
        gasPrice: ethers.parseUnits('710', 'gwei'),
        gasLimit,
        data: bytecode + consArgs,
    });
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

/**
 * Sends a self-delegation type-4 (EIP-7702) transaction from an EOA,
 * authorizing it to delegate to the given contract address.
 * Handles the TRANSACTION_REPLACED error that Hedera's relay commonly returns.
 *
 * @param {ethers.BaseWallet} eoa - The EOA that signs both the tx and the authorization
 * @param {string} delegationAddress - The contract address to delegate to
 * @param {Nonce} nonce - Nonce tracker for the EOA (consumes 2 nonces: tx + authorization)
 * @param {object} [options]
 * @param {bigint} [options.value=0n] - Value to send with the delegation tx
 * @param {number} [options.gasLimit=1_500_000] - Gas limit
 * @param {bigint} [options.authChainId=0n] - Chain ID for the authorization (0 = any chain)
 * @returns {Promise<string | undefined>} The mined transaction hash, or undefined if unknown
 */
async function sendDelegation(eoa, delegationAddress, nonce, options = {}) {
    const { value = 0n, gasLimit = 1_500_000, authChainId = 0 } = options;
    const network = await eoa.provider.getNetwork();

    const txNonce = nonce.next();
    const authNonce = nonce.next();

    const resp = await eoa.sendTransaction({
        type: 4,
        chainId: network.chainId,
        nonce: txNonce,
        gasLimit,
        value,
        to: eoa.address,
        authorizationList: [await eoa.authorize({
            chainId: authChainId,
            nonce: authNonce,
            address: delegationAddress,
        })],
    });

    let txhash;
    try {
        await resp.wait();
        txhash = resp.hash;
    } catch (e) {
        if (e.replacement?.hash) {
            log('Delegation tx replaced: %s -> %s', resp.hash, e.replacement.hash);
            txhash = e.replacement.hash;
        } else {
            log('WARNING: delegation tx.wait() error for %s: %s', eoa.address, e.code || e.message);
        }
    }

    log('EOA %s delegated to %s (tx: %s)', eoa.address, delegationAddress, txhash || 'unknown');
    return txhash;
}

/**
 * Verifies that an EOA's delegation bytecode matches the expected designator
 * by querying the Hedera SDK (consensus node) via the MirrorNode account ID.
 *
 * @param {string} eoaAddress - The EVM address of the delegated EOA
 * @param {string} expectedDelegationAddress - The address the EOA should be delegated to
 * @returns {Promise<string>} The Hedera account ID (e.g. "0.0.1234")
 */
async function verifyDelegation(eoaAddress, expectedDelegationAddress) {
    const { account } = await new MirrorNode().getAccount(eoaAddress);
    log('Verifying delegation for %s (account %s)', eoaAddress, account);

    const bytecode = await getContractByteCode(account);
    const expected = designatorFor(expectedDelegationAddress.toLowerCase()).slice(2);
    assert(
        Buffer.from(bytecode).toString('hex') === expected,
        `Delegation bytecode mismatch for ${eoaAddress}: expected ${expected}`
    );

    return account;
}

/**
 * Associates an EOA with an HTS token by calling the HTS precompile directly.
 *
 * @param {ethers.BaseWallet} eoa - The EOA to associate
 * @param {string} tokenAddress - The HTS token address
 * @param {Nonce} [nonce] - Optional nonce tracker (if omitted, ethers auto-manages)
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<ethers.TransactionReceipt | null>}
 */
async function associateHtsToken(eoa, tokenAddress, nonce, gasLimit = 1_500_000) {
    const network = await eoa.provider.getNetwork();
    const receipt = await waitFor(eoa.sendTransaction({
        chainId: network.chainId,
        gasLimit,
        ...(nonce ? { nonce: nonce.next() } : {}),
        to: HTS_ADDRESS,
        data: encodeFunctionData(
            'associateToken(address account, address token)',
            [eoa.address, tokenAddress]
        ),
    }));
    log('Associated %s with HTS token %s', eoa.address, tokenAddress);
    return receipt;
}

/**
 * Associates a delegated EOA with an HTS token by routing through
 * the Smart Wallet's `execute()` to the HTS precompile.
 *
 * @param {ethers.BaseWallet} eoa - The delegated EOA to associate
 * @param {string} tokenAddress - The HTS token address
 * @param {Nonce} [nonce] - Optional nonce tracker (if omitted, ethers auto-manages)
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<ethers.TransactionReceipt | null>}
 */
async function associateHtsTokenViaDelegation(eoa, tokenAddress, nonce, gasLimit = 1_500_000) {
    const network = await eoa.provider.getNetwork();
    const associateCalldata = encodeFunctionData(
        'associateToken(address account, address token)',
        [eoa.address, tokenAddress]
    );
    const receipt = await waitFor(eoa.sendTransaction({
        chainId: network.chainId,
        gasLimit,
        ...(nonce ? { nonce: nonce.next() } : {}),
        to: eoa.address,
        data: encodeFunctionData(
            'execute(address target, uint256 value, bytes calldata data)',
            [HTS_ADDRESS, 0, associateCalldata]
        ),
    }));
    log('Associated %s with HTS token %s (via delegation)', eoa.address, tokenAddress);
    return receipt;
}

/**
 * Sequential nonce tracker for manually managing transaction ordering.
 * Useful when the relay or MirrorNode returns stale nonce values,
 * e.g. after EIP-7702 authorization transactions that consume a nonce.
 */
class Nonce {
    #val = 0;
    /** Returns the current nonce and increments it. */
    next() {
        return this.#val++;
    }
    /** Returns the current nonce without incrementing. */
    get cur() {
        return this.#val;
    }
}

module.exports = { gas, deploy, designatorFor, createAndFundEOA, encodeFunctionData, asHexUint256, getArtifact, waitFor, asAddress, getNonces, getCodes, Nonce, sendDelegation, verifyDelegation, associateHtsToken, associateHtsTokenViaDelegation, HTS_ADDRESS, authorizeEOADelegation };
