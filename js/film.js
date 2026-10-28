// Neon Terrarium: the film (open the game with #film; record it with tools/trailer/record.py --film). About 74 seconds, no music:
//
//   0     out of empty sky the city is built, plot by plot with the game's own build animation, from a garden in the middle
//         outwards; a metro is laid across it tile by tile and the police station arrives; the camera pulls back until
//         the city fills the frame
//   14.5  down into the garden: the person cam on two people there, six or seven seconds each, the log filling in
//   31    golden hour, down at street level by a metro station (the game's own close view): someone crossing the plaza is
//         mugged, a police drone flies over and turns its searchlight red on the mugger as they run, the bikes come
//   48    the camera rises to the metro, side on and low, as night comes in; then it pulls back over the dark city and
//         the lights come on one by one, the way they do in the game
//   63    the title, and the rain comes in
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
  const hash = n => { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0)/4294967296; };

  /* ---------- the timeline ---------- */
  const LEN = 74;
  const MK = { built: 13.6, dive: 14.5, p: [17, 24], garden: 31, street: 33.5, strikeBy: 35, strikeLast: 38.5, rise: 48, night: 50.6, side: 52.5,
    out: 61, lights: 54.5, logo: 63, rain: 63.4, end: LEN };

  /* ---------- the city plan ---------- */
  const R = 13;                                         // plots from -13 to 13 each way: 27 x 27
  const GARDEN = { i0: -2, i1: 1, j0: -2, j1: 1 };      // the lawn in the middle
  const MT_J = 4;                                       // the metro: straight across the city, west to east, just south of the middle
  const MT_STOP_I = [-8, 0, 7];                         // its stations (on the straight: each has room for its lift)
  const PLAZA = { i0: 5, i1: 7, j0: 5, j1: 6 };         // paved, open, by the east station: where the mugging happens
  const MEGAS = [['police', 9, 5, 3, 3, 6.0], ['club', -10, 6, 4, 4, 5.2], ['market', 3, -9, 4, 4, 4.4], ['foundry', -12, -12, 4, 6, 3.6]];
  const LOW_FRONT = { i0: 0, i1: 13, j0: -2, j1: MT_J - 1 };   // south of the track where the side-on shot looks across: kept low so the train shows
  const inBox = (b, i, j) => i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1;
  const megaAt = (i, j) => MEGAS.find(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
  const GC = { x: (GARDEN.i0 + GARDEN.i1)/2*LOT, z: (GARDEN.j0 + GARDEN.j1)/2*LOT };
  const PC = { x: (PLAZA.i0 + PLAZA.i1)/2*LOT, z: (PLAZA.j0 + PLAZA.j1)/2*LOT };
  // what each plot is: its zone (by quarter, with the middle mixed), how many sections, and whether it sits under the track
  function plotOf(i, j, Rnd){
    if (inBox(GARDEN, i, j)) return { kind: 'lawn' };
    if (inBox(PLAZA, i, j)) return { kind: 'plaza' };
    const d = Math.max(Math.abs(i + .5), Math.abs(j + .5));
    const ring = Math.max(Math.abs(i + .5), Math.abs(j + .5)) <= 3;   // round the garden: low homes
    let zone = i >= 0 ? (j >= 0 ? 'mid' : 'high') : (j >= 0 ? 'low' : 'ind');
    if (ring) zone = 'low';
    else if (Rnd() < .18) zone = ['low', 'mid', 'low', 'ind', 'mid'][Math.floor(Rnd()*5)];
    if (j === MT_J) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: 2 };
    if (inBox(LOW_FRONT, i, j)) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: Rnd() < .5 ? 1 : 2 };
    // dense in the commercial quarter and the middle, thinning to the edges
    const edge = d > 10, core = (zone === 'mid' && d < 9) || (d < 6 && !ring);
    const u = Rnd();
    let n = ring ? (u < .5 ? 2 : 3) : edge ? (u < .65 ? 1 : 2) : core ? (u < .25 ? 2 : u < .7 ? 3 : 4) : (u < .4 ? 1 : u < .8 ? 2 : 3);
    if (zone === 'high') n = Math.min(n, 3);
    return { kind: 'bld', zone, n };
  }
  // the build: plots from the middle outwards in rings (a little jitter so it isn't a square wave), floors stacked on soon after
  const BUILD = [];
  { const Rnd = mulberry32(2026);
    const all = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++){ if (megaAt(i, j)) continue; const p = plotOf(i, j, Rnd); all.push(Object.assign({ i, j, d: Math.hypot(i + .5, j + .5) + Rnd()*1.6 }, p)); }
    all.sort((a, b) => a.d - b.d);
    const T0 = .35, T1 = 10.5;
    all.forEach((b, k) => { const u = k/(all.length - 1); b.t = T0 + (T1 - T0)*Math.pow(u, .78); });   // (the first rings come in a little slower)
    for (const b of all){ BUILD.push({ t: b.t, kind: 'plot', b }); for (let q = 1; q < (b.n || 0); q++) BUILD.push({ t: b.t + .32*q, kind: 'floor', b }); }
    for (const [kind, i, j, w, h, t] of MEGAS) BUILD.push({ t, kind: 'mega', mk: { kind, i, j, w, h } });
    // the metro, laid west to east one plot at a time once the plots under it are in, then its stations, then finished
    const tiles = []; for (let i = -R; i <= R; i++) tiles.push([i, MT_J]);
    tiles.forEach(([i, j], k) => BUILD.push({ t: 10.7 + k*.1, kind: k ? 'mtExtend' : 'mtStart', i, j }));
    const tEnd = 10.7 + tiles.length*.1;
    MT_STOP_I.forEach((si, n) => BUILD.push({ t: tEnd + .15 + n*.12, kind: 'mtStop', k: si + R }));
    BUILD.push({ t: tEnd + .6, kind: 'mtFinish' });
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

  // one build step, done with the game's own actions (so it animates as it does when you build)
  let LINE = null;
  // (a new plot takes the game's default greenery: set for the moment it is made)
  function withGreen(g, fn){ const was = GREEN_DEFAULT; GREEN_DEFAULT = g; try { return fn(); } finally { GREEN_DEFAULT = was; } }
  function step(s){
    if (s.kind === 'plot'){
      const b = s.b;
      if (b.kind === 'lawn') return withGreen('grass', () => addPlatform(b.i, b.j, null));
      if (b.kind === 'plaza') return withGreen('none', () => addPlatform(b.i, b.j, null));
      if (b.mf){   // low under the track: the bare plot, then a building held to a floor or two
        const c = withGreen('some', () => addPlatform(b.i, b.j, null)); if (c) later(() => { if (cells.get(ckey(b.i, b.j)) === c) addSection(c, b.zone, { mf: b.mf }); }, 8); return; }
      return withGreen('some', () => addPlatform(b.i, b.j, b.zone));
    }
    if (s.kind === 'floor'){ const c = cells.get(ckey(s.b.i, s.b.j)); if (c && !c.mega) addSection(c, s.b.zone, s.b.mf ? { mf: s.b.mf } : {}); return; }
    if (s.kind === 'mega'){ const m = spawnMegaAt(s.mk.kind, { i: s.mk.i, j: s.mk.j, w: s.mk.w, h: s.mk.h }); if (!m) warn('mega', s.mk.kind + ' did not fit'); return; }
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
      #flLogo{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:2.04vh;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;text-transform:uppercase}
      #flLogo b{display:block;font-weight:400;line-height:1;opacity:0}
      #flLogo .w1{font-size:12.2vh;letter-spacing:.16em;color:#ffd9ee;text-shadow:0 0 6px #ff4fa3,0 0 18px #ff4fa3,0 0 44px rgba(255,79,163,.75),0 0 90px rgba(255,79,163,.4)}
      #flLogo .w2{font-size:5.4vh;letter-spacing:.42em;margin-right:-.42em;color:#d8fffd;text-shadow:0 0 5px #38e8e0,0 0 16px #38e8e0,0 0 40px rgba(56,232,224,.7),0 0 80px rgba(56,232,224,.35)}
      #flMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #flMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'flOv';
    ov.innerHTML = '<i id="flBlack"></i><div id="flSel"><b></b><b></b><b></b><b></b><i></i></div><div id="flLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b></div><div id="flMsg"><b>Film</b><span id="flStatus">getting ready</span></div>';
    document.body.appendChild(ov);
    Object.assign(E, { ov, black: ov.querySelector('#flBlack'), sel: ov.querySelector('#flSel'), w1: ov.querySelector('.w1'), w2: ov.querySelector('.w2'), msg: ov.querySelector('#flMsg'), status: ov.querySelector('#flStatus') });
    if (CAP) E.msg.hidden = true;
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
  const free = (p, used) => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !used.has(p.id) && p.home && cellOf(p.home);
  // two pairs out on the lawn, talking
  function garden(){
    const used = new Set(), byDist = home => { const c = cellOf(home); return c ? Math.hypot(c.x - GC.x, c.z - GC.z) : 1e9; };
    const pool = pplList.filter(p => free(p, used) && byDist(p.home) < 4.5*LOT).sort((a, b) => byDist(a.home) - byDist(b.home));
    if (pool.length < 4) throw new Error('only ' + pool.length + ' people live round the garden yet');
    const take = () => { const p = pool.find(q => free(q, used)); used.add(p.id); return p; };
    const n1 = freeNode(GC.x - 2.4, GC.z - 1.2, []), n2 = freeNode(GC.x + 2.2, GC.z + 1.6, [n1]);
    F.pairs = [{ A: take(), B: take(), n: n1 }, { A: take(), B: take(), n: n2 }];
    F.gsc = F.pairs.map((q, k) => {
      for (const p of [q.A, q.B]){ p.speed = PPL_SPEED; p.hurry = true; }
      return storyScene('film.garden' + k, { A: q.A.id, B: q.B.id }, [
        { id: 'g0', who: ['A', 'B'], with: [], at: 'case', do: 'walk', anc: nodeAnc(q.n), hold: .2 },
        { id: 'g1', who: ['A'], with: ['B'], at: 'case', do: 'chat', anc: nodeAnc(q.n), hold: 600 }],
        { g0: ['{A} and {B} come out onto the lawn.'], g1: ['{A} and {B} talk on the lawn.'] });
    });
    F.info.garden = F.pairs.map(q => q.A.id);
    say('garden cast', JSON.stringify(F.info.garden));
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
  function brackets(p){
    if (!p || p.x === undefined || (p.sc && p.sc.mode === 'in')){ E.sel.style.display = 'none'; return; }
    _v.set(p.x, (p._ey ?? CURB) + .42, p.z).project(cam);
    const x = (_v.x + 1)/2*innerWidth, y = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.sel.style.display = 'block'; E.sel.style.transform = `translate(${(x - w/2).toFixed(1)}px,${(y - h/2).toFixed(1)}px)`; E.sel.style.width = w.toFixed(0) + 'px'; E.sel.style.height = h.toFixed(0) + 'px';
  }

  /* ---------- the mugging: someone crosses the plaza, a mugger darts out, a police drone answers ---------- */
  const MUG = { L: null, victim: null, sc: null, struck: false, drone: null };
  function victimWalk(){
    // someone who lives near the plaza, sent across it: from its west side to its east side
    const used = new Set(F.pairs ? F.pairs.flatMap(q => [q.A.id, q.B.id]) : []);
    const near = p => { const c = cellOf(p.home); return c ? Math.hypot(c.x - PC.x, c.z - PC.z) : 1e9; };
    const pool = pplList.filter(p => free(p, used) && near(p) < 6*LOT).sort((a, b) => near(a) - near(b));
    for (const v of pool){
      const a = freeNode(PC.x - 1.6*LOT, PC.z, []), b = freeNode(PC.x + 1.4*LOT, PC.z + .3*LOT, [a]);
      try {
        MUG.sc = storyScene('film.cross', { A: v.id }, [
          { id: 'c0', who: ['A'], with: [], at: 'case', do: 'walk', anc: nodeAnc(a), hold: .1 },
          { id: 'c1', who: ['A'], with: [], at: 'case', do: 'walk', anc: nodeAnc(b), hold: 30 }], { c0: ['{A} heads for the station.'], c1: ['{A} crosses the plaza.'] });
        MUG.victim = v; v.hurry = false; F.info.victim = v.id; say('victim', v.id); return;
      } catch (e) { warn('victim ' + v.id, e); }
    }
    warn('mugging', 'nobody to send across the plaza');
  }
  function strike(t){
    let v = MUG.victim;
    if (!v || v.x === undefined){   // nobody of ours in the open: whoever is walking nearest the plaza
      let best = null; for (const p of pplList){ if (!p.walk || p.cop || p.x === undefined) continue; const d = Math.hypot(p.x - PC.x, p.z - PC.z); if (d < 9 && (!best || d < best.d)) best = { p, d }; }
      v = best && best.p; }
    if (!v){ warn('mugging', 'nobody near the plaza'); return; }
    // the mugger steps out of the crowd a pace from them, on the side away from the camera
    const ox = -Math.sin(CAM.yaw)*1.5, oz = -Math.cos(CAM.yaw)*1.5;
    const c = cells.get(ckey(Math.round(v.x/LOT), Math.round(v.z/LOT))) || cells.get(ckey(PLAZA.i0, PLAZA.j0));
    const L = { key: 'film', cell: c, home: { x: v.x + ox, z: v.z + oz }, x: v.x + ox, z: v.z + oz, state: 'strike', rare: false, until: t + 1e6, row: 10, flip: 1, phase: 3, fade: 0, victim: v, t0: pplNow };
    lurkers.set('film', L); MUG.L = L; MUG.struck = true;
    v.pause = pplNow + 4; emote(v, 'bang', 1.6);
    // the station always answers this one (it sends a drone seven times in ten), and sends it at once rather than after the hold-up
    const mr = Math.random; Math.random = () => 0;
    try { if (policeDroneAlert) MUG.drone = policeDroneAlert(L); } finally { Math.random = mr; }
    F.info.mugging = { at: +F.t.toFixed(2), victim: v.id, drone: !!MUG.drone };
    say('mugging at', F.t.toFixed(2), MUG.drone ? '(drone sent)' : '(no drone free)');
  }
  // the drone after the mugger, if one is up
  const chaser = () => { for (const st of POLICE_STATIONS) for (const d of st.drones) if (d.st.chase && d.st.chase.L === MUG.L) return d; return null; };

  /* ---------- the camera: set outright every frame ---------- */
  const CAM = { x: GC.x, y: TARGET_Y, z: GC.z, yaw: .55, zoom: 8, pitch: 40*DEG };
  let sub = null, from = null, gview = null, mugCam = null;
  const STREET = { yaw: Math.PI - .8, pitch: 38*DEG, zoom: 7.6 };   // the game's own close view, from the track side: the station in front, the plaza and the people beyond
  const SIDE = { yaw: Math.PI, pitch: 11*DEG, zoom: 9.5 };            // the metro, side on and low (the ride's angle)
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
  function camAt(t, dt){
    if (t < MK.dive){ Object.assign(CAM, buildCam(t)); }
    else if (t < MK.garden){   // into the garden, then from one person to the next
      if (!gview) gview = pickView([[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].map(([a, b]) => ({ x: GC.x + a, y: CURB + .45, z: GC.z + b })), 1.0, 34, 58);
      const a = buildCam(MK.dive), u = ease(seg(t, MK.dive, MK.p[0]));
      const p = F.pairs ? F.pairs[who(t)].A : null, px = p && p.x !== undefined ? p.x : GC.x, pz = p && p.x !== undefined ? p.z : GC.z;
      if (!sub) sub = { x: px, z: pz };
      sub.x = follow(sub.x, px, t < MK.p[0] ? 8 : 3, dt); sub.z = follow(sub.z, pz, t < MK.p[0] ? 8 : 3, dt);
      Object.assign(CAM, { x: lerp(a.x, sub.x, u), z: lerp(a.z, sub.z, u), y: lerp(TARGET_Y, CURB + .5, u), yaw: a.yaw + wrapA(gview.yaw - a.yaw)*u, zoom: elerp(a.zoom, 4.2, u), pitch: lerp(a.pitch, gview.pitch, u) });
    }
    else if (t < MK.rise){   // down the street: a glide to the plaza, then with the mugger and the drone
      if (!from) from = Object.assign({}, CAM);
      const u = ease(seg(t, MK.garden, MK.street));
      let gx = PC.x, gz = PC.z - .6*LOT, gzm = STREET.zoom, gy = CURB + .5;
      const L = MUG.L;
      if (L && L.fade > .05 && L.state !== 'away'){
        const d = chaser(), dp = d && d.pos;
        let tx = L.x, tz = L.z, ty = CURB + .5, need = STREET.zoom;
        if (dp){ const w = clamp01(1.2 - Math.hypot(dp.x - L.x, dp.z - L.z)/14); tx = lerp(tx, dp.x, .35*w); tz = lerp(tz, dp.z, .35*w); ty = lerp(ty, dp.y, .3*w); need = Math.max(need, (dp.y - CURB)*Math.cos(STREET.pitch)*.62 + 3.2); }
        if (!mugCam) mugCam = { x: gx, z: gz, y: gy, zoom: gzm };
        mugCam.x = follow(mugCam.x, tx, 2.2, dt); mugCam.z = follow(mugCam.z, tz, 2.2, dt); mugCam.y = follow(mugCam.y, ty, 2.2, dt); mugCam.zoom = follow(mugCam.zoom, Math.min(13, need), 1.6, dt);
      }
      if (mugCam){ gx = mugCam.x; gz = mugCam.z; gy = mugCam.y; gzm = mugCam.zoom; }
      Object.assign(CAM, { x: lerp(from.x, gx, u), z: lerp(from.z, gz, u), y: lerp(from.y, gy, u), yaw: from.yaw + wrapA(STREET.yaw - from.yaw)*u, zoom: elerp(from.zoom, gzm, u), pitch: lerp(from.pitch, STREET.pitch, u) });
      F.riseFrom = null;
    }
    else {   // up to the metro, side on; then back over the city
      if (!F.riseFrom) F.riseFrom = Object.assign({}, CAM);
      const a = F.riseFrom, u = ease(seg(t, MK.rise, MK.side)), sx = clamp(a.x, -10*LOT, 12*LOT);
      const side = { x: sx, y: MT_Y + .5, z: MT_J*LOT, yaw: SIDE.yaw, zoom: SIDE.zoom, pitch: SIDE.pitch };
      let p = { x: lerp(a.x, side.x, u), y: lerp(a.y, side.y, u), z: lerp(a.z, side.z, u), yaw: a.yaw + wrapA(side.yaw - a.yaw)*u, zoom: elerp(a.zoom, side.zoom, u), pitch: lerp(a.pitch, side.pitch, u) };
      if (t > MK.side + .6){
        const v = ease(seg(t, MK.side + .6, MK.out)), w = seg(t, MK.side + .6, LEN);
        p = { x: lerp(side.x, GC.x + 1.5*LOT, v), y: lerp(side.y, TARGET_Y, v), z: lerp(side.z, GC.z + 1.5*LOT, v), yaw: side.yaw - .5*v - .08*w, zoom: elerp(side.zoom, 33, v), pitch: lerp(side.pitch, 31*DEG, v) };
      }
      Object.assign(CAM, p);
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // the hour: morning while it's built, early afternoon in the garden, golden hour in the street, night from the metro on
  const hourAt = t => t < MK.dive ? lerp(8, 11.5, ss(t/MK.dive)) : t < MK.garden ? lerp(13.4, 14.2, seg(t, MK.dive, MK.garden))
    : t < MK.night ? lerp(14.2, 17.3, ss(seg(t, MK.garden, MK.street))) + .25*seg(t, MK.street, MK.night) : lerp(17.55, 22.2, ss(seg(t, MK.night, MK.night + 1.6)));
  // the lights: as the game has them by day; dark once it is night, until the camera pulls back; then on one by one at the game's own pace
  const lightsAt = t => t < MK.night ? null : t < MK.lights ? 0 : clamp01((t - MK.lights)*LIGHTS_RATE);
  // the train on the line: driven so it passes in front of the camera as it settles side on
  const _um = updateMetros;
  updateMetros = function (dt, t){
    if (F.playing && LINE && LINE.train && F.t > MK.rise - 1 && F.t < MK.out + 2) safe('train', () => {
      const tr = LINE.train, Pm = mtPath(LINE), stops = Pm.stops || [], v = 2.4*LOT;
      tr.dwell = 0; tr.at = 0; tr.next = Math.max(0, stops.length - 1); tr.dir = 1; tr.v = 0; tr.doors = 0;
      const xMid = (F.riseFrom ? clamp(F.riseFrom.x, -10*LOT, 12*LOT) : PC.x) - (-R*LOT);   // (where the camera settles, along the line)
      tr.s = clamp(xMid + (F.t - (MK.side + .9))*v, .5, Pm.len - .5);
    });
    return _um(dt, t);
  };
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (F.playing) safe('frame', () => {
      F.t = Math.min(LEN, clock());
      const h = hourAt(F.t); if (!CAP && Math.abs(h - S.hour) > 1e-4) window.HOUR_DRAG_AT = performance.now(); S.hour = h;
      const lv = lightsAt(F.t); if (lv !== null) LIGHTS_ON.value = lv;
      camAt(F.t, dt);
    });
    return _uc(dt);
  };

  /* ---------- the moments ---------- */
  const EV = []; let fired = 0, t0 = 0, lastT = 0;
  const at = (t, f, name) => EV.push({ t, f, name });
  for (const s of BUILD) at(s.t, () => step(s), s.kind);
  at(MK.built - 2.4, () => garden(), 'out onto the lawn');
  MK.p.forEach((t0_, k) => {
    at(t0_ + .1, () => { MON.open(F.pairs[k].A.id); keep(document.getElementById('monitor'), true); monTab('log'); }, 'person cam ' + (k + 1));
    [.6, 1.8, 3.0, 4.3].forEach((d, s) => at(t0_ + d, () => revealStep(k, s), 'reveal ' + (k + 1) + '.' + (s + 1)));
  });
  at(MK.garden, () => { keep(document.getElementById('monitor'), false); MON.close(); E.sel.style.display = 'none'; for (const sc of F.gsc || []) safe('garden end', () => STORY.endScene(sc, 'done')); }, 'garden ends');
  at(MK.garden - 2.6, () => victimWalk(), 'someone heads across the plaza');
  at(MK.rise + 1, () => { if (MUG.sc) safe('cross end', () => STORY.endScene(MUG.sc, 'done')); }, 'street ends');
  at(MK.rain, () => { LK.wx.fadeSec = 5; LK.setWeather('rain', false, true); }, 'the rain comes in');
  at(MK.end, () => { F.playing = false; F.done = true; say('done'); if (!CAP){ E.msg.hidden = false; E.status.innerHTML = 'click to play again'; E.ov.classList.add('ask'); E.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
  EV.sort((a, b) => a.t - b.t);

  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t){
    const black = t < 1 ? 1 - ss(t/1) : t > LEN - .8 ? ss((t - (LEN - .8))/.8) : t > MK.logo ? .45*ss(seg(t, MK.logo, MK.logo + 1.4)) : 0;
    E.black.style.opacity = String(black);
    E.w1.style.opacity = String(t > MK.logo + .5 ? neonAt(t - MK.logo - .5) : 0); E.w2.style.opacity = String(t > MK.logo + .85 ? neonAt(t - MK.logo - .85) : 0);
  }
  const clock = () => (performance.now() - t0)/1000;
  function tick(){
    requestAnimationFrame(tick);
    if (!F.playing) return;
    const t = Math.min(LEN, clock()), dt = Math.max(0, Math.min(.1, t - lastT)); lastT = t; F.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); }
    paint(t);
    if (t >= MK.p[0] && t < MK.garden && F.pairs) safe('brackets', () => brackets(F.pairs[who(t)].A)); else if (E.sel.style.display !== 'none') E.sel.style.display = 'none';
    // the strike: when the one crossing is out on the plaza (or by the last moment, whoever is nearest)
    if (!MUG.struck && t >= MK.strikeBy){ const v = MUG.victim, onPlaza = v && v.x !== undefined && v.walk && Math.hypot(v.x - PC.x, v.z - PC.z) < 1.4*LOT;
      if (onPlaza || t >= MK.strikeLast) safe('mugging', () => strike(t)); }
    // the mugger: in from nowhere as they dart over, and kept in the lurkers (the game's own sweep only keeps those of its dark streets)
    if (MUG.L){ if (!lurkers.has('film') && MUG.L.state !== 'away') lurkers.set('film', MUG.L); if (MUG.L.state === 'strike' || MUG.L.state === 'rob') MUG.L.fade = Math.min(1, MUG.L.fade + dt*3); }
  }

  /* ---------- getting ready, and playing ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const s0 = performance.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - s0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  const wait = secs => { const s0 = performance.now(); return until(() => performance.now() - s0 >= secs*1000, secs + 5); };
  async function setup(){
    overlay(); settle();
    status('waking the city');
    await until(() => typeof pplReady !== 'undefined' && pplReady, 120).catch(e => warn('people', e));
    await wait(.5);
    safe('cam', () => camAt(0, 0));
    await wait(1);
    F.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ E.ov.classList.add('ask'); E.status.innerHTML = 'click to play<br><small>' + LEN + ' s, no sound</small>'; E.ov.addEventListener('click', go, { once: true }); }
    say('ready');
  }
  function go(){ E.ov.classList.remove('ask'); E.msg.hidden = true; F.playing = true; F.done = false; fired = 0; t0 = performance.now(); lastT = 0; F.t = 0; say('rolling'); }
  F.start = () => { if (!F.ready || F.playing) return false; go(); return true; };
  F.state = () => ({ ready: F.ready, playing: F.playing, done: F.done, t: F.t, stage: F.stage, info: F.info, log: F.log.slice(-30) });
  F.len = LEN;
  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); F.failed = String(e && e.message || e); });
  });
  return F;
})();
