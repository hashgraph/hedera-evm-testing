const { strict: assert, strictEqual: assertEq } = require('node:assert');
const { readFileSync } = require('node:fs');
const log = require('node:util').debuglog('hip-1340:web3');

const { ethers, network } = require('hardhat');

const { MirrorNode } = require('evm-functional-testing/mirror-node');
const { getAccountInfo, getContractByteCode } = require('./sdk.js');


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
     * Returns additional intrinsic gas for `n` EIP-7702 authorizations.
     *
     * @param {number} n - Number of authorization entries.
     * @returns {number} Additional gas units.
     */
    codeAuthorization: n => n * 25_000,
    /**
     * Returns extra gas needed for Hedera account creation path.
     * On Ethereum-based networks this is zero.
     *
     * @returns {number} Additional gas units.
     */
    accountCreationCost: () => isEthNetwork() ? 0 : 570_000,
};

const units = {
    /**
     * Converts tinybar units to wei-like denomination used in tests.
     *
     * @param {bigint} n - Amount in tinybars.
     * @returns {bigint} Converted amount.
     */
    tinybar: n => n * 1_00000_00000n,

    /**
     * Converts hbar units to tinybar-based denomination used in tests.
     *
     * @param {bigint} n - Amount in hbars.
     * @returns {bigint} Converted amount.
     */
    hbar: n => n * units.tinybar(1_0000_0000n),
}

const EOADefaultBalance = ethers.parseUnits('1000', 'ether');

/**
 * Builds the cartesian product for a list of dimensions.
 *
 * @template T
 * @param {...T[]} dimensions - Lists that define each axis of the product.
 * @returns {T[][]} All combinations, one item per dimension.
 */
function cartesianProduct(...dimensions) {
    return dimensions.reduce(
        (acc, cur) => acc.flatMap(prefix => cur.map(item => [...prefix, item])),
        [[]]
    );
}

/**
 * Returns EIP-7702's designator code for a given Ethereum address.
 *
 * @param {string} address - An EVM address
 * @returns {string} Hex-encoded delegation designator bytecode.
 */
function delegationIndicatorFor(address) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(address), `Invalid Ethereum address: ${address}`);
    return `0xef0100${address.slice(2)}`;
}

/**
 * Returns the provided value `n` as a long-zero EVM address.
 * Useful to convert small integers to padded addresses,
 * such as precompile or system contract addresses.
 *
 * @param {number | bigint} n 
 * @returns {string}
 */
