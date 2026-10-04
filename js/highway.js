// Neon Terrarium: Sky highways. Flying cars from the wider city come down a sky ramp, pass through a toll gate where
// they lock onto the powered lanes, ride the neon deck across the island, and pass through an enclosed drop-off
// terminal (letting visitors out, who take the lift down to the street) before lifting off again from its sky ramp.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// A highway is one way: a line of plots, each orthogonally next to the last, at a height in floors. Its first plot is
// the entry (the sky ramp and the toll gate), its last, once finished, the drop-off (the terminal, its lift down to the
// street on one side, and the sky ramp out). Curves come from the turns between plots.
//   { id, lanes: 2|3, tiles: [{ i, j, L }], done, side: +1|-1 (the lift's side of the drop-off) }
const HW_SAVE_KEY = 'neonIsland.highways';
const HW_MIN_L = 3, HW_MAX_L = 22, HW_STEP_L = 2;   // deck height in floors: the lowest, the highest, the most it changes from one plot to the next
const HW_LANE = .62, HW_EDGE = .22, HW_THICK = .3, HW_GIRDER = .28;   // lane width, shoulder and barrier each side, deck depth, the girder under it
const HW_CLEAR = HW_THICK + HW_GIRDER + .08;          // from the deck's surface down to the clear space under it
const HW_RAMP = 1.0;                                 // how far the sky ramps rise above the deck
const HW_SPEED = 2.5;                                // cars, world units a second (one speed for all, so nobody catches up)
const HW_CAR_MAX = 160, HW_PULSE_MAX = 2400, HW_VISITORS = 20;
const hwY = L => CURB + L*FH;
const hwWidth = h => h.lanes*HW_LANE + 2*HW_EDGE;
let highways = [], hwNext = 1, hwIndex = new Map();   // hwIndex: 'i,j' -> [{ h, k }]
let hwMode = false, hwLevel = 4, hwLanesPick = 2, hwActive = null;
const hwKey = (i, j) => i + ',' + j;
function hwReindex(){ hwIndex = new Map(); for (const h of highways) h.tiles.forEach((t, k) => { const q = hwKey(t.i, t.j); (hwIndex.get(q) || hwIndex.set(q, []).get(q)).push({ h, k }); }); }
const hwAt = (i, j) => hwIndex.get(hwKey(i, j)) || [];
// the underside of the lowest highway over a plot (buildings there stay under it), or null. The deck eases between plots of
// different heights, so the lowest point of the plot's stretch counts; so does the room the sky ramps need just past a line's ends.
function hwCap(c){
  let cap = null; const take = v => { if (cap === null || v < cap) cap = v; };
  for (const { h, k } of hwAt(c.i, c.j)){ let lo = 1e9; for (let u = 0; u <= 1.001; u += .1) lo = Math.min(lo, hwHeight(h, k, u)); take(lo - HW_CLEAR - .05); }
  for (const h of highways){
    const n = h.tiles.length, t0 = h.tiles[0], e = h.tiles[n - 1];
    const a = hwDirs(h, 0).din; if (t0.i - a[0] === c.i && t0.j - a[1] === c.j) take(hwY(t0.L) + HW_RAMP + .1);
    if (h.done && n > 1){ const o = hwDirs(h, n - 1).dout; if (e.i + o[0] === c.i && e.j + o[1] === c.j) take(hwY(e.L) + HW_RAMP + .1); }
  }
  return cap;
}
// the top of whatever stands on a plot (the tallest of its geometry, rooftop props and all: see rebuildCell)
function hwSurface(c){ if (c.mega){ const m = megas.get(c.mega); return m && m.roofH ? m.roofH : c.height; } return c.sections.length ? Math.max(c.height, c.topY || 0) : CURB; }
/* ---------- the line: its plots, turns and heights ---------- */
function hwDirs(h, k){
  const T = h.tiles, n = T.length, t = T[k];
  const d = (a, b) => [Math.sign(b.i - a.i), Math.sign(b.j - a.j)];
  const dout = k < n - 1 ? d(t, T[k + 1]) : k > 0 ? d(T[k - 1], t) : (h.dir0 || [1, 0]);
  const din = k > 0 ? d(T[k - 1], t) : dout;
  return { din, dout };
}
// a point along plot k of the line (u from 0 at its entry edge to 1 at its exit edge): position and heading
function hwCenter(h, k, u){
  const t = h.tiles[k], cx = t.i*LOT, cz = t.j*LOT, R = LOT/2, { din, dout } = hwDirs(h, k);
  if (din[0] === dout[0] && din[1] === dout[1]) return { x: cx + din[0]*R*(2*u - 1), z: cz + din[1]*R*(2*u - 1), tx: din[0], tz: din[1] };
  const kx = cx + (-din[0] + dout[0])*R, kz = cz + (-din[1] + dout[1])*R, a = u*PI/2, ca = Math.cos(a), sa = Math.sin(a);   // a quarter circle round the shared corner
  return { x: kx + R*(-dout[0]*ca + din[0]*sa), z: kz + R*(-dout[1]*ca + din[1]*sa), tx: dout[0]*sa + din[0]*ca, tz: dout[1]*sa + din[1]*ca };
}
const smooth01 = u => { u = Math.max(0, Math.min(1, u)); return u*u*(3 - 2*u); };
// the deck's height there: easing between plots of different heights, the ramps rising at the two ends
function hwHeight(h, k, u){
  const T = h.tiles, n = T.length, y = hwY(T[k].L);
  const yIn = k > 0 ? (hwY(T[k - 1].L) + y)/2 : y, yOut = k < n - 1 ? (y + hwY(T[k + 1].L))/2 : y;
  let v = u < .5 ? yIn + (y - yIn)*smooth01(u*2) : y + (yOut - y)*smooth01(u*2 - 1);
  if (k === 0) v += HW_RAMP*(1 - smooth01(u/.45));                          // the sky ramp coming in
  if (k === n - 1 && h.done && n > 1) v += HW_RAMP*smooth01((u - .62)/.38);   // and the one going out
  return v;
}
// the line's centre, sampled densely: [{ x, y, z, tx, tz, k, u }]
function hwSamples(h, step = .3){
  const out = [], n = h.tiles.length;
  for (let k = 0; k < n; k++){
    const { din, dout } = hwDirs(h, k), curve = din[0] !== dout[0] || din[1] !== dout[1], len = curve ? PI*LOT/4 : LOT, m = Math.max(4, Math.ceil(len/step));
    for (let q = 0; q < m + (k === n - 1 ? 1 : 0); q++){ const u = q/m, c = hwCenter(h, k, u); out.push({ x: c.x, y: hwHeight(h, k, u), z: c.z, tx: c.tx, tz: c.tz, k, u }); }
  }
  return out;
}

