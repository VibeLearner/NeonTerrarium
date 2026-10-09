// Neon Terrarium jam room: the second composer ("new composer").
//
// What changed against composer.js, in one paragraph: every bar now has one harmony timeline (chord tones, chord
// scale, tensions, avoid notes) that all layers read. Color is chosen once per section, substitutions are rare,
// and every 4-bar phrase ends on a named cadence. The lead plays a developed motif (rhythm cell plus interval
// shape) found by a seeded candidate search. Layers keep to their own register bands, pads move by voice
// leading, plucks are damped at chord changes, and a validator (the same rules as lint.js) regenerates any phrase
// that breaks a rule. The first composer stays available and untouched.
//
// Everything here is rule-based and seeded: the same seed and sliders always give the same piece.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};
  const C = J._c;
  const clamp = J.clamp, lerp = J.lerp, u = J.u;
  const MET = C.MET;

  // ------------------------------------------------------------------------------------------
  // validator statistics (reported by lint.js)
  // ------------------------------------------------------------------------------------------
  J.stats2 = {
    c: {}, reset() { this.c = { phrases: 0, firstTryClean: 0, twinkleDrops: 0, retries: 0, backups: 0, fallbacks: 0, leadDrops: 0 }; },
    snapshot() { return Object.assign({}, this.c); },
  };
  J.stats2.reset();
  const stat = (k, n) => { J.stats2.c[k] = (J.stats2.c[k] || 0) + (n === undefined ? 1 : n); };

  // ------------------------------------------------------------------------------------------
  // the arc over one cycle of the form: establish, develop, climax (at 80%), resolve
  // ------------------------------------------------------------------------------------------
  const CLIMAX = 0.8;
  function arcAt(p) {
    if (p <= CLIMAX) return 0.30 + 0.70 * Math.pow(p / CLIMAX, 1.2);
    return 1.0 - 0.85 * Math.pow((p - CLIMAX) / (1 - CLIMAX), 0.9);
  }
  function secBars(song, cycle, idx, kind) {
    let bars = C.BARS[kind];
    if ((kind === 'drop' || kind === 'chorus') && idx > 3) bars = 24;
    if (kind === 'breakdown') bars = J.rng(song.seed, 'sec', cycle, idx, kind).chance(0.35) ? 12 : 8;
    return bars;
  }

  // ------------------------------------------------------------------------------------------
  // color profiles: chosen once per section
  // ------------------------------------------------------------------------------------------
  function pickProfile(sec, eff, song) {
    const r = J.rng(sec.rngSeed, 'profile'), k = sec.kind, bk = sec.bridgeKind;
    if (k === 'chorus') return 'punk';
    if (k === 'bridge') return bk === 'jazz' ? 'jazz' : 'emo';
    const w = { jazz: eff.jazz * 1.1, emo: eff.emo, plain: 0.35, dark: song.major ? 0 : eff.dark * 0.3 };
    if (k === 'intro') { w.jazz *= 0.8; w.plain *= 0.5; }
    if (k === 'breakdown' && sec.clock === 0.5) w.jazz *= 1.6;
    if (k === 'drop' || k === 'build') w.emo *= 0.7;
    if (k === 'swell') { w.emo *= 2; w.jazz *= 0.5; }
    if (k === 'outro') w.emo *= 1.5;
    return r.weighted(['jazz', 'emo', 'plain', 'dark'], x => w[x]);
  }
  // the color of one chord. role: 'cad' for a cadence chord, 'half' for the dominant of a half cadence, 'pre' before a cadence
  function colorFor2(profile, def, rel, role, rr, eff, song) {
    const col = {}, base = def.base, jz = eff.jazz;
    if (def.sus) col.sus = def.sus;
    switch (profile) {
      case 'punk': break;                                             // plain triads, like power chords
      case 'plain':
        if (base === 'dom') col.sev = true; else if (base === 'maj' && rel === 0 && rr.chance(0.25)) col.add9 = true;
        break;
      case 'emo':
        if (base === 'maj' || base === 'min') {
          if (!def.sus) { if (rr.chance(0.7)) col.add9 = true; else if (role !== 'cad' && rr.chance(0.6)) col.sus = rr.chance(0.6) ? '2' : '4'; }
        } else if (base === 'dom') { if (role === 'half') col.sus = '4'; else col.sev = rr.chance(0.5); }
        break;
      case 'jazz':
        col.sev = true;
        if (base === 'maj') {
          if (rel === 5 || rel === 8 || rel === 2) { if (rr.chance(0.6)) col.eleven = true; else col.nine = true; }
          else { if (rr.chance(0.55)) col.nine = true; if (rel === 0 && !col.nine && rr.chance(0.4)) col.thirteen = true; }
        } else if (base === 'min') { col.nine = true; if (jz > 0.6 && role !== 'pre' && rr.chance(0.4)) col.eleven = true; }
        else if (base === 'dom') {
          col.nine = true;
          if (role === 'cad' && !song.major && jz > 0.5 && rr.chance(0.5)) col.alt = true;      // the one extra tension, on the dominant
          else if (rr.chance(0.5)) col.thirteen = true;
        } else if (base === 'hdim') col.nine = rr.chance(0.4);
        break;
      case 'dark':
        col.sev = true; if (base === 'min' && rr.chance(0.5)) col.nine = true; break;
    }
    return col;
  }

  // ------------------------------------------------------------------------------------------
  // cadences and the bars that carry them
  // ------------------------------------------------------------------------------------------
  function planCadences(sec, profile) {
    const nP = sec.bars / 4, r = J.rng(sec.rngSeed, 'cad'), k = sec.kind, out = [];
    for (let p = 0; p < nP; p++) {
      const lastP = p === nP - 1;
      let c;
      if (lastP) c = (k === 'build' || k === 'swell' || k === 'breakdown' || k === 'bridge') ? 'half' : (k === 'outro' ? (profile === 'emo' ? 'plagal' : 'full') : (profile === 'emo' && r.chance(0.25) ? 'plagal' : 'full'));
      else c = p % 2 === 0 ? 'half' : 'full';
      if (!lastP && p % 2 === 1 && p >= 3 && r.chance(0.35)) c = 'deceptive';
      if (!lastP && c === 'full' && profile === 'emo' && r.chance(0.5)) c = 'plagal';
      out.push(c);
    }
    return out;
  }
  // chord definitions for a cadence: rel = semitones above the tonic
  function cadenceChords(song, profile, cad, r) {
    const mk = (rel, base, sus) => ({ root: (song.tonic + rel) % 12, base, sus: sus || null, rel });
    const T = mk(0, song.major ? 'maj' : 'min');
    const V = (profile === 'punk' && !song.major) ? mk(7, 'maj') : mk(7, 'dom');
    let S;
    if (song.major) S = profile === 'jazz' ? mk(2, 'min') : mk(5, 'maj');
    else S = profile === 'jazz' ? (r.chance(0.5) ? mk(2, 'hdim') : mk(5, 'min')) : (r.chance(0.5) ? mk(8, 'maj') : mk(5, 'min'));
    const IV = mk(5, song.major ? 'maj' : 'min');
    const dec = song.major ? mk(9, 'min') : mk(8, 'maj');
    switch (cad) {
      case 'half': return [S, V];
      case 'full': return [V, T];
      case 'plagal': return [IV, T];
      case 'deceptive': return [V, dec];
    }
    return [S, V];
  }

  // ------------------------------------------------------------------------------------------
  // pad and guide-tone voicings
  // ------------------------------------------------------------------------------------------
  function chordRoles(chord) {
    const t = chord.tones, pc = i => (chord.root + i) % 12;
    const third = t.find(i => i === 3 || i === 4 || i === 2 || i === 5);
    const sev = [10, 11, 9].find(i => t.includes(i) && !(i === 9 && t.includes(10)));
    const fifth = t.includes(7) ? 7 : t.includes(6) ? 6 : undefined;
    const ext = [14, 13, 17, 18, 21].find(i => t.includes(i));
    return { third: third === undefined ? undefined : pc(third), seventh: sev === undefined ? undefined : pc(sev), fifth: fifth === undefined ? undefined : pc(fifth), ext: ext === undefined ? undefined : pc(ext), root: chord.root };
  }
  const inBand = (pc, lo, hi) => { const a = []; for (let m = lo; m <= hi; m++) if (m % 12 === pc) a.push(m); return a; };
  // three (or two) voices without the root, closest to the previous voicing, keeping common notes
  function padVoicing(chord, prev, thin) {
    const R = chordRoles(chord), band = J.BANDS.pads;
    const want = thin ? [R.third, R.seventh !== undefined ? R.seventh : R.fifth] : [R.third, R.seventh !== undefined ? R.seventh : R.fifth, R.ext !== undefined ? R.ext : R.fifth];
    const pcs = want.filter(x => x !== undefined);
    // a 9th sitting a semitone from the third (minor add9) would grind: use the fifth there instead
    for (let i = 1; i < pcs.length; i++) for (let k = 0; k < i; k++) if (((pcs[i] - pcs[k]) % 12 + 12) % 12 === 1 || ((pcs[k] - pcs[i]) % 12 + 12) % 12 === 1) { const alt = R.fifth !== undefined && !pcs.includes(R.fifth) ? R.fifth : null; if (alt !== null) pcs[i] = alt; else { pcs.splice(i, 1); i--; break; } }
    while (pcs.length < (thin ? 2 : 3)) pcs.push(pcs[0] === undefined ? chord.root : pcs[pcs.length % 2 ? 0 : 1]);
    const opts = pcs.map((pc, i) => { const o = inBand(pc, band[0], band[1]); return o.length ? o : [band[0] + ((pc - band[0]) % 12 + 12) % 12]; });
    let best = null, bc = 1e9;
    const cur = [];
    (function rec(i) {
      if (i === opts.length) {
        const s = cur.slice().sort((a, b) => a - b);
        for (let k = 1; k < s.length; k++) if (s[k] === s[k - 1]) return;
        let cost = 0;
        if (prev && prev.length) {
          s.forEach(m => { let d = 99; prev.forEach(p => { d = Math.min(d, Math.abs(m - p)); }); cost += d; if (prev.includes(m)) cost -= 3; });
        } else cost += Math.abs(s.reduce((a, b) => a + b, 0) / s.length - 57) * 0.5;
        for (let k = 1; k < s.length; k++) if (s[k] - s[k - 1] < 3) cost += 3;
        for (let a = 0; a < s.length; a++) for (let b2 = a + 1; b2 < s.length; b2++) { const dd = s[b2] - s[a]; if (dd === 1 || dd === 13) cost += 60; }
        if (cost < bc) { bc = cost; best = s; }
        return;
      }
      for (const m of opts[i]) { cur.push(m); rec(i + 1); cur.pop(); }
    })(0);
    return best || [opts[0][0]];
  }
  // the guide-tone line: thirds and sevenths of the chords, moving by the smallest step
  function guideTone(chord, prev) {
    const R = chordRoles(chord);
    const pcs = [R.third, R.seventh !== undefined ? R.seventh : R.fifth].filter(x => x !== undefined);
    let best = 67, bc = 1e9;
    pcs.forEach((pc, k) => inBand(pc, 62, 74).forEach(m => {
      const c = (prev === null ? Math.abs(m - 67) : Math.abs(m - prev)) + (k === 0 ? 0 : 0.2);
      if (c < bc) { bc = c; best = m; }
    }));
    return best;
  }

  // ------------------------------------------------------------------------------------------
  // planning a section: harmony, cadences, arc, pads, keys
  // ------------------------------------------------------------------------------------------
  const degOfRoot = (song, rootPc) => { const rel = ((rootPc - song.tonic) % 12 + 12) % 12, sc = J.SCALES[song.scaleName]; let bi = 0, bd = 99; sc.forEach((x, i) => { const d = Math.abs(x - rel); if (d < bd) { bd = d; bi = i; } }); return bi; };

  function eAt(sec, b, eff) {
    const t01 = sec.bars > 1 ? b / (sec.bars - 1) : 0;
    const pp = lerp(sec.p0, sec.p1, t01);
    return clamp((0.55 * lerp(sec.eB0, sec.eB1, t01) + 0.45 * arcAt(pp)) * (0.55 + 0.8 * eff.energy), 0, 1.1);
  }

  function planSection2(song, eff, cycle, idx, kind, st, formInfo) {
    const sec = C.planSection(song, eff, cycle, idx, kind, null);
    sec.new = true;
    // tempo: half-time of a slow manual tempo would drag (under about 72 felt BPM), so that section stays in full time
    if (sec.clock === 0.5 && song.bpm * 0.5 < 72) sec.clock = 1;
    sec.paceM = J.paceM(song.bpm); sec.sm = clamp(174 / song.bpm, 0.6, 2);   // sm: seconds-based gestures (strums, slow attacks) stretch with the beat
    const tot = formInfo.total;
    sec.p0 = formInfo.starts[idx] / tot; sec.p1 = (formInfo.starts[idx] + sec.bars) / tot;
    sec.arc0 = arcAt(sec.p0); sec.arc1 = arcAt(sec.p1);
    sec.eB0 = sec.e0; sec.eB1 = sec.e1;                                  // the section's own ramp; the song arc is blended in bar by bar (eAt)
    const profile = sec.profile = pickProfile(sec, eff, song);
    const rc = J.rng(sec.rngSeed, 'cadch');
    sec.cad = planCadences(sec, profile);

    // ---- one base chord per bar (from the progression), then the cadences are written into bars 3 and 4 of each phrase
    const bc = [];
    for (let b = 0; b < sec.bars; b++) {
      const def = sec.chords[sec.chordIdx[b]];
      bc.push({ root: def.root, base: def.base, sus: def.sus || null, rel: ((def.root - song.tonic) % 12 + 12) % 12, role: null });
    }
    sec.cad.forEach((cad, p) => {
      const pair = cadenceChords(song, profile, cad, rc);
      const want = cad === 'half' ? ['S', 'D'] : ['D', cad === 'deceptive' ? 'S' : 'T'];
      [2, 3].forEach((q, k) => {
        const b = 4 * p + q, cur = bc[b], w = pair[k];
        const keep = J.funcOf(cur.rel, cur.base) === want[k] && cur.rel === w.rel && !(cad === 'plagal' && k === 0 && cur.rel !== 5);
        if (!keep) bc[b] = { root: w.root, base: w.base, sus: w.sus, rel: w.rel };
        bc[b].role = k === 1 ? 'cad' : 'pre';
        if (k === 1 && cad === 'half') bc[b].role = 'half';
      });
    });
    sec.bc = bc;

    // ---- color once per section, substitutions at most once per phrase
    const subGateP = 0.35 + 0.45 * eff.jazz;
    const allowSubs = profile === 'jazz' || ((profile === 'plain' || profile === 'emo' || profile === 'dark') && eff.jazz > 0.45);
    sec.segs = []; sec.sub = [];
    for (let b = 0; b < sec.bars; b++) {
      const rr = J.rng(sec.rngSeed, 'col', b);
      const d = bc[b], meter = sec.meters[b], steps = meter.steps;
      const col = colorFor2(profile, d, d.rel, d.role, rr, eff, song);
      const chord = J.buildChord(d.root, d.base, col);
      let segs = [{ chord, s0: 0, s1: steps }];
      const p = Math.floor(b / 4), q = b % 4;
      if (allowSubs && kind !== 'chorus' && q === 1 && b + 1 < sec.bars && u(sec.rngSeed, 'sub', p) < subGateP && steps >= 14) {
        const nx = bc[b + 1];
        if (nx.root !== d.root) {
          const kk = u(sec.rngSeed, 'subk', p), minor = nx.base === 'min' || nx.base === 'hdim';
          const last = steps - 4;
          if (kk < 0.35) segs = [{ chord, s0: 0, s1: last }, { chord: J.buildChord((nx.root + 7) % 12, 'dom', { sev: true, nine: eff.jazz > 0.4, alt: minor && eff.jazz > 0.55 }), s0: last, s1: steps, sub: 'secdom' }];
          else if (kk < 0.6) segs = [{ chord, s0: 0, s1: last }, { chord: J.buildChord((nx.root + 1) % 12, 'dom', { sev: true, thirteen: true }), s0: last, s1: steps, sub: 'tritone' }];
          else if (kk < 0.88) segs = [{ chord, s0: 0, s1: last - 4 }, { chord: J.buildChord((nx.root + 2) % 12, minor ? 'hdim' : 'min', { sev: true }), s0: last - 4, s1: last, sub: 'ii' }, { chord: J.buildChord((nx.root + 7) % 12, 'dom', { sev: true, alt: minor }), s0: last, s1: steps, sub: 'V' }];
          else segs = [{ chord, s0: 0, s1: last }, { chord: J.buildChord((nx.root + 11) % 12, 'dim', { sev: true }), s0: last, s1: steps, sub: 'dim' }];
        }
      }
      segs.forEach(sg => {
        sg.pcs = J.chordPcs(sg.chord); sg.root = sg.chord.root; sg.base = sg.chord.base; sg.name = sg.chord.name; sg.alt = !!(sg.chord.col && sg.chord.col.alt);
        sg.scale = J.chordScale({ root: sg.root, base: sg.base, pcs: sg.pcs }, song.tonic, song.scaleName);
        sg.bassPc = sg.root;
      });
      sec.segs.push(segs);
    }

    // ---- flat list of chord segments with section-relative steps
    sec.flat = []; sec.barOff = [];
    let off = 0;
    for (let b = 0; b < sec.bars; b++) {
      sec.barOff.push(off);
      sec.segs[b].forEach(sg => sec.flat.push({ bar: b, s0: sg.s0, s1: sg.s1, a0: off + sg.s0, a1: off + sg.s1, seg: sg }));
      off += sec.meters[b].steps;
    }
    sec.totalSteps = off;

    // ---- keys mode, then pad mode (at most two layers hold chords at once)
    const bk = sec.bridgeKind;
    let km = 'off';
    switch (kind) {
      case 'chorus': km = 'off'; break;
      case 'drop': km = 'stab'; break;
      case 'build': km = eff.jazz > 0.3 ? 'stab' : 'off'; break;
      case 'swell': km = eff.jazz > 0.4 ? 'stab' : 'off'; break;
      case 'intro': km = eff.jazz > 0.4 ? 'sustain' : 'off'; break;
      case 'breakdown': km = sec.clock === 0.5 ? 'comp' : 'sustain'; break;
      case 'bridge': km = bk === 'jazz' ? 'comp' : bk === 'math' ? 'stab' : (eff.jazz > 0.3 ? 'sustain' : 'off'); break;
      case 'outro': km = 'sustain'; break;
    }
    sec.keysMode = km;
    sec.padMode = (km === 'sustain' || km === 'comp') ? 'thin' : 'full';

    // ---- pad voicings along the flat list, then pad note events (held notes are not restruck)
    const voicings = [];
    let pv = st.padPrev;
    sec.flat.forEach(f => { pv = padVoicing(f.seg.chord, pv, sec.padMode === 'thin'); voicings.push(pv); });
    st.padPrev = pv;
    sec.voicings = voicings;
    sec.padEv = sec.segs.map(() => []);
    sec.flat.forEach((f, i) => {
      voicings[i].forEach((m, vi) => {
        if (i > 0 && voicings[i - 1].includes(m)) return;                // held from the previous chord: not restruck
        let j = i;
        while (j + 1 < sec.flat.length && voicings[j + 1].includes(m)) j++;
        const end = sec.flat[j].a1, atEnd = j === sec.flat.length - 1;
        const e = eAt(sec, f.bar, eff);
        const vel = clamp((kind === 'drop' || kind === 'chorus' ? 0.5 : 0.75) * (0.5 + 0.7 * e) * (1 + 0.3 * eff.emo), 0.2, 1) / Math.sqrt(3);
        sec.padEv[f.bar].push({
          l: 'pads', k: 'note', s: f.s0, d: end - f.a0, notes: [m], v: vel, shimmer: vi === voicings[i].length - 1 ? eff.synth : 0,
          attack: i === 0 ? (kind === 'build' || kind === 'swell' ? 0.9 : 0.5) * sec.sm : J.RING.padXfade, release: atEnd ? 0.07 : J.RING.padXfade,
        });
      });
    });

    // ---- guide-tone line and keys voicings
    sec.guide = []; sec.keysLow = [];
    let gp = st.guidePrev, kp = st.keysPrev;
    const clashWith = (m, list) => list.some(x => Math.abs(m - x) === 1 || Math.abs(m - x) === 13);
    sec.flat.forEach((f, fi) => {
      gp = guideTone(f.seg.chord, gp);
      if (clashWith(gp, voicings[fi])) { const alt = [gp - 12, gp + 12].find(m => m >= J.BANDS.keys[0] && m <= J.BANDS.keys[1] && !clashWith(m, voicings[fi])); if (alt !== undefined) gp = alt; }
      sec.guide.push(gp);
      const lo = J.BANDS.keys[0];
      let low = J.voice(f.seg.chord, kp, { lo, hi: Math.max(lo + 7, gp - 3), n: 3, includeRoot: profile !== 'jazz' });
      low = low.filter(m => m < gp - 1 && !clashWith(m, voicings[fi]));
      { const keep = []; low.concat([gp]).sort((a, b2) => a - b2).forEach(m => { if (!keep.some(k => Math.abs(m - k) === 1 || Math.abs(m - k) === 13)) keep.push(m); else if (m === gp) { const j = keep.findIndex(k => Math.abs(m - k) === 1 || Math.abs(m - k) === 13); keep.splice(j, 1); keep.push(m); } }); low = keep.filter(m => m !== gp); }
      kp = low.length ? low : kp; sec.keysLow.push(low);
    });
    st.guidePrev = gp; st.keysPrev = kp;
    return sec;
  }

  // ------------------------------------------------------------------------------------------
  // lead plan for one phrase (motif development + candidate search + validation)
  // ------------------------------------------------------------------------------------------
  const OP_LABEL = {
    state: 'motif', repeat: 'motif again', seq: 'sequence', invert: 'inversion', retro: 'retrograde', aug: 'augmentation', dim: 'diminution',
    displace: 'displaced by an eighth', frag: 'fragment', ext: 'extension to the cadence', newpitch: 'same rhythm, new pitches', newrhythm: 'same pitches, new rhythm',
    odd: 'motif in odd meter', cad: 'cadence',
  };
  function leadActive(sec, b, eff, e) {
    const kind = sec.kind, bk = sec.bridgeKind;
    let on = false;
    switch (kind) {
      case 'build': case 'swell': on = b >= 6 && eff.synth > 0.4; break;
      case 'drop': case 'chorus': on = true; break;
      case 'bridge': on = bk === 'jazz' && eff.synth > 0.5 && b >= 4; break;
      default: on = false;
    }
    return on && e >= 0.58;
  }
  const isFillBar = (sec, b) => (b === sec.bars - 1 || (b % 8 === 7 && sec.bars > 8)) && sec.kind !== 'outro';

  function planPhrase(song, sec, p, eff, st) {
    const hook = song.hook, nb = 4, b0 = 4 * p;
    const rr = J.rng(sec.rngSeed, 'phr', p);
    const cad = sec.cad[p];
    const kind = sec.kind;
    const hookSection = kind === 'drop' || kind === 'chorus';
    const active = [];
    for (let q = 0; q < nb; q++) active.push(leadActive(sec, b0 + q, eff, eAt(sec, b0 + q, eff)));
    const plan = { p, cad, ops: [], lead: [], notes: [], twinkle: null, active, info: [] };
    // phrase type
    let type;
    if (hookSection) type = p % 2 === 0 ? 'period' : (u(sec.rngSeed, 'ptype', p) < 0.6 ? 'sentence' : 'period');
    else type = u(sec.rngSeed, 'ptype', p) < 0.5 ? 'sentence' : 'period';
    if (p === 0 && hookSection) type = 'period';
    plan.type = type;
    const regBase = kind === 'chorus' ? 2 : (kind === 'drop' ? 1 : 0);
    const arcP = lerp(sec.arc0, sec.arc1, (b0 + 2) / sec.bars);
    const lift = Math.round(1.6 * (arcP - 0.55));
    const variedPool = sec.bridgeKind === 'jazz' ? ['newpitch', 'newrhythm', 'displace'] : (kind === 'build' || kind === 'swell' ? ['seq', 'frag', 'displace', 'dim'] : ['seq', 'seq', 'displace', 'invert']);
    let varied = rr.pick(variedPool);
    if ((varied === 'seq' || varied === 'invert') && rr.chance(0.1)) varied = 'retro';        // the rare retrograde
    const opsFor = type === 'period' ? ['state', 'seq', 'state', 'cad'] : ['state', varied, 'frag', 'ext'];
    if (!hookSection && kind !== 'bridge' && p % 2 === 1) opsFor[0] = rr.pick(['frag', 'state']);
    if (kind === 'bridge' && sec.bridgeKind === 'emo') opsFor[2] = 'aug';

    // cadence tone: a chord tone of the chord in the last segment of the last bar, nearest the line
    const lastSegs = sec.segs[b0 + nb - 1], lastSeg = lastSegs[lastSegs.length - 1];
    const degPc = d => { const sc = J.SCALES[song.scaleName]; const oct = Math.floor(d / 7); return ((song.tonic + sc[((d % 7) + 7) % 7]) % 12 + 12) % 12; };
    const nearestCT = (seg, d, prefer, w) => {
      let best = d, bc = 1e9;
      for (let x = d - 5; x <= d + 5; x++) {
        const pc = degPc(x); if (!seg.chord.has ? !seg.pcs.includes(pc) : !seg.scale.chord.has(pc)) continue;
        let c = Math.abs(x - d) + (prefer && prefer.includes(((pc - seg.root) % 12 + 12) % 12) ? -(w || 0.6) : 0);
        if (c < bc) { bc = c; best = x; }
      }
      return best;
    };

    // ---- per-bar motif material
    const onsets = [];
    let prevRootDeg = null;
    for (let q = 0; q < nb; q++) {
      const b = b0 + q, meter = sec.meters[b], steps = meter.steps;
      const segsB = sec.segs[b];
      const rootDeg = degOfRoot(song, segsB[0].root);
      const k = prevRootDeg === null ? 0 : clamp(rootDeg - prevRootDeg > 3 ? rootDeg - prevRootDeg - 7 : rootDeg - prevRootDeg < -3 ? rootDeg - prevRootDeg + 7 : rootDeg - prevRootDeg, -2, 2);
      prevRootDeg = rootDeg;
      let op = opsFor[q];
      const isCadBar = q === nb - 1;
      const o = { steps, reg: regBase + lift, k: op === 'seq' ? (k || (rr.chance(0.5) ? 1 : -1)) : (op === 'frag' ? 0 : 0) };
      if (op === 'cad') op = 'state';
      let endDeg;
      const lastS = isCadBar ? lastSeg : segsB[segsB.length - 1];
      if (isCadBar) {
        const startDeg = hook.a0 + regBase + lift;
        endDeg = cad === 'half' ? nearestCT(lastS, startDeg + 2, [4, 3, 7]) : nearestCT(lastS, startDeg, [0, 4, 3]);
        if (cad === 'full' || cad === 'plagal') endDeg = nearestCT(lastS, startDeg, [0], 3.5);
      } else if (type === 'period' && q === 1) {
        endDeg = nearestCT(lastS, hook.a0 + regBase + lift + 2, [4, 3, 7]);       // the antecedent ends open, on the 3rd or 5th
      }
      if (endDeg !== undefined) o.endDeg = endDeg;
      let mb;
      if (steps !== 16 || sec.style === 'math' && meter.groups.some(g => g !== 4)) { mb = J.motifOddBar(hook, meter, { reg: regBase + lift, k: op === 'seq' ? k : 0, endDeg: o.endDeg }); }
      else mb = J.motifBar(hook, op === 'ext' && o.endDeg === undefined ? 'state' : op, o);
      // fills happen in the lead's rests: keep only the first part of a fill bar, and always end on a chord tone
      if (isFillBar(sec, b) && mb.on.length > 1) {
        const keep = mb.on.map((x, i) => i).filter(i => mb.on[i].s < 10);
        if (keep.length) { mb = { on: keep.map(i => mb.on[i]), degs: keep.map(i => mb.degs[i]), op: mb.op }; if (o.endDeg !== undefined) mb.degs[mb.degs.length - 1] = o.endDeg; }
      }
      plan.ops.push(mb.op === 'odd' ? 'odd' : (isCadBar && cad ? 'cad' : op));
      plan.lead.push(mb);
      const label = (isCadBar ? 'cadence: ' + cad : (OP_LABEL[op] || op)) + (op === 'seq' && !isCadBar ? (o.k > 0 ? ' up a step' : o.k < 0 ? ' down a step' : '') : '');
      plan.info.push(label);
      if (!active[q]) continue;
      mb.on.forEach((x, i) => {
        const segIdx = (() => { let si = 0; segsB.forEach((sg, j) => { if (x.s >= sg.s0) si = j; }); return si; })();
        const seg = segsB[segIdx], nextSeg = segsB[segIdx + 1] || (sec.segs[b + 1] ? sec.segs[b + 1][0] : null);
        const t = (sec.barOff[b] - sec.barOff[b0] + x.s);
        onsets.push({ q, bar: b, i, s: x.s, d: x.d, strong: meter.starts.includes(x.s), op: op, memoKey: [steps, mb.on.map(z => z.s).join(','), seg.root, seg.base, i].join('|'), targetDeg: mb.degs[i], tsign: (i > 0 && (op === 'state' || op === 'repeat' || op === 'seq' || op === 'cad' || op === 'invert') && ! (isCadBar && i === mb.on.length - 1)) ? Math.sign(Math.round(mb.degs[i]) - Math.round(mb.degs[i - 1])) : undefined, scale: seg.scale, nextScale: nextSeg ? nextSeg.scale : null, seg, t, cadence: false, last: false });
      });
    }
    const phraseSteps = sec.barOff[b0 + nb - 1] - sec.barOff[b0] + sec.meters[b0 + nb - 1].steps;
    onsets.forEach(o => { o.t = o.t / phraseSteps; });
    if (onsets.length) { const lo_ = onsets[onsets.length - 1]; if (lo_.q === nb - 1) { lo_.cadence = true; lo_.last = true; } else lo_.last = true; }
    plan.onsets = onsets;
    plan.phraseSteps = phraseSteps;
    return plan;
  }

  // chord-tone-only version of a phrase (the safe choice)
  function safeNotes(onsets, tonicMidi, scaleName) {
    const band = J.BANDS.lead;
    return onsets.map(o => {
      let tm = J.degreeMidi(tonicMidi, scaleName, Math.round(o.targetDeg));
      while (tm > band[1]) tm -= 12; while (tm < band[0]) tm += 12;
      let best = tm, bd = 99;
      for (let m = band[0]; m <= band[1]; m++) if (o.scale.chord.has(m % 12) && Math.abs(m - tm) < bd) { bd = Math.abs(m - tm); best = m; }
      return best;
    });
  }

  // ------------------------------------------------------------------------------------------
  // tapped riffs: a fast two-hand figure (an anchor note, a hammered note, a tapped high note) in syncopated sixteenths.
  // Everything below is written by hand from how tapping works on a guitar: it is not taken from any recording.
  // ------------------------------------------------------------------------------------------
  // rhythm templates for a 16-step bar: a = accent, x = note, . = rest. The groups run 3+3+3+3+2+2 unless the template syncopates.
  const RIFF_RHYTHMS = [
    'axxaxxaxxaxxaxax',   // a full stream, 3+3+3+3+2+2
    'axxaxxaxx.a.axax',   // the same with a gap after the third group
    'a.xa.xaxxa.xa.xx',   // syncopated, two eighth-note feels leaning on the offbeats
    'axx.xxaxxa.xaxx.',   // a breath on beats 2 and 4
    'a.xxa.xxa.xxa.xx',   // 4+4+4+4 with the accent on each downbeat
  ];
  // which three chord tones (offsets in the chord pool) one group plays, and how its base moves group to group
  const RIFF_OFFSETS = [[0, 2, 4], [2, 0, 3], [0, 3, 5], [1, 0, 3]];
  const RIFF_BASES = [[0, 1, 2, 1, 0, 1], [0, 0, 1, 1, 2, 1], [2, 1, 0, 1, 2, 3]];
  function riffPlan(song, sec, p, eff) {
    const r = eff.riff || 0;
    if (r <= 0.02) return null;
    const kind = sec.kind;
    if (kind === 'intro' || kind === 'outro' || kind === 'build' || kind === 'swell' || kind === 'breakdown') return null;
    const hookSection = kind === 'drop' || kind === 'chorus';
    const nPh = Math.floor(sec.bars / 4);
    if (p < (hookSection ? 2 : 1) || nPh < 3 || p > nPh - 1) return null;        // the hook is stated first; the riff comes after it
    for (let q = 0; q < 4; q++) if (eAt(sec, 4 * p + q, eff) < 0.35) return null;
    const prob = clamp(r * (0.6 + 0.5 * eff.math + 0.3 * eff.synth) * (kind === 'bridge' ? 1.3 : 1), 0, 0.95);
    if (u(sec.rngSeed, 'riff', p) >= prob) return null;
    const rs = J.rng(sec.rngSeed, 'riffshape');
    return { rhythm: rs.int(0, RIFF_RHYTHMS.length - 1), offs: rs.pick(RIFF_OFFSETS), bases: rs.pick(RIFF_BASES) };
  }
  function riffCell(rp, meter, q) {
    const cell = [];
    let gi = 0;
    if (meter.steps === 16) {
      const tpl = RIFF_RHYTHMS[(rp.rhythm + (q === 3 ? 1 : 0)) % RIFF_RHYTHMS.length];
      let g = -1;
      for (let s = 0; s < 16; s++) {
        const ch = tpl[s];
        if (ch === '.') continue;
        if (ch === 'a') g++;
        cell.push({ s, acc: ch === 'a', riff: true, g: Math.max(g, 0), k: 0 });
      }
      // position inside each group decides the chord tone: anchor, hammer, tap
      const byG = {}; cell.forEach(c => { (byG[c.g] = byG[c.g] || []).push(c); });
      Object.keys(byG).forEach(gk => byG[gk].forEach((c, i) => { c.k = Math.min(i, 2); c.idx = rp.bases[(+gk) % rp.bases.length] + rp.offs[Math.min(i, 2)]; }));
    } else {
      meter.groups.forEach((len, g) => {
        const s0 = meter.starts[g];
        for (let i = 0; i < len; i++) cell.push({ s: s0 + i, acc: i === 0, riff: true, g, k: Math.min(i, 2), idx: rp.bases[g % rp.bases.length] + rp.offs[Math.min(i, 2)] });
      });
    }
    return cell;
  }

  // ------------------------------------------------------------------------------------------
  // twinkle for a phrase: open arpeggios with a pedal tone, thinned around the lead
  // ------------------------------------------------------------------------------------------
  function twinkleFor(song, sec, p, eff, leadOnsetsByBar, e0, rp) {
    const out = [];
    const b0 = 4 * p;
    const kind = sec.kind;
    const mathy = eff.math;
    const rr = J.rng(sec.rngSeed, 'twk', p);
    // pedal: the tonic or the fifth, high in the band, like an open string
    const pedalPc = rr.chance(0.6) ? song.tonic : (song.tonic + 7) % 12;
    const pedalM = (() => { for (let m = 74; m >= 62; m--) if (m % 12 === pedalPc) return m; return 72; })();
    for (let q = 0; q < 4; q++) {
      const b = b0 + q, meter = sec.meters[b], steps = meter.steps;
      const e = eAt(sec, b, eff);
      if (e < 0.12) continue;
      const style = sec.style === 'math' ? 'math' : (kind === 'breakdown' || kind === 'outro' || kind === 'intro') ? 'sparse' : 'arp';
      const meterKey = (style !== 'math' && steps === 16 && mathy > 0.45 && u(sec.rngSeed, 'tw332', p) < (mathy - 0.35) * 1.4) ? '332' : meter.id;
      const tmeter = meterKey === '332' ? MET['332'] : meter;
      const ckey = tmeter.id + ':' + style;
      sec.tw = sec.tw || {};
      if (!sec.tw[ckey]) sec.tw[ckey] = C.makeTwinkleCell(J.rng(sec.rngSeed, 'twc', ckey), tmeter, style);
      let cell = sec.tw[ckey];
      if (rp) cell = riffCell(rp, meter, q);
      const crescendo = (kind === 'build' || kind === 'swell') ? 0.45 + 0.6 * (b / Math.max(1, sec.bars - 1)) : (kind === 'outro' ? 1 - 0.7 * (b / Math.max(1, sec.bars - 1)) : 1);
      const lead = leadOnsetsByBar[q] || [];
      const rrb = J.rng(sec.rngSeed, 'twb', b);
      const segs = sec.segs[b];
      const dn = clamp(eff.density * sec.paceM, 0, 1);
      let lastRiffM = -1;
      cell.forEach((c, k) => {
        if (c.s >= steps) return;
        const beat = Math.floor(c.s / 4);
        const nLead = lead.filter(s => Math.floor(s / 4) === beat).length;
        // density budget: a busy lead thins the twinkle to downbeats, a resting lead lets it fill
        if (nLead >= 3 && c.s % 4 !== 0) return;
        if (nLead >= 1 && !c.acc && c.s % 4 !== 0) return;
        if (!c.riff) {
          if (style === 'sparse' && !c.acc && rrb.next() > 0.3 + 0.35 * dn) return;
          if (c.pick && rrb.next() > dn * 0.9) return;
          if (style === 'arp' && !c.acc && !c.pick && rrb.next() > 0.55 + 0.5 * dn) return;
          if ((kind === 'build' || kind === 'swell') && !c.acc && c.s % 4 !== 2 && b < sec.bars / 2) return;
        }
        let sg = segs[0]; segs.forEach(x => { if (c.s >= x.s0) sg = x; });
        const band = J.BANDS.twinkle;
        // open pool: chord tones spread at least a third apart
        let pool = J.chordMidis(sg.chord, band[0], band[1]).filter((m, i, a) => i === 0 || m - a[i - 1] >= 3);
        if (pool.length < 3) pool = J.chordMidis(sg.chord, band[0], band[1]);
        if (!pool.length) return;
        let m;
        const pedalOk = !c.riff && sg.scale.chord.has(pedalPc) && c.acc;
        if (pedalOk && (c.group === 0 || c.group % 2 === 0)) m = pedalM;
        else {
          const base = pool.findIndex(x => x >= 64 - Math.round(2 * eff.dark));
          let idx = (base < 0 ? 0 : base) + c.idx;
          const n_ = pool.length; if (idx >= n_) idx = Math.max(0, 2 * (n_ - 1) - idx); if (idx < 0) idx = Math.min(n_ - 1, -idx);
          m = pool[idx];
          // a tapped figure never repeats the note it just played: step to the neighboring chord tone
          if (c.riff && m === lastRiffM) m = pool[idx > 0 ? idx - 1 : Math.min(n_ - 1, idx + 1)];
        }
        if (c.riff) lastRiffM = m;
        const v = clamp((c.riff ? (c.acc ? 0.6 : c.k === 2 ? 0.44 : 0.38) : c.acc ? 0.62 : c.pick ? 0.4 : 0.46) * (0.55 + 0.6 * e) * crescendo, 0.1, 0.95);
        out.push({ l: 'twinkle', k: 'pluck', bar: q, s: c.s, n: Math.min(m, band[1]), v, variant: (k + b) % 2, pan: ((k * 37 + b * 11) % 7 - 3) / 7, cap: true });
      });
      // emo strum on the first beat of a new chord (never while keys or pads are sustaining)
      const newChord = q === 0 || sec.bc[b].root !== sec.bc[b - 1].root || sec.bc[b].base !== sec.bc[b - 1].base;
      if (newChord && (sec.keysMode === 'off' || sec.keysMode === 'stab') && eff.emo > 0.3 && u(sec.rngSeed, 'strum', b) < eff.emo * 0.9 && (kind !== 'drop' || eff.emo > 0.6) && e > 0.12 && q % 2 === 0) {
        const sg = segs[0];
        const v = J.voice(sg.chord, null, { lo: 62, hi: 79, n: 4, includeRoot: true });
        out.push({ l: 'twinkle', k: 'strum', bar: q, s: 0, notes: v, v: 0.5 * (0.6 + 0.5 * e), cap: true, strum: 0.012 * sec.sm });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // validation of one phrase window with the same checks as lint.js
  // ------------------------------------------------------------------------------------------
  function windowNotes(song, sec, p, eff, plan, leadEv, twEv, st) {
    const notes = [], b0 = 4 * p, o0 = sec.barOff[b0], sps = 60 / song.bpm / 4 / sec.clock;
    const o1 = o0 + plan.phraseSteps;
    // pads and keys notes from the section plan that sound in this window
    for (let b = Math.max(0, b0 - 2); b < b0 + 4; b++) {
      sec.padEv[b].forEach(ev => ev.notes.forEach(m => {
        const s = sec.barOff[b] + ev.s, e = s + ev.d + ev.release / sps;
        if (e > o0 && s < o1) notes.push({ layer: 'pads', m, s, e, held: ev.d, strong: false });
      }));
    }
    sec.keysEv && sec.keysEv.forEach((list, b) => { if (!list) return; list.forEach(ev => ev.notes.forEach(m => {
      const s = sec.barOff[b] + ev.s, e = s + ev.d + 0.18 / sps;
      if (e > o0 && s < o1) notes.push({ layer: 'keys', m, s, e, held: ev.d, strong: false });
    })); });
    // twinkle from earlier phrases may still ring
    (st.twRing || []).forEach(n => { if (n.sec === sec.id && n.e > o0) notes.push(Object.assign({}, n)); });
    leadEv.forEach(ev => { const s = sec.barOff[ev.bar] + ev.s; notes.push({ layer: 'lead', m: ev.n, s, e: s + ev.d + 0.1 / sps, held: 0, strong: sec.meters[ev.bar].starts.includes(ev.s), hv: !!ev.hv, ev }); });
    twEv.forEach(ev => {
      const s = sec.barOff[b0 + ev.bar] + ev.s;
      const ring = m => Math.min(J.RING.newMax, (() => { const f = J.mtof(m), t60 = Math.max(0.9, Math.min(3.4, 3.0 * Math.pow(220 / f, 0.35))); return Math.min(2.4, t60 + 0.3); })()) / sps;
      if (ev.k === 'pluck') notes.push({ layer: 'twinkle', m: ev.n, s, e: s + ring(ev.n), held: 0, pluck: true, strong: sec.meters[b0 + ev.bar].starts.includes(ev.s), ev });
      else ev.notes.forEach(m => notes.push({ layer: 'twinkle', m, s, e: s + ring(m), held: ring(m), pluck: true, strum: true, strong: true, ev }));
    });
    return { notes, o0, o1, sps };
  }
  function timelineFor(sec, from, to) {
    const tl = [];
    sec.flat.forEach(f => { if (f.a1 > from - 40 && f.a0 < to + 4) tl.push({ s0: f.a0, s1: f.a1, seg: f.seg }); });
    return tl;
  }
  // damp: apply fx damp events to the pluck notes the way the synth does
  function applyDamp(notes, sec, from, to, sps) {
    const dampAt = [];
    sec.flat.forEach((f, i) => { if (i > 0 && f.a0 >= from - 40 && f.a0 < to) dampAt.push(f); });
    dampAt.forEach(f => {
      notes.forEach(n => { if (n.pluck && n.s < f.a0 && n.e > f.a0 && !f.seg.pcs.includes(n.m % 12)) n.e = Math.min(n.e, f.a0 + J.RING.dampRel / sps); });
    });
  }
  function validatePhrase(song, sec, p, plan, leadEv, twEv, st, eff) {
    const w = windowNotes(song, sec, p, eff, plan, leadEv, twEv, st);
    const tl = timelineFor(sec, w.o0, w.o1);
    if (!tl.length) return { badLead: [], badTw: [], notes: w.notes };
    applyDamp(w.notes, sec, w.o0, w.o1, w.sps);
    const inWin = n => n.s >= w.o0 - 0.01 && n.s < w.o1;
    const badLead = new Set(), badTw = new Set();
    const leadSeq = w.notes.filter(n => n.layer === 'lead' && !n.hv).sort((a, b) => a.s - b.s);
    const mel = J.check.melody(leadSeq, tl, song.tonic, song.scaleName);
    mel.bad.concat(mel.avoid).forEach(n => badLead.add(n.ev));
    leadSeq.forEach(n => { if (n.m < J.BANDS.lead[0] || n.m > J.BANDS.lead[1]) badLead.add(n.ev); });
    const twSeq = w.notes.filter(n => n.layer === 'twinkle' && !n.strum && n.ev).sort((a, b) => a.s - b.s);
    J.check.melody(twSeq, tl, song.tonic, song.scaleName).bad.forEach(n => badTw.add(n.ev));
    J.check.clashes(w.notes.filter(inWin2(w)), tl).forEach(([a, b]) => {
      // a twinkle note is the free one: it is dropped before the lead is asked to change
      const tw = [a, b].find(x => x.layer === 'twinkle' && x.ev), ld = [a, b].find(x => x.layer === 'lead');
      if (tw) badTw.add(tw.ev); else if (ld) badLead.add(ld.ev);
    });
    // stale plucks: nothing to do, damping handles them; stale pads and keys come from the plan itself
    return { badLead: Array.from(badLead), badTw: Array.from(badTw), notes: w.notes };
    function inWin2(w_) { return n => n.e > w_.o0 && n.s < w_.o1; }
  }

  // ------------------------------------------------------------------------------------------
  // building the lead events and the twinkle for a phrase (the full pipeline with retries)
  // ------------------------------------------------------------------------------------------
  function buildLeadEvents(song, sec, plan, notes, eff) {
    const ev = [];
    const kind = sec.kind;
    const Ld = sec.lead;
    const byBar = {};
    plan.onsets.forEach((o, i) => { (byBar[o.bar] = byBar[o.bar] || []).push({ o, m: notes[i] }); });
    Object.keys(byBar).forEach(bk => {
      const b = +bk, list = byBar[bk], steps = sec.meters[b].steps;
      list.forEach((it, i) => {
        const nextS = i + 1 < list.length ? list[i + 1].o.s : steps;
        let d = Math.min(it.o.d, nextS - it.o.s);
        if (d > 2.5 && nextS - it.o.s > d + 0.01) d = Math.min(d, nextS - it.o.s);
        d = Math.max(0.8, d - (d > 2 && i + 1 < list.length ? 0.3 : 0));
        const e = eAt(sec, b, eff);
        ev.push({ l: 'lead', k: 'note', bar: b, s: it.o.s, d, n: it.m, v: (kind === 'chorus' ? 0.55 : 0.42) * (0.6 + 0.5 * e), glide: Ld.glide, wave: Ld.wave === 'saw' ? 'sawtooth' : 'square', bright: 0.6 + 0.8 * eff.synth });
      });
    });
    // a harmony voice a diatonic third (or sixth) below, in choruses and drops
    if (kind === 'chorus' || kind === 'drop') {
      const out = [];
      ev.forEach(x => {
        if (x.d < 2.5) return;
        const b = x.bar, segs = sec.segs[b];
        let sg = segs[0]; segs.forEach(s => { if (x.s >= s.s0) sg = s; });
        for (const dd of [-2, -5]) {
          const d0 = J.midiToDeg(song.hook.tonicMidi, song.scaleName, x.n);
          const m = J.degreeMidi(song.hook.tonicMidi, song.scaleName, Math.round(d0) + dd);
          if (m < 60 || m > 80) continue;
          const pc = m % 12;
          if (sg.scale.avoid.has(pc) || !(sg.scale.chord.has(pc) || sg.scale.tension.has(pc))) continue;
          if (Math.abs(m - x.n) === 1 || Math.abs(m - x.n) === 13) continue;
          out.push({ l: 'lead', k: 'note', bar: b, s: x.s, d: x.d, n: m, v: x.v * 0.55, glide: false, wave: x.wave, bright: x.bright * 0.8, hv: true });
          break;
        }
      });
      return ev.concat(out);
    }
    return ev;
  }

  function composePhrase(song, sec, p, eff, st) {
    stat('phrases');
    const plan = planPhrase(song, sec, p, eff, st);
    const hook = song.hook, tonicMidi = hook.tonicMidi, band = J.BANDS.lead;
    // a riff phrase: the tapped figure carries bars 1 to 3 and the lead answers in the cadence bar
    const rp = riffPlan(song, sec, p, eff);
    if (rp) {
      plan.onsets = plan.onsets.filter(o => o.q === 3);
      plan.riff = rp;
      stat('riffPhrases');
    }
    const anyLead = plan.onsets.length > 0;
    const leadByBar = q => plan.onsets.filter(o => o.q === q).map(o => o.s);
    const mkTwinkle = () => twinkleFor(song, sec, p, eff, [0, 1, 2, 3].map(leadByBar), 0, rp);
    let notes = [], leadEv = [], twEv = [], result = null;
    const tryOnce = (variant, width, simple) => {
      let nts;
      if (!anyLead) nts = [];
      else if (simple === 'safe') nts = safeNotes(plan.onsets, tonicMidi, song.scaleName);
      else nts = J.searchPhrase({ onsets: plan.onsets.map(o => Object.assign(o, { pref: (variant <= 1 && o.op === 'state') ? (st.hookMemo || {})[o.memoKey] : undefined })), tonicMidi, scaleName: song.scaleName, band, width, seedKey: [sec.rngSeed, 'search', p, variant].join('|'), prev: st.leadLast === undefined ? null : st.leadLast, climaxT: 0.6 }).notes;
      const le = buildLeadEvents(song, sec, plan, nts, eff);
      const tw = mkTwinkle();
      return { nts, le, tw, v: validatePhrase(song, sec, p, plan, le, tw, st, eff) };
    };
    // free notes first: twinkle notes that clash are simply dropped (until the window is clean of them)
    const settle = r_ => {
      for (let k = 0; k < 8 && r_.v.badTw.length; k++) {
        stat('twinkleDrops', r_.v.badTw.length);
        r_.tw = r_.tw.filter(x => !r_.v.badTw.includes(x));
        r_.v = validatePhrase(song, sec, p, plan, r_.le, r_.tw, st, eff);
      }
      return r_;
    };
    let r = tryOnce(0, 8);
    if (!r.v.badLead.length && !r.v.badTw.length) stat('firstTryClean');
    r = settle(r);
    let attempt = 1;
    while (r.v.badLead.length && attempt <= 3) { stat('retries'); r = settle(tryOnce(attempt, 8 + 4 * attempt)); attempt++; }
    if (r.v.badLead.length) {                      // back up: wider searches with new seeds before giving up on the motif
      stat('backups');
      for (let k = 0; k < 2 && r.v.badLead.length; k++) r = settle(tryOnce(10 + k, 16));
    }
    if (r.v.badLead.length) {                      // the safe choice: chord tones on the beat
      stat('fallbacks');
      r = settle(tryOnce(99, 8, 'safe'));
      for (let k = 0; k < 6 && r.v.badLead.length; k++) { stat('leadDrops', r.v.badLead.length); r.le = r.le.filter(x => !r.v.badLead.includes(x)); r.v = validatePhrase(song, sec, p, plan, r.le, r.tw, st, eff); r = settle(r); }
    }
    // the hook is remembered: the next time the motif is stated over the same chords it is sung on the same pitches
    if (r.nts && r.nts.length && r.le.filter(x => !x.hv).length === r.nts.length) { st.hookMemo = st.hookMemo || {}; plan.onsets.forEach((o, i) => { if (o.op === 'state' && st.hookMemo[o.memoKey] === undefined && !o.last) st.hookMemo[o.memoKey] = r.nts[i]; }); }
    // remember the last lead note and the ringing plucks for the next phrase
    const lastLead = r.le.filter(x => !x.hv).sort((a, b) => (a.bar - b.bar) || (a.s - b.s)).pop();
    if (lastLead) st.leadLast = lastLead.n;
    st.twRing = (st.twRing || []).filter(n => n.sec === sec.id && n.e > sec.barOff[4 * p]).concat([]);
    const sps = 60 / song.bpm / 4 / sec.clock;
    r.tw.forEach(ev => {
      const s = sec.barOff[4 * p + ev.bar] + ev.s;
      const ring = m => Math.min(J.RING.newMax, (() => { const f = J.mtof(m), t60 = Math.max(0.9, Math.min(3.4, 3.0 * Math.pow(220 / f, 0.35))); return Math.min(2.4, t60 + 0.3); })()) / sps;
      if (ev.k === 'pluck') st.twRing.push({ sec: sec.id, layer: 'twinkle', m: ev.n, s, e: s + ring(ev.n), held: 0, pluck: true, strong: false });
      else ev.notes.forEach(m => st.twRing.push({ sec: sec.id, layer: 'twinkle', m, s, e: s + ring(m), held: ring(m), pluck: true, strum: true, strong: false }));
    });
    if (rp) for (let q = 0; q < 3; q++) plan.info[q] = 'tapped riff, the lead waits for the cadence';
    plan.leadEv = r.le; plan.twEv = r.tw;
    return plan;
  }

  // ------------------------------------------------------------------------------------------
  // keys events for the whole section (read the guide line and the voicings from the plan)
  // ------------------------------------------------------------------------------------------
  function planKeys(song, sec, eff) {
    sec.keysEv = sec.segs.map(() => []);
    if (sec.keysMode === 'off') return;
    const kind = sec.kind, bk = sec.bridgeKind;
    const dn = clamp(eff.density * sec.paceM, 0, 1), sm = sec.sm;
    const sps = 60 / song.bpm / 4 / sec.clock;
    for (let b = 0; b < sec.bars; b++) {
      const meter = sec.meters[b], steps = meter.steps, segs = sec.segs[b];
      const e = eAt(sec, b, eff);
      if (e < 0.2) continue;
      if (kind === 'outro' && b >= 6) continue;
      const rr = J.rng(sec.rngSeed, 'keys', b);
      const flatAt = s => { for (let i = 0; i < sec.flat.length; i++) { const f = sec.flat[i]; if (f.bar === b && s >= f.s0 && s < f.s1) return i; } return sec.flat.findIndex(f => f.bar === b); };
      const put = (s, dur, vel, strum) => {
        const i = flatAt(s), f = sec.flat[i];
        const dd = Math.min(dur, f.s1 - s - 0.2 - Math.max(0, 0.18 / sps - 2.1));   // the key's 0.18 s tail is more steps at a fast tempo, so stop it earlier
        if (dd < 0.8) return;
        const notes = sec.keysLow[i].concat([sec.guide[i]]).sort((a, c) => a - c);
        sec.keysEv[b].push({ l: 'keys', k: 'chord', s, d: dd, notes, v: vel * (0.6 + 0.6 * e) * (s % 4 === 0 ? 1 : 0.85), strum, bright: 0.8 + 0.5 * eff.synth });
      };
      if (sec.keysMode === 'sustain') {
        segs.forEach(sg => { if (sg.s1 - sg.s0 >= 4) put(sg.s0, sg.s1 - sg.s0, 0.36, 0.011 * sm); });
      } else if (sec.keysMode === 'comp') {
        const tpl = b % 2 ? sec.keysTpl.jazz2 : sec.keysTpl.jazz;
        tpl.forEach((s, i) => { if (s < steps && (i === 0 || rr.next() < 0.45 + 0.55 * dn)) put(s, 3.2, 0.42, 0.016 * sm); });
      } else { // stab
        const tpl = kind === 'bridge' && bk === 'math' ? meter.starts.filter((s, i) => i % 2 === 0) : sec.keysTpl.stab;
        tpl.forEach((s, i) => { if (s < steps && (i === 0 || rr.next() < 0.45 + 0.55 * dn)) put(s, 1.6, 0.5, 0.009 * sm); });
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // the composer object
  // ------------------------------------------------------------------------------------------
  J.Composer2 = function (seed, P) {
    seed = String(seed);
    this.seed = seed;
    const song = J.makeSong(seed, P);
    song.hook = J.makeHook(seed, song);
    this.song = song;
    this.cycle = 0; this.idx = 0; this.sec = null; this.barNo = 0; this.barCount = 0;
    this.st = { padPrev: null, keysPrev: null, guidePrev: null, bassMidi: null, leadLast: null, twRing: [] };
    this.phr = null;
    this.form = null;
    const self = this;
    const setupCycle = (eff) => {
      self.form = C.cycleForm(song, eff, self.cycle);
      if (self.cycle > 0 && self.form[0] === 'intro') self.form.shift();
      const starts = []; let tot = 0;
      self.form.forEach((k, i) => { starts.push(tot); tot += secBars(song, self.cycle, i, k); });
      self.formInfo = { starts, total: tot };
    };
    this.next = function (eff, mods) {
      mods = mods || { hatScale: 1, forceFull: false, radio: 0 };
      // manual tempo (0 = Auto); it takes hold at the next phrase so a slider drag never cuts a phrase in two
      if (!this.sec || this.barNo >= this.sec.bars || this.barNo % 4 === 0) song.bpm = J.tempoOf(eff, song.autoBpm);
      if (!this.form) setupCycle(eff);
      if (!this.sec || this.barNo >= this.sec.bars) {
        if (this.sec) { this.idx++; if (this.idx >= this.form.length) { this.cycle++; this.idx = 0; setupCycle(eff); } }
        this.sec = planSection2(song, eff, this.cycle, this.idx, this.form[this.idx], this.st, this.formInfo);
        planKeys(song, this.sec, eff);
        this.barNo = 0; this.phr = null;
      }
      const sec = this.sec, b = this.barNo;
      if (b % 4 === 0) { this.phr = composePhrase(song, sec, b / 4, eff, this.st); }
      const bar = composeBar2(song, sec, b, eff, mods, this.st, this.barCount, this.phr);
      this.barNo++; this.barCount++;
      return bar;
    };
  };

  // ------------------------------------------------------------------------------------------
  // one bar: drums and bass as before, everything pitched from the plan
  // ------------------------------------------------------------------------------------------
  function composeBar2(song, sec, barNo, eff, mods, st, barCount, phr) {
    const meter = sec.meters[barNo], steps = meter.steps;
    const kind = sec.kind, bk = sec.bridgeKind;
    const e = eAt(sec, barNo, eff);
    const t01 = sec.bars > 1 ? barNo / (sec.bars - 1) : 0;
    const rr = J.rng(sec.rngSeed, 'bar', barNo);
    const ev = [];
    const segs = sec.segs[barNo];
    const segAt = s => { for (const sg of segs) if (s >= sg.s0 && s < sg.s1) return sg; return segs[segs.length - 1]; };
    const first = barNo === 0, lastB = barNo === sec.bars - 1;
    const q = barNo % 4;

    // ---- drum mode (unchanged from the first composer)
    let mode;
    switch (kind) {
      case 'intro': mode = barNo < 4 ? 'none' : 'sparse'; break;
      case 'build': mode = barNo < 2 ? 'sparse' : barNo < 4 ? 'half' : 'full'; break;
      case 'swell': mode = barNo < 2 ? 'none' : barNo < 4 ? 'sparse' : barNo < 6 ? 'half' : (eff.punk > 0.5 ? 'punk' : 'full'); break;
      case 'drop': mode = (eff.tempoFeel > 0.7 && u(sec.rngSeed, 'dhalf') < eff.tempoFeel) ? 'half' : 'full'; break;
      case 'chorus': mode = 'punk'; break;
      case 'breakdown': mode = sec.clock === 0.5 ? (eff.jazz > 0.35 ? 'jazz' : 'half') : (eff.jazz > 0.5 && u(sec.rngSeed, 'bdj') < 0.5 ? 'half' : 'sparse'); break;
      case 'bridge': mode = bk === 'math' ? 'math' : bk === 'jazz' ? 'jazz' : (barNo < sec.bars - 2 ? 'half' : 'sparse'); break;
      case 'outro': mode = barNo < 3 ? 'half' : barNo < 6 ? 'sparse' : 'none'; break;
    }
    if (mods.forceFull && (mode === 'half' || mode === 'sparse') && e > 0.5 && kind !== 'bridge' && kind !== 'breakdown') mode = 'full';
    if (e < 0.26) mode = 'none';
    else if (e < 0.42 && (mode === 'full' || mode === 'punk')) mode = 'half';
    if (kind === 'breakdown' && lastB) mode = 'none';

    const L = { drums: true, bass: true, keys: true, twinkle: true, pads: true, lead: false, texture: true };
    switch (kind) {
      case 'intro': L.bass = barNo >= 4; break;
      case 'drop': L.twinkle = eff.math > 0.3 || eff.emo > 0.4; break;
      case 'breakdown': L.lead = false; break;
      case 'outro': L.bass = barNo < 5; break;
    }
    const GATE = { pads: 0.0, texture: 0.0, twinkle: 0.12, keys: 0.2, bass: 0.3, drums: 0.0, lead: 0.58 };
    Object.keys(L).forEach(k => { if (e < GATE[k]) L[k] = false; });
    L.lead = phr.active[q] && e >= GATE.lead;

    // ---- pads: planned for the whole section (voice leading, common tones held)
    if (L.pads) {
      sec.padEv[barNo].forEach(x => ev.push(Object.assign({}, x)));
      const hz = kind === 'build' || kind === 'swell' ? lerp(1500, 9000, t01) : kind === 'outro' ? lerp(3000, 700, t01) : kind === 'intro' ? lerp(1100, 2600, t01) : kind === 'breakdown' ? 1500 : kind === 'bridge' ? 2600 : 3800;
      ev.push({ l: 'fx', k: 'padcut', s: 0, hz: hz * (0.7 + 0.5 * eff.synth) });
    }

    // ---- damp plucks that do not belong to a new chord
    segs.forEach((sg, i) => {
      const newChord = i > 0 || barNo === 0 || sec.segs[barNo - 1][sec.segs[barNo - 1].length - 1].pcs.join() !== sg.pcs.join();
      if (newChord) ev.push({ l: 'fx', k: 'damp', s: sg.s0, pcs: sg.pcs });
    });

    // ---- bass
    if (L.bass) {
      const tpl = sec.bassTpl;
      const nextRoot = barNo + 1 < sec.bars ? sec.segs[barNo + 1][0] : null;
      let bmode = 'sub';
      if (kind === 'drop' || (kind === 'build' && barNo >= 4)) bmode = sec.reese ? 'reese' : 'sub';
      if (kind === 'chorus') bmode = 'pluck';
      if (kind === 'bridge' && bk === 'jazz') bmode = 'pluck';
      if (kind === 'breakdown' && sec.clock === 0.5 && eff.jazz > 0.45) bmode = 'pluck';
      let pat;
      if (kind === 'chorus') { pat = []; for (let s = 0; s < steps; s += 2) pat.push({ s, d: 1.7, t: 'root' }); }
      else if (bmode === 'pluck' && (kind === 'bridge' || kind === 'breakdown')) {
        pat = []; const qs = []; for (let s = 0; s < steps; s += 4) qs.push(s);
        qs.forEach((s, i) => pat.push({ s, d: 3.6, t: i === 0 ? 'root' : i === qs.length - 1 ? 'approach' : (i % 2 ? 'third' : 'fifth') }));
      } else if (mode === 'math' || (kind === 'bridge' && bk === 'math')) pat = meter.starts.map((s, i) => ({ s, d: meter.groups[i] - 1, t: i % 2 ? 'oct' : 'root' }));
      else if (kind === 'outro' || kind === 'intro' || (kind === 'swell' && barNo < 6) || (kind === 'bridge' && bk === 'emo')) pat = [{ s: 0, d: steps - 1.5, t: 'root' }];
      else if (mode === 'half' || mode === 'sparse' || mode === 'none' || kind === 'breakdown') pat = tpl.half;
      else if (bmode === 'reese' && e > 0.7 && u(sec.rngSeed, 'roll', barNo >> 2) < eff.synth) pat = tpl.roll;
      else pat = tpl.dnb;
      pat = pat.map(n => Object.assign({}, n));
      // the second bass hit lines up with the second kick of the break
      if (pat === tpl.dnb || pat.length === tpl.dnb.length && pat[0] && tpl.dnb[0] && pat[1] && tpl.dnb[1] && pat[1].s === tpl.dnb[1].s) {
        const k2 = sec.brk.kicks[1]; if (k2 >= 6 && k2 <= 11 && pat[1] && pat[1].t !== 'approach') pat[1].s = k2;
      }
      const vel = clamp(0.55 + 0.5 * e, 0.4, 1.05);
      let lastMidi = st.bassMidi || null;
      const bassEvs = [];
      const rootsOf = sg => sg.bassPc;
      pat.forEach(n => {
        if (n.t === 'approach') { n.s = Math.max(0, steps - 2); n.d = 1.7; }       // the approach note lives on the last eighth only
        if (n.s >= steps) return;
        const sg = segAt(n.s), chord = sg.chord, tones = chord.tones;
        { // a bass note never holds into the next chord (inside the bar or across the barline)
          const nx0 = barNo + 1 < sec.bars ? sec.segs[barNo + 1][0] : null;
          const edge = sg.s1 < steps ? sg.s1 : (nx0 && nx0.pcs.join() !== sg.pcs.join() ? steps : 1e9);
          if (n.t !== 'approach' && n.s + n.d > edge - 0.1) n.d = Math.max(0.8, edge - n.s - 0.3);
        }
        let pc = rootsOf(sg);
        if (n.t === 'fifth') pc = (chord.root + (tones.includes(6) && !tones.includes(7) ? 6 : 7)) % 12;
        else if (n.t === 'b7') pc = (chord.root + (tones.includes(11) ? 11 : 10)) % 12;
        else if (n.t === 'third') pc = (chord.root + (tones.find(t => t === 3 || t === 4 || t === 5 || t === 2) || 7)) % 12;
        else if (n.t === 'approach') {
          const tgt = nextRoot && sg === segs[segs.length - 1] ? nextRoot : null;
          if (tgt && tgt.root !== sg.root) {
            const fi = sec.flat.findIndex(f => f.bar === barNo && f.seg === sg);
            const under = fi >= 0 ? (sec.voicings[fi] || []).concat(sec.keysMode !== 'off' ? (sec.keysLow[fi] || []).concat([sec.guide[fi]]) : []) : [];
            const okUnder = x => { let mm = J.bassMidi(x, 34); if (mm > 45) mm -= 12; if (mm < 34) mm += 12; return !under.some(m => { const d = m - mm; return d === 1 || d === 13 || d === -1; }); };
            const cands = [(tgt.root + 11) % 12, (tgt.root + 1) % 12, (tgt.root + 10) % 12, (tgt.root + 2) % 12].filter(x => tgt.scale.set.has(x) && !tgt.scale.avoid.has(x) && okUnder(x));
            pc = cands.length ? cands[Math.floor(u(sec.rngSeed, 'appr', barNo) * cands.length)] : sg.root;
          } else pc = sg.root;
        }
        let midi = J.bassMidi(pc, 34);
        if (n.t === 'oct') midi = J.bassMidi(chord.root, 34) + 12;
        if (midi > 45) midi -= 12;
        if (midi < 34) midi += 12;
        const x = {};
        if (bmode === 'reese') { x.wob = sec.wob * (steps / 16) * 0.345 * (174 / song.bpm); x.lo = 140 + 160 * (1 - eff.dark); x.hi = 700 + 1300 * e; x.res = 3 * eff.synth; }
        bassEvs.push(ev.length);
        ev.push(Object.assign({ _sg: sg, _t: n.t, l: 'bass', k: 'note', s: n.s, d: n.d, n: midi, v: vel, mode: bmode, glideFrom: (bmode === 'sub' && lastMidi && lastMidi !== midi && n.s === 0 && Math.abs(lastMidi - midi) < 8 && kind !== 'drop') ? lastMidi : undefined }, x));
        lastMidi = midi;
      });
      { const bl = bassEvs.map(i => ev[i]).sort((a, b) => a.s - b.s); for (let i = 0; i + 1 < bl.length; i++) if (bl[i].s + bl[i].d > bl[i + 1].s - 0.1) bl[i].d = Math.max(0.6, bl[i + 1].s - bl[i].s - 0.3); }
      // no parallel fifths or octaves between the lead and the bass: change the later bass note to another chord tone
      {
        const leadNow = L.lead ? phr.leadEv.filter(x => x.bar === barNo && !x.hv).sort((a, b) => a.s - b.s) : [];
        const seq = (st.prevLead ? [st.prevLead] : []).concat(leadNow.map(x => ({ m: x.n, s: x.s })));
        const bassList = (st.prevBass || []).concat(bassEvs.map(i => ev[i])).sort((a, b) => a.s - b.s);
        const bassAt = t => { let r = null; for (const b of bassList) { if (b.s <= t + 0.01) r = b; else break; } return r; };
        const under = fi_ => []; 
        for (let i = 1; i < seq.length; i++) {
          const a = seq[i - 1], b = seq[i];
          if (b.s - a.s > 8 || b.m === a.m) continue;
          const ba = bassAt(a.s), bb = bassAt(b.s);
          if (!ba || !bb || ba === bb || !bb._sg || bb.n === ba.n) continue;
          const dl = b.m - a.m, db = bb.n - ba.n;
          if (Math.sign(dl) !== Math.sign(db)) continue;
          const i1 = ((a.m - ba.n) % 12 + 12) % 12, i2 = ((b.m - bb.n) % 12 + 12) % 12;
          if (!(i1 === i2 && (i1 === 7 || i1 === 0))) continue;
          const ch = bb._sg.chord, cands = [ch.root, (ch.root + 7) % 12, (ch.root + (ch.tones.find(t => t === 3 || t === 4) || 7)) % 12];
          for (const pc of cands) {
            let mm = J.bassMidi(pc, 34); if (mm > 45) mm -= 12; if (mm < 34) mm += 12;
            const j1 = ((b.m - mm) % 12 + 12) % 12;
            if (Math.sign(b.m - a.m) === Math.sign(mm - ba.n) && j1 === i1) continue;
            if (mm - ba.n === 0) continue;
            bb.n = mm; break;
          }
        }
        bassEvs.forEach(i => { delete ev[i]._sg; delete ev[i]._t; });
        const lastLeadN = leadNow.length ? leadNow[leadNow.length - 1] : null;
        st.prevLead = lastLeadN ? { m: lastLeadN.n, s: lastLeadN.s - steps } : null;
        const lb = bassEvs.length ? bassEvs.map(i => ev[i]).sort((a, b) => a.s - b.s).pop() : null;
        st.prevBass = bassEvs.length ? bassEvs.map(i => ({ s: ev[i].s - steps, n: ev[i].n })) : (st.prevBass || []).map(x => ({ s: x.s - steps, n: x.n })).slice(-1);
      }
      st.bassMidi = bassEvs.length ? bassEvs.map(i => ev[i]).sort((a, b) => a.s - b.s).pop().n : lastMidi;
    }

    // ---- keys (planned for the section)
    if (L.keys) (sec.keysEv[barNo] || []).forEach(x => ev.push(Object.assign({}, x)));

    // ---- twinkle and lead (from the phrase plan)
    if (L.twinkle) phr.twEv.forEach(x => { if (x.bar === q) ev.push(Object.assign({}, x, { s: x.s })); });
    if (L.lead) phr.leadEv.forEach(x => { if (x.bar === barNo) ev.push(Object.assign({}, x)); });

    // ---- drums, texture
    if (L.drums) C.drumsForBar(ev, sec, barNo, meter, mode, e, eff, mods, J.rng(sec.rngSeed, 'drm', barNo), null);
    if (L.texture) {
      if ((kind === 'build' || kind === 'swell') && barNo === sec.bars - 2) ev.push({ l: 'texture', k: 'riser', s: 0, d: steps + sec.meters[sec.bars - 1].steps - 1, v: 0.5 + 0.4 * eff.synth });
      if ((kind === 'drop' || kind === 'chorus') && first) ev.push({ l: 'texture', k: 'impact', s: 0, v: 0.8 });
      if (mods.radio > 0 && u(sec.rngSeed, 'radio', barNo) < 0.16 * mods.radio) ev.push({ l: 'texture', k: 'radio', s: Math.floor(u(sec.rngSeed, 'radios', barNo) * (steps - 6)), d: 5 + Math.floor(u(sec.rngSeed, 'radiod', barNo) * 10), v: 0.35 });
    }

    const byStep = [];
    for (let i = 0; i < steps; i++) byStep.push([]);
    ev.forEach(x => { const i = Math.min(steps - 1, Math.max(0, Math.floor(x.s))); byStep[i].push(x); });

    // what the lead is doing (for the display)
    const leadInfo = L.lead ? phr.info[q] : (phr.active[q] ? 'resting (quiet section)' : 'no lead here');
    const mdot = phr.lead[q] ? { on: phr.lead[q].on.map(x => x.s), signs: [] } : null;
    let signs = [];
    const lv = phr.leadEv.filter(x => x.bar === barNo && !x.hv).sort((a, b) => a.s - b.s);
    for (let i = 1; i < lv.length && signs.length < 3; i++) signs.push(Math.sign(lv[i].n - lv[i - 1].n));
    const hookRef = { onsets: song.hook.cell.on, signs: song.hook.shape.slice(0, 4).map(Math.sign) };
    return {
      sec, secId: sec.id, kind, barNo, bars: sec.bars, meter, steps, clock: sec.clock, swing: sec.swing * clamp(1.25 - song.bpm * sec.clock / 280, 0.3, 1), e, mode, byStep, ev,
      segs: segs.map(sg => ({ name: sg.name, s0: sg.s0, s1: sg.s1, root: sg.root, base: sg.base, pcs: sg.pcs, alt: sg.alt, scale: sg.scale.name, sub: sg.sub || null })),
      bpm: song.bpm, style: sec.style, bridgeKind: bk, layers: L, barCount, last: lastB, first,
      composer: 'new', tonic: song.tonic, mode_: song.mode, scaleName: song.scaleName, motifRef: hookRef,
      phrase: { idx: Math.floor(barNo / 4), pos: q, cadence: q === 3 ? sec.cad[Math.floor(barNo / 4)] : null, type: phr.type, profile: sec.profile },
      leadInfo,
    };
  }

  // ------------------------------------------------------------------------------------------
  // NPC motif from the same engine: any number becomes a real motif (rhythm cell plus shape) in the current key
  // ------------------------------------------------------------------------------------------
  J.npcMotif2 = function (npcSeed, song, P) {
    const s = { tonic: song ? song.tonic : 9, scaleName: song ? song.scaleName : 'aeolian', major: song ? song.major : false, home: song ? song.home : J.progById('emo-lift') };
    const hook = J.makeHook('npc|' + npcSeed, s);
    const r = J.rng('npc2', npcSeed);
    const b1 = J.motifBar(hook, 'state', { steps: 16, reg: 1 });
    const b2 = J.motifBar(hook, r.pick(['seq', 'frag', 'invert']), { steps: 16, reg: 1, k: r.pick([1, -1, 2]), endDeg: hook.a0 + 1 + r.pick([0, 2, 4]) });
    const notes = [];
    b1.on.forEach((x, i) => notes.push({ t: x.s / 2, d: x.d / 2, deg: b1.degs[i] }));
    b2.on.forEach((x, i) => notes.push({ t: (x.s + 16) / 2, d: x.d / 2, deg: b2.degs[i] }));
    const out = notes.map(n => { let m = J.degreeMidi(hook.tonicMidi, s.scaleName, n.deg); while (m > 88) m -= 12; while (m < 67) m += 12; return { t: n.t, d: n.d, midi: m, deg: n.deg }; });
    return { notes: out, scale: s.scaleName, tonic: s.tonic, length: out[out.length - 1].t + out[out.length - 1].d, hook };
  };
})(typeof window !== 'undefined' ? window : globalThis);
