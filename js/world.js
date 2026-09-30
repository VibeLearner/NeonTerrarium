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
  sh.uniforms.emI = EM_I; sh.uniforms.fTime = FOL_UNI.time;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aEm; attribute float aFlk; uniform float emI[6]; uniform float fTime; varying vec3 vEmis;' + FLK_GLSL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = aEm.rgb * emI[int(aEm.a*255.0 + .5)] * flicker(aFlk, fTime);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEmis;')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmis;');
};
const atlasable = m => m && m.isMeshToonMaterial && !m.map && m !== M.cloud && m !== ATLAS;
function collect(fn){
  buckets = new Map(); emitters = []; carPads = []; curPorts = []; glowList = {};
  for (const k in SPR.size) FOL_LIST[k] = [];
  fn();
  const geo = new Map();
  let nAt = 0;
  for (const [mat, b] of buckets){ if (atlasable(mat)) nAt += b.p.length/3; else geo.set(mat, bucketGeometry(b)); }
  if (nAt){
    const pos = new Float32Array(nAt*3), nrm = new Float32Array(nAt*3), col = new Uint8Array(nAt*3), em = new Uint8Array(nAt*4), flk = new Uint8Array(nAt);
    let o = 0;
    for (const [mat, b] of buckets){
      if (!atlasable(mat)) continue;
      const n = b.p.length/3; pos.set(b.p, o*3); nrm.set(b.n, o*3);
      const r = Math.round(mat.color.r*255), gg = Math.round(mat.color.g*255), bl = Math.round(mat.color.b*255);
      for (let i=o;i<o+n;i++){ col[i*3] = r; col[i*3+1] = gg; col[i*3+2] = bl; }
      const k = mat.userData.glow;
      if (k){ const er = Math.min(255, Math.round(mat.emissive.r*255)), eg = Math.min(255, Math.round(mat.emissive.g*255)), eb = Math.min(255, Math.round(mat.emissive.b*255)), ek = EM_KIND[k] || 5;
        for (let i=o;i<o+n;i++){ em[i*4] = er; em[i*4+1] = eg; em[i*4+2] = eb; em[i*4+3] = ek; } }
      if (b.f) flk.set(b.f, o);
      o += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.setAttribute('aEm', new THREE.BufferAttribute(em, 4, true));
    g.setAttribute('aFlk', new THREE.BufferAttribute(flk, 1));
    geo.set(ATLAS, g);
  }
  for (const g of geo.values()) g.computeBoundingSphere();
  const fol = {}; for (const k in FOL_LIST) if (FOL_LIST[k].length) fol[k] = FOL_LIST[k];
  const out = { geo, fol, glows: glowList, emitters, pads: carPads, ports: curPorts };
  glowList = null; buckets = new Map();
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
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  for (const k in SPR.size) FOL_LIST[k] = fol[k] || [];
  const saved = city; city = g; buildFoliage(); city = saved;
  if (Object.keys(gl).length) g.add(glowPoints(gl));
  return g;
}

/* ---------- a platform piece: slab, rock root, railings and greenery on the open edges ---------- */
function buildPlatform(c){
  R = mulberry32(hash('plat', c.i, c.j));
  const x = c.x, z = c.z, P = T(x, 0, z);
  box(M.rock, P, 0, -.35, 0, LOT + .02, .6, LOT + .02);
  const depth = rnd(2.4, 4.6);
  const g = jitter(new THREE.CylinderGeometry(LOT*.72, rnd(.3,.8), depth, 4, 3), .35, depth/2 - .05).toNonIndexed();
  g.computeVertexNormals();
  put(g, M.rock, T(x + rnd(-.25,.25), -.65 - depth/2, z + rnd(-.25,.25), PI/4)); g.dispose();
  for (let k=0;k<irand(1,3);k++) blob(M.rockDark, P, rnd(-1.4,1.4), rnd(-1.6,-.8), rnd(-1.4,1.4), rnd(.35,.7));
  if (R() < .35){   // a thruster under this piece
    const ty = -.65 - depth;
    cyl(M.metalDark, P, 0, ty - .1, 0, .38, .5); cyl(M.thruster, P, 0, ty - .38, 0, .3, .1);
    glow(P, 0, ty - .7, 0, 'blue', 2.6);
  }
  // open edges: railing, vines over the drop, plants along the rim, the odd pipe
  for (const [a,b] of SIDES4){
    if (cells.has(ckey(c.i + a, c.j + b))) continue;
    const E = T(x + a*LOT/2, 0, z + b*LOT/2, Math.atan2(a, b));
    for (let t = -LOT/2 + .15; t < LOT/2; t += .45) cyl(M.frame, E, t, .2, -.12, .025, .36);
    box(M.frame, E, 0, .37, -.12, LOT, .035, .035);
    for (let t = -LOT/2 + .3; t < LOT/2 - .2; t += .5){
      if (chance(.45*S.green)) plant(hangKind(), E, t, .02, .03, rnd(.8,1.1), 't', true);
      if (chance(.3*S.green)) plant(bigKind(), E, t, .03, -.35, rnd(.6,.85));
    }
    if (chance(.3)) cyl(M.rust, E, rnd(-1,1), -.4, .08, .08, rnd(1,2.2), 0, PI/2);
  }
  // surface: sidewalk and street round a building, or a small paved plaza when the spot is empty
  if (c.sections.length) groundLot({ x, z, cls: c.sections[0].zone, elev: 0, base: CURB, deck: false });
  else {
    box(G.asph, P, 0, .012, 0, LOT, .025, LOT);
    const n = 7, st = LOT/n;
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) if (!chance(.04)) box(pick(TILES.mid), P, (i-(n-1)/2)*st, .03, (j-(n-1)/2)*st, st - .05, .045, st - .05);
    for (let k=0;k<irand(1,3);k++) plant(pick(['bush','bushFlower','g_spread1','g_fern3','bonsai']), P, rnd(-1.3,1.3), .05, rnd(-1.3,1.3), rnd(.7,.95));
    if (chance(.4)){ const Pb = under(P, T(rnd(-.9,.9), .05, rnd(-.9,.9), pick([0, PI/2]))); box(M.wood, Pb, 0, .14, 0, .5, .04, .15); box(M.frame, Pb, 0, .07, 0, .42, .14, .1); }
  }
  if (chance(.45)){   // a street lamp on one corner
    const [sx,sz] = pick(CORNERS), Pl = T(x + sx*(LOT/2 - .25), 0, z + sz*(LOT/2 - .25));
    cyl(M.metalDark, Pl, 0, .65, 0, .03, 1.3); box(M.metalDark, Pl, .12, 1.3, 0, .26, .03, .03);
    box(M.bulb, Pl, .24, 1.26, 0, .12, .05, .1); glow(Pl, .24, 1.2, 0, 'warm', 1.4);
  }
}

