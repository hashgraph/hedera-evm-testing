## System contracts testing

## Run tests

### Requirements
- `npm install --save-dev hardhat`

### Run
- `npx hardhat coverage`
- `npx hardhat test`

### Run with local Hedera Network (using solo)
`npx hardhat test --network local`

Example update here

## Run solo

### Requirements
- Software https://solo.hiero.org/v0.42.0/docs/step-by-step-guide/#required-software
- Solo https://solo.hiero.org/v0.42.0/docs/step-by-step-guide/#1-installing-solo

### Documentation
- Doc: https://solo.hiero.org/v0.42.0/docs/step-by-step-guide/
- Doc with local consensus node build: https://solo.hiero.org/v0.42.0/docs/platform-developer/

### Deploy manual 
With 'local build' consensus node From https://solo.hiero.org/v0.42.0/docs/platform-developer/)

`./test.sh solo start`

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
```
kubectl exec -it -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') -c root-container svc/network-node1 -- tail -f /opt/hgcapp/services-hedera/HapiApp2.0/output/hgcaa.log /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log
```

#### Relay Logs
```
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-node1
```

#### Relay WS Logs
```
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-node1-ws
```
### Destroy
`./test.sh solo stop`

### Force Destroy
`./test.sh solo destroy`

## Run EVM execution spec tests

### Requirements

- pull repo / install `uv`. See: https://github.com/ethereum/execution-spec-tests?tab=readme-ov-file#installation

### Run testnet
```
uv run execute remote -v --fork=Shanghai --rpc-endpoint=https://testnet.hashio.io/api --rpc-seed-key={your_key} --rpc-chain-id 296 ./tests/shanghai/eip3855_push0/test_push0.py::test_push0_contracts --sender-funding-txs-gas-price 710000000000 --default-gas-price 710000000000 --sender-fund-refund-gas-limit 1000000 --seed-account-sweep-amount 100000000000000000000
```

### Run local solo net
Shanghai: (with https://github.com/gkozyryatskyy/execution-spec-tests/tree/quest-fight-against-nexus-king-salhadaar)
```
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