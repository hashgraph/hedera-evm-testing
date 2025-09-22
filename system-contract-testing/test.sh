#!/bin/bash
# exit when any command fails
set -e

# This script is used to easy start/stop local Hedera Network (with solo).
# It also deploy some pre-requirements for hardhat test like:
#   - create accounts with preconfigured keys and initial balance

WORK_DIR="$(pwd)"
CONSENSUS_NODE_DIR="../../hiero-consensus-node"
APP_PROPERTIES_PATH="local/application.properties"
LATEST_CONSENSUS_COMMIT=""

export SOLO_BASE_NAME=hedera
export SOLO_CLUSTER_NAME="solo-${SOLO_BASE_NAME}"
export SOLO_NAMESPACE="solo-ns-${SOLO_BASE_NAME}"
export SOLO_CLUSTER_SETUP_NAMESPACE="solo-setup-ns-${SOLO_BASE_NAME}"
export SOLO_DEPLOYMENT="solo-deployment-${SOLO_BASE_NAME}"

# alias f70febf7420398c3892ce79fdc393c1a5487ad27
export TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1=3030020100300706052b8104000a04220420de78ff4e5e77ec2bf28ef7b446d4bec66e06d39b6e6967864b2bf3d6153f3e68
# alias dbe82db504ca6701fbe59e638ceaddbdb691067b
export TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2=3030020100300706052b8104000a04220420748634984b480c75456a68ea88f31609cd3091e012e2834948a6da317b727c04
# alias 84b4d82e6ed64102d0faa6c29bf4e9f541db442f
export TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3=3030020100300706052b8104000a042204203bcb2fbd18610f44eda2bfd58df63d053e2a6b165617a2ef5e5cca079e0c588a
export TEST_ACCOUNT_HBAR_AMOUNT=10000

######################### functions #########################

check_k8s_context() {
  CURRENT_CONTEXT=$(kubectl config current-context)
  if [ "$CURRENT_CONTEXT" != "kind-${SOLO_CLUSTER_NAME}" ]; then
    printf "Current context: %s is not equals to targeted context: %s\n" "$CURRENT_CONTEXT" "kind-${SOLO_CLUSTER_NAME}"
    exit 1
  fi
}

# solo -> required solo, kubectl, kind
solo_start() {
  # base setup
  kind create cluster -n "${SOLO_CLUSTER_NAME}" || true

  # solo deploy
  check_k8s_context
  solo init --dev
  solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --dev
  solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev
  solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1 --dev
  solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev
  solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev
  # --------- build (./gradlew assemble) in consensus node dir
  cd "${CONSENSUS_NODE_DIR}"
  ./gradlew assemble
  cd "${WORK_DIR}"
  # ----------------------------------------------------------------------------
  # network components
  # --------- with local consensus build
  solo network deploy --deployment "${SOLO_DEPLOYMENT}" --application-properties "${APP_PROPERTIES_PATH}" --dev
  solo node setup --deployment "${SOLO_DEPLOYMENT}" -i node1 --local-build-path "${CONSENSUS_NODE_DIR}/hedera-node/data/" --dev
  solo node start --deployment "${SOLO_DEPLOYMENT}" -i node1 --dev
  # TODO Port forwarding fails with
  #  E0922 16:21:12.458388   30038 portforward.go:424] "Unhandled Error" err="an error occurred forwarding 50211 -> 50211: error forwarding port 50211 to pod da6e875b14dd3ca1bd22b6d58d0710e391a097bf20cc50c6b651d6b767d58d86, uid : failed to execute portforward in network namespace \"/var/run/netns/cni-4238efbe-a960-1885-009c-184292bbdac8\": readfrom tcp4 127.0.0.1:56702->127.0.0.1:50211: write tcp4 127.0.0.1:56702->127.0.0.1:50211: write: broken pipe"
       #error: lost connection to pod
  # Re-forward: kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 > /dev/null 2>&1 &
  solo mirror-node deploy --enable-ingress --pinger --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev
  solo relay deploy --deployment "${SOLO_DEPLOYMENT}" -i node1 --dev
  solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev

  # add test accounts to the network
  solo account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1}"
  solo account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2}"
  solo account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3}"
}

solo_stop() {
  solo explorer destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" --force --dev || true
  solo relay destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" -i node1 --dev || true
  solo mirror-node destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" --force --dev || true
  solo node stop --deployment="${SOLO_DEPLOYMENT}" -i node1 --dev || true
  solo network destroy --deployment="${SOLO_DEPLOYMENT}" --force --delete-pvcs --delete-secrets --dev || true
  # next step is hanging and not ending by itself. Do we need it?
  # solo cluster-ref reset --cluster-ref kind-${SOLO_CLUSTER_NAME} -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --force || true
  solo cluster-ref disconnect --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev || true
  solo_destroy
}