/* ---------- a building: a stack of sections, each a complete building from the zone's set of types ---------- */
// A click builds a whole building. Clicking its roof stacks another complete section on top (any zone),
// and removing takes the top section off. Each section keeps its own seed, so the rest never changes.
const glassHotelTower = (lot, st, P0) => glassHotel(lot, st, P0, 'tower');
const glassHotelPodium = (lot, st, P0) => glassHotel(lot, st, P0, 'podium');
const SECTION_TYPES = {
  low:  { ground: [[buildTenement,6],[podHouse,1.5],[octoHouse,1.2],[deckHouse,1.3]], upper: [[buildTenement,5],[podHouse,2],[octoHouse,1.2]] },
  mid:  { ground: [[buildShophouse,5],[podHouse,2],[octoHouse,1.5],[deckHouse,2],[platformTower,1.3]], upper: [[buildShophouse,4],[podHouse,2],[octoHouse,1],[platformTower,1]] },
  high: { ground: [[buildTower,1]], upper: [[slabTower,2],[glassHotelTower,1.5],[glassHotelPodium,1],[roundTower,1],[twistTower,1],[gardenTower,1]] },
  ind:  { ground: [[buildFactory,1]], upper: [[hall,2],[silos,1]] },
};
function pickWeighted(list){ const tot = list.reduce((s,[,w]) => s + w, 0); let r = R()*tot; for (const [f,w] of list){ if ((r -= w) <= 0) return f; } return list[0][0]; }
function buildStack(c){
  let y = CURB;
  c.sectionTops = [];
  c.sections.forEach((sec, k) => {
    R = mulberry32(hash('sec', c.i, c.j, k, sec.zone, sec.seed));
    const st = STY[sec.zone], upper = k > 0, last = k === c.sections.length - 1;
    const lot = { x: c.x, z: c.z, cls: sec.zone, elev: 0, base: y, signs: 0, occupied: true, height: 0, floors: 0 };
    lot.padOK = last && R() < .3;
    if (upper){   // a deck for the new section to stand on
      box(M.concDD, T(c.x, y, c.z), 0, .05, 0, SIDE - .1, .1, SIDE - .1);
      box(pick(st.neonMats), T(c.x, y, c.z), 0, .02, (SIDE - .1)/2 + .015, SIDE - .1, .03, .03);
    }
    const P0 = T(c.x + rnd(-.1,.1), y + (upper ? .1 : 0), c.z + rnd(-.1,.1), rnd(-st.yaw, st.yaw));
    const builder = pickWeighted(SECTION_TYPES[sec.zone][upper ? 'upper' : 'ground']);
    NO_ROOF = !last;
    withStyle(sec.style, () => builder(lot, st, P0));
    NO_ROOF = false;
    y += (upper ? .1 : 0) + Math.max(lot.height, FH);
    c.sectionTops.push(y);
    if (k === 0) c.firstFloors = lot.floors || 2;
    if (last && !lot.hasCarPad && R() < .7) addPerch({ x: c.x, z: c.z, height: y });
  });
  c.height = y;
}

