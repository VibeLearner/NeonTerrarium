// Neon Terrarium: the touch screen's own pieces (claude/mobile-ui-plan.md). Nothing here runs with a mouse and keyboard: the desktop page is untouched.
//  - the hold ring under a finger about to remove something, and the Restore chip that puts the last removal back (input.js asks for both)
//  - a tap on a megastructure with a screen of its own (the Acoustic Panel, the Data Spire, the Precinct desk) shows its button over it for 5 s;
//    the button opens the screen. A tap on any other megastructure opens its card: its name, a line in the log's voice, and TURN
//  - text the interface cuts short scrolls to show the rest
//  - a TURN chip while a megastructure is being placed, a recenter button once the view has wandered off the city, an exit chip for erase mode
//  - the Interface tab of Settings (playerui.js makes the tab): text size, Clean signal, reduce motion, haptics, tips, the tutorial, erase mode, full screen
//  - press and hold anything that explains itself in a hover tooltip (a title) and the explanation shows on a plate; Settings' rows get an "i" too
//  - small vibrations on a build and a removal (Android; a setting)
'use strict';
const TUI = (() => {
  const U = { buzz(){}, ring(){}, snapCell(){ return null; }, offerRestore(){}, peek(){}, megaTap(){ return false; }, eraseChip(){}, aimTip(){} };
  if (typeof TOUCH === 'undefined' || !TOUCH.on) return U;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const ls = { get: (k, d) => { try { const v = localStorage.getItem('touch:nt.' + k); return v === null ? d : v; } catch (e) { return d; } },
               set: (k, v) => { try { localStorage.setItem('touch:nt.' + k, String(v)); } catch (e) {} } };
  const root = document.documentElement;

  /* ---------- haptics ---------- */
  U.buzz = ms => { if (ls.get('haptics', '1') === '1' && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

  /* ---------- the hold ring ---------- */
  const ring = el('div', 'tring'); ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26"/></svg>';
  document.body.appendChild(ring);
  let ringT = 0;
  // (it only shows after a short wait, so a quick tap never flashes it; it fills over the rest of the hold)
  U.ring = (x, y, ms) => { clearTimeout(ringT); ring.classList.remove('on');
    if (x === null || x === undefined) return;
    ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.setProperty('--ms', Math.max(100, ms - 140) + 'ms');
    ringT = setTimeout(() => { void ring.offsetWidth; ring.classList.add('on'); }, 140); };

  /* ---------- Restore: the last removal, put back ---------- */
  const clone = v => v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
  U.snapCell = pk => {
    if (!pk || pk.kind === 'sky' || !pk.c || pk.c.mega || pk.c.wall) return null;
    const c = pk.c; return { i: c.i, j: c.j, sections: clone(c.sections), lift: clone(c.lift), below: clone(c.below), green: c.green, style: c.style };
  };
  const chip = el('button', 'trestore', 'Restore'); chip.type = 'button'; chip.hidden = true; document.body.appendChild(chip);
  let chipSnap = null, chipT = 0;
  // (it sits just above the zone card, the Perimeter button's size, owner Oct 30: placed from their boxes each time it shows)
  const placeChip = () => { const z = document.querySelector('.zones > .tcur .zone, .zones > .zone.tcur, .zones .zone.on') || document.querySelector('.zones .zone'), r = z && z.getBoundingClientRect();
    if (!r || !r.width) return;
    const col = z.closest('.zcol'), pe = (col && col.querySelector('.perim')) || document.querySelector('.zones .perim'), pr = pe && pe.getBoundingClientRect();
    const w = pr && pr.width ? pr.width : r.width, h = pr && pr.height ? pr.height : 15;
    chip.style.left = Math.round(r.left + (r.width - w)/2) + 'px'; chip.style.width = Math.round(w) + 'px'; chip.style.height = Math.round(h) + 'px';
    const top = col ? col.getBoundingClientRect().top : r.top; chip.style.bottom = Math.round(innerHeight - top + 8) + 'px'; };
  U.offerRestore = snap => { chipSnap = snap; chip.hidden = false; placeChip(); clearTimeout(chipT); chipT = setTimeout(() => { chip.hidden = true; chipSnap = null; }, 5000); };
  chip.addEventListener('click', () => { const s = chipSnap; chip.hidden = true; chipSnap = null; clearTimeout(chipT); if (s && restore(s)){ U.buzz(12); dispatchEvent(new CustomEvent('nt:restore')); } });
  function restore(s){
    try {
      let c = cells.get(ckey(s.i, s.j));
      if (!c){ c = addPlatform(s.i, s.j, null); if (!c) return false; }
      stageFinishNear([c]); finishAnimsOn(c);
      const top = s.sections && s.sections.length ? s.sections[s.sections.length - 1].zone : null;
      if (top) holdRegion(c);   // (only when a build sweep follows to let it go: see freshRebuild in input.js)
      const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
      c.sections = clone(s.sections) || []; c.lift = clone(s.lift) || null; c.below = clone(s.below) || null; if (s.green) c.green = s.green; if (s.style) c.style = s.style;
      const near = SIDES4.map(([a, b]) => cells.get(ckey(c.i + a, c.j + b))).filter(n => n && n.lift && !n.mega);
      refresh([c, ...near]); dropView(old);
      if (top) startAnim(c, 'build', CURB - .05, c.height + 1.2, top, SIDE, null);
      return true;
    } catch (e){ console.warn('restore', e); return false; }
  }

  /* ---------- megastructures: the card, the holo-tags ---------- */
  const SCREEN = { radio: ['PANEL', () => { const b = $('gdPanel'); if (b) b.click(); }], spire: ['LEDGER', m => OVERSEER.show(m)], police: ['DESK', m => PRECINCT.show(m)] };
  const LINE = { radio: 'Broadcasting to the district.', spire: 'Ledger online. City records current.', police: 'Desk staffed. Calls logged.', lidar: 'Array sweeping. Pods in range can be scanned.',
    wirenest: 'Relay up. Traffic logged.', club: 'Doors open after dark.', square: 'Stalls trading.', market: 'Stalls trading.', mall: 'Floors open.', greenhouse: 'Crops cycling.', foundry: 'Furnaces lit.' };
  const card = el('div', 'tpeek'); card.hidden = true; card.setAttribute('role', 'dialog');
  card.innerHTML = '<div class="tp-h"><b></b><button class="tp-x" type="button" aria-label="Close">✕</button></div><p class="tp-l"></p><div class="tp-b"><button class="tp-go" type="button">ACCESS</button><button class="tp-turn" type="button">TURN</button></div>';
  document.body.appendChild(card);
  let peekM = null;
  U.peek = m => {
    if (!m || !megas.has(m.id)) return false;
    peekM = m; const t = MEGA_TYPES[m.kind] || {}, scr = SCREEN[m.kind];
    card.querySelector('b').textContent = (t.name || m.kind).toUpperCase();
    card.querySelector('.tp-l').textContent = (LINE[m.kind] || 'Online.') + ' ' + m.w + ' × ' + m.h + ' plots.';
    const go = card.querySelector('.tp-go'); go.hidden = !scr; if (scr) go.textContent = 'ACCESS ' + scr[0];
    card.hidden = false; dispatchEvent(new CustomEvent('nt:peek', { detail: m.kind })); return true;
  };
  const closePeek = () => { card.hidden = true; peekM = null; };
  card.querySelector('.tp-x').addEventListener('click', closePeek);
  card.querySelector('.tp-go').addEventListener('click', () => { const m = peekM, s = m && SCREEN[m.kind]; closePeek(); if (s) s[1](m); });
  card.querySelector('.tp-turn').addEventListener('click', () => { if (peekM && typeof turnMega === 'function'){ if (turnMega(peekM)) U.buzz(12); } });
  // (a press on the city closes the card)
  $('view').addEventListener('pointerdown', () => { if (!card.hidden) closePeek(); }, true);
  // the tags: one per megastructure with a screen, over its middle, moved each frame with transform only. Hidden until the megastructure is tapped
  // (owner, Oct 30: tapping builds, so the buttons don't hover all the time): a tap shows its button for 5 s, then it fades. Tapping the button opens
  // the screen straight away; while that screen (or any other) is open no button shows, and once it's closed the button comes back for 5 s and fades
  const SHOW_MS = 5000, tags = new Map(), _v = new THREE.Vector3();
  function syncTags(){
    for (const [id, t] of tags) if (!megas.has(id)){ t.el.remove(); tags.delete(id); }
    for (const m of megas.values()){ if (!SCREEN[m.kind] || tags.has(m.id)) continue;
      const b = el('button', 'tholo'); b.type = 'button'; b.innerHTML = '<i></i><span>' + SCREEN[m.kind][0] + '</span>';
      const t = { el: b, m, until: 0, opened: false };
      b.addEventListener('click', () => { if (!megas.has(m.id)) return; t.opened = true; t.until = 0; U.buzz(8); SCREEN[m.kind][1](m); });
      document.body.appendChild(b); tags.set(m.id, t); }
  }
  U.megaTap = m => {
    if (!m || !megas.has(m.id)) return false;
    if (!SCREEN[m.kind]) return U.peek(m);   // (no screen to open: its card, with TURN)
    syncTags(); const t = tags.get(m.id); if (!t) return U.peek(m);
    for (const o of tags.values()) if (o !== t) o.until = 0;   // (one at a time)
    t.until = performance.now() + SHOW_MS; U.buzz(6); dispatchEvent(new CustomEvent('nt:peek', { detail: m.kind })); return true;
  };
  let tagRect = null, wasBusy = false; addEventListener('resize', () => { tagRect = null; });
  let gpEl = null, tsEl = null;
  function placeTags(){
    if (!tags.size) return;
    // (nothing to show or watch: nothing to do. This runs every frame; it used to look the page up each time, about half a millisecond a frame)
    const now = performance.now(); let any = false;
    for (const t of tags.values()) if (t.on || t.opened || now < t.until){ any = true; break; }
    if (!any) return;
    gpEl = gpEl || document.getElementById('gridPanel'); tsEl = tsEl || document.getElementById('tsheet');
    const busy = root.classList.contains('gp-open') || (typeof OVERSEER !== 'undefined' && OVERSEER.hold) || (typeof PRECINCT !== 'undefined' && PRECINCT.hold) || (typeof FURN !== 'undefined' && FURN.hold) || (typeof TITLE !== 'undefined' && TITLE.on) ||
      !!(gpEl && gpEl.classList.contains('open')) || !!(tsEl && !tsEl.hidden) || !card.hidden;
    // a screen opened from a button has closed: the button again, for 5 s
    if (wasBusy && !busy) for (const t of tags.values()) if (t.opened){ t.opened = false; t.until = now + SHOW_MS; }
    wasBusy = busy;
    const r = tagRect || (tagRect = $('view').getBoundingClientRect());
    for (const t of tags.values()){
      const want = !busy && now < t.until;
      if (want){ const m = t.m; let top = m.top || 6; _v.set((m.i + (m.w - 1)/2)*LOT, top + 1.5, (m.j + (m.h - 1)/2)*LOT).project(cam); }
      const on = want && _v.z < 1 && Math.abs(_v.x) < 1.6 && Math.abs(_v.y) < 1.6;   // (a tall one's top off the screen: its button held at the edge, below)
      if (t.on !== on){ t.on = on; t.el.classList.toggle('ton', on); }
      if (on){ const sa = 54, x = Math.round(Math.max(r.left + 50, Math.min(r.right - 50, r.left + (_v.x*.5 + .5)*r.width))), y = Math.round(Math.max(r.top + sa + 40, Math.min(r.bottom - 160, r.top + (1 - (_v.y*.5 + .5))*r.height)));
        if (x !== t.x || y !== t.y){ t.x = x; t.y = y; t.el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-100%)'; } }
    }
  }

  /* ---------- aiming, zoomed out: "Tap again to place" by the outline, the first few times (input.js freshBuild) ---------- */
  const aimEl = el('div', 'taim', 'Tap again to place'); aimEl.hidden = true; document.body.appendChild(aimEl);
  let aimT = 0;
  U.aimTip = (x, y) => {
    clearTimeout(aimT); if (x == null){ aimEl.hidden = true; return; }
    let n = 0; try { n = +(localStorage.getItem('touch:nt.aimTips') || 0); } catch (e) {} if (n >= 4) return;
    try { localStorage.setItem('touch:nt.aimTips', String(n + 1)); } catch (e) {}
    aimEl.hidden = false; aimEl.style.transform = 'translate(' + Math.round(Math.max(70, Math.min(innerWidth - 70, x))) + 'px,' + Math.round(Math.max(60, y - 56)) + 'px) translate(-50%,-100%)';
    aimT = setTimeout(() => { aimEl.hidden = true; }, 2600);
  };

  /* ---------- the TURN chip while placing, recenter, erase mode's exit ---------- */
  const turnChip = el('button', 'tchip tturn', 'TURN'); turnChip.type = 'button'; turnChip.hidden = true; document.body.appendChild(turnChip);
  turnChip.addEventListener('click', () => { megaTurn = !megaTurn; if (ptrLast) showMegaGhost(megaPick, groundCellAt(ptrLast.x, ptrLast.y), megaTurn); U.buzz(8); });
  const centerBtn = el('button', 'tchip tcenter', 'CENTER'); centerBtn.type = 'button'; centerBtn.hidden = true; centerBtn.setAttribute('aria-label', 'Back to the middle of the city'); document.body.appendChild(centerBtn);
  centerBtn.addEventListener('click', () => { centerView(); centerBtn.hidden = true; });
  const eraseX = el('button', 'tchip terase', 'ERASE ON  ✕'); eraseX.type = 'button'; eraseX.hidden = true; document.body.appendChild(eraseX);
  eraseX.addEventListener('click', () => { if (typeof setDelMode === 'function') setDelMode(false); syncErase(); });
  U.eraseChip = on => { eraseX.hidden = !on; syncErase(); };
  let eraseBox = null; const syncErase = () => { if (eraseBox) eraseBox.checked = !!delMode; };
  function wander(){   // how far the view has gone from the city: past its edge and a bit, the recenter button shows
    let n = 0, x = 0, z = 0, r = 0; for (const c of cells.values()){ n++; x += c.x; z += c.z; } if (!n) { centerBtn.hidden = true; return; }
    x /= n; z /= n; for (const c of cells.values()) r = Math.max(r, Math.hypot(c.x - x, c.z - z));
    centerBtn.hidden = Math.hypot(camGoal.x - x, camGoal.z - z) < r + Math.max(24, zoom*1.2);
  }
  let lastSlow = 0;
  (function loop(now){
    requestAnimationFrame(loop);
    try { placeTags(); turnChip.hidden = !(megaPick && MEGA_TYPES[megaPick] && MEGA_TYPES[megaPick].w !== MEGA_TYPES[megaPick].h); } catch (e) { if (!loop.w){ loop.w = 1; console.warn("touchui tags", e); } }
    if (now - lastSlow > 1000){ lastSlow = now; try { syncTags(); wander(); } catch (e) {} }
  })(performance.now());

  /* ---------- press and hold: the explanation a hover tooltip would give ---------- */
  const plate = el('div', 'tplate'); plate.hidden = true; plate.setAttribute('role', 'tooltip'); document.body.appendChild(plate);
  let lp = null, eatClick = false;
  const hidePlate = () => { plate.hidden = true; };
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return; hidePlate();
    const t = e.target.closest && e.target.closest('[title]:not(#view),[data-explain]'); if (!t) return;
    const text = t.dataset.explain || t.getAttribute('title'); if (!text) return;
    lp = { t, text, x: e.clientX, y: e.clientY, timer: setTimeout(() => { if (!lp) return; showPlate(lp.t, lp.text); eatClick = true; U.buzz(8); lp = null; }, 500) };
  }, true);
  document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10){ clearTimeout(lp.timer); lp = null; } }, true);
  const lpEnd = () => { if (lp){ clearTimeout(lp.timer); lp = null; } };
  document.addEventListener('pointerup', lpEnd, true); document.addEventListener('pointercancel', lpEnd, true);
  document.addEventListener('click', e => { if (eatClick){ eatClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[title],[data-explain]')) e.preventDefault(); }, true);
  function showPlate(t, text){
    plate.textContent = text; plate.hidden = false;
    const r = t.getBoundingClientRect(), w = Math.min(280, innerWidth - 24); plate.style.maxWidth = w + 'px';
    const pr = plate.getBoundingClientRect(), x = Math.max(12, Math.min(innerWidth - pr.width - 12, r.left + r.width/2 - pr.width/2));
    const y = r.top - pr.height - 10 > 12 ? r.top - pr.height - 10 : r.bottom + 10;
    plate.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    clearTimeout(plate._t); plate._t = setTimeout(hidePlate, 4000);
  }

  /* ---------- the Interface tab ---------- */
  function iface(){
    const P = window.PUI; if (!P || !P.panes.ui) return;
    const pane = P.panes.ui, grp = (title, ...kids) => { const s = el('section', 'pu-group'); s.append(el('h3', null, title), ...kids); return s; };
    const tog = (label, key, def, apply, why) => { const l = el('label', 'tog'), b = el('input'); b.type = 'checkbox'; b.checked = ls.get(key, def) === '1';
      b.addEventListener('change', () => { ls.set(key, b.checked ? '1' : '0'); apply(b.checked); }); l.append(b, document.createTextNode(' ' + label)); if (why) l.dataset.explain = why; return [l, b]; };
    // text size: the panels and the log grow (CSS zoom: touchui.css)
    const sizes = [['100', 'Normal'], ['125', 'Large'], ['150', 'Larger'], ['200', 'Largest']], cur = ls.get('text', '100');
    const chips = el('div', 'chips'); for (const [v, n] of sizes){ const b = el('button', v === cur ? 'on' : '', n); b.type = 'button';
      b.addEventListener('click', () => { ls.set('text', v); for (const x of chips.children) x.classList.toggle('on', x === b); for (const [s] of sizes) root.classList.toggle('nt-text-' + s, s === v && s !== '100'); }); chips.append(b); }
    const [clean] = tog('Clean signal', 'clean', '0', on => root.classList.toggle('nt-clean', on), 'Turns off the decoration: glitch curtains, flicker and scanlines. Everything still reads the same.');
    const [calm] = tog('Reduce motion', 'calm', '0', on => root.classList.toggle('nt-calm', on), 'Interface animations and transitions stop. The city itself keeps moving.');
    const [hap] = tog('Vibrate on build and remove', 'haptics', '1', () => {}, 'A short tick when something is built and a longer one when it is removed (Android).');
    if (!navigator.vibrate) hap.hidden = true;
    const [tips] = tog('Tips', 'tips', '1', on => { if (typeof TUT !== 'undefined') TUT.tips(on); }, 'Short notes the first time something new turns up.');
    const replay = el('button', 'wide', 'Replay the tutorial'); replay.type = 'button'; replay.addEventListener('click', () => { if (typeof TUT !== 'undefined'){ $('deckToggle').click(); TUT.replay(); } });
    const [erase, eb] = tog('Erase mode', 'eraseOff', '0', on => { if (typeof setDelMode === 'function') setDelMode(on); }, 'Drag to select a block of plots, tap inside it to clear everything there. Two fingers move the view while it is on.');
    eraseBox = eb; eb.checked = !!delMode; ls.set('eraseOff', '0');
    const kids = [grp('Text size', chips), grp('Display', el('div', 'togs'), ), grp('Help', el('div', 'togs'), replay), grp('Building', el('div', 'togs'))];
    kids[1].querySelector('.togs').append(clean, calm); kids[2].querySelector('.togs').append(tips); kids[3].querySelector('.togs').append(erase, hap);
    pane.append(...kids);
    // Performance: phone mode (touch.js) on its own for weaker phones, or always, or never
    if (self.PHONE){
      const st = el('p', 'note'), say = () => { st.textContent = PHONE.on ? 'Phone mode is on' + (PHONE.why ? ' (' + PHONE.why + ')' : '') + ': a steady 30 frames a second and lighter effects.' : 'Phone mode is off: the full picture, as fast as this device draws it.'; };
      const pc = el('div', 'chips'), cur = PHONE.pref;
      for (const [v, n] of [['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']]){ const b = el('button', v === cur ? 'on' : '', n); b.type = 'button';
        b.addEventListener('click', () => { ls.set('perf', v); for (const x of pc.children) x.classList.toggle('on', x === b); if (v === 'on') PHONE.start(); if (v === 'off') ls.set('weak', '0');
          st.textContent = 'Changes fully the next time the game opens.'; }); pc.append(b); }
      say(); pane.append(grp('Performance', pc, st, el('p', 'note', 'Auto turns phone mode on for weaker phones and tablets, or when the game runs slow here.')));
    }
    // full screen: Android can ask for it; an iPhone can't from a page, but a home screen icon opens the game full screen
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios && document.documentElement.requestFullscreen){ const fs = el('button', 'wide', 'Full screen'); fs.type = 'button';
      fs.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
      pane.append(grp('Screen', fs)); }
    else if (ios && !navigator.standalone) pane.append(grp('Screen', el('p', 'note', 'To play full screen on an iPhone or iPad: Share, then Add to Home Screen, and open the game from its icon.')));
    // an "i" beside every row of Settings that explains itself, instead of a hover tooltip
    for (const lab of $('deck').querySelectorAll('label[title], label[data-explain], .pu-presets button[title]')){
      const text = lab.dataset.explain || lab.getAttribute('title'); if (!text || lab.querySelector('.pu-i')) continue;
      const i = el('button', 'pu-i', 'i'); i.type = 'button'; i.setAttribute('aria-label', 'About this');
      const why = el('small', 'pu-why', text); why.hidden = true;
      i.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); why.hidden = !why.hidden; });
      lab.append(i); lab.after(why);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iface); else iface();

  /* ---------- Auto: timing a stretch of play ---------- */
  // Once in a city (past the title, loaded, nothing over it, the page in view): about four seconds of frames. If the middle frame takes over 25 ms
  // (under about 40 a second) this device is noted as a weaker one and phone mode starts now (touch.js PHONE.start). Checked again a minute later,
  // in case the city has grown, until it's on.
  if (self.PHONE && PHONE.pref === 'auto' && !PHONE.on && !/[?&]phone=/.test(location.search)){
    let samples = [], last = 0, restUntil = 0;
    const calm = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on) && !document.hidden && !root.classList.contains('gp-open') &&
      !(typeof OVERSEER !== 'undefined' && OVERSEER.hold) && !(typeof PRECINCT !== 'undefined' && PRECINCT.hold) && !(typeof FURN !== 'undefined' && FURN.hold);
    (function tick(now){
      if (PHONE.on) return; requestAnimationFrame(tick);
      if (now < restUntil || !calm()){ last = 0; return; }
      if (last){ const d = now - last; if (d < 250) samples.push(d); } last = now;
      if (samples.length < 240) return;
      const s = samples.sort((a, b) => a - b), med = s[s.length >> 1]; samples = [];
      if (med > 25){ ls.set('weak', '1'); PHONE.why = 'timed ' + Math.round(1000/med) + ' frames a second'; PHONE.start(); }
      else restUntil = now + 60000;
    })(performance.now());
  }

  /* ---------- the title screen can't be zoomed (Safari pinches through touch-action, so its gesture is stopped too) ---------- */
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if (typeof TITLE !== 'undefined' && TITLE.on) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && typeof TITLE !== 'undefined' && TITLE.on) e.preventDefault(); }, { passive: false });

  /* ---------- Cities: Export makes a share sheet on an iPhone ---------- */
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) new MutationObserver(() => { for (const b of document.querySelectorAll('button[data-do="export"]')) if (b.textContent === 'Export') b.textContent = 'Export (share)'; })
    .observe(document.body, { childList: true, subtree: true });

  /* ---------- #dev: three fingers toggle the performance overlay ---------- */
  if (location.hash.includes('dev')) addEventListener('touchstart', e => { if (e.touches.length === 3 && typeof PH !== 'undefined') PH.toggle(); }, { passive: true });
  /* ---------- text that doesn't fit scrolls (owner, Oct 30) ---------- */
  // Any one-line text the interface cuts short (it ends in "…": text-overflow ellipsis, or a no-wrap line with its overflow hidden) slides
  // slowly along to show the rest, pauses, and slides back. The music player's title is the main one. The words go in an inner span that is
  // moved with transform only: the box keeps its width and the page never re-lays itself out for it (owner, Oct 30: the first version moved
  // text-indent, which changed the box's width as it went). Found in small idle slices, again when new elements arrive; checked every 2 s
  (() => {
    const cand = new Set(); let scanT = 0, lastScan = 0;
    const cut = e => { const cs = getComputedStyle(e); return (cs.textOverflow === 'ellipsis' || (cs.whiteSpace === 'nowrap' && cs.overflowX === 'hidden')) && cs.display !== 'inline'; };
    const idle = f => (self.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(() => f({ timeRemaining: () => 8 }), 200));
    function scan(){ scanT = 0; lastScan = performance.now();
      const all = [...document.body.querySelectorAll('*')]; let k = 0;
      const step = dl => { const k0 = k; while (k < all.length && (k - k0 < 60 || dl.timeRemaining() > 2)){ const e = all[k++];   // (60 at least: a busy page may never be idle)

          if (e.classList.contains('tmq-in') || e.closest('canvas,svg,script,style,iframe,.title')) continue;
          let txt = false; for (const n of e.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()){ txt = true; break; }
          if (txt && cut(e)) cand.add(e); }
        if (k < all.length) idle(step); };
      idle(step); }
    new MutationObserver(ms => { if (scanT) return; if (!ms.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && !n.classList.contains('tmq-in')))) return;
      scanT = setTimeout(scan, Math.max(1500, 6000 - (performance.now() - lastScan))); }).observe(document.body, { childList: true, subtree: true });
    setTimeout(scan, 4000);
    const inner = e => e.firstChild && e.firstChild === e.lastChild && e.firstChild.nodeType === 1 && e.firstChild.classList.contains('tmq-in') ? e.firstChild : null;
    function wrap(e){ const sp = document.createElement('span'); sp.className = 'tmq-in'; while (e.firstChild) sp.appendChild(e.firstChild); e.appendChild(sp); return sp; }
    function unwrap(e){ const sp = inner(e); if (sp){ while (sp.firstChild) e.insertBefore(sp.firstChild, sp); sp.remove(); } e.classList.remove('tmq'); }
    setInterval(() => {
      if (document.hidden) return;
      for (const e of cand){
        if (!e.isConnected){ cand.delete(e); continue; }
        let sp = inner(e); if (!sp && e.classList.contains('tmq')) e.classList.remove('tmq');   // (the game rewrote its words: measured again)
        if (!e.offsetWidth){ continue; }
        const cs = getComputedStyle(e), room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        let w; if (sp) w = sp.offsetWidth; else { const rg = document.createRange(); rg.selectNodeContents(e); w = rg.getBoundingClientRect().width*(e.offsetWidth/(e.getBoundingClientRect().width || 1)); }
        const over = w - room;
        if (over > 2){ if (!sp) sp = wrap(e); const px = Math.round(over + 6);
          if (e.style.getPropertyValue('--mq') !== -px + 'px'){ e.style.setProperty('--mq', -px + 'px'); e.style.setProperty('--mqt', Math.max(6, 4 + px/22).toFixed(1) + 's'); }
          e.classList.add('tmq'); }
        else if (sp || e.classList.contains('tmq')) unwrap(e);
      }
    }, 2000);
  })();

  return U;
})();
