// A plot's recipe (round 9): what generation needs of a plot, and nothing else. Its own saved fields (seed and zone of each section, a lift's height, the
// pod below, its style and greenery, a megastructure's id), whether the four plots beside it exist (the only neighbor the builders look at: open edges get
// railings, pads and plants) and whether it is a dark street. Everything else generation touches (the highway and metro lines, the megastructures, the
// settings) is global and not part of the recipe: see tools/perf/recipe_proof.py for how that was checked.
// recipeGen(r) makes the plot from the recipe alone, on a stand-in cell in a map holding only the plot and stand-ins for its four neighbors that throw when read,
// so a builder reading any neighbor field fails loudly. Same steps as rebuildCell, nothing of the live city changed.
const RECIPE_IN = ['i', 'j', 'x', 'z', 'green', 'style', 'mega', 'park', 'sections', 'below', 'lift'];
// a plot that may throw the air-filter hologram (rooftopBoard picks it from the plot alone; whether there is room is decided by the neighbors' heights)
function recipeIsAir(c){ const key = c.i + ',' + c.j; return window.AIR_FORCE === key || (!(window.WALL_FORCE === key || hash('wallholo', c.i, c.j) % WALL_HOLO_ODDS === 0) && hash('airholo', c.i, c.j) % AIR_HOLO_ODDS === 0); }
function recipeOf(c){
  const r = { nb: SIDES4.map(([a, b]) => cells.has(ckey(c.i + a, c.j + b)) ? 1 : 0), dark: isDarkPlot(c) };
  for (const k of RECIPE_IN) if (c[k] !== undefined) r[k] = structuredClone(c[k]);
  // two builders look at the plots around beyond the four edges. A pod on a scaffold (liftSupports) asks of each side what its neighbor rises to: whether it is
  // a megastructure, how many sections it has, its height and its own pod's deck. A tower that may throw the air-filter hologram (rooftopBoard) asks the heights of
  // the three plots in front of each of its four faces (twelve plots, corners included). Those are the plots listed in nbi, with only those fields.
  const air = recipeIsAir(c);
  const at = [];
  if (c.lift) for (const [a, b] of SIDES4) at.push([a, b]);
  if (air) for (const [a, b] of SIDES4) for (let l = -1; l <= 1; l++) at.push([a + (a ? 0 : l), b + (b ? 0 : l)]);
  if (at.length){ r.nbi = []; for (const [a, b] of at){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n && !r.nbi.some(e => e[0] === a && e[1] === b)) r.nbi.push([a, b, { mega: !!n.mega, sec: n.sections.length, height: n.height, liftY: n.lift ? n.lift.y : null }]); } }
  // a luxury pod's walkways ask how far the neighbor's wall really stands (wallGap): the triangles of the neighbor in the corridor, taken here from its own geometry
  if (c.lift && c.sections[0] && c.sections[0].zone === 'high') for (const [a, b] of SIDES4){
    const n = cells.get(ckey(c.i + a, c.j + b)), e = n && r.nbi.find(q => q[0] === a && q[1] === b); if (!e || !n.data || !n.data.geo) continue;
    const F = under(T(c.x, 0, c.z), T(0, 0, 0, Math.atan2(a, b))), { a: pa, b: pb } = wallCorridor(F, LOT - 1.05, 1.6), y0 = c.lift.y;
    const h = n.data.pm;
    if (h && h.out && n.data.rec && n.data.rec.r){   // (the neighbor's arrays are let go: whoever makes the pod makes the neighbor again for its triangles, see recipeGen)
      e[2].nbrec = { r: n.data.rec.r, draws: n.data.rec.draws, cor: [pa.x, pa.z, pb.x, pb.z, y0] }; continue; }
    const tris = corridorTris(n.data.geo, pa.x, pa.z, pb.x, pb.z, y0 + .2, y0 + .9), flat = []; for (const v of tris) flat.push(v.x, v.y, v.z);
    e[2].wt = flat;
  }
  return r;
}
// The lines the plots sit under. Not part of one plot's recipe (a line is long), a copy of the highways and metros as plain data, made when they change, and
// the indexes over them (what hwAt and mtAt answer). recipeGen swaps these in for the live ones while it runs.
// (only the fields the builders read: the rest of a line is its drawn geometry, its cars and trains, which refer back to the line)
const LINE_KEYS = ['id', 'lanes', 'done', 'side', 'dir0', 'st', 'sides'];
const lineOf = o => { const r = {}; for (const k of LINE_KEYS) if (o[k] !== undefined) r[k] = structuredClone(o[k]); r.tiles = o.tiles.map(t => ({ i: t.i, j: t.j, L: t.L })); return r; };
function recipeWorldOf(hw, mt){
  const hi = new Map(), mi = new Map();
  for (const h of hw) h.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (hi.get(q) || hi.set(q, []).get(q)).push({ h, k }); });
  for (const l of mt) l.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (mi.get(q) || mi.set(q, []).get(q)).push({ l, k }); });
  return { hw, mt, hi, mi };
}
const recipeLines = () => ({ hw: highways.map(lineOf), mt: metros.map(lineOf) });
const recipeWorld = () => { const L = recipeLines(); return recipeWorldOf(L.hw, L.mt); };
const NB_FIELDS = { mega: 1, sections: 1, height: 1, lift: 1, _wallTris: 1 };
const _nbStub = i => new Proxy({}, { get(t, k){
  if (i && NB_FIELDS[k]) return k === 'mega' ? i.mega : k === 'sections' ? { length: i.sec } : k === 'height' ? i.height : k === '_wallTris' ? () => { if (!i.wt) return null; const o = []; for (let q = 0; q < i.wt.length; q += 3) o.push(new THREE.Vector3(i.wt[q], i.wt[q + 1], i.wt[q + 2])); return o; } : i.liftY === null ? null : { y: i.liftY };
  throw new Error('generation read a neighbor plot: ' + String(k)); } });
