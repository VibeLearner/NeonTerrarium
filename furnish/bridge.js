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
  let S = fresh(), visits = 0, HOLD = false;   // (HOLD: the game asks the warm-up to wait while the player moves the view)
  // the bar: Exit to city and Save, top left where the lab's Home menu sits
  const bar = document.createElement('div'); bar.className = 'nt-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Furnish pod');
  bar.innerHTML = '<button class="nt-exit" id="ntExit" title="Back to the city (your changes are kept)">Exit to city</button><button class="nt-save" id="ntSave" title="Save this apartment with the city (Ctrl+S)" disabled>Save</button>';
  // the player's page: the apartment is the LIDAR Array's reconstruction of the pod, which is why nobody is in it (sim, from js/furnish.js)
  const sim = document.createElement('div'); sim.className = 'nt-sim'; sim.hidden = true; sim.setAttribute('role', 'note');
  sim.innerHTML = '<b>LIDAR reconstruction</b><span>Simulated apartment, rebuilt from the scan.</span>';
  // (it sits just under the lab's toolbar at the top, whatever its height; the toast goes under it)
  // On a touch screen (html.ftouch, furnish/touch.js) the toolbar is folded into Tools on the top row, so both go under that row (and
  // under the Tools row while it is open), and the note only shows while the apartment comes in: see simWatch.
  const touch = () => document.documentElement.classList.contains('ftouch');
  function placeSim(){
    let top = 64;
    if (touch()){ let y = 0; for (const el of [bar, document.querySelector('.bstage.ft-tools .bbar')]){ const r = el && el.getBoundingClientRect(); if (r && r.height) y = Math.max(y, r.bottom); } if (y) top = Math.round(y + 8); }
    else { const bb = document.querySelector('.bbar'), r = bb && bb.getBoundingClientRect(); if (r && r.height) top = Math.round(r.bottom + 8); }
    sim.style.top = top + 'px';
    toast.style.top = (sim.hidden ? top : top + (sim.offsetHeight || 40) + 6) + 'px';
  }
  addEventListener('resize', () => { if (!sim.hidden) placeSim(); });
  const toast = document.createElement('div'); toast.className = 'nt-toast'; toast.hidden = true; toast.setAttribute('role', 'status');
  function say(t){ if (touch()) placeSim(); toast.textContent = t; toast.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { toast.hidden = true; }, 2200); }
  function mount(){
    const tl = document.querySelector('.btl'); if (tl) tl.insertBefore(bar, tl.firstChild); else document.body.appendChild(bar);
    document.body.appendChild(toast); document.body.appendChild(sim);
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
    sim.hidden = !m.sim; sim.classList.remove('in', 'gone'); if (m.sim){ placeSim(); void sim.offsetWidth; sim.classList.add('in'); for (const ms of [400, 1500, 4000]) setTimeout(() => { if (!sim.hidden) placeSim(); }, ms); }
    S.home = h; const visit = S.visit; liveWatch(visit); doneWatch(visit); if (m.sim) simWatch(visit);
    (async () => {
      try {
        if (warming){ try { if (PB().warmStop) await PB().warmStop(); else await warming; } catch (e) {} if (S.visit !== visit) return; sleep(false); }
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
  // On a touch screen the apartment coming in is a loading screen: from furnish:begin until the home is in and the hologram has resolved
  // a touch does nothing (the hold that build.py puts first in the page asks window.__ntLoading, so the lab's own listeners never see the
  // touch and the hologram is never cut short), and the LIDAR note goes once it is over: it says what the hologram is building, and on a
  // small screen it stood in front of the apartment after that. A minute at most, so a hologram that never ends can't hold the page.
  const HOLD_MS = 60000;
  function loading(){
    if (!S.opening || S.sent || !S.home || performance.now() - S.t0 > HOLD_MS) return false;
    const C = PC(), st = $('bStage');
    return !S.ready || !!(C && C.transitioning) || !!(st && st.classList.contains('trans'));
  }
  window.__ntLoading = loading;
  function simWatch(visit){
    const look = () => { if (S.visit !== visit || sim.hidden) return;
      if (!touch() || loading()){ requestAnimationFrame(look); return; }
      sim.classList.add('gone'); setTimeout(() => { if (S.visit !== visit) return; sim.hidden = true; sim.classList.remove('gone'); placeSim(); }, 450); };
    requestAnimationFrame(look);
  }
  // furnish:warm: while the title screen shows, everything that doesn't need a home is made ready (the library, the worker, the programs)
  // A visit can start before this finishes (the title screen lets go after a cap): the visit stops the builder's part (warmStop) and
  // waits for it to let go of its sample home, and the page is only put to sleep here when no visit has started meanwhile.
  let warming = null;
  async function warm(){
    const t0 = performance.now();
    warming = (async () => { try { if (PB().warm) await PB().warm(); } catch (e) { console.warn('furnish: builder warm-up', e); } })();
    await warming; warming = null;
    while (HOLD && !S.home && !S.opening) await new Promise(r => setTimeout(r, 150));   // (held while the player moves the city's view: the game, furnish.js)
    if (!S.home && !S.opening) try { if (PC() && PC().warm) await PC().warm(); } catch (e) { console.warn('furnish: context warm-up', e); }
    if (!S.home && !S.opening) sleep(true);
    send({ type: 'furnish:warmed', ms: Math.round(performance.now() - t0) });
  }
  addEventListener('message', e => {
    if (e.source !== host || e.origin !== ORIGIN) return;
    const m = e.data || {};
    try {
      if (m.type === 'furnish:begin') begin(m);
      else if (m.type === 'furnish:plots') plots(m);
      else if (m.type === 'furnish:warm') warm();
      else if (m.type === 'furnish:pixcap'){ try { if (PB().pixCap) PB().pixCap(); } catch (e) {} }
      else if (m.type === 'furnish:hold'){ HOLD = !!m.on; try { if (PB().warmHold) PB().warmHold(HOLD); } catch (e) {} }
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
