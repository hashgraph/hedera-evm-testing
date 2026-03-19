const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const Async = require("../../../../utils/async");
const { ethers } = require("hardhat");
const {
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
  PrivateKey,
} = require("@hiero-ledger/sdk");
const { validateErcEvent } = require("../../../../utils/events");
const { createSDKClient, getAccountId} = require("../../../../utils/utils");

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
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addInt64(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFromTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFtProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferFromFtProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addUint256(amount),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      amount,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: amount,
      },
    ]);
  }

  async transferTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    responseCode,
  ) {
    const accounts = [
      transferContract.target,
      receiverWallet1.address,
      receiverWallet2.address,
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
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -3 },
          { accountID: receiverWallet1.address, amount: 1 },
          { accountID: receiverWallet2.address, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(
          this.context.transferAbiInterface,
          "cryptoTransferV1",
          [htsAddress, tokenTransfers],
        ),
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
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
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
          { accountID: receiverWallet1.address, amount: 1, isApproval: false },
          { accountID: receiverWallet2.address, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(
          this.context.transferAbiInterface,
          "cryptoTransferV2",
          [htsAddress, transferList, tokenTransfers],
        ),
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
        to: receiverWallet2.address,
        amount: 2,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        amount: 1,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(2 * this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(
          this.context.transferAbiInterface,
          "airdropTokens",
          [htsAddress, tokenTransfers],
        ),
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
              to: receiverWallet.address,
              amount: 1,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    responseCode,
    IHederaTokenService,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: tokenAddress,
        serial: 0,
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, htsAddress))
      .setGas(this.gas)
      .setFunctionParameters(
        encodeFunctionParameters(IHederaTokenService, "claimAirdrops", [
          pendingAirdrops,
        ]),
      );
    const receiverAccount = await getAccountId(
      receiverWallet.address,
      this.sdkClient(),
    );
    const receiverPk = PrivateKey.fromStringECDSA(receiverWallet.privateKey);
    const receiverSdkClient = await createSDKClient(
      receiverAccount,
      receiverPk,
    );
    try {
      const response = await tx.execute(receiverSdkClient);
      const receipt = await getReceiptFromSdkTxResponse(response);
      console.log(
        "%s FT claimAirdrops pendingAirdrops:%s",
        receipt.hash,
        pendingAirdrops,
      );
      // we are validation just ERC event, without ResponseCode event, because we are requesting htsContract directly
      await validateErcEvent(receipt, [
        {
          address: tokenAddress,
          from: transferContract.target,
          to: receiverWallet.address,
          amount: 1,
        },
      ]);
    } finally {
      receiverSdkClient.close();
    }
  }
}

module.exports = {
  encodeFunctionParameters,
  getReceiptFromSdkTxResponse,
  Erc20SdkTestsImpl,
};
