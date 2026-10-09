#!/usr/bin/env python3
"""Item 4: which geometry bytes are merge outputs (a mesh a merge made: userData.own) and which are plot meshes, visible or hidden, and whether anything reads their CPU arrays later.
   python3 tools/perf/heapkind.py maxcity [--ref REF]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """() => { const seen = new Set(), kinds = {}; const bytes = g => { let n = 0; for (const k in g.attributes){ const a = g.attributes[k].array; if (a) n += a.byteLength; } if (g.index && g.index.array) n += g.index.array.byteLength; return n; };
  const seenBuf = new Set(); const uniq = g => { let n = 0; const add = a => { if (a && a.buffer && !seenBuf.has(a.buffer)){ seenBuf.add(a.buffer); n += a.byteLength; } }; for (const k in g.attributes) add(g.attributes[k].array); if (g.index) add(g.index.array); return n; };
  scene.traverse(o => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
    const k = (vis ? 'visible ' : 'hidden ') + (o.userData.own ? 'merge output' : 'plain mesh') + (o.isInstancedMesh ? ' instanced' : o.isPoints ? ' points' : '');
    const e = kinds[k] || (kinds[k] = { n: 0, MB: 0 }); e.n++; e.MB += uniq(g)/1048576; });
  const seenB2 = new Set(); const u2 = g => { let n = 0; const add = a => { if (a && a.buffer && !seenB2.has(a.buffer)){ seenB2.add(a.buffer); n += a.byteLength; } }; for (const k in g.attributes) add(g.attributes[k].array); if (g.index) add(g.index.array); return n; };
  const by = {}; const grp = (name, root) => { let n = 0, c = 0; root.traverse(o => { if (o.geometry){ n += u2(o.geometry); c++; } }); by[name] = { geos: c, MB: +(n/1048576).toFixed(0) }; };
  let qn = 0, qc = 0; for (const [k, r] of solidRegions){ r.group.traverse(o => { if (o.geometry){ qn += u2(o.geometry); qc++; } }); } by['solid merges'] = { geos: qc, MB: +(qn/1048576).toFixed(0) };
  let rn = 0, rc = 0; for (const [k, g] of regions){ g.traverse(o => { if (o.geometry){ rn += u2(o.geometry); rc++; } }); } by['regions'] = { geos: rc, MB: +(rn/1048576).toFixed(0) };
  let cn = 0, cc = 0; for (const [k, r] of connRegions){ r.group.traverse(o => { if (o.geometry){ cn += u2(o.geometry); cc++; } }); } by['connRegions'] = { geos: cc, MB: +(cn/1048576).toFixed(0) };
  let sn = 0, sc = 0; for (const [k, g] of superRegions){ g.traverse(o => { if (o.geometry){ sn += u2(o.geometry); sc++; } }); } by['super'] = { geos: sc, MB: +(sn/1048576).toFixed(0) };
  let pn = 0, pc = 0; for (const c of [...cells.values(), ...megas.values()]){ if (c.view) c.view.traverse(o => { if (o.geometry){ pn += u2(o.geometry); pc++; } }); } by['plot views'] = { geos: pc, MB: +(pn/1048576).toFixed(0) };
  kinds.by = by;
  for (const k in kinds) if (k !== 'by') kinds[k].MB = +kinds[k].MB.toFixed(0);
  return { kinds, heapMB: +(performance.memory.usedJSHeapSize/1048576).toFixed(0) }; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--ref', default=None); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('hk', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0]); pg.evaluate('() => __perf.cap(5, 1)')
        print(json.dumps(pg.evaluate(JS), indent=1)); print(errs[:2]); br.close()
    srv.shutdown()
