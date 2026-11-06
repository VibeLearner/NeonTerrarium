// Neon Terrarium: gardens (Nov 2026, sandbox only). Lawn plots that touch side to side form a garden; a garden of three or more grows its own
// pieces, more and bigger ones as it grows: benches and trees first, then a pond, then bridges, gazebos, a greenhouse, a koi deck, and once in a
// while a grotto. Palette B ("Sunlit greenhouse"): lush greens, cream stone and copper wood by day, warm gold light on deep teal water at night.
// The spec: the "Garden system spec" doc (Nov 6).
//
// How it works:
//  - gardenUpdate() runs with every rebuild (world.js refreshTodo, like the parks). It finds each garden by a flood fill (from a plot, walk to every
//    lawn plot sharing an edge with it), gives each new garden plot its piece, checks every piece still has the reason it appeared, and works out
//    what each plot needs to know about its neighbours to be drawn (which sides are water, a bridge, an island). Plots whose drawing changed are
//    rebuilt.
//  - A plot's garden is c.gd: { s: its seed, p: its piece, w: 1 when water, o: 1 for an open lawn kept for picnics, a: an arch's axis } (saved
//    with the city) plus gd.x, what it needs of its neighbours (worked out again each time, not saved). gd is part of the plot's recipe
//    (recipe.js), so the plot worker draws it too.
//  - Every chance is rolled once, from the plot's own seed (made when the plot became lawn), so it lands the same way every time it is
//    worked out. Turning a plot to something else and back to lawn gives it a new seed: a new roll.
//  - Pieces never reshuffle: a piece stays until its plot goes or the reason it appeared does (a gazebo's pond shrinking, say); then the plot
//    goes back to open lawn.
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
  edge: toon(0x5a3e18, { em: 0xf2b14e, kind: 'trim' }),         // the soft copper-gold neon round the ponds and along the paths
  bio: toon(0x2e6a52, { em: 0x5fe0b0, kind: 'trim' }),          // glowing moss and caps: teal-green, so the night garden isn't all warm
  fiber: toon(0x5a3e18, { em: 0xffd27a, kind: 'window' }),      // the fiber-optic strands in the arches' vines
  glass: toon(0x3d6a66, { em: 0x6a3a52, kind: 'window' }),      // greenhouse panes: grow lights behind them at night
  teal: toon(0x3f9a9a), gold: toon(0xd9963a), hammock: toon(0xf2e6cc),
};

/* ---------- the rules ---------- */
const GD_PIECES = ['lawn', 'tree', 'shrubs', 'bench', 'flowers', 'lanterns', 'path', 'birdbath', 'arch', 'gazebo', 'greenhouse', 'koideck', 'misters', 'grotto', 'water'];
const GD_SOFT = new Set(['lawn', 'tree', 'shrubs', 'flowers']);   // pieces a spring may come up through
const GD_SPREAD = .66, GD_SPRING = .4, GD_WATER_MAX = .4, GD_BRIDGE = .65;
const gdTier = n => n >= 25 ? 5 : n >= 16 ? 4 : n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0;
const gardenOn = () => !(self.ECON && ECON.on);   // sandbox only: the economy mode keeps its plain lawns
const gdGround = c => !!c && !c.mega && !c.sections.length && !c.wall && c.green === 'grass';
const gdRoll = (gd, ...k) => mulberry32(hash('gd', gd.s, ...k))();
const gdAt = (c, a, b) => cells.get(ckey(c.i + a, c.j + b));
const GD_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// what of a garden plot changes how it is drawn (a plot still waiting for its garden draws as a plain lawn, whatever its seed)
const gdSig = gd => gd && gd.p ? JSON.stringify(gd) : '';
const gdKeep = gd => gd && gd.p ? [gd.p, gd.w | 0, gd.o | 0, gd.s, gd.a | 0].join() : '';

// every garden: plot -> { cells, n, wc (water plots), has: count of each piece }
function gdComps(){
  const comp = new Map();
  for (const c of cells.values()){
    if (comp.has(c) || !c.gd) continue;
    const g = { cells: [c], n: 0, wc: 0, has: {} }, st = [c]; comp.set(c, g);
    while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && !comp.has(n)){ comp.set(n, g); g.cells.push(n); st.push(n); } } }
    g.n = g.cells.length;
    for (const q of g.cells){ if (q.gd.w) g.wc++; if (q.gd.p) g.has[q.gd.p] = (g.has[q.gd.p] || 0) + 1; }
  }
  return comp;
}
// the pond a water plot is in (its water plots, by flood fill over water)
function gdPond(c){
  const seen = new Set([c]), st = [c];
  while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && n.gd.w && !seen.has(n)){ seen.add(n); st.push(n); } } }
  return seen;
}
// the grass plots round a pond, and whether one of them holds a piece
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

