// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import "../../system-contract-references/IHederaTokenService.sol";
import "../../system-contract-references/HederaResponseCodes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract AirDropClaimContract {

    address internal constant HTS = address(0x167);

    constructor() payable {}
    receive() external payable {}

    event ResponseCode(int64 responseCode);

    function associateToken(address token) external returns (int64 responseCode) {
        (bool success, bytes memory result) = HTS.call(
            abi.encodeWithSelector(IHederaTokenService.associateToken.selector,
                address(this), token));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }

    function claimAirdrops(address htsAddress, IHederaTokenService.PendingAirdrop[] memory pendingAirdrops) public returns (int64 responseCode) {
        (bool success, bytes memory result) = htsAddress.call(
            abi.encodeWithSelector(IHederaTokenService.claimAirdrops.selector, pendingAirdrops));
        responseCode = success ? abi.decode(result, (int64)) : HederaResponseCodes.UNKNOWN;
        emit ResponseCode(responseCode);
        return responseCode;
    }
}   