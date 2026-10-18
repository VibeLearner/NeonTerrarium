// Neon Terrarium: the title screen. A lived-in flat on a bright morning, the player's own city outside the round
// window. The room is built in 3D and lit for real (a sun through the porthole, soft shadows, reflections, light shafts
// in the air), then baked to pictures (tools/title/bake.py -> assets/title/); here they're laid over the live city,
// with the glass cut out so the city shows through it. Live on top: dust turning in the sunbeam and the NEON TERRARIUM
// sign on the wall flickering (its baked dark state swapped in for a moment). The menu sits at the side; Settings and
// Cities open where they normally do. Continue pushes the view through the window into the city.
// Plan: project doc claude/title-screen-plan.md.
'use strict';
const TITLE = (() => {
  const T = { on: false };
  const root = document.getElementById('title'); if (!root) return T;
  const $t = id => document.getElementById(id);
  const stage = $t('tStage'), imRoom = $t('tRoom'), imGlass = $t('tGlass'), imOff = $t('tSignOff'), cvDust = $t('tDust'), glow = $t('tSignGlow');
  const menu = root.querySelector('.t-menu'), panel = $t('tCities');
  const gD = cvDust.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VER = '2026-10-18e';
  let A = null, view = null, W = 0, H = 0, S0 = 1, OX = 0, OY = 0, raf = 0, last = 0, motes = [];
  const anchorsP = fetch('assets/title/anchors.json?v=' + VER).then(r => r.json()).catch(() => null);

  /* ---------- the picture, fitted to the screen ---------- */
  // the baked room covers the screen; it's placed so the window stays in view whatever the screen's shape
  function layout(){
    if (!A) return;
    W = innerWidth; H = innerHeight;
    const v = W/H < .85 ? 'tall' : 'wide';
    if (v !== view){ view = v; imRoom.src = 'assets/title/room-' + v + '.png?v=' + VER; imGlass.src = 'assets/title/glass-' + v + '.png?v=' + VER; if (A[v].signRect) imOff.src = 'assets/title/signoff-' + v + '.png?v=' + VER; }
    const a = A[v], iw = a.w, ih = a.h; S0 = Math.max(W/iw, H/ih);
    const sw = iw*S0, sh = ih*S0;
    OX = Math.min(0, Math.max(W - sw, W*.5 - a.win[0]*sw)); OY = Math.min(0, Math.max(H - sh, H*.5 - a.win[1]*sh));
    if (v === 'wide') OX = Math.min(0, Math.max(W - sw, (W - sw)/2));   // (wide: centred; the window sits right of centre by design)
    Object.assign(stage.style, { left: OX + 'px', top: OY + 'px', width: sw + 'px', height: sh + 'px' });
    cvDust.width = Math.round(sw/S0); cvDust.height = Math.round(sh/S0);   // (dust at the picture's own pixels: it scales up crisp with it)
    const P = (k, el, dx = 0, dy = 0) => { el.style.left = (a[k][0]*100 + dx) + '%'; el.style.top = (a[k][1]*100 + dy) + '%'; };
    const r = a.signRect; imOff.hidden = glow.hidden = !r;   // (no sign on the wall for now: the bake leaves it out)
    if (r){ P('sign', glow); Object.assign(imOff.style, { left: r[0]/iw*100 + '%', top: r[1]/ih*100 + '%', width: r[2]/iw*100 + '%', height: r[3]/ih*100 + '%' }); }
    stage.style.setProperty('--px', S0 + 'px');
    stage.style.transformOrigin = (a.win[0]*100) + '% ' + (a.win[1]*100) + '%';
    seedMotes();
  }

  /* ---------- dust in the sunbeam ---------- */
  // motes drift in the band of light from the window to the sunlit floor, catching the light as they turn
  function seedMotes(){
    const a = A[view], n = reduced ? 0 : 70; motes = [];
    for (let i = 0; i < n; i++) motes.push({ t: Math.random(), o: Math.random()*2 - 1, z: Math.random(), ph: Math.random()*6.3, sp: .004 + Math.random()*.01 });
  }
  function drawDust(now, dt){
    const a = A[view], w = cvDust.width, h = cvDust.height; gD.clearRect(0, 0, w, h);
    const x0 = a.win[0]*w, y0 = a.win[1]*h, x1 = Math.min(a.patch[0], 1.05)*w, y1 = Math.min(a.patch[1], 1.0)*h, r = a.winR*.8;
    for (const m of motes){
      m.t += m.sp*dt; if (m.t > 1){ m.t = 0; m.o = Math.random()*2 - 1; }
      const t = m.t, bx = x0 + (x1 - x0)*t, by = y0 + (y1 - y0)*t, spread = r*(.8 + t*1.2);
      const x = bx + m.o*spread + Math.sin(now/1700 + m.ph)*6, y = by + Math.cos(now/2100 + m.ph)*5 - m.o*spread*.3;
      const tw = .45 + .55*Math.max(0, Math.sin(now/600 + m.ph*3)), al = tw*(1 - Math.abs(m.o))*Math.sin(Math.PI*t)*.9;
      if (al < .05) continue;
      gD.fillStyle = 'rgba(255,244,214,' + al.toFixed(2) + ')'; gD.fillRect(Math.round(x), Math.round(y), m.z > .8 ? 2 : 1, m.z > .8 ? 2 : 1);
    }
  }
  let flick = [], flickNext = 0;
  function loop(now){
    if (!T.on) return; raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(.1, (now - last)/1000) : 0; last = now;
    try { if (typeof yawT !== 'undefined' && !reduced) yawT += dt*.02; } catch (e) {}
    if (A && view) drawDust(now, dt);
    // the sign: a steady hum, and now and then the tubes stutter (two or three blinks, like a tired transformer)
    if (!reduced && now > flickNext){ flick = []; let t = now; for (let k = 0, n = 1 + Math.floor(Math.random()*3); k < n; k++){ const d = 50 + Math.random()*140; flick.push([t, t + d]); t += d + 40 + Math.random()*120; } flickNext = t + 3000 + Math.random()*7000; }
    const dark = flick.some(([a, b]) => now >= a && now < b);
    glow.classList.toggle('dip', dark); imOff.classList.toggle('on', dark);
    if (now - noteAt > 1500){ noteAt = now; fillNote(); }
  }
  let noteAt = 0;
  function fillNote(){
    let day = 1, res = 0; try { day = STORY.day() + 1; } catch (e) {} try { for (const p of people.values()) if (!p.visitor && !p.gone) res++; } catch (e) {}
    $t('tHoloLine').textContent = 'Day ' + day + ' · ' + res.toLocaleString('en-US') + ' residents';
    if (SLOTS.active) SLOTS.list().then(l => { const a = l.find(x => x.active); if (a) $t('tHoloName').textContent = a.name; }).catch(() => {});
  }

  /* ---------- showing and leaving ---------- */
  let was = null;
  function setScene(){
    try {
      was = { hour: S.hour, cycle: S.cycle, wx: typeof LK !== 'undefined' ? { mode: LK.wx.mode, set: LK.wx.set } : null, zoomT };
      S.cycle = false; S.hour = 8.6;   // (the room's morning: the city outside matches it)
      if (typeof LK !== 'undefined' && LK.setWeather) LK.setWeather('clear', true, true); else S.rain = false;
      zoomT = Math.max(7, Math.min(zoomT, 10.5));
    } catch (e) {}
  }
  function restoreScene(){
    if (!was) return;
    try {
      S.hour = was.hour; S.cycle = was.cycle; zoomT = was.zoomT;
      if (was.wx && typeof LK !== 'undefined'){ if (was.wx.mode === 'auto') LK.setAutoWeather(true, true); else LK.setWeather(was.wx.set, false, true); }
    } catch (e) {}
    was = null;
  }
  T.show = async () => {
    if (T.on) return; T.on = true; document.documentElement.classList.add('title-on'); root.hidden = false; root.classList.remove('leaving');
    setScene(); A = A || await anchorsP;
    if (!A){ T.hide(true); return; }   // (the pictures couldn't be had: straight into the city)
    layout(); last = 0; raf = requestAnimationFrame(loop); fillNote();
    setTimeout(() => { const c = menu.querySelector('[data-act="continue"]'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  T.hide = (instant) => {
    if (!T.on) return;
    closePanel(); setDeck(false);
    if (instant || reduced){ finish(); return; }
    root.classList.add('leaving');
    try { zoomT = Math.max(6, zoomT*.8); } catch (e) {}
    setTimeout(finish, 1500);
  };
  function finish(){ T.on = false; cancelAnimationFrame(raf); root.hidden = true; root.classList.remove('leaving'); document.documentElement.classList.remove('title-on'); restoreScene(); try { LAST_INPUT = performance.now(); } catch (e) {} }

  /* ---------- the menu ---------- */
  function setDeck(on){
    document.documentElement.classList.toggle('title-deck', on);
    const deck = $t('deck'), tg = $t('deckToggle'); if (deck && tg && deck.classList.contains('open') !== on) tg.click();
  }
  // the settings deck's own Close button closes it here too
  { const tg = $t('deckToggle'); if (tg) tg.addEventListener('click', () => { if (T.on && !$t('deck').classList.contains('open')) document.documentElement.classList.remove('title-deck'); }); }
  menu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'continue') T.hide();
    else if (act === 'new') openPanel(true);
    else if (act === 'cities') openPanel(false);
    else if (act === 'settings'){ const on = !document.documentElement.classList.contains('title-deck'); if (on) closePanel(); setDeck(on); }
  });
  // while the title is up, the city's keys (WASD, zones, delete...) are off; typing in the panels still works
  addEventListener('keydown', e => {
    if (!T.on) return;
    if (e.key === 'Escape'){ if (!panel.hidden) closePanel(); else if (document.documentElement.classList.contains('title-deck')) setDeck(false); e.preventDefault(); }
    const deck = $t('deck'); if (deck && deck.contains(e.target)) return;   // (the settings deck's own keys)
    e.stopImmediatePropagation();
  }, true);
  addEventListener('resize', () => { if (T.on) layout(); });

  /* ---------- the cities panel ---------- */
  function ago(t){ if (!t) return ''; const s = (Date.now() - t)/1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s/60) + ' min ago' : s < 86400*2 ? Math.round(s/3600) + ' h ago' : Math.round(s/86400) + ' days ago'; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(msg, bad){ const el = $t('tMsg'); el.textContent = msg || ''; el.classList.toggle('bad', !!bad); }
  async function render(){
    const list = await SLOTS.list(), box = $t('tList');
    box.innerHTML = list.map(c => {
      const m = c.meta || {}, line = 'Day ' + (m.day || 1) + ' · ' + (m.residents || 0).toLocaleString('en-US') + ' residents';
      const tags = (c.active ? '<i class="tag on">Playing</i>' : '') + (c.cloud ? '<i class="tag">' + (c.local ? 'Cloud' : 'Cloud only') + '</i>' : '') + (c.cloudNewer ? '<i class="tag warn">Newer in cloud</i>' : '');
      return '<li class="tcity' + (c.active ? ' active' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="tthumb">' + (c.thumb ? '<img alt="" src="' + c.thumb + '">' : '<span>No picture yet</span>') + '</div>' +
        '<div class="tinfo"><b>' + esc(c.name) + '</b><small>' + line + '</small><small>' + (c.active ? 'Open now' : 'Saved ' + ago(c.updated)) + '</small><div class="ttags">' + tags + '</div></div>' +
        '<div class="tact">' + (c.active ? '' : '<button data-do="open">Open</button>') + '<button data-do="rename">Rename</button>' + (c.local ? '<button data-do="export">Export</button>' : '') + (c.active ? '' : '<button data-do="delete" class="danger">Delete</button>') + '</div></li>';
    }).join('');
    const u = SLOTS.cloudUser; $t('tUser').value = u || ''; $t('tCloudState').textContent = u ? (SLOTS.cloudErr || 'Signed in as ' + u + '. Your cities sync every few minutes.') : 'Not signed in. Cities stay in this browser.';
    $t('tCloudBtn').textContent = u ? 'Sync now' : 'Sign in'; $t('tSignOut').hidden = !u;
  }
  function openPanel(fresh){
    if (document.documentElement.classList.contains('title-deck')) setDeck(false);
    panel.hidden = false; say('');
    render().then(async () => { const a = (await SLOTS.list()).find(c => c.active); if (a && !a.thumb){ await SLOTS.checkpoint(); render(); } }).catch(e => say(e.message, true));
    if (fresh) setTimeout(() => $t('tNewName').focus(), 30);
  }
  function closePanel(){ panel.hidden = true; const r = $t('tRename'); if (r) r.remove(); }
  $t('tClose').addEventListener('click', closePanel);
  $t('tList').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const id = b.closest('li').dataset.id, act = b.dataset.do;
    try {
      if (act === 'open'){ say('Opening…'); await SLOTS.open(id); }
      else if (act === 'export'){ await SLOTS.exportFile(id); say('Saved a file of that city to your downloads.'); }
      else if (act === 'delete'){
        if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Delete for good?'; setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = 'Delete'; } }, 4000); return; }
        await SLOTS.remove(id); say('Deleted.'); render();
      }
      else if (act === 'rename'){
        const li = b.closest('li'), cur = li.querySelector('b').textContent;
        const f = document.createElement('form'); f.id = 'tRename'; f.className = 'trename';
        f.innerHTML = '<input maxlength="40" aria-label="City name"><button type="submit">Save</button>'; f.querySelector('input').value = cur;
        li.querySelector('.tinfo').appendChild(f); f.querySelector('input').select();
        f.addEventListener('submit', async ev => { ev.preventDefault(); await SLOTS.rename(id, f.querySelector('input').value); render(); fillNote(); });
      }
    } catch (err) { say(err.message, true); }
  });
  $t('tNew').addEventListener('submit', async e => { e.preventDefault(); say('Starting a new city…'); try { await SLOTS.create($t('tNewName').value); } catch (err) { say(err.message, true); } });
  $t('tImport').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = await SLOTS.importFile(f); say('Added “' + r.name + '”. Open it from the list.'); render(); } catch (err) { say(err.message, true); } });
  $t('tCloud').addEventListener('submit', async e => {
    e.preventDefault(); const v = $t('tUser').value;
    try { say('Talking to the save server…'); if (v.trim().toLowerCase() !== SLOTS.cloudUser) await SLOTS.setUser(v); else await SLOTS.sync(); say(SLOTS.cloudUser ? 'Synced.' : ''); render(); }
    catch (err) { say(err.message, true); render(); }
  });
  $t('tSignOut').addEventListener('click', async () => { await SLOTS.setUser(''); say('Signed out. Your cities are still here in this browser.'); render(); });

  // the title comes up on load (saveguard.js decides), over the city as it builds
  if (window.NT_TITLE) T.show(); else root.hidden = true;
  return T;
})();
window.TITLE = TITLE;
