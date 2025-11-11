const { expect } = require("chai");

async function testAccountAuthorization(tx, responseCode, isAuthorized) {
  const rc = await tx.wait();
  const log = rc.logs.find((e) => e.fragment.name === "AccountAuthorizationResponse");
  expect(log.args[0]).to.equal(responseCode);
  expect(log.args[1]).to.equal(isAuthorized);
  return log.args[1];
}

module.exports = {
  testAccountAuthorization,
}