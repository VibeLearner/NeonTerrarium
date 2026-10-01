// Neon Terrarium: megastructures, landmarks that take over a 2x2 block of plots once the city is big enough.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// Each megastructure exists at most once. When its requirement is met (enough buildings of every zone), each new
// build has a small chance of bringing it in: it takes over a 2x2 block of plots around that build, replacing what
// stood there. Removing it (right-click) frees the plots, and it can come back once the requirement is met again.
const MEGA_TYPES = {
  radio: { name: 'Radio station', need: 20, odds: 30, colour: '#ff5a4a', build: buildRadioStation },
};
const megas = new Map();   // kind -> { kind, i, j, seed, x, z, data, view, roofH, top }

// how many building sections of each zone stand in the city
function zoneCounts(){
  const n = { low: 0, mid: 0, high: 0, ind: 0 };
  for (const c of cells.values()) for (const s of c.sections) if (n[s.zone] !== undefined) n[s.zone]++;
  return n;
}
function megaUnlocked(kind){
  const t = MEGA_TYPES[kind], n = zoneCounts();
  return Object.values(n).every(v => v >= t.need);
}
// called after every build: roll for each megastructure that isn't standing yet and whose requirement is met
function maybeSpawnMegas(c){
  for (const kind in MEGA_TYPES){
    if (megas.has(kind) || !megaUnlocked(kind)) continue;
    if (Math.random() < 1/MEGA_TYPES[kind].odds) spawnMega(kind, c);
  }
}
// the 2x2 block nearest the build: every plot must exist and be free of other megastructures;
// among the nearest, the one with the fewest buildings on it wins
function findMegaBlock(c){
  let best = null;
  for (const a of cells.values()){
    const blk = [[0,0],[1,0],[0,1],[1,1]].map(([di,dj]) => cells.get(ckey(a.i+di, a.j+dj)));
    if (blk.some(b => !b || b.mega)) continue;
    const d = Math.hypot(a.i + .5 - c.i, a.j + .5 - c.j), secs = blk.reduce((s, b) => s + b.sections.length, 0);
    const score = d*10 + secs + Math.random()*.5;
    if (!best || score < best.score) best = { score, i: a.i, j: a.j };
  }
  return best;
}
// put a megastructure's record in place on its four plots (no drawing)
function placeMega(kind, i, j, seed){
  if (!MEGA_TYPES[kind] || megas.has(kind)) return null;
  const blk = [[0,0],[1,0],[0,1],[1,1]].map(([di,dj]) => cells.get(ckey(i+di, j+dj)));
  if (blk.some(b => !b || b.mega)) return null;
  const m = { kind, i, j, seed, x: (i + .5)*LOT, z: (j + .5)*LOT, data: null, view: null, roofH: CURB, top: CURB, cells: blk };
  for (const b of blk){ b.mega = kind; b.sections = []; }
  megas.set(kind, m);
  return m;
}
function spawnMega(kind, near){
  const blk = findMegaBlock(near); if (!blk) return null;
  const covered = [[0,0],[1,0],[0,1],[1,1]].map(([di,dj]) => cells.get(ckey(blk.i+di, blk.j+dj)));
  for (const b of covered){ finishAnimsOn(b); if (b.view){ world.remove(b.view); b.view = null; } disposeData(b.data); b.data = null; }
  const m = placeMega(kind, blk.i, blk.j, (Math.random()*1e9)|0); if (!m) return null;
  holdRegion(m);
  refresh(covered, [m]);
  startAnim(m, 'build', CURB - .05, m.top + 1, MEGA_TYPES[kind].colour, 2*LOT, null);
  return m;
}
function removeMega(m){
  if (!m) return;
  finishAnimsOn(m);
  const old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  megas.delete(m.kind);
  for (const b of m.cells) b.mega = null;
  dirtyRegions.add(regKey(m.i, m.j));
  refresh(m.cells.filter(b => cells.get(ckey(b.i, b.j)) === b));
  startAnim(m, 'remove', CURB - .05, m.top + 1, MEGA_TYPES[m.kind].colour, 2*LOT, old);
}
function rebuildMega(m){
  finishAnimsOn(m);
  disposeData(m.data);
  m.data = collect(() => MEGA_TYPES[m.kind].build(m));
  cellView(m);
  for (const b of m.cells) b.height = m.roofH;
  dirtyRegions.add(regKey(m.i, m.j));
}

