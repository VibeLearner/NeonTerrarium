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
  for (const k in data.fol) for (const f of data.fol[k]){
    const e = f.m.elements, oy = e[13], hy = e[5], yb = oy - f.an*hy, yt = oy + (1 - f.an)*hy;
    if (Math.max(yb, yt) < Y_LO || Math.min(yb, yt) > Y_HI) continue;
    const hx = e[0]*.35, hz = e[2]*.35;
    line(soft, e[12] - hx, e[14] - hz, e[12] + hx, e[14] + hz);
  }
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
function ngLink(a, b, pts, len){ if (a === b) return; const e = { a, pts, len }; NG.adj[a].set(b, e); NG.adj[b].set(a, e); }
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
  for (const e of c._pe.edges){ const a = NG.key.get(e.a), b = NG.key.get(e.b); if (a !== undefined && b !== undefined) ngLink(a, b, e.pts, e.len); }
}
// shortest walk between two network points (A*), as one polyline
const routeCache = new Map();
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
    for (const [w, e] of NG.adj[v]){ const d = g[v] + e.len; if (d < g[w]){ g[w] = d; from[w] = v; push(w, d + hz(w)); } }
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
  square:  { jobs: 6,  fun: 12, open: true },
  police:  { jobs: 8,  fun: 0,  night: .4 },
  foundry: { jobs: 14, fun: 0,  night: .35 },
};
const places = new Map();   // id -> { id, x, z, doors: [{ node, out:{x,z}, in:{x,z}|null, dir:[dx,dz] }], jobs, fun, open, night, cell|mega }
const people = new Map();   // id -> person
const hrange = (lo, hi) => (h => lo <= hi ? (h >= lo && h < hi) : (h >= lo || h < hi));
const span = (u, a, b) => a + (b - a)*u;
function u01(...a){ return hash(...a) / 4294967296; }

const reachable = pl => !!pl && (pl.doors.length > 0 || (pl.spots && pl.spots.length > 0));
const crossKey = (c, dx, dz) => dx + dz > 0 ? c.i + ',' + c.j + '|' + dx + ',' + dz : (c.i + dx) + ',' + (c.j + dz) + '|' + (-dx) + ',' + (-dz);
const DOOR_COLS = [0x4f7f86, 0x8A4A2A, 0x3a4252, 0xc95a7a, 0x6fa8dc, 0xd9b43a, 0x5f7d5b, 0xE3D6BD];
let doorList = [], hiddenDoors = [], spotByKey = new Map(), doorByKey = new Map();
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
  for (const m of megas.values()){
    const L = MEGA_LIFE[m.kind] || { jobs: 4, fun: 0 }, tiers = m.kind === 'mall' ? m.levels : 1;
    const pl = { id: 'm:' + m.kind, mega: m, x: m.x, z: m.z, jobs: L.jobs*tiers, fun: L.fun*tiers, night: L.night || 0, open: !!L.open, doors: [], spots: [] };
    if (L.open){
      // standing spots round the koi pond, between the bench and the food carts, wherever there's room
      for (const [ri, r] of [POND_R + 1.05, POND_R + 1.5].entries()) for (let k = 0; k < 40; k++){
        const a = (k + ri*.5)/40*TAU, x = m.x + Math.cos(a)*r, z = m.z + Math.sin(a)*r;
        const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT)));
        if (!c || c.mega !== m.kind || !freeAt(cellGrid(c), x, z)) continue;
        const key = 's:' + ri + ',' + k, old = oldSpots.get(key);
        const sp = { key, x, z, node: ngAdd(key, x, z), by: old ? old.by : null, place: pl.id };
        pl.spots.push(sp); spotByKey.set(key, sp); addEnd(c, { key, x, z, kind: 's' });
      }
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
    for (const e of plotEnds.get(ckey(c.i, c.j)) || []) ends.push(e);
    if (ends.length < 2) continue;
    // a closed megastructure's plot only links its doors to the street, never street to street through the building
    plotEdges(c, ends, closedMega(c) ? (a, b) => (a.kind === 'd') !== (b.kind === 'd') : (a, b) => !(a.kind === 's' && b.kind === 's'));
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
  return { id, home, job: null, wantsJob: u('emp') < .8, courier: u('courier') < .2, row: hash(id, 'look') % PPL.rows,
           speed: PPL_SPEED*span(u('speed'), .85, 1.15),
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
  if (pl.id === p.home) return 25 + pplRand()*60;
  if (pl.id === p.job) return 50 + pplRand()*100;
  return 15 + pplRand()*45;
}
const pplRand = Math.random;   // moment-to-moment choices; who people are is seeded above
// a free standing spot, near the side they arrive from
function pickSpot(to, from){
  const free = to.spots.filter(sp => !sp.by); if (!free.length) return null;
  free.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
  return free[Math.floor(pplRand()*Math.min(6, free.length))];
}

