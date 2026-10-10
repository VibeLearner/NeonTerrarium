// The shell builder (baked far buildings, item 2). Pure functions, no THREE and no page globals: runs in the page and in node.
//
// For one plot's finished geometry (positions + triangle indices, one or several parts) it works out a small set of axis-aligned boxes that follow the
// building's mass, and says which triangles are NOT covered by them and so must stay real geometry ("kept"). Method:
//   1. voxelize the visible triangles (surface voxels, by sampling each triangle finer than a voxel), everything below groundY left out
//   2. seal the surface (grow it one voxel), flood the outside, and call everything not outside mass: closed volumes fill, free-standing thin things stay thin
//   3. open the mass in x and z (erode, grow back, by `open` voxels): railings, antennas, plants, fences and trim thinner than 2*open+1 voxels are not mass
//   4. cut the mass into boxes: repeatedly take the largest box that fits entirely inside the mass not yet used (so a box never holds volume the building lacks),
//      until `maxBoxes`, or what is left is small (`minVolFrac` of the mass, or `minVol`)
//   5. move each box face to the real wall or roof plane next to it (the voxel grid is only 0.2 fine), faces that touch together move together
//   6. a triangle stays real geometry when any of its points (corners, edge middles, center) is farther than `keepDist` from every box; the rest is buried in
//      the shell (inside) or within reach of a face (painted on it by the baker)
// Shell triangles: 2 per visible face rectangle; bottom faces are not counted (the camera is always above), faces shared between two boxes are cut away.
//
// Shell.build(parts, opts) -> { boxes:[{x0,y0,z0,x1,y1,z1}], faces:[{ax,dir,c,a0,a1,b0,b1}], keep:[Uint32Array per part: triangle numbers kept], stats }
//   parts: [{ p: positions (flat x,y,z), i: indices (triangle list; omit for a plain triangle soup), lo, hi: triangle range to use (default all) }]
// Shell.atlasVisible(ix, cut): the visible triangle list of a plot's atlas geometry laid out by sideLayoutGen (A, hidden H, then the wall slices S; the
//   rest is the same walls again for the shadow pass): ix.subarray(0, A) and ix.subarray(A + H, A + H + S) joined.
(function (root){
'use strict';
const DEF = { vs: .2, groundY: -.7, open: 1, maxBoxes: 12, minVolFrac: .004, minVol: .06, minSpan: 3, keepDist: .3, snap: true, seal: 1, bottom: false, pad: 2 };

function atlasVisible(ix, cut){
  if (!cut) return ix;
  const A = cut.A, H = cut.H, S = cut.S, out = new ix.constructor(A + S);
  out.set(ix.subarray(0, A), 0); out.set(ix.subarray(A + H, A + H + S), A);
  return out;
}

function build(parts, opts){
  const O = Object.assign({}, DEF, opts || {}), vs = O.vs, T0 = now();
  const st = { parts: parts.length, tris: 0, timeMs: {} };
  // ---- the triangles: gather bounds
  let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30, nT = 0;
  const P = parts.map(pt => { const idx = pt.i, n = idx ? idx.length/3 : pt.p.length/9, lo = pt.lo || 0, hi = pt.hi === undefined ? n : pt.hi; return { p: pt.p, i: idx, lo, hi }; });
  const tri = (pt, t) => pt.i ? [pt.i[t*3]*3, pt.i[t*3 + 1]*3, pt.i[t*3 + 2]*3] : [t*9, t*9 + 3, t*9 + 6];
  for (const pt of P){
    nT += pt.hi - pt.lo;
    for (let t = pt.lo; t < pt.hi; t++){ const [a, b, c] = tri(pt, t), p = pt.p;
      for (const o of [a, b, c]){ const x = p[o], y = p[o + 1], z = p[o + 2]; if (y < O.groundY - .5) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; } }
  }
  st.tris = nT;
  const out = { boxes: [], faces: [], keep: P.map(() => new Uint32Array(0)), stats: st };
  if (!nT || x1 < x0){ st.empty = true; return out; }
  // ---- the grid: a lattice common to all plots in x and z (so neighbors line up), y from the ground
  const gx0 = Math.floor((x0 - O.pad*vs)/vs), gz0 = Math.floor((z0 - O.pad*vs)/vs), gy0 = Math.floor(O.groundY/vs);
  const nx = Math.ceil((x1 + O.pad*vs)/vs) - gx0 + 1, nz = Math.ceil((z1 + O.pad*vs)/vs) - gz0 + 1, ny = Math.max(1, Math.ceil((y1 + vs)/vs) - gy0 + 1);
  const NX = nx + 2, NY = ny + 1, NZ = nz + 2, N = NX*NY*NZ;   // (padded: a ring of outside round the sides and above; below is the ground, not outside)
  const ix_ = (x, y, z) => (y*NZ + z)*NX + x;
  st.grid = [nx, ny, nz]; st.voxels = nx*ny*nz;
  const ox = gx0*vs - vs, oy = gy0*vs, oz = gz0*vs - vs;   // grid cell (X,Y,Z) spans ox + X*vs ...
  // ---- 1. surface voxels
  let t0 = now();
  const surf = new Uint8Array(N), h = vs*.5, G = O.groundY;
  const mark = (x, y, z) => { if (y < G - 1e-6) return; const X = Math.floor((x - ox)/vs), Y = Math.floor((y - oy)/vs), Z = Math.floor((z - oz)/vs); if (X >= 0 && X < NX && Y >= 0 && Y < ny && Z >= 0 && Z < NZ) surf[ix_(X, Y, Z)] = 1; };
  for (const pt of P){ const p = pt.p;
    for (let t = pt.lo; t < pt.hi; t++){ const [a, b, c] = tri(pt, t);
      const ax = p[a], ay = p[a + 1], az = p[a + 2], ux = p[b] - ax, uy = p[b + 1] - ay, uz = p[b + 2] - az, vx = p[c] - ax, vy = p[c + 1] - ay, vz = p[c + 2] - az;
      if (ay < G - 1e-6 && p[b + 1] < G - 1e-6 && p[c + 1] < G - 1e-6) continue;
      const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), lw = Math.hypot(vx - ux, vy - uy, vz - uz);
      const nu = Math.max(1, Math.ceil(Math.max(lu, lw)/h)), nv = Math.max(1, Math.ceil(Math.max(lv, lw)/h));
      if (nu*nv > 4e6) continue;   // (a degenerate runaway: not a real triangle of this city)
      for (let i = 0; i <= nu; i++){ const s = i/nu; for (let j = 0; j <= nv; j++){ const q = j/nv; if (s + q > 1.0001) break; mark(ax + ux*s + vx*q, ay + uy*s + vy*q, az + uz*s + vz*q); } }
    } }
  st.timeMs.surface = now() - t0;
  // ---- 2. seal, outside flood, mass
  t0 = now();
  const sealed = grow(surf, NX, NY, NZ, O.seal), ext = new Uint8Array(N);
  { // flood from the ring round the sides and the top layer, through voxels that are not sealed (6-connected)
    const stack = new Int32Array(N); let sp = 0;
    const push = (x, y, z) => { const k = ix_(x, y, z); if (!sealed[k] && !ext[k]){ ext[k] = 1; stack[sp++] = k; } };
    for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++){ push(0, y, z); push(NX - 1, y, z); }
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++){ push(x, y, 0); push(x, y, NZ - 1); }
    for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) push(x, NY - 1, z);
    while (sp){ const k = stack[--sp], x = k % NX, r = (k - x)/NX, z = r % NZ, y = (r - z)/NZ;
      if (x > 0) push(x - 1, y, z); if (x < NX - 1) push(x + 1, y, z); if (z > 0) push(x, y, z - 1); if (z < NZ - 1) push(x, y, z + 1); if (y > 0) push(x, y - 1, z); if (y < NY - 1) push(x, y + 1, z); }
  }
  const inside = new Uint8Array(N); let nIn = 0, nSurf = 0; for (let k = 0; k < N; k++){ inside[k] = (!sealed[k] && !ext[k]) ? 1 : 0; nIn += inside[k]; nSurf += surf[k]; }
  st.surfVoxels = nSurf; st.insideVoxels = nIn;
  // mass: everything not outside, except the outer ring the sealing added (voxels next to the outside that are not surface themselves)
  const nearExt = grow(ext, NX, NY, NZ, 1);
  let mass = new Uint8Array(N); for (let k = 0; k < N; k++) mass[k] = (!ext[k] && (surf[k] || !nearExt[k])) ? 1 : 0;
  for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) if (y >= ny || x === 0 || z === 0 || x === NX - 1 || z === NZ - 1) mass[ix_(x, y, z)] = 0;
  st.timeMs.fill = now() - t0;
  if (O.debugGrids) out.grids = { NX, NY, NZ, surf, ext, inside, mass: mass.slice() };
  // ---- 3. opening in x and z
  t0 = now();
  if (O.open > 0){ mass = growXZ(erodeXZ(mass, NX, NY, NZ, O.open), NX, NY, NZ, O.open); }
  let massN = 0; for (let k = 0; k < N; k++) massN += mass[k];
  st.massVoxels = massN; st.massVol = massN*vs*vs*vs;
  st.timeMs.open = now() - t0;
  // ---- 4. boxes
  t0 = now();
  const bx = cutBoxes(mass, NX, NY, NZ, O, massN);
  st.timeMs.boxes = now() - t0;
  let boxes = bx.boxes.map(b => ({ x0: ox + b[0]*vs, x1: ox + b[1]*vs, y0: oy + b[2]*vs, y1: oy + b[3]*vs, z0: oz + b[4]*vs, z1: oz + b[5]*vs }));
  st.coveredVol = bx.covered*vs*vs*vs; st.coverage = massN ? bx.covered/massN : 0;
  // ---- 5. snap faces to the real planes
  t0 = now();
  if (O.snap && boxes.length) snapBoxes(boxes, P, tri, vs, O);
  st.timeMs.snap = now() - t0;
  for (const b of boxes){ for (const k of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1']) b[k] = Math.round(b[k]*1000)/1000; }
  // ---- 6. kept triangles
  t0 = now();
  const D = O.keepDist; let kept = 0, buried = 0, below = 0;
  const dist2 = (x, y, z) => { let m = 1e30; for (const b of boxes){ const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1), dz = Math.max(b.z0 - z, 0, z - b.z1), d = dx*dx + dy*dy + dz*dz; if (d < m) m = d; } return m; };
  const D2 = D*D;
  P.forEach((pt, n) => { const p = pt.p, list = [];
    for (let t = pt.lo; t < pt.hi; t++){ const [a, b, c] = tri(pt, t);
      if (p[a + 1] < G - 1e-6 && p[b + 1] < G - 1e-6 && p[c + 1] < G - 1e-6){ below++; continue; }   // (under the street: never seen)
      let far = false;
      if (boxes.length){
        const X = [p[a], p[b], p[c]], Y = [p[a + 1], p[b + 1], p[c + 1]], Z = [p[a + 2], p[b + 2], p[c + 2]];
        for (let k = 0; k < 3 && !far; k++){ if (dist2(X[k], Y[k], Z[k]) > D2) far = true; }
        if (!far){ for (let k = 0; k < 3 && !far; k++){ const l = (k + 1) % 3; if (dist2((X[k] + X[l])/2, (Y[k] + Y[l])/2, (Z[k] + Z[l])/2) > D2) far = true; }
          if (!far && dist2((X[0] + X[1] + X[2])/3, (Y[0] + Y[1] + Y[2])/3, (Z[0] + Z[1] + Z[2])/3) > D2) far = true; }
      } else far = true;
      if (far){ list.push(t); kept++; } else buried++;
    }
    out.keep[n] = Uint32Array.from(list); });
  st.timeMs.keep = now() - t0;
  st.kept = kept; st.buried = buried; st.below = below; st.keptShare = (nT - below) ? kept/(nT - below) : 0;
  // ---- the shell's own faces
  out.boxes = boxes; out.faces = faceRects(boxes, O);
  st.boxCount = boxes.length; st.faceCount = out.faces.length; st.shellTris = out.faces.length*2;
  st.timeMs.total = now() - T0;
  return out;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---- morphology on the padded grid (layout (y*NZ + z)*NX + x)
function grow(a, NX, NY, NZ, r){   // 3D, square (Chebyshev) radius r
  let c = a; for (let k = 0; k < r; k++){ c = growXZ(c, NX, NY, NZ, 1); c = growY(c, NX, NY, NZ); } return c;
}
function growY(a, NX, NY, NZ){
  const L = NX*NZ, o = new Uint8Array(a.length);
  for (let y = 0; y < NY; y++) for (let k = 0; k < L; k++){ const i = y*L + k; o[i] = (a[i] || (y > 0 && a[i - L]) || (y < NY - 1 && a[i + L])) ? 1 : 0; }
  return o;
}
function growXZ(a, NX, NY, NZ, r){
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++){ const b = (y*NZ + z)*NX; let last = -1e9;
    for (let x = 0; x < NX; x++){ if (a[b + x]) last = x; if (x - last <= r) t[b + x] = 1; }
    last = 1e9; for (let x = NX - 1; x >= 0; x--){ if (a[b + x]) last = x; if (last - x <= r) t[b + x] = 1; } }
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++){ let last = -1e9;
    for (let z = 0; z < NZ; z++){ if (t[(y*NZ + z)*NX + x]) last = z; if (z - last <= r) o[(y*NZ + z)*NX + x] = 1; }
    last = 1e9; for (let z = NZ - 1; z >= 0; z--){ if (t[(y*NZ + z)*NX + x]) last = z; if (last - z <= r) o[(y*NZ + z)*NX + x] = 1; } }
  return o;
}
function erodeXZ(a, NX, NY, NZ, r){   // the complement grown, complemented (the grid's edge counts as empty)
  const c = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) c[i] = a[i] ? 0 : 1;
  const g = growXZ(c, NX, NY, NZ, r), o = new Uint8Array(a.length);
  for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++){ const i = (y*NZ + z)*NX + x; o[i] = (g[i] || x < r || x >= NX - r || z < r || z >= NZ - r) ? 0 : 1; }
  return o;
}

