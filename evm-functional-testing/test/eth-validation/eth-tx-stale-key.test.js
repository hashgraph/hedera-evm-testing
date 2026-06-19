const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    AccountCreateTransaction,
    AccountId,
    AccountInfoQuery,
    Hbar,
    PrivateKey,
} = require('@hiero-ledger/sdk');

const { gas, units, deploy, EOADefaultBalance } = require('../hip-1340/utils/web3');
const { createSdkClient, createEcdsaAliasedAccount } = require('../hip-1340/utils/sdk');
const {
    rotateAccountKey,
    expectEthTxHbarTransferToFailViaBothPaths,
} = require('./utils/accounts');

const TRANSFER_VALUE = units.tinybar(100n);

describe('EthTx - key rotation validation', function () {
    let client;
    let provider;
    let network;
    let transferTarget;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();
        client = createSdkClient();
        transferTarget = await deploy('contracts/eth-validation/HbarTransferTarget');
    });

    after(function () {
        client?.close();
    });

    it('ECDSA-aliased account rejects EthTx after key rotation (relay + SDK)', async function () {
        const [oldWallet, oldKey] = await createEcdsaAliasedAccount(client, provider, new Hbar(10));

        await rotateAccountKey(oldWallet.accountId, oldKey, client);

        await expectEthTxHbarTransferToFailViaBothPaths(
            oldWallet,
            transferTarget.address,
            TRANSFER_VALUE,
            network,
            client
        );
    });

    it('Hollow account rejects EthTx after key rotation (relay + SDK)', async function () {
        const operator = (await ethers.getSigners())[0];
        const hollowWallet = ethers.Wallet.createRandom(provider);

        await operator.sendTransaction({
            chainId: network.chainId,
            nonce: await operator.getNonce(),
            gasLimit: gas.base + gas.accountCreationCost(),
            to: hollowWallet.address,
            value: EOADefaultBalance,
        }).then(tx => tx.wait());

        const accountInfo = await new AccountInfoQuery()
            .setAccountId(AccountId.fromEvmAddress(0, 0, hollowWallet.address))
            .execute(client);
        const oldKey = PrivateKey.fromStringECDSA(hollowWallet.privateKey.replace(/^0x/, ''));
        hollowWallet.accountId = accountInfo.accountId;

        await rotateAccountKey(hollowWallet.accountId, oldKey, client);

        await expectEthTxHbarTransferToFailViaBothPaths(
            hollowWallet,
            transferTarget.address,
            TRANSFER_VALUE,
            network,
            client
        );
    });

    it('ED25519 account with ECDSA alias rejects EthTx (relay + SDK)', async function () {
        const edKey = PrivateKey.generateED25519();
        const ecdsaKey = PrivateKey.generateECDSA();
        const ecdsaWallet = new ethers.Wallet('0x' + ecdsaKey.toStringRaw(), provider);

        const createResponse = await (
            await (
                await new AccountCreateTransaction()
                    .setKeyWithAlias(edKey.publicKey, ecdsaKey.publicKey)
                    .setInitialBalance(new Hbar(10))
                    .freezeWith(client)
                    .sign(edKey)
            ).sign(ecdsaKey)
        ).execute(client);
        await createResponse.getReceipt(client);

        expect(ecdsaWallet.address.toLowerCase()).to.equal(
            ('0x' + ecdsaKey.publicKey.toEvmAddress().toString()).toLowerCase()
        );

        await expectEthTxHbarTransferToFailViaBothPaths(
            ecdsaWallet,
            transferTarget.address,
            TRANSFER_VALUE,
            network,
            client
        );
    });
});
