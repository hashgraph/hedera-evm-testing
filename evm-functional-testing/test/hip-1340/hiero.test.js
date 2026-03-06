const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:hts');

const {expect} = require('chai');
const {ethers} = require('hardhat');
const {
    deploy,
    createAndFundEOA,
    waitFor,
    sendDelegation,
    verifyDelegation,
    designatorFor,
    encodeFunctionData,
    authorizeEOADelegation,
    sendDelegationCreationTx
} = require('./utils/web3');
const {
    associateHtsToken, associateHtsTokenViaDelegation, transferHtsTokenViaDelegation, executeBatchViaDelegation
} = require('./utils/hts');
const {setupProviderAndNetwork} = require('./utils/setup');
const Utils = require('../../utils/utils');
const {validateErcEvent} = require('../../utils/events');
const {HTS_ADDRESS, ONE_HBAR, TINYBAR_TO_WEIBAR_COEF, GAS_LIMIT_1_000_000} = require("../../utils/constants");
const {getContractByteCode} = require("./utils/sdk");
const {MirrorNode} = require("evm-functional-testing/mirror-node");
const web3 = require("./utils/web3");

const ERC_20_ABI = ['function name() view returns (string)', 'function symbol() view returns (string)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address owner) view returns (uint256)',];

const SIMPLE_7702_ACCOUNT = '@account-abstraction/contracts/accounts/Simple7702Account';
const HAS_SELECTORS_CONTRACT = 'contracts/hip-1340/HasFacadeSelectors';
const TEST_TOKEN_NAME = "tokenName";
const TEST_TOKEN_SYMBOL = "tokenSymbol";

