const { expect } = require("chai");

const { Events } = require("./constants");

const ERC20_TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Validate if ResponseCode event contain expected responseCode value
 *
 * @param rc ContractTransactionReceipt
 * @param responseCode expected response core value
 * @returns {Promise<void>}
 */
async function validateResponseCodeEvent(rc, responseCode) {
  const log = rc.logs.find(
    (e) => e.fragment && e.fragment.name === Events.ResponseCode,
  );
  expect(log).to.not.be.undefined;
  expect(log.args[0]).to.equal(responseCode);
}

/**
 * Validate if all ERC20/ERC721 transfer events are present in transaction receipt
 *
 * @param rc ContractTransactionReceipt
 * @param expectedEvents array of expected transfer events. Structure {from: "", to: "", amount: 0}
 * @returns {Promise<void>}
 */
async function validateErcEvent(rc, expectedEvents) {
  const transferEvents = rc.logs.filter(
    (e) => e.topics && e.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE,
  );
  expect(transferEvents.length).to.equal(expectedEvents.length);
  expectedEvents.forEach((expectedEvent, index) => {
    const event = transferEvents[index];
    expect(event.address.toLowerCase()).to.equal(
      expectedEvent.address.toLowerCase(),
    );
    expect(event.topics[1].toLowerCase()).to.equal(
      convertAddressToTopic(expectedEvent.from).toLowerCase(),
    );
    expect(event.topics[2].toLowerCase()).to.equal(
      convertAddressToTopic(expectedEvent.to).toLowerCase(),
    );
    if (expectedEvent.amount) {
      // check for FT
      expect(event.data).to.equal(convertNumberToData(expectedEvent.amount));
    } else if (expectedEvent.serial) {
      // check for NFT
      expect(event.topics[3]).to.equal(
        convertNumberToData(expectedEvent.serial),
      );
    }

  });
}

function convertAddressToTopic(str) {
  if (str.length === 42 && str.startsWith("0x")) {
    // convert address to topic
    return `0x${str.slice(2).padStart(64, "0")}`;
  }
  return str;
}

function convertNumberToData(num) {
  return `0x${num.toString(16).padStart(64, "0")}`;
}

module.exports = {
  validateResponseCodeEvent,
  validateErcEvent,
};
