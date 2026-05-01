const log = require('node:util').debuglog('hip-1340:sdk');

const {
    AccountCreateTransaction,
    AccountId,
    AccountInfo,
    AccountInfoQuery,
    AccountRecordsQuery,
    AccountUpdateTransaction,
    BatchTransaction,
    Client,
    ContractByteCodeQuery,
    ContractExecuteTransaction,
    ContractId,
    EvmAddress,
    EthereumTransaction,
    Hbar,
    PrivateKey,
    Transaction,
    TransactionRecordQuery,
    TransactionResponse,
    TransferTransaction,
    EthereumTransactionDataEip7702,
} = require('@hiero-ledger/sdk');

const hre = require('hardhat');
const { ethers } = require('hardhat');
const { hexlify } = require('ethers');

/**
 * @param {string} accountId
 */
async function getAccountInfo(accountId) {
    log('Fetching account info for account id `%s`', accountId);
    return runQuery(new AccountInfoQuery({ accountId }));
}

/**
 * @param {string} contractId
 */
async function getContractByteCode(contractId) {
    log('Fetching contract bytecode for contract id `%s`', contractId);
    return runQuery(new ContractByteCodeQuery({ contractId }));
}

/**
 * @param {string} transactionId
 * @returns
 */
function getTransactionRecord(transactionId) {
    return runQuery(new TransactionRecordQuery({ transactionId, includeChildren: true }));
}

function getTransactionRecordUnchecked(transactionId) {
    return runQuery(new TransactionRecordQuery({ transactionId, includeChildren: true, validateReceiptStatus: false }));
}

/**
 * @param {string} accountId
 * @returns
 */
function getAccountRecords(accountId) {
    return runQuery(new AccountRecordsQuery({ accountId }));
}

