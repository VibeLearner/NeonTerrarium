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
  square: { name: 'Town square', need: { low: 40, mid: 40 }, odds: 40, w: 5, h: 5, maxLevels: 1,
           colour: '#9dff6a', build: buildTownSquare, fx: koiFx },
  foundry: { name: 'Foundry', need: { ind: 60 }, odds: 50, w: 6, h: 4, maxLevels: 1,
           colour: '#ff8a2a', build: buildFoundry },
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
// The block for a megastructure, near the build that brought it in, either way round. Plots that don't exist yet are allowed: the platform grows to fit (a 5x5 square shouldn't need
// a perfect 5x5 of platform already waiting). Plots under another megastructure are never taken. Preferred:
// close to the build, few missing plots, few buildings replaced.
function findMegaBlock(kind, c){
  const t = MEGA_TYPES[kind];
  const shapes = t.w === t.h ? [[t.w, t.h]] : [[t.w, t.h], [t.h, t.w]];
  let best = null;
  // blocks covering the build first; failing that (say it sits under another megastructure), ones a little further out
  for (const [w, h] of shapes) for (let i = c.i - w - 3; i <= c.i + 3; i++) for (let j = c.j - h - 3; j <= c.j + 3; j++){
    if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX || Math.abs(i + w - 1) > GRID_MAX || Math.abs(j + h - 1) > GRID_MAX) continue;
    const blk = blockCells(i, j, w, h);
    if (blk.some(b => b && b.mega)) continue;
    const missing = blk.filter(b => !b).length, secs = blk.reduce((s, b) => s + (b ? b.sections.length : 0), 0);
    const d = Math.hypot(i + (w-1)/2 - c.i, j + (h-1)/2 - c.j);
    const score = d*4 + missing*3 + secs + Math.random()*.5;
    if (!best || score < best.score) best = { score, i, j, w, h };
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
  const grown = [];
  for (let a=0; a<blk.w; a++) for (let b=0; b<blk.h; b++){   // grow any missing platform under the block
    const i = blk.i + a, j = blk.j + b;
    if (!cells.has(ckey(i, j))){ const c = newCell(i, j); c.style = styleNow(); cells.set(ckey(i, j), c); grown.push(c); }
  }
  const covered = blockCells(blk.i, blk.j, blk.w, blk.h);
  // neighbours of new plots lose their railings on the joining side
  for (const c of grown) for (const [a, b] of SIDES4){ const nb = cells.get(ckey(c.i + a, c.j + b)); if (nb && !nb.mega && !covered.includes(nb)) covered.push(nb); }
  for (const b of covered){ finishAnimsOn(b); if (b.view){ world.remove(b.view); b.view = null; } disposeData(b.data); b.data = null; }
  const m = placeMega(kind, blk.i, blk.j, (Math.random()*1e9)|0, blk.w, blk.h); if (!m) return null;
  holdRegion(m);
  refresh(covered.filter(b => !b.mega || b.mega === kind), [m]);
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
  if (m.fx){ m.fx.dispose(); m.fx = null; }
  const old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  megas.delete(m.kind);
  for (const b of m.cells) b.mega = null;
  dirtyRegions.add(regKey(m.i, m.j));
  refresh(m.cells.filter(b => cells.get(ckey(b.i, b.j)) === b));
  startAnim(m, 'remove', CURB - .05, m.top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), old);
}
// moving parts (like the square's holographic koi) live outside the batched geometry and are updated every frame
function megaFx(m){
  if (m.fx){ m.fx.dispose(); m.fx = null; }
  const t = MEGA_TYPES[m.kind]; if (t.fx) m.fx = t.fx(m);
}
function updateMegaFx(dt, time){ for (const m of megas.values()) if (m.fx) m.fx.update(dt, time); }
function rebuildMega(m){
  finishAnimsOn(m);
  disposeData(m.data);
  m.data = collect(() => MEGA_TYPES[m.kind].build(m));
  cellView(m);
  megaFx(m);
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
    const kind = { m: 'radio', n: 'mall', b: 'square', v: 'foundry' }[e.key.toLowerCase()]; if (!kind) return;
    const pk = lastPointer ? pickAt(lastPointer.x, lastPointer.y) : null;
    const c = pk && pk.c ? pk.c : pk && pk.kind === 'sky' ? { i: pk.i, j: pk.j } : cells.values().next().value;
    if (megas.has(kind)) removeMega(megas.get(kind));
    else if (c) spawnMega(kind, c);
  });
}

