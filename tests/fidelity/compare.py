"""Compares our renders with draw.io's reference PNGs.

For each case: both images are flattened on white, then our image is shifted
by up to ±SHIFT px to the best overlap (export bounds differ by a few px).
"Ink" is any pixel that differs visibly from white. Scores:

  recall     share of reference ink with our ink within TOL px (nothing missing)
  precision  share of our ink with reference ink within TOL px (nothing extra)
  f1         harmonic mean of the two: the headline score
  color      mean RGB distance (0-255) where both have ink

Writes <work>/report-<variant>.md (worst first) and side-by-side diff images
(reference | ours | overlay: red = only draw.io, blue = only ours) in
<work>/diff/<variant>/.
Usage: python3 compare.py <work> <variant> [--threshold 0.95]
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image, ImageFilter

SHIFT = 4
TOL = 2
INK = 40  # summed RGB distance from white that counts as ink


def load(path):
    im = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    return np.asarray(Image.alpha_composite(bg, im).convert('RGB')).astype(np.int16)


def ink(a):
    return (765 - a.sum(axis=2)) > INK


def dilate(mask, r):
    im = Image.fromarray(mask.astype(np.uint8) * 255)
    return np.asarray(im.filter(ImageFilter.MaxFilter(2 * r + 1))) > 0


def pad(a, h, w):
    out = np.full((h, w, 3), 255, np.int16)
    out[:a.shape[0], :a.shape[1]] = a
    return out


def compare(ref, ours):
    h = max(ref.shape[0], ours.shape[0]) + 2 * SHIFT
    w = max(ref.shape[1], ours.shape[1]) + 2 * SHIFT
    R = np.full((h, w, 3), 255, np.int16)
    R[SHIFT:SHIFT + ref.shape[0], SHIFT:SHIFT + ref.shape[1]] = ref
    rink = ink(R)
    oink0 = ink(ours)
    # best shift: the one with the most overlapping ink
    best = None
    for dy in range(2 * SHIFT + 1):
        for dx in range(2 * SHIFT + 1):
            oh, ow = min(ours.shape[0], h - dy), min(ours.shape[1], w - dx)
            overlap = (rink[dy:dy + oh, dx:dx + ow] & oink0[:oh, :ow]).sum()
            if best is None or overlap > best[0]:
                best = (overlap, dx, dy)
    _, dx, dy = best
    O = np.full((h, w, 3), 255, np.int16)
    oh, ow = min(ours.shape[0], h - dy), min(ours.shape[1], w - dx)
    O[dy:dy + oh, dx:dx + ow] = ours[:oh, :ow]
    dx, dy = dx - SHIFT, dy - SHIFT
    oink = ink(O)
    rn, on = rink.sum(), oink.sum()
    recall = (rink & dilate(oink, TOL)).sum() / rn if rn else 1.0
    precision = (oink & dilate(rink, TOL)).sum() / on if on else 1.0
    f1 = 2 * recall * precision / (recall + precision) if recall + precision else 0.0
    both = rink & oink
    color = float(np.abs(R - O)[both].sum(axis=1).mean() / 3) if both.any() else 0.0
    overlay = np.full((h, w, 3), 255, np.uint8)
    overlay[rink & ~oink] = (230, 40, 40)
    overlay[oink & ~rink] = (40, 90, 230)
    overlay[both] = (150, 150, 150)
    return dict(recall=float(recall), precision=float(precision), f1=float(f1), color=color,
                shift=(dx, dy)), R.astype(np.uint8), O.astype(np.uint8), overlay


def main():
    work, variant = sys.argv[1], sys.argv[2]
    threshold = float(sys.argv[sys.argv.index('--threshold') + 1]) if '--threshold' in sys.argv else 0.95
    cases = json.load(open(os.path.join(work, 'cases.json')))
    diff_dir = os.path.join(work, 'diff', variant)
    shutil.rmtree(diff_dir, ignore_errors=True)
    os.makedirs(diff_dir)
    rows, missing = [], []
    for c in cases:
        ref_p = os.path.join(work, 'ref', variant, c['id'] + '.png')
        our_p = os.path.join(work, 'ours', variant, c['id'] + '.png')
        if not os.path.exists(ref_p) or not os.path.exists(our_p):
            missing.append((c['id'], os.path.exists(ref_p), os.path.exists(our_p)))
            continue
        ref, ours = load(ref_p), load(our_p)
        m, R, O, overlay = compare(ref, ours)
        m.update(id=c['id'], source=c['source'], page=c['page'],
                 size=(ref.shape[1], ref.shape[0], ours.shape[1], ours.shape[0]))
        rows.append(m)
        if m['f1'] < threshold:
            sep = np.full((R.shape[0], 8, 3), 255, np.uint8)
            Image.fromarray(np.hstack([R, sep, O, sep, overlay])).save(os.path.join(diff_dir, c['id'] + '.png'))

    rows.sort(key=lambda r: r['f1'])
    f1s = np.array([r['f1'] for r in rows])
    out = [f'# Fidelity report: {variant}', '',
           f'{len(rows)} cases compared with draw.io desktop exports. '
           f'Median F1 {np.median(f1s):.3f}, mean {f1s.mean():.3f}; '
           f'{(f1s >= threshold).sum()} of {len(rows)} at or above {threshold}.', '']
    if missing:
        out += ['Not compared (missing reference or render):', '']
        out += [f'- `{i}` (reference: {"yes" if r else "no"}, ours: {"yes" if o else "no"})' for i, r, o in missing]
        out += ['']
    out += ['| case | F1 | recall | precision | colour | size ref → ours | shift |',
            '|---|---|---|---|---|---|---|']
    for r in rows:
        mark = ' ⚠' if r['f1'] < threshold else ''
        s = r['size']
        out.append(f"| `{r['id']}`{mark} | {r['f1']:.3f} | {r['recall']:.3f} | {r['precision']:.3f} | "
                   f"{r['color']:.1f} | {s[0]}×{s[1]} → {s[2]}×{s[3]} | {r['shift'][0]},{r['shift'][1]} |")
    open(os.path.join(work, f'report-{variant}.md'), 'w').write('\n'.join(out) + '\n')
    json.dump(rows, open(os.path.join(work, f'report-{variant}.json'), 'w'), indent=1)
    print('\n'.join(out[:4]))
    print(f'worst: ' + ', '.join(f"{r['id']} {r['f1']:.3f}" for r in rows[:8]))


if __name__ == '__main__':
    main()
