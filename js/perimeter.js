// Neon Terrarium: perimeters. A wall of a zone's style on an empty plot, run through the middle of the plot; walls on plots side by side
// join up on their own (straight, corner, T, crossing, end), carrying on over the street between them, and the plot's paving becomes the
// zone's. A wall starts two pods high (four floors) and stacks a pod at a time, as high as a building. A straight run can be a gate instead:
// an arch at street level that people walk through. The walls are part of the plot's geometry (built with it, by the plot worker too, merged
// into the region like any building), so they cost nothing per frame; the walking map is made from that geometry, so nobody walks through a
// wall, only through a gate or round its end. The gates' scan sweeps are one mesh for the whole city, animated on the graphics card from the
// shared clock, and lit only while people are near (checked once a second).
// All game scripts share one scope and load in order (see index.html); this one loads after world.js, and the plot worker loads it too (recipe.js).
'use strict';
const WALL_BASE = 4*FH, WALL_TIER = 2*FH, WALL_T = .44, GATE_W = 1.3, GATE_H = 2.05, WALL_MOD = LOT/4;   // (WALL_MOD: decoration repeats on a grid that meets the next plot's)
const WALL_ZONES = { low: 'Residential', mid: 'Commercial', high: 'Luxury', ind: 'Industrial' };
// which neighbors (in SIDES4 order: +x, -x, +z, -z) are walls, and how high it may go under a highway or the metro: worked out on the page
// for each build (recipeOf calls this), so the plot worker builds from the recipe alone
function wallPrep(c){
  if (!c.wall){ delete c.wallN; delete c.wallCap; return; }
  c.wallN = SIDES4.map(([a, b]) => { const n = cells.get(ckey(c.i + a, c.j + b)); return n && n.wall && !n.mega ? 1 : 0; });
  const cap = typeof hwCap === 'function' ? hwCap(c) : null; if (cap === null) delete c.wallCap; else c.wallCap = cap;
}
const wallHeight = w => WALL_BASE + (w.n || 0)*WALL_TIER;
const wallTopOf = c => { let h = CURB + wallHeight(c.wall); if (c.wallCap !== undefined) h = Math.min(h, c.wallCap - .05); return Math.max(CURB + .6, h); };
// the runs a plot's wall is made of, each in a frame whose +z runs along it: [ry, z0, z1, gateable]
function wallRuns(L){
  const n = L[0] + L[1] + L[2] + L[3], H2 = LOT/2;
  if (n === 0) return { kind: 'post', runs: [[PI/2, -1.35, 1.35]] };
  if (n === 1){ const [a, b] = SIDES4[L.indexOf(1)]; return { kind: 'end', runs: [[Math.atan2(a, b), -1.2, H2]] }; }
  if (n === 2 && L[0] && L[1]) return { kind: 'line', runs: [[PI/2, -H2, H2]] };
  if (n === 2 && L[2] && L[3]) return { kind: 'line', runs: [[0, -H2, H2]] };
  return { kind: n === 2 ? 'corner' : n === 3 ? 'tee' : 'cross', runs: SIDES4.map(([a, b], k) => L[k] ? [Math.atan2(a, b), -WALL_T/2, H2] : null).filter(Boolean) };
}
const wallGateable = c => { const k = wallRuns(c.wallN || [0, 0, 0, 0]).kind; return k === 'post' || k === 'end' || k === 'line'; };

