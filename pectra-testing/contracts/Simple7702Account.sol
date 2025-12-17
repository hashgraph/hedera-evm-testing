// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

import { Exec } from "./lib/Exec.sol";

contract Simple7702Account {

    /**
     * execute a single call from the account.
     */
    function execute(address target, uint256 value, bytes calldata data) virtual external {
        bool ok = Exec.call(target, value, data, gasleft());
        if (!ok) {
            Exec.revertWithReturnData();
        }
    }

    fallback() external payable {
        revert("Fallback reached");
    }

    receive() external payable {
        revert("Plain transfers not supported");
    }
}