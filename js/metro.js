// Neon Terrarium: the Magrail metro. An elevated maglev line at one fixed height (level with the hydroponic farm's
// glass roof), after the reference: a guideway on pillars, an overhead box girder carried on C-frames, green circuit
// traces along it and MAGRAIL GREEN LINE boards; a three-car train, its windows and belt lines lit green, its bogies
// riding the girder overhead. Stations: platforms either side under a canopy, screen doors, a lift down to the street.
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
const MT_OH = 1.3, MT_OHT = .36, MT_OL = .74;    // the overhead girder: its underside above the rail, its depth, how far it sits to one side
const MT_TOP = MT_Y + 2.1;                       // the top of it all (the stations' canopies)
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
  const t = l.tiles[k], { dout } = hwDirs(l, k), rx = -dout[1]*side, rz = dout[0]*side, off = SIDE/2 + .25, r = .24;
  const sx = t.i*LOT + rx*off, sz = t.j*LOT + rz*off;
  return { sx, sz, r, dx: dout[0], dz: dout[1], rx, rz, wall: { x: sx + dout[0]*(r + .02), z: sz + dout[1]*(r + .02) }, stand: { x: sx + dout[0]*(r + .34), z: sz + dout[1]*(r + .34) } };
}
function mtLiftOK(l, k, side){
  const S_ = mtLiftSpot(l, k, side), c = cells.get(ckey(Math.round(S_.stand.x/LOT), Math.round(S_.stand.z/LOT))), c2 = cells.get(ckey(Math.round(S_.sx/LOT), Math.round(S_.sz/LOT)));
  if (!c || !c2 || c.mega || c2.mega) return false;
  if (!freeAt(cellGrid(c2), S_.sx, S_.sz)) return false;
  for (const l2 of metros) for (const k2 of mtStops(l2)){ if (l2 === l && k2 === k) continue; const s2 = l2.sides && l2.sides[k2]; if (!s2) continue; const o = mtLiftSpot(l2, k2, s2); if (Math.hypot(o.sx - S_.sx, o.sz - S_.sz) < .8) return false; }
  return freeAt(cellGrid(c), S_.stand.x, S_.stand.z);
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
      return { type: 'finish', l, k, ok: true, why: '' };
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
    const why = mtTileWhy(i, j);
    return { type: 'extend', l, i, j, ok: !why, why };
  }
  const why = mtTileWhy(i, j);
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
  lit: toon(0x3a4a3a, { em: 0xd8ffe0, kind: 'lamp' }), tactile: toon(0xd9b43a),
  // the train
  body: toon(0x7a828c), body2: toon(0x4c525a), dark: toon(0x1c1f24), win: toon(0x1a3a12, { em: 0x9aff6a, kind: 'window' }), glass: toon(0x163010, { em: 0x3a8a28, kind: 'window' }),
  head: toon(0x5a5a50, { em: 0xf0fff0, kind: 'lamp' }), sil: toon(0x0a1a0a), belt: toon(0x184010, { em: 0x5aff2a, kind: 'neon' }),
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
    // the guideway: the deck on a box girder, rails, a green line down each side
    hwSweep(MTM.deck, pts, 0, -MT_DECK/2, W, MT_DECK);
    hwSweep(MTM.girder, pts, 0, -MT_DECK - MT_GIRD/2 + .02, W*.55, MT_GIRD);
    for (const s of [-1, 1]){
      hwSweep(MTM.rail, pts, s*.26, .03, .07, .06);                          // the guide rails
      hwSweep(MTM.deck2, pts, s*(W/2 - .04), .07, .08, .14);                  // the low kerb
      hwSweep(MTM.green, pts, s*(W/2 + .006), -MT_DECK*.45, .012, .04);       // the green line along its side
    }
    // the overhead girder: a dark box beam over the train, green circuit traces along both its faces
    hwSweep(MTM.beam, pts, MT_OL, MT_OH + MT_OHT/2, .46, MT_OHT);
    hwSweep(MTM.beam2, pts, MT_OL - .06, MT_OH + .02, .2, .04);              // the bogie rail under it
    for (const s of [-1, 1]){ hwSweep(MTM.green, pts, MT_OL + s*.235, MT_OH + MT_OHT*.62, .012, .025); hwSweep(MTM.frame, pts, MT_OL + s*.235, MT_OH + MT_OHT + .01, .03, .03); }
    for (let q = 0; q + 1 < pts.length; q++){
      const a = pts[q], b = pts[q + 1];
      if (q % 9 === 4) for (const s of [-1, 1]) hwSeg(MTM.green, a, b, MT_OL + s*.237, MT_OH + MT_OHT*.38, .012, .025, .25);   // the traces' branches, dropping a step
      if (q % 9 === 6) for (const s of [-1, 1]) hwSeg(MTM.green2, a, b, MT_OL + s*.238, MT_OH + MT_OHT*.38, .014, .04, -.2);
      if (q % 6 === 2) for (const s of [-1, 1]) hwSeg(MTM.deck2, a, b, s*(W/2 + .01), -MT_DECK*.5, .02, MT_DECK*.8, -.12);   // panel seams
    }
    // per plot: a C-frame carrying the girder (not at the stations: the canopy does there), MAGRAIL boards on the girder
    for (let k = 0; k < n; k++){
      const stop = stops.includes(k);
      if (!stop){   // a post up the girder's side of the deck, a bracket under the girder (local -x is the line's +lat side)
        const F = mtFrame(l, k, .5), px = -(MT_OL + .25);
        box(MTM.pillar, F, px, (MT_OH - MT_DECK)/2, 0, .16, MT_OH + MT_DECK, .22);
        box(MTM.pillar, F, -(MT_OL + .05), MT_OH - .06, 0, .5, .12, .24);
        box(MTM.pillar2, F, -(W/2 + .06), -MT_DECK*.5, 0, .5, .18, .3);                                // its knee on the deck's edge
        box(MTM.green, F, px - .081, MT_OH*.45, 0, .012, MT_OH - .4, .03);
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
        box(MTM.deck2, F, 0, .14, 0, W, .28, .12); for (let x = -W/2 + .12; x < W/2; x += .26) box(M.hazard, F, x, .15, -.07, .12, .2, .012);
        for (const s of [-1, 1]){ box(M.blink, F, s*(W/2 - .1), .34, 0, .06, .06, .06); glow(F, s*(W/2 - .1), .34, -.1, 'red', .3); }
        continue;
      }
      if (k === n - 1 && n === 1) continue;
      const F = under(mtFrame(l, k, u), T(0, 0, back ? .12 : -.12, back ? PI : 0));
      box(MTM.deck2, F, 0, .2, 0, W - .1, .26, .16); box(M.hazard, F, 0, .2, .085, W - .2, .12, .012);
      for (const s of [-1, 1]) box(MTM.pillar, F, s*.32, .3, -.12, .12, .45, .12);
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
    add(U.cyl16, MTM.canopy, 0, .03, 0, .4, .06, .4); add(U.cyl16, MTM.canopy, 0, .93, 0, .42, .07, .42);
    for (const y of [.08, .88]) add(U.torus, MTM.green, 0, y, 0, .44, .44, .3).rotation.x = PI/2;
    for (let q = 0; q < 4; q++){ const a = q*PI/2 + PI/4; add(U.box, MTM.green2, Math.sin(a)*.19, .48, Math.cos(a)*.19, .018, .8, .018); }
    const f = hwFold(cab), folded = new THREE.Group();
    for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]) if (geo){ const m = new THREE.Mesh(geo, mat); m.userData.own = true; folded.add(m); }
    folded.position.set(Ls.sx, CURB, Ls.sz); l.fx.add(folded); l.cabs.push({ g: folded, y0: CURB + .02, y1: MT_Y + .14, ph: (l.id*.37 + k*.21) % 1 });
  }
  shadowDirty = true;
}
// a station on plot k (always straight track): a platform either side, glass screen doors, a canopy over it all, a
// STATION board at each end, benches, a ticket gate, and the bridge to the lift on its lift side
function mtStation(l, k){
  const F = mtFrame(l, k, .5), W = MT_W, Lp = LOT - .2, px = W/2 + MT_PLAT/2, side = -(l.sides[k] || 0), ph = .12;   // (side: the lift's, in this frame, where local +x is the way mtLiftSpot calls -1)
  for (const s of [-1, 1]){
    box(MTM.plat2, F, s*px, -.12, 0, MT_PLAT, .28, Lp);                         // the platform
    box(MTM.plat, F, s*px, ph - .01, 0, MT_PLAT - .02, .02, Lp - .02);
    box(MTM.tactile, F, s*(W/2 + .1), ph + .002, 0, .06, .01, Lp - .1);         // the yellow line along its edge
    box(MTM.green, F, s*(W/2 + .005), ph - .06, 0, .012, .04, Lp);
    // the screen doors: glass panels in green-lit frames, a gap where each car's doors stop
    for (let z = -Lp/2 + .1; z < Lp/2 - .05; z += .48) box(MTM.frame, F, s*(W/2 + .03), ph + .38, z, .04, .76, .04);
    box(MTM.lit, F, s*(W/2 + .03), ph + .74, 0, .02, .03, Lp - .2);
    put(U.box, MT_GLASS, under(F, T(s*(W/2 + .03), ph + .38, 0, 0, .02, .7, Lp - .1)));
    box(MTM.green, F, s*(W/2 + .035), ph + .78, 0, .012, .025, Lp - .1);
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
    const x0 = side*(W/2 + MT_PLAT), x1 = side*(SIDE/2 + .25 - .22);
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
    const top = MT_Y + 1.15, P = T(Ls.sx, 0, Ls.sz, Math.atan2(Ls.dx, Ls.dz)), r = Ls.r;
    put(U.cyl16, MT_GLASS, under(P, T(0, (CURB + top)/2, 0, 0, 2*r, top - CURB, 2*r)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(MTM.frame, P, sx*r*.72, (CURB + top)/2, sz*r*.72, .045, top - CURB, .045);
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
  const zb0 = -L/2 + .04, zb1 = cab ? L/2 - .36 : L/2 - .04, bl = zb1 - zb0, bz = (zb0 + zb1)/2;
  add(MTM.body, 0, y0 + .3, bz, Wb, .6, bl);                                      // the lower body
  add(MTM.body, 0, y0 + .6 + (H - .6 - rr)/2, bz, Wb - .03, H - .6 - rr, bl);      // the upper body, a little in at the windows
  add(MTM.body, 0, y0 + H - rr/2, bz, Wb - 2*rr, rr, bl);                          // the roof, its edges rounded down
  for (const s of [-1, 1]) add(MTM.body, s*(Wb/2 - rr*.62), y0 + H - rr*.62, bz, rr*1.15, rr*.55, bl, 0, s*.7);
  add(MTM.body2, 0, y0 + H + .005, bz, Wb - .34, .015, bl - .1);                     // the roof's centre panel
  // the skirt underneath: dark, vented, the green underglow along it
  add(MTM.dark, 0, y0 - .04, 0, Wb - .1, .1, L - .08);
  for (let z = -L/2 + .2; z < L/2 - .15; z += .18) for (const s of [-1, 1]) add(MTM.body2, s*(Wb/2 - .05), y0 - .04, z, .01, .06, .1);
  add(MTM.belt, 0, y0 - .095, 0, Wb - .3, .015, L - .3);
  for (const s of [-1, 1]){
    const sx = s*(Wb/2), sxu = s*((Wb - .03)/2);
    // panel seams, and the three green lines: under the roof, over the windows' sills, along the belt
    add(MTM.body2, sx + s*.003, y0 + .6, bz, .006, .012, bl);
    add(MTM.belt, sxu + s*.006, y0 + H - rr - .02, bz, .008, .022, bl - .04);
    add(MTM.belt, sx + s*.006, y0 + .4, bz, .008, .02, bl - .04);
    add(MTM.belt, sx + s*.006, y0 + .13, bz, .008, .03, bl - .04);
    // the doors, a pair to a side: dark leaves with a lit window each, outlined in green
    const doors = cab ? [zb0 + .26, zb1 - .3] : [-L*.3, L*.3];
    for (const zd of doors){
      add(MTM.dark, sx + s*.004, y0 + .36, zd, .008, .62, .27);
      for (const o of [-.066, .066]){ add(MTM.win, sx + s*.008, y0 + .5, zd + o, .006, .2, .09); add(MTM.body2, sx + s*.007, y0 + .26, zd + o, .006, .26, .1); }
      add(MTM.belt, sx + s*.01, y0 + .36, zd, .006, .62, .008);                       // the seam between the leaves
      for (const e of [-.137, .137]) add(MTM.belt, sx + s*.01, y0 + .36, zd + e, .006, .64, .012);
      add(MTM.belt, sx + s*.01, y0 + .675, zd, .006, .012, .29);
    }
    // the windows between the doors (and beyond them): green-lit panes with people in them
    const spans = [[zb0 + .08, doors[0] - .17], [doors[0] + .17, doors[1] - .17], [doors[1] + .17, zb1 - .08]];
    for (const [za, zz] of spans){
      const n = Math.max(1, Math.round((zz - za)/.24)), w = (zz - za)/n;
      for (let q = 0; q < n; q++){
        const zc = za + (q + .5)*w;
        add(MTM.win, sxu + s*.004, y0 + .72, zc, .006, .22, w - .04);
        add(MTM.body2, sxu + s*.006, y0 + .72, za + q*w, .008, .24, .025);                // the mullion
        if (R_() < .75){ const px = zc + (R_() - .5)*w*.4, tall = .03 + R_()*.03;      // a passenger: head and shoulders against the light
          add(MTM.sil, sxu + s*.006, y0 + .66 + tall, px, .006, .07, .055); add(MTM.sil, sxu + s*.006, y0 + .63 + tall*.5, px, .006, .06, .11); }
      }
      add(MTM.body2, sxu + s*.006, y0 + .72, zz, .008, .24, .025);
    }
  }
  // the gangway bellows at the inner ends
  for (const e of cab ? [-1] : [-1, 1]){ add(MTM.dark, 0, y0 + .42, e*(L/2 - .005), .58, .66, .06); for (const yy of [.2, .42, .64]) add(MTM.body2, 0, y0 + yy, e*(L/2 + .012), .6, .02, .02); }
  // the roof: equipment boxes with grilles, and the hanger: a forked arm up to the bogie riding the girder at the side
  for (const zc of [-L*.26, L*.18]){ add(MTM.body2, 0, y0 + H + .05, zc, .36, .09, .28); for (let x = -.12; x <= .13; x += .06) add(MTM.dark, x, y0 + H + .1, zc, .025, .012, .22); }
  { const bx = -MT_OL + .06, by = MT_OH - .07, base = y0 + H + .06;
    add(MTM.dark, -.12, base, L*.02, .16, .06, .24);
    for (const o of [-.08, .08]){ const ax = -.12, ay = base + .02, len = Math.hypot(bx - ax, by - ay); add(MTM.dark, (ax + bx)/2, (ay + by)/2, L*.02 + o, len, .04, .04, 0, Math.atan2(by - ay, bx - ax)); }
    add(MTM.body2, bx, by + .02, L*.02, .2, .08, .46);                                  // the bogie
    for (const o of [-.15, .15]) add(MTM.dark, bx, by + .07, L*.02 + o, .12, .05, .07);   // its wheels on the rail
    add(MTM.belt, bx + .1, by + .02, L*.02, .01, .02, .4); }
  if (cab){
    // the nose: a short lower front, the big sloped windscreen in a dark frame, the cap over it, rounded corners
    const zn = L/2 - .36, yf = .48, ang = Math.atan2(H - .02 - yf, .3), cz = zn + .19, cy = y0 + (yf + H - .02)/2, nY = Math.cos(ang), nZ = Math.sin(ang);
    add(MTM.body, 0, y0 + yf/2, zn + .17, Wb - .02, yf, .34);                          // the lower front
    for (const s of [-1, 1]) add(MTM.body, s*(Wb/2 - .09), y0 + yf/2, zn + .3, .2, yf, .1, 0, 0, s*.55);   // its rounded corners
    add(MTM.body, 0, cy - nY*.11, cz - nZ*.11, Wb - .02, .22, .4, ang);                 // the sloped wedge the windscreen sits in
    add(MTM.dark, 0, cy + nY*.004, cz + nZ*.004, Wb - .06, .012, .38, ang);              // the windscreen's frame
    add(MTM.glass, 0, cy + nY*.01, cz + nZ*.01, Wb - .18, .012, .32, ang);               // the windscreen, lit
    add(MTM.dark, 0, cy + nY*.016, cz + nZ*.016, .02, .012, .32, ang);                  // its centre post
    for (const x of [-.15, .17]) add(MTM.sil, x, cy + nY*.017 - .02, cz + nZ*.017 - .03, .1, .006, .1, ang);   // the drivers, dark against the lit cab
    for (const s of [-1, 1]) add(MTM.belt, s*(Wb/2 - .005), cy - nY*.05, cz - nZ*.05, .008, .02, .4, ang);
    add(MTM.body, 0, y0 + H - .07, zn + .02, Wb - .06, .14, .1);                          // the cap
    add(MTM.dark, 0, y0 + H - .07, zn + .075, .36, .07, .012); add(MTM.glass, 0, y0 + H - .07, zn + .082, .32, .045, .006);   // the destination board
    for (const s of [-1, 1]){ add(MTM.dark, s*.26, y0 + .3, zn + .362, .16, .07, .01); add(MTM.head, s*.24, y0 + .3, zn + .368, .07, .04, .006); add(MTM.head, s*.31, y0 + .3, zn + .368, .04, .04, .006); }   // the headlights
    add(MTM.belt, 0, y0 + .16, zn + .365, Wb - .2, .025, .008);                           // the green strip across the front
    add(MTM.dark, 0, y0 - .02, zn + .32, Wb - .2, .1, .14);                               // the coupler skirt
    add(MTM.body2, 0, y0 + .04, zn + .385, .14, .06, .04);
  }
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
// the line's centre as a path the train follows ({ X, Y, Z, cum, len }), and where along it each stop's middle is
function mtPath(l){
  if (l.path) return l.path;
  const S = mtSamples(l, .15), X = [], Y = [], Z = [], cum = [0];
  for (const p of S){ X.push(p.x); Y.push(p.y); Z.push(p.z); }
  for (let q = 1; q < S.length; q++) cum.push(cum[q - 1] + Math.hypot(X[q] - X[q - 1], Z[q] - Z[q - 1]));
  const sAt = (k, u) => { for (let q = 0; q < S.length; q++) if (S[q].k > k || (S[q].k === k && S[q].u >= u - 1e-6)) return cum[q]; return cum[cum.length - 1]; };
  const len = cum[cum.length - 1], half = (MT_CARS*MT_CL + (MT_CARS - 1)*MT_GAP)/2 + .12;   // (at the ends, the train stops short enough to stay on the track)
  const stops = mtStops(l).map(k => ({ k, s: Math.max(half, Math.min(len - half, sAt(k, .5))) }));
  return (l.path = { X: Float32Array.from(X), Y: Float32Array.from(Y), Z: Float32Array.from(Z), cum: Float32Array.from(cum), len: cum[cum.length - 1], stops });
}
function mtResetTrain(l){
  l.path = null; l.train = null;
  if (!l.done || l.tiles.length < 2) return;
  const P = mtPath(l); if (P.stops.length < 2) return;
  l.train = { s: P.stops[0].s, v: 0, dir: 1, at: 0, dwell: 2 + (l.id % 3) };
}
const _mpos = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, _mdm = new THREE.Object3D();
function updateMetros(dt, t){
  for (const M_ of MT_MODELS) M_.n = 0;
  let ng = 0;
  const night = typeof isNight === 'function' && isNight(S.hour);
  for (const l of metros){
    const tr = l.train; if (!tr || !l.view) continue;
    const P = mtPath(l), stops = P.stops;
    // the run: dwell at a stop, then on to the next one along (turning back at the ends), easing in and out
    if (tr.dwell > 0){
      tr.dwell -= dt; tr.v = 0;
      if (tr.dwell <= 0){
        if (tr.at + tr.dir < 0 || tr.at + tr.dir >= stops.length) tr.dir = -tr.dir;
        tr.next = tr.at + tr.dir;
      }
    } else {
      const goal = stops[tr.next].s, d = goal - tr.s, dist = Math.abs(d);
      const vCap = Math.sqrt(2*MT_ACC*Math.max(0, dist - .02));
      tr.v = Math.min(MT_VMAX, tr.v + MT_ACC*dt, vCap + .05);
      const step = Math.min(dist, tr.v*dt); tr.s += Math.sign(d)*step;
      if (dist - step < .005){
        tr.s = goal; tr.at = tr.next; tr.v = 0; tr.dwell = MT_DWELL + Math.random()*2;
        const k = stops[tr.at].k, side = l.sides && l.sides[k];
        if (side && typeof spawnVisitor === 'function') for (let q = 0; q < 2; q++) if (Math.random() < .5) spawnVisitor('mt:' + l.id + ':' + k);   // someone gets off
      }
    }
    // the cars: one ahead of the middle of the train, one behind, a cab at each end facing out
    let cur = 0;
    for (let q = 0; q < MT_CARS; q++){
      const off = (q - (MT_CARS - 1)/2)*(MT_CL + MT_GAP), s = Math.max(0, Math.min(P.len, tr.s + off));
      const a = Math.max(0, s - .25), b = Math.min(P.len, s + .25);
      cur = hwAlong(P, s, cur, _mpos); const p0 = {}, p1 = {}; hwAlong(P, a, 0, p0); hwAlong(P, b, 0, p1);
      const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z), cab = q === 0 || q === MT_CARS - 1;
      _mdm.position.set(_mpos.x, _mpos.y + .02 + .015*Math.sin(t*2.2 + l.id + q), _mpos.z);
      _mdm.rotation.set(0, yaw, 0, 'YXZ'); _mdm.scale.setScalar(1); _mdm.updateMatrix();
      const M_ = MT_MODELS[!cab ? 0 : q === 0 ? 2 : 1]; if (M_.n < MT_CAR_MAX){ for (const m of M_.meshes) m.setMatrixAt(M_.n, _mdm.matrix); M_.n++; }
      if (ng < MT_CAR_MAX){ _mdm.position.set(_mpos.x, _mpos.y + .012, _mpos.z); _mdm.rotation.set(0, yaw, 0); _mdm.scale.set(.85, 1, MT_CL*1.2); _mdm.updateMatrix(); mtGlow.setMatrixAt(ng++, _mdm.matrix); }
    }
  }
  for (const M_ of MT_MODELS) for (const m of M_.meshes){ m.count = M_.n; m.visible = M_.n > 0; if (M_.n) m.instanceMatrix.needsUpdate = true; }
  mtGlow.count = ng; mtGlow.visible = ng > 0; mtGlow.material.opacity = night ? .85 : .3; if (ng) mtGlow.instanceMatrix.needsUpdate = true;
  // the stations' lift cabs go up and down
  for (const l of metros) if (l.cabs) for (const c of l.cabs){
    const ph = (t*.1 + c.ph) % 1, u = ph < .3 ? 0 : ph < .5 ? smooth01((ph - .3)/.2) : ph < .8 ? 1 : 1 - smooth01((ph - .8)/.2);
    c.g.position.y = c.y0 + (c.y1 - c.y0)*u;
  }
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
