// Neon Terrarium: the Magrail metro. An elevated maglev line at one fixed height (level with the hydroponic farm's
// glass roof), after the reference: a guideway on pillars, an overhead box girder carried on C-frames, green circuit
// traces along it and MAGRAIL GREEN LINE boards; a three-car train, its windows and belt lines lit green, hanging from
// the girder overhead on its magnets, floating clear of the deck (an upside-down maglev). Stations: platforms either side under a canopy, screen doors, a lift down to the street.
// The train shuttles from end to end, stopping at every station, and lets visitors out at the ones with a lift.
// All game scripts share one scope and load in order (see index.html); this one after highway.js, whose line geometry
// (hwDirs, hwCenter, hwSweep, hwSeg, hwFold, hwAlong) it shares.
'use strict';
// A line: { id, tiles: [{ i, j }], done, st: [k, ...] (the stops along the way; the two ends are stops of their own once
// it's finished), sides: { k: +1|-1|0 } (each stop's lift side, 0 for none) }. It's built like a highway: click a plot to
// start (the first station), click next to its end to extend it, click the end piece to finish it (the last station).
const MT_SAVE_KEY = 'neonIsland.metros';
const MT_Y = hwY(12);                            // the rail's height: level with the hydroponic farm's glass ridge (12 floors)
const MT_W = 1.0, MT_DECK = .26, MT_GIRD = .32;  // the guideway: width, deck depth, the girder under it
const MT_CLEAR = MT_DECK + MT_GIRD + .08;        // from the rail down to the clear space under it
const MT_OH = 1.46, MT_OHT = .36, MT_OL = 0;     // the overhead girder: its underside above the rail, its depth, how far it sits to one side (none: right over the train)
const MT_LIFT_R = .42, MT_LIFT_OFF = SIDE/2 + .47;   // a station lift's shaft: wide enough for two or three people at once (a sprite cell is .67 across), out in the street beside the station
const MT_SY = 1.35;                               // the cars are built short and stretched up by this (tall enough inside for anyone)
const MT_DOOR_W = .64, MT_DOOR_H = .95;           // a door: wider and taller than the biggest person (a sprite cell is .67 by .89)
const MT_CAB_DOOR = -.265;                        // where a cab car's door is, along it
const MT_LEV = .12 - .12*MT_SY;                   // (the cars' floors level with the platforms)                              // how high the train floats: it hangs from the girder on its magnets, clear of the deck
const MT_TOP = MT_Y + 2.3;                       // the top of it all (the stations' canopies)
const MT_CL = 1.45, MT_GAP = .06, MT_CARS = 3;    // a car's length, the gap between cars, cars to a train
const MT_PLAT = .75;                             // a platform's width, each side
const MT_VMAX = 2.8, MT_ACC = .9, MT_DWELL = 5;  // the train: top speed, acceleration, seconds at a stop
let metros = [], mtNext = 1, mtIndex = new Map();
let mtMode = false, mtActive = null;
function mtReindex(){ mtIndex = new Map(); for (const l of metros) l.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (mtIndex.get(q) || mtIndex.set(q, []).get(q)).push({ l, k }); }); }
const mtAt = (i, j) => mtIndex.get(hwKey(i, j)) || [];
const mtStraight = (l, k) => { const { din, dout } = hwDirs(l, k); return din[0] === dout[0] && din[1] === dout[1]; };
// every stop along a line, in order: the first plot always, the middle ones, the last once finished
function mtStops(l){ const n = l.tiles.length, s = new Set([0, ...l.st.filter(k => k > 0 && k < n - 1)]); if (l.done && n > 1) s.add(n - 1); return [...s].sort((a, b) => a - b); }
const mtIsStop = (l, k) => k === 0 || (l.done && k === l.tiles.length - 1) || l.st.includes(k);
// would a sky highway deck at height y clear the metro on the same plot (well under it, or well over it)?
const mtHwClear = y => y + 1.25 <= MT_Y - MT_CLEAR || y - HW_CLEAR >= MT_TOP + .3;
function mtSamples(l, step = .3){
  const out = [], n = l.tiles.length;
  for (let k = 0; k < n; k++){
    const len = mtStraight(l, k) ? LOT : PI*LOT/4, m = Math.max(4, Math.ceil(len/step));
    for (let q = 0; q < m + (k === n - 1 ? 1 : 0); q++){ const u = q/m, c = hwCenter(l, k, u); out.push({ x: c.x, y: MT_Y, z: c.z, tx: c.tx, tz: c.tz, k, u }); }
  }
  return out;
}

/* ---------- where it may go ---------- */
// can a metro plot sit at (i, j)? (its height is fixed: what's in the way stays in the way)
function mtTileWhy(i, j){
  if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX) return 'off the map';
  const c = cells.get(ckey(i, j));
  if ((c && c.mega) || hwMegaNear(i, j)) return 'not over or right beside a megastructure';
  if (c && MT_Y - MT_CLEAR < hwSurface(c)) return 'a building is too tall here: the metro runs at a fixed height';
  if (mtAt(i, j).length) return 'a metro line is already here';
  for (const { h, k } of hwAt(i, j)) if (!mtHwClear(hwY(h.tiles[k].L))) return 'a sky highway is in the way at this height';
  if (mtHwRampHere(i, j)) return 'a sky highway\'s ramp is in the way';
  return null;
}
// is (i, j) the plot just past a highway's end, where its sky ramp climbs through the metro's height?
function mtHwRampHere(i, j){
  for (const h of highways){
    const n = h.tiles.length, t0 = h.tiles[0], e = h.tiles[n - 1], a = hwDirs(h, 0).din;
    const hit = L => { const lo = hwY(L) - HW_CLEAR, hi = hwY(L) + HW_RAMP + 2.5; return hi > MT_Y - MT_CLEAR && lo < MT_TOP + .3; };
    if (t0.i - a[0] === i && t0.j - a[1] === j && hit(t0.L)) return true;
    if (h.done && n > 1){ const o = hwDirs(h, n - 1).dout; if (e.i + o[0] === i && e.j + o[1] === j && hit(e.L)) return true; }
  }
  return false;
}
// a station's lift down to the street: a glass shaft beside its plot, in the street band on one side
function mtLiftSpot(l, k, side){
  const t = l.tiles[k], { dout } = hwDirs(l, k), rx = -dout[1]*side, rz = dout[0]*side, off = MT_LIFT_OFF, r = MT_LIFT_R;
  const sx = t.i*LOT + rx*off, sz = t.j*LOT + rz*off;
  return { sx, sz, r, dx: dout[0], dz: dout[1], rx, rz, wall: { x: sx + dout[0]*(r + .02), z: sz + dout[1]*(r + .02) }, stand: { x: sx + dout[0]*(r + .34), z: sz + dout[1]*(r + .34) } };
}
function mtLiftOK(l, k, side){
  const S_ = mtLiftSpot(l, k, side), c = cells.get(ckey(Math.round(S_.stand.x/LOT), Math.round(S_.stand.z/LOT))), c2 = cells.get(ckey(Math.round(S_.sx/LOT), Math.round(S_.sz/LOT)));
  if (!c || !c2 || c.mega || c2.mega) return false;
  if (!freeAt(cellGrid(c2), S_.sx, S_.sz)) return false;
  for (const l2 of metros) for (const k2 of mtStops(l2)){ if (l2 === l && k2 === k) continue; const s2 = l2.sides && l2.sides[k2]; if (!s2) continue; const o = mtLiftSpot(l2, k2, s2); if (Math.hypot(o.sx - S_.sx, o.sz - S_.sz) < .8) return false; }
  if (mtShaftHitsHw(S_.sx, S_.sz, S_.r)) return false;   // (no sky highway's deck through the shaft)
  return freeAt(cellGrid(c), S_.stand.x, S_.stand.z);
}
const MT_SHAFT_TOP = MT_Y + 1.6;   // the top of a station's lift shaft, its cap and all
// does any sky highway's deck (or its ramps) pass through a lift shaft at (x, z), below the shaft's top?
function mtShaftHitsHw(x, z, r){
  for (const h of highways){
    const reach = hwWidth(h)/2 + r + .15;
    for (const p of hwSamples(h, .4)) if (Math.abs(p.x - x) < reach && Math.abs(p.z - z) < reach && Math.hypot(p.x - x, p.z - z) < reach && p.y - HW_CLEAR < MT_SHAFT_TOP + .2) return true;
  }
  return false;
}
// every station lift shaft standing, as [x, z, r]
function mtShafts(){ const out = []; for (const l of metros) for (const k of mtStops(l)){ const s = l.sides && l.sides[k]; if (!s) continue; const L = mtLiftSpot(l, k, s); out.push([L.sx, L.sz, L.r]); } return out; }
// would a line starting at (i, j) have room for its first station's lift (on either side, whichever way it then goes)?
function mtEndLiftOK(i, j){
  for (const d of SIDES4){ const l = { tiles: [{ i, j }], dir0: d, sides: {}, st: [] }; for (const sd of [1, -1]) if (mtLiftOK(l, 0, sd)) return true; }
  return false;
}
// each stop's lift side: kept if it still fits, else whichever side fits (or none: a stop without a lift lets nobody off)
function mtSides(l){
  const old = l.sides || {}; l.sides = {};
  for (const k of mtStops(l)){ let s = 0; for (const c of [old[k], 1, -1]) if (c && mtLiftOK(l, k, c)){ s = c; break; } l.sides[k] = s; }
}
const mtLiftCell = (l, k) => { const s = l.sides && l.sides[k]; if (!s) return null; const L = mtLiftSpot(l, k, s); return [Math.round(L.sx/LOT), Math.round(L.sz/LOT)]; };
// what a click would do in metro mode: { type: 'start'|'extend'|'finish'|'stop'|'unstop'|'none', ok, why, ... }
function mtTargetAt(pk){
  if (!pk) return null;
  if (pk.kind === 'mtTile'){
    const l = pk.l, k = pk.k, n = l.tiles.length;
    if (!l.done && k === n - 1){
      if (n < 2) return { type: 'none', l, k, ok: false, why: 'extend it to the next plot first' };
      const why = [1, -1].some(sd => mtLiftOK(l, k, sd)) ? '' : 'no room here for the station\'s lift down to the street';   // (and ends at one)
      return { type: 'finish', l, k, ok: !why, why };
    }
    if (k > 0 && k < n - 1){
      if (l.st.includes(k)) return { type: 'unstop', l, k, ok: true, why: '' };
      let why = !mtStraight(l, k) ? 'stations only go on straight track' : [k - 1, k + 1].some(q => mtIsStop(l, q)) ? 'too close to another station' : null;
      return { type: 'stop', l, k, ok: !why, why: why || '' };
    }
    return { type: 'none', l, k, ok: false, why: '' };
  }
  const { i, j } = pk;
  for (const l of metros){
    if (l.done) continue;
    const n = l.tiles.length, e = l.tiles[n - 1];
    if (Math.abs(e.i - i) + Math.abs(e.j - j) !== 1) continue;
    const pv = l.tiles[n - 2]; if (pv && pv.i === i && pv.j === j) continue;
    let why = mtTileWhy(i, j);
    if (!why && n === 1){   // the first station's lift has to fit beside the track running this way
      l.tiles.push({ i, j }); const fits = [1, -1].some(sd => mtLiftOK(l, 0, sd)); l.tiles.pop();   // (tried with the plot added, then put back)
      if (!fits) why = 'the first station\'s lift has no room if the line goes this way';
    }
    return { type: 'extend', l, i, j, ok: !why, why };
  }
  let why = mtTileWhy(i, j);
  if (!why && !mtEndLiftOK(i, j)) why = 'no room here for the station\'s lift down to the street';   // (a line starts at a station people can get off at)
  return { type: 'start', i, j, ok: !why, why };
}

