// README image. Render both variants (see CONTRIBUTING.md):
//   typst compile --root . --input theme=light docs/readme/figure.typ docs/readme/figure-light.svg
//   typst compile --root . --input theme=dark  docs/readme/figure.typ docs/readme/figure-dark.svg
#import "/lib.typ" as dio
#let drawio(file, ..args) = dio.drawio(read(file, encoding: none), ..args)
// light: transparent; dark: the same light rendering on a white card, so it
// stays readable on dark pages
#let card = sys.inputs.at("theme", default: "light") == "dark"

#set page(width: 13cm, height: auto, margin: 10pt, fill: if card { white } else { none })
#set text(font: "Libertinus Serif", size: 11pt)

As shown in @fig:flow, invalid requests go straight to the database.

#figure(
  drawio("flowchart.drawio", width: 80%),
  caption: [Request handling],
) <fig:flow>
