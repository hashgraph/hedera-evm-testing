const log = require('node:util').debuglog('hip-1340:sdk');

const sdk = require('@hiero-ledger/sdk');

const hre = require('hardhat');
const { ethers } = require('hardhat');

/**
 * 
 * @param {string} accountId 
 */
async function getAccountInfo(accountId) {
    log('Fetching account info for account id `%s`', accountId);
    return runQuery(new sdk.AccountInfoQuery({ accountId }));
}

/**
 * 
 * @param {string} contractId 
 */
async function getContractByteCode(contractId) {
    log('Fetching contract bytecode for contract id `%s`', contractId);
    return runQuery(new sdk.ContractByteCodeQuery({ contractId }));
}

/**
 * 
 * @param {string} transactionId 
 * @returns 
 */
function getTransactionRecord(transactionId) {
    return runQuery(new sdk.TransactionRecordQuery({ transactionId, includeChildren: true }));
}

/**
 * 
 * @param {string} transactionId 
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

/**
 * Creates a new ECDSA-aliased Hedera account via the SDK and returns the
 * matching ethers wallet (so callers can sign EVM txs with the same key).
 *
 * @param {sdk.Client} client - SDK client used to submit and pay for the AccountCreateTransaction.
 * @param {import('ethers').Provider} provider - ethers provider attached to the returned wallet.
 * @param {sdk.Hbar} initialBalance - Starting balance for the new account.
 * @returns {Promise<import('ethers').BaseWallet>} ethers wallet backed by the same ECDSA key as the new Hedera account.
 */
async function createEcdsaAliasedAccount(client, provider, initialBalance) {
    const wallet = ethers.Wallet.createRandom(provider);
    const key = sdk.PrivateKey.fromStringECDSA(wallet.privateKey);
    const receipt = await (
        await (
            await new sdk.AccountCreateTransaction()
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
 * @param {sdk.Client} client - SDK client whose operator key is used as the batch key.
 * @returns {Promise<sdk.EthereumTransaction>} An EthereumTransaction frozen and signed by the operator, ready to be added to a BatchTransaction.
 */
async function wrapType4ForBatch(rawType4Tx, client) {
    const eip7702Data = sdk.EthereumTransactionDataEip7702.fromBytes(
        Buffer.from(rawType4Tx.slice(2), 'hex')
    );
    return new sdk.EthereumTransaction()
        .setEthereumData(eip7702Data.toBytes())
        .setMaxGasAllowanceHbar(new sdk.Hbar(2))
        .batchify(client, client.operatorPublicKey);
}

module.exports = {
    getAccountInfo,
    getContractByteCode,
    getTransactionRecord,
    getAccountRecords,
    createEcdsaAliasedAccount,
    wrapType4ForBatch
};