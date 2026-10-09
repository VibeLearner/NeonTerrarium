// Neon Terrarium jam room: the hand-written rule book.
// One place for the register bands, ring and release times, chord scales, avoid notes, chord functions,
// cadence names and the non-chord-tone figures. The second composer (composer2.js) composes against these
// rules and lint.js counts violations of the same rules, so the two cannot drift apart.
// Everything here is written from music theory. Nothing is learned from any recording or dataset.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};

  // ------------------------------------------------------------------------------------------
  // register bands (MIDI note numbers, 60 = middle C). Layer centers stay apart on purpose.
  // ------------------------------------------------------------------------------------------
  J.BANDS = { bass: [28, 48], pads: [48, 67], keys: [55, 74], twinkle: [62, 86], lead: [67, 88] };

  // ring and release times in seconds. The synth reads these, and so does the lint.
  J.RING = {
    newMax: 1.2,       // a twinkle string never rings longer than this (second composer)
    oldMax: 2.4,       // the first composer lets the whole Karplus-Strong buffer ring
    dampRel: 0.045,    // a pluck that does not belong to a new chord is damped over this long
    padXfade: 0.09,    // pad notes that leave at a chord change fade over this long, new ones fade in over it
  };

  // ------------------------------------------------------------------------------------------
  // chord scales
  // ------------------------------------------------------------------------------------------
  const MODES = {
    ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10], locrian2: [0, 2, 3, 5, 6, 8, 10], melodicMinor: [0, 2, 3, 5, 7, 9, 11],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11], phrygDom: [0, 1, 4, 5, 7, 8, 10], lydianDom: [0, 2, 4, 6, 7, 9, 10],
    altered: [0, 1, 3, 4, 6, 8, 10], wholeTone: [0, 2, 4, 6, 8, 10], wholeHalf: [0, 2, 3, 5, 6, 8, 9, 11],
  };
  J.MODES = MODES;
  // candidates for each chord quality, in order of preference
  const CANDS = {
    maj: ['ionian', 'lydian', 'mixolydian'],
    min: ['dorian', 'aeolian', 'phrygian', 'melodicMinor', 'harmonicMinor'],
    dom: ['mixolydian', 'lydianDom', 'phrygDom', 'altered', 'wholeTone'],
    hdim: ['locrian', 'locrian2'],
    dim: ['wholeHalf'],
  };
  const csCache = new Map();
  // returns { name, pcs (absolute pitch classes of the scale), chord (set), avoid (set), tension (set) }
  // chord: { root, base, pcs? | tones?, col? or alt? }
  J.chordScale = function (chord, tonic, songScale) {
    const cpcs = chord.pcs || J.chordPcs(chord);
    const key = chord.root + '|' + chord.base + '|' + cpcs.join(',') + '|' + tonic + '|' + songScale;
    if (csCache.has(key)) return csCache.get(key);
    const song = new Set((J.SCALES[songScale] || J.SCALES.aeolian).map(i => (tonic + i) % 12));
    const cset = new Set(cpcs);
    let best = null, bs = -1e9;
    (CANDS[chord.base] || CANDS.maj).forEach((nm, i) => {
      const pcs = MODES[nm].map(x => (chord.root + x) % 12);
      let inside = 0; cpcs.forEach(p => { if (pcs.includes(p)) inside++; });
      let overlap = 0; pcs.forEach(p => { if (song.has(p)) overlap++; });
      const sc = inside * 100 + overlap * 2 - i * 0.1;
      if (sc > bs) { bs = sc; best = { name: nm, pcs }; }
    });
    const avoid = new Set(), tension = new Set();
    best.pcs.forEach(p => {
      if (cset.has(p)) return;
      let av = false; cpcs.forEach(c => { if (((p - c) % 12 + 12) % 12 === 1) av = true; });
      (av ? avoid : tension).add(p);
    });
    const out = { name: best.name, pcs: best.pcs, set: new Set(best.pcs), chord: cset, avoid, tension };
    csCache.set(key, out);
    return out;
  };

  // ------------------------------------------------------------------------------------------
  // chord function and cadences. rel = semitones above the tonic.
  // ------------------------------------------------------------------------------------------
  J.funcOf = function (rel, base) {
    if (base === 'dom' && rel !== 0) return 'D';
    if (rel === 7 || rel === 11) return 'D';
    if (rel === 0 || rel === 3 || rel === 4 || rel === 9) return 'T';
    return 'S';
  };
  // Names the cadence formed by the last two chords of a phrase, or 'none'.
  // prev, last: { rel, base, sus? }
  J.cadenceOf = function (prev, last) {
    if (!prev || !last) return 'none';
    const fp = J.funcOf(prev.rel, prev.base), fl = J.funcOf(last.rel, last.base);
    if (last.rel === 0 && prev.rel === 5) return 'plagal';
    if (last.rel === 0 && fp === 'D') return 'full';
    if ((last.rel === 9 || last.rel === 8) && fp === 'D' && prev.rel === 7) return 'deceptive';
    if (fl === 'D' && (last.rel === 7 || last.rel === 11) && (fp === 'S' || fp === 'T')) return 'half';
    if (last.rel === 0 && fp === 'S') return 'plagal';
    return 'none';
  };

  // ------------------------------------------------------------------------------------------
  // beats and non-chord tones
  // ------------------------------------------------------------------------------------------
  J.isStrongStep = (meter, s) => meter.starts.includes(s);
  // classify the melody note at index i of notes = [{m (midi), strong, ct (is a chord tone of its chord), nextCt (tone of the NEXT chord)}]
  // returns 'ct' for a chord tone, a figure name for an allowed non-chord tone, or 'bad'
  J.nctFigure = function (notes, i) {
    const n = notes[i];
    if (n.ct) return 'ct';
    const p = i > 0 ? notes[i - 1] : null, q = i + 1 < notes.length ? notes[i + 1] : null;
    const dP = p ? n.m - p.m : null, dQ = q ? q.m - n.m : null;
    const step = d => d !== null && Math.abs(d) >= 1 && Math.abs(d) <= 2;
    if (q && q.m === n.m && n.nextCt) return 'anticipation';
    if (n.strong) {
      if (q && step(dQ) && q.ct) return 'appoggiatura';
      if (p && q && p.m === q.m && step(dP)) return 'neighbor';
      return 'bad';
    }
    if (p && q && step(dP) && step(dQ) && Math.sign(dP) === Math.sign(dQ)) return 'passing';
    if (p && q && p.m === q.m && step(dP)) return 'neighbor';
    if (p && q && step(dP) && Math.abs(dQ) >= 3 && Math.sign(dQ) === -Math.sign(dP)) return 'escape';
    if (p && q && step(dP) && dP < 0 && dQ <= -3 && dQ >= -4) return 'cambiata';
    if (q && step(dQ) && q.ct && !p) return 'appoggiatura';
    return 'bad';
  };
})(typeof window !== 'undefined' ? window : globalThis);
