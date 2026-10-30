// Neon Terrarium: the start of the phone benchmark (?bench in the address). Loads first, in the head, before anything reads a save.
// On any other address it does nothing at all: the game, desktop or phone, never sees it.
// With ?bench:
//  - the city's saves live in memory only for this page: the benchmark's test city is put there (from sessionStorage, where the
//    benchmark left it before reloading), and nothing the page writes ever reaches this browser's real saves, so the player's own
//    city is never touched;
//  - the save-slot and other stores in IndexedDB get names of their own (the slot list would otherwise gain the test city);
//  - the title screen is skipped, and js/bench.js (the benchmark itself) is loaded once the game's scripts have run.
'use strict';
(function(){
  if (!/[?&]bench\b/.test(location.search)) return;
  window.NT_BENCH = true;
  const mem = new Map();
  try { const seed = JSON.parse(sessionStorage.getItem('ntBench.storage') || '{}'); for (const k in seed) mem.set(k, String(seed[k])); } catch (e) {}
  const LS = window.localStorage, P = Storage.prototype;
  const g = P.getItem, s = P.setItem, r = P.removeItem, c = P.clear, k = P.key, len = Object.getOwnPropertyDescriptor(P, 'length');
  P.getItem = function (key){ if (this === LS) return mem.has(String(key)) ? mem.get(String(key)) : null; return g.call(this, key); };
  P.setItem = function (key, v){ if (this === LS){ mem.set(String(key), String(v)); return; } return s.call(this, key, v); };
  P.removeItem = function (key){ if (this === LS){ mem.delete(String(key)); return; } return r.call(this, key); };
  P.clear = function (){ if (this === LS){ mem.clear(); return; } return c.call(this); };
  P.key = function (i){ if (this === LS){ const a = [...mem.keys()]; return i >= 0 && i < a.length ? a[i] : null; } return k.call(this, i); };
  if (len && len.configurable) Object.defineProperty(P, 'length', { configurable: true, enumerable: len.enumerable, get(){ return this === LS ? mem.size : len.get.call(this); } });
  window.NT_BENCH_MEM = mem;
  // (the never-seen cache is only a cache of shapes, keyed by the shape itself: shared with the game, it changes nothing a city holds)
  try { const op = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, ...a){ return op.call(this, name === 'neonTerrariumNeverSeen' ? name : 'ntBench.' + name, ...a); }; } catch (e) {}
  try { sessionStorage.setItem('neonTerrarium.skipTitle', '1'); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => { const sc = document.createElement('script'); sc.src = 'js/bench.js?v=2026-10-30b'; document.body.appendChild(sc); });
})();
