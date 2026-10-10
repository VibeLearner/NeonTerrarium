// Neon Terrarium: baking far buildings, the plumbing (baked-far plan, item 3): WHEN a plot is baked, WHERE the result is kept, and WHEN it is thrown away. WHAT is baked is the baker's business (BAKE.baker).
// A plot's bake follows its geometry: the plot appears with its real geometry at once, the bake is looked up in the store (IndexedDB, by the plot's recipe signature) or made in idle frames with a
// time budget, the plots nearest the view first (as neverseen.js does its work). The bake is kept by signature, so a reload or the same plot again does not bake twice. A plot whose recipe changes
// (an edit, a neighbor: the plot is made again with a new recipe) drops its old bake and is queued again; a plot that is removed drops it.
// The signature reads the recipe only (c.data.rec.r, as nvRecSig does), never a vertex array, so a plot whose arrays are let go (recipe.js, pmDrop) costs nothing to look up.
//
// The baker (swap BAKE.baker for the real one): baker(c, ctx) -> a result, a generator, or a promise of a result. A result is { tex, meta }: tex is an ArrayBuffer, a typed array, or an object / array of them
// (each is stored as it is), meta is plain data. A generator is stepped once per next(); it yields between faces (or any unit of work) and returns the result; the scheduler stops stepping when the frame's budget is
// spent and goes on next frame, and drops it (gen.return()) if the plot changed meanwhile. A promise is waited for (one at a time, nothing else bakes meanwhile). ctx = { c, sig, density, ver, left() }: left() is
// the milliseconds left in this frame's budget (a baker that can't yield may use it to decide on cheaper steps). A baker that throws marks the plot failed until its signature changes.
//
// API: BAKE.tick(budgetMs) once a frame (main.js, after the regions are merged); BAKE.want(c) register and prioritise a plot; BAKE.get(c) the bake or null (null while the plot's recipe has moved on);
// BAKE.drop(c); BAKE.stats(); BAKE.line(); BAKE.clearCache(); callbacks BAKE.onReady(c, bake) and BAKE.onDrop(c, bake) for the lead to mark the block dirty.
const BAKE = { ver: 1, density: 'd1', maxCacheBytes: 192*1048576, mem: new Map(), ents: new Map(), keys: new Set(), meta: new Map(), db: null, dbReady: false, lookups: 0, maxLookups: 4,
  job: null, scan: 0, list: [], listStamp: -1, listSize: -1, drawsInSig: false, onReady: null, onDrop: null, baker: null, view: null, lastT: 0, last: { ms: 0, steps: 0 },
  c: { tracked: 0, edits: 0, hits: 0, memHits: 0, misses: 0, baked: 0, steps: 0, stored: 0, evicted: 0, failed: 0, dropped: 0, ticks: 0, ticksOver: 0, maxTickMs: 0, bakeMs: 0, dedup: 0 } };
