#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Block stream upgrade variant of the hash migration test (test/hash-migration): deploys a network
# on a consensus node that hashes with SHA-256, populates it, adds a Block Node and upgrades the
# consensus node to the block stream cutover (record files stop, blocks go only to the Block Node),
# then verifies that EVM state and block hashes survived. The mirror node reads record files from
# the bucket before the cutover and blocks from the Block Node after it.
#
# Usage: scripts/hash-migration/block-stream-upgrade.sh <phase>
#   phase: deploy | populate | upgrade | verify | collect | destroy | all
# Needs solo, kind, kubectl, openssl, python3 and the npm dependencies. Every setting below can be
# overridden with an environment variable of the same name.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Runs the phases both variants share: populate, verify, collect and destroy
RECORD_STREAM_UPGRADE="${ROOT}/scripts/hash-migration/record-stream-upgrade.sh"

######################### Versions #########################
# No release hashes with SHA-256 yet: the consensus node is built from source (its
# hedera-node/data folder, after ./gradlew assemble) and runs from genesis, before and after the cutover
CONSENSUS_NODE_BUILD="${CONSENSUS_NODE_BUILD:-}"
# The Block Node and mirror node must hash with SHA-256 and use the consensus node's TSS library (3.15)
BLOCK_NODE_VERSION="${BLOCK_NODE_VERSION:-v0.45.0-rc2}"
MIRROR_NODE_VERSION="${MIRROR_NODE_VERSION:-0.165.0-rc1}"
RELAY_RELEASE="${RELAY_RELEASE:-0.79.0}"

######################### Config files #########################
APP_PROPERTIES_PATH="${APP_PROPERTIES_PATH:-${ROOT}/local/application.properties}"
MIRROR_NODE_VALUES_PATH="${MIRROR_NODE_VALUES_PATH:-${ROOT}/local/mn-values.yaml}"
RELAY_VALUES_PATH="${RELAY_VALUES_PATH:-${ROOT}/local/relay-values.yaml}"
MIRROR_NODE_URL="${MIRROR_NODE_URL:-http://localhost:38081}"
# Cores of the WRAPS prover (TSS): more makes the genesis TSS ceremony faster
WRAPS_CORES="${WRAPS_CORES:-4}"

######################### Solo #########################
# e.g. SOLO="npx -y @hashgraph/solo@0.92.0" when solo is not installed globally
read -ra SOLO_COMMAND <<< "${SOLO:-solo}"
SOLO_CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo-hash-migration}"
SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo-ns-hedera}"
SOLO_CLUSTER_SETUP_NAMESPACE="${SOLO_CLUSTER_SETUP_NAMESPACE:-solo-setup-ns-hedera}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo-deployment-hedera}"
CONSENSUS_POD=network-node1-0
CONSENSUS_HOME=/opt/hgcapp/services-hedera/HapiApp2.0
BLOCK_NODE_POD=block-node-1-0
BLOCK_NODE_PORT=40840

######################### Results #########################
RESULTS_DIR="${RESULTS_DIR:-${ROOT}/hash-migration-results}"

######################### Test accounts (same as test.sh) #########################
# alias f70febf7420398c3892ce79fdc393c1a5487ad27
TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1=3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68
# alias dbe82db504ca6701fbe59e638ceaddbdb691067b
TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2=3030020100300706052b8104000a04220420748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04
# alias 84b4d82e6ed64102d0faa6c29bf4e9f541db442f
TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3=3030020100300706052b8104000a042204203bcb2fbd18610f44eda2bfd58df63d053e2a6b165617a2ef5e5cca079e0c588a
TEST_ACCOUNT_HBAR_AMOUNT=1000000000

######################### functions #########################

log() {
  echo "=== $(date -u +%T) $*"
}

# `command` runs the real solo program, not this function
solo() {
  command "${SOLO_COMMAND[@]}" "$@"
}

consensus_node() {
  kubectl exec -n "${SOLO_NAMESPACE}" "${CONSENSUS_POD}" -c root-container -- "$@"
}

# Fails unless the consensus node runs with <key> = <expected>
check_setting() {
  local key=$1 expected=$2 actual

  actual=$(consensus_node sh -c "grep -ho '${key} = [A-Za-z_]*' ${CONSENSUS_HOME}/output/hgcaa*.log | tail -1" | sed 's/.* = //')
  log "${key} = ${actual} (expected ${expected})"
  [[ "${actual}" == "${expected}" ]]
}

