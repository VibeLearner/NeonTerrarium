// Neon Terrarium: gardens (Nov 2026, sandbox only). Lawn plots that touch side to side form a garden; a garden of three or more grows into a park in the
// Central Park manner: a loose network of cream stone paths reaching most of it (straight promenades and winding side paths, gates where it meets a
// street), with lawns, tree groves and flower beds in the spaces between, benches and lanterns along the paths, and the bigger pieces (gazebos, a
// greenhouse, a koi deck, misters, a grotto) set off the paths at the end of a short spur. From six plots a pond can open, always on the plot just laid.
// Palette B ("Sunlit greenhouse"): lush greens, cream stone and copper wood by day, warm gold light on deep teal water at night.
// The spec: the "Garden system spec" doc (Nov 6), with the owner's follow-ups (Central Park paths, water only where you lay it, sprite tree tops).
//
// How it works:
//  - gardenUpdate() runs with every rebuild (world.js refreshTodo, like the parks). It finds each garden by a flood fill (from a plot, walk to every
//    lawn plot sharing an edge with it), gives each new garden plot its piece and its paths, checks every piece still has its reason, and works out
//    what each plot needs to know of its neighbours to be drawn (which sides are water, where its paths run, a bridge, an island). Plots whose drawing
//    changed are rebuilt.
//  - A plot's garden is c.gd: { s: its seed, p: its piece, w: 1 when water, o: 1 for an open lawn kept for picnics, m: the sides its paths want to run
//    to (bit k for SIDES4[k]) } (saved with the city) plus gd.x, what it needs of its neighbours (worked out each time, not saved). gd is part of the
//    plot's recipe (recipe.js), so the plot worker draws it too.
//  - Paths are autotiled: each plot's path runs from the middle of each side it wants, to a hub near its middle. A path is drawn on a side only when
//    the plot on the other side wants it too (or the other side is a street: a gate; or the pond: a lookout or a bridge), so the paths always meet.
//    A new plot takes up every path pointing at it, so paths carry on across the garden as it grows.
//  - Every chance is rolled once, from the plot's own seed (made when the plot became lawn), so it lands the same way every time it is worked out.
//    Turning a plot to something else and back to lawn gives it a new seed: a new roll.
//  - Pieces never reshuffle: a piece stays until its plot goes or its reason does (a gazebo's pond shrinking, say).
'use strict';

/* ---------- palette B ---------- */
// (made when the script loads, in the same order in the page and the plot worker: matreg.js)
const GM = {
  stone: toon(0xe8dfcc), stone2: toon(0xd6cbb4), pebble: toon(0xbfb5a0), pebbleDark: toon(0x8f887a),
  wood: toon(0xb9774a), woodDark: toon(0x8a5434), roof: toon(0x9a5a36), verdigris: toon(0x5e9a86),
  leaf: toon(0x5aa83c), leaf2: toon(0x3d7f2a), leaf3: toon(0x7cc24f), trunk: toon(0x6a4a32), lip: toon(0x5f8f3e),
  coral: toon(0xff8f6b), cream: toon(0xfff1d6), iris: toon(0x8f6ad8), blossom: toon(0xffc2ae),
  water: toon(0x3fb5b9, { em: 0x0d3c44, kind: 'trim' }), bowl: toon(0x4cc6c9, { em: 0x0d3c44, kind: 'trim' }),
  pad: toon(0x4f9a3a), solar: toon(0x24363a, { em: 0x9ff0d0, kind: 'window' }),
  koi: toon(0xff8a3a, { em: 0x5a2206, kind: 'trim' }), koiW: toon(0xf6f0e6, { em: 0x3a3020, kind: 'trim' }),
  edge: toon(0x5a3e18, { em: 0xf2b14e, kind: 'trim' }),         // the soft copper-gold neon round the ponds and along the promenades
  bio: toon(0x2e6a52, { em: 0x5fe0b0, kind: 'trim' }),          // glowing moss and caps: teal-green, so the night garden isn't all warm
  fiber: toon(0x5a3e18, { em: 0xffd27a, kind: 'window' }),      // the fiber-optic strands in the arches' vines
  glass: toon(0x3d6a66, { em: 0x6a3a52, kind: 'window' }),      // greenhouse panes: grow lights behind them at night
  teal: toon(0x3f9a9a), gold: toon(0xd9963a), hammock: toon(0xf2e6cc),
  birch: toon(0xe2dccd), palmBark: toon(0x9a7a52),
};

/* ---------- the rules ---------- */
const GD_PIECES = ['lawn', 'grove', 'tree', 'shrubs', 'flowers', 'birdbath', 'arch', 'gazebo', 'greenhouse', 'koideck', 'misters', 'grotto', 'water'];
const GD_OFF = new Set(['gazebo', 'greenhouse', 'koideck', 'misters', 'grotto']);   // set off the paths: one path at most, a spur leading to it
const GD_SPREAD = .66, GD_SPRING = .4, GD_WATER_MAX = .4;
const gdTier = n => n >= 25 ? 5 : n >= 16 ? 4 : n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0;
const gardenOn = () => !(self.ECON && ECON.on);   // sandbox only: the economy mode keeps its plain lawns
const gdGround = c => !!c && !c.mega && !c.sections.length && !c.wall && c.green === 'grass';
const gdRoll = (gd, ...k) => mulberry32(hash('gd', gd.s, ...k))();
const gdAt = (c, a, b) => cells.get(ckey(c.i + a, c.j + b));
const gdBit = k => 1 << k, gdPop = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const GD_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// what of a garden plot changes how it is drawn (a plot still waiting for its garden draws as a plain lawn, whatever its seed)
const gdSig = gd => gd && gd.p ? JSON.stringify(gd) : '';
const gdKeep = gd => gd && gd.p ? [gd.p, gd.w | 0, gd.o | 0, gd.s, gd.m | 0].join() : '';
// a garden plot a new path may run into: not water, not a piece set off the paths, not an arch (its path is straight), not a picnic lawn that has its path already
const gdJoinable = n => !!n && !!n.gd && !!n.gd.p && !n.gd.w && !GD_OFF.has(n.gd.p) && n.gd.p !== 'arch' && !(n.gd.p === 'lawn' && gdPop(n.gd.m | 0) >= 1);
// a plot a gate can open onto: there, and not part of a megastructure
const gdStreet = n => !!n && !n.mega;

// every garden: plot -> { cells, n, wc (water plots), has: count of each piece, gates }
function gdComps(){
  const comp = new Map();
  for (const c of cells.values()){
    if (comp.has(c) || !c.gd) continue;
    const g = { cells: [c], n: 0, wc: 0, has: {}, gates: 0 }, st = [c]; comp.set(c, g);
    while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && !comp.has(n)){ comp.set(n, g); g.cells.push(n); st.push(n); } } }
    g.n = g.cells.length;
    for (const q of g.cells){ if (q.gd.w) g.wc++; if (q.gd.p) g.has[q.gd.p] = (g.has[q.gd.p] || 0) + 1;
      SIDES4.forEach(([a, b], k) => { if ((q.gd.m | 0) & gdBit(k)){ const n = gdAt(q, a, b); if (n && !n.gd && gdStreet(n)) g.gates++; } }); }
  }
  return comp;
}
// the pond a water plot is in (its water plots, by flood fill over water)
function gdPond(c){
  const seen = new Set([c]), st = [c];
  while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && n.gd.w && !seen.has(n)){ seen.add(n); st.push(n); } } }
  return seen;
}
// whether one of the grass plots round a pond holds a piece
function gdPondHas(pond, piece){
  for (const q of pond) for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && !n.gd.w && n.gd.p === piece) return true; }
  return false;
}
// the ponds beside a plot: [{ pond, n }]
function gdPondsBy(c){
  const out = [], seen = new Set();
  for (const [a, b] of SIDES4){ const n = gdAt(c, a, b); if (!n || !n.gd || !n.gd.w || seen.has(n)) continue;
    const pond = gdPond(n); for (const q of pond) seen.add(q); out.push({ pond, n: pond.size }); }
  return out;
}
function gdPickW(list, u){ const tot = list.reduce((s, [, w]) => s + w, 0); let r = u*tot; for (const [k, w] of list){ if ((r -= w) <= 0) return k; } return list[list.length - 1][0]; }

