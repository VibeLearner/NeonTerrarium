// Neon Terrarium: people. Residents with homes, jobs and daily routines, walking the sidewalks door to door.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// Plan and progress: docs/people.md.
//
// How it works, cheaply:
// - Everyone in the city exists as a few numbers: a home, maybe a job, a daily schedule, where they are now.
//   People indoors cost nothing to draw. Only people out on the street (or standing in an open place like the
//   town square) are drawn, all of them in one instanced draw call.
// - Residents come from the buildings themselves: each section seeds its own household, so the same people
//   always live in the same building, and building or removing one only adds or removes its own residents.
// - Every so often a person checks the hour against their schedule (asleep, at work, free) and, when they should
//   be somewhere else, walks there along the sidewalk network: out of one door, across the streets, in another.
//   The hour is the one set in Settings, so a night city is quiet and a daytime one is busy.

/* ---------- the sprite sheet ---------- */
// assets/sprites/people.png: one character per 16 px row, 10 cells of 12 px each: 6 walk frames then 4 idle
// frames, facing right (mirrored for walking left). Feet sit on the bottom row of the cell.
const PPL = { rows: 12, cw: 12, ch: 16, walk: 6, idle: 4, W: 120, H: 192 };
const PPL_TEX = new THREE.TextureLoader().load('assets/sprites/people.png');
PPL_TEX.magFilter = PPL_TEX.minFilter = THREE.NearestFilter; PPL_TEX.generateMipmaps = false;
const PPL_MAX = 700;          // most people drawn at once (the nearest win if more are out)
const PPL_SPEED = .55;        // walking speed, world units a second (a block takes about 7 s)
const RING = 1.2;             // sidewalk path: this far from a plot's centre, between the building and the kerb

const PPL_MAT = new THREE.ShaderMaterial({
  uniforms: { map: { value: PPL_TEX }, res: FOL_UNI.res, tint: FOL_UNI.tint, normalMode: FOL_UNI.normalMode,
              sheet: { value: new THREE.Vector4(PPL.W, PPL.H, PPL.cw, PPL.ch) }, size: { value: new THREE.Vector2(PPL.cw/PX, PPL.ch/PX) } },
  vertexShader: `uniform vec2 res; uniform vec2 size; attribute vec3 aPos; attribute vec4 aSpr;
    varying vec2 vUv; varying vec4 vSpr;
    void main(){
      // stands upright facing the screen, feet on aPos, anchor and corners snapped to whole render pixels (as the plants)
      vec4 a = projectionMatrix * modelViewMatrix * vec4(aPos, 1.0);
      vec2 local = vec2(position.x, position.y + 0.5) * size;
      vec2 ap = floor((a.xy*0.5 + 0.5)*res + 0.5);
      vec2 off = floor(vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * local * 0.5 * res + 0.5);
      gl_Position = vec4((ap + off)/res*2.0 - 1.0, a.z, 1.0);
      vUv = vec2(aSpr.z < 0.0 ? 1.0 - uv.x : uv.x, uv.y);
      vSpr = aSpr;
    }`,
  fragmentShader: `uniform sampler2D map; uniform vec4 sheet; uniform vec3 tint; uniform float normalMode;
    varying vec2 vUv; varying vec4 vSpr;
    float bayer(vec2 p){ p = mod(floor(p), 4.0);
      float b = p.x + p.y*4.0;   // 4x4 ordered dither, written out for GLSL ES 1.0
      return b < 0.5 ? 0.0 : b < 1.5 ? 8.0 : b < 2.5 ? 2.0 : b < 3.5 ? 10.0 : b < 4.5 ? 12.0 : b < 5.5 ? 4.0 : b < 6.5 ? 14.0 : b < 7.5 ? 6.0 :
             b < 8.5 ? 3.0 : b < 9.5 ? 11.0 : b < 10.5 ? 1.0 : b < 11.5 ? 9.0 : b < 12.5 ? 15.0 : b < 13.5 ? 7.0 : b < 14.5 ? 13.0 : 5.0; }
    void main(){
      vec2 tx = floor(vUv * sheet.zw);
      if (tx.x < 0.0 || tx.y < 0.0 || tx.x >= sheet.z || tx.y >= sheet.w) discard;
      vec2 st = vec2(vSpr.y*sheet.z + tx.x, (${PPL.rows - 1}.0 - vSpr.x)*sheet.w + tx.y);
      vec4 c = texture2D(map, (st + 0.5)/sheet.xy);
      if (c.a < 0.5) discard;
      // stepping out of (or into) a doorway: the figure dissolves in a pixel dither
      if (vSpr.w < 0.999 && (bayer(gl_FragCoord.xy) + 0.5)/16.0 > vSpr.w) discard;
      // people catch a little of the street light, so they still read at night
      vec3 col = c.rgb * mix(tint, vec3(1.0), 0.3);
      gl_FragColor = normalMode > 0.5 ? vec4(0.5, 0.5, 1.0, 1.0) : vec4(col, 1.0);
    }`,
});
const pplMesh = (() => {
  const geo = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  geo.index = q.index; geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv);
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(PPL_MAX*3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSpr', new THREE.InstancedBufferAttribute(new Float32Array(PPL_MAX*4), 4).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = 0;
  const m = new THREE.Mesh(geo, PPL_MAT);
  m.frustumCulled = false; m.layers.set(2);   // drawn with the plants: colour pass and the flat-normal outline pass
  scene.add(m); return m;
})();

