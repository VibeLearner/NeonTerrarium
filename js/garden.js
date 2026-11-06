// Neon Terrarium: gardens (Nov 2026, sandbox only). Lawn plots that touch side to side form a garden; a garden of three or more grows into a park in the
// Central Park manner: a loose network of cream stone paths reaching most of it (straight promenades and winding side paths, gates where it meets a
// street), with lawns, tree groves and flower beds in the spaces between, benches and lanterns along the paths, and the bigger pieces (gazebos, a
// greenhouse, a koi deck, misters, a grotto) set off the paths at the end of a short spur. From six plots a pond can open, always on the plot just laid.
// Palette B ("Sunlit greenhouse"): lush greens, cream stone and copper wood by day, warm gold light on deep teal water at night.
// The spec: the "Garden system spec" doc (Nov 6), with the owner's follow-ups (Central Park paths, water only where you lay it, sprite tree tops).
//
// How it works:
//  - gardenUpdate() runs with every rebuild (world.js refreshTodo, like the parks). It finds each garden by a flood fill (from a plot, walk to every
//    lawn plot sharing an edge with it), gives each new garden plot its piece and its paths, checks every piece still has its reason, and works out
//    what each plot needs to know of its neighbours to be drawn (which sides are water, where its paths run, a bridge, an island). Plots whose drawing
//    changed are rebuilt.
//  - A plot's garden is c.gd: { s: its seed, p: its piece, w: 1 when water, o: 1 for an open lawn kept for picnics, m: the sides its paths want to run
//    to (bit k for SIDES4[k]) } (saved with the city) plus gd.x, what it needs of its neighbours (worked out each time, not saved). gd is part of the
//    plot's recipe (recipe.js), so the plot worker draws it too.
//  - Paths are autotiled: each plot's path runs from the middle of each side it wants, to a hub near its middle. A path is drawn on a side only when
//    the plot on the other side wants it too (or the other side is a street: a gate; or the pond: a lookout or a bridge), so the paths always meet.
//    A new plot takes up every path pointing at it, so paths carry on across the garden as it grows.
//  - Every chance is rolled once, from the plot's own seed (made when the plot became lawn), so it lands the same way every time it is worked out.
//    Turning a plot to something else and back to lawn gives it a new seed: a new roll.
//  - Pieces never reshuffle: a piece stays until its plot goes or its reason does (a gazebo's pond shrinking, say).
'use strict';

/* ---------- palette B ---------- */
// (made when the script loads, in the same order in the page and the plot worker: matreg.js)
const GM = {
  stone: toon(0xe8dfcc), stone2: toon(0xd6cbb4), pebble: toon(0xbfb5a0), pebbleDark: toon(0x8f887a),
  wood: toon(0xb9774a), woodDark: toon(0x8a5434), roof: toon(0x9a5a36), verdigris: toon(0x5e9a86),
  leaf: toon(0x5aa83c), leaf2: toon(0x3d7f2a), leaf3: toon(0x7cc24f), trunk: toon(0x6a4a32), lip: toon(0x5f8f3e),
  coral: toon(0xff8f6b), cream: toon(0xfff1d6), iris: toon(0x8f6ad8), blossom: toon(0xffc2ae),
  // the water (palette C, "Stream", owner Nov 6): three depths, no light of its own (it goes dark at night like real water and shows the lanterns' reflections)
  water: toon(0x5d9294), bowl: toon(0x33657a),
  pad: toon(0x4f9a3a), solar: toon(0x24363a, { em: 0x9ff0d0, kind: 'window' }),
  koi: toon(0xff8a3a, { em: 0x5a2206, kind: 'trim' }), koiW: toon(0xf6f0e6, { em: 0x3a3020, kind: 'trim' }),
  edge: toon(0x5a3e18, { em: 0xf2b14e, kind: 'trim' }),         // the soft copper-gold neon round the ponds and along the promenades
  bio: toon(0x2e6a52, { em: 0x5fe0b0, kind: 'trim' }),          // glowing moss and caps: teal-green, so the night garden isn't all warm
  fiber: toon(0x5a3e18, { em: 0xffd27a, kind: 'window' }),      // the fiber-optic strands in the arches' vines
  glass: toon(0x86b8b0),                                        // greenhouse panes (clear; glass2 smoky green; no light of their own)
  teal: toon(0x3f9a9a), gold: toon(0xd9963a), hammock: toon(0xf2e6cc),
  birch: toon(0xe2dccd), palmBark: toon(0x9a7a52),
  waterMid: toon(0x33657a), waterDeep: toon(0x22495a), glint: toon(0xc2dcda),
  reflect: toon(0x22495a, { em: 0xffd890, kind: 'bulb' }), reflect2: toon(0x22495a, { em: 0xc89850, kind: 'bulb' }),   // (unused since the ponds show the lamps' real reflections, Nov 6: kept so the materials keep their order)
  glass2: toon(0x5f8f80), stripW: toon(0x5a4e3a, { em: 0xfff1d6, kind: 'trim' }),   // smoky glass; a warm white strip light
};

/* ---------- the trees' sway ---------- */
// On a computer the trunks bend in the wind (TREE_SWAY_GLSL, sprites.js) and carry their crowns: the bark is drawn live (not folded into the
// buildings' one material, not kept in the static cache), every frame, a few hundred triangles a tree. On a touch screen trees stand still and
// their bark stays static (owner Nov 6: desktop only).
if (!self.IN_RECIPE_WORKER && !(typeof TOUCH !== 'undefined' && TOUCH.on) && typeof TREE_SWAY_GLSL !== 'undefined') for (const m of [GM.trunk, GM.birch, GM.palmBark]){
  m.userData.live = true; m.customProgramCacheKey = () => 'gdbark';
  m.onBeforeCompile = sh => {
    sh.uniforms.gTime = FOL_UNI.time; sh.uniforms.gWind = FOL_UNI.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float gTime; uniform float gWind;' + TREE_SWAY_GLSL)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
{ vec4 gw = modelMatrix * mvPosition; gw.xz += treeSway(gw.xyz, gTime, gWind); mvPosition = viewMatrix * gw; }
gl_Position = projectionMatrix * mvPosition;`);
  };
}

/* ---------- the water ---------- */
// The pond's water, after the coast's sea (coast.js): its color comes from how deep it is (shallow and pale at the banks, darkening toward the middle),
// banded the way pixel art bands a gradient and dithered at the band edges; ripples wobble the bands; the slow swell is lit in flat facets (a coarse
// triangle grid, each facet a little lighter turned toward the sun, a little darker turned away, in a few steps); caustics play over the shallows by day.
// It gives off no light of its own: at night it goes dark with everything else and the lanterns' reflections show on it.
// The depth rides in the surface's height (GD_WATER_Y plus up to GD_WATER_K at the deepest, a few millimetres): one material for every pond, no
// textures. It moves, so it is drawn live (userData.live: not folded into the buildings' one material, not kept in the static cache).
const GD_WATER_Y = .04, GD_WATER_K = .006;
// The rings on the water (the cursor drawn over it, a tap on a phone): each one where it started, when (on the plants' clock, FOL_UNI.time), and how
// strong (from how fast the cursor went). Eight at a time on a computer, four on a phone (GD_RIP.n); the oldest gives way to a new one.
const GD_RIP = { rips: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) }, n: { value: 8 } };
const GD_RIP_LIFE = 2.6;
const GD_WATER_MAT = (() => {
  const m = toon(0x5d9294); m.userData.live = true; m.userData.noCast = true;
  m.customProgramCacheKey = () => 'gdwater';
  m.onBeforeCompile = sh => {
    sh.uniforms.gTime = FOL_UNI.time; sh.uniforms.gLights = LIGHTS_ON; sh.uniforms.gRips = GD_RIP.rips; sh.uniforms.gRipN = GD_RIP.n;
    sh.uniforms.gMir = GD_MIR.tex; sh.uniforms.gMirM = GD_MIR.M; sh.uniforms.gMirOn = GD_MIR.use; sh.uniforms.gMirRes = GD_MIR.res; sh.uniforms.gMirScreen = GD_MIR.scr;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform float gTime; uniform float gLights; uniform vec4 gRips[8]; uniform float gRipN;
uniform sampler2D gMir; uniform mat4 gMirM; uniform float gMirOn; uniform vec2 gMirRes; uniform vec2 gMirScreen;
float gh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float gBayer(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0); return ((a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y)*4.0 + (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y))/16.0; }
float gSwell(vec2 q){ return 0.07*sin(q.x*0.9 + gTime*0.55)*sin(q.y*1.1 - gTime*0.45) + 0.035*sin(q.x*2.3 - q.y*1.7 + gTime*0.9); }
float gCaus(vec2 p){ vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 o = vec2(float(x), float(y)), c = i + o;
    vec2 r = o + vec2(gh(c), gh(c + 7.3))*0.8 + 0.12*sin(gTime*0.5 + 6.28*vec2(gh(c + 3.1), gh(c + 5.7))) - f; float d = dot(r, r);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
  return sqrt(f2) - sqrt(f1); }
// the rings: each a little train of three crests running out from where it started, fading as it spreads and as it ages
float gRings(vec2 p){ float s = 0.0;
  for (int i = 0; i < 8; i++){ if (float(i) >= gRipN) break; vec4 r = gRips[i]; float age = gTime - r.z;
    if (age < 0.0 || age > ${GD_RIP_LIFE.toFixed(1)}) continue;
    float d = length(p - r.xy), x = d - (0.12 + age*0.8);
    if (x > 0.05 || x < -0.62) continue;
    float fade = 1.0 - age/${GD_RIP_LIFE.toFixed(1)};
    s += min(r.w, 1.0)*fade*fade*cos(x*31.4)*smoothstep(-0.62, -0.2, x)*(1.0 - smoothstep(-0.01, 0.05, x))/(1.0 + d*1.2); }
  return s; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 gp = vWP.xz; float gD0 = clamp((vWP.y - ${GD_WATER_Y.toFixed(3)})/${GD_WATER_K.toFixed(4)}, 0.0, 1.0), gDi = gBayer(gl_FragCoord.xy) - 0.5;
vec2 gRip = vec2(sin(gp.x*1.7 + gp.y*0.9 + gTime*0.6), sin(gp.y*1.9 - gp.x*0.7 - gTime*0.5))*0.035;
float gRg = gRings(gp) + gDi*0.05;
// the waves: a long gentle swell rolling in from one side (about two metres between crests, half a metre a second) and a smaller one across it, their crests
// wandering a little; the same everywhere in the world, so they run on from plot to plot. They lift the depth bands as they pass (the shallows breathe),
// light their crests a step, and wash up the banks (gLap)
float gWp = 0.8*sin(gp.x*0.55 + gp.y*0.35 + gTime*0.17) + 0.45*sin(dot(gp, vec2(-0.38, 0.92))*2.1 - gTime*0.6);
float gWv = sin(dot(gp, vec2(0.85, 0.53))*3.6 - gTime*1.55 + gWp);
float gDq = floor((gD0 + gRip.x + gWv*0.02 + gRg*0.05 + gDi*0.09)*5.0 + 0.5)/5.0;
vec3 gE = vec3(0.48, 0.66, 0.64), gS = vec3(0.365, 0.573, 0.58), gM = vec3(0.2, 0.396, 0.478), gDp = vec3(0.133, 0.286, 0.353);
vec3 gW = gDq < 0.2 ? mix(gE, gS, gDq/0.2) : gDq < 0.6 ? mix(gS, gM, (gDq - 0.2)/0.4) : mix(gM, gDp, clamp((gDq - 0.6)/0.4, 0.0, 1.0));
float gC = gCaus(gp*2.2 + gRip*6.0), gCl = gC < 0.07 ? 1.0 : gC < 0.13 ? 0.4 : 0.0;
gW += gCl*(1.0 - smoothstep(0.0, 0.6, gD0 + gDi*0.15))*vec3(0.1, 0.1, 0.07)*(1.0 - gLights);
// the rings' crests a step lighter, their troughs a step darker (two steps each, pixel-art fashion)
gW *= 1.0 + (gRg > 0.24 ? 0.15 : gRg > 0.11 ? 0.065 : gRg < -0.24 ? -0.1 : gRg < -0.11 ? -0.045 : 0.0);
// the swell's crests: thin lighter lines, broken into lengths, gliding across open water (in the shallows they turn into the lapping instead).
// (Broad light and dark areas read as patches, owner Nov 6: only the crest itself is drawn.)
if (gD0 + gDi*0.12 > 0.16 && gWv + gDi*0.05 > 0.93 && sin(dot(gp, vec2(-0.53, 0.85))*1.7 + gTime*0.3 + gWp*2.0) > -0.25) gW *= 1.075;
// the water lapping at the banks: a pale lip that creeps up the shallows and draws back, unevenly along the bank, a darker wet line just past it
// (each crest that reaches a bank pushes the lip up the shallows, then it draws back; it whitens a little as it peaks)
float gLap = 0.12 + 0.07*gWv + 0.02*sin(gTime*2.1 - gp.x*0.6 + gp.y*2.3), gLd = gD0 + gDi*0.04;
if (gLd < gLap) gW = mix(gW, vec3(0.64, 0.8, 0.76), 0.42 + 0.22*max(gWv, 0.0)); else if (gLd < gLap + 0.04) gW *= 0.92;
diffuseColor.rgb = gW;
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ // the swell lit in flat facets: a coarse grid of triangles over it, each lit by the sun as one, in a few steps (calmer in the shallows)
  const float CS = 0.6; vec2 cg = gp/CS, c0 = floor(cg), cf = cg - c0;
  vec2 qa = c0*CS, qb = (cf.x > cf.y ? c0 + vec2(1.0, 0.0) : c0 + vec2(1.0, 1.0))*CS, qc = (cf.x > cf.y ? c0 + vec2(1.0, 1.0) : c0 + vec2(0.0, 1.0))*CS;
  vec3 fa = vec3(qa.x, gSwell(qa), qa.y), fb = vec3(qb.x, gSwell(qb), qb.y), fc = vec3(qc.x, gSwell(qc), qc.y);
  vec3 fn = normalize(cross(fc - fa, fb - fa)); if (fn.y < 0.0) fn = -fn;
  #if NUM_DIR_LIGHTS > 0
  vec3 gL = directionalLights[0].direction, fv = normalize((viewMatrix*vec4(fn, 0.0)).xyz), uv0 = normalize((viewMatrix*vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float fr = (dot(fv, gL) - dot(uv0, gL))*(0.35 + 0.65*gD0) + gDi*0.012;
  diffuseColor.rgb *= fr < -0.06 ? 0.97 : fr > 0.06 ? 1.03 : 1.0;   // (one faint step each way: more read as patches, owner Nov 6)
  #endif
}`);
    // (its pixels marked in the normal image's alpha, which nothing else uses: the composite gives them the wet ground's reflections, strongly, sky.js)
    if (typeof MRT !== 'undefined' && MRT) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\npc_fragNormal.a = 0.5;');
    // the mirror (computers: gardenMirror): the mirrored picture where this point of the surface lies in it, shifted a pixel or so by the swell and
    // the rings, over the water's own color: half of it, more for lights (a third let the water show through a building's reflection, owner Nov 6)
    sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', `if (gMirOn > 0.5){
  vec4 gmc = gMirM*vec4(vWP.x, ${GD_MIR_Y.toFixed(3)}, vWP.z, 1.0); vec2 gmu = gmc.xy/gmc.w;
  gmu += vec2(floor(gWv*1.2 + gRg*3.0 + 0.5), floor(gRg*2.0 + 0.5))/max(gMirRes, gMirScreen);   // (in the frame's own pixels)
  vec4 gm = texture2D(gMir, gmu);
  if (gm.a > 0.5){ float gml = dot(gm.rgb, vec3(0.3, 0.59, 0.11)); gl_FragColor.rgb = mix(gl_FragColor.rgb, gm.rgb, 0.5 + 0.3*smoothstep(0.55, 0.95, gml)); }
}
#include <tonemapping_fragment>`);
  };
  return m;
})();

