#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${ARENA_BUILD_DIR:-"$ROOT/.build"}
ENGINE=${ARENA_ENGINE_SOURCE:-"$BUILD/ioquake3"}
ASSETS=${ARENA_ASSET_SOURCE:-"$BUILD/openarena-source"}
mkdir -p "$ROOT/public/source"
tar --exclude=.git -czf "$ROOT/public/source/ioquake3-source.tar.gz" -C "$ENGINE" .
tar --exclude=.git --exclude=.DS_Store --exclude=.env --exclude='.env.*' --exclude=__pycache__ --exclude=node_modules --exclude=.build --exclude=runtime --exclude=bin --exclude=./public/engine --exclude=./public/assets/arena.pk3 --exclude=./public/source --exclude=docs/evidence -czf "$ROOT/public/source/tournament-arena-source.tar.gz" -C "$ROOT" .
if [ -d "$ASSETS" ]; then tar -czf "$ROOT/public/source/openarena-preferred-source.tar.gz" -C "$ASSETS" .; fi