/* ---------- the four styles, after the reference sheet ---------- */
// Residential, solarpunk: recycled timber planks between posts, photovoltaic panels along the top, a moss planter at its foot; the gate two
// heavy posts under a solar canopy, with a biometric scanner. Industrial: reinforced steel plating, cable conduit, vents and an orange neon
// strip; the joints are pipe junctions with a warning beacon; the gate a steel cargo arch with pipes and a security keypad. Commercial:
// polished synth panels on a dark plinth with an LED display strip; the gate an access arch with a lit band and a reader. Luxury: gold-trimmed
// solar glass over a marble planter with bonsai; the gate a gold arch with a holo screen.
M.pmWood = toon(0x8a6a48); M.pmWood2 = toon(0x6f5439); M.pmPost = toon(0x56402c); M.pmSolar = toon(0x22385e); M.pmPlanter = toon(0x868070); M.pmSoil = toon(0x3e3426);
M.pmBio = toon(0x0e3a20, { em: 0x5aff8a, kind: 'neon' });
M.piSteel = toon(0x60666b); M.piSteel2 = toon(0x4b5156); M.piDark = toon(0x2c3136); M.piRust = toon(0x7a5238); M.piNeon = toon(0x3a2008, { em: 0xff8a2a, kind: 'neon' });
M.pcPanel = toon(0x4c5c74); M.pcPanel2 = toon(0x5f7290); M.pcPlinth = toon(0x313a4a); M.pcLed = toon(0x0c2234, { em: 0x5ac8ff, kind: 'neon' });
M.plMarble = toon(0xe6e2da); M.plMarble2 = toon(0xcdc7bb); M.plGold = toon(0xc9a24e); M.plGlass = toon(0xd3dccb, { em: 0x3a3020, kind: 'window' }); M.plHolo = toon(0x2a1840, { em: 0xc08aff, kind: 'neon' });
// one stretch of wall [za, zb] in frame F, from y0 up h, in a style (both faces dressed); mods: the module centres along it, on the shared grid
function wallBody(st, F, za, zb, y0, h, green){
  const len = zb - za, zc = (za + zb)/2, t = WALL_T; if (len < .05) return;
  const mods = []; for (let k = Math.ceil(za/WALL_MOD - .5); (k + .5)*WALL_MOD < zb; k++){ const z = (k + .5)*WALL_MOD; if (z > za + .05 && z < zb - .05) mods.push(z); }
  if (st === 'low'){
    box(M.pmWood2, F, 0, y0 + h/2, zc, t, h, len);
    for (let y = y0 + .2, q = 0; y < y0 + h - .12; y += .31, q++) for (const s of [-1, 1]) box(q % 2 ? M.pmWood : M.pmWood2, F, s*(t/2 + .012), y, zc, .025, .25, len - .02);
    for (const z of mods) if (Math.round(z/WALL_MOD - .5) % 2 === 0) box(M.pmPost, F, 0, y0 + h/2 + .04, z, t + .07, h + .08, .13);
    box(M.pmPost, F, 0, y0 + h + .04, zc, t + .08, .08, len);
    for (const z of mods) if (Math.round(z/WALL_MOD - .5) % 2 === 0){ strut(M.frame, F, 0, y0 + h + .05, z, 0, y0 + h + .22, z, .03); box(M.pmSolar, F, 0, y0 + h + .26, z, .66, .03, .82, 0, 0, .32); box(M.frame, F, 0, y0 + h + .245, z, .7, .02, .86, 0, 0, .32); }
    box(M.pmPlanter, F, t/2 + .17, y0 + .17, zc, .3, .34, len - .04); box(M.pmSoil, F, t/2 + .17, y0 + .345, zc, .24, .02, len - .1);
    if (green) for (const z of mods){ if (chance(.75)) plant(pick(['bush', 'g_fern3', 'bushFlower', 'fern']), F, t/2 + .17, y0 + .35, z + rnd(-.15, .15), rnd(.5, .7));
      if (chance(.35)) plant(hangKind(), F, (chance(.5) ? 1 : -1)*(t/2 + .03), y0 + h, z, rnd(.7, 1), 't', true); }
  } else if (st === 'ind'){
    box(M.piSteel2, F, 0, y0 + h/2, zc, t, h, len);
    for (const z of mods) for (const s of [-1, 1]){ box(M.piSteel, F, s*(t/2 + .012), y0 + h/2, z, .025, h - .16, WALL_MOD - .06);
      if (chance(.3)) box(M.piRust, F, s*(t/2 + .027), y0 + rnd(.4, h*.6), z + rnd(-.25, .25), .012, rnd(.4, 1.1), rnd(.06, .14)); }
    for (const s of [-1, 1]){ box(M.piNeon, F, s*(t/2 + .03), y0 + 1.25, zc, .03, .05, len - .06); box(M.piDark, F, s*(t/2 + .03), y0 + .12, zc, .03, .2, len); }
    for (const z of mods) if (Math.round(z/WALL_MOD - .5) % 2 === 0){ for (let q = 0; q < 3; q++) box(M.piDark, F, t/2 + .03, y0 + .4 + q*.1, z, .03, .04, .5); glow(F, t/2 + .1, y0 + 1.25, z, 'orange', .7); }
    cyl(M.metalDark, F, -(t/2 + .07), y0 + h - .35, zc, .055, len, PI/2); cyl(M.metal, F, -(t/2 + .07), y0 + h - .55, zc, .035, len, PI/2);
    box(M.piSteel, F, 0, y0 + h + .05, zc, t + .08, .1, len);
  } else if (st === 'mid'){
    box(M.pcPlinth, F, 0, y0 + .15, zc, t + .12, .3, len);
    box(M.pcPanel, F, 0, y0 + .3 + (h - .3)/2, zc, t, h - .3, len);
    for (const z of mods) for (const s of [-1, 1]) box(M.pcPanel2, F, s*(t/2 + .01), y0 + .3 + (h - .3)*.62, z, .02, (h - .3)*.66, WALL_MOD - .07);
    for (const s of [-1, 1]){ const Fs = under(F, T(s*(t/2 + .025), 0, zc, s > 0 ? PI/2 : -PI/2)); box(M.pcPlinth, Fs, 0, y0 + .62, -.005, len - .04, .26, .02); screenQuad(Fs, 0, y0 + .62, .01, len - .1, .18, 3); }
    box(M.pcPlinth, F, 0, y0 + h + .04, zc, t + .06, .08, len); box(M.pcLed, F, 0, y0 + h + .085, zc, t - .06, .02, len - .04);
  } else {   // luxury
    box(M.plMarble, F, 0, y0 + .26, zc, t + .34, .52, len); box(M.pmSoil, F, 0, y0 + .525, zc, t + .26, .02, len - .04);
    box(M.plGlass, F, 0, y0 + .52 + (h - .52)/2, zc, t*.5, h - .52, len);
    for (const z of mods) box(M.plGold, F, 0, y0 + .52 + (h - .52)/2, z - WALL_MOD/2 + .001, t*.5 + .06, h - .52, .06);
    for (const y of [y0 + .55, y0 + h - .02, y0 + .52 + (h - .52)*.5]) box(M.plGold, F, 0, y, zc, t*.5 + .07, .07, len);
    if (green) for (const z of mods) if (Math.round(z/WALL_MOD - .5) % 2 === 0) plant(chance(.6) ? 'bonsai' : pick(['bush', 'g_fern3']), F, (chance(.5) ? 1 : -1)*(t/2 + .07), y0 + .53, z, rnd(.6, .8));
  }
}
// a joint (a corner, a T, a crossing) or the end of a run: a post a little proud of the wall
function wallPost(st, F, z, y0, h){
  const t = WALL_T + .14;
  if (st === 'low'){ box(M.pmPost, F, 0, y0 + h/2 + .05, z, t, h + .1, t); box(M.pmSolar, F, 0, y0 + h + .2, z, t + .1, .04, t + .1); box(M.pmBio, F, t/2 + .005, y0 + 1.0, z, .02, .12, .2); }
  else if (st === 'ind'){ box(M.piSteel, F, 0, y0 + h/2 + .05, z, t, h + .1, t); for (const [a, b] of [[1, 1], [-1, -1]]) cyl(M.metalDark, F, a*(t/2 + .05), y0 + h/2, z + b*(t/2 + .05), .06, h);
    box(M.piNeon, F, 0, y0 + h + .18, z, .14, .16, .14); glow(F, 0, y0 + h + .2, z, 'orange', 1.1); }
  else if (st === 'mid'){ box(M.pcPlinth, F, 0, y0 + h/2 + .05, z, t, h + .1, t); box(M.pcLed, F, t/2 + .005, y0 + 1.4, z, .02, .5, .26); box(M.neonAmber, F, 0, y0 + h + .14, z, .1, .1, .1); glow(F, 0, y0 + h + .16, z, 'amber', .8); }
  else { box(M.plMarble2, F, 0, y0 + h/2 + .05, z, t, h + .1, t); box(M.plGold, F, 0, y0 + h + .12, z, t + .08, .08, t + .08); box(M.plHolo, F, t/2 + .005, y0 + 1.2, z, .02, .3, .2); glow(F, t/2 + .1, y0 + 1.2, z, 'platinum', .9); }
}
// the gate: an opening GATE_W wide and GATE_H high in the middle of the run, its pillars, the wall over it, and the zone's dressing
function wallGate(st, F, y0, h){
  const gw = GATE_W, pw = .3, t = WALL_T + .16, top = y0 + GATE_H, x = gw/2 + pw/2;
  const pil = st === 'low' ? M.pmPost : st === 'ind' ? M.piSteel : st === 'mid' ? M.pcPlinth : M.plMarble2;
  for (const s of [-1, 1]) box(pil, F, 0, y0 + h/2 + .03, s*x, t, h + .06, pw);
  const fill = st === 'low' ? M.pmWood2 : st === 'ind' ? M.piSteel2 : st === 'mid' ? M.pcPanel : M.plGlass;
  if (h > GATE_H + .2) box(fill, F, 0, (top + .2 + y0 + h)/2, 0, st === 'high' ? WALL_T*.5 : WALL_T, y0 + h - top - .2, gw);
  if (st === 'low'){
    box(M.pmPost, F, 0, top + .1, 0, t + .04, .2, gw + 2*pw);
    box(M.pmSolar, F, 0, Math.min(y0 + h, top + .2) + .14, 0, t + .7, .04, gw + 2*pw + .3, 0, .22, 0); box(M.frame, F, 0, Math.min(y0 + h, top + .2) + .12, 0, t + .74, .02, gw + 2*pw + .34, 0, .22, 0);
    for (const s of [-1, 1]){ box(M.metalDark, F, s*(t/2 + .05), y0 + 1.05, x, .08, .3, .22); box(M.pmBio, F, s*(t/2 + .095), y0 + 1.07, x, .01, .18, .15); glow(F, s*(t/2 + .15), y0 + 1.07, x, 'green', .9); }
  } else if (st === 'ind'){
    box(M.piSteel, F, 0, top + .14, 0, t + .1, .28, gw + 2*pw + .1); for (const s of [-1, 1]) box(M.hazard, F, s*(t/2 + .06), top + .14, 0, .02, .12, gw + 2*pw);
    for (const s of [-1, 1]) for (const zz of [-x - pw/2 - .06, x + pw/2 + .06]) cyl(M.metalDark, F, s*(t/2 - .05), y0 + h/2, zz, .06, h);
    for (const s of [-1, 1]){ box(M.piDark, F, s*(t/2 + .05), y0 + 1.1, -x, .08, .34, .2); box(M.piNeon, F, s*(t/2 + .095), y0 + 1.12, -x, .01, .2, .13); glow(F, s*(t/2 + .15), y0 + 1.12, -x, 'orange', .8); }
    box(M.piNeon, F, 0, top + .34, 0, .14, .14, .14); glow(F, 0, top + .38, 0, 'amber', 1.0);
  } else if (st === 'mid'){
    box(M.pcPanel2, F, 0, top + .13, 0, t + .06, .26, gw + 2*pw); for (const s of [-1, 1]) box(M.pcLed, F, s*(t/2 + .04), top + .13, 0, .02, .06, gw + 2*pw - .1);
    for (const s of [-1, 1]){ box(M.pcPlinth, F, s*(t/2 + .05), y0 + 1.1, x, .08, .3, .18); box(M.pcLed, F, s*(t/2 + .095), y0 + 1.12, x, .01, .16, .12); glow(F, s*(t/2 + .15), y0 + 1.12, x, 'cyan', .8); }
  } else {
    box(M.plGold, F, 0, top + .06, 0, t + .04, .12, gw + 2*pw);
    for (let k = 0; k < 6; k++){ const a0 = PI*k/6, a1 = PI*(k + 1)/6, r = gw/2 + .05; strut(M.plGold, F, 0, top - .45 + Math.sin(a0)*.45, -Math.cos(a0)*r, 0, top - .45 + Math.sin(a1)*.45, -Math.cos(a1)*r, .07); }
    for (const s of [-1, 1]) box(M.plGold, F, 0, y0 + h + .08, s*x, t + .06, .1, pw + .06);
    box(M.plGold, F, 0, top + .38, 0, .1, .34, .5); box(M.plHolo, F, .055, top + .38, 0, .01, .26, .42); box(M.plHolo, F, -.055, top + .38, 0, .01, .26, .42); glow(F, 0, top + .38, 0, 'platinum', 1.2);
  }
}
// the wall on a plot (cellBody): its runs from the joining neighbors, posts at the joints and free ends, a gate if it is one
function buildPerimeter(c){
  const w = c.wall; if (!w || !WALL_ZONES[w.zone]) return;
  R = mulberry32(hash('wall', c.i, c.j, w.seed || 0));
  const st = w.zone, P = T(c.x, 0, c.z), y0 = CURB, h = wallTopOf(c) - CURB, green = c.green !== 'none';
  const { kind, runs } = wallRuns(c.wallN || [0, 0, 0, 0]);
  const gate = !!w.gate && (kind === 'post' || kind === 'end' || kind === 'line') && h > GATE_H + .3;
  for (const [ry, z0, z1] of runs){
    const F = under(P, T(0, 0, 0, ry));
    if (gate){ const e = GATE_W/2 + .3; wallBody(st, F, Math.min(z0, -e - .25), -e, y0, h, green); wallBody(st, F, e, z1, y0, h, green); wallGate(st, F, y0, h); }
    else wallBody(st, F, z0, z1, y0, h, green);
    if (kind === 'post' || kind === 'end') wallPost(st, F, z0 + (kind === 'post' || !gate ? .1 : -.15), y0, h);
    if (kind === 'post') wallPost(st, F, z1 - .1, y0, h);
  }
  if (kind === 'corner' || kind === 'tee' || kind === 'cross') wallPost(st, P, 0, y0, h);
}

