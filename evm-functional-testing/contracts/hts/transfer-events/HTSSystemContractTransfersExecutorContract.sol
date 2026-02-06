// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../../system-contract-references/HederaResponseCodes.sol";
import "../../system-contract-references/IHederaTokenService.sol";
import "../../utility-contracts/TokenCreateContract.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract HTSSystemContractTransfersExecutorContract {

    address constant HTS = address(0x167);

    constructor() payable {}
    receive() external payable {}

    event ResponseCode(int64 responseCode);

    event CreatedToken(address tokenAddress);

    event MintedToken(int64 newTotalSupply, int64[] serialNumbers);

    event RevertReason(bytes message);

    // ----------------------------- Tokens -----------------------------
    function createFungibleTokenWithoutKYCPublic(address tokenContract) public payable returns (address tokenAddress) {
        tokenAddress = TokenCreateContract(tokenContract).createFungibleTokenWithoutKYCPublic{value: msg.value}(address(tokenContract));
        IHederaTokenService(HTS).associateToken(address(this), tokenAddress);
        TokenCreateContract(tokenContract).transferTokenPublic(tokenAddress, address(this), 1000);
        emit CreatedToken(tokenAddress);
        return tokenAddress;
    }

    function createNonFungibleTokenWithoutKYCPublic(address tokenContract) public payable returns (address tokenAddress) {
        tokenAddress = TokenCreateContract(tokenContract).createNonFungibleTokenWithoutKYCPublic{value: msg.value}(address(tokenContract));
        IHederaTokenService(HTS).associateToken(address(this), tokenAddress);
        emit CreatedToken(tokenAddress);
        return tokenAddress;
    }

    function mintTokenPublic(address tokenContract, address token, int64 amount, bytes[] memory metadata)
    public returns (int responseCode, int64 newTotalSupply, int64[] memory serialNumbers) {
        (responseCode, newTotalSupply, serialNumbers)
            = TokenCreateContract(tokenContract).mintTokenToAddressPublic(token, amount, metadata, address(this));
        emit MintedToken(newTotalSupply, serialNumbers);
    }

    function approve(address token, uint256 amount) public returns (int64 responseCode) {
        responseCode = IHederaTokenService(HTS).approve(token, address(this), amount);
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function approveNFT(address token, uint256 serialNumber) public returns (int64 responseCode) {
        responseCode = IHederaTokenService(HTS).approveNFT(token, address(this), serialNumber);
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- FT transfers -----------------------------
    function transferToken(address htsAddress, address token, address sender, address receiver, int64 amount) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferToken.selector,
                token, sender, receiver, amount));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFrom(address htsAddress, address token, address from, address to, uint256 amount) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferFrom.selector,
                token, from, to, amount));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFtProxy(address token, address recipient, uint256 amount) public returns (bool response) {
        try IERC20(token).transfer(recipient, amount) returns (bool result) {
            response = result;
            if (response) {
                // fake responseCode 22 for use the same validation in tests
                emit ResponseCode(22);
            }
        } catch (bytes memory reason) {
            emit ResponseCode(21);
            emit RevertReason(reason);
        }
        return response;
    }

    function transferFromFtProxy(address token, address sender, address recipient, uint256 amount) public returns (bool response) {
        try IERC20(token).transferFrom(sender, recipient, amount) returns (bool result) {
            response = result;
            if (response) {
                // fake responseCode 22 for use the same validation in tests
                emit ResponseCode(22);
            }
        } catch (bytes memory reason) {
            emit ResponseCode(21);
            emit RevertReason(reason);
        }
        return response;
    }

    // ----------------------------- NFT transfers -----------------------------
    function transferNFT(address htsAddress, address token, address sender, address receiver, int64 serialNumber) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferNFT.selector,
                token, sender, receiver, serialNumber));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFromNFT(address htsAddress, address token, address from, address to, uint256 serialNumber) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferFromNFT.selector,
                token, from, to, serialNumber));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFromNftProxy(address token, address sender, address recipient, uint256 serialNumber) public {
        try IERC721(token).transferFrom(sender, recipient, serialNumber) {
            // fake responseCode 22 for use the same validation in tests
            emit ResponseCode(22);
        } catch (bytes memory reason) {
            emit ResponseCode(21);
            emit RevertReason(reason);
        }
    }

    // ----------------------------- bucket FT transfers -----------------------------
    function transferTokens(address htsAddress, address token, address[] memory accountIds, int64[] memory amounts) external returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferTokens.selector,
                token, accountIds, amounts));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- bucket NFT transfers -----------------------------
    function transferNFTs(address htsAddress, address token, address[] memory senders, address[] memory receivers, int64[] memory serialNumbers) external returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferNFTs.selector,
                token, senders, receivers, serialNumbers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- bucket transfers -----------------------------
    struct TokenTransferListV1 {
        // The ID of the token as a solidity address
        address token;

        // Applicable to tokens of type FUNGIBLE_COMMON. Multiple list of AccountAmounts, each of which
        // has an account and amount.
        AccountAmountV1[] transfers;

        // Applicable to tokens of type NON_FUNGIBLE_UNIQUE. Multiple list of NftTransfers, each of
        // which has a sender and receiver account, including the serial number of the NFT
        NftTransferV1[] nftTransfers;
    }

    struct AccountAmountV1 {
        // The Account ID, as a solidity address, that sends/receives cryptocurrency or tokens
        address accountID;

        // The amount of  the lowest denomination of the given token that
        // the account sends(negative) or receives(positive)
        int64 amount;
    }

    struct NftTransferV1 {
        // The solidity address of the sender
        address senderAccountID;

        // The solidity address of the receiver
        address receiverAccountID;

        // The serial number of the NFT
        int64 serialNumber;
    }

    function cryptoTransferV1(address htsAddress, TokenTransferListV1[] calldata tokenTransfers) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSignature("cryptoTransfer((address,(address,int64)[],(address,address,int64)[])[])", tokenTransfers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function cryptoTransferV2(address htsAddress, IHederaTokenService.TransferList calldata transferList, IHederaTokenService.TokenTransferList[] calldata tokenTransfers) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.cryptoTransfer.selector, transferList, tokenTransfers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- Airdrop -----------------------------
    function airdropTokens(address htsAddress, IHederaTokenService.TokenTransferList[] calldata tokenTransfers) public payable returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.airdropTokens.selector, tokenTransfers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }
}   