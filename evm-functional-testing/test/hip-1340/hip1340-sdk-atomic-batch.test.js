'use strict';
const { ethers } = require('hardhat');
const { hexlify } = require('ethers');
const hre = require('hardhat');
const { expect } = require('chai');
const {
    AccountCreateTransaction,
    AccountId,
    AccountInfoQuery,
    BatchTransaction,
    EthereumTransaction,
    EthereumTransactionDataEip7702,
    PrivateKey,
    Hbar,
    Client,
    TransferTransaction,
} = require('@hiero-ledger/sdk');
const { gas, deploy, getNonces, DelegationTransactionBuilder } = require('./utils/web3');

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';

describe('Atomic Batch: EIP-7702 delegation', function () {
    let client, provider, network, smartWalletAddress, sponsor, zeroBalanceAccount;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();

        const { sdkClient } = hre.network.config;
        client = Client.forNetwork(sdkClient.networkNode)
            .setOperator(sdkClient.operatorId, sdkClient.operatorKey);

        // Deploy the smart wallet contract once
        ({ address: smartWalletAddress } = await deploy(SIMPLE_7702_ACCOUNT));

        sponsor = new ethers.Wallet(hre.network.config.accounts[0], provider);

        zeroBalanceAccount = ethers.Wallet.createRandom(provider);
        const zeroBalanceAccountKey = PrivateKey.fromStringECDSA(zeroBalanceAccount.privateKey);
        const zeroBalanceAccountReceipt = await (
            await (
                await new AccountCreateTransaction()
                    .setECDSAKeyWithAlias(zeroBalanceAccountKey.publicKey)
                    .setInitialBalance(new Hbar(0))
                    .freezeWith(client)
                    .sign(zeroBalanceAccountKey)
            ).execute(client)
        ).getReceipt(client);

        expect(zeroBalanceAccountReceipt.status.toString()).to.equal('SUCCESS');
        const zeroBalanceAccountInfo = await new AccountInfoQuery()
            .setAccountId(AccountId.fromEvmAddress(0, 0, zeroBalanceAccount.address))
            .execute(client);
        expect(zeroBalanceAccountInfo.balance).to.equal(0);
    });

    after(function () {
        client?.close();
    });

    describe('Atomic batch outcome and delegation survival', function () {
        it('should commit delegation for pre-existing account', async function () {
            // Account A is created OUTSIDE the batch via a standalone AccountCreateTransaction
            // so A exists on-chain (with nonce 0) before the batch executes.
            const accountA = ethers.Wallet.createRandom(provider);
            const accountAKey = PrivateKey.fromStringECDSA(accountA.privateKey);
            const createReceipt = await (
                await (
                    await new AccountCreateTransaction()
                        .setECDSAKeyWithAlias(accountAKey.publicKey)
                        .setInitialBalance(new Hbar(1))
                        .freezeWith(client)
                        .sign(accountAKey)
                ).execute(client)
            ).getReceipt(client);
            expect(createReceipt.status.toString()).to.equal('SUCCESS');
            expect(createReceipt.accountId).to.not.be.null;

            // Inner tx 1: type-4 delegation on pre-existing account A, wrapped in EthereumTransaction.
            // Fetch the sponsor's consensus-node nonce explicitly
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 0)
                .sign();
            // Parse signed bytes through EthereumTransactionDataEip7702 for additional fail fast validation
            const eip7702Data = EthereumTransactionDataEip7702.fromBytes(
                Buffer.from(rawType4Tx.slice(2), 'hex')
            );
            const delegationInnerTx = await new EthereumTransaction()
                .setEthereumData(eip7702Data.toBytes())
                .setMaxGasAllowanceHbar(new Hbar(2))
                .batchify(client, client.operatorPublicKey);

            const transferInnerTx = await new TransferTransaction()
                .addHbarTransfer(client.operatorAccountId, new Hbar(-1))
                .addHbarTransfer(accountA.address, new Hbar(1))
                .batchify(client, client.operatorPublicKey);

            const batchReceipt = await (
                await new BatchTransaction()
                    .addInnerTransaction(delegationInnerTx)
                    .addInnerTransaction(transferInnerTx)
                    .execute(client)
            ).getReceipt(client);

            expect(batchReceipt.status.toString()).to.equal('SUCCESS');

            // Expected: delegation on A is committed
            const accountInfo = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
                .execute(client);
            expect(hexlify(accountInfo.delegationAddress).toLowerCase())
                .to.equal(smartWalletAddress.toLowerCase());
        });
    })

    describe('Authority account created inside the atomic batch', function () {
        it('should create an account and set delegation to it', async function () {
            // Generate ECDSA key for the new account
            // Start from an ethers wallet so we can call .authorize() later.
            // Import the same key into the SDK for AccountCreateTransaction.
            const newAccountEthersWallet = ethers.Wallet.createRandom(provider);
            const newAccountKey = PrivateKey.fromStringECDSA(newAccountEthersWallet.privateKey);
            const newAccountEvmAddress = newAccountEthersWallet.address;

            // Inner tx 1: AccountCreateTransaction
            // Setting an ECDSA key auto-assigns the EVM alias (= newAccountEvmAddress).
            // batchify(): sets batch key to operator key, freezes, signs with operator.
            // We then add the new account's self-signature (required for ECDSA alias accounts).
            const accountCreateTx = await (
                await new AccountCreateTransaction()
                    .setECDSAKeyWithAlias(newAccountKey.publicKey)
                    .setInitialBalance(new Hbar(10))
                    .batchify(client, client.operatorPublicKey)
            ).sign(newAccountKey);

            // Build the signed type-4 raw bytes
            // The sponsor (operator) pays gas; the new account signs only the authorizationList.
            // chainId: 0  → auth valid on any chain
            // nonce: 0    → new account starts at nonce 0 (it doesn't exist yet)
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withAuthorization(newAccountEthersWallet, smartWalletAddress, 0)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .sign();

            // Parse signed bytes through EthereumTransactionDataEip7702 for additional fail fast validation
            const eip7702Data = EthereumTransactionDataEip7702.fromBytes(
                Buffer.from(rawType4Tx.slice(2), 'hex')  // strip '0x' prefix
            );

            // Inner tx 2: EthereumTransaction wrapping the type-4 data
            const ethereumTx = await new EthereumTransaction()
                .setEthereumData(eip7702Data.toBytes())
                .setMaxGasAllowanceHbar(new Hbar(2))
                .batchify(client, client.operatorPublicKey);

            // Assemble and execute the BatchTransaction
            const batchReceipt = await (
                await new BatchTransaction()
                    .addInnerTransaction(accountCreateTx)
                    .addInnerTransaction(ethereumTx)
                    .execute(client)
            ).getReceipt(client);

            expect(batchReceipt.status.toString()).to.equal('SUCCESS');

            // Verify the delegation the SDK way
            const accountInfo = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, newAccountEvmAddress))
                .execute(client);

            const actualDelegation = hexlify(accountInfo.delegationAddress);
            expect(actualDelegation.toLowerCase()).to.equal(smartWalletAddress.toLowerCase());
        });
    })

});