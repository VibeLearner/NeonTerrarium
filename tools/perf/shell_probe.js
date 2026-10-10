// In-page half of tools/perf/shell_probe.py (baked far buildings, item 2): makes plots of every kind through the game's own code (recipeGen, as the plot
// worker does; megastructures through their own m.data), runs js/shell.js (Shell, loaded before this) on each plot's atlas triangles and reports counts.
// Nothing here draws or changes the city beyond hanging a few pods (addLift) for the pod kind. A builder's name is found by watching which builder function is
// on the stack when the section's first piece is put (put and withStyle are wrapped to look, nothing else changes: the draws are the same).
window.__sp = (() => {
  const SP = {};
  Error.stackTraceLimit = 60;
  // ---- which builder made a section, and whether it put balconies on
  const names = new Set(); for (const z of Object.values(SECTION_TYPES)) for (const l of [z.ground, z.upper]) for (const [f] of l) names.add(f.name);
  ['buildTenement', 'buildTower', 'glassHotel'].forEach(n => names.add(n));
  let slot = null; const slots = [];
  const putO = put, wsO = withStyle, balO = balcony;
  put = function (...a){ if (slot && slot.name === null){ const st = new Error().stack.split('\n'); for (const ln of st){ const m = /at (?:new )?([\w$]+)/.exec(ln); if (m && names.has(m[1])){ slot.name = m[1]; break; } } } return putO.apply(this, a); };
  withStyle = function (st, fn){ const s = { name: null, balc: 0 }; slots.push(s); const prev = slot; slot = s; try { return wsO.call(this, st, fn); } finally { slot = prev; } };
  balcony = function (...a){ if (slot) slot.balc++; return balO.apply(this, a); };
  SP.builders = () => slots.filter(s => s.name).map(s => s.name + (s.balc ? '+balc' : ''));

  const triCount = (g, cut) => { if (!g) return 0; const c = g.userData.cut; return c ? (c.A + c.S)/3 : (g.userData.shown !== undefined ? g.userData.shown : g.index.count)/3; };
  // one plot's data (what collectGen returns) as shell input: the atlas part, and what is outside it (textured, glow and shader geometry) as counts
  SP.partsOf = data => {
    const parts = [], extras = { map: 0, other: 0 };
    for (const [m, g] of data.geo){
      if (m === ATLAS){ parts.push(Shell.atlasParts(g.attributes.position.array, g.index.array, g.userData.cut)); }
      else { const n = g.index ? g.index.count/3 : g.attributes.position.count/3; extras[m.map ? 'map' : 'other'] += n; }
    }
    return { parts, extras };
  };
  SP.kindOf = (c, air, r) => {
    if (c.mega) return 'mega';
    if (c.lift) return 'pod' + (c.below && c.below.length ? '+below' : '');
    if (!c.sections.length) return r && r.park ? 'park' : (c.green === 'none' ? 'platform' : c.green === 'grass' ? 'lawn' : 'plain-green');
    if (air) return 'air';
    return c.sections[0].zone + (c.sections.length > 1 ? '/2+' : '/1');
  };
  // make a plot from its recipe (the stand-in cell), with an optional change to the recipe
  SP.make = (c, seed, over) => {
    const world = SP.world || (SP.world = recipeWorld());
    const r = Object.assign(recipeOf(c), over || {});
    __randSeed(seed); slots.length = 0;
    return recipeGen(r, world);
  };
  const disposeRaw = sc => { for (const g of sc.data.geo.values()) g.dispose(); if (sc.data.sgeo) sc.data.sgeo.dispose(); };
  SP.shellOf = (data, opts) => {
    const { parts, extras } = SP.partsOf(data);
    const res = Shell.build(parts, opts);
    return { res, parts, extras };
  };
  // every plot of the scene once (no shell), to learn its kind and builders: [{i, j, kind, builders, balc, tris}]
  SP.scan = (seed, max) => {
    const all = [...cells.values()].filter(c => !c.mega), step = Math.max(1, Math.floor(all.length/max)), out = [];
    for (let n = 0; n < all.length; n += step){ const c = all[n]; const sc = SP.make(c, seed + c.i*7 + c.j*13); const b = SP.builders();
      out.push({ i: c.i, j: c.j, kind: SP.kindOf(c, false, null), builders: b, secs: c.sections.length, lift: !!c.lift }); disposeRaw(sc); }
    return out;
  };
  SP.hangPods = n => {
    const out = [];
    const tall = [...cells.values()].filter(c => !c.mega && c.sections.length && c.height > CURB + FH*3);
    for (const t of tall){ if (out.length >= n) break;
      for (const [a, b] of SIDES4){ const c = cells.get(ckey(t.i + a, t.j + b)); if (!c || c.mega || c.lift || hwAt(c.i, c.j).length || mtAt(c.i, c.j).length) continue;
        if (c.sections.length && t.height < c.height + FH*2) continue;
        const y = Math.min(t.height - 1.2, c.sections.length ? c.height + FH*2 : CURB + FH*2); if (addLift(c, y, 'mid')){ out.push([c.i, c.j]); break; } } }
    stageFinishAll(); return out;
  };
  const rowOf = (res, extras, stand, base) => Object.assign(base, { tris: res.stats.tris, boxes: res.boxes, faces: res.faces.length, shellTris: res.stats.shellTris, kept: res.stats.kept, buried: res.stats.buried,
    keptShare: res.stats.keptShare, coverage: res.stats.coverage, massVol: res.stats.massVol, grid: res.stats.grid, phantom: res.stats.phantom, phantomWorstBox: res.stats.phantomWorstBox,
    snapOutMax: res.stats.snapOutMax, snapGrowth: res.stats.snapGrowth, extras, stand });
  // run the shell on the planned plots; one row per plot (counts only, no timing)
  SP.run = (list, opts, seed) => {
    const rows = [];
    for (const it of list){
      const c = cells.get(ckey(it.i, it.j)); if (!c) continue;
      const over = it.over || null; if (it.air) window.AIR_FORCE = c.i + ',' + c.j;
      const sc = SP.make(c, seed + it.i*7 + it.j*13, over); window.AIR_FORCE = undefined;
      const b = SP.builders(), r = recipeOf(c); if (over) Object.assign(r, over);
      const kind = it.air ? (sc._air ? 'air' : 'air-not-thrown') : it.kind || SP.kindOf(c, false, r);
      const { res, extras } = SP.shellOf(sc.data, opts);
      rows.push(rowOf(res, extras, triCount(sc.data.sgeo), { i: c.i, j: c.j, kind, builders: b, secs: c.sections.length }));
      disposeRaw(sc);
    }
    return rows;
  };
  // megastructures: through their own data (they are made by collect() in mega.js, not by recipeGen)
  SP.runMegas = (opts, perCell) => {
    const rows = [];
    for (const m of megas.values()){
      if (!m.data || !m.data.geo){ rows.push({ kind: 'mega:' + m.kind, err: 'no data (arrays let go)' }); continue; }
      const o = Object.assign({}, opts); if (perCell) o.maxBoxes = Math.max(opts.maxBoxes || 12, Math.round(perCell*m.w*m.h));
      const { res, extras } = SP.shellOf(m.data, o);
      rows.push(rowOf(res, extras, triCount(m.data.sgeo), { kind: 'mega:' + m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels, builders: ['mega:' + m.kind] }));
    }
    return rows;
  };
  // geometry of one plot as plain arrays, for the node probe: p, i (A, H and S), vis ranges
  SP.dump = (c, seed, over) => {
    const sc = SP.make(c, seed, over), { parts } = SP.partsOf(sc.data);
    const pt = parts[0] || { p: new Float32Array(0), i: new Uint32Array(0), vis: [] };
    const out = { p: Array.from(pt.p), i: Array.from(pt.i), vis: pt.vis };
    disposeRaw(sc); return out;
  };
  SP.dumpMega = id => { const m = megas.get(id), { parts } = SP.partsOf(m.data), pt = parts[0]; return { p: Array.from(pt.p), i: Array.from(pt.i), vis: pt.vis, w: m.w, h: m.h }; };
  return SP;
})();
