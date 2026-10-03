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
function buildStack(c){
  let y = CURB, prevWhite = false, prevDeck = false;
  c.sectionTops = [];
  c.sections.forEach((sec, k) => {
    R = mulberry32(hash('sec', c.i, c.j, k, sec.zone, sec.seed));
    const st = STY[sec.zone], upper = k > 0, last = k === c.sections.length - 1;
    LUX = sec.zone === 'high' ? luxPalette(hash('lux', c.i, c.j, k, sec.seed)) : sec.zone === 'ind' ? indPalette(hash('ind', c.i, c.j, k, sec.seed)) : null;   // each district's own light colours
    const lot = { x: c.x, z: c.z, cls: sec.zone, elev: 0, base: y, signs: 0, occupied: true, height: 0, floors: 0 };
    lot.padOK = last && R() < .3;
    if (upper){   // a deck for the new section to stand on
      box(M.concDD, T(c.x, y, c.z), 0, .05, 0, SIDE - .1, .1, SIDE - .1);
      box(pick(st.neonMats), T(c.x, y, c.z), 0, .02, (SIDE - .1)/2 + .015, SIDE - .1, .03, .03);
    }
    const P0 = T(c.x + rnd(-.1,.1), y + (upper ? .1 : 0), c.z + rnd(-.1,.1), rnd(-st.yaw, st.yaw));
    let types = SECTION_TYPES[sec.zone][upper ? 'upper' : 'ground'];
    if (upper && sec.zone === 'high') types = types.filter(([f]) => WHITE_TYPES.has(f) === prevWhite);
    if (upper && sec.zone === 'mid' && prevDeck) types = [[foodDeck, 5]].concat(types);   // decks of stalls like to pile up
    const builder = pickWeighted(types);
    // most commercial buildings stand on a ring of market stalls opening onto the street (the stall streets, decks
    // and plazas are stalls already, so they stand on the ground)
    const onStalls = !upper && sec.zone === 'mid' && !STALL_TYPES.has(builder) && hash('stallbase', c.i, c.j, sec.seed) % 100 < 60;
    let P1 = P0, hb = 0;
    NO_ROOF = !last;
    try { withStyle(sec.style, () => {
      if (onStalls){ stallBase(lot, st, P0); hb = lot.height; P1 = under(P0, T(0, hb, 0)); lot.base += hb; lot.height = 0; }
      builder(lot, st, P1);
    }); } finally { LUX = null; }
    NO_ROOF = false;
    if (onStalls){ lot.base -= hb; lot.height += hb; }
    prevWhite = !!lot.white; prevDeck = builder === foodDeck || builder === foodTower;
    y += (upper ? .1 : 0) + Math.max(lot.height, FH);
    c.sectionTops.push(y);
    if (k === 0) c.firstFloors = lot.floors || 2;
    if (last && !lot.hasCarPad && R() < .7) addPerch({ x: c.x, z: c.z, height: y });
    if (last) c._topLot = lot;
  });
  c.height = y;
  rooftopBoard(c, y);
  steamVent(c);
}
// Hologram billboards on the roofs: a small one on about half the commercial roofs, and on tall buildings of the
// commercial and residential zones now and then a big one on posts, with its slogan scrolling underneath. Picked from
// the plot and its top section, so a roof keeps its billboard through rebuilds. The two big wall holograms (the sign
// down a face, the air-filter picture) don't depend on the roof or the top section at all, so a building that has one
// keeps it as you stack more onto it (the roof billboards and the side board do change with the top section).
const WALL_HOLO_ODDS = 3;     // one commercial building in this many, once it's tall enough, wears a wall hologram
const WALL_HOLO_MIN_Y = 2.4;  // 'tall enough': stacking a section can make a building shorter (the whole stack is built afresh), but never
                              // below this for two or more sections, so a building that has a hologram keeps it as it grows
