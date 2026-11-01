#!/usr/bin/env bash
# Fidelity test: renders a corpus with draw.io desktop (reference) and with
# this package, then compares them.
#
#   tests/fidelity/run.sh [variant...]     variants: geom (default), full
#
# geom: labels hidden (noLabel=1) in both renderers, so shapes, edges, stencils
#       and images are compared exactly.
# full: labels shown; text differs a little by nature (Typst lays out the
#       text, with Nimbus Sans standing in for Helvetica).
#
# Corpus: draw.io's templates (plugin/vendor, via plugin/fetch-drawio.sh) and
# example/. Extra directories: CORPUS="dir1 dir2" tests/fidelity/run.sh
# Requires: draw.io desktop (flatpak com.jgraph.drawio.desktop, or `drawio`
# on PATH; set DRAWIO to override), Typst, Node.js, Python 3 with numpy and
# Pillow. References are cached in work/ref and re-exported only for cases
# whose file changed. Results: work/report-<variant>.md, work/diff/<variant>/.
set -euo pipefail
cd "$(dirname "$0")"
repo=$(cd ../.. && pwd)
work="$PWD/work"
variants=("${@:-geom}")

if [ -z "${DRAWIO:-}" ]; then
  if command -v drawio >/dev/null; then DRAWIO=drawio
  else DRAWIO="flatpak run com.jgraph.drawio.desktop"; fi
fi

corpus="$repo/plugin/vendor/drawio/src/main/webapp/templates $repo/example ${CORPUS:-}"
# shellcheck disable=SC2086
node prepare.js "$work" $corpus

for v in "${variants[@]}"; do
  # Reference export only for cases without an up-to-date reference
  todo="$work/todo/$v"
  rm -rf "$todo"; mkdir -p "$todo" "$work/ref/$v"
  for f in "$work/cases/$v"/*.drawio; do
    id=$(basename "$f" .drawio)
    ref="$work/ref/$v/$id.png"
    if [ ! -f "$ref" ] || ! cmp -s "$f" "$work/ref/$v/$id.drawio"; then cp "$f" "$todo/"; fi
  done
  if [ -n "$(ls -A "$todo")" ]; then
    echo "exporting $(ls "$todo" | wc -l) references with draw.io ($v)"
    $DRAWIO --export --format png --scale 1 --border 0 --output "$work/ref/$v" "$todo" 2>&1 \
      | grep -v -E 'dbus|gpu_persistent|zypak|->' || true
    for f in "$todo"/*.drawio; do cp "$f" "$work/ref/$v/"; done
  fi
  python3 render.py "$work" "$v"
  python3 compare.py "$work" "$v"
done