// A garden plot getting its piece and its paths (the moment it joins a garden of three or more). In order: does the pond beside it spread onto it (66%);
// does a garden of six or more with no water yet open its pond here (40%); then its paths and its piece.
function gdAssign(c, g, comp){
  const gd = c.gd, tier = gdTier(g.n), u = k => gdRoll(gd, k);
  // what is on each side: v nothing, o another kind of plot, p a garden plot still waiting, g garden grass, w the pond
  const S = SIDES4.map(([a, b]) => { const n = gdAt(c, a, b);
    if (!n) return { t: 'v' }; if (comp.get(n) !== g) return { t: 'o', n }; return { t: !n.gd.p ? 'p' : n.gd.w ? 'w' : 'g', n }; });
  const wet = S.filter(s => s.t === 'w');
  if (wet.length && g.wc + 1 <= GD_WATER_MAX*g.n && u('spread') < GD_SPREAD){ gd.w = 1; gd.p = 'water'; gd.o = 0; gd.m = 0; g.wc++; return; }
  if (g.n >= 6 && !g.wc && u('spring') < GD_SPRING){ gd.w = 1; gd.p = 'water'; gd.o = 0; gd.m = 0; g.wc++; return; }
  // the paths that run into this plot are taken up
  let m = 0;
  S.forEach((s, k) => { if (s.t === 'g' && ((s.n.gd.m | 0) & gdBit(k ^ 1))) m |= gdBit(k); });
  // and one waiting across a narrow channel of water (the bridge will join them)
  S.forEach((s, k) => { if (s.t !== 'w') return; const [a, b] = SIDES4[k], far = gdAt(c, 2*a, 2*b);
    if (far && comp.get(far) === g && far.gd.p && !far.gd.w && ((far.gd.m | 0) & gdBit(k ^ 1)) && u('cross' + k) < .9) m |= gdBit(k); });
  const mand = m;
  // a bigger piece set off the paths: only where at most one path comes in (it becomes the spur leading to it)
  const ponds = gdPondsBy(c), big = ponds.reduce((q, p) => Math.max(q, p.n), 0), off = [];
  if (tier >= 3 && ponds.some(p => p.n >= 4 && !gdPondHas(p.pond, 'gazebo'))) off.push(['gazebo', 4]);
  if (tier >= 4){
    if ((g.has.greenhouse || 0) < Math.floor(g.n/16)) off.push(['greenhouse', 1.2]);
    if (wet.length) off.push(['misters', 1]);
    if (ponds.some(p => p.n >= 6 && !gdPondHas(p.pond, 'koideck'))) off.push(['koideck', 3]);
  }
  if (tier >= 5 && big >= 6 && !g.has.grotto && u('grotto') < .2) off.push(['grotto', 3]);
  const pathy = [0, 1, 2, 3].filter(k => S[k].t === 'g' && (S[k].n.gd.m | 0) && gdJoinable(S[k].n));
  const link = k => { m |= gdBit(k); if (S[k].t === 'g') S[k].n.gd.m = (S[k].n.gd.m | 0) | gdBit(k ^ 1); };
  if (off.length && gdPop(mand) <= 1 && u('struct') < .45){
    const p = gdPickW(off, u('off'));
    if (!m && pathy.length && u('spur') < .6) link(pathy[Math.floor(u('spurk')*pathy.length)]);
    gd.p = p; gd.o = 0; gd.m = m; g.has[p] = (g.has[p] || 0) + 1; return;
  }
  // a path plot, or a stretch of green: joins a path next door (most of the time), else may start one
  if (!m && pathy.length && u('join') < .92) link(pathy[Math.floor(u('joink')*pathy.length)]);
  const canGo = k => S[k].t === 'v' || S[k].t === 'p' || S[k].t === 'w' || (S[k].t === 'g' && gdJoinable(S[k].n));
  if (!m && !pathy.length && u('start') < (g.cells.some(q => q.gd.m) ? .5 : .85)){ const ks = [0, 1, 2, 3].filter(k => canGo(k) && S[k].t !== 'w'); if (ks.length) link(ks[Math.floor(u('startk')*ks.length)]); }
  if (m){
    // carry on: straight ahead most of the time (the promenades), else turn; now and then a branch
    if (gdPop(m) === 1){ const k0 = [0, 1, 2, 3].find(k => m & gdBit(k)), st = k0 ^ 1;
      if (canGo(st) && u('straight') < .8) link(st);
      else if (u('turn') < .8){ const pp = (k0 < 2 ? [2, 3] : [0, 1]).filter(canGo); if (pp.length) link(pp[Math.floor(u('turnk')*pp.length)]); } }
    if (u('branch') < .5){ const fr = [0, 1, 2, 3].filter(k => !(m & gdBit(k)) && canGo(k) && S[k].t !== 'w'); if (fr.length) link(fr[Math.floor(u('branchk')*fr.length)]); }
    // gates onto the streets round the garden: a few for each garden, more as it grows
    S.forEach((s, k) => { if (s.t === 'o' && gdStreet(s.n) && g.gates < 1 + Math.floor(g.n/10) && u('gate' + k) < .7){ m |= gdBit(k); g.gates++; } });
  }
  const deg = gdPop(m), L = [];
  if (deg <= 1) L.push(['lawn', 3]);
  L.push(['grove', deg ? 3 : 4.5], ['flowers', 2]);
  if (tier >= 2 && deg >= 2 && (g.has.birdbath || 0) < 1 + Math.floor(g.n/14)) L.push(['birdbath', 1.2]);
  if (tier >= 3 && (m === 3 || m === 12)) L.push(['arch', 1.5]);
  const p = gdPickW(L, u('piece'));
  gd.p = p; gd.o = p === 'lawn' ? 1 : 0; gd.m = m; g.has[p] = (g.has[p] || 0) + 1;
}
// Does a piece set off the paths still have its reason? (one that lost it goes back to a plain grove of trees)
function gdValid(c){
  switch (c.gd.p){
    case 'misters': return SIDES4.some(([a, b]) => { const n = gdAt(c, a, b); return n && n.gd && n.gd.w; });
    case 'gazebo': return gdPondsBy(c).some(p => p.n >= 4);
    case 'koideck': case 'grotto': return gdPondsBy(c).some(p => p.n >= 6);
  }
  return true;
}

