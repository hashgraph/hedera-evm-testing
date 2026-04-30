# EIP-2930 Access List Testing

## Overview

[EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) introduces transactions with an optional `accessList` field — a list of addresses and storage keys the transaction plans to access. Pre-declaring these slots warms them up before execution, reducing gas costs per EIP-2929 warm/cold pricing rules.

The goal of the EVM tests is to verify that gas consumed during contract calls aligns with the EIP-2930 protocol requirements. This is achieved by developing test contracts that execute various functional scenarios and asserting that the actual gas usage matches the expected warm and cold rates defined by the specification.

## Run Tests

EVM Integration Tests: Execute via Hardhat to verify Access List support over Relay.

```sh
npx hardhat test --network solo --grep "EIP-2930 AccessList testing"
```

## Testing Scope

- **Intrinsic gas accounting** — additional gas charges per address (`2400`) and per storage key (`1900`) provided in the access list, including duplicate entries
- **Warm slot discounts** — reduced gas for `SLOAD`/`SSTORE` operations on addresses and storage keys pre-declared in the access list
- **Sub-call warming** — access list warmth must propagate correctly into internal calls (`CALL`, `DELEGATECALL`, `STATICCALL`)
- **Hedera precompile addresses** — behavior when a precompile address appears in the access list; standard intrinsic charge must apply and the call must be treated as warm
- **`eth_estimateGas` with access list** — estimate must reflect the higher intrinsic cost offset by execution gas savings compared to the same call without an access list
- **`eth_call` output consistency** — returned data must be identical regardless of whether the access list is correct, incorrect, or empty, confirming that `accessList` affects only gas, not execution logic
- **Out-of-gas rejection** — transactions where the access list intrinsic cost alone exhausts the provided gas limit must be rejected before execution begins
