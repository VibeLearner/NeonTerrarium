#!/usr/bin/env python3
"""Round 9, item 7: a city loaded from its recipes by the worker is the same city as the old load made. Two pages from the same save, one with the test "load on the main thread (as before)", one
loading through the worker; when the second has finished loading, every plot's own arrays (all but the random detail and flicker ids), the regions, the megastructures' data and the walking
network are compared. Also what the load looked like: how many plots were in when the first frame was drawn.
   python3 tools/perf/load_check.py city"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
SUM = r"""
async () => {
  for (let g = 0; g < 100000 && LOADP.on; g++){ __step(1); if (g % 5 === 4) await new Promise(r => setTimeout(r, 5)); }
  for (let g = 0; g < 400; g++){ __step(1); if (g % 20 === 19) await new Promise(r => setTimeout(r, 2)); }
  const hb = (a, h = 2166136261) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++){ h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const plots = {}; let nData = 0;
  for (const c of cells.values()){ if (!c.data){ plots[c.i + ',' + c.j] = 'none'; continue; } nData++; const g = c.data.geo.get(ATLAS); let h = 0; if (g){ if (c.data.pm && (c.data.pm.out)) pmRestoreSync(c.data.pm, 'check'); for (const k of ['position', 'normal', 'color', 'aEm', 'aOn']){ const a = g.attributes[k]; if (a && a.array) h = hb(a.array, h || 2166136261); } if (g.index) h = hb(g.index.array, h); }
    plots[c.i + ',' + c.j] = h + ':' + c.height.toFixed(4) + ':' + c.topY.toFixed(4) + ':' + c.data.emitters.length + ':' + c.data.pads.length + ':' + c.data.ports.length + ':' + (c.data.spots || []).length; }
  const hh = (a, h = 2166136261) => { const t = String(a); for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  let nh = hh(NG.x.length); for (let i = 0; i < NG.x.length; i++){ nh = hh(NG.x[i] + ',' + NG.z[i], nh); for (const [b, e] of NG.adj[i]) nh = hh(b + ':' + e.len + ':' + e.cost, nh); }
  return { plots, nData, regions: regions.size, megas: [...megas.values()].map(m => m.id + ':' + (m.data ? m.data.geo.size : 0) + ':' + m.roofH.toFixed(3)), nodes: NG.x.length, places: places.size, netHash: nh, solid: solidRegions.size, line: LOADP.line(), air: airCells.size };
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--old-order', action='store_true', help='load the plots in the order the old load made them (nearest first otherwise)'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); sc = H.load_scenes([a.scene])[0]; res = {}
    with sync_playwright() as pw:
        br = H.launch(pw)
        for mode, init in (('old', 'window.__NV_OFF = true; window.__LOAD_MAIN = true;'), ('worker', 'window.__NV_OFF = true; window.__GEN_WORKER = true;' + ('window.__LOAD_OLD_ORDER = true;' if a.old_order else ''))):
            url = H.make_site('lc' + mode[:2], None)
            ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
            pg.evaluate('() => { __perf.skip = true; }')
            res[mode] = pg.evaluate(SUM); res[mode]['errs'] = errs[:3]; ctx.close()
        br.close()
    srv.shutdown()
    A, B = res['old'], res['worker']
    bad = [k for k in A['plots'] if A['plots'][k] != B['plots'].get(k)]
    print('plots %d old / %d worker with data; differ %d %s' % (A['nData'], B['nData'], len(bad), bad[:4]))
    for k in ('regions', 'megas', 'nodes', 'places', 'netHash', 'solid', 'air'): print('  %-8s old %s | worker %s %s' % (k, str(A[k])[:60], str(B[k])[:60], '' if A[k] == B[k] else '   <-- DIFFERS'))
    print('worker:', B['line'], '| errors', A['errs'], B['errs'])
    sys.exit(1 if bad or any(A[k] != B[k] for k in ('regions', 'megas', 'nodes', 'places')) else 0)
