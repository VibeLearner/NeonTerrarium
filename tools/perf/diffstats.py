#!/usr/bin/env python3
"""Per-capture pixel statistics for the harness's last run: how many pixels differ at all, by more than 1, 8 and 32 levels,
and the largest difference.   python3 tools/perf/diffstats.py city_1280x720_c_still city_1280x720_c_pan_slow ...
(or a prefix and step names:  python3 tools/perf/diffstats.py city_1280x720_ c_still c_pan_slow)"""
import os, sys
import numpy as np
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
names = sys.argv[1:]
if len(names) > 1 and names[0].endswith('_'): names = [names[0] + n for n in names[1:]]
print('%-34s %7s %6s %6s %6s %4s' % ('capture', 'any', '>1', '>8', '>32', 'max'))
for n in names:
    try:
        a = np.array(Image.open(os.path.join(OUT, n + '_base.png')).convert('RGB')).astype(int); b = np.array(Image.open(os.path.join(OUT, n + '_cand.png')).convert('RGB')).astype(int)
    except FileNotFoundError:
        print('%-34s identical (no diff written)' % n); continue
    d = np.abs(a - b).max(2); print('%-34s %7d %6d %6d %6d %4d' % (n, (d > 0).sum(), (d > 1).sum(), (d > 8).sum(), (d > 32).sum(), d.max()))
