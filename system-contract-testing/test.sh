#!/bin/bash
# exit when any command fails
set -e

# required git, zip, kubectl

WORK_DIR="$(pwd)"
CONSENSUS_NODE_DIR="../../hiero-consensus-node"
LATEST_CONSENSUS_COMMIT=""

######################### functions #########################

# Building consensus node from local sources
# Build logic is taken from https://github.com/hiero-ledger/hiero-consensus-node/blob/main/.github/workflows/node-zxc-build-release-artifact.yaml
# from 'Build Artifact' job, steps:
# - Gradle Assemble
# - Stage Artifact Build Folder
# - Write Artifact Version Descriptor
# - Create Artifact Archive
# - Compute SHA Hash
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
  printf "Artifact Folder=%s\n" ${BUILD_BASE_DIR}
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

upgrade_solo_consensus() {
  cd "${CONSENSUS_NODE_DIR}"
  LATEST_CONSENSUS_COMMIT="$(git log -n 1 --pretty=format:"%H")"
  cd "${WORK_DIR}"

  kubectl cp "build-${LATEST_CONSENSUS_COMMIT}.zip" network-node1-0:/home/hedera -n solo-ns-glib
  kubectl cp "build-${LATEST_CONSENSUS_COMMIT}.sha384" network-node1-0:/home/hedera -n solo-ns-glib
  kubectl exec network-node1-0 -n solo-ns-glib -- bash /home/hedera/extract-platform.sh "${LATEST_CONSENSUS_COMMIT}"
}


######################### main #########################
case "$1" in

	build)
		build_consensus_release
		;;

  upgrade)
    upgrade_solo_consensus
    ;;

	*)
		echo "Usage: [build|upgrade]"
		exit 1
		;;
esac