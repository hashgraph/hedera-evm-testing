# ETH Validation — Contract Lifecycle & Call Semantics Testing

## Overview

Unlike the feature/HIP-specific suites in this project (HIP-632, HIP-1215, HIP-1340, EIP-2930, HTS transfer events), this suite verifies that the network cleanly supports **fundamental EVM behavior**: contract deployment lifecycle, in-EVM contract creation (`CREATE`/`CREATE2`), and call semantics (`CALL`/`DELEGATECALL`/`STATICCALL`).

Every test is asserted for **Ethereum parity**: the same network-agnostic test bodies run against Hedera (`solo`), a reference `geth` node, and Hardhat's in-process EVM. A green run with identical passing/pending counts across all three networks is the proof that core EVM lifecycle and call behavior on Hedera matches Ethereum.

## Run Tests

```sh
# Hedera solo (default network)
npx hardhat test test/eth-validation/*.test.js --network solo

# Reference Ethereum EVMs
npx hardhat test test/eth-validation/*.test.js --network hardhat
npx hardhat test test/eth-validation/*.test.js --network geth
```

All three runs must report the same set of passing tests and the same pending (`xit`) tests. For a strict check, diff the `passes`/`pending` titles of `--reporter json` output across the three networks.

## Testing Scope

- **Contract deployment lifecycle** (`deployment.test.js`) — constructor arguments, payable/reverting/non-payable constructors, runtime code presence and `EXTCODESIZE` consistency, no code left behind after failed deployments
- **In-EVM creation** (`create-create2.test.js`) — `CREATE` address derivation from deployer nonce, `CREATE2` (EIP-1014) address determinism verified on-chain and off-chain, address collisions, reverting init code
- **Call semantics** (`call-semantics.test.js`) — storage context, `msg.sender`/`tx.origin`/`msg.value` propagation and preservation across `CALL`/`DELEGATECALL`/`STATICCALL`, value forwarding, multi-hop return data, revert data bubbling, static-context write protection
- **Call edge cases** (`call-edge-cases.test.js`) — calls into EOAs and non-existent accounts, exact value transfer to EOAs, behavioral gas forwarding (63/64), bounded and guarded reentrancy, deeply nested call chains, gas-starved inner calls

## Out of Scope — Known Hedera Divergences

The following are intentionally **not** asserted (marked `xit`/pending where a placeholder test exists), because Hedera's architecture diverges from Ethereum by design:

- **`SELFDESTRUCT` semantics** — post-Cancun (EIP-6780) `SELFDESTRUCT` outside the creation transaction no longer removes the account on Ethereum, so cross-transaction redeploy-to-same-address is not testable at all. The same-transaction path (create + `SELFDESTRUCT` in one transaction, which still removes the account under EIP-6780) **is** asserted in `create-create2.test.js` and Hedera consensus honors it — the `CREATE2` address is freed and reused. The `eth_getCode` checks are asserted on Ethereum networks only: Hedera's mirror node does not reflect the same-transaction destruction (the entity stays `deleted: false` and its old bytecode keeps being served), and after the address is reused its code view for that address becomes unreliable
- **Exact gas schedule** — precise 63/64 forwarded-gas amounts and the exact 1024 call-depth boundary depend on Hedera's gas schedule; only behavioral outcomes (inner call succeeds/fails) are asserted
- **Address aliasing / long-zero forms** — only EVM addresses observed from receipts and events are asserted
- **Sub-tinybar value transfers** — Hedera's value granularity is 1 tinybar (`1e10` wei), so all value amounts in the suite are tinybar-aligned via the `tinybarValue()` helper
- **EVM-internal value denomination** — inside Hedera's EVM, `msg.value` and `address(this).balance` are denominated in tinybars, while JSON-RPC speaks weibars; assertions on values read back from contract storage convert via the `evmScale()` helper so the same test body asserts wei on Ethereum and tinybars on Hedera
- **`eth_estimateGas` for value-bearing deployments** — the relay's estimate does not account for the attached value, so a contract creation with value run at the estimated limit fails with `INSUFFICIENT_GAS`; the payable-constructor test passes an explicit `gasLimit` instead of relying on estimation
- **Reserved system-contract/precompile address ranges** (`0x167`, `0x16b`, low long-zero addresses) — empty-account call cases use random 20-byte addresses well outside these ranges