/* ---------- the sidewalk network ---------- */
// Nodes: the four corners of each plot's sidewalk ring, plus a node at each door. Edges: round the ring, straight
// across the street to the neighbouring plot's corner, and diagonally across empty plots (they're paved plazas).
// Megastructures are walked round, and entered through doors on their edge.
let PG = { x: [], z: [], nb: [], key: new Map() };
const pgAdd = (k, x, z) => { let n = PG.key.get(k); if (n !== undefined) return n; n = PG.x.length; PG.x.push(x); PG.z.push(z); PG.nb.push([]); PG.key.set(k, n); return n; };
const pgLink = (a, b) => { if (a === undefined || b === undefined || a === b) return; if (!PG.nb[a].includes(b)) PG.nb[a].push(b); if (!PG.nb[b].includes(a)) PG.nb[b].push(a); };
const cornerKey = (c, sx, sz) => c.i + ',' + c.j + ',' + sx + ',' + sz;
const walkable = c => c && !c.mega;
function buildPeopleGraph(){
  PG = { x: [], z: [], nb: [], key: new Map() };
  for (const c of cells.values()){
    if (!walkable(c)) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pgAdd(cornerKey(c, sx, sz), c.x + sx*RING, c.z + sz*RING);
  }
  for (const c of cells.values()){
    if (!walkable(c)) continue;
    const k = (sx, sz) => PG.key.get(cornerKey(c, sx, sz));
    for (const s of [-1, 1]){ pgLink(k(s, -1), k(s, 1)); pgLink(k(-1, s), k(1, s)); }
    if (!c.sections.length){ pgLink(k(-1, -1), k(1, 1)); pgLink(k(-1, 1), k(1, -1)); }
    const e = cells.get(ckey(c.i + 1, c.j)), s = cells.get(ckey(c.i, c.j + 1));
    if (walkable(e)) for (const sz of [-1, 1]) pgLink(k(1, sz), PG.key.get(cornerKey(e, -1, sz)));
    if (walkable(s)) for (const sx of [-1, 1]) pgLink(k(sx, 1), PG.key.get(cornerKey(s, sx, -1)));
  }
  routeCache.clear();
}
// shortest walk between two nodes (A*, with a small binary heap)
const routeCache = new Map();
function route(a, b){
  if (a === b) return [a];
  const key = a + '>' + b;
  if (routeCache.has(key)) return routeCache.get(key);
  const n = PG.x.length, g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const heap = [], hf = [];
  const push = (v, f) => { heap.push(v); hf.push(f); let i = heap.length - 1;
    while (i > 0){ const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0], lv = heap.pop(), lf = hf.pop();
    if (heap.length){ heap[0] = lv; hf[0] = lf; let i = 0;
      for (;;){ const l = 2*i + 1, r = l + 1; let m = i;
        if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } }
    return top; };
  const hz = v => Math.hypot(PG.x[v] - PG.x[b], PG.z[v] - PG.z[b]);
  g[a] = 0; push(a, hz(a));
  let found = false;
  while (heap.length){
    const v = pop(); if (done[v]) continue; done[v] = 1;
    if (v === b){ found = true; break; }
    for (const w of PG.nb[v]){
      const d = g[v] + Math.hypot(PG.x[v] - PG.x[w], PG.z[v] - PG.z[w]);
      if (d < g[w]){ g[w] = d; from[w] = v; push(w, d + hz(w)); }
    }
  }
  let out = null;
  if (found){ out = []; for (let v = b; v !== -1; v = from[v]) out.push(v); out.reverse(); }
  if (routeCache.size > 3000) routeCache.clear();
  routeCache.set(key, out);
  return out;
}

