// README image, rendered on a white background so it reads on light and dark
// pages (see CONTRIBUTING.md):
//   typst compile --root . docs/readme/figure.typ docs/readme/figure.svg
#import "/lib.typ": drawio
// draw.io's default font, through a font with the same metrics
#let drawio = drawio.with(font: ("Helvetica": "Liberation Sans"))

#set page(width: 13cm, height: auto, margin: 10pt, fill: white)
#set text(font: "Libertinus Serif", size: 11pt)

As shown in @fig:flow, invalid requests are rejected before they reach the API.

#figure(
  drawio(path("flowchart.drawio"), width: 80%),
  caption: [Request handling],
) <fig:flow>
