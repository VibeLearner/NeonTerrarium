// In-page half of tools/perf/recipe_proof.py (round 9, item 1): makes each plot twice, live and from its recipe alone (recipeGen in js/recipe.js), from the same
// place in the seeded random stream, and compares everything that comes out byte for byte (hashes per part, so a difference says where).
window.__proof = (() => {
  const hb = (u8, h = 2166136261) => { for (let i = 0; i < u8.length; i++){ h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const hs = (s, h = 2166136261) => { for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const rep = (k, v) => {
    if (ArrayBuffer.isView(v)) return 'ta:' + v.constructor.name + ':' + v.length + ':' + hb(bytes(v));
    if (v && v.isMaterial) return 'mat#' + v.id;
    if (v && (v.isObject3D || v.isBufferGeometry || v.isTexture)) return 'obj:' + (v.type || '') + '#' + (v.id ?? '');
    if (typeof v === 'number' && !isFinite(v)) return 'num:' + v;
    if (typeof v === 'function') return 'fn';
    if (v === undefined) return 'undef';
    return v;
  };
  const js = o => { try { return JSON.stringify(o, rep); } catch (e) { return 'ERR:' + e.message; } };
  function parts(c){
    const P = {}, geo = c.data.geo; let n = 0;
    for (const [mat, g] of geo){
      const tag = 'geo' + (n++) + ':mat#' + mat.id;
      for (const k of Object.keys(g.attributes).sort()){ const a = g.attributes[k]; P[tag + ':' + k] = hb(bytes(a.array)) + ':' + a.itemSize + ':' + a.normalized; }
      if (g.index) P[tag + ':index'] = g.index.array.constructor.name + ':' + g.index.count + ':' + hb(bytes(g.index.array));
      P[tag + ':draw'] = g.drawRange.start + ',' + g.drawRange.count;
      P[tag + ':user'] = hs(js(g.userData));
      const b = g.boundingSphere; P[tag + ':bs'] = b ? [b.center.x, b.center.y, b.center.z, b.radius].join(',') : '-';
    }
    P.nGeo = n;
    for (const k of ['fol', 'glows', 'emitters', 'pads', 'ports', 'spots']) P['data.' + k] = hs(js(c.data[k]));
    for (const k of (c._written || c._liveWritten).sort()) P['f.' + k] = hs(js(c[k]));
    P.air = String(c._airFlag ?? c._air);
    P.written = (c._written || c._liveWritten).sort().join();
    return P;
  }
  const diff = (A, B) => { const out = []; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (A[k] !== B[k]) out.push(k + ' (' + A[k] + ' vs ' + B[k] + ')'); return out; };
  // a cheap fingerprint of every top-level name the page declared, to see which generation wrote to
  function fp(names){
    const o = {};
    for (const n of names){
      let v; try { v = (0, eval)(n); } catch (e) { continue; }
      const t = typeof v;
      if (v === null) o[n] = 'null';
      else if (t === 'number' || t === 'string' || t === 'boolean' || t === 'undefined') o[n] = t + ':' + v;
      else if (v instanceof Map || v instanceof Set) o[n] = 'size:' + v.size;
      else if (Array.isArray(v)) o[n] = 'len:' + v.length;
      else if (t === 'object' && !v.isObject3D && !v.isMaterial && !v.isBufferGeometry && !ArrayBuffer.isView(v) && Object.getPrototypeOf(v) === Object.prototype){
        let s = 0; const ks = Object.keys(v); for (const k of ks){ const x = v[k]; s = hs(k + (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean' ? x : Array.isArray(x) ? 'L' + x.length : x instanceof Map || x instanceof Set ? 'S' + x.size : typeof x), s || 2166136261); }
        o[n] = 'obj:' + ks.length + ':' + s; }
    }
    return o;
  }
  // one plot: live, then from the recipe. Returns the differences (empty: byte for byte the same)
  function one(c, seed, world){
    const r = recipeOf(c), before = js(c.sections) + js(c.below);
    const keep = {}; for (const k of Object.keys(c)) keep[k] = c[k];
    let live, rc0, rc1;
    __randSeed(seed); rc0 = __randCalls();
    const lw = new Set(), pc = new Proxy(c, { set(t, k, v){ lw.add(k); t[k] = v; return true; } });
    DARK = r.dark; SIDE_SPLIT = true; try { live = drain(collectGen(cellBody(pc))); } finally { DARK = false; SIDE_SPLIT = false; }
    rc1 = __randCalls();
    const lc = {}; for (const k of Object.keys(c)) lc[k] = c[k]; lc.data = live;
    lc._liveWritten = [...lw]; lc._airFlag = airCells.has(c);
    const liveRand = rc1 - rc0, liveMut = (js(c.sections) + js(c.below)) !== before;
    for (const k of Object.keys(c)) if (!(k in keep)) delete c[k]; Object.assign(c, keep);   // (the plot as it was)
    const liveParts = parts(lc);
    for (const g of live.geo.values()) g.dispose();
    __randSeed(seed); rc0 = __randCalls();
    let sc; try { sc = recipeGen(r, world); } catch (e) { return { err: String(e.message || e), recipe: r }; }
    const sbRand = __randCalls() - rc0;
    const sbParts = parts(sc); for (const g of sc.data.geo.values()) g.dispose();
    const d = diff(liveParts, sbParts);
    if (liveRand !== sbRand) d.push('random calls (' + liveRand + ' vs ' + sbRand + ')');
    if (liveMut) d.push('live generation changed c.sections or c.below in place');
    return { d, rand: liveRand, nb: r.nb.join('') };
  }
  // the plot made live from the same place in the stream, as one hash (for the checks that change a global and see whether any plot changes)
  function live(c, seed){
    const keep = {}; for (const k of Object.keys(c)) keep[k] = c[k];
    __randSeed(seed); DARK = isDarkPlot(c); SIDE_SPLIT = true; let d; try { d = drain(collectGen(cellBody(c))); } finally { DARK = false; SIDE_SPLIT = false; }
    const lc = {}; for (const k of Object.keys(c)) lc[k] = c[k]; lc.data = d; lc._liveWritten = ['topY', 'height', 'lifts', 'sectionTops', 'firstFloors', 'vent', 'walks', 'liftCab', 'liftRoof', 'belowTop', 'belowTops', '_topLot'];
    for (const k of Object.keys(c)) if (!(k in keep)) delete c[k]; Object.assign(c, keep);
    const P = parts(lc); for (const g of d.geo.values()) g.dispose(); return hs(js(P));
  }
  return { one, fp, live };
})();
