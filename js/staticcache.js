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
SC.drawView = function(fn){
  if (SC.mode === 'off' || PH.tests.noStatic || !MRT || !scMargin()){ fn(); return; }
  scCamera();
  const keep = cam.projectionMatrix.clone(), M = SC.Muse;
  cam.projectionMatrix.copy(SC.camS.projectionMatrix); rtC.viewport.set(-M, -M, W + 2*M, H + 2*M); renderer.setRenderTarget(rtC);   // (three reads a target's viewport when the target is set)
  FOL_UNI.res.value.set(W + 2*M, H + 2*M);   // (the plants' and people's shaders snap to whole pixels of 'res' and emit clip coordinates: they need the size of what is being drawn into)
  try { fn(); } finally { cam.projectionMatrix.copy(keep); rtC.viewport.set(0, 0, W, H); FOL_UNI.res.value.set(W, H); }
};
// copy the window of the cache that is the view (color, depth and normals) into the color target
function scBlit(dx, dy){
  const gl = renderer.getContext(), M = SC.Muse, x0 = M + dx, y0 = M + dy;
  const fs = renderer.properties.get(SC.rtS).__webglFramebuffer, fc = renderer.properties.get(rtC).__webglFramebuffer;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fs); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fc);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  gl.blitFramebuffer(x0, y0, x0 + W, y0 + H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
  gl.blitFramebuffer(x0, y0, x0 + W, y0 + H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fc);   // (both bindings back to the color target, as three believes them to be)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
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
  put(sun.castShadow ? 1 : 0); put(renderer.shadowMap.enabled ? 1 : 0); put(SC_EDITS); put(SC.c0);
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
SC.prev = null; SC.hard = null; SC.soft = null; SC.shk = null; SC.ok = false; SC.ax = 0; SC.ay = 0; SC.age = 0; SC.rebuilds = 0; SC.next = null; SC.job = null; SC.K = 8; SC.flash = 0;

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
  const job = { k: 0, K: SC.K, ax: px, ay: py, hard: hard.slice(), soft: soft.slice(), shk: shk.slice(), map: sun.shadow.map, why,
    rt: SC.next.rt, rn: SC.next.rn, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR),
    sc: sun.color.clone(), si: sun.intensity, hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, em: EM_I.value.slice(), m1: sun.matrixWorld.clone(), m2: sun.target.matrixWorld.clone() };
  scCamera(); job.cam.left = SC.camS.left; job.cam.right = SC.camS.right; job.cam.top = SC.camS.top; job.cam.bottom = SC.camS.bottom; job.cam.updateProjectionMatrix();
  job.cam.position.copy(SC.camS.position); job.cam.quaternion.copy(SC.camS.quaternion); job.cam.updateMatrixWorld();
  SC.job = job;
}
function scJobSwap(job){   // the finished strips become the cache
  const rt = SC.rtS, rn = SC.rtSN; SC.rtS = job.rt; SC.rtSN = job.rn; SC.next = { rt, rn };
  SC.hard = job.hard; SC.soft = job.soft; SC.shk = job.shk; SC.ax = job.ax; SC.ay = job.ay; SC.age = 0; SC.rebuilds++; SC.job = null;
}
// the static set into the cache in one go, at the view's own place
function scFull(px, py, hard, soft, shk, why){
  scCamera();
  renderer.setClearColor(0x000000, 1);
  mrtBegin(SC.rtS, SC.rtSN);
  SC.camS.layers.mask = STATIC_BIT; cullFrame(SC.camS);
  renderer.render(scene, SC.camS);
  mrtEnd();
  SC.hard = hard.slice(); SC.soft = soft.slice(); SC.shk = shk.slice(); SC.ok = true; SC.ax = px; SC.ay = py; SC.age = 0; SC.rebuilds++; SC.job = null; SC.flash = 6;
  SC.state = 'redrawn'; SC.why = why;
}
const _hA = [], _sA = [], _kA = [];
// The color pass, drawn from the cache. False (nothing drawn) when the old path has to do it.
SC.frame = function(){
  if (window.__perf && window.__perf.skip) return false;   // (the harness skips this frame's drawing: the old path's render call, which it intercepts, does what a skipped frame owes; the cache's state stays as it was)
  if (SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic || !MRT){ SC.state = 'off'; SC.why = SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic ? 'switched off' : 'no WebGL 2'; SC.ok = false; SC.job = null; return false; }
  if (renderer.shadowMap.needsUpdate){ SC.state = 'off'; SC.why = 'shadows redrawn this frame'; SC.ok = false; SC.job = null; return false; }
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
  else if (Math.abs(px - SC.ax) > M || Math.abs(py - SC.ay) > M) now = 'view left the cache';
  else if (scDelta(soft, SC.soft) > SC_BIG) now = 'the light jumped';
  // Still changing from frame to frame (a turn or zoom easing in, the lights switching at dusk): the cache would be drawn again every
  // frame, which costs more than the old way. Draw the old way until the inputs hold still for a frame, then draw the cache once.
  const stable = scSame(hard, SC.prev); SC.prev = hard.slice();
  if (now === 'something it depends on changed' && SC.ok && !stable){ SC.state = 'off'; SC.why = 'changing: drawn the old way'; SC.job = null; return false; }
  const lm = cam.layers.mask;
  if (now){ scFull(px, py, hard, soft, shk, now); }
  else {
    SC.age++; SC.state = 'in use'; SC.why = '';
    // a newer cache in the background when the light has drifted, the shadow map has been swapped, or the view has used half the room
    if (SC.job && (!scSame(hard, SC.job.hard) || sun.shadow.map !== SC.job.map)){ SC.job = null; }   // (it was for something that's gone)
    if (!SC.job){
      let why = '';
      if (scDelta(soft, SC.soft) > SC_EPS) why = 'light drifted';
      else if (!scSame(shk, SC.shk)) why = 'shadow map swapped';
      else if (Math.abs(px - SC.ax) > M/2 || Math.abs(py - SC.ay) > M/2) why = 'view nearing the edge';
      if (why) scJobStart(px, py, hard, soft, shk, why);
    }
    if (SC.job){
      scBand(SC.job); SC.job.k++; SC.state = 'redrawing ' + SC.job.k + ' of ' + SC.job.K; SC.why = SC.job.why; SC.band = SC.job.k - 1;
      if (SC.job.k === SC.job.K){
        if (Math.abs(px - SC.job.ax) <= M && Math.abs(py - SC.job.ay) <= M) scJobSwap(SC.job); else SC.job = null;
      }
    }
  }
  // the window of it into the frame, then the live set on top
  renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
  mrtBegin(rtC, rtN, true);
  scBlit(px - SC.ax, py - SC.ay);
  cam.layers.mask = SC_LIVE_MASK; cullFrame(cam);
  SC.drawView(() => renderer.render(scene, cam));
  if (PH.tests.showRebuilds) scFlash(px, py);
  mrtEnd();
  cam.layers.mask = lm;
  return true;
};
// (the overlay's test: a red frame the frame a whole cache is drawn again, and a red band where a background strip is being drawn)
function scFlash(px, py){
  const gl = renderer.getContext(), e = 6;
  const paint = (x, y, w, h) => { rtC.scissor.set(x, y, w, h); rtC.scissorTest = true; renderer.setRenderTarget(rtC); renderer.setClearColor(0xff2030, 1);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]); renderer.clear(true, false, false); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); rtC.scissorTest = false; renderer.setRenderTarget(rtC); };
  if (SC.state === 'redrawn' && SC.flash > 0){ paint(0, 0, W, e); paint(0, H - e, W, e); paint(0, 0, e, H); paint(W - e, 0, e, H); }
  else if (SC.job && SC.band !== undefined){
    const h = SC.h, y0 = Math.floor(h*SC.band/SC.job.K) - SC.Muse - (py - SC.ay), y1 = Math.floor(h*(SC.band + 1)/SC.job.K) - SC.Muse - (py - SC.ay);
    const a = Math.max(0, y0), b = Math.min(H, y1); if (b > a) paint(0, a, e, b - a), paint(W - e, a, e, b - a);
  }
  if (SC.flash > 0) SC.flash--;
}
// the overlay's line
SC.line = function(){
  if (SC.mode === 'off' || PH.tests.noStatic) return 'static cache: off (switched off)';
  return 'static cache: ' + SC.state + (SC.why ? ' (' + SC.why + ')' : '') + (SC.ok ? '   frames since redrawn ' + SC.age + '   redrawn ' + SC.rebuilds + ' times' : '');
};
