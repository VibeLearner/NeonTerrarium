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
  'neonIsland.coastAccessed', 'neonIsland.booth', 'neonIsland.furnish', 'neonIsland.dossier', 'neonIsland.precinct'];   // (furnish: the apartments done up with Furnish pod, furnish.js)
const NT_CITY_PREFIX = 'neonIsland.coast.', NT_NOT_CITY = new Set(['neonIsland.coast.dayCycle']);
function NT_isCityKey(k){ return typeof k === 'string' && !NT_NOT_CITY.has(k) && (NT_CITY_KEYS.includes(k) || k.startsWith(NT_CITY_PREFIX)); }
let NT_SAVE_LOCK = false;
// #trailer (js/trailer.js) builds a city of its own and changes settings for the film: nothing it does is kept, the player's city and every
// neonIsland.* preference stay exactly as they were
window.NT_TRAILER = /trailer/.test(location.hash);
if (window.NT_TRAILER) NT_SAVE_LOCK = true;   // (and the city slots' checkpoints stand down: slots.js)
// #director (js/director.js, the trailer maker) films a copy of a city: the copy is kept for this tab in sessionStorage (ntDirector.city) and
// every read of a city key is answered from it, so the game, the people, the stories and the cases all start from that city. Like the
// trailer it keeps nothing: city keys and neonIsland.* / neonLooks.* settings are left exactly as they were
window.NT_DIRECTOR = /director/.test(location.hash);
let NT_DIR_CITY = null;
if (window.NT_DIRECTOR){
  NT_SAVE_LOCK = true;
  NT_DIR_CITY = window.__DIR_CITY || null;   // (the recorder hands the city in directly: tools/trailer/record.py --project)
  if (!NT_DIR_CITY) try { NT_DIR_CITY = JSON.parse(sessionStorage.getItem('ntDirector.city') || 'null'); } catch (e) {}
  if (!NT_DIR_CITY || typeof NT_DIR_CITY !== 'object') NT_DIR_CITY = {};
}
const NT_FILM = () => window.NT_TRAILER || window.NT_DIRECTOR;
const NT_LOCKED = k => (NT_SAVE_LOCK && NT_isCityKey(k)) || (NT_FILM() && typeof k === 'string' && (k.startsWith('neonIsland.') || k.startsWith('neonLooks.')));
const NT_RAW = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem, get: Storage.prototype.getItem };
if (window.NT_DIRECTOR) Storage.prototype.getItem = function (k){
  if (this === window.localStorage && NT_isCityKey(k)) return Object.prototype.hasOwnProperty.call(NT_DIR_CITY, k) ? NT_DIR_CITY[k] : null;
  return NT_RAW.get.call(this, k);
};
Storage.prototype.setItem = function (k, v){ if (this === window.localStorage && NT_LOCKED(k)) return; return NT_RAW.set.call(this, k, v); };
Storage.prototype.removeItem = function (k){ if (this === window.localStorage && NT_LOCKED(k)) return; return NT_RAW.remove.call(this, k); };
// the title screen shows on every load, unless a city switch just asked to go straight in
(() => {
  let skip = false; try { skip = sessionStorage.getItem('neonTerrarium.skipTitle') === '1'; sessionStorage.removeItem('neonTerrarium.skipTitle'); } catch (e) {}
  if (/[?&](notitle|tv=1)\b/.test(location.search) || navigator.webdriver || window.NT_TRAILER || window.NT_DIRECTOR) skip = true;   // (tests and the tools/ harnesses go straight in, and so does a return from the coast)
  if (/[?&]title\b/.test(location.search)) skip = false;   // (?title: show it anyway, for looking at it under a test browser)
  window.NT_TITLE = !skip;
  if (!skip) document.documentElement.classList.add('title-on', 'title-boot');   // (title-boot: a dark cover until the room's picture is in, so the city never shows loading first)
})();