/* ---------- the rules ---------- */
const GD_PIECES = ['lawn', 'grove', 'tree', 'shrubs', 'flowers', 'birdbath', 'arch', 'gazebo', 'greenhouse', 'koideck', 'misters', 'grotto', 'water'];
const GD_OFF = new Set(['gazebo', 'greenhouse', 'koideck', 'misters', 'grotto']);   // set off the paths: one path at most, a spur leading to it
const GD_SPREAD = .66, GD_SPRING = .4, GD_WATER_MAX = .4;
const gdTier = n => n >= 25 ? 5 : n >= 16 ? 4 : n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0;
const gardenOn = () => !(self.ECON && ECON.on);   // sandbox only: the economy mode keeps its plain lawns
const gdGround = c => !!c && !c.mega && !c.sections.length && !c.wall && c.green === 'grass';
const gdRoll = (gd, ...k) => mulberry32(hash('gd', gd.s, ...k))();
const gdAt = (c, a, b) => cells.get(ckey(c.i + a, c.j + b));
const gdBit = k => 1 << k, gdPop = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const GD_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// what of a garden plot changes how it is drawn (a plot still waiting for its garden draws as a plain lawn, whatever its seed)
const gdSig = gd => gd && gd.p ? JSON.stringify(gd) : '';
const gdKeep = gd => gd && gd.p ? [gd.p, gd.w | 0, gd.o | 0, gd.s, gd.m | 0, gd.b | 0].join() : '';
// a garden plot a new path may run into: not water, not a piece set off the paths, not an arch (its path is straight), not a picnic lawn that has its path already
const gdJoinable = n => !!n && !!n.gd && !!n.gd.p && !n.gd.w && !GD_OFF.has(n.gd.p) && n.gd.p !== 'arch' && !(n.gd.p === 'lawn' && gdPop(n.gd.m | 0) >= 1);
// a plot a gate can open onto: there, and not part of a megastructure
const gdStreet = n => !!n && !n.mega;

// every garden: plot -> { cells, n, wc (water plots), has: count of each piece, gates }
function gdComps(){
  const comp = new Map();
  for (const c of cells.values()){
    if (comp.has(c) || !c.gd) continue;
    const g = { cells: [c], n: 0, wc: 0, has: {}, gates: 0 }, st = [c]; comp.set(c, g);
    while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && !comp.has(n)){ comp.set(n, g); g.cells.push(n); st.push(n); } } }
    g.n = g.cells.length;
    for (const q of g.cells){ if (q.gd.w) g.wc++; if (q.gd.p) g.has[q.gd.p] = (g.has[q.gd.p] || 0) + 1;
      SIDES4.forEach(([a, b], k) => { if ((q.gd.m | 0) & gdBit(k)){ const n = gdAt(q, a, b); if (n && !n.gd && gdStreet(n)) g.gates++; } }); }
  }
  return comp;
}
// the pond a water plot is in (its water plots, by flood fill over water)
function gdPond(c){
  const seen = new Set([c]), st = [c];
  while (st.length){ const q = st.pop(); for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && n.gd.w && !seen.has(n)){ seen.add(n); st.push(n); } } }
  return seen;
}
// whether one of the grass plots round a pond holds a piece
function gdPondHas(pond, piece){
  for (const q of pond) for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (n && n.gd && !n.gd.w && n.gd.p === piece) return true; }
  return false;
}
// the ponds beside a plot: [{ pond, n }]
function gdPondsBy(c){
  const out = [], seen = new Set();
  for (const [a, b] of SIDES4){ const n = gdAt(c, a, b); if (!n || !n.gd || !n.gd.w || seen.has(n)) continue;
    const pond = gdPond(n); for (const q of pond) seen.add(q); out.push({ pond, n: pond.size }); }
  return out;
}
function gdPickW(list, u){ const tot = list.reduce((s, [, w]) => s + w, 0); let r = u*tot; for (const [k, w] of list){ if ((r -= w) <= 0) return k; } return list[list.length - 1][0]; }

// A garden plot getting its piece and its paths (the moment it joins a garden of three or more). In order: does the pond beside it spread onto it (66%);
// does a garden of six or more with no water yet open its pond here (40%); then its paths and its piece.
function gdAssign(c, g, comp){
  const gd = c.gd, tier = gdTier(g.n), u = k => gdRoll(gd, k);
  // what is on each side: v nothing, o another kind of plot, p a garden plot still waiting, g garden grass, w the pond
  const S = SIDES4.map(([a, b]) => { const n = gdAt(c, a, b);
    if (!n) return { t: 'v' }; if (comp.get(n) !== g) return { t: 'o', n }; return { t: !n.gd.p ? 'p' : n.gd.w ? 'w' : 'g', n }; });
  const wet = S.filter(s => s.t === 'w');
  if (wet.length && g.wc + 1 <= GD_WATER_MAX*g.n && u('spread') < GD_SPREAD){ gd.w = 1; gd.p = 'water'; gd.o = 0; gd.m = 0; g.wc++; return; }
  if (g.n >= 6 && !g.wc && u('spring') < GD_SPRING){ gd.w = 1; gd.p = 'water'; gd.o = 0; gd.m = 0; g.wc++; return; }
  // the paths that run into this plot are taken up
  let m = 0;
  S.forEach((s, k) => { if (s.t === 'g' && ((s.n.gd.m | 0) & gdBit(k ^ 1))) m |= gdBit(k); });
  const mand = m;
  // a bigger piece set off the paths: only where at most one path comes in (it becomes the spur leading to it)
  const ponds = gdPondsBy(c), big = ponds.reduce((q, p) => Math.max(q, p.n), 0), off = [];
  if (tier >= 3 && ponds.some(p => p.n >= 4 && !gdPondHas(p.pond, 'gazebo'))) off.push(['gazebo', 4]);
  if (tier >= 4){
    if ((g.has.greenhouse || 0) < Math.floor(g.n/16)) off.push(['greenhouse', 1.2]);
    if (wet.length) off.push(['misters', 1]);
    if (ponds.some(p => p.n >= 6 && !gdPondHas(p.pond, 'koideck'))) off.push(['koideck', 3]);
  }
  if (tier >= 5 && big >= 6 && !g.has.grotto && u('grotto') < .2) off.push(['grotto', 3]);
  const pathy = [0, 1, 2, 3].filter(k => S[k].t === 'g' && (S[k].n.gd.m | 0) && gdJoinable(S[k].n));
  const link = k => { m |= gdBit(k); if (S[k].t === 'g') S[k].n.gd.m = (S[k].n.gd.m | 0) | gdBit(k ^ 1); };
  if (off.length && gdPop(mand) <= 1 && u('struct') < .45){
    const p = gdPickW(off, u('off'));
    if (!m && pathy.length && u('spur') < .6) link(pathy[Math.floor(u('spurk')*pathy.length)]);
    gd.p = p; gd.o = 0; gd.m = m; g.has[p] = (g.has[p] || 0) + 1; return;
  }
  // a path plot, or a stretch of green: joins a path next door (most of the time), else may start one
  if (!m && pathy.length && u('join') < .92) link(pathy[Math.floor(u('joink')*pathy.length)]);
  const canGo = k => S[k].t === 'v' || S[k].t === 'p' || S[k].t === 'w' || (S[k].t === 'g' && gdJoinable(S[k].n));
  if (!m && !pathy.length && u('start') < (g.cells.some(q => q.gd.m) ? .5 : .85)){ const ks = [0, 1, 2, 3].filter(k => canGo(k) && S[k].t !== 'w'); if (ks.length) link(ks[Math.floor(u('startk')*ks.length)]); }
  if (m){
    // carry on: straight ahead most of the time (the promenades), else turn; now and then a branch
    if (gdPop(m) === 1){ const k0 = [0, 1, 2, 3].find(k => m & gdBit(k)), st = k0 ^ 1;
      if (canGo(st) && u('straight') < .8) link(st);
      else if (u('turn') < .8){ const pp = (k0 < 2 ? [2, 3] : [0, 1]).filter(canGo); if (pp.length) link(pp[Math.floor(u('turnk')*pp.length)]); } }
    if (u('branch') < .5){ const fr = [0, 1, 2, 3].filter(k => !(m & gdBit(k)) && canGo(k) && S[k].t !== 'w'); if (fr.length) link(fr[Math.floor(u('branchk')*fr.length)]); }
    // gates onto the streets round the garden: a few for each garden, more as it grows
    S.forEach((s, k) => { if (s.t === 'o' && gdStreet(s.n) && g.gates < 1 + Math.floor(g.n/10) && u('gate' + k) < .7){ m |= gdBit(k); g.gates++; } });
  }
  const deg = gdPop(m), L = [];
  if (deg <= 1) L.push(['lawn', 3]);
  L.push(['grove', deg ? 3 : 4.5], ['flowers', 2]);
  if (tier >= 2 && deg >= 2 && (g.has.birdbath || 0) < 1 + Math.floor(g.n/14)) L.push(['birdbath', 1.2]);
  if (tier >= 3 && (m === 3 || m === 12)) L.push(['arch', 1.5]);
  const p = gdPickW(L, u('piece'));
  gd.p = p; gd.o = p === 'lawn' ? 1 : 0; gd.m = m; g.has[p] = (g.has[p] || 0) + 1;
}
// Does a piece set off the paths still have its reason? (one that lost it goes back to a plain grove of trees)
function gdValid(c){
  switch (c.gd.p){
    case 'misters': return SIDES4.some(([a, b]) => { const n = gdAt(c, a, b); return n && n.gd && n.gd.w; });
    case 'gazebo': return gdPondsBy(c).some(p => p.n >= 4);
    case 'koideck': case 'grotto': return gdPondsBy(c).some(p => p.n >= 6);
  }
  return true;
}

