// Neon Terrarium: sound effects.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// Short effects are decoded once into Web Audio buffers and played on demand. Browsers only allow sound after
// the player has interacted with the page, so the audio wakes up on the first click, tap or key.
const SFX_FILES = {
  place:  'assets/audio/sfx/place.wav',    // a piece built: the mechanical pop
  remove: 'assets/audio/sfx/remove.wav',   // a piece removed: the mechanical thud
};
const SFX_VOL_KEY = 'neonIsland.sfxVolume';
const sfx = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, out = null, volume = 0.8;
  try { const v = parseFloat(localStorage.getItem(SFX_VOL_KEY)); if (!isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
  const buffers = {}, lastPlayed = {};
  // The audio context is made (suspended) and the clips decoded as soon as the page loads, so they're ready
  // before the first click; that click only has to wake the context. (Waiting for the click to start loading
  // meant the very first build was silent.)
  if (AC){
    try {
      ctx = new AC();
      out = ctx.createGain(); out.gain.value = volume; out.connect(ctx.destination);
      for (const [name, url] of Object.entries(SFX_FILES)){
        fetch(url).then(r => r.arrayBuffer())
          .then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))   // callback form also works in older Safari
          .then(buf => { buffers[name] = buf; }).catch(() => {});
      }
    } catch (e) { ctx = null; }
  }
  function wake(){ if (ctx && ctx.state === 'suspended') ctx.resume(); }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, wake, { capture: true, passive: true });
  // play an effect; a little random pitch keeps repeated clicks from sounding identical
  function play(name, { gain = 1, spread = .05 } = {}){
    if (!ctx || !buffers[name] || volume <= 0) return;
    const now = ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < .035) return;   // painting fast: don't stack dozens at once
    lastPlayed[name] = now;
    const src = ctx.createBufferSource(); src.buffer = buffers[name];
    src.playbackRate.value = 1 + (Math.random()*2 - 1)*spread;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(out); src.start();
  }
  function setVolume(v){ volume = v; if (out) out.gain.value = v; try { localStorage.setItem(SFX_VOL_KEY, String(v)); } catch (e) {} }
  return { play, setVolume, get volume(){ return volume; } };
})();
