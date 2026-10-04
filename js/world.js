// Neon Terrarium: The game world: cells, building stacks, batching, edits, build and remove animations, saving, picking.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ================= GAME: grow the floating platform and build zones on it, Townscaper style ================= */
// The world is a grid of cells, LOT apart. A cell is a piece of floating platform; it can hold a stack of floors,
// each floor belonging to a zone. Every piece is generated from a seed made of its grid position and floor number,
// so editing one spot never reshuffles anything else.
const ZONES = {
  low:  { key:'A', name:'Residential', col:'#38E8E0' },
  mid:  { key:'B', name:'Commercial',  col:'#FFB347' },
  high: { key:'C', name:'Luxury',      col:'#FF4FA3' },
  ind:  { key:'D', name:'Industrial',  col:'#E8E03A' },
};
const GRID_MAX = 100, MAX_LEVELS = 12;   // about 760 units in every direction from the start
const cells = new Map();
const ckey = (i,j) => i + ',' + j;
const SIDES4 = [[1,0],[-1,0],[0,1],[0,-1]];
const world = new THREE.Group(); scene.add(world); city = world;
let connGroup = null, curPorts = null, EXT = 12;
const camT = new THREE.Vector3(0, TARGET_Y, 0), camGoal = new THREE.Vector3(0, TARGET_Y, 0);
// The style (clutter, greenery, neon) of every piece is stored with it when it is built. Generation reads S.clutter,
// S.green and S.neon, so each piece is generated with its own stored values swapped in.
const STYLE_KEY = 'neonIsland.style';
const STYLE = (() => { try { const d = JSON.parse(localStorage.getItem(STYLE_KEY) || 'null'); if (d) return { clutter: d.clutter === undefined ? 1 : +d.clutter, green: d.green === undefined ? 1 : +d.green, neon: d.neon === undefined ? 1 : +d.neon }; } catch (e) {} return { clutter: 1, green: 1, neon: 1 }; })();
function saveStyle(){ try { localStorage.setItem(STYLE_KEY, JSON.stringify(STYLE)); } catch (e) {} }
const styleNow = () => ({ clutter: STYLE.clutter, green: STYLE.green, neon: STYLE.neon });
const DEFAULT_STYLE = { clutter: 1, green: 1, neon: 1 };
function withStyle(st, fn){
  const was = { clutter: S.clutter, green: S.green, neon: S.neon }, u = st || DEFAULT_STYLE;
  S.clutter = u.clutter === undefined ? 1 : u.clutter; S.green = u.green === undefined ? 1 : u.green; S.neon = u.neon === undefined ? 1 : u.neon;
  try { return fn(); } finally { S.clutter = was.clutter; S.green = was.green; S.neon = was.neon; }
}
function hash(...a){ let h = 2166136261; for (const v of a){ const s = String(v); for (let k=0;k<s.length;k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } } return h >>> 0; }

// run a builder into its own group: the kit functions (box, plant, glow...) write into these globals
// Generating a piece produces data only (geometry per material, plant instances, glow points).
// Nothing is drawn per piece: pieces are batched into regions (see rebuildRegion).
// Every static toon material is folded into ONE material: its colour and glow ride along as vertex attributes,
// so a whole building is a single draw call no matter how many materials it was modelled with.
const ATLAS = new THREE.MeshToonMaterial({ color:0xffffff, gradientMap:gradTex, vertexColors:true });
ATLAS.onBeforeCompile = sh => {
  sh.uniforms.emI = EM_I; sh.uniforms.fTime = FOL_UNI.time; sh.uniforms.lodFine = LOD.fine; sh.uniforms.lightsOn = LIGHTS_ON;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aEm; attribute float aFlk; attribute float aFine; attribute float aOn; uniform float emI[7]; uniform float fTime; uniform float lodFine; uniform float lightsOn; varying vec3 vEmis;' + FLK_GLSL + BLINK_GLSL + LIT_GLSL)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + LOD_CULL_GLSL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nint ek = int(aEm.a*255.0 + .5); float lon = ek >= 1 && ek <= 4 ? litOn(aOn, lightsOn, fTime) : 1.0; vEmis = aEm.rgb * mix(ek == 1 ? .22*(1.0 - .6*lightsOn) : 0.0, emI[ek], lon) * flicker(aFlk, fTime);   // a switched-off window is just a dim room\nif (ek == 6) vEmis *= mix(0.05, 1.0, blink((modelMatrix * vec4(transformed, 1.0)).y, fTime));');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEmis;')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmis;');
};
const atlasable = m => m && m.isMeshToonMaterial && !m.map && m !== M.cloud && m !== ATLAS;
function collect(fn){
  buckets = new Map(); emitters = []; carPads = []; curPorts = []; glowList = {}; curSpots = [];
  for (const k in SPR.size) FOL_LIST[k] = [];
  fn();
  const geo = new Map();
  let nAt = 0;
  for (const [mat, b] of buckets){ if (atlasable(mat)) nAt += b.p.length/3; else geo.set(mat, bucketGeometry(b)); }
  if (nAt){
    const pos = new Float32Array(nAt*3), nrm = new Float32Array(nAt*3), col = new Uint8Array(nAt*3), em = new Uint8Array(nAt*4), flk = new Uint8Array(nAt), fine = new Uint8Array(nAt), ons = new Uint8Array(nAt);
    let o = 0;
    for (const [mat, b] of buckets){
      if (!atlasable(mat)) continue;
      const n = b.p.length/3; pos.set(b.p, o*3); nrm.set(b.n, o*3);
      const r = Math.round(mat.color.r*255), gg = Math.round(mat.color.g*255), bl = Math.round(mat.color.b*255);
      for (let i=o;i<o+n;i++){ col[i*3] = r; col[i*3+1] = gg; col[i*3+2] = bl; }
      const k = mat.userData.glow;
      if (k){ const er = Math.min(255, Math.round(mat.emissive.r*255)), eg = Math.min(255, Math.round(mat.emissive.g*255)), eb = Math.min(255, Math.round(mat.emissive.b*255)), ek = EM_KIND[k] || 5;
        for (let i=o;i<o+n;i++){ em[i*4] = er; em[i*4+1] = eg; em[i*4+2] = eb; em[i*4+3] = ek; } }
      if (b.f){ flk.set(b.f, o); ons.set(b.o, o); }
      fine.set(b.d, o);
      o += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.setAttribute('aEm', new THREE.BufferAttribute(em, 4, true));
    g.setAttribute('aFlk', new THREE.BufferAttribute(flk, 1)); g.setAttribute('aFine', new THREE.BufferAttribute(fine, 1)); g.setAttribute('aOn', new THREE.BufferAttribute(ons, 1, true));
    geo.set(ATLAS, g);
  }
  for (const g of geo.values()) g.computeBoundingSphere();
  const fol = {}; for (const k in FOL_LIST) if (FOL_LIST[k].length) fol[k] = FOL_LIST[k];
  const out = { geo, fol, glows: glowList, emitters, pads: carPads, ports: curPorts, spots: curSpots };
  glowList = null; buckets = new Map(); curSpots = null;
  return out;
}
function disposeData(d){ if (d) for (const g of d.geo.values()) g.dispose(); }
function disposeGroup(g){ g.traverse(o => { if (o.isMesh || o.isPoints) o.geometry.dispose(); }); }
// one group for many pieces: a single mesh per material, one instanced batch per plant kind, one point batch per glow colour
function batchGroup(datas, withGeo = true){
  const g = new THREE.Group(), byMat = new Map(), fol = {}, gl = {};
  for (const d of datas){
    if (withGeo) for (const [m, geo] of d.geo){ let a = byMat.get(m); if (!a) byMat.set(m, a = []); a.push(geo); }
    for (const k in d.fol) fol[k] = (fol[k] || []).concat(d.fol[k]);
    for (const k in d.glows) gl[k] = (gl[k] || []).concat(d.glows[k]);
  }
  for (const [m, geos] of byMat){
    const merged = geos.length === 1 ? geos[0].clone() : THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, m);
    if (m.userData.colorOnly){ mesh.layers.set(1); mesh.renderOrder = 2; } else { mesh.castShadow = !m.userData.noCast; mesh.receiveShadow = true; }   // see-through glass: colour pass only
    g.add(mesh);
  }
  for (const k in SPR.size) FOL_LIST[k] = fol[k] || [];
  const saved = city; city = g; buildFoliage(); city = saved;
  if (Object.keys(gl).length) g.add(glowPoints(gl));
  return g;
}

/* ---------- a platform piece: slab, rock root, railings and greenery on the open edges ---------- */
// Each plot's greenery: 'some' (the usual plants, moss and vines), 'none' (bare: nothing growing, nothing hanging
// over the edges) or 'grass' (an empty plot laid to lawn). Clicking an empty plot with no zone picked cycles it,
// and whatever it's left on becomes the setting for the next plots you add.
const GREEN_MODES = ['some', 'none', 'grass'], GREEN_KEY = 'neonIsland.greenDefault';
let GREEN_DEFAULT = (() => { try { const v = localStorage.getItem(GREEN_KEY); return GREEN_MODES.includes(v) ? v : 'some'; } catch (e) { return 'some'; } })();

