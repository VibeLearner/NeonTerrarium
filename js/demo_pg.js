// Neon Terrarium: the procedural generation cut (about 60 s), for r/proceduralgeneration. Open the game with ?full#demo&pg;
// tools/demo/record.py --pg films it at 1920 x 1080, 60 fps, with the game's own sound.
//
// It runs on the demo clip's stage (js/demo.js): the game's simulation is off, every click is scripted, every building is made from a seed of
// its own (so every run builds the same city), and the film's clock is its own frame count. No captions: the cursor, the zone bar and the
// Grid's music player are the only interface on screen, with "Neon Terrarium" small in the bottom right.
//
//   0.0   one bare plot in the night sky
//   1.0   each zone in turn, picked on the zone bar and built: Residential, Commercial, Luxury, Industrial, each stacked a few times
//  11.6   one tower of every zone stacked on each other (zones picked with the number keys)
//  19.0   a tall commercial building; three residential homes hung off its side on brackets; then the building is taken down a section at a
//         time (right-click), and the homes go onto scaffolds of their own
//  29.6   the bare plot it stood on turned to lawn, and fifteen more lawn plots laid beside it: the garden grows paths, groves, a pond, a bridge
//  47     the camera pulls out over the whole little city
// The Grid's own music (live, procedural) plays under all of it, and its player is on screen. The sound pass runs first and notes what the
// player showed each moment; the picture pass then shows exactly that, so the picture matches what is heard (record.py --pg).
//
// Nothing is saved and none of the player's own city or settings are read (saveguard.js, NT_DEMO).
'use strict';
const DEMOPG = (() => {
  const D = { on: !!window.NT_DEMO && /[#&]pg\b/.test(location.hash), ready: false, playing: false, done: false, held: false, t: 0, frame: 0, drawn: 0, log: [], info: {}, failed: null, len: 60 };
  if (!D.on) return D;
  // #demo&pg&city: the city cut instead (30 s): one bare plot grows into a whole city. A few buildings by hand with the cursor, then the rest
  // rises ring by ring on its own (Luxury towers in the middle, Commercial round them, homes outside, an Industrial quarter at the back, a few
  // towers of every zone, and two gardens), and the camera pulls out over it. Filmed wide (1920 x 1080) or tall (1080 x 1920) as the page is
  const CITY = /[#&]city\b/.test(location.hash);
  if (CITY) D.len = 30;
  const CAP = !!window.__TR_CAPTURE;   // the picture pass: the recorder steps the clock and films each frame
  const AUTO = !!window.__DM_AUDIO;    // the sound pass: real time, nothing drawn, only what makes a sound
  const FPS = +window.__DM_FPS || 60;
  // every edit made at once (not spread over frames or handed to the worker): the plan has to see each building's real height the moment it is
  // placed. (Not in the sound pass: it builds nothing at all, see act)
  if (!AUTO) window.__STAGE_NOW = window.__SYNC_NOW = true;
  const say = (...a) => { D.log.push(a.join(' ')); if (D.log.length > 600) D.log.shift(); console.log('[demo]', ...a); };
  const warn = (what, e) => { D.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[demo] ' + what, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };
  const $ = id => document.getElementById(id);
  const html = document.documentElement;

  /* ---------- small maths ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, clamp01 = x => clamp(x, 0, 1);
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const expo = x => { x = clamp01(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10*x); };
  const lerp = (a, b, u) => a + (b - a)*u;
  const seg = (t, a, b) => clamp01((t - a)/(b - a));
  const follow = (cur, goal, k, dt) => cur + (goal - cur)*(1 - Math.exp(-k*dt));
  const DEG = Math.PI/180;

  /* ---------- seeded numbers (the stage's) ---------- */
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const h32 = (...a) => { let h = 2166136261; const s = a.join('|'); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function withSeed(seed, fn){ const was = Math.random; Math.random = rng(seed >>> 0); try { return fn(); } finally { Math.random = was; } }

  /* ---------- the script ---------- */
  // [time, kind, what]. Kinds: btn (the cursor picks a zone on the zone bar), key (a zone picked with its number key: the bar lights, the cursor
  // stays), onto / up / sky (build on a plot, stack on its roof, build out into the sky), pod (a home hung off a wall: host plot, the way out,
  // how far up the wall), del (right-click: the top section goes), green (a bare plot's ground cycled), lawn (a lawn plot laid in the sky)
  const LAWNS = [[2, 1], [3, 1], [3, 2], [2, 2], [1, 2], [2, 3], [3, 3], [1, 3], [0, 2], [0, 3], [-1, 2], [-1, 3], [0, 4], [1, 4], [2, 4]];
  const FEAT_ACTS = [
    [1.15, 'btn', 'low'],  [1.95, 'onto', [0, 0]],  [2.55, 'up', [0, 0]],  [3.1, 'up', [0, 0]],
    [3.85, 'btn', 'mid'],  [4.65, 'sky', [1, 0]],   [5.25, 'up', [1, 0]],  [5.8, 'up', [1, 0]],
    [6.55, 'btn', 'high'], [7.35, 'sky', [0, 1]],   [7.95, 'up', [0, 1]],  [8.5, 'up', [0, 1]],
    [9.25, 'btn', 'ind'],  [10.05, 'sky', [1, 1]],  [10.65, 'up', [1, 1]],
    // one tower of every zone
    [11.6, 'key', 'low'],  [12.0, 'sky', [-1, 0]],
    [12.7, 'key', 'mid'],  [13.0, 'up', [-1, 0]],
    [13.7, 'key', 'high'], [14.0, 'up', [-1, 0]],
    [14.7, 'key', 'ind'],  [15.0, 'up', [-1, 0]],
    [15.7, 'key', 'low'],  [16.0, 'up', [-1, 0]],
    [16.7, 'key', 'high'], [17.0, 'up', [-1, 0]],
    [17.7, 'key', 'mid'],  [18.0, 'up', [-1, 0]],
    // a tall building, homes hung off its side, then it comes down and they stand on scaffolds
    [19.0, 'key', 'mid'],  [19.4, 'sky', [2, 0]],   [19.95, 'up', [2, 0]], [20.5, 'up', [2, 0]], [21.05, 'up', [2, 0]],
    [21.9, 'key', 'low'],  [22.7, 'pod', [2, 0, 1, 0, .78]], [23.7, 'pod', [2, 0, 1, 0, .52]], [24.7, 'pod', [2, 0, 1, 0, .28]],
    [25.5, 'key', null],   [26.3, 'del', [2, 0]],   [26.85, 'del', [2, 0]], [27.4, 'del', [2, 0]], [27.95, 'del', [2, 0]],
    // the garden: the bare plot to lawn (bare, then lawn), then lawn plots laid beside it
    [29.6, 'green', [2, 0]], [30.2, 'green', [2, 0]],
    ...LAWNS.map(([i, j], k) => [31.0 + k*.75, 'lawn', [i, j]]),
  ];
  // the city cut's clicks: [time, kind, plot, zone (auto: none for the cursor's own)]. The layout comes from its own seed, the same every run.
  // (Nov 7: a real mix of zones everywhere rather than Luxury in the middle, and one big garden on the outer edge facing the camera)
  function cityActs(){
    const jit = (i, j, k) => (h32('j', i, j, k) % 1000)/1000;
    const pick = (r, w) => { let s = 0; for (const k in w){ s += w[k]; if (r < s) return k; } return Object.keys(w)[0]; };
    // the camera sits off toward these angles (atan2(j, i)) over the film; the Industrial quarter is at the far side, the garden at the near one
    const FRONT = .45, ang = (a, c) => { let x = Math.abs(a - c); return Math.min(x, Math.PI*2 - x); };
    const plots = [];
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++){
      const d = Math.hypot(i*.95, j), n = (jit(i, j, 0) - .5)*1.3;
      if (d + n < 4.5 || (i === 0 && j === 0)) plots.push({ i, j, d, a: Math.atan2(j, i) });
    }
    const at = (i, j) => plots.find(p => p.i === i && p.j === j);
    for (const p of plots){
      const r = jit(p.i, p.j, 1), far = ang(p.a, FRONT + Math.PI) < .8 && p.d > 2.3;
      p.z = far ? pick(r, { ind: .42, low: .33, mid: .25 })
        : p.d < 1.7 ? pick(r, { mid: .38, high: .3, low: .26, ind: .06 })
        : p.d < 3.1 ? pick(r, { low: .38, mid: .36, high: .19, ind: .07 })
        : pick(r, { low: .55, mid: .3, high: .1, ind: .05 });
      const r2 = jit(p.i, p.j, 4);
      p.n = { high: 2 + (r2*4 | 0), mid: 1 + (r2*4 | 0), low: 1 + (r2*3 | 0), ind: 1 + (r2*2 | 0) }[p.z] + (p.d < 2 ? 1 : 0);
    }
    // the garden: lawn plots out past the city's edge on the camera's side, grown out as one patch (about twelve plots), with the edge plots it
    // touches turned to lawn too, so it reads as a park at the city's rim
    const garden = [];
    { const seeds = []; for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++){ const d = Math.hypot(i*.95, j), a = Math.atan2(j, i);
        if (!at(i, j) && d > 3.2 && d < 6.6 && ang(a, FRONT) < .62) seeds.push({ i, j, d, a, k: ang(a, FRONT)*2 + Math.abs(d - 4.6) }); }
      seeds.sort((x, y) => x.k - y.k);
      const take = q => { garden.push(q); };
      if (seeds.length) take(seeds[0]);
      for (let k = 0; k < garden.length && garden.length < 13; k++)
        for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]){ const q = seeds.find(s => s.i === garden[k].i + di && s.j === garden[k].j + dj);
          if (q && !garden.includes(q) && garden.length < 13) take(q); }
      // (and the city's outermost plots it borders, so the park opens straight off the streets)
      for (const g of [...garden]) for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]){ const p = at(g.i + di, g.j + dj);
        if (p && p.d > 3.2 && !p.lawn && garden.length < 16){ p.lawn = true; } }
    }
    // a handful of towers of every zone stacked on each other, spread round the city
    const MIX = ['low', 'mid', 'high', 'ind', 'mid', 'low', 'high'];
    for (const [i, j] of [[-1, 1], [1, -1], [-2, 0], [2, 2], [-1, -2], [0, -3]]){ const p = at(i, j); if (p && !p.lawn){ p.mix = true; p.n = 5 + (jit(i, j, 5)*3 | 0); } }
    // the cursor's own: three plots, each a different zone (Commercial in the middle, homes and Luxury beside it)
    const hand = { '0,0': ['mid', 3], '1,0': ['low', 2], '0,1': ['high', 2] };
    for (const k in hand){ const [i, j] = k.split(',').map(Number), p = at(i, j); if (p){ p.z = hand[k][0]; p.mix = false; p.lawn = false; p.hand = hand[k][1]; p.n = Math.max(p.n, hand[k][1] + 1); } }
    const out = [
      [.9, 'btn', 'mid'],  [1.5, 'onto', [0, 0]], [1.95, 'up', [0, 0]], [2.4, 'up', [0, 0]],
      [2.95, 'btn', 'low'], [3.5, 'sky', [1, 0]], [3.95, 'up', [1, 0]],
      [4.35, 'btn', 'high'], [4.85, 'sky', [0, 1]], [5.25, 'up', [0, 1]],
    ];
    // the city rises on its own, ring by ring from the middle, each plot's floors stacking a beat after it appears (faster as it goes)
    const rest = plots.filter(p => !p.hand && !p.lawn).sort((a, b) => (a.d + jit(a.i, a.j, 3)*.9) - (b.d + jit(b.i, b.j, 3)*.9));
    const T0 = 5.8, T1 = 17.6;
    rest.forEach((p, r) => {
      const tb = T0 + (T1 - T0)*Math.pow(r/Math.max(1, rest.length - 1), .85);
      const zs = k => p.mix ? MIX[(k + (jit(p.i, p.j, 6)*7 | 0)) % MIX.length] : p.z;
      out.push([tb, 'sky', [p.i, p.j], zs(0)]);
      for (let k = 1; k < p.n; k++) out.push([Math.min(21.5, tb + k*(.26 + jit(p.i, p.j, 10 + k)*.18)), 'up', [p.i, p.j], zs(k)]);
    });
    for (const p of plots) if (p.hand) for (let k = p.hand; k < p.n; k++) out.push([6.4 + k*.45 + jit(p.i, p.j, 20 + k)*.3, 'up', [p.i, p.j], p.z]);
    // then the garden, laid plot by plot from the city's edge outward (17.4 to 22.6 s), so it grows on camera at the rim
    const lawns = [...plots.filter(p => p.lawn), ...garden].sort((a, b) => a.d - b.d + (jit(a.i, a.j, 7) - jit(b.i, b.j, 7))*.3);
    lawns.forEach((p, k) => out.push([17.4 + 5.2*k/Math.max(1, lawns.length - 1), 'lawn', [p.i, p.j], null]));
    out.sort((a, b) => a[0] - b[0]);
    const zc = {}; for (const p of plots) if (!p.lawn) zc[p.mix ? 'mixed' : p.z] = (zc[p.mix ? 'mixed' : p.z] || 0) + 1;
    CITY_INFO.plots = plots.length; CITY_INFO.zones = zc; CITY_INFO.lawns = lawns.map(p => [p.i, p.j]);
    return out;
  }
  const CITY_INFO = {};
  const ACTS = (CITY ? cityActs() : FEAT_ACTS).map(([t, kind, v, z], n) => ({ n, t, kind, v, z, auto: z !== undefined }));
  const GARDEN0 = CITY ? ACTS.findIndex(a => a.kind === 'lawn') : ACTS.findIndex(a => a.kind === 'green');
  const LAST_ACT = ACTS[ACTS.length - 1].t;
  const T_OUT = CITY ? 5.4 : 47.2;   // (the zone bar goes: the city cut, once it builds on its own; the feature cut, as it pulls out)
  const CUR_OFF = CITY ? 5.4 : LAST_ACT + .5;   // (the cursor goes)
  const HOUR = 20.6;
  const GRID_AT = [70, 70];   // (the Grid stands well out of sight, so its music plays from the first frame)

  /* ---------- the game, switched off: nothing acts unless the script says so (the stage's) ---------- */
  maybeSpawnMegas = () => {};
  updateCars = () => {}; updateDrones = () => {}; updateTrips = () => {}; updateHighways = () => {};
  mtAmbient = () => {}; mtRiders = () => {};
  updateConveyors = () => {};
  { const _rc = rebuildCell; rebuildCell = function (c){ return withSeed(h32('cell', c.i, c.j, ...c.sections.map(s => s.seed + ':' + (s.mf || 0))), () => _rc.call(this, c)); }; }
  { const _rm = rebuildMega; rebuildMega = function (m){ return withSeed(h32('mega', m.kind, m.i, m.j, m.seed), () => _rm.apply(this, arguments)); }; }
  { const _bc = rebuildConnections; rebuildConnections = function (){ return withSeed(h32('links'), () => _bc.apply(this, arguments)); }; }
  { const _sa = syncAgents; syncAgents = function (){ return withSeed(h32('agents'), () => _sa.apply(this, arguments)); }; }
  // the music only: every sound effect (builds, removals, the garden) is silent in this cut, in every pass (owner Nov 6)
  safe('sfx', () => { sfx.play = () => {}; });
  updatePeople = function (){ pplMesh.geometry.instanceCount = 0; ddMesh.geometry.instanceCount = 0; };   // (nobody about: the city is being made)
  // a garden plot's seed (every roll it makes comes from it: garden.js) from the film's own salt, picked in the plan so the pond and its bridge
  // open on camera; the same seed for the same plot every run
  let GD_SALT = 1;
  { const _gu = gardenUpdate; gardenUpdate = function (){
      for (const c of cells.values()) if (!c.gd && gdGround(c)) c.gd = { s: (h32('gd', GD_SALT, c.i, c.j) % 2147483647) | 0, p: null };
      return _gu.apply(this, arguments); }; }
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

  /* ---------- the city: one bare plot, and the Grid far out of sight ---------- */
  // everything built so far taken down and thrown away (the game's own clearIsland, without the starter platform it lays): after the plan's run
  function wipe(){
    STAGE_Q.length = 0; STAGE_READY.length = 0; LATER.length = 0; SYNC_Q = null; syncPeopleAbort(); STEAM_JOB = null; if (typeof NV !== 'undefined'){ NV.queue.length = 0; if (NV.job){ nvFree(NV.job); NV.job = null; } }
    while (anims.length) endAnim(anims.length - 1);
    for (const c of cells.values()){ disposeData(c.data); c.data = null; cellView(c); }
    for (const m of megas.values()){ disposeData(m.data); m.data = null; cellView(m); if (m.fx){ m.fx.dispose(); m.fx = null; } }
    megas.clear();
    for (const k of [...regions.keys()]){ disposeGroup(regions.get(k)); regions.delete(k); superDirty.add('r' + superKey(k)); }
    SOLID_JOB = null;
    for (const k of [...solidRegions.keys()]){ const r = solidRegions.get(k); world.remove(r.group); disposeGroup(r.group); solidRegions.delete(k); ovForget(k); } DISPOSE_Q.length = 0; solidDirty.clear(); animCells.clear();
    cells.clear(); hwClearAll(); mtClearAll();
  }
  let built = false;
  function city(){
    settle();
    if (built) wipe();
    else { cells.clear(); for (const m of [...megas.values()]) megas.delete(m.id); metros.length = 0; highways.length = 0; }
    built = true;
    GREEN_DEFAULT = 'some'; safe('zone', () => { if (S.zone) selectZone(S.zone); }); S.zone = null;
    const p0 = newCell(0, 0); p0.style = DEFAULT_STYLE; p0.green = 'some'; cells.set(ckey(0, 0), p0);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++){ const c = newCell(GRID_AT[0] + a, GRID_AT[1] + b); c.style = DEFAULT_STYLE; c.green = 'some'; cells.set(ckey(c.i, c.j), c); }
    if (!placeMega('radio', GRID_AT[0], GRID_AT[1], 20261106, 2, 2, 1)) warn('the Grid', 'did not fit');
    S.hour = HOUR;
    rebuildAll(); finishSync();
    say('city: one bare plot, the Grid at', GRID_AT.join(','));
  }
  D.city = () => safe('city', city);

  /* ---------- the clicks ---------- */
  const cellAt = (i, j) => cells.get(ckey(i, j));
  const zoneTo = z => { if (z === null){ if (S.zone) selectZone(S.zone); } else if (S.zone !== z) selectZone(z); };
  function settleAll(){ finishSync(); while (anims.length) endAnim(0); finishSync(); }
  // the floor a home hangs at: the one asked for (a share of the wall's height), else the nearest one with room (a floor's gap from the others)
  function podY(H, n, f){
    const want = CURB + (H.height - CURB)*f, y0 = liftSnap(H, want, CURB); if (y0 === null) return null;
    const fits = y => y !== null && y > CURB + FH*.9 && y < H.height - .4 && (!n || !n.lift || !n.podBlocks
      || (y >= (n.belowTop ?? CURB) + FH - .05 && n.podBlocks.every(([s0, s1]) => y >= s1 + FH - .05 || y + 2*FH <= s0 + .05)));
    for (const k of [0, 1, -1, 2, -2, 3, -3]){ const y = liftSnap(H, y0 + k*FH + FH*.4, CURB); if (fits(y)) return y; }
    return null;
  }
  // what a click does, and where the cursor points for it (a point in the city), worked out from how the city stands now
  function targetOf2(a){
    const v = a.v;
    switch (a.kind){
      case 'onto': case 'green': { const c = cellAt(v[0], v[1]); if (!c) return null; return { tg: { type: 'onto', c }, at: { x: c.x, y: CURB + .3, z: c.z } }; }
      case 'up': { const c = cellAt(v[0], v[1]); if (!c) return null; return { tg: { type: 'up', c }, at: { x: c.x, y: c.height + .05, z: c.z } }; }
      case 'sky': case 'lawn': return { tg: { type: 'empty', i: v[0], j: v[1] }, at: { x: v[0]*LOT, y: CURB, z: v[1]*LOT } };
      case 'del': { const c = cellAt(v[0], v[1]); if (!c) return null; return { tg: null, at: { x: c.x, y: c.height - .2, z: c.z }, c }; }
      case 'pod': {
        const H = cellAt(v[0], v[1]); if (!H) return null;
        const i = v[0] + v[2], j = v[1] + v[3], n = cellAt(i, j) || null;
        const y = a.planY !== undefined ? a.planY : podY(H, n, v[4]); if (y === null) return null;
        return { tg: { type: 'side', c: n, i, j, y, from: H }, at: { x: H.x + v[2]*SIDE/2, y: y + FH*.55, z: H.z + v[3]*SIDE/2 }, y };
      }
    }
    return null;
  }
  // one click, as a player makes it (each with its own seed: the same building every time)
  function act(a){
    if (a.kind === 'btn' || a.kind === 'key'){ zoneTo(a.v); return true; }
    // the sound pass plays real time, and the Grid's music is scheduled only a tenth of a second ahead: a click that rebuilt the city there (a
    // garden plot can take a good while) froze the page long enough for the music to fall behind, glitch and stop. So nothing is built there:
    // each click only makes its sound, at its moment (the same sounds the builds make: world.js startAnim, cycleGreen)
    if (AUTO) return true;   // (and no click sounds either, owner Nov 6: only the Grid's music is heard)
    // (the city cut's own clicks: their zone set straight on, the zone bar is gone by then; a lawn plot laid with no zone, its ground grass)
    if (a.auto){ S.zone = a.z; GREEN_DEFAULT = a.kind === 'lawn' ? 'grass' : 'some'; }
    const T = targetOf2(a); if (!T) return false;
    if (a.kind === 'del'){ const n0 = T.c.sections.length; removeAt({ c: T.c, kind: 'bld', p: new THREE.Vector3(T.at.x, T.at.y, T.at.z) }); return T.c.sections.length < n0; }
    const before = JSON.stringify(stateOf(a));
    try { withSeed(h32('act', a.n), () => applyTarget(T.tg)); }
    finally { if (a.auto) GREEN_DEFAULT = 'some'; }
    return JSON.stringify(stateOf(a)) !== before;
  }
  // (what a click should have changed: to check it did)
  function stateOf(a){
    const v = a.v, c = a.kind === 'pod' ? cellAt(v[0] + v[2], v[1] + v[3]) : cellAt(v[0], v[1]);
    return c ? [c.sections.length, c.green, !!c.lift] : null;
  }

  /* ---------- the plan: the whole film built once before it rolls ---------- */
  const PLAN = { snap: [] };
  const tops = () => { const m = {}; for (const c of cells.values()) if (Math.abs(c.i) < 20) m[ckey(c.i, c.j)] = { i: c.i, j: c.j, top: Math.max(c.height || CURB, c.topY || 0) }; return m; };
  function gardenSim(salt){   // the garden's rules alone (no drawing): what this salt grows, plot by plot
    GD_SALT = salt; const H = CITY ? null : cellAt(2, 0), g0 = H && H.green, added = []; let first = -1;
    const steps = CITY ? CITY_INFO.lawns : LAWNS;
    const pieces = () => [...cells.values()].filter(c => c.gd && c.gd.p);
    try {
      for (const c of cells.values()) c.gd = null;
      if (H){ H.green = 'grass'; gardenUpdate(); }
      steps.forEach(([i, j], k) => { if (cellAt(i, j)) return; const c = newCell(i, j); c.green = 'grass'; c.style = DEFAULT_STYLE; cells.set(ckey(i, j), c); added.push(c); gardenUpdate();
        if (first < 0 && pieces().some(q => q.gd.w)) first = k; });
      const P = pieces(), w = P.filter(q => q.gd.w).length, b = P.filter(q => q.gd.w && q.gd.b).length, kinds = new Set(P.map(q => q.gd.p));
      const ok = w >= 2 && w <= 5;
      const score = (ok ? 100 : 0) + (b ? 60 : 0) + (kinds.has('gazebo') ? 40 : 0) + (first >= 5 && first <= steps.length - 4 ? 25 : 0) + kinds.size*3 + (kinds.has('koideck') || kinds.has('greenhouse') ? 8 : 0);
      return { salt, score, water: w, bridge: b, first, kinds: [...kinds].join(' ') };
    } finally { for (const c of added) cells.delete(ckey(c.i, c.j)); if (H) H.green = g0; for (const c of cells.values()) c.gd = null; }
  }
  function plan(){
    PLAN.snap = [];
    const sync0 = window.__SYNC_NOW; if (CITY) window.__SYNC_NOW = false;   // (the city's walkways and people needn't follow every one of its many clicks here)
    try { planActs(); } finally { window.__SYNC_NOW = sync0; }
  }
  function planActs(){
    ACTS.forEach((a, k) => {
      if (k === GARDEN0){   // the garden's salt: the one that grows the best garden on camera (a pond of 2 to 5 plots opening partway, a bridge, a gazebo)
        let best = null; for (let s = 1; s <= (CITY ? 200 : 500); s++){ const r = safe('garden sim', () => gardenSim(s)); if (r && (!best || r.score > best.score)) best = r; }
        GD_SALT = best ? best.salt : 1; D.info.garden = best; say('garden:', JSON.stringify(best));
      }
      if (a.kind === 'pod'){ const T = targetOf2(a); a.planY = T ? T.y : undefined; }
      const ok = act(a); settleAll();
      if (!ok && CITY && a.kind === 'up'){ D.info.capped = (D.info.capped || 0) + 1; }   // (a stack at its height limit: the game just stops it)
      else if (!ok && a.kind !== 'btn' && a.kind !== 'key') warn('plan', 'click ' + a.n + ' (' + a.kind + ' ' + JSON.stringify(a.v) + ' at ' + a.t + ' s) changed nothing');
      PLAN.snap[k] = tops();
    });
    // what came of it
    const ck = (i, j) => cellAt(i, j);
    const pod = ck(3, 0), M = ck(-1, 0);
    D.info.plan = { mixedTower: M ? M.sections.map(s => s.zone).join(' ') + ' (' + M.height.toFixed(1) + ' high)' : null,
      pods: pod ? pod.sections.length + (pod.lift && pod.lift.sc ? ', on scaffolds' : ', NOT on scaffolds') : 'none',
      garden: [...cells.values()].filter(c => c.gd && c.gd.p).map(c => c.gd.p + (c.gd.b ? '+bridge' : '')).join(' ') };
    PLAN.water = [...cells.values()].filter(c => c.gd && c.gd.w).map(c => [c.i, c.j]);
    if (CITY){ D.info.plan = { plots: CITY_INFO.plots, zones: CITY_INFO.zones, lawnPlots: CITY_INFO.lawns.length, clicks: ACTS.length, tallest: Math.max(...[...cells.values()].filter(c => Math.abs(c.i) < 20).map(c => c.height || 0)).toFixed(1),
      garden: D.info.plan.garden }; }
    else if (pod && !(pod.lift && pod.lift.sc)) warn('plan', 'the homes did not go onto scaffolds');
    say('plan:', JSON.stringify(D.info.plan));
  }
  const snapAt = t => { let k = -1; ACTS.forEach((a, n) => { if (a.t <= t) k = n; }); return k < 0 ? null : PLAN.snap[k]; };

  /* ---------- the page: the game's interface hidden, but for the zone bar and the Grid's player ---------- */
  function overlay(){
    html.classList.add('dm-on');
    const st = document.createElement('style'); st.id = 'dmStyle';
    st.textContent = `
      html.dm-on body > *:not(#view):not(#dmOv):not(canvas):not(.zonebar):not(#gridDeck){visibility:hidden!important}
      html.dm-on .zonebar{visibility:hidden!important}
      html.dm-on.dm-zones .zonebar .zones{visibility:visible!important}
      html.dm-on .zonebar .zones .rot,html.dm-on .zonebar .zones .furnbtn,html.dm-on .zonebar .perim,html.dm-on .zonebar .zones .perim{visibility:hidden!important}
      html.dm-on .zonebar .zones{transition:none!important}
      html.dm-on #gridDeck{top:3.2vmin!important;left:2.2vmin!important;transform-origin:top left;scale:var(--dk,1.2);transition:none!important}
      html.dm-on #gridDeck .pu-fold{visibility:hidden!important}
      html.dm-on, html.dm-on *{cursor:none!important}
      html.dm-on #dmOv.ask, html.dm-on #dmOv.ask *{cursor:pointer!important}
      html.dm-on body > #dmOv#dmOv#dmOv#dmOv#dmOv#dmOv{visibility:visible!important}
      #dmOv{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Chakra Petch','JetBrains Mono',sans-serif;-webkit-font-smoothing:antialiased}
      #dmOv.ask{pointer-events:auto}
      #dmOv > .fill{position:absolute;inset:0;opacity:0}
      #dmBlack{background:#04050b}
      #dmCur{position:absolute;left:0;top:0;width:30px;height:30px;margin:-3px 0 0 -4px;opacity:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
      #dmRing{position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:2px solid #fff;opacity:0}
      #dmTag{position:absolute;right:0;bottom:0;padding:0 2.6vmin 3.4vmin 0;display:flex;align-items:center;gap:9px;opacity:0}
      #dmTag span{font-weight:600;font-size:1.45vmin;letter-spacing:.3em;text-transform:uppercase;color:rgba(234,250,255,.82);text-shadow:0 1px 6px rgba(0,0,0,.8)}
      #dmTag u{display:block;width:6px;height:6px;background:#38e8e0;box-shadow:0 1px 8px rgba(56,232,224,.8);text-decoration:none}
      #dmMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #dmMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'dmOv';
    ov.innerHTML = '<div id="dmTag"><u></u><span>Neon Terrarium</span></div>'
      + '<svg id="dmCur" viewBox="0 0 30 30" aria-hidden="true"><path d="M4 3 L4 24 L9.6 18.8 L13.4 27.2 L17.2 25.5 L13.5 17.3 L21 17.3 Z" fill="#f4fbff" stroke="#0a0c16" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      + '<i id="dmRing"></i><i class="fill" id="dmBlack"></i>'
      + '<div id="dmMsg"><b>Procedural cut</b><span id="dmStatus">building the city</span></div>';
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    D.el = { ov, black: q('#dmBlack'), cur: q('#dmCur'), ring: q('#dmRing'), tag: q('#dmTag'), msg: q('#dmMsg'), status: q('#dmStatus') };
    D.el.black.style.opacity = '1';
    const dk = () => html.style.setProperty('--dk', (1.2*Math.min(innerWidth, innerHeight)/1080).toFixed(3)); dk(); addEventListener('resize', dk);
    if (CAP || AUTO) D.el.msg.hidden = true;
  }
  const status = s => { D.stage = s; if (D.el) D.el.status.textContent = s; };

  /* ---------- the Grid's player: what it showed in the sound pass, shown again in the picture pass ---------- */
  // (grid.js calls window.__dmDeck each time it draws the player: (bands, 0) with the spectrum just read, then (null, 1) once its text is set)
  const DECK = Array.isArray(window.__DM_DECK) && window.__DM_DECK.length ? window.__DM_DECK : null, REC = [];
  const txt = id => { const e = $(id); return e ? e.textContent : ''; };
  const setTxt = (id, s) => { const e = $(id); if (e && e.textContent !== s) e.textContent = s; };
  function deckAt(t){ let lo = 0, hi = DECK.length - 1; if (t <= DECK[0].t) return DECK[0]; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (DECK[m].t <= t) lo = m; else hi = m - 1; } return DECK[lo]; }
  if (AUTO) window.__dmDeck = (b, k) => {
    if (!rolling) return;
    if (k === 0) REC.push({ t: +D.t.toFixed(3), b: Array.from(b, v => Math.round(v*1000)/1000) });
    else { const e = REC[REC.length - 1]; if (e && !e.x) e.x = [txt('gdProg'), txt('gdChord'), txt('gdClock')]; } };
  else if (DECK) window.__dmDeck = (b, k) => {
    const e = deckAt(D.t); if (!e) return;
    if (k === 0){ for (let i = 0; i < b.length; i++) b[i] = e.b[i] || 0; }
    else if (e.x){ setTxt('gdProg', e.x[0]); setTxt('gdChord', e.x[1]); setTxt('gdClock', e.x[2]); } };
  D.deckTrack = () => REC;

  /* ---------- the cursor: drawn, so it shows in the film; it follows a point in the city as the camera moves ---------- */
  const CUR = { x: 0, y: 0, tx: null, ty: null, wp: null, pulse: -9, col: '#ffffff', on: 0, want: 0 };
  const _v = new THREE.Vector3();
  const toScreen = p => { _v.set(p.x, p.y, p.z).project(cam); return { x: (_v.x + 1)/2*innerWidth, y: (1 - _v.y)/2*innerHeight }; };
  function aimAt(p){ CUR.wp = p; CUR.want = 1; const s = toScreen(p); CUR.tx = s.x; CUR.ty = s.y; }
  function aimEl(el){ if (!el) return; const r = el.getBoundingClientRect(); CUR.wp = null; CUR.tx = r.left + r.width/2; CUR.ty = r.top + r.height/2; CUR.want = 1; }
  function click(col){ CUR.pulse = D.t; if (col) CUR.col = col; }
  const zoneBtn = z => document.querySelector('.zone[data-zone="' + z + '"]');
  const zoneCol = () => S.zone && ZONES[S.zone] ? ZONES[S.zone].col : '#e3d6bd';
  function aimFor(a){
    if (a.kind === 'btn'){ aimEl(zoneBtn(a.v)); safe('hover', () => showHover(null)); return; }
    if (a.kind === 'key') return;
    const T = safe('target', () => targetOf2(a)); if (!T) return;
    aimAt(T.at);
    safe('hover', () => showHover(T.tg));   // (the game's own outline of where the click builds; none for a removal)
  }
  function doAct(a){
    if (a.auto){ safe('click ' + a.n, () => act(a)); return; }   // (the city cut's own: no cursor, no outline)
    const ok = safe('click ' + a.n, () => act(a));
    if (a.kind === 'key') return;
    if (a.kind === 'del') click('#ff4f6a');
    else if (a.kind === 'pod') click('#ff5ad8');
    else click(a.kind === 'btn' ? (ZONES[a.v] ? ZONES[a.v].col : '#fff') : zoneCol());
    if (a.kind !== 'btn') safe('hover', () => showHover(null));
    if (!ok && a.kind !== 'btn') warn('film', 'click ' + a.n + ' (' + a.kind + ') changed nothing');
  }

  /* ---------- the camera, from the film's time ---------- */
  const CAMP = { x: 0, y: TARGET_Y, z: 0, yaw: 0, zoom: 6, pitch: 36*DEG };
  // a camera pose at this yaw and pitch that frames these points (the game's orthographic view, as input.js has it), with a margin, the points a
  // little above the middle (lift: the zone bar is at the bottom)
  function fit(pts, yw, pt, margin, lift, minZoom){
    const sy = Math.sin(yw), cy = Math.cos(yw), sp = Math.sin(pt), cp = Math.cos(pt);
    const r = new THREE.Vector3(cy, 0, -sy), v = new THREE.Vector3(-sy*cp, -sp, -cy*cp), u = new THREE.Vector3().crossVectors(r, v);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const q of pts){ const a = q.x*r.x + q.y*r.y + q.z*r.z, b = q.x*u.x + q.y*u.y + q.z*u.z; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const asp = innerWidth/Math.max(1, innerHeight), zoom = Math.max(minZoom || 0, Math.max((b1 - b0)/2, (a1 - a0)/2/asp)*margin);
    const ac = (a0 + a1)/2, bc = (b0 + b1)/2 - lift*zoom;
    const P = new THREE.Vector3().addScaledVector(r, ac).addScaledVector(u, bc), k = (CURB + .5 - P.y)/v.y; P.addScaledVector(v, k);
    return { x: P.x, y: P.y, z: P.z, zoom: Math.log(zoom), pitch: pt };
  }
  // the yaw turns slowly the whole time (a third of a turn over the film, a little faster as it pulls out at the end), so every shot shows depth
  const Y0 = .5;
  const yawAt = t => CITY ? Y0 + .95*t/30 + .25*ss(seg(t, 22, 30)) : Y0 + .62*t/60 + .32*ss(seg(t, T_OUT, 60));
  // the plots a shot frames, each to its height at that moment of the film
  function boxes(keys, t){
    const S2 = snapAt(t) || {}, out = [];
    for (const [i, j] of keys){ const s = S2[ckey(i, j)], top = s ? s.top : CURB + .5, h = SIDE/2 + .3;
      for (const [a, b] of [[-h, -h], [h, -h], [-h, h], [h, h]]) for (const y of [CURB - 1.2, top]) out.push({ x: i*LOT + a, y, z: j*LOT + b }); }
    return out;
  }
  const BLOCK = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const allPlots = t => Object.values(snapAt(t) || {}).map(s => [s.i, s.j]);
  // the shots: [time, plots, pitch, margin, at (the moment whose heights it frames; its own time if left out), smallest zoom]
  function shots(){
    if (CITY){
      const hand = [[0, 0], [1, 0], [0, 1]];
      return [
        [0,    [[0, 0]], 34, 3.2, 0, 4.2],
        [2.8,  [[0, 0]], 34, 1.4, 2.8],
        [5.6,  hand, 35, 1.25, 5.6],
        [9.5,  allPlots(9.5), 36, 1.18, 9.5],
        [14,   allPlots(14), 37, 1.14, 14],
        // (the garden growing at the city's edge: closer and steeper, so its paths, trees and pond read)
        [18.6, CITY_INFO.lawns, 44, 1.45, LAST_ACT],
        [22.4, CITY_INFO.lawns, 47, 1.3, LAST_ACT],
        [26,   allPlots(LAST_ACT), 37, 1.1, LAST_ACT],
        [30,   allPlots(LAST_ACT), 34, 1.16, LAST_ACT],
      ].map(([t, keys, pd, mg, at, mz]) => ({ t, ...fit(boxes(keys, at ?? t), yawAt(t), pd*DEG, mg, .05, mz) }));
    }
    const garden = [[2, 0], ...LAWNS], pondish = PLAN.water.length ? PLAN.water : [[1, 3]];
    const near = pondish.flatMap(([i, j]) => [[i, j], [i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]);
    return [
      [0,    [[0, 0]], 34, 3.2, 0, 4.2],
      [3.6,  [[0, 0]], 34, 1.35, 3.6],
      [11.2, BLOCK, 35, 1.2, 11.2],
      [18.6, [...BLOCK, [-1, 0]], 33, 1.12, 18.6],
      [21.5, [...BLOCK, [-1, 0], [2, 0]], 34, 1.12, 21.5],
      [25.3, [[1, 0], [1, 1], [2, 0], [3, 0], [2, 1], [3, 1]], 32, 1.15, 25.3],
      [28.9, [[1, 0], [1, 1], [2, 0], [3, 0], [2, 1], [3, 1]], 33, 1.25, 25.3],
      [32.5, [[1, 0], [2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]], 40, 1.3, 32.5],
      [41.8, [...garden, [3, 0]], 42, 1.12, 41.8],
      [45.6, near, 50, 1.5, 45.6],
      [56.5, allPlots(LAST_ACT), 37, 1.14, LAST_ACT],
      [60,   allPlots(LAST_ACT), 36, 1.2, LAST_ACT],
    ].map(([t, keys, pd, mg, at, mz]) => ({ t, ...fit(boxes(keys, at ?? t), yawAt(t), pd*DEG, mg, .06, mz) }));
  }
  // between shots: a smooth curve through them all (cubic Hermite, each key's slope from its neighbours), so the camera never stops dead
  function curve(K, t, f){
    if (t <= K[0].t) return K[0][f]; const n = K.length - 1; if (t >= K[n].t) return K[n][f];
    let k = 0; while (K[k + 1].t < t) k++;
    const a = K[k], b = K[k + 1], h = b.t - a.t, u = (t - a.t)/h;
    const slope = q => { if (q <= 0 || q >= n) return 0; const p = K[q - 1], c = K[q], d = K[q + 1]; return ((c[f] - p[f])/(c.t - p.t) + (d[f] - c[f])/(d.t - c.t))/2; };
    const m0 = slope(k)*h, m1 = slope(k + 1)*h, u2 = u*u, u3 = u2*u;
    return (2*u3 - 3*u2 + 1)*a[f] + (u3 - 2*u2 + u)*m0 + (-2*u3 + 3*u2)*b[f] + (u3 - u2)*m1;
  }
  function camAt(t){
    const K = PLAN.K || (PLAN.K = shots());
    Object.assign(CAMP, { x: curve(K, t, 'x'), y: curve(K, t, 'y'), z: curve(K, t, 'z'), zoom: Math.exp(curve(K, t, 'zoom')), pitch: curve(K, t, 'pitch'), yaw: yawAt(t) });
  }
  { const _uc = updateCamera;
    updateCamera = function (dt){
      if (PLAN.K !== undefined && (D.playing || D.done || D.ready)) safe('camera', () => {
        camAt(D.t);
        camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal);
        yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
      });
      return _uc(dt);
    }; }

  /* ---------- the timeline ---------- */
  const EV = []; let fired = 0;
  const at = (t, f, name) => EV.push({ t, f, name });
  const LEAD = { btn: .45, onto: .42, up: .36, sky: .42, lawn: .4, green: .36, pod: .55, del: .36 };
  function timeline(){
    at(.35, () => { html.classList.add('dm-zones'); }, 'zone bar up');
    for (const a of ACTS){
      if (!AUTO && !a.auto && LEAD[a.kind]) at(a.t - LEAD[a.kind], () => aimFor(a), 'aim ' + a.n + ' ' + a.kind);
      at(a.t, () => doAct(a), a.kind + ' ' + JSON.stringify(a.v));
    }
    at(CUR_OFF, () => { safe('hover', () => showHover(null)); if (S.zone) selectZone(null); CUR.want = 0; }, 'building done: cursor away');
    at(D.len, () => { D.playing = false; D.done = true; say('done at', D.t.toFixed(2));
      if (!CAP && !AUTO){ D.el.msg.hidden = false; D.el.status.innerHTML = 'click to play again'; D.el.ov.classList.add('ask'); D.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
    EV.sort((a, b) => a.t - b.t);
  }

  /* ---------- the clock: the film's own frame count (the stage's) ---------- */
  let rolling = false, rendered = false, base = 0, t0real = 0;
  D.frameNow = now => {
    if (!rolling) return now;
    if (AUTO || D.held) return null;   // (the sound pass draws nothing)
    rendered = true; D.drawn++; return base + D.frame*1000/FPS;
  };
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
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); D.log.push(t.toFixed(2) + ' ' + e.name); }
    if (CAP) Math.random = rng(h32('frame', D.frame));
    S.hour = HOUR;
    if (!AUTO) paint(t, 1/FPS);
  }

  /* ---------- the overlay, drawn from the film's time ---------- */
  function cursor(t, dt){
    const E = D.el;
    CUR.on = follow(CUR.on, CUR.want, 10, dt);
    E.cur.style.opacity = CUR.on.toFixed(3);
    if (CUR.wp){ const s = toScreen(CUR.wp); CUR.tx = s.x; CUR.ty = s.y; }
    if (CUR.tx !== null){ if (CUR.x === 0 && CUR.y === 0){ CUR.x = CUR.tx + 60; CUR.y = CUR.ty + 70; } CUR.x = follow(CUR.x, CUR.tx, 13, dt); CUR.y = follow(CUR.y, CUR.ty, 13, dt); }
    const press = 1 - .14*Math.max(0, 1 - Math.abs(t - CUR.pulse)/.06);
    E.cur.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${press.toFixed(3)})`;
    const u = (t - CUR.pulse)/.32;
    if (u >= 0 && u < 1 && CUR.on > .05){ E.ring.style.opacity = (.85*(1 - u)*CUR.on).toFixed(3); E.ring.style.borderColor = CUR.col;
      E.ring.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${(.35 + .9*expo(u)).toFixed(3)})`; }
    else E.ring.style.opacity = '0';
  }
  function paint(t, dt){
    const E = D.el;
    // in from black, and out to black at the end (so it loops cleanly)
    E.black.style.opacity = t < .4 ? (1 - ss(t/.4)).toFixed(3) : (ss(seg(t, D.len - .6, D.len))).toFixed(3);
    cursor(t, dt);
    E.tag.style.opacity = ss(seg(t, .3, .9)).toFixed(3);
    const zb = document.querySelector('.zonebar .zones'); if (zb) zb.style.opacity = (1 - ss(seg(t, T_OUT, T_OUT + .8))).toFixed(3);
  }

  /* ---------- getting ready, and playing ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const s0 = Date.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (Date.now() - s0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  const wait = secs => { const s0 = performance.now(); return until(() => performance.now() - s0 >= secs*1000, 3600); };
  async function setup(){
    await Promise.race([Promise.all(['12px Silkscreen', '400 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '500 12px "Chakra Petch"', '600 12px "Chakra Petch"'].map(f => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 20000))]).catch(() => null);
    overlay();
    status('working out the city');
    await until(() => typeof pplReady !== 'undefined' && pplReady, 300).catch(e => warn('people', e));
    if (!AUTO){   // (the sound pass builds nothing, so it needs no plan)
      plan();
      status('back to one bare plot');
      city(); settleAll();
    }
    timeline();
    status('the Grid tuning in');
    await until(() => music.on && music.level > .98, AUTO ? 40 : 600).catch(e => warn('music', 'the Grid is not playing (' + (e && e.message) + ')'));
    await wait(3);   // (the player's own fade in, done)
    status('night falling');
    S.hour = HOUR; await wait(.3); LIGHTS_ON.value = LIGHTS_GOAL;
    await until(() => Math.abs(LIGHTS_ON.value - LIGHTS_GOAL) < .01, 40).catch(e => warn('lights', e));
    PLAN.K = undefined; D.t = 0; if (!AUTO) camAt(0); camGoal.set(CAMP.x, CAMP.y, CAMP.z); camT.copy(camGoal); yaw = yawT = CAMP.yaw; zoom = zoomT = CAMP.zoom; PITCH = pitchT = CAMP.pitch;
    D.ready = true;
    await wait(1);
    D.info.deck = DECK ? DECK.length + ' moments from the sound pass' : AUTO ? 'recording' : 'live (no sound pass yet)';
    status(CAP || AUTO ? 'ready' : 'click to play');
    if (AUTO) start();
    else if (!CAP){ D.el.ov.classList.add('ask'); D.el.status.innerHTML = 'click to play<br><small>60 s</small>'; D.el.ov.addEventListener('click', start, { once: true }); }
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
  D.state = () => ({ ready: D.ready, playing: D.playing, done: D.done, held: D.held, t: D.t, frame: D.frame, drawn: D.drawn, len: D.len, stage: D.stage, info: D.info, log: D.log.slice(-80) });
  addEventListener('load', () => { setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); D.failed = String(e && e.message || e); }); });
  return D;
})();
