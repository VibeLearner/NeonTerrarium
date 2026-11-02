// Neon Terrarium: the 15 second demo clip. Open the game with ?full#demo at the end of the address and it builds its own night city, then
// plays a scripted, captioned clip of the game being played (tools/demo/record.py films it at 1920 x 1080, 60 fps, with sound):
//
//   0.0   building: a cursor picks zones and places plots and floors at the city's edge, each with the game's build animation
//   3.2   two megastructures arrive beside them (the Neon Dome, then the Cloud Pagoda) as the music drops
//   6.0   the person cam: someone out on the street, watched up close, their feed and log open top right
//   8.4   the jam: the Acoustic Panel's Booth, its loop running and the magic keys being played
//  10.6   the Data Spire's ledger of the city
//  12.5   the police station's precinct desk
//  14.0   the title over the city
//
// Captions name each beat and a small tag says all footage is captured in engine. Nothing is saved and none of the player's own city or
// settings are read (saveguard.js, NT_DEMO). Live it waits for a click; the recorder runs it frame by frame on a stepped clock (tools/demo/shim.js).
'use strict';
const DEMO = (() => {
  const D = { on: !!window.NT_DEMO, ready: false, playing: false, done: false, t: -1, stage: 'off', log: [], info: {}, sfx: [] };
  if (!D.on) return D;
  const CAP = !!window.__TR_CAPTURE;
  const say = (...a) => { D.log.push(a.join(' ')); console.log('[demo]', ...a); };
  const warn = (what, e) => { D.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[demo] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };
  maybeSpawnMegas = () => {};   // (megastructures arrive only when the script says)

  /* ---------- timing ---------- */
  const LEN = 15;
  const MK = { build: 0, megas: 3.2, person: 6.0, jam: 8.4, spire: 10.6, precinct: 12.5, end: 14.0 };
  // the music: Night City from 25.65 s, so its drop (28.85 s) lands on the megastructures' arrival
  const MUSIC = { file: 'Night City.mp3', start: 25.65 };
  D.info.music = MUSIC;
  const CAPS = [
    [0.35, 3.05, 'Build it block by block'],
    [3.35, 5.85, 'Landmarks rise as your city grows'],
    [6.15, 8.25, 'Follow anyone through their day'],
    [8.6, 10.45, "Jam over the city's broadcast"],
    [11.25, 12.4, 'Read your city from the Data Spire'],
    [12.7, 13.85, 'Run the precinct desk'],
  ];

  /* ---------- small maths ---------- */
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const expo = x => { x = clamp01(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10*x); };
  const lerp = (a, b, u) => a + (b - a)*u;
  const elerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const follow = (cur, goal, k, dt) => cur + (goal - cur)*(1 - Math.exp(-k*dt));
  const DEG = Math.PI/180;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- the city ---------- */
  // A night city of about 300 plots west of x = 5.5 plots; the plots east of it are open sky, where the clip builds (BUILD) and where the two
  // megastructures arrive (ARRIVE). The police station (person cam, precinct desk), the Data Spire and the Psycho-Acoustic Grid stand in it from the start.
  const CITY = { i0: -12, i1: 5, j0: -9, j1: 9 };
  const MEGAS = [['police', -11, -8, 3, 3], ['spire', -4, -2, 3, 3], ['radio', 1, -8, 2, 2], ['market', -8, 4, 4, 4], ['bathhouse', 1, 5, 3, 3]];
  const PARKS = [[-1, -6], [-1, -5], [-2, -6], [-2, -5], [-6, 0], [-6, 1], [-7, 0], [2, 1], [3, 1]];   // (lawns: the people have somewhere to be out on)
  const ARRIVE = [{ kind: 'club', i: 6, j: -1, w: 4, h: 4, at: MK.megas + .02, dur: 2.5 }, { kind: 'pagoda', i: 6, j: 3, w: 5, h: 4, at: MK.megas + .55, dur: 2.3 }];
  const zoneAt = (i, j, u) => {
    if (i <= -8 && j >= 1) return u < .7 ? 'ind' : 'mid';
    if (j <= -3 && i <= -2) return u < .75 ? 'low' : 'mid';
    if (i >= 1) return u < .6 ? 'high' : 'mid';
    return u < .65 ? 'mid' : u < .85 ? 'low' : 'high';
  };
  function city(){
    const R = mulberry32(20261102);
    const inMega = (i, j) => MEGAS.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    const isPark = (i, j) => PARKS.some(([a, b]) => a === i && b === j);
    const secs = (zone, k) => { const out = []; for (let q = 0; q < k; q++) out.push({ zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }); return out; };
    let n = 0;
    for (let i = CITY.i0; i <= CITY.i1; i++) for (let j = CITY.j0; j <= CITY.j1; j++){
      // (the corners rounded off, so the island doesn't read as a rectangle)
      const ci = Math.min(i - CITY.i0, CITY.i1 - i), cj = Math.min(j - CITY.j0, CITY.j1 - j);
      if (ci + cj < 2 && R() < .8) continue;
      const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some'; n++;
      cells.set(ckey(i, j), c);
      if (inMega(i, j)) continue;
      if (isPark(i, j)){ c.green = 'grass'; continue; }
      const z = zoneAt(i, j, R()), v = R();
      // taller toward the middle and the luxury east; the edge the clip builds on kept low, so the new buildings stand out against the sky
      const mid = 1 - Math.min(1, Math.hypot(i + 3, j)/12);
      const k = i >= 4 ? (v < .7 ? 1 : 2) : v < .3 - .2*mid ? 1 : v < .75 - .2*mid ? 2 : 3;
      c.sections = secs(z, Math.min(MAX_SECTIONS, k + (z === 'high' && R() < .3 ? 1 : 0)));
    }
    for (const [kind, i, j, w, h] of MEGAS){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m) warn('megastructure ' + kind, 'did not fit'); }
    rebuildAll(); finishSync();
    D.info.city = { plots: n, megas: megas.size };
    say('city built:', JSON.stringify(D.info.city));
  }
  D.city = () => safe('city', city);

  /* ---------- the build: a cursor places plots and floors on the open sky east of the city ---------- */
  // each plot: picked zone, a click on the sky (a new building), then a click or two on its roof (a floor each)
  const PLAN = [[6, -4, 'mid', 2], [6, -5, 'mid', 1], [7, -4, 'high', 2], [6, -3, 'high', 1], [7, -5, 'low', 1], [7, -3, 'mid', 2], [8, -4, 'high', 1], [8, -5, 'mid', 1]];
  const CLICKS = [];
  {
    let t = .4;
    for (const [i, j, zone, ups] of PLAN){
      CLICKS.push({ t, i, j, zone, up: false }); t += .17;
      for (let k = 0; k < ups; k++){ CLICKS.push({ t, i, j, zone, up: true }); t += .12; }
    }
    D.info.buildEnds = +t.toFixed(2);
  }
  const BUILD_C = { x: 7*LOT, z: -4.2*LOT };
  const ARR_C = { x: 8*LOT, z: 2*LOT };
  function clickTarget(k){
    const b = CLICKS[k]; if (!b) return null;
    const c = cells.get(ckey(b.i, b.j));
    if (!b.up) return c ? null : { type: 'empty', i: b.i, j: b.j };
    return c && c.sections.length < MAX_SECTIONS ? { type: 'up', c } : null;
  }
  // where the cursor points for a click: the plot's middle at street level (a new building) or its roof (a floor)
  function clickPoint(k){
    const b = CLICKS[k]; if (!b) return null;
    const c = cells.get(ckey(b.i, b.j));
    const y = b.up && c ? c.height + .05 : CURB + .4;
    return { x: b.i*LOT, y, z: b.j*LOT };
  }
  function doClick(k){
    const b = CLICKS[k];
    if (S.zone !== b.zone) selectZone(b.zone);
    const tg = clickTarget(k); if (!tg){ warn('click ' + k, 'nothing to build at ' + b.i + ',' + b.j); return; }
    safe('hover', () => showHover(tg));
    const c = applyTarget(tg);
    if (!c) warn('click ' + k, 'did not build');
    CUR.pulse = D.t; CUR.col = ZONES[b.zone] ? ZONES[b.zone].col : '#ffffff';
  }

  /* ---------- the page: hide the game's interface, add ours ---------- */
  function overlay(){
    document.documentElement.classList.add('dm-on');
    const st = document.createElement('style'); st.id = 'dmStyle';
    st.textContent = `
      html.dm-on body > *:not(#view):not(#dmOv):not(canvas):not(#gridPanel):not(#spire):not(#prec):not(#ovsBars):not(.zonebar):not(#monitor):not(#npcSel){visibility:hidden!important}
      html.dm-on .zonebar{visibility:hidden!important}
      html.dm-on.dm-zones .zonebar .zones{visibility:visible!important}
      html.dm-on .zonebar .zones .rot,html.dm-on .zonebar .zones .furnbtn{visibility:hidden!important}
      html.dm-on #monitor,html.dm-on #npcSel{visibility:hidden!important}
      html.dm-on.dm-mon #monitor:not([hidden]),html.dm-on.dm-mon #npcSel:not([hidden]){visibility:visible!important}
      html.dm-on #monitor{transform:scale(1.32);transform-origin:top right;top:30px!important;right:34px!important;max-height:calc((100vh - 60px)/1.32)!important;overflow:hidden}
      html.dm-on, html.dm-on *{cursor:none!important}
      html.dm-on #dmOv.ask, html.dm-on #dmOv.ask *{cursor:pointer!important}
      #dmOv{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Chakra Petch','JetBrains Mono',sans-serif;-webkit-font-smoothing:antialiased}
      #dmOv.ask{pointer-events:auto}
      #dmOv > .fill{position:absolute;inset:0;opacity:0}
      #dmBlack{background:#04050b}
      #dmFlash{background:#e9fdff;mix-blend-mode:screen}
      #dmShade{background:radial-gradient(ellipse 70% 60% at 50% 50%,rgba(6,7,16,.35),rgba(6,7,16,.82))}
      /* the cursor: drawn, not the system's, so it shows in the recording */
      #dmCur{position:absolute;left:0;top:0;width:30px;height:30px;margin:-3px 0 0 -4px;opacity:0;will-change:transform;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
      #dmRing{position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:2px solid #fff;opacity:0}
      /* captions: bottom left, on a soft shade of their own so they read over the city and over the panels */
      #dmCap{position:absolute;left:0;bottom:0;padding:0 0 92px 92px;width:1100px;height:300px;display:flex;flex-direction:column;justify-content:flex-end;
        background:radial-gradient(ellipse 62% 70% at 0% 100%,rgba(4,6,14,.78),rgba(4,6,14,.42) 45%,transparent 75%);opacity:0}
      #dmCap b{display:block;font-weight:600;font-size:56px;line-height:1.04;letter-spacing:-.01em;color:#f3fbff;white-space:nowrap;
        text-shadow:0 3px 18px rgba(3,5,12,.75),0 1px 2px rgba(0,0,0,.7)}
      #dmCap i{display:block;margin-top:18px;height:3px;width:96px;background:#38e8e0;transform-origin:0 50%;box-shadow:0 2px 12px rgba(56,232,224,.55)}
      #dmCap i::after{content:'';display:block;margin-left:104px;width:14px;height:3px;background:#ff4fa3;box-shadow:0 2px 10px rgba(255,79,163,.6)}
      /* the tag */
      #dmTag{position:absolute;right:0;bottom:0;padding:0 64px 52px 220px;height:150px;display:flex;align-items:flex-end;gap:12px;
        background:radial-gradient(ellipse 80% 80% at 100% 100%,rgba(4,6,14,.6),transparent 70%);opacity:0}
      #dmTag span{font-weight:600;font-size:16px;letter-spacing:.32em;text-transform:uppercase;color:rgba(234,250,255,.86);text-shadow:0 1px 6px rgba(0,0,0,.7)}
      #dmTag u{display:block;width:7px;height:7px;margin-bottom:5px;background:#38e8e0;box-shadow:0 1px 8px rgba(56,232,224,.8);text-decoration:none}
      /* the end card */
      #dmLogo{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:20px;font-family:Silkscreen,ui-monospace,monospace;text-transform:uppercase}
      #dmLogo b{display:block;font-weight:400;line-height:1;opacity:0}
      #dmLogo .w1{font-size:136px;letter-spacing:.16em;margin-right:-.16em;color:#ffd9ee;text-shadow:0 0 6px #ff4fa3,0 0 18px #ff4fa3,0 0 44px rgba(255,79,163,.75),0 0 90px rgba(255,79,163,.4)}
      #dmLogo .w2{font-size:58px;letter-spacing:.42em;margin-right:-.42em;color:#d8fffd;text-shadow:0 0 5px #38e8e0,0 0 16px #38e8e0,0 0 40px rgba(56,232,224,.7),0 0 80px rgba(56,232,224,.35)}
      #dmLogo small{display:block;margin-top:26px;font:600 22px/1 'Chakra Petch',sans-serif;letter-spacing:.34em;margin-right:-.34em;color:rgba(240,250,255,.9);text-transform:uppercase;opacity:0;text-shadow:0 2px 10px rgba(0,0,0,.7)}
      #dmMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #dmMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'dmOv';
    ov.innerHTML = '<i class="fill" id="dmShade"></i>'
      + '<svg id="dmCur" viewBox="0 0 30 30" aria-hidden="true"><path d="M4 3 L4 24 L9.6 18.8 L13.4 27.2 L17.2 25.5 L13.5 17.3 L21 17.3 Z" fill="#f4fbff" stroke="#0a0c16" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      + '<i id="dmRing"></i>'
      + '<div id="dmCap"><b></b><i></i></div>'
      + '<div id="dmTag"><u></u><span>All footage captured in engine</span></div>'
      + '<div id="dmLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b><small>Early access on itch.io</small></div>'
      + '<i class="fill" id="dmFlash"></i><i class="fill" id="dmBlack"></i>'
      + '<div id="dmMsg"><b>Demo clip</b><span id="dmStatus">building the city</span></div>';
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    D.el = { ov, black: q('#dmBlack'), flash: q('#dmFlash'), shade: q('#dmShade'), cur: q('#dmCur'), ring: q('#dmRing'), cap: q('#dmCap'), capT: q('#dmCap b'), capL: q('#dmCap i'),
      tag: q('#dmTag'), logo: q('#dmLogo'), w1: q('.w1'), w2: q('.w2'), sub: q('#dmLogo small'), msg: q('#dmMsg'), status: q('#dmStatus') };
    D.el.black.style.opacity = '1';
    if (CAP) D.el.msg.hidden = true;
  }
  const status = s => { D.stage = s; if (D.el) D.el.status.textContent = s; };
  const html = document.documentElement;

  /* ---------- the settings the clip needs (none of them kept: saveguard.js) ---------- */
  const HOUR = 20.4;
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });   // (the game's own pixel look, 1.5x up to 1080)
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    if (CAP) window.__FULL_RATE = true;
    safe('resolution', () => { ZOOM_RES = 0; D.pinRes = true; H = 0; applyRenderRes(zoom); });
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });
  }
  // one picture size for the whole clip (the game sizes its render to the zoom, and a zooming camera stepped it up and down)
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(D.pinRes ? ZOOM_REF : z); };
  // every sound the game makes during the clip is noted with its moment, so the recorder can lay it into the film (it hears nothing itself)
  const _sp = sfx.play;
  sfx.play = function (name){ if (D.playing) D.sfx.push({ t: +D.t.toFixed(3), name }); if (CAP) return; return _sp.apply(this, arguments); };

  /* ---------- setup ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const t0 = performance.now();
    const tick = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - t0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tick); }; tick(); });
  const wait = secs => { const t0 = performance.now(); return until(() => performance.now() - t0 >= secs*1000, secs + 5); };
  async function setup(){
    overlay(); settle();
    status('placing people');
    await until(() => typeof pplReady !== 'undefined' && pplReady && !anims.length && !(typeof LOADP !== 'undefined' && LOADP.on), 180);
    // a few hours of the city's life first, so there are people about, cases on the precinct's board and something in the Spire's ledger
    status('letting the city live a little');
    S.hour = 9; FF.set(60);
    await wait(24);
    FF.set(1);
    S.cycle = false; S.hour = HOUR;
    status('night falling');
    await until(() => Math.abs(LIGHTS_ON.value - LIGHTS_GOAL) < .01, 30).catch(e => warn('lights', e));
    camAt(0, 0);
    await wait(1.2);
    if (!megasOfKind('spire').length || !megasOfKind('police').length) warn('setup', 'the Spire or the police station is missing');
    D.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ D.el.ov.classList.add('ask'); D.el.status.innerHTML = 'click to play<br><small>' + LEN + ' s, with sound</small>'; D.el.ov.addEventListener('click', play, { once: true }); }
    say('ready', JSON.stringify(D.info));
  }

  /* ---------- playback ---------- */
  let t0 = 0, lastT = 0, fired = 0, audioEl = null;
  const EV = [];
  const at = (t, f, name) => EV.push({ t, f, name });
  function play(){
    if (D.playing || !D.ready) return;
    if (!CAP) safe('music', () => {
      audioEl = new Audio('assets/audio/music/' + encodeURIComponent(MUSIC.file)); audioEl.currentTime = MUSIC.start; audioEl.volume = 1;
      audioEl.play().catch(e => warn('music', e));
    });
    go();
  }
  function go(){
    D.el.ov.classList.remove('ask'); D.el.msg.hidden = true;
    D.playing = true; D.done = false; fired = 0; t0 = performance.now(); lastT = 0; D.t = 0; D.sfx.length = 0;
    say('rolling');
  }
  const clock = () => (performance.now() - t0)/1000;

  /* ---------- the camera: set outright every frame from the timeline ---------- */
  const CAM = { x: BUILD_C.x, z: BUILD_C.z, y: TARGET_Y, yaw: .52, zoom: 7.6, pitch: 34*DEG };
  const P = { who: null, x: -3*LOT, z: 0, y: CURB, yaw: .85 };
  const buildCam = t => ({ x: BUILD_C.x, z: BUILD_C.z, y: CURB + 1.2, yaw: .5 + .22*ease(t/3.4), zoom: elerp(8.2, 7.0, ss(t/3.2)), pitch: lerp(36, 33, ss(t/3.2))*DEG });
  const arrCam = t => { const u = ease(seg(t, MK.megas - .15, MK.megas + .7)), v = seg(t, MK.megas, MK.person);
    const a = buildCam(Math.min(t, MK.megas - .15));
    return { x: lerp(a.x, ARR_C.x, u), z: lerp(a.z, ARR_C.z, u), y: lerp(a.y, CURB + 2.5, u), yaw: a.yaw + .18*u + .16*v, zoom: elerp(a.zoom, 12.5, u)*lerp(1, .93, v), pitch: lerp(a.pitch/DEG, 30, u)*DEG }; };
  const WIDE = { x: -3*LOT, z: 0, y: TARGET_Y };
  function camAt(t, dt){
    if (t < MK.megas - .15) Object.assign(CAM, buildCam(t));
    else if (t < MK.person) Object.assign(CAM, arrCam(t));
    else if (t < MK.jam){   // the person cam: close in on them, a slow drift round
      const p = P.who;
      if (p && p.x !== undefined){ P.x = follow(P.x, p.x, 6, dt); P.z = follow(P.z, p.z, 6, dt); }
      const v = seg(t, MK.person, MK.jam);
      Object.assign(CAM, { x: P.x, z: P.z, y: CURB + .45, yaw: P.yaw + .2*v, zoom: elerp(4.6, 3.9, ss(v)), pitch: 44*DEG });
    }
    else if (t >= MK.end){ const v = seg(t, MK.end, LEN);   // the end: the whole city at night, turning slowly behind the title
      Object.assign(CAM, { x: WIDE.x, z: WIDE.z, y: WIDE.y, yaw: .95 + .12*v, zoom: elerp(19, 17.5, v), pitch: 33*DEG }); }
    else return;   // (the panels cover the screen)
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (D.playing) safe('frame', () => { S.hour = HOUR + .25*clamp01(D.t/LEN); camAt(D.t, dt); });
    return _uc(dt);
  };

  /* ---------- the person ---------- */
  function pickPerson(){
    const ok = p => p && p.x !== undefined && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !p.metro && !p.ride && !p.club && !p.custody
      && !(p.sc && p.sc.mode === 'in') && (p._ea === undefined || p._ea > .9);
    const lawn = (x, z) => { const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))); return c && !c.mega && !c.sections.length; };
    let best = null;
    for (const p of pplList){
      if (!ok(p)) continue;
      const i = Math.round(p.x/LOT), j = Math.round(p.z/LOT);
      if (i < CITY.i0 + 2 || i > CITY.i1 - 1 || j < CITY.j0 + 2 || j > CITY.j1 - 2) continue;   // (well inside the city, not on its rim)
      const s = (p.walk ? 3 : 0) + (lawn(p.x, p.z) ? 2 : 0) - Math.hypot(p.x - WIDE.x, p.z - WIDE.z)/(LOT*6);
      if (!best || s > best.s) best = { p, s };
    }
    return best && best.p;
  }
  function personOn(){
    const p = pickPerson();
    if (!p){ warn('person cam', 'nobody out on the street'); return; }
    P.who = p; P.x = p.x; P.z = p.z; P.yaw = .85;
    if (S.zone) selectZone(S.zone);   // (the zone put down: no build outline while watching)
    safe('hover', () => showHover(null));
    safe('person cam', () => MON.open(p.id));
    html.classList.add('dm-mon');
    safe('log tab', () => { const b = document.querySelector('#monTabs [data-tab="log"]'); if (b) b.click(); });
    D.info.person = p.id;
  }
  function personOff(){ html.classList.remove('dm-mon'); safe('person cam off', () => MON.close()); }

  /* ---------- the Booth ---------- */
  const key = (code, up) => window.dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), bubbles: true }));
  // a short phrase on the magic keys (Q W E R T Y U I O P [ ]: low to high, always in the chord), in time with the loop
  const PADS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];
  const PHRASE = [[.0, 4, .22], [.25, 6, .22], [.5, 7, .4], [1.0, 9, .2], [1.2, 8, .2], [1.4, 6, .5], [2.0, 4, .25], [2.25, 7, .25], [2.5, 11, .55]];
  function jamOn(){
    safe('panel', () => music.panel.show());
  }
  function boothTab(){
    safe('booth tab', () => { const b = document.querySelector('#gridPanel .gtab[data-mode="booth"]'); if (b) b.click(); });
    safe('booth play', () => { if (!BOOTH.isPlaying()) key('Space'); });
  }
  function jamOff(){ safe('panel close', () => music.panel.hide()); }

  /* ---------- the Spire and the precinct ---------- */
  function spireOn(){ const m = megasOfKind('spire')[0]; if (!m) return warn('spire', 'none'); safe('spire', () => OVERSEER.show(m)); }
  function spireOff(){ const r = document.getElementById('spire'); if (r) r.style.visibility = 'hidden';
    safe('spire close', () => { const b = r && r.querySelector('.close'); if (b) b.click(); }); }
  function precinctOn(){ const m = megasOfKind('police')[0]; if (!m) return warn('precinct', 'none'); safe('precinct', () => PRECINCT.show(m)); }
  function precinctOff(){ const r = document.getElementById('prec'); if (r) r.style.visibility = 'hidden'; safe('precinct close', () => PRECINCT.close()); }

  /* ---------- the timeline ---------- */
  at(0, () => { html.classList.add('dm-zones'); }, 'open');
  CLICKS.forEach((b, k) => at(b.t, () => doClick(k), 'click ' + k));
  at(D.info.buildEnds + .05, () => { safe('hover', () => showHover(null)); }, 'build done');
  at(MK.megas - .1, () => html.classList.remove('dm-zones'), 'zones away');
  for (const a of ARRIVE) at(a.at, () => {
    const m = spawnMegaAt(a.kind, { i: a.i, j: a.j, w: a.w, h: a.h });
    if (!m) return warn('arrive ' + a.kind, 'did not fit');
    for (const an of anims) if (an.c === m) an.dur = a.dur;   // (the game's arrival is 4.6 s: quicker here, so it lands inside the shot)
  }, 'arrive ' + a.kind);
  at(MK.person - .02, () => { flash(.22); personOn(); }, 'person cam');
  at(MK.jam - .45, jamOn, 'acoustic panel');
  at(MK.jam - .02, () => personOff(), 'person cam off');
  at(MK.jam + .05, boothTab, 'booth');
  PHRASE.forEach(([b, pad, len], k) => {
    const t = MK.jam + .55 + b*.62;
    at(t, () => key(PADS[pad]), 'pad ' + k); at(t + len*.62, () => key(PADS[pad], true), 'pad up ' + k);
  });
  at(MK.spire - .55, spireOn, 'spire');
  at(MK.spire, jamOff, 'panel away');
  at(MK.precinct - .02, () => { flash(.18); spireOff(); precinctOn(); }, 'precinct');
  at(MK.end - .02, () => { flash(.25); precinctOff(); }, 'end card');
  at(LEN, () => { D.playing = false; D.done = true; say('done');
    if (!CAP){ D.el.msg.hidden = false; D.el.status.innerHTML = 'click to play again'; D.el.ov.classList.add('ask'); D.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
  EV.sort((a, b) => a.t - b.t);

  /* ---------- the overlay, drawn from the clock (not CSS animations: the recorder steps time) ---------- */
  let flashA = 0, flashT = -1;
  function flash(a){ flashA = a; flashT = D.t; }
  const CUR = { x: 0, y: 0, on: 0, pulse: -9, col: '#fff', placed: false };
  const _v = new THREE.Vector3();
  const toScreen = p => { _v.set(p.x, p.y, p.z).project(cam); return { x: (_v.x + 1)/2*innerWidth, y: (1 - _v.y)/2*innerHeight }; };
  function cursor(t, dt){
    const E = D.el;
    const on = t < D.info.buildEnds + .5 ? ss(seg(t, .05, .35)) : 1 - ss(seg(t, D.info.buildEnds + .2, D.info.buildEnds + .5));
    E.cur.style.opacity = on.toFixed(3);
    if (on <= 0){ E.ring.style.opacity = '0'; return; }
    // the next click's spot (or the last one's, once they're done); the hand gets there a little before it clicks
    let k = CLICKS.findIndex(b => b.t > t - .02); if (k < 0) k = CLICKS.length - 1;
    const pt = clickPoint(k); if (!pt) return;
    const s = toScreen(pt);
    if (!CUR.placed){ CUR.x = s.x + 60; CUR.y = s.y + 70; CUR.placed = true; }
    CUR.x = follow(CUR.x, s.x, 16, dt); CUR.y = follow(CUR.y, s.y, 16, dt);
    const press = 1 - .12*Math.max(0, 1 - Math.abs(t - CUR.pulse)/.06);
    E.cur.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${press.toFixed(3)})`;
    const u = (t - CUR.pulse)/.32;
    if (u >= 0 && u < 1){ const r = .35 + .9*expo(u);
      E.ring.style.opacity = (.9*(1 - u)).toFixed(3); E.ring.style.borderColor = CUR.col;
      E.ring.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${r.toFixed(3)})`; }
    else E.ring.style.opacity = '0';
  }
  let capK = -1;
  function caption(t){
    const E = D.el, k = CAPS.findIndex(([a, b]) => t >= a && t < b + .3);
    if (k < 0){ E.cap.style.opacity = '0'; capK = -1; return; }
    const [a, b, text] = CAPS[k];
    if (k !== capK){ E.capT.textContent = text; capK = k; }
    const i = expo(seg(t, a, a + .55)), o = ss(seg(t, b - .05, b + .25));
    // in: wiped open from the left, settling up from a soft blur; out: a quick fade
    E.cap.style.opacity = (1 - o).toFixed(3);
    E.capT.style.clipPath = `inset(-20% ${((1 - i)*100).toFixed(2)}% -20% 0)`;
    E.capT.style.transform = `translateY(${((1 - i)*14).toFixed(2)}px)`;
    E.capT.style.filter = i < .999 ? `blur(${((1 - i)*6).toFixed(2)}px)` : '';
    E.capL.style.transform = `scaleX(${expo(seg(t, a + .12, a + .6)).toFixed(3)})`;
  }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t, dt){
    const E = D.el;
    E.black.style.opacity = t < .35 ? (1 - ss(t/.35)).toFixed(3) : '0';
    E.flash.style.opacity = flashT >= 0 ? Math.max(0, flashA*(1 - (t - flashT)/.16)).toFixed(3) : '0';
    E.shade.style.opacity = (.85*ss(seg(t, MK.end, MK.end + .35))).toFixed(3);
    cursor(t, dt);
    caption(t);
    E.tag.style.opacity = (t < MK.end ? ss(seg(t, .3, .8)) : 1).toFixed(3);
    E.w1.style.opacity = String(t > MK.end + .1 ? neonAt(t - MK.end - .1) : 0);
    E.w2.style.opacity = String(t > MK.end + .3 ? neonAt(t - MK.end - .3) : 0);
    E.sub.style.opacity = ss(seg(t, MK.end + .5, MK.end + .8)).toFixed(3);
  }
  function tick(){
    requestAnimationFrame(tick);
    if (!D.playing) return;
    const t = Math.min(LEN, clock()), dt = Math.max(0, Math.min(.1, t - lastT)); lastT = t; D.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); D.log.push(t.toFixed(2) + ' ' + e.name); }
    paint(t, dt);
  }
  D.start = () => { if (!D.ready) return false; go(); return true; };
  D.state = () => ({ ready: D.ready, playing: D.playing, done: D.done, t: D.t, stage: D.stage, info: D.info, sfx: D.sfx, log: D.log.slice(-30) });

  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick))
      .catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); D.failed = String(e && e.message || e); });
  });
  return D;
})();
