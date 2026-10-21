// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "@hiero-ledger/hiero-contracts/token-service/HederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/KeyHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/ExpiryHelper.sol";

/// The ERC20 view functions every HTS fungible token answers at its own address.
interface IFungibleTokenFacade {
    function balanceOf(address account) external view returns (uint256);

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);
}

/// Creates HTS tokens through the system contract (0x167) and holds all their keys, so it can also
/// grant KYC, freeze and pay out from the treasury (itself).
contract TokenManager is HederaTokenService, KeyHelper, ExpiryHelper {
    int32 constant DECIMALS = 2;
    int64 constant AUTO_RENEW_PERIOD = 8_000_000;

    event TokenCreated(address token);

    function createFungibleToken(
        int64 initialSupply,
        int64 feeTinybars
    ) external payable returns (address token) {
        IHederaTokenService.FixedFee[]
            memory fixedFees = new IHederaTokenService.FixedFee[](1);
        fixedFees[0] = IHederaTokenService.FixedFee(
            feeTinybars,
            address(0),
            true,
            false,
            address(this)
        );

        (int256 responseCode, address created) = HederaTokenService
            .createFungibleTokenWithCustomFees(
                tokenProperties("Hash Migration Token", "HMT", initialSupply),
                initialSupply,
                DECIMALS,
                fixedFees,
                new IHederaTokenService.FractionalFee[](0)
            );
        require(responseCode == HederaResponseCodes.SUCCESS, "create failed");

        emit TokenCreated(created);
        return created;
    }

    function grantKyc(address token, address account) external {
        int256 responseCode = HederaTokenService.grantTokenKyc(token, account);
        require(
            responseCode == HederaResponseCodes.SUCCESS,
            "grant KYC failed"
        );
    }

    function freeze(address token, address account) external {
        int256 responseCode = HederaTokenService.freezeToken(token, account);
        require(responseCode == HederaResponseCodes.SUCCESS, "freeze failed");
    }

    /// Sends tokens from the treasury (this contract). The treasury pays no custom fee.
    function payOut(address token, address receiver, int64 amount) external {
        int256 responseCode = HederaTokenService.transferToken(
            token,
            address(this),
            receiver,
            amount
        );
        require(responseCode == HederaResponseCodes.SUCCESS, "pay out failed");
    }

    /// Balance, allowance to `spender`, freeze and KYC flag of each account. Not a view: the HTS
    /// flag queries are calls to the system contract.
    function accountStates(
        address token,
        address[] calldata accounts,
        address spender
    )
        external
        returns (
            uint256[] memory balances,
            uint256[] memory allowances,
            bool[] memory frozen,
            bool[] memory kyc
        )
    {
        balances = new uint256[](accounts.length);
        allowances = new uint256[](accounts.length);
        frozen = new bool[](accounts.length);
        kyc = new bool[](accounts.length);

        for (uint256 i = 0; i < accounts.length; i++) {
            balances[i] = IFungibleTokenFacade(token).balanceOf(accounts[i]);
            allowances[i] = IFungibleTokenFacade(token).allowance(
                accounts[i],
                spender
            );
            (, frozen[i]) = HederaTokenService.isFrozen(token, accounts[i]);
            (, kyc[i]) = HederaTokenService.isKyc(token, accounts[i]);
        }
    }

    function tokenProperties(
        string memory name,
        string memory symbol,
        int64 maxSupply
    ) internal view returns (IHederaTokenService.HederaToken memory) {
        IHederaTokenService.TokenKey[]
            memory keys = new IHederaTokenService.TokenKey[](5);
        keys[0] = getSingleKey(
            KeyType.ADMIN,
            KeyValueType.INHERIT_ACCOUNT_KEY,
            bytes("")
        );
        keys[1] = getSingleKey(
            KeyType.KYC,
            KeyValueType.INHERIT_ACCOUNT_KEY,
            bytes("")
        );
        keys[2] = getSingleKey(
            KeyType.FREEZE,
            KeyValueType.INHERIT_ACCOUNT_KEY,
            bytes("")
        );
        keys[3] = getSingleKey(
            KeyType.SUPPLY,
            KeyValueType.INHERIT_ACCOUNT_KEY,
            bytes("")
        );
        keys[4] = getSingleKey(
            KeyType.FEE,
            KeyValueType.INHERIT_ACCOUNT_KEY,
            bytes("")
        );

        IHederaTokenService.Expiry memory expiry = IHederaTokenService.Expiry(
            0,
            address(this),
            AUTO_RENEW_PERIOD
        );

        return
            IHederaTokenService.HederaToken(
                name,
                symbol,
                address(this),
                "hash migration",
                true,
                maxSupply,
                false,
                keys,
                expiry
            );
    }
}
