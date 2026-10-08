#!/usr/bin/env python3
"""The cache line frame by frame around an edit: which frames are drawn the old way, whether the edit was a rectangle or a whole redraw.
   python3 tools/perf/edit_frames.py city [--frames 16] [--wait 300] [--no-rect]"""
import argparse, os, sys
os.environ.setdefault('PERF_SC_STEPS', '1')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
EDITS = [('place', "const c = cells.get(ckey(-1, 3)); if (c && !c.mega) addSection(c, 'mid');"),
         ('place a tall tower', "const c = cells.get(ckey(2, 3)); if (c && !c.mega) { addSection(c, 'high'); addSection(c, 'high'); }"),
         ('demolish', "const c = [...cells.values()].find(c => c.sections.length && !c.mega && !(c.i === 2 && c.j === 3) && !(c.i === -1 && c.j === 3)); if (c) removeAt({ kind: 'bld', c });")]
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=12); ap.add_argument('--wait', type=int, default=320); ap.add_argument('--no-rect', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('ef', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=('window.__NO_RECT = true;' if a.no_rect else '') )
        pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = 14; }'); pg.evaluate('() => __perf.cap(90, 3)')
        for name, js in EDITS:
            print('--', name, '(rectangles off)' if a.no_rect else '')
            pg.evaluate('() => { ' + js + ' }')
            last = None
            for f in range(a.frames):
                pg.evaluate('() => __perf.cap(1, 0)'); line = pg.evaluate('() => SC.line()')
                print('  frame %2d  %s' % (f, line[14:150]))
            print('  ... %d more frames (the sweep)' % a.wait)
            # run the sweep without drawing until it is over, then draw the frames after it
            pg.evaluate("() => { let g = 0; while (anims.length && g++ < 400){ __perf.skip = true; for (let k = 0; k < 5 && anims.length; k++) __step(1); __perf.skip = false; if (anims.length) __step(1); } __perf.skip = false; }")   # (one frame in six drawn, so the cache sees the edits as they come)
            print('  ... the sweep is over')
            for f in range(8):
                pg.evaluate('() => __perf.cap(1, 0)'); print('  after   %2d  %s' % (f, pg.evaluate('() => SC.line()')[14:190]))
        print(errs[:2]); br.close()
    srv.shutdown()
