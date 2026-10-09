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
    // sampled sounds (round 5). The sampler cuts every pluck at newMax with a dampRel release, so a
    // sampled twinkle note never rings longer than the synth one. Longest recorded tails in the pack
    // (seconds, from samples/manifest.json, checked by lint.js):
    sampled: { gtr_green: 1.2, vibes: 3.0, glock: 2.2, marimba: 1.6, kalimba: 1.8, fmpiano: 2.4, upright: 2.6, bass_fashion: 1.6, bass_double: 1.8 },
    sampledCut: 1.2,   // what the sampler enforces for every twinkle instrument (= newMax)
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

  // ------------------------------------------------------------------------------------------
  // the checks themselves (shared by lint.js and the composer's own validator)
  // notes: [{ layer, m (midi), s, e (sounding span in steps), held (steps held as a chord tone, 0 if not held),
  //           strong, hv, strum, pluck }]
  // tl: sorted [{ s0, s1, seg: { root, base, pcs } }], the chord at every step
  // Each check returns the list of offending notes (or pairs) so the composer can regenerate them.
  // ------------------------------------------------------------------------------------------
  const check = J.check = {};
  check.segIndex = function (tl, t) {
    let lo = 0, hi = tl.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tl[mid].s0 <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  check.segAt = (tl, t) => tl[check.segIndex(tl, t)];
  // minor 9th (13 semitones) and minor 2nd (1) between two sounding notes that overlap by an eighth or more,
  // unless both pitch classes belong to the chord that is sounding (a b9 inside an altered dominant is allowed)
  check.clashes = function (notes, tl) {
    const out = [];
    const sorted = notes.filter(n => n.e - n.s >= 2).sort((a, b) => a.s - b.s);
    let active = [];
    for (const a of sorted) {
      active = active.filter(x => x.e > a.s + 2);
      for (const b of active) {
        const d = Math.abs(a.m - b.m);
        if (d !== 1 && d !== 13) continue;
        const lo = Math.max(a.s, b.s), hi = Math.min(a.e, b.e);
        if (hi - lo < 2) continue;
        let bad = 0;
        for (let t = Math.ceil(lo); t < hi; t++) { const sg = check.segAt(tl, t).seg; if (!(sg.pcs.includes(a.m % 12) && sg.pcs.includes(b.m % 12))) bad++; }
        if (bad >= 2) out.push([a, b]);
      }
      active.push(a);
    }
    return out;
  };
  // melody notes (one layer, in time order): returns { bad: [notes], avoid: [notes] }
  check.melody = function (seq, tl, tonic, scaleName) {
    const bad = [], avoid = [];
    const items = seq.map(n => {
      const si = check.segIndex(tl, n.s), cur = tl[si].seg, nxt = tl[si + 1];
      return { m: n.m, strong: !!n.strong, ct: cur.pcs.includes(n.m % 12), nextCt: nxt ? nxt.seg.pcs.includes(n.m % 12) : false, seg: cur, n };
    });
    items.forEach((it, i) => {
      const prevGap = i > 0 && it.n.s - items[i - 1].n.s > 8, nextGap = i + 1 < items.length && items[i + 1].n.s - it.n.s > 8;
      const local = []; if (i > 0 && !prevGap) local.push(items[i - 1]);
      const idx = local.length; local.push(it);
      if (i + 1 < items.length && !nextGap) local.push(items[i + 1]);
      if (J.nctFigure(local, idx) === 'bad' && it.strong) bad.push(it.n);
      if (it.strong && !it.ct) { const sc = J.chordScale({ root: it.seg.root, base: it.seg.base, pcs: it.seg.pcs }, tonic, scaleName); if (sc.avoid.has(it.m % 12)) avoid.push(it.n); }
    });
    return { bad, avoid };
  };
  // pad, key and pluck notes still sounding (beyond tolerance seconds) after a chord change they do not belong to
  check.stale = function (notes, tl, spsAt, tol) {
    tol = tol || 0.22;
    const out = [];
    for (let k = 1; k < tl.length; k++) {
      const prev = tl[k - 1].seg, cur = tl[k].seg, b = tl[k].s0;
      if (prev.root === cur.root && prev.pcs.join() === cur.pcs.join()) continue;
      const sps = spsAt(b - 0.5);       // a note's length was converted to steps with the clock of the bar it started in, so the tolerance uses that same clock
      for (const n of notes) {
        if (n.layer !== 'pads' && n.layer !== 'keys' && n.layer !== 'twinkle') continue;
        if (n.s >= b - 0.01 || n.e <= b + tol / sps) continue;
        if (cur.pcs.includes(n.m % 12)) continue;
        out.push(n);
      }
    }
    return out;
  };
  // number of steps in [from, to) where more than two layers hold chords (2 or more notes, each held two beats or longer)
  check.holderSteps = function (notes, from, to) {
    const bad = [];
    for (let t = from; t < to; t += 2) {
      let holders = 0;
      ['pads', 'keys', 'twinkle'].forEach(L => {
        let c = 0;
        for (const n of notes) if (n.layer === L && n.held >= 8 && (L !== 'twinkle' || n.strum) && n.s <= t && n.s + n.held > t) c++;
        if (c >= 2) holders++;
      });
      if (holders > 2) bad.push(t);
    }
    return bad;
  };
})(typeof window !== 'undefined' ? window : globalThis);
