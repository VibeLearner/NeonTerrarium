// Neon Terrarium: the radio. Music plays only while the radio station stands.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// The music library lives in assets/audio/music/. The track list comes from assets/audio/music/playlist.json when
// there is one (see tools/make_playlist.py); otherwise, on GitHub Pages, the folder is listed through GitHub's API,
// so dropping files into the folder and pushing is enough.
//
// When the radio station has fully arrived, a shuffled track starts and fades in slowly. Tracks follow one
// another (never the same one twice in a row). Removing the station stops the music (a quick fade so it doesn't
// click). The cassette in the corner shows what's playing; clicking it skips to the next tape.
const MUSIC_DIR = 'assets/audio/music/';
const MUSIC_EXT = /\.(mp3|ogg|oga|m4a|aac|wav|flac|webm|opus)$/i;
const MUSIC_VOL_KEY = 'neonIsland.musicVolume';
const FADE_IN = 8, FADE_OUT = 1.5;   // seconds
// "02 - Night Market (demo).mp3" -> "Night Market (demo)"
const titleOf = file => decodeURIComponent(file.split('/').pop()).replace(MUSIC_EXT, '').replace(/^\d+\s*[-_.]\s*/, '').replace(/[_]+/g, ' ').trim();
const music = (() => {
  let tracks = null, order = [], idx = -1, on = false, level = 0, volume = .6, wantPlay = false, blocked = false, lastFile = null;
  try { const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY)); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
  const el = new Audio(); el.preload = 'auto';
  el.addEventListener('ended', () => next());
  el.addEventListener('error', () => { if (on) setTimeout(() => next(), 800); });

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
  function next(){
    if (!tracks || !tracks.length || !on) return;
    if (++idx >= order.length) shuffle(), idx = 0;
    const t = tracks[order[idx]]; lastFile = t.file;
    el.src = MUSIC_DIR + t.file.split('/').map(encodeURIComponent).join('/');
    ui.setTitle(t.title);
    tryPlay();
  }
  function tryPlay(){ wantPlay = true; const p = el.play(); if (p && p.catch) p.then(() => { blocked = false; }).catch(() => { blocked = true; }); }
  // browsers only allow sound after the player has interacted with the page
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (blocked && on){ blocked = false; tryPlay(); } }, { capture: true, passive: true });

  // switched by the radio station being there or not (see update)
  function setOn(v){
    if (v === on) return;
    on = v;
    ui.show(on);
    if (on) ready.then(() => { if (!on) return; if (!order.length) shuffle(); if (el.src && el.paused && !el.ended && el.currentTime > 0) tryPlay(); else next(); });
  }
  function update(dt){
    const radio = typeof megas !== 'undefined' && megas.get('radio');
    // starts once the station has fully arrived (its arrival animation is over)
    setOn(!!radio && !anims.some(a => a.c === radio));
    const target = on && !blocked && !el.paused ? 1 : 0;
    level = target > level ? Math.min(target, level + dt/FADE_IN) : Math.max(target, level - dt/FADE_OUT);
    el.volume = Math.min(1, Math.max(0, level*level*volume));   // eased, so the fade-in feels even
    if (!on && level <= 0 && !el.paused){ el.pause(); el.currentTime = 0; wantPlay = false; }
    ui.spin(on && !el.paused && !blocked);
  }
  function setVolume(v){ volume = v; try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (e) {} }
  function skip(){ if (on){ level = Math.min(level, .35); next(); } }

  // the cassette in the corner: appears with the station, shows the song, its reels turn while it plays
  const ui = (() => {
    const deck = document.getElementById('tapedeck'), title = document.getElementById('tapeTitle'), line = document.getElementById('tapeLine');
    if (!deck) return { show(){}, setTitle(){}, spin(){} };
    deck.addEventListener('click', () => skip());
    let last = '';
    return {
      show(v){ deck.classList.toggle('live', v); deck.setAttribute('aria-hidden', v ? 'false' : 'true'); },
      setTitle(t){
        const s = t || (tracks && !tracks.length ? 'No tapes yet: add music to assets/audio/music' : 'Loading tapes...');
        if (s === last) return; last = s;
        title.textContent = s;
        // long titles scroll slowly through the window
        requestAnimationFrame(() => { const over = title.scrollWidth - line.clientWidth; title.style.setProperty('--scroll', over > 0 ? -(over + 12) + 'px' : '0px'); title.classList.toggle('scroll', over > 0); });
      },
      spin(v){ deck.classList.toggle('playing', v); },
    };
  })();
  return { update, setVolume, skip, get volume(){ return volume; }, get tracks(){ return tracks; }, get on(){ return on; }, get level(){ return level; }, el };
})();
