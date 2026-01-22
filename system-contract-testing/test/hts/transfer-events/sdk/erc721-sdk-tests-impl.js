const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const { getReceiptFromSdkTxResponse } = require("./erc20-sdk-tests-impl");
const { encodeFunctionParameters } = require("./erc20-sdk-tests-impl");
const {
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters,
} = require("@hashgraph/sdk");

// ---------------- Test util functions ----------------
class Erc721SdkTestsImpl {
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
  async transferNFTTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferNFT",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddress(transferContract.target)
          .addAddress(receiverContract.target)
          .addInt64(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNFTTest(
    htsAddress,
    transferContract,
    tokenAddress,
    senderContract,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferFromNFT",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddress(senderContract.target)
          .addAddress(receiverContract.target)
          .addUint256(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFromNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: senderContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNftProxyTest(
    transferContract,
    tokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferFromNftProxy",
        new ContractFunctionParameters()
          .addAddress(tokenAddress)
          .addAddress(transferContract.target)
          .addAddress(receiverContract.target)
          .addUint256(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFromNft proxy:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverContract.target,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async transferNFTsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const senders = [transferContract.target, transferContract.target];
    const receivers = [receiverContract1.target, receiverContract2.target];
    const serialNumbers = [Number(serialNumber1), Number(serialNumber2)];
    const tx = new ContractExecuteTransaction()
      .setContractId(ContractId.fromEvmAddress(0, 0, transferContract.target))
      .setGas(this.gas)
      .setFunction(
        "transferNFTs",
        new ContractFunctionParameters()
          .addAddress(htsAddress)
          .addAddress(tokenAddress)
          .addAddressArray(senders)
          .addAddressArray(receivers)
          .addInt64Array(serialNumbers),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s NFT transferNFTs:%s senders:%s receivers:%s serialNumbers:%s",
      receipt.hash,
      tokenAddress,
      senders,
      receivers,
      serialNumbers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract1.target,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract2.target,
            serialNumber: serialNumber2,
          },
        ],
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
      "%s NFT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
      tokenTransfers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract1,
    receiverContract2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const transferList = {
      transfers: [],
    };
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract1.target,
            serialNumber: serialNumber1,
            isApproval: false,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract2.target,
            serialNumber: serialNumber2,
            isApproval: false,
          },
        ],
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
      "%s NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      tokenTransfers,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract1.target,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverContract2.target,
        serial: serialNumber2,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: tokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract.target,
            serialNumber: serialNumber,
            isApproval: false,
          },
        ],
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
      tokenTransfers,
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
              serial: serialNumber,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: tokenAddress,
        serial: serialNumber,
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
        serial: serialNumber,
      },
    ]);
  }
}

module.exports = {
  Erc721SdkTestsImpl,
};
