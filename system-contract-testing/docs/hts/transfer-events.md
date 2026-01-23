# HTS (Hedera Token Service) System contract testing. Transfer events tests

## Overview
The primary purpose of these tests is to validate the emission of canonical Transfer events within the HTS System Contract (addresses `0x167` and `0x16c`).
Historically, several HTS transfer functions (such as `cryptoTransfer`, `transferToken`, and batch operations) did not emit standard EVM events. This created visibility gaps for dApps, indexers, and explorers. These tests ensure that every successful non-HBAR token movement—whether triggered via native HTS calls or ERC-20/721 proxies—generates a logs-compliant Transfer event. This is critical for:
- Observability: Allowing services and explorers to track token movements.
- Interoperability: Ensuring existing EVM tools and indexers can "see" Hedera native token movements without custom logic.
- Backward Compatibility: Allowing legacy contracts to maintain state accuracy without redeployment.

## Run Tests
EVM Integration Tests: Execute via Hardhat to verify Relay and SDK visibility.
```sh
npx hardhat test --network local --grep "HTS System Contract testing. ERC Transfer events tests"
```

## Testing Scope