// The pass itself: returns the plots to build again.
function gardenUpdate(){
  const before = new Map(), keep = new Map();
  for (const c of cells.values()) if (c.gd){ before.set(c, gdSig(c.gd)); keep.set(c, gdKeep(c.gd)); }
  const changed = [];
  if (!gardenOn()){ for (const c of before.keys()){ c.gd = null; if (before.get(c)) changed.push(c); } return changed; }
  // a plot that's no longer an empty lawn has no garden; a new lawn plot gets its seed (and waits for a garden)
  for (const c of cells.values()){
    if (c.gd && !gdGround(c)) c.gd = null;
    else if (!c.gd && gdGround(c)) c.gd = { s: (Math.random()*2147483647) | 0, p: null };
  }
  let comp = gdComps();
  // out of the gardens: a plot whose garden is under three. Joined to a garden only by a corner, it keeps (or gets) a tree or shrubs; otherwise
  // it goes back to waiting, its pond, paths and piece gone.
  const diag = c => GD_CORNERS.some(([a, b]) => { const n = gdAt(c, a, b); return n && n.gd && comp.get(n) !== comp.get(c) && comp.get(n).n >= 3; });
  for (const c of cells.values()){
    if (!c.gd || comp.get(c).n >= 3) continue;
    const gd = c.gd; gd.w = 0; gd.o = 0; gd.m = 0;
    if (diag(c)){ if (gd.p !== 'tree' && gd.p !== 'shrubs') gd.p = gdRoll(gd, 'small') < .55 ? 'tree' : 'shrubs'; }
    else gd.p = null;
  }
  comp = gdComps();
  // new garden plots get their pieces, one at a time (each sees what the ones before it made)
  const fresh = [...cells.values()].filter(c => c.gd && !c.gd.p && comp.get(c).n >= 3).sort((p, q) => p.i - q.i || p.j - q.j);
  let assigned = false;
  for (const c of fresh){ gdAssign(c, comp.get(c), comp); assigned = true; }
  // every piece set off the paths checked for its reason (pond sizes are as they now stand)
  for (const c of cells.values()){
    if (!c.gd || !c.gd.p || c.gd.w || comp.get(c).n < 3) continue;
    if (!gdValid(c)){ c.gd.p = 'grove'; c.gd.o = 0; }
  }
  // what each plot needs of its neighbours to be drawn: the water first (its bridges depend on the paths beside it), then the grass
  const pondN = new Map(), info = new Map();
  const nbAt = (c, k) => { const [a, b] = SIDES4[k], n = gdAt(c, a, b); return n && comp.get(n) === comp.get(c) && n.gd.p ? n : null; };
  for (const c of cells.values()){
    const gd = c.gd; if (!gd || !gd.p){ if (gd) delete gd.x; continue; }
    const g = comp.get(c), x = { t: gdTier(g.n) };
    x.e = [0, 1, 2, 3].map(k => { const n = nbAt(c, k); return n ? (n.gd.w ? 2 : 1) : 0; });
    if (g.n < 3) x.dg = 1;
    info.set(c, x);
    if (!gd.w) continue;
    if (!pondN.has(c)){ const pond = gdPond(c); for (const q of pond) pondN.set(q, pond.size); }
    x.pd = pondN.get(c);
    x.cw = GD_CORNERS.map(([a, b]) => { const n = gdAt(c, a, b); return x.e[a > 0 ? 0 : 1] === 2 && x.e[b > 0 ? 2 : 3] === 2 && !(n && n.gd && n.gd.w) ? 1 : 0; });
    // a bridge: water one plot wide, with a path on each bank pointing at it
    const wants = k => { const n = nbAt(c, k); return !!n && !n.gd.w && !!((n.gd.m | 0) & gdBit(k ^ 1)); };
    if (x.e[0] === 1 && x.e[1] === 1 && x.e[2] !== 1 && x.e[3] !== 1 && wants(0) && wants(1)) x.br = 1;
    else if (x.e[2] === 1 && x.e[3] === 1 && x.e[0] !== 1 && x.e[1] !== 1 && wants(2) && wants(3)) x.br = 2;
  }
  for (const c of cells.values()){
    const gd = c.gd, x = info.get(c); if (!x){ continue; }
    if (!gd.w){
      x.pd = gdPondsBy(c).reduce((m, p) => Math.max(m, p.n), 0);
      x.wet = x.e.map(v => v === 2 ? 1 : 0);
      if (x.t >= 4 && x.e.every(v => v === 2)) x.isl = 1;   // ringed by water: an island gazebo stands on it (its own piece comes back if the ring breaks)
      // where its paths are drawn: 1 to a garden path, 2 a gate onto the street, 3 a lookout at the pond's edge, 4 onto a bridge
      x.pa = [0, 1, 2, 3].map(k => { if (!((gd.m | 0) & gdBit(k))) return 0; const [a, b] = SIDES4[k], n = gdAt(c, a, b);
        if (!n) return 0;
        if (comp.get(n) !== comp.get(c)) return n.gd ? 0 : gdStreet(n) ? 2 : 0;
        if (!n.gd.p) return 0;
        if (n.gd.w){ const nx = info.get(n); return nx && nx.br === (k < 2 ? 1 : 2) ? 4 : 3; }
        return ((n.gd.m | 0) & gdBit(k ^ 1)) ? 1 : 0; });
      // an arch stands over a straight path: if the path is no longer straight, it goes (a grove grows there instead)
      if (gd.p === 'arch'){ const on = x.pa.map(v => v ? 1 : 0).join(''); if (on !== '1100' && on !== '0011'){ gd.p = 'grove'; } }
    }
    gd.x = x;
  }
  for (const c of cells.values()){
    if (gdSig(c.gd) !== (before.get(c) || '')) changed.push(c);
    if (gdKeep(c.gd) !== (keep.get(c) || '')) assigned = true;
  }
  // (a piece rolled or changed is saved with the city, so a reload shows the same garden)
  if (assigned && !self.IN_RECIPE_WORKER && typeof save === 'function') setTimeout(() => { try { save(); } catch (e) {} }, 0);
  return changed;
}
// saving: [piece, water, open, seed, paths] or 0
const gdSave = c => c.gd && c.gd.p ? [c.gd.p, c.gd.w | 0, c.gd.o | 0, c.gd.s, c.gd.m | 0] : 0;
function gdLoad(c, v){
  if (!Array.isArray(v) || c.green !== 'grass') return;
  const p = GD_PIECES.includes(v[0]) ? v[0] : 'grove';   // (a piece from before the paths: a grove in its place)
  c.gd = { s: v[3] | 0, p, w: v[1] ? 1 : 0, o: v[2] ? 1 : 0, m: (v[4] | 0) & 15 };
  if (c.gd.p === 'water' && !c.gd.w) c.gd.p = 'lawn';
  if (c.gd.w){ c.gd.p = 'water'; c.gd.m = 0; }
}

