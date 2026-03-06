const { strict: assert, strictEqual: assertEq } = require('node:assert');
const { readFileSync } = require('node:fs');
const log = require('node:util').debuglog('hip-1340:web3');

const { ethers, network } = require('hardhat');

const { MirrorNode } = require('evm-functional-testing/mirror-node');
const { getAccountInfo, getContractByteCode } = require('./sdk.js');
const { GAS_LIMIT_1_000_000 } = require("../../../utils/constants");

/**
 * @returns {boolean} True if the connected network is an Ethereum-based network (e.g., Geth), false if it's a Hedera-based network (e.g., SOLO).
 */
function isEthNetwork() {
    return [1337, 31337].includes(network.config.chainId);
}

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
    hollow: () => isEthNetwork() ? 0 : 570_000,
};

const units = {
    /** @param {bigint} n */
    tinybar: n => n * 1_00000_00000n,

    /** @param {bigint} n */
    hbar: n => n * units.tinybar(1_0000_0000n),
}

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
    if (isEthNetwork()) return [nonce, nonce, nonce];

    const { account, evm_address, ethereum_nonce } = await new MirrorNode().getAccount(address);
    const accountInfo = await getAccountInfo(account);
    log('Nonces for `%s:%s`: RN%s:MN%s:CN%s', account, address, nonce, ethereum_nonce, accountInfo.ethereumNonce);
    assertEq(evm_address, address.toLowerCase(), 'Account EVM address sanity check');

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
    if (isEthNetwork()) return [code, code, '0x' + code.slice(4 * 2)];

    const { account } = await new MirrorNode().getAccount(address);
    const contractBytecode = await getContractByteCode(account);
    const { delegationAddress } = await getAccountInfo(account);
    log('Bytecode for `%s:%s`: ethcode %s : bytecode %s : delegation %s', account, address, code, toStr(contractBytecode), toStr(delegationAddress));

    return [code, toStr(contractBytecode), toStr(delegationAddress)];
}

/**
 * @type {ethers.BaseWallet}
 */
let seedEOA = undefined;

async function getSeedEOA(hbarBalance = 1_000_000n) {
    if (seedEOA !== undefined) return seedEOA;

    const provider = ethers.provider;
    const network = await provider.getNetwork();

    const operator = (await ethers.getSigners())[0];
    const [nonce, eth_nonce, ethNonce] = await getNonces(operator.address);
    assertEq(nonce, eth_nonce, 'Nonce mismatch between JSON-RPC Relay and Mirror Node');
    assertEq(eth_nonce, ethNonce, 'Nonce mismatch between Mirror Node and SDK');

    seedEOA = ethers.Wallet.createRandom(provider);
    const resp = await operator.sendTransaction({
        type: 2,
        chainId: network.chainId,
        nonce,
        gasLimit: gas.base + gas.hollow(),
        value: units.hbar(hbarBalance),
        to: seedEOA.address,
    });
    await resp.wait();
    log('Seed EOA `%s` created at transanction %s', seedEOA.address, resp.hash);

    return seedEOA;
}

const EOADefaultBalance = ethers.parseUnits('1000', 'ether');

/**
 * Creates and funds a new Externally Owned Account (EOA) on the connected network.
 *
 * @param {bigint} [tinyBarBalance=100_000_000n]
 * @returns {Promise<ethers.BaseWallet>} The funded EOA wallet
 */
async function createAndFundEOA() {
    const provider = ethers.provider;
    const network = await provider.getNetwork();

    const seed = await getSeedEOA();
    const [nonce, eth_nonce, ethNonce] = await getNonces(seed.address);
    assertEq(nonce, eth_nonce, 'Nonce mismatch between JSON-RPC Relay and Mirror Node');
    assertEq(eth_nonce, ethNonce, 'Nonce mismatch between Mirror Node and SDK');

    const eoa = ethers.Wallet.createRandom(provider);
    const resp = await seed.sendTransaction({
        type: 2,
        chainId: network.chainId,
        nonce,
        gasLimit: 21_000 + gas.hollow(),
        value: EOADefaultBalance,
        to: eoa.address,
    });
    await resp.wait();
    log('EOA `%s` created at transanction %s', eoa.address, resp.hash);

    return eoa;
}

/**
 *
 * @param {ethers.BaseWallet} eoa
 * @param {string} delegateToAddress
 * @param {number} [eoaNonce]
 * @returns {Promise<ethers.BaseWallet>}
 */
