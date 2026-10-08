#!/usr/bin/env python3
"""Main-thread time per update function (the real clock, frames simulated without drawing).
   python3 tools/perf/cpuprofile.py maxcity [--zoom 30 15] [--frames 60] [--ref REF]   (REF: a git ref; default the working tree)"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, nargs='+', default=[30]); ap.add_argument('--frames', type=int, default=60); ap.add_argument('--ref', default=None); ap.add_argument('--extra', default=''); ap.add_argument('--warm', type=int, default=40)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('cpu', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[1])
        for z in a.zoom:
            pg.evaluate('z => { zoom = zoomT = z; }', z)
            pg.evaluate('n => __perf.cap(n)', a.warm)   # settle (decisions are a start-up burst: everyone's wait has run out)
            pg.evaluate('() => { if (!PH.on) PH.toggle(); }')   # (the overlay's section timers, on the real clock)
            r = pg.evaluate('([n, x]) => __perf.cpuTime(n, x)', [a.frames, [x for x in a.extra.split(',') if x]])
            sec = pg.evaluate('() => PH.laps()')
            info = pg.evaluate('() => { let on = 0; const VP = comp.uniforms.VP.value, v = new THREE.Vector3(); for (const p of pplList){ v.set(p.x, 0, p.z).applyMatrix4(VP); if (Math.abs(v.x) < 1.1 && v.y > -1.15 && v.y < 1.1) on++; } return { people: pplList.length, onScreen: on }; }')
            print('zoom', z, json.dumps(info))
            for k, v in sorted(r.items(), key=lambda kv: -kv[1]['mean']):
                if v['mean'] >= .02: print('  %-24s mean %6.2f ms  p95 %6.2f' % (k, v['mean'], v['p95']))
            if sec:
                print('  overlay timers (ms a frame):', ', '.join('%s %.2f' % (k, v) for k, v in sec.items() if k.startswith('people')))
        print(errs[:2]); br.close()
    srv.shutdown()