// A click on a plot that isn't on the current setting brings it to the current setting; a click on one that is
// moves it (and the setting) on to the next.
function cycleGreen(c){
  const cur = c.green || 'some';
  c.green = cur !== GREEN_DEFAULT ? GREEN_DEFAULT : GREEN_MODES[(GREEN_MODES.indexOf(cur) + 1) % GREEN_MODES.length];
  GREEN_DEFAULT = c.green; try { localStorage.setItem(GREEN_KEY, GREEN_DEFAULT); } catch (e) {}
  refresh([c]); save(); sfx.play('place');
}
// the lawn: 16px grass tiles from the sheet (assets/floor/grass.png: fine grass, tufts, long blades)
const GRASS_MAT = (() => { const t = new THREE.TextureLoader().load('assets/floor/grass.png'); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const m = toon(0xffffff); m.map = t; m.userData.noCast = true; return m; })();   // tinted down a little to sit with the city's palette
const _gq = new THREE.Vector3();
function lawn(P, n){
  let b = buckets.get(GRASS_MAT); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(GRASS_MAT, b); }
  const s = LOT/n;
  for (let i=0;i<n;i++) for (let j=0;j<n;j++){
    const k = 0, u0 = k/3 + .001, u1 = (k + 1)/3 - .001, x0 = -LOT/2 + i*s, z0 = -LOT/2 + j*s;
    const C = [[x0, z0, u0, 1], [x0 + s, z0, u1, 1], [x0 + s, z0 + s, u1, 0], [x0, z0 + s, u0, 0]];
    for (const q of [0, 2, 1, 0, 3, 2]){ const [cx, cz, u, v] = C[q]; _gq.set(cx, .058, cz).applyMatrix4(P); b.p.push(_gq.x, _gq.y, _gq.z); b.n.push(0, 1, 0); b.u.push(u, v); b.d.push(0); }
  }
}
// Places to sit on a lawn: two of a picnic blanket (people eat there, facing each other), a pair of spots side by
// side (friends chatting) and a little hologram projector (whoever sits there watches a show on it), in the
// quarters of the plot (the middle stays clear for a park lamp). Sitting spots on the ground, so the sitting
// people's legs-out pose sits on the grass.
const PICNIC = [0xb8433a, 0x3f6a9a, 0xd8b04a];
function lawnSpots(c, P){
  const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => R() - .5), kinds = ['picnic', 'pair', 'holo'].sort(() => R() - .5);
  const gy = CURB + .09, clear = [];   // sitting spots: drawn .09 lower, so on the ground
  for (let g = 0; g < 2; g++){
    const [qx, qz] = quads[g], ax = qx*rnd(.8, 1.05), az = qz*rnd(.8, 1.05), ry = rnd(0, PI), ca = Math.cos(ry), sa = Math.sin(ry);
    const at = (u, v) => [ax + u*ca - v*sa, az + u*sa + v*ca];   // a frame turned to ry round the anchor
    const kind = kinds[g];
    if (kind === 'picnic'){
      // the blanket itself is brought by whoever comes to picnic, and goes home with them (people.js)
      clear.push([ax, az, .34]);
      const pic = { x: c.x + ax, z: c.z + az, ry, col: Math.floor(R()*3) };
      for (const s of [-1, 1]){ const [sx, sz] = at(s*.42, 0); clear.push([sx, sz, .14]); spotAt(P, sx, gy, sz, 'seat', null, [ax - sx, az - sz], { act: 'eat', pic }); }
    } else if (kind === 'pair'){
      for (const s of [-1, 1]){ const [sx, sz] = at(s*.2, 0); const [fx, fz] = at(0, .5); clear.push([sx, sz, .14]); spotAt(P, sx, gy, sz, 'seat', null, [fx - ax, fz - az], { act: 'pair' }); }
    } else {
      // the projector: a little dark puck with a lit lens; the show appears over it while someone watches (people.js)
      cyl(M.metalDark, P, ax, .1, az, .09, .05); cyl(M.neonCyan, P, ax, .13, az, .04, .015); clear.push([ax, az, .16]);
      const ad = hash('holo', c.i, c.j, g) % 9, n = chance(.5) ? 2 : 1;
      for (let k = 0; k < n; k++){ const off = n === 2 ? (k ? .22 : -.22) : 0, [sx, sz] = at(off, .62); clear.push([sx, sz, .14]);
        spotAt(P, sx, gy, sz, 'seat', null, [ax - sx, az - sz], { act: 'holo', hx: c.x + ax, hz: c.z + az, ad }); }
    }
  }
  return clear;
}
function buildPlatform(c){
  NO_GREEN = c.green === 'none';
  try { buildPlatformBody(c); } finally { NO_GREEN = false; }
}
function buildPlatformBody(c){
  R = mulberry32(hash('plat', c.i, c.j));
  const x = c.x, z = c.z, P = T(x, 0, z);
  // a flat slab: its underside is plain panelling with seams, and now and then a lift pad, a round thruster housing
  // with a faint blue glow, so it reads as what holds the piece up
  box(M.slabSide, P, 0, -.35, 0, LOT + .02, .6, LOT + .02);
  for (const t of [-LOT/4, 0, LOT/4]){ box(M.slabSeam, P, t, -.655, 0, .04, .02, LOT - .1); box(M.slabSeam, P, 0, -.655, t, LOT - .1, .02, .04); }
  for (const s2 of [-1, 1]) box(M.slabSeam, P, 0, -.12, s2*(LOT/2 + .012), LOT + .02, .05, .02);
  for (const s2 of [-1, 1]) box(M.slabSeam, P, s2*(LOT/2 + .012), -.12, 0, .02, .05, LOT + .02);
  // the lift pads hang near the open edges, where you can see them under the rim from the usual view
  const open = SIDES4.filter(([a, b]) => !cells.has(ckey(c.i + a, c.j + b)));
  const corners = CORNERS.filter(([sx, sz]) => open.some(([a, b]) => (a && a === sx) || (b && b === sz)));
  const pads = corners.length ? (R() < .55 ? 1 : 0) + (corners.length > 2 && R() < .3 ? 1 : 0) : 0;
  const used = []; c.lifts = [];
  for (let k=0; k<pads; k++){
    let cn; do cn = pick(corners); while (used.includes(cn) && used.length < corners.length); used.push(cn);
    const px = cn[0]*(LOT/2 - rnd(.55, .65)), pz = cn[1]*(LOT/2 - rnd(.55, .65)), r = rnd(.34, .42);
    cyl(M.metal, P, px, -.68, pz, r + .16, .06);                       // a collar where it meets the slab
    cyl(M.metalDark, P, px, -1.05, pz, r, .72);                        // the column, hanging well below the slab
    for (const y of [-.85, -1.15]) cyl(M.slabSeam, P, px, y, pz, r + .03, .05);   // bands round it
    put(U.cone, M.metalDark, under(P, T(px, -1.52, pz, 0, 2*(r + .16), .3, 2*(r + .16))));   // the flared pad
    cyl(M.slabSeam, P, px, -1.68, pz, r + .17, .05);                   // its lip
    cyl(M.padGlow, P, px, -1.71, pz, r + .08, .03);                    // the emitter face
    for (let a = 0; a < 4; a++){ const ca = Math.cos(a*PI/2 + PI/4), sa = Math.sin(a*PI/2 + PI/4);
      strut(M.metalDark, P, px + ca*r, -1.25, pz + sa*r, px + ca*(r + .32), -.66, pz + sa*(r + .32), .05); }   // brackets
    c.lifts.push({ x: x + px, z: z + pz, r: r + .1 });
    glow(P, px, -1.75, pz, 'blue', .55 + r*.6); glow(P, px, -2.1, pz, 'cyan', 1.6);   // a small glow on the face, a faint haze below (fainter by day)
  }
  // open edges: railing, vines over the drop, plants along the rim, the odd pipe
  for (const [a,b] of SIDES4){
    if (cells.has(ckey(c.i + a, c.j + b))) continue;
    const E = T(x + a*LOT/2, 0, z + b*LOT/2, Math.atan2(a, b));
    for (let t = -LOT/2 + .15; t < LOT/2; t += .45) cyl(M.frame, E, t, .2, -.12, .025, .36);
    box(M.frame, E, 0, .37, -.12, LOT, .035, .035);
    for (let t = -LOT/2 + .3; t < LOT/2 - .2; t += .5){
      if (chance(.45*S.green)) plant(hangKind(), E, t, .02, .03, rnd(.8,1.1), 't', true);
      if (chance(.2*S.green)) plant(bigKind(), E, t, .03, -.35, rnd(.6,.85));
      else if (chance(.25)) floorBig(E, t, .058, -.4, rnd(.7,.95));   // moss creeping in along the rim
    }
    if (chance(.3)) cyl(M.rust, E, rnd(-1,1), -.4, .08, .08, rnd(1,2.2), 0, PI/2);
  }
  if (c.mega) return;   // a megastructure lays its own ground across its plots
  // surface: sidewalk and street round a building, or a small paved plaza when the spot is empty
  if (c.sections.length) groundLot({ x, z, cls: c.sections[0].zone, elev: 0, base: CURB, deck: false, cross: cells.has(ckey(c.i, c.j + 1)) });
  else {
    box(G.asph, P, 0, .012, 0, LOT, .025, LOT);
    if (c.green === 'grass'){   // laid to lawn, edge to edge, with grass growing up out of it
      lawn(P, 4);
      // a garden lawn: one kind of short grass, packed in an even overlapping grid so it reads as a single carpet
      const n = 20, st = LOT/n;
      const clear = lawnSpots(c, P);   // the blankets, projectors and sitting places, kept clear of tall grass
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
        const gx = -LOT/2 + (i + .5 + rnd(-.2, .2))*st, gz = -LOT/2 + (j + .5 + rnd(-.2, .2))*st;
        if (clear.some(([x, z, r]) => (gx - x)**2 + (gz - z)**2 < r*r)) continue;
        plant('gt0', P, gx, .06, gz, rnd(.24, .28)); }
    }
    else { const n = 7, st = LOT/n;
      for (let i=0;i<n;i++) for (let j=0;j<n;j++) if (!chance(.04)) box(pick(TILES.mid), P, (i-(n-1)/2)*st, .03, (j-(n-1)/2)*st, st - .05, .045, st - .05); }
    for (let k=0;k<(chance(.75) ? 1 : 0) + (chance(.2) ? 1 : 0);k++) plant(pick(['bush','bushFlower','g_fern3','bonsai']), P, rnd(-1.3,1.3), .05, rnd(-1.3,1.3), rnd(.7,.95));
    if (c.green !== 'grass') for (let k=0;k<irand(3,5);k++) floorBig(P, rnd(-1.3,1.3), .056, rnd(-1.3,1.3), rnd(.8,1.15));   // moss and vines grown over the paving
    if (chance(.4)){ const Pb = under(P, T(rnd(-.9,.9), .05, rnd(-.9,.9), pick([0, PI/2]))); box(M.wood, Pb, 0, .14, 0, .5, .04, .15); box(M.frame, Pb, 0, .07, 0, .42, .14, .1);
      for (const sx of [-.13, .13]) spotAt(Pb, sx, .16, 0, 'seat', null, [0, 1]); }
  }
  const lamp = ([sx,sz]) => { const Pl = T(x + sx*(LOT/2 - .25), 0, z + sz*(LOT/2 - .25));
    cyl(M.metalDark, Pl, 0, .65, 0, .03, 1.3); box(M.metalDark, Pl, .12, 1.3, 0, .26, .03, .03);
    KEEP_LIGHT = true; box(M.bulb, Pl, .24, 1.26, 0, .12, .05, .1); glow(Pl, .24, 1.2, 0, 'warm', 1.4); KEEP_LIGHT = false; };
  // part of a park (see parkCells): a tall garden lamp with a lantern globe, throwing a much wider pool of light,
  // on every park tile, so the whole green is lit at night
  const parkLamp = () => { const Pl = T(x, 0, z);
    cyl(M.metalDark, Pl, 0, .08, 0, .12, .16); cyl(M.metalDark, Pl, 0, 1.0, 0, .035, 1.85); cyl(M.metalDark, Pl, 0, 1.25, 0, .05, .06);
    for (const a of [0, PI/2, PI, -PI/2]) box(M.metalDark, Pl, Math.sin(a)*.07, 1.9, Math.cos(a)*.07, .02, .14, .02);
    KEEP_LIGHT = true; sph(M.bulb, Pl, 0, 2.02, 0, .13); cyl(M.metalDark, Pl, 0, 2.17, 0, .1, .04); glow(Pl, 0, 2.02, 0, 'warm', 2.3); KEEP_LIGHT = false; };
  // the park lamps stand in the middle of every other plot, on a checkerboard laid over the whole island, so
  // however the green grows they keep an even spacing (and the plots between are lit from the four around them)
  if (!c.sections.length && c.park){ if ((c.i + c.j) % 2 === 0) parkLamp(); }
  else if (c.sections[0] && c.sections[0].zone === 'mid'){}   // the commercial streets are lit by their shops, not lamps
  else if (chance(.45)) lamp(pick(CORNERS));   // a street lamp on one corner
  else if (DARK) lamp(CORNERS[hash('lamp', c.i, c.j) % 4]);   // a dark street always has its one failing lamp
}

