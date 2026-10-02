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
// assets/sprites/people.png: one character per 16 px row, 20 cells of 12 px each, facing right (mirrored for
// facing left), feet on the bottom row: 6 walk frames, 4 idle, 6 gesture (talking, ordering, serving; characters
// without their own gesture sheet sway through their idle frames) and 4 sitting; cells 20 to 31 are extra
// animations (the police officer's scanner and angry reaction). Row 12 is the police officer, row 13 the delivery
// robot (walk 0-3, alternate walk 4-7, parcel drop 8-13, the parcel capsule opening 14-19), row 14 the emote icons.
const PPL = { rows: 15, cw: 12, ch: 16, walk: 6, idle: 4, W: 384, H: 240 };
const F_IDLE = 6, F_SPEC = 10, F_SIT = 16, F_USE = 20, F_ANGRY = 26;
const ROW_COP = 12, ROW_BOT = 13, ROW_EMO = 14, CITIZEN_ROWS = 12;
const EMO = { bang: 0, quest: 1, heart: 2, anger: 3, sweat: 4, note: 5, dots: 6, bowl: 7 };
const PPL_TEX = new THREE.TextureLoader().load('assets/sprites/people.png');
PPL_TEX.magFilter = PPL_TEX.minFilter = THREE.NearestFilter; PPL_TEX.generateMipmaps = false;
const PPL_MAX = 700;          // most people drawn at once (the nearest win if more are out)
const PPL_SPEED = .55;        // walking speed, world units a second (a block takes about 7 s)

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
      // people catch a little of the street light, so they still read at night; emote bubbles are always bright
      vec3 col = vSpr.w > 1.5 ? c.rgb : c.rgb * mix(tint, vec3(1.0), 0.3);
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

/* ---------- what's in the way: a footprint map of every plot ---------- */
// Each plot gets a 5 cm map of everything standing in the walking band (ankle to head height): walls, benches,
// lamps, planters, railings, and the plants and laundry sprites too. People only ever walk where this map is clear,
// with a little elbow room, so nobody passes through a building, a bush or a bench.
const GR = .05, GN = Math.round(LOT/GR);      // footprint map: cells per side
const PR = .1, PN = Math.round(LOT/PR);       // walking map (coarser): cells per side
const Y_LO = .14, Y_HI = .95, CLEAR = .17;    // the band people occupy, and how far they keep from things
function clipY(pts, h, s){
  const out = [];
  for (let k = 0; k < pts.length; k++){
    const a = pts[k], b = pts[(k + 1) % pts.length], da = s*(a[1] - h), db = s*(b[1] - h);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)){ const u = da/(da - db); out.push([a[0] + (b[0] - a[0])*u, h, a[2] + (b[2] - a[2])*u]); }
  }
  return out;
}
// everything in a generated piece (its triangles and its sprites) stamped onto a footprint map
function rasterize(data, x0, z0, nx, nz){
  const solid = new Uint8Array(nx*nz), soft = new Uint8Array(nx*nz), high = new Uint8Array(nx*nz), mid = new Uint8Array(nx*nz);
  const mark = (arr, x, z) => { const ix = Math.floor((x - x0)/GR), iz = Math.floor((z - z0)/GR); if (ix >= 0 && iz >= 0 && ix < nx && iz < nz) arr[iz*nx + ix] = 1; };
  const line = (arr, ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az)/(GR*.5)) + 1; for (let k = 0; k <= n; k++){ const u = k/n; mark(arr, ax + (bx - ax)*u, az + (bz - az)*u); } };
  const x1 = x0 + nx*GR, z1 = z0 + nz*GR;
  for (const geo of data.geo.values()){
    if (geo.attributes.uv) continue;   // flat floor decals: nothing to walk round
    const P = geo.attributes.position.array;
    for (let t = 0; t + 8 < P.length; t += 9){
      const y0 = P[t + 1], y1 = P[t + 4], y2 = P[t + 7];
      if ((y0 < Y_LO && y1 < Y_LO && y2 < Y_LO) || (y0 > Y_HI && y1 > Y_HI && y2 > Y_HI)) continue;
      const ax = P[t], az = P[t + 2], bx = P[t + 3], bz = P[t + 5], cx = P[t + 6], cz = P[t + 8];
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
      const tri = [[ax, y0, az], [bx, y1, bz], [cx, y2, cz]];
      // door height: what reaches the top of a doorway (so a door goes on a wall, never on a planter or a bench);
      // and what's knee to chest high (a step up to a door is fine, a bench in front of it isn't)
      if (Math.max(y0, y1, y2) > .72){ const hp = clipY(clipY(tri, .72, 1), Y_HI, -1);
        for (let k = 0; k < hp.length; k++){ const p = hp[k], q = hp[(k + 1) % hp.length]; line(high, p[0], p[2], q[0], q[2]); } }
      if (Math.max(y0, y1, y2) > .32 && Math.min(y0, y1, y2) < .7){ const mp = clipY(clipY(tri, .32, 1), .7, -1);
        for (let k = 0; k < mp.length; k++){ const p = mp[k], q = mp[(k + 1) % mp.length]; line(mid, p[0], p[2], q[0], q[2]); } }
      const pts = clipY(clipY(tri, Y_LO, 1), Y_HI, -1);
      if (pts.length < 2) continue;
      // the outline (catches walls, which are lines seen from above), then the inside of anything with area
      for (let k = 0; k < pts.length; k++){ const p = pts[k], q = pts[(k + 1) % pts.length]; line(solid, p[0], p[2], q[0], q[2]); }
      let area = 0; for (let k = 0; k < pts.length; k++){ const p = pts[k], q = pts[(k + 1) % pts.length]; area += p[0]*q[2] - q[0]*p[2]; }
      if (Math.abs(area) < GR*GR) continue;
      const sg = Math.sign(area);
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const p of pts){ mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]); }
      const i0 = Math.max(0, Math.floor((mnx - x0)/GR)), i1 = Math.min(nx - 1, Math.floor((mxx - x0)/GR)), j0 = Math.max(0, Math.floor((mnz - z0)/GR)), j1 = Math.min(nz - 1, Math.floor((mxz - z0)/GR));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
        const x = x0 + (i + .5)*GR, z = z0 + (j + .5)*GR;
        let inside = true;
        for (let k = 0; k < pts.length && inside; k++){ const p = pts[k], q = pts[(k + 1) % pts.length]; if (sg*((q[0] - p[0])*(z - p[2]) - (q[2] - p[2])*(x - p[0])) < 0) inside = false; }
        if (inside) solid[j*nx + i] = 1;
      }
    }
  }
  // sprites: the solid middle of each plant, laundry or sign that reaches into the band
  for (const k in data.fol){ if (/^gt\d$/.test(k)) continue;   // lawn grass: walked and sat on, not round
    for (const f of data.fol[k]){
    const e = f.m.elements, oy = e[13], hy = e[5], yb = oy - f.an*hy, yt = oy + (1 - f.an)*hy;
    if (Math.max(yb, yt) < Y_LO || Math.min(yb, yt) > Y_HI) continue;
    const hx = e[0]*.35, hz = e[2]*.35;
    line(soft, e[12] - hx, e[14] - hz, e[12] + hx, e[14] + hz);
  } }
  return { solid, soft, high, mid, nx, nz };
}
// a plot's maps: footprint (solid geometry, soft sprites) and the walking map, where free means a person fits
function cellGrid(c){
  const m = c.mega ? megas.get(c.mega) : null, src = m ? m.data : c.data;
  if (c._pg && c._pg.src === src) return c._pg;
  let r;
  if (m){
    if (!m._pr || m._pr.src !== src) m._pr = { src, r: src ? rasterize(src, m.i*LOT - LOT/2, m.j*LOT - LOT/2, m.w*GN, m.h*GN) : null };
    r = m._pr.r;
  }
  const solid = new Uint8Array(GN*GN), soft = new Uint8Array(GN*GN), high = new Uint8Array(GN*GN), mid = new Uint8Array(GN*GN);
  if (m && r){ const oi = (c.i - m.i)*GN, oj = (c.j - m.j)*GN;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++){ const q = (oj + j)*r.nx + oi + i; solid[j*GN + i] = r.solid[q]; soft[j*GN + i] = r.soft[q]; high[j*GN + i] = r.high[q]; mid[j*GN + i] = r.mid[q]; } }
  else if (src){ const q = rasterize(src, c.x - LOT/2, c.z - LOT/2, GN, GN); solid.set(q.solid); soft.set(q.soft); high.set(q.high); mid.set(q.mid); }
  const free = new Uint8Array(PN*PN).fill(1), rr = CLEAR + GR*.5, k = PR/GR;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++){
    if (!solid[j*GN + i] && !soft[j*GN + i]) continue;
    const x = (i + .5)*GR, z = (j + .5)*GR;
    const p0 = Math.max(0, Math.floor((x - rr)/PR)), p1 = Math.min(PN - 1, Math.floor((x + rr)/PR)), q0 = Math.max(0, Math.floor((z - rr)/PR)), q1 = Math.min(PN - 1, Math.floor((z + rr)/PR));
    for (let q = q0; q <= q1; q++) for (let p = p0; p <= p1; p++){ const dx = (p + .5)*PR - x, dz = (q + .5)*PR - z; if (dx*dx + dz*dz <= rr*rr) free[q*PN + p] = 0; }
  }
  return (c._pg = { src, solid, soft, high, mid, free, x0: c.x - LOT/2, z0: c.z - LOT/2 });
}
const gIdx = (v, n, step) => Math.max(0, Math.min(n - 1, Math.floor(v/step)));
const freeAt = (G, x, z) => G.free[gIdx(z - G.z0, PN, PR)*PN + gIdx(x - G.x0, PN, PR)] === 1;
const solidAt = (G, x, z) => G.solid[gIdx(z - G.z0, GN, GR)*GN + gIdx(x - G.x0, GN, GR)] === 1;
const midAt = (G, x, z) => G.mid[gIdx(z - G.z0, GN, GR)*GN + gIdx(x - G.x0, GN, GR)] === 1;
const highAt = (G, x, z) => G.high[gIdx(z - G.z0, GN, GR)*GN + gIdx(x - G.x0, GN, GR)] === 1;
const softAt = (G, x, z) => G.soft[gIdx(z - G.z0, GN, GR)*GN + gIdx(x - G.x0, GN, GR)] === 1;
function clearLine(G, ax, az, bx, bz){
  const n = Math.ceil(Math.hypot(bx - ax, bz - az)/(PR*.4)) + 1;
  for (let k = 0; k <= n; k++){ const u = k/n; if (!freeAt(G, ax + (bx - ax)*u, az + (bz - az)*u)) return false; }
  return true;
}

