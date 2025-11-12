// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import {IHederaAccountService} from "../utils/IHederaAccountService.sol";
import {HederaResponseCodes} from "../utils/HederaResponseCodes.sol";

contract HIP632Contract {

    address internal constant HAS = address(0x16a);

    event AccountAuthorizationResponse(int64 responseCode, bool response);

    function isAuthorizedRawPublic(address account, bytes memory messageHash, bytes memory signature)
    public returns (int64 responseCode, bool authorized) {
        (bool success, bytes memory result) = HAS.call(
            abi.encodeWithSelector(IHederaAccountService.isAuthorizedRaw.selector,
                account, messageHash, signature));
        (responseCode, authorized) = success ? (HederaResponseCodes.SUCCESS, abi.decode(result, (bool))) : (HederaResponseCodes.UNKNOWN, false);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert();
        }
        emit AccountAuthorizationResponse(responseCode, authorized);
    }
}
