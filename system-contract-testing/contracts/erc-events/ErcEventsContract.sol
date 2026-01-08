// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../system-contract-references/IHederaTokenService.sol";
import "../system-contract-references/HederaResponseCodes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ErcEventsContract {

    address public precompileAddress;

    receive() external payable {}

    event ResponseCode(int64 responseCode);

    constructor(address htsAddress) {
        precompileAddress = htsAddress;
    }

    // ----------------------------- Utils -----------------------------
    function associateAndTransfer(address token, address sender, address receiver, uint256 amount) external payable returns (int64 responseCode) {
        // associateToken
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.associateToken.selector,
                receiver, token));
        require(success);
        // transferToken
        (success, result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferToken.selector,
                token, sender, receiver, amount));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- FT transfers -----------------------------
    function transferToken(address token, address sender, address receiver, int64 amount) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferToken.selector,
                token, sender, receiver, amount));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFrom(address token, address from, address to, uint256 amount) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferFrom.selector,
                token, from, to, amount));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFtProxy(address token, address recipient, uint256 amount) public {
        IERC20(token).transfer(recipient, amount);
    }

    function transferFromFtProxy(address token, address sender, address recipient, uint256 amount) public {
        IERC20(token).transferFrom(sender, recipient, amount);
    }

    // ----------------------------- NFT transfers -----------------------------
    function transferNFT(address token, address sender, address receiver, int64 serialNumber) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferNFT.selector,
                token, sender, receiver, serialNumber));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFromNFT(address token, address from, address to, uint256 serialNumber) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferFromNFT.selector,
                token, from, to, serialNumber));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function transferFromNftProxy(address token, address sender, address recipient, uint256 amount) public {
        IERC721(token).transferFrom(sender, recipient, amount);
    }

    // ----------------------------- bucket FT transfers -----------------------------
    function transferTokens(address token, address[] memory accountIds, int64[] memory amounts) external returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferTokens.selector,
                token, accountIds, amounts));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- bucket NFT transfers -----------------------------
    function transferNFTs(address token, address[] memory sender, address[] memory receiver, int64[] memory serialNumber) external returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.transferNFTs.selector,
                token, sender, receiver, serialNumber));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- bucket transfers -----------------------------
    function cryptoTransferV1(IHederaTokenService.TokenTransferList[] calldata tokenTransfers) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSignature("cryptoTransfer((address,(address,int64)[],(address,address,int64)[])[])", tokenTransfers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function cryptoTransferV2(IHederaTokenService.TransferList calldata transferList, IHederaTokenService.TokenTransferList[] calldata tokenTransfers) public returns (int64 responseCode) {
        (bool success, bytes memory result) = precompileAddress.call(
            abi.encodeWithSelector(IHederaTokenService.cryptoTransfer.selector, transferList, tokenTransfers));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    // ----------------------------- Airdrop -----------------------------
    //TODO
}   