/* ---------- the walking network ---------- */
// Plots are joined by crossing points on the street between them (where the crosswalks are), each placed where
// both sides are clear. Inside a plot, every pair of its crossing points, its door and any standing spots is
// joined by a path found on the walking map, then straightened wherever a straight line stays clear. Those paths
// are cached per plot and only redone when the plot changes. Megastructures are walked round; their doors open
// onto the street. The town square is open ground, walked across like a plaza.
let NG = { x: [], z: [], adj: [], key: new Map() };
const ngAdd = (k, x, z) => { let n = NG.key.get(k); if (n !== undefined) return n; n = NG.x.length; NG.x.push(x); NG.z.push(z); NG.adj.push(new Map()); NG.key.set(k, n); return n; };
const openMega = c => { const t = c && c.mega && MEGA_LIFE[c.mega]; return !!(t && t.open); };
const pathable = c => !!c && (!c.mega || openMega(c));
const closedMega = c => !!c && !!c.mega && !openMega(c);
// where to cross between two neighbouring plots: as near the middle of the side as is clear on both sides
function crossing(a, b, dx, dz){
  const Ga = cellGrid(a), Gb = cellGrid(b), bx = a.x + dx*LOT/2, bz = a.z + dz*LOT/2;
  for (let k = 0; k <= 26; k++){
    const t = (k % 2 ? 1 : -1)*Math.ceil(k/2)*PR, x = bx + (dz ? t : 0), z = bz + (dx ? t : 0);
    if (freeAt(Ga, x - dx*.05, z - dz*.05) && freeAt(Gb, x + dx*.05, z + dz*.05)) return { x, z };
  }
  return null;
}
// a door: walk in from the middle of a side to the first wall; it must be flat across the doorway, with room to stand in front
function findDoor(c, dx, dz, maxIn, tol = .08){
  // the middle of the side first, then further along it either way
  for (const off of [0, .35, -.35, .65, -.65]){ const d = doorAt(c, dx, dz, maxIn, off, tol); if (d) return d; }
  return null;
}
// no wall to put a door on (a tower on stilts, an open ground floor): people walk in under it as far as there's room
// and slip inside there, without a drawn door
function openEntry(c, dx, dz, maxIn){
  const G = cellGrid(c), bx = c.x + dx*LOT/2, bz = c.z + dz*LOT/2;
  let last = -1;
  for (let u = 0; u <= maxIn; u += PR*.5){ if (freeAt(G, bx - dx*u, bz - dz*u)) last = u; else if (last >= 0) break; }
  if (last < .4) return null;
  const sx = bx - dx*last, sz = bz - dz*last;
  return { wall: { x: sx - dx*.1, z: sz - dz*.1 }, stand: { x: sx, z: sz }, inside: { x: sx - dx*.3, z: sz - dz*.3 }, n: [dx, dz], side: [dx, dz], noDraw: true };
}
function doorAt(c, dx, dz, maxIn, off, tol){
  const G = cellGrid(c), lx = dz ? 1 : 0, lz = dx ? 1 : 0, bx = c.x + dx*LOT/2 + lx*off, bz = c.z + dz*LOT/2 + lz*off;
  const P = (u, o) => [bx - dx*u + lx*o, bz - dz*u + lz*o];
  const hitAt = (o, test, from = 0, to = maxIn) => { for (let u = from; u <= to; u += GR*.5){ const [x, z] = P(u, o); if (test(G, x, z)) return u; } return -1; };
  // the first thing in the way decides where people stand; the door goes on the first door-high wall at or just behind it
  // (a low step or plinth may sit in front of it)
  const u0 = hitAt(0, solidAt); if (u0 < .3) return null;
  const uw = hitAt(0, highAt, u0 - .05, u0 + .5); if (uw < 0) return null;
  const uL = hitAt(-.18, highAt, uw - .25, uw + .25), uR = hitAt(.18, highAt, uw - .25, uw + .25);
  if (uL < 0 || uR < 0 || Math.abs(uL - uw) > tol || Math.abs(uR - uw) > tol) return null;
  for (const o of [-.15, 0, .15]) for (let u = u0; u < uw - .06; u += GR*.5){ const [x, z] = P(u, o); if (midAt(G, x, z) || softAt(G, x, z)) return null; }
  // the wall's own direction, from the two side samples, so the door sits flush on a slightly turned building
  const [wlx, wlz] = P(uL, -.18), [wrx, wrz] = P(uR, .18);
  let nx = -(wrz - wlz), nz = wrx - wlx; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  if (nx*dx + nz*dz < 0){ nx = -nx; nz = -nz; }
  const [wx, wz] = P(uw - GR*.25, 0), [fx, fz] = P(u0, 0);
  const stand = { x: fx + nx*(CLEAR + .12), z: fz + nz*(CLEAR + .12) };
  if (!freeAt(G, stand.x, stand.z)) return null;
  for (let u = .05; u < CLEAR + .1; u += GR*.5) if (softAt(G, fx + nx*u, fz + nz*u)) return null;   // nothing leafy in the doorway
  return { wall: { x: wx, z: wz }, stand, inside: { x: wx - nx*.2, z: wz - nz*.2 }, n: [nx, nz], side: [dx, dz] };
}
// paths across one plot between its endpoints (grid search, then straightened)
const _gd = new Float32Array(PN*PN), _gp = new Int32Array(PN*PN), _gh = new Uint8Array(PN*PN);
function gridPaths(G, from, targets){
  _gd.fill(Infinity); _gp.fill(-1); _gh.fill(0);
  const s = gIdx(from.z - G.z0, PN, PR)*PN + gIdx(from.x - G.x0, PN, PR);
  const heap = [], hf = [];
  const push = (v, f) => { heap.push(v); hf.push(f); let i = heap.length - 1; while (i > 0){ const q = (i - 1) >> 1; if (hf[q] <= hf[i]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; [hf[q], hf[i]] = [hf[i], hf[q]]; i = q; } };
  const pop = () => { const top = heap[0], lv = heap.pop(), lf = hf.pop(); if (heap.length){ heap[0] = lv; hf[0] = lf; let i = 0;
    for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  _gd[s] = 0; push(s, 0);
  while (heap.length){
    const v = pop(); if (_gh[v]) continue; _gh[v] = 1;
    const vx = v % PN, vz = (v - vx)/PN;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      if (!dx && !dz) continue;
      const x = vx + dx, z = vz + dz; if (x < 0 || z < 0 || x >= PN || z >= PN) continue;
      const w = z*PN + x; if (!G.free[w]) continue;
      if (dx && dz && (!G.free[vz*PN + x] || !G.free[z*PN + vx])) continue;   // no squeezing past a corner
      const d = _gd[v] + (dx && dz ? 1.4142 : 1);
      if (d < _gd[w]){ _gd[w] = d; _gp[w] = v; push(w, d); }
    }
  }
  return targets.map(t => {
    let v = gIdx(t.z - G.z0, PN, PR)*PN + gIdx(t.x - G.x0, PN, PR);
    if (!isFinite(_gd[v])) return null;
    const cellsOnWay = []; for (; v !== -1; v = _gp[v]) cellsOnWay.push(v);
    cellsOnWay.reverse();
    const raw = [[from.x, from.z]];
    for (let k = 1; k < cellsOnWay.length - 1; k++){ const q = cellsOnWay[k], px = q % PN; raw.push([G.x0 + (px + .5)*PR, G.z0 + ((q - px)/PN + .5)*PR]); }
    raw.push([t.x, t.z]);
    // straighten: from each point, jump to the furthest point still in clear sight
    const pts = [raw[0]];
    for (let i = 0; i < raw.length - 1;){
      let j = raw.length - 1;
      while (j > i + 1 && !clearLine(G, raw[i][0], raw[i][1], raw[j][0], raw[j][1])) j--;
      pts.push(raw[j]); i = j;
    }
    let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return { pts, len };
  });
}
function ngLink(a, b, pts, len, cost = len){ if (a === b) return; const e = { a, pts, len, cost }; NG.adj[a].set(b, e); NG.adj[b].set(a, e); }
// one plot's paths, cached until the plot or its endpoints change
function plotEdges(c, ends, pairOk){
  const G = cellGrid(c), sig = ends.map(e => e.key + '@' + e.x.toFixed(2) + ',' + e.z.toFixed(2)).join('|');
  if (!c._pe || c._pe.src !== G.src || c._pe.sig !== sig){
    const edges = [];
    for (let i = 0; i < ends.length; i++){
      const tg = []; for (let j = i + 1; j < ends.length; j++) if (pairOk(ends[i], ends[j])) tg.push(ends[j]);
      if (!tg.length) continue;
      gridPaths(G, ends[i], tg).forEach((r, k) => { if (r) edges.push({ a: ends[i].key, b: tg[k].key, pts: r.pts, len: r.len }); });
    }
    c._pe = { src: G.src, sig, edges };
  }
  // a lawn is somewhere to go and sit, not a short cut: walking over one costs several times the distance, so a route
  // only crosses it when there's no reasonable way round (or when the lawn is where they're going)
  const k = c.green === 'grass' && !c.sections.length && !c.mega ? LAWN_COST : 1;
  for (const e of c._pe.edges){ const a = NG.key.get(e.a), b = NG.key.get(e.b); if (a !== undefined && b !== undefined) ngLink(a, b, e.pts, e.len, e.len*k); }
}
// shortest walk between two network points (A*), as one polyline
const routeCache = new Map(), LAWN_COST = 5;
function route(a, b){
  if (a === b) return [[NG.x[a], NG.z[a]]];
  const key = a + '>' + b;
  if (routeCache.has(key)) return routeCache.get(key);
  const n = NG.x.length, g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const heap = [], hf = [];
  const push = (v, f) => { heap.push(v); hf.push(f); let i = heap.length - 1; while (i > 0){ const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0], lv = heap.pop(), lf = hf.pop(); if (heap.length){ heap[0] = lv; hf[0] = lf; let i = 0;
    for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  const hz = v => Math.hypot(NG.x[v] - NG.x[b], NG.z[v] - NG.z[b]);
  g[a] = 0; push(a, hz(a));
  let found = false;
  while (heap.length){
    const v = pop(); if (done[v]) continue; done[v] = 1;
    if (v === b){ found = true; break; }
    for (const [w, e] of NG.adj[v]){ const d = g[v] + e.cost; if (d < g[w]){ g[w] = d; from[w] = v; push(w, d + hz(w)); } }
  }
  let out = null;
  if (found){
    const nodes = []; for (let v = b; v !== -1; v = from[v]) nodes.push(v); nodes.reverse();
    out = [[NG.x[a], NG.z[a]]];
    for (let k = 1; k < nodes.length; k++){
      const e = NG.adj[nodes[k - 1]].get(nodes[k]), pts = e.a === nodes[k - 1] ? e.pts : e.pts.slice().reverse();
      for (let q = 1; q < pts.length; q++) out.push(pts[q]);
    }
  }
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
  square:  { jobs: 0,  fun: 40, open: true },   // one stall keeper per food stall (see below)
  police:  { jobs: 8,  fun: 0,  night: .4, patrol: true },
  foundry: { jobs: 14, fun: 0,  night: .35 },
  market:  { jobs: 10, fun: 14 },             // the market mall: shopkeepers inside, plenty of shoppers
  pagoda:  { jobs: 12, fun: 10, night: .2 },  // the cloud pagoda: a luxury hotel and spa
};
const places = new Map();   // id -> { id, x, z, doors: [{ node, out:{x,z}, in:{x,z}|null, dir:[dx,dz] }], jobs, fun, open, night, cell|mega }
const people = new Map();   // id -> person
const hrange = (lo, hi) => (h => lo <= hi ? (h >= lo && h < hi) : (h >= lo || h < hi));
const span = (u, a, b) => a + (b - a)*u;
function u01(...a){ return hash(...a) / 4294967296; }

const reachable = pl => !!pl && (pl.doors.length > 0 || (pl.spots && pl.spots.length > 0));
const crossKey = (c, dx, dz) => dx + dz > 0 ? c.i + ',' + c.j + '|' + dx + ',' + dz : (c.i + dx) + ',' + (c.j + dz) + '|' + (-dx) + ',' + (-dz);
const DOOR_COLS = [0x4f7f86, 0x8A4A2A, 0x3a4252, 0xc95a7a, 0x6fa8dc, 0xd9b43a, 0x5f7d5b, 0xE3D6BD];
const posKey = (x, z) => Math.round(x*1000) + ',' + Math.round(z*1000);
let crossAt = new Map(), patrolNodes = [], doorList = [], hiddenDoors = [], spotByKey = new Map(), doorByKey = new Map();
function makeDoor(key, d, mega, old){
  const door = { key, node: ngAdd(key, d.stand.x, d.stand.z), wall: d.wall, stand: d.stand, inside: d.inside, n: d.n, mega, noDraw: !!d.noDraw,
                 open: old ? old.open : 0, want: false, col: DOOR_COLS[hash(key) % DOOR_COLS.length] };
  (door.noDraw ? hiddenDoors : doorList).push(door); doorByKey.set(key, door); return door;
}
// a plot's door search is cached until the plot changes
function plotDoor(c, sides, maxIn){
  const G = cellGrid(c), sig = sides.map(s => s.join()).join('|');
  if (!c._pd || c._pd.src !== G.src || c._pd.sig !== sig){
    let found = null;
    for (const [dx, dz] of sides){ found = findDoor(c, dx, dz, maxIn); if (found) break; }
    if (!found) for (const [dx, dz] of sides){ found = findDoor(c, dx, dz, maxIn, .16); if (found) break; }   // a rougher wall will do
    if (!found) for (const [dx, dz] of sides){ found = openEntry(c, dx, dz, maxIn); if (found) break; }
    c._pd = { src: G.src, sig, door: found };
  }
  return c._pd.door;
}
// Spots where people stand or sit. Each is reached from the nearest clear point of the walking map (its approach,
// a network node); the last little step onto a seat or behind a counter is taken from there. Spots crowding an
// earlier one are dropped, so two people never stand in each other.
function approachFor(G, x, z, fx, fz){
  if (freeAt(G, x, z)) return { x, z };
  const cx = gIdx(x - G.x0, PN, PR), cz = gIdx(z - G.z0, PN, PR); let best = null, bd = Infinity;
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++){
    const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= PN || Z >= PN || !G.free[Z*PN + X]) continue;
    const wx = G.x0 + (X + .5)*PR, wz = G.z0 + (Z + .5)*PR, d2 = (wx - x)**2 + (wz - z)**2;
    if (d2 > .64) continue;
    const sc = d2 - .2*((wx - x)*fx + (wz - z)*fz);   // rather in front of a seat than behind it
    if (sc < bd){ bd = sc; best = { x: wx, z: wz }; }
  }
  return best;
}
function makeSpots(pl, list, inside, oldSpots, addEnd){
  list.forEach((r, n) => {
    if (pl.spots.some(o => Math.hypot(o.x - r.x, o.z - r.z) < .34)) return;
    const c = cells.get(ckey(Math.round(r.x/LOT), Math.round(r.z/LOT))); if (!inside(c)) return;
    if (r.act && (c.green !== 'grass' || c.sections.length)) return;   // sitting on the ground: only on a plot laid fully to lawn
    const ap = approachFor(cellGrid(c), r.x, r.z, r.fx, r.fz); if (!ap) return;
    // the key names the spot by what and where it is, so a plot rebuilt differently (a lawn paved over, say) never
    // hands its old sitters a different seat in the wrong place
    const key = 's:' + pl.id + ':' + n + ':' + (r.act || r.kind) + ':' + Math.round(r.x*20) + ',' + Math.round(r.z*20), old = oldSpots.get(key), nk = 'a:' + Math.round(ap.x*100) + ',' + Math.round(ap.z*100);
    const sp = { key, x: r.x, y: r.y, z: r.z, ax: ap.x, az: ap.z, node: ngAdd(nk, ap.x, ap.z), kind: r.kind, stall: r.stall, face: [r.fx, r.fz],
                 by: old ? old.by : null, place: pl.id, near: [], act: r.act, hx: r.hx, hz: r.hz, ad: r.ad, pic: r.pic };
    pl.spots.push(sp); spotByKey.set(key, sp); addEnd(c, { key: nk, x: ap.x, z: ap.z, kind: 's' });
  });
  // who could chat with whom: standing spots close together
  for (const a of pl.spots) if (a.kind === 'stand') for (const b of pl.spots) if (b !== a && b.kind === 'stand' && Math.hypot(a.x - b.x, a.z - b.z) < .8) a.near.push(b);
  // on a lawn: the other half of a picnic or a pair, and the other viewer of the same projector
  for (const a of pl.spots) if (a.act) for (const b of pl.spots) if (b !== a && b.act === a.act && Math.hypot(a.x - b.x, a.z - b.z) < .9) a.near.push(b);
}
// Rebuild the network, the places and their doors after an edit. Unchanged plots reuse their cached maps and paths.
function buildNetwork(){
  NG = { x: [], z: [], adj: [], key: new Map() }; routeCache.clear();
  const oldDoors = doorByKey, oldSpots = spotByKey;
  doorList = []; hiddenDoors = []; doorByKey = new Map(); spotByKey = new Map();
  // crossing points between neighbouring plots
  const cross = new Map();
  for (const c of cells.values()) for (const [dx, dz] of SIDES4){
    const nb = cells.get(ckey(c.i + dx, c.j + dz)); if (!nb) continue;
    if (c.mega && c.mega === nb.mega && !openMega(c)) continue;               // inside a closed megastructure
    const ok = (pathable(c) && (pathable(nb) || closedMega(nb))) || (closedMega(c) && pathable(nb));
    if (!ok) continue;
    const k = crossKey(c, dx, dz); if (cross.has(k)) continue;
    const p = crossing(c, nb, dx, dz);
    cross.set(k, p ? { key: 'x:' + k, x: p.x, z: p.z, kind: 'x' } : null);
    if (p) ngAdd('x:' + k, p.x, p.z);
  }
  patrolNodes = [...cross.values()].filter(Boolean).map(c => ({ key: c.key, node: NG.key.get(c.key), x: c.x, z: c.z }));
  crossAt = new Map(patrolNodes.map(c => [posKey(c.x, c.z), c]));
  const plotEnds = new Map();   // plot key -> extra endpoints (doors, standing spots)
  const addEnd = (c, e) => { const k = ckey(c.i, c.j); (plotEnds.get(k) || plotEnds.set(k, []).get(k)).push(e); };
  const fresh = new Map();
  // buildings: one front door, on a side with a street crossing if possible (the order is seeded per building)
  for (const c of cells.values()){
    if (!c.sections.length || c.mega) continue;
    let jobs = 0, fun = 0, night = 0;
    c.sections.forEach((s, k) => { const L = ZONE_LIFE[s.zone]; if (!L) return;
      jobs += Math.round(span(u01('jobs', c.i, c.j, k, s.seed), L.jobs[0], L.jobs[1] + .99) - .49);
      fun += L.fun * (k === 0 ? 1 : .4);
      if (s.zone === 'ind') night = .3; });
    const h = hash('door', c.i, c.j, c.sections[0].seed), order = [0, 1, 2, 3].map(k => SIDES4[(h + k) % 4]);
    const sides = order.filter(([dx, dz]) => cross.get(crossKey(c, dx, dz))).concat(order.filter(([dx, dz]) => !cross.get(crossKey(c, dx, dz))));
    const d = plotDoor(c, sides, 1.75), doors = [];
    if (d){ const key = 'd:' + c.i + ',' + c.j; doors.push(makeDoor(key, d, false, oldDoors.get(key))); addEnd(c, { key, x: d.stand.x, z: d.stand.z, kind: 'd' }); }
    fresh.set('c:' + c.i + ',' + c.j, { id: 'c:' + c.i + ',' + c.j, cell: c, x: c.x, z: c.z, jobs, fun, night, doors });
  }
  // benches round the city: a little place to sit for a while
  for (const c of cells.values()){
    if (c.mega || !c.data || !c.data.spots || !c.data.spots.length) continue;
    const pl = { id: 'b:' + c.i + ',' + c.j, bench: true, x: c.x, z: c.z, jobs: 0, fun: 0, night: 0, open: true, doors: [], spots: [] };
    makeSpots(pl, c.data.spots, q => q === c, oldSpots, addEnd);
    pl.fun = .25*pl.spots.length;
    if (pl.spots.length) fresh.set(pl.id, pl);
  }
  for (const m of megas.values()){
    const L = MEGA_LIFE[m.kind] || { jobs: 4, fun: 0 }, tiers = m.kind === 'mall' ? m.levels : 1;
    const pl = { id: 'm:' + m.kind, mega: m, x: m.x, z: m.z, jobs: L.jobs*tiers, fun: L.fun*tiers, night: L.night || 0, open: !!L.open, patrol: !!L.patrol, doors: [], spots: [] };
    if (L.open){
      // the spots noted while the square was built: the crowd, cafe stools, queues and stall keepers' places
      makeSpots(pl, m.data ? m.data.spots : [], c => c && c.mega === m.kind, oldSpots, addEnd);
      pl.stalls = new Map();
      for (const sp of pl.spots) if (sp.stall !== null && sp.stall !== undefined){
        let st = pl.stalls.get(sp.stall); if (!st) pl.stalls.set(sp.stall, st = { id: sp.stall, keepers: [], queue: [] });
        (sp.kind === 'vendor' ? st.keepers : st.queue).push(sp);
      }
      for (const [k, st] of pl.stalls) if (!st.keepers.length || !st.queue.length) pl.stalls.delete(k);
      pl.jobs = pl.stalls.size;
    } else {
      // doors on the walls that face the street, up to three, spread round the building
      const cand = [];
      for (const b of m.cells) for (const [dx, dz] of SIDES4){
        if (!cross.get(crossKey(b, dx, dz))) continue;
        const d = plotDoor(b, [[dx, dz]], 1.8);
        if (d) cand.push({ b, d, key: 'd:' + m.kind + ':' + b.i + ',' + b.j + ',' + dx + ',' + dz });
      }
      cand.sort((p, q) => (p.d.noDraw ? 1 : 0) - (q.d.noDraw ? 1 : 0) || hash(p.key, m.seed) - hash(q.key, m.seed));   // real doors first
      const pick3 = [];
      for (const cd of cand) if (pick3.length < 3 && pick3.every(o => Math.hypot(o.d.wall.x - cd.d.wall.x, o.d.wall.z - cd.d.wall.z) > 4)) pick3.push(cd);
      for (const cd of pick3){ pl.doors.push(makeDoor(cd.key, cd.d, true, oldDoors.get(cd.key))); addEnd(cd.b, { key: cd.key, x: cd.d.stand.x, z: cd.d.stand.z, kind: 'd' }); }
    }
    fresh.set(pl.id, pl);
  }
  // paths across each plot between its crossings, door and spots
  for (const c of cells.values()){
    const ends = [];
    for (const [dx, dz] of SIDES4){ const p = cross.get(crossKey(c, dx, dz)); if (p) ends.push(p); }
    for (const e of plotEnds.get(ckey(c.i, c.j)) || []) if (!ends.some(o => o.key === e.key)) ends.push(e);
    if (ends.length < 2) continue;
    // a closed megastructure's plot only links its doors to the street, never street to street through the building
    plotEdges(c, ends, closedMega(c) ? (a, b) => (a.kind === 'd') !== (b.kind === 'd') : () => true);
  }
  places.clear(); for (const [k, v] of fresh) places.set(k, v);
  rebuildDoorMeshes();
}

/* ---------- doors: drawn on the buildings, sliding open when someone comes or goes ---------- */
const DOOR_MAX = 1200;
const DOOR_PANEL = toon(0xffffff);
const doorFrame = new THREE.InstancedMesh(U.box, M.metalDark, DOOR_MAX*3);
const DOOR_HALL = toon(0x4a3826, { em: 0xd8a868, kind: 'hall' });   // the lit hallway behind the door (a fixed, steady glow)
const doorLight = new THREE.InstancedMesh(U.box, DOOR_HALL, DOOR_MAX);
const doorPanel = new THREE.InstancedMesh(U.box, DOOR_PANEL, DOOR_MAX);
doorPanel.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DOOR_MAX*3), 3);   // made up front: three sizes it to the count at first use
for (const m of [doorFrame, doorLight, doorPanel]){ m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.raycast = () => {}; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const _dm = new THREE.Matrix4(), _dl = new THREE.Matrix4(), _dc = new THREE.Color();
function doorBasis(d){ const k = d.mega ? 1.35 : 1; return _dm.makeRotationY(Math.atan2(d.n[0], d.n[1])).setPosition(d.wall.x, CURB, d.wall.z).multiply(_dl.makeScale(k, k, k)); }
const doorPart = (B, x, y, z, w, h, dd) => B.clone().multiply(_dl.compose(_p.set(x, y, z), _q.identity(), _s.set(w, h, dd)));
function setPanel(i, d){ doorPanel.setMatrixAt(i, doorPart(doorBasis(d), d.open*.37, .34, .045, .35, .66, .03)); }
function rebuildDoorMeshes(){
  const n = Math.min(doorList.length, DOOR_MAX);
  for (let i = 0; i < n; i++){
    const d = doorList[i], B = doorBasis(d).clone();
    doorFrame.setMatrixAt(i*3, doorPart(B, -.2, .36, .025, .05, .72, .05));
    doorFrame.setMatrixAt(i*3 + 1, doorPart(B, .2, .36, .025, .05, .72, .05));
    doorFrame.setMatrixAt(i*3 + 2, doorPart(B, 0, .745, .025, .45, .06, .05));
    doorLight.setMatrixAt(i, doorPart(B, 0, .34, .006, .35, .68, .012));
    setPanel(i, d); doorPanel.setColorAt(i, _dc.setHex(d.col));
  }
  doorFrame.count = n*3; doorLight.count = doorPanel.count = n;
  doorFrame.instanceMatrix.needsUpdate = doorLight.instanceMatrix.needsUpdate = doorPanel.instanceMatrix.needsUpdate = true;
  if (doorPanel.instanceColor) doorPanel.instanceColor.needsUpdate = true;
}
// doors open in about a fifth of a second when someone is about to step through, and close behind them
function updateDoors(dt){
  for (const p of pplList){ const w = p.walk; if (!w) continue;
    if (w.doorA && w.s < .55) w.doorA.want = true;
    if (w.doorB && w.len - w.s < .8) w.doorB.want = true; }
  for (const b of bots){ const w = b.walk;
    if (w){ if (w.doorA && w.s < .55) w.doorA.want = true; if (w.doorB && w.len - w.s < .8) w.doorB.want = true; }
    if (b.state === 'drop' && pplNow - b.t0 > 1.6 && b.door) b.door.want = true; }   // someone opens up to take the parcel
  let moved = false;
  for (let i = 0; i < doorList.length && i < DOOR_MAX; i++){
    const d = doorList[i], o = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1)*dt/.2));
    d.want = false;
    if (o !== d.open){ d.open = o; setPanel(i, d); moved = true; }
  }
  if (moved) doorPanel.instanceMatrix.needsUpdate = true;
}

