#!/usr/bin/env python3
"""The shared foliage palette: k-means over every opaque pixel of the old plant sprites (assets/sprites, assets/floor), so the code-drawn ones keep the city's tone.
  python3 tools/procfol/palette.py [--k 20] [--out palette.json]     (needs numpy, pillow, scipy; the old PNGs, which stay in the repo until the owner approves)
The result is what SG.PAL in js/spritegen.js was built from (ramps are sorted dark to light and hue-shifted by hand where the old sprites were flat)."""
import argparse, glob, json, os
import numpy as np
from PIL import Image
from scipy.cluster.vq import kmeans2
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--k', type=int, default=20); ap.add_argument('--out', default='palette.json'); a = ap.parse_args()
    files = [f for f in glob.glob(os.path.join(ROOT, 'assets/sprites/*.png')) if not os.path.basename(f).startswith(('sign_', 'holo_', 'ddrone', 'koi', 'wanted'))] + glob.glob(os.path.join(ROOT, 'assets/floor/f_*.png'))
    px = []
    for f in files:
        d = np.array(Image.open(f).convert('RGBA')).reshape(-1, 4); px.append(d[d[:, 3] > 128, :3])
    px = np.concatenate(px).astype(float); print(len(files), 'files,', len(px), 'pixels')
    rng = np.random.default_rng(1); c, lab = kmeans2(px, a.k, seed=rng, minit='++')
    cnt = np.bincount(lab, minlength=a.k); order = np.argsort(c.sum(1))
    out = [{'hex': '#%02x%02x%02x' % tuple(int(round(v)) for v in c[i]), 'share': round(float(cnt[i]) / len(px), 4)} for i in order]
    json.dump(out, open(a.out, 'w'), indent=1); print(' '.join(o['hex'] for o in out))
main()