/* ---------- places: homes, workplaces, somewhere to go ---------- */
// Per building section: residents, jobs, and how much of a draw it is in free time (shops, bars, hotels).
const ZONE_LIFE = {
  low:  { res: [4, 8], jobs: [0, 1], fun: .6 },
  mid:  { res: [2, 3], jobs: [3, 5], fun: 3 },
  high: { res: [3, 5], jobs: [2, 4], fun: 1.5 },
  ind:  { res: [0, 0], jobs: [4, 6], fun: 0 },
};
const MEGA_LIFE = {
  radio:   { jobs: 6,  fun: 0,  night: .3 },
  mall:    { jobs: 8,  fun: 9 },              // per tier
  square:  { jobs: 6,  fun: 12, open: true },
  police:  { jobs: 8,  fun: 0,  night: .4 },
  foundry: { jobs: 14, fun: 0,  night: .35 },
};
const places = new Map();   // id -> { id, x, z, doors: [{ node, out:{x,z}, in:{x,z}|null, dir:[dx,dz] }], jobs, fun, open, night, cell|mega }
const people = new Map();   // id -> person
const hrange = (lo, hi) => (h => lo <= hi ? (h >= lo && h < hi) : (h >= lo || h < hi));
const span = (u, a, b) => a + (b - a)*u;
function u01(...a){ return hash(...a) / 4294967296; }