/* ---------- a building: a stack of sections, each a complete building from the zone's set of types ---------- */
// A click builds a whole building. Clicking its roof stacks another complete section on top (any zone),
// and removing takes the top section off. Each section keeps its own seed, so the rest never changes.
const tankYard = (lot, st, P0) => buildTankYard(lot, P0);   // the round tanks on legs
const glassHotelTower = (lot, st, P0) => glassHotel(lot, st, P0, 'tower');
const glassHotelPodium = (lot, st, P0) => glassHotel(lot, st, P0, 'podium');
const SECTION_TYPES = {
  low:  { ground: [[buildTenement,6],[podHouse,1.5],[octoHouse,1.2],[deckHouse,1.3]], upper: [[buildTenement,5],[podHouse,2],[octoHouse,1.2]] },
  // the commercial quarter: shops under neon names, tiled-roof shops, stall streets, pagodas, glass and brutalist
  // towers, glass-dome markets, food plazas, and the market-street types; no longer the pod, octagon and deck
  // houses, which the residential blocks share
  mid:  { ground: [[signShop,3.4],[tiledShop,1.8],[foodDeck,1.2],[foodTower,1.4],[stallMarket,1.4],[pagodaHall,1],[glassTower,.75],[arcologyTower,.8],[domeMarket,.8],[foodPlaza,.8],
                   [billboardLot,.7],[buildShophouse,1],[platformTower,.7],[containerStack,.9],[spiralTower,.8],[cornerMarket,1]],
          upper: [[signShop,2.6],[foodDeck,2.4],[tiledShop,1.4],[buildShophouse,.9],[platformTower,.5],[containerStack,.7]] },
  high: { ground: [[buildTower,1]], upper: [[slabTower,2],[glassHotelTower,1.5],[glassHotelPodium,1],[roundTower,1],[twistTower,1],[gardenTower,1],[domeTower,1],[shellTower,1],[cascadeTerraces,.8]] },
  ind:  { ground: [[hall,1],[silos,1],[stiltFactory,1],[tankYard,1],[scrapShed,1],[gearWorkshop,1],[repairsBlock,1],[partsWarehouse,1],[lubeShed,.8],[stackedWorks,2.6],[decoWorks,1.1],[brutalTower,1.1]], upper: [[hall,2],[silos,1],[scrapShed,1],[repairsBlock,1],[partsWarehouse,1],[brutalTower,.6]] },
};
function pickWeighted(list){ const tot = list.reduce((s,[,w]) => s + w, 0); let r = R()*tot; for (const [f,w] of list){ if ((r -= w) <= 0) return f; } return list[0][0]; }
// The white garden-city towers only stack with each other: on a white luxury section only another white one goes
// up, and a white one only goes up on ground or on another white section (the other luxury types look jarring
// against them). Sections of other zones are left as they are.
const WHITE_TYPES = new Set([domeTower, shellTower, cascadeTerraces]);
const STALL_TYPES = new Set([stallMarket, foodDeck, foodTower, foodPlaza, billboardLot, domeMarket, cornerMarket]);
// A plot's building is its stack of sections. A plot with a side pod can have two: c.below, a building on the
// ground, and c.sections, the pod hanging over it on its scaffold (from c.lift.y), with a gap between them.
function buildStack(c){
  c.belowTop = null; c.belowTops = [];
  if (c.lift && c.below && c.below.length){ c.belowTop = stackRun(c, c.below, CURB, 'b', true); c.belowTops = c.sectionTops; c._topLot = null; }
  const y = stackRun(c, c.sections, c.lift ? c.lift.y : CURB, '', !c.belowTop);   // a side pod's stack starts up in the air, on its scaffold
  c.height = y;
  c.walks = null;
  if (c.lift) liftScaffold(c, c.lift.y);
  rooftopBoard(c, y);
  steamVent(c);
}
// one stack of sections from y; returns its top. (A section's look is seeded by its own number kh when it has one, so
// adding a section under a pod leaves the ones above as they were.)
function stackRun(c, secs, y, tag, first){
  let prevWhite = false, prevDeck = false;
  c.sectionTops = [];
  secs.forEach((sec, k) => {
    R = mulberry32(hash('sec', c.i, c.j, sec.kh ?? k, sec.zone, sec.seed));   // (the same whether a building stands under a pod or not, so it keeps its look)
    const st = STY[sec.zone], upper = k > 0, last = k === secs.length - 1;
    LUX = sec.zone === 'high' ? luxPalette(hash('lux', c.i, c.j, k, sec.seed)) : sec.zone === 'ind' ? indPalette(hash('ind', c.i, c.j, k, sec.seed)) : null;   // each district's own light colours
    const lot = { x: c.x, z: c.z, cls: sec.zone, elev: 0, base: y, signs: 0, occupied: true, height: 0, floors: 0 };
    lot.padOK = tag === 'b' ? (R(), false) : last && R() < .3;   // (under a pod: the same draw whatever's on top, so adding a section never re-rolls the one below it)
    if (upper){   // a deck for the new section to stand on
      box(M.concDD, T(c.x, y, c.z), 0, .05, 0, SIDE - .1, .1, SIDE - .1);
      box(pick(st.neonMats), T(c.x, y, c.z), 0, .02, (SIDE - .1)/2 + .015, SIDE - .1, .03, .03);
    }
    const P0 = T(c.x + rnd(-.1,.1), y + (upper ? .1 : 0), c.z + rnd(-.1,.1), rnd(-st.yaw, st.yaw));
    let types = SECTION_TYPES[sec.zone][upper ? 'upper' : 'ground'];
    if (upper && sec.zone === 'high') types = types.filter(([f]) => WHITE_TYPES.has(f) === prevWhite);
    if (upper && sec.zone === 'mid' && prevDeck) types = [[foodDeck, 5]].concat(types);   // decks of stalls like to pile up
    let builder = pickWeighted(types);
    if (sec.mf){ lot.mf = sec.mf; if (sec.zone === 'low') builder = buildTenement; else if (sec.zone === 'mid') builder = signShop; }   // built into a gap: a tenement (or shop) short enough to fit
    // most commercial buildings stand on a ring of market stalls opening onto the street (the stall streets, decks
    // and plazas are stalls already, so they stand on the ground)
    const onStalls = !upper && !sec.mf && sec.zone === 'mid' && !STALL_TYPES.has(builder) && hash('stallbase', c.i, c.j, sec.seed) % 100 < 60;
    let P1 = P0, hb = 0;
    NO_ROOF = !last || tag === 'b';   // (the building under a side pod: a flat roof for the scaffold to stand on)
    try { withStyle(sec.style, () => {
      if (onStalls){ stallBase(lot, st, P0); hb = lot.height; P1 = under(P0, T(0, hb, 0)); lot.base += hb; lot.height = 0; }
      builder(lot, st, P1);
    }); } finally { LUX = null; }
    NO_ROOF = false;
    if (onStalls){ lot.base -= hb; lot.height += hb; }
    prevWhite = !!lot.white; prevDeck = builder === foodDeck || builder === foodTower;
    y += (upper ? .1 : 0) + Math.max(lot.height, FH);
    c.sectionTops.push(y);
    if (k === 0 && first) c.firstFloors = lot.floors || 2;
    if (last && !lot.hasCarPad && R() < .7) addPerch({ x: c.x, z: c.z, height: y });
    if (last) c._topLot = lot;
  });
  return y;
}
/* ---------- side pods: a building hung off the side of a taller one ---------- */
// Clicking the side of a building high up (residential only, for now) hangs a one-section home in the air over the
// empty plot next to it: the pod stands on a plank deck on a DIY scaffold of pipes and posts down to the street, and
// a plank walkway with rails runs from it to a door in every neighbour tall enough to reach (one, or two either side,
// or more). A stair hut at the foot of the scaffold, with a ladder up, is the pod's front door for people on the
// street; the walkways' ends are noted (c.walks) so people can be seen crossing them (see people.js).
const LIFT_MIN = .9;   // the lowest a pod hangs (deck height above the street): room for people to walk under
// the deck height for a click at height y on the side of building c: snapped to a floor, with the pod's top no higher than c's roof
function liftSnap(c, y){
  // the section the pointer is on: a pod lines up with that section's floor (its deck on the top of the one below);
  // on the bottom section, with the floor the pointer is on, as long as it's above the ground floor
  const tops = c.sectionTops || [];
  let k = tops.findIndex(t => y < t); if (k < 0) k = tops.length - 1;
  let ly = k >= 1 ? tops[k - 1] : CURB + Math.max(1, Math.floor((y - CURB)/FH))*FH;
  if (ly < CURB + LIFT_MIN) return null;
  if (ly > c.height - .5) ly = c.height - .5;
  return ly;
}
// neighbours a pod at deck height y0 can tie into: a building that rises past the deck (a pod too, if it hangs lower)
function liftSupports(c, y0){
  const out = [];
  for (const d of SIDES4){
    const n = cells.get(ckey(c.i + d[0], c.j + d[1]));
    if (n && !n.mega && n.sections.length && n.height >= y0 + 1.0 && (!n.lift || n.lift.y <= y0 - .5)) out.push(d);
  }
  return out;
}
// The commercial pod's rig, after the night-market reference: heavy dark steel. Four lattice-truss towers at the corners
// with Warren girders between them every couple of metres, X-braced on every face; a thick grated deck; orange work
// lights on the joints and a red beacon on top; cables and ladders hanging below; a neon sign hung off the deck; and
// the walkways as truss bridges with lamps along them, to a steel door frame (with a neon name over it) in each neighbour.
const TRUSS = toon(0x2a3038), TRUSS2 = toon(0x3e3430), TRUSS_LIT = toon(0x5a2a10, { em: 0xff8a2a, kind: 'bulb' });
const COM_POD_SIGNS = [['sign_c_pawn', 'gold'], ['sign_c_open', 'pink'], ['sign_c_noodles', 'amber'], ['sign_c_techparts', 'cyan'], ['sign_c_hotel', 'cyan'], ['sign_c_robot', 'pink'], ['sign_c_mods', 'cyan'], ['sign_c_dataloan', 'pink']];
function trussCol(P, x, z, y0, y1, w, mat){   // a square lattice column: four chords, zigzag diagonals on each face, rings
  const h = w/2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(mat, P, x + sx*h, (y0 + y1)/2, z + sz*h, .05, y1 - y0, .05);
  const step = w*1.1;
  for (let y = y0, k = 0; y < y1 - .05; y += step, k++){
    const ya = y, yb = Math.min(y1, y + step);
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]){
      const f = k % 2; strut(mat, P, x + (f ? bx : ax), ya, z + (f ? bz : az), x + (f ? ax : bx), yb, z + (f ? az : bz), .018);
    }
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) box(mat, P, x + (ax + bx)/2, ya, z + (az + bz)/2, Math.abs(bx - ax) + .04, .035, Math.abs(bz - az) + .04);
  }
}
function trussBeam(P, ax, az, bx, bz, y, h, mat, r = .02){   // a Warren girder from a to b: top and bottom chords, zigzag web
  strut(mat, P, ax, y, az, bx, y, bz, r + .01); strut(mat, P, ax, y + h, az, bx, y + h, bz, r + .01);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L/(h*1.1)));
  for (let k = 0; k < n; k++){ const u0 = k/n, u1 = (k + 1)/n, up = k % 2;
    strut(mat, P, ax + (bx - ax)*u0, y + (up ? 0 : h), az + (bz - az)*u0, ax + (bx - ax)*u1, y + (up ? h : 0), az + (bz - az)*u1, r); }
}
function workLight(P, x, y, z){ box(M.metalDark, P, x, y, z, .09, .07, .09); box(TRUSS_LIT, P, x, y - .045, z, .07, .02, .07); glow(P, x, y - .06, z, 'orange', .38); }
function liftScaffoldCom(c, y0){
  R = mulberry32(hash('liftc', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), E = .9, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const mat = () => chance(.75) ? TRUSS : TRUSS2;
  // the deck: a thick steel slab with a grating, hazard-striped edges
  box(TRUSS, P, 0, y0 - .14, 0, 2.4, .2, 2.4);
  for (let x = -1.1; x <= 1.11; x += .12) box(M.metalDark, P, x, y0 - .03, 0, .03, .02, 2.32);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1])));
    for (let x = -1.15; x < 1.15; x += .2) box(Math.round(x*5) % 2 ? M.hazard : M.metalDark, F, x + .1, y0 - .2, 1.205, .2, .07, .01); }
  // the corner towers, and girders between them every couple of metres
  const tw = .34;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ trussCol(P, sx*E, sz*E, base, y0 - .24, tw, mat()); box(M.concDD, P, sx*E, base + .03, sz*E, .5, .06, .5); }
  const edges = [[-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]];
  for (let y = base + 1.3; y < y0 - .9; y += rnd(1.6, 2.1)) for (const [ax, az, bx, bz] of edges) trussBeam(P, ax, az, bx, bz, y, .3, mat());
  for (const [ax, az, bx, bz] of edges) trussBeam(P, ax, az, bx, bz, y0 - .58, .32, TRUSS);   // the deck girders
  // big X braces on two faces
  for (const [ax, az, bx, bz] of edges) if (chance(.5)){ strut(mat(), P, ax, base + .3, az, bx, y0 - .6, bz, .025); strut(mat(), P, bx, base + .3, bz, ax, y0 - .6, az, .025); }
  // work lights on the deck girders, a beacon on a corner
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (chance(.75)) workLight(P, sx*(E + .22), y0 - .3, sz*(E + .22));
  { const [sx, sz] = pick([[-1, -1], [1, -1], [1, 1], [-1, 1]]); cyl(M.metalDark, P, sx*1.15, y0 + .35, sz*1.15, .02, .7); beaconLight(P, sx*1.15, y0 + .74, sz*1.15, .07, .8); }
  // cables sagging down from the deck, a ladder hanging off one side
  for (let k = 0; k < irand(2, 4); k++){ const a = rnd(0, TAU), r = rnd(.6, 1.1); sagCable(P, Math.cos(a)*r, y0 - .25, Math.sin(a)*r, Math.cos(a + .6)*r*.6, y0 - rnd(1, 2.2), Math.sin(a + .6)*r*.6, rnd(.2, .5)); }
  // the street entrance: a steel booth with a lit shutter and a ladder cage up the scaffold (or a ladder from the roof below)
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));
    if (!onRoof){
      box(TRUSS, F, 0, base + .55, .78, .9, 1.1, .5); box(COM.shopLit, F, 0, base + .45, 1.035, .5, .7, .01); glow(F, 0, base + .5, 1.06, 'warm', .3);
      box(M.metalDark, F, 0, base + 1.12, .78, 1.0, .06, .6);
      plant('sign_c_open', under(F, T(0, 0, 1.04)), 0, base + .95, 0, .35, 'c', true);
    }
    const lz = onRoof ? .78 : .5, ly0 = onRoof ? base : base + 1.15;
    for (const s of [-1, 1]) box(M.metal, F, s*.17, (ly0 + y0)/2, lz, .03, y0 - ly0, .03);
    for (let y = ly0 + .15; y < y0 - .1; y += .2) box(M.metal, F, 0, y, lz, .34, .02, .02);
    for (let y = ly0 + .6; y < y0 - .3; y += .5){ put(U.torus, M.metalDark, under(F, T(0, y, lz + .1, 0, .5, .5, .3, PI/2))); }   // the cage hoops
  }
  // rails: steel posts and two rails, a neon sign hung off the deck's front (a side with no walkway, not the entrance)
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join());
    for (let x = -1.15; x <= 1.16; x += .38){ if (bridge && Math.abs(x) < .5) continue; box(TRUSS, F, x, y0 + .25, 1.17, .04, .5, .04); }
    for (const yy of [.48, .26]){ if (bridge){ box(TRUSS, F, -.83, y0 + yy, 1.17, .66, .03, .03); box(TRUSS, F, .83, y0 + yy, 1.17, .66, .03, .03); } else box(TRUSS, F, 0, y0 + yy, 1.17, 2.34, .03, .03); }
  }
  { const sd = free.filter(d => d !== hs); if (sd.length && chance(.85*S.neon)){ const d = pick(sd), F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), [sn, sc] = pick(COM_POD_SIGNS);
      box(M.metalDark, F, 0, y0 - .6, 1.26, 1.7, .5, .06); for (const s of [-1, 1]) box(M.metalDark, F, s*.7, y0 - .3, 1.22, .04, .1, .1);
      fitSign(under(F, T(0, 0, 1.3, 0)), sn, 0, y0 - .6, 0, 1.6, .8, sc); } }
  // the walkways: truss bridges over the street, lamps along them, to a steel door in each neighbour
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.2, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .8;
    box(TRUSS, F, 0, y0 - .1, zm, w + .1, .1, L);
    for (let z = z0 + .05; z < z1; z += .1) box(M.metalDark, F, 0, y0 - .04, z, w - .04, .015, .03);
    for (const s of [-1, 1]){ trussBeam(F, s*w/2, z0, s*w/2, z1, y0 - .05, .55, TRUSS, .016); box(TRUSS, F, s*w/2, y0 - .32, zm, .06, .06, L); }
    trussBeam(F, -w/2, z0 + .02, w/2, z0 + .02, y0 - .4, .3, TRUSS);   // under-girder
    for (let z = z0 + .3; z < z1 - .1; z += .7){ const s = Math.round(z/.7) % 2 ? 1 : -1; workLight(F, s*(w/2 + .02), y0 + .62, z); }
    if (chance(.6)) sagCable(F, -w/2 - .05, y0 - .2, z0 + .1, -w/2 - .05, y0 - .2, z1 - .1, .5);
    // the door in the neighbour: a heavy steel frame round a lit door, a neon name over it now and then
    box(TRUSS, F, 0, y0 + .52, z1 + .16, .82, 1.1, .36);
    box(M.metalDark, F, 0, y0 + .5, z1 - .03, .7, 1.04, .05);
    box(COM.shopLit, F, 0, y0 + .46, z1 - .06, .46, .86, .02);
    box(M.hazard, F, 0, y0 + 1.04, z1 - .06, .7, .05, .03);
    if (chance(.5*S.neon)){ const [sn, sc] = pick(COM_POD_SIGNS); fitSign(under(F, T(0, 0, z1 - .08, PI)), sn, 0, y0 + 1.3, 0, .9, .5, sc); }
    glow(F, 0, y0 + .7, z1 - .1, 'warm', .4);
    box(M.metalDark, F, 0, y0 + .5, z0 + .02, .62, 1.0, .05); box(COM.shopLit, F, 0, y0 + .46, z0 + .05, .42, .84, .02);
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, z1 - .2).applyMatrix4(F);
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01 });
  }
}
function liftScaffold(c, y0){
  if (c.sections[0] && c.sections[0].zone === 'mid') return liftScaffoldCom(c, y0);   // a commercial pod: the heavy steel rig
  R = mulberry32(hash('lift', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), E = .98, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;   // on the roof of the building below, if there is one   // poles just inside the deck's corners, clear of the sidewalk's corners
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const tube = () => pick([M.metal, M.metal, M.rust, M.frame]);
  const wobble = () => rnd(-.03, .03);
  // the deck: planks on bearers, a little bigger than the pod
  box(M.frame, P, 0, y0 - .1, 0, 2.36, .08, 2.36);
  for (let x = -1.12; x <= 1.13; x += .16) box(pick([M.wood, M.wood, M.crate]), P, x, y0 - .03, 0, .14, .05, 2.3);
  // the uprights: four corners and a middle post or two, crooked, some steel, some timber
  const posts = [[-E, -E], [E, -E], [-E, E], [E, E]];
  if (chance(.7)) posts.push([0, chance(.5) ? E : -E]);
  if (chance(.5)) posts.push([chance(.5) ? E : -E, 0]);
  for (const [x, z] of posts){
    const wx = wobble(), wz = wobble();
    if (chance(.25)) box(M.wood, P, x, (base + y0 - .1)/2, z, .07, y0 - .1 - base, .07);
    else strut(tube(), P, x + wx, base, z + wz, x, y0 - .1, z, .03);
    box(M.concDD, P, x + wx, base + .02, z + wz, .14, .04, .14);   // a base plate
  }
  // ledgers round the frame every metre or so, and cross braces on a couple of faces
  for (let y = base + 1.0; y < y0 - .3; y += rnd(.85, 1.1)){
    for (const [ax, az, bx, bz] of [[-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]]) if (chance(.85)) strut(tube(), P, ax, y, az, bx, y + rnd(-.04, .04), bz, .02);
  }
  for (const [ax, az, bx, bz] of [[-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]]){
    if (!chance(.55)) continue;
    const yl = base + .25, yh = y0 - .15;
    strut(tube(), P, ax, yl, az, bx, yh, bz, .018); if (chance(.6)) strut(tube(), P, bx, yl, bz, ax, yh, az, .018);
  }
  // the stair hut and ladder: on a side with no walkway, the pod's front door at street level
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  if (onRoof){ const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));   // a building below: just a ladder up from its roof
    for (const s of [-1, 1]) strut(M.metal, F, s*.17, base, .8, s*.17, y0 + .55, .8, .018);
    for (let y = base + .15; y < y0 + .5; y += .2) box(M.metal, F, 0, y, .8, .34, .025, .025);
  } else { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));   // local +z out to that side
    const wall = pick([M.concW, M.concL, M.corrBlue, M.metal]), hz = .76;
    box(wall, F, 0, base + .52, hz, .8, 1.04, .42);                         // the hut: a little stair shed
    box(pick([M.rust, M.metalDark, M.corrBlue]), F, 0, base + 1.07, hz, .88, .05, .5, .12);   // a sloping tin roof
    box(M.bulb, F, .3, base + .95, hz + .22, .06, .05, .04); glow(F, .3, base + .92, hz + .25, 'warm', .35);   // a bare bulb by the door
    box(M.frame, F, 0, base + .5, hz + .215, .46, .02, .01);                 // a lintel strip over where the door goes
    if (chance(.6)) plant(pick(['bush', 'fern', 'bonsai']), F, .62, base, hz + .25, rnd(.55, .7));
    // the ladder from the hut's roof up through a gap in the deck
    for (const s of [-1, 1]) strut(M.metal, F, s*.17, base + 1.08, hz - .05, s*.17, y0 + .55, hz - .05, .018);
    for (let y = base + 1.2; y < y0 + .5; y += .2) box(M.metal, F, 0, y, hz - .05, .34, .025, .025);
  }
  // rails round the deck's open edges (a gap where a walkway leaves), with the odd plant pot and washing
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join());
    for (let x = -1.1; x <= 1.11; x += .55){ if (bridge && Math.abs(x) < .45) continue; cyl(tube(), F, x, y0 + .23, 1.15, .015, .46); }
    if (bridge){ strut(tube(), F, -1.1, y0 + .45, 1.15, -.42, y0 + .45, 1.15, .015); strut(tube(), F, .42, y0 + .45, 1.15, 1.1, y0 + .45, 1.15, .015); }
    else { strut(tube(), F, -1.1, y0 + .45, 1.15, 1.1, y0 + .45, 1.15, .015); if (chance(.35*S.clutter)) for (let x = -.8; x < .9; x += .4) if (chance(.6)) plant(laundryKind(), F, x, y0 + .45, 1.16, .8, 't', true); }
    if (chance(.4*S.green)) plant(pick(['bush', 'fern', 'succulent', 'bushFlower']), F, rnd(-.9, .9), y0, 1.02, rnd(.5, .65));
    if (chance(.35*S.green)) plant(hangKind(), F, rnd(-.9, .9), y0 - .12, 1.18, rnd(.6, .8), 't', true);
  }
  // the walkways: planks over the street to a door in each neighbour that reaches the deck
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.1, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .74;
    box(M.frame, F, 0, y0 - .09, zm, w + .08, .06, L);
    for (let z = z0 + .05; z < z1; z += .17) box(pick([M.wood, M.wood, M.crate]), F, 0, y0 - .035, z, w, .045, .14);
    for (const s of [-1, 1]){
      for (let z = z0 + .1; z < z1; z += .5) cyl(tube(), F, s*w/2, y0 + .23, z, .015, .46);
      strut(tube(), F, s*w/2, y0 + .45, z0, s*w/2, y0 + .45, z1 - .05, .015);
      strut(tube(), F, s*w/2, y0 - .1, zm, s*(w/2 + .05), y0 - .9, z0 + .1, .02);   // braces down to the scaffold
      strut(tube(), F, s*w/2, y0 - .1, zm + .3, s*w/2, y0 - .75, z1 - .05, .02);    // and back to the wall
    }
    // overhead: two tall poles at the ends, a bar across them, a string of bulbs or a line of washing
    const top = y0 + rnd(1.5, 1.9);
    for (const z of [z0 + .08, z1 - .08]) for (const s of [-1, 1]) strut(tube(), F, s*(w/2 + .02), y0, z, s*(w/2 + .02), top, z, .016);
    for (const s of [-1, 1]) strut(tube(), F, s*(w/2 + .02), top, z0 + .08, s*(w/2 + .02), top + rnd(-.06, .06), z1 - .08, .016);
    if (chance(.55)) bulbString(F, -w/2, top - .05, z0 + .1, w/2, top - .05, z1 - .1, .12);
    else if (chance(.7*S.clutter)) for (let z = z0 + .3; z < z1 - .2; z += .3) if (chance(.7)) plant(laundryKind(), F, 0, top - .02, z, .8, 't', true);
    // the door in the neighbour's wall: a frame, a lit door, a little step, set into the wall so no gap shows
    box(M.concDD, F, 0, y0 + .5, z1 + .18, .7, 1.02, .4);
    box(M.frame, F, 0, y0 + .5, z1 - .03, .62, 1.02, .04);
    box(pick([M.winLit, M.winLit, M.interiorPink || M.winLit]), F, 0, y0 + .46, z1 - .055, .44, .86, .02);
    box(M.metalDark, F, 0, y0 + 1.03, z1 - .1, .7, .04, .16);
    glow(F, 0, y0 + .7, z1 - .08, 'warm', .4);
    // and one on the pod's own side
    box(M.frame, F, 0, y0 + .5, z0 + .03, .6, 1.0, .05); box(M.winLit, F, 0, y0 + .46, z0 + .06, .42, .84, .02);
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, z1 - .2).applyMatrix4(F);
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01 });
  }
}
// Hologram billboards on the roofs: a small one on about half the commercial roofs, and on tall buildings of the
// commercial and residential zones now and then a big one on posts, with its slogan scrolling underneath. Picked from
// the plot and its top section, so a roof keeps its billboard through rebuilds. The two big wall holograms (the sign
// down a face, the air-filter picture) don't depend on the roof or the top section at all, so a building that has one
// keeps it as you stack more onto it (the roof billboards and the side board do change with the top section).
const airCells = new Set();   // the towers that may throw an air-filter hologram (whether or not there's room for it right now)
const AIR_HOLO_ODDS = 20;     // one commercial building in this many that hasn't got the wall hologram throws the big air-filter picture, which makes one in 30 overall
const WALL_HOLO_ODDS = 3;     // one commercial building in this many, once it's tall enough, wears a wall hologram
const WALL_HOLO_MIN_Y = 2.4;  // 'tall enough': stacking a section can make a building shorter (the whole stack is built afresh), but never
                              // below this for two or more sections, so a building that has a hologram keeps it as it grows
