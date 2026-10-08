// Neon Terrarium: the performance overlay (F3, or the ` key). Where each frame's time goes on this machine: the
// processor's time per part of the simulation and per render pass, the graphics card's time per pass (timer queries,
// where the browser offers them), the draw calls and triangles of each pass, and a graph of the last frames with the
// shadow redraws marked. "Copy numbers" puts a plain-text summary on the clipboard. Costs nothing while it's hidden.
const PH = (() => {
  let on = false, el = null, graph = null, body = null, lastShow = 0;
  const gl = renderer.getContext(), info = renderer.info;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const N = 180;   // frames of history
  const stats = new Map();   // name -> { kind: 'sim' | 'pass', cpu, gpu, calls, tris } (ring buffers)
  const ring = () => ({ a: new Float64Array(N), n: 0, i: 0 });
  const put = (r, v) => { r.a[r.i] = v; r.i = (r.i + 1) % N; if (r.n < N) r.n++; };
  const avg = r => { if (!r.n) return NaN; let s = 0; for (let k = 0; k < r.n; k++) s += r.a[k]; return s/r.n; };
  const pct = (r, p) => { if (!r.n) return NaN; const b = Array.from(r.a.subarray(0, r.n)).sort((x, y) => x - y); return b[Math.min(r.n - 1, Math.floor(p*r.n))]; };
  const stat = (name, kind) => { let s = stats.get(name); if (!s) stats.set(name, s = { kind, cpu: ring(), gpu: ring(), calls: ring(), tris: ring() }); return s; };
  const frameMs = ring(), jsMs = ring(), gpuMs = ring(), shadowMs = ring();
  const hist = [];   // per frame, for the graph: [frame ms, shadow redrawn?]
  let lastRaf = 0, t0 = 0, mark = 0, cur = null, gpuFrame = 0, shadowFrame = false, frameNo = 0, shadowTimes = [];
  const free = [], pending = [];
  function frameStart(now){
    if (!on) return;
    if (lastRaf){ const d = now - lastRaf; if (d < 500){ put(frameMs, d); hist.push([d, shadowFrame]); if (hist.length > N) hist.shift(); } }
    lastRaf = now; frameNo++; shadowFrame = false;
    t0 = mark = performance.now();
    info.autoReset = false; info.reset();
    collect();
  }
  // simulation time since the last mark, under a name
  function lap(name){ if (!on) return; const t = performance.now(); put(stat(name, 'sim').cpu, t - mark); mark = t; }
  // a render pass: processor time to issue it, graphics card time to draw it, its draws and triangles
  function begin(name){
    if (!on) return;
    const t = performance.now(); mark = t;
    cur = { name, t, c: info.render.calls, tr: info.render.triangles + info.render.points + info.render.lines, q: null };
    if (ext){ const q = free.pop() || gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); cur.q = q; }
  }
  function end(){
    if (!on || !cur) return;
    if (cur.q){ gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q: cur.q, name: cur.name, frame: frameNo }); }
    const t = performance.now(), s = stat(cur.name, 'pass');
    put(s.cpu, t - cur.t); put(s.calls, info.render.calls - cur.c); put(s.tris, info.render.triangles + info.render.points + info.render.lines - cur.tr);
    mark = t; cur = null;
  }
  function shadow(){ if (on && renderer.shadowMap.needsUpdate){ shadowFrame = true; shadowTimes.push(performance.now()); } }
  function frameEnd(){
    if (!on) return;
    put(jsMs, performance.now() - t0);
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
    L.push(`main thread ${avg(jsMs).toFixed(1)} ms   graphics card ${!ext ? 'n/a (this browser has no GPU timers)' : gpuMs.n ? avg(gpuMs).toFixed(1) + ' ms' : 'measuring'}`);
    L.push(`render ${W}x${H} of ${DW}x${DH}   zoom ${zoom.toFixed(1)}   people ${typeof pplList !== 'undefined' ? pplList.length : '-'}   plots ${cells.size}`);
    const now = performance.now(); shadowTimes = shadowTimes.filter(t => now - t < 10000);
    L.push(`shadow redraws in the last 10 s: ${shadowTimes.length}` + (shadowMs.n ? `   (graphics card ${avg(shadowMs).toFixed(1)} ms each)` : ''));
    L.push('');
    L.push('                              cpu ms  gpu ms   draws  triangles');
    let simSum = 0;
    for (const [k, s] of stats) if (s.kind === 'sim') simSum += avg(s.cpu);
    L.push(`simulation and upkeep          ${f1(simSum)}`);
    for (const [k, s] of stats) if (s.kind === 'sim') L.push(`  ${k.padEnd(28)}${f1(avg(s.cpu))}`);
    for (const [k, s] of stats) if (s.kind === 'pass') L.push(`${k.padEnd(30)}${f1(avg(s.cpu))}   ${f1(avg(s.gpu))}  ${big(avg(s.calls)).padStart(6)}  ${big(avg(s.tris)).padStart(9)}`);
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
    copy.onclick = () => { const t = text(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { note.textContent = 'copied'; }, () => { note.textContent = 'select the text and copy it'; }); };
    bar.append(copy, note); el.append(graph, body, bar); document.body.appendChild(el);
  }
  function toggle(){
    on = !on;
    if (on){ if (!el) build(); el.hidden = false; stats.clear(); hist.length = 0; lastRaf = 0; for (const r of [frameMs, jsMs, gpuMs, shadowMs]){ r.n = 0; r.i = 0; } }
    else { if (el) el.hidden = true; info.autoReset = true; for (const p of pending) gl.deleteQuery(p.q); pending.length = 0; }
  }
  addEventListener('keydown', e => { if ((e.key === 'F3' || e.key === '`') && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)){ e.preventDefault(); toggle(); } });
  return { frameStart, lap, begin, end, shadow, frameEnd, toggle, get on(){ return on; } };
})();
