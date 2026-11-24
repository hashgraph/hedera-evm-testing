// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

/// Contract created by LifecycleFactory, with CREATE or CREATE2.
contract Child {
    uint256 public id;

    constructor(uint256 _id) {
        id = _id;
    }

    function destroy(address payable recipient) external {
        selfdestruct(recipient);
    }

    receive() external payable {}
}

/// Creates children with CREATE and CREATE2, calls them, and reads code hashes from inside the EVM.
contract LifecycleFactory {
    event ChildCreated(address child, uint256 id);

    function create(uint256 id) external returns (address child) {
        child = address(new Child(id));
        emit ChildCreated(child, id);
    }

    function create2(uint256 id, bytes32 salt) external returns (address child) {
        child = address(new Child{salt: salt}(id));
        emit ChildCreated(child, id);
    }

    /// CREATE2 address: keccak256(0xff ++ this ++ salt ++ keccak256(initCode))[12:]
    function predict(uint256 id, bytes32 salt) external view returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(type(Child).creationCode, abi.encode(id)));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash));

        return address(uint160(uint256(hash)));
    }

    /// Calls another contract's id(), so old and new contracts can call each other.
    function idOf(Child child) external view returns (uint256) {
        return child.id();
    }

    /// EXTCODEHASH of each account.
    function codeHashes(address[] calldata accounts) external view returns (bytes32[] memory hashes) {
        hashes = new bytes32[](accounts.length);

        for (uint256 i = 0; i < accounts.length; i++) {
            hashes[i] = accounts[i].codehash;
        }
    }
}
