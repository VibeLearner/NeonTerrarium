// Neon Terrarium: furnish.html on a touch screen. Injected by tools/furnish/build.py after bridge.js; the layout is furnish/touch.css.
// A device whose main pointer is a finger gets html.ftouch (html.ftland too when held sideways with little height), and with it:
//  - the room on top and a tray under it: the lab's catalog rail as icon tabs and its flyout as a strip of 64 px tiles that scrolls
//    sideways (the lab's own buttons and tiles, restyled), plus two tabs of ours: Stored (pieces put away this visit) and Home (who
//    lives here, the home's readout, the lab's Settings, the touch controls)
//  - placing: a tile puts its ghost in the middle of the room; drag anywhere to aim it (it moves with the finger, never under it)
//    and tap Place on the bar over it. Cyan with a solid outline fits; magenta with a dashed one is blocked, and the line over the
//    tray says why
//  - a bar over the selected piece: turn, copy (duplicate), tint, store, delete. Press and hold a floor or a wall to tint it
//  - Tint opens a narrow panel beside the piece (the view slides the piece clear of it), so its colors change in sight while picking
//  - the top row: Exit to city at the left, Save at the right and Tools in the middle, which opens the lab's home controls (undo,
//    walls, view, day or night, the work light) in a row under it, growing out from the middle
//  - two fingers: pinch to zoom, drag to pan. One finger orbits, selects and moves as in the lab
//  - a long press on any button says what it does
//  - while the apartment comes in (the hologram), a touch does nothing: it never cuts the hologram short (the hold in build.py)
// It drives the lab through PodBuilder (its public calls) and PodBuilder.touch (the hooks build.py adds to the lab's builder.js).
// A mouse and keyboard see none of it: nothing below runs unless the main pointer is coarse.
'use strict';
(() => {
  if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
  const root = document.documentElement, $ = id => document.getElementById(id);
  const PB = () => window.PodBuilder, TA = () => window.PodBuilder && window.PodBuilder.touch;
  const land = matchMedia('(orientation: landscape) and (max-height: 520px)');
  const mark = () => root.classList.toggle('ftland', land.matches);
  if (land.addEventListener) land.addEventListener('change', mark); else if (land.addListener) land.addListener(mark);
  // the player's Reduce motion and Clean signal are set on the game's page (its Settings): mirrored here for touch.css
  try {
    const ph = window.parent !== window && window.parent.document.documentElement;
    if (ph){ const sync = () => { for (const c of ['nt-calm', 'nt-clean']) root.classList.toggle(c, ph.classList.contains(c)); }; sync();
      new MutationObserver(sync).observe(ph, { attributes: true, attributeFilter: ['class'] }); }
  } catch (e) {}

  // ready once the builder (with its touch hooks), its rail and the game's Exit bar (bridge.js) are all there
  let tries = 0;
  function boot(){
    const ok = document.body && TA() && $('bStage') && $('bRail') && $('bRail').children.length && document.querySelector('.nt-bar');
    if (ok) return setup();
    if (++tries > 600){ if (document.body && window.PodBuilder && !TA()) console.warn('furnish touch: this furnish.html has no PodBuilder.touch (rebuild it with tools/furnish/build.py); the lab layout stays'); return; }
    setTimeout(boot, 100);
  }
  boot();

  function setup(){
    const T = TA(), st = $('bStage'), cv = $('bCanvas'), rail = $('bRail'), fly = $('bFly'), insp = $('bInsp');
    root.classList.add('ftouch'); mark();
    // blocked in magenta (the lab's red-pink sits too near its pink selection); valid stays the lab's cyan
    try { T.bad().set('#ff3df2'); } catch (e) {}
    const toast = m => { try { window.__podlab.toast(m); } catch (e) {} };
    // the lab's toasts in touch words: tap, not click, and no keys
    try { const L = window.__podlab, o = L.toast; L.toast = m => o(String(m).replace(/ Hold Alt to force it\./, '').replace(/\s*Shift-click [^.]*\./g, '')
      .replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap').replace(/^Point at/, 'Tap').replace(/ \(Alt\)/, '')); } catch (e) {}
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ICO = { store: 'M4 9h16v11H4zM3 4h18v5H3zM10 13h4', home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z', turn: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
      dup: 'M8 8h12v12H8zM4 16V4h12', tint: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z', del: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', ok: 'M5 12l5 5L19 7', x: 'M6 6l12 12M18 6L6 18',
      tools: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4', more: 'M7 10l5 5 5-5' };
    const ico = k => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICO[k] + '"/></svg>';

    /* ---------- the tray ---------- */
    // the lab's group buttons lose their visible word on touch, so they are named for screen readers and the long press
    for (const b of rail.querySelectorAll('[data-grp]')){ const n = (b.getAttribute('title') || '').replace(/ \(\d\)$/, ''); b.setAttribute('aria-label', n); b.title = n; }
    const tab = (k, label, col) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'rb'; b.dataset.ft = k; b.style.setProperty('--m', col);
      b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', label); b.title = label; b.innerHTML = ico(k) + '<span>' + label + '</span><i class="ftn"></i>'; rail.appendChild(b); return b; };
    const tStore = tab('store', 'Stored: pieces put away this visit', '#FFB347'), tHome = tab('home', 'Home: residents, settings and controls', '#5ae8ff');
    const empty = document.createElement('div'); empty.id = 'ftEmpty'; empty.textContent = 'Pick a tab below: furniture, lights, decor, plants, or floors and walls'; fly.after(empty);
    rail.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ft) sheetOpen(sheetK === b.dataset.ft ? null : b.dataset.ft); else { sheetOpen(null); inspOpen(false); } });
    // (the room is framed in the space over the tray: the stage changed size when ftouch went on, and the lab's ResizeObserver refits it)

    /* ---------- the top row: Exit at the left, Save at the right, Tools in the middle ---------- */
    // Tools opens the lab's home controls (its toolbar, .bbar) in a row under the top row, growing out from the middle. A second tap
    // closes it, and so does a pick that is done in one go (walls, day or night, the work light), a tap on the room, a panel opening
    // or the hologram. Undo, redo and turning the view leave it open, since they are often tapped a few times in a row.
    const ntBar = document.querySelector('.nt-bar'), bbar = document.querySelector('.bbar');
    const tools = document.createElement('button'); tools.type = 'button'; tools.className = 'nt-tools'; tools.id = 'ftTools';
    const TOOLS_T = 'Tools: undo and redo, the walls, turning the view, day or night, the work light';
    tools.title = TOOLS_T; tools.setAttribute('aria-label', TOOLS_T); tools.setAttribute('aria-expanded', 'false');
    tools.innerHTML = ico('tools') + '<span>Tools</span>' + ico('more');
    if (bbar){ if (!bbar.id) bbar.id = 'ftBbar'; tools.setAttribute('aria-controls', bbar.id); }
    const sv = $('ntSave'); if (sv && sv.parentNode === ntBar) ntBar.insertBefore(tools, sv); else ntBar.appendChild(tools);
    let toolsOn = false;
    function toolsOpen(on){
      on = !!on && !!bbar; if (on === toolsOn) return; toolsOn = on;
      if (on){   // (it grows out from under the Tools button, which sits a little off the middle when Exit is wider than Save)
        const tr = tools.getBoundingClientRect(), sr = st.getBoundingClientRect(), w = bbar.offsetWidth, x0 = bbar.offsetLeft - w/2;
        bbar.style.transformOrigin = Math.round(Math.max(0, Math.min(w, tr.left + tr.width/2 - sr.left - x0))) + 'px 50%';
      }
      st.classList.toggle('ft-tools', on); tools.setAttribute('aria-expanded', on); tools.classList.toggle('on', on);
      if (on){ sheetOpen(null); bbar.scrollLeft = 0; requestAnimationFrame(toolsFit); }
    }
    // the row scrolls sideways when it is wider than the screen: then (only) its right end fades to say there is more
    function toolsFit(){ if (bbar) bbar.classList.toggle('ftmore', bbar.scrollWidth > bbar.clientWidth + 2 && bbar.scrollLeft + bbar.clientWidth < bbar.scrollWidth - 2); }
    tools.addEventListener('click', () => toolsOpen(!toolsOn));
    if (bbar){
      bbar.addEventListener('scroll', toolsFit, { passive: true }); addEventListener('resize', () => { if (toolsOn) toolsFit(); });
      bbar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.closest('#bWalls') || b.closest('#bTime') || b.id === 'bWork') setTimeout(() => toolsOpen(false), 120); }, true);   // (a moment, so the pick shows first)
    }

    /* ---------- the sheets: Stored and Home ---------- */
    const sheet = document.createElement('section'); sheet.className = 'ftsheet'; sheet.hidden = true; sheet.setAttribute('aria-label', 'Panel');
    sheet.innerHTML = '<div class="fthd"><h2 id="ftSheetT"></h2><button type="button" class="ftx" aria-label="Close">&#x2715;</button></div><div id="ftStoreP"></div><div id="ftHomeP"></div>';
    st.appendChild(sheet);
    const homeP = $('ftHomeP'), storeP = $('ftStoreP');
    homeP.style.display = 'grid'; homeP.style.gap = '16px';
    {   // Home: the readout and the Residents card (moved here from the top left), the controls, Copy colors, and the lab's Settings
      const sec = document.createElement('section'); const rd = $('bStatus'), rs = $('bRes');
      if (rd) sec.appendChild(rd); if (rs) sec.appendChild(rs); homeP.appendChild(sec);
      const ctl = document.createElement('section'); ctl.className = 'ftctl';
      ctl.innerHTML = '<h2>Controls</h2><dl>' + [
        ['Tap a tab, then a tile', 'Its ghost shows in the room: drag to aim it, then tap Place'],
        ['Cyan, solid outline', 'It fits. Magenta and dashed: blocked, and the line over the tray says why'],
        ['Tap a piece', 'Select it. Drag it to move it (what stands on it comes along)'],
        ['The bar over a piece', 'Turn it 90 degrees, copy it, tint it, store it or delete it'],
        ['Press and hold a floor or wall', 'Select it to tint its finish'],
        ['Drag the room', 'Orbit'],
        ['Pinch · drag with two fingers', 'Zoom · pan'],
        ['Tools, top middle', 'Undo and redo, the walls, turning the view, day or night, the work light'],
        ['Press and hold a button', 'What it does'],
      ].map(([a, b]) => '<dt>' + esc(a) + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl><button type="button" class="wide" id="ftPick">Copy a piece\'s colors</button>';
      homeP.appendChild(ctl);
      const set = $('bSettings'); if (set){ homeP.appendChild(set); const n = set.querySelector('.note'); if (n) n.textContent = 'Drag the room to orbit, drag with two fingers to pan, pinch to zoom.'; }
      $('ftPick').addEventListener('click', () => { sheetOpen(null); try { PB().setTool('pick'); } catch (e) {} });
    }
    let sheetK = null;
    function sheetOpen(k){
      sheetK = k; sheet.hidden = !k;
      tStore.setAttribute('aria-pressed', k === 'store'); tHome.setAttribute('aria-pressed', k === 'home');
      if (!k) return;
      inspOpen(false); toolsOpen(false);
      $('ftSheetT').textContent = k === 'store' ? 'Stored this visit' : 'This home';
      storeP.hidden = k !== 'store'; homeP.hidden = k !== 'home'; homeP.style.display = k === 'home' ? 'grid' : 'none';
      if (k === 'store') renderStore();
      sheet.scrollTop = 0;
    }
    sheet.querySelector('.ftx').addEventListener('click', () => sheetOpen(null));

    // Stored: a piece put away leaves the room (Undo brings it back) and waits here, colors and light kept, until it is placed again.
    // The list lasts for this visit only: what is left in it when the player goes back to the city is gone, as if deleted.
    const stored = []; let fromStore = -1, homeRef = null;
    function renderStore(){
      const n = tStore.querySelector('.ftn'); n.textContent = stored.length ? stored.length : '';
      if (sheetK !== 'store') return;
      storeP.innerHTML = stored.length ? '<p class="ftnone">Placed again from here, a piece keeps its colors and light. Whatever is still here when you go back to the city is gone.</p>' +
        stored.map((s, i) => '<div class="ftrow"><span>' + esc(s.name) + '</span><button type="button" class="wide" data-i="' + i + '" style="width:auto">Place</button><button type="button" data-x="' + i + '" aria-label="Discard ' + esc(s.name) + '">&#x2715;</button></div>').join('')
        : '<p class="ftnone">Nothing stored. Select a piece and tap Store on its bar to put it away here for this visit.</p>';
      for (const b of storeP.querySelectorAll('[data-i]')) b.onclick = () => { const i = +b.dataset.i, s = stored[i]; if (!s) return; sheetOpen(null);
        try { T.startPlace({ id: s.arch + '#' + s.seed, arch: s.arch, seed: s.seed }, { colors: s.colors, light: s.light, ry: s.ry }); fromStore = i; } catch (e) { console.warn('furnish touch: place from Stored', e); } };
      for (const b of storeP.querySelectorAll('[data-x]')) b.onclick = () => { if (!b.dataset.sure){ b.dataset.sure = 1; b.textContent = 'Sure?'; return; } stored.splice(+b.dataset.x, 1); renderStore(); };
    }
    function store(){
      const s = T.state(); if (!s.sel || s.sel.t !== 'piece') return;
      const all = PB().pieces(), kids = id => all.filter(r => r.parent === id).flatMap(r => [r].concat(kids(r.id)));
      const top = all.find(r => r.id === s.sel.id); if (!top) return;
      const list = [top].concat(kids(top.id));
      for (const r of list){ const p = PB().piece(r.id); stored.push({ arch: r.arch, seed: r.seed, colors: r.colors || {}, light: r.light || null, ry: r.ry || 0, name: p && p.name || 'Piece' }); }
      T.del(); renderStore();
      toast((list.length > 1 ? list.length + ' pieces' : (PB().piece(top.id) || {}).name || 'It') + ' put away in Stored, for this visit');
    }

    /* ---------- the inspector, as a narrow panel beside the piece: only when Tint opens it ---------- */
    // It goes on the side of the room away from the piece (from under the top row to the bottom of the screen, over the tray), and the
    // view slides so the piece stands in the middle of the room that is left: each color shows on it as it is picked. Turning, copying
    // and deleting stay on the bar over the piece, so the panel leaves them out (touch.css) and is only colors, light and variants.
    let slide = 0;
    function inspOpen(on){
      const was = st.classList.contains('ft-insp');
      st.classList.toggle('ft-insp', !!on);
      if (!on){ cancelAnimationFrame(slide); return; }
      sheetOpen(null); toolsOpen(false);
      const a = T.anchor(), r = st.getBoundingClientRect();
      if (!was) st.classList.toggle('ft-pl', !!(a && a.x > r.left + r.width/2));   // (the panel at the left when the piece is right of the middle)
      const sw = insp.querySelector('#iSw .sw, #iFT');
      if (sw && sw.getAttribute('aria-expanded') !== 'true') sw.click();
      insp.scrollTop = 0;
      if (a) requestAnimationFrame(() => clearOf(a));
    }
    // slide the view (as a two-finger drag would) until the piece's anchor is in the middle of the room beside the panel, over a quarter second
    function clearOf(a){
      const r = st.getBoundingClientRect(), p = insp.getBoundingClientRect(); if (!p.width) return;
      const left = st.classList.contains('ft-pl'), x0 = left ? p.right : r.left, x1 = left ? r.right : p.left;
      const top = topFree(r), y0 = top + 40, y1 = r.bottom - 40;
      const dx = (x0 + x1)/2 - a.x, dy = a.y < y0 ? y0 - a.y : a.y > y1 ? y1 - a.y : 0;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      const N = 14; let i = 0, sx = 0, sy = 0;
      cancelAnimationFrame(slide);
      const step = () => { if (!st.classList.contains('ft-insp')) return; i++; const e = 1 - Math.pow(1 - i/N, 3), nx = dx*e, ny = dy*e;
        try { T.pan(nx - sx, ny - sy); } catch (er) {} sx = nx; sy = ny; if (i < N) slide = requestAnimationFrame(step); };
      slide = requestAnimationFrame(step);
    }

    /* ---------- the bar over the piece ---------- */
    const bar = document.createElement('div'); bar.className = 'ftbar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); st.appendChild(bar);
    const KINDS = {
      place: [['ok', 'Place', 'Place it here', 'go'], ['turn', 'Turn', 'Turn it 90 degrees'], ['x', 'Cancel', 'Stop placing']],
      wplace: [['ok', 'Place', 'Place it here', 'go'], ['x', 'Cancel', 'Stop placing']],
      piece: [['turn', 'Turn', 'Turn it 90 degrees'], ['dup', 'Copy', 'Duplicate it'], ['tint', 'Tint', 'Colors, light and more'], ['store', 'Store', 'Put it away in Stored for this visit'], ['del', 'Delete', 'Delete it (Undo brings it back)', 'danger']],
      wpiece: [['dup', 'Copy', 'Duplicate it'], ['tint', 'Tint', 'Colors, light, its height on the wall'], ['store', 'Store', 'Put it away in Stored for this visit'], ['del', 'Delete', 'Delete it (Undo brings it back)', 'danger']],
      fin: [['tint', 'Tint', 'Tint this finish'], ['x', 'Done', 'Deselect']],
      tool: [['x', 'Done', 'Stop and go back to selecting']],
    };
    const ICON_OF = { ok: 'ok', turn: 'turn', x: 'x', dup: 'dup', tint: 'tint', store: 'store', del: 'del' };
    let barK = '', barW = 0, barH = 0;
    function barKind(k){
      if (barK === k) return; barK = k; bar.hidden = !k; if (!k) return;
      bar.innerHTML = KINDS[k].map(([a, w, t, c]) => '<button type="button" data-a="' + a + '"' + (c ? ' class="' + c + '"' : '') + ' aria-label="' + esc(t) + '" title="' + esc(t) + '">' + ico(ICON_OF[a]) + '<span>' + w + '</span></button>').join('');
      barW = bar.offsetWidth; barH = bar.offsetHeight;
    }
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a, s = T.state();
      try {
        if (a === 'ok'){ const was = fromStore; if (T.place() && was >= 0){ stored.splice(was, 1); renderStore(); } if (T.state().mode !== 'place') fromStore = -1; }
        else if (a === 'turn') T.rot(1);
        else if (a === 'x'){ if (s.mode === 'place') T.cancel(); else if (s.mode === 'finish' || s.mode === 'pick') PB().setTool('select'); else PB().select(null); }
        else if (a === 'dup') T.dup();
        else if (a === 'del') T.del();
        else if (a === 'store') store();
        else if (a === 'tint') inspOpen(true);
      } catch (err) { console.warn('furnish touch: ' + a, err); }
    });

    /* ---------- the hint line over the tray ---------- */
    const hint = document.createElement('p'); hint.className = 'fthint'; hint.hidden = true; hint.setAttribute('role', 'status'); st.appendChild(hint);
    let hintTxt = '', hintT = 0;
    function hintSet(cls, txt){
      if (txt === hintTxt && hint.classList.contains('bad') === (cls === 'bad')) return;
      hintTxt = txt; hint.textContent = txt; hint.hidden = !txt; hint.classList.toggle('bad', cls === 'bad'); hint.classList.remove('fade');
      clearTimeout(hintT); if (cls === 'fade') hintT = setTimeout(() => hint.classList.add('fade'), 4000);
    }
    const why = c => 'Blocked: it would go ' + (c.why || 'somewhere it cannot');
    function hintFor(s){
      const c = s.ctx;
      if (s.mode === 'place'){
        if (c && c.hit && !c.valid) return ['bad', why(c) + ' · drag it somewhere free'];
        if (c && c.parent && c.host) return ['', 'On the ' + String(c.host.name || 'piece').toLowerCase() + ' · Place puts it there'];
        if (c && !c.hit) return ['', 'Drag to bring it over the floor'];
        return ['', 'Drag to aim it · Place puts it there'];
      }
      if (s.drag === 'move'){ if (c && c.hit && !c.valid) return ['bad', why(c) + ' · let go and it goes back']; return ['', 'Let go to put it down']; }
      if (s.mode === 'finish') return ['', 'Tap a room\'s floor to lay it, or a wall to cover it · Done when finished'];
      if (s.mode === 'pick') return ['', 'Tap a piece to copy its colors'];
      if (s.sel && s.sel.t === 'piece') return ['fade', 'Drag it to move it · the bar turns, copies, tints, stores or deletes it'];
      if (s.sel) return ['fade', 'Tint picks a color for this ' + (s.sel.t === 'floor' ? 'floor' : 'wall')];
      return ['fade', 'Tap a piece to select it · press and hold a floor or wall to tint it · pinch to zoom'];
    }

    /* ---------- the ghost: magenta and dashed while it is blocked ---------- */
    let dash = null;
    function ghostLook(bad){
      const OV = T.ov(); if (!OV || !OV.made || !OV.gbox || !OV.footE || !window.THREE) return;
      if (!dash){
        const mk = m => { const d = new window.THREE.LineDashedMaterial({ color: m.color.clone(), transparent: true, opacity: m.opacity, depthTest: m.depthTest, dashSize: .07, gapSize: .05 }); d.toneMapped = m.toneMapped; return d; };
        dash = { gbox: [OV.gbox.material, mk(OV.gbox.material)], footE: [OV.footE.material, mk(OV.footE.material)] };
        OV.gbox.computeLineDistances(); OV.footE.computeLineDistances();   // (the dashes are laid out along each edge; the solid lines ignore it)
      }
      let ch = false;
      for (const k of ['gbox', 'footE']){ const o = OV[k], want = dash[k][bad ? 1 : 0]; if (o.material !== want){ want.color.copy(o.material.color); o.material = want; ch = true; } }
      if (ch) try { PB().redraw(); } catch (e) {}
    }

    /* ---------- fingers on the room ---------- */
    // One finger goes to the lab as before (orbit, select, move, the turn ring), except while placing: then it aims the ghost. A second
    // finger calls the first one's drag off (an orbit or a move snaps back) and the two pinch and pan until both are lifted.
    const tp = new Map(); let G = null, own = null, aimAt = null, aimOff = { x: 0, y: 0 }, lp = null;
    const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    const pair = () => { if (tp.size < 2) return null; const [a, b] = [...tp.values()]; return { x: (a.x + b.x)/2, y: (a.y + b.y)/2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const cancelLp = () => { if (lp){ clearTimeout(lp.t); lp = null; } };
    function aimTo(x, y){ const r = st.getBoundingClientRect(); x = Math.max(r.left + 4, Math.min(r.right - 4, x)); y = Math.max(r.top + 4, Math.min(r.bottom - 4, y)); aimAt = { x, y }; T.aim(x, y); }
    function aimMiddle(){ const r = st.getBoundingClientRect(), top = topFree(r); aimTo(r.left + r.width/2, (top + r.bottom)/2); }
    addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || e.target !== cv) return;
      const s = T.state(); if (!s.on || s.trans) return;   // (during the hologram a touch never gets here: the hold in build.py takes it first)
      if (sheetK) sheetOpen(null);
      if (toolsOn) toolsOpen(false);
      tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tp.size === 1){
        if (s.mode === 'place'){
          stop(e); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
          own = e.pointerId;
          // near the ghost: it keeps its distance from the finger as it is dragged; farther away it jumps to the finger
          aimOff = aimAt && Math.hypot(aimAt.x - e.clientX, aimAt.y - e.clientY) < 110 ? { x: aimAt.x - e.clientX, y: aimAt.y - e.clientY } : { x: 0, y: 0 };
          aimTo(e.clientX + aimOff.x, e.clientY + aimOff.y); return;
        }
        if (s.mode === 'select' && s.ready){   // (press and hold on a floor or wall: select it to tint it, the double-click of the lab)
          const x = e.clientX, y = e.clientY, id = e.pointerId;
          lp = { x, y, id, t: setTimeout(() => { lp = null; const s2 = T.state(); if (s2.drag === 'orbit' && tp.size === 1){ T.surface(x, y); } }, 500) };
        }
        return;
      }
      stop(e); cancelLp();
      if (!G){ if (own == null) T.drop(); own = null; G = {}; }
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      G.p = pair();
    }, true);
    addEventListener('pointermove', e => {
      const p = tp.get(e.pointerId); if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (lp && lp.id === e.pointerId && Math.hypot(p.x - lp.x, p.y - lp.y) > 10) cancelLp();
      if (G){ stop(e); const q = pair();
        if (q && G.p){ const f = q.d/G.p.d; if (G.p.d > 24 && Math.abs(f - 1) > .002) T.zoomAt(f, q.x, q.y); if (q.x !== G.p.x || q.y !== G.p.y) T.pan(q.x - G.p.x, q.y - G.p.y); }
        G.p = q; return; }
      if (own === e.pointerId){ stop(e); aimTo(p.x + aimOff.x, p.y + aimOff.y); }
    }, true);
    const up = e => {
      if (!tp.has(e.pointerId)) return; tp.delete(e.pointerId);
      if (lp && lp.id === e.pointerId) cancelLp();
      if (G){ stop(e); if (!tp.size) G = null; else G.p = pair(); return; }
      if (own === e.pointerId){ stop(e); own = null; }
    };
    addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);

    /* ---------- a long press on a button says what it does ---------- */
    const plate = document.createElement('div'); plate.className = 'ftexp'; plate.hidden = true; plate.setAttribute('role', 'tooltip'); document.body.appendChild(plate);
    let ex = null, swallow = false, plateT = 0;
    document.addEventListener('pointerdown', e => {
      swallow = false; if (ex){ clearTimeout(ex.t); ex = null; }
      const b = e.target.closest && e.target.closest('button[title], button[aria-label]');
      if (!b || !(b.closest('.bstage') || b.closest('.nt-bar'))) return;
      ex = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
        ex = null; const txt = b.getAttribute('title') || b.getAttribute('aria-label'); if (!txt) return;
        plate.textContent = txt; plate.hidden = false; const r = b.getBoundingClientRect(), w = plate.offsetWidth, h = plate.offsetHeight;
        plate.style.left = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width/2 - w/2)) + 'px';
        plate.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + 'px';
        swallow = true; clearTimeout(plateT); plateT = setTimeout(() => { plate.hidden = true; }, 2600);
      }, 500) };
    }, true);
    document.addEventListener('pointermove', e => { if (ex && Math.hypot(e.clientX - ex.x, e.clientY - ex.y) > 10){ clearTimeout(ex.t); ex = null; } }, true);
    const exEnd = () => { if (ex){ clearTimeout(ex.t); ex = null; } };
    document.addEventListener('pointerup', exEnd, true); document.addEventListener('pointercancel', exEnd, true);
    document.addEventListener('click', e => { if (swallow){ swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);   // (the press explained, not done)
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.bstage button, .nt-bar button')) e.preventDefault(); }, true);

    /* ---------- every frame while a home is open: the bar, the hint, the ghost's look ---------- */
    // the room's free space starts under the top row (and the Tools row while it is open): the bar over a piece never goes up there
    function topFree(r){ let y = r.top;
      for (const el of [ntBar, toolsOn ? bbar : null]){ const br = el && el.getBoundingClientRect(); if (br && br.height) y = Math.max(y, br.bottom); }
      return y + 8; }
    let lastMode = '', first = true, kindId = null, wallKind = false;
    function tick(){
      requestAnimationFrame(tick);
      let s; try { s = T.state(); } catch (e) { return; }
      if (!s.on || !s.ready || s.asleep || document.hidden){ if (barK) barKind(''); if (toolsOn) toolsOpen(false); return; }
      if (s.trans && toolsOn) toolsOpen(false);
      if (s.home !== homeRef){ homeRef = s.home; stored.length = 0; fromStore = -1; renderStore(); }
      if (first){ first = false; if (fly.hidden && !sheetK){ const g = rail.querySelector('[data-grp]'); if (g) g.click(); } }   // (the tray opens on Furniture)
      if (s.mode === 'place' && lastMode !== 'place') aimMiddle();
      if (s.mode !== 'place'){ if (lastMode === 'place'){ aimAt = null; fromStore = -1; } }
      lastMode = s.mode;
      if (!s.sel && st.classList.contains('ft-insp')) inspOpen(false);
      // the bar
      let k = '';
      const busy = G || s.drag === 'move' || s.drag === 'ring' || s.drag === 'pan' || s.drag === 'orbit' || s.trans || st.classList.contains('ft-insp') || sheetK;
      if (!busy){
        if (s.mode === 'place') k = s.ctx && s.ctx.kind === 'wall' ? 'wplace' : 'place';
        else if (s.mode === 'finish' || s.mode === 'pick') k = 'tool';
        else if (s.sel && s.sel.t === 'piece'){ if (kindId !== s.sel.id){ kindId = s.sel.id; const p = PB().piece(s.sel.id); wallKind = !!(p && p.kind === 'wall'); } k = wallKind ? 'wpiece' : 'piece'; }
        else if (s.sel) k = 'fin';
      }
      barKind(k);
      if (k){
        const r = st.getBoundingClientRect(), top = topFree(r), a = k === 'fin' || k === 'tool' ? null : T.anchor(), L = 8;
        let x, y;
        if (a){ x = a.x - barW/2; y = a.y - barH - 18; if (y < top) y = a.y + 44; }
        else { x = r.left + r.width/2 - barW/2; y = r.bottom - barH - 56; }
        x = Math.max(r.left + L, Math.min(r.right - barW - L, x)); y = Math.max(top, Math.min(r.bottom - barH - 52, y));
        const tf = 'translate3d(' + Math.round(x - r.left) + 'px,' + Math.round(y - r.top) + 'px,0)'; if (bar.style.transform !== tf) bar.style.transform = tf;
        const bad = (k === 'place' || k === 'wplace') && s.ctx && s.ctx.hit && !s.ctx.valid; bar.classList.toggle('bad', !!bad);
      }
      // the ghost (or the piece being moved): dashed while blocked
      const c = s.ctx; if (c) ghostLook(!!(c.hit && !c.valid));
      // the hint, out of the way while a sheet is up
      if (sheetK || st.classList.contains('ft-insp')){ if (!hint.hidden){ hint.hidden = true; hintTxt = ''; } }
      else { const [cls, txt] = hintFor(s); hintSet(cls, txt); }
    }
    requestAnimationFrame(tick);
  }
})();
