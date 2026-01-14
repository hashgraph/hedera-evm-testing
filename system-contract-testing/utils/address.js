// SPDX-License-Identifier: Apache-2.0

const crypto = require('crypto')

function randomAddress() {
  return "0x" + crypto.randomBytes(20).toString('hex');
}

module.exports = {
  randomAddress
};