/* ---------- making changes ---------- */
function mtTouched(l){ const out = l.tiles.map(t => [t.i, t.j]); for (const k of mtStops(l)){ const c = mtLiftCell(l, k); if (c) out.push(c); } return out; }
function mtCommit(l, touched){
  mtReindex();
  if (l){ mtSides(l); touched = touched.concat(mtTouched(l)); mtBuildView(l); mtResetTrain(l); }
  const list = [...new Set(touched.map(([i, j]) => cells.get(ckey(i, j))).filter(Boolean))];
  refresh(list);   // its pillars and lift shafts stand on the plots (see mtFeet), so the walking paths go round them
  shadowDirty = true;
}
function mtApply(t){
  if (!t || !t.ok) return false;
  if (t.type === 'start'){
    const l = { id: mtNext++, tiles: [{ i: t.i, j: t.j }], done: false, st: [], sides: {} };
    metros.push(l); mtActive = l; mtCommit(l, []);
  } else if (t.type === 'extend'){
    const l = t.l; l.tiles.push({ i: t.i, j: t.j }); mtActive = l; mtCommit(l, []);
  } else if (t.type === 'finish'){
    const l = t.l; l.done = true; mtActive = l; mtCommit(l, []);
  } else if (t.type === 'stop' || t.type === 'unstop'){
    const l = t.l, before = mtTouched(l);
    l.st = t.type === 'stop' ? [...l.st, t.k] : l.st.filter(k => k !== t.k); mtActive = l; mtCommit(l, before);
  } else return false;
  sfx.play('place'); return true;
}
// right-click a metro plot: from its first plot the whole line goes; from anywhere further on, that plot and the rest of
// the line beyond it go (the last station included), and what's left is open again to be extended
function mtCutAt(l, k, quiet){
  if (k === 0) return mtRemove(l, quiet);
  const touched = mtTouched(l);
  l.tiles = l.tiles.slice(0, k); l.st = l.st.filter(q => q < k - 1); l.done = false; mtActive = l;   // (the plot before the cut is the open end now: no station there yet)
  if (quiet){ mtReindex(); mtSides(l); mtBuildView(l); mtResetTrain(l); } else { mtCommit(l, touched); sfx.play('remove'); }
  return touched;
}
function mtRemove(l, quiet){
  const touched = mtTouched(l);
  metros = metros.filter(q => q !== l); if (mtActive === l) mtActive = null;
  mtDropView(l); l.train = null;
  if (!quiet){ mtCommit(null, touched); sfx.play('remove'); } else mtReindex();
  return touched;
}
function mtClearAll(){ for (const l of metros) mtDropView(l); metros = []; mtActive = null; mtReindex(); }
function mtSave(){ try { localStorage.setItem(MT_SAVE_KEY, JSON.stringify(metros.map(l => ({ id: l.id, done: l.done, st: l.st, sides: l.sides, t: l.tiles.map(t => [t.i, t.j]) })))); } catch (e) {} }
function mtLoad(){
  mtClearAll();
  try {
    const d = JSON.parse(localStorage.getItem(MT_SAVE_KEY) || '[]');
    if (Array.isArray(d)) for (const q of d){
      if (!q || !Array.isArray(q.t) || !q.t.length) continue;
      const tiles = q.t.map(([i, j]) => ({ i: i | 0, j: j | 0 })), n = tiles.length;
      const l = { id: q.id | 0 || mtNext, tiles, done: !!q.done && n > 1, st: (Array.isArray(q.st) ? q.st : []).filter(k => k > 0 && k < n - 1), sides: q.sides && typeof q.sides === 'object' ? q.sides : {} };
      metros.push(l); mtNext = Math.max(mtNext, l.id + 1);
    }
  } catch (e) {}
  mtReindex();
  for (const l of metros){ mtBuildView(l); mtResetTrain(l); }   // (each stop keeps the lift side it was saved with)
}

/* ---------- materials ---------- */
const MTM = {
  deck: toon(0x343a42), deck2: toon(0x40464e), girder: toon(0x2a2f36), rail: toon(0x7a828c), beam: toon(0x3a4048), beam2: toon(0x4a5058),
  pillar: toon(0x2c3138), pillar2: toon(0x3a4048), plat: toon(0x4a5058), plat2: toon(0x3a3f46), canopy: toon(0x22262c), frame: toon(0x1a1d22),
  green: toon(0x184010, { em: 0x5aff2a, kind: 'neon' }), green2: toon(0x284010, { em: 0xb0ff3a, kind: 'neon' }), board: toon(0x0c1a10, { em: 0x0e2a14, kind: 'trim' }),
  lit: toon(0x3a4a3a, { em: 0xd8ffe0, kind: 'lamp' }), inner: toon(0x8c968c, { em: 0x1c241c, kind: 'window' }), pole: toon(0xc8ccc8), seat: toon(0x2c5a3a), ad: toon(0x5a2a48, { em: 0xd060a8, kind: 'window' }), blue: toon(0x103050, { em: 0x4ac8ff, kind: 'neon' }), tactile: toon(0xd9b43a),
  // the train
  body: toon(0x7a828c), body2: toon(0x4c525a), dark: toon(0x1c1f24), win: toon(0x1a3a12, { em: 0x9aff6a, kind: 'window' }), glass: toon(0x183a22, { em: 0x267030, kind: 'window' }), glassHi: toon(0x2a5a34, { em: 0x9ae8a8, kind: 'window' }),
  head: toon(0x5a5a50, { em: 0xf0fff0, kind: 'lamp' }), sil: toon(0x0a1a0a, { em: 0x0c2410, kind: 'window' }), belt: toon(0x184010, { em: 0x5aff2a, kind: 'neon' }),
};
const MT_GLASS = new THREE.MeshBasicMaterial({ color: 0x9aff7a, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }); MT_GLASS.userData.colorOnly = true;

