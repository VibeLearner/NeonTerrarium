// Tempo sweep: for each BPM, compose the same settings and report (a) rule violations, which must stay at zero,
// and (b) how many notes per second each layer plays, so a slider never turns into a wall of notes at a fast tempo
// or into a few lonely notes at a slow one.   node tempo.js [--bars N] [--md file]
'use strict';
const L = require('./lint.js');
const J = globalThis.Jam;
const args = process.argv.slice(2);
const bars = args.includes('--bars') ? +args[args.indexOf('--bars') + 1] : 80;
const mdFile = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;
const BPMS = [70, 100, 130, 174, 200];
const LAYERS = ['lead', 'twinkle', 'keys', 'bass', 'drums'];
// one slider at a time at its extremes, so each slider is checked at each tempo
const SLIDERS = ['energy', 'jazz', 'math', 'emo', 'punk', 'dnb', 'synth', 'dark', 'tempoFeel', 'density'];
const base = { energy: .6, jazz: .4, math: .35, emo: .45, punk: .35, dnb: .65, synth: .6, dark: .55, tempoFeel: .3, density: .6 };
function rate(run) { // notes per second by layer (mean) and the busiest one-second window for lead + twinkle
  const secs = []; let t = 0;
  run.bars.forEach(b => { secs.push(t); t += b.steps * 60 / b.bpm / 4 / b.clock; });
  const total = t, cnt = {}; LAYERS.forEach(l => cnt[l] = 0);
  const times = { lead: [], twinkle: [] };
  run.bars.forEach((b, i) => {
    const sps = 60 / b.bpm / 4 / b.clock;
    b.ev.forEach(ev => {
      const n = ev.l === 'twinkle' && ev.k === 'pluck' ? 1 : (ev.notes ? ev.notes.length : 1);
      if (cnt[ev.l] === undefined) return;
      cnt[ev.l] += n;
      if (times[ev.l]) for (let k = 0; k < n; k++) times[ev.l].push(secs[i] + ev.s * sps);
    });
  });
  const peak = arr => { arr.sort((a, b) => a - b); let best = 0, j = 0; for (let i = 0; i < arr.length; i++) { while (arr[i] - arr[j] >= 1) j++; best = Math.max(best, i - j + 1); } return best; };
  const out = {}; LAYERS.forEach(l => out[l] = cnt[l] / total);
  out.leadPeak = peak(times.lead); out.twPeak = peak(times.twinkle);
  return out;
}
const lines = [];
const rows = {};
for (const bpm of BPMS) {
  const jobs = L.runSet ? [] : [];
  const sets = [];
  L.FIVE.forEach(([sd, p]) => sets.push([sd, Object.assign({}, p, { bpm })]));
  SLIDERS.forEach((k, i) => [0.1, 0.9].forEach(v => sets.push(['sw' + i, Object.assign({}, base, { [k]: v, bpm }), k + '=' + v])));
  const res = L.runSet('new', sets.map(x => [x[0], x[1]]), bars);
  const tot = L.sum(res), sm = L.summarize(tot);
  const rates = sets.map(([sd, p]) => rate(L.compose('new', sd, p, bars)));
  const mean = l => rates.reduce((a, r) => a + r[l], 0) / rates.length;
  const worst = k => Math.max(...rates.map(r => r[k]));
  rows[bpm] = { viol: ['clash', 'nct_strong', 'avoid_strong', 'stale', 'parallel', 'lead_band', 'holders', 'cadence_none_pct', 'density_clash'].map(k => sm[k]), mean: LAYERS.map(mean), leadPeak: worst('leadPeak'), twPeak: worst('twPeak'), motif: sm.motif_bars_per_8, leap: sm.leap_recovery_pct };
}
lines.push('### tempo sweep (new composer, ' + bars + ' bars per run, the five settings plus each slider at 10 and 90)');
lines.push('| BPM | rule violations (clash, nct, avoid, stale, parallel, band, holders, cadence%, density) | lead /s | twinkle /s | keys /s | bass /s | drums /s | busiest second: lead, twinkle | motif per 8 | leap % |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
BPMS.forEach(b => { const r = rows[b]; lines.push('| ' + b + ' | ' + r.viol.join(', ') + ' | ' + r.mean.map(x => x.toFixed(2)).join(' | ') + ' | ' + r.leadPeak + ', ' + r.twPeak + ' | ' + r.motif + ' | ' + r.leap + ' |'); });
console.log(lines.join('\n'));
if (mdFile) require('fs').writeFileSync(mdFile, lines.join('\n') + '\n');
