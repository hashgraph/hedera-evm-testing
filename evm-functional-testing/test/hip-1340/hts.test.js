const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:hts');

const {expect} = require('chai');
const {ethers} = require('hardhat');
const {deploy, createAndFundEOA, waitFor, Nonce, sendDelegation, verifyDelegation, designatorFor, encodeFunctionData} = require('./utils/web3');
const {associateHtsToken, associateHtsTokenViaDelegation, transferHtsTokenViaDelegation, executeBatchViaDelegation} = require('./utils/hts');
const {setupProviderAndNetwork} = require('./utils/setup');
const Utils = require('../../utils/utils');
const {validateErcEvent} = require('../../utils/events');
const {HTS_ADDRESS, ONE_HBAR, TINYBAR_TO_WEIBAR_COEF} = require("../../utils/constants");
const {getContractByteCode} = require("./utils/sdk");
const {MirrorNode} = require("evm-functional-testing/mirror-node");

const ERC_20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
];

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';
const TEST_TOKEN_NAME = "tokenName";
const TEST_TOKEN_SYMBOL = "tokenSymbol";

describe('HIP-1340 - EIP-7702 features - hiero specific tests', function () {
    /** @type {ethers.JsonRpcProvider | import('hardhat').HardhatEthersProvider} */
    let provider;

    /** @type {ethers.Network} */
    let network;

    before(async function () {
        ({provider, network} = await setupProviderAndNetwork());
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, network.name, Number(network.chainId));
    });

    it('should return delegation designation to 0x167 when an HTS token is created', async function () {
        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

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

        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, anotherAddress.address, 1000));
        const anotherAddressBalance = await tokenContract.balanceOf(anotherAddress.address);
        expect(anotherAddressBalance).to.be.equal(1000);

        // Verify the HTS token address has a delegation designator pointing to 0x167
        const { token_id: tokenId } = await new MirrorNode().getToken(tokenAddress);
        const bytecode = await getContractByteCode(tokenId);
        const contractBytecode = '0x' + Buffer.from(bytecode).toString('hex');
        // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
        // const code = await provider.getCode(tokenAddress);
        // expect(code).to.be.equal(designatorFor(HTS_ADDRESS));
        expect(contractBytecode).to.be.equal(designatorFor(HTS_ADDRESS));
    });

    it('should transfer HTS tokens when two EOAs delegate to the same Smart Wallet and send self-sponsored transactions', async function () {
        // Create two EOAs and a receiver, all delegated to the same Smart Wallet
        const eoa1 = await createAndFundEOA();
        const eoa2 = await createAndFundEOA();
        const receiver = await createAndFundEOA();

        // Deploy Simple7702Account (the Smart Wallet both EOAs will delegate to)
        const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);

        const [eoa1Nonce, eoa2Nonce, receiverNonce] = [new Nonce(), new Nonce(), new Nonce()];

        // Delegate both EOAs to the Smart Wallet and verify via SDK bytecode
        await sendDelegation(eoa1, smartWallet.address, eoa1Nonce);
        await verifyDelegation(eoa1.address, smartWallet.address);

        await sendDelegation(eoa2, smartWallet.address, eoa2Nonce);
        await verifyDelegation(eoa2.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();

        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

        // Associate all accounts with the HTS token
        await associateHtsTokenViaDelegation(eoa1, tokenAddress, eoa1Nonce);
        await associateHtsTokenViaDelegation(eoa2, tokenAddress, eoa2Nonce);
        await associateHtsToken(receiver, tokenAddress, receiverNonce);

        // Grant KYC (required because createFungibleTokenPublic creates the token with a KYC key)
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, eoa1.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, eoa2.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, receiver.address));

        // Transfer HTS tokens from treasury to both EOAs
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, eoa1.address, 5_000n));
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, eoa2.address, 7_000n));

        // Verify initial balances via ERC20 proxy
        const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);

        const eoa1InitBalance = await tokenContract.balanceOf(eoa1.address);
        assert(eoa1InitBalance === 5_000n, `EOA1 initial balance should be 5000 but got ${eoa1InitBalance}`);

        const eoa2InitBalance = await tokenContract.balanceOf(eoa2.address);
        assert(eoa2InitBalance === 7_000n, `EOA2 initial balance should be 7000 but got ${eoa2InitBalance}`);

        // EOA1 sends self-sponsored transaction to transfer 1500 HTS tokens to receiver
        const receipt1 = await transferHtsTokenViaDelegation(eoa1, tokenAddress, receiver.address, 1_500n, eoa1Nonce);
        assert(receipt1 !== null, 'EOA1 transfer receipt is null');

        // EOA2 sends self-sponsored transaction to transfer 2300 HTS tokens to receiver
        const receipt2 = await transferHtsTokenViaDelegation(eoa2, tokenAddress, receiver.address, 2_300n, eoa2Nonce);
        assert(receipt2 !== null, 'EOA2 transfer receipt is null');

        // Verify final balances
        const eoa1FinalBalance = await tokenContract.balanceOf(eoa1.address);
        expect(eoa1FinalBalance).to.be.equal(3_500n, 'EOA1 balance should be 3500 after transfer');

        const eoa2FinalBalance = await tokenContract.balanceOf(eoa2.address);
        expect(eoa2FinalBalance).to.be.equal(4_700n, 'EOA2 balance should be 4700 after transfer');

        const receiverBalance = await tokenContract.balanceOf(receiver.address);
        expect(receiverBalance).to.be.equal(3_800n, 'Receiver balance should be 3800 (1500 + 2300)');

        // Verify HTS Transfer events are emitted correctly and visible from the EOA transactions
        await validateErcEvent(receipt1, [
            {address: tokenAddress, from: eoa1.address, to: receiver.address, amount: 1_500n},
        ]);
        await validateErcEvent(receipt2, [
            {address: tokenAddress, from: eoa2.address, to: receiver.address, amount: 2_300n},
        ]);
    });

    it('should batch-transfer HTS tokens to multiple recipients from a delegated EOA via executeBatch', async function () {
        // Create Alice (delegator), Bob and Carol (receivers)
        const alice = await createAndFundEOA();
        const bob = await createAndFundEOA();
        const carol = await createAndFundEOA();

        // Deploy Simple7702Account and delegate Alice
        const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
        const aliceNonce = new Nonce();
        const bobNonce = new Nonce();
        const carolNonce = new Nonce();

        await sendDelegation(alice, smartWallet.address, aliceNonce);
        await verifyDelegation(alice.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

        // Associate all accounts with the HTS token
        await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce);
        await associateHtsToken(bob, tokenAddress, bobNonce);
        await associateHtsToken(carol, tokenAddress, carolNonce);

        // Grant KYC to all
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, alice.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, bob.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, carol.address));

        // Transfer 500 HTS tokens from treasury to Alice
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, alice.address, 500n));

        // Verify initial balances
        const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);
        const aliceInitTokens = await tokenContract.balanceOf(alice.address);
        assert(aliceInitTokens === 500n, `Alice should have 500 tokens but has ${aliceInitTokens}`);

        // Alice batch-transfers: 100 tokens to Bob + 150 tokens to Carol in one transaction
        const transferToBob = encodeFunctionData('transfer(address to, uint256 value)', [bob.address, 100n]);
        const transferToCarol = encodeFunctionData('transfer(address to, uint256 value)', [carol.address, 150n]);

        const receipt = await executeBatchViaDelegation(alice, [
            { target: tokenAddress, value: 0n, data: transferToBob },
            { target: tokenAddress, value: 0n, data: transferToCarol },
        ], aliceNonce);
        assert(receipt !== null, 'Batch execution receipt is null');

        // Verify final balances
        const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
        expect(aliceFinalTokens).to.be.equal(250n, 'Alice should have 250 tokens remaining (500 - 100 - 150)');

        const bobTokens = await tokenContract.balanceOf(bob.address);
        expect(bobTokens).to.be.equal(100n, 'Bob should have received 100 tokens');

        const carolTokens = await tokenContract.balanceOf(carol.address);
        expect(carolTokens).to.be.equal(150n, 'Carol should have received 150 tokens');

        // Verify HTS Transfer events
        await validateErcEvent(receipt, [
            { address: tokenAddress, from: alice.address, to: bob.address, amount: 100n },
            { address: tokenAddress, from: alice.address, to: carol.address, amount: 150n },
        ]);
    });

    it('should batch-transfer 1 HBAR and 100 HTS tokens from a delegated EOA to another EOA via executeBatch', async function () {
        const alice = await createAndFundEOA();
        const bob = await createAndFundEOA();

        const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
        const aliceNonce = new Nonce();
        const bobNonce = new Nonce();

        await sendDelegation(alice, smartWallet.address, aliceNonce);
        await verifyDelegation(alice.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

        // Associate both accounts with the HTS token
        await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce);
        await associateHtsToken(bob, tokenAddress, bobNonce);

        // Grant KYC to both
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, alice.address));
        await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, bob.address));

        // Transfer 500 HTS tokens from treasury to Alice
        await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, alice.address, 500n));

        const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);
        const aliceInitTokens = await tokenContract.balanceOf(alice.address);
        assert(aliceInitTokens === 500n, `Alice should have 500 tokens but has ${aliceInitTokens}`);

        const bobBalanceBefore = await provider.getBalance(bob.address);
        const bobTokensBefore = await tokenContract.balanceOf(bob.address);

        // Internal EVM calls use tinybars (8 decimals), not weibars (18 decimals).
        const oneHbarInTinybars = ONE_HBAR / TINYBAR_TO_WEIBAR_COEF;

        const transferCalldata = encodeFunctionData(
            'transfer(address to, uint256 value)',
            [bob.address, 100n]
        );

        const receipt = await executeBatchViaDelegation(alice, [
            { target: bob.address, value: oneHbarInTinybars, data: '0x' },
            { target: tokenAddress, value: 0n, data: transferCalldata },
        ], aliceNonce);
        assert(receipt !== null, 'Batch execution receipt is null');

        // Verify HBAR transfer
        const bobBalanceAfter = await provider.getBalance(bob.address);
        expect(bobBalanceAfter - bobBalanceBefore).to.be.equal(ONE_HBAR, 'Bob should have received 1 HBAR');

        // Verify HTS token transfer
        const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
        expect(aliceFinalTokens).to.be.equal(400n, 'Alice should have 400 tokens remaining');

        const bobTokensAfter = await tokenContract.balanceOf(bob.address);
        expect(bobTokensAfter - bobTokensBefore).to.be.equal(100n, 'Bob should have received 100 tokens');

        // Verify HTS Transfer event
        await validateErcEvent(receipt, [
            { address: tokenAddress, from: alice.address, to: bob.address, amount: 100n },
        ]);
    });

});
