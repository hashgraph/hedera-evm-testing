const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const { getReceiptFromSdkTxResponse } = require("./erc20-sdk-tests-impl");
const { encodeFunctionParameters } = require("./erc20-sdk-tests-impl");
const {
  ContractExecuteTransaction,
  ContractId,
  ContractFunctionParameters, PrivateKey,
} = require("@hiero-ledger/sdk");
const {validateErcEvent} = require("../../../../utils/events");
const {getAccountId, createSDKClient} = require("../../../../utils/utils");

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
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addInt64(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNFTTest(
    htsAddress,
    transferContract,
    tokenAddress,
    senderContract,
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addUint256(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFromNFT:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: senderContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferFromNftProxyTest(
    transferContract,
    tokenAddress,
    receiverWallet,
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
          .addAddress(receiverWallet.address)
          .addUint256(Number(serialNumber)),
      );
    const response = await tx.execute(this.sdkClient());
    const receipt = await getReceiptFromSdkTxResponse(response);
    console.log(
      "%s transferFromNft proxy:%s from:%s to:%s serialNumber:%s",
      receipt.hash,
      tokenAddress,
      transferContract.target,
      receiverWallet.address,
      serialNumber,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async transferNFTsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
    serialNumber1,
    serialNumber2,
    responseCode,
  ) {
    const senders = [transferContract.target, transferContract.target];
    const receivers = [receiverWallet1.address, receiverWallet2.address];
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
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
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
            receiverAccountID: receiverWallet1.address,
            serialNumber: serialNumber1,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet2.address,
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
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet1,
    receiverWallet2,
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
            receiverAccountID: receiverWallet1.address,
            serialNumber: serialNumber1,
            isApproval: false,
          },
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet2.address,
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
      "%s NFT cryptoTransferV2 transferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet1.address,
        serial: serialNumber1,
      },
      {
        address: tokenAddress,
        from: transferContract.target,
        to: receiverWallet2.address,
        serial: serialNumber2,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
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
            receiverAccountID: receiverWallet.address,
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
              serial: serialNumber,
            },
          ],
    );
  }

  async claimAirdropsTest(
    htsAddress,
    transferContract,
    tokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
    IHederaTokenService,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: tokenAddress,
        serial: serialNumber,
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
        serial: serialNumber,
      },
    ]);
    } finally {
      receiverSdkClient.close();
    }
  }
}

module.exports = {
  Erc721SdkTestsImpl,
};
