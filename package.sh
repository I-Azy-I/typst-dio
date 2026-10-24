#!/usr/bin/env bash
# Assembles the package for Typst Universe as packages/preview/<name>/<version>
# (the layout of the typst/packages repository) and test-compiles an import
# of it from @preview.
# Usage: ./package.sh [output dir, default: dist]
set -euo pipefail
cd "$(dirname "$0")"
out="${1:-dist}"
name=$(sed -n 's/^name = "\(.*\)"/\1/p' typst.toml)
version=$(sed -n 's/^version = "\(.*\)"/\1/p' typst.toml)
[ -f drawio.wasm ] || { echo "drawio.wasm is missing: run plugin/build.sh first" >&2; exit 1; }

dest="$out/packages/preview/$name/$version"
rm -rf "$dest"
mkdir -p "$dest"
cp -r typst.toml LICENSE NOTICE README.md lib.typ native.typ inflate.typ drawio.wasm licenses "$dest/"
echo "$dest: $(du -sh "$dest" | cut -f1)"

# compile a document that imports the package from @preview
test=$(mktemp -d)
trap 'rm -rf "$test"' EXIT
cp example/plain.drawio "$test/"
printf '#import "@preview/%s:%s": drawio, drawio-pages\n#drawio(path("plain.drawio"))\n#drawio-pages(path("plain.drawio"))\n' \
  "$name" "$version" > "$test/main.typ"
typst compile --package-cache-path "$out/packages" "$test/main.typ" "$test/main.pdf"
echo "test import of @preview/$name:$version compiled"
