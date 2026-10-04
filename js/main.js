// Neon Terrarium: Start-up and the frame loop.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- loop ---------- */
resize();
bakeClouds();
if (!load()) clearIsland(); else rebuildAll();
centerView(true);
selectZone(null);
let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now-last)/1000);
  // auto performance: a running average of the frame time; slow for a couple of seconds and the zoomed-out render
  // resolution steps down, quick again and it steps back up (a hidden tab's long gap is ignored)
  { const ms = now - last; if (ms < 250){ PERF.ema += (ms - PERF.ema)*.05; PERF.t += ms; }
    if (PERF.t > 2000){ PERF.t = 0;
      if (S.autoPerf === false) PERF.grow = Infinity;
      else if (PERF.ema > 26 && PERF.f > 1) PERF.grow = Math.max(1, Math.min(PERF.grow, PERF.f) - .2);   // slow: a step under what's drawn now
      else if (PERF.ema < 15 && PERF.grow < Infinity){ PERF.grow += .1; if (PERF.grow > 6) PERF.grow = Infinity; } } }   // quick again: back up, and off once it's well clear
  // day and night cycle: 24 game hours per real hour. Real elapsed time (up to a second, so a slow frame rate
  // doesn't slow the day), and none while the tab is hidden.
  const rdt = Math.min(1, (now-last)/1000);   // real time passed (fades and the day cycle shouldn't slow with the frame rate)
  if (S.cycle) S.hour = (S.hour + rdt*24/3600) % 24;
  last = now;
  const night = applyTime();
  { const d = LIGHTS_GOAL - LIGHTS_ON.value, st = LIGHTS_RATE*rdt; LIGHTS_ON.value += Math.max(-st, Math.min(st, d)); }   // lights catch up with the hour one by one
  FLUID_NIGHT.value = night;   // the pipes' liquids glow after dark
  syncTimeUI();
  updateCars(now/1000);
  updateDrones(dt, now/1000, night);
  updateTrips(dt, now/1000);
  updateVehicleShadows();
  updateAnims(dt);
  updateMegaFx(dt, now/1000);
  updatePeople(dt, now/1000);
  music.update(rdt);
  updateSteam(dt, night);
  updateConveyors(now/1000);
  updateRain(dt);
  // wind pushes the clouds: they drift faster in a strong wind and nearly stop when it's calm
  const windNow = S.wind * (S.rain ? 1.5 : 1), cDrift = .12 + windNow;
  cloudMat.uniforms.cloudOff.value.x -= dt*.25*cDrift; cloudMat.uniforms.cloudOff.value.y -= dt*.08*cDrift;
  clouds.rotation.y += dt*.008*cDrift;
  comp.uniforms.windR.value = windNow; clouds.position.set(camT.x, 0, camT.z); rain.position.set(camT.x, 0, camT.z);
  comp.uniforms.glowC.value.set(camT.x, camT.z);
  applyRenderRes(zoom);
  updateCamera(dt);
  comp.uniforms.outlines.value = S.outlines ? 1 : 0;
  comp.uniforms.palOn.value = S.palette ? 1 : 0;
  comp.uniforms.time.value = now/1000;
  FOL_UNI.time.value = (now/1000) % 3600;
  FOL_UNI.wind.value = S.wind * (S.rain ? 1.5 : 1);

  // shadows are redrawn only after an edit or once the sun has visibly moved
  if (_sunLast.distanceToSquared(SUN_DIR) > .12/1600){ _sunLast.copy(SUN_DIR); shadowDirty = true; }
  renderer.shadowMap.needsUpdate = shadowDirty; shadowDirty = false;
  GLOW_PTS_UNI.scale.value = H/(2*zoom);
  { // detail levels: only needed once zooming out outruns the screen's resolution (see applyRenderRes)
    const loss = (zoom/ZOOM_REF)*(BASE_H/H);   // 1 = every building keeps all its pixels
    const t = clamp((loss - 1.15)/1.0, 0, 1), e = t*t*(3 - 2*t);
    LOD.fine.value = e; LOD.plants.value = e; LOD.lines.value = e; }
  renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
  cam.layers.enableAll(); renderer.render(scene, cam);
  renderer.shadowMap.needsUpdate = false;
  renderer.setRenderTarget(rtN); renderer.setClearColor(0x8080ff, 1);
  scene.overrideMaterial = normalMat; cam.layers.set(0); renderer.render(scene, cam); scene.overrideMaterial = null;
  renderer.autoClear = false; FOL_UNI.normalMode.value = 1; cam.layers.set(2); renderer.render(scene, cam);
  FOL_UNI.normalMode.value = 0;
  // pieces mid-animation are drawn with their clipping in the normal pass too, so outlines match what's shown
  if (anims.length){
    cam.layers.set(3);
    for (const a of anims){
      a.view.traverse(o => { if (o.isMesh){ o.userData.colMat = o.material; o.material = a.mats.nrm; } });
      renderer.render(a.view, cam);
      a.view.traverse(o => { if (o.isMesh) o.material = o.userData.colMat; });
    }
  }
  renderer.autoClear = true;
  comp.uniforms.VP.value.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  comp.uniforms.invVP.value.copy(comp.uniforms.VP.value).invert();
  renderNightLights(comp.uniforms.night.value);   // lamps and neon lighting the surfaces round them (sky.js)
  comp.uniforms.upView.value.set(0,1,0).transformDirection(cam.matrixWorldInverse);
  comp.uniforms.sunV.value.copy(SUN_DIR).transformDirection(cam.matrixWorldInverse);   // for the rim light
  comp.uniforms.pxW.value = 2*zoom/H; comp.uniforms.aoI.value = S.ao === false ? 0 : 1;   // ambient occlusion (sky.js)
  comp.uniforms.skyYaw.value = -yaw*SKY_TURN;   // the star map turns with the camera (see sky.js)
  { const sy = Math.sin(yaw), cy = Math.cos(yaw);   // and drifts a hair as the view pans: sideways across, forward and back as a slight rise
    comp.uniforms.starOff.value.set((camT.x*cy - camT.z*sy)*SKY_DRIFT, -(camT.x*sy + camT.z*cy)*SKY_DRIFT*.5); }
  comp.uniforms.rainOff.value.copy(camPix);
  comp.uniforms.wet.value = S.wetOn ? (S.rain ? .75 : .3) : 0; comp.uniforms.rainOn.value = S.rain ? 1 : 0;
  if (sun.shadow.map){ comp.uniforms.shadowMap.value = sun.shadow.map.texture; comp.uniforms.shadowMat.value.copy(sun.shadow.matrix); }
  comp.uniforms.sunDir.value.copy(SUN_DIR);
  comp.uniforms.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
  comp.uniforms.cloudOn.value = S.vclouds ? 1 : 0; comp.uniforms.raysOn.value = S.rays ? 1 : 0;
  comp.uniforms.rainDark.value = S.rain ? 1 : 0;
  { const el = SUN_DIR.y, nt = comp.uniforms.night.value;
    comp.uniforms.rayI.value = (1-nt)*(0.45 + 1.1*(1-el)) + nt*.12; }
  clouds.visible = !S.vclouds;
  if (S.vclouds){ renderer.setRenderTarget(rtCloud); renderer.render(cloudScene, compCam); }
  renderer.setRenderTarget(rtOut); renderer.render(compScene, compCam);
  renderGlow();   // bloom and halation (sky.js)
  renderer.setRenderTarget(null); renderer.render(upScene, compCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