/* ---------- where things may go ---------- */
// can a highway plot sit at (i, j) at level L? (skip: a highway whose own plots don't count)
function hwTileWhy(i, j, L, skip){
  if (L < HW_MIN_L || L > HW_MAX_L) return 'out of range';
  if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX) return 'off the map';
  const c = cells.get(ckey(i, j));
  if ((c && c.mega) || hwMegaNear(i, j)) return 'not over or right beside a megastructure';   // (open sky is fine: the deck just has no pillar there)
  if (c && hwY(L) - HW_CLEAR < hwSurface(c)) return 'a building is in the way: go higher';
  for (const { h, k } of hwAt(i, j)) if (Math.abs(h.tiles[k].L - L) < 2) return 'another highway is there: go 2 floors higher or lower';
  return null;
}
// the open sky a ramp needs, just past the line's end (from the plot at (i, j) going out along d)
function hwRampWhy(i, j, L, d, skip){
  const ni = i + d[0], nj = j + d[1], c = cells.get(ckey(ni, nj)), top = hwY(L) + HW_RAMP + .5;
  if (hwMegaNear(ni, nj)) return 'the sky ramp would hit a megastructure';
  if (c && hwSurface(c) > top - .4) return 'the sky ramp would hit a building';
  for (const { h, k } of hwAt(ni, nj)) if (h !== skip && Math.abs(hwY(h.tiles[k].L) - (top - .5)) < 1.4) return 'the sky ramp would hit a highway';
  return null;
}
// the drop-off's lift down to the street: a glass shaft beside the plot, in the street band on one side
function hwLiftSpot(h, side){
  const n = h.tiles.length, t = h.tiles[n - 1], { dout } = hwDirs(h, n - 1), rx = -dout[1]*side, rz = dout[0]*side, off = SIDE/2 + .25, r = .24;
  const sx = t.i*LOT + rx*off, sz = t.j*LOT + rz*off;
  return { sx, sz, r, dx: dout[0], dz: dout[1], rx, rz, wall: { x: sx + dout[0]*(r + .02), z: sz + dout[1]*(r + .02) }, stand: { x: sx + dout[0]*(r + .34), z: sz + dout[1]*(r + .34) } };
}
function hwLiftOK(h, side){
  const S_ = hwLiftSpot(h, side), c = cells.get(ckey(Math.round(S_.stand.x/LOT), Math.round(S_.stand.z/LOT))), c2 = cells.get(ckey(Math.round(S_.sx/LOT), Math.round(S_.sz/LOT)));
  if (!c || !c2 || c.mega || c2.mega) return false;
  const G = cellGrid(c2); if (!freeAt(G, S_.sx, S_.sz)) return false;
  return freeAt(cellGrid(c), S_.stand.x, S_.stand.z);
}
// what a click at a plot would do in highway mode: { type: 'start'|'extend'|'finish'|'none', ok, why, ... }
function hwTargetAt(pk){
  if (!pk) return null;
  if (pk.kind === 'hwTile'){
    const h = pk.h, k = pk.k, n = h.tiles.length;
    if (!h.done && k === n - 1 && n >= 2){
      const t = h.tiles[k], { dout } = hwDirs(h, k);
      let why = hwRampWhy(t.i, t.j, t.L, dout, h), side = 0;
      if (!why){ for (const s of [1, -1]) if (hwLiftOK(h, s)){ side = s; break; } if (!side) why = 'no room for the lift down to the street'; }
      return { type: 'finish', h, side, ok: !why, why };
    }
    if (!h.done && k === n - 1) return { type: 'none', h, k, ok: false, why: 'extend it to the next plot first' };
    return { type: 'none', h, k, ok: false, why: h.done ? 'finished: right-click the drop-off to reopen it' : '' };
  }
  const { i, j } = pk, L = hwLevel;
  // next to the open end of an unfinished highway: extend it
  for (const h of highways){
    if (h.done) continue;
    const n = h.tiles.length, e = h.tiles[n - 1];
    if (Math.abs(e.i - i) + Math.abs(e.j - j) !== 1) continue;
    const pv = h.tiles[n - 2]; if (pv && pv.i === i && pv.j === j) continue;   // (not back onto itself: but over or under its own road is an overpass)
    const Lc = Math.max(e.L - HW_STEP_L, Math.min(e.L + HW_STEP_L, L));   // next to the end, the piece simply joins it: as high or low as one plot may step toward the chosen height
    let why = hwTileWhy(i, j, Lc, h);
    if (!why && n === 1) why = hwRampWhy(e.i, e.j, e.L, [e.i - i, e.j - j], h);   // the entry ramp's sky, behind the first plot
    return { type: 'extend', h, i, j, L: Lc, ok: !why, why };
  }
  const why = hwTileWhy(i, j, L, null);
  return { type: 'start', i, j, L, ok: !why, why };
}

/* ---------- making changes ---------- */
function hwCommit(h, touched){
  hwReindex();
  if (h) hwBuildView(h);
  hwClearCars(h);
  const list = [...new Set(touched.map(([i, j]) => cells.get(ckey(i, j))).filter(Boolean))];
  refresh(list);   // the pillars and the lift shaft stand on the plots (see hwFeet), so the walking paths go round them
  shadowDirty = true;
}
function hwApply(t){
  if (!t || !t.ok) return false;
  if (t.type === 'start'){
    const h = { id: hwNext++, lanes: hwLanesPick, tiles: [{ i: t.i, j: t.j, L: t.L }], done: false, side: 1 };
    highways.push(h); hwActive = h; hwCommit(h, [[t.i, t.j]]);
  } else if (t.type === 'extend'){
    const h = t.h, e = h.tiles[h.tiles.length - 1];
    h.tiles.push({ i: t.i, j: t.j, L: t.L }); hwActive = h; hwCommit(h, [[e.i, e.j], [t.i, t.j]]);
  } else if (t.type === 'finish'){
    const h = t.h, e = h.tiles[h.tiles.length - 1];
    h.done = true; h.side = t.side; hwActive = h; hwCommit(h, [[e.i, e.j], [Math.round(hwLiftSpot(h, h.side).sx/LOT), Math.round(hwLiftSpot(h, h.side).sz/LOT)]]);
  } else return false;
  sfx.play('place'); return true;
}
// right-click a highway plot: the drop-off goes first (the line stays, open again); anywhere else it's cut back to
// before that plot (the whole thing, from its entry)
function hwCutAt(h, k){
  const n = h.tiles.length, touched = h.tiles.slice(Math.max(0, k - 1)).map(t => [t.i, t.j]);
  if (h.done && k === n - 1){ const L = hwLiftSpot(h, h.side); touched.push([Math.round(L.sx/LOT), Math.round(L.sz/LOT)]); h.done = false; hwCommit(h, touched); }
  else if (k === 0){ hwRemove(h); return; }
  else { if (h.done){ const L = hwLiftSpot(h, h.side); touched.push([Math.round(L.sx/LOT), Math.round(L.sz/LOT)]); } h.tiles = h.tiles.slice(0, k); h.done = false; hwCommit(h, touched); }
  sfx.play('remove');
}
function hwRemove(h, quiet){
  const touched = h.tiles.map(t => [t.i, t.j]);
  if (h.done){ const L = hwLiftSpot(h, h.side); touched.push([Math.round(L.sx/LOT), Math.round(L.sz/LOT)]); }
  highways = highways.filter(q => q !== h); if (hwActive === h) hwActive = null;
  hwDropView(h); hwClearCars(h);
  if (!quiet){ hwCommit(null, touched); sfx.play('remove'); } else hwReindex();
  return touched;
}
// delete mode: every highway reaching into the block goes; the plots they stood on are returned for the rebuild
function hwRemoveArea(r){
  const out = [];
  for (const h of [...highways]) if (h.tiles.some(t => t.i >= r.i0 && t.i <= r.i1 && t.j >= r.j0 && t.j <= r.j1)) out.push(...hwRemove(h, true));
  return out;
}
function hwClearAll(){ for (const h of highways){ hwDropView(h); hwClearCars(h); } highways = []; hwActive = null; hwReindex(); }
function hwSetLanes(n){
  hwLanesPick = n;
  const h = hwActive && highways.includes(hwActive) ? hwActive : null;
  if (h && h.lanes !== n){ h.lanes = n; hwBuildView(h); hwClearCars(h); save(); }
}
function hwSave(){ try { localStorage.setItem(HW_SAVE_KEY, JSON.stringify(highways.map(h => ({ id: h.id, lanes: h.lanes, done: h.done, side: h.side, t: h.tiles.map(t => [t.i, t.j, t.L]) })))); } catch (e) {} }
function hwLoad(){
  hwClearAll();
  try {
    const d = JSON.parse(localStorage.getItem(HW_SAVE_KEY) || '[]');
    if (Array.isArray(d)) for (const q of d){
      if (!q || !Array.isArray(q.t) || !q.t.length) continue;
      const h = { id: q.id | 0 || hwNext, lanes: q.lanes === 3 ? 3 : 2, done: !!q.done && q.t.length > 1, side: q.side === -1 ? -1 : 1, tiles: q.t.map(([i, j, L]) => ({ i, j, L: Math.max(HW_MIN_L, Math.min(HW_MAX_L, L | 0)) })) };
      highways.push(h); hwNext = Math.max(hwNext, h.id + 1);
    }
  } catch (e) {}
  hwReindex();
  for (const h of highways) hwBuildView(h);
}