function asLongZeroAddress(n) {
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
 * Retrieves the compiled artifact for a given contract name.
 *
 * @param {string} contractPath - Path under `contracts/` without `.sol` suffix.
 * @returns {{abi: unknown[], bytecode: string, storageLayout: unknown}} Parsed artifact fields.
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
 * @param {string} contractName - Contract path used by `getArtifact`.
 * @param {unknown[]} [args] - Constructor arguments.
 * @param {ethers.BaseWallet} [deployer] - Wallet used for deployment.
 * @param {number} [gasLimit=5000000] - Max gas for deployment transaction.
 * @returns {Promise<{address: string, deployer: ethers.BaseWallet, contract: ethers.Contract}>}
 */
async function deploy(contractName, args, deployer, gasLimit = 5_000_000) {
    if (!deployer) {
        deployer = (await ethers.getSigners())[0];
    }

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
 * @param {string} functionSignature - Solidity signature, e.g. `transfer(address,uint256)`.
 * @param {unknown[]} [values] - Positional argument values for the signature.
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
 * Builder for type-4 delegation authorization transactions.
 */
class DelegationTransactionBuilder {
    constructor() {
        this.sender = null;
        this.chainId = null;
        this.senderNonce = 0;
        this.authorizations = [];
        this.toAddress = ethers.ZeroAddress;
        this.value = 0n;
        this.gasLimit = gas.base + gas.codeAuthorization(1);
    }

    from(wallet) {
        this.sender = wallet;
        return this;
    }

    withChainId(chainId) {
        this.chainId = chainId;
        return this;
    }

    withAuthorization(authorityWallet, delegationAddress, nonce = undefined) {
        this.authorizations.push({ authorityWallet, delegationAddress, nonce });
        return this;
    }

    to(address) {
        this.toAddress = address;
        return this;
    }

    withValue(value) {
        this.value = value;
        return this;
    }

    withGasLimit(limit) {
        this.gasLimit = limit;
        return this;
    }

    async _buildRequest() {
        assert(this.sender && this.chainId && this.authorizations.length > 0);
        const authList = await Promise.all(
            this.authorizations.map(({authorityWallet, delegationAddress, nonce}) =>
                authorityWallet.authorize({
                    chainId: 0,
                    nonce: nonce ?? 0,
                    address: delegationAddress,
                })
            )
        );

        return {
            type: 4,
            chainId: this.chainId,
            nonce: this.senderNonce,
            gasLimit: this.gasLimit,
            to: this.toAddress,
            value: this.value,
            authorizationList: authList,
        };
    }

    async send() {
        const tx = await this._buildRequest();
        return this.sender.sendTransaction(tx);
    }

    /**
     * Builds and signs the EIP-7702 transaction without sending it.
     * Returns the raw signed transaction bytes suitable for wrapping in
     * a Hedera `EthereumTransaction` (e.g., as an inner batch transaction).
     *
     * @returns {Promise<Uint8Array>} Raw RLP-encoded signed Ethereum transaction.
     */
    async signRaw() {
        const tx = await this._buildRequest();
        const populated = await this.sender.populateTransaction(tx);
        const signedHex = await this.sender.signTransaction(populated);
        return Buffer.from(signedHex.slice(2), 'hex');
    }
}

/**
 * Verifies delegation indicator bytecode/address for a delegated EOA.
 *
 * @param {string} eoaAddress
 * @param {string} delegateToAddress
 * @returns {Promise<void>}
 */
async function verifyDelegation(eoaAddress, delegateToAddress) {
    const [_code, contractBytecode, delegationAddress] = await getCodes(eoaAddress);
    assertEq(contractBytecode, delegationIndicatorFor(delegateToAddress.toLowerCase()));
    assertEq(delegationAddress, delegateToAddress.toLowerCase());
}

/**
 * Executes Smart Wallet `executeBatch` via a delegated EOA.
 *
 * @param {{
 *   eoa: import('ethers').BaseWallet,
 *   calls: Array<{target: string, value: bigint, data: string}>,
 *   nonce: number,
 *   chainId: bigint,
 *   gasLimit?: number,
 * }} params
 * @returns {Promise<import('ethers').TransactionReceipt | null>}
 */
async function executeBatchViaDelegation({
    eoa,
    calls,
    nonce,
    chainId,
    gasLimit = 1_500_000,
}) {
    const tupleCalls = calls.map(({target, value, data}) => [target, value, data]);
    return (await eoa.sendTransaction({
        chainId,
        nonce,
        gasLimit,
        to: eoa.address,
        data: encodeFunctionData(
            'executeBatch((address target,uint256 value,bytes data)[] calls)',
            [tupleCalls]
        ),
    })).wait();
}

/**
 * Asserts that the given address has no Hedera account and zero balance.
 *
 * @param {import('ethers').Provider} provider
 * @param {string} address
 * @returns {Promise<void>}
 */
async function assertAccountDoesNotExist(provider, address) {
    const { expect } = require('chai');
    const delegatedAccount = await new MirrorNode().getAccount(address);
    expect(delegatedAccount.account).to.be.equal(undefined, 'Account should not exist on Hedera');
    expect(delegatedAccount._status?.messages?.[0]?.message).to.be.equal('Not found');
    expect(await provider.getBalance(address)).to.be.equal(0n);
}

/**
 * Asserts that the given address has a Hedera account.
 *
 * @param {import('ethers').Provider} provider
 * @param {string} address
 * @returns {Promise<void>}
 */
async function assertAccountExists(provider, address) {
    const { expect } = require('chai');
    const delegatedAccount = await new MirrorNode().getAccount(address);
    expect(delegatedAccount.account, 'Account should exist on Hedera').to.not.be.undefined;
    expect(delegatedAccount._status?.messages?.[0]?.message, 'Account should not have Not found status').to.not.equal('Not found');
}

/**
 * Converts a value to a hexadecimal string representing a `uint256`.
 *
 * @param {bigint | number | string} value The value to convert.
 * @returns {string} The hexadecimal string representation of the value as a `uint256`.
 */
function asHexUint256(value) {
    const str = typeof value === 'string' ? value.slice(2) : value.toString(16);
    return '0x' + str.padStart(64, '0');
}

module.exports = {
    gas, units, deploy, delegationIndicatorFor, encodeFunctionData, asHexUint256, getArtifact,
    asLongZeroAddress, getNonces, getCodes, cartesianProduct,
    DelegationTransactionBuilder, verifyDelegation, executeBatchViaDelegation,
    assertAccountDoesNotExist, assertAccountExists,
    EOADefaultBalance,
};