// A garden plot getting its piece (the moment it joins a garden of three or more). In order: does the pond beside it spread onto it (66%), does a
// garden of six or more with no water yet get its spring (40% at each new plot), then a piece from what the garden's size and the plot's
// neighbours allow.
function gdAssign(c, g, comp){
  const gd = c.gd, tier = gdTier(g.n), u = k => gdRoll(gd, k);
  const nb = SIDES4.map(([a, b]) => { const n = gdAt(c, a, b); return n && comp.get(n) === g ? n : null; });
  const wet = nb.filter(n => n && n.gd.w);
  // the pond spreads (not past the most water a garden may hold)
  if (wet.length && g.wc + 1 <= GD_WATER_MAX*g.n && u('spread') < GD_SPREAD){ gd.w = 1; gd.p = 'water'; gd.o = 0; g.wc++; return; }
  // the spring: the garden's most enclosed plot (most garden neighbours) that holds nothing bigger than a tree
  if (g.n >= 6 && !g.wc && u('spring') < GD_SPRING){
    const cand = g.cells.filter(q => q === c || (q.gd.p && !q.gd.w && GD_SOFT.has(q.gd.p)));
    const score = q => SIDES4.reduce((s, [a, b]) => s + (comp.get(gdAt(q, a, b)) === g ? 1 : 0), 0) + gdRoll(q.gd, 'enclosed')*.5;
    const sp = cand.sort((p, q) => score(q) - score(p))[0];
    if (sp){ if (sp.gd.p) g.has[sp.gd.p]--; sp.gd.w = 1; sp.gd.p = 'water'; sp.gd.o = 0; sp.gd.a = 0; g.wc++; g.has.water = (g.has.water || 0) + 1; if (sp === c) return; }
  }
  const grass = nb.map(n => !!n && !n.gd.w), ponds = gdPondsBy(c), big = ponds.reduce((m, p) => Math.max(m, p.n), 0);
  const L = [['lawn', 3], ['tree', 3], ['bench', 2], ['flowers', 2]];
  if (tier >= 2){ L.push(['lanterns', 1.5], ['path', 1.5]); if (grass.every(Boolean) && !g.has.birdbath) L.push(['birdbath', 1.2]); }
  const ax = (grass[0] && grass[1] ? [1] : []).concat(grass[2] && grass[3] ? [2] : []);
  if (tier >= 3 && ax.length) L.push(['arch', 1.2]);
  if (tier >= 3 && ponds.some(p => p.n >= 4 && !gdPondHas(p.pond, 'gazebo'))) L.push(['gazebo', 4]);
  if (tier >= 4){
    if ((g.has.greenhouse || 0) < Math.floor(g.n/16)) L.push(['greenhouse', 1]);
    if (wet.length) L.push(['misters', 1.2]);
    if (ponds.some(p => p.n >= 6 && !gdPondHas(p.pond, 'koideck'))) L.push(['koideck', 3]);
  }
  if (tier >= 5 && big >= 6 && !g.has.grotto) L.push(['grotto', L.reduce((s, [, w]) => s + w, 0)/19]);   // (about one placement in twenty, when it can)
  const p = gdPickW(L, u('piece'));
  gd.p = p; gd.o = p === 'lawn' ? 1 : 0;
  if (p === 'arch') gd.a = ax[Math.floor(u('axis')*ax.length)];
  g.has[p] = (g.has[p] || 0) + 1;
}
// Does the piece still have its reason? (a plot whose piece lost it goes back to open lawn)
function gdValid(c, g, comp){
  const gd = c.gd, side = (a, b) => { const n = gdAt(c, a, b); return n && comp.get(n) === g ? n : null; };
  const grassAt = k => { const n = side(...SIDES4[k]); return !!n && !n.gd.w; };
  switch (gd.p){
    case 'birdbath': return [0, 1, 2, 3].every(grassAt);
    case 'arch': return gd.a === 1 ? grassAt(0) && grassAt(1) : gd.a === 2 ? grassAt(2) && grassAt(3) : false;
    case 'misters': return SIDES4.some(([a, b]) => { const n = side(a, b); return n && n.gd.w; });
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
  // it goes back to waiting, its pond and piece gone.
  const diag = c => GD_CORNERS.some(([a, b]) => { const n = gdAt(c, a, b); return n && n.gd && comp.get(n) !== comp.get(c) && comp.get(n).n >= 3; });
  for (const c of cells.values()){
    if (!c.gd || comp.get(c).n >= 3) continue;
    const gd = c.gd; gd.w = 0; gd.o = 0; gd.a = 0;
    if (diag(c)){ if (gd.p !== 'tree' && gd.p !== 'shrubs') gd.p = gdRoll(gd, 'small') < .55 ? 'tree' : 'shrubs'; }
    else gd.p = null;
  }
  comp = gdComps();
  // new garden plots get their pieces, one at a time (each sees what the ones before it made)
  const fresh = [...cells.values()].filter(c => c.gd && !c.gd.p && comp.get(c).n >= 3).sort((p, q) => p.i - q.i || p.j - q.j);
  let assigned = false;
  for (const c of fresh){ gdAssign(c, comp.get(c), comp); assigned = true; }
  // every piece checked for its reason (pond sizes are as they now stand)
  for (const c of cells.values()){
    if (!c.gd || !c.gd.p || c.gd.w || comp.get(c).n < 3) continue;
    if (!gdValid(c, comp.get(c), comp)){ c.gd.p = 'lawn'; c.gd.o = 0; c.gd.a = 0; }
  }
  // what each plot needs of its neighbours to be drawn
  const pondN = new Map();
  for (const c of cells.values()){
    const gd = c.gd; if (!gd || !gd.p){ if (gd) delete gd.x; continue; }
    const g = comp.get(c), x = { t: gdTier(g.n) };
    x.e = SIDES4.map(([a, b]) => { const n = gdAt(c, a, b); return n && comp.get(n) === g && n.gd.p ? (n.gd.w ? 2 : 1) : 0; });
    if (g.n < 3) x.dg = 1;
    if (gd.w){
      if (!pondN.has(c)){ const pond = gdPond(c); for (const q of pond) pondN.set(q, pond.size); }
      x.pd = pondN.get(c);
      x.cw = GD_CORNERS.map(([a, b]) => { const n = gdAt(c, a, b); return x.e[SIDES4.findIndex(([p, q]) => p === a && q === 0)] === 2 && x.e[SIDES4.findIndex(([p, q]) => p === 0 && q === b)] === 2 && !(n && n.gd && n.gd.w) ? 1 : 0; });
      // a bridge: water one plot wide, garden grass on two opposite sides and none on the other two
      if (x.t >= 3 && gdRoll(gd, 'bridge') < GD_BRIDGE){
        if (x.e[0] === 1 && x.e[1] === 1 && x.e[2] !== 1 && x.e[3] !== 1) x.br = 1;
        else if (x.e[2] === 1 && x.e[3] === 1 && x.e[0] !== 1 && x.e[1] !== 1) x.br = 2;
      }
    } else {
      x.pd = gdPondsBy(c).reduce((m, p) => Math.max(m, p.n), 0);
      if (x.t >= 4 && x.e.every(v => v === 2)) x.isl = 1;   // ringed by water: an island gazebo stands on it (its own piece comes back if the ring breaks)
      x.wet = x.e.map(v => v === 2 ? 1 : 0);
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
// saving: [piece, water, open, seed, axis] or 0
const gdSave = c => c.gd && c.gd.p ? [c.gd.p, c.gd.w | 0, c.gd.o | 0, c.gd.s, c.gd.a | 0] : 0;
function gdLoad(c, v){
  if (!Array.isArray(v) || !GD_PIECES.includes(v[0]) || c.green !== 'grass') return;
  c.gd = { s: v[3] | 0, p: v[0], w: v[1] ? 1 : 0, o: v[2] ? 1 : 0 }; if (v[4]) c.gd.a = v[4] | 0;
  if (c.gd.p === 'water' && !c.gd.w) c.gd.p = 'lawn';
}

/* ---------- drawing ---------- */
// A garden plot, drawn in its own frame P (the plot's middle, the lawn at y about .06). Everything here comes from c.gd (and gd.x), never from
// the plots around: the plot worker draws it from the recipe alone. People walk wherever nothing stands between ankle and head height
// (people.js), so: decks, bridge planks and stepping stones are kept under .14 (walked on); rims, rails, posts and planters stand in the band
// (walked round). The middle of each side is kept clear where it can be, for the paths between plots.
function gardenTile(c, P){
  const gd = c.gd, x = gd.x || { e: [0, 0, 0, 0], t: 1 };
  R = mulberry32(hash('garden', c.i, c.j, gd.s));
  if (gd.w){ gdWater(P, gd, x); return; }
  lawn(P, 4);
  const clear = [];
  if (x.isl) gdGazebo(P, 0, 0, clear, true);
  else switch (gd.p){
    case 'tree': gdTree(P, rnd(-.5, .5), rnd(-.5, .5), rnd(1, 1.25), clear); if (chance(.6)) gdTree(P, rnd(-1.2, 1.2), rnd(-1.2, 1.2), rnd(.7, .9), clear); gdBio(P, 3); break;
    case 'shrubs': gdTree(P, rnd(-.4, .4), rnd(-.4, .4), rnd(.7, .9), clear); for (let k = 0; k < 4; k++) plant(pick(['bush', 'bushFlower', 'fern', 'g_fern2']), P, rnd(-1.3, 1.3), .06, rnd(-1.3, 1.3), rnd(.6, .85)); break;
    case 'bench': { const a = pick([0, PI/2, PI, -PI/2]); gdBench(P, Math.sin(a)*.6, Math.cos(a)*.6, a + PI, clear); gdTree(P, Math.sin(a)*1.2 + Math.cos(a)*.9, Math.cos(a)*1.2 - Math.sin(a)*.9, rnd(.9, 1.1), clear);
      gdLamp(P, Math.sin(a)*.75 - Math.cos(a)*.55, Math.cos(a)*.75 + Math.sin(a)*.55, .95, clear); gdBeds(P, 1, clear); break; }
    case 'flowers': gdBeds(P, 2, clear); gdLamp(P, rnd(-.3, .3), rnd(-.3, .3), .8, clear); gdBio(P, 2); break;
    case 'lanterns': { const a = chance(.5); for (const t of [-.9, 0, .9]) gdLamp(P, a ? t : rnd(-.15, .15), a ? rnd(-.15, .15) : t, rnd(.9, 1.1), clear); gdBeds(P, 1, clear); gdBio(P, 3); break; }
    case 'path': gdPath(P, x, clear); break;
    case 'birdbath': gdBirdbath(P, clear); break;
    case 'arch': gdArch(P, gd.a === 2, clear); break;
    case 'gazebo': { const k = x.wet ? x.wet.indexOf(1) : -1, [a, b] = k >= 0 ? SIDES4[k] : [0, 0]; gdGazebo(P, a*.45, b*.45, clear, false); break; }
    case 'greenhouse': gdGreenhouse(P, clear); break;
    case 'koideck': gdKoiDeck(P, x, clear); break;
    case 'misters': gdMisters(P, x, clear); break;
    case 'grotto': gdGrotto(P, x, clear); break;
    case 'lawn': for (const q of lawnSpots(c, P)) clear.push(q); if (chance(.5)) gdBio(P, 2); break;
  }
  // edge dressing: reeds and flowers along a side that meets the water
  if (x.wet) x.wet.forEach((w, k) => { if (!w) return; const [a, b] = SIDES4[k], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
    for (let t = -1.6; t <= 1.6; t += .55) if (chance(.6)){ const q = chance(.5) ? 'g_fern3' : 'bushFlower'; plant(q, E, t + rnd(-.15, .15), .06, -rnd(.2, .35), rnd(.55, .75)); } });
  // the lawn: the same short grass as any lawn, clear of what stands on it
  const n = 20, st = LOT/n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    const gx = -LOT/2 + (i + .5 + rnd(-.2, .2))*st, gz = -LOT/2 + (j + .5 + rnd(-.2, .2))*st;
    if (clear.some(([cx, cz, r]) => (gx - cx)**2 + (gz - cz)**2 < r*r)) continue;
    plant('gt0', P, gx, .06, gz, rnd(.24, .28));
  }
}
// a tree: a trunk, a couple of limbs and a crown of leaf clumps (now and then in blossom)
function gdTree(P, x, z, s, clear){
  const h = rnd(.8, 1.05)*s;
  cyl(GM.trunk, P, x, h/2, z, .06*s, h);
  for (let k = 0; k < 2; k++){ const a = rnd(0, TAU); strut(GM.trunk, P, x, h*.7, z, x + Math.cos(a)*.3*s, h + .15*s, z + Math.sin(a)*.3*s, .05*s); }
  const bloom = chance(.3), mats = bloom ? [GM.blossom, GM.cream, GM.leaf3] : [GM.leaf, GM.leaf2, GM.leaf3];
  for (let k = 0; k < 6; k++) blob(pick(mats), P, x + rnd(-.32, .32)*s, h + rnd(-.05, .35)*s, z + rnd(-.32, .32)*s, rnd(.26, .38)*s, .8);
  plant(pick(['bush', 'fern', 'g_fern2']), P, x + rnd(-.25, .25), .06, z + rnd(-.25, .25), rnd(.55, .7));
  clear.push([x, z, .3]);
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
// flower beds: a low stone kerb round iris, coral and cream flowers
function gdBeds(P, n, clear){
  for (let k = 0; k < n; k++){
    const a = rnd(0, TAU), r = rnd(.9, 1.25), bx = Math.cos(a)*r, bz = Math.sin(a)*r, w = rnd(.5, .75);
    for (let q = 0; q < 10; q++){ const t = q*TAU/10; box(GM.stone2, P, bx + Math.cos(t)*w*.5, .08, bz + Math.sin(t)*w*.4, .14, .05, .06, -t); }
    for (let q = 0; q < 7; q++){ const fx = bx + rnd(-.4, .4)*w, fz = bz + rnd(-.3, .3)*w;
      cyl(GM.leaf2, P, fx, .12, fz, .015, .12); blob(pick([GM.coral, GM.coral, GM.cream, GM.iris]), P, fx, .2 + rnd(0, .08), fz, rnd(.05, .08)); }
    plant(pick(['bushFlower', 'g_flowers']), P, bx, .06, bz, rnd(.6, .8));
    clear.push([bx, bz, w*.55]);
  }
}
// glowing caps and moss, a few at the foot of things: teal-green at night
function gdBio(P, n){
  for (let k = 0; k < n; k++){ const x = rnd(-1.5, 1.5), z = rnd(-1.5, 1.5);
    for (let q = 0; q < 3; q++){ const ox = x + rnd(-.1, .1), oz = z + rnd(-.1, .1); cyl(GM.stone2, P, ox, .09, oz, .008, .06); sph(GM.bio, P, ox, .13, oz, rnd(.025, .04), .6); } }
}
// stepping stones across the plot, lanterns at each end, a soft gold line beside the stones
function gdPath(P, x, clear){
  const along = (x.e[0] || x.e[1]) && !(x.e[2] || x.e[3]) ? 0 : (x.e[2] || x.e[3]) && !(x.e[0] || x.e[1]) ? 1 : (chance(.5) ? 0 : 1);
  const F = under(P, T(0, 0, 0, along ? 0 : PI/2));
  for (let t = -1.65; t <= 1.66; t += .42){ const ox = rnd(-.08, .08); put(U.cyl16, pick([GM.stone, GM.stone2]), under(F, T(ox, .07, t, rnd(0, PI), rnd(.36, .44), .03, rnd(.3, .38)))); clear.push(...[[ox, t, .26]].map(([a, b, r]) => along ? [a, b, r] : [b, -a, r])); }
  box(GM.edge, F, .38, .07, 0, .025, .015, 3.2);
  for (const t of [-1.2, 1.2]){ const lx = -.42; gdLampF(F, lx, t, .95); clear.push(along ? [lx, t, .12] : [t, -lx, .12]); }
  for (let k = 0; k < 5; k++) plant(pick(['bushFlower', 'fern', 'g_flowers', 'g_fern3']), F, pick([-1, 1])*rnd(.7, 1.4), .06, rnd(-1.5, 1.5), rnd(.55, .75));
  gdBio(P, 2);
}
function gdLampF(F, x, z, h){ gdLamp(F, x, z, h, []); }
// a birdbath: a stone pedestal and bowl, a ring of coral, teal and gold mosaic round its rim, water in the bowl; flowers round its foot
function gdBirdbath(P, clear){
  const x = rnd(-.2, .2), z = rnd(-.2, .2);
  put(U.cyl16, GM.stone2, under(P, T(x, .08, z, 0, .5, .08, .5)));
  cyl(GM.stone, P, x, .35, z, .09, .5); put(U.cyl16, GM.stone, under(P, T(x, .62, z, 0, .62, .08, .62)));
  put(U.cyl16, GM.bowl, under(P, T(x, .665, z, 0, .5, .01, .5)));
  const tiles = [GM.coral, GM.teal, GM.gold, GM.cream];
  for (let k = 0; k < 16; k++){ const a = k*TAU/16; box(tiles[k % 4], P, x + Math.cos(a)*.29, .665, z + Math.sin(a)*.29, .07, .02, .04, -a); }
  for (let k = 0; k < 4; k++) box(tiles[(k + 1) % 4], P, x + (k % 2 ? .092 : 0)*(k > 1 ? -1 : 1), .3, z + (k % 2 ? 0 : .092)*(k > 1 ? -1 : 1), .04, .12, .04, k*PI/2);
  for (let k = 0; k < 6; k++){ const a = k*TAU/6 + rnd(-.2, .2), r = rnd(.45, .6); blob(pick([GM.coral, GM.cream, GM.iris]), P, x + Math.cos(a)*r, .14, z + Math.sin(a)*r, rnd(.06, .09)); plant('bushFlower', P, x + Math.cos(a)*r, .06, z + Math.sin(a)*r, .55); }
  gdLamp(P, x + 1.05, z - .9, .9, clear);
  clear.push([x, z, .7]); gdBio(P, 2);
}
// a vine-covered arch walkway: four arches along the plot, fiber-optic strands glowing in the vines and blossom, stepping stones under
function gdArch(P, alongZ, clear){
  const F = under(P, T(0, 0, 0, alongZ ? 0 : PI/2)), hw = .62, top = 1.35;
  for (let t = -1.6; t <= 1.61; t += .4){ put(U.cyl16, GM.stone2, under(F, T(rnd(-.05, .05), .07, t, rnd(0, PI), .34, .03, .3))); }
  for (const t of [-1.35, -.45, .45, 1.35]){
    for (const s of [-1, 1]) cyl(GM.woodDark, F, s*hw, top*.4, t, .03, top*.8);
    const pts = []; for (let k = 0; k <= 6; k++){ const a = PI - k*PI/6; pts.push([Math.cos(a)*hw, top*.8 + Math.sin(a)*.42]); }
    for (let k = 0; k < 6; k++) strut(GM.woodDark, F, pts[k][0], pts[k][1], t, pts[k + 1][0], pts[k + 1][1], t, .045);
    for (let k = 0; k <= 6; k++){ blob(pick([GM.leaf, GM.leaf2, GM.leaf3]), F, pts[k][0], pts[k][1] + .04, t + rnd(-.12, .12), rnd(.12, .18), .8);
      if (chance(.45)) blob(pick([GM.blossom, GM.coral, GM.cream]), F, pts[k][0] + rnd(-.08, .08), pts[k][1] + rnd(-.04, .08), t + rnd(-.1, .1), rnd(.05, .07));
      if (k % 2) box(GM.fiber, F, pts[k][0], pts[k][1] - .06, t + rnd(-.08, .08), .02, .02, .02); }
    for (const s of [-1, 1]) if (chance(.6)) plant(pick(['pothos', 'vines']), F, s*hw*.85, top*.9, t, rnd(.55, .75), 't', true);
  }
  for (const t of [-.9, .9]) glow(F, 0, top*1.05, t, 'warm', 1.1);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) plant(pick(['bushFlower', 'g_fern3', 'bush']), F, s*rnd(.85, 1.3), .06, rnd(-1.5, 1.5), rnd(.55, .75));
  clear.push(...[-1.2, -.4, .4, 1.2].map(t => alongZ ? [0, t, .45] : [t, 0, .45]));
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
  clear.push([x, z, r + .2]);
}
// a small greenhouse: copper frame, glass walls and gable roof (grow lights glowing through at night), a deck in front with pots
function gdGreenhouse(P, clear){
  const F = under(P, T(rnd(-.15, .15), 0, -.25, pick([0, PI/2, PI, -PI/2]))), w = 2.3, d = 1.4, h = .95, rh = .55;
  box(GM.stone2, F, 0, .05, 0, w + .1, .06, d + .1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(GM.wood, F, sx*w/2, h/2 + .05, sz*d/2, .035, h);
  for (let k = -1; k <= 1; k++) for (const sz of [-1, 1]) cyl(GM.wood, F, k*w/3, h/2 + .05, sz*d/2, .025, h);
  for (const sz of [-1, 1]){ box(GM.glass, F, 0, h/2 + .08, sz*d/2, w - .04, h - .1, .02); box(GM.wood, F, 0, h + .06, sz*d/2, w + .04, .05, .05); box(GM.wood, F, 0, .1, sz*d/2, w, .05, .05); }
  box(GM.glass, F, -w/2, h/2 + .08, 0, .02, h - .1, d - .04);
  for (const sz of [-1, 1]) box(GM.glass, F, w/2, h/2 + .08, sz*d*.3, .02, h - .1, d*.38);   // (the door in the middle of the end wall, open)
  const slope = Math.atan2(rh, d/2), len = Math.hypot(rh, d/2);
  for (const sz of [-1, 1]){ box(GM.glass, F, 0, h + .06 + rh/2, sz*d/4, w, .02, len, 0, -sz*slope);
    for (let k = -3; k <= 3; k++) box(GM.wood, F, k*w/6, h + .08 + rh/2, sz*d/4, .03, .03, len, 0, -sz*slope); }
  box(GM.wood, F, 0, h + .06 + rh, 0, w + .1, .05, .05);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++){ const px = sx*rnd(.3, .9), pz = rnd(-.4, .4); box(GM.woodDark, F, px, .35, pz, .3, .04, .25); plant(pick(['bush', 'fern', 'succulent', 'bushFlower']), F, px, .38, pz, rnd(.45, .6)); }
  KEEP_LIGHT = true; for (const sx of [-.55, .55]) glow(F, sx, .75, 0, 'rosegold', 2.2); KEEP_LIGHT = false;
  // the deck out front, with potted plants
  box(GM.wood, F, 0, .07, d/2 + .45, w, .04, .7);
  for (let k = -2; k <= 2; k++) box(GM.woodDark, F, k*w/5, .093, d/2 + .45, .015, .006, .7);
  for (const px of [-.95, -.6, .7, 1.0]){ cyl(GM.stone2, F, px, .17, d/2 + .65, .09, .18); plant(pick(['bushFlower', 'fern', 'bonsai', 'succulent']), F, px, .26, d/2 + .65, rnd(.5, .65)); }
  gdLamp(F, -1.35, d/2 + .5, .9, []);
  clear.push([0, 0, 1.75]);
}
// a koi deck: copper planks out to the pond's edge with a low rail, a bench facing the water, lanterns at its ends
function gdKoiDeck(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, [a, b] = SIDES4[Math.max(0, k)], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  box(GM.wood, E, 0, .075, -.55, LOT - .3, .04, 1.0);
  for (let t = -1.6; t <= 1.6; t += .2) box(GM.woodDark, E, t, .097, -.55, .012, .006, 1.0);
  for (let t = -1.7; t <= 1.71; t += .425) cyl(GM.wood, E, t, .25, -.1, .025, .32);
  box(GM.wood, E, 0, .41, -.1, LOT - .25, .035, .045);
  KEEP_LIGHT = true; for (const t of [-1.7, 1.7]){ box(M.bulb, E, t, .5, -.1, .08, .08, .08); glow(E, t, .5, -.1, 'warm', 1.2); } KEEP_LIGHT = false;
  gdBench(E, rnd(-.6, .6), -1.35, 0, []);
  for (let q = 0; q < 4; q++) plant(pick(['bushFlower', 'g_fern3']), E, pick([-1, 1])*rnd(1.2, 1.6), .06, -rnd(1.2, 1.7), rnd(.55, .7));
  clear.push([a*1.35, b*1.35, 1.2], [a*.55, b*.55, .5]);
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
// a grotto: a horseshoe of mossy rock round a little pool, a hammock slung across it, glowing moss, a shaft of light
function gdGrotto(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, open = Math.atan2(SIDES4[Math.max(0, k)][0], SIDES4[Math.max(0, k)][1]), F = under(P, T(0, 0, 0, open));
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
