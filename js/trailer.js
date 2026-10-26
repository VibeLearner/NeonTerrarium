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
  maybeSpawnMegas = () => {};   // (the opening shot's builds never bring in a megastructure of their own)
  sfx.play = () => {};   // (and make no sound: the trailer's sound is Bytes and the coast)
  const CAP = !!window.__TR_CAPTURE;   // (set by the recorder's clock shim: no click, no sound, the recorder steps the frames)
  const say = (...a) => { TR.log.push(a.join(' ')); console.log('[trailer]', ...a); };
  const warn = (what, e) => { TR.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[trailer] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };

  /* ---------- timing: Bytes runs at 160 bpm; the drop lands at 21.72 s, the lull before it starts at 19.2 s ---------- */
  const LEN = 48, BEAT = 60/160, DROP = 21.72, bar = n => DROP + n*4*BEAT;
  const MK = { swoop: 8.4, follow: 10.0, subjectOut: 7.9, monOpen: 10.15, notes: 12.35, monClose: 13.4, furn: 13.5, coastWake: 18.2, glIn: 19.0,
    coastIn: 19.45, glOut: 21.48, coastOut: DROP, clean: 20.85, cut2: bar(3), raidEarliest: 25.0, arrive: 29.5, rise: bar(8), zoomed: bar(11), lit: bar(12), logo: bar(14), end: LEN };

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

  /* ---------- the city: four sectors of 10 x 10 plots, one zone each, four plots of open sky between them ---------- */
  const N = 10;
  const SECT = [{ zone: 'low', i0: -14, j0: -14 }, { zone: 'mid', i0: 0, j0: -14 }, { zone: 'high', i0: 0, j0: 0 }, { zone: 'ind', i0: -14, j0: 0 }];
  // landmarks, each well clear of the metro: police (the person cam needs one), the Neon Dome, the Cloud Pagoda, the foundry
  const MEGAS = [['police', -14, -14, 3, 3], ['club', 5, -14, 4, 4], ['pagoda', 5, 4, 4, 5], ['foundry', -14, 3, 4, 6]];
  // the metro: one line round the inside corners of the four sectors, over the open sky between them; it starts and ends in the industrial sector
  const MT_WAY = [[-6, 0], [-6, -6], [1, -6], [1, 1], [-5, 1]], MT_STOPS = [[-5, -6], [0, -6], [1, 0]];
  const CENTER = { x: -2.5*LOT, z: -2.5*LOT };
  // the person cam's corner: a small open lawn in the residential sector with low tenements round it, so the two people are always in view
  const PARK = { i0: -10, j0: -10, n: 3, ring: 1, floors: 4 };
  const inPark = (i, j) => i >= PARK.i0 && i < PARK.i0 + PARK.n && j >= PARK.j0 && j < PARK.j0 + PARK.n;
  const nearPark = (i, j) => !inPark(i, j) && i >= PARK.i0 - PARK.ring && i < PARK.i0 + PARK.n + PARK.ring && j >= PARK.j0 - PARK.ring && j < PARK.j0 + PARK.n + PARK.ring;
  // the heist: a district of its own for the night scenes, far out of the opening shot's view. Laid out round them: a block of low
  // tenements in the middle (the safehouse is one of them), the police station just north of it, open lawns dotted through, taller buildings
  // only further out, and a metro along the south edge for the closing shot
  const HEIST = { i0: 30, j0: -12, n: 24, bi0: 34, bj0: -3, bn: 7, floors: 3 };
  const HEIST_MEGAS = [['police', 35, -6, 3, 3]];
  const HEIST_MT = [[30, 11], [53, 11]], HEIST_MT_STOPS = [[35, 11], [47, 11]], HEIST_MT2 = [[30, -12], [53, -12]], HEIST_MT2_STOPS = [[38, -12], [48, -12]];
  const HEIST_CENTER = { x: 41.5*LOT, z: -.5*LOT };
  const inHeist = (i, j) => i >= HEIST.i0 && i < HEIST.i0 + HEIST.n && j >= HEIST.j0 && j < HEIST.j0 + HEIST.n;
  const inBlock = (i, j) => i >= HEIST.bi0 && i < HEIST.bi0 + HEIST.bn && j >= HEIST.bj0 && j < HEIST.bj0 + HEIST.bn;
  function lineTiles(way){
    const t = [];
    for (let k = 0; k < way.length - 1; k++){
      const [i0, j0] = way[k], [i1, j1] = way[k + 1], di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
      let i = i0, j = j0; if (k > 0){ i += di; j += dj; }
      for (;;){ t.push({ i, j }); if (i === i1 && j === j1) break; i += di; j += dj; }
    }
    return t;
  }
  const metroTiles = () => lineTiles(MT_WAY);
  function city(){
    const R = mulberry32(20261026);
    const tiles = metroTiles(), htiles = lineTiles(HEIST_MT), htiles2 = lineTiles(HEIST_MT2), onTrack = new Set(tiles.concat(htiles, htiles2).map(t => t.i + ',' + t.j));
    const allMegas = MEGAS.concat(HEIST_MEGAS);
    const inMega = (i, j) => allMegas.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    const secs = (zone, k, mf) => { const out = []; for (let q = 0; q < k; q++) out.push(Object.assign({ zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }, mf ? { mf } : {})); return out; };
    const put = (i, j, f) => { const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some'; f(c); cells.set(ckey(i, j), c); n++; };
    let n = 0;
    for (const s of SECT) for (let i = s.i0; i < s.i0 + N; i++) for (let j = s.j0; j < s.j0 + N; j++) put(i, j, c => {
      if (onTrack.has(i + ',' + j) || inPark(i, j)) { c.green = 'grass'; return; }   // (lawns under the metro, and the person cam's lawn)
      if (inMega(i, j)) return;
      if (nearPark(i, j)){ c.sections = secs('low', 1, PARK.floors); return; }   // (low round the lawn: nothing to stand in the camera's way)
      const u = R();
      if (u < .1) c.green = 'grass';
      else c.sections = secs(s.zone, u < .58 ? 1 : u < .9 ? 2 : 3);
    });
    // the heist district: mixed, like an old neighborhood at night
    for (let i = HEIST.i0; i < HEIST.i0 + HEIST.n; i++) for (let j = HEIST.j0; j < HEIST.j0 + HEIST.n; j++) put(i, j, c => {
      if (onTrack.has(i + ',' + j)) { c.green = 'grass'; return; }
      if (inMega(i, j)) return;
      const u = R();
      if (inBlock(i, j)){ if (u < .22) c.green = 'grass'; else c.sections = secs('low', 1, HEIST.floors); return; }   // (the low middle: the camera sees over all of it)
      const far = Math.max(Math.abs(i - 37), Math.abs(j)) > 5, z = u < .42 ? 'low' : u < .78 ? 'mid' : 'high';
      if (!far){ c.sections = secs(z, 1, 5); return; }   // (a ring of mid-height round the block)
      if (R() < .05) c.green = 'grass'; else { const v = R(); c.sections = secs(z, v < .3 ? 1 : v < .75 ? 2 : 3); }   // (dense and tall further out)
    });
    for (const [kind, i, j, w, h] of allMegas){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m) warn('megastructure ' + kind, 'did not fit'); }
    const mk = (t, stops) => ({ id: mtNext++, tiles: t, done: true, st: stops.map(([i, j]) => t.findIndex(x => x.i === i && x.j === j)).filter(k => k > 0 && k < t.length - 1), sides: {} });
    const l = mk(tiles, MT_STOPS), l2 = mk(htiles, HEIST_MT_STOPS), l3 = mk(htiles2, HEIST_MT2_STOPS);
    metros.push(l, l2, l3); mtReindex();
    rebuildAll(); finishSync();
    safe('metro', () => { mtCommit(l, []); mtCommit(l2, []); mtCommit(l3, []); }); finishSync();
    TR.info.city = { plots: n, megas: megas.size, metros: metros.length };
    say('city built:', JSON.stringify(TR.info.city));
  }
  TR.city = () => safe('city', city);

  // the opening shot builds the city out: new plots grow from each sector's outer edges into the open sky (as marked on the Oct 26 still)
  // until the city fills the frame, each with the game's own build sweep, some stacked a section higher a moment later. Each sector's two
  // outer sides get a full row and part of a second
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
    ov.innerHTML = '<i id="trBlack"></i><i id="trFlash"></i><div id="trGl">' + '<b></b>'.repeat(10) + '<i></i></div>'
      + '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="trRGB" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset id="trRo" in="r" dx="6" dy="0" result="ro"/>'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="gb"/><feOffset id="trGo" in="gb" dx="-6" dy="0" result="gbo"/>'
      + '<feBlend in="ro" in2="gbo" mode="screen"/></filter></svg>'
      + '<div id="trLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b></div><div id="trMsg"><b>Trailer</b><span id="trStatus">building the city</span></div>';
    document.body.appendChild(ov);
    TR.el = { ov, black: ov.querySelector('#trBlack'), flash: ov.querySelector('#trFlash'), logo: ov.querySelector('#trLogo'),
      w1: ov.querySelector('.w1'), gl: [...ov.querySelectorAll('#trGl b')], scan: ov.querySelector('#trGl i'), ro: ov.querySelector('#trRo'), go: ov.querySelector('#trGo'), w2: ov.querySelector('.w2'), msg: ov.querySelector('#trMsg'), status: ov.querySelector('#trStatus') };
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
  const resCell = c => c && inSector(c, 'low') && !c.mega && c.sections.length;
  const placeOf = c => places.get('c:' + c.i + ',' + c.j);
  function cast(){
    const pol = megasOfKind('police').find(m => inHeist(m.i, m.j)); if (!pol) throw new Error('no police station in the heist district');
    const station = places.get('m:' + pol.id), sDoor = doorOf(station); if (!sDoor) throw new Error('the station has no street door');
    const blockCell = c => c && inBlock(c.i, c.j) && !c.mega && c.sections.length;
    // the safehouse, in the heist district's low block: a building with a neighbor whose door opens on another street (the crew slip out
    // that way while the officers come to the front). Straight behind with its door facing the other way is best
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = null;
    for (const c of cells.values()){
      if (!blockCell(c)) continue;
      const pl = placeOf(c), d = doorOf(pl); if (!d) continue;
      const sd = nearDoor(station, d), pts = sd && route(sd.node, d.node); if (!pts) continue;
      const L = pathLen(pts); if (L < 1 || L > 10) continue;
      const n = outward(d);
      for (const [di, dj] of N4){
        const bc = cells.get(ckey(c.i + di, c.j + dj)); if (!blockCell(bc)) continue;
        const bpl = placeOf(bc), bd = doorOf(bpl); if (!bd) continue;
        const bn = outward(bd), dot = n.x*bn.x + n.z*bn.z, apart = Math.hypot(bd.wall.x - d.wall.x, bd.wall.z - d.wall.z);
        if (dot > .3 || apart < 2.5) continue;
        const behind = di === -Math.round(n.x) && dj === -Math.round(n.z);
        const score = Math.abs(L - 3) + (dot + 1)*2 + (behind ? 0 : 1.5);
        if (!best || score < best.score) best = { c, pl, d, L, sd, bpl, bd, score };
      }
    }
    if (!best){
      warn('safehouse', 'no building with a back way out: the crew use the front door');
      for (const c of cells.values()){
        if (!blockCell(c)) continue;
        const pl = placeOf(c), d = doorOf(pl); if (!d) continue;
        const sd = nearDoor(station, d), pts = sd && route(sd.node, d.node); if (!pts) continue;
        const L = pathLen(pts), score = Math.abs(L - 3);
        if (L > 1 && L < 10 && (!best || score < best.score)) best = { c, pl, d, L, sd, bpl: pl, bd: d, score };
      }
    }
    if (!best) throw new Error('no safehouse in the heist district');
    const sh = best.pl, shDoor = best.d, out = outward(shDoor), bk = best.bpl, bkDoor = best.bd, bkOut = outward(bkDoor);
    // where the crew walks off to: a street point in the district away from the back door, the front and the station
    let away = null;
    for (let n = 0; n < NG.x.length; n++){
      const x = NG.x[n], z = NG.z[n]; if (!inHeist(Math.round(x/LOT), Math.round(z/LOT))) continue;
      const dd = Math.hypot(x - bkDoor.wall.x, z - bkDoor.wall.z); if (dd < 6 || dd > 10) continue;
      const fromSt = Math.min(Math.hypot(x - sDoor.wall.x, z - sDoor.wall.z), Math.hypot(x - shDoor.wall.x, z - shDoor.wall.z)), pts = route(bkDoor.node, n); if (!pts) continue;
      const L = pathLen(pts); if (L > 13) continue;
      const score = fromSt - L*.4; if (!away || score > away.score) away = { n, x, z, score };
    }
    if (!away) throw new Error('nowhere for the crew to go');
    const used = new Set();
    const free = p => p && !p.cop && !p.guard && !p.visitor && !p.archivist && !p.onBike && !used.has(p.id);
    const homeCell = p => cellOf(p.home);
    // the person cam: two neighbors from the low tenements round the lawn meet in the middle of it
    const mx = (PARK.i0 + (PARK.n - 1)/2)*LOT, mz = (PARK.j0 + (PARK.n - 1)/2)*LOT, mn = STORY.nearestNode(mx, mz);
    const ringer = p => { const c = homeCell(p); return c && nearPark(c.i, c.j) && c.sections.length; };
    const byDist = list => list.map(p => ({ p, d: (() => { const d = doorOf(places.get(p.home)); return d ? Math.hypot(d.wall.x - NG.x[mn], d.wall.z - NG.z[mn]) : 1e9; })() })).sort((a, b) => a.d - b.d).map(x => x.p);
    const subject = byDist(pplList.filter(p => free(p) && p.pod && ringer(p)))[0] || byDist(pplList.filter(p => free(p) && p.pod && resCell(homeCell(p))))[0];   // (round the lawn if one there has a pod; else the nearest who does)
    if (!subject) throw new Error('no resident with a pod round the lawn');
    used.add(subject.id);
    const friend = byDist(pplList.filter(p => free(p) && ringer(p) && p.home !== subject.home))[0] || byDist(pplList.filter(p => free(p) && ringer(p)))[0];
    if (!friend) throw new Error('no neighbor round the lawn');
    used.add(friend.id);
    const view = pickView([at3(NG.x[mn], NG.z[mn]), at3(NG.x[mn] + .6, NG.z[mn]), at3(NG.x[mn] - .6, NG.z[mn]), at3(NG.x[mn], NG.z[mn] + .6), at3(NG.x[mn], NG.z[mn] - .6)], 1.65, 32, null, 70, 16);
    const walkT = q => { const d = doorOf(places.get(q.home)), pts = d && route(d.node, mn); return pts ? (pathLen(pts) + 1.2)/PPL_SPEED + 1.0 : 6; };
    // the crew: five from the residential sector (they are brought over to the district for the night)
    const crew = pplList.filter(p => free(p) && p.home && resCell(homeCell(p))).slice(0, 5);
    if (crew.length < 2) throw new Error('not enough people for the cleanout');
    crew.forEach(p => used.add(p.id));
    // four officers from the district's station (spire guards excluded)
    const okCop = p => p.cop && !p.guard && !p.custody;
    let cops = pplList.filter(p => okCop(p) && p.job === station.id && !p.onBike);
    if (cops.length < 4) cops = cops.concat(pplList.filter(p => okCop(p) && p.job === station.id && !cops.includes(p)), pplList.filter(p => okCop(p) && p.job !== station.id && !cops.includes(p)));
    cops = cops.slice(0, 4);
    if (cops.length < 2) throw new Error('not enough officers');
    TR.c = { station, sDoor, sh, shDoor, out, bk, bkDoor, bkOut, away, subject, friend, home: places.get(subject.home),
      meet: { n: mn, x: NG.x[mn], z: NG.z[mn], view, walk: Math.max(walkT(subject), walkT(friend)) }, crew, cops, raidLen: best.L };
    TR.info.cast = { safehouse: sh.id, backWay: bk.id, raidWalk: +best.L.toFixed(2), subject: subject.id, friend: friend.id, pod: subject.pod,
      meetPitch: +(view.pitch/DEG).toFixed(1), meetWalk: +TR.c.meet.walk.toFixed(1), crew: crew.length, cops: cops.length };
    say('cast:', JSON.stringify(TR.info.cast));
  }

  /* ---------- the person cam: what the camera picks up from their conversation ---------- */
  function reveal(c, tmpl, fact, channel = 'document', ctx = {}){
    const id = c.A, learned = STORY.learnFrom(tmpl, c, new Set(Object.keys(c)), channel, null, ctx);
    if (typeof PACE !== 'undefined') PACE.mine = true;
    try { STORY.logLine(tmpl, c, ctx, 'reveal', { channel, fact: 'A.' + fact, paced: true }); } finally { if (typeof PACE !== 'undefined') PACE.mine = false; }
    STORY.note(id, { t: STORY.clock, who: id, fact: 'A.' + fact, channel, verified: channel === 'document' || channel === 'introduction', tmpl, cast: c, ctx, learned });
    if (typeof MON !== 'undefined') MON.refresh();
  }
  function revealStep(k){
    const p = TR.c.subject, c = { A: p.id, B: TR.c.friend.id };
    const job = safe('job', () => STORY.JOB_WORD[STORY.jobKind(p)]) || 'line worker';
    const emp = safe('employer', () => STORY.employerName(p)) || 'the night market';
    const floor = +((p.pod || '').split('|')[2] || 0) + 1, nth = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][floor - 1] || floor + 'th';
    [() => reveal(c, '{B} waves {A} down across the street: "{A.first}!"', 'first-name', 'introduction'),
     () => reveal(c, '{A} tells {B} the shift at ' + emp + ' ran long again.', 'employer'),
     () => reveal(c, '{B} asks how a ' + job + ' ever gets an evening off. {A} laughs.', 'job'),
     () => reveal(c, '{A} points up at {place}. Home: the ' + nth + ' floor.', 'home', 'document', { placeId: p.home }),
     () => reveal(c, '{A} and {B}, same corner, same hour. {seen} evenings running.', 'habit', 'seen', { seen: 6 })][k]();
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
  // two pieces of furniture held back while the room resolves, then set down one after the other: dropped in from above, a little bounce as they land
  const DROPS = { list: null, t0: null, done: false };
  const NOT_FURN = /wall|window|door|floor|tile|ceiling|skirting|trim|curtain|blind|rail|pipe|vent|socket|switch|outlet|frame/i;
  function labDrops(t){
    const w = labWin(), B = w && w.PodBuilder && w.PodBuilder._B; if (!B || !B.inst || !B.inst.size) return;
    if (!document.getElementById('furnish').classList.contains('live')) return;   // (this open's room, not the warm-up's)
    if (DROPS.list && DROPS.list.some(d => B.inst.get(d.i.rec && d.i.rec.id) !== d.i)) DROPS.list = null;   // (the room swapped its pieces while it loaded: pick again)
    if (!DROPS.list){
      const cand = [];
      for (const i of B.inst.values()){
        if (!i.pivot || !i.lbox || (i.rec && i.rec.parent) || (i.pivot.userData && i.pivot.userData.window) || i.kind === 'wall' || NOT_FURN.test(i.name || '')) continue;
        const sx = i.lbox.max.x - i.lbox.min.x, sy = i.lbox.max.y - i.lbox.min.y, sz = i.lbox.max.z - i.lbox.min.z, a = sx*sz;
        if (a < .12 || a > 3.2 || sy < .25 || (i.rec && i.rec.wh)) continue;   // (standing on the floor, not too small to see nor the size of the room)
        cand.push({ i, a: a*Math.min(1.4, sy) });
      }
      cand.sort((x, y) => y.a - x.a);
      if (!cand.length) return;
      DROPS.list = cand.slice(0, 2).map(c => ({ i: c.i, y: c.i.pivot.position.y }));
      for (const d of DROPS.list) d.i.pivot.visible = false;
      TR.info.drops = DROPS.list.map(d => d.i.name || d.i.kind);
    }
    if (DROPS.t0 === null && !labBusy()) DROPS.t0 = Math.min(Math.max(t + .35, MK.furn + 3.4), 18.35);   // (once the room is up; never so late it's missed)
    if (DROPS.t0 === null) return;
    DROPS.list.forEach((d, k) => {
      const u = (t - (DROPS.t0 + k*.55))/.6; if (u < 0){ d.i.pivot.visible = false; return; }
      d.i.pivot.visible = true;
      const v = Math.min(1, u), fall = 1 - v*v, bounce = v < 1 ? 0 : Math.max(0, Math.sin(Math.min(1, (u - 1)/.35)*Math.PI))*.06*Math.max(0, 1 - (u - 1)/.35);
      d.i.pivot.position.y = d.y + 1.6*fall + bounce;
    });
    B.needs = true;
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
      CO.paused = false;   // (it draws while the town goes up and its view streams in; setup rests it once that's done)
      // nothing the trailer builds on the coast is kept: the frame's own saves of the coast are dropped
      const sp = w.Storage.prototype, os = sp.setItem, orm = sp.removeItem;
      sp.setItem = function (k, v){ if (this === w.localStorage && /^neonIsland\./.test(k)) return; return os.call(this, k, v); };
      sp.removeItem = function (k){ if (this === w.localStorage && /^neonIsland\./.test(k)) return; return orm.call(this, k); };
      // the coast's own soundtrack stays silent: the trailer has Bytes and its own waves. (COASTMUSIC is a top-level const in the frame, not a
      // window property, so it is reached through the frame's eval; and every later play() in that page is turned into a silent no-op)
      w.HTMLMediaElement.prototype.play = function (){ this.muted = true; try { this.pause(); } catch (e) {} return Promise.resolve(); };
      const mute = () => { try { const el = w.eval('typeof COASTMUSIC !== "undefined" && COASTMUSIC.el'); if (el){ el.muted = true; el.volume = 0; el.pause(); } } catch (e) {}
        for (const m of w.document.querySelectorAll('audio,video')){ m.muted = true; try { m.pause(); } catch (e) {} } };
      mute(); CO.muteT = setInterval(mute, 250);
      const town = coastTown(w);
      w.COAST.setHour(12);   // (midday)
      CO.yaw = Math.PI*3/4 - .25; CO.zoom = 60; CO.x = town.x; CO.z = town.z;   // (as far out as the coast's camera goes: the whole town in view)
      w.COAST.go({ yaw: CO.yaw, zoom: CO.zoom, pitch: 35*DEG, x: CO.x, z: CO.z });
      setTimeout(restore, 3000); restore();
      CO.ready = true; say('coast ready');
    }));
  }
  // a large town along the coast that feels grown rather than planned: it fills the band of land behind the cliff right across the frame
  // (the camera is at the coast's farthest zoom), in villages that run into each other with fields and gaps between. Near the cliff: houses,
  // villas and shops; further in: houses thinning into farms. Pieces are turned every which way and some stacked a level or two; the coast's own
  // placement check keeps them off the edge, the slopes and each other
  function coastTown(w){
    const C = w.COAST, R = mulberry32(4242);
    try { C.clear(); } catch (e) {}
    try { C.setPaths([]); } catch (e) {}
    const K = { res: ['townhouse', 'tower', 'pods', 'villa', 'pagoda', 'terrace'], com: ['noodle', 'lantern', 'kiosk', 'rotunda', 'viaduct'],
      lux: ['mansion', 'dometower', 'cornerhouse', 'arcvilla', 'pagodatower', 'poolvilla'], farm: ['turbine', 'field', 'dome', 'tunnels', 'barn', 'hive', 'vfarm'],
      solo: ['grotto', 'ringcourt', 'lagoon', 'palace', 'orangery'] };
    const one = a => a[Math.floor(R()*a.length)];
    // smooth value noise for where the villages are thick and where the fields open up
    const nz = (x, z) => { const f = (a, b) => { const h = Math.sin(a*127.1 + b*311.7)*43758.5453; return h - Math.floor(h); };
      const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf*xf*(3 - 2*xf), v = zf*zf*(3 - 2*zf);
      return (f(xi, zi)*(1 - u) + f(xi + 1, zi)*u)*(1 - v) + (f(xi, zi + 1)*(1 - u) + f(xi + 1, zi + 1)*u)*v; };
    const CZ = -4, ZR = 105, DEPTH = 50, TARGET = 520;
    const placed = []; let tries = 0, sx = 0, sz = 0, solos = 0;
    while (placed.length < TARGET && tries < 7000){
      tries++;
      const z = CZ + (R()*2 - 1)*ZR, d = Math.pow(R(), 1.25)*DEPTH, x = 3 - d;   // (x: inland from about the cliff; the check refuses anything over the edge)
      const dense = nz(x/14 + 3, z/14 + 7)*.75 + nz(x/5 + 11, z/5 + 2)*.25;
      if (R() > .25 + .9*dense - d/DEPTH*.35) continue;   // (villages and gaps; thinner inland)
      let kind;
      if (d > 30) kind = R() < .55 ? one(K.farm) : one(K.res);
      else if (d > 14) kind = R() < .7 ? one(K.res) : one(K.com);
      else { const u = R(); kind = u < .4 ? one(K.res) : u < .7 ? one(K.lux) : one(K.com); }
      if (solos < 6 && R() < .015){ kind = K.solo[solos % K.solo.length]; solos++; }
      const rot = Math.floor(R()*8)*Math.PI/4 + (R() - .5)*.35, seed = 1 + Math.floor(R()*99999);
      let pc = null; try { pc = C.place(kind, x, z, rot, seed); } catch (e) { pc = null; }
      if (!pc || pc.ok === false) continue;
      placed.push(pc); sx += x; sz += z;
      const up = K.lux.includes(kind) ? .4 : K.res.includes(kind) ? .35 : K.com.includes(kind) ? .2 : 0;
      if (R() < up) try {
        const grp = K.lux.includes(kind) ? K.lux : K.res, s1 = C.stack(pc, one(grp), 1 + Math.floor(R()*99999));
        if (s1 && R() < .3) C.stack(s1, one(grp), 1 + Math.floor(R()*99999));
      } catch (e) {}
    }
    TR.info.coastTown = placed.length;
    say('coast town:', placed.length, 'pieces from', tries, 'tries');
    return { x: -20, z: CZ };
  }
  function coastWake(on){ CO.paused = !on; if (on) for (const fn of CO.pend.splice(0)) CO.raf(fn); }
  function coastDrift(t){
    if (!CO.ready || !CO.w || !CO.w.COAST) return;
    const u = seg(t, MK.coastWake, MK.coastOut);
    CO.w.COAST.go({ yaw: CO.yaw + .14*u, zoom: CO.zoom, pitch: 35*DEG, x: CO.x, z: CO.z });
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
    if (CO.ready){   // (its whole view, at full zoom-out, streamed in before it rests: no pieces popping in on screen)
      let last = -1, since = performance.now();
      await until(() => { const b = CO.w.COAST.state.built; if (b !== last){ last = b; since = performance.now(); } return performance.now() - since > 1500; }, 60).catch(e => warn('coast view', e));
      coastWake(false);
    }
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
  const at = (t, f, name) => { const e = { t, f, name };   // (added while it plays: slotted in order among the moments still to come)
    if (!TR.playing){ EV.push(e); return; } let k = fired; while (k < EV.length && EV[k].t <= t) k++; EV.splice(k, 0, e); };
  function play(){
    if (TR.playing || !TR.ready) return;
    if (!CAP && AU.raw) safe('sound', () => {
      const ctx = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = ctx.createGain(); g.connect(ctx.destination);
      Promise.all(AU.raw.map(b => ctx.decodeAudioData(b.slice(0)))).then(([m, s]) => {
        const now = ctx.currentTime + .05, src = ctx.createBufferSource(), fx = ctx.createBufferSource(), gf = ctx.createGain();
        src.buffer = m; fx.buffer = s; src.connect(g); fx.connect(gf); gf.connect(g); gf.gain.value = .9;
        g.gain.setValueAtTime(1, now + LEN - 1.8); g.gain.linearRampToValueAtTime(0, now + LEN);
        src.start(now, 0, LEN + .2); fx.start(now + 19.0);
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

  /* ---------- sight lines: the close-ups swing round or tilt up until nothing stands between the camera and the people ---------- */
  const hAt = (x, z) => { const i = Math.round(x/LOT), j = Math.round(z/LOT), c = cells.get(ckey(i, j)); if (!c) return 0;
    if (!c.mega && (Math.abs(x - i*LOT) > LOT*.37 || Math.abs(z - j*LOT) > LOT*.37)) return 0;   // (the lanes between plots are open)
    return hwSurface(c); };
  function los(x, y, z, yw, pt){
    const cp = Math.cos(pt), dx = Math.sin(yw)*cp, dy = Math.sin(pt), dz = Math.cos(yw)*cp;
    for (let s = .3; s < 120; s += .25){
      const yy = y + dy*s; if (yy > 52) return true;
      const px = x + dx*s, pz = z + dz*s, h = hAt(px, pz);
      if (h > CURB + .05 && yy < h - .08) return false;
      if (yy > MT_Y - .6 && yy < MT_Y + .4 && mtAt(Math.round(px/LOT), Math.round(pz/LOT)).length) return false;   // (the metro deck)
    }
    return true;
  }
  const DK = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8];
  function pickView(pts, pref, pmin, keep, pmax = 76, dkN = 16){
    const ok = (yw, pt) => pts.every(p => los(p.x, p.y, p.z, yw, pt));
    const P = []; for (let d = pmin; d < Math.min(74, pmax); d += 6) P.push(d*DEG); if (pmax >= 76) P.push(76*DEG);
    if (keep){ for (const pt of P){ if (pt > keep.pitch + 1e-3) break; if (ok(keep.yaw, pt)) return { yaw: keep.yaw, pitch: pt }; } if (ok(keep.yaw, keep.pitch)) return keep; }
    for (const pt of P) for (const dk of DK.slice(0, dkN)){ const yw = pref + dk*Math.PI/8; if (ok(yw, pt)) return { yaw: yw, pitch: pt }; }
    return { yaw: pref, pitch: 76*DEG };
  }
  const VW = { on: false, yaw: 0, pitch: 0, t: null, chk: 0 };
  const resetView = () => { VW.on = false; VW.t = null; VW.chk = 0; };
  function aimAt(pts, pref, pmin, dt, k = 2.4){
    VW.chk -= dt;
    if (!VW.t || VW.chk <= 0){ VW.chk = .25; VW.t = pickView(pts, pref, pmin, VW.t); }
    if (!VW.on){ VW.on = true; VW.yaw = VW.t.yaw; VW.pitch = VW.t.pitch; }
    const a = 1 - Math.exp(-k*dt); VW.yaw += wrapA(VW.t.yaw - VW.yaw)*a; VW.pitch += (VW.t.pitch - VW.pitch)*a;
  }
  const at3 = (x, z, y = CURB + .45) => ({ x, y, z });
  function ahead(p, k){ const L = Math.hypot(p.dx || 0, p.dz || 0) || 1; return at3(p.x + (p.dx || 0)/L*k, p.z + (p.dz || 0)/L*k); }

  /* ---------- the camera: set outright every frame from the timeline (no easing of its own) ---------- */
  const CAM = { x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35, zoom: 33, pitch: 33*DEG };
  let sub = null, subYaw = null, grp = null, cutYaw = null, raidYaw = null, riseFrom = null, shot = '';
  const outside = p => p && p.x !== undefined && (!!p.walk || !!(p.sc && p.sc.mode === 'out'));   // (out on the street, not behind a door)
  const centroid = list => { let x = 0, z = 0, n = 0; for (const p of list) if (p && p.x !== undefined){ x += p.x; z += p.z; n++; } return n ? { x: x/n, z: z/n } : null; };
  const turntable = t => ({ x: CENTER.x, z: CENTER.z, y: TARGET_Y, yaw: .35 + 1.3*ease(t/10), zoom: elerp(33, 26.5, ss(t/MK.swoop)), pitch: 33*DEG });
  function camAt(t, dt){
    const c = TR.c;
    if (t < MK.swoop){ Object.assign(CAM, turntable(t)); }
    else if (t < MK.follow){   // the dive onto the street corner where the two of them meet
      const a = turntable(MK.swoop), m = c.meet, u = ease(seg(t, MK.swoop, MK.follow));
      Object.assign(CAM, { x: lerp(a.x, m.x, u), z: lerp(a.z, m.z, u), y: lerp(TARGET_Y, CURB + .5, u), yaw: a.yaw + wrapA(m.view.yaw - a.yaw)*u,
        zoom: elerp(a.zoom, 4.2, u), pitch: lerp(a.pitch, m.view.pitch, u) });
    }
    else if (t < MK.coastIn){   // the two of them talking (the apartment covers the screen from 13.5 s)
      const m = c.meet, u = seg(t, MK.follow, MK.furn), cc = centroid([c.subject, c.friend].filter(outside));
      if (!sub) sub = { x: m.x, z: m.z };
      if (cc){ sub.x = follow(sub.x, cc.x, 1.5, dt); sub.z = follow(sub.z, cc.z, 1.5, dt); }
      Object.assign(CAM, { x: sub.x, z: sub.z, y: CURB + .5, yaw: m.view.yaw + .08*u, zoom: lerp(4.2, 3.7, ss(u)), pitch: m.view.pitch });
    }
    else if (t < MK.cut2){   // the safehouse's back way out, then the crew walking off
      const d = c.bkDoor, o = c.bkOut, door = { x: d.wall.x + o.x*1.2, z: d.wall.z + o.z*1.2 };
      if (cutYaw === null){ grp = { x: door.x, z: door.z }; cutYaw = Math.atan2(o.x, o.z) + .5; resetView(); }
      const vis = c.crew.filter(outside), cc = t > MK.coastOut + .4 && vis.length ? centroid(vis) : null;
      if (cc){ grp.x = follow(grp.x, cc.x, 2.6, dt); grp.z = follow(grp.z, cc.z, 2.6, dt); }
      aimAt(cc ? [at3(door.x, door.z), at3(cc.x, cc.z)] : [at3(door.x, door.z)], cutYaw, 28, dt);
      const u = seg(t, MK.coastOut, MK.cut2);
      Object.assign(CAM, { x: grp.x, z: grp.z, y: CURB + .55, yaw: VW.yaw + .14*u, zoom: lerp(5.0, 6.4, ss(u)), pitch: VW.pitch });
    }
    else if (t < MK.rise){   // the officers walk up, knock, go in, come out
      const d = c.shDoor, door = { x: d.wall.x + c.out.x*.9, z: d.wall.z + c.out.z*.9 };
      if (raidYaw === null){ raidYaw = Math.atan2(c.out.x, c.out.z) - .55; grp = null; resetView(); }
      const there = t > MK.arrive - .3, cc = there ? door : centroid(c.cops.filter(outside)) || door;
      if (!grp) grp = { x: cc.x, z: cc.z };
      grp.x = follow(grp.x, cc.x, there ? 2 : 4, dt); grp.z = follow(grp.z, cc.z, there ? 2 : 4, dt);
      const cops = c.cops.filter(outside), cc2 = centroid(cops);
      aimAt(cc2 ? [at3(door.x, door.z), at3(cc2.x, cc2.z)] : [at3(door.x, door.z)], raidYaw, 28, dt);
      const u = seg(t, MK.cut2, MK.rise);
      Object.assign(CAM, { x: grp.x, z: grp.z, y: CURB + .55, yaw: VW.yaw - .08*u, zoom: lerp(5.6, 5.0, ss(u)), pitch: VW.pitch });
    }
    else {   // the rise over the whole city at night
      if (!riseFrom) riseFrom = Object.assign({}, CAM);
      const u = ease(seg(t, MK.rise, MK.zoomed)), v = seg(t, MK.rise, LEN);
      Object.assign(CAM, { x: lerp(riseFrom.x, HEIST_CENTER.x, u), z: lerp(riseFrom.z, HEIST_CENTER.z, u), y: lerp(riseFrom.y, TARGET_Y, u),
        yaw: riseFrom.yaw + .75*u + .16*v, zoom: elerp(riseFrom.zoom, 33, u), pitch: lerp(riseFrom.pitch/DEG, 36, u)*DEG });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  // the city's lights at the end: they go out as the camera starts to rise, stay dark while it pulls back, then catch, stutter and come on
  const FLICK = [[0, 0], [.08, .35], [.14, 0], [.3, .55], [.36, .1], [.5, .8], [.56, .35], [.7, 1], [.78, .7], [.86, 1]];
  function lightsAt(t){
    if (t < MK.zoomed) return 1 - ss(seg(t, MK.rise, MK.rise + .45));
    const u = seg(t, MK.zoomed, MK.lit); let v = 0;
    for (let k = 0; k < FLICK.length; k++){ if (u >= FLICK[k][0]) v = FLICK[k][1]; }
    return u >= 1 ? 1 : v;
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
      if (TR.t >= MK.rise) LIGHTS_ON.value = lightsAt(TR.t)*LIGHTS_GOAL;
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
  function meetScene(){
    const c = TR.c, anc = { kind: 'point', x: NG.x[c.meet.n], z: NG.z[c.meet.n], node: c.meet.n };
    for (const p of [c.subject, c.friend]){ p.speed = PPL_SPEED; p.hurry = false; }
    TR.meetSc = scene('trailer.meet', { A: c.subject.id, B: c.friend.id }, [
      { id: 'm0', who: ['A', 'B'], with: [], at: 'case', do: 'walk', anc, hold: .2 },
      { id: 'm1', who: ['B'], with: ['A'], at: 'case', do: 'wave', anc, hold: .9 },
      { id: 'm2', who: ['A'], with: ['B'], at: 'case', do: 'chat', anc, hold: 60 }],
      { m0: ['{A} and {B} come out onto the same corner.'], m1: ['{B} waves {A} over.'], m2: ['{A} and {B} talk on the corner.'] });
  }
  function stageNight(){
    const c = TR.c;
    for (const p of c.crew){ putInside(p, c.bk.id); dry(p); p.speed = PPL_SPEED; }
    for (const p of c.cops){ putInside(p, c.station.id); p.speed = PPL_SPEED; }
  }
  function cleanout(){
    const c = TR.c, L = 'ABCDE', m = {}; c.crew.forEach((p, k) => { m[L[k]] = p.id; });
    const front = ptAnc(c.bkDoor.wall.x + c.bkOut.x*1.4, c.bkDoor.wall.z + c.bkOut.z*1.4), off = ptAnc(c.away.x, c.away.z);
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
  at(0, () => { for (const p of [TR.c.subject, TR.c.friend]) putInside(p, p.home); }, 'the two at home');
  for (const b of growPlan()) at(b.t, () => grow(b), 'build ' + b.i + ',' + b.j);
  at(-1, () => meetScene(), 'meet');   // (its time is worked out from their walks: see timeRaid)
  at(MK.monOpen, () => { MON.open(TR.c.subject.id); keep(document.getElementById('monitor'), true); keep(document.getElementById('npcSel'), true); monTab('log'); }, 'person cam');
  [10.5, 10.95, 11.4, 11.85].forEach((t, k) => at(t, () => revealStep(k), 'reveal ' + k));
  at(MK.notes, () => monTab('notes'), 'notebook');
  at(12.85, () => revealStep(4), 'reveal 4');
  at(MK.monClose, () => { keep(document.getElementById('monitor'), false); keep(document.getElementById('npcSel'), false); MON.close(); }, 'cam off');
  at(MK.furn, () => { if (!FURN.openKey(TR.c.subject.pod)) warn('furnish', 'did not open'); }, 'furnish');
  at(MK.coastWake, () => coastWake(true), 'coast wakes');
  at(MK.coastIn, () => { if (TR.meetSc) safe('meet end', () => STORY.endScene(TR.meetSc, 'done')); if (FURN.open || FURN.hold) labExit(); LK.setWeather('rain', true, true); stageNight(); }, 'night falls behind the coast');
  at(MK.clean, () => cleanout(), 'cleanout');
  at(MK.coastOut, () => { glitchOff(); flash(.45); coastWake(false); }, 'drop');
  at(-1, () => raid(), 'raid');   // (its time is worked out from the walk: see setup)
  at(MK.end, () => { TR.playing = false; TR.done = true; say('done'); if (!CAP){ TR.el.msg.hidden = false; TR.el.status.innerHTML = 'click to play again'; TR.el.ov.classList.add('ask'); TR.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
  function timeRaid(){   // leave the station so the four reach the door at MK.arrive (hurried walk, plus the two doorways)
    const v = PPL_SPEED*2.3, walk = (TR.c.raidLen + 1.2)/v + 1.0, e = EV.find(x => x.name === 'raid');
    e.t = Math.max(MK.raidEarliest, MK.arrive - walk); TR.info.raidAt = +e.t.toFixed(2);
    const em = EV.find(x => x.name === 'meet'); em.t = Math.max(.3, 9.3 - TR.c.meet.walk); TR.info.meetAt = +em.t.toFixed(2);   // (both on the corner by the time the camera gets there)
    EV.sort((a, b) => a.t - b.t);
  }

  /* ---------- the overlay's moments, drawn from the clock (not CSS animations: the recorder steps time) ---------- */
  let flashA = 0, flashT = -1;
  function flash(a){ flashA = a; flashT = TR.t; }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  // the glitch into and out of the coast: the picture tears into bands, splits its colours and jumps sideways, the two worlds flickering
  // between each other, ten bars of noise and scanlines over it; it changes 30 times a second (a hash of the frame, the same every run)
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
    const black = t < .9 ? 1 - ss(t/.9) : t > LEN - .75 ? ss((t - (LEN - .75))/.75) : t > MK.logo ? .58*ss(seg(t, MK.logo, MK.logo + 1.2)) : 0;
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
    if (TR.raidSc && TR.raidSc.phase && t > MK.arrive){ const k = TR.raidSc.beatIx ?? TR.raidSc.k ?? TR.raidSc.i, b = TR.raidSc.b || (typeof k === 'number' && TR.raidSc.s.beats[k]);
      const A = TR.cops && TR.cops[0]; if (A && !A.held && b && b.id === 'r4') A.held = PG.heldPick('crate', '', A.id); }
    if (t >= MK.furn && t < MK.coastIn && FURN.open){ safe('lab', labClean); safe('orbit', () => labOrbit(dt)); safe('drops', () => labDrops(t)); }
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
