// Neon Terrarium: megastructures, landmarks that take over a 2x2 block of plots once the city is big enough.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// Each megastructure exists at most once. When its requirement is met (enough buildings of the zones it names),
// each new build has a small chance of bringing it in: it takes over a block of plots (w x h, either way round)
// near that build, replacing what stood there. Some can be stacked: clicking the roof with a zone picked adds a
// tier, up to maxLevels. Right-click takes the top tier off, or removes it when only one is left; it can come back
// once the requirement is met again.
const MEGA_TYPES = {
  radio: { name: 'Radio station', need: { low: 20, mid: 20, high: 20, ind: 20 }, odds: 30, w: 2, h: 2, maxLevels: 1,
           colour: '#ff5a4a', sound: 'radioOn', build: buildRadioStation },
  mall:  { name: 'Sky mall', need: { high: 50, ind: 30 }, odds: 50, w: 3, h: 2, maxLevels: 3,
           colour: '#ffcf7a', build: buildSkyMall },
};
const megas = new Map();   // kind -> { kind, i, j, w, h, levels, seed, x, z, data, view, roofH, top, cells }

// how many building sections of each zone stand in the city
function zoneCounts(){
  const n = { low: 0, mid: 0, high: 0, ind: 0 };
  for (const c of cells.values()) for (const s of c.sections) if (n[s.zone] !== undefined) n[s.zone]++;
  return n;
}
function megaUnlocked(kind){
  const need = MEGA_TYPES[kind].need, n = zoneCounts();
  return Object.keys(need).every(z => n[z] >= need[z]);
}
// called after every build: roll for each megastructure that isn't standing yet and whose requirement is met
function maybeSpawnMegas(c){
  for (const kind in MEGA_TYPES){
    if (megas.has(kind) || !megaUnlocked(kind)) continue;
    if (Math.random() < 1/MEGA_TYPES[kind].odds) spawnMega(kind, c);
  }
}
const blockCells = (i, j, w, h) => { const out = []; for (let a=0;a<w;a++) for (let b=0;b<h;b++) out.push(cells.get(ckey(i+a, j+b))); return out; };
// the block nearest the build, either way round: every plot must exist and be free of other megastructures;
// among the nearest, the one with the fewest buildings on it wins
function findMegaBlock(kind, c){
  const t = MEGA_TYPES[kind];
  const shapes = t.w === t.h ? [[t.w, t.h]] : [[t.w, t.h], [t.h, t.w]];
  let best = null;
  for (const a of cells.values()) for (const [w, h] of shapes){
    const blk = blockCells(a.i, a.j, w, h);
    if (blk.some(b => !b || b.mega)) continue;
    const d = Math.hypot(a.i + (w-1)/2 - c.i, a.j + (h-1)/2 - c.j), secs = blk.reduce((s, b) => s + b.sections.length, 0);
    const score = d*10 + secs + Math.random()*.5;
    if (!best || score < best.score) best = { score, i: a.i, j: a.j, w, h };
  }
  return best;
}
// put a megastructure's record in place on its plots (no drawing)
function placeMega(kind, i, j, seed, w, h, levels = 1){
  const t = MEGA_TYPES[kind];
  if (!t || megas.has(kind)) return null;
  w = w || t.w; h = h || t.h;
  const blk = blockCells(i, j, w, h);
  if (blk.some(b => !b || b.mega)) return null;
  const m = { kind, i, j, w, h, levels: Math.max(1, Math.min(t.maxLevels, levels)), seed, x: (i + (w-1)/2)*LOT, z: (j + (h-1)/2)*LOT,
              data: null, view: null, roofH: CURB, top: CURB, cells: blk };
  for (const b of blk){ b.mega = kind; b.sections = []; }
  megas.set(kind, m);
  return m;
}
const megaSize = m => [m.w*LOT, m.h*LOT];
function spawnMega(kind, near){
  const blk = findMegaBlock(kind, near); if (!blk) return null;
  const covered = blockCells(blk.i, blk.j, blk.w, blk.h);
  for (const b of covered){ finishAnimsOn(b); if (b.view){ world.remove(b.view); b.view = null; } disposeData(b.data); b.data = null; }
  const m = placeMega(kind, blk.i, blk.j, (Math.random()*1e9)|0, blk.w, blk.h); if (!m) return null;
  holdRegion(m);
  refresh(covered, [m]);
  startAnim(m, 'build', CURB - .05, m.top + 1, MEGA_TYPES[kind].colour, megaSize(m), null, MEGA_TYPES[kind].sound);
  return m;
}
// stacking: another tier on top
function addMegaTier(m){
  if (!m || m.levels >= MEGA_TYPES[m.kind].maxLevels) return;
  finishAnimsOn(m);
  holdRegion(m);
  const y0 = m.roofH, old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  m.levels++;
  refresh([], [m]);
  dropView(old);
  startAnim(m, 'build', y0 - .3, m.top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), null);
}
// right-click: the top tier comes off, or the whole thing when it's down to one
function removeMegaTier(m){
  if (!m) return;
  if (m.levels <= 1) return removeMega(m);
  finishAnimsOn(m);
  const top = m.top, old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  m.levels--;
  refresh([], [m]);
  startAnim(m, 'remove', m.roofH - .3, top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), old);
}
function removeMega(m){
  if (!m) return;
  finishAnimsOn(m);
  const old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  megas.delete(m.kind);
  for (const b of m.cells) b.mega = null;
  dirtyRegions.add(regKey(m.i, m.j));
  refresh(m.cells.filter(b => cells.get(ckey(b.i, b.j)) === b));
  startAnim(m, 'remove', CURB - .05, m.top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), old);
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
  box(M.concDD, P, wx, wroof + .01, wz, ww - .08, .04, wd - .08);                                      // roof deck
  for (const [fx, fz, w, d] of [[0, wd/2, ww + .08, .05], [0, -wd/2, ww + .08, .05], [ww/2, 0, .05, wd + .08], [-ww/2, 0, .05, wd + .08]])
    box(M.trimCyan, P, wx + fx, wroof - .05, wz + fz, w, .05, d);                                       // cyan trim round the wing's roof
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

