## System contracts testing

## Run tests

### Requirements
- Copy/Rename/Fill [example.env](example.env) -> `.env`
- `npm init -y`
- `npm install --save-dev hardhat`

### Run
- `npx hardhat coverage`
- `npx hardhat test`

### Run with local Hedera Network (using solo)
`npx hardhat test --network local`

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

### Destroy
`./test.sh solo stop`

### Force Destroy
`./test.sh solo destroy`

### TODO
- Need some sort of 'heartbeat' event for solo running nodes
- INVALID_TRANSACTION_BODY
