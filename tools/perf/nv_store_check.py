#!/usr/bin/env python3
"""Round 9, item 6: the never-seen results kept by recipe as well as by geometry.
 A. The key leaves out the random draws of a plot's generation. Every plot of a scene (with a recipe) is made again with its recorded draws and again with other draws; positions, indexes and cut
    sizes (the things that decide what can be seen) must be the same, byte for byte (the attributes that hold the detail and flicker ids are expected to differ, and are listed).
 B. The lookup (nvLookup): by recipe with no vertex array read, a geometry-key result found once and kept by recipe, a miss kept so it is not looked for again, and the key the same twice.
   python3 tools/perf/nv_store_check.py city [--max 300]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([max]) => {
  const out = { A: { plots: 0, posDiff: 0, indexDiff: 0, cutDiff: 0, idAttrsDiffer: 0, noDraws: 0, examples: [] }, B: [] };
  const hb = a => { let h = 2166136261; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++){ h ^= u[i]; h = Math.imul(h, 16777619); } return (h >>> 0) + ':' + u.length; };
  const mk = (r, draws) => { const prev = stageCap(); try { const d = recipeGen(Object.assign({}, r, { draws }), recipeWorld()).data; const g = d.geo.get(ATLAS); const o = { pos: hb(g.attributes.position.array), idx: hb(g.index.array), cut: JSON.stringify(g.userData.cut), attrs: {} }; for (const k in g.attributes) o.attrs[k] = hb(g.attributes[k].array); for (const q of d.geo.values()) q.dispose(); return o; } finally { stageApply(prev); } };
  const list = [...cells.values()].filter(c => c.data && c.data.rec && c.data.rec.r && !c.mega && c.sections.length);
  const step = Math.max(1, Math.floor(list.length/max));
  let seed = 12345; const rnd = () => (seed = (seed*1664525 + 1013904223) >>> 0)/4294967296;
  for (let q = 0; q < list.length; q += step){
    const c = list[q], rec = c.data.rec; if (!rec.draws){ out.A.noDraws++; continue; }
    const a = mk(rec.r, rec.draws), other = new Float64Array(rec.draws.length*2 + 256); for (let i = 0; i < other.length; i++) other[i] = rnd();
    const b = mk(rec.r, other); out.A.plots++;
    if (a.pos !== b.pos){ out.A.posDiff++; if (out.A.examples.length < 3) out.A.examples.push([c.i, c.j, 'pos']); }
    if (a.idx !== b.idx){ out.A.indexDiff++; if (out.A.examples.length < 3) out.A.examples.push([c.i, c.j, 'index']); }
    if (a.cut !== b.cut){ out.A.cutDiff++; if (out.A.examples.length < 3) out.A.examples.push([c.i, c.j, 'cut']); }
    if (Object.keys(a.attrs).some(k => a.attrs[k] !== b.attrs[k])) out.A.idAttrsDiffer++;
  }
  // B: the lookup
  const c = list.find(x => x.data.geo.get(ATLAS).userData.cut), g = c.data.geo.get(ATLAS), tri = nvTriangles(g);
  const say = (name, ok, more) => out.B.push([name, !!ok, more === undefined ? '' : more]);
  let sigCalls = 0; const orig = nvSig; window.nvSig = (...a) => { sigCalls++; return orig(...a); };
  const key = nvRecSig(c, g, tri); say('key twice the same', key && key === nvRecSig(c, g, tri), key);
  say('key leaves out the draws', nvRecSig(Object.assign({}, c, { data: Object.assign({}, c.data, { rec: { r: c.data.rec.r, draws: new Float64Array([1, 2, 3]) } }) }), g, tri) === key);
  NV.store.delete(key); NV.legacy = false; sigCalls = 0;
  say('miss, no legacy: nothing found, no vertex array read', nvLookup(c, g, tri) === null && sigCalls === 0);
  const never = new Uint8Array(tri.length); for (let t = 0; t < tri.length; t += 3) never[t] = 1;
  nvDbPut(orig(g, tri), never, key); sigCalls = 0;
  const bits = nvLookup(c, g, tri); say('by recipe: found, no vertex array read', bits && bits.length && sigCalls === 0 && nvFromBits(bits, tri.length)[3] === 1 && nvFromBits(bits, tri.length)[1] === 0);
  NV.store.delete(key); NV.legacy = true; sigCalls = 0;
  const b2 = nvLookup(c, g, tri); say('legacy: found by geometry once', b2 && b2.length && sigCalls === 1);
  sigCalls = 0; const b3 = nvLookup(c, g, tri); say('then by recipe', b3 && sigCalls === 0 && NV.store.get(key).length > 0);
  NV.store.delete(key); NV.store.delete(orig(g, tri)); sigCalls = 0;
  say('legacy miss: nothing found, geometry looked up once', nvLookup(c, g, tri) === null && sigCalls === 1 && NV.store.get(key).length === 0);
  sigCalls = 0; say('and not again', nvLookup(c, g, tri) === null && sigCalls === 0);
  window.nvSig = orig; NV.store.delete(key); NV.store.delete(orig(g, tri)); NV.legacy = false;
  return out;
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--max', type=int, default=300)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('nvstore', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_GEO = true; window.__NV_OFF = true;')
        pg.on('console', lambda m: None)
        r = pg.evaluate(RUN, [a.max]); br.close()
    srv.shutdown()
    A = r['A']; bad = A['posDiff'] + A['indexDiff'] + A['cutDiff']
    print('A: %d plots made with their draws and with other draws: positions differ %d, indexes differ %d, cut sizes differ %d (id attributes differ on %d, as expected); %d plots had no draws' % (A['plots'], A['posDiff'], A['indexDiff'], A['cutDiff'], A['idAttrsDiffer'], A['noDraws']), A['examples'])
    for n, ok, more in r['B']:
        print('B: %-62s %s %s' % (n, 'ok' if ok else 'FAIL', more)); bad += 0 if ok else 1
    print('page errors', errs[:3]); sys.exit(1 if bad else 0)