/* ---------- residents ---------- */
// A person is seeded from their home section and their place in the household, so they're the same person every
// time the city loads: same look, same habits, same walk.
// bedtimes lean early: most turn in by midnight, a few night owls stay out till 3
function makePerson(id, home){
  const u = k => u01(id, k);
  const wake = span(u('wake'), 6, 8.5);
  return { id, home, job: null, wantsJob: u('emp') < .8, courier: u('courier') < .2, row: hash(id, 'look') % CITIZEN_ROWS,
           speed: PPL_SPEED*span(u('speed'), .85, 1.15), lane: span(u('lane'), -.08, .32), wide: span(u('wide'), -.75, 1.05),
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
  const open = [...places.values()].filter(pl => pl.jobs > (used.get(pl.id) || 0) && reachable(pl));
  const seekers = [...people.values()].filter(p => !p.job && p.wantsJob).sort((a, b) => a.id < b.id ? -1 : 1);
  for (const p of open.length ? seekers : []){
    const home = places.get(p.home); if (!home) continue;
    const rr = mulberry32(hash(p.id, 'job', open.length));
    let tot = 0; const w = open.map(pl => { const free = pl.jobs - (used.get(pl.id) || 0); const v = free > 0 && pl.id !== p.home ? free/(1 + Math.hypot(pl.x - home.x, pl.z - home.z)/12) : 0; tot += v; return v; });
    if (tot <= 0) break;
    let r = rr()*tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    p.job = open[k].id; used.set(p.job, (used.get(p.job) || 0) + 1);
  }
  // the stalls and the police station are always staffed: if nobody's looking for work, people living nearby
  // swap their job for one
  for (const sq of [places.get('m:square'), places.get('m:police')]){
    if (!sq) continue;
    let need = sq.jobs - [...people.values()].filter(p => p.job === sq.id).length;
    if (need > 0){
      const near = [...people.values()].filter(p => p.job !== sq.id && p.wantsJob && places.get(p.home))
        .sort((a, b) => { const ha = places.get(a.home), hb = places.get(b.home); return Math.hypot(ha.x - sq.x, ha.z - sq.z) - Math.hypot(hb.x - sq.x, hb.z - sq.z) || (a.id < b.id ? -1 : 1); });
      for (const p of near){ if (need <= 0) break; if (p.job === 'm:square' || p.job === 'm:police') continue; p.job = sq.id; need--; }
    }
  }
  assignStalls();
}
// each of the square's workers keeps one stall; half work the day market, half the night market
function assignStalls(){
  const sq = places.get('m:square');
  const staff = [...people.values()].filter(p => sq && p.job === sq.id).sort((a, b) => a.id < b.id ? -1 : 1);
  const ids = sq ? [...sq.stalls.keys()].sort((a, b) => a - b) : [];
  staff.forEach((p, k) => { p.stall = ids[k % ids.length]; });
  for (const p of people.values()) if (!sq || p.job !== sq.id) p.stall = null;
  for (const p of people.values()){ const j = p.job && places.get(p.job); p.cop = !!(j && j.patrol); }   // police staff wear the uniform
}

/* ---------- routines ---------- */
// Where should this person be at this hour? Asleep at home, at work, or (in free time) out somewhere or home.
function asleep(p, h){
  if (p.job && p.nightWorker) return hrange(8.5, 15.5)(h);
  return !hrange(p.wake, p.bed)(h);
}
function working(p, h){ return !!p.job && hrange(p.ws, (p.ws + (p.wlen || p.workLen)) % 24)(h); }
function desire(p, h){
  const job = p.job && places.get(p.job);
  p.nightWorker = !!(job && job.night && p.nightShift < job.night);
  p.ws = p.nightWorker ? 21 + p.nightShift*4 : p.workS; p.wlen = p.workLen;
  if (job && job.stalls){ p.ws = p.nightShift < .5 ? 16.5 : 10; p.wlen = 7.5; }   // day market 10:00 to 17:30, night market 16:30 to midnight
  if (job && job.patrol){ const k = Math.min(2, Math.floor(p.nightShift*3)); p.ws = [7, 15, 23][k]; p.wlen = 8; p.nightWorker = k === 2; }   // police: three shifts round the clock
  if (p.chain && !asleep(p, h) && !working(p, h)) return p.at;   // finish what they started (ordered food: now eat it)
  if (asleep(p, h) && !working(p, h)) return p.home;              // (a night-market shift runs past some keepers' usual bedtime)
  if (working(p, h)){
    if (job && (job.stalls || job.patrol)) return p.job;   // stall keepers stay at their counter, officers on their beat
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
  for (const pl of places.values()){ if (pl.fun <= 0 || pl.id === p.home || !reachable(pl)) continue;
    const v = pl.fun/(1 + (Math.hypot(pl.x - home.x, pl.z - home.z)/14)**2); tot += v; list.push([pl.id, v]); }
  let r = pplRand()*tot; for (const [id, v] of list) if ((r -= v) <= 0) return id;
  return list.length ? list[list.length - 1][0] : null;
}
// couriers spend their shift walking parcels between shops
function errand(p){
  const ids = [...places.values()].filter(pl => pl.fun > 1 && pl.id !== p.at && reachable(pl)).map(pl => pl.id);
  return ids.length ? ids[Math.floor(pplRand()*ids.length)] : p.job;
}
// how long they stay once they arrive (real seconds: the city's clock stands still, so this is pacing, not hours)
function stayFor(p, pl){
  if (p.walkedFor === 'errand') return 3 + pplRand()*6;
  if (p.spot && p.spot.kind === 'queue') return 6 + pplRand()*7;     // ordering
  if (p.spot && p.spot.kind === 'seat') return 25 + pplRand()*45;
  if (p.spot && pl.stalls && p.spot.kind === 'stand') return 30 + pplRand()*60;   // hanging out in the square
  if (pl.id === p.home) return 25 + pplRand()*60;
  if (pl.id === p.job) return p.cop ? 5 + pplRand()*12 : 50 + pplRand()*100;   // officers don't linger at the desk
  return 15 + pplRand()*45;
}
const pplRand = Math.random;   // moment-to-moment choices; who people are is seeded above
// stalls with their keeper standing at the counter right now
const stallOpen = st => st.keepers.some(sp => { const q = sp.by && people.get(sp.by); return q && !q.walk && q.spot === sp; });
const freeOf = list => list.filter(sp => !sp.by);
const nearPick = (list, x, z, n = 6) => { if (!list.length) return null; list.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); return list[Math.floor(pplRand()*Math.min(n, list.length))]; };
// where in an open place this person goes: their own counter if they keep a stall, a queue at an open stall, a
// seat or a spot to stand (often next to someone, to chat)
function pickSpot(to, from, p){
  if (to.bench){
    // on a lawn, often join someone already sitting there (the other end of their blanket, beside them, at their show)
    const free = freeOf(to.spots), social = free.filter(sp => sp.act && sp.near.some(o => o.by));
    if (social.length && pplRand() < .6) return nearPick(social, from.x, from.z, 4);
    return nearPick(free, from.x, from.z, 3);
  }
  if (p && to.stalls){
    if (p.job === to.id && p.stall !== null && working(p, S.hour)){ const st = to.stalls.get(p.stall); const k = st && freeOf(st.keepers)[0]; if (k) return k; }
    if (p.chain === 'eat'){
      const seat = pplRand() < .6 ? nearPick(freeOf(to.spots.filter(sp => sp.kind === 'seat')), p.x, p.z, 4) : null;
      return seat || nearPick(freeOf(to.spots.filter(sp => sp.kind === 'stand')), p.x, p.z, 4);
    }
    if (pplRand() < .6){
      const qs = []; for (const st of to.stalls.values()) if (stallOpen(st)) qs.push(...freeOf(st.queue));
      const q = nearPick(qs, from.x, from.z, 5); if (q) return q;
    }
    const stands = freeOf(to.spots.filter(sp => sp.kind === 'stand'));
    if (pplRand() < .5){ const social = stands.filter(sp => sp.near.some(o => o.by)); if (social.length) return nearPick(social, from.x, from.z, 8); }
    if (pplRand() < .3){ const seat = nearPick(freeOf(to.spots.filter(sp => sp.kind === 'seat')), from.x, from.z, 8); if (seat) return seat; }
    return nearPick(stands, from.x, from.z, 8);
  }
  return nearPick(freeOf(to.spots.filter(sp => sp.kind !== 'vendor' && sp.kind !== 'queue')), from.x, from.z, 6);
}

/* ---------- walking ---------- */
const nearestOf = (doors, x, z) => { let best = null, bd = Infinity; for (const d of doors){ const v = (d.stand.x - x)**2 + (d.stand.z - z)**2; if (v < bd){ bd = v; best = d; } } return best; };
// a trip: from just inside one door, out through it, along the network, in through another (or to a standing spot)
// Everyone has a line of their own across the walking paths, instead of all treading the centre: a narrow lane
// (mostly to the right of the way they're going, so people coming the other way pass on the other side) and, on
// open paving with room to spare, a wide one. For each bend of the route the widest of these that's clear, and
// clear all the way from the last bend, is taken; the bends are mitred, so the line stays parallel round corners.
// The ends of the network stretch stay on the centre, where the route meets doorways, seats and counters.
const freePt = (x, z) => { const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))); return !!c && freeAt(cellGrid(c), x, z); };
function clearSeg(ax, az, bx, bz){ const n = Math.ceil(Math.hypot(bx - ax, bz - az)/.08) + 1; for (let k = 0; k <= n; k++){ const u = k/n; if (!freePt(ax + (bx - ax)*u, az + (bz - az)*u)) return false; } return true; }
function spreadPath(p, pts, i0, i1){
  if (i1 - i0 < 1) return pts;
  const lane = p.lane ?? .12, wide = p.wide ?? lane*3, tries = [wide, wide*.65, lane, lane*.5, 0];
  const out = pts.map(q => q.slice());
  let prev = out[i0];
  for (let k = i0 + 1; k < i1; k++){
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], [cx, cz] = pts[k + 1];
    let n1x = -(bz - az), n1z = bx - ax, l1 = Math.hypot(n1x, n1z) || 1, n2x = -(cz - bz), n2z = cx - bx, l2 = Math.hypot(n2x, n2z) || 1;
    n1x /= l1; n1z /= l1; n2x /= l2; n2z /= l2;
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz);
    if (ml < .3){ out[k] = [bx, bz]; prev = out[k]; continue; }   // a hairpin: stay on the line
    mx /= ml; mz /= ml; const sc = 1/Math.max(.55, mx*n1x + mz*n1z);
    for (const o of tries){ const x = bx + mx*o*sc, z = bz + mz*o*sc;
      if (o === 0 || (freePt(x, z) && clearSeg(prev[0], prev[1], x, z))){ out[k] = [x, z]; break; } }
    prev = out[k];
  }
  if (!clearSeg(prev[0], prev[1], out[i1][0], out[i1][1])) return pts;   // can't rejoin cleanly: keep the centre line
  return out;
}
function startTrip(p, toId){
  const from = places.get(p.at), to = places.get(toId);
  if (!from || !to || !reachable(to)) return false;
  let a, head = [], dA = null;
  if (p.spot){ a = p.spot.node; head = [[p.spot.x, p.spot.z], [p.spot.ax, p.spot.az]]; }   // up off the seat, out from the counter
  else if (p.patrol) a = p.patrol.node;                                                     // an officer out on the beat
  else { if (!from.doors.length) return false; dA = nearestOf(from.doors, to.x, to.z); a = dA.node; head = [[dA.inside.x, dA.inside.z], [dA.wall.x, dA.wall.z]]; }
  let b, tail = [], dB = null, spot = null;
  if (to.open){ spot = pickSpot(to, from, p); if (!spot || spot === p.spot) return false; b = spot.node; tail = [[spot.ax, spot.az], [spot.x, spot.z]]; }
  else { if (!to.doors.length) return false; dB = nearestOf(to.doors, from.x, from.z); b = dB.node; tail = [[dB.wall.x, dB.wall.z], [dB.inside.x, dB.inside.z]]; }
  const mid = route(a, b); if (!mid) return false;
  const base = head.concat(mid, tail), pts = p.cop ? base : spreadPath(p, base, head.length, base.length - 1 - tail.length);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  if (p.spot){ p.spot.by = null; p.spot = null; }
  p.patrol = null;
  if (spot) spot.by = p.id;
  // safe0..safe1: the stretch on the walking network (before and after it: doorways, seats, counters)
  p.walk = { pts, base, cum, len: cum[cum.length - 1], s: 0, to: toId, doorA: dA, doorB: dB, spot, safe0: cum[head.length], safe1: cum[pts.length - 1 - tail.length] };
  return true;
}
// Police officers on duty walk a beat: from the station (or where they stand) to a street crossing a few blocks
// away, where they stop and scan for a while, then on to the next. Now and then they head back to the station.
function startPatrol(p, forced){
  const st = places.get(p.job); if (!st || !patrolNodes.length) return false;
  let a, head = [], dA = null;
  if (p.walk && forced){   // called away mid-walk: keep to the current path as far as its next street crossing, then turn
    const w = p.walk; let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.s) k++;
    const bp = w.base || w.pts;   // the route's own points (the walked line may be set off to one side)
    let j = k; while (j < bp.length && !crossAt.has(posKey(bp[j][0], bp[j][1]))) j++;
    if (j >= bp.length) return false;
    a = crossAt.get(posKey(bp[j][0], bp[j][1])).node; head = [[p.x, p.z]].concat(w.pts.slice(k, j)); dA = null;
  }
  else if (p.patrol) a = p.patrol.node;
  else { if (p.at !== p.job || !st.doors.length) return false; dA = st.doors[Math.floor(pplRand()*st.doors.length)]; a = dA.node; head = [[dA.inside.x, dA.inside.z], [dA.wall.x, dA.wall.z]]; }
  const cand = patrolNodes.filter(c => c.node !== a && Math.hypot(c.x - st.x, c.z - st.z) < 26);
  if (!cand.length) return false;
  const tg = forced || cand[Math.floor(pplRand()*cand.length)], mid = route(a, tg.node); if (!mid) return false;
  const pts = head.concat(mid), cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  p.walk = { pts, cum, len: cum[cum.length - 1], s: 0, to: p.job, doorA: dA, doorB: null, spot: null, beat: tg, safe0: cum[head.length], safe1: cum[cum.length - 1] };
  p.patrol = null;
  return true;
}
// decide what to do next once the current stay is over
function decide(p){
  if (p.cop && working(p, S.hour) && desire(p, S.hour) === p.job && (p.patrol || p.at === p.job)){
    const back = p.patrol && pplRand() < .15;   // back to the station for a bit
    if (!back && (p.patrol || pplRand() < .85) && startPatrol(p)) return;
    if (back && startTrip(p, p.job)) return;
    p.until = pplNow + 10 + pplRand()*20; return;
  }
  const want = desire(p, S.hour) || p.home;
  p.walkedFor = (want !== p.job && want !== p.home && working(p, S.hour)) ? 'errand' : null;
  const chained = p.chain && want === p.at;   // move within the place: from the queue to a seat to eat
  if (chained && p.spot && p.spot.kind === 'queue') p.fed = true;   // walking off with their food
  const ok = !(want === p.at && !chained) && places.has(want) && startTrip(p, want);
  p.chain = null;
  if (!ok) p.until = pplNow + 15 + pplRand()*40;
}
function arrive(p){
  const w = p.walk; p.walk = null; p.hurry = false;
  if (p.rush){ p.rush = false; if (w.beat){ p.at = w.to; p.patrol = w.beat; p.until = pplNow + 9 + pplRand()*5; return; } }   // at the scene: looking around
  if (p.callout && w.beat){ const c = p.callout; p.callout = null; p.at = w.to; p.patrol = w.beat; if (startPatrol(p, c)){ p.rush = true; return; } }
  if (w.beat){ p.at = w.to; p.patrol = w.beat; p.until = pplNow + 4 + pplRand()*7; return; }
  if (w.spot && w.spot.kind === 'seat' && p.fed){ p.fed = false; emote(p, 'bowl', 2.8); }
  p.at = w.to; p.spot = w.spot;
  if (p.spot && p.spot.kind === 'queue') p.chain = 'eat';
  const pl = places.get(p.at);
  p.until = pplNow + (pl ? stayFor(p, pl) : 20);
}
const sendHome = p => { if (p.spot && p.spot.by === p.id) p.spot.by = null; p.chain = null; p.patrol = null; p.rush = false; p.hurry = false; p.walk = null; p.spot = null; p.at = p.home; p.until = pplNow + 5 + Math.random()*20; };

