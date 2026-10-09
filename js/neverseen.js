// Neon Terrarium: faces that no allowed camera ever sees (round 8, item 1: a cheat, the overlay test "draw never-seen faces too" turns it off).
// Inside a plot's own geometry many faces are covered by other faces of the same plot from every view the game allows (every turn, every tilt from PITCH_MIN to PITCH_MAX):
// interiors, the backs of fittings, the far sides of things. For each plot, in idle frames, the triangles of its own geometry are drawn into an id picture from a fixed set of views
// (NV.yaws turns x NV.np tilts x NV.jits sub-pixel offsets, at a pixel finer than the closest zoom's), the ids that show up in any view are marked on the card (a second pass
// scatters every pixel's id into a small map, so only that map is read back, once). The drawn triangles that never showed (and that are not depth ties with a same-facing
// triangle in the same plane) move to H: still drawn in the shadow map and while the piece is swept in or out, left out of the camera's pictures. Neighbors never count (the
// plot is drawn alone). The result is kept by the plot's geometry signature in IndexedDB, so a plot is worked out once, ever.
// A sampled set can miss a face that shows through a narrow gap or at a grazing angle in a few views: the rare missing speck of wall is the cost (see OVERNIGHT3.md).
const NV = { yaws: 48, np: 8, jits: [[0, 0], [.5, .5], [.25, .75], [.75, .25]], px: .006, maxPx: 4000, ver: 'v1-48x8x4-p006',
  views: 1, queue: [], job: null, store: new Map(), db: null, dbReady: false, still: 0, last: '', modeOn: true, stats: { plots: 0, removed: 0, drawn: 0, fromStore: 0, views: 0 },
  acc: null, rtId: null, scn: null, scatterScn: null };
