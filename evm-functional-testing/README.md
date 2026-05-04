## EVM functional testing

The Hedera network utilizes System Contracts at a reserved contract address on the EVM to surface HAPI service functionality through EVM-processed transactions. These System Contracts behave like precompiled contracts whose function selectors are mapped directly to defined native network logic (HAPI services). In this way, EVM users can utilize exposed HAPI features natively in their smart contracts.

The folder contains:
- Hiero Improvement Proposals (HIP) functional, end-to-end, integration testing from EVM perspective:
  - Verify that the specific new feature or modified behavior introduced by the HIP works correctly according to the technical specification.
  - Verify that the new HIP functionality correctly interfaces and interacts with other components of the Hedera ecosystem.
  - Simulate real-world user workflows from start to finish, ensuring the entire HIP works as expected.
- System Contract functional, end-to-end, integration testing from EVM perspective:
  - Verifies that the precompiled system contracts correctly interpret the EVM call data and execute the corresponding native Hedera service logic.
  - Verifying the flow of control and state changes between the EVM and the Hedera layer.
  - Simulates real-world application use cases involving multiple steps and different network components.
- Solidity Contracts, the actual smart contract files used for testing
- Deployment Scripts
  - Network deployment scripts, to quickly deploy a local Hedera Network.
  - Scripts to set up test accounts before the functional tests begin.
  - Scripts to quickly deploy the necessary initial contracts.

### Contains tests for HIPs
- [HIP-632 isAuthorizedRaw](https://hips.hedera.com/hip/hip-632#isauthorizedrawaddress-messagehash-signatureblob-function-usage)
- [HIP-1215](https://hips.hedera.com/hip/hip-1215)
- [HIP-1340 (Pectra support)](https://hips.hedera.com/hip/hip-1340)

### Tests Docs
- [HIP-1340 Code Delegation](docs/hip-1340/hip-1340.md)
- [HTS Transfer events](docs/hts/transfer-events.md)
- [EIP-2930 Access List](docs/hts/transfer-events.md)

## Run tests

```sh
npx hardhat test
```

### Run with local Hiero Network using Solo

```sh
npx hardhat test --network solo
```

## Run Solo

### Requirements

- Prerequisites <https://solo.hiero.org/docs/simple-solo-setup/quickstart/#prerequisites>
- Solo <https://solo.hiero.org/docs/simple-solo-setup/quickstart/#install-solo-cli>

### Documentation

- Doc: <https://solo.hiero.org/docs/>

### Specific Solo version install

```sh
npm install -g @hashgraph/solo@0.65.0
```

### Deploy manual

```sh
# Deploy with local CN
./test.sh solo start
```

- To deploy with locally build MN, at `./test.sh` set `LOCAL_MN_BUILD=true`
  - it will build MN at your `MIRROR_NODE_DIR`
  - this will work because `solo relay node add` will use `--relay-release` image tag event with updated chart
- To deploy with locally build Relay, at `./test.sh` set `LOCAL_RELAY_BUILD=true`, 
  - you will need to override `appVersion` for your locally build image tag (e.g `appVersion: 0.152.0-local`) at:
    - `${MIRROR_NODE_DIR}/charts/hedera-mirror-rest` 
    - `${MIRROR_NODE_DIR}/charts/hedera-mirror-web3` 
  - it will build Relay at your `RELAY_DIR`

It will deploy:
- Consensus Node gRPC port forward enabled on `localhost:50211`
- Mirror Node port forward enabled on `localhost:8081`
- Explorer port forward enabled on `http://localhost:8080`
- JSON RPC Relay forward enabled on `localhost:7546`

#### Port forward
Check available port-forward
```sh
ps aux | grep port-forward
```

If you need to re-forward the ports
- Consensus Node
```sh
ns=$(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name'); kubectl port-forward -n $ns pods/$(kubectl get pods -n $ns -o json | jq -r '.items[] | select(.metadata.name | match("haproxy-node1-*")) | .metadata.name') 50211:50211
```
- Mirror Node
```sh
ns=$(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name'); kubectl port-forward -n $ns pods/$(kubectl get pods -n $ns -o json | jq -r '.items[] | select(.metadata.name | match("mirror-ingress-controller-*")) | .metadata.name') 8081:80
```
- Relay
```sh
ns=$(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name'); kubectl port-forward -n $ns pods/$(kubectl get pods -n $ns -o json | jq -r '.items[] | select(.metadata.name | match("relay-\\d+-(?!ws)")) | .metadata.name') 7546:7546
```
- Explorer
```sh
ns=$(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name'); kubectl port-forward -n $ns pods/$(kubectl get pods -n $ns -o json | jq -r '.items[] | select(.metadata.name | match("hiero-explorer-*")) | .metadata.name') 8080:8080
```

### Logs

If you need to stream the logs directly from the pods you can use the following:

#### Consensus Node Logs

```sh
kubectl exec -it -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') -c root-container svc/network-node1 -- tail -f /opt/hgcapp/services-hedera/HapiApp2.0/output/hgcaa.log /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log
```

#### Mirror Node Logs

```sh
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/mirror-1-web3
```

#### Relay Logs

```sh
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-1
```

#### Relay WS Logs

```sh
kubectl logs -f -n $(kubectl get ns -o json | jq -r '.items[] | select(.metadata.name | match("solo-ns-[a-z0-9-]+")) | .metadata.name') --all-containers svc/relay-1-ws
```
### Destroy

```sh
./test.sh solo stop
```

### Force Destroy
`./test.sh solo destroy`