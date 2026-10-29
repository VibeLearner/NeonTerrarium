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
      // (the first stop's lift on the side the finished line has it, +1, from the start: as the line was laid a plot going up beside it turned it
      // round to the other side for a while and back, and it jumped between the two)
      const ms = mtSides; mtSides = l => { ms(l); if (l === metros[0] && l.sides) l.sides[0] = M.liftSide0 ?? 1; };
      try { if (!k){ mtApply({ type: 'start', i, j, ok: true }); LINE = metros[metros.length - 1]; } else if (LINE){   // (the game's extend, but only the new tile's plot built again: the game's own built the whole line's plots and the first stop's lift again at
          // every tile, and the lift was gone for that frame; the finish builds them all again, as the game does)
          const l = LINE; l.tiles.push({ i, j }); mtActive = l; mtReindex(); mtSides(l); mtBuildView(l); mtResetTrain(l);
          const c = cells.get(ckey(i, j)); if (c) refresh([c]); SC_DIRTY.unknown = true; shadowDirty = true; } }
      finally { mtSides = ms; }
      if (LINE) LINE.train = null; }) }));   // (the game puts a train on the line at each tile: it waits until the line is finished)
    BUILD.push({ t: M.finish, name: 'metro finish', f: () => withSeed(h32('metro', M.seed, 'finish'), () => { if (LINE){ const ms = mtSides; mtSides = l => { ms(l); if (l === LINE && l.sides) l.sides[0] = M.liftSide0 ?? 1; }; try { mtApply({ type: 'finish', l: LINE, k: LINE.tiles.length - 1, ok: true }); } finally { mtSides = ms; } } }) });
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
        const y = v(2), up = Math.hypot(v(1) - rest.x, y - rest.y, v(3) - rest.z) > .05;   // (off its pad: it flies lower than the pad when it follows him) d.st.spin = up ? 1 : 0;
        // the rotors turned by the film's clock, a fixed step a frame (.37 rad: plainly spinning, never a whole blade's turn, so never seen still)
        if (up) d.st.bA = (G.frame*.37) % (2*Math.PI);
        return { x: v(1), y, z: v(3), yaw: v(4), light: v(5), red: v(6), blades: d.st.bA || 0 };
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
        const tt = p.atT ?? t;   // (atT: on where they were at that moment, held)
        for (let k = -5; k <= 5; k++){ const q = poseOf(P, tt + k*w/5); x += q.x; z += q.z; y += q.y; n++; }
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
        if (AP.camM) Object.assign(CAMP, AP.camM);   // (the apartment in the real city: the game camera matched to the lab's, bgGame)
        if (window.__CAM_OVR) Object.assign(CAMP, window.__CAM_OVR);   // (checking only: tools/stage/look.js tries other camera angles; never set in a recording)
        camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal);
        yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
        const lv = keyed(SC_ && SC_.lights, G.t); if (lv !== null && lv !== undefined) LIGHTS_ON.value = lv;
        window.FILM_SH_HALF = keyed(SC_ && SC_.shadowBox, G.t) || 0;
      });
      const r = _uc(dt);
      if (rolling){ safe('paint', () => paint(G.t)); safe('monitor', () => monFrame(G.t)); if (AP.bg) safe('tilt', tiltAt); safe('near', nearClip); }   // (after the camera is placed: the brackets follow the person on screen, the feed draws this frame's people)
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
      html.tr-on .furnish-frame.st-pix{opacity:0!important}
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
    { let nm = M.name, sb = M.sub; for (const [tn, n2, s2] of M.names || []) if (t >= tn){ nm = n2; sb = s2 ?? sb; }   // (a name that comes in partway: the identity pulled)
      document.getElementById('monName').textContent = nm; document.getElementById('monSub').textContent = sb; }
    const n = M.log.filter(l => t >= l[0]).length;
    if (n !== MONI.shownLog){ MONI.shownLog = n; const body = document.getElementById('monBody');
      body.innerHTML = n ? M.log.slice(0, n).map(([, stamp, text]) => '<div class="ml reveal"><time>' + esc(stamp) + '</time><span>' + esc(text) + '</span></div>').join('') : '';
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
    for (const [key, keys] of SC_.doors || []){ const d = doorByKey.get(key); if (!d) continue; if (AP.hh && AP.hh.door === key) continue;   // (the home's own door: out of sight with its building while the flat stands there)
      const v = keyed(keys, t);
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
  // (the lab measures its picture again through its own pixCap, which zeroes the width and resizes at once: zeroing it and firing a window
  // "resize" left it at 0 wide in a real Chrome, the camera with no frame, and every 3D thing in the lab unseen: the grey apartment on a Mac)
  function B_fit(w){ try { const PB = w.PodBuilder, B = PB && PB._B; if (PB && PB.pixCap) PB.pixCap(); if (B){ B.camDirty = true; B.needs = true; } } catch (e) {} }   // (the lab's picture sized to its window again, after the stage's own layout above)
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
      if (u && u.kMin && u.range && u.hazeK && !AP.unsharp){ u.kMin.value = 0; u.range.value = 1e4; u.hazeK.value = Math.min(u.hazeK.value, .25); }   // (no depth blur on the city around the flat, a little of its haze kept)
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
    // (the lab's room merges off for the film: a merge built while the pieces set down later were hidden could take them in and draw them all along)
    if (!AP.on) safe('lab options', () => { const w0 = labWin(); if (w0) w0.__prAB = Object.assign({}, w0.__prAB || {}, { l2Merge: false }); });
    if (!AP.on){ AP.on = !!safe('open', () => FURN.openKey(A.pod)); if (!AP.on){ warn('apartment', 'did not open ' + A.pod); AP.closed = true; return; } say('apartment', A.pod); }
    const ov = document.getElementById('furnish'), fr = FURN.frame, PC = labPC(), B = labB(), w = labWin();
    if (!fr || !PC || !PC._debug) return aptEnd('the lab went away');
    // the lab's own random numbers follow the frame too
    if (w) w.Math.random = rng(h32('lab', G.frame));
    // (checking switches in the address, for finding what the lab needs on a given machine: &sharp takes out its depth blur and haze (off by default: it broke the room on a Mac),
    // &plainlab draws the room without PodRender's lighting)
    safe('lab', labClean); if (!/[&#]nosharp\b/.test(location.hash)) safe('sharp', labSharp);   // (the city behind the flat in focus. Once blamed for a grey room on a Mac: that was the lab drawn 0 wide, B_fit)
    if (/[&#]plainlab\b/.test(location.hash) && !AP.plain){ AP.plain = true; safe('plain', () => { w.PodBuilder.usePodRender(false); say('lab: PodRender off (plainlab)'); }); }
    if (B) B.needs = true;
    // the lab's work light (its flat building light) off: the room lit by its own lamps and the day through its windows. Its own button, so the
    // lab does everything it does for that (PodRender told, the light baked again); the bake is waited for before anything is shown (labWait)
    if (B && B.work) safe('work light', () => { const bw = w.document.getElementById('bWork'); if (bw) bw.click(); else B.work = false; });
    if (B && (!B.cw || !B.ch)) safe('lab size', () => { w.PodBuilder.pixCap(); B.camDirty = true; warn('apartment', 'the lab had no picture size: measured again (' + B.cw + 'x' + B.ch + ')'); });
    // the lab stops its own frame loop when it thinks nothing is changing (or it is warming up behind the city): while the apartment is on, it draws every frame
    if (B && B.on && !B.raf) safe('lab loop', () => { const PB = w.PodBuilder; if (B.warmHold && PB.warmHold) PB.warmHold(false); if (!B.raf && PB.pauseRender) PB.pauseRender(false); if (!B.raf) warn('apartment', 'the lab loop would not start'); });
    const D_ = PC._debug.DUR || 3.05, st = PC._debug.state(), live = ov && ov.classList.contains('live');
    // the pieces that are set down later, hidden the moment the home is built: before the lab works out its light, so it never lights the room with
    // them in it (a lamp hidden after that lit the wardrobe, then left it dark, then lit it again as it came back)
    if (!AP.hid && B && B.inst && B.inst.size && !safe('pending', () => w.PodBuilder.homePending())) dropsHide(B);
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
          // the hologram's first frame framed exactly as the game's camera was the moment before (furnish.html flyCam: holoStart.exact keeps its
          // width as given, otherwise at least eight times the room's): the width the game camera shows, in lab metres (SCALE = 3/.95 there)
          if (!AP.framed && st.city && st.city.holoStart){ const S0 = st.city.holoStart; AP.framed = true; AP.cityW = S0.w;
            S0.w = 2*zoom*(innerWidth/Math.max(1, innerHeight))*(3/.95); S0.exact = true; }
          if (!AP.picked && B){ AP.picked = true;   // the lab's camera as the script has it (the whole flat in the frame), and the pieces that are set down later, hidden for now
            // the flat seen from the way the game camera looked when he went in, so the city around it is where it was in the shot before: the lab turns
            // the city by th (unitMatrix: the flat's front to its north) and its camera sits at angle az the way the game's sits at its yaw, so az = yaw + th
            AP.az0 = B.az; AP.pitch0 = B.pitch; AP.zoom0 = B.zoom;   // (the lab's own first view: the one it goes back to for the furnishing)
            const M = st.city && st.city.M; AP.az = M ? wrapA((A.labYaw ?? yaw) + Math.atan2(M.elements[8], M.elements[0])) : null;   // (labYaw: the script's chosen side, towards the garden)
            if (AP.az !== null){ B.az = AP.az; if (A.labPitch) B.pitch = A.labPitch; B.zoom = A.labZoomMatched || 1.12; B.tx = 0; B.tz = 0; B.camDirty = true; }
            else { if (A.labZoom){ B.zoom = A.labZoom; B.camDirty = true; } if (A.labPan){ B.tx = A.labPan[0]; B.tz = A.labPan[1]; B.camDirty = true; } }
            dropsHide(B); }
        }
        PC._debug.hold(u);
        // the real city under the hologram for its last stretch, so it comes out of the hologram straight into the real street (never the lab's grey stand-in)
        // the real street under the hologram from its first frame, its camera on the hologram's (so whatever stands in front of the flat is in front of
        // it all the way, never drawn over it first); the game's pixels on the flat for the last stretch, the sun coming onto it
        if (!AP.bgDone && AP.picked){ AP.bgDone = true; safe('real city', () => bgGame(true, st, B, w)); }
        if (AP.bg && !AP.late){ AP.late = true; safe('pixels', () => { pixOn(true); tiltOn(true); }); }   // (the hologram in the game's pixels from its first frame: no change of look partway)
        if (AP.bg) safe('sun', () => keyLight(true));   // (the sun on the flat from the start, steady: it shows only as the hologram resolves)
        // and the lab's light worked out again for it before the hologram resolves: those steps showed as the room brightening in jumps (held: not filmed)
        if (AP.bg && !(PC.paused && PC.paused())){ const PR = w.PodRender; if (PR && PR.lightPending && PR.lightPending() && wait('the light, with the sun on it')) return; }   // (only once the room is drawn under the hologram: until then the lab does no light work)
        // (the game's camera on the lab's, the one it is drawing the hologram with: the street behind moves with it, and what stands in front is cut from it)
        if (AP.bg && B && B.cam) safe('follow', () => { const p = camPose(B.cam, st.city); if (p) AP.camM = p; });   // (the room is drawn from the lab's own camera throughout: the hologram flies over it)
      }
      fr.style.opacity = '1';   // (no fade in: the hologram's first frame is the shot before it)
      return;
    }
    if (t < A.unroom){   // the pieces set down one after another
      if (st && st.trans){ PC._debug.hold(D_ + .01); return; }
      if (PC.transitioning && wait('the hologram to end')) return;
      if (!AP.roomOk){ const lw = labWait(); if (lw && wait('the room: ' + lw)) return; AP.roomOk = true; }
      fr.style.opacity = '1';
      if (!AP.bg && !AP.bgDone){ AP.bgDone = true; safe('real city', () => bgGame(true, st, B, w)); }
      if (AP.bg && !AP.late){ AP.late = true; safe('pixels', () => { pixOn(true); tiltOn(true); }); }
      if (!(tz0 => tz0 >= (A.zoomFor || 1.8)*.9)(t - A.room)) AP.punch = true;   // (the depth pass until the camera has gone past what stands in front)
      if (AP.bg){ safe('sun', () => keyLight(true)); }
      // One take: out of the hologram into the real street, the camera going in on the flat (past what stands in front of it: the near clip follows
      // the zoom) while everything around it blurs away to plain grey (never the flat: always in focus); on the grey the camera swings round to the
      // lab's own view, the flat coming up out of the game's pixels to its own; a hologram grid spreads out on the ground; then the furnishing.
      const tz = t - A.room, ZD = A.zoomFor || 1.8, OE = ZD + (A.orbitFor || 1.6);
      if (AP.bg && B && AP.z0 && tz < ZD){ const base = AP.camBase || (AP.camBase = camPose(B.cam, st.city)), u = ss(clamp01(tz/ZD)), z = AP.z0 + ((A.labZoomIn || AP.z0*1.6) - AP.z0)*u; AP.nearK = ss(clamp01(tz/(ZD*.55))); AP.deepK = ss(clamp01((tz - ZD*.55)/(ZD*.35)));
        if (AP.deepK >= 1) AP.punch = false;   // (what stood in front is cut away by now: from here the flat is simply in front, while the blur goes on)
        if (Math.abs(B.zoom - z) > 1e-6){ B.zoom = z; B.camDirty = true; B.needs = true; } AP.camM = Object.assign({}, base, { zoom: base.zoom*AP.z0/z }); }
      if (tz < ZD) safe('grey', () => greyAt(ss(clamp01((tz - (A.greyFrom ?? .5))/Math.max(.1, ZD - (A.greyFrom ?? .5))))));
      else if (tz < OE){
        if (!AP.swapped){ AP.swapped = true; safe('street off', () => streetOff(B)); }
        safe('grey', () => greyAt(1)); safe('orbit', () => orbitAt(B, ss(clamp01((tz - ZD)/(OE - ZD)))));
      } else if (!AP.own){ AP.own = true; safe('lab view', () => { if (!AP.swapped){ AP.swapped = true; streetOff(B); } orbitAt(B, 1); labOwn(); }); }
      if (AP.own) safe('grid', () => gridAt(B, ss(clamp01((tz - OE)/.8))));
      for (const d of AP.hidden){ const u = (t - d.t)/.75; d.i.pivot.visible = u >= 0; if (u < 0) continue; const e = 1 - Math.pow(1 - Math.min(1, u), 3); d.i.pivot.position.y = d.y + .45*(1 - e); }
      return;
    }
    if (t < A.back){   // the hologram flies back out, to the game's view as it was left
      for (const d of AP.hidden){ d.i.pivot.visible = true; d.i.pivot.position.y = d.y; }
      if (AP.bg && t >= A.unroom + BG_OUT) safe('real city off', () => bgGame(false));
      if (AP.own && !AP.ownOff && t >= A.unroom + BG_OUT){ AP.ownOff = true; safe('grey off', () => labOwnOff()); }   // (the grey and its grid kept under the hologram until it covers the picture)   // (the grey kept under the hologram until it covers the picture)   // (the hologram drawn over the real city first, then the lab's own city under it once the hologram covers it)
      AP.punch = false;
      if (!AP.rev){ AP.rev = true;
        safe('holo frame', () => { const S0 = st && st.city && st.city.holoStart; if (S0 && AP.cityW){ S0.w = AP.cityW; S0.exact = true; } });   // (out to the whole city again: the framing the game camera takes behind it)
        if (st && !st.trans){ st.trans = { t0: performance.now(), vt: D_ - .01, last: performance.now(), drift: 0, gate: false, rm: false, frames: [], onDone: null, resolve(){}, skipped: false, lhDone: true, hold: D_ - .01 }; PC.transitioning = true; }
        FURN.hold = false;   // (the city drawn again underneath, from where the camera was left)
      }
      if (st && st.trans){ st.trans.holding = false; PC._debug.hold(Math.min(D_ - .01, H0 + (D_ - H0)*(1 - holoCurve(Math.min(1, (t - A.unroom)/(A.back - REVEAL - A.unroom)))))); }   // (out, and still, before the colour wave)
      fr.style.opacity = '1'; reveal(fr, seg(t, A.back - REVEAL, A.back));
      return;
    }
    aptEnd();
  }
  // Out of the hologram: a reconstruction. A scan bar runs down the hologram and lays a fine cyan data grid over it; then, from the middle outwards
  // (each tile's moment fixed by where it is: no randomness), the picture is rebuilt a tile at a time, each tile flashing as the city in its own
  // colours switches in under it; a readout counts the pass. The lab's frame is masked tile by tile (a canvas the size of the window, as a CSS mask);
  // the grid, flashes, scan bar and readout are drawn on a canvas over it
  const REVEAL = 2.6, TILE = 40;
  const hash01 = (a, b) => { let h = Math.imul(a*73856093 ^ b*19349663, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0)/4294967296; };
  function reveal(fr, u){
    const W = innerWidth, H = innerHeight;
    if (!E.rv){ const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const fx = mk(); fx.id = 'stRecon'; fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      document.getElementById('stOv').appendChild(fx); E.rv = { fx, last: null }; }
    const R = E.rv, g = R.fx.getContext('2d');
    if (R.fx.width !== W || R.fx.height !== H){ R.fx.width = W; R.fx.height = H; }   // (sized to the window as it is now: a stale size left old drawing uncleared)
    g.clearRect(0, 0, R.fx.width, R.fx.height);
    if (u <= 0){ if (R.last !== 'off'){ fr.style.clipPath = ''; R.last = 'off'; } return; }
    const cols = Math.ceil(W/TILE), rows = Math.ceil(H/TILE), cx = (cols - 1)/2, cy = (rows - 1)/2, dMax = Math.hypot(cx, cy);
    // each tile's switch-over time: by its distance from the middle, a little ahead or behind by its own hash, in [.18, .9] of the pass
    const tAt = (c, r) => .18 + .72*Math.min(1, Math.max(0, Math.hypot(c - cx, (r - cy)*1.15)/dMax*.86 + (hash01(c, r) - .5)*.22 + .07));
    const scan = Math.min(1, u/.22);   // the scan bar's run down the screen, laying the grid as it goes
    let done = 0; const keep = [];   // (the tiles still hologram: the lab's frame is clipped to them)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
      const t0 = tAt(c, r), x = c*TILE, y = r*TILE, k = (u - t0)/.09;   // k: 0..1 the tile's switch, its flash after
      if (k >= .5) done++; else keep.push('M' + x + ' ' + y + 'h' + TILE + 'v' + TILE + 'h-' + TILE + 'z');   // (k >= .5: the city shows here now)
      if (k > 0 && k < 2.2){ const a = k < .5 ? k*2 : Math.max(0, 1 - (k - .5)/1.7);   // the flash: up to the switch, then dying away over the colour
        g.fillStyle = 'rgba(70,240,230,' + (a*.55).toFixed(3) + ')'; g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        g.strokeStyle = 'rgba(190,255,250,' + (a*.95).toFixed(3) + ')'; g.lineWidth = 1.5; g.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3); }
      else if (k <= 0 && y < scan*H){ g.strokeStyle = 'rgba(56,232,224,' + (.22 + .2*hash01(r, c)).toFixed(3) + ')'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);   // the data grid, still hologram
        if (hash01(c + 7, r) < .07){ g.fillStyle = 'rgba(56,232,224,.5)'; g.fillRect(x + 4, y + 4, 3, 3); } }
    }
    if (scan < 1){ const y = scan*H; const gr = g.createLinearGradient(0, y - 60, 0, y + 6); gr.addColorStop(0, 'rgba(56,232,224,0)'); gr.addColorStop(1, 'rgba(160,255,250,.85)');
      g.fillStyle = gr; g.fillRect(0, y - 60, W, 66); g.fillStyle = 'rgba(230,255,255,.95)'; g.fillRect(0, y, W, 2); }
    fr.style.clipPath = "path('" + (keep.length ? keep.join('') : 'M0 0z') + "')"; R.last = 'on';   // (a clip, not an image mask: applied the same frame, nothing to decode)
  }
  // The room in the real city: behind the flat, the game itself draws the street, the garden and the towers from a camera matched to the lab's
  // (both orthographic; the lab's city is the game's turned and scaled by M, so the lab camera taken back through M is the game camera), the home's
  // own building left out of it (the flat stands on its plot, on the ground). The lab draws only the flat, on a clear background, and where the
  // lab's copy of the city is nearer the camera than the flat (a billboard, a lamp, a tree in front), it leaves the flat out: the game's own
  // thing shows there, so what is in front stays in front and what is behind stays behind.
  function bgGame(on, st, B, w){
    if (on){
      w = w || labWin(); B = B || labB(); st = st || labPC()._debug.state(); const city = st && st.city; if (!w || !B || !B.cam || !city || !city.M) return;
      const Mi = city.M.clone().invert(), cam = B.cam; cam.updateMatrixWorld(); const d = cam.getWorldDirection(new THREE.Vector3());
      const tg = cam.position.clone().add(d.clone().multiplyScalar(24)).applyMatrix4(Mi), dg = d.clone().transformDirection(Mi), sc = Math.hypot(city.M.elements[0], city.M.elements[8]);
      AP.camM = { x: tg.x, y: tg.y, z: tg.z, yaw: Math.atan2(-dg.x, -dg.z), pitch: Math.asin(-dg.y), zoom: (cam.top - cam.bottom)/2/cam.zoom/sc }; AP.camZ0 = AP.camM.zoom; AP.z0 = B.zoom;
      const dc = w.document; if (!dc.getElementById('stBgGame')){ const e = dc.createElement('style'); e.id = 'stBgGame'; e.textContent = 'html,body,#bStage{background:transparent!important}#bSky{visibility:hidden!important}'; dc.head.appendChild(e); }
      const PC = w.PodContext; if (!AP.bd0){ AP.bd0 = PC.backdrop; PC.backdrop = () => null; }
      AP.home = city.home; homeHide(true); FURN.hold = false; punchOn(w, B, city); AP.bg = true; AP.punch = true; B.needs = true;
      AP.home = city.home; AP.ppl = [pplMesh.visible, ddMesh.visible]; pplMesh.visible = ddMesh.visible = false;   // (no one about while the flat is shown)
      say('apartment: the real city behind the flat', JSON.stringify(AP.camM));
    } else {
      AP.bg = false; AP.camM = null; AP.nearK = 0; nearClip(); homeHide(false); pixOn(false); tiltOn(false); keyLight(false); if (AP.ppl){ pplMesh.visible = AP.ppl[0]; ddMesh.visible = AP.ppl[1]; AP.ppl = null; }
      const w2 = labWin(); if (w2){ const e = w2.document.getElementById('stBgGame'); if (e) e.remove(); if (AP.bd0){ w2.PodContext.backdrop = AP.bd0; AP.bd0 = null; } const B2 = labB(); if (B2) B2.needs = true; }
    }
  }
  const BG_OUT = .9, BG_IN = .9;   // (the real city brought in under the hologram this long before it ends, and kept under it this long as it goes)
  // 1. The flat in the game's pixels: the lab's picture taken down to the size the game draws at (W x H lines), its edges made hard (alpha either in or
  // out) and its colours stepped a little, then shown pixel for pixel over the game's own, upscaled the same way. The lab's own frame is hidden meanwhile.
  function pixOn(on){
    let c = document.getElementById('stFlat');
    if (on){ if (!c){ c = document.createElement('canvas'); c.id = 'stFlat'; c.className = 'tr-keep'; c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:51;image-rendering:pixelated';
        document.body.appendChild(c); }
      c.style.display = ''; AP.pix = true; if (FURN.frame) FURN.frame.classList.add('st-pix'); }
    else { AP.pix = false; if (c){ c.style.display = 'none'; c.getContext('2d').clearRect(0, 0, c.width, c.height); } if (FURN.frame) FURN.frame.classList.remove('st-pix'); }
  }
  function pixCopy(src){
    const c = document.getElementById('stFlat'); if (!c || !src.width) return;
    const k = AP.pixK || 0, h = Math.round(H + (src.height - H)*k), wd = Math.round(h*src.width/src.height);   // (k: the swing round taking it up to the lab's own size)
    if (c.width !== wd || c.height !== h){ c.width = wd; c.height = h; }
    const g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, wd, h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, wd, h);
    if (k >= .999) return;   // (at full size the picture as the lab drew it)
    const im = g.getImageData(0, 0, wd, h), d = im.data, q = Math.max(1, Math.round(10*(1 - k)));
    for (let i = 0; i < d.length; i += 4){ if (d[i + 3] < 250) continue; for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, Math.round(d[i + j]/q)*q); }   // (solid pixels stepped; see-through ones, the hologram's glow, left as they are)
    g.putImageData(im, 0, 0);
  }
  // 2. The flat lit by the game's sun: the lab's key light pointed the way the game's sun shines (through M, into the lab's turned city), in its colour, at
  // a strength that follows it (golden hour comes on during the room)
  const k0c = c => c.clone ? c.clone() : new THREE.Color(c);
  function keyLight(on, k = 1){
    const B = labB(), w = labWin(); if (!B || !B.sc) return; let key = AP.key;
    if (!key){ B.sc.traverse(o => { if (!key && o.isDirectionalLight && (o.castShadow || o.userData.prKey)) key = o; }); if (!key) return; AP.key = key; AP.key0 = { i: key.intensity, c: key.color.clone(), p: key.position.clone() }; }
    if (!on){ const k0 = AP.key0; key.intensity = k0.i; key.color.copy(k0.c); key.position.copy(k0.p); key.updateMatrixWorld(); key.shadow.needsUpdate = true; AP.key = null; B.needs = true; return; }
    const city = w.PodContext._debug.state().city; if (!city || !city.M) return;
    // (set only when it changes: each change starts the lab's picture building up again, which showed as flicker)
    const d = SUN_DIR.clone().transformDirection(city.M), pos = key.target.position.clone().addScaledVector(d, 8), col = k0c(AP.key0.c).lerp(sun.color, k), I = AP.key0.i + (sun.intensity*.63 - AP.key0.i)*k;
    if (pos.distanceTo(key.position) < 1e-4 && Math.abs(I - key.intensity) < 1e-4 && Math.abs(col.r - key.color.r) + Math.abs(col.g - key.color.g) + Math.abs(col.b - key.color.b) < 1e-4) return;
    key.position.copy(pos); key.updateMatrixWorld(); key.target.updateMatrixWorld(); key.color.copy(col); key.intensity = I; key.shadow.needsUpdate = true; B.needs = true;
  }
  // 4. The blur by depth, as a tilted lens does it: sharp in the band the flat stands in (its top to its foot on the screen), softer above and below it
  // (further back and nearer the camera), in two steps. backdrop-filter blurs only the game's picture under it; the flat is drawn above.
  function tiltOn(on){
    for (const id of ['stTilt1', 'stTilt2']){ let e = document.getElementById(id);
      if (on && !e){ e = document.createElement('div'); e.id = id; e.className = 'tr-keep'; e.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:' + (id === 'stTilt1' ? 48 : 49); document.body.appendChild(e); }
      if (e) e.style.display = on ? '' : 'none'; }
  }
  function tiltAt(){
    const h = AP.home; if (!h) return; const fp = h.fp || { w: 1.3, d: 2.2, ry: 0 };
    let y0 = 1e9, y1 = -1e9; const v = new THREE.Vector3(), c = Math.cos(fp.ry || 0), s = Math.sin(fp.ry || 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, .8]){ const lx = sx*fp.w/2, lz = sz*fp.d/2;
      v.set(h.x + lx*c + lz*s, y, h.z - lx*s + lz*c).project(cam); const py = (1 - v.y)/2*innerHeight; y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const Hh = innerHeight, pad = Hh*.02, ramp = Hh*.16, pc = x => (100*Math.max(0, Math.min(1, x/Hh))).toFixed(2) + '%';
    const mask = (p, r) => 'linear-gradient(to bottom, #000 ' + pc(y0 - p - r) + ', transparent ' + pc(y0 - p) + ', transparent ' + pc(y1 + p) + ', #000 ' + pc(y1 + p + r) + ')';
    const set = (id, px, p, r) => { const e = document.getElementById(id); if (!e) return; const f = 'blur(' + px.toFixed(2) + 'px)', m = mask(p, r);
      e.style.backdropFilter = f; e.style.webkitBackdropFilter = f; e.style.maskImage = m; e.style.webkitMaskImage = m; };
    set('stTilt1', Hh*.0018, pad, ramp); set('stTilt2', Hh*.0018, pad + ramp*.9, ramp*1.4);   // (two layers: the second adds to the first further out)
  }
  // the near clip: as the camera goes in, everything nearer the camera than the flat's front is cut away (the game's camera, and the lab's copy of the
  // city in the depth pass, the same way), from 8 units in front of it to a quarter unit
  const nearOf = (pos, dir, M, far) => { const h = AP.home; if (!h) return null; const fp = h.fp || { w: 1.3, d: 2.2, ry: 0 }, c = Math.cos(fp.ry || 0), s = Math.sin(fp.ry || 0), p = new THREE.Vector3(); let mn = 1e9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, .3]){ const lx = sx*fp.w/2, lz = sz*fp.d/2; p.set(h.x + lx*c + lz*s, y, h.z - lx*s + lz*c); if (M) p.applyMatrix4(M); const dd = p.sub(pos).dot(dir); mn = far ? (mn === 1e9 ? dd : Math.max(mn, dd)) : Math.min(mn, dd); }   // (y to .3: the cut-down front walls, the nearest of the flat to the camera)
    return mn; };
  const NEAR_FROM = 8, NEAR_TO = .04;
  // where the near plane is, as a distance along the view from pos: in from 8 units in front of the flat to its front (nearK), then on through it to
  // its back corner (deepK), so whatever stands anywhere in front of any of it is gone before the flat is let in front (the ground cut with it is
  // under the blur by then)
  function nearAt(pos, dir, M, k){
    const f = nearOf(pos, dir, M); if (f === null) return null; const dk = window.__deepK ?? AP.deepK ?? 0;
    let d = f - (NEAR_FROM + (NEAR_TO - NEAR_FROM)*AP.nearK)*k;
    if (dk > 0){ const b = nearOf(pos, dir, M, true); d = (f - NEAR_TO*k) + (b - .05*k - (f - NEAR_TO*k))*dk; }
    return d;
  }
  function nearClip(){
    if (AP.bg && AP.nearK > 0){ const dir = cam.getWorldDirection(new THREE.Vector3()), f = nearOf(cam.position, dir); if (f === null) return;
      if (AP.sc0 === undefined){ AP.sc0 = SC.mode; SC.mode = 'off'; }   // (the static cache draws with its own camera and the usual near plane: the frame drawn the old way meanwhile)
      cam.near = Math.max(NEAR, nearAt(cam.position, dir, null, 1)); cam.updateProjectionMatrix(); AP.nearOn = true; }
    else if (AP.nearOn){ AP.nearOn = false; cam.near = NEAR; cam.updateProjectionMatrix(); if (AP.sc0 !== undefined){ SC.mode = AP.sc0; AP.sc0 = undefined; } }
  }
  // the grey: the whole picture blurred and greyed (a layer over everything the film shows but its own overlays), from 0 to 1
  function greyAt(a){
    let e = document.getElementById('stGrey');
    if (a <= 0){ if (e) e.style.display = 'none'; return; }
    if (!e){ e = document.createElement('div'); e.id = 'stGrey'; e.className = 'tr-keep'; e.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50'; document.body.appendChild(e); }
    const b = 'blur(' + (innerHeight*.05*a).toFixed(2) + 'px)'; e.style.display = ''; e.style.backdropFilter = b; e.style.webkitBackdropFilter = b; e.style.background = 'rgba(112,116,124,' + (a*a).toFixed(4) + ')';   // (solid at 1: the same grey the furnishing sits on)
  }
  // the camera pose the game needs to see what a lab camera sees (both orthographic; the lab's city is the game's turned and scaled by M)
  function camPose(cam, city){
    if (!cam || !city || !city.M) return null; cam.updateMatrixWorld(); const Mi = city.M.clone().invert(), d = cam.getWorldDirection(new THREE.Vector3());
    const tg = cam.position.clone().add(d.clone().multiplyScalar(24)).applyMatrix4(Mi), dg = d.clone().transformDirection(Mi), sc = Math.hypot(city.M.elements[0], city.M.elements[8]);
    return { x: tg.x, y: tg.y, z: tg.z, yaw: Math.atan2(-dg.x, -dg.z), pitch: Math.asin(-dg.y), zoom: (cam.top - cam.bottom)/2/(cam.zoom || 1)/sc };
  }
  // the street gone (all grey by now): the game stops drawing and everything of it put back; the flat stays in its pixels and the sun for the swing round
  function streetOff(B){
    AP.bg = false; AP.punch = false; AP.camM = null; AP.nearK = 0; AP.deepK = 0; nearClip(); homeHide(false); tiltOn(false);
    if (AP.ppl){ pplMesh.visible = AP.ppl[0]; ddMesh.visible = AP.ppl[1]; AP.ppl = null; }
    FURN.hold = true;
    const A = SC_.apartment, pn = A.labPan || [0, 0];
    AP.orb = { a: { az: B.az, pitch: B.pitch, zoom: B.zoom, tx: B.tx, tz: B.tz }, b: { az: A.labAz ?? AP.az0 ?? B.az, pitch: AP.pitch0 ?? B.pitch, zoom: A.labZoom || AP.zoom0 || 1, tx: pn[0], tz: pn[1] } };
    const key = AP.key; AP.keyS = key ? { i: key.intensity, c: key.color.clone() } : null;
  }
  // the swing round, u 0..1: the lab's camera to its own view, the flat's pixels to its own size, the sun's light to the room's own
  function orbitAt(B, u){
    const o = AP.orb; if (!o || !B) return; const a = o.a, b = o.b;
    B.az = a.az + wrapA(b.az - a.az)*u; B.pitch = a.pitch + (b.pitch - a.pitch)*u; B.zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom))*u);
    B.tx = a.tx + (b.tx - a.tx)*u; B.tz = a.tz + (b.tz - a.tz)*u; B.camDirty = true; B.needs = true; AP.pixK = u;
  }
  // the lab's own view on the grey: its own frame shown (the copy at full size was the same picture), its own light, the grey and the grid under it
  function labOwn(){
    pixOn(false); AP.pixK = 0; greyAt(0); underOn(true);   // (the sun stays on it: a change of light restarts the lab's picture, a flicker)
  }
  function labOwnOff(){
    underOn(false); keyLight(false);
    const w = labWin(); if (w){ const e = w.document.getElementById('stBgGame'); if (e) e.remove(); if (AP.bd0){ w.PodContext.backdrop = AP.bd0; AP.bd0 = null; } const B = labB(); if (B) B.needs = true; }
  }
  // under the lab's frame (it is see-through round the flat): plain grey, and on it the hologram grid
  const GREY = '#70747c';
  function underOn(on){
    for (const [id, z] of [['stUnder', 47], ['stGrid', 49]]){ let e = document.getElementById(id);
      if (on && !e){ e = document.createElement(id === 'stGrid' ? 'canvas' : 'div'); e.id = id; e.className = 'tr-keep'; e.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + z + (id === 'stUnder' ? ';background:' + GREY : ''); document.body.appendChild(e); }
      if (e) e.style.display = on ? '' : 'none'; }
  }
  // the grid: lines a metre apart on the lab's ground, drawn through its camera, spreading out from the flat (r 0..1) and fading with distance
  function gridAt(B, r){
    const c = document.getElementById('stGrid'); if (!c || !B || !B.cam) return;
    const Wc = Math.round(innerWidth*devicePixelRatio), Hc = Math.round(innerHeight*devicePixelRatio); if (c.width !== Wc || c.height !== Hc){ c.width = Wc; c.height = Hc; }
    const g = c.getContext('2d'); g.clearRect(0, 0, Wc, Hc); if (r <= 0) return;
    const cam = B.cam; cam.updateMatrixWorld(); const v = new THREE.Vector3(), N = 22, R = N*r, y = -.22;
    const P = (x, z) => { v.set(x, y, z).project(cam); return [(v.x + 1)/2*Wc, (1 - v.y)/2*Hc]; };
    g.lineWidth = Math.max(1.5, Hc/600); g.shadowColor = 'rgba(86,236,228,.9)'; g.shadowBlur = Hc/220;   // (thick enough and glowing a little: the recording keeps it)
    for (const ax of [0, 1]) for (let k = -N; k <= N; k++){
      const half = Math.sqrt(Math.max(0, R*R - k*k)); if (half <= 0) continue;
      const STEP = 1; for (let s = -half; s < half; s += STEP){ const s2 = Math.min(half, s + STEP), m = (s + s2)/2, d = Math.hypot(k, m)/N, a = .62*(1 - d)*(1 - d);
        if (a <= .004) continue; const p = ax ? P(k, s) : P(s, k), q = ax ? P(k, s2) : P(s2, k);
        g.strokeStyle = 'rgba(86,236,228,' + a.toFixed(3) + ')'; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); } }
    // the spreading edge, a little brighter
    if (r < 1){ g.strokeStyle = 'rgba(160,255,250,' + (.5*(1 - r)).toFixed(3) + ')'; g.beginPath(); for (let i = 0; i <= 96; i++){ const a = i/96*Math.PI*2, p = P(Math.cos(a)*R, Math.sin(a)*R); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke(); }
  }
  function homeHide(on){
    const A = SC_.apartment, k = String(A.pod).split('|')[0].split(',').map(Number), c = cells.get(ckey(k[0], k[1])); if (!c) return warn('apartment', 'no home plot ' + k);
    if (on){ if (AP.hh) return; const h = AP.hh = { door: 'd:' + k[0] + ',' + k[1], pcs: [], mem: [], fol: [], g: c.group ? c.group.visible : null, v: c.view ? c.view.visible : null };
      const rec = solidRegions.get(mergeKey(c.i, c.j));
      if (rec){ for (const g of rec.geoms){ const pc = g.userData.pieceCells, P = g.userData.pcs; if (!pc || !P) continue;
          for (let i = 0; i < pc.length; i++) if (pc[i] === c){ const H = P.hide || (P.hide = new Uint8Array(P.n)); h.pcs.push([P, i, H[i]]); H[i] = 1; P.stamp = -1; } }
        for (const m of rec.members) if (m.userData.cell === c){ h.mem.push([m, m.visible]); m.visible = false; } }
      if (c.group) c.group.visible = false; if (c.view) c.view.visible = false;
      // the building's own greenery (its roof and balcony plants, instanced with the rest of the city's): out with it, so nothing hangs in the air
      { const v = new THREE.Vector3(), m4 = new THREE.Matrix4(), z0 = new THREE.Matrix4().makeScale(0, 0, 0), R = LOT*.47;
        scene.traverse(o => { const fol = !!o.userData.fol; if (!o.isInstancedMesh || !(fol || o.material.isMeshToonMaterial)) return; let hit = false; const Rr = fol ? R : LOT*.42;   // (and its door, frame and stoop)
          for (let i = 0; i < o.count; i++){ o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld);
            if (Math.abs(v.x - c.x) < Rr && Math.abs(v.z - c.z) < Rr && (!fol || v.y > .2)){ h.fol.push([o, i, m4.clone()]); o.setMatrixAt(i, z0); hit = true; } }
          if (hit) o.instanceMatrix.needsUpdate = true; }); }
      // and the plot under it paved (the ground there is never drawn under a building: the sky showed through)
      { const g = new THREE.Mesh(new THREE.PlaneGeometry(LOT*.9, LOT*.9), new THREE.MeshToonMaterial({ color: '#6a655f' })); g.rotation.x = -Math.PI/2; g.position.set(c.x, .015, c.z); g.receiveShadow = true; scene.add(g); h.pave = g; }
      // 3. where the flat meets the ground, a soft dark edge (its own contact shadow): a blurred rectangle a little bigger than its footprint, under it
      { const hm = AP.home, fp = (hm && hm.fp) || { w: 1.3, d: 2.2, ry: 0 }, m = .45, cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d'), fx = 128*m/(fp.w + 2*m), fz = 128*m/(fp.d + 2*m); x.filter = 'blur(' + Math.round(Math.min(fx, fz)*.55) + 'px)'; x.fillStyle = '#fff'; x.fillRect(fx*.7, fz*.7, 128 - 1.4*fx, 128 - 1.4*fz);
        const tx = new THREE.CanvasTexture(cv), cs = new THREE.Mesh(new THREE.PlaneGeometry(fp.w + 2*m, fp.d + 2*m), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: .55, depthWrite: false, color: 0x000000 }));
        cs.material.alphaMap = tx; cs.material.map = null; cs.rotation.set(-Math.PI/2, 0, fp.ry || 0, 'YXZ'); cs.rotation.order = 'YXZ'; cs.rotation.y = fp.ry || 0; cs.rotation.x = -Math.PI/2;
        cs.position.set(hm ? hm.x : c.x, .03, hm ? hm.z : c.z); cs.renderOrder = 1; scene.add(cs); h.cs = cs; }
      shadowDirty = true;
    } else { const h = AP.hh; if (!h) return; AP.hh = null;
      for (const [P, i, v] of h.pcs){ P.hide[i] = v; P.stamp = -1; } for (const [m, v] of h.mem) m.visible = v;
      if (c.group && h.g !== null) c.group.visible = h.g; if (c.view && h.v !== null) c.view.visible = h.v;
      for (const [o, i, m4] of h.fol){ o.setMatrixAt(i, m4); o.instanceMatrix.needsUpdate = true; }
      if (h.pave){ scene.remove(h.pave); h.pave.geometry.dispose(); h.pave.material.dispose(); }
      if (h.cs){ scene.remove(h.cs); h.cs.geometry.dispose(); h.cs.material.alphaMap.dispose(); h.cs.material.dispose(); } shadowDirty = true; }
  }
  // the depth pass, in the lab after each of its pictures: the lab's city and the flat drawn for depth alone from the lab's camera; where the city
  // is nearer, the lab's pixel is cleared (the game's picture under it shows)
  function punchOn(w, B, city){
    const R = B.dr, T = w.THREE; if (!R || !T || R._stPunch) return; R._stPunch = true;
    const mk = () => { const t = new T.WebGLRenderTarget(2, 2); t.depthTexture = new T.DepthTexture(2, 2); t.depthTexture.type = T.UnsignedIntType; return t; };
    const mat = new T.ShaderMaterial({ uniforms: { tC: { value: null }, tF: { value: null }, bias: { value: .0004 } },
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'uniform sampler2D tC, tF; uniform float bias; varying vec2 v; void main(){ float f = texture2D(tF, v).r, c = texture2D(tC, v).r; if (f >= .99999 || c >= f - bias) discard; gl_FragColor = vec4(0.); }',
      depthTest: false, depthWrite: false, blending: T.NoBlending });
    const q = new T.Mesh(new T.PlaneGeometry(2, 2), mat); q.frustumCulled = false; const qs = new T.Scene(); qs.add(q);
    const P = AP.pu = { a: mk(), b: mk(), mat, qs, qc: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), om: new T.MeshBasicMaterial({ colorWrite: false }), v2: new T.Vector2(), cc: new T.Color(), busy: false };
    const prev = R.render;
    R.render = function (sc, c){
      const r = prev.call(this, sc, c);
      if (AP.pix && !P.busy && sc !== qs && R.getRenderTarget() === null) safe('pixels', () => pixCopy(R.domElement));
      return r;
    };
    // the depth pass on the room's own picture, before the lab lays its hologram over it (PodContext.overlay comes last in each of its frames): the
    // hologram stays over everything, and the street's things in front of the flat are in front of it from the first moment it shows
    const PCo = w.PodContext, ov0 = PCo.overlay;
    PCo.overlay = function (R2, cam2){ punch(); return ov0.call(this, R2, cam2); };
    function punch(){
      if (AP.bg && AP.punch && !P.busy) safe('depth pass', () => {
        P.busy = true; const save = { ac: R.autoClear, ca: R.getClearAlpha(), cc: R.getClearColor(P.cc).clone() };
        try {
          const s = R.getDrawingBufferSize(P.v2); for (const t of [P.a, P.b]) if (t.width !== s.x || t.height !== s.y) t.setSize(s.x, s.y);
          const k = B.cam.clone(); k.near = -400; k.far = 400; k.updateMatrixWorld(true);
          if (AP.nearK > 0){ const kd = k.getWorldDirection(new w.THREE.Vector3()), f = nearOf(new THREE.Vector3().copy(k.position), new THREE.Vector3().copy(kd), city.M), sc = Math.hypot(city.M.elements[0], city.M.elements[8]);
            const nd = nearAt(new THREE.Vector3().copy(k.position), new THREE.Vector3().copy(kd), city.M, sc); if (nd !== null) k.near = nd; }
          k.updateProjectionMatrix();
          const pass = (scene, tgt) => { const om = scene.overrideMaterial, bg = scene.background; scene.overrideMaterial = P.om; scene.background = null;
            try { R.setRenderTarget(tgt); R.autoClear = true; R.setClearColor(0, 0); R.clear(); prev.call(R, scene, k); } finally { scene.overrideMaterial = om; scene.background = bg; } };
          pass(city.sc, P.a); pass(B.sc, P.b);
          mat.uniforms.tC.value = P.a.depthTexture; mat.uniforms.tF.value = P.b.depthTexture;
          R.setRenderTarget(null); R.autoClear = false; prev.call(R, qs, P.qc);
        } finally { R.setRenderTarget(null); R.autoClear = save.ac; R.setClearColor(save.cc, save.ca); P.busy = false; }
      });
    }
  }
  function dropsHide(B){
    if (AP.hid) return; const A = SC_.apartment;
    // (only the script's own home: the lab can still hold the last home it built for a moment after the pod opens, and its pieces have the same numbers)
    const ps = A.recipe && A.recipe.pieces; if (ps && (B.inst.size !== ps.length || ps.some(p => { const i = B.inst.get(p.id); return !i || i.arch !== p.arch || i.seed !== p.seed; }))) return;
    AP.hid = true;
    for (const d of A.drops || []){ const i = B.inst.get(d.id); if (i && i.pivot){ AP.hidden.push({ i, y: i.pivot.position.y, t: A.room + (A.dropsAfter || 0) + d.at*(A.dropsScale || 1) }); i.pivot.visible = false; } else warn('apartment', 'no piece ' + d.id); }
    safe('relight', () => { B.needs = true; const PR = labWin().PodRender; if (PR && PR.sceneChanged){ PR.sceneChanged('geometry', null); PR.sceneChanged('light', null); } });   // (the lab told its scene changed: light worked out again without them)
  }
  function aptEnd(why){
    safe('reveal end', () => { if (FURN.frame) FURN.frame.style.clipPath = ''; if (E.rv){ E.rv.fx.getContext('2d').clearRect(0, 0, E.rv.fx.width, E.rv.fx.height); } });
    if (AP.bg) safe('real city off', () => bgGame(false)); safe('grey', () => greyAt(0)); if (AP.own && !AP.ownOff){ AP.ownOff = true; safe('grey off', () => labOwnOff()); }
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
    if (rendered){ if (G.redraw) G.redraw = false; else G.frame++; rendered = false; }
    prep();
  }
  const PAUSE = ((/[&#]pauseat=([\d.,]+)/.exec(location.hash) || [])[1] || '').split(',').filter(Boolean).map(Number); window.__stageGo = () => { PAUSE.go = true; };
  function prep(){
    const t = G.t = G.frame/FPS;
    G.held = false;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); }
    safe('drones', () => droneSetup());
    safe('apartment', () => aptTick(t));
    if (G.held) return;
    // (#stage&pauseat=38,40: checking only, never recorded: stands still at each of those times until window.__stageGo() is called)
    if (PAUSE.length && t >= PAUSE[0]){ if (!PAUSE.go){ G.info.paused = PAUSE[0]; if (window.__stageDraw){ window.__stageDraw = 0; G.redraw = true; return; } G.held = true; return; } PAUSE.shift(); PAUSE.go = false; delete G.info.paused; }
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
