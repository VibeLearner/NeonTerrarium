#!/usr/bin/env node
// data/cases/<arc>.raw.json (the ledger, from convert.js) + data/cases/<arc>.lines.json (who does each step and the line it logs)
// -> data/cases/<arc>.json, what the game loads (js/cases.js), and data/cases/index.json. Checks as it goes.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'data', 'cases');
const OFFICERS = { 'inside-officer': 'A', 'framed-officer': 'B', 'veteran-officer': 'C', 'rookie-officer': 'D', 'family-caller-officer': 'E', 'burnout-officer': 'F', 'desk-sergeant': 'G', 'night-stakeout-officer': 'H' };
const NS = { boss: ['boss-careless', 'boss-careful'], g1: ['go-between-courier'], g2: ['go-between-clerk'], g3: ['go-between-bartender'], inf: ['informant'], rh1: ['red-herring-night-courier'], rh2: ['red-herring-bath-regular'], rh3: ['red-herring-stall-neighbor'] };
for (const [id, L] of Object.entries(OFFICERS)) NS[L] = [id];
const BANNED = /\b(thinks|knows|realizes|decides|suspects|fears|hopes|believes|remembers|wants|plans to|secretly|guilty|the boss|informant|go-between|insider)\b/i;
const errs = [], warn = [];
const index = [];
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.raw.json'))){
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), arc = raw.id;
  const lf = path.join(DIR, arc + '.lines.json'); if (!fs.existsSync(lf)){ warn.push(arc + ': no lines yet'); continue; }
  const L = JSON.parse(fs.readFileSync(lf, 'utf8'));
  const slots = Object.assign({}, L.slots || {});
  const rows = raw.rows.map(r => ({
    id: r.id, title: r.title, variant: r.variant, rel: r.rel, relTo: r.relTo, cross: r.cross, loop: r.loop, days: r.days, where: r.where, channel: r.channel, clues: r.clues, sets: r.sets,
    moments: r.moments.map(m => {
      const steps = m.steps.map(st => {
        const x = L.steps[st.id]; if (!x){ errs.push(arc + ' ' + st.id + ': no line'); return null; }
        const who = [].concat(x.who || []), wit = [].concat(x.with || []);
        if (!who.length) errs.push(arc + ' ' + st.id + ': nobody does it');
        for (const id of [...who, ...wit]) if (!OFFICERS[id] && id !== 'inside-officer-extra' && !slots[id]) errs.push(arc + ' ' + st.id + ': ' + id + ' has no slot');
        for (const [, id] of (x.line || '').matchAll(/\{([a-z0-9:-]+)(?:\.(?:he|him|his))?\}/g)) if (!who.includes(id) && !wit.includes(id)) errs.push(arc + ' ' + st.id + ': {' + id + '} is not in the step');
        if (BANNED.test((x.line || '').replace(/\{[^}]*\}/g, ' '))) errs.push(arc + ' ' + st.id + ': banned word: ' + x.line);
        if (/—/.test(x.line || '')) errs.push(arc + ' ' + st.id + ': em dash');
        const o = { id: st.id, do: st.do, who, with: wit, line: x.line };
        if (x.held) o.held = x.held; if (x.stay) o.stay = true; return o;
      }).filter(Boolean);
      const ppl = []; for (const s of steps) for (const id of [...s.who, ...s.with]) if (!ppl.includes(id)) ppl.push(id);
      if (ppl.length > 6) warn.push(arc + ' ' + m.id + ': ' + ppl.length + ' people (the game stages the first 6)');
      return { id: m.id, day: m.day, hour: m.hour, people: ppl, steps };
    })
  }));
  // flags: which slot each namespace means in this arc
  for (const r of rows) for (const fl of r.sets){ const ns = fl.split(':')[0]; if (!NS[ns] && !['station2', 'case', 'G'].includes(ns) && !/^s\d$/.test(ns)) warn.push(arc + ' ' + r.id + ': flag namespace ' + ns); }
  const out = { id: arc, type: raw.type, slots, rows };
  fs.writeFileSync(path.join(DIR, arc + '.json'), JSON.stringify(out));
  index.push({ id: arc, type: raw.type, rows: rows.length, steps: rows.reduce((n, r) => n + r.moments.reduce((k, m) => k + m.steps.length, 0), 0) });
}
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ officers: OFFICERS, ns: NS, arcs: index }, null, 1));
console.log(index.map(a => a.id + ' ' + a.steps).join(', '));
if (warn.length) console.log('notes:\n  ' + warn.join('\n  '));
if (errs.length){ console.log(errs.length + ' problems:\n  ' + errs.slice(0, 60).join('\n  ')); process.exitCode = 1; }