NV.off = () => !!window.__NV_OFF;
NV.keep = () => !!(PH.tests.drawNever || window.__NV_DRAW_ALL);   // the overlay test: draw them too
// ---- the card's side: an id picture, then a scatter of the ids into a map ----
const NV_ID_MAT = new THREE.ShaderMaterial({ vertexShader: 'attribute vec3 idc; varying vec3 vId; void main(){ vId = idc; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vId; void main(){ gl_FragColor = vec4(vId, 1.0); }', side: THREE.FrontSide });
const NV_SCATTER_MAT = new THREE.ShaderMaterial({ uniforms: { uId: { value: null }, uW: { value: 1 }, uAW: { value: 1 }, uAH: { value: 1 } },
  vertexShader: `uniform sampler2D uId; uniform float uW; uniform float uAW; uniform float uAH;
    void main(){ float vid = float(gl_VertexID), y = floor(vid/uW), x = vid - y*uW; vec4 c = texelFetch(uId, ivec2(int(x), int(y)), 0);
      float id = floor(c.r*255.0 + .5) + floor(c.g*255.0 + .5)*256.0 + floor(c.b*255.0 + .5)*65536.0; gl_PointSize = 1.0;
      if (id < .5 || c.a < .5){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      float ty = floor(id/uAW), tx = id - ty*uAW; gl_Position = vec4((tx + .5)/uAW*2.0 - 1.0, (ty + .5)/uAH*2.0 - 1.0, 0.0, 1.0); }`,
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending });
let _nvDummy = null;
function nvScatterMesh(n){
  if (!_nvDummy || _nvDummy.attributes.position.count < n){ if (_nvDummy) _nvDummy.dispose(); _nvDummy = new THREE.BufferGeometry(); _nvDummy.setAttribute('position', new THREE.BufferAttribute(new Uint8Array(Math.max(n, 1 << 16)), 1)); }
  _nvDummy.setDrawRange(0, n);
  if (!NV.scatterMesh){ NV.scatterMesh = new THREE.Points(_nvDummy, NV_SCATTER_MAT); NV.scatterMesh.frustumCulled = false; NV.scatterScn = new THREE.Scene(); NV.scatterScn.add(NV.scatterMesh); }
  NV.scatterMesh.geometry = _nvDummy; return NV.scatterScn;
}
// ---- a plot's triangles as they are drawn today (A and the wall slices S; not H, not the repeat D) ----
function nvTriangles(g){
  const cut = g.userData.cut, I = g.index.array, out = [];
  for (let k = 0; k + 2 < cut.A; k += 3) out.push(k);
  for (let k = cut.A + cut.H; k + 2 < cut.A + cut.H + cut.S; k += 3) out.push(k);
  return out;   // positions in the index array (the drawn list's order)
}
function nvSig(g, tri){   // the plot's geometry as a number: its triangle count and a hash of the corners of every 7th triangle
  const P = g.attributes.position.array, I = g.index.array; let h = 2166136261 >>> 0; const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  for (let t = 0; t < tri.length; t += 7){ const k = tri[t]; for (let q = 0; q < 3; q++){ const v = I[k + q]*3; for (let c = 0; c < 3; c++){ f[0] = P[v + c]; h = Math.imul(h ^ u[0], 16777619) >>> 0; } } }
  return tri.length + ':' + h.toString(36) + ':' + NV.ver;
}
// ---- the job for one plot: prepare (the id geometry and the ties), run the views, read the map once, apply ----
function nvStart(c){
  const g = c.data.geo.get(ATLAS), tri = nvTriangles(g), T = tri.length, M = c.view ? c.view.matrixWorld : new THREE.Matrix4(), P = g.attributes.position.array, I = g.index.array;
  const job = { c, g, tri, T, M, phase: 'build', k: 0, pos: new Float32Array(T*9), idc: new Uint8Array(T*9), cen: new Float32Array(T*3), nor: new Float32Array(T*3), tie: new Uint8Array(T), vi: 0, views: null, sig: nvSig(g, tri), bb: new THREE.Box3() };
  const v = new THREE.Vector3();
  job.build = (from, to) => { for (let t = from; t < to; t++){ const k = tri[t], id = t + 1; for (let q = 0; q < 3; q++){ v.fromArray(P, I[k + q]*3).applyMatrix4(M); const o = t*9 + q*3; job.pos[o] = v.x; job.pos[o + 1] = v.y; job.pos[o + 2] = v.z; job.idc[o] = id & 255; job.idc[o + 1] = (id >> 8) & 255; job.idc[o + 2] = (id >> 16) & 255; job.bb.expandByPoint(v); }
    const p = job.pos, o = t*9, ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2], bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
    let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx; const l = Math.hypot(nx, ny, nz) || 1; job.nor[t*3] = nx/l; job.nor[t*3 + 1] = ny/l; job.nor[t*3 + 2] = nz/l;
    job.cen[t*3] = (p[o] + p[o + 3] + p[o + 6])/3; job.cen[t*3 + 1] = (p[o + 1] + p[o + 4] + p[o + 7])/3; job.cen[t*3 + 2] = (p[o + 2] + p[o + 5] + p[o + 8])/3; } };
  return job;
}
// depth ties: a drawn triangle facing the same way in the same plane holding this one's middle (whether it shows depends on the draw order, which a test picture does not copy): never moved
function nvTies(job, from, to){
  const { pos, cen, nor, T } = job, key = (x, y, z) => x + ',' + y + ',' + z;
  if (!job.grid){ job.grid = new Map(); for (let t = 0; t < T; t++){ const k = key(Math.floor(cen[t*3]*2), Math.floor(cen[t*3 + 1]*2), Math.floor(cen[t*3 + 2]*2)); let l = job.grid.get(k); if (!l) job.grid.set(k, l = []); l.push(t); } }
  const inside = (u, px, py, pz) => { const o = u*9, nx = nor[u*3], ny = nor[u*3 + 1], nz = nor[u*3 + 2];
    const side = (ax, ay, az, bx, by, bz) => { const ux = bx - ax, uy = by - ay, uz = bz - az, vx = px - ax, vy = py - ay, vz = pz - az; return (uy*vz - uz*vy)*nx + (uz*vx - ux*vz)*ny + (ux*vy - uy*vx)*nz > -1e-6; };
    return side(pos[o], pos[o + 1], pos[o + 2], pos[o + 3], pos[o + 4], pos[o + 5]) && side(pos[o + 3], pos[o + 4], pos[o + 5], pos[o + 6], pos[o + 7], pos[o + 8]) && side(pos[o + 6], pos[o + 7], pos[o + 8], pos[o], pos[o + 1], pos[o + 2]); };
  for (let t = from; t < to; t++){
    const cx = Math.floor(cen[t*3]*2), cy = Math.floor(cen[t*3 + 1]*2), cz = Math.floor(cen[t*3 + 2]*2); let f = false;
    for (let dx = -1; dx <= 1 && !f; dx++) for (let dy = -1; dy <= 1 && !f; dy++) for (let dz = -1; dz <= 1 && !f; dz++){ const l = job.grid.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
      for (const u of l){ if (u === t) continue; const dot = nor[u*3]*nor[t*3] + nor[u*3 + 1]*nor[t*3 + 1] + nor[u*3 + 2]*nor[t*3 + 2]; if (dot < .9999) continue;
        const d = nor[t*3]*(cen[u*3] - cen[t*3]) + nor[t*3 + 1]*(cen[u*3 + 1] - cen[t*3 + 1]) + nor[t*3 + 2]*(cen[u*3 + 2] - cen[t*3 + 2]); if (Math.abs(d) > 2e-4) continue;
        if (inside(u, cen[t*3], cen[t*3 + 1], cen[t*3 + 2])){ f = true; break; } } }
    job.tie[t] = f ? 1 : 0;
  }
}
function nvViews(cfg){
  const out = [], PIT = (a, b, n) => Array.from({ length: n }, (_, i) => n > 1 ? a + (b - a)*i/(n - 1) : a);
  for (const pd of PIT(PITCH_MIN*180/Math.PI, PITCH_MAX*180/Math.PI, cfg.np)) for (let yi = 0; yi < cfg.yaws; yi++) for (const jit of cfg.jits) out.push([(yi + (cfg.yawOff || 0))/cfg.yaws*Math.PI*2, pd*Math.PI/180, jit]);
  return out;
}
const _nvCam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000), _nvV = new THREE.Vector3();
function nvPrepGpu(job){
  const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(job.pos, 3)); ig.setAttribute('idc', new THREE.BufferAttribute(job.idc, 3, true));
  job.ig = ig; job.scn = new THREE.Scene(); const mesh = new THREE.Mesh(ig, NV_ID_MAT); mesh.frustumCulled = false; job.scn.add(mesh);
  job.ctr = job.bb.getCenter(new THREE.Vector3()); const sph = job.bb.getBoundingSphere(new THREE.Sphere()); job.rad = sph.radius;
  const side = Math.min(NV.maxPx, Math.ceil(2*job.rad/NV.px) + 8); job.rtId = new THREE.WebGLRenderTarget(side, side, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: true });
  job.rtId.scissorTest = true;
  const AW = 1024, AH = Math.ceil((job.T + 2)/AW); job.AW = AW; job.AH = AH;
  job.acc = new THREE.WebGLRenderTarget(AW, AH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: false });
  job.views = nvViews(NV); job.vi = 0;
}
// one view: the id picture of the plot, then the scatter into the map
function nvView(job, yaw, pit, jit, px){
  const cam = _nvCam, bb = job.bb, ctr = job.ctr, v = _nvV;
  cam.position.set(ctr.x + Math.sin(yaw)*Math.cos(pit)*300, ctr.y + Math.sin(pit)*300, ctr.z + Math.cos(yaw)*Math.cos(pit)*300); cam.lookAt(ctr); cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let q = 0; q < 8; q++){ v.set(q & 1 ? bb.max.x : bb.min.x, q & 2 ? bb.max.y : bb.min.y, q & 4 ? bb.max.z : bb.min.z).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
  const side = job.rtId.width; let P_SZ = px; if ((Math.max(x1 - x0, y1 - y0))/P_SZ + 4 > side) P_SZ = Math.max(x1 - x0, y1 - y0)/(side - 4);
  const w = Math.min(side, Math.ceil((x1 - x0)/P_SZ) + 4), h = Math.min(side, Math.ceil((y1 - y0)/P_SZ) + 4);
  cam.left = x0 - (2 + jit[0])*P_SZ; cam.right = cam.left + w*P_SZ; cam.bottom = y0 - (2 + jit[1])*P_SZ; cam.top = cam.bottom + h*P_SZ; cam.near = -z1 - 1; cam.far = -z0 + 1; cam.updateProjectionMatrix();
  const rt = job.rtId; rt.viewport.set(0, 0, w, h); rt.scissor.set(0, 0, w, h);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(job.scn, cam);
  NV_SCATTER_MAT.uniforms.uId.value = rt.texture; NV_SCATTER_MAT.uniforms.uW.value = w; NV_SCATTER_MAT.uniforms.uAW.value = job.AW; NV_SCATTER_MAT.uniforms.uAH.value = job.AH;
  const sc = nvScatterMesh(w*h); const ac = job.acc; ac.viewport.set(0, 0, job.AW, job.AH);
  renderer.setRenderTarget(ac); renderer.render(sc, cam);
}
function nvGuard(fn){   // the renderer's state before and after
  const rt = renderer.getRenderTarget(), cc = new THREE.Color(), ca = renderer.getClearAlpha(), ac = renderer.autoClear; renderer.getClearColor(cc);
  renderer.autoClear = false;
  try { return fn(); } finally { renderer.setRenderTarget(rt); renderer.setClearColor(cc, ca); renderer.autoClear = ac; }
}
function nvFinish(job){
  const buf = new Uint8Array(job.AW*job.AH*4);
  nvGuard(() => renderer.readRenderTargetPixels(job.acc, 0, 0, job.AW, job.AH, buf));
  const never = new Uint8Array(job.T); let n = 0;
  for (let t = 0; t < job.T; t++){ const i = (t + 1)*4; if (!buf[i] && !job.tie[t]){ never[t] = 1; n++; } }
  job.never = never; job.nNever = n;
  nvFree(job); return never;
}
function nvFree(job){ if (job.ig) job.ig.dispose(); if (job.rtId) job.rtId.dispose(); if (job.acc) job.acc.dispose(); job.ig = job.rtId = job.acc = null; }
// ---- the layout again with some triangles moved to H (the order inside each list stays as it was, so the sizes stay sorted). Done for the plot's own order and for its second one (sideLayoutGen's far),
// a triangle being the same one by its three corners. ----
const nvKey = (a, b, c) => a < b ? (b < c ? a + '|' + b + '|' + c : (a < c ? a + '|' + c + '|' + b : c + '|' + a + '|' + b)) : (a < c ? b + '|' + a + '|' + c : (b < c ? b + '|' + c + '|' + a : c + '|' + b + '|' + a));
function nvRelayoutOne(g, I, cut, hide){
  const P = g.attributes.position.array, far = !!cut.offT;
  const edge = k => { const a = I[k]*3, b = I[k + 1]*3, c = I[k + 2]*3; return Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]), Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2])); };
  const Al = [], Hl = [], Sl = Array.from({ length: SIDE_K }, () => []), Tl = Array.from({ length: SIDE_K }, () => []), cls = new Int32Array(cut.cls.length);
  for (let k = cut.A; k < cut.A + cut.H; k++) Hl.push(I[k]);
  const take = (from, to, dst, row) => { const E = [];
    for (let k = from; k < to; k += 3){ if (hide.has(nvKey(I[k], I[k + 1], I[k + 2]))){ Hl.push(I[k], I[k + 1], I[k + 2]); continue; } dst.push(I[k], I[k + 1], I[k + 2]); E.push(edge(k)); }
    for (let q = 0; q < SMALL_N; q++){ let n = 0; while (n < E.length && E[n] >= SMALL_E[q]) n++; cls[row*SMALL_N + q] = n*3; } };
  take(0, cut.A, Al, 0);
  const sb = cut.A + cut.H;
  for (let j = 0; j < SIDE_K; j++) take(sb + cut.off[j], sb + cut.off[j + 1], Sl[j], 1 + j);
  if (far){ const tb = sb + cut.off[SIDE_K]; for (let j = 0; j < SIDE_K; j++) take(tb + cut.offT[j], tb + cut.offT[j + 1], Tl[j], 1 + SIDE_K + j); }
  const off = [0]; for (const l of Sl) off.push(off[off.length - 1] + l.length);
  const offT = [0]; for (const l of Tl) offT.push(offT[offT.length - 1] + l.length);
  const nS = off[SIDE_K], nT = far ? offT[SIDE_K] : 0, nD = off[SIDE_K/2], nDT = far ? offT[SIDE_K/2] : 0, n = Al.length + Hl.length + nS + nT + nD + nDT, ix = P.length/3 > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let k = 0; for (const v of Al) ix[k++] = v; for (const v of Hl) ix[k++] = v; for (const l of Sl) for (const v of l) ix[k++] = v; if (far) for (const l of Tl) for (const v of l) ix[k++] = v;
  for (let j = 0; j < SIDE_K/2; j++) for (const v of Sl[j]) ix[k++] = v;
  if (far) for (let j = 0; j < SIDE_K/2; j++) for (const v of Tl[j]) ix[k++] = v;
  return { ix, cut: far ? { A: Al.length, H: Hl.length, S: nS + nT, off, offT, cls, far: true } : { A: Al.length, H: Hl.length, S: nS, off, cls } };
}
function nvApply(c, g, tri, never){
  const I = g.index.array, hide = new Set(); for (let t = 0; t < tri.length; t++) if (never[t]){ const k = tri[t]; hide.add(nvKey(I[k], I[k + 1], I[k + 2])); }
  const L = nvRelayoutOne(g, I, g.userData.cut, hide), F = g.userData.far ? nvRelayoutOne(g, g.userData.far.ix, g.userData.far.cut, hide) : null;
  if (!g.userData.nvOrig) g.userData.nvOrig = { index: g.index, cut: g.userData.cut, far: g.userData.far };
  g.userData.nvNew = { index: new THREE.BufferAttribute(L.ix, 1), cut: L.cut, far: F };
  c._nvGeo = g; NV.stats.plots++; NV.stats.removed += never.reduce((a, b) => a + b, 0); NV.stats.drawn += tri.length;
  nvSwap(g, !NV.keep()); markSolid(c);
}
function nvSwap(g, removed){   // which of the two layouts the plot's geometry holds
  const o = g.userData.nvOrig, n = g.userData.nvNew; if (!o || !n) return; const want = removed ? n : o;
  if (g.index === want.index) return;
  g.setIndex(want.index); g.userData.cut = want.cut; if (want.far) g.userData.far = want.far; else delete g.userData.far; g.setDrawRange(0, cutRest(want.cut)); g.userData.nvOn = removed;
}
// ---- the result kept between sessions: IndexedDB, one entry per plot signature (a bit for each drawn triangle) ----
function nvDbOpen(){
  try { const rq = indexedDB.open('neonTerrariumNeverSeen', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('p');
    rq.onsuccess = () => { NV.db = rq.result; const all = NV.db.transaction('p').objectStore('p'), keys = all.getAllKeys(), vals = all.getAll();
      vals.onsuccess = () => { try { const K = keys.result, V = vals.result; for (let i = 0; i < K.length; i++) NV.store.set(K[i], V[i]); } catch (e) {} NV.dbReady = true; };
      vals.onerror = () => { NV.dbReady = true; }; };
    rq.onerror = () => { NV.dbReady = true; }; } catch (e) { NV.dbReady = true; }
}
function nvDbPut(sig, never){
  const bits = new Uint8Array((never.length + 7) >> 3); for (let t = 0; t < never.length; t++) if (never[t]) bits[t >> 3] |= 1 << (t & 7);
  NV.store.set(sig, bits); if (NV.db) try { NV.db.transaction('p', 'readwrite').objectStore('p').put(bits, sig); } catch (e) {}
}
const nvFromBits = (bits, T) => { const never = new Uint8Array(T); for (let t = 0; t < T; t++) if (bits[t >> 3] & (1 << (t & 7))) never[t] = 1; return never; };
if (!window.__NV_OFF) nvDbOpen(); else NV.dbReady = true;
// ---- the scheduler: once a frame, from main.js, after the regions are merged ----
let _nvScan = 0, _nvCells = [], _nvCellsStamp = -1;
function nvNeeds(c){ if (c.mega || !c.data || c.lift) return null; const g = c.data.geo.get(ATLAS); if (!g || !g.userData.cut || c._nvGeo === g || c.animating) return null; return g; }
function nvTick(){
  if (NV.off()) return;
  if (window.__NV_CFG && !NV.cfgSet){ NV.cfgSet = true; Object.assign(NV, window.__NV_CFG); }   // (tests: a small view set)
  { const now = performance.now(), dt = now - (NV.lastT || now); NV.lastT = now;   // (views a frame: more while the frames are short, back to one when they are not)
    NV.vf = Math.max(1, Math.min(8, dt < 18 ? (NV.vf || 1) + .05 : (NV.vf || 1)*.7)); NV.views = window.__NV_VIEWS || Math.floor(NV.vf); }
  // the test's switch: every plot with a result holds the layout the test wants
  const keep = NV.keep(); if (keep !== NV.lastKeep){ NV.lastKeep = keep; for (const c of cells.values()){ const g = c.data && c.data.geo.get(ATLAS); if (g && g.userData.nvNew){ nvSwap(g, !keep); markSolid(c); } } }
  const key = yaw.toFixed(4) + zoom.toFixed(3) + PITCH.toFixed(4) + camT.x.toFixed(2) + camT.z.toFixed(2);
  if (key === NV.last) NV.still++; else { NV.still = 0; NV.last = key; }
  if (!NV.dbReady) return;
  if (!NV.job){
    if (_nvCellsStamp !== SC_EDITS || _nvCells.length !== cells.size){ _nvCells = [...cells.values()]; _nvCellsStamp = SC_EDITS; _nvScan = 0; }
    for (let n = 0; n < 40 && _nvScan < _nvCells.length; n++, _nvScan++){ const c = _nvCells[_nvScan], g = nvNeeds(c); if (!g) continue;
      if (!NV.queue.includes(c)) NV.queue.push(c); }
    if (_nvScan >= _nvCells.length) _nvScan = 0;
  }
  const idle = NV.still >= 30 && SYNC_Q === null && !anims.length && !solidDirty.size && !document.hidden;
  if (!NV.job){
    if (NV.queue.length > 1 && idle) NV.queue.sort((a, b) => Math.hypot(a.x - camT.x, a.z - camT.z) - Math.hypot(b.x - camT.x, b.z - camT.z));   // (the plots nearest the view first)
    while (NV.queue.length){ const c = NV.queue.shift(), g = nvNeeds(c); if (!g) continue;
      const tri = nvTriangles(g), sig = nvSig(g, tri), bits = NV.store.get(sig);
      if (bits){ nvApply(c, g, tri, nvFromBits(bits, tri.length)); NV.stats.fromStore++; break; }   // (one plot a frame)
      if (!idle || window.__NV_NO_COMPUTE) { NV.queue.unshift(c); break; }
      NV.job = nvStart(c); break; }
  }
  const job = NV.job; if (!job || !idle) return;
  const t0 = performance.now();
  if (job.phase === 'build'){ const to = Math.min(job.T, job.k + 4000); job.build(job.k, to); job.k = to; if (job.k >= job.T){ job.phase = 'ties'; job.k = 0; } return; }
  if (job.phase === 'ties'){ const to = Math.min(job.T, job.k + 800); nvTies(job, job.k, to); job.k = to; if (job.k >= job.T){ job.phase = 'views'; nvGuard(() => { nvPrepGpu(job); renderer.setRenderTarget(job.acc); renderer.setClearColor(0x000000, 0); renderer.clear(); }); } return; }
  if (job.phase === 'views'){
    if (!job.c.data || job.c.data.geo.get(ATLAS) !== job.g){ nvFree(job); NV.job = null; return; }   // (the plot was rebuilt meanwhile)
    nvGuard(() => { for (let n = 0; n < NV.views && job.vi < job.views.length; n++, job.vi++){ const v = job.views[job.vi]; nvView(job, v[0], v[1], v[2], NV.px); NV.stats.views++; } });
    if (job.vi >= job.views.length){ const never = nvFinish(job); nvDbPut(job.sig, never); nvApply(job.c, job.g, job.tri, never); NV.job = null; }
  }
}
// for tools: the whole job for one plot at once (cfg: options to compare with, e.g. a denser view set)
NV.prepared = (c, cfg) => { const job = nvStart(c); job.build(0, job.T); nvTies(job, 0, job.T); const save = { yaws: NV.yaws, np: NV.np, jits: NV.jits, px: NV.px, yawOff: NV.yawOff }; if (cfg) Object.assign(NV, cfg);
  try { nvGuard(() => nvPrepGpu(job)); } finally { Object.assign(NV, save); } job.px = cfg && cfg.px || NV.px; return job; };
NV.runSync = (c, cfg) => {
  const job = NV.prepared(c, cfg), g = job.g;
  nvGuard(() => { renderer.setRenderTarget(job.acc); renderer.setClearColor(0x000000, 0); renderer.clear(); for (const v of job.views) nvView(job, v[0], v[1], v[2], job.px); });
  const never = nvFinish(job); return { never, tri: job.tri, tie: job.tie, T: job.T, job, g };
};
