#!/usr/bin/env python3
"""Item 12: zoom 60 (the game caps at 30), measured only: set zoom = zoomT = 60 in code. What the frame holds at 30 and at 60: pieces and triangles in the color pass, draw calls, the
main thread without drawing, people on screen and the rate they are stepped at, and what the cache does through a slow pan and a slow turn. (GPU time can't be read here: see the
measurement script in OVERNIGHT.md for the owner's machine.)
   python3 tools/perf/zoom60.py maxcity [--frames 120]"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
STILL = r"""() => { renderer.info.autoReset = false; renderer.info.reset(); __perf.cap(1, 0);
  const VP = comp.uniforms.VP.value, v = new THREE.Vector3(); let on = 0; for (const p of pplList){ v.set(p.x, 0, p.z).applyMatrix4(VP); if (Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05) on++; }
  const o = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pieces: CULL.drawn + '/' + CULL.total, cullTris: CULL.tris, lvl: CULL.lvl, people: pplList.length, onScreen: on, rate: PPLRATE.n, cache: SC.line(), margin: SC.Muse, W, H, unitsPerPx: +(2*zoom/H).toFixed(4) };
  renderer.info.autoReset = true; return o; }"""
MOVE = r"""([n, js]) => { const out = { whole: 0, strips: 0, rects: 0, oldway: 0, calls: [] }; renderer.info.autoReset = false;
  for (let i = 0; i < n; i++){ eval(js); const r0 = SC.rebuilds, s0 = SC.strips, e0 = SC.rects; renderer.info.reset(); __perf.cap(1, 0);
    out.whole += SC.rebuilds - r0; out.strips += SC.strips - s0; out.rects += SC.rects - e0; if (SC.state !== 'in use' && !SC.state.startsWith('redrawing')) out.oldway++; out.calls.push(renderer.info.render.calls); }
  renderer.info.autoReset = true; return out; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=120); ap.add_argument('--warm', type=int, default=900); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('z60', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = 12; }')
        for z in (30, 60):
            pg.evaluate('z => { zoom = zoomT = z; }', z); pg.evaluate('n => __perf.cap(n, 3)', a.warm)
            print('== zoom %g' % z)
            print('  still:', json.dumps(pg.evaluate(STILL)))
            r = pg.evaluate('([n]) => __perf.cpuFrames(n, [], null)', [a.frames])['rows']; ts = sorted(x['frame'] for x in r)
            print('  main thread, no drawing: median %.2f ms, 95%% %.2f, max %.2f' % (statistics.median(ts), ts[int(len(ts)*.95)], ts[-1]))
            for name, js in (('slow pan', 'camGoal.x += .35*(zoom/30); camGoal.z -= .25*(zoom/30)'), ('slow turn', 'yawT += .004')):
                m = pg.evaluate(MOVE, [a.frames // 2, js]); print('  %-9s %d drawn frames: whole cache redraws %d, ring strips %d, edit rectangles %d, frames drawn the old way %d, draw calls %d to %d' % (name, a.frames // 2, m['whole'], m['strips'], m['rects'], m['oldway'], min(m['calls']), max(m['calls'])))
                pg.evaluate('() => __perf.cap(12, 3)')
        print(errs[:2]); br.close()
    srv.shutdown()
