const crypto = require('crypto')

function randomAddress() {
  return "0x" + crypto.randomBytes(20).toString('hex');
}

module.exports = {
  randomAddress
};