# ETH Validation — Contract Lifecycle & Call Semantics Testing

## Overview

Unlike the feature/HIP-specific suites in this project (HIP-632, HIP-1215, HIP-1340, EIP-2930, HTS transfer events), this suite verifies that the network cleanly supports **fundamental EVM behavior**: contract deployment lifecycle, in-EVM contract creation (`CREATE`/`CREATE2`), and call semantics (`CALL`/`DELEGATECALL`/`STATICCALL`).

Every test is asserted for **Ethereum parity**: the same network-agnostic test bodies run against Hedera (`solo`), a reference `geth` node, and Hardhat's in-process EVM. A green run with identical passing/pending counts across all three networks is the proof that core EVM lifecycle and call behavior on Hedera matches Ethereum.

### Zero gas price

On Hedera the suite runs **end-to-end at a zero gas price**: setting `EVM_ZERO_GAS_PRICE=true` makes the `solo` network submit every transaction — deployments and calls alike — with `gasPrice: 0` (see `hardhat.config.js`). For those transactions to be accepted and executed, the network must be started in a matching mode:

- **Consensus node** with `local/zero-fees.properties` (`fees.simpleFeesAreFree=true`), so a zero-gas-price transaction incurs no fee and is not rejected for an insufficient fee.
- **Relay** with `local/relay-zero-gas-values.yaml`, which enables the paymaster wildcard whitelist (`PAYMASTER_ENABLED=true`, `PAYMASTER_WHITELIST=["*"]`) — without a paymaster match, the relay's precheck rejects any gas price below the network minimum (`GAS_PRICE_TOO_LOW`). `MAX_GAS_ALLOWANCE_HBAR` stays `"0"`, so the relay never subsidizes anything: the transactions are free because the consensus node charges no fee, not because the relay operator pays.

`test.sh` wires both up: `EVM_ZERO_GAS_PRICE=true ./test.sh solo start` starts the consensus node with `zero-fees.properties` and the relay with `relay-zero-gas-values.yaml`. The CI eth-validation shards do the same. The reference EVMs reject a gas price below the block base fee, so they always run at their normal (base-fee) price; because none of the assertions depend on the gas price, the parity comparison still holds. See the divergence note below.

## Run Tests

```sh
# Hedera solo — start the network in zero-gas-price mode first (consensus node with
# zero-fees.properties, relay with relay-zero-gas-values.yaml):
EVM_ZERO_GAS_PRICE=true ./test.sh solo start
# then run the whole suite at zero gas price:
EVM_ZERO_GAS_PRICE=true npx hardhat test test/eth-validation/*.test.js --network solo

# Reference Ethereum EVMs (normal fee data; do NOT set EVM_ZERO_GAS_PRICE)
npx hardhat test test/eth-validation/*.test.js --network hardhat
npx hardhat test test/eth-validation/*.test.js --network geth
```

All three runs must report the same set of passing tests and the same pending (`xit`) tests. For a strict check, diff the `passes`/`pending` titles of `--reporter json` output across the three networks.

`self-relay-gas-sdk.test.js` is the one exception, and it does not disturb that comparison: it asserts *how much* gas an `EthereumTransaction` is charged, so it needs the network to actually charge fees. It skips itself in zero-gas-price mode and on the reference EVMs, i.e. it is pending in all three runs above, and it is run separately against a **normal-fee** network:

```sh
# Hedera solo — normal fees (default application.properties + relay-values.yaml)
./test.sh solo start
npx hardhat test test/eth-validation/self-relay-gas-sdk.test.js --network solo
```

## Testing Scope

