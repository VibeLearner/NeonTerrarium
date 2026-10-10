// Neon Terrarium: baked far buildings (round 10). Zoomed out, a block is drawn with each plot as a shell of a few boxes wearing textures baked from the real plot, instead of the stand-in
// (the plot without its small pieces). The shell is drawn with the buildings' own toon lighting reading the textures instead of vertex attributes, so sun, sky light, shadows, the evening
// switch-on of the windows and the grade keep working; the fragment shader marches the view ray into the baked depth (relief mapping), so frames, sills and balconies keep their parallax.
// Per texel, three RGBA maps: A (the vertex color, and the depth below the slab's outer boundary), E (the emissive color, and its kind), N (the normal as a byte per axis, and the window's
// switch-on threshold). Flickering and blinking pieces are baked switched off and drawn live over the shell by the glow overlay, as the real ones are; so are the windows near their switch-on.
// What sticks out of the shell by more than 0.3 (and what the shell builder, shell.js, does not cover) stays real geometry, merged into the block like the stand-in's pieces.
// The pieces here: the baker (BAKE.baker, for bakejob.js: the plot made again with its shell by the plot worker, drawn face by face from outside into three maps, filled and packed), the pool (pages of
// maps on the card, a slot per plot), the block's shell meshes (bkBlock, called by rebuildSolidGen in world.js when a block's tier is 'baked'), and the setting (S.baked: "Baked far buildings").
const BK = { maxPages: window.__BAKED_PAGES || 10, shellOpts: window.__BAKED_SHELL || {}, keepLights: !window.__BAKED_NOLIGHTS, wholePiece: 700, margin: .8, tpu: 0, out: .3, inn: .7, steps: { value: 32 }, PAGE: 2048, SLOT_W: 1024, pages: [], stats: { baked: 0, ms: 0, keptTris: 0, ovlTris: 0, shellTris: 0, texels: 0, holes: 0, area: 0, worker: 0, ph: {} }, test: {} };
BK.on = () => (S.baked === true || !!window.__BAKED_ON) && !window.__BAKED_OFF && TIER.on() && RENDER_LINES !== 0;   // (a test page turns it on with __BAKED_ON; the setting is the render menu's box. Not in the Smooth render mode: its pixels are the screen's own, finer than any bake made here: the stand-ins stay)
const bkNow2 = () => window.__realNow ? window.__realNow() : performance.now();
const bkPh = (name, t0) => { const t = bkNow2(); BK.stats.ph[name] = (BK.stats.ph[name] || 0) + t - t0; return t; };   // (time by phase of the baker's own steps: the card's work (face, read) is a software renderer's in the test pages, so it is kept apart)
const BK_ATTRS = ['position', 'normal', 'color', 'aEm', 'aFlk', 'aFine', 'aOn'];
// ---- the baker ----
const BK_FACE_MAT = new THREE.ShaderMaterial({
  uniforms: { uPass: { value: 0 }, uSlab: { value: 1 } },
  vertexShader: `uniform int uPass; attribute vec3 color; attribute vec4 aEm; attribute float aOn; attribute float aFlk; varying vec4 vA; varying float vD;
    void main(){
      if (uPass == 0) vA = vec4(color, 1.0);
      else if (uPass == 1){ int ek = int(aEm.a*255.0 + .5); bool live = aFlk > 0.5 || ek == 6; vA = vec4(aEm.rgb, live ? 0.0 : float(ek)/255.0); }
      else vA = vec4(normal.xyz*127.0/255.0 + 127.0/255.0, aOn);   // (the normal is a byte per axis, exact for the buildings' own int8 normals)
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: 'uniform int uPass; uniform float uSlab; varying vec4 vA; varying float vD; void main(){ gl_FragColor = uPass == 0 ? vec4(vA.rgb, (clamp(vD/uSlab, 0.0, 1.0)*254.0 + 1.0)/255.0) : vA; }',
  side: THREE.DoubleSide, blending: THREE.NoBlending,
});
const bkCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), bkScene = new THREE.Scene(); bkScene.userData.always = true;   // (always: the test harness skips most draws; a bake is work a skipped frame still has to do)
// the shell builder's faces as bake faces: u across the picture, v up it (walls: along the wall and up; roofs: x and z)
function bkFaces(sf){
  return sf.map(f => { const o = f.ax === 0 ? { u: 2, v: 1, u0: f.b0, u1: f.b1, v0: f.a0, v1: f.a1 } : f.ax === 1 ? { u: 0, v: 2, u0: f.b0, u1: f.b1, v0: f.a0, v1: f.a1 } : { u: 0, v: 1, u0: f.a0, u1: f.a1, v0: f.b0, v1: f.b1 };
    return { a: f.ax, s: f.dir, plane: f.c, u: o.u, v: o.v, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 }; });
}
function bkPackFaces(faces, W){ let x = 0, y = 0, rowH = 0; const order = faces.slice().sort((p, q) => q.h - p.h);
  for (const f of order){ if (x + f.w + 2 > W){ x = 0; y += rowH + 2; rowH = 0; } f.ax = x + 1; f.ay = y + 1; x += f.w + 2; rowH = Math.max(rowH, f.h); }
  return y + rowH + 2; }
// the new geometry of some triangles of g (compact: only the corners they use), as typed arrays that can be stored
function bkCompact(g, ix){
  const n = ix.length; if (!n) return null;
  const map = new Map(), src = [], idx = new Array(n);
  for (let q = 0; q < n; q++){ const v = ix[q]; let r = map.get(v); if (r === undefined){ r = src.length; map.set(v, r); src.push(v); } idx[q] = r; }
  const out = { idx: src.length > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), n: src.length };
  for (const k of BK_ATTRS){ const a = g.attributes[k], s = a.itemSize, arr = new a.array.constructor(src.length*s); for (let i = 0; i < src.length; i++) for (let c = 0; c < s; c++) arr[i*s + c] = a.array[src[i]*s + c]; out[k] = arr; }
  return out;
}
function bkGeoOf(pk){   // (the flags of each attribute are the atlas geometry's: names, sizes, normalized: a merge needs them equal)
  if (!pk) return null;
  const g = new THREE.BufferGeometry(), F = { position: [3, false], normal: [4, true], color: [3, true], aEm: [4, true], aFlk: [1, false], aFine: [1, false], aOn: [1, true] };
  for (const k of BK_ATTRS) g.setAttribute(k, new THREE.BufferAttribute(pk[k], F[k][0], F[k][1]));
  g.setIndex(new THREE.BufferAttribute(pk.idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
// one baker step per face (and per few faces for the fill); the plot comes from the worker with its shell, or is made here when there is no worker (the test pages)
BAKE.baker = function*(c, ctx){
  const t00 = bkNow2(); let tw = 0, tm = t00;
  const r = Object.assign({}, c.data.rec.r, { draws: c.data.rec.draws });
  let g, sh;
  if (RW.usable()){
    const tq = bkNow2(), job = RW.shell(r, BK.shellOpts);
    while (!job.done) yield 'wait';
    if (job.fail) throw new Error(job.fail);
    tw = bkNow2() - tq; BK.stats.worker += tw; tm = bkNow2();
    const nd = recipeUnpack(job.res.msg).data; g = nd.geo.get(ATLAS); sh = job.res.shell;
  } else {
    const prev = stageCap(); let nd; try { nd = recipeGen(r, recipeWorld()).data; } finally { stageApply(prev); }
    g = nd.geo.get(ATLAS); if (g && g.index) sh = Shell.build([Shell.atlasParts(g.attributes.position.array, g.index.array, g.userData.cut)], BK.shellOpts);
    tm = bkPh('made', tm); yield 'made'; tm = bkNow2();
  }
  if (!g || !g.index || !sh || !sh.faces.length) return { tex: {}, meta: { empty: true, ms: 0, fmt: 2 } };
  const part = Shell.atlasParts(g.attributes.position.array, g.index.array, g.userData.cut), I = part.i, A = g.attributes;
  const keepSet = new Set(sh.keep[0]), bakeIx = [], keepIx = [], ovlIx = [];
  // the lights that are not windows (bulbs, neon, other glow) stay real: a tube a tenth of a unit wide is a texel and a half, which a picture makes fat, blurred and too bright
  if (BK.keepLights){ const E = A.aEm.array; for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const k = E[I[t*3]*4 + 3]; if (k === 2 || k === 3 || k === 5) keepSet.add(t); } }
  // a small piece (the triangles that share corners) with a part kept stays real whole: half a rooftop unit painted on the roof and half standing on it reads as a different object
  if (keepSet.size){
    const nv = A.position.count, par = new Int32Array(nv); for (let v = 0; v < nv; v++) par[v] = v;
    const find = v => { while (par[v] !== v){ par[v] = par[par[v]]; v = par[v]; } return v; };
    for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const q = t*3, r0 = find(I[q]), r1 = find(I[q + 1]), r2 = find(I[q + 2]); if (r0 !== r1) par[r1] = r0; const r3 = find(I[q + 1]); if (find(I[q + 2]) !== r3) par[find(I[q + 2])] = r3; }
    const size = new Map(), kept = new Set();
    for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const r = find(I[t*3]); size.set(r, (size.get(r) || 0) + 1); if (keepSet.has(t)) kept.add(r); }
    for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const r = find(I[t*3]); if (kept.has(r) && size.get(r) <= BK.wholePiece) keepSet.add(t); }
    tm = bkPh('pieces', tm); yield 'pieces'; tm = bkNow2();
  }
  const ek = A.aEm.array, fl = A.aFlk.array;
  for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const q = t*3, i0 = I[q], i1 = I[q + 1], i2 = I[q + 2];
    if (keepSet.has(t)){ keepIx.push(i0, i1, i2); continue; }
    bakeIx.push(i0, i1, i2);
    const k0 = ek[i0*4 + 3]; if (fl[i0] || fl[i1] || fl[i2] || k0 === 6 || ek[i1*4 + 3] === 6 || ek[i2*4 + 3] === 6 || (k0 >= 1 && k0 <= 4)) ovlIx.push(i0, i1, i2); }
  tm = bkPh('sorted', tm); yield 'sorted'; tm = bkNow2();
  const faces = bkFaces(sh.faces);
  for (const f of faces){ f.w = Math.max(2, Math.ceil((f.u1 - f.u0)*BK.tpu)); f.h = Math.max(2, Math.ceil((f.v1 - f.v0)*BK.tpu)); }
  const W = BK.SLOT_W, Hh = bkPackFaces(faces, W);
  const bg = new THREE.BufferGeometry(); for (const k in A) bg.setAttribute(k, A[k]); bg.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(bakeIx) : new Uint16Array(bakeIx), 1));
  const mesh = new THREE.Mesh(bg, BK_FACE_MAT); mesh.frustumCulled = false; bkScene.add(mesh);
  const rts = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(W, Hh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false }));
  try {
    for (const f of faces){
      const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha(), pac = renderer.autoClear;
      renderer.autoClear = false; renderer.setClearColor(0x000000, 0);
      const cu = (f.u0 + f.u1)/2, cv = (f.v0 + f.v1)/2, p = [0, 0, 0]; p[f.a] = f.plane + f.s*BK.out; p[f.u] = cu; p[f.v] = cv;
      const cam = bkCam; cam.left = -(f.u1 - f.u0)/2; cam.right = (f.u1 - f.u0)/2; cam.top = (f.v1 - f.v0)/2; cam.bottom = -(f.v1 - f.v0)/2; cam.near = 0; cam.far = BK.out + BK.inn; cam.updateProjectionMatrix();
      cam.position.set(p[0], p[1], p[2]); const tg = p.slice(); tg[f.a] -= f.s; cam.up.set(0, f.a === 1 ? 0 : 1, f.a === 1 ? -1 : 0); cam.lookAt(tg[0], tg[1], tg[2]); cam.updateMatrixWorld();
      const ru = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), rv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), du = [0, 0, 0], dv = [0, 0, 0]; du[f.u] = 1; dv[f.v] = 1;
      f.flipU = ru.x*du[0] + ru.y*du[1] + ru.z*du[2] < 0; f.flipV = rv.x*dv[0] + rv.y*dv[1] + rv.z*dv[2] < 0;
      rts.forEach((rt, pass) => { rt.viewport.set(f.ax, f.ay, f.w, f.h); rt.scissor.set(f.ax, f.ay, f.w, f.h); rt.scissorTest = true; renderer.setRenderTarget(rt); renderer.clear(true, true, false); BK_FACE_MAT.uniforms.uPass.value = pass; BK_FACE_MAT.uniforms.uSlab.value = BK.out + BK.inn; renderer.render(bkScene, cam); });
      renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa); renderer.autoClear = pac;
      tm = bkPh('face', tm); yield 'face'; tm = bkNow2();
    }
    for (const rt of rts) rt.scissorTest = false;
    // back to the page, a map a step (a read is a wait for the card; a few milliseconds each)
    const bufs = [];
    for (const rt of rts){ const b = new Uint8Array(W*Hh*4); renderer.readRenderTargetPixels(rt, 0, 0, W, Hh, b); bufs.push(b); tm = bkPh('read', tm); yield 'read'; tm = bkNow2(); }
    // what no ray of the slab found at (a texel of a face the building does not fill) takes its neighbor's: face by face
    let holes = 0, area = 0, n = 0;
    for (const f of faces){
      for (let it = 0; it < 8; it++){
        let left = 0; const Ab = bufs[0], mark = [];
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++){ const q = ((f.ay + y)*W + f.ax + x)*4; if (Ab[q + 3]) continue;
          let s = -1; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]){ const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= f.w || Y >= f.h) continue; const o = ((f.ay + Y)*W + f.ax + X)*4; if (Ab[o + 3]){ s = o; break; } }
          if (s >= 0) mark.push(q, s); else left++; }
        if (it === 0) holes += mark.length/2 + left;
        for (let m = 0; m < mark.length; m += 2) for (const b of bufs){ for (let k = 0; k < 4; k++) b[mark[m] + k] = b[mark[m + 1] + k]; }
        if (!mark.length) break;
      }
      area += f.w*f.h; if (++n % 12 === 0) tm = bkPh('fill', tm); yield 'fill'; tm = bkNow2();
    }
    tm = bkNow2(); const kp = bkCompact(g, keepIx), op = bkCompact(g, ovlIx), tex = { a: bufs[0], e: bufs[1], n: bufs[2] };
    for (const k of ['keep', 'ovl']){ const pk = k === 'keep' ? kp : op; if (pk){ for (const a of BK_ATTRS) tex[k + '_' + a] = pk[a]; tex[k + '_idx'] = pk.idx; } }
    bkPh('compact', tm); const ms = bkNow2() - t00;
    BK.stats.baked++; BK.stats.ms += ms; BK.stats.keptTris += keepIx.length/3; BK.stats.ovlTris += ovlIx.length/3; BK.stats.shellTris += faces.length*2; BK.stats.texels += W*Hh; BK.stats.holes += holes; BK.stats.area += area;
    return { tex, meta: { fmt: 2, W, H: Hh, faces: faces.map(f => ({ a: f.a, s: f.s, plane: f.plane, u: f.u, v: f.v, u0: f.u0, u1: f.u1, v0: f.v0, v1: f.v1, ax: f.ax, ay: f.ay, w: f.w, h: f.h, flipU: f.flipU, flipV: f.flipV })), keepN: keepIx.length/3, ovlN: ovlIx.length/3, shellTris: faces.length*2, holes, area, boxes: sh.boxes.length, ms, msWorker: tw } };
  } finally {
    bkScene.remove(mesh); bg.dispose(); for (const rt of rts) rt.dispose();
  }
};
BAKE.density = 't0'; BAKE.bakerTag = 'r1';
// Texels a unit: one for each screen pixel at the swap zoom (TIER.zs), from the render resolution as it is now: the lines the render setting asks for, grown by the zoom-out factor (applyRenderRes, up to its cap), no more than the screen has;
// the pixels a unit then are lines / (2 * zoom). A 1080-line screen: 18 at the 480 setting, 22.5 at 720; a 720-line screen: 12 and 15; at most 24 (the 720 setting on a tall screen), at least 10. The bake and its store entry carry the number.
function bkWantTpu(){
  if (window.__BAKED_TPU) return window.__BAKED_TPU;
  const f = Math.min(Math.max(1, TIER.zs/ZOOM_REF), S.capRes !== false ? PERF.max : Infinity), h = Math.min(DH, Math.round(BASE_H*f));
  return Math.max(10, Math.min(24, Math.ceil(h/(2*TIER.zs))));
}
// the density changes with the render setting and the window: what was baked at another density is dropped (the store keeps it under its own tag) and baked again
function bkDensity(){
  const want = bkWantTpu(); if (want === BK.tpu) return;
  const first = BK.tpu === 0; BK.tpu = want; BAKE.density = 't' + want;
  if (!first) for (const e of [...BAKE.ents.values()]) BAKE.drop(e.c);
}
// the budget: pages of maps on the card (48 MB each). Plots are baked nearest the view first; once the pages are full no more are baked (what is baked stays), and a block with a plot that has no bake keeps the stand-in
BK.full = () => BK.pages.length >= BK.maxPages && !BK.pages.some(p => p.shelves.some(sh => sh.free.length));
BAKE.skip = c => { if (c.mega || !BK.on()) return true; if (!BK.full()) return false; const e = BAKE.ents.get(c.i + ',' + c.j); return !(e && e.c === c && (e.state === 'ready' || e.state === 'baking')); };
// ---- the pool: pages of three maps on the card; a slot (BK.SLOT_W wide, a height class tall) for each baked plot ----
function bkPage(){
  const mk = () => { const rt = new THREE.WebGLRenderTarget(BK.PAGE, BK.PAGE, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false }); rt.texture.generateMipmaps = false; return rt; };
  const p = { id: BK.pages.length, rts: [mk(), mk(), mk()], shelves: [], nextY: 0, mat: null, plots: 0 }; BK.pages.push(p); return p;
}
function bkAlloc(H){
  const hc = Math.ceil(H/32)*32;
  for (const p of BK.pages) for (const sh of p.shelves) if (sh.h === hc){ const i = sh.free.length ? sh.free.pop() : (sh.n < BK.PAGE/BK.SLOT_W ? sh.n++ : -1); if (i >= 0){ p.plots++; return { page: p, shelf: sh, x: i*BK.SLOT_W, y: sh.y, H: hc, i }; } }
  for (const p of BK.pages) if (p.nextY + hc <= BK.PAGE){ const sh = { y: p.nextY, h: hc, free: [], n: 1 }; p.nextY += hc; p.shelves.push(sh); p.plots++; return { page: p, shelf: sh, x: 0, y: sh.y, H: hc, i: 0 }; }
  const p = bkPage(), sh = { y: 0, h: hc, free: [], n: 1 }; p.nextY = hc; p.shelves.push(sh); p.plots++; return { page: p, shelf: sh, x: 0, y: 0, H: hc, i: 0 };
}
function bkFree(slot){ slot.shelf.free.push(slot.i); slot.page.plots--; }
const bkBlitScene = new THREE.Scene(), bkBlitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bkBlitMat = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending });
bkBlitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bkBlitMat)); bkBlitScene.userData.always = true;
function bkUpload(slot, bufs, W, H){
  const prev = renderer.getRenderTarget(), pac = renderer.autoClear; renderer.autoClear = false;
  for (let i = 0; i < 3; i++){
    const t = new THREE.DataTexture(bufs[i], W, H, THREE.RGBAFormat, THREE.UnsignedByteType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    const rt = slot.page.rts[i]; rt.viewport.set(slot.x, slot.y, W, H); rt.scissor.set(slot.x, slot.y, W, H); rt.scissorTest = true;
    bkBlitMat.uniforms.t.value = t; renderer.setRenderTarget(rt); renderer.render(bkBlitScene, bkBlitCam); rt.scissorTest = false; t.dispose();
  }
  renderer.setRenderTarget(prev); renderer.autoClear = pac;
}
// ---- BAKE's callbacks: a bake that is ready goes onto the card (its maps leave the page's memory: the store keeps them), a bake that is dropped gives its slot back ----
BAKE.onReady = (c, bake) => {
  if (bake.slot || bake.empty){ bake.refs++; return; }   // (a second plot holding the same bake)
  const m = bake.meta, tx = bake.tex || {};
  if (m.empty || !tx.a) return { tex: null, meta: m, sig: bake.sig, slot: null, keep: null, ovl: null, refs: 1, empty: true };
  const slot = bkAlloc(m.H); bkUpload(slot, [tx.a, tx.e, tx.n], m.W, m.H);
  const pk = k => tx[k + '_idx'] ? Object.assign({ idx: tx[k + '_idx'] }, ...BK_ATTRS.map(a => ({ [a]: tx[k + '_' + a] }))) : null;
  return { tex: null, meta: m, sig: bake.sig, slot, keep: bkGeoOf(pk('keep')), ovl: bkGeoOf(pk('ovl')), refs: 1 };
};
BAKE.onDrop = (c, bake) => {
  if (!bake || !bake.slot) return;
  if (--bake.refs > 0) return;
  bkFree(bake.slot); bake.slot = null; if (bake.keep) bake.keep.dispose(); if (bake.ovl) bake.ovl.dispose();
};
// ---- drawing a block: the shell meshes (one per page of maps the block's plots are on), and the overlay of what was baked switched off ----
const BK_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
BK_DEPTH.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aO; attribute vec3 aU; attribute vec3 aV;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 d = position - aO; float lu = clamp(dot(d, aU)/dot(aU, aU), 0.0, 1.0), lv = clamp(dot(d, aV)/dot(aV, aV), 0.0, 1.0); transformed = aO + lu*aU + lv*aV - normal*' + BK.out.toFixed(3) + '; }'); };   // (the shell is drawn at the slab's outer boundary and wider than the face; it casts its shadow from the wall, the face's own size)
BK_DEPTH.customProgramCacheKey = () => 'bkdepth';
function bkPageMaterial(p){
  if (p.mat) return p.mat;
  const m = ATLAS.clone(); m.vertexColors = false; m.customProgramCacheKey = () => 'baked'; m.userData.bkPage = p;
  m.onBeforeCompile = sh => {
    ATLAS.onBeforeCompile(sh);
    sh.uniforms.tA = { value: p.rts[0].texture }; sh.uniforms.tE = { value: p.rts[1].texture }; sh.uniforms.tN = { value: p.rts[2].texture }; sh.uniforms.uSlab = { value: BK.out + BK.inn }; sh.uniforms.uSteps = BK.steps;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aO; attribute vec3 aU; attribute vec3 aV; attribute vec4 aR; varying vec3 vO; varying vec3 vU; varying vec3 vV; varying vec4 vR; varying vec3 vP; varying vec3 vNo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvO = aO; vU = aU; vV = aV; vR = aR; vP = (modelMatrix*vec4(transformed, 1.0)).xyz; vNo = normal;')
      .replace(/int ek = int\(aEm\.a\*255\.0 \+ \.5\);[^\n]*\n[^\n]*\n/, 'vEmis = vec3(0.0);\n')
      .replace(LOD_CULL_GLSL, '');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tA; uniform sampler2D tE; uniform sampler2D tN; uniform float uSlab; uniform int uSteps; uniform mat4 projectionMatrix; varying vec3 vO; varying vec3 vU; varying vec3 vV; varying vec4 vR; varying vec3 vP; varying vec3 vNo; uniform float emI[7]; uniform float lightsOn; uniform float fTime; vec3 bkN; vec2 bkUv;' + LIT_GLSL
        + '\nfloat bkDepth(vec2 l){ if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) return 2.0; vec4 t = texture2D(tA, vR.xy + l*vR.zw); return t.a < .001 ? 2.0 : (t.a*255.0 - 1.0)/254.0; }')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  vec3 bkD = normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2]));
  float bkUU = dot(vU, vU), bkVV = dot(vV, vV), bkDD = -dot(bkD, normalize(vNo));
  vec2 bkL0 = vec2(dot(vP - vO, vU)/bkUU, dot(vP - vO, vV)/bkVV), bkDL = vec2(dot(bkD, vU)/bkUU, dot(bkD, vV)/bkVV)*(uSlab/max(bkDD, .02));
  float bkS = -1.0, bkPrev = 0.0; bool bkAbove = false;
  for (int i = 0; i <= 64; i++){ if (i > uSteps) break; float si = float(i)/float(uSteps); vec2 l = bkL0 + bkDL*si; float dd = bkDepth(l);
    if (si >= dd){ if (bkAbove){ bkS = si; break; } }   // (a ray that comes into the face's rectangle from the side already below the surface hit nothing: the air beside the building)
    else { bkAbove = dd < 1.5; bkPrev = si; } }
  if (bkS < 0.0) discard;
  { float lo = bkPrev, hi = bkS; for (int k = 0; k < 5; k++){ float mid = (lo + hi)*.5; vec2 l = bkL0 + bkDL*mid; if (mid >= bkDepth(l)) hi = mid; else lo = mid; } bkS = hi; }
  bkUv = vR.xy + clamp(bkL0 + bkDL*bkS, 0.0, 1.0)*vR.zw;
  { vec3 ph = vP + bkD*(bkS*uSlab/max(bkDD, .02)); vec4 cc = projectionMatrix*viewMatrix*vec4(ph, 1.0); gl_FragDepth = cc.z/cc.w*.5 + .5; }`)
      .replace('#include <color_fragment>', 'vec4 bkA = texture2D(tA, bkUv); diffuseColor.rgb *= bkA.rgb;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( vNormal );', 'vec3 wN = (texture2D(tN, bkUv).rgb*255.0 - 127.0)/127.0; bkN = normalize((viewMatrix*vec4(wN, 0.0)).xyz); vec3 normal = bkN;'))
      .replace('totalEmissiveRadiance = vEmis;', `vec4 bkE = texture2D(tE, bkUv); int ek = int(bkE.a*255.0 + .5); vec3 bkEm = vec3(0.0);
        if (ek > 0){ float lon = ek <= 4 ? litOn(texture2D(tN, bkUv).a, lightsOn, fTime) : 1.0; bkEm = bkE.rgb*mix(ek == 1 ? .22*(1.0 - .6*lightsOn) : 0.0, emI[ek], lon); }
        totalEmissiveRadiance = bkEm;`)
      .replace('#include <dithering_fragment>', THREE.ShaderChunk.dithering_fragment.replace(/vNormal/g, 'bkN'));
  };
  return p.mat = m;
}
// the shell's faces of some plots on one page: the quads sit at the slab's outer boundary; each carries what the fragment shader needs (the face's origin and axes in the world, its rectangle in the page)
function bkShellGeo(items){
  const pos = [], nrm = [], ao = [], au = [], av = [], ar = [], ix = [], P = BK.PAGE, M = BK.margin;   // (M: the quad is drawn wider than the face: a ray that crosses the outer boundary beside the face can still hit the face's surface below)
  for (const { bake } of items){
    const sl = bake.slot;
    for (const f of bake.meta.faces){
      const k = pos.length/3, po = f.plane + f.s*BK.out, pt = (cu, cv) => { const q = [0, 0, 0]; q[f.a] = po; q[f.u] = cu; q[f.v] = cv; return q; };
      const ux0 = (sl.x + f.ax + .5)/P, ux1 = (sl.x + f.ax + f.w - .5)/P, uy0 = (sl.y + f.ay + .5)/P, uy1 = (sl.y + f.ay + f.h - .5)/P;
      const O = pt(f.flipU ? f.u1 : f.u0, f.flipV ? f.v1 : f.v0), U = [0, 0, 0], V = [0, 0, 0]; U[f.u] = (f.flipU ? -1 : 1)*(f.u1 - f.u0); V[f.v] = (f.flipV ? -1 : 1)*(f.v1 - f.v0);
      for (const [cu, cv] of [[f.u0 - M, f.v0 - M], [f.u1 + M, f.v0 - M], [f.u1 + M, f.v1 + M], [f.u0 - M, f.v1 + M]]){ pos.push(...pt(cu, cv)); const n = [0, 0, 0]; n[f.a] = f.s; nrm.push(...n); ao.push(...O); au.push(...U); av.push(...V); ar.push(ux0, uy0, ux1 - ux0, uy1 - uy0); }
      const p = i => [pos[(k + i)*3], pos[(k + i)*3 + 1], pos[(k + i)*3 + 2]], A = p(0), B = p(1), C = p(2);
      const cr = [(B[1] - A[1])*(C[2] - A[2]) - (B[2] - A[2])*(C[1] - A[1]), (B[2] - A[2])*(C[0] - A[0]) - (B[0] - A[0])*(C[2] - A[2]), (B[0] - A[0])*(C[1] - A[1]) - (B[1] - A[1])*(C[0] - A[0])];
      if (cr[f.a]*f.s > 0) ix.push(k, k + 1, k + 2, k, k + 2, k + 3); else ix.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aO', new THREE.Float32BufferAttribute(ao, 3)); geo.setAttribute('aU', new THREE.Float32BufferAttribute(au, 3)); geo.setAttribute('aV', new THREE.Float32BufferAttribute(av, 3)); geo.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 4));
  geo.setIndex(ix); geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo;
}
// a block's baked plots -> the meshes to add to its group: a shell per page; the overlay of the switch-on windows and flickering pieces is registered for the block (glowOverlay)
function bkBlock(key, items){
  const meshes = [], byPage = new Map();
  for (const it of items){ if (!it.bake.slot) continue; let l = byPage.get(it.bake.slot.page); if (!l) byPage.set(it.bake.slot.page, l = []); l.push(it); }
  for (const [page, l] of byPage){
    const geo = bkShellGeo(l), m = new THREE.Mesh(geo, bkPageMaterial(page));
    m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = BK_DEPTH; m.userData.own = true; m.userData.blockKey = key; m.userData.baked = true;
    dropCpuCopy(geo); meshes.push(m);
  }
  const ovs = items.map(it => it.bake.ovl).filter(Boolean);
  if (ovs.length){
    const og = ovs.length === 1 ? ovs[0].clone() : mergeIndexed(ovs);
    if (og){ og.computeBoundingSphere(); const pm = new THREE.Mesh(og, ATLAS); pm.layers.mask = 0; pm.receiveShadow = true; pm.userData.blockKey = key; pm.userData.own = true; pm.userData.noMerge = true; glowOverlay(pm); meshes.push(pm); }
  }
  return meshes;
}
// is every plot of a block that can be baked baked (so the block can be drawn from the shells): the plots that cannot (megastructures, no atlas) are ignored; at least one plot has a bake
function bkBlockReady(key){
  const [a, b] = key.split(',').map(Number); let n = 0;
  for (let i = a*MREG; i < a*MREG + MREG; i++) for (let j = b*MREG; j < b*MREG + MREG; j++){
    const c = cells.get(ckey(i, j)); if (!c || !c.data || !c.data.rec || !c.data.geo.get(ATLAS)) continue;
    if (c.mega || BAKE.off()) continue;
    const bk = BAKE.get(c); if (!bk) return false; if (!bk.empty) n++;
  }
  return n > 0;
}
BK.line = () => !BK.on() ? 'baked far: off' : BAKE.line() + '; ' + BK.pages.length + ' pages (' + (BK.pages.length*3*BK.PAGE*BK.PAGE*4/1048576).toFixed(0) + ' MB)';
// the setting off does nothing: no scan, no baking (the plots that were baked keep their bakes for a while, so switching back is quick; then the cards' pages are let go)
BAKE.off0 = BAKE.off; BAKE.off = () => BAKE.off0() || !BK.on();
BK.offFrame = 0;
BK.purge = () => { for (const e of [...BAKE.ents.values()]) BAKE.drop(e.c); for (const p of BK.pages) for (const rt of p.rts) rt.dispose(); BK.pages = []; };
function bkTick(){
  if (BK.on()){ BK.offFrame = PM.frame; if (BK.tpu === 0 || PM.frame % 30 === 0) bkDensity(); BAKE.tick(); return; }
  if (BK.pages.length && PM.frame - BK.offFrame > 3700) BK.purge();
}
