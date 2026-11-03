// Neon Terrarium: the demo clip's Booth loop (js/demo.js), put in the clip's own storage before booth.js reads its saved loops. Only with #demo.
// 4 bars at 100 BPM (9.6 s a pass), a melody on the magic keys (pads 0 to 11, always in the chord): [beat, pad, beats long]. Its first bar is
// missing two notes (MISSING: [beat, pad]); the clip draws them in on the Acoustic Panel and they play on the very next pass.
'use strict';
window.DEMO_LOOP = {
  id: 'Ldemo', bpm: 100, len: 4,
  melody: [[2.5, 8, .5], [3, 7, .5], [3.5, 5, .5], [4.5, 4, .5], [5, 5, .5], [5.5, 7, 1.5], [7, 6, .5], [7.5, 5, .5],
    [8.5, 7, .5], [9, 9, .5], [9.5, 10, 1], [10.5, 9, .5], [11, 7, 1], [12.5, 5, .5], [13, 6, .5], [13.5, 7, 1.5], [15, 4, 1]],
  missing: [[.5, 7], [1.5, 9]],
};
if (window.NT_DEMO && window.DEMO_KEYS){ const L = window.DEMO_LOOP;
  window.DEMO_KEYS['neonIsland.booth'] = JSON.stringify({ loops: [{ id: L.id, name: 'Night shift', prog: 0, len: L.len, voice: 'glass', bpm: L.bpm, ap: false, apAmt: .55,
    layers: [L.melody.map(([b, i, d]) => ({ b, d, i, v: .8 }))], at: 1 }] }); }
