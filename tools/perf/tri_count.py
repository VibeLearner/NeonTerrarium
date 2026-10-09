#!/usr/bin/env python3
"""Triangles the color pass draws in a frame (the cache off, a turned view), for combinations of the round 8 cheats, at the zooms that give the pixel size of the owner's 1640-line render at zoom 30 and 15
(the harness renders 720 lines: the same pixel size in world units is zoom * 720/1640).
   python3 tools/perf/tri_count.py dense --configs 'all' 'window.__FULL_ROUND=true;' 'window.__FULL_STICKS=true;' 'window.__FULL_ROUND=true;window.__FULL_STICKS=true;'"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--configs', nargs='+', default=['window.__X=1;']); ap.add_argument('--owner-zooms', type=float, nargs='+', default=[30, 15]); ap.add_argument('--owner-h', type=float, default=1640)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('tri', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        for cfg in a.configs:
            br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;' + cfg)
            pg.evaluate('() => { S.cycle = false; S.hour = 12; S.rain = false; }')
            out = []
            for oz in a.owner_zooms:
                z = oz*H.VIEWPORTS[0][1]/a.owner_h
                r = pg.evaluate("""(z) => { zoom = zoomT = z; SC.mode = 'off'; __perf.cap(30, 0); renderer.info.autoReset = false; const o = []; for (let k = 0; k < 3; k++){ yaw = yawT = yaw + .5; __perf.cap(2, 0); renderer.info.reset(); __perf.cap(1, 0); o.push([renderer.info.render.triangles, renderer.info.render.calls]); } renderer.info.autoReset = true;
                  return { tris: o.reduce((s, x) => s + x[0], 0)/o.length, calls: o.reduce((s, x) => s + x[1], 0)/o.length, farOn: FARM.on, lean: FARM.lean, sticks: FARM.sticks, lim: 2*zoom/H }; }""", z)
                out.append('zoom %g: %9d triangles (far %s)' % (oz, r['tris'], r['farOn']))
            print('%-60s %s   %s' % (cfg[:60], '   '.join(out), errs[:1])); br.close()
    srv.shutdown()