/* ---------- drawing a line ---------- */
function mtDropView(l){
  if (l.view){ world.remove(l.view); disposeGroup(l.view); l.view = null; }
  if (l.fx){ scene.remove(l.fx); l.fx.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); l.fx = null; }
  disposeData(l.data); l.data = null; l.path = null; l.cabs = null;
}
// the frame of plot k at u: position, heading, and the way to its right
function mtFrame(l, k, u, dy = 0){ const c = hwCenter(l, k, u); return T(c.x, MT_Y + dy, c.z, Math.atan2(c.tx, c.tz)); }
function mtBuildView(l){
  mtDropView(l);
  R = mulberry32(hash('mt', l.id));
  const n = l.tiles.length, pts = mtSamples(l), stops = mtStops(l), W = MT_W;
  // where the platforms are, the overhead girder runs through the canopy; elsewhere the C-frames carry it
  l.data = collect(() => {
    // (no rail under the train: it hangs from the girder overhead, held up by its magnets alone)
    // the overhead girder: a dark box beam over the train, green circuit traces along both its faces. At a finished line's
    // ends it reaches a little past the station, over the end cars of a train standing there
    if (l.done && n > 1) for (const [k, u, d] of [[0, 0, -1], [n - 1, 1, 1]]){
      const c = hwCenter(l, k, u), F = T(c.x + c.tx*d*.4, MT_Y, c.z + c.tz*d*.4, Math.atan2(c.tx, c.tz));
      box(MTM.beam, F, 0, MT_OH + MT_OHT/2, 0, .46, MT_OHT, .8); box(MTM.beam2, F, 0, MT_OH + MT_OHT/2, d*.41, .5, MT_OHT + .04, .04);
      box(MTM.blue, F, 0, MT_OH - .004, 0, .14, .008, .8); box(MTM.green, F, 0, MT_OH + MT_OHT/2, d*.44, .3, .03, .012);
    }
    hwSweep(MTM.beam, pts, MT_OL, MT_OH + MT_OHT/2, .46, MT_OHT);
    for (const s of [-1, 1]) hwSweep(MTM.beam2, pts, s*.13, MT_OH - .015, .07, .05);   // the magnet rails under it
    hwSweep(MTM.blue, pts, 0, MT_OH - .004, .14, .008);                       // and the glowing strip between them, the train's magnets hanging just under it
    for (const s of [-1, 1]){ hwSweep(MTM.green, pts, MT_OL + s*.235, MT_OH + MT_OHT*.62, .012, .025); hwSweep(MTM.frame, pts, MT_OL + s*.235, MT_OH + MT_OHT + .01, .03, .03); }
    for (let q = 0; q + 1 < pts.length; q++){
      const a = pts[q], b = pts[q + 1];
      if (q % 9 === 4) for (const s of [-1, 1]) hwSeg(MTM.green, a, b, MT_OL + s*.237, MT_OH + MT_OHT*.38, .012, .025, .25);   // the traces' branches, dropping a step
      if (q % 9 === 6) for (const s of [-1, 1]) hwSeg(MTM.green2, a, b, MT_OL + s*.238, MT_OH + MT_OHT*.38, .014, .04, -.2);
    }
    // per plot: a C-frame carrying the girder (not at the stations: the canopy does there), MAGRAIL boards on the girder
    for (let k = 0; k < n; k++){
      const stop = stops.includes(k);
      if (!stop){   // a post up the girder's side of the deck, a bracket under the girder (local -x is the line's +lat side)
        const F = mtFrame(l, k, .5), px = -(W/2 + .12), ya = MT_OH + MT_OHT + .06, yh = -.45;   // a post beside the train, from the pillar's head up and over the top of the girder
        box(MTM.pillar2, F, px/2, yh, 0, Math.abs(px) + .5, .2, .4);                                   // the head on the pillar, reaching out to the post
        box(MTM.pillar, F, px, (ya + yh)/2, 0, .16, ya - yh + .06, .22);
        box(MTM.pillar, F, px/2 + .05, ya, 0, Math.abs(px) + .3, .12, .24);
        for (const s of [-1, 1]) box(MTM.pillar2, F, s*.27, MT_OH + MT_OHT/2, 0, .06, MT_OHT + .1, .2);   // the clamp round it
        box(MTM.green, F, px - .081, (ya + yh)/2, 0, .012, ya - yh - .4, .03);
      }
      if (!stop && mtStraight(l, k) && k % 3 === 1){
        for (const s of [-1, 1]){ const F = under(mtFrame(l, k, .5), T(-MT_OL + s*.24, MT_OH + MT_OHT/2, 0, s*PI/2)); box(MTM.board, F, 0, 0, .01, 1.6, .26, .02); fitSign(under(F, T(0, 0, .025, 0)), 'sign_mt_line', 0, 0, 0, 1.5, .5, 'green'); }
      }
    }
    // the stations
    for (const k of stops) mtStation(l, k);
    // the ends of the line: buffer stops, hazard boards across the girder ends
    for (const [k, u, back] of [[0, 0, true], [n - 1, 1, false]]){
      if (!l.done && k === n - 1 && n > 1){
        const F = under(mtFrame(l, k, 1), T(0, 0, -.1, 0));
        box(MTM.beam2, F, 0, MT_OH - .14, 0, .6, .26, .1); for (let x = -.24; x < .25; x += .12) box(M.hazard, F, x, MT_OH - .14, -.055, .06, .2, .012);   // a hazard board hung from the girder's open end
        for (const s of [-1, 1]){ box(M.blink, F, s*.28, MT_OH - .3, 0, .06, .06, .06); glow(F, s*.28, MT_OH - .3, -.1, 'red', .3); }
        continue;
      }
      if (k === n - 1 && n === 1) continue;
      const F = under(mtFrame(l, k, u), T(0, 0, back ? .12 : -.12, back ? PI : 0));
      { const gx = back ? MT_OL : -MT_OL; box(MTM.beam2, F, gx, MT_OH + MT_OHT/2, 0, .7, MT_OHT + .06, .08); box(MTM.green, F, gx, MT_OH + MT_OHT/2, .045, .5, .03, .012); }
    }
  });
  l.view = batchGroup([l.data]); world.add(l.view);
  // the moving parts: each station's lift cab
  l.fx = new THREE.Group(); scene.add(l.fx); l.cabs = [];
  for (const k of stops){
    const s = l.sides[k]; if (!s) continue;
    const Ls = mtLiftSpot(l, k, s), cab = new THREE.Group();
    const add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); cab.add(m); return m; };
    const cr = MT_LIFT_R - .04, ch = 1.08;   // (taller than anyone, as wide as the shaft)
    add(U.cyl16, MTM.canopy, 0, .03, 0, 2*cr, .06, 2*cr); add(U.cyl16, MTM.canopy, 0, ch, 0, 2*cr + .02, .07, 2*cr + .02);
    for (const y of [.08, ch - .05]) add(U.torus, MTM.green, 0, y, 0, 2*cr + .04, 2*cr + .04, .3).rotation.x = PI/2;
    for (let q = 0; q < 4; q++){ const a = q*PI/2 + PI/4; add(U.box, MTM.green2, Math.sin(a)*cr*.95, ch/2, Math.cos(a)*cr*.95, .018, ch - .1, .018); }
    const f = hwFold(cab), folded = new THREE.Group();
    for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]) if (geo){ const m = new THREE.Mesh(geo, mat); m.userData.own = true; folded.add(m); }
    folded.position.set(Ls.sx, CURB, Ls.sz); l.fx.add(folded); l.cabs.push({ k, g: folded, y0: CURB + .02, y1: MT_Y + MT_PLAT_Y + .01, y: CURB + .02, state: 'idle', hold: 0, x: Ls.sx, z: Ls.sz });
  }
  shadowDirty = true;
}
// a station on plot k (always straight track): a platform either side, glass screen doors, a canopy over it all, a
// STATION board at each end, benches, a ticket gate, and the bridge to the lift on its lift side
function mtStation(l, k){
  const F = mtFrame(l, k, .5), W = MT_W, Lp = LOT - .2, px = W/2 + MT_PLAT/2, side = -(l.sides[k] || 0), ph = .12;   // (side: the lift's, in this frame, where local +x is the way mtLiftSpot calls -1)
  for (const z of [-Lp/2 + .3, 0, Lp/2 - .3]) box(MTM.pillar2, F, 0, -.36, z, W + 2*MT_PLAT, .2, .3);   // the beams under the platforms (the train passes over, between them)
  for (const s of [-1, 1]){
    box(MTM.plat2, F, s*px, -.12, 0, MT_PLAT, .28, Lp);                         // the platform
    box(MTM.plat, F, s*px, ph - .01, 0, MT_PLAT - .02, .02, Lp - .02);
    box(MTM.tactile, F, s*(W/2 + .1), ph + .002, 0, .06, .01, Lp - .1);         // the yellow line along its edge
    box(MTM.green, F, s*(W/2 + .005), ph - .06, 0, .012, .04, Lp);
    // the screen doors: glass panels in green-lit frames, a gap where each car's doors stop
    { const gaps = s === side ? MT_DOORS.map(z => [z - MT_DOOR_W/2 - .04, z + MT_DOOR_W/2 + .04]) : [];   // (openings where the train's doors stop, on the side people use)
      let z0 = -Lp/2 + .05; const runs = [];
      for (const [a, b] of gaps.concat([[Lp/2 - .05, Lp/2]])){ if (a > z0 + .02) runs.push([z0, a]); z0 = b; }
      for (const [a, b] of runs){ const zc = (a + b)/2, ln = b - a;
        put(U.box, MT_GLASS, under(F, T(s*(W/2 + .03), ph + .38, zc, 0, .02, .7, ln)));
        for (let z = a; z <= b + .01; z += Math.max(.2, ln/Math.max(1, Math.round(ln/.48)))) box(MTM.frame, F, s*(W/2 + .03), ph + .38, Math.min(z, b), .04, .76, .04);
        box(MTM.lit, F, s*(W/2 + .03), ph + .74, zc, .02, .03, ln); box(MTM.green, F, s*(W/2 + .035), ph + .78, zc, .012, .025, ln); }
      for (const [a, b] of gaps) for (const z of [a, b]) box(MTM.green, F, s*(W/2 + .03), ph + .38, z, .045, .76, .02); }   // the openings' edges, lit
    // the outer rail, benches, a vending machine, a lamp post
    if (s !== side){ box(MTM.frame, F, s*(W/2 + MT_PLAT - .03), ph + .3, 0, .03, .03, Lp); for (let z = -Lp/2; z <= Lp/2 + .01; z += .6) box(MTM.frame, F, s*(W/2 + MT_PLAT - .03), ph + .15, z, .03, .3, .03); }
    for (const z of [-.9, .9]){ box(MTM.frame, F, s*(px + .18), ph + .12, z, .14, .04, .5); box(MTM.frame, F, s*(px + .25), ph + .2, z, .03, .16, .5); }
    box(MTM.body2, F, s*(px + .2), ph + .32, -1.55, .24, .6, .3); box(MTM.lit, F, s*(px + .06), ph + .42, -1.55, .01, .3, .2);
  }
  // the canopy over everything, on four posts, lit underneath; the girder runs through it
  const cw = 2*(W/2 + MT_PLAT) + .3, cy = MT_OH + MT_OHT + .08;
  put(U.box, MT_GLASS, under(F, T(0, cy + .1, 0, 0, cw, .03, Lp + .3)));                                   // a glass roof in a dark frame
  for (const s of [-1, 1]){ box(MTM.canopy, F, s*(cw/2 - .04), cy + .08, 0, .08, .12, Lp + .3); box(MTM.canopy, F, 0, cy + .08, s*(Lp/2 + .11), cw, .12, .08); }
  for (let z = -Lp/2 + .5; z < Lp/2; z += .7) box(MTM.canopy, F, 0, cy + .1, z, cw, .04, .04);
  for (const s of [-1, 1]) box(MTM.canopy, F, s*px, cy + .1, 0, .04, .04, Lp + .3);
  for (const s of [-1, 1]){ box(MTM.green, F, s*(cw/2 + .005), cy + .08, 0, .012, .04, Lp + .3); for (const z of [-Lp/2 + .15, Lp/2 - .15]) box(MTM.pillar, F, s*(W/2 + MT_PLAT - .12), (ph + cy)/2, z, .12, cy - ph, .12); }
  for (const s of [-1, 1]) box(MTM.lit, F, s*px, cy + .02, 0, .06, .02, Lp - .2);   // light bars under the frame
  for (const z of [-Lp/2 - .15, Lp/2 + .15]){ box(MTM.green, F, 0, cy + .08, z + Math.sign(z)*.006, cw, .04, .012); }
  // STATION boards hung under the canopy's ends, facing along the track, and the line's board on its sides
  for (const z of [-Lp/2 + .1, Lp/2 - .1]){ const G = under(F, T(0, 0, z, z < 0 ? PI : 0));
    for (const s of [-1, 1]){ box(MTM.board, G, s*px, cy - .25, 0, .66, .26, .03); fitSign(under(G, T(0, 0, .02, 0)), 'sign_mt_station', s*px, cy - .25, 0, .6, .5, 'green'); box(MTM.frame, G, s*px, cy - .06, 0, .02, .14, .02); } }
  for (const s of [-1, 1]){ const G = under(F, T(s*(cw/2 + .01), 0, 0, s*PI/2)); box(MTM.board, G, 0, cy + .08, .005, 2.2, .12, .01); fitSign(under(G, T(0, 0, .015, 0)), 'sign_mt_line', 0, cy + .08, 0, 2.1, .4, 'green'); }
  // the bridge to the lift
  if (side){
    const x0 = side*(W/2 + MT_PLAT), x1 = side*(MT_LIFT_OFF - MT_LIFT_R + .04);
    box(MTM.plat2, F, (x0 + x1)/2, -.12, 0, Math.abs(x1 - x0) + .02, .28, .55); box(MTM.plat, F, (x0 + x1)/2, ph - .01, 0, Math.abs(x1 - x0), .02, .53);
    for (const z of [-.27, .27]){ box(MTM.frame, F, (x0 + x1)/2, ph + .3, z, Math.abs(x1 - x0), .03, .03); box(MTM.green, F, (x0 + x1)/2, ph + .2, z, Math.abs(x1 - x0), .02, .012); }
    box(MTM.lit, F, side*(W/2 + MT_PLAT - .05), ph + .62, 0, .02, .22, .4);   // the EXIT light over the way out
  }
}
// what stands on the plots under a line: a pillar up to each plot's girder, and the stations' lift shafts. Drawn with
// the plot (called while it's built: see rebuildCell), so the walking paths go round them.
function mtKeepOut(c){
  const spots = [];
  for (const { l, k } of mtAt(c.i, c.j)){ if (hwAt(c.i, c.j).some(o => hwY(o.h.tiles[o.k].L) < MT_Y)) continue; const m = hwCenter(l, k, .5); spots.push({ x: m.x, z: m.z }); }
  return spots.length ? { y: CURB + 1.2, spots } : null;
}
// the keep-outs of both kinds of line over a plot, as one
function lineKeepOut(c){ const a = hwKeepOut(c), b = mtKeepOut(c); if (!a) return b; if (!b) return a; return { y: Math.min(a.y, b.y), spots: a.spots.concat(b.spots) }; }
function mtFeet(c){
  for (const { l, k } of mtAt(c.i, c.j)){
    if (hwAt(c.i, c.j).some(o => hwY(o.h.tiles[o.k].L) < MT_Y)) continue;   // a highway under it: the metro spans over
    const m = hwCenter(l, k, .5), top = MT_Y - MT_DECK - MT_GIRD + .04, roof = c.sections.length && !c.mega ? bucketTopIn(m.x - .2, m.x + .2, m.z - .2, m.z + .2) : -1e9, bot = c.mega ? hwSurface(c) : roof > CURB ? roof - .6 : CURB;
    if (top - bot < .2) continue;
    if (roof > CURB){   // only onto a flat roof
      const hs = [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4], [0, 0], [-.4, 0], [.4, 0], [0, -.4], [0, .4]].map(([dx, dz]) => bucketHeightAt(m.x + dx, m.z + dz));
      if (Math.max(...hs) - Math.min(...hs) > .2) continue;
    }
    const F = T(m.x, 0, m.z, Math.atan2(m.tx, m.tz));
    box(MTM.pillar, F, 0, (bot + top)/2, 0, .42, top - bot, .42);
    box(MTM.pillar2, F, 0, top - .14, 0, .78, .28, .5);                 // the hammerhead under the girder
    if (roof > CURB){ box(MTM.pillar2, F, 0, roof + .06, 0, .62, .14, .62); box(MTM.pillar2, F, 0, roof + .01, 0, .74, .05, .74); }
    else box(MTM.pillar2, F, 0, bot + .05, 0, .56, .1, .56);
    for (const s of [-1, 1]) box(MTM.green, F, s*.215, (bot + top)/2, 0, .012, Math.max(.1, top - bot - .5), .05);
    for (let y = bot + 1.2; y < top - .6; y += 2.4) box(MTM.green2, F, 0, y, .215, .2, .025, .012);
  }
  // a station's lift shaft whose foot is on this plot
  for (const l of metros) for (const k of mtStops(l)){
    const s = l.sides && l.sides[k]; if (!s) continue;
    const Ls = mtLiftSpot(l, k, s); if (Math.round(Ls.sx/LOT) !== c.i || Math.round(Ls.sz/LOT) !== c.j) continue;
    const top = MT_SHAFT_TOP - .2, P = T(Ls.sx, 0, Ls.sz, Math.atan2(Ls.dx, Ls.dz)), r = Ls.r;
    put(U.cyl16, MT_GLASS, under(P, T(0, (CURB + top)/2, 0, 0, 2*r, top - CURB, 2*r)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(MTM.frame, P, sx*r*.72, (CURB + top)/2, sz*r*.72, .045, top - CURB, .045);
    box(MTM.lit, P, 0, CURB + 1.08, r + .02, .5, .03, .02);   // over the way in at the foot
    for (let yy = CURB + 1.0; yy < top - .3; yy += 1.0) put(U.torus, MTM.green, under(P, T(0, yy, 0, 0, 2*r + .03, 2*r + .03, .45, PI/2)));
    box(MTM.canopy, P, 0, CURB + .04, 0, 2*r + .16, .08, 2*r + .16);
    box(MTM.canopy, P, 0, top + .08, 0, 2*r + .14, .16, 2*r + .14); box(MTM.green, P, 0, top + .17, 0, 2*r + .1, .02, 2*r + .1);
  }
}

/* ---------- the trains ---------- */
// a car, built part by part and folded (see hwFold): its body, the green-lit windows and belt lines, doors, the bogie
// arm up to the girder overhead; a cab car has a sloped nose with a lit windscreen and headlights at its +z end
function mtCarModel(cab, nose = 1){
  const g = new THREE.Group(), L = MT_CL, Wb = .8, y0 = .12, H = .78, rr = .1;   // length, width, floor, body height, the roof's rounding
  const add = (mat, x, y, z, sx, sy, sz, rx = 0, rz = 0, ry = 0) => { const m = new THREE.Mesh(U.box, mat); m.position.set(x, y, z*nose); m.scale.set(sx, sy, sz); m.rotation.set(rx*nose, ry*nose, rz); g.add(m); return m; };
  const R_ = mulberry32(cab ? 77 : 41);
  // the body: from the back end to where the cab's nose starts (all of it, on a middle car)
  const zb0 = -L/2 + .04, zb1 = cab ? L/2 - .38 : L/2 - .04, bl = zb1 - zb0, bz = (zb0 + zb1)/2;
  // the body: hollow at the doors. A core down the middle (the inside's back wall), the side walls round a big door each
  // side (wider and taller than anyone who has to get through it), the roof over it all. The door leaves are drawn
  // apart (see mtLeaves), so they can slide open at the stations.
  const DW = MT_DOOR_W, DH = MT_DOOR_H/MT_SY, dz = cab ? MT_CAB_DOOR : 0, yd0 = y0 + .01, yd1 = yd0 + DH, ci = Wb - .36;
  add(MTM.inner, 0, y0 + (H - rr)/2, bz, ci, H - rr, bl);                          // the core: the inside's back wall
  add(MTM.dark, 0, y0 + .004, bz, Wb - .06, .008, bl);                             // the floor
  const segs = [[zb0, dz - DW/2], [dz + DW/2, zb1]];
  for (const s of [-1, 1]){
    for (const [za, zz] of segs){ if (zz - za < .01) continue; const zc = (za + zz)/2, ln = zz - za;
      add(MTM.body, s*(Wb/2 - .05), y0 + .3, zc, .1, .6, ln);                                          // the wall below the windows
      add(MTM.body, s*((Wb - .03)/2 - .05), y0 + .6 + (H - .6 - rr)/2, zc, .1, H - .6 - rr, ln); }     // and beside them
    add(MTM.body, s*((Wb - .03)/2 - .05), (yd1 + y0 + H - rr)/2, dz, .1, Math.max(.01, y0 + H - rr - yd1), DW + .02);   // over the door
  }
  add(MTM.body, 0, y0 + H - rr/2, bz, Wb - 2*rr, rr, bl);                          // the roof, its edges rounded down
  for (const s of [-1, 1]) add(MTM.body, s*(Wb/2 - rr*.62), y0 + H - rr*.62, bz, rr*1.15, rr*.55, bl, 0, s*.7);
  add(MTM.body2, 0, y0 + H + .005, bz, Wb - .34, .015, bl - .1);                     // the roof's centre panel
  // the inside, seen through the doors: a lit ceiling strip, grab poles and a rail, benches against the core either side
  // of the door, now and then a rider holding on
  for (const s of [-1, 1]){
    const xi = s*(ci/2 + .003);
    add(MTM.lit, s*(Wb/2 - .17), y0 + H - rr - .015, dz, .06, .015, DW + .3);
    for (const o of [-.2, .2]) add(MTM.pole, s*(Wb/2 - .15), (yd0 + yd1)/2, dz + o, .018, DH, .018);
    add(MTM.pole, s*(Wb/2 - .15), yd1 - .06, dz, .014, .014, .44);
    for (const o of [-.27, .27]){ add(MTM.seat, s*(ci/2 + .045), y0 + .18, dz + o, .09, .035, .16); add(MTM.seat, s*(ci/2 + .012), y0 + .28, dz + o, .025, .18, .16); }
    if (R_() < .6){ const o = (R_() - .5)*.2; add(MTM.sil, s*(Wb/2 - .22), y0 + .3, dz + o, .06, .4, .1); add(MTM.sil, s*(Wb/2 - .22), y0 + .56, dz + o, .055, .1, .07); add(MTM.sil, s*(Wb/2 - .18), y0 + .58, dz + o + .05, .02, .14, .02); }
  }
  // the skirt underneath, the green underglow along it
  add(MTM.dark, 0, y0 - .045, 0, Wb - .04, .1, L - .06);
  add(MTM.belt, 0, y0 - .1, 0, Wb - .3, .02, L - .3);
  for (const s of [-1, 1]){
    const sx = s*(Wb/2), sxu = s*((Wb - .03)/2);
    // panel seams, and the three green lines (broken by the door): under the roof, over the windows' sills, along the belt
    for (const [za, zz] of segs){ if (zz - za < .02) continue; const zc = (za + zz)/2, ln = zz - za - .02;
      add(MTM.body2, sx + s*.003, y0 + .6, zc, .006, .012, ln);
      add(MTM.belt, sx + s*.006, y0 + .4, zc, .008, .02, ln);
      add(MTM.belt, sx + s*.006, y0 + .13, zc, .008, .03, ln); }
    add(MTM.belt, sxu + s*.006, y0 + H - rr - .02, bz, .008, .022, bl - .04);
    for (const e of [-1, 1]) add(MTM.belt, sx + s*.008, (yd0 + yd1)/2, dz + e*(DW/2 + .01), .008, DH + .02, .014);   // the door's frame, lit
    // the windows: green-lit panes with people in them
    for (const [za0, zz0] of segs){ const za = za0 + .06, zz = zz0 - .06; if (zz - za < .12) continue;
      const n = Math.max(1, Math.round((zz - za)/.24)), w = (zz - za)/n;
      for (let q = 0; q < n; q++){
        const zc = za + (q + .5)*w;
        add(MTM.win, sxu + s*.004, y0 + .72, zc, .006, .22, w - .04);
        add(MTM.body2, sxu + s*.006, y0 + .72, za + q*w, .008, .24, .025);
        if (R_() < .75){ const px = zc + (R_() - .5)*w*.4, tall = .03 + R_()*.03;
          add(MTM.sil, sxu + s*.006, y0 + .66 + tall, px, .006, .07, .055); add(MTM.sil, sxu + s*.006, y0 + .63 + tall*.5, px, .006, .06, .11); }
      }
      add(MTM.body2, sxu + s*.006, y0 + .72, zz, .008, .24, .025);
    }
  }
  // the gangway bellows at the inner ends
  for (const e of cab ? [-1] : [-1, 1]){ add(MTM.dark, 0, y0 + .42, e*(L/2 - .005), .58, .66, .06); for (const yy of [.2, .42, .64]) add(MTM.body2, 0, y0 + yy, e*(L/2 + .012), .6, .02, .02); }
  // the roof: low equipment boxes either side, and down the middle the magnet shoe the car hangs by: no arm, no
  // wheels, just a gap to the girder's rail, lit green
  for (const zc of [-L*.26, L*.18]) for (const sx of [-1, 1]){ add(MTM.body2, sx*.27, y0 + H + .03, zc, .16, .06, .28); for (let z = -.1; z <= .11; z += .05) add(MTM.dark, sx*.27, y0 + H + .065, zc + z, .12, .01, .02); }
  { const zs = cab ? -.12 : 0, ls = cab ? L - .5 : L - .16;
    add(MTM.dark, 0, y0 + H + .025, zs, .3, .05, ls);                                  // the shoe
    add(MTM.body2, 0, y0 + H + .055, zs, .22, .02, ls - .06);                          // its magnet face
    for (const sx of [-1, 1]) add(MTM.blue, sx*.155, y0 + H + .03, zs, .012, .025, ls); }   // lit along its edges, electric blue
  if (cab){
    // the nose, after the reference: the body carried on and gently rounded off. Its roof curves down in a long arc into
    // a low, upright front, and its corners round in seen from above; the curved upper part is a wraparound windscreen
    // (green-tinted, lit), the lower part body with the headlights and a green strip. Lofted from sections along it.
    const Ln = .36, N = 18, rt = .3, rp = .14, yb = y0 - .095, AR = 6;   // (its underside level with the skirt's)
    const sec = t => {   // the section at t (0 where it leaves the body, 1 at the tip): its outline, left side up, over the top, right side down
      const w = Wb/2 - rp*(1 - Math.sqrt(Math.max(0, 1 - t*t))), yt = y0 + H - rt*(1 - Math.sqrt(Math.max(0, 1 - t*t))), r = .1 - .04*t;
      const pts = [[-w, yb], [-w, y0 + .16], [-w, y0 + .19], [-w, y0 + .36], [-w, y0 + .4]];
      for (let q = 0; q <= AR; q++){ const a = PI - q*PI/(2*AR); pts.push([-w + r + r*Math.cos(a), yt - r + r*Math.sin(a)]); }
      pts.push([-.22, yt], [-.12, yt], [-.015, yt], [.015, yt], [.12, yt], [.22, yt]);   // (breaks across the top, for the frame and the glints)
      for (let q = 0; q <= AR; q++){ const a = PI/2 - q*PI/(2*AR); pts.push([w - r + r*Math.cos(a), yt - r + r*Math.sin(a)]); }
      pts.push([w, y0 + .4], [w, y0 + .36], [w, y0 + .19], [w, y0 + .16], [w, yb]);
      return pts.map(([x, y]) => [x, y, zb1 + t*Ln]);
    };
    const S = []; for (let q = 0; q <= N; q++) S.push(sec(q/N));
    const M = S[0].length, buf = { body: [], glass: [], dark: [], belt: [], hi: [], sil: [] }, G0 = .22, G1 = G0 + 1/N;
    // what each patch is: the body, its green lines, the windscreen's dark frame, the glass, a glint across it, the drivers behind it
    const kindOf = (y, t, x) => {
      if (y < y0 + .16) return 'body'; if (y < y0 + .19) return 'belt'; if (y < y0 + .36) return 'body'; if (y < y0 + .4) return 'dark';
      if (t < G0) return 'body'; if (t < G1) return y > y0 + .6 ? 'belt' : 'dark';               // the frame's top edge: a green line over the roof, dark down the sides
      if (Math.abs(x) < .02 && y > y0 + .45) return 'dark';                                      // (the centre post, see below)
      if (y > y0 + .6 && x < -.12 && x > -.22 && t > .4 && t < .7) return 'hi';                 // a glint
      if (y > y0 + .5 && y < y0 + .62 && t > .72 && t < .9 && Math.abs(Math.abs(x) - .17) < .05) return 'sil';   // the drivers' heads and shoulders, dark against the lit cab
      return 'glass';
    };
    const quad = (k, A, B, C, D) => buf[k].push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C);   // (both ways round: seen from any side, nothing goes see-through)
    for (let q = 0; q < N; q++) for (let j = 0; j < M; j++){   // (j = M - 1: the underside, back across from the last point to the first)
      const A = S[q][j], B = S[q + 1][j], C = S[q + 1][(j + 1) % M], D = S[q][(j + 1) % M];
      quad(kindOf((A[1] + B[1] + C[1] + D[1])/4, (q + .5)/N, (A[0] + B[0] + C[0] + D[0])/4), A, B, C, D);
    }
    { const F = S[N]; for (let j = 0; j < (M >> 1) - 1; j++){ const a = F[j], b = F[j + 1], c = F[M - 2 - j], d = F[M - 1 - j];   // the front face, in bands across
        quad(kindOf((a[1] + b[1])/2, 1, 1), a, b, c, d); } }
    const mat = { body: MTM.body, glass: MTM.glass, dark: MTM.dark, belt: MTM.belt, hi: MTM.glassHi, sil: MTM.sil };
    for (const k in buf){ if (!buf[k].length) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(buf[k], 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat[k]); if (nose < 0) m.rotation.y = PI; g.add(m); }
    // the windscreen's frame: a post down the middle and one at each corner, a sheen across the glass
    const zt = zb1 + Ln, ytop = t => y0 + H - rt*(1 - Math.sqrt(Math.max(0, 1 - t*t)));
    for (let q = 1; q < N; q++){ const t0 = q/N, t1 = (q + 1)/N; const st = (x, a, b) => { const m = new THREE.Mesh(U.box, MTM.dark); const ya = ytop(a) + .006, yb2 = ytop(b) + .006, za = zb1 + a*Ln, zb2 = zb1 + b*Ln;
        m.position.set(x, (ya + yb2)/2, ((za + zb2)/2)*nose); m.scale.set(.025, .012, Math.hypot(zb2 - za, yb2 - ya) + .005); m.rotation.x = Math.atan2(ya - yb2, zb2 - za)*nose; g.add(m); };
      }
    add(MTM.dark, 0, (y0 + .4 + ytop(1))/2, zt + .004, .025, ytop(1) - y0 - .4, .01);
    // the headlights and the green strip across the front
    for (const sx of [-1, 1]){ add(MTM.dark, sx*.2, y0 + .27, zt + .004, .19, .075, .012); add(MTM.head, sx*.165, y0 + .27, zt + .01, .08, .04, .006); add(MTM.head, sx*.25, y0 + .27, zt + .01, .04, .04, .006); add(MTM.belt, sx*.2, y0 + .227, zt + .009, .19, .01, .006); }
    add(MTM.dark, 0, y0 + .27, zt + .004, .1, .06, .01); add(MTM.glass, 0, y0 + .27, zt + .009, .08, .035, .006);   // the line number between them
  }
  g.scale.y = MT_SY;   // (stretched up: see MT_SY)
  return g;
}
const MT_CAR_MAX = 90;
const MT_MODELS = [[false, 1], [true, 1], [true, -1]].map(([cab, nose]) => {   // a middle car, a cab facing the way the line goes, a cab facing back
  const f = hwFold(mtCarModel(cab, nose)), meshes = [];
  for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]){ if (!geo) continue; const m = new THREE.InstancedMesh(geo, mat, MT_CAR_MAX); m.count = 0; m.frustumCulled = false; m.visible = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); meshes.push(m); }
  return { meshes, n: 0 };
});
// a soft green glow on the guideway under each car
const mtGlow = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-PI/2);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0x5aff2a), transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }), MT_CAR_MAX);
  m.count = 0; m.frustumCulled = false; m.layers.set(1); m.renderOrder = 3; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; })();
