// Neon Terrarium: the performance overlay (F3, or the ` key). Where each frame's time goes on this machine: the
// processor's time per part of the simulation and per render pass, the graphics card's time per pass (timer queries,
// where the browser offers them), the draw calls and triangles of each pass, and a graph of the last frames with the
// shadow redraws marked. "Copy numbers" puts a plain-text summary on the clipboard. Costs nothing while it's hidden.
// "Exact timing" (the button, or Shift+F3) is for browsers whose timer queries can't be trusted: before and after each
// pass it waits until the graphics card has finished everything queued so far, so the time between is what that pass
// alone costs it. The waiting stops the processor and the card working side by side, so the frame rate drops while it's
// on; the per-pass times are what count. In this mode the glow passes are also timed one by one (sky.js).
// What the page has asked the graphics card to hold (textures, buffers, renderbuffers), counted where it is asked: the allocation and the free, never per draw, so it costs nothing in a frame.
// An estimate (no mip chains beyond a flat third, no driver padding); `window.__GPUMEM` = { tex, buf, rb } in bytes. The F3 overlay shows it with the object counts, to see build-up as it happens.
const GPUMEM = window.__GPUMEM = { tex: 0, buf: 0, rb: 0, links: 0, dels: 0, freed: 0 };
(() => {
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype; if (!P) return;
  const sz = new WeakMap(), put = (k, o, b) => { if (!o) return; GPUMEM[k] += b - (sz.get(o) || 0); sz.set(o, b); };
  const BPP = { 0x8058: 4, 0x881A: 8, 0x8814: 16, 0x81A6: 3, 0x81A7: 4, 0x81A5: 2, 0x8CAC: 4, 0x88F0: 4, 0x8051: 3, 0x8D48: 1, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x8235: 4, 0x8C43: 4, 0x8C41: 3, 0x8059: 4, 0x8056: 2, 0x8D62: 2, 0x8C3A: 4, 0x8DAD: 8, 0x8226: 1, 0x822E: 4, 0x8230: 8, 0x8815: 12, 0x881B: 6, 0x8D7C: 4 };
  const TYP = { 0x1401: 4, 0x140B: 8, 0x1406: 16, 0x8D61: 8 };
  const bpp = (f, t) => f === 0x1908 || f === 0x1907 || f === 0x1903 || f === 0x8227 || f === 0x1902 ? (TYP[t] || 4)*(f === 0x1903 ? .25 : f === 0x8227 ? .5 : 1) : (BPP[f] || 4);
  const TB = { 0x0DE1: 0x8069, 0x8C1A: 0x8C1D, 0x806F: 0x806A, 0x8513: 0x8514 }, BB = { 0x8892: 0x8894, 0x8893: 0x8895 };   // (a target's binding query: TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D, cube map; ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER)
  const ts = P.texStorage2D; P.texStorage2D = function(t, l, f, w, h){ const q = TB[t]; if (q) put('tex', this.getParameter(q), w*h*(BPP[f] || 4)*(l > 1 ? 1.34 : 1)); return ts.apply(this, arguments); };
  const ti = P.texImage2D; P.texImage2D = function(t, l, f, w, h){ const q = TB[t];
    if (q && l === 0){ if (typeof w === 'number' && typeof h === 'number' && arguments.length >= 9) put('tex', this.getParameter(q), w*h*bpp(f, arguments[7])*1.34); else if (arguments.length <= 6){ const img = arguments[5]; if (img && img.width) put('tex', this.getParameter(q), img.width*img.height*4*1.34); } }
    return ti.apply(this, arguments); };
  const rs = P.renderbufferStorage; P.renderbufferStorage = function(t, f, w, h){ put('rb', this.getParameter(0x8CA7), w*h*(BPP[f] || 4)); return rs.apply(this, arguments); };
  const rm = P.renderbufferStorageMultisample; P.renderbufferStorageMultisample = function(t, n, f, w, h){ put('rb', this.getParameter(0x8CA7), n*w*h*(BPP[f] || 4)); return rm.apply(this, arguments); };
  const bd = P.bufferData; P.bufferData = function(t, d){ const q = BB[t]; if (q) put('buf', this.getParameter(q), typeof d === 'number' ? d : d.byteLength); return bd.apply(this, arguments); };
  const dt = P.deleteTexture; P.deleteTexture = function(o){ if (o) put('tex', o, 0); GPUMEM.dels++; return dt.call(this, o); };
  const lp = P.linkProgram; P.linkProgram = function(o){ GPUMEM.links++; return lp.call(this, o); };   // (program links and resource frees are counted too: a trace shows which frames did them)
  const db = P.deleteBuffer; P.deleteBuffer = function(o){ if (o){ GPUMEM.freed += sz.get(o) || 0; put('buf', o, 0); } GPUMEM.dels++; return db.call(this, o); };
  const dr = P.deleteRenderbuffer; P.deleteRenderbuffer = function(o){ if (o) put('rb', o, 0); return dr.call(this, o); };
})();
const PH = (() => {
  let on = false, exact = false, el = null, graph = null, body = null, lastShow = 0, exBtn = null, testBar = null;
  // Tests (exact mode only, to find out what the color pass is spending its time on; they change the picture while on):
  // quarter: the color pass draws into a quarter of the pixels (the triangles are the same), plain: every surface drawn
  // in one plain material (the same triangles, almost no shading), shadows: surfaces don't look up the shadow map.
  // lean: the buildings' shader without the view position it passes but never uses (same picture); no glow math: lights
  // don't switch on, flicker or blink; no color data: the buildings' colors and glow aren't read at all.
  const tests = { quarter: false, plain: false, shadows: false, lean: false, noGlow: false, noData: false, cutoutsLast: false, compAll: false, compFloor: false, compNoShim: false, gbuf: false, noCull: false, noSmall: false, noSlowFar: false, noStatic: false, showRebuilds: false, walkAll: false, fullRate: false, noRing: false, copyByBlit: false, noSpeed: false, noRect: false, noHold: false, softFull: false, noLiveCull: false, syncNow: false, keepCpu: false, lurkScan: false, slowFree: false, steamFull: false, sdOld: false, slowSync: false, steamMapAlways: false, doorsTwo: false, ovPerBlock: false, drawNever: false, stageNow: false, alertNow: false, nvBackfill: false, slowShadowJump: false, leanRound: false, thinSticks: false, stripsAfterTurn: false, genMain: false, keepGeo: false, tierOff: false, tierAll: false, tierShow: false, loadMain: false, nvOld: false, netOld: false, nvPerView: false, nvTiles: false, foliageLodOff: !!window.__FOL_LOD_OFF, oldPeople: !!window.__OLD_PEOPLE, softApart: false, turnOldWay: false, wholeAfterTurn: false, uploadOnDraw: false, disposeNow: false }, plainMat = new THREE.MeshBasicMaterial({ color: 0x8a8f99 });
  const TEST_NAMES = { quarter: 'quarter of the pixels', plain: 'plain shading', shadows: 'no surface shadows', lean: 'lean buildings (same picture)', noGlow: 'no glow math', noData: 'no color data', cutoutsLast: 'cut-outs drawn last (same picture)', compAll: 'composite: every effect compiled in (same picture)', compFloor: 'composite: no effects', compNoShim: 'composite: no air shimmer (pads, metro)', gbuf: 'buildings: colors only, no lighting', noCull: 'no per-plot culling (same picture)', noSmall: 'draw sub-pixel triangles too', noSlowFar: 'people off screen at full rate', noStatic: 'no static cache', showRebuilds: 'show cache redraws (red)', walkAll: 'walk every matrix (same picture)', fullRate: 'people at full rate', noRing: 'no ring: redraw the cache whole at the edge', copyByBlit: 'copy the cache by blitting (not drawing)', noSpeed: 'no speed-based detail', noRect: 'redraw the cache whole on edits', noHold: 'strips drawn with the current lights (not the cache\'s)', softFull: 'soft effects at full resolution', noLiveCull: 'live pass: everything in the widened view (as before)', syncNow: 'edit upkeep in the same frame (as before)', keepCpu: 'keep the CPU copies of merged geometry', lurkScan: 'lurkers scan every walker (same picture)', slowFree: 'bike routes: a key lookup per point (same picture)', steamFull: 'steam: every puff in full (same picture)', sdOld: 'turn detail: start at 10 px a frame (as before)', slowSync: 'edit upkeep: a key string per path point (same picture)', steamMapAlways: 'steam map: rebuilt at every edit (same picture)', doorsTwo: 'doors: two passes over the people (same picture)', ovPerBlock: 'glow overlay: one draw per region (same picture)', drawNever: 'draw never-seen faces too', stageNow: 'plots built in one frame (as before)', alertNow: 'police alert in one frame (as before)', nvBackfill: 'never-seen backfill', slowShadowJump: 'shadows follow a jump of the sun in strips (as before)', leanRound: 'lean round parts (cheat)', thinSticks: 'thin sticks, narrow arc (cheat)', stripsAfterTurn: 'after a turn: the picture in strips (as yesterday)', genMain: 'generation on the main thread (as before)', keepGeo: 'keep the plots\' own geometry (as before)', tierOff: 'full detail everywhere (as before)', tierAll: 'stand-in tier everywhere (to measure)', tierShow: 'show tiers (stand-ins tinted)', loadMain: 'load on the main thread (as before)', nvOld: 'never-seen: whole boxes (as before)', nvPerView: 'never-seen: one view a draw, boxes only (as before)', nvTiles: 'never-seen: several views in one target (not exact)', oldPeople: 'old people (as before)', softApart: 'soft effects: three passes (as before)', turnOldWay: 'after a turn, the old way until the picture is done (as before)', wholeAfterTurn: 'after a turn: the whole picture at once (as before)', uploadOnDraw: 'merged blocks sent to the card by their first draw (as before)', disposeNow: 'old merges freed at once (as before)', foliageLodOff: 'plants: no culling or distance savings (as before)', netOld: 'walking network: door searches and door meshes on the page in one call (as before)' };
  const gl = renderer.getContext(), info = renderer.info;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const N = 180;   // frames of history
  const stats = new Map();   // name -> { kind: 'sim' | 'pass', cpu, gpu, calls, tris } (ring buffers)
  const ring = () => ({ a: new Float64Array(N), n: 0, i: 0 });
  const put = (r, v) => { r.a[r.i] = v; r.i = (r.i + 1) % N; if (r.n < N) r.n++; };
  const avg = r => { if (!r.n) return NaN; let s = 0; for (let k = 0; k < r.n; k++) s += r.a[k]; return s/r.n; };
  const pct = (r, p) => { if (!r.n) return NaN; const b = Array.from(r.a.subarray(0, r.n)).sort((x, y) => x - y); return b[Math.min(r.n - 1, Math.floor(p*r.n))]; };
  const stat = (name, kind) => { let s = stats.get(name); if (!s) stats.set(name, s = { kind, cpu: ring(), gpu: ring(), ex: ring(), calls: ring(), tris: ring() }); return s; };
  const frameMs = ring(), jsMs = ring(), gpuMs = ring(), shadowMs = ring(), exMs = ring();
  let exFrame = 0;   // this frame's exact pass times added up
  const hist = [];   // per frame, for the graph: [frame ms, shadow redrawn?]
  let lastRaf = 0, t0 = 0, mark = 0, cur = null, gpuFrame = 0, shadowFrame = false, frameNo = 0, shadowTimes = [];
  const free = [], pending = [];
  // a trace: every frame's laps and passes, by name, with the processor time of each, kept in a list while PH.traceStart() has been called
  // (tools/perf/turn_check.py: what the slow frames of a turn were doing). Only while the overlay is on.
  let TR = null, trF = null;
  // (while a trace runs the overlay is out of the way: it takes no pointer events and is not drawn, so a scripted drag lands on the city, not on it)
  function traceStart(){ TR = []; trF = null; if (el){ el.style.pointerEvents = 'none'; el.style.visibility = 'hidden'; } }
  function traceStop(){ collect(); const t = TR; TR = null; trF = null; if (el){ el.style.pointerEvents = 'auto'; el.style.visibility = ''; } return t; }   // (the card's times arrive a few frames late: the last frames' may be missing)
  const trPut = (name, ms) => { if (trF) trF.laps.push([name, Math.round(ms*100)/100]); };
  // work outside the frame (an input handler): noted against the frame being traced, under its own name
  function outside(name, ms){ if (on && trF) trPut('outside the frame: ' + name, ms); }
  // The hitch catcher (while the overlay is open): every frame is noted as a trace frame is, the last few kept; when the gap from one frame to the next is over
  // HITCH_MS, that frame and the ones before it are kept with the game's state (PH.state, set by main.js) and the slowest single draw of each (world.js).
  // A frame whose script took far less than the gap lost the rest outside it: the browser, the engine's garbage collector, or waiting for the graphics card.
  // "Copy hitches" puts them on the clipboard. (Only while the overlay is open: closed, it costs nothing.)
  const HITCH_MS = 30, RING = [], HITCHES = []; let hitchSeen = 0;
  const draw = { ms: 0, o: null, m: null, fn: null, n: 0, first: 0 };   // (the slowest draw of the frame being drawn: world.js PH.drawTimed; its name is made only at the frame's end)
  function drawTimed(ms, o, m, first, fn){ draw.n++; if (first) draw.first++; if (ms > draw.ms){ draw.ms = ms; draw.o = o; draw.m = m; draw.fn = fn; } }
  function frameStart(now){
    if (!on) return;
    if (trF){ trF.up = Math.round((GPUMEM.buf + GPUMEM.tex - trF.g0)/1024); trF.links = GPUMEM.links - trF.l0; trF.dels = GPUMEM.dels - trF.d0; trF.freed = Math.round((GPUMEM.freed - trF.f0)/1024);
      if (TR) TR.push(trF); RING.push(trF); if (RING.length > 8) RING.shift();
      if (lastRaf){ const d = now - lastRaf; trF.gap = Math.round(d*10)/10;
        if (d > HITCH_MS && d < 3000){ hitchSeen++; HITCHES.push({ gap: trF.gap, at: performance.now(), frames: RING.slice(-5), after: [] }); if (HITCHES.length > 24) HITCHES.shift(); }
        for (const h of HITCHES) if (h.after.length < 2 && h.frames[h.frames.length - 1] !== trF && !h.frames.includes(trF)) h.after.push(trF); } }
    trF = { at: now, frame: frameNo + 1, laps: [], g0: GPUMEM.buf + GPUMEM.tex, l0: GPUMEM.links, d0: GPUMEM.dels, f0: GPUMEM.freed, gpu: null };   // (up: what the frame sent to the card, KB)
    draw.ms = 0; draw.o = draw.m = draw.fn = null; draw.n = 0; draw.first = 0;
    if (lastRaf){ const d = now - lastRaf; if (d < 500){ put(frameMs, d); hist.push([d, shadowFrame]); if (hist.length > N) hist.shift(); } }
    lastRaf = now; frameNo++; shadowFrame = false;
    t0 = mark = performance.now();
    info.autoReset = false; info.reset();
    if (exact) exFrame = 0; else collect();
  }
  // Exact timing: wait until the graphics card has finished what's been queued. finish() alone isn't trusted (some
  // browsers return before the card is done), so one pixel is also read back from the target the last pass drew into:
  // nothing can be read before the drawing that writes it is done, and a pass draws only after the passes it reads from.
  // (A pixel read from anything else may not wait: the browser can tell it has nothing pending.)
  const px = new Uint8Array(4);
  function sync(){ gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  // simulation time since the last mark, under a name
  function lap(name){ if (!on) return; const t = performance.now(); put(stat(name, 'sim').cpu, t - mark); trPut(name, t - mark); mark = t; }
  // a render pass: processor time to issue it, graphics card time to draw it, its draws and triangles. A pass inside
  // another (sub = true: the glow passes) is timed only in exact mode, since timer queries can't be nested.
  const stack = [];
  function begin(name, sub){
    if (!on) return;
    if (sub && !exact){ stack.push(null); return; }
    stat(name, sub ? 'sub' : 'pass');   // (listed in the order the passes start, so a pass comes before those inside it)
    if (exact) sync();   // everything before this pass is done
    const t = performance.now(); mark = t;
    cur = { name, sub: !!sub, t, c: info.render.calls, tr: info.render.triangles + info.render.points + info.render.lines, q: null };
    if (ext && !exact){ const q = free.pop() || gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); cur.q = q; }
    stack.push(cur);
  }
  // a frame that failed part way (main.js): passes left open are closed, so the next frame's timer queries can start
  function abort(){ while (stack.length){ const c = stack.pop(); if (c && c.q){ gl.endQuery(ext.TIME_ELAPSED_EXT); free.push(c.q); } } cur = null; }
  function end(){
    if (!on || !stack.length) return;
    const c = stack.pop(); cur = stack.length ? stack[stack.length - 1] : null;
    if (!c) return;
    if (c.q){ gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q: c.q, name: c.name, frame: frameNo }); }
    const s = stat(c.name, c.sub ? 'sub' : 'pass');
    let t = performance.now();
    put(s.cpu, t - c.t); put(s.calls, info.render.calls - c.c); put(s.tris, info.render.triangles + info.render.points + info.render.lines - c.tr); trPut(c.name, t - c.t);
    if (exact){ sync(); t = performance.now(); put(s.ex, t - c.t); if (!c.sub){ exFrame += t - c.t; if (c.name === 'color + shadow redraw') put(shadowMs, t - c.t); } }
    mark = t;
  }
  // sections inside a lap (the people lap, say): their times are listed apart, not added into the laps' sum. The real clock where the
  // harness scripts performance.now (tools/perf).
  const rnow = () => typeof __realNow === 'function' ? __realNow() : performance.now();
  let subMark = 0;
  function subBegin(){ if (on) subMark = rnow(); }
  function sub(name){ if (!on) return; const t = rnow(); put(stat(name, 'subsim').cpu, t - subMark); trPut('  ' + name, t - subMark); subMark = t; }
  function laps(){ const o = {}; for (const [k, s] of stats) if (s.kind === 'sim' || s.kind === 'subsim') o[k] = avg(s.cpu); return o; }
  function shadow(){ if (on && renderer.shadowMap.needsUpdate){ shadowFrame = true; shadowTimes.push(performance.now()); } }
  // When the card finished each frame: a fence put in after the frame's last command, looked at every few milliseconds (a timer) until it has passed. The
  // time from the frame's commands being sent to that is the card's (and the browser's graphics process's) time for it, queue included: a frame that waits
  // behind a slow one shows it too. Coarse (a few ms), but needs no timer queries, which this browser's card reports wrongly. With the JS heap's size, so a
  // drop between frames (the garbage collector) shows.
  const FENCES = []; let fencePoll = 0;
  function fenceCheck(){
    fencePoll = 0; const t = performance.now();
    for (let k = 0; k < FENCES.length; k++){ const f = FENCES[k];
      let done = false; try { done = gl.getSyncParameter(f.s, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e){ done = true; }
      if (done || t - f.t > 2000){ f.fr.card = done ? Math.round(t - f.t) : -1; gl.deleteSync(f.s); FENCES.splice(k--, 1); } }
    if (FENCES.length && on) fencePoll = setTimeout(fenceCheck, 2);
  }
  function fencePut(fr){
    if (!gl.fenceSync) return;
    const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); if (!s) return; gl.flush();
    FENCES.push({ s, t: performance.now(), fr }); if (FENCES.length > 12){ const o = FENCES.shift(); gl.deleteSync(o.s); }
    if (!fencePoll) fencePoll = setTimeout(fenceCheck, 2);
  }
  function frameEnd(){
    if (!on) return;
    if (trF){ fencePut(trF); const m = performance.memory; trF.heap = m ? Math.round(m.usedJSHeapSize/1048576) : 0; }
    put(jsMs, performance.now() - t0); if (trF){ trF.js = Math.round((performance.now() - t0)*100)/100; trF.draw = draw.n && draw.o ? draw.fn(draw.o, draw.m) + ' ' + draw.ms.toFixed(1) + ' ms (of ' + draw.n + ' draws, ' + draw.first + ' drawn for the first time)' : '';
      trF.calls = info.render.calls; trF.tris = info.render.triangles; trF.progs = info.programs ? info.programs.length : 0; trF.geos = info.memory.geometries;
      try { trF.st = (shadowFrame ? 'SHADOW MAP REDRAWN WHOLE THIS FRAME; ' : '') + (PH.state ? PH.state() : ''); } catch (e){ trF.st = 'state: ' + e.message; } }
    if (exact) put(exMs, exFrame);
    if (performance.now() - lastShow > 250){ lastShow = performance.now(); show(); }
  }
  // graphics card timings arrive a few frames late
  const gpuOf = new Map();   // frame -> { sum, left, shadow }
  function collect(){
    if (!ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (let k = 0; k < pending.length; k++){
      const p = pending[k];
      if (!disjoint && !gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint){ const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT)/1e6; put(stat(p.name, 'pass').gpu, ms);
        let f = gpuOf.get(p.frame); if (!f) gpuOf.set(p.frame, f = { sum: 0 }); f.sum += ms; if (p.name === 'color + shadow redraw') put(shadowMs, ms);
        if (TR){ const e = p.frame === (trF && trF.frame) ? trF : TR.find(x => x.frame === p.frame); if (e){ e.gpu = Math.round(((e.gpu || 0) + ms)*100)/100; (e.gpuBy = e.gpuBy || []).push([p.name, Math.round(ms*100)/100]); } } }
      free.push(p.q); pending.splice(k--, 1);
    }
    for (const [f, v] of gpuOf) if (f < frameNo - 1 && !pending.some(p => p.frame === f)){ put(gpuMs, v.sum); gpuOf.delete(f); }
    if (pending.length > 200){ for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  }
  const f1 = v => isNaN(v) ? '  -  ' : v.toFixed(1).padStart(5);
  const big = v => isNaN(v) ? '-' : v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? (v/1e3).toFixed(0) + 'k' : v.toFixed(0);
  function text(){
    const fps = 1000/avg(frameMs), L = [];
    L.push(`Neon Terrarium performance   ${new Date().toISOString().slice(0, 16)}`);
    L.push(`FPS ${fps.toFixed(0)}   frame ${avg(frameMs).toFixed(1)} ms (95% under ${pct(frameMs, .95).toFixed(1)}, worst ${pct(frameMs, 1).toFixed(1)})`);
    const tOn = Object.keys(tests).filter(k => tests[k]);
    if (tOn.length) L.push('TEST RUNNING (picture changed): ' + tOn.map(k => TEST_NAMES[k]).join(', '));
    if (exact){
      L.push(`EXACT TIMING: each pass waits for the graphics card, so FPS is lower than in play; the pass times are what count`);
      L.push(`main thread ${avg(jsMs).toFixed(1)} ms (includes the waiting)   all passes, exact ${exMs.n ? avg(exMs).toFixed(1) + ' ms' : 'measuring'}`);
    } else L.push(`main thread ${avg(jsMs).toFixed(1)} ms   graphics card ${!ext ? 'n/a (this browser has no GPU timers)' : gpuMs.n ? avg(gpuMs).toFixed(1) + ' ms' : 'measuring'}`);
    L.push(`render ${W}x${H} of ${DW}x${DH}   zoom ${zoom.toFixed(1)}   people ${typeof pplList !== 'undefined' ? pplList.length : '-'}   plots ${cells.size}`);
    L.push(`building pieces drawn ${CULL.drawn} of ${CULL.total} (the rest are off screen)`);
    { const m = info.memory, MB = v => (v/1048576).toFixed(0); L.push(`graphics: ${info.render.calls} draws a frame   on the card: ${m.geometries} geometries, ${m.textures} textures, ${info.programs ? info.programs.length : '-'} programs   about ${MB(GPUMEM.tex + GPUMEM.buf + GPUMEM.rb)} MB (textures ${MB(GPUMEM.tex)}, buffers ${MB(GPUMEM.buf)}, render buffers ${MB(GPUMEM.rb)})`); }
    if (typeof SC !== 'undefined') L.push(SC.line());
    if (typeof SD !== 'undefined') L.push(SD.line());
    if (typeof PPLRATE !== 'undefined') L.push(tests.fullRate ? 'people stepped every frame (full rate: on)' : `people stepped every ${PPLRATE.n} frames when typical size; people at each rate 1/2/3/4: ${PPLRATE.hist.slice(1).join(' / ')}`);
    const now = performance.now(); shadowTimes = shadowTimes.filter(t => now - t < 10000);
    L.push(`shadow redraws in the last 10 s: ${shadowTimes.length}` + (shadowMs.n ? `   (graphics card ${avg(shadowMs).toFixed(1)} ms each)` : ''));
    L.push('');
    L.push(exact ? '                              cpu ms exact ms  draws  triangles' : '                              cpu ms  gpu ms   draws  triangles');
    let simSum = 0;
    for (const [k, s] of stats) if (s.kind === 'sim') simSum += avg(s.cpu);
    L.push(`simulation and upkeep          ${f1(simSum)}`);
    for (const [k, s] of stats) if (s.kind === 'sim') L.push(`  ${k.padEnd(28)}${f1(avg(s.cpu))}`);
    { const subs = [...stats].filter(([k, s]) => s.kind === 'subsim'); if (subs.length){ L.push('detail inside the laps above:'); for (const [k, s] of subs) L.push(`  ${k.padEnd(28)}${f1(avg(s.cpu))}`); } }
    // passes in the order they ran, each followed by the passes timed inside it
    const row = (label, s) => `${label.padEnd(30)}${f1(avg(s.cpu))}   ${f1(avg(exact ? s.ex : s.gpu))}  ${big(avg(s.calls)).padStart(6)}  ${big(avg(s.tris)).padStart(9)}`;
    for (const [k, s] of stats) L.push(...(s.kind === 'pass' ? [row(k, s)] : s.kind === 'sub' ? [row('  ' + k, s)] : []));
    if (exact){
      // the costliest single passes (a pass that has passes timed inside it is counted through those instead)
      const leaf = [], parents = new Set();
      let prev = null;
      for (const [k, s] of stats){ if (s.kind === 'sub' && prev) parents.add(prev); if (s.kind === 'pass') prev = k; }
      for (const [k, s] of stats) if ((s.kind === 'pass' && !parents.has(k)) || s.kind === 'sub') if (s.ex.n) leaf.push([k, avg(s.ex), pct(s.ex, .95)]);
      leaf.sort((a, b) => b[1] - a[1]);
      if (leaf.length){ L.push(''); L.push('costliest passes, exact (mean, 95% under):');
        leaf.slice(0, 5).forEach(([k, m, p], i) => L.push(`  ${i + 1}. ${k.padEnd(26)}${f1(m)}  ${f1(p)} ms`)); }
    }
    return L.join('\n');
  }
  function hitchText(){
    const L = ['Neon Terrarium hitches   ' + new Date().toISOString().slice(0, 16) + '   ' + hitchSeen + ' gaps over ' + HITCH_MS + ' ms since the overlay opened (the last ' + HITCHES.length + ' below, oldest first)', ''];
    const t0 = HITCHES.length ? HITCHES[0].at : 0;
    for (const h of HITCHES){
      const f = h.frames[h.frames.length - 1];
      L.push('GAP ' + h.gap + ' ms at ' + ((h.at - t0)/1000).toFixed(1) + ' s: the frame before it ran ' + f.js + ' ms of script, so ' + Math.max(0, h.gap - f.js).toFixed(1) + ' ms went outside the script');
      for (const g of h.frames.concat(h.after)){
        const laps = g.laps.slice().sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0].trim() + ' ' + x[1].toFixed(1)).join(', ');
        L.push('  frame ' + g.frame + (g === f ? ' (the slow one)' : h.after.includes(g) ? ' (after)' : '') + ': gap after ' + (g.gap === undefined ? '-' : g.gap) + ' ms, script ' + g.js + ' ms; ' + laps);
        L.push('     the card finished it ' + (g.card === undefined ? '?' : g.card < 0 ? 'never seen' : g.card + ' ms') + ' after it was sent; JS heap ' + g.heap + ' MB');
        L.push('     sent ' + g.up + ' KB, linked ' + g.links + ', freed ' + g.dels + ' (' + g.freed + ' KB); ' + g.calls + ' draws, ' + (g.tris/1e6).toFixed(2) + 'M triangles, ' + g.progs + ' programs, ' + g.geos + ' geometries; slowest draw: ' + (g.draw || '-'));
        if (g.st) L.push('     ' + g.st);
      }
      L.push('');
    }
    if (!HITCHES.length) L.push('(no gaps yet: play with the overlay open, then copy again)');
    return L.join('\n');
  }
  function show(){
    if (!el) return;
    body.textContent = text();
    // the graph: one bar a frame, the 60 fps line, shadow redraws in red
    const g = graph.getContext('2d'), w = graph.width, h = graph.height; g.clearRect(0, 0, w, h);
    const sc = h/50;   // 50 ms tall
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h - 16.7*sc, w, 1); g.fillRect(0, h - 33.3*sc, w, 1);
    hist.forEach(([ms, sh], k) => { g.fillStyle = sh ? '#ff4f6a' : ms > 16.9 ? '#ffc24a' : '#4fe8b0'; const bh = Math.min(h, ms*sc); g.fillRect(k*(w/N), h - bh, Math.max(1, w/N - .5), bh); });
    g.fillStyle = '#9ab'; g.font = '10px monospace'; g.fillText('60 fps', 2, h - 16.7*sc - 2); g.fillText('30 fps', 2, h - 33.3*sc - 2);
  }
  function build(){
    el = document.createElement('div'); el.id = 'perfHud';
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;background:rgba(8,10,18,.86);color:#d8e4f0;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border:1px solid #2a3550;border-radius:6px;pointer-events:auto;max-width:96vw;overflow:auto;max-height:92vh';
    graph = document.createElement('canvas'); graph.width = 360; graph.height = 70; graph.style.cssText = 'display:block;width:360px;height:70px;margin-bottom:6px;background:rgba(255,255,255,.03)';
    body = document.createElement('pre'); body.style.cssText = 'margin:0;white-space:pre';
    const bar = document.createElement('div'); bar.style.cssText = 'margin-top:6px;display:flex;gap:8px;align-items:center';
    const copy = document.createElement('button'); copy.textContent = 'Copy numbers'; copy.style.cssText = 'font:inherit;padding:2px 8px;cursor:pointer';
    const note = document.createElement('span'); note.style.opacity = '.7'; note.textContent = 'F3 or ` hides';
    exBtn = document.createElement('button'); exBtn.style.cssText = copy.style.cssText; exBtn.onclick = () => setExact(!exact); label();
    copy.onclick = () => { const t = text(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { note.textContent = 'copied'; }, () => { note.textContent = 'select the text and copy it'; }); };
    testBar = document.createElement('div'); testBar.style.cssText = 'margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    const tl = document.createElement('span'); tl.style.opacity = '.7'; tl.textContent = 'Tests:'; testBar.append(tl);
    for (const k in tests){ const b = document.createElement('button'); b.style.cssText = copy.style.cssText;
      const lab = () => { b.textContent = TEST_NAMES[k] + (tests[k] ? ': on' : ': off'); };
      b.onclick = () => { setTest(k, !tests[k]); lab(); clearAll(); }; lab(); b._lab = lab; testBar.append(b); }
    const hc = document.createElement('button'); hc.textContent = 'Copy hitches'; hc.style.cssText = copy.style.cssText;
    hc.onclick = () => { const t = hitchText(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { note.textContent = 'hitches copied (' + HITCHES.length + ')'; }, () => { console.log(t); note.textContent = 'printed to the console'; }); };
    bar.append(copy, hc, exBtn, note); el.append(graph, body, bar, testBar); document.body.appendChild(el); testBar.hidden = !exact;
  }
  function label(){ if (exBtn) exBtn.textContent = 'Exact timing: ' + (exact ? 'on' : 'off'); }
  function clearAll(){ HITCHES.length = 0; RING.length = 0; hitchSeen = 0; trF = null; stats.clear(); hist.length = 0; lastRaf = 0; shadowTimes = []; gpuOf.clear(); for (const r of [frameMs, jsMs, gpuMs, shadowMs, exMs]){ r.n = 0; r.i = 0; }
    for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  // (switched between frames, from a key or the button, so no pass is half timed)
  function setExact(v){ exact = !!v; if (!exact) for (const k in tests) setTest(k, false); if (testBar){ testBar.hidden = !exact; for (const b of testBar.querySelectorAll('button')) b._lab(); } clearAll(); label(); }
  function setTest(k, v){
    if (tests[k] === v) return; tests[k] = v;
    if (k in ATLAS_TEST){ ATLAS_TEST[k] = v; ATLAS.needsUpdate = true; ATLAS_SIDE.needsUpdate = true; }
    if (k === 'foliageLodOff'){ window.__FOL_LOD_OFF = !!v; scene.traverse(o => { if (o.userData.fol) o.frustumCulled = !v; }); }
    if (k === 'oldPeople'){ window.__OLD_PEOPLE = !!v; if (typeof PG.apply === 'function') PG.apply(); }
    if (k === 'shadows'){ renderer.shadowMap.enabled = !v; for (const m of ALL_MATS.concat([ATLAS, ATLAS_SIDE])) m.needsUpdate = true; if (!v) shadowDirty = true; }   // (shaders are rebuilt either way)
  }
  function toggle(){
    on = !on;
    if (on){ if (!el) build(); el.hidden = false; clearAll(); }
    else { setExact(false); if (el) el.hidden = true; info.autoReset = true; for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  }
  addEventListener('keydown', e => { if ((e.key === 'F3' || e.key === '`') && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)){ e.preventDefault();
    if (e.shiftKey){ if (!on) toggle(); setExact(!exact); } else toggle(); } });
  return { frameStart, abort, lap, sub, subBegin, laps, begin, end, shadow, frameEnd, toggle, setExact, text, tests, plainMat, traceStart, traceStop, outside, drawTimed, hitchText, state: null, get on(){ return on; }, get exact(){ return exact; } };
})();
window.PERF_HUD = PH;   // (for scripts with a PH of their own: js/film.js reaches the tests through this)
