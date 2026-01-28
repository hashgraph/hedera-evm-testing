const { validateRcWithErcEvent } = require("../relay/erc20-relay-tests-impl");
const { getReceiptFromSdkTxResponse } = require("./erc20-sdk-tests-impl");
const { encodeFunctionParameters } = require("./erc20-sdk-tests-impl");
const { ContractExecuteTransaction, ContractId } = require("@hashgraph/sdk");

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
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1 },
          { accountID: receiverContract.target, amount: 1 },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
        transfers: [],
        nftTransfers: [
          {
            senderAccountID: transferContract.target,
            receiverAccountID: receiverContract.target,
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
        to: receiverContract.target,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async cryptoTransferV2Test(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverContract,
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
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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
        to: receiverContract.target,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }

  async airdropTokensTest(
    htsAddress,
    transferContract,
    ftTokenAddress,
    nftTokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
    pendingAirdrops,
  ) {
    const tokenTransfers = [
      {
        token: ftTokenAddress,
        transfers: [
          { accountID: transferContract.target, amount: -1, isApproval: false },
          { accountID: receiverContract.target, amount: 1, isApproval: false },
        ],
        nftTransfers: [],
      },
      {
        token: nftTokenAddress,
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
              to: receiverContract.target,
              amount: 1,
            },
            {
              address: nftTokenAddress,
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
    ftTokenAddress,
    nftTokenAddress,
    receiverContract,
    serialNumber,
    responseCode,
  ) {
    const pendingAirdrops = [
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: ftTokenAddress,
        serial: 0,
      },
      {
        sender: transferContract.target,
        receiver: receiverContract.target,
        token: nftTokenAddress,
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
      "%s FT/NFT claimAirdrops pendingAirdrops:%s",
      receipt.hash,
      pendingAirdrops,
    );
    await validateRcWithErcEvent(receipt, responseCode, [
      {
        address: ftTokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        amount: 1,
      },
      {
        address: nftTokenAddress,
        from: transferContract.target,
        to: receiverContract.target,
        serial: serialNumber,
      },
    ]);
  }
}
module.exports = {
  Erc20Erc721SdkTestsImpl,
};
