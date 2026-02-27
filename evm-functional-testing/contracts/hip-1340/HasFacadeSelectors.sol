// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @notice Mock/facade contract with HAS-compatible proxy method selectors.
contract HasFacadeSelectors {
    // Expected selectors:
    // hbarAllowance(address)                         -> 0xbbee989e
    // hbarApprove(address,int256)                    -> 0x86aff07c
    // setUnlimitedAutomaticAssociations(bool)        -> 0xf5677e99

    event TestHbarAllowanceCalled(address indexed caller, address indexed spender);
    event TestHbarApproveCalled(address indexed caller, address indexed spender, int256 amount);
    event TestSetUnlimitedAutomaticAssociationsCalled(address indexed caller, bool enabled);
    event TestSelectorsCalled(address indexed caller);

    function hbarAllowance(address spender) external returns (int64 responseCode, int256 allowance) {
        emit TestHbarAllowanceCalled(msg.sender, spender);
        return (0, 0);
    }

    function hbarApprove(address spender, int256 amount) external returns (int64 responseCode) {
        emit TestHbarApproveCalled(msg.sender, spender, amount);
        return 0;
    }

    function setUnlimitedAutomaticAssociations(bool enableAutoAssociations)
        external
        returns (int64 responseCode)
    {
        emit TestSetUnlimitedAutomaticAssociationsCalled(msg.sender, enableAutoAssociations);
        return 0;
    }

    function selectors() external returns (bytes4, bytes4, bytes4) {
        emit TestSelectorsCalled(msg.sender);
        return (
            bytes4(keccak256("hbarAllowance(address)")),
            bytes4(keccak256("hbarApprove(address,int256)")),
            bytes4(keccak256("setUnlimitedAutomaticAssociations(bool)"))
        );
    }
}
