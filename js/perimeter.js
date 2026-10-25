// Neon Terrarium: perimeters. A wall of a zone's style on an empty plot, run through the middle of the plot; walls on plots side by side
// join up on their own (straight, corner, T, crossing, end), carrying on over the street between them, and the plot's paving becomes the
// zone's. A wall starts two pods high (four floors) and stacks a pod at a time, as high as a building. A straight run can be a gate instead:
// an arch at street level that people walk through. The walls are part of the plot's geometry (built with it, by the plot worker too, merged
// into the region like any building), so they cost nothing per frame; the walking map is made from that geometry, so nobody walks through a
// wall, only through a gate or round its end. The gates' scan sweeps are one mesh for the whole city, animated on the graphics card from the
// shared clock, and lit only while people are near (checked once a second).
// All game scripts share one scope and load in order (see index.html); this one loads after world.js, and the plot worker loads it too (recipe.js).
'use strict';
const WALL_BASE = 4*FH, WALL_TIER = 2*FH, WALL_T = .44, GATE_H = 2.35, GATE_PIL = .42, WALL_MOD = LOT/4;   // (GATE_PIL: a gate's pillar, at a side with no gate next door)   // (WALL_MOD: decoration repeats on a grid that meets the next plot's)
const WALL_ZONES = { low: 'Residential', mid: 'Commercial', high: 'Luxury', ind: 'Industrial' };
// which neighbors (in SIDES4 order: +x, -x, +z, -z) are walls, and how high it may go under a highway or the metro: worked out on the page
// for each build (recipeOf calls this), so the plot worker builds from the recipe alone
function wallPrep(c){
  if (!c.wall){ delete c.wallN; delete c.wallG; delete c.wallB; delete c.wallCap; return; }
  const nb = SIDES4.map(([a, b]) => cells.get(ckey(c.i + a, c.j + b)));
  c.wallN = nb.map(n => n && n.wall && !n.mega ? 1 : 0);
  c.wallG = nb.map(n => n && n.wall && n.wall.gate && !n.mega ? 1 : 0);
  c.wallB = nb.map(n => n && !n.wall && (n.mega || (n.sections && n.sections.length)) ? 1 : 0);   // (a building beside it: a free end along its line runs on to meet it)   // (a gate next door: the two open into one wide gate)
  const cap = typeof hwCap === 'function' ? hwCap(c) : null; if (cap === null) delete c.wallCap; else c.wallCap = cap;
}
const wallHeight = w => WALL_BASE + (w.n || 0)*WALL_TIER;
const wallTopOf = c => { let h = CURB + wallHeight(c.wall); if (c.wallCap !== undefined) h = Math.min(h, c.wallCap - .05); return Math.max(CURB + .6, h); };
// the runs a plot's wall is made of, each in a frame whose +z runs along it: [ry, z0, z1, gateable]
// A free end with a building beside it, along the wall's own line (never in front of it or behind it), runs on over the street to meet the
// building's face (Bd: which neighbors are buildings, wallPrep): ja, jb say an end is joined like that, so it has no end post.
const WALL_REACH = LOT/2 + (LOT - SIDE)/2 - .03;
function wallRuns(L, Bd){
  const n = L[0] + L[1] + L[2] + L[3], H2 = LOT/2; Bd = Bd || [0, 0, 0, 0];
  if (n === 0){ const zx = !(Bd[2] || Bd[3]) || Bd[0] || Bd[1];   // (a post on its own: along whichever line has a building on it, x first)
    const [ip, im] = zx ? [0, 1] : [2, 3];
    return { kind: 'post', runs: [[zx ? PI/2 : 0, Bd[im] ? -WALL_REACH : -1.35, Bd[ip] ? WALL_REACH : 1.35]], ja: !!Bd[im], jb: !!Bd[ip] }; }
  if (n === 1){ const k = L.indexOf(1), [a, b] = SIDES4[k], o = k ^ 1; return { kind: 'end', runs: [[Math.atan2(a, b), Bd[o] ? -WALL_REACH : -1.2, H2]], ja: !!Bd[o] }; }
  if (n === 2 && L[0] && L[1]) return { kind: 'line', runs: [[PI/2, -H2, H2]] };
  if (n === 2 && L[2] && L[3]) return { kind: 'line', runs: [[0, -H2, H2]] };
  return { kind: n === 2 ? 'corner' : n === 3 ? 'tee' : 'cross', runs: SIDES4.map(([a, b], k) => L[k] ? [Math.atan2(a, b), -WALL_T/2, H2] : null).filter(Boolean) };
}
// a gate's opening along its run: from za to zb in the run's frame, a pillar at each side that has no gate next door (jm, jp: there is one)
function gateSpan(c){
  const L = c.wallN || [0, 0, 0, 0], Gn = c.wallG || [0, 0, 0, 0], k = wallRuns(L, c.wallB);
  if (k.kind !== 'post' && k.kind !== 'end' && k.kind !== 'line') return null;
  const [ry, z0, z1] = k.runs[0], dx = Math.round(Math.sin(ry)), dz = Math.round(Math.cos(ry));
  const ip = SIDES4.findIndex(([a, b]) => a === dx && b === dz), im = SIDES4.findIndex(([a, b]) => a === -dx && b === -dz);
  const jp = !!(L[ip] && Gn[ip]), jm = !!(L[im] && Gn[im]);
  return { ry, z0, z1, za: jm ? z0 : z0 + GATE_PIL, zb: jp ? z1 : z1 - GATE_PIL, jm, jp, kind: k.kind };
}
const wallGateable = c => { const k = wallRuns(c.wallN || [0, 0, 0, 0], c.wallB).kind; return k === 'post' || k === 'end' || k === 'line'; };

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
// the gate: an opening across nearly the whole plot (sp: gateSpan), GATE_H high; a pillar at each side with no gate next door (with one, the
// opening runs on into it: a wider gate); the wall over it, and the zone's dressing
function wallGate(st, F, y0, h, sp){
  const { za, zb, jm, jp } = sp, zc = (za + zb)/2, gw = zb - za, t = WALL_T + .16, top = y0 + GATE_H, pw = GATE_PIL;
  const pil = st === 'low' ? M.pmPost : st === 'ind' ? M.piSteel : st === 'mid' ? M.pcPlinth : M.plMarble2;
  const sides = []; if (!jm) sides.push([za - pw/2, -1]); if (!jp) sides.push([zb + pw/2, 1]);   // [pillar centre, which way the opening is from it: -1 it's on the +z side]
  for (const [z] of sides) box(pil, F, 0, y0 + h/2 + .03, z, t, h + .06, pw);
  const fill = st === 'low' ? M.pmWood2 : st === 'ind' ? M.piSteel2 : st === 'mid' ? M.pcPanel : M.plGlass;
  if (h > GATE_H + .3) box(fill, F, 0, (top + .26 + y0 + h)/2, zc, st === 'high' ? WALL_T*.5 : WALL_T, y0 + h - top - .26, gw);
  const scanner = (z, mat, gk) => { for (const s of [-1, 1]){ box(st === 'low' ? M.metalDark : st === 'ind' ? M.piDark : st === 'mid' ? M.pcPlinth : M.plGold, F, s*(t/2 + .05), y0 + 1.1, z, .08, .32, .22); box(mat, F, s*(t/2 + .095), y0 + 1.12, z, .01, .2, .15); glow(F, s*(t/2 + .15), y0 + 1.12, z, gk, .8); } };
  if (st === 'low'){
    box(M.pmPost, F, 0, top + .13, zc, t + .04, .26, gw + (jm ? 0 : pw) + (jp ? 0 : pw));
    const cy = Math.min(y0 + h, top + .26) + .16; box(M.pmSolar, F, 0, cy, zc, t + .8, .04, gw + .1, 0, .2, 0); box(M.frame, F, 0, cy - .02, zc, t + .84, .02, gw + .14, 0, .2, 0);
    for (let z = za + .45; z < zb - .2; z += .9) strut(M.pmPost, F, 0, top + .26, z, 0, cy - .03, z, .05);
    if (_wallGreen) for (const [z] of sides) plant(hangKind(), F, t/2 + .02, top + .2, z, rnd(.7, .9), 't', true);
    for (const [z, d] of sides) scanner(z, M.pmBio, 'green');
  } else if (st === 'ind'){
    box(M.piSteel, F, 0, top + .16, zc, t + .1, .32, gw + (jm ? 0 : pw) + (jp ? 0 : pw)); for (const s of [-1, 1]) for (let z = za + .12; z < zb - .1; z += .36) box(M.hazard, F, s*(t/2 + .06), top + .16, z + .09, .02, .14, .17);
    for (const [z] of sides) for (const s of [-1, 1]) cyl(M.metalDark, F, s*(t/2 - .02), y0 + h/2, z + (z < zc ? -1 : 1)*(pw/2 - .06), .07, h);
    for (const [z] of sides) scanner(z, M.piNeon, 'orange');
    box(M.piNeon, F, 0, top + .4, zc, .14, .14, .14); glow(F, 0, top + .44, zc, 'amber', 1.0);
    for (let z = za + .3; z < zb - .2; z += .6) box(M.piDark, F, 0, top + .01, z, t - .1, .02, .3);   // the rail of a shutter rolled up
  } else if (st === 'mid'){
    box(M.pcPanel2, F, 0, top + .15, zc, t + .06, .3, gw + (jm ? 0 : pw) + (jp ? 0 : pw)); for (const s of [-1, 1]) box(M.pcLed, F, s*(t/2 + .04), top + .15, zc, .02, .07, gw - .1);
    box(M.pcLed, F, 0, top - .005, zc, t - .1, .02, gw - .1);   // a strip of light along the underside
    for (const [z] of sides) scanner(z, M.pcLed, 'cyan');
  } else {
    box(M.plGold, F, 0, top + .08, zc, t + .04, .14, gw + (jm ? 0 : pw) + (jp ? 0 : pw));
    if (!jm && !jp){ const r = gw/2 - .02, ar = Math.min(.7, r*.5); for (let k = 0; k < 10; k++){ const a0 = PI*k/10, a1 = PI*(k + 1)/10;
      strut(M.plGold, F, 0, top - ar + Math.sin(a0)*ar, zc - Math.cos(a0)*r, 0, top - ar + Math.sin(a1)*ar, zc - Math.cos(a1)*r, .07); } }
    else for (let z = za + .2; z < zb - .1; z += .4) box(M.plGold, F, 0, top - .1, z, .06, .2, .03);   // a fringe of filigree along a wide one
    for (const [z] of sides) box(M.plGold, F, 0, y0 + h + .08, z, t + .06, .1, pw + .06);
    box(M.plGold, F, 0, top + .44, zc, .1, .36, .6); box(M.plHolo, F, .055, top + .44, zc, .01, .28, .52); box(M.plHolo, F, -.055, top + .44, zc, .01, .28, .52); glow(F, 0, top + .44, zc, 'platinum', 1.2);
    for (const [z] of sides) scanner(z, M.plHolo, 'platinum');
  }
}
let _wallGreen = true;   // (the plot's greenery setting, while its wall is built)
// The ground of a wall's plot: no street, the plot paved edge to edge in the zone's way, with what holds the wall up on either side of it
// (timber braces in a gravel garden, steel shores on a concrete apron, lit fins on slate, a stepped marble plinth). A band of it at each
// side's outer edge is left clear to walk, and a gate's opening has a path through it, with nothing in the way.
M.pgGravel = toon(0x8b8270); M.pgStone = toon(0xa69e8a); M.igConc = toon(0x6c7074); M.igConc2 = toon(0x606468); M.cgSlate = toon(0x384252); M.cgSlate2 = toon(0x45506a);
function wallGround(st, P, c, runs, sp, h){
  const H2 = LOT/2, green = _wallGreen, y = CURB;
  const base = st === 'low' ? M.pgGravel : st === 'ind' ? M.igConc : st === 'mid' ? M.cgSlate : M.plMarble2;
  box(base, P, 0, y/2, 0, LOT + .01, y, LOT + .01);
  // the surface: stepping stones and gravel; poured slabs with hazard edging; slate tiles; marble with gold inlay
  if (st === 'low'){ for (let k = 0; k < 18; k++) box(M.pgStone, P, rnd(-H2 + .2, H2 - .2), y + .006, rnd(-H2 + .2, H2 - .2), rnd(.2, .38), .012, rnd(.16, .3), rnd(0, PI));
    for (const [a, b] of SIDES4) box(M.pmPost, P, a*(H2 - .05), y + .02, b*(H2 - .05), a ? .08 : LOT, .04, b ? .08 : LOT);
    if (green) for (let k = 0; k < 5; k++) floorBig(P, rnd(-H2 + .3, H2 - .3), y + .02, rnd(-H2 + .3, H2 - .3), rnd(.7, 1)); }
  else if (st === 'ind'){ const n = 4, s = LOT/n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) box((a + b) % 2 ? M.igConc : M.igConc2, P, (a - (n - 1)/2)*s, y + .005, (b - (n - 1)/2)*s, s - .04, .01, s - .04);
    for (const [a, b] of SIDES4) for (let t = -H2 + .15; t < H2; t += .4) box(M.hazard, P, a*(H2 - .07) + (a ? 0 : t), y + .012, b*(H2 - .07) + (b ? 0 : t), a ? .1 : .2, .012, b ? .1 : .2); }
  else if (st === 'mid'){ const n = 7, s = LOT/n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (!chance(.04)) box(chance(.5) ? M.cgSlate2 : M.cgSlate, P, (a - (n - 1)/2)*s, y + .006, (b - (n - 1)/2)*s, s - .04, .012, s - .04);
    for (const [a, b] of SIDES4) box(M.pcLed, P, a*(H2 - .04), y + .01, b*(H2 - .04), a ? .03 : LOT - .1, .012, b ? .03 : LOT - .1); }
  else { const n = 5, s = LOT/n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) box((a + b) % 2 ? M.plMarble : M.plMarble2, P, (a - (n - 1)/2)*s, y + .006, (b - (n - 1)/2)*s, s - .03, .012, s - .03);
    for (let k = 1; k < n; k++){ const q = -H2 + k*s; box(M.plGold, P, q, y + .013, 0, .02, .006, LOT - .1); box(M.plGold, P, 0, y + .013, q, LOT - .1, .006, .02); } }
  // what holds the wall up: along each run, on both sides (a gate's run: its path instead)
  const t = WALL_T;
  for (const [ry, z0, z1] of runs){
    const F = under(P, T(0, 0, 0, ry)), len = z1 - z0, zc = (z0 + z1)/2;
    const gate = sp && Math.abs(ry - sp.ry) < 1e-6;
    if (gate){   // the way through: a floor across the plot the width of the opening, in the zone's way (never a road)
      const zc = (sp.za + sp.zb)/2, gw = sp.zb - sp.za - .1;
      if (st === 'ind'){   // steel deck plates on the concrete, drain grates set in them, hazard chevrons only at the threshold
        const nx = 6, nz = Math.max(2, Math.round(gw/.62)), dxp = (LOT - .2)/nx, dzp = gw/nz;
        for (let a = 0; a < nx; a++) for (let q = 0; q < nz; q++) box((a + q) % 2 ? M.piSteel : M.metal, F, -H2 + .1 + (a + .5)*dxp, y + .012, sp.za + .05 + (q + .5)*dzp, dxp - .05, .012, dzp - .05);
        for (const x of [-1.25, 1.25]) for (let q = 0; q < nz; q += 2){ const zq = sp.za + .05 + (q + .5)*dzp; box(M.piDark, F, x, y + .02, zq, .5, .006, .34); for (let k = -2; k <= 2; k++) box(M.piSteel2, F, x + k*.09, y + .024, zq, .03, .006, .32); }
        for (const x of [-(WALL_T/2 + .12), WALL_T/2 + .12]) for (let z = sp.za + .12; z < sp.zb - .1; z += .3) box(M.hazard, F, x, y + .022, z, .06, .006, .15);
      } else {
        const pm = st === 'low' ? M.pgStone : st === 'mid' ? M.cgSlate2 : M.plMarble;
        box(pm, F, 0, y + .016, zc, LOT - .2, .01, gw);
        if (st === 'mid') for (const z of [sp.za + .06, sp.zb - .06]) box(M.pcLed, F, 0, y + .022, z, LOT - .3, .008, .03);
      }
      continue;
    }
    const mods = []; for (let k = Math.ceil(z0/WALL_MOD - .5); (k + .5)*WALL_MOD < z1; k++){ const z = (k + .5)*WALL_MOD; if (z > z0 + .1 && z < z1 - .1 && Math.abs(z) > .6) mods.push(z); }
    const alt = z => Math.round(z/WALL_MOD - .5) % 2 === 0;
    if (st === 'low'){
      box(M.pmPost, F, 0, y + .05, zc, t + .3, .1, len);   // a timber footing
      for (const z of mods) if (alt(z)) { const s = -1; box(M.pmPost, F, s*(t/2 + .85), y + .05, z, .22, .1, .22); strut(M.pmWood2, F, s*(t/2 + .85), y + .08, z, s*(t/2 + .02), y + Math.min(h*.6, 1.7), z, .1); }
      for (const z of mods) if (!alt(z) && green) plant(pick(['bush', 'fern', 'g_fern3']), F, -(t/2 + .55), y + .02, z, rnd(.55, .75));
    } else if (st === 'ind'){
      box(M.piDark, F, 0, y + .06, zc, t + .36, .12, len); for (const s of [-1, 1]) box(M.hazard, F, s*(t/2 + .17), y + .125, zc, .04, .01, len - .04);
      for (const z of mods) if (alt(z)) for (const s of [-1, 1]){ box(M.piDark, F, s*(t/2 + .9), y + .03, z, .34, .06, .34); strut(M.piSteel, F, s*(t/2 + .9), y + .06, z, s*(t/2 + .03), y + Math.min(h*.7, 2.2), z, .11);
        strut(M.piSteel2, F, s*(t/2 + .9), y + .08, z, s*(t/2 + .03), y + .5, z, .06); }
    } else if (st === 'mid'){
      box(M.pcPlinth, F, 0, y + .06, zc, t + .4, .12, len);
      for (const z of mods) if (alt(z)) for (const s of [-1, 1]){ box(M.pcPlinth, F, s*(t/2 + .3), y + .55, z, .6, 1.1, .08); box(M.pcLed, F, s*(t/2 + .6), y + .55, z, .02, 1.0, .09); box(M.pcPanel2, F, s*(t/2 + .3), y + 1.12, z, .64, .04, .12); }
    } else {
      for (const s of [-1, 1]){ box(M.plMarble2, F, s*(t/2 + .35), y + .06, zc, .44, .12, len); box(M.plMarble, F, s*(t/2 + .26), y + .17, zc, .26, .1, len); box(M.plGold, F, s*(t/2 + .57), y + .125, zc, .02, .01, len); }
      for (const z of mods) if (alt(z)) for (const s of [-1, 1]){ box(M.plMarble2, F, s*(t/2 + .14), y + Math.min(h*.45, 1.6), z, .26, Math.min(h*.9, 3.2), .3); box(M.plGold, F, s*(t/2 + .14), y + Math.min(h*.9, 3.2) + .05, z, .3, .05, .34); }
      if (green) for (const z of mods) if (!alt(z)) plant('bonsai', F, (chance(.5) ? 1 : -1)*(t/2 + .4), y + .22, z, rnd(.55, .7));
    }
  }
}
// the wall on a plot (cellBody): the ground, its runs from the joining neighbors, posts at the joints and free ends, a gate if it is one
function buildPerimeter(c){
  const w = c.wall; if (!w || !WALL_ZONES[w.zone]) return;
  R = mulberry32(hash('wall', c.i, c.j, w.seed || 0));
  const st = w.zone, P = T(c.x, 0, c.z), y0 = CURB, h = wallTopOf(c) - CURB; _wallGreen = c.green !== 'none';
  const { kind, runs, ja, jb } = wallRuns(c.wallN || [0, 0, 0, 0], c.wallB);
  const sp = w.gate && h > GATE_H + .3 ? gateSpan(c) : null;
  wallGround(st, P, c, runs, sp, h);
  for (const [ry, z0, z1] of runs){
    const F = under(P, T(0, 0, 0, ry));
    if (sp){ if (!sp.jm && sp.za - GATE_PIL > z0 + .05) wallBody(st, F, z0, sp.za - GATE_PIL, y0, h, _wallGreen); if (!sp.jp && sp.zb + GATE_PIL < z1 - .05) wallBody(st, F, sp.zb + GATE_PIL, z1, y0, h, _wallGreen); wallGate(st, F, y0, h, sp); }
    else { wallBody(st, F, z0, z1, y0, h, _wallGreen);
      if ((kind === 'post' || kind === 'end') && !ja) wallPost(st, F, z0 + .1, y0, h);
      if (kind === 'post' && !jb) wallPost(st, F, z1 - .1, y0, h); }
  }
  if (kind === 'corner' || kind === 'tee' || kind === 'cross') wallPost(st, P, 0, y0, h);
  _wallGreen = true;
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
  refresh([c, ...wallNbrs(c)]); dropView(old);   // (the walls next door too: a gate beside a gate opens into it)
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
  else { nb = wallNbrs(c); delete c.wall; delete c.wallN; delete c.wallG; delete c.wallB; delete c.wallCap; }
  refresh([c, ...nb]);
  startAnim(c, 'remove', c.wall ? wallTopOf(c) - .05 : CURB - .05, top + 1.2, zone, LOT, old);
  perimDirty();
}
// the hover outline in Perimeter mode
function perimHover(t){
  const col = ZONES[PERIM] ? ZONES[PERIM].col : '#e3d6bd'; hoverMat.color.set(col); hoverFill.visible = false; hoverStrip.visible = false;
  if (t.type === 'wallNew'){ const x = t.i*LOT, z = t.j*LOT; hover.position.set(x, CURB + WALL_BASE/2, z); hover.scale.set(LOT*.72, WALL_BASE, LOT*.72); }
  else if (t.type === 'wallUp'){ const c = t.c, top = wallTopOf(c); hover.position.set(c.x, top + WALL_TIER/2, c.z); hover.scale.set(LOT*.72, WALL_TIER, LOT*.72); }
  else { const c = t.c; wallPrep(c); const g = gateSpan(c) || { ry: wallRuns(c.wallN || [0, 0, 0, 0], c.wallB).runs[0][0], za: -1.3, zb: 1.3 }, ax = Math.abs(Math.sin(g.ry)) > .5, zc = (g.za + g.zb)/2, w = g.zb - g.za;
    hover.position.set(c.x + Math.sin(g.ry)*zc, CURB + GATE_H/2, c.z + Math.cos(g.ry)*zc); hover.scale.set(ax ? w : WALL_T + .3, GATE_H, ax ? WALL_T + .3 : w); }
  hover.visible = true;
}