function rooftopBoard(c, y){
  const top = c.sections[c.sections.length - 1], lot = c._topLot; c._topLot = null;
  airCells.delete(c);
  if (!top || c.dark) return;
  const mid = c.sections.some(s => s.zone === 'mid');
  // A building has the wall hologram or the air-filter one, never both: the plots that get the wall hologram are
  // picked first, and the air-filter tower is picked from the others. Both picks come from the plot alone, so
  // stacking never swaps one for the other.
  const key = c.i + ',' + c.j, wallPick = window.WALL_FORCE === key || hash('wallholo', c.i, c.j) % WALL_HOLO_ODDS === 0;
  const airPick = window.AIR_FORCE === key || (!wallPick && hash('airholo', c.i, c.j) % AIR_HOLO_ODDS === 0);
  const hw = hash('wallside', c.i, c.j), wsd = SIDES4[hw & 3], wallOn = mid && y >= WALL_HOLO_MIN_Y && wallPick && !airPick;
  // one commercial building in WALL_HOLO_ODDS (and not an air-filter tower), tall enough, wears a hologram ad down one
  // face, as wide as the building, never out past its plot, from just under the roofline to the top of the ground floor
  if (wallOn){
    const Wd = 2.2, yb = CURB + FH + .1;   // the ground floor is left clear for the shopfront
    wallHologram(T(c.x + wsd[0]*1.18, yb, c.z + wsd[1]*1.18, Math.atan2(wsd[0], wsd[1])), Wd, y - .08 - yb, (hw >>> 4) % 50, (hw >>> 10) % WALL_CELLS.length);
  }
  // one tall commercial tower in thirty throws the huge air-filter hologram out over the street from its top floor.
  // The picture (three plots wide) hangs over the three plots in front of the tower, so it's thrown from the face whose
  // three front plots are the lowest, and only if they're all lower than the picture's bottom edge (else it would be
  // inside a building). When a neighbour changes, the tower is rebuilt (see refresh) and picks again.
  if (mid && (c.sections.length >= 3 || y >= 6) && y >= 5 && airPick){
    airCells.add(c);
    const ha = hash('airside', c.i, c.j), W = 3*LOT - .8, pair = (ha >>> 10) % 3, H = W*AIR_ASPECT[pair], yp = y - .6;
    const front = ([a, b]) => { let m = 0; for (let l = -1; l <= 1; l++){ const n = cells.get(ckey(c.i + a + (a ? 0 : l), c.j + b + (b ? 0 : l))); if (n) m = Math.max(m, n.height); } return m; };
    const sd = SIDES4.map((d, k) => [d, front(d) + ((ha >>> k*2) & 3)*.01]).sort((p, q) => p[1] - q[1])[0];
    if (sd[1] <= yp - H/2 - .3 || window.AIR_FORCE === c.i + ',' + c.j){
      const d = sd[0];
      airHologram(T(c.x + d[0]*1.12, yp, c.z + d[1]*1.12, Math.atan2(d[0], d[1])), W, H, 3.2, (ha >>> 4) % 50, window.AIR_PAIR !== undefined ? window.AIR_PAIR : pair);
    }
  }
  if (lot && lot.hasCarPad) return;   // a car pad on the roof: no roof billboard or side board
  const hv = hash('board', c.i, c.j, c.sections.length, top.seed), r = hv % 100;
  let size = -1;
  if ((top.zone === 'mid' || top.zone === 'low') && y > 4.5 && r < (top.zone === 'mid' ? 45 : 28)) size = y > 6.5 ? 2 : 1;
  else if (top.zone === 'mid' && r < 72) size = 0;
  // and on the commercial streets, often a board hung off the side of the building too, part way up (never on the
  // face that has the wall hologram)
  const sbs = SIDES4[(hv >>> 4) & 3];
  if (mid && y > 2.4 && (hv >>> 20) % 100 < 40 && !(wallOn && sbs === wsd)) sideBoard(c, y, hv);
  if (size < 0) return;
  const side = [[0, 1], [1, 0], [0, -1], [-1, 0]][(hv >>> 8) & 3], off = size ? .1 : .45;
  holoBoard(T(c.x + side[0]*off, y, c.z + side[1]*off, Math.atan2(side[0], side[1])), size, (hv >>> 11) % 9, (hv >>> 15) % 211);
}
// a billboard bracketed off a building's side wall, facing out over the street
function sideBoard(c, y, hv){
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]][(hv >>> 4) & 3], h = Math.max(1.4, y*(.45 + ((hv >>> 9) & 7)*.04));
  const off = 1.12, x = c.x + side[0]*off, z = c.z + side[1]*off, ry = Math.atan2(side[0], side[1]);
  const P = T(x, h, z, ry);
  for (const s of [-1, 1]){ box(M.metalDark, P, s*.45, .3, -.12, .06, .06, .3); box(M.metalDark, P, s*.45, .05, -.05, .05, .5, .05); }   // the brackets into the wall
  holoBoard(under(P, T(0, -.2, .05, 0)), 0, (hv >>> 13) % 9, (hv >>> 2) % 211);
}
// Steam vents: now and then a grate in the street beside a building breathes steam, and the mist (sky.js) gathers
// round it. Common by industry (about 3 plots in 10), rare elsewhere (1 in 25); picked from the plot's position, so a
// plot keeps its vent (or lack of one) through rebuilds.
let VENTS = [];
function steamVent(c){
  c.vent = null;
  const hv = hash('vent', c.i, c.j), ind = c.sections.some(s => s.zone === 'ind');
  if (hv % 100 >= (ind ? 30 : 4)) return;
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]][(hv >> 8) & 3], along = (((hv >> 12) & 255)/255 - .5)*1.4;
  const off = SIDE/2 + .32, x = c.x + side[0]*off + side[1]*along, z = c.z + side[1]*off + side[0]*along;
  const P = T(x, 0, z, side[0] ? PI/2 : 0);
  box(M.concDD, P, 0, .03, 0, .62, .04, .44);                                         // the kerb round the grate
  box(M.frame, P, 0, .045, 0, .52, .02, .34);
  for (let k=0; k<6; k++) box(M.metalDark, P, -.22 + k*.088, .058, 0, .04, .012, .32);   // slats
  box(M.neonAmber, P, .27, .06, .18, .04, .02, .04);                                   // a little warning light
  emitters.push(new THREE.Vector3(x, .1, z));
  emitters.push(new THREE.Vector3(x + .1, .1, z - .06));
  c.vent = { x, z, s: .75 + ((hv >> 20) & 63)/63*.5 };                                // how strongly it breathes
}

