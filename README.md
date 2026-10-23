# drawio for Typst

Render `.drawio` (diagrams.net) files directly in Typst.

*This is an independent project. It is not affiliated with, endorsed by or sponsored by draw.io or JGraph Ltd; "draw.io" is their trademark.*

The default engine runs **draw.io's own code** (mxGraph, Graph.js, Shapes.js and the full stencil libraries) inside a WebAssembly plugin. The plugin records what draw.io paints, and the package replays it with Typst primitives: shapes and edges become `curve`s, labels become real Typst text, and images stay images. Layout, edge routing, arrowheads, stencils (AWS, Azure, GCP, Cisco, UML, BPMN…) and label placement therefore match draw.io. There is no SVG step. Labels follow your document's font and stay selectable.

Plain and compressed files work, as do `.drawio.svg` exports (the embedded diagram is used).

## Usage

```typ
#import "@local/drawio:0.1.0": drawio, drawio-pages

#drawio(read("diagram.drawio", encoding: none))
#drawio(read("diagram.drawio", encoding: none), width: 100%)
#drawio(read("diagram.drawio", encoding: none), page: "Second")
```

| Parameter | Default    | Meaning |
|-----------|------------|---------|
| `data`    | —          | File contents: `read("x.drawio", encoding: none)` |
| `page`    | `0`        | Page index (0-based) or page name |
| `scale`   | `1.0`      | Multiplier on natural size (1 draw.io px = 0.75pt) |
| `width`   | `auto`     | Fit to a length or ratio (e.g. `100%`) instead of using `scale` |
| `padding` | `0`        | Margin around the diagram, in draw.io px |
| `font`    | `auto`     | Label font; `auto` uses the document's font |
| `theme`   | `"light"`  | `"light"` or `"dark"`: draw.io's light or dark appearance (for colours set as light/dark pairs and the defaults) |
| `engine`  | `"plugin"` | `"plugin"` (draw.io's renderer) or `"native"` (pure-Typst approximation) |

`drawio-pages(data)` returns the page names of a file.

## Local install

Build `drawio.wasm` (see below), then copy this folder to `~/.local/share/typst/packages/local/drawio/0.1.0/`
(macOS: `~/Library/Application Support/typst/packages/local/drawio/0.1.0/`).

## Limitations

- Text is laid out by Typst, not a browser, so line breaks in wrapped labels can differ slightly from draw.io. Labels use the document font unless `font` is set, so they don't use the diagram's font families.
- Images must be embedded (data URIs) or come from draw.io's built-in library (`img/lib/...`). Images loaded from the web (e.g. `https://icons.diagrams.net/...`) are skipped, because plugins have no network access.
- Not rendered yet: math labels (`math=1`), sketch/rough style, fill patterns (hatch, dots…), blurred shadows (shadows are drawn as solid offset copies), gradients on rotated shapes, links on shapes.
- HTML labels: bold, italic, underline, strike-through, colour, size, background, super/subscript, line breaks, block alignment and list bullets are kept. Tables inside labels (common in ER diagrams) are flattened to text.
- `drawio.wasm` is about 8.5 MB, including draw.io's built-in image library (2.7 MB). The first diagram in a compile costs about 0.6 s extra while draw.io loads; later diagrams take a fraction of a second, and unchanged diagrams are cached by Typst.

## How it works

```
.drawio ──► drawio.wasm (QuickJS + draw.io viewer + headless DOM shim)
              Graph.getSvg() painting onto a recording canvas
            ──► CBOR command list (paths, text runs, images)
            ──► lib.typ replays them with curve / text / image
```

- `plugin/js/shim.js` is a minimal browser environment (DOM, XML parser and serializer, timers, …) so draw.io runs headless.
- `plugin/js/glue.js` has the recording canvas (an `mxAbstractCanvas2D` that mirrors `mxSvgCanvas2D`'s geometry and text placement), converts HTML labels to styled runs, and encodes the result as CBOR.
- `plugin/js/stencils.js` and `plugin/tools/build-stencils.js` decode stencils one shape at a time, so a render doesn't decompress whole libraries. `node plugin/tools/verify-stencils.js` checks every shape against draw.io's own decoder.
- `plugin/compiler/` precompiles all the JS to QuickJS bytecode with source text and debug info stripped. That's 6 MB of JS down to 1.5 MB deflated.
- `plugin/src/lib.rs` is the Rust plugin (rquickjs + wasm-minimal-protocol). It loads the bytecode, keeps the stencil index, and provides native inflate, base64 and UTF-8 helpers to the JS.
- `SNAPSHOT=1 plugin/build.sh` pre-initialises the module with [Wizer](https://github.com/bytecodealliance/wizer). That removes the load time but stores the JS heap in the module (about 16 MB).
- `native.typ` is the older pure-Typst renderer, kept as `engine: "native"`.

## Fidelity tests

`tests/fidelity/run.sh` renders every page of draw.io's 156 templates and of `example/` twice: with draw.io desktop (the reference) and with this package. It then compares the images.

```sh
tests/fidelity/run.sh            # geometry only: labels hidden in both renderers
tests/fidelity/run.sh full       # with labels (text differs a little by nature)
```

Each diagram is scored by how much of draw.io's ink we reproduce, and vice versa, within 2 px, plus colour error. The run writes `tests/fidelity/work/report-<variant>.md` (worst first) and diff images in `tests/fidelity/work/diff/<variant>/`: reference, ours, and an overlay with red for draw.io only and blue for ours only. It needs draw.io desktop (flatpak `com.jgraph.drawio.desktop` or `drawio` on PATH), plus Python with numpy and Pillow. References are cached, so a re-run takes about 3 minutes.

Current results (draw.io 32.5.5, 160 pages):
- **Geometry:** median 1.000, mean 0.990, 157 at or above 0.95.
- **With labels:** median 1.000, mean 0.959, 142 at or above 0.95.

The remaining outliers are images loaded from the web, HTML tables in labels, and soft shadows.

## Building the plugin

This repository contains no draw.io code or assets. `plugin/build.sh` fetches the pinned draw.io release into `plugin/vendor/` with `plugin/fetch-drawio.sh`: a sparse, blob-less clone holding only the viewer, shapes, stencils, icon library, templates and licences. It then builds `drawio.wasm`. Both the fetched files and `drawio.wasm` are gitignored. To use another draw.io release, run `DRAWIO_TAG=v32.6.0 plugin/fetch-drawio.sh` before building.

Requirements: Rust with the `wasm32-unknown-unknown` target, [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) (only for its clang, which compiles QuickJS's C; set `WASI_SDK` if it is not in `~/.local/opt`), `cargo install wasi-stub`, Node.js and Typst. Optional: `wasm-opt` from [binaryen](https://github.com/WebAssembly/binaryen), and [Wizer](https://github.com/bytecodealliance/wizer/releases) for `SNAPSHOT=1`.

```sh
plugin/build.sh                 # fetches draw.io on first run, writes ./drawio.wasm
                                # (SNAPSHOT=1 for the fast-start variant)
typst compile --root . example/main.typ
```

While working on the JS, `node plugin/tools/node-run.js example/plain.drawio` runs the same code in Node and prints the command list as JSON. `cargo test --release` in `plugin/` runs it natively under QuickJS.

## Licence

MIT for this package. `drawio.wasm` contains:

- **draw.io's source code:** Apache-2.0.
- **draw.io's icon sets and stencil libraries:** draw.io's terms. They may not be used in or distributed for Atlassian products or the Atlassian Marketplace without JGraph's permission; diagrams you create are not restricted.
- **QuickJS and rquickjs:** MIT.

See `NOTICE` and `licenses/`.