/* ---------- keeping up with the city ---------- */
let pplReady = false, pplNow = 0, pplHour = S.hour, pplCursor = 0, pplList = [];
// called after every edit (from syncAgents): rebuild the network, places and doors, then the residents and their jobs
function syncPeople(){
  buildNetwork();
  syncResidents();
  syncJobs();
  // carry everyone's spot and doors over to the rebuilt ones; anyone whose way is gone goes home
  for (const p of people.values()){
    if (p.fresh) continue;
    if (p.walk){
      const w = p.walk;
      const gone = !places.has(w.to) || w.pts.some(([x, z]) => !cells.has(ckey(Math.round(x/LOT), Math.round(z/LOT))));
      if (gone){ sendHome(p); continue; }
      if (w.doorA) w.doorA = doorByKey.get(w.doorA.key) || null;
      if (w.doorB) w.doorB = doorByKey.get(w.doorB.key) || null;
      if (w.spot){ const sp = spotByKey.get(w.spot.key); if (sp && (!sp.by || sp.by === p.id)){ sp.by = p.id; w.spot = sp; } else { sendHome(p); continue; } }
      if (w.beat){ const n = NG.key.get(w.beat.key); if (n === undefined){ sendHome(p); continue; } w.beat.node = n; }
    } else if (!places.has(p.at)) sendHome(p);
    else if (p.patrol){ const n = NG.key.get(p.patrol.key); if (n === undefined) sendHome(p); else p.patrol.node = n; }
    else if (p.spot){ const sp = spotByKey.get(p.spot.key); if (sp && (!sp.by || sp.by === p.id)){ sp.by = p.id; p.spot = sp; } else sendHome(p); }
  }
  // newcomers: a fresh household is at home and comes out soon; on load, people are already wherever the hour says
  for (const p of people.values()){
    if (!p.fresh) continue;
    p.fresh = false;
    if (pplReady){ p.until = pplNow + 2 + Math.random()*20; continue; }
    const want = desire(p, S.hour), pl = places.get(want);
    p.at = reachable(pl) ? want : p.home;
    if (pl && pl.open && p.at === want){ const sp = pickSpot(pl, pl, p); if (sp){ sp.by = p.id; p.spot = sp; } else p.at = p.home; }
    p.until = pplNow + Math.random()*40;
  }
  pplList = [...people.values()];
  pplReady = true;
  syncBots();
  syncLurkers();
}

