#!/usr/bin/env bash
# Builds ../drawio.wasm: QuickJS + draw.io viewer as stripped bytecode.
#
#   ./build.sh              small module (~6 MB); draw.io is loaded from
#                           bytecode on the first call (~0.6 s per compile)
#   SNAPSHOT=1 ./build.sh   pre-initialised with Wizer: no load time, but the
#                           JS heap is stored in the module (~16 MB)
#
# Requirements: Rust with the wasm32-unknown-unknown target, wasi-sdk (for its
# clang; set WASI_SDK, default ~/.local/opt/wasi-sdk-*), wasi-stub
# (`cargo install wasi-stub`), Node.js 22+ (zstd), Python 3 with fontTools;
# optional: wasm-opt (binaryen), and
# wizer for SNAPSHOT=1. The draw.io sources are fetched (fetch-drawio.sh) on
# the first build; nothing of draw.io is stored in this repository.
set -euo pipefail
cd "$(dirname "$0")"

WASI_SDK="${WASI_SDK:-$(ls -d "$HOME"/.local/opt/wasi-sdk-* 2>/dev/null | sort -V | tail -1)}"
[ -x "$WASI_SDK/bin/clang" ] || { echo "wasi-sdk not found; set WASI_SDK" >&2; exit 1; }

# Fetch draw.io (pinned tag) if it is not there yet
[ -f vendor/drawio/src/main/webapp/js/viewer-static.min.js ] || ./fetch-drawio.sh

# Fetch the Liberation fonts for outline text if they are not there yet
[ -f vendor/fonts/LiberationSans-Regular.ttf ] || ./fetch-fonts.sh

node tools/build-stencils.js
node tools/build-images.js
python3 tools/build-fonts.py
# Precompile the JS to stripped bytecode (host build of QuickJS)
(cd compiler && cargo run --release -q -- ..)
node tools/zstd.js bytecode.raw bytecode.bin

export CC_wasm32_unknown_unknown="$WASI_SDK/bin/clang"
export AR_wasm32_unknown_unknown="$WASI_SDK/bin/llvm-ar"
cargo build --release --target wasm32-unknown-unknown

out=target/wasm32-unknown-unknown/release
# The QuickJS shim imports a clock; Typst provides no such host function.
wasi-stub "$out/drawio_plugin.wasm" --stub-module env -r 0 -o "$out/stubbed.wasm" >/dev/null
module="$out/stubbed.wasm"

if [ "${SNAPSHOT:-0}" = 1 ]; then
  # Snapshot with draw.io already evaluated, so Typst skips loading the JS.
  wizer "$module" -o "$out/snapshot.wasm" -f wizer.initialize \
    --preload typst_env=tools/typst_env.wat
  module="$out/snapshot.wasm"
fi

if command -v wasm-opt >/dev/null; then
  wasm-opt "$module" -O2 --enable-bulk-memory --enable-nontrapping-float-to-int \
    --enable-sign-ext --enable-mutable-globals -o "$out/drawio.wasm"
else
  cp "$module" "$out/drawio.wasm"
fi
cp "$out/drawio.wasm" ../drawio.wasm
ls -la ../drawio.wasm
