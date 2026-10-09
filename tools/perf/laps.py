#!/usr/bin/env python3
"""Item 5: the main thread's laps at a zoom: mean milliseconds a frame spent in each function (the real clock, no drawing), still and in a slow pan, and the draw calls of a cached frame.
   python3 tools/perf/laps.py city|maxcity [--zoom 30] [--frames 300] [--ref REF] [--cand-init 'window.__X = true;']"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--frames', type=int, default=300); ap.add_argument('--ref', default=None); ap.add_argument('--init', default=None); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('lap', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=a.init)
        pg.evaluate('z => { zoom = zoomT = z; S.cycle = false; S.rain = false; S.hour = 12; }', a.zoom); pg.evaluate('n => __perf.cap(n, 3)', 900)
        for name, js in (('still', None), ('slow pan', 'camGoal.x += .03; camGoal.z -= .02')):
            r = pg.evaluate('([n, e, js]) => __perf.cpuFrames(n, e, js)', [a.frames, [], js]); rows = r['rows']
            keys = {}
            for row in rows:
                for k, v in row.items(): keys.setdefault(k, []).append(v)
            tot = statistics.mean(keys['frame']); print('== %s, zoom %g, %d frames: frame mean %.2f ms, median %.2f, 95%% %.2f' % (name, a.zoom, len(rows), tot, statistics.median(keys['frame']), sorted(keys['frame'])[int(len(rows)*.95)]))
            for k, v in sorted(keys.items(), key=lambda x: -sum(x[1]))[:14]:
                if k != 'frame': print('   %-22s %6.2f ms' % (k, sum(v)/len(rows)))
        print(pg.evaluate('() => { renderer.info.autoReset = false; renderer.info.reset(); __perf.cap(1, 0); const c = renderer.info.render.calls, t = renderer.info.render.triangles; renderer.info.autoReset = true; return "draw calls in one frame " + c + ", triangles " + t; }'))
        print(errs[:2]); br.close()
    srv.shutdown()
