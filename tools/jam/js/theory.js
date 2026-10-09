// Neon Terrarium jam room: music theory helpers.
// Scales, chord building, a hand-written progression catalog (from theory, not from any song),
// jazz recoloring and voice leading.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};

  J.NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  J.mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  J.pc = m => ((Math.round(m) % 12) + 12) % 12;
  J.noteName = m => J.NOTE_NAMES[J.pc(m)] + (Math.floor(m / 12) - 1);

  J.SCALES = {
    aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    ionian: [0, 2, 4, 5, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  };

  // ------------------------------------------------------------------------------------------
  // chords
  // ------------------------------------------------------------------------------------------
  // base: 'maj' | 'min' | 'dom' | 'dim' | 'hdim'
  // col:  { sev, nine, eleven, thirteen, sus: null|'2'|'4', add9, six, alt }
  J.buildChord = function (rootPc, base, col) {
    col = col || {};
    const t = new Set([0]);
    const minorish = base === 'min' || base === 'dim' || base === 'hdim';
    if (col.sus === '2') t.add(2); else if (col.sus === '4') t.add(5); else t.add(minorish ? 3 : 4);
    t.add(base === 'dim' || base === 'hdim' ? 6 : 7);
    const hasSev = !!col.sev || base === 'hdim';
    if (hasSev) {
      if (base === 'maj') t.add(11); else if (base === 'dim') t.add(9); else t.add(10);
    }
    if (col.nine || col.add9) t.add(col.alt && base === 'dom' ? 13 : 14);
    if (col.eleven && hasSev) t.add(base === 'min' || base === 'hdim' ? 17 : 18);
    if (col.thirteen && hasSev && base !== 'min' && base !== 'hdim') t.add(21);
    if (col.thirteen && hasSev && base === 'min') t.add(21);
    if (col.six && !hasSev) t.add(9);
    const tones = Array.from(t).sort((a, b) => a - b);

    const r = J.NOTE_NAMES[((rootPc % 12) + 12) % 12];
    let suf = '';
    if (col.sus) {
      suf = 'sus' + col.sus + (hasSev ? (col.nine ? '9' : '7') : '');
    } else if (base === 'maj') {
      suf = hasSev ? (col.thirteen ? 'maj13' : col.eleven ? 'maj7#11' : col.nine ? 'maj9' : 'maj7') : (col.add9 ? 'add9' : col.six ? '6' : '');
    } else if (base === 'min') {
      suf = hasSev ? (col.eleven ? 'm11' : col.nine ? 'm9' : 'm7') : (col.add9 ? 'm(add9)' : col.six ? 'm6' : 'm');
    } else if (base === 'dom') {
      suf = hasSev ? (col.thirteen ? '13' : col.alt ? '7b9' : col.nine ? '9' : '7') : '';
    } else if (base === 'dim') {
      suf = hasSev ? 'dim7' : 'dim';
    } else if (base === 'hdim') {
      suf = col.nine ? 'ø9' : 'ø7';
    }
    return { root: ((rootPc % 12) + 12) % 12, base, tones, name: r + suf, col: Object.assign({}, col, { sev: hasSev }) };
  };

  J.chordPcs = c => c.tones.map(i => (c.root + i) % 12);

  // ------------------------------------------------------------------------------------------
  // progression catalog (semitones from the tonic; quality letters: M maj, m min, d dominant, o dim, h half-dim, S sus4)
  // tags decide which genre sliders favor them
  // ------------------------------------------------------------------------------------------
  function parse(str) {
    return str.trim().split(/\s+/).map(tok => {
      const m = /^(\d+)([MmdohS])(?:\*([\d.]+))?$/.exec(tok);
      const q = m[2];
      return {
        root: +m[1],
        base: { M: 'maj', m: 'min', d: 'dom', o: 'dim', h: 'hdim', S: 'maj' }[q],
        sus: q === 'S' ? '4' : null,
        bars: m[3] ? +m[3] : 1,
      };
    });
  }
  const P = (id, mode, str, tags) => ({ id, mode, chords: parse(str), tags });

  J.PROGRESSIONS = [
    // minor-key loops in the emo / pop punk / dnb / jazz spirit
    P('emo-lift', 'minor', '0m 8M 3M 10M', ['emo', 'punk']),
    P('emo-turn', 'minor', '0m 3M 5m 10M', ['emo']),
    P('emo-ache', 'minor', '0m 5m 8M 7d', ['emo', 'dark']),
    P('emo-morning', 'minor', '8M 10M 0m 0m', ['emo', 'bright']),
    P('emo-sway', 'minor', '0m 10M 8M 10M', ['emo', 'punk']),
    P('cyber-phryg', 'minor', '0m 1M 0m 10M', ['dark', 'dnb', 'synth']),
    P('cyber-slab', 'minor', '0m 0m 8M 10M', ['dnb', 'synth']),
    P('cyber-iv', 'minor', '0m 5m 0m 7d', ['dnb', 'dark']),
    P('andalusian', 'minor', '0m 10M 8M 7d', ['dnb', 'dark', 'emo']),
    P('minor-pop', 'minor', '0m 3M 8M 7d', ['punk', 'emo']),
    P('minor-march', 'minor', '0m 8M 10M 7d', ['punk', 'dnb']),
    P('dark-bii', 'minor', '0m 1M 7d 0m', ['dark', 'synth']),
    P('jazz-min-iiV', 'minor', '2h 7d 0m 0m', ['jazz']),
    P('jazz-min-turn', 'minor', '0m 8M 2h 7d', ['jazz', 'emo']),
    P('jazz-min-circle', 'minor', '0m 5m 10d 3M 8M 2h 7d 0m', ['jazz']),
    P('jazz-min-slide', 'minor', '0m 3M 8M 7d', ['jazz', 'synth']),
    // major-key loops
    P('pp-classic', 'major', '0M 7M 9m 5M', ['punk']),
    P('pp-vi', 'major', '9m 5M 0M 7M', ['punk', 'emo']),
    P('pp-fifties', 'major', '0M 9m 5M 7M', ['punk']),
    P('pp-plain', 'major', '0M 5M 0M 7M', ['punk']),
    P('emo-iii', 'major', '0M 4m 5M 5m', ['emo']),
    P('emo-iv', 'major', '5M 0M 7M 9m', ['emo', 'bright']),
    P('jazz-maj-iiV', 'major', '2m 7d 0M 0M', ['jazz', 'bright']),
    P('jazz-maj-rhythm', 'major', '0M 9m 2m 7d', ['jazz', 'punk']),
    P('jazz-maj-turn', 'major', '4m 9d 2m 7d', ['jazz']),
    P('lydian-shimmer', 'major', '0M 2M 0M 2M', ['synth', 'bright']),
    P('city-pop', 'major', '5M 7M 4m 9m', ['synth', 'bright', 'jazz']),
  ];
  J.progById = id => J.PROGRESSIONS.find(p => p.id === id);

  // melody scale that fits a progression
  J.scaleFor = function (prog, rng, darkness) {
    const roots = prog.chords.map(c => c.root + ':' + c.base);
    if (prog.mode === 'minor') {
      if (prog.chords.some(c => c.root === 1)) return 'phrygian';
      if (!prog.chords.some(c => c.root === 8) && rng.chance(0.6)) return 'dorian';
      if (darkness > 0.8 && rng.chance(0.3)) return 'phrygian';
      return 'aeolian';
    }
    if (prog.chords.some(c => c.root === 2 && c.base === 'maj')) return 'lydian';
    if (prog.chords.some(c => c.root === 10)) return 'mixolydian';
    return 'ionian';
  };

  // ------------------------------------------------------------------------------------------
  // melody helpers
  // ------------------------------------------------------------------------------------------
  J.scaleMidis = function (tonicPc, scaleName, lo, hi) {
    const sc = J.SCALES[scaleName], out = [];
    for (let m = lo; m <= hi; m++) { if (sc.includes(((m - tonicPc) % 12 + 12) % 12)) out.push(m); }
    return out;
  };
  J.chordMidis = function (chord, lo, hi) {
    const pcs = J.chordPcs(chord), out = [];
    for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
    return out;
  };
  J.nearest = function (arr, target) {
    let best = arr[0], bd = Infinity;
    for (const a of arr) { const d = Math.abs(a - target); if (d < bd) { bd = d; best = a; } }
    return best;
  };
  // scale degree (any integer, 0 = tonic) to a midi note, tonic octave anchored at `tonicMidi`
  J.degreeMidi = function (tonicMidi, scaleName, deg) {
    const sc = J.SCALES[scaleName], n = sc.length;
    const oct = Math.floor(deg / n), idx = ((deg % n) + n) % n;
    return tonicMidi + oct * 12 + sc[idx];
  };
  J.bassMidi = function (pc, lo = 28) { // low E (28) .. up
    let m = lo + (((pc - lo) % 12) + 12) % 12;
    return m;
  };

  // ------------------------------------------------------------------------------------------
  // voicing with smooth voice leading
  // ------------------------------------------------------------------------------------------
  // Picks the closest voicing to `prev` (sorted midi array), within [lo, hi], with n voices.
  J.voice = function (chord, prev, opts) {
    const lo = opts.lo, hi = opts.hi, n = opts.n || 4;
    const includeRoot = opts.includeRoot !== false;
    // priority order of chord tones: third (or sus tone), seventh, upper extensions, fifth, root
    const t = chord.tones;
    const third = t.find(i => i === 3 || i === 4 || i === 2 || i === 5);
    const prio = [];
    if (third !== undefined) prio.push(third);
    for (const i of [10, 11, 9]) if (t.includes(i) && !(i === 9 && t.includes(10))) { prio.push(i); break; }
    for (const i of [14, 13, 17, 18, 21]) if (t.includes(i)) prio.push(i);
    if (t.includes(6) || t.includes(7)) prio.push(t.includes(7) ? 7 : 6);
    if (includeRoot) prio.push(0);
    const pcs = Array.from(new Set(prio.map(i => (chord.root + i) % 12)));
    const picks = pcs.slice(0, n);
    // triads: double the root (or fifth) up an octave when we still need voices
    const cands = picks.map(pc => { const a = []; for (let m = lo; m <= hi; m++) if (m % 12 === pc) a.push(m); return a; });
    let best = null, bestCost = Infinity;
    const center = (lo + hi) / 2;
    const cur = [];
    (function rec(i) {
      if (i === picks.length) {
        const s = cur.slice().sort((a, b) => a - b);
        let cost = 0;
        if (prev && prev.length) {
          const k = Math.min(prev.length, s.length);
          const ps = prev.slice().sort((a, b) => a - b);
          for (let j = 0; j < k; j++) cost += Math.abs(s[s.length - 1 - j] - ps[ps.length - 1 - j]);
          cost += Math.abs(s.length - ps.length) * 2;
        } else {
          cost += Math.abs(s.reduce((a, b) => a + b, 0) / s.length - center);
        }
        cost += 0.35 * Math.abs(s.reduce((a, b) => a + b, 0) / s.length - center);
        for (let j = 1; j < s.length; j++) { const gap = s[j] - s[j - 1]; if (gap < 3 && s[j - 1] < center - 6) cost += 4; if (gap > 10) cost += (gap - 10) * 0.7; }
        if (cost < bestCost) { bestCost = cost; best = s; }
        return;
      }
      for (const m of cands[i]) { if (!cur.includes(m)) { cur.push(m); rec(i + 1); cur.pop(); } }
    })(0);
    if (!best) best = picks.map((pc, i) => lo + ((pc - lo) % 12 + 12) % 12 + 12 * (i > 1 ? 1 : 0));
    if (best.length < n && best.length >= 3) { // thicken triads with the top note up an octave
      const top = best[0] + 12;
      if (top <= hi) best = best.concat([top]).sort((a, b) => a - b);
    }
    return best;
  };
})(typeof window !== 'undefined' ? window : globalThis);
