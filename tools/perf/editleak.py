#!/usr/bin/env python3
"""The edit leak: does a session of building leave the page heavier than a fresh load of the same city?
Loads a scene, does N edits of a fixed mix (platforms, sections in every zone, demolitions, greenery, a megastructure placed and removed), drawing frames as the
game does after each (the sweeps and staged builds play out, the static cache redraws and swaps), saves, and loads the saved city in a new page at the same view.
Prints, after load, every --every edits, after the edits and after the fresh load: draw calls and triangles in one frame (cache in use, and cache off at the end), what three
holds on the card, the bytes the page asked for, the WebGL objects created since load and still alive (by creation site), the objects in the scene by layer and material,
and the cache's state and targets.
   python3 tools/perf/editleak.py city [--n 30] [--every 25] [--frames 45] [--draw 2] [--sites 12]
Counts and bytes only; nothing is timed (the software renderer)."""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from memcheck import GL

TRACK = r"""
(() => {
  Error.stackTraceLimit = 60;
  const P = WebGL2RenderingContext.prototype, live = new Map(), mk = {}, base = new Set();
  window.__GLLIVE = { live, base };
  const site = () => { const s = (new Error().stack || '').split('\n'); const out = [];
    for (const l of s){ if (/three/i.test(l) || /Error$/.test(l)) continue; const m = l.match(/\/(js\/[\w.\-]+\.js)[^:]*:(\d+):\d+/); const fn = l.match(/at (\S+)/); if (m){ out.push((fn ? fn[1] : '?') + ' ' + m[1] + ':' + m[2]); if (out.length >= 3) break; } }
    return out.length ? out.join(' < ') : (s[2] || '').trim().slice(0, 100); };
  for (const [kind, c, d] of [['buffer', 'createBuffer', 'deleteBuffer'], ['texture', 'createTexture', 'deleteTexture'], ['framebuffer', 'createFramebuffer', 'deleteFramebuffer'], ['renderbuffer', 'createRenderbuffer', 'deleteRenderbuffer'], ['vao', 'createVertexArray', 'deleteVertexArray'], ['program', 'createProgram', 'deleteProgram']]){
    const oc = P[c]; P[c] = function(){ const o = oc.apply(this, arguments); if (o) live.set(o, { kind, site: site() }); return o; };
    const od = P[d]; P[d] = function(o){ if (o) live.delete(o); return od.apply(this, arguments); };
  }
})();
"""

