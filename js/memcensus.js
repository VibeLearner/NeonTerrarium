// Neon Terrarium: the memory summary (the F3 overlay's "Save memory summary" button). The browser keeps its heap to itself (only a developer tool's
// heap snapshot shows who holds what), so this walks what the game can reach: every top-level name its scripts declare, read by name, and what
// hangs off each, counting each object once, for the first name that reaches it. The sizes are estimates of what V8 would spend (an object's
// header and slots, an array's elements, a string's characters, a map's entries); the arrays of numbers behind typed arrays are counted apart,
// as "array data". What it can't see: values only a closure holds, three's own per-object records (kept in WeakMaps), the browser's own memory.
// The scene (world, scene) is walked last, so a mesh a system keeps a list of counts for that system.
const MEMC = (() => {
  const NAME = /^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/, MORE = /,\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g, LAST = ['world', 'scene', 'renderer', 'cam', 'THREE'];
  async function names(){
    const out = new Set();
    const urls = [...document.scripts].map(s => s.src).filter(u => u && new URL(u).origin === location.origin);
    const texts = await Promise.all(urls.map(u => fetch(u).then(r => r.text()).catch(() => '')));   // (all at once: one after another, each waited for a frame of the game)
    for (const t of texts){
      for (const line of t.split('\n')){ const m = NAME.exec(line); if (!m) continue; out.add(m[1]); MORE.lastIndex = 0; let k; while ((k = MORE.exec(line))) out.add(k[1]); }
    }
    return [...out];
  }
  const geval = eval;   // (an indirect eval reads the page's top-level let and const names, which aren't properties of window)
  const skip = v => v === window || v === document || (typeof Node !== 'undefined' && v instanceof Node) || (typeof WebGL2RenderingContext !== 'undefined' && (v instanceof WebGL2RenderingContext || v instanceof WebGLRenderingContext))
    || (typeof WebGLObject !== 'undefined' && v instanceof WebGLObject) || (typeof Worker !== 'undefined' && v instanceof Worker) || (typeof CSSStyleDeclaration !== 'undefined' && v instanceof CSSStyleDeclaration);
  async function run(onProgress){
    const t0 = performance.now(), heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const list = await names(), roots = [];
    for (const n of list){ let v; try { v = geval(n); } catch (e){ continue; } if (v && (typeof v === 'object' || typeof v === 'function')) roots.push([n, v]); }
    for (const k of Object.keys(window)) if (k.startsWith('__')){ const v = window[k]; if (v && typeof v === 'object') roots.push(['window.' + k, v]); }
    roots.sort((a, b) => LAST.indexOf(a[0]) - LAST.indexOf(b[0]));   // (the scene and three last; -1 for everything else, which keeps its order)
    const seen = new WeakSet(); let nodes = 0, work = 0; const tw = performance.now(); let lastYield = tw;
    const res = [];
    for (const [name, root] of roots){
      const r = { name, js: 0, data: 0, objs: 0, parts: new Map() };
      const stack = [[root, '']];
      while (stack.length){
        const [v, part] = stack.pop();
        if (v === null || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v) || skip(v)) continue;
        seen.add(v); nodes++; r.objs++;
        let js = 0, data = 0;
        const push = (c, p) => { if (c !== null && (typeof c === 'object' || typeof c === 'function')) stack.push([c, part || p]); else if (typeof c === 'string') js += 12 + c.length; };
        if (ArrayBuffer.isView(v)){ js = 72; if (!seen.has(v.buffer)){ seen.add(v.buffer); data = v.buffer.byteLength; } }
        else if (v instanceof ArrayBuffer) data = v.byteLength;
        else if (typeof v === 'function'){ js = 64; const p = v.prototype; if (p && typeof p === 'object') push(p, 'prototype'); }
        else if (Array.isArray(v)){ js = 16 + 8*v.length; for (let i = 0; i < v.length; i++) push(v[i], 'items'); }
        else if (v instanceof Map){ js = 40 + 28*v.size; for (const [k, x] of v){ push(k, 'keys'); push(x, 'values'); } }
        else if (v instanceof Set){ js = 40 + 20*v.size; for (const x of v) push(x, 'items'); }
        else if (v instanceof WeakMap || v instanceof WeakSet || v instanceof Promise) js = 32;
        else { const ks = Object.keys(v); for (const k of ks){ if (k === 'parent' && v.isObject3D) continue; const d = Object.getOwnPropertyDescriptor(v, k); if (d && 'value' in d) push(d.value, k); }   // (and never up to a mesh's parent: what a system lists is its own, not the whole scene it hangs in)   // (never through a getter: a plot's dropped arrays come back when read, recipe.js)
          js = 24 + 8*ks.length; }
        r.js += js; r.data += data;
        if (part){ const q = r.parts.get(part) || [0, 0]; q[0] += js; q[1] += data; r.parts.set(part, q); }
        if (performance.now() - lastYield > 400){ work += performance.now() - lastYield; await new Promise(f => setTimeout(f, 0)); lastYield = performance.now(); if (onProgress) onProgress(res.length + ' of ' + roots.length + ' names, ' + nodes + ' objects'); }
      }
      if (r.js + r.data > 0) res.push(r);
    }
    res.sort((a, b) => (b.js + b.data) - (a.js + a.data));
    const MB = b => (b/1048576).toFixed(1), totJ = res.reduce((s, r) => s + r.js, 0), totD = res.reduce((s, r) => s + r.data, 0);
    const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const L = ['Neon Terrarium memory summary   ' + new Date().toISOString().slice(0, 16) + '   took ' + ((performance.now() - t0)/1000).toFixed(1) + ' s (' + ((work + performance.now() - lastYield)/1000).toFixed(1) + ' s of it counting, ' + ((tw - t0)/1000).toFixed(1) + ' s finding the names)',
      'JS heap ' + MB(heap0) + ' MB (the browser\'s count, before); reached from the game\'s names: ' + MB(totJ) + ' MB of objects and strings (estimated) and ' + MB(totD) + ' MB of array data, ' + nodes + ' objects',
      'cells ' + (typeof cells !== 'undefined' ? cells.size : '-') + ', people ' + (typeof pplList !== 'undefined' ? pplList.length : '-') + ', merged blocks ' + (typeof solidRegions !== 'undefined' ? solidRegions.size : '-') + ', JS heap after ' + MB(heap1) + ' MB', '',
      'by name (objects and strings + array data), the largest parts of each:'];
    for (const r of res.slice(0, 45)){
      L.push(MB(r.js).padStart(7) + ' + ' + MB(r.data).padStart(7) + ' MB  ' + r.name + '  (' + r.objs + ' objects)');
      const ps = [...r.parts.entries()].sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).slice(0, 6).filter(p => p[1][0] + p[1][1] > 262144);
      if (ps.length) L.push('                        ' + ps.map(([k, q]) => k + ' ' + MB(q[0]) + (q[1] ? '+' + MB(q[1]) : '')).join(', '));
    }
    return L.join('\n');
  }
  return { run, names };
})();
