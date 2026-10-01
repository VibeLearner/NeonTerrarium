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
// A glass shopping block lifted on steel truss legs over a paved court: a heavy dark deck with a walkway, string
// lights and planters round its edge, then the glass body, three floors per tier, every bay a warm-lit room seen
// through floor-to-ceiling glass (furniture and plants in silhouette). The top tier carries a roof garden with a
// pool, loungers, palms and a pergola strung with bulbs. Lighting is warm and yellow throughout, no neon.
// rooms burn at a steady brightness day and night (kind 'lamp' isn't dimmed by daylight), so the glass always reads as lit from inside
M.mallRoom = toon(0x5a4630, { em:0xf2c274, kind:'lamp' });
M.mallRoom2 = toon(0x5a4a34, { em:0xf6d39c, kind:'lamp' });
M.mallSteel = toon(0x2b2f37);
M.mallPool = toon(0x1e4652, { em:0x6fb8c4, kind:'trim' });   // softer, paler water than the neon pools elsewhere
const MALL_FLOOR = 1.0, MALL_PER_TIER = 3;
function buildSkyMall(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h;
  const P = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));
  const L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;   // long side along the local x axis
  // the court below
  box(G.asph, P, 0, .012, 0, L, .025, D);
  const nx = 21, nz = 14, sx = L/nx, sz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) if (!chance(.03)) box(pick(TILES.high), P, (a-(nx-1)/2)*sx, .03, (b-(nz-1)/2)*sz, sx - .05, .045, sz - .05);
  // truss legs: four posts with cross-bracing, footings, and a warm lamp on each
  const legH = 2.4, deckT = .45, y0 = CURB, deckY = y0 + legH;
  const lx = L/2 - 1.0, lz = D/2 - 1.0, lw = .32;
  for (const x of [-lx, 0, lx]) for (const z of [-lz, lz]){
    box(M.concDD, P, x, y0 + .1, z, 1.0, .2, 1.0);
    for (const [px, pz] of [[1,1],[1,-1],[-1,-1],[-1,1]]) box(M.mallSteel, P, x + px*lw, y0 + legH/2, z + pz*lw, .11, legH, .11);
    for (let y = .2; y < legH - .3; y += .7) for (const [ax, az, bx2, bz2] of [[1,1,1,-1],[1,-1,-1,-1],[-1,-1,-1,1],[-1,1,1,1]]){
      strut(M.frame, P, x + ax*lw, y0 + y, z + az*lw, x + bx2*lw, y0 + y + .7, z + bz2*lw, .035);
      strut(M.frame, P, x + bx2*lw, y0 + y, z + bz2*lw, x + ax*lw, y0 + y + .7, z + az*lw, .035);
    }
    box(M.bulb, P, x + lw + .07, y0 + legH*.55, z, .06, .1, .06); glow(P, x + lw + .1, y0 + legH*.55, z, 'warm', 1.3);
  }
  // the deck: a thick dark slab with beams beneath, a lit edge, a walkway railing and planters
  box(M.mallSteel, P, 0, deckY + deckT/2, 0, L, deckT, D);
  for (const z of [-lz, lz]) box(M.metalDark, P, 0, deckY - .12, z, L - .6, .24, .3);
  for (const x of [-lx, 0, lx]) box(M.metalDark, P, x, deckY - .12, 0, .3, .24, D - .6);
  const top0 = deckY + deckT;
  box(M.concDD, P, 0, top0 + .01, 0, L - .05, .03, D - .05);
  const edge = (fn) => { for (const [len, ox, oz, ry] of [[L, 0, D/2, 0], [L, 0, -D/2, PI], [D, L/2, 0, PI/2], [D, -L/2, 0, -PI/2]]) fn(under(P, T(ox, 0, oz, ry)), len); };
  edge((F, len) => {
    for (let t = -len/2 + .25; t < len/2 - .1; t += .5){
      box(M.bulb, F, t, deckY + deckT*.55, .03, .07, .06, .04);              // bulbs along the deck's face
      if (Math.round((t + len/2)/.5) % 2 === 0) glow(F, t, deckY + deckT*.5, .12, 'warm', .8);
      cyl(M.frame, F, t, top0 + .2, -.08, .02, .4);                          // railing posts
    }
    box(M.frame, F, 0, top0 + .4, -.08, len - .1, .03, .03);                 // top rail
    for (let t = -len/2 + .6; t < len/2 - .5; t += rnd(1.8, 3.2)) plant(hangKind(), F, t, top0 - .02, .04, rnd(.7, .9), 't', true);   // sparse, so the legs show
  });
  // the glass body, tier by tier
  const inset = .5, BW = L - 2*inset, BD = D - 2*inset, floors = m.levels*MALL_PER_TIER;
  let y = top0;
  for (let f=0; f<floors; f++){
    const fy = y + f*MALL_FLOOR, tierEdge = f % MALL_PER_TIER === 0;
    box(M.concDD, P, 0, fy + .045, 0, BW + (tierEdge ? .3 : .14), tierEdge ? .12 : .09, BD + (tierEdge ? .3 : .14));   // floor slab
    for (const [len, ox, oz, ry] of [[BW, 0, BD/2, 0], [BW, 0, -BD/2, PI], [BD, BW/2, 0, PI/2], [BD, -BW/2, 0, -PI/2]]){
      const F = under(P, T(ox, 0, oz, ry)), nb = Math.max(2, Math.round(len/.9)), bw = len/nb;
      for (let b=0; b<nb; b++){
        const cx = -len/2 + (b + .5)*bw, lit = chance(.9);
        box(lit ? (chance(.7) ? M.mallRoom : M.mallRoom2) : M.glassDark, F, cx, fy + .52, -.36, bw - .02, .86, .04);   // the lit room behind the glass
        if (lit && chance(.75)) box(pick([M.frame, M.metalDark, M.wood, M.concDD]), F, cx + rnd(-.22, .22), fy + .09 + rnd(.1, .2), -.22, rnd(.18, .38), rnd(.2, .38), rnd(.14, .24));   // furniture in silhouette
        if (lit && chance(.2)) plant(pick(['bonsai','bush','succulent']), F, cx + rnd(-.2, .2), fy + .09, -.18, .7);
        box(M.mallSteel, F, -len/2 + b*bw, fy + .52, 0, .05, .9, .06);       // mullion
      }
      box(M.mallSteel, F, 0, fy + .97, 0, len, .04, .06);                     // transom at the ceiling
      if (chance(.35)){                                                       // a planter ledge along the glass, greenery spilling over
        box(M.concDD, F, 0, fy + .14, .1, len - .2, .1, .16);
        for (let t = -len/2 + .4; t < len/2 - .3; t += rnd(.5, 1.1)) chance(.5) ? plant(hangKind(), F, t, fy + .16, .19, rnd(.7, .95), 't', true) : plant(pick(['bush','g_fern2','bushFlower']), F, t, fy + .19, .1, rnd(.55, .75));
      }
    }
    for (const [cx, cz] of [[1,1],[1,-1],[-1,-1],[-1,1]]) box(M.mallSteel, P, cx*BW/2, fy + .5, cz*BD/2, .16, 1.0, .16);   // corner columns
    // warm strip under each slab edge
    for (let t = -BW/2 + .3; t < BW/2; t += 1.2){ glow(P, t, fy + .03, BD/2 + .12, 'warm', .55); glow(P, t, fy + .03, -BD/2 - .12, 'warm', .55); }
  }
  box(M.concD, P, 0, y + floors*MALL_FLOOR/2, 0, BW - .9, floors*MALL_FLOOR - .1, BD - .9);   // the core, so you never see through
  const roof = y + floors*MALL_FLOOR;
  // the tall MALL sign on the front, lit warm
  const Fs = under(P, T(-BW/2 + .9, 0, BD/2 + .02, 0));
  box(M.mallSteel, Fs, 0, roof - 1.45, .06, .7, 2.0, .06);
  plant('sign_mall', Fs, 0, roof - 1.45, .1, 1.0, 'c', true); glow(Fs, 0, roof - 1.45, .35, 'amber', 2.2);
  // roof garden
  box(M.concDD, P, 0, roof + .06, 0, BW + .24, .12, BD + .24);
  box(M3.deckTile, P, 0, roof + .13, 0, BW - .4, .03, BD - .4);
  for (let t = -BW/2 + .5; t < BW/2 - .3; t += .6) box(M3.deckTile2, P, t, roof + .146, 0, .04, .005, BD - .5);   // deck tile seams
  edge2();
  function edge2(){
    for (const [len, ox, oz, ry] of [[BW + .2, 0, BD/2 + .1, 0], [BW + .2, 0, -BD/2 - .1, PI], [BD + .2, BW/2 + .1, 0, PI/2], [BD + .2, -BW/2 - .1, 0, -PI/2]]){
      const F = under(P, T(ox, 0, oz, ry));
      box(M.glassTeal, F, 0, roof + .32, 0, len, .36, .03);                   // glass balustrade
      box(M.mallSteel, F, 0, roof + .51, 0, len, .03, .05);
      for (let t = -len/2 + .3; t < len/2; t += .6){ box(M.bulb, F, t, roof + .55, 0, .05, .05, .05); if (chance(.5)) glow(F, t, roof + .58, 0, 'warm', .6); }
    }
  }
  const pw = Math.min(2.6, BW*.3), pd = Math.min(1.3, BD*.32), px0 = BW*.12;
  box(M.wood, P, px0, roof + .15, 0, pw + 1.2, .04, pd + 1.0);                                          // timber deck round the pool
  box(M.frame, P, px0, roof + .16, 0, pw + .1, .06, pd + .1); box(M.mallPool, P, px0, roof + .18, 0, pw, .04, pd); glow(P, px0, roof + .24, 0, 'warm', 1.2);
  for (let k=0; k<4; k++){ const lz2 = (k < 2 ? -1 : 1)*(pd/2 + .32), lx2 = px0 + (k % 2 ? .5 : -.5); box(M.white2, P, lx2, roof + .2, lz2, .22, .06, .46); box(M.awn3, P, lx2, roof + .24, lz2 - .17, .22, .1, .06); }
  for (let k=0; k<7; k++) plant(pick(['bamboo','bonsai','bush','bushFlower','g_spread2']), P, rnd(-BW/2 + .5, -BW*.18), roof + .15, rnd(-BD/2 + .5, BD/2 - .5), rnd(.8, 1.05));
  for (let k=0; k<4; k++) plant(pick(['bamboo','bonsai']), P, rnd(px0 + pw/2 + .3, BW/2 - .4), roof + .15, (k % 2 ? 1 : -1)*rnd(.3, BD/2 - .4), rnd(.9, 1.1));
  // pergola with string lights over a lounge corner
  const gx = -BW/2 + 1.3, gz = 0;
  for (const [cx, cz] of [[1,1],[1,-1],[-1,-1],[-1,1]]) box(M.wood, P, gx + cx*.7, roof + .62, gz + cz*.6, .07, .95, .07);
  for (let t = -.6; t <= .6; t += .3) box(M.wood, P, gx, roof + 1.1, gz + t, 1.55, .05, .05);
  for (let t = -.7; t <= .7; t += .35){ box(M.bulb, P, gx + t, roof + 1.03, gz, .05, .05, .05); glow(P, gx + t, roof + 1.0, gz, 'warm', .7); }
  box(M.wood, P, gx, roof + .3, gz, 1.0, .2, .5); box(M.cloth2, P, gx, roof + .42, gz, .9, .06, .42);
  m.roofH = roof + .12;
  m.top = roof + 1.3;
}
