// Neon Terrarium: the coast's soundtrack. Plays while the coast is open (coast.html), from assets/audio/coast/
// (the list in playlist.json there). Every song plays once before any repeats, shuffled, never the same song twice in a
// row; the first fades in slowly. A small translucent player at the top right, under EXIT: the song's name, a line to
// see and set where the song is, previous / play-pause / next, and the volume. Volume, the songs heard so far and
// whether the player paused it are remembered in this browser. Leaving through EXIT fades the music with the picture.
'use strict';
const COASTMUSIC = (() => {
  const DIR = 'assets/audio/coast/', VOL_KEY = 'neonIsland.coastVolume', BAG_KEY = 'neonIsland.coastPlayed', PAUSE_KEY = 'neonIsland.coastPaused';
  const FADE_IN = 5, FADE = .5;
  const css = `
  .cmus { position: fixed; top: 60px; right: 16px; z-index: 40; width: 236px; padding: 8px 12px 9px; border-radius: 12px 16px 11px 15px / 15px 11px 16px 12px;
    background: rgba(251,246,236,.42); border: 1.5px solid rgba(51,65,58,.28); box-shadow: 0 2px 10px rgba(40,50,45,.12); color: var(--ink, #33413a);
    font-family: 'Patrick Hand', 'Caveat', cursive; opacity: 0; transform: translateY(-4px); transition: opacity .6s, transform .6s, background .25s; }
  .cmus.on { opacity: 1; transform: none; }
  .cmus:hover, .cmus:focus-within { background: rgba(251,246,236,.7); }
  .cmus .tt { font: 600 19px/1.1 'Caveat', cursive; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 0 6px; }
  .cmus .seek { position: relative; height: 14px; cursor: pointer; touch-action: none; }
  .cmus .seek::before { content: ''; position: absolute; left: 0; right: 0; top: 6px; height: 2px; border-radius: 2px; background: rgba(51,65,58,.22); }
  .cmus .seek i { position: absolute; left: 0; top: 6px; height: 2px; border-radius: 2px; background: var(--ink, #33413a); width: 0; }
  .cmus .seek b { position: absolute; top: 3px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--paper, #fbf6ec); border: 1.5px solid var(--ink, #33413a); left: 0; }
  .cmus .row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .cmus .time { font-size: 13px; color: var(--ink2, #5f6c63); min-width: 70px; }
  .cmus button { width: 26px; height: 24px; display: grid; place-items: center; border-radius: 7px; color: var(--ink, #33413a); background: transparent; border: 0; cursor: pointer; }
  .cmus button:hover, .cmus button:focus-visible { background: rgba(51,65,58,.1); outline: none; }
  .cmus button svg { width: 14px; height: 14px; fill: currentColor; }
  .cmus .pp .i-play { display: none; } .cmus.paused .pp .i-play { display: block; } .cmus.paused .pp .i-pause { display: none; }
  .cmus .vol { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .cmus .vol svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; flex: none; }
  .cmus .vol input { width: 58px; height: 14px; margin: 0; accent-color: var(--ink, #33413a); cursor: pointer; }
  @media (max-width: 600px) { .cmus { top: 56px; right: 10px; width: 200px; } .cmus .vol input { width: 44px; } }
  `;
  let tracks = [], order = [], idx = -1, lastFile = null, played = new Set(), vol = .55, level = 0, fadeIn = FADE_IN, want = true, blocked = false, leaving = false;
  try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 1) vol = v; } catch (e) {}
  try { want = localStorage.getItem(PAUSE_KEY) !== '1'; } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(BAG_KEY) || '{}'); if (Array.isArray(b.played)) played = new Set(b.played); if (typeof b.last === 'string') lastFile = b.last; } catch (e) {}
  const saveBag = () => { try { localStorage.setItem(BAG_KEY, JSON.stringify({ played: [...played], last: lastFile })); } catch (e) {} };
  const el = new Audio(); el.preload = 'auto'; el.volume = 0;
  let ui = null;
  const fmt = s => !isFinite(s) ? '0:00' : Math.floor(s/60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function shuffle(){
    order = tracks.map((_, k) => k).filter(k => !played.has(tracks[k].file));
    if (!order.length){ played.clear(); order = tracks.map((_, k) => k); }
    for (let k = order.length - 1; k > 0; k--){ const j = Math.floor(Math.random()*(k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    if (order.length > 1 && tracks[order[0]].file === lastFile) [order[0], order[1]] = [order[1], order[0]];
    idx = -1;
  }
  function load(k){
    const t = tracks[order[k]]; lastFile = t.file; played.add(t.file); saveBag();
    el.src = DIR + encodeURIComponent(t.file);
    if (ui) ui.tt.textContent = t.title;
    if (want) play();
  }
  function next(){ if (!tracks.length) return; if (++idx >= order.length){ shuffle(); idx = 0; } load(idx); }
  // previous: back to the start of this song if it's been playing a while, otherwise the song before it
  function prev(){ if (!tracks.length) return; if (el.currentTime > 3 || idx <= 0){ el.currentTime = 0; if (want) play(); return; } load(--idx); }
  function play(){ const p = el.play(); if (p && p.catch) p.then(() => { blocked = false; }).catch(() => { blocked = true; }); }
  function setWant(w){ want = w; try { localStorage.setItem(PAUSE_KEY, w ? '0' : '1'); } catch (e) {} if (ui) ui.box.classList.toggle('paused', !w); if (w){ fadeIn = FADE; if (el.src) play(); else next(); } }
  el.addEventListener('ended', () => { fadeIn = FADE; next(); });
  el.addEventListener('error', () => { setTimeout(next, 800); });
  // browsers only allow sound once the player has touched the page (arriving through the television counts as a new page)
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (blocked && want && !leaving){ blocked = false; play(); } }, { capture: true, passive: true });

  // the fades: in at the start (slowly the first time), out for a pause or for leaving
  let t0 = performance.now();
  function tickVol(now){
    const dt = Math.min(.1, (now - t0)/1000); t0 = now;
    const target = want && !leaving && !el.paused ? 1 : 0;
    level = target > level ? Math.min(1, level + dt/fadeIn) : Math.max(0, level - dt/(leaving ? .8 : FADE));
    if (level >= 1) fadeIn = FADE;
    el.volume = Math.min(1, level*level*vol);
    if (level <= 0 && !el.paused && (!want || leaving)) el.pause();
    if (ui && !dragging){ const d = el.duration, c = el.currentTime, f = d > 0 ? c/d : 0; ui.fill.style.width = (f*100) + '%'; ui.dot.style.left = (f*100) + '%';
      const tx = fmt(c) + ' / ' + fmt(d); if (ui.time.textContent !== tx) ui.time.textContent = tx; }
    requestAnimationFrame(tickVol);
  }
  requestAnimationFrame(tickVol);

  // the player
  let dragging = false;
  function makeUI(){
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement('div'); box.className = 'cmus' + (want ? '' : ' paused'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Music');
    box.innerHTML = `<p class="tt">…</p>
      <div class="seek" role="slider" aria-label="Song position" tabindex="0"><i></i><b></b></div>
      <div class="row"><span class="time">0:00 / 0:00</span>
        <button class="pv" aria-label="Previous song"><svg viewBox="0 0 16 16"><path d="M3 3h2v10H3zM13 3v10L6 8z"/></svg></button>
        <button class="pp" aria-label="Play or pause"><svg class="i-pause" viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg><svg class="i-play" viewBox="0 0 16 16"><path d="M4 2.5v11L13 8z"/></svg></button>
        <button class="nx" aria-label="Next song"><svg viewBox="0 0 16 16"><path d="M11 3h2v10h-2zM3 3v10l7-5z"/></svg></button>
        <span class="vol"><svg viewBox="0 0 16 16"><path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z"/><path d="M11 5.5c1 .8 1 4.2 0 5"/></svg><input type="range" min="0" max="1" step="0.01" aria-label="Volume"></span></div>`;
    document.body.appendChild(box);
    ui = { box, tt: box.querySelector('.tt'), seek: box.querySelector('.seek'), fill: box.querySelector('.seek i'), dot: box.querySelector('.seek b'), time: box.querySelector('.time') };
    const vi = box.querySelector('.vol input'); vi.value = vol;
    vi.addEventListener('input', () => { vol = +vi.value; try { localStorage.setItem(VOL_KEY, String(vol)); } catch (e) {} });
    box.querySelector('.pp').addEventListener('click', () => setWant(!want));
    box.querySelector('.nx').addEventListener('click', () => { fadeIn = FADE; level = 0; next(); });
    box.querySelector('.pv').addEventListener('click', () => { fadeIn = FADE; prev(); });
    // the line: click or drag along it to move through the song; arrow keys step 5 s
    const at = e => { const r = ui.seek.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left)/r.width)); };
    const show = f => { ui.fill.style.width = (f*100) + '%'; ui.dot.style.left = (f*100) + '%'; };
    ui.seek.addEventListener('pointerdown', e => { if (!(el.duration > 0)) return; dragging = true; ui.seek.setPointerCapture(e.pointerId); show(at(e)); e.stopPropagation(); });
    ui.seek.addEventListener('pointermove', e => { if (dragging) show(at(e)); });
    const drop = e => { if (!dragging) return; dragging = false; el.currentTime = at(e)*el.duration; };
    ui.seek.addEventListener('pointerup', drop); ui.seek.addEventListener('pointercancel', () => { dragging = false; });
    ui.seek.addEventListener('keydown', e => { if (!(el.duration > 0)) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); el.currentTime = Math.max(0, Math.min(el.duration - .5, el.currentTime + (e.key === 'ArrowRight' ? 5 : -5))); } });
    // (the game's own keys and clicks stay out of the player)
    for (const ev of ['keydown', 'wheel']) box.addEventListener(ev, e => e.stopPropagation());
    requestAnimationFrame(() => box.classList.add('on'));
  }
  async function start(){
    makeUI();
    try { const r = await fetch(DIR + 'playlist.json?t=' + Date.now()); if (r.ok){ const d = await r.json(); tracks = (Array.isArray(d) ? d : []).map(t => typeof t === 'string' ? { file: t, title: t.replace(/\.[a-z0-9]+$/i, '') } : t).filter(t => t && t.file); } } catch (e) {}
    if (!tracks.length){ ui.tt.textContent = 'No music found'; return; }
    shuffle(); idx = 0; const t = tracks[order[0]]; lastFile = t.file; played.add(t.file); saveBag();
    el.src = DIR + encodeURIComponent(t.file); ui.tt.textContent = t.title;
    if (want) play();
  }
  // leaving for the sky city: the music fades out with the picture
  addEventListener('click', e => { if (e.target.closest && e.target.closest('#exitg')) leaving = true; }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { get el(){ return el; }, next, prev, setWant, get tracks(){ return tracks; } };
})();
