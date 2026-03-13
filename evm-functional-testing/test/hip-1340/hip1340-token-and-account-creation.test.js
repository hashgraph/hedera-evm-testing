const assert = require('node:assert').strict;

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { Hip1340TestContext } = require('./utils/test-context');

const web3 = require('./utils/web3');
const { gas, delegationIndicatorFor, deploy, encodeFunctionData } = require('./utils/web3');

describe('HIP-1340 - EIP-7702 Ethereum Specific tests - token and account creation behavior', function () {
    before(async function () {
        this.provider = ethers.provider;
        this.network = await this.provider.getNetwork();
    });

    beforeEach(async function () {
        this.testCtx = new Hip1340TestContext(this.provider);
        await this.testCtx.init();
    });

    it('should transfer ERC20 tokens when EOAs send transactions to themselves', async function () {
        const erc20 = await deploy('contracts/hip-1340/ERC20Mintable', ['Test', 'TST', 10_000_000n]);
        await erc20.contract.mint(50_000n).then(tx => tx.wait());
        await new Promise(resolve => setTimeout(resolve, 4000));

        const minterBalance = await erc20.contract.balanceOf(erc20.deployer.address);
        assert(minterBalance === 50_000n + 10_000_000n, `Minter balance should be \`initialSupply+mint amount\` but got ${minterBalance}`);

        const smartWallet = await deploy('contracts/hip-1340/CustomSimple7702Account');
        const eoa1 = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), smartWallet.address);
        const eoa2 = await this.testCtx.authorizeEOADelegation(await this.testCtx.createAndFundEOA(), smartWallet.address);

        await erc20.contract.transfer(eoa1.address, 5_000n).then(tx => tx.wait());
        const eoa1Balance = await erc20.contract.balanceOf(eoa1.address);
        assert(eoa1Balance === 5_000n, `EOA1 balance should be 5_000 but got ${eoa1Balance}`);

        await erc20.contract.transfer(eoa2.address, 7_000n).then(tx => tx.wait());
        const eoa2Balance = await erc20.contract.balanceOf(eoa2.address);
        assert(eoa2Balance === 7_000n, `EOA2 balance should be 7_000 but got ${eoa2Balance}`);

        const receiver = ethers.Wallet.createRandom().address;
        const eoa1Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 1_500n]);
        await eoa1.sendTransaction({
            chainId: this.network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa1.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa1Call]),
        }).then(tx => tx.wait());

        const eoa2Call = encodeFunctionData('transfer(address to, uint256 value)', [receiver, 2_300n]);
        await eoa2.sendTransaction({
            chainId: this.network.chainId,
            nonce: 1,
            gasLimit: 1_500_000,
            to: eoa2.address,
            data: encodeFunctionData('execute(address target, uint256 value, bytes calldata data)', [erc20.address, 0, eoa2Call]),
        }).then(tx => tx.wait());

        expect(await erc20.contract.balanceOf(eoa1.address)).to.be.equal(3_500n);
        expect(await erc20.contract.balanceOf(eoa2.address)).to.be.equal(4_700n);
        expect(await erc20.contract.balanceOf(receiver)).to.be.equal(3_800n);
    });

    const tests = [
        { receiverSameAsDelegated: false },
        { receiverSameAsDelegated: true },
    ];

    describe('account sponsorship behavior', function () {
        tests.forEach(({ receiverSameAsDelegated }) => {
            it(`should create the account when an EOA sponsors it (receiverSameAsDelegated=${receiverSameAsDelegated})`, async function () {
            const delegateAddress = '0xad3954AB34dE15BC33dA98170e68F0EEac294dFc'.toLowerCase();
            const value = 10n * 1_00000_00000n;
            const sender = await this.testCtx.createAndFundEOA();
            const delegated = ethers.Wallet.createRandom();
            const [to, initialValue] = !receiverSameAsDelegated
                ? [await this.testCtx.createAndFundEOA(), 10_000_000_000n * 1000_0000_0000n]
                : [delegated, 0n];

            await sender.sendTransaction({
                chainId: this.network.chainId,
                nonce: 0,
                gasLimit: gas.base + gas.codeAuthorization(1) + gas.accountCreationCost(),
                value,
                to,
                authorizationList: [await delegated.authorize({
                    chainId: 0,
                    nonce: 0,
                    address: delegateAddress,
                })],
            }).then(tx => tx.wait());

            expect(await this.provider.getBalance(to.address)).to.be.equal(initialValue + value);

            for (const [wallet, walletNonce, walletName] of [
                [sender, 1, 'sender'],
                [delegated, 1, 'delegated'],
            ]) {
                const [_nonce, _eth_nonce, ethNonce] = await web3.getNonces(wallet.address);
                expect(ethNonce).to.be.equal(walletNonce, `Nonce for '${walletName}' should be ${walletNonce} but got ${ethNonce}`);
            }

            const [_code, contractBytecode, delegationAddress] = await web3.getCodes(delegated.address);
            expect(contractBytecode).to.be.equal(delegationIndicatorFor(delegateAddress));
            expect(delegationAddress).to.be.equal(delegateAddress);
            });
        });
    });
});