/* ---------- kit: struts and dishes ---------- */
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sm = new THREE.Matrix4(), _sUp = new THREE.Vector3(0,1,0);
// a square bar from point a to point b (in P's space)
function strut(mat, P, ax, ay, az, bx, by, bz, t){
  _sa.set(ax, ay, az); _sb.set(bx - ax, by - ay, bz - az);
  const len = _sb.length(); if (len < 1e-4) return;
  _sq.setFromUnitVectors(_sUp, _sb.clone().divideScalar(len));
  _sm.compose(_sa.addScaledVector(_sb, .5), _sq, new THREE.Vector3(t, len, t));
  put(U.box, mat, under(P, _sm.clone()));
}
// a satellite dish: a shallow bowl with a concave face, a feed horn on three struts, on a post with a pivot
U.dish = (() => {
  const pts = [[.02,0],[.2,.03],[.4,.12],[.5,.2],[.47,.215],[.36,.15],[.18,.08],[.02,.06]].map(([x,y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 16).toNonIndexed(); g.computeVertexNormals(); return g;
})();
function dish(P, x, y, z, r, yaw, tilt, light){
  const ph = .12 + r*.45;
  cyl(M.metalDark, P, x, y + ph/2, z, .045 + r*.03, ph);
  const Q = under(P, T(x, y + ph, z, yaw)), D = under(Q, T(0, 0, 0, 0, 1, 1, 1, tilt));
  box(M.frame, D, 0, 0, 0, r*.5, .06, .1);                       // the pivot yoke
  put(U.dish, M.white2, under(D, T(0, .02, 0, 0, 2*r, 2*r, 2*r)));
  const f = r*.85;                                               // the feed sits out at the focus
  for (const a of [0, 2.1, 4.2]) strut(M.frame, D, Math.cos(a)*r*.9, .4*r, Math.sin(a)*r*.9, 0, f, 0, .02);
  box(M.metal, D, 0, f, 0, .07, .08, .07);
  if (light){ box(M.blink, D, 0, f + .07, 0, .05, .05, .05); glow(D, 0, f + .08, 0, 'blink', .7); }
}
function beaconLight(P, x, y, z, s = .07, g = .8){ box(M.blink, P, x, y, z, s, s, s); glow(P, x, y, z, 'blink', g); }
M.blink = toon(0x3a0c0c, { em:0xff2020, kind:'blink' });

/* ---------- the radio station ---------- */
// A three-storey broadcast house with a dish farm on its roof, a lower wing carrying the two big dishes, and a
// lattice radio mast at the far corner, linked by a catwalk. Red lights blink all over it, chasing up the mast.
function buildRadioStation(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), S2 = 2*LOT;
  // ground: one paved compound across all four plots, with a darker service apron round the mast
  box(G.asph, P, 0, .012, 0, S2, .025, S2);
  const n = 14, st = S2/n;
  for (let a=0;a<n;a++) for (let b=0;b<n;b++) if (!chance(.035)) box(pick(TILES.ind), P, (a-(n-1)/2)*st, .03, (b-(n-1)/2)*st, st - .05, .045, st - .05);
  box(M.hazard, P, 2.2, .058, 2.2, 2.9, .012, 2.9); box(M.concDD, P, 2.2, .062, 2.2, 2.7, .014, 2.7);

  // ---- main building
  const bx = -1.05, bz = -.55, bw = 4.6, bd = 4.2, floors = 4, h = floors*FH + .25, y0 = CURB, roof = y0 + h;
  box(M.concM, P, bx, y0 + h/2, bz, bw, h, bd);
  for (let f=0; f<=floors; f++) box(M.concD, P, bx, y0 + f*FH + .02, bz, bw + .1, .09, bd + .1);          // floor ledges
  for (let f=0; f<floors; f++){
    const wy = y0 + f*FH + .52;
    for (const [fx, fz, len, ry] of [[0, bd/2, bw, 0], [0, -bd/2, bw, PI], [bw/2, 0, bd, PI/2], [-bw/2, 0, bd, -PI/2]]){
      const F = under(P, T(bx + fx, 0, bz + fz, ry));
      box(f % 2 ? M.interiorCool : M.winLit, F, 0, wy, .02, len - .5, .34, .04);                        // a band of lit studio windows
      for (let t = -len/2 + .45; t < len/2 - .3; t += .42) box(M.frame, F, t, wy, .05, .04, .36, .03);    // mullions
    }
  }
  box(M.concDD, P, bx, roof + .01, bz, bw - .1, .04, bd - .1);                                          // roof deck
  for (const [fx, fz, w, d] of [[0, bd/2, bw + .14, .05], [0, -bd/2, bw + .14, .05], [bw/2, 0, .05, bd + .14], [-bw/2, 0, .05, bd + .14]])
    box(M.trimCyan, P, bx + fx, roof - .06, bz + fz, w, .05, d);                                       // cyan trim round the roof edge
  for (const [fx, fz, w, d] of [[0, bd/2, bw, .12], [0, -bd/2, bw, .12], [bw/2, 0, .12, bd], [-bw/2, 0, .12, bd]])
    box(M.concD, P, bx + fx, roof + .14, bz + fz, w, .28, d);                                            // parapet
  // entrance: glass doors, an awning, and the ON AIR sign
  const E = under(P, T(bx, 0, bz + bd/2, 0));
  box(M.glassDark, E, -.6, y0 + .38, .03, .9, .7, .05); box(M.frame, E, -.6, y0 + .38, .06, .04, .7, .02);
  box(M.awn1, E, -.6, y0 + .82, .3, 1.2, .05, .6);
  plant('sign_onair', E, .55, y0 + .62, .08, 1.0, 'c', true); glow(E, .55, y0 + .62, .35, 'red', 1.8);
  plant('sign_onair', under(P, T(bx - bw/2, 0, bz, -PI/2)), .5, roof - .45, .06, 1.0, 'c', true);
  // a vertical neon strip down one corner
  box(M.neonPink, P, bx + bw/2 + .05, y0 + h/2, bz + bd/2 + .05, .05, h - .2, .05);
  // roof: equipment, then the dish farm, small dishes pointing every which way
  box(M.metal, P, bx - 1.4, roof + .25, bz - 1.3, .9, .5, .7); box(M.metalDark, P, bx + 1.5, roof + .2, bz - 1.4, .6, .4, .6);
  for (const [cx, cz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) beaconLight(P, bx + cx*(bw/2 - .06), roof + .33, bz + cz*(bd/2 - .06));
  for (let t = -bw/2 + 1.15; t < bw/2 - .8; t += 1.15){ beaconLight(P, bx + t, roof + .32, bz + bd/2, .06, .6); beaconLight(P, bx + t, roof + .32, bz - bd/2, .06, .6); }
  const spots = [];
  for (let k=0; k<120 && spots.length < 18; k++){
    const x = bx + rnd(-bw/2 + .4, bw/2 - .4), z = bz + rnd(-bd/2 + .4, bd/2 - .4), r = rnd(.24, .55);
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < s.r + r + .06)) continue;
    if (Math.hypot(x - (bx - 1.4), z - (bz - 1.3)) < .9 || Math.hypot(x - (bx + 1.5), z - (bz - 1.4)) < .7) continue;
    spots.push({ x, z, r });
  }
  for (const s of spots) dish(P, s.x, roof, s.z, s.r, rnd(0, TAU), rnd(.35, 1.15), chance(.7));

  // ---- the wing: one storey, two big dishes on top
  const wx = 2.15, wz = -1.55, ww = 2.9, wd = 3.6, wh = FH + .35, wroof = y0 + wh;
  box(M.concL, P, wx, y0 + wh/2, wz, ww, wh, wd);
  box(M.shutter, P, wx + ww/2 + .01, y0 + .42, wz, .03, .8, 1.4);
  box(M.hazard, P, wx + ww/2 + .02, y0 + .86, wz, .03, .06, 1.5);
  box(M.trimCyan, P, wx, wroof, wz, ww + .08, .05, wd + .08);
  dish(P, wx - .55, wroof, wz - .75, rnd(.85, 1.0), rnd(0, TAU), rnd(.5, .9), true);
  dish(P, wx + .55, wroof, wz + .95, rnd(.7, .85), rnd(0, TAU), rnd(.4, 1.0), true);
  for (const [cx, cz] of [[-1,-1],[1,-1],[1,1]]) beaconLight(P, wx + cx*(ww/2 - .05), wroof + .06, wz + cz*(wd/2 - .05));

  // ---- the mast: a square lattice tower, tapering, with platforms, panel antennas and a whip on top
  const tx = 2.2, tz = 2.2, Ht = rnd(17, 20.5), b0 = .85, b1 = .2, seg = 1.25;
  const half = y => b0 + (b1 - b0)*(y/Ht);
  const legs = [[1,1],[1,-1],[-1,-1],[-1,1]];
  for (const [sx, sz] of legs) strut(M.red2, P, tx + sx*b0, y0, tz + sz*b0, tx + sx*b1, y0 + Ht, tz + sz*b1, .1);
  box(M.concD, P, tx, y0 + .12, tz, 2*b0 + .5, .24, 2*b0 + .5);                                          // footing
  let lvl = 0;
  for (let y = 0; y < Ht - .01; y += seg, lvl++){
    const y2 = Math.min(Ht, y + seg), w1 = half(y), w2 = half(y2), mat = lvl % 2 ? M.white2 : M.red2;   // painted in red and white bands
    for (let k=0; k<4; k++){
      const [ax, az] = legs[k], [cx2, cz2] = legs[(k+1)%4];
      strut(mat, P, tx + ax*w2, y0 + y2, tz + az*w2, tx + cx2*w2, y0 + y2, tz + cz2*w2, .05);                // ring
      strut(M.frame, P, tx + ax*w1, y0 + y, tz + az*w1, tx + cx2*w2, y0 + y2, tz + cz2*w2, .03);           // X bracing
      strut(M.frame, P, tx + cx2*w1, y0 + y, tz + cz2*w1, tx + ax*w2, y0 + y2, tz + az*w2, .03);
    }
    if (lvl % 2 === 1) for (const [sx, sz] of legs) if (chance(.6)) beaconLight(P, tx + sx*(w2 + .04), y0 + y2, tz + sz*(w2 + .04), .07, .7);
  }
  for (const f of [.38, .7]){
    const py = y0 + Ht*f, pw = half(Ht*f) + .35;
    box(M.metalDark, P, tx, py, tz, 2*pw, .06, 2*pw);
    for (const [sx, sz] of legs) cyl(M.frame, P, tx + sx*pw, py + .18, tz + sz*pw, .02, .36);
    for (let k=0; k<4; k++){                                                                              // panel antennas round the deck
      const a = k*PI/2 + rnd(-.2, .2), F = under(P, T(tx + Math.sin(a)*(pw - .08), py, tz + Math.cos(a)*(pw - .08), a));
      box(M.white2, F, 0, .45, 0, .22, .8, .08);
    }
    for (let k=0; k<3; k++){ const a = k*TAU/3 + rnd(0, 1), F = under(P, T(tx + Math.sin(a)*(pw - .2), py, tz + Math.cos(a)*(pw - .2), a)); dish(F, 0, .03, .15, rnd(.22, .32), rnd(-.6, .6), rnd(.6, 1.3), chance(.5)); }
    if (chance(.8)){ const a = rnd(0, TAU), F = under(P, T(tx + Math.sin(a)*pw, py, tz + Math.cos(a)*pw, a));   // a microwave drum
      put(U.cyl16, M.white2, under(F, T(0, .45, .12, 0, .6, .22, .6, PI/2))); box(M.frame, F, 0, .45, -.02, .08, .5, .05); }
    beaconLight(P, tx + pw, py + .1, tz + pw, .08, .9); beaconLight(P, tx - pw, py + .1, tz - pw, .08, .9);
  }
  const top = y0 + Ht;
  cyl(M.white2, P, tx, top + 1.3, tz, .05, 2.6); cyl(M.red2, P, tx, top + 2.0, tz, .07, .2);           // the whip
  for (const a of [0, PI/2, PI, -PI/2]) strut(M.frame, P, tx, top + .9, tz, tx + Math.sin(a)*.45, top + .5, tz + Math.cos(a)*.45, .02);
  beaconLight(P, tx, top + 2.7, tz, .12, 1.6);                                                               // the beacon
  beaconLight(P, tx + b1, top + .06, tz + b1, .08, .9); beaconLight(P, tx - b1, top + .06, tz - b1, .08, .9);
  // guy wires out to anchor blocks
  for (const [gx, gz] of [[3.5, .2], [.2, 3.55], [3.55, 3.55]]){
    box(M.concD, P, gx, y0 + .08, gz, .3, .16, .3);
    strut(M.frame, P, gx, y0 + .16, gz, tx, y0 + Ht*.62, tz, .015);
  }
  // a catwalk from the main roof across to the mast
  const cy = roof + .05, ex = tx - half(roof - y0) - .05;
  strut(M.metalDark, P, bx + bw/2 - .1, cy, bz + bd/2 - .5, ex, cy, tz, .32);
  strut(M.frame, P, bx + bw/2 - .1, cy + .3, bz + bd/2 - .65, ex, cy + .3, tz - .15, .03);
  // ground: equipment cabinets by the mast, a fence round the footing, planters, a lamp
  for (let k=0; k<3; k++) box(pick([M.metal, M.white2, M.metalDark]), P, 3.3 - k*.45, y0 + .25, .9, .35, .5, .3);
  for (const [sx, sz] of legs){ cyl(M.frame, P, tx + sx*1.3, y0 + .3, tz + sz*1.3, .025, .6); }
  for (const [ax, az, bxx, bzz] of [[1,1,1,-1],[1,-1,-1,-1],[-1,-1,-1,1],[-1,1,1,1]]) strut(M.frame, P, tx + ax*1.3, y0 + .55, tz + az*1.3, tx + bxx*1.3, y0 + .55, tz + bzz*1.3, .025);
  for (let k=0; k<5; k++) plant(pick(['bush','bushFlower','bonsai','g_spread1','g_fern3']), P, rnd(-3.4, -.2), .05, rnd(2.0, 3.4), rnd(.7, .95));
  for (let k=0; k<3; k++) plant(hangKind(), under(P, T(bx, 0, bz - bd/2, PI)), rnd(-1.8, 1.8), roof + .2, .1, rnd(.8, 1.1), 't', true);
  cyl(M.metalDark, P, -3.3, .65, 3.3, .03, 1.3); box(M.bulb, P, -3.18, 1.26, 3.3, .12, .05, .1); glow(P, -3.18, 1.2, 3.3, 'warm', 1.4);

  m.roofH = roof + .3;
  m.top = top + 2.8;
}

// for trying things out: open the game with #dev in the address and press M to bring the radio station in
// next to the plot under the pointer (ignores the requirement and the odds)
if (location.hash.includes('dev')){
  let lastPointer = null;
  addEventListener('pointermove', e => { lastPointer = { x: e.clientX, y: e.clientY }; });
  addEventListener('keydown', e => {
    if (e.key !== 'm' && e.key !== 'M') return;
    const pk = lastPointer ? pickAt(lastPointer.x, lastPointer.y) : null;
    const c = pk && pk.c ? pk.c : cells.values().next().value;
    if (megas.has('radio')) removeMega(megas.get('radio'));
    else if (c) spawnMega('radio', c);
  });
}