/* ---------- delivery robots ---------- */
// Little hover bots carry parcels from shops to homes along the same sidewalk network. Each one belongs to a shop:
// it glides out of the shop's door, crosses town to a home, lowers a parcel capsule onto the step, the door
// opens to take it in, and the bot heads back (or straight on to another drop). About one bot for every two shops.
const bots = [];
const BOT_SPEED = .75;
function walkOf(pts, extra){ const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return Object.assign({ pts, cum, len: cum[cum.length - 1], s: 0 }, extra); }
function syncBots(){
  const hubs = [...places.values()].filter(pl => pl.cell && pl.fun >= 2.5 && pl.doors.length);
  const homes = new Set(); for (const p of people.values()) homes.add(p.home);
  botHomes = [...homes].map(id => places.get(id)).filter(pl => pl && pl.doors.length);
  const want = hubs.length ? Math.min(30, Math.ceil(hubs.length/2)) : 0;
  while (bots.length > want) bots.pop();
  while (bots.length < want) bots.push({ id: bots.length, state: 'in', until: pplNow + Math.random()*12, walk: null, x: 0, z: 0, flip: 1, phase: Math.random()*10, gait: Math.random() < .5 ? 0 : 4 });
  hubs.sort((a, b) => a.id < b.id ? -1 : 1);
  for (const b of bots){
    if (!b.hub || !places.has(b.hub)) b.hub = hubs[hash('bot', b.id) % hubs.length].id;
    if (b.walk){
      const w = b.walk, gone = w.pts.some(([x, z]) => !cells.has(ckey(Math.round(x/LOT), Math.round(z/LOT))));
      if (w.doorA) w.doorA = doorByKey.get(w.doorA.key) || null;
      if (w.doorB) w.doorB = doorByKey.get(w.doorB.key) || null;
      if (gone){ b.walk = null; b.state = 'in'; b.until = pplNow + 5; }
    }
    if (b.door) b.door = doorByKey.get(b.door.key) || null;
    if (b.state === 'drop' && !b.door){ b.state = 'in'; b.until = pplNow + 5; }
  }
}
let botHomes = [];
function botNext(b){
  const hub = places.get(b.hub); if (!hub || !hub.doors.length || !botHomes.length){ b.until = pplNow + 10; return; }
  const from = b.state === 'drop' ? null : hub.doors[0];
  const ox = from ? hub.x : b.x, oz = from ? hub.z : b.z;
  const near = botHomes.filter(pl => pl !== hub && Math.hypot(pl.x - ox, pl.z - oz) < 30);
  const back = b.state === 'drop' && (pplRand() < .45 || !near.length);
  if (back){   // home to the shop, in through its door
    const d = hub.doors[0], mid = route(b.door.node, d.node);
    if (mid){ b.walk = walkOf(mid.concat([[d.wall.x, d.wall.z], [d.inside.x, d.inside.z]]), { doorA: null, doorB: d, home: true }); b.state = 'go'; b.door = null; return; }
  }
  if (!near.length){ b.until = pplNow + 15; return; }
  const to = near[Math.floor(pplRand()*near.length)], dB = nearestOf(to.doors, ox, oz);
  const a = from ? from.node : b.door.node, mid = route(a, dB.node);
  if (!mid){ b.until = pplNow + 8; return; }
  const head = from ? [[from.inside.x, from.inside.z], [from.wall.x, from.wall.z]] : [];
  b.walk = walkOf(head.concat(mid), { doorA: from, doorB: null, target: dB }); b.state = 'go'; b.door = null;
}
function updateBots(dt, t){
  // fewer deliveries in the small hours
  const slow = S.hour < 6 || S.hour >= 23 ? 3 : 1;
  for (const b of bots){
    if (b.state === 'in'){ if (t >= b.until) botNext(b); continue; }
    if (b.state === 'drop'){ if (t - b.t0 > 3.6){ b.cap = null; botNext(b); } continue; }
    const w = b.walk; if (!w) { b.state = 'in'; continue; }
    if (!(b.pause > t)) w.s += dt*BOT_SPEED;
    if (w.s >= w.len){
      b.walk = null;
      if (w.home){ b.state = 'in'; b.until = t + (6 + pplRand()*14)*slow; continue; }
      // at the door: lower the parcel just in front of it
      const d = w.target; b.state = 'drop'; b.t0 = t; b.door = d;
      b.x = d.stand.x; b.z = d.stand.z;
      b.cap = { x: d.wall.x + d.n[0]*.14, z: d.wall.z + d.n[1]*.14 };
      continue;
    }
    let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.s) k++;
    const a = w.pts[k - 1], c = w.pts[k], seg = w.cum[k] - w.cum[k - 1] || 1, u = (w.s - w.cum[k - 1])/seg;
    b.x = a[0] + (c[0] - a[0])*u; b.z = a[1] + (c[1] - a[1])*u; b.dx = c[0] - a[0]; b.dz = c[1] - a[1];
    const sd = b.dx*_camR.x + b.dz*_camR.z; if (Math.abs(sd) > 1e-3) b.flip = sd < 0 ? -1 : 1;
  }
}

