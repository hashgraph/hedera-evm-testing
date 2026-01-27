// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import "../system-contract-references/IHederaAccountService.sol";
import "../system-contract-references/HederaResponseCodes.sol";

contract HIP1249Contract {

    // this function should not be 'view' or 'pure' because we need transaction to be recorded on chain
    function simulateOpsDurationThrottling(uint iterations) public {
        // cycle 'MOD' operation to spend some opsDuration
        for (uint i = 0; i < iterations; i++) {
            mod(iterations + 1, iterations - 1);
        }
    }

    function mod(uint input1, uint input2) public pure returns (uint) {
        uint res;
        assembly {
            res := mod(input1, input2)
        }
        return res;
    }
}
