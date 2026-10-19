// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SlotReader} from "./SlotReader.sol";

/**
 * Collection storage fixture for the SHA-384 -> SHA-256 migration test: mappings and arrays,
 * whose entries live at computed slots, written before the consensus node upgrade and compared after it.
 */
contract CollectionStorage is SlotReader {
    // a and b share one slot, c takes the next
    struct Item {
        uint128 a;
        uint128 b;
        address c;
    }

    // Arrays
    uint256[3] public staticArray;
    uint256[] public dynamicArray;
    uint256[][] public array2d;
    Item[] public structArray;
    uint256[] public poppedArray;
    uint256[] public deletedArray;

    // Mappings
    mapping(uint256 => uint256) public simpleMapping;
    mapping(address => mapping(uint256 => uint256)) public nestedMapping;
    mapping(uint256 => Item) public structMapping;
    mapping(uint256 => uint256[]) public arrayMapping;

    function setStaticArray(uint256[3] calldata values) external {
        staticArray = values;
    }

    function setDynamicArray(uint256[] calldata values) external {
        dynamicArray = values;
    }

    function setArray2d(uint256[][] calldata values) external {
        delete array2d;
        for (uint256 i = 0; i < values.length; i++) {
            array2d.push(values[i]);
        }
    }

    function setStructArray(Item[] calldata items) external {
        delete structArray;
        for (uint256 i = 0; i < items.length; i++) {
            structArray.push(items[i]);
        }
    }

    function setPoppedArray(uint256[] calldata values) external {
        poppedArray = values;
    }

    function popPoppedArray() external {
        poppedArray.pop();
    }

    function setDeletedArray(uint256[] calldata values) external {
        deletedArray = values;
    }

    function deleteDeletedArray() external {
        delete deletedArray;
    }

    function setSimpleMapping(uint256[] calldata keys, uint256[] calldata values) external {
        for (uint256 i = 0; i < keys.length; i++) {
            simpleMapping[keys[i]] = values[i];
        }
    }

    function setNestedMapping(
        address[] calldata outerKeys,
        uint256[] calldata innerKeys,
        uint256[] calldata values
    ) external {
        for (uint256 i = 0; i < outerKeys.length; i++) {
            nestedMapping[outerKeys[i]][innerKeys[i]] = values[i];
        }
    }

    function setStructMapping(uint256[] calldata keys, Item[] calldata items) external {
        for (uint256 i = 0; i < keys.length; i++) {
            structMapping[keys[i]] = items[i];
        }
    }

    function setArrayMapping(uint256[] calldata keys, uint256[][] calldata values) external {
        for (uint256 i = 0; i < keys.length; i++) {
            arrayMapping[keys[i]] = values[i];
        }
    }

    // Public array getters return one element; lengths need their own getters
    function dynamicArrayLength() external view returns (uint256) {
        return dynamicArray.length;
    }

    function array2dLength() external view returns (uint256) {
        return array2d.length;
    }

    function array2dInnerLength(uint256 i) external view returns (uint256) {
        return array2d[i].length;
    }

    function structArrayLength() external view returns (uint256) {
        return structArray.length;
    }

    function poppedArrayLength() external view returns (uint256) {
        return poppedArray.length;
    }

    function deletedArrayLength() external view returns (uint256) {
        return deletedArray.length;
    }

    function arrayMappingLength(uint256 key) external view returns (uint256) {
        return arrayMapping[key].length;
    }

    /// Base slot of each collection; the test computes the entries' slots from these.
    function layout()
        external
        pure
        returns (
            uint256 staticArraySlot,
            uint256 dynamicArraySlot,
            uint256 array2dSlot,
            uint256 structArraySlot,
            uint256 poppedArraySlot,
            uint256 deletedArraySlot,
            uint256 simpleMappingSlot,
            uint256 nestedMappingSlot,
            uint256 structMappingSlot,
            uint256 arrayMappingSlot
        )
    {
        assembly {
            staticArraySlot := staticArray.slot
            dynamicArraySlot := dynamicArray.slot
            array2dSlot := array2d.slot
            structArraySlot := structArray.slot
            poppedArraySlot := poppedArray.slot
            deletedArraySlot := deletedArray.slot
            simpleMappingSlot := simpleMapping.slot
            nestedMappingSlot := nestedMapping.slot
            structMappingSlot := structMapping.slot
            arrayMappingSlot := arrayMapping.slot
        }
    }
}
