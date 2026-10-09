// Neon Terrarium: the static cache. The city's buildings, ground and other things that only change with the camera, the
// sun and the time-of-day lights (the "static" set: layer 5, see markStatic in world.js) are drawn into a target bigger than
// the view (a margin of SC.M render pixels all round); each frame the window of it that the view needs is copied into the
// color target (color, normals and depth, bit for bit) and only the live set (people, plants, vehicles, glow points,
// anything see-through or moving) is drawn on top. The camera is orthographic and moves in whole render pixels, so a pan is
// a shift of the window. Anything that isn't certain draws the frame the old way.
// (Modes, set for checking: 'reuse' (the default), 'every' (redrawn every frame), 'off', 'oldview', 'split'.)
const SC = {
  M: 256,                 // margin, in render pixels, on every side of the view
  mode: window.__SC_MODE || 'reuse',   // 'off' (the old path), 'oldview' (the old path, the view drawn as the cache is: for checking), 'every' (redrawn every frame: for checking the copy)
  rtS: null, rtSN: null, w: 0, h: 0,
  camS: new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR),
  state: 'off', why: '',  // what the overlay shows
};
const SC_LIVE_MASK = -1 & ~STATIC_BIT;
sun.layers.enable(5); hemi.layers.enable(5);   // (three only collects the lights the camera's layers can see: the static pass needs them)
// Pinning the camera along the view. In an orthographic view, moving the camera along its own direction changes nothing on
// screen, only every depth value (by the same amount). The cache is drawn with the camera at one place along the view (c0),
// so while it's in use the camera stays there however the player pans: depth then matches the cache's exactly. Everything
// that measures depth as a distance from the camera target is told the difference, dc (camDist in the composite). When
// the true place drifts 50 units from c0 the pin moves to it (and the cache, drawn at the old place, is out of date).
SC.c0 = null; SC.dc = 0;
SC.pin = function(cTrue){
  if (SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic || !MRT){ SC.c0 = null; SC.dc = 0; return cTrue; }
  if (SC.c0 === null || Math.abs(cTrue - SC.c0) > 50) SC.c0 = cTrue;
  SC.dc = cTrue - SC.c0; return SC.c0;
};
// the margin the card allows (the view plus the margin must fit a texture)
function scMargin(){
  const gl = renderer.getContext(), max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  let M = SC.M; while (M > 0 && (W + 2*M > max || H + 2*M > max)) M -= 32;
  SC.Muse = M >= 32 ? M : 0; if (!SC.Muse) SC.why = 'view larger than the card allows';
  return SC.Muse > 0;
}
// a pair of cache targets (color + depth, normals): the formats of the color and normal targets (sky.js makeTargets), so a copy is exact
function scMake(w, h){
  const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat };
  const rt = new THREE.WebGLRenderTarget(w, h, opt);
  rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  return { rt, rn: new THREE.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: false }, opt)) };
}
function scFree(p){ if (p){ p.rt.depthTexture.dispose(); p.rt.dispose(); p.rn.dispose(); } }
function scTargets(){
  if (!scMargin()) return false;
  const M = SC.Muse, w = W + 2*M, h = H + 2*M;
  if (SC.rtS && SC.w === w && SC.h === h) return true;
  scFree(SC.rtS && { rt: SC.rtS, rn: SC.rtSN }); scFree(SC.next); SC.next = null; SC.job = null;
  const a = scMake(w, h); SC.rtS = a.rt; SC.rtSN = a.rn; SC.w = w; SC.h = h; SC.ok = false;
  return true;
}
// the cache's camera: the view's, its frustum wider by M render pixels on every side
function scCamera(){
  const px = 2*zoom/H, asp = W/H, M = SC.Muse, c = SC.camS;
  c.left = -zoom*asp - M*px; c.right = zoom*asp + M*px; c.top = zoom + M*px; c.bottom = -zoom - M*px; c.updateProjectionMatrix();
  c.position.copy(cam.position); c.quaternion.copy(cam.quaternion); c.updateMatrixWorld();
}
// Drawing the view itself the same way the cache is drawn: with the cache camera's widened projection, and a viewport that
// starts M pixels left of and below the color target. Every vertex then comes out exactly where it does in the cache (just M
// pixels over), so the two rasterize alike pixel for pixel; with the view's own projection an edge that falls on a pixel
// centre can land either side of it. (Depth is the same either way: the near and far planes are the same.)
SC.drawView = function(fn, widen = true){   // (widen false: the frame is drawn the old way, with the view's own projection: the margin costs vertices and pixels and buys nothing)
  if (!widen || SC.mode === 'off' || PH.tests.noStatic || !MRT || !scMargin()){ fn(); return; }
  scCamera();
  const keep = cam.projectionMatrix.clone(), M = SC.Muse;
  cam.projectionMatrix.copy(SC.camS.projectionMatrix); rtC.viewport.set(-M, -M, W + 2*M, H + 2*M); renderer.setRenderTarget(rtC);   // (three reads a target's viewport when the target is set)
  FOL_UNI.res.value.set(W + 2*M, H + 2*M);   // (the plants' and people's shaders snap to whole pixels of 'res' and emit clip coordinates: they need the size of what is being drawn into)
  try { fn(); } finally { cam.projectionMatrix.copy(keep); rtC.viewport.set(0, 0, W, H); FOL_UNI.res.value.set(W, H); }
};
// The cache picture is a ring: absolute pixel column c (the camera's whole-pixel position, plus the pixel's place in the view) lives at
// texel (c - SC.ox) mod width, rows likewise, so a pan only needs the strip that comes into view drawn over the strip that has left.
// SC.R is the stretch of absolute columns and rows the picture holds right now; the view must lie inside it.
const scMod = (a, n) => ((a % n) + n) % n;
const scCol = px => px - (W >> 1), scRow = py => py - (H >> 1);   // (absolute column and row of the view's left and bottom edge for a camera at whole-pixel place px, py)
// pieces [source start, destination start, length] of a run of `len` absolute pixels starting at `a`, in a ring of size n with origin o
function scPieces(a, len, o, n){
  const t = scMod(a - o, n), w1 = Math.min(len, n - t);
  return w1 < len ? [[t, 0, w1], [0, w1, len - w1]] : [[t, 0, len]];
}
// The same copy by drawing a full-screen triangle that reads the three cache textures with texelFetch (ring addressing in the shader) and writes
// color, normals and depth (gl_FragDepth). Slower in principle than blitFramebuffer; here so the owner can tell whether the copy leaves the
// targets in a state that makes the composite slower (overlay test "copy by drawing").
let _cdMat = null, _cdScene = null;
function scCopyDraw(colL, rowB){
  if (!_cdMat){
    _cdMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, blending: THREE.NoBlending,
      uniforms: { tC: { value: null }, tN: { value: null }, tD: { value: null }, off: { value: new THREE.Vector2() }, size: { value: new THREE.Vector2() } },
      vertexShader: 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision highp float; precision highp int; precision highp sampler2D;
        uniform sampler2D tC; uniform sampler2D tN; uniform sampler2D tD; uniform vec2 off; uniform vec2 size;
        layout(location = 0) out highp vec4 oC; layout(location = 1) out highp vec4 oN;
        void main(){ ivec2 sz = ivec2(size), q = ivec2(gl_FragCoord.xy) + ivec2(off); q = ((q % sz) + sz) % sz;
          oC = texelFetch(tC, q, 0); oN = texelFetch(tN, q, 0); gl_FragDepth = texelFetch(tD, q, 0).r; }` });
    _cdMat.userData.mrt = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _cdMat); m.frustumCulled = false; _cdScene = new THREE.Scene(); _cdScene.add(m);
  }
  const u = _cdMat.uniforms; u.tC.value = SC.rtS.texture; u.tN.value = SC.rtSN.texture; u.tD.value = SC.rtS.depthTexture;
  u.off.value.set(scMod(colL - SC.ox, SC.w), scMod(rowB - SC.oy, SC.h)); u.size.value.set(SC.w, SC.h);
  renderer.render(_cdScene, compCam);
}
// copy the window of the cache that is the view (color, depth and normals) into the color target: up to four rectangles
function scBlit(colL, rowB){
  const gl = renderer.getContext();
  const fs = renderer.properties.get(SC.rtS).__webglFramebuffer, fc = renderer.properties.get(rtC).__webglFramebuffer;
  const xs = scPieces(colL, W, SC.ox, SC.w), ys = scPieces(rowB, H, SC.oy, SC.h);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fs); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fc);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  for (const [sx, dx, w] of xs) for (const [sy, dy, h] of ys) gl.blitFramebuffer(sx, sy, sx + w, sy + h, dx, dy, dx + w, dy + h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
  for (const [sx, dx, w] of xs) for (const [sy, dy, h] of ys) gl.blitFramebuffer(sx, sy, sx + w, sy + h, dx, dy, dx + w, dy + h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fc);   // (both bindings back to the color target, as three believes them to be)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
}
// Draw a rectangle of absolute columns and rows [c0, c1) x [r0, r1) into the ring: the cache camera at the view's place now (its
// frustum covers the view and the margin, so the rectangle is inside it), the viewport shifted so the rectangle lands on its own
// texels (twice or four times where it wraps round an edge), a scissor to the rectangle, culled to the rectangle's own frustum. The same
// widened projection as every other draw of the cache, so the pixels match.
const _rectCam = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR);
// the lights as they are now, and a way to put others in place for a draw (a strip or rectangle of the cache is drawn with the lights the rest of the
// picture was drawn with, whatever the day cycle has done since)
function scLightSnap(){ return { sc: sun.color.clone(), si: sun.intensity, hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, em: EM_I.value.slice(), m1: sun.matrixWorld.clone(), m2: sun.target.matrixWorld.clone() }; }
function scLightPut(L){ sun.color.copy(L.sc); sun.intensity = L.si; hemi.color.copy(L.hc); hemi.groundColor.copy(L.hg); hemi.intensity = L.hi; sun.matrixWorld.copy(L.m1); sun.target.matrixWorld.copy(L.m2); for (let i = 0; i < 7; i++) EM_I.value[i] = L.em[i]; }
function scDrawRect(c0, c1, r0, r1, px, py){
  const held = SC.lt && !PH.tests.noHold ? scLightSnap() : null; if (held) scLightPut(SC.lt);
  try { scDrawRect0(c0, c1, r0, r1, px, py); } finally { if (held) scLightPut(held); }
}
function scDrawRect0(c0, c1, r0, r1, px, py){
  scCamera();
  const M = SC.Muse, cam_ = SC.camS, pxl = 2*zoom/H, baseC = scCol(px) - M, baseR = scRow(py) - M, rt = SC.rtS;
  for (const [tx, ax, wx] of scPieces(c0, c1 - c0, SC.ox, SC.w)) for (const [ty, ay, wy] of scPieces(r0, r1 - r0, SC.oy, SC.h)){
    const pc0 = c0 + ax, pr0 = r0 + ay;   // (this piece's absolute start)
    rt.viewport.set(tx - (pc0 - baseC), ty - (pr0 - baseR), SC.w, SC.h); rt.scissor.set(tx, ty, wx, wy); rt.scissorTest = true;
    _rectCam.left = cam_.left + (pc0 - baseC)*pxl; _rectCam.right = cam_.left + (pc0 + wx - baseC)*pxl;
    _rectCam.bottom = cam_.bottom + (pr0 - baseR)*pxl; _rectCam.top = cam_.bottom + (pr0 + wy - baseR)*pxl; _rectCam.updateProjectionMatrix();
    _rectCam.position.copy(cam_.position); _rectCam.quaternion.copy(cam_.quaternion); _rectCam.updateMatrixWorld();
    renderer.setClearColor(0x000000, 1);
    mrtBegin(rt, SC.rtSN);
    cam_.layers.mask = STATIC_BIT; cullFrame(cam_, _rectCam);
    try { renderer.render(scene, cam_); } finally { mrtEnd(); }
  }
  rt.viewport.set(0, 0, SC.w, SC.h); rt.scissorTest = false;
}
// Keep the view inside the ring with room to spare: when the room on a side falls under half the margin, draw the strip that brings
// it back to the whole margin (the ring's width is the view plus two margins, so the opposite strip is overwritten). False when the
// view has left the ring, or the strip would be more than a margin wide (a pan too fast for it): the caller draws the cache whole.
function scExtend(px, py){
  const R = SC.R, M = SC.Muse, half = M >> 1, colL = scCol(px), rowB = scRow(py);
  if (colL < R.x0 || colL + W > R.x1 || rowB < R.y0 || rowB + H > R.y1) return false;
  const strips = [], o = { x0: R.x0, x1: R.x1, y0: R.y0, y1: R.y1 };
  if (o.x1 - (colL + W) < half){ const n1 = colL + W + M; strips.push([o.x1, n1, null, null]); o.x1 = n1; o.x0 = n1 - SC.w; }
  else if (colL - o.x0 < half){ const n0 = colL - M; strips.push([n0, o.x0, null, null]); o.x0 = n0; o.x1 = n0 + SC.w; }
  if (o.y1 - (rowB + H) < half){ const n1 = rowB + H + M; strips.push([null, null, o.y1, n1]); o.y1 = n1; o.y0 = n1 - SC.h; }
  else if (rowB - o.y0 < half){ const n0 = rowB - M; strips.push([null, null, n0, o.y0]); o.y0 = n0; o.y1 = n0 + SC.h; }
  if (!strips.length) return true;
  for (const st of strips){   // (a column strip spans the new rows, a row strip the new columns)
    if (st[0] !== null){ if (st[1] - st[0] > M) return false; scDrawRect(st[0], st[1], o.y0, o.y1, px, py); }
    else { if (st[3] - st[2] > M) return false; scDrawRect(o.x0, o.x1, st[2], st[3], px, py); } }
  SC.R = o; SC.strips++; SC.stripAt = SC.rebuilds;
  return true;
}
// An edit (a piece placed, taken away, sweeping in or out, a region's pieces merged): instead of the whole picture, redraw the screen rectangle
// it can have changed, with the lights the picture was drawn with. The rectangle is the union of the boxes of what changed (SC_DIRTY, world.js)
// and everything their shadows can fall on: each box widened by a little for the shadow's soft edge, then swept down to the ground along the
// sun's direction (a point is in a new shadow if the ray from it to the sun meets the box), projected into the cache's pixels, with a few
// pixels' room. False (the caller draws the whole picture) when it can't be done safely: something changed that has no box, the shadow
// map or the sun's light isn't what the picture was drawn with, the sun is too low (the shadows reach too far), the rectangle is more than
// SC_RECT_MAX of the picture, or the overlay test "redraw the cache whole on edits" is on.
const SC_RECT_MAX = .55, SC_SWEEP_PAD = 1.2, SC_GROUND = -3, SC_RECT_EPS = 2e-4;
const scNoRect = () => PH.tests.noRect || window.__NO_RECT;
const _rp = new THREE.Vector3(), _rd = new THREE.Vector3();
function scEditRect(px, py, shk, soft){
  const D = SC_DIRTY;
  if (scNoRect()) return SC.rectWhy = 'rectangles switched off', false;
  if (D.unknown || D.boxes.length > 24) return SC.rectWhy = D.unknown ? 'something changed that has no box' : 'too many boxes', false;
  if (!scSame(shk, SC.shk)) return SC.rectWhy = 'the shadow map changed', false;
  if (scDelta(soft, SC.soft) > SC_RECT_EPS) return SC.rectWhy = 'the light moved', false;   // (the cache tolerates a drift up to SC_EPS; a rectangle redrawn beside older light would show it, so it asks for less)
  if (!D.boxes.length){ SC.editsSeen = SC_EDITS; return true; }   // (only merges, which change nothing on screen)
  _rd.copy(sun.position).sub(sun.target.position).normalize();   // toward the sun
  if (_rd.y < .12) return SC.rectWhy = 'the sun is low', false;
  scCamera();
  const cam_ = SC.camS, pxl = 2*zoom/H, M = SC.Muse, baseC = scCol(px) - M, baseR = scRow(py) - M;
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  const take = (x, y, z) => { _rp.set(x, y, z).applyMatrix4(cam_.matrixWorldInverse);
    const c = baseC + (_rp.x - cam_.left)/pxl, r = baseR + (_rp.y - cam_.bottom)/pxl;
    if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; };
  for (const b of D.boxes){
    for (let q = 0; q < 8; q++){
      const x = (q & 1 ? b.max.x : b.min.x) + (q & 1 ? SC_SWEEP_PAD : -SC_SWEEP_PAD), y = (q & 2 ? b.max.y : b.min.y) + (q & 2 ? SC_SWEEP_PAD : -SC_SWEEP_PAD), z = (q & 4 ? b.max.z : b.min.z) + (q & 4 ? SC_SWEEP_PAD : -SC_SWEEP_PAD);
      take(x, y, z);
      const t = (y - SC_GROUND)/_rd.y; take(x - _rd.x*t, SC_GROUND, z - _rd.z*t);   // (down along the sun's rays to the ground)
    }
  }
  const pad = 4; c0 = Math.floor(c0) - pad; c1 = Math.ceil(c1) + pad; r0 = Math.floor(r0) - pad; r1 = Math.ceil(r1) + pad;
  const R = SC.R; c0 = Math.max(c0, R.x0); c1 = Math.min(c1, R.x1); r0 = Math.max(r0, R.y0); r1 = Math.min(r1, R.y1);
  if (c1 > c0 && r1 > r0){
    if ((c1 - c0)*(r1 - r0) > SC_RECT_MAX*SC.w*SC.h) return SC.rectWhy = 'the rectangle is most of the picture', false;
    scDrawRect(c0, c1, r0, r1, px, py); SC.rects++; SC.rectLast = [c0 - scCol(px), c1 - scCol(px), r0 - scRow(py), r1 - scRow(py)];
  }
  D.boxes.length = 0; SC.editsSeen = SC_EDITS;
  return true;
}
// What the static pieces' pictures depend on, in two parts.
// HARD: what makes the cache wrong the moment it changes (the view's orientation and zoom, the render size and mode, the detail
// levels, the lights switching on and off, any static piece coming, going or changing, the pinned place along the view, the
// overlay's test flags): the cache is drawn again at once, in one frame.
// SOFT: slow drift (the sun's color, strength and direction and the sky light over a day cycle, the glow strengths) and the
// shadow map being swapped for a newer one: the cache keeps serving while a new one is drawn in the background, a strip a
// frame, with the lights held at what they were when it began (see SC.band), then it is swapped in.
const SC_EPS = .003, SC_BIG = .03;   // (a change in the soft part under EPS isn't worth drawing again; over BIG is not a drift but a jump: rain, the hour set by hand)
function scHard(out){
  let k = 0; const put = v => { out[k++] = v; };
  put(yaw); put(PITCH); put(zoom); put(W); put(H); put(SMOOTH_LOOK.value); put(LOD.fine.value); put(CULL.lvl); put(CULL.minPx);
  put(LIGHTS_ON.value < .17 ? 0 : LIGHTS_ON.value);   // (no window switches on below about .18: a drift under that, as the day cycle gives by day, changes nothing)
  put(sun.castShadow ? 1 : 0); put(renderer.shadowMap.enabled ? 1 : 0); put(SC.c0);   // (an edit, SC_EDITS, is dealt with apart: see scEditRect)
  let t = 0, b = 1; for (const key in PH.tests){ if (PH.tests[key]) t |= b; b <<= 1; } put(t);
  out.length = k; return out;
}
function scSoft(out){
  let k = 0; const put = v => { out[k++] = v; };
  put(sun.color.r); put(sun.color.g); put(sun.color.b); put(sun.intensity);
  put(hemi.color.r); put(hemi.color.g); put(hemi.color.b); put(hemi.groundColor.r); put(hemi.groundColor.g); put(hemi.groundColor.b); put(hemi.intensity);
  for (const v of EM_I.value) put(v);
  put(M.winLit.emissiveIntensity); put(M.neonPink.emissiveIntensity); put(M.bulb.emissiveIntensity); put(M.trimCyan.emissiveIntensity);   // (glow materials drawn on their own, not through the building shader)
  const dx = sun.position.x - sun.target.position.x, dy = sun.position.y - sun.target.position.y, dz = sun.position.z - sun.target.position.z, l = Math.hypot(dx, dy, dz) || 1;
  put(dx/l); put(dy/l); put(dz/l);
  out.length = k; return out;
}
function scShadowKey(out){ let k = 0; for (const v of sun.shadow.matrix.elements) out[k++] = v; out[k++] = sun.shadow.map ? sun.shadow.map.texture.id : -1; out.length = k; return out; }
function scSame(a, b){ if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function scDelta(a, b){ let m = 0; for (let i = 0; i < a.length; i++){ const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; }
SC.editsSeen = 0; SC.rects = 0; SC.lt = null;   // (rects: edits drawn as a rectangle; lt: the lights the picture was drawn with)
SC.prev = null; SC.hard = null; SC.soft = null; SC.shk = null; SC.ok = false; SC.ox = 0; SC.oy = 0; SC.R = { x0: 0, x1: 0, y0: 0, y1: 0 }; SC.strips = 0; SC.age = 0; SC.rebuilds = 0; SC.next = null; SC.job = null; SC.K = 8; SC.flash = 0;

// one background strip of the next cache: the job's own camera (where the view was when it began), the strip's rows only, the
// lights as they were when it began
const _stripCam = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR), _lt = { sc: new THREE.Color(), hc: new THREE.Color(), hg: new THREE.Color(), em: [], m1: new THREE.Matrix4(), m2: new THREE.Matrix4() };
function scBand(job){
  const K = job.K, k = job.k, h = SC.h, y0 = Math.floor(h*k/K), y1 = Math.floor(h*(k + 1)/K), px = 2*zoom/H, c = job.cam;
  _stripCam.left = c.left; _stripCam.right = c.right; _stripCam.bottom = c.bottom + y0*px; _stripCam.top = c.bottom + y1*px; _stripCam.updateProjectionMatrix();
  _stripCam.position.copy(c.position); _stripCam.quaternion.copy(c.quaternion); _stripCam.updateMatrixWorld();
  // the lights as they were when the job began (and put back after)
  _lt.sc.copy(sun.color); const si = sun.intensity; _lt.hc.copy(hemi.color); _lt.hg.copy(hemi.groundColor); const hi = hemi.intensity; _lt.m1.copy(sun.matrixWorld); _lt.m2.copy(sun.target.matrixWorld);
  for (let i = 0; i < 7; i++){ _lt.em[i] = EM_I.value[i]; EM_I.value[i] = job.em[i]; }
  sun.color.copy(job.sc); sun.intensity = job.si; hemi.color.copy(job.hc); hemi.groundColor.copy(job.hg); hemi.intensity = job.hi; sun.matrixWorld.copy(job.m1); sun.target.matrixWorld.copy(job.m2);
  job.rt.scissor.set(0, y0, SC.w, y1 - y0); job.rt.scissorTest = true;
  renderer.setClearColor(0x000000, 1);
  mrtBegin(job.rt, job.rn);
  c.layers.mask = STATIC_BIT; cullFrame(c, _stripCam);
  try { renderer.render(scene, c); } finally {
    mrtEnd(); job.rt.scissorTest = false;
    sun.color.copy(_lt.sc); sun.intensity = si; hemi.color.copy(_lt.hc); hemi.groundColor.copy(_lt.hg); hemi.intensity = hi; sun.matrixWorld.copy(_lt.m1); sun.target.matrixWorld.copy(_lt.m2);
    for (let i = 0; i < 7; i++) EM_I.value[i] = _lt.em[i];
  }
}
function scJobStart(px, py, hard, soft, shk, why){
  if (!SC.next){ if (!scMargin()) return; SC.next = scMake(SC.w, SC.h); }
  const job = { edits: SC_EDITS, k: 0, K: SC.K, ox: scCol(px) - SC.Muse, oy: scRow(py) - SC.Muse, hard: hard.slice(), soft: soft.slice(), shk: shk.slice(), map: sun.shadow.map, why,
    rt: SC.next.rt, rn: SC.next.rn, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR),
    sc: sun.color.clone(), si: sun.intensity, hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, em: EM_I.value.slice(), m1: sun.matrixWorld.clone(), m2: sun.target.matrixWorld.clone() };
  scCamera(); job.cam.left = SC.camS.left; job.cam.right = SC.camS.right; job.cam.top = SC.camS.top; job.cam.bottom = SC.camS.bottom; job.cam.updateProjectionMatrix();
  job.cam.position.copy(SC.camS.position); job.cam.quaternion.copy(SC.camS.quaternion); job.cam.updateMatrixWorld();
  SC.job = job;
}
function scJobSwap(job){   // the finished strips become the cache
  const rt = SC.rtS, rn = SC.rtSN; SC.rtS = job.rt; SC.rtSN = job.rn; SC.next = { rt, rn };
  SC.lt = job; SC.editsSeen = job.edits;   // (a job's own fields are the lights it was drawn with)
  SC.hard = job.hard; SC.soft = job.soft; SC.shk = job.shk; SC.ox = job.ox; SC.oy = job.oy; SC.R = { x0: job.ox, x1: job.ox + SC.w, y0: job.oy, y1: job.oy + SC.h }; SC.age = 0; SC.rebuilds++; SC.job = null;
}
// the static set into the cache in one go, at the view's own place
function scFull(px, py, hard, soft, shk, why){
  scCamera();
  renderer.setClearColor(0x000000, 1);
  mrtBegin(SC.rtS, SC.rtSN);
  SC.camS.layers.mask = STATIC_BIT; cullFrame(SC.camS);
  renderer.render(scene, SC.camS);
  mrtEnd();
  SC.lt = scLightSnap(); SC.editsSeen = SC_EDITS; SC_DIRTY.boxes.length = 0; SC_DIRTY.unknown = false;
  SC.hard = hard.slice(); SC.soft = soft.slice(); SC.shk = shk.slice(); SC.ok = true; SC.ox = scCol(px) - SC.Muse; SC.oy = scRow(py) - SC.Muse; SC.R = { x0: SC.ox, x1: SC.ox + SC.w, y0: SC.oy, y1: SC.oy + SC.h }; SC.age = 0; SC.rebuilds++; SC.job = null; SC.flash = 6;
  SC.state = 'redrawn'; SC.why = why;
}
const _hA = [], _sA = [], _kA = [];
// The color pass, drawn from the cache. False (nothing drawn) when the old path has to do it.
SC.frame = function(){
  if (window.__perf && window.__perf.skip) return false;   // (the harness skips this frame's drawing: the old path's render call, which it intercepts, does what a skipped frame owes; the cache's state stays as it was)
  if (SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic || !MRT){ SC.state = 'off'; SC.why = SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic ? 'switched off' : 'no WebGL 2'; SC.ok = false; SC.job = null; return false; }
  if (renderer.shadowMap.needsUpdate){   // (the shadows are redrawn at once: for an edit whose boxes are known the picture stays, and the next frame redraws just the edit's rectangle)
    SC.state = 'off'; SC.why = 'shadows redrawn this frame'; SC.job = null;
    if (!(SC.ok && SC_EDITS !== SC.editsSeen && !SC_DIRTY.unknown && !scNoRect() && scSame(scHard(_hA), SC.hard))) SC.ok = false;   // (anything else changing too: the whole picture goes, as it always did)
    return false; }
  if (SC.mode === 'split'){   // (a check: static then live on the main camera, no cache, to tell order effects from projection effects)
    const lm0 = cam.layers.mask;
    renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1); mrtBegin();
    SC.drawView(() => { cam.layers.mask = STATIC_BIT; cullFrame(cam); renderer.render(scene, cam);
      cam.layers.mask = SC_LIVE_MASK; cullFrame(cam); renderer.render(scene, cam); });
    mrtEnd(); cam.layers.mask = lm0; return true;
  }
  if (!scTargets()){ SC.state = 'off'; SC.ok = false; return false; }
  const px = Math.round(camPix.x), py = Math.round(camPix.y), M = SC.Muse;
  const hard = scHard(_hA), soft = scSoft(_sA), shk = scShadowKey(_kA);
  // is the cache as the view needs it?
  let now = '';
  if (SC.mode === 'every') now = 'redrawn every frame';
  else if (!SC.ok) now = 'first draw';
  else if (!scSame(hard, SC.hard)) now = 'something it depends on changed';
  else if (scCol(px) < SC.R.x0 || scCol(px) + W > SC.R.x1 || scRow(py) < SC.R.y0 || scRow(py) + H > SC.R.y1) now = 'view left the cache';
  else if (scDelta(soft, SC.soft) > SC_BIG) now = 'the light jumped';
  else if (SC_EDITS !== SC.editsSeen && !scEditRect(px, py, shk, soft)) now = 'an edit: ' + SC.rectWhy;
  // Still changing from frame to frame (a turn or zoom easing in, the lights switching at dusk): the cache would be drawn again every
  // frame, which costs more than the old way. Draw the old way until the inputs hold still for a frame, then draw the cache once.
  const stable = scSame(hard, SC.prev); SC.prev = hard.slice();
  if (now === 'something it depends on changed' && SC.ok && !stable){ SC.state = 'off'; SC.why = 'changing: drawn the old way'; SC.job = null; return false; }
  const lm = cam.layers.mask;
  if (now){ scFull(px, py, hard, soft, shk, now); }
  else {
    SC.age++; SC.state = 'in use'; SC.why = '';
    // a newer cache in the background when the light has drifted, the shadow map has been swapped, or the view has used half the room
    if (SC.job && (!scSame(hard, SC.job.hard) || sun.shadow.map !== SC.job.map || SC.job.edits !== SC_EDITS)){ SC.job = null; }   // (it was for something that's gone)
    if (!SC.job){
      let why = '';
      if (scDelta(soft, SC.soft) > SC_EPS) why = 'light drifted';
      else if (!scSame(shk, SC.shk)) why = 'shadow map swapped';
      else if (PH.tests.noRing && (scCol(px) - SC.R.x0 < M/2 || SC.R.x1 - scCol(px) - W < M/2 || scRow(py) - SC.R.y0 < M/2 || SC.R.y1 - scRow(py) - H < M/2)) why = 'view nearing the edge';   // (without the ring: a whole new picture)
      if (why) scJobStart(px, py, hard, soft, shk, why);
    }
    if (SC.job){
      scBand(SC.job); SC.job.k++; SC.state = 'redrawing ' + SC.job.k + ' of ' + SC.job.K; SC.why = SC.job.why; SC.band = SC.job.k - 1;
      if (SC.job.k === SC.job.K){
        if (scCol(px) >= SC.job.ox && scCol(px) + W <= SC.job.ox + SC.w && scRow(py) >= SC.job.oy && scRow(py) + H <= SC.job.oy + SC.h) scJobSwap(SC.job); else SC.job = null;
      }
    }
  }
  if (!now && !PH.tests.noRing && !scExtend(px, py)){   // the strip that keeps the view inside the ring; a pan too fast for it: the whole picture
    scFull(px, py, hard, soft, shk, 'pan too fast for the ring');
  }
  // the window of it into the frame, then the live set on top
  renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
  mrtBegin(rtC, rtN, true);
  if (PH.tests.copyByDraw || window.__COPY_DRAW) scCopyDraw(scCol(px), scRow(py)); else scBlit(scCol(px), scRow(py));
  cam.layers.mask = SC_LIVE_MASK; cullFrame(cam);
  if (!PH.tests.noLiveCull) scLiveCull();
  try { SC.drawView(() => renderer.render(scene, cam)); } finally { scLiveRestore(); }
  if (PH.tests.showRebuilds) scFlash(px, py);
  mrtEnd();
  cam.layers.mask = lm;
  return true;
};
// The live pass is drawn with the cache's widened projection (its pixels then fall exactly where the cache's do), which lets in every object of the margin too, a band
// round the view up to 256 px wide. What no pixel of the view can show is left out here, by the view's own frustum (the planes cullFrame has just made for it): only objects
// that never move and are culled by three itself (a plot's glass, its overlay and the like), found once for each change to the world. The picture doesn't change.
let _lcList = [], _lcStamp = -1; const _lcHid = [], _lcS = new THREE.Sphere();
function scLiveList(){
  if (_lcStamp === SC_EDITS) return; _lcStamp = SC_EDITS; _lcList = [];
  world.traverse(o => {
    if (!(o.isMesh || o.isPoints) || !o.frustumCulled || o.isInstancedMesh || o.matrixAutoUpdate !== false || !(o.layers.mask & SC_LIVE_MASK)) return;
    const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return;
    _lcS.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    _lcList.push(o, _lcS.center.x, _lcS.center.y, _lcS.center.z, _lcS.radius);
  });
}
function scLiveCull(){
  scLiveList(); const pl = CULL.pl, pad = CULL.pad; _lcHid.length = 0;
  for (let i = 0; i < _lcList.length; i += 5){
    const o = _lcList[i]; if (!o.visible) continue;
    const cx = _lcList[i + 1], cy = _lcList[i + 2], cz = _lcList[i + 3], r = _lcList[i + 4] + pad;
    for (let q = 0; q < 24; q += 4) if (pl[q]*cx + pl[q + 1]*cy + pl[q + 2]*cz + pl[q + 3] < -r){ o.visible = false; _lcHid.push(o); break; }
  }
  SC.liveCulled = _lcHid.length;
}
function scLiveRestore(){ for (let i = 0; i < _lcHid.length; i++) _lcHid[i].visible = true; _lcHid.length = 0; }
// (the overlay's test: a red frame the frame a whole cache is drawn again, and a red band where a background strip is being drawn)
function scFlash(px, py){
  const gl = renderer.getContext(), e = 6;
  const paint = (x, y, w, h) => { rtC.scissor.set(x, y, w, h); rtC.scissorTest = true; renderer.setRenderTarget(rtC); renderer.setClearColor(0xff2030, 1);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]); renderer.clear(true, false, false); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); rtC.scissorTest = false; renderer.setRenderTarget(rtC); };
  if (SC.state === 'redrawn' && SC.flash > 0){ paint(0, 0, W, e); paint(0, H - e, W, e); paint(0, 0, e, H); paint(W - e, 0, e, H); }
  else if (SC.job && SC.band !== undefined){
    const h = SC.h, y0 = Math.floor(h*SC.band/SC.job.K) + SC.job.oy - scRow(py), y1 = Math.floor(h*(SC.band + 1)/SC.job.K) + SC.job.oy - scRow(py);
    const a = Math.max(0, y0), b = Math.min(H, y1); if (b > a) paint(0, a, e, b - a), paint(W - e, a, e, b - a);
  }
  if (SC.flash > 0) SC.flash--;
}
// the overlay's line
SC.line = function(){
  if (SC.mode === 'off' || PH.tests.noStatic) return 'static cache: off (switched off)';
  return 'static cache: ' + SC.state + (SC.why ? ' (' + SC.why + ')' : '') + (SC.ok ? '   frames since redrawn ' + SC.age + '   redrawn ' + SC.rebuilds + ' times   ring strips ' + SC.strips + '   edit rectangles ' + SC.rects + (SC.rectLast ? ' (last: x ' + SC.rectLast[0] + ' to ' + SC.rectLast[1] + ', y from bottom ' + SC.rectLast[2] + ' to ' + SC.rectLast[3] + ')' : '') : '');
};
