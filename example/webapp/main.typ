// Showcase for the drawio package, laid out like a Typst web app project:
//   main.typ          this file
//   drawio/           the package: lib.typ, native.typ, inflate.typ, drawio.wasm
//   diagrams/         the .drawio files
// (Once the package is on Typst Universe, replace the import with
// #import "@preview/drawio:0.1.0": drawio, drawio-pages)

#import "drawio/lib.typ": drawio, drawio-pages


#set document(title: [drawio for Typst: showcase])
#set page(paper: "a4", margin: 2cm, numbering: "1")
#set text(font: "Libertinus Serif", size: 11pt)
#set heading(numbering: "1.")
#set par(justify: true)
#show figure.caption: set text(size: 10pt)

#align(center, text(20pt, weight: "bold")[drawio for Typst])
#align(center)[Diagrams drawn by draw.io's own renderer, as native Typst content]

#outline(depth: 1)

= Architecture diagrams

Cloud diagrams use draw.io's stencil libraries, here AWS icons, groups and
labelled edges. @fig:arch shows the whole system; labels are drawn with the
bundled Helvetica-like font, yet stay selectable and searchable.

#figure(
  drawio(path("diagrams/architecture.drawio"), width: 100%),
  caption: [Serverless architecture],
) <fig:arch>

= Data models

Tables inside labels, as in the entity–relationship diagram of @fig:er, are
laid out like draw.io does: header bands, columns and crow's-foot edges.

#figure(
  drawio(path("diagrams/er.drawio"), width: 90%),
  caption: [Shop data model],
) <fig:er>

= Flowcharts and pages

A `.drawio` file can have several pages. This one has
#drawio-pages(path("diagrams/flowchart.drawio")).len() pages:
#drawio-pages(path("diagrams/flowchart.drawio")).map(p => ["#p"]).join([ and ]).
@fig:flow shows the first, framed with Typst's own `block`; @fig:page2 the
second, selected by name.

#figure(
  block(stroke: 0.5pt + gray, radius: 4pt, inset: 8pt, width: 100%,
    drawio(path("diagrams/flowchart.drawio"), width: 100%)),
  caption: [Request handling, in a frame],
) <fig:flow>

#figure(
  drawio(path("diagrams/flowchart.drawio"), page: "Second", scale: 1.2),
  caption: [The second page of the same file],
) <fig:page2>

= Shapes, images and rich text

draw.io's general shapes, embedded images, rotation, gradients, shadows and
HTML formatting (@fig:features), and its text styles (@fig:styles).

#figure(
  drawio(path("diagrams/features.drawio"), width: 100%),
  caption: [Stencils, images, rotation, gradients and rich labels],
) <fig:features>

#figure(
  drawio(path("diagrams/text-styles.drawio"), width: 100%),
  caption: [Headings, alignment, lists, vertical and rotated text],
) <fig:styles>

= Outline text and native text

By default labels are outlines in bundled fonts with draw.io's metrics.
With `text: "native"` they are typeset by Typst instead, here in this
document's font.

#grid(
  columns: 2,
  gutter: 1em,
  figure(drawio(path("diagrams/flowchart.drawio"), width: 100%), caption: [`text: "outline"` (default)]),
  figure(drawio(path("diagrams/flowchart.drawio"), width: 100%, text: "native", font: auto),
    caption: [`text: "native"`, document font]),
)

= Dark appearance

Colours defined as light/dark pairs in draw.io, including its default
colours, switch with `theme: "dark"`; `background: auto` adds draw.io's dark
page. Fixed colours chosen in draw.io stay as they are.

#grid(
  columns: 2,
  gutter: 1em,
  figure(drawio(path("diagrams/process.drawio"), width: 100%, padding: 8), caption: [Default]),
  figure(drawio(path("diagrams/process.drawio"), width: 100%, theme: "dark", background: auto, padding: 8),
    caption: [`theme: "dark"`]),
)

#pagebreak()
#outline(title: [List of figures], target: figure)
