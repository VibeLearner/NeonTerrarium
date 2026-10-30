// Neon Terrarium: the phone benchmark. Open the game with ?bench in the address (https://vibelearner.github.io/NeonTerrarium/?bench).
// Only ever loaded by js/benchboot.js, and only with ?bench: the normal page, desktop or phone, never runs any of this.
//
// What it does, in about ten minutes, with nobody touching the screen:
//  1. notes the device: model (where Chrome tells), Android version, screen, pixel ratio, cores, memory, the graphics chip, WebGL features, battery
//  2. loads the five test cities of tools/perf/scenes (from an empty island to the biggest city), one page load each, and in each one runs a
//     fixed script: still at noon, a slow turn (the way players turn while building), a fast turn, a pan, zoomed all the way out, night with rain.
//     For every step: frame times (mean, median, 95th and 99th percentile, share of frames over 20 and 33 ms), long tasks, the render size.
//     A few steps also take the performance overlay's breakdown (perfhud.js): time per part of the simulation and per render pass, normal and
//     "exact" (where the phone has no graphics timers, exact mode is the only way to see what each pass costs the graphics chip)
//  3. in the medium city: every effect switched off one at a time (bloom, clouds, light shafts, mist, ambient occlusion, wet ground, rim light,
//     grade, outlines, shadows) and the lower pixel choices, to see what each costs on this phone
//  4. a three-minute slow turn in the medium city, timed in ten-second slices: does the phone slow itself down as it warms up?
//  5. sends the results to the save server (user ntbench-results), from where a GitHub Action copies them into the repository (branch
//     bench-results, see tools/bench/). If sending fails, the results can be copied or downloaded from the last screen.
// The page's saves live in memory only (benchboot.js), so the player's own city in this browser is never touched.
'use strict';
(function(){
  if (!window.NT_BENCH) return;
  const VERSION = 1, RUN_KEY = 'ntBench.run', STORE_KEY = 'ntBench.storage';
  const SERVER = 'https://neon-terrarium-saves.ashley-jacob165.workers.dev', USER = 'ntbench-results';
  const SCENES = 'tools/perf/scenes/';
  // the plan: one page load each
  const PLAN = [
    { scene: 'island', steps: 'basic' },
    { scene: 'city', steps: 'basic', effects: true },
    { scene: 'dense', steps: 'basic' },
    { scene: 'megas', steps: 'basic' },
    { scene: 'maxcity', steps: 'short' },
    { scene: 'city', soak: 180 },
  ].filter(p => { const m = /[?&]benchonly=([a-z,]+)/.exec(location.search); return !m || m[1].split(',').includes(p.scene); });
  // (for checking the benchmark itself, not for real numbers: ?bench&benchquick runs every step at a tenth of its length)
  const QUICK = /[?&]benchquick\b/.test(location.search) ? .1 : 1;
  const ss = { get(){ try { return JSON.parse(sessionStorage.getItem(RUN_KEY) || 'null'); } catch (e) { return null; } },
               set(v){ try { sessionStorage.setItem(RUN_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  const now = () => performance.now();
  const sleepFrames = () => new Promise(r => requestAnimationFrame(r));
  const round = (v, d = 2) => (v == null || !isFinite(v)) ? null : Math.round(v*10**d)/10**d;

  /* ---------- the overlay ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #ntb-block{position:fixed;inset:0;z-index:2147483600;background:transparent;touch-action:none}
  #ntb-pill{position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483601;font:600 11px/1.3 'JetBrains Mono',monospace;
    color:#c9fbff;background:rgba(8,6,20,.82);border:1px solid #2de2e6;border-radius:999px;padding:5px 12px;white-space:nowrap;pointer-events:none;letter-spacing:.02em}
  #ntb-card{position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(5,4,14,.86);padding:16px}
  #ntb-card .box{max-width:420px;width:100%;font:13px/1.5 'JetBrains Mono',monospace;color:#e6e4ff;background:#0e0b22;border:1px solid #ff4fd8;border-radius:10px;padding:18px 18px 14px;box-shadow:0 0 30px rgba(255,79,216,.25)}
  #ntb-card h2{font:600 16px 'Chakra Petch',sans-serif;margin:0 0 8px;color:#2de2e6;letter-spacing:.04em}
  #ntb-card p{margin:0 0 10px}
  #ntb-card ul{margin:0 0 12px;padding-left:18px}
  #ntb-card button{font:600 14px 'Chakra Petch',sans-serif;color:#0e0b22;background:#2de2e6;border:0;border-radius:6px;padding:10px 16px;margin:4px 6px 0 0;cursor:pointer}
  #ntb-card button.alt{background:transparent;color:#2de2e6;border:1px solid #2de2e6}
  #ntb-card textarea{width:100%;height:110px;font:10px monospace;background:#05040e;color:#9ef;border:1px solid #333;border-radius:6px}
  #ntb-card .id{font-size:15px;color:#ff4fd8;word-break:break-all}`;
  document.head.appendChild(css);
  let pill = null, block = null;
  function status(t){ if (!pill){ pill = document.createElement('div'); pill.id = 'ntb-pill'; document.body.appendChild(pill); } pill.textContent = t; }
  function blockTouches(on){
    if (on && !block){ block = document.createElement('div'); block.id = 'ntb-block'; for (const ev of ['pointerdown', 'touchstart', 'wheel', 'click']) block.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, { passive: false }); document.body.appendChild(block); }
    if (!on && block){ block.remove(); block = null; } }
  function card(html, buttons){
    const old = document.getElementById('ntb-card'); if (old) old.remove();
    const c = document.createElement('div'); c.id = 'ntb-card'; c.innerHTML = '<div class="box">' + html + '<div class="btns"></div></div>';
    const row = c.querySelector('.btns');
    for (const [label, fn, alt] of buttons || []){ const b = document.createElement('button'); b.textContent = label; if (alt) b.className = 'alt'; b.onclick = () => fn(b); row.appendChild(b); }
    document.body.appendChild(c); return c; }
  const closeCard = () => { const c = document.getElementById('ntb-card'); if (c) c.remove(); };

  /* ---------- the device ---------- */
  async function deviceInfo(){
    const d = { ua: navigator.userAgent, platform: navigator.platform, cores: navigator.hardwareConcurrency || null, memGB: navigator.deviceMemory || null,
      dpr: devicePixelRatio, inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], orientation: (screen.orientation && screen.orientation.type) || null,
      touchLayout: document.documentElement.classList.contains('touch'), coarse: matchMedia('(pointer: coarse)').matches, lang: navigator.language,
      connection: navigator.connection ? { type: navigator.connection.effectiveType, down: navigator.connection.downlink, saveData: navigator.connection.saveData } : null };
    try { if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues){
      const h = await navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList', 'architecture', 'bitness']);
      d.model = h.model || null; d.os = (navigator.userAgentData.platform || '') + ' ' + (h.platformVersion || ''); d.browser = (h.fullVersionList || []).map(b => b.brand + ' ' + b.version).join(', '); d.mobile = navigator.userAgentData.mobile; } } catch (e) {}
    try { const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      d.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); d.gpuVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      d.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      d.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); d.gpuTimers = !!gl.getExtension('EXT_disjoint_timer_query_webgl2');
      d.floatRT = !!gl.getExtension('EXT_color_buffer_float'); d.halfFloatRT = !!gl.getExtension('EXT_color_buffer_half_float');
      d.precisionHighFrag = (() => { const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return p ? p.precision : null; })(); } catch (e) { d.gpuErr = String(e); }
    d.battery = await battery();
    return d;
  }
  async function battery(){ try { if (!navigator.getBattery) return null; const b = await navigator.getBattery(); return { level: round(b.level, 2), charging: b.charging }; } catch (e) { return null; } }

  /* ---------- measuring ---------- */
  // frame times from our own requestAnimationFrame, which runs alongside the game's (one per displayed frame)
  function stats(ms){
    if (!ms.length) return { frames: 0 };
    const a = ms.slice().sort((x, y) => x - y), n = a.length, q = p => a[Math.min(n - 1, Math.floor(p*n))];
    const mean = ms.reduce((s, v) => s + v, 0)/n;
    return { frames: n, fps: round(1000/mean, 1), mean: round(mean), p50: round(q(.5)), p95: round(q(.95)), p99: round(q(.99)), worst: round(a[n - 1]),
      over20: round(100*ms.filter(v => v > 20).length/n, 1), over33: round(100*ms.filter(v => v > 33.4).length/n, 1), over50: round(100*ms.filter(v => v > 50).length/n, 1) };
  }
  let longTasks = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) longTasks.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  // run for ms milliseconds, calling each(dt) every frame; returns the frame times (the first warm ms not counted)
  async function run(ms, each, warm = 0){
    ms *= QUICK; warm *= QUICK;
    const out = []; let last = null, hidden = false; const t0 = now(); longTasks = [];
    let lt0 = 0;
    for (;;){
      const t = await sleepFrames();
      if (document.hidden) hidden = true;
      if (last !== null){ const dt = t - last; if (each) each(dt/1000, t - t0); if (t - t0 > warm) out.push(dt); }
      if (last === null || t - t0 <= warm) lt0 = longTasks.length;
      last = t;
      if (t - t0 >= ms + warm) break;
    }
    const lts = longTasks.slice(lt0);
    return { ms: out, hidden, longTasks: lts.length, longTaskMs: round(lts.reduce((s, v) => s + v, 0), 0) };
  }
  function scene(){
    const o = { render: [W, H], screenPx: [DW, DH], lines: RENDER_LINES, zoom: round(zoom, 1), hour: round(S.hour, 1), rain: !!S.rain };
    try { o.people = pplList.length; o.plots = cells.size; } catch (e) {}
    try { o.heapMB = performance.memory ? round(performance.memory.usedJSHeapSize/1048576, 0) : null; o.gpuMB = round((GPUMEM.tex + GPUMEM.buf + GPUMEM.rb)/1048576, 0); } catch (e) {}
    return o;
  }
  async function step(name, ms, each, warm = 1000){
    status(stepLabel + ' · ' + name);
    const r = await run(ms, each, warm);
    const res = { name, ...stats(r.ms), longTasks: r.longTasks, longTaskMs: r.longTaskMs, ...scene() };
    if (r.hidden) res.interrupted = 'the page was hidden during this step';
    cur.steps.push(res); save();
    return res;
  }
  // the performance overlay's breakdown: per lap and per pass, then the same in exact mode (each pass waits for the graphics chip)
  async function breakdown(name, each){
    status(stepLabel + ' · ' + name + ' (breakdown)');
    const out = { name };
    try {
      if (!PH.on) PH.toggle();
      PH.traceStart();
      await run(2500, each, 500);
      const tr = PH.traceStop() || [];
      const laps = {}, gpu = {}; let js = 0, n = 0, gpuN = 0, gsum = 0;
      for (const f of tr){ n++; js += f.js || 0; for (const [k, v] of f.laps || []) laps[k.trim()] = (laps[k.trim()] || 0) + v;
        if (f.gpu != null){ gpuN++; gsum += f.gpu; for (const [k, v] of f.gpuBy || []) gpu[k] = (gpu[k] || 0) + v; } }
      for (const k in laps) laps[k] = round(laps[k]/Math.max(1, n));
      for (const k in gpu) gpu[k] = round(gpu[k]/Math.max(1, gpuN));
      out.frames = n; out.jsMs = round(js/Math.max(1, n)); out.gpuMs = gpuN ? round(gsum/gpuN) : null; out.laps = laps; out.gpuByPass = gpuN ? gpu : null;
      out.text = PH.text();
      PH.setExact(true);
      await run(3000, each, 800);
      out.exactText = PH.text();
      PH.setExact(false);
      PH.toggle();
    } catch (e) { out.error = String(e && e.message || e); try { PH.setExact(false); if (PH.on) PH.toggle(); } catch (e2) {} }
    cur.breakdowns.push(out); save();
  }

  /* ---------- the camera ---------- */
  let BASE = null;
  function setCam(c){ camGoal.set(c.x, camGoal.y, c.z); camT.copy(camGoal); zoom = zoomT = c.zoom; yaw = yawT = c.yaw; }
  const noon = () => { S.cycle = false; S.hour = 12; S.rain = false; };
  const turn = rate => dt => { yawT += rate*dt; };
  const pan = speed => (dt, t) => { const a = t/1000*.6; camGoal.x = BASE.x + Math.sin(a)*speed; camGoal.z = BASE.z + Math.sin(a*.7)*speed*.6; };

  /* ---------- waiting for the city ---------- */
  async function waitLoaded(){
    const t0 = now();
    for (;;){
      await sleepFrames();
      const busy = (typeof LOADP !== 'undefined' && LOADP.on) || STAGE_Q.length || STAGE_READY.length || (typeof WARM_DONE !== 'undefined' && !WARM_DONE);
      if (!busy) break;
      if (now() - t0 > 120000){ cur.loadTimeout = true; break; }
      status(stepLabel + ' · loading' + (typeof LOADP !== 'undefined' && LOADP.on ? ' ' + LOADP.placed + '/' + LOADP.total : ''));
    }
    cur.loadMs = round(now(), 0);   // (from the start of the page)
    try { const nav = performance.getEntriesByType('navigation')[0]; if (nav) cur.domReadyMs = round(nav.domContentLoadedEventEnd, 0); } catch (e) {}
    try { cur.recipeLoad = LOADP.line(); } catch (e) {}
  }

  /* ---------- the parts of the plan ---------- */
  async function basic(short){
    noon(); setCam(BASE); await run(2500);
    await step('still noon', short ? 4000 : 6000);
    await breakdown('still noon');
    await step('slow turn', short ? 6000 : 8000, turn(.25));
    await breakdown('slow turn', turn(.25));
    await step('fast turn', 5000, turn(1.2));
    setCam(BASE);
    if (!short) await step('pan', 5000, pan(6));
    setCam(BASE); zoomT = 60; await run(2500);
    await step('zoomed out still', short ? 4000 : 6000);
    await step('zoomed out slow turn', short ? 5000 : 6000, turn(.25));
    zoomT = 5; await run(2000);
    await step('zoomed in close', 4000);
    setCam(BASE); S.hour = 22; S.rain = true; await run(2500);
    await step('night rain', short ? 4000 : 6000);
    if (!short) await breakdown('night rain');
    noon(); setCam(BASE);
  }
  const EFFECTS = ['bloom', 'vclouds', 'rays', 'mist', 'ao', 'wetOn', 'rim', 'grade', 'outlines'];
  function shadowsOn(v){ renderer.shadowMap.enabled = v; for (const m of ALL_MATS.concat([ATLAS, ATLAS_SIDE])) m.needsUpdate = true; if (v) try { shadowDirty = true; } catch (e) {} }
  async function effects(){
    noon(); setCam(BASE); await run(2000);
    const base = await step('effects: all on (baseline)', 5000, null, 1500);
    cur.effects = { baseline: base.mean, off: {} };
    for (const k of EFFECTS){
      if (!(k in S)) continue;
      const was = S[k]; S[k] = false;
      const r = await step('effects: ' + k + ' off', 4000, null, 1500);
      cur.effects.off[k] = { mean: r.mean, p95: r.p95, saves: round(base.mean - r.mean) };
      S[k] = was;
    }
    shadowsOn(false); { const r = await step('effects: shadows off', 4000, null, 2500); cur.effects.off.shadows = { mean: r.mean, p95: r.p95, saves: round(base.mean - r.mean) }; } shadowsOn(true);
    for (const k of EFFECTS) if (k in S) S[k] = false;
    shadowsOn(false); { const r = await step('effects: everything off', 4000, null, 2500); cur.effects.allOff = { mean: r.mean, p95: r.p95, saves: round(base.mean - r.mean) }; }
    for (const k of EFFECTS) if (k in S) S[k] = true; shadowsOn(true);
    const lines0 = RENDER_LINES;
    for (const n of [480, 240]){ setRenderLines(n); const r = await step('pixels ' + n + 'p', 4000, null, 2000); cur.effects['lines' + n] = { mean: r.mean, p95: r.p95, saves: round(base.mean - r.mean), render: r.render }; }
    setRenderLines(lines0); await run(1000);
  }
  async function soak(sec){
    noon(); setCam(BASE); await run(2000);
    cur.soak = { slices: [], batteryStart: await battery() };
    const t0 = now(), f = turn(.25);
    for (let i = 0; i < sec/10*QUICK; i++){
      status(stepLabel + ' · warm-up test ' + Math.round((now() - t0)/1000) + ' / ' + sec + ' s');
      const r = await run(10000, f, 0); const s = stats(r.ms);
      cur.soak.slices.push({ t: (i + 1)*10, fps: s.fps, mean: s.mean, p95: s.p95, over33: s.over33, hidden: r.hidden || undefined }); save();
    }
    cur.soak.batteryEnd = await battery();
  }

  /* ---------- the run ---------- */
  let R = null, cur = null, stepLabel = '';
  const save = () => { if (R) ss.set(R); };
  async function startRun(){
    closeCard();
    R = { v: VERSION, id: 'r' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6), started: new Date().toISOString(),
      page: location.origin + location.pathname, build: (document.querySelector('script[src*="main.js"]') || {}).src || null, device: await deviceInfo(), i: 0, items: [] };
    save(); next();
  }
  // to the next item: its test city into sessionStorage, then a reload (benchboot.js gives the new page that city, in memory)
  async function next(){
    if (R.i >= PLAN.length) return finish();
    const item = PLAN[R.i];
    status('Benchmark ' + (R.i + 1) + ' / ' + PLAN.length + ' · fetching ' + item.scene);
    let storage = {};
    try { const sc = await (await fetch(SCENES + item.scene + '.json', { cache: 'no-store' })).json(); storage = sc.storage || {};
      for (const k of ['neonIsland.bmenuOpen', 'neonIsland.tmenuOpen', 'neonIsland.radioHost']) delete storage[k];   // (open menus would cover the city on a phone)
      R.cams = R.cams || {}; R.cams[item.scene] = sc.cam; }
    catch (e) { R.items.push({ plan: item, error: 'could not fetch the test city: ' + e.message }); R.i++; save(); return next(); }
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(storage)); } catch (e) { R.items.push({ plan: item, error: 'the test city did not fit in sessionStorage' }); R.i++; save(); return next(); }
    R.pending = { i: R.i, at: Date.now() }; save();
    location.reload();
  }
  async function runItem(){
    const item = PLAN[R.i];
    cur = { plan: item, scene: item.scene, steps: [], breakdowns: [], startedAt: new Date().toISOString() };
    R.items.push(cur); R.pending = { i: R.i, at: Date.now(), running: true }; save();
    stepLabel = 'Benchmark ' + (R.i + 1) + ' / ' + PLAN.length + ' · ' + item.scene;
    blockTouches(true);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
    await waitLoaded();
    BASE = (R.cams && R.cams[item.scene]) || { x: 0, z: 0, zoom: 16, yaw: .7 };
    try { if (item.soak) await soak(item.soak); else { await basic(item.steps === 'short'); if (item.effects) await effects(); } }
    catch (e) { cur.error = String(e && e.stack || e).slice(0, 600); }
    try { cur.frameErrors = FRAME_ERR.n; if (FRAME_ERR.n) cur.lastFrameError = FRAME_ERR.last; } catch (e) {}
    cur.endedAt = new Date().toISOString();
    R.i++; delete R.pending; save();
    next();
  }
  async function finish(){
    status('Benchmark · sending results');
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    R.ended = new Date().toISOString(); R.batteryEnd = await battery();
    delete R.pending; save();
    const body = JSON.stringify(R), meta = { name: (R.device.model || R.device.gpu || 'phone').slice(0, 60), kind: 'bench', v: VERSION };
    let sent = false, err = '';
    for (let k = 0; k < 3 && !sent; k++){
      try { const r = await fetch(SERVER + '/saves/' + USER + '/' + R.id, { method: 'PUT', body, headers: { 'Content-Type': 'application/json', 'X-Meta': JSON.stringify(meta) } }); sent = r.ok; if (!r.ok) err = 'server said ' + r.status; }
      catch (e) { err = e.message; }
      if (!sent) await new Promise(r => setTimeout(r, 1500));
    }
    blockTouches(false); if (pill) pill.remove();
    const fps = (R.items.find(x => x.scene === 'city' && x.steps && x.steps.length) || { steps: [] }).steps.find(s => s.name === 'slow turn');
    const c = card('<h2>' + (sent ? 'Benchmark done' : 'Benchmark done, not sent') + '</h2>' +
      (sent ? '<p>Results sent. Run ID:</p><p class="id">' + R.id + '</p><p>They land in the repository (branch <b>bench-results</b>) within the hour, or Claude can read them right away by that ID.</p>'
            : '<p>Sending failed (' + err + '). Copy the text below or download the file and attach it in the chat.</p><textarea readonly></textarea>') +
      (fps ? '<p>Medium city, slow turn: <b>' + fps.fps + ' fps</b>, 95% of frames under ' + fps.p95 + ' ms.</p>' : ''),
      [['Download results', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = 'neon-bench-' + R.id + '.json'; document.body.appendChild(a); a.click(); a.remove(); }],
       ['Back to the game', () => { try { sessionStorage.removeItem(RUN_KEY); } catch (e) {} location.href = location.pathname; }, true],
       ['Run again', () => { try { sessionStorage.removeItem(RUN_KEY); } catch (e) {} location.reload(); }, true]]);
    const ta = c.querySelector('textarea'); if (ta) ta.value = body;
  }

  /* ---------- start-up ---------- */
  R = ss.get();
  if (R && R.pending){
    if (R.pending.running){   // the page went away in the middle of an item: the phone ran out of memory, or the tab was killed
      const last = R.items[R.items.length - 1]; if (last) last.crashed = 'the page reloaded or was killed during this test (often the phone running out of memory)';
      R.i++; delete R.pending; save(); next();
    } else runItem();
  } else if (R && R.ended) finish();
  else {
    R = null;
    card('<h2>Phone benchmark</h2><p>Measures how Neon Terrarium runs on this device and sends the numbers back so they can be used to speed up the phone version.</p>' +
      '<ul><li>Takes about 10 minutes.</li><li>Hold the phone upright and don\'t touch the screen until it says done.</li><li>Keep the screen on and the browser in front. Close other apps first.</li>' +
      '<li>Plugged in or not is fine (it\'s noted).</li><li>Your own city is not touched: the test cities live only on this page.</li></ul>',
      [['Start', b => { b.disabled = true; startRun(); }], ['Back to the game', () => { location.href = location.pathname; }, true]]);
  }
})();
