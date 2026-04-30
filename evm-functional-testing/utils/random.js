const crypto = require('crypto')

function randomAddress() {
  return "0x" + crypto.randomBytes(20).toString('hex');
}

function randomStorageSlot() {
  return "0x" + crypto.randomBytes(32).toString("hex");
}

module.exports = {
  randomAddress,
  randomStorageSlot
};