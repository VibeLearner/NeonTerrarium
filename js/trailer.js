// Neon Terrarium: the trailer. Open the game with #trailer at the end of the address and it builds its own city (four separate
// sectors, one zone each, joined by a metro line), then plays a 45 second scripted film timed to Bytes:
//
//   0.0   the city turning while the day runs from morning haze through golden hour to dusk
//   8.4   the camera dives onto a resident walking home; the person cam opens and fills in their profile
//   15.0  their own apartment opens in Furnish pod (the hologram fly-in, then a slow turn round the room)
//   19.2  the music drops out: a flash of the coast, waves and shorebirds (assets/audio/trailer/coast_flash.wav)
//   21.72 the drop: 3 a.m. in the rain, the boss's people clean out the safehouse and slip away with the crates
//   26.22 four officers walk up to the same door, knock, go in, and come back out with one empty crate
//   33.72 the camera rises over all four sectors at night, trains running between them
//   41.22 the logo
//
// The city it builds is never saved (saveguard.js locks every neonIsland.* key while #trailer is open), so the player's own city
// and settings are untouched. Live, it waits for a click (the browser needs one before it plays sound); the recorder
// (tools/trailer/record.py) runs it frame by frame instead, with a fixed clock, and adds the sound afterwards.
'use strict';
const TRAILER = (() => {
  const TR = { on: !!window.NT_TRAILER, ready: false, playing: false, done: false, t: -1, stage: 'off', log: [], info: {} };
  if (!TR.on) return TR;
  const CAP = !!window.__TR_CAPTURE;   // (set by the recorder's clock shim: no click, no sound, the recorder steps the frames)
  const say = (...a) => { TR.log.push(a.join(' ')); console.log('[trailer]', ...a); };
  const warn = (what, e) => { TR.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[trailer] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };

  /* ---------- timing: Bytes runs at 160 bpm; the drop lands at 21.72 s, the lull before it starts at 19.2 s ---------- */
  const LEN = 45, BEAT = 60/160, DROP = 21.72, bar = n => DROP + n*4*BEAT;
  const MK = { swoop: 8.4, follow: 10.0, subjectOut: 7.9, monOpen: 10.25, notes: 13.3, monClose: 14.8, furn: 15.0, coastWake: 18.2, dissolve: 18.95,
    coastIn: 19.45, coastOut: DROP, clean: 20.85, cut2: bar(3), raidEarliest: 25.0, arrive: 29.5, rise: bar(8), logo: bar(13), end: LEN };

  /* ---------- small maths ---------- */
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const lerp = (a, b, u) => a + (b - a)*u;
  const elerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));   // (zoom moves feel even when interpolated in log space)
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const follow = (cur, goal, k, dt) => cur + (goal - cur)*(1 - Math.exp(-k*dt));
  const DEG = Math.PI/180;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- the city: four sectors of 7 x 7 plots, one zone each, five plots of open sky between them ---------- */
  const N = 7;
  const SECT = [{ zone: 'low', i0: -12, j0: -12 }, { zone: 'mid', i0: 0, j0: -12 }, { zone: 'high', i0: 0, j0: 0 }, { zone: 'ind', i0: -12, j0: 0 }];
  // landmarks, each two plots clear of the metro: police (the raid needs it, and so does the person cam), the Neon Dome, the Cloud Pagoda, the foundry
  const MEGAS = [['police', -12, -12, 3, 3], ['club', 3, -12, 4, 4], ['pagoda', 3, 2, 4, 5], ['foundry', -12, 1, 4, 6]];
  // the metro: one line round the inside corners of the four sectors, over the open sky between them; it starts and ends in the industrial sector
  const MT_WAY = [[-7, 0], [-7, -7], [1, -7], [1, 1], [-6, 1]], MT_STOPS = [[-6, -7], [0, -7], [1, 0]];
  const CENTER = { x: -3*LOT, z: -3*LOT };
  function metroTiles(){
    const t = [];
    for (let k = 0; k < MT_WAY.length - 1; k++){
      const [i0, j0] = MT_WAY[k], [i1, j1] = MT_WAY[k + 1], di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
      let i = i0, j = j0; if (k > 0){ i += di; j += dj; }
      for (;;){ t.push({ i, j }); if (i === i1 && j === j1) break; i += di; j += dj; }
    }
    return t;
  }
  function city(){
    const R = mulberry32(20261026);
    const tiles = metroTiles(), onTrack = new Set(tiles.map(t => t.i + ',' + t.j));
    const inMega = (i, j) => MEGAS.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    let n = 0;
    for (const s of SECT) for (let i = s.i0; i < s.i0 + N; i++) for (let j = s.j0; j < s.j0 + N; j++){
      const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some';
      if (onTrack.has(i + ',' + j)) c.green = 'grass';   // (lawns under the metro: its pillars stand on them and nothing grows into the track)
      else if (!inMega(i, j)){
        const u = R();
        if (u < .12) c.green = 'grass';   // (a few open lawns and parks: a calm city, not a packed one)
        else { const k = u < .62 ? 1 : u < .92 ? 2 : 3;
          for (let q = 0; q < k; q++) c.sections.push({ zone: s.zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }); }
      }
      cells.set(ckey(i, j), c); n++;
    }
    for (const [kind, i, j, w, h] of MEGAS){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m) warn('megastructure ' + kind, 'did not fit'); else if (kind === 'square') m.centre = 'pond'; }
    const l = { id: mtNext++, tiles, done: true, st: MT_STOPS.map(([i, j]) => tiles.findIndex(t => t.i === i && t.j === j)).filter(k => k > 0 && k < tiles.length - 1), sides: {} };
    metros.push(l); mtReindex();
    rebuildAll(); finishSync();
    safe('metro', () => mtCommit(l, [])); finishSync();
    TR.info.city = { plots: n, megas: megas.size, metroTiles: tiles.length, stops: l.st.length + 2 };
    say('city built:', JSON.stringify(TR.info.city));
  }
  TR.city = () => safe('city', city);

  /* ---------- the page: hide the game's interface, add ours ---------- */
  function overlay(){
    document.documentElement.classList.add('tr-on');
    const st = document.createElement('style'); st.id = 'trStyle';
    st.textContent = `
      html.tr-on body > *:not(#view):not(#furnish):not(#trOv):not(#trCoast):not(.tr-keep){visibility:hidden!important}
      html.tr-on #cctv, html.tr-on #cctvFade{display:none!important}
      html.tr-on, html.tr-on *{cursor:none!important}
      html.tr-on #trOv.ask, html.tr-on #trOv.ask *{cursor:pointer!important}
      html.tr-on #monitor.tr-keep{transform:scale(1.4);transform-origin:top right;top:32px!important;right:36px!important}
      #trCoast{position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:9000;background:#000}
      #trOv{position:fixed;inset:0;z-index:9001;pointer-events:none}
      #trOv.ask{pointer-events:auto}
      #trOv > i{position:absolute;inset:0;display:block;opacity:0}
      #trBlack{background:#000;opacity:1!important}
      #trFlash{background:#e8fbff}
      #trLogo{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:22px;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;text-transform:uppercase}
      #trLogo b{display:block;font-weight:400;line-height:1;opacity:0}
      #trLogo .w1{font-size:132px;letter-spacing:.16em;color:#ffd9ee;text-shadow:0 0 6px #ff4fa3,0 0 18px #ff4fa3,0 0 44px rgba(255,79,163,.75),0 0 90px rgba(255,79,163,.4)}
      #trLogo .w2{font-size:58px;letter-spacing:.42em;margin-right:-.42em;color:#d8fffd;text-shadow:0 0 5px #38e8e0,0 0 16px #38e8e0,0 0 40px rgba(56,232,224,.7),0 0 80px rgba(56,232,224,.35)}
      #trMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #trMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'trOv';
    ov.innerHTML = '<i id="trBlack"></i><i id="trFlash"></i><div id="trLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b></div><div id="trMsg"><b>Trailer</b><span id="trStatus">building the city</span></div>';
    document.body.appendChild(ov);
    TR.el = { ov, black: ov.querySelector('#trBlack'), flash: ov.querySelector('#trFlash'), logo: ov.querySelector('#trLogo'),
      w1: ov.querySelector('.w1'), w2: ov.querySelector('.w2'), msg: ov.querySelector('#trMsg'), status: ov.querySelector('#trStatus') };
    if (CAP) TR.el.msg.hidden = true;
  }
  const status = s => { TR.stage = s; if (TR.el) TR.el.status.textContent = s; };

  /* ---------- the settings a film needs (none of them saved: see saveguard.js) ---------- */
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });   // (the game's own pixel look; 1.5x up to 1080)
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    safe('speed', () => { if (typeof FF !== 'undefined' && FF.set) FF.set(1); });
    if (CAP) window.__FULL_RATE = true;   // (recording: everyone stepped every frame; live, the far-off people step every few frames as in the game)
    // one picture size for the whole film: the game sizes its render to the zoom (sky.js applyRenderRes, 4% steps that wait for a zoom to settle), and a
    // camera that zooms every frame stepped it up and down all the way through. Pinned at the full screen height, the sharpest the game ever draws
    safe('resolution', () => { ZOOM_RES = 0; TR.pinRes = true; H = 0; applyRenderRes(zoom); });
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });   // (the scenes need it, whatever this browser's own city had it set to)
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; } });   // (no case of the player's own takes our crew or officers)
  }

  /* ---------- people helpers ---------- */
  const doorOf = pl => pl && STORY.streetDoor(pl);
  const doorAnc = pl => ({ kind: 'door', door: STORY.streetDoor(pl), place: pl.id });
  const ptAnc = (x, z) => { const n = STORY.nearestNode(x, z); return { kind: 'point', x: NG.x[n], z: NG.z[n], node: n }; };
  const nearDoor = (pl, to) => { let b = null, bd = 1e9; for (const d of pl.doors || []){ if (d.lift) continue; const k = Math.hypot(d.wall.x - to.wall.x, d.wall.z - to.wall.z); if (k < bd){ bd = k; b = d; } } return b; };   // (the door a walk to there leaves by: story.js nearestOf)
  const outward = d => { const dx = d.wall.x - d.inside.x, dz = d.wall.z - d.inside.z, L = Math.hypot(dx, dz) || 1; return { x: dx/L, z: dz/L }; };
  const pathLen = pts => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
  function putInside(p, placeId){
    if (p.scene) safe('end scene', () => STORY.endScene(p.scene, 'preempted'));
    if (p.spot && p.spot.by === p.id) p.spot.by = null;
    if (p.walk && p.walk.spot && p.walk.spot.by === p.id) p.walk.spot.by = null;
    if (p.onBike) safe('bike', () => bikeLeave(p.onBike));
    if (p.metro) safe('train', () => { for (const l of metros) if (l.train && Array.isArray(l.train.load)){ const k = l.train.load.indexOf(p); if (k >= 0) l.train.load.splice(k, 1); } });
    p.custody = null; p.pause = null; p.rainRun = 0; p.eating = null;
    p.walk = null; p.spot = null; p.patrol = null; p.metro = null; p.metroPlan = null; p.club = null; p.clubbing = false; p.ride = null; p.chain = null;
    p.rush = false; p.hurry = false; p.at = placeId; p.until = pplNow + 9999;
  }
  function dry(p){ p.um = p.um || { st: 0, t0: 0, ep: 0, w: null, on: false, f: 0, dx: 0, dy: 0, v: 0 }; Object.assign(p.um, { carry: false, st: 0, ep: typeof pplRainEpoch !== 'undefined' ? pplRainEpoch : 0 }); p.noRun = true; }
  const cellOf = id => { const m = /^c:(-?\d+),(-?\d+)$/.exec(id || ''); return m ? cells.get(ckey(+m[1], +m[2])) : null; };
  const inSector = (c, zone) => { const s = SECT.find(x => x.zone === zone); return c && c.i >= s.i0 && c.i < s.i0 + N && c.j >= s.j0 && c.j < s.j0 + N; };

  /* ---------- the cast: picked once the city has its people ---------- */
  function cast(){
    const pol = megasOfKind('police')[0]; if (!pol) throw new Error('no police station');
    const station = places.get('m:' + pol.id), sDoor = doorOf(station); if (!sDoor) throw new Error('the station has no street door');
    // the safehouse: a residential building a short walk from the station (so the raid arrives on the beat)
    let best = null;
    for (const c of cells.values()){
      if (!inSector(c, 'low') || c.mega || !c.sections.length) continue;
      const pl = places.get('c:' + c.i + ',' + c.j), d = doorOf(pl); if (!d) continue;
      const sd = nearDoor(station, d), pts = sd && route(sd.node, d.node); if (!pts) continue;
      const L = pathLen(pts), score = Math.abs(L - 2.4) + (c.sections.length < 2 ? .8 : 0);
      if (L > 1 && L < 4.5 && (!best || score < best.score)) best = { c, pl, d, L, sd, score };
    }
    if (!best) throw new Error('no safehouse near the station');
    const sh = best.pl, shDoor = best.d, out = outward(shDoor);
    // where the crew walks off to: a street point well away from the door and away from the station
    let away = null;
    for (let n = 0; n < NG.x.length; n++){
      const x = NG.x[n], z = NG.z[n], dd = Math.hypot(x - shDoor.wall.x, z - shDoor.wall.z); if (dd < 6 || dd > 10) continue;
      const fromSt = Math.hypot(x - sDoor.wall.x, z - sDoor.wall.z), pts = route(shDoor.node, n); if (!pts) continue;
      const L = pathLen(pts); if (L > 13) continue;
      const score = fromSt - L*.4; if (!away || score > away.score) away = { n, x, z, score };
    }
    if (!away) throw new Error('nowhere for the crew to go');
    const used = new Set();
    const free = p => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !used.has(p.id);
    // the person cam's subject: a resident with a pod (so Furnish pod can open their home), in a block with a few floors, not the safehouse
    const subj = pplList.filter(p => free(p) && p.pod && p.home !== sh.id && cellOf(p.home) && inSector(cellOf(p.home), 'low') && cellOf(p.home).sections.length >= 2)
      .map(p => { const c = cellOf(p.home); return { p, d: Math.hypot(c.x - (-8.5*LOT), c.z - (-8.5*LOT)) }; }).sort((a, b) => a.d - b.d).map(x => x.p);
    const subject = subj[0]; if (!subject) throw new Error('no resident with a pod'); used.add(subject.id);
    // their walk: to another residential building 6 to 14 units off, reachable
    const home = places.get(subject.home), hDoor = doorOf(home); if (!hDoor) throw new Error('the resident\'s home has no street door'); let dest = null;
    for (const c of cells.values()){
      if (!inSector(c, 'low') || c.mega || !c.sections.length) continue;
      const pl = places.get('c:' + c.i + ',' + c.j), d = doorOf(pl); if (!d || pl.id === home.id || pl.id === sh.id) continue;
      const pts = route(hDoor.node, d.node); if (!pts) continue; const L = pathLen(pts);
      if (L > 6 && L < 14 && (!dest || Math.abs(L - 9) < Math.abs(dest.L - 9))) dest = { pl, L };
    }
    if (!dest) throw new Error('nowhere for the resident to walk to');
    // the crew: the go-between and a resident, and three more to carry crates
    const crew = pplList.filter(p => free(p) && !p.onBike && p.home && cellOf(p.home) && inSector(cellOf(p.home), 'low')).slice(0, 5);
    if (crew.length < 2) throw new Error('not enough people for the cleanout');
    crew.forEach(p => used.add(p.id));
    // four officers from the station (spire guards excluded)
    const okCop = p => p.cop && !p.guard && !p.custody;
    let cops = pplList.filter(p => okCop(p) && p.job === station.id && !p.onBike);
    if (cops.length < 4) cops = cops.concat(pplList.filter(p => okCop(p) && p.job === station.id && !cops.includes(p)), pplList.filter(p => okCop(p) && p.job !== station.id && !cops.includes(p)));
    cops = cops.slice(0, 4);
    if (cops.length < 2) throw new Error('not enough officers');
    const raidLen = best.L;
    TR.c = { station, sDoor, sh, shDoor, out, away, subject, home, dest: dest && dest.pl, crew, cops, raidLen };
    TR.info.cast = { safehouse: sh.id, raidWalk: +raidLen.toFixed(2), subject: subject.id, pod: subject.pod, crew: crew.length, cops: cops.length };
    say('cast:', JSON.stringify(TR.info.cast));
  }

  /* ---------- the person cam ---------- */
  function reveal(id, tmpl, fact, channel = 'document', ctx = {}){
    const c = { A: id };
    const learned = STORY.learnFrom(tmpl, c, new Set(['A']), channel, null, ctx);
    if (typeof PACE !== 'undefined') PACE.mine = true;
    try { STORY.logLine(tmpl, c, ctx, 'reveal', { channel, fact: 'A.' + fact, paced: true }); } finally { if (typeof PACE !== 'undefined') PACE.mine = false; }
    STORY.note(id, { t: STORY.clock, who: id, fact: 'A.' + fact, channel, verified: channel === 'document' || channel === 'introduction', tmpl, cast: c, ctx, learned });
    if (typeof MON !== 'undefined') MON.refresh();
  }
  function revealStep(k){
    const p = TR.c.subject, id = p.id;
    const job = safe('job', () => STORY.JOB_WORD[STORY.jobKind(p)]) || 'line worker';
    const emp = safe('employer', () => STORY.employerName(p)) || 'the night market';
    [() => reveal(id, 'Name tag on {A}: "{A.first}."', 'first-name'),
     () => reveal(id, '{A} keys open {place}. Door plate: {A.full}.', 'home', 'document', { placeId: p.home }),
     () => reveal(id, 'Badge clipped to {A.his} jacket: ' + job + '.', 'job'),
     () => reveal(id, 'Lanyard on {A}: ' + emp + '.', 'employer'),
     () => reveal(id, '{A} back at {place} by {when}. Same hour, give or take, {seen} days running.', 'habit', 'seen', { placeId: p.home, when: '19:40', seen: 6 })][k]();
  }
  const monTab = tab => { const b = document.querySelector('#monTabs button[data-tab=' + tab + ']'); if (b) b.click(); };
  const keep = (el, on) => { if (el) el.classList.toggle('tr-keep', on); };

  /* ---------- Furnish pod ---------- */
  const labWin = () => { const f = FURN.frame || (document.querySelector('#furnish iframe')); return f && f.contentWindow; };
  function labClean(){   // only the lab's 3D view shows: its bars, labels and the "simulated apartment" note go
    const w = labWin(); if (!w || !w.document || !w.document.head) return;
    const d = w.document;
    if (!d.getElementById('trLab')){ const st = d.createElement('style'); st.id = 'trLab'; st.textContent = 'body *{visibility:hidden!important}.tr-vis{visibility:visible!important}*{cursor:none!important}'; d.head.appendChild(st); }
    const big = w.innerWidth*w.innerHeight*.45;
    for (const cv of d.querySelectorAll('canvas')){ const r = cv.getBoundingClientRect(); cv.classList.toggle('tr-vis', r.width*r.height > big); }
  }
  function labExit(){   // through the lab's own Exit: it tells the game, drops the home and is ready for the next (FURN.close alone left it stuck mid-open)
    const w = labWin(), b = w && w.document && w.document.getElementById('ntExit');
    if (b) b.click(); else FURN.close();
    setTimeout(() => { if (FURN.open || FURN.hold) FURN.close(); }, 900);
  }
  const labBusy = () => { const w = labWin(); return !w || !w.PodContext || w.PodContext.transitioning; };
  function labOrbit(dt){ const w = labWin(); const B = w && w.PodBuilder && w.PodBuilder._B; if (!B || labBusy()) return; B.az += .16*dt; B.camDirty = true; B.needs = true; }

  /* ---------- the coast, in a frame of its own, painted only around its moment ---------- */
  const CO = { el: null, w: null, paused: true, pend: [], raf: null, ready: false, yaw: 0, zoom: 0 };
  function coastMake(){
    const keep = ['neonIsland.coastPlayed', 'neonIsland.coastPaused', 'neonIsland.coastVolume'].map(k => [k, localStorage.getItem(k)]);
    const restore = () => { for (const [k, v] of keep) try { if (v === null) NT_RAW.remove.call(localStorage, k); else NT_RAW.set.call(localStorage, k, v); } catch (e) {} };
    const f = document.createElement('iframe'); f.id = 'trCoast'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.src = 'coast.html';
    document.body.appendChild(f); CO.el = f;
    f.addEventListener('load', () => safe('coast', () => {
      const w = f.contentWindow; CO.w = w;
      const st = w.document.createElement('style'); st.textContent = 'body *{visibility:hidden!important}#view{visibility:visible!important}*{cursor:none!important}';
      w.document.head.appendChild(st);
      CO.raf = w.requestAnimationFrame.bind(w);
      w.requestAnimationFrame = fn => { if (CO.paused){ CO.pend.push(fn); return 0; } return CO.raf(fn); };
      CO.paused = false;   // (a few frames to build its first view, then it rests)
      setTimeout(() => { CO.paused = true; }, 1500);
      // the coast's own soundtrack stays silent: the trailer has Bytes and its own waves. (COASTMUSIC is a top-level const in the frame, not a
      // window property, so it is reached through the frame's eval; and every later play() in that page is turned into a silent no-op)
      w.HTMLMediaElement.prototype.play = function (){ this.muted = true; try { this.pause(); } catch (e) {} return Promise.resolve(); };
      const mute = () => { try { const el = w.eval('typeof COASTMUSIC !== "undefined" && COASTMUSIC.el'); if (el){ el.muted = true; el.volume = 0; el.pause(); } } catch (e) {}
        for (const m of w.document.querySelectorAll('audio,video')){ m.muted = true; try { m.pause(); } catch (e) {} } };
      mute(); CO.muteT = setInterval(mute, 250);
      w.COAST.setHour(8.4);
      const s = w.COAST.state; CO.yaw = s.yaw - .35; CO.zoom = 21;
      w.COAST.go({ yaw: CO.yaw, zoom: CO.zoom, pitch: 30*DEG });
      setTimeout(restore, 3000); restore();
      CO.ready = true; say('coast ready');
    }));
  }
  function coastWake(on){ CO.paused = !on; if (on) for (const fn of CO.pend.splice(0)) CO.raf(fn); }
  function coastShow(a, blur = 0){ if (!CO.el) return; CO.el.style.opacity = String(a); CO.el.style.filter = blur > .05 ? 'blur(' + blur.toFixed(2) + 'px) brightness(' + (1 + blur*.06).toFixed(3) + ')' : ''; }
  function coastDrift(t){
    if (!CO.ready || !CO.w || !CO.w.COAST) return;
    const u = seg(t, MK.coastWake, MK.coastOut);
    CO.w.COAST.go({ yaw: CO.yaw + .22*u, zoom: CO.zoom - 3.5*u, pitch: (30 - 3*u)*DEG });
  }

  /* ---------- setup: city, cast, a warm Furnish pod, the coast, the sound ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const t0 = performance.now();
    const tick = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - t0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tick); }; tick(); });
  const wait = secs => { const t0 = performance.now(); return until(() => performance.now() - t0 >= secs*1000, secs + 5); };
  const AU = { ctx: null, music: null, sfx: null };
  async function sound(){
    if (CAP) return;
    const get = async u => { const r = await fetch(u); return r.arrayBuffer(); };
    AU.raw = await Promise.all([get('assets/audio/music/Bytes.mp3'), get('assets/audio/trailer/coast_flash.wav')]);
  }
  async function setup(){
    overlay(); settle();
    status('placing people');
    await until(() => typeof pplReady !== 'undefined' && pplReady && !anims.length && !(typeof LOADP !== 'undefined' && LOADP.on), 90);
    await wait(.5);
    cast();
    status('waking the apartment lab');
    FURN.preload();
    coastMake();
    const snd = sound().catch(e => warn('sound', e));
    await until(() => FURN.warmed(), 240);
    // a dry run of the subject's own pod, at the hour it will open: the second open is quick and steady
    status('opening the apartment once');
    S.hour = 19.6; S.cycle = false;
    if (FURN.openKey(TR.c.subject.pod)){
      await until(() => document.getElementById('furnish').classList.contains('live'), 60).catch(e => warn('dry run live', e));
      await until(() => !labBusy(), 60).catch(e => warn('dry run resolve', e));
      await wait(1);
      labExit(); await until(() => !FURN.open && !FURN.hold, 20).catch(e => warn('dry run close', e)); await wait(1.5);
      if (!FURN.frame){ status('waking the apartment lab again'); FURN.preload(); await until(() => FURN.warmed() && FURN.frame, 240); }   // (a lab that can't be reused is thrown away on close)
    } else warn('dry run', 'could not open pod ' + TR.c.subject.pod);
    status('loading the coast');
    await until(() => CO.ready, 120).catch(e => warn('coast', e));
    await snd;
    // the opening frame: morning, the city turning, everyone where they would be
    S.hour = 6.9; safe('cam', () => camAt(0, 0));
    await wait(1.5);
    TR.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ TR.el.ov.classList.add('ask'); TR.el.status.innerHTML = 'click to play<br><small>45 s, with sound</small>'; TR.el.ov.addEventListener('click', play, { once: true }); }
    say('ready', JSON.stringify(TR.info));
  }

  /* ---------- playback ---------- */
  let t0 = 0, lastT = 0, fired = 0;
  const EV = [];
  const at = (t, f, name) => EV.push({ t, f, name });
  function play(){
    if (TR.playing || !TR.ready) return;
    if (!CAP && AU.raw) safe('sound', () => {
      const ctx = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = ctx.createGain(); g.connect(ctx.destination);
      Promise.all(AU.raw.map(b => ctx.decodeAudioData(b.slice(0)))).then(([m, s]) => {
        const now = ctx.currentTime + .05, src = ctx.createBufferSource(), fx = ctx.createBufferSource(), gf = ctx.createGain();
        src.buffer = m; fx.buffer = s; src.connect(g); fx.connect(gf); gf.connect(g); gf.gain.value = .9;
        g.gain.setValueAtTime(1, now + 43.2); g.gain.linearRampToValueAtTime(0, now + 45);
        src.start(now, 0, 45.2); fx.start(now + 19.0);
        AU.start = now; go();
      }).catch(e => { warn('sound', e); AU.ctx = null; go(); });
    }); else go();
  }
  function go(){
    TR.el.ov.classList.remove('ask'); TR.el.msg.hidden = true;
    TR.playing = true; TR.done = false; fired = 0; t0 = performance.now(); lastT = 0; TR.t = 0;
    say('rolling');
  }
  TR.play = play;
  const clock = () => AU.ctx && AU.start !== undefined ? AU.ctx.currentTime - AU.start : (performance.now() - t0)/1000;   // (live: the sound is the clock)

  /* ---------- the camera: set outright every frame from the timeline (no easing of its own) ---------- */
  const CAM = { x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35, zoom: 33, pitch: 33*DEG };
  let sub = null, subYaw = null, grp = null, cutYaw = 0, raidYaw = null, riseFrom = null;
  const outside = p => p && p.x !== undefined && (!!p.walk || !!(p.sc && p.sc.mode === 'out'));   // (out on the street, not behind a door)
  const centroid = list => { let x = 0, z = 0, n = 0; for (const p of list) if (p && p.x !== undefined){ x += p.x; z += p.z; n++; } return n ? { x: x/n, z: z/n } : null; };
  const turntable = t => ({ x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35 + 1.3*ease(t/10), zoom: elerp(33, 26.5, ss(t/MK.swoop)), pitch: 33*DEG });
  function camAt(t, dt){
    const c = TR.c;
    if (t < MK.swoop){ Object.assign(CAM, turntable(t)); }
    else if (t < MK.follow){   // the dive onto the subject
      const a = turntable(MK.swoop), p = c.subject, u = ease(seg(t, MK.swoop, MK.follow));
      if (!sub) sub = { x: p.x ?? a.x, z: p.z ?? a.z };
      sub.x = follow(sub.x, p.x ?? sub.x, 8, dt); sub.z = follow(sub.z, p.z ?? sub.z, 8, dt);
      if (subYaw === null){ const dx = p.dx || 0, dz = p.dz || 1; subYaw = a.yaw + wrapA(Math.atan2(-dx, -dz) + .45 - a.yaw)*.6; }
      Object.assign(CAM, { x: lerp(a.x, sub.x, u), z: lerp(a.z, sub.z, u), y: lerp(TARGET_Y, (p._ey ?? CURB) + .5, u), yaw: lerp(a.yaw, subYaw, u), zoom: elerp(a.zoom, 4.4, u), pitch: lerp(33, 40, u)*DEG });
    }
    else if (t < MK.coastIn){   // with the subject on the person cam (the apartment covers the screen from 15 s)
      const p = c.subject; if (!sub) sub = { x: p.x, z: p.z };
      if (p.x !== undefined){ sub.x = follow(sub.x, p.x, 6, dt); sub.z = follow(sub.z, p.z, 6, dt); }
      const u = seg(t, MK.follow, MK.furn);
      Object.assign(CAM, { x: sub.x, z: sub.z, y: (p._ey ?? CURB) + .5, yaw: subYaw + .14*u, zoom: lerp(4.4, 3.9, ss(u)), pitch: 40*DEG });
    }
    else if (t < MK.cut2){   // the safehouse door, then the crew walking off
      const d = c.shDoor, door = { x: d.wall.x + c.out.x*1.2, z: d.wall.z + c.out.z*1.2 };
      if (!grp){ grp = { x: door.x, z: door.z }; cutYaw = Math.atan2(c.out.x, c.out.z) + .5; }
      const vis = c.crew.filter(outside), cc = t > MK.coastOut + .4 && vis.length ? centroid(vis) : null;
      if (cc){ grp.x = follow(grp.x, cc.x, 2.6, dt); grp.z = follow(grp.z, cc.z, 2.6, dt); }
      const u = seg(t, MK.coastOut, MK.cut2);
      Object.assign(CAM, { x: grp.x, z: grp.z, y: CURB + .55, yaw: cutYaw + .18*u, zoom: lerp(5.0, 6.4, ss(u)), pitch: 25*DEG });
    }
    else if (t < MK.rise){   // the officers walk up, knock, go in, come out
      const d = c.shDoor, door = { x: d.wall.x + c.out.x*.9, z: d.wall.z + c.out.z*.9 };
      if (raidYaw === null){ raidYaw = Math.atan2(c.out.x, c.out.z) - .55; grp = null; }
      const there = t > MK.arrive - .3, cc = there ? door : centroid(c.cops.filter(outside)) || door;
      if (!grp) grp = { x: cc.x, z: cc.z };
      grp.x = follow(grp.x, cc.x, there ? 2 : 4, dt); grp.z = follow(grp.z, cc.z, there ? 2 : 4, dt);
      const u = seg(t, MK.cut2, MK.rise);
      Object.assign(CAM, { x: grp.x, z: grp.z, y: CURB + .55, yaw: raidYaw - .1*u, zoom: lerp(5.6, 5.0, ss(u)), pitch: 27*DEG });
    }
    else {   // the rise over the whole city at night
      if (!riseFrom) riseFrom = Object.assign({}, CAM);
      const u = ease(seg(t, MK.rise, MK.logo + .6)), v = seg(t, MK.rise, LEN);
      Object.assign(CAM, { x: lerp(riseFrom.x, CENTER.x, u), z: lerp(riseFrom.z, CENTER.z, u), y: lerp(riseFrom.y, TARGET_Y, u),
        yaw: riseFrom.yaw + .75*u + .08*v, zoom: elerp(riseFrom.zoom, 31, u), pitch: lerp(riseFrom.pitch/DEG, 36, u)*DEG });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // the hour: morning haze, a quick afternoon, golden hour, dusk; 3 a.m. after the coast
  const hourAt = t => t < 3 ? lerp(6.9, 8.8, ss(t/3)) : t < 6.5 ? lerp(8.8, 17.0, ss((t - 3)/3.5)) : t < MK.follow ? lerp(17.0, 19.3, ss((t - 6.5)/3.5))
    : t < MK.coastIn ? lerp(19.3, 19.8, seg(t, MK.follow, MK.coastIn)) : 3.05 + (t - MK.coastIn)/150;
  // the render size, pinned (see settle): asked for as if zoomed out to 24, which sizes it to the screen's height
  const _ar = applyRenderRes;
  // (recording: the full screen height; live preview: the game's base size, so it plays smoothly while it's checked)
  applyRenderRes = function (z){ return _ar(TR.pinRes ? (CAP ? 24 : ZOOM_REF) : z); };
  // the camera is set just before the game places it each frame
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (TR.playing) safe('frame', () => {
      TR.t = Math.min(LEN, clock());
      const h = hourAt(TR.t);
      if (!CAP && Math.abs(h - S.hour) > 1e-4) window.HOUR_DRAG_AT = performance.now();   // (live: while the hour runs the shadows redraw every few frames, as when the time slider is dragged)
      S.hour = h;
      if (TR.t > MK.coastIn && TR.t < MK.cut2) LIGHTS_ON.value = LIGHTS_GOAL;   // (straight into the night: every window already lit)
      camAt(TR.t, dt);
    });
    return _uc(dt);
  };

  /* ---------- the scenes ---------- */
  function scene(id, castMap, beats, log){
    for (const pid of Object.values(castMap)) if (!places.get(people.get(pid).at)) throw new Error(id + ': ' + pid + ' is nowhere');
    const sc = STORY.startScene({ id, beats, log, roles: {}, effects: {}, next: null, tier: 'case', prio: 9 }, castMap, { done: (sc2, why) => say(id, 'ended', why) });
    if (!sc) throw new Error(id + ' did not start');
    return sc;
  }
  function stageNight(){
    const c = TR.c;
    for (const p of c.crew){ putInside(p, c.sh.id); dry(p); p.speed = PPL_SPEED; }
    for (const p of c.cops){ putInside(p, c.station.id); p.speed = PPL_SPEED; }
  }
  function cleanout(){
    const c = TR.c, L = 'ABCDE', m = {}; c.crew.forEach((p, k) => { m[L[k]] = p.id; });
    const front = ptAnc(c.shDoor.wall.x + c.out.x*1.4, c.shDoor.wall.z + c.out.z*1.4), off = ptAnc(c.away.x, c.away.z);
    const who = Object.keys(m);
    scene('trailer.cleanout', m, [
      { id: 'b0', who, with: [], at: 'case', do: 'carry', held: 'crate', anc: front, hold: .35 },
      { id: 'b1', who, with: [], at: 'case', do: 'walk-together', anc: off, hold: .5 }],
      { b0: ['{A} carries a crate out of the building door in the dark.'], b1: ['{A} and {B} walk away from the building fast.'] });
    c.crew.forEach((p, k) => { p.held = PG.heldPick(k === 1 ? 'bag' : 'crate', '', p.id); p.hurry = true; });
  }
  function raid(){
    const c = TR.c, m = {}; TR.cops = c.cops; c.cops.forEach((p, k) => { m['ABCD'[k]] = p.id; });
    const door = doorAnc(c.sh), off = ptAnc(c.shDoor.wall.x + c.out.x*3.2 - c.out.z*1.5, c.shDoor.wall.z + c.out.z*3.2 + c.out.x*1.5);
    const all = Object.keys(m), two = all.slice(0, 2);
    TR.raidSc = scene('trailer.raid', m, [
      { id: 'r0', who: all, with: [], at: 'case', do: 'walk-together', anc: door, hold: .15 },
      { id: 'r1', who: ['A'], with: ['B'], at: 'case', do: 'knock-and-wait', anc: door, hold: .85 },
      { id: 'r2', who: two, with: [], at: 'case', do: 'enter', anc: door, hold: .6 },
      { id: 'r3', who: [two[1] || 'A'], with: ['A'], at: 'case', do: 'shrug', anc: door, hold: 1.1 },
      { id: 'r4', who: ['A'], with: [], at: 'case', do: 'carry', held: 'crate', anc: off, hold: .5 }],
      { r0: ['{A}, {B}, {C} and {D} walk out of the station together before dawn.'], r1: ['{A} knocks hard at the door while {B} watches the street.'],
        r2: ['{A} and {B} go in through the door.'], r3: ['{B} comes back out shaking {B.his} head: "Cleared out."'], r4: ['{A} carries out one empty crate, and nothing else.'] });
    for (const p of c.cops){ p.hurry = false; p.rush = true; }   // (a raid: they move)
  }

  /* ---------- the timeline's moments ---------- */
  at(0, () => { S.hour = 6.9; }, 'open');
  at(MK.subjectOut, () => { const c = TR.c, p = c.subject; putInside(p, p.home); p.until = pplNow; if (c.dest && !startTrip(p, c.dest.id)) warn('subject', 'no trip'); }, 'subject out');
  at(MK.monOpen, () => { MON.open(TR.c.subject.id); keep(document.getElementById('monitor'), true); keep(document.getElementById('npcSel'), true); monTab('log'); }, 'person cam');
  [10.7, 11.35, 12.0, 12.65].forEach((t, k) => at(t, () => revealStep(k), 'reveal ' + k));
  at(MK.notes, () => monTab('notes'), 'notebook');
  at(13.9, () => revealStep(4), 'reveal 4');
  at(MK.monClose, () => { keep(document.getElementById('monitor'), false); keep(document.getElementById('npcSel'), false); MON.close(); }, 'cam off');
  at(MK.furn, () => { if (!FURN.openKey(TR.c.subject.pod)) warn('furnish', 'did not open'); }, 'furnish');
  at(MK.coastWake, () => coastWake(true), 'coast wakes');
  at(MK.dissolve, () => { CO.fade = true; }, 'coast dissolves in');
  at(MK.coastIn, () => { if (FURN.open || FURN.hold) labExit(); LK.setWeather('rain', true, true); stageNight(); }, 'night falls behind the coast');
  at(MK.clean, () => cleanout(), 'cleanout');
  at(MK.coastOut, () => { CO.fade = false; coastShow(0); flash(.45); coastWake(false); }, 'drop');
  at(-1, () => raid(), 'raid');   // (its time is worked out from the walk: see setup)
  at(MK.end, () => { TR.playing = false; TR.done = true; say('done'); if (!CAP){ TR.el.msg.hidden = false; TR.el.status.innerHTML = 'click to play again'; TR.el.ov.classList.add('ask'); TR.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
  function timeRaid(){   // leave the station so the four reach the door at MK.arrive (hurried walk, plus the two doorways)
    const v = PPL_SPEED*2.3, walk = (TR.c.raidLen + 1.2)/v + 1.0, e = EV.find(x => x.name === 'raid');
    e.t = Math.max(MK.raidEarliest, MK.arrive - walk); TR.info.raidAt = +e.t.toFixed(2); EV.sort((a, b) => a.t - b.t);
  }

  /* ---------- the overlay's moments, drawn from the clock (not CSS animations: the recorder steps time) ---------- */
  let flashA = 0, flashT = -1;
  function flash(a){ flashA = a; flashT = TR.t; }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t){
    const E = TR.el;
    const black = t < .9 ? 1 - ss(t/.9) : t > LEN - .75 ? ss((t - (LEN - .75))/.75) : t > MK.logo ? .58*ss(seg(t, MK.logo, MK.logo + 1.2)) : 0;
    E.black.style.setProperty('opacity', String(black), 'important');
    const hz = t > MK.dissolve - .2 && t < MK.coastIn + .45 ? .32*Math.sin(Math.PI*seg(t, MK.dissolve - .2, MK.coastIn + .45)) : 0;   // (a bright haze over the dissolve: a memory surfacing)
    E.flash.style.opacity = String(Math.max(hz, flashT >= 0 ? flashA*Math.max(0, 1 - (t - flashT)/.14) : 0));
    if (CO.fade){ const u = ss(seg(t, MK.dissolve, MK.coastIn)); coastShow(u, 9*(1 - u)); }
    const l1 = t > MK.logo + .5 ? neonAt(t - MK.logo - .5) : 0, l2 = t > MK.logo + .85 ? neonAt(t - MK.logo - .85) : 0;
    E.w1.style.opacity = String(l1); E.w2.style.opacity = String(l2);
    E.logo.style.opacity = t > LEN - .5 ? String(1 - ss((t - (LEN - .5))/.5)) : '1';
  }
  function tick(){
    requestAnimationFrame(tick);
    if (!TR.playing) return;
    const t = Math.min(LEN, clock()), dt = Math.max(0, Math.min(.1, t - lastT)); lastT = t; TR.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); TR.log.push(t.toFixed(2) + ' ' + e.name); }
    paint(t);
    if (TR.raidSc && TR.raidSc.phase && t > MK.arrive){ const k = TR.raidSc.beatIx ?? TR.raidSc.k ?? TR.raidSc.i, b = TR.raidSc.b || (typeof k === 'number' && TR.raidSc.s.beats[k]);
      const A = TR.cops && TR.cops[0]; if (A && !A.held && b && b.id === 'r4') A.held = PG.heldPick('crate', '', A.id); }
    if (t >= MK.furn && t < MK.coastIn && FURN.open){ safe('lab', labClean); safe('orbit', () => labOrbit(dt)); }
    if (t >= MK.coastWake && t < MK.coastOut) coastDrift(t);
    if (FURN.hold && !(t >= MK.furn && t < MK.coastIn + 1.2)) safe('furnish', () => FURN.close());   // (never left covering the city)
  }
  // capture: the recorder asks for this once the page reports ready, then steps the frames itself
  TR.start = () => { if (!TR.ready) return false; go(); return true; };
  TR.state = () => ({ ready: TR.ready, playing: TR.playing, done: TR.done, t: TR.t, stage: TR.stage, info: TR.info, log: TR.log.slice(-20) });

  // starts once the game's own start-up has run (this file loads before main.js; see index.html)
  window.addEventListener('load', () => {
    setup().then(() => { timeRaid(); requestAnimationFrame(tick); })
      .catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); TR.failed = String(e && e.message || e); });
  });
  return TR;
})();