MEASURE = r"""
(opts) => {
  const out = {};
  const cen = {}; const rbd0 = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function(camera, sc, geo, mat, obj, grp){ const rt = renderer.getRenderTarget(); const mt = mat || {};
    const key = (rt ? rt.width + 'x' + rt.height : 'screen') + ' | mask ' + obj.layers.mask + ' | ' + (mt.type || '?') + (obj.isInstancedMesh ? ' inst' : '') + (obj.isPoints ? ' points' : obj.isLine ? ' line' : obj.isSprite ? ' sprite' : '') + (mt.isMeshToonMaterial && obj.layers.mask === 1 && geo && geo.attributes && geo.attributes.position ? ' | verts 2^' + Math.round(Math.log2(geo.attributes.position.count)) + (obj.userData.cell ? ' cell' : '') + (obj.userData.own ? ' own' : '') + (obj.userData.isOv ? ' OV' : '') + (typeof ATLAS_OV !== 'undefined' && mt === ATLAS_OV ? ' ATLAS_OV' : typeof ATLAS !== 'undefined' && mt === ATLAS ? ' ATLAS' : '') + (obj.userData.blockKey !== undefined ? ' blk' : '') + (mt.userData && mt.userData.colorOnly ? ' glass' : '') + (obj.castShadow ? ' cast' : '') + (geo.groups && geo.groups.length ? ' groups' : '') : '');
    const e = cen[key] || (cen[key] = { n: 0, tris: 0 }); e.n++; return rbd0.apply(this, arguments); };
  renderer.info.reset(); try { __step(1); } finally { renderer.renderBufferDirect = rbd0; }
  out.census = cen;
  out.calls = renderer.info.render.calls; out.tris = renderer.info.render.triangles;
  const m = renderer.info.memory; out.geoms = m.geometries; out.texs = m.textures; out.programs = renderer.info.programs ? renderer.info.programs.length : 0;
  const g = window.__GLMEM; out.texMB = g.tex/1048576; out.bufMB = g.buf/1048576; out.rbMB = g.rb/1048576;
  const L = window.__GLLIVE; const kinds = {}, sites = {};
  for (const [o, v] of L.live){ if (L.base.has(o)) continue; kinds[v.kind] = (kinds[v.kind] || 0) + 1; const k = v.kind + ' ' + v.site; sites[k] = (sites[k] || 0) + 1; }
  out.liveKinds = kinds; out.liveSites = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, opts.sites);
  const big = {}; for (const [o, v] of L.live){ if (v.kind !== 'texture' && v.kind !== 'renderbuffer') continue; const b = window.__GLMEM.sz.get(o) || 0; if (b < 1e6) continue; const k = v.kind + ' ' + (b/1048576).toFixed(1) + ' MB ' + (L.base.has(o) ? '(at load) ' : '(since load) ') + v.site; big[k] = (big[k] || 0) + 1; }
  out.big = Object.entries(big).sort((a, b) => b[0] < a[0] ? -1 : 1);
  out.liveAll = {}; for (const [o, v] of L.live) out.liveAll[v.kind] = (out.liveAll[v.kind] || 0) + 1;
  const sc = {}; let objs = 0;
  scene.traverse(o => { objs++; if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return; const mt = Array.isArray(o.material) ? o.material[0] : o.material;
    const key = 'mask ' + o.layers.mask + ' ' + (mt ? mt.type : '?') + (o.isInstancedMesh ? ' inst' : '') + (o.visible ? '' : ' hidden'); const e = sc[key] || (sc[key] = { n: 0, inst: 0 }); e.n++; if (o.isInstancedMesh) e.inst += o.count; });
  out.objs = objs; out.scene = sc;
  out.sc = typeof SC !== 'undefined' && SC.line ? SC.line() : ''; out.scMode = typeof SC !== 'undefined' ? SC.mode : null;
  out.cells = cells.size; out.anims = anims.length;
  out.state = { regions: regions.size, solidRegions: solidRegions.size, superRegions: superRegions.size, dirtyRegions: dirtyRegions.size, heldRegions: heldRegions.size, pendingRegions: pendingRegions.size, solidDirty: solidDirty.size, superDirty: superDirty.size, animCells: animCells.size, stageQ: STAGE_Q.length, stageReady: STAGE_READY.length, stash: typeof TIER !== 'undefined' && TIER.stash ? TIER.stash.size : null, solidJob: !!SOLID_JOB };
  out.heapMB = performance.memory ? performance.memory.usedJSHeapSize/1048576 : null;
  return out;
}
"""


