#!/usr/bin/env node
// The police bible (story/police/plot/arcs/*.md) to case data (data/cases/<arc>.raw.json): each ledger row as moments
// (one per game day it shows), each moment's clauses as steps with their action and camera text. Who does each step and
// the log line it shows come from a second file per arc (data/cases/<arc>.lines.json, written by hand or by a helper),
// merged by tools/cases/build.js.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), ARCS = path.join(ROOT, 'story', 'police', 'plot', 'arcs'), OUT = path.join(ROOT, 'data', 'cases');
const ACTIONS = new Set('walk run walk-together enter leave stand wait-outside knock-and-wait read-notice point shrug wave chat argue hug hand-over serve queue-order phone-call post-feed sit eat picnic bump carry pick-up share-umbrella watch-hologram police-patrol police-scan arrest escort search stakeout'.split(' '));
const dnum = s => parseInt(s.slice(1), 10);
const errs = [];
function parseArc(file){
  const id = path.basename(file, '.md'), t = fs.readFileSync(file, 'utf8');
  const fm = t.match(/^---\n([\s\S]*?)\n---/), type = fm && (fm[1].match(/^type:\s*(\S+)/m) || [])[1];
  const rows = []; let sect = null;
  for (const line of t.split('\n')){
    const h = line.match(/^## (.*)/); if (h){ const s = h[1].toLowerCase(); sect = s.startsWith('beat ledger') ? 'base' : s.startsWith('careless delta') ? 'careless' : s.startsWith('careful delta') ? 'careful' : null; continue; }
    if (!sect || !/^\| d\d/.test(line)) continue;
    const c = line.split('|').slice(1, -1).map(s => s.trim());
    if (c.length !== 8){ errs.push(id + ': row with ' + c.length + ' cells: ' + line.slice(0, 80)); continue; }
    const [dr, title0, who, where, what, channel, clue, state] = c;
    const dm = dr.match(/^d(\d+)(?:-d(\d+))?$/); if (!dm){ errs.push(id + ': bad day range ' + dr); continue; }
    const lo = +dm[1], hi = +(dm[2] || dm[1]);
    let title = title0, variant = sect, cross = [], loop = null, rel = null, relTo = [];
    title = title.replace(/\[(CAREFUL|CARELESS)\]/g, (m, v) => { variant = v.toLowerCase(); return ''; });
    title = title.replace(/\[x:([a-z0-9-]+)\]/g, (m, x) => { cross.push(x); return ''; });
    title = title.replace(/\[loop:\s*([^\]]+)\]/g, (m, x) => { loop = x.trim(); return ''; });
    title = title.replace(/\((replaces|adds to)\s+([^)]*)\)/g, (m, k, x) => { rel = k === 'replaces' ? 'replaces' : 'adds'; relTo = x; return ''; });
    title = title.replace(/\s+/g, ' ').trim();
    const clauses = what.split(/;\s*/).map(s => s.trim()).filter(Boolean).map(cl => {
      const m = cl.match(/^([a-z-]+):\s*(.*)$/);
      if (!m || !ACTIONS.has(m[1])){ errs.push(id + ' "' + title + '": clause without a known action: ' + cl); return { do: 'stand', raw: cl }; }
      const raw = m[2], days = [...raw.matchAll(/\bd(\d\d)\b/g)].map(x => +x[1]), times = [...raw.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(x => +x[1] + x[2]/60);
      return { do: m[1], raw, day: days[0], time: times[0] };
    });
    // moments: a clause tagged with another day starts the next one
    const moments = []; let cur = null;
    for (const cl of clauses){
      const d = cl.day !== undefined && cl.day >= lo && cl.day <= hi ? cl.day : null;
      if (!cur || (d !== null && cur.day !== null && d !== cur.day)){ cur = { day: d ?? (cur ? cur.day : null), hour: null, steps: [] }; moments.push(cur); }
      if (cur.day === null && d !== null) cur.day = d;
      if (cur.hour === null && cl.time !== undefined) cur.hour = cl.time;
      cur.steps.push({ do: cl.do, raw: cl.raw });
    }
    const tok = s => s === '-' ? [] : s.split(/,\s*/).map(x => x.trim()).filter(Boolean);
    const clues = tok(clue).map(x => { const [k, cid] = x.split(/\s+/); return { k, id: cid }; });
    rows.push({ title, variant, rel, relTo, cross, loop, days: [lo, hi], who: tok(who), where, channel: channel.split(/\s*\+\s*/), clues, sets: tok(state), moments });
  }
  // ids: the arc, then a short slug of the title (twice the same title: numbered)
  const used = {};
  for (const r of rows){ let s = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'beat'; if (r.variant !== 'base') s = r.variant.slice(0, 4) + '-' + s; used[s] = (used[s] || 0) + 1; r.id = used[s] > 1 ? s + '-' + used[s] : s;
    r.moments.forEach((m, k) => { m.id = r.id + '.' + (k + 1); m.steps.forEach((st, j) => st.id = m.id + '.' + (j + 1)); }); }
  // what a variant row replaces or adds to: the base titles its note names
  for (const r of rows) if (r.rel){ const txt = r.relTo.toLowerCase(); r.relTo = rows.filter(o => o.variant === 'base' && txt.includes(o.title.toLowerCase())).map(o => o.id);
    if (!r.relTo.length) errs.push(id + ' "' + r.title + '": ' + r.rel + ' an unknown beat "' + txt + '"'); }
  return { id, type, rows };
}
const files = fs.readdirSync(ARCS).filter(f => f.endsWith('.md') && !f.startsWith('_'));
let nrow = 0, nst = 0;
for (const f of files){
  const a = parseArc(path.join(ARCS, f)); nrow += a.rows.length; for (const r of a.rows) for (const m of r.moments) nst += m.steps.length;
  fs.writeFileSync(path.join(OUT, a.id + '.raw.json'), JSON.stringify(a, null, 1));
}
console.log(files.length + ' arcs, ' + nrow + ' rows, ' + nst + ' steps');
if (errs.length){ console.log(errs.length + ' problems:'); for (const e of errs) console.log('  ' + e); process.exitCode = 1; }
