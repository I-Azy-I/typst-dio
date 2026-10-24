"""Build step: subsets the Liberation fonts (vendor/fonts, see fetch-fonts.sh)
to the characters diagram labels commonly use and packs them into fonts.bin
for outline text.

The SIL OFL reserves the names "Liberation", "Arimo", "Tinos" and "Cousine"
for unmodified fonts, and a subset is a modified font, so the subsets are
renamed "DrawioTypst Sans/Serif/Mono". Layout features (kerning, ligatures)
are kept so that shaping matches browsers.

fonts.bin (little endian): u32 count, then per font: u16 key length, key
(e.g. "sans-bi"), u32 offset, u32 length (into the data); then the fonts,
each zstd-compressed (tools/zstd.js).
Usage: python3 tools/build-fonts.py   (needs fontTools and Node.js)
"""
import io
import os
import struct
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'vendor', 'fonts')

FAMILIES = {'sans': ('LiberationSans', 'DrawioTypst Sans'),
            'serif': ('LiberationSerif', 'DrawioTypst Serif'),
            'mono': ('LiberationMono', 'DrawioTypst Mono')}
STYLES = {'': ('Regular', 'Regular'), '-b': ('Bold', 'Bold'),
          '-i': ('Italic', 'Italic'), '-bi': ('BoldItalic', 'Bold Italic')}
# Latin (Western, Central and Eastern European), Greek, punctuation,
# currency, letterlike symbols, arrows, math operators, geometric shapes.
# Labels with other characters fall back to native text (see glue.js).
UNICODES = ('U+0020-024F,U+02C6-02DD,U+0370-03FF,U+2000-206F,U+20A0-20CF,U+2100-214F,'
            'U+2190-21FF,U+2200-22FF,U+25A0-25FF')


def build(src, family, style):
    font = TTFont(src)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.drop_tables += ['FFTM']
    sub = subset.Subsetter(options)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    names = font['name']
    full = family if style == 'Regular' else f'{family} {style}'
    ps = (family + '-' + style).replace(' ', '')
    for rec in names.names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID in (2, 17):
            rec.string = style
        elif rec.nameID == 4:
            rec.string = full
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 3:
            rec.string = f'{ps}; subset of Liberation 2.1.5 for drawio-typst'
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def main():
    entries, blobs = [], []
    raw_total = 0
    for key, (base, family) in FAMILIES.items():
        for suffix, (file_style, style) in STYLES.items():
            data = build(os.path.join(SRC, f'{base}-{file_style}.ttf'), family, style)
            raw_total += len(data)
            packed = subprocess.run(['node', '-e', 'process.stdout.write(require("./tools/zstd").compress(require("fs").readFileSync(0)))'],
                                    input=data, capture_output=True, check=True, cwd=ROOT).stdout
            entries.append((key + suffix, len(packed)))
            blobs.append(packed)
    head = [struct.pack('<I', len(entries))]
    off = 0
    for key, n in entries:
        k = key.encode()
        head.append(struct.pack('<H', len(k)) + k + struct.pack('<II', off, n))
        off += n
    with open(os.path.join(ROOT, 'fonts.bin'), 'wb') as f:
        f.write(b''.join(head) + b''.join(blobs))
    print(f'{len(entries)} fonts, subset {raw_total / 1e6:.2f} MB -> packed {off / 1e6:.2f} MB', file=sys.stderr)


if __name__ == '__main__':
    main()
