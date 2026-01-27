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
- [HIP-1249](https://hips.hedera.com/hip/hip-1249)

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
`./test.sh solo destroy`