// Neon Terrarium: the sky city on a touch screen. Loaded in the head, so the page knows before it's drawn.
// A device whose main pointer is a finger (no hover, coarse) gets html.touch, and with it a layout of its own
// (css/style.css, the html.touch rules): smaller zone buttons, no turn buttons (two fingers twist the view instead),
// the Buildings and Transport menus down in the dock by the zones, opening upward, and "Controls" as a button that
// opens the touch controls in a box with a close button, instead of a panel shown on hover. The hints say tap and
// press and hold instead of click and right-click, and leave out the keyboard keys. A mouse and keyboard see none of it.
// (The gestures themselves, drag to move, pinch to zoom, twist to turn, are in input.js, for any finger.)
'use strict';
const TOUCH = (() => {
  const T = {};
  const mq = matchMedia('(hover: none) and (pointer: coarse)');
  T.on = mq.matches;
  const mark = () => document.documentElement.classList.toggle('touch', T.on);
  mark();
  // the words: tap, not click; no keys
  const words = s => s
    .replace(/\bright-click(ing)?\b/gi, m => m[0] === 'R' ? 'Press and hold' : 'press and hold')
    .replace(/\bclick(ing|s)?\b/gi, (m, e) => (m[0] === 'C' ? 'Tap' : 'tap') + (e === 'ing' ? 'ping' : e || ''))
    .replace(/ · R turns it/g, '').replace(/ or Esc\b/g, '').replace(/ · drag to paint/g, '')
    .replace(/X to go back to building/g, 'tap ✕ to go back to building');
  T.words = words;
  function setup(){
    const $ = id => document.getElementById(id);
    // the hint line under the city: rewritten whenever the game changes it
    const hint = $('modeHint');
    if (hint) new MutationObserver(() => { if (!T.on) return; const w = words(hint.textContent); if (w !== hint.textContent) hint.textContent = w; }).observe(hint, { childList: true, characterData: true, subtree: true });
    // the highway and metro instructions: tap for click, and the rows that are keyboard keys hidden
    for (const id of ['hwHelp', 'mtHelp']){ const box = $(id); if (!box) continue;
      for (const dt of box.querySelectorAll('dt')){
        if (dt.querySelector('kbd')){ dt.classList.add('kbonly'); if (dt.nextElementSibling) dt.nextElementSibling.classList.add('kbonly'); continue; }
        dt.dataset.mouse = dt.textContent; dt.dataset.touch = words(dt.textContent); } }
    const relabel = () => {
      for (const dt of document.querySelectorAll('.hwhelp dt[data-mouse]')) dt.textContent = T.on ? dt.dataset.touch : dt.dataset.mouse;
      const c = document.querySelector('.ctlhover'); if (c) c.textContent = T.on ? 'Controls ?' : 'Hover for controls';
      if (hint && T.on){ const w = words(hint.textContent); if (w !== hint.textContent) hint.textContent = w; }
    };
    // the dock: the menus come down beside the zones (moved back where they were if the device changes its mind)
    const bar = document.querySelector('.zonebar'), zones = bar && bar.querySelector('.zones'), bm = $('bmenu'), ctl = document.querySelector('.ctlwrap');
    const home = bm && { parent: bm.parentNode, next: bm.nextSibling }, ctlHome = ctl && { parent: ctl.parentNode, next: ctl.nextSibling };
    let row = null;
    const dock = () => {
      if (!bar || !zones || !bm) return;
      if (T.on){ if (!row){ row = document.createElement('div'); row.className = 'trow'; } bar.insertBefore(row, zones); row.appendChild(bm); if (ctl) row.appendChild(ctl); }
      else if (row){ home.parent.insertBefore(bm, home.next); if (ctl) ctlHome.parent.insertBefore(ctl, ctlHome.next); row.remove(); }
    };
    // Controls: a tap opens the box, the ✕ (or a tap on the city) closes it
    const open = (b) => { if (ctl) ctl.classList.toggle('open', b); };
    if (ctl){ ctl.querySelector('.ctlhover').addEventListener('click', () => { if (T.on) open(!ctl.classList.contains('open')); });
      const x = ctl.querySelector('.ctlclose'); if (x) x.addEventListener('click', (e) => { e.stopPropagation(); open(false); }); }
    // one menu open at a time; choosing something from it, or touching the city, folds it away so the city shows
    const shut = (keep) => { if (!T.on) return; if (keep !== 'b' && typeof setBmenuOpen === 'function' && !$('bmenuList').hidden) setBmenuOpen(false); if (keep !== 't' && typeof setTmenuOpen === 'function' && !$('tmenuList').hidden) setTmenuOpen(false); };
    if ($('bmenuHead')) $('bmenuHead').addEventListener('click', () => { shut('b'); open(false); });
    if ($('tmenuHead')) $('tmenuHead').addEventListener('click', () => { shut('t'); open(false); });
    for (const id of ['bmenuList', 'tmenuList']) if ($(id)) $(id).addEventListener('click', e => { const b = e.target.closest('.bitem'); if (b && !b.disabled) setTimeout(() => shut(), 0); });
    const view = $('view'); if (view) view.addEventListener('pointerdown', () => { shut(); open(false); });
    const apply = () => { mark(); relabel(); dock(); };
    T.apply = apply;
    apply();
    mq.addEventListener && mq.addEventListener('change', () => { T.on = mq.matches; apply(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
  return T;
})();
