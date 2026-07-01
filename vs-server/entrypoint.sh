#!/usr/bin/env bash
set -euo pipefail

VS_VERSION="${VS_VERSION:-1.22.3}"
VS_CHANNEL="${VS_CHANNEL:-stable}"
GAME_DIR="${GAME_DIR:-/game}"
DATA_DIR="${DATA_DIR:-/data}"

INSTALL_DIR="${GAME_DIR}/${VS_VERSION}"
ARCHIVE="vs_server_linux-x64_${VS_VERSION}.tar.gz"
CDN_URL="https://cdn.vintagestory.at/gamefiles/${VS_CHANNEL}/${ARCHIVE}"

mkdir -p "${INSTALL_DIR}" "${DATA_DIR}"

if [ ! -f "${INSTALL_DIR}/VintagestoryServer.dll" ]; then
    echo "[vs-server] Downloading Vintage Story ${VS_VERSION} (${VS_CHANNEL})..."
    tmp="$(mktemp -d)"
    wget -q --show-progress -O "${tmp}/${ARCHIVE}" "${CDN_URL}"
    echo "[vs-server] Extracting..."
    tar -xzf "${tmp}/${ARCHIVE}" -C "${INSTALL_DIR}"
    rm -rf "${tmp}"
    echo "[vs-server] Installed to ${INSTALL_DIR}"
else
    echo "[vs-server] Version ${VS_VERSION} already present."
fi

cd "${INSTALL_DIR}"
echo "[vs-server] Starting server (dataPath=${DATA_DIR})..."
exec dotnet VintagestoryServer.dll --dataPath "${DATA_DIR}"
