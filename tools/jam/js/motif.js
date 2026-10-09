// Neon Terrarium jam room: the motif engine.
// A motif is a rhythm cell plus an interval shape, stored separately so each can be varied on its own.
// Operations develop it (sequence, inversion, fragment ...). A small seeded beam search then picks the real notes
// for a whole phrase against the chord scales. Noise only shapes the contour; the harmony rules pick the notes.
// All tables are written by hand from music theory.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};
  const clamp = J.clamp, u = J.u;

  // ------------------------------------------------------------------------------------------
  // smooth seeded noise (layered value noise, the "Perlin idea" used for shape only)
  // ------------------------------------------------------------------------------------------
  J.noise1 = function (seed, x, octaves, persistence, lacunarity) {
    octaves = octaves || 3; persistence = persistence || 0.5; lacunarity = lacunarity || 2;
    let amp = 1, freq = 1, tot = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const xi = Math.floor(x * freq), f = x * freq - xi, w = f * f * (3 - 2 * f);
      const a = u(seed, 'n', o, xi) * 2 - 1, b = u(seed, 'n', o, xi + 1) * 2 - 1;
      tot += (a + (b - a) * w) * amp; norm += amp; amp *= persistence; freq *= lacunarity;
    }
    return tot / norm;
  };

  // scale degree <-> midi, degree 0 = tonic at tonicMidi
  J.midiToDeg = function (tonicMidi, scaleName, m) {
    const sc = J.SCALES[scaleName], rel = m - tonicMidi, oct = Math.floor(rel / 12), r = rel - oct * 12;
    let bi = 0, bd = 99;
    sc.forEach((x, i) => { const d = Math.abs(x - r); if (d < bd) { bd = d; bi = i; } });
    return oct * sc.length + bi + (bd > 0 ? 0.01 : 0);
  };

  // ------------------------------------------------------------------------------------------
  // rhythm cells (onset steps in a 16-step bar), each with a recognizable feature
  // ------------------------------------------------------------------------------------------
  const CELLS = [
    { on: [0, 3, 6, 10, 12], tags: ['sync'] },
    { on: [0, 3, 6, 8, 11, 14], tags: ['sync', '332'] },
    { on: [0, 2, 3, 6, 10], tags: ['sync'] },
    { on: [0, 4, 6, 8, 12], tags: ['sync'] },
    { on: [0, 3, 4, 8, 11, 12], tags: ['dotted'] },
    { on: [0, 3, 7, 10, 12], tags: ['sync'] },
    { on: [0, 2, 4, 8, 10], tags: ['repeat'] },
    { on: [2, 4, 6, 10, 14], tags: ['sync', 'pickup'] },
    { on: [0, 3, 8, 11], tags: ['sync'] },
    { on: [0, 2, 3, 8, 10, 11], tags: ['dotted', 'repeat'] },
    { on: [0, 6, 8, 11, 14], tags: ['sync'] },
    { on: [3, 6, 8, 12, 14], tags: ['sync', 'pickup'] },
  ];
  function withDurations(on, steps, tail) {
    return on.map((s, i) => (i + 1 < on.length ? on[i + 1] - s : Math.min(tail || 4, steps - s)));
  }
  J.CELLS = CELLS;

  // ------------------------------------------------------------------------------------------
  // making a motif
  // ------------------------------------------------------------------------------------------
  const STABLE = [0, 2, 4];                 // scale degrees of the tonic triad
  const mod7 = d => ((d % 7) + 7) % 7;
  // one interval shape for n notes: exactly one characteristic leap (3 to 5 scale steps), recovered by a step the other way
  function makeShape(r, n, needZero) {
    const k = n - 1;                                 // number of intervals, 3 to 6
    const out = new Array(k).fill(0);
    const j = r.int(0, Math.max(0, k - 2));          // the leap is never the last interval (it needs a recovery step)
    const dir = r.chance(0.55) ? 1 : -1;
    out[j] = dir * r.pick([3, 3, 4, 4, 5]);
    if (j + 1 < k) out[j + 1] = -dir;
    let zeroDone = false;
    for (let i = 0; i < k; i++) {
      if (i === j || i === j + 1) continue;
      let v = r.weighted([-2, -1, 1, 2], x => ({ '-2': 1, '-1': 2.2, '1': 2.2, '2': 1 }[x]));
      if (needZero && !zeroDone && r.chance(0.6)) { v = 0; zeroDone = true; }
      out[i] = v;
    }
    if (needZero && !zeroDone) { const i = r.pick(out.map((_, x) => x).filter(x => x !== j && x !== j + 1).concat([k - 1])); if (i !== j) out[i] = 0; }
    return out;
  }
  const cum = (a0, I) => { const o = [a0]; I.forEach(v => o.push(o[o.length - 1] + v)); return o; };

  // song: { tonic, scaleName, major, home (progression) }
  J.makeHook = function (seed, song) {
    const scale = J.SCALES[song.scaleName];
    const tonicMidi = 62 + (((song.tonic - 62) % 12) + 12) % 12;   // the tonic sits in 62..73 so scale degrees 0..8 fit the lead band
    const semis = d => J.degreeMidi(0, song.scaleName, d);
    // the first two chords of the home progression, as pitch-class sets
    const chords = song.home.chords.slice(0, 2).map(c => {
      const pcs = J.chordPcs(J.buildChord((song.tonic + c.root) % 12, c.base, {}));
      return { root: (song.tonic + c.root) % 12, pcs };
    });
    const degOfRoot = rootPc => { const rel = ((rootPc - song.tonic) % 12 + 12) % 12; let bi = 0, bd = 99; scale.forEach((x, i) => { const d = Math.abs(x - rel); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const cands = [];
    const r = J.rng(seed, 'hook');
    for (let c = 0; c < 36; c++) {
      const cell = r.pick(CELLS);
      const n = cell.on.length;
      const shape = makeShape(r, n, cell.tags.includes('repeat'));
      // starting degree: a chord tone of the first chord, in the lower part of the range
      let starts = [0, 2, 4, 7].filter(a => chords[0].pcs.includes(((song.tonic + scale[mod7(a)]) % 12 + 12) % 12));
      if (!starts.length) starts = [0, 1, 2, 3, 4, 5, 6, 7].filter(a => chords[0].pcs.includes(((song.tonic + scale[mod7(a)]) % 12 + 12) % 12));
      if (!starts.length) starts = [0, 2, 4];
      const a0 = r.pick(starts);
      const degs = cum(a0, shape);
      // ends on a stable tone
      let endOk = STABLE.includes(mod7(degs[degs.length - 1]));
      // score
      let score = 0;
      const on = cell.on, durs = withDurations(on, 16);
      score += cell.tags.length ? 2 : 0;
      score += new Set(on.map((s, i) => (i ? s - on[i - 1] : 99))).size * 0.5;
      score += (on.some(s => s % 4 !== 0) ? 1 : 0) + (on.includes(4) || on.includes(12) ? 0.5 : 0);
      score += Math.min(3, new Set(shape).size) * 0.7;
      const range = Math.max(...degs) - Math.min(...degs);
      if (range > 8) score -= 6; else score += 1;
      const sm = degs.map(semis);
      for (let i = 1; i < sm.length; i++) { const dd = Math.abs(sm[i] - sm[i - 1]); if (dd === 6) score -= 7; if (dd > 12) score -= 9; if (dd === 3 && Math.abs(shape[i - 1]) === 1) score -= 3; }
      if (endOk) score += 2.5;
      // fit: strong-beat notes over chord 1, and the same shape sequenced over chord 2
      const k2 = chords[1] ? ((degOfRoot(chords[1].root) - degOfRoot(chords[0].root)) + 7) % 7 : 0;
      let fit = 0, cnt = 0;
      degs.forEach((d, i) => {
        if (on[i] % 4 === 0) {
          cnt++;
          if (chords[0].pcs.includes(((song.tonic + scale[mod7(d)]) % 12 + 12) % 12)) fit++;
          if (chords[1] && chords[1].pcs.includes(((song.tonic + scale[mod7(d + (k2 > 3 ? k2 - 7 : k2))]) % 12 + 12) % 12)) fit += 0.7;
        }
      });
      score += cnt ? 3 * fit / (cnt * 1.7) : 0;
      score += u(seed, 'cellpref', CELLS.indexOf(cell)) * 3.5 + u(seed, 'hookn', c) * 0.4;   // each seed likes some rhythms more, so hooks differ
      cands.push({ cell, shape, a0, score, c });
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    const other = cands.find(x => x.cell !== best.cell) || cands[1] || best;
    const other2 = cands.find(x => x.shape.join() !== best.shape.join()) || best;
    return {
      cell: { on: best.cell.on.slice(), d: withDurations(best.cell.on, 16), tags: best.cell.tags }, shape: best.shape, a0: best.a0,
      cell2: { on: other.cell.on.slice(), d: withDurations(other.cell.on, 16), tags: other.cell.tags },
      shape2: other2.shape, score: best.score, tonicMidi,
    };
  };

  // ------------------------------------------------------------------------------------------
  // developing the motif: one bar for one operation
  // o: { steps, meter, k (sequence shift in scale steps), reg (register offset in scale steps), endDeg (cadence tone) or undefined }
  // returns { on: [{s, d}], degs: [...], op }
  // ------------------------------------------------------------------------------------------
  J.motifBar = function (hook, op, o) {
    const steps = o.steps, reg = o.reg || 0;
    let R = op === 'newrhythm' ? hook.cell2 : hook.cell;
    let I = op === 'newpitch' ? hook.shape2 : hook.shape;
    let on = R.on.map((s, i) => ({ s, d: R.d[i] }));
    let degs = cum(hook.a0 + reg, I);
    if (R.on.length !== degs.length) { // newrhythm needs a shape of the same length: cycle the shape
      const n = R.on.length; degs = [hook.a0 + reg]; for (let i = 0; i < n - 1; i++) degs.push(degs[i] + hook.shape[i % hook.shape.length]);
    }
    const n = on.length;
    switch (op) {
      case 'seq': degs = degs.map(d => d + (o.k || 1)); break;
      case 'invert': { const a = hook.a0 + reg; degs = degs.map(d => a - (d - a)); break; }
      case 'retro': degs = degs.slice().reverse(); break;
      case 'aug': on = on.map(x => ({ s: x.s * 2, d: x.d * 2 })).filter(x => x.s < steps); degs = degs.slice(0, on.length); break;
      case 'dim': {
        const h = on.map(x => ({ s: Math.round(x.s / 2), d: Math.max(1, Math.round(x.d / 2)) }));
        on = h.concat(h.map(x => ({ s: x.s + 8, d: x.d }))).filter(x => x.s < steps); degs = degs.concat(degs).slice(0, on.length); break;
      }
      case 'displace': on = on.map(x => ({ s: x.s + 2, d: x.d })).filter(x => x.s < steps); degs = degs.slice(0, on.length); break;
      case 'frag': {
        const k = Math.max(2, Math.ceil(n / 2)), head = on.slice(0, k);
        on = head.map(x => ({ s: x.s, d: x.d })).concat(head.map(x => ({ s: x.s + 8, d: x.d }))).filter(x => x.s < steps);
        const dh = degs.slice(0, k); degs = dh.concat(dh.map(d => d + (o.k || 0))).slice(0, on.length); break;
      }
      case 'ext': {
        const last = on[n - 1], tailStart = last.s + last.d;
        if (tailStart < steps - 1 && o.endDeg !== undefined) {
          const from = degs[degs.length - 1], dir = Math.sign(o.endDeg - from) || -1;
          const t1 = from + dir, t2 = o.endDeg;
          on = on.concat([{ s: tailStart, d: 2 }, { s: Math.min(steps - 2, tailStart + 2), d: 4 }]); degs = degs.concat([t1, t2]);
        }
        break;
      }
      default: break;
    }
    on = on.filter(x => x.s < steps);
    degs = degs.slice(0, on.length);
    if (o.endDeg !== undefined && on.length) { degs[degs.length - 1] = o.endDeg; on[on.length - 1].d = Math.max(on[on.length - 1].d, Math.min(8, steps - on[on.length - 1].s)); }
    return { on, degs, op };
  };
  // a bar in an odd meter: one note on every group start, a syncopated extra inside long groups; the shape runs on across groups
  J.motifOddBar = function (hook, meter, o) {
    const I = hook.shape, reg = o.reg || 0;
    let degs = [], on = [], k = 0, d = hook.a0 + reg + (o.k || 0);
    meter.starts.forEach((s, gi) => {
      on.push({ s, d: 0 }); degs.push(d); d += I[k++ % I.length];
      if (meter.groups[gi] >= 6) { on.push({ s: s + 3, d: 0 }); degs.push(d); d += I[k++ % I.length]; }
    });
    on.forEach((x, i) => { x.d = i + 1 < on.length ? on[i + 1].s - x.s : Math.min(4, meter.steps - x.s); });
    if (o.endDeg !== undefined) { degs[degs.length - 1] = o.endDeg; }
    return { on, degs, op: 'odd' };
  };

  // ------------------------------------------------------------------------------------------
  // melodic interval costs, written by hand (steps dominate, 7ths and tritones are expensive)
  // ------------------------------------------------------------------------------------------
  const IV_COST = [0.6, 0, 0, 0.5, 0.6, 1.4, 8, 1.6, 2.6, 2.4, 5, 6, 3.2];
  J.ivCost = d => { d = Math.abs(d); return d <= 12 ? IV_COST[d] : 12; };

  // ------------------------------------------------------------------------------------------
  // candidate search for one phrase (a small, seeded beam search)
  // spec: { onsets: [{ strong, targetDeg, scale (chordScale of the chord under it), nextScale, cadence: bool, last: bool, t (0..1 in the phrase) }],
  //         tonicMidi, scaleName, band: [lo, hi], width, seedKey, prev: midi or null, climaxT }
  // returns { notes: [midi...], cost }
  // ------------------------------------------------------------------------------------------
  J.searchPhrase = function (spec) {
    const { onsets, tonicMidi, scaleName, band, seedKey } = spec;
    const W = spec.width || 8, lo = band[0], hi = band[1];
    const sc = J.SCALES[scaleName];
    const deg2m = d => J.degreeMidi(tonicMidi, scaleName, Math.round(d));
    const foldMidi = m => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };
    // candidate pitches for every onset
    // the whole phrase moves by octaves as one piece, so the contour of the motif is kept; only a stray note is folded alone
    const raws = onsets.map(o => deg2m(o.targetDeg));
    let shift = 0;
    if (raws.length) {
      const mid = (Math.min.apply(null, raws) + Math.max.apply(null, raws)) / 2, want = (lo + hi) / 2 - 3;
      shift = 12 * Math.round((want - mid) / 12);
    }
    const shiftDeg = 7 * shift / 12;
    const cand = onsets.map((o, i) => {
      const tm = foldMidi(raws[i] + shift);
      const pcs = o.scale.set;
      let list = [];
      for (let m = Math.max(lo, tm - 8); m <= Math.min(hi, tm + 8); m++) if (pcs.has(m % 12)) list.push(m);
      if (!list.length) for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) list.push(m);
      list.sort((a, b) => Math.abs(a - tm) - Math.abs(b - tm));
      return { tm, list: list.slice(0, 9) };
    });
    const noteCost = (i, m) => {
      const o = onsets[i], c = cand[i];
      const pc = m % 12, ct = o.scale.chord.has(pc), av = o.scale.avoid.has(pc);
      let cost = 0;
      if (o.strong || o.cadence) cost += ct ? 0 : (av ? 30 : 2.4); else cost += ct ? 0 : (av ? 5 : 0.5);
      if (o.last || o.cadence) cost += ct ? 0 : 20;
      const dg = Math.abs(J.midiToDeg(tonicMidi, scaleName, m) - (o.targetDeg + shiftDeg));
      cost += Math.min(7, dg) * 0.9;
      if (o.pref !== undefined && m !== o.pref) cost += 3.2;                      // the hook returns on the pitches it had before
      cost += (u(seedKey, 'tie', i, m) * 0.12);
      return cost;
    };
    const winOf = (seq, i) => seq.slice(Math.max(0, i - 1), i + 2);
    const figCost = (seq, i) => { // cost of the figure that note i makes with its neighbours (once its right neighbour is known)
      const items = [];
      for (let k = Math.max(0, i - 1); k <= Math.min(seq.length - 1, i + 1); k++) {
        const o = onsets[k], m = seq[k];
        items.push({ m, strong: !!(o.strong || o.cadence), ct: o.scale.chord.has(m % 12), nextCt: o.nextScale ? o.nextScale.chord.has(m % 12) : false });
      }
      const idx = i - Math.max(0, i - 1);
      return J.nctFigure(items, idx) === 'bad' && items[idx].strong ? 28 : (J.nctFigure(items, idx) === 'bad' ? 3 : 0);
    };
    let beam = [{ seq: [], cost: 0 }];
    for (let i = 0; i < onsets.length; i++) {
      const next = [];
      for (const st of beam) {
        const prev = i > 0 ? st.seq[i - 1] : spec.prev;
        for (const m of cand[i].list) {
          let c = st.cost + noteCost(i, m);
          if (prev !== null && prev !== undefined) {
            const d = m - prev;
            c += J.ivCost(d);
            if (onsets[i].tsign !== undefined && Math.sign(d) !== onsets[i].tsign) c += 4.5;     // keep the motif's up/down/repeat contour
            const pv = i > 1 ? st.seq[i - 1] - st.seq[i - 2] : (i === 1 && spec.prev !== null && spec.prev !== undefined ? st.seq[0] - spec.prev : 0);
            if (Math.abs(pv) >= 5) { if (!(Math.abs(d) >= 1 && Math.abs(d) <= 2 && Math.sign(d) === -Math.sign(pv))) c += 6; }
            if (Math.abs(pv) >= 5 && Math.abs(d) >= 5 && Math.sign(pv) === Math.sign(d)) {
              const a = onsets[i - 1], b = onsets[i];
              if (!(a.scale.chord.has((prev) % 12) && b.scale.chord.has(m % 12))) c += 4;
            }
            // an augmented second inside the chord scale
            if (Math.abs(d) === 3) { const p = onsets[i].scale.pcs; const ia = p.indexOf(prev % 12), ib = p.indexOf(m % 12); if (ia >= 0 && ib >= 0 && (Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === p.length - 1)) c += 6; }
          }
          const seq = st.seq.concat([m]);
          if (i >= 1) c += figCost(seq, i - 1);
          next.push({ seq, cost: c });
        }
      }
      next.sort((a, b) => a.cost - b.cost);
      beam = next.slice(0, W);
    }
    // finish: the last note's figure, and the climax placement
    beam.forEach(st => {
      st.cost += figCost(st.seq, st.seq.length - 1);
      let hi_ = -1, hp = 0;
      st.seq.forEach((m, i) => { if (m > hi_) { hi_ = m; hp = onsets[i].t; } });
      st.cost += 1.5 * Math.abs(hp - (spec.climaxT === undefined ? 0.6 : spec.climaxT));
    });
    beam.sort((a, b) => a.cost - b.cost);
    return { notes: beam[0].seq, cost: beam[0].cost };
  };
})(typeof window !== 'undefined' ? window : globalThis);
