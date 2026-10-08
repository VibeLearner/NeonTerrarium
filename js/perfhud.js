// Neon Terrarium: the performance overlay (F3, or the ` key). Where each frame's time goes on this machine: the
// processor's time per part of the simulation and per render pass, the graphics card's time per pass (timer queries,
// where the browser offers them), the draw calls and triangles of each pass, and a graph of the last frames with the
// shadow redraws marked. "Copy numbers" puts a plain-text summary on the clipboard. Costs nothing while it's hidden.
// "Exact timing" (the button, or Shift+F3) is for browsers whose timer queries can't be trusted: before and after each
// pass it waits until the graphics card has finished everything queued so far, so the time between is what that pass
// alone costs it. The waiting stops the processor and the card working side by side, so the frame rate drops while it's
// on; the per-pass times are what count. In this mode the glow passes are also timed one by one (sky.js).
const PH = (() => {
  let on = false, exact = false, el = null, graph = null, body = null, lastShow = 0, exBtn = null, testBar = null;
  // Tests (exact mode only, to find out what the color pass is spending its time on; they change the picture while on):
  // quarter: the color pass draws into a quarter of the pixels (the triangles are the same), plain: every surface drawn
  // in one plain material (the same triangles, almost no shading), shadows: surfaces don't look up the shadow map.
  // lean: the buildings' shader without the view position it passes but never uses (same picture); no glow math: lights
  // don't switch on, flicker or blink; no color data: the buildings' colors and glow aren't read at all.
  const tests = { quarter: false, plain: false, shadows: false, lean: false, noGlow: false, noData: false, cutoutsLast: false, compAll: false, compFloor: false, compNoShim: false }, plainMat = new THREE.MeshBasicMaterial({ color: 0x8a8f99 });
  const TEST_NAMES = { quarter: 'quarter of the pixels', plain: 'plain shading', shadows: 'no surface shadows', lean: 'lean buildings (same picture)', noGlow: 'no glow math', noData: 'no color data', cutoutsLast: 'cut-outs drawn last (same picture)', compAll: 'composite: every effect compiled in (same picture)', compFloor: 'composite: no effects', compNoShim: 'composite: no air shimmer (pads, metro)' };
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
  function frameStart(now){
    if (!on) return;
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
  function lap(name){ if (!on) return; const t = performance.now(); put(stat(name, 'sim').cpu, t - mark); mark = t; }
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
  function end(){
    if (!on || !stack.length) return;
    const c = stack.pop(); cur = stack.length ? stack[stack.length - 1] : null;
    if (!c) return;
    if (c.q){ gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q: c.q, name: c.name, frame: frameNo }); }
    const s = stat(c.name, c.sub ? 'sub' : 'pass');
    let t = performance.now();
    put(s.cpu, t - c.t); put(s.calls, info.render.calls - c.c); put(s.tris, info.render.triangles + info.render.points + info.render.lines - c.tr);
    if (exact){ sync(); t = performance.now(); put(s.ex, t - c.t); if (!c.sub){ exFrame += t - c.t; if (c.name === 'color + shadow redraw') put(shadowMs, t - c.t); } }
    mark = t;
  }
  function shadow(){ if (on && renderer.shadowMap.needsUpdate){ shadowFrame = true; shadowTimes.push(performance.now()); } }
  function frameEnd(){
    if (!on) return;
    put(jsMs, performance.now() - t0);
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
        let f = gpuOf.get(p.frame); if (!f) gpuOf.set(p.frame, f = { sum: 0 }); f.sum += ms; if (p.name === 'color + shadow redraw') put(shadowMs, ms); }
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
    const now = performance.now(); shadowTimes = shadowTimes.filter(t => now - t < 10000);
    L.push(`shadow redraws in the last 10 s: ${shadowTimes.length}` + (shadowMs.n ? `   (graphics card ${avg(shadowMs).toFixed(1)} ms each)` : ''));
    L.push('');
    L.push(exact ? '                              cpu ms exact ms  draws  triangles' : '                              cpu ms  gpu ms   draws  triangles');
    let simSum = 0;
    for (const [k, s] of stats) if (s.kind === 'sim') simSum += avg(s.cpu);
    L.push(`simulation and upkeep          ${f1(simSum)}`);
    for (const [k, s] of stats) if (s.kind === 'sim') L.push(`  ${k.padEnd(28)}${f1(avg(s.cpu))}`);
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
    bar.append(copy, exBtn, note); el.append(graph, body, bar, testBar); document.body.appendChild(el); testBar.hidden = !exact;
  }
  function label(){ if (exBtn) exBtn.textContent = 'Exact timing: ' + (exact ? 'on' : 'off'); }
  function clearAll(){ stats.clear(); hist.length = 0; lastRaf = 0; shadowTimes = []; gpuOf.clear(); for (const r of [frameMs, jsMs, gpuMs, shadowMs, exMs]){ r.n = 0; r.i = 0; }
    for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  // (switched between frames, from a key or the button, so no pass is half timed)
  function setExact(v){ exact = !!v; if (!exact) for (const k in tests) setTest(k, false); if (testBar){ testBar.hidden = !exact; for (const b of testBar.querySelectorAll('button')) b._lab(); } clearAll(); label(); }
  function setTest(k, v){
    if (tests[k] === v) return; tests[k] = v;
    if (k in ATLAS_TEST){ ATLAS_TEST[k] = v; ATLAS.needsUpdate = true; ATLAS_SIDE.needsUpdate = true; }
    if (k === 'shadows'){ renderer.shadowMap.enabled = !v; for (const m of ALL_MATS.concat([ATLAS, ATLAS_SIDE])) m.needsUpdate = true; if (!v) shadowDirty = true; }   // (shaders are rebuilt either way)
  }
  function toggle(){
    on = !on;
    if (on){ if (!el) build(); el.hidden = false; clearAll(); }
    else { setExact(false); if (el) el.hidden = true; info.autoReset = true; for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  }
  addEventListener('keydown', e => { if ((e.key === 'F3' || e.key === '`') && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)){ e.preventDefault();
    if (e.shiftKey){ if (!on) toggle(); setExact(!exact); } else toggle(); } });
  return { frameStart, lap, begin, end, shadow, frameEnd, toggle, setExact, text, tests, plainMat, get on(){ return on; }, get exact(){ return exact; } };
})();
