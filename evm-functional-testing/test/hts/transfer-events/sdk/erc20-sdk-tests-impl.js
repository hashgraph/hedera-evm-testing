const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const Async = require("../../../../utils/async");
const { ethers } = require("hardhat");
const {
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
} = require("@hiero-ledger/sdk");

/**
 * Helper function to encode function name and parameters that can be used to invoke a contract's function
 * @param { ethers.Interface } abiInterface ABI of the contract for this functionName
 * @param { String } functionName the name of the function to invoke
 * @param { Array } parameterArray an array of parameters to pass to the function
 */
function encodeFunctionParameters(abiInterface, functionName, parameterArray) {
  // build the call parameters using ethers.js
  // .slice(2) to remove leading '0x'
  const functionCallAsHexString = abiInterface
    .encodeFunctionData(functionName, parameterArray)
    .slice(2);
  // convert to a Uint8Array
  return Buffer.from(functionCallAsHexString, `hex`);
}

/**
 * Getting ether receipt object from Hedera SDK TransactionResponse object. This is used to reuse ERC events validation logic
 * @param { TransactionResponse } response Hedera SDK TransactionResponse
 * @returns {Promise<*|undefined>}
 */
async function getReceiptFromSdkTxResponse(response) {
  let txHash = "0x" + Buffer.from(response.transactionHash).toString("hex");
  if (txHash.length > 66) {
    txHash = txHash.slice(0, 66); // cut up to '0x' + 32 bytes to EVM eth tx hash
  }
  return await Async.waitForCondition(
    "getTransactionReceipt",
    () => ethers.provider.getTransactionReceipt(txHash),
    (result) => result != null,
    1000,
    60,
  );
}

class Erc20SdkTestsImpl {
  constructor(context) {
    this.context = context;
    this.gas = 1_000_000;
  }

  /**
   * Using this method because on instantiation time, context.sdkClient = undefined. And context.sdkClient is instantiated on tests execution time
   * @returns {any} Hedera sdkClient
   */
  sdkClient() {
    return this.context.sdkClient;
  }

  engine() {
    return "SDK";
  }

  // ---------------- Test functions ----------------
  async transferTokenTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferToken",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddress(transferContract.target)
          .addAddress(receiverContract.target)
          .addInt64(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFromTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferFrom",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddress(transferContract.target)
          .addAddress(receiverContract.target)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFtProxyTest(
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferFtProxy",
        new ContractFunctionParameters()
          .addAddress(tokenAddress)
          .addAddress(receiverContract.target)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferFromFtProxyTest(
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const amount = 1;
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferFromFtProxy",
        new ContractFunctionParameters()
          .addAddress(tokenAddress)
          .addAddress(transferContract.target)
          .addAddress(receiverContract.target)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: amount,
      },
    ]);
  }

  async transferTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    responseCode,
  ) {
    const accounts = [
      transferContract.target,
      receiverContract1.target,
      receiverContract2.target,
    ];
    const amounts = [-3, 1, 2];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferTokens",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddressArray(accounts)
          .addInt64Array(amounts),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transferTokens:%s accounts:%s amounts:%s",
      receipt.hash,
      tokenAddress,
      accounts,
      amounts,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3 },
          { accountID: receiverContract1.target, amount: 1 },
          { accountID: receiverContract2.target, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(this.context.transferAbiInterface, "cryptoTransferV1", [
          htsAddress,
          tokenTransfers,
        ]),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
        JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    responseCode,
  ) {
    const transferList = {
      transfers: [],
    };
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3, isApproval: false },
          { accountID: receiverContract1.target, amount: 1, isApproval: false },
          { accountID: receiverContract2.target, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(this.context.transferAbiInterface, "cryptoTransferV2", [
          htsAddress,
          transferList,
          tokenTransfers,
        ]),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
        JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(2 * this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(this.context.transferAbiInterface, "airdropTokens", [
          htsAddress,
          tokenTransfers,
        ]),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT airdropTokens tokenTransfers:%s",
      receipt.hash,
        JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(
      receipt,
      responseCode,
      pendingAirdrops
        ? []
        : [
            {
              address: tokenAddress,
              from: transferContract.target,
              to: receiverContract.target,
              amount: 1,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    responseCode,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: tokenAddress,
        serial: 0,
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, receiverContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(
          this.context.receiverAbiInterface,
          "claimAirdrops",
          [htsAddress, pendingAirdrops],
        ),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT claimAirdrops pendingAirdrops:%s",
      receipt.hash,
      pendingAirdrops,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: 1,
      },
    ]);
  }
}

module.exports = {
  encodeFunctionParameters,
  getReceiptFromSdkTxResponse,
  Erc20SdkTestsImpl,
};