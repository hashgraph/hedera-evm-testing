// ETH Validation: self-relayed EthereumTransaction gas charging (SDK)
//
// An EthereumTransaction has two payers: the ECDSA sender recovered from the inner EIP-1559
// signature, and the outer HAPI payer (the "relayer"). When the offered gas price sits strictly
// between zero and the network gas price, the gas cost is split between them — the sender owes
// gasLimit * offeredGasPrice, the relayer owes the remainder.
//
// Those two roles may be the *same* account: the consensus node resolves the alias-form EVM sender
// and the numeric HAPI payer of an ECDSA account with an EVM-address alias to one and the same
// account, so both legs debit a single balance. This suite pins down what that account is charged:
//
//   * a self-relayed call pays the full network price of every gas unit it consumes, the same as an
//     equivalent call made with a separate relayer, and
//   * when the single balance cannot cover the two shares combined, the call is rejected up front
//     with INSUFFICIENT_PAYER_BALANCE and commits nothing — no state change, no nonce increment and
//     no gas collected.
//
// Two properties of the scenario shape this file:
//
//  1. Self-relay is only expressible through the SDK. Over the JSON-RPC relay the HAPI payer is the
//     relay's own operator, so sender != relayer and the two shares belong to different accounts.
//     Making them coincide over the relay would mean signing the inner transaction with the relay
//     operator's private key, which callers of the relay do not have. On solo the two also cannot
//     coincide by accident: solo deploys the relay with OPERATOR_ID_MAIN = 0.0.2 (its default
//     operator account number), and 0.0.2 holds the genesis ED25519 key, which has no EVM alias and
//     so can never be the sender recovered from an EIP-1559 signature.
//     The cases below therefore sign the inner EIP-1559 payload offline with ethers and submit it
//     as a HAPI EthereumTransaction through a client whose *operator is the signing account
//     itself*. This is the only place in the suite that talks to the consensus node directly.
//
//  2. It only means anything in normal-fee mode. Under EVM_ZERO_GAS_PRICE the network runs with
//     fees.simpleFeesAreFree=true and the consensus node skips gas charging altogether, so every
//     assertion here would hold without the charging path ever running. The suite therefore skips
//     itself in that mode (and on the Ethereum reference networks, which have no HAPI layer) and
//     runs in its own normal-fee CI shard. See docs/eth-validation/eth-validation.md.
//
// Money is in tinybars as BigInt throughout. chai 4's ordering matchers are not BigInt-safe, so
// ordering is asserted as `expect(a > b, "why").to.be.true`.
const hre = require("hardhat");
const { ethers } = require("hardhat");
const { expect } = require("chai");
const {
  ContractCallQuery,
  ContractId,
  EthereumTransaction,
  EthereumTransactionData,
  Hbar,
  PrecheckStatusError,
  PrivateKey,
  ReceiptStatusError,
} = require("@hiero-ledger/sdk");
const {
  createAccountWithBalance,
  createEcdsaAliasedAccount,
  createSdkClient,
  getAccountInfo,
  getTransactionRecord,
  getTransactionRecordUnchecked,
} = require("../hip-1340/utils/sdk");
const { isEthNetwork } = require("../hip-1340/utils/web3");
const { contractDeployAndFund } = require("../../utils/contract");
const Constants = require("../../utils/constants");
const { zeroGasPriceEnabled } = require("./utils/eth-validation-utils");

const WEIBARS_PER_TINYBAR = Constants.TINYBAR_TO_WEIBAR_COEF;

// One SimpleStorage is shared by every case, and each case writes a DIFFERENT non-zero value. That
// keeps the gas cost identical across cases: an SSTORE from zero costs ~20_000 gas, an SSTORE that
// changes a non-zero value ~2_900, and one that rewrites the same value ~100. The calibration call
// measures the middle case, so every case below must be the middle case too — otherwise the fee
// comparison between the self-relayed and the separate-relayer calls would be comparing different
// amounts of work. The sentinel is the initial write that takes slot 0 off zero.
const SENTINEL_VALUE = 14n;
const CALIBRATION_VALUE = 15n;
const UNDER_COMBINED_COST_VALUE = 41n;
const SINGLE_SHARE_VALUE = 42n;
const SELF_RELAYED_VALUE = 43n;
const SEPARATE_RELAYER_VALUE = 44n;

