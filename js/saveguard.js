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
  'neonIsland.coastAccessed', 'neonIsland.booth', 'neonIsland.furnish', 'neonIsland.dossier', 'neonIsland.precinct', 'neonIsland.economy',   // (economy: a city started in Economy mode, economy.js)   // (furnish: the apartments done up with Furnish pod, furnish.js)
  'neonIsland.plan'];   // (plan: a Planner city's own state, placement.js)
const NT_CITY_PREFIX = 'neonIsland.coast.', NT_NOT_CITY = new Set(['neonIsland.coast.dayCycle']);
function NT_isCityKey(k){ return typeof k === 'string' && !NT_NOT_CITY.has(k) && (NT_CITY_KEYS.includes(k) || k.startsWith(NT_CITY_PREFIX)); }
let NT_SAVE_LOCK = false;
const NT_RAW = { get: Storage.prototype.getItem, set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
// Planner mode (placement.js) lives on its own link, index.html#plan, with cities of its own. On that link every city key (and the save slots' own
// bookkeeping, and the computer tutorial's progress) is kept under 'plan:' + the key, so the sandbox's cities and the Planner's never meet: nothing
// converts either way. Everything else (volumes, render choices, looks) stays shared. Changing the link between the two reloads the page.
const NT_PLAN = /(^#|[,&])plan\b/.test(location.hash);
const NT_NS = NT_PLAN ? 'plan:' : '';
const NT_NS_EXTRA = new Set(['neonTerrarium.activeSlot', 'neonTerrarium.cloudPushed', 'neonIsland.tutPC', 'neonIsland.tutPCHw', 'neonIsland.tutPCMt', 'neonIsland.tipsPC']);
function NT_nsKey(k){ return NT_NS && typeof k === 'string' && (NT_isCityKey(k) || NT_NS_EXTRA.has(k)) ? NT_NS + k : k; }
Storage.prototype.getItem = function (k){ return NT_RAW.get.call(this, this === window.localStorage ? NT_nsKey(k) : k); };
Storage.prototype.setItem = function (k, v){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.set.call(this, this === window.localStorage ? NT_nsKey(k) : k, v); };
Storage.prototype.removeItem = function (k){ if (NT_SAVE_LOCK && this === window.localStorage && NT_isCityKey(k)) return; return NT_RAW.remove.call(this, this === window.localStorage ? NT_nsKey(k) : k); };
if (NT_PLAN){
  // (the Planner teaches itself: the computer tutorial's first run is marked done here; its highway and metro notes still come the first time)
  try { if (NT_RAW.get.call(localStorage, 'plan:neonIsland.tutPC') === null) NT_RAW.set.call(localStorage, 'plan:neonIsland.tutPC', '{"done":true,"beats":{}}'); } catch (e) {}
  document.documentElement.classList.add('plan-link');
}
addEventListener('hashchange', () => { if (/(^#|[,&])plan\b/.test(location.hash) !== NT_PLAN) location.reload(); });
// which game mode is running, for the few places that ask (economy.js or placement.js; null in the sandbox)
function NT_MODE(){ return typeof ECON !== 'undefined' && ECON.on ? ECON : typeof PLAN !== 'undefined' && PLAN.on ? PLAN : null; }
// the title screen shows on every load, unless a city switch just asked to go straight in
(() => {
  let skip = false; try { skip = sessionStorage.getItem('neonTerrarium.skipTitle') === '1'; sessionStorage.removeItem('neonTerrarium.skipTitle'); } catch (e) {}
  if (/[?&](notitle|tv=1)\b/.test(location.search) || navigator.webdriver) skip = true;   // (tests and the tools/ harnesses go straight in, and so does a return from the coast)
  if (/[?&]title\b/.test(location.search)) skip = false;   // (?title: show it anyway, for looking at it under a test browser)
  window.NT_TITLE = !skip;
  if (!skip) document.documentElement.classList.add('title-on', 'title-boot');   // (title-boot: a dark cover until the room's picture is in, so the city never shows loading first)
})();
