const log = require('node:util').debuglog('hip-1340:sdk');

const sdk = require('@hiero-ledger/sdk');

/**
 * 
 * @param {string} accountId 
 */
async function getAccountInfo(accountId) {
    log('Fetching account info for account id `%s`', accountId);
    return withClient(client => new sdk.AccountInfoQuery({ accountId }).execute(client));
}

/**
 * 
 * @param {string} contractId 
 */
async function getContractByteCode(contractId) {
    log('Fetching contract bytecode for contract id `%s`', contractId);
    return withClient(client => new sdk.ContractByteCodeQuery({ contractId }).execute(client));
}

/**
 * 
 * @param {string} transactionId 
 * @returns 
 */
function getTransactionRecord(transactionId) {
    return withClient(client => new sdk.TransactionRecordQuery({transactionId, includeChildren: true}).execute(client));
}

// function getTransactionRecord2(transactionId) {
//     return withClient(client => new sdk.contract({transactionId, includeChildren: true}).execute(client));
// }

/**
 * 
 * @param {string} transactionId 
 * @returns 
 */
function getAccountRecords(accountId) {
    return withClient(client => new sdk.AccountRecordsQuery({accountId}).execute(client));
}

/**
 * 
 * @param {(client: import('@hashgraph/sdk').Client) => Promise<unknown>} fn 
 */
async function withClient(fn) {
    const operatorId = '0.0.1002';
    const operatorKey = '3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68';
    const client = sdk.Client.forNetwork({ '127.0.0.1:50211': '0.0.3' });
    client.setOperator(operatorId, operatorKey);
    const result = await fn(client);
    client.close();
    return result;
}

module.exports = { getAccountInfo, getContractByteCode, getTransactionRecord, getAccountRecords };