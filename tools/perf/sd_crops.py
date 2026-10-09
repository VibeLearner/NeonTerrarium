#!/usr/bin/env python3
"""Item 6 crops: one frame of a medium-speed turn at zoom 30, drawn with full detail (SD off), the old settings and the new, crops side by side with the difference from full detail.
   python3 tools/perf/sd_crops.py city|maxcity [--rate .012]  ->  tools/perf/overnight2/item6_<scene>_<rate>.png"""
import argparse, base64, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import numpy as np
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overnight2')
JS = """([rate, set, frames]) => { Object.assign(SD, set); SC.mode = 'reuse'; if (window.__y0 === undefined) window.__y0 = yaw; yaw = yawT = window.__y0; SD.pY = null; __perf.cap(10, 0);
  let r; for (let f = 0; f < frames; f++){ yawT = yaw + rate*60; r = __perf.cap(1, 0); } return { png: r.png, tris: CULL.tris, top: SD.top, line: SD.line() }; }"""
def img(d): return Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB')
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--rate', type=float, default=.012); ap.add_argument('--new', default='v0=6'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sdc', None); sc = H.load_scenes([a.scene])[0]
    base = {'on': True, 'v0': 10, 'step': 2, 'max': 2, 'fast': 40, 'fastMax': 1, 'cursorPx': 200, 'hys': .25}
    new = dict(base, **{k: float(v) for k, v in (x.split('=') for x in a.new.split(','))})
    res = {}
    with sync_playwright() as pw:
        for n, st in (('full detail', {'on': False}), ('old settings', base), ('new settings', new)):   # (each setting in its own fresh page, the same script: the clock and the random numbers are scripted, so people, vehicles and clouds are where they were in every column)
            br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], 'reuse')
            pg.evaluate('() => { zoom = zoomT = 30; S.cycle = false; S.hour = 12; ptrLast = null; }'); pg.evaluate('() => __perf.cap(60, 3)')
            res[n] = pg.evaluate(JS, [a.rate, st, 16]); br.close()
    srv.shutdown()
    ims = {n: img(r['png']) for n, r in res.items()}; W, Hh = ims['full detail'].size
    for n, r in res.items(): print('%-13s triangles %9d  fastest %5.1f px/frame  %s' % (n, r['tris'], r['top'], r['line'][:90]))
    boxes = [(W//2 - 200, Hh//2 - 130), (W//4 - 200, Hh//3 - 130), (3*W//4 - 200, 2*Hh//3 - 130)]
    d = lambda x: np.array(x).astype(int)
    rows = []
    for (x, y) in boxes:
        bx = (max(0, x), max(0, y), max(0, x) + 400, max(0, y) + 260); tiles = []
        for n in ('full detail', 'old settings', 'new settings'): tiles.append(ims[n].crop(bx))
        diff = np.abs(d(ims['full detail'].crop(bx)) - d(ims['new settings'].crop(bx))).max(2); dd = Image.fromarray(np.clip(diff*4, 0, 255).astype(np.uint8)).convert('RGB'); tiles.append(dd)
        row = Image.new('RGB', (4*404, 264), (30, 30, 30))
        for i, t in enumerate(tiles): row.paste(t, (i*404, 0))
        rows.append(row)
    m = Image.new('RGB', (4*404, 3*264 + 22), (30, 30, 30)); dr = ImageDraw.Draw(m)
    dr.text((4, 4), 'full detail | old settings | new settings (%s) | difference new vs full detail x4   %s zoom 30, turning %.0f px/frame' % (a.new, a.scene, res['old settings']['top']), fill=(255, 255, 255))
    for i, r in enumerate(rows): m.paste(r, (0, 22 + i*264))
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, 'item6_%s_%s.png' % (a.scene, ('%g' % a.rate).replace('.', 'p'))); m.save(p); print(p, errs[:2])
