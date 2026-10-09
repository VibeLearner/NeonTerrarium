#!/usr/bin/env python3
"""List the differing pixels of a harness capture (tools/perf/out/NAME_base.png vs _cand.png) as clusters, with a zoomed crop of
each (base left, candidate right) saved to out/NAME_crops.png.  python3 tools/perf/crops.py NAME [NAME ...]"""
import os, sys
import numpy as np
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
for n in sys.argv[1:]:
    a = Image.open(os.path.join(OUT, n + '_base.png')).convert('RGB'); b = Image.open(os.path.join(OUT, n + '_cand.png')).convert('RGB')
    A = np.array(a).astype(int); B = np.array(b).astype(int); d = np.abs(A - B).max(2)
    ys, xs = np.nonzero(d); pts = sorted(zip(xs.tolist(), ys.tolist())); cl = []
    for x, y in pts:
        for c in cl:
            if abs(c[0] - x) <= 6 and abs(c[1] - y) <= 6: c[2].append((x, y)); break
        else: cl.append([x, y, [(x, y)]])
    print('%s: %d pixels, %d clusters' % (n, len(pts), len(cl)))
    tiles = []
    for c in cl[:12]:
        x, y = c[0], c[1]; box = (max(0, x - 12), max(0, y - 12), x + 12, y + 12)
        t = Image.new('RGB', (24*6*2 + 4, 24*6)); t.paste(a.crop(box).resize((144, 144), Image.NEAREST), (0, 0)); t.paste(b.crop(box).resize((144, 144), Image.NEAREST), (148, 0)); tiles.append(t)
        print('  at (%d,%d): %d px, max diff %d' % (x, y, len(c[2]), max(d[q[1], q[0]] for q in c[2])))
    if tiles:
        cols = 3; rows = (len(tiles) + cols - 1)//cols; m = Image.new('RGB', (292*cols, 144*rows), (40, 40, 40))
        for i, t in enumerate(tiles): m.paste(t, ((i % cols)*292, (i//cols)*144))
        m.save(os.path.join(OUT, n + '_crops.png'))
