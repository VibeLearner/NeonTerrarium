// Neon Terrarium: the film (open the game with #film; record it with tools/trailer/record.py --film). No music, one continuous take
// (the exact length depends on the train's run to the far end of its line):
//
//   0     out of empty sky the city is built, plot by plot with the game's own build animation, from a garden in the middle
//         outwards; the landmarks arrive (the town square, the police station, the LIDAR array, the Wire Nest and more),
//         a metro is laid across it tile by tile; the camera pulls back until the city fills the frame. Morning
//   14.5  down into the garden: the person cam on two people out on the lawn, the log filling in. The view turns for the second,
//         who then walks home and in through their door
//   30.6  their apartment in Furnish pod: the hologram flies in, a couch, a floor lamp and a plant are set down, the hologram flies
//         back out to the city as it was left
//   ~42   the camera travels across town to the square, the light turning slowly gold: someone crossing it is mugged in the open,
//         a police drone flies in and turns its light red on the mugger, two officers run after them
//   then  someone walks past it to the metro station, rides the lift up and boards the train as the sun gets low
//   then  the train, followed from the side, low, all the way to the far end of the line, as the sun sets and night comes on;
//         then back over the dark city, the lights coming on one by one; the title, and the rain comes in
//
// Rendered, not played: the page is in render mode (saveguard.js), every frame drawn whole, and when the apartment's lab still has work
// to do the film's clock waits for it (F.held) while the recorder keeps stepping without taking pictures
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
  // leave2: the second person sets off home; door: they are through it; open: the apartment opens; the hologram in (APT.holo), the
  // furnishing (APT.furn), the hologram out (APT.back) and the lab fading off the city (APT.fade); garden: the camera sets off for the
  // square; square: it is there
  const MK = { built: 13.6, dive: 14.5, p: [17, 24], leave2: 27.6, door: 30.2, open: 30.6 };
  const APT = { holo: 3.05, furn: 5.2, back: 3.05, fade: .45 };
  MK.room = MK.open + APT.holo; MK.unroom = MK.room + APT.furn; MK.back = MK.unroom + APT.back; MK.garden = MK.back + APT.fade; MK.square = MK.garden + 6.5;
  const DUR = { out: 9, lightsIn: 1.5, title: 8.5 };

  /* ---------- the city plan ---------- */
  const R = 13, RW = 16, RX = 20;                                // plots from -16 to 13 each way (west and south a little further: the west end's street shots stay over the city)
  const GARDEN = { i0: -2, i1: 1, j0: -2, j1: 1 };      // the lawn in the middle
  const MT_J = 4;                                       // the metro: straight across the city, west to east, just south of the middle
  const MT_STOP_I = [];   // (no stations between: only the line's two ends, either side of the city)                     // its stations (on the straight: each has room for its lift)
  const RIDE = { from: -13, to: 13 };                     // the rider gets on at the station by the square and rides east, across the low part
  // landmarks: [kind, i, j, w, h, when it arrives]
  const MEGAS = [
    ['square', -15, 5, 5, 5, 3.2],     // the town square at the west end, right by the line's west station (the mugging happens in its open part)
    ['police', -10, 5, 3, 3, 4.4],     // the police station beside it (the drone and the officers come from here)
    ['wirenest', -6, 9, 4, 4, 6.4],    // the Wire Nest further east (clear of the square shot's foreground)
    ['club', 4, 6, 4, 4, 5.4],         // the Neon Dome in the commercial quarter
    ['lidar', 10, 9, 3, 3, 7.2],       // the LIDAR array out at the east edge, watching
    ['market', 2, -11, 4, 4, 4.8],     // the market
    ['foundry', 7, -12, 6, 4, 3.8]];   // the foundry, with the industry
  const LOW_NORTH = { i0: -18, i1: -9, j0: 10, j1: 13 };   // north of the square, between it and the street camera: kept low so the square shows
  const LOW_FRONT = { i0: -20, i1: -3, j0: -12, j1: MT_J - 1 };   // south of the track where the side-on shot looks across: kept low so the train shows
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
    if (inBox(LOW_FRONT, i, j) || inBox(LOW_NORTH, i, j)) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: Rnd() < .5 ? 1 : 2 };
    const edge = d > 10, core = (zone === 'mid' && d < 9) || (d < 6 && !ring);
    const u = Rnd();
    let n = ring ? (u < .5 ? 2 : 3) : edge ? (u < .65 ? 1 : 2) : core ? (u < .25 ? 2 : u < .7 ? 3 : 4) : (u < .4 ? 1 : u < .8 ? 2 : 3);
    if (zone === 'high') n = Math.min(n, 3);
    return { kind: 'bld', zone, n };
  }
  const BUILD = [];
  { const Rnd = mulberry32(2026), all = [];
    for (let i = -RX; i <= R; i++) for (let j = -RW; j <= R; j++){ if (megaAt(i, j)) continue; all.push(Object.assign({ i, j, d: Math.hypot(i + .5, j + .5) + Rnd()*1.6 }, plotOf(i, j, Rnd))); }
    all.sort((a, b) => a.d - b.d);
    const T0 = .35, T1 = 10.5;
    all.forEach((b, k) => { b.t = T0 + (T1 - T0)*Math.pow(k/(all.length - 1), .78); });
    for (const b of all){ BUILD.push({ t: b.t, kind: 'plot', b }); for (let q = 1; q < (b.n || 0); q++) BUILD.push({ t: b.t + .32*q, kind: 'floor', b }); }
    for (const [kind, i, j, w, h, t] of MEGAS) BUILD.push({ t, kind: 'mega', mk: { kind, i, j, w, h } });
    const tiles = []; for (let i = -RW; i <= R; i++) tiles.push([i, MT_J]);
    tiles.forEach(([i, j], k) => BUILD.push({ t: 10.6 + k*.09, kind: k ? 'mtExtend' : 'mtStart', i, j }));
    const tEnd = 10.6 + tiles.length*.09;
    MT_STOP_I.forEach((si, n) => BUILD.push({ t: tEnd + .15 + n*.12, kind: 'mtStop', k: si + RW }));
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
    if (s.kind === 'mtStart'){ mtApply({ type: 'start', i: s.i, j: s.j, ok: true }); LINE = metros[metros.length - 1]; if (LINE) LINE.train = null; return; }
    if (s.kind === 'mtExtend'){ if (LINE){ mtApply({ type: 'extend', l: LINE, i: s.i, j: s.j, ok: true }); LINE.train = null; } return; }
    if (s.kind === 'mtStop'){ if (LINE){ mtApply({ type: 'stop', l: LINE, k: s.k, ok: true }); LINE.train = null; } return; }
    if (s.kind === 'mtFinish'){ if (LINE){ mtApply({ type: 'finish', l: LINE, k: LINE.tiles.length - 1, ok: true }); F.info.metro = { tiles: LINE.tiles.length, stops: LINE.st.length }; } return; }
  }

  /* ---------- the page: the game's interface hidden, ours on top ---------- */
  const E = {};
  function overlay(){
    document.documentElement.classList.add('tr-on');
    const st = document.createElement('style'); st.id = 'filmStyle';
    st.textContent = `
      html.tr-on body > *:not(#view):not(#flOv):not(#furnish):not(.tr-keep){visibility:hidden!important}
      html.tr-on .furnish-frame{transition:none!important}
      html.tr-on .furnish.derez::before, html.tr-on .furnish.derez::after{display:none!important}
      html.tr-on #cctv, html.tr-on #cctvFade{display:none!important}
      html.tr-on, html.tr-on *{cursor:none!important}
      html.tr-on #flOv.ask, html.tr-on #flOv.ask *{cursor:pointer!important}
      html.tr-on #monitor.tr-keep{transform:scale(var(--monk,1.4));transform-origin:top right;top:3vh!important;right:2vh!important;max-height:calc(94vh/var(--monk,1.4))!important;overflow:hidden}
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
      #flTitle svg{width:74vw;max-height:60vh;height:auto;display:block;overflow:visible}
      #flTitle #neon{filter:drop-shadow(0 0 .35vw rgba(255,74,110,.85)) drop-shadow(0 0 1.6vw rgba(255,74,110,.45))}
      #flTitle #terrarium{filter:drop-shadow(0 0 .3vw rgba(61,255,207,.8))}
      #flMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #flMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'flOv';
    ov.innerHTML = '<i id="flBlack"></i><div id="flSel"><b></b><b></b><b></b><b></b><i></i></div><div id="flTitle"></div><div id="flMsg"><b>Film</b><span id="flStatus">getting ready</span></div>';
    document.body.appendChild(ov);
    const monk = () => document.documentElement.style.setProperty('--monk', (1.4*innerHeight/1080).toFixed(3)); monk(); addEventListener('resize', monk);
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
    // both words the same size: TERRARIUM scaled up to NEON's letter height, the two lines centred on each other
    const nb = g[0].getBBox(), tb = g[1].getBBox();
    if (nb.height > 0 && tb.height > 0){
      const k = nb.height/tb.height, gap = nb.height*.28, cx = nb.x + nb.width/2;
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g[1].parentNode.insertBefore(wrap, g[1]); wrap.appendChild(g[1]);
      g[1].setAttribute('transform', `translate(${cx - tb.width*k/2} ${nb.y + nb.height + gap}) scale(${k}) translate(${-tb.x} ${-tb.y})`);
      const ww = Math.max(nb.width, tb.width*k), x0 = cx - ww/2, y0 = nb.y, hh = nb.height*2 + gap, pad = nb.height*.12;
      svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${ww + 2*pad} ${hh + 2*pad}`);
    }
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
    // every frame drawn the same way: the static cache's frames and the frames between them (when the shadows are redrawn, every other frame
    // while the hour moves) placed the metro a little differently, so it shook from side to side
    safe('cache', () => { SC.mode = 'off'; });
    safe('looks', () => { LK.auto = [{ id: 'late', start: 3 }, { id: 'morning', start: 5.5 }, { id: 'golden', start: 14 }, { id: 'dusk', start: 18.5 }, { id: 'night', start: 20 }]; });   // (morning hands straight over to golden: the afternoon look, the palest, is left out. Nothing is saved)
    // render mode (saveguard.js sets the switches read at load; these are the ones set at run time): no speed-based or small-triangle detail loss, no
    // slow updates for people off screen, no sharp far view
    safe('render', () => { const T = window.PERF_HUD && window.PERF_HUD.tests; if (T) T.noSlowFar = T.noSmall = T.noSpeed = true; if (typeof SD !== 'undefined') SD.on = false; if (typeof FARV !== 'undefined') FARV.on = false; });
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(F.pinRes ? (CAP ? 24 : ZOOM_REF) : z); };

  /* ---------- the cast, played by the film: every move planned here, nothing left to the game's own people ---------- */
  // A puppet is drawn where its script says, with the frames it says (people.js, mega.js: p.puppet, L.puppet, a drone's st.puppet).
  const camR = () => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
  const walkF = (t, ph, sp = 1) => Math.floor(t*9*sp + ph) % PPL.walk;   // (sp: the pace as a multiple of the game's walking speed)
  const stride = v => v/PPL_SPEED;   // the stride rate for a speed in world units a second
  const runF = (t, ph) => F_RUN + Math.floor(t*11 + ph) % PPL.walk;
  const idleF = (t, ph) => F_IDLE + Math.floor(t*2.5 + ph) % PPL.idle;
  const talkF = (t, ph) => F_SPEC + Math.floor(t*6 + ph) % 6;
  // a path of points with times: where along it at time t, and which way it's heading
  function along(pts, t){   // pts: [{t, x, z}], in time order
    if (t <= pts[0].t) return { x: pts[0].x, z: pts[0].z, dx: pts[1] ? pts[1].x - pts[0].x : 1, dz: pts[1] ? pts[1].z - pts[0].z : 0, moving: false };
    for (let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k];
      if (t <= b.t){ const u = (t - a.t)/Math.max(1e-6, b.t - a.t); return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), dx: b.x - a.x, dz: b.z - a.z, moving: Math.hypot(b.x - a.x, b.z - a.z) > .01 }; } }
    const a = pts[pts.length - 2] || pts[0], b = pts[pts.length - 1];
    return { x: b.x, z: b.z, dx: b.x - a.x || 1, dz: b.z - a.z, moving: false };
  }
  // take someone out of the city's own life for the film (and give them back after)
  const CAST = new Set();
  function takePerson(p, fn){
    if (p.scene) safe('end scene', () => STORY.endScene(p.scene, 'preempted'));
    if (p.spot && p.spot.by === p.id) p.spot.by = null;
    p.walk = null; p.spot = null; p.patrol = null; p.metro = null; p.metroPlan = null; p.club = null; p.clubbing = false; p.ride = null; p.chain = null; p.pause = 0;
    p.until = Infinity; p.puppet = fn; CAST.add(p.id); return p;
  }
  function release(p){ if (!p || !p.puppet) return; p.puppet = null; p.until = 0; safe('send home', () => sendHome(p)); }
  const cellOf = id => { const m = /^c:(-?\d+),(-?\d+)$/.exec(id || ''); return m ? cells.get(ckey(+m[1], +m[2])) : null; };
  const civilian = p => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !p.custody && !p.puppet && !CAST.has(p.id) && p.home && cellOf(p.home);
  // whoever lives nearest a point (ordinary residents only)
  function nearestPeople(x, z, n, ok = civilian){
    const near = p => { if (p.x !== undefined) return Math.hypot(p.x - x, p.z - z); const c = cellOf(p.home); return c ? 40 + Math.hypot(c.x - x, c.z - z) : 1e9; };
    return pplList.filter(ok).sort((a, b) => near(a) - near(b)).slice(0, n);
  }

  /* ---------- the garden: two pairs walk out onto the lawn and talk; the person cam on one of each ---------- */
  // Each pair's spot is picked when they are cast, by looking along the line from the spot to where that person cam's camera will be: no plot on
  // that line may stand taller than the line (so no building ever hides them). The second person lives on the lawn's edge: the second view looks
  // at their front door, and after their talk they walk home through it (then their apartment, in Furnish pod)
  const GV = { pitch: 46*DEG, y1: .95, y2: null };   // the two views' yaw (y2: worked out from the second person's door)
  const GW = .5, GT = { walkIn: 14.7, there: 14.7 + 2.2/GW };   // (walking in at the game's pace)
  const LAWN = { x0: (GARDEN.i0 - .5)*LOT + 1.1, x1: (GARDEN.i1 + .5)*LOT - 1.1, z0: (GARDEN.j0 - .5)*LOT + 1.1, z1: (GARDEN.j1 + .5)*LOT - 1.1 };
  const XW = [[[GC.x - 6.6, GC.z + 3.0], [GC.x - 6.6, GC.z - 6.4]], [[GC.x + 3.2, GC.z - 6.6], [GC.x - 5.0, GC.z - 6.6]]];   // (the garden extras' walks: no spot on them)
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], u = clamp01(((x - a[0])*dx + (z - a[1])*dz)/(dx*dx + dz*dz || 1)); return Math.hypot(a[0] + dx*u - x, a[1] + dz*u - z); };
  // how far above everything between it and the camera the line from a spot (at a person's head) runs; under zero, something is in the way
  const plotTop = (x, z) => { const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))); if (!c) return -1e9; if (c.mega) return 1e9; return c.height || 0; };
  function clearance(x, z, yaw, pitch){
    const sx = Math.sin(yaw), sz = Math.cos(yaw), k = Math.tan(pitch); let worst = 1e9;
    for (let r = .5; r < 60; r += .3){ const h = plotTop(x + sx*r, z + sz*r); if (h > -1e8) worst = Math.min(worst, CURB + 1.2 + r*k - h); }
    return worst;
  }
  function bestSpot(yaw, ok, score){
    let best = null;
    for (let x = LAWN.x0; x <= LAWN.x1; x += .5) for (let z = LAWN.z0; z <= LAWN.z1; z += .5){
      if (XW.some(([a, b]) => segD(x, z, a, b) < 1.4) || !ok(x, z)) continue;
      const c = clearance(x, z, yaw, GV.pitch); if (c < .8) continue;
      const v = Math.min(c, 6) + (score ? score(x, z) : 0); if (!best || v > best.v) best = { x, z, v, c };
    }
    return best;
  }
  const APTH = { p: null, pod: null, door: null, out: null };   // the second person's home: their pod and its street door
  F.pairs = null;
  function gardenCast(){
    const near = nearestPeople(GC.x, GC.z, 24);
    // the second person: someone with a pod of their own whose street door opens near the lawn
    let home = null;
    for (const p of near){ if (!p.pod) continue; const pl = places.get(p.home), d = pl && safe('door', () => STORY.streetDoor(pl)); if (!d || !d.wall || !d.inside) continue;
      const ox = d.wall.x - d.inside.x, oz = d.wall.z - d.inside.z, ol = Math.hypot(ox, oz) || 1, o = { x: ox/ol, z: oz/ol };
      const dist = Math.hypot(d.wall.x - GC.x, d.wall.z - GC.z); if (dist > 3.2*LOT) continue;
      if (!home || dist < home.dist) home = { p, d, o, dist }; }
    if (home){
      APTH.p = home.p; APTH.pod = home.p.pod; APTH.door = home.d; APTH.out = home.d.stand ? { x: home.d.stand.x, z: home.d.stand.z } : { x: home.d.wall.x + home.o.x*.9, z: home.d.wall.z + home.o.z*.9 };   // (where a resident stands to go in)
      GV.y2 = Math.atan2(home.o.x, home.o.z) + .45;   // (the camera on the side the door faces, a little round: the door seen three-quarters on)
      if (Math.abs(wrapA(GV.y2 - GV.y1)) < .7) GV.y2 = GV.y1 + Math.sign(wrapA(GV.y2 - GV.y1) || 1)*.7;   // (and a clear change of angle from the first)
    } else { warn('garden', 'nobody near the lawn with a pod and a street door: no apartment'); GV.y2 = GV.y1 - 1.1; }
    const s2 = bestSpot(GV.y2, () => true, home ? (x, z) => -.35*Math.hypot(x - APTH.out.x, z - APTH.out.z) : null);
    const s1 = s2 && bestSpot(GV.y1, (x, z) => Math.hypot(x - s2.x, z - s2.z) > 4.5);
    if (!s1 || !s2) return warn('garden', 'no spot on the lawn the camera can see');
    F.info.spots = [s1, s2].map(q => q.x.toFixed(1) + ',' + q.z.toFixed(1) + ' clear ' + q.c.toFixed(1));
    const others = near.filter(p => p !== (home && home.p));
    if (others.length < 3) return warn('garden', 'only ' + others.length + ' other people near the lawn');
    const A2 = home ? home.p : others[3];
    F.pairs = [[others[0], others[1], s1, 0], [A2, others[2], s2, 1]].map(([A, B, spot, k]) => {
      const ang = k ? 2.3 : -.6, ox = Math.cos(ang)*.38, oz = Math.sin(ang)*.38;   // the two of them face each other across the spot
      const posA = { x: spot.x - ox, z: spot.z - oz }, posB = { x: spot.x + ox, z: spot.z + oz };
      const from = (pos, s) => ({ x: pos.x + Math.cos(ang + s)*2.2, z: pos.z + Math.sin(ang + s)*2.2 });   // (walking in from either side of the lawn)
      // the second person, once they have talked: home along the footways to their door, and in
      let homeW = null;
      if (k === 1 && home){
        const way = routePts(posA.x, posA.z, APTH.out.x, APTH.out.z), L_ = pathLen(way), v = clamp(L_/(MK.door - .5 - MK.leave2), .45, 1.1);
        homeW = { way, L_, v, t0: MK.door - .5 - L_/v };
      }
      const role = (me, pos, other, first) => {
        const f0 = from(pos, first ? 2.6 : -.5), path = [{ t: GT.walkIn + (first ? 0 : .25), x: f0.x, z: f0.z }, { t: GT.there + (first ? 0 : .25), x: pos.x, z: pos.z }];
        return takePerson(me, t => {
          const ft = F.t, ph = me.phase || 0, a = along(path, ft);
          if (homeW && first && ft >= homeW.t0){   // going home
            if (ft < MK.door - .5){ const q = pointAt(homeW.way, (ft - homeW.t0)*homeW.v); return { x: q.x, y: CURB, z: q.z, frame: walkF(ft, ph, stride(homeW.v)), dx: q.dx, dz: q.dz }; }
            const u = seg(ft, MK.door - .5, MK.door), w = APTH.door.wall;
            return { x: lerp(APTH.out.x, w.x, u), y: CURB, z: lerp(APTH.out.z, w.z, u), frame: walkF(ft, ph, stride(.6)), dx: w.x - APTH.out.x, dz: w.z - APTH.out.z, alpha: 1 - ss((u - .25)/.75) };
          }
          if (homeW && !first && ft >= homeW.t0 - .4){   // the friend waves them off and watches them go
            const q = homeW && ft >= homeW.t0 ? pointAt(homeW.way, Math.min(homeW.L_, (ft - homeW.t0)*homeW.v)) : other;
            return { x: pos.x, y: CURB, z: pos.z, frame: ft < homeW.t0 + 1.4 ? talkF(ft, ph) : idleF(ft, ph), dx: q.x - pos.x, dz: q.z - pos.z };
          }
          if (a.moving) return { x: a.x, y: CURB, z: a.z, frame: walkF(ft, ph, stride(GW)), dx: a.dx, dz: a.dz };
          // they take turns talking, a couple of seconds each, facing each other
          const turn = Math.floor((ft - GT.there)/2.3) % 2 === (first ? 0 : 1);
          return { x: pos.x, y: CURB, z: pos.z, frame: turn && Math.floor(ft*.9 + ph) % 3 ? talkF(ft, ph) : idleF(ft, ph), dx: other.x - pos.x, dz: other.z - pos.z };
        });
      };
      role(A, posA, posB, true); role(B, posB, posA, false);
      return { A, B, spot, posA, homeW };
    });
    F.info.garden = F.pairs.map(q => q.A.id);
    say('garden cast', JSON.stringify(F.info.garden), JSON.stringify(F.info.spots), 'views', GV.y1.toFixed(2), GV.y2.toFixed(2), 'pod', APTH.pod);
  }
  // the person cam's log, filled in from what they say
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
  function brackets(x, y, z){
    if (x === undefined){ E.sel.style.display = 'none'; return; }
    _v.set(x, y + .42, z).project(cam);
    const sx = (_v.x + 1)/2*innerWidth, sy = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.sel.style.display = 'block'; E.sel.style.transform = `translate(${(sx - w/2).toFixed(1)}px,${(sy - h/2).toFixed(1)}px)`; E.sel.style.width = w.toFixed(0) + 'px'; E.sel.style.height = h.toFixed(0) + 'px';
  }

  /* ---------- paths along the city's own footways (worked out once the city is finished, so they go round what stands in the square) ---------- */
  function routePts(ax, az, bx, bz){
    const a = STORY.nearestNode(ax, az), b = STORY.nearestNode(bx, bz);
    const mid = a >= 0 && b >= 0 && a !== b ? route(a, b) : null;
    return [[ax, az]].concat(mid || [], [[bx, bz]]);
  }
  const nodeNear = (x, z) => { const n = STORY.nearestNode(x, z); return n >= 0 ? { x: NG.x[n], z: NG.z[n] } : { x, z }; };
  function pathLen(pts){ let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; }
  // the point a distance d along a path, and the way it's heading there
  function pointAt(pts, d){
    if (d <= 0) return { x: pts[0][0], z: pts[0][1], dx: (pts[1] || pts[0])[0] - pts[0][0], dz: (pts[1] || pts[0])[1] - pts[0][1] };
    for (let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l){ const u = l ? d/l : 0; return { x: lerp(a[0], b[0], u), z: lerp(a[1], b[1], u), dx: b[0] - a[0], dz: b[1] - a[1] }; } d -= l; }
    const a = pts[pts.length - 2] || pts[0], b = pts[pts.length - 1]; return { x: b[0], z: b[1], dx: b[0] - a[0], dz: b[1] - a[1] };
  }
  // how far along a path its point nearest (x, z) is
  function distNear(pts, x, z){ let best = 0, bd = Infinity, acc = 0;
    for (let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
      const u = clamp01(((x - a[0])*(b[0] - a[0]) + (z - a[1])*(b[1] - a[1]))/(l*l)), px = lerp(a[0], b[0], u), pz = lerp(a[1], b[1], u), d = Math.hypot(px - x, pz - z);
      if (d < bd){ bd = d; best = acc + u*l; } acc += l; }
    return best; }

  /* ---------- the extras: everyone else seen in a scripted scene, each on a planned walk or spot ---------- */
  // While a scene is on (from the dive into the garden to the end of the ride) nobody else is drawn at all (people.js PPL_ONLY): the
  // people in shot are these, the cast, and nothing the game decides.
  const EXTRAS = [];
  const lookAt = (p, st, react) => { const r = react && react(F.t, st); return r; };
  // walking back and forth along a path from t0; react(ft, st) can take over (to stop and look at something)
  function stroll(p, pts, t0, speed, react){
    const L_ = Math.max(.5, pathLen(pts)), st = { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
    takePerson(p, () => {
      const ft = F.t, ph = p.phase || 0, r = react && react(ft, st);
      if (r) return r;
      const d = Math.max(0, ft - t0)*speed, k = Math.floor(d/L_), u = d - k*L_, back = k % 2 === 1, q = pointAt(pts, back ? L_ - u : u);
      st.x = q.x; st.z = q.z; st.dx = back ? -q.dx : q.dx; st.dz = back ? -q.dz : q.dz;
      return { x: q.x, y: CURB, z: q.z, frame: walkF(ft, ph, stride(speed)), dx: st.dx, dz: st.dz };
    });
    EXTRAS.push(p); return p;
  }
  // standing at a spot facing a way, now and then talking
  function standAt(p, x, z, fx, fz, talk, react){
    const st = { x, z, dx: fx, dz: fz };
    takePerson(p, () => { const ft = F.t, ph = p.phase || 0, r = react && react(ft, st); if (r) return r;
      return { x, y: CURB, z, frame: talk && Math.floor(ft*.5 + ph) % 3 === 0 ? talkF(ft, ph) : idleF(ft, ph), dx: fx, dz: fz }; });
    EXTRAS.push(p); return p;
  }
  function releaseExtras(near){ for (let k = EXTRAS.length - 1; k >= 0; k--){ const p = EXTRAS[k]; if (near && !near(p)) continue; release(p); EXTRAS.splice(k, 1); } }
  // the garden: two strolling along its far edges and one standing about, well clear of the two pairs
  function gardenExtras(){
    const ex = nearestPeople(GC.x, GC.z, 3); if (ex.length < 3) return;
    stroll(ex[0], [[GC.x - 6.6, GC.z + 3.0], [GC.x - 6.6, GC.z - 6.4]], 14.3, .85).__area = 'garden';
    stroll(ex[1], [[GC.x + 3.2, GC.z - 6.6], [GC.x - 5.0, GC.z - 6.6]], 14.3, .8).__area = 'garden';
    standAt(ex[2], GC.x - 6.2, GC.z + 4.6, 1, -.4, false).__area = 'garden';
  }
  // a crowd round a point: walkers on footway routes between nodes of the area (back and forth, each at its own pace and start), and
  // groups standing talking; all from a fixed seed, so it plays the same every time. keepOff: points (with a radius) none may stand on or
  // cross (the main cast's marks, a lift's door); react: as for stroll
  function crowd(area, cx, cz, rad, nWalk, nGroups, seed, t0, keepOff, react){
    const Rn = mulberry32(seed), nodes = [];
    for (let k = 0; k < NG.x.length; k++) if (Math.hypot(NG.x[k] - cx, NG.z[k] - cz) < rad) nodes.push({ x: NG.x[k], z: NG.z[k] });
    if (nodes.length < 4) return 0;
    const clear = (x, z, pad = 0) => keepOff.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr + pad);
    const pool = nearestPeople(cx, cz, nWalk + nGroups*3 + 8); let used = 0, made = 0;
    for (let w = 0, tries = 0; w < nWalk && tries < nWalk*12 && used < pool.length; tries++){
      const a = nodes[Math.floor(Rn()*nodes.length)], b = nodes[Math.floor(Rn()*nodes.length)];
      if (Math.hypot(a.x - b.x, a.z - b.z) < rad*.6) continue;
      const pts = routePts(a.x, a.z, b.x, b.z), L_ = pathLen(pts); if (L_ < 4 || L_ > rad*3.5) continue;
      let ok = true; for (let d = 0; ok && d <= L_; d += .3){ const q = pointAt(pts, d); if (!clear(q.x, q.z)) ok = false; }
      if (!ok) continue;
      const sp = .38 + Rn()*.18; stroll(pool[used++], pts, t0 - Rn()*L_/sp, sp, react).__area = area; w++; made++;
    }
    for (let g = 0, tries = 0; g < nGroups && tries < nGroups*14 && used + 1 < pool.length; tries++){
      const c = nodes[Math.floor(Rn()*nodes.length)]; if (!clear(c.x, c.z, 1.2)) continue;
      const n = Rn() < .45 ? 3 : 2, a0 = Rn()*Math.PI*2;
      for (let k = 0; k < n && used < pool.length; k++){ const a = a0 + k*Math.PI*2/n, x = c.x + Math.cos(a)*.38, z = c.z + Math.sin(a)*.38;
        standAt(pool[used++], x, z, c.x - x, c.z - z, true, react).__area = area; made++; }
      g++;
    }
    return made;
  }
  // the square, busy: people crossing it every way and standing about in twos and threes (none on the mugging's marks); when it
  // happens, everyone stops and stares
  function squareExtras(react, marks){ F.info.squareCrowd = crowd('square', SC_.x, SC_.z, 10, 16, 6, 4401, 31, marks, react); }
  // along the passer-by's way to the station: people walking the streets both ways, never through the lift
  function stationExtras(cab, way){
    const mid = pointAt(way, pathLen(way)*.55);
    F.info.stationCrowd = crowd('station', mid.x, mid.z, 11, 10, 2, 5502, 38, [[cab.x, cab.z, 1.5]]);
  }

  /* ---------- the mugging, in the open middle of the town square ---------- */
  // fixed times (seconds into the film); the places come from the square's footways
  const MG = (o => { const k = MK.square - 33.5; for (const n in o) o[n] += k; return o; })({ walk0: 31, stop: 35.6, reach: 36.0, rob1: 37.6, alarm: 35.3, copsGo: 37.9, pass: 38.9 });   // (as they were with the camera in the square at 33.5)
  const VW = .5;   // the victim's walking speed (the game's own pace)
  const MUG = { victim: null, L: null, drone: null, cops: [], caught: 0, mx: SC_.x, mz: SC_.z };
  function muggingCast(){
    // the victim: across the square, west to east, stopping in the middle when the mugger comes at them
    const tc = { x: Math.sin(STREET.yaw), z: Math.cos(STREET.yaw) }, pp = { x: tc.z, z: -tc.x };   // (towards the camera; across the view)
    const MP = { x: SC_.x + tc.x*4, z: SC_.z + tc.z*4 };   // the open ground between the pavilion and the camera
    const va = nodeNear(MP.x - pp.x*7, MP.z - pp.z*7), vb = nodeNear(MP.x + pp.x*7, MP.z + pp.z*7);
    const vp = routePts(va.x, va.z, vb.x, vb.z), dC = distNear(vp, MP.x, MP.z), VSTOP = pointAt(vp, dC);
    // the mugger: out from the far side of the square (away from the camera), along the footway to them
    const m0 = nodeNear(VSTOP.x + pp.x*3.6 - tc.x*.8, VSTOP.z + pp.z*3.6 - tc.z*.8);   // (the mugger: from ahead of them, beside the pavilion, never behind it)
    const mp = routePts(m0.x, m0.z, VSTOP.x, VSTOP.z), mL = pathLen(mp), RUN_ = 1.7, hitD = Math.max(0, mL - .42), tStrike = MG.reach - hitD/RUN_;
    const MHIT = pointAt(mp, hitD);
    // the getaway: out of the square, away from the camera and the station
    const fe = nodeNear(MHIT.x + pp.x*11 - tc.x*3, MHIT.z + pp.z*11 - tc.z*3), flee = routePts(MHIT.x, MHIT.z, fe.x, fe.z), fL = pathLen(flee), FLEE_V = 1.6, fleeEnd = MG.rob1 + fL/FLEE_V;
    const v = nearestPeople(SC_.x, SC_.z, 1)[0];
    if (!v) return warn('mugging', 'nobody to cross the square');
    MUG.victim = v; MUG.VSTOP = VSTOP;
    takePerson(v, () => {
      const ft = F.t, ph = v.phase || 0;
      if (ft < MG.stop){ const d = dC - (MG.stop - ft)*VW, q = pointAt(vp, Math.max(0, d)); return { x: q.x, y: CURB, z: q.z, frame: d > 0 ? walkF(ft, ph, stride(VW)) : idleF(ft, ph), dx: q.dx, dz: q.dz }; }
      if (ft < MG.rob1 + .2) return { x: VSTOP.x, y: CURB, z: VSTOP.z, frame: idleF(ft, ph), dx: MHIT.x - VSTOP.x, dz: MHIT.z - VSTOP.z };   // frozen, facing the mugger
      const q = pointAt(vp, dC + (ft - MG.rob1 - .2)*1.0);   // then hurrying on the way they were going
      return { x: q.x, y: CURB, z: q.z, frame: walkF(ft, ph, 2), dx: q.dx, dz: q.dz };
    });

    const L = { key: 'film', cell: cells.get(ckey(SQ[1], SQ[2])), home: { x: m0.x, z: m0.z }, x: m0.x, z: m0.z, state: 'film', rare: false, until: 1e9, row: 10, flip: 1, phase: 3, fade: 0 };
    L.puppet = () => {
      const ft = F.t; let x, z, dx = 0, dz = 1, frame, alpha = 1, emo;
      if (ft < tStrike){ x = m0.x; z = m0.z; frame = idleF(ft, 3); dx = VSTOP.x - m0.x; dz = VSTOP.z - m0.z; }   // (loitering at the side of the square well before the camera gets there)
      else if (ft < MG.reach){ const q = pointAt(mp, (ft - tStrike)*RUN_); x = q.x; z = q.z; dx = q.dx; dz = q.dz; frame = runF(ft, 3); }
      else if (ft < MG.rob1){ x = MHIT.x; z = MHIT.z; dx = VSTOP.x - MHIT.x; dz = VSTOP.z - MHIT.z; frame = talkF(ft*1.2, 3); }   // the hold-up
      else if (ft < fleeEnd || !MUG.caught){ const q = pointAt(flee, Math.min(fL, (ft - MG.rob1)*FLEE_V)); x = q.x; z = q.z; dx = q.dx; dz = q.dz; frame = ft < fleeEnd ? runF(ft, 3) : idleF(ft, 3); }
      else { const q = pointAt(flee, fL); x = q.x; z = q.z; frame = idleF(ft, 3); emo = ft - MUG.caught < 2.5 ? EMO.sweat : undefined; }
      MUG.mx = x; MUG.mz = z;
      return { x, y: CURB, z, frame, dx, dz, alpha, emo };
    };
    lurkers.set('film', L); MUG.L = L;
    // two officers out of the police station after them, along the footways to where the mugger runs to; they have them when they get there
    const PS = MEGAS[1], door = nodeNear((PS[1] - .5)*LOT - .8, (PS[2] + 1)*LOT), end = pointAt(flee, fL);
    const cops = pplList.filter(p => p.cop && !p.onBike && !p.custody && !p.puppet).sort((a, b) => (a.x === undefined) - (b.x === undefined)).slice(0, 2);
    cops.forEach((c, k) => {
      const cp = routePts(door.x, door.z, end.x + (k ? .6 : -.6), end.z + (k ? .3 : -.3)), cL = pathLen(cp), V = 1.9, tGo = MG.copsGo + k*.35, tAt = tGo + cL/V;
      takePerson(c, () => {
        const ft = F.t;
        if (ft < tGo) return { x: door.x, y: CURB, z: door.z, frame: idleF(ft, k), alpha: 0 };   // (inside, until the alarm)
        if (ft < tAt){ const q = pointAt(cp, (ft - tGo)*V); return { x: q.x, y: CURB, z: q.z, frame: runF(ft, k*2), dx: q.dx, dz: q.dz, alpha: Math.min(1, (ft - tGo)/.4) }; }
        if (!MUG.caught && ft >= fleeEnd){ MUG.caught = ft; emote(c, 'bang', 2.2); say('caught at', ft.toFixed(2)); }
        const q = pointAt(cp, cL); return { x: q.x, y: CURB, z: q.z, frame: idleF(ft, k), dx: MUG.mx - q.x, dz: MUG.mz - q.z };
      });
    });
    MUG.cops = cops; F.info.cops = cops.map(c => c.id); if (cops.length < 2) warn('mugging', 'only ' + cops.length + ' officers in the city');
    MUG.MHIT = MHIT; F.info.mugging = { victim: v.id, strike: +tStrike.toFixed(2), flee: +fleeEnd.toFixed(2) };
    const marks = [[MHIT.x, MHIT.z, 1.6], [VSTOP.x, VSTOP.z, 1.6], [m0.x, m0.z, 1.0]]; for (let d = 0; d <= pathLen(vp); d += 1.2){ const q = pointAt(vp, d); marks.push([q.x, q.z, .7]); }
    squareExtras((ft, st) => {
      if (ft < tStrike + .4 || ft > MG.rob1 + 2.4 || Math.hypot(st.x - MHIT.x, st.z - MHIT.z) > 11) return null;
      if (!st.saw){ st.saw = true; }
      return { x: st.x, y: CURB, z: st.z, frame: F_IDLE + Math.floor(ft*2.5) % PPL.idle, dx: MUG.mx - st.x, dz: MUG.mz - st.z };
    }, marks);
    later(() => { for (const p of EXTRAS) if (p.__area === 'square') emote(p, 'bang', 1.4); }, 1);
    say('mugging cast', v.id, JSON.stringify(F.info.mugging));
  }
  // the drone: up from its pad when the alarm goes, over the square with its light on, red once it's on the mugger, keeping low over them
  function droneCast(){
    let d = null; for (const st of POLICE_STATIONS) for (const x of st.drones){ if (!d || Math.hypot(x.pos.x - SC_.x, x.pos.z - SC_.z) < Math.hypot(d.pos.x - SC_.x, d.pos.z - SC_.z)) d = x; }
    if (!d) return warn('drone', 'no police drone');
    const pos = (d._held || d.g.position).clone(), pad = pos.clone(); let red = 0, yawD = d.st.yaw;
    d.st.mode = 'fly'; d._still = false; d.g.visible = true;   // (the one drone allowed out while the scene is on)
    d.st.puppet = (dt, time) => {
      const ft = F.t;
      if (ft < MG.alarm) return { x: pad.x, y: pad.y, z: pad.z, yaw: yawD, light: 0, red: 0 };
      const cruise = Math.max(pad.y + 1.6, CURB + 7.5), low = CURB + 4.4;
      if (ft < MG.alarm + .8){ const u = ss((ft - MG.alarm)/.8); pos.set(pad.x, lerp(pad.y, cruise, u), pad.z); return { x: pos.x, y: pos.y, z: pos.z, yaw: yawD, light: 0, red: 0 }; }
      const tx = MUG.mx, tz = MUG.mz, hd = Math.hypot(tx - pos.x, tz - pos.z), want = hd > 6 ? cruise : lerp(low, cruise, hd/6);
      const sp = 7.5*Math.min(.1, dt);
      if (hd > .05){ const k = Math.min(1, sp/hd*(hd < 2.5 ? .45 : 1)); pos.x += (tx - pos.x)*k; pos.z += (tz - pos.z)*k; yawD += wrapA(Math.atan2(tx - pos.x, tz - pos.z) - yawD)*Math.min(1, dt*3); }
      pos.y += (want - pos.y)*Math.min(1, dt*2.5);
      const onIt = hd < 2.5 && ft > MG.reach;
      red = clamp01(red + (onIt ? dt*1.6 : -dt));
      return { x: pos.x, y: pos.y + Math.sin(time*2.3)*.04, z: pos.z, yaw: yawD, light: hd < 12 ? 1 : 0, red, aim: red > .5 ? { x: tx, z: tz } : null };
    };
    MUG.drone = d; F.info.drone = d.idx;
  }
  function muggingEnd(){
    if (MUG.drone){ const st = MUG.drone.st; st.puppet = null; st.mode = 'home'; st.target = null; st.climb = null; st.via = null; st.chase = null; }
    if (MUG.L) lurkers.delete('film');
    release(MUG.victim); for (const c of MUG.cops) release(c);
  }

  /* ---------- the passer-by: past the mugging, on to the station, up the lift, onto the train ---------- */
  const RD = { p: null, st: null, cab: null, T: null };
  const RIDE_V = 7.5, RIDE_A = 2.2;   // the train's speed and pick-up for the ride, world units a second (the game's own 2.8 looks parked from the side)
  const RT = { speed: 1.0, intoCab: .5, lift: 3.0, toPlat: 1.6, trainIn: 2.6, doorsOpen: .7, board: 1.0, wait: .6, close: .7 };
  function riderCast(){
    if (!LINE || !LINE.stn || !LINE.cabs) return warn('station', 'no metro');
    const P = mtPath(LINE), withCab = P.stops.map((s_, i) => ({ s: s_, i, st: LINE.stn.get(s_.k), cab: LINE.cabs.find(c => c.k === s_.k) }))
      .filter(o => o.st && o.cab && P.stops[o.i + 1] && P.stops[o.i + 1].s - o.s.s >= 7.5*LOT);
    const pick = withCab.sort((a, b) => Math.hypot(a.cab.x - SC_.x, a.cab.z - SC_.z) - Math.hypot(b.cab.x - SC_.x, b.cab.z - SC_.z))[0];
    F.info.stations = P.stops.map(s_ => ({ k: s_.k, lift: !!LINE.cabs.find(c => c.k === s_.k) }));
    if (!pick || !MUG.MHIT) return warn('station', 'no station with a lift by the square: ' + JSON.stringify(F.info.stations));
    const st = pick.st, cab = pick.cab;
    RD.st = st; RD.cab = cab;
    // past the hold-up on the camera's side of it, then on along the footways to the lift
    const H_ = MUG.MHIT, by = nodeNear(H_.x + (cab.x - H_.x)*.12, H_.z + (cab.z - H_.z)*.12 + .6);   // (a step towards the station from the hold-up)
    const ax = -(cab.z - H_.z), az = cab.x - H_.x, al = Math.hypot(ax, az) || 1, from = nodeNear(by.x + ax/al*5, by.z + az/al*5);   // (coming across it from the side)
    const leg1 = routePts(from.x, from.z, by.x, by.z), leg2 = routePts(by.x, by.z, cab.x, cab.z), pts = leg1.concat(leg2.slice(1));
    const dPass = pathLen(leg1), L_ = pathLen(pts), t0 = MG.pass - dPass/RT.speed;
    RD.way = pts;
    const top = mtW(st, st.side*MT_LIFT_OFF, 0), door = mtW(st, st.side*.62, 0), inn = mtW(st, st.side*.12, 0);
    const T = { start: t0 }; let tt = t0 + L_/RT.speed;
    T.atLift = tt; T.inCab = tt += RT.intoCab; T.atTop = tt += RT.lift; T.onPlat = tt += RT.toPlat;
    T.trainAt = T.onPlat - .2; T.trainFrom = T.trainAt - RT.trainIn; T.doorsOpen = T.trainAt + RT.doorsOpen; T.inTrain = T.doorsOpen + RT.board; T.close = T.inTrain + RT.wait; T.depart = T.close + RT.close;
    RD.T = T;
    { // the run to the next stop (the far end of the line): how long the train takes, so the sunset can be fitted to it
      const P = mtPath(LINE), si = P.stops.findIndex(s_ => s_.k === st.k), nx = Math.min(P.stops.length - 1, si + 1), D = P.stops[nx].s - P.stops[si].s;
      const ta = RIDE_V/RIDE_A, da = .5*RIDE_A*ta*ta, tRun = Math.max(0, (D - 2*da)/RIDE_V); RD.arrive = T.depart + 2*ta + tRun; F.info.ride = { from: T.depart.toFixed(1), to: RD.arrive.toFixed(1) }; }
    const yPlat = MT_Y + MT_PLAT_Y;
    const p = nearestPeople(from.x, from.z, 1)[0]; if (!p) return warn('station', 'nobody to ride');
    RD.p = takePerson(p, () => {
      const ft = F.t, ph = p.phase || 0;
      if (ft < T.atLift){ const q = pointAt(pts, Math.max(0, (ft - t0)*RT.speed)); return { x: q.x, y: CURB, z: q.z, frame: ft < t0 ? idleF(ft, ph) : walkF(ft, ph, 2), dx: q.dx, dz: q.dz }; }
      if (ft < T.atTop){ const u = ss(seg(ft, T.inCab, T.atTop)); return { x: cab.x, y: lerp(CURB, yPlat, u) + .02, z: cab.z, frame: idleF(ft, ph), dx: door[0] - cab.x, dz: door[1] - cab.z }; }   // in the cab, going up
      if (ft < T.onPlat){ const u = seg(ft, T.atTop, T.onPlat); return { x: lerp(top[0], door[0], u), y: yPlat, z: lerp(top[1], door[1], u), frame: walkF(ft, ph), dx: door[0] - top[0], dz: door[1] - top[1] }; }
      if (ft < T.doorsOpen) return { x: door[0], y: yPlat, z: door[1], frame: idleF(ft, ph), dx: inn[0] - door[0], dz: inn[1] - door[1] };   // the train pulls in
      if (ft < T.inTrain){ const u = seg(ft, T.doorsOpen, T.inTrain); return { x: lerp(door[0], inn[0], u), y: yPlat, z: lerp(door[1], inn[1], u), frame: walkF(ft, ph), dx: inn[0] - door[0], dz: inn[1] - door[1], alpha: 1 - ss((u - .45)/.55) }; }
      return { x: inn[0], y: yPlat, z: inn[1], frame: idleF(ft, ph), alpha: 0 };   // aboard
    });
    F.info.rider = { id: p.id, start: +t0.toFixed(1), lift: +T.inCab.toFixed(1), train: +T.trainAt.toFixed(1), departs: +T.depart.toFixed(1) };
    say('rider cast', JSON.stringify(F.info.rider));
  }
  // the lift cab and the train, run by the film: the cab goes up with them; the train comes in, waits with its doors open, leaves
  const _um = updateMetros;
  updateMetros = function (dt, t){
    const T = RD.T, tr = LINE && LINE.train, ft = F.t;
    if (F.playing && tr && !T && F.t > 13) safe('park', () => { const P = mtPath(LINE), s0 = P.stops[0].s; tr.s = s0; tr.at = 0; tr.next = 0; tr.v = 0; tr.dwell = 50; tr.stopT = -.5; tr.fresh = false; });   // (parked at the west end, doors shut: stopT below zero, the game's door clock never starts)
    if (F.playing && T && tr) safe('train', () => {
      const P = mtPath(LINE), si = P.stops.findIndex(s => s.k === RD.st.k); if (si < 0) return;
      const s0 = P.stops[si].s;
      if (ft < T.trainAt){ tr.s = s0; tr.at = si; tr.next = si; tr.v = 0; tr.dwell = 50; tr.stopT = -.5; }   // waiting at the platform, doors shut
      else if (ft < T.close){ if (!(tr.dwell > 0) || tr.stopT < 0) tr.stopT = 0; tr.s = s0; tr.at = si; tr.next = si; tr.v = 0; tr.dwell = 50; }   // stopped, doors opening and open
      else if (ft < T.depart){ tr.s = s0; tr.at = si; tr.v = 0; tr.dwell = Math.max(.001, .7 - (ft - T.close)); }   // doors closing
      else { const nx = Math.min(P.stops.length - 1, si + 1), s1 = P.stops[nx].s, D = s1 - s0, A = RIDE_A, V = RIDE_V, ta = V/A, da = .5*A*ta*ta;
        // accelerate, run, brake into the next station (a trapezoid: the same easing as the game's own trains)
        const tRun = Math.max(0, (D - 2*da)/V), tAll = 2*ta + tRun, u = Math.min(ft - T.depart, tAll);
        const s = u < ta ? .5*A*u*u : u < ta + tRun ? da + V*(u - ta) : D - .5*A*(tAll - u)*(tAll - u);
        if (ft < RD.arrive){ tr.dwell = 0; tr.dir = 1; tr.at = si; tr.next = nx; tr.v = 0; tr.s = s0 + s; }
        else { if (!(tr.dwell > 0)) tr.stopT = 0; tr.s = s1; tr.at = nx; tr.next = nx; tr.v = 0; tr.dwell = 50; } }
    });
    const r = _um(dt, t);
    if (F.playing && T && RD.cab) safe('cab', () => { const c = RD.cab;
      const y = ft < T.inCab ? c.y0 : ft < T.atTop ? lerp(c.y0, c.y1, ss(seg(ft, T.inCab, T.atTop))) : ft < T.atTop + 2 ? c.y1 : lerp(c.y1, c.y0, ss(seg(ft, T.atTop + 2, T.atTop + 5)));
      c.y = y; c.g.position.y = y; });
    return r;
  }

  /* ---------- the camera: set outright every frame ---------- */
  const CAM = { x: GC.x, y: TARGET_Y, z: GC.z, yaw: .55, zoom: 8, pitch: 40*DEG };
  const STREET = { yaw: Math.PI, pitch: 38*DEG, zoom: 8.6 };   // (from the south-west, the track side, looking in over the square towards the city)   // the game's own close view, from the track side
  const SIDE = { yaw: Math.PI, pitch: 11*DEG, zoom: 9.5 };            // the metro, side on and low
  const PH = { name: 'build', t0: 0, from: null };
  const phase = (name, t) => { PH.name = name; PH.t0 = t; PH.from = Object.assign({}, CAM); say('phase', name, 'at', t.toFixed(2)); };
  let gview = null; const SM = {};
  const smooth = (key, v, k, dt) => { if (SM[key] === undefined) SM[key] = v; SM[key] = follow(SM[key], v, k, dt); return SM[key]; };
  const buildCam = t => { const u = ease(seg(t, .3, MK.built + .6));
    return { x: GC.x, y: TARGET_Y, z: GC.z, yaw: .55 + .62*ss(t/MK.dive), zoom: elerp(8, 31, u), pitch: lerp(40, 34, u)*DEG }; };
  const who = t => t < MK.p[1] ? 0 : 1;
  const trainPos = () => { const cp = LINE && LINE.train && LINE.train.cp && LINE.train.cp[1]; return cp ? { x: cp[0], y: cp[1], z: cp[2] } : null; };
  function camAt(t, dt){
    window.FILM_SH_HALF = t < MK.dive ? 150 : 0;
    if (t < MK.dive){ Object.assign(CAM, buildCam(t)); }
    else if (t < MK.garden){   // into the garden, on the first person; the view turns for the second and follows them home; held there while the apartment is open
      if (t >= MK.open && F.homeCam){ Object.assign(CAM, F.homeCam); }
      else {
        const a = buildCam(MK.dive), u = ease(seg(t, MK.dive, MK.p[0]));
        const q = F.pairs ? F.pairs[who(t)] : null, p = q && q.A, tx = p && p.x !== undefined ? p.x : q ? q.posA.x : GC.x, tz = p && p.x !== undefined ? p.z : q ? q.posA.z : GC.z;
        const sx = smooth('gx', tx, t < MK.p[0] ? 8 : 2.2, dt), sz = smooth('gz', tz, t < MK.p[0] ? 8 : 2.2, dt);
        const gy = GV.y1 + wrapA((GV.y2 ?? GV.y1) - GV.y1)*ease(seg(t, MK.p[1] - .3, MK.p[1] + 2.2));   // (the turn to the second view, as the camera moves over to them)
        Object.assign(CAM, { x: lerp(a.x, sx, u), z: lerp(a.z, sz, u), y: lerp(TARGET_Y, CURB + .5, u), yaw: a.yaw + wrapA(gy - a.yaw)*u, zoom: elerp(a.zoom, 4.4, u), pitch: lerp(a.pitch, GV.pitch, u) });
        if (t >= MK.door - .05) F.homeCam = Object.assign({}, CAM);
      }
    }
    else if (PH.name === 'square'){   // across town to the square (the camera lifts a little over the roofs on the way); then on the victim as they cross, the mugger, the drone, the officers
      const lin = seg(t, PH.t0, MK.square), u = ease(lin), v = MUG.victim;
      let tx = SC_.x, tz = SC_.z, ty = CURB + .5, need = STREET.zoom;
      if (t < MG.strike && v && v.x !== undefined){ tx = lerp(SC_.x, v.x, .5); tz = lerp(SC_.z, v.z, .5); }
      else if (MUG.L){ tx = MUG.mx; tz = MUG.mz;
        const d = MUG.drone && MUG.drone.g.position;
        if (d && t > MG.alarm + 1){ const w = clamp01(1.2 - Math.hypot(d.x - tx, d.z - tz)/14); tx = lerp(tx, d.x, .25*w); tz = lerp(tz, d.z, .25*w); ty = lerp(ty, d.y, .25*w); need = Math.max(need, (d.y - CURB)*Math.cos(STREET.pitch)*.62 + 3.6); }
        for (const c of MUG.cops) if (c.x !== undefined && t > MG.copsGo + .5) need = Math.max(need, Math.min(14, Math.hypot(c.x - MUG.mx, c.z - MUG.mz)*.55 + 3.8)); }
      const g = { x: smooth('sx', tx, 2.2, dt), y: smooth('sy', ty, 2.2, dt), z: smooth('sz', tz, 2.2, dt), zoom: smooth('szm', Math.min(14, need), 1.4, dt) };
      Object.assign(CAM, lerpPose(PH.from, Object.assign({ yaw: STREET.yaw, pitch: STREET.pitch }, g), u));
      CAM.zoom *= 1 + 1.6*Math.sin(Math.PI*ss(lin));
    }
    else if (PH.name === 'rider'){   // with the rider: the walk, the lift, the platform, onto the train
      const u = ease(seg(t, PH.t0, PH.t0 + 2.6)), p = RD.p, tp = p && p.x !== undefined ? { x: p.x, y: (p._ey ?? CURB) + .4, z: p.z } : { x: CAM.x, y: CAM.y, z: CAM.z };
      Object.assign(CAM, lerpPose(PH.from, { x: smooth('rx', tp.x, 3, dt), y: smooth('ry', tp.y, 3, dt), z: smooth('rz', tp.z, 3, dt), yaw: STREET.yaw, pitch: 35*DEG, zoom: 7.8 }, u));
    }
    else if (PH.name === 'side'){   // the train, side on, low, followed as it pulls away and night falls
      const u = ease(seg(t, PH.t0, PH.t0 + 2.2)), tp = trainPos() || { x: CAM.x, y: MT_Y + .5, z: MT_J*LOT };
      Object.assign(CAM, lerpPose(PH.from, { x: smooth('tx', tp.x, 4, dt), y: smooth('ty', tp.y, 4, dt), z: smooth('tz', tp.z, 4, dt), yaw: SIDE.yaw, pitch: SIDE.pitch, zoom: SIDE.zoom }, u));
    }
    else if (PH.name === 'out' || PH.name === 'title'){   // back over the city
      if (!F.outFrom) F.outFrom = Object.assign({}, CAM);
      const a = F.outFrom, v = ease(seg(t, F.outT0, F.outT0 + DUR.out)), w = seg(t, F.outT0, F.outT0 + DUR.out + DUR.title);
      Object.assign(CAM, { x: lerp(a.x, GC.x + 1.5*LOT, v), y: lerp(a.y, TARGET_Y, v), z: lerp(a.z, GC.z + 1.5*LOT, v), yaw: a.yaw - .5*v - .08*w, zoom: elerp(a.zoom, 27, v), pitch: lerp(a.pitch, 31*DEG, v) });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // The hour is held still wherever the city is seen in daylight (a moving sun moves every shadow): morning through the build, the garden and the
  // walk home; while the apartment is on screen it becomes golden hour, which holds through the square and the station; then over the train's
  // whole run to the far end of the line the sun goes down and night comes on, with the rain
  const H = { morning: 10.0, golden: 17.2, night: 22.2 };
  function hourAt(t){
    if (t < MK.unroom) return H.morning;   // (the morning held still through the build, the garden and the apartment)
    const T = RD.T, dep = T ? T.depart : MG.pass + 14, arr = RD.arrive || dep + 16;
    if (t < dep) return H.golden;   // (golden hour from the moment the hologram starts back out of the apartment, behind it, held to the train)
    return lerp(H.golden, H.night, ss(seg(t, dep + .4, arr - .2)));
  }
  function lightsAt(t){
    if (PH.name === 'side') return t > PH.t0 + 2 ? 0 : null;
    if (PH.name === 'out' || PH.name === 'title') return clamp01((t - F.outT0 - DUR.lightsIn)*LIGHTS_RATE);
    return null;
  }
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (F.playing) safe('frame', () => {
      F.t = clock();
      S.hour = hourAt(F.t);
      const lv = lightsAt(F.t); if (lv !== null) LIGHTS_ON.value = lv;
      camAt(F.t, dt);
    });
    return _uc(dt);
  };
  // the station's own answer to a mugging (a drone after the game's own muggers, and the bikes) stays out of the film
  let alertOff = false;
  function quietAlert(){ if (alertOff || !policeDroneAlert) return; policeDroneAlert = () => false; alertOff = true; }

  /* ---------- the apartment: the second person's pod, in Furnish pod ---------- */
  // The lab (furnish.html in its own frame) plays its hologram fly-in from the game's view down into the pod; here its clock is the film's
  // (PodContext._debug.hold sets the hologram's time each frame), and where the lab still has work to do (the city sent over, the home
  // built, its light baked) the film waits for it (F.held) rather than letting the hologram wait on screen. Then a couch, a floor lamp and a
  // plant are set down, and the same hologram plays backwards, out of the pod and up to the game's view as it was left, where the city
  // takes over again.
  const AP = { on: false, pick: {}, drops: [], done: new Set(), closed: false, heldN: 0, rev: false };
  const labWin = () => { const f = FURN.frame; return f && f.contentWindow; };
  const labPC = () => { const w = labWin(); return w && w.PodContext; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  function labClean(){   // only the lab's 3D view shows: its bars, labels and notes go
    const w = labWin(); if (!w || !w.document || !w.document.head) return;
    const d = w.document;
    if (!d.getElementById('flLab')){ const st = d.createElement('style'); st.id = 'flLab'; st.textContent = 'body *{visibility:hidden!important}.fl-vis{visibility:visible!important}*{cursor:none!important;transition:none!important}'; d.head.appendChild(st); }
    const big = w.innerWidth*w.innerHeight*.45;
    for (const cv of d.querySelectorAll('canvas')){ const r = cv.getBoundingClientRect(); cv.classList.toggle('fl-vis', r.width*r.height > big); }
  }
  function labSharp(){   // the city round the apartment drawn sharp (the lab's depth-of-field blur taken to nothing, its haze thinned)
    const B = labB(); if (!B || !B.dr || B.dr._flSharp) return;
    const R = B.dr, render = R.render.bind(R); R._flSharp = true;
    R.render = (sc, c) => { const m = sc && sc.children && sc.children[0] && sc.children[0].material, u = m && m.uniforms;
      if (u && u.kMin && u.range && u.hazeK){ u.kMin.value = 0; u.range.value = 1e6; u.hazeK.value = Math.min(u.hazeK.value, .25); }
      return render(sc, c); };
  }
  // a point in the room to the lab's canvas (its camera's view and projection by hand: the frame runs its own three.js)
  function labScreen(B, x, y, z){
    const V = B.cam.matrixWorldInverse.elements, P = B.cam.projectionMatrix.elements;
    const ex = V[0]*x + V[4]*y + V[8]*z + V[12], ey = V[1]*x + V[5]*y + V[9]*z + V[13], ez = V[2]*x + V[6]*y + V[10]*z + V[14], ew = V[3]*x + V[7]*y + V[11]*z + V[15];
    const cx = P[0]*ex + P[4]*ey + P[8]*ez + P[12]*ew, cy = P[1]*ex + P[5]*ey + P[9]*ez + P[13]*ew, cw = P[3]*ex + P[7]*ey + P[11]*ez + P[15]*ew;
    const w = labWin(), cv = w.document.getElementById('bCanvas') || w.document.querySelector('canvas.fl-vis') || w.document.querySelector('canvas');
    const r = cv.getBoundingClientRect(); return { cv, x: r.left + (cx/cw + 1)/2*r.width, y: r.top + (1 - cy/cw)/2*r.height };
  }
  // set something down the way a player does: pick it, point at the spot, click (null if it would not go there)
  function labPlace(arch, seed, wx, wy, wz){
    const w = labWin(), B = labB(); if (!w || !B) return null;
    const before = new Set(B.inst.keys());
    w.PodBuilder.startPlace(arch, seed);
    const s_ = labScreen(B, wx, wy, wz), o = { clientX: s_.x, clientY: s_.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    s_.cv.dispatchEvent(new w.PointerEvent('pointermove', Object.assign({ button: -1, buttons: 0 }, o)));
    try { if (w.PodBuilder._B.place) w.PodBuilder._B.ptr.dirty = true; } catch (e) {}
    s_.cv.dispatchEvent(new w.PointerEvent('pointerdown', Object.assign({ button: 0, buttons: 1 }, o)));
    s_.cv.dispatchEvent(new w.PointerEvent('pointerup', Object.assign({ button: 0, buttons: 0 }, o)));
    if (B.place) safe('cancel place', () => w.PodBuilder.cancel());
    safe('deselect', () => w.PodBuilder.select(null));
    const id = [...B.inst.keys()].find(k => !before.has(k));
    return id !== undefined ? B.inst.get(id) : null;
  }
  // the three pieces are the room's own, in the places its layout gave them (so nothing is dumped in the middle or into something else): a couch
  // (or failing that a bed or a chair), a light, a plant (or failing that a storage piece or a table). Hidden while the hologram covers the room,
  // then set down one after another
  const CATS = {
    couch: [['modular', 'futon', 'retro', 'pallet', 'corner', 'carseat', 'cloud'], ['cryo', 'container', 'bunks', 'suspended', 'murphy', 'netrunner', 'hover', 'platform', 'capsule', 'loft', 'floorbed'], ['lounge', 'shell', 'gamer', 'floorseat', 'folding', 'barstool', 'cratestool']],
    light: [['floorlamp', 'lamp', 'pendant', 'tube', 'neon', 'stringlights']],
    plant: [['monstera', 'fern', 'snake', 'bamboo', 'bonsai', 'hydro', 'hanging'], ['rack', 'cubby', 'locker', 'dresser', 'crateshelf', 'server', 'wardrobe'], ['slab', 'crate', 'spool', 'holo', 'loop', 'block', 'cafe', 'kotatsu', 'fold', 'bar', 'drum']] };
  const DROP = { couch: .45, light: 1.85, plant: 3.25 };   // (seconds into the furnishing)
  function labPick(B){
    const all = [...B.inst.values()].filter(i => i.pivot && i.rec && !i.rec.parent && i.pivot.visible), used = new Set();
    const size = i => i.lbox ? (i.lbox.max.x - i.lbox.min.x)*(i.lbox.max.z - i.lbox.min.z) : 0;
    for (const k in CATS) for (const archs of CATS[k]){
      const c = all.filter(i => !used.has(i) && archs.includes(i.rec.arch)).sort((a, b) => size(b) - size(a))[0];
      if (c){ used.add(c); AP.pick[k] = { i: c, y: c.pivot.position.y }; c.pivot.visible = false; break; } }
    F.info.apt = Object.keys(CATS).map(k => k + ':' + (AP.pick[k] ? AP.pick[k].i.rec.arch : 'none')).join(' ');
  }
  function aptOpen(){
    if (!APTH.pod){ warn('apartment', 'no pod'); return; }
    AP.on = !!safe('open', () => FURN.openKey(APTH.pod));
    if (!AP.on) warn('apartment', 'did not open ' + APTH.pod); else say('apartment', APTH.pod);
  }
  // waiting on the lab: the home still being built, or its light not baked yet
  function labLightWait(){
    const w = labWin(); if (!w) return false;
    try { const PB = w.PodBuilder, PR = w.PodRender, PC = w.PodContext, building = !!(PB && PB.homePending && PB.homePending());
      if (building) return 'build'; if (PB && PB.prOn && PB.prOn()) return !(PC._prDriving && PC._prDriving()) || (PR && PR.lightPending && PR.lightPending()) ? 'light' : false; } catch (e) {}
    return false;
  }
  function aptTick(t){
    F.held = false;
    if (!AP.on || AP.closed || t < MK.open) return;
    const ov = document.getElementById('furnish'), fr = FURN.frame, PC = labPC(), B = labB();
    if (!fr || !PC || !PC._debug) return aptEnd('the lab went away');
    safe('lab', labClean); safe('sharp', labSharp);
    if (B) B.needs = true;
    const D_ = PC._debug.DUR || 3.05, st = PC._debug.state(), live = ov && ov.classList.contains('live');
    const wait = why => { if (++AP.heldN > 60*90){ if (AP.heldN === 60*90 + 1) warn('apartment', 'waited 90 s for the lab (' + why + '): going on'); return false; } F.held = true; F.info.aptWait = why; return true; };
    if (t < MK.room){   // the hologram flies in
      const u = (t - MK.open)/APT.holo*D_;
      if (!live && wait('the hologram')) return;
      if (st && st.trans){
        const lw = u >= 1.7 ? labLightWait() : false;
        st.trans.holding = !!lw; st.trans.holdBuild = lw === 'build';   // (so the lab draws the room under the hologram and can bake its light)
        if (u >= .55 && !(st.ready && st.shown && !st.pendingHome) && wait('the city')) return;
        if (lw && wait(lw)) return;
        PC._debug.hold(u);
      }
      if (u >= 2.0 && B && !AP.picked){ AP.picked = true; safe('pick', () => labPick(B)); }
      fr.style.opacity = String(ss((t - MK.open)/.3));
      return;
    }
    if (t < MK.unroom){   // the furnishing
      if (st && st.trans){ PC._debug.hold(D_ + .01); return; }   // (the hologram ends with its next frame)
      if (PC.transitioning && wait('the hologram to end')) return;
      fr.style.opacity = '1';
      const k = t - MK.room;
      for (const c of ['couch', 'light', 'plant']) if (k >= DROP[c] && !AP.done.has(c) && B){ AP.done.add(c);
        const q = AP.pick[c]; if (q) AP.drops.push({ i: q.i, y: q.y, t }); }
      for (const d of AP.drops){   // lowered into its place, settling softly
        const u = (t - d.t)/.75; d.i.pivot.visible = u >= 0; if (u < 0) continue;
        const v = Math.min(1, u), e = 1 - Math.pow(1 - v, 3);
        d.i.pivot.position.y = d.y + .45*(1 - e);
      }
      return;
    }
    if (t < MK.back){   // the hologram flies back out, to the game's view as it was left
      for (const d of AP.drops){ d.i.pivot.visible = true; d.i.pivot.position.y = d.y; }
      if (!AP.rev){ AP.rev = true;
        if (st && !st.trans){ st.trans = { t0: performance.now(), vt: D_, last: performance.now(), drift: 0, gate: false, rm: false, frames: [], onDone: null, resolve(){}, skipped: false, lhDone: true, hold: D_ }; PC.transitioning = true; }
        FURN.hold = false;   // (the city is drawn again underneath, from the camera where it was left)
      }
      if (st && st.trans){ st.trans.holding = false; PC._debug.hold(Math.max(0, D_*(1 - (t - MK.unroom)/APT.back))); }
      return;
    }
    if (t < MK.garden){ if (st && st.trans) PC._debug.hold(0); fr.style.opacity = String(1 - ss(seg(t, MK.back, MK.garden))); return; }   // and the city again
    aptEnd();
  }
  function aptEnd(why){
    if (AP.closed) return; AP.closed = true; F.held = false;
    if (why) warn('apartment', why);
    safe('close', () => { const PC = labPC(), st = PC && PC._debug && PC._debug.state(); if (st && st.trans){ st.trans = null; PC.transitioning = false; }
      const ov = document.getElementById('furnish'); if (ov) ov.classList.remove('live');   // (so it goes at once, without the game's own power-down)
      FURN.close(); if (FURN.frame) FURN.frame.style.opacity = ''; });
  }

  /* ---------- the timeline ---------- */
  const EV = []; let fired = 0, t0 = 0, lastT = 0;
  const at = (t, f, name) => EV.push({ t, f, name });
  for (const s of BUILD) at(s.t, () => step(s), s.kind);
  for (const tm of [3, 5.5, 8.5, 12.5]) at(tm, () => { syncPeopleRest(); F.info['people@' + tm] = pplList.length; }, 'people move in');
  at(14.2, () => { gardenCast(); gardenExtras(); window.PPL_ONLY = true; }, 'the garden pairs');
  MK.p.forEach((t0_, k) => {
    at(t0_ + .1, () => { if (!F.pairs) return; MON.open(F.pairs[k].A.id); keep(document.getElementById('monitor'), true); monTab('log'); }, 'person cam ' + (k + 1));
    [.6, 1.8, 3.0, 4.3].forEach((d, s) => at(t0_ + d, () => { if (F.pairs) revealStep(k, s); }, 'reveal ' + (k + 1) + '.' + (s + 1)));
  });
  // the square's cast is put in place while the apartment still covers the screen (nobody appears out of nothing once the camera can see them)
  at(MK.back - .3, () => muggingCast(), 'the square: victim, mugger, officers');
  at(MK.back - .25, () => droneCast(), 'the drone');
  at(MK.back - .2, () => { riderCast(); if (RD.cab && RD.way) stationExtras(RD.cab, RD.way); }, 'the passer-by');
  at(MK.open, () => aptOpen(), 'the apartment');
  at(MK.garden, () => { E.sel.style.display = 'none'; phase('square', MK.garden); }, 'to the square');
  at(MK.door, () => { const m = document.getElementById('monitor'); keep(m, false); MON.close(); if (m) m.style.opacity = ''; }, 'the person cam closes');
  at(MK.square + 1.5, () => { if (F.pairs) for (const q of F.pairs){ release(q.A); release(q.B); } releaseExtras(p => p.__area === 'garden'); }, 'the garden lets go');   // (once the camera is well away)
  at(MG.stop, () => { if (MUG.victim) emote(MUG.victim, 'bang', 1.6); }, 'the victim sees him');
  at(MG.reach + .4, () => { for (const p of EXTRAS) if (p.__area === 'square') emote(p, 'bang', 1.6); }, 'the square sees it');
  at(MG.pass - .4, () => phase('rider', MG.pass - .4), 'with the passer-by');
  EV.sort((a, b) => a.t - b.t);

  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  F.len = 0;
  function paint(t){
    const tt = PH.name === 'title' ? t - PH.t0 : -1, end = tt >= 0 && tt > DUR.title - .8;
    const black = t < 1 ? 1 - ss(t) : end ? ss((tt - (DUR.title - .8))/.8) : tt >= 0 ? .4*ss(tt/1.4) : 0;
    E.black.style.opacity = String(black);
    if (t >= MK.door - .6 && t < MK.door){ const m = document.getElementById('monitor'); if (m) m.style.opacity = String(1 - ss((t - MK.door + .6)/.55)); }
    if (E.tNeon){ E.tNeon.style.opacity = String(tt > .5 ? neonAt(tt - .5) : 0); E.tTerr.style.opacity = String(tt > .9 ? neonAt(tt - .9) : 0); }
  }
  // the film's clock: wall time since it started, less the time it was held (F.held: the recorder steps on without taking pictures)
  let heldMs = 0, lastRaw = -1;
  const clock = () => { const raw = performance.now(); if (lastRaw >= 0 && raw !== lastRaw && F.held) heldMs += raw - lastRaw; lastRaw = raw; return (raw - t0 - heldMs)/1000; };
  function tick(){
    requestAnimationFrame(tick);
    if (!F.playing) return;
    const t = clock(); lastT = t; F.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); }
    if (t > 4) quietAlert();
    safe('apartment', () => aptTick(t));
    // the square is let go once the passer-by is up in the lift and it is out of shot (anyone let go earlier would vanish from the picture: PPL_ONLY)
    if (RD.T && !F.sqDone && t > RD.T.inCab + 1){ F.sqDone = true; safe('the square lets go', () => { muggingEnd(); releaseExtras(p => p.__area === 'square'); }); }
    if (window.PPL_ONLY) safe('only', () => {
      for (const st of POLICE_STATIONS) for (const d of st.drones) if (!d.st.puppet){ if (!d._held){ d._held = d.g.position.clone(); } const h = d._held; d.st.puppet = () => ({ x: h.x, y: h.y, z: h.z, light: 0, red: 0 }); d._still = true; d.g.visible = false; }
      if (typeof POLICE_BIKES !== 'undefined') for (const b of POLICE_BIKES) if (b.spr) b.spr.visible = !b.rider; });
    paint(t);
    if (t >= MK.p[0] && t < MK.door - .6 && F.pairs){ const p = F.pairs[who(t)].A; brackets(p.x, p._ey ?? CURB, p.z); }
    else if (E.sel.style.display !== 'none') E.sel.style.display = 'none';
    if (PH.name === 'side' && RD.T && RD.arrive && !F.rain && t > lerp(RD.T.depart, RD.arrive, .45)){ F.rain = true; LK.wx.fadeSec = 6; LK.setWeather('rain', false, true); }   // (the rain coming in as the light goes)
    if (PH.name === 'rider' && RD.T && t > RD.T.depart + .3) phase('side', t);
    else if (PH.name === 'rider' && !RD.T && t > PH.t0 + 3) phase('side', t);   // (no station: straight on)
    else if (PH.name === 'side' && t > (RD.arrive ? RD.arrive + .5 : PH.t0 + 16)){   /* (the whole run, into the far end's station) */ F.outT0 = t; phase('out', t); release(RD.p); releaseExtras();
      window.PPL_ONLY = false; for (const st of POLICE_STATIONS) for (const d of st.drones) if (d._still){ d._still = false; d.st.puppet = null; d.g.visible = true; d.st.mode = 'home'; d.st.target = null; } }
    else if (PH.name === 'out' && t > F.outT0 + DUR.out){ phase('title', t); }
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
    status('waking the apartment lab');
    safe('lab', () => FURN.preload());
    await until(() => FURN.warmed() && FURN.frame && FURN.ready, 300).catch(e => warn('apartment lab', e));
    await wait(.5);
    safe('cam', () => camAt(0, 0));
    await wait(1);
    F.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ E.ov.classList.add('ask'); E.status.innerHTML = 'click to play<br><small>about 85 s, no sound</small>'; E.ov.addEventListener('click', go, { once: true }); }
    say('ready');
  }
  function go(){ E.ov.classList.remove('ask'); E.msg.hidden = true; F.playing = true; F.done = false; fired = 0; t0 = performance.now(); heldMs = 0; lastRaw = -1; F.held = false; lastT = 0; F.t = 0; say('rolling'); }
  F.start = () => { if (!F.ready || F.playing) return false; go(); return true; };
  F.__dbg = () => {
    const d = q => !q ? '-' : (q.x === undefined ? '?' : q.x.toFixed(1) + ',' + q.z.toFixed(1)) + (q.puppet ? ' puppet' : '') + ' y' + (q._ey ?? 0).toFixed(1);
    const tr = LINE && LINE.train;
    return { pairs: F.pairs ? F.pairs.map(q => ({ A: d(q.A), B: d(q.B) })) : null, victim: d(MUG.victim), mugger: MUG.L ? MUG.mx.toFixed(1) + ',' + MUG.mz.toFixed(1) + ' f' + (MUG.L.fade || 0).toFixed(2) : null,
      drone: MUG.drone ? MUG.drone.g.position.toArray().map(v => +v.toFixed(1)).join(',') + ' red' + (MUG.drone.st.redOn || 0).toFixed(2) : null, cops: MUG.cops.map(d), caught: MUG.caught,
      rider: d(RD.p), train: tr ? { s: +tr.s.toFixed(1), dwell: +tr.dwell.toFixed(1), doors: +tr.doors.toFixed(2) } : null };
  };
  F.state = () => ({ ready: F.ready, playing: F.playing, done: F.done, held: !!F.held, t: F.t, stage: F.stage, phase: PH.name, info: F.info, log: F.log.slice(-30) });
  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); F.failed = String(e && e.message || e); });
  });
  return F;
})();