// the stand-in cell: the fields generation wrote on it, and in .data the plot's generated data; its non-enumerable _written lists the fields generation
// assigned (what a worker sends back besides the data)
function recipeGen(r, world){
  if (r.nbi) for (const [, , i] of r.nbi) if (i.nbrec){   // (a neighbor's triangles for a walkway: made again here, at the corridor the page worked out)
    const nd = recipeGen(Object.assign({}, i.nbrec.r, { draws: i.nbrec.draws }), world).data, [ax, az, bx, bz, y0] = i.nbrec.cor, flat = [];
    for (const v of corridorTris(nd.geo, ax, az, bx, bz, y0 + .2, y0 + .9)) flat.push(v.x, v.y, v.z);
    for (const g of nd.geo.values()) g.dispose();
    i.wt = flat; i.nbrec = null;
  }
  FX_REPLAY = r.draws || null; const tierWas = TIER.make;
  const raw = { height: CURB, topY: 0, group: null, ports: [], pads: [], emitters: [], lifts: [], sectionTops: [], firstFloors: 0 };
  for (const k of RECIPE_IN) if (r[k] !== undefined) raw[k] = structuredClone(r[k]);
  raw.dark = r.dark;   // (rebuildCell sets it before generating; the builders read it)
  const written = new Set(), c = new Proxy(raw, { set(t, k, v){ written.add(k); t[k] = v; return true; } });
  // `cells` answers from a table of its own while the plot is made: the plot, stand-ins for the plots round it. (Its methods are shadowed on the one map rather than the map emptied
  // and filled again: a caller further up may be going through it, and any builder asking for the plots as a whole would get an error, not the real city.)
  const table = new Map();
  table.set(ckey(c.i, c.j), c);
  const info = new Map(); if (r.nbi) for (const [a, b, i] of r.nbi) info.set(a + ',' + b, i);
  SIDES4.forEach(([a, b], q) => { if (r.nb[q]) table.set(ckey(c.i + a, c.j + b), _nbStub(info.get(a + ',' + b))); });
  for (const [k, i] of info){ const [a, b] = k.split(',').map(Number), kk = ckey(c.i + a, c.j + b); if (!table.has(kk)) table.set(kk, _nbStub(i)); }
  const whole = () => { throw new Error('generation asked for the plots as a whole'); };
  cells.get = k => table.get(k); cells.has = k => table.has(k); cells.values = cells.keys = cells.entries = cells.forEach = whole; cells[Symbol.iterator] = whole;
  const live = world ? { highways, hwIndex, metros, mtIndex } : null;
  if (world){ highways = world.hw; hwIndex = world.hi; metros = world.mt; mtIndex = world.mi; }
  DARK = r.dark; SIDE_SPLIT = true;
  try { TIER.make = true; raw.data = drain(collectGen(cellBody(c))); }
  finally { TIER.make = tierWas; DARK = false; SIDE_SPLIT = false; if (live){ highways = live.highways; hwIndex = live.hwIndex; metros = live.metros; mtIndex = live.mtIndex; }
    delete cells.get; delete cells.has; delete cells.values; delete cells.keys; delete cells.entries; delete cells.forEach; delete cells[Symbol.iterator]; }
  // (the one global generation writes besides its own buffers: the towers that may throw the air hologram; what a worker sends back is this flag)
  Object.defineProperty(raw, '_air', { value: airCells.has(c) }); airCells.delete(c);
  Object.defineProperty(raw, '_written', { value: [...written] });
  return raw;
}