// the magnetic field holding each car up: an electric blue shimmer in the gap between its shoe and the girder's rail,
// in sheets along both sides of the shoe and one lying over the roof; a scrolling texture of wavering lines
const MT_FIELD_TEX = (() => {   // a soft glow: brightest in the middle of the gap, fading out to nothing above and below and at the ends
  const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'), im = g.createImageData(64, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++){ const v = Math.sin(PI*(y + .5)/32)**2, u = Math.sin(PI*(x + .5)/64)**.6, a = v*u, i = (y*64 + x)*4;
    im.data[i] = 120; im.data[i + 1] = 210; im.data[i + 2] = 255; im.data[i + 3] = Math.round(255*a); }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.LinearFilter; return t;
})();
const mtField = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateY(PI/2);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: MT_FIELD_TEX, color: new THREE.Color(0x6ad0ff), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MT_CAR_MAX*3);
  m.count = 0; m.frustumCulled = false; m.layers.set(1); m.renderOrder = 3; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; })();
// the line's centre as a path the train follows ({ X, Y, Z, cum, len }), and where along it each stop's middle is
function mtPath(l){
  if (l.path) return l.path;
  const S = mtSamples(l, .15), X = [], Y = [], Z = [], cum = [0];
  for (const p of S){ X.push(p.x); Y.push(p.y); Z.push(p.z); }
  for (let q = 1; q < S.length; q++) cum.push(cum[q - 1] + Math.hypot(X[q] - X[q - 1], Z[q] - Z[q - 1]));
  const sAt = (k, u) => { for (let q = 0; q < S.length; q++) if (S[q].k > k || (S[q].k === k && S[q].u >= u - 1e-6)) return cum[q]; return cum[cum.length - 1]; };
  const stops = mtStops(l).map(k => ({ k, s: sAt(k, .5) }));   // (every stop, the ends too, right at its station: the girder reaches out past the ends for the cars there)
  return (l.path = { X: Float32Array.from(X), Y: Float32Array.from(Y), Z: Float32Array.from(Z), cum: Float32Array.from(cum), len: cum[cum.length - 1], stops });
}
function mtResetTrain(l){
  l.path = null; l.train = null;
  if (!l.done || l.tiles.length < 2) return;
  const P = mtPath(l); if (P.stops.length < 2) return;
  l.train = { s: P.stops[0].s, v: 0, dir: 1, at: 0, dwell: 2 + (l.id % 3), stopT: 0, doors: 0, load: [], fresh: true };
  // the stations people can use (those with a lift): where each is, and which side of the track its platform's way out is
  l.stn = new Map();
  P.stops.forEach((st, i) => { const sd = l.sides && l.sides[st.k]; if (!sd) return;
    l.stn.set(st.k, { i, k: st.k, s: st.s, side: -sd, e: mtFrame(l, st.k, .5).elements.slice(), id: 'mt:' + l.id + ':' + st.k }); });
}
const _mpos = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, _mdm = new THREE.Object3D(), _mgap = [], _mtop = [];   // _mgap: each car's gap this frame, for the shimmer (see the comp shader in sky.js)
// The shimmer's cars go to the composite shader, less any whose field can't reach the screen: a car's haze is exactly
// nothing more than .95 along or .62 across from its middle (see the comp shader), so off screen it only costs every
// pixel six samples of nothing. Called once the frame's view matrix is set (main.js).
function mtShimmerCull(VP){
  const U_ = comp.uniforms, y0 = U_.mtGapY.value.x - .05, y1 = U_.mtGapY.value.y + .05; let n = 0;
  for (const g of _mtop) if (boxOnScreen(VP, g[0] - 1.2, g[0] + 1.2, y0, y1, g[1] - 1.2, g[1] + 1.2)) U_.mtGap.value[n++].set(...g);
  U_.mtN.value = n;
}
function updateMetros(dt, t){
  for (const M_ of MT_MODELS) M_.n = 0;
  MT_LEAF.n = 0;
  let ng = 0, nf = 0; _mgap.length = 0;
  const night = typeof isNight === 'function' && isNight(S.hour);
  for (const l of metros){
    const tr = l.train; if (!tr || !l.view) continue;
    const P = mtPath(l), stops = P.stops;
    // the run: dwell at a stop, then on to the next one along (turning back at the ends), easing in and out
    if (tr.dwell > 0){
      tr.v = 0; tr.stopT += dt;
      if (tr.fresh){ tr.fresh = false; mtArrive(l, tr, stops[tr.at].k); }   // (where it starts out: the doors open there too)
      else if (tr.doors > .9 && tr.dwell > 1.6 && (tr.late = (tr.late || 0) + dt) > .5){ tr.late = 0; mtBoard(l, tr, stops[tr.at].k, false); }   // whoever's just come up onto the platform gets on too
      const busy = mtBusy(l, tr);   // (people still getting on and off: the doors stay open)
      if (!busy || tr.dwell > .75) tr.dwell -= dt;
      tr.doors = Math.max(0, Math.min(1, tr.stopT/.7, tr.dwell/.7));
      if (tr.dwell <= 0){ tr.doors = 0;
        if (tr.at + tr.dir < 0 || tr.at + tr.dir >= stops.length) tr.dir = -tr.dir;
        tr.next = tr.at + tr.dir;
      }
    } else {
      const goal = stops[tr.next].s, d = goal - tr.s, dist = Math.abs(d);
      const vCap = Math.sqrt(2*MT_ACC*Math.max(0, dist - .02));
      tr.v = Math.min(MT_VMAX, tr.v + MT_ACC*dt, vCap + .05);
      const step = Math.min(dist, tr.v*dt); tr.s += Math.sign(d)*step;
      if (dist - step < .005){
        tr.s = goal; tr.at = tr.next; tr.v = 0; tr.dwell = MT_DWELL + Math.random()*2; tr.stopT = 0;
        mtArrive(l, tr, stops[tr.at].k);   // the doors open: off, then on
      }
    }
    // the cars: one ahead of the middle of the train, one behind, a cab at each end facing out
    let cur = 0;
    for (let q = 0; q < MT_CARS; q++){
      const off = (q - (MT_CARS - 1)/2)*(MT_CL + MT_GAP), s = Math.max(0, Math.min(P.len, tr.s + off));
      const a = Math.max(0, s - .25), b = Math.min(P.len, s + .25);
      cur = hwAlong(P, s, cur, _mpos); const p0 = {}, p1 = {}; hwAlong(P, a, 0, p0); hwAlong(P, b, 0, p1);
      const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z), cab = q === 0 || q === MT_CARS - 1;
      _mdm.position.set(_mpos.x, _mpos.y + MT_LEV + .008*Math.sin(t*2.2 + l.id + q), _mpos.z);   // (floating: a slow bob on its magnets)
      _mdm.rotation.set(0, yaw, 0, 'YXZ'); _mdm.scale.setScalar(1); _mdm.updateMatrix();
      const M_ = MT_MODELS[!cab ? 0 : q === 0 ? 2 : 1]; if (M_.n < MT_CAR_MAX){ for (const m of M_.meshes) m.setMatrixAt(M_.n, _mdm.matrix); M_.n++; }
      { const stn = tr.dwell > 0 && l.stn && l.stn.get(stops[tr.at].k); mtLeaves(_mdm.matrix, q, stn ? stn.side : 0, stn ? tr.doors : 0); }
      if (ng < MT_CAR_MAX){ const bob = .008*Math.sin(t*2.2 + l.id + q), top = (.12 + .78 + .065)*MT_SY + MT_LEV + bob, gap = MT_OH - top;   // the field in the gap over it, flickering a little
        _mgap.push([_mpos.x, _mpos.z, Math.sin(yaw), Math.cos(yaw)]);
        for (const sx of [-1, 1]){ const ox = sx*.2*Math.cos(yaw), oz = -sx*.2*Math.sin(yaw);   // a sheet each side of the shoe, wavering in height
          _mdm.position.set(_mpos.x + ox, _mpos.y + top + gap/2, _mpos.z + oz); _mdm.rotation.set(0, yaw, 0); _mdm.scale.set(1, gap*(1.8 + .15*Math.sin(t*3 + q*2.1 + sx)), MT_CL); _mdm.updateMatrix(); mtField.setMatrixAt(nf++, _mdm.matrix); }
        _mdm.position.set(_mpos.x, _mpos.y + top + .01, _mpos.z); _mdm.rotation.set(0, yaw, PI/2); _mdm.scale.set(1, .7, MT_CL); _mdm.updateMatrix(); mtField.setMatrixAt(nf++, _mdm.matrix); }   // and one lying on the roof
      if (ng < MT_CAR_MAX){ _mdm.position.set(_mpos.x, _mpos.y + .012, _mpos.z); _mdm.rotation.set(0, yaw, 0); _mdm.scale.set(.85, 1, MT_CL*1.2); _mdm.updateMatrix(); mtGlow.setMatrixAt(ng++, _mdm.matrix); }
    }
  }
  mtRiders(dt, t);
  mtDrawDoors();
  for (const M_ of MT_MODELS) for (const m of M_.meshes){ m.count = M_.n; m.visible = M_.n > 0; if (M_.n) m.instanceMatrix.needsUpdate = true; }
  mtField.count = nf; mtField.visible = nf > 0; mtField.material.opacity = .45 + .1*Math.sin(t*3.5); if (nf) mtField.instanceMatrix.needsUpdate = true;
  { const U_ = comp.uniforms, cx = camT.x, cz = camT.z;   // the 16 cars nearest the view get the shimmer
    _mgap.sort((a, b) => (a[0] - cx)**2 + (a[1] - cz)**2 - (b[0] - cx)**2 - (b[1] - cz)**2);
    _mtop.length = 0; for (let k = 0; k < Math.min(16, _mgap.length); k++) _mtop.push(_mgap[k]);   // (handed to the shader once the frame's view is known: mtShimmerCull)
    U_.mtGapY.value.set(MT_Y + (.12 + .78 + .04)*MT_SY + MT_LEV, MT_Y + MT_OH + .02); }
  mtGlow.count = 0; mtGlow.visible = false;   // (no deck under the train to light any more) mtGlow.material.opacity = night ? .85 : .3; if (ng) mtGlow.instanceMatrix.needsUpdate = true;
  // the stations' lift cabs go up and down
  for (const l of metros) if (l.cabs) for (const c of l.cabs) c.g.position.y = c.y;   // (moved by the lift controller: see mtLifts)
}

