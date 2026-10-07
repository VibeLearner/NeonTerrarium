// Determinism shims for the perf harness (tools/perf/harness.py). Injected before any game script runs; never
// part of the game. Seeded Math.random (and a call counter), a scripted clock behind performance.now and
// requestAnimationFrame, no network, and the scene's save preloaded into localStorage.
(() => {
  let seed = 0x5eed1234, calls = 0;
  Math.random = () => { calls++; seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__randCalls = () => calls;
  let useed = 0x77aa;   // (three.js object ids: a stream of their own, see _patch_uuid in harness.py)
  window.__uuidRand = () => { useed = (Math.imul(useed, 48271) + 1) >>> 0; return useed/4294967296; };
  let clock = 1000;
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  performance.now = () => clock;
  const q = [];
  window.requestAnimationFrame = f => { q.push(f); return q.length; };
  window.cancelAnimationFrame = () => {};
  // run n frames, each 1/60 s of scripted time
  window.__step = (n, ms = 1000/60) => { for (let i = 0; i < n; i++){ clock += ms; const fs = q.splice(0); for (const f of fs) f(clock); } };
  window.fetch = () => Promise.reject(new Error('perf harness: offline'));
  try {
    localStorage.clear();
    const sc = window.__PERF_SCENE || {};
    for (const k in (sc.storage || {})) localStorage.setItem(k, sc.storage[k]);
    localStorage.setItem('neonIsland.autoPerf', '0');   // a fixed render scale: auto resolution can't drift
  } catch (e) {}
})();