// About one building in seventy stands on a dark street: almost no light, and what's left flickers (see DARK in core.js)
const isDarkPlot = c => !!c.sections.length && !c.mega && hash('dark', c.i, c.j) % 70 === 0;
/* ---------- rebuilding ---------- */
// Pieces are batched in regions of REG x REG grid cells; an edit only re-batches the regions it touched.
const REG = 5, regions = new Map(), dirtyRegions = new Set();
const regKey = (i, j) => Math.floor(i/REG) + ',' + Math.floor(j/REG);
// a cell's solid geometry is drawn as its own mesh (usually one draw call); plants and glows are batched per region
function cellView(c){
  if (c.view){ world.remove(c.view); c.view = null; }
  if (!c.data) return;
  const g = new THREE.Group();
  for (const [m, geo] of c.data.geo){
    const mesh = new THREE.Mesh(geo, m);
    if (m.userData.colorOnly){ mesh.layers.set(1); mesh.renderOrder = 2; } else { mesh.castShadow = !m.userData.noCast; mesh.receiveShadow = true; }   // see-through glass: colour pass only
    g.add(mesh);
  }
  world.add(g); c.view = g;
}
function rebuildCell(c){
  finishAnimsOn(c);   // a neighbour's edit can rebuild a cell that is still animating
  disposeData(c.data);
  c.height = CURB;
  c.dark = isDarkPlot(c);
  DARK = c.dark;
  try { c.data = collect(() => { withStyle(c.style, () => buildPlatform(c)); if (c.sections.length) buildStack(c); }); } finally { DARK = false; }
  if (c.mega){ const m = megas.get(c.mega); if (m && m.roofH) c.height = m.roofH; }
  cellView(c);
  c.emitters = c.data.emitters; c.pads = c.data.pads; c.ports = c.data.ports;
  dirtyRegions.add(regKey(c.i, c.j));
}
function rebuildRegion(key){
  const old = regions.get(key);
  if (old){ world.remove(old); disposeGroup(old); regions.delete(key); }
  const datas = [...cells.values(), ...megas.values()].filter(c => c.data && regKey(c.i, c.j) === key).map(c => c.data);
  if (!datas.length) return;
  const g = batchGroup(datas, false); world.add(g); regions.set(key, g);
}
// Bridges and lines between neighbours: each pair is generated once and cached until either side changes
const pairCache = new Map();
// pairs are batched by region too, and a region's batch is only redone when its set of pairs changed
const connRegions = new Map();
function rebuildConnections(){
  const lots = [...cells.values()].filter(c => c.sections.length && !c.lift)
    .map(c => ({ i: c.i, j: c.j, style: c.sections[0].style, x: c.x, z: c.z, cls: c.sections[0].zone, height: c.sectionTops[0], base: CURB, firstFloors: c.firstFloors, floors: c.firstFloors }));
  const used = new Set(), byReg = new Map();
  for (const [a,b] of neighbors(lots)){
    const key = [a.x, a.z, b.x, b.z, a.height, b.height, a.cls, b.cls, a.firstFloors, b.firstFloors].map(v => typeof v === 'number' ? v.toFixed(2) : v).join('|') + '|' + JSON.stringify(a.style || DEFAULT_STYLE);
    used.add(key);
    let d = pairCache.get(key);
    if (!d){ CONV_SINK = []; d = collect(() => withStyle(a.style, () => connectPair(a, b))); d.conv = CONV_SINK; CONV_SINK = null; pairCache.set(key, d); }
    const rk = regKey(a.i, a.j);
    let r = byReg.get(rk); if (!r) byReg.set(rk, r = { keys: [], datas: [] });
    r.keys.push(key); r.datas.push(d);
  }
  for (const [rk, cr] of connRegions) if (!byReg.has(rk)){ world.remove(cr.group); disposeGroup(cr.group); connRegions.delete(rk); }
  for (const [rk, r] of byReg){
    const sig = r.keys.join('#'), cr = connRegions.get(rk);
    if (cr && cr.sig === sig) continue;
    if (cr){ world.remove(cr.group); disposeGroup(cr.group); }
    const g = batchGroup(r.datas); world.add(g); connRegions.set(rk, { sig, group: g });
  }
  for (const [k, d] of pairCache) if (!used.has(k)){ disposeData(d); pairCache.delete(k); }
  setConveyors([...pairCache.values()].flatMap(d => d.conv || []));
}
// a dock near the middle of the view, for drones that need a new home
function nearPort(){
  if (!ports.length) return undefined;
  const dd = p => (p.pad.x - camGoal.x)**2 + (p.pad.z - camGoal.z)**2;
  const near = ports.slice().sort((a, b) => dd(a) - dd(b)).slice(0, 10);
  return near[Math.floor(Math.random()*near.length)];
}
// after any change: refresh steam, drone perches, landing pads, traffic heights, framing
function syncAgents(){
  ports = []; carPads = []; emitters = [];
  for (const c of cells.values()){ ports.push(...c.ports); carPads.push(...c.pads); emitters.push(...c.emitters); }
  for (const m of megas.values()) if (m.data) emitters.push(...m.data.emitters);   // e.g. steam off the food carts
  for (const d of pairCache.values()) if (d.emitters) emitters.push(...d.emitters);   // steam leaking from the pipework between buildings
  portLots = [...cells.values()].map(c => ({ x: c.x, z: c.z, height: c.height }));
  VENTS = [...cells.values()].filter(c => c.vent).map(c => c.vent);   // steam vents, for the mist
  makeSteamMap(VENTS, [...cells.values()].flatMap(c => c.lifts || []));   // steam vents for the mist, lift pads for their shimmer
  setupSteam();
  for (const d of drones) if (!ports.includes(d.at) || (d.phase !== 'inside' && !ports.includes(d.to))){
    d.phase = 'inside'; d.g.visible = false; d.at = nearPort(); d.timer = 1 + Math.random()*2;
  }
  for (const c of tripCars) if (c.pad && !carPads.includes(c.pad)){ c.pad = null; c.phase = 'away'; c.g.visible = false; c.timer = 2 + Math.random()*4; }
  let top = 6; for (const c of cells.values()) if (c.height > top) top = c.height;
  for (const m of megas.values()) if (m.top > top) top = m.top;
  skyTop = top + 2.4;
  syncPeople();
  shadowDirty = true;
  save();
}
// the middle of everything built: where the camera starts, and where H jumps back to
function centerView(now = false){
  let x = 0, z = 0, n = 0;
  for (const c of cells.values()){ x += c.x; z += c.z; n++; }
  if (n) camGoal.set(x/n, TARGET_Y, z/n); else camGoal.set(0, TARGET_Y, 0);
  if (now) camT.copy(camGoal);
}
// Parks: lawn plots that touch each other side to side form a green; a green of four or more is a park, and its
// plots get the park lamps. Worked out over the whole island before every rebuild, and any plot whose status
// changed is rebuilt too (so painting the fourth tile lights up the other three).
function parkCells(){
  const changed = [], seen = new Set();
  for (const c of cells.values()){
    if (seen.has(c)) continue;
    const lawnish = q => q && !q.mega && !q.sections.length && q.green === 'grass';
    if (!lawnish(c)){ seen.add(c); if (c.park){ c.park = false; changed.push(c); } continue; }
    const group = [c], stack = [c]; seen.add(c);
    while (stack.length){ const q = stack.pop(); for (const [a, b] of SIDES4){ const n = cells.get(ckey(q.i + a, q.j + b)); if (n && !seen.has(n) && lawnish(n)){ seen.add(n); group.push(n); stack.push(n); } } }
    const park = group.length >= 4;
    for (const q of group) if (!!q.park !== park){ q.park = park; changed.push(q); }
  }
  return changed;
}
function refresh(list, megaList = []){
  list = list.concat(parkCells());
  // an air-filter hologram hangs over the plots in front of its tower, so a change next door rebuilds the tower too
  for (const a of airCells){
    if (cells.get(ckey(a.i, a.j)) !== a){ airCells.delete(a); continue; }
    const near = c => c && c !== a && Math.abs(c.i - a.i) <= 1 && Math.abs(c.j - a.j) <= 1;
    if (list.some(near) || megaList.some(m => (m.cells || []).some(near))) list.push(a);
  }
  // a side pod's walkways go to the neighbours tall enough to reach: a change next door rebuilds the pod, after the neighbour
  for (const c of [...list]) if (c) for (const [a, b] of SIDES4){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n && n.lift) list.push(n); }
  const todo = [...new Set(list)].filter(Boolean).sort((p, q) => (p.lift ? 1 : 0) - (q.lift ? 1 : 0));
  for (const c of todo) rebuildCell(c);
  // an air-filter tower picks its face from its neighbours' heights, so if one of them was only built after it in this
  // pass (loading a saved city builds every plot in one go), build the tower again now that they all stand
  for (const c of todo) if (airCells.has(c) && !anims.some(a => a.c === c)) rebuildCell(c);
  for (const m of megaList) rebuildMega(m);
  for (const k of dirtyRegions){ if (heldRegions.has(k)) pendingRegions.add(k); else rebuildRegion(k); } dirtyRegions.clear();
  rebuildConnections(); syncAgents();
}
function rebuildAll(){ refresh([...cells.values()], [...megas.values()]); }

