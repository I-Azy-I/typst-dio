// README image, rendered on a white background so it reads on light and dark
// pages (see CONTRIBUTING.md):
//   typst compile --root . docs/readme/hero.typ docs/readme/hero.svg
#import "/lib.typ": drawio

#set page(width: 16cm, height: auto, margin: 6pt, fill: white)
#set text(font: "Nimbus Sans", size: 10pt)
#drawio(path("architecture.drawio"), width: 100%)
