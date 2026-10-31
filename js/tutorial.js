// Neon Terrarium: the touch tutorial (claude/mobile-ui-plan.md, "Feeding the tutorial"). Phones and tablets only.
// The first time a touch player is in a city, a few guided beats teach the gestures by doing them: each beat lights up where to act, says what to do
// in a few words styled as an operator's note (never mistaken for a button), and waits for the game to report that it was done (input.js and
// touchui.js send nt:pan, nt:zoom, nt:build, nt:trim, nt:resize, nt:remove, nt:restore, nt:tilt). It can be skipped at any beat, replayed from Settings,
// Interface, and each beat's shown and done counts are kept in this browser (touch:nt.tut), to see where players drop off.
// Later, one-line tips appear the first time something new turns up (a megastructure's holo-tag, the music player, Scan), while Tips is on.
'use strict';
const TUT = (() => {
  const U = { replay(){}, tips(){}, replayHw(){}, replayMt(){}, miniOn(){ return false; } };
  if (typeof TOUCH === 'undefined' || !TOUCH.on) return U;
  const KEY = 'touch:nt.tut', TIPKEY = 'touch:nt.tipsSeen';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tipsOn = () => { try { return localStorage.getItem('touch:nt.tips') !== '0'; } catch (e) { return true; } };
  const st = load(KEY, { done: false, beats: {} });
  const mark = (id, what) => { const b = st.beats[id] || (st.beats[id] = { shown: 0, done: 0 }); b[what]++; save(KEY, st); };

  // the beats: what to do, where to look, the gesture's ghost, and the event that says it's done
  const zoneCard = () => document.querySelector('.zones > .tcur, .zones > .zcol.tcur, .zones .zone.on') || document.querySelector('.zones');
  const center = () => ({ x: innerWidth/2, y: innerHeight*.45, r: 70 });
  const atFresh = () => { const f = typeof FRESH !== 'undefined' && FRESH; if (!f) return center(); const v = new THREE.Vector3(f.c.x, f.c.height || 2, f.c.z).project(cam), r = document.getElementById('view').getBoundingClientRect();
    return { x: r.left + (v.x*.5 + .5)*r.width, y: r.top + (1 - (v.y*.5 + .5))*r.height, r: 56 }; };
  const BEATS = [
    // (owner, Oct 30: a tile before a building, and the wording short and plain)
    { id: 'pan', say: 'Drag to pan the view', at: center, ghost: 'drag', ev: 'pan' },
    { id: 'zoom', say: 'Pinch to zoom', at: center, ghost: 'pinch', ev: 'zoom' },
    { id: 'tile', say: 'Tap the sky beside the platform to add a tile', at: center, ghost: 'tap', ev: 'tile' },
    // (a tap on an empty tile cycles its surface only with no zone picked: with one picked it builds, so the step is passed over)
    { id: 'surface', say: 'Tap a tile to cycle its surface', at: center, ghost: 'tap', ev: 'surface', skipIf: () => !!S.zone },
    { id: 'zone', say: 'Swipe the zone card to choose a zone', at: () => rectOf(zoneCard()), ghost: 'up', test: () => !!S.zone },
    { id: 'build', say: 'Tap a tile to place a building', at: center, ghost: 'tap', ev: 'build', need: () => !!S.zone, pre: 'Select a zone first' },
    { id: 'trim', say: 'Double-tap a tile to build a single floor', at: atFresh, ghost: 'tap2', ev: 'trim' },
    { id: 'resize', say: 'Double-tap and drag up to set the height', at: atFresh, ghost: 'up', ev: 'resize' },
    { id: 'remove', say: 'Press and hold a building to remove it', at: center, ghost: 'hold', ev: 'remove' },
    { id: 'restore', say: 'Tap Restore to undo the removal', at: () => rectOf(document.querySelector('.trestore:not([hidden])')) || center(), ghost: 'tap', ev: 'restore', skipIf: () => !document.querySelector('.trestore:not([hidden])') },
    { id: 'tilt', say: 'Drag two fingers up or down to tilt', at: center, ghost: 'two', ev: 'tilt' },
  ];
  function rectOf(e){ if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width/2, y: r.top + r.height/2, r: Math.max(r.width, r.height)/2 + 10 }; }

  // the overlay: a dim with a hole where to act (no pointer events: the game underneath takes every touch), the note, and Skip
  const ov = document.createElement('div'); ov.className = 'ttut'; ov.hidden = true;
  // (no dimming and no spotlight (owner, Oct 30): the player does each gesture wherever they like; the note shows a small ghost of it)
  ov.innerHTML = '<div class="tt-note"><div class="tt-demo"><div class="tt-ghost"><i></i><i></i></div></div><div class="tt-txt"><small></small><b></b></div><button type="button">Skip tutorial</button></div>';
  document.body.appendChild(ov);
  const ghost = ov.querySelector('.tt-ghost'), note = ov.querySelector('.tt-note'), say = note.querySelector('b'), step = note.querySelector('small');
  note.querySelector('button').addEventListener('click', () => finish(true));
  let k = -1, on = false, raf = 0, waitEv = null;
  function place(){
    if (!on) return; raf = requestAnimationFrame(place);
    const b = BEATS[k];
    if (b && b.test && b.test()) next();
    if (b && b.skipIf && b.skipIf()) next();
  }
  function show(){
    const b = BEATS[k]; if (!b){ finish(false); return; }
    mark(b.id, 'shown');
    const blocked = b.need && !b.need();
    say.textContent = blocked ? b.pre : b.say; step.textContent = '// OPERATOR NOTE ' + (k + 1) + ' / ' + BEATS.length;
    ghost.className = 'tt-ghost g-' + (blocked ? 'tap' : b.ghost);
    if (waitEv) removeEventListener('nt:' + waitEv, onEv); waitEv = b.ev || null; if (waitEv) addEventListener('nt:' + waitEv, onEv);
    if (blocked){ const iv = setInterval(() => { if (!on || BEATS[k] !== b){ clearInterval(iv); return; } if (b.need()){ clearInterval(iv); show(); } }, 300); }
  }
  function onEv(){ next(); }
  function next(){ const b = BEATS[k]; if (b) mark(b.id, 'done'); k++; if (k >= BEATS.length) finish(false); else show(); }
  function start(){ if (on) return; on = true; k = 0; ov.hidden = false; show(); place(); }
  function finish(skipped){
    on = false; cancelAnimationFrame(raf); ov.hidden = true; if (waitEv) removeEventListener('nt:' + waitEv, onEv); waitEv = null;
    st.done = true; st.skipped = !!skipped; save(KEY, st);
    if (!skipped) tip('Tutorial complete. All controls are in Settings › Controls.', null, 6000);
  }
  U.replay = () => { st.done = false; save(KEY, st); setTimeout(start, 400); };

  // starts once the player is in a city (past the title, the city loaded), the first time only
  const ready = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on) && document.getElementById('view') &&
    !(typeof OVERSEER !== 'undefined' && OVERSEER.hold) && !(typeof PRECINCT !== 'undefined' && PRECINCT.hold) && !(typeof FURN !== 'undefined' && FURN.hold) && !document.documentElement.classList.contains('gp-open');
  const iv = setInterval(() => { if (st.done){ clearInterval(iv); return; } if (ready()){ clearInterval(iv); setTimeout(() => { if (ready() && !st.done) start(); }, 1200); } }, 700);

  // just-in-time tips: one line, the first time each thing turns up, near it
  const seen = load(TIPKEY, {});
  const tipEl = document.createElement('div'); tipEl.className = 'ttip'; tipEl.hidden = true; document.body.appendChild(tipEl);
  let tipT = 0;
  function tip(text, target, ms = 5000){
    tipEl.textContent = text; tipEl.hidden = false;
    const r = target && target.getBoundingClientRect(), w = Math.min(300, innerWidth - 24);
    tipEl.style.maxWidth = w + 'px';
    const tr = tipEl.getBoundingClientRect();
    const x = r ? Math.max(12, Math.min(innerWidth - tr.width - 12, r.left + r.width/2 - tr.width/2)) : (innerWidth - tr.width)/2;
    const y = r ? (r.top - tr.height - 12 > 12 ? r.top - tr.height - 12 : r.bottom + 12) : innerHeight*.3;
    tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    clearTimeout(tipT); tipT = setTimeout(() => { tipEl.hidden = true; }, ms);
  }
  const TIPS = [
    { id: 'tag', find: () => [...document.querySelectorAll('.tholo.ton:not(.tlabel)')].find(e => e.getBoundingClientRect().width), say: 'Tap the button to open its screen' },
    // (the player is always in the page, see-through until the Psycho-Acoustic Grid is built and playing: 'live', grid.js. Its size alone said it was there from the start)
    // (it points at the building, not the player: "the player" read as the person playing)
    { id: 'music', find: () => { const g = document.getElementById('gridDeck'); return g && !g.hidden && g.classList.contains('live') && g.getBoundingClientRect().width ? document.getElementById('view') : null; }, say: 'The Grid is broadcasting. Tap the Grid building to open its panel.' },
    { id: 'scan', find: () => { const b = document.getElementById('furnBtn'); return b && !b.hidden && typeof megasOfKind === 'function' && megasOfKind('lidar').length ? document.getElementById('view') : null; }, say: 'Tap the LIDAR Array, then Scan, then a home' },
    { id: 'people', find: () => typeof megasOfKind === 'function' && megasOfKind('police').length ? document.getElementById('view') : null, say: 'Tap someone in the street to watch them' },
  ];
  setInterval(() => {
    if (!tipsOn() || on || X.on || !st.done || !ready() || !tipEl.hidden) return;
    for (const t of TIPS){ if (seen[t.id]) continue; const e = t.find(); if (!e) continue; seen[t.id] = 1; save(TIPKEY, seen); tip(t.say, e === document.getElementById('view') ? null : e); break; }
  }, 2500);
  U.tips = v => { if (!v) tipEl.hidden = true; };

  // The transit tutorials (owner, Oct 30: in place of the Instructions panels, which touch screens no longer show). The first time the player turns on
  // highway mode, and the first time metro mode, a few beats in the same style: an operator's note with a small ghost of the gesture, Skip, no dimming,
  // each beat done anywhere. They wait for the city to say each step was done (a piece added, the height changed, a line finished), pause while the
  // mode is off and carry on when it's back, and keep their shown and done counts in this browser (touch:nt.tutHw, touch:nt.tutMt).
  // Replayed from Settings, Interface (touchui.js), which turns the mode on.
  // (owner, Oct 31: they teach the touch controls of transit-touch.js: tap to aim, tap again to place; drag from the end to draw, tap to place;
  //  and on the metro, double tap the first station to turn it)
  const ttN = k => typeof TT !== 'undefined' ? TT[k] || 0 : 0;
  const hwOpen = () => typeof highways !== 'undefined' ? highways.filter(h => !h.done) : [], tilesOf = a => a.reduce((n, l) => n + l.tiles.length, 0);
  const mtOpen = () => typeof metros !== 'undefined' ? metros.filter(l => !l.done && !l.loop) : [];
  const doneOf = a => a.filter(l => l.done).length;
  // each beat: arm() takes a note of how things stand when it's shown, and returns the test that says it's done
  const MINI = {
    hw: { key: 'touch:nt.tutHw', name: 'SKY HIGHWAY', mode: () => typeof hwMode !== 'undefined' && hwMode, end: 'Hold a piece to cut the road back.', beats: [
      { id: 'start', say: 'Tap a plot to aim, then tap again to start a highway', ghost: 'tap2', arm: () => { const n = highways.length; return () => highways.length > n || hwOpen().some(h => h === hwActive); } },
      { id: 'height', say: 'Tap \u2212 or + below to set the height', ghost: 'tap', arm: () => { const L = hwLevel; return () => hwLevel !== L; } },
      { id: 'extend', say: 'Drag from the end to draw the road, then tap it to build', ghost: 'drag', arm: () => { const n = tilesOf(hwOpen()); return () => tilesOf(hwOpen()) > n; } },
      { id: 'finish', say: 'Tap the last piece twice to add the drop-off', ghost: 'tap2', arm: () => { const n = doneOf(highways); return () => doneOf(highways) > n; } },
    ] },
    mt: { key: 'touch:nt.tutMt', name: 'METRO', mode: () => typeof mtMode !== 'undefined' && mtMode, end: 'Tap a straight piece to add a station. Hold a piece to cut the line back.', beats: [
      { id: 'start', say: 'Tap a plot to aim, then tap again to place the first station', ghost: 'tap2', arm: () => { const n = metros.length; return () => metros.length > n || mtOpen().some(l => l === mtActive); } },
      // (done once it's turned, or once no lone station is left to turn)
      { id: 'turn', say: 'Double tap the station to turn it', ghost: 'tap2', arm: () => { const n = ttN('turns'); return () => ttN('turns') > n || !metros.some(l => l.tiles.length === 1); } },
      { id: 'extend', say: 'Drag from the end to draw the track, then tap it to build', ghost: 'drag', arm: () => { const n = tilesOf(metros); return () => tilesOf(metros) > n; } },
      { id: 'finish', say: 'Tap the last piece twice to finish it with a station', ghost: 'tap2', arm: () => { const n = doneOf(metros); return () => doneOf(metros) > n; } },
    ] },
  };
  for (const m of Object.values(MINI)) m.st = load(m.key, { done: false, beats: {} });
  const xov = document.createElement('div'); xov.className = 'ttut ttut-x'; xov.hidden = true;
  xov.innerHTML = '<div class="tt-note"><div class="tt-demo"><div class="tt-ghost"><i></i><i></i></div></div><div class="tt-txt"><small></small><b></b></div><button type="button">Skip</button></div>';
  document.body.appendChild(xov);
  const xg = xov.querySelector('.tt-ghost'), xsay = xov.querySelector('b'), xstep = xov.querySelector('small');
  const X = { on: false, m: null, k: 0, test: null };
  const xmark = (m, id, what) => { const b = m.st.beats[id] || (m.st.beats[id] = { shown: 0, done: 0 }); b[what]++; save(m.key, m.st); };
  function xshow(){
    const m = X.m, b = m.beats[X.k]; if (!b){ xfinish(false); return; }
    xmark(m, b.id, 'shown'); X.test = b.arm();
    xsay.textContent = b.say; xstep.textContent = '// ' + m.name + ' ' + (X.k + 1) + ' / ' + m.beats.length; xg.className = 'tt-ghost g-' + b.ghost;
  }
  function xfinish(skipped){
    const m = X.m; X.on = false; X.m = null; X.test = null; xov.hidden = true; if (!m) return;
    m.st.done = true; m.st.skipped = !!skipped; save(m.key, m.st);
    if (!skipped) tip(m.end, null, 5200);
  }
  xov.querySelector('button').addEventListener('click', () => xfinish(true));
  setInterval(() => {
    if (X.on){
      const m = X.m; xov.hidden = !m.mode();   // (the mode off: the note waits, and comes back with it)
      if (!xov.hidden && X.test && X.test()){ xmark(m, m.beats[X.k].id, 'done'); X.k++; if (X.k >= m.beats.length) xfinish(false); else xshow(); }
      if (!xov.hidden || !Object.values(MINI).some(o => o !== m && !o.st.done && o.mode())) return;
      X.on = false; X.m = null; X.test = null;   // (the other mode turned on, with its tutorial still to come: this one starts over next time)
    }
    if (on || !ready()) return;   // (never over the main tutorial)
    for (const m of Object.values(MINI)) if (!m.st.done && m.mode()){ X.on = true; X.m = m; X.k = 0; tipEl.hidden = true; xov.hidden = false; xshow(); break; }
  }, 250);
  const xreplay = (m, go) => () => { if (X.on) xfinish(true); m.st.done = false; save(m.key, m.st);
    setTimeout(() => { if (typeof hwUnlocked === 'function' && hwUnlocked()) go(); }, 400); };
  U.replayHw = xreplay(MINI.hw, () => { if (typeof setHwMode === 'function' && !hwMode) setHwMode(true); });
  U.replayMt = xreplay(MINI.mt, () => { if (typeof setMtMode === 'function' && !mtMode) setMtMode(true); });
  U.miniOn = () => X.on;
  return U;
})();
