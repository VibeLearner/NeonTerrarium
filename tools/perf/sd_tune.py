#!/usr/bin/env python3
"""Item 6: speed-based detail settings against turning speed. For each turn rate (yaw added to the target every frame, frames drawn the old way, the cache off to the side) the speed at the pivot's edge (px a frame, the number
SD uses), the triangles the color pass draws with SD off, with the current settings and with each candidate, and the plots per extra class.
   python3 tools/perf/sd_tune.py maxcity --zoom 30 --rates .002 .004 .008 .012 .02 .03 .05 --cand 'v0=6,max=2' 'v0=5,fast=30'"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """([rate, frames, set]) => { if (!window.__stub){ window.__stub = true; const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_multi_draw'); for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) gl[n] = function(){}; if (ext) ext.multiDrawElementsWEBGL = function(){}; }
  Object.assign(SD, set); SC.mode = 'reuse'; if (window.__y0 === undefined) window.__y0 = yaw; yaw = yawT = window.__y0; SD.pY = null; __perf.cap(15, 0); const out = [];
  for (let f = 0; f < frames; f++){ yawT = yaw + rate*60; __perf.cap(1, 0); if (f >= 8) out.push({ tris: CULL.tris, top: SD.top, hist: SD.hist.slice(0, 4) }); }
  const n = out.length; return { tris: out.reduce((a, o) => a + o.tris, 0)/n, top: out.reduce((a, o) => a + o.top, 0)/n, hist: out[n - 1].hist }; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--rates', type=float, nargs='+', default=[.002, .004, .008, .012, .02, .03, .05])
    ap.add_argument('--cand', nargs='*', default=[]); ap.add_argument('--frames', type=int, default=16); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sdt', None); sc = H.load_scenes([a.scene])[0]
    def parse(s): return {k: float(v) for k, v in (x.split('=') for x in s.split(','))} if s else {}
    sets = [('off', {'on': False}), ('now', {'on': True, 'v0': 10, 'step': 2, 'max': 2, 'fast': 40, 'fastMax': 1, 'cursorPx': 200, 'hys': .25})] + [(c, dict({'on': True, 'v0': 10, 'step': 2, 'max': 2, 'fast': 40, 'fastMax': 1, 'cursorPx': 200, 'hys': .25}, **parse(c))) for c in a.cand]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], 'reuse')
        pg.evaluate('z => { zoom = zoomT = z; S.cycle = false; S.hour = 12; ptrLast = null; }', a.zoom); pg.evaluate('() => __perf.cap(60, 3)')
        print('zoom %g, %s: color-pass triangles a frame (mean over the turn), change against SD off' % (a.zoom, a.scene))
        for r in a.rates:
            row = []; base = None
            for name, st in sets:
                x = pg.evaluate(JS, [r, a.frames, st]); 
                if name == 'off': base = x['tris']; row.append('off %9d' % x['tris'])
                else: row.append('%s %9d (%+.1f%%)' % (name, x['tris'], 100*(x['tris'] - base)/max(1, base)))
                if name == 'now': top = x['top']
            print('rate %.3f rad/frame, %5.1f px/frame at the pivot edge:  ' % (r, top) + '   '.join(row))
        print(errs[:2]); br.close()
    srv.shutdown()