/* ---------- edits ---------- */
const newCell = (i, j, sections = []) => ({ i, j, x: i*LOT, z: j*LOT, green: GREEN_DEFAULT, sections, sectionTops: [], firstFloors: 2, group: null, height: CURB, ports: [], pads: [], emitters: [] });
// Every edit plays out as a short animation (see "build and remove animations" below): the old look of the
// cell is kept aside, the new one is built, and a glowing outline and scan line sweep between them.
const PLAT_BOTTOM = -5.6;
function addPlatform(i, j, zone = null){
  if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX || cells.has(ckey(i,j))) return null;
  const c = newCell(i, j, zone ? [{ zone, seed: (Math.random()*1e9)|0, style: styleNow() }] : []);
  c.style = styleNow();
  cells.set(ckey(i,j), c);
  holdRegion(c);
  refresh([c, ...SIDES4.map(([a,b]) => cells.get(ckey(i+a, j+b)))]);
  startAnim(c, 'build', PLAT_BOTTOM, c.height + 1.2, zone, zone ? SIDE : LOT, null);
  if (zone) maybeSpawnMegas(c);
  return c;
}
function removePlatform(c){
  if (c.sections.length) return;
  finishAnimsOn(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  cells.delete(ckey(c.i, c.j)); dirtyRegions.add(regKey(c.i, c.j));
  refresh(SIDES4.map(([a,b]) => cells.get(ckey(c.i+a, c.j+b))));
  startAnim(c, 'remove', PLAT_BOTTOM, CURB + 1.4, null, LOT, old);
}
const MAX_SECTIONS = 4, MAX_HEIGHT = 24;
function addSection(c, zone){
  if (c.sections.length >= MAX_SECTIONS || c.height > MAX_HEIGHT) return;
  finishAnimsOn(c);
  holdRegion(c);
  const y0 = c.sections.length ? c.height : CURB, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.push({ zone, seed: (Math.random()*1e9)|0, style: styleNow() }); refresh([c]);
  dropView(old);   // the new look already contains everything below the new section
  startAnim(c, 'build', y0 - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c);
}
// hang a pod off the side of a taller building, over the empty plot c, its deck at height y
function addLift(c, y, zone){
  if (!c || c.mega || c.lift) return null;
  if (c.sections.length && y < c.height + FH - .05) return null;   // over a shorter building: a floor's gap at least
  finishAnimsOn(c);
  holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  if (c.sections.length){ c.below = c.sections; c.sections = []; }   // the building already there stays, under the pod
  c.lift = { y };
  c.sections.push({ zone, seed: (Math.random()*1e9)|0, style: styleNow() });
  if (c.below){ rebuildCell(c); disposeData(c.data); c.data = null; if (c.belowTop > c.lift.y - GAP_MERGE) c.lift.y = c.belowTop + FH; }   // its roof flattened for the scaffold may sit a touch differently
  refresh([c]);
  dropView(old);
  startAnim(c, 'build', c.below ? (c.belowTop ?? CURB) - .05 : CURB - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c);
  return c;
}
// the gap a pod needs under it; less than this and the pod and the building under it become one building
const GAP_MERGE = .85;
const groundTop = c => c.below && c.below.length ? (c.belowTop ?? CURB) : CURB;
function mergePod(c){ c.sections = (c.below || []).concat(c.sections); c.sections.forEach(s => { delete s.kh; }); c.below = null; c.lift = null; }
// a pod grows a section downward: the new section hangs under it, and the pod's deck drops by its height
function addPodDown(c, zone){
  if (!c.lift || c.sections.length >= MAX_SECTIONS) return null;
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.forEach((s, k) => { if (s.kh === undefined) s.kh = k; });
  const y0 = c.lift.y, gapF = Math.floor((y0 - groundTop(c) - (c.below && c.below.length ? .1 : 0) + .02)/FH);
  const sec = { zone, seed: (Math.random()*1e9)|0, style: styleNow(), kh: -1 - c.sections.length, mf: Math.max(1, gapF >= 2 ? gapF - 1 : gapF) };   // leaves a floor's gap, or fills the last one
  c.sections.unshift(sec);
  let h = 0;
  for (let tries = 0; tries < 4; tries++){
    rebuildCell(c); disposeData(c.data); c.data = null;          // a build to measure the new section
    h = c.sectionTops[0] - y0;
    const over = groundTop(c) + GAP_MERGE - (y0 - h);
    if (gapF < 2 || over <= 0 || sec.mf <= 1) break;
    sec.mf = Math.max(1, sec.mf - Math.ceil(over/FH));
  }
  const ny = y0 - h;
  if (gapF < 2 || ny - groundTop(c) < GAP_MERGE) mergePod(c); else c.lift.y = ny;
  refresh([c]); dropView(old);
  startAnim(c, 'build', CURB - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c); return c;
}
// a building on the ground under a pod (or a section more on it): if it reaches up to the pod, the two become one
function addBelowUp(c, zone){
  if (!c.lift) return null;
  if ((c.below || []).length >= MAX_SECTIONS) return null;
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  const y0 = groundTop(c), deck = c.below && c.below.length ? .1 : 0, gapF = Math.floor((c.lift.y - y0 - deck + .02)/FH);   // whole floors of room (a section on another stands on a thin deck)
  const sec = { zone, seed: (Math.random()*1e9)|0, style: styleNow(), mf: Math.max(1, gapF >= 2 ? gapF - 1 : gapF) };
  (c.below = c.below || []).push(sec);
  // build it; if it still reaches into the gap (a section under it can be re-rolled taller), try it a floor or two shorter
  for (let tries = 0; tries < 4; tries++){
    rebuildCell(c); disposeData(c.data); c.data = null;
    const over = c.belowTop - (c.lift.y - GAP_MERGE);
    if (gapF < 2 || over <= 0 || sec.mf <= 1) break;
    sec.mf = Math.max(1, sec.mf - Math.ceil(over/FH));
  }
  if (gapF < 2 || c.belowTop > c.lift.y - GAP_MERGE) mergePod(c);
  refresh([c]); dropView(old);
  startAnim(c, 'build', y0 - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c); return c;
}
function removeBelow(c){
  if (!c.below || !c.below.length) return;
  finishAnimsOn(c);
  const top = c.belowTop ?? CURB, zone = c.below[c.below.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.below.pop(); if (!c.below.length) c.below = null;
  refresh([c]);
  startAnim(c, 'remove', groundTop(c) - .05, top + 1.2, zone, SIDE, old);
}
function removeSection(c){
  if (!c.sections.length) return removePlatform(c);
  finishAnimsOn(c);
  const top = c.height, zone = c.sections[c.sections.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.pop(); if (!c.sections.length){ c.lift = null; if (c.below){ c.sections = c.below; c.below = null; } }   // the last of a pod takes its scaffold with it (and a building under it stays)
  refresh([c]);
  startAnim(c, 'remove', (c.sections.length ? c.height : CURB) - .05, top + 1.2, zone, SIDE, old);
}
// Delete mode: everything in a block of plots goes at once: megastructures that reach into it (whole), and every
// plot in it, buildings and platform alike, each with the removal sweep. One rebuild for the lot at the end.
function removeArea(r){
  const inR = (i, j) => i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1;
  for (const m of [...megas.values()]) if (m.i <= r.i1 && m.i + m.w - 1 >= r.i0 && m.j <= r.j1 && m.j + m.h - 1 >= r.j0) removeMega(m);
  const gone = [], touched = new Set();
  for (const c of [...cells.values()]){
    if (!inR(c.i, c.j) || c.mega) continue;
    finishAnimsOn(c);
    const top = c.sections.length ? c.height : CURB, zone = c.sections.length ? c.sections[0].zone : null;
    const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
    cells.delete(ckey(c.i, c.j)); dirtyRegions.add(regKey(c.i, c.j)); gone.push(c);
    startAnim(c, 'remove', PLAT_BOTTOM, top + 1.4, zone, LOT, old);
  }
  for (const c of gone) for (const [a, b] of SIDES4){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n) touched.add(n); }
  if (gone.length){ refresh([...touched]); save(); sfx.play('remove'); }
  return gone.length;
}
// the selection in delete mode: a red patch over the plots, with an outline
const selFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI/2), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: .26, depthTest: false, depthWrite: false }));
const selEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff4a5a, transparent: true, opacity: .95, depthTest: false }));
for (const o of [selFill, selEdge]){ o.layers.set(1); o.renderOrder = 999; o.visible = false; scene.add(o); }
function showAreaSel(r){
  if (!r){ selFill.visible = selEdge.visible = false; return; }
  const x = (r.i0 + r.i1)/2*LOT, z = (r.j0 + r.j1)/2*LOT, sx = (r.i1 - r.i0 + 1)*LOT - .2, sz = (r.j1 - r.j0 + 1)*LOT - .2;
  let top = CURB; for (const c of cells.values()) if (c.i >= r.i0 && c.i <= r.i1 && c.j >= r.j0 && c.j <= r.j1) top = Math.max(top, c.height);
  selFill.position.set(x, CURB + .09, z); selFill.scale.set(sx, 1, sz);
  const h = Math.min(top + .6, 30) + .7;
  selEdge.position.set(x, -.6 + h/2, z); selEdge.scale.set(sx, h, sz);
  selFill.visible = selEdge.visible = true;
}
function dropView(old){ if (old.view) world.remove(old.view); disposeData(old.data); }

