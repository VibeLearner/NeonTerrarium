// Neon Terrarium: Start-up and the frame loop.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- loop ---------- */
resize();
bakeClouds();
if (!load()) clearIsland(); else if (loadWanted()) loadStart(); else rebuildAll();   // (a saved city is made from its recipes by the worker, nearest the camera first: loadcity.js)
centerView(true);
selectZone(null);
let last = performance.now();
// The next frame is asked for first, and an error in a frame is caught: one bad frame used to stop the game for good (the frame was never asked for again), with a single
// error in the console that was easy to miss. Errors are logged (the first five, then every 600th) and counted in FRAME_ERR; the game goes on with the next frame.
const FRAME_ERR = { n: 0, last: '' };
// Rest when idle (Settings, Optimize framerate): after 10 s without any input, with the view still and nothing being built, every other frame is skipped, so a
// fanless laptop runs cooler (sustained full load makes it slow itself down after a few minutes, which shows as frames that come and go). Any input ends it at once.
let IDLE_SKIP = false;
const idleNow = now => S.idleRest && !PH.on && now - LAST_INPUT > 10000 && !dragging && !keys.size && Math.abs(yawT - yaw) < 1e-3 && Math.abs(zoomT - zoom) < 1e-3 && camT.distanceTo(camGoal) < 1e-3 && !anims.length && !STAGE_Q.length && !STAGE_READY.length && !STAGE_CHAINS.size;
// what the hitch catcher (perfhud.js) notes with each frame: the cache, how fast the view turned, the speed classes, the shadow map, merges and tiers
PH.state = () => 'cache: ' + SC.state + (SC.why ? ' (' + SC.why + ')' : '') + '; turned ' + (SD.dYaw*180/Math.PI).toFixed(2) + ' deg, speed classes ' + SD.hist.slice(0, 4).join('/') + ' (fastest ' + SD.top.toFixed(0) + ' px)'
  + '; shadows ' + (LIGHT_JUMP ? 'sun jumped' : shJob ? 'strip ' + shJob.k + ' of ' + shJob.K : 'kept')
  + '; merges waiting ' + solidDirty.size + (SOLID_JOB ? ' (one under way)' : '') + ', tier changes ' + TIER.changes + ', to free ' + DISPOSE_Q.length + '; drag ' + (dragging ? 'held' : 'off');
