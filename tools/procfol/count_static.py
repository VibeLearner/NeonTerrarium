#!/usr/bin/env python3
"""Item 6.2 counts (no timing, nothing rasterized: the draw calls are turned into no-ops, renderer.info and the static cache's own counters are read).
For each zoom: the plant triangles three draws in the live pass (into the frame's color target) and into the static cache, per frame, with the cache on and the view still.
Then a scripted pan, turn and zoom at zoom 30: how many times the cache is drawn whole, in strips of a background job, and as ring or edit rectangles.
  PERF_PORT=8960 python3 tools/procfol/count_static.py maxcity --tag after [--ref wip/procfol] [--tol 1.4] [--off]
  (--ref: the build to measure, default the working tree; --tol: sets window.__FOL_TOL; --off: plants always live (the overlay test foliageStaticOff))"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H
import measure_foliage as MF

HOOK = r"""() => {
  window.__T = { live: 0, cache: 0, calls: { full: 0, band: 0, rect: 0 } };
  const tally = function(){ const rt = renderer.getRenderTarget(); if (rt === rtC) __T.live += this.count*2; else __T.cache += this.count*2; };
  const hook = () => scene.traverse(o => { if (o.userData.fol && !o.userData.hooked){ o.userData.hooked = true; const prev = o.onBeforeRender; o.onBeforeRender = function(){ prev.apply(this, arguments); tally.call(this); }; } });
  window.__hook = hook; hook();
  for (const n of ['scFull', 'scBand', 'scDrawRect']){ const f = window[n]; const key = n === 'scFull' ? 'full' : n === 'scBand' ? 'band' : 'rect'; window[n] = function(){ __T.calls[key]++; return f.apply(this, arguments); }; }
  return true; }"""
STILL = r"""z => { zoom = zoomT = z; S.hour = 12; S.cycle = false; S.rain = false; __hook(); __step(40);
  __T.live = __T.cache = 0; const n = 4; for (let i = 0; i < n; i++) __step(1);
  let fol = 0, lit = 0; scene.traverse(o => { if (o.userData.fol && o.visible){ if (o.userData.swayed) fol++; else lit++; } });
  return { zoom: z, H, texelPx: H/(2*zoom*PX), liveTrisPerFrame: __T.live/n, cacheTrisPerFrame: __T.cache/n, folOn: typeof FOLST !== 'undefined' ? FOLST.on : null, peakPx: typeof FOLST !== 'undefined' ? FOLST.peakPx : null, scState: SC.state, rebuilds: SC.rebuilds, swayMeshes: fol, signMeshes: lit }; }"""
SCRIPT = r"""() => {
  zoom = zoomT = 30; S.hour = 12; S.cycle = false; S.rain = false; __hook(); __step(60);
  const r0 = { rebuilds: SC.rebuilds, strips: SC.strips, rects: SC.rects }, c0 = Object.assign({}, __T.calls); __T.live = __T.cache = 0;
  const f0 = 0, out = [];
  const run = (label, js, n) => { const a = { rebuilds: SC.rebuilds, strips: SC.strips, rects: SC.rects }, c = Object.assign({}, __T.calls); const t = __T.cache; (0, eval)(js); __step(n);
    out.push({ step: label, wholeSwaps: SC.rebuilds - a.rebuilds, ringStrips: SC.strips - a.strips, editRects: SC.rects - a.rects, fullDraws: __T.calls.full - c.full, bandDraws: __T.calls.band - c.band, rectDraws: __T.calls.rect - c.rect, cachePlantTris: __T.cache - t }); };
  run('still', '0', 30);
  run('pan slow', 'camGoal.x += 6; camGoal.z -= 4', 40);
  run('pan fast', 'camGoal.x += 25; camGoal.z += 20', 40);
  run('rest', '0', 60);
  run('turn', 'yawT += .5', 30);
  run('rest after turn', '0', 80);
  run('pan again', 'camGoal.x -= 30', 40);
  run('rest', '0', 60);
  const tot = { wholeSwaps: SC.rebuilds - r0.rebuilds, ringStrips: SC.strips - r0.strips, editRects: SC.rects - r0.rects, fullDraws: __T.calls.full - c0.full, bandDraws: __T.calls.band - c0.band, rectDraws: __T.calls.rect - c0.rect, cachePlantTris: __T.cache, livePlantTris: __T.live };
  return { steps: out, total: tot, folOn: typeof FOLST !== 'undefined' ? FOLST.on : null }; }"""

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zooms', nargs='*', type=float, default=[8, 15, 30])
    ap.add_argument('--tag', default='now'); ap.add_argument('--ref', default=None); ap.add_argument('--tol', type=float); ap.add_argument('--off', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('cs_' + a.scene + a.tag, a.ref); sc = H.load_scenes([a.scene])[0]
    init = 'window.__KEEP_CPU = true;' + ('window.__FOL_TOL = %s;' % a.tol if a.tol else '')
    out = {'scene': a.scene, 'ref': a.ref or 'working tree', 'tol': a.tol, 'off': a.off, 'zooms': {}}
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
        pg.add_script_tag(path=os.path.join(HERE, 'measure_foliage.js'))
        pg.evaluate('() => __fol.noDraw()')
        st, secs = MF.settle(pg); print('settled after %.0fs, %d instances' % (secs, st['instances']), flush=True)
        if a.off: pg.evaluate('() => { PH.tests.foliageStaticOff = true; }')
        pg.evaluate(HOOK)
        for z in a.zooms:
            r = pg.evaluate(STILL, z); out['zooms'][str(int(z))] = r; print(json.dumps(r), flush=True)
        out['script'] = pg.evaluate(SCRIPT); print(json.dumps(out['script'], indent=1), flush=True)
        out['errors'] = errs[:5]; print('page errors:', errs[:3]); br.close()
    srv.shutdown()
    os.makedirs(os.path.join(HERE, 'measure'), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, 'measure', 'static.%s.%s.json' % (a.scene, a.tag)), 'w'), indent=1)

if __name__ == '__main__':
    main()