/* ---------- a made plot as a message (round 9, item 2) ---------- */
// What recipeGen makes, as something structuredClone takes and a worker can hand over without copying: every geometry as its arrays (materials as ids: see matreg.js),
// the plot's own data with the three.js vectors and matrices as tagged numbers, objects that appear twice staying one object. recipeUnpack gives back what
// rebuildCell's collectGen returns, with the same fields on `fields` and the air flag.
function recipePack(raw, geoOnly){
  const xfer = new Set(), shared = new Map(), seen = new Map();
  const typed = a => { xfer.add(a.buffer); return a; };
  const count = v => {   // objects reached twice
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v)) return;
    if (seen.has(v)){ if (!shared.has(v)) shared.set(v, shared.size); return; }
    seen.set(v, 1);
    if (Array.isArray(v)) for (const x of v) count(x); else if (v.isVector3 || v.isMatrix4 || v.isVector2 || v.isColor) return; else for (const k in v) count(v[k]);
  };
  const open = new Set();
  const pk = v => {
    if (v === null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) return typed(v);
    let id = shared.get(v);
    if (id !== undefined && out.has(v)) return { $r: id };
    if (open.has(v)) throw new Error('recipePack: a cycle');
    let o;
    if (v.isVector3) o = { $v3: [v.x, v.y, v.z] };
    else if (v.isVector2) o = { $v2: [v.x, v.y] };
    else if (v.isMatrix4) o = { $m4: v.elements.slice() };
    else if (v.isColor) o = { $c: [v.r, v.g, v.b] };
    else if (Array.isArray(v)){ open.add(v); o = v.map(pk); open.delete(v); }
    else if (Object.getPrototypeOf(v) === Object.prototype){ open.add(v); o = {}; for (const k in v) o[k] = pk(v[k]); open.delete(v); }
    else throw new Error('recipePack: cannot send a ' + (v.constructor && v.constructor.name));
    if (id !== undefined){ out.set(v, id); return { $i: id, v: o }; }
    return o;
  };
  const out = new Map();
  count(raw.data.fol); count(raw.data.glows); count(raw.data.emitters); count(raw.data.pads); count(raw.data.ports); count(raw.data.spots);
  const fields = {}; for (const k of raw._written) if (k !== 'data') count(raw[k]);
  const packGeo = (key, g) => {
    const attrs = {}; for (const k in g.attributes){ const a = g.attributes[k]; attrs[k] = { a: typed(a.array), s: a.itemSize, n: a.normalized }; }
    const bs = g.boundingSphere, bb = g.boundingBox;
    const ud = {}; for (const k in g.userData){ count(g.userData[k]); }
    for (const k in g.userData) ud[k] = pk(g.userData[k]);
    return { key, attrs, index: g.index ? typed(g.index.array) : null, draw: [g.drawRange.start, g.drawRange.count], ud, bs: bs ? [bs.center.x, bs.center.y, bs.center.z, bs.radius] : null, bb: bb ? [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z] : null };
  };
  const geo = [];
  for (const [mat, g] of raw.data.geo){
    const key = mat === ATLAS ? -1 : MATREG.at.get(mat);
    if (key === undefined) throw new Error('recipePack: a material made after load (id ' + mat.id + ')');
    geo.push(packGeo(key, g));
  }
  const sgeo = raw.data.sgeo ? packGeo(-1, raw.data.sgeo) : null;
  // (the plot's footprint and walking maps, from its geometry, made here so the page need not: people.js cellGrid takes them from the data. Not for a plot inside a megastructure, whose maps come from the megastructure)
  let grids = null; if (!raw.mega && !geoOnly){ grids = plotMaps(raw.x, raw.z, raw.data); for (const k in grids) typed(grids[k]); }
  if (geoOnly) return { msg: { geo, sgeo }, xfer: [...xfer] };   // (a plot made again for its arrays: nothing else is wanted)
  const d = raw.data, msg = { draws: d.draws ? typed(d.draws) : null, grids, geo, sgeo, fol: pk(d.fol), glows: pk(d.glows), emitters: pk(d.emitters), pads: pk(d.pads), ports: pk(d.ports), spots: pk(d.spots), fields, air: raw._air };
  for (const k of raw._written) if (k !== 'data') fields[k] = pk(raw[k]);
  return { msg, xfer: [...xfer] };
}
function recipeUnpack(m){
  const table = new Map();
  const up = v => {
    if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
    if (v.$r !== undefined) return table.get(v.$r);
    if (v.$i !== undefined){ const o = up(v.v); table.set(v.$i, o); return o; }
    if (v.$v3) return new THREE.Vector3(v.$v3[0], v.$v3[1], v.$v3[2]);
    if (v.$v2) return new THREE.Vector2(v.$v2[0], v.$v2[1]);
    if (v.$m4){ const x = new THREE.Matrix4(); x.elements = v.$m4; return x; }
    if (v.$c) return new THREE.Color(v.$c[0], v.$c[1], v.$c[2]);
    if (Array.isArray(v)) return v.map(up);
    const o = {}; for (const k in v) o[k] = up(v[k]); return o;
  };
  const unGeo = e => {
    const g = new THREE.BufferGeometry();
    for (const k in e.attrs){ const a = e.attrs[k]; g.setAttribute(k, new THREE.BufferAttribute(a.a, a.s, a.n)); }
    if (e.index) g.setIndex(new THREE.BufferAttribute(e.index, 1));
    g.setDrawRange(e.draw[0], e.draw[1]);
    for (const k in e.ud) g.userData[k] = up(e.ud[k]);
    if (e.bs){ g.boundingSphere = new THREE.Sphere(new THREE.Vector3(e.bs[0], e.bs[1], e.bs[2]), e.bs[3]); }
    if (e.bb){ g.boundingBox = new THREE.Box3(new THREE.Vector3(e.bb[0], e.bb[1], e.bb[2]), new THREE.Vector3(e.bb[3], e.bb[4], e.bb[5])); }
    return g;
  };
  const geo = new Map();
  for (const e of m.geo){
    const mat = e.key === -1 ? ATLAS : MATREG.list[e.key];
    if (!mat) throw new Error('recipeUnpack: no material ' + e.key);
    geo.set(mat, unGeo(e));
  }
  const data = { geo, sgeo: m.sgeo ? unGeo(m.sgeo) : null, fol: up(m.fol), glows: up(m.glows), emitters: up(m.emitters), pads: up(m.pads), ports: up(m.ports), spots: up(m.spots) };
  const fields = {}; for (const k in m.fields) fields[k] = up(m.fields[k]);
  if (m.grids) data.grids = m.grids;
  return { data, fields, air: m.air, draws: m.draws };
}