// ---- the boxes: the largest box fitting wholly in the mass left, again and again. Layers that look the same are one run, so a tall plain tower costs one step.
function cutBoxes(mass, NX, NY, NZ, O, massN){
  const L = NX*NZ, rem = mass.slice(), boxes = []; let covered = 0;
  const minVolV = Math.max(O.minVol/(O.vs*O.vs*O.vs), O.minVolFrac*massN), span = O.minSpan;
  const hist = new Int32Array(NX), stk = new Int32Array(NX + 1);
  for (let round = 0; round < O.maxBoxes; round++){
    // runs of equal layers (with something in them)
    const runs = []; let prev = -1;
    const same = (p, q) => { const a = p*L, b = q*L; for (let k = 0; k < L; k++) if (rem[a + k] !== rem[b + k]) return false; return true; };
    const empty = y => { const a = y*L; for (let k = 0; k < L; k++) if (rem[a + k]) return false; return true; };
    for (let y = 0; y < NY; y++){
      if (empty(y)){ prev = -1; continue; }
      if (prev >= 0 && runs.length && runs[runs.length - 1].y1 === y && same(prev, y)){ runs[runs.length - 1].y1 = y + 1; }
      else runs.push({ y0: y, y1: y + 1, rep: y });
      prev = y;
    }
    if (!runs.length) break;
    let best = null, bestV = 0;
    const cur = new Uint8Array(L);
    for (let a = 0; a < runs.length; a++){
      cur.set(rem.subarray(runs[a].rep*L, runs[a].rep*L + L));
      for (let b = a; b < runs.length; b++){
        if (b > a){ if (runs[b].y0 !== runs[b - 1].y1) break; const q = runs[b].rep*L; let any = false; for (let k = 0; k < L; k++){ cur[k] &= rem[q + k]; if (cur[k]) any = true; } if (!any) break; }
        const height = runs[b].y1 - runs[a].y0;
        // largest rectangle in cur (rows z, columns x) by the histogram stack; area*height is the volume
        hist.fill(0);
        for (let z = 0; z < NZ; z++){
          const base = z*NX; let sp = 0;
          for (let x = 0; x <= NX; x++){
            const v = x < NX ? (cur[base + x] ? hist[x] + 1 : 0) : 0; if (x < NX) hist[x] = v;
            let start = x;
            while (sp > 0 && stackH[sp - 1] >= v){ sp--; const hh = stackH[sp], s0 = stackS[sp], w = x - s0, vol = hh*w*height;
              if (vol > bestV && w >= span && hh >= span){ bestV = vol; best = { xa: s0, xb: x, zb: z + 1, zh: hh, ya: runs[a].y0, yb: runs[b].y1 }; }
              start = s0; }
            if (v > 0){ stackH[sp] = v; stackS[sp] = start; sp++; }
          }
        }
      }
    }
    if (!best || bestV < minVolV) break;
    const b = best;
    // (the ground slab is only a voxel or two high but wide: the span test covers the footprint, not the height)
    boxes.push([b.xa, b.xb, b.ya, b.yb, b.zb - b.zh, b.zb]);   // (grid cells of the padded grid)
    for (let y = b.ya; y < b.yb; y++) for (let z = b.zb - b.zh; z < b.zb; z++){ const r0 = (y*NZ + z)*NX; for (let x = b.xa; x < b.xb; x++){ rem[r0 + x] = 0; covered++; } }
  }
  return { boxes, covered };
}
const stackH = new Int32Array(4096), stackS = new Int32Array(4096);

