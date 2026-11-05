// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/**
 * Snapshot written by `01-populate.test.js` on the old network and read by `02-verify.test.js`
 * on the upgraded one. Lives at the Hardhat project root (evm-functional-testing).
 */
const SNAPSHOT_PATH = path.join(
  hre.config.paths.root,
  "hash-migration-snapshot.json",
);

/**
 * Writes the snapshot. `complete` is false when any populate test failed, so verify refuses
 * to compare against partial data.
 *
 * @param {object} snapshot
 * @param {boolean} complete
 */
function writeSnapshot(snapshot, complete) {
  const data = { ...snapshot, complete, writtenAt: new Date().toISOString() };
  // BigInt is not JSON-serializable, so it is stored as a decimal string
  const json = JSON.stringify(
    data,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

  fs.writeFileSync(SNAPSHOT_PATH, json);
}

/**
 * Reads the snapshot and fails if it is missing or was written by a failed populate run.
 *
 * @returns {object}
 */
function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `Snapshot not found at ${SNAPSHOT_PATH}. Run 01-populate.test.js first.`,
    );
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));

  if (!snapshot.complete) {
    throw new Error(
      `Snapshot at ${SNAPSHOT_PATH} is incomplete: a populate test failed.`,
    );
  }

  return snapshot;
}

/**
 * The suite's before/after hooks. Mocha has no public accessor, so this reads its internal fields.
 *
 * @param {import("mocha").Suite} suite
 * @returns {import("mocha").Hook[]}
 */
function hooksOf(suite) {
  return [
    ...suite._beforeAll,
    ...suite._beforeEach,
    ...suite._afterEach,
    ...suite._afterAll,
  ];
}

/**
 * Whether any test or hook in the suite or its nested suites failed. A failed hook skips the
 * suite's tests, which then have no state at all.
 *
 * @param {import("mocha").Suite} suite
 * @returns {boolean}
 */
function suiteFailed(suite) {
  return (
    suite.tests.some((test) => test.state === "failed") ||
    hooksOf(suite).some((hook) => hook.state === "failed") ||
    suite.suites.some(suiteFailed)
  );
}

module.exports = {
  SNAPSHOT_PATH,
  writeSnapshot,
  readSnapshot,
  suiteFailed,
};