/* ---------- the sky mall ---------- */
// An octagonal glass mall in white and gold. It stands on white columns with gold collars above a marble court,
// and each side is a single sheet of glass, framed only in gold at the corners and floor lines. Inside is an open
// atrium: upper floors are walkway rings round a central core of boutiques (varied widths, neon signs over the
// doors), with glass balustrades, so you see down through the void to every floor. Fountains sit in the atrium; the walkways carry futuristic luxury furnishings. The roof is mostly pool, ringed by a white canopy
// on gold posts. Two floors per tier; warm lighting, with neon only on the shop signs.
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
// The mall is an octagon: a rectangle with its corners cut at 45 degrees, which fills its block and lines up with
// the streets. MALL_HX/HZ are the half-widths at scale 1 and MALL_C the corner cut; every ring of the building
// (core, walkway, glass, canopy) is the same octagon scaled about the centre.
const MALL_HX = 5.2, MALL_HZ = 3.35, MALL_C = 1.3;
function octVerts(sx, sz){   // sx, sz: half-widths of this ring
  const c = MALL_C*Math.min(sx/MALL_HX, sz/MALL_HZ);
  return [[sx - c, -sz], [sx, -sz + c], [sx, sz - c], [sx - c, sz], [-sx + c, sz], [-sx, sz - c], [-sx, -sz + c], [-sx + c, -sz]];
}
function octEdges(sx, sz){
  const v = octVerts(sx, sz), out = [];
  for (let k=0; k<v.length; k++){
    const [x0, z0] = v[k], [x1, z1] = v[(k+1)%v.length], mx = (x0 + x1)/2, mz = (z0 + z1)/2;
    let ry = Math.atan2(-(z1 - z0), x1 - x0);
    if (Math.sin(ry)*mx + Math.cos(ry)*mz < 0) ry += PI;   // local +z faces out
    out.push({ mx, mz, len: Math.hypot(x1 - x0, z1 - z0), ry });
  }
  return out;
}
// a flat octagonal slab, optionally with an octagonal hole (a ring), cached by size
const octGeoCache = new Map();
function octSlab(mat, P, y, sx, sz, h, hx = 0, hz = 0){
  const key = [sx, sz, hx, hz].map(v => v.toFixed(3)).join(',');
  let g = octGeoCache.get(key);
  if (!g){
    const shape = new THREE.Shape(), v = octVerts(sx, sz);
    v.forEach(([x, z], k) => k ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    if (hx > 0){ const hole = new THREE.Path(), w = octVerts(hx, hz).reverse(); w.forEach(([x, z], k) => k ? hole.lineTo(x, -z) : hole.moveTo(x, -z)); shape.holes.push(hole); }
    g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); g.rotateX(-PI/2); g = g.toNonIndexed();
    octGeoCache.set(key, g);
  }
  put(g, mat, under(P, T(0, y, 0, 0, 1, h, 1)));
}
function buildSkyMall(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const Pc = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));   // the block, long side on local x
  const SX = MALL_HX, SZ = MALL_HZ, P = Pc;

  // ---- the court: cream and white marble in a check, a gold octagon inlaid round the building, planters, lamps
  const nx = 18, nz = 12, cx = L/nx, cz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) box((a + b) % 2 ? M.lux : M.lux2, Pc, (a-(nx-1)/2)*cx, .03, (b-(nz-1)/2)*cz, cx - .02, .045, cz - .02);
  for (const e of octEdges(SX + .35, SZ + .35)) box(M.gold, under(P, T(e.mx, 0, e.mz, e.ry)), 0, .058, 0, e.len, .012, .06);
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
  for (const [vx, vz] of [...octVerts(SX*.78, SZ*.78), [0, 0]]){
    cyl(M.lux, P, vx, y0 + colH/2, vz, .26, colH);
    for (const yy of [y0 + .08, y0 + colH - .1]) put(U.cyl16, M.gold, under(P, T(vx, yy, vz, 0, .64, .07, .64)));
    put(U.cyl16, M.lux2, under(P, T(vx, y0 + .02, vz, 0, .8, .06, .8)));
  }
  octSlab(M.lux, P, deckY, SX*1.05, SZ*1.05, deckT);
  for (const e of octEdges(SX*1.05, SZ*1.05)){
    const F = under(P, T(e.mx, 0, e.mz, e.ry));
    box(M.goldLit, F, 0, deckY + deckT - .03, .01, e.len, .05, .04);
    for (let t = -e.len/2 + .3; t < e.len/2 - .2; t += .55){ box(M.bulb, F, t, deckY + .1, .01, .06, .06, .05); if (chance(.5)) glow(F, t, deckY + .08, .12, 'warm', .8); }
  }

  // ---- the glass mall, floor by floor
  const floors = m.levels*MALL_PER_TIER, base = deckY + deckT, CORE = .45;
  const outer = octEdges(SX, SZ), core = octEdges(SX*CORE, SZ*CORE), mid = octEdges(SX*.82, SZ*.82), voidMid = octEdges(SX*.84, SZ*.84);
  const escSide = pick([0, 2, 4, 6]);   // which straight sides the atrium fountains sit on
  const WALK = .68, walk = octEdges(SX*((CORE + WALK)/2), SZ*((CORE + WALK)/2)), rail = octEdges(SX*WALK, SZ*WALK);
  for (let f=0; f<floors; f++){
    const fy = base + f*MALL_FLOOR, tierStart = f % MALL_PER_TIER === 0;
    // An atrium: only the ground floor reaches the glass. Upper floors are a walkway ring round the core with a
    // glass balustrade, so from outside you look down through the void to the shops on every floor.
    if (f === 0){
      octSlab(M.marble, P, fy, SX, SZ, .08);
      octSlab(M.marble2, P, fy + .002, SX*.9, SZ*.9, .08, SX*.8, SZ*.8);       // a darker inlay band round the atrium floor
    } else {
      octSlab(M.marble, P, fy, SX*WALK, SZ*WALK, .08, SX*CORE, SZ*CORE);
      octSlab(M.lux, P, fy - .12, SX*WALK, SZ*WALK, .12, SX*(WALK - .04), SZ*(WALK - .04));   // the white slab edge
      for (const e of rail){
        const F = under(P, T(e.mx, 0, e.mz, e.ry));
        box(M.goldLit, F, 0, fy - .1, .01, e.len, .05, .03);                     // a gold line under the edge, lit at night
        box(M.mallGlass, F, 0, fy + .26, -.03, e.len, .34, .02);                 // glass balustrade
        box(M.gold, F, 0, fy + .44, -.03, e.len, .03, .04);                      // gold handrail
        for (let t = -e.len/2 + .4; t < e.len/2 - .2; t += .8) glow(F, t, fy - .14, .1, 'warm', .45);   // downlights
      }
      // slim gold columns carry the walkway down to the floor below
      for (const [vx, vz] of octVerts(SX*(WALK - .03), SZ*(WALK - .03))) cyl(M.gold, P, vx, fy - MALL_FLOOR/2, vz, .04, MALL_FLOOR);
    }
    for (const e of outer){                                                       // gold floor line on the glass
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(tierStart ? M.goldLit : M.gold, F, 0, fy + .04, .02, e.len, tierStart ? .1 : .06, .05);
    }
    // the core, lined with boutiques of different widths: glass fronts with a lit interior behind, a neon sign
    // over each, and a sliver of shelving and goods. (One-off landmark, so it can afford the extra detail.)
    octSlab(M.lux2, P, fy + .08, SX*CORE, SZ*CORE, MALL_FLOOR - .08);
    for (const e of core){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      let x = -e.len/2 + .05;
      while (x < e.len/2 - .4){
        let w = Math.min(rnd(.6, 1.7), e.len/2 - .05 - x); if (e.len/2 - .05 - (x + w) < .45) w = e.len/2 - .05 - x;
        const cx = x + w/2, shop = pick([M.shop1, M.shop1, M.shop2, M.shop3]), tall = chance(.35);
        const sh = tall ? 1.0 : .85;   // signs above must stay under the ceiling, or they poke up through the floor above (and the pool)
        box(shop, F, cx, fy + .08 + sh/2, -.08, w - .12, sh, .04);                              // the lit back wall
        box(M.lux, F, cx, fy + .1, .02, w - .1, .04, .2);                                       // threshold
        for (let s2 = cx - (w - .3)/2; s2 <= cx + (w - .3)/2 + .01; s2 += Math.max(.25, (w - .3)/Math.max(1, Math.round(w/.4)))){
          const r = R();
          if (r < .4) box(pick([M.gold, M.lux, M.concDD]), F, s2, fy + .4, -.03, .14, .5, .06);    // shelving
          else if (r < .7){ box(M.lux, F, s2, fy + .18, .06, .16, .2, .12); box(pick([M.cloth1, M.cloth3, M.cloth4, M.awn2, M.gold]), F, s2, fy + .33, .06, .06, .1, .06); }   // a display plinth
          else box(pick([M.cloth1, M.cloth3, M.cloth4, M.awn1, M.awn2]), F, s2, fy + .34, -.02, .1, .44, .05);   // a mannequin / hanging rail
        }
        box(M.goldLit, F, cx, fy + .09 + sh, .1, w - .06, .05, .04);                            // gold lintel
        // the sign: a neon tube outline or a lit glyph sign above the door
        if (chance(.55)){
          const nm = pick([M.neonPink, M.neonCyan, M.neonAmber, M4.neonPurple]), nw = Math.min(w - .2, rnd(.35, .8));
          box(nm, F, cx, fy + .18 + sh, .13, nw, .03, .03); box(nm, F, cx, fy + .34 + sh, .13, nw, .03, .03);
          box(nm, F, cx - nw/2, fy + .26 + sh, .13, .03, .19, .03); box(nm, F, cx + nw/2, fy + .26 + sh, .13, .03, .19, .03);
          for (let q = cx - nw/2 + .08; q < cx + nw/2 - .05; q += .09) box(nm, F, q, fy + .26 + sh + rnd(-.04, .04), .13, .025, rnd(.05, .1), .02);   // lettering, implied
          glow(F, cx, fy + .26 + sh, .3, NEON_NAME.get(nm) || 'pink', .9);
        } else {
          const kind = pick(GLYPH_H); plant(kind, F, cx, fy + .26 + sh, .13, .7, 'c', true); glow(F, cx, fy + .26 + sh, .3, GLYPH_GLOW[kind], .8);
        }
        box(M.lux, F, x + w, fy + .7, .1, .08, 1.28, .14);                                      // white pilaster
        x += w;
      }
      box(M.lux, F, -e.len/2 + .05, fy + .7, .1, .08, 1.28, .14);
    }
    // the concourse: futuristic luxury furnishings (no two neighbours alike), shoppers, pendant lights
    const FURN = [
      (F, t) => { put(U.cyl16, M.lux, under(F, T(t, fy + .14, 0, 0, .7, .1, .36))); put(U.cyl16, M.gold, under(F, T(t, fy + .1, 0, 0, .5, .02, .26))); glow(F, t, fy + .1, 0, 'warm', .5); },   // a floating oval bench, lit underneath
      (F, t) => { cyl(M.gold, F, t, fy + .14, 0, .03, .12); put(U.torus, M.goldLit, under(F, T(t, fy + .55, 0, 0, .55, .55, .55, PI/2))); put(U.sph, M.lux, under(F, T(t, fy + .55, 0, 0, .16, .16, .16))); },   // gold ring sculpture round a white orb
      (F, t) => { put(U.cyl16, M.lux, under(F, T(t, fy + .12, 0, 0, .5, .1, .5))); put(U.cyl16, M.mallPool, under(F, T(t, fy + .18, 0, 0, .42, .02, .42))); cyl(M.gold, F, t, fy + .3, 0, .02, .24); glow(F, t, fy + .3, 0, 'cyan', .7); },   // a round fountain
      (F, t) => { box(M.lux, F, t, fy + .2, 0, .14, .24, .14); box(M.mallGlass, F, t, fy + .5, 0, .2, .36, .2); box(pick([M.gold, M.cloth1, M.cloth3]), F, t, fy + .45, 0, .07, .1, .07); glow(F, t, fy + .5, 0, 'warm', .5); },   // a glass vitrine on a pedestal
      (F, t) => { cyl(M.gold, F, t, fy + .25, 0, .02, .3); box(M.concDD, F, t, fy + .42, 0, .3, .2, .03); box(M.interiorCool, F, t, fy + .42, .02, .26, .16, .01); glow(F, t, fy + .42, .1, 'cyan', .45); },   // a directory screen
      (F, t) => { for (const o of [-.22, .22]){ box(M.lux, F, t + o, fy + .14, 0, .34, .1, .3); box(M.lux, F, t + o, fy + .24, -.13, .34, .18, .05); box(M.gold, F, t + o, fy + .1, 0, .3, .02, .26); } put(U.cyl16, M.gold, under(F, T(t, fy + .16, .25, 0, .2, .02, .2))); },   // a lounge pair round a gold side table
      (F, t) => { box(M.lux, F, t, fy + .16, 0, .34, .16, .34); box(M.gold, F, t, fy + .245, 0, .36, .02, .36); plant(pick(['bonsai','bushFlower','bush']), F, t, fy + .25, 0, rnd(.65, .85)); },   // planter (low plants only: tall bamboo poked up through the ceiling into the floor above and the pool)
    ];
    for (const e of (f === 0 ? mid : walk)){
      if (e.len < 1.2) continue;   // corner cuts are too short to furnish
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      let last = -1;
      for (let t = -e.len/2 + .55; t < e.len/2 - .4; t += rnd(.85, 1.3)){
        let k = Math.floor(R()*FURN.length); if (k === last) k = (k + 1) % FURN.length; last = k;
        FURN[k](F, t);
        if (chance(.7)){ const sx = t + rnd(-.35, .35), sz = f === 0 ? rnd(-.38, .38) : rnd(-.2, .2);                  // a shopper or two
          box(pick([M.frame, M.metalDark, M.concDD, M.awn1, M.cloth3, M.white2]), F, sx, fy + .19, sz, .07, .2, .05); box(M.concDD, F, sx, fy + .32, sz, .05, .05, .05); }
        if (chance(.6)){ cyl(M.gold, F, t + .4, fy + MALL_FLOOR - .14, 0, .006, .2); put(U.sph, M.bulb, under(F, T(t + .4, fy + MALL_FLOOR - .27, 0, 0, .09, .09, .09))); glow(F, t + .4, fy + MALL_FLOOR - .27, 0, 'warm', .55); }   // pendant
      }
    }
    if (f === 0) for (const k of [(escSide + 2) % 8, (escSide + 6) % 8]){
      const e = voidMid[k], F = under(P, T(e.mx, 0, e.mz, e.ry));
      put(U.cyl16, M.lux, under(F, T(0, fy + .14, 0, 0, 1.2, .12, .7))); put(U.cyl16, M.mallPool, under(F, T(0, fy + .2, 0, 0, 1.05, .02, .58)));
      for (const o of [-.25, 0, .25]) cyl(M.gold, F, o, fy + .4, 0, .015, .4); glow(F, 0, fy + .45, 0, 'cyan', .8);
      plant('bamboo', F, -.75, fy + .1, 0, .65); plant('bamboo', F, .75, fy + .1, 0, .6);   // kept below the walkway above
    }
    // the glass itself: one sheet per side, framed in gold only at the corners, with the odd streak of reflection
    for (const e of outer){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(M.mallGlass, F, 0, fy + MALL_FLOOR/2 + .04, .03, e.len - .1, MALL_FLOOR - .08, .02);
      if (chance(.6)){ const gx = rnd(-e.len/2 + .6, e.len/2 - .6); box(M.mallGlint, F, gx, fy + MALL_FLOOR/2, .045, .05, MALL_FLOOR*.8, .01, 0, 0, .5); box(M.mallGlint, F, gx + .18, fy + MALL_FLOOR/2, .045, .025, MALL_FLOOR*.6, .01, 0, 0, .5); }
    }
    for (const [vx, vz] of octVerts(SX, SZ)) box(tierStart ? M.goldLit : M.gold, P, vx, fy + MALL_FLOOR/2, vz, .09, MALL_FLOOR, .09);
  }
  const roof = base + floors*MALL_FLOOR;

  // ---- the roof: a pool over most of it, a marble walk round it, and a white canopy along every edge
  octSlab(M.lux, P, roof, SX*1.03, SZ*1.03, .14);
  for (const e of octEdges(SX*1.03, SZ*1.03)) box(M.goldLit, under(P, T(e.mx, 0, e.mz, e.ry)), 0, roof + .1, .01, e.len, .06, .04);
  octSlab(M.marbleOut, P, roof + .14, SX*.98, SZ*.98, .03);
  octSlab(M.gold, P, roof + .17, SX*.75, SZ*.75, .04, SX*.72, SZ*.72);          // gold coping round the pool (a ring, so nothing shows through the water)
  // The water: a flat sheet level with the walk. Its normals lean slightly, so the wet-ground reflection pass
  // (which only treats surfaces facing straight up) leaves it alone; otherwise the posts and bamboo round the
  // pool smeared into it as dark streaks, like something under the water.
  { const shape = new THREE.Shape(); octVerts(SX*.72, SZ*.72).forEach(([x, z], k) => k ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-PI/2);
    const n = g.attributes.normal; for (let k=0; k<n.count; k++) n.setXYZ(k, 0, .84, .54);
    put(g, M.mallPool, under(P, T(0, roof + .19, 0))); g.dispose(); }
  for (const e of octEdges(SX*.87, SZ*.87)){
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
  for (const [vx, vz] of octVerts(SX*.92, SZ*.92)) plant('bamboo', P, vx, roof + .17, vz, rnd(.9, 1.1));

  // ---- the sign: a white pylon at the front of the court with the MALL panel framed in gold
  const Fs = under(Pc, T(-L/2 + .7, 0, D/2 - .55, 0));
  box(M.lux, Fs, 0, 1.25, 0, .62, 2.5, .2); box(M.gold, Fs, 0, 2.52, 0, .66, .06, .24); box(M.gold, Fs, 0, .03, 0, .7, .06, .28);
  plant('sign_mall', Fs, 0, 1.4, .11, 1.0, 'c', true); glow(Fs, 0, 1.4, .35, 'amber', 2.0);

  m.roofH = roof + .17;
  m.top = roof + 1.4;
}