// the load-time materials as one number (the worker and the page must agree before the worker is used: same ids for the same materials)
function recipeMatSig(){ let h = 2166136261; for (const m of MATREG.list){ const t = m.id + ':' + m.type + ':' + (m.color ? m.color.getHex() : '') + ':' + (m.emissive ? m.emissive.getHex() : '') + ';'; for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } } return (h >>> 0) + ':' + MATREG.list.length; }
MATREG.open = false;

// The rounded boxes (core.js roundedBox) are cached by their sizes to two places of decimals, and a later box of nearly the same size takes the first one's shape, so what a
// plot looks like by a few thousandths depends on which plot asked first. To make a plot the same in the worker as on the page, the two keep one cache: each request
// carries the shapes the page has made since the last one, each answer the shapes the worker has made, and when both made one the page's stands.
const rbPack = (g, copy) => { const a = {}; for (const k in g.attributes){ const t = g.attributes[k]; a[k] = { a: copy ? t.array.slice() : t.array, s: t.itemSize, n: t.normalized }; } return { a, i: g.index ? (copy ? g.index.array.slice() : g.index.array) : null }; };
const rbUnpack = e => { const g = new THREE.BufferGeometry(); for (const k in e.a) g.setAttribute(k, new THREE.BufferAttribute(e.a[k].a, e.a[k].s, e.a[k].n)); if (e.i) g.setIndex(new THREE.BufferAttribute(e.i, 1)); return g; };
const sameArr = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