GEOTRACK = r"""
() => {
  const reg = new Map(), tag = new WeakMap(); window.__GEO = { reg, tag }; var G_;
  const ED = THREE.EventDispatcher.prototype, add = ED.addEventListener, rem = ED.removeEventListener;
  const site = () => { const s = (new Error().stack || '').split('\n'); const out = [];
    for (const l of s){ if (/three/i.test(l) || /Error$/.test(l)) continue; const m = l.match(/\/(js\/[\w.\-]+\.js)[^:]*:(\d+):\d+/); const fn = l.match(/at (\S+)/); if (m){ out.push((fn ? fn[1] : '?') + ' ' + m[1] + ':' + m[2]); if (out.length >= 3) break; } }
    return out.join(' < '); };
  ED.addEventListener = function(t, f){ if (t === 'dispose' && this.isBufferGeometry) reg.set(this, 1); return add.apply(this, arguments); };
  ED.removeEventListener = function(t, f){ if (t === 'dispose' && this.isBufferGeometry) reg.delete(this); return rem.apply(this, arguments); };
  G_ = window.__GEO; G_.rem = new WeakMap(); G_.disp = new WeakMap();
  const orem = THREE.Object3D.prototype.remove; THREE.Object3D.prototype.remove = function(){ for (const o of arguments) o.traverse(m => { if (m.geometry && !G_.rem.has(m.geometry)) G_.rem.set(m.geometry, site()); }); return orem.apply(this, arguments); };
  const odisp = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function(){ G_.disp.set(this, (G_.disp.get(this) || 0) + 1); return odisp.apply(this, arguments); };
  G_.tick = 0; G_.lastR = new WeakMap(); G_.lastD = new WeakMap();
  const rbd = renderer.renderBufferDirect; renderer.renderBufferDirect = function(camera, sc, geo, mat, obj, grp){ G_.tick++; let p = obj, att = false; while (p){ if (p === scene){ att = true; break; } p = p.parent; }
    G_.lastR.set(geo, { t: G_.tick, att, mask: obj.layers.mask, vis: obj.visible, kind: obj.userData && obj.userData.blockKey !== undefined ? 'blockMesh' : obj.userData && obj.userData.sideOf ? 'side' : obj.type, rt: renderer.getRenderTarget() ? 'target' : 'screen' }); return rbd.apply(this, arguments); };
  const odisp2 = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function(){ G_.tick++; G_.lastD.set(this, { t: G_.tick, at: site() }); return odisp2.apply(this, arguments); };
  const sa = THREE.BufferGeometry.prototype.setAttribute; THREE.BufferGeometry.prototype.setAttribute = function(){ if (!tag.has(this)) tag.set(this, site()); return sa.apply(this, arguments); };
}
"""

GEOCOUNT = r"""
(opts) => {
  const G = window.__GEO, seen = new Set(); let reach = 0;
  scene.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o.geometry) seen.add(o.geometry); });
  const hold = {}; scene.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o.geometry && G.reg.has(o.geometry)){ const k = 'mask ' + o.layers.mask + (o.visible ? '' : ' hidden') + (o.isInstancedMesh ? ' inst' : '') + (o.userData.own ? ' own' : ''); hold[k] = (hold[k] || 0) + 1; } });
  const cat = new Map(); const mark = (g, name) => { if (g && !cat.has(g)) cat.set(g, name); };
  for (const rec of solidRegions.values()){ for (const g of rec.geoms) mark(g, 'solidRegions.geoms'); for (const m of rec.members) mark(m.geometry, 'solidRegions.members'); for (const m of rec.far || []){ mark(m.userData.stdGeo, 'far.std'); mark(m.userData.farGeo, 'far.far'); } }
  if (typeof TIER !== 'undefined') for (const st of TIER.stash.values()){ if (st.rec){ for (const g of st.rec.geoms || []) mark(g, 'TIER.stash'); } }
  for (const c of [...cells.values(), ...megas.values()]){ if (c.data){ for (const g of c.data.geo.values()) mark(g, 'cell.data'); if (c.data.sgeo) mark(c.data.sgeo, 'cell.data.sgeo'); } }
  scene.traverse(o => { if (o.userData && o.userData.stdGeo) mark(o.userData.stdGeo, 'mesh.stdGeo'); if (o.userData && o.userData.farGeo) mark(o.userData.farGeo, 'mesh.farGeo'); });
  const out = { hold, registered: G.reg.size, reachable: 0, unreach: 0, unreachBytes: 0, sites: {} };
  for (const g of G.reg.keys()){ if (seen.has(g)){ out.reachable++; continue; }
    out.unreach++; let b = 0; for (const k in g.attributes){ const a = g.attributes[k]; b += a.array ? a.array.byteLength : 0; } if (g.index && g.index.array) b += g.index.array.byteLength; out.unreachBytes += b;
    const k = (cat.get(g) || 'HELD BY NOTHING') + ' | removed from scene at ' + (G.rem.get(g) || 'never') + ' | disposed x' + (G.disp.get(g) || 0) + (G.lastD.get(g) ? ' last at ' + G.lastD.get(g).at : '') + ' | last drawn ' + (G.lastR.get(g) ? (G.lastR.get(g).t > (G.lastD.get(g) ? G.lastD.get(g).t : 0) ? 'AFTER the dispose' : 'before the dispose') + ' as ' + JSON.stringify(G.lastR.get(g)) : 'never') + ' | ' + (G.tag.get(g) || '(made before tracking)') + (g.userData && Object.keys(g.userData).length ? ' ' + Object.keys(g.userData).join(',') : ''); const e = out.sites[k] || (out.sites[k] = { n: 0, bytes: 0 }); e.n++; e.bytes += b; }
  out.sites = Object.entries(out.sites).sort((a, b) => b[1].n - a[1].n).slice(0, opts.sites);
  return out;
}
"""