/* ---------- trees: real trunks and limbs, sprite crowns ---------- */
// The crown is a tree-top sprite (spritegen_trees.js) drawn as four copies crossed round its middle, so from whichever way the camera turns it reads
// full. Its sway phase is picked so it never thins out when zoomed out (the plant shader drops a share of the plants far out: a tree losing its crown
// would leave a bare trunk). Kept generic so other builders can plant trees too (the luxury streets, later).
function canopy(kind, P, x, y, z, k = 1, n = 4){
  if (NO_GREEN || !FOL_LIST[kind]) return;
  const s = SPR.size[kind], scale = new THREE.Matrix4().makeScale(s[0]/PX*k, s[1]/PX*k, 1);
  const yaw = rnd(0, PI), shade = rnd(.9, 1.04), ph = (irand(0, 30) + rnd(.56, .96))/5.17;   // (fract(ph*5.17) over .55: see vFade in the plant shader)
  for (let q = 0; q < n; q++) FOL_LIST[kind].push({ m: under(P, T(x, y, z, yaw + q*PI/n)).multiply(scale), an: SPR.anchor[kind], flip: q % 2 ? -1 : 1, shade: shade*(q % 2 ? .95 : 1), phase: ph, fixed: 1 });
}
// the kinds of tree: the crown sprite, trunk height and crown scale ranges, limbs (each with a smaller crown of its own), bark
const TREE_SP = {
  round:    { k: 'tc_round', h: [1.0, 1.3], ck: [.85, 1.0], limbs: [1, 3], sub: 'tc_puff' },
  oval:     { k: 'tc_oval', h: [.8, 1.0], ck: [.85, 1.0], limbs: [0, 1], sub: 'tc_puff' },
  willow:   { k: 'tc_willow', h: [1.15, 1.35], ck: [.9, 1.05], limbs: [0, 1], sub: 'tc_puff', low: 1 },
  pine:     { k: 'tc_pine', h: [.35, .5], ck: [.95, 1.15], limbs: [0, 0], straight: 1 },
  cypress:  { k: 'tc_cypress', h: [.25, .35], ck: [.9, 1.1], limbs: [0, 0], straight: 1 },
  blossom:  { k: 'tc_blossom', h: [.9, 1.15], ck: [.8, .95], limbs: [1, 2] },
  maple:    { k: 'tc_maple', h: [.95, 1.2], ck: [.85, 1.0], limbs: [1, 2] },
  palm:     { k: 'tc_palm', h: [1.7, 2.1], ck: [.85, 1.0], palm: 1 },
  airy:     { k: 'tc_airy', h: [1.0, 1.3], ck: [.85, 1.0], limbs: [1, 2], bark: 'birch' },
  wisteria: { k: 'tc_wisteria', h: [.95, 1.15], ck: [.85, 1.0], limbs: [1, 2], low: 1 },
};
const GD_TREES = [['round', 3], ['oval', 2], ['airy', 1.4], ['blossom', 1.2], ['maple', 1], ['willow', 1], ['pine', .8], ['wisteria', .7], ['cypress', .6], ['palm', .5]];
const gdSpecies = () => gdPickW(GD_TREES, R());
function treeAt(P, x, z, s = 1, sp = 'round'){
  const D = TREE_SP[sp] || TREE_SP.round, h = rnd(D.h[0], D.h[1])*s, ck = rnd(D.ck[0], D.ck[1])*s, ch = SPR.size[D.k][1]/PX*ck;
  const bark = D.bark === 'birch' ? GM.birch : D.palm ? GM.palmBark : GM.trunk;
  const lean = rnd(0, TAU), ca = Math.cos(lean), sa = Math.sin(lean);
  if (D.palm){   // a slim trunk curving up and over in five pieces, the fronds at its top
    let px = x, py = .05, pz = z;
    for (let q = 1; q <= 5; q++){ const t = q/5, nx = x + ca*.35*s*t*t, nz = z + sa*.35*s*t*t, ny = .05 + h*t; strut(bark, P, px, py, pz, nx, ny, nz, .085*s*(1 - t*.3)); px = nx; py = ny; pz = nz; }
    canopy(D.k, P, px, py + ch*.12, pz, ck); return;
  }
  const lv = D.straight ? 0 : rnd(.04, .12)*s, mx = x + ca*lv*.4, mz = z + sa*lv*.4, tx = x + ca*lv, tz = z + sa*lv;
  strut(bark, P, x, .05, z, mx, h*.55, mz, .14*s); strut(bark, P, mx, h*.55, mz, tx, h, tz, .1*s);
  for (let q = 0; q < 3; q++){ const a = lean + q*TAU/3 + rnd(-.3, .3); strut(bark, P, x, .14*s, z, x + Math.cos(a)*.17*s, .05, z + Math.sin(a)*.17*s, .06*s); }   // root flare
  canopy(D.k, P, tx, h + ch*(D.low ? .18 : D.straight ? .45 : .3), tz, ck);
  const nl = D.limbs ? irand(D.limbs[0], D.limbs[1]) : 0;
  for (let q = 0; q < nl; q++){
    const a = lean + (q + 1)*TAU/(nl + 1) + rnd(-.4, .4), r = rnd(.32, .5)*s*(D.fan ? 1.35 : 1), ly = h*rnd(.55, .8), ey = h*rnd(.85, 1.02);
    const ex = tx + Math.cos(a)*r, ez = tz + Math.sin(a)*r, sub = D.sub || D.k, sk = ck*rnd(.5, .62);
    strut(bark, P, x + (tx - x)*ly/h, ly, z + (tz - z)*ly/h, ex, ey, ez, .065*s);
    canopy(sub, P, ex, ey + SPR.size[sub][1]/PX*sk*.25, ez, sk);
  }
}

