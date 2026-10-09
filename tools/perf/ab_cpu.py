#!/usr/bin/env python3
"""Alternating A/B main-thread timing of the update functions: REF_A (a git ref) against the working tree, several rounds,
medians. The real clock, frames simulated without drawing; decisions are subtracted out of the people time (the harness's frozen
clock lets every decision through, where the game's 2.5 ms budget would stop them).
   python3 tools/perf/ab_cpu.py maxcity --a 1bc4451 --zoom 30 --rounds 3 --frames 60 [--only updatePeople,updateHighways]"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--a', default=None, help='a git ref (default: the working tree)'); ap.add_argument('--a-init', default=None); ap.add_argument('--b-init', default=None); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--rounds', type=int, default=3); ap.add_argument('--frames', type=int, default=60)
    ap.add_argument('--b', default=None, help='a git ref instead of the working tree'); ap.add_argument('--warm', type=int, default=40)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); ua = H.make_site('ab_a', a.a); ub = H.make_site('ab_b', a.b); sc = H.load_scenes([a.scene])[0]
    res = {'A': [], 'B': []}
    with sync_playwright() as pw:
        for r in range(a.rounds):
            for tag, url in ((('A', ua), ('B', ub)) if r % 2 == 0 else (('B', ub), ('A', ua))):   # (the order alternates)
                br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[1], extra_init=(a.a_init if tag == 'A' else a.b_init))
                pg.evaluate('z => { zoom = zoomT = z; }', a.zoom); pg.evaluate('n => __perf.cap(n)', a.warm)
                out = pg.evaluate('n => __perf.cpuTime(n)', a.frames)
                res[tag].append({k: v['mean'] for k, v in out.items()}); br.close()
                print(r, tag, 'frame %.1f updatePeople-decide %.2f' % (out['frame']['mean'], out['updatePeople']['mean'] - out.get('decide', {'mean': 0})['mean']), flush=True)
    srv.shutdown()
    keys = sorted({k for t in res.values() for d in t for k in d})
    def med(tag, k): return statistics.median(d.get(k, 0) for d in res[tag])
    def low(tag, k): return min(d.get(k, 0) for d in res[tag])
    print('%-24s %9s %9s   %9s %9s' % ('ms a frame', 'A median', 'B median', 'A min', 'B min'))
    for k in keys:
        x, y = med('A', k), med('B', k)
        if max(x, y) >= .05: print('%-24s %9.2f %9.2f   %9.2f %9.2f' % (k, x, y, low('A', k), low('B', k)))
    # the machine's speed drifts a lot from run to run: also the people time as a share of functions neither build changed
    def ref(d): return sum(d.get(k, 0) for k in ('updateSteam', 'updateMegaFx', 'updateConveyors', 'updateHighways', 'updateMetros')) or 1
    ra = [(d['updatePeople'] - d.get('decide', 0))/ref(d) for d in res['A']]; rb = [(d['updatePeople'] - d.get('decide', 0))/ref(d) for d in res['B']]
    print('people (no decisions) over the unchanged functions: A median %.2f (%s)   B median %.2f (%s)   B/A %.2f' % (statistics.median(ra), ' '.join('%.2f' % v for v in ra), statistics.median(rb), ' '.join('%.2f' % v for v in rb), statistics.median(rb)/statistics.median(ra)))
    pa = [d['updatePeople'] - d.get('decide', 0) for d in res['A']]; pb = [d['updatePeople'] - d.get('decide', 0) for d in res['B']]
    print('people without decisions: A median %.2f min %.2f (%s)   B median %.2f min %.2f (%s)' % (statistics.median(pa), min(pa), ' '.join('%.2f' % v for v in pa), statistics.median(pb), min(pb), ' '.join('%.2f' % v for v in pb)))
