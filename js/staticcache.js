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
// the cache's targets: the formats of the color and normal targets (sky.js makeTargets), so a copy is exact
function scTargets(){
  if (!scMargin()) return false;
  const M = SC.Muse, w = W + 2*M, h = H + 2*M;
  if (SC.rtS && SC.w === w && SC.h === h) return true;
  if (SC.rtS){ SC.rtS.depthTexture.dispose(); SC.rtS.dispose(); SC.rtSN.dispose(); }
  const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat };
  SC.rtS = new THREE.WebGLRenderTarget(w, h, opt);
  SC.rtS.depthTexture = new THREE.DepthTexture(w, h); SC.rtS.depthTexture.type = THREE.UnsignedIntType;
  SC.rtS.depthTexture.minFilter = SC.rtS.depthTexture.magFilter = THREE.NearestFilter;
  SC.rtSN = new THREE.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: false }, opt));
  SC.w = w; SC.h = h;
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
  try { fn(); } finally { cam.projectionMatrix.copy(keep); rtC.viewport.set(0, 0, W, H); }
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
// Everything the static pieces' pictures depend on. The cache is reused while this is exactly what it was when the cache was
// drawn (and the view still lies inside it); any change redraws it at once.
const _sigA = [], _sigB = [];
function scSignature(out){
  let k = 0; const put = v => { out[k++] = v; };
  put(yaw); put(PITCH); put(zoom); put(W); put(H); put(SMOOTH_LOOK.value); put(LOD.fine.value); put(CULL.lvl); put(CULL.minPx);
  put(LIGHTS_ON.value); for (const v of EM_I.value) put(v);
  put(sun.color.r); put(sun.color.g); put(sun.color.b); put(sun.intensity); put(sun.castShadow ? 1 : 0); put(renderer.shadowMap.enabled ? 1 : 0);
  put(hemi.color.r); put(hemi.color.g); put(hemi.color.b); put(hemi.groundColor.r); put(hemi.groundColor.g); put(hemi.groundColor.b); put(hemi.intensity);
  put(sun.position.x - sun.target.position.x); put(sun.position.y - sun.target.position.y); put(sun.position.z - sun.target.position.z);
  for (const v of sun.shadow.matrix.elements) put(v);   // (a new shadow map comes with a new matrix)
  put(sun.shadow.map ? sun.shadow.map.texture.id : -1);
  put(SC_EDITS); put(SC.c0);
  let t = 0, b = 1; for (const key in PH.tests){ if (PH.tests[key]) t |= b; b <<= 1; } put(t);
  out.length = k;
}
function scSame(a, b){ if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
SC.sig = null; SC.ok = false; SC.ax = 0; SC.ay = 0; SC.age = 0; SC.rebuilds = 0;
// The color pass, drawn from the cache. False (nothing drawn) when the old path has to do it.
SC.frame = function(){
  if (window.__perf && window.__perf.skip) return true;   // (the harness skips this frame's drawing: nothing here may change the cache's state either)
  if (SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic || !MRT){ SC.state = 'off'; SC.why = SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic ? 'switched off' : 'no WebGL 2'; SC.ok = false; return false; }
  if (renderer.shadowMap.needsUpdate){ SC.state = 'off'; SC.why = 'shadows redrawn this frame'; SC.ok = false; return false; }
  if (SC.mode === 'split'){   // (a check: static then live on the main camera, no cache, to tell order effects from projection effects)
    const lm0 = cam.layers.mask;
    renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1); mrtBegin();
    SC.drawView(() => { cam.layers.mask = STATIC_BIT; cullFrame(cam); renderer.render(scene, cam);
      cam.layers.mask = SC_LIVE_MASK; cullFrame(cam); renderer.render(scene, cam); });
    mrtEnd(); cam.layers.mask = lm0; return true;
  }
  if (!scTargets()){ SC.state = 'off'; SC.ok = false; return false; }
  // is the cache as the view needs it?
  const px = Math.round(camPix.x), py = Math.round(camPix.y);
  const sig = SC.sig === _sigA ? _sigB : _sigA; scSignature(sig);
  let why = '';
  if (SC.mode === 'every') why = 'redrawn every frame';
  else if (!SC.ok) why = 'first draw';
  else if (!scSame(sig, SC.sig)) why = 'something it depends on changed';
  else if (Math.abs(px - SC.ax) > SC.Muse || Math.abs(py - SC.ay) > SC.Muse) why = 'view left the cache';
  const lm = cam.layers.mask;
  if (why){   // the static set into the cache, at the view's own place
    scCamera();
    renderer.setClearColor(0x000000, 1);
    mrtBegin(SC.rtS, SC.rtSN);
    SC.camS.layers.mask = STATIC_BIT; cullFrame(SC.camS);
    renderer.render(scene, SC.camS);
    mrtEnd();
    SC.sig = sig; SC.ok = true; SC.ax = px; SC.ay = py; SC.age = 0; SC.rebuilds++; SC.state = 'redrawn'; SC.why = why;
  } else { SC.age++; SC.state = 'in use'; SC.why = ''; }
  // the window of it into the frame, then the live set on top
  renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
  mrtBegin(rtC, rtN, true);
  scBlit(px - SC.ax, py - SC.ay);
  cam.layers.mask = SC_LIVE_MASK; cullFrame(cam);
  SC.drawView(() => renderer.render(scene, cam));
  mrtEnd();
  cam.layers.mask = lm;
  return true;
};
// the overlay's line
SC.line = function(){
  if (SC.mode === 'off' || PH.tests.noStatic) return 'static cache: off (switched off)';
  return 'static cache: ' + SC.state + (SC.why ? ' (' + SC.why + ')' : '') + (SC.ok ? '   frames since redrawn ' + SC.age + '   redrawn ' + SC.rebuilds + ' times' : '');
};