/* ---------- walking ---------- */
const nearestOf = (doors, x, z) => { let best = null, bd = Infinity; for (const d of doors){ const v = (d.stand.x - x)**2 + (d.stand.z - z)**2; if (v < bd){ bd = v; best = d; } } return best; };
// a trip: from just inside one door, out through it, along the network, in through another (or to a standing spot)
function startTrip(p, toId){
  const from = places.get(p.at), to = places.get(toId);
  if (!from || !to || !reachable(to)) return false;
  let a, head = [], dA = null;
  if (p.spot) a = p.spot.node;
  else { if (!from.doors.length) return false; dA = nearestOf(from.doors, to.x, to.z); a = dA.node; head = [[dA.inside.x, dA.inside.z], [dA.wall.x, dA.wall.z]]; }
  let b, tail = [], dB = null, spot = null;
  if (to.open){ spot = pickSpot(to, from); if (!spot) return false; b = spot.node; }
  else { if (!to.doors.length) return false; dB = nearestOf(to.doors, from.x, from.z); b = dB.node; tail = [[dB.wall.x, dB.wall.z], [dB.inside.x, dB.inside.z]]; }
  const mid = route(a, b); if (!mid) return false;
  const pts = head.concat(mid, tail);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  if (p.spot){ p.spot.by = null; p.spot = null; }
  if (spot) spot.by = p.id;
  p.walk = { pts, cum, len: cum[cum.length - 1], s: 0, to: toId, doorA: dA, doorB: dB, spot };
  return true;
}
// decide what to do next once the current stay is over
function decide(p){
  const want = desire(p, S.hour) || p.home;
  p.walkedFor = (want !== p.job && want !== p.home && working(p, S.hour)) ? 'errand' : null;
  if (want === p.at || !places.has(want) || !startTrip(p, want)) p.until = pplNow + 15 + pplRand()*40;
}
function arrive(p){
  const w = p.walk; p.walk = null;
  p.at = w.to; p.spot = w.spot;
  const pl = places.get(p.at);
  p.until = pplNow + (pl ? stayFor(p, pl) : 20);
}
const sendHome = p => { if (p.spot && p.spot.by === p.id) p.spot.by = null; p.walk = null; p.spot = null; p.at = p.home; p.until = pplNow + 5 + Math.random()*20; };

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
    } else if (!places.has(p.at)) sendHome(p);
    else if (p.spot){ const sp = spotByKey.get(p.spot.key); if (sp && (!sp.by || sp.by === p.id)){ sp.by = p.id; p.spot = sp; } else sendHome(p); }
  }
  // newcomers: a fresh household is at home and comes out soon; on load, people are already wherever the hour says
  for (const p of people.values()){
    if (!p.fresh) continue;
    p.fresh = false;
    if (pplReady){ p.until = pplNow + 2 + Math.random()*20; continue; }
    const want = desire(p, S.hour), pl = places.get(want);
    p.at = reachable(pl) ? want : p.home;
    if (pl && pl.open && p.at === want){ const sp = pickSpot(pl, pl); if (sp){ sp.by = p.id; p.spot = sp; } else p.at = p.home; }
    p.until = pplNow + Math.random()*40;
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
        // through the doorway: dissolving in from the hallway, or out as they step inside
        if (w.doorA) alpha = Math.min(alpha, (w.s - .05)/.3);
        if (w.doorB) alpha = Math.min(alpha, (w.len - w.s - .05)/.3);
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
  updateDoors(dt);
}
// for the dev overlay and tests
function peopleStats(){
  let walking = 0, home = 0, work = 0, out = 0;
  for (const p of people.values()){ if (p.walk) walking++; else if (p.at === p.home) home++; else if (p.at === p.job) work++; else out++; }
  return { people: people.size, jobs: [...people.values()].filter(p => p.job).length, walking, home, work, out, drawn: pplMesh.geometry.instanceCount, nodes: NG.x.length, doors: doorList.length,
    homeless: [...places.values()].filter(pl => pl.cell && !pl.doors.length).length };
}