/* ---------- the town square ---------- */
// A 5x5 open plaza for the neighbourhoods. In the middle, a holographic koi pond: a round, dark pool ringed in
// stone and cyan neon, with lily pads and lotus lights, where koi made of light circle and flicker. Lantern strings
// cross over it between poles round the square. Round the pond, a busy night market: food carts of three kinds
// (menu-tower bike carts, hawker stalls, little food trucks), all piled with food; long market stands with trays
// of food laid out under tarps, like a street market; tables, queues and crowds, steam rising off the woks.
M.lantern = toon(0x7a2a1a, { em:0xff8a3a, kind:'bulb' }); M.lantern2 = toon(0x7a5a1a, { em:0xffc04a, kind:'bulb' });
M.screen = toon(0x10202a, { em:0x4fd8ff, kind:'neon' }); M.screen2 = toon(0x1a1030, { em:0xc070ff, kind:'neon' });
M.tarp1 = toon(0x3f6f7a); M.tarp2 = toon(0x7a4a5a); M.tarp3 = toon(0x6a6a52);
// food: warm, saturated colours that read as food even at a few pixels (lit a little so they glow under the lamps)
const FOOD = [toon(0xe08a2a, { em:0x3a1e06, kind:'window' }), toon(0xf2c04a, { em:0x3a2a06, kind:'window' }), toon(0xc8402a, { em:0x30100a, kind:'window' }),
              toon(0x8fb03a, { em:0x1a2a06, kind:'window' }), toon(0xb8743a, { em:0x2a1608, kind:'window' }), toon(0xf4e2c0, { em:0x3a3020, kind:'window' }),
              toon(0xff8aa0, { em:0x3a141a, kind:'window' })];
