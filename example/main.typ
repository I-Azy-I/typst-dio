#import "../lib.typ": drawio, drawio-pages

#set page(width: 17cm, height: auto, margin: 1cm)
#set text(font: "Libertinus Serif", size: 10pt)

= Plain file, fitted to the text width
#drawio(read("plain.drawio", encoding: none), width: 100%)

= Compressed file, natural size
#drawio(read("compressed.drawio", encoding: none))

= Second page, by name
Pages: #drawio-pages(read("plain.drawio", encoding: none)).join(", ")

#drawio(read("plain.drawio", encoding: none), page: "Second")

= Native engine (fallback)
#drawio(read("plain.drawio", encoding: none), width: 100%, engine: "native")

= draw.io features: stencils, images, rich labels, rotation
#drawio(read("features.drawio", encoding: none), width: 100%)