/* ---------- on the page: placing, stacking, gates, and the gates' scans ---------- */
let PERIM = null;   // the zone picked for Perimeter (one of the thin buttons under the zone buttons), or null
const wallNbrs = c => SIDES4.map(([a, b]) => cells.get(ckey(c.i + a, c.j + b))).filter(n => n && n.wall && !n.mega);
const wallFree = c => !!c && !c.mega && !c.lift && !c.sections.length && !c.wall;
const perimFlash = msg => { const h = document.getElementById('modeHint'); if (!h) return; h.textContent = msg; clearTimeout(perimFlash.t); perimFlash.t = setTimeout(() => { if (PERIM) perimHint(); }, 3000); };
function perimHint(){ const h = document.getElementById('modeHint'); if (h && PERIM) h.textContent = 'Perimeter (' + WALL_ZONES[PERIM] + '): click an empty plot to raise a wall · click a wall\'s face to switch wall and gate · click its top to stack it higher · right-click takes the top off'; }
// a click in Perimeter mode: what it would do
function perimTarget(pk){
  if (!pk) return null;
  if (pk.kind === 'sky') return cells.has(ckey(pk.i, pk.j)) ? null : { type: 'wallNew', i: pk.i, j: pk.j };
  const c = pk.c; if (!c || c.mega) return null;
  if (c.wall){
    if (pk.kind === 'plat') return null;   // (its paving: nothing)
    const top = wallTopOf(c);
    return pk.p && pk.p.y >= top - .2 ? { type: 'wallUp', c } : { type: 'wallGate', c };
  }
  if (pk.kind === 'plat' && wallFree(c)) return { type: 'wallNew', c, i: c.i, j: c.j };
  return null;
}
function perimApply(t){
  if (!t || !PERIM) return null;
  if (t.type === 'wallNew') return addWall(t.c || null, t.i, t.j, PERIM);
  if (t.type === 'wallUp') return stackWall(t.c);
  if (t.type === 'wallGate') return toggleGate(t.c);
  return null;
}
function addWall(c, i, j, zone){
  stageFinishAll();
  if (!c){ c = addPlatform(i, j, null); if (!c) return null; finishAnimsOn(c); }
  if (!wallFree(c)) return null;
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.wall = { zone, n: 0, gate: false, seed: (Math.random()*1e9)|0 };
  refresh([c, ...wallNbrs(c)]); dropView(old);
  startAnim(c, 'build', CURB - .05, wallTopOf(c) + 1.2, zone, LOT, null);
  return c;
}
function stackWall(c){
  stageFinishAll();
  const top = wallTopOf(c);
  if (top + WALL_TIER > CURB + MAX_HEIGHT + 1.5){ perimFlash('That wall is as tall as walls go.'); return null; }
  if (c.wallCap !== undefined && top + WALL_TIER > c.wallCap - .05){ perimFlash('A highway or the metro runs over this wall: it can\'t go higher.'); return null; }
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.wall.n = (c.wall.n || 0) + 1;
  refresh([c]); dropView(old);
  startAnim(c, 'build', top - .05, wallTopOf(c) + 1.2, c.wall.zone, LOT, null);
  return c;
}
function toggleGate(c){
  stageFinishAll();
  wallPrep(c);
  if (!wallGateable(c)){ perimFlash('Gates go in straight runs of wall, not at corners or joins.'); return null; }
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.wall.gate = !c.wall.gate;
  refresh([c]); dropView(old);
  startAnim(c, 'build', CURB - .05, Math.min(wallTopOf(c), CURB + GATE_H + .6) + .4, c.wall.zone, LOT, null);
  perimDirty();
  return c;
}
// right-click: the top pod off, or the wall itself when it's at its base height (the plot stays, blank)
function removeWallTier(c){
  stageFinishAll(); finishAnimsOn(c);
  const top = wallTopOf(c), zone = c.wall.zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  let nb = [];
  if (c.wall.n > 0) c.wall.n--;
  else { nb = wallNbrs(c); delete c.wall; delete c.wallN; delete c.wallCap; }
  refresh([c, ...nb]);
  startAnim(c, 'remove', c.wall ? wallTopOf(c) - .05 : CURB - .05, top + 1.2, zone, LOT, old);
  perimDirty();
}
// the hover outline in Perimeter mode
function perimHover(t){
  const col = ZONES[PERIM] ? ZONES[PERIM].col : '#e3d6bd'; hoverMat.color.set(col); hoverFill.visible = false; hoverStrip.visible = false;
  if (t.type === 'wallNew'){ const x = t.i*LOT, z = t.j*LOT; hover.position.set(x, CURB + WALL_BASE/2, z); hover.scale.set(LOT*.72, WALL_BASE, LOT*.72); }
  else if (t.type === 'wallUp'){ const c = t.c, top = wallTopOf(c); hover.position.set(c.x, top + WALL_TIER/2, c.z); hover.scale.set(LOT*.72, WALL_TIER, LOT*.72); }
  else { const c = t.c, along = wallRuns(c.wallN || [0, 0, 0, 0]).runs[0][0], ax = Math.abs(Math.sin(along)) > .5;
    hover.position.set(c.x, CURB + GATE_H/2, c.z); hover.scale.set(ax ? GATE_W : WALL_T + .3, GATE_H, ax ? WALL_T + .3 : GATE_W); }
  hover.visible = true;
}

