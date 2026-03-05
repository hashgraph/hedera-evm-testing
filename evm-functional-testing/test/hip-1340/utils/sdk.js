const log = require('node:util').debuglog('hip-1340:sdk');

const sdk = require('@hiero-ledger/sdk');

const hre = require('hardhat');

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

module.exports = { getAccountInfo, getContractByteCode, getTransactionRecord, getAccountRecords };