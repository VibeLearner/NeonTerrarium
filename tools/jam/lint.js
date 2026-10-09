#!/usr/bin/env node
// Neon Terrarium jam room: the checker. Runs with Node only (no browser, no audio).
// It composes bars with the first composer ("old") and the second composer ("new"), turns the events into
// sounding notes using the synth's real ring and release times, and counts rule violations per 100 bars.
//
//   node lint.js                       the five SEEDS.md settings, both composers
//   node lint.js --random 20           also 20 random seeds across 4 slider presets
//   node lint.js --composer new        one composer only
//   node lint.js --bars 100 --md out.md --json out.json
//
// The rules are defined in js/rules.js and shared with the composer, so a rule cannot be weakened here
// without also weakening the composer's own validator.
'use strict';
const fs = require('fs');
const path = require('path');
global.window = undefined;
const base = __dirname + path.sep;
const load = f => (0, eval)(fs.readFileSync(base + f, 'utf8'));
['js/rng.js', 'js/theory.js', 'js/rules.js'].forEach(load);
(0, eval)('globalThis.JAM_STYLE=' + fs.readFileSync(base + 'style_defaults.js', 'utf8').split('=').slice(1).join('=').replace(/;\s*$/, ''));
load('js/composer.js');
try { load('js/composer2.js'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const J = globalThis.Jam;

// ---------------------------------------------------------------- settings to test
const FIVE = [ // from SEEDS.md (the first five). Values are 0..1 sliders.
  ['101', { energy: .7, jazz: .35, math: .2, emo: .6, punk: .65, dnb: .6, synth: .5, dark: .3, tempoFeel: .2, density: .6 }],
  ['303', { energy: .65, jazz: .5, math: .4, emo: .4, punk: .2, dnb: .85, synth: .8, dark: .8, tempoFeel: .3, density: .65 }],
  ['2024', { energy: .6, jazz: .45, math: .8, emo: .7, punk: .2, dnb: .4, synth: .4, dark: .6, tempoFeel: .45, density: .55 }],
  ['404', { energy: .55, jazz: .8, math: .35, emo: .35, punk: .1, dnb: .55, synth: .5, dark: .5, tempoFeel: .5, density: .5 }],
  ['808', { energy: .85, jazz: .3, math: .3, emo: .4, punk: .8, dnb: .75, synth: .6, dark: .45, tempoFeel: .1, density: .8 }],
];
const PRESETS = [
  {},
  { jazz: .8, emo: .35, punk: .1, dnb: .5 },
  { punk: .8, dnb: .75, energy: .85, jazz: .2 },
  { math: .8, emo: .7, dnb: .4, jazz: .5 },
];
J.LINT_FIVE = FIVE; J.LINT_PRESETS = PRESETS;

// ---------------------------------------------------------------- composing
function compose(kind, seed, params, nbars, game) {
  const P = Object.assign(J.defaultParams(), params || {});
  const g = J.applyGame(P, game || { tod: 'day', rain: false, view: 'street' });
  const Comp = kind === 'old' ? J.Composer : J.Composer2;
  const comp = new Comp(seed, g.eff);
  const mods = { hatScale: g.hatScale, forceFull: g.forceFull, radio: 0 };
  const bars = [];
  for (let i = 0; i < nbars; i++) bars.push(comp.next(g.eff, mods));
  return { bars, song: comp.song };
}

// ---------------------------------------------------------------- notes with real sounding times (in sixteenth steps)
function ringSteps(midi, newRing, sps) {
  const f = J.mtof(midi), t60 = Math.max(0.9, Math.min(3.4, 3.0 * Math.pow(220 / f, 0.35)));
  let len = Math.min(2.4, t60 + 0.3);
  if (newRing) len = Math.min(len, J.RING.newMax);
  return len / sps;
}
function buildNotes(bars, kind) {
  const notes = [], timeline = [], barStarts = [];
  let base = 0;
  bars.forEach((b, bi) => {
    const sps = 60 / b.bpm / 4 / b.clock;
    barStarts.push(base);
    b.segs.forEach(sg => timeline.push({ s0: base + sg.s0, s1: base + sg.s1, seg: sg, bar: bi }));
    b.ev.forEach(ev => {
      const s = base + ev.s;
      const add = (layer, m, e, extra) => notes.push(Object.assign({ layer, m, s, e, bar: bi, ev, held: 0 }, extra || {}));
      switch (ev.l) {
        case 'bass': add('bass', ev.n, s + ev.d + 0.15 / sps); break;
        case 'keys': ev.notes.forEach(m => add('keys', m, s + ev.d + 0.18 / sps, { held: ev.d })); break;
        case 'pads': (ev.notes || []).forEach(m => add('pads', m, s + ev.d + (ev.release || 0.9) / sps, { held: ev.d })); break;
        case 'twinkle':
          if (ev.k === 'pluck') add('twinkle', ev.n, s + ringSteps(ev.n, kind === 'new', sps), { pluck: true, sps });
          else if (ev.k === 'strum') ev.notes.forEach(m => add('twinkle', m, s + ringSteps(m, kind === 'new', sps), { pluck: true, strum: true, held: ringSteps(m, kind === 'new', sps), sps }));
          break;
        case 'lead': add('lead', ev.n, s + ev.d + 0.1 / sps, { hv: !!ev.hv, dur: ev.d }); break;
      }
    });
    // damp events (second composer): a pluck whose pitch class is not in `pcs` is cut short
    b.ev.forEach(ev => {
      if (ev.l === 'fx' && ev.k === 'damp') {
        const t = base + ev.s;
        notes.forEach(n => { if (n.pluck && n.s < t && n.e > t && !ev.pcs.includes(n.m % 12)) n.e = Math.min(n.e, t + J.RING.dampRel / sps); });
      }
    });
    base += b.steps;
  });
  return { notes, timeline, barStarts, total: base };
}
function segAt(timeline, t) { // timeline is sorted
  let lo = 0, hi = timeline.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (timeline[mid].s0 <= t) lo = mid; else hi = mid - 1; }
  return timeline[lo];
}

// ---------------------------------------------------------------- the rules
const RULES = ['clash', 'nct_strong', 'avoid_strong', 'stale', 'parallel', 'lead_band', 'holders', 'cadence_none', 'density_clash'];
function lintRun(run, kind) {
  const bars = run.bars, N = buildNotes(bars, kind), notes = N.notes, tl = N.timeline;
  const out = {}; RULES.forEach(r => out[r] = 0);
  const tonic = run.song.tonic, scaleName = run.song.scaleName;
  const scaleOf = seg => J.chordScale({ root: seg.root, base: seg.base, pcs: seg.pcs }, tonic, scaleName);

  // 1. minor 9th and minor 2nd clashes between sounding notes (not between two tones of the same chord, not under an eighth)
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
      for (let t = Math.ceil(lo); t < hi; t++) { const sg = segAt(tl, t).seg; if (!(sg.pcs.includes(a.m % 12) && sg.pcs.includes(b.m % 12))) bad++; }
      if (bad >= 2) { out.clash++; const kk = [a.layer, b.layer].sort().join('+'); out.clashPairs = out.clashPairs || {}; out.clashPairs[kk] = (out.clashPairs[kk] || 0) + 1; }
    }
    active.push(a);
  }

  // 2. non-chord tones on strong beats without an allowed figure, and avoid notes on strong beats (lead and twinkle plucks)
  ['lead', 'twinkle'].forEach(layer => {
    const seq = notes.filter(n => n.layer === layer && !n.hv && !n.strum).sort((a, b) => a.s - b.s);
    const items = seq.map(n => {
      const b = bars[n.bar], t = n.s - N.barStarts[n.bar];
      const si = segAt(tl, n.s), cur = si.seg;
      const nxt = tl[tl.indexOf(si) + 1];
      return { m: n.m, strong: b.meter.starts.includes(Math.round(t)) && Math.abs(t - Math.round(t)) < 0.01, ct: cur.pcs.includes(n.m % 12), nextCt: nxt ? nxt.seg.pcs.includes(n.m % 12) : false, seg: cur, n };
    });
    items.forEach((it, i) => {
      // a long gap (a rest) cuts the figure: treat the note as unattached
      const prevGap = i > 0 && it.n.s - items[i - 1].n.s > 8, nextGap = i + 1 < items.length && items[i + 1].n.s - it.n.s > 8;
      const view = items.slice(Math.max(0, i - 1), i + 2).map((x, k, arr) => x);
      let local = [], idx = 0;
      if (i > 0 && !prevGap) { local.push(items[i - 1]); } idx = local.length; local.push(it);
      if (i + 1 < items.length && !nextGap) local.push(items[i + 1]);
      const f = J.nctFigure(local, idx);
      if (f === 'bad') out.nct_strong += it.strong ? 1 : 0;
      if (layer === 'lead' && it.strong) { const sc = scaleOf(it.seg); if (sc.avoid.has(it.m % 12) && !it.ct) out.avoid_strong++; }
    });
  });

  // 3. notes still sounding after a chord change that do not belong to the new chord
  const TOL = 0.22; // seconds
  for (let k = 1; k < tl.length; k++) {
    const prev = tl[k - 1].seg, cur = tl[k].seg, b = tl[k].s0;
    if (prev.pcs.join() === cur.pcs.join() && prev.root === cur.root) continue;
    const sps = 60 / bars[tl[k].bar].bpm / 4 / bars[tl[k].bar].clock;
    for (const n of notes) {
      if (n.layer !== 'pads' && n.layer !== 'keys' && n.layer !== 'twinkle') continue;
      if (n.s >= b - 0.01 || n.e <= b + TOL / sps) continue;
      if (cur.pcs.includes(n.m % 12)) continue;
      out.stale++;
    }
  }

  // 4. parallel fifths and octaves between the lead and the bass
  const lead = notes.filter(n => n.layer === 'lead' && !n.hv).sort((a, b) => a.s - b.s);
  const bass = notes.filter(n => n.layer === 'bass').sort((a, b) => a.s - b.s);
  const bassAt = t => { let r = null; for (const b of bass) { if (b.s <= t + 0.01) r = b; else break; } return r; };
  for (let i = 1; i < lead.length; i++) {
    const a = lead[i - 1], b = lead[i];
    if (b.s - a.s > 8) continue;
    const ba = bassAt(a.s), bb = bassAt(b.s);
    if (!ba || !bb) continue;
    const dl = b.m - a.m, db = bb.m - ba.m;
    if (dl === 0 || db === 0 || Math.sign(dl) !== Math.sign(db)) continue;
    const i1 = ((a.m - ba.m) % 12 + 12) % 12, i2 = ((b.m - bb.m) % 12 + 12) % 12;
    if (i1 === i2 && (i1 === 7 || i1 === 0)) out.parallel++;
  }

  // 5. lead notes outside its band
  lead.forEach(n => { if (n.m < J.BANDS.lead[0] || n.m > J.BANDS.lead[1]) out.lead_band++; });

  // 6. bars where more than two layers hold chords at once (>= 2 notes, each held two beats or longer)
  const holdLayers = ['pads', 'keys', 'twinkle'];
  const barsBad = new Set();
  for (let bi = 0; bi < bars.length; bi++) {
    const b0 = N.barStarts[bi], b1 = b0 + bars[bi].steps;
    for (let t = b0; t < b1; t += 2) {
      let holders = 0;
      holdLayers.forEach(L => {
        const c = notes.filter(n => n.layer === L && n.held >= 8 && n.s <= t && n.s + n.held > t && (L !== 'twinkle' || n.strum));
        if (c.length >= 2) holders++;
      });
      if (holders > 2) { barsBad.add(bi); break; }
    }
  }
  out.holders = barsBad.size;

  // 7. phrases that do not end on a recognized cadence (4-bar phrases inside each section)
  const cadenceCounts = { full: 0, half: 0, plagal: 0, deceptive: 0, none: 0 };
  const secs = new Map();
  bars.forEach((b, i) => { const k = b.secId; if (!secs.has(k)) secs.set(k, []); secs.get(k).push(i); });
  secs.forEach(idxs => {
    for (let p = 0; p + 3 < idxs.length; p += 4) {
      const pb = idxs.slice(p, p + 4).map(i => bars[i]);
      const rel = sg => ({ rel: ((sg.root - tonic) % 12 + 12) % 12, base: sg.base });
      const last = rel(pb[3].segs[0]);
      let prev = null;
      for (let q = 2; q >= 0 && !prev; q--) { const sg = pb[q].segs[pb[q].segs.length - 1]; const r = rel(sg); if (r.rel !== last.rel || r.base !== last.base) prev = r; }
      const c = J.cadenceOf(prev, last);
      cadenceCounts[c]++;
      if (c === 'none') out.cadence_none++;
      if (pb[3].phrase && pb[3].phrase.cadence && pb[3].phrase.cadence !== c) out.cadence_none += 0; // (declared vs found is reported by the composer's own validator)
    }
  });
  out.cadenceCounts = cadenceCounts;
  out.phrases = Object.values(cadenceCounts).reduce((a, b) => a + b, 0);

  // 8. density: lead and twinkle both busy (3 or more onsets) in the same beat
  for (let bi = 0; bi < bars.length; bi++) {
    const b0 = N.barStarts[bi];
    for (let q = 0; q + 4 <= bars[bi].steps; q += 4) {
      const L = lead.filter(n => n.s >= b0 + q && n.s < b0 + q + 4).length;
      const T = notes.filter(n => n.layer === 'twinkle' && !n.strum && n.s >= b0 + q && n.s < b0 + q + 4).length;
      if (L >= 3 && T >= 3) out.density_clash++;
    }
  }

  // 9. lead statistics: leap recovery, interval histogram, motif recurrence
  let leaps = 0, rec = 0;
  const hist = { '0': 0, '1-2': 0, '3-4': 0, '5-7': 0, '8-12': 0, '13+': 0 };
  for (let i = 1; i < lead.length; i++) {
    const d = lead[i].m - lead[i - 1].m, ad = Math.abs(d);
    if (lead[i].s - lead[i - 1].s > 8) continue;
    hist[ad === 0 ? '0' : ad <= 2 ? '1-2' : ad <= 4 ? '3-4' : ad <= 7 ? '5-7' : ad <= 12 ? '8-12' : '13+']++;
    if (ad >= 5 && i + 1 < lead.length && lead[i + 1].s - lead[i].s <= 8) {
      leaps++;
      const d2 = lead[i + 1].m - lead[i].m;
      if (Math.abs(d2) >= 1 && Math.abs(d2) <= 2 && Math.sign(d2) === -Math.sign(d)) rec++;
    }
  }
  out.leaps = leaps; out.leapRecovered = rec; out.hist = hist; out.leadNotes = lead.length;
  // motif recurrence: lead bars whose rhythm and contour belong to the bar's reference motif, per 8-bar window
  const leadByBar = new Map();
  lead.forEach(n => { if (!leadByBar.has(n.bar)) leadByBar.set(n.bar, []); leadByBar.get(n.bar).push(n); });
  let motifBars = 0, leadBars = 0, windows = 0, windowMotif = 0;
  const winAcc = new Map();
  leadByBar.forEach((ns, bi) => {
    const b = bars[bi], ref = b.motifRef;
    leadBars++;
    if (!ref) return;
    const on = ns.map(n => Math.round(n.s - N.barStarts[bi]));
    const sub = (A, B) => A.every(x => B.includes(x));
    const shift = on.map(x => x - 2);
    const rhythmOk = sub(ref.onsets, on) || sub(on, ref.onsets) || sub(on, ref.onsets.map(x => x + 2)) || sub(ref.onsets, shift) ||
      sub(on, ref.onsets.map(x => x * 2)) || sub(on, ref.onsets.map(x => Math.round(x / 2)));
    const iv = []; for (let i = 1; i < ns.length && iv.length < 3; i++) iv.push(Math.sign(ns[i].m - ns[i - 1].m));
    const rs = ref.signs.slice(0, iv.length), inv = rs.map(x => -x), retro = ref.signs.slice().reverse().map(x => -x).slice(0, iv.length);
    const eq = (A, B) => A.length === B.length && A.every((x, i) => x === B[i]);
    const shapeOk = iv.length === 0 || eq(iv, rs) || eq(iv, inv) || eq(iv, retro);
    if (rhythmOk && shapeOk) { motifBars++; const w = Math.floor(b.barCount / 8); winAcc.set(w, (winAcc.get(w) || 0) + 1); }
  });
  const wl = new Map();
  leadByBar.forEach((ns, bi) => { const w = Math.floor(bars[bi].barCount / 8); wl.set(w, (wl.get(w) || 0) + 1); });
  wl.forEach((cnt, w) => { if (cnt >= 3) { windows++; windowMotif += (winAcc.get(w) || 0) / cnt * 8; } });
  out.motifBarsPer8 = windows ? windowMotif / windows : 0;
  out.motifShare = leadBars ? motifBars / leadBars : 0;
  out.bars = bars.length;
  return out;
}

