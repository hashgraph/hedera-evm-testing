const log = require('node:util').debuglog('hip-1340:sdk');

const sdk = require('@hiero-ledger/sdk');

const hre = require('hardhat');

/**
 * @param {string} accountId
 */
async function getAccountInfo(accountId) {
    log('Fetching account info for account id `%s`', accountId);
    return runQuery(new sdk.AccountInfoQuery({ accountId }));
}

/**
 * @param {string} contractId
 */
async function getContractByteCode(contractId) {
    log('Fetching contract bytecode for contract id `%s`', contractId);
    return runQuery(new sdk.ContractByteCodeQuery({ contractId }));
}

/**
 * @param {string} transactionId
 * @returns
 */
function getTransactionRecord(transactionId) {
    return runQuery(new sdk.TransactionRecordQuery({ transactionId, includeChildren: true }));
}

/**
 * @param {string} accountId
 * @returns
 */
function getAccountRecords(accountId) {
    return runQuery(new sdk.AccountRecordsQuery({ accountId }));
}

async function runQuery(query) {
    const { networkNode, operatorId, operatorKey } = hre.network.config.sdkClient;
    const client = sdk.Client.forNetwork(networkNode)
        .setOperator(operatorId, operatorKey);
    const result = await query.execute(client);
    client.close();
    return result;
}

// ============================================================
// Delegation Helper Functions
// ============================================================

/**
 * Creates an SDK client with optional custom operator
 * @param {sdk.AccountId} [operatorId]
 * @param {sdk.PrivateKey} [operatorKey]
 * @returns {sdk.Client}
 */
function createSdkClient(operatorId, operatorKey) {
    const { networkNode, operatorId: defaultId, operatorKey: defaultKey } = hre.network.config.sdkClient;
    return sdk.Client.forNetwork(networkNode)
        .setOperator(operatorId || defaultId, operatorKey || defaultKey);
}

/**
 * Creates a new account with delegation set via AccountCreateTransaction
 *
 * @param {sdk.PrivateKey} privateKey - The private key for the new account
 * @param {string} delegationAddress - EVM address to delegate to (e.g., "0x...")
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<{accountId: sdk.AccountId, privateKey: sdk.PrivateKey}>}
 */
async function createAccountWithDelegation(privateKey, delegationAddress, client) {
    log('Creating account with delegation to `%s`', delegationAddress);

    const tx = new sdk.AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(sdk.Hbar.fromTinybars(10_000_000_000n))
        .setDelegationAddress(sdk.EvmAddress.fromString(delegationAddress));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    log('Account `%s` created with delegation to `%s`', receipt.accountId.toString(), delegationAddress);
    return { accountId: receipt.accountId, privateKey };
}

/**
 * Creates a new account without delegation via AccountCreateTransaction
 *
 * @param {sdk.PrivateKey} privateKey - The private key for the new account
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<{accountId: sdk.AccountId, privateKey: sdk.PrivateKey}>}
 */
async function createAccount(privateKey, client) {
    log('Creating account without delegation');

    const tx = new sdk.AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(sdk.Hbar.fromTinybars(10_000_000_000n));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    log('Account `%s` created', receipt.accountId.toString());
    return { accountId: receipt.accountId, privateKey };
}

/**
 * Updates an existing account to set delegation via AccountUpdateTransaction
 *
 * @param {sdk.AccountId} accountId - The account to update
 * @param {sdk.PrivateKey} privateKey - The account's private key
 * @param {string} delegationAddress - EVM address to delegate to
 * @param {sdk.Client} client - SDK client
 */
async function updateAccountDelegation(accountId, privateKey, delegationAddress, client) {
    log('Updating account `%s` delegation to `%s`', accountId.toString(), delegationAddress);

    const tx = new sdk.AccountUpdateTransaction()
        .setAccountId(accountId)
        .setDelegationAddress(sdk.EvmAddress.fromString(delegationAddress))
        .freezeWith(client);

    const signedTx = await tx.sign(privateKey);
    const response = await signedTx.execute(client);
    await response.getReceipt(client);

    log('Account `%s` delegation updated to `%s`', accountId.toString(), delegationAddress);
}

/**
 * Updates an existing account without modifying delegation (e.g., update memo)
 *
 * @param {sdk.AccountId} accountId - The account to update
 * @param {sdk.PrivateKey} privateKey - The account's private key
 * @param {string} memo - New memo for the account
 * @param {sdk.Client} client - SDK client
 */
async function updateAccountWithoutDelegation(accountId, privateKey, memo, client) {
    log('Updating account `%s` memo without touching delegation', accountId.toString());

    const tx = new sdk.AccountUpdateTransaction()
        .setAccountId(accountId)
        .setAccountMemo(memo)
        .freezeWith(client);

    const signedTx = await tx.sign(privateKey);
    const response = await signedTx.execute(client);
    await response.getReceipt(client);

    log('Account `%s` memo updated to `%s`', accountId.toString(), memo);
}

/**
 * Clears delegation by setting it to zero address via AccountUpdateTransaction
 *
 * @param {sdk.AccountId} accountId - The account to update
 * @param {sdk.PrivateKey} privateKey - The account's private key
 * @param {sdk.Client} client - SDK client
 */
