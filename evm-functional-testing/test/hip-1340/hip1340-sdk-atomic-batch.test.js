'use strict';
const {ethers} = require('hardhat');
const {expect} = require('chai');
const {
    AccountCreateTransaction,
    AccountId,
    AccountInfoQuery,
    AccountUpdateTransaction,
    ContractExecuteTransaction,
    ContractId,
    EvmAddress,
    Hbar,
    PrecheckStatusError,
    PrivateKey,
    ReceiptStatusError,
    TransactionResponse,
} = require('@hiero-ledger/sdk');
const {gas, deploy, DelegationTransactionBuilder} = require('./utils/web3');
const {
    createEcdsaAliasedAccount,
    createSdkClient,
    createAccountWithBalance,
    createBatchifiedTransfer,
    executeBatchTransaction,
    getAccountInfo,
    getDelegationAddress,
    getTransactionRecord,
    getTransactionRecordUnchecked,
    updateAccountDelegation,
    verifyDelegationWithSdkByAddress,
    wrapType4ForBatch,
} = require('./utils/sdk');
const {TINYBAR_TO_WEIBAR_COEF} = require('../../utils/constants');

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';
const ALWAYS_REVERT = 'contracts/hip-1340/AlwaysRevert';

/** Authorization nonce that can never match an account's current nonce, so the EVM skips the entry. */
const STALE_NONCE = 999;

/**
 * EIP-7702 (type-4) transactions inside an atomic batch.
 *
 * The consensus node prechecks every atomic batch (hiero-consensus-node #27184) so that
 *   - at most one inner transaction is an EVM transaction (ContractCall, ContractCreate or
 *     EthereumTransaction), and
 *   - that EVM transaction is the last inner transaction,
 * and rejects the whole batch with INVALID_TRANSACTION_BODY otherwise (both rules map to that one status).
 *
 * Because the type-4 transaction is always last, no later inner transaction can fail after the delegation
 * has been applied. What remains:
 *   - an earlier inner transaction fails: the batch ends with INNER_TRANSACTION_FAILED and the type-4
 *     transaction never executes (no delegation, sender nonce untouched, no gas charged);
 *   - the type-4 transaction fails before execution (e.g. WRONG_NONCE): same outcome;
 *   - the type-4 transaction executes and reverts: the batch ends with INNER_TRANSACTION_FAILED and the
 *     other inner transactions are rolled back, but the type-4 transaction keeps the effects a standalone
 *     reverted type-4 transaction has (CONTRACT_REVERT_EXECUTED): its authorization list is applied (an
 *     authority created by a rolled-back inner transaction disappears together with its delegation), its
 *     sender nonce is consumed and its gas is charged.
 */