/* ---------- the worker, from the page ---------- */
// RW.request(job) sends a plot's recipe; the result is picked up by stageStep (world.js). Not used (plots are made on the page as before) when the test
// 'plots made on the page (as before)' is on, before the worker has loaded and agreed on its materials, after any error from it, and in the perf harness
// (whose scripted clock and seeded random stream a thread of its own would break) unless window.__GEN_WORKER is set.
const RW = { rbSent: new Set(), w: null, state: 'off', next: 1, jobs: new Map(), lastWorld: '', error: null, made: 0, fell: 0, grids: 0, src: document.currentScript ? document.currentScript.src : null };
const genMain = () => !!(PH.tests.genMain || window.__GEN_MAIN);
RW.usable = () => RW.state === 'ready' && !genMain();
RW.start = () => {
  if (RW.w || RW.state !== 'off' || typeof Worker === 'undefined' || !RW.src) return;
  if (window.__realNow && !window.__GEN_WORKER) return;
  const scripts = [...document.scripts].map(s => s.src).filter(Boolean);
  const three = scripts.find(u => /three(\.min)?\.js/.test(u)), bgu = scripts.find(u => /BufferGeometryUtils/.test(u));
  const names = ['matreg', 'core', 'sprites', 'buildings', 'ground', 'vehicles', 'sky', 'audio', 'world', 'mega', 'people', 'highway', 'metro', 'recipe'];
  const urls = names.map(n => scripts.find(u => u.includes('/js/' + n + '.js'))); if (!three || urls.some(u => !u)) return;
  RW.state = 'loading';
  try { RW.w = new Worker(RW.src.replace('recipe.js', 'recipeworker.js')); } catch (e){ RW.state = 'failed'; RW.error = String(e); return; }
  RW.w.onerror = e => { RW.state = 'failed'; RW.error = e.message || 'worker error'; for (const j of RW.jobs.values()) j.fail = true; RW.jobs.clear(); };
  RW.w.onmessage = e => {
    const m = e.data;
    if (m.t === 'ready'){
      if (m.sig !== recipeMatSig()){ RW.state = 'failed'; RW.error = 'materials differ: ' + m.sig + ' vs ' + recipeMatSig(); RW.w.terminate(); return; }
      RW.state = 'ready';
    } else if (m.t === 'err' && m.id === undefined){
      RW.state = 'failed'; RW.error = m.err; RW.w.terminate();
    } else if (m.t === 'done' || m.t === 'err'){
      if (m.rb) for (const [k, e] of m.rb){ const mine = rbCache.get(k); if (!mine){ rbCache.set(k, rbUnpack(e)); RW.rbSent.add(k); } else if (!sameArr(mine.attributes.position.array, e.a.position.a)) RW.rbSent.delete(k); else RW.rbSent.add(k); }
      const j = RW.jobs.get(m.id); RW.jobs.delete(m.id); if (!j || j.cancelled) return;
      if (j.regen){ const h = j.regen; if (m.t === 'err'){ h.wait = null; h.fails = (h.fails || 0) + 1; RW.fell++; return; } if (h.c.data === h.d && (h.out || pmNeeds(h, 'stand'))){ PM.async++; pmFill(h, recipeUnpack(m.msg).data); } else h.wait = null; return; }
      if (m.t === 'err'){ j.fail = m.err; RW.fell++; } else { j.res = m; RW.made++; }
      j.done = true;
    }
  };
  RW.w.postMessage({ t: 'init', three, urls: [bgu].concat(urls) });
};
RW.sendWorld = () => {
  const L = recipeLines(), s = JSON.stringify(L);
  if (s !== RW.lastWorld){ RW.lastWorld = s; RW.w.postMessage({ t: 'world', hw: L.hw, mt: L.mt }); }
};
// a job {c, ...}: gets job.rw = { done, res, fail, cancelled }
RW.request = (job, skipWorld) => {
  const id = RW.next++, rw = { id, done: false, res: null, fail: null, cancelled: false };
  job.rw = rw; RW.jobs.set(id, rw);
  if (!skipWorld) RW.sendWorld();   // (loading a city sends the lines once, then asks for plots)
  const r = recipeOf(job.c); job.dark = r.dark; job.r = r;
  const m = { t: 'gen', id, r, far: { lean: !!(PH.tests.leanRound || window.__LEAN_ROUND), sticks: !!(PH.tests.thinSticks || window.__THIN_STICKS) } };
  m.rb = []; for (const [k, g] of rbCache) if (!RW.rbSent.has(k)){ RW.rbSent.add(k); m.rb.push([k, rbPack(g, false)]); }   // (structured clone copies them)
  if (window.__randState) m.rs = window.__randState();
  RW.w.postMessage(m);
};
// the worker makes a plot again for its arrays (the answer goes to pmFill, not to a stage job)
RW.regen = (h, r) => {
  const id = RW.next++, rw = { id, done: false, res: null, fail: null, cancelled: false, regen: h }; RW.jobs.set(id, rw);
  RW.sendWorld();
  const m = { t: 'gen', id, r, far: { lean: !!(PH.tests.leanRound || window.__LEAN_ROUND), sticks: !!(PH.tests.thinSticks || window.__THIN_STICKS) }, rb: [], regen: true };
  for (const [k, g] of rbCache) if (!RW.rbSent.has(k)){ RW.rbSent.add(k); m.rb.push([k, rbPack(g, false)]); }
  RW.w.postMessage(m);
};
RW.cancel = job => { if (job.rw){ job.rw.cancelled = true; RW.jobs.delete(job.rw.id); job.rw = null; } };
RW.line = () => 'plot worker: ' + (genMain() ? 'off (test)' : RW.state) + (RW.error ? ' (' + RW.error + ')' : '') + '; made ' + RW.made + ', fell back ' + RW.fell + ', walking maps taken from it ' + RW.grids;
// (started as soon as this script is read, so the worker loads the game's scripts while the page does: loading a city from recipes, loadcity.js, wants it ready)
if (!self.IN_RECIPE_WORKER) setTimeout(RW.start, 0);

