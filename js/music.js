// Neon Terrarium: the radio. Music plays only while the radio station stands.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// The music library lives in assets/audio/music/. The track list comes from assets/audio/music/playlist.json when
// there is one (see tools/make_playlist.py); otherwise, on GitHub Pages, the folder is listed through GitHub's API,
// so dropping files into the folder and pushing is enough.
//
// When the radio station has fully arrived, a shuffled track starts and fades in slowly. Tracks follow one
// another (never the same one twice in a row). Removing the station stops the music (a quick fade so it doesn't
// click). The cassette in the corner shows what's playing, with previous, play/pause and next buttons and a live
// equalizer drawn from the music itself.
const MUSIC_DIR = 'assets/audio/music/';
const MUSIC_EXT = /\.(mp3|ogg|oga|m4a|aac|wav|flac|webm|opus)$/i;
const MUSIC_VOL_KEY = 'neonIsland.musicVolume';
const FADE_IN = 8, FADE_QUICK = .6, FADE_OUT = 1.5, EQ_BARS = 12;   // seconds; bars
// "02 - Night Market (demo).mp3" -> "Night Market (demo)"
const titleOf = file => decodeURIComponent(file.split('/').pop()).replace(MUSIC_EXT, '').replace(/^\d+\s*[-_.]\s*/, '').replace(/[_]+/g, ' ').trim();
// The radio host (RJ). After the station opens: one song, then the first lore drop, spoken over the start of the
// next song (turned down underneath); three or four songs after that, the second lore drop the same way. Now and
// then a short intro from the host over the start of a song (turned down the same way): random, never more than two songs in a row, never on the song
// right before the second lore drop, and each intro only once. Every bit of talk is wrapped in a burst of radio
// static, tuning in before and out after. What's been said is remembered (in this browser), so nothing repeats;
// once the host has said everything, it's just the music.
const RADIO_DIR = 'assets/audio/radio/';
const RJ_INTROS = ['intro1', 'intro2', 'intro3', 'intro4', 'intro5', 'intro6', 'intro7', 'intro8', 'intro9', 'intro10', 'intro11', 'intro12',
  'longtalk1', 'longtalk2', 'longtalk3'];   // the long talks are longer intros, played over the start of a song the same way
