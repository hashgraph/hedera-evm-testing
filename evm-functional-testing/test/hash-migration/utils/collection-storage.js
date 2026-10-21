// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { getterKey, arrayDataSlot, mappingSlot } = require("./storage");
const { GAS_LIMIT_1_000_000 } = require("../../../utils/constants");

const A = "0x" + "a1".repeat(20);
const B = "0x" + "b2".repeat(20);
const C = "0x" + "c3".repeat(20);
const D = "0x" + "d4".repeat(20);

// Written by populate; must survive the upgrade. Mapping entries are [key, value] pairs.
// poppedArray loses its last element and deletedArray is emptied right after writing.
const ORIGINAL_COLLECTIONS = {
  staticArray: [11n, 12n, 13n],
  dynamicArray: [21n, 22n, 23n, 24n],
  array2d: [
    [31n, 32n],
    [33n, 34n, 35n],
  ],
  structArray: [
    [41n, 42n, A],
    [43n, 44n, B],
  ],
  poppedArray: [51n, 52n, 53n],
  deletedArray: [61n, 62n],
  simpleMapping: [
    [1n, 71n],
    [2n, 72n],
  ],
  nestedMapping: [
    [A, 1n, 81n],
    [A, 2n, 82n],
    [B, 1n, 83n],
  ],
  structMapping: [
    [1n, [91n, 92n, A]],
    [2n, [93n, 94n, B]],
  ],
  arrayMapping: [
    [1n, [101n, 102n]],
    [2n, [103n, 104n, 105n]],
  ],
};

// Written by verify after the upgrade; every entry differs from ORIGINAL_COLLECTIONS so a lost write fails.
// The popped and deleted arrays are filled again.
const UPDATED_COLLECTIONS = {
  staticArray: [111n, 112n, 113n],
  dynamicArray: [121n, 122n, 123n, 124n],
  array2d: [
    [131n, 132n],
    [133n, 134n, 135n],
  ],
  structArray: [
    [141n, 142n, C],
    [143n, 144n, D],
  ],
  poppedArray: [151n, 152n, 153n],
  deletedArray: [161n, 162n],
  simpleMapping: [
    [1n, 171n],
    [2n, 172n],
  ],
  nestedMapping: [
    [A, 1n, 181n],
    [A, 2n, 182n],
    [B, 1n, 183n],
  ],
  structMapping: [
    [1n, [191n, 192n, C]],
    [2n, [193n, 194n, D]],
  ],
  arrayMapping: [
    [1n, [201n, 202n]],
    [2n, [203n, 204n, 205n]],
  ],
};

async function deployCollectionStorage() {
  const factory = await ethers.getContractFactory("CollectionStorage");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  return contract;
}

/**
 * Sends one transaction per collection, writing every entry.
 *
 * @param {import("ethers").Contract} contract
 * @param {object} values ORIGINAL_COLLECTIONS or UPDATED_COLLECTIONS
 */
async function writeCollections(contract, values) {
  const writes = [
    () => contract.setStaticArray(values.staticArray, GAS_LIMIT_1_000_000),
    () => contract.setDynamicArray(values.dynamicArray, GAS_LIMIT_1_000_000),
    () => contract.setArray2d(values.array2d, GAS_LIMIT_1_000_000),
    () => contract.setStructArray(values.structArray, GAS_LIMIT_1_000_000),
    () => contract.setPoppedArray(values.poppedArray, GAS_LIMIT_1_000_000),
    () => contract.setDeletedArray(values.deletedArray, GAS_LIMIT_1_000_000),
    () =>
      contract.setSimpleMapping(
        values.simpleMapping.map(([key]) => key),
        values.simpleMapping.map(([, value]) => value),
        GAS_LIMIT_1_000_000,
      ),
    () =>
      contract.setNestedMapping(
        values.nestedMapping.map(([outer]) => outer),
        values.nestedMapping.map(([, inner]) => inner),
        values.nestedMapping.map(([, , value]) => value),
        GAS_LIMIT_1_000_000,
      ),
    () =>
      contract.setStructMapping(
        values.structMapping.map(([key]) => key),
        values.structMapping.map(([, item]) => item),
        GAS_LIMIT_1_000_000,
      ),
    () =>
      contract.setArrayMapping(
        values.arrayMapping.map(([key]) => key),
        values.arrayMapping.map(([, array]) => array),
        GAS_LIMIT_1_000_000,
      ),
  ];

  for (const write of writes) {
    const tx = await write();
    await tx.wait();
  }
}

/**
 * Removes the last element of poppedArray and empties deletedArray, each in its own transaction.
 *
 * @param {import("ethers").Contract} contract
 */
async function popAndDelete(contract) {
  const popTx = await contract.popPoppedArray(GAS_LIMIT_1_000_000);
  await popTx.wait();

  const deleteTx = await contract.deleteDeletedArray(GAS_LIMIT_1_000_000);
  await deleteTx.wait();
}

