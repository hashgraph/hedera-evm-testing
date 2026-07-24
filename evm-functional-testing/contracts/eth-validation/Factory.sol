// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.10;

contract SimpleChild {
    uint256 public seed;

    constructor(uint256 _seed) {
        seed = _seed;
    }
}

contract DestructibleChild {
    uint256 public seed;

    constructor(uint256 _seed) {
        seed = _seed;
    }

    function destroy(address payable recipient) external {
        selfdestruct(recipient);
    }
}

contract EthValidationFactory {
    event Deployed(address addr);

    function deployCreate(uint256 seed) external returns (address addr) {
        addr = address(new SimpleChild(seed));
        emit Deployed(addr);
    }

    function deployCreate2(uint256 seed, bytes32 salt) external returns (address addr) {
        addr = address(new SimpleChild{salt: salt}(seed));
        emit Deployed(addr);
    }

    /// Computes the EIP-1014 address: keccak256(0xff ++ this ++ salt ++ keccak256(initCode))[12:]
    function predictCreate2(uint256 seed, bytes32 salt) external view returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(SimpleChild).creationCode,
            abi.encode(seed)
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(initCode))
                    )
                )
            )
        );
    }

    /// Raw CREATE2; returns address(0) on failure instead of reverting.
    function deployCreate2Raw(bytes memory initCode, bytes32 salt) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        emit Deployed(addr);
    }

    /// Raw CREATE; returns address(0) on failure instead of reverting.
    function deployCreateRaw(bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create(0, add(initCode, 0x20), mload(initCode))
        }
        emit Deployed(addr);
    }

    function deployCreate2Destructible(uint256 seed, bytes32 salt) external returns (address addr) {
        addr = address(new DestructibleChild{salt: salt}(seed));
        emit Deployed(addr);
    }

    /// CREATE2-deploys and SELFDESTRUCTs the child in the same transaction, which
    /// removes the account entirely under EIP-6780 (Cancun) and frees its address.
    function deployCreate2AndDestroy(uint256 seed, bytes32 salt) external returns (address addr) {
        DestructibleChild child = new DestructibleChild{salt: salt}(seed);
        child.destroy(payable(msg.sender));
        addr = address(child);
        emit Deployed(addr);
    }
}
