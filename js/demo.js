// Neon Terrarium: the 15 second demo clip, played as a script on the trailer's stage engine (js/stage.js on the trailer branch). Open the game
// with ?full#demo; tools/demo/record.py films it at 1920 x 1080, 60 fps, with the game's own sound.
//
// As on the stage, nothing in it is decided by the game. Its simulation is off (no one walks or decides, no traffic, no drones, no stories, no
// cases, no landmark arrives on its own); the people on screen are a cast drawn from the script, each move written for them; every building is
// made from a seed of its own, so every run builds the same city and the same apartment; and the film's clock is its own frame count, which
// holds where it is while the apartment lab is still working (those frames are never filmed), so nothing ever lags or skips.
//
//   0.0   up close on a plaza in a big night city: the cursor picks zones and builds; after the first two buildings the person cam opens on
//         a resident of the first one, standing on the plaza; three more go up while they walk to their door and in
//   5.15  the game's hologram into their apartment, furnished by the game for that household: the Plants catalog, a bonsai set on their
//         table, the view in on it, its color changed in its color menu; Exit, and the game's own power-down back to the city
//   11.05 the camera pulls out over the whole city and the title comes on
//   The Booth loop on the Grid plays under all of it from the first frame.
//
// Nothing is saved and none of the player's own city or settings are read (saveguard.js, NT_DEMO).
'use strict';
const DEMO = (() => {
  const D = { on: !!window.NT_DEMO, ready: false, playing: false, done: false, held: false, t: 0, frame: 0, drawn: 0, log: [], info: {}, failed: null, len: 15 };
  if (!D.on) return D;
  const CAP = !!window.__TR_CAPTURE;   // the picture pass: the recorder steps the clock and films each frame
  const AUTO = !!window.__DM_AUDIO;    // the sound pass: real time, nothing drawn, only what makes a sound
  const FPS = +window.__DM_FPS || 60;
  const NOLAB = !!window.__DM_NOLAB;   // (checking only, never in a recording: the apartment left out, tools/demo/record.py --test --nolab)
  const say = (...a) => { D.log.push(a.join(' ')); if (D.log.length > 500) D.log.shift(); console.log('[demo]', ...a); };
  const warn = (what, e) => { D.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[demo] ' + what, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };
  const $ = id => document.getElementById(id);
  const html = document.documentElement;

  /* ---------- small maths ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, clamp01 = x => clamp(x, 0, 1);
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ss5 = x => { x = clamp01(x); return x*x*x*(x*(x*6 - 15) + 10); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const expo = x => { x = clamp01(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10*x); };
  const lerp = (a, b, u) => a + (b - a)*u, elerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const follow = (cur, goal, k, dt) => cur + (goal - cur)*(1 - Math.exp(-k*dt));
  const DEG = Math.PI/180, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- seeded numbers (the stage's) ---------- */
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const h32 = (...a) => { let h = 2166136261; const s = a.join('|'); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function withSeed(seed, fn){ const was = Math.random; Math.random = rng(seed >>> 0); try { return fn(); } finally { Math.random = was; } }

  /* ---------- the plan ---------- */
  const MK = { person: 1.6, walk: 1.6, arrive: 4.55, inside: 5.0, furn: 5.15, room: 6.45, exit: 10.6, out: 11.05, title: 13.2 };
  // [from, to, text, where]: top left over the city, top right in the apartment (its own panels are on the left)
  const CAPS = [[.3, 1.6, 'Build it block by block', 'tl'], [1.85, 4.95, 'Follow anyone home', 'tl'], [6.6, 10.4, 'Furnish every apartment', 'tr']];
  // the five buildings, in the order they go up; the first is a tenement (it has the apartment). Each block's clicks: a new building, then a floor each
  const BLOCKS = ['low', 'mid', 'high', 'ind', 'low'];
  const CLICK_T = [[.4, .75], [1.1, 1.4], [2.1, 2.45], [2.95], [3.45, 3.8]];
  // the Booth loop on the Grid from the first frame: 4 bars at 100 BPM (9.6 s a pass), a melody on the magic keys (pads 0 to 11, always in the
  // chord), its first bar missing two notes; the pass that starts at about 9.7 s is the first with them
  const LOOP_ID = window.DEMO_LOOP.id, MISSING = window.DEMO_LOOP.missing;   // (the loop itself: js/demo_loop.js, read by booth.js before this file loads)

  /* ---------- the game, switched off: nothing acts unless the script says so (the stage's) ---------- */
  maybeSpawnMegas = () => {};
  updateCars = () => {}; updateDrones = () => {}; updateTrips = () => {}; updateHighways = () => {};
  mtAmbient = () => {}; mtRiders = () => {};
  updateConveyors = () => {};
  { const _rc = rebuildCell; rebuildCell = function (c){ return withSeed(h32('cell', c.i, c.j, ...c.sections.map(s => s.seed + ':' + (s.mf || 0))), () => _rc.call(this, c)); }; }
  { const _rm = rebuildMega; rebuildMega = function (m){ return withSeed(h32('mega', m.kind, m.i, m.j, m.seed), () => _rm.apply(this, arguments)); }; }
  { const _bc = rebuildConnections; rebuildConnections = function (){ return withSeed(h32('links'), () => _bc.apply(this, arguments)); }; }
  { const _sa = syncAgents; syncAgents = function (){ return withSeed(h32('agents'), () => _sa.apply(this, arguments)); }; }
  // (the residents are still worked out, so each pod has its household for Furnish pod, but nobody is moved or drawn: the cast is, below)
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    safe('speed', () => { if (typeof FF !== 'undefined' && FF.set) FF.set(1); });
    safe('resolution', () => { ZOOM_RES = 0; H = 0; applyRenderRes(zoom); });
    safe('story', () => { STORY.tick = () => {}; });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; CASES.tick = () => {}; } });
    safe('pacing', () => { if (typeof PACE !== 'undefined') PACE.off = true; });
    safe('wirelog', () => { if (typeof WIRELOG !== 'undefined') WIRELOG.tick = () => {}; });
    safe('police', () => { policeDroneAlert = () => false; });
    if (CAP && !window.__DM_TEST) safe('render', () => { SC.mode = 'off'; const T = typeof PH !== 'undefined' && PH.tests; if (T) T.noSlowFar = T.noSmall = T.noSpeed = true; if (typeof SD !== 'undefined') SD.on = false; if (typeof FARV !== 'undefined') FARV.on = false; });
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (){ return _ar(ZOOM_REF); };   // (the same pixels at every zoom)

  /* ---------- the city: a big night city, every kind of building, an open plaza in the middle ---------- */
  const HOUR = 20.6;
  const CITY = { i0: -16, i1: 12, j0: -12, j1: 12 };
  const PLAZA = { i0: -4, i1: 2, j0: -3, j1: 3 }, PC0 = { i: -1, j: 0 };
  const inPlaza = (i, j) => i >= PLAZA.i0 && i <= PLAZA.i1 && j >= PLAZA.j0 && j <= PLAZA.j1;
  const ringOf = (i, j) => !inPlaza(i, j) && i >= PLAZA.i0 - 1 && i <= PLAZA.i1 + 1 && j >= PLAZA.j0 - 1 && j <= PLAZA.j1 + 1;
  const MEGAS = [['radio', 3, -1, 2, 2], ['square', -12, -6, 5, 5], ['foundry', -15, 3, 6, 4], ['greenhouse', -14, 7, 5, 4], ['logistics', -8, 6, 6, 6],
    ['market', -2, -11, 4, 4], ['club', 4, -10, 4, 4], ['spire', 7, -4, 3, 3], ['square', 7, 1, 5, 5], ['pagoda', 4, 7, 5, 4], ['bathhouse', 0, 7, 3, 3], ['emitter', -9, -11, 2, 2]];
  const LAWNS = [[-8, -2], [-8, -1], [-9, -2], [1, 9], [-11, 1], [-10, 1], [9, 9]];
  const zoneAt = (i, j, u) => {
    if (ringOf(i, j)) return u < .8 ? 'low' : 'mid';
    if (i <= -9 && j >= 2) return u < .8 ? 'ind' : 'mid';
    if (i <= -5) return u < .75 ? 'low' : 'mid';
    if (i >= 5) return u < .7 ? 'high' : 'mid';
    return u < .62 ? 'mid' : u < .82 ? 'high' : 'low';
  };
  function city(){
    settle();
    const R = rng(20261103);
    const inMega = (i, j) => MEGAS.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    const isLawn = (i, j) => LAWNS.some(([a, b]) => a === i && b === j);
    const secs = (zone, k) => { const out = []; for (let q = 0; q < k; q++) out.push({ zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }); return out; };
    cells.clear(); for (const m of [...megas.values()]) megas.delete(m.id); metros.length = 0; highways.length = 0;
    let n = 0;
    for (let i = CITY.i0; i <= CITY.i1; i++) for (let j = CITY.j0; j <= CITY.j1; j++){
      const ci = Math.min(i - CITY.i0, CITY.i1 - i), cj = Math.min(j - CITY.j0, CITY.j1 - j);
      if (ci + cj < 3 && R() < .85) continue;   // (the corners rounded off)
      const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some'; n++;
      cells.set(ckey(i, j), c);
      if (inMega(i, j)) continue;
      if (inPlaza(i, j) || isLawn(i, j)){ c.green = 'grass'; continue; }
      const z = zoneAt(i, j, R()), v = R();
      const k = ringOf(i, j) ? (v < .6 ? 1 : 2) : z === 'ind' ? (v < .5 ? 1 : 2) : v < .25 ? 1 : v < .62 ? 2 : v < .9 ? 3 : 4;
      c.sections = secs(z, Math.min(MAX_SECTIONS, k));
    }
    let sq = 0;
    for (const [kind, i, j, w, h] of MEGAS){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m){ warn('megastructure ' + kind, 'did not fit'); continue; }
      if (kind === 'square' && typeof SQ_CENTRES !== 'undefined') m.centre = SQ_CENTRES[sq++ % SQ_CENTRES.length]; }
    S.hour = HOUR;
    rebuildAll(); finishSync();
    D.info.city = { plots: n, megas: megas.size };
    say('city built:', JSON.stringify(D.info.city));
  }
  D.city = () => safe('city', city);

  /* ---------- the cast: each person's every move, as written (the stage's) ---------- */
  // a part: { id, code (their look), keys: [[t, x, z, act, fx, fz, alpha], ...] }: between two keys they go in a straight line doing the earlier
  // key's act (walk, idle, phone); standing, they face fx, fz; alpha: how much of them shows
  const CAST = new Map();
  function addCast(id, code, keys){
    const K = keys.map(k => ({ t: k[0], x: k[1], z: k[2], act: k[3] || 'idle', fx: k[4], fz: k[5], a: k[6] ?? 1 }));
    let d = 0; K.forEach((k, n) => { if (n) d += Math.hypot(k.x - K[n - 1].x, k.z - K[n - 1].z); k.d = d; });
    CAST.set(id, { id, code, keys: K, ph: (h32('phase', id) % 1000)/100 });
  }
  function poseOf(P, t){
    const K = P.keys; let a = K[0], b = K[0], u = 0;
    if (t >= K[K.length - 1].t) a = b = K[K.length - 1];
    else if (t > K[0].t){ for (let n = 1; n < K.length; n++) if (t <= K[n].t){ a = K[n - 1]; b = K[n]; u = (t - a.t)/Math.max(1e-6, b.t - a.t); break; } }
    const x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), dx = b.x - a.x, dz = b.z - a.z, moving = Math.hypot(dx, dz) > 1e-3 && b !== a;
    return { x, y: CURB, z, act: a.act, moving, fx: moving ? dx : a.fx ?? 0, fz: moving ? dz : a.fz ?? 1, alpha: lerp(a.a, b.a, u), dist: lerp(a.d, b.d, u) };
  }
  const castPose = id => { const P = CAST.get(id); return P ? poseOf(P, D.t) : null; };
  const STRIDE = 9/PPL_SPEED;   // walk frames per unit of ground (the game's own), so feet never slide
  function frameOf(P, q, t){
    if (q.moving) return Math.floor(q.dist*STRIDE + P.ph) % PPL.walk;
    if (q.act === 'phone') return PG.F.COMM + Math.floor(t*2) % 4;
    return F_IDLE + Math.floor(t*2.5 + P.ph) % PPL.idle;
  }
  updatePeople = function (){
    const pos = pplMesh.geometry.attributes.aPos, spr = pplMesh.geometry.attributes.aSpr, fce = pplMesh.geometry.attributes.aFace, P = pos.array, Q = spr.array, FA = fce.array;
    _camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    let i = 0; const t = D.t, live = PG.live();
    for (const p of CAST.values()){
      const q = poseOf(p, t); if (q.alpha <= .002 || i >= PPL_MAX) continue;
      const sd = q.fx*_camR.x + q.fz*_camR.z, flip = Math.abs(sd) > 1e-3 ? (sd < 0 ? -1 : 1) : 1;
      P[i*3] = q.x; P[i*3 + 1] = q.y; P[i*3 + 2] = q.z;
      Q[i*4] = live ? PG.shapeOf(p.code) : p.code & 31; Q[i*4 + 1] = frameOf(p, q, t); Q[i*4 + 2] = flip; Q[i*4 + 3] = Math.min(1, q.alpha);
      FA[i*2] = q.fx; FA[i*2 + 1] = q.fz; i++;
    }
    pplMesh.geometry.instanceCount = i; pos.needsUpdate = spr.needsUpdate = fce.needsUpdate = true;
    ddMesh.geometry.instanceCount = 0;
  };

  /* ---------- sight lines: what stands between a camera and a point ---------- */
  const hAt = (x, z, skip) => { const i = Math.round(x/LOT), j = Math.round(z/LOT), c = cells.get(ckey(i, j)); if (!c) return 0;
    if (c.mega && c.mega === skip) return 0;
    if (c.mega){ const m = megas.get(c.mega); return m ? m.top || CURB + 6 : 0; }
    if (Math.abs(x - i*LOT) > SIDE*.55 || Math.abs(z - j*LOT) > SIDE*.55) return 0;
    return c.sections.length ? c.height : CURB; };
  function los(x, y, z, yw, pt, skip){   // from (x, y, z) toward a camera at yaw yw and pitch pt: nothing in the way?
    const cp = Math.cos(pt), dx = Math.sin(yw)*cp, dy = Math.sin(pt), dz = Math.cos(yw)*cp;
    for (let s = .3; s < 160; s += .2){ const yy = y + dy*s; if (yy > 60) return true; const h = hAt(x + dx*s, z + dz*s, skip); if (h > CURB + .05 && yy < h + .05) return false; }
    return true;
  }
  const clearAll = (pts, yw, pt) => pts.every(p => los(p.x, CURB + .55, p.z, yw, pt));

  /* ---------- planning: the buildings, the resident, their walk, the cameras, all worked out before the film rolls ---------- */
  const PLAN = {};
  const cellAt = (i, j) => cells.get(ckey(i, j));
  function buildBlock(k){   // block k as the clicks build it (each click its own seed: the same buildings every time)
    const b = PLAN.blocks[k], c = cellAt(b.i, b.j); if (!c) return;
    b.clicks.forEach((ct, n) => withSeed(h32('block', k, n), () => addSection(c, b.zone)));
  }
  function clearBlocks(){ for (const b of PLAN.blocks){ const c = cellAt(b.i, b.j); if (c){ c.sections = []; c.green = PLAN.green.get(ckey(b.i, b.j)) || 'grass'; } } rebuildAll(); settleAll(); }
  function doorOf(i, j){ const pl = places.get('c:' + i + ',' + j); return pl ? STORY.streetDoor(pl) : null; }
  function settleAll(){ finishSync(); while (anims.length) endAnim(0); finishSync(); }
  function plan(){
    // 1. the first building alone, to see which way its door faces
    const b1 = { i: PC0.i, j: PC0.j }, c1 = cellAt(b1.i, b1.j);
    PLAN.green = new Map([[ckey(b1.i, b1.j), c1.green]]);
    PLAN.blocks = [{ i: b1.i, j: b1.j, zone: BLOCKS[0], clicks: CLICK_T[0] }];
    buildBlock(0); settleAll();
    let d = doorOf(b1.i, b1.j); if (!d) throw new Error('the first building has no door');
    const way = d => ({ x: Math.round(d.n[0]) || 0, z: Math.round(d.n[1]) || 0 });
    // 2. the other four: either side of it with a plot between, and two behind those; never in front of it, where the walk is. Its door can turn
    // to another side once they stand (a door faces the open side): then they go up again round the new side, until the door stays where it is
    let n = way(d), tries = 0;
    for (;;){
      const tv = { x: -n.z, z: n.x };   // (across its outward way)
      PLAN.blocks.length = 1;
      [[2, 0], [-2, 0], [2, -2], [-2, -2]].forEach(([a, b], q) => {
        const k = q + 1, i = b1.i + a*tv.x + b*n.x, j = b1.j + a*tv.z + b*n.z;
        if (!inPlaza(i, j)) warn('plan', 'block ' + k + ' is off the plaza at ' + i + ',' + j);
        PLAN.blocks.push({ i, j, zone: BLOCKS[k], clicks: CLICK_T[k] }); if (!PLAN.green.has(ckey(i, j))) PLAN.green.set(ckey(i, j), (cellAt(i, j) || {}).green);
      });
      for (let k = 1; k < 5; k++) buildBlock(k);
      settleAll();
      d = doorOf(b1.i, b1.j) || d; const n2 = way(d);
      if ((n2.x === n.x && n2.z === n.z) || ++tries >= 4) break;
      say('plan: the door turned to', JSON.stringify(n2), 'with the others up: placing them again');
      for (let k = 1; k < 5; k++){ const b = PLAN.blocks[k], c = cellAt(b.i, b.j); if (c){ c.sections = []; c.green = PLAN.green.get(ckey(b.i, b.j)) || 'grass'; } }
      rebuildAll(); settleAll(); n = n2;
    }
    const tv = { x: -n.z, z: n.x };
    PLAN.tops = PLAN.blocks.map(b => { const c = cellAt(b.i, b.j); return c ? c.height : CURB + 3; });
    PLAN.door = { key: d.key, wall: { x: d.wall.x, z: d.wall.z }, stand: { x: d.stand.x, z: d.stand.z }, n: [d.n[0], d.n[1]] };
    // 3. the resident: the first member of the lowest household in the first building
    safe('pods', () => podsResync(c1));
    const hh = [...POD_HH.values()].filter(x => x.row.cell[0] === b1.i && x.row.cell[1] === b1.j && x.members.some(id => people.has(id))).sort((a, b) => a.row.floor - b.row.floor);
    if (!hh.length) throw new Error('nobody lives in the first building');
    const p = people.get(hh[0].members.find(id => people.has(id)));
    let nm = null; safe('name', () => { const sp = STORY.sp(p); if (sp && sp.first) nm = (sp.first + (sp.last ? ' ' + sp.last : '')).toUpperCase(); });
    const job = safe('job', () => STORY.JOB_WORD[STORY.jobKind(p)]) || null;
    PLAN.who = { id: p.id, code: p.row, pod: hh[0].key, floor: hh[0].row.floor, name: nm || 'RESIDENT', job, household: hh[0].members.length };
    // 4. their walk: from a little out on the plaza straight to their door, and in
    const N = { x: PLAN.door.n[0], z: PLAN.door.n[1] }, st = PLAN.door.stand;
    const S0 = { x: st.x + N.x*1.75 + N.z*.35, z: st.z + N.z*1.75 - N.x*.35 };
    PLAN.walk = [S0, st, PLAN.door.wall];
    const pts = []; for (let k = 0; k <= 12; k++){ const u = k/12; pts.push({ x: lerp(S0.x, st.x, u), z: lerp(S0.z, st.z, u) }); }
    // 5. the cameras: the main one from the plaza side, three-quarter on; the person cam's feed from the side, steeper; both with nothing in the way
    const yN = Math.atan2(N.x, N.z);
    const pick = (offs, pitches) => { for (const pt of pitches) for (const o of offs) if (clearAll(pts, yN + o, pt*DEG)) return { yaw: yN + o, pitch: pt*DEG, ok: true };
      return { yaw: yN + offs[0], pitch: pitches[pitches.length - 1]*DEG, ok: false }; };
    PLAN.cam = pick([.55, -.55, .4, -.4, .75, -.75, .2, -.2], [34, 38, 42, 48]);
    PLAN.feed = pick([1.05, -1.05, .85, -.85, 1.3, -1.3, .6, -.6], [44, 50, 56, 62]);
    if (!PLAN.cam.ok) warn('plan', 'no clear main camera angle on the walk');
    if (!PLAN.feed.ok) warn('plan', 'no clear person cam angle on the walk');
    // what the main camera frames: all five buildings (to their finished height) and the walk; then closer, the first building and its door
    const box = (b, top) => { const h = SIDE/2, out = []; for (const [a, c] of [[-h, -h], [h, -h], [-h, h], [h, h]]) for (const y of [CURB, top]) out.push({ x: b.i*LOT + a, y, z: b.j*LOT + c }); return out; };
    const walkPts = pts.map(q => ({ x: q.x, y: CURB + .8, z: q.z })).concat(pts.map(q => ({ x: q.x, y: CURB, z: q.z })));
    PLAN.wide = PLAN.blocks.flatMap((b, k) => box(b, PLAN.tops[k])).concat(walkPts);
    PLAN.near = box(PLAN.blocks[0], PLAN.tops[0]).concat(walkPts);
    // 6. a few people out on the plaza in front of the buildings, crossing it (looks taken from the city's residents)
    PLAN.extras = [];
    const crowd = pplList.filter(q => q.id !== p.id && !q.cop && !q.archivist && q.row !== undefined);
    [[3.1, -2.6, 2.6, .44], [3.9, 2.8, -2.4, .4], [2.3, -2.9, -1.2, .38]].forEach(([fwd, a0, a1, v], k) => {
      const q = crowd[(k*37 + 11) % Math.max(1, crowd.length)]; if (!q) return;
      const P0 = { x: c1.x + N.x*fwd*LOT/2.2 + tv.x*a0*LOT, z: c1.z + N.z*fwd*LOT/2.2 + tv.z*a0*LOT }, P1 = { x: c1.x + N.x*fwd*LOT/2.2 + tv.x*a1*LOT, z: c1.z + N.z*fwd*LOT/2.2 + tv.z*a1*LOT };
      PLAN.extras.push({ id: 'x' + k, code: q.row, keys: [[0, P0.x, P0.z, 'walk', 0, 1, 1], [Math.hypot(P1.x - P0.x, P1.z - P0.z)/v, P1.x, P1.z, 'walk', 0, 1, 1]] });
    });
    D.info.plan = { door: PLAN.door.n, who: PLAN.who, cam: { yaw: +PLAN.cam.yaw.toFixed(2), pitch: Math.round(PLAN.cam.pitch/DEG), clear: PLAN.cam.ok },
      feed: { yaw: +PLAN.feed.yaw.toFixed(2), pitch: Math.round(PLAN.feed.pitch/DEG), clear: PLAN.feed.ok }, blocks: PLAN.blocks.map(b => b.i + ',' + b.j + ' ' + b.zone) };
    say('plan:', JSON.stringify(D.info.plan));
    // (the buildings stay up for now: the apartment is furnished once before the film, below; then the plaza is cleared)
  }
  function castUp(){
    const [S0, st, wall] = PLAN.walk, N = PLAN.door.n;
    addCast('who', PLAN.who.code, [
      [0, S0.x, S0.z, 'phone', N[0], N[1]], [MK.walk, S0.x, S0.z, 'walk', -N[0], -N[1]], [MK.arrive, st.x, st.z, 'walk'],
      [MK.arrive + .1, st.x + (wall.x - st.x)*.3, st.z + (wall.z - st.z)*.3, 'walk'], [MK.inside, wall.x, wall.z, 'walk', -N[0], -N[1], 0]]);
    for (const x of PLAN.extras) addCast(x.id, x.code, x.keys);
  }

  /* ---------- the page: the game's interface hidden, the script's on top ---------- */
  function overlay(){
    html.classList.add('dm-on');
    const st = document.createElement('style'); st.id = 'dmStyle';
    st.textContent = `
      html.dm-on body > *:not(#view):not(#dmOv):not(canvas):not(#gridPanel):not(#furnish):not(.zonebar):not(#monitor){visibility:hidden!important}
      html.dm-on .zonebar{visibility:hidden!important}
      html.dm-on.dm-zones .zonebar .zones{visibility:visible!important}
      html.dm-on .zonebar .zones .rot,html.dm-on .zonebar .zones .furnbtn,html.dm-on .zonebar .perim,html.dm-on .zonebar .zones .perim{visibility:hidden!important}
      html.dm-on #monitor{visibility:hidden!important}
      html.dm-on #monitor.tr-keep{visibility:visible!important;transform:scale(var(--monk,1.4));transform-origin:top right;top:3vh!important;right:2vh!important;max-height:calc(94vh/var(--monk,1.4))!important;overflow:hidden;transition:none!important;animation:none!important}
      html.dm-on #monitor.tr-keep *{transition:none!important;animation:none!important}
      html.dm-on #monitor.tr-keep #monPin, html.dm-on #monitor.tr-keep #monClose{visibility:hidden!important}
      html.dm-on #monitor.tr-keep #monTabs{display:none!important}
      html.dm-on .furnish-frame{transition:none!important}
      html.dm-on, html.dm-on *{cursor:none!important}
      html.dm-on #dmOv.ask, html.dm-on #dmOv.ask *{cursor:pointer!important}
      html.dm-on body > #dmOv#dmOv#dmOv#dmOv#dmOv#dmOv{visibility:visible!important}
      #dmOv{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Chakra Petch','JetBrains Mono',sans-serif;-webkit-font-smoothing:antialiased}
      #dmOv.ask{pointer-events:auto}
      #dmOv > .fill{position:absolute;inset:0;opacity:0}
      #dmBlack{background:#04050b}
      #dmShade{background:radial-gradient(ellipse 70% 60% at 50% 50%,rgba(6,7,16,.28),rgba(6,7,16,.78))}
      #dmSel{position:absolute;left:0;top:0;width:0;height:0;display:none}
      #dmSel b{position:absolute;width:22px;height:22px;border:3px solid #38e8e0;filter:drop-shadow(0 0 6px rgba(56,232,224,.9))}
      #dmSel b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #dmSel b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #dmSel b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #dmSel b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #dmSel i{position:absolute;left:50%;top:-14px;width:8px;height:8px;margin-left:-4px;background:#ff4fa3;transform:rotate(45deg);box-shadow:0 0 10px #ff4fa3}
      #dmCur{position:absolute;left:0;top:0;width:30px;height:30px;margin:-3px 0 0 -4px;opacity:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
      #dmRing{position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:2px solid #fff;opacity:0}
      #dmCap{position:absolute;left:0;top:0;padding:7.5vh 0 0 4.8vw;width:60vw;height:28vh;display:flex;flex-direction:column;justify-content:flex-start;
        background:radial-gradient(ellipse 62% 70% at 0% 0%,rgba(4,6,14,.78),rgba(4,6,14,.42) 45%,transparent 75%);opacity:0}
      #dmCap.tr{left:auto;right:0;padding:9vh 3vw 0 0;align-items:flex-end;background:radial-gradient(ellipse 62% 70% at 100% 0%,rgba(4,6,14,.78),rgba(4,6,14,.42) 45%,transparent 75%)}
      #dmCap.tr i{transform-origin:100% 50%}
      #dmCap.bl{top:auto;bottom:0;padding:0 0 7vh 4.8vw;justify-content:flex-end;background:radial-gradient(ellipse 62% 70% at 0% 100%,rgba(4,6,14,.85),rgba(4,6,14,.5) 45%,transparent 75%)}
      #dmCap.tc{left:20vw;width:60vw;padding:10.5vh 0 0;align-items:center;text-align:center;background:radial-gradient(ellipse 55% 75% at 50% 30%,rgba(3,12,16,.88),rgba(3,12,16,.55) 50%,transparent 78%)}
      #dmCap.tc i{transform-origin:50% 50%}
      #dmCap b{display:block;font-weight:600;font-size:5.2vh;line-height:1.04;letter-spacing:-.01em;color:#f3fbff;white-space:nowrap;text-shadow:0 3px 18px rgba(3,5,12,.75),0 1px 2px rgba(0,0,0,.7)}
      #dmCap i{display:block;margin-top:1.7vh;height:3px;width:5vw;background:#38e8e0;transform-origin:0 50%;box-shadow:0 2px 12px rgba(56,232,224,.55)}
      #dmCap i::after{content:'';display:block;margin-left:calc(5vw + 8px);width:14px;height:3px;background:#ff4fa3;box-shadow:0 2px 10px rgba(255,79,163,.6)}
      #dmTag{position:absolute;right:0;bottom:0;padding:0 3.3vw 4.8vh 11vw;height:14vh;display:flex;align-items:flex-end;gap:12px;
        background:radial-gradient(ellipse 80% 80% at 100% 100%,rgba(4,6,14,.6),transparent 70%);opacity:0}
      #dmTag.tr{bottom:auto;top:20.5vh;padding:0 3vw 0 0;height:auto;background:none}
      #dmTag.tc{bottom:auto;right:auto;left:0;width:100vw;top:22.5vh;padding:0;height:auto;justify-content:center;background:none}
      #dmTag span{font-weight:600;font-size:1.5vh;letter-spacing:.32em;text-transform:uppercase;color:rgba(234,250,255,.86);text-shadow:0 1px 6px rgba(0,0,0,.7)}
      #dmTag u{display:block;width:7px;height:7px;margin-bottom:.45vh;background:#38e8e0;box-shadow:0 1px 8px rgba(56,232,224,.8);text-decoration:none}
      #dmTitle{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      #dmTitle svg{width:62vw;max-height:52vh;height:auto;display:block;overflow:visible}
      #dmTitle #neon{filter:drop-shadow(0 0 .35vw rgba(255,74,110,.85)) drop-shadow(0 0 1.6vw rgba(255,74,110,.45))}
      #dmTitle #terrarium{filter:drop-shadow(0 0 .3vw rgba(61,255,207,.8))}
      #dmMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #dmMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'dmOv';
    ov.innerHTML = '<i class="fill" id="dmShade"></i><div id="dmSel"><b></b><b></b><b></b><b></b><i></i></div><div id="dmTitle"></div>'
      + '<div id="dmCap"><b></b><i></i></div>'
      + '<div id="dmTag"><u></u><span>All footage captured in engine</span></div>'
      + '<svg id="dmCur" viewBox="0 0 30 30" aria-hidden="true"><path d="M4 3 L4 24 L9.6 18.8 L13.4 27.2 L17.2 25.5 L13.5 17.3 L21 17.3 Z" fill="#f4fbff" stroke="#0a0c16" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      + '<i id="dmRing"></i><i class="fill" id="dmBlack"></i>'
      + '<div id="dmMsg"><b>Demo clip</b><span id="dmStatus">building the city</span></div>';
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    D.el = { ov, black: q('#dmBlack'), shade: q('#dmShade'), sel: q('#dmSel'), cur: q('#dmCur'), ring: q('#dmRing'), cap: q('#dmCap'), capT: q('#dmCap b'), capL: q('#dmCap i'),
      tag: q('#dmTag'), title: q('#dmTitle'), msg: q('#dmMsg'), status: q('#dmStatus') };
    D.el.black.style.opacity = '1';
    const monk = () => html.style.setProperty('--monk', (1.4*innerHeight/1080).toFixed(3)); monk(); addEventListener('resize', monk);
    if (CAP || AUTO) D.el.msg.hidden = true;
  }
  async function title(){   // the trailer's SVG, both words the same height, cropped to what it draws so it sits in the middle (the stage's)
    const txt = await fetch('assets/trailer/neon_terrarium_title.svg').then(r => r.text());
    const E = D.el; E.title.innerHTML = txt;
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
  const status = s => { D.stage = s; if (D.el) D.el.status.textContent = s; };

  /* ---------- the person cam: the game's panel, filled in by the script (the stage's) ---------- */
  const MONI = { el: null, cv: null, g: null, rt: null, fcam: null, pix: null, img: null, off: null, og: null, cur: null, shown: -1 };
  const RW = 192, RH = 108, HALF = 1.25;   // (closer than the game's 2.6: the person fills a good part of the feed)
  function monSetup(){
    MONI.el = $('monitor'); MONI.cv = $('monFeed'); MONI.g = MONI.cv.getContext('2d');
    MONI.rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
    MONI.fcam = new THREE.OrthographicCamera(-HALF*RW/RH, HALF*RW/RH, HALF, -HALF, NEAR, FAR); MONI.fcam.layers.enableAll(); MONI.fcam.layers.disable(6);
    MONI.pix = new Uint8Array(RW*RH*4); MONI.off = document.createElement('canvas'); MONI.off.width = RW; MONI.off.height = RH; MONI.og = MONI.off.getContext('2d'); MONI.img = MONI.og.createImageData(RW, RH);
    const tr = $('monTrace'); if (tr) tr.textContent = '';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let MONITOR = null;
  function monitorScript(){
    const w = PLAN.who, nth = ['ground', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][w.floor] || (w.floor + 'th');
    const first = w.name.split(' ')[0];
    const cap = s => s.charAt(0) + s.slice(1).toLowerCase();
    MONITOR = { t0: MK.person, t1: MK.inside + .02, actor: 'who', name: 'SUBJECT', sub: 'unknown', names: [[MK.person + .6, w.name, 'name verified']], clock: '20:36',
      yaw: PLAN.feed.yaw, pitch: PLAN.feed.pitch,
      log: [[MK.person + .6, '20:36', 'Comm call ends. Name on the screen: ' + cap(first) + '.'],
            [MK.person + 1.5, '20:36', 'Heads across the plaza, toward the new tenement.'],
            [MK.person + 2.4, '20:37', (w.job ? 'Works as a ' + w.job + '. ' : '') + 'Lives on the ' + nth + ' floor' + (w.household > 1 ? ', household of ' + w.household : '') + '.'],
            [MK.arrive - .05, '20:37', 'Keys out. In through the front door.']] };
  }
  function monFrame(t){
    const M = MONITOR && t >= MONITOR.t0 && t < MONITOR.t1 ? MONITOR : null;
    if (!M){ if (MONI.cur){ MONI.cur = null; MONI.el.hidden = true; MONI.el.classList.remove('tr-keep'); } return; }
    if (MONI.cur !== M){ MONI.cur = M; MONI.shown = -1; MONI.el.hidden = false; MONI.el.classList.add('tr-keep'); }
    MONI.el.style.opacity = String(Math.min(1, ss((t - M.t0)/.25)));
    { let nm = M.name, sb = M.sub; for (const [tn, n2, s2] of M.names) if (t >= tn){ nm = n2; sb = s2; } $('monName').textContent = nm; $('monSub').textContent = sb; }
    const n = M.log.filter(l => t >= l[0]).length;
    if (n !== MONI.shown){ MONI.shown = n; const body = $('monBody');
      body.innerHTML = n ? M.log.slice(0, n).map(([, stamp, text]) => '<div class="ml reveal"><time>' + esc(stamp) + '</time><span>' + esc(text) + '</span></div>').join('') : '<p class="mon-empty">Nothing logged yet.</p>';
      body.scrollTop = body.scrollHeight; }
    // the feed: a camera of its own over the person, at the angle worked out for it (nothing in the way, every step of the walk)
    const q = castPose(M.actor); if (!q) return;
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
    g.textAlign = 'right'; g.fillText('CAM 04', W - 8, 7); g.textAlign = 'left';
    g.fillText(M.clock, 8, Hh - 16);
  }
  const _v = new THREE.Vector3();
  function brackets(q){
    const E = D.el.sel;
    if (!q || q.alpha < .5){ E.style.display = 'none'; return; }
    _v.set(q.x, q.y + .42, q.z).project(cam);
    const sx = (_v.x + 1)/2*innerWidth, sy = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.style.display = 'block'; E.style.transform = `translate(${(sx - w/2).toFixed(1)}px,${(sy - h/2).toFixed(1)}px)`; E.style.width = w.toFixed(0) + 'px'; E.style.height = h.toFixed(0) + 'px';
  }

  /* ---------- their front door, opening as they go in and shutting after ---------- */
  function doorAt(t){
    const d = PLAN.door && doorByKey.get(PLAN.door.key); if (!d) return;
    const v = t < MK.arrive - .2 ? 0 : t < MK.arrive + .1 ? ss(seg(t, MK.arrive - .2, MK.arrive + .1)) : t < MK.inside ? 1 : 1 - ss(seg(t, MK.inside, MK.inside + .3));
    if (Math.abs(v - d.open) > 1e-4){ d.open = v; d.want = v > .5; const i = doorList.indexOf(d); if (i >= 0 && i < DOOR_MAX){ setPanel(i, d); doorPanel.instanceMatrix.needsUpdate = true; } }
  }

  /* ---------- the cursor: drawn, so it shows in the film ---------- */
  const CUR = { x: 0, y: 0, tx: null, ty: null, pulse: -9, col: '#ffffff', on: 0, want: 0 };
  function aim(s){ if (!s) return; CUR.tx = s.x; CUR.ty = s.y; CUR.want = 1; }
  function click(col){ CUR.pulse = D.t; if (col) CUR.col = col; }
  const toScreen = p => { _v.set(p.x, p.y, p.z).project(cam); return { x: (_v.x + 1)/2*innerWidth, y: (1 - _v.y)/2*innerHeight }; };

  /* ---------- the build: each click as a player makes it ---------- */
  function clickPoint(k, n){ const b = PLAN.blocks[k], c = cellAt(b.i, b.j); return { x: b.i*LOT, y: n && c ? c.height + .05 : CURB + .3, z: b.j*LOT }; }
  function doClick(k, n){
    const b = PLAN.blocks[k], c = cellAt(b.i, b.j); if (!c) return warn('click', 'no plot ' + b.i + ',' + b.j);
    if (S.zone !== b.zone) selectZone(b.zone);
    const tg = n ? { type: 'up', c } : { type: 'onto', c };
    safe('hover', () => showHover(tg));
    withSeed(h32('block', k, n), () => { if (!applyTarget(tg)) warn('click', 'did not build at ' + b.i + ',' + b.j); });
    click(ZONES[b.zone] ? ZONES[b.zone].col : '#fff');
  }

  /* ---------- Furnish pod: the game's own hologram into their apartment, its time set by the film (the stage's) ---------- */
  const labWin = () => { const f = FURN.frame; return f && f.contentWindow; };
  const labPC = () => { const w = labWin(); return w && w.PodContext; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  const labDoc = () => { const w = labWin(); return w && w.document; };
  const labEl = sel => { const d = labDoc(); return d && d.querySelector(sel); };
  const frameRect = () => FURN.frame ? FURN.frame.getBoundingClientRect() : { left: 0, top: 0 };
  function labCenter(el){ const f = frameRect(), r = el.getBoundingClientRect(); return { x: f.left + r.left + r.width/2, y: f.top + r.top + r.height/2 }; }
  function labNoCursor(){ const d = labDoc(); if (!d || !d.head || d.getElementById('dmLab')) return; const st = d.createElement('style'); st.id = 'dmLab'; st.textContent = '*{cursor:none!important}'; d.head.appendChild(st); }
  function labWait(){   // the home still being built, its hologram city still coming, or its light not baked yet
    const w = labWin(); if (!w) return 'the lab';
    try { const PB = w.PodBuilder, PR = w.PodRender, PC = w.PodContext;
      if (PB && PB.homePending && PB.homePending()) return 'build';
      { const C = PC && PC._debug && PC._debug.state(); if (C && C.city && C.city.building) return 'the hologram city'; }
      { const ws = PR && PR.warmState && PR.warmState(); if (ws && !ws.broken && (!ws.finished || !ws.matReady || ws.queue)) return 'shaders'; }
      if (PB && PB.prOn && PB.prOn()) return !(PC._prDriving && PC._prDriving()) || (PR && PR.lightPending && PR.lightPending()) ? 'light' : false; } catch (e) {}
    return false;
  }
  const labReady = () => { const B = labB(); return FURN.open && $('furnish').classList.contains('live') && !(labPC() && labPC().transitioning) && B && B.inst && B.inst.size > 0 && !labWait(); };
  const AP = { on: false, started: false, roomOk: false, closed: false, exited: false, held0: null };
  const H0 = .3, holoCurve = x => { x = clamp01(x); return .55*x + .45*ss5(x); };
  const HOLD_MAX = window.__DM_TEST ? 7200e3 : 1200e3;   // (real time: twenty minutes for any one thing the lab is doing, two hours when checking with no graphics card)
  function hold(why){   // the film waits here (nothing drawn or filmed) until the lab is ready
    if (AP.heldWhy !== why){ AP.heldWhy = why; AP.held0 = Date.now(); AP.gaveUp = false; }
    if (Date.now() - AP.held0 > HOLD_MAX){ if (!AP.gaveUp){ AP.gaveUp = true; warn('apartment', 'waited ' + Math.round(HOLD_MAX/60e3) + ' min for the lab (' + why + '): going on'); } return false; }
    if (D.info.wait !== why){ D.info.wait = why; say('waiting for the lab:', why); }
    D.held = true; return true;
  }
  function aptTick(t){
    if (AUTO || NOLAB || AP.closed || t < MK.furn) return;
    if (!AP.on){ AP.on = !!safe('open', () => FURN.openKey(PLAN.who.pod)); if (!AP.on){ warn('apartment', 'did not open ' + PLAN.who.pod); AP.closed = true; return; } say('apartment', PLAN.who.pod); }
    const ov = $('furnish'), fr = FURN.frame, PC = labPC(), B = labB(), w = labWin();
    if (!fr || !PC || !PC._debug){ hold('the lab page'); return; }
    if (CAP && w) w.Math.random = rng(h32('lab', D.frame));
    if (B) B.needs = true;
    if (B && B.on && !B.raf) safe('lab loop', () => { const PB = w.PodBuilder; if (B.warmHold && PB.warmHold) PB.warmHold(false); if (!B.raf && PB.pauseRender) PB.pauseRender(false); });
    if (AP.exited) return;
    const DUR = PC._debug.DUR || 3.05, st = PC._debug.state(), live = ov.classList.contains('live');
    fr.style.opacity = '1';
    if (t < MK.room){   // the hologram flies in
      const u = H0 + (DUR - H0)*holoCurve((t - MK.furn)/(MK.room - MK.furn));
      if (!live){ hold('the hologram'); return; }
      if (!st || !st.trans){ if (!AP.started) hold('the hologram to start'); return; }
      const lw = labWait(); st.trans.holding = !!lw; st.trans.holdBuild = lw === 'build';
      if (!AP.started){
        if (!(st.ready && st.shown && !st.pendingHome)){ PC._debug.hold(H0); hold('the city'); return; }
        if (lw){ PC._debug.hold(H0); hold(lw); return; }
        AP.started = true; AP.held0 = null; say('hologram rolling at', t.toFixed(2));
      }
      PC._debug.hold(u);
      return;
    }
    if (st && st.trans){ PC._debug.hold(DUR + .01); return; }   // (its last frame, then the room)
    if (!AP.roomOk){
      if (PC.transitioning){ hold('the hologram to end'); return; }
      const lw = labWait(); if (lw){ hold('the room: ' + lw); return; }
      AP.roomOk = true; AP.held0 = null; labNoCursor(); D.info.roomAt = +t.toFixed(2); say('the room is ready at', t.toFixed(2));
    }
  }
  // the furnishing, a step at a time: the Plants catalog, a bonsai tile, set on their table, picked, its color menu, a new color
  function labGroup(){ const b = labEl('#bRail [data-grp="plants"]'); if (b){ aim(labCenter(b)); click('#5aff7a'); b.click(); } else warn('furnish', 'no Plants in the rail'); }
  const FU = {};
  function labTile(){
    const d = labDoc(); if (!d) return;
    const tiles = [...d.querySelectorAll('#bTiles .tile')];
    const t = tiles.find(x => x._it && x._it.arch === 'bonsai') || tiles.find(x => x._it && x._it.arch === 'snake') || tiles[0];
    if (!t) return warn('furnish', 'no tiles');
    try { t.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    aim(labCenter(t)); click('#5aff7a'); t.click(); FU.arch = t._it && t._it.arch;
  }
  function labScreen(x, y, z){   // a point in the room to the page, through the lab's own camera (the stage's)
    const B = labB(), w = labWin();
    const V = B.cam.matrixWorldInverse.elements, P = B.cam.projectionMatrix.elements;
    const ex = V[0]*x + V[4]*y + V[8]*z + V[12], ey = V[1]*x + V[5]*y + V[9]*z + V[13], ez = V[2]*x + V[6]*y + V[10]*z + V[14], ew = V[3]*x + V[7]*y + V[11]*z + V[15];
    const cx = P[0]*ex + P[4]*ey + P[8]*ez + P[12]*ew, cy = P[1]*ex + P[5]*ey + P[9]*ez + P[13]*ew, cw = P[3]*ex + P[7]*ey + P[11]*ez + P[15]*ew;
    const cv = w.document.getElementById('bCanvas') || w.document.querySelector('canvas'), r = cv.getBoundingClientRect(), f = frameRect();
    const lx = r.left + (cx/cw + 1)/2*r.width, ly = r.top + (1 - cy/cw)/2*r.height;
    return { cv, lx, ly, x: f.left + lx, y: f.top + ly };
  }
  const TABLES = new Set(['slab', 'crate', 'spool', 'holo', 'loop', 'block', 'cafe', 'kotatsu', 'fold', 'bar', 'drum', 'island', 'counter']);
  function labTable(){
    const w = labWin(), B = labB(); let tb = null;
    for (const i of B.inst.values()){ if (!i.rec || !TABLES.has(i.rec.arch)) continue; const s = safe('surf', () => w.PodBuilder.surfaces(i.rec.id)) || [];
      for (const q of s){ const a = q.w*q.d; if (!tb || a > tb.a) tb = { q, a }; } }
    if (!tb) return null;
    const r = B.root.position; return { x: tb.q.x + r.x, y: tb.q.y + r.y, z: tb.q.z + r.z };
  }
  function labAim(){   // over the table, before setting it down: the piece follows the pointer there
    const w = labWin(), B = labB(); if (!B) return;
    FU.at = labTable();
    if (!FU.at){ warn('furnish', 'no table: on the floor'); const r = B.root.position, P = B.P; FU.at = { x: r.x + (P ? P.W*.5*(B.TILE || .5) : 2), y: r.y, z: r.z + (P ? P.D*.5*(B.TILE || .5) : 2) }; }
    const s = labScreen(FU.at.x, FU.at.y, FU.at.z); aim(s);
    s.cv.dispatchEvent(new w.PointerEvent('pointermove', { clientX: s.lx, clientY: s.ly, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: -1, buttons: 0 }));
    try { B.ptr.dirty = true; } catch (e) {}
  }
  function labPlace(){
    const w = labWin(), B = labB(); if (!B || !FU.at) return;
    const before = new Set(B.inst.keys());
    if (!B.place) safe('start place', () => w.PodBuilder.startPlace(FU.arch || 'bonsai', 7));
    const s = labScreen(FU.at.x, FU.at.y, FU.at.z), o = { clientX: s.lx, clientY: s.ly, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    aim(s); click('#5aff7a'); s.cv.setPointerCapture = () => {};
    s.cv.dispatchEvent(new w.PointerEvent('pointermove', Object.assign({ button: -1, buttons: 0 }, o)));
    try { B.ptr.dirty = true; } catch (e) {}
    s.cv.dispatchEvent(new w.PointerEvent('pointerdown', Object.assign({ button: 0, buttons: 1 }, o)));
    s.cv.dispatchEvent(new w.PointerEvent('pointerup', Object.assign({ button: 0, buttons: 0 }, o)));
    if (B.place) safe('cancel place', () => w.PodBuilder.cancel());
    labLeave();   // (the pointer goes on to the catalog's close, off the room)
    FU.id = [...B.inst.keys()].find(k => !before.has(k));
    D.info.placed = FU.id !== undefined ? FU.arch || '?' : null;
    if (FU.id === undefined) warn('furnish', 'nothing was placed');
  }
  function labSelect(){ const w = labWin(); if (FU.id === undefined) return; const s = labScreen(FU.at.x, FU.at.y + .2, FU.at.z); aim(s); click('#ffffff'); safe('select', () => w.PodBuilder.select(FU.id)); }
  function labSwatch(){
    const B = labB(), inst = B && B.inst.get(FU.id); if (!inst) return;
    { const w = labWin(), st = safe('state', () => w.PodBuilder.touch.state()); if (!(st && st.sel && st.sel.id === FU.id)) safe('select', () => w.PodBuilder.select(FU.id)); }   // (placing picks it already)
    const k = Math.max(0, inst.slots.findIndex(sl => sl.kind !== 'e'));
    const b = labEl('#iSw .sw[data-i="' + k + '"]') || labEl('#iSw .sw'); if (!b) return warn('furnish', 'no color swatch');
    aim(labCenter(b)); click('#ffffff'); b.click();
  }
  function labColor(){
    const d = labDoc(), bs = d ? [...d.querySelectorAll('#iCP .pal button')] : []; if (!bs.length) return warn('furnish', 'no palette');
    const sat = hex => { const n = parseInt(String(hex).replace('#', ''), 16), r = (n >> 16)/255, g = (n >> 8 & 255)/255, b = (n & 255)/255; return Math.max(r, g, b) - Math.min(r, g, b); };
    const pick = bs.slice().sort((a, b) => sat(b.dataset.c) - sat(a.dataset.c))[0];
    aim(labCenter(pick)); click(pick.dataset.c); pick.click(); D.info.color = pick.dataset.c;
  }
  // the lab's own pointer off the room (its pointerleave: no hover outline on whatever ends up under where the pointer last was)
  function labLeave(){ const w = labWin(), d = labDoc(), cv = d && (d.getElementById('bCanvas') || d.querySelector('canvas')); if (cv) safe('leave', () => cv.dispatchEvent(new w.PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', isPrimary: true }))); }
  function labLetGo(){ const w = labWin(); safe('let go', () => w.PodBuilder.select(null)); }
  // the lab's view eases in on the bonsai once the catalog is closed (its own zoom, toward a point picked so the bonsai ends a little left of
  // the middle, clear of the inspector on the right): a zoom about P keeps P still, so the bonsai at Q ends at P + Z(Q - P)
  const LZ = { from: MK.room + 2.3, to: MK.room + 3.1, max: 1.9 };
  function labZoom(t){
    if (NOLAB || AUTO || FU.id === undefined || !FU.at || t < LZ.from || FU.zoomDone) return;
    const w = labWin(), T = w && w.PodBuilder && w.PodBuilder.touch; if (!T) return;
    if (!FU.zp){ const s = safe('zoom from', () => labScreen(FU.at.x, FU.at.y + .15, FU.at.z)); if (!s) { FU.zoomDone = true; return; }
      const f = frameRect(), cx = innerWidth*.44 - f.left, cy = innerHeight*.5 - f.top, Z = LZ.max;
      FU.zp = { x: (Z*s.lx - cx)/(Z - 1), y: (Z*s.ly - cy)/(Z - 1) }; FU.z = 1; }
    const want = elerp(1, LZ.max, ease(seg(t, LZ.from, LZ.to)));
    if (Math.abs(want/FU.z - 1) > 1e-4){ safe('zoom', () => T.zoomAt(want/FU.z, FU.zp.x, FU.zp.y)); FU.z = want; labLeave(); }   // (zoomAt aims the lab's pointer: off the room again, or what the zoom slides under it lights up)
    if (t >= LZ.to) FU.zoomDone = true;
  }
  function labExit(){ AP.exited = true; if (FURN.frame) FURN.frame.style.opacity = '';   // (the game's own power-down hides it from here)
    const b = labEl('#ntExit'); if (b){ aim(labCenter(b)); click('#ffffff'); b.click(); } else FURN.close(); }

  /* ---------- the Grid and its Acoustic Panel ---------- */
  const gridMega = () => megasOfKind('radio')[0];
  function noteAt(beat, pad){
    const cv = $('gStripCv'); if (!cv) return null;
    const v = BOOTH._sv(), r = cv.getBoundingClientRect(), top = 24, rowH = (r.height - top - 10)/(v.hi - v.lo + 1);
    return { cv, x: r.left + (beat + .12 - v.b0)/v.span*r.width, y: r.top + r.height - 6 - (pad - v.lo + .5)*rowH };
  }
  function addNote(k){
    const [b, i] = MISSING[k], s = noteAt(b, i); if (!s) return warn('note', 'no strip');
    aim(s); click('#e8d553');
    const o = { clientX: s.x, clientY: s.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    s.cv.setPointerCapture = () => {};
    s.cv.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ buttons: 1 }, o)));
    s.cv.dispatchEvent(new PointerEvent('pointerup', Object.assign({ buttons: 0 }, o)));
    const has = () => (BOOTH.state.layers[0] || []).some(x => Math.abs(x.b - b) < .26 && x.i === i);
    D.info['note' + (k + 1)] = has() ? 'drawn in' : 'added directly';
    if (!has()){ warn('note', (k + 1) + ' did not land on the strip: added directly'); const L = BOOTH.state.layers; if (!L.length) L.push([]); L[0].push({ b, d: 1, i, v: .8 }); L[0].sort((x, y) => x.b - y.b); }
  }
  function notesEarly(){   // (the sound pass, in real time: both notes in the loop's data well ahead of their first pass, so no frame can make them late)
    const L = BOOTH.state.layers; if (!L.length) L.push([]);
    for (const [b, i] of MISSING) L[0].push({ b, d: 1, i, v: .8 });
    L[0].sort((x, y) => x.b - y.b);
  }

  /* ---------- the camera, from the film's time ---------- */
  const CAMP = { x: 0, y: TARGET_Y, z: 0, yaw: 0, zoom: 6, pitch: 36*DEG };
  // a camera pose at this yaw and pitch that frames these points (the game's orthographic view: its right and up vectors, as input.js has
  // them), with a margin, the points a little above the middle (lift: the zone bar is at the bottom)
  function fit(pts, yw, pt, margin, lift){
    const sy = Math.sin(yw), cy = Math.cos(yw), sp = Math.sin(pt), cp = Math.cos(pt);
    const r = new THREE.Vector3(cy, 0, -sy), v = new THREE.Vector3(-sy*cp, -sp, -cy*cp), u = new THREE.Vector3().crossVectors(r, v);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const q of pts){ const a = q.x*r.x + q.y*r.y + q.z*r.z, b = q.x*u.x + q.y*u.y + q.z*u.z; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const asp = innerWidth/Math.max(1, innerHeight), zoom = Math.max((b1 - b0)/2, (a1 - a0)/2/asp)*margin;
    const ac = (a0 + a1)/2, bc = (b0 + b1)/2 - lift*zoom;
    // (the point on that line of sight at street height, so the camera's target sits on the ground)
    const P = new THREE.Vector3().addScaledVector(r, ac).addScaledVector(u, bc), k = (CURB + .5 - P.y)/v.y; P.addScaledVector(v, k);
    return { x: P.x, y: P.y, z: P.z, yaw: yw, pitch: pt, zoom };
  }
  const PUSH = 3.95;
  function camAt(t){
    const P = PLAN, y0 = P.cam.yaw, p0 = P.cam.pitch;
    const A = P.A || (P.A = fit(P.wide, y0 - .08, p0 + 2*DEG, 1.12, .1));
    const B = P.B || (P.B = fit(P.near, y0 + .06, p0, 1.3, .12));
    const W = { x: -2*LOT, y: TARGET_Y, z: 0, yaw: y0 + .8, zoom: 32, pitch: 38*DEG };
    const mix = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), yaw: a.yaw + wrapA(b.yaw - a.yaw)*u, zoom: elerp(a.zoom, b.zoom, u), pitch: lerp(a.pitch, b.pitch, u) });
    let c;
    // (wide on all five buildings until the last is up, drifting in a little; then in on the door as she reaches it)
    if (t < MK.out) c = mix(A, B, t < PUSH ? .1*ss(t/PUSH) : .1 + .9*ease(seg(t, PUSH, MK.inside)));
    else { c = mix(B, W, ease(seg(t, MK.out, MK.title + .4))); c.yaw += .1*seg(t, MK.title, D.len); }   // (the long pull out over the whole city)
    Object.assign(CAMP, c);
  }
  { const _uc = updateCamera;
    updateCamera = function (dt){
      if (PLAN.cam && (D.playing || D.done)) safe('camera', () => {
        camAt(D.t);
        camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal);
        yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
      });
      const r = _uc(dt);
      if (D.playing) safe('person cam', () => monFrame(D.t));
      return r;
    }; }

  /* ---------- the timeline ---------- */
  const EV = []; let fired = 0;
  const at = (t, f, name) => EV.push({ t, f, name });
  function timeline(){
    at(0, () => { html.classList.add('dm-zones'); safe('broadcast', () => BOOTH.broadcast(LOOP_ID, 'rewire')); }, 'zones up, the Booth loop on the Grid (whole)');
    PLAN.blocks.forEach((b, k) => b.clicks.forEach((ct, n) => {
      if (!AUTO) at(ct - .15, () => aim(toScreen(clickPoint(k, n))), 'aim ' + k + '.' + n);
      at(ct, () => doClick(k, n), 'build ' + k + '.' + n + ' ' + b.zone);
    }));
    const last = Math.max(...CLICK_T.flat());
    at(last + .25, () => { safe('hover', () => showHover(null)); if (S.zone) selectZone(null); CUR.want = 0; html.classList.remove('dm-zones'); }, 'build done');
    if (!AUTO && !NOLAB){
      at(MK.furn, () => { CUR.want = 0; }, 'apartment');
      const R = MK.room;
      at(R + .3, () => { CUR.want = 1; labGroup(); }, 'Plants');
      at(R + .9, labTile, 'bonsai tile');
      at(R + 1.35, labAim, 'over the table');
      at(R + 1.65, labPlace, 'set down');
      at(R + 2.0, () => { const b = labEl('#bFlyX'); if (b) aim(labCenter(b)); }, 'to the catalog\'s close');
      at(R + 2.25, () => { const b = labEl('#bFlyX'); if (b){ click('#ffffff'); b.click(); } }, 'the catalog closed');
      at(R + 2.7, labSwatch, 'its color menu');
      at(R + 3.1, labColor, 'a new color');
      at(R + 3.45, labLetGo, 'let go of, so it shows clean');
      at(MK.exit - .3, () => { const b = labEl('#ntExit'); if (b) aim(labCenter(b)); }, 'to Exit');
      at(MK.exit, labExit, 'Exit');
      at(MK.exit + .3, () => { CUR.want = 0; }, 'cursor away');
    }
    at(D.len, () => { D.playing = false; D.done = true; say('done at', D.t.toFixed(2));
      if (!CAP && !AUTO){ D.el.msg.hidden = false; D.el.status.innerHTML = 'click to play again'; D.el.ov.classList.add('ask'); D.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
    EV.sort((a, b) => a.t - b.t);
  }

  /* ---------- the clock: the film's own frame count (the stage's) ---------- */
  // main.js asks frameNow() each frame for the time to draw it at (null: skip it). Held (the lab still working), the frame number stays where it is:
  // nothing is drawn and the recorder takes no picture, so the film goes on exactly where it stopped. The sound pass runs on real time instead.
  let rolling = false, rendered = false, base = 0, t0real = 0;
  D.frameNow = now => {
    if (!rolling) return now;
    if (AUTO || D.held) return null;   // (the sound pass draws nothing)
    rendered = true; D.drawn++; return base + D.frame*1000/FPS;
  };
  // the audio clock follows the film's (the recorder's clock shim reads this): the Booth loop and the Panel's strip move with the picture
  window.__dmAudioT = () => rolling && !AUTO ? base/1000 + D.t : performance.now()/1000;
  function tick(){
    requestAnimationFrame(tick);
    if (!rolling || D.done) return;
    if (AUTO){ D.t = (performance.now() - t0real)/1000; safe('music', () => music.update(1/60)); }
    else if (rendered){ D.frame++; rendered = false; D.t = D.frame/FPS; }
    prep();
  }
  function prep(){
    const t = D.t;
    D.held = false;
    safe('apartment', () => aptTick(t));
    if (D.held) return;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); D.log.push(t.toFixed(2) + ' ' + e.name); }
    if (CAP) Math.random = rng(h32('frame', D.frame));
    S.hour = HOUR;
    safe('door', () => doorAt(t));
    if (!AP.exited) safe('lab zoom', () => labZoom(t));
    if (!AUTO) paint(t, 1/FPS);
  }

  /* ---------- the overlay, drawn from the film's time ---------- */
  function cursor(t, dt){
    const E = D.el;
    CUR.on = follow(CUR.on, CUR.want, 10, dt);
    E.cur.style.opacity = CUR.on.toFixed(3);
    if (CUR.tx !== null){ if (CUR.x === 0 && CUR.y === 0){ CUR.x = CUR.tx + 60; CUR.y = CUR.ty + 70; } CUR.x = follow(CUR.x, CUR.tx, 13, dt); CUR.y = follow(CUR.y, CUR.ty, 13, dt); }
    const press = 1 - .14*Math.max(0, 1 - Math.abs(t - CUR.pulse)/.06);
    E.cur.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${press.toFixed(3)})`;
    const u = (t - CUR.pulse)/.32;
    if (u >= 0 && u < 1 && CUR.on > .05){ E.ring.style.opacity = (.85*(1 - u)*CUR.on).toFixed(3); E.ring.style.borderColor = CUR.col;
      E.ring.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${(.35 + .9*expo(u)).toFixed(3)})`; }
    else E.ring.style.opacity = '0';
  }
  let capK = -1;
  function caption(t){
    const E = D.el, k = CAPS.findIndex(([a, b]) => t >= a && t < b + .3);
    if (k < 0){ E.cap.style.opacity = '0'; capK = -1; return; }
    const [a, b, text, where] = CAPS[k];
    if (k !== capK){ E.capT.textContent = text; E.cap.className = where || 'tl'; capK = k; }
    const i = expo(seg(t, a, a + .5)), o = ss(seg(t, b - .05, b + .25));
    E.cap.style.opacity = (1 - o).toFixed(3);
    E.capT.style.clipPath = `inset(-20% ${((1 - i)*100).toFixed(2)}% -20% 0)`;
    E.capT.style.transform = `translateY(${((1 - i)*12).toFixed(2)}px)`;
    E.capT.style.filter = i < .999 ? `blur(${((1 - i)*6).toFixed(2)}px)` : '';
    E.capL.style.transform = `scaleX(${expo(seg(t, a + .1, a + .55)).toFixed(3)})`;
  }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t, dt){
    const E = D.el, T = MK.title;
    E.black.style.opacity = t < .3 ? (1 - ss(t/.3)).toFixed(3) : '0';
    E.shade.style.opacity = (.8*ss(seg(t, T - .3, T + .4))).toFixed(3);
    cursor(t, dt); caption(t);
    const TAGS = [[MK.room - .1, 'tr'], [MK.exit + .3, '']];
    let tw = ''; for (const [a, w] of TAGS) if (t >= a) tw = w;
    if (NOLAB && tw === 'tr') tw = '';
    if (E.tag.className !== tw) E.tag.className = tw;
    const dip = Math.min(1, ...TAGS.map(([a]) => ss(Math.abs(t - a)/.18)));
    E.tag.style.opacity = (ss(seg(t, .3, .8))*dip).toFixed(3);
    if (E.tNeon){ E.tNeon.style.opacity = String(neonAt(t - T)); E.tTerr.style.opacity = String(neonAt(t - T - .3)); }
    brackets(MONITOR && t >= MONITOR.t0 && t < MONITOR.t1 ? castPose('who') : null);
  }

  /* ---------- getting ready, and playing ---------- */
  // (a condition's time limit in real seconds; a wait in the page's own time)
  const until = (cond, secs) => new Promise((res, rej) => { const s0 = Date.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (Date.now() - s0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  const wait = secs => { const s0 = performance.now(); return until(() => performance.now() - s0 >= secs*1000, 3600); };
  async function setup(){
    await Promise.race([Promise.all(['12px Silkscreen', '400 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '500 12px "Chakra Petch"', '600 12px "Chakra Petch"'].map(f => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 20000))]).catch(() => null);
    overlay(); monSetup();
    await title().catch(e => warn('title', e));
    status('working out the city');
    await until(() => typeof pplReady !== 'undefined' && pplReady && STORY.on, 300).catch(e => warn('people', e));
    plan(); castUp(); monitorScript(); timeline();
    // she was followed home on the person cam, so the game knows her: Furnish's Residents card names her as the cam did (lidar.js, the trace's match)
    safe('dossier', () => { if (typeof DOSSIER !== 'undefined' && PLAN.who) DOSSIER.markFull(PLAN.who.id, PLAN.who.pod); });
    if (!AUTO && !NOLAB){
      // once into the apartment beforehand, with the buildings up: the lab furnishes the home for its household (kept, so the film's visit
      // finds the same home), and the Plants catalog's pictures are drawn
      // (no warm-up first: that is for live play, where the first visit must be quick; here the film holds for the lab anyway)
      status('furnishing the apartment once');
      if (FURN.openKey(PLAN.who.pod)){
        let lastW = null; const rep = () => { const B = labB(), w = !FURN.frame ? 'the lab page' : !$('furnish').classList.contains('live') ? 'the hologram' : labWait() || (B && B.inst && B.inst.size ? 'ready' : 'the pieces');
          if (w !== lastW){ lastW = w; say('the apartment lab:', w); } };
        await until(() => { rep(); return labReady(); }, window.__DM_TEST ? 7200 : 900).catch(e => warn('dry run', e));
        const B = labB(); D.info.pieces = B && B.inst ? B.inst.size : 0; D.info.tables = B && B.inst ? [...B.inst.values()].filter(i => i.rec && TABLES.has(i.rec.arch)).length : 0;
        safe('plants', () => labWin().PodBuilder.openCat('plants')); await wait(3);
        D.info.plantTiles = labDoc() ? labDoc().querySelectorAll('#bTiles .tile').length : 0;
        safe('fly', () => labWin().PodBuilder.closeFly());
        const b = labEl('#ntExit'); if (b) b.click(); else FURN.close();
        await until(() => !FURN.open && !FURN.hold, 30).catch(e => warn('dry run close', e)); await wait(1);
        if (!FURN.frame){ FURN.preload(); await until(() => FURN.frame && FURN.ready, 900).catch(e => warn('lab page', e)); }
      } else warn('dry run', 'could not open ' + PLAN.who.pod);
    }
    clearBlocks();
    status('night falling');
    S.hour = HOUR; await wait(.3); LIGHTS_ON.value = LIGHTS_GOAL;   // (night already: the lights all on before the film, not coming on one by one)
    await until(() => Math.abs(LIGHTS_ON.value - LIGHTS_GOAL) < .01, 40).catch(e => warn('lights', e));
    camAt(0); camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal); yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
    await wait(1);
    D.ready = true;
    status(CAP || AUTO ? 'ready' : 'click to play');
    if (AUTO) start();
    else if (!CAP){ D.el.ov.classList.add('ask'); D.el.status.innerHTML = 'click to play<br><small>15 s</small>'; D.el.ov.addEventListener('click', start, { once: true }); }
    say('ready', JSON.stringify(D.info));
  }
  function start(){
    if (!D.ready || rolling) return false;
    D.el.ov.classList.remove('ask'); D.el.msg.hidden = true;
    base = performance.now(); t0real = performance.now(); D.frame = 0; D.t = 0; rendered = false; rolling = true; D.playing = true;
    last = base - 1000/FPS;   // (main.js: the first frame is one frame after this)
    if (typeof window.__dmGo === 'function') safe('sound', () => window.__dmGo());
    prep(); say('rolling'); return true;
  }
  D.start = start;
  D.state = () => ({ ready: D.ready, playing: D.playing, done: D.done, held: D.held, t: D.t, frame: D.frame, drawn: D.drawn, len: D.len, stage: D.stage, info: D.info, log: D.log.slice(-60) });
  addEventListener('load', () => { setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); D.failed = String(e && e.message || e); }); });
  return D;
})();
