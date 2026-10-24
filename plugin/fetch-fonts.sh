#!/usr/bin/env bash
# Fetches the Liberation fonts (SIL OFL 1.1) that outline text is drawn with
# into plugin/vendor/fonts. They have the metrics of Arial/Helvetica, Times
# New Roman and Courier New. build.sh runs this when the fonts are missing.
set -euo pipefail
cd "$(dirname "$0")"
URL=https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz
SHA256=7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0
mkdir -p vendor/fonts
cd vendor/fonts
[ -f liberation.tar.gz ] || curl -sfL "$URL" -o liberation.tar.gz
echo "$SHA256  liberation.tar.gz" | sha256sum -c --quiet
tar xzf liberation.tar.gz --strip-components=1
echo "Liberation fonts 2.1.5 in plugin/vendor/fonts"
