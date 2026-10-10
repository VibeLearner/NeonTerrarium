// Test-only helpers for tools/perf/bake_probe.py: run in the page after js/bakejob.js was injected. Never part of the game.
window.__bp = (() => {
  const P = { order: [], dropped: [], ready: [] };
  const now = () => window.__realNow ? __realNow() : performance.now();
  const hash = t => { let h = 2166136261; const walk = x => { if (!x) return; if (x.byteLength !== undefined){ const u = new Uint8Array(x.buffer || x, x.byteOffset || 0, x.byteLength); for (let i = 0; i < u.length; i++){ h ^= u[i]; h = Math.imul(h, 16777619); } } else for (const k of Object.keys(x).sort()) walk(x[k]); }; walk(t); return (h >>> 0).toString(36); };
  P.hash = hash;
  // the frame hook: what main.js will do (BAKE.tick after nvTick); a test-only injection
  P.hook = () => { if (window.__bpHooked) return; window.__bpHooked = true; const o = window.nvTick; window.nvTick = function(){ o(); BAKE.tick(P.budget); }; };
  P.budget = undefined;
  // a recording baker around the placeholder (cost: ms of busy work a face, to see the budget honored)
  P.record = (cost = 0) => {
    BAKE.baker = function*(c, ctx){
      P.order.push({ key: c.i + ',' + c.j, d: Math.hypot(c.x - camT.x, c.z - camT.z), sig: ctx.sig });
      const g = BAKE.placeholder(c, ctx); let r;
      for (;;){ r = g.next(); if (cost){ const t = now(); while (now() - t < cost); } if (r.done) return r.value; yield; }
    };
    BAKE.onReady = (c, b) => P.ready.push(c.i + ',' + c.j);
    BAKE.onDrop = (c, b) => P.dropped.push({ key: c.i + ',' + c.j, h: hash(b.tex) });
  };
  P.settled = () => { const s = BAKE.stats(); return (BAKE.cycles || 0) > 1 && !(s.by.new || 0) && !(s.by.queued || 0) && !(s.by.baking || 0) && !(s.by.looking || 0) && !s.job; };
  P.eligible = () => [...cells.values()].filter(c => c.data && c.data.rec && c.data.rec.r && !c.mega && !c.animating).length;
  P.hashes = () => { const o = {}; for (const e of BAKE.ents.values()) if (e.bake) o[e.key] = hash(e.bake.tex); return o; };
  P.distinct = () => new Set([...BAKE.ents.values()].map(e => e.sig)).size;
  // an edit: another seed for the plot's first section, made again (its recipe changes)
  P.edit = key => { const c = cells.get(key); const before = c.data.rec; c.sections[0].seed = (c.sections[0].seed || 0) + 17; rebuildCell(c); return { changed: c.data.rec !== before }; };
  P.pickBuilt = () => { const l = [...BAKE.ents.values()].filter(e => e.state === 'ready' && e.c.sections.length && !e.c.lift); return l.length ? l[Math.floor(l.length/2)].key : null; };
  P.pickEmpty = () => { const l = [...BAKE.ents.values()].filter(e => e.state === 'ready' && !e.c.sections.length); return l.length ? l[0].key : null; };
  P.remove = key => { const c = cells.get(key); removePlatform(c); return !cells.has(key); };
  P.sigOf = key => { const e = BAKE.ents.get(key); return e && e.sig; };
  P.memRefs = sig => { const m = BAKE.mem.get(sig); return m ? m.refs : 0; };
  return P;
})();