/* ---------- metro mode: picking, the ghost, the highlights ---------- */
function mtPick(cx, cy){
  const r = canvas.getBoundingClientRect();
  _hndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  _hray.setFromCamera(_hndc, cam);
  let best = null;
  for (const l of metros) l.tiles.forEach((t, k) => {
    _hbox.min.set(t.i*LOT - LOT/2, MT_Y - .7, t.j*LOT - LOT/2); _hbox.max.set(t.i*LOT + LOT/2, MT_Y + MT_OH + MT_OHT, t.j*LOT + LOT/2);
    if (!_hray.ray.intersectBox(_hbox, _hhit)) return;
    const d = _hhit.distanceTo(_hray.ray.origin); if (!best || d < best.d) best = { kind: 'mtTile', l, k, d };
  });
  // next to the open end of an unfinished line: the column over that plot counts, so the pick is easy to make
  for (const l of metros){
    if (l.done) continue;
    const e = l.tiles[l.tiles.length - 1], pv = l.tiles[l.tiles.length - 2];
    for (const [a, b] of SIDES4){
      const i = e.i + a, j = e.j + b; if (pv && pv.i === i && pv.j === j) continue;
      _hbox.min.set(i*LOT - LOT/2, MT_Y - .8, j*LOT - LOT/2); _hbox.max.set(i*LOT + LOT/2, MT_Y + .4, j*LOT + LOT/2);
      if (!_hray.ray.intersectBox(_hbox, _hhit)) continue;
      const d = _hhit.distanceTo(_hray.ray.origin);
      if (best && best.kind === 'mtTile' && best.d < d + 1) continue;
      if (!best || best.kind === 'mtTile' || d < best.d) best = { kind: 'mtGround', i, j, d, near: true };
    }
  }
  const o = _hray.ray.origin, dir = _hray.ray.direction;
  if (Math.abs(dir.y) > 1e-4){ const tt = (MT_Y - o.y)/dir.y; if (tt > 0){ const p = o.clone().addScaledVector(dir, tt), d = tt*dir.length();
    const i = Math.round(p.x/LOT), j = Math.round(p.z/LOT);
    if (!best || (!best.near && d < best.d - .5)) best = { kind: 'mtGround', i, j, d }; } }
  return best;
}
// a see-through band over plots k0..k1 of a line (sharing the highway's highlight meshes: only one mode is on at a time)
function mtHiShow(H, l, k0, k1, col){
  if (!l || k1 < k0){ H.fill.visible = H.line.visible = false; H.key = ''; return; }
  H.fill.material.color.setHex(col); H.line.material.color.setHex(col);
  const key = 'mt' + l.id + ':' + k0 + ':' + k1 + ':' + l.tiles.length;
  if (H.key !== key){
    H.key = key;
    const Wd = MT_W/2 + .25, tri = [], seg = [], y = MT_Y + .08;
    const edge = (k, u) => { const c = hwCenter(l, k, u); return [[c.x - c.tz*Wd, y, c.z + c.tx*Wd], [c.x + c.tz*Wd, y, c.z - c.tx*Wd]]; };
    for (let k = k0; k <= k1; k++){
      const N = 8; let prev = edge(k, 0); seg.push(...prev[0], ...prev[1]);
      for (let q = 1; q <= N; q++){ const cur = edge(k, q/N); tri.push(...prev[0], ...prev[1], ...cur[1], ...prev[0], ...cur[1], ...cur[0]); seg.push(...prev[0], ...cur[0], ...prev[1], ...cur[1]); prev = cur; }
      seg.push(...prev[0], ...prev[1]);
    }
    H.fill.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); H.fill.geometry.computeBoundingSphere();
    H.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)); H.line.geometry.computeBoundingSphere();
  }
  H.fill.visible = H.line.visible = true;
}
function mtHighlight(t){
  if (t && t.l && (t.type === 'none' || t.type === 'stop' || t.type === 'unstop')){ const n = t.l.tiles.length;   // a built piece: it, and what a right-click would take with it
    mtHiShow(hwHiA, t.l, t.k, t.k, t.type === 'stop' && t.ok ? 0x5aff7a : t.type === 'unstop' ? 0xffd04a : 0xff6a7a); mtHiShow(hwHiB, t.l, t.k + 1, n - 1, 0xff3a4a); return; }
  if (t && t.type === 'finish'){ const n = t.l.tiles.length; mtHiShow(hwHiA, t.l, n - 1, n - 1, 0x5aff7a); mtHiShow(hwHiB, null); return; }
  if (t && t.type === 'extend'){ const n = t.l.tiles.length; mtHiShow(hwHiA, t.l, n - 1, n - 1, 0x38e8e0); mtHiShow(hwHiB, null); return; }   // the piece the next one joins on to
  mtHiShow(hwHiA, null); mtHiShow(hwHiB, null);
}
function mtShowGhost(t){
  mtHighlight(t);
  if (!t || t.type === 'none' || t.type === 'stop' || t.type === 'unstop'){ hwGhost.g.visible = false; return; }
  const col = t.ok ? (t.type === 'finish' ? 0x5aff7a : 0x38e8e0) : 0xff3a4a;
  hwGhostMat.color.setHex(col); hwGhostLine.color.setHex(col);
  let x, z, len, ry, w = MT_W + .1, th = MT_DECK + MT_GIRD, y = MT_Y;
  if (t.type === 'start'){ x = t.i*LOT; z = t.j*LOT; len = LOT*.92; ry = 0; w = MT_W + 2*MT_PLAT; }
  else if (t.type === 'extend'){ const e = t.l.tiles[t.l.tiles.length - 1]; x = (e.i + t.i)*LOT/2 + (t.i - e.i)*LOT*.25; z = (e.j + t.j)*LOT/2 + (t.j - e.j)*LOT*.25; len = LOT*.95; ry = Math.atan2(t.i - e.i, t.j - e.j); }
  else { const n = t.l.tiles.length, e = t.l.tiles[n - 1], { dout } = hwDirs(t.l, n - 1); x = e.i*LOT; z = e.j*LOT; len = LOT*.9; ry = Math.atan2(dout[0], dout[1]); w = MT_W + 2*MT_PLAT; th = MT_OH + .4; y = MT_Y + MT_OH; }
  hwGhost.deck.position.set(x, y - th/2, z); hwGhost.deck.rotation.y = ry; hwGhost.deck.scale.set(w, th, len);
  hwGhost.edge.position.copy(hwGhost.deck.position); hwGhost.edge.rotation.y = ry; hwGhost.edge.scale.copy(hwGhost.deck.scale);
  const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))), by = c ? hwSurface(c) : y, top = MT_Y - MT_DECK - MT_GIRD;
  hwGhost.pole.visible = top - by > .1 && t.type !== 'finish';
  hwGhost.pole.position.set(x, (top + by)/2, z); hwGhost.pole.scale.set(.06, Math.max(.01, top - by), .06);
  hwGhost.g.visible = true;
}
let mtLastPt = null;
function mtHover(cx, cy){ mtLastPt = { x: cx, y: cy }; const t = mtTargetAt(mtPick(cx, cy)); mtShowGhost(t);
  const el = $('modeHint'), why = t && !t.ok ? t.why : ''; el.textContent = why || ''; el.hidden = !why; }
