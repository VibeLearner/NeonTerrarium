// Neon Terrarium: the film (open the game with #film; record it with tools/trailer/record.py --film). No music, about 85 seconds
// (the exact length depends on when the person at the station gets their train):
//
//   0     out of empty sky the city is built, plot by plot with the game's own build animation, from a garden in the middle
//         outwards; the landmarks arrive (the town square, the police station, the LIDAR array, the Wire Nest and more),
//         a metro is laid across it tile by tile; the camera pulls back until the city fills the frame
//   14.5  down into the garden: the person cam on two people out on the lawn, seven seconds each, the log filling in
//   31    late afternoon in the town square: someone crossing it is mugged in the open middle, a police drone flies in
//         with its searchlight and turns it red on the mugger, two officers run after them
//   ~45   someone walks to the metro station, rides its lift up (golden hour by the top) and boards the train
//   then  the train, followed from the side, low, as night falls; then back over the dark city, the lights coming on one
//         by one as they do in the game; the title, and the rain comes in
//
// Like #trailer it keeps nothing: every save and setting is locked while it is open (saveguard.js).
'use strict';
const FILM = (() => {
  const F = { on: !!window.NT_FILM2, ready: false, playing: false, done: false, t: -1, stage: 'off', log: [], info: {}, failed: null };
  if (!F.on) return F;
  const CAP = !!window.__TR_CAPTURE;
  const say = (...a) => { F.log.push(a.join(' ')); if (F.log.length > 400) F.log.shift(); console.log('[film]', ...a); };
  const warn = (what, e) => { F.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[film] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };
  maybeSpawnMegas = () => {};
  sfx.play = () => {};

  /* ---------- small maths ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, clamp01 = x => clamp(x, 0, 1);
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const lerp = (a, b, u) => a + (b - a)*u, elerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const follow = (cur, goal, k, dt) => cur + (goal - cur)*(1 - Math.exp(-k*dt));
  const DEG = Math.PI/180, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const lerpPose = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), yaw: a.yaw + wrapA(b.yaw - a.yaw)*u, zoom: elerp(a.zoom, b.zoom, u), pitch: lerp(a.pitch, b.pitch, u) });

  /* ---------- the fixed part of the timeline (from the station on, each part starts when the one before it is done) ---------- */
  const MK = { built: 13.6, dive: 14.5, p: [17, 24], garden: 31, square: 33.5, strikeBy: 35, strikeLast: 38.5, chaseFor: 9 };
  const DUR = { toRider: 2.2, riderMax: 16, toSide: 2.2, side: 8.5, out: 9, lightsIn: 1.5, title: 8.5 };

  /* ---------- the city plan ---------- */
  const R = 13;                                         // plots from -13 to 13 each way: 27 x 27
  const GARDEN = { i0: -2, i1: 1, j0: -2, j1: 1 };      // the lawn in the middle
  const MT_J = 4;                                       // the metro: straight across the city, west to east, just south of the middle
  const MT_STOP_I = [-8, 0, 7, 12];                     // its stations (on the straight: each has room for its lift)
  const RIDE = { from: 7, to: 12 };                     // the rider gets on at the station by the square and rides east, across the low part
  // landmarks: [kind, i, j, w, h, when it arrives]
  const MEGAS = [
    ['square', 2, 6, 5, 5, 3.2],       // the town square: north of the track, east of the middle (the mugging happens in its open middle)
    ['police', 8, 6, 3, 3, 4.4],       // the police station beside it (the drone comes from here)
    ['wirenest', 8, 9, 4, 4, 6.4],     // the Wire Nest in the commercial quarter behind
    ['lidar', -12, 9, 3, 3, 7.2],      // the LIDAR array out at the north-west edge, watching
    ['club', -10, 5, 4, 4, 5.4],       // the Neon Dome
    ['market', -6, -10, 4, 4, 4.8],    // the market
    ['foundry', -12, -12, 6, 4, 3.8]]; // the foundry, with the industry
  const LOW_FRONT = { i0: 3, i1: 13, j0: -9, j1: MT_J - 1 };   // south of the track where the side-on shot looks across: kept low so the train shows
  const inBox = (b, i, j) => i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1;
  const megaAt = (i, j) => MEGAS.find(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
  const GC = { x: (GARDEN.i0 + GARDEN.i1)/2*LOT, z: (GARDEN.j0 + GARDEN.j1)/2*LOT };
  const SQ = MEGAS[0], SC_ = { x: (SQ[1] + (SQ[3] - 1)/2)*LOT, z: (SQ[2] + (SQ[4] - 1)/2)*LOT };   // the square's middle
  function plotOf(i, j, Rnd){
    if (inBox(GARDEN, i, j)) return { kind: 'lawn' };
    const d = Math.max(Math.abs(i + .5), Math.abs(j + .5));
    const ring = d <= 3;   // round the garden: low homes
    let zone = i >= 0 ? (j >= 0 ? 'mid' : 'high') : (j >= 0 ? 'low' : 'ind');
    if (ring) zone = 'low';
    else if (Rnd() < .18) zone = ['low', 'mid', 'low', 'ind', 'mid'][Math.floor(Rnd()*5)];
    if (j === MT_J) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: 2 };
    if (inBox(LOW_FRONT, i, j)) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: Rnd() < .5 ? 1 : 2 };
    const edge = d > 10, core = (zone === 'mid' && d < 9) || (d < 6 && !ring);
    const u = Rnd();
    let n = ring ? (u < .5 ? 2 : 3) : edge ? (u < .65 ? 1 : 2) : core ? (u < .25 ? 2 : u < .7 ? 3 : 4) : (u < .4 ? 1 : u < .8 ? 2 : 3);
    if (zone === 'high') n = Math.min(n, 3);
    return { kind: 'bld', zone, n };
  }
  const BUILD = [];
  { const Rnd = mulberry32(2026), all = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++){ if (megaAt(i, j)) continue; all.push(Object.assign({ i, j, d: Math.hypot(i + .5, j + .5) + Rnd()*1.6 }, plotOf(i, j, Rnd))); }
    all.sort((a, b) => a.d - b.d);
    const T0 = .35, T1 = 10.5;
    all.forEach((b, k) => { b.t = T0 + (T1 - T0)*Math.pow(k/(all.length - 1), .78); });
    for (const b of all){ BUILD.push({ t: b.t, kind: 'plot', b }); for (let q = 1; q < (b.n || 0); q++) BUILD.push({ t: b.t + .32*q, kind: 'floor', b }); }
    for (const [kind, i, j, w, h, t] of MEGAS) BUILD.push({ t, kind: 'mega', mk: { kind, i, j, w, h } });
    const tiles = []; for (let i = -R; i <= R; i++) tiles.push([i, MT_J]);
    tiles.forEach(([i, j], k) => BUILD.push({ t: 10.7 + k*.1, kind: k ? 'mtExtend' : 'mtStart', i, j }));
    const tEnd = 10.7 + tiles.length*.1;
    MT_STOP_I.forEach((si, n) => BUILD.push({ t: tEnd + .15 + n*.12, kind: 'mtStop', k: si + R }));
    BUILD.push({ t: tEnd + .7, kind: 'mtFinish' });
    BUILD.sort((a, b) => a.t - b.t);
  }

  /* ---------- the world at the start: nothing at all ---------- */
  function city(){
    cells.clear(); for (const m of [...megas.values()]) megas.delete(m.id);
    metros.length = 0; highways.length = 0;
    S.hour = 8; S.zone = null;
    rebuildAll(); finishSync();
    F.info.plan = { plots: BUILD.filter(b => b.kind === 'plot').length, floors: BUILD.filter(b => b.kind === 'floor').length };
    say('plan', JSON.stringify(F.info.plan));
  }
  F.city = () => safe('city', city);
  let LINE = null;
  function withGreen(g, fn){ const was = GREEN_DEFAULT; GREEN_DEFAULT = g; try { return fn(); } finally { GREEN_DEFAULT = was; } }   // (a new plot takes the default greenery)
  function step(s){
    if (s.kind === 'plot'){
      const b = s.b;
      if (b.kind === 'lawn') return withGreen('grass', () => addPlatform(b.i, b.j, null));
      if (b.mf){ const c = withGreen('some', () => addPlatform(b.i, b.j, null)); if (c) later(() => { if (cells.get(ckey(b.i, b.j)) === c) addSection(c, b.zone, { mf: b.mf }); }, 8); return; }
      return withGreen('some', () => addPlatform(b.i, b.j, b.zone));
    }
    if (s.kind === 'floor'){ const c = cells.get(ckey(s.b.i, s.b.j)); if (c && !c.mega) addSection(c, s.b.zone, s.b.mf ? { mf: s.b.mf } : {}); return; }
    if (s.kind === 'mega'){ const m = spawnMegaAt(s.mk.kind, { i: s.mk.i, j: s.mk.j, w: s.mk.w, h: s.mk.h }); if (!m) warn('mega', s.mk.kind + ' did not fit'); else (F.info.megas = F.info.megas || []).push(s.mk.kind); return; }
    if (s.kind === 'mtStart'){ mtApply({ type: 'start', i: s.i, j: s.j, ok: true }); LINE = metros[metros.length - 1]; return; }
    if (s.kind === 'mtExtend'){ if (LINE) mtApply({ type: 'extend', l: LINE, i: s.i, j: s.j, ok: true }); return; }
    if (s.kind === 'mtStop'){ if (LINE) mtApply({ type: 'stop', l: LINE, k: s.k, ok: true }); return; }
    if (s.kind === 'mtFinish'){ if (LINE){ mtApply({ type: 'finish', l: LINE, k: LINE.tiles.length - 1, ok: true }); F.info.metro = { tiles: LINE.tiles.length, stops: LINE.st.length }; } return; }
  }

  /* ---------- the page: the game's interface hidden, ours on top ---------- */
  const E = {};
  function overlay(){
    document.documentElement.classList.add('tr-on');
    const st = document.createElement('style'); st.id = 'filmStyle';
    st.textContent = `
      html.tr-on body > *:not(#view):not(#flOv):not(.tr-keep){visibility:hidden!important}
      html.tr-on #cctv, html.tr-on #cctvFade{display:none!important}
      html.tr-on, html.tr-on *{cursor:none!important}
      html.tr-on #flOv.ask, html.tr-on #flOv.ask *{cursor:pointer!important}
      html.tr-on #monitor.tr-keep{transform:scale(1.4);transform-origin:top right;top:32px!important;right:36px!important;max-height:calc((100vh - 64px)/1.4)!important;overflow:hidden}
      #flOv{position:fixed;inset:0;z-index:9001;pointer-events:none}
      #flOv.ask{pointer-events:auto}
      #flOv > i{position:absolute;inset:0;display:block;opacity:0;background:#000}
      #flSel{position:absolute;left:0;top:0;width:0;height:0;display:none;pointer-events:none}
      #flSel b{position:absolute;width:22px;height:22px;border:3px solid #38e8e0;filter:drop-shadow(0 0 6px rgba(56,232,224,.9))}
      #flSel b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #flSel b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #flSel b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #flSel b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #flSel i{position:absolute;left:50%;top:-14px;width:8px;height:8px;margin-left:-4px;background:#ff4fa3;transform:rotate(45deg);box-shadow:0 0 10px #ff4fa3}
      #flTitle{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      #flTitle svg{width:58vw;height:auto;overflow:visible}
      #flTitle #neon{filter:drop-shadow(0 0 .35vw rgba(255,74,110,.85)) drop-shadow(0 0 1.6vw rgba(255,74,110,.45))}
      #flTitle #terrarium{filter:drop-shadow(0 0 .3vw rgba(61,255,207,.8))}
      #flMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #flMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'flOv';
    ov.innerHTML = '<i id="flBlack"></i><div id="flSel"><b></b><b></b><b></b><b></b><i></i></div><div id="flTitle"></div><div id="flMsg"><b>Film</b><span id="flStatus">getting ready</span></div>';
    document.body.appendChild(ov);
    Object.assign(E, { ov, black: ov.querySelector('#flBlack'), sel: ov.querySelector('#flSel'), title: ov.querySelector('#flTitle'), msg: ov.querySelector('#flMsg'), status: ov.querySelector('#flStatus') });
    if (CAP) E.msg.hidden = true;
  }
  // the title: Ashley's own (assets/trailer/neon_terrarium_title.svg), drawn in the page so its two words can flicker on separately; cropped
  // to what it draws, so it sits in the middle of the frame
  async function title(){
    const txt = await fetch('assets/trailer/neon_terrarium_title.svg').then(r => r.text());
    E.title.innerHTML = txt;
    const svg = E.title.querySelector('svg'); svg.removeAttribute('width'); svg.removeAttribute('height');
    E.title.style.visibility = 'hidden'; E.title.style.opacity = '1';
    const g = [svg.querySelector('#neon'), svg.querySelector('#terrarium')];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of g){ const b = el.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    if (Number.isFinite(x0) && x1 > x0){ const pad = 6; svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2*pad} ${y1 - y0 + 2*pad}`); }
    E.tNeon = g[0]; E.tTerr = g[1]; E.tNeon.style.opacity = E.tTerr.style.opacity = '0'; E.title.style.visibility = '';
  }
  const status = s => { F.stage = s; if (E.status) E.status.textContent = s; };
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    safe('speed', () => { if (typeof FF !== 'undefined' && FF.set) FF.set(1); });
    if (CAP) window.__FULL_RATE = true;
    safe('resolution', () => { ZOOM_RES = 0; F.pinRes = true; H = 0; applyRenderRes(zoom); });
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; } });
    safe('music', () => music.hold(true));
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(F.pinRes ? (CAP ? 24 : ZOOM_REF) : z); };

  /* ---------- people ---------- */
  const nodeAnc = n => ({ kind: 'point', x: NG.x[n], z: NG.z[n], node: n });
  const cellOf = id => { const m = /^c:(-?\d+),(-?\d+)$/.exec(id || ''); return m ? cells.get(ckey(+m[1], +m[2])) : null; };
  const outside = p => p && p.x !== undefined && !(p.sc && p.sc.mode === 'in') && !p.ride && !p.metro;
  function storyScene(id, castMap, beats, log){
    for (const pid of Object.values(castMap)){ const p = people.get(pid); if (!p || (!p.walk && !p.spot && !places.get(p.at))) throw new Error(id + ': ' + pid + ' is nowhere'); }
    const sc = STORY.startScene({ id, beats, log, roles: {}, effects: {}, next: null, tier: 'case', prio: 9 }, castMap, { done: (s2, why) => say(id, 'ended', why) });
    if (!sc) throw new Error(id + ' did not start');
    return sc;
  }
  function freeNode(x, z, avoid){
    let n = STORY.nearestNode(x, z);
    if (avoid.some(m => Math.hypot(NG.x[m] - NG.x[n], NG.z[m] - NG.z[n]) < 2.4)){ let best = null;
      for (let k = 0; k < NG.x.length; k++){ const d = Math.hypot(NG.x[k] - x, NG.z[k] - z); if (d > 7 || avoid.some(m => Math.hypot(NG.x[m] - NG.x[k], NG.z[m] - NG.z[k]) < 2.4)) continue; if (!best || d < best.d) best = { k, d }; }
      if (best) n = best.k; }
    return n;
  }
  const USED = new Set();
  const free = p => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !USED.has(p.id) && p.home && cellOf(p.home);
  // two people out on the lawn, each talking with a friend (the person cam is on the first of each pair, and only once they're on the lawn)
  const onLawn = p => outside(p) && Math.abs(p.x - GC.x) < 2.1*LOT && Math.abs(p.z - GC.z) < 2.1*LOT;
  function garden(){
    const byHome = home => { const c = cellOf(home); return c ? Math.hypot(c.x - GC.x, c.z - GC.z) : 1e9; };
    const how = p => outside(p) ? Math.hypot(p.x - GC.x, p.z - GC.z) : 30 + byHome(p.home);
    const pool = pplList.filter(p => free(p) && (outside(p) ? Math.hypot(p.x - GC.x, p.z - GC.z) < 6*LOT : byHome(p.home) < 4.5*LOT)).sort((a, b) => how(a) - how(b));
    if (pool.length < 4) throw new Error('only ' + pool.length + ' people near the garden yet');
    const take = () => { const p = pool.find(free); USED.add(p.id); return p; };
    const n1 = freeNode(GC.x - 2.2, GC.z - 1.4, []), n2 = freeNode(GC.x + 2.0, GC.z + 1.6, [n1]);
    F.pairs = [{ A: take(), B: take(), n: n1 }, { A: take(), B: take(), n: n2 }];
    F.gsc = F.pairs.map((q, k) => {
      for (const p of [q.A, q.B]){ p.speed = PPL_SPEED; p.hurry = true; }
      return storyScene('film.garden' + k, { A: q.A.id, B: q.B.id }, [
        { id: 'g0', who: ['A', 'B'], with: [], at: 'case', do: 'walk', anc: nodeAnc(q.n), hold: .2 },
        { id: 'g1', who: ['A'], with: ['B'], at: 'case', do: 'chat', anc: nodeAnc(q.n), hold: 600 }],
        { g0: ['{A} and {B} come out onto the lawn.'], g1: ['{A} and {B} talk on the lawn.'] });
    });
    F.info.garden = F.pairs.map(q => q.A.id);
    say('garden cast', JSON.stringify(F.info.garden), 'at', F.t.toFixed(2));
  }
  function reveal(c, tmpl, fact, channel = 'document', ctx = {}){
    const id = c.A, learned = STORY.learnFrom(tmpl, c, new Set(Object.keys(c)), channel, null, ctx);
    if (typeof PACE !== 'undefined') PACE.mine = true;
    try { STORY.logLine(tmpl, c, ctx, 'reveal', { channel, fact: 'A.' + fact, paced: true }); } finally { if (typeof PACE !== 'undefined') PACE.mine = false; }
    STORY.note(id, { t: STORY.clock, who: id, fact: 'A.' + fact, channel, verified: channel === 'document' || channel === 'introduction', tmpl, cast: c, ctx, learned });
    if (typeof MON !== 'undefined') MON.refresh();
  }
  function revealStep(k, s){
    const q = F.pairs[k], p = q.A, c = { A: p.id, B: q.B.id };
    const job = safe('job', () => STORY.JOB_WORD[STORY.jobKind(p)]) || 'line worker';
    const emp = safe('employer', () => STORY.employerName(p)) || 'the night market';
    const L = [
      [() => reveal(c, '{B} calls across the lawn: "{A.first}!"', 'first-name', 'introduction'),
       () => reveal(c, '{A} complains to {B} about the shift at ' + emp + '.', 'employer'),
       () => reveal(c, '{B} asks how a ' + job + ' ever gets a day off. {A} laughs.', 'job'),
       () => reveal(c, '{A} and {B}, same lawn, same hour. {seen} days running.', 'habit', 'seen', { seen: 5 })],
      [() => reveal(c, 'Name tag on {A}: "{A.first}."', 'first-name'),
       () => reveal(c, '{A} shows {B} a photo: the crew at ' + emp + '.', 'employer'),
       () => reveal(c, '{A} lives at {place}. {B} lives two doors down.', 'home', 'document', { placeId: p.home }),
       () => reveal(c, '{A} works as a ' + job + '. Nights, mostly.', 'job')]][k];
    L[s]();
  }
  const monTab = tab => { const b = document.querySelector('#monTabs button[data-tab=' + tab + ']'); if (b) b.click(); };
  const keep = (el, on) => { if (el) el.classList.toggle('tr-keep', on); };
  const _v = new THREE.Vector3();
  function brackets(p, y){
    if (!p || p.x === undefined || (p.sc && p.sc.mode === 'in')){ E.sel.style.display = 'none'; return; }
    _v.set(p.x, (y ?? p._ey ?? CURB) + .42, p.z).project(cam);
    const x = (_v.x + 1)/2*innerWidth, sy = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.sel.style.display = 'block'; E.sel.style.transform = `translate(${(x - w/2).toFixed(1)}px,${(sy - h/2).toFixed(1)}px)`; E.sel.style.width = w.toFixed(0) + 'px'; E.sel.style.height = h.toFixed(0) + 'px';
  }

  /* ---------- the mugging, in the open middle of the town square ---------- */
  const MUG = { L: null, victim: null, sc: null, struck: false, drone: null, cops: [], chaseAt: 0 };
  function victimWalk(){
    const near = p => outside(p) ? Math.hypot(p.x - SC_.x, p.z - SC_.z) : 20 + (() => { const c = cellOf(p.home); return c ? Math.hypot(c.x - SC_.x, c.z - SC_.z) : 1e9; })();
    const pool = pplList.filter(p => free(p) && near(p) < 9*LOT).sort((a, b) => near(a) - near(b));
    const a = freeNode(SC_.x - 2*LOT, SC_.z + .4*LOT, []), b = freeNode(SC_.x + 2*LOT, SC_.z - .3*LOT, [a]);
    for (const v of pool.slice(0, 12)){
      try {
        MUG.sc = storyScene('film.cross', { A: v.id }, [
          { id: 'c0', who: ['A'], with: [], at: 'case', do: 'walk', anc: nodeAnc(a), hold: .1 },
          { id: 'c1', who: ['A'], with: [], at: 'case', do: 'walk', anc: nodeAnc(b), hold: 30 }], { c0: ['{A} cuts across the square.'], c1: ['{A} crosses the square.'] });
        MUG.victim = v; USED.add(v.id); F.info.victim = v.id; say('victim', v.id); return;
      } catch (e) { warn('victim ' + v.id, e); }
    }
    warn('mugging', 'nobody to send across the square');
  }
  // the station's own answer to a mugging also sends two police bikes: here only the drone goes (and two officers run after them on foot)
  let alertOff = false;
  function quietAlert(){ if (alertOff || !policeDroneAlert) return; const real = policeDroneAlert; policeDroneAlert = L => L === MUG.L ? false : real(L); alertOff = true; }
  function sendDrone(L){
    let best = null;
    for (const st of POLICE_STATIONS) for (const d of st.drones){ if (d.busy) continue; const dd = Math.hypot(d.pos.x - L.x, d.pos.z - L.z); if (!best || dd < best.dd) best = { d, dd }; }
    return best && best.d.scramble(L) ? best.d : null;
  }
  function strike(t){
    let v = MUG.victim;
    if (!v || !outside(v)){ let best = null; for (const p of pplList){ if (!p.walk || p.cop || !outside(p)) continue; const d = Math.hypot(p.x - SC_.x, p.z - SC_.z); if (d < 10 && (!best || d < best.d)) best = { p, d }; } v = best && best.p; }
    if (!v){ warn('mugging', 'nobody in the square'); return; }
    const ox = -Math.sin(CAM.yaw)*1.4, oz = -Math.cos(CAM.yaw)*1.4;   // (the mugger steps out a pace from them, on the far side from the camera)
    const c = cells.get(ckey(Math.round(v.x/LOT), Math.round(v.z/LOT))) || cells.get(ckey(SQ[1], SQ[2]));
    const L = { key: 'film', cell: c, home: { x: v.x + ox, z: v.z + oz }, x: v.x + ox, z: v.z + oz, state: 'strike', rare: false, until: 1e9, row: 10, flip: 1, phase: 3, fade: 0, victim: v, t0: pplNow };
    lurkers.set('film', L); MUG.L = L; MUG.struck = true;
    v.pause = pplNow + 4; emote(v, 'bang', 1.6);
    quietAlert(); MUG.drone = sendDrone(L);
    F.info.mugging = { at: +t.toFixed(2), victim: v.id, drone: !!MUG.drone };
    say('mugging at', t.toFixed(2), MUG.drone ? '(drone sent)' : '(no drone free)');
  }
  // two officers on foot, after the mugger: sent to the street crossing nearest them, again and again as they run
  function chase(t){
    if (!MUG.L || !(MUG.L.state === 'flee' || MUG.L.state === 'rob' || MUG.L.state === 'hide') || t - MUG.chaseAt < 1.1) return;
    MUG.chaseAt = t;
    if (MUG.cops.length < 2){
      const pick = pplList.filter(q => q.cop && !q.onBike && !q.custody && !q.scene && outside(q) && !MUG.cops.includes(q)).sort((a, b) => Math.hypot(a.x - MUG.L.x, a.z - MUG.L.z) - Math.hypot(b.x - MUG.L.x, b.z - MUG.L.z));
      for (const q of pick){ if (MUG.cops.length >= 2) break; MUG.cops.push(q); }
      F.info.cops = MUG.cops.map(q => q.id);
    }
    if (!patrolNodes.length) return;
    const node = patrolNodes.reduce((b, c) => (c.x - MUG.L.x)**2 + (c.z - MUG.L.z)**2 < (b.x - MUG.L.x)**2 + (b.z - MUG.L.z)**2 ? c : b);
    for (const q of MUG.cops){ safe('cop', () => { if (startPatrol(q, node) || (q.callout = node, false)){} q.rush = true; if (!q._shout){ q._shout = true; emote(q, 'bang', 2); } }); }
  }
  // the drone keeps low over the square once it's on the mugger, so it is in the frame (the game flies it over the rooftops)
  function droneLow(){
    for (const st of POLICE_STATIONS) for (const d of st.drones){
      if (d._film) continue; d._film = true; const up = d.update.bind(d);
      d.update = function (dt, time){ const r = up(dt, time);
        if (F.playing && MUG.L && d.st.chase && d.st.chase.L === MUG.L){ const cap = CURB + 4.6, g = d.g.position;
          if (Math.hypot(g.x - MUG.L.x, g.z - MUG.L.z) < 9 && g.y > cap) g.y += (cap - g.y)*.08; }
        return r; };
    }
  }
  const chaser = () => { for (const st of POLICE_STATIONS) for (const d of st.drones) if (d.st.chase && d.st.chase.L === MUG.L) return d; return null; };

  /* ---------- the station: someone walks to its lift, rides up, waits, gets on ---------- */
  const RD = { p: null, st: null, plan: null, called: false, boardedAt: 0, departAt: 0 };
  const stopIdx = (P, k) => P.stops.findIndex(s => s.k === k);
  function rider(){
    if (!LINE || !LINE.stn) return warn('station', 'no metro');
    const from = LINE.stn.get(RIDE.from + R), to = LINE.stn.get(RIDE.to + R);
    if (!from || !to || !places.has(from.id)) return warn('station', 'no station by the square');
    const [sx, sz] = mtW(from, 0, 0);
    const pool = pplList.filter(p => free(p) && outside(p) && !p.scene && Math.hypot(p.x - sx, p.z - sz) < 4*LOT).sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz));
    for (const p of pool){
      p.metroPlan = { station: from.id, l: LINE, from: from.k, to: to.k, final: p.home };
      if (startTrip(p, from.id)){ RD.p = p; RD.st = from; USED.add(p.id); p.hurry = false; F.info.rider = p.id; say('rider', p.id); return; }
      p.metroPlan = null;
    }
    // nobody near enough: someone stepping out at the foot of the lift (as the game's own visitors do)
    const p = pool[0] || pplList.find(q => free(q) && outside(q));
    if (p){ RD.p = p; RD.st = from; USED.add(p.id); p.walk = null; p.spot = null;
      p.metro = { l: LINE, k: from.k, to: to.k, final: p.home, st: 'up', t: 0, x: from.side*MT_LIFT_OFF, z: 0, waited: 0, missed: 0, slot: 0 }; p.until = Infinity; F.info.rider = p.id + ' (at the lift)'; say('rider at the lift', p.id); }
  }
  // where the rider is, for the camera: walking, in the lift, on the platform
  function riderPos(){
    const p = RD.p; if (!p) return null;
    const m = p.metro;
    if (m && m.l){ const r = safe('pose', () => mtPose(p, pplNow, 0)); if (r) return { x: r.x, y: r.y, z: r.z }; if (m.st === 'ride') return null; }
    if (outside(p)) return { x: p.x, y: p._ey ?? CURB, z: p.z };
    return null;
  }
  // the train, brought in once the rider is on the platform, so they don't wait long
  function callTrain(){
    if (RD.called || !LINE || !LINE.train) return; RD.called = true;
    const tr = LINE.train, P = mtPath(LINE), si = stopIdx(P, RD.st.k); if (si < 0) return;
    const dir = si > 0 ? 1 : -1, prev = si - dir;
    tr.dwell = 0; tr.doors = 0; tr.v = MT_VMAX*.9; tr.dir = dir; tr.at = prev; tr.next = si; tr.s = clamp(P.stops[si].s - dir*2.2*LOT, .5, P.len - .5);
    say('train called at', F.t.toFixed(2));
  }

  /* ---------- the camera: set outright every frame ---------- */
  const CAM = { x: GC.x, y: TARGET_Y, z: GC.z, yaw: .55, zoom: 8, pitch: 40*DEG };
  const STREET = { yaw: Math.PI - .8, pitch: 38*DEG, zoom: 8.2 };   // the game's own close view, from the track side
  const SIDE = { yaw: Math.PI, pitch: 11*DEG, zoom: 9.5 };            // the metro, side on and low
  const PH = { name: 'build', t0: 0, from: null };
  const phase = (name, t) => { PH.name = name; PH.t0 = t; PH.from = Object.assign({}, CAM); say('phase', name, 'at', t.toFixed(2)); };
  let sub = null, gview = null, mugCam = null, rideCam = null;
  const buildCam = t => { const u = ease(seg(t, .3, MK.built + .6));
    return { x: GC.x, y: TARGET_Y, z: GC.z, yaw: .55 + .62*ss(t/MK.dive), zoom: elerp(8, 31, u), pitch: lerp(40, 34, u)*DEG }; };
  const hAt = (x, z) => { const i = Math.round(x/LOT), j = Math.round(z/LOT), c = cells.get(ckey(i, j)); if (!c) return 0;
    if (!c.mega && (Math.abs(x - i*LOT) > LOT*.37 || Math.abs(z - j*LOT) > LOT*.37)) return 0; return hwSurface(c); };
  function los(x, y, z, yw, pt){
    const cp = Math.cos(pt), dx = Math.sin(yw)*cp, dy = Math.sin(pt), dz = Math.cos(yw)*cp;
    for (let s = .3; s < 120; s += .25){ const yy = y + dy*s; if (yy > 52) return true; const px = x + dx*s, pz = z + dz*s, h = hAt(px, pz);
      if (h > CURB + .05 && yy < h - .08) return false; if (yy > MT_Y - .6 && yy < MT_Y + .4 && mtAt(Math.round(px/LOT), Math.round(pz/LOT)).length) return false; }
    return true;
  }
  function pickView(pts, pref, pmin, pmax){
    const ok = (yw, pt) => pts.every(p => los(p.x, p.y, p.z, yw, pt));
    for (let d = pmin; d <= pmax; d += 4) for (const dk of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8]){ const yw = pref + dk*Math.PI/8; if (ok(yw, d*DEG)) return { yaw: yw, pitch: d*DEG }; }
    return { yaw: pref, pitch: pmax*DEG };
  }
  const who = t => t < MK.p[1] ? 0 : 1;
  const trainPos = () => { const cp = LINE && LINE.train && LINE.train.cp && LINE.train.cp[1]; return cp ? { x: cp[0], y: cp[1], z: cp[2] } : null; };
  function camAt(t, dt){
    if (t < MK.dive){ Object.assign(CAM, buildCam(t)); }
    else if (t < MK.garden){   // into the garden; the camera on the person once they're on the lawn, on their spot until then
      if (!gview) gview = pickView([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].map(([a, b]) => ({ x: GC.x + a, y: CURB + .45, z: GC.z + b })), 1.0, 34, 58);
      const a = buildCam(MK.dive), u = ease(seg(t, MK.dive, MK.p[0]));
      const q = F.pairs ? F.pairs[who(t)] : null, p = q && onLawn(q.A) ? q.A : null;
      const px = p ? p.x : q ? NG.x[q.n] : GC.x, pz = p ? p.z : q ? NG.z[q.n] : GC.z;
      if (!sub) sub = { x: px, z: pz };
      sub.x = follow(sub.x, px, t < MK.p[0] ? 8 : 3, dt); sub.z = follow(sub.z, pz, t < MK.p[0] ? 8 : 3, dt);
      Object.assign(CAM, { x: lerp(a.x, sub.x, u), z: lerp(a.z, sub.z, u), y: lerp(TARGET_Y, CURB + .5, u), yaw: a.yaw + wrapA(gview.yaw - a.yaw)*u, zoom: elerp(a.zoom, 4.4, u), pitch: lerp(a.pitch, gview.pitch, u) });
    }
    else if (PH.name === 'square'){   // the square: the mugging in its middle, then with the mugger, the drone over them
      const u = ease(seg(t, PH.t0, MK.square));
      let g = { x: SC_.x, y: CURB + .5, z: SC_.z, zoom: STREET.zoom };
      const L = MUG.L;
      if (L && L.fade > .05 && L.state !== 'away'){
        const d = chaser(), dp = d && d.pos;
        let tx = L.x, tz = L.z, ty = CURB + .5, need = STREET.zoom;
        if (dp){ const w = clamp01(1.2 - Math.hypot(dp.x - L.x, dp.z - L.z)/14); tx = lerp(tx, dp.x, .3*w); tz = lerp(tz, dp.z, .3*w); ty = lerp(ty, dp.y, .25*w); need = Math.max(need, (dp.y - CURB)*Math.cos(STREET.pitch)*.62 + 3.4); }
        // (and the officers, if they're in it)
        for (const q of MUG.cops) if (outside(q)) need = Math.max(need, Math.min(13, Math.hypot(q.x - L.x, q.z - L.z)*.55 + 3.6));
        if (!mugCam) mugCam = { x: g.x, z: g.z, y: g.y, zoom: g.zoom };
        mugCam.x = follow(mugCam.x, tx, 2.2, dt); mugCam.z = follow(mugCam.z, tz, 2.2, dt); mugCam.y = follow(mugCam.y, ty, 2.2, dt); mugCam.zoom = follow(mugCam.zoom, Math.min(13, need), 1.6, dt);
      }
      if (mugCam) g = { x: mugCam.x, y: mugCam.y, z: mugCam.z, zoom: mugCam.zoom };
      Object.assign(CAM, lerpPose(PH.from, Object.assign({ yaw: STREET.yaw, pitch: STREET.pitch }, g), u));
    }
    else if (PH.name === 'rider'){   // with the one going to the train: their walk, the lift, the platform
      const u = ease(seg(t, PH.t0, PH.t0 + DUR.toRider)), r = riderPos();
      if (r){ if (!rideCam) rideCam = Object.assign({}, r); rideCam.x = follow(rideCam.x, r.x, 3, dt); rideCam.y = follow(rideCam.y, r.y + .4, 3, dt); rideCam.z = follow(rideCam.z, r.z, 3, dt); }
      const g = rideCam || { x: CAM.x, y: CAM.y, z: CAM.z };
      Object.assign(CAM, lerpPose(PH.from, { x: g.x, y: g.y, z: g.z, yaw: STREET.yaw, pitch: 34*DEG, zoom: 7.2 }, u));
    }
    else if (PH.name === 'side'){   // the train, side on, low, followed as it pulls away and night falls
      const u = ease(seg(t, PH.t0, PH.t0 + DUR.toSide)), tp = trainPos() || { x: CAM.x, y: MT_Y + .5, z: MT_J*LOT };
      if (!F.sideT) F.sideT = Object.assign({}, tp);
      F.sideT.x = follow(F.sideT.x, tp.x, 4, dt); F.sideT.y = follow(F.sideT.y, tp.y, 4, dt); F.sideT.z = follow(F.sideT.z, tp.z, 4, dt);
      Object.assign(CAM, lerpPose(PH.from, { x: F.sideT.x, y: F.sideT.y, z: F.sideT.z, yaw: SIDE.yaw, pitch: SIDE.pitch, zoom: SIDE.zoom }, u));
    }
    else if (PH.name === 'out' || PH.name === 'title'){   // back over the city
      if (!F.outFrom) F.outFrom = Object.assign({}, CAM);
      const a = F.outFrom, v = ease(seg(t, F.outT0, F.outT0 + DUR.out)), w = seg(t, F.outT0, F.outT0 + DUR.out + DUR.title);
      Object.assign(CAM, { x: lerp(a.x, GC.x + 1.5*LOT, v), y: lerp(a.y, TARGET_Y, v), z: lerp(a.z, GC.z + 1.5*LOT, v), yaw: a.yaw - .5*v - .08*w, zoom: elerp(a.zoom, 27, v), pitch: lerp(a.pitch, 31*DEG, v) });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // the hour: morning while it's built, early afternoon in the garden, late afternoon in the square, golden hour by the time the rider is up
  // on the platform, night as the train pulls away
  function hourAt(t){
    if (t < MK.dive) return lerp(8, 11.5, ss(t/MK.dive));
    if (t < MK.garden) return lerp(13.4, 14.2, seg(t, MK.dive, MK.garden));
    if (PH.name === 'square') return lerp(14.2, 15.6, ss(seg(t, MK.garden, MK.square))) + .15*seg(t, MK.square, MK.square + 14);
    if (PH.name === 'rider'){ if (F.hRider === undefined) F.hRider = S.hour; const up = RD.p && RD.p.metro && RD.p.metro.st !== 'up' ? 1 : 0;   // (in the cab or past it: golden)
      F.hGold = Math.max(F.hGold || 0, up ? Math.min(1, (F.hGold || 0) + .02) : seg(t, PH.t0, PH.t0 + 9)*.75);
      return lerp(F.hRider, 16.75, ss(F.hGold)); }
    if (PH.name === 'side'){ if (F.hSide === undefined) F.hSide = S.hour; return lerp(F.hSide, 22.2, ss(seg(t, PH.t0 + 1.2, PH.t0 + DUR.side - 1))); }
    return 22.2;
  }
  // the lights: as the game has them by day; dark as night comes, until the camera pulls back; then on one by one at the game's own pace
  function lightsAt(t){
    if (PH.name === 'side') return t > PH.t0 + 2 ? 0 : null;
    if (PH.name === 'out' || PH.name === 'title') return clamp01((t - F.outT0 - DUR.lightsIn)*LIGHTS_RATE);
    return null;
  }
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (F.playing) safe('frame', () => {
      F.t = clock();
      const h = hourAt(F.t); if (!CAP && Math.abs(h - S.hour) > 1e-4) window.HOUR_DRAG_AT = performance.now(); S.hour = h;
      const lv = lightsAt(F.t); if (lv !== null) LIGHTS_ON.value = lv;
      camAt(F.t, dt);
    });
    return _uc(dt);
  };

  /* ---------- the fixed moments ---------- */
  const EV = []; let fired = 0, t0 = 0, lastT = 0;
  const at = (t, f, name) => EV.push({ t, f, name });
  for (const s of BUILD) at(s.t, () => step(s), s.kind);
  // the people move in to what is built so far, at once (the game does it a little at a time in the background)
  for (const tm of [3, 5.5, 8.5, 12.5]) at(tm, () => { syncPeopleRest(); F.info['people@' + tm] = pplList.length; }, 'people move in');
  // out onto the lawn: as soon as enough people live round it
  for (let k = 0; k < 14; k++) at(3.2 + k*.5, () => { if (!F.pairs) try { garden(); } catch (e) { if (k === 13) warn('garden', e); } }, 'out onto the lawn');
  MK.p.forEach((t0_, k) => {
    at(t0_ + .1, () => { MON.open(F.pairs[k].A.id); keep(document.getElementById('monitor'), true); monTab('log'); }, 'person cam ' + (k + 1));
    [.6, 1.8, 3.0, 4.3].forEach((d, s) => at(t0_ + d, () => revealStep(k, s), 'reveal ' + (k + 1) + '.' + (s + 1)));
  });
  at(MK.garden - 3.5, () => victimWalk(), 'someone heads across the square');
  at(MK.garden, () => { keep(document.getElementById('monitor'), false); MON.close(); E.sel.style.display = 'none'; for (const sc of F.gsc || []) safe('garden end', () => STORY.endScene(sc, 'done')); phase('square', MK.garden); }, 'to the square');
  EV.sort((a, b) => a.t - b.t);

  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  F.len = 0;
  function paint(t){
    const tt = PH.name === 'title' ? t - PH.t0 : -1, end = tt >= 0 && tt > DUR.title - .8;
    const black = t < 1 ? 1 - ss(t) : end ? ss((tt - (DUR.title - .8))/.8) : tt >= 0 ? .4*ss(tt/1.4) : 0;
    E.black.style.opacity = String(black);
    if (E.tNeon){ E.tNeon.style.opacity = String(tt > .5 ? neonAt(tt - .5) : 0); E.tTerr.style.opacity = String(tt > .9 ? neonAt(tt - .9) : 0); }
  }
  const clock = () => (performance.now() - t0)/1000;
  function tick(){
    requestAnimationFrame(tick);
    if (!F.playing) return;
    const t = clock(), dt = Math.max(0, Math.min(.1, t - lastT)); lastT = t; F.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); }
    if (t > 4) quietAlert();
    if (t > 8) droneLow();
    paint(t);
    // the person cam's brackets in the garden (only once they're on the lawn)
    if (t >= MK.p[0] && t < MK.garden && F.pairs){ const p = F.pairs[who(t)].A; safe('brackets', () => brackets(onLawn(p) ? p : null)); }
    else if (PH.name === 'rider' && RD.p){ const r = riderPos(); safe('brackets', () => brackets(r ? { x: r.x, z: r.z, _ey: r.y } : null, r && r.y)); }
    else if (E.sel.style.display !== 'none') E.sel.style.display = 'none';
    // the square: the strike when the one crossing is out in the middle (or by the last moment, whoever is nearest), then the chase
    if (PH.name === 'square'){
      if (!MUG.struck && t >= MK.strikeBy){ const v = MUG.victim, mid = v && outside(v) && v.walk && Math.hypot(v.x - SC_.x, v.z - SC_.z) < 1.3*LOT;
        if (mid || t >= MK.strikeLast) safe('mugging', () => strike(t)); }
      if (MUG.struck){ safe('chase', () => chase(t)); if (MUG.L && (MUG.L.state === 'strike' || MUG.L.state === 'rob')) MUG.L.fade = Math.min(1, MUG.L.fade + dt*3); }
      if (MUG.L && !lurkers.has('film') && MUG.L.state !== 'away') lurkers.set('film', MUG.L);
      if (MUG.struck && t > F.info.mugging.at + MK.chaseFor){ safe('rider', rider); phase('rider', t); }
      else if (!MUG.struck && t > MK.strikeLast + 1){ safe('rider', rider); phase('rider', t); }
    }
    // the station: the train comes once they're on the platform; when it pulls away with them on, the side-on shot
    else if (PH.name === 'rider'){
      const m = RD.p && RD.p.metro, st = m && m.st;
      if (st && st !== 'up' && st !== 'cabUp') callTrain();
      if (t > PH.t0 + DUR.riderMax - 3) callTrain();
      if (st === 'ride' && !RD.boardedAt){ RD.boardedAt = t; say('rider boarded at', t.toFixed(2)); }
      const tr = LINE && LINE.train, moving = tr && tr.dwell <= 0 && tr.v > .05;
      if ((RD.boardedAt && moving) || t > PH.t0 + DUR.riderMax + 4) phase('side', t);
    }
    else if (PH.name === 'side' && t > PH.t0 + DUR.side){ F.outT0 = t; phase('out', t); }
    else if (PH.name === 'out' && t > F.outT0 + DUR.out){ phase('title', t); LK.wx.fadeSec = 5; LK.setWeather('rain', false, true); }
    else if (PH.name === 'title' && t > PH.t0 + DUR.title){ F.playing = false; F.done = true; F.len = t; say('done at', t.toFixed(2));
      if (!CAP){ E.msg.hidden = false; E.status.innerHTML = 'click to play again'; E.ov.classList.add('ask'); E.ov.addEventListener('click', () => location.reload(), { once: true }); } }
  }

  /* ---------- getting ready, and playing ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const s0 = performance.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - s0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  const wait = secs => { const s0 = performance.now(); return until(() => performance.now() - s0 >= secs*1000, secs + 5); };
  async function setup(){
    overlay(); settle();
    status('waking the city');
    await title().catch(e => warn('title', e));
    await until(() => typeof pplReady !== 'undefined' && pplReady, 120).catch(e => warn('people', e));
    await wait(.5);
    safe('cam', () => camAt(0, 0));
    await wait(1);
    F.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ E.ov.classList.add('ask'); E.status.innerHTML = 'click to play<br><small>about 85 s, no sound</small>'; E.ov.addEventListener('click', go, { once: true }); }
    say('ready');
  }
  function go(){ E.ov.classList.remove('ask'); E.msg.hidden = true; F.playing = true; F.done = false; fired = 0; t0 = performance.now(); lastT = 0; F.t = 0; say('rolling'); }
  F.start = () => { if (!F.ready || F.playing) return false; go(); return true; };
  F.state = () => ({ ready: F.ready, playing: F.playing, done: F.done, t: F.t, stage: F.stage, phase: PH.name, info: F.info, log: F.log.slice(-30) });
  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); F.failed = String(e && e.message || e); });
  });
  return F;
})();
