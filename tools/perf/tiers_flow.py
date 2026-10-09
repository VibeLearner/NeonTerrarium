#!/usr/bin/env python3
"""Round 9, item 5: the tier policy in play (real worker). Settles, then changes zoom and pans, and after each says which blocks are full, how many plots the worker made again, how many frames the
change took to settle, the triangles of a drawn frame (the static cache off), the graphics bytes and the page's slow restores.
   python3 tools/perf/tiers_flow.py dense"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import memcheck as M
RUN = r"""
async ([steps]) => {
  const out = [];
  const settle = async (max) => { let f = 0; for (; f < max; f++){ __step(1); if (f % 10 === 9) await new Promise(r => setTimeout(r, 3)); if (f > 300 && !solidDirty.size && !SOLID_JOB && !STAGE_Q.length && !RW.jobs.size) { if (TIER.line() === window.__lastTier && f > 360) break; window.__lastTier = TIER.line(); } } return f; };
  const stat = label => { const info = (() => { __perf.skip = false; renderer.info.reset(); __step(1); __perf.skip = true; return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; })();
    return { label, tier: TIER.line(), pm: PM.line(), rw: RW.line(), dirty: solidDirty.size, tris: info.tris, calls: info.calls }; };
  PH.tests.noStatic = true; S.cycle = false; S.hour = 12;
  for (const [label, js, frames] of steps){ if (js) (0, eval)(js); const f0 = PM.frame, a0 = PM.async, c0 = TIER.changes, s0 = PM.sync; const f = await settle(frames); const r = stat(label); r.frames = f; r.async = PM.async - a0; r.changes = TIER.changes - c0; r.sync = PM.sync - s0; out.push(r); }
  return out;
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--noworker', action='store_true'); ap.add_argument('--keep', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('tf', None); sc = H.load_scenes([a.scene])[0]
    steps = [['load', '', 700], ['zoom 13', 'zoomT = 13', 900], ['zoom 30 (farthest)', 'zoomT = 30', 900], ['zoom 15', 'zoomT = 15', 900], ['pan 40 units', 'camGoal.x += 40', 900], ['pan back', 'camGoal.x -= 40', 900], ['zoom 22', 'zoomT = 22', 900]]
    with sync_playwright() as pw:
        br = H.launch(pw)
        init = 'window.__NV_OFF = true;' + ('' if a.noworker else ' window.__GEN_WORKER = true;') + (' window.__TIER_OFF = true;' if a.keep else '')
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
        if not a.noworker: pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=120000)
        pg.evaluate('() => { __perf.skip = true; PM.trace = true; }')
        for r in pg.evaluate(RUN, [steps]): print('%-20s %5d frames  %s | made again %d, tier changes %d, slow restores %d | %d draws %d triangles | %s' % (r['label'], r['frames'], r['tier'], r['async'], r['changes'], r['sync'], r['calls'], r['tris'], r['rw']))
        print(pg.evaluate("() => JSON.stringify([...(PM.stacks || [])].sort((a, b) => b[1] - a[1]).slice(0, 4))"))
        print('page errors', errs[:3]); br.close()
    srv.shutdown()
