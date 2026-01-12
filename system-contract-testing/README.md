# Hiero's EVM Functional Testing

## Requirements

- `node` >= 22
- `npm`

## Install

```sh
npm ci
```

## Run tests

```sh
npx hardhat test
```

### Run with local Hiero Network using Solo

```sh
npx hardhat test --network local
```

## Run Solo

### Requirements

- Software <https://solo.hiero.org/v0.48.0/docs/step-by-step-guide/#required-software>
- Solo <https://solo.hiero.org/v0.48.0/docs/step-by-step-guide/#1-installing-solo>

### Documentation

- Doc: <https://solo.hiero.org/v0.48.0/docs/step-by-step-guide/>
- Doc with local consensus node build: <https://solo.hiero.org/v0.48.0/docs/platform-developer/>

### Specific Solo version install

```sh
npm install -g @hashgraph/solo@0.48.0
```

### Deploy manual

With 'local build' consensus node from <https://solo.hiero.org/v0.48.0/docs/platform-developer/>

```sh
./test.sh solo start
```

### Deploy quick (!!! do not use)

With 'release' version. !!! This should not be used. Added as an example !!!

```bash
solo quick-start single deploy --cluster-ref="kind-${SOLO_CLUSTER_NAME}" --cluster-setup-namespace="${SOLO_CLUSTER_SETUP_NAMESPACE}" --deployment="${SOLO_DEPLOYMENT}" --namespace="${SOLO_NAMESPACE}"
```

- Consensus Node gRPC port forward enabled on `localhost:50211`
- Mirror Node port forward enabled on `localhost:8081`
- Explorer port forward enabled on `http://localhost:8080`
- JSON RPC Relay forward enabled on `localhost:7546`

### Logs

If you need to stream the logs directly from the pods you can use the following:

#### Consensus Node Logs

```sh
kubectl exec -it -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') -c root-container svc/network-node1 -- tail -f /opt/hgcapp/services-hedera/HapiApp2.0/output/hgcaa.log /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log
```

#### Relay Logs

```sh
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-node1
```

#### Relay WS Logs

```sh
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-node1-ws
```

### Destroy

```sh
./test.sh solo stop
```

### Force Destroy

```sh
./test.sh solo destroy
```

## Run EVM execution spec tests

### Requirements

- pull repo / install `uv`. See: <https://github.com/ethereum/execution-spec-tests?tab=readme-ov-file#installation>

### Run testnet

```sh
uv run execute remote -v --fork=Shanghai --rpc-endpoint=https://testnet.hashio.io/api --rpc-seed-key={your_key} --rpc-chain-id 296 ./tests/shanghai/eip3855_push0/test_push0.py::test_push0_contracts --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000
```

### Run local solo net

Shanghai: (with <https://github.com/gkozyryatskyy/execution-spec-tests/tree/quest-fight-against-nexus-king-salhadaar>)

```sh
# test_push0.py::test_push0_contracts
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3855_push0/test_push0.py::test_push0_contracts --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000
# test_push0.py
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3855_push0/test_push0.py --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000
# test_initcode.py::test_contract_creating_tx
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3860_initcode/test_initcode.py::test_contract_creating_tx --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000 --eoa-fund-amount-default=2000000000000000000
# test_initcode.py::test_gas_usage
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3860_initcode/test_initcode.py::TestContractCreationGasUsage::test_gas_usage --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000 --eoa-fund-amount-default=2000000000000000000
# test_initcode.py::TestCreateInitcode
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3860_initcode/test_initcode.py::TestCreateInitcode --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000 --eoa-fund-amount-default=8000000000000000000
# test_with_eof.py::test_legacy_create_edge_code_size
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/eip3860_initcode/test_with_eof.py::test_legacy_create_edge_code_size --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000 --eoa-fund-amount-default=8000000000000000000
# ./tests/shanghai/
uv run execute remote -v --fork=Shanghai --rpc-endpoint=http://localhost:7546/ --rpc-seed-key=0xde78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68 --rpc-chain-id 298 ./tests/shanghai/ --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 200000000000000000000 --eoa-fund-amount-default=8000000000000000000
```

## HIP-1340: EOA Code Delegation

### Overview

These tests extend the Ethereum specification tests to validate the Pectra Upgrade in the context of the Hiero ecosystem.
We include tests for the EIPs implemented as part of the Pectra Upgrade in Hiero.
That is,
[EIP-7702: Set Code for EOAs](https://eips.ethereum.org/EIPS/eip-7702),
[EIP-7623: Increase calldata cost](https://eips.ethereum.org/EIPS/eip-7623) and
[EIP-2537: Precompile for BLS12-381 curve operations](https://eips.ethereum.org/EIPS/eip-2537).

Throughout the tests for EIP-7702, we use Smart Wallet contracts, which have the ability to execute multiple transactions (method calls) dynamically based on the calldata.
For example, Smart Wallet contract can be either <https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/accounts/Simple7702Account.sol> or <https://github.com/AmbireTech/wallet/blob/main/contracts/AmbireAccount.sol>.
These kind of Smart Wallets have the ability to send transactions through contract methods like `execute` and `executeBatch`.
Note that this includes the ability to call Hiero’s System Contracts as well, e.g., HTS method calls.

### Run Tests

> [!NOTE]
> At the moment, you can run tests against an Ethereum client until the Pectra upgrade is released.
> For example, you can run Geth client in another terminal with
>
> ```sh
> docker run -p 8545:8545 --rm ethereum/client-go --dev --verbosity 4 --http --http.api eth,web3,net,debug --http.addr 0.0.0.0
> ```

```sh
npm run test:hip-1340
```

#### Run Tests with logging enabled

You can also run tests with logging enabled.
This uses Node.js's built-in `debuglog` utility to provide
conditional debugging output based on the `NODE_DEBUG` environment variable.
That is, to enable debug output, set `NODE_DEBUG=hip-1340` when running the tests, for example

```sh
NODE_DEBUG=hip-1340 npm test
```

Note that the output might be considerably large with logging enabled.
You may want to filter tests to be executed by either using Mocha's `--grep` flag or `.only` modifier in source code.
For more details see [`util.debuglog(section[, callback])`](https://nodejs.org/api/util.html#utildebuglogsection-callback) in Node.js's documentation.

### Development

The tests _only_ use Ethers.js to send Ethereum transactions to the network.
Thus, to compile the contracts we could use either Foundry, Hardhat, or even `solc` directly.
Given Foundry does not need to be added to the lock file and does not pollute the project, we use this option to compile the contracts.
Note that `forge build` is automatically executed before running tests.

We use the Smart Wallet implementation from <https://github.com/eth-infinitism/account-abstraction>.
In particular, `@account-abstraction/contracts/accounts/Simple7702Account.sol` which allow us to execute transactions dynamically based on calldata.

> [!NOTE]
> The sole purpose of the `Wrapper` contract is to `import` contracts that are used directly in tests as artifacts.
> Without `import`ing them, these contracts are not compiled, thus they will not appear as artifacts in the `out/` folder.
