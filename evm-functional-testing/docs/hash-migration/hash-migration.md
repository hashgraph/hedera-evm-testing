# Hash Migration: EVM State and Block Hashes Across the SHA-384 to SHA-256 Upgrade

## Overview

The consensus node moves from SHA-384 to SHA-256 in two releases:

1. **The SHA-256 switch.** The node hashes its state and its block stream with SHA-256. Record files keep their SHA-384 hashes, so the block hashes users see (relay, mirror node, `blockhash()`) do not change yet.
2. **The block stream cutover.** Record files stop. Blocks go only to Block Nodes, signed by the network (TSS), and the mirror node reads them from there. From the cutover on, the block hashes users see are SHA-256 (32 bytes) block hashes.

This suite checks that EVM state and block hashes survive both steps: it fills a network with EVM data, upgrades it in place, and verifies that everything written before the upgrade reads back the same and still works.

## The Two Variants

|                   | Record stream upgrade                                                          | Block stream upgrade                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Script            | `scripts/hash-migration/record-stream-upgrade.sh`                              | `scripts/hash-migration/block-stream-upgrade.sh`                                                                       |
| Starts on         | A released consensus node that hashes with SHA-384                             | A consensus node that hashes with SHA-256, from genesis                                                                |
| Upgrade           | In place to the SHA-256 consensus node                                         | Same consensus node, configured for the cutover                                                                        |
| Mirror node reads | Record files from the bucket, before and after                                 | Record files before the cutover, blocks from the Block Node after it                                                   |
| Block Node        | None                                                                           | Added before the cutover                                                                                               |
| Covers            | The state re-hash: state, contracts, tokens and stored block hashes survive it | The block hash change users see: SHA-384 record hashes up to the cutover, SHA-256 block hashes after it, without a gap |

A single network cannot go through both steps today. A network with SHA-384 history needs its wrapped record chain computed offline (the "jumpstart") before the cutover, and the first block after the cutover would then link to a 48-byte hash, which Block Nodes that use SHA-256 reject. The block stream variant therefore starts on SHA-256, so its wrapped record chain is built live from block 0.

## How a Run Works

Each script runs in phases: `deploy | populate | upgrade | verify | collect | destroy`, or `all` for the first four followed by `collect`.

1. **deploy** creates a Kind cluster and deploys with Solo a single consensus node, a mirror node and a relay, plus three funded ECDSA test accounts. The consensus node runs with `blockStream.streamMode=BOTH` (record files and blocks), as networks do until the cutover.
2. **populate** runs `test/hash-migration/01-populate.test.js`. It writes EVM data of every kind and saves what it wrote, as read through the relay, the mirror node and the consensus node, to `hash-migration-snapshot.json`.
3. **upgrade** upgrades the consensus node in place and waits until the network executes transactions again.
4. **verify** runs `test/hash-migration/02-verify.test.js`. It compares the upgraded network with the snapshot and checks that the old data still works with new transactions.
5. **collect** copies the snapshot and the logs of every pod to the results folder. It never fails.
6. **destroy** deletes the Kind cluster.

The block stream variant only differs in **deploy** and **upgrade**. It runs the other phases through the record stream script.

### Checks in the Scripts

Besides the tests, the scripts stop the run when the network is not in the expected state:

- **Both variants:** `streamMode` and `writerMode` the consensus node runs with, read from its log.
- **Record stream upgrade:**
  - the running consensus node jar is the built one, when upgrading to a source build
  - the latest state root hash has 256 bits (`EXPECT_STATE_HASH_BITS`)
- **Block stream upgrade:**
  - the state root hash has 256 bits, before and after the cutover
  - the network published its ledger id (TSS)
  - the Block Node loaded the ledger id and the consensus node streams to it
  - after the cutover: `streamMode=BLOCKS`, `writerMode=GRPC`, `enableCutover=true`
  - the mirror node imports blocks from the Block Node, with SHA-384 hashes up to the cutover and SHA-256 hashes after it, without a missing block (`check-mirror-node-cutover.js`)

### The Block Node and the Ledger Id

The Block Node joins a running network, so it never sees the ledger id the network published at genesis. It needs the ledger id to verify the TSS signatures blocks carry after the cutover. The upgrade phase reads the block files from the MinIO bucket, finds the ledger id publication with `extract-ledger-id.py`, copies it into the Block Node and restarts it. `extract-ledger-id.py` is copied without changes from the consensus node team's cutover scripts (source at the end of the file).

## Testing Scope

Every value is read through the relay, and where possible also through the mirror node and the consensus node (SDK), before and after the upgrade.

- **Storage** (`ValueStorage`, `CollectionStorage`, `LargeStorage`): every Solidity value type, mappings, arrays, structs, packed and cleared slots, and a contract with many entries. The raw storage slots, the getter values and the code must match, and new writes must work. Transient storage must stay empty between transactions.
- **Contract lifecycle** (`LifecycleFactory`): `CREATE` addresses that follow the factory's nonce, `CREATE2` addresses, a `CREATE2` address taken before the upgrade, `SELFDESTRUCT`, calls between contracts created before and after the upgrade.
- **Accounts:** code, code hash, balance and nonce of every contract. Contracts deployed through the SDK with and without an admin key. An account with a nonzero nonce, a hollow account, and an EIP-7702 delegated account.
- **HTS tokens:** a fungible token and an NFT created through the HTS system contract with custom fees, with balances, allowances, approvals, frozen accounts and associations.
- **ERC tokens and events:** ERC20, ERC721 and ERC1155 contracts, and their `Transfer` events found by event signature.
- **SDK entry point:** contract calls, contract creation and token transfers sent through the SDK instead of the relay.
- **History:** every transaction populate sent returns the same transaction, receipt and logs, and old blocks are found by their hash.
- **Block hashes** (`BlockHashProbe`):
  - `blockhash()` in a new transaction returns the same hashes for old blocks
  - the blocks before and after the upgrade link without a gap
  - the 256-block window holds the right hashes while it reaches back past the upgrade, and once it holds only new blocks
  - every block hash matches the relay and the mirror node

