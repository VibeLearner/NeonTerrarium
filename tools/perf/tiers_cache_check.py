#!/usr/bin/env python3
"""Round 9, item 5: a block that changes tier is noted as an edit rectangle for the static cache. Two pages run the same frames (the view panned, turned and zoomed, so blocks change tier,
frames drawn so the cache is carried along), one with the cache as it is (mode reuse), one redrawing it every frame (mode every); at the end of each leg both are captured and must match.
   python3 tools/perf/tiers_cache_check.py dense"""
import argparse, os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from PIL import Image, ImageChops
LEGS = [('zoom 13 settle', 'zoomT = 13; S.cycle = false; S.hour = 12', 520, 40), ('pan', 'camGoal.x += 36', 520, 40), ('turn', 'yawT += 1.3', 300, 40), ('zoom 30', 'zoomT = 30', 520, 40), ('zoom 15', 'zoomT = 15', 520, 40), ('pan back', 'camGoal.x -= 36; yawT -= 1.3', 520, 40)]
def run(br, url, sc, mode):
    ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], sc_mode=mode, extra_init='window.__NV_OFF = true;')
    out = []
    for label, js, n, d in LEGS:
        pg.evaluate('() => { ' + js + ' }'); c = pg.evaluate('([n, d]) => __perf.cap(n, d)', [n, d]); out.append((label, c, pg.evaluate('() => TIER.line()')))
    ctx.close(); return out, errs
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('tcc', None); sc = H.load_scenes([a.scene])[0]; bad = 0
    with sync_playwright() as pw:
        br = H.launch(pw)
        A, ea = run(br, url, sc, 'reuse'); B, eb = run(br, url, sc, 'every')
        for (l, ca, t), (_, cb, _) in zip(A, B):
            ia = Image.open(io.BytesIO(H.png_bytes(ca['png']))).convert('RGB'); ib = Image.open(io.BytesIO(H.png_bytes(cb['png']))).convert('RGB')
            n = sum(1 for p in ImageChops.difference(ia, ib).getdata() if p != (0, 0, 0)); bad += n > 0
            print('%-16s cache reuse vs every: %d pixels differ | %s | %s' % (l, n, t, ca['sc']))
        print('page errors', ea[:2], eb[:2]); br.close()
    srv.shutdown(); sys.exit(1 if bad else 0)