# Fails unless the consensus node's latest state root hash has SHA-256's 256 bits
check_state_hash() {
  local hash

  hash=$(consensus_node sh -c "grep '^Root hash:' ${CONSENSUS_HOME}/output/swirlds-hashstream/swirlds-hashstream.log | tail -1" | sed 's/^Root hash: *//' | tr -d '[:space:]')
  log "latest state root hash has $(( ${#hash} * 4 )) bits (expected 256)"
  [[ $(( ${#hash} * 4 )) == 256 ]]
}

# Waits until every pod is ready, the mirror node simulates a call and a transaction executes
wait_for_network() {
  kubectl wait pods --all -n "${SOLO_NAMESPACE}" --for=condition=Ready --field-selector=status.phase!=Succeeded --timeout=10m
  (cd "${ROOT}" && npx hardhat run --network solo scripts/hash-migration/wait-for-network.js)
}

# Writes the consensus node properties: the local ones plus the block stream settings in "$@"
write_properties() {
  local file=$1

  shift
  mkdir -p "${RESULTS_DIR}"
  {
    cat "${APP_PROPERTIES_PATH}"
    echo
    printf '%s\n' "$@"
    # The WRAPS proving key archive goes next to the WRAPS_ARTIFACTS folder
    echo "tss.wrapsProvingKeyPath=${CONSENSUS_HOME}/data/keys/wraps-archive"
  } > "${file}"
}

# The WRAPS prover reads its settings from the environment, which must be set before the node first
# starts; setting it later restarts the node outside an upgrade (the CN team's scripts get SELF_ISS)
set_wraps_environment() {
  kubectl set env statefulset/network-node1 -n "${SOLO_NAMESPACE}" -c root-container \
    "TSS_LIB_WRAPS_ARTIFACTS_PATH=${CONSENSUS_HOME}/data/keys/wraps" \
    "TSS_LIB_WRAPS_SWAP_FILE=${CONSENSUS_HOME}/wraps-alloc-swap.bin" \
    "TSS_LIB_NUM_OF_CORES=${WRAPS_CORES}"
  kubectl rollout status statefulset/network-node1 -n "${SOLO_NAMESPACE}" --timeout=10m
}

# Mirror node settings: record files until the consensus node stops writing them, then blocks from
# the Block Node, which the upgrade phase adds
write_mirror_node_values() {
  cat > "${RESULTS_DIR}/mirror-node-block-stream.yaml" <<EOF
importer:
  env:
    HIERO_MIRROR_IMPORTER_DOWNLOADER_RECORD_ENABLED: "true"
    HIERO_MIRROR_IMPORTER_BLOCK_ENABLED: "false"
    HIERO_MIRROR_IMPORTER_BLOCK_SOURCETYPE: BLOCK_NODE
    HIERO_MIRROR_IMPORTER_BLOCK_CUTOVER_ENABLED: "true"
    HIERO_MIRROR_IMPORTER_BLOCK_CUTOVER_HAPIVERSION: 0.79.0
    HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_ENDPOINTS_0_HOST: block-node-1.${SOLO_NAMESPACE}.svc.cluster.local
    HIERO_MIRROR_IMPORTER_BLOCK_NODES_0_ENDPOINTS_0_PORT: "${BLOCK_NODE_PORT}"
EOF
}

# The TSS ceremony ends when the consensus node publishes the ledger id, which the Block Node needs
# to verify blocks after the cutover. Rounds only advance with transactions, so keep sending some.
wait_for_ledger_id() {
  local deadline=$(( SECONDS + 1200 ))

  log "deploy: waiting for the ledger id"

  while (( SECONDS < deadline )); do
    if consensus_node sh -c "grep -q 'Externalizing ledger id' ${CONSENSUS_HOME}/output/hgcaa*.log"; then
      log "deploy: ledger id published"
      return 0
    fi

    (cd "${ROOT}" && npx hardhat run --network solo scripts/hash-migration/wait-for-network.js) > /dev/null || true
    sleep 10
  done

  log "deploy: no ledger id within 20 minutes"
  return 1
}

deploy() {
  local version

  [[ -n "${CONSENSUS_NODE_BUILD}" ]] || { echo "CONSENSUS_NODE_BUILD must be set"; return 1; }
  version="v$(cat "${CONSENSUS_NODE_BUILD}/../../version.txt")"
  log "deploy: consensus node build ${version}, mirror node ${MIRROR_NODE_VERSION}, relay ${RELAY_RELEASE}"
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
  solo cluster-ref config connect --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --context "kind-${SOLO_CLUSTER_NAME}"
  solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
  solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --num-consensus-nodes 1

  # consensus node: BOTH writes record files and builds blocks, as networks do until the cutover.
  # Its defaults also build the wrapped record chain the cutover continues and run TSS with mock signatures.
  solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
  solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
  write_properties "${RESULTS_DIR}/application.properties" \
    hedera.config.version=0 \
    blockStream.streamMode=BOTH \
    blockStream.writerMode=FILE_AND_GRPC \
    blockStream.streamWrappedRecordBlocks=true \
    blockStream.enableCutover=false \
    tss.forceMockSignatures=true
  solo consensus network deploy --pvcs --deployment "${SOLO_DEPLOYMENT}" --application-properties "${RESULTS_DIR}/application.properties" --consensus-node-version "${version}"
  solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --local-build-path "${CONSENSUS_NODE_BUILD}" --consensus-node-version "${version}"
  set_wraps_environment
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}"

  # mirror node (reads record files from the bucket until the cutover) and relay
  write_mirror_node_values
  solo mirror node add --enable-ingress --mirror-node-version "${MIRROR_NODE_VERSION}" --values-file "${MIRROR_NODE_VALUES_PATH},${RESULTS_DIR}/mirror-node-block-stream.yaml" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}"
  solo relay node add --relay-release "${RELAY_RELEASE}" --deployment "${SOLO_DEPLOYMENT}" --values-file "${RELAY_VALUES_PATH}"

  for key in "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1}" "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2}" "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3}"; do
    solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${key}"
  done

  log "deploy: waiting for the network"
  wait_for_network
  check_setting blockStream.streamMode BOTH
  check_setting blockStream.writerMode FILE_AND_GRPC
  check_state_hash
  wait_for_ledger_id
}

# Number of the latest block the mirror node imported
latest_block() {
  curl -sf "${MIRROR_NODE_URL}/api/v1/blocks?limit=1&order=desc" | node -p 'JSON.parse(require("fs").readFileSync(0)).blocks[0].number'
}

# Writes the RSA roster (the consensus node's gossip key) the Block Node verifies the blocks signed
# before the cutover with, and the folders the Block Node's storage needs
write_block_node_values() {
  local key

  key=$(consensus_node cat "${CONSENSUS_HOME}/data/keys/s-public-node1.pem" | openssl x509 -pubkey -noout | openssl pkey -pubin -outform DER | od -An -v -tx1 | tr -d ' \n')
  cat > "${RESULTS_DIR}/block-node-values.yaml" <<EOF
blockNode:
  config:
    # Above the consensus node's latest block: the Block Node joins a running network
    BLOCK_NODE_EARLIEST_MANAGED_BLOCK: "$1"
    BACKFILL_START_BLOCK: "$1"
    APP_STATE_RSA_BOOTSTRAP_FILE_PATH: /opt/hiero/block-node/data/live/rsa-bootstrap-roster.json
    ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL: ""
  initContainers:
    - name: init-storage-dirs
      image: busybox
      command:
        - sh
        - -c
        - |
          mkdir -p /live-pvc/live-data /archive-pvc/archive-data
          chown 2000:2000 /live-pvc/live-data /archive-pvc/archive-data /application-state-pvc
          chmod 700 /live-pvc/live-data /archive-pvc/archive-data /application-state-pvc
      volumeMounts:
        - name: live-storage
          mountPath: /live-pvc
        - name: archive-storage
          mountPath: /archive-pvc
        - name: application-state-storage
          mountPath: /application-state-pvc
    - name: seed-rsa-bootstrap-roster
      image: busybox
      command:
        - sh
        - -c
        - |
          echo '{"nodeAddress": [{"RSAPubKey": "${key}"}]}' > /live-pvc/live-data/rsa-bootstrap-roster.json
          chown 2000:2000 /live-pvc/live-data/rsa-bootstrap-roster.json
      volumeMounts:
        - name: live-storage
          mountPath: /live-pvc
EOF
}

add_block_node() {
  local latest

  latest=$(latest_block)
  log "upgrade: adding Block Node ${BLOCK_NODE_VERSION} (latest block ${latest})"
  write_block_node_values $(( latest + 1000 ))
  solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --chart-version "${BLOCK_NODE_VERSION}" --priority-mapping node1=1 --values-file "${RESULTS_DIR}/block-node-values.yaml" --quiet-mode
  kubectl wait pod/"${BLOCK_NODE_POD}" -n "${SOLO_NAMESPACE}" --for=condition=Ready --timeout=10m
}

# Copies the block files from the bucket and writes the ledger id publication's TSS data to "$1".
# The files are read oldest first: the ledger id is published soon after genesis.
extract_ledger_id() {
  local out=$1 minio config user password file

  minio=$(kubectl get pods -n "${SOLO_NAMESPACE}" -o name | sed -n 's|^pod/\(minio-.*\)|\1|p' | head -1)
  config=$(kubectl exec -n "${SOLO_NAMESPACE}" "${minio}" -c minio -- sh -c 'cat "${MINIO_CONFIG_ENV_FILE:-/tmp/minio/config.env}"')
  user=$(echo "${config}" | sed -n -E 's/^(export +)?MINIO_ROOT_USER=//p' | tr -d '"\r')
  password=$(echo "${config}" | sed -n -E 's/^(export +)?MINIO_ROOT_PASSWORD=//p' | tr -d '"\r')
  kubectl exec -n "${SOLO_NAMESPACE}" "${minio}" -c minio -- sh -c "rm -rf /tmp/blocks && mc alias set local http://minio-hl.${SOLO_NAMESPACE}.svc.cluster.local:9000 '${user}' '${password}' > /dev/null && mc cp --recursive local/solo-streams/blockStreams/ /tmp/blocks/ > /dev/null"
  mkdir -p "${RESULTS_DIR}/blocks"

  # The MinIO image has no tar, so the files are copied one by one
  for file in $(kubectl exec -n "${SOLO_NAMESPACE}" "${minio}" -c minio -- sh -c 'ls /tmp/blocks/*/*.blk.gz /tmp/blocks/*.blk.gz 2> /dev/null'); do
    kubectl exec -n "${SOLO_NAMESPACE}" "${minio}" -c minio -- cat "${file}" > "${RESULTS_DIR}/blocks/$(basename "${file}")"

    if python3 "${ROOT}/scripts/hash-migration/extract-ledger-id.py" "${out}" "${RESULTS_DIR}/blocks/$(basename "${file}")" 2> /dev/null; then
      return 0
    fi
  done

  log "upgrade: no ledger id publication in the bucket's block files"
  return 1
}

# A Block Node that joins a running network never sees the ledger id published at genesis: give it
# the network's TSS data, then restart it to load it
seed_block_node() {
  local tss_data="${RESULTS_DIR}/tss-data.json" deadline

  log "upgrade: seeding the Block Node with the ledger id"
  extract_ledger_id "${tss_data}"
  kubectl exec -i -n "${SOLO_NAMESPACE}" "${BLOCK_NODE_POD}" -- sh -c "mkdir -p /opt/hiero/block-node/application-state && cat > /opt/hiero/block-node/application-state/tss-bootstrap-roster.json" < "${tss_data}"
  SEEDED_AT=$(date -u '+%Y-%m-%d %H:%M:%S')
  kubectl delete pod "${BLOCK_NODE_POD}" -n "${SOLO_NAMESPACE}" --wait=true
  kubectl rollout status statefulset/block-node-1 -n "${SOLO_NAMESPACE}" --timeout=5m
  kubectl wait pod/"${BLOCK_NODE_POD}" -n "${SOLO_NAMESPACE}" --for=condition=Ready --timeout=5m
  deadline=$(( SECONDS + 300 ))

  until kubectl logs -n "${SOLO_NAMESPACE}" "${BLOCK_NODE_POD}" | grep -q "Successfully updated TSS data"; do
    if (( SECONDS > deadline )); then
      log "upgrade: the Block Node did not load the TSS data within 5 minutes"
      return 1
    fi

    sleep 5
  done

  log "upgrade: the Block Node loaded the TSS data"
}

# Waits until the consensus node streams to the restarted Block Node again. Blocks it had not sent
# before the upgrade restarts the consensus node would be lost, and the Block Node would stall.
wait_for_block_node_streaming() {
  local deadline=$(( SECONDS + 300 ))

  until consensus_node sh -c "cat ${CONSENSUS_HOME}/output/block-node-comms.log ${CONSENSUS_HOME}/output/hgcaa*.log 2> /dev/null | awk -v since='${SEEDED_AT}' '\$0 >= since' | grep -q 'available for streaming (wantedBlock'"; do
    if (( SECONDS > deadline )); then
      log "upgrade: the consensus node did not stream to the Block Node within 5 minutes"
      return 1
    fi

    sleep 5
  done

  log "upgrade: the consensus node streams to the Block Node"
}

# Solo rewrites the consensus node's application.properties when it adds or upgrades a Block Node
# (e.g. writerMode back to FILE_AND_GRPC): put the cutover settings back before the node starts
reapply_properties() {
  local key line

  while IFS= read -r line; do
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    key=${line%%=*}
    consensus_node sh -c "file=${CONSENSUS_HOME}/data/config/application.properties; grep -v -F '${key}=' \"\${file}\" > /tmp/next.properties || true; echo '${line}' >> /tmp/next.properties; cat /tmp/next.properties > \"\${file}\""
  done < "$1"
}

cutover() {
  local properties="${RESULTS_DIR}/application-cutover.properties" before

  before=$(latest_block)
  log "upgrade: block stream cutover (mirror node at block ${before})"

  # The cutover: no more record files, blocks only to the Block Node, real TSS signatures. The
  # config version tells the consensus node to run the upgrade with the same build.
  write_properties "${properties}" \
    hedera.config.version=1 \
    blockStream.streamMode=BLOCKS \
    blockStream.writerMode=GRPC \
    blockStream.streamWrappedRecordBlocks=false \
    blockStream.enableCutover=true \
    blockStream.buffer.isBufferPersistenceEnabled=true \
    tss.forceMockSignatures=false

  # Adding the Block Node created this config map outside of Helm; the upgrade's helm upgrade fails
  # unless Helm owns it
  kubectl label configmap network-node1-data-config-cm -n "${SOLO_NAMESPACE}" app.kubernetes.io/managed-by=Helm --overwrite
  kubectl annotate configmap network-node1-data-config-cm -n "${SOLO_NAMESPACE}" meta.helm.sh/release-name=solo-deployment "meta.helm.sh/release-namespace=${SOLO_NAMESPACE}" --overwrite

  solo consensus network upgrade --deployment "${SOLO_DEPLOYMENT}" --local-build-path "${CONSENSUS_NODE_BUILD}" --application-properties "${properties}" --skip-node-start --force --quiet-mode 2>&1 | tee "${RESULTS_DIR}/upgrade.log"
  reapply_properties "${properties}"
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}"

  log "upgrade: waiting for the network"
  wait_for_network
  check_setting blockStream.streamMode BLOCKS
  check_setting blockStream.writerMode GRPC
  check_setting blockStream.enableCutover true
  check_state_hash
  node "${ROOT}/scripts/hash-migration/check-mirror-node-cutover.js" "${MIRROR_NODE_URL}" "${before}"
}

upgrade() {
  mkdir -p "${RESULTS_DIR}"
  add_block_node
  seed_block_node
  wait_for_block_node_streaming
  cutover
}

all() {
  trap '"${RECORD_STREAM_UPGRADE}" collect' EXIT
  deploy
  "${RECORD_STREAM_UPGRADE}" populate
  upgrade
  "${RECORD_STREAM_UPGRADE}" verify
}

######################### main #########################
case "${1:-}" in
  deploy | upgrade | all)
    "$1"
    ;;
  populate | verify | collect | destroy)
    "${RECORD_STREAM_UPGRADE}" "$1"
    ;;
  *)
    echo "Usage: $0 <deploy|populate|upgrade|verify|collect|destroy|all>"
    exit 1
    ;;
esac