// Only has to exceed the real cost of setValue(); the calibration call is funded well above it.
const CALIBRATION_GAS_LIMIT = 200_000n;
const CALIBRATION_BALANCE = 2_000_000_000n; // 20 hbar

// Every case's HAPI payer is charged the node+network fee of the EthereumTransaction before handle
// (refunded on success only — contracts.evm.ethTransaction.zeroHapiFees.enabled defaults to true),
// and the ingest solvency check adds the full maxGasAllowance on top. So every case needs headroom
// above its relayer share, or it is turned away at ingest instead of by the charging path this
// suite is about. That fee is tinycent-denominated in the fee schedule, exactly like the gas price,
// so expressing the headroom in gas units keeps the margin stable across exchange rate changes. The
// fee is ~1_200 gas-equivalents at the genesis schedule, so this is a ~4x margin.
const HEADROOM_GAS = 5_000n;

describe("ETH Validation - Self-relayed gas charging (SDK)", function () {
  let provider;
  let operatorClient;
  let contractId;
  let contractAddress;
  let iface;

  // All derived in before() — see calibrate().
  let networkGasPrice;
  let gasLimit;
  let offeredGasPrice;
  let senderShare;
  let relayerShare;
  let upfrontCost;
  let headroom;
  let underCombinedCostBalance;
  let overCombinedCostBalance;
  let singleShareBalance;
  let separateRelayerBalance;

  // Captured by the self-relayed case and compared against the separate-relayer case.
  let selfRelayedFee = null;
  let selfRelayedGasUsed = null;

  before(async function () {
    // `function`, not an arrow: this.skip()/this.timeout() need the mocha context.
    if (isEthNetwork() || !hre.network.config.sdkClient) {
      // No HAPI layer on the Ethereum reference networks, so no sender/relayer split to observe.
      this.skip();
    }
    if (zeroGasPriceEnabled()) {
      // fees.simpleFeesAreFree=true short-circuits gas charging; see the header comment.
      this.skip();
    }
    this.timeout(240_000);

    provider = ethers.provider;
    operatorClient = createSdkClient();

    const storage = await contractDeployAndFund(
      Constants.Contract.SimpleStorage,
    );
    contractAddress = await storage.getAddress();
    contractId = ContractId.fromEvmAddress(0, 0, contractAddress);
    iface = storage.interface;

    // Warm slots 0/1/3 so the calibration call measures the steady-state cost of setValue()
    // (non-zero -> different non-zero), which is what every case below pays. Without this the
    // calibration would measure an SSTORE-from-zero and over-estimate every case's gas.
    await (
      await storage.setValue(SENTINEL_VALUE, { gasLimit: 1_000_000 })
    ).wait();

    ({ networkGasPrice, gasLimit } = await calibrate());

    offeredGasPrice = networkGasPrice / 2n;
    senderShare = gasLimit * offeredGasPrice;
    relayerShare = gasLimit * (networkGasPrice - offeredGasPrice);
    upfrontCost = gasLimit * networkGasPrice;
    headroom = HEADROOM_GAS * networkGasPrice;

    // Covers each share on its own but not their sum. Placed midway between the larger share and
    // the combined cost so neither edge is close.
    underCombinedCostBalance = relayerShare + (upfrontCost - relayerShare) / 2n;
    overCombinedCostBalance = upfrontCost + headroom;
    singleShareBalance = relayerShare + headroom;
    separateRelayerBalance = relayerShare + headroom;

    // Guard every assumption that gives a case its meaning, so a gas-schedule or exchange-rate
    // change surfaces here rather than quietly hollowing a case out.
    expect(
      offeredGasPrice > 0n,
      "offered price must be > 0, else the whole cost falls on the relayer share",
    ).to.be.true;
    expect(
      offeredGasPrice < networkGasPrice,
      "offered price must be below the network price for the cost to be split",
    ).to.be.true;
    expect(
      headroom < senderShare / 2n,
      "HAPI-fee headroom must stay small next to the sender share",
    ).to.be.true;
    expect(
      underCombinedCostBalance >= senderShare &&
        underCombinedCostBalance >= relayerShare,
      "the under-combined-cost balance must still cover each share on its own",
    ).to.be.true;
    expect(
      underCombinedCostBalance > relayerShare + headroom,
      "the under-combined-cost balance must clear the ingest solvency check",
    ).to.be.true;
    expect(
      underCombinedCostBalance + headroom < upfrontCost,
      "the under-combined-cost balance must fall short of the combined up-front cost",
    ).to.be.true;
    expect(
      singleShareBalance >= senderShare && singleShareBalance >= relayerShare,
      "the single-share balance must still cover each share on its own",
    ).to.be.true;
    expect(
      singleShareBalance + headroom < upfrontCost,
      "the single-share balance must fall short of the combined up-front cost",
    ).to.be.true;
    expect(
      singleShareBalance - relayerShare < senderShare,
      "the single-share balance must leave less than the sender share after the relayer share",
    ).to.be.true;

    console.log(
      "derived: networkGasPrice=%s gasLimit=%s offered=%s senderShare=%s relayerShare=%s upfront=%s headroom=%s",
      networkGasPrice,
      gasLimit,
      offeredGasPrice,
      senderShare,
      relayerShare,
      upfrontCost,
      headroom,
    );
  });

  after(function () {
    operatorClient?.close();
  });

  const toBigInt = (long) => BigInt(long.toString());

  async function balanceOf(accountId) {
    const info = await getAccountInfo(accountId.toString());
    return toBigInt(info.balance.toTinybars());
  }

  async function ethereumNonceOf(accountId) {
    const info = await getAccountInfo(accountId.toString());
    return info.ethereumNonce.toNumber();
  }

  /**
   * Reads SimpleStorage.value() straight from the consensus node.
   *
   * Deliberately not an ethers `staticCall`: that resolves through the relay and the mirror node,
   * which lags consensus by a second or more, so a "state unchanged" assertion could hold against
   * a stale read. A ContractCallQuery is immediate and authoritative.
   *
   * @returns {Promise<bigint>}
   */
  async function storedValue() {
    const result = await new ContractCallQuery()
      .setContractId(contractId)
      .setGas(100_000)
      .setFunctionParameters(
        Buffer.from(iface.encodeFunctionData("getValue").slice(2), "hex"),
      )
      .setQueryPayment(new Hbar(1))
      .execute(operatorClient);
    const [value] = iface.decodeFunctionResult(
      "getValue",
      ethers.hexlify(result.asBytes()),
    );
    return value;
  }

  /**
   * Signs `SimpleStorage.setValue(newValue)` as an EIP-1559 transaction with `wallet` and submits it
   * as a HAPI EthereumTransaction.
   *
   * The outer transaction is paid by `wallet.accountId` itself unless `relayer` is given, so by
   * default the recovered EVM sender and the relayer are the same account — the self-relay shape
   * this suite covers, which the JSON-RPC relay cannot produce. No setTransactionId() call:
   * freezeWith() derives the transaction id (and hence the payer) from the client's operator, and
   * setting it explicitly would lock the transaction-id list and disable regeneration on retry.
   *
   * Returns rather than throws when the network turns the transaction away, so the caller can
   * assert on the outcome.
   *
   * @returns {Promise<{transactionId: string, error: Error | null}>}
   */
  async function selfRelayedEthereumCall({
    wallet,
    key,
    nonce,
    newValue,
    gasLimit: innerGasLimit,
    offeredGasPrice: innerOfferedGasPrice,
    maxGasAllowance,
    value = 0n,
    relayer = null,
  }) {
    const signedTx = await wallet.signTransaction({
      type: 2,
      chainId: hre.network.config.chainId,
      nonce,
      to: contractAddress,
      data: iface.encodeFunctionData("setValue", [newValue]),
      value: value * WEIBARS_PER_TINYBAR,
      gasLimit: innerGasLimit,
      // EthTxData reads maxFeePerGas as the offered price for EIP-1559 and divides by 1e10, so this
      // is exactly `innerOfferedGasPrice` tinybars per gas. maxPriorityFeePerGas is not consulted.
      maxFeePerGas: innerOfferedGasPrice * WEIBARS_PER_TINYBAR,
      maxPriorityFeePerGas: 0n,
    });
    const data = EthereumTransactionData.fromBytes(
      Uint8Array.from(Buffer.from(signedTx.slice(2), "hex")),
    );

    const payer = relayer ?? { accountId: wallet.accountId, privateKey: key };
    const client = createSdkClient(
      payer.accountId.toString(),
      payer.privateKey,
    );
    try {
      const frozen = new EthereumTransaction()
        .setEthereumData(data.toBytes())
        .setMaxGasAllowanceHbar(Hbar.fromTinybars(maxGasAllowance))
        .freezeWith(client);
      // Check the payer rather than assuming it, so the self-relay premise is verified.
      expect(frozen.transactionId.accountId.toString()).to.equal(
        payer.accountId.toString(),
      );

      const response = await frozen.execute(client).then(
        (r) => r,
        (e) => e,
      );
      if (response instanceof Error) {
        // A PrecheckStatusError: turned away at ingest, before the charging path ran.
        return { transactionId: null, error: response };
      }
      const error = await response.getReceipt(client).then(
        () => null,
        (e) => e,
      );
      return { transactionId: response.transactionId.toString(), error };
    } finally {
      client.close();
    }
  }

  /**
   * Derives the network gas price and a gas limit from one successful self-relayed call rather than
   * hardcoding them, so the suite survives a gas-schedule or exchange-rate change.
   *
   * The price comes from the record, not from the relay's eth_gasPrice: the relay may apply its own
   * buffer, and every case's funding is a strict inequality against the price the consensus node
   * actually uses. A successful EthereumTransaction has its HAPI fees refunded, so its
   * transactionFee is purely gasUsed * gasPrice.
   *
   * @returns {Promise<{networkGasPrice: bigint, gasLimit: bigint}>}
   */
  async function calibrate() {
    const [wallet, key] = await createEcdsaAliasedAccount(
      operatorClient,
      provider,
      Hbar.fromTinybars(CALIBRATION_BALANCE),
    );
    // An offered price far above any plausible network price puts the whole cost on the sender, so
    // no relayer allowance is needed. The up-front check still uses the network price, so this
    // number does not affect the funding requirement.
    const { transactionId, error } = await selfRelayedEthereumCall({
      wallet,
      key,
      nonce: 0,
      newValue: CALIBRATION_VALUE,
      gasLimit: CALIBRATION_GAS_LIMIT,
      offeredGasPrice: 100_000n,
      maxGasAllowance: 0n,
    });
    expect(error, `calibration call must succeed, got ${error}`).to.equal(null);

    const record = await getTransactionRecord(transactionId);
    const gasUsed = toBigInt(record.contractFunctionResult.gasUsed);
    const fee = toBigInt(record.transactionFee.toTinybars());
    expect(gasUsed > 0n, "calibration call must report gas used").to.be.true;
    expect(
      fee % gasUsed,
      "a successful EthereumTransaction's fee must be a whole multiple of gasUsed — is the " +
        "zeroHapiFees refund still enabled?",
    ).to.equal(0n);

    const price = fee / gasUsed;
    expect(
      price > 1n,
      "network gas price must exceed 1 tinybar — is the network running fee-free?",
    ).to.be.true;

    // Logged as a cross-check only; the relay's eth_gasPrice may carry its own buffer.
    const relayGasPrice =
      (await provider.getFeeData()).gasPrice / WEIBARS_PER_TINYBAR;
    console.log(
      "networkGasPrice=%s tinybars/gas (relay eth_gasPrice reports %s)",
      price,
      relayGasPrice,
    );

    // 1.4x the measured cost: high enough that no case runs out of gas, low enough that
    // gasUsed > gasLimit/2, so the unused-gas refund cannot wipe out either share and both the
    // sender and the relayer genuinely pay in the separate-relayer case.
    return { networkGasPrice: price, gasLimit: (gasUsed * 7n) / 5n };
  }

  function newEcdsaAccount(balance) {
    return createEcdsaAliasedAccount(
      operatorClient,
      provider,
      Hbar.fromTinybars(balance),
    );
  }

  function splitPriceCall(wallet, key, newValue, overrides = {}) {
    return selfRelayedEthereumCall({
      wallet,
      key,
      nonce: 0,
      newValue,
      gasLimit,
      offeredGasPrice,
      maxGasAllowance: relayerShare,
      ...overrides,
    });
  }

  /**
   * The combined up-front check runs at handle, i.e. after consensus: execute() resolves and
   * getReceipt() throws. The ingest solvency check reports the *same* INSUFFICIENT_PAYER_BALANCE
   * code for an entirely different reason, so asserting the error class — not just the status
   * string — is what keeps a mis-funded case from being read as a pass.
   */
  function expectRejectedAtHandle(error) {
    expect(error, "expected the call to be rejected").to.be.instanceOf(
      ReceiptStatusError,
    );
    expect(
      error,
      "must be rejected by the gas-charging path at handle, not at ingest",
    ).to.not.be.instanceOf(PrecheckStatusError);
    expect(error.status.toString()).to.equal("INSUFFICIENT_PAYER_BALANCE");
  }

  it("should reject a self-relayed call whose payer cannot cover the sender and relayer shares combined", async function () {
    const [wallet, key] = await newEcdsaAccount(underCombinedCostBalance);
    const valueBefore = await storedValue();
    const before = await balanceOf(wallet.accountId);
    // createEcdsaAliasedAccount pays the AccountCreateTransaction fee from the operator, so the new
    // account's balance is exactly what was requested.
    expect(before).to.equal(underCombinedCostBalance);
    expect(before >= senderShare, "balance covers the sender share alone").to.be
      .true;
    expect(before >= relayerShare, "balance covers the relayer share alone").to
      .be.true;
    expect(before < upfrontCost, "balance cannot cover their sum").to.be.true;

    // Both shares are debited from this one balance, so solvency is judged on their sum: covering
    // each share individually is not enough.
    const { transactionId, error } = await splitPriceCall(
      wallet,
      key,
      UNDER_COMBINED_COST_VALUE,
    );
    expectRejectedAtHandle(error);

    // Nothing ran: storage untouched and the sender's nonce never advanced, because the up-front
    // check precedes both execution and the nonce increment.
    expect(await storedValue()).to.equal(valueBefore);
    expect(await ethereumNonceOf(wallet.accountId)).to.equal(0);

    // The only debit is the HAPI fee of the rejected transaction — no gas is collected. Note this
    // is not zero: the zeroHapiFees refund applies on the success path only.
    const record = await getTransactionRecordUnchecked(transactionId);
    expect(record.receipt.status.toString()).to.equal(
      "INSUFFICIENT_PAYER_BALANCE",
    );
    const fee = toBigInt(record.transactionFee.toTinybars());
    const afterFirst = await balanceOf(wallet.accountId);
    expect(before - afterFirst).to.equal(fee);
    expect(fee < senderShare, "a rejected call must not collect gas").to.be
      .true;

    // The nonce is unconsumed, so the same transaction can be resubmitted; it is rejected the same
    // way and costs another HAPI fee, leaving the balance strictly lower each time.
    const resubmitted = await splitPriceCall(
      wallet,
      key,
      UNDER_COMBINED_COST_VALUE,
    );
    expectRejectedAtHandle(resubmitted.error);
    const afterResubmit = await balanceOf(wallet.accountId);
    expect(
      afterResubmit < afterFirst,
      "each attempt strictly costs its HAPI fee",
    ).to.be.true;
    expect(await storedValue()).to.equal(valueBefore);
    expect(await ethereumNonceOf(wallet.accountId)).to.equal(0);
  });

  it("should reject a self-relayed call whose payer covers only the larger of the two shares", async function () {
    // The boundary case: enough for the relayer share, but what remains afterwards is less than the
    // sender share, so the combined cost is still out of reach.
    const [wallet, key] = await newEcdsaAccount(singleShareBalance);
    const valueBefore = await storedValue();
    const before = await balanceOf(wallet.accountId);
    expect(before >= relayerShare, "balance covers the relayer share alone").to
      .be.true;
    expect(
      before - relayerShare < senderShare,
      "what remains after the relayer share is less than the sender share",
    ).to.be.true;

    const { error } = await splitPriceCall(wallet, key, SINGLE_SHARE_VALUE);
    expectRejectedAtHandle(error);
    expect(await storedValue()).to.equal(valueBefore);
    expect(await ethereumNonceOf(wallet.accountId)).to.equal(0);
  });

  it("should charge a self-relayed call the full network price of the gas it used", async function () {
    const [wallet, key] = await newEcdsaAccount(overCombinedCostBalance);
    const before = await balanceOf(wallet.accountId);
    expect(before > upfrontCost, "balance covers the whole up-front cost").to.be
      .true;

    const { transactionId, error } = await splitPriceCall(
      wallet,
      key,
      SELF_RELAYED_VALUE,
    );
    expect(error, `expected success, got ${error}`).to.equal(null);

    const record = await getTransactionRecord(transactionId);
    const gasUsed = toBigInt(record.contractFunctionResult.gasUsed);
    const fee = toBigInt(record.transactionFee.toTinybars());
    const delta = before - (await balanceOf(wallet.accountId));

    console.log(
      "self-relayed: gasUsed=%s fee=%s delta=%s (gasUsed * price = %s)",
      gasUsed,
      fee,
      delta,
      gasUsed * networkGasPrice,
    );

    // Every gas unit consumed is paid for at the network price, and the account is debited exactly
    // that much.
    expect(fee).to.equal(gasUsed * networkGasPrice);
    expect(delta).to.equal(fee);
    // The unused portion of the gas limit is still refunded, so the charge is for gas used rather
    // than for the whole limit.
    expect(fee < upfrontCost, "unused gas must still be refunded").to.be.true;
    expect(await storedValue()).to.equal(SELF_RELAYED_VALUE);
    expect(await ethereumNonceOf(wallet.accountId)).to.equal(1);

    selfRelayedFee = fee;
    selfRelayedGasUsed = gasUsed;
  });

  it("should charge the same for an equivalent call made with a separate relayer", async function () {
    // Two distinct accounts, so the sender and relayer shares are debited from separate balances.
    // Same call at the same price, so the total must match the self-relayed case exactly — a
    // statement that holds however transactionFee happens to be composed.
    const [wallet, key] = await newEcdsaAccount(senderShare);
    const relayer = await createAccountWithBalance(
      PrivateKey.generateECDSA(),
      operatorClient,
      Hbar.fromTinybars(separateRelayerBalance),
    );
    const senderBefore = await balanceOf(wallet.accountId);
    const relayerBefore = await balanceOf(relayer.accountId);
    expect(senderBefore).to.equal(senderShare);
    expect(relayerBefore >= relayerShare, "relayer covers its share").to.be
      .true;

    const { transactionId, error } = await splitPriceCall(
      wallet,
      key,
      SEPARATE_RELAYER_VALUE,
      { relayer },
    );
    expect(error, `expected success, got ${error}`).to.equal(null);

    const record = await getTransactionRecord(transactionId);
    const gasUsed = toBigInt(record.contractFunctionResult.gasUsed);
    const fee = toBigInt(record.transactionFee.toTinybars());
    const senderDelta = senderBefore - (await balanceOf(wallet.accountId));
    const relayerDelta = relayerBefore - (await balanceOf(relayer.accountId));

    expect(fee).to.equal(gasUsed * networkGasPrice);
    expect(senderDelta + relayerDelta).to.equal(fee);
    expect(senderDelta > 0n, "the sender share must be paid").to.be.true;
    expect(relayerDelta > 0n, "the relayer share must be paid").to.be.true;
    expect(await storedValue()).to.equal(SEPARATE_RELAYER_VALUE);
    expect(await ethereumNonceOf(wallet.accountId)).to.equal(1);

    // Not `expect(selfRelayedFee).to.not.equal(null)`: hardhat-chai-matchers overrides `equal` to
    // normalize both sides to BigInt, and it cannot normalize null against a BigInt target (HH17).
    expect(
      selfRelayedFee !== null,
      "the self-relayed case must have recorded its fee",
    ).to.be.true;
    // The premise of the comparison below: both calls did exactly the same work. Each writes a
    // different non-zero value to an already non-zero slot, so their gas costs match.
    expect(
      gasUsed,
      "both calls must consume the same gas for the fee comparison to mean anything",
    ).to.equal(selfRelayedGasUsed);
    expect(fee).to.equal(selfRelayedFee);
  });
});
