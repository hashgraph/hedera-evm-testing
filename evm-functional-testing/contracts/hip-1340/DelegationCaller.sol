// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title DelegationCaller
 * @notice Contract that calls a delegated EOA in its constructor.
 *         Used for testing ContractCreate scenarios with delegation.
 */
contract DelegationCaller {
    address public delegatedEOA;
    bool public callSucceeded;
    
    constructor(address _delegatedEOA) {
        delegatedEOA = _delegatedEOA;
        
        // Call the delegated EOA's execute function
        // This tests that delegation works when called from a contract constructor
        (bool success,) = _delegatedEOA.call(
            abi.encodeWithSignature(
                "execute(address,uint256,bytes)",
                address(0),
                0,
                ""
            )
        );
        
        callSucceeded = success;
        require(success, "Delegation call failed in constructor");
    }
}
