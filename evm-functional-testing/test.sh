#!/bin/bash
# exit when any command fails
set -e

# This script is used to easy start/stop local Hedera Network (with solo).
# It also deploy some pre-requirements for hardhat test like:
#   - create accounts with preconfigured keys and initial balance

WORK_DIR="$(pwd)"
CONSENSUS_NODE_DIR="../../hiero-consensus-node"
APP_PROPERTIES_PATH="local/application.properties"
RELAY_YAML_PATH="local/values.yaml"

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
  solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev
  solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --dev
  solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev
  solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1 --dev
  solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev
  # --------- build (./gradlew assemble) in consensus node dir
  cd "${CONSENSUS_NODE_DIR}"
  ./gradlew assemble
  cd "${WORK_DIR}"
  # ----------------------------------------------------------------------------
  # network components
  # --------- with local consensus build
  solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --application-properties "${APP_PROPERTIES_PATH}" --dev
  solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1 --local-build-path "${CONSENSUS_NODE_DIR}/hedera-node/data/" --dev
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1 --dev
  solo mirror node add --enable-ingress --pinger --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev
  solo relay node add --deployment "${SOLO_DEPLOYMENT}" --values-file "${RELAY_YAML_PATH}" -i node1 --dev
  solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev

  # add test accounts to the network
  solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1}"
  solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2}"
  solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --dev --hbar-amount "${TEST_ACCOUNT_HBAR_AMOUNT}" --private-key --set-alias --ecdsa-private-key "${TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3}"
}

solo_stop() {
  solo explorer node destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" --force --dev || true
  solo relay node destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" -i node1 --dev || true
  solo mirror-node node destroy --cluster-ref=kind-${SOLO_CLUSTER_NAME} --deployment="${SOLO_DEPLOYMENT}" --force --dev || true
  solo consensus node stop --deployment="${SOLO_DEPLOYMENT}" -i node1 --dev || true
  solo consensus network destroy --deployment="${SOLO_DEPLOYMENT}" --force --delete-pvcs --delete-secrets --dev || true
  # next step is hanging and not ending by itself. Do we need it?
  # solo cluster-ref reset --cluster-ref kind-${SOLO_CLUSTER_NAME} -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --force || true
  solo cluster-ref config disconnect --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev || true
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

	*)
		echo "Usage: [solo|node]"
		exit 1
		;;
esac