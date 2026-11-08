// README image, rendered on a white background so it reads on light and dark
// pages (see CONTRIBUTING.md):
//   typst compile --root . docs/readme/balance.typ docs/readme/balance.svg
#import "/lib.typ": drawio
// draw.io's default font, through a font with the same metrics
#let drawio = drawio.with(font: ("Helvetica": "Liberation Sans"))

#set page(width: 14cm, height: auto, margin: 10pt, fill: white)
#set text(font: "Libertinus Serif", size: 10pt)

// red line: the middle of the page
#let demo(title, ..args) = context {
  let body = drawio(path("balance.drawio"), scale: 0.62, ..args)
  align(center, title)
  v(-6pt)
  block(width: 100%, {
    align(center, body)
    place(top + center, line(angle: 90deg, length: measure(body).height, stroke: (paint: red, thickness: 0.7pt, dash: "dashed")))
  })
}

#demo([Default: the note on the right pushes the steps to the left])
#v(8pt)
#demo([`balance: true`: the steps are centred, the note hangs to the side], balance: true)