// The gates' scans, after the references: a scanner head under each gate's lintel throws a beam down over the way through, its foot sweeping
// out in front of the gate and back through it to the other side, with a bright line where it meets the floor; the opening's edges are
// traced in neon and a curtain of light hangs in it. Each zone its own: residential a soft green biometric wash dotted with light,
// industrial a hard amber security fan of laser lines, commercial a cyan grid like the turnstiles' readers, luxury a gold and violet holo
// shimmer. The gates along one line sweep together, so a wide gate reads as one. All of it is one mesh with one material for the whole city
// (one draw), moved and drawn on the graphics card from the shared clock: nothing per frame here. Dim at rest, bright while people are at the
// gate (looked at once a second, from the people already being moved).
let perimDirty = () => {}, PERIM_G = null;   // (PERIM_G: the gates' scans, for checks)
if (!self.IN_RECIPE_WORKER){
  const ZI = { low: 0, ind: 1, mid: 2, high: 3 }, NV = 40;   // (vertices a gate: curtain 4, beam 8, floor line 4, edge strips 24)
  // (made the first time a gate needs it, after the material registry has closed: the plot worker makes no such material, and the two lists must match: matreg.js)
  let mat = null; const makeMat = () => { const m = new THREE.ShaderMaterial({
    uniforms: { time: FOL_UNI.time },
    vertexShader: `attribute vec2 aN; attribute float aM; attribute vec3 aR; attribute vec3 aG; uniform float time;
      varying vec3 vR; varying vec3 vG; varying float vS;
      void main(){ vR = aR; vG = aG; float z = mod(aG.x, 4.0), sp = z < .5 ? .55 : z < 1.5 ? .9 : z < 2.5 ? .7 : .45;
        float sw = sin(time*sp + aG.y*6.2832); vS = sw;
        vec3 p = position + vec3(aN.x, 0.0, aN.y)*aM*sw*1.45;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.0); }`,
    fragmentShader: `uniform float time; varying vec3 vR; varying vec3 vG; varying float vS;
      void main(){
        float k = vR.x, u = vR.y, v = vR.z, zf = vG.x, z = mod(zf, 4.0), ea = mod(floor(zf/4.0), 2.0), eb = floor(zf/8.0), act = vG.z, t = time + vG.y*7.0;
        vec3 col = z < .5 ? vec3(.4, 1.0, .55) : z < 1.5 ? vec3(1.0, .5, .12) : z < 2.5 ? vec3(.35, .82, 1.0) : mix(vec3(1.0, .78, .4), vec3(.8, .55, 1.0), .5 + .5*sin(t*.8 + u*4.0));
        float a = 0.0;
        if (k < .5){   // the curtain in the opening
          float e = mix(1.0, smoothstep(0.0, .04, u), ea)*mix(1.0, smoothstep(1.0, .96, u), eb)*smoothstep(1.0, .88, v);
          float pat = z < .5 ? step(.82, fract(u*9.0 + sin(v*7.0 + t)*.3))*.5 : z < 1.5 ? step(.9, fract(v*8.0 - t*1.5)) : z < 2.5 ? max(step(.92, fract(u*10.0)), step(.92, fract(v*10.0 - t*.7))) : pow(.5 + .5*sin(v*22.0 - t*2.5 + sin(u*7.0)*1.4), 5.0);
          a = (.06 + .5*pat)*e;
        } else if (k < 1.5){   // the beam: brighter toward its foot, fading toward the edges of its width
          float e = smoothstep(0.0, .18, u)*smoothstep(1.0, .82, u);
          float pat = z < .5 ? .6 + .4*step(.9, fract(u*13.0 + v*5.0 - t*.6)) : z < 1.5 ? .35 + .9*step(.78, fract(v*14.0 + t*3.0)) : z < 2.5 ? .45 + .7*max(step(.9, fract(u*12.0)), step(.9, fract(v*10.0 + t))) : .5 + .6*pow(.5 + .5*sin(u*18.0 + v*9.0 - t*3.0), 4.0);
          a = .3*pat*e*(.25 + .75*(1.0 - v));
        } else if (k < 2.5){   // where it meets the floor
          float line = exp(-pow((v - .5)/.16, 2.0)), e = smoothstep(0.0, .1, u)*smoothstep(1.0, .9, u);
          float pat = z < .5 ? .5 + .6*step(.6, fract(u*16.0)) : z < 1.5 ? .4 + .8*step(.5, fract(u*12.0 - t*4.0)) : z < 2.5 ? .6 + .6*step(.85, fract(u*20.0)) : .6 + .5*sin(u*40.0 + t*6.0);
          a = .9*line*pat*e;
        } else {   // the opening's edges, traced in neon, breathing
          a = .55 + .3*sin(t*2.2) + .15*step(.5, fract(u*3.0 - t*.5));
          a *= .8;
        }
        gl_FragColor = vec4(col*a*(.16 + .84*act), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }); m.userData.colorOnly = true; return m; };
  const G = { mesh: null, sig: '', gates: [], at: new Map(), act: null };
  function rebuild(){
    const list = [];
    for (const c of cells.values()) if (c.wall && c.wall.gate && !c.mega && wallTopOf(c) - CURB > GATE_H + .3){ const sp = gateSpan(c); if (sp) list.push({ c, sp }); }
    const sig = list.map(g => g.c.i + ',' + g.c.j + ':' + g.c.wall.zone + ':' + g.sp.ry.toFixed(2) + ':' + g.sp.za.toFixed(2) + ':' + g.sp.zb.toFixed(2)).join('|');
    if (sig === G.sig) return; G.sig = sig;
    if (G.mesh){ scene.remove(G.mesh); G.mesh.geometry.dispose(); G.mesh = null; }
    G.gates = list; G.at = new Map(list.map((g, k) => [ckey(g.c.i, g.c.j), k]));
    if (!list.length) return;
    const n = list.length, P = new Float32Array(n*NV*3), AN = new Float32Array(n*NV*2), AM = new Float32Array(n*NV), AR = new Float32Array(n*NV*3), AG = new Float32Array(n*NV*3), I = [];
    let vi = 0;
    list.forEach((g, gk) => {
      const sp = g.sp, ax = Math.sin(sp.ry), az = Math.cos(sp.ry), nx = az, nz = -ax;   // (A: along the wall; N: across it, the way through)
      const zc = (sp.za + sp.zb)/2, hw = (sp.zb - sp.za)/2, ox = g.c.x + ax*zc, oz = g.c.z + az*zc, H = GATE_H - .06, y0 = CURB + .03;
      // the gates of one line sweep together (a wide gate is one beam): seeded by the line, not the plot
      const line = Math.abs(ax) > .5 ? 'x' + g.c.j : 'z' + g.c.i, sd = (hash('gateline', line) % 1000)/1000;
      const zcode = (ZI[g.c.wall.zone] || 0) + (sp.jm ? 0 : 4) + (sp.jp ? 0 : 8);
      const V = (a, y, nOff, m, kind, u, v) => { P.set([ox + ax*a + nx*nOff, y, oz + az*a + nz*nOff], vi*3); AN.set([nx, nz], vi*2); AM[vi] = m; AR.set([kind, u, v], vi*3); AG.set([zcode, sd, 0], vi*3); return vi++; };
      const quad = (q) => { I.push(q[0], q[1], q[2], q[0], q[2], q[3]); };
      // the curtain in the opening
      quad([V(-hw, y0, 0, 0, 0, 0, 0), V(hw, y0, 0, 0, 0, 1, 0), V(hw, y0 + H, 0, 0, 0, 1, 1), V(-hw, y0 + H, 0, 0, 0, 0, 1)]);
      // the beam: two sheets from the scanner head under the lintel down to the floor either side of its sweeping foot
      const fw = .32, top = hw*.35, hy = y0 + H - .12;
      for (const d of [-fw, fw]) quad([V(-hw*.96, y0 + .01, d, 1, 1, 0, 0), V(hw*.96, y0 + .01, d, 1, 1, 1, 0), V(top, hy, 0, 0, 1, .82, 1), V(-top, hy, 0, 0, 1, .18, 1)]);
      // its line on the floor
      quad([V(-hw, y0 + .015, -fw*1.15, 1, 2, 0, 0), V(hw, y0 + .015, -fw*1.15, 1, 2, 1, 0), V(hw, y0 + .015, fw*1.15, 1, 2, 1, 1), V(-hw, y0 + .015, fw*1.15, 1, 2, 0, 1)]);
      // the opening's edges on both faces of the wall: the lintel's underside edge, and each side that has a pillar
      const th = .05, off = WALL_T/2 + .1;
      for (const s of [-1, 1]){
        quad([V(-hw, y0 + H - th, s*off, 0, 3, 0, 0), V(hw, y0 + H - th, s*off, 0, 3, 1, 0), V(hw, y0 + H, s*off, 0, 3, 1, 1), V(-hw, y0 + H, s*off, 0, 3, 0, 1)]);
        for (const [e, x] of [[!sp.jm, -hw], [!sp.jp, hw]]){ const x0 = x + (x < 0 ? 0 : -th), x1 = x0 + th;
          if (e) quad([V(x0, y0, s*off, 0, 3, 0, 0), V(x1, y0, s*off, 0, 3, 1, 0), V(x1, y0 + H, s*off, 0, 3, 1, 1), V(x0, y0 + H, s*off, 0, 3, 0, 1)]);
          else { for (let q = 0; q < 4; q++) V(0, -50, 0, 0, 3, 0, 0); } }   // (no pillar on that side: its strip is left out, its vertices unused)
      }
      while (vi < (gk + 1)*NV) V(0, -50, 0, 0, 3, 0, 0);
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('aN', new THREE.BufferAttribute(AN, 2)); geo.setAttribute('aM', new THREE.BufferAttribute(AM, 1)); geo.setAttribute('aR', new THREE.BufferAttribute(AR, 3));
    G.act = new THREE.BufferAttribute(AG, 3); G.act.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aG', G.act); geo.setIndex(I);
    geo.computeBoundingSphere(); geo.boundingSphere.radius += 2;   // (the beams' feet sweep out up to a metre and a half)
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
      const g = G.gates[k]; if (Math.hypot(p.x - g.c.x, p.z - g.c.z) < 1.9) near.add(k); }
    let ch = false;
    for (let k = 0; k < G.gates.length; k++){
      let h = hold.get(k) || 0; h = near.has(k) || G.force ? 3 : Math.max(0, h - 1); hold.set(k, h);   // (G.force: every gate lit, for checks)
      const a = h > 0 ? 1 : 0; if (G.act.array[k*NV*3 + 2] !== a){ for (let q = 0; q < NV; q++) G.act.array[(k*NV + q)*3 + 2] = a; ch = true; }
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