// ---- snapping faces to real planes
function snapBoxes(boxes, P, tri, vs, O){
  const keys = ['x', 'y', 'z'];
  // the flat axis-aligned triangles (all three corners on one plane), by axis
  const flat = [[], [], []];
  for (const pt of P){ const p = pt.p;
    for (let t = pt.lo; t < pt.hi; t++){ const [a, b, c] = tri(pt, t);
      for (let ax = 0; ax < 3; ax++){ const q = p[a + ax]; if (Math.abs(p[b + ax] - q) < 2e-3 && Math.abs(p[c + ax] - q) < 2e-3){
        const u = (ax + 1) % 3, w = (ax + 2) % 3, lo = [Math.min(p[a + u], p[b + u], p[c + u]), Math.min(p[a + w], p[b + w], p[c + w])], hi = [Math.max(p[a + u], p[b + u], p[c + u]), Math.max(p[a + w], p[b + w], p[c + w])];
        const area = Math.abs((p[b + u] - p[a + u])*(p[c + w] - p[a + w]) - (p[c + u] - p[a + u])*(p[b + w] - p[a + w]))/2;
        if (area > 1e-5) flat[ax].push([q, lo[0], lo[1], hi[0], hi[1], area]); } } } }
  // planes: faces at the same coordinate (a touching pair) move together
  const planes = new Map();
  boxes.forEach((b, n) => { for (let ax = 0; ax < 3; ax++) for (let s = 0; s < 2; s++){ const c = b[keys[ax] + s]; const k = ax + ':' + Math.round(c*1000); let e = planes.get(k); if (!e) planes.set(k, e = { ax, c, faces: [] }); e.faces.push([n, s]); } });
  for (const e of planes.values()){
    const ax = e.ax, u = (ax + 1) % 3, w = (ax + 2) % 3, bins = new Map(); let faceArea = 0;
    for (const [n, s] of e.faces){ const b = boxes[n];
      const fu0 = b[keys[u] + '0'], fu1 = b[keys[u] + '1'], fw0 = b[keys[w] + '0'], fw1 = b[keys[w] + '1']; faceArea += (fu1 - fu0)*(fw1 - fw0);
      for (const f of flat[ax]){ if (Math.abs(f[0] - e.c) > vs*1.1) continue;
        const ou = Math.min(fu1, f[3]) - Math.max(fu0, f[1]), ow = Math.min(fw1, f[4]) - Math.max(fw0, f[2]); if (ou <= 0 || ow <= 0) continue;
        const frac = Math.min(1, ou*ow/Math.max(1e-9, (f[3] - f[1])*(f[4] - f[2])));   // (the part of the triangle over this face)
        const key = Math.round(f[0]*100); bins.set(key, (bins.get(key) || 0) + f[5]*frac); } }
    let bk = null, bv = 0; for (const [k, v] of bins) if (v > bv){ bv = v; bk = k; }
    if (bk === null || bv < Math.max(.12*faceArea, .2)) continue;
    const c = bk/100;
    for (const [n, s] of e.faces){ const b = boxes[n], key = keys[ax] + s; b[key] = c; }
  }
  // (a box that snapping squeezed away: put it back on the grid)
  for (const b of boxes) for (const k of keys) if (b[k + '1'] - b[k + '0'] < vs*.5){ const m = (b[k + '0'] + b[k + '1'])/2; b[k + '0'] = m - vs*.5; b[k + '1'] = m + vs*.5; }
}

