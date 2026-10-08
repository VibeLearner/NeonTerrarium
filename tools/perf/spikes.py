#!/usr/bin/env python3
"""Item 11: frame pacing.
 1. Main thread, no drawing (the real clock): the spread of each frame's time (median, 95%, 99%, max) at the zoom given, in three situations (still, a slow pan, a slow turn),
    and for every frame that stands out (over 1.6 times the median and over 3 ms more) the function that took the time (or "other": the rest of the frame: garbage collection and the like).
 2. Drawing: what a drawn frame submits and which frames are different from their neighbors (the cache's whole redraws, rectangles, strips; shader programs compiled), counted not
    timed (the harness's software renderer can't time the card): per scenario the frames where the cache did something or a program was compiled.
   python3 tools/perf/spikes.py maxcity [--frames 400] [--zoom 30]"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
EVENTS = r"""([n, perFrame]) => {
  const out = []; renderer.info.autoReset = false;
  for (let i = 0; i < n; i++){
    if (perFrame) eval(perFrame);
    renderer.info.reset(); const p0 = renderer.info.programs ? renderer.info.programs.length : 0, r0 = SC.rebuilds, s0 = SC.strips, e0 = SC.rects, k0 = SC.job ? SC.job.k : -1;
    __perf.cap(1, 0);
    out.push({ calls: renderer.info.render.calls, progs: (renderer.info.programs ? renderer.info.programs.length : 0) - p0, whole: SC.rebuilds - r0, strips: SC.strips - s0, rects: SC.rects - e0, job: SC.job ? SC.job.k : -1, state: SC.state, why: SC.why });
  }
  renderer.info.autoReset = true; return out; }"""
CPU = [('still', None), ('slow pan', 'camGoal.x += .03; camGoal.z -= .02'), ('slow turn', 'yawT += .004')]
DRAW = [('slow pan', 'camGoal.x += .06; camGoal.z -= .04', 60), ('fast pan (the ring)', 'camGoal.x += .5; camGoal.z -= .3', 60), ('slow turn', 'yawT += .004', 40), ('an edit and its sweep', None, 80), ('day cycle running (dusk)', None, 60)]
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=400); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--warm', type=int, default=1200); ap.add_argument('--only', choices=['cpu', 'draw'], default=None)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('spk', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('z => { zoom = zoomT = z; S.cycle = false; S.rain = false; S.hour = 12; }', a.zoom)
        pg.evaluate('n => __perf.cap(n, 3)', a.warm)
        print('== main thread, no drawing, zoom %g, %d frames each' % (a.zoom, a.frames))
        for name, js in ([] if a.only == 'draw' else CPU):
            r = pg.evaluate('([n, e, js]) => __perf.cpuFrames(n, e, js)', [a.frames, [], js])
            fr = [x['frame'] for x in r['rows']]; ts = sorted(fr); med = statistics.median(ts); p95 = ts[int(len(ts)*.95)]; p99 = ts[min(len(ts) - 1, int(len(ts)*.99))]
            print('%-12s median %6.2f ms   95%% %6.2f   99%% %6.2f   max %6.2f   (95%%/median %.2f)' % (name, med, p95, p99, ts[-1], p95/med))
            shown = 0
            for i, row in enumerate(r['rows']):
                t = row['frame']
                if t > max(1.6*med, med + 3) and shown < 8:
                    shown += 1; parts = sorted(((v, k) for k, v in row.items() if k != 'frame'), reverse=True)[:3]; acc = sum(v for k, v in row.items() if k != 'frame')
                    print('    frame %3d  %6.2f ms: %s; other %.2f' % (i, t, ', '.join('%s %.2f' % (k, v) for v, k in parts), t - acc))
        print('== drawn frames: what the cache and the shader cache do')
        for name, js, n in ([] if a.only == 'cpu' else DRAW):
            pg.evaluate('() => { S.cycle = false; S.hour = 12; }'); pg.evaluate('() => __perf.cap(60, 6)')   # (every scenario from a settled, still, cached picture)
            if name.startswith('day cycle'): pg.evaluate('() => { S.hour = 17.6; S.cycle = true; }'); pg.evaluate('() => __perf.cap(30, 3)')
            if name.startswith('an edit'): pg.evaluate("() => { const c = cells.get(ckey(-1, 3)); if (c && !c.mega) addSection(c, 'mid'); }")
            pg.evaluate('() => __perf.cap(8, 3)')
            r = pg.evaluate(EVENTS, [n, js])
            ev = [(i, x) for i, x in enumerate(r) if x['whole'] or x['strips'] or x['rects'] or x['progs'] or x['state'] != 'in use']
            print('%-28s %d frames: whole redraws %d, strips %d, rectangles %d, programs compiled %d, frames not drawn from the cache %d; draw calls per frame %d to %d' % (name, len(r), sum(x['whole'] for x in r), sum(x['strips'] for x in r), sum(x['rects'] for x in r), sum(x['progs'] for x in r), sum(1 for x in r if x['state'] != 'in use' and not x['state'].startswith('redrawing')), min(x['calls'] for x in r), max(x['calls'] for x in r)))
            for i, x in ev[:10]: print('    frame %3d  calls %4d  whole %d strips %d rects %d new programs %d  %s %s' % (i, x['calls'], x['whole'], x['strips'], x['rects'], x['progs'], x['state'], x['why']))
        print(errs[:2]); br.close()
    srv.shutdown()
