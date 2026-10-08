#!/usr/bin/env python3
"""Where the 'JS heap' of performance.memory goes: Chrome counts the backing stores of typed arrays in it. Sums the typed arrays three.js keeps for
every geometry in the scene (by attribute) and the other big typed arrays it can reach through the scene graph.
   python3 tools/perf/heapsplit.py maxcity [--ref REF]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """() => { const seen = new Set(), by = {}; let geos = 0, tot = 0;
  const add = (k, a) => { if (!a || !a.buffer || seen.has(a.buffer)) return; seen.add(a.buffer); by[k] = (by[k] || 0) + a.byteLength; tot += a.byteLength; };
  const walk = o => { const g = o.geometry; if (g && !seen.has(g)){ seen.add(g); geos++; for (const k in g.attributes) add('attr ' + k, g.attributes[k].array); if (g.index) add('index', g.index.array);
      if (g.userData){ for (const k in g.userData){ const v = g.userData[k]; if (v && v.buffer) add('userData ' + k, v); else if (v && typeof v === 'object') for (const kk in v){ if (v[kk] && v[kk].buffer) add('userData.' + k + '.' + kk, v[kk]); } } } }
    if (o.isInstancedMesh){ add('instance matrix', o.instanceMatrix.array); if (o.instanceColor) add('instance color', o.instanceColor.array); } };
  scene.traverse(walk);
  // geometry bytes whose every mesh is hidden (a plot's own meshes once their region is merged into one): kept for the next merge
  const owners = new Map(); scene.traverse(o => { const g = o.geometry; if (!g) return; let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false; const e = owners.get(g) || { vis: false }; e.vis = e.vis || vis; owners.set(g, e); });
  const bytes = g => { let n = 0; for (const k in g.attributes) n += g.attributes[k].array.byteLength; if (g.index) n += g.index.array.byteLength; return n; };
  let hid = 0, vis = 0; for (const [g, e] of owners){ const b = bytes(g); if (e.vis) vis += b; else hid += b; }
  const out = {}; for (const k of Object.keys(by).sort((a, b) => by[b] - by[a])) out[k] = +(by[k]/1048576).toFixed(1);
  return { geometries: geos, typedMB: +(tot/1048576).toFixed(1), top: Object.fromEntries(Object.entries(out).slice(0, 14)), heapMB: +(performance.memory.usedJSHeapSize/1048576).toFixed(0), geometryOfVisibleMeshesMB: +(vis/1048576).toFixed(0), geometryOfHiddenMeshesMB: +(hid/1048576).toFixed(0) }; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--ref', default=None); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('hsp', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0]); pg.evaluate('() => __perf.cap(5, 1)')
        print(json.dumps(pg.evaluate(JS), indent=1)); print(errs[:2]); br.close()
    srv.shutdown()