/* ---------- dark streets and muggings ---------- */
// On the few dark streets (see isDarkPlot), a shady figure lurks on a street corner at night (20:00 to 5:00).
// When someone walks past alone, with no police officer in sight, the lurker darts over and robs them: the victim
// freezes ('!', then a sweat drop), the mugger makes off at a run, and the victim hurries on. The nearest officer
// on duty rushes to the spot and looks around. Every mugging goes into the city's event log (for the radio host).
const lurkers = new Map();   // plot key -> lurker
const cityLog = [];          // { hour, kind, x, z, ... } newest last; kept short
function logEvent(e){ cityLog.push(Object.assign({ hour: S.hour, at: pplNow }, e)); if (cityLog.length > 60) cityLog.shift(); }
const isNight = h => h >= 20 || h < 5;
function syncLurkers(){
  const keep = new Set();
  for (const c of cells.values()){
    // the dark streets always have one; now and then an ordinary, well-lit street gets one too (rarely out, and
    // quick to give up)
    const rare = !c.dark && !!c.sections.length && !c.mega && hash('lurk2', c.i, c.j) % 12 === 0;
    if (!c.dark && !rare) continue;
    const k = ckey(c.i, c.j); keep.add(k);
    const G = cellGrid(c);
    // a corner of the plot's street that's clear (and stays the same every time)
    const h = hash('lurk', c.i, c.j); let spot = null;
    for (let q = 0; q < 4 && !spot; q++){ const [sx, sz] = CORNERS[(h + q) % 4]; spot = approachFor(G, c.x + sx*1.55, c.z + sz*1.55, -sx, -sz); }
    const old = lurkers.get(k);
    if (!spot){ lurkers.delete(k); continue; }
    if (old){ old.home = spot; old.rare = rare; continue; }
    lurkers.set(k, { key: k, cell: c, home: spot, x: spot.x, z: spot.z, state: 'away', rare,
                     until: pplNow + (rare ? 200 + Math.random()*700 : 10 + Math.random()*40), row: 9 + h % 3, flip: 1, phase: Math.random()*10, fade: 0 });
  }
  for (const k of [...lurkers.keys()]) if (!keep.has(k)) lurkers.delete(k);
}
function onDutyCops(){ return pplList.filter(q => q.cop && working(q, S.hour) && (q.patrol || (q.walk && q.walk.beat) || (!q.walk && q.at === q.job))); }
function updateLurkers(dt, t){
  const night = isNight(S.hour);
  for (const L of lurkers.values()){
    switch (L.state){
      case 'away':      // not out (daytime, or lying low after a job)
        L.fade = Math.max(0, L.fade - dt*2);
        if (night && t >= L.until){ L.state = 'lurk'; L.x = L.home.x; L.z = L.home.z; L.until = t + 4; L.out = t; }
        break;
      case 'lurk': {    // loitering on the corner, waiting for someone alone
        L.fade = Math.min(1, L.fade + dt*1.5);
        if (!night){ L.state = 'away'; L.until = t + 5; break; }
        if (L.rare && t - L.out > 60){ L.state = 'away'; L.until = t + 300 + pplRand()*600; break; }   // a lit street: gives up soon
        if (t < L.until) break;
        L.until = t + .5;
        let victim = null;
        for (const p of pplList){
          const w = p.walk; if (!w || p.cop || p.pause > t || w.s < w.safe0 + .3 || w.s > w.safe1 - .3) continue;
          if ((p.x - L.x)**2 + (p.z - L.z)**2 > 1.4*1.4) continue;
          if (pplList.some(o => o !== p && o.walk && (o.x - p.x)**2 + (o.z - p.z)**2 < 4)) continue;          // not alone
          if (pplList.some(o => o.cop && (o.x - p.x)**2 + (o.z - p.z)**2 < 64)) continue;                      // police nearby
          victim = p; break;
        }
        if (victim && pplRand() < (L.rare ? .3 : .5)){ L.state = 'strike'; L.victim = victim; victim.pause = t + 4; emote(victim, 'bang', 1.6); L.t0 = t; }
        else if (victim) L.until = t + 20;   // thought better of it
        break;
      }
      case 'strike': {  // darting over
        const v = L.victim, dx = v.x - L.x, dz = v.z - L.z, d = Math.hypot(dx, dz);
        L.dx = dx; L.dz = dz;
        if (d < .32 || t - L.t0 > 2){ L.state = 'rob'; L.t0 = t; break; }
        const step = Math.min(d - .3, dt*2.2); L.x += dx/d*step; L.z += dz/d*step;
        break;
      }
      case 'rob': {     // the hold-up
        const v = L.victim; L.dx = v.x - L.x; L.dz = v.z - L.z;
        if (t - L.t0 > .8 && !(v.emoUntil > t)) emote(v, 'sweat', 2.5);
        if (t - L.t0 > 1.5){
          logEvent({ kind: 'mugging', x: L.x, z: L.z, plot: L.key, victim: v.id });
          if (typeof policeDroneAlert === 'function' && policeDroneAlert) policeDroneAlert(L);   // sometimes a police drone comes over
          v.pause = 0; v.hurry = true;
          // the nearest officer on duty comes running
          let best = null, bd = 35*35;
          for (const q of onDutyCops()){ const d2 = (q.x - L.x)**2 + (q.z - L.z)**2; if (d2 < bd){ bd = d2; best = q; } }
          if (best && patrolNodes.length){
            const node = patrolNodes.reduce((b, c) => (c.x - L.x)**2 + (c.z - L.z)**2 < (b.x - L.x)**2 + (b.z - L.z)**2 ? c : b);
            if (startPatrol(best, node) || (best.callout = node, false)){ best.rush = true; emote(best, 'bang', 2); logEvent({ kind: 'police', x: node.x, z: node.z, plot: L.key, officer: best.id }); }
          }
          // and off at a run, to a crossing well away from here
          const far = patrolNodes.filter(c => { const d2 = (c.x - L.x)**2 + (c.z - L.z)**2; return d2 > 49 && d2 < 225; });
          const near = patrolNodes.length ? patrolNodes.reduce((b, c) => (c.x - L.x)**2 + (c.z - L.z)**2 < (b.x - L.x)**2 + (b.z - L.z)**2 ? c : b) : null;
          const to = far.length ? far[Math.floor(pplRand()*far.length)] : null, mid = near && to ? route(near.node, to.node) : null;
          L.walk = mid ? walkOf([[L.x, L.z]].concat(mid), {}) : null;
          L.victim = null; L.state = L.walk ? 'flee' : L.tagged ? 'hide' : 'away'; L.until = t + (L.rare ? 400 + pplRand()*500 : 90 + pplRand()*120);
        }
        break;
      }
      case 'flee': {
        const w = L.walk; w.s += dt*2.0;
        if (w.s >= w.len){ L.walk = null;
          // tagged by a drone: no melting away now, they crouch in a doorway and wait for it to blow over
          if (L.tagged){ L.state = 'hide'; L.fade = 1; L.hideUntil = t + 60; } else L.state = 'away';
          break; }
        let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.s) k++;
        const a = w.pts[k - 1], c = w.pts[k], seg = w.cum[k] - w.cum[k - 1] || 1, u = (w.s - w.cum[k - 1])/seg;
        L.x = a[0] + (c[0] - a[0])*u; L.z = a[1] + (c[1] - a[1])*u; L.dx = c[0] - a[0]; L.dz = c[1] - a[1];
        L.fade = L.tagged ? 1 : Math.min(1, (w.len - w.s)/.8);   // melts into the dark at the end
        break;
      }
      case 'hide':      // tagged and lying low; if the bikes don't find them in time, they slip away
        if (t > L.hideUntil){ L.tagged = false; L.state = 'away'; }
        break;
      case 'caught':    // riding to the station on the back of a police bike (moved and drawn with the bike)
        if (L.bike){ L.x = L.bike.x; L.z = L.bike.z; }
        break;
    }
  }
}

