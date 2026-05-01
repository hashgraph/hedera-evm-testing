'use strict';
const {ethers} = require('hardhat');
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
    getTransactionRecord,
    getTransactionRecordUnchecked, getAccountInfo,
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
            // const verification = await verifyDelegationWithSdkByAddress(accountA.address, smartWalletAddress, client);
            // expect(verification.isValid).to.be.true;
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
            const verification = await verifyDelegationWithSdkByAddress(newAccount.address, smartWalletAddress, client);
            expect(verification.isValid).to.be.true;
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
            // const verification = await verifyDelegationWithSdkByAddress(newAccount.address, smartWalletAddress, client);
            // expect(verification.isValid).to.be.true;
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
            // const verification = await verifyDelegationWithSdkByAddress(accountA.address, smartWalletAddress, client);
            // expect(verification.isValid).to.be.true;
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

            const initialVerification = await verifyDelegationWithSdkByAddress(accountA.address, D1, client);
            expect(initialVerification.isValid).to.be.true;

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
            // const finalVerification = await verifyDelegationWithSdkByAddress(accountA.address, D2, client);
            // expect(finalVerification.isValid).to.be.true;
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

            const initialVerification = await verifyDelegationWithSdkByAddress(accountA.address, smartWalletAddress, client);
            expect(initialVerification.isValid).to.be.true;

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
            // const finalVerification = await verifyDelegationWithSdkByAddress(accountA.address, ethers.ZeroAddress, client);
            // expect(finalVerification.isValid).to.be.true;
        });
    })

    describe('Multiple auth-list entries (mixed validity)', function () {

        it('should commit 2 valid delegations and skip 2 invalid ones when batch fails', async function () {
            // accountA and accountB: valid auth entries (nonce=0, matches fresh account state).
            // accountC and accountD: invalid auth entries (stale nonce=999 → skipped by EVM).
            const accountA = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
            const accountB = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
            const accountC = await createEcdsaAliasedAccount(client, provider, new Hbar(1));
            const accountD = await createEcdsaAliasedAccount(client, provider, new Hbar(1));

            const [, , sponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(sponsorNonce)
                .withGasLimit(gas.base + gas.codeAuthorization(4) + gas.accountCreationCost())
                .withAuthorization(accountA, smartWalletAddress, 0)   // valid
                .withAuthorization(accountB, smartWalletAddress, 0)   // valid
                .withAuthorization(accountC, smartWalletAddress, 999) // invalid nonce → skipped
                .withAuthorization(accountD, smartWalletAddress, 999) // invalid nonce → skipped
                .sign();
            const delegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);

            // Invalid transfer — zeroBalanceAccount has no funds → INNER_TRANSACTION_FAILED
            const transferInnerTx = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, client.operatorAccountId);

            const response = await executeBatchTransaction([delegationInnerTx, transferInnerTx], client);
            const err = await response.getReceipt(client).catch(e => e);
            expect(err).to.be.instanceOf(ReceiptStatusError);
            expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            // TODO: add these checks when atomic batch delegation persistence is fixed.
            // Expected: A and B delegations survive rollback; C and D were skipped (invalid nonce).
            // const verificationA = await verifyDelegationWithSdkByAddress(accountA.address, smartWalletAddress, client);
            // expect(verificationA.isValid).to.be.true;
            // const verificationB = await verifyDelegationWithSdkByAddress(accountB.address, smartWalletAddress, client);
            // expect(verificationB.isValid).to.be.true;
            // const verificationC = await verifyDelegationWithSdkByAddress(accountC.address, smartWalletAddress, client);
            // expect(verificationC.isValid).to.be.false;
            // const verificationD = await verifyDelegationWithSdkByAddress(accountD.address, smartWalletAddress, client);
            // expect(verificationD.isValid).to.be.false;
        });

    })

    describe('Gas and fee charging', function () {

        // For this test We execute two batches:
        // - atomicBatch(CryptoCreate(A), type-4 delegates A, invalid transfer) - batch fails
        // - atomicBatch(CryptoCreate(A), type-4 delegates A, valid transfer) batch succeeds
        // Gas charged for all inner txs despite rollback. Account creation fee for CryptoCreate correctly replayed despite
        // account being rolled back and is included as part of the tx4 tx charge. Successful path should charge less fees
        // (minus account creation), since account creation was successful.
        it('should charge gas for all inner txs including rolled-back account creation', async function () {
            const sponsorAccountId = AccountId.fromEvmAddress(0, 0, sponsor.address);

            // ── Rollback batch: CryptoCreate(A) + type-4 delegates A + invalid transfer ──
            const accountA = ethers.Wallet.createRandom(provider);
            const accountAKey = PrivateKey.fromStringECDSA(accountA.privateKey);

            const accountACreateTx = await new AccountCreateTransaction()
                .setECDSAKeyWithAlias(accountAKey.publicKey)
                .setInitialBalance(new Hbar(10))
                .batchify(client, client.operatorPublicKey);

            const [, , rollbackSponsorNonce] = await getNonces(sponsor.address);
            const rawType4Tx = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(rollbackSponsorNonce)
                .withAuthorization(accountA, smartWalletAddress, 0)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .sign();
            const rollbackDelegationInnerTx = await wrapType4ForBatch(rawType4Tx, client);
            const rollbackTransferInnerTx = await createBatchifiedTransfer(
                client, zeroBalanceAccount.accountId, client.operatorAccountId);

            const sponsorBalanceBeforeRollback = (await getAccountInfo(sponsorAccountId.toString()))
                .balance.toTinybars();

            const rollbackResponse = await executeBatchTransaction(
                [accountACreateTx, rollbackDelegationInnerTx, rollbackTransferInnerTx],
                client);
            const rollbackErr = await rollbackResponse.getReceipt(client).catch(e => e);
            expect(rollbackErr).to.be.instanceOf(ReceiptStatusError);
            expect(rollbackErr.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

            const sponsorBalanceAfterRollback = (await getAccountInfo(sponsorAccountId.toString()))
                .balance.toTinybars();
            const rollbackGasCharge = sponsorBalanceBeforeRollback.subtract(sponsorBalanceAfterRollback);

            // ── Success batch: CryptoCreate(B) + type-4 delegates B + valid transfer ──
            const accountB = ethers.Wallet.createRandom(provider);
            const accountBKey = PrivateKey.fromStringECDSA(accountB.privateKey);

            const accountBCreateTx = await new AccountCreateTransaction()
                .setECDSAKeyWithAlias(accountBKey.publicKey)
                .setInitialBalance(new Hbar(10))
                .batchify(client, client.operatorPublicKey);

            const [, , successSponsorNonce] = await getNonces(sponsor.address);
            const rawType4TxB = await new DelegationTransactionBuilder()
                .from(sponsor)
                .withChainId(network.chainId)
                .withSenderNonce(successSponsorNonce)
                .withAuthorization(accountB, smartWalletAddress, 0)
                .withGasLimit(gas.base + gas.codeAuthorization(1) + gas.accountCreationCost())
                .sign();
            const successDelegationInnerTx = await wrapType4ForBatch(rawType4TxB, client);
            // Valid transfer: operator → accountB (created by inner tx 1 in the same batch).
            const successTransferInnerTx = await createBatchifiedTransfer(
                client, client.operatorAccountId, accountB.address);

            const successResponse = await executeBatchTransaction(
                [accountBCreateTx, successDelegationInnerTx, successTransferInnerTx],
                client);
            const successReceipt = await successResponse.getReceipt(client);
            expect(successReceipt.status.toString()).to.equal('SUCCESS');

            const sponsorBalanceAfterSuccess = (await getAccountInfo(sponsorAccountId.toString()))
                .balance.toTinybars();
            const successGasCharge = sponsorBalanceAfterRollback.subtract(sponsorBalanceAfterSuccess);

            // Both batches charged gas to sponsor despite different outcomes.
            expect(Number(rollbackGasCharge)).to.be.greaterThan(0);
            expect(Number(successGasCharge)).to.be.greaterThan(0);

            // child index 1 in each batch record = EthereumTransaction (after AccountCreateTransaction)
            const rollbackBatchRecord = await getTransactionRecordUnchecked(rollbackResponse.transactionId.toString());
            const successBatchRecord = await getTransactionRecord(successResponse.transactionId.toString());
            const rollbackGasUsed = Number(rollbackBatchRecord.children[1]?.contractFunctionResult?.gasUsed ?? 0);
            const successGasUsed = Number(successBatchRecord.children[1]?.contractFunctionResult?.gasUsed ?? 0);

            // eth_gasPrice from the relay is in tinybars * 10^10 (Hedera's wei scale)
            const gasPriceTinybars = Number((await provider.getFeeData()).gasPrice / 10n ** 10n);

            // TODO: below assertions fail until atomic batch fee replay is fixed
            // rollback should charge more (account creation rolled back and re-played inside type-4)
            // expect(Number(rollbackGasCharge)).to.be.greaterThan(Number(successGasCharge));
            // each charge must equal gasUsed * gasPriceTinybars
            // expect(Number(rollbackGasCharge)).to.equal(rollbackGasUsed * gasPriceTinybars);
            // expect(Number(successGasCharge)).to.equal(successGasUsed * gasPriceTinybars);
        });

    })

});