// ---- the visible faces: five per box (no bottom), the parts of them under another box's touching face cut away, then merged into rectangles
function faceRects(boxes, O){
  const out = [], K = ['x', 'y', 'z'], eps = 1e-3;
  for (let n = 0; n < boxes.length; n++){ const b = boxes[n];
    for (let ax = 0; ax < 3; ax++) for (let s = 0; s < 2; s++){
      if (ax === 1 && s === 0 && !O.bottom) continue;
      const c = b[K[ax] + s], u = (ax + 1) % 3, w = (ax + 2) % 3, au0 = b[K[u] + '0'], au1 = b[K[u] + '1'], aw0 = b[K[w] + '0'], aw1 = b[K[w] + '1'];
      const cover = [];   // rectangles of other boxes' faces on this plane facing the other way, or boxes overlapping it
      for (let m = 0; m < boxes.length; m++){ if (m === n) continue; const o = boxes[m];
        const oc = o[K[ax] + (1 - s)];
        const touches = Math.abs(oc - c) < eps || (s ? (o[K[ax] + '0'] < c - eps && o[K[ax] + '1'] > c + eps) : (o[K[ax] + '0'] < c - eps && o[K[ax] + '1'] > c + eps));
        if (!touches) continue;
        const ou0 = Math.max(au0, o[K[u] + '0']), ou1 = Math.min(au1, o[K[u] + '1']), ow0 = Math.max(aw0, o[K[w] + '0']), ow1 = Math.min(aw1, o[K[w] + '1']);
        if (ou1 - ou0 > eps && ow1 - ow0 > eps) cover.push([ou0, ou1, ow0, ow1]); }
      for (const r of subtract([au0, au1, aw0, aw1], cover)) out.push({ ax, dir: s ? 1 : -1, c, a0: r[0], a1: r[1], b0: r[2], b1: r[3], box: n });
    } }
  return out;
}
// a rectangle minus rectangles, as rectangles (a cell grid on the cut lines, merged along rows then down)
function subtract(r, cuts){
  if (!cuts.length) return [r];
  const us = new Set([r[0], r[1]]), ws = new Set([r[2], r[3]]);
  for (const q of cuts){ us.add(q[0]); us.add(q[1]); ws.add(q[2]); ws.add(q[3]); }
  const U = [...us].filter(v => v >= r[0] - 1e-9 && v <= r[1] + 1e-9).sort((a, b) => a - b), W = [...ws].filter(v => v >= r[2] - 1e-9 && v <= r[3] + 1e-9).sort((a, b) => a - b);
  const nu = U.length - 1, nw = W.length - 1, free = new Uint8Array(nu*nw);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++){ const cu = (U[i] + U[i + 1])/2, cw = (W[j] + W[j + 1])/2; let hit = false; for (const q of cuts) if (cu > q[0] && cu < q[1] && cw > q[2] && cw < q[3]){ hit = true; break; } free[i*nw + j] = hit ? 0 : 1; }
  const out = [], done = new Uint8Array(nu*nw);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++){ if (!free[i*nw + j] || done[i*nw + j]) continue;
    let j2 = j; while (j2 + 1 < nw && free[i*nw + j2 + 1] && !done[i*nw + j2 + 1]) j2++;
    let i2 = i; for (;;){ if (i2 + 1 >= nu) break; let ok = true; for (let k = j; k <= j2; k++) if (!free[(i2 + 1)*nw + k] || done[(i2 + 1)*nw + k]){ ok = false; break; } if (!ok) break; i2++; }
    for (let a = i; a <= i2; a++) for (let k = j; k <= j2; k++) done[a*nw + k] = 1;
    out.push([U[i], U[i2 + 1], W[j], W[j2 + 1]]); }
  return out;
}

const Shell = { build, atlasVisible, DEFAULTS: DEF };
if (typeof module !== 'undefined' && module.exports) module.exports = Shell; else root.Shell = Shell;
})(typeof self !== 'undefined' ? self : this);