/* ---------- bumping into each other, and emotes ---------- */
function emote(p, kind, dur = 2.2){ p.emo = EMO[kind]; p.emoUntil = pplNow + dur; }
// Walkers (and bots) coming at each other on a narrow path sometimes bump: both stop for a moment and react, with
// a bubble over their heads (or, for a police officer, a proper scowl). A short cooldown stops the same pair
// bumping again as they pass.
const _bumpGrid = new Map();
function checkBumps(t){
  _bumpGrid.clear();
  const movers = [];
  for (const p of pplList){ const w = p.walk; if (!w || w.s < w.safe0 || w.s > w.safe1 || p.pause > t) continue; movers.push(p); }
  for (const b of bots) if (b.walk && b.state === 'go' && !(b.pause > t) && b.walk.s > .6 && b.walk.len - b.walk.s > .6) movers.push(b);
  for (const m of movers){ const k = Math.floor(m.x*2) + ',' + Math.floor(m.z*2); let l = _bumpGrid.get(k); if (!l) _bumpGrid.set(k, l = []); l.push(m); }
  for (const m of movers){
    if (m.bumpCD > t) continue;
    const gx = Math.floor(m.x*2), gz = Math.floor(m.z*2);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      const l = _bumpGrid.get((gx + dx) + ',' + (gz + dz)); if (!l) continue;
      for (const o of l){
        if (o === m || o.bumpCD > t || m.bumpCD > t) continue;
        if ((m.x - o.x)**2 + (m.z - o.z)**2 > .27*.27) continue;
        // only head-on or crossing paths, not someone walking the same way just behind
        if (((m.dx || 0)*(o.dx || 0) + (m.dz || 0)*(o.dz || 0)) > 0) continue;
        if (pplRand() > .55){ m.bumpCD = o.bumpCD = t + 3; continue; }   // most of the time they just squeeze past
        m.pause = o.pause = t + .9; m.bumpCD = o.bumpCD = t + 6;
        for (const [a, other] of [[m, o], [o, m]]){
          if (a.gait !== undefined){ a.emo = EMO.quest; a.emoUntil = t + 1.6; continue; }   // a bot: puzzled beep
          if (other.gait !== undefined){ emote(a, 'bang', 1.6); continue; }
          if (a.cop){ emote(a, 'anger', 1.8); a.angry = t + .9; continue; }
          const r = pplRand(); emote(a, r < .35 ? 'sweat' : r < .6 ? 'bang' : r < .8 ? 'anger' : 'quest', 1.8);
        }
      }
    }
  }
}