const food = () => pick(FOOD);
M.koiWater = toon(0x1c5868, { em:0x0b3442, kind:'trim' });   // deep teal, dark enough for the glowing koi to read
// a tray heaped with food
function foodTray(P, x, y, z, w = .26, d = .18){
  box(pick([M.metal, M.white2, M.wood]), P, x, y + .01, z, w, .02, d);
  const f = food(), n = 3 + Math.floor(R()*4);
  for (let k=0; k<n; k++) put(U.sph, chance(.7) ? f : food(), under(P, T(x + rnd(-w*.35, w*.35), y + .04, z + rnd(-d*.3, d*.3), 0, rnd(.05, .09), rnd(.035, .06), rnd(.05, .09))));
}
// a bowl with a mound of noodles or rice
function foodBowl(P, x, y, z, r = .07){ put(U.cyl16, pick([M.white2, M.awn3, M.pot, M.corrBlue]), under(P, T(x, y + .025, z, 0, 2*r, .05, 2*r))); put(U.sph, food(), under(P, T(x, y + .05, z, 0, 1.6*r, .7*r, 1.6*r))); }
// skewers standing in a rack
function skewers(P, x, y, z){ box(M.wood, P, x, y + .02, z, .18, .04, .08); for (let k=0; k<5; k++){ const sx = x - .07 + k*.035; cyl(M.wood, P, sx, y + .12, z, .004, .2); for (let q=0; q<3; q++) box(food(), P, sx, y + .1 + q*.035, z, .028, .028, .028); } }
// a pot on a burner, steaming
function steamPot(P, x, y, z){ put(U.cyl16, M.metalDark, under(P, T(x, y + .03, z, 0, .2, .06, .2))); put(U.cyl16, M.metal, under(P, T(x, y + .12, z, 0, .18, .14, .18))); put(U.cyl16, food(), under(P, T(x, y + .19, z, 0, .15, .01, .15))); emitters.push(new THREE.Vector3(x, y + .22, z).applyMatrix4(P)); }
// hanging food: sausages, roast ducks, lanterns of buns
function hangingFood(P, x, y, z){ for (let k=0; k<4; k++){ const hx = x + (k - 1.5)*.07; cyl(M.frame, P, hx, y - .04, z, .003, .08); box(pick([FOOD[0], FOOD[4], FOOD[2]]), P, hx, y - .14, z, .045, .12, .04); } }
// lights near the pond, collected while the square is generated, for the water to reflect: [x, y, z, r, g, b]
let reflectLights = null;
const _rl = new THREE.Vector3();
function noteLight(P, x, y, z, hex){ if (!reflectLights) return; _rl.set(x, y, z).applyMatrix4(P); const c = new THREE.Color(hex); reflectLights.push([_rl.x, _rl.y, _rl.z, c.r, c.g, c.b]); }
function lanternString(P, ax, ay, az, bx, by, bz, sag){
  const n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az)/.55));
  let px = ax, py = ay, pz = az;
  for (let k=1; k<=n; k++){
    const t = k/n, x = ax + (bx - ax)*t, z = az + (bz - az)*t, y = ay + (by - ay)*t - sag*Math.sin(PI*t);
    strut(M.frame, P, px, py, pz, x, y, z, .012);
    if (k < n){ box(chance(.5) ? M.lantern : M.lantern2, P, x, y - .1, z, .1, .14, .1); if (k % 2) glow(P, x, y - .1, z, chance(.6) ? 'amber' : 'warm', .55); if (k % 2) noteLight(P, x, y - .1, z, 0xffa040); }
    px = x; py = y; pz = z;
  }
}
function person(P, x, y, z){ const c = pick([M.frame, M.metalDark, M.concDD, M.awn1, M.cloth3, M.white2, M.awn2, M.red2, M.cloth1, M.cloth4]); box(c, P, x, y + .11, z, .08, .22, .06); box(M.concDD, P, x, y + .26, z, .055, .06, .055); }
// cart 1: a tall bike cart with a stack of glowing menu boards (menu-tower reference), its counter full of food
function menuCart(P, neon){
  box(M.metalDark, P, 0, .42, 0, .9, .32, .45);
  for (const s of [-1, 1]) for (let k=0; k<2; k++){ const F = under(P, T(0, 0, s*.226, s > 0 ? 0 : PI)); box(neon, F, -.22 + k*.44, .42, 0, .3, .02, .01); box(neon, F, -.22 + k*.44, .42, 0, .02, .24, .01); box(neon, F, -.22 + k*.44 - .1, .45, 0, .02, .14, .01, 0, 0, .7); }
  box(M.metal, P, 0, .6, 0, .94, .04, .5);
  for (const s of [-1, 1]) for (const z of [.25, -.25]) put(U.torus, M.frame, under(P, T(.25*s, .2, z, 0, .4, .4, .4, PI/2)));
  for (const [x, z] of [[-.42,-.2],[.42,-.2],[-.42,.2],[.42,.2]]) cyl(M.frame, P, x, .9, z, .015, .6);
  box(M.metalDark, P, 0, 1.22, 0, 1.1, .05, .62); box(neon, P, 0, 1.2, .31, 1.1, .03, .02); box(neon, P, 0, 1.2, -.31, 1.1, .03, .02);
  box(M.metalDark, P, 0, 1.52, -.05, .8, .55, .4); box(M.screen, P, 0, 1.55, .16, .7, .4, .02); box(M.screen2, P, 0, 1.55, -.26, .7, .4, .02);
  box(M.metalDark, P, .05, 1.98, -.05, .55, .38, .32); box(M.screen2, P, .05, 2.0, .12, .46, .28, .02); box(neon, P, .05, 2.19, -.05, .6, .03, .36);
  glow(P, 0, 1.55, .3, neon === M.neonPink ? 'pink' : 'cyan', 1.2); glow(P, 0, 1.1, .2, 'warm', 1.0);
  // the food: trays on the counter, a steaming pot, skewers, buns hanging under the canopy
  foodTray(P, -.3, .62, .1); foodTray(P, 0, .62, .12); steamPot(P, .3, .62, -.05); skewers(P, .32, .62, .17);
  for (let k=0; k<3; k++) foodBowl(P, -.36 + k*.18, .62, -.14);
  hangingFood(P, -.25, 1.2, .25);
}
// cart 2: an open hawker stall under a sagging tarp
function hawkerStall(P){
  box(M.metal, P, 0, .5, 0, 1.3, .06, .6); box(M.metalDark, P, 0, .28, 0, 1.24, .4, .54);
  for (let k=0; k<5; k++) foodTray(P, -.5 + k*.2, .53, .15, .17, .2);                       // a front row of trays
  for (let k=0; k<4; k++) foodBowl(P, -.45 + k*.2, .53, -.08, .075);
  steamPot(P, .45, .53, -.15); steamPot(P, .2, .53, -.2);
  for (const [x, z] of [[-.66,-.32],[.66,-.32],[-.66,.4],[.66,.4]]) cyl(M.frame, P, x, .7, z, .015, 1.4 + (z > 0 ? -.2 : 0));
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, 0, 1.33, .04, 1.5, .03, .9, 0, -.2);
  hangingFood(P, -.3, 1.2, .3); hangingFood(P, .15, 1.22, .3);
  for (const x of [-.35, .35]){ cyl(M.frame, P, x, 1.2, 0, .006, .14); put(U.cone, M.metalDark, under(P, T(x, 1.08, 0, 0, .18, .1, .18))); box(M.bulb, P, x, 1.02, 0, .06, .04, .06); glow(P, x, 1.0, 0, 'warm', 1.0); }
  box(M.metalDark, P, -.68, .65, -.1, .04, .3, .3); box(pick([M.screen, M.screen2]), P, -.7, .7, -.1, .01, .2, .24);
  for (let k=0; k<3; k++){ const x = rnd(-.5, .5); cyl(pick([M.red2, M.awn2, M.white2]), P, x, .16, .55, .08, .3); }
  for (let k=0; k<3; k++) put(U.cyl16, pick([M.awn1, M.corrBlue, M.white2]), under(P, T(rnd(-.6, .6), .12, rnd(-.45, -.3), 0, .18, .24, .18)));
}
// cart 3: a little food truck, hatch open, food stacked on the counter and a menu board out front
function foodTruck(P, neon){
  const body = pick([M.corrBlue, M.metalDark, M.teal2, M.concDD]);
  box(body, P, 0, .5, 0, 1.5, .7, .7); box(body, P, .9, .4, 0, .4, .5, .66);
  box(M.glassDark, P, 1.08, .55, 0, .04, .22, .56);
  box(M.winLit, P, -.15, .58, .352, .95, .38, .01);                                    // the open hatch, warm-lit inside
  for (let k=0; k<5; k++) box(food(), P, -.5 + k*.17, .52, .34, .1, .12, .04);          // food on shelves inside
  box(M.metal, P, -.15, .4, .42, 1.0, .03, .16);                                        // counter
  for (let k=0; k<4; k++) foodTray(P, -.5 + k*.24, .41, .43, .2, .13);
  box(body, P, -.15, .86, .5, 1.0, .03, .32, 0, -.5);
  box(neon, P, 0, .16, .352, 1.4, .03, .01); box(neon, P, 0, .16, -.352, 1.4, .03, .01);
  glow(P, 0, .12, .45, NEON_NAME.get(neon) || 'pink', 1.0); glow(P, -.15, .58, .5, 'warm', .9);
  for (const [x, z] of [[-.45,.36],[.45,.36],[-.45,-.36],[.85,-.34],[.85,.34]]) put(U.cyl16, M.frame, under(P, T(x, .12, z, 0, .24, .06, .24, PI/2)));
  box(M.metalDark, P, -.1, .98, 0, 1.0, .3, .06); const kind = pick(GLYPH_H);
  plant(kind, under(P, T(-.1, 0, .04)), 0, .98, 0, .85, 'c', true); glow(P, -.1, .98, .3, GLYPH_GLOW[kind], 1.0);
  box(M.frame, P, .5, .3, .75, .04, .6, .04, 0, -.2); box(M.screen, P, .5, .5, .76, .3, .34, .02, 0, -.2);   // A-board menu out front
  emitters.push(new THREE.Vector3(.3, .9, 0).applyMatrix4(P));
}
// a market stand: a long table of food laid out under tarps (street-market reference)
function marketStand(P){
  const L = 2.6;
  box(M.metal, P, 0, .48, .1, L, .05, .7); box(M.metalDark, P, 0, .25, .1, L - .1, .42, .62);   // front table
  for (let a=0; a<8; a++) for (let b=0; b<2; b++) foodTray(P, -L/2 + .2 + a*.31, .5, -.1 + b*.26, .26, .2);
  box(M.wood, P, 0, .75, -.42, L, .04, .3); box(M.wood, P, 0, .4, -.42, .05, .7, .3);        // raised back shelf
  for (let k=0; k<10; k++) chance(.5) ? foodBowl(P, -L/2 + .15 + k*.26, .77, -.42, .08) : box(pick([M.pot, M.awn3, M.white2, M.veg2]), P, -L/2 + .15 + k*.26, .84, -.42, .1, .14, .1);   // jars and bowls
  steamPot(P, L/2 + .25, .45, 0); box(M.metal, P, L/2 + .25, .22, 0, .4, .44, .4);         // side table with a pot
  for (const [x, z, h] of [[-L/2,-.6,1.7],[L/2,-.6,1.7],[-L/2,.5,1.45],[L/2,.5,1.45],[0,-.6,1.7]]) cyl(M.frame, P, x, h/2, z, .02, h);
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, -L*.25, 1.62, -.05, L*.55, .03, 1.3, 0, -.18);   // two tarps at different heights
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, L*.25, 1.55, -.05, L*.55, .03, 1.2, 0, -.15);
  for (const x of [-L*.35, 0, L*.35]){ cyl(M.frame, P, x, 1.42, 0, .006, .2); put(U.cone, M.metalDark, under(P, T(x, 1.28, 0, 0, .2, .1, .2))); box(M.bulb, P, x, 1.22, 0, .06, .04, .06); glow(P, x, 1.2, .05, 'warm', 1.1); }
  for (let t = -L/2; t < L/2; t += .25){ box(M.bulb, P, t, 1.5, .55, .04, .04, .04); if (chance(.4)) glow(P, t, 1.48, .55, 'warm', .4); }   // a string of small bulbs
  hangingFood(P, -L*.2, 1.5, .4); hangingFood(P, L*.3, 1.45, .4);
  for (let k=0; k<3; k++) person(P, rnd(-L/2 + .3, L/2 - .3), 0, -.75);                     // vendors behind
  for (let k=0; k<5; k++) person(P, rnd(-L/2, L/2), 0, rnd(.6, 1.1));                       // shoppers in front
  for (let k=0; k<6; k++){ const x = rnd(-L/2 - .3, L/2 + .3); box(pick([M.crate, M.awn1, M.corrBlue, M.white2, M.red2]), P, x, .12, rnd(-1.0, -.8), .26, .24, .22); }   // crates and tubs
  for (let k=0; k<4; k++) put(U.cyl16, pick([M.awn1, M.corrBlue, M.white2]), under(P, T(rnd(-L/2, L/2), .1, .55, 0, .2, .2, .2)));
  const neon = pick([M.neonPink, M.neonCyan, M.neonAmber]);
  box(M.metalDark, P, 0, 1.85, -.6, 1.1, .26, .04); box(neon, P, 0, 1.85, -.57, .95, .03, .02); box(neon, P, 0, 1.93, -.57, .6, .03, .02); glow(P, 0, 1.88, -.4, NEON_NAME.get(neon), 1.1);   // sign
}
function cafeTable(P, x, z){
  const Q = under(P, T(x, 0, z, rnd(0, TAU)));
  put(U.cyl16, M.white2, under(Q, T(0, .3, 0, 0, .44, .03, .44))); cyl(M.frame, Q, 0, .15, 0, .02, .3);
  for (let k=0; k<2; k++) foodBowl(Q, rnd(-.1, .1), .31, rnd(-.1, .1), .05);
  for (let k=0; k<3; k++){ const a = k*TAU/3; cyl(pick([M.red2, M.awn2, M.white2]), Q, Math.cos(a)*.34, .1, Math.sin(a)*.34, .06, .2); if (chance(.75)) person(Q, Math.cos(a)*.34, .06, Math.sin(a)*.34); }
  if (chance(.6)){ cyl(M.frame, Q, 0, .6, 0, .012, .6); put(U.cone, pick([M.awn1, M.awn2, M.awn3, M.tarp1]), under(Q, T(0, .98, 0, 0, .8, .2, .8))); }
  else { box(M.bulb, Q, 0, .34, 0, .05, .06, .05); glow(Q, 0, .38, 0, 'warm', .5); }
}
// flat water whose normals lean a little, so the wet-ground reflection pass leaves it alone (see the mall pool)
function flatWater(mat, P, y, r){
  const g = new THREE.CircleGeometry(r, 28); g.rotateX(-PI/2);
  const n = g.attributes.normal; for (let k=0; k<n.count; k++) n.setXYZ(k, 0, .84, .54);
  put(g, mat, under(P, T(0, y, 0))); g.dispose();
}
const POND_R = 2.5, POND_Y = .2;
function buildTownSquare(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), S5 = 5*LOT, H = S5/2;
  reflectLights = [];
  box(G.asph, P, 0, .012, 0, S5, .025, S5);
  const n = 25, st = S5/n;
  for (let a=0;a<n;a++) for (let b=0;b<n;b++){
    const x = (a-(n-1)/2)*st, z = (b-(n-1)/2)*st, r = Math.hypot(x, z);
    if (r < POND_R + .5) continue;
    const ring = Math.floor(r/1.5) % 2, mat = ring ? TILES.mid[(a + b) % 2] : TILES.low[(a*3 + b) % 4];
    if (!chance(.02)) box(mat, P, x, .03, z, st - .04, .045, st - .04);
  }
  for (const r of [POND_R + 1.4, 6.6]) for (let k=0; k<48; k++){ const a = k*TAU/48; box(M.concL, P, Math.cos(a)*r, .058, Math.sin(a)*r, .5, .012, .08, -a + PI/2); }
  // ---- the koi pond
  put(U.cyl16, M.concM, under(P, T(0, .12, 0, 0, 2*POND_R + .7, .2, 2*POND_R + .7)));        // stone rim
  put(U.cyl16, M.concD, under(P, T(0, .225, 0, 0, 2*POND_R + .8, .04, 2*POND_R + .8)));
  put(U.cyl16, M.neonCyan, under(P, T(0, .16, 0, 0, 2*POND_R + .74, .03, 2*POND_R + .74)));  // neon band round the rim
  put(U.cyl16, M.wood, under(P, T(0, .1, 0, 0, 2*POND_R + 1.5, .05, 2*POND_R + 1.5)));       // ring bench
  flatWater(M.koiWater, P, POND_Y, POND_R + .05);
  // the koi themselves are an animated sprite sheet laid on the water (see koiFx)
  for (let k=0; k<4; k++){ const a = k*TAU/4 + PI/4, r = POND_R + .45;                        // hologram projectors on the rim
    const Q = under(P, T(Math.cos(a)*r, .25, Math.sin(a)*r, -a));
    box(M.metalDark, Q, 0, .15, 0, .18, .3, .18); box(M.screen, Q, 0, .32, 0, .12, .04, .12); glow(Q, 0, .34, 0, 'cyan', .7); noteLight(Q, 0, .34, 0, 0x4fd8ff); }
  for (let k=0; k<6; k++){ const a = rnd(0, TAU), r = POND_R + .55; plant(pick(['bush','bushFlower','g_fern2']), P, Math.cos(a)*r, .25, Math.sin(a)*r, .7); }
  // ---- lantern poles round the square, strung across the pond and between each other
  const poles = [];
  for (let k=0; k<8; k++){ const a = k*TAU/8 + PI/8, r = 7.9; poles.push([Math.cos(a)*r, Math.sin(a)*r]); }
  for (const [x, z] of poles){ cyl(M.metalDark, P, x, 1.6, z, .05, 3.2); box(M.lantern2, P, x, 3.26, z, .14, .14, .14); glow(P, x, 3.26, z, 'warm', 1.0); noteLight(P, x, 3.26, z, 0xffcf7a); }
  for (let k=0; k<4; k++){ const [ax, az] = poles[k], [bx, bz] = poles[k + 4]; lanternString(P, ax, 3.1, az, bx, 3.1, bz, .9); }
  for (let k=0; k<8; k++){ const [ax, az] = poles[k], [bx, bz] = poles[(k+1)%8]; lanternString(P, ax, 3.0, az, bx, 3.0, bz, .4); }
  // ---- market stands along the four sides, between the poles, facing in
  for (let k=0; k<4; k++){ const a = k*PI/2, r = 7.75; marketStand(under(P, T(Math.cos(a)*r, .05, Math.sin(a)*r, -a - PI/2))); }
  // ---- carts in a ring round the pond, bigger than life so the food reads
  const carts = [], CS = 1.45;
  for (let k=0; k<10; k++){ const a = k*TAU/10 + PI/10 + rnd(-.08, .08), r = 5.0 + (k % 2)*.5; carts.push([Math.cos(a)*r, Math.sin(a)*r, a]); }
  carts.forEach(([x, z, a], k) => {
    const Q = under(P, T(x, .05, z, -a - PI/2 + rnd(-.15, .15))), Qs = under(Q, T(0, 0, 0, 0, CS, CS, CS));
    const r = k % 3;
    if (r === 0) menuCart(Qs, pick([M.neonPink, M.neonCyan, M4.neonPurple]));
    else if (r === 1) hawkerStall(Qs);
    else foodTruck(Qs, pick([M.neonPink, M.neonCyan, M.neonAmber]));
    for (let q=0; q<irand(2, 5); q++) person(Q, rnd(-.7, .7), 0, rnd(.9, 1.6));             // a queue
  });
  for (let k=0; k<24; k++){
    const a = rnd(0, TAU), r = rnd(3.6, 7.0), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if (carts.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.6)) continue;
    if (Math.abs(Math.abs(x) - 7.75) < 1.4 && Math.abs(z) < 2) continue; if (Math.abs(Math.abs(z) - 7.75) < 1.4 && Math.abs(x) < 2) continue;
    cafeTable(P, x, z);
  }
  for (let k=0; k<70; k++){ const a = rnd(0, TAU), r = rnd(POND_R + .9, 9); const x = Math.cos(a)*r, z = Math.sin(a)*r;   // the crowd, some in little groups
    person(P, x, .05, z); if (chance(.4)) person(P, x + rnd(-.15, .15), .05, z + rnd(.1, .18)); }
  for (const [sx, sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const Q = under(P, T(sx*(H - .7), 0, sz*(H - .7)));
    box(M.concM, Q, 0, .2, 0, .9, .4, .9); plant(pick(['bonsai','bamboo']), Q, 0, .4, 0, 1.2); plant('bushFlower', Q, .25, .4, .25, .8);
  }
  // keep the lights nearest the pond (the shader handles up to 16)
  const near = reflectLights.map(l => [Math.hypot(l[0] - m.x, l[2] - m.z), l]).filter(([d]) => d < POND_R + 4).sort((a, b) => a[0] - b[0]).slice(0, 16).map(([, l]) => l);
  reflectLights = null;
  m.pond = { x: m.x, z: m.z, y: POND_Y + .06, r: POND_R, lights: near };
  m.roofH = CURB + .1;
  m.top = 5;
}
// The holographic koi: a 10-frame neon line-art sheet (assets/sprites/koi_neon.png, 100x139 per frame) projected
// onto the pond. The frames don't flow smoothly into each other, so the projection is made to look faulty on purpose:
// each frame holds for a beat, and every change comes through a glitch (rows tearing sideways, colour channels
// splitting, half the image showing the previous frame, a flicker), with smaller stray glitches in between and
// faint scanlines all the time. Everything snaps to whole sprite pixels so it stays pixel art.
const KOI_FRAMES = 10, KOI_W = 100, KOI_H = 139;
let koiTex = null;
const _kd = new THREE.Vector3();
const KOI_SHADER = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform float frame, prevFrame, glitch, seed, time;
    varying vec2 vUv;
    const float NF = ${KOI_FRAMES}.0; const vec2 SZ = vec2(${KOI_W}.0, ${KOI_H}.0);
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
    vec4 tap(vec2 uv, float f){
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
      uv = (floor(uv*SZ) + .5)/SZ;
      return texture2D(map, vec2((f + uv.x)/NF, uv.y));
    }
    void main(){
      vec2 uv = vUv;
      float row = floor(uv.y*SZ.y), band = floor(uv.y*18.0), g = glitch;
      float hb = h(vec2(band, seed));
      // rows tearing sideways in bands, by whole pixels
      if (hb < g*.6) uv.x += floor((h(vec2(band, seed + 7.0)) - .5)*g*22.0)/SZ.x;
      // some bands still show the previous frame
      float f = (h(vec2(band, seed + 3.0)) < g*.45) ? prevFrame : frame;
      // colour channels split apart
      float dx = floor(g*3.0 + .5)/SZ.x;
      vec4 c = tap(uv, f), cr = tap(uv + vec2(dx, 0.0), f), cb = tap(uv - vec2(dx, 0.0), f);
      float a = max(c.a, max(cr.a, cb.a));
      if (a < .5) discard;
      vec3 col = vec3(cr.a > .5 ? cr.r : c.r*.4, c.a > .5 ? c.g : .0, cb.a > .5 ? cb.b : c.b*.4);
      if (c.a < .5) col *= .8;
      col *= 1.0 - .22*mod(row, 2.0);                           // scanlines
      col *= 1.0 - g*.55*step(.6, h(vec2(floor(time*40.0), seed)));   // flicker
      gl_FragColor = vec4(col*1.15, 1.0);
    }`,
};
function koiFx(m){
  if (!koiTex){
    koiTex = new THREE.TextureLoader().load('assets/sprites/koi_neon.png');
    koiTex.magFilter = koiTex.minFilter = THREE.NearestFilter; koiTex.generateMipmaps = false;
  }
  const p = m.pond;
  const u = { map: { value: koiTex }, frame: { value: 0 }, prevFrame: { value: 0 }, glitch: { value: 0 }, seed: { value: 0 }, time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: KOI_SHADER.vertexShader, fragmentShader: KOI_SHADER.fragmentShader });
  // sized so the whole frame, leaping koi included, sits inside the pond
  const ph = 2*p.r*.88, pw = ph*KOI_W/KOI_H, koiOff = 0;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
  plane.rotation.x = -PI/2; plane.position.set(p.x, p.y + .03, p.z - koiOff);
  plane.layers.set(1); plane.renderOrder = 3; scene.add(plane);
  // the water under the projection: deep blue, lighter toward the middle, with slow drifting shimmer bands and a
  // darker edge where it meets the stone, all in whole pond pixels
  // The water reflects the hologram and the lights round it, all inside its own shader (no extra render pass):
  // the koi's current frame is sampled a few times, blurred and rippled, so their colours spill into the water;
  // each nearby light is mirrored through the water surface on the CPU (cheap: a few dozen numbers a frame) and
  // drawn as a short wobbling streak of its own colour, stretched toward the viewer like a real reflection.
  const NL = 16, lightPos = [], lightCol = [];
  for (let k=0; k<NL; k++){ lightPos.push(new THREE.Vector3(0, 0, 0)); lightCol.push(new THREE.Vector3(0, 0, 0)); }
  const wu = { time: u.time, map: u.map, frame: u.frame, glitch: u.glitch, lp: { value: lightPos }, lc: { value: lightCol },
               streak: { value: new THREE.Vector2(0, 1) }, night: comp.uniforms.night,
               koiBox: { value: new THREE.Vector4(pw, ph, koiOff, 0) } };
  const wmat = new THREE.ShaderMaterial({ uniforms: wu,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, frame, glitch, night; uniform sampler2D map; uniform vec3 lp[${NL}], lc[${NL}]; uniform vec2 streak; uniform vec4 koiBox;
      varying vec2 vP;
      const float NF = ${KOI_FRAMES}.0; const vec2 SZ = vec2(${KOI_W}.0, ${KOI_H}.0);
      float koiA(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0; return texture2D(map, vec2((frame + uv.x)/NF, uv.y)).a; }
      vec3 koiC(vec2 uv){ uv = clamp(uv, 0.0, 1.0); vec4 t = texture2D(map, vec2((frame + uv.x)/NF, uv.y)); return t.rgb*t.a; }
      void main(){
        vec2 q = floor(vP*14.0)/14.0; float r = length(q)/${(POND_R + .05).toFixed(2)};
        vec3 deep = vec3(.05, .22, .40), mid = vec3(.10, .46, .68);
        vec3 col = mix(mid, deep, smoothstep(.15, 1.0, r));
        float s = sin(q.x*3.1 + time*.7) + sin(q.y*2.6 - time*.55) + sin((q.x + q.y)*2.2 + time*.4);
        col += vec3(.05, .12, .15)*step(1.9, s);
        // the hologram's light in the water: a soft, rippling halo of its colours
        vec2 kuv = vec2(q.x/koiBox.x + .5, (q.y - koiBox.z)/koiBox.y + .5);
        kuv.x += sin(q.y*9.0 + time*2.0)*.012;
        vec3 halo = vec3(0.0); float tex = 2.5/SZ.x;
        halo += koiC(kuv + vec2(tex, 0.0)) + koiC(kuv - vec2(tex, 0.0)) + koiC(kuv + vec2(0.0, tex)) + koiC(kuv - vec2(0.0, tex));
        col += halo*.22*(1.0 + glitch);
        // lights overhead, mirrored in the surface: short streaks stretched toward the viewer, wobbling with the ripples
        vec2 side = vec2(-streak.y, streak.x);
        for (int i=0; i<${NL}; i++){
          vec2 d = q - lp[i].xy; d.x += sin(q.y*12.0 + time*3.0 + float(i))*.04;
          float along = dot(d, streak), across = dot(d, side);
          float g = exp(-across*across*45.0)*exp(-along*along*1.1)*lp[i].z;
          g = floor(g*4.0 + .5)/4.0;                               // stepped, to stay pixel art
          col += lc[i]*g*(.35 + .65*night)*1.3;
        }
        col *= 1.0 - .45*smoothstep(.86, 1.0, r);
        gl_FragColor = vec4(col, 1.0);
      }` });
  const water = new THREE.Mesh(new THREE.CircleGeometry(p.r + .05, 40), wmat);
  water.rotation.x = -PI/2; water.position.set(p.x, p.y + .012, p.z);
  water.layers.set(1); water.renderOrder = 2; scene.add(water);
  let hold = 0, burst = 0, stray = 2 + Math.random()*3;
  return {
    update(dt, time){
      u.time.value = time;
      // mirror each light through the water: the reflection of a light h above the surface sits where the view ray
      // to the point h below it crosses the surface
      cam.getWorldDirection(_kd);
      const sy = Math.max(.05, -_kd.y);
      const L = p.lights || [];
      for (let k=0; k<16; k++){
        const l = L[k];
        if (!l){ wu.lp.value[k].set(0, 0, 0); continue; }
        const h = l[1] - (p.y + .012), sc = h/sy;
        const x = l[0] - _kd.x*sc - p.x, z = l[2] - _kd.z*sc - p.z;
        wu.lp.value[k].set(x, -z, h > 0 ? 1 : 0); wu.lc.value[k].set(l[3], l[4], l[5]);
      }
      const hl = Math.hypot(_kd.x, _kd.z) || 1;
      wu.streak.value.set(_kd.x/hl, -_kd.z/hl);
      hold -= dt; stray -= dt;
      if (hold <= 0){                                              // next frame, through a glitch
        u.prevFrame.value = u.frame.value;
        u.frame.value = (u.frame.value + 1) % KOI_FRAMES;
        hold = .28 + Math.random()*.32;
        burst = .16 + Math.random()*.1;
      }
      if (stray <= 0){ burst = Math.max(burst, .1 + Math.random()*.15); stray = 2 + Math.random()*4; }   // the odd glitch between changes
      burst = Math.max(0, burst - dt);
      u.glitch.value = burst > 0 ? Math.min(1, burst*6)*(.6 + .4*Math.random()) : 0;
      if (burst > 0 && Math.random() < .5) u.seed.value = Math.floor(Math.random()*997);   // the tear pattern jumps around while it glitches
    },
    dispose(){ scene.remove(plane, water); plane.geometry.dispose(); mat.dispose(); water.geometry.dispose(); wmat.dispose(); }
  };
}