EDITS = r"""
window.__EL = (() => {
  const E = {}; E.log = [];
  const ZS = ['low', 'mid', 'high', 'ind'];
  const built = () => [...cells.values()].filter(c => !c.mega && c.sections.length && !c.lift).sort((a, b) => a.i - b.i || a.j - b.j);
  const empties = () => [...cells.values()].filter(c => !c.mega && !c.sections.length && !c.lift).sort((a, b) => a.i - b.i || a.j - b.j);
  const pick = (list, k) => list.length ? list[(k * 7919 + 13) % list.length] : null;
  E.edit = k => {
    const r = k % 8; let what = '';
    try {
      if (r === 0 || r === 4){   // a new platform beside a plot
        const b = pick([...cells.values()].filter(c => !c.mega), k); let done = null;
        if (b) for (const [a, d] of [[1, 0], [0, 1], [-1, 0], [0, -1]]){ const i = b.i + a, j = b.j + d; if (Math.abs(i) <= 7 && Math.abs(j) <= 7 && !cells.has(ckey(i, j))){ done = addPlatform(i, j, null); break; } }
        what = done ? 'platform' : 'platform (none free)';
      } else if (r === 1 || r === 5){ const c = pick(empties(), k) || pick(built(), k); if (c){ addSection(c, ZS[(k >> 1) % 4]); what = 'section ' + ZS[(k >> 1) % 4]; } }
      else if (r === 2){ const c = pick(built(), k); if (c){ addSection(c, ZS[(k + 1) % 4]); what = 'tower section'; } }
      else if (r === 3){ const bl = built(); if (bl.length > 14){ removeAt({ kind: 'bld', c: pick(bl, k) }); what = 'demolish'; } else { const c = pick(bl, k); if (c){ addSection(c, 'mid'); what = 'section (kept: few plots)'; } } }
      else if (r === 6){ const c = pick(built(), k); if (c){ cycleGreen(c); what = 'greenery'; } }
      else if (r === 7){
        if (k % 16 === 7 && !window.__EL_NOMEGA){   // a megastructure down, and on the next round up out of the way again
          const f = [...cells.values()].filter(c => !c.mega); let ok = null;
          for (let q = 0; q < 40 && !ok; q++){ const c = pick(f, k + q); if (c && !c.sections.length){ const m = placeMega('foundry', c.i, c.j, 77 + k); if (m) ok = m; } }
          E.mega = ok ? ok.id : null; what = ok ? 'mega placed' : 'mega (no room)';
        } else if (!window.__EL_NOMEGA && E.mega && megas.get(E.mega)){ removeMega(megas.get(E.mega)); E.mega = null; what = 'mega removed'; }
        else { const c = pick(empties(), k); if (c){ removePlatform(c); what = 'platform removed'; } }
      }
    } catch (e) { what = 'ERROR ' + e; }
    E.log.push(what); return what;
  };
  return E;
})();
"""

def fmt(tag, r):
    print('%-18s draws %4d  tris %7d | geoms %4d  textures %3d  programs %3d | tex %6.1f MB  buf %6.1f MB  rb %5.1f MB | live GL objects since load %s | scene objs %d  cells %d  anims %d' % (
        tag, r['calls'], r['tris'], r['geoms'], r['texs'], r['programs'], r['texMB'], r['bufMB'], r['rbMB'], json.dumps(r['liveKinds'], sort_keys=True), r['objs'], r['cells'], r['anims']), flush=True)

