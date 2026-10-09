#!/usr/bin/env python3
"""Load a scene, run SETUP (JS), step 90 frames without drawing, evaluate a JS file (an arrow function) and print its result as JSON.
   REF=<commit> SETUP="S.hour = 22; zoom = zoomT = 30" python3 tools/perf/one.py tools/perf/geo20b.js maxcity   (REF unset: the working tree)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    js = open(sys.argv[1]).read(); scene = sys.argv[2] if len(sys.argv) > 2 else 'maxcity'
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('one', os.environ.get('REF') or None); sc = H.load_scenes([scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_CPU = true;')
        if os.environ.get('SETUP'): pg.evaluate('() => { ' + os.environ['SETUP'] + ' }')
        pg.evaluate('() => __perf.cap(90, 0)')
        r = pg.evaluate(js)
        out = os.environ.get('OUT')
        (open(out, 'w') if out else sys.stdout).write(json.dumps(r, indent=1)); print(errs[:3]); br.close()
    srv.shutdown()
