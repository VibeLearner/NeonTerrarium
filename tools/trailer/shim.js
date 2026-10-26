// The recorder's clock (tools/trailer/record.py injects this into every page and frame before anything else runs).
// Time stands still until the recorder calls __step(): each step moves performance.now() on by one frame and runs that
// frame's requestAnimationFrame callbacks, in the game and in the frames it embeds (Furnish pod's lab, the coast), so every
// animation, ease and walk lands on exact 1/60 s frames however long a frame really takes to draw and capture.
(() => {
  let clock = 1000, nextId = 0;
  const q = new Map();
  performance.now = () => clock;
  window.requestAnimationFrame = f => { const id = ++nextId; q.set(id, f); return id; };
  window.cancelAnimationFrame = id => { q.delete(id); };
  const step = ms => {
    clock += ms;
    const fs = [...q.values()]; q.clear();
    for (const f of fs) try { f(clock); } catch (e) { console.error('frame', e); }
  };
  // every WebGL canvas keeps its last picture: the game, the apartment lab and the coast each skip drawing on frames where nothing changed,
  // and a cleared canvas captured on such a frame showed as a black or half-drawn flash
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs){
    if (/webgl/i.test(String(type))) attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    return getCtx.call(this, type, attrs);
  };
  // the same random numbers on every run (the people's choices, rain, sparks)
  let seed = 0x7a11e5 ^ (window === window.top ? 0 : (location.pathname.length*2654435761 >>> 0));
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  if (window === window.top){
    window.__TR_CAPTURE = true;
    const kids = window.__trKids = new Set();
    window.__step = (n = 1, ms = 1000/60) => { for (let i = 0; i < n; i++){ step(ms); for (const k of [...kids]) try { k(ms); } catch (e) {} } return clock; };
  } else {
    try { const kids = window.top.__trKids; kids.add(step); window.addEventListener('pagehide', () => kids.delete(step)); } catch (e) {}
  }
})();