function mtClick(cx, cy){ const t = mtTargetAt(mtPick(cx, cy)); if (mtApply(t)) mtHover(cx, cy); }
function mtRightClick(cx, cy){ const pk = mtPick(cx, cy); if (pk && pk.kind === 'mtTile'){ mtCutAt(pk.l, pk.k); mtHover(cx, cy); } }
function setMtMode(on, quiet){
  mtMode = on;
  if (on){ if (hwMode) setHwMode(false, true); if (S.zone) selectZone(null); if (delMode) setDelMode(false, true); if (megaPick) selectMega(null, true); hover.visible = hoverFill.visible = false; showMegaGhost(null); }
  else { hwGhost.g.visible = false; mtHighlight(null); }
  const b = document.getElementById('mtBtn'); if (b){ b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  $('modeHint').hidden = on; if (on) $('modeHint').textContent = '';
  else if (!quiet) selectZone(S.zone);
}

/* ---------- riding the metro ---------- */
// People take the metro when it saves them a long walk: to the station nearest them, up its lift, a wait on the
// platform, on through the train's doors, off at the station nearest where they're going, down its lift and on. How
// busy a station gets comes from that: from how many people it saves a walk (see mtPlanTrip, and mtReachFrom, which
// lets the metro bring far places within reach when people pick where to go out). The train holds MT_CAP; whoever it
// leaves behind is cross about it, all the more with only the one line in the city, and those kept waiting long enough
// give up and walk. A rider: p.metro = { l, k (the station they're at), to (the one they're going to), final (where
// they're headed after), st (what they're doing), t, x, z (where on the platform, in its frame), door }.
const MT_CAP = 12;                                // people to a train
const MT_DOORS = [-(MT_CL + MT_GAP) - MT_CAB_DOOR, 0, (MT_CL + MT_GAP) + MT_CAB_DOOR];   // the doors of a train standing at a station, along the platform from its middle
const MT_MIN_RIDERS = 2;                          // there's always someone riding (see mtAmbient)
const MT_PLAT_Y = .12;                            // the platform's surface, over the rail
const mtLines = () => metros.filter(l => l.train && l.stn && l.stn.size >= 2);
const mtW = (st, x, z) => { const e = st.e; return [e[0]*x + e[8]*z + e[12], e[2]*x + e[8 + 2]*z + e[14]]; };
const MT_WALK = d => d*1.3;                       // a walk through the streets, a little longer than the crow flies
// what a ride from one station to another costs, as the walk it's worth: a little for the ride itself, more for the lifts and the wait
const mtRideCost = (a, b) => Math.abs(a.s - b.s)*.25 + 8;
// the cheapest way from (ax, az) to (bx, bz) by metro, or null: { l, a, b, cost }
function mtBestRide(ax, az, bx, bz){
  let best = null;
  for (const l of mtLines()){ const S = [...l.stn.values()];
    for (const A of S){ const pa = mtW(A, 0, 0), wa = MT_WALK(Math.hypot(pa[0] - ax, pa[1] - az));
      for (const B of S){ if (B === A) continue; const pb = mtW(B, 0, 0), c = wa + mtRideCost(A, B) + MT_WALK(Math.hypot(pb[0] - bx, pb[1] - bz));
        if (!best || c < best.cost) best = { l, a: A, b: B, cost: c }; } } }
  return best;
}
// how far a place is from (ax, az), the metro taken into account: a function of the place's (x, z)
function mtReachFrom(ax, az){
  const lines = mtLines(); if (!lines.length) return null;
  const arr = [];   // each station, and the least it costs to be standing there having come from (ax, az)
  for (const l of lines){ const S = [...l.stn.values()];
    for (const B of S){ let c = Infinity; const pb = mtW(B, 0, 0);
      for (const A of S){ if (A === B) continue; const pa = mtW(A, 0, 0); c = Math.min(c, MT_WALK(Math.hypot(pa[0] - ax, pa[1] - az)) + mtRideCost(A, B)); }
      arr.push([pb[0], pb[1], c]); } }
  return (x, z) => { let d = Math.hypot(x - ax, z - az); for (const [sx, sz, c] of arr) d = Math.min(d, (c + MT_WALK(Math.hypot(x - sx, z - sz)))/1.3); return d; };
}
// should this person go to `want` by metro? { station (the place to walk to), l, from, to, final } or null
function mtPlanTrip(p, want){
  if (!pplReady || want.startsWith('mt:') || want.startsWith('v:') || (p.at && p.at.startsWith('mt:'))) return null;
  const from = places.get(p.at), to = places.get(want); if (!from || !to) return null;
  const walk = MT_WALK(Math.hypot(to.x - from.x, to.z - from.z)); if (walk < 11) return null;
  const r = mtBestRide(from.x, from.z, to.x, to.z); if (!r || r.cost > walk*.85 || !places.has(r.a.id)) return null;
  if (pplRand() > .85) return null;   // (a few walk anyway)
  return { station: r.a.id, l: r.l, from: r.a.k, to: r.b.k, final: want };
}
function mtNearestStation(x, z){ let best = null, bd = Infinity; for (const l of mtLines()) for (const st of l.stn.values()){ const [sx, sz] = mtW(st, 0, 0), d = Math.hypot(sx - x, sz - z); if (d < bd){ bd = d; best = st.id; } } return best; }
// at the foot of the station's lift: becomes a rider (up the lift first)
function mtEnter(p){
  const v = p.metroPlan; p.metroPlan = null;
  const l = v && metros.includes(v.l) ? v.l : null, st = l && l.stn && l.stn.get(v.from);
  if (!st || !l.stn.has(v.to) || !l.train){ return false; }
  p.metro = { l, k: v.from, to: v.to, final: v.final, st: 'up', t: 0, x: st.side*MT_LIFT_OFF, z: 0, waited: 0, missed: 0, slot: Math.floor(Math.random()*3) };
  p.until = Infinity; p.spot = null; return true;
}
const mtRidersOf = l => pplList.filter(p => p.metro && p.metro.l === l);
// still getting on or off this train?
function mtBusy(l, tr){ for (const p of pplList){ const m = p.metro; if (m && m.l === l && (m.st === 'board' || (m.st === 'alight' && m.t < 1.2))) return true; } return false; }
// which way the train goes from stop i next (it turns back at the ends)
const mtNextDir = (l, tr) => { const n = mtPath(l).stops.length; return tr.at + tr.dir < 0 || tr.at + tr.dir >= n ? -tr.dir : tr.dir; };
// the train has stopped at station k: those for here get off, then those waiting get on, as many as it has room for
function mtArrive(l, tr, k){
  const st = l.stn && l.stn.get(k); if (!st) return;
  let q = 0;
  for (const p of tr.load.slice()) if (p.metro && p.metro.to === k){ tr.load.splice(tr.load.indexOf(p), 1);
    Object.assign(p.metro, { k, st: 'alight', t: -.5 - q*.35, door: MT_DOORS[q % MT_DOORS.length] }); q++; }
  mtBoard(l, tr, k, true, q);
}
// those waiting at station k for the way it's going next get on, as many as there's room for; on the first call at a stop
// (first), the rest are told the train's full
function mtBoard(l, tr, k, first, q = 0){
  const st = l.stn && l.stn.get(k); if (!st) return;
  const dir = mtNextDir(l, tr), waiting = pplList.filter(p => p.metro && p.metro.l === l && p.metro.k === k && (p.metro.st === 'wait' || p.metro.st === 'toSpot'))
    .filter(p => { const to = l.stn.get(p.metro.to); return to && Math.sign(to.i - st.i) === dir; }).sort((a, b) => b.metro.waited - a.metro.waited);
  const single = mtLines().length <= 1;
  let room = MT_CAP - tr.load.length, b = 0;
  for (const p of waiting){
    if (room > 0){ room--; Object.assign(p.metro, { st: 'board', t: -.6 - q*.2 - b*.35, door: MT_DOORS[(b + 3) % MT_DOORS.length] }); tr.load.push(p); b++; }
    else if (first){ p.metro.missed++; if (single || p.metro.missed > 1){ emote(p, 'anger', 2.6); p.metro.fume = pplNow + 1.2; } else emote(p, 'sweat', 2); }   // left behind: full
  }
}
// a rider's next step, every frame
function mtRiders(dt, t){
  for (const l of metros) if (l.train) l.train.load = l.train.load.filter(p => people.has(p.id) && p.metro && p.metro.l === l && (p.metro.st === 'ride' || p.metro.st === 'board'));   // (anyone gone from the city is gone from the train)
  for (const p of pplList){
    const m = p.metro; if (!m) continue;
    const l = m.l, st = l && l.stn && l.stn.get(m.k);
    if (!metros.includes(l) || !st || !places.has(st.id)){ p.metro = null; if (places.has(p.at)) p.until = pplNow; else sendHome(p); continue; }   // the line or the station is gone
    const tr = l.train;
    if (m.st === 'ride'){ if (!tr || !tr.load.includes(p)){ const to = l.stn.get(m.to); if (to){ m.k = m.to; p.at = to.id; m.st = 'down'; m.t = 0; } else { p.metro = null; sendHome(p); } } continue; }   // (the line was rebuilt under them: off at their stop)
    m.t += dt;
    const move = (tx, tz, sp) => { const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz), step = sp*dt; if (d <= step){ m.x = tx; m.z = tz; return true; } m.x += dx/d*step; m.z += dz/d*step; m.dx = dx; m.dz = dz; return false; };
    const sp = p.speed*.9;
    if (m.st === 'up' || m.st === 'cabUp' || m.st === 'cabDown' || m.st === 'liftTop') continue;   // (at the lift: see mtLifts)
    else if (m.st === 'toSpot'){ if (move(m.spot[0], m.spot[1], sp)){ m.st = 'wait'; m.t = 0; } m.waited += dt; }
    else if (m.st === 'wait'){
      m.waited += dt;
      const crowd = pplList.filter(q => q.metro && q.metro.l === l && q.metro.k === m.k && q.metro.st === 'wait').length;
      const single = mtLines().length <= 1, patience = (single ? 28 : 60)*(1 - Math.min(.5, crowd/MT_CAP*.4));
      if (!(p.emoUntil > pplNow)){
        if (m.waited > patience && Math.random() < dt*(.12 + .1*m.missed)){ emote(p, 'anger', 2.4); m.fume = pplNow + 1.1; }
        else if (m.waited > 12 && Math.random() < dt*.04) emote(p, 'dots', 2); }
      if (Math.random() < dt*.02 && m.spot && m.spot[2] !== 'seat'){ const n = mtSpotFor(l, st, p); if (Math.hypot(n[0] - m.x, n[1] - m.z) < 1.2){ m.spot = n; m.st = 'toSpot'; m.t = 1; } }   // shifting about
      if (!m.ambient && m.waited > patience*3){ m.st = 'leave'; m.t = 0; emote(p, 'anger', 2.2); }   // that's it: they'll walk
    }
    else if (m.st === 'board'){
      if (m.t < 0) continue;   // (their turn at the door)
      const ex = st.side*.62, dzj = m.door + (m.dj ?? (m.dj = (Math.random() - .5)*.3));   // (through any part of the doorway)
      if (!m.atDoor){ if (move(ex, dzj, sp*1.2)) m.atDoor = true; }
      else if (move(st.side*.22, dzj, sp)){ m.st = 'ride'; m.atDoor = false; m.dj = undefined; }
    }
    else if (m.st === 'alight'){
      if (m.t < 0){ m.x = st.side*.22; m.z = m.door + (Math.random() - .5)*.3; continue; }
      if (!m.out){ if (move(st.side*.66, m.z, sp)) m.out = true; }
      else if (move(st.side*(MT_LIFT_OFF - .1), m.lz ?? (m.lz = (Math.random() - .5)*.3), sp)){ m.st = 'liftTop'; m.t = 0; m.out = false; m.lz = undefined; }   // into the lift, to wait for the cab
    }
    else if (m.st === 'leave'){ if (move(st.side*(MT_LIFT_OFF - .1), 0, sp)){ m.st = 'liftTop'; m.t = 0; m.giveUp = true; } }
    else if (m.st === 'down'){
      {   // out of the cab at the foot of the lift: on their way
        const fin = m.final, amb = m.ambient; p.metro = null; p.at = st.id; if (amb) p.home = st.id;   // (an outsider: they'll look round here)
        if (fin && places.has(fin) && startTrip(p, fin)){} else p.until = pplNow + (amb ? .5 : 2);
      }
    }
  }
  mtLifts(dt, t);
  mtAmbient(t);
}
// a place to stand on the platform: in rows along the way-out side, the nearest free one; once they're all taken, in among the crowd
function mtSpotFor(l, st, p){
  // all over the platform: three rows of standing room along it and the benches' seats, a free place picked at random
  // (a little likelier nearer the lift), never right on top of someone else
  const others = []; for (const q of pplList){ const m = q.metro; if (q !== p && m && m.l === l && m.k === st.k && m.spot && (m.st === 'wait' || m.st === 'toSpot')) others.push(m.spot); }
  const free = ([x, z]) => others.every(o => Math.hypot(o[0] - x, o[1] - z) > .24);
  const cand = [];
  for (const sz of [-1.05, -.75, .75, 1.05]) cand.push([st.side*1.06, sz, 'seat']);   // the benches
  for (let i = 0; i < 40; i++){ const x = .66 + Math.random()*.36, z = (Math.random()*2 - 1)*1.62;
    if (x > .95 && ((Math.abs(z) > .6 && Math.abs(z) < 1.2) || z < -1.35)) continue;   // (not on the benches or the vending machine)
    cand.push([st.side*x, z]); }
  const ok = cand.filter(free); if (!ok.length) return [st.side*(.66 + Math.random()*.36), (Math.random()*2 - 1)*1.5];
  ok.sort((a, b) => Math.abs(a[1])*.4 + Math.random() - (Math.abs(b[1])*.4 + Math.random()));
  return ok[0];
}
// where a rider is drawn, and how (null: out of sight, in the lift or on the train)
function mtPose(p, t, dt){
  const m = p.metro, st = m.l && m.l.stn && m.l.stn.get(m.k); if (!st) return null;
  if (m.st === 'ride' || m.st === 'down') return null;
  const lc = (m.st === 'up' || m.st === 'cabUp' || m.st === 'cabDown') && m.l.cabs && m.l.cabs.find(c => c.k === m.k);
  if (lc){   // at the foot waiting, or in the cab going up or down: inside the shaft, a little apart from the others in it
    const a = m.slot*2.1 + .4, r = m.slot ? .2 : .05, y = m.st === 'up' ? CURB : lc.y + .02;
    const sd = Math.cos(a)*_camR.x + Math.sin(a)*_camR.z; p.flip = sd < 0 ? -1 : 1;
    return { x: lc.x + Math.cos(a)*r, y, z: lc.z + Math.sin(a)*r, frame: F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle, alpha: 1 }; }
  if (m.st === 'board' && m.t < 0) { /* waiting their turn: where they stood */ }
  if (m.st === 'alight' && m.t < 0) return null;
  let alpha = 1;

  if (m.st === 'board' && m.atDoor) alpha = Math.max(0, Math.min(1, (Math.abs(m.x) - .22)/.3));   // through the doors
  if (m.st === 'alight' && !m.out) alpha = Math.max(0, Math.min(1, (Math.abs(m.x) - .22)/.3));
  const [x, z] = mtW(st, m.x, m.z), walking = m.st === 'toSpot' || (m.st === 'board' && m.t >= 0) || (m.st === 'alight' && m.t >= 0) || m.st === 'leave';
  let frame;
  if (walking) frame = Math.floor(t*9*p.speed/PPL_SPEED + p.phase) % PPL.walk;
  else if (m.fume > pplNow) frame = F_ANGRY + Math.min(5, Math.floor((1.2 - (m.fume - pplNow))*6));   // stamping and shaking a fist
  else if (m.st === 'wait' && m.spot && m.spot[2] === 'seat'){ frame = F_SIT + Math.floor(t*1.2 + p.phase) % 4; return { x, y: MT_Y + MT_PLAT_Y + .06, z, frame, alpha }; }   // on a bench
  else frame = F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle;
  if (walking && m.dx !== undefined){ const e = st.e, wx = e[0]*m.dx + e[8]*m.dz, wz = e[2]*m.dx + e[10]*m.dz, sd = wx*_camR.x + wz*_camR.z; if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1; }
  else if (!walking){ const e = st.e, wx = -e[0]*st.side, wz = -e[2]*st.side, sd = wx*_camR.x + wz*_camR.z; if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1; }   // waiting: facing the track
  return { x, y: MT_Y + MT_PLAT_Y, z, frame, alpha };
}
// There's always someone riding: a line with fewer than MT_MIN_RIDERS on it gets an outsider at one of its stations,
// going to another. Off the train they look round the town for a while (like the highways' visitors), then leave by
// the nearest station.
let mtAmbSeq = 0;
function mtAmbient(t){
  if (!pplReady) return;
  for (const l of mtLines()){
    if ((l.ambAt || 0) > t) continue;
    const n = mtRidersOf(l).length; if (n >= MT_MIN_RIDERS){ l.ambAt = t + 2; continue; }
    l.ambAt = t + 3 + Math.random()*4;
    const S = [...l.stn.values()].filter(st => places.has(st.id)); if (S.length < 2) continue;
    const a = S[Math.floor(Math.random()*S.length)]; let b = a; while (b === a) b = S[Math.floor(Math.random()*S.length)];
    const id = 'mtr:' + (++mtAmbSeq) + ':' + l.id, p = makePerson(id, a.id);
    Object.assign(p, { visitor: true, wantsJob: false, courier: false, leaveAt: pplNow + 90 + Math.random()*150, at: a.id, until: Infinity });
    p.metro = { l, k: a.k, to: b.k, final: null, ambient: true, st: 'up', t: 0, x: a.side*MT_LIFT_OFF, z: 0, waited: 0, missed: 0, slot: Math.floor(Math.random()*3) };
    people.set(id, p); pplList.push(p);
  }
}
// the door leaves: two to a door each side, sliding apart into the car's walls at a station (on the side its platform's
// way out is), shut the rest of the time
const MT_LEAF = (() => { const g = new THREE.Group(), mk = (mat, y, z, sy, sz, x = 0) => { const m = new THREE.Mesh(U.box, mat); m.position.set(x, y, z); m.scale.set(.02, sy, sz); g.add(m); };
  const w = MT_DOOR_W/2, h = MT_DOOR_H;
  mk(MTM.body2, 0, 0, h, w - .01); mk(MTM.win, 0, h*.18, h*.42, w - .1, .006); mk(MTM.body, 0, -h*.3, h*.3, w - .1, .004);
  const f = hwFold(g), meshes = [];
  for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]){ if (!geo) continue; const m = new THREE.InstancedMesh(geo, mat, MT_CAR_MAX*4); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); meshes.push(m); }
  return { meshes, n: 0 }; })();
