"""Renders every prepared case with the Typst package, one page per case, to
<work>/ours/<variant>/<id>.png at 96 ppi (1 draw.io px = 1 image px).
Usage: python3 render.py <work> <variant: geom|full>"""
import json, os, shutil, subprocess, sys

work, variant = sys.argv[1], sys.argv[2]
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
work = os.path.abspath(work)
cases = json.load(open(os.path.join(work, 'cases.json')))
rel = os.path.relpath(os.path.join(work, 'cases', variant), repo)
# Nimbus Sans is metric-compatible with Helvetica, draw.io's default font
font = 'font: "Nimbus Sans", ' if variant == 'full' else ''
lines = ['#import "/lib.typ": drawio',
         '#set page(width: auto, height: auto, margin: 0pt, fill: white)']
for i, c in enumerate(cases):
    if i:
        lines.append('#pagebreak()')
    lines.append(f'#drawio(read("/{rel}/{c["id"]}.drawio", encoding: none), {font}padding: 0, background: auto)')
doc = os.path.join(work, f'ours-{variant}.typ')
open(doc, 'w').write('\n'.join(lines) + '\n')

out = os.path.join(work, 'ours', variant)
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
subprocess.run(['typst', 'compile', '--root', repo, '--ppi', '96', doc,
                os.path.join(out, '{0p}.png')], check=True)
pages = sorted(f for f in os.listdir(out) if f.endswith('.png'))
assert len(pages) == len(cases), f'{len(pages)} pages for {len(cases)} cases'
for f, c in zip(pages, cases):
    os.rename(os.path.join(out, f), os.path.join(out, c['id'] + '.png'))
print(f'{len(cases)} cases rendered to {out}')
