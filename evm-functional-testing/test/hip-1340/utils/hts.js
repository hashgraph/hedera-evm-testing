const log = require('node:util').debuglog('hip-1340:hts');

const { HTS_ADDRESS } = require('../../../utils/constants');
const { encodeFunctionData, waitFor } = require('./web3');

/**
 * Associates an EOA with an HTS token by calling the HTS precompile directly.
 *
 * @param {import('ethers').BaseWallet} eoa - The EOA to associate
 * @param {string} tokenAddress - The HTS token address
 * @param {import('./web3').Nonce} [nonce] - Optional nonce tracker (if omitted, ethers auto-manages)
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<import('ethers').TransactionReceipt | null>}
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
 * @param {import('ethers').BaseWallet} eoa - The delegated EOA to associate
 * @param {string} tokenAddress - The HTS token address
 * @param {import('./web3').Nonce} [nonce] - Optional nonce tracker (if omitted, ethers auto-manages)
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<import('ethers').TransactionReceipt | null>}
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
 * Transfers HTS tokens from a delegated EOA to a recipient by routing
 * an ERC20 `transfer()` call through the Smart Wallet's `execute()`.
 *
 * @param {import('ethers').BaseWallet} eoa - The delegated EOA that holds the tokens
 * @param {string} tokenAddress - The HTS token address
 * @param {string} to - The recipient address
 * @param {bigint} amount - The amount of tokens to transfer
 * @param {import('./web3').Nonce} [nonce] - Optional nonce tracker (if omitted, ethers auto-manages)
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<import('ethers').TransactionReceipt | null>}
 */
async function transferHtsTokenViaDelegation(eoa, tokenAddress, to, amount, nonce, gasLimit = 1_500_000) {
    const network = await eoa.provider.getNetwork();
    const transferCalldata = encodeFunctionData(
        'transfer(address to, uint256 value)',
        [to, amount]
    );
    const receipt = await waitFor(eoa.sendTransaction({
        chainId: network.chainId,
        gasLimit,
        ...(nonce ? { nonce: nonce.next() } : {}),
        to: eoa.address,
        data: encodeFunctionData(
            'execute(address target, uint256 value, bytes calldata data)',
            [tokenAddress, 0, transferCalldata]
        ),
    }));
    log('Transferred %s HTS tokens from %s to %s (via delegation)', amount, eoa.address, to);
    return receipt;
}

/**
 * Executes a batch of calls through a delegated EOA's Smart Wallet `executeBatch()`.
 * Each call is a tuple of `(address target, uint256 value, bytes data)`.
 *
 * @param {import('ethers').BaseWallet} eoa - The delegated EOA
 * @param {Array<{target: string, value: bigint, data: string}>} calls - Array of calls to execute
 * @param {import('./web3').Nonce} [nonce] - Optional nonce tracker
 * @param {number} [gasLimit=1_500_000] - Gas limit
 * @returns {Promise<import('ethers').TransactionReceipt | null>}
 */
async function executeBatchViaDelegation(eoa, calls, nonce, gasLimit = 1_500_000) {
    const network = await eoa.provider.getNetwork();
    const receipt = await waitFor(eoa.sendTransaction({
        chainId: network.chainId,
        gasLimit,
        ...(nonce ? { nonce: nonce.next() } : {}),
        to: eoa.address,
        data: encodeFunctionData(
            'executeBatch((address target, uint256 value, bytes data)[] calls)',
            [calls.map(c => [c.target, c.value, c.data])]
        ),
    }));
    log('Executed batch of %d calls from %s', calls.length, eoa.address);
    return receipt;
}

module.exports = { associateHtsToken, associateHtsTokenViaDelegation, transferHtsTokenViaDelegation, executeBatchViaDelegation, HTS_ADDRESS };
