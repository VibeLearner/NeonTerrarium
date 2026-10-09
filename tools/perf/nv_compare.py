#!/usr/bin/env python3
"""Round 9, item 6: the never-seen job with views shrunk to what can still hold an unseen triangle (and stopped when nothing is left) against the old way (whole boxes, every view), on plots of
each zone with a reduced set of views (the software renderer takes some 0.3 s a view; --yaws and --np say how many; the full set is 96 turns by 14 tilts). Removed sets must be the same,
triangle for triangle; reports the pixels made by each way.
   python3 tools/perf/nv_compare.py dense [--plots 2] [--yaws 24] [--np 6]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([per, yaws, np]) => {
  const byZone = {}; for (const c of cells.values()){ if (!c.data || c.mega || c.lift || !c.sections.length || !c.data.geo.get(ATLAS)) continue; const z = c.sections[0].zone; (byZone[z] = byZone[z] || []).push(c); }
  const picks = []; for (const z of ['low', 'mid', 'high', 'ind']){ const L = (byZone[z] || []).sort((a, b) => a.sections[0].seed - b.sections[0].seed); for (let q = 0; q < per && L.length; q++) picks.push(L[Math.floor((q + .5)*L.length/per)]); }
  const cfg = { yaws, np }, out = [];
  for (const c of picks){
    const g = c.data.geo.get(ATLAS); if (c.data.pm && c.data.pm.out) pmRestoreSync(c.data.pm, 'nv');
    window.__NV_OLD = true; const A = NV.runJob(c, cfg); const a = Array.from(A.never);
    window.__NV_OLD = false; const B = NV.runJob(c, cfg); const b = Array.from(B.never);
    let diff = 0; const ids = []; for (let t = 0; t < a.length; t++) if (a[t] !== b[t]){ diff++; if (ids.length < 5) ids.push(t); }
    out.push({ ij: [c.i, c.j], zone: c.sections[0].zone, T: A.T, removedOld: a.reduce((x, y) => x + y, 0), removedNew: b.reduce((x, y) => x + y, 0), diff, ids, pxOld: A.px, pxNew: B.px, views: A.views, early: B.early });
  }
  return out;
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--plots', type=int, default=2); ap.add_argument('--yaws', type=int, default=24); ap.add_argument('--np', type=int, default=6)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('nvc', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_GEO = true;')
        pg.evaluate('() => { __perf.skip = true; }')
        rows = pg.evaluate(RUN, [a.plots, a.yaws, a.np]); bad = 0; tp0 = tp1 = 0
        for r in rows:
            bad += r['diff']; tp0 += r['pxOld']; tp1 += r['pxNew']
            print('%-4s %-8s T %5d  removed old %4d new %4d  differ %d %s  pixels old %12d new %12d (%.0f%%)  early stop %d' % (r['zone'], r['ij'], r['T'], r['removedOld'], r['removedNew'], r['diff'], r['ids'], r['pxOld'], r['pxNew'], 100*r['pxNew']/max(1, r['pxOld']), r['early']))
        print('%d plots, %d views each: triangles that differ %d; pixels made %.0f%% of the old way' % (len(rows), rows[0]['views'] if rows else 0, bad, 100*tp1/max(1, tp0)))
        print('page errors', errs[:3]); br.close()
    srv.shutdown(); sys.exit(1 if bad else 0)
