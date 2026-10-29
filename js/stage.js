// Neon Terrarium: the stage (open the game with #stage; record it with tools/trailer/record.py --film). The film as a play: a city and a
// cast that do only what is written for them.
//
// Nothing here is decided by the game. The game's simulation is switched off entirely (its people, delivery robots, muggers, clubs, traffic,
// drones, police, metro passengers, story, cases, pacing, wire log, music, auto-placed landmarks). What the film shows is listed in two data files:
//   js/stage_city.js   every plot, building section, landmark and metro tile, each with the moment it appears and its own seed
//   js/stage_scene.js  the cast (each person's look and every move), the drone, the train, the lifts, the camera, the hour, the lights,
//                      the weather, the person cam's log, the apartment (its rooms and every piece in it) and the title
// The game is used for its makers (a plot is built by the game's own builder from the seed written for it) and its renderer, nothing else.
//
// Determinism: the film's clock is its own frame count, the same on every run however long a frame takes or the page took to load. Every
// maker runs with its own seed (a plot's look depends on its own entry and its neighbours, never on what was built before it), and whatever
// else asks for a random number while a frame is drawn (rain, flicker, a hologram's glitch) gets one from a stream seeded by the frame number.
// Run twice, the same code gives the same frames, byte for byte.
'use strict';
const PLAY = (() => {
  const G = { on: !!window.NT_STAGE, ready: false, playing: false, done: false, held: false, t: 0, frame: 0, drawn: 0, log: [], info: {}, failed: null };
  if (!G.on) return G;
  const PROBE = /probe/.test(location.hash);   // (#stage&probe: the whole city at once, no film; for working out where things are: tools/stage/probe.js)
  const CAP = !!window.__TR_CAPTURE;
  const say = (...a) => { G.log.push(a.join(' ')); if (G.log.length > 400) G.log.shift(); console.log('[stage]', ...a); };
  const warn = (what, e) => { G.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[stage] ' + what + ' ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };

  /* ---------- small maths ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, clamp01 = x => clamp(x, 0, 1);
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ss5 = x => { x = clamp01(x); return x*x*x*(x*(x*6 - 15) + 10); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const lerp = (a, b, u) => a + (b - a)*u, elerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const DEG = Math.PI/180, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  G.math = { clamp, clamp01, ss, ss5, ease, lerp, elerp, seg, DEG, wrapA };

  /* ---------- seeded numbers ---------- */
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const h32 = (...a) => { let h = 2166136261; const s = a.join('|'); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // run a maker with a stream of numbers of its own: what it makes depends on this seed, never on what ran before it
  function withSeed(seed, fn){ const was = Math.random; Math.random = rng(seed >>> 0); try { return fn(); } finally { Math.random = was; } }
  G.withSeed = withSeed; G.h32 = h32;

  /* ---------- the game, switched off: nothing acts unless the stage says so ---------- */
  maybeSpawnMegas = () => {};   // (no landmark arrives on its own)
  syncPeopleRest = () => {};   // no residents, no delivery robots, no muggers: the walking network and the doors are still worked out (syncPeopleNet: the doors are drawn from it)
  syncPeopleRestStep = () => true;
  updateCars = () => {}; updateDrones = () => {}; updateTrips = () => {}; updateHighways = () => {};   // (no traffic)
  mtAmbient = () => {}; mtRiders = () => {};   // (no metro passengers; the lifts are moved by the stage)
  updateConveyors = () => {};   // (the belts between buildings stand still: their phase was a random number)
  sfx.play = () => {};
  // every plot, landmark and the bridges between plots made from their own seeds, whatever order they are made in
  { const _rc = rebuildCell; rebuildCell = function (c){ return withSeed(h32('cell', c.i, c.j, ...c.sections.map(s => s.seed + ':' + (s.mf || 0))), () => _rc.call(this, c)); }; }
  { const _rm = rebuildMega; rebuildMega = function (m){ return withSeed(h32('mega', m.kind, m.i, m.j, m.seed), () => _rm.apply(this, arguments)); }; }
  { const _bc = rebuildConnections; rebuildConnections = function (){ return withSeed(h32('links'), () => _bc.apply(this, arguments)); }; }
  { const _sa = syncAgents; syncAgents = function (){ return withSeed(h32('agents'), () => _sa.apply(this, arguments)); }; }
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false; S.zone = null;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    safe('looks', () => { LK.auto = [{ id: 'late', start: 3 }, { id: 'morning', start: 5.5 }, { id: 'golden', start: 14 }, { id: 'dusk', start: 18.5 }, { id: 'night', start: 20 }]; });
    safe('speed', () => { if (typeof FF !== 'undefined' && FF.set) FF.set(1); });
    safe('resolution', () => { ZOOM_RES = 0; H = 0; applyRenderRes(zoom); });
    safe('story', () => { STORY.setEngine(false); STORY.tick = () => {}; });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; CASES.tick = () => {}; } });
    safe('pacing', () => { if (typeof PACE !== 'undefined') PACE.off = true; });
    safe('wirelog', () => { if (typeof WIRELOG !== 'undefined') WIRELOG.tick = () => {}; });
    safe('music', () => { music.hold(true); music.update = () => {}; });
    safe('police', () => { policeDroneAlert = () => false; });
    safe('cache', () => { SC.mode = 'off'; });
    safe('render', () => { const T = window.PERF_HUD && window.PERF_HUD.tests; if (T) T.noSlowFar = T.noSmall = T.noSpeed = true; if (typeof SD !== 'undefined') SD.on = false; if (typeof FARV !== 'undefined') FARV.on = false; });
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(CAP ? 24 : ZOOM_REF); };   // (the same pixels at every zoom)

  /* ---------- the city: built from js/stage_city.js, each piece at its moment ---------- */
  const CITY = typeof STAGE_CITY !== 'undefined' ? STAGE_CITY : null;
  let LINE = null;
  G.line = () => LINE;
  function withGreen(g, fn){ const was = GREEN_DEFAULT; GREEN_DEFAULT = g; try { return fn(); } finally { GREEN_DEFAULT = was; } }
  const BUILD = [];   // { t, f, name }
  if (CITY){
    for (const [i, j, t] of CITY.lawn) BUILD.push({ t, name: 'lawn', f: () => withSeed(h32('lawn', i, j), () => withGreen('grass', () => addPlatform(i, j, null))) });
    for (const [i, j, zone, t, seed, mf] of CITY.plots){
      if (mf){
        BUILD.push({ t, name: 'plot', f: () => withSeed(seed, () => withGreen('some', () => addPlatform(i, j, null))) });
        BUILD.push({ t: t + .13, name: 'plot section', f: () => { const c = cells.get(ckey(i, j)); if (c) withSeed(seed + 1, () => addSection(c, zone, { mf })); } });
      } else BUILD.push({ t, name: 'plot', f: () => withSeed(seed, () => withGreen('some', () => addPlatform(i, j, zone))) });
    }
    for (const [i, j, zone, t, seed, mf] of CITY.floors) BUILD.push({ t, name: 'floor', f: () => { const c = cells.get(ckey(i, j)); if (c && !c.mega) withSeed(seed, () => addSection(c, zone, mf ? { mf } : {})); } });
    for (const [kind, i, j, w, h, t, seed] of CITY.megas) BUILD.push({ t, name: 'mega ' + kind, f: () => withSeed(seed, () => { const m = spawnMegaAt(kind, { i, j, w, h }); if (!m) warn('mega', kind + ' did not fit'); }) });
    const M = CITY.metro;
    M.tiles.forEach(([i, j, t], k) => BUILD.push({ t, name: 'metro', f: () => withSeed(h32('metro', M.seed, k), () => {
      if (!k){ mtApply({ type: 'start', i, j, ok: true }); LINE = metros[metros.length - 1]; } else if (LINE) mtApply({ type: 'extend', l: LINE, i, j, ok: true });
      if (LINE) LINE.train = null; }) }));   // (the game puts a train on the line at each tile: it waits until the line is finished)
    BUILD.push({ t: M.finish, name: 'metro finish', f: () => withSeed(h32('metro', M.seed, 'finish'), () => { if (LINE){ mtApply({ type: 'finish', l: LINE, k: LINE.tiles.length - 1, ok: true }); } }) });
    BUILD.sort((a, b) => a.t - b.t);
  }
  // the world at the start: nothing at all
  function city(){
    settle();
    cells.clear(); for (const m of [...megas.values()]) megas.delete(m.id);
    metros.length = 0; highways.length = 0;
    S.hour = 10;
    rebuildAll(); finishSync();
    if (PROBE){ for (const b of BUILD) safe(b.name, b.f); finishSync(); while (anims.length) endAnim(0); finishSync(); say('probe: city built', cells.size, 'plots'); }
  }
  G.city = () => safe('city', city);

  /* ---------- the clock: frames since the film started, never anything else ---------- */
  // A frame is drawn for every frame number in turn. G.held (the apartment's lab still working) holds the number where it is: the game skips
  // that frame and the recorder takes no picture, so the film goes on exactly where it stopped.
  const FPS = 60, SC_ = typeof STAGE_SCENE !== 'undefined' ? STAGE_SCENE : null;
  let rolling = false, rendered = false;
  G.frameNow = () => {   // (main.js, each frame: the time to draw it at, or null to skip it)
    if (!rolling || G.held) return null;
    rendered = true; G.drawn++; return 1000 + G.frame*1000/FPS;
  };
  G.scene = SC_;

  /* ---------- keyed values: piecewise, eased between keys ---------- */
  const EASE = { lin: x => clamp01(x), ss, ss5, ease, hold: x => x >= 1 ? 1 : 0 };
  // keys [[t, v, easing], ...]: v at each t, eased in between by the later key's easing (lin if none); held before the first and after the last
  function keyed(keys, t){
    if (!keys || !keys.length) return null;
    if (t <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++){ const a = keys[k - 1], b = keys[k];
      if (t <= b[0]){ const u = (EASE[b[2]] || EASE.lin)((t - a[0])/Math.max(1e-6, b[0] - a[0])); return typeof a[1] === 'number' ? lerp(a[1], b[1], u) : u < 1 ? a[1] : b[1]; } }
    return keys[keys.length - 1][1];
  }
  G.keyed = keyed;

  /* ---------- the cast: each person's every move, as written ---------- */
  // A part: { id, name, look: { shape, skin, hair, top, acc, bot } (or role: 'cop'), keys: [[t, x, z, act, fx, fz, alpha, y], ...], emotes: [[t, kind, secs]] }.
  // Between two keys they go in a straight line from one place to the next doing the earlier key's act: walk, run, idle, talk, wave, phone.
  // fx, fz: which way they face when standing (moving, they face the way they go); alpha: how much of them shows (0 gone, eased to the next
  // key); y: how high their feet are (CURB on the ground). Before their first key and after their last they are where those keys put them.
  const CAST = new Map();
  function lookCode(c){
    if (c.role === 'cop') return ROW_COP;
    const L = c.look || {}, si = PG.shapes.findIndex(s => s.name === L.shape);
    if (si < 0) warn('cast', c.id + ': no shape ' + L.shape);
    return PG.code(0, Math.max(0, si), PG.palIndex(L.skin | 0, L.hair | 0, L.top | 0, L.acc | 0, L.bot | 0));
  }
  function compileCast(){
    if (!SC_) return;
    for (const c of SC_.cast || []){
      const keys = c.keys.map(k => ({ t: k[0], x: k[1], z: k[2], act: k[3] || 'idle', fx: k[4], fz: k[5], a: k[6] ?? 1, y: k[7] ?? null }));
      // distance walked by each key (the walk cycle follows the ground covered, so feet never slide)
      let d = 0; keys.forEach((k, n) => { if (n) d += Math.hypot(k.x - keys[n - 1].x, k.z - keys[n - 1].z); k.d = d; });
      CAST.set(c.id, { id: c.id, name: c.name, code: lookCode(c), keys, emotes: c.emotes || [], ph: (h32('phase', c.id) % 1000)/100 });
    }
  }
  // where a person is at time t, and what they are doing
  function poseOf(P, t){
    const K = P.keys; let a = K[0], b = K[0], u = 0;
    if (t >= K[K.length - 1].t){ a = b = K[K.length - 1]; }
    else if (t > K[0].t){ for (let n = 1; n < K.length; n++) if (t <= K[n].t){ a = K[n - 1]; b = K[n]; u = (t - a.t)/Math.max(1e-6, b.t - a.t); break; } }
    const x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), dx = b.x - a.x, dz = b.z - a.z, moving = Math.hypot(dx, dz) > 1e-3 && b !== a;
    const ya = a.y ?? CURB, yb = b.y ?? CURB, y = lerp(ya, yb, u), alpha = lerp(a.a, b.a, u), dist = lerp(a.d, b.d, u);
    return { x, y, z, act: a.act, moving, fx: moving ? dx : a.fx ?? 0, fz: moving ? dz : a.fz ?? 1, alpha, dist };
  }
  G.poseOf = id => { const P = CAST.get(id); return P ? poseOf(P, G.t) : null; };
  const STRIDE = 9/PPL_SPEED;   // walk frames per unit of ground (the game's own: 9 frames a second at its walking pace)
  function frameOf(P, q, t){
    const ph = P.ph;
    if (q.moving && q.act === 'run') return F_RUN + Math.floor(q.dist*STRIDE*.62 + ph) % PPL.walk;
    if (q.moving) return Math.floor(q.dist*STRIDE + ph) % PPL.walk;
    if (q.act === 'talk') return Math.floor(t*.9 + ph) % 3 ? F_SPEC + Math.floor(t*6 + ph) % 6 : F_IDLE + Math.floor(t*2.5 + ph) % PPL.idle;
    if (q.act === 'wave') return PG.F.WAVE + Math.floor(t*6) % 4;
    if (q.act === 'phone') return PG.F.COMM + Math.floor(t*2) % 4;
    if (q.act === 'stare') return F_IDLE;
    return F_IDLE + Math.floor(t*2.5 + ph) % PPL.idle;
  }
  // the people's sprites, drawn from the cast alone (in place of the game's updatePeople)
  updatePeople = function (){
    const pos = pplMesh.geometry.attributes.aPos, spr = pplMesh.geometry.attributes.aSpr, fce = pplMesh.geometry.attributes.aFace, P = pos.array, Q = spr.array, FA = fce.array;
    _camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    let i = 0; const t = G.t, live = PG.live();
    const emit = (x, y, z, row, frame, flip, alpha, fx, fz) => {
      if (i >= PPL_MAX) return;
      P[i*3] = x; P[i*3 + 1] = y; P[i*3 + 2] = z;
      Q[i*4] = live ? PG.shapeOf(row) : row & 31; Q[i*4 + 1] = frame; Q[i*4 + 2] = flip; Q[i*4 + 3] = alpha;
      if (fx !== undefined && (fx || fz)){ FA[i*2] = fx; FA[i*2 + 1] = fz; } else if (alpha < 1.5){ FA[i*2] = flip*_camR.x; FA[i*2 + 1] = flip*_camR.z; } else FA[i*2] = FA[i*2 + 1] = 0;
      i++; };
    for (const p of CAST.values()){
      const q = poseOf(p, t); if (q.alpha <= .002) continue;
      const sd = q.fx*_camR.x + q.fz*_camR.z, flip = Math.abs(sd) > 1e-3 ? (sd < 0 ? -1 : 1) : 1;
      emit(q.x, q.y, q.z, p.code, frameOf(p, q, t), flip, Math.min(1, q.alpha), q.fx, q.fz);
      for (const [te, kind, secs] of p.emotes) if (t >= te && t < te + secs && q.alpha > .9) emit(q.x, q.y + .8*PPL_S, q.z, ROW_EMO, EMO[kind] ?? 0, 1, 2);
    }
    pplMesh.geometry.instanceCount = i; pos.needsUpdate = spr.needsUpdate = fce.needsUpdate = true;
    ddMesh.geometry.instanceCount = 0;
  };

  /* ---------- the police drones: all of them flown by the stage (one as written, the rest still on their pads) ---------- */
  function droneSetup(){
    const D = SC_ && SC_.drone;
    (typeof POLICE_STATIONS !== 'undefined' ? POLICE_STATIONS : []).forEach((st, si) => st.drones.forEach((d, di) => {
      if (d.st.puppet) return;
      const rest = d.g.position.clone(), mine = D && D.station === si && D.index === di;
      d.st.puppet = () => {
        if (!mine) return { x: rest.x, y: rest.y, z: rest.z, light: 0, red: 0 };
        const k = keyed(D.keys.map(q => [q[0], q[1], q[7]]), G.t);
        // keys [t, x, y, z, yaw, light, red, easing]: each value eased to the next key
        const v = j => keyed(D.keys.map(q => [q[0], q[j], q[7]]), G.t);
        return { x: v(1), y: v(2), z: v(3), yaw: v(4), light: v(5), red: v(6) };
      };
    }));
  }

  /* ---------- the train and the station lifts ---------- */
  // train: { k: the stop it waits at, at: when it pulls in (from behind, stopped there by `stop`), open, close, depart, to: the stop it runs to,
  // v, a: its top speed and pick-up }. lifts: [[k, [[t, y], ...]]]: each lift cab's height over time.
  const TR = { arrive: null };
  { const _um = updateMetros;
    updateMetros = function (dt, t){
      const T = SC_ && SC_.train, tr = LINE && LINE.train, ft = G.t;
      if (T && tr) safe('train', () => {
        const P = mtPath(LINE), si = P.stops.findIndex(s => s.k === T.k), nx = P.stops.findIndex(s => s.k === T.to); if (si < 0 || nx < 0) return;
        const s0 = P.stops[si].s, s1 = P.stops[nx].s, D = s1 - s0, A = T.a, V = T.v, ta = V/A, da = .5*A*ta*ta, tRun = Math.max(0, (D - 2*da)/V), tAll = 2*ta + tRun;
        TR.arrive = T.depart + tAll;
        tr.fresh = false;
        if (ft < T.open){ tr.s = s0; tr.at = si; tr.next = si; tr.v = 0; tr.dwell = 50; tr.stopT = -.5; }   // stopped, doors shut
        else if (ft < T.close){ if (!(tr.dwell > 0) || tr.stopT < 0) tr.stopT = 0; tr.s = s0; tr.at = si; tr.next = si; tr.v = 0; tr.dwell = 50; }   // doors opening and open
        else if (ft < T.depart){ tr.s = s0; tr.at = si; tr.v = 0; tr.dwell = Math.max(.001, .7 - (ft - T.close)); }   // doors closing
        else { const u = Math.min(ft - T.depart, tAll), s = u < ta ? .5*A*u*u : u < ta + tRun ? da + V*(u - ta) : D - .5*A*(tAll - u)*(tAll - u);
          if (ft < TR.arrive){ tr.dwell = 0; tr.dir = 1; tr.at = si; tr.next = nx; tr.v = 0; tr.s = s0 + s; }
          else { if (!(tr.dwell > 0) || tr.stopT < 0) tr.stopT = -.5; tr.s = s1; tr.at = nx; tr.next = nx; tr.v = 0; tr.dwell = 50; } }
      });
      const r = _um(dt, t);
      if (SC_ && SC_.lifts && LINE && LINE.cabs) for (const [k, keys] of SC_.lifts){ const c = LINE.cabs.find(c_ => c_.k === k); if (!c) continue; const y = keyed(keys, ft); if (y !== null){ c.y = y; c.g.position.y = y; } }
      return r;
    }; }
  G.trainArrive = () => TR.arrive;

  /* ---------- the camera ---------- */
  // keys [[t, pose, easing], ...]; a pose is { x, y, z, yaw, pitch, zoom } or { follow: id, dy, yaw, pitch, zoom } (on that person, their
  // place averaged over `smooth` seconds either side so the camera glides), or { train: dy, ... } (on the train); `hump` lifts the zoom in the
  // middle of the move to it (out over the roofs and back down)
  const CAMP = { x: 0, y: TARGET_Y, z: 0, yaw: .55, zoom: 8, pitch: 40*DEG };
  function poseAt(p, t){
    const o = Object.assign({}, p);
    if (p.follow){ const P = CAST.get(p.follow); if (P){ const w = p.smooth ?? .6; let x = 0, z = 0, y = 0, n = 0;
        for (let k = -5; k <= 5; k++){ const q = poseOf(P, t + k*w/5); x += q.x; z += q.z; y += q.y; n++; }
        o.x = x/n + (p.dx || 0); o.z = z/n + (p.dz || 0); o.y = y/n + (p.dy ?? .5); } }
    if (p.train !== undefined){ const cp = LINE && LINE.train && LINE.train.cp && LINE.train.cp[1]; if (cp){ o.x = cp[0]; o.y = cp[1] + p.train; o.z = cp[2]; } }
    return o;
  }
  function camAt(t){
    const K = SC_ && SC_.camera; if (!K || !K.length) return;
    let a = K[0], b = K[0], u = 0, lin = 0;
    if (t >= K[K.length - 1][0]) a = b = K[K.length - 1];
    else if (t > K[0][0]) for (let n = 1; n < K.length; n++) if (t <= K[n][0]){ a = K[n - 1]; b = K[n]; lin = (t - a[0])/Math.max(1e-6, b[0] - a[0]); u = (EASE[b[2]] || EASE.lin)(lin); break; }
    const A = poseAt(a[1], t), B = poseAt(b[1], t);
    Object.assign(CAMP, { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), z: lerp(A.z, B.z, u), yaw: A.yaw + wrapA(B.yaw - A.yaw)*u, pitch: lerp(A.pitch, B.pitch, u), zoom: elerp(A.zoom, B.zoom, u) });
    if (b[1].hump && a !== b) CAMP.zoom *= 1 + b[1].hump*Math.sin(Math.PI*ss(lin));
  }
  { const _uc = updateCamera;
    updateCamera = function (dt){
      if (rolling) safe('frame', () => {
        camAt(G.t);
        if (window.__CAM_OVR) Object.assign(CAMP, window.__CAM_OVR);   // (checking only: tools/stage/look.js tries other camera angles; never set in a recording)
        camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal);
        yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
        const lv = keyed(SC_ && SC_.lights, G.t); if (lv !== null && lv !== undefined) LIGHTS_ON.value = lv;
        window.FILM_SH_HALF = keyed(SC_ && SC_.shadowBox, G.t) || 0;
      });
      const r = _uc(dt);
      if (rolling){ safe('paint', () => paint(G.t)); safe('monitor', () => monFrame(G.t)); }   // (after the camera is placed: the brackets follow the person on screen, the feed draws this frame's people)
      return r;
    }; }

  /* ---------- the page: the game's interface hidden, the stage's on top ---------- */
  const E = {};
  function overlay(){
    document.documentElement.classList.add('tr-on');
    const st = document.createElement('style'); st.id = 'stageStyle';
    st.textContent = `
      html.tr-on body > *:not(#view):not(#stOv):not(#furnish):not(.tr-keep){visibility:hidden!important}
      html.tr-on .furnish-frame{transition:none!important}
      html.tr-on .furnish.derez::before, html.tr-on .furnish.derez::after{display:none!important}
      html.tr-on, html.tr-on *{cursor:none!important}
      html.tr-on #monitor.tr-keep{transform:scale(var(--monk,1.4));transform-origin:top right;top:3vh!important;right:2vh!important;max-height:calc(94vh/var(--monk,1.4))!important;overflow:hidden;transition:none!important;animation:none!important}
      html.tr-on #monitor.tr-keep *{transition:none!important;animation:none!important}
      html.tr-on #monitor.tr-keep #monPin, html.tr-on #monitor.tr-keep #monClose{visibility:hidden!important}
      html.tr-on #monitor.tr-keep #monTabs{display:none!important}
      #stOv{position:fixed;inset:0;z-index:9001;pointer-events:none}
      #stOv > i{position:absolute;inset:0;display:block;opacity:0;background:#000}
      #stSel{position:absolute;left:0;top:0;width:0;height:0;display:none;pointer-events:none}
      #stSel b{position:absolute;width:22px;height:22px;border:3px solid #38e8e0;filter:drop-shadow(0 0 6px rgba(56,232,224,.9))}
      #stSel b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #stSel b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #stSel b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #stSel b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #stSel i{position:absolute;left:50%;top:-14px;width:8px;height:8px;margin-left:-4px;background:#ff4fa3;transform:rotate(45deg);box-shadow:0 0 10px #ff4fa3}
      #stTitle{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      #stTitle svg{width:74vw;max-height:60vh;height:auto;display:block;overflow:visible}
      #stTitle #neon{filter:drop-shadow(0 0 .35vw rgba(255,74,110,.85)) drop-shadow(0 0 1.6vw rgba(255,74,110,.45))}
      #stTitle #terrarium{filter:drop-shadow(0 0 .3vw rgba(61,255,207,.8))}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'stOv';
    ov.innerHTML = '<i id="stBlack"></i><div id="stSel"><b></b><b></b><b></b><b></b><i></i></div><div id="stTitle"></div>';
    document.body.appendChild(ov);
    const monk = () => document.documentElement.style.setProperty('--monk', (1.4*innerHeight/1080).toFixed(3)); monk(); addEventListener('resize', monk);
    Object.assign(E, { ov, black: ov.querySelector('#stBlack'), sel: ov.querySelector('#stSel'), title: ov.querySelector('#stTitle') });
  }
  // the title: Ashley's own (assets/trailer/neon_terrarium_title.svg), both words the same height, cropped to what it draws so it sits in the middle
  async function title(){
    const txt = await fetch('assets/trailer/neon_terrarium_title.svg').then(r => r.text());
    E.title.innerHTML = txt;
    const svg = E.title.querySelector('svg'); svg.removeAttribute('width'); svg.removeAttribute('height');
    E.title.style.visibility = 'hidden';
    const g = [svg.querySelector('#neon'), svg.querySelector('#terrarium')], nb = g[0].getBBox(), tb = g[1].getBBox();
    if (nb.height > 0 && tb.height > 0){
      const k = nb.height/tb.height, gap = nb.height*.28, cx = nb.x + nb.width/2;
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g[1].parentNode.insertBefore(wrap, g[1]); wrap.appendChild(g[1]);
      g[1].setAttribute('transform', `translate(${cx - tb.width*k/2} ${nb.y + nb.height + gap}) scale(${k}) translate(${-tb.x} ${-tb.y})`);
      const ww = Math.max(nb.width, tb.width*k), x0 = cx - ww/2, y0 = nb.y, hh = nb.height*2 + gap, pad = nb.height*.12;
      svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${ww + 2*pad} ${hh + 2*pad}`);
    }
    E.tNeon = g[0]; E.tTerr = g[1]; E.tNeon.style.opacity = E.tTerr.style.opacity = '0'; E.title.style.visibility = '';
  }
  const _v = new THREE.Vector3();
  function brackets(q){
    if (!q){ E.sel.style.display = 'none'; return; }
    _v.set(q.x, q.y + .42, q.z).project(cam);
    const sx = (_v.x + 1)/2*innerWidth, sy = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.sel.style.display = 'block'; E.sel.style.transform = `translate(${(sx - w/2).toFixed(1)}px,${(sy - h/2).toFixed(1)}px)`; E.sel.style.width = w.toFixed(0) + 'px'; E.sel.style.height = h.toFixed(0) + 'px';
  }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t){
    E.black.style.opacity = String(keyed(SC_.black, t) ?? 0);
    const T = SC_.title; if (T && E.tNeon){ E.tNeon.style.opacity = String(neonAt(t - T.neon)); E.tTerr.style.opacity = String(neonAt(t - T.terrarium)); }
    const B = (SC_.brackets || []).find(([a, b]) => t >= a && t < b); brackets(B ? G.poseOf(B[2]) : null);
  }

  /* ---------- the person cam: the game's panel, filled in by the stage ---------- */
  // monitor: [{ t0, t1, actor, name, sub, clock, yaw, pitch, log: [[t, stamp, text]], fade }]: who it watches from when to when, the name and
  // line under it, the time shown on the feed, the feed camera's angle, the log lines and when each appears
  const MONI = { el: null, cv: null, g: null, rt: null, fcam: null, pix: null, img: null, off: null, og: null, cur: null, shownLog: -1 };
  const RW = 192, RH = 108, HALF = 2.6;
  function monSetup(){
    MONI.el = document.getElementById('monitor'); MONI.cv = document.getElementById('monFeed'); MONI.g = MONI.cv.getContext('2d');
    MONI.rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
    MONI.fcam = new THREE.OrthographicCamera(-HALF*RW/RH, HALF*RW/RH, HALF, -HALF, NEAR, FAR); MONI.fcam.layers.enableAll(); MONI.fcam.layers.disable(6);
    MONI.pix = new Uint8Array(RW*RH*4); MONI.off = document.createElement('canvas'); MONI.off.width = RW; MONI.off.height = RH; MONI.og = MONI.off.getContext('2d'); MONI.img = MONI.og.createImageData(RW, RH);
    const tabs = document.querySelectorAll('#monTabs button'); tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === 'log'));
    const tr = document.getElementById('monTrace'); if (tr) tr.textContent = '';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function monFrame(t){
    const M = (SC_.monitor || []).find(m => t >= m.t0 && t < m.t1);
    if (!M){ if (MONI.cur){ MONI.cur = null; MONI.el.hidden = true; MONI.el.classList.remove('tr-keep'); } return; }
    if (MONI.cur !== M){ MONI.cur = M; MONI.shownLog = -1; MONI.el.hidden = false; MONI.el.classList.add('tr-keep'); }
    MONI.el.style.opacity = String(Math.min(1, ss((t - M.t0)/(M.fade || .3)), ss((M.t1 - t)/(M.fade || .3))));
    document.getElementById('monName').textContent = M.name; document.getElementById('monSub').textContent = M.sub;
    const n = M.log.filter(l => t >= l[0]).length;
    if (n !== MONI.shownLog){ MONI.shownLog = n; const body = document.getElementById('monBody');
      body.innerHTML = n ? M.log.slice(0, n).map(([, stamp, text]) => '<div class="ml reveal"><time>' + esc(stamp) + '</time><span>' + esc(text) + '</span></div>').join('') : '<p class="mon-empty">Nothing logged yet.</p>';
      body.scrollTop = body.scrollHeight; }
    // the feed: a camera of its own over the person, at the angle written for it
    const q = G.poseOf(M.actor); if (!q) return;
    const fc = MONI.fcam, cp = Math.cos(M.pitch), sy = Math.sin(M.yaw), cy = Math.cos(M.yaw), sp = Math.sin(M.pitch), y = q.y + .45;
    fc.position.set(q.x + sy*cp*CAM_DIST, y + sp*CAM_DIST, q.z + cy*cp*CAM_DIST); fc.lookAt(q.x, y, q.z); fc.updateMatrixWorld();
    const res0 = FOL_UNI.res.value.clone(), rt0 = renderer.getRenderTarget(), all0 = SIDE_ARC.all, ac = renderer.autoClear, glc = renderer.getContext();
    try {
      FOL_UNI.res.value.set(RW, RH); SIDE_ARC.all = true; cullFrame(fc); CULL.lvl = -1; CULL.sd = false; pplFeedPre(fc);
      renderer.setRenderTarget(MONI.rt); renderer.setClearColor(0x05080f, 1); renderer.autoClear = true; renderer.render(scene, fc);
      glc.readPixels(0, 0, RW, RH, glc.RGBA, glc.UNSIGNED_BYTE, MONI.pix);
    } finally { pplFeedPost(); FOL_UNI.res.value.copy(res0); SIDE_ARC.all = all0; renderer.autoClear = ac; renderer.setRenderTarget(rt0); sideArc(); cullFrame(); }
    const d = MONI.img.data; for (let r = 0; r < RH; r++){ const src = (RH - 1 - r)*RW*4; d.set(MONI.pix.subarray(src, src + RW*4), r*RW*4); }
    MONI.og.putImageData(MONI.img, 0, 0);
    const g = MONI.g, W = MONI.cv.width, Hh = MONI.cv.height;
    g.fillStyle = '#05080f'; g.fillRect(0, 0, W, Hh); g.drawImage(MONI.off, 0, 0, W, Hh);
    g.fillStyle = 'rgba(20,60,70,.18)'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let yy = 0; yy < Hh; yy += 3) g.fillRect(0, yy, W, 1);
    const vg = g.createRadialGradient(W/2, Hh/2, Hh*.3, W/2, Hh/2, W*.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    g.font = '10px "Silkscreen", monospace'; g.textBaseline = 'top';
    g.fillStyle = Math.floor(t/.6) % 2 ? '#ff4f6a' : 'rgba(255,79,106,.25)'; g.fillRect(8, 9, 6, 6);
    g.fillStyle = '#e3d6bd'; g.fillText('REC', 18, 7);
    g.textAlign = 'right'; g.fillText(M.cam || 'CAM 07', W - 8, 7); g.textAlign = 'left';
    g.fillText(M.clock || '', 8, Hh - 16);
  }

  /* ---------- doors: a building's front door opening and shutting, as written ---------- */
  function doorsAt(t){
    for (const [key, keys] of SC_.doors || []){ const d = doorByKey.get(key); if (!d) continue; const v = keyed(keys, t);
      if (v !== null && Math.abs(v - d.open) > 1e-4){ d.open = v; const i = doorList.indexOf(d); if (i >= 0 && i < DOOR_MAX){ setPanel(i, d); doorPanel.instanceMatrix.needsUpdate = true; } } }
  }

  /* ---------- the apartment: the second person's pod, in Furnish pod ---------- */
  // Its rooms and every piece in them come from the script (apartment.recipe, handed to the lab as the pod's saved home through STAGE_KEYS).
  // The lab's hologram flies in from the game's view and back out to it, its time set by the stage every frame (PodContext._debug.hold);
  // before it moves the stage waits (G.held) until the lab has the city, the home built and lit, so the hologram plays through in one go.
  const AP = { on: false, picked: false, hidden: [], closed: false, heldN: 0, rev: false };
  const labWin = () => { const f = FURN.frame; return f && f.contentWindow; };
  const labPC = () => { const w = labWin(); return w && w.PodContext; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  function B_fit(w){ try { const B = w.PodBuilder && w.PodBuilder._B; if (B){ B.cw = 0; B.camDirty = true; B.needs = true; } w.dispatchEvent(new w.Event('resize')); } catch (e) {} }   // (the lab's picture sized to its window again, after the stage's own layout above)
  // once a second while the apartment is on: what the lab is doing, in the log and the recorder's terminal (for finding out why a machine shows it grey)
  function labReport(t, st, B, w, ov){
    const gi = gl => { try { if (!gl) return 'no context'; if (gl.isContextLost()) return 'CONTEXT LOST'; const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (x) { return 'err ' + x.message; } };
    const cvs = [...w.document.querySelectorAll('canvas')].map(c => { const r = c.getBoundingClientRect(), cs = w.getComputedStyle(c); return (c.id || c.className || 'canvas') + ' ' + c.width + 'x' + c.height + ' at ' + Math.round(r.width) + 'x' + Math.round(r.height) + (c.classList.contains('st-vis') ? ' SHOWN' : '') + (cs.display === 'none' ? ' display:none' : '') + ' op ' + cs.opacity; });
    const fr = FURN.frame, fcs = getComputedStyle(fr), ocs = ov && getComputedStyle(ov);
    // what the lab's own canvas holds, read straight off the graphics card (five spots, as r,g,b), and the hologram's backdrop: a blank here is a drawing
    // problem; a picture here that the recording lacks is a capture problem
    const px = safe('px', () => { const gl = B && B.dr && B.dr.getContext(); if (!gl) return null; const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, out = [], b = new Uint8Array(4);
      for (const [fx, fy] of [[.5, .5], [.25, .25], [.75, .75], [.5, .85], [.3, .6]]){ gl.readPixels(Math.floor(W*fx), Math.floor(H*fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); out.push(b[0] + ',' + b[1] + ',' + b[2] + ',' + b[3]); } return W + 'x' + H + ' ' + out.join(' | '); });
    const sky = safe('sky', () => { const c = w.document.getElementById('bSky'); if (!c) return null; const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; });
    const bd = safe('bd', () => w.PodContext._debug.backdropCheck());
    const holo = safe('holo', () => { const C = w.PodContext._debug.state(); if (!C || !C.T || !C.T.holo || !C.R) return null; const t = C.T.holo, b = new Uint8Array(4); C.R.readRenderTargetPixels(t, t.width >> 1, t.height >> 1, 1, 1, b); return t.width + 'x' + t.height + ' ' + b[0] + ',' + b[1] + ',' + b[2] + ',' + b[3]; });
    say('lab', JSON.stringify({ t: +t.toFixed(2), px, sky, holo, bd, pr: B && B.dr ? B.dr.getPixelRatio() : null, dpr: w.devicePixelRatio, gl: gi(B && B.dr && B.dr.getContext()), main: gi(renderer.getContext()), loop: !!(B && B.raf), drawnFrames: st && st.trans ? st.trans.frames.length : null, hold: st && st.trans ? st.trans.hold : null, prOn: !!(B && B.prOn), pieces: B && B.inst ? B.inst.size : 0, wait: labWait(), city: st && st.city ? { building: !!st.city.building, geos: st.city.geos ? st.city.geos.length : 0 } : null, warm: safe('warm', () => w.PodRender.warmState()), light: safe('lw', () => w.PodRender.lightWhy()), drives: safe('drv', () => w.PodContext._prDriving()),
      frame: Math.round(fr.clientWidth) + 'x' + Math.round(fr.clientHeight) + ' op ' + fr.style.opacity + ' vis ' + fcs.visibility, overlay: ov ? (ov.className + ' ' + ocs.display + ' op ' + ocs.opacity + ' z ' + ocs.zIndex) : 'none', canvases: cvs }));
  }
  function labClean(){
    const w = labWin(); if (!w || !w.document || !w.document.head) return;
    const d = w.document;
    if (!d.getElementById('stLab')){ const st = d.createElement('style'); st.id = 'stLab'; st.textContent = 'body *{visibility:hidden!important}.st-vis{visibility:visible!important}*{cursor:none!important;transition:none!important;animation:none!important}html,body{overflow:hidden!important}#bStage{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;max-height:none!important;margin:0!important}'; d.head.appendChild(st); B_fit(w); }
    const big = w.innerWidth*w.innerHeight*.45;
    for (const cv of d.querySelectorAll('canvas')){ const r = cv.getBoundingClientRect(); cv.classList.toggle('st-vis', r.width*r.height > big); }
  }
  function labSharp(){
    const B = labB(); if (!B || !B.dr || B.dr._stSharp) return;
    const R = B.dr, render = R.render.bind(R); R._stSharp = true;
    R.render = (sc, c) => { const m = sc && sc.children && sc.children[0] && sc.children[0].material, u = m && m.uniforms;
      if (u && u.kMin && u.range && u.hazeK){ u.kMin.value = 0; u.range.value = 1e6; u.hazeK.value = Math.min(u.hazeK.value, .25); }
      return render(sc, c); };
  }
  function labWait(){   // the home still being built, or its light not baked yet
    const w = labWin(); if (!w) return false;
    try { const PB = w.PodBuilder, PR = w.PodRender, PC = w.PodContext;
      if (PB && PB.homePending && PB.homePending()) return 'build';
      { const C = PC && PC._debug && PC._debug.state(); if (C && C.city && C.city.building) return 'the hologram city'; }   // (built a piece at a time between frames: a fast machine got past it with the hologram still empty)
      { const ws = PR && PR.warmState && PR.warmState(); if (ws && !ws.broken && (!ws.finished || !ws.matReady || ws.queue)) return 'shaders'; }   // (the room's programs compile in the background on some graphics chips: until then it draws nothing)
      if (PB && PB.prOn && PB.prOn()) return !(PC._prDriving && PC._prDriving()) || (PR && PR.lightPending && PR.lightPending()) ? 'light' : false; } catch (e) {}
    return false;
  }
  const H0 = .3, holoCurve = x => { x = clamp01(x); return .55*x + .45*ss5(x); };
  function aptTick(t){
    const A = SC_ && SC_.apartment; if (!A || AP.closed || t < A.open) return;
    if (!AP.on){ AP.on = !!safe('open', () => FURN.openKey(A.pod)); if (!AP.on){ warn('apartment', 'did not open ' + A.pod); AP.closed = true; return; } say('apartment', A.pod); }
    const ov = document.getElementById('furnish'), fr = FURN.frame, PC = labPC(), B = labB(), w = labWin();
    if (!fr || !PC || !PC._debug) return aptEnd('the lab went away');
    // the lab's own random numbers follow the frame too
    if (w) w.Math.random = rng(h32('lab', G.frame));
    // (checking switches in the address, for finding what the lab needs on a given machine: &nosharp leaves its own depth blur and haze as they are,
    // &plainlab draws the room without PodRender's lighting)
    safe('lab', labClean); if (!/[&#]nosharp\b/.test(location.hash)) safe('sharp', labSharp);
    if (/[&#]plainlab\b/.test(location.hash) && !AP.plain){ AP.plain = true; safe('plain', () => { w.PodBuilder.usePodRender(false); say('lab: PodRender off (plainlab)'); }); }
    if (B) B.needs = true;
    // the lab stops its own frame loop when it thinks nothing is changing (or it is warming up behind the city): while the apartment is on, it draws every frame
    if (B && B.on && !B.raf) safe('lab loop', () => { const PB = w.PodBuilder; if (B.warmHold && PB.warmHold) PB.warmHold(false); if (!B.raf && PB.pauseRender) PB.pauseRender(false); if (!B.raf) warn('apartment', 'the lab loop would not start'); });
    const D_ = PC._debug.DUR || 3.05, st = PC._debug.state(), live = ov && ov.classList.contains('live');
    if ((G.frame % 60 === 0 && AP.repF !== G.frame) || !AP.told){ AP.told = true; AP.repF = G.frame; safe('lab report', () => labReport(t, st, B, w, ov)); }
    // (held: the clock steps on, no frame is drawn or captured. Capped by real time, not steps: a fast machine takes many more steps a second)
    const wait = why => { AP.heldN++; if (AP.held0 == null) AP.held0 = Date.now(); if (Date.now() - AP.held0 > 240e3){ if (!AP.gaveUp){ AP.gaveUp = true; warn('apartment', 'waited 4 min for the lab (' + why + '): going on'); } return false; }
      if (G.info.aptWait !== why) say('waiting for the lab:', why); G.held = true; G.info.aptWait = why; return true; };
    if (t < A.room){   // the hologram flies in
      const u = H0 + (D_ - H0)*holoCurve((t - A.open)/(A.room - A.open)), first = t - A.open < .5/FPS;
      if (!live && wait('the hologram')) return;
      if (!st || !st.trans){ if (first && wait('the hologram to start')) return; }
      else {
        const lw = labWait(); st.trans.holding = !!lw; st.trans.holdBuild = lw === 'build';
        if (first){
          if (!(st.ready && st.shown && !st.pendingHome)){ PC._debug.hold(H0); if (wait('the city')) return; }
          if (lw){ PC._debug.hold(H0); if (wait(lw)) return; }
          if (!AP.picked && B){ AP.picked = true;   // the lab's camera as the script has it (the whole flat in the frame), and the pieces that are set down later, hidden for now
            if (A.labZoom){ B.zoom = A.labZoom; B.camDirty = true; } if (A.labPan){ B.tx = A.labPan[0]; B.tz = A.labPan[1]; B.camDirty = true; }
            for (const d of A.drops || []){ const i = B.inst.get(d.id); if (i && i.pivot){ AP.hidden.push({ i, y: i.pivot.position.y, t: A.room + d.at }); i.pivot.visible = false; } else warn('apartment', 'no piece ' + d.id); } }
        }
        PC._debug.hold(u);
      }
      fr.style.opacity = String(ss((t - A.open)/.6));
      return;
    }
    if (t < A.unroom){   // the pieces set down one after another
      if (st && st.trans){ PC._debug.hold(D_ + .01); return; }
      if (PC.transitioning && wait('the hologram to end')) return;
      if (!AP.roomOk){ const lw = labWait(); if (lw && wait('the room: ' + lw)) return; AP.roomOk = true; }
      fr.style.opacity = '1';
      for (const d of AP.hidden){ const u = (t - d.t)/.75; d.i.pivot.visible = u >= 0; if (u < 0) continue; const e = 1 - Math.pow(1 - Math.min(1, u), 3); d.i.pivot.position.y = d.y + .45*(1 - e); }
      return;
    }
    if (t < A.back){   // the hologram flies back out, to the game's view as it was left
      for (const d of AP.hidden){ d.i.pivot.visible = true; d.i.pivot.position.y = d.y; }
      if (!AP.rev){ AP.rev = true;
        if (st && !st.trans){ st.trans = { t0: performance.now(), vt: D_ - .01, last: performance.now(), drift: 0, gate: false, rm: false, frames: [], onDone: null, resolve(){}, skipped: false, lhDone: true, hold: D_ - .01 }; PC.transitioning = true; }
        FURN.hold = false;   // (the city drawn again underneath, from where the camera was left)
      }
      if (st && st.trans){ st.trans.holding = false; PC._debug.hold(Math.min(D_ - .01, H0 + (D_ - H0)*(1 - holoCurve((t - A.unroom)/(A.back - A.unroom))))); }
      fr.style.opacity = String(1 - ss(seg(t, A.back - A.fade, A.back)));
      return;
    }
    aptEnd();
  }
  function aptEnd(why){
    if (AP.closed) return; AP.closed = true;
    if (why) warn('apartment', why);
    safe('close', () => { const PC = labPC(), st = PC && PC._debug && PC._debug.state(); if (st && st.trans){ st.trans = null; PC.transitioning = false; }
      const ov = document.getElementById('furnish'); if (ov) ov.classList.remove('live');
      FURN.close(); if (FURN.frame) FURN.frame.style.opacity = ''; });
  }

  /* ---------- the timeline ---------- */
  const EV = []; let fired = 0;
  for (const b of BUILD) EV.push({ t: b.t, name: b.name, f: b.f });
  if (SC_) for (const [t, kind, fade] of SC_.weather || []) EV.push({ t, name: 'weather ' + kind, f: () => { LK.wx.fadeSec = fade; LK.setWeather(kind, false, true); } });
  EV.push({ t: 14.2, name: 'the drones', f: () => droneSetup() });
  EV.sort((a, b) => a.t - b.t);
  // Each step of the clock: once a frame has been drawn, the next is made ready (its moments fired, the hour set...); main.js draws it on the
  // next step. Held, nothing changes and nothing is drawn.
  function tick(){
    requestAnimationFrame(tick);
    if (!rolling || G.done) return;
    if (rendered){ G.frame++; rendered = false; }
    prep();
  }
  function prep(){
    const t = G.t = G.frame/FPS;
    G.held = false;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); }
    safe('drones', () => droneSetup());
    safe('apartment', () => aptTick(t));
    if (G.held) return;
    Math.random = rng(h32('frame', G.frame));   // (anything else that draws a random number this frame gets one from the frame's own stream)
    const h = keyed(SC_.hour, t); if (h !== null) S.hour = h;
    safe('doors', () => doorsAt(t));
    if (t >= SC_.end){ G.done = true; G.playing = false; say('done at', t.toFixed(2)); }
  }

  /* ---------- getting ready, and playing ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const s0 = performance.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - s0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  async function setup(){
    if (PROBE) return;
    // every font the frames use, loaded before anything rolls (the page asks for them with display=swap: otherwise one could arrive mid-film and swap in)
    await Promise.race([Promise.all(['12px Silkscreen', '400 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '500 12px "Chakra Petch"', '600 12px "Chakra Petch"'].map(f => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 20000))]).catch(() => null);
    say('fonts', [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ') || 'none loaded (the fallbacks, throughout)');
    overlay(); monSetup(); compileCast();
    await title().catch(e => warn('title', e));
    if (SC_ && SC_.apartment){ safe('lab', () => FURN.preload()); await until(() => FURN.frame && FURN.ready, 400).catch(e => warn('apartment lab', e)); }
    G.ready = true; say('ready', CAST.size, 'people in the cast');
  }
  G.start = () => {
    if (!G.ready || rolling) return false;
    G.frame = 0; rendered = false; G.t = 0; rolling = true; G.playing = true;
    last = 1000 - 1000/FPS;   // (main.js: the first frame is one frame after this)
    cloudMat.uniforms.cloudOff.value.set(0, 0); clouds.rotation.y = 0; comp.uniforms.rainT.value = 0;   // (what the frames add up from: from nothing)
    const jm = /[&#]from=([\d.]+)/.exec(location.hash);   // (#stage&from=<seconds>: checking only, never recorded: the city up to then built at once and the film started there)
    if (jm){ G.frame = Math.round(+jm[1]*FPS); prep(); while (anims.length) endAnim(0); finishSync(); say('jumped to', jm[1]); }
    prep(); say('rolling'); return true;
  };
  G.state = () => ({ ready: G.ready, playing: G.playing, done: G.done, held: G.held, t: G.t, frame: G.frame, drawn: G.drawn, info: G.info, log: G.log.slice(-30) });
  // (#stage&play: starts by itself once ready, at the machine's own pace, for watching in an ordinary browser window: never how the film is recorded)
  addEventListener('load', () => { setup().then(() => { requestAnimationFrame(tick); if (/[&#]play\b/.test(location.hash)) G.start(); }).catch(e => { warn('setup', e); G.failed = String(e && e.message || e); }); });
  return G;
})();
