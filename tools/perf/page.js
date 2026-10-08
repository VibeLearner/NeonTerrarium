// Page-side helpers for the perf harness (tools/perf/harness.py): scene setup, captures and timings.
// Loaded with page.evaluate after the game has started; uses the shims in shim.js.
window.__perf = (() => {
  const P = {};
  P.hideUi = () => { const st = document.createElement('style'); st.textContent = 'body > *:not(canvas){ visibility: hidden !important; }'; document.head.appendChild(st); };
  P.cam = c => { if (!c) return; camGoal.set(c.x, camGoal.y, c.z); camT.copy(camGoal); zoom = zoomT = c.zoom; yaw = yawT = c.yaw; };
  P.setup = sc => {
    P.hideUi();
    S.cycle = false; S.hour = sc.hour ?? 12; S.rain = false;
    P.cam(sc.cam);
    renderer.info.autoReset = false;
    // Frames between captures are simulated but not drawn (SwiftShader takes about a second a frame). A skipped draw
    // still does what three's render does to the scene graph (world matrices), and if one of them would have redrawn
    // the shadow map, the captured frame redraws it instead.
    const rr = renderer.render.bind(renderer);
    P.skip = false; P.shadowOwed = false;
    renderer.render = (sc, c) => {
      if (!P.skip || sc.userData.always) return rr(sc, c);   // (always: work a skipped frame still has to do, like a background shadow strip)
      if (sc.autoUpdate === true) sc.updateMatrixWorld();
      if (c.parent === null) c.updateMatrixWorld();
      if (sc === scene && renderer.shadowMap.needsUpdate) P.shadowOwed = true;
    };
  };
  // everything that moves or decides, as numbers: equal dumps mean the simulation took the same path
  const r = v => v;
  P.state = () => {
    const o = {};
    o.rand = __randCalls();
    o.hour = S.hour;
    o.ppl = pplList.map(p => [p.id, r(p.x), r(p.z), r(p.y), p.at, p.walk ? r(p.walk.s) : null, p.until, p.metro ? [p.metro.st, p.metro.k, r(p.metro.x), r(p.metro.z), r(p.metro.t), p.metro.waited] : null, p.emo ? p.emoUntil : null, p.pause ?? null, p.ride ? [p.ride.ph, p.ride.t] : null]);
    o.bots = bots.map(b => [b.state, r(b.x), r(b.z), b.until]);
    o.drones = drones.map(d => [d.phase, ...d.g.position.toArray(), d.timer]);
    o.trips = tripCars.map(c => [c.phase, ...c.g.position.toArray(), c.timer]);
    o.cars = cars.map(c => c.g.position.toArray());
    o.hw = hwCars.map(c => [c.h.id, c.lane, c.s, c.pos]);
    o.mt = metros.map(l => l.train ? [l.train.s, l.train.at, l.train.dwell, l.train.doors, l.train.load.map(p => p.id), (l.cabs || []).map(c => [c.y, c.state])] : null);
    o.megas = [...megas.values()].map(m => [m.id, m.top]);
    o.lifts = [...liftCabs.entries()].map(([k, e]) => [k, e.y, e.state]);
    o.deck = [...deckWalkers.entries()].map(([k, d]) => [k, d.u, d.dir, d.wait]);
    o.lurkers = [...lurkers.entries()].map(([k, L]) => [k, L.state, L.x, L.z, L.until, L.fade]);
    o.light = LIGHTS_ON.value;
    try { save(); const sv = {}; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); sv[k] = localStorage.getItem(k); } o.save = sv; } catch (e) { o.save = String(e); }
    return JSON.stringify(o);
  };
  // run n frames, then one more with renderer.info counted, and grab that frame's pixels (same task: the buffer is still there)
  // (draw: how many of the last frames before the captured one are drawn too, so that a cache carried from frame to frame is exercised)
  P.cap = (n, draw = 0) => {
    const skipN = Math.max(0, n - 1 - draw);
    if (skipN > 0){ P.skip = true; __step(skipN); P.skip = false; }
    if (draw > 0 && n > 1){ if (P.shadowOwed){ shadowDirty = true; P.shadowOwed = false; } __step(Math.min(draw, n - 1)); }
    if (P.shadowOwed){ shadowDirty = true; P.shadowOwed = false; }
    renderer.info.reset();
    __step(1);
    const png = canvas.toDataURL('image/png');
    const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, points: renderer.info.render.points, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures };
    return { png, info, state: P.state(), sc: typeof SC !== 'undefined' && SC.line ? SC.line() : '' };
  };
  // Timing. CPU: frames simulated without drawing (as between captures), each update function and the whole frame timed;
  // the skipped draws still do their world-matrix updates, so that cost is in "frame". GPU: one view drawn, then single
  // passes redrawn several times each, synchronised with a 1-pixel read, so a pass's own cost is measured on its own.
  P.cpuTime = (n, extra = []) => P.report(P.cpuFrames(n, extra).acc);
  P.cpuFrames = (n, extra = [], perFrame = null) => {   // the raw per-frame times of each timed function (and 'frame': the whole step), in order
    const now = __realNow, acc = {}, cur = {}, rows = [];
    const names = extra.concat(['checkBumps', 'updateBots', 'updateLurkers', 'updateClubs', 'decide', 'arrive', 'updateLifts', 'liftCab', 'liftRide', 'drawBouncers', 'drawDeckWalkers', 'drawLiftCabs', 'lawnHolos', 'lawnPicnics', 'updateCars', 'updateDrones', 'updateTrips', 'updateHighways', 'updateMetros', 'updateVehicleShadows', 'updateAnims', 'updateMegaFx', 'updatePeople', 'updateSteam', 'updateConveyors', 'updateCamera']);
    const orig = {};
    for (const nm of names){ const f = window[nm]; if (typeof f !== 'function') continue; orig[nm] = f;
      window[nm] = function(...a){ const t0 = now(); const r_ = f.apply(this, a); cur[nm] = (cur[nm] || 0) + now() - t0; return r_; }; }
    P.skip = true;
    for (let i = 0; i < n; i++){
      if (perFrame) eval(perFrame);
      for (const k in cur) delete cur[k];
      const t0 = now(); __step(1); cur.frame = now() - t0;
      for (const k in cur) (acc[k] || (acc[k] = [])).push(cur[k]);
      rows.push(Object.assign({}, cur));
    }
    P.skip = false;
    for (const nm in orig) window[nm] = orig[nm];
    return { acc, rows };
  };
  P.report = acc => { const out = {}; for (const k in acc){ const a = acc[k].slice().sort((x, y) => x - y); out[k] = { mean: a.reduce((s_, v) => s_ + v, 0)/a.length, p95: a[Math.min(a.length - 1, Math.floor(a.length*.95))], n: a.length }; } return out; };
  P.gpuTime = reps => {
    const now = __realNow, gl = renderer.getContext(), px = new Uint8Array(4);
    const sync = () => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    __step(1); sync();   // one whole frame first: every target filled for this view
    const acc = {};
    const time = (k, fn) => { const a = acc[k] = []; for (let i = 0; i < reps; i++){ sync(); const t0 = now(); fn(); sync(); a.push(now() - t0); } };
    time('composite', () => { renderer.setRenderTarget(rtOut); renderer.render(compScene, compCam); renderer.setRenderTarget(null); });
    time('night lights', () => { renderNightLights(comp.uniforms.night.value); renderer.setRenderTarget(null); });
    time('matrix update x1', () => { scene.updateMatrixWorld(); });
    time('whole frame', () => { __step(1); });
    return P.report(acc);
  };
  return P;
})();