/* ---------- lawn hologram shows ---------- */
// A small hologram plays over a lawn projector while someone sits watching it: a pool of little quads in the
// hologram material, each given its ad through its uvs (see holoQuad in buildings.js), turned toward the viewer.
const holoOn = [], holoPool = [];
// Picnic blankets: brought along by the first person to sit down at a picnic spot, spread out (unfolding from the
// middle), and folded up and taken away when the last of them leaves. Each has a couple of bowls on it.
const picOn = new Set(), picnics = new Map(), picPool = [];
const PIC_MATS = [0xb8433a, 0x3f6a9a, 0xd8b04a].map(c => new THREE.MeshToonMaterial({ color: c, gradientMap: gradTex })), BOWL_MAT = new THREE.MeshToonMaterial({ color: 0xe6e6e2, gradientMap: gradTex });
function lawnPicnics(dt){
  for (const k of picOn) if (!picnics.has(k)){
    let g = picPool.pop();
    if (!g){ g = new THREE.Group(); const sheet = new THREE.Mesh(new THREE.BoxGeometry(.62, .015, .44), PIC_MATS[0]); g.add(sheet);
      for (const [x, z] of [[-.1, .05], [.12, -.06]]){ const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .035, .035, 8), BOWL_MAT); b.position.set(x, .025, z); g.add(b); }
      g.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = true; } }); scene.add(g); }
    const [xz, ry, col] = k.split('|'), [x, z] = xz.split(',').map(Number);
    g.children[0].material = PIC_MATS[+col]; g.position.set(x, CURB - .002, z); g.rotation.y = -(+ry); g.visible = true; g.scale.set(.05, 1, .05);
    picnics.set(k, { g, u: 0 });
  }
  for (const [k, p] of picnics){
    const want = picOn.has(k) ? 1 : 0; p.u = want ? Math.min(1, p.u + dt*1.6) : Math.max(0, p.u - dt*1.6);
    const e = p.u*p.u*(3 - 2*p.u); p.g.scale.set(.05 + .95*e, 1, .05 + .95*Math.min(1, e*1.3));   // unfolds lengthwise, then across
    for (let i = 1; i < p.g.children.length; i++) p.g.children[i].visible = p.u > .9;   // the bowls come out once it's down
    if (!want && p.u <= 0){ p.g.visible = false; picPool.push(p.g); picnics.delete(k); }
  }
  picOn.clear();
}
function lawnHolos(){
  const used = new Set();
  let n = 0;
  for (const sp of holoOn){
    const k = sp.hx.toFixed(2) + ',' + sp.hz.toFixed(2); if (used.has(k)) continue; used.add(k);
    let m = holoPool[n];
    if (!m){ m = new THREE.Mesh(new THREE.PlaneGeometry(.46, .34), HOLO_MAT); m.layers.set(1); m.renderOrder = 3; m.frustumCulled = false; scene.add(m); holoPool.push(m);
      m.userData.u0 = Array.from(m.geometry.attributes.uv.array); }
    if (m.userData.ad !== sp.ad){ const uv = m.geometry.attributes.uv, u0 = m.userData.u0, id = sp.ad + 9*(n + 3);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, id + Math.min(u0[i*2], .999), Math.min(u0[i*2 + 1], .999));   // the picture (kind 0), this ad
      uv.needsUpdate = true; m.userData.ad = sp.ad; }
    m.position.set(sp.hx, CURB + .36, sp.hz); m.rotation.set(0, Math.atan2(sp.x - sp.hx, sp.z - sp.hz), 0); m.visible = true; n++;
  }
  for (let i = n; i < holoPool.length; i++) holoPool[i].visible = false;
}
/* ---------- every frame ---------- */
const _pv = new THREE.Vector3(), _camR = new THREE.Vector3();
function updatePeople(dt, t){
  pplNow = t;
  if (!pplReady) return;
  // the hour was changed in Settings: everyone reconsiders over the next few seconds
  // (with the day and night cycle running, the clock creeps on and people keep to their own pace instead)
  { const d = Math.abs(S.hour - pplHour), dh = Math.min(d, 24 - d);
    if (S.cycle && dh < .5) pplHour = S.hour;
    else if (dh > .2){ pplHour = S.hour; for (const p of pplList) if (!p.walk) p.until = Math.min(p.until, pplNow + Math.random()*8); } }
  // decisions are spread over frames: a slice of the population each time
  const n = pplList.length, slice = Math.min(n, 60);
  for (let k = 0; k < slice; k++){
    const p = pplList[(pplCursor + k) % n];
    if (!p.walk && pplNow >= p.until) decide(p);
  }
  pplCursor = n ? (pplCursor + slice) % n : 0;
  _camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
  updateBots(dt, t);
  updateLurkers(dt, t);
  checkBumps(t);
  // fill the draw batch with everyone on show
  const pos = pplMesh.geometry.attributes.aPos, spr = pplMesh.geometry.attributes.aSpr, P = pos.array, Q = spr.array;
  const VP = comp.uniforms.VP.value;
  let i = 0;
  const emit = (x, y, z, row, frame, flip, alpha) => {
    if (i >= PPL_MAX) return false;
    _pv.set(x, y, z).applyMatrix4(VP);
    if (_pv.x < -1.1 || _pv.x > 1.1 || _pv.y < -1.15 || _pv.y > 1.1) return false;
    P[i*3] = x; P[i*3 + 1] = y; P[i*3 + 2] = z;
    Q[i*4] = row; Q[i*4 + 1] = frame; Q[i*4 + 2] = flip; Q[i*4 + 3] = alpha;
    i++; return true;
  };
  // which stalls are being served, and who's queueing where
  const served = new Set(), queued = new Set(); holoOn.length = 0;
  for (const p of pplList) if (!p.walk && p.spot){ if (p.spot.kind === 'vendor') served.add(p.spot.stall); else if (p.spot.kind === 'queue') queued.add(p.spot.stall); }
  for (const p of pplList){
    let alpha = 1, walking = false, y = CURB, frame = 0;
    const paused = p.pause > t;
    if (p.walk){
      const w = p.walk; if (!paused) w.s += dt*p.speed*(p.rush ? 2.3 : p.hurry ? 1.6 : 1);
      if (w.s >= w.len){ arrive(p); if (!p.spot && !p.patrol) continue; }
      else {
        walking = true;
        let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.s) k++;
        const a = w.pts[k - 1], b = w.pts[k], seg = w.cum[k] - w.cum[k - 1] || 1, u = (w.s - w.cum[k - 1])/seg;
        p.x = a[0] + (b[0] - a[0])*u; p.z = a[1] + (b[1] - a[1])*u; p.dx = b[0] - a[0]; p.dz = b[1] - a[1];
        // a gentle sway across their own line as they walk (the line itself is set per trip: see spreadPath)
        if (w.s > w.safe0 && w.s < w.safe1){ const L = Math.hypot(p.dx, p.dz) || 1, e = Math.min(1, (w.s - w.safe0)/.5, (w.safe1 - w.s)/.5), o = .045*e*Math.sin(w.s*1.3 + p.phase);
          p.x += -p.dz/L*o; p.z += p.dx/L*o; }
        const sd = p.dx*_camR.x + p.dz*_camR.z;
        if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1;
        // through the doorway: dissolving in from the hallway, or out as they step inside
        if (w.doorA) alpha = Math.min(alpha, (w.s - .05)/.3);
        if (w.doorB) alpha = Math.min(alpha, (w.len - w.s - .05)/.3);
      }
    }
    if (!walking){
      if (p.patrol){
        // on the beat: standing at a crossing, now and then scanning with the handheld
        p.x = p.patrol.x; p.z = p.patrol.z;
        frame = Math.floor(t*.3 + p.phase) % 2 ? F_USE + Math.floor(t*6 + p.phase) % 6 : F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle;
      } else {
        const sp = p.spot; if (!sp) continue;
        p.x = sp.x; p.z = sp.z; y = sp.y;
        let face = sp.face, gest = false;
        if (sp.kind === 'seat'){ y = sp.y - .09; frame = F_SIT + Math.floor(t*1.2 + p.phase) % 4;
          if (sp.act === 'holo'){ face = [sp.hx - sp.x, sp.hz - sp.z]; holoOn.push(sp);   // watching the show
            if (!(p.emoUntil > t) && pplRand() < dt*.03) emote(p, pplRand() < .5 ? 'bang' : 'note', 2); }
          else if (sp.act){ if (sp.pic) picOn.add(sp.pic.x.toFixed(2) + ',' + sp.pic.z.toFixed(2) + '|' + sp.pic.ry.toFixed(3) + '|' + sp.pic.col);
            const mate = sp.near.find(o => o.by && people.get(o.by) && !people.get(o.by).walk);
            if (mate) face = [mate.x - sp.x, mate.z - sp.z];
            if (!(p.emoUntil > t)){
              if (sp.act === 'eat' && pplRand() < dt*.09) emote(p, 'bowl', 2.4);                                 // a picnic
              else if (mate && pplRand() < dt*.05) emote(p, pplRand() < .45 ? 'note' : pplRand() < .6 ? 'heart' : 'bang', 2.2); } } }
        else {
          if (sp.kind === 'vendor') gest = queued.has(sp.stall) && Math.floor(t*.5 + p.phase) % 3 > 0;      // serving
          else if (sp.kind === 'queue'){ gest = served.has(sp.stall) && Math.floor(t*.4 + p.phase) % 2 === 0;  // ordering
            if (!served.has(sp.stall) && !(p.emoUntil > t) && pplRand() < dt*.06) emote(p, 'dots', 2); }   // waiting for the keeper
          else { const mate = sp.near.find(o => o.by && people.get(o.by) && !people.get(o.by).walk);           // chatting
            if (mate){ face = [mate.x - sp.x, mate.z - sp.z]; gest = Math.floor(t*.45 + p.phase) % 2 === 0;
              if (!(p.emoUntil > t) && pplRand() < dt*.05) emote(p, pplRand() < .4 ? 'note' : pplRand() < .5 ? 'heart' : 'bang', 2.2); }
            else face = null; }
          frame = gest ? F_SPEC + Math.floor(t*6 + p.phase) % 6 : F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle;
        }
        if (face){ const sd = face[0]*_camR.x + face[1]*_camR.z; if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1; }
      }
    }
    if (walking) frame = paused ? F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle : Math.floor(t*9*p.speed/PPL_SPEED*(p.rush ? 2 : p.hurry ? 1.5 : 1) + p.phase) % PPL.walk;
    if (p.cop && p.angry > t) frame = F_ANGRY + Math.min(5, Math.floor((t - p.angry + .9)*7));
    if (!emit(p.x, y, p.z, p.cop ? ROW_COP : p.row, frame, p.flip, Math.max(0, alpha))) continue;
    if (p.emoUntil > t && alpha > .9) emit(p.x, y + (frame >= F_SIT && frame < F_SIT + 4 && !p.cop ? .6 : .8), p.z, ROW_EMO, p.emo, 1, 2);
  }
  lawnHolos(); lawnPicnics(dt);
  // lurkers on the dark streets
  for (const L of lurkers.values()){
    if (L.fade <= 0 || L.state === 'caught') continue;
    if (L.dx !== undefined){ const sd = L.dx*_camR.x + L.dz*_camR.z; if (Math.abs(sd) > 1e-3) L.flip = sd < 0 ? -1 : 1; }
    const fr = L.state === 'strike' || L.state === 'flee' ? Math.floor(t*16 + L.phase) % PPL.walk
             : L.state === 'rob' ? F_SPEC + Math.floor(t*7) % 6 : F_IDLE + Math.floor(t*2 + L.phase) % PPL.idle;
    emit(L.x, CURB, L.z, L.row, fr, L.flip, L.fade >= 1 ? 1 : L.fade*.98);
  }
  // the police hoverbikes: the officer astride, and anyone they've picked up on the pillion behind
  if (typeof POLICE_BIKES !== 'undefined') for (const b of POLICE_BIKES){
    if (!b.rider || b.alpha <= 0) continue;
    const a0 = b.alpha >= 1 ? 1 : b.alpha*.98;
    if (b.walkIn){   // off the bike and walking into the station, the officer leading the mugger by the arm
      const W = b.walkIn, dx = W.x1 - W.x0, dz = W.z1 - W.z0, l = Math.hypot(dx, dz) || 1, x = W.x0 + dx*W.u, z = W.z0 + dz*W.u;
      const sd = dx*_camR.x + dz*_camR.z, fl = Math.abs(sd) > 1e-3 ? (sd < 0 ? -1 : 1) : 1, fr = Math.floor(t*9) % PPL.walk;
      emit(x, CURB, z, ROW_COP, fr, fl, a0);
      if (b.passenger) emit(x - dx/l*.32, CURB, z - dz/l*.32, b.passenger.row, (fr + 3) % PPL.walk, fl, a0);
      continue;
    }
    const sd = b.hx*_camR.x + b.hz*_camR.z; if (Math.abs(sd) > .15) b.flip = sd < 0 ? -1 : 1;
    const ox = -_bkF.x*.06, oz = -_bkF.z*.06;   // a touch nearer the camera than the bike sprite
    const y = b.ry + BIKE_SEAT, a = a0;
    if (b.passenger){ const L = b.passenger;
      emit(b.x - b.hx*.24 - _bkF.x*.03, y + .03, b.z - b.hz*.24 - _bkF.z*.03, L.row, F_SIT, b.flip || 1, a); }
    emit(b.x + b.hx*.06 + ox, y, b.z + b.hz*.06 + oz, ROW_COP, F_SIT, b.flip || 1, a);
  }
  // delivery bots and their parcels
  for (const b of bots){
    if (b.state === 'in') continue;
    let frame, alpha = 1;
    if (b.state === 'drop') frame = 8 + Math.min(5, Math.floor((t - b.t0)/.22));
    else { frame = b.gait + Math.floor(t*8 + b.phase) % 4; const w = b.walk;
      if (w && w.doorA) alpha = Math.min(alpha, (w.s - .05)/.3); if (w && w.doorB) alpha = Math.min(alpha, (w.len - w.s - .05)/.3); }
    const y = CURB + .02*Math.sin(t*3 + b.phase);
    if (emit(b.x, y, b.z, ROW_BOT, frame, b.flip, Math.max(0, alpha)) && b.emoUntil > t) emit(b.x, y + .45, b.z, ROW_EMO, b.emo, 1, 2);
    if (b.cap && t - b.t0 > 1.3) emit(b.cap.x, CURB, b.cap.z, ROW_BOT, 14 + Math.min(5, Math.floor((t - b.t0 - 1.3)/.38)), 1, 1);
  }
  pplMesh.geometry.instanceCount = i;
  pos.needsUpdate = spr.needsUpdate = true;
  updateDoors(dt);
}
// for the dev overlay and tests
function peopleStats(){
  let walking = 0, home = 0, work = 0, out = 0;
  for (const p of people.values()){ if (p.walk) walking++; else if (p.at === p.home) home++; else if (p.at === p.job) work++; else out++; }
  return { people: people.size, jobs: [...people.values()].filter(p => p.job).length, walking, home, work, out, drawn: pplMesh.geometry.instanceCount, nodes: NG.x.length, doors: doorList.length, bots: bots.length, botsOut: bots.filter(b => b.state !== 'in').length,
    muggings: cityLog.filter(e => e.kind === 'mugging').length, lurkers: lurkers.size, lurking: [...lurkers.values()].filter(l => l.state !== 'away').length,
    patrolling: [...people.values()].filter(p => p.cop && (p.patrol || (p.walk && p.walk.beat))).length, cops: [...people.values()].filter(p => p.cop).length,
    homeless: [...places.values()].filter(pl => pl.cell && !pl.doors.length).length };
}
