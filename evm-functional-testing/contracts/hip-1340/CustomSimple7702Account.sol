// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/accounts/Simple7702Account.sol";

/**
 * The sole purpose of this contract is to `import` contracts that are used
 * directly in tests as artifacts.
 */
contract CustomSimple7702Account is Simple7702Account {
    function _requireForExecute() internal view virtual override { }
}