function frame(now){
  requestAnimationFrame(frame);
  if (typeof OVERSEER !== 'undefined' && OVERSEER.hold) return;   // (the Overseer's desk covers the screen: the city waits)
  if (idleNow(now)){ IDLE_SKIP = !IDLE_SKIP; if (IDLE_SKIP) return; } else IDLE_SKIP = false;
  try { frameBody(now); }
  catch (e){ FRAME_ERR.n++; FRAME_ERR.last = String(e && e.stack || e).slice(0, 400);
    if (FRAME_ERR.n <= 5 || FRAME_ERR.n % 600 === 0) console.error('frame error #' + FRAME_ERR.n + ' (the game goes on):', e);
    scene.overrideMaterial = null; renderer.autoClear = true; try { PH.abort(); } catch (e2){} }
}
function frameBody(now){
  PH.frameStart(now);   // (the performance overlay, F3: perfhud.js)
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
  if (S.cycle) S.hour = (S.hour + rdt*24/3600*FF.clock) % 24;   // (fast forward runs the clock quicker: story.js)
  last = now;
  const night = applyTime();
  { const d = LIGHTS_GOAL - LIGHTS_ON.value, st = LIGHTS_RATE*rdt; LIGHTS_ON.value += Math.max(-st, Math.min(st, d)); }   // lights catch up with the hour one by one
  FLUID_NIGHT.value = night;   // the pipes' liquids glow after dark
  syncTimeUI();
  PH.lap('time of day, interface');
  updateCars(now/1000);
  updateDrones(dt, now/1000, night);
  updateTrips(dt, now/1000);
  updateHighways(dt, now/1000);
  updateMetros(dt, now/1000);
  PH.lap('vehicles, highways, metros');
  updateVehicleShadows();
  updateAnims(dt);
  updateMegaFx(dt, now/1000);
  PH.lap('megastructures, animations');
  updatePeople(dt*FF.ppl, FF.peopleTime(rdt, now/1000));   // (fast forward: the people's own clock runs quicker too)
  STORY.tick(rdt);   // story moments, the shape of the day, the monitor's log (story.js)
  if (typeof WIRELOG !== 'undefined') WIRELOG.tick(rdt);   // the transmission log, once the Wire Nest has come (wirelog.js)
  PH.lap('people');
  music.update(rdt);
  updateSteam(dt, night);
  updateConveyors(now/1000);
  updateRain(dt);
  // wind pushes the clouds: they drift faster in a strong wind and nearly stop when it's calm
  const rainK = (typeof LK !== 'undefined' && !LK.old && !window.__OLD_GRADES) ? LK.rainNow() : (S.rain ? 1 : 0);   // (how much it rains: eased by the looks, so the wind picks up with it rather than at once)
  const windNow = S.wind * (1 + .5*rainK), cDrift = .12 + windNow;
  cloudMat.uniforms.cloudOff.value.x -= dt*.25*cDrift; cloudMat.uniforms.cloudOff.value.y -= dt*.08*cDrift;
  clouds.rotation.y += dt*.008*cDrift;
  comp.uniforms.windR.value = windNow; comp.uniforms.rainT.value = (comp.uniforms.rainT.value + dt*(0.9 + windNow*0.12)) % 3600; clouds.position.set(camT.x, 0, camT.z); rain.position.set(camT.x, 0, camT.z);
  comp.uniforms.glowC.value.set(camT.x, camT.z);
  applyRenderRes(zoom);
  updateCamera(dt);
  comp.uniforms.camDist.value = CAM_DIST + SC.dc;   // (depth is measured from the pinned camera: see staticcache.js)
  comp.uniforms.outlines.value = S.outlines ? 1 : 0;
  comp.uniforms.palOn.value = S.palette ? 1 : 0;
  comp.uniforms.time.value = now/1000;
  FOL_UNI.time.value = (now/1000) % 3600;
  FOL_UNI.wind.value = windNow;

  // shadows are redrawn only after an edit or once the sun has visibly moved
  GLOW_PTS_UNI.scale.value = H/(2*zoom);
  { // detail levels: only needed once zooming out outruns the screen's resolution (see applyRenderRes)
    const loss = (zoom/ZOOM_REF)*(BASE_H/H);   // 1 = every building keeps all its pixels
    const t = clamp((loss - 1.15)/1.0, 0, 1), e = t*t*(3 - 2*t);
    // (plants thin later and more gently than the fine pieces: they are a few percent of a frame (tools/procfol/MEASURE.md), and tufts vanishing while
    //  still a pixel tall showed as pop-in with the render fixed; from loss 1.6, fully thinned only by 3.2)
    const tp = clamp((loss - 1.6)/1.6, 0, 1), ep = tp*tp*(3 - 2*tp);
    LOD.fine.value = e; LOD.plants.value = ep; LOD.lines.value = e; folFar(loss); }
  PH.lap('steam, rain, camera');
  PH.subBegin();
  runLater(); PH.sub('upkeep: later');
  stageStep(); PH.sub('upkeep: staged builds');   // a plot being built in steps: a few milliseconds of it (world.js)
  loadTick(); PH.sub('upkeep: loading');    // a city being made from its recipes (loadcity.js)
  pmTick(); PH.sub('upkeep: plot arrays');      // plots' own arrays let go once merged (recipe.js)
  tierTick(); PH.sub('upkeep: tiers');    // which blocks are drawn full, which as stand-ins (world.js)
  stepSync(); PH.sub('upkeep: edit sync');   // what an edit leaves to do, a stage a frame (world.js)
  if (!WARM_DONE) warmPrograms();   // (once a city has loaded: every program building needs, compiled before the first click; world.js)
  flushSolid(); PH.sub('upkeep: merges');   // regions whose pieces changed are merged again (world.js)
  nvTick(); PH.sub('upkeep: never-seen');   // idle frames: faces no camera ever sees are worked out for a plot, a few views a frame (neverseen.js)
  scene.updateMatrixWorld(); PH.sub('upkeep: matrices');   // once for every pass below (see core.js): nothing moves between them
  PH.lap('scene upkeep');
  PH.subBegin();
  farFrame(); PH.sub('view: far order');   // which of its two orders the merged blocks are drawn in (world.js)
  sideArc(); PH.sub('view: side arc');   // which way the buildings' walls can face the camera this frame (world.js)
  cullFrame(); PH.sub('view: culling');   // and which merged pieces are in view
  sdTrack();   // how fast the view is turning and zooming (world.js)
  cam.layers.enableAll(); shadowFrame(); PH.sub('view: shadows');   // shadows: redrawn at once, a strip in the background, or not at all (sky.js)
  PH.shadow(); PH.begin(renderer.shadowMap.needsUpdate ? 'color + shadow redraw' : 'color');
  const pt = PH.tests;   // (the overlay's tests: perfhud.js)
  if (pt.quarter) rtC.viewport.set(0, 0, W >> 1, H >> 1);   // (plain shading: see renderBufferDirect in sky.js)
  if (pt.quarter || !SC.frame()){   // (the static cache draws the frame when it can: staticcache.js)
    renderer.setRenderTarget(rtC); renderer.setClearColor(0x000000, 1);
    if (MRT) mrtBegin();   // the normal image is drawn along with the colors (core.js, sky.js)
    sdApply();   // the old way's frames: plots that move fast on screen lose their smallest triangles (world.js, speed-based detail)
    cam.layers.enableAll(); cam.layers.disable(6); SC.drawView(() => renderer.render(scene, cam), SC.mode === 'oldview');   // (layer 6: the glow overlay, for the cache's frames only)
    cam.layers.enableAll(); CULL.sd = false;
    if (MRT) mrtEnd();
  }
  if (pt.quarter) rtC.viewport.set(0, 0, W, H);
  PH.end();
  renderer.shadowMap.needsUpdate = false;
  if (!MRT){   // (without WebGL 2: the normal image in a pass of its own)
    PH.begin('normals');
    renderer.setRenderTarget(rtN); renderer.setClearColor(0x8080ff, 1);
    scene.overrideMaterial = normalMat; cam.layers.mask = 1 | STATIC_BIT; renderer.render(scene, cam); scene.overrideMaterial = null;
    renderer.autoClear = false; FOL_UNI.normalMode.value = 1; cam.layers.set(2); renderer.render(scene, cam);
    FOL_UNI.normalMode.value = 0;
    // pieces mid-animation are drawn with their clipping in the normal pass too, so outlines match what's shown
    if (anims.length){
      cam.layers.set(3);
      for (const a of anims){
        if (!a.meshes){ a.meshes = []; a.view.traverse(o => { if (o.isMesh) a.meshes.push(o); }); }   // (found once: a piece's meshes don't change while it animates)
        for (const o of a.meshes){ o.userData.colMat = o.material; o.material = a.mats.nrm; }
        renderer.render(a.view, cam);
        for (const o of a.meshes) o.material = o.userData.colMat;
      }
    }
    renderer.autoClear = true;
    PH.end();
  }
  comp.uniforms.VP.value.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  comp.uniforms.invVP.value.copy(comp.uniforms.VP.value).invert();
  liftShimmerCull(comp.uniforms.VP.value); mtShimmerCull(comp.uniforms.VP.value); shimTiles(comp.uniforms.VP.value);   // the air shimmers only where they can show
  megaFxFlush(comp.uniforms.VP.value);   // and the megastructures' moving parts go up to the card only while they're on screen
  PH.lap('pass setup');
  PH.begin('night lights'); renderNightLights(comp.uniforms.night.value); PH.end();   // lamps and neon lighting the surfaces round them (sky.js)
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
  PH.lap('pass setup');
  if (S.vclouds){ PH.begin('clouds'); renderer.setRenderTarget(rtCloud); renderer.render(cloudScene, compCam); PH.end(); }
  compVariant();   // (sky.js)
  PH.begin('soft effects (half resolution)'); softEffects(Math.round(camPix.x), Math.round(camPix.y)); PH.end();   // the wet-ground reflections, mist and light shafts, 2 x 2 pixels at a time (sky.js)
  PH.begin('composite'); renderer.setRenderTarget(rtOut); renderer.render(compScene, compCam); PH.end();
  PH.begin('bloom and grade'); renderGlow(); PH.end();   // bloom and halation (sky.js)
  if (!GLOW_DIRECT){ PH.begin('to screen'); renderer.setRenderTarget(null); renderer.render(upScene, compCam); PH.end(); }   // (drawn straight to the screen already when the sizes match: sky.js renderGlow)
  MON.blit(); MON.syncBar(); MON.hoverFrame();   // the monitor's feed: a crop of the frame just drawn (monitor.js)
  PH.frameEnd();
}
requestAnimationFrame(frame);
