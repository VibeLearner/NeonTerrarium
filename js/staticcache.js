// Neon Terrarium: the static cache. The city's buildings, ground and other things that only change with the camera, the
// sun and the time-of-day lights (the "static" set: layer 5, see markStatic in world.js) are drawn into a target bigger than
// the view (a margin of SC.M render pixels all round); each frame the window of it that the view needs is copied into the
// color target (color, normals and depth, bit for bit) and only the live set (people, plants, vehicles, glow points,
// anything see-through or moving) is drawn on top. The camera is orthographic and moves in whole render pixels, so a pan is
// a shift of the window. Anything that isn't certain draws the frame the old way.
// (Step 2 of the plan: the cache is redrawn every frame, so the copy itself can be checked against the old path.)
const SC = {
  M: 256,                 // margin, in render pixels, on every side of the view
  mode: window.__SC_MODE || 'every',   // 'off' (the old path), 'oldview' (the old path, the view drawn as the cache is: for checking), 'every' (redrawn every frame: for checking the copy)
  rtS: null, rtSN: null, w: 0, h: 0,
  camS: new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR),
  state: 'off', why: '',  // what the overlay shows
};
const SC_LIVE_MASK = -1 & ~STATIC_BIT;
sun.layers.enable(5); hemi.layers.enable(5);   // (three only collects the lights the camera's layers can see: the static pass needs them)
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
function scBlit(){
  const gl = renderer.getContext(), M = SC.Muse;
  const fs = renderer.properties.get(SC.rtS).__webglFramebuffer, fc = renderer.properties.get(rtC).__webglFramebuffer;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fs); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fc);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  gl.blitFramebuffer(M, M, M + W, M + H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
  gl.blitFramebuffer(M, M, M + W, M + H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fc);   // (both bindings back to the color target, as three believes them to be)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
}
// The color pass, drawn from the cache. False (nothing drawn) when the old path has to do it.
SC.frame = function(){
  if (SC.mode === 'off' || SC.mode === 'oldview' || PH.tests.noStatic || !MRT){ SC.state = 'off'; SC.why = SC.mode === 'off' || PH.tests.noStatic ? 'switched off' : 'no WebGL 2'; return false; }
  if (renderer.shadowMap.needsUpdate){ SC.state = 'off'; SC.why = 'shadows redrawn this frame'; return false; }
  if (SC.mode === 'split'){   // (a check: static then live on the main camera, no cache, to tell order effects from projection effects)
    const lm0 = cam.layers.mask;
    renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1); mrtBegin();
    SC.drawView(() => { cam.layers.mask = STATIC_BIT; cullFrame(cam); renderer.render(scene, cam);
      cam.layers.mask = SC_LIVE_MASK; cullFrame(cam); renderer.render(scene, cam); });
    mrtEnd(); cam.layers.mask = lm0; return true;
  }
  if (!scTargets()){ SC.state = 'off'; return false; }
  // the static set into the cache (here: every frame, at the view's own place)
  scCamera();
  renderer.setClearColor(0x000000, 1);
  mrtBegin(SC.rtS, SC.rtSN);
  const lm = cam.layers.mask;
  SC.camS.layers.mask = STATIC_BIT; cullFrame(SC.camS);
  renderer.render(scene, SC.camS);
  mrtEnd();
  // the window of it into the frame, then the live set on top
  renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
  mrtBegin(rtC, rtN, true);
  scBlit();
  cam.layers.mask = SC_LIVE_MASK; cullFrame(cam);
  SC.drawView(() => renderer.render(scene, cam));
  mrtEnd();
  cam.layers.mask = lm;
  SC.state = 'in use'; SC.why = '';
  return true;
};