# (note: the 'registered with three' counts include the game's own dispose listeners; renderer.info.memory.geometries is the authority)
SETTLE = """() => { let g = 0; while ((anims.length || (typeof NV !== 'undefined' && (NV.job || NV.queue.length)) || SOLID_JOB || solidDirty.size || superDirty.size || dirtyRegions.size || STAGE_Q.length || STAGE_READY.length || pendingRegions.size) && g++ < 400) __perf.cap(30, 0);   // (the merges and staged builds the game finishes in a few frames' spare time)
  let n = 0; for (; n < 14; n++){ __perf.cap(2, 1); if (typeof SC === 'undefined' || SC.mode === 'off' || (SC.state === 'in use' && !anims.length && !SC.job)){ __perf.cap(2, 1); if (SC.mode === 'off' || SC.state === 'in use') break; } } return n; }"""

def newpage(pw, url, sc, init=''):
    br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=GL + TRACK + init + ('window.__EL_NOMEGA = true;' if os.environ.get('EL_NOMEGA') else ''))
    pg.evaluate("() => { window.__GLLIVE.base = new Set(window.__GLLIVE.live.keys()); }"); pg.evaluate(GEOTRACK)   # (what exists after load is not counted as created by the edits)
    return br, pg, errs

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--n', type=int, default=30); ap.add_argument('--every', type=int, default=25)
    ap.add_argument('--frames', type=int, default=45); ap.add_argument('--draw', type=int, default=2); ap.add_argument('--sites', type=int, default=12); ap.add_argument('--json', default=None)
    ap.add_argument('--no-fresh', action='store_true'); ap.add_argument('--no-mega', action='store_true', help='leave the megastructure out of the edit mix (to see whether its one-time textures and programs are the few extras)'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('editleak', None); sc = H.load_scenes([a.scene])[0]
    if a.no_mega: os.environ['EL_NOMEGA'] = '1'
    res = {}
    with sync_playwright() as pw:
        br, pg, errs = newpage(pw, url, sc)
        pg.evaluate("() => { S.cycle = false; S.rain = false; S.hour = 14; }"); pg.evaluate(EDITS)
        pg.evaluate("() => __perf.cap(90, 3)")
        def M():
            pg.evaluate(SETTLE); r = pg.evaluate(MEASURE, {'sites': a.sites}); r['geo'] = pg.evaluate(GEOCOUNT, {'sites': a.sites}); return r
        res['load'] = M(); fmt('after load', res['load'])
        for k in range(a.n):
            what = pg.evaluate('k => __EL.edit(k)', k)
            pg.evaluate('([n, d]) => __perf.cap(n, d)', [a.frames, a.draw])
            if (k + 1) % a.every == 0 and k + 1 < a.n: r = M(); res['edit%d' % (k + 1)] = r; fmt('after %d edits' % (k + 1), r)
        pg.evaluate("() => { let g = 0; while (anims.length && g++ < 600) __perf.cap(30, 0); __perf.cap(30, 2); }")   # (let everything finish, then the settled frames the owner would see)
        res['edited'] = M(); fmt('after %d edits' % a.n, res['edited'])
        pg.evaluate("() => { SC.mode = 'off'; __perf.cap(3, 2); }"); pg.evaluate(SETTLE); res['edited_off'] = M(); fmt('  cache off', res['edited_off'])
        pg.evaluate("() => { SC.mode = 'reuse'; __perf.cap(10, 2); }")
        saved = pg.evaluate("() => { save(); const sv = {}; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); sv[k] = localStorage.getItem(k); } return sv; }")
        t_end = pg.evaluate('() => performance.now()')
        view = pg.evaluate("() => ({ x: camGoal.x, y: camGoal.y, z: camGoal.z, zoom, yaw })")
        print('edit log:', ', '.join('%s x%d' % (w, n) for w, n in sorted({w: pg.evaluate('w => __EL.log.filter(x => x === w).length', w) for w in set(pg.evaluate('() => __EL.log'))}.items())), '| page errors', errs[:2], flush=True)
        res['edit_sites'] = res['edited']['liveSites']
        br.close()
        if not a.no_fresh:
            sc2 = dict(sc); sc2['storage'] = saved
            br, pg, errs = newpage(pw, url, sc2)
            pg.evaluate("v => { S.cycle = false; S.rain = false; S.hour = 14; camGoal.set(v.x, v.y, v.z); camT.copy(camGoal); zoom = zoomT = v.zoom; yaw = yawT = v.yaw; }", view)
            pg.evaluate("() => __perf.cap(90, 3)"); pg.evaluate("() => { let g = 0; while (anims.length && g++ < 600) __perf.cap(30, 0); __perf.cap(30, 2); }")
            pg.evaluate("t => { __perf.skip = true; while (performance.now() < t) __step(60); __perf.skip = false; }", t_end)   # (the same game time as the edited page: traffic and people have had as long to come and go)
            pg.evaluate(SETTLE); res['fresh'] = pg.evaluate(MEASURE, {'sites': a.sites}); res['fresh']['geo'] = pg.evaluate(GEOCOUNT, {'sites': a.sites}); fmt('fresh load', res['fresh'])
            pg.evaluate("() => { SC.mode = 'off'; __perf.cap(3, 2); }"); pg.evaluate(SETTLE); res['fresh_off'] = pg.evaluate(MEASURE, {'sites': a.sites}); fmt('  cache off', res['fresh_off'])
            print('page errors', errs[:2]); br.close()
    srv.shutdown(); srv.server_close()
    if 'fresh' in res:
        e, f = res['edited'], res['fresh']
        print('\nafter edits against fresh load (percent over):')
        for k, lab in [('calls', 'draw calls'), ('geoms', 'geometries'), ('texs', 'textures'), ('programs', 'programs'), ('texMB', 'texture MB'), ('bufMB', 'buffer MB'), ('rbMB', 'renderbuffer MB'), ('objs', 'scene objects')]:
            print('  %-16s %9.1f %9.1f  %+6.1f%%' % (lab, e[k], f[k], 100*(e[k] - f[k])/max(f[k], 1e-9)))
        print('  live GL objects (all, incl. load): edited %s | fresh %s' % (json.dumps(e['liveAll'], sort_keys=True), json.dumps(f['liveAll'], sort_keys=True)))
        print('\nscene by layer mask and material (edited | fresh), only where they differ:')
        keys = sorted(set(e['scene']) | set(f['scene']))
        for k in keys:
            x, y = e['scene'].get(k, {'n': 0, 'inst': 0}), f['scene'].get(k, {'n': 0, 'inst': 0})
            if x != y: print('  %-46s %5d objs %7d inst | %5d objs %7d inst' % (k, x['n'], x['inst'], y['n'], y['inst']))
        for tag, r in (('edited', e), ('fresh', f)):
            print('\ntextures and renderbuffers over 1 MB (%s):' % tag)
            for k, n in r['big']: print('  %2d x %s' % (n, k[:170]))
        print('\nworld state (edited | fresh):'); print('  ' + json.dumps(e['state'])); print('  ' + json.dumps(f['state']))
        print('\ndraw calls in one frame by render target, layer mask and material (edited | fresh), where they differ:')
        for k in sorted(set(e['census']) | set(f['census'])):
            x, y = e['census'].get(k, {'n': 0})['n'], f['census'].get(k, {'n': 0})['n']
            if x != y: print('  %-80s %4d | %4d' % (k, x, y))
        print('\nGL objects created since load and still alive after the edits, by site:')
        for s, n in res['edit_sites']: print('  %5d  %s' % (n, s))
        for tag, r in (('edited', e), ('fresh', f)):
            g = r['geo']; print('\ngeometries registered with three (%s): %d, in the scene %d, NOT in the scene %d (%.1f MB of array data)' % (tag, g['registered'], g['reachable'], g['unreach'], g['unreachBytes']/1048576))
            for k, v in g['sites']: print('  %5d  %7.2f MB  %s' % (v['n'], v['bytes']/1048576, k))
            print('  registered geometries on scene objects, by layer mask / hidden:', json.dumps(g['hold'], sort_keys=True))
        print('cache: edited  ', e['sc'][:230]); print('cache: fresh   ', f['sc'][:230])
    if a.json: json.dump(res, open(a.json, 'w'), indent=1)
if __name__ == "__main__": main()
