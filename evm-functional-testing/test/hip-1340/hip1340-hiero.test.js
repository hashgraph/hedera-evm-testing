const assert = require('node:assert').strict;
const log = require('node:util').debuglog('hip-1340:hts');

const {expect} = require('chai');
const {ethers} = require('hardhat');
const {Hip1340TestContext, Nonce} = require('./utils/test-context');
const {
    deploy,
    gas,
    delegationIndicatorFor,
    encodeFunctionData,
    sendDelegation,
    verifyDelegation,
    sendDelegationCreationTx,
    executeBatchViaDelegation,
    assertAccountDoesNotExist,
    assertAccountExists,
} = require('./utils/web3');
const {
    associateHtsToken, associateHtsTokenViaDelegation, transferHtsTokenViaDelegation,
    grantKyc, fundAccountsWithHtsToken
} = require('./utils/hts');
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
    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
        log('Starting test suite `%s` on network `%s` (chain id %s)', this.test.parent.title, this.network.name, Number(this.network.chainId));
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        await this.testCtx.init();
    });

    describe('HTS token delegation designator', function () {
        it('should return delegation designation to 0x167 when an HTS token is created', async function () {
            const tokenCreateContract = await Utils.deployTokenCreateContract();
            const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

            const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, this.provider);
            const name = await tokenContract.name();
            const symbol = await tokenContract.symbol();
            const totalSupply = await tokenContract.totalSupply();

            expect(name).to.be.equal(TEST_TOKEN_NAME);
            expect(symbol).to.be.equal(TEST_TOKEN_SYMBOL);
            expect(totalSupply).to.be.equal(10000000000);

            const anotherAddress = await this.testCtx.createAndFundEOA();
            await associateHtsToken(anotherAddress, tokenAddress);
            await grantKyc(tokenCreateContract, tokenAddress, [anotherAddress.address]);
            await fundAccountsWithHtsToken(tokenCreateContract, tokenAddress, [{address: anotherAddress.address, amount: 1000n}]);
            const anotherAddressBalance = await tokenContract.balanceOf(anotherAddress.address);
            expect(anotherAddressBalance).to.be.equal(1000);

            const {token_id: tokenId} = await new MirrorNode().getToken(tokenAddress);
            const bytecode = await getContractByteCode(tokenId);
            const contractBytecode = '0x' + Buffer.from(bytecode).toString('hex');
            // TODO(pectra): Reenable check once MN and Relay include support for EIP-7702
            // const code = await this.provider.getCode(tokenAddress);
            // expect(code).to.be.equal(delegationIndicatorFor(HTS_ADDRESS));
            expect(contractBytecode).to.be.equal(delegationIndicatorFor(HTS_ADDRESS));
        });
    });

    describe('HTS token transfers via delegation', function () {
        it('should transfer HTS tokens when two EOAs delegate to the same Smart Wallet and send self-sponsored transactions', async function () {
            const eoa1 = await this.testCtx.createAndFundEOA();
            const eoa2 = await this.testCtx.createAndFundEOA();
            const receiver = await this.testCtx.createAndFundEOA();

            const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);

            const eoa1Nonce = new Nonce();
            const eoa2Nonce = new Nonce();
            const receiverNonce = new Nonce();

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa: eoa1,
                delegateToAddress: smartWallet.address,
                eoaNonce: eoa1Nonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(eoa1.address, smartWallet.address);

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa: eoa2,
                delegateToAddress: smartWallet.address,
                eoaNonce: eoa2Nonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(eoa2.address, smartWallet.address);

            const tokenCreateContract = await Utils.deployTokenCreateContract();
            const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

            await associateHtsTokenViaDelegation(eoa1, tokenAddress, eoa1Nonce.next());
            await associateHtsTokenViaDelegation(eoa2, tokenAddress, eoa2Nonce.next());
            await associateHtsToken(receiver, tokenAddress, receiverNonce.next());

            await grantKyc(tokenCreateContract, tokenAddress, [eoa1.address, eoa2.address, receiver.address]);
            await fundAccountsWithHtsToken(tokenCreateContract, tokenAddress, [
                {address: eoa1.address, amount: 5_000n},
                {address: eoa2.address, amount: 7_000n},
            ]);

            const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, this.provider);

            const eoa1InitBalance = await tokenContract.balanceOf(eoa1.address);
            assert(eoa1InitBalance === 5_000n, `EOA1 initial balance should be 5000 but got ${eoa1InitBalance}`);

            const eoa2InitBalance = await tokenContract.balanceOf(eoa2.address);
            assert(eoa2InitBalance === 7_000n, `EOA2 initial balance should be 7000 but got ${eoa2InitBalance}`);

            const receipt1 = await transferHtsTokenViaDelegation(eoa1, tokenAddress, receiver.address, 1_500n, eoa1Nonce.next());
            assert(receipt1 !== null, 'EOA1 transfer receipt is null');

            const receipt2 = await transferHtsTokenViaDelegation(eoa2, tokenAddress, receiver.address, 2_300n, eoa2Nonce.next());
            assert(receipt2 !== null, 'EOA2 transfer receipt is null');

            const eoa1FinalBalance = await tokenContract.balanceOf(eoa1.address);
            expect(eoa1FinalBalance).to.be.equal(3_500n, 'EOA1 balance should be 3500 after transfer');

            const eoa2FinalBalance = await tokenContract.balanceOf(eoa2.address);
            expect(eoa2FinalBalance).to.be.equal(4_700n, 'EOA2 balance should be 4700 after transfer');

            const receiverBalance = await tokenContract.balanceOf(receiver.address);
            expect(receiverBalance).to.be.equal(3_800n, 'Receiver balance should be 3800 (1500 + 2300)');

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
            const alice = await this.testCtx.createAndFundEOA();
            const bob = await this.testCtx.createAndFundEOA();
            const carol = await this.testCtx.createAndFundEOA();

            const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
            const aliceNonce = new Nonce();
            const bobNonce = new Nonce();
            const carolNonce = new Nonce();

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa: alice,
                delegateToAddress: smartWallet.address,
                eoaNonce: aliceNonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(alice.address, smartWallet.address);

            const tokenCreateContract = await Utils.deployTokenCreateContract();
            const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

            await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce.next());
            await associateHtsToken(bob, tokenAddress, bobNonce.next());
            await associateHtsToken(carol, tokenAddress, carolNonce.next());

            await grantKyc(tokenCreateContract, tokenAddress, [alice.address, bob.address, carol.address]);
            await fundAccountsWithHtsToken(tokenCreateContract, tokenAddress, [{address: alice.address, amount: 500n}]);

            const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, this.provider);
            const aliceInitTokens = await tokenContract.balanceOf(alice.address);
            assert(aliceInitTokens === 500n, `Alice should have 500 tokens but has ${aliceInitTokens}`);

            const transferToBob = encodeFunctionData('transfer(address to, uint256 value)', [bob.address, 100n]);
            const transferToCarol = encodeFunctionData('transfer(address to, uint256 value)', [carol.address, 150n]);

            const receipt = await executeBatchViaDelegation({
                eoa: alice,
                chainId: this.network.chainId,
                nonce: aliceNonce.next(),
                calls: [{
                target: tokenAddress,
                value: 0n,
                data: transferToBob
            }, {target: tokenAddress, value: 0n, data: transferToCarol},],
            });
            assert(receipt !== null, 'Batch execution receipt is null');

            const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
            expect(aliceFinalTokens).to.be.equal(250n, 'Alice should have 250 tokens remaining (500 - 100 - 150)');

            const bobTokens = await tokenContract.balanceOf(bob.address);
            expect(bobTokens).to.be.equal(100n, 'Bob should have received 100 tokens');

            const carolTokens = await tokenContract.balanceOf(carol.address);
            expect(carolTokens).to.be.equal(150n, 'Carol should have received 150 tokens');

            await validateErcEvent(receipt, [{
                address: tokenAddress,
                from: alice.address,
                to: bob.address,
                amount: 100n
            }, {address: tokenAddress, from: alice.address, to: carol.address, amount: 150n},]);
        });

        it('should batch-transfer 1 HBAR and 100 HTS tokens from a delegated EOA to another EOA via executeBatch', async function () {
            const scenario = await setupBatchHbarAndHtsTransferScenario(this);
            await associateRecipientDirectly(scenario);
            await executeAndAssertBatchHbarAndHtsTransfer(scenario, this.provider);
        });

        it('should batch-transfer 1 HBAR and 100 HTS tokens when recipient associates via delegation', async function () {
            const scenario = await setupBatchHbarAndHtsTransferScenario(this);
            await associateRecipientViaDelegation(scenario);
            await executeAndAssertBatchHbarAndHtsTransfer(scenario, this.provider);
        });
    });

    describe('Delegation to non-existing accounts (gas edge cases)', function () {
        it.skip('should not create account via delegation if insufficient gas to cover account creation', async function () {
            const eoa = await this.testCtx.createAndFundEOA();
            const delegated = ethers.Wallet.createRandom();
            const timeoutMs = 10_000;

            const tx = await sendDelegationCreationTx({
                eoa,
                delegated,
                chainId: this.network.chainId,
            });
            try {
                await tx.wait(1, timeoutMs);
            } catch (err) {
                if (err?.code !== 'TIMEOUT') throw err;
            }
            await assertAccountDoesNotExist(this.provider, delegated.address);
        });

        it.skip('should not create account via delegation when sending value to delegated address if insufficient gas', async function () {
            const eoa = await this.testCtx.createAndFundEOA();
            const delegated = ethers.Wallet.createRandom();
            const value = 10n * ONE_HBAR;
            const timeoutMs = 10_000;

            const tx = await sendDelegationCreationTx({
                eoa,
                delegated,
                chainId: this.network.chainId,
                to: delegated.address,
                value,
            });
            try {
                await tx.wait(1, timeoutMs);
            } catch (err) {
                if (err?.code !== 'TIMEOUT') throw err;
            }
            await assertAccountDoesNotExist(this.provider, delegated.address);
        });

        it('should charge gas for account creation during delegation to non-existing EOA', async function () {
            const eoa = await this.testCtx.createAndFundEOA();
            const delegated = ethers.Wallet.createRandom();

            const tx = await sendDelegationCreationTx({eoa, delegated, chainId: this.network.chainId});
            const receipt = await tx.wait();

            expect(receipt.status).to.equal(1, 'Transaction should succeed');
            expect(Number(receipt.gasUsed), 'Gas should be charged for account creation').to.be.equal(gas.base + gas.codeAuthorization(1));
            await assertAccountExists(this.provider, delegated.address);
        });
    });

    describe('System contract delegation behavior', function () {
        it('should ignore the delegation to system contract and call system contract directly', async function () {
            const eoa = await this.testCtx.createAndFundEOA();
            const nonce = new Nonce();

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa,
                delegateToAddress: HTS_ADDRESS,
                eoaNonce: nonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(eoa.address, HTS_ADDRESS);

            const expirySecond = BigInt(Math.floor(Date.now() / 1000) + 600);
            const scheduleCallData = encodeFunctionData('scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes callData)', [eoa.address, expirySecond, 100_000n, 0n, '0x'],);

            const tx = await eoa.sendTransaction({
                chainId: this.network.chainId,
                nonce: nonce.next(),
                gasLimit: GAS_LIMIT_1_000_000.gasLimit,
                to: eoa.address,
                data: scheduleCallData,
            });

            const receipt = await tx.wait();
            expect(receipt, 'Transaction receipt should be available').to.not.be.null;
            expect(receipt.status).to.equal(1, 'Transaction should be processed');
        });

        it('should ignore the delegation of alice to bob when calling HAS methods', async function () {
            const alice = await this.testCtx.createAndFundEOA();
            const bob = await this.testCtx.createAndFundEOA();
            const spender = (await this.testCtx.createAndFundEOA()).address;
            const aliceNonce = new Nonce();

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa: alice,
                delegateToAddress: bob.address,
                eoaNonce: aliceNonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(alice.address, bob.address);

            const hasIface = new ethers.Interface([
                'function hbarAllowance(address spender) returns (int64 responseCode, int256 allowance)',
            ]);
            const readAllowance = async (address) => {
                const result = await this.provider.call({
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
                chainId: this.network.chainId,
                nonce: aliceNonce.next(),
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
    });

    describe('EOA delegated to HTS system contract (0x167) should no-op', function () {
        let eoa, nonce, tokenCreateContract, tokenAddress, tokenContract, chainId;

        beforeEach(async function () {
            eoa = await this.testCtx.createAndFundEOA();
            nonce = new Nonce();
            chainId = this.network.chainId;

            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa,
                delegateToAddress: HTS_ADDRESS,
                eoaNonce: nonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(eoa.address, HTS_ADDRESS);

            tokenCreateContract = await Utils.deployTokenCreateContract();
            tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);
            tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, this.provider);
        });

        const sendAndCaptureOutcome = async (to, data) => {
            try {
                const tx = await eoa.sendTransaction({
                    chainId,
                    nonce: nonce.next(),
                    gasLimit: GAS_LIMIT_1_000_000.gasLimit,
                    to,
                    data,
                });
                const receipt = await tx.wait();
                return {reverted: receipt.status === 0, receipt};
            } catch (error) {
                return {reverted: true, receipt: null, error};
            }
        };

        it('should no-op a valid system-contract method call (mintToken) with value sent via delegated EOA', async function () {
            const supplyBefore = await tokenContract.totalSupply();

            await (await tokenCreateContract.mintTokenPublic(tokenAddress, 100, [])).wait();
            const supplyAfterDirect = await tokenContract.totalSupply();
            const expectedSupply = supplyBefore + 100n;
            expect(supplyAfterDirect).to.equal(expectedSupply, 'Direct mint should increase supply');

            const mintCalldata = encodeFunctionData(
                'mintToken(address token, int64 amount, bytes[] metadata)',
                [tokenAddress, 50, []],
            );
            const delegatedOutcome = await sendAndCaptureOutcome(eoa.address, mintCalldata);
            expect(delegatedOutcome.reverted, 'Delegated mint calldata should no-op and not revert').to.be.false;
            expect(delegatedOutcome.receipt.status).to.equal(1, 'Transaction should succeed');

            const supplyAfterDelegated = await tokenContract.totalSupply();
            expect(supplyAfterDelegated).to.equal(expectedSupply, 'Supply should be unchanged after delegated mint (no-op)');
        });

        it('should no-op when calling delegated EOA with empty calldata', async function () {
            const directOutcome = await sendAndCaptureOutcome(HTS_ADDRESS, '0x');
            expect(directOutcome.reverted, 'empty calldata via direct HTS call should revert').to.be.true;
            const delegatedOutcome = await sendAndCaptureOutcome(eoa.address, '0x');
            expect(delegatedOutcome.reverted, 'empty calldata via delegation should not revert').to.be.false;
            expect(delegatedOutcome.receipt.status).to.equal(1, 'empty calldata via delegated EOA should no-op and not revert');
        });

        it('should no-op when calling delegated EOA with non-existent method selector', async function () {
            const directOutcome = await sendAndCaptureOutcome(HTS_ADDRESS, '0xdeadbeef');
            expect(directOutcome.reverted, 'non-existent method selector via direct HTS call should not revert').to.be.false;
            expect(directOutcome.receipt.status).to.equal(1, 'non-existent method selector via direct HTS call should succeed');
            const delegatedOutcome = await sendAndCaptureOutcome(eoa.address, '0xdeadbeef');
            expect(delegatedOutcome.reverted, 'non-existent method selector via delegation should not revert').to.be.false;
            expect(delegatedOutcome.receipt.status).to.equal(1, 'non-existent method selector via delegated EOA should succeed');
        });
    });

    describe('HAS proxy precedence', function () {
        it('should deploy HasFacadeSelectors and expose expected HAS selectors', async function () {
            const {contract} = await deploy(HAS_SELECTORS_CONTRACT);
            const hbarAllowanceSelector = contract.interface.getFunction('hbarAllowance(address)').selector;
            const hbarApproveSelector = contract.interface.getFunction('hbarApprove(address,int256)').selector;
            const setUnlimitedAutoAssocSelector = contract.interface.getFunction('setUnlimitedAutomaticAssociations(bool)').selector;

            expect(hbarAllowanceSelector).to.equal('0xbbee989e');
            expect(hbarApproveSelector).to.equal('0x86aff07c');
            expect(setUnlimitedAutoAssocSelector).to.equal('0xf5677e99');
        });

        it('should prioritize HAS proxy over delegated contract methods with the same selectors', async function () {
            const {address: hasSelectorsAddress} = await deploy(HAS_SELECTORS_CONTRACT);
            const eoa = await this.testCtx.createAndFundEOA();
            const eoaNonce = new Nonce();
            await sendDelegation({
                sponsor: await this.testCtx.createAndFundEOA(),
                eoa,
                delegateToAddress: hasSelectorsAddress,
                eoaNonce: eoaNonce.next(),
                chainId: this.network.chainId,
            });
            await verifyDelegation(eoa.address, hasSelectorsAddress);
            const chainId = this.network.chainId;

            const eventIface = new ethers.Interface([
                'event HbarAllowanceCalled(address indexed caller, address indexed spender)',
                'event HbarApproveCalled(address indexed caller, address indexed spender, int256 amount)',
                'event SetUnlimitedAutomaticAssociationsCalled(address indexed caller, bool enabled)',]);

            const spender = (await this.testCtx.createAndFundEOA()).address;
            const sendAndAssertProxiedCall = async (signature, args, blockedEvent) => {
                const tx = await eoa.sendTransaction({
                    chainId,
                    nonce: eoaNonce.next(),
                    gasLimit: GAS_LIMIT_1_000_000.gasLimit,
                    to: eoa.address,
                    data: encodeFunctionData(signature, args),
                });
                const receipt = await tx.wait();
                assert(receipt !== null, `Receipt is null for ${signature}`);
                expect(receipt.status).to.equal(1, `Expected ${signature} call via HAS proxy to succeed`);
                const deniedLog = receipt.logs.find(l => l.topics[0] === eventIface.getEvent(blockedEvent).topicHash);
                expect(deniedLog).to.equal(undefined, `Facade event ${blockedEvent} should not be emitted on proxied path`);
            };

            await sendAndAssertProxiedCall('hbarApprove(address spender, int256 amount)', [spender, 123n], 'HbarApproveCalled',);

            const allowanceResult = await this.provider.call({
                to: eoa.address, data: encodeFunctionData('hbarAllowance(address spender)', [spender]),
            });
            const [responseCode, allowance] =
                new ethers.Interface(['function hbarAllowance(address spender) returns (int64 responseCode, int256 allowance)',])
                    .decodeFunctionResult('hbarAllowance', allowanceResult);
            expect(responseCode).to.equal(22n, 'hbarAllowance should return SUCCESS response code');
            expect(allowance).to.equal(123n, 'hbarAllowance should reflect the amount from hbarApprove');

            await sendAndAssertProxiedCall('setUnlimitedAutomaticAssociations(bool enableAutoAssociations)', [true], 'SetUnlimitedAutomaticAssociationsCalled',);

            const maxAutoAssociations = await Utils.getMaxAutomaticTokenAssociations(eoa.address);
            expect(maxAutoAssociations).to.equal(-1, 'Expected unlimited automatic token associations');
        });
    });

});

async function setupBatchHbarAndHtsTransferScenario(t) {
    const alice = await t.testCtx.createAndFundEOA();
    const bob = await t.testCtx.createAndFundEOA();

    const smartWallet = await deploy(SIMPLE_7702_ACCOUNT);
    const aliceNonce = new Nonce();
    const bobNonce = new Nonce();

    await sendDelegation({
        sponsor: await t.testCtx.createAndFundEOA(),
        eoa: alice,
        delegateToAddress: smartWallet.address,
        eoaNonce: aliceNonce.next(),
        chainId: t.network.chainId,
    });
    await verifyDelegation(alice.address, smartWallet.address);

    const tokenCreateContract = await Utils.deployTokenCreateContract();
    const tokenAddress = await Utils.createFungibleToken(tokenCreateContract, tokenCreateContract.target);

    await associateHtsTokenViaDelegation(alice, tokenAddress, aliceNonce.next());

    return {alice, bob, smartWallet, aliceNonce, bobNonce, tokenCreateContract, tokenAddress, testCtx: t.testCtx, chainId: t.network.chainId};
}

async function associateRecipientDirectly(scenario) {
    await associateHtsToken(scenario.bob, scenario.tokenAddress, scenario.bobNonce.next());
}

async function associateRecipientViaDelegation(scenario) {
    await sendDelegation({
        sponsor: await scenario.testCtx.createAndFundEOA(),
        eoa: scenario.bob,
        delegateToAddress: scenario.smartWallet.address,
        eoaNonce: scenario.bobNonce.next(),
        chainId: scenario.chainId,
    });
    await verifyDelegation(scenario.bob.address, scenario.smartWallet.address);
    await associateHtsTokenViaDelegation(scenario.bob, scenario.tokenAddress, scenario.bobNonce.next());
}

async function executeAndAssertBatchHbarAndHtsTransfer({
                                                           alice,
                                                           bob,
                                                           aliceNonce,
                                                           tokenCreateContract,
                                                           tokenAddress,
                                                           chainId,
                                                       }, provider,) {
    await grantKyc(tokenCreateContract, tokenAddress, [alice.address, bob.address]);
    await fundAccountsWithHtsToken(tokenCreateContract, tokenAddress, [{address: alice.address, amount: 500n}]);

    const tokenContract = new ethers.Contract(tokenAddress, ERC_20_ABI, provider);
    const aliceInitTokens = await tokenContract.balanceOf(alice.address);
    assert(aliceInitTokens === 500n, `Alice should have 500 tokens but has ${aliceInitTokens}`);

    const bobBalanceBefore = await provider.getBalance(bob.address);
    const bobTokensBefore = await tokenContract.balanceOf(bob.address);

    const oneHbarInTinybars = ONE_HBAR / TINYBAR_TO_WEIBAR_COEF;
    const transferCalldata = encodeFunctionData('transfer(address to, uint256 value)', [bob.address, 100n],);

    const receipt = await executeBatchViaDelegation({
        eoa: alice,
        chainId: chainId,
        nonce: aliceNonce.next(),
        calls: [{
        target: bob.address,
        value: oneHbarInTinybars,
        data: '0x'
    }, {target: tokenAddress, value: 0n, data: transferCalldata},],
    });
    assert(receipt !== null, 'Batch execution receipt is null');

    const bobBalanceAfter = await provider.getBalance(bob.address);
    expect(bobBalanceAfter - bobBalanceBefore).to.be.equal(ONE_HBAR, 'Bob should have received 1 HBAR');

    const aliceFinalTokens = await tokenContract.balanceOf(alice.address);
    expect(aliceFinalTokens).to.be.equal(400n, 'Alice should have 400 tokens remaining');

    const bobTokensAfter = await tokenContract.balanceOf(bob.address);
    expect(bobTokensAfter - bobTokensBefore).to.be.equal(100n, 'Bob should have received 100 tokens');

    await validateErcEvent(receipt, [{address: tokenAddress, from: alice.address, to: bob.address, amount: 100n},]);
}
