// Neon Terrarium: the sky city on a touch screen (phones and tablets). Loaded in the head, so the page knows before it's drawn.
// A device whose main pointer is a finger gets html.touch, and with it a layout of its own (css/style.css, the html.touch rules).
// Upright (html.tport) or sideways (html.tland) changes the dock too. A mouse and keyboard see none of it: the desktop page is untouched.
//  - the dock at the bottom: one row of small buttons (Buildings, Transport, City settings, ?), and under it the zones.
//    Upright, only one zone shows at a time: swipe it (or tap the arrows) to go to the next. Sideways, all four, compact.
//  - no turn buttons (two fingers twist the view instead)
//  - the hint line shows when it changes, then fades, and sits over the city instead of taking a row of its own
//  - the time and the day in one small chip, top left; the music player as a small pill under it (tap its name to open it)
//  - Settings as a small gear, top right
// The hints say tap and press and hold instead of click and right-click, and leave out the keyboard keys.
// (The gestures themselves, drag to move, pinch to zoom, twist to turn, double tap for one floor, double tap and drag for a height,
//  are in input.js, for any finger.)
'use strict';
const TOUCH = (() => {
  const T = {};
  // (pointer: coarse) on its own: some Android phones say they can hover, which used to leave them with the desktop layout.
  // A laptop with a touch screen still has a trackpad or mouse as its main pointer, so it keeps the desktop layout.
  const mq = matchMedia('(pointer: coarse)'), mqPort = matchMedia('(orientation: portrait)');
  T.on = mq.matches;
  const mark = () => { const h = document.documentElement; h.classList.toggle('touch', T.on); h.classList.toggle('tport', T.on && mqPort.matches); h.classList.toggle('tland', T.on && !mqPort.matches); };
  mark();
  // the words: tap, not click; no keys
  const words = s => s
    .replace(/\bright-click(ing)?\b/gi, m => m[0] === 'R' ? 'Press and hold' : 'press and hold')
    .replace(/\bclick(ing|s)?\b/gi, (m, e) => (m[0] === 'C' ? 'Tap' : 'tap') + (e === 'ing' ? 'ping' : e || ''))
    .replace(/ · R turns it/g, '').replace(/ or Esc\b/g, '').replace(/ · drag to paint/g, '')
    .replace(/ · Space adds one floor/g, ' · double tap adds one floor').replace(/ · tap Shift to pick a height/g, ' · double tap and drag up for a height')
    .replace(/X to go back to building/g, 'tap ✕ to go back to building');
  T.words = words;
  function setup(){
    const $ = id => document.getElementById(id);
    const root = document.documentElement;

    // the hint line: rewritten whenever the game changes it, shown for a moment, then faded out so it doesn't sit over the city
    const hint = $('modeHint');
    let fadeT = 0;
    const flash = () => { if (!hint) return; hint.classList.remove('tfade'); clearTimeout(fadeT); if (T.on) fadeT = setTimeout(() => hint.classList.add('tfade'), 3500); };
    if (hint) new MutationObserver(() => { if (!T.on) return; const w = words(hint.textContent); if (w !== hint.textContent){ hint.textContent = w; return; } flash(); }).observe(hint, { childList: true, characterData: true, subtree: true });

    // the highway and metro instructions: tap for click, and the rows that are keyboard keys hidden
    for (const id of ['hwHelp', 'mtHelp']){ const box = $(id); if (!box) continue;
      for (const dt of box.querySelectorAll('dt')){
        if (dt.querySelector('kbd')){ dt.classList.add('kbonly'); if (dt.nextElementSibling) dt.nextElementSibling.classList.add('kbonly'); continue; }
        dt.dataset.mouse = dt.textContent; dt.dataset.touch = words(dt.textContent); } }
    const relabel = () => {
      for (const dt of document.querySelectorAll('.hwhelp dt[data-mouse]')) dt.textContent = T.on ? dt.dataset.touch : dt.dataset.mouse;
      const c = document.querySelector('.ctlhover');
      if (c){ c.textContent = T.on ? '?' : 'Hover for controls'; if (T.on){ c.setAttribute('role', 'button'); c.setAttribute('aria-label', 'Controls'); } else { c.removeAttribute('role'); c.removeAttribute('aria-label'); } }
      if (hint && T.on){ const w = words(hint.textContent); if (w !== hint.textContent) hint.textContent = w; }
      const cb = $('puCityBtn'); if (cb) cb.textContent = T.on ? 'City' : 'City settings';   // (shorter labels in the dock)
      const fb = $('furnBtn'); if (fb) fb.textContent = T.on ? 'Furnish' : 'Furnish pod';
      if (T.on) flash(); else if (hint){ clearTimeout(fadeT); hint.classList.remove('tfade'); }
    };

    // the dock: the menus (and City settings, on the player's page) come down beside the zones, in one row
    // (moved back where they were if the device changes its mind)
    const bar = document.querySelector('.zonebar'), zones = bar && bar.querySelector('.zones'), bm = $('bmenu'), ctl = document.querySelector('.ctlwrap');
    const unit = ctl && ctl.parentNode && ctl.parentNode.classList.contains('pu-ctlrow') ? ctl.parentNode : ctl;   // (playerui.js puts City settings beside it)
    const home = bm && { parent: bm.parentNode, next: bm.nextSibling }, ctlHome = unit && { parent: unit.parentNode, next: unit.nextSibling };
    let row = null;
    const dock = () => {
      if (!bar || !zones || !bm) return;
      if (T.on){ if (!row){ row = document.createElement('div'); row.className = 'trow'; } bar.insertBefore(row, zones); row.appendChild(bm); if (unit) row.appendChild(unit); }
      else if (row){ home.parent.insertBefore(bm, home.next); if (unit) ctlHome.parent.insertBefore(unit, ctlHome.next); row.remove(); }
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

    // the zones, upright: one at a time. Swipe it sideways (or tap an arrow) for the next one; that zone is picked.
    // A tap on the zone itself works as before (picks it, or lets it go). The arrows take the colour of the zone they lead to.
    let items = [], cur = 0, prev = null, next = null;
    // (items are the zone buttons; perimeter.js wraps each in a column with its Perimeter button after this runs, so the box is looked up each time)
    const zoneOf = it => it, box = z => z.closest('.zcol') || z;
    const show = () => { items.forEach((it, k) => { it.classList.remove('tcur'); box(it).classList.toggle('tcur', k === cur); });
      if (prev && next && items.length){ const z = k => zoneOf(items[(k + items.length) % items.length]).style.getPropertyValue('--z');
        prev.style.setProperty('--z', z(cur - 1)); next.style.setProperty('--z', z(cur + 1)); } };
    const step = n => { if (!items.length) return; cur = (cur + n + items.length) % items.length; show();
      const z = zoneOf(items[cur]); if (z && !z.classList.contains('on')) z.click(); };
    T.zoneStep = step;
    if (zones){
      items = [...zones.querySelectorAll('.zone[data-zone]')];
      if (items.length){
        prev = document.createElement('button'); prev.className = 'zarr zprev'; prev.setAttribute('aria-label', 'Previous zone'); prev.textContent = '‹';
        next = document.createElement('button'); next.className = 'zarr znext'; next.setAttribute('aria-label', 'Next zone'); next.textContent = '›';
        items[0].before(prev); items[items.length - 1].after(next);
        prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
        // follow the zone that's picked, however it was picked
        const sync = () => { const k = items.findIndex(it => { const z = zoneOf(it); return z && z.classList.contains('on'); }); if (k >= 0 && k !== cur){ cur = k; show(); } };
        for (const it of items){ const z = zoneOf(it); if (z) new MutationObserver(sync).observe(z, { attributes: true, attributeFilter: ['class'] }); }
        // the swipe: a sideways flick on the zone card
        let sw = null, eat = false;
        zones.addEventListener('pointerdown', e => { if (!T.on || !root.classList.contains('tport') || e.pointerType === 'mouse') return; if (!e.target.closest('.zone,.zcol')) return; sw = { x: e.clientX, y: e.clientY }; });
        zones.addEventListener('pointerup', e => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
          if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)*1.3){ step(dx < 0 ? 1 : -1); eat = true; setTimeout(() => { eat = false; }, 350); } });
        zones.addEventListener('pointercancel', () => { sw = null; });
        zones.addEventListener('click', e => { if (eat && e.target.closest('.zone,.perim')){ e.stopPropagation(); e.preventDefault(); eat = false; } }, true);   // (the swipe's own tap doesn't toggle the zone)
        show(); setTimeout(show, 0);
      }
    }

    // the time and the day, together in one chip, top left (the day leaves the speed bar, which is then empty on the player's page)
    const ro = $('readout'), day = $('ffDay');
    let chip = null;
    const chipText = () => { if (!chip || !ro) return; const p = ro.textContent.split(' · '), t = p[0] || '', rain = p.includes('Rain');
      const d = day ? day.textContent : ''; const s = (d ? d + ' · ' : '') + t + (rain ? ' · Rain' : ''); if (chip.textContent !== s) chip.textContent = s; };
    if (ro){ chip = document.createElement('div'); chip.className = 'tstatus'; chip.id = 'tStatus'; chip.setAttribute('aria-hidden', 'true'); document.body.appendChild(chip);
      const mo = new MutationObserver(chipText); mo.observe(ro, { childList: true, characterData: true, subtree: true }); if (day) mo.observe(day, { childList: true, characterData: true, subtree: true });
      chipText(); }

    // the music player: a small pill (the pattern's name and hold/play); a tap on the name opens the whole player, another folds it
    const gd = $('gridDeck');
    if (gd){ gd.classList.add('tmin');
      gd.addEventListener('click', e => { if (!T.on) return; if (e.target.closest('button')) return; if (e.target.closest('.gd-main,.gd-head')) gd.classList.toggle('tmin'); }); }

    const apply = () => { mark(); relabel(); dock(); show(); chipText(); };
    T.apply = apply;
    apply();
    const onChange = () => { T.on = mq.matches; apply(); };
    if (mq.addEventListener){ mq.addEventListener('change', onChange); mqPort.addEventListener('change', () => { mark(); show(); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
  return T;
})();
