// Neon Terrarium: which browser saves belong to a city, and the lock that keeps them still while cities are swapped.
// Loads first, in the head, before anything reads or writes a save.
//
// The game keeps the city being played where it always has: each system in its own localStorage key (the plots, the
// megastructures, the people's stories, the police cases, the ledger, the coast...). A save slot (slots.js) is a copy of
// exactly those keys. Switching cities copies the active city's keys into its slot, writes the next city's keys in their
// place and reloads, so every system starts from the city it should. Between the copy and the reload, the systems that
// save on the way out (stories, cases, the ledger, the transmission log) would write the old city back over the new one,
// so while NT_SAVE_LOCK is set their writes to city keys are quietly dropped. Everything else (volumes, render choices,
// open menus, looks) is a preference of this browser, shared by every city.
'use strict';
const NT_CITY_KEYS = ['neonIsland.v2', 'neonIsland.megas', 'neonIsland.highways', 'neonIsland.metros', 'neonIsland.megaUnlocked',
  'neonIsland.style', 'neonIsland.stories', 'neonIsland.cases', 'neonIsland.ledger', 'neonIsland.wirelog', 'neonIsland.pins',
  'neonIsland.coastAccessed', 'neonIsland.booth', 'neonIsland.furnish', 'neonIsland.dossier', 'neonIsland.precinct', 'neonIsland.economy'];   // (economy: a city started in Economy mode, economy.js)   // (furnish: the apartments done up with Furnish pod, furnish.js)
const NT_CITY_PREFIX = 'neonIsland.coast.', NT_NOT_CITY = new Set(['neonIsland.coast.dayCycle']);
function NT_isCityKey(k){ return typeof k === 'string' && !NT_NOT_CITY.has(k) && (NT_CITY_KEYS.includes(k) || k.startsWith(NT_CITY_PREFIX)); }
let NT_SAVE_LOCK = false;
const NT_RAW = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
Storage.prototype.setItem = function (k, v){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.set.call(this, k, v); };
Storage.prototype.removeItem = function (k){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.remove.call(this, k); };
// #demo (js/demo.js): a 15 second scripted demo clip with a city of its own. It keeps nothing and reads nothing of the player's: every
// neonIsland.*, neonLooks.* and neonTerrarium.* key reads as never set (except the few the clip sets for itself, DEMO_KEYS) and writes to them are dropped
window.NT_DEMO = /#demo\b/.test(location.hash);
if (window.NT_DEMO){
  NT_SAVE_LOCK = true;
  const own = k => typeof k === 'string' && /^(neonIsland|neonLooks|neonTerrarium)\./.test(k);
  const K = window.DEMO_KEYS = { 'neonIsland.coastAccessed': '3', 'neonIsland.boothSeen': '1' };   // (the Spire shows its ledger, not the first-visit question; the Booth tab without its beckon)
  const get = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k){ if (this === window.localStorage && own(k)) return Object.prototype.hasOwnProperty.call(K, k) ? K[k] : null; return get.call(this, k); };
  Storage.prototype.setItem = function (k, v){ if (this === window.localStorage && own(k)){ K[k] = String(v); return; } return NT_RAW.set.call(this, k, v); };
  Storage.prototype.removeItem = function (k){ if (this === window.localStorage && own(k)){ delete K[k]; return; } return NT_RAW.remove.call(this, k); };
  // Render mode, as the trailer's film had it: when the recorder films the picture (its stepped clock, tools/demo/shim.js, is in), each frame has
  // all the time it needs, so every shortcut the game takes for a playable frame rate is off and every frame is drawn whole. Work spread over
  // frames or handed to the worker is done at once, nothing is swapped for a stand-in or dropped by distance, shadows, clouds and soft effects
  // are drawn in full every frame, the camera isn't snapped to whole pixels and the person cam's feed is drawn every frame. (Not when the
  // clip is watched live, or in the sound pass, which plays in real time.)
  if (window.__TR_CAPTURE){
    window.NT_RENDER = true;
    window.__NV_OFF = window.__SYNC_NOW = window.__STAGE_NOW = window.__GEN_MAIN = window.__KEEP_GEO = window.__ALERT_NOW = window.__DISPOSE_NOW = window.__KEEP_CPU = true;
    window.__TIER_OFF = window.__SOFT_FULL = window.__FULL_RATE = true;
  }
}
// the title screen shows on every load, unless a city switch just asked to go straight in
(() => {
  let skip = false; try { skip = sessionStorage.getItem('neonTerrarium.skipTitle') === '1'; sessionStorage.removeItem('neonTerrarium.skipTitle'); } catch (e) {}
  if (/[?&](notitle|tv=1)\b/.test(location.search) || navigator.webdriver || window.NT_DEMO) skip = true;   // (tests and the tools/ harnesses go straight in, and so does a return from the coast)
  if (/[?&]title\b/.test(location.search)) skip = false;   // (?title: show it anyway, for looking at it under a test browser)
  window.NT_TITLE = !skip;
  if (!skip) document.documentElement.classList.add('title-on', 'title-boot');   // (title-boot: a dark cover until the room's picture is in, so the city never shows loading first)
})();