async function clearAccountDelegation(accountId, privateKey, client) {
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    log('Clearing account `%s` delegation (setting to zero address)', accountId.toString());

    const tx = new sdk.AccountUpdateTransaction()
        .setAccountId(accountId)
        .setDelegationAddress(sdk.EvmAddress.fromString(zeroAddress))
        .freezeWith(client);

    const signedTx = await tx.sign(privateKey);
    const response = await signedTx.execute(client);
    await response.getReceipt(client);

    log('Account `%s` delegation cleared', accountId.toString());
}

/**
 * Gets delegation address from account info
 *
 * @param {sdk.AccountId} accountId - The account to query
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<string|null>} - Delegation address or null if none
 */
async function getDelegationAddress(accountId, client) {
    const accountInfo = await new sdk.AccountInfoQuery()
        .setAccountId(accountId)
        .execute(client);

    const delegationAddressHex = accountInfo.delegationAddress && accountInfo.delegationAddress.length > 0
        ? '0x' + Buffer.from(accountInfo.delegationAddress).toString('hex')
        : null;

    log('Account `%s` has delegation address: %s', accountId.toString(), delegationAddressHex);
    return delegationAddressHex;
}

/**
 * Calls a delegated EOA via ContractExecuteTransaction
 *
 * @param {string} eoaEvmAddress - The EVM address of the delegated EOA
 * @param {Uint8Array} functionParameters - The encoded function call data
 * @param {number} gas - Gas limit for the call
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<sdk.TransactionResponse>}
 */
async function contractCallToDelegatedEOA(eoaEvmAddress, functionParameters, gas, client) {
    log('ContractCall to delegated EOA `%s` with gas %d', eoaEvmAddress, gas);

    const contractId = sdk.ContractId.fromEvmAddress(0, 0, eoaEvmAddress);

    const tx = new sdk.ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(gas)
        .setFunctionParameters(functionParameters);

    const response = await tx.execute(client);
    log('ContractCall executed: tx %s', response.transactionId.toString());

    return response;
}

/**
 * Verifies delegation setup using AccountInfoQuery and ContractByteCodeQuery
 *
 * @param {sdk.AccountId} accountId - The account to verify
 * @param {string} expectedDelegationAddress - Expected delegation EVM address
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<{accountInfo: sdk.AccountInfo, bytecode: Uint8Array, delegationAddress: string|null, isValid: boolean}>}
 */
async function verifyDelegationWithSDK(accountId, expectedDelegationAddress, client) {
    log('Verifying delegation for account `%s`, expecting `%s`', accountId.toString(), expectedDelegationAddress);

    const accountInfo = await new sdk.AccountInfoQuery()
        .setAccountId(accountId)
        .execute(client);

    const bytecode = await new sdk.ContractByteCodeQuery()
        .setContractId(sdk.ContractId.fromString(accountId.toString()))
        .execute(client);

    const expectedIndicator = `ef0100${expectedDelegationAddress.slice(2).toLowerCase()}`;
    const actualBytecode = Buffer.from(bytecode).toString('hex');

    const delegationAddressHex = accountInfo.delegationAddress
        ? '0x' + Buffer.from(accountInfo.delegationAddress).toString('hex')
        : null;

    const isValid =
        delegationAddressHex?.toLowerCase() === expectedDelegationAddress.toLowerCase() &&
        actualBytecode === expectedIndicator;

    log('Delegation verification: delegationAddress=%s, bytecode=%s, valid=%s',
        delegationAddressHex,
        actualBytecode,
        isValid
    );

    return {
        accountInfo,
        bytecode,
        delegationAddress: delegationAddressHex,
        isValid
    };
}

/**
 * Executes a BatchTransaction with multiple inner transactions
 *
 * @param {sdk.Transaction[]} transactions - Array of frozen transactions with batchKey set
 * @param {sdk.PrivateKey} batchKey - The batch key to sign with
 * @param {sdk.Client} client - SDK client
 * @returns {Promise<sdk.TransactionResponse>}
 */
async function executeBatchTransaction(transactions, batchKey, client) {
    log('Executing batch transaction with %d inner transactions', transactions.length);

    const batchTx = new sdk.BatchTransaction();

    for (const tx of transactions) {
        batchTx.addInnerTransaction(tx);
    }

    batchTx.freezeWith(client);
    const signedBatch = await batchTx.sign(batchKey);

    const response = await signedBatch.execute(client);
    log('Batch transaction executed: tx %s', response.transactionId.toString());

    return response;
}

module.exports = {
    // Existing exports
    getAccountInfo,
    getContractByteCode,
    getTransactionRecord,
    getAccountRecords,
    // Delegation exports
    createSdkClient,
    createAccount,
    createAccountWithDelegation,
    updateAccountDelegation,
    updateAccountWithoutDelegation,
    clearAccountDelegation,
    getDelegationAddress,
    contractCallToDelegatedEOA,
    verifyDelegationWithSDK,
    executeBatchTransaction
};