// The pass itself: returns the plots to build again.
function gardenUpdate(){
  const before = new Map(), keep = new Map();
  for (const c of cells.values()) if (c.gd){ before.set(c, gdSig(c.gd)); keep.set(c, gdKeep(c.gd)); }
  const changed = [];
  if (!gardenOn()){ for (const c of before.keys()){ c.gd = null; if (before.get(c)) changed.push(c); } GD_FX.dirty = true; return changed; }
  // a plot that's no longer an empty lawn has no garden; a new lawn plot gets its seed (and waits for a garden)
  for (const c of cells.values()){
    if (c.gd && !gdGround(c)) c.gd = null;
    else if (!c.gd && gdGround(c)) c.gd = { s: (Math.random()*2147483647) | 0, p: null };
  }
  let comp = gdComps();
  // out of the gardens: a plot whose garden is under three. Joined to a garden only by a corner, it keeps (or gets) a tree or shrubs; otherwise
  // it goes back to waiting, its pond, paths and piece gone.
  const diag = c => GD_CORNERS.some(([a, b]) => { const n = gdAt(c, a, b); return n && n.gd && comp.get(n) !== comp.get(c) && comp.get(n).n >= 3; });
  for (const c of cells.values()){
    if (!c.gd || comp.get(c).n >= 3) continue;
    const gd = c.gd; gd.w = 0; gd.o = 0; gd.m = 0;
    if (diag(c)){ if (gd.p !== 'tree' && gd.p !== 'shrubs') gd.p = gdRoll(gd, 'small') < .55 ? 'tree' : 'shrubs'; }
    else gd.p = null;
  }
  comp = gdComps();
  // new garden plots get their pieces, one at a time (each sees what the ones before it made)
  const fresh = [...cells.values()].filter(c => c.gd && !c.gd.p && comp.get(c).n >= 3).sort((p, q) => p.i - q.i || p.j - q.j);
  let assigned = false;
  for (const c of fresh){ gdAssign(c, comp.get(c), comp); assigned = true; }
  // every piece set off the paths checked for its reason (pond sizes are as they now stand)
  for (const c of cells.values()){
    if (!c.gd || !c.gd.p || c.gd.w || comp.get(c).n < 3) continue;
    if (!gdValid(c)){ c.gd.p = 'grove'; c.gd.o = 0; }
  }
  // the bridges: kept where they still span, new ones where the water leaves people a long way round
  gdPlanBridges(comp);
  // what each plot needs of its neighbours to be drawn: the water first (its bridges depend on the paths beside it), then the grass
  const pondN = new Map(), info = new Map();
  const nbAt = (c, k) => { const [a, b] = SIDES4[k], n = gdAt(c, a, b); return n && comp.get(n) === comp.get(c) && n.gd.p ? n : null; };
  for (const c of cells.values()){
    const gd = c.gd; if (!gd || !gd.p){ if (gd) delete gd.x; continue; }
    const g = comp.get(c), x = { t: gdTier(g.n) };
    x.e = [0, 1, 2, 3].map(k => { const n = nbAt(c, k); return n ? (n.gd.w ? 2 : 1) : 0; });
    if (g.n < 3) x.dg = 1;
    info.set(c, x);
    if (!gd.w) continue;
    if (!pondN.has(c)){ const pond = gdPond(c); for (const q of pond) pondN.set(q, pond.size); }
    x.pd = pondN.get(c);
    x.cw = GD_CORNERS.map(([a, b]) => { const n = gdAt(c, a, b); return x.e[a > 0 ? 0 : 1] === 2 && x.e[b > 0 ? 2 : 3] === 2 && !(n && n.gd && n.gd.w) ? 1 : 0; });
    // part of a bridge (or an island's walkway): its axis, and where along it this plot is (the rails arch over the whole span)
    if (gd.b){ x.br = (gd.b - 1) % 2 + 1; if (gd.b > 2) x.bw = 1;
      const [a, b] = x.br === 1 ? [1, 0] : [0, 1]; let bi = 0, q = gdAt(c, -a, -b);
      while (q && q.gd && q.gd.w && q.gd.b === gd.b){ bi++; q = gdAt(q, -a, -b); }
      let bn = bi + 1; q = gdAt(c, a, b); while (q && q.gd && q.gd.w && q.gd.b === gd.b){ bn++; q = gdAt(q, a, b); }
      x.bi = bi; x.bn = bn; }
  }
  for (const c of cells.values()){
    const gd = c.gd, x = info.get(c); if (!x){ continue; }
    if (!gd.w){
      x.pd = gdPondsBy(c).reduce((m, p) => Math.max(m, p.n), 0);
      x.wet = x.e.map(v => v === 2 ? 1 : 0);
      if (x.t >= 4 && x.e.every(v => v === 2)) x.isl = 1;   // ringed by water: an island gazebo stands on it (its own piece comes back if the ring breaks)
      // where its paths are drawn: 1 to a garden path, 2 a gate onto the street, 3 a lookout at the pond's edge, 4 onto a bridge
      x.pa = [0, 1, 2, 3].map(k => { if (!((gd.m | 0) & gdBit(k))) return 0; const [a, b] = SIDES4[k], n = gdAt(c, a, b);
        if (!n) return 0;
        if (comp.get(n) !== comp.get(c)) return n.gd ? 0 : gdStreet(n) ? 2 : 0;
        if (!n.gd.p) return 0;
        if (n.gd.w){ const nx = info.get(n); return nx && nx.br === (k < 2 ? 1 : 2) ? 4 : 3; }
        return ((n.gd.m | 0) & gdBit(k ^ 1)) ? 1 : 0; });
      // an arch stands over a straight path: if the path is no longer straight, it goes (a grove grows there instead)
      if (gd.p === 'arch'){ const on = x.pa.map(v => v ? 1 : 0).join(''); if (on !== '1100' && on !== '0011'){ gd.p = 'grove'; } }
    }
    gd.x = x;
  }
  for (const c of cells.values()){
    if (gdSig(c.gd) !== (before.get(c) || '')) changed.push(c);
    if (gdKeep(c.gd) !== (keep.get(c) || '')) assigned = true;
  }
  // (a piece rolled or changed is saved with the city, so a reload shows the same garden)
  if (assigned && !self.IN_RECIPE_WORKER && typeof save === 'function') setTimeout(() => { try { save(); } catch (e) {} }, 0);
  GD_FX.dirty = true;
  return changed;
}
// The bridges. A bridge is a straight run of water plots marked with its axis (gd.b: 1 along x, 2 along z; 3 and 4 the same for an island's walkway),
// landing on garden grass at both ends. They are planned from how people would walk inside the garden (the streets round it never count: the park
// always has its own crossings), treating water as uncrossable except by the bridges already there:
//  1. a bridge stays while it still spans (water all along, grass at both ends); one that no longer does is taken down;
//  2. every straight crossing of the water between two grass plots is a candidate. One is needed when walking round from one end to the other is more
//     than GD_DETOUR times as far as going straight across (or there is no way round at all);
//  3. of the needed ones, the shortest crossing is built first (so narrow pockets of a pond get short bridges, and a long bridge only goes where the
//     water is wide all the way), then the walks are worked out again with it, and so on. A second bridge alongside the first is never needed (the
//     first is right there), so a wide pond gets one bridge, and a long one more only where people would still walk a long way round;
//  4. a bridge lands only where a path can come in (not on a piece set off the paths, an arch or a picnic lawn with its path): if the best crossing's
//     landing is taken, the next best is used. The landings' paths are run onto the bridge.
// An island's gazebo is reached the same way, by a straight walkway that looks unlike a bridge.
const GD_DETOUR = 3;
const gdAxisStep = v => (v - 1) % 2 ? [0, 1] : [1, 0];   // (a bridge mark's direction: 1 and 3 along x, 2 and 4 along z)
function gdPlanBridges(comp){
  const gardens = new Set(); for (const g of comp.values()) if (g.n >= 3 && g.cells.some(q => q.gd.w)) gardens.add(g);
  for (const g of gardens){
    const isW = q => !!q && comp.get(q) === g && !!q.gd.w, isG = q => !!q && comp.get(q) === g && !!q.gd.p && !q.gd.w;
    const isle = q => isG(q) && gdTier(g.n) >= 4 && SIDES4.every(([a, b]) => isW(gdAt(q, a, b)));
    // 1. the bridges there now
    for (const q of g.cells) if (q.gd.b && !q.gd.w) q.gd.b = 0;
    const seen = new Set();
    for (const c of g.cells){
      if (!c.gd.w || !c.gd.b || seen.has(c)) continue;
      const v = c.gd.b, [a, b] = gdAxisStep(v);
      let s0 = c; for (let n = gdAt(s0, -a, -b); isW(n) && n.gd.b === v; n = gdAt(s0, -a, -b)) s0 = n;
      const run = [s0]; for (let n = gdAt(s0, a, b); isW(n) && n.gd.b === v; n = gdAt(n, a, b)) run.push(n);
      for (const q of run) seen.add(q);
      if (!(isG(gdAt(s0, -a, -b)) && isG(gdAt(run[run.length - 1], a, b)))) for (const q of run) q.gd.b = 0;
    }
    // 2. walking inside the garden: over the grass, and along the bridges (on a bridge only along it)
    const along = (q, a, b) => { const [x, z] = gdAxisStep(q.gd.b); return (x && a) || (z && b); };
    const steps = q => { const out = [];
      for (const [a, b] of SIDES4){ const n = gdAt(q, a, b); if (!n || comp.get(n) !== g || !n.gd.p) continue;
        if (q.gd.w && !along(q, a, b)) continue;
        if (n.gd.w && (!n.gd.b || !along(n, a, b))) continue;
        out.push(n); }
      return out; };
    const walk = from => { const d = new Map([[from, 0]]), st = [from]; for (let i = 0; i < st.length; i++){ const q = st[i]; for (const n of steps(q)) if (!d.has(n)){ d.set(n, d.get(q) + 1); st.push(n); } } return d; };
    // 3. the crossings
    const cands = [];
    for (const A of g.cells){ if (!isG(A)) continue;
      for (const [a, b, ax] of [[1, 0, 1], [0, 1, 2]]){ const run = []; let n = gdAt(A, a, b);
        while (isW(n) && !n.gd.b){ run.push(n); n = gdAt(n, a, b); }
        if (run.length && isG(n)) cands.push({ A, B: n, run, ax, kA: ax === 1 ? 0 : 2 }); } }
    const land = (q, k) => isle(q) || !!((q.gd.m | 0) & gdBit(k)) || gdJoinable(q);
    for (let it = 0; it < 40; it++){
      const memo = new Map(), D = q => memo.get(q) || (memo.set(q, walk(q)), memo.get(q));
      let best = null, bs = null;
      for (const cd of cands){
        if (cd.run.some(q => q.gd.b) || !land(cd.A, cd.kA) || !land(cd.B, cd.kA ^ 1)) continue;
        const d = D(cd.A).get(cd.B), need = d === undefined ? Infinity : d/(cd.run.length + 1);
        if (need <= GD_DETOUR) continue;
        const sc = [cd.run.length, -Math.min(need, 1e6), gdRoll(cd.A.gd, 'bridge', cd.ax)];
        if (!bs || sc[0] < bs[0] || (sc[0] === bs[0] && (sc[1] < bs[1] || (sc[1] === bs[1] && sc[2] < bs[2])))){ best = cd; bs = sc; }
      }
      if (!best) break;
      const v = best.ax + (isle(best.A) || isle(best.B) ? 2 : 0);
      for (const q of best.run) q.gd.b = v;
      best.A.gd.m = (best.A.gd.m | 0) | gdBit(best.kA); best.B.gd.m = (best.B.gd.m | 0) | gdBit(best.kA ^ 1);
    }
  }
}
// saving: [piece, water, open, seed, paths, bridge] or 0
const gdSave = c => c.gd && c.gd.p ? [c.gd.p, c.gd.w | 0, c.gd.o | 0, c.gd.s, c.gd.m | 0, c.gd.b | 0] : 0;
function gdLoad(c, v){
  if (!Array.isArray(v) || c.green !== 'grass') return;
  const p = GD_PIECES.includes(v[0]) ? v[0] : 'grove';   // (a piece from before the paths: a grove in its place)
  c.gd = { s: v[3] | 0, p, w: v[1] ? 1 : 0, o: v[2] ? 1 : 0, m: (v[4] | 0) & 15 };
  if (c.gd.p === 'water' && !c.gd.w) c.gd.p = 'lawn';
  if (c.gd.w){ c.gd.p = 'water'; c.gd.m = 0; if (v[5] >= 1 && v[5] <= 4) c.gd.b = v[5] | 0; }
}

/* ---------- trees: real trunks and limbs, sprite crowns ---------- */
// The crown is a tree-top sprite (spritegen_trees.js) drawn as four copies crossed round its middle, so from whichever way the camera turns it reads
// full. Its sway phase is picked so it never thins out when zoomed out (the plant shader drops a share of the plants far out: a tree losing its crown
// would leave a bare trunk). Kept generic so other builders can plant trees too (the luxury streets, later).
function canopy(kind, P, x, y, z, k = 1, n = 4, at = y){
  if (NO_GREEN || !FOL_LIST[kind]) return;
  const s = SPR.size[kind], scale = new THREE.Matrix4().makeScale(s[0]/PX*k, s[1]/PX*k, 1);
  // (the phase: its fraction (fract(ph*5.17) over .55) keeps it from thinning out zoomed out, see vFade in the plant shader; its whole part is the
  //  height (tenths) where the crown meets its trunk, at: the plant shader carries the crown by the trunk's sway there, TREE_SWAY_GLSL)
  irand(0, 30);   // (still drawn, so everything rolled after it lands as before)
  const yaw = rnd(0, PI), shade = rnd(.9, 1.04), ph = (Math.max(0, Math.min(30, Math.round(at*10))) + rnd(.56, .96))/5.17;
  for (let q = 0; q < n; q++) FOL_LIST[kind].push({ m: under(P, T(x, y, z, yaw + q*PI/n)).multiply(scale), an: SPR.anchor[kind], flip: q % 2 ? -1 : 1, shade: shade*(q % 2 ? .95 : 1), phase: ph, fixed: 1 });
}
// the kinds of tree: the crown sprite, trunk height and crown scale ranges, limbs (each with a smaller crown of its own), bark
const TREE_SP = {
  round:    { k: 'tc_round', h: [1.0, 1.3], ck: [.85, 1.0], limbs: [1, 3], sub: 'tc_puff' },
  oval:     { k: 'tc_oval', h: [.8, 1.0], ck: [.85, 1.0], limbs: [0, 1], sub: 'tc_puff' },
  willow:   { k: 'tc_willow', h: [1.15, 1.35], ck: [.9, 1.05], limbs: [0, 1], sub: 'tc_puff', low: 1 },
  pine:     { k: 'tc_pine', h: [.35, .5], ck: [.95, 1.15], limbs: [0, 0], straight: 1 },
  cypress:  { k: 'tc_cypress', h: [.25, .35], ck: [.9, 1.1], limbs: [0, 0], straight: 1 },
  blossom:  { k: 'tc_blossom', h: [.9, 1.15], ck: [.8, .95], limbs: [1, 2] },
  maple:    { k: 'tc_maple', h: [.95, 1.2], ck: [.85, 1.0], limbs: [1, 2] },
  palm:     { k: 'tc_palm', h: [1.7, 2.1], ck: [.85, 1.0], palm: 1 },
  airy:     { k: 'tc_airy', h: [1.0, 1.3], ck: [.85, 1.0], limbs: [1, 2], bark: 'birch' },
  wisteria: { k: 'tc_wisteria', h: [.95, 1.15], ck: [.85, 1.0], limbs: [1, 2], low: 1 },
};
const GD_TREES = [['round', 3], ['oval', 2], ['airy', 1.4], ['blossom', 1.2], ['maple', 1], ['willow', 1], ['pine', .8], ['wisteria', .7], ['cypress', .6], ['palm', .5]];
const gdSpecies = () => gdPickW(GD_TREES, R());
function treeAt(P, x, z, s = 1, sp = 'round'){
  const D = TREE_SP[sp] || TREE_SP.round, h = rnd(D.h[0], D.h[1])*s, ck = rnd(D.ck[0], D.ck[1])*s, ch = SPR.size[D.k][1]/PX*ck;
  const bark = D.bark === 'birch' ? GM.birch : D.palm ? GM.palmBark : GM.trunk;
  const lean = rnd(0, TAU), ca = Math.cos(lean), sa = Math.sin(lean);
  if (D.palm){   // a slim trunk curving up and over in five pieces, the fronds at its top
    let px = x, py = .05, pz = z;
    for (let q = 1; q <= 5; q++){ const t = q/5, nx = x + ca*.35*s*t*t, nz = z + sa*.35*s*t*t, ny = .05 + h*t; strut(bark, P, px, py, pz, nx, ny, nz, .085*s*(1 - t*.3)); px = nx; py = ny; pz = nz; }
    canopy(D.k, P, px, py + ch*.12, pz, ck, 4, py); return;
  }
  const lv = D.straight ? 0 : rnd(.04, .12)*s, mx = x + ca*lv*.4, mz = z + sa*lv*.4, tx = x + ca*lv, tz = z + sa*lv;
  strut(bark, P, x, .05, z, mx, h*.55, mz, .14*s); strut(bark, P, mx, h*.55, mz, tx, h, tz, .1*s);
  for (let q = 0; q < 3; q++){ const a = lean + q*TAU/3 + rnd(-.3, .3); strut(bark, P, x, .14*s, z, x + Math.cos(a)*.17*s, .05, z + Math.sin(a)*.17*s, .06*s); }   // root flare
  canopy(D.k, P, tx, h + ch*(D.low ? .18 : D.straight ? .45 : .3), tz, ck, 4, h);
  const nl = D.limbs ? irand(D.limbs[0], D.limbs[1]) : 0;
  for (let q = 0; q < nl; q++){
    const a = lean + (q + 1)*TAU/(nl + 1) + rnd(-.4, .4), r = rnd(.32, .5)*s*(D.fan ? 1.35 : 1), ly = h*rnd(.55, .8), ey = h*rnd(.85, 1.02);
    const ex = tx + Math.cos(a)*r, ez = tz + Math.sin(a)*r, sub = D.sub || D.k, sk = ck*rnd(.5, .62);
    strut(bark, P, x + (tx - x)*ly/h, ly, z + (tz - z)*ly/h, ex, ey, ez, .065*s);
    canopy(sub, P, ex, ey + SPR.size[sub][1]/PX*sk*.25, ez, sk, 4, ey);
  }
}

