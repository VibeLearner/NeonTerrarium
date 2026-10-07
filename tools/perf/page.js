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
      if (!P.skip) return rr(sc, c);
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
  P.cap = n => {
    if (n > 1){ P.skip = true; __step(n - 1); P.skip = false; }
    if (P.shadowOwed){ shadowDirty = true; P.shadowOwed = false; }
    renderer.info.reset();
    __step(1);
    const png = canvas.toDataURL('image/png');
    const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, points: renderer.info.render.points, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures };
    return { png, info, state: P.state() };
  };
  // timing: wall-clock per update function and per render pass (gl.finish after each pass so GPU work is charged to it)
  P.timeSetup = () => {
    const now = __realNow, acc = P.acc = {}, add = (k, v) => { const a = acc[k] || (acc[k] = []); a.push(v); };
    P.frameAcc = {};
    const gl = renderer.getContext();
    const names = ['updateCars', 'updateDrones', 'updateTrips', 'updateHighways', 'updateMetros', 'updateVehicleShadows', 'updateAnims', 'updateMegaFx', 'updatePeople', 'updateSteam', 'updateConveyors', 'updateCamera', 'renderNightLights', 'renderGlow'];
    const cur = {};
    for (const nm of names){ const f = window[nm]; if (typeof f !== 'function') continue;
      window[nm] = function(...a){ const t0 = now(); const res = f.apply(this, a); if (nm.startsWith('render')) gl.finish(); cur[nm] = (cur[nm] || 0) + now() - t0; return res; }; }
    const rr = renderer.render.bind(renderer);
    let depth = 0;
    renderer.render = (sc, c) => {
      const lbl = sc === scene ? 'scene L' + c.layers.mask + (sc.overrideMaterial ? ' ovr' : '') : sc === compScene ? 'composite' : (typeof cloudScene !== 'undefined' && sc === cloudScene) ? 'clouds' : (typeof glowScene !== 'undefined' && sc === glowScene) ? 'glow pass' : (typeof upScene !== 'undefined' && sc === upScene) ? 'upscale' : 'other';
      const t0 = now(); rr(sc, c); gl.finish(); cur['pass: ' + lbl] = (cur['pass: ' + lbl] || 0) + now() - t0;
    };
    P.timeFrame = n => {
      for (let i = 0; i < n; i++){
        for (const k in cur) delete cur[k];
        const t0 = now(); __step(1); gl.finish(); cur.frame = now() - t0;
        for (const k in cur) add(k, cur[k]);
      }
    };
    P.timeReport = () => { const out = {}; for (const k in acc){ const a = acc[k].slice().sort((x, y) => x - y); out[k] = { mean: a.reduce((s, v) => s + v, 0)/a.length, p95: a[Math.min(a.length - 1, Math.floor(a.length*.95))], n: a.length }; } return out; };
  };
  return P;
})();
