#!/usr/bin/env python3
"""Speed-based detail: triangles drawn by the color pass during a spin, on and off, and how many plots sit at each extra class.
   python3 tools/perf/sd_probe.py maxcity --zoom 30 15 [--turn 3.0]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """([turn, frames]) => { const out = []; SC.mode = 'reuse'; yawT = yaw;
  __perf.cap(30, 0); yawT += turn;
  for (let f = 0; f < frames; f++){ __perf.cap(1, 0); out.push({ f, tris: CULL.tris, drawn: CULL.drawn, total: CULL.total, line: SD.line(), moving: SD.moving, top: +SD.top.toFixed(1), hist: SD.hist.slice(0, 4), sc: SC.line() }); }
  return out; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, nargs='+', default=[30, 15]); ap.add_argument('--turn', type=float, default=3.0); ap.add_argument('--frames', type=int, default=8)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sdp', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], 'reuse')
        for z in a.zoom:
            res = {}
            for on in (True, False):
                pg.evaluate('([z, on]) => { zoom = zoomT = z; SD.on = on; }', [z, on])
                res[on] = pg.evaluate(JS, [a.turn, a.frames])
            print('zoom', z)
            for f in range(a.frames):
                x, y = res[True][f], res[False][f]
                print('  frame %d  triangles on %8d  off %8d  (%+.1f%%)   fastest %5.1f px/frame   plots per extra class %s' % (f, x['tris'], y['tris'], 100*(x['tris'] - y['tris'])/max(1, y['tris']), x['top'], x['hist']))
        print(errs[:2]); br.close()
    srv.shutdown()