function rooftopBoard(c, y){
  const top = c.sections[c.sections.length - 1], lot = c._topLot; c._topLot = null;
  if (!top || c.dark) return;
  const mid = c.sections.some(s => s.zone === 'mid');
  // one commercial building in WALL_HOLO_ODDS, tall enough, wears a hologram ad down one face, as wide as the
  // building, never out past its plot, from just under the roofline to the top of the ground floor
  const hw = hash('wallside', c.i, c.j), wsd = SIDES4[hw & 3], wallOn = mid && y >= WALL_HOLO_MIN_Y && (window.WALL_FORCE === c.i + ',' + c.j || hash('wallholo', c.i, c.j) % WALL_HOLO_ODDS === 0);
  if (wallOn){
    const Wd = 2.2, yb = CURB + FH + .1;   // the ground floor is left clear for the shopfront
    wallHologram(T(c.x + wsd[0]*1.18, yb, c.z + wsd[1]*1.18, Math.atan2(wsd[0], wsd[1])), Wd, y - .08 - yb, (hw >>> 4) % 50, (hw >>> 10) % WALL_CELLS.length);
  }
  // one tall commercial tower in thirty throws the huge air-filter hologram out over the street from its top floor
  if (mid && (c.sections.length >= 3 || y >= 6) && y >= 5 && (window.AIR_FORCE === c.i + ',' + c.j || hash('airholo', c.i, c.j) % 30 === 0)){
    // facing the lowest neighbour (open sky, a park, the shortest roof), so the picture isn't buried in a tower
    const ha = hash('airside', c.i, c.j), nb = ([a, b]) => { const n = cells.get(ckey(c.i + a, c.j + b)); return n ? n.sections.length : -1; };
    const sd = SIDES4.map((d, k) => [d, nb(d)*4 + ((ha >>> k*2) & 3)]).sort((p, q) => p[1] - q[1])[0][0], yp = y - .6, W = 3*LOT - .8, pair = (ha >>> 10) % 3, H = W*AIR_ASPECT[pair];
    airHologram(T(c.x + sd[0]*1.12, yp, c.z + sd[1]*1.12, Math.atan2(sd[0], sd[1])), W, H, 3.2, (ha >>> 4) % 50, window.AIR_PAIR !== undefined ? window.AIR_PAIR : pair);
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
  const lots = [...cells.values()].filter(c => c.sections.length)
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
  for (const c of new Set(list)) if (c) rebuildCell(c);
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
function removeSection(c){
  if (!c.sections.length) return removePlatform(c);
  finishAnimsOn(c);
  const top = c.height, zone = c.sections[c.sections.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.pop(); refresh([c]);
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
    localStorage.setItem(SAVE_KEY, JSON.stringify([...cells.values()].map(c => [c.i, c.j, c.sections, c.style || DEFAULT_STYLE, c.green || 'some'])));
    localStorage.setItem(MEGA_SAVE_KEY, JSON.stringify([...megas.values()].map(m => ({ id: m.id, kind: m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels, seed: m.seed, centre: m.centre || undefined }))));
  } catch (e) {}
}
function load(){
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!Array.isArray(d) || !d.length) return false;
    for (const [i,j,secs,st,gr] of d){ const c = newCell(i, j, (secs || []).filter(s => s && ZONES[s.zone])); c.style = st || DEFAULT_STYLE; c.green = GREEN_MODES.includes(gr) ? gr : 'some'; cells.set(ckey(i,j), c); }
    try { for (const m of JSON.parse(localStorage.getItem(MEGA_SAVE_KEY) || '[]')) { const mm = placeMega(m.kind, m.i, m.j, m.seed, m.w, m.h, m.levels, m.id || null); if (mm && m.centre) mm.centre = m.centre; } } catch (e) {}
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
    else if (c.sections.length){ _box3.min.set(c.x - SIDE/2, CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.height, c.z + SIDE/2); test(c, 'bld'); }
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
  const c = pk.c, top = pk.kind === 'plat' ? CURB : c.height;
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
  return n ? { type: 'onto', c: n } : { type: 'empty', i: c.i + a, j: c.j + b };
}
function applyTarget(t){
  if (!t) return null;
  const zone = S.zone;
  if (t.type === 'empty') return addPlatform(t.i, t.j, zone);
  if (t.type === 'megaUp'){ if (zone) addMegaTier(t.m); return null; }
  if (!zone && t.type === 'onto' && !t.c.mega && !t.c.sections.length){ cycleGreen(t.c); return t.c; }   // no zone picked: an empty plot's greenery cycles
  if (!zone || t.c.mega) return null;
  addSection(t.c, zone); return t.c;
}
function removeAt(pk){ if (!pk || pk.kind === 'sky') return; if (pk.c.mega) return removeMegaTier(megas.get(pk.c.mega)); removeSection(pk.c); }

/* ---------- hover outline showing where a click would build ---------- */
const hoverMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false });
const hover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), hoverMat);
hover.layers.set(1); hover.renderOrder = 999; hover.visible = false; scene.add(hover);
function showHover(t){
  if (!t){ hover.visible = false; return; }
  hoverMat.color.set(S.zone ? ZONES[S.zone].col : '#e3d6bd');
  let x, z, y0, h, w, wz;
  if (t.type === 'megaUp'){
    if (!S.zone){ hover.visible = false; return; }
    const [sx, sz] = megaSize(t.m);
    hover.position.set(t.m.x, t.m.roofH + 1.6, t.m.z); hover.scale.set(sx - .6, 3.2, sz - .6); hover.visible = true; return;
  }
  if (t.type === 'empty'){
    x = t.i*LOT; z = t.j*LOT;
    if (S.zone){ y0 = CURB; h = FH*3; w = SIDE; } else { y0 = -.6; h = .68; w = LOT; }
  } else if (t.type === 'onto'){ x = t.c.x; z = t.c.z; y0 = t.c.sections.length ? t.c.height : CURB; h = FH*3; w = SIDE; }
  else { x = t.c.x; z = t.c.z; y0 = t.c.height; h = FH*2; w = SIDE; }
  if (t.type !== 'empty' && !S.zone){ hover.visible = false; return; }
  hover.position.set(x, y0 + h/2, z); hover.scale.set(w, h, w); hover.visible = true;
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
