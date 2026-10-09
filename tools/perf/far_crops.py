#!/usr/bin/env python3
"""Round 8 item 3 crops: the same frame with the lean round parts and the thin sticks' narrower arc on (the default) and off ('full round parts', 'full sticks'), each in its own fresh page with the
same script (the clock and random numbers are scripted, so the only difference is the cheat). The three places where the pictures differ most, at 4x: before | after | difference x4.
   python3 tools/perf/far_crops.py dense --owner-zoom 30 [--which round|sticks|both]"""
import argparse, base64, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overnight3')
def img(d): return Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB')
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--owner-zoom', type=float, default=30); ap.add_argument('--owner-h', type=float, default=1640); ap.add_argument('--which', default='both'); ap.add_argument('--out', default=None)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('fc', None); sc = H.load_scenes([a.scene])[0]; z = a.owner_zoom*H.VIEWPORTS[0][1]/a.owner_h
    off = {'round': 'window.__FULL_ROUND=true;', 'sticks': 'window.__FULL_STICKS=true;', 'both': 'window.__FULL_ROUND=true;window.__FULL_STICKS=true;'}[a.which]
    shots = {}
    with sync_playwright() as pw:
        for name, init in (('off', 'window.__NV_OFF=true;' + off), ('on', 'window.__NV_OFF=true;')):
            br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
            pg.evaluate('(z) => { S.cycle = false; S.hour = 12; S.rain = false; zoom = zoomT = z; }', z); r = pg.evaluate('() => __perf.cap(90, 3)'); shots[name] = img(r['png']); br.close()
    srv.shutdown()
    A, B = np.array(shots['off']).astype(int), np.array(shots['on']).astype(int); d = np.abs(A - B).max(2); Hh, W = d.shape
    print('pixels that differ: %d of %d (%.2f%%), largest difference %d' % ((d > 0).sum(), d.size, 100*(d > 0).sum()/d.size, d.max()))
    bw, bh = 150, 100; sums = [(d[y:y + bh, x:x + bw].sum(), x, y) for y in range(0, Hh - bh, 50) for x in range(0, W - bw, 50)]; sums.sort(reverse=True)
    picks = []
    for s_, x, y in sums:
        if all(abs(x - px) > bw or abs(y - py) > bh for _, px, py in picks): picks.append((s_, x, y))
        if len(picks) == 3: break
    S = 3; rows = []
    for s_, x, y in picks:
        box = (x, y, x + bw, y + bh); tiles = [shots['off'].crop(box), shots['on'].crop(box), Image.fromarray(np.clip(d[y:y + bh, x:x + bw]*4, 0, 255).astype(np.uint8)).convert('RGB')]
        row = Image.new('RGB', (3*(bw*S + 4), bh*S), (30, 30, 30))
        for i, t in enumerate(tiles): row.paste(t.resize((bw*S, bh*S), Image.NEAREST), (i*(bw*S + 4), 0))
        rows.append(row)
    m = Image.new('RGB', (rows[0].width, len(rows)*(bh*S + 4) + 18), (30, 30, 30)); dr = ImageDraw.Draw(m); dr.text((3, 3), 'before (%s) | after (default) | difference x4   %s, owner zoom %g (harness zoom %.1f)' % ('full ' + a.which, a.scene, a.owner_zoom, z), fill=(255, 255, 255))
    for i, r in enumerate(rows): m.paste(r, (0, 18 + i*(bh*S + 4)))
    p = os.path.join(OUT, a.out or 'item3_%s_%s_z%g.png' % (a.which, a.scene, a.owner_zoom)); m.save(p); print(p)
