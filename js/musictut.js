// Neon Terrarium: the music tutorial (owner, Nov 13; the plan is claude/grid-booth-tutorial-plan.md). Computer and touch screen alike.
// Operator's notes that teach the Psycho-Acoustic Grid and its Acoustic Panel at the moment each part first matters, inside the real panel:
//  - the Grid (2 notes, in the city): the first time a Grid arrives and starts broadcasting, that the music is made live, and how to open the panel;
//  - the Console (4 notes): the first time the panel opens, that the shapes picture the music, Smog as a knob to try, how to put a knob back,
//    and that the Auto-governor moves the knobs by itself;
//  - the Booth (10 notes): from the first time the Booth opens to the player's own loop broadcast to the city: Play, the magic keys (no wrong
//    notes), holding a key across a chord change, Record, the loop, the Autopilot, Save, and picking the loop on the Console.
//  - later, one-line tips the first time a deeper feature is touched (a voice, Tidy timing, a song, Rewire, Activity, Stasis, Transform, Hold).
// Each note waits for the game to say it was done (the nt: events from grid_panel.js, grid_viz.js, grid.js and booth.js), and counts as learned
// whenever the player does the thing, even before the note would have come. Nothing is blocked or forced: the note sits beside the control it
// names, the control gets a slow outline pulse (no dimming, no spotlight), and Show me brings a hidden control into view only when pressed.
// Skip on every note; Settings replays the Grid notes and the Booth notes. A browser that played before this came (index.html's first line,
// neonIsland.tutMusic) isn't shown the Grid and Console notes unasked, and the Booth notes only if it had never opened the Booth.
// Kept in this browser, with each note's shown, done, skipped and Why? counts: neonIsland.tutPCGr / tutPCBo / tipsPCMusic on a computer,
// touch:nt.tutGr / tutBo / tipsMusic on a touch screen. #dev: Settings has Copy music tutorial stats.
// All game scripts share one scope and load in order (see index.html); this one after booth.js, pctut.js and tutorial.js.
'use strict';
const MUSICTUT = (() => {
  const U = { replayGrid(){}, replayBooth(){}, stats(){ return null; }, on(){ return false; } };
  if (typeof GRIDPANEL === 'undefined' || !GRIDPANEL.el || typeof BOOTH === 'undefined' || typeof music === 'undefined') return U;
  const TCH = typeof TOUCH !== 'undefined' && TOUCH.on;
  const PE = GRIDPANEL.el, $ = id => document.getElementById(id), q = s => PE.querySelector(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const KG = TCH ? 'touch:nt.tutGr' : 'neonIsland.tutPCGr', KB = TCH ? 'touch:nt.tutBo' : 'neonIsland.tutPCBo', KT = TCH ? 'touch:nt.tipsMusic' : 'neonIsland.tipsPCMusic';
  const OLD = load('neonIsland.tutMusic', {});   // { existing: played before this came, booth: had opened the Booth before }
  const fresh = () => ({ done: false, skipped: false, k: 0, learned: {}, beats: {} });
  const G = load(KG, { city: fresh(), con: fresh() }); if (!G.city) G.city = fresh(); if (!G.con) G.con = fresh();
  const BO = load(KB, fresh());
  const seenTips = load(KT, {});
  const armed = { city: false, con: false, bo: false };   // (a replay: shown even to a browser that played before)
  const T = (pc, tch) => TCH && tch ? tch : pc;
  const pro = () => BO.level === 'pro';
  const tipsOn = () => !TCH || (() => { try { return localStorage.getItem('touch:nt.tips') !== '0'; } catch (e) { return true; } })();

  /* ---------- where things are ---------- */
  const knobOf = id => { const r = $(id); return r ? r.closest('.gk') || r : null; };
  const firstKnob = () => { const all = [...PE.querySelectorAll('.gmain .gk')]; return all.find(vis) || all[0] || null; };
  const playing = () => { try { return BOOTH.isPlaying(); } catch (e) { return false; } };
  const bmode = () => (BOOTH.mode ? BOOTH.mode() : 'console');
  function vis(e){
    if (!e || !e.isConnected || e.closest('[hidden]')) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 4 && r.top < innerHeight - 4 && r.right > 4 && r.left < innerWidth - 4;
  }
  // the Console's sections on a touch screen: which one holds a control, and its name on the tab
  const SECNAME = { cast: 'Broadcast', clock: 'Clock', carrier: 'Carrier', air: 'Air' };
  const secOf = e => { const g = e && e.closest('.gmain > .gp'); return g && g.dataset.sec ? g.dataset.sec : null; };
  const dlgOpen = () => [...PE.querySelectorAll('.gdlg')].find(d => !d.hidden) || null;
  const cityReady = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on) && $('view') &&
    !(typeof OVERSEER !== 'undefined' && OVERSEER.open) && !(typeof PRECINCT !== 'undefined' && PRECINCT.open) && !(typeof FURN !== 'undefined' && (FURN.open || FURN.pick)) &&
    !document.documentElement.classList.contains('gp-open');
  // (the city's own tutorials come first: the Grid's notes wait until they're over)
  const otherTut = () => (typeof PCTUT !== 'undefined' && PCTUT.on()) || !!document.querySelector('.ttut:not([hidden])') || (typeof TUT !== 'undefined' && TUT.miniOn && TUT.miniOn());
  const context = () => GRIDPANEL.open ? (bmode() === 'booth' ? 'booth' : 'console') : cityReady() ? 'city' : null;

  /* ---------- the notes ---------- */
  // A beat: id, say (or a function of the context), sayT (touch), sayP (with "I play an instrument"), why / whyP, at() the control it names,
  // ctx (where it can show: city, console, booth or panel), gate(c) (shown only once true), done(c), timeout (seconds on screen), choice.
  // c is the beat's own count of what has happened since it came up (notes, passes, takes ...), reset each beat.
  const CITY = { id: 'city', st: () => G.city, key: KG, name: 'GRID NOTE', skip: 'Skip Grid notes', beats: [
    { id: 'G1', ctx: 'city', at: () => $('gridDeck'), timeout: 9,
      say: 'The Psycho-Acoustic Grid is now broadcasting. It makes the city\'s music live, so it never plays the same thing twice.',
      why: 'The music is built from rules while you listen: chords, melodies and textures are chosen as it plays, not loaded from a recording.' },
    { id: 'G2', ctx: 'city', at: () => TCH ? $('gridDeck') : $('gdPanel'), timeout: 20,
      say: 'Click Acoustic panel, or double-click the Grid building, to shape the music.', sayT: 'Tap the music player, then Acoustic panel, to shape the music.' },
  ] };
  const CON = { id: 'con', st: () => G.con, key: KG, name: 'CONSOLE NOTE', skip: 'Skip Grid notes', beats: [
    { id: 'C1', ctx: 'console', at: firstKnob,
      say: 'Each shape is a picture of one part of the music. Drag any knob up or down and watch its shape change as the sound does.',
      why: 'The shapes are drawn from the same numbers as the sound, so what you see is what you hear.' },
    { id: 'C2', ctx: 'console', at: () => knobOf('g-warmthFilterSlider'), arm: c => { c.v0 = +($('g-warmthFilterSlider') || { value: 0 }).value; },
      done: c => c.v0 - +$('g-warmthFilterSlider').value >= .2*(+$('g-warmthFilterSlider').max - +$('g-warmthFilterSlider').min) && c.knobbed,
      say: 'Try Smog: drag it down. It controls how bright or muffled the sound is, like hearing the city through fog.',
      why: 'Smog is a filter that removes high frequencies. Lower settings keep only the warm, low part of each sound.' },
    { id: 'C3', ctx: 'console', at: () => knobOf('g-warmthFilterSlider'),
      say: 'Double-click a knob to put it back where it started.', sayT: 'Double-tap a knob, or press and hold it and choose Reset, to put it back where it started.' },
    { id: 'C4', ctx: 'console', at: () => $('g-autopilotBtn'), timeout: 14,
      say: 'The Auto-governor slowly moves the knobs on its own as the mood shifts. Turn it off when you want your settings to stay exactly as you set them. The Booth tab, up top, is where you play your own music.',
      why: 'It changes tempo, density and the grain mode over minutes, so the broadcast keeps evolving even if you never touch it.' },
  ] };
  const BOO = { id: 'bo', st: () => BO, key: KB, name: 'BOOTH NOTE', skip: 'Skip Booth notes', beats: [
    { id: 'B0', ctx: 'booth', at: () => null, choice: true,
      say: 'Make a loop and play it to your city. The city is paused and the broadcast steps aside while you\'re here.' },
    { id: 'B1', ctx: 'booth', at: () => $('bPlay'), done: () => playing(),
      say: 'Press Play (or Space) to start the loop. The chords along the top of the roll are what you\'ll play over.',
      sayT: 'Tap Play to start the loop. The chords along the top of the roll are what you\'ll play over.',
      sayP: 'Play (or Space) starts the loop. The chords run along the top of the roll, one a bar.', sayPT: 'Play starts the loop. The chords run along the top of the roll, one a bar.' },
    { id: 'B2', ctx: 'booth', at: () => q('.b-keys'), done: c => c.notes >= 6,
      say: 'Play the magic keys: click them, or press Q to ] on your keyboard. Every key fits the chord playing now, so no note is wrong.',
      sayT: 'Tap the magic keys. Every key fits the chord playing now, so no note is wrong. Each shows its place in the chord: 1 is the root.',
      sayP: 'Play the keys (Q to ] on your keyboard). They\'re always retuned to the chord playing now, so every key is safe.',
      sayPT: 'Tap the keys. They\'re always retuned to the chord playing now; the mark under each is its scale degree in that chord.',
      why: 'Each key is a note of the chord sounding now, or a note picked to sound sweet with it. When the chord changes at a bar line, all twelve keys retune.',
      whyP: 'The twelve keys are the current chord\'s voicing plus its motif tones, low to high. At each bar line they\'re remapped to the new chord.' },
    { id: 'B3', ctx: 'booth', at: () => q('.b-keys'), gate: c => playing() && c.age > 1.2, done: c => c.passes >= 2 ? 'timeout' : false,   // (two passes without it: the note moves on)
      say: 'Hold a key down as the chord changes. Listen: the note slides to fit the new chord.',
      sayP: 'Hold a key across a bar line: it moves to its pitch in the next chord.',
      why: 'This is why nothing clashes. A held note moves to its key\'s new pitch, usually by a small step, the way a pianist moves one finger between chords.',
      whyP: 'A held note is re-voiced to the same key\'s pitch in the new chord, usually a step away: simple voice leading.' },
    { id: 'B4', ctx: 'booth', at: () => $('bRec'), done: c => c.takes > 0,
      say: c => c.empty ? 'Nothing was played during that take. Press Record and play the keys while the playhead runs.' : 'Press Record (or Enter) and play along. Recording starts at the next bar (after one bar of count-in if the loop is stopped) and runs for one pass.',
      sayT: c => c.empty ? 'Nothing was played during that take. Tap Record and play the keys while the playhead runs.' : 'Tap Record and play along. Recording starts at the next bar (after one bar of count-in if the loop is stopped) and runs for one pass.',
      sayP: c => c.empty ? 'That take was empty. Record again and play while the playhead runs.' : 'Record (or Enter) takes one pass from the next bar line. Tidy timing is on Gentle; set it to Off to keep your exact timing.',
      sayPT: c => c.empty ? 'That take was empty. Record again and play while the playhead runs.' : 'Record takes one pass from the next bar line. Tidy timing is on Gentle; set it to Off to keep your exact timing.' },
    { id: 'B5', ctx: 'booth', at: () => $('bRoll'), gate: c => playing() ? c.passes >= 1 : c.age > 1.5, done: c => c.passes >= 2 || c.takes > 0 || (!playing() && c.t > 12),
      say: 'Your take now loops: your notes are cyan on the roll. Record again to add a layer on top; Undo layer takes the last one off.',
      sayP: 'Takes stack as layers, in cyan. Undo layer takes the last one off.',
      why: 'A take is stored as keys, not pitches, so it still fits if you change the carrier pattern.',
      whyP: 'Takes are stored as key positions, not pitches, so a loop still fits another carrier pattern.' },
    { id: 'B6', ctx: 'booth', at: () => $('bAuto'), done: c => c.auto > 0, timeout: 45,
      say: () => BOOTH.state.ap ? 'The Autopilot is on. It treats your take as a theme and answers in the gaps you leave, in pink. It never plays over your notes.'
        : 'Press Autopilot. It treats your take as a theme and answers in the gaps you leave, in pink. It never plays over your notes.',
      sayT: () => BOOTH.state.ap ? 'The Autopilot is on. It treats your take as a theme and answers in the gaps you leave, in pink. It never plays over your notes.'
        : 'Tap Autopilot. It treats your take as a theme and answers in the gaps you leave, in pink. It never plays over your notes.',
      why: 'It answers with echoes, step-up repeats, flipped and shortened versions of your phrases, and a soft harmony under your long notes. It builds up over a few passes, then settles back.',
      whyP: 'It develops your phrases (echo, sequence, inversion, fragment) in a register above or below yours, adds a harmony under long notes, and never doubles your pitch.' },
    { id: 'B7', ctx: 'booth', at: () => $('bSave'), gate: c => !playing() || c.passes >= 1 || c.age > 20,
      say: 'Name your loop and press Save. It goes on the Loop shelf and is kept with this city.', sayT: 'Name your loop and tap Save. It goes on the Loop shelf and is kept with this city.',
      sayP: 'Name it and Save: the Loop shelf keeps it with this city.' },
    { id: 'B8', ctx: 'panel',
      at: () => bmode() === 'booth' ? q('.gtab[data-mode="console"]') : dlgOpen() === $('gDlg') ? $('gDlgLogged') : $('g-progressionSelect'),
      say: () => bmode() === 'booth' ? T('Now play it to the city: open the Console tab, then pick your loop in the carrier pattern list, under Booth shelf.', 'Now play it to the city: tap the Console tab, then pick your loop in the carrier pattern list, under Booth shelf.')
        : dlgOpen() === $('gDlg') ? 'Choose Broadcast as logged to send your loop out exactly as you recorded it.'
        : 'Pick your loop in the carrier pattern list, under Booth shelf.',
      showMe: () => { if (bmode() === 'booth'){ const t = q('.gtab[data-mode="console"]'); if (t) t.click(); } bring($('g-progressionSelect')); } },
    { id: 'B9', ctx: 'console', at: () => $('g-progressionSelect'), timeout: 11,
      say: 'Your loop is now the district\'s broadcast. Pick one of the planners\' patterns in the same list to go back. Hover any control for a short explanation.',
      sayT: 'Your loop is now the district\'s broadcast. Pick one of the planners\' patterns in the same list to go back. Press and hold any control for a short explanation.' },
  ] };
  const TRACKS = [CITY, CON, BOO];

  /* ---------- the note element ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .mtut, .mtip { position: fixed; left: 0; top: 0; z-index: 150; box-sizing: border-box; pointer-events: auto; }
  #gridPanel > .mtut, #gridPanel > .mtip { position: fixed; z-index: 60; }
  .mtut[hidden], .mtip[hidden] { display: none !important; }
  .mtut { width: min(390px, calc(100vw - 24px)); padding: 11px 14px 13px; background: rgba(18,10,4,.97); border: 1px dashed #ffb347; color: #ffe2b8;
    box-shadow: 0 8px 28px rgba(0,0,0,.55); font: 16px/1.4 'Chakra Petch', sans-serif; letter-spacing: .02em; text-align: left; }
  .mtut .mt-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .mtut .mt-hd small { flex: 1; font: 12px 'JetBrains Mono', monospace; letter-spacing: .14em; color: #ffb347; }
  .mtut .mt-say { display: block; font: 500 18px/1.38 'Chakra Petch', sans-serif; color: #ffe9c9; }
  .mtut .mt-where { display: block; margin-bottom: 4px; font: 13px 'JetBrains Mono', monospace; letter-spacing: .06em; color: #ffb347; }
  .mtut .mt-why { margin: 9px 0 0; padding-left: 9px; border-left: 2px solid rgba(255,179,71,.55); font-size: 15.5px; line-height: 1.42; color: #ffd8a3; }
  .mtut .mt-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
  .mtut .mt-row:empty { display: none; }
  .mtut button { min-height: 34px; padding: 6px 11px; font: 13px 'JetBrains Mono', monospace; letter-spacing: .04em; color: #ffb347; background: transparent;
    border: 1px solid rgba(255,179,71,.5); border-radius: 0; cursor: pointer; }
  .mtut button:hover { color: #fff; border-color: #ffb347; }
  .mtut .mt-x { min-height: 0; padding: 3px 8px; font-size: 12px; }
  .mtut .mt-ch { flex: 1 1 100%; text-align: left; font: 500 15px 'Chakra Petch', sans-serif; padding: 8px 12px; color: #ffe2b8; }
  .mtut .mt-ch small { display: block; font: 12.5px 'JetBrains Mono', monospace; color: #ffb347; letter-spacing: .02em; margin-top: 2px; }
  .mtut .mt-ar { position: absolute; width: 0; height: 0; border: 9px solid transparent; pointer-events: none; }
  .mtut .mt-ar[hidden] { display: none; }
  .mtut[data-side="below"] .mt-ar { top: -18px; border-bottom-color: #ffb347; }
  .mtut[data-side="above"] .mt-ar { bottom: -18px; border-top-color: #ffb347; }
  .mtut[data-side="right"] .mt-ar { left: -18px; border-right-color: #ffb347; }
  .mtut[data-side="left"] .mt-ar { right: -18px; border-left-color: #ffb347; }
  .mt-target { outline: 2px solid rgba(255,179,71,.95) !important; outline-offset: 2px; animation: mtPulse 1.6s ease-in-out infinite; }
  @keyframes mtPulse { 50% { outline-color: rgba(255,179,71,.22); } }
  html.nt-calm .mt-target, html.nt-clean .mt-target { animation: none; }
  .mtip { max-width: min(320px, calc(100vw - 24px)); padding: 9px 12px; background: rgba(18,10,4,.96); border: 1px solid rgba(255,179,71,.7); color: #ffe2b8;
    font: 15.5px/1.4 'Chakra Petch', sans-serif; letter-spacing: .02em; box-shadow: 0 6px 20px rgba(0,0,0,.5); pointer-events: none; }
  .mtip::before { content: '// TIP'; display: block; margin-bottom: 3px; font: 11.5px 'JetBrains Mono', monospace; letter-spacing: .14em; color: #ffb347; }
  html.touch .mtut button { min-height: 44px; }
  html.touch .mtut .mt-x { min-height: 36px; padding: 4px 10px; }
  `;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.className = 'mtut'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="mt-hd"><small></small><button type="button" class="mt-x"></button></div><span class="mt-where" hidden></span><b class="mt-say"></b><p class="mt-why" hidden></p><div class="mt-row"></div><i class="mt-ar"></i>';
  document.body.appendChild(el);
  const hd = el.querySelector('small'), xBtn = el.querySelector('.mt-x'), whereEl = el.querySelector('.mt-where'), sayEl = el.querySelector('.mt-say'), whyEl = el.querySelector('.mt-why'), row = el.querySelector('.mt-row'), arrow = el.querySelector('.mt-ar');
  const tipEl = document.createElement('div'); tipEl.className = 'mtip'; tipEl.hidden = true; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl);
  // (the notes live in the panel while it's up: everything else on the page is hidden behind it, grid_panel.js)
  const home = n => { const p = GRIDPANEL.open ? PE : document.body; if (n.parentNode !== p) p.appendChild(n); };
  // keep a press on a note from reaching the city or the panel's own handlers below it
  for (const n of [el]) for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel']) n.addEventListener(ev, e => e.stopPropagation(), { passive: true });

  /* ---------- the run ---------- */
  const R = { tr: null, b: null, c: null, shown: false, whyOpen: false, target: null, key: '' };
  const mark = (tr, id, what, n = 1) => { const st = tr.st(), m = st.beats[id] || (st.beats[id] = { shown: 0, done: 0, skip: 0, why: 0, hidden: 0, t: 0 }); m[what] = (m[what] || 0) + n; save(tr.key, tr === BOO ? BO : G); };
  const learn = (tr, id) => { const st = tr.st(); if (st.learned[id]) return; st.learned[id] = 1; save(tr.key, tr === BOO ? BO : G); };
  const pending = tr => { const st = tr.st(); if (st.done) return false;
    if (tr === CITY) return armed.city || (cityArmed && !OLD.existing);
    if (tr === CON) return armed.con || !OLD.existing;
    return armed.bo || !OLD.booth; };
  const counters = () => ({ t: 0, age: 0, notes: 0, passes: 0, takes: 0, empty: false, auto: 0, knobbed: false });
  function setTarget(t){ if (R.target === t) return; if (R.target) R.target.classList.remove('mt-target'); R.target = t; if (t) t.classList.add('mt-target'); }
  function hide(){ if (!el.hidden){ el.hidden = true; } setTarget(null); }
  function begin(tr){
    R.tr = tr; R.b = null; R.c = null; R.shown = false; R.whyOpen = false; R.key = '';
    xBtn.textContent = tr.skip;
  }
  function beat(){ const tr = R.tr; if (!tr) return null; const st = tr.st(); return tr.beats[st.k] || null; }
  function advance(how){
    const tr = R.tr, st = tr.st(), b = beat(); if (!b) return;
    if (R.shown){ mark(tr, b.id, how === 'done' ? 'done' : 'timeout'); mark(tr, b.id, 't', Math.round(R.c.t)); }
    learn(tr, b.id);
    st.k++; R.b = null; R.shown = false; R.whyOpen = false; R.key = ''; hide();
    if (st.k >= tr.beats.length) finish(tr, false); else save(tr.key, tr === BOO ? BO : G);
  }
  function finish(tr, skipped){
    const st = tr.st(); st.done = true; st.skipped = !!skipped; armed[tr.id] = false;
    if (skipped && (tr === CITY || tr === CON)){ for (const o of [CITY, CON]){ const s = o.st(); if (!s.done){ s.done = true; s.skipped = true; } armed[o.id] = false; } }
    save(tr.key, tr === BOO ? BO : G);
    if (R.tr === tr || (skipped && R.tr && (R.tr === CITY || R.tr === CON))){ R.tr = null; R.b = null; hide(); }
  }
  xBtn.addEventListener('click', () => { const tr = R.tr, b = beat(); if (!tr) return; if (b) mark(tr, b.id, 'skip'); finish(tr, true); });

  // what the note says now
  function words(b){
    const P = pro() && R.tr === BOO, pick = P ? T(b.sayP || b.say, b.sayPT || b.sayP || b.sayT || b.say) : T(b.say, b.sayT);
    return typeof pick === 'function' ? pick(R.c) : pick;
  }
  function render(b){
    const tr = R.tr, st = tr.st(), n = tr.beats.length;
    hd.textContent = '// ' + tr.name + ' ' + (st.k + 1) + ' / ' + n;
    sayEl.textContent = words(b);
    const why = pro() && R.tr === BOO ? (b.whyP || b.why) : b.why;
    whyEl.textContent = why || ''; whyEl.hidden = !(why && R.whyOpen);
    row.textContent = '';
    if (b.choice){
      const ch = (lvl, t, s) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'mt-ch'; x.innerHTML = t + (s ? '<small>' + s + '</small>' : '');
        x.addEventListener('click', () => { if (lvl === 'skip'){ mark(tr, b.id, 'skip'); finish(tr, true); return; } BO.level = lvl; save(KB, BO); advance('done'); }); row.appendChild(x); };
      ch('new', 'New to making music', 'Short steps in plain words'); ch('pro', 'I play an instrument', 'The same steps, in music terms'); ch('skip', 'Skip these notes', 'Settings can show them again');
    }
    if (why){ const w = document.createElement('button'); w.type = 'button'; w.textContent = R.whyOpen ? 'Hide why' : 'Why?';
      w.addEventListener('click', () => { R.whyOpen = !R.whyOpen; if (R.whyOpen) mark(tr, b.id, 'why'); R.key = ''; }); row.appendChild(w); }
    const t = b.at && b.at(), needShow = b.showMe || (t && !vis(t));
    if (needShow && !(b.id === 'B8' && bmode() !== 'booth' && vis(t))){ const s = document.createElement('button'); s.type = 'button'; s.textContent = 'Show me';
      s.addEventListener('click', () => { mark(tr, b.id, 'showme'); if (b.showMe) b.showMe(); else bring(b.at()); R.key = ''; }); row.appendChild(s); }
    // the control isn't in view: say where it is
    const sec = t && !vis(t) && TCH ? secOf(t) : null;
    whereEl.hidden = !sec; whereEl.textContent = sec ? 'In the ' + SECNAME[sec] + ' tab' : '';
  }
  // Show me: brings a control into view (the Console's section on a touch screen, then a scroll), only when the player asks
  function bring(t){
    if (!t) return;
    const sec = TCH ? secOf(t) : null; if (sec){ const s = q('.gsect[data-sec="' + sec + '"]'); if (s && !s.classList.contains('on')) s.click(); }
    requestAnimationFrame(() => { try { t.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { t.scrollIntoView(); } });
  }

  // placing the note beside its control, never over the roll or the keys while the Booth plays
  const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  function place(t){
    const W = innerWidth, H = innerHeight, m = 10, gap = 14;
    const tb = t && vis(t) ? box(t) : null, tpad = tb && { l: tb.l - 6, t: tb.t - 6, r: tb.r + 6, b: tb.b + 6 };
    // (the roll and the keys stay clear while the loop plays: what the player is listening to and playing on)
    // (on a phone there's seldom room for both: then the roll may be covered, never the keys the player is pressing)
    const roll = [], keys = [];
    if (GRIDPANEL.open && bmode() === 'booth' && playing()) for (const [s, a] of [['#bRoll', roll], ['.b-keys', keys]]){ const e = q(s); if (e && vis(e) && e !== t && !(t && e.contains(t))) a.push(box(e)); }
    const minT = GRIDPANEL.open ? (() => { const g = q('.gtop'); return g ? Math.max(m, g.getBoundingClientRect().bottom + 6) : m; })() : m;
    const put = (p, side) => { el.dataset.side = side; arrow.hidden = side === 'none'; el.style.transform = 'translate(' + Math.round(p.l) + 'px,' + Math.round(p.t) + 'px)'; };
    // a full-width note first, then a narrower one that can sit in a side column
    for (const avoid of [roll.concat(keys), keys]) for (const want of [390, 300]){
      const w = Math.min(want, W - 2*m); el.style.width = w + 'px';
      const nw = el.offsetWidth, nh = el.offsetHeight;
      const free = (l, y) => { const r = { l, t: y, r: l + nw, b: y + nh };
        return l >= m && y >= minT && r.r <= W - m && r.b <= H - m && !(tpad && hit(r, tpad)) && !avoid.some(a => hit(r, a)); };
      const clampX = x => Math.max(m, Math.min(W - m - nw, x)), clampY = y => Math.max(minT, Math.min(H - m - nh, y));
      if (tb){
        // beside it, with the pointer: below, above, right, left
        const cx = tb.l + tb.w/2, cy = tb.t + tb.h/2;
        const cands = [['below', clampX(cx - nw/2), tb.b + gap], ['above', clampX(cx - nw/2), tb.t - gap - nh], ['right', tb.r + gap, clampY(cy - nh/2)], ['left', tb.l - gap - nw, clampY(cy - nh/2)]];
        const c = cands.find(([, l, y]) => free(l, y));
        if (c){
          const [side, l, y] = c;
          if (side === 'below' || side === 'above'){ arrow.style.left = Math.max(10, Math.min(nw - 28, cx - l - 9)) + 'px'; arrow.style.top = ''; }
          else { arrow.style.top = Math.max(10, Math.min(nh - 28, cy - y - 9)) + 'px'; arrow.style.left = ''; }
          put({ l, t: y }, side); return;
        }
      }
      // otherwise the nearest clear spot to it (or, with nothing to point at, the top centre), no pointer: the outline marks the control
      let best = null, bd = Infinity;
      const tx = tb ? tb.l + tb.w/2 : W/2, ty = tb ? tb.t + tb.h/2 : minT;
      for (let y = minT; y + nh <= H - m; y += 20) for (let x = m; x + nw <= W - m; x += 20){
        if (!free(x, y)) continue; const d = Math.hypot(x + nw/2 - tx, (y + (tb ? nh/2 : 0)) - ty); if (d < bd){ bd = d; best = { l: x, t: y }; } }
      if (!tb && free(clampX((W - nw)/2), minT)) best = { l: clampX((W - nw)/2), t: minT };
      if (best){ put(best, 'none'); return; }
    }
    // no clear spot at all (a small screen): the spot that covers least, keys first, then the control, then the roll
    el.style.width = Math.min(390, W - 2*m) + 'px';
    const nw = el.offsetWidth, nh = el.offsetHeight, ov = (r, a) => Math.max(0, Math.min(r.r, a.r) - Math.max(r.l, a.l))*Math.max(0, Math.min(r.b, a.b) - Math.max(r.t, a.t));
    let best = { l: Math.max(m, (W - nw)/2), t: minT }, bs = Infinity;
    for (let y = minT; y + nh <= H - m || y === minT; y += 20){ for (let x = m; x + nw <= W - m || x === m; x += 20){
      const r = { l: x, t: y, r: x + nw, b: y + nh }; let sc = 0;
      for (const a of keys) sc += 4*ov(r, a); if (tpad) sc += 3*ov(r, tpad); for (const a of roll) sc += ov(r, a);
      if (sc < bs){ bs = sc; best = { l: x, t: y }; } }
      if (y + nh > H - m) break; }
    put(best, 'none');
  }

  /* ---------- what happens in the game ---------- */
  const on = (n, f) => addEventListener('nt:' + n, e => { try { f(e.detail || {}); } catch (err) {} });
  const bump = (k, n = 1) => { if (R.c) R.c[k] += n; };
  let totNotes = 0;
  on('booth-play', () => learn(BOO, 'B1'));
  on('booth-note', () => { bump('notes'); totNotes++; if (totNotes >= 6) learn(BOO, 'B2'); });
  on('booth-retune', () => learn(BOO, 'B3'));
  on('booth-take', d => { if (d.n > 0){ bump('takes'); learn(BOO, 'B4'); if (d.layers >= 2) learn(BOO, 'B5'); } else if (R.c && R.b && R.b.id === 'B4'){ R.c.empty = true; R.key = ''; mark(BOO, 'B4', 'empty'); }
    if (d.n > 0 && d.off/d.n > .4 && d.tidy < 1) tipLater('tidy', 400);
    if (d.layers >= 2) tipLater('del', 1500); });
  let autoPass = 0, autoThisPass = false;
  on('booth-pass', d => { if (d.bc) return; bump('passes'); if (autoThisPass){ autoPass++; if (autoPass >= 2) tipLater('answer', 300); } autoThisPass = false; });
  on('booth-auto-note', () => { bump('auto'); autoThisPass = true; learn(BOO, 'B6'); });
  on('booth-save', () => learn(BOO, 'B7'));
  on('booth-broadcast', d => { learn(BOO, 'B8'); if (d.how === 'rewire') tipLater('rewire', 900); tipLater('activity', 4500); });
  on('booth-voice', () => tipLater('voice', 500));
  on('song-load', () => tipLater('song', 200));
  on('song-nudge', () => tipLater('nudge', 400));
  on('panel-open', () => { learn(CITY, 'G1'); learn(CITY, 'G2'); });
  on('knob', d => { learn(CON, 'C1'); if (R.c) R.c.knobbed = true;
    const r = $(d.id); if (d.id === 'g-warmthFilterSlider' && r && r.dataset.def !== undefined && +r.dataset.def - d.v >= .2*(+r.max - +r.min) && !(R.b && R.b.id === 'C2')) learn(CON, 'C2'); });
  on('knob-reset', () => learn(CON, 'C3'));
  on('grid-hold', p => { if (p === true) tipLater('hold', 300); });
  // a slider moved by hand (the engine's and the governor's own moves aren't trusted events)
  PE.addEventListener('input', e => { if (e.isTrusted && e.target && e.target.type === 'range' && e.target.closest('.gmain')){ learn(CON, 'C1'); if (R.c) R.c.knobbed = true; } }, true);
  PE.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#g-autopilotBtn, #g-freezeSwitch, #g-motifXform'); if (!t) return;
    if (t.id === 'g-autopilotBtn') learn(CON, 'C4');
    if (t.id === 'g-freezeSwitch' && BOOTH.broadcasting()) tipLater('stasis', 400);
    if (t.id === 'g-motifXform') tipLater('transform', 500);
  }, true);
  { const d = $('gridDeck'); if (d) d.addEventListener('pointerdown', () => learn(CITY, 'G1'), true); }
  // (the Grid's arrival: noticed when its broadcast first comes on during play, not when a city is loaded with one already standing)
  let cityArmed = false, lastOn = null;

  /* ---------- tips: one line, the first time each deeper feature is touched ---------- */
  const TIPS = {
    voice: { ctx: 'booth', at: () => $('bVoices'), say: 'Voices change the instrument, not the notes. Song sampler and Song chops need a song loaded first.' },
    tidy: { ctx: 'booth', at: () => $('bTidy'), say: 'Tidy timing pulls your notes onto the beat. Full lines them up exactly.' },
    del: { ctx: 'booth', at: () => $('bRoll'), say: 'Right-click a note on the roll to delete it.', sayT: 'Press and hold a note on the roll, then tap Delete to remove it.' },
    answer: { ctx: 'booth', at: () => knobOf('g-boothApSlider'), say: 'Answer sets how much the Autopilot plays when it answers you.' },
    song: { ctx: 'booth', at: () => $('bSongBtn'), ms: 10000, say: 'The Booth listens to the song here, and it never leaves your computer. It finds the key, tempo, chords and the most repeated section, then builds a carrier pattern and two voices from it. This takes a few seconds.',
      sayT: 'The Booth listens to the song here, and it never leaves this device. It finds the key, tempo, chords and the most repeated section, then builds a carrier pattern and two voices from it. This takes a few seconds.' },
    nudge: { ctx: 'booth', at: () => $('bSongBack'), say: 'Return to the original sample goes back to the section the Booth picked.' },
    rewire: { ctx: 'console', at: () => $('gStripCv'), ms: 9000, say: 'Drag a note to move it, or drag its end to stretch it. Keep as a new loop saves this version; your original stays as it was.' },
    activity: { ctx: 'console', at: () => $('gAct'), say: 'Activity: Minimal leaves the chords room to breathe; Busy plays more without piling notes up.' },
    stasis: { ctx: 'console', at: () => $('g-freezeSwitch'), say: 'Stasis holds the bar that\'s playing until you release it.' },
    transform: { ctx: 'console', at: () => $('mRestore'), say: 'Transform gives the pings the voice of a song you loaded. Restore the planners\' voices puts them back.' },
    hold: { ctx: 'any', at: () => GRIDPANEL.open ? $('g-engageSwitch') : TCH ? $('gridDeck') : $('gdPlay'), say: 'The city is quiet while the broadcast is held. Press Hold again to resume.', sayT: 'The city is quiet while the broadcast is held. Tap play again to resume.' },
    // (said once after a replay from Settings)
    replayB: { ctx: 'any', once: false, at: () => null, say: 'The Booth notes will show the next time you open the Booth in the Acoustic Panel.' },
    replayG: { ctx: 'any', once: false, at: () => null, say: 'The Grid notes will show the next time you open the Acoustic Panel.' },
  };
  const tipQ = []; let tipUntil = 0, tipT = null, tipNow = null;
  function tipLater(id, ms){ const d = TIPS[id]; if (!d || (d.once !== false && seenTips[id]) || !tipsOn()) return; if (tipQ.some(x => x.id === id) || (tipNow && tipNow.id === id)) return; setTimeout(() => tipQ.push({ id, d }), ms || 0); }
  function tipTick(cx){
    const now = performance.now();
    if (tipNow){
      if (now > tipUntil || (tipNow.d.ctx !== 'any' && tipNow.d.ctx !== cx)){ tipEl.hidden = true; tipNow = null; } else { placeTip(); return; }
    }
    if (!el.hidden || !tipQ.length || !cx) return;
    const i = tipQ.findIndex(x => x.d.ctx === 'any' || x.d.ctx === cx); if (i < 0) return;
    const x = tipQ.splice(i, 1)[0]; tipNow = x; if (x.d.once !== false){ seenTips[x.id] = 1; save(KT, seenTips); }
    home(tipEl); tipEl.textContent = T(x.d.say, x.d.sayT); tipEl.hidden = false; tipUntil = now + (x.d.ms || 7500); placeTip();
  }
  function placeTip(){
    const t = tipNow && tipNow.d.at(), W = innerWidth, H = innerHeight, m = 10, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = (W - w)/2, y = GRIDPANEL.open ? 70 : 60;
    if (t && vis(t)){ const r = t.getBoundingClientRect(); x = r.left + r.width/2 - w/2; y = r.top - h - 12 > m ? r.top - h - 12 : r.bottom + 12; }
    x = Math.max(m, Math.min(W - w - m, x)); y = Math.max(m, Math.min(H - h - m, y));
    tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  /* ---------- the loop ---------- */
  let last = performance.now();
  function tick(){
    const now = performance.now(), dt = Math.min(.5, (now - last)/1000); last = now;
    const cx = context();
    // the Grid's arrival, once a city is up
    if (cx === 'city'){ const o = !!music.on; if (lastOn === null) lastOn = o; else if (o && !lastOn) cityArmed = true; lastOn = o; }
    // which run: the one that belongs here (a Booth run waiting on the Console, B8 and B9, belongs on the Console too)
    let want = null;
    if (cx === 'city' && pending(CITY) && !otherTut() && music.on) want = CITY;
    else if (cx === 'booth' && pending(BOO)) want = BOO;
    else if (cx === 'console'){
      const b = BO.k < BOO.beats.length ? BOO.beats[BO.k] : null;
      if (pending(BOO) && b && (b.ctx === 'panel' || b.ctx === 'console') && BO.k > 0) want = BOO;
      else if (pending(CON)) want = CON;
    }
    if (want !== R.tr){ hide(); if (want) begin(want); else R.tr = null; }
    tipTick(cx);
    if (!R.tr){ hide(); return; }
    const tr = R.tr, b = beat(); if (!b){ finish(tr, false); return; }
    if (b !== R.b){ R.b = b; R.c = counters(); R.shown = false; R.whyOpen = false; R.key = ''; if (b.arm) b.arm(R.c);
      // the B0 choice: a player who presses Play first is taken as new to it
      if (b.id === 'B0' && tr.st().learned.B1){ BO.level = BO.level || 'new'; }
      // the first Why? opens by itself once for someone new to it: "no wrong notes" is the idea everything else rests on
      if (b.id === 'B2' && !pro()) R.whyOpen = true;
    }
    const c = R.c; c.age += dt;
    // learned already (done before the note came, or just now)
    if (tr.st().learned[b.id] || (b.id === 'B0' && tr.st().learned.B1)){ advance('done'); return; }
    // can it show here, now?
    const fits = b.ctx === cx || (b.ctx === 'panel' && (cx === 'booth' || cx === 'console'));
    const dlg = GRIDPANEL.open ? dlgOpen() : null, dlgOk = !dlg || (b.id === 'B8' && dlg === $('gDlg'));
    const quiet = GRIDPANEL.open && BOOTH.recording && BOOTH.recording();   // (nothing new comes up while a take is recording)
    if (!fits || !dlgOk || quiet || (b.gate && !b.gate(c)) || (tipNow && !R.shown)){ if (!el.hidden){ el.hidden = true; } setTarget(null); return; }
    // on screen
    home(el);
    if (!R.shown){ R.shown = true; const t0 = b.at && b.at(); mark(tr, b.id, 'shown'); if (t0 && !vis(t0)) mark(tr, b.id, 'hidden'); }
    c.t += dt;
    const t = b.at ? b.at() : null;
    const key = [b.id, words(b), R.whyOpen, t && vis(t), bmode(), !!dlg, pro()].join('|');
    if (key !== R.key){ R.key = key; render(b); }
    setTarget(t && vis(t) ? t : null);
    el.hidden = false; place(t);
    const d = b.done && b.done(c); if (d){ advance(d === 'timeout' ? 'timeout' : 'done'); return; }
    if (b.timeout && c.t >= b.timeout){ advance('timeout'); return; }
  }
  setInterval(tick, 120);
  addEventListener('resize', () => { if (!el.hidden && R.b) place(R.b.at && R.b.at()); });

  /* ---------- Settings ---------- */
  U.replayGrid = () => { G.city = fresh(); G.con = fresh(); save(KG, G); armed.city = !!music.on; armed.con = true; if (R.tr === CITY || R.tr === CON){ R.tr = null; hide(); }
    if (!music.on) tipLater('replayG', 600); };
  U.replayBooth = () => { Object.assign(BO, fresh()); delete BO.level; save(KB, BO); armed.bo = true; totNotes = 0; if (R.tr === BOO){ R.tr = null; hide(); } tipLater('replayB', 600); };
  U.stats = () => ({ platform: TCH ? 'touch' : 'computer', returning: OLD, grid: G, booth: BO, tips: seenTips });
  U.on = () => !el.hidden;
  return U;
})();