/**
 * Value every getter call must return, keyed by getterKey.
 *
 * @param {object} values ORIGINAL_COLLECTIONS or UPDATED_COLLECTIONS
 * @param {boolean} poppedAndDeleted whether popAndDelete ran after writing
 * @returns {Record<string, unknown>}
 */
function expectedCollections(values, poppedAndDeleted) {
  const popped = poppedAndDeleted
    ? values.poppedArray.slice(0, -1)
    : values.poppedArray;
  const deleted = poppedAndDeleted ? [] : values.deletedArray;

  const expected = {};
  const add = (name, args, value) => {
    expected[getterKey(name, args)] = value;
  };
  const addArray = (name, array) => {
    add(`${name}Length`, [], array.length);
    array.forEach((value, i) => add(name, [i], value));
  };

  values.staticArray.forEach((value, i) => add("staticArray", [i], value));
  addArray("dynamicArray", values.dynamicArray);

  add("array2dLength", [], values.array2d.length);
  values.array2d.forEach((inner, i) => {
    add("array2dInnerLength", [i], inner.length);
    inner.forEach((value, j) => add("array2d", [i, j], value));
  });

  addArray("structArray", values.structArray);
  addArray("poppedArray", popped);
  addArray("deletedArray", deleted);

  values.simpleMapping.forEach(([key, value]) =>
    add("simpleMapping", [key], value),
  );
  values.nestedMapping.forEach(([outer, inner, value]) =>
    add("nestedMapping", [outer, inner], value),
  );
  values.structMapping.forEach(([key, item]) =>
    add("structMapping", [key], item),
  );
  values.arrayMapping.forEach(([key, array]) => {
    add("arrayMappingLength", [key], array.length);
    array.forEach((value, i) => add("arrayMapping", [key, i], value));
  });

  return expected;
}

/**
 * Every slot the written collections touch, computed from each collection's base slot.
 * Includes the slots that pop() and delete free, which must read zero.
 *
 * @param {import("ethers").Contract} contract
 * @param {object} values the values written (before any pop or delete)
 * @returns {Promise<bigint[]>}
 */
async function collectionSlots(contract, values) {
  const layout = await contract.layout();
  const slots = [];

  const addRange = (first, count) => {
    for (let i = 0n; i < BigInt(count); i++) slots.push(first + i);
  };

  // Base slot holds the length; elements start at keccak256(base)
  const addDynamicArray = (base, length, slotsPerElement = 1) => {
    slots.push(base);
    addRange(arrayDataSlot(base), length * slotsPerElement);
  };

  addRange(layout.staticArraySlot, values.staticArray.length);
  addDynamicArray(layout.dynamicArraySlot, values.dynamicArray.length);

  slots.push(layout.array2dSlot);
  values.array2d.forEach((inner, i) =>
    addDynamicArray(
      arrayDataSlot(layout.array2dSlot) + BigInt(i),
      inner.length,
    ),
  );

  addDynamicArray(layout.structArraySlot, values.structArray.length, 2);
  addDynamicArray(layout.poppedArraySlot, values.poppedArray.length);
  addDynamicArray(layout.deletedArraySlot, values.deletedArray.length);

  values.simpleMapping.forEach(([key]) =>
    slots.push(mappingSlot("uint256", key, layout.simpleMappingSlot)),
  );
  values.nestedMapping.forEach(([outer, inner]) =>
    slots.push(
      mappingSlot(
        "uint256",
        inner,
        mappingSlot("address", outer, layout.nestedMappingSlot),
      ),
    ),
  );
  values.structMapping.forEach(([key]) =>
    addRange(mappingSlot("uint256", key, layout.structMappingSlot), 2),
  );
  values.arrayMapping.forEach(([key, array]) =>
    addDynamicArray(
      mappingSlot("uint256", key, layout.arrayMappingSlot),
      array.length,
    ),
  );

  return slots;
}

/**
 * Slots freed by popAndDelete: the popped element, and the deleted array's length and elements.
 *
 * @param {import("ethers").Contract} contract
 * @param {object} values the values written before popAndDelete
 * @returns {Promise<bigint[]>}
 */
async function clearedCollectionSlots(contract, values) {
  const { poppedArraySlot, deletedArraySlot } = await contract.layout();
  const lastPopped =
    arrayDataSlot(poppedArraySlot) + BigInt(values.poppedArray.length - 1);
  const deleted = values.deletedArray.map(
    (_, i) => arrayDataSlot(deletedArraySlot) + BigInt(i),
  );

  return [lastPopped, deletedArraySlot, ...deleted];
}

module.exports = {
  ORIGINAL_COLLECTIONS,
  UPDATED_COLLECTIONS,
  deployCollectionStorage,
  writeCollections,
  popAndDelete,
  expectedCollections,
  collectionSlots,
  clearedCollectionSlots,
};