/* ---------- drawing ---------- */
// A garden plot, drawn in its own frame P (the plot's middle, the lawn at y about .06). Everything here comes from c.gd (and gd.x), never from
// the plots around: the plot worker draws it from the recipe alone. People walk wherever nothing stands between ankle and head height
// (people.js), so: paths, decks, bridge planks and landings are kept under .14 (walked on); rims, rails, posts, planters and trunks stand in the band
// (walked round).
const GD_PW = .84;   // path width
// a piece set off the paths: where it stands, and how far out its spur stops (from the side it comes in by)
function gdOffSpot(gd, x){
  const k = x.wet ? x.wet.indexOf(1) : -1, [a, b] = k >= 0 ? SIDES4[k] : [0, 0];
  switch (gd.p){
    case 'gazebo': return { x: a*.45, z: b*.45, r: 1.12 };
    case 'koideck': return { x: a*.85, z: b*.85, r: .1 };
    case 'misters': return { x: a*1.0, z: b*1.0, r: .95 };
    case 'greenhouse': return { x: 0, z: 0, r: 1.55 };
    case 'grotto': return { x: 0, z: 0, r: 1.45 };
  }
  return { x: 0, z: 0, r: 1.1 };
}
function gardenTile(c, P){
  const gd = c.gd, x = gd.x || { e: [0, 0, 0, 0], t: 1 };
  R = mulberry32(hash('garden', c.i, c.j, gd.s));
  if (gd.w){ gdWater(P, gd, x); return; }
  lawn(P, 4);
  const pa = x.pa || [0, 0, 0, 0], ks = [0, 1, 2, 3].filter(k => pa[k]), off = GD_OFF.has(gd.p) && !x.isl;
  const pts = [], taken = [], wd = GD_PW;
  const pathD = (px, pz) => { let d = 9; for (const [qx, qz] of pts){ const e = Math.hypot(px - qx, pz - qz); if (e < d) d = e; } return d - wd/2; };
  const free = (r, x0 = 1.55) => { for (let t = 0; t < 50; t++){ const px = rnd(-x0, x0), pz = rnd(-x0, x0);
    if (pathD(px, pz) > r + .06 && taken.every(([tx, tz, tr]) => Math.hypot(px - tx, pz - tz) > tr + r)){ taken.push([px, pz, r]); return [px, pz]; } } return null; };
  // ---- the paths ----
  const straight = ks.length === 2 && (ks[0] ^ 1) === ks[1];
  let hx = 0, hz = 0, promenade = false;
  if (straight){ if (gd.p !== 'arch' && chance(.5)){ const lat = pick([-1, 1])*rnd(.25, .42); if (ks[0] < 2) hz = lat; else hx = lat; } else promenade = true; }
  else if (ks.length){ hx = rnd(-.2, .2); hz = rnd(-.2, .2); }
  const os = off ? gdOffSpot(gd, x) : x.isl ? { x: 0, z: 0, r: 1.15 } : null;
  for (const k of ks){
    const [a, b] = SIDES4[k], ex = a*LOT/2, ez = b*LOT/2;
    let end = [hx, hz], cx = a*.95, cz = b*.95;
    if (os){ const dx = ex - os.x, dz = ez - os.z, d = Math.hypot(dx, dz) || 1; end = [os.x + dx/d*os.r, os.z + dz/d*os.r]; cx = (ex + end[0])/2; cz = (ez + end[1])/2; }
    gdPathArm(P, ex, ez, cx, cz, end[0], end[1], wd, promenade, pts);
    if (pa[k] === 2) gdGate(P, a, b, wd);
    if (pa[k] === 3){ const E = under(P, T(ex, 0, ez, Math.atan2(a, b)));   // a lookout at the pond's edge: a round landing, often a bench facing the water
      put(U.cyl16, GM.stone, under(E, T(0, .063, -.55, 0, 1.0, .012, .8))); taken.push([a*1.35, b*1.35, .5]);
      if (chance(.7)){ gdBench(E, 0, -.78, 0, []); taken.push([a*1.1, b*1.1, .4]); } }
  }
  if (ks.length && !os){ put(U.cyl16, GM.stone, under(P, T(hx, .064, hz, 0, wd*1.3, .012, wd*1.3))); pts.push([hx, hz]); }
  // ---- what stands along the paths: a lantern or two, now and then a bench facing the path ----
  const armPt = (k, t) => { const [a, b] = SIDES4[k]; return [a*LOT/2*(1 - t) + hx*t, b*LOT/2*(1 - t) + hz*t]; };
  if (ks.length && !os){
    const nl = 1 + (ks.length >= 3 || chance(.3) ? 1 : 0);
    for (let q = 0; q < nl; q++){ const k = ks[(q + irand(0, 3)) % ks.length], [ax, az] = armPt(k, rnd(.3, .55)), [a, b] = SIDES4[k], s = pick([-1, 1]);
      const lx = ax + (b ? s : 0)*(wd/2 + .22), lz = az + (a ? s : 0)*(wd/2 + .22);
      if (taken.every(([tx, tz, tr]) => Math.hypot(lx - tx, lz - tz) > tr + .15)){ gdLamp(P, lx, lz, rnd(.9, 1.05), []); taken.push([lx, lz, .15]); } }
    if (gd.p !== 'lawn' && chance(.55)){ const k = pick(ks), [ax, az] = armPt(k, rnd(.25, .6)), [a, b] = SIDES4[k], s = pick([-1, 1]);
      const bx = ax + (b ? s : 0)*(wd/2 + .4), bz = az + (a ? s : 0)*(wd/2 + .4);
      if (taken.every(([tx, tz, tr]) => Math.hypot(bx - tx, bz - tz) > tr + .4)){ gdBench(P, bx, bz, Math.atan2(ax - bx, az - bz), []); taken.push([bx, bz, .42]); } }
  }
  // ---- the piece ----
  if (x.isl){ gdGazebo(P, 0, 0, taken, true); }
  else switch (gd.p){
    case 'tree': { const sp = free(.5, .6); if (sp) treeAt(P, sp[0], sp[1], rnd(.9, 1.1), gdSpecies()); break; }
    case 'shrubs': { const sp = free(.4, .6); if (sp) treeAt(P, sp[0], sp[1], rnd(.7, .85), pick(['round', 'oval', 'airy'])); for (let k = 0; k < 4; k++){ const q = free(.22); if (q) plant(pick(['bush', 'bushFlower', 'fern', 'g_fern2']), P, q[0], .06, q[1], rnd(.6, .85)); } break; }
    case 'grove': { const lead = gdSpecies(), n = ks.length ? irand(2, 3) : irand(3, 5);
      for (let k = 0; k < n; k++){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.15), chance(.65) ? lead : gdSpecies()); }
      for (let k = 0; k < 3; k++){ const q = free(.22); if (q) plant(pick(['bush', 'fern', 'g_fern2', 'bushFlower']), P, q[0], .06, q[1], rnd(.6, .8)); }
      gdBio(P, 2, free); break; }
    case 'flowers': { for (let k = 0; k < irand(2, 3); k++){ const q = free(.55); if (q) gdBed(P, q[0], q[1], rnd(.5, .75)); }
      if (chance(.5)){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.8, 1), pick(['blossom', 'wisteria', 'round', 'maple'])); } gdBio(P, 2, free); break; }
    case 'lawn': { for (const q of lawnSpots(c, P)) taken.push(q);
      if (chance(.6)){ const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.9, 1.15), gdSpecies()); } if (chance(.5)) gdBio(P, 2, free); break; }
    case 'birdbath': { const plaza = ks.length >= 2, at = plaza ? [hx, hz] : free(.7) || [0, 0];
      if (plaza) put(U.cyl16, GM.stone2, under(P, T(at[0], .062, at[1], 0, 1.9, .01, 1.9)));
      gdBirdbath(P, at[0], at[1]); taken.push([at[0], at[1], plaza ? .95 : .7]);
      const sp = free(.55); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.05), gdSpecies()); break; }
    case 'arch': gdArch(P, ks[0] >= 2, taken); { const sp = free(.5); if (sp) treeAt(P, sp[0], sp[1], rnd(.8, 1), pick(['round', 'blossom', 'oval'])); } break;
    case 'gazebo': gdGazebo(P, os.x, os.z, taken, false); break;
    case 'greenhouse': gdGreenhouse(P, taken, ks.length ? ks[0] : -1); break;
    case 'koideck': gdKoiDeck(P, x, taken); break;
    case 'misters': gdMisters(P, x, taken); break;
    case 'grotto': gdGrotto(P, x, taken, ks.length ? ks[0] : -1); break;
  }
  if (off && chance(.6)){ const sp = free(.5); if (sp) treeAt(P, sp[0], sp[1], rnd(.85, 1.05), gdSpecies()); }
  // edge dressing: reeds and flowers along a side that meets the water (clear of the paths)
  if (x.wet) x.wet.forEach((w, k) => { if (!w) return; const [a, b] = SIDES4[k], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
    for (let t = -1.6; t <= 1.6; t += .55){ const tt = t + rnd(-.15, .15), dd = rnd(.2, .35), wx = a*(LOT/2 - dd) + (b ? tt*b : 0), wz = b*(LOT/2 - dd) - (a ? tt*a : 0);
      if (chance(.6) && pathD(wx, wz) > .15) plant(chance(.5) ? 'g_fern3' : 'bushFlower', E, tt, .06, -dd, rnd(.55, .75)); } });
  // the lawn: the same short grass as any lawn, clear of the paths and what stands on it
  const n = 20, st = LOT/n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    const gx = -LOT/2 + (i + .5 + rnd(-.2, .2))*st, gz = -LOT/2 + (j + .5 + rnd(-.2, .2))*st;
    if (pathD(gx, gz) < .08 || taken.some(([cx, cz, r]) => (gx - cx)**2 + (gz - cz)**2 < r*r*.7)) continue;
    plant('gt0', P, gx, .06, gz, rnd(.24, .28));
  }
}
// one arm of a plot's paths: from the middle of a side (square on to it, so it meets the next plot's path) curving in to (hx, hz); cream paving slabs
// with pebble kerbs, or a soft gold line along a straight promenade. Its middle line goes into pts (what keeps the grass and pieces off it).
function gdPathArm(P, ex, ez, cx, cz, hx, hz, wd, promenade, pts){
  const n = 10, Q = []; for (let k = 0; k <= n; k++){ const t = k/n, u = 1 - t; Q.push([u*u*ex + 2*u*t*cx + t*t*hx, u*u*ez + 2*u*t*cz + t*t*hz]); }
  for (let k = 0; k < n; k++){
    const [ax, az] = Q[k], [bx, bz] = Q[k + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || .01, ry = Math.atan2(dx, dz), mx = (ax + bx)/2, mz = (az + bz)/2, nx = dz/len, nz = -dx/len;
    box(k % 3 === 1 ? GM.stone2 : GM.stone, P, mx, .064, mz, wd, .012, len + .03, ry);
    for (const s of [-1, 1]) box(promenade ? GM.edge : GM.pebble, P, mx + nx*s*(wd/2 + .02), .068, mz + nz*s*(wd/2 + .02), promenade ? .025 : .05, promenade ? .012 : .02, len + .03, ry);
  }
  for (const q of Q) pts.push(q);
}
// a gate where a path meets the street: two cream pillars, a lantern on each
function gdGate(P, a, b, wd){
  const E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  for (const s of [-1, 1]){ const gx = s*(wd/2 + .18);
    cyl(GM.stone2, E, gx, .4, -.14, .08, .8); box(GM.stone, E, gx, .82, -.14, .2, .05, .2);
    KEEP_LIGHT = true; box(M.bulb, E, gx, .9, -.14, .08, .09, .08); glow(E, gx, .9, -.14, 'warm', 1.3); KEEP_LIGHT = false;
    put(U.cone, GM.roof, under(E, T(gx, .99, -.14, 0, .18, .09, .18))); }
}
// a bench of copper wood on cream stone legs, facing ry (two seats)
function gdBench(P, x, z, ry, clear){
  const Pb = under(P, T(x, .05, z, ry));
  box(GM.wood, Pb, 0, .14, 0, .56, .04, .16); box(GM.wood, Pb, 0, .27, -.07, .56, .14, .03);
  for (const sx of [-.23, .23]) box(GM.stone, Pb, sx, .07, 0, .05, .14, .15);
  for (const sx of [-.13, .13]) spotAt(Pb, sx, .16, 0, 'seat', null, [0, 1]);
  clear.push([x, z, .42]);
}
// a garden lantern: a cream post, a copper cap, a warm light
function gdLamp(P, x, z, h, clear){
  cyl(GM.stone, P, x, .06, z, .07, .08); cyl(GM.stone2, P, x, h/2, z, .03, h);
  KEEP_LIGHT = true; box(M.bulb, P, x, h + .07, z, .1, .11, .1); glow(P, x, h + .07, z, 'warm', 1.7); KEEP_LIGHT = false;
  put(U.cone, GM.roof, under(P, T(x, h + .18, z, 0, .2, .1, .2)));
  clear.push([x, z, .12]);
}
// a flower bed: a low stone kerb round iris, coral and cream flowers
function gdBed(P, bx, bz, w){
  for (let q = 0; q < 10; q++){ const t = q*TAU/10; box(GM.stone2, P, bx + Math.cos(t)*w*.5, .08, bz + Math.sin(t)*w*.4, .14, .05, .06, -t); }
  for (let q = 0; q < 7; q++){ const fx = bx + rnd(-.4, .4)*w, fz = bz + rnd(-.3, .3)*w;
    cyl(GM.leaf2, P, fx, .12, fz, .015, .12); blob(pick([GM.coral, GM.coral, GM.cream, GM.iris]), P, fx, .2 + rnd(0, .08), fz, rnd(.05, .08)); }
  plant(pick(['bushFlower', 'g_flowers']), P, bx, .06, bz, rnd(.6, .8));
}
// glowing caps and moss, a few at the foot of things: teal-green at night
function gdBio(P, n, free){
  for (let k = 0; k < n; k++){ const q = free ? free(.15) : [rnd(-1.5, 1.5), rnd(-1.5, 1.5)]; if (!q) continue; const [x, z] = q;
    for (let p = 0; p < 3; p++){ const ox = x + rnd(-.1, .1), oz = z + rnd(-.1, .1); cyl(GM.stone2, P, ox, .09, oz, .008, .06); sph(GM.bio, P, ox, .13, oz, rnd(.025, .04), .6); } }
}
// a birdbath at (x, z): a stone pedestal and bowl, a ring of coral, teal and gold mosaic round its rim, water in the bowl; flowers round its foot
function gdBirdbath(P, x, z){
  put(U.cyl16, GM.stone2, under(P, T(x, .08, z, 0, .5, .08, .5)));
  cyl(GM.stone, P, x, .35, z, .09, .5); put(U.cyl16, GM.stone, under(P, T(x, .62, z, 0, .62, .08, .62)));
  put(U.cyl16, GM.bowl, under(P, T(x, .665, z, 0, .5, .01, .5)));
  const tiles = [GM.coral, GM.teal, GM.gold, GM.cream];
  for (let k = 0; k < 16; k++){ const a = k*TAU/16; box(tiles[k % 4], P, x + Math.cos(a)*.29, .665, z + Math.sin(a)*.29, .07, .02, .04, -a); }
  for (let k = 0; k < 4; k++) box(tiles[(k + 1) % 4], P, x + (k % 2 ? .092 : 0)*(k > 1 ? -1 : 1), .3, z + (k % 2 ? 0 : .092)*(k > 1 ? -1 : 1), .04, .12, .04, k*PI/2);
  for (let k = 0; k < 6; k++){ const a = k*TAU/6 + rnd(-.2, .2), r = rnd(.42, .5); blob(pick([GM.coral, GM.cream, GM.iris]), P, x + Math.cos(a)*r, .14, z + Math.sin(a)*r, rnd(.06, .09)); }
  // its light: a little lantern on a brass stem rising from the middle of the bowl, the glow at the lantern (it sat in the water itself and lit the
  // bowl from inside, the halo cutting through the stone: owner Nov 6)
  cyl(GM.gold, P, x, .78, z, .012, .22); box(GM.woodDark, P, x, .9, z, .07, .015, .07);
  KEEP_LIGHT = true; box(M.bulb, P, x, .94, z, .05, .07, .05); glow(P, x, .95, z, 'warm', .55); KEEP_LIGHT = false;
  put(U.cone, GM.roof, under(P, T(x, 1.0, z, 0, .1, .05, .1)));
}
// a vine-covered arch walkway over a straight path: four arches, fiber-optic strands glowing in the vines and blossom
function gdArch(P, alongZ, taken){
  const F = under(P, T(0, 0, 0, alongZ ? 0 : PI/2)), hw = GD_PW/2 + .14, top = 1.35;
  for (const t of [-1.35, -.45, .45, 1.35]){
    for (const s of [-1, 1]) cyl(GM.woodDark, F, s*hw, top*.4, t, .03, top*.8);
    const pts = []; for (let k = 0; k <= 6; k++){ const a = PI - k*PI/6; pts.push([Math.cos(a)*hw, top*.8 + Math.sin(a)*.38]); }
    for (let k = 0; k < 6; k++) strut(GM.woodDark, F, pts[k][0], pts[k][1], t, pts[k + 1][0], pts[k + 1][1], t, .045);
    // its greenery: leafy and flowering clumps along the arch, ivy hanging from the top (sprites, like the rest of the garden's plants)
    for (let k = 0; k <= 6; k++){ plant(pick(['bush', 'bush', 'bushFlower', 'bushFlower', 'fern']), F, pts[k][0], pts[k][1] - .08, t + rnd(-.06, .06), rnd(.4, .52), 'c');
      if (k % 2) box(GM.fiber, F, pts[k][0], pts[k][1] - .06, t + rnd(-.08, .08), .02, .02, .02); }
    for (const k of [2, 4]) if (chance(.6)) plant(pick(['h_ivy', 'h_vine3', 'h_curtain1']), F, pts[k][0]*.8, pts[k][1] + .02, t, rnd(.28, .36), 't');
    for (const s of [-1, 1]) if (chance(.6)) plant(pick(['pothos', 'vines']), F, s*hw*.85, top*.9, t, rnd(.55, .75), 't', true);
  }
  for (const t of [-.9, .9]) glow(F, 0, top*1.05, t, 'warm', 1.1);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++){ const px = s*rnd(.75, .95), pz = rnd(-1.5, 1.5); plant(pick(['bushFlower', 'g_fern3', 'bush']), F, px, .06, pz, rnd(.55, .75)); }
  for (const s of [-1, 1]) for (const t of [-1.35, -.45, .45, 1.35]) taken.push(alongZ ? [s*hw, t, .12] : [t, -s*hw, .12]);
}
// a gazebo: a round stone floor, six cream posts, low copper rails with two ways in, a copper roof with a verdigris band, a lantern hanging inside,
// a ring of seats (island: the same, on a plot ringed by water)
function gdGazebo(P, x, z, clear, island){
  const r = .85, ry = rnd(0, PI/3);
  put(U.cyl16, GM.stone, under(P, T(x, .06, z, 0, 2*r + .25, .08, 2*r + .25)));
  put(U.cyl16, GM.edge, under(P, T(x, .055, z, 0, 2*r + .32, .02, 2*r + .32)));
  const post = k => { const a = ry + k*TAU/6; return [x + Math.cos(a)*r, z + Math.sin(a)*r]; };
  for (let k = 0; k < 6; k++){ const [px, pz] = post(k); cyl(GM.cream, P, px, .78, pz, .04, 1.4); }
  for (let k = 0; k < 6; k++){ if (k === 0 || k === 3) continue;   // two ways in, across from each other
    const [ax, az] = post(k), [bx, bz] = post(k + 1);
    strut(GM.wood, P, ax, .34, az, bx, .34, bz, .035); strut(GM.wood, P, ax, .14, az, bx, .14, bz, .03);
    const mx = (ax + bx)/2, mz = (az + bz)/2, ix = x + (mx - x)*.82, iz = z + (mz - z)*.82;
    box(GM.wood, P, ix, .14, iz, .5, .04, .16, -Math.atan2(mz - z, mx - x) + PI/2);
    spotAt(P, ix, .16, iz, 'seat', null, [x - ix, z - iz]);
  }
  put(U.cone, GM.roof, under(P, T(x, 1.75, z, ry, 2*r + .55, .7, 2*r + .55)));
  put(U.cyl16, GM.verdigris, under(P, T(x, 1.47, z, 0, 2*r + .5, .08, 2*r + .5)));
  sph(GM.gold, P, x, 2.15, z, .06);
  KEEP_LIGHT = true; box(M.bulb, P, x, 1.2, z, .12, .14, .12); glow(P, x, 1.2, z, 'warm', 2.4); glow(P, x, 2.18, z, 'gold', .7); KEEP_LIGHT = false;
  cyl(GM.woodDark, P, x, 1.36, z, .01, .2);
  if (island) for (let k = 0; k < 8; k++){ const a = k*TAU/8 + rnd(-.2, .2), rr = rnd(1.35, 1.6); plant(pick(['bushFlower', 'g_fern3', 'fern']), P, Math.cos(a)*rr, .06, Math.sin(a)*rr, rnd(.55, .75)); }
  clear.push([x, z, r + .25]);
}
// A small greenhouse, one of three kinds: a gabled glasshouse, a hooped tunnel house, or an eight-sided conservatory with a cupola. Its frame is copper
// wood, white-painted or verdigris, its glass clear or smoky green, and its only light at night is a strip along its lines (warm white, teal or gold):
// no glow from inside (the old grow lights lit it and the buildings round it pink, owner Nov 6). A deck in front with pots faces the side its spur
// comes in by (k), else any way.
function gdGreenhouse(P, clear, k){
  const face = k >= 0 ? Math.atan2(SIDES4[k][0], SIDES4[k][1]) : pick([0, PI/2, PI, -PI/2]);
  const F = under(P, T(0, 0, 0, face)), G = under(F, T(0, 0, -.3));
  const style = irand(0, 2), fr = pick([GM.wood, GM.cream, GM.verdigris]), gl = pick([GM.glass, GM.glass, GM.glass2]), st = pick([GM.stripW, GM.stripW, GM.bio, GM.edge]);
  const pots = (xs, zs, Q = G) => { for (const [px, pz] of xs.map((x, q) => [x, zs[q]])){ box(GM.woodDark, Q, px, .35, pz, .3, .04, .25); plant(pick(['bush', 'fern', 'succulent', 'bushFlower']), Q, px, .38, pz, rnd(.45, .6)); } };
  let front;
  if (style === 0){   // gabled: glass walls and a pitched glass roof on a frame, an open doorway in front
    const w = 2.3, d = 1.4, h = .95, rh = .55; front = d/2;
    box(GM.stone2, G, 0, .05, 0, w + .1, .06, d + .1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(fr, G, sx*w/2, h/2 + .05, sz*d/2, .035, h);
    for (let q = -1; q <= 1; q++) for (const sz of [-1, 1]) cyl(fr, G, q*w/3, h/2 + .05, sz*d/2, .025, h);
    box(gl, G, 0, h/2 + .08, -d/2, w - .04, h - .1, .02); box(fr, G, 0, h + .06, -d/2, w + .04, .05, .05);
    for (const sx of [-1, 1]) box(gl, G, sx*w*.3, h/2 + .08, d/2, w*.38, h - .1, .02);
    box(fr, G, 0, h + .06, d/2, w + .04, .05, .05);
    for (const sx of [-1, 1]) box(gl, G, sx*w/2, h/2 + .08, 0, .02, h - .1, d - .04);
    const slope = Math.atan2(rh, d/2), len = Math.hypot(rh, d/2);
    for (const sz of [-1, 1]){ box(gl, G, 0, h + .06 + rh/2, sz*d/4, w, .02, len, 0, -sz*slope);
      for (let q = -3; q <= 3; q++) box(fr, G, q*w/6, h + .08 + rh/2, sz*d/4, .03, .03, len, 0, -sz*slope); }
    box(fr, G, 0, h + .06 + rh, 0, w + .1, .05, .05);
    box(st, G, 0, h + .1 + rh, 0, w + .04, .018, .018);   // the strips: along the ridge and both eaves
    for (const sz of [-1, 1]) box(st, G, 0, h + .02, sz*(d/2 + .035), w, .016, .016);
    pots([-.95, -.6, -.4, .4, .65, .95], [-.3, .1, -.35, -.2, .2, -.35]);
  } else if (style === 1){   // a tunnel house: glass on hoops, ends glazed in strips, the front one open in the middle (turned so that end faces the way in)
    const G2 = under(G, T(0, 0, 0, -PI/2));
    const w = 2.4, r = .78; front = r;
    const arc = []; for (let q = 0; q <= 8; q++){ const a = q*PI/8; arc.push([Math.cos(a)*r, .08 + Math.sin(a)*r*1.15]); }
    box(GM.stone2, G2, 0, .05, 0, w + .1, .06, 2*r + .1);
    for (let q = 0; q < 8; q++){ const [az, ay] = arc[q], [bz, by] = arc[q + 1], len = Math.hypot(bz - az, by - ay);
      box(gl, G2, 0, (ay + by)/2, (az + bz)/2, w, .02, len, 0, Math.atan2(by - ay, bz - az)); }
    for (let x = -w/2; x <= w/2 + .01; x += w/4) for (let q = 0; q < 8; q++) strut(fr, G2, x, arc[q][1], arc[q][0], x, arc[q + 1][1], arc[q + 1][0], .03);
    for (const sx of [-1, 1]) for (let q = -3; q <= 3; q++){ const z = q*r/3.5, hz = .08 + Math.sqrt(Math.max(0, r*r - z*z))*1.15;
      if (sx > 0 && Math.abs(q) <= 1) continue;   // (the front's doorway)
      box(gl, G2, sx*w/2, hz/2 + .04, z, .02, hz - .06, r/3.5 - .02); }
    strut(st, G2, -w/2, arc[4][1] + .03, 0, w/2, arc[4][1] + .03, 0, .02);   // the strips: along the crown and both feet
    for (const sz of [-1, 1]) box(st, G2, 0, .1, sz*(r + .03), w, .016, .016);
    pots([-.9, -.5, .5, .9], [-.25, .2, -.25, .15], G2);
    // (a tunnel's doorway is at its end: its deck goes there instead)
    box(GM.wood, G2, w/2 + .45, .07, 0, .7, .04, 1.3); for (const pz of [-.5, .5]){ cyl(GM.stone2, G2, w/2 + .6, .17, pz, .09, .18); plant(pick(['bushFlower', 'fern', 'bonsai']), G2, w/2 + .6, .26, pz, rnd(.5, .65)); }
    clear.push([0, 0, 1.7]); return;
  } else {   // an eight-sided conservatory: glass walls between posts, a faceted glass roof up to a little cupola with a gold finial
    const R = .95, h = .8, rise = .6, ap = R*Math.cos(PI/8), side = 2*R*Math.sin(PI/8), slope = Math.atan2(rise, ap), len = Math.hypot(rise, ap); front = R;
    put(U.cyl16, GM.stone2, under(G, T(0, .05, 0, 0, 2*R + .15, .06, 2*R + .15)));
    for (let j = 0; j < 8; j++){
      const L = under(G, T(0, 0, 0, j*TAU/8)), Lp = under(G, T(0, 0, 0, j*TAU/8 + TAU/16));
      if (j) box(gl, L, 0, h/2 + .08, ap, side - .03, h - .1, .02);   // (j 0: the doorway, in front)
      cyl(fr, Lp, 0, h/2 + .05, R, .03, h);
      box(fr, L, 0, h + .06, ap, side + .02, .045, .045);
      box(gl, L, 0, h + .08 + rise*.25, ap*.75, side*.78, .02, len*.5, 0, -slope);   // the roof: two bands of panels, wide and then narrow
      box(gl, L, 0, h + .08 + rise*.7, ap*.3, side*.38, .02, len*.42, 0, -slope);
      strut(fr, Lp, 0, h + .08, R, 0, h + .08 + rise*.92, R*.1, .025);
      box(st, L, 0, h + .02, ap + .035, side, .016, .016);   // the strip: round the wall tops
    }
    cyl(fr, G, 0, h + rise + .12, 0, .16, .16); put(U.cone, GM.roof, under(G, T(0, h + rise + .28, 0, 0, .42, .2, .42))); sph(GM.gold, G, 0, h + rise + .42, 0, .05);
    put(U.cyl16, st, under(G, T(0, h + rise + .19, 0, 0, .35, .02, .35)));
    cyl(GM.stone2, G, 0, .2, 0, .32, .24); plant(pick(['bonsai', 'bushFlower', 'fern']), G, 0, .33, 0, rnd(.6, .75));
    for (let j = 1; j < 8; j += 2){ const a = j*TAU/8 + .3, rr = R*.6; plant(pick(['fern', 'succulent', 'bushFlower']), G, Math.sin(a)*rr, .08, Math.cos(a)*rr, rnd(.45, .6)); }
  }
  box(GM.wood, G, 0, .07, front + .42, 2.3, .04, .7);
  for (let q = -2; q <= 2; q++) box(GM.woodDark, G, q*2.3/5, .093, front + .42, .015, .006, .7);
  for (const px of [-.95, -.65, .65, .95]){ cyl(GM.stone2, G, px, .17, front + .6, .09, .18); plant(pick(['bushFlower', 'fern', 'bonsai', 'succulent']), G, px, .26, front + .6, rnd(.5, .65)); }
  gdLamp(G, -1.3, front + .45, .9, []);
  clear.push([0, 0, 1.7]);
}
// a koi deck: copper planks out to the pond's edge with a low rail, a bench facing the water, lanterns at its ends
function gdKoiDeck(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, [a, b] = SIDES4[Math.max(0, k)], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  box(GM.wood, E, 0, .075, -.55, LOT - .3, .04, 1.0);
  for (let t = -1.6; t <= 1.6; t += .2) box(GM.woodDark, E, t, .097, -.55, .012, .006, 1.0);
  for (let t = -1.7; t <= 1.71; t += .425) cyl(GM.wood, E, t, .25, -.1, .025, .32);
  box(GM.wood, E, 0, .41, -.1, LOT - .25, .035, .045);
  KEEP_LIGHT = true; for (const t of [-1.7, 1.7]){ box(M.bulb, E, t, .5, -.1, .08, .08, .08); glow(E, t, .5, -.1, 'warm', 1.2); } KEEP_LIGHT = false;
  gdBench(E, rnd(-.6, .6), -.75, 0, []);
  clear.push([a*1.35, b*1.35, 1.2], [a*.85, b*.85, .5]);
}
// misters: thin poles puffing mist over ferns and mossy stones by the water
function gdMisters(P, x, clear){
  const k = x.wet ? x.wet.indexOf(1) : 0, [a, b] = SIDES4[Math.max(0, k)], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b)));
  for (const t of [-1, 0, 1]){ const t2 = t*1.1 + rnd(-.15, .15), zz = -rnd(.55, .8);
    cyl(M.metalDark, E, t2, .5, zz, .018, 1.0); box(GM.wood, E, t2, 1.02, zz, .06, .04, .06);
    glow(E, t2, 1.12, zz + .05, 'arc', .9); glow(E, t2, .9, zz + .15, 'arc', 1.3); }
  for (let q = 0; q < 5; q++){ const t = rnd(-1.5, 1.5), zz = -rnd(.9, 1.6); blob(pick([M.rock, M.rockDark]), E, t, .08, zz, rnd(.12, .2), .6); blob(GM.leaf2, E, t, .16, zz, rnd(.08, .12), .4); }
  for (let q = 0; q < 9; q++) plant(pick(['fern', 'g_fern2', 'g_fern3']), E, rnd(-1.6, 1.6), .06, -rnd(.4, 1.7), rnd(.6, .85));
  gdBio(E, 3); clear.push([a*1.0, b*1.0, 1.1]);
}
// a grotto: a horseshoe of mossy rock round a little pool, a hammock slung across it, glowing moss, a shaft of light. It opens toward the side its spur
// comes in by (k), else toward the pond.
function gdGrotto(P, x, clear, k){
  const kw = x.wet ? x.wet.indexOf(1) : 0, ko = k >= 0 ? k : Math.max(0, kw), open = Math.atan2(SIDES4[ko][0], SIDES4[ko][1]), F = under(P, T(0, 0, 0, open));
  for (let q = 0; q <= 12; q++){ const a = PI*.18 + q*(PI*1.64)/12, r = 1.25 + rnd(-.1, .1);
    const rx = Math.sin(a)*r, rz = Math.cos(a)*r;
    blob(pick([M.rock, M.rockDark]), F, rx, .3, rz, rnd(.38, .5), 1.1); blob(pick([M.rock, M.rockDark]), F, rx*.95, .85, rz*.95, rnd(.3, .42), 1);
    if (q > 2 && q < 10) blob(M.rock, F, rx*.82, 1.35, rz*.82, rnd(.28, .36), .8);
    if (chance(.6)) sph(GM.bio, F, rx*.88, rnd(.3, 1.1), rz*.88, rnd(.05, .08), .5);
    if (chance(.5)) plant(pick(['vines', 'pothos']), F, rx*.85, 1.4, rz*.85, rnd(.55, .75), 't', true); }
  put(U.cyl16, GM.pebbleDark, under(F, T(0, .03, -.1, 0, 1.25, .05, 1.0)));
  put(U.cyl16, GM.bowl, under(F, T(0, .058, -.1, 0, 1.1, .01, .85)));
  for (const s of [-1, 1]) cyl(GM.woodDark, F, s*.62, .4, -.55, .035, .8);
  for (let q = 0; q < 6; q++){ const u0 = -.55 + q*.22, u1 = u0 + .22, sag = t => .55 - .14*(1 - (t/.62)**2); strut(GM.hammock, F, u0, sag(u0), -.55, u1, sag(u1), -.55, .2); }
  spotAt(F, 0, .38, -.55, 'seat', null, [0, 1]);
  KEEP_LIGHT = true; glow(F, 0, 1.6, -.4, 'ivory', 3.0); glow(F, -.3, .35, -.1, 'green', .8); KEEP_LIGHT = false;
  clear.push([0, 0, 1.7]);
}
// A water plot: the pond a little below the lawn; a stone and pebble rim with a soft gold line inside it on every side that isn't water (on a side
// away from the garden, a strip of grass outside the rim: a pond always has its grass border); and a bridge where
// the water is one plot wide. (The lily pads, now and then, float: drawn live so the waves can push them about, gardenFx.)
function gdWater(P, gd, x){
  const e = x.e || [0, 0, 0, 0], br = x.br || 0;
  // the surface: one sheet, a little finer than a grid of 10 x 10, whose corners carry how far each is from the nearest bank (as a few millimetres of height:
  // the water shader reads it back as depth, GD_WATER_MAT). Measured from this plot's own banks, and its inner corners: straight banks run on into
  // the next plot, so the depths meet across the line between two water plots.
  const cw = x.cw || [0, 0, 0, 0], H = LOT/2;
  const dep = (lx, lz) => { let d = 9;
    if (e[0] !== 2) d = Math.min(d, H - lx); if (e[1] !== 2) d = Math.min(d, lx + H); if (e[2] !== 2) d = Math.min(d, H - lz); if (e[3] !== 2) d = Math.min(d, lz + H);
    cw.forEach((v, k) => { if (v){ const [sx, sz] = GD_CORNERS[k]; d = Math.min(d, Math.hypot(lx - sx*H, lz - sz*H)); } });
    return Math.max(0, Math.min(1, (d - .2)/1.45)); };
  const sheet = new THREE.PlaneGeometry(LOT, LOT, 10, 10); sheet.rotateX(-PI/2);
  const sp = sheet.attributes.position; for (let i = 0; i < sp.count; i++) sp.setY(i, GD_WATER_Y + GD_WATER_K*dep(sp.getX(i), sp.getZ(i)));
  const flat = sheet.toNonIndexed(); sheet.dispose(); flat.computeVertexNormals(); { const n = flat.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  put(flat, GD_WATER_MAT, P); flat.dispose();
  e.forEach((v, k) => {
    if (v === 2) return;
    const [a, b] = SIDES4[k], E = under(P, T(a*LOT/2, 0, b*LOT/2, Math.atan2(a, b))), gap = (br === 1 && k < 2) || (br === 2 && k >= 2);
    if (!v){ box(GM.lip, E, 0, .05, -.06, LOT, .03, .14); for (let t = -1.8; t <= 1.8; t += .14) plant('gt0', E, t + rnd(-.04, .04), .06, -rnd(.02, .1), rnd(.22, .26)); }
    for (let t = -1.85; t <= 1.86; t += .2){
      if (gap && Math.abs(t) < .55) continue;
      blob(pick([GM.stone, GM.pebble, GM.pebble, GM.pebbleDark]), E, t + rnd(-.04, .04), .08, -rnd(.17, .3), rnd(.1, .14), .85);
      if (chance(.15)) sph(GM.bio, E, t, .16, -rnd(.3, .38), .03, .6);
    }
    if (gap){ for (const s of [-1, 1]) box(GM.edge, E, s*1.2, .05, -.42, 1.3, .015, .025); }
    else box(GM.edge, E, 0, .05, -.42, LOT - .1, .015, .025);
    if (chance(.5)) plant(pick(['g_fern3', 'bushFlower']), E, rnd(-1.4, 1.4), .06, -.2, rnd(.5, .65));
    if (chance(.3)){ const t = pick([-1.3, 1.3]) + rnd(-.15, .15);   // a little stone lantern on the bank (the pond reflects it: sky.js)
      cyl(GM.stone2, E, t, .14, -.22, .07, .28); box(GM.stone, E, t, .3, -.22, .14, .04, .14); KEEP_LIGHT = true; box(M.bulb, E, t, .36, -.22, .07, .07, .07); glow(E, t, .37, -.22, 'warm', 1.0); KEEP_LIGHT = false;
      put(U.cone, GM.roof, under(E, T(t, .44, -.22, 0, .2, .08, .2))); }
  });
  // inner corners (water on both sides, grass on the corner): a few stones
  (x.cw || []).forEach((v, k) => { if (!v) return; const [sx, sz] = GD_CORNERS[k];
    for (let q = 0; q < 3; q++) blob(pick([GM.stone, GM.pebble]), P, sx*(LOT/2 - rnd(.05, .25)), .08, sz*(LOT/2 - rnd(.05, .25)), rnd(.1, .14), .85); });
  // (the lily pads float: drawn live, gardenFx)
  if (br){ const F = br === 1 ? under(P, T(0, 0, 0, PI/2)) : P; if (x.bw) gdWalkway(F); else gdBridge(F, x.bi || 0, x.bn || 1); }
}
// One plot of a bridge along its frame's z, edge to edge: a deck low enough to walk on, copper rails rising in one gentle arch over the whole span
// (bi: this plot's place in it, from 0; bn: how many plots it spans), stone piers under it in the water, lanterns at its two ends.
function gdBridge(F, bi, bn){
  box(GM.wood, F, 0, .09, 0, .9, .05, LOT);
  for (let t = -1.8; t <= 1.81; t += .2) box(GM.woodDark, F, 0, .117, t, .9, .006, .015);
  for (const t of [-.9, .9]) put(U.cyl16, GM.stone2, under(F, T(0, .03, t, 0, .5, .06, .5)));
  const half = bn*LOT/2, rise = Math.min(.1 + .05*(bn - 1), .3), yr = t => { const g = (bi - (bn - 1)/2)*LOT + t; return .45 + rise*(1 - (g/half)**2); };
  for (const s of [-1, 1]){
    for (let k = 0; k <= 8; k++){ const t = -LOT/2 + k*LOT/8;
      if (k < 8) strut(GM.wood, F, s*.47, yr(t), t, s*.47, yr(t + LOT/8), t + LOT/8, .035);
      if (k % 2 === 0) cyl(GM.wood, F, s*.47, (yr(t) + .1)/2, t, .025, yr(t) - .1); }
    strut(GM.woodDark, F, s*.47, .2, -LOT/2, s*.47, .2, LOT/2, .025);
  }
  const ends = (bi === 0 ? [-1.75] : []).concat(bi === bn - 1 ? [1.75] : []);
  KEEP_LIGHT = true; for (const s of [-1, 1]) for (const t of ends){ box(M.bulb, F, s*.47, yr(t) + .09, t, .07, .08, .07); glow(F, s*.47, yr(t) + .09, t, 'warm', 1.1); } KEEP_LIGHT = false;
}
// One plot of a walkway out to an island's gazebo: flat cream slabs on short stone piers just above the water, a low dark edge either side, no rails
// and no lanterns, so it reads as a path across the water rather than a bridge
function gdWalkway(F){
  for (let k = 0; k < 8; k++){ const t = -LOT/2 + (k + .5)*LOT/8;
    box(k % 2 ? GM.stone2 : GM.stone, F, 0, .1, t, .82, .03, LOT/8 - .04);
    if (k % 2 === 0) for (const s of [-1, 1]) cyl(GM.stone2, F, s*.3, .05, t, .06, .09); }
  for (const s of [-1, 1]) box(GM.woodDark, F, s*.44, .16, 0, .05, .07, LOT);
}
/* ---------- the living water: rings and lily pads ---------- */
// Drawn over the plots, in the page only (the plot worker never runs this).
//  - Rings: the cursor drawn over a pond leaves rings on it (a ring each half plot or so it travels, stronger the faster it goes); on a phone, a tap
//    on the water starts one. They are worked out in the water's own shader (GD_RIP: eight at a time, four on a phone), nothing else is drawn.
//  - Lily pads: now and then a pond plot has one or two (some with a little solar cell that glows at night, some with a flower). They float: a strong
//    ring (a fast sweep of the cursor, a tap) pushes them along as its crests pass, they keep where it left them and drift slowly back home over half
//    a minute or so, and never leave the water (the rim, the bridges' line, an island hold them off). One batch for the pads, one each for the cells
//    and the flowers; their positions go up to the graphics card only while one of them is moving.
const GD_FX = { dirty: true, water: 0, pads: [], mesh: null, moved: false, last: null, lastRing: null };
const GD_PAD_N = 96;
const _gdO = new THREE.Object3D(), _gdC = new THREE.Color();
function gdPadMeshes(){
  if (GD_FX.mesh) return GD_FX.mesh;
  const disk = new THREE.CircleGeometry(.5, 14, .4, PI*2 - .8); disk.rotateX(-PI/2);   // a disc with its notch
  const mat = o => { const m = new THREE.MeshToonMaterial(Object.assign({ gradientMap: gradTex }, o)); m.userData.live = true; return m; };
  const mk = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, GD_PAD_N); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.userData.live = true; scene.add(im); return im; };
  const solM = mat({ color: 0x24363a, emissive: new THREE.Color(0x9ff0d0), emissiveIntensity: 0 });
  const blo = mk(U.blob, mat({ color: 0xffffff }));
  for (let i = 0; i < GD_PAD_N; i++) blo.setColorAt(i, _gdC.setHex(0xffffff));   // (made now, so its shader is built with the colors from the start)
  GD_FX.mesh = { pad: mk(disk, mat({ color: 0x4f9a3a })), sol: mk(U.box, solM), blo, solM };
  return GD_FX.mesh;
}
// whether a pad (about .15 across its middle) can float here: on a pond plot, clear of its rim, its inner corners and its bridge
function gdPadOk(x, z){
  const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT)));
  if (!c || !c.gd || !c.gd.p || !c.gd.w || !c.gd.x) return false;
  const X = c.gd.x, e = X.e || [0, 0, 0, 0], lx = x - c.x, lz = z - c.z, m = LOT/2 - .55;
  if ((e[0] !== 2 && lx > m) || (e[1] !== 2 && lx < -m) || (e[2] !== 2 && lz > m) || (e[3] !== 2 && lz < -m)) return false;
  if ((X.br === 1 && Math.abs(lz) < .7) || (X.br === 2 && Math.abs(lx) < .7)) return false;
  const cw = X.cw || [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) if (cw[k] && Math.hypot(lx - GD_CORNERS[k][0]*LOT/2, lz - GD_CORNERS[k][1]*LOT/2) < .7) return false;
  return true;
}
// the pads, from the gardens (each rolled from its plot's seed, so it comes back where it was; one already floating keeps where it is)
function gdPadsBuild(){
  GD_FX.dirty = false;
  const old = new Map(GD_FX.pads.map(p => [p.k, p])), pads = []; let water = 0;
  if (gardenOn()) for (const c of cells.values()){
    const gd = c.gd; if (!gd || !gd.p || !gd.w || !gd.x) continue; water++;
    if ((gd.x.pd || 1) < 2 || gdRoll(gd, 'pad') >= .1) continue;   // (rare: one plot of a pond in ten, owner Nov 6)
    for (let q = 0, n = gdRoll(gd, 'padn') < .75 ? 1 : 2; q < n && pads.length < GD_PAD_N; q++){
      const hx = c.x + gdRoll(gd, 'px', q)*2.4 - 1.2, hz = c.z + gdRoll(gd, 'pz', q)*2.4 - 1.2;
      if (!gdPadOk(hx, hz)) continue;
      const k = c.i + ',' + c.j + ',' + gd.s + ',' + q, o = old.get(k), r = gdRoll(gd, 'pk', q);
      pads.push(o && gdPadOk(o.x, o.z) ? o : { k, hx, hz, x: hx, z: hz, vx: 0, vz: 0, a: gdRoll(gd, 'pa', q)*PI*2, va: 0, s: .24 + gdRoll(gd, 'ps', q)*.08,
        kind: r < .35 ? 1 : r < .61 ? 2 : 0, col: gdRoll(gd, 'pc', q) < .5 ? 0xff8f6b : 0xfff1d6, sg: gdRoll(gd, 'sg', q) < .5 ? -1 : 1 });
    }
  }
  GD_FX.pads = pads; GD_FX.water = water; GD_FX.moved = true;
  GD_FX.wcells = gardenOn() ? [...cells.values()].filter(c => c.gd && c.gd.p && c.gd.w) : [];
}
// a new ring on the water, in the oldest slot (none if every slot's ring is still very young: a burst of them would cut the others short)
function gdRing(x, z, w){
  const R = GD_RIP.rips.value, N = GD_RIP.n.value, t = FOL_UNI.time.value;
  let best = 0, bAge = -1;
  for (let i = 0; i < N; i++){ const age = t - R[i].z, a = age < 0 || age > GD_RIP_LIFE ? 1e9 : age; if (a > bAge){ bAge = a; best = i; } }
  if (bAge < .16) return false;
  R[best].set(x, z, t, w); GD_FX.lastRing = { x, z, t: performance.now()/1000 }; return true;
}
// A ring only where the pond is what's under the pointer, not a tree, a bridge or a roof standing in front of it (the pointer's ray reaches the
// water behind them too, and the rings rose round the trees, owner Nov 6). The water marks its pixels in the normal image (GD_WATER_MAT), so one
// pixel of it says: read into a buffer on the graphics card and fetched a frame or two later, once it is there (never waiting for it: no stall).
// Without WebGL 2 (no marks), every hit on the water counts.
const GD_PICK = { pbo: null, req: null, wait: null, buf: new Uint8Array(4) };
function gdRingIfSeen(cx, cy, x, z, w){
  if (typeof MRT === 'undefined' || !MRT || typeof rtN === 'undefined' || !rtN){ gdRing(x, z, w); return; }
  const r = viewRect(); GD_PICK.req = { u: (cx - r.left)/r.width, v: 1 - (cy - r.top)/r.height, x, z, w };   // (the newest wins)
}
function gdPickPoll(){
  const P = GD_PICK; if (!P.wait && !P.req) return;
  const gl = renderer.getContext();
  if (P.wait){
    const st = gl.clientWaitSync(P.wait.fence, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED && ++P.wait.n < 8) return;
    if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED){
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, P.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, P.buf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const a = P.buf[3]; if (a > 100 && a < 160){ const q = P.wait.r; gdRing(q.x, q.z, q.w); }
    }
    gl.deleteSync(P.wait.fence); P.wait = null;
  }
  if (!P.req) return;
  const q = P.req; P.req = null;
  const fb = renderer.properties.get(rtN).__webglFramebuffer; if (!fb){ gdRing(q.x, q.z, q.w); return; }
  if (!P.pbo){ P.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, P.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); }
  const px = Math.min(rtN.width - 1, Math.max(0, Math.floor(q.u*rtN.width))), py = Math.min(rtN.height - 1, Math.max(0, Math.floor(q.v*rtN.height)));
  const prev = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, P.pbo);
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
  P.wait = { fence: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), r: q, n: 0 };
}
// every frame (main.js): the pads' floating, the rings' count, whether the composite should look for water to reflect in
function gardenFx(dt){
  if (self.IN_RECIPE_WORKER) return;
  if (GD_FX.dirty) gdPadsBuild();
  if (GD_PICK.wait || GD_PICK.req) try { gdPickPoll(); } catch (e){ GD_PICK.wait = GD_PICK.req = null; }
  GD_RIP.n.value = typeof TOUCH !== 'undefined' && TOUCH.on ? 4 : 8;
  // (the composite's reflections on the ponds: 1 on, 2 off since the mirror shows them instead: gardenMirror)
  if (typeof comp !== 'undefined' && comp.uniforms.waterOn) comp.uniforms.waterOn.value = GD_FX.water > 0 ? (GD_MIR.on ? 2 : 1) : 0;
  const pads = GD_FX.pads; if (!pads.length && !GD_FX.mesh) return;
  const MS = gdPadMeshes(); MS.solM.emissiveIntensity = .55*LIGHTS_ON.value;
  if (!pads.length){ if (MS.pad.count) MS.pad.count = MS.sol.count = MS.blo.count = 0; return; }
  dt = Math.min(dt, .05);
  const t = FOL_UNI.time.value, R = GD_RIP.rips.value, N = GD_RIP.n.value, damp = Math.exp(-1.6*dt), dampA = Math.exp(-2.2*dt);
  let moving = true; GD_FX.moved = false;   // (always redrawn: they ride the swell, below)
  for (const p of pads){
    let ax = (p.hx - p.x)*.05, az = (p.hz - p.z)*.05;   // the slow drift home
    for (let i = 0; i < N; i++){ const r = R[i], age = t - r.z; if (age < 0 || age > GD_RIP_LIFE || r.w < .55) continue;   // (a gentle ring only rocks the light)
      const dx = p.x - r.x, dz = p.z - r.y, d = Math.hypot(dx, dz) || 1e-3, off = d - (.12 + age*.8);
      if (off < -.3 || off > .15) continue;
      const f = 1.3*Math.min(r.w - .5, 1)*(1 - age/GD_RIP_LIFE)*(1 - Math.abs(off + .075)/.225); if (f <= 0) continue;
      ax += f*dx/d; az += f*dz/d; p.va += f*.8*p.sg*dt; }
    p.vx = (p.vx + ax*dt)*damp; p.vz = (p.vz + az*dt)*damp; p.va *= dampA;
    if (Math.abs(p.vx) + Math.abs(p.vz) + Math.abs(p.va) < 4e-4 && Math.abs(p.hx - p.x) + Math.abs(p.hz - p.z) < .01){ p.vx = p.vz = p.va = 0; continue; }
    const nx = p.x + p.vx*dt, nz = p.z + p.vz*dt;
    if (gdPadOk(nx, nz)){ p.x = nx; p.z = nz; }
    else if (gdPadOk(nx, p.z)){ p.x = nx; p.vz *= -.3; }   // (along the rim, bumped back off it)
    else if (gdPadOk(p.x, nz)){ p.z = nz; p.vx *= -.3; }
    else { p.vx *= -.3; p.vz *= -.3; }
    p.a += p.va*dt; moving = true;
  }
  if (!moving) return;
  let ns = 0, nb = 0;
  pads.forEach((p, n) => {
    // riding the swell: a little to and fro along it, and a little turn, in step with the shader's main wave (gWv) where the pad is
    const wp = .8*Math.sin(p.x*.55 + p.z*.35 + t*.17) + .45*Math.sin((-.38*p.x + .92*p.z)*2.1 - t*.6), ph = (p.x*.85 + p.z*.53)*3.6 - t*1.55 + wp, sw = .035*Math.cos(ph);
    const X = p.x + .85*sw, Z = p.z + .53*sw, A = p.a + .07*Math.sin(ph + p.hx);
    const ca = Math.cos(A), sa = Math.sin(A), at = (ox, oz) => [X + ox*ca + oz*sa, Z - ox*sa + oz*ca];
    _gdO.position.set(X, .051, Z); _gdO.rotation.set(0, A, 0); _gdO.scale.set(p.s, 1, p.s); _gdO.updateMatrix(); MS.pad.setMatrixAt(n, _gdO.matrix);
    if (p.kind === 1){ const [x, z] = at(.02, -.02); _gdO.position.set(x, .056, z); _gdO.scale.set(.1, .008, .1); _gdO.updateMatrix(); MS.sol.setMatrixAt(ns++, _gdO.matrix); }
    else if (p.kind === 2){ const [x, z] = at(-.03, .02); _gdO.position.set(x, .068, z); _gdO.scale.set(.055, .04, .055); _gdO.updateMatrix(); MS.blo.setMatrixAt(nb, _gdO.matrix); MS.blo.setColorAt(nb++, _gdC.setHex(p.col)); }
  });
  MS.pad.count = pads.length; MS.sol.count = ns; MS.blo.count = nb;
  MS.pad.instanceMatrix.needsUpdate = MS.sol.instanceMatrix.needsUpdate = MS.blo.instanceMatrix.needsUpdate = true;
  if (MS.blo.instanceColor) MS.blo.instanceColor.needsUpdate = true;
}
// where the pointer is over a pond, on the water's surface (or null)
const _gdRay = new THREE.Raycaster(), _gdNdc = new THREE.Vector2(), _gdHit = new THREE.Vector3(), _gdPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(GD_WATER_Y + .003));
function gdWaterAt(cx, cy){
  const r = viewRect(); _gdNdc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1); _gdRay.setFromCamera(_gdNdc, cam);
  if (!_gdRay.ray.intersectPlane(_gdPl, _gdHit)) return null;
  const c = cells.get(ckey(Math.round(_gdHit.x/LOT), Math.round(_gdHit.z/LOT)));
  return c && c.gd && c.gd.p && c.gd.w ? _gdHit : null;
}
if (!self.IN_RECIPE_WORKER && typeof canvas !== 'undefined' && canvas.addEventListener){
  // the cursor over the water (a mouse or a pen, not pressed: dragging pans the view): a ring each half plot or so, stronger the faster it moves
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || e.buttons || !GD_FX.water){ GD_FX.last = null; return; }
    const h = gdWaterAt(e.clientX, e.clientY), now = performance.now()/1000; if (!h){ GD_FX.last = null; return; }
    const L = GD_FX.last, d = L ? Math.hypot(h.x - L.x, h.z - L.z) : 0, sp = L ? L.sp*.6 + .4*d/Math.max(now - L.t, 1/120) : 0;
    GD_FX.last = { x: h.x, z: h.z, t: now, sp };
    const R = GD_FX.lastRing, far = !R || Math.hypot(h.x - R.x, h.z - R.z) > .5, idle = R && now - R.t > .7 && d > .02;
    if (far || idle) gdRingIfSeen(e.clientX, e.clientY, h.x, h.z, Math.min(1.6, Math.max(.3, .3 + sp/14)));
  }, { passive: true });
  // a tap on the water (a phone): one ring, strong enough to nudge the pads
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !GD_FX.water) return;
    const h = gdWaterAt(e.clientX, e.clientY); if (h) gdRingIfSeen(e.clientX, e.clientY, h.x, h.z, 1.0);
  }, { passive: true });
}

