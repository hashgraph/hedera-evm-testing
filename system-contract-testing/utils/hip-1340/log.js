const { debuglog } = require('node:util');

/**
 * Logging function to be used throughout the pectra-testing package.
 * It uses Node.js's built-in `debuglog` utility to provide
 * conditional debugging output based on the `NODE_DEBUG` environment variable.
 * That is, to enable debug output, set `NODE_DEBUG=hip-1340` when running the tests.
 *
 * For more details see [`util.debuglog(section[, callback])`](https://nodejs.org/api/util.html#utildebuglogsection-callback) in Node.js's documentation.
 */
const log = debuglog('hip-1340');

module.exports = { log };