/* ---------- rebuilding ---------- */
// Pieces are batched in regions of REG x REG grid cells; an edit only re-batches the regions it touched.
const REG = 5, regions = new Map(), dirtyRegions = new Set();
const regKey = (i, j) => Math.floor(i/REG) + ',' + Math.floor(j/REG);
// a cell's solid geometry is drawn as its own mesh (usually one draw call); plants and glows are batched per region
function cellView(c){
  if (c.view){ world.remove(c.view); c.view = null; }
  if (!c.data) return;
  const g = new THREE.Group();
  for (const [m, geo] of c.data.geo){ const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
  world.add(g); c.view = g;
}
function rebuildCell(c){
  finishAnimsOn(c);   // a neighbour's edit can rebuild a cell that is still animating
  disposeData(c.data);
  c.height = CURB;
  c.data = collect(() => { withStyle(c.style, () => buildPlatform(c)); if (c.sections.length) buildStack(c); });
  cellView(c);
  c.emitters = c.data.emitters; c.pads = c.data.pads; c.ports = c.data.ports;
  dirtyRegions.add(regKey(c.i, c.j));
}
function rebuildRegion(key){
  const old = regions.get(key);
  if (old){ world.remove(old); disposeGroup(old); regions.delete(key); }
  const datas = [...cells.values()].filter(c => c.data && regKey(c.i, c.j) === key).map(c => c.data);
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
    if (!d){ d = collect(() => withStyle(a.style, () => connectPair(a, b))); pairCache.set(key, d); }
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
  portLots = [...cells.values()].map(c => ({ x: c.x, z: c.z, height: c.height }));
  setupSteam();
  for (const d of drones) if (!ports.includes(d.at) || (d.phase !== 'inside' && !ports.includes(d.to))){
    d.phase = 'inside'; d.g.visible = false; d.at = nearPort(); d.timer = 1 + Math.random()*2;
  }
  for (const c of tripCars) if (c.pad && !carPads.includes(c.pad)){ c.pad = null; c.phase = 'away'; c.g.visible = false; c.timer = 2 + Math.random()*4; }
  let top = 6; for (const c of cells.values()) if (c.height > top) top = c.height;
  skyTop = top + 2.4;
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
function refresh(list){
  for (const c of new Set(list)) if (c) rebuildCell(c);
  for (const k of dirtyRegions){ if (heldRegions.has(k)) pendingRegions.add(k); else rebuildRegion(k); } dirtyRegions.clear();
  rebuildConnections(); syncAgents();
}
function rebuildAll(){ refresh([...cells.values()]); }

/* ---------- edits ---------- */
const newCell = (i, j, sections = []) => ({ i, j, x: i*LOT, z: j*LOT, sections, sectionTops: [], firstFloors: 2, group: null, height: CURB, ports: [], pads: [], emitters: [] });
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
}
function removeSection(c){
  if (!c.sections.length) return removePlatform(c);
  finishAnimsOn(c);
  const top = c.height, zone = c.sections[c.sections.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.pop(); refresh([c]);
  startAnim(c, 'remove', (c.sections.length ? c.height : CURB) - .05, top + 1.2, zone, SIDE, old);
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
  const nrm = normalMat.clone(); nrm.clippingPlanes = [u.plane];
  return { atlas, nrm };
}
function startAnim(c, kind, y0, y1, zone, w, old){
  const view = kind === 'build' ? c.view : old.view;
  const held = kind === 'build';   // plants and glows arrive when a build finishes, but leave as soon as a removal starts
  if (!view){ if (old) dropView(old); if (held) releaseRegion(regKey(c.i, c.j)); return; }
  const col = new THREE.Color(zone ? ZONES[zone].col : '#e3d6bd');
  const u = { plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), kind === 'build' ? y0 : y1), h: { value: y0 }, col: { value: col.clone().multiplyScalar(1.6) }, on: { value: 1 } };
  const mats = animMaterials(u);
  view.traverse(o => { if (!o.isMesh) return; o.userData.baseMat = o.material; o.material = o.material === ATLAS ? mats.atlas : o.material; o.layers.set(3); });
  if (kind === 'remove' && c.view) c.view.visible = false;   // what's left appears when the sweep is done
  const lineMat = () => new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const box = new THREE.LineSegments(OUTLINE_GEO, lineMat()), scan = new THREE.LineSegments(OUTLINE_GEO, lineMat());
  const by0 = Math.max(y0, kind === 'build' && !zone && y0 < -1 ? -.7 : y0);   // a bare platform's outline hugs the slab, not the rock under it
  box.position.set(c.x, (by0 + y1)/2, c.z); box.scale.set(w + .08, Math.max(.1, y1 - by0), w + .08);
  scan.scale.set(w + .2, .001, w + .2);
  for (const l of [box, scan]){ l.layers.set(1); l.renderOrder = 998; scene.add(l); }
  anims.push({ c, kind, view, old, u, mats, box, scan, x: c.x, z: c.z, y0, y1, t: 0, dur: kind === 'build' ? .15 : .12, reg: regKey(c.i, c.j), held });
}
const easeOut = x => 1 - (1 - x)*(1 - x);
function updateAnims(dt){
  for (let i = anims.length - 1; i >= 0; i--){
    const a = anims[i]; a.t += dt;
    const p = Math.min(1, a.t/a.dur);
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
  for (const l of [a.box, a.scan]){ scene.remove(l); l.material.dispose(); }
  a.view.traverse(o => { if (o.isMesh){ o.material = o.userData.baseMat || o.material; o.layers.set(0); } });
  a.mats.atlas.dispose(); a.mats.nrm.dispose();
  if (a.kind === 'remove'){ dropView(a.old); if (a.c.view) a.c.view.visible = true; }
  if (a.held) releaseRegion(a.reg);
  shadowDirty = true;
}
function finishAnimsOn(c){ for (let i = anims.length - 1; i >= 0; i--) if (anims[i].c === c) endAnim(i); }
function clearIsland(){
  while (anims.length) endAnim(anims.length - 1);
  for (const c of cells.values()){ disposeData(c.data); c.data = null; cellView(c); }
  for (const k of [...regions.keys()]){ world.remove(regions.get(k)); disposeGroup(regions.get(k)); regions.delete(k); }
  cells.clear();
  for (let i=-1;i<=1;i++) for (let j=-1;j<=1;j++) cells.set(ckey(i,j), newCell(i, j));
  rebuildAll(); centerView();
}

/* ---------- saving (this browser only) ---------- */
const SAVE_KEY = 'neonIsland.v2';
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify([...cells.values()].map(c => [c.i, c.j, c.sections, c.style || DEFAULT_STYLE]))); } catch (e) {} }
function load(){
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!Array.isArray(d) || !d.length) return false;
    for (const [i,j,secs,st] of d){ const c = newCell(i, j, (secs || []).filter(s => s && ZONES[s.zone])); c.style = st || DEFAULT_STYLE; cells.set(ckey(i,j), c); }
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
    if (c.sections.length){ _box3.min.set(c.x - SIDE/2, CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.height, c.z + SIDE/2); test(c, 'bld'); }
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
  const c = pk.c, top = pk.kind === 'bld' ? c.height : CURB;
  if (Math.abs(pk.p.y - top) < .03) return pk.kind === 'bld' ? { type: 'up', c } : { type: 'onto', c };
  // a side face: build next door in that direction
  const dx = pk.p.x - c.x, dz = pk.p.z - c.z;
  const [a,b] = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const n = cells.get(ckey(c.i + a, c.j + b));
  return n ? { type: 'onto', c: n } : { type: 'empty', i: c.i + a, j: c.j + b };
}
function applyTarget(t){
  if (!t) return null;
  const zone = S.zone;
  if (t.type === 'empty') return addPlatform(t.i, t.j, zone);
  if (!zone) return null;
  addSection(t.c, zone); return t.c;
}
function removeAt(pk){ if (!pk || pk.kind === 'sky') return; removeSection(pk.c); }

/* ---------- hover outline showing where a click would build ---------- */
const hoverMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false });
const hover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), hoverMat);
hover.layers.set(1); hover.renderOrder = 999; hover.visible = false; scene.add(hover);
function showHover(t){
  if (!t){ hover.visible = false; return; }
  hoverMat.color.set(S.zone ? ZONES[S.zone].col : '#e3d6bd');
  let x, z, y0, h, w;
  if (t.type === 'empty'){
    x = t.i*LOT; z = t.j*LOT;
    if (S.zone){ y0 = CURB; h = FH*3; w = SIDE; } else { y0 = -.6; h = .68; w = LOT; }
  } else if (t.type === 'onto'){ x = t.c.x; z = t.c.z; y0 = t.c.sections.length ? t.c.height : CURB; h = FH*3; w = SIDE; }
  else { x = t.c.x; z = t.c.z; y0 = t.c.height; h = FH*2; w = SIDE; }
  if (t.type !== 'empty' && !S.zone){ hover.visible = false; return; }
  hover.position.set(x, y0 + h/2, z); hover.scale.set(w, h, w); hover.visible = true;
}

function generate(){ rebuildAll(); }