function cellPlace(c){
  let jobs = 0, fun = 0, night = 0;
  c.sections.forEach((s, k) => { const L = ZONE_LIFE[s.zone]; if (!L) return;
    jobs += Math.round(span(u01('jobs', c.i, c.j, k, s.seed), L.jobs[0], L.jobs[1] + .99) - .49);
    fun += L.fun * (k === 0 ? 1 : .4);
    if (s.zone === 'ind') night = .3; });
  // one front door, on a side picked from the ground section's seed
  const [dx, dz] = SIDES4[hash('door', c.i, c.j, c.sections[0].seed) % 4];
  const node = pgAdd('door:' + c.i + ',' + c.j, c.x + dx*RING, c.z + dz*RING);
  if (dx) for (const sz of [-1, 1]) pgLink(node, PG.key.get(cornerKey(c, dx, sz)));
  else for (const sx of [-1, 1]) pgLink(node, PG.key.get(cornerKey(c, sx, dz)));
  return { id: 'c:' + c.i + ',' + c.j, cell: c, x: c.x, z: c.z, jobs, fun, night,
           doors: [{ node, out: { x: c.x + dx*RING, z: c.z + dz*RING }, in: null, dir: [dx, dz], data: null }] };
}
function megaPlace(m){
  const L = MEGA_LIFE[m.kind] || { jobs: 4, fun: 0 };
  const doors = [];
  for (const b of m.cells){
    const a = b.i - m.i, bj = b.j - m.j;
    for (const [dx, dz] of SIDES4){
      const nb = cells.get(ckey(b.i + dx, b.j + dz));
      if (!walkable(nb)) continue;
      // keep clear of the middle of each side (the town square's market stands sit there)
      if ((dx && m.h >= 3 && bj === (m.h - 1)/2) || (dz && m.w >= 3 && a === (m.w - 1)/2)) continue;
      const ox = b.x + dx*LOT/2, oz = b.z + dz*LOT/2;
      const node = pgAdd('mdoor:' + b.i + ',' + b.j + ',' + dx + ',' + dz, ox, oz);
      if (dx) for (const sz of [-1, 1]) pgLink(node, PG.key.get(cornerKey(nb, -dx, sz)));
      else for (const sx of [-1, 1]) pgLink(node, PG.key.get(cornerKey(nb, sx, -dz)));
      // closed megastructures swallow people a step inside their edge; the open square lets them walk in to the cell's middle
      const inside = L.open ? { x: b.x, z: b.z } : { x: ox - dx*.55, z: oz - dz*.55 };
      doors.push({ node, out: { x: ox, z: oz }, in: inside, dir: [dx, dz] });
    }
  }
  const tiers = m.kind === 'mall' ? m.levels : 1;
  return { id: 'm:' + m.kind, mega: m, x: m.x, z: m.z, jobs: L.jobs*tiers, fun: L.fun*tiers, night: L.night || 0, open: !!L.open, doors };
}
// a cell door's "in" point is where the walk meets the building's wall: found once by casting a ray in from the sidewalk
const _ray = new THREE.Raycaster(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
function doorIn(pl, d){
  if (d.in && (!pl.cell || d.data === pl.cell.data)) return d.in;
  const c = pl.cell;
  let reach = .35;
  if (c && c.view){
    _ro.set(d.out.x, .35, d.out.z); _rd.set(-d.dir[0], 0, -d.dir[1]);
    _ray.set(_ro, _rd); _ray.far = RING - .1;
    const hit = _ray.intersectObjects(c.view.children, false)[0];
    if (hit) reach = Math.max(0, hit.distance - .12);
  }
  d.in = { x: d.out.x - d.dir[0]*reach, z: d.out.z - d.dir[1]*reach }; d.data = c ? c.data : null;
  return d.in;
}

/* ---------- residents ---------- */
// A person is seeded from their home section and their place in the household, so they're the same person every
// time the city loads: same look, same habits, same walk.
// bedtimes lean early: most turn in by midnight, a few night owls stay out till 3
function makePerson(id, home){
  const u = k => u01(id, k);
  const wake = span(u('wake'), 6, 8.5);
  return { id, home, job: null, wantsJob: u('emp') < .8, courier: u('courier') < .2, row: hash(id, 'look') % PPL.rows,
           speed: PPL_SPEED*span(u('speed'), .85, 1.15), lane: [span(u('lx'), -.13, .13), span(u('lz'), -.13, .13)],
           wake, bed: (22 + 6*u('bed')**2) % 24, outgoing: span(u('out'), .25, .9), nightShift: u('night'),
           workS: span(u('ws'), 7.5, 9.5), workLen: span(u('wl'), 7.5, 9),
           at: home, until: 0, walk: null, spot: null, x: 0, z: 0, flip: 1, phase: u('phase')*10 };
}
function syncResidents(){
  const keep = new Set();
  for (const c of cells.values()){
    if (!c.sections.length || c.mega) continue;
    const home = 'c:' + c.i + ',' + c.j;
    c.sections.forEach((s, k) => {
      const L = ZONE_LIFE[s.zone]; if (!L) return;
      const n = Math.round(span(u01('res', c.i, c.j, k, s.seed), L.res[0], L.res[1] + .99) - .49);
      for (let q = 0; q < n; q++){
        const id = c.i + ',' + c.j + ',' + k + ',' + s.seed + ',' + q;
        keep.add(id);
        if (!people.has(id)){
          const p = makePerson(id, home);
          p.fresh = true;   // placed once jobs are handed out (see syncPeople)
          people.set(id, p);
        }
      }
    });
  }
  for (const id of [...people.keys()]) if (!keep.has(id)) people.delete(id);
}
// jobs: keep the ones people have, hand free ones to those who want work (nearer jobs more likely)
function syncJobs(){
  const used = new Map();
  for (const p of people.values()){
    const pl = p.job && places.get(p.job);
    if (!pl || (used.get(p.job) || 0) >= pl.jobs){ p.job = null; continue; }
    used.set(p.job, (used.get(p.job) || 0) + 1);
  }
  const open = [...places.values()].filter(pl => pl.jobs > (used.get(pl.id) || 0) && pl.doors.length);
  if (!open.length) return;
  const seekers = [...people.values()].filter(p => !p.job && p.wantsJob).sort((a, b) => a.id < b.id ? -1 : 1);
  for (const p of seekers){
    const home = places.get(p.home); if (!home) continue;
    const rr = mulberry32(hash(p.id, 'job', open.length));
    let tot = 0; const w = open.map(pl => { const free = pl.jobs - (used.get(pl.id) || 0); const v = free > 0 && pl.id !== p.home ? free/(1 + Math.hypot(pl.x - home.x, pl.z - home.z)/12) : 0; tot += v; return v; });
    if (tot <= 0) break;
    let r = rr()*tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    p.job = open[k].id; used.set(p.job, (used.get(p.job) || 0) + 1);
  }
}

/* ---------- routines ---------- */
// Where should this person be at this hour? Asleep at home, at work, or (in free time) out somewhere or home.
function asleep(p, h){
  if (p.job && p.nightWorker) return hrange(8.5, 15.5)(h);
  return !hrange(p.wake, p.bed)(h);
}
function working(p, h){ return !!p.job && hrange(p.ws, (p.ws + p.workLen) % 24)(h); }
function desire(p, h){
  const job = p.job && places.get(p.job);
  p.nightWorker = !!(job && job.night && p.nightShift < job.night);
  p.ws = p.nightWorker ? 21 + p.nightShift*4 : p.workS;
  if (asleep(p, h)) return p.home;
  if (working(p, h)){
    if (h >= 12 && h < 13.5 && !p.nightWorker && pplRand() < .3) return leisure(p) || p.job;   // out for lunch
    return p.courier ? errand(p) : p.job;
  }
  // free time: how likely they are to be out depends on the hour and on the person
  const out = p.outgoing * (h >= 10 && h < 21 ? 1 : h >= 21 || h < 1 ? .5 : .25);
  return pplRand() < out ? leisure(p) || p.home : p.home;
}
// somewhere to spend free time: shops, bars, the mall, the square. Nearer places are more likely.
function leisure(p){
  const home = places.get(p.home); if (!home) return null;
  let tot = 0; const list = [];
  for (const pl of places.values()){ if (pl.fun <= 0 || pl.id === p.home || !pl.doors.length) continue;
    const v = pl.fun/(1 + (Math.hypot(pl.x - home.x, pl.z - home.z)/14)**2); tot += v; list.push([pl.id, v]); }
  let r = pplRand()*tot; for (const [id, v] of list) if ((r -= v) <= 0) return id;
  return list.length ? list[list.length - 1][0] : null;
}
// couriers spend their shift walking parcels between shops
function errand(p){
  const ids = [...places.values()].filter(pl => pl.fun > 1 && pl.id !== p.at && pl.doors.length).map(pl => pl.id);
  return ids.length ? ids[Math.floor(pplRand()*ids.length)] : p.job;
}
// how long they stay once they arrive (real seconds: the city's clock stands still, so this is pacing, not hours)
function stayFor(p, pl){
  if (p.walkedFor === 'errand') return 3 + pplRand()*6;
  if (pl.id === p.home) return 25 + pplRand()*60;
  if (pl.id === p.job) return 50 + pplRand()*100;
  return 15 + pplRand()*45;
}
const pplRand = Math.random;   // moment-to-moment choices; who people are is seeded above
function openSpot(pl, near){
  // the town square: somewhere on the walk round the koi pond, between the bench and the food carts, on the side
  // they came in from (so nobody wades across the pond)
  const a = (near ? Math.atan2(near.z - pl.z, near.x - pl.x) : Math.random()*TAU) + (Math.random() - .5)*1.2, r = POND_R + .95 + Math.random()*.65;
  return { x: pl.x + Math.cos(a)*r, z: pl.z + Math.sin(a)*r };
}

/* ---------- walking ---------- */
const nearestDoor = (pl, x, z) => { let best = null, bd = Infinity; for (const d of pl.doors){ const v = (d.out.x - x)**2 + (d.out.z - z)**2; if (v < bd){ bd = v; best = d; } } return best; };
function startTrip(p, toId){
  const from = places.get(p.at), to = places.get(toId);
  if (!from || !to || !from.doors.length || !to.doors.length) return false;
  // leaving an open place: by the door on their side of it; arriving: on the side nearest where they came from
  const dA = from.open && p.spot ? nearestDoor(from, p.spot.x, p.spot.z) : nearestDoor(from, to.x, to.z), dB = nearestDoor(to, from.x, from.z);
  const path = route(dA.node, dB.node); if (!path) return false;
  const pts = [];
  if (from.open && p.spot){ pts.push([p.spot.x, p.spot.z]); pts.push([dA.in.x, dA.in.z]); }
  else { const i = doorIn(from, dA); pts.push([i.x, i.z]); }
  for (let k = 0; k < path.length; k++){
    const v = path[k], ends = k === 0 || k === path.length - 1;   // door nodes stay exact; corners get a personal lane offset
    pts.push([PG.x[v] + (ends ? 0 : p.lane[0]), PG.z[v] + (ends ? 0 : p.lane[1])]);
  }
  let spot = null;
  if (to.open){ spot = openSpot(to, dB.in); pts.push([dB.in.x, dB.in.z]); pts.push([spot.x, spot.z]); }
  else { const i = doorIn(to, dB); pts.push([i.x, i.z]); }
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  p.walk = { pts, cum, len: cum[cum.length - 1], s: 0, to: toId, fadeIn: !from.open, fadeOut: !to.open, nextSpot: spot };
  p.spot = null;
  return true;
}
// decide what to do next once the current stay is over
function decide(p){
  const want = desire(p, S.hour) || p.home;
  p.walkedFor = (want !== p.job && want !== p.home && working(p, S.hour)) ? 'errand' : null;
  if (want === p.at || !places.has(want) || !startTrip(p, want)){ p.until = pplNow + 15 + pplRand()*40; return; }
}
function arrive(p){
  const w = p.walk; p.walk = null;
  p.at = w.to; p.spot = w.nextSpot;
  const pl = places.get(p.at);
  p.until = pplNow + (pl ? stayFor(p, pl) : 20);
}

/* ---------- keeping up with the city ---------- */
let pplReady = false, pplNow = 0, pplHour = S.hour, pplCursor = 0, pplList = [];
// called after every edit (from syncAgents): rebuild the network and places, then the residents and their jobs
function syncPeople(){
  buildPeopleGraph();
  const oldPlaces = places;
  const fresh = new Map();
  for (const c of cells.values()) if (c.sections.length && !c.mega){ const pl = cellPlace(c), old = oldPlaces.get(pl.id);
    if (old && old.cell === c && old.doors[0].dir.join() === pl.doors[0].dir.join()){ pl.doors[0].in = old.doors[0].in; pl.doors[0].data = old.doors[0].data; }
    fresh.set(pl.id, pl); }
  for (const m of megas.values()){ const pl = megaPlace(m); fresh.set(pl.id, pl); }
  places.clear(); for (const [k, v] of fresh) places.set(k, v);
  syncResidents();
  syncJobs();
  // newcomers: a fresh household is at home and comes out soon; on load, people are already wherever the hour says
  for (const p of people.values()){
    if (!p.fresh) continue;
    p.fresh = false;
    if (pplReady){ p.until = pplNow + 2 + Math.random()*20; continue; }
    p.at = places.has(desire(p, S.hour)) ? desire(p, S.hour) : p.home;
    const pl = places.get(p.at); if (pl && pl.open) p.spot = openSpot(pl, pl.doors[Math.floor(Math.random()*pl.doors.length)].in);
    p.until = pplNow + Math.random()*40;
  }
  // anyone whose building went: indoors people go home; walkers whose way is gone fade out and arrive home
  for (const p of people.values()){
    if (p.walk){
      const gone = !places.has(p.walk.to) || p.walk.pts.some(([x, z]) => !cells.has(ckey(Math.round(x/LOT), Math.round(z/LOT))));
      if (gone){ p.walk = null; p.at = p.home; p.spot = null; p.until = pplNow + 5 + Math.random()*20; }
    } else if (!places.has(p.at)){ p.at = p.home; p.spot = null; p.until = pplNow + 5 + Math.random()*20; }
  }
  pplList = [...people.values()];
  pplReady = true;
}

/* ---------- every frame ---------- */
const _pv = new THREE.Vector3(), _camR = new THREE.Vector3();
function updatePeople(dt, t){
  pplNow = t;
  if (!pplReady) return;
  // the hour was changed in Settings: everyone reconsiders over the next few seconds
  if (Math.abs(S.hour - pplHour) > .2){ pplHour = S.hour; for (const p of pplList) if (!p.walk) p.until = Math.min(p.until, pplNow + Math.random()*8); }
  // decisions are spread over frames: a slice of the population each time
  const n = pplList.length, slice = Math.min(n, 60);
  for (let k = 0; k < slice; k++){
    const p = pplList[(pplCursor + k) % n];
    if (!p.walk && pplNow >= p.until) decide(p);
  }
  pplCursor = n ? (pplCursor + slice) % n : 0;
  // move walkers and fill the draw batch with everyone on show
  _camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
  const pos = pplMesh.geometry.attributes.aPos, spr = pplMesh.geometry.attributes.aSpr, P = pos.array, Q = spr.array;
  const VP = comp.uniforms.VP.value;
  let i = 0;
  for (const p of pplList){
    let alpha = 1, walking = false;
    if (p.walk){
      const w = p.walk; w.s += dt*p.speed;
      if (w.s >= w.len){ arrive(p); if (!p.spot) continue; p.x = p.spot.x; p.z = p.spot.z; }
      else {
        walking = true;
        let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.s) k++;
        const a = w.pts[k - 1], b = w.pts[k], seg = w.cum[k] - w.cum[k - 1] || 1, u = (w.s - w.cum[k - 1])/seg;
        p.x = a[0] + (b[0] - a[0])*u; p.z = a[1] + (b[1] - a[1])*u;
        const sd = (b[0] - a[0])*_camR.x + (b[1] - a[1])*_camR.z;
        if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1;
        if (w.fadeIn) alpha = Math.min(alpha, w.s/.35);
        if (w.fadeOut) alpha = Math.min(alpha, (w.len - w.s)/.35);
      }
    } else if (p.spot){ p.x = p.spot.x; p.z = p.spot.z; }
    else continue;
    if (i >= PPL_MAX) break;
    // skip anyone off screen
    _pv.set(p.x, CURB, p.z).applyMatrix4(VP);
    if (_pv.x < -1.1 || _pv.x > 1.1 || _pv.y < -1.15 || _pv.y > 1.1) continue;
    const frame = walking ? Math.floor(t*9*p.speed/PPL_SPEED + p.phase) % PPL.walk : PPL.walk + Math.floor(t*2.5 + p.phase) % PPL.idle;
    P[i*3] = p.x; P[i*3 + 1] = CURB; P[i*3 + 2] = p.z;
    Q[i*4] = p.row; Q[i*4 + 1] = frame; Q[i*4 + 2] = p.flip; Q[i*4 + 3] = Math.max(0, alpha);
    i++;
  }
  pplMesh.geometry.instanceCount = i;
  pos.needsUpdate = spr.needsUpdate = true;
}
// for the dev overlay and tests
function peopleStats(){
  let walking = 0, home = 0, work = 0, out = 0;
  for (const p of people.values()){ if (p.walk) walking++; else if (p.at === p.home) home++; else if (p.at === p.job) work++; else out++; }
  return { people: people.size, jobs: [...people.values()].filter(p => p.job).length, walking, home, work, out, drawn: pplMesh.geometry.instanceCount, nodes: PG.x.length };
}