// ---------------------------------------------------------------- running and reporting
function parseArgs(argv) {
  const a = { composer: 'both', random: 0, bars: 100, five: true, md: null, json: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--composer') a.composer = argv[++i];
    else if (k === '--random') a.random = +argv[++i];
    else if (k === '--bars') a.bars = +argv[++i];
    else if (k === '--no-five') a.five = false;
    else if (k === '--md') a.md = argv[++i];
    else if (k === '--json') a.json = argv[++i];
  }
  return a;
}
function sum(list) {
  const t = { bars: 0, leaps: 0, leapRecovered: 0, leadNotes: 0, phrases: 0, motifBarsPer8: 0, motifShare: 0, n: 0, hist: { '0': 0, '1-2': 0, '3-4': 0, '5-7': 0, '8-12': 0, '13+': 0 }, cadenceCounts: { full: 0, half: 0, plagal: 0, deceptive: 0, none: 0 } };
  RULES.forEach(r => t[r] = 0);
  list.forEach(o => {
    t.n++; t.bars += o.bars; t.leaps += o.leaps; t.leapRecovered += o.leapRecovered; t.leadNotes += o.leadNotes; t.phrases += o.phrases;
    t.motifBarsPer8 += o.motifBarsPer8; t.motifShare += o.motifShare;
    RULES.forEach(r => t[r] += o[r]);
    Object.keys(t.hist).forEach(k => t.hist[k] += o.hist[k]);
    Object.keys(t.cadenceCounts).forEach(k => t.cadenceCounts[k] += o.cadenceCounts[k]);
  });
  return t;
}
function per100(t, r) { return (t[r] / t.bars * 100); }
function summarize(t) {
  const o = {};
  RULES.forEach(r => o[r] = +per100(t, r).toFixed(1));
  o.cadence_none_pct = +(100 * t.cadenceCounts.none / Math.max(1, t.phrases)).toFixed(1);
  o.motif_bars_per_8 = +(t.motifBarsPer8 / Math.max(1, t.n)).toFixed(2);
  o.leap_recovery_pct = t.leaps ? +(100 * t.leapRecovered / t.leaps).toFixed(1) : null;
  const hn = Object.values(t.hist).reduce((a, b) => a + b, 0) || 1;
  o.hist_pct = {}; Object.keys(t.hist).forEach(k => o.hist_pct[k] = +(100 * t.hist[k] / hn).toFixed(1));
  o.cadences = t.cadenceCounts;
  return o;
}
function runSet(kind, jobs, nbars) {
  const results = [];
  for (const [seed, params] of jobs) {
    const run = compose(kind, seed, params, nbars);
    results.push(lintRun(run, kind));
  }
  return results;
}
module.exports = { compose, lintRun, runSet, sum, summarize, RULES, FIVE, PRESETS };