/* ---------- materials ---------- */
const HWM = {
  deck: toon(0x1c1f27), deck2: toon(0x23262f), barrier: toon(0x2a2e38), girder: toon(0x262a33), pillar: toon(0x30343e), pillar2: toon(0x3a3f4a),
  shell: toon(0x252a35), shell2: toon(0x1e222c), void: toon(0x07080c),
  cyan: toon(0x145452, { em: 0x38e8e0, kind: 'neon' }), pink: toon(0x5a1d3a, { em: 0xff4fa3, kind: 'neon' }),
  flare: toon(0x145452, { em: 0x8afff4, kind: 'thruster' }),
};
const HW_GLASS = new THREE.MeshBasicMaterial({ color: 0x5ab8c8, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }); HW_GLASS.userData.colorOnly = true;
// the toll gate's barrier: a sheet of hexagons in pink and cyan light
const HW_HEX_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 48; c.height = 42; const g = c.getContext('2d');
  const hex = (x, y, r, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 6; k++){ const a = PI/6 + k*PI/3; g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a)*r, y + Math.sin(a)*r); } g.closePath(); g.stroke(); };
  g.fillStyle = 'rgba(255,79,163,.18)'; g.fillRect(0, 0, 48, 42);
  for (const [x, y] of [[12, 10.5], [36, 10.5], [24, 31.5], [0, 31.5], [48, 31.5]]) hex(x, y, 10.5, y < 20 ? '#ff7ac0' : '#7ff0ff');
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
})();
const HW_HEX_MAT = new THREE.MeshBasicMaterial({ map: HW_HEX_TEX, color: 0xffffff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/* ---------- drawing a highway ---------- */
const _ha = new THREE.Vector3(), _hb = new THREE.Vector3(), _hf = new THREE.Vector3(), _hr = new THREE.Vector3(), _hu = new THREE.Vector3(), _hup = new THREE.Vector3(0, 1, 0), _hm = new THREE.Matrix4(), _hs = new THREE.Matrix4();
// a box along the line from a to b: lat across it (to the right), dy up from it, w wide, th deep
function hwSeg(mat, a, b, lat, dy, w, th, extra = .04){
  _ha.set(a.x, a.y, a.z); _hb.set(b.x, b.y, b.z); _hf.subVectors(_hb, _ha); const len = _hf.length(); if (len < 1e-4) return; _hf.divideScalar(len);
  _hr.crossVectors(_hf, _hup).normalize(); _hu.crossVectors(_hr, _hf).normalize();
  _hm.makeBasis(_hr, _hu, _hf).setPosition((a.x + b.x)/2 + _hr.x*lat + _hu.x*dy, (a.y + b.y)/2 + _hr.y*lat + _hu.y*dy, (a.z + b.z)/2 + _hr.z*lat + _hu.z*dy);
  put(U.box, mat, _hm.clone().multiply(_hs.makeScale(Math.max(w, MIN_T), Math.max(th, MIN_T), len + extra)));
}
// a box section swept along the line (one continuous piece, so no seams show along the deck): lat across, dy up,
// w wide, th deep. pts: the line's samples, a: the first and b: one past the last used.
const _sw = { t: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() };
function hwSweep(mat, pts, lat, dy, w, th, a = 0, b = pts.length){
  if (b - a < 2) return;
  const C = [], N = [];   // per sample: 4 corners (top-left, top-right, bottom-right, bottom-left) and the frame
  for (let q = a; q < b; q++){
    const p0 = pts[Math.max(a, q - 1)], p1 = pts[Math.min(b - 1, q + 1)];
    _sw.t.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).normalize(); _sw.r.crossVectors(_sw.t, _hup).normalize(); _sw.u.crossVectors(_sw.r, _sw.t).normalize();
    const p = pts[q], cx = p.x + _sw.r.x*lat + _sw.u.x*dy, cy = p.y + _sw.r.y*lat + _sw.u.y*dy, cz = p.z + _sw.r.z*lat + _sw.u.z*dy, R_ = _sw.r, Uu = _sw.u;
    const cor = (sx, sy) => [cx + R_.x*sx*w/2 + Uu.x*sy*th/2, cy + R_.y*sx*w/2 + Uu.y*sy*th/2, cz + R_.z*sx*w/2 + Uu.z*sy*th/2];
    C.push([cor(-1, 1), cor(1, 1), cor(1, -1), cor(-1, -1)]); N.push([R_.clone(), Uu.clone(), _sw.t.clone()]);
  }
  const P = [], Nn = [];
  const tri = (A, B, Cc, n) => { P.push(...A, ...B, ...Cc); for (let k = 0; k < 3; k++) Nn.push(n.x, n.y, n.z); };
  const quad = (A, B, Cc, D, n) => { tri(A, B, Cc, n); tri(A, Cc, D, n); };
  for (let q = 0; q + 1 < C.length; q++){
    const c0 = C[q], c1 = C[q + 1], f = N[q], r = f[0], u = f[1], dn = u.clone().negate(), lf = r.clone().negate();
    quad(c0[0], c1[0], c1[1], c0[1], u);    // top
    quad(c0[3], c0[2], c1[2], c1[3], dn);   // bottom
    quad(c0[1], c1[1], c1[2], c0[2], r);    // right side
    quad(c0[0], c0[3], c1[3], c1[0], lf);   // left side
  }
  const s0 = C[0], s1 = C[C.length - 1], t0 = N[0][2].clone().negate(), t1 = N[N.length - 1][2];
  quad(s0[0], s0[1], s0[2], s0[3], t0); quad(s1[0], s1[3], s1[2], s1[1], t1);   // the two ends
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.userData._size = [w, th, 9];   // (a long piece: never thinned out as a fine detail)
  // placed from its first point, so a lit piece comes on in the evening at its own moment (see litOrder in core.js)
  const o = C[0][0]; g.translate(-o[0], -o[1], -o[2]); put(g, mat, new THREE.Matrix4().makeTranslation(o[0], o[1], o[2])); g.dispose();
}
function hwDropView(h){
  if (h.view){ world.remove(h.view); disposeGroup(h.view); h.view = null; }
  if (h.fx){ scene.remove(h.fx); h.fx.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); h.fx = null; }
  disposeData(h.data); h.data = null; h.lanePaths = null; h.pulse = null; hwPulseDirty = true;
}
function hwBuildView(h){
  hwDropView(h);
  R = mulberry32(hash('hw', h.id));
  const W = hwWidth(h), n = h.tiles.length, pts = hwSamples(h);
  h.data = collect(() => {
    // the deck: asphalt on a box girder, neon lane lines, low barriers with neon along their tops, a neon line down each side
    hwSweep(HWM.deck, pts, 0, -HW_THICK/2, W, HW_THICK);
    hwSweep(HWM.girder, pts, 0, -HW_THICK - HW_GIRDER/2 + .02, W*.5, HW_GIRDER);
    for (const s of [-1, 1]){
      hwSweep(HWM.barrier, pts, s*(W/2 - .06), .11, .1, .22);                                 // the barrier
      hwSweep(s < 0 ? HWM.cyan : HWM.pink, pts, s*(W/2 - .06), .235, .045, .03);              // its neon top
      hwSweep(s < 0 ? HWM.pink : HWM.cyan, pts, s*(W/2 + .006), -HW_THICK*.55, .012, .045);   // the line along the side
    }
    for (let q = 0; q + 1 < pts.length; q++){
      const a = pts[q], b = pts[q + 1];
      for (let l = 1; l < h.lanes; l++) if (q % 3 !== 2) hwSeg(HWM.cyan, a, b, -W/2 + HW_EDGE + l*HW_LANE, .008, .035, .014, -.02);   // dashed lane lines
      if (q % 7 === 3) for (const s of [-1, 1]) hwSeg(HWM.deck2, a, b, s*(W/2 + .01), -HW_THICK*.5, .02, HW_THICK*.8, -.12);   // panel seams
    }
    // the entry: an arch of light where the cars come down onto the ramp, and the toll gate where they lock on
    {
      const e0 = hwCenter(h, 0, 0), y0 = hwHeight(h, 0, 0), ry = Math.atan2(e0.tx, e0.tz);
      for (const [r, m] of [[W/2 + .3, HWM.cyan], [W/2 + .38, HWM.pink]]) put(U.halfRing, m, T(e0.x, y0, e0.z, ry, r, r, 1.5));
      const g = hwCenter(h, 0, .58), yg = hwHeight(h, 0, .58), F = T(g.x, yg, g.z, Math.atan2(g.tx, g.tz)), px = W/2 + .24;
      for (const s of [-1, 1]){
        box(HWM.shell, F, s*px, .78, 0, .34, 1.56, .44);
        box(HWM.shell2, F, s*px, .06, 0, .44, .12, .54);
        for (let k = 0; k < 3; k++) box(s < 0 ? HWM.cyan : HWM.pink, F, s*(px - .175), .55 + k*.28, 0, .015, .2, .24);   // hex lights up the pillar's inside face
        for (const z of [-.225, .225]) box(s < 0 ? HWM.cyan : HWM.pink, F, s*px, .78, z, .3, 1.5, .012);
        glow(F, s*(px - .2), .9, 0, s < 0 ? 'cyan' : 'pink', .5);
      }
      box(HWM.shell, F, 0, 1.68, 0, 2*px + .4, .3, .46);
      for (const z of [-.235, .235]){ box(HWM.cyan, F, 0, 1.68, z, 2*px + .36, .02, .012); box(HWM.pink, F, 0, 1.55, z, 2*px + .36, .015, .012); }
      fitSign(under(F, T(0, 0, -.25, PI)), 'sign_hw_toll', 0, 1.69, 0, 2*px - .1, .6, 'cyan');
      fitSign(under(F, T(0, 0, .25, 0)), 'sign_hw_entry', 0, 1.69, 0, 2*px - .1, .6, 'pink');
      // the toll booth on one side, its screen lit
      const bs = chance(.5) ? 1 : -1;
      box(HWM.shell, F, bs*(px + .5), .5, -.15, .5, 1.0, .6); box(HWM.cyan, F, bs*(px + .5), .62, -.455, .36, .26, .012); box(M.winLit, F, bs*(px + .24), .62, -.15, .012, .24, .36);
      box(HWM.shell2, F, bs*(px + .5), 1.03, -.15, .6, .06, .7);
    }
    // the drop-off: an enclosed terminal the cars pass straight through, its lift down to the street on one side, and
    // the sky ramp out with its arch of light
    if (h.done && n > 1){
      const t = h.tiles[n - 1], { dout } = hwDirs(h, n - 1), y = hwY(t.L), ry = Math.atan2(dout[0], dout[1]);
      const F = T(t.i*LOT, y, t.j*LOT, ry), z0 = -LOT/2 + .1*LOT, z1 = -LOT/2 + .6*LOT, zm = (z0 + z1)/2, L_ = z1 - z0, bw = W + .5, bh = 1.3;
      for (const s of [-1, 1]){
        box(HWM.shell, F, s*bw/2, bh/2, zm, .12, bh, L_);
        box(M.winLit, F, s*(bw/2 + .065), .82, zm, .012, .16, L_ - .4);
        box(s < 0 ? HWM.pink : HWM.cyan, F, s*(bw/2 + .07), .06, zm, .012, .04, L_);
        for (const z of [z0, z1]) box(HWM.pink, F, s*(bw/2 + .01), bh/2, z, .06, bh, .06);
        fitSign(under(F, T(s*(bw/2 + .075), 0, zm, s*PI/2)), 'sign_hw_arrivals', 0, 1.06, 0, L_*.7, .55, 'cyan');
      }
      box(HWM.shell2, F, 0, bh + .05, zm, bw + .1, .1, L_ + .1);
      for (const s of [-1, 1]) box(HWM.cyan, F, s*(bw/2 + .05), bh + .1, zm, .015, .02, L_ + .1);
      for (const z of [z0, z1]){
        // each end wall round a tunnel mouth, dark inside
        const mw = W - .05, mh = .78;
        for (const s of [-1, 1]) box(HWM.shell, F, s*(bw/2 + mw/2)/2, bh/2, z, (bw - mw)/2, bh, .12);
        box(HWM.shell, F, 0, (mh + bh)/2, z, mw, bh - mh, .12);
        box(HWM.void, F, 0, mh/2, z + (z === z0 ? .14 : -.14), mw, mh, .02);
        box(HWM.cyan, F, 0, mh + .02, z + (z === z0 ? -.065 : .065), mw, .025, .012);
        glow(F, 0, mh*.6, z + (z === z0 ? -.2 : .2), 'cyan', .45);
      }
      // roof: vents, a mast with a beacon
      for (let k = 0; k < 2; k++) box(HWM.barrier, F, rnd(-bw/4, bw/4), bh + .18, zm + rnd(-L_/4, L_/4), .3, .16, .3);
      cyl(M.metalDark, F, bw/2 - .2, bh + .5, z1 - .2, .02, .8); beaconLight(F, bw/2 - .2, bh + .92, z1 - .2, .06, .7);
      // the walkway to the lift's top, on the lift's side
      const Ls = hwLiftSpot(h, h.side), lat = -h.side*(SIDE/2 + .25), x0 = -h.side*bw/2, x1 = lat + h.side*Ls.r;
      const Fl = T(t.i*LOT, y, t.j*LOT, ry);   // (local +x here is the way hwLiftSpot calls -side)
      box(HWM.shell, Fl, (x0 + x1)/2, .45, 0, Math.abs(x1 - x0) + .04, .9, .5);
      box(HWM.cyan, Fl, (x0 + x1)/2, .92, 0, Math.abs(x1 - x0), .02, .52);
      // the sky ramp out: its arch of light at the far end
      const e1 = hwCenter(h, n - 1, 1), y1 = hwHeight(h, n - 1, 1);
      for (const [r, m] of [[W/2 + .3, HWM.pink], [W/2 + .38, HWM.cyan]]) put(U.halfRing, m, T(e1.x, y1, e1.z, Math.atan2(e1.tx, e1.tz), r, r, 1.5));
    } else {
      // an open end: a barrier across it with warning lights
      const e1 = hwCenter(h, n - 1, 1), y1 = hwHeight(h, n - 1, 1), F = T(e1.x, y1, e1.z, Math.atan2(e1.tx, e1.tz));
      box(HWM.barrier, F, 0, .14, -.08, W, .28, .12);
      for (let x = -W/2 + .15; x < W/2; x += .3) box(M.hazard, F, x, .15, -.15, .14, .2, .012);
      for (const s of [-1, 1]){ box(M.blink || HWM.pink, F, s*(W/2 - .1), .34, -.08, .06, .06, .06); glow(F, s*(W/2 - .1), .34, -.15, 'red', .3); }
    }
  });
  h.view = batchGroup([h.data]); world.add(h.view);
  // the moving parts: the toll gate's hexagon barrier, and the drop-off's lift cab
  h.fx = new THREE.Group(); scene.add(h.fx);
  { const g = hwCenter(h, 0, .58), yg = hwHeight(h, 0, .58), px = W/2 + .24;
    const hexW = 2*px - .34, mesh = new THREE.Mesh(new THREE.PlaneGeometry(hexW, 1.4), HW_HEX_MAT);
    mesh.position.set(g.x, yg + .74, g.z); mesh.rotation.y = Math.atan2(g.tx, g.tz); mesh.layers.set(1); mesh.renderOrder = 3; mesh.userData.own = true;
    const uv = mesh.geometry.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q)*hexW/.55, uv.getY(q)*1.4/.48);
    h.fx.add(mesh); }
  if (h.done && n > 1){
    const Ls = hwLiftSpot(h, h.side), cab = new THREE.Group();
    const add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); cab.add(m); return m; };
    add(U.cyl16, HWM.shell, 0, .03, 0, .4, .06, .4); add(U.cyl16, HWM.shell, 0, .93, 0, .42, .07, .42);
    for (const y of [.08, .88]) add(U.torus, HWM.cyan, 0, y, 0, .44, .44, .3).rotation.x = PI/2;
    for (let k = 0; k < 4; k++){ const a = k*PI/2 + PI/4; add(U.box, HWM.pink, Math.sin(a)*.19, .48, Math.cos(a)*.19, .018, .8, .018); }
    const f = hwFold(cab), folded = new THREE.Group();   // (two meshes instead of a dozen)
    for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]) if (geo){ const m = new THREE.Mesh(geo, mat); m.userData.own = true; folded.add(m); }
    folded.position.set(Ls.sx, CURB, Ls.sz); h.fx.add(folded); h.cab = folded; h.cabY = [CURB + .02, hwY(h.tiles[n - 1].L) + .02];
  } else h.cab = null;
  shadowDirty = true;
}
// the parts that stand on the plots under a highway: a pillar from the roof or the ground up to each plot's deck, and
// the drop-off's lift shaft down to the street. Drawn with the plot (called while it's built), so the walking paths
// go round them.
function hwFeet(c){
  for (const { h, k } of hwAt(c.i, c.j)){
    const t = h.tiles[k];
    if (hwAt(c.i, c.j).some(o => !(o.h === h && o.k === k) && o.h.tiles[o.k].L < t.L)) continue;   // another highway under this one: it spans over
    const m = hwCenter(h, k, .5), top = hwHeight(h, k, .5) - HW_THICK - HW_GIRDER + .04, bot = c.mega ? hwSurface(c) : c.sections.length ? c.height : CURB;   // (it stands on the roof itself)
    if (top - bot < .2) continue;
    const F = T(m.x, 0, m.z, Math.atan2(m.tx, m.tz));
    box(HWM.pillar, F, 0, (bot + top)/2, 0, .4, top - bot, .4);
    box(HWM.pillar2, F, 0, top - .12, 0, .62, .24, .5);                  // the head under the girder
    box(HWM.pillar2, F, 0, bot + .05, 0, .54, .1, .54);                  // the foot
    for (const s of [-1, 1]) box(s < 0 ? HWM.cyan : HWM.pink, F, s*.205, (bot + top)/2, 0, .012, Math.max(.1, top - bot - .5), .04);
    box(HWM.cyan, F, 0, top - .3, .205, .3, .03, .012); box(HWM.pink, F, 0, top - .3, -.205, .3, .03, .012);
  }
  // a drop-off's lift shaft whose foot is on this plot
  for (const h of highways){
    if (!h.done || h.tiles.length < 2) continue;
    const Ls = hwLiftSpot(h, h.side); if (Math.round(Ls.sx/LOT) !== c.i || Math.round(Ls.sz/LOT) !== c.j) continue;
    const y = hwY(h.tiles[h.tiles.length - 1].L), top = y + 1.15, P = T(Ls.sx, 0, Ls.sz, Math.atan2(Ls.dx, Ls.dz)), r = Ls.r;
    put(U.cyl16, HW_GLASS, under(P, T(0, (CURB + top)/2, 0, 0, 2*r, top - CURB, 2*r)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(HWM.shell, P, sx*r*.72, (CURB + top)/2, sz*r*.72, .045, top - CURB, .045);
    for (let yy = CURB + 1.0; yy < top - .3; yy += 1.0) put(U.torus, HWM.cyan, under(P, T(0, yy, 0, 0, 2*r + .03, 2*r + .03, .45, PI/2)));
    box(HWM.shell2, P, 0, CURB + .04, 0, 2*r + .16, .08, 2*r + .16);
    box(HWM.shell, P, 0, top + .08, 0, 2*r + .14, .16, 2*r + .14); box(HWM.pink, P, 0, top + .17, 0, 2*r + .1, .02, 2*r + .1);
  }
}

/* ---------- the cars ---------- */
// Each car model is folded into one mesh per material, and every car of that model is an instance of those: a
// handful of draw calls for all the traffic. (The flying cars elsewhere are built part by part, which is fine for a
// few, not for a highway's worth.)
// a group of meshes folded into two geometries: the plain parts (their colours carried per vertex, lit like the
// city) and the glowing parts (their glow colour per vertex, drawn unlit)
const HW_CAR_PLAIN = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true });
const HW_CAR_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
function hwFold(g){
  g.updateMatrixWorld(true);
  const plain = [], lit = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const glowing = !!(o.material.userData && o.material.userData.glow), c = glowing ? o.material.emissive : o.material.color, n = geo.attributes.position.count, col = new Float32Array(n*3);
    for (let q = 0; q < n; q++){ col[q*3] = c.r; col[q*3 + 1] = c.g; col[q*3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); (glowing ? lit : plain).push(geo);
  });
  const merge = list => { const m = list.length ? THREE.BufferGeometryUtils.mergeBufferGeometries(list, false) : null; list.forEach(x => x.dispose()); return m; };
  return { plain: merge(plain), lit: merge(lit) };
}
const HW_KINDS = (() => {
  const out = [];
  ['std', 'taxi', 'lux', 'van'].forEach((kind, q) => {
    const c = buildCar(kind), g = c.g;
    for (const pv of c.pods) pv.rotation.x = .95;   // thrusters tilted back: cruising
    const f = hwFold(g), meshes = [];
    for (const [geo, mat] of [[f.plain, HW_CAR_PLAIN], [f.lit, HW_CAR_GLOW]]){ if (!geo) continue; const m = new THREE.InstancedMesh(geo, mat, HW_CAR_MAX); m.count = 0; m.frustumCulled = false; m.visible = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); meshes.push(m); }
    out.push({ kind, meshes, n: 0 });
  });
  return out;
})();
// The pulse: a row of small light segments down each side of the deck, dark until a soft pulse of light runs along
// them in the direction of travel, every few seconds. One batch for every highway; only the segments' colours change
// from frame to frame (their places are set when a highway is built).
const hwPulseMesh = (() => { const m = new THREE.InstancedMesh(U.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), HW_PULSE_MAX);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(HW_PULSE_MAX*3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.count = 0; m.frustumCulled = false; scene.add(m); return m; })();
let hwPulseDirty = true, hwPulseSegs = [];   // [{ s, side, ph }] in the batch's order
const HW_PULSE_COL = { '-1': new THREE.Color(0xff4fa3), '1': new THREE.Color(0x38e8e0) };
// a highway's segments: along both edges of the deck (they make the lanes' edge lines), from the foot of the entry ramp to the terminal (or the open end)
function hwPulsePlaces(h){
  const W = hwWidth(h), pts = hwSamples(h, .36), n = h.tiles.length, out = [];
  let s = 0;
  for (let q = 0; q < pts.length; q++){
    const p = pts[q], nx = pts[Math.min(pts.length - 1, q + 1)], pv = pts[Math.max(0, q - 1)];
    if (q) s += Math.hypot(p.x - pts[q - 1].x, p.y - pts[q - 1].y, p.z - pts[q - 1].z);
    if ((p.k === 0 && p.u < .5) || (h.done && n > 1 && p.k === n - 1 && p.u > .08)) continue;
    const dx = nx.x - pv.x, dy = nx.y - pv.y, dz = nx.z - pv.z, yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz) || 1e-4), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    for (const side of [-1, 1]){ const lat = side*(W/2 - HW_EDGE + .03); out.push({ x: p.x - p.tz*lat, y: p.y + .012, z: p.z + p.tx*lat, yaw, pitch, s, side, ph: h.id*3.7 }); }
  }
  return out;
}
function hwPulseRebuild(){
  hwPulseSegs = []; let q = 0;
  for (const h of highways){ if (!h.view) continue; h.pulse = h.pulse || hwPulsePlaces(h);
    for (const g of h.pulse){ if (q >= HW_PULSE_MAX) break;
      _hdm.position.set(g.x, g.y, g.z); _hdm.rotation.set(g.pitch, g.yaw, 0, 'YXZ'); _hdm.scale.set(.045, .014, .25); _hdm.updateMatrix();
      hwPulseMesh.setMatrixAt(q++, _hdm.matrix); hwPulseSegs.push(g); } }
  hwPulseMesh.count = q; hwPulseMesh.visible = q > 0; hwPulseMesh.instanceMatrix.needsUpdate = true; hwPulseDirty = false;
}
const hwFlares = (() => { const m = new THREE.InstancedMesh(U.box, HWM.flare, HW_CAR_MAX); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; })();
let hwCars = [];
function hwClearCars(h){ hwPulseDirty = true; if (!h){ return; } hwCars = hwCars.filter(c => c.h !== h); h.queue = null; }
const _hbz = new THREE.Vector3();
// each lane's whole course: down from the sky, the ramp, the deck, through the terminal, up the ramp out and away
function hwLanePaths(h){
  if (h.lanePaths) return h.lanePaths;
  const n = h.tiles.length, deck = hwSamples(h, .2), out = [];
  const hFly = Math.max(skyTop + 1.5, hwY(Math.max(...h.tiles.map(t => t.L))) + HW_RAMP + 3);
  const uOf = (k, u) => { for (let q = 0; q < deck.length; q++) if (deck[q].k > k || (deck[q].k === k && deck[q].u >= u)) return q; return deck.length - 1; };
  const qGate = uOf(0, .58), qDeck0 = uOf(0, .45), qIn = uOf(n - 1, .1), qMid = uOf(n - 1, .35), qOut = uOf(n - 1, .6);
  for (let l = 0; l < h.lanes; l++){
    const lat = (l - (h.lanes - 1)/2)*HW_LANE, X = [], Y = [], Z = [];
    const push = (x, y, z) => { X.push(x); Y.push(y); Z.push(z); };
    const offAt = p => [p.x - p.tz*lat, p.z + p.tx*lat];   // (to the right of the way it goes: see hwSeg)
    const a = deck[0], [ax, az] = offAt(a), A = new THREE.Vector3(ax, a.y, az), d0 = new THREE.Vector3(a.tx, 0, a.tz);
    const F0 = A.clone().addScaledVector(d0, -38).setY(hFly + 2), C1 = A.clone().addScaledVector(d0, -18).setY(hFly), C2 = A.clone().addScaledVector(d0, -5).setY(A.y + .5);
    for (let q = 0; q < 28; q++){ bez(_hbz, F0, C1, C2, A, q/28); push(_hbz.x, _hbz.y, _hbz.z); }
    const q0 = X.length;
    for (const p of deck){ const [x, z] = offAt(p); push(x, p.y, z); }
    const e = deck[deck.length - 1], [ex, ez] = offAt(e), E = new THREE.Vector3(ex, e.y, ez), d1 = new THREE.Vector3(e.tx, 0, e.tz);
    const D1 = E.clone().addScaledVector(d1, 5).setY(E.y + .6), D2 = E.clone().addScaledVector(d1, 16).setY(hFly), D3 = E.clone().addScaledVector(d1, 38).setY(hFly + 2);
    for (let q = 1; q <= 28; q++){ bez(_hbz, E, D1, D2, D3, q/28); push(_hbz.x, _hbz.y, _hbz.z); }
    const cum = new Float32Array(X.length); for (let q = 1; q < X.length; q++) cum[q] = cum[q - 1] + Math.hypot(X[q] - X[q - 1], Y[q] - Y[q - 1], Z[q] - Z[q - 1]);
    out.push({ X: Float32Array.from(X), Y: Float32Array.from(Y), Z: Float32Array.from(Z), cum, len: cum[cum.length - 1],
      sGate: cum[q0 + qGate], sDeck0: cum[q0 + qDeck0], sIn: cum[q0 + qIn], sMid: cum[q0 + qMid], sOut: cum[q0 + qOut] });
  }
  return (h.lanePaths = out);
}
// where along a lane's course: position and heading into o; k is a cursor kept by the caller (moves forward only)
function hwAlong(P, s, k, o){
  const C = P.cum, n = C.length; if (k < 0 || k >= n - 1 || C[k] > s) k = 0;
  while (k < n - 2 && C[k + 1] < s) k++;
  const seg = C[k + 1] - C[k] || 1, u = Math.max(0, Math.min(1, (s - C[k])/seg));
  o.x = P.X[k] + (P.X[k + 1] - P.X[k])*u; o.y = P.Y[k] + (P.Y[k + 1] - P.Y[k])*u; o.z = P.Z[k] + (P.Z[k + 1] - P.Z[k])*u;
  const dx = P.X[k + 1] - P.X[k], dy = P.Y[k + 1] - P.Y[k], dz = P.Z[k + 1] - P.Z[k];
  o.yaw = Math.atan2(dx, dz); o.pitch = -Math.atan2(dy, Math.hypot(dx, dz) || 1e-4);
  return k;
}
const _hdm = new THREE.Object3D(), _hpos = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
// How busy the sky is: from a young little island (0) to a big, built-up city (1), by its buildings, megastructures and size
let hwBusy = 0, hwBusyAt = -9;
function hwTraffic(t){
  if (t - hwBusyAt < 2) return hwBusy;
  hwBusyAt = t; let built = 0, secs = 0;
  for (const c of cells.values()){ if (c.sections.length){ built++; secs += c.sections.length; } }
  const m = built + secs*.4 + cells.size*.15 + megas.size*6;
  return (hwBusy = Math.max(0, Math.min(1, m/220)));
}
// Traffic comes in waves. A young city sends two or three cars together every 30 to 40 seconds; as the city grows the waves
// come more often and carry more cars, up to a steady stream (about a car a second on a two-lane road) in a big one.
const HW_RATE_MIN = 2.5/35, HW_RATE_MAX = 1.05;   // cars a second, a two-lane highway
function updateHighways(dt, t){
  const busy = hwTraffic(t);
  for (const h of highways){
    if (!h.done || !h.view) continue;
    const LP = hwLanePaths(h);
    if (!h.queue){ h.queue = []; h.waveAt = t + 2 + Math.random()*8; }
    if (t >= h.waveAt){
      const rate = HW_RATE_MIN*Math.pow(HW_RATE_MAX/HW_RATE_MIN, Math.pow(busy, 1.25))*(h.lanes/2);
      const n = Math.max(2, Math.round(2 + 3*busy + Math.random()*1.4 - .2));
      let at = t; for (let k = 0; k < n; k++){ if (k) at += .9 + Math.random()*1.4; h.queue.push({ at, lane: Math.floor(Math.random()*h.lanes) }); }
      h.waveAt = t + (n/rate)*(.75 + Math.random()*.5);
    }
    h.queue = h.queue.filter(q => {
      if (t < q.at) return true;
      if (hwCars.length >= HW_CAR_MAX) return false;
      let lane = q.lane, lastS = Infinity;
      for (let tries = 0; tries < h.lanes; tries++){
        lastS = Infinity; for (const c of hwCars) if (c.h === h && c.lane === lane) lastS = Math.min(lastS, c.s);
        if (lastS >= 2.4) break; lane = (lane + 1)%h.lanes;
      }
      if (lastS < 2.4){ q.at = t + .6; return true; }   // every lane has one just entering: a moment later
      const r = Math.random(), kind = r < .45 ? 0 : r < .7 ? 1 : r < .9 ? 2 : 3;
      hwCars.push({ h, lane, s: 0, k: 0, kind });
      return false;
    });
  }
  // move and draw the cars
  for (const K of HW_KINDS) K.n = 0;
  let nf = 0;
  hwCars = hwCars.filter(c => {
    const LP = c.h.lanePaths; if (!LP) return false;
    const P = LP[c.lane], s0 = c.s; c.s += dt*HW_SPEED;
    if (c.s >= P.len) return false;
    if (s0 < P.sMid && c.s >= P.sMid && Math.random() < .55) hwDropVisitor(c.h);   // through the terminal: someone gets out
    if (c.s > P.sIn + .05 && c.s < P.sOut - .05) return true;   // inside the terminal: out of sight
    c.k = hwAlong(P, c.s, c.k, _hpos);
    // locked onto the lanes at the toll gate: it settles a little lower, and the lane flares under it
    const g = (c.s - P.sGate)/.9, hover = c.s < P.sGate ? .3 : c.s < P.sGate + .9 ? .3 - .1*smooth01(g) : c.s > P.sOut ? .2 + .1*smooth01((c.s - P.sOut)/1.5) : .2;
    const sc = Math.min(1, c.s/4, (P.len - c.s)/4);
    _hdm.position.set(_hpos.x, _hpos.y + hover, _hpos.z); _hdm.rotation.set(_hpos.pitch, _hpos.yaw, 0, 'YXZ'); _hdm.scale.setScalar(Math.max(.01, sc)); _hdm.updateMatrix();
    const K = HW_KINDS[c.kind]; if (K.n < HW_CAR_MAX){ for (const m of K.meshes) m.setMatrixAt(K.n, _hdm.matrix); K.n++; }
    if (c.s >= P.sGate && c.s < P.sGate + .9 && nf < HW_CAR_MAX){ const f = 1 - g; _hdm.position.set(_hpos.x, _hpos.y + .02, _hpos.z); _hdm.rotation.set(_hpos.pitch, _hpos.yaw, 0, 'YXZ'); _hdm.scale.set(.75*f + .2, .02, 1.1); _hdm.updateMatrix(); hwFlares.setMatrixAt(nf++, _hdm.matrix); }
    return true;
  });
  for (const K of HW_KINDS) for (const m of K.meshes){ m.count = K.n; m.visible = K.n > 0; if (K.n) m.instanceMatrix.needsUpdate = true; }
  hwFlares.count = nf; hwFlares.visible = nf > 0; if (nf) hwFlares.instanceMatrix.needsUpdate = true;
  // the pulse: each segment lights as the head of a pulse passes it and fades behind (a pulse every 11 units, moving
  // at 3 units a second), stepped so it reads as segments switching on rather than a smooth glow
  if (hwPulseDirty) hwPulseRebuild();
  if (hwPulseSegs.length){
    const C = hwPulseMesh.instanceColor.array, PER = 11, TAIL = 1.8, v = 3;
    for (let q = 0; q < hwPulseSegs.length; q++){
      const g = hwPulseSegs[q], d = (((t*v + g.ph - g.s) % PER) + PER) % PER;   // how far behind the pulse's head this segment is
      let k = d < TAIL ? 1 - d/TAIL : 0; k = Math.ceil(k*4)/4; k = .22 + .6*k*k;    // a dim edge line, stepping up softly as the pulse passes
      const c = HW_PULSE_COL[g.side]; C[q*3] = c.r*k; C[q*3 + 1] = c.g*k; C[q*3 + 2] = c.b*k;
    }
    hwPulseMesh.instanceColor.needsUpdate = true;
  }
  // the hexagon barriers shimmer, and the drop-offs' lift cabs go up and down
  HW_HEX_TEX.offset.y = (t*.12) % 1;
  for (const h of highways){
    if (!h.cab) continue;
    const ph = (t*.1 + h.id*.37) % 1, [y0, y1] = h.cabY, u = ph < .3 ? 0 : ph < .5 ? smooth01((ph - .3)/.2) : ph < .8 ? 1 : 1 - smooth01((ph - .8)/.2);
    h.cab.position.y = y0 + (y1 - y0)*u;
  }
}
// a visitor steps off at the drop-off and comes down the lift (people.js does the rest)
function hwDropVisitor(h){ if (typeof spawnVisitor === 'function') spawnVisitor('v:' + h.id); }

