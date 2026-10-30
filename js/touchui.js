// Neon Terrarium: the touch screen's own pieces (claude/mobile-ui-plan.md). Nothing here runs with a mouse and keyboard: the desktop page is untouched.
//  - the hold ring under a finger about to remove something, and the Restore chip that puts the last removal back (input.js asks for both)
//  - a megastructure's card (a tap on it with no zone picked, or on its holo-tag): its name, a line in the log's voice, ACCESS for the ones with a
//    screen of their own (the Acoustic Panel, the Data Spire, the Precinct desk) and TURN
//  - holo-tags over the megastructures that have a screen, so they can be found and opened without a double click
//  - a TURN chip while a megastructure is being placed, a recenter button once the view has wandered off the city, an exit chip for erase mode
//  - the Interface tab of Settings (playerui.js makes the tab): text size, Clean signal, reduce motion, haptics, tips, the tutorial, erase mode, full screen
//  - press and hold anything that explains itself in a hover tooltip (a title) and the explanation shows on a plate; Settings' rows get an "i" too
//  - small vibrations on a build and a removal (Android; a setting)
'use strict';
const TUI = (() => {
  const U = { buzz(){}, ring(){}, snapCell(){ return null; }, offerRestore(){}, peek(){}, eraseChip(){} };
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
  U.offerRestore = snap => { chipSnap = snap; chip.hidden = false; clearTimeout(chipT); chipT = setTimeout(() => { chip.hidden = true; chipSnap = null; }, 5000); };
  chip.addEventListener('click', () => { const s = chipSnap; chip.hidden = true; chipSnap = null; clearTimeout(chipT); if (s && restore(s)){ U.buzz(12); dispatchEvent(new CustomEvent('nt:restore')); } });
  function restore(s){
    try {
      let c = cells.get(ckey(s.i, s.j));
      if (!c){ c = addPlatform(s.i, s.j, null); if (!c) return false; }
      stageFinishNear([c]); finishAnimsOn(c); holdRegion(c);
      const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
      c.sections = clone(s.sections) || []; c.lift = clone(s.lift) || null; c.below = clone(s.below) || null; if (s.green) c.green = s.green; if (s.style) c.style = s.style;
      const near = SIDES4.map(([a, b]) => cells.get(ckey(c.i + a, c.j + b))).filter(n => n && n.lift && !n.mega);
      refresh([c, ...near]); dropView(old);
      const top = c.sections.length ? c.sections[c.sections.length - 1].zone : null;
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
  // the tags: one per megastructure with a screen, over its middle, moved each frame with transform only
  const tags = new Map(), _v = new THREE.Vector3();
  function syncTags(){
    for (const [id, t] of tags) if (!megas.has(id)){ t.el.remove(); tags.delete(id); }
    for (const m of megas.values()){ if (!SCREEN[m.kind] || tags.has(m.id)) continue;
      const b = el('button', 'tholo'); b.type = 'button'; b.innerHTML = '<i></i><span>' + SCREEN[m.kind][0] + '</span>'; b.addEventListener('click', () => U.peek(m));
      document.body.appendChild(b); tags.set(m.id, { el: b, m }); }
  }
  let tagRect = null; addEventListener('resize', () => { tagRect = null; });
  function placeTags(){
    if (!tags.size) return;
    const busy = root.classList.contains('gp-open') || (typeof OVERSEER !== 'undefined' && OVERSEER.hold) || (typeof PRECINCT !== 'undefined' && PRECINCT.hold) || (typeof FURN !== 'undefined' && FURN.hold) || (typeof TITLE !== 'undefined' && TITLE.on);
    const r = tagRect || (tagRect = $('view').getBoundingClientRect());
    for (const t of tags.values()){
      const m = t.m; let top = m.top || 6; _v.set((m.i + (m.w - 1)/2)*LOT, top + 1.5, (m.j + (m.h - 1)/2)*LOT).project(cam);
      const on = !busy && _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      if (t.on !== on){ t.on = on; t.el.style.visibility = on ? '' : 'hidden'; }
      if (on){ const x = Math.round(r.left + (_v.x*.5 + .5)*r.width), y = Math.round(r.top + (1 - (_v.y*.5 + .5))*r.height);
        if (x !== t.x || y !== t.y){ t.x = x; t.y = y; t.el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-100%)'; } }
    }
  }

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
    try { placeTags(); turnChip.hidden = !megaPick; } catch (e) {}
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

  /* ---------- Cities: Export makes a share sheet on an iPhone ---------- */
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) new MutationObserver(() => { for (const b of document.querySelectorAll('button[data-do="export"]')) if (b.textContent === 'Export') b.textContent = 'Export (share)'; })
    .observe(document.body, { childList: true, subtree: true });

  /* ---------- #dev: three fingers toggle the performance overlay ---------- */
  if (location.hash.includes('dev')) addEventListener('touchstart', e => { if (e.touches.length === 3 && typeof PH !== 'undefined') PH.toggle(); }, { passive: true });
  return U;
})();