describe('HIP-1340 - Hiero specific tests', function () {
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
        const {token_id: tokenId} = await new MirrorNode().getToken(tokenAddress);
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

        let eoa1Nonce = 0;
        let eoa2Nonce = 0;
        let receiverNonce = 0;

        // Delegate both EOAs to the Smart Wallet and verify via SDK bytecode
        await sendDelegation(eoa1, smartWallet.address, eoa1Nonce);
        eoa1Nonce += 2;
        await verifyDelegation(eoa1.address, smartWallet.address);

        await sendDelegation(eoa2, smartWallet.address, eoa2Nonce);
        eoa2Nonce += 2;
        await verifyDelegation(eoa2.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();

        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

        // Associate all accounts with the HTS token
        await associateHtsTokenViaDelegation(eoa1, tokenAddress, eoa1Nonce++);
        await associateHtsTokenViaDelegation(eoa2, tokenAddress, eoa2Nonce++);
        await associateHtsToken(receiver, tokenAddress, receiverNonce++);

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
        const receipt1 = await transferHtsTokenViaDelegation(eoa1, tokenAddress, receiver.address, 1_500n, eoa1Nonce++);
        assert(receipt1 !== null, 'EOA1 transfer receipt is null');

        // EOA2 sends self-sponsored transaction to transfer 2300 HTS tokens to receiver
        const receipt2 = await transferHtsTokenViaDelegation(eoa2, tokenAddress, receiver.address, 2_300n, eoa2Nonce++);
        assert(receipt2 !== null, 'EOA2 transfer receipt is null');

        // Verify final balances
        const eoa1FinalBalance = await tokenContract.balanceOf(eoa1.address);
        expect(eoa1FinalBalance).to.be.equal(3_500n, 'EOA1 balance should be 3500 after transfer');

        const eoa2FinalBalance = await tokenContract.balanceOf(eoa2.address);
        expect(eoa2FinalBalance).to.be.equal(4_700n, 'EOA2 balance should be 4700 after transfer');

        const receiverBalance = await tokenContract.balanceOf(receiver.address);
        expect(receiverBalance).to.be.equal(3_800n, 'Receiver balance should be 3800 (1500 + 2300)');

        // Verify HTS Transfer events are emitted correctly and visible from the EOA transactions
        await validateErcEvent(receipt1, [{
            address: tokenAddress,
            from: eoa1.address,
            to: receiver.address,
            amount: 1_500n
        },]);
        await validateErcEvent(receipt2, [{
            address: tokenAddress,
            from: eoa2.address,
            to: receiver.address,
            amount: 2_300n
        },]);
    });

    it('should batch-transfer HTS tokens to multiple recipients from a delegated EOA via executeBatch', async function () {
        // Create Alice (delegator), Bob and Carol (receivers)
        const alice = await createAndFundEOA();
        const bob = await createAndFundEOA();
        const carol = await createAndFundEOA();

        // Deploy Simple7702Account and delegate Alice
        const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
        let aliceNonce = 0;
        let bobNonce = 0;
        let carolNonce = 0;

        await sendDelegation(alice, smartWallet.address, aliceNonce);
        aliceNonce += 2;
        await verifyDelegation(alice.address, smartWallet.address);

        // Deploy TokenCreateContract and create HTS fungible token
        const tokenCreateContract = await Utils.deployTokenCreateContract();
        const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

        // Associate all accounts with the HTS token
        await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce++);
        await associateHtsToken(bob, tokenAddress, bobNonce++);
        await associateHtsToken(carol, tokenAddress, carolNonce++);

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

        const receipt = await executeBatchViaDelegation(alice, [{
            target: tokenAddress,
            value: 0n,
            data: transferToBob
        }, {target: tokenAddress, value: 0n, data: transferToCarol},], aliceNonce++);
        assert(receipt !== null, 'Batch execution receipt is null');

        // Verify final balances
        const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
        expect(aliceFinalTokens).to.be.equal(250n, 'Alice should have 250 tokens remaining (500 - 100 - 150)');

        const bobTokens = await tokenContract.balanceOf(bob.address);
        expect(bobTokens).to.be.equal(100n, 'Bob should have received 100 tokens');

        const carolTokens = await tokenContract.balanceOf(carol.address);
        expect(carolTokens).to.be.equal(150n, 'Carol should have received 150 tokens');

        // Verify HTS Transfer events
        await validateErcEvent(receipt, [{
            address: tokenAddress,
            from: alice.address,
            to: bob.address,
            amount: 100n
        }, {address: tokenAddress, from: alice.address, to: carol.address, amount: 150n},]);
    });

    it('should batch-transfer 1 HBAR and 100 HTS tokens from a delegated EOA to another EOA via executeBatch', async function () {
        const scenario = await setupBatchHbarAndHtsTransferScenario();
        await associateRecipientDirectly(scenario);
        await executeAndAssertBatchHbarAndHtsTransfer(scenario, provider);
    });

    it('should batch-transfer 1 HBAR and 100 HTS tokens when recipient associates via delegation', async function () {
        const scenario = await setupBatchHbarAndHtsTransferScenario();
        await associateRecipientViaDelegation(scenario);
        await executeAndAssertBatchHbarAndHtsTransfer(scenario, provider);
    });

    it('should not create account via delegation if insufficient gas to cover account creation', async function () {
        const eoa = await createAndFundEOA();
        const delegated = ethers.Wallet.createRandom();
        const timeoutMs = 10_000;

        const tx = await sendDelegationCreationTx({eoa, delegated});
        try {
            await tx.wait(1, timeoutMs);
        } catch (err) {
            if (err?.code !== 'TIMEOUT') throw err;
        }
        await assertDelegatedAccountDoesNotExist(provider, delegated.address);
    });

    it('should not create account via delegation when sending value to delegated address if insufficient gas', async function () {
        const eoa = await createAndFundEOA();
        const delegated = ethers.Wallet.createRandom();
        const value = 10n * ONE_HBAR;
        const timeoutMs = 10_000;

        const tx = await sendDelegationCreationTx({
            eoa, delegated, to: delegated.address, value,
        });
        try {
            await tx.wait(1, timeoutMs);
        } catch (err) {
            if (err?.code !== 'TIMEOUT') throw err;
        }
        await assertDelegatedAccountDoesNotExist(provider, delegated.address);
    });

    it('should charge gas for account creation during delegation to non-existing EOA', async function () {
        const eoa = await createAndFundEOA();
        const delegated = ethers.Wallet.createRandom();
        const gasLimit = 46000;

        const tx = await sendDelegationCreationTx({eoa, delegated, gasLimit});
        const receipt = await tx.wait();

        expect(receipt.status).to.equal(1, 'Transaction should succeed');
        expect(Number(receipt.gasUsed), 'Gas should be charged for account creation').to.be.equal(gasLimit);

        await assertDelegatedAccountExists(provider, delegated.address);
    });

    it('should ignore the delegation to system contract and call system contract directly', async function () {
        const eoa = await createAndFundEOA();
        let nonce = 0;

        // Delegate the EOA to the HTS system contract.
        await sendDelegation(eoa, HTS_ADDRESS, nonce);
        nonce += 2;
        await verifyDelegation(eoa.address, HTS_ADDRESS);

        // Try to call HIP-1215 Schedule Service selector `scheduleCall` through the delegated EOA.
        const expirySecond = BigInt(Math.floor(Date.now() / 1000) + 600);
        const scheduleCallData = encodeFunctionData('scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes callData)', [eoa.address, expirySecond, 100_000n, 0n, '0x'],);

        const tx = await eoa.sendTransaction({
            chainId: network.chainId,
            nonce: nonce++,
            gasLimit: GAS_LIMIT_1_000_000.gasLimit,
            to: eoa.address,
            data: scheduleCallData,
        });

        const receipt = await tx.wait();
        expect(receipt, 'Transaction receipt should be available').to.not.be.null;
        expect(receipt.status).to.equal(1, 'Transaction should be processed');
    });

    it('should ignore the delegation of alice to bob when calling HAS methods', async function () {
        const alice = await createAndFundEOA();
        const bob = await createAndFundEOA();
        const spender = (await createAndFundEOA()).address;
        let aliceNonce = 0;

        // Delegate the EOA to the HTS system contract.
        await sendDelegation(alice, bob.address, aliceNonce);
        aliceNonce += 2;
        await verifyDelegation(alice.address, bob.address);

        const hasIface = new ethers.Interface([
            'function hbarAllowance(address spender) returns (int64 responseCode, int256 allowance)',
        ]);
        const readAllowance = async (address) => {
            const result = await provider.call({
                to: address,
                data: encodeFunctionData('hbarAllowance(address spender)', [spender]),
            });
            expect(result).to.not.equal('0x', 'hbarAllowance should return response payload');
            const [responseCode, allowance] = hasIface.decodeFunctionResult('hbarAllowance', result);
            expect(responseCode).to.equal(22n, 'hbarAllowance should return SUCCESS response code');
            return allowance;
        };

        const allowanceBefore = await readAllowance(alice.address);
        expect(allowanceBefore).to.equal(0n, 'Initial allowance should be zero');

        const amount = 123n;
        const approveTx = await alice.sendTransaction({
            chainId: network.chainId,
            nonce: aliceNonce++,
            gasLimit: GAS_LIMIT_1_000_000.gasLimit,
            to: alice.address,
            data: encodeFunctionData('hbarApprove(address spender, int256 amount)', [spender, amount]),
        });
        const approveReceipt = await approveTx.wait();
        expect(approveReceipt.status).to.equal(1, 'hbarApprove transaction should be processed');

        const bobsAllowance = await readAllowance(bob.address);
        expect(bobsAllowance).to.equal(0, 'bobs allowance should be zero');

        const allowanceAfter = await readAllowance(alice.address);
        expect(allowanceAfter).to.equal(amount, 'alice allowance should not change after hbarApprove');
    });

    it('should deploy HasFacadeSelectors and expose expected HAS selectors', async function () {
        const {contract} = await deploy(HAS_SELECTORS_CONTRACT);
        const hbarAllowanceSelector = contract.interface.getFunction('hbarAllowance(address)').selector;
        const hbarApproveSelector = contract.interface.getFunction('hbarApprove(address,int256)').selector;
        const setUnlimitedAutoAssocSelector = contract.interface.getFunction('setUnlimitedAutomaticAssociations(bool)').selector;

        expect(hbarAllowanceSelector).to.equal('0xbbee989e');
        expect(hbarApproveSelector).to.equal('0x86aff07c');
        expect(setUnlimitedAutoAssocSelector).to.equal('0xf5677e99');
    });

    it('should prioritize HAS proxy over delegated contract methods with the same selectors', async () => {
        const {address: hasSelectorsAddress} = await deploy(HAS_SELECTORS_CONTRACT);
        const eoa = await createAndFundEOA();
        let eoaNonce = 0;
        await authorizeEOADelegation(eoa, hasSelectorsAddress, eoaNonce++);
        await verifyDelegation(eoa.address, hasSelectorsAddress);

        const eventIface = new ethers.Interface(['event HbarAllowanceCalled(address indexed caller, address indexed spender)', 'event HbarApproveCalled(address indexed caller, address indexed spender, int256 amount)', 'event SetUnlimitedAutomaticAssociationsCalled(address indexed caller, bool enabled)',]);

        const spender = (await createAndFundEOA()).address;
        const sendAndAssertProxiedCall = async (signature, args, blockedEvent) => {
            const tx = await eoa.sendTransaction({
                chainId: network.chainId,
                nonce: eoaNonce++,
                gasLimit: GAS_LIMIT_1_000_000.gasLimit,
                to: eoa.address,
                data: encodeFunctionData(signature, args),
            });
            const receipt = await tx.wait();
            assert(receipt !== null, `Receipt is null for ${signature}`);
            expect(receipt.status).to.equal(1, `Expected ${signature} call via HAS proxy to succeed`);
            // We expect no facade logs if the call is proxied to HAS system contract.
            const deniedLog = receipt.logs.find(l => l.topics[0] === eventIface.getEvent(blockedEvent).topicHash);
            expect(deniedLog).to.equal(undefined, `Facade event ${blockedEvent} should not be emitted on proxied path`);
        };

        // Approve HBAR allowance through delegated EOA and ensure facade event is not emitted.
        await sendAndAssertProxiedCall('hbarApprove(address spender, int256 amount)', [spender, 123n], 'HbarApproveCalled',);

        // Verify allowance reflects the prior approval.
        const allowanceResult = await provider.call({
            to: eoa.address, data: encodeFunctionData('hbarAllowance(address spender)', [spender]),
        });
        const [responseCode, allowance] = new ethers.Interface(['function hbarAllowance(address spender) returns (int64 responseCode, int256 allowance)',]).decodeFunctionResult('hbarAllowance', allowanceResult);
        expect(responseCode).to.equal(22n, 'hbarAllowance should return SUCCESS response code');
        expect(allowance).to.equal(123n, 'hbarAllowance should reflect the amount from hbarApprove');

        // Another HAS selector should also be proxied, without invoking facade code.
        await sendAndAssertProxiedCall('setUnlimitedAutomaticAssociations(bool enableAutoAssociations)', [true], 'SetUnlimitedAutomaticAssociationsCalled',);

        // Verify account setting was updated by HAS proxy call.
        const maxAutoAssociations = await Utils.getMaxAutomaticTokenAssociations(eoa.address);
        expect(maxAutoAssociations).to.equal(-1, 'Expected unlimited automatic token associations');
    });

});