/* ---------- drawing ---------- */
// A garden plot, drawn in its own frame P (the plot's middle, the lawn at y about .06). Everything here comes from c.gd (and gd.x), never from
// the plots around: the plot worker draws it from the recipe alone. People walk wherever nothing stands between ankle and head height
// (people.js), so: paths, decks, bridge planks and landings are kept under .14 (walked on); rims, rails, posts, planters and trunks stand in the band
// (walked round).
const GD_PW = .84;   // path width
// a piece set off the paths: where it stands, and how far out its spur stops (from the side it comes in by)
function gdOffSpot(gd, x){
  const k = x.wet ? x.wet.indexOf(1) : -1, [a, b] = k >= 0 ? SIDES4[k] : [0, 0];
  switch (gd.p){
    case 'gazebo': return { x: a*.45, z: b*.45, r: 1.12 };
    case 'koideck': return { x: a*.85, z: b*.85, r: .1 };
    case 'misters': return { x: a*1.0, z: b*1.0, r: .95 };
    case 'greenhouse': return { x: 0, z: 0, r: 1.55 };
    case 'grotto': return { x: 0, z: 0, r: 1.45 };
  }
  return { x: 0, z: 0, r: 1.1 };
}
function gardenTile(c, P){
  const gd = c.gd, x = gd.x || { e: [0, 0, 0, 0], t: 1 };
  R = mulberry32(hash('garden', c.i, c.j, gd.s));
  if (gd.w){ gdWater(P, gd, x); return; }
  lawn(P, 4);
  const pa = x.pa || [0, 0, 0, 0], ks = [0, 1, 2, 3].filter(k => pa[k]), off = GD_OFF.has(gd.p) && !x.isl;
  const pts = [], taken = [], wd = GD_PW;
  const pathD = (px, pz) => { let d = 9; for (const [qx, qz] of pts){ const e = Math.hypot(px - qx, pz - qz); if (e < d) d = e; } return d - wd/2; };
  const free = (r, x0 = 1.55) => { for (let t = 0; t < 50; t++){ const px = rnd(-x0, x0), pz = rnd(-x0, x0);
    if (pathD(px, pz) > r + .06 && taken.every(([tx, tz, tr]) => Math.hypot(px - tx, pz - tz) > tr + r)){ taken.push([px, pz, r]); return [px, pz]; } } return null; };
  // ---- the paths ----
  const straight = ks.length === 2 && (ks[0] ^ 1) === ks[1];
  let hx = 0, hz = 0, promenade = false;
  if (straight){ if (gd.p !== 'arch' && chance(.5)){ const lat = pick([-1, 1])*rnd(.25, .42); if (ks[0] < 2) hz = lat; else hx = lat; } else promenade = true; }
  else if (ks.length){ hx = rnd(-.2, .2); hz = rnd(-.2, .2); }
  const os = off ? gdOffSpot(gd, x) : x.isl ? { x: 0, z: 0, r: 1.15 } : null;
  for (const k of ks){
    const [a, b] = SIDES4[k], ex = a*LOT/2, ez = b*LOT/2;
    let end = [hx, hz], cx = a*.95, cz = b*.95;
    if (os){ const dx = ex - os.x, dz = ez - os.z, d = Math.hypot(dx, dz) || 1; end = [os.x + dx/d*os.r, os.z + dz/d*os.r]; cx = (ex + end[0])/2; cz = (ez + end[1])/2; }
    gdPathArm(P, ex, ez, cx, cz, end[0], end[1], wd, promenade, pts);
    if (pa[k] === 2) gdGate(P, a, b, wd);
    if (pa[k] === 3){ const E = under(P, T(ex, 0, ez, Math.atan2(a, b)));   // a lookout at the pond's edge: a round landing, often a bench facing the water
      put(U.cyl16, GM.stone, under(E, T(0, .063, -.55, 0, 1.0, .012, .8))); taken.push([a*1.35, b*1.35, .5]);
      if (chance(.7)){ gdBench(E, 0, -.78, 0, []); taken.push([a*1.1, b*1.1, .4]); } }
  }
  if (ks.length && !os){ put(U.cyl16, GM.stone, under(P, T(hx, .064, hz, 0, wd*1.3, .012, wd*1.3))); pts.push([hx, hz]); }
  // ---- what stands along the paths: a lantern or two, now and then a bench facing the path ----
  const armPt = (k, t) => { const [a, b] = SIDES4[k]; return [a*LOT/2*(1 - t) + hx*t, b*LOT/2*(1 - t) + hz*t]; };
  if (ks.length && !os){
    const nl = 1 + (ks.length >= 3 || chance(.3) ? 1 : 0);
    for (let q = 0; q < nl; q++){ const k = ks[(q + irand(0, 3)) % ks.length], [ax, az] = armPt(k, rnd(.3, .55)), [a, b] = SIDES4[k], s = pick([-1, 1]);
      const lx = ax + (b ? s : 0)*(wd/2 + .22), lz = az + (a ? s : 0)*(wd/2 + .22);
      if (taken.every(([tx, tz, tr]) => Math.hypot(lx - tx, lz - tz) > tr + .15)){ gdLamp(P, lx, lz, rnd(.9, 1.05), []); taken.push([lx, lz, .15]); } }
    if (gd.p !== 'lawn' && chance(.55)){ const k = pick(ks), [ax, az] = armPt(k, rnd(.25, .6)), [a, b] = SIDES4[k], s = pick([-1, 1]);
      const bx = ax + (b ? s : 0)*(wd/2 + .4), bz = az + (a ? s : 0)*(wd/2 + .4);
      if (taken.every(([tx, tz, tr]) => Math.hypot(bx - tx, bz - tz) > tr + .4)){ gdBench(P, bx, bz, Math.atan2(ax - bx, az - bz), []); taken.push([bx, bz, .42]); } }
  }
  // ---- the piece ----
  if (x.isl){ gdGazebo(P, 0, 0, taken, true); }
  else switch (gd.p){
    case 'tree': { const sp = free(.5, .6); if (sp) treeAt(P, sp[0], sp[1], rnd(.9, 1.1), gdSpecies()); break; }
    case 'shrubs': { const sp = free(.4, .6); if (sp) treeAt(P, sp[0], sp[1], rnd(.7, .85), pick(['round', 'oval', 'airy'])); for (let k = 0; k < 4; k++){ const q = free(.22); if (q) plant(pick(['bush', 'bushFlower', 'fern', 'g_fern2']), P, q[0], .06, q[1], rnd(.6, .85)); } break; }
    case 'grove': { const lead = gdSpecies(), n = ks.length ? irand(2, 3) : irand(3, 5);
      for (let k = 0; k < n; k++){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.15), chance(.65) ? lead : gdSpecies()); }
      for (let k = 0; k < 3; k++){ const q = free(.22); if (q) plant(pick(['bush', 'fern', 'g_fern2', 'bushFlower']), P, q[0], .06, q[1], rnd(.6, .8)); }
      gdBio(P, 2, free); break; }
    case 'flowers': { for (let k = 0; k < irand(2, 3); k++){ const q = free(.55); if (q) gdBed(P, q[0], q[1], rnd(.5, .75)); }
      if (chance(.5)){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.8, 1), pick(['blossom', 'wisteria', 'round', 'maple'])); } gdBio(P, 2, free); break; }
    case 'lawn': { for (const q of lawnSpots(c, P)) taken.push(q);
      if (chance(.6)){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.9, 1.15), gdSpecies()); } if (chance(.5)) gdBio(P, 2, free); break; }
    case 'birdbath': { const plaza = ks.length >= 2, at = plaza ? [hx, hz] : free(.7) || [0, 0];
      if (plaza) put(U.cyl16, GM.stone2, under(P, T(at[0], .062, at[1], 0, 1.9, .01, 1.9)));
      gdBirdbath(P, at[0], at[1]); taken.push([at[0], at[1], plaza ? .95 : .7]);
      const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.05), gdSpecies()); break; }
    case 'arch': gdArch(P, ks[0] >= 2, taken); { const sp = free(.5); if (sp) treeAt(P, sp[0], sp[1], rnd(.8, 1), pick(['round', 'blossom', 'oval'])); } break;
    case 'gazebo': gdGazebo(P, os.x, os.z, taken, false); break;
    case 'greenhouse': gdGreenhouse(P, taken, ks.length ? ks[0] : -1); break;
    case 'koideck': gdKoiDeck(P, x, taken); break;
    case 'misters': gdMisters(P, x, taken); break;
    case 'grotto': gdGrotto(P, x, taken, ks.length ? ks[0] : -1); break;
  }
  if (off && chance(.6)){ const sp = free(.5); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.05), gdSpecies()); }
  // edge dressing: reeds and flowers along a side that meets the water (clear of the paths)
  if (x.wet) x.wet.forEach((w, k) => { if (!w) return; const [a, b] = SIDES4[k], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
    for (let t = -1.6; t <= 1.6; t += .55){ const tt = t + rnd(-.15, .15), dd = rnd(.2, .35), wx = a*(LOT/2 - dd) + (b ? tt*b : 0), wz = b*(LOT/2 - dd) - (a ? tt*a : 0);
      if (chance(.6) && pathD(wx, wz) > .15) plant(chance(.5) ? 'g_fern3' : 'bushFlower', E, tt, .06, -dd, rnd(.55, .75)); } });
  // the lawn: the same short grass as any lawn, clear of the paths and what stands on it
  const n = 20, st = LOT/n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    const gx = -LOT/2 + (i + .5 + rnd(-.2, .2))*st, gz = -LOT/2 + (j + .5 + rnd(-.2, .2))*st;
    if (pathD(gx, gz) < .08 || taken.some(([cx, cz, r]) => (gx - cx)**2 + (gz - cz)**2 < r*r*.7)) continue;
    plant('gt0', P, gx, .06, gz, rnd(.24, .28));
  }
}
// one arm of a plot's paths: from the middle of a side (square on to it, so it meets the next plot's path) curving in to (hx, hz); cream paving slabs
// with pebble kerbs, or a soft gold line along a straight promenade. Its middle line goes into pts (what keeps the grass and pieces off it).
function gdPathArm(P, ex, ez, cx, cz, hx, hz, wd, promenade, pts){
  const n = 10, Q = []; for (let k = 0; k <= n; k++){ const t = k/n, u = 1 - t; Q.push([u*u*ex + 2*u*t*cx + t*t*hx, u*u*ez + 2*u*t*cz + t*t*hz]); }
  for (let k = 0; k < n; k++){
    const [ax, az] = Q[k], [bx, bz] = Q[k + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || .01, ry = Math.atan2(dx, dz), mx = (ax + bx)/2, mz = (az + bz)/2, nx = dz/len, nz = -dx/len;
    box(k % 3 === 1 ? GM.stone2 : GM.stone, P, mx, .064, mz, wd, .012, len + .03, ry);
    for (const s of [-1, 1]) box(promenade ? GM.edge : GM.pebble, P, mx + nx*s*(wd/2 + .02), .068, mz + nz*s*(wd/2 + .02), promenade ? .025 : .05, promenade ? .012 : .02, len + .03, ry);
  }
  for (const q of Q) pts.push(q);
}
// a gate where a path meets the street: two cream pillars, a lantern on each
function gdGate(P, a, b, wd){
  const E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  for (const s of [-1, 1]){ const gx = s*(wd/2 + .18);
    cyl(GM.stone2, E, gx, .4, -.14, .08, .8); box(GM.stone, E, gx, .82, -.14, .2, .05, .2);
    KEEP_LIGHT = true; box(M.bulb, E, gx, .9, -.14, .08, .09, .08); glow(E, gx, .9, -.14, 'warm', 1.3); KEEP_LIGHT = false;
    put(U.cone, GM.roof, under(E, T(gx, .99, -.14, 0, .18, .09, .18))); }
}
// a bench of copper wood on cream stone legs, facing ry (two seats)
function gdBench(P, x, z, ry, clear){
  const Pb = under(P, T(x, .05, z, ry));
  box(GM.wood, Pb, 0, .14, 0, .56, .04, .16); box(GM.wood, Pb, 0, .27, -.07, .56, .14, .03);
  for (const sx of [-.23, .23]) box(GM.stone, Pb, sx, .07, 0, .05, .14, .15);
  for (const sx of [-.13, .13]) spotAt(Pb, sx, .16, 0, 'seat', null, [0, 1]);
  clear.push([x, z, .42]);
}
// a garden lantern: a cream post, a copper cap, a warm light
function gdLamp(P, x, z, h, clear){
  cyl(GM.stone, P, x, .06, z, .07, .08); cyl(GM.stone2, P, x, h/2, z, .03, h);
  KEEP_LIGHT = true; box(M.bulb, P, x, h + .07, z, .1, .11, .1); glow(P, x, h + .07, z, 'warm', 1.7); KEEP_LIGHT = false;
  put(U.cone, GM.roof, under(P, T(x, h + .18, z, 0, .2, .1, .2)));
  clear.push([x, z, .12]);
}
// a flower bed: a low stone kerb round iris, coral and cream flowers
function gdBed(P, bx, bz, w){
  for (let q = 0; q < 10; q++){ const t = q*TAU/10; box(GM.stone2, P, bx + Math.cos(t)*w*.5, .08, bz + Math.sin(t)*w*.4, .14, .05, .06, -t); }
  for (let q = 0; q < 7; q++){ const fx = bx + rnd(-.4, .4)*w, fz = bz + rnd(-.3, .3)*w;
    cyl(GM.leaf2, P, fx, .12, fz, .015, .12); blob(pick([GM.coral, GM.coral, GM.cream, GM.iris]), P, fx, .2 + rnd(0, .08), fz, rnd(.05, .08)); }
  plant(pick(['bushFlower', 'g_flowers']), P, bx, .06, bz, rnd(.6, .8));
}
// glowing caps and moss, a few at the foot of things: teal-green at night
function gdBio(P, n, free){
  for (let k = 0; k < n; k++){ const q = free ? free(.15) : [rnd(-1.5, 1.5), rnd(-1.5, 1.5)]; if (!q) continue; const [x, z] = q;
    for (let p = 0; p < 3; p++){ const ox = x + rnd(-.1, .1), oz = z + rnd(-.1, .1); cyl(GM.stone2, P, ox, .09, oz, .008, .06); sph(GM.bio, P, ox, .13, oz, rnd(.025, .04), .6); } }
}
// a birdbath at (x, z): a stone pedestal and bowl, a ring of coral, teal and gold mosaic round its rim, water in the bowl; flowers round its foot
function gdBirdbath(P, x, z){
  put(U.cyl16, GM.stone2, under(P, T(x, .08, z, 0, .5, .08, .5)));
  cyl(GM.stone, P, x, .35, z, .09, .5); put(U.cyl16, GM.stone, under(P, T(x, .62, z, 0, .62, .08, .62)));
  put(U.cyl16, GM.bowl, under(P, T(x, .665, z, 0, .5, .01, .5)));
  const tiles = [GM.coral, GM.teal, GM.gold, GM.cream];
  for (let k = 0; k < 16; k++){ const a = k*TAU/16; box(tiles[k % 4], P, x + Math.cos(a)*.29, .665, z + Math.sin(a)*.29, .07, .02, .04, -a); }
  for (let k = 0; k < 4; k++) box(tiles[(k + 1) % 4], P, x + (k % 2 ? .092 : 0)*(k > 1 ? -1 : 1), .3, z + (k % 2 ? 0 : .092)*(k > 1 ? -1 : 1), .04, .12, .04, k*PI/2);
  for (let k = 0; k < 6; k++){ const a = k*TAU/6 + rnd(-.2, .2), r = rnd(.42, .5); blob(pick([GM.coral, GM.cream, GM.iris]), P, x + Math.cos(a)*r, .14, z + Math.sin(a)*r, rnd(.06, .09)); }
  KEEP_LIGHT = true; glow(P, x, .7, z, 'warm', .8); KEEP_LIGHT = false;
}
// a vine-covered arch walkway over a straight path: four arches, fiber-optic strands glowing in the vines and blossom
function gdArch(P, alongZ, taken){
  const F = under(P, T(0, 0, 0, alongZ ? 0 : PI/2)), hw = GD_PW/2 + .14, top = 1.35;
  for (const t of [-1.35, -.45, .45, 1.35]){
    for (const s of [-1, 1]) cyl(GM.woodDark, F, s*hw, top*.4, t, .03, top*.8);
    const pts = []; for (let k = 0; k <= 6; k++){ const a = PI - k*PI/6; pts.push([Math.cos(a)*hw, top*.8 + Math.sin(a)*.38]); }
    for (let k = 0; k < 6; k++) strut(GM.woodDark, F, pts[k][0], pts[k][1], t, pts[k + 1][0], pts[k + 1][1], t, .045);
    for (let k = 0; k <= 6; k++){ blob(pick([GM.leaf, GM.leaf2, GM.leaf3]), F, pts[k][0], pts[k][1] + .04, t + rnd(-.12, .12), rnd(.12, .18), .8);
      if (chance(.45)) blob(pick([GM.blossom, GM.coral, GM.cream]), F, pts[k][0] + rnd(-.08, .08), pts[k][1] + rnd(-.04, .08), t + rnd(-.1, .1), rnd(.05, .07));
      if (k % 2) box(GM.fiber, F, pts[k][0], pts[k][1] - .06, t + rnd(-.08, .08), .02, .02, .02); }
    for (const s of [-1, 1]) if (chance(.6)) plant(pick(['pothos', 'vines']), F, s*hw*.85, top*.9, t, rnd(.55, .75), 't', true);
  }
  for (const t of [-.9, .9]) glow(F, 0, top*1.05, t, 'warm', 1.1);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++){ const px = s*rnd(.75, .95), pz = rnd(-1.5, 1.5); plant(pick(['bushFlower', 'g_fern3', 'bush']), F, px, .06, pz, rnd(.55, .75)); }
  for (const s of [-1, 1]) for (const t of [-1.35, -.45, .45, 1.35]) taken.push(alongZ ? [s*hw, t, .12] : [t, -s*hw, .12]);
}
// a gazebo: a round stone floor, six cream posts, low copper rails with two ways in, a copper roof with a verdigris band, a lantern hanging inside,
// a ring of seats (island: the same, on a plot ringed by water)
function gdGazebo(P, x, z, clear, island){
  const r = .85, ry = rnd(0, PI/3);
  put(U.cyl16, GM.stone, under(P, T(x, .06, z, 0, 2*r + .25, .08, 2*r + .25)));
  put(U.cyl16, GM.edge, under(P, T(x, .055, z, 0, 2*r + .32, .02, 2*r + .32)));
  const post = k => { const a = ry + k*TAU/6; return [x + Math.cos(a)*r, z + Math.sin(a)*r]; };
  for (let k = 0; k < 6; k++){ const [px, pz] = post(k); cyl(GM.cream, P, px, .78, pz, .04, 1.4); }
  for (let k = 0; k < 6; k++){ if (k === 0 || k === 3) continue;   // two ways in, across from each other
    const [ax, az] = post(k), [bx, bz] = post(k + 1);
    strut(GM.wood, P, ax, .34, az, bx, .34, bz, .035); strut(GM.wood, P, ax, .14, az, bx, .14, bz, .03);
    const mx = (ax + bx)/2, mz = (az + bz)/2, ix = x + (mx - x)*.82, iz = z + (mz - z)*.82;
    box(GM.wood, P, ix, .14, iz, .5, .04, .16, -Math.atan2(mz - z, mx - x) + PI/2);
    spotAt(P, ix, .16, iz, 'seat', null, [x - ix, z - iz]);
  }
  put(U.cone, GM.roof, under(P, T(x, 1.75, z, ry, 2*r + .55, .7, 2*r + .55)));
  put(U.cyl16, GM.verdigris, under(P, T(x, 1.47, z, 0, 2*r + .5, .08, 2*r + .5)));
  sph(GM.gold, P, x, 2.15, z, .06);
  KEEP_LIGHT = true; box(M.bulb, P, x, 1.2, z, .12, .14, .12); glow(P, x, 1.2, z, 'warm', 2.4); glow(P, x, 2.18, z, 'gold', .7); KEEP_LIGHT = false;
  cyl(GM.woodDark, P, x, 1.36, z, .01, .2);
  if (island) for (let k = 0; k < 8; k++){ const a = k*TAU/8 + rnd(-.2, .2), rr = rnd(1.35, 1.6); plant(pick(['bushFlower', 'g_fern3', 'fern']), P, Math.cos(a)*rr, .06, Math.sin(a)*rr, rnd(.55, .75)); }
  clear.push([x, z, r + .25]);
}
// a small greenhouse: copper frame, glass walls and gable roof (grow lights glowing through at night), a deck in front with pots. Its deck faces the
// side its spur comes in by (k), else any way.
function gdGreenhouse(P, clear, k){
  const face = k >= 0 ? Math.atan2(SIDES4[k][0], SIDES4[k][1]) : pick([0, PI/2, PI, -PI/2]);
  const F = under(P, T(0, 0, 0, face)), w = 2.3, d = 1.4, h = .95, rh = .55, oz = -.3;
  const G = under(F, T(0, 0, oz));
  box(GM.stone2, G, 0, .05, 0, w + .1, .06, d + .1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(GM.wood, G, sx*w/2, h/2 + .05, sz*d/2, .035, h);
  for (let q = -1; q <= 1; q++) for (const sz of [-1, 1]) cyl(GM.wood, G, q*w/3, h/2 + .05, sz*d/2, .025, h);
  box(GM.glass, G, 0, h/2 + .08, -d/2, w - .04, h - .1, .02); box(GM.wood, G, 0, h + .06, -d/2, w + .04, .05, .05);
  for (const sx of [-1, 1]) box(GM.glass, G, sx*w*.3, h/2 + .08, d/2, w*.38, h - .1, .02);   // (the front: glass either side of an open doorway)
  box(GM.wood, G, 0, h + .06, d/2, w + .04, .05, .05);
  for (const sx of [-1, 1]) box(GM.glass, G, sx*w/2, h/2 + .08, 0, .02, h - .1, d - .04);
  const slope = Math.atan2(rh, d/2), len = Math.hypot(rh, d/2);
  for (const sz of [-1, 1]){ box(GM.glass, G, 0, h + .06 + rh/2, sz*d/4, w, .02, len, 0, -sz*slope);
    for (let q = -3; q <= 3; q++) box(GM.wood, G, q*w/6, h + .08 + rh/2, sz*d/4, .03, .03, len, 0, -sz*slope); }
  box(GM.wood, G, 0, h + .06 + rh, 0, w + .1, .05, .05);
  for (const sx of [-1, 1]) for (let q = 0; q < 3; q++){ const px = sx*rnd(.4, .95), pz = rnd(-.4, .3); box(GM.woodDark, G, px, .35, pz, .3, .04, .25); plant(pick(['bush', 'fern', 'succulent', 'bushFlower']), G, px, .38, pz, rnd(.45, .6)); }
  KEEP_LIGHT = true; for (const sx of [-.55, .55]) glow(G, sx, .75, 0, 'rosegold', 2.2); KEEP_LIGHT = false;
  box(GM.wood, G, 0, .07, d/2 + .42, w, .04, .7);
  for (let q = -2; q <= 2; q++) box(GM.woodDark, G, q*w/5, .093, d/2 + .42, .015, .006, .7);
  for (const px of [-.95, -.65, .65, .95]){ cyl(GM.stone2, G, px, .17, d/2 + .6, .09, .18); plant(pick(['bushFlower', 'fern', 'bonsai', 'succulent']), G, px, .26, d/2 + .6, rnd(.5, .65)); }
  gdLamp(G, -1.3, d/2 + .45, .9, []);
  clear.push([0, 0, 1.7]);
}
// a koi deck: copper planks out to the pond's edge with a low rail, a bench facing the water, lanterns at its ends
function gdKoiDeck(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, [a, b] = SIDES4[Math.max(0, k)], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  box(GM.wood, E, 0, .075, -.55, LOT - .3, .04, 1.0);
  for (let t = -1.6; t <= 1.6; t += .2) box(GM.woodDark, E, t, .097, -.55, .012, .006, 1.0);
  for (let t = -1.7; t <= 1.71; t += .425) cyl(GM.wood, E, t, .25, -.1, .025, .32);
  box(GM.wood, E, 0, .41, -.1, LOT - .25, .035, .045);
  KEEP_LIGHT = true; for (const t of [-1.7, 1.7]){ box(M.bulb, E, t, .5, -.1, .08, .08, .08); glow(E, t, .5, -.1, 'warm', 1.2); } KEEP_LIGHT = false;
  gdBench(E, rnd(-.6, .6), -.75, 0, []);
  clear.push([a*1.35, b*1.35, 1.2], [a*.85, b*.85, .5]);
}
// misters: thin poles puffing mist over ferns and mossy stones by the water
function gdMisters(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, [a, b] = SIDES4[Math.max(0, k)], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  for (const t of [-1, 0, 1]){ const t2 = t*1.1 + rnd(-.15, .15), zz = -rnd(.55, .8);
    cyl(M.metalDark, E, t2, .5, zz, .018, 1.0); box(GM.wood, E, t2, 1.02, zz, .06, .04, .06);
    glow(E, t2, 1.12, zz + .05, 'arc', .9); glow(E, t2, .9, zz + .15, 'arc', 1.3); }
  for (let q = 0; q < 5; q++){ const t = rnd(-1.5, 1.5), zz = -rnd(.9, 1.6); blob(pick([M.rock, M.rockDark]), E, t, .08, zz, rnd(.12, .2), .6); blob(GM.leaf2, E, t, .16, zz, rnd(.08, .12), .4); }
  for (let q = 0; q < 9; q++) plant(pick(['fern', 'g_fern2', 'g_fern3']), E, rnd(-1.6, 1.6), .06, -rnd(.4, 1.7), rnd(.6, .85));
  gdBio(E, 3); clear.push([a*1.0, b*1.0, 1.1]);
}
// a grotto: a horseshoe of mossy rock round a little pool, a hammock slung across it, glowing moss, a shaft of light. It opens toward the side its spur
// comes in by (k), else toward the pond.
function gdGrotto(P, x, clear, k){
  const kw = x.wet ? x.wet.indexOf(1) : 0, ko = k >= 0 ? k : Math.max(0, kw), open = Math.atan2(SIDES4[ko][0], SIDES4[ko][1]), F = under(P, T(0, 0, 0, open));
  for (let q = 0; q <= 12; q++){ const a = PI*.18 + q*(PI*1.64)/12, r = 1.25 + rnd(-.1, .1);
    const rx = Math.sin(a)*r, rz = Math.cos(a)*r;
    blob(pick([M.rock, M.rockDark]), F, rx, .3, rz, rnd(.38, .5), 1.1); blob(pick([M.rock, M.rockDark]), F, rx*.95, .85, rz*.95, rnd(.3, .42), 1);
    if (q > 2 && q < 10) blob(M.rock, F, rx*.82, 1.35, rz*.82, rnd(.28, .36), .8);
    if (chance(.6)) sph(GM.bio, F, rx*.88, rnd(.3, 1.1), rz*.88, rnd(.05, .08), .5);
    if (chance(.5)) plant(pick(['vines', 'pothos']), F, rx*.85, 1.4, rz*.85, rnd(.55, .75), 't', true); }
  put(U.cyl16, GM.pebbleDark, under(F, T(0, .03, -.1, 0, 1.25, .05, 1.0)));
  put(U.cyl16, GM.bowl, under(F, T(0, .058, -.1, 0, 1.1, .01, .85)));
  for (const s of [-1, 1]) cyl(GM.woodDark, F, s*.62, .4, -.55, .035, .8);
  for (let q = 0; q < 6; q++){ const u0 = -.55 + q*.22, u1 = u0 + .22, sag = t => .55 - .14*(1 - (t/.62)**2); strut(GM.hammock, F, u0, sag(u0), -.55, u1, sag(u1), -.55, .2); }
  spotAt(F, 0, .38, -.55, 'seat', null, [0, 1]);
  KEEP_LIGHT = true; glow(F, 0, 1.6, -.4, 'ivory', 3.0); glow(F, -.3, .35, -.1, 'green', .8); KEEP_LIGHT = false;
  clear.push([0, 0, 1.7]);
}
// A water plot: the pond a little below the lawn; a stone and pebble rim with a soft gold line inside it on every side that isn't water (on a side
// away from the garden, a strip of grass outside the rim: a pond always has its grass border); lily pads, some with glowing solar cells; koi in
// a pond of six or more; and a bridge where the water is one plot wide.
function gdWater(P, gd, x){
  box(GM.water, P, 0, .035, 0, LOT, .02, LOT);
  const e = x.e || [0, 0, 0, 0], br = x.br || 0;
  e.forEach((v, k) => {
    if (v === 2) return;
    const [a, b] = SIDES4[k], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b))), gap = (br === 1 && k < 2) || (br === 2 && k >= 2);
    if (!v){ box(GM.lip, E, 0, .05, -.06, LOT, .03, .14); for (let t = -1.8; t <= 1.8; t += .14) plant('gt0', E, t + rnd(-.04, .04), .06, -rnd(.02, .1), rnd(.22, .26)); }
    for (let t = -1.85; t <= 1.86; t += .2){
      if (gap && Math.abs(t) < .55) continue;
      blob(pick([GM.stone, GM.pebble, GM.pebble, GM.pebbleDark]), E, t + rnd(-.04, .04), .08, -rnd(.17, .3), rnd(.1, .14), .85);
      if (chance(.15)) sph(GM.bio, E, t, .16, -rnd(.3, .38), .03, .6);
    }
    if (gap){ for (const s of [-1, 1]) box(GM.edge, E, s*1.2, .05, -.42, 1.3, .015, .025); }
    else box(GM.edge, E, 0, .05, -.42, LOT - .1, .015, .025);
    if (chance(.5)) plant(pick(['g_fern3', 'bushFlower']), E, rnd(-1.4, 1.4), .06, -.2, rnd(.5, .65));
  });
  // inner corners (water on both sides, grass on the corner): a few stones
  (x.cw || []).forEach((v, k) => { if (!v) return; const [sx, sz] = GD_CORNERS[k];
    for (let q = 0; q < 3; q++) blob(pick([GM.stone, GM.pebble]), P, sx*(LOT/2 - rnd(.05, .25)), .08, sz*(LOT/2 - rnd(.05, .25)), rnd(.1, .14), .85); });
  const free = (px, pz) => !(br === 1 && Math.abs(pz) < .7) && !(br === 2 && Math.abs(px) < .7);
  if ((x.pd || 1) >= 2) for (let q = 0; q < irand(3, 6); q++){ const px = rnd(-1.4, 1.4), pz = rnd(-1.4, 1.4); if (!free(px, pz)) continue;
    put(U.cyl16, GM.pad, under(P, T(px, .05, pz, 0, rnd(.24, .34), .012, rnd(.24, .34))));
    if (chance(.35)) box(GM.solar, P, px, .058, pz, .1, .008, .1); else if (chance(.4)) blob(pick([GM.coral, GM.cream]), P, px, .07, pz, .04, .7); }
  if ((x.pd || 0) >= 6) for (let q = 0; q < irand(2, 4); q++){ const px = rnd(-1.3, 1.3), pz = rnd(-1.3, 1.3), ry = rnd(0, TAU); if (!free(px, pz)) continue;
    const Pk = under(P, T(px, .046, pz, ry)), m = chance(.6) ? GM.koi : GM.koiW;
    box(m, Pk, 0, 0, 0, .05, .014, .17); box(m, Pk, 0, 0, -.11, .07, .01, .05); if (m === GM.koiW) box(GM.koi, Pk, 0, .006, .03, .03, .006, .05); }
  if (br) gdBridge(br === 1 ? under(P, T(0, 0, 0, PI/2)) : P);
}
// A bridge along its frame's z, edge to edge: a deck low enough to walk on, copper rails rising in a gentle arch, lanterns at its four corners,
// stone piers under it in the water
function gdBridge(F){
  box(GM.wood, F, 0, .09, 0, .9, .05, LOT);
  for (let t = -1.8; t <= 1.81; t += .2) box(GM.woodDark, F, 0, .117, t, .9, .006, .015);
  for (const t of [-.9, .9]) put(U.cyl16, GM.stone2, under(F, T(0, .03, t, 0, .5, .06, .5)));
  const yr = t => .45 + .1*(1 - (t/1.9)**2);
  for (const s of [-1, 1]){
    for (let t = -1.8; t <= 1.81; t += .45) cyl(GM.wood, F, s*.47, (yr(t) + .1)/2, t, .025, yr(t) - .1);
    for (let t = -1.8; t < 1.8; t += .45) strut(GM.wood, F, s*.47, yr(t), t, s*.47, yr(t + .45), t + .45, .035);
    strut(GM.woodDark, F, s*.47, .2, -1.8, s*.47, .2, 1.8, .025);
  }
  KEEP_LIGHT = true; for (const s of [-1, 1]) for (const t of [-1.75, 1.75]){ box(M.bulb, F, s*.47, yr(t) + .09, t, .07, .08, .07); glow(F, s*.47, yr(t) + .09, t, 'warm', 1.1); } KEEP_LIGHT = false;
}
