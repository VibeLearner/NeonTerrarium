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
const music = (() => {
  let tracks = null, order = [], idx = -1, on = false, level = 0, volume = .6, blocked = false, lastFile = null, paused = false, fadeIn = FADE_IN;
  try { const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY)); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
  const el = new Audio(); el.preload = 'auto';
  el.addEventListener('ended', () => next());
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
    if (++idx >= order.length){ shuffle(); idx = 0; }
    load(idx);
  }
  // previous: back to the start of this song if it's been playing a while, otherwise the song before it
  function prev(){
    if (!tracks || !tracks.length || !on) return;
    if (el.currentTime > 3 || idx <= 0){ el.currentTime = 0; if (!paused) tryPlay(); return; }
    load(--idx);
  }
  function tryPlay(){ audioGraph(); if (actx && actx.state === 'suspended') actx.resume(); const p = el.play(); if (p && p.catch) p.then(() => { blocked = false; }).catch(() => { blocked = true; }); }
  // browsers only allow sound after the player has interacted with the page
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (blocked && on && !paused){ blocked = false; tryPlay(); } }, { capture: true, passive: true });

  // switched by the radio station being there or not (see update)
  function setOn(v){
    if (v === on) return;
    on = v; paused = false;
    ui.show(on); ui.setPaused(false);
    if (on){ fadeIn = FADE_IN; level = 0; ready.then(() => { if (!on) return; if (!order.length) shuffle(); next(); }); }
  }
  function update(dt){
    const radio = typeof megas !== 'undefined' && megas.get('radio');
    // starts once the station has fully arrived (its arrival animation is over)
    setOn(!!radio && !anims.some(a => a.c === radio));
    const playing = on && !paused && !blocked && !el.paused;
    const target = playing ? 1 : 0;
    level = target > level ? Math.min(target, level + dt/fadeIn) : Math.max(target, level - dt/(on ? FADE_QUICK : FADE_OUT));
    if (level >= 1) fadeIn = FADE_QUICK;   // after the first slow fade-in, skips and resumes come up quickly
    const v = Math.min(1, Math.max(0, level*level*volume));   // eased, so the fade feels even
    if (gain) gain.gain.value = v; else el.volume = v;
    // fully faded: stop (the station's gone) or hold where it is (paused)
    if (level <= 0 && !el.paused && (!on || paused)){ el.pause(); if (!on) el.currentTime = 0; }
    ui.spin(playing);
    ui.eq(playing && analyser ? (analyser.getByteFrequencyData(bins), bins) : null, dt);
  }
  function setVolume(v){ volume = v; try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (e) {} }
  function togglePause(){
    if (!on) return;
    paused = !paused; ui.setPaused(paused);
    if (!paused){ fadeIn = FADE_QUICK; if (el.src) tryPlay(); else next(); }
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
  return { update, setVolume, skip, back, togglePause, get volume(){ return volume; }, get tracks(){ return tracks; }, get on(){ return on; }, get paused(){ return paused; }, get level(){ return level; }, el };
})();
