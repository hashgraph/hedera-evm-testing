// SPDX-License-Identifier: Apache-2.0

const { ethers } = require("hardhat");
const { getterKey } = require("./storage");
const {
  GAS_LIMIT_1_000_000,
  GAS_LIMIT_5_000_000,
} = require("../../../utils/constants");
const { waitForReceipt } = require("./network");

// ERC20: minted to the owner, part sent to the receiver, part approved for the receiver
const ERC20_MINTED = 1_000n;
const ERC20_TRANSFERRED = 100n;
const ERC20_ALLOWANCE = 250n;

// ERC721: all minted to the owner; #2 sent to the receiver, #1 approved for the receiver, and the
// receiver approved for all
const ERC721_IDS = [1, 2, 3];
const ERC721_BASE_URI = "https://example.com/erc721/";

// ERC1155: both ids minted to the owner; a single and a batch transfer to the receiver
const ERC1155_IDS = [1, 2];
const ERC1155_MINTED = [100n, 200n];
const ERC1155_SINGLE = { id: 1, amount: 10n };
const ERC1155_BATCH = { ids: [1, 2], amounts: [5n, 20n] };
const ERC1155_URI = "https://example.com/erc1155/{id}.json";

// Verify mints these after the upgrade
const ERC20_NEW_MINT = 500n;
const ERC721_NEW_ID = 4;
const ERC1155_NEW = { id: 3, amount: 30n };
// The receiver moves this much of id 2 using its approval for all
const ERC1155_PULLED = { id: 2, amount: 50n };

/** The owner (signer 0) and the receiver and spender (signer 2; signer 1 generates blocks). */
async function ercAccounts() {
  const [owner, , receiver] = await ethers.getSigners();

  return { owner, receiver };
}

async function deploy(name) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(GAS_LIMIT_5_000_000);
  await contract.waitForDeployment();

  return contract;
}

async function send(txPromise) {
  const tx = await txPromise;

  return waitForReceipt(tx);
}

/**
 * Deploys the three tokens and runs mint, transfer and approve on each.
 *
 * @returns {Promise<{ erc20: import("ethers").Contract, erc721: import("ethers").Contract, erc1155: import("ethers").Contract }>}
 */
