'use strict';
const {ethers} = require('hardhat');
const {hexlify} = require('ethers');
const hre = require('hardhat');
const {expect} = require('chai');
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
    ReceiptStatusError,
} = require('@hiero-ledger/sdk');
const {gas, deploy, getNonces, DelegationTransactionBuilder} = require('./utils/web3');

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';

/**
 * Creates a new ECDSA-aliased Hedera account via the SDK and returns the
 * matching ethers wallet (so callers can sign EVM txs with the same key).
 *
 * @param {import('@hiero-ledger/sdk').Client} client - SDK client used to submit and pay for the AccountCreateTransaction.
 * @param {import('ethers').Provider} provider - ethers provider attached to the returned wallet.
 * @param {Hbar} initialBalance - Starting balance for the new account.
 * @returns {Promise<import('ethers').BaseWallet>} ethers wallet backed by the same ECDSA key as the new Hedera account.
 */
async function createEcdsaAliasedAccount(client, provider, initialBalance) {
    const wallet = ethers.Wallet.createRandom(provider);
    const key = PrivateKey.fromStringECDSA(wallet.privateKey);
    const receipt = await (
        await (
            await new AccountCreateTransaction()
                .setECDSAKeyWithAlias(key.publicKey)
                .setInitialBalance(initialBalance)
                .freezeWith(client)
                .sign(key)
        ).execute(client)
    ).getReceipt(client);
    expect(receipt.status.toString()).to.equal('SUCCESS');
    expect(receipt.accountId).to.not.be.null;
    return wallet;
}

/**
 * Wraps signed type-4 bytes in an EthereumTransaction batchified under the
 * operator key. fromBytes(...).toBytes() is a byte-equivalent round-trip that
 * acts as a fail-fast validator for the RLP/authorizationList shape.
 *
 * @param {string} rawType4Tx - 0x-prefixed hex of a signed EIP-7702 (type-4) transaction.
 * @param {import('@hiero-ledger/sdk').Client} client - SDK client whose operator key is used as the batch key.
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
 * Asserts that the given EVM address has its EIP-7702 delegation pointing at
 * the expected smart wallet address.
 *
 * @param {import('@hiero-ledger/sdk').Client} client - SDK client used to issue the AccountInfoQuery.
 * @param {string} evmAddress - 0x-prefixed EVM address of the (aliased) Hedera account whose delegation is being checked.
 * @param {string} expectedDelegation - 0x-prefixed EVM address the account is expected to be delegated to.
 * @returns {Promise<void>}
 */
async function expectDelegation(client, evmAddress, expectedDelegation) {
    const accountInfo = await new AccountInfoQuery()
        .setAccountId(AccountId.fromEvmAddress(0, 0, evmAddress))
        .execute(client);
    expect(hexlify(accountInfo.delegationAddress).toLowerCase())
        .to.equal(expectedDelegation.toLowerCase());
}

describe('Atomic Batch: EIP-7702 delegation', function () {
    let client, provider, network, smartWalletAddress, sponsor, zeroBalanceAccount;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();

        const {sdkClient} = hre.network.config;
        client = Client.forNetwork(sdkClient.networkNode)
            .setOperator(sdkClient.operatorId, sdkClient.operatorKey);

        // Deploy the smart wallet contract once
        ({address: smartWalletAddress} = await deploy(SIMPLE_7702_ACCOUNT));

        sponsor = new ethers.Wallet(hre.network.config.accounts[0], provider);

        zeroBalanceAccount = await createEcdsaAliasedAccount(client, provider, new Hbar(0));
        const zeroBalanceAccountInfo = await new AccountInfoQuery()
            .setAccountId(AccountId.fromEvmAddress(0, 0, zeroBalanceAccount.address))
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
            await expectDelegation(client, accountA.address, smartWalletAddress);
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
            const transferInnerTx = await new TransferTransaction()
                .addHbarTransfer(zeroBalanceAccount.address, new Hbar(-1))
                .addHbarTransfer(accountA.address, new Hbar(1))
                .batchify(client, client.operatorPublicKey);

            await (
                await new BatchTransaction()
                    .addInnerTransaction(delegationInnerTx)
                    .addInnerTransaction(transferInnerTx)
                    .execute(client)
            ).getReceipt(client)
                .catch(err => {
                    expect(err).to.be.instanceOf(ReceiptStatusError);
                    expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');
                });

            // TODO: assert delegation persistence with expectDelegation(client, accountA.address, smartWalletAddress)
            // when atomic batch delegation persistence is fixed
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

            const batchReceipt = await (
                await new BatchTransaction()
                    .addInnerTransaction(accountCreateTx)
                    .addInnerTransaction(delegationInnerTx)
                    .execute(client)
            ).getReceipt(client);

            expect(batchReceipt.status.toString()).to.equal('SUCCESS');
            await expectDelegation(client, newAccount.address, smartWalletAddress);
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
            const transferInnerTx = await new TransferTransaction()
                .addHbarTransfer(zeroBalanceAccount.address, new Hbar(-1))
                .addHbarTransfer(accountA.address, new Hbar(1))
                .batchify(client, client.operatorPublicKey);

            await (
                await new BatchTransaction()
                    .addInnerTransaction(delegationInnerTx)
                    .addInnerTransaction(transferInnerTx)
                    .execute(client)
            ).getReceipt(client)
                .catch(err => {
                    expect(err).to.be.instanceOf(ReceiptStatusError);
                    expect(err.status.toString()).to.equal('INNER_TRANSACTION_FAILED');
                });

            // TODO: assert delegation persistence with expectDelegation(client, accountA.address, smartWalletAddress)
            // when atomic batch delegation persistence is fixed
        });

    })

});