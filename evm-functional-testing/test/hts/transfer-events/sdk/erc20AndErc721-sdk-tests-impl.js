const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const { getReceiptFromSdkTxResponse } = require("./erc20-sdk-tests-impl");
const { encodeFunctionParameters } = require("./erc20-sdk-tests-impl");
const { ContractExecuteTransaction, ContractId, PrivateKey} = require("@hiero-ledger/sdk");
const {validateErcEvent} = require("../../../../utils/events");
const {getAccountId, createSDKClient} = require("../../../../utils/utils");

class Erc20Erc721SdkTestsImpl {
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
  async cryptoTransferV1Test(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1 },
          { accountID: receiverWallet.address, amount: 1 },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverWallet.address,
            serialNumber: serialNumber,
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
      "%s FT/NFT cryptoTransferV1 tokenTransfers:%s",
      receipt.hash,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
  ) {
    const transferList = {
      transfers: [],
    };
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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
      "%s FT/NFT cryptoTransferV2 TransferList:%s tokenTransfers:%s",
      receipt.hash,
      transferList,
      JSON.stringify(tokenTransfers),
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        serial: serialNumber,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverWallet.address, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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
      "%s FT/NFT airdropTokens tokenTransfers:%s",
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
              address: ftTokenAddress,
              from: transferContract.target,
              to: receiverWallet.address,
              amount: 1,
            },
            {
              address: nftTokenAddress,
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
    ftTokenAddress,
    nftTokenAddress,
    receiverWallet,
    serialNumber,
    responseCode,
    IHederaTokenService,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: ftTokenAddress,
        serial: 0,
      },
      {
        sender: transferContract.target,
        receiver: receiverWallet.address,
        token: nftTokenAddress,
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
      "%s FT/NFT claimAirdrops pendingAirdrops:%s",
      receipt.hash,
      pendingAirdrops,
    );
    // we are validation just ERC event, without ResponseCode event, because we are requesting htsContract directly
    await validateErcEvent(receipt, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverWallet.address,
        amount: 1,
      },
      {
        address: nftTokenAddress,
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
  Erc20Erc721SdkTestsImpl,
};
