// Neon Terrarium: the Psycho-Acoustic Grid (the city's broadcast). Music plays only while the Grid stands.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// The Grid replaces the old radio (which played recorded songs with a host): the district's music is now made live by
// the sound engine in grid_engine.js, out of carrier chords, soft pads, neuro-trigger melodies and drifting grain
// clouds, never the same twice. This file is the part that talks to the game:
//  - the Grid building (kind 'radio' in mega.js: its saved name stays, so old cities load) starts the broadcast once it
//    has fully arrived, and taking it down fades the broadcast out and stops it;
//  - the player in the corner (index.html #gridDeck): the program name, the carrier chord and mood, a live spectrum drawn
//    from the music itself, previous / pause / next program, and the Acoustic Panel button;
//  - the Acoustic Panel (grid_panel.js), opened by that button or by double-clicking the building, with every control;
//  - the programs (a program is a set of layers: the neuro-phrase feed, the sedation bed, the auto-governor);
//  - the volume (Settings, Sound), the hold while the Overseer's desk is up, and what the player last set.
// The old object `music` is kept (volume, hold, update) so the rest of the game talks to the Grid the way it did the radio.
const MUSIC_VOL_KEY = 'neonIsland.musicVolume', GRID_KEY = 'neonIsland.gridSettings2';   // (2: the defaults changed, so settings saved before them start over)
const GRID_FADE_IN = 8, GRID_FADE_QUICK = .6, GRID_FADE_OUT = 1.5;   // seconds
// the programs: what the Grid broadcasts. Each is a set of layers switched on together.
const GRID_PROGRAMS = [
  { id: 'hum',    name: 'District hum',     sub: 'Soft pads, a drifting neuro-phrase and grain mist', lead: true,  ambient: true,  auto: true },
  { id: 'sleep',  name: 'Night sedation',   sub: 'Slow pads, a few pings, nothing sharp',            lead: false, ambient: true,  auto: true },
  { id: 'commute',name: 'Commute loop',     sub: 'The carrier with the neuro-phrase on top',         lead: true,  ambient: false, auto: true },
  { id: 'carrier',name: 'Carrier only',     sub: 'Just the harmonics and the occasional ping',       lead: false, ambient: false, auto: true },
];
const gridClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const music = (() => {
  const E = GRID_ENGINE, PNL = GRIDPANEL, $q = id => document.getElementById(id);
  let on = false, paused = false, held = false, level = 0, fadeIn = GRID_FADE_IN, volume = .6, prog = 0, restored = false;
  try { const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY)); if (!isNaN(v)) volume = gridClamp(v, 0, 1); } catch (e) {}
  E.volume = 0;

  // ---------- what the player last set ----------
  const sliders = () => [...PNL.el.querySelectorAll('input[type=range]')];
  let saveT = 0;
  function save(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        const o = { prog, s: {}, sel: {}, mode: E.mode, subdiv: E.subdiv, q: PNL.el.querySelector('#g-quantizeToggleBtn').classList.contains('on'), m: PNL.el.querySelector('#g-markovToggleBtn').classList.contains('on'), lead: E.leadOn, amb: E.ambientOn, auto: E.autoOn };
        sliders().forEach(r => { o.s[r.id.slice(2)] = r.value; });
        PNL.el.querySelectorAll('select').forEach(s => { o.sel[s.id.slice(2)] = s.value; });
        localStorage.setItem(GRID_KEY, JSON.stringify(o));
      } catch (e) {}
    }, 500);
  }
  function restore(){
    let o = null; try { o = JSON.parse(localStorage.getItem(GRID_KEY) || 'null'); } catch (e) {}
    if (o && o.s) sliders().forEach(r => { const v = o.s[r.id.slice(2)]; if (v !== undefined){ r.value = v; r.dispatchEvent(new Event('input')); } });
    else sliders().forEach(r => r.dispatchEvent(new Event('input')));   // fills in the readouts
    // a first build starts as: District hum (ambient chords, the lead loop and the autopilot all on), on Sector 01, Midwest Sunset
    if (!o){ const ps = PNL.el.querySelector('#g-progressionSelect'); ps.value = '0'; ps.dispatchEvent(new Event('change')); prog = 0; }
    if (o && o.sel) PNL.el.querySelectorAll('select').forEach(s => { const v = o.sel[s.id.slice(2)]; if (v !== undefined){ s.value = v; s.dispatchEvent(new Event('change')); } });
    const click = (sel, want) => { const b = PNL.el.querySelector(sel); if (b && want) b.click(); };
    if (o){
      if (o.mode && o.mode !== E.mode) click(`.micro-mode-btn[data-mode="${o.mode}"]`, 1);
      if (o.subdiv && o.subdiv !== E.subdiv) click(`.subdiv-btn[data-subdiv="${o.subdiv}"]`, 1);
      if (o.q === false) click('#g-quantizeToggleBtn', 1);
      if (o.m === true) click('#g-markovToggleBtn', 1);
      if (typeof o.prog === 'number' && GRID_PROGRAMS[o.prog]) prog = o.prog;
    }
    restored = true;
  }

  // ---------- the programs ----------
  function applyProgram(k, fromUser){
    prog = ((k % GRID_PROGRAMS.length) + GRID_PROGRAMS.length) % GRID_PROGRAMS.length;
    const p = GRID_PROGRAMS[prog];
    if (E.ambientOn !== p.ambient) E.setAmbient(p.ambient);
    if (E.leadOn !== p.lead) E.setLead(p.lead);
    if (E.autoOn !== p.auto) E.setAuto(p.auto);
    ui.program(); if (fromUser) save();
  }

  // ---------- the engine runs while the Grid stands, is not paused, and the city isn't held ----------
  const want = () => on && !paused && !held;
  function tick(dt){
    const w = want();
    if (w && !E.playing){ if (!E.ctx) E.initAudio(); E.toggle(); E.resume(); if (!tickProgDone){ tickProgDone = true; applyProgram(prog); } }
    // audio can only start after a click: when it's blocked, the next click wakes it
    if (w && E.ctx && E.ctx.state === 'suspended') E.resume();
    const target = w ? 1 : 0;
    level = target > level ? Math.min(1, level + dt/fadeIn) : Math.max(0, level - dt/(!on ? GRID_FADE_OUT : held ? .45 : GRID_FADE_QUICK));
    if (level >= 1) fadeIn = GRID_FADE_QUICK;
    const v = level*level*volume;
    if (E.out && E.ctx) E.out.gain.setTargetAtTime(v, E.ctx.currentTime, .05); else E.volume = v;
    if (!w && level <= 0.001 && E.playing) E.toggle();   // faded out: stop the engine (it holds where it is)
  }
  let tickProgDone = false, lastT = performance.now();
  setInterval(() => { const n = performance.now(), dt = Math.min(.25, (n - lastT)/1000); lastT = n; tick(dt); }, 50);
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (want() && E.ctx && E.ctx.state === 'suspended') E.resume(); }, { capture: true, passive: true });

  // the Grid building: starts once its arrival animation is over, and carries on if it is rebuilt in place (turned with R)
  function setOn(v){
    if (v === on) return;
    on = v; paused = false; ui.show(on); ui.paused(false);
    if (on){ fadeIn = GRID_FADE_IN; level = 0; tickProgDone = false; }
  }
  function update(){
    let grid = null;
    if (typeof megas !== 'undefined') for (const m of megas.values()) if (m.kind === 'radio'){
      if (!m.arrived && !anims.some(a => a.c === m)) m.arrived = true;
      if (m.arrived) grid = m;
    }
    setOn(!!grid);
  }
  function setVolume(v){ volume = v; try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (e) {} }
  function togglePause(){ if (!on) return; paused = !paused; if (!paused){ fadeIn = GRID_FADE_QUICK; level = 0; } ui.paused(paused); }
  function skip(){ if (on) applyProgram(prog + 1, true); }
  function back(){ if (on) applyProgram(prog - 1, true); }
  // held (the Overseer's desk is up): fades out fast and stops where it is; let go, it comes back in quickly
  function hold(b){ if (b === held) return; held = b; if (!b){ fadeIn = GRID_FADE_QUICK; level = 0; } }

  // ---------- drawing: the spectrum, as curves and bars ----------
  const NB = 56, sm = { deck: new Float32Array(NB), panel: new Float32Array(NB) }, centroid = { deck: .5, panel: .5 };
  let bins = null, bands = new Float32Array(NB);
  function readBands(dt){
    const an = E.analyser;
    if (an && E.playing && level > .02){
      if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(bins);
      const n = bins.length, top = n*.8;
      for (let k = 0; k < NB; k++){
        const a = Math.floor(Math.pow(top, k/NB)), b = Math.max(a + 1, Math.floor(Math.pow(top, (k + 1)/NB)));
        let v = 0; for (let q = a; q < b && q < n; q++) v = Math.max(v, bins[q]);
        bands[k] = Math.pow(v/255, 1.4)*(1 + k*.012*NB/10);
      }
    } else for (let k = 0; k < NB; k++) bands[k] *= Math.max(0, 1 - dt*3);
  }
  function drawSignal(curve, barsCv, key, pal, t, dt){
    if (curve){
      const g = curve.getContext('2d'), w = curve.width, h = curve.height, s = sm[key];
      g.fillStyle = pal.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = pal.grid; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= 8; x++){ const X = Math.round(x*w/8) + .5; g.moveTo(X, 0); g.lineTo(X, h); }
      for (let y = 1; y < 4; y++){ const Y = Math.round(y*h/4) + .5; g.moveTo(0, Y); g.lineTo(w, Y); }
      g.stroke();
      let sum = 0, mass = 0;
      for (let k = 0; k < NB; k++){ const v = bands[k]; s[k] += (v - s[k])*Math.min(1, dt*9); sum += s[k]*k; mass += s[k]; }
      const cx = mass > .05 ? sum/mass/(NB - 1) : .5; centroid[key] += (cx - centroid[key])*Math.min(1, dt*2);
      const mid = h*.5, amp = h*.5;
      const trace = (sgn, scale, col, lw, glow) => {
        g.beginPath(); g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = glow || 'transparent'; g.shadowBlur = glow ? 7 : 0;
        for (let k = 0; k < NB; k++){
          const x = k/(NB - 1)*w, idle = Math.sin(k*.45 + t*.9)*.03 + Math.sin(k*.17 - t*.5)*.04;
          const y = mid - sgn*((s[k] - .28)*amp*scale + idle*amp);
          if (k === 0) g.moveTo(x, y); else { const px = (k - 1)/(NB - 1)*w; g.quadraticCurveTo(px, g.__py, (px + x)/2, (g.__py + y)/2); }
          g.__py = y;
        }
        g.stroke(); g.shadowBlur = 0;
      };
      trace(-1, .7, pal.dim, 1.2); trace(1, 1, pal.line, 2, pal.glow);
      g.strokeStyle = pal.mark; g.lineWidth = 1; const X = Math.round(centroid[key]*w) + .5; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, h); g.stroke();
      if (h >= 70){ g.fillStyle = pal.tick; g.font = '9px JetBrains Mono, monospace'; g.fillText('100', 6, h - 4); g.fillText('1K', w*.31, h - 4); g.fillText('10K Hz', w - 44, h - 4); }
    }
    if (barsCv){
      const g = barsCv.getContext('2d'), w = barsCv.width, h = barsCv.height, nb = Math.min(NB, Math.floor(w/5)), bw = w/nb, mid = h*.5;
      g.fillStyle = pal.bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = pal.grid; g.beginPath(); g.moveTo(0, Math.round(mid) + .5); g.lineTo(w, Math.round(mid) + .5); g.stroke();
      for (let i = 0; i < nb; i++){
        const k = Math.floor(i/nb*NB), a = bands[Math.max(0, k - 2)], b = bands[Math.min(NB - 1, k + 2)], v = bands[k];
        const d = gridClamp((v - (a + b)/2)*2.2 + (v - .25)*.9 + Math.sin(i*.9 + t*1.3)*.015, -1, 1);
        const bh = Math.max(1, Math.abs(d)*(mid - 2));
        g.fillStyle = d >= 0 ? pal.bar : pal.barNeg;
        if (d >= 0) g.fillRect(Math.floor(i*bw) + 1, mid - bh, Math.max(2, bw - 2), bh); else g.fillRect(Math.floor(i*bw) + 1, mid, Math.max(2, bw - 2), bh);
      }
    }
  }
  const PAL_DECK = { bg: '#0b1a2c', grid: 'rgba(110,160,200,.13)', line: '#f2c94c', glow: 'rgba(242,201,76,.8)', dim: 'rgba(242,201,76,.38)', mark: '#d9453d', bar: '#5aaed1', barNeg: '#3d7f9c', tick: '#6f8da3' };
  const PAL_PANEL = { bg: 'rgba(3,12,16,.85)', grid: 'rgba(95,216,222,.12)', line: '#e8d553', glow: 'rgba(232,213,83,.8)', dim: 'rgba(232,213,83,.34)', mark: '#e5379f', bar: '#5fd8de', barNeg: '#e5379f', tick: '#4f8c94' };

  // ---------- the player in the corner ----------
  const ui = (() => {
    const deck = $q('gridDeck');
    if (!deck) return { show(){}, paused(){}, program(){}, text(){} };
    const playBtn = $q('gdPlay'), prog$ = $q('gdProg'), chord$ = $q('gdChord'), clock$ = $q('gdClock'), curve = $q('gdCurve'), barsCv = $q('gdBars');
    $q('gdPrev').addEventListener('click', () => back());
    $q('gdNext').addEventListener('click', () => skip());
    playBtn.addEventListener('click', () => togglePause());
    $q('gdPanel').addEventListener('click', () => PANEL.show());
    let lastTxt = '';
    // the Buildings menu sits under the player: measure where the player ends
    function place(){ requestAnimationFrame(() => { const r = deck.getBoundingClientRect(); if (r.height) document.documentElement.style.setProperty('--gdeck-b', Math.ceil(r.bottom) + 'px'); }); }
    addEventListener('resize', place);
    return {
      show(v){ deck.classList.toggle('live', v); deck.setAttribute('aria-hidden', v ? 'false' : 'true'); deck.inert = !v; document.documentElement.classList.toggle('gdeck-on', v); place(); },
      paused(p){ playBtn.classList.toggle('paused', p); playBtn.setAttribute('aria-label', p ? 'Resume broadcast' : 'Hold broadcast'); playBtn.title = p ? 'Resume' : 'Hold'; deck.classList.toggle('held', p); },
      program(){ const p = GRID_PROGRAMS[prog]; prog$.textContent = p.name; prog$.title = p.sub; const pp = $q('gpProg'); if (pp) pp.textContent = p.name.toUpperCase(); PANEL.syncPrograms(); },
      text(){
        const c = E.chord, name = c ? c.name : '', mood = E.mood || '', bpm = E.bpm;
        const s = name + '|' + bpm; if (s === lastTxt) return; lastTxt = s;
        chord$.textContent = name ? 'Carrier ' + name : ''; clock$.textContent = String(bpm);
      },
      draw(t, dt){ if (!deck.classList.contains('live')) return; drawSignal(curve, barsCv, 'deck', PAL_DECK, t, dt); },
    };
  })();

  // ---------- the Acoustic Panel ----------
  const PANEL = (() => {
    const el = PNL.el, P = { open: false };
    const programs = $q('gpPrograms');
    GRID_PROGRAMS.forEach((p, i) => {
      const b = document.createElement('button'); b.className = 'gb'; b.dataset.prog = String(i); b.innerHTML = p.name + '<small>' + p.sub + '</small>';
      b.addEventListener('click', () => applyProgram(i, true)); programs.appendChild(b);
    });
    P.syncPrograms = () => { programs.querySelectorAll('.gb').forEach(b => b.classList.toggle('on', +b.dataset.prog === prog)); };
    const keyH = e => { if (!P.open) return; e.stopPropagation(); if (e.key === 'Escape'){ e.preventDefault(); P.hide(); } };
    P.show = () => {
      if (P.open) return; P.open = true; GRIDPANEL.open = true; GRIDPANEL.hold = true;
      if (typeof MON !== 'undefined' && MON.close) try { MON.close(); } catch (e){}
      el.classList.add('open'); document.documentElement.classList.add('gp-open'); addEventListener('keydown', keyH, true);
      sliders().forEach(PNL.fill); P.syncPrograms();
      const b = $q('gpClose'); if (b) b.focus({ preventScroll: true });
      sizeCanvases(); addEventListener('resize', sizeCanvases);
    };
    P.hide = () => {
      if (!P.open) return; P.open = false; GRIDPANEL.open = false; GRIDPANEL.hold = false;
      el.classList.remove('open'); document.documentElement.classList.remove('gp-open'); removeEventListener('keydown', keyH, true); removeEventListener('resize', sizeCanvases);
    };
    $q('gpClose').addEventListener('click', () => P.hide());
    const curve = $q('gpCurve'), barsCv = $q('gpBars');
    function sizeCanvases(){ for (const c of [curve, barsCv]){ const w = Math.max(200, Math.floor(c.clientWidth)); if (c.width !== w) c.width = w; } }
    // what the panel says about the broadcast, a few times a second
    let slow = 0;
    P.draw = (t, dt) => {
      if (!P.open) return;
      drawSignal(curve, barsCv, 'panel', PAL_PANEL, t, dt);
      slow -= dt; if (slow > 0) return; slow = .2;
      const c = E.chord, p = GRID_PROGRAMS[prog], live = E.playing && !paused;
      $q('gpLiveT').textContent = held ? 'HELD' : paused ? 'BROADCAST HELD' : live ? 'BROADCAST LIVE' : 'STANDBY';
      $q('gpChord').textContent = c ? c.name.toUpperCase() : 'CARRIER';
      $q('gpMood').textContent = (E.mood || (c && c.mood) || 'MOOD').toUpperCase();
      $q('gpClock').textContent = E.bpm + ' CYCLES/MIN';
      $q('gpProg').textContent = p.name.toUpperCase();
      $q('gpFrq').textContent = c ? Math.round(440*Math.pow(2, (noteMidi(c.notes[0]) - 69)/12)*10)/10 + 'HZ' : '0';
      $q('gpAmp').textContent = (level*volume).toFixed(2);
      $q('gpClk').textContent = E.bpm; $q('gpCad').textContent = E.subdiv; $q('gpMod').textContent = E.mode; $q('gpSt').textContent = E.frozen ? 'ON' : 'OFF';
      $q('gpRing').style.strokeDashoffset = String(289*(1 - gridClamp((E.bpm - 55)/(140 - 55), 0, 1)));
    };
    $q('gpClose').title = 'Close the panel (Esc)';
    return P;
  })();
  const noteMidi = n => { const m = /^([A-G])([b#]?)(-?\d+)$/.exec(n); if (!m) return 57; const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return (+m[3] + 1)*12 + base; };

  // the picture runs on its own clock (the game's frame loop stops while the panel is up)
  let rt = 0, textT = 0; const t0 = performance.now(); let lastD = t0, accD = 0;
  function loop(now){
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - lastD)/1000); lastD = now; accD += dt;
    if (!on && !PANEL.open) return;
    if (accD < 1/30) return;   // 30 frames a second is plenty for a trace
    const d = accD; accD = 0; rt = (now - t0)/1000;
    readBands(d);
    ui.draw(rt, d); PANEL.draw(rt, d);
    textT -= d; if (textT <= 0){ textT = .25; ui.text(); }
  }
  requestAnimationFrame(loop);

  // a double-click on the Grid building: the pointer's ray against its whole height (the plot's own pick box stops at the plinth)
  const _r = new THREE.Raycaster(), _n = new THREE.Vector2(), _b = new THREE.Box3(), _h = new THREE.Vector3();
  function gridAt(cx, cy){
    if (typeof megas === 'undefined') return null; const r = canvas.getBoundingClientRect(); _n.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1); _r.setFromCamera(_n, cam);
    for (const m of megas.values()){ if (m.kind !== 'radio') continue; const hx = m.w*LOT/2 - .4, hz = m.h*LOT/2 - .4;
      _b.min.set(m.x - hx, CURB, m.z - hz); _b.max.set(m.x + hx, (m.top || 40), m.z + hz); if (_r.ray.intersectBox(_b, _h)) return m; }
    return null;
  }
  canvas.addEventListener('dblclick', e => {
    if (PANEL.open || !on) return;
    if (typeof OVERSEER !== 'undefined' && OVERSEER.open) return;
    if (typeof hwMode !== 'undefined' && (hwMode || mtMode || megaPick || delMode)) return;
    if (gridAt(e.clientX, e.clientY)){ e.preventDefault(); PANEL.show(); }
  });

  // the panel remembers what the player set
  PNL.el.addEventListener('input', save, true); PNL.el.addEventListener('change', save, true); PNL.el.addEventListener('click', save, true);

  // start-up: the engine fills in the chart, then what the player last set is put back
  E.init(); restore(); ui.program(); ui.text();
  return { update, setVolume, skip, back, togglePause, hold, panel: PANEL, get held(){ return held; }, get volume(){ return volume; }, get on(){ return on; }, get paused(){ return paused; }, get level(){ return level; }, get program(){ return GRID_PROGRAMS[prog]; }, engine: E };
})();
