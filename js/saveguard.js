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
  'neonIsland.coastAccessed', 'neonIsland.booth'];
const NT_CITY_PREFIX = 'neonIsland.coast.', NT_NOT_CITY = new Set(['neonIsland.coast.dayCycle']);
function NT_isCityKey(k){ return typeof k === 'string' && !NT_NOT_CITY.has(k) && (NT_CITY_KEYS.includes(k) || k.startsWith(NT_CITY_PREFIX)); }
let NT_SAVE_LOCK = false;
const NT_RAW = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
Storage.prototype.setItem = function (k, v){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.set.call(this, k, v); };
Storage.prototype.removeItem = function (k){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.remove.call(this, k); };
// the title screen shows on every load, unless a city switch just asked to go straight in
(() => {
  let skip = false; try { skip = sessionStorage.getItem('neonTerrarium.skipTitle') === '1'; sessionStorage.removeItem('neonTerrarium.skipTitle'); } catch (e) {}
  if (/[?&](notitle|tv=1)\b/.test(location.search) || navigator.webdriver) skip = true;   // (tests and the tools/ harnesses go straight in, and so does a return from the coast)
  if (/[?&]title\b/.test(location.search)) skip = false;   // (?title: show it anyway, for looking at it under a test browser)
  window.NT_TITLE = !skip;
  if (!skip) document.documentElement.classList.add('title-on');
})();
