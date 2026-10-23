#!/usr/bin/env bash
# Fetches the draw.io files the plugin embeds (viewer, shapes, stencils).
set -euo pipefail
cd "$(dirname "$0")"
TAG="${1:-v32.5.5}"
mkdir -p vendor
if [ ! -d vendor/drawio ]; then
  git clone --depth 1 --branch "$TAG" --filter=blob:none --sparse \
    https://github.com/jgraph/drawio.git vendor/drawio
fi
cd vendor/drawio
git sparse-checkout set --no-cone /LICENSE \
  /src/main/webapp/js/viewer-static.min.js \
  /src/main/webapp/js/shapes-14-6-5.min.js \
  /src/main/webapp/js/stencils.min.js \
  /src/main/webapp/img/lib/
