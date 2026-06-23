const { expect } = require('chai');
const {
    AccountUpdateTransaction,
    EthereumTransaction,
    EthereumTransactionData,
    Hbar,
    PrivateKey,
    PrecheckStatusError,
    ReceiptStatusError,
} = require('@hiero-ledger/sdk');
const { gas } = require('../../hip-1340/utils/web3');

async function rotateAccountKey(accountId, oldPrivateKey, client) {
    const newPrivateKey = PrivateKey.generateECDSA();
    const tx = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setKey(newPrivateKey.publicKey)
        .freezeWith(client);
    const signed = await (await tx.sign(oldPrivateKey)).sign(newPrivateKey);
    await (await signed.execute(client)).getReceipt(client);
    return newPrivateKey;
}

async function buildEthTxRequest(wallet, toAddress, value, network) {
    return wallet.populateTransaction({
        type: 2,
        chainId: network.chainId,
        gasLimit: gas.base + gas.accountCreationCost(),
        to: toAddress,
        value,
    });
}

/**
 * @returns {Promise<{ path: 'relay', mined: boolean, receiptStatus?: number, errorMessage?: string }>}
 */
async function submitEthTxViaRelay(wallet, toAddress, value, network) {
    const txRequest = await buildEthTxRequest(wallet, toAddress, value, network);

    try {
        const receipt = await wallet.sendTransaction(txRequest).then(tx => tx.wait());
        return { path: 'relay', mined: true, receiptStatus: receipt.status };
    } catch (err) {
        return { path: 'relay', mined: false, errorMessage: err?.message ?? String(err) };
    }
}

/**
 * @returns {Promise<{ path: 'sdk', status: string }>}
 */
async function submitEthTxViaSdk(wallet, toAddress, value, network, client) {
    const txRequest = await buildEthTxRequest(wallet, toAddress, value, network);
    const signedTx = await wallet.signTransaction(txRequest);
    const ethData = EthereumTransactionData.fromBytes(
        Buffer.from(signedTx.slice(2), 'hex')
    );

    let response;
    try {
        response = await new EthereumTransaction()
            .setEthereumData(ethData.toBytes())
            .setMaxGasAllowanceHbar(new Hbar(2))
            .execute(client);
    } catch (err) {
        if (err instanceof PrecheckStatusError) {
            return { path: 'sdk', status: err.status.toString() };
        }
        throw err;
    }

    try {
        const receipt = await response.getReceipt(client);
        return { path: 'sdk', status: receipt.status.toString() };
    } catch (err) {
        if (err instanceof ReceiptStatusError) {
            return { path: 'sdk', status: err.status.toString() };
        }
        throw err;
    }
}

function isRelayRejection(result) {
    if (result.mined && result.receiptStatus === 0) {
        return true;
    }
    const message = result.errorMessage ?? '';
    return (
        message.includes('INVALID_SIGNATURE') ||
        message.includes('Requested resource not found')
    );
}

async function expectRelayEthTxHbarTransferToFail(wallet, toAddress, value, network) {
    const result = await submitEthTxViaRelay(wallet, toAddress, value, network);
    expect(
        isRelayRejection(result),
        `relay should reject the EthTx (mined=${result.mined}, error=${result.errorMessage ?? 'none'})`
    ).to.be.true;
}

async function expectSdkEthTxHbarTransferToFail(
    wallet,
    toAddress,
    value,
    network,
    client,
    expectedStatus = 'INVALID_SIGNATURE'
) {
    const result = await submitEthTxViaSdk(wallet, toAddress, value, network, client);
    expect(
        result.status,
        'SDK EthereumTransaction should reject the EthTx'
    ).to.equal(expectedStatus);
}

async function expectEthTxHbarTransferToFailViaBothPaths(
    wallet,
    toAddress,
    value,
    network,
    client
) {
    await expectRelayEthTxHbarTransferToFail(wallet, toAddress, value, network);
    await expectSdkEthTxHbarTransferToFail(
        wallet,
        toAddress,
        value,
        network,
        client
    );
}

module.exports = {
    rotateAccountKey,
    buildEthTxRequest,
    submitEthTxViaRelay,
    submitEthTxViaSdk,
    expectRelayEthTxHbarTransferToFail,
    expectSdkEthTxHbarTransferToFail,
    expectEthTxHbarTransferToFailViaBothPaths,
};
