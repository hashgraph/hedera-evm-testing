# HTS (Hedera Token Service) System contract testing. Transfer events tests

## Overview

The primary purpose of these tests is to validate the emission of canonical Transfer events within the HTS System
Contract (addresses `0x167` and `0x16c`).
Historically, several HTS transfer functions (such as `cryptoTransfer`, `transferToken`, and batch operations) did not
emit standard EVM events. This created visibility gaps for dApps, indexers, and explorers. These tests ensure that every
successful non-HBAR token movement—whether triggered via native HTS calls or ERC-20/721 proxies—generates a
logs-compliant Transfer event. This is critical for:

- Observability: Allowing services and explorers to track token movements.
- Interoperability: Ensuring existing EVM tools and indexers can "see" Hedera native token movements without custom
  logic.
- Backward Compatibility: Allowing legacy contracts to maintain state accuracy without redeployment.

## Run Tests

EVM Integration Tests: Execute via Hardhat to verify Relay and SDK visibility.

```sh
npx hardhat test --network local --grep "HTS System Contract testing. ERC Transfer events tests"
```

## Testing Scope

The testing scope covers 15+ function signatures, ensuring parity between Fungible (FT) and Non-Fungible (NFT) tokens.

1. Standard & Proxy Transfers (Positive Cases). Verifying that both direct HTS calls and ERC-proxy calls trigger the expected logs.
   - Proxy `transfer` & `transferFrom`: Verify the caller or approved spender correctly triggers a `Transfer` log.
   - Classic `transferToken` / `transferNFT`: Confirm these non-ERC functions now emit the standard event.
2. Batch & Complex Logic. This is the highest-risk area where a single transaction triggers multiple movements.
   - `cryptoTransfer` (v1 & v2): * Test multi-token lists.
     - Crucial: Verify HBAR transfers in the same list do not emit a `Transfer` event.
   - Batch Functions: `transferTokens` and `transferNFTs` must emit a distinct event for every array element.
   - Airdrops: `airdropTokens`: Verify event emission for Direct Airdrops.
     - `claimAirdrops`: Verify event is emitted only upon successful claim (movement to claimant).
3. Negative & Boundary Scenarios
   - Classic, Proxy, Batch Functions negative cases with `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`

### Testing Scope Table
| Type           | HTS              | Scope                  | Token                                  | Function                |
|----------------|------------------|------------------------|----------------------------------------|-------------------------|
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`                       | `transferToken`         |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`                       | `transferFrom`          |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`                       | `proxy transfer`        |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`                       | `proxy transferFrom`    |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`                       | `transferTokens`        |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Non-Fungable Token`                   | `transferNFT`           |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Non-Fungable Token`                   | `transferFromNFT`       |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Non-Fungable Token`                   | `proxy transferFromNft` |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Non-Fungable Token`                   | `transferNFTsTest`      |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`, `Non-Fungable Token` | `cryptoTransferV1`      |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`, `negative` | `Fungable Token`, `Non-Fungable Token` | `cryptoTransferV2`      |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`             | `Fungable Token`, `Non-Fungable Token` | `airdropTokens`         |
| `Relay`, `SDK` | `0x167`, `0x16c` | `positive`             | `Fungable Token`, `Non-Fungable Token` | `claimAirdrops`         |
