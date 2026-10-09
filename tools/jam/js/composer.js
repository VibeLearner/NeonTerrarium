// Neon Terrarium jam room: the composer.
// Pure rules, no audio. Given a seed and the sliders it plans a song (key, tempo, progressions),
// plans sections (intro, build, drop, breakdown, bridge, outro ...) and composes one bar at a time.
//
// Every "should this happen" decision is a gate: a fixed random number from the seed compared with a
// slider-derived level. Moving a slider therefore adds or removes features instead of reshuffling the piece.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};
  const clamp = J.clamp, lerp = J.lerp, u = J.u;

  // ------------------------------------------------------------------------------------------
  // parameters
  // ------------------------------------------------------------------------------------------
  J.PARAM_KEYS = ['energy', 'jazz', 'math', 'emo', 'punk', 'dnb', 'synth', 'dark', 'tempoFeel', 'density'];
  J.defaultParams = function () {
    const st = G.JAM_STYLE || null;
    const p = { energy: 0.65, jazz: 0.40, math: 0.35, emo: 0.45, punk: 0.35, dnb: 0.65, synth: 0.60, dark: 0.55, tempoFeel: 0.30, density: 0.60, bpm: 0, riff: 0.5 };
    if (st) {
      const cc = st.chord_color || {};
      // ninth + eleventh shares are the most trustworthy "jazz color" figures in the profile
      p.jazz = clamp(0.2 + 0.5 * ((cc.ninth || 0) + (cc.eleventh || 0)) / 0.35, 0.25, 0.7);
      p.math = clamp(0.2 + 2.0 * (st.odd_meter_share || 0), 0.2, 0.6);
    }
    return p;
  };

  // game-state modulation: day/dusk/night, rain, view. Returns effective sliders plus mix/FX targets.
  J.applyGame = function (P, g) {
    const e = Object.assign({}, P);
    const add = (k, v) => { e[k] = clamp(e[k] + v, 0, 1); };
    const out = { layerScale: { drums: 1, bass: 1, keys: 1, twinkle: 1, pads: 1, lead: 1, texture: 1 }, space: 1, weatherHz: 19000,
      vinyl: 0.5, rain: 0, hum: 0.15, radio: 0, forceFull: false, hatScale: 1 };
    if (g.tod === 'day') { add('energy', 0.08); add('jazz', -0.12); add('dark', -0.14); add('tempoFeel', -0.10); out.hum = 0.22; }
    else if (g.tod === 'dusk') { add('emo', 0.20); add('dark', 0.05); add('jazz', 0.06); out.radio = 0.4; out.hum = 0.18; }
    else if (g.tod === 'night') { add('jazz', 0.28); add('dark', 0.12); add('tempoFeel', 0.55); add('energy', -0.10); add('density', -0.05); out.space = 1.25; out.hum = 0.12; out.radio = 0.2; }
    if (g.rain) { add('density', -0.12); add('energy', -0.08); add('tempoFeel', 0.12); out.space *= 1.6; out.weatherHz = 2300; out.rain = 0.55; out.hatScale = 0.55; }
    if (g.view === 'zoomed') {
      add('energy', -0.25); add('density', -0.35);
      Object.assign(out.layerScale, { drums: 0.12, bass: 0.35, keys: 0.5, twinkle: 0.35, pads: 1.3, lead: 0.0 });
      out.space *= 1.8;
    } else if (g.view === 'busy') {
      add('energy', 0.18); add('density', 0.30); add('dnb', 0.30);
      out.forceFull = true; out.hum = Math.max(out.hum, 0.38); out.radio = Math.max(out.radio, 0.6);
      out.layerScale.drums = 1.1;
    }
    out.eff = e;
    return out;
  };

  // ------------------------------------------------------------------------------------------
  // meters (all in sixteenth-note steps; the eighth note never changes length, so odd bars land cleanly)
  // ------------------------------------------------------------------------------------------
  const MET = {
    '44': { id: '4/4', steps: 16, groups: [4, 4, 4, 4] },
    '332': { id: '4/4 (3+3+2)', steps: 16, groups: [6, 6, 4] },
    '323': { id: '4/4 (3+2+3)', steps: 16, groups: [6, 4, 6] },
    '7a': { id: '7/8 (2+2+3)', steps: 14, groups: [4, 4, 6] },
    '7b': { id: '7/8 (3+2+2)', steps: 14, groups: [6, 4, 4] },
    '7c': { id: '7/8 (2+3+2)', steps: 14, groups: [4, 6, 4] },
    '54a': { id: '5/4 (3+3+2+2)', steps: 20, groups: [6, 6, 4, 4] },
    '54b': { id: '5/4 (2+3+3+2)', steps: 20, groups: [4, 6, 6, 4] },
    '98': { id: '9/8 (2+2+2+3)', steps: 18, groups: [4, 4, 4, 6] },
  };
  Object.values(MET).forEach(m => { let s = 0; m.starts = m.groups.map(g => { const r = s; s += g; return r; }); });
  J.METERS = MET;
  function midBoundary(m) { // group boundary nearest the middle of the bar
    let best = m.starts[1] || m.steps / 2, bd = 1e9;
    m.starts.slice(1).forEach(s => { const d = Math.abs(s - m.steps / 2); if (d < bd) { bd = d; best = s; } });
    return best;
  }

  // ------------------------------------------------------------------------------------------
  // the song: key, tempo, home progressions
  // ------------------------------------------------------------------------------------------
  // manual tempo: P.bpm of 0 means Auto (the dnb slider picks it, as in round 1)
  J.tempoOf = function (P, autoBpm) { return P && P.bpm > 0 ? clamp(Math.round(P.bpm * 2) / 2, 60, 200) : autoBpm; };
  // how much more or less room each step has, compared with the 174 BPM the density gates were tuned at
  J.paceM = function (bpm) { return clamp(Math.sqrt(174 / bpm), 0.75, 1.5); };
  J.makeSong = function (seed, P) {
    const rng = J.rng(seed, 'home');
    const tonic = rng.int(0, 11);
    const pMajor = clamp(0.48 - 0.55 * P.dark + 0.22 * P.punk * (1 - P.dark) + 0.1 * (1 - P.emo), 0.05, 0.75);
    const major = rng.next() < pMajor;
    const st = G.JAM_STYLE;
    let lo = 170, hi = 176;
    if (st && st.tempo_fast_range) { lo = clamp(st.tempo_fast_range[0], 150, 176); hi = clamp(st.tempo_fast_range[1], lo + 4, 180); }
    const autoBpm = Math.round(lerp(lo, hi, clamp(1 - (1 - P.dnb) * rng.next() * 0.9, 0, 1)) * 2) / 2;
    const bpm = J.tempoOf(P, autoBpm);
    const wtag = (prog, W) => prog.tags.reduce((a, t) => a + (W[t] || 0), 0.25);
    const W = { emo: P.emo * 1.2, punk: P.punk * 1.2, jazz: P.jazz * 0.9, dnb: P.dnb, synth: P.synth * 0.8, dark: P.dark, bright: 1 - P.dark };
    const mode = major ? 'major' : 'minor';
    const pool = J.PROGRESSIONS.filter(p => p.mode === mode);
    const home = rng.weighted(pool, p => wtag(p, W) * (p.tags.includes('jazz') && !p.tags.includes('emo') && !p.tags.includes('punk') ? 0.35 : 1));
    const Wj = { jazz: 2.2, emo: 0.5, synth: 0.4, bright: 0.2, dark: 0.2 };
    const jpool = pool.filter(p => p.id !== home.id);
    const alt = rng.weighted(jpool, p => wtag(p, Wj) + (p.tags.includes('jazz') ? P.jazz * 2 : 0));
    const alt2 = rng.weighted(pool.filter(p => p.id !== home.id && p.id !== alt.id), p => wtag(p, W));
    const scaleName = J.scaleFor(home, J.rng(seed, 'scale'), P.dark);
    return { seed: String(seed), tonic, major, mode, bpm, autoBpm, home, alt, alt2, scaleName, P0: Object.assign({}, P) };
  };

  // ------------------------------------------------------------------------------------------
  // form
  // ------------------------------------------------------------------------------------------
  function cycleForm(song, P, cycle) {
    const r = J.rng(song.seed, 'form', cycle);
    const punkish = P.punk / (P.punk + P.dnb + 0.05);
    const dropKind = n => (u(song.seed, 'dropkind', cycle, n) < punkish ? 'chorus' : 'drop');
    const list = [];
    if (cycle === 0) list.push('intro');
    list.push(u(song.seed, 'bk1', cycle) < P.emo * 0.7 ? 'swell' : 'build');
    list.push(dropKind(0));
    list.push('breakdown');
    list.push('bridge');
    list.push(u(song.seed, 'bk2', cycle) < P.emo * 0.5 ? 'swell' : 'build');
    list.push(dropKind(1) === 'drop' && punkish > 0.3 && r.chance(0.5) ? 'chorus' : dropKind(1));
    list.push('outro');
    return list;
  }

  const BARS = { intro: 8, build: 8, swell: 8, drop: 16, chorus: 16, breakdown: 8, bridge: 8, outro: 8 };

  function planSection(song, P, cycle, idx, kind, prev) {
    const r = J.rng(song.seed, 'sec', cycle, idx, kind);
    const sec = { cycle, idx, kind, id: cycle + ':' + idx, seed: song.seed, rngSeed: [song.seed, cycle, idx, kind].join('|') };
    let bars = BARS[kind];
    if ((kind === 'drop' || kind === 'chorus') && idx > 3) bars = 24;     // the second drop runs longer
    if (kind === 'breakdown') bars = r.chance(0.35) ? 12 : 8;
    sec.bars = bars;
    sec.style = { intro: 'ambient', build: 'dnb', swell: 'emo', drop: 'dnb', chorus: 'punk', breakdown: 'ambient', bridge: 'ambient', outro: 'ambient' }[kind];
    sec.clock = 1;
    sec.swing = 0.05 + 0.12 * P.jazz;
    sec.hold = 1;
    sec.e0 = 0.4; sec.e1 = 0.8;
    sec.prog = song.home;
    let metersFor = () => MET['44'];
    sec.bridgeKind = null;

    switch (kind) {
      case 'intro': sec.e0 = 0.16; sec.e1 = 0.42; sec.hold = 1; sec.clock = (u(sec.rngSeed, 'clk') < P.tempoFeel * 0.7) ? 0.5 : 1; break;
      case 'build': sec.e0 = 0.42; sec.e1 = 0.92; sec.prog = r.chance(0.7) ? song.home : song.alt2; break;
      case 'swell': sec.e0 = 0.3; sec.e1 = 0.95; sec.prog = r.chance(0.6) ? song.home : song.alt2; break;
      case 'drop': sec.e0 = 0.88; sec.e1 = 1.0; sec.prog = song.home; break;
      case 'chorus': sec.e0 = 0.88; sec.e1 = 1.02; sec.prog = r.chance(0.65) ? song.home : song.alt2; sec.swing = 0; break;
      case 'breakdown':
        sec.e0 = 0.3; sec.e1 = 0.52; sec.hold = (u(sec.rngSeed, 'hold') < 0.55) ? 2 : 1;
        sec.clock = (u(sec.rngSeed, 'clk') < P.tempoFeel * 0.9 + P.jazz * 0.15) ? 0.5 : 1;
        sec.prog = r.chance(0.55) ? song.home : song.alt2; sec.swing = 0.1 + 0.55 * P.jazz * (sec.clock === 0.5 ? 1 : 0.4);
        break;
      case 'bridge': {
        // math rock (odd meter), jazz (ii-V and swing), or an emo open-chord stretch
        const wm = P.math * 1.1, wj = P.jazz * 1.0, we = P.emo * 0.8 + 0.1;
        const pick = r.weighted(['math', 'jazz', 'emo'], k => ({ math: wm, jazz: wj, emo: we }[k]));
        sec.bridgeKind = pick;
        sec.e0 = 0.45; sec.e1 = 0.7;
        sec.prog = pick === 'jazz' ? song.alt : (pick === 'math' ? song.alt2 : song.home);
        if (pick === 'jazz') { sec.clock = 0.5; sec.swing = 0.45 + 0.4 * P.jazz; sec.style = 'jazz'; sec.hold = 1; }
        if (pick === 'math') {
          sec.style = 'math'; sec.swing = 0;
          const fam = r.weighted(['7', '54', '332', '98'], k => ({ '7': 1.4, '54': 1.0, '332': 0.9, '98': 0.4 }[k]));
          const choose = fam === '7' ? ['7a', '7b', '7c'] : fam === '54' ? ['54a', '54b'] : fam === '98' ? ['98'] : ['332', '323'];
          const first = r.pick(choose);
          metersFor = (b, n) => (b >= n - 1 ? MET['44'] : (b % 4 === 3 && choose.length > 1 ? MET[choose[(choose.indexOf(first) + 1) % choose.length]] : MET[first]));
          sec.mathFamily = fam;
        }
        if (pick === 'emo') { sec.style = 'emo'; sec.clock = (u(sec.rngSeed, 'clk') < P.tempoFeel) ? 0.5 : 1; }
        break;
      }
      case 'outro': sec.e0 = 0.55; sec.e1 = 0.06; sec.hold = 1; sec.clock = (u(sec.rngSeed, 'clk') < P.tempoFeel * 0.6) ? 0.5 : 1; sec.prog = r.chance(0.5) ? song.home : song.alt2; break;
    }
    sec.meters = []; for (let b = 0; b < sec.bars; b++) sec.meters.push(metersFor(b, sec.bars));

    // chord instances (each lasts `hold` bars; the progression loops to fill the section)
    sec.chords = []; sec.chordIdx = []; sec.chordSpan = [];
    const pc = sec.prog.chords;
    let bar = 0, ci = 0;
    while (bar < sec.bars) {
      const def = pc[ci % pc.length];
      const len = Math.min(Math.max(1, Math.round(def.bars * sec.hold)), sec.bars - bar);
      sec.chords.push({ root: (song.tonic + def.root) % 12, base: def.base, sus: def.sus });
      sec.chordSpan.push({ first: bar, last: bar + len - 1 });
      for (let k = 0; k < len; k++) sec.chordIdx.push(ci);
      bar += len; ci++;
    }

    // per-section material, all from this section's own seeded stream
    sec.rBreak = J.rng(sec.rngSeed, 'break');
    sec.brk = makeBreak(sec.rBreak);
    sec.bassTpl = makeBassTemplate(J.rng(sec.rngSeed, 'bass'), sec);
    sec.reese = u(sec.rngSeed, 'reese') < clamp(0.25 + 0.7 * P.synth, 0, 1);
    sec.wob = r.pick([0.5, 0.25, 0.5, 1]) ;
    sec.keysTpl = makeKeysTemplate(J.rng(sec.rngSeed, 'keys'), sec);
    sec.lead = makeLead(J.rng(sec.rngSeed, 'lead'), sec, song);
    sec.tw = {};
    sec.twRng = J.rng(sec.rngSeed, 'tw');
    sec.useArp = u(sec.rngSeed, 'arp') < P.synth * 0.9;
    sec.fillKind = r.pick(['roll', 'stutter', 'tom', 'roll']);
    return sec;
  }

  // ------------------------------------------------------------------------------------------
  // drum material
  // ------------------------------------------------------------------------------------------
  function makeBreak(r) {
    const used = new Set([0, 4, 12]);
    const k2 = r.weighted([10, 11, 7, 6, 9], k => ({ 10: 6, 11: 2, 7: 1.4, 6: 1.2, 9: 0.5 }[k]));
    const kicks = [0, k2];
    if (r.chance(0.5)) { const k3 = r.pick([2, 3, 14, 15, 13, 5]); if (!kicks.includes(k3)) kicks.push(k3); }
    if (r.chance(0.28)) { const k4 = r.pick([6, 7, 8]); if (!kicks.includes(k4)) kicks.push(k4); }
    kicks.forEach(k => used.add(k));
    const ghostPool = [1, 3, 5, 7, 9, 11, 14, 15, 2, 6, 13].filter(s => !used.has(s));
    const gh = r.shuffle(ghostPool).slice(0, 7).map((s, i) => ({ s, v: 0.16 + 0.17 * r.next(), gate: 0.1 + i * 0.12 }));
    const hatStyle = r.weighted(['eighth', 'sixteenth', 'offbeat', 'shuffle'], k => ({ eighth: 3, sixteenth: 2, offbeat: 2, shuffle: 1 }[k]));
    const openAt = r.pick([6, 14, 10, 2]);
    const chops = r.pick([[0, 1, 0, 3], [0, 0, 2, 3], [0, 1, 2, 1], [2, 1, 0, 3], [0, 3, 2, 3]]);
    const half = { kicks: [0, r.weighted([5, 6, 7, 10, 11], k => ({ 5: 1, 6: 1.2, 7: 1.2, 10: 2, 11: 1 }[k]))], ghosts: r.shuffle([3, 5, 11, 13, 14, 15]).slice(0, 4) };
    if (r.chance(0.4)) half.kicks.push(r.pick([13, 14, 15, 3]));
    const punk = { kicks: r.chance(0.5) ? [0, 8] : [0, 6, 8, 10], busy: r.chance(0.4) };
    const jazz = { ghosts: r.shuffle([3, 7, 10, 11, 13, 15, 5]).slice(0, 5), feather: r.chance(0.5) };
    return { kicks, ghosts: gh, hatStyle, openAt, chops, half, punk, jazz };
  }

  function drumsForBar(ev, sec, barNo, meter, mode, e, eff, mods, rr, info) {
    const steps = meter.steps;
    const B = sec.brk, dens = clamp(eff.density * (sec.paceM || 1), 0, 1);
    const hs = mods.hatScale, vscale = clamp(0.55 + 0.6 * e, 0.4, 1.1);
    const add = (k, s, v, x) => { if (s >= 0 && s < steps) ev.push(Object.assign({ l: 'drums', k, s, v: clamp(v, 0.02, 1.2) }, x || {})); };
    const last = barNo === sec.bars - 1;
    const fillBar = last || (barNo % 8 === 7 && sec.bars > 8);
    const chopBar = barNo % 4 === 3 && !fillBar;
    const varBar = barNo % 4 === 2;
    const duckDepth = 0.18 + 0.35 * e * (0.4 + 0.6 * eff.dnb);
    const duckable = mode === 'full' || mode === 'half' || mode === 'punk';
    const kick = (s, v, x) => { add('kick', s, v * vscale, x); if (duckable) ev.push({ l: 'fx', k: 'duck', s, depth: duckDepth * (v > 0.5 ? 1 : 0.5), rel: 0.2 }); };

    if (mode === 'none') { return; }

    if (mode === 'full') {
      // chopped breakbeat: backbeat stays, everything else gets rearranged now and then
      let kicks = B.kicks.slice();
      if (varBar) kicks = kicks.map((k, i) => (i === 1 ? clamp(k + (rr.chance(0.5) ? 1 : -1), 6, 15) : k));
      const segOrder = chopBar ? B.chops : [0, 1, 2, 3];
      const mapStep = s => { const seg = Math.floor(s / 4), within = s % 4; return segOrder[seg] * 4 + within; };
      const seen = new Set();
      const kicksM = [];
      kicks.forEach(k => {
        const seg = Math.floor(k / 4);
        // find every output segment that plays source segment `seg`
        segOrder.forEach((src, outSeg) => { if (src === seg) { const s = outSeg * 4 + (k % 4); if (!seen.has(s)) { seen.add(s); kicksM.push(s); } } });
      });
      kicksM.forEach((s, i) => kick(s, i === 0 ? 1 : 0.85));
      add('snare', 4, 0.95); add('snare', 12, 0.98);
      B.ghosts.forEach(g => {
        const dg = g.gate;
        if (dens > dg && rr.next() < 0.5 + 0.5 * dens) {
          const src = Math.floor(g.s / 4); const outs = chopBar ? segOrder.map((sg, i) => (sg === src ? i : -1)).filter(i => i >= 0) : [src];
          outs.forEach(o => { const s = o * 4 + (g.s % 4); if (!seen.has(s) && s !== 4 && s !== 12) add('snare', s, g.v * (0.6 + 0.8 * e), { ghost: true }); });
        }
      });
      // hats
      for (let s = 0; s < steps; s++) {
        let v = 0;
        if (B.hatStyle === 'sixteenth') v = (s % 2 === 0 ? 0.5 : 0.3) + (s % 4 === 2 ? 0.2 : 0);
        else if (B.hatStyle === 'eighth') v = s % 2 === 0 ? (s % 4 === 2 ? 0.55 : 0.4) : 0;
        else if (B.hatStyle === 'offbeat') v = s % 4 === 2 ? 0.6 : (s % 2 === 0 ? 0.2 : 0);
        else v = (s % 3 === 0) ? (s % 6 === 0 ? 0.5 : 0.38) : 0;
        if (v <= 0) continue;
        if (s % 2 === 1 && rr.next() > dens * 0.9) continue;
        if (s % 2 === 0 && s % 4 !== 0 && rr.next() > 0.55 + dens * 0.5) continue;
        if (s === B.openAt && e > 0.6 && B.hatStyle !== 'sixteenth') add('hat', s, 0.55 * hs, { open: true });
        else add('hat', s, v * hs * (0.7 + 0.5 * e));
      }
      if (barNo % 2 === 1 && e > 0.8) add('hat', 15, 0.5 * hs, { open: true });
    } else if (mode === 'half') {
      const H = B.half;
      H.kicks.forEach((k, i) => kick(k, i === 0 ? 1 : 0.8));
      add('snare', 8, 1.0);
      H.ghosts.forEach((g, i) => { if (dens > 0.15 + i * 0.18 && rr.next() < 0.7) add('snare', g, 0.2 + 0.1 * rr.next(), { ghost: true }); });
      for (let s = 0; s < steps; s += 2) { if (s % 4 === 2 && rr.next() > dens * 0.5 + 0.4) continue; add('hat', s, (s % 4 === 0 ? 0.36 : 0.26) * hs); }
      if (e > 0.55 && barNo % 2 === 1) add('hat', 14, 0.5 * hs, { open: true });
    } else if (mode === 'sparse') {
      kick(0, 0.8);
      if (steps >= 12 && rr.chance(0.4 + 0.3 * dens)) kick(rr.pick([10, 11]) % steps, 0.5);
      add('snare', Math.min(8, steps - 4), 0.4, { rim: true });
      if (dens > 0.3) for (let s = 0; s < steps; s += 4) if (rr.chance(0.5 + 0.4 * dens)) add('hat', s, 0.2 * hs);
    } else if (mode === 'jazz') {
      const J_ = B.jazz;
      for (let q = 0; q < steps; q += 4) add('ride', q, q % 8 === 0 ? 0.55 : 0.45);
      for (let q = 6; q < steps; q += 8) add('ride', q, 0.32);
      add('hat', 4, 0.3 * hs); add('hat', 12 % steps, 0.3 * hs);
      if (J_.feather && rr.chance(0.7)) kick(0, 0.28, { sub: true });
      J_.ghosts.forEach((g, i) => { if (dens > 0.1 + 0.14 * i && rr.chance(0.6)) add('snare', g, 0.22 + 0.12 * rr.next(), { ghost: true }); });
      if (barNo % 4 === 3) add('snare', 12, 0.35, { rim: true });
      if (e > 0.5 && rr.chance(0.3)) kick(rr.pick([7, 10, 11]), 0.35, { sub: true });
    } else if (mode === 'punk') {
      const P_ = B.punk;
      P_.kicks.forEach((k, i) => kick(k, i === 0 ? 1 : 0.85));
      if (e > 0.9 && P_.busy) { kick(4, 0.6); kick(12, 0.6); }
      add('snare', 4, 0.95); add('snare', 12, 1.0);
      for (let s = 0; s < steps; s += 2) {
        const open = e > 0.8 && s % 4 === 2 && (barNo % 2 === 1 || P_.busy);
        add('hat', s, (s % 4 === 0 ? 0.5 : 0.4) * hs * (0.8 + 0.3 * e), open ? { open: true } : undefined);
      }
    } else if (mode === 'math') {
      const st = meter.starts, n = st.length;
      kick(st[0], 1);
      if (n >= 3) kick(st[2], 0.85);
      add('snare', st[1], 0.95);
      if (n >= 4) add('snare', st[3], 0.9); else if (meter.groups[n - 1] >= 6) add('snare', st[n - 1] + 4, 0.8);
      for (let s = 0; s < steps; s += 2) add('hat', s, (st.includes(s) ? 0.5 : 0.32) * hs);
      if (dens > 0.45) meter.groups.forEach((g, i) => { if (rr.chance(0.45)) add('snare', st[i] + g - 1, 0.2, { ghost: true }); });
    }

    // crash on section starts and every 8 bars of the big sections
    if ((barNo === 0 && (sec.kind === 'drop' || sec.kind === 'chorus' || sec.kind === 'outro')) || (barNo % 8 === 0 && barNo > 0 && e > 0.8 && (mode === 'full' || mode === 'punk'))) {
      add('crash', 0, 0.8);
    }

    // fills
    if (fillBar && mode !== 'jazz' && (sec.kind !== 'outro')) {
      const kind = sec.kind === 'build' || sec.kind === 'swell' ? (barNo === sec.bars - 1 ? 'dropout' : sec.fillKind) : sec.fillKind;
      const f0 = steps >= 16 ? 8 : Math.max(6, steps - 8);
      // clear the second half of the bar for the fill
      for (let i = ev.length - 1; i >= 0; i--) if (((ev[i].l === 'drums' && ev[i].k !== 'crash') || (ev[i].l === 'fx' && ev[i].k === 'duck')) && ev[i].s >= f0) ev.splice(i, 1);
      if (kind === 'roll') { for (let s = f0; s < steps; s++) add('snare', s, 0.3 + 0.7 * (s - f0) / (steps - f0), s % 2 ? { ghost: true } : undefined); kick(f0, 0.8); }
      else if (kind === 'stutter') { [f0, f0 + 2, steps - 3, steps - 2, steps - 1.5, steps - 1, steps - 0.5].forEach((s, i) => { if (i % 2 === 0) kick(s, 0.9); else add('snare', s, 0.8); }); }
      else if (kind === 'tom') { [f0, f0 + 2, f0 + 4, steps - 3, steps - 2, steps - 1].forEach((s, i) => add('tom', s, 0.75, { f: 220 - i * 22 })); add('snare', steps - 1, 0.8); }
      else if (kind === 'dropout') { add('snare', steps - 2, 0.5, { ghost: true }); add('snare', steps - 1, 0.7, { ghost: true }); }
    }
  }

  // ------------------------------------------------------------------------------------------
  // bass / keys / twinkle / lead material
  // ------------------------------------------------------------------------------------------
  function makeBassTemplate(r, sec) {
    const dnb = [
      [{ s: 0, d: 6, t: 'root' }, { s: 10, d: 4, t: r.pick(['root', 'fifth', 'oct']) }],
      [{ s: 0, d: 9, t: 'root' }, { s: 10, d: 6, t: r.pick(['root', 'b7']) }],
      [{ s: 0, d: 3, t: 'root' }, { s: 6, d: 3, t: 'root' }, { s: 10, d: 5, t: r.pick(['fifth', 'root']) }],
      [{ s: 0, d: 7, t: 'root' }, { s: 7, d: 2, t: 'oct' }, { s: 10, d: 4, t: 'root' }, { s: 14, d: 2, t: 'approach' }],
    ];
    const roll = [
      [{ s: 0, d: 3, t: 'root' }, { s: 3, d: 1, t: 'root' }, { s: 6, d: 2, t: 'oct' }, { s: 10, d: 3, t: 'root' }, { s: 14, d: 2, t: 'approach' }],
      [{ s: 0, d: 2, t: 'root' }, { s: 3, d: 2, t: 'root' }, { s: 6, d: 1, t: 'fifth' }, { s: 10, d: 2, t: 'root' }, { s: 12, d: 2, t: 'oct' }],
    ];
    return { dnb: r.pick(dnb), roll: r.pick(roll), half: [{ s: 0, d: 13, t: 'root' }, { s: r.pick([13, 14]), d: 2, t: r.pick(['approach', 'fifth']) }] };
  }

  function makeKeysTemplate(r, sec) {
    return {
      stab: r.pick([[0, 3, 6, 10], [0, 3, 8, 11], [2, 6, 10, 14], [0, 6, 10]]),
      jazz: r.pick([[0, 7], [3, 10], [0, 6, 11], [2, 8, 13], [4, 10], [0, 5, 10, 14]]),
      jazz2: r.pick([[2, 9], [0, 6, 12], [3, 8, 14]]),
      sustain: r.pick([[0], [0, 8], [0, 6, 10]]),
      off: [2, 6, 10, 14],
    };
  }

  function makeLead(r, sec, song) {
    const anthem = sec.kind === 'chorus';
    const rhythms = anthem
      ? [[[0, 6], [8, 4], [12, 4]], [[0, 4], [6, 2], [8, 8]], [[0, 3], [4, 3], [8, 4], [12, 4]]]
      : [[[0, 3], [3, 3], [6, 2], [10, 5]], [[0, 2], [2, 2], [4, 4], [8, 3], [12, 3]], [[2, 4], [8, 2], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 2], [12, 3]], [[3, 3], [6, 3], [10, 2], [12, 2], [14, 2]]];
    const A = r.pick(rhythms), B = r.pick(rhythms);
    const walk = n => { let c = r.int(0, 2), a = []; for (let i = 0; i < n; i++) { a.push(c); c += r.weighted([-2, -1, 0, 1, 2], d => ({ '-2': 1, '-1': 2, '0': 0.4, '1': 2, '2': 1 }[d])); c = clamp(c, -3, 5); } return a; };
    return { A, B, cA: walk(8), cB: walk(8), glide: r.chance(0.6), wave: r.chance(0.5) ? 'saw' : 'square', ending: r.pick([0, 2, 4]) };
  }

  function makeTwinkleCell(r, meter, style) {
    const cell = [];
    const shapes2 = [[0, 2], [0, 1], [1, 0], [2, 0], [0, 3]], shapes3 = [[0, 2, 1], [0, 1, 2], [2, 1, 0], [0, 2, 3], [1, 0, 2]];
    const inc = r.pick([1, 1, 2, 0]);
    let first = true;
    meter.groups.forEach((gl, gi) => {
      const n = Math.max(1, Math.round(gl / 2));
      const sh = r.pick(n >= 3 ? shapes3 : shapes2);
      for (let k = 0; k < n; k++) {
        cell.push({ s: meter.starts[gi] + 2 * k, idx: sh[k] + inc * gi, acc: k === 0, group: gi });
      }
    });
    // sixteenth pickups before some group starts
    meter.starts.forEach((gs, gi) => { if (gi > 0 && r.chance(0.4)) cell.push({ s: gs - 1, idx: cell.find(c => c.s === gs).idx - 1, pick: true, group: gi - 1 }); });
    cell.sort((a, b) => a.s - b.s);
    return cell;
  }

  // ------------------------------------------------------------------------------------------
  // chords for a bar
  // ------------------------------------------------------------------------------------------
  function colorFor(def, eff, key, sec) {
    const jz = eff.jazz, em = eff.emo, col = {};
    const isDom = def.base === 'dom', isMaj = def.base === 'maj' && !def.sus, isMin = def.base === 'min';
    const p7 = jz * 1.3 + (isDom ? 0.45 : 0) + (sec.style === 'jazz' ? 0.35 : 0);
    if (u(key, '7') < p7) col.sev = true;
    if (col.sev) {
      if (u(key, '9') < jz + (sec.style === 'jazz' ? 0.2 : 0)) col.nine = true;
      if (u(key, '11') < jz * 0.6 && (isMin || isMaj)) col.eleven = true;
      if (isDom) { if (u(key, '13') < jz * 0.7) col.thirteen = true; if (col.nine && u(key, 'alt') < jz * 0.5) col.alt = true; }
      if (isMaj && !col.eleven && u(key, '13m') < jz * 0.3) col.thirteen = true;
    } else {
      if (u(key, 'add9') < em * 0.8) col.add9 = true;
      else if (u(key, 'six') < jz * 0.2) col.six = true;
      if ((isMaj || isMin) && u(key, 'sus') < em * 0.28) { col.sus = u(key, 'sus24') < 0.6 ? '2' : '4'; col.add9 = false; }
    }
    if (def.sus) col.sus = def.sus;
    return col;
  }

  function segmentsFor(song, sec, barNo, eff, meter) {
    const ci = sec.chordIdx[barNo], def = sec.chords[ci], span = sec.chordSpan[ci];
    const key = [sec.rngSeed, 'col', ci];
    const col = colorFor(def, eff, key, sec);
    const cur = J.buildChord(def.root, def.base, col);
    const steps = meter.steps;
    let segs = [{ chord: cur, s0: 0, s1: steps }];
    const nextDef = sec.chords[(ci + 1) % sec.chords.length];
    const lastBar = barNo === span.last;
    if (lastBar && steps >= 14 && nextDef.root !== def.root && u(key, 'pass', barNo) < eff.jazz * 0.6) {
      const mid = midBoundary(meter);
      const kind = u(key, 'passk', barNo);
      const tr = nextDef.root, minor = nextDef.base === 'min' || nextDef.base === 'hdim';
      if (kind < 0.4) { // secondary dominant of the next chord
        segs = [{ chord: cur, s0: 0, s1: mid }, { chord: J.buildChord((tr + 7) % 12, 'dom', { sev: true, nine: u(key, 'pn') < eff.jazz, alt: u(key, 'pa') < 0.4 }), s0: mid, s1: steps }];
      } else if (kind < 0.65) { // tritone substitution
        segs = [{ chord: cur, s0: 0, s1: mid }, { chord: J.buildChord((tr + 1) % 12, 'dom', { sev: true, nine: u(key, 'pn') < eff.jazz, thirteen: true }), s0: mid, s1: steps }];
      } else if (kind < 0.9) { // ii - V into the next chord
        segs = [{ chord: J.buildChord((tr + 2) % 12, minor ? 'hdim' : 'min', { sev: true, nine: !minor }), s0: 0, s1: mid }, { chord: J.buildChord((tr + 7) % 12, 'dom', { sev: true, alt: minor }), s0: mid, s1: steps }];
      } else { // diminished passing chord a half step under the next root
        segs = [{ chord: cur, s0: 0, s1: mid }, { chord: J.buildChord((tr + 11) % 12, 'dim', { sev: true }), s0: mid, s1: steps }];
      }
    }
    segs.forEach(sg => { sg.bassPc = sg.chord.root; });
    return { segs, def, span, ci };
  }

  // ------------------------------------------------------------------------------------------
  // the composer object
  // ------------------------------------------------------------------------------------------
  J.Composer = function (seed, P) {
    seed = String(seed);
    const self = this;
    this.seed = seed;
    this.song = J.makeSong(seed, P);
    this.cycle = 0; this.idx = 0; this.form = cycleForm(this.song, P, 0);
    this.sec = null; this.barNo = 0; this.barCount = 0;
    this.prev = { keys: null, pad: null, bassPc: null, leadMidi: null };
    this.next = function (eff, mods) {
      if (!this.sec || this.barNo >= this.sec.bars) {
        this.song.bpm = J.tempoOf(eff, this.song.autoBpm);
        if (this.sec) { this.idx++; if (this.idx >= this.form.length) { this.cycle++; this.idx = 0; this.form = cycleForm(this.song, eff, this.cycle); if (this.cycle > 0 && this.form[0] === 'intro') this.form.shift(); } }
        this.sec = planSection(this.song, eff, this.cycle, this.idx, this.form[this.idx], this.sec);
        this.barNo = 0;
      }
      const bar = composeBar(this.song, this.sec, this.barNo, eff, mods || { hatScale: 1, forceFull: false, radio: 0 }, this.prev, this.barCount);
      this.barNo++; this.barCount++;
      return bar;
    };
  };

  // ------------------------------------------------------------------------------------------
  // compose one bar
  // ------------------------------------------------------------------------------------------
  function composeBar(song, sec, barNo, eff, mods, prev, barCount) {
    const meter = sec.meters[barNo], steps = meter.steps;
    const t01 = sec.bars > 1 ? barNo / (sec.bars - 1) : 0;
    const e = clamp(lerp(sec.e0, sec.e1, t01) * (0.55 + 0.8 * eff.energy), 0, 1.1);
    const rr = J.rng(sec.rngSeed, 'bar', barNo);
    const ev = [];
    const { segs, def, span, ci } = segmentsFor(song, sec, barNo, eff, meter);
    const segAt = s => { for (const sg of segs) if (s >= sg.s0 && s < sg.s1) return sg; return segs[segs.length - 1]; };
    const kind = sec.kind;
    const dens = eff.density;
    const first = barNo === 0, lastB = barNo === sec.bars - 1;

    // ---- drum mode for this bar
    let mode;
    const bk = sec.bridgeKind;
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
    if (kind === 'breakdown' && lastB) mode = 'none';       // drop out right before the drop

    // ---- layer switches by section kind
    const L = { drums: true, bass: true, keys: true, twinkle: true, pads: true, lead: false, texture: true };
    switch (kind) {
      case 'intro': L.bass = barNo >= 4; L.keys = eff.jazz > 0.4; break;
      case 'build': case 'swell': L.keys = kind === 'build' && eff.jazz > 0.3; L.lead = barNo >= 6 && eff.synth > 0.4; break;
      case 'drop': L.lead = true; L.pads = e > 0.5; L.twinkle = eff.math > 0.3 || eff.emo > 0.4; break;
      case 'chorus': L.lead = true; L.keys = false; break;
      case 'breakdown': L.lead = false; break;
      case 'bridge': L.lead = bk === 'jazz' && eff.synth > 0.5 && barNo >= 4; L.keys = bk !== 'emo' || eff.jazz > 0.3; break;
      case 'outro': L.bass = barNo < 5; L.keys = barNo < 6; L.lead = false; break;
    }
    const GATE = { pads: 0.0, texture: 0.0, twinkle: 0.12, keys: 0.2, bass: 0.3, drums: 0.0, lead: 0.58 };
    Object.keys(L).forEach(k => { if (e < GATE[k]) L[k] = false; });

    // ---- pads: one sustained voicing per chord instance (re-struck at chord changes)
    if (L.pads) {
      segs.forEach((sg, i) => {
        const newChord = i > 0 || barNo === span.first || first;
        if (!newChord) return;
        const v = J.voice(sg.chord, prev.pad, { lo: 50, hi: 74, n: 4, includeRoot: false });
        prev.pad = v;
        // sustain to the end of this chord instance (not past the section)
        let dsteps = sg.s1 - sg.s0;
        if (i === segs.length - 1) for (let b = barNo + 1; b <= span.last && b < sec.bars; b++) dsteps += sec.meters[b].steps;
        const vel = clamp((kind === 'drop' || kind === 'chorus' ? 0.5 : 0.75) * (0.5 + 0.7 * e) * (1 + 0.3 * eff.emo), 0.2, 1);
        ev.push({ l: 'pads', k: 'chord', s: sg.s0, d: dsteps, notes: v, v: vel, shimmer: eff.synth, attack: kind === 'build' || kind === 'swell' ? 0.9 : 0.5, release: 1.1 });
      });
      // filter movement: opens through builds, closes in the outro
      const hz = kind === 'build' || kind === 'swell' ? lerp(1500, 9000, t01) : kind === 'outro' ? lerp(3000, 700, t01) : kind === 'intro' ? lerp(1100, 2600, t01) : kind === 'breakdown' ? 1500 : kind === 'bridge' ? 2600 : 3800;
      ev.push({ l: 'fx', k: 'padcut', s: 0, hz: hz * (0.7 + 0.5 * eff.synth) });
    }

    // ---- bass
    if (L.bass) {
      const tpl = sec.bassTpl;
      const plan = [];
      const nextRootAhead = (() => { const nc = sec.chords[(ci + 1) % sec.chords.length]; return nc.root; })();
      const approachFor = (pc, tgt) => { // chromatic neighbour below or above the next root
        const dn = (tgt + 11) % 12, up = (tgt + 1) % 12; return u(sec.rngSeed, 'appr', barNo) < 0.5 ? dn : up;
      };
      let bmode = 'sub';
      if (kind === 'drop' || (kind === 'build' && barNo >= 4)) bmode = sec.reese ? 'reese' : 'sub';
      if (kind === 'chorus') bmode = 'pluck';
      if (kind === 'bridge' && bk === 'jazz') bmode = 'pluck';
      if (kind === 'breakdown' && sec.clock === 0.5 && eff.jazz > 0.45) bmode = 'pluck';
      let pat;
      if (kind === 'chorus') {
        pat = []; for (let s = 0; s < steps; s += 2) pat.push({ s, d: 1.7, t: s === 0 || s % 8 === 0 ? 'root' : (s % 4 === 0 ? 'root' : 'root') });
      } else if (bmode === 'pluck' && (kind === 'bridge' || kind === 'breakdown')) { // walking
        pat = []; const qs = []; for (let s = 0; s < steps; s += 4) qs.push(s);
        qs.forEach((s, i) => pat.push({ s, d: 3.6, t: i === 0 ? 'root' : i === qs.length - 1 ? 'approach' : (i % 2 ? 'third' : 'fifth') }));
      } else if (mode === 'math' || kind === 'bridge' && bk === 'math') {
        pat = meter.starts.map((s, i) => ({ s, d: meter.groups[i] - 1, t: i % 2 ? 'oct' : 'root' }));
      } else if (kind === 'outro' || kind === 'intro' || (kind === 'swell' && barNo < 6) || (kind === 'bridge' && bk === 'emo')) {
        pat = [{ s: 0, d: steps - 1.5, t: 'root' }];
      } else if (mode === 'half' || mode === 'sparse' || mode === 'none' || kind === 'breakdown') {
        pat = tpl.half;
      } else if (bmode === 'reese' && e > 0.7 && u(sec.rngSeed, 'roll', ci) < eff.synth) {
        pat = tpl.roll;
      } else {
        pat = tpl.dnb;
      }
      const vel = clamp(0.55 + 0.5 * e, 0.4, 1.05);
      let lastMidi = prev.bassMidi || null;
      pat.forEach(n => {
        if (n.s >= steps) return;
        const sg = segAt(n.s);
        const chord = sg.chord;
        let pc = sg.bassPc;
        const tones = chord.tones;
        if (n.t === 'fifth') pc = (chord.root + (tones.includes(6) && !tones.includes(7) ? 6 : 7)) % 12;
        else if (n.t === 'b7') pc = (chord.root + (tones.includes(11) ? 11 : 10)) % 12;
        else if (n.t === 'third') pc = (chord.root + (tones.find(t => t === 3 || t === 4 || t === 5 || t === 2) || 7)) % 12;
        else if (n.t === 'approach') pc = approachFor(chord.root, sg === segs[segs.length - 1] ? (barNo === span.last ? nextRootAhead : chord.root) : segs[segs.length - 1].chord.root);
        let midi = J.bassMidi(pc, 34);
        if (n.t === 'oct') midi = J.bassMidi(chord.root, 34) + 12;
        if (midi > 45) midi -= 12;
        if (midi < 34) midi += 12;
        // dnb: now and then jump an octave up on the second hit
        const x = {};
        if (bmode === 'reese') { x.wob = sec.wob * (steps / 16) * 0.345 * (174 / song.bpm); x.lo = 140 + 160 * (1 - eff.dark); x.hi = 700 + 1300 * e; x.res = 3 * eff.synth; }
        ev.push(Object.assign({ l: 'bass', k: 'note', s: n.s, d: n.d, n: midi, v: vel, mode: bmode, glideFrom: (bmode === 'sub' && lastMidi && lastMidi !== midi && n.s === 0 && Math.abs(lastMidi - midi) < 8 && kind !== 'drop') ? lastMidi : undefined }, x));
        lastMidi = midi;
      });
      prev.bassMidi = lastMidi;
    }

    // ---- keys (FM electric piano)
    if (L.keys) {
      let tpl, dur = 3, vel = 0.5;
      if (kind === 'drop' || kind === 'build') { tpl = sec.keysTpl.stab; dur = 1.6; vel = 0.55; }
      else if (sec.style === 'jazz' || (kind === 'breakdown' && sec.clock === 0.5)) { tpl = (barNo % 2 ? sec.keysTpl.jazz2 : sec.keysTpl.jazz); dur = 3.2; vel = 0.42; }
      else if (kind === 'bridge' && bk === 'math') { tpl = meter.starts.filter((s, i) => i % 2 === 0); dur = 3; vel = 0.4; }
      else { tpl = sec.keysTpl.sustain; dur = steps - 1; if (tpl.length > 1) dur = 6; vel = 0.4; }
      tpl.forEach((s, i) => {
        if (s >= steps) return;
        if (i > 0 && rr.next() > 0.45 + 0.55 * dens) return;
        const sg = segAt(s);
        const v = J.voice(sg.chord, prev.keys, { lo: 52, hi: 77, n: sg.chord.tones.length >= 5 ? 5 : 4, includeRoot: true });
        prev.keys = v;
        ev.push({ l: 'keys', k: 'chord', s, d: Math.min(dur, steps - s + 2), notes: v, v: vel * (0.6 + 0.6 * e) * (s % 4 === 0 ? 1 : 0.85), strum: sec.style === 'jazz' ? 0.016 : 0.009, bright: 0.8 + 0.5 * eff.synth });
      });
    }

    // ---- twinkle (Karplus-Strong arpeggios)
    if (L.twinkle) {
      const mathy = eff.math;
      const style = (sec.style === 'math') ? 'math' : (kind === 'breakdown' || kind === 'outro' || kind === 'intro') ? 'sparse' : 'arp';
      const meterKey = (style !== 'math' && steps === 16 && mathy > 0.45 && u(sec.rngSeed, 'tw332', ci) < (mathy - 0.35) * 1.4) ? '332' : meter.id;
      const tmeter = meterKey === '332' ? MET['332'] : meter;
      const ckey = tmeter.id + ':' + style;
      if (!sec.tw[ckey]) sec.tw[ckey] = makeTwinkleCell(J.rng(sec.rngSeed, 'twc', ckey), tmeter, style);
      const cell = sec.tw[ckey];
      const crescendo = (kind === 'build' || kind === 'swell') ? 0.45 + 0.6 * t01 : (kind === 'outro' ? 1 - 0.7 * t01 : 1);
      const variant = barNo % 4;
      const shift = variant === 2 ? 1 : 0;
      cell.forEach((c, k) => {
        if (c.s >= steps) return;
        // sparse style: keep only group starts and an occasional second note
        if (style === 'sparse' && !c.acc && rr.next() > 0.3 + 0.35 * dens) return;
        if (c.pick && (variant === 3 || rr.next() > dens * 0.9)) return;
        if (style === 'arp' && !c.acc && !c.pick && rr.next() > 0.55 + 0.5 * dens) return;
        if ((kind === 'build' || kind === 'swell') && !c.acc && c.s % 4 !== 2 && t01 < 0.5) return;
        const sg = segAt(c.s);
        const pool = J.chordMidis(sg.chord, 57, 86);
        if (!pool.length) return;
        const base = pool.findIndex(m => m >= 64 - Math.round(2 * eff.dark));
        let idx = (base < 0 ? 0 : base) + c.idx + (c.group >= (meter.groups.length / 2) ? shift : 0);
        if (variant === 3 && k >= cell.length - 2) idx = (base < 0 ? 0 : base) + (k === cell.length - 1 ? 0 : 2);
        const n_ = pool.length; let bi = idx; if (bi >= n_) bi = Math.max(0, 2 * (n_ - 1) - bi); if (bi < 0) bi = Math.min(n_ - 1, -bi);
        const midi = pool[bi];
        const v = clamp((c.acc ? 0.62 : c.pick ? 0.4 : 0.46) * (0.55 + 0.6 * e) * crescendo, 0.1, 0.95);
        ev.push({ l: 'twinkle', k: 'pluck', s: c.s, n: Math.min(midi, 88), v, variant: (k + barNo) % 2, pan: ((k * 37 + barNo * 11) % 7 - 3) / 7 });
      });
      // emo strum on the first beat of a chord
      if (sg0IsNew(barNo, span) && eff.emo > 0.3 && u(sec.rngSeed, 'strum', barNo) < eff.emo * 0.9 && (kind !== 'drop' || eff.emo > 0.6)) {
        const v = J.voice(segs[0].chord, null, { lo: 55, hi: 79, n: 4, includeRoot: true });
        ev.push({ l: 'twinkle', k: 'strum', s: 0, notes: v, v: 0.5 * (0.6 + 0.5 * e) });
      }
    }

    // ---- lead
    if (L.lead && sec.lead) {
      const Ld = sec.lead, phrase = barNo % 4;
      const rhythm = phrase < 2 ? Ld.A : (phrase === 2 ? Ld.A : Ld.B);
      const contour = phrase < 2 ? Ld.cA : (phrase === 2 ? Ld.cA : Ld.cB);
      const arpBars = sec.useArp && kind === 'drop' && (barNo % 8 >= 4) && eff.synth > 0.45;
      if (arpBars) {
        const sg = segs[0];
        const pool = J.chordMidis(sg.chord, 64, 88);
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        for (let s = 0; s < steps; s++) {
          if (rr.next() > 0.55 + 0.45 * dens) continue;
          const m = pool[order[s % order.length] % pool.length];
          ev.push({ l: 'lead', k: 'note', s, d: 1.5, n: m, v: 0.32 * (0.6 + 0.5 * e), glide: false, wave: Ld.wave === 'saw' ? 'sawtooth' : 'square', bright: 0.7 + 0.7 * eff.synth });
        }
      } else {
        const scale = song.scaleName;
        const tonicMidi = 60 + song.tonic - (song.tonic > 6 ? 12 : 0);
        rhythm.forEach(([s0, d], k) => {
          if (s0 >= steps) return;
          if (k > 0 && rr.next() > 0.5 + 0.5 * dens) return;
          const sg = segAt(s0);
          const chordPool = J.chordMidis(sg.chord, 67, 91);
          const scaleDeg = contour[(k + (phrase === 3 ? 3 : 0)) % contour.length];
          let m = J.degreeMidi(tonicMidi + 12, scale, scaleDeg + 2 + (kind === 'chorus' ? 2 : 0));
          const strong = meter.starts.includes(s0) || k === 0;
          if (strong || (phrase === 3 && k === rhythm.length - 1)) m = J.nearest(chordPool, m);
          if (phrase === 3 && k === rhythm.length - 1) m = J.nearest(chordPool, J.nearest(J.chordMidis(sg.chord, 67, 91).filter(x => x % 12 === sg.chord.root || x % 12 === (sg.chord.root + 7) % 12), m));
          m = clamp(m, 66, 92);
          ev.push({ l: 'lead', k: 'note', s: s0, d: Math.min(d + (kind === 'chorus' ? 0 : 0), steps - s0 + 1), n: m, v: (kind === 'chorus' ? 0.55 : 0.42) * (0.6 + 0.5 * e), glide: Ld.glide, wave: Ld.wave === 'saw' ? 'sawtooth' : 'square', bright: 0.6 + 0.8 * eff.synth });
        });
      }
    }

    // ---- drums
    if (L.drums) drumsForBar(ev, sec, barNo, meter, mode, e, eff, mods, J.rng(sec.rngSeed, 'drm', barNo), null);

    // ---- texture: risers into drops, impacts on them, the odd radio burst
    if (L.texture) {
      if ((kind === 'build' || kind === 'swell') && barNo === sec.bars - 2) ev.push({ l: 'texture', k: 'riser', s: 0, d: steps + sec.meters[sec.bars - 1].steps - 1, v: 0.5 + 0.4 * eff.synth });
      if ((kind === 'drop' || kind === 'chorus') && first) ev.push({ l: 'texture', k: 'impact', s: 0, v: 0.8 });
      if (mods.radio > 0 && u(sec.rngSeed, 'radio', barNo) < 0.16 * mods.radio) ev.push({ l: 'texture', k: 'radio', s: Math.floor(u(sec.rngSeed, 'radios', barNo) * (steps - 6)), d: 5 + Math.floor(u(sec.rngSeed, 'radiod', barNo) * 10), v: 0.35 });
    }

    // bucket by step
    const byStep = [];
    for (let i = 0; i < steps; i++) byStep.push([]);
    ev.forEach(x => { const i = Math.min(steps - 1, Math.max(0, Math.floor(x.s))); byStep[i].push(x); });

    return {
      sec, secId: sec.id, kind, barNo, bars: sec.bars, meter, steps, clock: sec.clock, swing: sec.swing, e, mode, byStep, ev,
      segs: segs.map(sg => ({ name: sg.chord.name, s0: sg.s0, s1: sg.s1, root: sg.chord.root, base: sg.chord.base, pcs: J.chordPcs(sg.chord), alt: !!(sg.chord.col && sg.chord.col.alt) })), bpm: song.bpm, style: sec.style, bridgeKind: bk,
      composer: 'old', tonic: song.tonic, mode: song.mode, scaleName: song.scaleName,
      motifRef: sec.lead ? { onsets: sec.lead.A.map(x => x[0]), signs: sec.lead.cA.slice(0, 4).map((x, i, a) => (i ? Math.sign(x - a[i - 1]) : 0)).slice(1) } : null,
      layers: L, barCount, last: lastB, first,
    };
  }
  function sg0IsNew(barNo, span) { return barNo === span.first; }
  // internals shared with the second composer (composer2.js); the first composer itself is unchanged
  J._c = { planSection, cycleForm, drumsForBar, MET, BARS, midBoundary, makeBreak, makeBassTemplate, makeTwinkleCell, clamp, lerp };

  // ------------------------------------------------------------------------------------------
  // NPC motif: a short theme generated from any number, in the current key and mood
  // ------------------------------------------------------------------------------------------
  J.npcMotif = function (npcSeed, song, P) {
    const r = J.rng('npc', npcSeed);
    const dark = P ? P.dark : 0.5;
    // mood picks the scale; the song's key and mode are kept
    const mode = song ? song.mode : 'minor';
    const scale = mode === 'major' ? (dark > 0.7 ? 'mixolydian' : (r.chance(0.3) ? 'lydian' : 'ionian')) : (dark > 0.85 ? 'phrygian' : (dark < 0.35 ? 'dorian' : 'aeolian'));
    const tonic = song ? song.tonic : 9;
    const tonicMidi = 72 + ((tonic + 6) % 12) - 6;
    const n = r.int(5, 8);
    const cells = [[2, 2, 4], [3, 3, 2], [2, 3, 3], [4, 2, 2], [2, 2, 2, 2]];
    const rhythm = []; let t = 0;
    while (rhythm.length < n) { const c = r.pick(cells); for (const d of c) { if (rhythm.length < n) { rhythm.push({ t, d }); t += d; } } }
    // contour: a seeded walk that ends on the tonic or the fifth
    let deg = r.pick([0, 2, 4, 1]); const notes = [];
    for (let i = 0; i < n; i++) {
      notes.push({ t: rhythm[i].t, d: rhythm[i].d, deg });
      deg += r.weighted([-3, -2, -1, 1, 2, 3], d => ({ '-3': 0.4, '-2': 1, '-1': 2, '1': 2, '2': 1, '3': 0.4 }[d]));
      deg = clamp(deg, -2, 8);
    }
    notes[n - 1].deg = r.pick([0, 4, 7]);
    const out = notes.map(x => ({ t: x.t, d: x.d, midi: clamp(J.degreeMidi(tonicMidi, scale, x.deg), 60, 96), deg: x.deg }));
    return { notes: out, scale, tonic, length: out[out.length - 1].t + out[out.length - 1].d };
  };
})(typeof window !== 'undefined' ? window : globalThis);