// what a plot's data needs to be made again, exactly: its recipe and the random draws of its generation (a few KB a plot)
function attachRec(data, r, draws){
  data.rec = { r, draws }; data.draws = null;
  if (!data.grids && r && !r.mega) data.grids = plotMaps(r.x, r.z, data);   // (its walking maps, from its geometry while the arrays are there: cellGrid takes them)
}

/* ---------- a plot's own vertex arrays: let go once the plot is merged into its block, made again when something reads them (round 9, item 4) ---------- */
// The plots' own geometry (the arrays of every plot's one big atlas mesh) is 1,065 MB of the 2,490 MB the page holds in the biggest city, and once a plot is merged into its block
// (world.js rebuildSolidGen) nothing reads it until the block is merged again, the plot is swept in or out, or the never-seen job works the plot out. A plot made from its recipe
// and the draws of its generation (js/recipe.js) comes out the same to the byte, so its arrays can be let go and made again.
// pmDrop(c) replaces the vertex attributes' arrays by accessors that make the plot again (on the page, at once) when something reads one: any reader works, slowly; the ones
// that matter ask in good time (pmEnsure: the worker makes the plot, the arrays arrive a few frames later) and the count of slow ones is in PM.sync. The index stays (the
// never-seen job reorders it, and it is the smaller part). Test: "keep the plots' own geometry" (PH.tests.keepGeo, window.__KEEP_GEO).
const PM = { keys: ['position', 'normal', 'color', 'aEm', 'aFlk', 'aFine', 'aOn'], queue: [], frame: 0, dropped: 0, sync: 0, async: 0, why: {}, trace: false, held: new Set() };
PM.on = () => !(PH.tests.keepGeo || window.__KEEP_GEO) && !self.IN_RECIPE_WORKER;
PM.line = () => 'plot arrays: ' + (PM.on() ? 'let go after merging' : 'kept (test)') + '; dropped ' + PM.dropped + ', made again by the worker ' + PM.async + ', on the page ' + PM.sync;
const pmHolder = c => { const d = c.data; return d.pm || (d.pm = { c, d, out: false, sout: false, wait: null, due: -1, queued: false }); };
// (out: the full tier's arrays are let go; sout: the stand-in's are, or there is no stand-in yet, which is made from the recipe like any array that is let go)
function pmDropOne(h, g){
  for (const k of PM.keys){
    const a = g.attributes[k]; if (!a || !a.array) continue;
    Object.defineProperty(a, 'array', { configurable: true, enumerable: true,
      get(){ pmRestoreSync(h, k); return a.array; },
      set(v){ Object.defineProperty(a, 'array', { value: v, writable: true, configurable: true, enumerable: true }); } });
  }
}
function pmDrop(c){
  const d = c && c.data; if (!d || !d.rec || !d.rec.r || !PM.on()) return;
  const g = d.geo.get(ATLAS), h = pmHolder(c);
  if (g && !h.out){ pmDropOne(h, g); h.out = true; PM.dropped++; }
  if (d.sgeo && !h.sout){ pmDropOne(h, d.sgeo); h.sout = true; PM.dropped++; }
  h.due = -1;
}
// the arrays are back in the plot's attributes (and the stand-in is there, if it was missing)
function pmFill(h, nd){
  const d = h.d, ng = nd.geo.get(ATLAS), g = d.geo.get(ATLAS);
  if (h.out && g && ng){ for (const k of PM.keys){ const a = g.attributes[k]; if (a) a.array = ng.attributes[k].array; } h.out = false; }
  if (nd.sgeo){
    if (!d.sgeo){ d.sgeo = nd.sgeo; h.sout = false; }
    else if (h.sout){ for (const k of PM.keys){ const a = d.sgeo.attributes[k]; if (a) a.array = nd.sgeo.attributes[k].array; } h.sout = false; }
  }
  h.wait = null; h.due = PM.frame + 90;   // (let go again if nothing keeps asking)
  if (!h.queued){ h.queued = true; PM.queue.push(h); }
}
function pmRestoreSync(h, why){
  if (!h.out && !pmNeeds(h, 'stand')) return;
  PM.sync++; PM.why[why] = (PM.why[why] || 0) + 1;
  if (PM.trace){ const st = new Error().stack.split('\n').slice(2, 7).map(x => x.replace(/.*\//, '').replace(/\)$/, '')).join(' < '); PM.stacks = PM.stacks || new Map(); PM.stacks.set(st, (PM.stacks.get(st) || 0) + 1); }
  const rec = h.d.rec, prev = stageCap();   // (a reader can be a builder in the middle of making another plot: its globals are put back, as between the steps of a staged plot)
  let nd; try { nd = recipeGen(Object.assign({}, rec.r, { draws: rec.draws }), recipeWorld()).data; } finally { stageApply(prev); }
  pmFill(h, nd); for (const g of nd.geo.values()) g.dispose(); if (nd.sgeo && h.d.sgeo !== nd.sgeo) nd.sgeo.dispose();
}
// are the arrays of that tier not there ('full': let go; 'stand': let go, or the stand-in has not been made)
const pmNeeds = (h, which) => which === 'stand' ? (!h.d.sgeo || h.sout) : h.out;
// ask for a tier's arrays without waiting: true when they are there. The worker makes the plot; until it answers this is false (ask again later).
function pmEnsure(c, which = 'full'){
  const d = c.data; if (!d || !d.rec || !d.rec.r) return true;
  const h = pmHolder(c); if (!pmNeeds(h, which)) return true;
  if (h.wait) return false;
  if (!RW.usable() || (h.fails || 0) >= 2){ pmRestoreSync(h, 'ensure'); return true; }   // (no worker, or it could not make this one twice: here, at once)
  h.wait = true; const rec = d.rec;
  RW.regen(h, Object.assign({}, rec.r, { draws: rec.draws }));
  return false;
}
// a plot's arrays are to be let go in `delay` frames (it has just been merged into its block, or the arrays were made again for a reader)
function pmSchedule(c, delay = 0){
  const d = c.data; if (!d || !d.rec || !d.rec.r || !d.geo.get(ATLAS) || !PM.on()) return;
  const h = pmHolder(c);
  h.due = PM.frame + delay; if (!h.queued){ h.queued = true; PM.queue.push(h); }
}
// each frame: let go of the plots whose time is up (not while something is working on them)
function pmTick(){
  PM.frame++;
  for (let i = 0; i < PM.queue.length; i++){ const h = PM.queue[i];
    if (h.due >= 0 && PM.frame >= h.due){ PM.queue.splice(i--, 1); h.queued = false; if (h.c.data === h.d){ if (pmBusy(h.c)){ h.due = PM.frame + 30; h.queued = true; PM.queue.push(h); } else pmDrop(h.c); } } else if (h.c.data !== h.d){ PM.queue.splice(i--, 1); h.queued = false; } }
}
// is something about to read the plot's arrays: the never-seen job has not been through it yet (it reorders the triangles and may work the plot out), its block is to be merged or is
// being merged, it is being swept
function pmBusy(c){
  const g = c.data.geo.get(ATLAS); if (!g) return false;
  if (!NV.off() && !c.mega && !c.lift && g.userData.cut && c._nvGeo !== g && NV.dbReady) return true;
  const k = mergeKey(c.i, c.j); if (solidDirty.has(k) || (SOLID_JOB && SOLID_JOB.key === k)) return true;
  return !!c.animating;
}
// every plot of a merge block has the arrays its tier needs: asks the worker for the ones that are not (false until all have come); held for the merge once they are
function pmBlockReady(key){
  const [a, b] = key.split(',').map(Number); let ok = true; const which = tierOfKey(key);
  for (let i = a*MREG; i < a*MREG + MREG; i++) for (let j = b*MREG; j < b*MREG + MREG; j++){
    const c = cells.get(ckey(i, j)); if (!c || !c.data || !c.data.rec) continue;
    const h = pmHolder(c);
    if (pmNeeds(h, which)){ if (!pmEnsure(c, which)) ok = false; } else if (h.queued) h.due = Math.max(h.due, PM.frame + 600);
  }
  return ok;
}
