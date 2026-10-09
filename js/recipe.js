// A plot's recipe (round 9): what generation needs of a plot, and nothing else. Its own saved fields (seed and zone of each section, a lift's height, the
// pod below, its style and greenery, a megastructure's id), whether the four plots beside it exist (the only neighbor the builders look at: open edges get
// railings, pads and plants) and whether it is a dark street. Everything else generation touches (the highway and metro lines, the megastructures, the
// settings) is global and not part of the recipe: see tools/perf/recipe_proof.py for how that was checked.
// recipeGen(r) makes the plot from the recipe alone, on a stand-in cell in a map holding only the plot and stand-ins for its four neighbors that throw when read,
// so a builder reading any neighbor field fails loudly. Same steps as rebuildCell, nothing of the live city changed.
const RECIPE_IN = ['i', 'j', 'x', 'z', 'green', 'style', 'mega', 'park', 'sections', 'below', 'lift'];
function recipeOf(c){
  const r = { nb: SIDES4.map(([a, b]) => cells.has(ckey(c.i + a, c.j + b)) ? 1 : 0), dark: isDarkPlot(c) };
  for (const k of RECIPE_IN) if (c[k] !== undefined) r[k] = structuredClone(c[k]);
  // two builders look at the plots around beyond the four edges. A pod on a scaffold (liftSupports) asks of each side what its neighbor rises to: whether it is
  // a megastructure, how many sections it has, its height and its own pod's deck. A tower that may throw the air-filter hologram (rooftopBoard) asks the heights of
  // the three plots in front of each of its four faces (twelve plots, corners included). Those are the plots listed in nbi, with only those fields.
  const key = c.i + ',' + c.j, air = window.AIR_FORCE === key || (!(window.WALL_FORCE === key || hash('wallholo', c.i, c.j) % WALL_HOLO_ODDS === 0) && hash('airholo', c.i, c.j) % AIR_HOLO_ODDS === 0);
  const at = [];
  if (c.lift) for (const [a, b] of SIDES4) at.push([a, b]);
  if (air) for (const [a, b] of SIDES4) for (let l = -1; l <= 1; l++) at.push([a + (a ? 0 : l), b + (b ? 0 : l)]);
  if (at.length){ r.nbi = []; for (const [a, b] of at){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n && !r.nbi.some(e => e[0] === a && e[1] === b)) r.nbi.push([a, b, { mega: !!n.mega, sec: n.sections.length, height: n.height, liftY: n.lift ? n.lift.y : null }]); } }
  return r;
}
// The lines the plots sit under. Not part of one plot's recipe (a line is long), a copy of the highways and metros as plain data, made when they change, and
// the indexes over them (what hwAt and mtAt answer). recipeGen swaps these in for the live ones while it runs.
const plain = v => Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? (Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).filter(([k, x]) => typeof x !== 'function' && !(x && typeof x === 'object' && Object.getPrototypeOf(x) !== Object.prototype && !Array.isArray(x))).map(([k, x]) => [k, plain(x)])) : undefined) : v;
function recipeWorld(){
  const hw = plain(highways), mt = plain(metros), hi = new Map(), mi = new Map();
  for (const h of hw) h.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (hi.get(q) || hi.set(q, []).get(q)).push({ h, k }); });
  for (const l of mt) l.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (mi.get(q) || mi.set(q, []).get(q)).push({ l, k }); });
  return { hw, mt, hi, mi };
}
const NB_FIELDS = { mega: 1, sections: 1, height: 1, lift: 1 };
const _nbStub = i => new Proxy({}, { get(t, k){
  if (i && NB_FIELDS[k]) return k === 'mega' ? i.mega : k === 'sections' ? { length: i.sec } : k === 'height' ? i.height : i.liftY === null ? null : { y: i.liftY };
  throw new Error('generation read a neighbor plot: ' + String(k)); } });
// the stand-in cell: the fields generation wrote on it, and in .data the plot's generated data; its non-enumerable _written lists the fields generation
// assigned (what a worker sends back besides the data)
function recipeGen(r, world){
  const raw = { height: CURB, topY: 0, group: null, ports: [], pads: [], emitters: [], lifts: [], sectionTops: [], firstFloors: 0 };
  for (const k of RECIPE_IN) if (r[k] !== undefined) raw[k] = structuredClone(r[k]);
  raw.dark = r.dark;   // (rebuildCell sets it before generating; the builders read it)
  const written = new Set(), c = new Proxy(raw, { set(t, k, v){ written.add(k); t[k] = v; return true; } });
  const save = [...cells]; cells.clear();
  cells.set(ckey(c.i, c.j), c);
  const info = new Map(); if (r.nbi) for (const [a, b, i] of r.nbi) info.set(a + ',' + b, i);
  SIDES4.forEach(([a, b], q) => { if (r.nb[q]) cells.set(ckey(c.i + a, c.j + b), _nbStub(info.get(a + ',' + b))); });
  for (const [k, i] of info){ const [a, b] = k.split(',').map(Number), kk = ckey(c.i + a, c.j + b); if (!cells.has(kk)) cells.set(kk, _nbStub(i)); }
  const live = world ? { highways, hwIndex, metros, mtIndex } : null;
  if (world){ highways = world.hw; hwIndex = world.hi; metros = world.mt; mtIndex = world.mi; }
  DARK = r.dark; SIDE_SPLIT = true;
  try { raw.data = drain(collectGen(cellBody(c))); }
  finally { DARK = false; SIDE_SPLIT = false; if (live){ highways = live.highways; hwIndex = live.hwIndex; metros = live.metros; mtIndex = live.mtIndex; } cells.clear(); for (const [k, v] of save) cells.set(k, v); }
  // (the one global generation writes besides its own buffers: the towers that may throw the air hologram; what a worker sends back is this flag)
  Object.defineProperty(raw, '_air', { value: airCells.has(c) }); airCells.delete(c);
  Object.defineProperty(raw, '_written', { value: [...written] });
  return raw;
}
