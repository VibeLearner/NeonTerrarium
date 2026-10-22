// Neon Terrarium: the game's side of furnish.html (the Pod Furniture Lab's Build mode, built with --embed). Injected by tools/furnish/build.py.
// It takes the city, the home and the saved recipe from the game (js/furnish.js) by postMessage, hands the city to PodContext.setCitySource
// and opens the home in PodBuilder; Save and Exit to city send the recipe back. Messages: docs/furnish.md.
'use strict';
(() => {
  const host = window.parent, ORIGIN = location.origin;
  if (!host || host === window) return;   // (opened on its own: the plain embedded lab, nothing to talk to)
  const send = (m, xfer) => host.postMessage(m, ORIGIN, xfer || []);
  const S = { home: null, dirty: false, opening: false, sent: false, ready: false, cityDone: false };
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
  function sync(){ $('ntSave').disabled = !S.ready || !S.dirty; $('ntSave').classList.toggle('on', S.dirty); }
  const PB = () => window.PodBuilder;
  function recipe(){ try { return PB().recipe(); } catch (e) { return null; } }
  function save(){ if (!S.ready) return; const rc = recipe(); if (!rc) return; send({ type: 'furnish:save', recipe: rc }); }
  function exit(){ if (S.sent) return; S.sent = true; send({ type: 'furnish:exit', recipe: S.ready && S.dirty ? recipe() : null }); }
  // furnish:begin: the head of the city (cells, homes, camera) and the home. The city source is set at once and the home opened, so
  // PodContext's hologram starts straight away; the plots follow in furnish:plots batches and pace it (PodContext.progress).
  let stream = null;
  function begin(m){
    if (S.opening) return; S.opening = true;
    const h = m.home, pod = { cell: h.cell.slice(), section: h.section, floor: h.floor, zone: h.zone, kind: h.kind }, C = window.PodContext;
    if (C && C.addPlots && C.cityDone){ C.setCitySource(m.head, { streaming: true }); stream = { live: true }; }
    else if (C && C.setCitySource){   // (an older lab: the whole city once it is all here)
      let res; const pr = new Promise(r => { res = r; }); stream = { live: false, head: m.head, plots: [], em: m.head.em, res }; C.setCitySource(pr); }
    else console.warn('furnish: this lab build has no PodContext.setCitySource; the stand-in city is shown');
    S.home = h; liveWatch();
    (async () => {
      try {
        if (m.recipe && m.recipe.home && Array.isArray(m.recipe.pieces)){ const rc = m.recipe; rc.home.pod = pod; await PB().load(rc); }
        else if (m.household && PB().furnishFor) await PB().furnishFor(m.household, { tier: m.tier || null, pod });   // (lived in: furnished for the household that lives there)
        else await PB().newHome(m.tier || null, pod);   // (vacant, or an older lab: empty; null: the building's own tier and windows)
        try { if (PB().setResidents) PB().setResidents(m.vacant ? [] : (m.residents || []), { vacant: !!m.vacant }); } catch (e) {}
        try { PB().setTime(m.time === 'day' ? 'day' : 'night', { host: true }); } catch (e) {}
        S.dirty = false; S.ready = true; sync();
        if (PB().onChange) PB().onChange(() => { S.dirty = true; sync(); });
        if (PB().onSave) PB().onSave(() => save());
      } catch (e) { console.error('furnish: the home could not be opened', e); send({ type: 'furnish:error', message: 'The apartment could not be opened: ' + (e && e.message || e) }); }
    })();
  }
  function plots(m){
    const C = window.PodContext; if (!stream) return;
    if (stream.live){ if (m.plots.length) C.addPlots(m.plots, m.em); if (C.progress) C.progress(m.k); if (m.done){ C.cityDone(); S.cityDone = true; } }
    else { for (const p of m.plots) stream.plots.push(p); stream.em = m.em; if (m.done){ S.cityDone = true; stream.res(Object.assign({}, stream.head, { plots: stream.plots, em: stream.em })); } }
  }
  // the page shows once the hologram has the screen (or the home is up, whichever comes first); until then the game's own picture stays
  function liveWatch(){
    const t0 = performance.now();
    const look = () => { const C = window.PodContext;
      if ((C && C.transitioning) || S.ready || performance.now() - t0 > 6000){ send({ type: 'furnish:live' }); return; }
      requestAnimationFrame(look); };
    requestAnimationFrame(look);
  }
  addEventListener('message', e => {
    if (e.source !== host || e.origin !== ORIGIN) return;
    const m = e.data || {};
    try {
      if (m.type === 'furnish:begin') begin(m);
      else if (m.type === 'furnish:plots') plots(m);
      else if (m.type === 'furnish:saved'){ if (m.ok){ S.dirty = false; sync(); say('Saved with the city'); } else say('Could not save: the browser storage is full or blocked'); }
    } catch (err) { console.error('furnish: ' + m.type + ' failed', err); if (m.type === 'furnish:begin') send({ type: 'furnish:error', message: 'The apartment could not be opened: ' + (err && err.message || err) }); }
  });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.ready){ e.preventDefault(); e.stopImmediatePropagation(); save(); return; }
    // Esc while the apartment is still coming in (the hologram playing, the city loading): back to the city, nothing saved
    if (e.key === 'Escape' && S.home && (!S.ready || !S.cityDone || (window.PodContext && PodContext.transitioning))){ e.preventDefault(); e.stopImmediatePropagation(); if (!S.sent){ S.sent = true; send({ type: 'furnish:exit', recipe: null }); } }
  }, true);
  // ready once PodBuilder is there and Build is showing
  function boot(){
    if (!document.body || !window.PodBuilder || document.body.dataset.view !== 'build'){ setTimeout(boot, 60); return; }
    mount(); $('ntExit').addEventListener('click', exit); $('ntSave').addEventListener('click', save);
    send({ type: 'furnish:ready' });
  }
  boot();
})();
