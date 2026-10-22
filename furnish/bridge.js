// Neon Terrarium: the game's side of furnish.html (the Pod Furniture Lab's Build mode, built with --embed). Injected by tools/furnish/build.py.
// It takes the city, the home and the saved recipe from the game (js/furnish.js) by postMessage, hands the city to PodContext.setCitySource
// and opens the home in PodBuilder; Save and Exit to city send the recipe back. Messages: docs/furnish.md.
'use strict';
(() => {
  const host = window.parent, ORIGIN = location.origin;
  if (!host || host === window) return;   // (opened on its own: the plain embedded lab, nothing to talk to)
  const send = (m, xfer) => host.postMessage(m, ORIGIN, xfer || []);
  const S = { home: null, dirty: false, opening: false, sent: false };
  // the bar: Exit to city, Save and which home this is, top left where the lab's Home menu sits
  const bar = document.createElement('div'); bar.className = 'nt-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Furnish pod');
  bar.innerHTML = '<button class="nt-exit" id="ntExit" title="Back to the city (your changes are kept)">Exit to city</button><button class="nt-save" id="ntSave" title="Save this apartment with the city (Ctrl+S)" disabled>Save</button>';
  const toast = document.createElement('div'); toast.className = 'nt-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  function say(t){ toast.textContent = t; toast.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { toast.hidden = true; }, 2200); }
  function mount(){
    const tl = document.querySelector('.btl'); if (tl) tl.insertBefore(bar, tl.firstChild); else document.body.appendChild(bar);
    document.body.appendChild(toast);
  }
  const $ = id => document.getElementById(id);
  function sync(){ $('ntSave').disabled = !S.home || !S.dirty; $('ntSave').classList.toggle('on', S.dirty); }
  const PB = () => window.PodBuilder;
  function recipe(){ try { return PB().recipe(); } catch (e) { return null; } }
  function save(){ if (!S.home) return; const rc = recipe(); if (!rc) return; send({ type: 'furnish:save', recipe: rc }); }
  function exit(){ if (S.sent) return; S.sent = true; send({ type: 'furnish:exit', recipe: S.home && S.dirty ? recipe() : null }); }
  async function open(m){
    if (S.opening) return; S.opening = true;
    const h = m.home, pod = { cell: h.cell.slice(), section: h.section, floor: h.floor, zone: h.zone, kind: h.kind };
    try {
      if (window.PodContext && PodContext.setCitySource) PodContext.setCitySource(m.city);
      else console.warn('furnish: this lab build has no PodContext.setCitySource; the stand-in city is shown');
      if (m.recipe && m.recipe.home && Array.isArray(m.recipe.pieces)){ const rc = m.recipe; rc.home.pod = pod; await PB().load(rc); }
      else await PB().newHome(m.tier || null, pod);   // (null: the building's own tier and windows)
      try { PB().setTime(m.time === 'day' ? 'day' : 'night', { host: true }); } catch (e) {}
      S.home = h; S.dirty = false; sync();
      if (PB().onChange) PB().onChange(() => { S.dirty = true; sync(); });
      if (PB().onSave) PB().onSave(() => save());
    } catch (e) { console.error('furnish: the home could not be opened', e); send({ type: 'furnish:error', message: 'The apartment could not be opened: ' + (e && e.message || e) }); }
  }
  addEventListener('message', e => {
    if (e.source !== host || e.origin !== ORIGIN) return;
    const m = e.data || {};
    if (m.type === 'furnish:open') open(m);
    else if (m.type === 'furnish:saved'){ if (m.ok){ S.dirty = false; sync(); say('Saved with the city'); } else say('Could not save: the browser storage is full or blocked'); }
  });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.home){ e.preventDefault(); e.stopImmediatePropagation(); save(); } }, true);
  // ready once PodBuilder is there and Build is showing
  function boot(){
    if (!document.body || !window.PodBuilder || document.body.dataset.view !== 'build'){ setTimeout(boot, 60); return; }
    mount(); $('ntExit').addEventListener('click', exit); $('ntSave').addEventListener('click', save);
    send({ type: 'furnish:ready' });
  }
  boot();
})();