const _mlv = new THREE.Matrix4(), _mlw = new THREE.Matrix4(), _mls = new THREE.Matrix4();
// the leaves of car q (its matrix M) of a train: open, how far its doors on side `side` are open
function mtLeaves(M, q, side, open){
  const dz = q === 1 ? 0 : q === 0 ? -MT_CAB_DOOR : MT_CAB_DOOR, w = MT_DOOR_W/2, y = (.13)*MT_SY + MT_DOOR_H/2;
  for (const s of [-1, 1]){ const o = s === side ? open : 0;
    for (const e of [-1, 1]){ if (MT_LEAF.n >= MT_CAR_MAX*4) return;
      _mlv.makeTranslation(s*.396, y, dz + e*(w/2 + o*w/2)).multiply(_mls.makeScale(1, 1, Math.max(.001, 1 - o)));   // (slid away into the wall either side: a cab car has no room to slide them over its wall, it would reach past its end)
      _mlw.multiplyMatrices(M, _mlv); for (const m of MT_LEAF.meshes) m.setMatrixAt(MT_LEAF.n, _mlw); MT_LEAF.n++; } }
}
// (the old lit door gaps: gone, the doors are real now)
const mtDoorMesh = (() => { const m = new THREE.InstancedMesh(U.box, new THREE.MeshBasicMaterial({ color: 0xf0ffe8 }), 192); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; })();
const _mdM = new THREE.Matrix4(), _mdL = new THREE.Matrix4();
function mtDrawDoors(){
  for (const m of MT_LEAF.meshes){ m.count = MT_LEAF.n; m.visible = MT_LEAF.n > 0; if (MT_LEAF.n) m.instanceMatrix.needsUpdate = true; }
  return;
  let n = 0;
  for (const l of metros){ const tr = l.train; if (!tr || !l.stn || tr.dwell <= 0 || tr.doors <= .01) continue;
    const st = l.stn.get(mtPath(l).stops[tr.at].k); if (!st) continue;
    _mdM.fromArray(st.e);
    for (const dz of MT_DOORS) for (const [x, y, h] of [[.413, MT_LEV + .12 + .36, .58], [.55, MT_PLAT_Y + .36, .66]]){ if (n >= 192) break;   // the train's doors, and the platform's screen doors in line with them
      _mdL.makeTranslation(st.side*x, y, dz).multiply(new THREE.Matrix4().makeScale(.012, h, .28*tr.doors));
      mtDoorMesh.setMatrixAt(n++, _mdM.clone().multiply(_mdL)); } }
  mtDoorMesh.count = n; mtDoorMesh.visible = n > 0; if (n) mtDoorMesh.instanceMatrix.needsUpdate = true;
}

