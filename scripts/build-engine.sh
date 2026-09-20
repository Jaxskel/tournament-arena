#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${ARENA_BUILD_DIR:-"$ROOT/.build"}
REVISION=83a776283bdb958f82db25554b5ed0966aaf6e49
mkdir -p "$BUILD" "$ROOT/bin" "$ROOT/public/engine"
if [ ! -d "$BUILD/ioquake3/.git" ]; then git clone https://github.com/ioquake/ioq3.git "$BUILD/ioquake3"; fi
if [ "$(git -C "$BUILD/ioquake3" rev-parse HEAD)" != "$REVISION" ]; then
  git -C "$BUILD/ioquake3" checkout "$REVISION"
fi
python3 "$ROOT/scripts/patch-engine.py" "$BUILD/ioquake3"
cmake -S "$BUILD/ioquake3" -B "$BUILD/native" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_CLIENT=OFF -DBUILD_MACOS_APP=OFF -DBUILD_STANDALONE=ON -DBUILD_GAME_LIBRARIES=OFF
cmake --build "$BUILD/native" -j "${ARENA_BUILD_JOBS:-4}"
cp "$BUILD/native/Release/ioq3ded" "$ROOT/bin/ioq3ded"
if [ "${ARENA_NATIVE_ONLY:-0}" != 1 ]; then
  if ! command -v emcmake >/dev/null; then
    if [ -z "${EMSDK:-}" ]; then echo 'Set EMSDK to an Emscripten 6.0.8 SDK, or source emsdk_env.sh.' >&2; exit 1; fi
    source "$EMSDK/emsdk_env.sh"
  fi
  emcc --version | head -1
  emcmake cmake -S "$BUILD/ioquake3" -B "$BUILD/web" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_STANDALONE=ON -DUSE_VOIP=OFF -DUSE_CODEC_OPUS=OFF -DUSE_OPENAL=OFF -DUSE_MUMBLE=OFF
  cmake --build "$BUILD/web" -j "${ARENA_BUILD_JOBS:-4}"
  cp "$BUILD/web/Release/ioquake3.js" "$BUILD/web/Release/ioquake3.wasm" "$ROOT/public/engine/"
fi
if [ ! -f "$BUILD/openarena-0.8.8.zip" ]; then
  curl -fL --retry 3 'https://web.archive.org/web/20240716135128id_/http://download.tuxfamily.org/openarena/rel/088/openarena-0.8.8.zip' -o "$BUILD/openarena-0.8.8.zip"
fi
python3 "$ROOT/scripts/prepare-assets.py" "$BUILD/openarena-0.8.8.zip" "$BUILD/native/Release" "$BUILD/ioquake3"