BAKE.gen = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src || '') || [0, 'dev'])[1];   // (the scripts' version: a bake is only as good as the builders and the baker that made it)
BAKE.off = () => !!window.__BAKE_OFF;
const bkNow = () => window.__realNow ? window.__realNow() : performance.now();
const bkHash = t => { let h1 = 2166136261 >>> 0, h2 = 5381; for (let i = 0; i < t.length; i++){ const k = t.charCodeAt(i); h1 = Math.imul(h1 ^ k, 16777619) >>> 0; h2 = (Math.imul(h2, 33) + k) >>> 0; } return h1.toString(36) + h2.toString(36); };
const bkNoDraws = (k, v) => k === 'draws' ? undefined : v;
const bkKey = c => c.i + ',' + c.j;
// the signature: the recipe's text (without the random draws, as the never-seen job; BAKE.drawsInSig adds them), the material set, the baker's format version, the texel density tag, the scripts' version
function bkSig(c){
  const rec = c.data && c.data.rec; if (!rec || !rec.r) return null;
  const t = JSON.stringify(rec.r, bkNoDraws); let d = '';
  if (BAKE.drawsInSig && rec.draws){ const u = new Uint8Array(rec.draws.buffer || new Float64Array(rec.draws).buffer); let h = 2166136261 >>> 0; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619) >>> 0; d = ':w' + h.toString(36); }
  return 'b' + BAKE.ver + ':' + BAKE.density + ':' + bkHash(t) + ':' + t.length + d + ':' + (typeof MATREG !== 'undefined' && MATREG.sig || '') + ':' + (BAKE.bakerTag || '') + ':' + BAKE.gen;
}
// which plots are baked: plots with a recipe that are not megastructures (override BAKE.skip(c) to change)
BAKE.skip = c => !!c.mega;
const bkEligible = c => !!(c && c.data && c.data.rec && c.data.rec.r && !c.animating && !BAKE.skip(c));
const bkBytes = tex => { let n = 0; const add = t => { if (!t) return; if (t.byteLength !== undefined) n += t.byteLength; else if (typeof t === 'object') for (const k in t) add(t[k]); }; add(tex); return n; };
// ---- the placeholder baker: flat color per face of the shell's six sides, small typed arrays; a generator that yields between faces. No geometry is read (a plot's arrays may be let go). ----
BAKE.placeholder = function*(c, ctx){
  const F = 6, S = 4, h = parseInt(bkHash(ctx.sig).slice(0, 6), 36), albedo = new Uint8Array(F*S*S*4), nor = new Uint8Array(F*S*S*4), emis = new Uint8Array(F*S*S*4);
  const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let f = 0; f < F; f++){
    const r = (h >> (f*3)) & 255, g = (h >> (f*2 + 1)) & 255, b = (h >> (f + 5)) & 255;
    for (let k = 0; k < S*S; k++){ const o = (f*S*S + k)*4; albedo[o] = r; albedo[o + 1] = g; albedo[o + 2] = b; albedo[o + 3] = 255;
      nor[o] = (N[f][0]*.5 + .5)*255; nor[o + 1] = (N[f][1]*.5 + .5)*255; nor[o + 2] = (N[f][2]*.5 + .5)*255; nor[o + 3] = 255; emis[o + 3] = 0; }
    yield f;   // (between faces: the scheduler may stop here when the frame's budget is spent)
  }
  return { tex: { albedo, nor, emis }, meta: { faces: F, size: S, placeholder: true, density: ctx.density, fmt: 1 } };
};
BAKE.baker = BAKE.placeholder;
// ---- the store: IndexedDB, one entry per signature. At open only the keys and the sizes are read (the atlases are read on demand: they are big), so a plot whose key is not there never makes a trip. ----
function bkDbOpen(){
  if (window.__BAKE_NODB){ BAKE.dbReady = true; return; }
  try {
    const rq = indexedDB.open('neonTerrariumBakes', 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('b'); rq.result.createObjectStore('m'); };
    rq.onsuccess = () => { BAKE.db = rq.result; try {
      const m = BAKE.db.transaction('m').objectStore('m'), ks = m.getAllKeys(), vs = m.getAll();
      vs.onsuccess = () => { try { for (let i = 0; i < ks.result.length; i++){ BAKE.keys.add(ks.result[i]); BAKE.meta.set(ks.result[i], vs.result[i]); } } catch (e) {} BAKE.dbReady = true; };
      vs.onerror = () => { BAKE.dbReady = true; };
    } catch (e) { BAKE.dbReady = true; } };
    rq.onerror = () => { BAKE.dbReady = true; };
    rq.onblocked = () => { BAKE.dbReady = true; };
  } catch (e) { BAKE.dbReady = true; }
}
function bkDbGet(sig, cb){   // cb(bake or null)
  if (!BAKE.db || !BAKE.keys.has(sig)){ cb(null); return; }
  try { const rq = BAKE.db.transaction('b').objectStore('b').get(sig); rq.onsuccess = () => cb(rq.result || null); rq.onerror = () => cb(null); } catch (e) { cb(null); }
}
function bkDbPut(sig, bake){
  const bytes = bkBytes(bake.tex), m = { bytes, t: Date.now() }; BAKE.keys.add(sig); BAKE.meta.set(sig, m); BAKE.c.stored++;
  if (BAKE.db) try { const tx = BAKE.db.transaction(['b', 'm'], 'readwrite'); tx.objectStore('b').put(bake, sig); tx.objectStore('m').put(m, sig); } catch (e) {}
  bkEvict();
}
function bkEvict(){   // the oldest entries go while the store holds more than maxCacheBytes (the entries in use are kept in memory regardless)
  let tot = 0; for (const m of BAKE.meta.values()) tot += m.bytes; if (tot <= BAKE.maxCacheBytes) return;
  const old = [...BAKE.meta.entries()].sort((a, b) => a[1].t - b[1].t);
  for (const [k, m] of old){ if (tot <= BAKE.maxCacheBytes*.9) break; tot -= m.bytes; BAKE.keys.delete(k); BAKE.meta.delete(k); BAKE.c.evicted++;
    if (BAKE.db) try { const tx = BAKE.db.transaction(['b', 'm'], 'readwrite'); tx.objectStore('b').delete(k); tx.objectStore('m').delete(k); } catch (e) {} }
}
// ---- the entries: one per plot. state: 'new' (signature made, not looked up), 'looking' (a store read is out), 'queued' (to bake), 'baking', 'ready', 'failed' ----
function bkRelease(e){   // the plot lets go of its bake (the shared copy goes when no plot holds it)
  const m = BAKE.mem.get(e.sig); if (m && e.bake){ m.refs--; if (m.refs <= 0) BAKE.mem.delete(e.sig); }
  const had = e.bake; e.bake = null; return had;
}
function bkDropEntry(e, why){
  if (BAKE.job && BAKE.job.e === e) bkCancel();
  const had = bkRelease(e); e.state = 'gone'; BAKE.ents.delete(e.key); BAKE.c.dropped++;
  if (had && BAKE.onDrop) try { BAKE.onDrop(e.c, had); } catch (x) { console.error(x); }
}
function bkCancel(){ const j = BAKE.job; BAKE.job = null; if (j && j.gen && j.gen.return) try { j.gen.return(); } catch (e) {} if (j && j.e && j.e.state === 'baking') j.e.state = 'queued'; }
function bkSet(e, bake){
  const m = BAKE.mem.get(e.sig); if (m){ m.refs++; bake = m.bake; } else BAKE.mem.set(e.sig, { bake, refs: 1 });
  e.bake = bake; e.state = 'ready'; if (BAKE.onReady) try { BAKE.onReady(e.c, bake); } catch (x) { console.error(x); }
}
// the plot's entry, made or brought up to date: a new recipe (an edit, a neighbor) drops the old bake and starts again
function bkTrack(c){
  const key = bkKey(c); let e = BAKE.ents.get(key);
  if (!bkEligible(c)){ if (e) bkDropEntry(e, 'ineligible'); return null; }
  const rec = c.data.rec;
  if (e && (e.c !== c || e.rec !== rec)){   // (the plot was made again, or the cell is another one now)
    const sig = bkSig(c);
    if (e.c === c && sig === e.sig){ e.rec = rec; return e; }   // (made again to the same recipe: the bake stands)
    if (e.c === c) BAKE.c.edits++;
    bkDropEntry(e, 'changed'); e = null;
  }
  if (!e){ const sig = bkSig(c); if (!sig) return null; e = { c, key, rec, sig, state: 'new', bake: null, since: BAKE.c.ticks, tries: 0 }; BAKE.ents.set(key, e); BAKE.c.tracked++; }
  return e;
}
const bkDist = e => { const v = BAKE.view ? BAKE.view() : (typeof camT !== 'undefined' ? camT : null); return v ? Math.hypot(e.c.x - v.x, e.c.z - v.z) : 0; };
BAKE.want = c => { const e = bkTrack(c); if (e) e.want = true; return e ? e.state : null; };
BAKE.get = c => { const e = BAKE.ents.get(bkKey(c)); if (!e || e.c !== c) return null; if (!c.data || e.rec !== c.data.rec){ bkTrack(c); const f = BAKE.ents.get(bkKey(c)); return f && f.bake || null; } return e.bake; };
BAKE.state = c => { const e = BAKE.ents.get(bkKey(c)); return e && e.c === c ? e.state : null; };
BAKE.drop = c => { const e = BAKE.ents.get(bkKey(c)); if (e) bkDropEntry(e, 'api'); };
// clears the store and every bake in memory; every plot is queued again
BAKE.clearCache = () => {
  bkCancel(); for (const e of [...BAKE.ents.values()]) bkDropEntry(e, 'clear'); BAKE.mem.clear(); BAKE.keys.clear(); BAKE.meta.clear();
  if (BAKE.db) try { const tx = BAKE.db.transaction(['b', 'm'], 'readwrite'); tx.objectStore('b').clear(); tx.objectStore('m').clear(); } catch (e) {}
  BAKE.listStamp = -1;
};
// ---- the scheduler ----
function bkRefreshList(){
  const stamp = typeof SC_EDITS !== 'undefined' ? SC_EDITS : 0;
  if (BAKE.listStamp === stamp && BAKE.listSize === cells.size) return;
  BAKE.listStamp = stamp; BAKE.listSize = cells.size; BAKE.list = [...cells.values()]; BAKE.scan = 0;
  for (const e of [...BAKE.ents.values()]) if (cells.get(e.key) !== e.c) bkDropEntry(e, 'removed');   // (a plot that is gone drops its bake)
}
function bkLookupSome(){
  if (BAKE.lookups >= BAKE.maxLookups) return;
  const news = []; for (const e of BAKE.ents.values()) if (e.state === 'new') news.push(e);
  if (!news.length) return;
  news.sort((a, b) => bkDist(a) - bkDist(b));
  for (const e of news){
    if (BAKE.lookups >= BAKE.maxLookups) break;
    const m = BAKE.mem.get(e.sig); if (m){ bkSet(e, m.bake); BAKE.c.memHits++; continue; }   // (the same plot again, in memory)
    if (!BAKE.keys.has(e.sig)){ e.state = 'queued'; BAKE.c.misses++; continue; }   // (not in the store: no trip)
    e.state = 'looking'; BAKE.lookups++;
    bkDbGet(e.sig, bake => { BAKE.lookups--; if (e.state !== 'looking') return;   // (dropped meanwhile)
      if (bake && bake.tex){ BAKE.c.hits++; bkSet(e, bake); } else { BAKE.keys.delete(e.sig); BAKE.meta.delete(e.sig); e.state = 'queued'; BAKE.c.misses++; } });
  }
}
function bkPick(){   // the queued plot nearest the view (plots a caller asked for with want() first)
  let best = null, bd = Infinity;
  for (const e of BAKE.ents.values()){ if (e.state !== 'queued') continue; const d = bkDist(e) - (e.want ? 1e6 : 0); if (d < bd){ bd = d; best = e; } }
  return best;
}
BAKE.idle = () => !document.hidden && (typeof SYNC_Q === 'undefined' || SYNC_Q === null) && (typeof anims === 'undefined' || !anims.length) && (typeof solidDirty === 'undefined' || !solidDirty.size);
// a budget for this frame from the last frame's length: up to 4 ms while frames are short, 1 ms when they are not (placing a building and every other stall wins over baking)
BAKE.autoBudget = () => { const t = bkNow(), dt = t - (BAKE.lastT || t); BAKE.lastT = t; return dt < 18 ? 4 : dt < 34 ? 1.5 : .5; };
function bkFinish(e, res){
  const bake = { tex: res.tex, meta: res.meta || {}, sig: e.sig }; BAKE.c.baked++;
  bkDbPut(e.sig, bake); bkSet(e, bake);
}
function bkFail(e, err){ e.state = 'failed'; BAKE.c.failed++; BAKE.lastError = String(err && err.stack || err); console.error('bake failed for plot ' + e.key, err); }
// one tick: scan a few cells (new plots, changed recipes, removed plots), start store reads, then bake in steps until the budget is spent. Reading and queueing cost next to nothing; only the baker's steps are budgeted.
BAKE.tick = function(budgetMs){
  if (BAKE.off()) return;
  const t0 = bkNow(); BAKE.c.ticks++; BAKE.last = { ms: 0, steps: 0 };
  if (budgetMs === undefined) budgetMs = BAKE.autoBudget();
  if (!BAKE.dbReady) return;
  bkRefreshList();
  for (let n = 0; n < 60 && BAKE.scan < BAKE.list.length; n++, BAKE.scan++) bkTrack(BAKE.list[BAKE.scan]);
  if (BAKE.scan >= BAKE.list.length){ BAKE.scan = 0; BAKE.cycles = (BAKE.cycles || 0) + 1; }
  bkLookupSome();
  const ctx = { c: null, sig: '', density: BAKE.density, ver: BAKE.ver, left: () => Math.max(0, t0 + budgetMs - bkNow()) };
  const idle = BAKE.idle() && budgetMs > 0;
  let guard = 0;
  while (idle && guard++ < 100000){
    if (!BAKE.job){
      const e = bkPick(); if (!e) break;
      const m = BAKE.mem.get(e.sig); if (m){ bkSet(e, m.bake); BAKE.c.dedup++; continue; }   // (an equal plot finished meanwhile)
      e.state = 'baking'; e.want = false; ctx.c = e.c; ctx.sig = e.sig;
      try { const r = BAKE.baker(e.c, ctx);
        if (r && typeof r.then === 'function'){ BAKE.job = { e, promise: true }; r.then(res => { const j = BAKE.job; if (!j || j.e !== e) return; BAKE.job = null; if (e.state === 'baking' && e.rec === e.c.data?.rec) bkFinish(e, res); else if (e.state === 'baking') e.state = 'queued'; }, err => { if (BAKE.job && BAKE.job.e === e) BAKE.job = null; bkFail(e, err); }); break; }
        if (r && typeof r.next === 'function') BAKE.job = { e, gen: r };
        else { bkFinish(e, r); continue; } }
      catch (err){ bkFail(e, err); continue; }
    }
    const j = BAKE.job; if (j.promise) break;
    if (j.e.state !== 'baking' || !j.e.c.data || j.e.rec !== j.e.c.data.rec){ bkCancel(); continue; }   // (the plot changed while its bake was between steps)
    ctx.c = j.e.c; ctx.sig = j.e.sig;
    let st; try { st = j.gen.next(); } catch (err){ BAKE.job = null; bkFail(j.e, err); continue; }
    BAKE.c.steps++; BAKE.last.steps++;
    if (st.done){ BAKE.job = null; bkFinish(j.e, st.value); }
    if (bkNow() - t0 >= budgetMs) break;
  }
  const ms = bkNow() - t0; BAKE.last.ms = ms; BAKE.c.bakeMs += ms; if (ms > BAKE.c.maxTickMs) BAKE.c.maxTickMs = ms; if (ms > budgetMs + 1) BAKE.c.ticksOver++;
};
BAKE.stats = () => {
  const by = {}; for (const e of BAKE.ents.values()) by[e.state] = (by[e.state] || 0) + 1;
  let bytes = 0; for (const m of BAKE.mem.values()) bytes += bkBytes(m.bake.tex); let sb = 0; for (const m of BAKE.meta.values()) sb += m.bytes;
  return Object.assign({ plots: BAKE.ents.size, by, memBakes: BAKE.mem.size, memBytes: bytes, storeKeys: BAKE.keys.size, storeBytes: sb, dbReady: BAKE.dbReady, lookups: BAKE.lookups, job: !!BAKE.job }, BAKE.c);
};
BAKE.line = () => { const s = BAKE.stats(); return 'baked far: ' + (s.by.ready || 0) + ' ready of ' + s.plots + ', queued ' + (s.by.queued || 0) + ', store hits ' + s.hits + ', baked ' + s.baked + ', edits ' + s.edits + ', failed ' + s.failed; };
// for tools: run ticks until the queue is empty or n ticks went by
BAKE.drain = (budgetMs = 4, n = 1e6) => { const c0 = BAKE.cycles || 0; for (let k = 0; k < n; k++){ BAKE.tick(budgetMs); const s = BAKE.stats(); if ((BAKE.cycles || 0) > c0 && !(s.by.new || 0) && !(s.by.queued || 0) && !(s.by.baking || 0) && !(s.by.looking || 0) && !BAKE.job) return k + 1; } return -1; };
if (!window.__BAKE_OFF) bkDbOpen(); else BAKE.dbReady = true;