/* ---------- the foundry ---------- */
// A tall, brooding steel works on a 6x4 block, after the reference: stacked slate-blue blocks clad in corrugated
// panels and stained with rust, a rounded-roof hall, a fat smokestack wrapped in scaffolding, a taller chimney, a
// tank tower ringed in light, and pipes looping over everything. The light is orange and comes from below the
// ledges (glowing strips tucked under each overhang), a vertical strip up the tall block, the loading dock and a
// few warm windows, with one cold blue tube for contrast. Steam rises off the stacks.
M.fSteel = toon(0x2e3846); M.fSteel2 = toon(0x3b4757); M.fSteel3 = toon(0x252d38); M.fRust = toon(0x5c3a28); M.fRib = toon(0x1f2630);
M.fGlow = toon(0x5a2a10, { em:0xd84a08, kind:'neon' }); M.fGlow2 = toon(0x5a3410, { em:0xe0640e, kind:'neon' });   // deep orange: the emissive boost at night pushes paler oranges to yellow
M.fBlue = toon(0x10283a, { em:0x7fd0ff, kind:'neon' });
M.fWin = toon(0x4a2e18, { em:0xff7a2a, kind:'window' });
// the four faces of a block centred at (cx, cz) of size w x d, each as a transform whose +z faces out
function blockFaces(P, cx, cz, w, d){
  return [[under(P, T(cx, 0, cz + d/2, 0)), w], [under(P, T(cx, 0, cz - d/2, PI)), w], [under(P, T(cx + w/2, 0, cz, PI/2)), d], [under(P, T(cx - w/2, 0, cz, -PI/2)), d]];
}
// a clad block: body, corrugated ribs, rust streaks, a ledge with a glowing strip tucked under it
function fBlock(P, cx, cz, w, d, y0, h, mat, opts = {}){
  box(mat, P, cx, y0 + h/2, cz, w, h, d);
  for (const [F, len] of blockFaces(P, cx, cz, w, d)){
    for (let t = -len/2 + .25; t < len/2 - .1; t += .32) box(M.fRib, F, t, y0 + h/2, .02, .05, h - .1, .04);    // corrugation
    for (let k=0; k<Math.round(len/2.2); k++) box(M.fRust, F, rnd(-len/2 + .3, len/2 - .3), y0 + rnd(.3, h*.6), .035, rnd(.12, .3), rnd(.5, 1.6), .02);   // rust streaks
    if (opts.windows) for (let y = y0 + .9; y < y0 + h - .5; y += 1.1) for (let t = -len/2 + .6; t < len/2 - .4; t += .9)
      if (chance(.55)) box(chance(.25) ? M.fWin : M.glassDark, F, t, y, .04, .3, .4, .03);
  }
  // the ledge on top, and the orange strip under it: the signature light of the reference
  box(M.fSteel3, P, cx, y0 + h + .08, cz, w + .5, .16, d + .5);
  if (opts.glow !== false) for (const [F, len] of blockFaces(P, cx, cz, w + .5, d + .5)){
    if (chance(opts.glowOdds ?? .75)){
      box(M.fGlow, F, 0, y0 + h - .02, -.08, len - .4, .05, .06);
      for (let t = -len/2 + .8; t < len/2 - .4; t += 1.6) glow(F, t, y0 + h - .2, .1, 'orange', 1.3);
    }
  }
}
function fPipe(P, ax, ay, az, bx, by, bz, r = .12, mat = M.fSteel2){ strut(mat, P, ax, ay, az, bx, by, bz, r*2); }
// a big round stack: shaft, collars, cap, a ladder, and steam
function fStack(P, x, z, r, h, opts = {}){
  put(U.cyl16, M.fSteel, under(P, T(x, CURB + h/2, z, 0, 2*r, h, 2*r)));
  for (let y = 1.2; y < h - .3; y += opts.collar || 2.4) put(U.cyl16, chance(.3) ? M.fRust : M.fSteel3, under(P, T(x, CURB + y, z, 0, 2*r + .2, .22, 2*r + .2)));
  put(U.cyl16, M.fSteel3, under(P, T(x, CURB + h + .2, z, 0, 2*r + .35, .4, 2*r + .35)));            // the lipped top
  put(U.cyl16, M.concDD, under(P, T(x, CURB + h + .3, z, 0, 2*r - .1, .22, 2*r - .1)));
  for (const y of opts.lit || []){ put(U.cyl16, M.fGlow, under(P, T(x, CURB + y, z, 0, 2*r + .24, .08, 2*r + .24))); glow(P, x + r + .15, CURB + y, z, 'orange', 1.4); glow(P, x - r - .15, CURB + y, z, 'orange', 1.4); }
  for (let y = .3; y < h - .4; y += .3) box(M.frame, P, x, CURB + y, z + r + .1, .3, .03, .03);       // ladder rungs
  box(M.frame, P, x - .15, CURB + h/2, z + r + .1, .03, h, .03); box(M.frame, P, x + .15, CURB + h/2, z + r + .1, .03, h, .03);
  emitters.push(new THREE.Vector3(x, CURB + h + .4, z).applyMatrix4(P));
  if (opts.beacon){ beaconLight(P, x + r + .1, CURB + h + .45, z, .1, 1.1); beaconLight(P, x - r - .1, CURB + h + .45, z, .1, 1.1); }
}
function buildFoundry(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const P = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));   // the yard front faces local +z
  // ---- the yard: dark wet concrete in slabs, puddles, hazard lines, a few drums and crates
  box(G.asph, P, 0, .012, 0, L, .025, D);
  const nx = 24, nz = 16, sx = L/nx, sz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) if (!chance(.04)) box(pick(TILES.ind), P, (a-(nx-1)/2)*sx, .03, (b-(nz-1)/2)*sz, sx - .05, .045, sz - .05);
  for (let k=0; k<10; k++) box(G.puddle, P, rnd(-L/2 + 1, L/2 - 1), .056, rnd(2, D/2 - .6), rnd(.6, 1.8), .01, rnd(.3, .8));
  box(M.hazard, P, 0, .058, 4.0, L - 2, .012, .1);
  for (let k=0; k<14; k++){ const x = rnd(-L/2 + .6, L/2 - .6), z = rnd(4.4, D/2 - .4);
    chance(.6) ? put(U.cyl16, pick([M.fRust, M.awn3, M.corrBlue, M.fSteel2]), under(P, T(x, .28, z, 0, .4, .52, .4))) : box(pick([M.crate, M.fSteel2]), P, x, .22, z, .5, .44, .5); }

  // ---- the main mass: a podium hall, two tall blocks over it, a rounded hall on top
  fBlock(P, -1.2, -2.0, 11.5, 7.6, CURB, 4.4, M.fSteel, { windows: true });                         // podium
  fBlock(P, -4.0, -3.4, 5.6, 4.8, CURB + 4.6, 4.6, M.fSteel2, { windows: true });                   // left block
  fBlock(P, -4.0, -3.4, 4.6, 4.0, CURB + 9.4, 2.6, M.fSteel, { glowOdds: .5 });                    // its crown
  fBlock(P, 2.0, -3.6, 3.6, 3.8, CURB + 4.6, 9.0, M.fSteel3, { windows: true, glowOdds: .5 });     // the tall block
  // the rounded roof over the left crown (the curved top in the reference)
  put(U.cyl16, M.fSteel2, under(P, T(-4.0, CURB + 12.2, -3.4, 0, 3.6, 4.0, 3.6, PI/2)));
  for (let t = -1.8; t <= 1.8; t += .45) put(U.torus, M.fRib, under(P, T(-4.0 + t, CURB + 12.2, -3.4, PI/2, 3.7, 3.7, 3.7)));
  // a vertical orange strip running up the tall block's front, like the one in the reference
  box(M.fGlow, P, 3.5, CURB + 9.0, -1.68, .07, 8.2, .06);
  for (let y = 5.5; y < 13; y += 1.4) glow(P, 3.5, CURB + y, -1.4, 'orange', 1.2);
  box(M.fGlow2, P, .4, CURB + 9.0, -1.68, .05, 6.5, .05); for (let y = 6.5; y < 12; y += 2) glow(P, .4, CURB + y, -1.45, 'orange', .9);
  // the one cold blue tube, low on the left
  box(M.fBlue, P, -5.5, CURB + 2.6, 1.92, 2.6, .07, .06); glow(P, -5.5, CURB + 2.6, 2.2, 'cyan', 1.4); glow(P, -6.6, CURB + 2.6, 2.2, 'cyan', 1.0);

  // ---- the loading dock along the podium's front: a deep canopy lit orange underneath, warm-lit bays
  const dz = 1.8 + .02;
  box(M.fSteel3, P, .8, CURB + 2.2, dz + .7, 7.5, .14, 1.5);
  box(M.fGlow, P, .8, CURB + 2.11, dz + 1.4, 7.4, .05, .05);
  for (let t = -2.6; t <= 4.2; t += 1.0){ box(M.fGlow2, P, t, CURB + 2.12, dz + .7, .5, .03, .2); glow(P, t, CURB + 1.95, dz + .8, 'orange', 1.5); }
  for (const t of [-2.0, .1, 2.2, 3.9]){ box(M.fWin, P, t, CURB + .95, dz, 1.4, 1.6, .03); box(M.shutter, P, t, CURB + 1.55, dz + .02, 1.4, .4, .03); }   // open bays, lit inside
  for (const t of [-2.9, 4.7]) cyl(M.frame, P, t, CURB + 1.1, dz + 1.35, .05, 2.2);
  for (let k=0; k<6; k++) person(P, rnd(-2.5, 4.5), CURB, dz + rnd(.3, 1.4));
  // a truck at the dock
  { const Q = under(P, T(-1.1, 0, dz + 2.6, 0)); box(M.corrBlue, Q, 0, .75, 0, 2.6, 1.2, 1.0); box(M.fSteel2, Q, 1.7, .55, 0, .8, .8, .95); box(M.glassDark, Q, 2.08, .7, 0, .03, .3, .8);
    for (const x of [-.8, .6, 1.6]) for (const s2 of [-1, 1]) put(U.cyl16, M.frame, under(Q, T(x, .2, s2*.5, 0, .38, .14, .38, PI/2))); box(M.bulb, Q, 2.1, .4, .35, .04, .08, .1); glow(Q, 2.2, .4, .35, 'warm', .9); }

  // ---- the fat smokestack on the left, wrapped in scaffolding
  const sx0 = -9.2, sz0 = -3.6;
  fStack(P, sx0, sz0, 1.15, 16.5, { lit: [6.2, 11.8], collar: 2.0 });
  for (let y = 0; y < 13; y += 1.3){                                                                 // scaffolding round it
    for (const [ax, az, bx2, bz2] of [[-1.6,-1.6,1.6,-1.6],[1.6,-1.6,1.6,1.6],[1.6,1.6,-1.6,1.6],[-1.6,1.6,-1.6,-1.6]]){
      strut(M.frame, P, sx0 + ax, CURB + y + 1.3, sz0 + az, sx0 + bx2, CURB + y + 1.3, sz0 + bz2, .04);
      if (chance(.6)) strut(M.frame, P, sx0 + ax, CURB + y, sz0 + az, sx0 + bx2, CURB + y + 1.3, sz0 + bz2, .03);
    }
  }
  for (const [ax, az] of [[-1.6,-1.6],[1.6,-1.6],[1.6,1.6],[-1.6,1.6]]) box(M.frame, P, sx0 + ax, CURB + 6.6, sz0 + az, .06, 13, .06);
  for (const y of [4.0, 8.0, 11.9]) box(M.fSteel3, P, sx0, CURB + y, sz0 + 1.6, 3.3, .06, .5);       // landings
  fPipe(P, sx0 + 1.3, CURB + 7.0, sz0, -6.8, CURB + 7.0, sz0, .22, M.fRust);                        // flue into the block
  fPipe(P, sx0 + 1.3, CURB + 3.2, sz0 + .6, -7.0, CURB + 3.2, sz0 + .6, .18);

  // ---- the tall chimney at the back right, with a beacon
  fStack(P, 8.6, -5.2, .85, 22.5, { lit: [9, 17.5], collar: 3.0, beacon: true });
  // ---- the tank tower, ringed in light, with catwalks and a ladder
  const tx = 8.0, tz = 1.4, tr = 1.5, th = 10.5;
  put(U.cyl16, M.fSteel2, under(P, T(tx, CURB + th/2, tz, 0, 2*tr, th, 2*tr)));
  for (const y of [2.6, 5.4, 8.2]){ put(U.cyl16, M.fGlow, under(P, T(tx, CURB + y, tz, 0, 2*tr + .14, .07, 2*tr + .14))); for (let a = 0; a < TAU; a += PI/2) glow(P, tx + Math.cos(a)*(tr + .2), CURB + y, tz + Math.sin(a)*(tr + .2), 'orange', 1.0); }
  for (const y of [4.0, 7.0]){ put(U.cyl16, M.fSteel3, under(P, T(tx, CURB + y, tz, 0, 2*tr + .9, .06, 2*tr + .9))); for (let a = 0; a < TAU; a += TAU/14) cyl(M.frame, P, tx + Math.cos(a)*(tr + .42), CURB + y + .2, tz + Math.sin(a)*(tr + .42), .015, .4); }
  put(U.cone, M.fSteel3, under(P, T(tx, CURB + th + .5, tz, 0, 2*tr + .1, 1.0, 2*tr + .1)));
  cyl(M.frame, P, tx, CURB + th + 1.4, tz, .03, 1.2); beaconLight(P, tx, CURB + th + 2.0, tz, .09, 1.0);
  for (let y = .3; y < th - .2; y += .3) box(M.frame, P, tx - tr - .1, CURB + y, tz, .03, .03, .3);
  // a stubby stack and a hopper on the right
  fStack(P, 5.6, -5.6, .6, 13.5, { lit: [8.5] });
  box(M.fSteel3, P, 9.4, CURB + 2.4, -1.8, 2.2, 4.8, 2.2); put(U.cone, M.fSteel2, under(P, T(9.4, CURB + 5.4, -1.8, 0, 2.6, 1.2, 2.6)));

  // ---- pipes over and round everything
  const loop = (ax, az, bx2, bz2, y0, up, r) => {                                                   // a raised loop between two points
    fPipe(P, ax, y0, az, ax, y0 + up, az, r); fPipe(P, bx2, y0, bz2, bx2, y0 + up, bz2, r);
    fPipe(P, ax, y0 + up, az, bx2, y0 + up, bz2, r);
    put(U.sph, M.fSteel2, under(P, T(ax, y0 + up, az, 0, 3*r, 3*r, 3*r))); put(U.sph, M.fSteel2, under(P, T(bx2, y0 + up, bz2, 0, 3*r, 3*r, 3*r)));
  };
  loop(-2.6, -2.0, .6, -2.0, CURB + 9.2, 2.6, .2);                                                  // from the left block over to the tall one
  loop(-1.5, -5.0, 1.0, -5.0, CURB + 9.2, 1.6, .14);
  loop(3.6, -3.0, 7.2, -3.0, CURB + 7.0, 1.6, .18);                                                 // tall block to the chimney side
  loop(4.4, -1.2, 6.6, 1.0, CURB + 4.4, 2.2, .16);                                                  // podium to the tank
  for (const [y, r, z] of [[CURB + 3.8, .14, 1.95], [CURB + 3.4, .1, 1.95], [CURB + 1.0, .12, 1.95]]) fPipe(P, -6.9, y, z, 4.4, y, z, r, chance(.5) ? M.fRust : M.fSteel2);   // runs along the front
  for (const x of [-6.6, -.2, 3.3]) fPipe(P, x, CURB + .2, 1.95, x, CURB + 4.3, 1.95, .12);
  fPipe(P, 4.4, CURB + 3.0, -2.0, 7.0, CURB + 3.0, -2.0, .2, M.fRust); fPipe(P, 7.0, CURB + 3.0, -2.0, 7.0, CURB + 3.0, .4, .2, M.fRust);
  // aerials, cables and a few warm work lights up top
  for (const [x, z, h] of [[-5.2, -2.4, 2.4], [2.6, -2.6, 3.2], [1.0, -4.8, 1.8]]) cyl(M.frame, P, x, CURB + 13.6 + h/2 - (x < 0 ? 1.6 : 0), z, .03, h);
  for (const [x, y, z] of [[-6.5, 9.3, 1.0], [3.7, 13.7, -1.9], [-1.3, 4.6, 1.9], [7.3, 4.6, 2.9]]){ box(M.bulb, P, x, CURB + y, z, .14, .08, .1); glow(P, x, CURB + y - .05, z + .1, 'warm', 1.4); }
  for (let k=0; k<5; k++) plant(pick(['vines','h_ivy','l_mossroots']), P, rnd(-6.5, 3), CURB + rnd(3.0, 4.3), 1.85, rnd(.8, 1.1), 't', true);   // a little growth on the old steel
  m.roofH = CURB + 4.6;
  m.top = CURB + 23.5;
}