async function authorizeEOADelegation(eoa, delegateToAddress, eoaNonce = undefined) {
    assert(delegateToAddress !== asAddress(0), 'Delegation to zero address clears the delegation indicator');

    const provider = ethers.provider;
    const network = await provider.getNetwork();

    await (await createAndFundEOA()).sendTransaction({
        type: 4,
        chainId: network.chainId,
        nonce: 0,
        gasLimit: gas.base + gas.auth(1),
        to: ethers.ZeroAddress,
        authorizationList: [await eoa.authorize({
            chainId: 0,
            nonce: eoaNonce,
            address: delegateToAddress,
        })],
    }).then(tx => tx.wait());

    const [code, contractBytecode, delegationAddress] = await getCodes(eoa.address);
    // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
    // assert(code === designatorFor(delegateToAddress.toLowerCase()));
    assertEq(contractBytecode, designatorFor(delegateToAddress.toLowerCase()));
    assertEq(delegationAddress, delegateToAddress.toLowerCase());
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
    const gasPrice = isEthNetwork() ? undefined : ethers.parseUnits('710', 'gwei');
    const resp = await deployer.sendTransaction({
        chainId: network.chainId,
        nonce: await deployer.getNonce(),
        gasPrice,
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
 * Converts a value to a hexadecimal string representing a `uint256`.
 *
 * @param {bigint | number} value The value to convert.
 * @returns {string} The hexadecimal string representation of the value as a `uint256`.
 */
function asHexUint256(value) {
    const str = typeof value === 'string' ? value.slice(2) : value.toString(16);
    return '0x' + str.padStart(64, '0');
}

/**
 * Sends a self-delegation type-4 (EIP-7702) transaction from an EOA,
 * authorizing it to delegate to the given contract address.
 * Handles the TRANSACTION_REPLACED error that Hedera's relay commonly returns.
 *
 * @param {ethers.BaseWallet} eoa - The EOA that signs both the tx and the authorization
 * @param {string} delegationAddress - The contract address to delegate to
 * @param {number} [nonce] - Optional explicit tx nonce (authorization uses nonce + 1)
 * @returns {Promise<string | undefined>} The mined transaction hash, or undefined if unknown
 */
async function sendSelfSponsoredDelegation(eoa, delegationAddress, nonce) {
    const network = await eoa.provider.getNetwork();
    const resp = await eoa.sendTransaction({
        type: 4,
        chainId: network.chainId,
        ...(nonce !== undefined ? {nonce} : {}),
        gasLimit: GAS_LIMIT_1_000_000.gasLimit,
        to: eoa.address,
        authorizationList: [await eoa.authorize({
            chainId: network.chainId,
            nonce: nonce !== undefined ? nonce + 1 : (await eoa.getNonce()) + 1,
            address: delegationAddress,
        })],
    });

    await resp.wait();
    return resp.hash;
}

/** Default delegation target used in "insufficient gas" delegation-creation tests. */
const DELEGATION_TARGET_ADDRESS = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();

/** Gas limit used when sending a type-4 tx that is intended not to complete account creation. */
const DELEGATION_CREATION_GAS_LIMIT = gas.base + 10_000;

/**
 * Sends a type-4 tx that would create a delegated EOA (authorization from `delegated` to `delegationAddress`).
 * Used by tests that assert no account is created when gas is insufficient or value is sent to the delegated address.
 *
 * @param {{ eoa: ethers.Wallet, delegated: ethers.Wallet, delegationAddress?: string, to?: string, value?: bigint, gasLimit?: number }} opts
 * @returns {Promise<ethers.TransactionResponse>}
 */
async function sendDelegationCreationTx({
                                            eoa,
                                            delegated,
                                            delegationAddress = DELEGATION_TARGET_ADDRESS,
                                            to,
                                            value = 0n,
                                            gasLimit = DELEGATION_CREATION_GAS_LIMIT
                                        }) {
    const network = await eoa.provider.getNetwork();
    const targetTo = to !== undefined ? to : eoa.address;
    return eoa.sendTransaction({
        chainId: network.chainId,
        nonce: 0,
        to: targetTo,
        value,
        gasLimit,
        authorizationList: [await delegated.authorize({
            chainId: network.chainId,
            nonce: 0,
            address: delegationAddress,
        })],
    });
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
    const {account} = await new MirrorNode().getAccount(eoaAddress);
    log('Verifying delegation for %s (account %s)', eoaAddress, account);

    const bytecode = await getContractByteCode(account);
    const actual = Buffer.from(bytecode).toString('hex');
    log("actual: %s", actual);
    const expected = designatorFor(expectedDelegationAddress.toLowerCase()).slice(2);
    assertEq(
        actual,
        expected,
        `Delegation bytecode mismatch for ${eoaAddress}: expected ${expected}, got ${actual}`
    );

    return account;
}

module.exports = {
    gas,
    units,
    deploy,
    designatorFor,
    createAndFundEOA,
    encodeFunctionData,
    asHexUint256,
    getArtifact,
    asAddress,
    getNonces,
    getCodes,
    sendDelegation: sendSelfSponsoredDelegation,
    verifyDelegation,
    authorizeEOADelegation,
    sendDelegationCreationTx,
    DELEGATION_TARGET_ADDRESS,
    DELEGATION_CREATION_GAS_LIMIT,
    EOADefaultBalance,
};