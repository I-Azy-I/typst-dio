// drawio — render draw.io / diagrams.net files in Typst.
//
// The default "plugin" engine runs draw.io's own code (mxGraph, Graph.js,
// Shapes.js and the stencil libraries) in a WebAssembly plugin and replays
// its drawing commands with Typst primitives: shapes and edges become
// `curve`s, labels become real Typst text, images stay images. The "native"
// engine (native.typ) is a pure-Typst approximation kept as a fallback.
//
// Usage:
//   #import "@local/drawio:0.1.0": drawio
//   #drawio(read("diagram.drawio", encoding: none))

#import "native.typ" as native

#let _plugin = plugin("drawio.wasm")

// ───────────────────────── Paint ─────────────────────────

#let _stroke(it, s) = {
  if it.at("stroke", default: none) == none { return none }
  let dash = it.at("dash", default: none)
  stroke(
    paint: rgb(it.stroke),
    thickness: it.sw * s,
    dash: if dash == none { none } else { dash.map(d => d * s) },
    cap: it.at("cap", default: "butt"),
    join: it.at("join", default: "miter"),
    miter-limit: it.at("miter", default: 10),
  )
}

#let _fill(it) = {
  let g = it.at("grad", default: none)
  if g != none {
    if g.radial { gradient.radial(rgb(g.a), rgb(g.b)) } else {
      gradient.linear(rgb(g.a), rgb(g.b), angle: g.ang * 1deg)
    }
  } else if it.at("fill", default: none) != none { rgb(it.fill) } else { none }
}

#let _segments(d, s, dx: 0, dy: 0) = d.map(seg => {
  let op = seg.at(0)
  let p(i) = ((seg.at(i) + dx) * s, (seg.at(i + 1) + dy) * s)
  if op == "m" { curve.move(p(1)) } else if op == "l" { curve.line(p(1)) } else if op == "c" {
    curve.cubic(p(1), p(3), p(5))
  } else if op == "q" { curve.quad(p(1), p(3)) } else { curve.close(mode: "straight") }
})

#let _path(it, s) = {
  let fill = _fill(it)
  let sk = _stroke(it, s)
  let sh = it.at("shadow", default: none)
  if sh != none {
    let c = rgb(sh.c)
    place(top + left, curve(
      fill: if fill != none { c } else { none },
      stroke: if sk != none { stroke(paint: c, thickness: sk.thickness, dash: sk.dash, cap: sk.cap, join: sk.join) } else { none },
      .._segments(it.d, s, dx: sh.dx, dy: sh.dy),
    ))
  }
  place(top + left, curve(fill: fill, stroke: sk, .._segments(it.d, s)))
}

// ───────────────────────── Images ─────────────────────────

#let _image(it, s) = {
  if it.at("data", default: none) == none { return }
  let w = it.w * s
  let h = it.h * s
  let img = image(it.data, format: it.fmt, width: w, height: h, fit: it.fit)
  let fh = it.at("fh", default: false)
  let fv = it.at("fv", default: false)
  if fh or fv { img = scale(x: if fh { -100% } else { 100% }, y: if fv { -100% } else { 100% }, img) }
  if it.rot != 0 { img = rotate(it.rot * 1deg, img) }
  place(top + left, dx: it.cx * s - w / 2, dy: it.cy * s - h / 2, img)
}

// ───────────────────────── Text ─────────────────────────

#let _run(r, base, s) = {
  let body = [#r.t]
  if r.at("sup", default: 0) == 1 { body = super(body) }
  if r.at("sub", default: 0) == 1 { body = sub(body) }
  if r.at("u", default: base.at("u", default: 0)) == 1 { body = underline(body) }
  if r.at("s", default: base.at("s", default: 0)) == 1 { body = strike(body) }
  if r.at("bg", default: none) != none { body = highlight(fill: rgb(r.bg), body) }
  if r.at("href", default: none) != none { body = link(r.href, body) }
  text(
    size: r.at("sz", default: base.sz) * s,
    weight: if r.at("b", default: base.at("b", default: 0)) == 1 { "bold" } else { "regular" },
    style: if r.at("i", default: base.at("i", default: 0)) == 1 { "italic" } else { "normal" },
    fill: rgb(r.at("c", default: base.c)),
    body,
  )
}

#let _halign = (left: left, center: center, right: right, justify: left)

#let _label-body(it, s, font) = {
  // HTML labels use line-height 1.2 with the glyphs centred in the line box.
  set text(top-edge: 0.95em, bottom-edge: -0.25em, size: it.sz * s, hyphenate: false)
  set text(font: font) if font != auto
  set par(leading: 0pt, spacing: 0pt, justify: false, first-line-indent: 0pt, hanging-indent: 0pt)
  let line-body(l) = {
    let body = if l.runs.len() == 0 {
      // empty line: keeps the height of one line
      text(size: it.sz * s, hide[x])
    } else { l.runs.map(r => _run(r, it, s)).join() }
    let a = l.at("align", default: none)
    if a != none { align(_halign.at(a), body) } else { body }
  }
  let lines = it.lines.map(line-body)
  let ta = _halign.at(it.al, default: center)
  if it.wrap {
    box(width: it.w, align(ta, stack(..lines)))
  } else {
    // stack lines aligned like CSS text-align within the widest line
    box(align(ta, stack(..lines.map(l => align(ta, l)))))
  }
}