// The station lifts: each cab carries riders between the street and the platform, three at a time. Idle at an end, it
// takes whoever is waiting there; if nobody is but someone waits at the other end, it goes to fetch them. It stops a
// moment at each end for people to get in and out.
const MT_LIFT_CAP = 3, MT_LIFT_V = 1.5;
function mtLifts(dt, t){
  for (const l of metros){ if (!l.cabs || !l.stn) continue;
    for (const c of l.cabs){
      const st = l.stn.get(c.k); if (!st) continue;
      const here = q => q.metro && q.metro.l === l && q.metro.k === c.k;
      const atBot = pplList.filter(q => here(q) && q.metro.st === 'up'), atTop = pplList.filter(q => here(q) && q.metro.st === 'liftTop');
      if (c.state === 'move'){
        const d = c.target - c.y, step = MT_LIFT_V*dt*Math.min(1, .35 + Math.abs(d));   // (easing in at the end)
        if (Math.abs(d) <= step){ c.y = c.target; c.state = 'idle'; c.hold = .8;
          for (const q of pplList){ const m = q.metro; if (!here(q)) continue;
            if (m.st === 'cabUp'){ m.st = 'toSpot'; m.t = 1; m.x = st.side*(MT_LIFT_OFF - .1); m.z = (m.slot - 1)*.18; m.spot = mtSpotFor(l, st, q); }   // out onto the platform
            else if (m.st === 'cabDown'){ m.st = 'down'; m.t = 0; } } }   // out at the street
        else c.y += Math.sign(d)*step;
        continue;
      }
      if ((c.hold -= dt) > 0) continue;
      const bot = c.y <= c.y0 + .01, top = c.y >= c.y1 - .01;
      const go = (to, who, as) => { who.slice(0, MT_LIFT_CAP).forEach((q, i) => { q.metro.st = as; q.metro.slot = i; }); c.target = to; c.state = 'move'; };
      if (bot && atBot.length) go(c.y1, atBot, 'cabUp');
      else if (top && atTop.length) go(c.y0, atTop, 'cabDown');
      else if (bot && atTop.length){ c.target = c.y1; c.state = 'move'; }
      else if (top && atBot.length){ c.target = c.y0; c.state = 'move'; }
    }
  }
}
