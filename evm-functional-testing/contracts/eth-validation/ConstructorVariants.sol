// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

contract ContractWithArgs {
    uint256 public number;
    string public text;

    constructor(uint256 _number, string memory _text) {
        number = _number;
        text = _text;
    }
}

contract PayableCtor {
    uint256 public initialBalance;
    address public deployer;

    constructor() payable {
        initialBalance = msg.value;
        deployer = msg.sender;
    }
}

contract RevertingCtor {
    constructor(bool shouldRevert) {
        require(!shouldRevert, "RevertingCtor: constructor reverted");
    }

    function ping() external pure returns (bool) {
        return true;
    }
}

contract EmptyContract {}
