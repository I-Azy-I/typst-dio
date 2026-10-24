# Contributing

## How it works

```
.drawio ──► drawio.wasm (QuickJS + draw.io viewer + headless DOM shim)
              Graph.getSvg() painting onto a recording canvas
            ──► CBOR command list (paths, text runs, images)
            ──► lib.typ replays them with curve / text / image
```

- `plugin/js/shim.js` is a minimal browser environment (DOM, XML and HTML parser, serializer, timers, CSS colour checks, …) so draw.io runs headless.
- `plugin/js/glue.js` has the recording canvas (an `mxAbstractCanvas2D` that mirrors `mxSvgCanvas2D`'s geometry and text placement), converts HTML labels to styled runs, and encodes the result as CBOR.
- `plugin/js/stencils.js` and `plugin/tools/build-stencils.js` decode stencils one shape at a time, so a render doesn't decompress whole libraries. `node plugin/tools/verify-stencils.js` checks every shape against draw.io's own decoder.
- `plugin/tools/build-images.js` packs draw.io's built-in icon library (`img/lib`) for the plugin, in zstd-compressed chunks.
- Outline text (`text: "outline"`, the default): `plugin/tools/build-fonts.py` subsets the Liberation fonts (fetched by `plugin/fetch-fonts.sh`) into `fonts.bin`. `plugin/js/outline.js` lays labels out with them, using shaping by rustybuzz in `src/lib.rs`. It emits positioned glyphs plus an invisible text line per visual line, which `lib.typ` draws as one memoized curve per glyph.
- All data embedded in the plugin is zstd-compressed (`plugin/tools/zstd.js`) and decompressed by ruzstd.
- `plugin/compiler/` precompiles all the JS to QuickJS bytecode with source text and debug info stripped. That's 6 MB of JS down to 1.1 MB with zstd.
- `plugin/src/lib.rs` is the Rust plugin (rquickjs + wasm-minimal-protocol). It loads the bytecode, holds the stencil and image indexes, and provides native inflate, base64 and UTF-8 helpers to the JS.
- `SNAPSHOT=1 plugin/build.sh` pre-initialises the module with [Wizer](https://github.com/bytecodealliance/wizer). That removes the load time but stores the JS heap in the module (about 16 MB).
- `native.typ` is a small pure-Typst renderer, kept as `engine: "native"`.

## Building the plugin

This repository contains no draw.io code or assets, and no fonts. `plugin/build.sh` fetches the pinned draw.io release into `plugin/vendor/` with `plugin/fetch-drawio.sh`: a sparse, blob-less clone holding only the viewer, shapes, stencils, icon library, templates and licences. It then builds `drawio.wasm`. Both the fetched files and `drawio.wasm` are gitignored. To use another draw.io release, run `DRAWIO_TAG=v32.6.0 plugin/fetch-drawio.sh` before building.

Requirements: Rust with the `wasm32-unknown-unknown` target, [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) (only for its clang, which compiles QuickJS's C; set `WASI_SDK` if it is not in `~/.local/opt`), `cargo install wasi-stub`, Node.js 22 or newer (for zstd), Python 3 with fontTools, and Typst 0.15 or newer. Optional: `wasm-opt` from [binaryen](https://github.com/WebAssembly/binaryen), and [Wizer](https://github.com/bytecodealliance/wizer/releases) for `SNAPSHOT=1`.

```sh
plugin/build.sh                 # fetches draw.io on first run, writes ./drawio.wasm
                                # (SNAPSHOT=1 for the fast-start variant)
typst compile --root . example/main.typ
```

To use the package locally before it is on Typst Universe, copy `typst.toml`, `lib.typ`, `native.typ`, `inflate.typ`, `drawio.wasm`, `NOTICE` and `licenses/` to `~/.local/share/typst/packages/local/drawio/0.1.0/` (macOS: `~/Library/Application Support/typst/packages/local/drawio/0.1.0/`) and import `@local/drawio:0.1.0`. In the Typst web app, upload the same files to a folder of your project and import `"<folder>/lib.typ"`.

## Debugging

- `node plugin/tools/node-run.js file.drawio` runs the plugin's JS in Node and prints the command list as JSON.
- `node plugin/tools/render-corpus.js <dir>...` renders every page of every file in Node and reports JS errors with stack traces.
- `cargo test --release` in `plugin/` runs the plugin natively under QuickJS. The ignored tests `time_file` (stage timings) and `eval_js` (evaluate JS in the engine) help with QuickJS-specific problems: `DRAWIO_FILE=x.drawio cargo test --release time_file -- --ignored --nocapture`.
- `DRAWIO_NO_STRIP=1` when running `plugin/compiler` keeps source and debug info in the bytecode, for readable stack traces.

## Fidelity tests

`tests/fidelity/run.sh` renders every page of draw.io's 156 templates and of `example/` twice: with draw.io desktop (the reference) and with this package. It then compares the images.

```sh
tests/fidelity/run.sh            # geometry only: labels hidden in both renderers
tests/fidelity/run.sh full       # with labels, text: "native" (text differs a little by nature)
tests/fidelity/run.sh outline    # with labels, text: "outline"
```

Each diagram is scored by how much of draw.io's ink we reproduce, and vice versa, within 2 px, plus colour error. The run writes `tests/fidelity/work/report-<variant>.md` (worst first) and diff images in `tests/fidelity/work/diff/<variant>/`: reference, ours, and an overlay with red for draw.io only and blue for ours only. It needs draw.io desktop (flatpak `com.jgraph.drawio.desktop` or `drawio` on PATH), plus Python with numpy and Pillow. References are cached, so a re-run takes about 3 minutes.

Current results (draw.io 32.5.5, 160 pages):
- **Geometry:** median 1.000, mean 0.990, 157 at or above 0.95.
- **With labels:** median 1.000, mean 0.959, 142 at or above 0.95.

The remaining outliers are images loaded from the web, HTML tables in labels, and soft shadows.

## README images

The images in `docs/readme/` are rendered by the package itself, in two variants. The light variant has a transparent background. The dark variant is the same rendering on a white background, so it stays readable on dark pages. The README shows the dark variant when the reader's system is in dark mode (`<picture>` with `prefers-color-scheme`).

```sh
for f in hero figure; do for t in light dark; do
  typst compile --root . --input theme=$t docs/readme/$f.typ docs/readme/$f-$t.svg
done; done
```