/* ---------- build and remove animations ---------- */
// Building: an outline of the new piece glows in, then the piece is revealed from the bottom up behind a bright
// scan line in the zone's colour. Removing runs the other way: the scan line sweeps down and the piece is gone.
// A new piece's plants, signs and light glows appear when its sweep ends; a removed piece's go right away.
// Shadows redraw when a sweep ends.
renderer.localClippingEnabled = true;
const anims = [], heldRegions = new Map(), pendingRegions = new Set();
const OUTLINE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
function holdRegion(c){ const k = regKey(c.i, c.j); heldRegions.set(k, (heldRegions.get(k) || 0) + 1); }
function releaseRegion(k){
  const n = (heldRegions.get(k) || 1) - 1;
  if (n > 0){ heldRegions.set(k, n); return; }
  heldRegions.delete(k);
  if (pendingRegions.has(k)){ pendingRegions.delete(k); rebuildRegion(k); }
}
function animMaterials(u){
  const atlas = ATLAS.clone();
  atlas.clippingPlanes = [u.plane];
  atlas.onBeforeCompile = sh => {
    ATLAS.onBeforeCompile(sh);
    sh.uniforms.bandH = u.h; sh.uniforms.bandCol = u.col; sh.uniforms.bandOn = u.on;
    sh.vertexShader = sh.vertexShader.replace('varying vec3 vEmis;', 'varying vec3 vEmis; varying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vEmis;', 'varying vec3 vEmis; varying float vWY; uniform float bandH; uniform vec3 bandCol; uniform float bandOn;')
      .replace('totalEmissiveRadiance = vEmis;', 'totalEmissiveRadiance = vEmis + bandCol * bandOn * step(bandH - 0.16, vWY);');
  };
  atlas.customProgramCacheKey = () => 'animAtlas';
  const nrm = normalMat.clone(); nrm.clippingPlanes = [u.plane]; nrm.onBeforeCompile = normalMat.onBeforeCompile;
  return { atlas, nrm };
}
function startAnim(c, kind, y0, y1, zone, w, old, sound, opts = {}){
  const view = kind === 'build' ? c.view : old.view;
  const held = kind === 'build';   // plants and glows arrive when a build finishes, but leave as soon as a removal starts
  if (!view){ if (old) dropView(old); if (held) releaseRegion(regKey(c.i, c.j)); return; }
  const col = new THREE.Color(zone ? (ZONES[zone] ? ZONES[zone].col : zone) : '#e3d6bd');
  const u = { plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), kind === 'build' ? y0 : y1), h: { value: y0 }, col: { value: col.clone().multiplyScalar(1.6) }, on: { value: 1 } };
  const mats = animMaterials(u);
  view.traverse(o => { if (!o.isMesh) return; o.userData.baseMat = o.material; o.userData.baseLayer = o.layers.mask; o.material = o.material === ATLAS ? mats.atlas : o.material; if (!o.material.userData.colorOnly) o.layers.set(3); });
  if (kind === 'remove' && c.view) c.view.visible = false;   // what's left appears when the sweep is done
  const lineMat = () => new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const box = new THREE.LineSegments(OUTLINE_GEO, lineMat()), scan = new THREE.LineSegments(OUTLINE_GEO, lineMat());
  const by0 = Math.max(y0, kind === 'build' && !zone && y0 < -1 ? -.7 : y0);   // a bare platform's outline hugs the slab, not the rock under it
  const [wx, wz] = Array.isArray(w) ? w : [w, w];
  box.position.set(c.x, (by0 + y1)/2, c.z); box.scale.set(wx + .08, Math.max(.1, y1 - by0), wz + .08);
  scan.scale.set(wx + .2, .001, wz + .2);
  const lines = [box, scan];
  // a slow arrival (megastructures) adds a footprint drawn on the ground and two fainter scan lines trailing the first
  const foot = opts.slow && !opts.bare ? new THREE.LineSegments(OUTLINE_GEO, lineMat()) : null, trail = opts.slow ? [0, 1].map(() => new THREE.LineSegments(OUTLINE_GEO, lineMat())) : [];
  if (foot){ foot.position.set(c.x, by0 + .02, c.z); foot.scale.set(wx + .3, .001, wz + .3); lines.push(foot); }
  for (const l of trail){ l.scale.copy(scan.scale); lines.push(l); }
  for (const l of lines){ l.layers.set(1); l.renderOrder = 998; scene.add(l); }
  if (!opts.quiet){ if (sound) sfx.play(sound, { spread: 0 }); else sfx.play(kind === 'build' ? 'place' : 'remove'); }
  const a = { c, kind, view, old, u, mats, box, scan, foot, trail, lines, x: c.x, z: c.z, y0, by0, y1, wx, wz, t: 0, dur: opts.slow ? 4.6 : kind === 'build' ? .15 : .12, slow: !!opts.slow, bare: !!opts.bare, onEnd: opts.onEnd, cue: opts.cue, reg: regKey(c.i, c.j), held };
  anims.push(a);
  return a;
}
const easeOut = x => 1 - (1 - x)*(1 - x);
const easeInOut = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2;
// A megastructure's arrival, slow and deliberate (about four and a half seconds): its footprint is traced on the
// ground and pulses; a wireframe of the whole structure rises out of it; then the structure is revealed from the
// ground up behind a glowing scan line with two fainter ones trailing it, easing in and out; a last bright flash
// of the outline, and the glow dies away.
function slowAnim(a, p){
  const grow = easeInOut(clamp(p/.2, 0, 1)), q = easeInOut(clamp((p - .2)/.64, 0, 1));
  const h = a.y0 + (a.y1 - a.y0)*q;
  a.u.plane.constant = h; a.u.h.value = h;
  const pulse = .55 + .45*Math.sin(a.t*9);
  if (a.foot) a.foot.material.opacity = (p < .9 ? Math.min(1, p/.06) : (1 - p)/.1)*pulse;
  const top = a.by0 + (a.y1 - a.by0)*grow;
  a.box.position.y = (a.by0 + top)/2; a.box.scale.y = Math.max(.02, top - a.by0);
  const flash = p > .84 ? Math.sin(clamp((p - .84)/.16, 0, 1)*PI) : 0;
  a.box.material.opacity = a.bare ? 0 : p < .84 ? .35 + .4*pulse*Math.min(1, p/.1) : Math.max(0, .75*(1 - (p - .84)/.16) + flash);
  const on = h > a.y0 + .02 && h < a.y1 - .02;
  a.scan.position.set(a.x, h, a.z); a.scan.material.opacity = on ? 1 : 0;
  a.trail.forEach((l, k) => { const th = h - (k + 1)*.45; l.position.set(a.x, th, a.z); l.material.opacity = on && th > a.y0 ? .45/(k + 1) : 0; });
  a.u.on.value = p < .92 ? 1 : 0;
  a.u.col.value.copy(new THREE.Color(a.box.material.color)).multiplyScalar(1.6*(p < .84 ? 1 : 1 - (p - .84)/.16));
}
function updateAnims(dt){
  for (let i = anims.length - 1; i >= 0; i--){
    const a = anims[i]; a.t += dt;
    const p = Math.min(1, a.t/a.dur);
    if (a.slow){
      // a sound timed to the animation (cue.at seconds in), played once
      if (a.cue && !a.cued && a.t >= a.cue.at){ a.cued = true; sfx.play(a.cue.name, { spread: 0 }); }
      slowAnim(a, p); if (p >= 1) endAnim(i); continue;
    }
    let h, boxOp;
    if (a.kind === 'build'){
      const q = easeOut(clamp((p - .15)/.7, 0, 1));
      h = a.y0 + (a.y1 - a.y0)*q;
      boxOp = p < .15 ? p/.15 : p > .8 ? (1 - p)/.2 : 1;
    } else {
      const q = easeOut(clamp(p/.85, 0, 1));
      h = a.y1 - (a.y1 - a.y0)*q;
      boxOp = (p > .75 ? (1 - p)/.25 : 1) * ((a.t*40 % 1) < .7 ? 1 : .55);   // flickers as it goes
    }
    a.u.plane.constant = h; a.u.h.value = h;
    a.u.on.value = p < .97 ? 1 : 0;
    a.box.material.opacity = .9*boxOp;
    a.scan.position.set(a.x, h, a.z); a.scan.material.opacity = (h > a.y0 + .02 && h < a.y1 - .02) ? 1 : 0;
    if (p >= 1) endAnim(i);
  }
}
function endAnim(i){
  const a = anims[i]; anims.splice(i, 1);
  for (const l of a.lines){ scene.remove(l); l.material.dispose(); }
  a.view.traverse(o => { if (o.isMesh){ o.material = o.userData.baseMat || o.material; if (o.userData.baseLayer !== undefined) o.layers.mask = o.userData.baseLayer; else o.layers.set(0); } });
  a.mats.atlas.dispose(); a.mats.nrm.dispose();
  if (a.kind === 'remove'){ dropView(a.old); if (a.c.view) a.c.view.visible = true; }
  if (a.held) releaseRegion(a.reg);
  shadowDirty = true;
  if (a.onEnd) a.onEnd();
}
function finishAnimsOn(c){ for (let i = anims.length - 1; i >= 0; i--) if (anims[i].c === c) endAnim(i); }
function clearIsland(){
  while (anims.length) endAnim(anims.length - 1);
  for (const c of cells.values()){ disposeData(c.data); c.data = null; cellView(c); }
  for (const m of megas.values()){ disposeData(m.data); m.data = null; cellView(m); if (m.fx){ m.fx.dispose(); m.fx = null; } }
  megas.clear();
  for (const k of [...regions.keys()]){ world.remove(regions.get(k)); disposeGroup(regions.get(k)); regions.delete(k); }
  cells.clear();
  for (let i=-1;i<=1;i++) for (let j=-1;j<=1;j++) cells.set(ckey(i,j), newCell(i, j));
  rebuildAll(); centerView();
}

