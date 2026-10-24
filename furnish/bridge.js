// Neon Terrarium: the game's side of furnish.html (the Pod Furniture Lab's Build mode, built with --embed). Injected by tools/furnish/build.py.
// It takes the city, the home and the saved recipe from the game (js/furnish.js) by postMessage, hands the city to PodContext.setCitySource
// and opens the home in PodBuilder; Save and Exit to city send the recipe back. Messages: docs/furnish.md.
// The page is made once by the game, warmed up while the title screen shows (furnish:warm) and kept for every visit: each visit
// starts with furnish:begin and ends with Exit (or Esc while it opens), after which the home and the city context are let go
// (PodBuilder.unload, PodContext.exit) and the page sleeps, hidden, until the next one.
'use strict';
(() => {
  const host = window.parent, ORIGIN = location.origin;
  if (!host || host === window) return;   // (opened on its own: the plain embedded lab, nothing to talk to)
  const send = (m, xfer) => host.postMessage(m, ORIGIN, xfer || []);
  const fresh = () => ({ home: null, dirty: false, opening: false, sent: false, ready: false, cityDone: false, t0: 0, visit: 0, offs: [] });
  let S = fresh(), visits = 0;
  // the bar: Exit to city and Save, top left where the lab's Home menu sits
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
  const PB = () => window.PodBuilder, PC = () => window.PodContext;
  const reusable = () => !!(PB() && PB().unload);
  const sleep = on => { try { if (PB() && PB().pauseRender) PB().pauseRender(!!on); } catch (e) {} };
  function recipe(){ try { return PB().recipe(); } catch (e) { return null; } }
  function save(){ if (!S.ready) return; const rc = recipe(); if (!rc) return; send({ type: 'furnish:save', recipe: rc }); }
  // the end of a visit: the game hides the page; here the home and the city context are let go, the programs and the library stay
  // The page stops drawing at once (the last frame stays on screen) so the game can play its hologram exit over it while the
  // city wakes up underneath; the home is let go after that (FADE ms), or straight away when another visit starts first.
  const FADE = 700;
  let pendingLeave = null;
  function flushLeave(){ const f = pendingLeave; pendingLeave = null; if (f) f(); }
  function leave(withRecipe){
    if (S.sent) return; S.sent = true;
    const rc = withRecipe && S.ready && S.dirty ? recipe() : null;
    sleep(true);
    send({ type: 'furnish:exit', recipe: rc });
    const v = S.visit;
    const go = () => { if (pendingLeave === go) pendingLeave = null; if (S.visit !== v) return;
      for (const off of S.offs) try { off(); } catch (e) {}
      try { if (PC() && PC().exit) PC().exit(); } catch (e) {}
      try { if (PB().setResidents) PB().setResidents(null); } catch (e) {}
      try { if (PB().unload) PB().unload(); } catch (e) { console.warn('furnish: unload', e); }
      S = fresh(); S.visit = v; sync(); sleep(true);
    };
    pendingLeave = go; setTimeout(() => { if (pendingLeave === go) flushLeave(); }, FADE);
  }
  function exit(){ leave(true); }
  // furnish:begin: the head of the city (cells, homes, camera) and the home. The city source is set at once and the home opened, so
  // PodContext's hologram starts straight away; the plots follow in furnish:plots batches and pace it (PodContext.progress).
  let stream = null;
  function begin(m){
    if (S.opening) return;
    flushLeave();   // (a quick reopen: the last home goes first)
    S = fresh(); S.opening = true; S.visit = ++visits; S.t0 = performance.now(); sleep(false);
    const h = m.home, pod = { cell: h.cell.slice(), section: h.section, floor: h.floor, zone: h.zone, kind: h.kind }, C = PC();
    if (C && C.addPlots && C.cityDone){ C.setCitySource(m.head, { streaming: true }); stream = { live: true }; }
    else if (C && C.setCitySource){   // (an older lab: the whole city once it is all here)
      let res; const pr = new Promise(r => { res = r; }); stream = { live: false, head: m.head, plots: [], em: m.head.em, res }; C.setCitySource(pr); }
    else console.warn('furnish: this lab build has no PodContext.setCitySource; the stand-in city is shown');
    S.home = h; const visit = S.visit; liveWatch(visit); doneWatch(visit);
    (async () => {
      try {
        if (m.recipe && m.recipe.home && Array.isArray(m.recipe.pieces)){ const rc = m.recipe; rc.home.pod = pod; await PB().load(rc, { openEarly: true }); }   // (openEarly: the hologram starts at the click, as for a new home)
        else if (m.household && PB().furnishFor) await PB().furnishFor(m.household, { tier: m.tier || null, pod });   // (lived in: furnished for the household that lives there)
        else await PB().newHome(m.tier || null, pod);   // (vacant, or an older lab: empty; null: the building's own tier and windows)
        if (S.visit !== visit) return;
        try { if (PB().setResidents) PB().setResidents(m.vacant ? [] : (m.residents || []), { vacant: !!m.vacant }); } catch (e) {}
        try { PB().setTime(m.time === 'day' ? 'day' : 'night', { host: true }); } catch (e) {}
        S.dirty = false; S.ready = true; S.homeMs = Math.round(performance.now() - S.t0); sync();
        if (PB().onChange){ const off = PB().onChange(() => { if (S.visit === visit){ S.dirty = true; sync(); } }); if (typeof off === 'function') S.offs.push(off); }
        if (PB().onSave){ const off = PB().onSave(() => save()); if (typeof off === 'function') S.offs.push(off); }
      } catch (e) { console.error('furnish: the home could not be opened', e); send({ type: 'furnish:error', message: 'The apartment could not be opened: ' + (e && e.message || e) }); }
    })();
  }
  function plots(m){
    const C = PC(); if (!stream || !S.opening) return;
    if (stream.live){ if (m.plots.length) C.addPlots(m.plots, m.em); if (C.progress) C.progress(m.k); if (m.done){ C.cityDone(); S.cityDone = true; } }
    else { for (const p of m.plots) stream.plots.push(p); stream.em = m.em; if (m.done){ S.cityDone = true; stream.res(Object.assign({}, stream.head, { plots: stream.plots, em: stream.em })); } }
  }
  // the page shows once the hologram has the screen (or the home is up, whichever comes first); until then the game's own picture stays
  function liveWatch(visit){
    const look = () => { if (S.visit !== visit) return; const C = PC();
      if ((C && C.transitioning) || S.ready || performance.now() - S.t0 > 6000){ send({ type: 'furnish:live' }); return; }
      requestAnimationFrame(look); };
    look();
  }
  // and the open is done once the home is in, the city has all come and the hologram has resolved: the lab's own timings go back with it
  function doneWatch(visit){
    const look = () => { if (S.visit !== visit) return; const C = PC(); let st = null; try { st = C && C.stats ? C.stats() : null; } catch (e) {}
      const built = !st || !st.plots || !st.plots.building;
      if (S.ready && S.cityDone && !(C && C.transitioning) && built){
        let perf = null; try { perf = PB().perf ? PB().perf() : null; } catch (e) {}
        send({ type: 'furnish:done', lab: { homeMs: S.homeMs, ms: Math.round(performance.now() - S.t0), timeline: st && st.timeline || null, builder: perf } }); return; }
      requestAnimationFrame(look); };
    requestAnimationFrame(look);
  }
  // furnish:warm: while the title screen shows, everything that doesn't need a home is made ready (the library, the worker, the programs)
  async function warm(){
    const t0 = performance.now();
    try { if (PB().warm) await PB().warm(); } catch (e) { console.warn('furnish: builder warm-up', e); }
    try { if (PC() && PC().warm) await PC().warm(); } catch (e) { console.warn('furnish: context warm-up', e); }
    sleep(true);
    send({ type: 'furnish:warmed', ms: Math.round(performance.now() - t0) });
  }
  addEventListener('message', e => {
    if (e.source !== host || e.origin !== ORIGIN) return;
    const m = e.data || {};
    try {
      if (m.type === 'furnish:begin') begin(m);
      else if (m.type === 'furnish:plots') plots(m);
      else if (m.type === 'furnish:warm') warm();
      else if (m.type === 'furnish:wake') sleep(false);
      else if (m.type === 'furnish:saved'){ if (m.ok){ S.dirty = false; sync(); say('Saved with the city'); } else say('Could not save: the browser storage is full or blocked'); }
    } catch (err) { console.error('furnish: ' + m.type + ' failed', err); if (m.type === 'furnish:begin') send({ type: 'furnish:error', message: 'The apartment could not be opened: ' + (err && err.message || err) }); }
  });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.ready){ e.preventDefault(); e.stopImmediatePropagation(); save(); return; }
    // Esc while the apartment is still coming in (the hologram playing, the city loading): back to the city, nothing saved
    if (e.key === 'Escape' && S.home && (!S.ready || !S.cityDone || (PC() && PC().transitioning))){ e.preventDefault(); e.stopImmediatePropagation(); leave(false); }
  }, true);
  // ready once PodBuilder is there and Build is showing
  function boot(){
    if (!document.body || !window.PodBuilder || document.body.dataset.view !== 'build'){ setTimeout(boot, 60); return; }
    mount(); $('ntExit').addEventListener('click', exit); $('ntSave').addEventListener('click', save);
    send({ type: 'furnish:ready', reusable: reusable() });
  }
  boot();
})();