describe('Atomic Batch: EIP-7702 delegation', function () {
    let client, provider, network, smartWalletAddress, alwaysRevertAddress, sponsor, zeroBalanceAccount;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();

        client = createSdkClient();

        // Deploy the contracts once: the delegation target and a call target that always reverts.
        ({address: smartWalletAddress} = await deploy(SIMPLE_7702_ACCOUNT));
        ({address: alwaysRevertAddress} = await deploy(ALWAYS_REVERT));

        // Pays the gas of the sponsored type-4 transactions. Distinct from the batch payer (the client
        // operator) so that its balance only moves by the gas it is charged.
        [sponsor] = await createEcdsaAliasedAccount(client, provider, new Hbar(100));

        // Has no funds: a transfer debiting it fails with INSUFFICIENT_ACCOUNT_BALANCE and takes the whole
        // batch down with it.
        zeroBalanceAccount = await createAccountWithBalance(PrivateKey.generateECDSA(), client, new Hbar(0));
        const zeroBalanceAccountInfo = await getAccountInfo(zeroBalanceAccount.accountId);
        expect(zeroBalanceAccountInfo.balance.toTinybars().isZero()).to.be.true;
    });

    after(function () {
        client?.close();
    });

    // ------------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------------

    /** Ethereum nonce of an SDK-created wallet, read from the consensus node (no mirror node lag). */
    async function cnNonce(wallet) {
        return (await getAccountInfo(wallet.accountId)).ethereumNonce.toNumber();
    }

    /** Balance of an SDK-created wallet in tinybars, read from the consensus node. */
    async function cnBalanceTinybars(wallet) {
        return (await getAccountInfo(wallet.accountId)).balance.toTinybars().toNumber();
    }

    /** eth_gasPrice from the relay converted to tinybars (the relay reports weibars). */
    async function gasPriceTinybars() {
        return Number(BigInt(await provider.send('eth_gasPrice', [])) / TINYBAR_TO_WEIBAR_COEF);
    }

    /** Funded ECDSA-aliased account to be used as authority (1 HBAR also covers a self-sponsored type-4). */
    function newAuthorityAccount() {
        return createEcdsaAliasedAccount(client, provider, new Hbar(1));
    }

    /** Authorization entry delegating `authority` → `delegationAddress` with the authority's current nonce. */
    async function authorization(authority, delegationAddress = smartWalletAddress) {
        return {authority, delegationAddress, nonce: await cnNonce(authority)};
    }

    /**
     * Type-4 transaction sent by `sender` carrying `authorizations` ({authority, delegationAddress, nonce}),
     * wrapped in an EthereumTransaction batchified under the operator key.
     * - `senderNonce` must be given explicitly when the same sender signs several transactions before any of
     *   them reaches consensus; it defaults to the sender's current nonce on the consensus node.
     * - `to` is the call target; it defaults to the zero address (no call).
     */
    async function type4InnerTx(sender, authorizations, {senderNonce, to} = {}) {
        const builder = new DelegationTransactionBuilder()
            .from(sender)
            .withChainId(network.chainId)
            .withSenderNonce(senderNonce ?? await cnNonce(sender))
            .withGasLimit(gas.base + gas.codeAuthorization(authorizations.length) + gas.accountCreationCost());
        if (to) {
            builder.to(to);
        }
        for (const {authority, delegationAddress, nonce} of authorizations) {
            builder.withAuthorization(authority, delegationAddress, nonce);
        }
        return wrapType4ForBatch(await builder.sign(), client);
    }

    /** AccountCreateTransaction for the key behind an ethers wallet, batchified under the operator key. */
    function accountCreateInnerTx(wallet) {
        return new AccountCreateTransaction()
            .setECDSAKeyWithAlias(PrivateKey.fromStringECDSA(wallet.privateKey).publicKey)
            .setInitialBalance(new Hbar(10))
            .batchify(client, client.operatorPublicKey);
    }

    /** AccountUpdateTransaction setting `account`'s delegation, batchified under the operator key and signed by the account. */
    async function cryptoUpdateDelegationInnerTx(account, accountPk, delegationAddress) {
        const update = await new AccountUpdateTransaction()
            .setAccountId(account.accountId)
            .setDelegationAddress(EvmAddress.fromString(delegationAddress))
            .batchify(client, client.operatorPublicKey);
        return update.sign(accountPk);
    }

    /** Valid 1 HBAR transfer operator → `to`. */
    function transferInnerTx(to) {
        return createBatchifiedTransfer(client, client.operatorAccountId, to);
    }

    /**
     * Transfer debiting the zero-balance account, signed by it so that it fails for INSUFFICIENT_ACCOUNT_BALANCE
     * (not for a missing signature); the batch then ends with INNER_TRANSACTION_FAILED.
     */
    async function failingTransferInnerTx() {
        const transfer = await createBatchifiedTransfer(client, zeroBalanceAccount.accountId, client.operatorAccountId);
        return transfer.sign(zeroBalanceAccount.privateKey);
    }

    /** Executes the batch and expects a SUCCESS receipt. */
    async function executeBatchExpectingSuccess(innerTxs) {
        const response = await executeBatchTransaction(innerTxs, client);
        const receipt = await response.getReceipt(client);
        expect(receipt.status.toString()).to.equal('SUCCESS');
    }

    /**
     * Executes the batch and expects an INNER_TRANSACTION_FAILED receipt. When `type4Sender` is given, the
     * type-4 transaction is expected not to have executed, so the sender's nonce must not move.
     */
    async function executeBatchExpectingInnerTransactionFailed(innerTxs, {type4Sender} = {}) {
        const senderNonceBefore = type4Sender ? await cnNonce(type4Sender) : undefined;

        const response = await executeBatchTransaction(innerTxs, client);
        const outcome = await response.getReceipt(client).catch(e => e);
        expect(outcome, `expected INNER_TRANSACTION_FAILED, got ${outcome instanceof Error ? outcome.message : `receipt ${outcome?.status}`}`)
            .to.be.instanceOf(ReceiptStatusError);
        expect(outcome.status.toString()).to.equal('INNER_TRANSACTION_FAILED');

        if (type4Sender) {
            expect(await cnNonce(type4Sender), 'type-4 sender nonce must not move').to.equal(senderNonceBefore);
        }
    }

    /**
     * Expects the consensus node to reject the batch at precheck with INVALID_TRANSACTION_BODY, so `execute`
     * itself throws and the type-4 sender's nonce does not move. A batch that is unexpectedly accepted is
     * awaited before failing, so that it cannot reach consensus while the next test is already running.
     */
    async function executeBatchExpectingPrecheckRejection(innerTxs, {type4Sender}) {
        const senderNonceBefore = await cnNonce(type4Sender);

        const result = await executeBatchTransaction(innerTxs, client).catch(e => e);
        let outcome = result?.message;
        if (result instanceof TransactionResponse) {
            outcome = await result.getReceipt(client).then(r => `receipt ${r.status}`, e => e.message);
        }
        expect(result, `expected a precheck rejection, got ${outcome}`).to.be.instanceOf(PrecheckStatusError);
        expect(result.status.toString()).to.equal('INVALID_TRANSACTION_BODY');

        expect(await cnNonce(type4Sender), 'type-4 sender nonce must not move').to.equal(senderNonceBefore);
    }

    /** Checks both the account's delegation address and its EIP-7702 designator bytecode. */
    async function expectDelegation(address, delegationAddress) {
        const {isValid} = await verifyDelegationWithSdkByAddress(address, delegationAddress, client);
        expect(isValid, `${address} should delegate to ${delegationAddress}`).to.be.true;
    }

    /**
     * AccountInfo only: ContractByteCodeQuery fails with INVALID_CONTRACT_ID for an account without delegation,
     * so the bytecode check of `verifyDelegationWithSdkByAddress` cannot be used for the negative case.
     */
    async function expectNoDelegation(address) {
        const delegationAddress = await getDelegationAddress(AccountId.fromEvmAddress(0, 0, address), client);
        expect(delegationAddress, `${address} should not have a delegation`).to.equal('0x');
    }

    /** AccountInfoQuery hits consensus (no mirror node lag) and fails with INVALID_ACCOUNT_ID. */
    async function expectAccountDoesNotExistOnConsensus(address) {
        const err = await new AccountInfoQuery()
            .setAccountId(AccountId.fromEvmAddress(0, 0, address))
            .execute(client)
            .catch(e => e);
        expect(err).to.be.instanceOf(PrecheckStatusError);
        expect(err.status.toString()).to.equal('INVALID_ACCOUNT_ID');
    }

    /** Status of an inner transaction, from its own record (inner transactions are not children of the batch record). */
    async function innerTxStatus(innerTx) {
        const {receipt} = await getTransactionRecordUnchecked(innerTx.transactionId.toString());
        return receipt.status.toString();
    }

    /**
     * The type-4 transaction reverted (CONTRACT_REVERT_EXECUTED) and the sponsor was charged for it: at least the
     * intrinsic gas of its `authorizationsCount` authorizations, at the network gas price.
     */
    async function expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore, authorizationsCount = 1) {
        const {receipt, contractFunctionResult} = await getTransactionRecordUnchecked(type4.transactionId.toString());
        expect(receipt.status.toString()).to.equal('CONTRACT_REVERT_EXECUTED');
        expect(contractFunctionResult, 'reverted type-4 transaction should still have a contract function result').to.exist;
        const gasUsed = contractFunctionResult.gasUsed.toNumber();
        expect(gasUsed).to.be.at.least(gas.base + gas.codeAuthorization(authorizationsCount));
        expect(sponsorBalanceBefore - await cnBalanceTinybars(sponsor)).to.equal(gasUsed * await gasPriceTinybars());
    }

    // ------------------------------------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------------------------------------

    describe('Sender is also the authority (self-sponsored type-4)', function () {
        let accountA;

        beforeEach(async function () {
            [accountA] = await newAuthorityAccount();
        });

        // EIP-7702: the sender nonce is consumed by the transaction itself before the authorization list
        // is processed, so an authority that is also the sender authorizes with nonce + 1.
        async function selfSponsoredType4InnerTx() {
            const nonce = await cnNonce(accountA);
            return type4InnerTx(accountA, [{authority: accountA, delegationAddress: smartWalletAddress, nonce: nonce + 1}], {senderNonce: nonce});
        }

        it('should commit delegation when the type-4 transaction is the last inner transaction', async function () {
            await executeBatchExpectingSuccess([
                await transferInnerTx(accountA.accountId),
                await selfSponsoredType4InnerTx(),
            ]);

            await expectDelegation(accountA.address, smartWalletAddress);
        });

        it('should not apply delegation nor consume the nonce when an earlier inner transaction fails', async function () {
            const failingTransfer = await failingTransferInnerTx();

            await executeBatchExpectingInnerTransactionFailed([
                failingTransfer,
                await selfSponsoredType4InnerTx(),
            ], {type4Sender: accountA});

            expect(await innerTxStatus(failingTransfer)).to.equal('INSUFFICIENT_ACCOUNT_BALANCE');
            await expectNoDelegation(accountA.address);
        });
    });

    describe('Authority account created inside the atomic batch', function () {
        it('should create an account and set delegation to it', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);

            await executeBatchExpectingSuccess([
                await accountCreateInnerTx(newAccount),
                await type4InnerTx(sponsor, [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}]),
            ]);

            await expectDelegation(newAccount.address, smartWalletAddress);
        });

        it('should roll back the account creation and not apply delegation when an earlier inner transaction fails', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);

            await executeBatchExpectingInnerTransactionFailed([
                await accountCreateInnerTx(newAccount),
                await failingTransferInnerTx(),
                await type4InnerTx(sponsor, [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}]),
            ], {type4Sender: sponsor});

            await expectAccountDoesNotExistOnConsensus(newAccount.address);
        });
    });

    describe('Authority account delegated before the atomic batch', function () {
        let accountA, D1, D2;

        before(async function () {
            D1 = smartWalletAddress;
            ({address: D2} = await deploy(SIMPLE_7702_ACCOUNT));
        });

        beforeEach(async function () {
            let accountAPk;
            [accountA, accountAPk] = await newAuthorityAccount();
            // Setup: A → D1 via a standalone CryptoUpdate.
            await updateAccountDelegation(accountA.accountId, accountAPk, D1, client);
            await expectDelegation(accountA.address, D1);
        });

        it('should change the delegation from D1 to D2 when the batch succeeds', async function () {
            await executeBatchExpectingSuccess([
                await transferInnerTx(accountA.accountId),
                await type4InnerTx(sponsor, [await authorization(accountA, D2)]),
            ]);

            await expectDelegation(accountA.address, D2);
        });

        it('should keep the delegation to D1 when an earlier inner transaction fails', async function () {
            await executeBatchExpectingInnerTransactionFailed([
                await failingTransferInnerTx(),
                await type4InnerTx(sponsor, [await authorization(accountA, D2)]),
            ], {type4Sender: sponsor});

            await expectDelegation(accountA.address, D1);
        });

        it('should clear the delegation when the type-4 transaction delegates to the zero address', async function () {
            await executeBatchExpectingSuccess([
                await transferInnerTx(accountA.accountId),
                await type4InnerTx(sponsor, [await authorization(accountA, ethers.ZeroAddress)]),
            ]);

            await expectNoDelegation(accountA.address);
        });
    });

    describe('Delegation set by a CryptoUpdate inside the same batch', function () {
        let accountA, accountAPk, D1, D2;

        before(async function () {
            D1 = smartWalletAddress;
            ({address: D2} = await deploy(SIMPLE_7702_ACCOUNT));
        });

        beforeEach(async function () {
            [accountA, accountAPk] = await newAuthorityAccount();
        });

        it('should let the type-4 delegation D2 override the CryptoUpdate delegation D1 when the batch succeeds', async function () {
            await executeBatchExpectingSuccess([
                await cryptoUpdateDelegationInnerTx(accountA, accountAPk, D1),
                await type4InnerTx(sponsor, [await authorization(accountA, D2)]),
            ]);

            await expectDelegation(accountA.address, D2);
        });

        it('should roll back the CryptoUpdate delegation D1 but keep the reverting type-4 delegation D2', async function () {
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            const type4 = await type4InnerTx(sponsor, [await authorization(accountA, D2)], {to: alwaysRevertAddress});

            await executeBatchExpectingInnerTransactionFailed([
                await cryptoUpdateDelegationInnerTx(accountA, accountAPk, D1),
                type4,
            ]);

            await expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore);
            await expectDelegation(accountA.address, D2);
        });
    });

    describe('Multiple auth-list entries (mixed validity)', function () {
        it('should apply the valid authorizations and skip the invalid ones', async function () {
            // accountA and accountB: valid auth entries (nonce matches the account state).
            // accountC and accountD: invalid auth entries (STALE_NONCE → skipped by the EVM).
            const [accountA] = await newAuthorityAccount();
            const [accountB] = await newAuthorityAccount();
            const [accountC] = await newAuthorityAccount();
            const [accountD] = await newAuthorityAccount();

            await executeBatchExpectingSuccess([
                await transferInnerTx(accountA.accountId),
                await type4InnerTx(sponsor, [
                    await authorization(accountA),
                    await authorization(accountB),
                    {authority: accountC, delegationAddress: smartWalletAddress, nonce: STALE_NONCE},
                    {authority: accountD, delegationAddress: smartWalletAddress, nonce: STALE_NONCE},
                ]),
            ]);

            await expectDelegation(accountA.address, smartWalletAddress);
            await expectDelegation(accountB.address, smartWalletAddress);
            await expectNoDelegation(accountC.address);
            await expectNoDelegation(accountD.address);
        });
    });

    describe('Type-4 transaction is the failing inner transaction', function () {
        it('should not apply anything nor charge the sponsor when the type-4 transaction fails with WRONG_NONCE', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            // Wrong sender nonce (one ahead of the account): the consensus node rejects the type-4 transaction
            // with WRONG_NONCE before it executes.
            const type4 = await type4InnerTx(
                sponsor,
                [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}],
                {senderNonce: await cnNonce(sponsor) + 1},
            );

            await executeBatchExpectingInnerTransactionFailed([
                await accountCreateInnerTx(newAccount),
                type4,
            ], {type4Sender: sponsor});

            expect(await innerTxStatus(type4)).to.equal('WRONG_NONCE');
            await expectAccountDoesNotExistOnConsensus(newAccount.address);
            expect(await cnBalanceTinybars(sponsor)).to.equal(sponsorBalanceBefore);
        });

        it('should keep the delegation, the consumed nonce and the gas charge of a reverting type-4 transaction while rolling back the other inner transactions', async function () {
            const [accountA] = await newAuthorityAccount();
            const accountABalanceBefore = await cnBalanceTinybars(accountA);
            const sponsorNonceBefore = await cnNonce(sponsor);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            const type4 = await type4InnerTx(sponsor, [await authorization(accountA)], {to: alwaysRevertAddress});

            await executeBatchExpectingInnerTransactionFailed([
                await transferInnerTx(accountA.accountId),
                type4,
            ]);

            // Same effects as a standalone reverted type-4 transaction ...
            await expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore);
            await expectDelegation(accountA.address, smartWalletAddress);
            expect(await cnNonce(sponsor)).to.equal(sponsorNonceBefore + 1);
            // ... while the transfer to A was rolled back with the batch.
            expect(await cnBalanceTinybars(accountA)).to.equal(accountABalanceBefore);
        });

        it('should roll back an account created in the batch but keep the gas charge when the type-4 transaction reverts', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);
            const sponsorNonceBefore = await cnNonce(sponsor);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            const type4 = await type4InnerTx(
                sponsor,
                [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}],
                {to: alwaysRevertAddress},
            );

            await executeBatchExpectingInnerTransactionFailed([
                await accountCreateInnerTx(newAccount),
                type4,
            ]);

            await expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore);
            await expectAccountDoesNotExistOnConsensus(newAccount.address);
            expect(await cnNonce(sponsor)).to.equal(sponsorNonceBefore + 1);
        });

        it('should keep the delegation cleared by a reverting type-4 transaction', async function () {
            const [accountA, accountAPk] = await newAuthorityAccount();
            await updateAccountDelegation(accountA.accountId, accountAPk, smartWalletAddress, client);
            await expectDelegation(accountA.address, smartWalletAddress);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            const type4 = await type4InnerTx(sponsor, [await authorization(accountA, ethers.ZeroAddress)], {to: alwaysRevertAddress});

            await executeBatchExpectingInnerTransactionFailed([
                await transferInnerTx(accountA.accountId),
                type4,
            ]);

            await expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore);
            await expectNoDelegation(accountA.address);
        });

        it('should keep the valid authorizations and skip the invalid ones of a reverting type-4 transaction', async function () {
            const [accountA] = await newAuthorityAccount();
            const [accountB] = await newAuthorityAccount();
            const [accountC] = await newAuthorityAccount();
            const [accountD] = await newAuthorityAccount();
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);
            const type4 = await type4InnerTx(sponsor, [
                await authorization(accountA),
                await authorization(accountB),
                {authority: accountC, delegationAddress: smartWalletAddress, nonce: STALE_NONCE},
                {authority: accountD, delegationAddress: smartWalletAddress, nonce: STALE_NONCE},
            ], {to: alwaysRevertAddress});

            await executeBatchExpectingInnerTransactionFailed([
                await transferInnerTx(accountA.accountId),
                type4,
            ]);

            await expectType4RevertedAndSponsorCharged(type4, sponsorBalanceBefore, 4);
            await expectDelegation(accountA.address, smartWalletAddress);
            await expectDelegation(accountB.address, smartWalletAddress);
            await expectNoDelegation(accountC.address);
            await expectNoDelegation(accountD.address);
        });
    });

    describe('Gas and fee charging', function () {
        it('should charge the sponsor gasUsed × gasPrice for the type-4 transaction of a successful batch', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);
            const type4 = await type4InnerTx(sponsor, [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}]);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);

            await executeBatchExpectingSuccess([await accountCreateInnerTx(newAccount), type4]);

            const charged = sponsorBalanceBefore - await cnBalanceTinybars(sponsor);
            // Inner transactions are not children of the batch record: query the type-4 transaction's own record.
            const {contractFunctionResult} = await getTransactionRecord(type4.transactionId.toString());
            expect(contractFunctionResult, 'type-4 transaction should have a contract function result').to.exist;
            const gasUsed = contractFunctionResult.gasUsed.toNumber();

            expect(gasUsed).to.be.greaterThan(0);
            expect(charged).to.equal(gasUsed * await gasPriceTinybars());
        });

        it('should not charge the sponsor when the batch fails before the type-4 transaction', async function () {
            const newAccount = ethers.Wallet.createRandom(provider);
            const sponsorBalanceBefore = await cnBalanceTinybars(sponsor);

            await executeBatchExpectingInnerTransactionFailed([
                await accountCreateInnerTx(newAccount),
                await failingTransferInnerTx(),
                await type4InnerTx(sponsor, [{authority: newAccount, delegationAddress: smartWalletAddress, nonce: 0}]),
            ], {type4Sender: sponsor});

            expect(await cnBalanceTinybars(sponsor)).to.equal(sponsorBalanceBefore);
        });
    });

    describe('Batch shape restrictions (consensus node precheck)', function () {
        let accountA;

        beforeEach(async function () {
            [accountA] = await newAuthorityAccount();
        });

        it('should reject a batch where the type-4 transaction is first', async function () {
            await executeBatchExpectingPrecheckRejection([
                await type4InnerTx(sponsor, [await authorization(accountA)]),
                await transferInnerTx(accountA.accountId),
            ], {type4Sender: sponsor});

            await expectNoDelegation(accountA.address);
        });

        it('should reject a batch where the type-4 transaction is in the middle', async function () {
            await executeBatchExpectingPrecheckRejection([
                await accountCreateInnerTx(ethers.Wallet.createRandom(provider)),
                await type4InnerTx(sponsor, [await authorization(accountA)]),
                await transferInnerTx(accountA.accountId),
            ], {type4Sender: sponsor});

            await expectNoDelegation(accountA.address);
        });

        // A batch with two EVM transactions necessarily also has one that is not last, and both rules are
        // reported as INVALID_TRANSACTION_BODY, so the next two tests pin the rejection of the shape rather than
        // attributing it to the "at most one EVM transaction" rule alone.
        it('should reject a batch with two type-4 transactions', async function () {
            const [accountB] = await newAuthorityAccount();
            const sponsorNonce = await cnNonce(sponsor);

            await executeBatchExpectingPrecheckRejection([
                await type4InnerTx(sponsor, [await authorization(accountA)], {senderNonce: sponsorNonce}),
                await type4InnerTx(sponsor, [await authorization(accountB)], {senderNonce: sponsorNonce + 1}),
            ], {type4Sender: sponsor});

            await expectNoDelegation(accountA.address);
            await expectNoDelegation(accountB.address);
        });

        it('should reject a batch combining a ContractCall with a type-4 transaction (two EVM transactions)', async function () {
            const contractCallInnerTx = await new ContractExecuteTransaction()
                .setContractId(ContractId.fromEvmAddress(0, 0, smartWalletAddress))
                .setGas(100_000)
                .setFunction('entryPoint')
                .batchify(client, client.operatorPublicKey);

            await executeBatchExpectingPrecheckRejection([
                contractCallInnerTx,
                await type4InnerTx(sponsor, [await authorization(accountA)]),
            ], {type4Sender: sponsor});

            await expectNoDelegation(accountA.address);
        });
    });
});
