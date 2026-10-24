// README image. Render both variants (see CONTRIBUTING.md):
//   typst compile --root . --input theme=light docs/readme/hero.typ docs/readme/hero-light.svg
//   typst compile --root . --input theme=dark  docs/readme/hero.typ docs/readme/hero-dark.svg
#import "/lib.typ" as dio
#let drawio(file, ..args) = dio.drawio(read(file, encoding: none), ..args)
// light: transparent; dark: the same light rendering on a white card, so it
// stays readable on dark pages
#let card = sys.inputs.at("theme", default: "light") == "dark"

#set page(width: 16cm, height: auto, margin: 6pt, fill: if card { white } else { none })
#set text(font: "Nimbus Sans", size: 10pt)
#drawio("architecture.drawio", width: 100%)
