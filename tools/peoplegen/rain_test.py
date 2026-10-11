#!/usr/bin/env python3
"""Clear -> rain -> clear in a real page with the generated people: counts who has an umbrella (closed, opening, open, closing), who runs for the rain, and checks nothing throws.
  python3 tools/peoplegen/rain_test.py [--scene city] [--hour 14]"""
import argparse, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
CNT = """() => { const c = [0,0,0,0,0], r = { run: 0, carry: 0, out: 0, n: 0 };
  for (const p of pplList){ if (p.x === undefined || p.club) continue; r.n++; if (p.um){ c[p.um.st]++; if (p.um.carry) r.carry++; } if (p.rainRun > pplNow) r.run++; }
  return { st: c, run: r.run, carry: r.carry, n: r.n, rain: LK.rainNow().toFixed(2), epoch: pplRainEpoch, raining: pplRaining }; }"""
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--hour', default='14'); a = ap.parse_args()
    import harness as H
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('peoplegen_rain', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        step = lambda n: pg.evaluate('n => { __perf.skip = true; __step(n); __perf.skip = false; }', n)
        for _ in range(12): step(30)
        pg.evaluate('() => { S.cycle = false; S.hour = %s; S.rain = false; }' % a.hour)
        for _ in range(4): step(60)
        print('clear ', pg.evaluate(CNT))
        pg.evaluate('() => { S.rain = true; }')
        for k in range(10): step(60); print('rain %2ds' % (k + 1), pg.evaluate(CNT))
        for k in range(20): step(60)
        print('rain +30s', pg.evaluate(CNT))
        pg.evaluate('() => { S.rain = false; }')
        for k in range(8): step(60); print('clear %2ds' % (k + 1), pg.evaluate(CNT))
        print('PAGE ERRORS' if errs else 'no page errors', errs[:5])
        br.close()
    srv.shutdown(); srv.server_close()
main()