// Interrupts: partway through a song the host cuts in. The song stops, static, the interrupt, static, and the song
// picks up where it left off. Each plays once, only after the first lore drop, and never on the song before lore 2.
const RJ_INTERRUPTS = ['interrupt1', 'interrupt2'], RJ_INTERRUPT_ODDS = .3;
const STATIC_IN = ['in1', 'in2'], STATIC_OUT = ['out1', 'out2', 'out3', 'out4', 'out5', 'out6', 'out7'];
const RJ_KEY = 'neonIsland.radioHost', RJ_INTRO_ODDS = .45, DUCK = .22, STATIC_VOL = .7;
const rj = (() => {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(RJ_KEY) || 'null'); } catch (e) {}
  if (!st || typeof st !== 'object') st = {};
  st = Object.assign({ songs: 0, lore1: false, lore2: false, after: 0, lore2At: Math.random() < .5 ? 3 : 4, used: [], streak: 0 }, st);
  const save = () => { try { localStorage.setItem(RJ_KEY, JSON.stringify(st)); } catch (e) {} };
  if (st.lore2 && st.l2song === undefined) st.l2song = st.songs;   // saved before the love letter existed
  // the love letter: two songs after the one lore 2 played over, on the third (the song before it stays clean)
  // (songs counts the songs already started: while planning the next one it's one behind, once it's started it isn't)
  const letterDue = () => st.lore2 && !st.loveletter && st.l2song !== undefined && st.songs - st.l2song >= 2;
  const beforeLetter = (started = 0) => st.lore2 && !st.loveletter && st.l2song !== undefined && st.songs - started - st.l2song === 1;
  save();
  return {
    // what goes with the song that's about to start: 'lore1', 'lore2', an intro's name, or nothing
    plan(){
      if (st.songs === 0) return null;                                   // the first song plays on its own
      if (!st.lore1) return 'lore1';
      if (!st.lore2 && st.after >= st.lore2At) return 'lore2';
      if (letterDue()) return 'loveletter';
      if (beforeLetter()) return null;
      const left = RJ_INTROS.filter(n => !st.used.includes(n));
      const beforeLore2 = !st.lore2 && st.after === st.lore2At - 1;     // the song just before lore 2 stays clean
      if (!left.length || st.streak >= 2 || beforeLore2 || Math.random() > RJ_INTRO_ODDS) return null;
      return left[Math.floor(Math.random()*left.length)];
    },
    // a song has started, with this talk (or none)
    started(talk){
      st.songs++;
      if (talk === 'lore2') st.l2song = st.songs;
      if (talk === 'lore1' || talk === 'lore2' || talk === 'loveletter') st.streak = 0;
      else if (talk){ st.streak++; if (!st.used.includes(talk)) st.used.push(talk); }
      else st.streak = 0;
      if (talk === 'lore1') st.after = 0; else if (st.lore1 && st.songs > 1) st.after++;
      save();
    },
    // a song (with nothing said over its start) has begun: maybe an interrupt for partway through it
    planInterrupt(talk){
      if (talk || !st.lore1 || (!st.lore2 && st.after >= st.lore2At - 1) || beforeLetter(1)) return null;
      const left = RJ_INTERRUPTS.filter(n => !st.used.includes(n));
      if (!left.length || st.streak >= 2 || Math.random() > RJ_INTERRUPT_ODDS) return null;
      return left[Math.floor(Math.random()*left.length)];
    },
    interrupted(name){ if (!st.used.includes(name)) st.used.push(name); st.streak++; save(); },
    loreDone(name){ st[name] = true; save(); },
    get state(){ return st; },
    reset(){ st = { songs: 0, lore1: false, lore2: false, loveletter: false, after: 0, lore2At: Math.random() < .5 ? 3 : 4, used: [], streak: 0 }; save(); },
  };
})();
const music = (() => {
  let tracks = null, order = [], idx = -1, on = false, level = 0, volume = .6, blocked = false, lastFile = null, paused = false, fadeIn = FADE_IN;
  try { const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY)); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
  const el = new Audio(); el.preload = 'auto';
  el.addEventListener('ended', () => next());
  // the host: a second player for the static and the talk, played as a little queue of clips
  const vo = new Audio(); vo.preload = 'auto';
  let voQ = [], voDone = null, voLore = null, talking = false, duck = 1, voBlocked = false, cutIn = null, cutting = false;
  const pick = a => a[Math.floor(Math.random()*a.length)];
  function voPlay(){ const p = vo.play(); if (p && p.catch) p.then(() => { voBlocked = false; }).catch(() => { voBlocked = true; }); }
  function voNext(){
    if (!voQ.length){ talking = false; vo.removeAttribute('src'); const f = voDone; voDone = null; if (f) f(); return; }
    const c = voQ.shift(); vo.src = RADIO_DIR + c.file; vo.dataset.kind = c.kind; vo.volume = Math.min(1, volume*(c.kind === 'static' ? STATIC_VOL : 1));
    if (!paused) voPlay();
  }
  vo.addEventListener('ended', () => {
    if (vo.dataset.kind === 'lore' && voLore){ rj.loreDone(voLore); voLore = null; }
    voNext();
  });
  vo.addEventListener('error', () => voNext());
  // static in, the talk, static out; then done()
  function talk(name, done){
    if (name.startsWith('interrupt')){   // a cut-in: two different bursts of static back to back, then the host, then straight back to the song
      const all = STATIC_IN.concat(STATIC_OUT), a = pick(all); let b = pick(all); while (b === a) b = pick(all);
      voQ = [{ file: 'static/' + a + '.mp3', kind: 'static' }, { file: 'static/' + b + '.mp3', kind: 'static' }, { file: name + '.mp3', kind: 'intro' }];
      voDone = done || null; voLore = null; talking = true; voNext(); return;
    }
    voQ = [{ file: 'static/' + pick(STATIC_IN) + '.mp3', kind: 'static' }, { file: name + '.mp3', kind: (name.startsWith('lore') || name === 'loveletter') ? 'lore' : 'intro' }, { file: 'static/' + pick(STATIC_OUT) + '.mp3', kind: 'static' }];
    voDone = done || null; voLore = (name.startsWith('lore') || name === 'loveletter') ? name : null; talking = true; voNext();
  }
  function hush(){ voQ = []; voDone = null; voLore = null; talking = false; vo.pause(); vo.removeAttribute('src'); if (cutting){ cutting = false; duck = 1; } }
  el.addEventListener('error', () => { if (on) setTimeout(() => next(), 800); });
  // The music runs through Web Audio: an analyser (for the equalizer) and a gain for the volume and fades. Made on
  // the first play, which always follows a click (building the radio station, or a button).
  let actx = null, gain = null, analyser = null, bins = null;
  function audioGraph(){
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      actx = new AC();
      const src = actx.createMediaElementSource(el);
      analyser = actx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .78;
      gain = actx.createGain(); gain.gain.value = 0;
      src.connect(analyser); analyser.connect(gain); gain.connect(actx.destination);
      bins = new Uint8Array(analyser.frequencyBinCount);
      el.volume = 1;
    } catch (e) { actx = null; gain = null; analyser = null; }
  }

  // the track list: playlist.json if present, else the folder listing from GitHub (Pages sites only)
  async function loadList(){
    try {
      const r = await fetch(MUSIC_DIR + 'playlist.json?t=' + Date.now());
      if (r.ok){ const d = await r.json(); const l = (Array.isArray(d) ? d : d.tracks || []).map(t => typeof t === 'string' ? { file: t } : t).filter(t => t && t.file);
        if (l.length) return l.map(t => ({ file: t.file, title: t.title || titleOf(t.file) })); }
    } catch (e) {}
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (m){
      const repo = location.pathname.split('/').filter(Boolean)[0] || (m[1] + '.github.io');
      try {
        const r = await fetch(`https://api.github.com/repos/${m[1]}/${repo}/contents/${MUSIC_DIR.replace(/\/$/, '')}`);
        if (r.ok){ const d = await r.json(); return d.filter(f => f.type === 'file' && MUSIC_EXT.test(f.name)).map(f => ({ file: f.name, title: titleOf(f.name) })); }
      } catch (e) {}
    }
    return [];
  }
  const ready = loadList().then(l => { tracks = l; ui.setTitle(); });

  function shuffle(){ order = tracks.map((_, k) => k); for (let k = order.length - 1; k > 0; k--){ const j = Math.floor(Math.random()*(k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    if (order.length > 1 && tracks[order[0]].file === lastFile) [order[0], order[1]] = [order[1], order[0]]; idx = -1; }
  function load(k){
    const t = tracks[order[k]]; lastFile = t.file;
    el.src = MUSIC_DIR + t.file.split('/').map(encodeURIComponent).join('/');
    ui.setTitle(t.title);
    if (!paused) tryPlay();
  }
  function next(){
    if (!tracks || !tracks.length || !on) return;
    cutIn = null;
    if (talking && !voLore) hush();   // skipping during an intro: straight to the song (a lore drop carries on over it)
    if (++idx >= order.length){ shuffle(); idx = 0; }
    const k = idx, plan = talking ? null : rj.plan();
    rj.started(plan);
    load(k);
    if (plan) talk(plan);   // the song starts underneath the talk, turned down, and comes back up after
    const cut = rj.planInterrupt(plan);
    cutIn = cut ? { name: cut, k, frac: .3 + Math.random()*.35 } : null;   // where in the song, once its length is known
  }
  // previous: back to the start of this song if it's been playing a while, otherwise the song before it
  function prev(){
    if (!tracks || !tracks.length || !on) return;
    if (talking && !voLore){ hush(); load(idx); return; }
    if (el.currentTime > 3 || idx <= 0){ el.currentTime = 0; if (!paused) tryPlay(); return; }
    load(--idx);
  }
  function tryPlay(){ audioGraph(); if (actx && actx.state === 'suspended') actx.resume(); const p = el.play(); if (p && p.catch) p.then(() => { blocked = false; }).catch(() => { blocked = true; }); }
  // browsers only allow sound after the player has interacted with the page
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (blocked && on && !paused){ blocked = false; tryPlay(); } if (voBlocked && talking && on && !paused){ voBlocked = false; voPlay(); } }, { capture: true, passive: true });

  // switched by the radio station being there or not (see update)
  function setOn(v){
    if (v === on) return;
    on = v; paused = false;
    ui.show(on); ui.setPaused(false);
    if (on){ fadeIn = FADE_IN; level = 0; ready.then(() => { if (!on) return; if (!order.length) shuffle(); next(); }); }
    else hush();
  }
  function update(dt){
    const radio = typeof megas !== 'undefined' && megas.get('radio');
    // starts once the station has fully arrived (its arrival animation is over)
    setOn(!!radio && !anims.some(a => a.c === radio));
    const playing = on && !paused && !blocked && !el.paused;
    // under the host's talk the song is turned down, and comes back up gently after
    // an interrupt due: stop the song, the host cuts in, then the song carries on from where it stopped
    if (cutIn && !talking && !paused && on && cutIn.k === idx && el.duration > 20 && el.currentTime > el.duration*cutIn.frac){
      const c = cutIn; cutIn = null; cutting = true; rj.interrupted(c.name); el.pause();
      talk(c.name, () => { cutting = false; duck = 1; if (on && idx === c.k && !paused){ fadeIn = FADE_QUICK; tryPlay(); } });
    }
    const dt2 = Math.min(dt, .1), dTarget = talking && !cutting ? DUCK : 1;
    duck = dTarget < duck ? Math.max(dTarget, duck - dt2*1.5) : Math.min(dTarget, duck + dt2*.35);
    if (talking && !paused) vo.volume = Math.min(1, volume*(vo.dataset.kind === 'static' ? STATIC_VOL : 1));
    const target = playing ? 1 : 0;
    level = target > level ? Math.min(target, level + dt/fadeIn) : Math.max(target, level - dt/(on ? FADE_QUICK : FADE_OUT));
    if (level >= 1) fadeIn = FADE_QUICK;   // after the first slow fade-in, skips and resumes come up quickly
    const v = Math.min(1, Math.max(0, level*level*volume*duck));   // eased, so the fade feels even
    if (gain) gain.gain.value = v; else el.volume = v;
    // fully faded: stop (the station's gone) or hold where it is (paused)
    if (level <= 0 && !el.paused && (!on || paused)){ el.pause(); if (!on) el.currentTime = 0; }
    ui.spin(playing || (talking && !paused));
    ui.eq(playing && analyser ? (analyser.getByteFrequencyData(bins), bins) : null, dt);
  }
  function setVolume(v){ volume = v; try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (e) {} }
  function togglePause(){
    if (!on) return;
    paused = !paused; ui.setPaused(paused);
    if (paused){ if (talking) vo.pause(); }
    else { fadeIn = FADE_QUICK; if (talking){ voPlay(); if (voLore && el.src) tryPlay(); } else if (el.src) tryPlay(); else next(); }
  }
  function skip(){ if (on){ level = 0; fadeIn = FADE_QUICK; next(); } }
  function back(){ if (on){ level = 0; fadeIn = FADE_QUICK; prev(); } }

  // the cassette in the corner: appears with the station, shows the song, its reels turn while it plays; the
  // buttons, and the equalizer, a dozen bars following the music's spectrum from bass (left) to treble (right)
  const ui = (() => {
    const deck = document.getElementById('tapedeck'), title = document.getElementById('tapeTitle'), line = document.getElementById('tapeLine');
    if (!deck) return { show(){}, setTitle(){}, spin(){}, setPaused(){}, eq(){} };
    document.getElementById('tapePrev').addEventListener('click', () => back());
    document.getElementById('tapeNext').addEventListener('click', () => skip());
    const playBtn = document.getElementById('tapePlay');
    playBtn.addEventListener('click', () => togglePause());
    const eqEl = document.getElementById('tapeEq');
    const bars = []; for (let k = 0; k < EQ_BARS; k++){ const b = document.createElement('i'); eqEl.appendChild(b); bars.push(b); }
    const hts = new Float32Array(EQ_BARS);
    let last = '';
    return {
      show(v){ deck.classList.toggle('live', v); deck.setAttribute('aria-hidden', v ? 'false' : 'true'); deck.inert = !v; },
      setTitle(t){
        const s = t || (tracks && !tracks.length ? 'No tapes yet: add music to assets/audio/music' : 'Loading tapes...');
        if (s === last) return; last = s;
        title.textContent = s;
        // long titles scroll slowly through the window
        requestAnimationFrame(() => { const over = title.scrollWidth - line.clientWidth; title.style.setProperty('--scroll', over > 0 ? -(over + 12) + 'px' : '0px'); title.classList.toggle('scroll', over > 0); });
      },
      spin(v){ deck.classList.toggle('playing', v); },
      setPaused(p){ playBtn.classList.toggle('paused', p); playBtn.setAttribute('aria-label', p ? 'Play' : 'Pause'); playBtn.title = p ? 'Play' : 'Pause'; },
      eq(data, dt){
        for (let k = 0; k < EQ_BARS; k++){
          let v = 0;
          if (data){
            // bins spread out logarithmically: low end gets single bins, the top end wider bands
            const n = data.length, a = Math.floor(Math.pow(n*.75, k/EQ_BARS)), b = Math.max(a + 1, Math.floor(Math.pow(n*.75, (k + 1)/EQ_BARS)));
            for (let q = a; q < b; q++) v = Math.max(v, data[q]);
            v = Math.pow(v/255, 1.5)*(1 + k*.13);   // a lift for the quieter top end
          }
          hts[k] = v > hts[k] ? v : Math.max(v, hts[k] - dt*1.6);   // rise at once, fall gently
          bars[k].style.height = (2 + Math.round(Math.min(1, hts[k])*12)) + 'px';
        }
      },
    };
  })();
  return { update, setVolume, skip, back, togglePause, rj, get cutIn(){ return cutIn; }, get talking(){ return talking; }, vo, get volume(){ return volume; }, get tracks(){ return tracks; }, get on(){ return on; }, get paused(){ return paused; }, get level(){ return level; }, el };
})();
