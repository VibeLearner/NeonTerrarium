#!/usr/bin/env python3
"""With no rain, the generated people are in the same places doing the same things as the old ones: two pages (old people, new people) stepped the same way, and every person's position,
walk and job compared after each step. Only how they look changes (and running frames, which do not move anyone).
  python3 tools/peoplegen/same_places.py [--scene city] [--steps 6]"""
import argparse, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
DUMP = """() => pplList.map(p => [p.id, +(p.x || 0).toFixed(3), +(p.z || 0).toFixed(3), p.at, p.job, p.walk ? 1 : 0, p.club ? 1 : 0, p.cop ? 1 : 0]).sort((a, b) => a[0] < b[0] ? -1 : 1)"""
def run(url, sc, old, steps, hour):
    import harness as H
    from playwright.sync_api import sync_playwright
    out = []
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__OLD_PEOPLE = true;' if old else None)
        for _ in range(8): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }')
        pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = %s; }' % hour)
        for k in range(steps):
            pg.evaluate('() => { __perf.skip = true; __step(90); __perf.skip = false; }'); out.append((pg.evaluate(DUMP), pg.evaluate('() => PG.live()'), pg.evaluate('() => PH.tests.oldPeople')))
        calls = pg.evaluate('() => window.__randCount ? window.__randCount() : null')
        br.close()
    return out, errs, calls
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--steps', type=int, default=6); ap.add_argument('--hour', default='14'); a = ap.parse_args()
    import harness as H
    srv = H.serve(); url = H.make_site('peoplegen_same', None); sc = H.load_scenes([a.scene])[0]
    o, eo, _ = run(url, sc, True, a.steps, a.hour); n, en, _ = run(url, sc, False, a.steps, a.hour)
    bad = 0
    for k, ((x, lx, _), (y, ly, _)) in enumerate(zip(o, n)):
        d = [(p, q) for p, q in zip(x, y) if p != q]
        if len(x) != len(y) or d: bad += 1; print('step %d: %d people differ of %d / %d' % (k, len(d), len(x), len(y)), d[:2])
    print('old mode live: %s, new mode live: %s' % (o[0][1], n[0][1]))
    print('steps compared %d, steps with differences %d, page errors %s' % (a.steps, bad, (eo + en)[:3]))
    srv.shutdown(); srv.server_close()
main()
