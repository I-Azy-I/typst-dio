#!/usr/bin/env bash
# Fetches the draw.io files the plugin is built from into plugin/vendor/drawio
# (a sparse, blob-less clone; nothing of draw.io is kept in this repository):
#   - source: viewer-static.min.js, shapes-14-6-5.min.js, stencils.min.js
#   - icons:  img/lib (draw.io's built-in image library)
#   - tests:  templates/*.xml (only used by tests/fidelity)
#   - LICENSE files
#
#   ./fetch-drawio.sh            the pinned version below
#   DRAWIO_TAG=v32.6.0 ./fetch-drawio.sh
#
# build.sh runs this automatically when the files are missing.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${DRAWIO_TAG:-v32.5.5}"
dir=vendor/drawio

if [ ! -d "$dir/.git" ]; then
  mkdir -p vendor
  git clone --quiet --depth 1 --branch "$TAG" --filter=blob:none --sparse \
    https://github.com/jgraph/drawio.git "$dir"
elif [ "$(git -C "$dir" describe --tags --exact-match 2>/dev/null)" != "$TAG" ]; then
  git -C "$dir" fetch --quiet --depth 1 --filter=blob:none origin tag "$TAG"
  git -C "$dir" -c advice.detachedHead=false checkout --quiet "$TAG"
fi

git -C "$dir" sparse-checkout set --no-cone \
  /LICENSE \
  /src/main/webapp/js/viewer-static.min.js \
  /src/main/webapp/js/shapes-14-6-5.min.js \
  /src/main/webapp/js/stencils.min.js \
  /src/main/webapp/img/LICENSE \
  /src/main/webapp/img/lib/ \
  /src/main/webapp/stencils/LICENSE \
  /src/main/webapp/templates/LICENSE \
  '/src/main/webapp/templates/**/*.xml'

echo "draw.io $TAG in plugin/$dir"
