// Neon Terrarium: the trailer. Open the game with #trailer at the end of the address and it builds its own world, then plays a
// 68.5 second scripted film over Bytes (assets/audio/music/Bytes.mp3, played as it is):
//
//   0.0   four sectors (residential, commercial, luxury, industrial) joined by a metro, turning while the morning comes up; about a
//         hundred new buildings are placed round their edges with the game's build animation until the city fills the frame
//   8.4   the camera dives into a garden in the residential sector; the person cam goes through three people there, six seconds each,
//         its log filling in from what they say. The third says goodnight and walks into their building
//   27.9  their apartment opens in Furnish pod: the hologram scan, then a piece of furniture, a ceiling light and a plant on a table
//         are set down while the room turns
//   36.6  a glitch into the coast: a town grown over the cliffs and the land behind them, at midday, seen whole (waves and shorebirds)
//   41.95 a glitch out onto a metro, seen from the side, riding past the foundry and the factories, then the Neon Dome, the market mall
//         and the towers, then out over the clouds at golden hour, until a wall of towers cuts across the view
//   54.45 behind the towers it is night: the camera pulls back over a dense neon city in the dark, its lights flicker on, the title
//
// Nothing it builds is saved (saveguard.js locks every neonIsland.* and neonLooks.* key while #trailer is open), so the player's own
// city and settings are untouched. Live, it waits for a click (the browser needs one before it plays sound); the recorder
// (tools/trailer/record.py) runs it frame by frame instead, with a fixed clock, and adds the sound afterwards.
'use strict';
const TRAILER = (() => {
  const TR = { on: !!window.NT_TRAILER, ready: false, playing: false, done: false, t: -1, stage: 'off', log: [], info: {} };
  if (!TR.on) return TR;
  maybeSpawnMegas = () => {};   // (the opening shot's builds never bring in a megastructure of their own)
  sfx.play = () => {};   // (and make no sound: the trailer's sound is Bytes and the coast)
  const CAP = !!window.__TR_CAPTURE;   // (set by the recorder's clock shim: no click, no sound, the recorder steps the frames)
  const say = (...a) => { TR.log.push(a.join(' ')); console.log('[trailer]', ...a); };
  const warn = (what, e) => { TR.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[trailer] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };

  /* ---------- timing (Bytes as it is: its first drop hits at 21.93 s) ---------- */
  const LEN = 68.5, DROP1 = 21.93;
  const MK = { swoop: 8.4, p: [9.9, 15.9, DROP1], leave: 23.4, furnBy: 28.2, glIn: 36.6, coastIn: 37.04, glOut: 41.61, coastOut: 41.95,
    coastWake: 35.6, ride: 41.95, wall: 55.0, back: 56.6, zoomed: 61.0, lit: 62.5, logo: 64.0, end: LEN };

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

  /* ---------- the world ---------- */
  // 1. the opening city: four sectors of 10 x 10 plots, one zone each, four plots of open sky between them, and a metro round their inner corners
  const N = 10;
  const SECT = [{ zone: 'low', i0: -14, j0: -14 }, { zone: 'mid', i0: 0, j0: -14 }, { zone: 'high', i0: 0, j0: 0 }, { zone: 'ind', i0: -14, j0: 0 }];
  const MEGAS = [['police', -14, -14, 3, 3], ['club', 5, -14, 4, 4], ['pagoda', 5, 4, 4, 5], ['foundry', -14, 3, 4, 6]];
  // the metro winds through the middle of all four sectors: up through the industrial sector, through the residential sector and back on itself,
  // across into the commercial sector, zigzagging down through it, and on through the luxury sector (well clear of the landmarks and the garden)
  const MT_WAY = [[-9, 8], [-9, 4], [-6, 4], [-6, -13], [-10, -13], [-10, -14], [2, -14], [2, -9], [4, -9], [4, -6], [7, -6], [7, 1], [2, 1], [2, 8]];
  const MT_STOPS = [[-9, 6], [-6, -9], [2, -11], [7, -2], [4, 1]];
  const CENTER = { x: -2.5*LOT, z: -2.5*LOT };
  // the garden: an open lawn in the residential sector with low tenements round it, so the people on it are always in view
  const PARK = { i0: -11, j0: -11, n: 4, ring: 1, floors: 4 };
  const inPark = (i, j) => i >= PARK.i0 && i < PARK.i0 + PARK.n && j >= PARK.j0 && j < PARK.j0 + PARK.n;
  const nearPark = (i, j) => !inPark(i, j) && i >= PARK.i0 - PARK.ring && i < PARK.i0 + PARK.n + PARK.ring && j >= PARK.j0 - PARK.ring && j < PARK.j0 + PARK.n + PARK.ring;
  const PARK_C = { x: (PARK.i0 + (PARK.n - 1)/2)*LOT, z: (PARK.j0 + (PARK.n - 1)/2)*LOT };
  // 2. the ride, far south of the opening city: one straight metro line along row RJ, seen from the south side (the low numbers of j are in
  // front of it, the high ones behind). West to east: an industrial sector (the foundry and factories behind the track), a commercial
  // sector (the Neon Dome, the market mall and tall towers behind), open sky, then the dense city, whose front edge is a wall of towers
  const RJ = 45;
  const RIDE_IND = { i0: -26, i1: -19, j0: 41, j1: 50, zone: 'ind' }, RIDE_COM = { i0: -18, i1: -9, j0: 41, j1: 51, zone: 'mid' };
  const DENSE = { i0: -1, i1: 29, j0: 29, j1: 57 }, WALL = { i0: -1, i1: 10, j0: 42, j1: 44 };
  const RIDE_MEGAS = [['foundry', -25, 47, 6, 4], ['club', -17, 47, 4, 4], ['market', -12, 47, 4, 4], ['club', 13, 50, 4, 4]];
  const RIDE_CUTS = [[-22, 44, 'ind'], [-15, 44, 'mid'], [-11, 44, 'mid']];   // (a few tall ones in front: the view is cut as they pass)
  const RIDE_MT = [[-26, RJ], [38, RJ]];
  const DENSE_C = { x: 12*LOT, z: 42*LOT };
  const inBox = (b, i, j) => i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1;
  function lineTiles(way){
    const t = [];
    for (let k = 0; k < way.length - 1; k++){
      const [i0, j0] = way[k], [i1, j1] = way[k + 1], di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
      let i = i0, j = j0; if (k > 0){ i += di; j += dj; }
      for (;;){ t.push({ i, j }); if (i === i1 && j === j1) break; i += di; j += dj; }
    }
    return t;
  }
  const RIDE = { l: null, x0: 0, on: false };
  function city(){
    const R = mulberry32(20261026);
    const tiles = lineTiles(MT_WAY), rtiles = lineTiles(RIDE_MT), onTrack = new Set(tiles.concat(rtiles).map(t => t.i + ',' + t.j));
    const allMegas = MEGAS.concat(RIDE_MEGAS);
    const inMega = (i, j) => allMegas.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    const secs = (zone, k, mf) => { const out = []; for (let q = 0; q < k; q++) out.push(Object.assign({ zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }, mf ? { mf } : {})); return out; };
    let n = 0;
    const put = (i, j, f) => { const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some'; f(c); cells.set(ckey(i, j), c); n++; };
    // the opening city
    // (lawns only in the garden: everywhere else is built on, low under the metro so it fits beneath the track)
    for (const s of SECT) for (let i = s.i0; i < s.i0 + N; i++) for (let j = s.j0; j < s.j0 + N; j++) put(i, j, c => {
      if (inPark(i, j)) { c.green = 'grass'; return; }
      if (inMega(i, j)) return;
      if (onTrack.has(i + ',' + j)){ c.sections = secs(s.zone, 1, 2); return; }
      if (nearPark(i, j)){ c.sections = secs('low', 1, PARK.floors); return; }
      const u = R();
      c.sections = secs(s.zone, u < .55 ? 1 : u < .88 ? 2 : 3);
    });
    // the ride's two sectors: low in front of the track (a few tall ones to cut across), the track on a lawn, a lawn row behind it, then the
    // landmarks and tall buildings at the back
    for (const b of [RIDE_IND, RIDE_COM]) for (let i = b.i0; i <= b.i1; i++) for (let j = b.j0; j <= b.j1; j++) put(i, j, c => {
      if (inMega(i, j)) return;
      if (onTrack.has(i + ',' + j) || j === RJ + 1) { c.sections = secs(b.zone, 1, 2); return; }   // (low under the track and just behind it)
      const cut = RIDE_CUTS.find(([ci, cj]) => ci === i && cj === j);
      if (cut){ c.sections = secs(cut[2], 3); return; }
      if (j < RJ){ c.sections = secs(b.zone, 1, 2); return; }
      c.sections = secs(b.zone, j >= b.j1 - 1 ? 3 : R() < .5 ? 2 : 3);
    });
    // the dense city: mostly commercial neon and tenements, a little industry, hardly any white luxury; its front edge a wall of towers
    for (let i = DENSE.i0; i <= DENSE.i1; i++) for (let j = DENSE.j0; j <= DENSE.j1; j++) put(i, j, c => {
      if (inMega(i, j)) return;
      if (inBox(WALL, i, j)){ c.green = 'none'; return; }   // (the arcology stands here: see ARCO)
      if (onTrack.has(i + ',' + j)){ c.sections = secs('mid', 1, 2); return; }
      const u = R(), z = u < .55 ? 'mid' : u < .86 ? 'low' : u < .96 ? 'ind' : 'high', v = R();
      c.sections = secs(z, v < .2 ? 1 : v < .65 ? 2 : 3);
    });
    for (const [kind, i, j, w, h] of allMegas){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m) warn('megastructure ' + kind + ' at ' + i + ',' + j, 'did not fit'); }
    const mk = (t, stops) => ({ id: mtNext++, tiles: t, done: true, st: stops.map(([i, j]) => t.findIndex(x => x.i === i && x.j === j)).filter(k => k > 0 && k < t.length - 1), sides: {} });
    const l = mk(tiles, MT_STOPS), lr = mk(rtiles, []);
    metros.push(l, lr); mtReindex();
    rebuildAll(); finishSync();
    safe('metro', () => { mtCommit(l, []); mtCommit(lr, []); }); finishSync();
    RIDE.l = lr;
    safe('arcology', arcology);
    TR.info.city = { plots: n, megas: megas.size, metros: metros.length };
    say('city built:', JSON.stringify(TR.info.city));
  }
  TR.city = () => safe('city', city);

  // It is what wipes day into night on the ride: wider than the frame and taller than it at the ride's zoom, so for a moment it is all there
  // is to see. A stepped skyline, a grid of windows (the game's lit-window material, so they come on with the city's lights), neon bands
  const ARCO = { x0: (WALL.i0 - .5)*LOT, x1: (WALL.i1 + .5)*LOT, z0: (WALL.j0 - .5)*LOT, z1: (WALL.j1 + .5)*LOT, h: 27 };
  function arcology(){
    const R = mulberry32(31337), G = new THREE.Group(), y0 = CURB;
    const W = ARCO.x1 - ARCO.x0, D = ARCO.z1 - ARCO.z0, cx = (ARCO.x0 + ARCO.x1)/2, cz = (ARCO.z0 + ARCO.z1)/2;
    const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; G.add(o); return o; };
    add(new THREE.BoxGeometry(W, ARCO.h, D), M.slabSide, cx, y0 + ARCO.h/2, cz);
    // the skyline: towers rising off the block
    const towers = [[.08, .16, 9], [.3, .12, 14], [.5, .2, 7], [.72, .14, 12], [.9, .12, 9]];
    for (const [f, wf, hh] of towers) add(new THREE.BoxGeometry(W*wf, hh, D*.7), M.slabSeam, ARCO.x0 + W*f, y0 + ARCO.h + hh/2, cz + D*.08);
    // windows on the faces the camera sees (south and west): small panes, most lit at night, a few dark
    const lit = [], dark = [], strips = [[], []];
    const pane = (x, y, z, ry) => { const g = new THREE.PlaneGeometry(.5, .55); g.rotateY(ry); g.translate(x, y, z); (R() < .72 ? lit : dark).push(g); };
    for (let y = y0 + 1.4; y < y0 + ARCO.h - .8; y += 1.05) for (let x = ARCO.x0 + .7; x < ARCO.x1 - .5; x += .95) if (R() > .06) pane(x, y, ARCO.z0 - .02, Math.PI);
    for (let y = y0 + 1.4; y < y0 + ARCO.h - .8; y += 1.05) for (let z = ARCO.z0 + .7; z < ARCO.z1 - .5; z += .95) if (R() > .06) pane(ARCO.x0 - .02, y, z, -Math.PI/2);
    // neon bands across the south face every few floors, pink and cyan
    for (let k = 0, y = y0 + 4.6; y < y0 + ARCO.h - 2; y += 6.3, k++){ const g = new THREE.BoxGeometry(W - .4, .14, .08); g.translate(cx, y, ARCO.z0 - .06); strips[k % 2].push(g); }
    const merge = list => list.length ? THREE.BufferGeometryUtils.mergeBufferGeometries(list) : null;
    for (const [list, m] of [[lit, M.winLit], [dark, M.glassDark], [strips[0], M.neonPink], [strips[1], M.neonCyan]]){ const g = merge(list); if (g){ const o = new THREE.Mesh(g, m); G.add(o); } }
    scene.add(G); ARCO.g = G;
    try { SC_DIRTY.unknown = true; shadowDirty = true; } catch (e) {}
  }

  // the opening shot builds the city out: new plots grow from each sector's outer edges into the open sky until the city fills the frame,
  // each with the game's own build sweep, some stacked a section higher a moment later
  function edgeRows(s){
    const out = [], lo = s.i0, hi = s.i0 + N - 1, lj = s.j0, hj = s.j0 + N - 1;
    const west = s.i0 < 0, north = s.j0 < 0;
    const ci = west ? lo - 1 : hi + 1, ci2 = west ? lo - 2 : hi + 2, cj = north ? lj - 1 : hj + 1, cj2 = north ? lj - 2 : hj + 2;
    for (let j = lj; j <= hj; j++) out.push([ci, j]);
    for (let i = lo; i <= hi; i++) out.push([i, cj]);
    out.push([ci, cj]);
    for (let j = lj + 2; j <= hj - 2; j += 2) out.push([ci2, j]);
    for (let i = lo + 2; i <= hi - 2; i += 2) out.push([i, cj2]);
    return out;
  }
  const GROW = SECT.map(s => [s.zone, edgeRows(s)]);
  const GROW_T0 = .5, GROW_T1 = 7.9;
  function growPlan(){
    const R = mulberry32(7026), q = [], n = Math.max(...GROW.map(g => g[1].length));
    for (let k = 0; k < n; k++) for (const [zone, list] of GROW) if (list[k]) q.push({ zone, i: list[k][0], j: list[k][1], up: R() < .22 ? (R() < .3 ? 2 : 1) : 0 });
    q.forEach((b, k) => { b.t = GROW_T0 + (GROW_T1 - GROW_T0)*k/(q.length - 1); });
    return q;
  }
  function grow(b){
    const c = addPlatform(b.i, b.j, b.zone); if (!c) return;
    for (let k = 1; k <= b.up; k++) at(b.t + .55*k, () => { if (c.sections.length < MAX_SECTIONS) addSection(c, b.zone); }, 'stack ' + b.i + ',' + b.j);
  }

  /* ---------- the page: hide the game's interface, add ours ---------- */
  function overlay(){
    document.documentElement.classList.add('tr-on');
    const st = document.createElement('style'); st.id = 'trStyle';
    st.textContent = `
      html.tr-on body > *:not(#view):not(#furnish):not(#trOv):not(#trCoast):not(.tr-keep){visibility:hidden!important}
      html.tr-on #cctv, html.tr-on #cctvFade{display:none!important}
      html.tr-on, html.tr-on *{cursor:none!important}
      html.tr-on #trOv.ask, html.tr-on #trOv.ask *{cursor:pointer!important}
      html.tr-on #monitor.tr-keep{transform:scale(1.4);transform-origin:top right;top:32px!important;right:36px!important;max-height:calc((100vh - 64px)/1.4)!important;overflow:hidden}
      #trCoast{position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:9000;background:#000}
      #trOv{position:fixed;inset:0;z-index:9001;pointer-events:none}
      #trOv.ask{pointer-events:auto}
      #trOv > i{position:absolute;inset:0;display:block;opacity:0}
      #trBlack{background:#000;opacity:1!important}
      #trFlash{background:#e8fbff}
      #trSel{position:absolute;left:0;top:0;width:0;height:0;display:none;pointer-events:none}
      #trSel b{position:absolute;width:22px;height:22px;border:3px solid #38e8e0;filter:drop-shadow(0 0 6px rgba(56,232,224,.9))}
      #trSel b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #trSel b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #trSel b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #trSel b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #trSel i{position:absolute;left:50%;top:-14px;width:8px;height:8px;margin-left:-4px;background:#ff4fa3;transform:rotate(45deg);box-shadow:0 0 10px #ff4fa3}
      #trLogo{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:22px;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;text-transform:uppercase}
      #trLogo b{display:block;font-weight:400;line-height:1;opacity:0}
      #trLogo .w1{font-size:132px;letter-spacing:.16em;color:#ffd9ee;text-shadow:0 0 6px #ff4fa3,0 0 18px #ff4fa3,0 0 44px rgba(255,79,163,.75),0 0 90px rgba(255,79,163,.4)}
      #trLogo .w2{font-size:58px;letter-spacing:.42em;margin-right:-.42em;color:#d8fffd;text-shadow:0 0 5px #38e8e0,0 0 16px #38e8e0,0 0 40px rgba(56,232,224,.7),0 0 80px rgba(56,232,224,.35)}
      #trGl{position:absolute;inset:0;pointer-events:none}
      #trGl b{position:absolute;left:0;right:0;display:none}
      #trGl i{position:absolute;inset:0;opacity:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.55) 0 1px,transparent 1px 3px)}
      #trMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #trMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'trOv';
    ov.innerHTML = '<i id="trBlack"></i><i id="trFlash"></i><div id="trSel"><b></b><b></b><b></b><b></b><i></i></div><div id="trGl">' + '<b></b>'.repeat(10) + '<i></i></div>'
      + '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="trRGB" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset id="trRo" in="r" dx="6" dy="0" result="ro"/>'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="gb"/><feOffset id="trGo" in="gb" dx="-6" dy="0" result="gbo"/>'
      + '<feBlend in="ro" in2="gbo" mode="screen"/></filter></svg>'
      + '<div id="trLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b></div><div id="trMsg"><b>Trailer</b><span id="trStatus">building the city</span></div>';
    document.body.appendChild(ov);
    TR.el = { ov, black: ov.querySelector('#trBlack'), flash: ov.querySelector('#trFlash'), sel: ov.querySelector('#trSel'), logo: ov.querySelector('#trLogo'),
      w1: ov.querySelector('.w1'), w2: ov.querySelector('.w2'), gl: [...ov.querySelectorAll('#trGl b')], scan: ov.querySelector('#trGl i'), ro: ov.querySelector('#trRo'), go: ov.querySelector('#trGo'),
      msg: ov.querySelector('#trMsg'), status: ov.querySelector('#trStatus') };
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
    // one picture size for the whole film: the game sizes its render to the zoom (sky.js applyRenderRes), and a camera that zooms every frame
    // stepped it up and down all the way through
    safe('resolution', () => { ZOOM_RES = 0; TR.pinRes = true; H = 0; applyRenderRes(zoom); });
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; } });
    FURN.lightCity = false;   // (the apartment's city in full detail out to 46 units, not 18: furnish.js)
  }

  /* ---------- people helpers ---------- */
  const doorOf = pl => pl && STORY.streetDoor(pl);
  const doorAnc = pl => ({ kind: 'door', door: STORY.streetDoor(pl), place: pl.id });
  const nodeAnc = n => ({ kind: 'point', x: NG.x[n], z: NG.z[n], node: n });
  const outward = d => { const dx = d.wall.x - d.inside.x, dz = d.wall.z - d.inside.z, L = Math.hypot(dx, dz) || 1; return { x: dx/L, z: dz/L }; };
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
  const cellOf = id => { const m = /^c:(-?\d+),(-?\d+)$/.exec(id || ''); return m ? cells.get(ckey(+m[1], +m[2])) : null; };
  const placeOf = c => places.get('c:' + c.i + ',' + c.j);
  const inSector = (c, zone) => { const s = SECT.find(x => x.zone === zone); return c && c.i >= s.i0 && c.i < s.i0 + N && c.j >= s.j0 && c.j < s.j0 + N; };

  /* ---------- sight lines (the garden's camera angle is picked so nothing stands in the way) ---------- */
  const hAt = (x, z) => { const i = Math.round(x/LOT), j = Math.round(z/LOT), c = cells.get(ckey(i, j)); if (!c) return 0;
    if (!c.mega && (Math.abs(x - i*LOT) > LOT*.37 || Math.abs(z - j*LOT) > LOT*.37)) return 0;
    return hwSurface(c); };
  function los(x, y, z, yw, pt){
    const cp = Math.cos(pt), dx = Math.sin(yw)*cp, dy = Math.sin(pt), dz = Math.cos(yw)*cp;
    for (let s = .3; s < 120; s += .25){
      const yy = y + dy*s; if (yy > 52) return true;
      const px = x + dx*s, pz = z + dz*s, h = hAt(px, pz);
      if (h > CURB + .05 && yy < h - .08) return false;
      if (yy > MT_Y - .6 && yy < MT_Y + .4 && mtAt(Math.round(px/LOT), Math.round(pz/LOT)).length) return false;
    }
    return true;
  }
  const at3 = (x, z, y = CURB + .45) => ({ x, y, z });
  function pickView(pts, pref, pmin, pmax){
    const ok = (yw, pt) => pts.every(p => los(p.x, p.y, p.z, yw, pt));
    for (let d = pmin; d <= pmax; d += 4) for (const dk of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8]){ const yw = pref + dk*Math.PI/8; if (ok(yw, d*DEG)) return { yaw: yw, pitch: d*DEG }; }
    return { yaw: pref, pitch: pmax*DEG };
  }

  /* ---------- the cast: three pairs in the garden ---------- */
  function cast(){
    const used = new Set();
    const free = p => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !used.has(p.id) && p.home && cellOf(p.home);
    const ringer = p => { const c = cellOf(p.home); return c && nearPark(c.i, c.j) && c.sections.length; };
    const resident = p => { const c = cellOf(p.home); return c && inSector(c, 'low') && !c.mega && c.sections.length; };
    const pool = pplList.filter(p => free(p) && ringer(p)).concat(pplList.filter(p => free(p) && resident(p) && !ringer(p)));
    // one angle for the garden, clear over the tenements round it, looking at it from the south-east like the opening shot
    const pts = [[0, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]].map(([a, b]) => at3(PARK_C.x + a, PARK_C.z + b));
    const view = pickView(pts, 1.65, 34, 58);
    // the third person: lives round the garden, has a pod (their apartment opens next), and their door can be seen from that angle
    let p3 = null, d3 = null;
    for (const p of pool){
      if (!p.pod || !ringer(p)) continue;
      const d = doorOf(places.get(p.home)); if (!d) continue;
      const o = outward(d), fx = d.wall.x + o.x*.9, fz = d.wall.z + o.z*.9;
      if (!los(fx, CURB + .45, fz, view.yaw, view.pitch)) continue;
      const k = Math.hypot(fx - PARK_C.x, fz - PARK_C.z); if (!p3 || k < p3.k){ p3 = { p, k }; d3 = { x: fx, z: fz }; }
    }
    if (!p3){ warn('garden', 'nobody round the garden with a pod and a door in view: using the nearest resident with a pod');
      const q = pplList.filter(p => free(p) && p.pod && resident(p))[0]; if (!q) throw new Error('no resident with a pod'); p3 = { p: q }; const d = doorOf(places.get(q.home)), o = outward(d); d3 = { x: d.wall.x + o.x*.9, z: d.wall.z + o.z*.9 }; }
    used.add(p3.p.id);
    const take = () => { const p = pool.find(free); if (!p) throw new Error('not enough people for the garden'); used.add(p.id); return p; };
    const a1 = take(), b1 = take(), a2 = take(), b2 = take(), b3 = take();
    // where each pair stands: two out on the lawn, the third at the lawn's edge by the third person's door
    const node = (x, z, avoid) => { let n = STORY.nearestNode(x, z); if (avoid.some(m => Math.hypot(NG.x[m] - NG.x[n], NG.z[m] - NG.z[n]) < 2.2)){ let best = null;
      for (let k = 0; k < NG.x.length; k++){ const dd = Math.hypot(NG.x[k] - x, NG.z[k] - z); if (dd > 6 || avoid.some(m => Math.hypot(NG.x[m] - NG.x[k], NG.z[m] - NG.z[k]) < 2.2)) continue; if (!best || dd < best.d) best = { k, d: dd }; }
      if (best) n = best.k; } return n; };
    const n3 = node(lerp(d3.x, PARK_C.x, .35), lerp(d3.z, PARK_C.z, .35), []);
    const n1 = node(PARK_C.x - 2.8, PARK_C.z - 1.6, [n3]), n2 = node(PARK_C.x + 2.6, PARK_C.z + 1.8, [n3, n1]);
    TR.c = { view, pairs: [{ A: a1, B: b1, n: n1 }, { A: a2, B: b2, n: n2 }, { A: p3.p, B: b3, n: n3 }], subject: p3.p, home: places.get(p3.p.home) };
    TR.info.cast = { view: { yaw: +view.yaw.toFixed(2), pitch: +(view.pitch/DEG).toFixed(0) }, people: TR.c.pairs.map(q => q.A.id), pod: p3.p.pod };
    say('cast:', JSON.stringify(TR.info.cast));
  }
  // each pair walks out to its spot and talks (they hold there until told otherwise)
  function garden(){
    TR.gsc = TR.c.pairs.map((q, k) => {
      for (const p of [q.A, q.B]){ putInside(p, p.home); p.speed = PPL_SPEED; }
      const anc = nodeAnc(q.n);
      const sc = scene('trailer.garden' + k, { A: q.A.id, B: q.B.id }, [
        { id: 'g0', who: ['A', 'B'], with: [], at: 'case', do: 'walk', anc, hold: .2 },
        { id: 'g1', who: ['A'], with: ['B'], at: 'case', do: 'chat', anc, hold: 600 }],
        { g0: ['{A} and {B} come out onto the lawn.'], g1: ['{A} and {B} talk on the lawn.'] });
      q.A.hurry = q.B.hurry = true;
      return sc;
    });
  }
  const gathered = () => TR.gsc && TR.gsc.every(sc => sc && sc.b && sc.b.id === 'g1' && sc.phase === 'hold');
  function scene(id, castMap, beats, log){
    for (const pid of Object.values(castMap)){ const p = people.get(pid); if (!p || (!p.walk && !p.spot && !places.get(p.at))) throw new Error(id + ': ' + pid + ' is nowhere'); }
    const sc = STORY.startScene({ id, beats, log, roles: {}, effects: {}, next: null, tier: 'case', prio: 9 }, castMap, { done: (sc2, why) => say(id, 'ended', why) });
    if (!sc) throw new Error(id + ' did not start');
    return sc;
  }

  /* ---------- the person cam: what the camera picks up from each of them ---------- */
  function reveal(c, tmpl, fact, channel = 'document', ctx = {}){
    const id = c.A, learned = STORY.learnFrom(tmpl, c, new Set(Object.keys(c)), channel, null, ctx);
    if (typeof PACE !== 'undefined') PACE.mine = true;
    try { STORY.logLine(tmpl, c, ctx, 'reveal', { channel, fact: 'A.' + fact, paced: true }); } finally { if (typeof PACE !== 'undefined') PACE.mine = false; }
    STORY.note(id, { t: STORY.clock, who: id, fact: 'A.' + fact, channel, verified: channel === 'document' || channel === 'introduction', tmpl, cast: c, ctx, learned });
    if (typeof MON !== 'undefined') MON.refresh();
  }
  function revealStep(k, step){
    const q = TR.c.pairs[k], p = q.A, c = { A: p.id, B: q.B.id };
    const job = safe('job', () => STORY.JOB_WORD[STORY.jobKind(p)]) || 'line worker';
    const emp = safe('employer', () => STORY.employerName(p)) || 'the night market';
    const floor = +((p.pod || '').split('|')[2] || 0) + 1, nth = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][floor - 1] || floor + 'th';
    const L = [
      [() => reveal(c, '{B} calls across the lawn: "{A.first}!"', 'first-name', 'introduction'),
       () => reveal(c, '{A} complains to {B} about the shift at ' + emp + '.', 'employer'),
       () => reveal(c, '{B} asks how a ' + job + ' ever gets a day off. {A} laughs.', 'job'),
       () => reveal(c, '{A} and {B}, same lawn, same hour. {seen} days running.', 'habit', 'seen', { seen: 5 })],
      [() => reveal(c, 'Name tag on {A}: "{A.first}."', 'first-name'),
       () => reveal(c, '{A} shows {B} a photo: the crew at ' + emp + '.', 'employer'),
       () => reveal(c, '{A} lives at {place}. {B} lives two doors down.', 'home', 'document', { placeId: p.home }),
       () => reveal(c, '{A} works as a ' + job + '. Nights, mostly.', 'job')],
      [() => reveal(c, '{B} waves {A} down: "{A.first}, wait up!"', 'first-name', 'introduction'),
       () => reveal(c, '{A} tells {B} about the new job at ' + emp + '.', 'employer'),
       () => reveal(c, '{A} points up at {place}. Home: the ' + nth + ' floor.', 'home', 'document', { placeId: p.home }),
       () => reveal(c, '{A} says goodnight to {B} and heads in.', 'habit', 'seen')]][k];
    L[step]();
  }
  const monTab = tab => { const b = document.querySelector('#monTabs button[data-tab=' + tab + ']'); if (b) b.click(); };
  const keep = (el, on) => { if (el) el.classList.toggle('tr-keep', on); };
  // the third person heads in: a wave, then in through their own front door
  function goHome(){
    const q = TR.c.pairs[2], sc = TR.gsc && TR.gsc[2];
    if (sc) safe('garden end', () => STORY.endScene(sc, 'done'));
    TR.homeSc = scene('trailer.home', { A: q.A.id, B: q.B.id }, [
      { id: 'h0', who: ['B'], with: ['A'], at: 'case', do: 'wave', anc: nodeAnc(q.n), hold: .5 },
      { id: 'h1', who: ['A'], with: [], at: 'case', do: 'enter', anc: doorAnc(TR.c.home), hold: 30 }],
      { h0: ['{B} waves {A} off.'], h1: ['{A} goes in through the door.'] });
    q.A.hurry = true;
  }
  const inHome = () => { const p = TR.c.subject; return !p.walk && p.sc && p.sc.mode === 'in' && TR.homeSc && TR.homeSc.b && TR.homeSc.b.id === 'h1'; };

  /* ---------- the subject's brackets (the person cam's highlight, drawn by the trailer so it is always there) ---------- */
  const _v = new THREE.Vector3();
  function brackets(p){
    const E = TR.el.sel;
    if (!p || p.x === undefined || (p.sc && p.sc.mode === 'in')){ E.style.display = 'none'; return; }
    _v.set(p.x, (p._ey ?? CURB) + .42, p.z).project(cam);
    const x = (_v.x + 1)/2*innerWidth, y = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.style.display = 'block'; E.style.transform = `translate(${(x - w/2).toFixed(1)}px,${(y - h/2).toFixed(1)}px)`; E.style.width = w.toFixed(0) + 'px'; E.style.height = h.toFixed(0) + 'px';
  }

  /* ---------- Furnish pod ---------- */
  const labWin = () => { const f = FURN.frame || (document.querySelector('#furnish iframe')); return f && f.contentWindow; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  const labBusy = () => { const w = labWin(); return !w || !w.PodContext || w.PodContext.transitioning; };
  function labClean(){   // only the lab's 3D view shows: its bars, labels and the "simulated apartment" note go
    const w = labWin(); if (!w || !w.document || !w.document.head) return;
    const d = w.document;
    if (!d.getElementById('trLab')){ const st = d.createElement('style'); st.id = 'trLab'; st.textContent = 'body *{visibility:hidden!important}.tr-vis{visibility:visible!important}*{cursor:none!important}'; d.head.appendChild(st); }
    const big = w.innerWidth*w.innerHeight*.45;
    for (const cv of d.querySelectorAll('canvas')){ const r = cv.getBoundingClientRect(); cv.classList.toggle('tr-vis', r.width*r.height > big); }
  }
  function labExit(){   // through the lab's own Exit: it tells the game, drops the home and is ready for the next
    const w = labWin(), b = w && w.document && w.document.getElementById('ntExit');
    if (b) b.click(); else FURN.close();
    setTimeout(() => { if (FURN.open || FURN.hold) FURN.close(); }, 900);
  }
  // the city round the apartment drawn sharp: the lab blends its backdrop with blurred copies by distance (a depth-of-field pass, its kMin and
  // range set on every bake), so each time that pass is drawn its blur is taken to nothing and its haze thinned
  function labSharp(){
    const B = labB(); if (!B || !B.dr || B.dr._trSharp) return;
    const R = B.dr, render = R.render.bind(R); R._trSharp = true;
    R.render = (sc, c) => { const m = sc && sc.children && sc.children[0] && sc.children[0].material, u = m && m.uniforms;
      if (u && u.kMin && u.range && u.hazeK){ u.kMin.value = 0; u.range.value = 1e6; u.hazeK.value = Math.min(u.hazeK.value, .25); }
      return render(sc, c); };
  }
  // a point in the room to the lab's canvas, for the pointer: its camera's view and projection by hand (the frame runs its own three.js)
  function labScreen(B, x, y, z){
    const V = B.cam.matrixWorldInverse.elements, P = B.cam.projectionMatrix.elements;
    const ex = V[0]*x + V[4]*y + V[8]*z + V[12], ey = V[1]*x + V[5]*y + V[9]*z + V[13], ez = V[2]*x + V[6]*y + V[10]*z + V[14], ew = V[3]*x + V[7]*y + V[11]*z + V[15];
    const cx = P[0]*ex + P[4]*ey + P[8]*ez + P[12]*ew, cy = P[1]*ex + P[5]*ey + P[9]*ez + P[13]*ew, cw = P[3]*ex + P[7]*ey + P[11]*ez + P[15]*ew;
    const w = labWin(), cv = w.document.getElementById('bCanvas') || w.document.querySelector('canvas.tr-vis') || w.document.querySelector('canvas');
    const r = cv.getBoundingClientRect(); return { cv, x: r.left + (cx/cw + 1)/2*r.width, y: r.top + (1 - cy/cw)/2*r.height };
  }
  // set something down the way a player does: pick it, point at the spot, click
  function labPlace(arch, seed, wx, wy, wz){
    const w = labWin(), B = labB(); if (!w || !B) return null;
    const before = new Set(B.inst.keys());
    w.PodBuilder.startPlace(arch, seed);
    const s = labScreen(B, wx, wy, wz), o = { clientX: s.x, clientY: s.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    s.cv.dispatchEvent(new w.PointerEvent('pointermove', Object.assign({ button: -1, buttons: 0 }, o)));
    try { if (w.PodBuilder._B.place) w.PodBuilder._B.ptr.dirty = true; } catch (e) {}
    s.cv.dispatchEvent(new w.PointerEvent('pointerdown', Object.assign({ button: 0, buttons: 1 }, o)));
    s.cv.dispatchEvent(new w.PointerEvent('pointerup', Object.assign({ button: 0, buttons: 0 }, o)));
    if (B.place) safe('cancel place', () => w.PodBuilder.cancel());
    safe('deselect', () => w.PodBuilder.select(null));
    const id = [...B.inst.keys()].find(k => !before.has(k));
    return id !== undefined ? B.inst.get(id) : null;
  }
  // once the room is up: a big piece held back and dropped in, then a ceiling light and a plant on a table set down
  const FU = { t0: null, drops: [], done: new Set() };
  const NOT_FURN = /wall|window|door|floor|tile|ceiling|skirting|trim|curtain|blind|rail|pipe|vent|socket|switch|outlet|frame/i;
  const TABLES = new Set(['slab', 'crate', 'spool', 'holo', 'loop', 'block', 'cafe', 'kotatsu', 'fold', 'bar', 'drum']);
  function labDrop(i, from){ FU.drops.push({ i, y: i.pivot.position.y, from, t: TR.t }); i.pivot.visible = false; }
  function labFurnish(t){
    const w = labWin(), B = labB(); if (!B || !B.inst || !B.inst.size) return;
    if (!document.getElementById('furnish').classList.contains('live')) return;   // (this open's room, not the warm-up's)
    if (labBusy()){   // (while the scan runs: the big piece is picked and hidden)
      if (!FU.big){ let best = null;
        for (const i of B.inst.values()){ if (!i.pivot || !i.lbox || (i.rec && (i.rec.parent || i.rec.wh)) || i.kind === 'wall' || (i.pivot.userData && i.pivot.userData.window) || NOT_FURN.test(i.name || '')) continue;
          const a = (i.lbox.max.x - i.lbox.min.x)*(i.lbox.max.z - i.lbox.min.z), sy = i.lbox.max.y - i.lbox.min.y; if (a < .3 || a > 3.2 || sy < .3) continue;
          if (!best || a > best.a) best = { i, a }; }
        if (best){ FU.big = best.i; FU.bigY = best.i.pivot.position.y; best.i.pivot.visible = false; } }
      return;
    }
    if (FU.t0 === null) FU.t0 = t;
    const k = t - FU.t0, root = B.root.position;
    if (k > .45 && !FU.done.has('big') && FU.big){ FU.done.add('big'); FU.drops.push({ i: FU.big, y: FU.bigY, from: 1.6, t }); }
    if (k > 1.5 && !FU.done.has('light')){ FU.done.add('light');   // a pendant over the middle of the main room
      const P = B.P, cx = P ? P.W*.5*(B.TILE || .5) : 2, cz = P ? P.D*.5*(B.TILE || .5) : 2;
      const pts = [...B.inst.values()].filter(i => i.lbox && !(i.rec && i.rec.parent)).map(i => i.pivot.position);
      const mx = pts.length ? pts.reduce((a, p) => a + p.x, 0)/pts.length : cx, mz = pts.length ? pts.reduce((a, p) => a + p.z, 0)/pts.length : cz;
      const i = safe('pendant', () => labPlace('pendant', 3, mx + root.x, root.y, mz + root.z));
      if (i){ labDrop(i, .9); TR.info.pendant = true; } else TR.info.pendant = false;
    }
    if (k > 2.7 && !FU.done.has('plant')){ FU.done.add('plant');   // a little plant on a table
      let tb = null;
      for (const i of B.inst.values()){ if (!i.rec || !TABLES.has(i.rec.arch)) continue; const s = safe('surf', () => w.PodBuilder.surfaces(i.rec.id)) || []; for (const q of s){ const a = q.w*q.d; if (!tb || a > tb.a) tb = { i, q, a }; } }
      const i = tb ? safe('plant', () => labPlace(['bonsai', 'fern', 'snake', 'monstera'][0], 5, tb.q.x + root.x, tb.q.y + root.y, tb.q.z + root.z)) : null;
      if (i){ labDrop(i, .7); TR.info.plant = true; } else TR.info.plant = false;
    }
    for (const d of FU.drops){
      const u = (t - d.t)/.55; d.i.pivot.visible = u >= 0; if (u < 0) continue;
      const v = Math.min(1, u), fall = 1 - v*v, bounce = v < 1 ? 0 : Math.max(0, Math.sin(Math.min(1, (u - 1)/.6)*Math.PI))*.05*Math.max(0, 1 - (u - 1)/.6);
      d.i.pivot.position.y = d.y + d.from*fall + bounce;
    }
    B.needs = true;
  }

  /* ---------- the coast, in a frame of its own, painted only around its moment ---------- */
  const CO = { el: null, w: null, paused: true, pend: [], raf: null, ready: false, yaw: 0, zoom: 0 };
  function coastMake(){
    const keepK = ['neonIsland.coastPlayed', 'neonIsland.coastPaused', 'neonIsland.coastVolume'].map(k => [k, localStorage.getItem(k)]);
    const restore = () => { for (const [k, v] of keepK) try { if (v === null) NT_RAW.remove.call(localStorage, k); else NT_RAW.set.call(localStorage, k, v); } catch (e) {} };
    const f = document.createElement('iframe'); f.id = 'trCoast'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.src = 'coast.html';
    document.body.appendChild(f); CO.el = f;
    f.addEventListener('load', () => safe('coast', () => {
      const w = f.contentWindow; CO.w = w;
      const st = w.document.createElement('style'); st.textContent = 'body *{visibility:hidden!important}#view{visibility:visible!important}*{cursor:none!important}';
      w.document.head.appendChild(st);
      CO.raf = w.requestAnimationFrame.bind(w);
      w.requestAnimationFrame = fn => { if (CO.paused){ CO.pend.push(fn); return 0; } return CO.raf(fn); };
      CO.paused = false;
      const sp = w.Storage.prototype, os = sp.setItem, orm = sp.removeItem;
      sp.setItem = function (k, v){ if (this === w.localStorage && /^neonIsland\./.test(k)) return; return os.call(this, k, v); };
      sp.removeItem = function (k){ if (this === w.localStorage && /^neonIsland\./.test(k)) return; return orm.call(this, k); };
      w.HTMLMediaElement.prototype.play = function (){ this.muted = true; try { this.pause(); } catch (e) {} return Promise.resolve(); };
      const mute = () => { try { const el = w.eval('typeof COASTMUSIC !== "undefined" && COASTMUSIC.el'); if (el){ el.muted = true; el.volume = 0; el.pause(); } } catch (e) {}
        for (const m of w.document.querySelectorAll('audio,video')){ m.muted = true; try { m.pause(); } catch (e) {} } };
      mute(); CO.muteT = setInterval(mute, 250);
      const town = coastTown(w);
      w.COAST.setHour(12);
      CO.yaw = Math.PI*3/4 - .25; CO.zoom = 60; CO.x = town.x; CO.z = town.z;
      w.COAST.go({ yaw: CO.yaw, zoom: CO.zoom, pitch: 35*DEG, x: CO.x, z: CO.z });
      setTimeout(restore, 3000); restore();
      CO.ready = true; say('coast ready');
    }));
  }
  // a large town grown over the coast: it fills the land behind the cliffs right across the frame (the camera is at the coast's farthest
  // zoom) and well inland, in villages that run into each other with fields between. Near the cliff: houses, villas and shops; further in
  // houses and shops, then farms with hamlets among them
  function coastTown(w){
    const C = w.COAST, R = mulberry32(4242);
    try { C.clear(); } catch (e) {}
    try { C.setPaths([]); } catch (e) {}
    const K = { res: ['townhouse', 'tower', 'pods', 'villa', 'pagoda', 'terrace'], com: ['noodle', 'lantern', 'kiosk', 'rotunda', 'viaduct'],
      lux: ['mansion', 'dometower', 'cornerhouse', 'arcvilla', 'pagodatower', 'poolvilla'], farm: ['turbine', 'field', 'dome', 'tunnels', 'barn', 'hive', 'vfarm'],
      solo: ['grotto', 'ringcourt', 'lagoon', 'palace', 'orangery'] };
    const one = a => a[Math.floor(R()*a.length)];
    const nz = (x, z) => { const f = (a, b) => { const h = Math.sin(a*127.1 + b*311.7)*43758.5453; return h - Math.floor(h); };
      const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf*xf*(3 - 2*xf), v = zf*zf*(3 - 2*zf);
      return (f(xi, zi)*(1 - u) + f(xi + 1, zi)*u)*(1 - v) + (f(xi, zi + 1)*(1 - u) + f(xi + 1, zi + 1)*u)*v; };
    const CZ = -4, ZR = 115, DEPTH = 120, TARGET = 900;
    const placed = []; let tries = 0, solos = 0;
    while (placed.length < TARGET && tries < 16000){
      tries++;
      const z = CZ + (R()*2 - 1)*ZR, d = Math.pow(R(), 1.1)*DEPTH, x = 3 - d;
      const dense = nz(x/16 + 3, z/16 + 7)*.75 + nz(x/6 + 11, z/6 + 2)*.25;
      if (R() > .35 + .85*dense - d/DEPTH*.2) continue;
      let kind;
      if (d > 45) kind = R() < .5 ? one(K.farm) : R() < .75 ? one(K.res) : one(K.com);
      else if (d > 16) kind = R() < .65 ? one(K.res) : one(K.com);
      else { const u = R(); kind = u < .4 ? one(K.res) : u < .7 ? one(K.lux) : one(K.com); }
      if (solos < 8 && R() < .01){ kind = K.solo[solos % K.solo.length]; solos++; }
      const rot = Math.floor(R()*8)*Math.PI/4 + (R() - .5)*.35, seed = 1 + Math.floor(R()*99999);
      let pc = null; try { pc = C.place(kind, x, z, rot, seed); } catch (e) { pc = null; }
      if (!pc || pc.ok === false) continue;
      placed.push(pc);
      const up = K.lux.includes(kind) ? .4 : K.res.includes(kind) ? .35 : K.com.includes(kind) ? .2 : 0;
      if (R() < up) try {
        const grp = K.lux.includes(kind) ? K.lux : K.res, s1 = C.stack(pc, one(grp), 1 + Math.floor(R()*99999));
        if (s1 && R() < .3) C.stack(s1, one(grp), 1 + Math.floor(R()*99999));
      } catch (e) {}
    }
    TR.info.coastTown = placed.length;
    say('coast town:', placed.length, 'pieces from', tries, 'tries');
    return { x: -26, z: CZ };
  }
  function coastWake(on){ CO.paused = !on; if (on) for (const fn of CO.pend.splice(0)) CO.raf(fn); }
  function coastDrift(t){
    if (!CO.ready || !CO.w || !CO.w.COAST) return;
    const u = seg(t, MK.coastWake, MK.coastOut);
    CO.w.COAST.go({ yaw: CO.yaw + .14*u, zoom: CO.zoom, pitch: 35*DEG, x: CO.x, z: CO.z });
  }

  /* ---------- the ride: the train is driven along its line by the trailer, at a steady speed ---------- */
  const RIDE_V = 2.2*LOT, RIDE_X0 = -24*LOT;   // (8.4 units a second, starting with the foundry behind)
  const rideX = t => RIDE_X0 + Math.max(0, t - MK.ride)*RIDE_V;
  const _um = updateMetros;
  updateMetros = function (dt, t){
    const l = RIDE.l;
    if (l && l.train){ const tr = l.train, P = mtPath(l), stops = P.stops;
      tr.dwell = 0; tr.at = 0; tr.next = stops.length - 1; tr.dir = 1; tr.v = 0; tr.doors = 0;
      tr.s = Math.max(.5, Math.min(P.len - .5, (TR.playing ? rideX(TR.t) : RIDE_X0) - RIDE.x0)); }
    return _um(dt, t);
  };
  function rideStart(){ const l = RIDE.l; if (!l) return; const P = mtPath(l), o = {}; hwAlong(P, 0, 0, o); RIDE.x0 = o.x; }
  const trainAt = () => { const l = RIDE.l, cp = l && l.train && l.train.cp && l.train.cp[1]; return cp ? { x: cp[0], y: cp[1], z: cp[2] } : { x: rideX(TR.t), y: MT_Y + .5, z: RJ*LOT }; };

  /* ---------- setup: city, cast, a warm Furnish pod, the coast, the garden, the sound ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const t0 = performance.now();
    const tick = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - t0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tick); }; tick(); });
  const wait = secs => { const t0 = performance.now(); return until(() => performance.now() - t0 >= secs*1000, secs + 5); };
  const AU = { ctx: null };
  async function sound(){
    if (CAP) return;
    const get = async u => { const r = await fetch(u); return r.arrayBuffer(); };
    AU.raw = await Promise.all([get('assets/audio/music/Bytes.mp3'), get('assets/audio/trailer/coast_flash.wav')]);
  }
  async function setup(){
    overlay(); settle();
    status('placing people');
    await until(() => typeof pplReady !== 'undefined' && pplReady && !anims.length && !(typeof LOADP !== 'undefined' && LOADP.on), 120);
    await wait(.5);
    cast(); rideStart();
    status('waking the apartment lab');
    FURN.preload();
    coastMake();
    const snd = sound().catch(e => warn('sound', e));
    await until(() => FURN.warmed(), 240);
    status('opening the apartment once');
    S.hour = 14.5; S.cycle = false;
    if (FURN.openKey(TR.c.subject.pod)){
      await until(() => document.getElementById('furnish').classList.contains('live'), 60).catch(e => warn('dry run live', e));
      await until(() => !labBusy(), 60).catch(e => warn('dry run resolve', e));
      await wait(1);
      labExit(); await until(() => !FURN.open && !FURN.hold, 20).catch(e => warn('dry run close', e)); await wait(1.5);
      if (!FURN.frame){ status('waking the apartment lab again'); FURN.preload(); await until(() => FURN.warmed() && FURN.frame, 240); }
    } else warn('dry run', 'could not open pod ' + TR.c.subject.pod);
    status('growing the coast town');
    await until(() => CO.ready, 240).catch(e => warn('coast', e));
    if (CO.ready){
      let last = -1, since = performance.now();
      await until(() => { const b = CO.w.COAST.state.built; if (b !== last){ last = b; since = performance.now(); } return performance.now() - since > 1500; }, 90).catch(e => warn('coast view', e));
      coastWake(false);
    }
    status('people coming out into the garden');
    garden();
    await until(gathered, 90).catch(e => warn('garden', e));
    await snd;
    S.hour = 6.9; safe('cam', () => camAt(0, 0));
    await wait(1.5);
    TR.ready = true;
    status(CAP ? 'ready' : 'click to play');
    if (!CAP){ TR.el.ov.classList.add('ask'); TR.el.status.innerHTML = 'click to play<br><small>' + LEN.toFixed(0) + ' s, with sound</small>'; TR.el.ov.addEventListener('click', play, { once: true }); }
    say('ready', JSON.stringify(TR.info));
  }

  /* ---------- playback ---------- */
  let t0 = 0, lastT = 0, fired = 0;
  const EV = [];
  const at = (t, f, name) => { const e = { t, f, name };   // (added while it plays: slotted in order among the moments still to come)
    if (!TR.playing){ EV.push(e); return; } let k = fired; while (k < EV.length && EV[k].t <= t) k++; EV.splice(k, 0, e); };
  function play(){
    if (TR.playing || !TR.ready) return;
    if (!CAP && AU.raw) safe('sound', () => {
      const ctx = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = ctx.createGain(); g.connect(ctx.destination);
      Promise.all(AU.raw.map(b => ctx.decodeAudioData(b.slice(0)))).then(([m, s]) => {
        const now = ctx.currentTime + .05, src = ctx.createBufferSource(), fx = ctx.createBufferSource(), gf = ctx.createGain();
        src.buffer = m; fx.buffer = s; src.connect(g); fx.connect(gf); gf.connect(g); gf.gain.value = 1.1;
        g.gain.setValueAtTime(1, now + LEN - 1.8); g.gain.linearRampToValueAtTime(0, now + LEN);
        src.start(now, 0, LEN + .2); fx.start(now + SFX_AT);
        AU.start = now; go();
      }).catch(e => { warn('sound', e); AU.ctx = null; go(); });
    }); else go();
  }
  const SFX_AT = 36.4;   // (where assets/audio/trailer/coast_flash.wav starts: tools/trailer/make_coast_sfx.py CLIP_START)
  function go(){
    TR.el.ov.classList.remove('ask'); TR.el.msg.hidden = true;
    TR.playing = true; TR.done = false; fired = 0; t0 = performance.now(); lastT = 0; TR.t = 0;
    say('rolling');
  }
  TR.play = play;
  const clock = () => AU.ctx && AU.start !== undefined ? AU.ctx.currentTime - AU.start : (performance.now() - t0)/1000;

  /* ---------- the camera: set outright every frame from the timeline ---------- */
  const CAM = { x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35, zoom: 33, pitch: 33*DEG };
  let sub = null, backFrom = null;
  const who = t => t < MK.p[1] ? 0 : t < MK.p[2] ? 1 : 2;
  const turntable = t => ({ x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35 + 1.3*ease(t/10), zoom: elerp(33, 26.5, ss(t/MK.swoop)), pitch: 33*DEG });
  const RIDE_YAW = Math.PI, RIDE_PITCH = 11*DEG, RIDE_ZOOM = 9.5;
  function camAt(t, dt){
    const c = TR.c;
    if (t < MK.swoop) Object.assign(CAM, turntable(t));
    else if (t < MK.furnBy + 1){   // the garden: the camera dives in, then moves from one person to the next (one fixed angle, clear of the buildings)
      const p = c.pairs[who(t)].A, a = turntable(MK.swoop), u = ease(seg(t, MK.swoop, MK.p[0]));
      const px = p.x ?? PARK_C.x, pz = p.z ?? PARK_C.z;
      if (!sub) sub = { x: px, z: pz };
      sub.x = follow(sub.x, px, t < MK.p[0] ? 8 : 3, dt); sub.z = follow(sub.z, pz, t < MK.p[0] ? 8 : 3, dt);
      Object.assign(CAM, { x: lerp(a.x, sub.x, u), z: lerp(a.z, sub.z, u), y: lerp(TARGET_Y, CURB + .5, u), yaw: a.yaw + wrapA(c.view.yaw - a.yaw)*u,
        zoom: elerp(a.zoom, 3.6, u), pitch: lerp(a.pitch, c.view.pitch, u) });
    }
    else if (t < MK.coastIn) { /* (the apartment covers the screen) */ }
    else if (t < MK.back){   // the ride (waiting at its start while the coast is up): from the side, the train in the middle of the frame
      const p = trainAt();
      Object.assign(CAM, { x: p.x, z: p.z, y: p.y, yaw: RIDE_YAW, zoom: RIDE_ZOOM, pitch: RIDE_PITCH });
    }
    else {   // pulling back over the dense city
      if (!backFrom) backFrom = Object.assign({}, CAM);
      const u = ease(seg(t, MK.back, MK.zoomed)), v = seg(t, MK.back, LEN);
      Object.assign(CAM, { x: lerp(backFrom.x, DENSE_C.x, u), z: lerp(backFrom.z, DENSE_C.z, u), y: lerp(backFrom.y, TARGET_Y, u),
        yaw: backFrom.yaw + .75*u + .12*v, zoom: elerp(backFrom.zoom, 30, u), pitch: lerp(backFrom.pitch/DEG, 36, u)*DEG });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // the hour: morning while the city grows, afternoon in the garden, the ride from mid-afternoon into golden hour, night behind the towers
  const hourAt = t => t < MK.swoop ? lerp(6.9, 11.0, ss(t/MK.swoop)) : t < MK.coastIn ? lerp(13.6, 14.6, seg(t, MK.swoop, MK.coastIn))
    : t < MK.wall ? lerp(15.6, 18.4, ss(seg(t, MK.ride, MK.wall - .6))) : 21.8;
  // the city's lights at the end: dark through the pull back, then they catch, stutter and come on
  const FLICK = [[0, 0], [.08, .35], [.14, 0], [.3, .55], [.36, .1], [.5, .8], [.56, .35], [.7, 1], [.78, .7], [.86, 1]];
  function lightsAt(t){
    if (t < MK.zoomed) return 0;
    const u = seg(t, MK.zoomed, MK.lit); let v = 0;
    for (const [k, a] of FLICK) if (u >= k) v = a;
    return u >= 1 ? 1 : v;
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(TR.pinRes ? (CAP ? 24 : ZOOM_REF) : z); };
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (TR.playing) safe('frame', () => {
      TR.t = Math.min(LEN, clock());
      const h = hourAt(TR.t);
      if (!CAP && Math.abs(h - S.hour) > 1e-4) window.HOUR_DRAG_AT = performance.now();
      S.hour = h;
      if (TR.t >= MK.wall) LIGHTS_ON.value = lightsAt(TR.t)*LIGHTS_GOAL;
      camAt(TR.t, dt);
    });
    return _uc(dt);
  };

  /* ---------- the timeline's moments ---------- */
  at(0, () => { S.hour = 6.9; }, 'open');
  for (const b of growPlan()) at(b.t, () => grow(b), 'build ' + b.i + ',' + b.j);
  MK.p.forEach((t0_, k) => {
    at(t0_ + .1, () => { MON.open(TR.c.pairs[k].A.id); keep(document.getElementById('monitor'), true); monTab('log'); }, 'person cam ' + (k + 1));
    [.6, 1.7, 2.8, 3.9].forEach((d, s) => at(t0_ + d, () => revealStep(k, s), 'reveal ' + (k + 1) + '.' + (s + 1)));
  });
  at(MK.leave, () => goHome(), 'heads home');
  at(MK.furnBy + .6, () => openHome(), 'apartment (latest)');
  at(MK.coastWake, () => coastWake(true), 'coast wakes');
  at(MK.coastIn, () => { if (FURN.open || FURN.hold) labExit(); for (const sc of TR.gsc || []) safe('garden end', () => STORY.endScene(sc, 'done')); }, 'apartment closes behind the coast');
  at(MK.coastOut, () => { glitchOff(); flash(.45); coastWake(false); LK.setWeather('clear', true, true); }, 'the ride');
  at(MK.end, () => { TR.playing = false; TR.done = true; say('done'); if (!CAP){ TR.el.msg.hidden = false; TR.el.status.innerHTML = 'click to play again'; TR.el.ov.classList.add('ask'); TR.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
  EV.sort((a, b) => a.t - b.t);
  function openHome(){
    if (TR.furnOpened) return; TR.furnOpened = true;
    keep(document.getElementById('monitor'), false); MON.close(); TR.el.sel.style.display = 'none';
    if (!FURN.openKey(TR.c.subject.pod)) warn('furnish', 'did not open');
    TR.info.furnAt = +TR.t.toFixed(2);
  }

  /* ---------- the overlay's moments, drawn from the clock (not CSS animations: the recorder steps time) ---------- */
  let flashA = 0, flashT = -1;
  function flash(a){ flashA = a; flashT = TR.t; }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  const hash = n => { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0)/4294967296; };
  const GLCOL = ['rgba(56,232,224,.85)', 'rgba(255,79,163,.85)', 'rgba(255,255,255,.9)', 'rgba(0,0,0,.9)', 'rgba(140,90,255,.8)'];
  let glOn = false;
  function bands(f){ const n = 3 + Math.floor(hash(f*7 + 3)*5); let y = 0, out = []; for (let k = 0; k < n && y < 100; k++){ const a = y + hash(f*11 + k)*16, b = Math.min(100, a + 4 + hash(f*13 + k)*22); out.push(`0 ${a}%,100% ${a}%,100% ${b}%,0 ${b}%`); y = b; } return out.length ? 'polygon(' + out.join(',') + ',0 100%,0 0)' : ''; }
  function glitchOff(){
    if (!glOn) return; glOn = false;
    const E = TR.el; for (const b of E.gl) b.style.display = 'none'; E.scan.style.opacity = '0';
    for (const el of [document.getElementById('view'), document.getElementById('furnish')]) if (el){ el.style.transform = ''; el.style.filter = ''; }
    if (CO.el){ CO.el.style.transform = ''; CO.el.style.filter = ''; CO.el.style.clipPath = ''; }
  }
  // the glitch into and out of the coast: the picture tears into bands, splits its colours and jumps sideways, the two worlds flickering
  function glitch(t){
    if (!CO.el) return;
    const inW = t >= MK.glIn && t < MK.coastIn, outW = t >= MK.glOut && t < MK.coastOut;
    let coast = t >= MK.coastIn && t < MK.glOut ? 1 : 0;
    if (!inW && !outW){ glitchOff(); CO.el.style.opacity = String(coast); return; }
    glOn = true;
    const f = Math.floor(t*30), E = TR.el;
    const u = inW ? seg(t, MK.glIn, MK.coastIn) : seg(t, MK.glOut, MK.coastOut);
    const g = .3 + .7*Math.sin(Math.PI*u);
    coast = inW ? (hash(f*3 + 1) < ss(u)*1.15 - .06 ? 1 : 0) : (hash(f*3 + 2) < 1 - ss(u)*1.12 ? 1 : 0);
    const jx = (hash(f*5 + 4) - .5)*110*g, split = (5 + 16*g*hash(f*5 + 6)).toFixed(1), rgb = g > .25 && hash(f*5 + 7) < .8;
    E.ro.setAttribute('dx', split); E.go.setAttribute('dx', '-' + split);
    CO.el.style.opacity = String(coast);
    CO.el.style.transform = coast ? `translateX(${jx.toFixed(1)}px)` : '';
    CO.el.style.clipPath = coast && hash(f*5 + 8) < .55 ? bands(f) : '';
    CO.el.style.filter = coast && rgb ? 'url(#trRGB) contrast(1.15)' : '';
    for (const el of [document.getElementById('view'), document.getElementById('furnish')]) if (el){
      el.style.transform = !coast ? `translateX(${(-jx*.6).toFixed(1)}px)` : '';
      el.style.filter = !coast && rgb ? 'url(#trRGB) saturate(1.3)' : ''; }
    E.gl.forEach((b, k) => {
      const on = hash(f*17 + k*3) < g*.75; b.style.display = on ? 'block' : 'none'; if (!on) return;
      b.style.top = (hash(f*19 + k)*100).toFixed(1) + '%'; b.style.height = (2 + hash(f*23 + k)*Math.max(4, 46*g)).toFixed(0) + 'px';
      b.style.background = GLCOL[Math.floor(hash(f*29 + k)*GLCOL.length)]; b.style.mixBlendMode = hash(f*31 + k) < .5 ? 'difference' : 'screen';
      b.style.transform = `translateX(${((hash(f*37 + k) - .5)*240*g).toFixed(0)}px)`; b.style.opacity = (.35 + .6*hash(f*41 + k)).toFixed(2);
    });
    E.scan.style.opacity = (.25 + .35*g).toFixed(2);
  }
  function paint(t){
    const E = TR.el;
    const wallDip = Math.max(0, 1 - Math.abs(t - MK.wall)/.16)*.65;   // (a dark beat as the towers fill the frame: day becomes night behind them)
    const black = t < .9 ? 1 - ss(t/.9) : t > LEN - .75 ? ss((t - (LEN - .75))/.75) : t > MK.logo ? .58*ss(seg(t, MK.logo, MK.logo + 1.2)) : wallDip;
    E.black.style.setProperty('opacity', String(black), 'important');
    E.flash.style.opacity = flashT >= 0 ? String(flashA*Math.max(0, 1 - (t - flashT)/.14)) : '0';
    glitch(t);
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
    if (t >= MK.p[0] && !TR.furnOpened) safe('brackets', () => brackets(TR.c.pairs[who(t)].A)); else TR.el.sel.style.display = 'none';
    if (!TR.furnOpened && t >= MK.leave + 1.5){ if (inHome()){ if (TR.inT === undefined) TR.inT = t; if (t - TR.inT > .8) openHome(); } }   // (through the door and gone, then the apartment)
    if (TR.furnOpened && t < MK.coastIn && FURN.open){ safe('lab', labClean); safe('sharp', labSharp); safe('furnish', () => labFurnish(t)); }
    if (t >= MK.coastWake && t < MK.coastOut) coastDrift(t);
    if (FURN.hold && !(TR.furnOpened && t < MK.coastIn + 1.2)) safe('furnish', () => FURN.close());
  }
  TR.start = () => { if (!TR.ready) return false; go(); return true; };
  TR.state = () => ({ ready: TR.ready, playing: TR.playing, done: TR.done, t: TR.t, stage: TR.stage, info: TR.info, log: TR.log.slice(-20) });

  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick))
      .catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); TR.failed = String(e && e.message || e); });
  });
  return TR;
})();