/* ---------- saving (this browser only) ---------- */
const SAVE_KEY = 'neonIsland.v2';
const MEGA_SAVE_KEY = 'neonIsland.megas';
function save(){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...cells.values()].map(c => [c.i, c.j, c.sections, c.style || DEFAULT_STYLE, c.green || 'some', c.lift ? c.lift.y : 0, c.lift && c.below ? c.below : 0])));
    localStorage.setItem(MEGA_SAVE_KEY, JSON.stringify([...megas.values()].map(m => ({ id: m.id, kind: m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels, seed: m.seed, centre: m.centre || undefined, rot: m.rot, si: m.si, sj: m.sj }))));
  } catch (e) {}
}
function load(){
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!Array.isArray(d) || !d.length) return false;
    for (const [i,j,secs,st,gr,lf,bl] of d){ const c = newCell(i, j, (secs || []).filter(s => s && ZONES[s.zone])); c.style = st || DEFAULT_STYLE; c.green = GREEN_MODES.includes(gr) ? gr : 'some'; if (lf > 0 && c.sections.length){ c.lift = { y: lf }; if (Array.isArray(bl)){ const b2 = bl.filter(s => s && ZONES[s.zone]); if (b2.length) c.below = b2; } } cells.set(ckey(i,j), c); }
    try { for (const m of JSON.parse(localStorage.getItem(MEGA_SAVE_KEY) || '[]')) { const mm = placeMega(m.kind, m.i, m.j, m.seed, m.w, m.h, m.levels, m.id || null); if (mm && m.centre) mm.centre = m.centre; if (mm && Number.isInteger(m.rot)) mm.rot = ((m.rot % 4) + 4) % 4; if (mm && Number.isInteger(m.si) && Number.isInteger(m.sj)){ mm.si = m.si; mm.sj = m.sj; } } } catch (e) {}
    return true;
  } catch (e) { return false; }
}

/* ---------- picking: what is under the pointer, and what a click there would do ---------- */
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _box3 = new THREE.Box3(), _hit = new THREE.Vector3();
function pickAt(cx, cy){
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  ray.setFromCamera(_ndc, cam);
  let best = null;
  const test = (c, kind) => {
    if (!ray.ray.intersectBox(_box3, _hit)) return;
    const d = _hit.distanceTo(ray.ray.origin);
    if (!best || d < best.d) best = { d, c, kind, p: _hit.clone() };
  };
  for (const c of cells.values()){
    if (c.mega){ _box3.min.set(c.x - LOT/2, CURB, c.z - LOT/2); _box3.max.set(c.x + LOT/2, c.height, c.z + LOT/2); test(c, 'mega'); }
    else if (c.sections.length){ _box3.min.set(c.x - SIDE/2, c.lift ? c.lift.y - .15 : CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.height, c.z + SIDE/2); test(c, 'bld');
      if (c.lift){   // under a pod: the building on the ground (if any), and the gap up to the pod
        const gt = groundTop(c);
        if (gt > CURB){ _box3.min.set(c.x - SIDE/2, CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, gt, c.z + SIDE/2); test(c, 'low'); }
        _box3.min.set(c.x - SIDE/2, gt, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.lift.y - .15, c.z + SIDE/2); test(c, 'gap');
      } }
    _box3.min.set(c.x - LOT/2, -.8, c.z - LOT/2); _box3.max.set(c.x + LOT/2, CURB, c.z + LOT/2); test(c, 'plat');
  }
  if (best) return best;
  // open sky: where the pointer ray crosses the platform height
  const o = ray.ray.origin, dir = ray.ray.direction;
  if (Math.abs(dir.y) < 1e-4) return null;
  const t = (CURB - o.y)/dir.y; if (t < 0) return null;
  const p = o.clone().addScaledVector(dir, t);
  return { kind: 'sky', p, i: Math.round(p.x/LOT), j: Math.round(p.z/LOT) };
}
// turn a pick into a build target
function targetOf(pk){
  if (!pk) return null;
  if (pk.kind === 'sky') return cells.has(ckey(pk.i, pk.j)) ? null : { type: 'empty', i: pk.i, j: pk.j };
  // under a pod: the top part of the gap grows the pod down; the bottom part, the ground and the roof of the building
  // under it build up from the ground
  if (pk.c && pk.c.lift && !pk.c.mega && (pk.kind === 'gap' || pk.kind === 'plat' || (pk.kind === 'low' && Math.abs(pk.p.y - groundTop(pk.c)) < .03))){
    const c = pk.c, gt = groundTop(c), mid = (gt + c.lift.y)/2;
    return pk.kind === 'gap' && pk.p.y > mid ? { type: 'podDown', c } : { type: 'belowUp', c };
  }
  const c = pk.c, top = pk.kind === 'plat' ? CURB : pk.kind === 'low' ? groundTop(c) : c.height;
  if (Math.abs(pk.p.y - top) < .03){
    if (c.mega){   // a megastructure's roof: another tier if it stacks, otherwise nothing builds there
      const m = megas.get(c.mega);
      return m && pk.kind === 'mega' && m.levels < MEGA_TYPES[m.kind].maxLevels ? { type: 'megaUp', m } : null;
    }
    return pk.kind === 'bld' ? { type: 'up', c } : { type: 'onto', c };
  }
  // a side face: build next door in that direction
  const dx = pk.p.x - c.x, dz = pk.p.z - c.z;
  const [a,b] = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const n = cells.get(ckey(c.i + a, c.j + b));
  if (n && n.mega) return null;
  // high up the side of a building, with residential picked and an empty plot next to it: hang a pod there
  // (open sky next door too: the platform grows under it)
  const inGrid = Math.abs(c.i + a) <= GRID_MAX && Math.abs(c.j + b) <= GRID_MAX;
  // (or over a shorter building next door, if there's a floor's gap between its roof and the pod)
  const shorter = n && n.sections.length && !n.lift && !n.mega;
  if ((S.zone === 'low' || S.zone === 'mid') && (pk.kind === 'bld' || pk.kind === 'low') && !c.mega && (n ? !n.sections.length || shorter : inGrid) && pk.p.y > CURB + FH){
    const host = pk.kind === 'low' ? { sectionTops: c.belowTops, height: groundTop(c) } : c;
    let ly = liftSnap(host, pk.p.y);
    if (ly !== null && shorter && ly < n.height + FH - .05){   // too low over the shorter building: the first floor of the tall one that clears it
      const need = n.height + FH - .05, cand = (host.sectionTops || []).concat([...Array(40)].map((_, q) => CURB + (q + 1)*FH)).filter(v => v >= need && v <= host.height - .5).sort((a, b) => a - b);
      ly = cand.length ? cand[0] : null;
    }
    if (ly !== null) return { type: 'side', c: n || null, i: c.i + a, j: c.j + b, y: ly, from: c };
  }
  return n ? { type: 'onto', c: n } : { type: 'empty', i: c.i + a, j: c.j + b };
}
function applyTarget(t){
  if (!t) return null;
  const zone = S.zone;
  if (t.type === 'empty') return addPlatform(t.i, t.j, zone);
  if (t.type === 'megaUp'){ if (zone) addMegaTier(t.m); return null; }
  if (t.type === 'podDown') return zone ? addPodDown(t.c, zone) : null;
  if (t.type === 'belowUp') return zone ? addBelowUp(t.c, zone) : null;
  if (t.type === 'onto' && t.c.lift){ return zone ? addBelowUp(t.c, zone) : null; }
  if (t.type === 'side'){ if (!zone) return null; const c = t.c || addPlatform(t.i, t.j, null); if (c) finishAnimsOn(c); return c ? addLift(c, t.y, zone) : null; }
  if (!zone && t.type === 'onto' && !t.c.mega && !t.c.sections.length){ cycleGreen(t.c); return t.c; }   // no zone picked: an empty plot's greenery cycles
  if (!zone || t.c.mega) return null;
  addSection(t.c, zone); return t.c;
}
function removeAt(pk){ if (!pk || pk.kind === 'sky') return; if (pk.c.mega) return removeMegaTier(megas.get(pk.c.mega)); if (pk.kind === 'low') return removeBelow(pk.c); removeSection(pk.c); }

/* ---------- hover outline showing where a click would build ---------- */
const hoverMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false });
const hover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), hoverMat);
hover.layers.set(1); hover.renderOrder = 999; hover.visible = false; scene.add(hover);
// a side pod's outline is filled too (in its own pink), so it stands out against the wall it hangs from
const hoverFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff5ad8, transparent: true, opacity: .22, depthTest: false, depthWrite: false }));
hoverFill.layers.set(1); hoverFill.renderOrder = 998; hoverFill.visible = false; scene.add(hoverFill);
function showHover(t){
  hoverFill.visible = false;
  if (!t){ hover.visible = false; return; }
  hoverMat.color.set(t && (t.type === 'side' || t.type === 'podDown') ? '#ff5ad8' : S.zone ? ZONES[S.zone].col : '#e3d6bd');   // a side pod: its own colour
  let x, z, y0, h, w, wz;
  if (t.type === 'megaUp'){
    if (!S.zone){ hover.visible = false; return; }
    const [sx, sz] = megaSize(t.m);
    hover.position.set(t.m.x, t.m.roofH + 1.6, t.m.z); hover.scale.set(sx - .6, 3.2, sz - .6); hover.visible = true; return;
  }
  if (t.type === 'empty'){
    x = t.i*LOT; z = t.j*LOT;
    if (S.zone){ y0 = CURB; h = FH*3; w = SIDE; } else { y0 = -.6; h = .68; w = LOT; }
  } else if (t.type === 'side'){ x = t.i*LOT; z = t.j*LOT; y0 = t.y; h = FH*2; w = SIDE; }
  else if (t.type === 'podDown'){ x = t.c.x; z = t.c.z; h = Math.min(FH*2, t.c.lift.y - groundTop(t.c)); y0 = t.c.lift.y - h; w = SIDE; }
  else if (t.type === 'belowUp'){ x = t.c.x; z = t.c.z; y0 = groundTop(t.c); h = Math.min(FH*2, Math.max(.3, t.c.lift.y - y0 - .1)); w = SIDE; }
  else if (t.type === 'onto'){ x = t.c.x; z = t.c.z; y0 = t.c.sections.length ? t.c.height : CURB; h = FH*3; w = SIDE; }
  else { x = t.c.x; z = t.c.z; y0 = t.c.height; h = FH*2; w = SIDE; }
  if (t.type !== 'empty' && !S.zone){ hover.visible = false; return; }
  hover.position.set(x, y0 + h/2, z); hover.scale.set(w, h, w); hover.visible = true;
  if (t.type === 'side' || t.type === 'podDown'){ hoverFill.position.copy(hover.position); hoverFill.scale.copy(hover.scale); hoverFill.visible = true; }
}

/* ---------- placing a megastructure from the Buildings menu: its footprint follows the pointer ---------- */
// the plot under the pointer at street level (ignores what stands there, so tall buildings don't get in the way)
function groundCellAt(cx, cy){
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  ray.setFromCamera(_ndc, cam);
  const o = ray.ray.origin, dir = ray.ray.direction; if (Math.abs(dir.y) < 1e-4) return null;
  const t = (CURB - o.y)/dir.y; if (t < 0) return null;
  const p = o.clone().addScaledVector(dir, t);
  return { i: Math.round(p.x/LOT), j: Math.round(p.z/LOT) };
}
const ghostFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI/2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, depthTest: false, depthWrite: false }));
const ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthTest: false }));
for (const o of [ghostFill, ghostEdge]){ o.layers.set(1); o.renderOrder = 999; o.visible = false; scene.add(o); }
let megaGhost = null;   // { kind, i, j, w, h, ok } while placing
function showMegaGhost(kind, cell, turned){
  if (!kind || !cell){ ghostFill.visible = ghostEdge.visible = false; megaGhost = null; return; }
  const b = megaBlockAt(kind, cell.i, cell.j, turned); megaGhost = Object.assign({ kind }, b);
  const col = b.ok ? MEGA_TYPES[kind].colour : '#ff3040';
  const x = (b.i + (b.w - 1)/2)*LOT, z = (b.j + (b.h - 1)/2)*LOT, sx = b.w*LOT - .3, sz = b.h*LOT - .3, h = 2.4;
  ghostFill.material.color.set(col); ghostEdge.material.color.set(col);
  ghostFill.position.set(x, CURB + .08, z); ghostFill.scale.set(sx, 1, sz);
  ghostEdge.position.set(x, CURB + h/2, z); ghostEdge.scale.set(sx, h, sz);
  ghostFill.visible = ghostEdge.visible = true;
}

function generate(){ rebuildAll(); }
