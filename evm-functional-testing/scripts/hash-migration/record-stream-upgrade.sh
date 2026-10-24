#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Record stream upgrade variant of the hash migration test (test/hash-migration): deploys a
# network on an old consensus node, populates it, upgrades the consensus node in place and verifies
# that EVM state and block hashes survived. The mirror node reads record files from the bucket
# before and after the upgrade, no Block Node.
#
# Usage: scripts/hash-migration/record-stream-upgrade.sh <phase>
#   phase: deploy | populate | upgrade | verify | collect | destroy | all
# Needs solo, kind, kubectl and the npm dependencies. Every setting below can be overridden with
# an environment variable of the same name.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

######################### Versions #########################
CONSENSUS_NODE_FROM="${CONSENSUS_NODE_FROM:-v0.78.0-rc.9}"
# Upgrade target: a released version, or a consensus node built from source when
# CONSENSUS_NODE_TO_BUILD is set (its hedera-node/data folder, after ./gradlew assemble)
CONSENSUS_NODE_TO="${CONSENSUS_NODE_TO:-v0.79.0-alpha.2}"
CONSENSUS_NODE_TO_BUILD="${CONSENSUS_NODE_TO_BUILD:-}"
# When set, the upgraded consensus node must hash its state with this many bits (256 = SHA-256)
EXPECT_STATE_HASH_BITS="${EXPECT_STATE_HASH_BITS:-}"
MIRROR_NODE_VERSION="${MIRROR_NODE_VERSION:-0.165.1}"
RELAY_RELEASE="${RELAY_RELEASE:-0.79.0}"

######################### Config files #########################
APP_PROPERTIES_PATH="${APP_PROPERTIES_PATH:-${ROOT}/local/application.properties}"
MIRROR_NODE_VALUES_PATH="${MIRROR_NODE_VALUES_PATH:-${ROOT}/local/mn-values.yaml}"
RELAY_VALUES_PATH="${RELAY_VALUES_PATH:-${ROOT}/local/relay-values.yaml}"
# Added to APP_PROPERTIES_PATH. BOTH (the consensus node's default, Solo's template sets RECORDS)
# also builds blocks, as networks do from 0.79 until the block stream cutover; FILE: no Block Node
BLOCK_STREAM_MODE="${BLOCK_STREAM_MODE:-BOTH}"
BLOCK_STREAM_WRITER_MODE="${BLOCK_STREAM_WRITER_MODE:-FILE}"

######################### Solo #########################
# e.g. SOLO="npx -y @hashgraph/solo@0.92.0" when solo is not installed globally
read -ra SOLO_COMMAND <<< "${SOLO:-solo}"
SOLO_CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo-hash-migration}"
SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo-ns-hedera}"
SOLO_CLUSTER_SETUP_NAMESPACE="${SOLO_CLUSTER_SETUP_NAMESPACE:-solo-setup-ns-hedera}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo-deployment-hedera}"
CONSENSUS_POD=network-node1-0
CONSENSUS_HOME=/opt/hgcapp/services-hedera/HapiApp2.0

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

checksum() {
  if command -v sha256sum > /dev/null; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Fails unless the consensus node runs with blockStream.<key> = <expected>
check_block_stream_setting() {
  local key=$1 expected=$2 actual

  actual=$(kubectl exec -n "${SOLO_NAMESPACE}" "${CONSENSUS_POD}" -c root-container -- sh -c "grep -ho 'blockStream.${key} = [A-Z_]*' ${CONSENSUS_HOME}/output/hgcaa*.log | tail -1" | sed 's/.* = //')
  log "blockStream.${key} = ${actual} (expected ${expected})"
  [[ "${actual}" == "${expected}" ]]
}

check_stream_mode() {
  check_block_stream_setting streamMode "${BLOCK_STREAM_MODE}"
  check_block_stream_setting writerMode "${BLOCK_STREAM_WRITER_MODE}"
}

# Waits until every pod is ready, the mirror node simulates a call and a transaction executes
wait_for_network() {
  kubectl wait pods --all -n "${SOLO_NAMESPACE}" --for=condition=Ready --field-selector=status.phase!=Succeeded --timeout=10m
  (cd "${ROOT}" && npx hardhat run --network solo scripts/hash-migration/wait-for-network.js)
}

deploy() {
  log "deploy: consensus node ${CONSENSUS_NODE_FROM}, mirror node ${MIRROR_NODE_VERSION}, relay ${RELAY_RELEASE}"
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
  solo cluster-ref config connect --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --context "kind-${SOLO_CLUSTER_NAME}"
  solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
  solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --num-consensus-nodes 1

  # consensus node: a released version, upgraded in place later
  solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
  solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
  mkdir -p "${RESULTS_DIR}"
  {
    cat "${APP_PROPERTIES_PATH}"
    echo
    echo "blockStream.streamMode=${BLOCK_STREAM_MODE}"
    echo "blockStream.writerMode=${BLOCK_STREAM_WRITER_MODE}"
  } > "${RESULTS_DIR}/application.properties"
  solo consensus network deploy --pvcs --deployment "${SOLO_DEPLOYMENT}" --application-properties "${RESULTS_DIR}/application.properties" --consensus-node-version "${CONSENSUS_NODE_FROM}"
  solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --consensus-node-version "${CONSENSUS_NODE_FROM}"
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}"

  # mirror node (reads record files from the bucket) and relay
  solo mirror node add --enable-ingress --mirror-node-version "${MIRROR_NODE_VERSION}" --values-file "${MIRROR_NODE_VALUES_PATH}" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}"
  solo relay node add --relay-release "${RELAY_RELEASE}" --deployment "${SOLO_DEPLOYMENT}" --values-file "${RELAY_VALUES_PATH}"

  for key in "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1}" "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2}" "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3}"; do
    solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${key}"
  done

  log "deploy: waiting for the network"
  wait_for_network
  check_stream_mode
}

