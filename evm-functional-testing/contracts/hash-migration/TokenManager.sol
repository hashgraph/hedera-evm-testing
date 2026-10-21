// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "@hiero-ledger/hiero-contracts/token-service/HederaTokenService.sol";
import "@hiero-ledger/hiero-contracts/token-service/KeyHelper.sol";
import "@hiero-ledger/hiero-contracts/token-service/ExpiryHelper.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// The ERC721 metadata functions every HTS NFT answers at its own address (not in OpenZeppelin's IERC721).
interface INftMetadataFacade {
    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function totalSupply() external view returns (uint256);

    function tokenURI(uint256 serial) external view returns (string memory);
}

/// Creates HTS tokens through the system contract (0x167) and holds all their keys, so it can also
/// grant KYC, freeze and pay out from the treasury (itself).
contract TokenManager is HederaTokenService, KeyHelper, ExpiryHelper {
    int32 constant DECIMALS = 2;
    int64 constant NFT_MAX_SUPPLY = 100;
    int64 constant AUTO_RENEW_PERIOD = 8_000_000;

    event TokenCreated(address token);
    event NftsMinted(int64[] serials);

    function createFungibleToken(
        int64 initialSupply,
        int64 feeTinybars
    ) external payable returns (address token) {
        (int256 responseCode, address created) = HederaTokenService
            .createFungibleTokenWithCustomFees(
                tokenProperties("Hash Migration Token", "HMT", initialSupply),
                initialSupply,
                DECIMALS,
                hbarFee(feeTinybars),
                new IHederaTokenService.FractionalFee[](0)
            );
        require(responseCode == HederaResponseCodes.SUCCESS, "create failed");

        emit TokenCreated(created);
        return created;
    }

    /// NFT with a fixed HBAR fee on every transfer, collected by this contract.
    function createNft(
        int64 feeTinybars
    ) external payable returns (address token) {
        (int256 responseCode, address created) = HederaTokenService
            .createNonFungibleTokenWithCustomFees(
                tokenProperties("Hash Migration NFT", "HMN", NFT_MAX_SUPPLY),
                hbarFee(feeTinybars),
                new IHederaTokenService.RoyaltyFee[](0)
            );
        require(responseCode == HederaResponseCodes.SUCCESS, "create failed");

        emit TokenCreated(created);
        return created;
    }

    /// Mints one serial per metadata entry into the treasury (this contract).
    function mintNfts(
        address token,
        bytes[] calldata metadata
    ) external returns (int64[] memory serials) {
        int256 responseCode;
        (responseCode, , serials) = HederaTokenService.mintToken(
            token,
            0,
            metadata
        );
        require(responseCode == HederaResponseCodes.SUCCESS, "mint failed");

        emit NftsMinted(serials);
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

    /// Sends an NFT serial from the treasury (this contract), which pays no custom fee.
    function payOutNft(address token, address receiver, int64 serial) external {
        int256 responseCode = HederaTokenService.transferNFT(
            token,
            address(this),
            receiver,
            serial
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
            balances[i] = IERC20(token).balanceOf(accounts[i]);
            allowances[i] = IERC20(token).allowance(
                accounts[i],
                spender
            );
            (, frozen[i]) = HederaTokenService.isFrozen(token, accounts[i]);
            (, kyc[i]) = HederaTokenService.isKyc(token, accounts[i]);
        }
    }

    /// Owner and single-serial approval of each NFT serial.
    function serialStates(
        address token,
        uint256[] calldata serials
    )
        external
        view
        returns (address[] memory owners, address[] memory approved)
    {
        owners = new address[](serials.length);
        approved = new address[](serials.length);

        for (uint256 i = 0; i < serials.length; i++) {
            owners[i] = IERC721(token).ownerOf(serials[i]);
            approved[i] = IERC721(token).getApproved(serials[i]);
        }
    }

    /// NFT balance, approve-for-all to `operator`, freeze and KYC flag of each account. Not a view:
    /// the HTS flag queries are calls to the system contract.
    function nftAccountStates(
        address token,
        address[] calldata accounts,
        address operator
    )
        external
        returns (
            uint256[] memory balances,
            bool[] memory approvedForAll,
            bool[] memory frozen,
            bool[] memory kyc
        )
    {
        balances = new uint256[](accounts.length);
        approvedForAll = new bool[](accounts.length);
        frozen = new bool[](accounts.length);
        kyc = new bool[](accounts.length);

        for (uint256 i = 0; i < accounts.length; i++) {
            balances[i] = IERC721(token).balanceOf(accounts[i]);
            approvedForAll[i] = IERC721(token).isApprovedForAll(
                accounts[i],
                operator
            );
            (, frozen[i]) = HederaTokenService.isFrozen(token, accounts[i]);
            (, kyc[i]) = HederaTokenService.isKyc(token, accounts[i]);
        }
    }

    /// A fixed HBAR fee on every transfer, collected by this contract.
    function hbarFee(
        int64 feeTinybars
    ) internal view returns (IHederaTokenService.FixedFee[] memory fees) {
        fees = new IHederaTokenService.FixedFee[](1);
        fees[0] = IHederaTokenService.FixedFee(
            feeTinybars,
            address(0),
            true,
            false,
            address(this)
        );
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