## Running on CI

The workflow `.github/workflows/hash-migration.yaml` runs both variants as two jobs:

- **On pull requests** that change the workflow, `test/hash-migration`, `contracts/hash-migration`, `scripts/hash-migration` or `local`, with the scripts' default versions.
- **Manually** (`workflow_dispatch`), with inputs for the versions of the consensus node to start from, the mirror nodes, the Block Node, the relay and Solo. An empty input uses the script's default.

Both jobs can build the consensus node from source, each at a commit pinned in the workflow and changed by hand:

- `CONSENSUS_NODE_TO_REF`: the record stream upgrade's target, until a consensus node release hashes with SHA-256. The `consensus-node-to` input is not used while it is set; removing it upgrades to that release instead.
- `BLOCK_STREAM_CONSENSUS_NODE_REF`: the consensus node the block stream upgrade runs. That variant always runs a build, so this pin is always set.

Each job uploads its results folder as an artifact, also when it fails: the snapshot, the populate, upgrade and verify logs, the logs of every pod, and the consensus node's own log files (`consensus-node-output.tgz`).

## Running Locally

### Requirements

- Docker with enough CPU and memory for a Kind cluster with a consensus node, a mirror node, a relay and, for the block stream variant, a Block Node. On machines with few cores the network answers slowly, which makes reads time out.
- [Solo](https://solo.hiero.org/docs/simple-solo-setup/quickstart/#install-solo-cli), `kind`, `kubectl`, Node.js and the npm dependencies (`npm ci`)
- For the block stream variant also `python3`, `openssl` and `curl`.
- A consensus node built from source: always for the block stream variant, and for the record stream variant while no release hashes with SHA-256:

```sh
git clone https://github.com/hiero-ledger/hiero-consensus-node
cd hiero-consensus-node
git checkout <CONSENSUS_NODE_TO_REF or BLOCK_STREAM_CONSENSUS_NODE_REF from the workflow>
./gradlew assemble
export CONSENSUS_NODE_BUILD="$PWD/hedera-node/data"
```

### Run

From `evm-functional-testing`:

```sh
# Record stream upgrade: released consensus node -> the SHA-256 build
CONSENSUS_NODE_TO_BUILD="$CONSENSUS_NODE_BUILD" scripts/hash-migration/record-stream-upgrade.sh all
scripts/hash-migration/record-stream-upgrade.sh destroy

# Block stream upgrade: the SHA-256 build, cut over to the block stream
scripts/hash-migration/block-stream-upgrade.sh all
scripts/hash-migration/block-stream-upgrade.sh destroy
```

A phase can also run alone, e.g. to verify again after a failure: `scripts/hash-migration/block-stream-upgrade.sh verify`. Both variants use the same cluster name, so destroy one before starting the other.

While a network is up, the relay is on `localhost:37546` (the `solo` Hardhat network) and the mirror node on `localhost:38081`.

### Settings

Every setting is an environment variable with a default at the top of the script. The version defaults live only there.

| Variable                  | Variant       | Meaning                                                         |
| ------------------------- | ------------- | --------------------------------------------------------------- |
| `CONSENSUS_NODE_FROM`     | record stream | Released consensus node to deploy and populate                  |
| `CONSENSUS_NODE_TO`       | record stream | Released consensus node to upgrade to                           |
| `CONSENSUS_NODE_TO_BUILD` | record stream | Consensus node build to upgrade to instead (`hedera-node/data`) |
| `EXPECT_STATE_HASH_BITS`  | record stream | State root hash size the upgraded node must have, default `256` |
| `CONSENSUS_NODE_BUILD`    | block stream  | Consensus node build to run (`hedera-node/data`), required      |
| `BLOCK_NODE_VERSION`      | block stream  | Block Node chart version                                        |
| `MIRROR_NODE_VERSION`     | both          | Mirror node version                                             |
| `RELAY_RELEASE`           | both          | Relay version                                                   |
| `SOLO`                    | both          | Solo command, e.g. `npx -y @hashgraph/solo@<version>`           |
| `RESULTS_DIR`             | both          | Results folder, default `hash-migration-results`                |
| `WRAPS_CORES`             | block stream  | Cores of the TSS (WRAPS) prover at genesis                      |

The Solo names (cluster, namespace, deployment) and the config files (`local/application.properties`, `local/mn-values.yaml`, `local/relay-values.yaml`) can be overridden the same way.

## Choosing Versions

- **Record stream upgrade:** any consensus node release that hashes with SHA-384 can be the starting point; the closest to reality is the version mainnet runs. The mirror node only reads record files, so any recent release works.
- **Block stream upgrade:** the consensus node, the Block Node and the mirror node must be able to read each other's TSS signatures and proofs. They use the TSS library (`hedera-cryptography`), whose proof format has changed between versions. Before changing one of the three, compare the `hedera-cryptography` version each one depends on (`hiero-dependency-versions/build.gradle.kts` in the consensus node and the Block Node, `build.gradle.kts` in the mirror node) and pick versions with the same proof format. A new format can also change the ledger id publication, which then needs a new `extract-ledger-id.py` from the consensus node team's cutover scripts.