/* ---------- highway mode: picking, the ghost, the hint ---------- */
const _hray = new THREE.Raycaster(), _hndc = new THREE.Vector2(), _hbox = new THREE.Box3(), _hhit = new THREE.Vector3();
function hwPick(cx, cy){
  const r = canvas.getBoundingClientRect();
  _hndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  _hray.setFromCamera(_hndc, cam);
  let best = null;
  for (const h of highways) h.tiles.forEach((t, k) => {
    const y = hwY(t.L); _hbox.min.set(t.i*LOT - LOT/2, y - .45, t.j*LOT - LOT/2); _hbox.max.set(t.i*LOT + LOT/2, y + .3, t.j*LOT + LOT/2);
    if (!_hray.ray.intersectBox(_hbox, _hhit)) return;
    const d = _hhit.distanceTo(_hray.ray.origin); if (!best || d < best.d) best = { kind: 'hwTile', h, k, d };
  });
  // next to the open end of an unfinished line, the pointer is taken to mean the plot that would extend it, at whatever height it
  // is looking at: the column above that plot (not just the plane at the chosen height) counts, so changing the height keeps the pick
  for (const h of highways){
    if (h.done) continue;
    const e = h.tiles[h.tiles.length - 1];
    for (const [a, b] of SIDES4){
      const i = e.i + a, j = e.j + b, pv = h.tiles[h.tiles.length - 2]; if (pv && pv.i === i && pv.j === j) continue;
      _hbox.min.set(i*LOT - LOT/2, hwY(Math.min(hwLevel, e.L)) - .8, j*LOT - LOT/2); _hbox.max.set(i*LOT + LOT/2, hwY(Math.max(hwLevel, e.L)) + .4, j*LOT + LOT/2);   // (a slab round the heights in question)
      if (!_hray.ray.intersectBox(_hbox, _hhit)) continue;
      const d = _hhit.distanceTo(_hray.ray.origin);
      if (best && best.kind === 'hwTile' && best.d < d + 1) continue;   // (the end piece itself, or another, in front)
      if (!best || best.kind === 'hwTile' || d < best.d) best = { kind: 'hwGround', i, j, d, near: true };
    }
  }
  // the plot at the chosen height under the pointer (unless a highway piece or such a column is nearer)
  const o = _hray.ray.origin, dir = _hray.ray.direction, y = hwY(hwLevel);
  if (Math.abs(dir.y) > 1e-4){ const tt = (y - o.y)/dir.y; if (tt > 0){ const p = o.clone().addScaledVector(dir, tt), d = tt*dir.length();
    const i = Math.round(p.x/LOT), j = Math.round(p.z/LOT);
    if (!best || (!best.near && d < best.d - .5)) best = { kind: 'hwGround', i, j, d }; } }
  return best;
}
const hwGhostMat = new THREE.MeshBasicMaterial({ color: 0x38e8e0, transparent: true, opacity: .32, depthTest: false, depthWrite: false });
const hwGhostLine = new THREE.LineBasicMaterial({ color: 0x38e8e0, transparent: true, opacity: .95, depthTest: false });
const hwGhost = (() => {
  const g = new THREE.Group(), deck = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hwGhostMat), edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), hwGhostLine), pole = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hwGhostMat);
  for (const o of [deck, edge, pole]){ o.layers.set(1); o.renderOrder = 999; g.add(o); }
  g.visible = false; scene.add(g); return { g, deck, edge, pole };
})();
function hwShowGhost(t){
  if (!t || t.type === 'none' && !t.why){ hwGhost.g.visible = false; return; }
  const col = t.ok ? (t.type === 'finish' ? 0xff5ad8 : 0x38e8e0) : 0xff3a4a;
  hwGhostMat.color.setHex(col); hwGhostLine.color.setHex(col);
  let x, z, y, len, ry, w, th = .3, by;
  if (t.type === 'start'){ x = t.i*LOT; z = t.j*LOT; y = hwY(t.L); len = LOT*.92; ry = 0; w = hwLanesPick*HW_LANE + 2*HW_EDGE; }
  else if (t.type === 'extend'){ const e = t.h.tiles[t.h.tiles.length - 1]; x = (e.i + t.i)*LOT/2 + (t.i - e.i)*LOT*.25; z = (e.j + t.j)*LOT/2 + (t.j - e.j)*LOT*.25; y = (hwY(e.L) + hwY(t.L))/2; len = LOT*.95; ry = Math.atan2(t.i - e.i, t.j - e.j); w = hwWidth(t.h); }
  else if (t.type === 'finish'){ const e = t.h.tiles[t.h.tiles.length - 1], { dout } = hwDirs(t.h, t.h.tiles.length - 1); x = e.i*LOT; z = e.j*LOT; y = hwY(e.L) + .65; th = 1.3; len = LOT*.6; ry = Math.atan2(dout[0], dout[1]); w = hwWidth(t.h) + .5; }
  else { const e = t.h.tiles[t.k]; x = e.i*LOT; z = e.j*LOT; y = hwY(e.L); len = LOT*.9; ry = 0; w = hwWidth(t.h); }
  hwGhost.deck.position.set(x, y - th/2 + (t.type === 'finish' ? th/2 : 0), z); hwGhost.deck.rotation.y = ry; hwGhost.deck.scale.set(w, th, len);
  hwGhost.edge.position.copy(hwGhost.deck.position); hwGhost.edge.rotation.y = ry; hwGhost.edge.scale.copy(hwGhost.deck.scale);
  // a line down to whatever's below, to judge the height by
  const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))); by = c ? hwSurface(c) : y;
  const top = y - th; hwGhost.pole.visible = top - by > .1 && t.type !== 'finish';
  hwGhost.pole.position.set(x, (top + by)/2, z); hwGhost.pole.scale.set(.06, Math.max(.01, top - by), .06);
  hwGhost.g.visible = true;
}
function hwHintText(why){
  const base = `Highway · height ${hwLevel} floors ([ and ] to change) · ${hwLanesPick} lanes (L) · click a plot to start · click next to its end to extend · click the end again for the drop-off · right-click a piece to cut it back`;
  return why ? base.replace(' · click a plot to start', '') + ' · ' + why : base;
}
let hwLastPt = null;
function hwHover(cx, cy){ hwLastPt = { x: cx, y: cy }; const t = hwTargetAt(hwPick(cx, cy)); hwShowGhost(t); $('modeHint').textContent = hwHintText(t && !t.ok ? t.why : t && t.type === 'finish' ? 'click to finish it with a drop-off' : ''); }
function hwClick(cx, cy){ const t = hwTargetAt(hwPick(cx, cy)); if (hwApply(t)) hwHover(cx, cy); }
function hwRightClick(cx, cy){ const pk = hwPick(cx, cy); if (pk && pk.kind === 'hwTile'){ hwCutAt(pk.h, pk.k); hwHover(cx, cy); } }
function hwSetLevel(L){ hwLevel = Math.max(HW_MIN_L, Math.min(HW_MAX_L, L)); const el = document.getElementById('hwLevel'); if (el) el.textContent = hwLevel; if (hwLastPt) hwHover(hwLastPt.x, hwLastPt.y); }
function hwSetLanesUI(n){ hwSetLanes(n); const el = document.getElementById('hwLanes'); if (el) el.textContent = n + ' lanes'; if (hwLastPt) hwHover(hwLastPt.x, hwLastPt.y); }
function setHwMode(on, quiet){
  hwMode = on;
  if (on){ if (S.zone) selectZone(null); if (delMode) setDelMode(false, true); if (megaPick) selectMega(null, true); hover.visible = hoverFill.visible = false; showMegaGhost(null); }
  else hwGhost.g.visible = false;
  const b = document.getElementById('hwBtn'); if (b){ b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  const bar = document.getElementById('hwbar'); if (bar) bar.hidden = !on;
  if (on) $('modeHint').textContent = hwHintText('');
  else if (!quiet) selectZone(S.zone);
}