solo_status() {
  cat ~/.solo/local-config.yaml || true
  echo "-------------------------------------------------------------------------"
  kubectl get pods -n "${SOLO_NAMESPACE}"
}

solo_destroy() {
  kubectl delete namespace "${SOLO_NAMESPACE}" || true
  kubectl delete namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}" || true
  kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
  rm -rf ~/.solo
}

# Building consensus node from local sources
# Build logic is taken from https://github.com/hiero-ledger/hiero-consensus-node/blob/main/.github/workflows/node-zxc-build-release-artifact.yaml
# from 'Build Artifact' job, steps:
# - Gradle Assemble
# - Stage Artifact Build Folder
# - Write Artifact Version Descriptor
# - Create Artifact Archive
# - Compute SHA Hash
# build_consensus_release -> additionally required git, zip
build_consensus_release() {
  # Gradle Assemble
  cd "${CONSENSUS_NODE_DIR}"
  ./gradlew assemble
  LATEST_CONSENSUS_COMMIT="$(git log -n 1 --pretty=format:"%H")"
  cd "${WORK_DIR}"

  # Stage Artifact Build Folder
  BUILD_BASE_DIR="build-${LATEST_CONSENSUS_COMMIT}"
  mkdir -p "${BUILD_BASE_DIR}/data/lib"
  mkdir -p "${BUILD_BASE_DIR}/data/apps"

  cp -f ${CONSENSUS_NODE_DIR}/hedera-node/data/lib/*.jar "${BUILD_BASE_DIR}/data/lib"
  cp -f ${CONSENSUS_NODE_DIR}/hedera-node/data/apps/*.jar "${BUILD_BASE_DIR}/data/apps"
  cp -f ${CONSENSUS_NODE_DIR}/hedera-node/configuration/update/immediate.sh "${BUILD_BASE_DIR}"
  cp -f ${CONSENSUS_NODE_DIR}/hedera-node/configuration/update/during-freeze.sh "${BUILD_BASE_DIR}"

  # Write Artifact Version Descriptor
  printf "VERSION=%s\nCOMMIT=%s\nDATE=%s" "${LATEST_CONSENSUS_COMMIT}" "${LATEST_CONSENSUS_COMMIT}" "$(date -u)" | tee "${BUILD_BASE_DIR}/VERSION"
  printf "\n"

  # Create Artifact Archive
  printf "Artifact Folder=%s\n" "${BUILD_BASE_DIR}"
  ARTIFACT="build-${LATEST_CONSENSUS_COMMIT}.zip"
  # we should zip from BUILD_BASE_DIR to get zip w/o any additional directories, for correct unzip on the node
  cd "${BUILD_BASE_DIR}"
  zip -D -rq "${ARTIFACT}" *
  mv "${ARTIFACT}" "${WORK_DIR}"
  cd "${WORK_DIR}"
  rm -rf "${BUILD_BASE_DIR}"

  # Compute SHA Hash
  sha384sum "${ARTIFACT}" | tee "build-${LATEST_CONSENSUS_COMMIT}.sha384"

  printf "Build Done. Artifact %s\n" "${ARTIFACT}"
}

# push release archive to node and unzip to /opt/hgcapp/services-hedera/HapiApp2.0
upgrade_solo_consensus() {
  cd "${CONSENSUS_NODE_DIR}"
  LATEST_CONSENSUS_COMMIT="$(git log -n 1 --pretty=format:"%H")"
  cd "${WORK_DIR}"

  kubectl cp "build-${LATEST_CONSENSUS_COMMIT}.zip" network-node1-0:/home/hedera -n "${SOLO_NAMESPACE}"
  kubectl cp "build-${LATEST_CONSENSUS_COMMIT}.sha384" network-node1-0:/home/hedera -n "${SOLO_NAMESPACE}"
  kubectl exec network-node1-0 -n "${SOLO_NAMESPACE}" -- bash /home/hedera/extract-platform.sh "${LATEST_CONSENSUS_COMMIT}"
}

######################### main #########################
case "$1" in

  solo)
    case "$2" in
      start)
        solo_start
        ;;
      stop)
        solo_stop
        ;;
      status)
        solo_status
        ;;
      destroy)
        solo_destroy
        ;;
    	*)
    		echo "Usage: [start|stop|status|destroy]"
    		exit 1
    		;;
    esac
    ;;

    node)
      case "$2" in
        release)
          build_consensus_release
          ;;
        upgrade)
          upgrade_solo_consensus
          ;;
      	*)
      		echo "Usage: [release|upgrade]"
      		exit 1
      		;;
      esac
      ;;

	*)
		echo "Usage: [solo|node]"
		exit 1
		;;
esac