/* ---------- the ponds' mirror (computers) ---------- */
// The ponds reflect like a mirror: before the frame's colors are drawn, the city near the ponds on screen is drawn once more from a camera mirrored
// under the water's surface (GD_MIR.rt, at the frame's own size), and the water shows that picture where it lies (GD_WATER_MAT), rippled a pixel by
// the swell. Unlike the composite's reflections (sky.js), which can only show what the camera itself sees, it holds as the view turns (a building's
// side facing the water still shows when it faces away from you), and it's as sharp as the rest of the frame. (Owner Nov 6, computers only: it draws
// what's round the ponds a second time each frame. On a touch screen the composite's reflections stay.)
//  - Only the part of the frame the ponds cover is drawn (the mirrored camera's view cut down to it: what's outside is never drawn).
//  - Nothing under the water is drawn (an oblique near plane: the mirrored camera's view starts at the surface), nor the water and the lily pads.
//  - The view is the frame's own (its projection copied, so it zooms, turns and steps by whole pixels with it); people, trees, lights all show.
//  - Only what stands within two plots of a pond is drawn in it (owner Nov 6: the whole view near the ponds cost too much): gdMirFilter.
const GD_MIR_Y = GD_WATER_Y + .003;
const GD_MIR = { rt: null, cam: null, on: false, M: { value: new THREE.Matrix4() }, tex: { value: null }, use: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, scr: { value: new THREE.Vector2(1, 1) } };
const gdMirWanted = () => !self.IN_RECIPE_WORKER && !(typeof TOUCH !== 'undefined' && TOUCH.on) && typeof renderer !== 'undefined' && renderer.capabilities.isWebGL2 && !window.__NO_POND_MIRROR;
const _gmV = new THREE.Vector3(), _gmT = new THREE.Vector3(), _gmU = new THREE.Vector3(), _gmN = new THREE.Vector3(0, 1, 0), _gm4 = new THREE.Vector4(), _gmQ = new THREE.Vector4();
const _gmP = new THREE.Matrix4(), _gmI = new THREE.Matrix4(), _gmS = new THREE.Matrix4(), _gmB = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
const _gmCol = new THREE.Color();
// What the mirror leaves out: everything that lies wholly more than two plots from every pond plot. Kept cheap (it runs every frame the mirror
// draws): which plots count as near is a small grid of bytes over the ponds' surroundings, looked up by plot number (no strings);
//  - still things (their matrices never change: the plots, the merged blocks) are sorted once, and again only when the city or the ponds change;
//  - moving things are looked at whole, by their topmost moving group (a car, a drone, a plant batch), not part by part: their place and a size
//    measured once. The scene's and the city's own top level is gone through each frame (a few hundred at most), moving groups found deeper inside
//    still ones are listed with the still things;
//  - things drawn whatever the view (frustumCulled off: the people's crowds) are always drawn.
const GD_MIRF = { key: '', far: [], deep: [], hid: [], g: null, i0: 0, j0: 0, w: 0, h: 0, rad: new WeakMap() };
const _gfS = new THREE.Sphere(), _gfB = new THREE.Box3(), _gfV = new THREE.Vector3();
function gdMirNear(cx, cz, r){
  const F = GD_MIRF; if (!F.g) return false;
  const i0 = Math.max(F.i0, Math.round((cx - r)/LOT)), i1 = Math.min(F.i0 + F.w - 1, Math.round((cx + r)/LOT));
  const j0 = Math.max(F.j0, Math.round((cz - r)/LOT)), j1 = Math.min(F.j0 + F.h - 1, Math.round((cz + r)/LOT));
  for (let j = j0; j <= j1; j++){ const row = (j - F.j0)*F.w - F.i0; for (let i = i0; i <= i1; i++) if (F.g[row + i]) return true; }
  return false;
}
function gdMirMeshNear(o){
  const g = o.geometry; if (!g) return true;
  if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return true;
  _gfS.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); return gdMirNear(_gfS.center.x, _gfS.center.z, _gfS.radius);
}
// a moving group: its place now, and its size (measured once, round its own origin)
function gdMirRootNear(o){
  if (o.isMesh || o.isPoints || o.isLine) return !o.frustumCulled || gdMirMeshNear(o);
  let r = GD_MIRF.rad.get(o);
  if (r === undefined){ _gfB.setFromObject(o); _gfV.setFromMatrixPosition(o.matrixWorld);
    r = _gfB.isEmpty() ? 0 : Math.max(_gfB.min.distanceTo(_gfV), _gfB.max.distanceTo(_gfV)); GD_MIRF.rad.set(o, r); }
  const e = o.matrixWorld.elements; return gdMirNear(e[12], e[14], r);
}
const gdStill = o => o.matrixAutoUpdate === false;
function gdMirFilter(){
  const F = GD_MIRF, wc = GD_FX.wcells;
  const key = (typeof SC_EDITS !== 'undefined' ? SC_EDITS : 0) + '|' + world.children.length + '|' + (world.children.length ? world.children[world.children.length - 1].id : 0) + '|' + wc.length + '|' + (wc.length ? wc[0].i + ',' + wc[0].j + ',' + wc[wc.length - 1].i + ',' + wc[wc.length - 1].j : '');
  if (key !== F.key){
    F.key = key; F.far.length = 0; F.deep.length = 0;
    let i0 = 1e9, j0 = 1e9, i1 = -1e9, j1 = -1e9;
    for (const c of wc){ i0 = Math.min(i0, c.i - 2); i1 = Math.max(i1, c.i + 2); j0 = Math.min(j0, c.j - 2); j1 = Math.max(j1, c.j + 2); }
    F.i0 = i0; F.j0 = j0; F.w = i1 - i0 + 1; F.h = j1 - j0 + 1; F.g = new Uint8Array(F.w*F.h);
    for (const c of wc) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) F.g[(c.j + b - j0)*F.w + (c.i + a - i0)] = 1;
    // the still things, part by part (a merged block's meshes each cover the block anyway), and the moving groups inside them
    scene.updateMatrixWorld();
    const walk = o => {
      for (const ch of o.children){
        if (!gdStill(ch)){ if (o !== scene && o !== world && !ch.isLight && !ch.isCamera) F.deep.push(ch); continue; }   // (a moving one: the top levels are gone through each frame)
        if ((ch.isMesh || ch.isPoints || ch.isLine) && ch.frustumCulled && !gdMirMeshNear(ch)) F.far.push(ch);
        walk(ch); } };
    walk(scene);
  }
  const hid = F.hid; hid.length = 0;
  for (const o of F.far) if (o.visible){ o.visible = false; hid.push(o); }
  const tops = [scene.children, world.children, F.deep];
  for (const L of tops) for (const o of L) if (o.visible && !gdStill(o) && o !== world && !o.isLight && !o.isCamera && !gdMirRootNear(o)){ o.visible = false; hid.push(o); }   // (never a light: switching one off changes every shader)
  return hid;
}
function gardenMirror(){
  GD_MIR.on = false; GD_MIR.use.value = 0;
  if (!gdMirWanted() || !GD_FX.water || !GD_FX.wcells || !GD_FX.wcells.length) return;
  // (at half the frame's size each way, a quarter of the pixels, read back smoothed: owner Nov 6. window.__POND_MIRROR_FULL: the frame's own size, to compare)
  const full = !!window.__POND_MIRROR_FULL, w = full ? W : Math.ceil(W/2), h = full ? H : Math.ceil(H/2);
  if (!GD_MIR.rt || GD_MIR.rt.width !== w || GD_MIR.rt.height !== h){
    if (GD_MIR.rt) GD_MIR.rt.dispose();
    const f = full ? THREE.NearestFilter : THREE.LinearFilter;
    GD_MIR.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: f, magFilter: f, format: THREE.RGBAFormat });
    GD_MIR.tex.value = GD_MIR.rt.texture; GD_MIR.res.value.set(w, h);
  }
  GD_MIR.scr.value.set(W, H);
  if (!GD_MIR.cam) GD_MIR.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, cam.near, cam.far);
  const vc = GD_MIR.cam;
  // the camera mirrored in the water's surface (its place, where it looks, its up), as three's own Reflector does it
  cam.updateMatrixWorld();
  const camPos = _gmV.setFromMatrixPosition(cam.matrixWorld), dir = _gmT.set(0, 0, -1).transformDirection(cam.matrixWorld);
  const look = dir.clone().multiplyScalar(100).add(camPos);
  const mirror = v => { v.y = 2*GD_MIR_Y - v.y; return v; };
  vc.position.copy(mirror(camPos.clone()));
  _gmU.set(0, 1, 0).transformDirection(cam.matrixWorld).reflect(_gmN);
  vc.up.copy(_gmU); vc.lookAt(mirror(look)); vc.updateMatrixWorld();
  // its projection: the frame's own, with the near plane turned to lie along the water (Lengyel's oblique near plane: nothing under it is drawn)
  _gmP.copy(cam.projectionMatrix);
  { const c = _gm4.set(0, 1, 0, -GD_MIR_Y).applyMatrix4(_gmS.copy(vc.matrixWorld).transpose());   // (the plane in the camera's own frame)
    _gmI.copy(_gmP).invert();
    const cc = c.clone().applyMatrix4(_gmS.copy(_gmI).transpose());
    _gmQ.set(Math.sign(cc.x), Math.sign(cc.y), 1, 1).applyMatrix4(_gmI);
    const e = _gmP.elements, r4 = new THREE.Vector4(e[3], e[7], e[11], e[15]), a = 2*r4.dot(_gmQ)/c.dot(_gmQ);
    e[2] = a*c.x - e[3]; e[6] = a*c.y - e[7]; e[10] = a*c.z - e[11]; e[14] = a*c.w - e[15]; }
  // where the water shows in the mirrored picture: the ponds' plots on screen, in its pixels (a pixel or two to spare)
  const VPm = _gmS.multiplyMatrices(_gmP, vc.matrixWorldInverse);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of GD_FX.wcells) for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    _gm4.set(c.x + sx*LOT/2, GD_MIR_Y, c.z + sz*LOT/2, 1).applyMatrix4(VPm);
    const u = (_gm4.x/_gm4.w*.5 + .5)*w, v = (_gm4.y/_gm4.w*.5 + .5)*h;
    x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
  const px0 = Math.max(0, Math.floor(x0) - 2), py0 = Math.max(0, Math.floor(y0) - 2), px1 = Math.min(w, Math.ceil(x1) + 2), py1 = Math.min(h, Math.ceil(y1) + 2);
  if (px1 - px0 < 2 || py1 - py0 < 2) return;   // (no pond on screen)
  GD_MIR.M.value.multiplyMatrices(_gmB, VPm);   // (a point in the world to where it is in the mirrored picture, 0 to 1)
  // the camera's view cut down to that rectangle (the rest is never drawn)
  const nx0 = px0/w*2 - 1, nx1 = px1/w*2 - 1, ny0 = py0/h*2 - 1, ny1 = py1/h*2 - 1;
  _gmI.set(2/(nx1 - nx0), 0, 0, -(nx1 + nx0)/(nx1 - nx0), 0, 2/(ny1 - ny0), 0, -(ny1 + ny0)/(ny1 - ny0), 0, 0, 1, 0, 0, 0, 0, 1);
  vc.projectionMatrix.multiplyMatrices(_gmI, _gmP); vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
  vc.layers.enableAll(); vc.layers.disable(6);
  // draw it (the water and the floating pads left out; the shadows not redrawn for it; the renderer's state put back)
  const rt = GD_MIR.rt, prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha(), shUp = renderer.shadowMap.needsUpdate;
  renderer.getClearColor(_gmCol);
  const pads = GD_FX.mesh ? [GD_FX.mesh.pad, GD_FX.mesh.sol, GD_FX.mesh.blo] : [], padVis = pads.map(m => m.visible);
  GD_WATER_MAT.visible = false; pads.forEach(m => m.visible = false); renderer.shadowMap.needsUpdate = false;
  let hid = [];
  const res0 = FOL_UNI.res.value.clone(); FOL_UNI.res.value.set(px1 - px0, py1 - py0);   // (the plants snap to whole pixels of the picture being drawn: this rectangle)
  try {
    hid = gdMirFilter();
    rt.viewport.set(px0, py0, px1 - px0, py1 - py0); rt.scissor.set(px0, py0, px1 - px0, py1 - py0); rt.scissorTest = true;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.clear(true, true, false);
    if (typeof CUT_UNDER !== 'undefined') CUT_UNDER = true;   // (the buildings' undersides too: world.js cutBefore)
    renderer.render(scene, vc);
    GD_MIR.on = true; GD_MIR.use.value = 1;
  } finally {
    if (typeof CUT_UNDER !== 'undefined') CUT_UNDER = false;
    for (const o of hid) o.visible = true; hid.length = 0;
    FOL_UNI.res.value.copy(res0); GD_WATER_MAT.visible = true; pads.forEach((m, i) => m.visible = padVis[i]); renderer.shadowMap.needsUpdate = shUp;
    rt.scissorTest = false; renderer.setRenderTarget(prevRT); renderer.setClearColor(_gmCol, prevAlpha); renderer.autoClear = prevAuto;
  }
}