async function setupBatchHbarAndHtsTransferScenario() {
    const alice = await createAndFundEOA();
    const bob = await createAndFundEOA();

    const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
    let aliceNonce = 0;
    let bobNonce = 0;

    await sendDelegation(alice, smartWallet.address, aliceNonce);
    aliceNonce += 2;
    await verifyDelegation(alice.address, smartWallet.address);

    const tokenCreateContract = await Utils.deployTokenCreateContract();
    const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

    await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce++);

    return {alice, bob, smartWallet, aliceNonce, bobNonce, tokenCreateContract, tokenAddress};
}

async function associateRecipientDirectly(scenario) {
    await associateHtsToken(scenario.bob, scenario.tokenAddress, scenario.bobNonce++);
}

async function associateRecipientViaDelegation(scenario) {
    await sendDelegation(scenario.bob, scenario.smartWallet.address, scenario.bobNonce);
    scenario.bobNonce += 2;
    await verifyDelegation(scenario.bob.address, scenario.smartWallet.address);
    await associateHtsTokenViaDelegation(scenario.bob, scenario.tokenAddress, scenario.bobNonce++);
}

async function executeAndAssertBatchHbarAndHtsTransfer({
                                                           alice,
                                                           bob,
                                                           aliceNonce,
                                                           tokenCreateContract,
                                                           tokenAddress
                                                       }, provider,) {
    await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, alice.address));
    await waitFor(tokenCreateContract.grantTokenKycPublic(tokenAddress, bob.address));
    await waitFor(tokenCreateContract.transferTokenPublic(tokenAddress, alice.address, 500n));

    const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);
    const aliceInitTokens = await tokenContract.balanceOf(alice.address);
    assert(aliceInitTokens === 500n, `Alice should have 500 tokens but has ${aliceInitTokens}`);

    const bobBalanceBefore = await provider.getBalance(bob.address);
    const bobTokensBefore = await tokenContract.balanceOf(bob.address);

    const oneHbarInTinybars = ONE_HBAR / TINYBAR_TO_WEIBAR_COEF;
    const transferCalldata = encodeFunctionData('transfer(address to, uint256 value)', [bob.address, 100n],);

    const receipt = await executeBatchViaDelegation(alice, [{
        target: bob.address,
        value: oneHbarInTinybars,
        data: '0x'
    }, {target: tokenAddress, value: 0n, data: transferCalldata},], aliceNonce);
    assert(receipt !== null, 'Batch execution receipt is null');

    const bobBalanceAfter = await provider.getBalance(bob.address);
    expect(bobBalanceAfter - bobBalanceBefore).to.be.equal(ONE_HBAR, 'Bob should have received 1 HBAR');

    const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
    expect(aliceFinalTokens).to.be.equal(400n, 'Alice should have 400 tokens remaining');

    const bobTokensAfter = await tokenContract.balanceOf(bob.address);
    expect(bobTokensAfter - bobTokensBefore).to.be.equal(100n, 'Bob should have received 100 tokens');

    await validateErcEvent(receipt, [{address: tokenAddress, from: alice.address, to: bob.address, amount: 100n},]);
}

/**
 * Asserts that the given address has no Hedera account and zero balance.
 * @param {ethers.Provider} provider
 * @param {string} delegatedAddress
 */
async function assertDelegatedAccountDoesNotExist(provider, delegatedAddress) {
    const delegatedAccount = await new MirrorNode().getAccount(delegatedAddress);
    expect(delegatedAccount.account).to.be.equal(undefined, 'Delegated account should not exist on Hedera');
    expect(delegatedAccount._status?.messages?.[0]?.message).to.be.equal('Not found');
    expect(await provider.getBalance(delegatedAddress)).to.be.equal(0);
}

/**
 * Asserts that the given address has Hedera account.
 * @param {ethers.Provider} provider
 * @param {string} delegatedAddress
 */
async function assertDelegatedAccountExists(provider, delegatedAddress) {
    const delegatedAccount = await new MirrorNode().getAccount(delegatedAddress);
    expect(delegatedAccount.account, 'Delegated account should exist on Hedera').to.not.be.undefined;
    expect(delegatedAccount._status?.messages?.[0]?.message, 'Delegated account should not have Not found status').to.not.equal('Not found');
}