- **Contract deployment lifecycle** (`deployment.test.js`) — constructor arguments, payable/reverting/non-payable constructors, runtime code presence and `EXTCODESIZE` consistency, no code left behind after failed deployments
- **In-EVM creation** (`create-create2.test.js`) — `CREATE` address derivation from deployer nonce, `CREATE2` (EIP-1014) address determinism verified on-chain and off-chain, address collisions, reverting init code
- **Call semantics** (`call-semantics.test.js`) — storage context, `msg.sender`/`tx.origin`/`msg.value` propagation and preservation across `CALL`/`DELEGATECALL`/`STATICCALL`, value forwarding, multi-hop return data, revert data bubbling, static-context write protection
- **Call edge cases** (`call-edge-cases.test.js`) — calls into EOAs and non-existent accounts, exact value transfer to EOAs, behavioral gas forwarding (63/64), bounded and guarded reentrancy, deeply nested call chains, gas-starved inner calls
- **Zero gas price** (`zero-gas-price.test.js`) — value transfer, contract call and contract deployment submitted with `gasPrice: 0`; asserts Hedera accepts and executes them normally, and asserts the divergent rejection on the reference EVMs (see below)
- **Self-relayed gas charging** (`self-relay-gas-sdk.test.js`) — an `EthereumTransaction` splits its gas cost between the ECDSA sender recovered from the inner signature and the outer HAPI payer (the "relayer") whenever the offered gas price is below the network gas price. When both roles resolve to the *same* account, the two shares are debited from one balance; this suite covers what that account is charged. It asserts that a self-relayed call pays the full network price of every gas unit it consumes — the same total as an equivalent call made with a separate relayer — and that when the single balance cannot cover the two shares combined the call is rejected with `INSUFFICIENT_PAYER_BALANCE`, changing no state, consuming no nonce and collecting no gas. Hedera-only and SDK-only: over the JSON-RPC relay the HAPI payer is the relay's own operator, so sender ≠ relayer, and making them coincide there would mean signing the inner transaction with the relay operator's key, which callers of the relay do not have. On `solo` they cannot coincide even by accident, because solo deploys the relay with `OPERATOR_ID_MAIN = 0.0.2`, an ED25519 account with no EVM alias that can never be the recovered sender of an EIP-1559 signature. The shape is therefore only expressible by submitting the `EthereumTransaction` yourself through the SDK. See the run note above for why it needs normal-fee mode

## Out of Scope — Known Hedera Divergences

The following are intentionally **not** asserted (marked `xit`/pending where a placeholder test exists), because Hedera's architecture diverges from Ethereum by design:

- **`SELFDESTRUCT` semantics** — post-Cancun (EIP-6780) `SELFDESTRUCT` outside the creation transaction no longer removes the account on Ethereum, so cross-transaction redeploy-to-same-address is not testable at all. The same-transaction path (create + `SELFDESTRUCT` in one transaction, which still removes the account under EIP-6780) **is** asserted in `create-create2.test.js` and Hedera consensus honors it — the `CREATE2` address is freed and reused. The `eth_getCode` checks are asserted on Ethereum networks only: Hedera's mirror node does not reflect the same-transaction destruction (the entity stays `deleted: false` and its old bytecode keeps being served), and after the address is reused its code view for that address becomes unreliable
- **Exact gas schedule** — precise 63/64 forwarded-gas amounts and the exact 1024 call-depth boundary depend on Hedera's gas schedule; only behavioral outcomes (inner call succeeds/fails) are asserted
- **Address aliasing / long-zero forms** — only EVM addresses observed from receipts and events are asserted
- **Sub-tinybar value transfers** — Hedera's value granularity is 1 tinybar (`1e10` wei), so all value amounts in the suite are tinybar-aligned via the `tinybarValue()` helper
- **EVM-internal value denomination** — inside Hedera's EVM, `msg.value` and `address(this).balance` are denominated in tinybars, while JSON-RPC speaks weibars; assertions on values read back from contract storage convert via the `evmScale()` helper so the same test body asserts wei on Ethereum and tinybars on Hedera
- **`eth_estimateGas` for value-bearing deployments** — the relay's estimate does not account for the attached value, so a contract creation with value run at the estimated limit fails with `INSUFFICIENT_GAS`; the payable-constructor test passes an explicit `gasLimit` instead of relying on estimation
- **Reserved system-contract/precompile address ranges** (`0x167`, `0x16b`, low long-zero addresses) — empty-account call cases use random 20-byte addresses well outside these ranges
- **Zero gas price** — a state-changing transaction whose offered gas price is zero is accepted and executed on Hedera when the network is started in zero-gas-price mode: the consensus node with `local/zero-fees.properties` (`fees.simpleFeesAreFree=true`, so the transaction incurs no fee) and the relay with `local/relay-zero-gas-values.yaml` (paymaster wildcard whitelist so the below-minimum gas price passes the relay precheck, with `MAX_GAS_ALLOWANCE_HBAR="0"` so nothing is ever relay-subsidized). `test.sh` and the CI eth-validation shards wire both up. Ethereum reference EVMs reject any transaction whose gas price is below the current block base fee. `zero-gas-price.test.js` keeps one network-agnostic body green across all three networks by asserting the accepted-and-executed outcome on Hedera and the rejection on Ethereum networks (via `isEthNetwork()`); the `ZERO_GAS_PRICE` helper documents the shared constant
