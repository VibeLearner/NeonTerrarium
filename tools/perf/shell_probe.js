// In-page half of tools/perf/shell_probe.py (baked far buildings, item 2): makes plots of every kind through the game's own code (recipeGen, as the plot
// worker does; megastructures through their own m.data), runs js/shell.js (Shell, loaded before this) on each plot's visible atlas triangles and reports
// counts. Nothing here draws or changes the city beyond hanging a few pods (addLift) for the pod kind.
window.__sp = (() => {
  const SP = {};
  const visTris = (g) => {   // a plot's atlas geometry: the visible triangles (the hidden ones and the shadow-pass copies left out)
    const cut = g.userData.cut, ix = g.index.array;
    if (cut) return Shell.atlasVisible(ix, cut);
    return ix.subarray(0, g.userData.shown !== undefined ? g.userData.shown : ix.length);
  };
  const triCount = g => { if (!g) return 0; const v = visTris(g); return v.length/3; };
  // one plot's data (what collectGen returns) as shell input
  SP.partsOf = data => {
    const parts = [], extras = { map: 0, other: 0 };
    for (const [m, g] of data.geo){
      if (m === ATLAS){ parts.push({ p: g.attributes.position.array, i: visTris(g), kind: 'atlas' }); }
      else if (g.index) extras[m.map ? 'map' : 'other'] += g.index.count/3;
      else extras[m.map ? 'map' : 'other'] += g.attributes.position.count/3;
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
    __randSeed(seed);
    const sc = recipeGen(r, world);
    return sc;
  };
  const disposeRaw = sc => { for (const g of sc.data.geo.values()) g.dispose(); if (sc.data.sgeo) sc.data.sgeo.dispose(); };
  // the shell of one made plot; returns a plain object (boxes, faces, kept triangle lists as arrays, stats)
  SP.shellOf = (data, opts, keepLists) => {
    const { parts, extras } = SP.partsOf(data);
    const res = Shell.build(parts, opts);
    const k = res.keep[0] || new Uint32Array(0);
    return { res, parts, extras, kept: keepLists ? Array.from(k) : null };
  };
  // the list of plots to examine: [{i, j, kind, over?}]
  SP.pick = (perKind, wantKinds) => {
    const all = [...cells.values()], by = {};
    for (const c of all){ if (c.mega) continue; const k = SP.kindOf(c, false, null); (by[k] || (by[k] = [])).push(c); }
    const out = [];
    for (const k of Object.keys(by).sort()){ const l = by[k], step = Math.max(1, Math.floor(l.length/perKind)); for (let n = 0; n < l.length && out.filter(o => o.kind === k).length < perKind; n += step) out.push({ i: l[n].i, j: l[n].j, kind: k }); }
    return out;
  };
  // hang pods on a few plots (empty plots beside taller buildings and over shorter ones), as recipe_proof.py --pods does
  SP.hangPods = n => {
    const out = [];
    const tall = [...cells.values()].filter(c => !c.mega && c.sections.length && c.height > CURB + FH*3);
    for (const t of tall){ if (out.length >= n) break;
      for (const [a, b] of SIDES4){ const c = cells.get(ckey(t.i + a, t.j + b)); if (!c || c.mega || c.lift || hwAt(c.i, c.j).length || mtAt(c.i, c.j).length) continue;
        if (c.sections.length && t.height < c.height + FH*2) continue;
        const y = Math.min(t.height - 1.2, c.sections.length ? c.height + FH*2 : CURB + FH*2); if (addLift(c, y, 'mid')){ out.push([c.i, c.j]); break; } } }
    stageFinishAll(); return out;
  };
  // run the shell on the picked plots; returns one row per plot (no timing: counts only)
  SP.run = (list, opts, seed) => {
    const rows = [];
    for (const it of list){
      const c = cells.get(ckey(it.i, it.j)); if (!c) continue;
      const over = it.over || null; if (it.air) window.AIR_FORCE = c.i + ',' + c.j;
      const sc = SP.make(c, seed + it.i*7 + it.j*13, over);
      window.AIR_FORCE = undefined;
      const r = recipeOf(c); if (over) Object.assign(r, over);
      const kind = it.air ? (sc._air ? 'air' : 'air-not-thrown') : it.kind || SP.kindOf(c, false, r);
      const { res, extras } = SP.shellOf(sc.data, opts, false);
      const stand = triCount(sc.data.sgeo);
      rows.push({ i: c.i, j: c.j, kind, secs: c.sections.length, tris: res.stats.tris, boxes: res.boxes, faces: res.faces.length, shellTris: res.stats.shellTris, kept: res.stats.kept, buried: res.stats.buried,
        keptShare: res.stats.keptShare, coverage: res.stats.coverage, massVol: res.stats.massVol, grid: res.stats.grid, extras, stand });
      disposeRaw(sc);
    }
    return rows;
  };
  // megastructures: through their own data
  SP.runMegas = (opts) => {
    const rows = [];
    for (const m of megas.values()){
      if (!m.data || !m.data.geo){ rows.push({ kind: 'mega:' + m.kind, err: 'no data (arrays let go)' }); continue; }
      const { res, extras } = SP.shellOf(m.data, opts, false);
      rows.push({ kind: 'mega:' + m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels, tris: res.stats.tris, boxes: res.boxes, faces: res.faces.length, shellTris: res.stats.shellTris, kept: res.stats.kept, buried: res.stats.buried,
        keptShare: res.stats.keptShare, coverage: res.stats.coverage, massVol: res.stats.massVol, grid: res.stats.grid, extras, stand: triCount(m.data.sgeo) });
    }
    return rows;
  };
  // geometry of one plot as binary-able arrays, for the node probe and the crops
  SP.dump = (c, seed, over) => {
    const sc = SP.make(c, seed, over), { parts } = SP.partsOf(sc.data);
    const pt = parts[0] || { p: new Float32Array(0), i: new Uint32Array(0) };
    const out = { p: Array.from(pt.p), i: Array.from(pt.i) };
    disposeRaw(sc); return out;
  };
  SP.dumpMega = m => { const { parts } = SP.partsOf(m.data), pt = parts[0]; return { p: Array.from(pt.p), i: Array.from(pt.i) }; };
  return SP;
})();