populate() {
  log "populate"
  mkdir -p "${RESULTS_DIR}"
  (cd "${ROOT}" && npx hardhat test --network solo --bail test/hash-migration/01-populate.test.js) 2>&1 | tee "${RESULTS_DIR}/populate.log"
}

# Fails unless the consensus node runs exactly the jar of CONSENSUS_NODE_TO_BUILD
check_running_build() {
  local built running

  built=$(checksum "${CONSENSUS_NODE_TO_BUILD}/apps/HederaNode.jar")
  running=$(kubectl exec -n "${SOLO_NAMESPACE}" "${CONSENSUS_POD}" -c root-container -- sha256sum "${CONSENSUS_HOME}/data/apps/HederaNode.jar" | cut -d' ' -f1)
  log "upgrade: built jar ${built}, running jar ${running}"
  [[ "${running}" == "${built}" ]]
}

# Fails unless the consensus node's latest state root hash has EXPECT_STATE_HASH_BITS bits
check_state_hash() {
  local latest hash bits

  latest=$(kubectl exec -n "${SOLO_NAMESPACE}" "${CONSENSUS_POD}" -c root-container -- sh -c "grep -E '^(Creation version|Root hash):' ${CONSENSUS_HOME}/output/swirlds-hashstream/swirlds-hashstream.log | tail -2")
  hash=$(echo "${latest}" | sed -n 's/^Root hash: *//p' | tr -d '[:space:]')
  bits=$(( ${#hash} * 4 ))
  log "upgrade: latest state root hash has ${bits} bits (expected ${EXPECT_STATE_HASH_BITS})"
  echo "${latest}"
  [[ "${bits}" == "${EXPECT_STATE_HASH_BITS}" ]]
}

upgrade() {
  local target

  mkdir -p "${RESULTS_DIR}"

  if [[ -n "${CONSENSUS_NODE_TO_BUILD}" ]]; then
    log "upgrade: consensus node to the build in ${CONSENSUS_NODE_TO_BUILD}"
    target=(--local-build-path "${CONSENSUS_NODE_TO_BUILD}")
  else
    log "upgrade: consensus node to ${CONSENSUS_NODE_TO}"
    target=(--upgrade-version "${CONSENSUS_NODE_TO}")
  fi

  solo consensus network upgrade --deployment "${SOLO_DEPLOYMENT}" "${target[@]}" --force --quiet-mode 2>&1 | tee "${RESULTS_DIR}/upgrade.log"

  if [[ -n "${CONSENSUS_NODE_TO_BUILD}" ]]; then
    check_running_build
  fi

  log "upgrade: waiting for the upgraded network"
  wait_for_network
  check_stream_mode

  if [[ -n "${EXPECT_STATE_HASH_BITS}" ]]; then
    check_state_hash
  fi
}

verify() {
  log "verify"
  mkdir -p "${RESULTS_DIR}"
  (cd "${ROOT}" && npx hardhat test --network solo test/hash-migration/02-verify.test.js) 2>&1 | tee "${RESULTS_DIR}/verify.log"
}

# Copies the snapshot and every pod's logs to RESULTS_DIR; never fails
collect() {
  local pod name

  log "collect: ${RESULTS_DIR}"
  mkdir -p "${RESULTS_DIR}/pods"
  cp "${ROOT}/hash-migration-snapshot.json" "${RESULTS_DIR}/" || true
  kubectl get pods -A -o wide > "${RESULTS_DIR}/pods/pods.txt" 2>&1 || true

  for pod in $(kubectl get pods -n "${SOLO_NAMESPACE}" -o name 2>/dev/null); do
    name=${pod#pod/}
    kubectl logs -n "${SOLO_NAMESPACE}" "${pod}" --all-containers --timestamps > "${RESULTS_DIR}/pods/${name}.log" 2>&1 || true
    kubectl logs -n "${SOLO_NAMESPACE}" "${pod}" --all-containers --timestamps --previous > "${RESULTS_DIR}/pods/${name}.previous.log" 2>/dev/null || rm -f "${RESULTS_DIR}/pods/${name}.previous.log"
  done

  # The consensus node writes its own logs (swirlds.log, hgcaa.log, state hashes) to files, not to stdout
  kubectl exec -n "${SOLO_NAMESPACE}" "${CONSENSUS_POD}" -c root-container -- tar -C "${CONSENSUS_HOME}" -czf - output > "${RESULTS_DIR}/consensus-node-output.tgz" 2>/dev/null || true
}

destroy() {
  log "destroy: cluster ${SOLO_CLUSTER_NAME}"
  kind delete cluster -n "${SOLO_CLUSTER_NAME}"
}

all() {
  trap collect EXIT
  deploy
  populate
  upgrade
  verify
}

######################### main #########################
case "${1:-}" in
  deploy | populate | upgrade | verify | collect | destroy | all)
    "$1"
    ;;
  *)
    echo "Usage: $0 <deploy|populate|upgrade|verify|collect|destroy|all>"
    exit 1
    ;;
esac
