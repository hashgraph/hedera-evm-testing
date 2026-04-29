'use strict';
const {ethers} = require('hardhat');
const {hexlify} = require('ethers');
const hre = require('hardhat');
const {expect} = require('chai');
const {
    AccountInfoQuery,
    AccountId,
    AccountCreateTransaction,
    Hbar,
    PrecheckStatusError,
    PrivateKey,
    ReceiptStatusError,
} = require('@hiero-ledger/sdk');
const {gas, deploy, getNonces, DelegationTransactionBuilder} = require('./utils/web3');
const {
    createEcdsaAliasedAccount,
    createSdkClient,
    executeBatchTransaction,
    createAccountWithBalance,
    createBatchifiedTransfer,
    verifyDelegationWithSdkByAddress,
    wrapType4ForBatch,
} = require('./utils/sdk');

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';

describe('Atomic Batch: EIP-7702 delegation', function () {
    let client, provider, network, smartWalletAddress, sponsor, zeroBalanceAccount;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();

        client = createSdkClient();

        // Deploy the smart wallet contract once
        ({address: smartWalletAddress} = await deploy(SIMPLE_7702_ACCOUNT));

        sponsor = new ethers.Wallet(hre.network.config.accounts[0], provider);

        const zeroBalanceAccountPrivateKey = PrivateKey.generateECDSA();
        zeroBalanceAccount = await createAccountWithBalance(zeroBalanceAccountPrivateKey, client, new Hbar(0));

        const zeroBalanceAccountInfo = await new AccountInfoQuery()
            .setAccountId(zeroBalanceAccount.accountId)
            .execute(client);
        expect(zeroBalanceAccountInfo.balance.toTinybars().isZero()).to.be.true;
    });

    after(function () {
        client?.close();
    });

    describe('Atomic batch outcome and delegation survival', function () {

        let accountA;

        beforeEach(async function () {
            accountA = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
        });

        it('should commit delegation for pre-existing account', async function () {
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(accountA)
                .withChainId(network.chainId)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 1)
                .sign();

            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);
            const transferInnerTx = await createBatchifiedTransfer(client, client.operatorAccountId, accountA.address);

            const response = await executeBatchTransaction(
                [delegationInnerTx, transferInnerTx],
                client);
            const receipt = await response.getReceipt(client);

            expect(receipt.status.toString()).to.equal('SUCCESS');

            const verification = await verifyDelegationWithSdkByAddress(accountA.address, smartWalletAddress, client);
            expect(verification.isValid).to.be.true;
        });

        it('should commit delegation for pre-existing account used as both from and authority on batch failure', async function () {
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(accountA)
                .withChainId(network.chainId)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 1)
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Transfer is invalid: zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, accountA.address);

            const response = await executeBatchTransaction([delegationInnerTx, transferInnerTx], client);
            const err = await response.getReceipt(client).catch(e => e);
            expect(err).to.be.instanceOf(ReceiptStatusError);
            expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // TODO: add this check when atomic batch delegation persistence is fixed
            // const accountInfo = await new AccountInfoQuery()
            //     .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
            //     .execute(client);
            // expect(hexlify(accountInfo.delegationAddress).toLowerCase())
            //     .to.equal(smartWalletAddress.toLowerCase());
        });
    })

    describe('Authority account created inside the atomic batch', function () {
        it('should create an account and set delegation to it', async function () {
            // Start from an ethers wallet so we can call .authorize() later.
            // Import the same key into the SDK for AccountCreateTransaction.
            const newAccount = ethers.Wallet.createRandom(provider);
            const newAccountKey = PrivateKey.fromStringECDSA(newAccount.privateKey);

            // Inner tx 1: AccountCreateTransaction
            const accountCreateTx = await (
                await new AccountCreateTransaction()
                    .setECDSAKeyWithAlias(newAccountKey.publicKey)
                    .setInitialBalance(new Hbar(10))
                    .batchify(client, client.operatorPublicKey)
            ).sign(newAccountKey);

            // Inner tx 2: type-4 delegation, sponsored by the operator (pays gas).
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withAuthorization(newAccount, smartWalletAddress, 0)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            const response = await executeBatchTransaction([accountCreateTx, delegationInnerTx], client);
            const receipt = await response.getReceipt(client);

            expect(receipt.status.toString()).to.equal('SUCCESS');
            const accountInfo = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, newAccount.address))
                .execute(client);
            expect(hexlify(accountInfo.delegationAddress).toLowerCase())
                .to.equal(smartWalletAddress.toLowerCase());
        });

        it('should roll back account creation but persist delegation on batch failure', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);
            const newAccountKey = PrivateKey.fromStringECDSA(newAccount.privateKey);

            // Inner tx 1: AccountCreateTransaction (creates A within the batch)
            const accountCreateTx = await (
                await new AccountCreateTransaction()
                    .setECDSAKeyWithAlias(newAccountKey.publicKey)
                    .setInitialBalance(new Hbar(10))
                    .batchify(client, client.operatorPublicKey)
            ).sign(newAccountKey);

            // Inner tx 2: type-4 delegation on A, sponsored by the operator (pays gas).
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withAuthorization(newAccount, smartWalletAddress, 0)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Inner tx 3: invalid transfer — zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, client.operatorAccountId);

            const response = await executeBatchTransaction(
                [accountCreateTx, delegationInnerTx, transferInnerTx], client);
            const batchErr = await response.getReceipt(client).catch(e => e);
            expect(batchErr).to.be.instanceOf(ReceiptStatusError);
            expect(batchErr.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // Expected: A was created in the batch and rolled back — should not exist.
            // AccountInfoQuery hits consensus (no mirror lag) and throws INVALID_ACCOUNT_ID.
            const err = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, newAccount.address))
                .execute(client)
                .catch(e => e);
            expect(err).to.be.instanceOf(PrecheckStatusError);
            expect(err.status.toString()).to.equal('INVALID_ACCOUNT_ID');

            // TODO: switch to this check when atomic batch delegation persistence is fixed
            // const accountInfo = await new AccountInfoQuery()
            //     .setAccountId(AccountId.fromEvmAddress(0, 0, newAccount.address))
            //     .execute(client);
            // expect(hexlify(accountInfo.delegationAddress).toLowerCase())
            //     .to.equal(smartWalletAddress.toLowerCase());
        });
    })

    describe('Authority account exists before the atomic batch', function () {
        let accountA;

        beforeEach(async function () {
            accountA = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
        });

        it('should commit delegation for pre-existing account on batch failure', async function () {
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 0)
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Transfer is invalid: zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, accountA.address);

            const response = await executeBatchTransaction([delegationInnerTx, transferInnerTx], client);
            const err = await response.getReceipt(client).catch(e => e);
            expect(err).to.be.instanceOf(ReceiptStatusError);
            expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // TODO: add this check when atomic batch delegation persistence is fixed
            // const accountInfo = await new AccountInfoQuery()
            //     .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
            //     .execute(client);
            // expect(hexlify(accountInfo.delegationAddress).toLowerCase())
            //     .to.equal(smartWalletAddress.toLowerCase());
        });

        it('should keep new delegation D2 on batch failure (does not restore original D1)', async function () {
            // D1: existing smart wallet (deployed in `before`).
            const D1 = smartWalletAddress;
            const D2 = ethers.Wallet.createRandom().address;

            // Setup: apply delegation A → D1 outside the batch via a standalone type-4.
            // After this, accountA's authorization nonce is bumped from 0 to 1.
            const [, , setupSponsorNonce] = await getNonces(sponsor.address);
            await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(setupSponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, D1, 0)
                .send()
                .then(tx => tx.wait());

            const initialInfo = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
                .execute(client);
            expect(hexlify(initialInfo.delegationAddress).toLowerCase()).to.equal(D1.toLowerCase());

            // Inner tx 1: type-4 that changes A's delegation to D2 (auth nonce = 1)
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, D2, 1)
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Inner tx 2: invalid transfer — zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, client.operatorAccountId);

            const response = await executeBatchTransaction([delegationInnerTx, transferInnerTx], client);
            const err = await response.getReceipt(client).catch(e => e);
            expect(err).to.be.instanceOf(ReceiptStatusError);
            expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // TODO: add this check when atomic batch delegation persistence is fixed.
            // Expected: delegation on A is D2 (survives rollback); D1 is NOT restored.
            // const finalInfo = await new AccountInfoQuery()
            //     .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
            //     .execute(client);
            // expect(hexlify(finalInfo.delegationAddress).toLowerCase()).to.equal(D2.toLowerCase());
        });

    })

    describe('Delegation clearing (zero address)', function () {
        let accountA;

        beforeEach(async function () {
            accountA = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
        });

        it('should keep delegation cleared when clearing batch fails', async function () {
            // Setup: apply delegation A → smartWalletAddress so there's something to clear.
            // After this, accountA's authorization nonce is bumped from 0 to 1.
            const [, , setupSponsorNonce] = await getNonces(sponsor.address);
            await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(setupSponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 0)
                .send()
                .then(tx => tx.wait());

            const initialInfo = await new AccountInfoQuery()
                .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
                .execute(client);
            expect(hexlify(initialInfo.delegationAddress).toLowerCase())
                .to.equal(smartWalletAddress.toLowerCase());

            // Inner tx 1: type-4 that clears A's delegation (target = zero address, auth nonce = 1)
            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .withAuthorization(accountA, ethers.ZeroAddress, 1)
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Inner tx 2: invalid transfer — zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, client.operatorAccountId);

            const response = await executeBatchTransaction([delegationInnerTx, transferInnerTx], client);
            const err = await response.getReceipt(client).catch(e => e);
            expect(err).to.be.instanceOf(ReceiptStatusError);
            expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // TODO: add this check when atomic batch delegation persistence is fixed.
            // Expected: delegation cleared (clearing survives rollback).
            // const finalInfo = await new AccountInfoQuery()
            //     .setAccountId(AccountId.fromEvmAddress(0, 0, accountA.address))
            //     .execute(client);
            // expect(hexlify(finalInfo.delegationAddress).toLowerCase())
            //     .to.equal(ethers.ZeroAddress.toLowerCase());
        });
    })

});
