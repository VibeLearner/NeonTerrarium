#!/usr/bin/env python3
"""Look at plots of a scene: python3 tools/perf/baked_shots.py dense i,j i,j ... [--zoom 9] [--out DIR]"""
import argparse, os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--plots', required=True, help='i,j;i,j;...'); ap.add_argument('--zoom', type=float, default=9); ap.add_argument('--hour', type=float, default=12); ap.add_argument('--out', default='/tmp/bk')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('bs', None); sc = H.load_scenes([a.scene])[0]; os.makedirs(a.out, exist_ok=True)
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;')
        pg.evaluate('() => __perf.cap(120, 0)')
        for p in a.plots.split(';'):
            i, j = map(int, p.split(','))
            r = pg.evaluate('([i, j, z, h]) => { S.hour = h; PH.tests.noStatic = false; const c = cells.get(ckey(i, j)); camGoal.set(c.x, camGoal.y, c.z); camT.copy(camGoal); zoom = zoomT = z; const k = __perf.cap(40, 2); return { png: k.png, h: c.height }; }', [i, j, a.zoom, a.hour])
            open(os.path.join(a.out, 'plot_%d_%d.png' % (i, j)), 'wb').write(H.png_bytes(r['png']))
        print(errs[:3]); br.close()
    srv.shutdown()
