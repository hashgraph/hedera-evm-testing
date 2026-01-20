const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const Async = require("../../../utils/async");
const { ethers } = require("hardhat");
const {
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
} = require("@hashgraph/sdk");
const { Interface } = require("@ethersproject/abi");
const { readFileSync } = require("node:fs");

class Erc20SdkTestsImpl {
  constructor(sdkClient) {
    this.sdkClient = sdkClient;
    this.gas = 1_000_000;
  }

  // Import the ABI
  static abi = JSON.parse(
    readFileSync(
      "./abi/contracts/erc-events/ErcEventsContract.sol/ErcEventsContract.json",
      "utf8",
    ),
  );
  // Setup an ethers.js interface using the abi
  static abiInterface = new Interface(this.abi);

  engine() {
    return "SDK";
  }

  /**
   * Helper function to encode function name and parameters that can be used to invoke a contract's function
   * @param functionName the name of the function to invoke
   * @param parameterArray an array of parameters to pass to the function
   */
  static encodeFunctionParameters(functionName, parameterArray) {
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
   * @param response Hedera SDK TransactionResponse
   * @returns {Promise<*|undefined>}
   */
  static async getReceiptFromSdkTxResponse(response) {
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
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferToken:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
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
          .addInt64(amount),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFrom:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
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
          .addInt64(amount),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transfer proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
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
          .addInt64(amount),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transferFrom proxy:%s from:%s to:%s amount:%s",
      rc.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      amount,
    );
    await validateRcWithErcEvent(rc, responseCode, [
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
          .addInt64Array(accounts),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT transferTokens:%s accounts:%s amounts:%s",
      rc.hash,
      tokenAddress,
      accounts,
      amounts,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
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
          { accountID: transferContract, amount: -3 },
          { accountID: receiverContract1, amount: 1 },
          { accountID: receiverContract2, amount: 2 },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        this.encodeFunctionParameters("cryptoTransferV1", [
          htsAddress,
          tokenTransfers,
        ]),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT cryptoTransferV1 tokenTransfers:%s",
      rc.hash,
      tokenTransfers,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
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
          { accountID: transferContract, amount: -3, isApproval: false },
          { accountID: receiverContract1, amount: 1, isApproval: false },
          { accountID: receiverContract2, amount: 2, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        this.encodeFunctionParameters("cryptoTransferV2", [
          htsAddress,
          transferList,
          tokenTransfers,
        ]),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      rc.hash,
      transferList,
      tokenTransfers,
    );
    await validateRcWithErcEvent(rc, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        amount: 1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        amount: 2,
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
          { accountID: transferContract, amount: -1, isApproval: false },
          { accountID: receiverContract, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        this.encodeFunctionParameters("airdropTokens", [htsAddress, tokenTransfers]),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT airdropTokens tokenTransfers:%s",
      rc.hash,
      tokenTransfers,
    );
    await validateRcWithErcEvent(
      rc,
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
        sender: transferContract,
        receiver: receiverContract,
        token: tokenAddress,
        serial: 0,
      },
    ];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunctionParameters(
        this.encodeFunctionParameters("claimAirdrops", [
          htsAddress,
          pendingAirdrops,
        ]),
      );
    const response = await tx.execute(this.sdkClient);
    const rc = await this.getReceiptFromSdkTxResponse(response);
    console.log(
      "%s FT claimAirdrops pendingAirdrops:%s",
      rc.hash,
      pendingAirdrops,
    );
    await validateRcWithErcEvent(rc, responseCode, [
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
  Erc20SdkTestsImpl,
};
