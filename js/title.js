// Neon Terrarium: the title screen. A lived-in flat on a bright morning, the player's own city outside the round
// window. The room is built in 3D and lit for real (a sun through the porthole, soft shadows, reflections, light shafts
// in the air), then baked to pictures (tools/title/bake.py -> assets/title/); here they're laid over the live city,
// with the glass cut out so the city shows through it. Live on top: clouds drifting past the window, the plants on the
// sill swaying a little (baked apart as their own picture), dust turning in the sunbeam, and the capsule's light bar
// blinking now and then (its baked dark state swapped in for a moment). The menu sits at the side; Settings and
// Cities open where they normally do. Continue pushes the view through the window into the city.
// Plan: project doc claude/title-screen-plan.md.
'use strict';
const TITLE = (() => {
  const T = { on: false };
  const root = document.getElementById('title'); if (!root) return T;
  const $t = id => document.getElementById(id);
  const stage = $t('tStage'), imRoom = $t('tRoom'), imGlass = $t('tGlass'), imOff = $t('tSignOff'), cvDust = $t('tDust'), glow = $t('tSignGlow'), cvSky = $t('tSky'), cvPl = $t('tPlants');
  const menu = root.querySelector('.t-menu'), panel = $t('tCities');
  const gD = cvDust.getContext('2d'), gS = cvSky.getContext('2d'), gP = cvPl.getContext('2d');
  let plSrc = null, plOut = null, plBase = null, plW = 0, plH = 0, clouds = [], plantAt = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VER = '2026-10-18h';
  let RAW = null, TOD = 'morning', SUNS = [], sunCv = null, gSun = null, sunH = 0, yaw0 = null, sunW = 1, sway = { x: 0, y: 0, r: 0 };
  let A = null, view = null, W = 0, H = 0, S0 = 1, OX = 0, OY = 0, raf = 0, last = 0, motes = [];
  const anchorsP = fetch('assets/title/anchors.json?v=' + VER).then(r => r.json()).catch(() => null);

  /* ---------- the picture, fitted to the screen ---------- */
  // the baked room covers the screen; it's placed so the window stays in view whatever the screen's shape
  function layout(){
    if (!A) return;
    W = innerWidth; H = innerHeight;
    const v = W/H < .85 ? 'tall' : 'wide';
    if (v !== view){ view = v; const f = k => 'assets/title/' + k + '-' + v + '-' + TOD + '.png?v=' + VER;
      imRoom.src = f('room'); imGlass.src = f('glass'); if (A[v].signRect) imOff.src = f('signoff'); loadPlants(v);
      SUNS = (A[v].heads || []).map((h, i) => { const im = new Image(); im.src = 'assets/title/sun-' + v + '-' + TOD + '-' + i + '.png?v=' + VER; return im; }); }
    const a = A[v], iw = a.w, ih = a.h; S0 = Math.max(W/iw, H/ih);
    const sw = iw*S0, sh = ih*S0;
    OX = Math.min(0, Math.max(W - sw, W*.5 - a.win[0]*sw)); OY = Math.min(0, Math.max(H - sh, H*.5 - a.win[1]*sh));
    if (v === 'wide') OX = Math.min(0, Math.max(W - sw, (W - sw)/2));   // (wide: centred; the window sits right of centre by design)
    Object.assign(stage.style, { left: OX + 'px', top: OY + 'px', width: sw + 'px', height: sh + 'px' });
    cvDust.width = Math.round(sw/S0); cvDust.height = Math.round(sh/S0); sunCv.width = cvDust.width; sunCv.height = cvDust.height;   // (dust at the picture's own pixels: it scales up crisp with it)
    const P = (k, el, dx = 0, dy = 0) => { el.style.left = (a[k][0]*100 + dx) + '%'; el.style.top = (a[k][1]*100 + dy) + '%'; };
    const pr = a.plantRect; cvPl.hidden = !pr; if (pr) Object.assign(cvPl.style, { left: pr[0]/iw*100 + '%', top: pr[1]/ih*100 + '%', width: pr[2]/iw*100 + '%', height: pr[3]/ih*100 + '%' });
    cvSky.width = cvDust.width; cvSky.height = cvDust.height; seedClouds();
    const r = a.signRect; imOff.hidden = !r; glow.hidden = !r || a.glow === false;
    if (r){ P('sign', glow); Object.assign(imOff.style, { left: r[0]/iw*100 + '%', top: r[1]/ih*100 + '%', width: r[2]/iw*100 + '%', height: r[3]/ih*100 + '%' }); }
    stage.style.setProperty('--px', S0 + 'px');
    stage.style.transformOrigin = (a.win[0]*100) + '% ' + (a.win[1]*100) + '%';
    seedMotes();
  }

  /* ---------- the pod turning: the sun swinging round, and a slow sway ---------- */
  // The city outside turns because the pod does, so the sun's beam moves too: the bake has what the sun adds at nine
  // headings (60 degrees either side of straight in); the two nearest are blended and added over the room. Past those,
  // the sun has gone round the hull and the beam fades out until it comes round again.
  sunCv = document.createElement('canvas'); sunCv.className = 't-layer t-sun'; sunCv.setAttribute('aria-hidden', 'true'); gSun = sunCv.getContext('2d');
  stage.insertBefore(sunCv, cvPl);
  function drawSun(){
    const a = A[view], hs = a.heads || [], w = sunCv.width, h = sunCv.height; gSun.clearRect(0, 0, w, h); sunW = 0;
    if (!hs.length || !SUNS.length) return;
    // which way the beam moves as the city turns: the far side of the city drifts the way the sun does, so the patch on
    // the floor moves against it (the bake's patches tell us which heading moves it which way on the picture)
    const p = a.patches || [], sgn = p.length > 1 && p[p.length - 1][0] > p[0][0] ? -1 : 1;
    let d = ((sgn*(yaw - yaw0)*180/Math.PI + hs[0]) % 360 + 540) % 360 - 180;   // (degrees, -180..180; starts with the sun just coming in)
    sunH = d;
    const lo = hs[0], hi = hs[hs.length - 1], fade = Math.max(0, Math.min(1, 1 - (Math.max(lo - d, d - hi, 0))/25));
    sunW = fade; if (fade <= 0) return;
    const c = Math.max(lo, Math.min(hi, d)), f = (c - lo)/(hi - lo)*(hs.length - 1), i = Math.min(hs.length - 2, Math.floor(f)), t = f - i;
    gSun.globalCompositeOperation = 'lighter';
    if (SUNS[i].complete){ gSun.globalAlpha = (1 - t)*fade; gSun.drawImage(SUNS[i], 0, 0, w, h); }
    if (SUNS[i + 1].complete){ gSun.globalAlpha = t*fade; gSun.drawImage(SUNS[i + 1], 0, 0, w, h); }
    gSun.globalAlpha = 1;
  }
  // the pod is afloat: it drifts a few pixels and leans a fraction of a degree, slowly, never quite repeating
  function drawSway(now){
    if (reduced) return; const t = now/1000;
    const x = Math.sin(t*.21)*2.2 + Math.sin(t*.53 + 1)*.8, y = Math.sin(t*.17 + 2)*2.6 + Math.sin(t*.41)*.9, r = Math.sin(t*.13 + .5)*.16 + Math.sin(t*.37)*.05;
    stage.style.translate = (x*S0/2).toFixed(2) + 'px ' + (y*S0/2).toFixed(2) + 'px'; stage.style.rotate = r.toFixed(3) + 'deg';
  }
  // the hour: the city's own, in four looks
  function pickTime(h){ return h >= 5.5 && h < 10 ? 'morning' : h >= 10 && h < 16.5 ? 'day' : h >= 16.5 && h < 19.5 ? 'evening' : 'night'; }

  /* ---------- the plants on the sill, swaying ---------- */
  // their picture is sheared a pixel or two, more toward the tips: each column measured from its lowest leaf (the pot's rim)
  function loadPlants(v){
    plSrc = null; const a = A[v]; if (!a.plantRect) return;
    const im = new Image(); im.onload = () => { if (view !== v) return;
      plW = cvPl.width = im.width; plH = cvPl.height = im.height; gP.clearRect(0, 0, plW, plH); gP.drawImage(im, 0, 0);
      const d = gP.getImageData(0, 0, plW, plH); plSrc = new Uint32Array(d.data.buffer.slice(0)); plOut = d; plBase = new Int16Array(plW).fill(-1);
      for (let x = 0; x < plW; x++) for (let y = plH - 1; y >= 0; y--) if (plSrc[y*plW + x] >>> 24){ plBase[x] = y; break; } };
    im.src = 'assets/title/plants-' + v + '-' + TOD + '.png?v=' + VER;
  }
  function drawPlants(now){
    if (!plSrc || reduced || now - plantAt < 33) return; plantAt = now;
    const t = now/1000, out = new Uint32Array(plOut.data.buffer); out.fill(0);
    const gust = .6 + .4*Math.sin(t*.23)*Math.sin(t*.11 + 1.3);
    for (let x = 0; x < plW; x++){ const b = plBase[x]; if (b < 0) continue;
      const ph = Math.sin(t*.9 + x*.03)*.7 + Math.sin(t*2.1 + x*.08)*.3;
      for (let y = 0; y <= b; y++){ const hgt = b - y, dx = Math.round(Math.min(2.4, hgt/45*2.4)*ph*gust), sx = x - dx;
        if (sx >= 0 && sx < plW) out[y*plW + x] = plSrc[y*plW + sx]; } }
    gP.putImageData(plOut, 0, 0);
  }

  /* ---------- clouds past the window ---------- */
  // a few soft pixel clouds drifting slowly across the upper half of the glass, over the city's sky
  const CLOUD = { morning: ['214,200,190', '255,247,232', 1], day: ['200,208,218', '255,255,255', 1], evening: ['170,110,120', '255,190,150', 1], night: ['40,48,70', '90,100,130', .7] };
  function seedClouds(){
    clouds = []; if (reduced || !A || !view) return; const a = A[view], r = a.winR;
    for (let i = 0; i < 6; i++){ const puffs = [], n = 5 + Math.floor(Math.random()*6), sz = r*(.08 + Math.random()*.08);
      for (let k = 0; k < n; k++){ const m = 1 - Math.abs(k - (n - 1)/2)/(n/2); puffs.push([(k - n/2)*sz*1.1 + (Math.random() - .5)*sz*.4, -m*sz*.7 - Math.random()*sz*.3, sz*(.5 + m*.5 + Math.random()*.2)]); }
      clouds.push({ x: (Math.random()*2.4 - 1.2)*r, y: -r*(.3 + Math.random()*.55), base: sz*.35, puffs, sp: r*(.004 + Math.random()*.005), a: .22 + Math.random()*.18 }); }
  }
  function drawClouds(dt){
    const w = cvSky.width, h = cvSky.height; gS.clearRect(0, 0, w, h); if (!clouds.length) return;
    const a = A[view], cx = a.win[0]*w, cy = a.win[1]*h, r = a.winR;
    gS.save(); gS.beginPath(); gS.arc(cx, cy, r, 0, Math.PI*2); gS.clip();
    for (const c of clouds){ c.x += c.sp*dt; if (c.x > r*1.4) c.x = -r*1.4;
      const by = Math.round(cy + c.y + c.base), fade = Math.max(0, Math.min(1, (cy + r*.1 - by)/(r*.4))); if (fade <= 0) continue;
      gS.save(); gS.beginPath(); gS.rect(0, 0, w, by); gS.clip();   // (a flat underside, like real fair-weather clouds)
      for (const [dx, dy, pr] of c.puffs){ const x = Math.round(cx + c.x + dx), y = Math.round(cy + c.y + dy);
        const CC = CLOUD[TOD]; gS.fillStyle = 'rgba(' + CC[0] + ',' + (c.a*.8*fade*CC[2]).toFixed(3) + ')'; gS.beginPath(); gS.ellipse(x, y + pr*.18, pr*1.7, pr*.75, 0, 0, Math.PI*2); gS.fill(); }
      for (const [dx, dy, pr] of c.puffs){ const x = Math.round(cx + c.x + dx), y = Math.round(cy + c.y + dy);
        gS.fillStyle = 'rgba(' + CLOUD[TOD][1] + ',' + (c.a*fade*CLOUD[TOD][2]).toFixed(3) + ')'; gS.beginPath(); gS.ellipse(x, y - pr*.08, pr*1.45, pr*.6, 0, 0, Math.PI*2); gS.fill(); }
      gS.restore(); }
    gS.restore();
  }

  /* ---------- dust in the sunbeam ---------- */
  // motes drift in the band of light from the window to the sunlit floor, catching the light as they turn
  function seedMotes(){
    const a = A[view], n = reduced ? 0 : 70; motes = [];
    for (let i = 0; i < n; i++) motes.push({ t: Math.random(), o: Math.random()*2 - 1, z: Math.random(), ph: Math.random()*6.3, sp: .004 + Math.random()*.01 });
  }
  function drawDust(now, dt){
    const a = A[view], w = cvDust.width, h = cvDust.height; gD.clearRect(0, 0, w, h);
    if (!a.patch) return;
    const x0 = a.win[0]*w, y0 = a.win[1]*h, x1 = Math.min(a.patch[0], 1.05)*w, y1 = Math.min(a.patch[1], 1.0)*h, r = a.winR*.8;
    for (const m of motes){
      m.t += m.sp*dt; if (m.t > 1){ m.t = 0; m.o = Math.random()*2 - 1; }
      const t = m.t, bx = x0 + (x1 - x0)*t, by = y0 + (y1 - y0)*t, spread = r*(.8 + t*1.2);
      const x = bx + m.o*spread + Math.sin(now/1700 + m.ph)*6, y = by + Math.cos(now/2100 + m.ph)*5 - m.o*spread*.3;
      const tw = .45 + .55*Math.max(0, Math.sin(now/600 + m.ph*3)), al = tw*(1 - Math.abs(m.o))*Math.sin(Math.PI*t)*.9*sunW;
      if (al < .05) continue;
      gD.fillStyle = 'rgba(255,244,214,' + al.toFixed(2) + ')'; gD.fillRect(Math.round(x), Math.round(y), m.z > .8 ? 2 : 1, m.z > .8 ? 2 : 1);
    }
  }
  let flick = [], flickNext = 0;
  function loop(now){
    if (!T.on) return; raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(.1, (now - last)/1000) : 0; last = now;
    try { if (typeof yawT !== 'undefined' && !reduced) yawT += dt*.02; if (yaw0 === null) yaw0 = yaw; } catch (e) {}
    aimCity();
    if (A && view){ drawSun(); drawSway(now); drawDust(now, dt); drawClouds(dt); drawPlants(now); }
    // the light bar: steady, and now and then it blinks: a stutter of two or three, or one slow dip
    if (!reduced && now > flickNext){ flick = []; let t = now;
      if (Math.random() < .35){ flick.push([t, t + 500 + Math.random()*400]); t += 900; }
      else for (let k = 0, n = 2 + Math.floor(Math.random()*2); k < n; k++){ const d = 60 + Math.random()*120; flick.push([t, t + d]); t += d + 60 + Math.random()*140; }
      flickNext = t + 4000 + Math.random()*6000; }
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
      S.cycle = false; TOD = pickTime(S.hour);   // (the city's own hour, held still; the room's light matches it)
      if (typeof LK !== 'undefined' && LK.setWeather) LK.setWeather('clear', true, true); else S.rain = false;
      yaw0 = null;
      was.cam = { goal: camGoal.clone(), pitchT };
      // the player's city, for framing it in the window: the middle of everything built, and how far it reaches
      let x = 0, z = 0, n = 0; for (const c of cells.values()){ x += c.x; z += c.z; n++; } x = n ? x/n : 0; z = n ? z/n : 0;
      let r = 0; for (const c of cells.values()) r = Math.max(r, Math.hypot(c.x - x, c.z - z)); CITY = { x, z, r: r + LOT*.8 };
    } catch (e) { CITY = null; }
  }
  // Each frame while the title is up: the camera dropped to a low, looking-out angle and slid so the city sits in the
  // round window (the picture is placed over the screen, so the window's middle isn't the screen's), zoomed to fill it.
  let CITY = null;
  function aimCity(){
    if (!CITY || !A || !view || root.classList.contains('leaving')) return;
    try {
      const a = A[view], wx = OX + a.win[0]*a.w*S0, wy = OY + a.win[1]*a.h*S0, wr = a.winR*S0;
      const P = 14*Math.PI/180; pitchT = P;   // (low: out of a window you look across the city, not down on it)
      zoomT = Math.max(5, Math.min(40, CITY.r*H/(2*1.05*Math.max(60, wr))));
      const k = 2*zoomT/H, ox = (wx - W/2)*k, oy = -(wy - H/2)*k, sy = Math.sin(yaw), cy = Math.cos(yaw);
      const d = (oy + wr*.28*k)/Math.sin(P);   // (the city's middle a little below the window's: sky and clouds above it)
      camGoal.set(CITY.x - cy*ox + sy*d, TARGET_Y, CITY.z + sy*ox + cy*d);
    } catch (e) {}
  }
  function restoreScene(){
    if (!was) return;
    try {
      S.hour = was.hour; S.cycle = was.cycle; zoomT = was.zoomT; if (was.cam){ camGoal.copy(was.cam.goal); pitchT = was.cam.pitchT; }
      if (was.wx && typeof LK !== 'undefined'){ if (was.wx.mode === 'auto') LK.setAutoWeather(true, true); else LK.setWeather(was.wx.set, false, true); }
    } catch (e) {}
    was = null;
  }
  T.show = async () => {
    if (T.on) return; T.on = true; document.documentElement.classList.add('title-on'); root.hidden = false; root.classList.remove('leaving');
    setScene(); RAW = RAW || await anchorsP;
    if (!RAW){ T.hide(true); return; }   // (the pictures couldn't be had: straight into the city)
    A = {}; for (const v of ['wide', 'tall']) A[v] = RAW[v][TOD] || RAW[v].morning; view = null;
    layout(); aimCity(); try { camT.copy(camGoal); } catch (e) {} last = 0; raf = requestAnimationFrame(loop); fillNote();
    setTimeout(() => { const c = menu.querySelector('[data-act="continue"]'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  T.hide = (instant) => {
    if (!T.on) return;
    closePanel(); setDeck(false);
    if (instant || reduced){ finish(); return; }
    root.classList.add('leaving');
    try { if (was && was.cam){ camGoal.copy(was.cam.goal); pitchT = was.cam.pitchT; zoomT = was.zoomT; } } catch (e) {}
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
