#!/bin/bash
# exit when any command fails
set -e

# This script is used to easy start/stop local Hedera Network (with solo).
# It also deploy some pre-requirements for hardhat test like:
#   - create accounts with preconfigured keys and initial balance

WORK_DIR="$(pwd)"

######################### CN configs #########################
LOCAL_CN_BUILD=true
CONSENSUS_NODE_DIR="../../hiero-consensus-node"
APP_PROPERTIES_PATH="local/application.properties"

######################### MN configs #########################
LOCAL_MN_BUILD=false
MIRROR_NODE_DIR="../../hiero-mirror-node"
MIRROR_NODE_VERSION=0.153.0
MIRROR_NODE_YAML_PATH="local/mn-values.yaml"
# if images are set, we will load this images to kind cluster instead of official MN images
MIRROR_NODE_WEB3_IMAGE="docker.io/ikavaldzhiev/hedera-mirror-web3:pectra"
# with rest image override on startup, pinger is not working somehow
#MIRROR_NODE_REST_IMAGE="docker.io/ikavaldzhiev/hedera-mirror-rest:pectra"
MIRROR_NODE_IMPORTER_IMAGE="docker.io/ikavaldzhiev/hedera-mirror-importer:pectra"

######################### Relay configs #########################
LOCAL_RELAY_BUILD=true
RELAY_RELEASE=0.76.2
RELAY_DIR="../../hiero-json-rpc-relay"
RELAY_YAML_PATH="local/relay-values.yaml"

######################### Solo configs #########################
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

# Initial HBAR amount for test accounts 1,000,000,000 (one billion) HBARs
export TEST_ACCOUNT_HBAR_AMOUNT=1000000000

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

  # Solo deploy
  check_k8s_context
  solo init --dev
  solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --dev
  solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev
  solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1 --dev
  solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev

  # CN deploy
  solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev
  solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --application-properties "${APP_PROPERTIES_PATH}" --dev
  if [ "${LOCAL_CN_BUILD}" = true ] ; then
    # local CN build
    cd "${CONSENSUS_NODE_DIR}"
    ./gradlew assemble
    cd "${WORK_DIR}"
    solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1 --local-build-path "${CONSENSUS_NODE_DIR}/hedera-node/data/" --dev
  else
    solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1 --dev
  fi
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1 --dev

  # MN deploy
  # Load configured images
  if [ -n "${MIRROR_NODE_WEB3_IMAGE}" ]; then
    docker pull "${MIRROR_NODE_WEB3_IMAGE}"
    docker image tag "${MIRROR_NODE_WEB3_IMAGE}" "gcr.io/mirrornode/hedera-mirror-web3:${MIRROR_NODE_VERSION}"
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-web3:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
  fi
  if [ -n "${MIRROR_NODE_REST_IMAGE}" ]; then
    docker pull ${MIRROR_NODE_REST_IMAGE}
    docker image tag "${MIRROR_NODE_REST_IMAGE}" "gcr.io/mirrornode/hedera-mirror-rest:${MIRROR_NODE_VERSION}"
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-rest:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
  fi
  if [ -n "${MIRROR_NODE_IMPORTER_IMAGE}" ]; then
    docker pull ${MIRROR_NODE_IMPORTER_IMAGE}
    docker image tag "${MIRROR_NODE_IMPORTER_IMAGE}" "gcr.io/mirrornode/hedera-mirror-importer:${MIRROR_NODE_VERSION}"
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-importer:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
  fi
  if [ "${LOCAL_MN_BUILD}" = true ] ; then
    # local MN build
    # if we set `$MIRROR_NODE_VERSION=local`, it will not be able to pull helm chart by this version
    # if we update the chart with `--mirror-node-chart-dir` it will use image version from chart `appVersion`
    # so the best way is to locally prebuild and override some images and because of `image.pullPolicy: IfNotPresent` k8s will use locally built images
    cd "${MIRROR_NODE_DIR}"
    ./gradlew :web3:clean :web3:build -x test && ./gradlew :rest:clean :rest:build -x test && ./gradlew :importer:clean :importer:build -x test
    docker build -t "gcr.io/mirrornode/hedera-mirror-web3:${MIRROR_NODE_VERSION}" web3/
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-web3:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
    docker build -t "gcr.io/mirrornode/hedera-mirror-rest:${MIRROR_NODE_VERSION}" rest/
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-rest:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
    docker build -t "gcr.io/mirrornode/hedera-mirror-importer:${MIRROR_NODE_VERSION}" importer/
    kind load docker-image "gcr.io/mirrornode/hedera-mirror-importer:${MIRROR_NODE_VERSION}" --name "${SOLO_CLUSTER_NAME}"
    cd "${WORK_DIR}"
    solo mirror node add --mirror-node-version "${MIRROR_NODE_VERSION}" --enable-ingress --pinger --values-file "${MIRROR_NODE_YAML_PATH}" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev
  else
    solo mirror node add --mirror-node-version "${MIRROR_NODE_VERSION}" --enable-ingress --pinger --values-file "${MIRROR_NODE_YAML_PATH}" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev
  fi

  # Relay deploy
  if [ "${LOCAL_RELAY_BUILD}" = true ] ; then
    # local Relay build
    cd "${RELAY_DIR}"
    docker build -t "ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.0.1-local" .
    kind load docker-image "ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.0.1-local" --name "${SOLO_CLUSTER_NAME}"
    # no need to change helm chart because image version is taken from --relay-release instead of chart configs
    # cd charts/hedera-json-rpc
    # helm dependency build
    # --relay-chart-dir "${RELAY_DIR}/charts"
    cd "${WORK_DIR}"
    solo relay node add --relay-release "0.0.1-local" --deployment "${SOLO_DEPLOYMENT}" --values-file "${RELAY_YAML_PATH}" -i node1 --dev
  else
    solo relay node add --relay-release "${RELAY_RELEASE}" --deployment "${SOLO_DEPLOYMENT}" --values-file "${RELAY_YAML_PATH}" -i node1 --dev
  fi

  # Explorer deploy
  solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --dev

  # Add test accounts to the network
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

solo_destroy() {
  kubectl delete namespace "${SOLO_NAMESPACE}" || true
  kubectl delete namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}" || true
  kind delete cluster -n "${SOLO_CLUSTER_NAME}" || true
  rm -rf ~/.solo
}

solo_status() {
  cat ~/.solo/local-config.yaml || true
  echo "-------------------------------------------------------------------------"
  kubectl get pods -n "${SOLO_NAMESPACE}"
}

######################### main #########################
case "$1" in
  solo)
    shift
    case "$1" in
      start)
        shift
        solo_start
        ;;
      stop)
        shift
        solo_stop
        ;;
      status)
        shift
        solo_status
        ;;
      destroy)
        shift
        solo_destroy
        ;;
    	*)
    		echo "Usage: [ start | stop | status | destroy ]"
    		exit 1
    		;;
    esac
    ;;

	*)
		echo "Usage: [ solo ]"
		exit 1
		;;
esac