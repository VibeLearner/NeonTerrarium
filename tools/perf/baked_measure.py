#!/usr/bin/env python3
"""Round 10, item 6: counts for a scene at zoom 30 (default), real against stand-in against baked, through the game's own machinery: building triangles drawn in a frame (the static cache off, so
the frame is drawn in full), draw calls, the merged geometry on the card (bytes from its vertex and index counts), the baked maps on the card (pages of three 2048 x 2048 maps), and the bake itself:
plots baked, time per plot split by phase (the card's work, face and read, is a software renderer's here: do not read it as a card's), shell and kept triangles per plot, texels and bytes per plot.
No timing of drawing. python3 tools/perf/baked_measure.py maxcity [--zoom 30] [--hour 12] [--out tools/perf/baked/measure_maxcity.json]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([zoom, hour, mode, settle]) => {
  S.cycle = false; S.hour = hour; S.rain = false; PH.tests.noStatic = true;
  const step = async n => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } };
  __perf.skip = true; zoomT = zoom; let used = 0;
  if (settle > 0){ await step(settle); used = settle; }
  else {
    await step(300); used += 300;
    const idle = () => !(solidDirty.size || SOLID_JOB || TIER.markedAt.size) && (mode !== 'baked' || ((BAKE.stats().by.ready || 0) + (BAKE.stats().by.failed || 0) >= BAKE.stats().plots && !BAKE.job));
    for (let g = 0; g < 60000 && !(idle() && g > 60); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
    await step(240); used += 240; for (let g = 0; g < 4000 && (solidDirty.size || SOLID_JOB || TIER.markedAt.size); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
  }
  __perf.skip = false; const c = __perf.cap(6, 6); __perf.skip = true;
  // the merged geometry of the blocks, and what is baked
  let vb = 0, ib = 0, nv = 0, ni = 0, ng = 0;
  for (const r of solidRegions.values()) for (const g of r.geoms){ ng++; const v = g.attributes.position.count; nv += v; vb += v*26; const n = g.index ? g.index.count : 0; ni += n; ib += n*(g.userData.bpe || (v > 65535 ? 4 : 2)); }
  let sv = 0, si = 0; for (const r of solidRegions.values()) r.group.traverse(o => { if (o.userData.baked && o.geometry){ sv += o.geometry.attributes.position.count; si += o.geometry.index.count; } });
  const bs = mode === 'baked' ? BK.stats : null, st = BAKE.stats();
  return { used, tris: c.info.tris, calls: c.info.calls, geos: c.info.geos, tex: c.info.tex, blocks: solidRegions.size, mergedGeos: ng, mergedVerts: nv, mergedTris: ni/3, mergedBytes: vb + ib, shellVerts: sv, shellTris: si/3,
    pages: BK.pages.length, pageBytes: BK.pages.length*3*BK.PAGE*BK.PAGE*4, plots: st.plots, ready: st.by.ready || 0, bk: BK.stats, tier: TIER.line(), line: BK.line() };
}
"""
INITS = {'real': 'window.__TIER_OFF = true;', 'stand': '', 'baked': 'window.__BAKED_ON = true;'}
def run_one(br, url, scene, mode, zoom, hour, settle):
    ctx, pg, errs = H.open_game(br, url, scene, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;' + INITS[mode])
    r = pg.evaluate(RUN, [zoom, hour, mode, settle]); ctx.close(); return r, errs
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--hour', type=float, default=12); ap.add_argument('--out', default=None); ap.add_argument('--modes', nargs='+', default=['baked', 'real', 'stand'])
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('bm', None); sc = H.load_scenes([a.scene])[0]; R = {}; E = []; used = 0
    with sync_playwright() as pw:
        br = H.launch(pw)
        for m in a.modes:
            R[m], e = run_one(br, url, sc, m, a.zoom, a.hour, 0 if m == 'baked' or used == 0 else used); E += e
            if m == 'baked': used = R[m]['used']
            print(m, json.dumps({k: v for k, v in R[m].items() if k != 'bk'}), flush=True)
        br.close()
    B = R.get('baked')
    if B:
        s = B['bk']; n = max(1, s['baked'])
        print('per baked plot: ms %.0f (phases %s), shell tris %.0f, kept tris %.0f, overlay tris %.0f, texels %.0f (%.2f MB), holes %.1f%%' % (s['ms']/n, {k: round(v/n) for k, v in s['ph'].items()}, s['shellTris']/n, s['keptTris']/n, s['ovlTris']/n, s['texels']/n, s['texels']*12/n/1048576, 100*s['holes']/max(1, s['area'])))
    if a.out: json.dump({ 'scene': a.scene, 'zoom': a.zoom, 'hour': a.hour, 'modes': R, 'errs': E[:5] }, open(a.out, 'w'), indent=1)
    srv.shutdown()
