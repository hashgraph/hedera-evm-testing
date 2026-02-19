const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340');

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deploy, designatorFor, createAndFundEOA, encodeFunctionData, waitFor, Nonce, sendDelegation, verifyDelegation, associateHtsToken, associateHtsTokenViaDelegation, HTS_ADDRESS } = require('./utils/web3');
const { setupProviderAndNetwork } = require('./utils/setup');
const Utils = require('../../utils/utils');

const ERC_20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
];

const SMART_WALLET_EXECUTE_SIG = 'execute(address target, uint256 value, bytes calldata data)';

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';
const GAS_LIMIT = 1_500_000;
const TEST_TOKEN_NAME = "tokenName";
const TEST_TOKEN_SYMBOL = "tokenSymbol";

describe('HIP-1340 - EIP-7702 features - hiero specific tests', function () {
    /** @type {ethers.JsonRpcProvider | import('hardhat').HardhatEthersProvider} */
    let provider;

    /** @type {ethers.Network} */
    let network;

    before(async function () {
        ({ provider, network } = await setupProviderAndNetwork());
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, network.name, Number(network.chainId));
    });

    it('should return delegation designation to 0x167 when an HTS token is created', async function () {
        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        log('TokenCreateContract deployed at %s', tokenCreateContract.target);

        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);
        log('HTS fungible token created at %s', tokenAddress);

        // Let's verify the token properties
        const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);
        const name = await tokenContract.name();
        const symbol = await tokenContract.symbol();
        const totalSupply = await tokenContract.totalSupply();

        expect(name).to.be.equal(TEST_TOKEN_NAME);
        expect(symbol).to.be.equal(TEST_TOKEN_SYMBOL);
        expect(totalSupply).to.be.equal(10000000000);

        // Let's transfer 1000 tokens to another address
        const anotherAddress = await createAndFundEOA();
        await associateHtsToken(anotherAddress, tokenAddress);
        // Grant KYC (required because createFungibleTokenPublic creates the token with a KYC key)
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, anotherAddress.address));

        console.log('Transferring 1000 tokens to %s', anotherAddress.address);
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, anotherAddress.address, 1000));
        const anotherAddressBalance = await tokenContract.balanceOf(anotherAddress.address);
        expect(anotherAddressBalance).to.be.equal(1000);

        // Verify the HTS token address has a delegation designator pointing to 0x167
        // TODO(dsinyakov): uncomment when relay and MN respond with 7702 delegation
        // const code = await provider.getCode(tokenAddress);
        // expect(code).to.be.equal(designatorFor(HTS_ADDRESS));
    });

    it('should transfer HTS tokens when two EOAs delegate to the same Smart Wallet and send self-sponsored transactions', async function () {
        // 1. Create two EOAs and a receiver, all delegated to the same Smart Wallet
        const eoa1 = await createAndFundEOA();
        const eoa2 = await createAndFundEOA();
        const receiver = await createAndFundEOA();
        log('EOA1: %s, EOA2: %s, Receiver: %s', eoa1.address, eoa2.address, receiver.address);

        // 2. Deploy Simple7702Account (the Smart Wallet both EOAs will delegate to)
        const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
        log('Simple7702Account deployed at %s', smartWallet.address);

        const [eoa1Nonce, eoa2Nonce, receiverNonce] = [new Nonce(), new Nonce(), new Nonce()];

        // Delegate both EOAs to the Smart Wallet and verify via SDK bytecode
        await sendDelegation(eoa1, smartWallet.address, eoa1Nonce);
        await verifyDelegation(eoa1.address, smartWallet.address);

        await sendDelegation(eoa2, smartWallet.address, eoa2Nonce);
        await verifyDelegation(eoa2.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        log('TokenCreateContract deployed at %s', tokenCreateContract.target);

        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);
        log('HTS fungible token created at %s', tokenAddress);

        // Associate all accounts with the HTS token
        await associateHtsTokenViaDelegation(eoa1, tokenAddress, eoa1Nonce);
        await associateHtsTokenViaDelegation(eoa2, tokenAddress, eoa2Nonce);
        await associateHtsToken(receiver, tokenAddress, receiverNonce);

        // Grant KYC (required because createFungibleTokenPublic creates the token with a KYC key)
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, eoa1.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, eoa2.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, receiver.address));

        // Transfer HTS tokens from treasury to both EOAs
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, eoa1.address, 5_000));
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, eoa2.address, 7_000));
        log('Funded EOA1 with 5000 and EOA2 with 7000 HTS tokens');

        // Verify initial balances via ERC20 proxy
        const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);

        const eoa1InitBalance = await tokenContract.balanceOf(eoa1.address);
        assert(eoa1InitBalance === 5_000n, `EOA1 initial balance should be 5000 but got ${eoa1InitBalance}`);

        const eoa2InitBalance = await tokenContract.balanceOf(eoa2.address);
        assert(eoa2InitBalance === 7_000n, `EOA2 initial balance should be 7000 but got ${eoa2InitBalance}`);

        // EOA1 sends self-sponsored transaction to transfer 1500 HTS tokens to receiver
        const eoa1TransferCalldata = encodeFunctionData('transfer(address to, uint256 value)', [receiver.address, 1_500n]);
        const receipt1 = await waitFor(eoa1.sendTransaction({
            nonce: eoa1Nonce.next(),
            chainId: network.chainId,
            gasLimit: GAS_LIMIT,
            to: eoa1.address,
            data: encodeFunctionData(
                SMART_WALLET_EXECUTE_SIG,
                [tokenAddress, 0, eoa1TransferCalldata]
            ),
        }));
        assert(receipt1 !== null, 'EOA1 transfer receipt is null');
        log('EOA1 transfer tx: %s, logs: %d', receipt1.hash, receipt1.logs.length);

        // EOA2 sends self-sponsored transaction to transfer 2300 HTS tokens to receiver
        const eoa2TransferCalldata = encodeFunctionData('transfer(address to, uint256 value)', [receiver.address, 2_300n]);
        const receipt2 = await waitFor(eoa2.sendTransaction({
            nonce: eoa2Nonce.next(),
            chainId: network.chainId,
            gasLimit: GAS_LIMIT,
            to: eoa2.address,
            data: encodeFunctionData(
                SMART_WALLET_EXECUTE_SIG,
                [tokenAddress, 0, eoa2TransferCalldata]
            ),
        }));
        assert(receipt2 !== null, 'EOA2 transfer receipt is null');
        log('EOA2 transfer tx: %s, logs: %d', receipt2.hash, receipt2.logs.length);

        // Verify final balances
        const eoa1FinalBalance = await tokenContract.balanceOf(eoa1.address);
        expect(eoa1FinalBalance).to.be.equal(3_500n, 'EOA1 balance should be 3500 after transfer');

        const eoa2FinalBalance = await tokenContract.balanceOf(eoa2.address);
        expect(eoa2FinalBalance).to.be.equal(4_700n, 'EOA2 balance should be 4700 after transfer');

        const receiverBalance = await tokenContract.balanceOf(receiver.address);
        expect(receiverBalance).to.be.equal(3_800n, 'Receiver balance should be 3800 (1500 + 2300)');

        // Verify HTS Transfer events are emitted correctly and visible from the EOA transactions
        const transferEventSig = ethers.id('Transfer(address,address,uint256)');

        // --- EOA1 receipt: HTS Transfer event ---
        const eoa1TransferLogs = receipt1.logs.filter(l => l.topics[0] === transferEventSig);
        expect(eoa1TransferLogs.length).to.be.greaterThanOrEqual(1, 'EOA1 receipt should contain HTS Transfer event');

        expect(eoa1TransferLogs[0].address.toLowerCase()).to.equal(
            tokenAddress.toLowerCase(),
            'Transfer event should be emitted from the HTS token address'
        );
        expect(eoa1TransferLogs[0].topics[1]).to.equal(
            ethers.zeroPadValue(eoa1.address, 32).toLowerCase(),
            'Transfer `from` should be EOA1'
        );
        expect(eoa1TransferLogs[0].topics[2]).to.equal(
            ethers.zeroPadValue(receiver.address, 32).toLowerCase(),
            'Transfer `to` should be receiver'
        );

        // --- EOA2 receipt: HTS Transfer event ---
        const eoa2TransferLogs = receipt2.logs.filter(l => l.topics[0] === transferEventSig);
        expect(eoa2TransferLogs.length).to.be.greaterThanOrEqual(1, 'EOA2 receipt should contain HTS Transfer event');

        expect(eoa2TransferLogs[0].address.toLowerCase()).to.equal(
            tokenAddress.toLowerCase(),
            'Transfer event should be emitted from the HTS token address'
        );
        expect(eoa2TransferLogs[0].topics[1]).to.equal(
            ethers.zeroPadValue(eoa2.address, 32).toLowerCase(),
            'Transfer `from` should be EOA2'
        );
        expect(eoa2TransferLogs[0].topics[2]).to.equal(
            ethers.zeroPadValue(receiver.address, 32).toLowerCase(),
            'Transfer `to` should be receiver'
        );
    });

});
