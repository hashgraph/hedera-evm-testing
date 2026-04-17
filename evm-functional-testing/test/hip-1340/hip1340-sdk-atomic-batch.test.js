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
} = require('@hiero-ledger/sdk');
const { gas, deploy } = require('./utils/web3');

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';

describe('Atomic Batch: CryptoCreate + EIP-7702 delegation', function () {
    let client, provider, network;

    before(async function () {
        provider = ethers.provider;
        network = await provider.getNetwork();

        const { sdkClient } = hre.network.config;
        client = Client.forNetwork(sdkClient.networkNode)
            .setOperator(sdkClient.operatorId, sdkClient.operatorKey);
    });

    after(function () {
        client?.close();
    });

    it('should atomically create an account and set delegation in one batch', async function () {
        // ── 1. Generate ECDSA key for the new account ──────────────────────────
        // Start from an ethers wallet so we can call .authorize() later.
        // Import the same key into the SDK for AccountCreateTransaction.
        const newAccountEthersWallet = ethers.Wallet.createRandom(provider);
        const newAccountKey = PrivateKey.fromStringECDSA(newAccountEthersWallet.privateKey);
        const newAccountEvmAddress = newAccountEthersWallet.address;

        // ── 2. Deploy the smart wallet contract to delegate to ─────────────────
        const { address: smartWalletAddress } = await deploy(SIMPLE_7702_ACCOUNT);

        // ── 3. Inner tx 1: AccountCreateTransaction ────────────────────────────
        // Setting an ECDSA key auto-assigns the EVM alias (= newAccountEvmAddress).
        // batchify(): sets batch key to operator key, freezes, signs with operator.
        // We then add the new account's self-signature (required for ECDSA alias accounts).
        const accountCreateTx = await (
            await new AccountCreateTransaction()
                .setECDSAKeyWithAlias(newAccountKey.publicKey)
                .setInitialBalance(new Hbar(10))
                .batchify(client, client.operatorPublicKey)
        ).sign(newAccountKey);

        // ── 4. Build the signed type-4 raw bytes via ethers.js ────────────────
        // The sponsor (operator) pays gas; the new account signs only the authorizationList.
        // chainId: 0  → auth valid on any chain
        // nonce: 0    → new account starts at nonce 0 (it doesn't exist yet)
        const authorization = await newAccountEthersWallet.authorize({
            chainId: 0,
            nonce: 0,
            address: smartWalletAddress,
        });

        const sponsor = new ethers.Wallet(hre.network.config.accounts[0], provider);
        const rawType4Tx = await sponsor.signTransaction({
            type: 4,
            chainId: network.chainId,
            nonce: await sponsor.getNonce(),
            maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
            maxFeePerGas: ethers.parseUnits('710', 'gwei'),
            gasLimit: gas.base + gas.codeAuthorization(1) + gas.accountCreationCost(),
            to: ethers.ZeroAddress,
            value: 0n,
            accessList: [],
            authorizationList: [authorization],
        });

        // ── 5. Parse signed bytes through EthereumTransactionDataEip7702 ───────
        // fromBytes() decodes the RLP-encoded type-4 tx (0x04-prefixed) into the
        // SDK's typed structure, giving us .toBytes() to pass into EthereumTransaction.
        const eip7702Data = EthereumTransactionDataEip7702.fromBytes(
            Buffer.from(rawType4Tx.slice(2), 'hex')  // strip '0x' prefix
        );

        // ── 6. Inner tx 2: EthereumTransaction wrapping the type-4 data ───────
        const ethereumTx = await new EthereumTransaction()
            .setEthereumData(eip7702Data.toBytes())
            .setMaxGasAllowanceHbar(new Hbar(2))
            .batchify(client, client.operatorPublicKey);

        // ── 7. Assemble and execute the BatchTransaction ───────────────────────
        // execute() signs the outer BatchTransaction with the operator key,
        // satisfying the batch key set on both inner transactions.
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
});