// for trying things out: open the game with #dev in the address, point at a plot and press M for the radio
// station or N for the sky mall (each key brings it in, or removes it if it's already there; ignores the
// requirement and the odds)
if (location.hash.includes('dev')){
  let lastPointer = null;
  addEventListener('pointermove', e => { lastPointer = { x: e.clientX, y: e.clientY }; });
  addEventListener('keydown', e => {
    const kind = { m: 'radio', n: 'mall' }[e.key.toLowerCase()]; if (!kind) return;
    const pk = lastPointer ? pickAt(lastPointer.x, lastPointer.y) : null;
    const c = pk && pk.c ? pk.c : cells.values().next().value;
    if (megas.has(kind)) removeMega(megas.get(kind));
    else if (c) spawnMega(kind, c);
  });
}

/* ---------- the sky mall ---------- */
// A pentagonal glass mall in white and gold. It stands on white columns with gold collars above a marble court,
// and each side is a single sheet of glass, framed only in gold at the corners and floor lines, so you look straight
// in: a marble concourse runs round a central core lined with lit boutiques, with planters, benches, shoppers,
// pendant lights and an escalator between floors. The roof is mostly pool, ringed by a white canopy on gold posts.
// Two floors per tier; lighting is warm throughout, no neon.
M.lux = toon(0xf4f1ea);               // white stone
M.lux2 = toon(0xe7e0d2);              // warm off-white
M.marble = toon(0xefe8da, { em:0x4a3a26, kind:'window' }); M.marble2 = toon(0xdcd2bf, { em:0x3e3020, kind:'window' });   // floors pick up the warm interior light at night
M.marbleOut = toon(0xefe8da);
// real see-through glass: drawn in the colour pass only (it never hides the interior from the outline pass)
M.mallGlass = new THREE.MeshBasicMaterial({ color: 0xd8eef4, transparent: true, opacity: .1, depthWrite: false }); M.mallGlass.userData.colorOnly = true;
M.mallGlint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .32, depthWrite: false }); M.mallGlint.userData.colorOnly = true;
M.gold = toon(0xd6a944);
M.goldLit = toon(0xb98a2e, { em:0xffcf6a, kind:'trim' });   // gold trim that catches the light at night
M.mallPool = toon(0x2a6070, { em:0x1f4a55, kind:'trim' });  // pale water, softer than the neon pools elsewhere
M.shop1 = toon(0x5a4a34, { em:0xffe6b8, kind:'lamp' }); M.shop2 = toon(0x5a4630, { em:0xffcf86, kind:'lamp' }); M.shop3 = toon(0x5c4c3a, { em:0xfff0d4, kind:'lamp' });
M.canvas = toon(0xf7f3ea);
const MALL_FLOOR = 1.45, MALL_PER_TIER = 2;   // tall floors, so you can see deep enough inside to reach the shops
// a pentagonal prism: circumradius 1, from y 0 to 1, one point toward +z
U.pent = (() => {
  const s = new THREE.Shape();
  for (let k=0; k<5; k++){ const a = -PI/2 + k*TAU/5; k ? s.lineTo(Math.cos(a), Math.sin(a)) : s.moveTo(Math.cos(a), Math.sin(a)); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.rotateX(-PI/2);
  return g.toNonIndexed();
})();
// the pentagon's corners and sides at a given size (sx across, sz deep), in the mall's own space
function pentVerts(sx, sz){ const v = []; for (let k=0; k<5; k++){ const a = -PI/2 + k*TAU/5; v.push([Math.cos(a)*sx, -Math.sin(a)*sz]); } return v; }
function pentEdges(sx, sz){
  const v = pentVerts(sx, sz), out = [];
  for (let k=0; k<5; k++){
    const [x0, z0] = v[k], [x1, z1] = v[(k+1)%5], mx = (x0 + x1)/2, mz = (z0 + z1)/2;
    let ry = Math.atan2(-(z1 - z0), x1 - x0);
    if (Math.sin(ry)*mx + Math.cos(ry)*mz < 0) ry += PI;   // local +z faces out
    out.push({ mx, mz, len: Math.hypot(x1 - x0, z1 - z0), ry });
  }
  return out;
}
const pentSlab = (mat, P, y, sx, sz, h) => put(U.pent, mat, under(P, T(0, y, 0, 0, sx, h, sz)));
function buildSkyMall(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const Pc = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));   // the block, long side on local x
  const SX = 5.45, SZ = 3.92, P = under(Pc, T(0, 0, -.0955*SZ));            // the pentagon, centred in the block

  // ---- the court: cream and white marble in a check, a gold pentagon inlaid round the building, planters, lamps
  const nx = 18, nz = 12, cx = L/nx, cz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) box((a + b) % 2 ? M.lux : M.lux2, Pc, (a-(nx-1)/2)*cx, .03, (b-(nz-1)/2)*cz, cx - .02, .045, cz - .02);
  for (const e of pentEdges(SX*1.12, SZ*1.12)) box(M.gold, under(P, T(e.mx, 0, e.mz, e.ry)), 0, .058, 0, e.len, .012, .06);
  for (const [px, pz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const Q = T(px*(L/2 - .45), 0, pz*(D/2 - .45));
    box(M.lux, under(Pc, Q), 0, .2, 0, .5, .34, .5); box(M.gold, under(Pc, Q), 0, .38, 0, .54, .03, .54);
    plant(pick(['bonsai','bamboo']), under(Pc, Q), 0, .39, 0, rnd(.85, 1.05));
  }
  for (const [px, pz] of [[1,0],[-1,0]]){
    const Q = under(Pc, T(px*(L/2 - .3), 0, pz));
    cyl(M.gold, Q, 0, .7, 0, .03, 1.4); box(M.goldLit, Q, 0, 1.42, 0, .14, .08, .14); glow(Q, 0, 1.4, 0, 'warm', 1.4);
  }

  // ---- white columns with gold collars lift the mall; a white deck with a gold lip and a ring of warm bulbs
  const colH = 2.0, y0 = CURB, deckY = y0 + colH, deckT = .38;
  for (const [vx, vz] of [...pentVerts(SX*.78, SZ*.78), [0, 0]]){
    cyl(M.lux, P, vx, y0 + colH/2, vz, .26, colH);
    for (const yy of [y0 + .08, y0 + colH - .1]) put(U.cyl16, M.gold, under(P, T(vx, yy, vz, 0, .64, .07, .64)));
    put(U.cyl16, M.lux2, under(P, T(vx, y0 + .02, vz, 0, .8, .06, .8)));
  }
  pentSlab(M.lux, P, deckY, SX*1.05, SZ*1.05, deckT);
  for (const e of pentEdges(SX*1.05, SZ*1.05)){
    const F = under(P, T(e.mx, 0, e.mz, e.ry));
    box(M.goldLit, F, 0, deckY + deckT - .03, .01, e.len, .05, .04);
    for (let t = -e.len/2 + .3; t < e.len/2 - .2; t += .55){ box(M.bulb, F, t, deckY + .1, .01, .06, .06, .05); if (chance(.5)) glow(F, t, deckY + .08, .12, 'warm', .8); }
  }

  // ---- the glass mall, floor by floor
  const floors = m.levels*MALL_PER_TIER, base = deckY + deckT, CORE = .6;
  const outer = pentEdges(SX, SZ), core = pentEdges(SX*CORE, SZ*CORE), mid = pentEdges(SX*.82, SZ*.82);
  const escSide = irand(0, 4);
  for (let f=0; f<floors; f++){
    const fy = base + f*MALL_FLOOR, tierStart = f % MALL_PER_TIER === 0;
    pentSlab(M.marble, P, fy, SX, SZ, .08);                                      // the marble floor
    pentSlab(M.marble2, P, fy + .002, SX*.7, SZ*.7, .08);                        // a darker inlay ring round the core
    for (const e of outer){                                                       // gold floor line on the glass
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(tierStart ? M.goldLit : M.gold, F, 0, fy + .04, .02, e.len, tierStart ? .1 : .06, .05);
    }
    // the core, lined with boutiques
    pentSlab(M.lux2, P, fy + .08, SX*CORE, SZ*CORE, MALL_FLOOR - .08);
    for (const e of core){
      const F = under(P, T(e.mx, 0, e.mz, e.ry)), n = Math.max(1, Math.floor(e.len/1.05)), w = e.len/n;
      for (let k=0; k<n; k++){
        const x = -e.len/2 + (k + .5)*w, shop = pick([M.shop1, M.shop1, M.shop2, M.shop3]);
        box(shop, F, x, fy + .62, .02, w - .16, 1.0, .04);                        // the lit shopfront
        box(pick([M.gold, M.lux, M.goldLit]), F, x, fy + 1.24, .04, w - .2, .12, .04);   // the name band over it
        for (let g=0; g<irand(2, 4); g++){                                         // goods on display
          const gx = x + rnd(-(w - .4)/2, (w - .4)/2);
          box(pick([M.cloth1, M.cloth3, M.cloth4, M.awn1, M.awn2, M.gold, M.lux]), F, gx, fy + .08 + rnd(.12, .3), .1, rnd(.08, .16), rnd(.2, .5), .08);
        }
        box(M.lux, F, -e.len/2 + k*w, fy + .7, .06, .1, 1.3, .1);                // white pilaster between shops
      }
      box(M.lux, F, e.len/2, fy + .7, .06, .1, 1.3, .1);
    }
    // the concourse: planters, benches, shoppers, pendant lights
    for (const e of mid){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      for (let t = -e.len/2 + .5; t < e.len/2 - .3; t += rnd(.9, 1.5)){
        const r = R();
        if (r < .3){ box(M.lux, F, t, fy + .16, 0, .34, .16, .34); box(M.gold, F, t, fy + .245, 0, .36, .02, .36); plant(pick(['bonsai','bush','bushFlower','succulent']), F, t, fy + .25, 0, rnd(.6, .8)); }
        else if (r < .5){ box(M.lux2, F, t, fy + .14, 0, .5, .05, .16); box(M.gold, F, t, fy + .1, 0, .46, .08, .04); }
        if (chance(.75)){ const sx = t + rnd(-.3, .3), sz = rnd(-.35, .35);      // a shopper or two
          box(pick([M.frame, M.metalDark, M.concDD, M.awn1, M.cloth3]), F, sx, fy + .19, sz, .07, .2, .05); box(M.concDD, F, sx, fy + .32, sz, .05, .05, .05); }
        if (chance(.5)) glow(F, t, fy + MALL_FLOOR - .2, 0, 'warm', .6);            // pendant light
      }
    }
    // an escalator to the floor above, with gold handrails
    if (f < floors - 1){
      const e = mid[escSide], F = under(P, T(e.mx, 0, e.mz, e.ry)), run = Math.min(1.8, e.len*.5);
      strut(M.lux2, F, -run/2, fy + .1, .05, run/2, fy + MALL_FLOOR + .05, .05, .26);
      for (const o of [-.15, .25]) strut(M.gold, F, -run/2, fy + .32, o - .05 + .05, run/2, fy + MALL_FLOOR + .27, o, .025);
    }
    // the glass itself: one sheet per side, framed in gold only at the corners, with the odd streak of reflection
    for (const e of outer){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(M.mallGlass, F, 0, fy + MALL_FLOOR/2 + .04, .03, e.len - .1, MALL_FLOOR - .08, .02);
      if (chance(.6)){ const gx = rnd(-e.len/2 + .6, e.len/2 - .6); box(M.mallGlint, F, gx, fy + MALL_FLOOR/2, .045, .05, MALL_FLOOR*.8, .01, 0, 0, .5); box(M.mallGlint, F, gx + .18, fy + MALL_FLOOR/2, .045, .025, MALL_FLOOR*.6, .01, 0, 0, .5); }
    }
    for (const [vx, vz] of pentVerts(SX, SZ)) box(tierStart ? M.goldLit : M.gold, P, vx, fy + MALL_FLOOR/2, vz, .09, MALL_FLOOR, .09);
  }
  const roof = base + floors*MALL_FLOOR;

  // ---- the roof: a pool over most of it, a marble walk round it, and a white canopy along every edge
  pentSlab(M.lux, P, roof, SX*1.03, SZ*1.03, .14);
  for (const e of pentEdges(SX*1.03, SZ*1.03)) box(M.goldLit, under(P, T(e.mx, 0, e.mz, e.ry)), 0, roof + .1, .01, e.len, .06, .04);
  pentSlab(M.marbleOut, P, roof + .14, SX*.98, SZ*.98, .03);
  pentSlab(M.gold, P, roof + .14, SX*.75, SZ*.75, .06);                          // gold coping round the pool
  pentSlab(M.mallPool, P, roof + .15, SX*.72, SZ*.72, .07);
  glow(P, 0, roof + .3, 0, 'warm', 1.2);
  for (const e of pentEdges(SX*.87, SZ*.87)){
    const F = under(P, T(e.mx, 0, e.mz, e.ry));
    box(M.canvas, F, 0, roof + 1.0, .02, e.len*.95, .04, .46, 0, -.12);         // canopy, sloping out
    box(M.goldLit, F, 0, roof + .96, .25, e.len*.95, .04, .04);
    for (let t = -e.len*.45; t <= e.len*.45 + .01; t += e.len*.9/Math.max(1, Math.round(e.len/1.1))){
      cyl(M.gold, F, t, roof + .58, .2, .025, .8);                                 // gold posts
    }
    for (let t = -e.len*.4; t < e.len*.4; t += .5){ glow(F, t, roof + .9, 0, 'warm', .55); }
    for (let t = -e.len*.35; t < e.len*.35; t += rnd(.7, 1.0)){                    // loungers in the shade
      box(M.lux, F, t, roof + .24, -.02, .22, .05, .42); box(M.gold, F, t, roof + .2, -.02, .2, .04, .38);
      if (chance(.4)) box(pick([M.cloth4, M.awn3, M.cloth2]), F, t, roof + .28, .08, .18, .02, .16);
    }
  }
  for (const [vx, vz] of pentVerts(SX*.92, SZ*.92)) plant('bamboo', P, vx, roof + .17, vz, rnd(.9, 1.1));

  // ---- the sign: a white pylon at the front of the court with the MALL panel framed in gold
  const Fs = under(Pc, T(-L/2 + .7, 0, D/2 - .55, 0));
  box(M.lux, Fs, 0, 1.25, 0, .62, 2.5, .2); box(M.gold, Fs, 0, 2.52, 0, .66, .06, .24); box(M.gold, Fs, 0, .03, 0, .7, .06, .28);
  plant('sign_mall', Fs, 0, 1.4, .11, 1.0, 'c', true); glow(Fs, 0, 1.4, .35, 'amber', 2.0);

  m.roofH = roof + .17;
  m.top = roof + 1.4;
}
