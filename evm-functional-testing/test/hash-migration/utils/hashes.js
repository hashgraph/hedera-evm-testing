// SPDX-License-Identifier: Apache-2.0

const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Asserts that a block hash is 32 bytes: `0x` followed by 64 hex characters.
 *
 * @param {string} hash
 * @param {string} label names the hash in the failure message, e.g. "relay hash of block 42"
 */
function expectHash32(hash, label) {
  expect(
    ethers.isHexString(hash, 32),
    `${label} is not a 32-byte hash: ${hash}`,
  ).to.be.true;
}

module.exports = {
  expectHash32,
};
