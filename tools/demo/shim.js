// The demo recorder's clock (tools/demo/record.py injects this into every page and frame before anything else runs, in the video pass).
// Time stands still until the recorder calls __step(): each step moves the clock on by one frame and then runs, in order, the timers that
// have come due, the page's CSS animations and transitions (held and moved on by hand), and that frame's requestAnimationFrame callbacks.
// The frames a page embeds (Furnish pod's lab) are stepped with it, each on a clock of its own. Audio clocks read the same clock, so the
// Booth's loop moves at the film's pace, not the real one.
(() => {
  const top = window === window.top;
  let clock = 1000, nextId = 0;
  const q = new Map();
  performance.now = () => clock;
  window.requestAnimationFrame = f => { const id = ++nextId; q.set(id, f); return id; };
  window.cancelAnimationFrame = id => { q.delete(id); };
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
      try { if (typeof due.f === 'function') due.f(...due.args); } catch (e) { console.error('timer', e); }
    }
  }
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
  try {   // an audio clock on the film's clock (nothing is heard in this pass: the music is recorded in its own)
    const BA = window.BaseAudioContext || window.AudioContext;
    if (BA) Object.defineProperty(BA.prototype, 'currentTime', { configurable: true, get(){ const f = (window.top || window).__dmAudioT; return typeof f === 'function' ? f() : (clock - 1000)/1000; } });   // (the film's time once it rolls: js/demo.js)
  } catch (e) {}
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs){
    if (/webgl/i.test(String(type))) attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    return getCtx.call(this, type, attrs);
  };
  let seed = 0x7a11e5 ^ (top ? 0 : (location.pathname.length*2654435761 >>> 0));
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  window.__dmStep = step;
  // every frame the page embeds (and theirs) is stepped with it, found afresh each time: Furnish pod's lab dropped out of a list of frames kept from
  // when it loaded, and stood still from its fourth frame on
  const kidsOf = (doc, out) => { for (const f of doc.querySelectorAll('iframe')){ try { const w = f.contentWindow; if (w && w.__dmStep){ out.push(w.__dmStep); kidsOf(w.document, out); } } catch (e) {} } return out; };
  if (top){
    window.__TR_CAPTURE = true;
    window.__step = (n = 1, ms = 1000/60) => { for (let i = 0; i < n; i++){ step(ms); for (const k of kidsOf(document, [])) try { k(ms); } catch (e) {} } return clock; };
  }
})();