async function runQuery(query) {
    const { networkNode, operatorId, operatorKey } = hre.network.config.sdkClient;
    const client = Client.forNetwork(networkNode)
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
 * @param {AccountId} [operatorId]
 * @param {PrivateKey} [operatorKey]
 * @returns {Client}
 */
function createSdkClient(operatorId, operatorKey) {
    const { networkNode, operatorId: defaultId, operatorKey: defaultKey } = hre.network.config.sdkClient;
    return Client.forNetwork(networkNode)
        .setOperator(operatorId || defaultId, operatorKey || defaultKey);
}

/**
 * Creates a new account with delegation set via AccountCreateTransaction
 *
 * @param {PrivateKey} privateKey - The private key for the new account
 * @param {string} delegationAddress - EVM address to delegate to (e.g., "0x...")
 * @param {Client} client - SDK client
 * @returns {Promise<{accountId: AccountId, privateKey: PrivateKey}>}
 */
async function createAccountWithDelegation(privateKey, delegationAddress, client) {
    log('Creating account with delegation to `%s`', delegationAddress);

    const tx = new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(new Hbar(10))
        .setDelegationAddress(EvmAddress.fromString(delegationAddress));

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    log('Account `%s` created with delegation to `%s`', receipt.accountId.toString(), delegationAddress);
    return { accountId: receipt.accountId, privateKey };
}

/**
 * Creates a new account without delegation via AccountCreateTransaction
 *
 * @param {PrivateKey} privateKey - The private key for the new account
 * @param {Client} client - SDK client
 * @returns {Promise<{accountId: AccountId, privateKey: PrivateKey}>}
 */
async function createAccount(privateKey, client) {
    log('Creating account without delegation');

    return createAccountWithBalance(privateKey, client, new Hbar(10));
}

/**
 * Creates a new account without delegation via AccountCreateTransaction
 *
 * @param {PrivateKey} privateKey - The private key for the new account
 * @param {Client} client - SDK client
 * @param {Hbar} initialBalance - Initial balance in Hbar
 * @returns {Promise<{accountId: AccountId, privateKey: PrivateKey}>}
 */
async function createAccountWithBalance(privateKey, client, initialBalance) {
    const tx = new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(initialBalance);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    log('Account `%s` created', receipt.accountId.toString());
    return { accountId: receipt.accountId, privateKey };
}

/**
 * Updates an existing account to set delegation via AccountUpdateTransaction
 *
 * @param {AccountId} accountId - The account to update
 * @param {PrivateKey} privateKey - The account's private key
 * @param {string} delegationAddress - EVM address to delegate to
 * @param {Client} client - SDK client
 */
async function updateAccountDelegation(accountId, privateKey, delegationAddress, client) {
    log('Updating account `%s` delegation to `%s`', accountId.toString(), delegationAddress);

    const tx = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setDelegationAddress(EvmAddress.fromString(delegationAddress))
        .freezeWith(client);

    const signedTx = await tx.sign(privateKey);
    const response = await signedTx.execute(client);
    await response.getReceipt(client);

    log('Account `%s` delegation updated to `%s`', accountId.toString(), delegationAddress);
}

/**
 * Updates an existing account without modifying delegation (e.g., update memo)
 *
 * @param {AccountId} accountId - The account to update
 * @param {PrivateKey} privateKey - The account's private key
 * @param {string} memo - New memo for the account
 * @param {Client} client - SDK client
 */
async function updateAccountWithoutDelegation(accountId, privateKey, memo, client) {
    log('Updating account `%s` memo without touching delegation', accountId.toString());

    const tx = new AccountUpdateTransaction()
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
 * @param {AccountId} accountId - The account to update
 * @param {PrivateKey} privateKey - The account's private key
 * @param {Client} client - SDK client
 */
async function clearAccountDelegation(accountId, privateKey, client) {
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    log('Clearing account `%s` delegation (setting to zero address)', accountId.toString());

    const tx = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setDelegationAddress(EvmAddress.fromString(zeroAddress))
        .freezeWith(client);

    const signedTx = await tx.sign(privateKey);
    const response = await signedTx.execute(client);
    await response.getReceipt(client);

    log('Account `%s` delegation cleared', accountId.toString());
}

/**
 * Gets delegation address from account info
 *
 * @param {AccountId} accountId - The account to query
 * @param {Client} client - SDK client
 * @returns {Promise<string|null>} - Delegation address or null if none
 */
async function getDelegationAddress(accountId, client) {
    const accountInfo = await new AccountInfoQuery()
        .setAccountId(accountId)
        .execute(client);

    const delegationAddressHex = hexlify(accountInfo.delegationAddress);

    log('Account `%s` has delegation address: %s', accountId.toString(), delegationAddressHex);
    return delegationAddressHex;
}

/**
 * Calls a delegated EOA via ContractExecuteTransaction
 *
 * @param {string} eoaEvmAddress - The EVM address of the delegated EOA
 * @param {Uint8Array} functionParameters - The encoded function call data
 * @param {number} gas - Gas limit for the call
 * @param {Client} client - SDK client
 * @returns {Promise<TransactionResponse>}
 */
async function contractCallToDelegatedEOA(eoaEvmAddress, functionParameters, gas, client) {
    log('ContractCall to delegated EOA `%s` with gas %d', eoaEvmAddress, gas);

    const contractId = ContractId.fromEvmAddress(0, 0, eoaEvmAddress);

    const tx = new ContractExecuteTransaction()
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
 * @param {AccountId} accountId - The account to verify
 * @param {string} expectedDelegationAddress - Expected delegation EVM address
 * @param {Client} client - SDK client
 * @returns {Promise<{accountInfo: AccountInfo, bytecode: Uint8Array, delegationAddress: string|null, isValid: boolean}>}
 */
async function verifyDelegationWithSDK(accountId, expectedDelegationAddress, client) {
    log('Verifying delegation for account `%s`, expecting `%s`', accountId.toString(), expectedDelegationAddress);

    const accountInfo = await new AccountInfoQuery()
        .setAccountId(accountId)
        .execute(client);

    const bytecode = await new ContractByteCodeQuery()
        .setContractId(ContractId.fromString(accountId.toString()))
        .execute(client);

    const expectedIndicator = `ef0100${expectedDelegationAddress.slice(2).toLowerCase()}`;
    const actualBytecode = Buffer.from(bytecode).toString('hex');

    const delegationAddressHex = hexlify(accountInfo.delegationAddress);

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
 * Verifies delegation setup using AccountInfoQuery and ContractByteCodeQuery
 *
 * @param {string} address - The account to verify
 * @param {string} expectedDelegationAddress - Expected delegation EVM address
 * @param {Client} client - SDK client
 * @returns {Promise<{accountInfo: AccountInfo, bytecode: Uint8Array, delegationAddress: string|null, isValid: boolean}>}
 */
async function verifyDelegationWithSdkByAddress(address, expectedDelegationAddress, client) {
    return verifyDelegationWithSDK(
        AccountId.fromEvmAddress(0, 0, address),
        expectedDelegationAddress,
        client
    );
}

/**
 * Executes a BatchTransaction with multiple inner transactions.
 *
 * If `batchKey` is omitted, relies on `.execute(client)` auto-signing with the
 * client's operator key — which is the correct path when inner transactions
 * were batchified with `client.operatorPublicKey`.
 *
 * @param {Transaction[]} transactions - Array of inner transactions (already frozen via batchify).
 * @param {Client} client - SDK client used to execute the batch.
 * @param {PrivateKey} [batchKey] - Optional explicit batch key to sign with.
 * @returns {Promise<TransactionResponse>}
 */
async function executeBatchTransaction(transactions, client, batchKey) {
    log('Executing batch transaction with %d inner transactions', transactions.length);

    const batchTx = new BatchTransaction();
    for (const tx of transactions) {
        batchTx.addInnerTransaction(tx);
    }

    let toExecute = batchTx;
    if (batchKey) {
        batchTx.freezeWith(client);
        toExecute = await batchTx.sign(batchKey);
    }

    const response = await toExecute.execute(client);
    log('Batch transaction executed: tx %s', response.transactionId.toString());

    return response;
}

/**
 * Creates a new ECDSA-aliased Hedera account via the SDK and returns the
 * matching ethers wallet (so callers can sign EVM txs with the same key).
 *
 * @param {Client} client - SDK client used to submit and pay for the AccountCreateTransaction.
 * @param {import('ethers').Provider} provider - ethers provider attached to the returned wallet.
 * @param {Hbar} initialBalance - Starting balance for the new account.
 * @returns {Promise<import('ethers').BaseWallet>} ethers wallet backed by the same ECDSA key as the new Hedera account.
 */
async function createEcdsaAliasedAccount(client, provider, initialBalance) {
    const wallet = ethers.Wallet.createRandom(provider);
    const key = PrivateKey.fromStringECDSA(wallet.privateKey);
    await (
        await (
            await new AccountCreateTransaction()
                .setECDSAKeyWithAlias(key.publicKey)
                .setInitialBalance(initialBalance)
                .freezeWith(client)
                .sign(key)
        ).execute(client)
    ).getReceipt(client);
    return wallet;
}

/**
 * Wraps signed type-4 bytes in an EthereumTransaction batchified under the
 * operator key. fromBytes(...).toBytes() is a byte-equivalent round-trip that
 * acts as a fail-fast validator for the RLP/authorizationList shape.
 *
 * @param {string} rawType4Tx - 0x-prefixed hex of a signed EIP-7702 (type-4) transaction.
 * @param {Client} client - SDK client whose operator key is used as the batch key.
 * @returns {Promise<EthereumTransaction>} An EthereumTransaction frozen and signed by the operator, ready to be added to a BatchTransaction.
 */
async function wrapType4ForBatch(rawType4Tx, client) {
    const eip7702Data = EthereumTransactionDataEip7702.fromBytes(
        Buffer.from(rawType4Tx.slice(2), 'hex')
    );
    return new EthereumTransaction()
        .setEthereumData(eip7702Data.toBytes())
        .setMaxGasAllowanceHbar(new Hbar(2))
        .batchify(client, client.operatorPublicKey);
}

/**
 * Helper to create a simple transfer transaction between two accounts, already batchified under the operator key.
 * @param {Client} client
 * @param {AccountId} fromAccountId
 * @param {AccountId} toAccountId
 * @returns {Promise<TransferTransaction>}
 */
async function createBatchifiedTransfer(client, fromAccountId, toAccountId) {
    return await new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-1))
        .addHbarTransfer(toAccountId, new Hbar(1))
        .batchify(client, client.operatorPublicKey);
}

module.exports = {
    // Existing exports
    getAccountInfo,
    getContractByteCode,
    getTransactionRecord,
    getTransactionRecordUnchecked,
    getAccountRecords,
    // Delegation exports
    createSdkClient,
    createAccount,
    createAccountWithBalance,
    createAccountWithDelegation,
    createBatchifiedTransfer,
    createEcdsaAliasedAccount,
    updateAccountDelegation,
    updateAccountWithoutDelegation,
    clearAccountDelegation,
    getDelegationAddress,
    contractCallToDelegatedEOA,
    verifyDelegationWithSDK,
    verifyDelegationWithSdkByAddress,
    executeBatchTransaction,
    wrapType4ForBatch
};