async function setUpErcTokens() {
  const { owner, receiver } = await ercAccounts();

  const erc20 = await deploy("MigrationERC20");
  await send(erc20.mint(owner.address, ERC20_MINTED, GAS_LIMIT_1_000_000));
  await send(
    erc20.transfer(receiver.address, ERC20_TRANSFERRED, GAS_LIMIT_1_000_000),
  );
  await send(
    erc20.approve(receiver.address, ERC20_ALLOWANCE, GAS_LIMIT_1_000_000),
  );

  const erc721 = await deploy("MigrationERC721");
  for (const id of ERC721_IDS) {
    await send(erc721.mint(owner.address, id, GAS_LIMIT_1_000_000));
  }
  await send(
    erc721.transferFrom(
      owner.address,
      receiver.address,
      2,
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(erc721.approve(receiver.address, 1, GAS_LIMIT_1_000_000));
  await send(
    erc721.setApprovalForAll(receiver.address, true, GAS_LIMIT_1_000_000),
  );

  const erc1155 = await deploy("MigrationERC1155");
  await send(
    erc1155.mintBatch(
      owner.address,
      ERC1155_IDS,
      ERC1155_MINTED,
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(
    erc1155.safeTransferFrom(
      owner.address,
      receiver.address,
      ERC1155_SINGLE.id,
      ERC1155_SINGLE.amount,
      "0x",
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(
    erc1155.safeBatchTransferFrom(
      owner.address,
      receiver.address,
      ERC1155_BATCH.ids,
      ERC1155_BATCH.amounts,
      "0x",
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(
    erc1155.setApprovalForAll(receiver.address, true, GAS_LIMIT_1_000_000),
  );

  return { erc20, erc721, erc1155 };
}

/** Every getter value populate leaves behind, keyed by getterKey, per contract. */
async function expectedErcGetters() {
  const { owner, receiver } = await ercAccounts();
  const ownerAddress = owner.address;
  const receiverAddress = receiver.address;

  return {
    erc20: {
      [getterKey("totalSupply")]: ERC20_MINTED,
      [getterKey("balanceOf", [ownerAddress])]:
        ERC20_MINTED - ERC20_TRANSFERRED,
      [getterKey("balanceOf", [receiverAddress])]: ERC20_TRANSFERRED,
      [getterKey("allowance", [ownerAddress, receiverAddress])]:
        ERC20_ALLOWANCE,
    },
    erc721: {
      [getterKey("balanceOf", [ownerAddress])]: 2n,
      [getterKey("balanceOf", [receiverAddress])]: 1n,
      [getterKey("ownerOf", [1])]: ownerAddress,
      [getterKey("ownerOf", [2])]: receiverAddress,
      [getterKey("ownerOf", [3])]: ownerAddress,
      [getterKey("getApproved", [1])]: receiverAddress,
      [getterKey("isApprovedForAll", [ownerAddress, receiverAddress])]: true,
      [getterKey("tokenURI", [1])]: `${ERC721_BASE_URI}1`,
    },
    erc1155: {
      [getterKey("balanceOf", [ownerAddress, 1])]:
        ERC1155_MINTED[0] - ERC1155_SINGLE.amount - ERC1155_BATCH.amounts[0],
      [getterKey("balanceOf", [receiverAddress, 1])]:
        ERC1155_SINGLE.amount + ERC1155_BATCH.amounts[0],
      [getterKey("balanceOf", [ownerAddress, 2])]:
        ERC1155_MINTED[1] - ERC1155_BATCH.amounts[1],
      [getterKey("balanceOf", [receiverAddress, 2])]: ERC1155_BATCH.amounts[1],
      [getterKey("isApprovedForAll", [ownerAddress, receiverAddress])]: true,
      [getterKey("uri", [1])]: ERC1155_URI,
    },
  };
}

/**
 * After the upgrade: the owner mints more, and the receiver spends its whole allowance.
 *
 * @returns {Promise<Record<string, unknown>>} the getter values afterwards
 */
async function useErc20(erc20) {
  const { owner, receiver } = await ercAccounts();

  await send(erc20.mint(owner.address, ERC20_NEW_MINT, GAS_LIMIT_1_000_000));
  await send(
    erc20
      .connect(receiver)
      .transferFrom(
        owner.address,
        receiver.address,
        ERC20_ALLOWANCE,
        GAS_LIMIT_1_000_000,
      ),
  );

  return {
    [getterKey("totalSupply")]: ERC20_MINTED + ERC20_NEW_MINT,
    [getterKey("balanceOf", [owner.address])]:
      ERC20_MINTED - ERC20_TRANSFERRED - ERC20_ALLOWANCE + ERC20_NEW_MINT,
    [getterKey("balanceOf", [receiver.address])]:
      ERC20_TRANSFERRED + ERC20_ALLOWANCE,
    [getterKey("allowance", [owner.address, receiver.address])]: 0n,
  };
}

/**
 * After the upgrade: the owner mints a new id; the receiver takes #1 with its single approval and #3
 * with its approval for all.
 */
async function useErc721(erc721) {
  const { owner, receiver } = await ercAccounts();
  const asReceiver = erc721.connect(receiver);

  await send(erc721.mint(owner.address, ERC721_NEW_ID, GAS_LIMIT_1_000_000));
  await send(
    asReceiver.transferFrom(
      owner.address,
      receiver.address,
      1,
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(
    asReceiver.transferFrom(
      owner.address,
      receiver.address,
      3,
      GAS_LIMIT_1_000_000,
    ),
  );

  return {
    [getterKey("ownerOf", [1])]: receiver.address,
    [getterKey("ownerOf", [3])]: receiver.address,
    [getterKey("ownerOf", [ERC721_NEW_ID])]: owner.address,
    [getterKey("getApproved", [1])]: ethers.ZeroAddress,
    [getterKey("balanceOf", [owner.address])]: 1n,
    [getterKey("balanceOf", [receiver.address])]: 3n,
  };
}

/**
 * After the upgrade: the owner mints a new id; the receiver pulls part of id 2 with its approval
 * for all.
 */
async function useErc1155(erc1155) {
  const { owner, receiver } = await ercAccounts();

  await send(
    erc1155.mintBatch(
      owner.address,
      [ERC1155_NEW.id],
      [ERC1155_NEW.amount],
      GAS_LIMIT_1_000_000,
    ),
  );
  await send(
    erc1155
      .connect(receiver)
      .safeTransferFrom(
        owner.address,
        receiver.address,
        ERC1155_PULLED.id,
        ERC1155_PULLED.amount,
        "0x",
        GAS_LIMIT_1_000_000,
      ),
  );

  return {
    [getterKey("balanceOf", [owner.address, ERC1155_NEW.id])]:
      ERC1155_NEW.amount,
    [getterKey("balanceOf", [owner.address, 2])]:
      ERC1155_MINTED[1] - ERC1155_BATCH.amounts[1] - ERC1155_PULLED.amount,
    [getterKey("balanceOf", [receiver.address, 2])]:
      ERC1155_BATCH.amounts[1] + ERC1155_PULLED.amount,
  };
}

/**
 * Transfer events to the receiver in the given blocks: one log search by event signature and
 * indexed recipient, across every contract.
 */
async function transfersTo(receiver, fromBlock, toBlock) {
  const topic = ethers.id("Transfer(address,address,uint256)");
  const filter = {
    fromBlock: ethers.toQuantity(fromBlock),
    toBlock: ethers.toQuantity(toBlock),
    topics: [topic, null, ethers.zeroPadValue(receiver, 32)],
  };

  return ethers.provider.send("eth_getLogs", [filter]);
}

module.exports = {
  ercAccounts,
  setUpErcTokens,
  expectedErcGetters,
  transfersTo,
  useErc20,
  useErc721,
  useErc1155,
};