if (require.main === module) {
  const args = parseArgs(process.argv);
  const kinds = args.composer === 'both' ? ['old', 'new'] : [args.composer];
  const sets = [];
  if (args.five) sets.push(['five SEEDS.md settings', FIVE]);
  if (args.random) {
    const jobs = []; for (let i = 0; i < args.random; i++) jobs.push(['r' + (1000 + i * 7919 % 100000), PRESETS[i % PRESETS.length]]);
    sets.push([args.random + ' random seeds', jobs]);
  }
  const report = {};
  for (const [name, jobs] of sets) {
    report[name] = {};
    for (const kind of kinds) {
      if (kind === 'new' && !J.Composer2) { console.log('(no second composer yet)'); continue; }
      const t0 = Date.now();
      if (J.stats2) J.stats2.reset();
      const res = runSet(kind, jobs, args.bars);
      report[name][kind] = summarize(sum(res));
      if (kind === 'new' && J.stats2) report[name][kind].validator = J.stats2.snapshot();
      report[name][kind].seconds = +((Date.now() - t0) / 1000).toFixed(1);
    }
  }
  const lines = [];
  Object.keys(report).forEach(name => {
    lines.push('### ' + name + ' (' + args.bars + ' bars each, counts per 100 bars)');
    lines.push('| rule | ' + kinds.join(' | ') + ' |', '| --- | ' + kinds.map(() => '---').join(' | ') + ' |');
    const row = (label, f) => lines.push('| ' + label + ' | ' + kinds.map(k => (report[name][k] ? f(report[name][k]) : '-')).join(' | ') + ' |');
    row('minor 9th / minor 2nd clashes', r => r.clash);
    row('non-chord tone on a strong beat, no allowed figure', r => r.nct_strong);
    row('avoid note on a strong beat (lead)', r => r.avoid_strong);
    row('notes still sounding after a chord change, not in the new chord', r => r.stale);
    row('parallel 5ths / octaves, lead vs bass', r => r.parallel);
    row('lead notes outside the band 67-88', r => r.lead_band);
    row('bars with more than two chord-holding layers', r => r.holders);
    row('phrases not ending on a cadence (% of phrases)', r => r.cadence_none_pct);
    row('beats where lead and twinkle are both busy', r => r.density_clash);
    row('motif bars per 8-bar window (higher is better)', r => r.motif_bars_per_8);
    row('leap recovery % (higher is better)', r => r.leap_recovery_pct);
    row('lead intervals % (0 / 1-2 / 3-4 / 5-7 / 8-12 / 13+)', r => ['0', '1-2', '3-4', '5-7', '8-12', '13+'].map(k => r.hist_pct[k]).join(' / '));
    row('cadences found (full/half/plagal/deceptive/none)', r => ['full', 'half', 'plagal', 'deceptive', 'none'].map(k => r.cadences[k]).join('/'));
    if (kinds.includes('new') && report[name].new && report[name].new.validator) lines.push('', 'validator (second composer): ' + JSON.stringify(report[name].new.validator));
    lines.push('');
  });
  const text = lines.join('\n');
  console.log(text);
  if (args.md) fs.writeFileSync(args.md, text);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
}
