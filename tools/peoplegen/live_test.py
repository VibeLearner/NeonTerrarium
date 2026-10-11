#!/usr/bin/env python3
"""A real page at night with the generated people for a few minutes of game time: the club, lurkers, the police response, drone deliveries; counts who is running (run frames), the club crowd on walk frames,
then flips the old/new switch and checks for page errors.  python3 tools/peoplegen/live_test.py [--scene city] [--hour 23] [--minutes 4]"""
import argparse, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
Q = """() => { const R0 = PG.F.RUN, R1 = PG.F.RUN + 6; let run = 0, runClub = 0, club = 0, rush = 0, hurry = 0, um = 0;
  for (const p of pplList){ if (p.club) club++; if (p.rush) rush++; if (p.hurry) hurry++; if (p._ec && p._ef >= R0 && p._ef < R1){ run++; if (p.club || p.noRun) runClub++; } if (p.um && p.um.on) um++; }
  let lk = {}; for (const L of lurkers.values()) lk[L.state] = (lk[L.state] || 0) + 1;
  return { people: pplList.length, club, rush, hurry, runFrames: run, runningWhoShouldWalk: runClub, umbrellas: um, lurkers: lk, drawn: pplMesh.geometry.instanceCount, events: (typeof eventLog !== 'undefined' ? eventLog.length : null) }; }"""
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--hour', default='23'); ap.add_argument('--minutes', type=int, default=4); a = ap.parse_args()
    import harness as H
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('peoplegen_live', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        for _ in range(8): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }')
        pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = %s; }' % a.hour)
        for m in range(a.minutes):
            for _ in range(4): pg.evaluate('() => { __perf.skip = true; __step(900); __perf.skip = false; }')   # (about 15 s a step)
            print('minute %d' % (m + 1), pg.evaluate(Q))
        # (a mugging needs luck: make a few walkers hurry, as the victim does, and see the run frames)
        print('forced', pg.evaluate("() => { let n = 0; for (const p of pplList) if (p.walk && p._ec && !p.club && n < 12){ p.hurry = true; n++; } return n; }"))
        pg.evaluate('() => { __perf.skip = true; __step(40); __perf.skip = false; }'); print('hurrying', pg.evaluate(Q), pg.evaluate('() => pplList.filter(p => p.hurry).map(p => [p._ef, p.noRun, p.um && p.um.st, p.rainRun, p.rush, p.pause > pplNow, PG.live()])'))
        for old in (True, False, True, False):
            pg.evaluate('o => { window.__OLD_PEOPLE = o; PG.apply(); }', old); pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }')
        print('flipped four times', pg.evaluate('() => ({ live: PG.live(), drawn: pplMesh.geometry.instanceCount })'))
        print('PAGE ERRORS' if errs else 'no page errors', errs[:5]); br.close()
    srv.shutdown(); srv.server_close()
main()