// The gates' scans: a quad in each gate's opening, all of them in one mesh with one material (one draw for the city). The shader draws each
// zone's sweep from the shared clock: residential a green biometric band, industrial amber laser lines, commercial a cyan grid, luxury gold
// holo ripples. A faint idle glow, brighter while people are at the gate (looked at once a second, from the people already being moved).
let perimDirty = () => {}, PERIM_G = null;   // (PERIM_G: the gates' scan mesh, for checks)
if (!self.IN_RECIPE_WORKER){
  const ZI = { low: 0, ind: 1, mid: 2, high: 3 };
  // (made the first time a gate needs it, after the material registry has closed: the plot worker makes no such material, and the two lists must match: matreg.js)
  let mat = null; const makeMat = () => { const m = new THREE.ShaderMaterial({
    uniforms: { time: FOL_UNI.time },
    vertexShader: 'attribute vec3 aG; varying vec3 vG; varying vec2 vUv; void main(){ vG = aG; vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec3 vG; varying vec2 vUv;
      void main(){
        float z = vG.x, sd = vG.y, act = vG.z, u = vUv.x, v = vUv.y, t = time + sd*7.0; vec3 col; float a;
        if (z < .5){ float y = .5 + .48*sin(t*1.7); a = exp(-pow((v - y)/.035, 2.0)) + .1*step(.5, fract(u*6.0 + v*3.0 - t*.4))*.4; col = vec3(.4, 1.0, .55); }
        else if (z < 1.5){ float x = fract(t*.45); a = exp(-pow((u - x)/.025, 2.0)) + .55*step(.93, fract(v*4.0))*(.6 + .4*step(.5, fract(t*3.0))); col = vec3(1.0, .55, .15); }
        else if (z < 2.5){ float g = max(step(.9, fract(u*7.0)), step(.9, fract(v*9.0 - t*.8))); float y = fract(t*.35); a = g*.45 + exp(-pow((v - y)/.05, 2.0)); col = vec3(.35, .8, 1.0); }
        else { float r = pow(.5 + .5*sin(v*26.0 - t*3.0 + sin(u*6.0)*1.5), 6.0); a = r*.7 + .12; col = mix(vec3(1.0, .78, .4), vec3(.85, .6, 1.0), .5 + .5*sin(t*.7 + u*3.0)); }
        float edge = smoothstep(0.0, .06, u)*smoothstep(1.0, .94, u)*smoothstep(1.0, .9, v);
        gl_FragColor = vec4(col*a*edge*(.12 + .88*act), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }); m.userData.colorOnly = true; return m; };
  const G = { mesh: null, sig: '', gates: [], at: new Map(), act: null };
  function rebuild(){
    const list = [];
    for (const c of cells.values()) if (c.wall && c.wall.gate && !c.mega){ const L = c.wallN || [0, 0, 0, 0], k = wallRuns(L); if ((k.kind === 'post' || k.kind === 'end' || k.kind === 'line') && wallTopOf(c) - CURB > GATE_H + .3) list.push({ c, ry: k.runs[0][0] }); }
    const sig = list.map(g => g.c.i + ',' + g.c.j + ':' + g.c.wall.zone + ':' + g.ry.toFixed(2)).join('|');
    if (sig === G.sig) return; G.sig = sig;
    if (G.mesh){ scene.remove(G.mesh); G.mesh.geometry.dispose(); G.mesh = null; }
    G.gates = list; G.at = new Map(list.map((g, k) => [ckey(g.c.i, g.c.j), k]));
    if (!list.length) return;
    const n = list.length, P = new Float32Array(n*12), UV = new Float32Array(n*8), A = new Float32Array(n*12), I = [];
    list.forEach((g, k) => {
      const dx = Math.sin(g.ry), dz = Math.cos(g.ry), w = GATE_W/2 - .02, y0 = CURB + .02, y1 = CURB + GATE_H - .05, sd = (hash('gate', g.c.i, g.c.j) % 1000)/1000;
      const pts = [[-w, y0], [w, y0], [w, y1], [-w, y1]];
      pts.forEach(([s, y], q) => { P.set([g.c.x + dx*s, y, g.c.z + dz*s], (k*4 + q)*3); UV.set([q === 1 || q === 2 ? 1 : 0, q >= 2 ? 1 : 0], (k*4 + q)*2); A.set([ZI[g.c.wall.zone] || 0, sd, 0], (k*4 + q)*3); });
      I.push(k*4, k*4 + 1, k*4 + 2, k*4, k*4 + 2, k*4 + 3);
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    G.act = new THREE.BufferAttribute(A, 3); G.act.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aG', G.act); geo.setIndex(I); geo.computeBoundingSphere();
    G.mesh = new THREE.Mesh(geo, mat || (mat = makeMat())); G.mesh.layers.set(1); G.mesh.renderOrder = 3; G.mesh.raycast = () => {}; G.mesh.matrixAutoUpdate = false; scene.add(G.mesh);
  }
  let pend = true; perimDirty = () => { pend = true; };
  const hold = new Map();   // gate index -> seconds it stays lit
  setInterval(() => {
    if (PERIM && ((typeof hwMode !== 'undefined' && hwMode) || (typeof mtMode !== 'undefined' && mtMode) || (typeof megaPick !== 'undefined' && megaPick) || (typeof delMode !== 'undefined' && delMode))) perimSet(null, true);
    if (pend || (perimDirty.n = (perimDirty.n || 0) + 1) % 4 === 0){ pend = false; rebuild(); }   // (a change of gates, or every few seconds anyway: a load, a highway built over one)
    if (!G.mesh || typeof pplList === 'undefined') return;
    const near = new Set();
    for (const p of pplList){ if (p.x === undefined || !(p._ea > .3)) continue; const k = G.at.get(ckey(Math.round(p.x/LOT), Math.round(p.z/LOT))); if (k === undefined) continue;
      const g = G.gates[k]; if (Math.hypot(p.x - g.c.x, p.z - g.c.z) < 1.4) near.add(k); }
    let ch = false;
    for (let k = 0; k < G.gates.length; k++){
      let h = hold.get(k) || 0; h = near.has(k) || G.force ? 3 : Math.max(0, h - 1); hold.set(k, h);   // (G.force: every gate lit, for checks)
      const a = h > 0 ? 1 : 0; if (G.act.array[k*12 + 2] !== a){ for (let q = 0; q < 4; q++) G.act.array[k*12 + q*3 + 2] = a; ch = true; }
    }
    if (ch) G.act.needsUpdate = true;
  }, 1000);
  PERIM_G = G;
}

// the thin Perimeter button under each zone button
function perimSet(zone, quiet){
  if (zone && PERIM === zone) zone = null;
  if (zone && typeof selectZone === 'function') selectZone(null);   // (a zone and Perimeter are never both picked)
  PERIM = zone || null;
  document.querySelectorAll('.perim[data-perim]').forEach(b => { const on = b.dataset.perim === PERIM; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (PERIM) perimHint(); else if (!quiet && typeof selectZone === 'function') selectZone(null);
  if (!PERIM && typeof hover !== 'undefined') hover.visible = false;
}
if (!self.IN_RECIPE_WORKER) addEventListener('DOMContentLoaded', () => {
  for (const b of document.querySelectorAll('.zones .zone[data-zone]')){
    const z = b.dataset.zone, col = document.createElement('span'); col.className = 'zcol'; col.style.setProperty('--z', b.style.getPropertyValue('--z'));
    b.parentNode.insertBefore(col, b); col.appendChild(b);
    const p = document.createElement('button'); p.className = 'perim'; p.dataset.perim = z; p.type = 'button'; p.textContent = 'Perimeter';
    p.title = WALL_ZONES[z] + ' perimeter: walls and gates on empty plots'; p.setAttribute('aria-pressed', 'false');
    p.addEventListener('click', () => perimSet(z)); col.appendChild(p);
  }
});
