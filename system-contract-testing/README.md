## System contracts testing

## Run tests

### Requirements
- Copy/Rename/Fill [example.env](example.env) -> `.env`
- `npm init -y`
- `npm install --save-dev hardhat`

### Run
- `npx hardhat coverage`
- `npx hardhat test`

## Run solo
Doc: https://solo.hiero.org/v0.42.0/docs/step-by-step-guide/

Doc with local consensus node build: https://solo.hiero.org/v0.42.0/docs/platform-developer/

### Run solo from sources
```bash
node --import file:/Applications/IntelliJ%20IDEA.app/Contents/plugins/nodeJS/js/ts-file-loader/node_modules/tsx/dist/loader.cjs solo.ts
```

### Setup
```bash
export SOLO_CLUSTER_NAME=solo-glib
export SOLO_NAMESPACE=solo-ns-glib
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup-ns-glib
export SOLO_DEPLOYMENT=solo-deployment-glib
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```

### Deploy manual (with 'local build' consensus node From https://solo.hiero.org/v0.42.0/docs/platform-developer/)
```bash
solo init
solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1
solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
# network components
solo network deploy --deployment "${SOLO_DEPLOYMENT}"
# --------- build (./gradlew assemble) in consensus node dir
cd ../../hiero-consensus-node
./gradlew assemble
cd ../hedera-evm-testing/system-contract-testing 
# ----------------------------------------------------------------------------
solo node setup --deployment "${SOLO_DEPLOYMENT}" --local-build-path ../hiero-consensus-node/hedera-node/data/
solo node start --deployment "${SOLO_DEPLOYMENT}"
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress
# explorer is not needed for test runs
#solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
solo relay deploy -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

### Deploy quick (with 'release' version)
```bash
solo quick-start single deploy --cluster-ref="kind-${SOLO_CLUSTER_NAME}" --cluster-setup-namespace="${SOLO_CLUSTER_SETUP_NAMESPACE}" --deployment="${SOLO_DEPLOYMENT}" --namespace="${SOLO_NAMESPACE}"
```
- Consensus Node gRPC port forward enabled on `localhost:50211`
- Mirror Node port forward enabled on `localhost:8081`
- Explorer port forward enabled on `http://localhost:8080`
- JSON RPC Relay forward enabled on `localhost:7546`

### Destroy
```bash
solo relay destroy --deployment="${SOLO_DEPLOYMENT}" --node-aliases node1
solo mirror-node destroy --deployment="${SOLO_DEPLOYMENT}" --force
solo node stop --deployment="${SOLO_DEPLOYMENT}"
solo network destroy --deployment="${SOLO_DEPLOYMENT}" --force --delete-pvcs --delete-secrets
solo cluster-ref reset -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --force
```

### Force Destroy
```bash
kubectl delete namespace solo-ns-glib
kubectl delete namespace solo-setup
kind delete cluster -n solo-glib
rm -rf ~/.solo
```
