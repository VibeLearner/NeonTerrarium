// Neon Terrarium: the tutorial on a computer (owner, Nov 3). A touch screen has its own (tutorial.js); this one only runs with a mouse and keyboard.
//  - the first time a new player is in a city: a few beats as operator's notes, each waiting for the city to say it was done: add a tile, cycle
//    its surface, pick a zone, place a building. Skip at any beat; Settings, Game Settings replays it. A browser that has played before (a city
//    already kept here when this first loaded) never sees it unasked.
//  - one-time notes as the city grows: when the first megastructure arrives, R turns it; when one that opens on a double click arrives (the
//    Psycho-Acoustic Grid, a Data Spire, a police station), that it does.
//  - the first time highway mode and metro mode are turned on: a few beats on their controls, dragging from the end to lay track among them.
// Kept in this browser: neonIsland.tutPC, neonIsland.tutPCHw, neonIsland.tutPCMt, neonIsland.tipsPC.
// All game scripts share one scope and load in order (see index.html); this one after tutorial.js.
'use strict';
const PCTUT = (() => {
  const U = { replay(){}, on(){ return false; } };
  if (typeof TOUCH !== 'undefined' && TOUCH.on) return U;
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const has = k => { try { return localStorage.getItem(k) !== null; } catch (e) { return false; } };
  const KEY = 'neonIsland.tutPC', TIPS_KEY = 'neonIsland.tipsPC';
  // (new players only: a browser that had a city kept before this came is marked done, existing, by a line at the top of the page, which runs before any
  //  game script has saved the new player's first city)
  let st = load(KEY, null);
  if (!st){ st = { done: false, beats: {} }; save(KEY, st); }
  const tips = load(TIPS_KEY, {});
  // (a new player's first city opens at the tutorial's zoom, rather than gliding there once the tutorial starts)
  if (!st.done && typeof zoom !== 'undefined'){ zoom = zoomT = 12; }

  const ready = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on) && document.getElementById('view') &&
    !(typeof OVERSEER !== 'undefined' && OVERSEER.open) && !(typeof PRECINCT !== 'undefined' && PRECINCT.open) && !(typeof FURN !== 'undefined' && (FURN.open || FURN.pick)) &&
    !document.documentElement.classList.contains('gp-open');
  const built = () => { let n = 0; for (const c of cells.values()) if (c.sections.length) n++; return n; };

  /* ---------- the note ---------- */
  const ov = document.createElement('div'); ov.className = 'pctut'; ov.hidden = true;
  ov.innerHTML = '<div class="tt-note"><div class="tt-demo"><div class="tt-ghost"><i></i><i></i></div></div><div class="tt-txt"><small></small><b></b></div><button type="button">Skip</button></div>';
  document.body.appendChild(ov);
  const ghost = ov.querySelector('.tt-ghost'), say = ov.querySelector('b'), step = ov.querySelector('small'), skipBtn = ov.querySelector('button');
  const tipEl = document.createElement('div'); tipEl.className = 'pctip'; tipEl.hidden = true; document.body.appendChild(tipEl);
  let tipT = 0, tipQ = [];
  function tip(text, ms = 6500){ tipQ.push([text, ms]); if (tipEl.hidden) nextTip(); }
  function nextTip(){ const n = tipQ.shift(); if (!n){ tipEl.hidden = true; return; } tipEl.textContent = n[0]; tipEl.hidden = false; clearTimeout(tipT); tipT = setTimeout(nextTip, n[1]); }

  // A run of beats: { key, name, beats: [{ id, say, ghost, arm() -> done test, skipIf? }], end, mode?() }. One runs at a time.
  const R = { run: null, k: 0, test: null };
  function show(){
    const r = R.run, b = r.beats[R.k]; if (!b){ finish(false); return; }
    if (b.skipIf && b.skipIf()){ R.k++; show(); return; }
    const m = r.st.beats[b.id] || (r.st.beats[b.id] = { shown: 0, done: 0 }); m.shown++; save(r.key, r.st);
    R.test = b.arm(); say.textContent = b.say; step.textContent = '// ' + r.name + ' ' + (R.k + 1) + ' / ' + r.beats.length; ghost.className = 'tt-ghost g-' + b.ghost;
  }
  function finish(skipped){
    const r = R.run; R.run = null; R.test = null; ov.hidden = true; if (!r) return;
    r.st.done = true; r.st.skipped = !!skipped; save(r.key, r.st);
    if (!skipped && r.end) tip(r.end, 7000);
  }
  skipBtn.addEventListener('click', () => finish(true));
  // (the tutorial starts at zoom 12, owner Nov 3: a little closer than the usual 13.2, so the first platform's tiles are easy to point at)
  const TUT_ZOOM = 12;
  function begin(r){ R.run = r; R.k = 0; skipBtn.textContent = r === MAIN ? 'Skip tutorial' : 'Skip'; ov.hidden = false;
    if (r === MAIN && typeof zoomT !== 'undefined') zoomT = TUT_ZOOM*(typeof ZK !== 'undefined' ? ZK : 1);
    show(); }

  /* ---------- the first time in a city ---------- */
  const pieces = () => { let n = 0; for (const c of cells.values()) n += c.sections.length; return n; };
  const wallPlots = () => { let n = 0; for (const c of cells.values()) if (c.wall && !c.mega) n++; return n; }, tiers = () => { let n = 0; for (const c of cells.values()) if (c.wall && !c.mega) n += c.wall.n || 0; return n; };
  const gates = () => { let n = 0; for (const c of cells.values()) if (c.wall && c.wall.gate) n++; return n; };
  const MAIN = { key: KEY, st, name: 'OPERATOR NOTE', end: 'Tutorial complete. Keep building: more buildings and megastructures unlock as your city grows. All controls are under Hover for controls. To replay this tutorial, open Game Settings and scroll down.', beats: [
    { id: 'zoom', say: 'Scroll the mouse wheel to zoom in and out (or press + and \u2212)', ghost: 'up', arm: () => { const z = zoomT; return () => Math.abs(zoomT - z) > .3; } },
    { id: 'tile', say: 'Click the sky beside the platform to add a tile', ghost: 'tap', arm: () => { let ok = false; const f = () => { ok = true; }; addEventListener('nt:tile', f, { once: true }); return () => ok; } },
    // (a click on an empty tile cycles its surface only with no zone picked: with one picked it builds, so the beat is passed over)
    { id: 'surface', say: 'Click a tile to cycle its surface', ghost: 'tap', skipIf: () => !!S.zone, arm: () => { let ok = false; const f = () => { ok = true; }; addEventListener('nt:surface', f, { once: true }); return () => ok || !!S.zone; } },
    // (with no zone picked, Space puts the view in tilt mode, W and S tilting it; Space again goes back. Done once it's been on and is off again)
    { id: 'tilt', say: 'With no zone picked, press Space, then drag the mouse up or down to change the view\'s angle (W and S work too). Space again goes back', ghost: 'up', skipIf: () => !!S.zone,
      arm: () => { let was = false; return () => { if (typeof tiltMode !== 'undefined' && tiltMode) was = true; return (was && !tiltMode) || !!S.zone; }; } },
    { id: 'zone', say: 'Pick a zone card below to choose what to build', ghost: 'tap', arm: () => () => !!S.zone },
    { id: 'build', say: 'Click a tile to place a building', ghost: 'tap', arm: () => { const n = built(); return () => built() > n; } },
    { id: 'side', say: 'You can build on the side of buildings too: click a building\'s wall', ghost: 'tap', arm: () => { let ok = false; const f = () => { ok = true; }; addEventListener('nt:side', f, { once: true }); return () => ok; } },
    { id: 'floor', say: 'With a zone picked, point at a tile or roof and press Space to build a single floor', ghost: 'tap', arm: () => { const n = pieces(); return () => pieces() > n; } },
    // (tap Shift: the height pick, moving the mouse up or down; a click builds there. Done once a pick has been made and something built)
    { id: 'shift', say: 'Point at a tile or a building\'s rooftop, tap Shift and move the mouse up or down to start a building higher, then click to build it', ghost: 'drag',
      arm: () => { let was = false, e0 = 0; return () => { if (typeof HL !== 'undefined' && HL){ was = true; e0 = SC_EDITS; } return was && !HL && SC_EDITS > e0; }; } },   // (SC_EDITS: any edit, world.js; a pick can make a scaffold, a pod or a section)
    // deleting (owner, Nov 4): one piece with a right-click (the top of a building comes off), a whole area in delete mode
    { id: 'remove', say: 'Right-click a building to remove its top piece', ghost: 'tap', arm: () => { const n = pieces(); let ok = false; addEventListener('nt:remove', () => { ok = true; }, { once: true }); return () => ok || pieces() < n; } },
    { id: 'restore', say: 'Changed your mind? Click Restore beside the pointer to bring it back', ghost: 'tap', skipIf: () => !document.querySelector('.pcrestore:not([hidden])'),
      arm: () => { let ok = false; addEventListener('nt:restore', () => { ok = true; }, { once: true }); return () => ok || !document.querySelector('.pcrestore:not([hidden])'); } },   // (its six seconds run out: on)
    { id: 'erase', say: 'Press X (or the \u2715 button) for delete mode, drag to select an area, then click inside it to delete it', ghost: 'drag',
      arm: () => { let ok = false; addEventListener('nt:erase', () => { ok = true; }, { once: true }); return () => ok; } },
    { id: 'erasex', say: 'Press X again to leave delete mode', ghost: 'tap', skipIf: () => typeof delMode === 'undefined' || !delMode, arm: () => () => typeof delMode === 'undefined' || !delMode },
    // walls and gates (owner, Nov 4): the Perimeter button under each zone card, a wall, a gate, and back to building
    { id: 'perim', say: 'For walls, click Perimeter under a zone card', ghost: 'tap', arm: () => () => typeof PERIM !== 'undefined' && !!PERIM },
    { id: 'wall', say: 'Click an empty tile or the open sky to place a wall', ghost: 'tap', arm: () => { const n = wallPlots(); return () => wallPlots() > n; } },
    { id: 'stack', say: 'Click the top of a wall to stack it higher', ghost: 'tap', arm: () => { const n = tiers(); return () => tiers() > n; } },
    { id: 'gate', say: 'Click a wall\'s face to turn it into a gate (click again to switch it back). A gate can\'t go where another wall blocks it', ghost: 'tap', arm: () => { const g = gates(); return () => gates() !== g; } },
    { id: 'perimoff', say: 'Click Perimeter again (or pick a zone card) to go back to building', ghost: 'tap', arm: () => () => typeof PERIM === 'undefined' || !PERIM },
  ] };

  /* ---------- the transit modes, the first time each is turned on ---------- */
  const hwOpen = () => typeof highways !== 'undefined' ? highways.filter(h => !h.done) : [], tilesOf = a => a.reduce((n, l) => n + l.tiles.length, 0);
  const doneOf = a => a.filter(l => l.done).length;
  const HW = { key: 'neonIsland.tutPCHw', name: 'SKY HIGHWAY', mode: () => typeof hwMode !== 'undefined' && hwMode,
    end: 'Right-click a piece to cut the road back. Every control is under Instructions.', beats: [
    { id: 'start', say: 'Click a plot to start a highway', ghost: 'tap', arm: () => { const n = highways.length; return () => highways.length > n; } },
    { id: 'height', say: 'Press [ or ] to set the height of the next piece', ghost: 'tap', arm: () => { const L = hwLevel; return () => hwLevel !== L; } },
    { id: 'extend', say: 'Point at the end of the road and tap Shift. Move the mouse to plan the route (blue), click to build it. Right-click cancels', ghost: 'tap', arm: () => { const n = tilesOf(hwOpen()); return () => tilesOf(hwOpen()) > n; } },
    { id: 'finish', say: 'Click the last piece to add the drop-off', ghost: 'tap', arm: () => { const n = doneOf(highways); return () => doneOf(highways) > n; } },
  ] };
  const MT = { key: 'neonIsland.tutPCMt', name: 'METRO', mode: () => typeof mtMode !== 'undefined' && mtMode,
    end: 'Click a straight piece to add a station. Right-click a piece to cut the line back.', beats: [
    { id: 'start', say: 'Click a plot to place the first station', ghost: 'tap', arm: () => { const n = metros.length; return () => metros.length > n; } },
    { id: 'extend', say: 'Point at the station at either end of the line and tap Shift. Move the mouse to plan the track (blue), click to build it. Right-click cancels', ghost: 'tap', arm: () => { const n = tilesOf(metros); return () => tilesOf(metros) > n; } },
    { id: 'finish', say: 'Click the last piece to finish it with a station', ghost: 'tap', arm: () => { const n = doneOf(metros); return () => doneOf(metros) > n; } },
  ] };
  for (const r of [HW, MT]) r.st = load(r.key, st.existing ? { done: true, beats: {}, existing: true } : { done: false, beats: {} });

  /* ---------- the megastructures' notes ---------- */
  const OPENS = { radio: 'Psycho-Acoustic Grid', spire: 'Data Spire', police: 'police station' };
  let megaSeen = null;   // (the megastructures there when the city was first ready: a city loaded with some already doesn't announce them)
  function megaNotes(){
    if (typeof megas === 'undefined') return;
    if (!megaSeen){ megaSeen = new Set([...megas.values()].map(m => m.id)); return; }
    for (const m of megas.values()){
      if (megaSeen.has(m.id)) continue; megaSeen.add(m.id);
      if (st.existing) continue;
      if (!tips.turn){ tips.turn = 1; save(TIPS_KEY, tips); tip('A megastructure has arrived. Point at it and press R to turn it.', 8000); }
      if (OPENS[m.kind] && !tips['open_' + m.kind]){ tips['open_' + m.kind] = 1; save(TIPS_KEY, tips); tip('Double-click the ' + OPENS[m.kind] + ' to open it.', 7000); }
    }
  }

  setInterval(() => {
    if (!ready()){ if (R.run) ov.hidden = true; return; }
    megaNotes();
    if (R.run){
      const r = R.run; ov.hidden = !!(r.mode && !r.mode());   // (a transit mode turned off: its note waits, and comes back with it)
      if (!ov.hidden && R.test && R.test()){ const m = r.st.beats[r.beats[R.k].id]; if (m){ m.done++; save(r.key, r.st); } R.k++; if (R.k >= r.beats.length) finish(false); else show(); }
      if (r !== MAIN && ov.hidden && [HW, MT].some(o => o !== r && !o.st.done && o.mode())){ R.run = null; R.test = null; }   // (the other mode on, its own still to come: this one starts over next time)
      return;
    }
    if (!st.done){ begin(MAIN); return; }
    for (const r of [HW, MT]) if (!r.st.done && r.mode()){ tipEl.hidden = true; begin(r); return; }
  }, 300);

  U.replay = () => { if (R.run) finish(true); for (const r of [MAIN, HW, MT]){ r.st.done = false; r.st.existing = false; save(r.key, r.st); } st.existing = false; };
  U.on = () => !!R.run;
  return U;
})();
