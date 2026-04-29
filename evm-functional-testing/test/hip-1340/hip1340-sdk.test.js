const { expect } = require('chai');
const { ethers } = require('hardhat');
const hre = require('hardhat');
const sdk = require('@hiero-ledger/sdk');

const { Hip1340TestContext } = require('./utils/test-context');
const { deploy, DelegationTransactionBuilder, encodeFunctionData } = require('./utils/web3');
const {
    createAccount,
    createAccountWithDelegation,
    updateAccountDelegation,
    updateAccountWithoutDelegation,
    clearAccountDelegation,
    getDelegationAddress,
    contractCallToDelegatedEOA,
    verifyDelegationWithSDK,
    executeBatchTransaction
} = require('./utils/sdk');
const { createSDKClient } = require('../../utils/utils');

const SIMPLE_7702_ACCOUNT = 'contracts/hip-1340/CustomSimple7702Account';
const SETUP_METHODS = ['CryptoCreate', 'CryptoUpdate', 'EthereumType4'];

describe('HIP-1340 - SDK Native Flow', function () {
    let sdkClient, provider, smartWallet, operatorKey;

    before(async function () {
        provider = ethers.provider;
        sdkClient = await createSDKClient();
        smartWallet = await deploy(SIMPLE_7702_ACCOUNT);

        const { operatorKey: opKey } = hre.network.config.sdkClient;
        operatorKey = sdk.PrivateKey.fromStringDer(opKey);
    });

    after(async function () {
        sdkClient?.close();
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(provider);
        await this.testCtx.init();
    });

    // ================================================================
    // Delegation Setup Strategies
    // ================================================================

    async function setupDelegation(method, delegationAddress, testCtx) {
        switch (method) {
            case 'CryptoCreate': {
                const privateKey = sdk.PrivateKey.generateECDSA();
                const result = await createAccountWithDelegation(privateKey, delegationAddress, sdkClient);
                return {
                    ...result,
                    evmAddress: '0x' + result.accountId.toEvmAddress()
                };
            }
            case 'CryptoUpdate': {
                const privateKey = sdk.PrivateKey.generateECDSA();
                const { accountId } = await createAccount(privateKey, sdkClient);
                await updateAccountDelegation(accountId, privateKey, delegationAddress, sdkClient);
                return {
                    accountId,
                    privateKey,
                    evmAddress: '0x' + accountId.toEvmAddress()
                };
            }
            case 'EthereumType4': {
                const eoa = await testCtx.createAndFundEOA();
                const sponsor = await testCtx.createAndFundEOA();
                const network = await testCtx.provider.getNetwork();

                await new DelegationTransactionBuilder()
                    .from(sponsor)
                    .withChainId(network.chainId)
                    .withAuthorization(eoa, delegationAddress, 0)
                    .send()
                    .then(tx => tx.wait());

                const privateKeyHex = eoa.privateKey.startsWith('0x')
                    ? eoa.privateKey.slice(2)
                    : eoa.privateKey;

                const accountInfo = await new sdk.AccountInfoQuery()
                    .setAccountId(sdk.AccountId.fromEvmAddress(0, 0, eoa.address))
                    .execute(sdkClient);

                return {
                    eoa,
                    privateKey: sdk.PrivateKey.fromStringECDSA(privateKeyHex),
                    evmAddress: eoa.address,
                    accountId: accountInfo.accountId
                };
            }
            default:
                throw new Error(`Unknown setup method: ${method}`);
        }
    }

    function getExecuteCallData() {
        return encodeFunctionData(
            'execute(address dest, uint256 value, bytes func)',
            [ethers.ZeroAddress, 0n, '0x']
        );
    }

    // ================================================================
    // Basic Delegation Execution
    // ================================================================

    describe('Basic Delegation Execution', function () {

        describe('ContractExecuteTransaction to delegated EOA', function () {
            for (const method of SETUP_METHODS) {
                it(`should execute delegation set via ${method}`, async function () {
                    const delegatedAccount = await setupDelegation(method, smartWallet.address, this.testCtx);

                    const callData = getExecuteCallData();
                    const response = await contractCallToDelegatedEOA(
                        delegatedAccount.evmAddress,
                        Buffer.from(callData.slice(2), 'hex'),
                        1_000_000,
                        sdkClient
                    );

                    const record = await response.getRecord(sdkClient);
                    expect(record.receipt.status.toString()).to.equal('SUCCESS');
                });
            }
        });

        describe('ContractCreateTransaction calling delegated EOA in constructor', function () {
            for (const method of SETUP_METHODS) {
                it(`should execute delegation set via ${method}`, async function () {
                    const delegatedAccount = await setupDelegation(method, smartWallet.address, this.testCtx);

                    const callerContract = await deploy(
                        'contracts/hip-1340/DelegationCaller',
                        [delegatedAccount.evmAddress]
                    );

                    expect(callerContract.address).to.not.be.undefined;
                    const code = await provider.getCode(callerContract.address);
                    expect(code).to.not.equal('0x');
                });
            }
        });
    });

    // ================================================================
    // Delegation Setup Verification
    // ================================================================

    describe('Delegation Setup Verification', function () {

        for (const method of SETUP_METHODS) {
            it(`should verify delegation set via ${method} with ContractCodeQuery and AccountInfo`, async function () {
                const { accountId, evmAddress } = await setupDelegation(method, smartWallet.address, this.testCtx);

                const verification = await verifyDelegationWithSDK(
                    accountId,
                    smartWallet.address,
                    sdkClient
                );

                expect(verification.isValid).to.be.true;
                expect(verification.delegationAddress?.toLowerCase()).to.equal(
                    smartWallet.address.toLowerCase()
                );

                const callData = getExecuteCallData();
                const response = await contractCallToDelegatedEOA(
                    evmAddress,
                    Buffer.from(callData.slice(2), 'hex'),
                    1_000_000,
                    sdkClient
                );

                const record = await response.getRecord(sdkClient);
                expect(record.receipt.status.toString()).to.equal('SUCCESS');
            });
        }
    });

    // ================================================================
    // Batch Transaction with Delegation
    // ================================================================

    describe('Batch Transaction with Delegation', function () {

        for (const method of SETUP_METHODS) {
            it(`should execute delegation via batch [CryptoUpdate + ContractCall] after ${method} setup`, async function () {
                const delegatedAccount = await setupDelegation(method, smartWallet.address, this.testCtx);

                const newSmartWallet = await deploy(SIMPLE_7702_ACCOUNT);
                const batchKey = sdk.PrivateKey.generateECDSA();

                const updateTx = new sdk.AccountUpdateTransaction()
                    .setAccountId(delegatedAccount.accountId)
                    .setDelegationAddress(sdk.EvmAddress.fromString(newSmartWallet.address));
                await updateTx.batchify(sdkClient, batchKey.publicKey);
                const signedUpdate = await updateTx.sign(delegatedAccount.privateKey);

                const callData = getExecuteCallData();
                const contractCallTx = new sdk.ContractExecuteTransaction()
                    .setContractId(sdk.ContractId.fromEvmAddress(0, 0, delegatedAccount.evmAddress))
                    .setGas(1_000_000)
                    .setFunctionParameters(Buffer.from(callData.slice(2), 'hex'));
                await contractCallTx.batchify(sdkClient, batchKey.publicKey);

                const response = await executeBatchTransaction(
                    [signedUpdate, contractCallTx],
                    batchKey,
                    sdkClient
                );
                const receipt = await response.getReceipt(sdkClient);
                expect(receipt.status.toString()).to.equal('SUCCESS');

                const verification = await verifyDelegationWithSDK(
                    delegatedAccount.accountId,
                    newSmartWallet.address,
                    sdkClient
                );
                expect(verification.isValid).to.be.true;
            });
        }
    });

    // ================================================================
    // CryptoUpdate Delegation Behavior
    // ================================================================

    describe('CryptoUpdate Delegation Behavior', function () {

        describe('CryptoUpdate with null delegation (not specified)', function () {
            for (const method of SETUP_METHODS) {
                it(`should NOT clear delegation set via ${method} when updating other fields`, async function () {
                    const delegatedAccount = await setupDelegation(method, smartWallet.address, this.testCtx);

                    await updateAccountWithoutDelegation(
                        delegatedAccount.accountId,
                        delegatedAccount.privateKey,
                        'Updated memo without touching delegation',
                        sdkClient
                    );

                    const delegationAddress = await getDelegationAddress(
                        delegatedAccount.accountId,
                        sdkClient
                    );
                    expect(delegationAddress?.toLowerCase()).to.equal(
                        smartWallet.address.toLowerCase()
                    );

                    const callData = getExecuteCallData();
                    const response = await contractCallToDelegatedEOA(
                        delegatedAccount.evmAddress,
                        Buffer.from(callData.slice(2), 'hex'),
                        1_000_000,
                        sdkClient
                    );
                    const record = await response.getRecord(sdkClient);
                    expect(record.receipt.status.toString()).to.equal('SUCCESS');
                });
            }
        });

        describe('CryptoUpdate with zero address delegation', function () {
            for (const method of SETUP_METHODS) {
                it(`should clear delegation set via ${method}`, async function () {
                    const delegatedAccount = await setupDelegation(method, smartWallet.address, this.testCtx);

                    const verificationBefore = await verifyDelegationWithSDK(
                        delegatedAccount.accountId,
                        smartWallet.address,
                        sdkClient
                    );
                    expect(verificationBefore.isValid).to.be.true;
                    await clearAccountDelegation(
                        delegatedAccount.accountId,
                        delegatedAccount.privateKey,
                        sdkClient
                    );

                    const delegationAddress = await getDelegationAddress(
                        delegatedAccount.accountId,
                        sdkClient
                    );
                    expect(delegationAddress).to.be.eq("0x");
                });
            }
        });
    });

    // ================================================================
    // CryptoCreate Delegation Behavior
    // ================================================================

    describe('CryptoCreate Delegation Behavior', function () {

        it('should create account without delegation when delegation is not specified', async function () {
            const privateKey = sdk.PrivateKey.generateECDSA();
            const { accountId } = await createAccount(privateKey, sdkClient);

            const delegationAddress = await getDelegationAddress(accountId, sdkClient);
            expect(delegationAddress).to.be.eq("0x");
        });

        it('should create account without delegation when delegation is zero address', async function () {
            const privateKey = sdk.PrivateKey.generateECDSA();
            const zeroAddress = '0x0000000000000000000000000000000000000000';

            const tx = new sdk.AccountCreateTransaction()
                .setKeyWithoutAlias(privateKey.publicKey)
                .setInitialBalance(sdk.Hbar.fromTinybars(10_000_000_000n))
                .setDelegationAddress(sdk.EvmAddress.fromString(zeroAddress));

            const response = await tx.execute(sdkClient);
            const receipt = await response.getReceipt(sdkClient);
            const accountId = receipt.accountId;

            const delegationAddress = await getDelegationAddress(accountId, sdkClient);
            expect(delegationAddress).to.be.eq("0x");
        });
    });

    // ================================================================
    // Batch Transaction Rollback
    // ================================================================
    // TODO: enabled once the batch transaction rollbacks with code delegation flows is introduced.
    xdescribe('Batch Transaction Rollback', function () {
        let contractA, contractB;

        before(async function () {
            contractA = await deploy(SIMPLE_7702_ACCOUNT);
            contractB = await deploy(SIMPLE_7702_ACCOUNT);
        });

        it('should keep delegation B after batch [CryptoUpdate→A, EthTx→B, Revert]', async function () {
            const batchKey = sdk.PrivateKey.generateECDSA();
            const privateKey = sdk.PrivateKey.generateECDSA();

            const { accountId } = await createAccount(privateKey, sdkClient);

            const updateToA = new sdk.AccountUpdateTransaction()
                .setAccountId(accountId)
                .setDelegationAddress(sdk.EvmAddress.fromString(contractA.address))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedUpdateToA = await updateToA.sign(privateKey);

            const updateToB = new sdk.AccountUpdateTransaction()
                .setAccountId(accountId)
                .setDelegationAddress(sdk.EvmAddress.fromString(contractB.address))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedUpdateToB = await updateToB.sign(privateKey);

            const revertingCallTx = new sdk.ContractExecuteTransaction()
                .setContractId(sdk.ContractId.fromEvmAddress(0, 0, ethers.ZeroAddress))
                .setGas(100_000)
                .setFunctionParameters(Buffer.from('deadbeef', 'hex'))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedRevertingCall = await revertingCallTx.sign(operatorKey);

            try {
                await executeBatchTransaction(
                    [signedUpdateToA, signedUpdateToB, signedRevertingCall],
                    batchKey,
                    sdkClient
                );
            } catch (err) {
                // Expected: batch may fail due to reverting call
                expect(err).to.exist;
                expect(err.code).to.equal('INNER_TRANSACTION_FAILED');
            }

            const verification = await verifyDelegationWithSDK(
                accountId, contractB.address, sdkClient
            );

            expect(verification.delegationAddress?.toLowerCase()).to.equal(
                contractB.address.toLowerCase()
            );
        });

        it('should keep delegation B after batch [EthTx→A, CryptoUpdate→B, Revert]', async function () {
            const batchKey = sdk.PrivateKey.generateECDSA();
            const privateKey = sdk.PrivateKey.generateECDSA();

            const { accountId } = await createAccount(privateKey, sdkClient);

            const updateToA = new sdk.AccountUpdateTransaction()
                .setAccountId(accountId)
                .setDelegationAddress(sdk.EvmAddress.fromString(contractA.address))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedUpdateToA = await updateToA.sign(privateKey);

            const updateToB = new sdk.AccountUpdateTransaction()
                .setAccountId(accountId)
                .setDelegationAddress(sdk.EvmAddress.fromString(contractB.address))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedUpdateToB = await updateToB.sign(privateKey);

            const revertingCallTx = new sdk.ContractExecuteTransaction()
                .setContractId(sdk.ContractId.fromEvmAddress(0, 0, ethers.ZeroAddress))
                .setGas(100_000)
                .setFunctionParameters(Buffer.from('deadbeef', 'hex'))
                .setBatchKey(batchKey.publicKey)
                .freezeWith(sdkClient);
            const signedRevertingCall = await revertingCallTx.sign(operatorKey);

            try {
                await executeBatchTransaction(
                    [signedUpdateToA, signedUpdateToB, signedRevertingCall],
                    batchKey,
                    sdkClient
                );
            } catch (err) {
                // Expected: batch may fail due to reverting call
            }

            const verification = await verifyDelegationWithSDK(
                accountId, contractB.address, sdkClient
            );

            expect(verification.delegationAddress?.toLowerCase()).to.equal(
                contractB.address.toLowerCase()
            );
        });
    });
});
