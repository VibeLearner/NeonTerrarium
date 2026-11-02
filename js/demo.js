// Neon Terrarium: the 15 second demo clip. Open the game with ?full#demo at the end of the address and it builds its own night city, then plays
// a scripted, captioned clip of the game being played (tools/demo/record.py films it at 1920 x 1080, 60 fps, and records the game's own sound):
//
//   0.0   building, up close: a cursor picks zones and places buildings round a plaza, the last a floor on a tenement there
//   2.6   the person cam on someone who lives in that tenement, their log filling in, and in through their front door
//   ~4.2  the hologram into their apartment (Furnish pod), furnished by the game from who lives there: the Plants catalog opened,
//         a bonsai set on their table, its color changed in the piece's color menu, then Exit and the game's own power-down
//   ~8.3  a pan to the Grid, a double click, the Acoustic Panel: the Booth loop that has been playing all along, two notes missing
//         from its first bar. Both are drawn in and play on the very next pass, and the panel closes with the music going on
//   ~11   the camera pulls out over the whole city at night and the title comes on
//
// The music is the game's: a Booth loop broadcast on the Grid from the first frame (the recorder records the game's own audio
// in a second, real-time pass). Nothing is saved and none of the player's own city or settings are read (saveguard.js, NT_DEMO).
'use strict';
const DEMO = (() => {
  const D = { on: !!window.NT_DEMO, ready: false, playing: false, done: false, t: -1, stage: 'off', log: [], info: {}, sfx: [], len: 15 };
  if (!D.on) return D;
  const CAP = !!window.__TR_CAPTURE, AUTO = !!window.__DM_AUDIO;   // (the video pass steps the clock; the audio pass plays in real time and starts by itself)
  const say = (...a) => { D.log.push(a.join(' ')); console.log('[demo]', ...a); };
  const warn = (what, e) => { D.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[demo] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };
  maybeSpawnMegas = () => {};   // (nothing arrives unasked)

  /* ---------- the plan ---------- */
  // every time is fixed, so the picture and the music (recorded in a separate pass) line up; the furnishing fits into however much of
  // MK.room to MK.exit the room is ready for
  const MK = { build: 0, person: 2.6, enter: 2.75, furn: 4.2, room: 5.25, exit: 7.75, grid: 8.4, panel: 8.95, note1: 9.65, note2: 10.05, close: 10.85, out: 11.0, title: 12.6, end: 15 };
  const CAPS = [
    [.2, 2.4, 'Build it block by block'],
    [2.85, 4.1, 'Follow anyone home'],
    [5.35, 7.6, 'Furnish every apartment'],
    [9.1, 10.75, 'Finish the song the city hears'],
  ];
  // the Booth loop the Grid broadcasts: 4 bars at 100 BPM (9.6 s a pass), a melody on the magic keys (pads 0 to 11, always in the chord),
  // its first bar missing two notes. The pass that starts at 9.68 s is the first with them: they are drawn in just before it
  const BPM = 100, BEAT = 60/BPM, LOOP_LEN = 4, LOOP_ID = 'Ldemo';
  const MELODY = [[2.5, 8, .5], [3, 7, .5], [3.5, 5, .5],
    [4.5, 4, .5], [5, 5, .5], [5.5, 7, 1.5], [7, 6, .5], [7.5, 5, .5],
    [8.5, 7, .5], [9, 9, .5], [9.5, 10, 1], [10.5, 9, .5], [11, 7, 1],
    [12.5, 5, .5], [13, 6, .5], [13.5, 7, 1.5], [15, 4, 1]];
  const MISSING = [[.5, 7], [1.5, 9]];   // (beat, pad): the two the player adds
  window.DEMO_KEYS['neonIsland.booth'] = JSON.stringify({ loops: [{ id: LOOP_ID, name: 'Night shift', prog: 0, len: LOOP_LEN, voice: 'glass', bpm: BPM, ap: false, apAmt: .55,
    layers: [MELODY.map(([b, i, d]) => ({ b, d, i, v: .8 }))], at: 1 }] });
  D.info.loop = { bpm: BPM, len: LOOP_LEN, missing: MISSING };

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

  /* ---------- the city: big, at night, every kind of building, an open plaza in the middle ---------- */
  const CITY = { i0: -16, i1: 12, j0: -12, j1: 12 };
  const PLAZA = { i0: -4, i1: 0, j0: -2, j1: 2 };   // open ground; the clip builds on part of it
  const inPlaza = (i, j) => i >= PLAZA.i0 && i <= PLAZA.i1 && j >= PLAZA.j0 && j <= PLAZA.j1;
  const ringOf = (i, j) => !inPlaza(i, j) && i >= PLAZA.i0 - 1 && i <= PLAZA.i1 + 1 && j >= PLAZA.j0 - 1 && j <= PLAZA.j1 + 1;
  const MEGAS = [['police', -14, -11, 3, 3], ['square', -12, -5, 5, 5], ['foundry', -15, 3, 6, 4], ['greenhouse', -15, 9, 5, 4], ['logistics', -9, 7, 6, 6],
    ['wirenest', -5, -11, 4, 4], ['market', 2, -11, 4, 4], ['club', 7, -10, 4, 4], ['radio', 3, -4, 2, 2], ['spire', 7, -4, 3, 3],
    ['square', 8, 1, 5, 5], ['pagoda', 6, 7, 5, 4], ['bathhouse', 2, 6, 3, 3], ['emitter', -2, 6, 2, 2]];
  const LAWNS = [[-7, -2], [-7, -1], [-8, -2], [4, 1], [4, 2], [-1, 9], [0, 9], [-12, 1], [-11, 1]];
  const zoneAt = (i, j, u) => {
    if (ringOf(i, j)) return 'low';
    if (i <= -9 && j >= 2) return u < .8 ? 'ind' : 'mid';
    if (i <= -5) return u < .78 ? 'low' : 'mid';
    if (i >= 6) return u < .7 ? 'high' : 'mid';
    return u < .62 ? 'mid' : u < .8 ? 'high' : 'low';
  };
  function city(){
    const R = mulberry32(20261102);
    const inMega = (i, j) => MEGAS.some(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
    const isLawn = (i, j) => LAWNS.some(([a, b]) => a === i && b === j);
    const secs = (zone, k) => { const out = []; for (let q = 0; q < k; q++) out.push({ zone, seed: Math.floor(R()*1e9), style: DEFAULT_STYLE }); return out; };
    let n = 0;
    for (let i = CITY.i0; i <= CITY.i1; i++) for (let j = CITY.j0; j <= CITY.j1; j++){
      const ci = Math.min(i - CITY.i0, CITY.i1 - i), cj = Math.min(j - CITY.j0, CITY.j1 - j);
      if (ci + cj < 3 && R() < .85) continue;   // (the corners rounded off)
      const c = newCell(i, j); c.style = DEFAULT_STYLE; c.green = 'some'; n++;
      cells.set(ckey(i, j), c);
      if (inMega(i, j)) continue;
      if (inPlaza(i, j)){ c.green = (i + j) & 1 ? 'grass' : 'none'; continue; }
      if (isLawn(i, j)){ c.green = 'grass'; continue; }
      const z = zoneAt(i, j, R()), v = R();
      const k = ringOf(i, j) ? (v < .5 ? 2 : 3) : z === 'ind' ? (v < .5 ? 1 : 2) : v < .25 ? 1 : v < .62 ? 2 : v < .9 ? 3 : 4;
      c.sections = secs(z, Math.min(MAX_SECTIONS, k));
    }
    for (const [kind, i, j, w, h] of MEGAS){ const m = placeMega(kind, i, j, Math.floor(R()*1e9), w, h, 1); if (!m){ warn('megastructure ' + kind, 'did not fit'); continue; } if (kind === 'square') m.centre = nextSquareCentre(m); }
    rebuildAll(); finishSync();
    D.info.city = { plots: n, megas: megas.size };
    say('city built:', JSON.stringify(D.info.city));
  }
  D.city = () => safe('city', city);

  /* ---------- the page: the game's interface hidden, ours over it ---------- */
  const html = document.documentElement;
  function overlay(){
    html.classList.add('dm-on');
    const st = document.createElement('style'); st.id = 'dmStyle';
    st.textContent = `
      html.dm-on body > *:not(#view):not(#dmOv):not(canvas):not(#gridPanel):not(#furnish):not(.zonebar):not(#monitor):not(#npcSel):not(#gridDeck){visibility:hidden!important}
      html.dm-on .zonebar{visibility:hidden!important}
      html.dm-on.dm-zones .zonebar .zones{visibility:visible!important}
      html.dm-on .zonebar .zones .rot,html.dm-on .zonebar .zones .furnbtn{visibility:hidden!important}
      html.dm-on #monitor,html.dm-on #npcSel,html.dm-on #gridDeck{visibility:hidden!important}
      html.dm-on.dm-mon #monitor:not([hidden]),html.dm-on.dm-mon #npcSel:not([hidden]){visibility:visible!important}
      html.dm-on #monitor{transform:scale(1.3);transform-origin:top right;top:3vh!important;right:2.2vw!important;max-height:calc(90vh/1.3)!important;overflow:hidden}
      html.dm-on, html.dm-on *{cursor:none!important}
      html.dm-on #dmOv.ask, html.dm-on #dmOv.ask *{cursor:pointer!important}
      #dmOv{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Chakra Petch','JetBrains Mono',sans-serif;-webkit-font-smoothing:antialiased}
      #dmOv.ask{pointer-events:auto}
      #dmOv > .fill{position:absolute;inset:0;opacity:0}
      #dmBlack{background:#04050b}
      #dmShade{background:radial-gradient(ellipse 70% 60% at 50% 50%,rgba(6,7,16,.28),rgba(6,7,16,.78))}
      #dmCur{position:absolute;left:0;top:0;width:30px;height:30px;margin:-3px 0 0 -4px;opacity:0;will-change:transform;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
      #dmRing{position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:2px solid #fff;opacity:0}
      #dmCap{position:absolute;left:0;bottom:0;padding:0 0 8.5vh 4.8vw;width:60vw;height:28vh;display:flex;flex-direction:column;justify-content:flex-end;
        background:radial-gradient(ellipse 62% 70% at 0% 100%,rgba(4,6,14,.78),rgba(4,6,14,.42) 45%,transparent 75%);opacity:0}
      #dmCap b{display:block;font-weight:600;font-size:5.2vh;line-height:1.04;letter-spacing:-.01em;color:#f3fbff;white-space:nowrap;text-shadow:0 3px 18px rgba(3,5,12,.75),0 1px 2px rgba(0,0,0,.7)}
      #dmCap i{display:block;margin-top:1.7vh;height:3px;width:5vw;background:#38e8e0;transform-origin:0 50%;box-shadow:0 2px 12px rgba(56,232,224,.55)}
      #dmCap i::after{content:'';display:block;margin-left:calc(5vw + 8px);width:14px;height:3px;background:#ff4fa3;box-shadow:0 2px 10px rgba(255,79,163,.6)}
      #dmTag{position:absolute;right:0;bottom:0;padding:0 3.3vw 4.8vh 11vw;height:14vh;display:flex;align-items:flex-end;gap:12px;
        background:radial-gradient(ellipse 80% 80% at 100% 100%,rgba(4,6,14,.6),transparent 70%);opacity:0}
      #dmTag span{font-weight:600;font-size:1.5vh;letter-spacing:.32em;text-transform:uppercase;color:rgba(234,250,255,.86);text-shadow:0 1px 6px rgba(0,0,0,.7)}
      #dmTag u{display:block;width:7px;height:7px;margin-bottom:.45vh;background:#38e8e0;box-shadow:0 1px 8px rgba(56,232,224,.8);text-decoration:none}
      /* the title: the trailer's SVG, cropped to what it draws so it sits in the middle of the frame */
      #dmTitle{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
      #dmTitle svg{width:62vw;max-height:52vh;height:auto;display:block;overflow:visible}
      #dmTitle #neon{filter:drop-shadow(0 0 .35vw rgba(255,74,110,.85)) drop-shadow(0 0 1.6vw rgba(255,74,110,.45))}
      #dmTitle #terrarium{filter:drop-shadow(0 0 .3vw rgba(61,255,207,.8))}
      #dmMsg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #dmMsg b{display:block;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0;margin-bottom:6px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'dmOv';
    ov.innerHTML = '<i class="fill" id="dmShade"></i><div id="dmTitle"></div>'
      + '<div id="dmCap"><b></b><i></i></div>'
      + '<div id="dmTag"><u></u><span>All footage captured in engine</span></div>'
      + '<svg id="dmCur" viewBox="0 0 30 30" aria-hidden="true"><path d="M4 3 L4 24 L9.6 18.8 L13.4 27.2 L17.2 25.5 L13.5 17.3 L21 17.3 Z" fill="#f4fbff" stroke="#0a0c16" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      + '<i id="dmRing"></i><i class="fill" id="dmBlack"></i>'
      + '<div id="dmMsg"><b>Demo clip</b><span id="dmStatus">building the city</span></div>';
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    D.el = { ov, black: q('#dmBlack'), shade: q('#dmShade'), cur: q('#dmCur'), ring: q('#dmRing'), cap: q('#dmCap'), capT: q('#dmCap b'), capL: q('#dmCap i'),
      tag: q('#dmTag'), title: q('#dmTitle'), msg: q('#dmMsg'), status: q('#dmStatus') };
    D.el.black.style.opacity = '1';
    if (CAP || AUTO) D.el.msg.hidden = true;
  }
  async function title(){
    const txt = await fetch('assets/trailer/neon_terrarium_title.svg').then(r => r.text());
    const E = D.el; E.title.innerHTML = txt;
    const svg = E.title.querySelector('svg'); svg.removeAttribute('width'); svg.removeAttribute('height');
    E.title.style.visibility = 'hidden';
    const g = [svg.querySelector('#neon'), svg.querySelector('#terrarium')];
    const nb = g[0].getBBox(), tb = g[1].getBBox();
    if (nb.height > 0 && tb.height > 0){   // both words the same letter height, the two lines centered on each other
      const k = nb.height/tb.height, gap = nb.height*.28, cx = nb.x + nb.width/2;
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g[1].parentNode.insertBefore(wrap, g[1]); wrap.appendChild(g[1]);
      g[1].setAttribute('transform', `translate(${cx - tb.width*k/2} ${nb.y + nb.height + gap}) scale(${k}) translate(${-tb.x} ${-tb.y})`);
      const ww = Math.max(nb.width, tb.width*k), x0 = cx - ww/2, y0 = nb.y, hh = nb.height*2 + gap, pad = nb.height*.12;
      svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${ww + 2*pad} ${hh + 2*pad}`);
    }
    E.tNeon = g[0]; E.tTerr = g[1]; E.tNeon.style.opacity = E.tTerr.style.opacity = '0'; E.title.style.visibility = '';
  }
  const status = s => { D.stage = s; if (D.el) D.el.status.textContent = s; };

  /* ---------- settings (none kept) ---------- */
  const HOUR = 20.6;
  function settle(){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });
    safe('weather', () => { LK.setAutoWeather(false, true); LK.setWeather('clear', true, true); if (LK.pick !== 'auto') LK.setPick('auto', true); });
    if (CAP) window.__FULL_RATE = true;
    safe('resolution', () => { ZOOM_RES = 0; D.pinRes = true; H = 0; applyRenderRes(zoom); });
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; } });
  }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(D.pinRes ? ZOOM_REF : z); };

  /* ---------- people ---------- */
  const doorOf = pl => pl && STORY.streetDoor(pl);
  const doorN = d => { const n = d.n || d.dir || [0, 1], L = Math.hypot(n[0], n[1]) || 1; return { x: n[0]/L, z: n[1]/L }; };
  const doorAt = d => d.stand || d.out || { x: d.x, z: d.z };
  const cellOfPlace = id => { const m = /^c:(-?\d+),(-?\d+)$/.exec(id || ''); return m ? cells.get(ckey(+m[1], +m[2])) : null; };
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
  function scene(id, cast, beats, log){
    const sc = STORY.startScene({ id, beats, log, roles: {}, effects: {}, next: null, tier: 'case', prio: 9 }, cast, { done: (s, why) => say(id, 'ended', why) });
    if (!sc) throw new Error(id + ' did not start');
    return sc;
  }
  // the subject: lives in a tenement on the plaza with a pod (an apartment), and their front door opens onto the plaza
  function cast(){
    const ok = p => p && p.pod && p.home && !p.cop && !p.guard && !p.visitor && !p.archivist;
    let best = null;
    for (const p of pplList){
      if (!ok(p)) continue;
      const c = cellOfPlace(p.home); if (!c || !ringOf(c.i, c.j) || !c.sections.length || c.mega) continue;
      const d = doorOf(places.get(p.home)); if (!d) continue;
      const n = doorN(d), fi = c.i + Math.round(n.x), fj = c.j + Math.round(n.z);
      if (!inPlaza(fi, fj)) continue;   // (the door must face the plaza)
      const floor = +((p.pod || '').split('|')[2] || 0);
      const s = -floor - Math.abs(c.i - (PLAZA.i0 + PLAZA.i1)/2)*.2 - Math.abs(c.j - (PLAZA.j0 + PLAZA.j1)/2)*.2;
      if (!best || s > best.s) best = { p, c, d, n, front: { i: fi, j: fj }, s };
    }
    if (!best) throw new Error('nobody on the plaza with an apartment and a door onto it');
    const { p, c, d, n } = best;
    const at = doorAt(d);
    D.c = { p, home: c, door: d, n, front: best.front, stand: { x: at.x + n.x*1.15, z: at.z + n.z*1.15 } };
    D.c.yaw = Math.atan2(n.x, n.z) + .55;   // (the camera on the plaza side of the door, a little round)
    // the plots the clip builds on: plaza plots near the tenement, but never the one in front of the door
    const free = [];
    for (let i = PLAZA.i0; i <= PLAZA.i1; i++) for (let j = PLAZA.j0; j <= PLAZA.j1; j++){
      if (i === best.front.i && j === best.front.j) continue;
      const dd = Math.hypot(i - best.front.i, j - best.front.j); if (dd > 2.9) continue;
      free.push({ i, j, dd: dd + (Math.abs(i - best.front.i) + Math.abs(j - best.front.j) === 1 ? .6 : 0) });
    }
    free.sort((a, b) => a.dd - b.dd);
    D.c.plots = free.slice(0, 5);
    D.info.cast = { person: p.id, pod: p.pod, home: c.i + ',' + c.j, plots: D.c.plots.map(q => q.i + ',' + q.j) };
    say('cast:', JSON.stringify(D.info.cast));
  }
  const stage1 = () => {   // out of the door to a spot a step in front of it, and waiting there
    const p = D.c.p; putInside(p, p.home); p.speed = PPL_SPEED;
    const node = STORY.nearestNode(D.c.stand.x, D.c.stand.z);
    D.c.sc0 = scene('demo.out', { A: p.id }, [{ id: 'o0', who: ['A'], with: [], at: 'case', do: 'walk', anc: { kind: 'point', x: D.c.stand.x, z: D.c.stand.z, node }, hold: 600 }],
      { o0: ['{A} steps out onto the plaza.'] });
  };
  const waiting = () => D.c && D.c.sc0 && D.c.sc0.b && D.c.sc0.b.id === 'o0' && D.c.sc0.phase === 'hold';
  function goIn(){
    const p = D.c.p;
    safe('end out', () => STORY.endScene(D.c.sc0, 'done'));
    D.c.sc1 = safe('in', () => scene('demo.in', { A: p.id }, [{ id: 'i0', who: ['A'], with: [], at: 'case', do: 'enter', anc: { kind: 'door', door: D.c.door, place: p.home }, hold: 60 }],
      { i0: ['{A} goes in through the door.'] }));
    p.hurry = true;
  }
  const inHome = () => { const p = D.c.p; return !p.walk && p.sc && p.sc.mode === 'in'; };
  // the person cam's log: what the camera picks up from them
  function reveal(tmpl, fact, channel = 'document', ctx = {}){
    const p = D.c.p, c = { A: p.id }, learned = STORY.learnFrom(tmpl, c, new Set(Object.keys(c)), channel, null, ctx);
    if (typeof PACE !== 'undefined') PACE.mine = true;
    try { STORY.logLine(tmpl, c, ctx, 'reveal', { channel, fact: 'A.' + fact, paced: true }); } finally { if (typeof PACE !== 'undefined') PACE.mine = false; }
    STORY.note(p.id, { t: STORY.clock, who: p.id, fact: 'A.' + fact, channel, verified: true, tmpl, cast: c, ctx, learned });
    if (typeof MON !== 'undefined') MON.refresh();
  }
  function personOn(){
    const p = D.c.p;
    if (S.zone) selectZone(S.zone);
    safe('hover', () => showHover(null));
    safe('person cam', () => MON.open(p.id));
    html.classList.add('dm-mon');
    safe('log tab', () => { const b = document.querySelector('#monTabs [data-tab="log"]'); if (b) b.click(); });
  }
  function logLines(k){
    const p = D.c.p, emp = safe('employer', () => STORY.employerName(p)) || 'the night market';
    const floor = +((p.pod || '').split('|')[2] || 0) + 1, nth = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][floor - 1] || floor + 'th';
    safe('log', () => [
      () => reveal('Name tag on {A}: "{A.first}."', 'first-name'),
      () => reveal('{A} is home from a shift at ' + emp + '.', 'employer'),
      () => reveal('{A} lives at {place}, the ' + nth + ' floor.', 'home', 'document', { placeId: p.home })][k]());
  }

  /* ---------- Furnish pod: the apartment lab in its own frame ---------- */
  const labWin = () => { const f = FURN.frame || document.querySelector('#furnish iframe'); return f && f.contentWindow; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  const labBusy = () => { const w = labWin(); return !w || !w.PodContext || w.PodContext.transitioning; };
  const labLive = () => document.getElementById('furnish').classList.contains('live');
  const labReady = () => FURN.open && labLive() && !labBusy() && (labB() && labB().inst && labB().inst.size > 0);
  const labDoc = () => { const w = labWin(); return w && w.document; };
  const frameRect = () => { const f = FURN.frame || document.querySelector('#furnish iframe'); return f ? f.getBoundingClientRect() : { left: 0, top: 0 }; };
  const labEl = sel => { const d = labDoc(); return d && d.querySelector(sel); };
  function labCenter(el){ const f = frameRect(), r = el.getBoundingClientRect(); return { x: f.left + r.left + r.width/2, y: f.top + r.top + r.height/2 }; }
  function labNoCursor(){ const d = labDoc(); if (!d || d.getElementById('dmLab')) return; const st = d.createElement('style'); st.id = 'dmLab'; st.textContent = '*{cursor:none!important}'; d.head.appendChild(st); }
  // a point in the room to the page, through the lab's own camera
  function labScreen(x, y, z){
    const B = labB(), w = labWin();
    const V = B.cam.matrixWorldInverse.elements, P = B.cam.projectionMatrix.elements;
    const ex = V[0]*x + V[4]*y + V[8]*z + V[12], ey = V[1]*x + V[5]*y + V[9]*z + V[13], ez = V[2]*x + V[6]*y + V[10]*z + V[14], ew = V[3]*x + V[7]*y + V[11]*z + V[15];
    const cx = P[0]*ex + P[4]*ey + P[8]*ez + P[12]*ew, cy = P[1]*ex + P[5]*ey + P[9]*ez + P[13]*ew, cw = P[3]*ex + P[7]*ey + P[11]*ez + P[15]*ew;
    const cv = w.document.getElementById('bCanvas') || w.document.querySelector('canvas'), r = cv.getBoundingClientRect(), f = frameRect();
    return { cv, lx: r.left + (cx/cw + 1)/2*r.width, ly: r.top + (1 - cy/cw)/2*r.height, x: f.left + r.left + (cx/cw + 1)/2*r.width, y: f.top + r.top + (1 - cy/cw)/2*r.height };
  }
  const TABLES = new Set(['slab', 'crate', 'spool', 'holo', 'loop', 'block', 'cafe', 'kotatsu', 'fold', 'bar', 'drum', 'island', 'counter']);
  function labTable(){   // the biggest table top in the home: the bonsai goes there, among what the home already has
    const w = labWin(), B = labB(); let tb = null;
    for (const i of B.inst.values()){ if (!i.rec || !TABLES.has(i.rec.arch)) continue; const s = safe('surf', () => w.PodBuilder.surfaces(i.rec.id)) || [];
      for (const q of s){ const a = q.w*q.d; if (!tb || a > tb.a) tb = { i, q, a }; } }
    if (!tb) return null;
    const r = B.root.position; return { x: tb.q.x + r.x, y: tb.q.y + r.y, z: tb.q.z + r.z };
  }
  const FU = { phase: 0 };
  function labGroup(){ const b = labEl('#bRail [data-grp="plants"]'); if (b){ aim(labCenter(b)); click(); b.click(); } else warn('furnish', 'no Plants in the rail'); }
  function labTile(){
    const d = labDoc(); if (!d) return;
    const tiles = [...d.querySelectorAll('#bTiles .tile')];
    const t = tiles.find(x => x._it && x._it.arch === 'bonsai') || tiles.find(x => x._it && x._it.arch === 'snake') || tiles[0];
    if (!t) return warn('furnish', 'no tiles');
    try { t.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    aim(labCenter(t)); click(); t.click(); FU.arch = t._it && t._it.arch;
  }
  function labPlace(){
    const w = labWin(), B = labB(); if (!B) return;
    let at = labTable();
    if (!at){ warn('furnish', 'no table: on the floor in the middle'); const r = B.root.position, P = B.P; at = { x: r.x + (P ? P.W*.5*(B.TILE || .5) : 2), y: r.y, z: r.z + (P ? P.D*.5*(B.TILE || .5) : 2) }; }
    const before = new Set(B.inst.keys());
    if (!B.place) safe('start place', () => w.PodBuilder.startPlace(FU.arch || 'bonsai', 7));
    const s = labScreen(at.x, at.y, at.z), o = { clientX: s.lx, clientY: s.ly, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    aim(s); click(); s.cv.setPointerCapture = () => {};
    s.cv.dispatchEvent(new w.PointerEvent('pointermove', Object.assign({ button: -1, buttons: 0 }, o)));
    try { B.ptr.dirty = true; } catch (e) {}
    s.cv.dispatchEvent(new w.PointerEvent('pointerdown', Object.assign({ button: 0, buttons: 1 }, o)));
    s.cv.dispatchEvent(new w.PointerEvent('pointerup', Object.assign({ button: 0, buttons: 0 }, o)));
    if (B.place) safe('cancel place', () => w.PodBuilder.cancel());
    FU.id = [...B.inst.keys()].find(k => !before.has(k));
    FU.at = at;
    if (FU.id === undefined) warn('furnish', 'nothing was placed');
    D.info.placed = FU.id !== undefined ? (FU.arch || '?') : null;
  }
  function labSelect(){ const w = labWin(); if (FU.id === undefined) return; const s = labScreen(FU.at.x, FU.at.y + .25, FU.at.z); aim(s); click(); safe('select', () => w.PodBuilder.select(FU.id)); }
  function labSwatch(){
    const B = labB(), inst = B && B.inst.get(FU.id); if (!inst) return;
    const k = Math.max(0, inst.slots.findIndex(sl => sl.kind !== 'e'));
    const b = labEl('#iSw .sw[data-i="' + k + '"]') || labEl('#iSw .sw'); if (!b) return warn('furnish', 'no color swatch');
    aim(labCenter(b)); click(); b.click();
  }
  function labColor(){
    const d = labDoc(); const bs = d ? [...d.querySelectorAll('#iCP .pal button')] : []; if (!bs.length) return warn('furnish', 'no palette');
    const sat = hex => { const n = parseInt(String(hex).replace('#', ''), 16), r = (n >> 16)/255, g = (n >> 8 & 255)/255, b = (n & 255)/255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn)/mx*mx : 0; };
    const pick = bs.slice().sort((a, b) => sat(b.dataset.c) - sat(a.dataset.c))[0];
    aim(labCenter(pick)); click(); pick.click(); D.info.color = pick.dataset.c;
  }
  function labExit(){ const b = labEl('#ntExit'); if (b){ aim(labCenter(b)); click(); b.click(); } else FURN.close(); }

  /* ---------- the Grid and its Acoustic Panel ---------- */
  const gridMega = () => megasOfKind('radio')[0];
  function noteAt(beat, pad){   // a spot on the panel's note strip
    const cv = document.getElementById('gStripCv'); if (!cv) return null;
    const v = BOOTH._sv(), r = cv.getBoundingClientRect(), top = 24, rowH = (r.height - top - 10)/(v.hi - v.lo + 1);
    return { cv, x: r.left + (beat + .12 - v.b0)/v.span*r.width, y: r.top + r.height - 6 - (pad - v.lo + .5)*rowH };
  }
  function addNote(k){
    if (AUTO) return;   // (the sound pass put both in already: notesEarly)
    const [b, i] = MISSING[k], s = noteAt(b, i); if (!s) return warn('note', 'no strip');
    aim(s); click();
    const o = { clientX: s.x, clientY: s.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    s.cv.setPointerCapture = () => {};   // (a scripted pointer has no capture to take)
    s.cv.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ buttons: 1 }, o)));
    s.cv.dispatchEvent(new PointerEvent('pointerup', Object.assign({ buttons: 0 }, o)));
  }

  function notesEarly(){
    const L = BOOTH.state.layers; if (!L.length) L.push([]);
    for (const [b, i] of MISSING) L[0].push({ b, d: 1, i, v: .8 });
    L[0].sort((x, y) => x.b - y.b);
  }

  /* ---------- setup ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const t0 = performance.now();
    const tick = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - t0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tick); }; tick(); });
  const wait = secs => { const t0 = performance.now(); return until(() => performance.now() - t0 >= secs*1000, secs + 5); };
  async function setup(){
    overlay(); settle();
    const tl = title().catch(e => warn('title', e));
    status('placing people');
    await until(() => typeof pplReady !== 'undefined' && pplReady && !anims.length && !(typeof LOADP !== 'undefined' && LOADP.on), 180);
    status('letting the city live a little');
    S.hour = 10; FF.set(60); await wait(14); FF.set(1);
    S.cycle = false; S.hour = HOUR;
    cast();
    status('waking the apartment lab');
    FURN.preload();
    await until(() => FURN.warmed() && FURN.frame, 300).catch(e => warn('lab warm', e));
    // once through the apartment beforehand: the lab's first visit is its slowest, and the Plants catalog's pictures get drawn
    status('opening the apartment once');
    const t0 = performance.now();
    if (FURN.openKey(D.c.p.pod)){
      await until(labReady, 120).catch(e => warn('dry run', e));
      D.info.roomMs = Math.round(performance.now() - t0);
      labNoCursor();
      safe('plants', () => labWin().PodBuilder.openCat('plants')); await wait(2.5);
      safe('fly', () => labWin().PodBuilder.closeFly());
      const b = labEl('#ntExit'); if (b) b.click(); else FURN.close();
      await until(() => !FURN.open && !FURN.hold, 20).catch(e => warn('dry run close', e)); await wait(1);
      if (!FURN.frame){ FURN.preload(); await until(() => FURN.warmed() && FURN.frame, 240).catch(e => warn('lab rewarm', e)); }
    } else warn('dry run', 'could not open ' + D.c.p.pod);
    status('night falling');
    await until(() => Math.abs(LIGHTS_ON.value - LIGHTS_GOAL) < .01, 30).catch(e => warn('lights', e));
    status('out of the door');
    stage1();
    await until(waiting, 60).catch(e => warn('out', e));
    await tl;
    buildPlan();
    camAt(0, 0);
    await wait(1);
    D.ready = true;
    status(CAP || AUTO ? 'ready' : 'click to play');
    if (AUTO) go();
    else if (!CAP){ D.el.ov.classList.add('ask'); D.el.status.innerHTML = 'click to play<br><small>about 15 s, with sound</small>'; D.el.ov.addEventListener('click', go, { once: true }); }
    say('ready', JSON.stringify(D.info));
  }

  /* ---------- the timeline ---------- */
  let t0 = 0, lastT = 0, fired = 0;
  const EV = [];
  const at = (t, f, name) => { const e = { t, f, name }; if (!D.playing){ EV.push(e); return; } let k = fired; while (k < EV.length && EV[k].t <= t) k++; EV.splice(k, 0, e); };
  function go(){
    if (D.playing || !D.ready) return;
    D.el.ov.classList.remove('ask'); D.el.msg.hidden = true;
    D.playing = true; D.done = false; fired = 0; t0 = performance.now(); lastT = 0; D.t = 0;
    safe('broadcast', () => BOOTH.broadcast(LOOP_ID, 'rewire'));   // the Booth loop on the Grid from the first frame
    if (typeof window.__dmGo === 'function') safe('go hook', () => window.__dmGo());
    say('rolling');
  }
  D.start = () => { if (!D.ready) return false; go(); return true; };
  const clock = () => (performance.now() - t0)/1000;
  const LT = t => t;

  /* ---------- the build ---------- */
  const CLICKS = [];
  function planBuild(){
    const zs = ['low', 'mid', 'low', 'high', 'mid'], ups = [1, 1, 0, 1, 0];
    let t = .25;
    D.c.plots.forEach((q, k) => { CLICKS.push({ t, i: q.i, j: q.j, zone: zs[k % zs.length], up: false }); t += .2;
      for (let u = 0; u < ups[k % ups.length]; u++){ CLICKS.push({ t, i: q.i, j: q.j, zone: zs[k % zs.length], up: true }); t += .16; } });
    CLICKS.push({ t: t + .02, i: D.c.home.i, j: D.c.home.j, zone: 'low', up: true, home: true });   // the last: a floor on top of their tenement
    D.info.buildEnds = +(t + .02).toFixed(2);
  }
  function clickPoint(b){ const c = cells.get(ckey(b.i, b.j)); return { x: b.i*LOT, y: b.up && c ? c.height + .05 : CURB + .3, z: b.j*LOT }; }
  function doClick(b){
    if (S.zone !== b.zone) selectZone(b.zone);
    const c = cells.get(ckey(b.i, b.j)); if (!c) return warn('click', 'no plot ' + b.i + ',' + b.j);
    const tg = b.up ? (c.sections.length < MAX_SECTIONS ? { type: 'up', c } : null) : (c.sections.length ? null : { type: 'onto', c });
    if (!tg) return warn('click', 'nothing to build at ' + b.i + ',' + b.j);
    safe('hover', () => showHover(tg));
    if (!applyTarget(tg)) warn('click', 'did not build at ' + b.i + ',' + b.j);
    CUR.col = ZONES[b.zone] ? ZONES[b.zone].col : '#fff'; click();
  }

  /* ---------- the camera ---------- */
  const CAM = { x: 0, z: 0, y: TARGET_Y, yaw: 0, zoom: 6, pitch: 36*DEG };
  const P = { x: 0, z: 0 };
  let from = null;
  function camAt(t, dt){
    const c = D.c; if (!c) return;
    const plaza = { x: lerp(c.front.i*LOT, c.home.i*LOT, .25), z: lerp(c.front.j*LOT, c.home.j*LOT, .25) };
    const p = c.p;
    if (t < MK.person){   // up close on the plaza while it's built on, turning slowly
      const u = t/MK.person;
      Object.assign(CAM, { x: plaza.x, z: plaza.z, y: CURB + 1.1, yaw: c.yaw - .35 + .25*ease(u), zoom: elerp(6.4, 5.6, ss(u)), pitch: lerp(38, 35, ss(u))*DEG });
      P.x = p.x ?? c.stand.x; P.z = p.z ?? c.stand.z;
    }
    else if (t < MK.furn + 2){   // in on them at their door
      if (p.x !== undefined && !(p.sc && p.sc.mode === 'in')){ P.x = follow(P.x, p.x, 7, dt); P.z = follow(P.z, p.z, 7, dt); }
      const u = ease(seg(t, MK.person, MK.person + .55));
      const a = { x: plaza.x, z: plaza.z, yaw: c.yaw - .1, zoom: 5.6 };
      Object.assign(CAM, { x: lerp(a.x, P.x, u), z: lerp(a.z, P.z, u), y: lerp(CURB + 1.1, CURB + .55, u), yaw: lerp(a.yaw, c.yaw, u), zoom: elerp(a.zoom, 3.3, u), pitch: lerp(35, 30, u)*DEG });
    }
    else if (t < LT(MK.grid)){ /* (the apartment covers the screen; after it the city comes back where it was) */ return; }
    else if (t < LT(MK.out)){   // across to the Grid
      if (!from) from = Object.assign({}, CAM);
      const g = gridMega(), u = ease(seg(t, LT(MK.grid), LT(MK.grid) + .5));
      const gx = g ? g.x : from.x, gz = g ? g.z : from.z;
      Object.assign(CAM, { x: lerp(from.x, gx, u), z: lerp(from.z, gz, u), y: lerp(from.y, CURB + 1.4, u), yaw: from.yaw + wrapA(c.yaw + .3 - from.yaw)*u, zoom: elerp(from.zoom, 7.5, u), pitch: lerp(from.pitch/DEG, 34, u)*DEG });
      CAM.g = Object.assign({}, CAM);
    }
    else {   // out over the whole city
      const a = CAM.g || CAM, u = ease(seg(t, LT(MK.out), LT(MK.title) + .3)), v = seg(t, LT(MK.out), D.len);
      Object.assign(CAM, { x: lerp(a.x, -2*LOT, u), z: lerp(a.z, 0, u), y: lerp(a.y, TARGET_Y, u), yaw: a.yaw + .5*u + .12*v, zoom: elerp(a.zoom, 34, u), pitch: lerp(a.pitch/DEG, 38, u)*DEG, g: a });
    }
    camGoal.set(CAM.x, CAM.y, CAM.z); camT.copy(camGoal);
    yaw = yawT = CAM.yaw; zoom = zoomT = CAM.zoom; PITCH = pitchT = CAM.pitch;
  }
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (D.playing) safe('frame', () => { S.hour = HOUR; camAt(D.t, dt); });
    return _uc(dt);
  };

  /* ---------- the cursor: drawn, so it shows in the recording ---------- */
  const CUR = { x: innerWidth*.62, y: innerHeight*.66, tx: null, ty: null, pulse: -9, col: '#ffffff', on: 0, want: 0 };
  function aim(s){ if (!s) return; CUR.tx = s.x; CUR.ty = s.y; CUR.want = 1; }
  function click(){ CUR.pulse = D.t; }
  const _v = new THREE.Vector3();
  const toScreen = p => { _v.set(p.x, p.y, p.z).project(cam); const r = canvas.getBoundingClientRect(); return { x: r.left + (_v.x + 1)/2*r.width, y: r.top + (1 - _v.y)/2*r.height }; };

  function buildPlan(){
    planBuild();
    at(0, () => html.classList.add('dm-zones'), 'zones');
    CLICKS.forEach((b, k) => {
      at(b.t - .14, () => aim(toScreen(clickPoint(b))), 'aim ' + k);
      at(b.t, () => doClick(b), 'click ' + k);
    });
    at(D.info.buildEnds + .25, () => { safe('hover', () => showHover(null)); CUR.want = 0; html.classList.remove('dm-zones'); }, 'build done');
    at(MK.person, personOn, 'person cam');
    at(MK.person + .15, () => logLines(0), 'log 1');
    at(MK.enter, goIn, 'heads in');
    at(MK.person + .7, () => logLines(1), 'log 2');
    at(MK.person + 1.25, () => logLines(2), 'log 3');
    // the apartment: opened the moment they're inside (or at MK.furn at the latest), through the game's own hologram
    at(MK.furn, () => openHome('latest'), 'apartment');
    // in the room: scheduled when it's ready (furnish(), below)
    at(MK.exit, labExit, 'exit');
    at(MK.exit + .05, () => { html.classList.remove('dm-mon'); safe('cam off', () => MON.close()); }, 'person cam off');
    // the Grid
    at(MK.grid + .3, () => { const g = gridMega(); if (g) aim(toScreen({ x: g.x, y: (g.top || CURB + 2)*.7, z: g.z })); CUR.want = 1; }, 'to the Grid');
    at(MK.panel - .25, () => click(), 'click 1');
    at(MK.panel - .05, () => { click(); safe('panel', () => music.panel.show()); }, 'double click: panel');
    // the sound pass plays in real time, where a slow frame could make a click late: there the two notes go into the loop's data well
    // ahead (they first sound at 9.98 s and 10.58 s either way, on the next pass), so the music never depends on when a frame came
    if (AUTO) at(8.6, notesEarly, 'notes, ahead');
    at(MK.note1 - .2, () => aim(noteAt(...MISSING[0])), 'aim note 1');
    at(MK.note1, () => addNote(0), 'note 1');
    at(MK.note2 - .2, () => aim(noteAt(...MISSING[1])), 'aim note 2');
    at(MK.note2, () => addNote(1), 'note 2');
    at(MK.close - .25, () => { const b = document.getElementById('gpClose'); if (b) aim((r => ({ x: r.left + r.width/2, y: r.top + r.height/2 }))(b.getBoundingClientRect())); }, 'to close');
    at(MK.close, () => { click(); safe('close', () => music.panel.hide()); }, 'close panel');
    at(MK.close + .25, () => { CUR.want = 0; }, 'cursor away');
    at(MK.end, () => { D.playing = false; D.done = true; say('done at', D.t.toFixed(2));
      if (!CAP && !AUTO){ D.el.msg.hidden = false; D.el.status.innerHTML = 'click to play again'; D.el.ov.classList.add('ask'); D.el.ov.addEventListener('click', () => location.reload(), { once: true }); } }, 'end');
    EV.sort((a, b) => a.t - b.t);
  }
  // the furnishing, from the moment the room is ready: the Plants catalog, a bonsai tile, set down on their table, picked, its color menu,
  // a new color. Spread over what's left before the Exit (squeezed when the room was late, the color change dropped if there's no time)
  function furnish(t){
    const steps = [[.1, () => { CUR.want = 1; labGroup(); }, 'plants'], [.55, labTile, 'bonsai tile'], [1.05, labPlace, 'set down'], [1.45, labSelect, 'select it'],
      [1.75, labSwatch, 'color menu'], [2.1, labColor, 'new color']];
    const room = MK.exit - .25 - t, k = Math.min(1, room/2.15);
    D.info.furnishSqueeze = +k.toFixed(2);
    if (room < .8){ warn('furnish', 'the room was ready too late to furnish (' + t.toFixed(2) + ' s)'); return; }
    for (const [d, f, name] of steps) at(t + d*k, f, name);
  }
  function openHome(why){
    if (D.furnOpened) return; D.furnOpened = true; CUR.want = 0;
    D.info.furnAt = +D.t.toFixed(2); D.info.furnWhy = why;
    if (!FURN.openKey(D.c.p.pod)) warn('furnish', 'did not open');
  }

  /* ---------- the overlay, drawn from the clock ---------- */
  function cursor(t, dt){
    const E = D.el;
    CUR.on = follow(CUR.on, CUR.want, 10, dt);
    E.cur.style.opacity = CUR.on.toFixed(3);
    if (CUR.tx !== null){ CUR.x = follow(CUR.x, CUR.tx, 13, dt); CUR.y = follow(CUR.y, CUR.ty, 13, dt); }
    const press = 1 - .14*Math.max(0, 1 - Math.abs(t - CUR.pulse)/.06);
    E.cur.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${press.toFixed(3)})`;
    const u = (t - CUR.pulse)/.32;
    if (u >= 0 && u < 1 && CUR.on > .05){ const r = .35 + .9*expo(u);
      E.ring.style.opacity = (.85*(1 - u)*CUR.on).toFixed(3); E.ring.style.borderColor = CUR.col;
      E.ring.style.transform = `translate(${CUR.x.toFixed(1)}px,${CUR.y.toFixed(1)}px) scale(${r.toFixed(3)})`; }
    else E.ring.style.opacity = '0';
  }
  let capK = -1;
  function caption(t){
    const E = D.el;
    const k = CAPS.findIndex(([a, b]) => t >= a && t < b + .3);
    if (k < 0){ E.cap.style.opacity = '0'; capK = -1; return; }
    const [a, b, text] = CAPS[k];
    if (k !== capK){ E.capT.textContent = text; capK = k; }
    const i = expo(seg(t, a, a + .5)), o = ss(seg(t, b - .05, b + .25));
    E.cap.style.opacity = (1 - o).toFixed(3);
    E.capT.style.clipPath = `inset(-20% ${((1 - i)*100).toFixed(2)}% -20% 0)`;
    E.capT.style.transform = `translateY(${((1 - i)*12).toFixed(2)}px)`;
    E.capT.style.filter = i < .999 ? `blur(${((1 - i)*6).toFixed(2)}px)` : '';
    E.capL.style.transform = `scaleX(${expo(seg(t, a + .1, a + .55)).toFixed(3)})`;
  }
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  function paint(t, dt){
    const E = D.el, T = LT(MK.title);
    E.black.style.opacity = t < .3 ? (1 - ss(t/.3)).toFixed(3) : '0';
    E.shade.style.opacity = (.8*ss(seg(t, T - .3, T + .4))).toFixed(3);
    cursor(t, dt); caption(t);
    E.tag.style.opacity = ss(seg(t, .3, .8)).toFixed(3);
    if (E.tNeon){ E.tNeon.style.opacity = String(t > T ? neonAt(t - T) : 0); E.tTerr.style.opacity = String(t > T + .3 ? neonAt(t - T - .3) : 0); }
  }
  function tick(){
    requestAnimationFrame(tick);
    if (!D.playing) return;
    const t = clock(), dt = Math.max(0, Math.min(.1, t - lastT)); lastT = t; D.t = t;
    while (fired < EV.length && EV[fired].t <= t){ const e = EV[fired++]; safe(e.name, e.f); D.log.push(t.toFixed(2) + ' ' + e.name); }
    // through the door and gone: the apartment, a beat later
    if (!D.furnOpened && t > MK.enter + .4 && inHome()){ if (D.inT === undefined) D.inT = t; if (t - D.inT > .25) openHome('inside'); }
    // the room ready: the furnishing is fitted in before the Exit
    if (D.furnOpened && D.roomAt === undefined && labReady()){ D.roomAt = t; D.info.roomAt = +t.toFixed(2); safe('lab cursor', labNoCursor); furnish(t); }
    paint(t, dt);
  }
  D.state = () => ({ ready: D.ready, playing: D.playing, done: D.done, t: D.t, len: D.len, stage: D.stage, info: D.info, log: D.log.slice(-40) });

  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick))
      .catch(e => { warn('setup', e); status('could not set up: ' + (e && e.message || e)); D.failed = String(e && e.message || e); });
  });
  return D;
})();