#let _text(it, s, font) = context {
  let it = it
  it.w = it.w * s
  let body = _label-body(it, s, font)
  let m = measure(body)
  let cw = m.width
  let ch = m.height
  let clip = it.at("clip", default: none)
  if clip != none and ch > clip * s {
    body = box(width: cw, height: clip * s, clip: true, body)
    ch = clip * s
  }
  let bg = it.at("bg", default: none)
  let bd = it.at("bd", default: none)
  if bg != none or bd != none {
    let pad = it.at("pad", default: (0, 0, 0, 0)).map(v => v * s)
    body = box(
      fill: if bg != none { rgb(bg) } else { none },
      stroke: if bd != none { rgb(bd) + it.bw * s } else { none },
      outset: (top: pad.at(0), right: pad.at(1), bottom: pad.at(2), left: pad.at(3)),
      body,
    )
  }
  let bw = it.w
  let bh = it.h * s
  let x = it.x * s + if it.al == "left" { 0pt } else if it.al == "right" { bw - cw } else { (bw - cw) / 2 }
  let y = it.y * s + if it.va == "top" { 0pt } else if it.va == "bottom" { bh - ch } else { (bh - ch) / 2 }
  let rot = it.at("rot", default: 0)
  if rot == 0 {
    place(top + left, dx: x, dy: y, body)
  } else {
    // rotate about the label anchor, like mxSvgCanvas2D
    let ax = it.ax * s
    let ay = it.ay * s
    place(top + left, dx: ax, dy: ay, rotate(rot * 1deg, origin: top + left, reflow: false,
      box(width: 0pt, height: 0pt, place(top + left, dx: x - ax, dy: y - ay, body))))
  }
}

// ───────────────────────── Public API ─────────────────────────

#let _render-plugin(data, page, padding, theme: "light", list-only: false) = {
  let opts = json.encode((page: page, border: padding, theme: theme, listOnly: list-only), pretty: false)
  cbor(_plugin.render(data, bytes(opts)))
}

#let _draw(r, s, font) = {
  let items = r.items.map(it => {
    if it.k == "p" { _path(it, s) } else if it.k == "t" { _text(it, s, font) } else if it.k == "i" {
      _image(it, s)
    }
  })
  box(
    width: r.w * s,
    height: r.h * s,
    fill: if r.bg != none { rgb(r.bg) } else { none },
    items.join(),
  )
}

/// Renders a draw.io diagram.
///
/// - data (bytes, str): file contents, e.g. `read("fig.drawio", encoding: none)`.
///   Plain and compressed `.drawio` / `.xml` files and `.drawio.svg` exports work.
/// - page (int, str): page index (0-based) or page name.
/// - scale (float): multiplier on the natural size (1 draw.io px = 0.75pt).
/// - width (auto, length, ratio): fit the diagram to this width instead of using `scale`.
/// - padding (int, float): empty margin around the diagram, in draw.io px.
/// - font (auto, str, array): font for labels; `auto` uses the document's font.
/// - theme (str): `"light"` or `"dark"`: which colour of draw.io's `light-dark()`
///   pairs to use, like draw.io's light/dark appearance. Dark adds draw.io's dark
///   page background unless the diagram sets its own.
/// - engine (str): `"plugin"` (draw.io's own renderer) or `"native"` (pure Typst approximation).
#let drawio(data, page: 0, scale: 1.0, width: auto, padding: 0, font: auto, theme: "light", engine: "plugin") = {
  assert(theme in ("light", "dark"), message: "drawio: theme must be \"light\" or \"dark\"")
  if type(data) == str { data = bytes(data) }
  if engine == "native" {
    return native.drawio(data, page: page, scale: scale, width: width, padding: padding)
  }
  assert(engine == "plugin", message: "drawio: engine must be \"plugin\" or \"native\"")
  let r = _render-plugin(data, page, padding, theme: theme)
  if r.w == 0 or r.h == 0 { return box() }
  if width == auto {
    _draw(r, 0.75pt * scale, font)
  } else {
    layout(size => {
      let target = if type(width) == ratio { size.width * (width / 100%) } else if type(width) == relative {
        size.width * width.ratio + width.length
      } else { width }
      _draw(r, target / r.w, font)
    })
  }
}

/// Returns the names of all pages in a draw.io file (unnamed pages are
/// reported as "Page-1", "Page-2", … like draw.io does).
#let drawio-pages(data) = {
  if type(data) == str { data = bytes(data) }
  _render-plugin(data, 0, 0, list-only: true).pages
}
