// The demo recorder's clock (tools/demo/record.py injects this into every page before anything else runs).
// Time stands still until the recorder calls __step(): each step moves performance.now() on by one frame and then runs, in order, the timers that
// have come due, the page's CSS animations and transitions (held and moved on by hand), and that frame's requestAnimationFrame callbacks. So the
// panels' glitch curtains, their slide-ins and the clip's own timeline all land on exact 1/60 s frames however long a frame takes to draw and capture.
(() => {
  if (window !== window.top) return;
  let clock = 1000, nextId = 0;
  const q = new Map();
  performance.now = () => clock;
  window.requestAnimationFrame = f => { const id = ++nextId; q.set(id, f); return id; };
  window.cancelAnimationFrame = id => { q.delete(id); };
  // timers on the same clock
  const T = new Map(); let tid = 0;
  window.setTimeout = (f, ms, ...args) => { const id = ++tid; T.set(id, { at: clock + Math.max(0, +ms || 0), f, args }); return id; };
  window.setInterval = (f, ms, ...args) => { const id = ++tid, every = Math.max(4, +ms || 0); T.set(id, { at: clock + every, f, args, every }); return id; };
  window.clearTimeout = window.clearInterval = id => { T.delete(id); };
  function timers(){
    for (let guard = 0; guard < 2000; guard++){
      let due = null, dk = 0;
      for (const [id, x] of T) if (x.at <= clock && (!due || x.at < due.at)){ due = x; dk = id; }
      if (!due) return;
      if (due.every) due.at += due.every; else T.delete(dk);
      try { typeof due.f === 'function' ? due.f(...due.args) : 0; } catch (e) { console.error('timer', e); }
    }
  }
  // CSS animations and transitions: held, and moved on by the frame's length
  function animations(ms){
    let list = []; try { list = document.getAnimations(); } catch (e) { return; }
    for (const a of list){
      try {
        if (!a.__dm){ a.__dm = true; a.pause(); }
        if (a.playState === 'finished') continue;
        const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity, t = (a.currentTime || 0) + ms*(a.playbackRate || 1);
        if (isFinite(end) && t >= end) a.finish(); else a.currentTime = t;
      } catch (e) {}
    }
  }
  const step = ms => {
    clock += ms;
    timers(); animations(ms);
    const fs = [...q.values()]; q.clear();
    for (const f of fs) try { f(clock); } catch (e) { console.error('frame', e); }
  };
  // every WebGL canvas keeps its last picture (the game skips drawing while a panel covers it)
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs){
    if (/webgl/i.test(String(type))) attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    return getCtx.call(this, type, attrs);
  };
  // the same random numbers on every run
  let seed = 0x7a11e5;
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  window.__TR_CAPTURE = true;
  window.__step = (n = 1, ms = 1000/60) => { for (let i = 0; i < n; i++) step(ms); return clock; };
})();
