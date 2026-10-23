#import "../lib.typ": drawio, drawio-pages

#set page(width: 17cm, height: auto, margin: 1cm)
#set text(font: "Libertinus Serif", size: 10pt)

= Plain file, fitted to the text width
#drawio(path("plain.drawio"), width: 100%)

= Compressed file, natural size
#drawio(path("compressed.drawio"))

= Second page, by name
Pages: #drawio-pages(path("plain.drawio")).join(", ")

#drawio(path("plain.drawio"), page: "Second")

= Native engine (fallback)
#drawio(path("plain.drawio"), width: 100%, engine: "native")

= draw.io features: stencils, images, rich labels, rotation
#drawio(path("features.drawio"), width: 100%)

= Fonts from the diagram, with substitutions
#drawio(path("fonts.drawio"), font: (
  "Helvetica": "Nimbus Sans",
  "Verdana": "DejaVu Sans",
  "Courier New": "Liberation Mono",
  "Times New Roman": "Liberation Serif",
))
