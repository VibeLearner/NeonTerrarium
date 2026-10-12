#!/usr/bin/env node
// Validates the story database (data/stories/) against tools/stories/SCHEMA.md.
// Usage: node tools/stories/validate.js [--stats] [--quiet] [--base <git ref>]
// Exit code 1 if there are errors. Warnings never fail the run.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'stories');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const PARTIAL = args.includes('--partial');   // while the database is still being written: skip the whole-database checks
const STATS = args.includes('--stats');
const baseIx = args.indexOf('--base');
const BASE = baseIx >= 0 ? args[baseIx + 1] : 'origin/main';

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const vocab = readJSON(path.join(DATA, 'vocab.json'));

// ---------- load ----------
const files = fs.readdirSync(DATA).filter(f => /^\d\d-.+\.json$/.test(f)).sort();
const catById = new Map(vocab.categories.map(c => [c.id, c]));
const stories = [];            // all storylets, with .cat
const byId = new Map();
for (const f of files) {
  let d;
  try { d = readJSON(path.join(DATA, f)); } catch (e) { err(f, 'invalid JSON: ' + e.message); continue; }
  const m = f.match(/^\d\d-(.+)\.json$/);
  if (d.category !== m[1]) err(f, `category "${d.category}" does not match the file name`);
  if (!catById.has(d.category)) { err(f, `unknown category "${d.category}"`); continue; }
  if (!d.title || !d.theme) err(f, 'category file needs title and theme');
  if (!Array.isArray(d.storylets)) { err(f, 'no storylets array'); continue; }
  for (const s of d.storylets) {
    s.cat = d.category; stories.push(s);
    // defaults (documented in SCHEMA.md)
    if (s.unwatched === undefined) s.unwatched = false;
    if (s.when && typeof s.when === 'object') { if (s.when.weight === undefined) s.when.weight = 5; if (s.when.cooldown === undefined) s.when.cooldown = { person: 24, city: 1 }; }
    for (const b of Array.isArray(s.beats) ? s.beats : []) if (b && b.indoors === undefined) b.indoors = false;
  }
}
if (!PARTIAL) for (const c of vocab.categories) if (!files.some(f => f.endsWith(`-${c.id}.json`))) err(c.id, 'no file for this category');

// ---------- helpers ----------
const ACTIONS = vocab.actions;
const PLACES = vocab.places;
const ROLE_RE = /^[A-F]$/;
const FLAG_RE = /^(city|world|single|[A-F](\+[A-F])?):[a-z0-9]+(-[a-z0-9]+)*$/;
const flagKey = f => { const [sc, name] = f.split(':'); return (sc === 'city' ? 'city' : sc === 'world' ? 'world' : sc.includes('+') ? 'pair' : 'single') + ':' + name; };
const flagScopeRoles = f => { const sc = f.split(':')[0]; return /^[A-F](\+[A-F])?$/.test(sc) ? sc.split('+') : []; };
const isNum = x => typeof x === 'number' && isFinite(x);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = list => new RegExp('(?<![A-Za-z])(' + list.map(esc).join('|') + ')(?![A-Za-z])', 'i');
const THOUGHT_RE = wordRe(vocab.thoughtWords);
const CONCL_RE = wordRe(vocab.conclusionWords);
const ATTR_RE = wordRe(vocab.attributionVerbs);
const REL_RE = wordRe(vocab.relationWords);
const BRIT = vocab.britishSpellings;
const BRIT_RE = new RegExp('(?<![A-Za-z])(' + Object.keys(BRIT).map(esc).join('|') + ')(?![A-Za-z])', 'i');
const EXEMPT = [
  /wanted (poster|posters|notice|notices|sign|signs)/gi,
  /miss(es|ed)? (the|a|his|her|their|it|an)( last| next)? (train|metro|car|lift|stall|shift|closing|door|bell|bus|queue|drop-off|platform|cab)/gi,
  /\bthe (west|east|north|south) (side )?(of )?the/gi
];
const STRICT = new Set(['enter', 'leave', 'receive-delivery', 'hand-over', 'hug', 'argue', 'phone-call', 'post-feed', 'knock-and-wait', 'dance', 'throw-up', 'umbrella', 'club-queue', 'club-enter', 'club-turned-away', 'mug', 'flee', 'arrest', 'ride-metro', 'ride-lift', 'feed-stray', 'water-plant', 'wave', 'read-notice', 'picnic', 'soak', 'share-umbrella']);

const seenLines = new Map();    // normalized -> id
const openers = new Map();      // first five words -> count

function stripQuotes(s) { return s.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ').replace(/'[^']{2,}'/g, m => (/^'[^']*[a-z]{2}[^']*'$/.test(m) && !/\w'\w/.test(m) ? ' ' : m)); }

// kind: 'log' | 'reveal' | 'hearsay' | 'entry'
function checkText(id, where, s, kind, roles, beatRoles) {
  const at = `${where}: "${s.length > 70 ? s.slice(0, 67) + '...' : s}"`;
  if (typeof s !== 'string' || !s.trim()) { err(id, `${where}: empty or non-string line`); return; }
  if (s !== s.trim()) err(id, `${at} has leading or trailing space`);
  if (/[—–]|--/.test(s)) err(id, `${at} has a dash that is not allowed (em dash, en dash or --)`);
  if (!/[.?!"”)]$/.test(s)) err(id, `${at} does not end in punctuation`);
  if (/^[a-z]/.test(s)) err(id, `${at} starts lowercase`);
  if (/^\d{1,2}:\d{2}/.test(s)) err(id, `${at} starts with a timestamp (the game adds it)`);
  const brit = s.match(BRIT_RE);
  if (brit) err(id, `${at} uses British spelling "${brit[1]}" (use "${BRIT[brit[1].toLowerCase()]}")`);
  if (s.length > 220) warn(id, `${at} is long (${s.length} chars); the voice is terse`);
  // placeholders
  const phs = [...s.matchAll(/\{([^}]*)\}/g)].map(m => m[1]);
  for (const ph of phs) {
    const m = ph.match(/^([A-F])(?:\.(desc|he|him|his|first|full|rel|nick|job|employer|home|age))?$/);
    if (m) {
      if (!roles.has(m[1])) { err(id, `${at} uses {${ph}} but there is no role ${m[1]}`); continue; }
      if (['first', 'full', 'rel', 'nick', 'job', 'employer', 'home', 'age'].includes(m[2]) && kind !== 'reveal' && kind !== 'hearsay' && kind !== 'entry') err(id, `${at} uses {${ph}}, which is only valid in reveal, hearsay and entry lines`);
      if (kind === 'log' && beatRoles && m[1] !== 'A' && !beatRoles.has(m[1])) err(id, `${at} names role ${m[1]}, which is not in this beat's who/with`);
      continue;
    }
    if (['place', 'place2', 'n', 'item'].includes(ph)) continue;
    if (['S', 'L'].includes(ph)) { if (kind !== 'hearsay' && kind !== 'entry') err(id, `${at} uses {${ph}} outside hearsay`); continue; }
    err(id, `${at} has unknown placeholder {${ph}}`);
  }
  // text without placeholders, for the word checks
  let t = s.replace(/\{[^}]*\}/g, 'X');
  for (const e of EXEMPT) t = t.replace(e, ' ');
  const sentences = stripQuotes(t).split(/(?<=[.!?])\s+/);
  for (const sent of sentences) {
    const bare = sent;
    for (const [re, label] of [[THOUGHT_RE, 'a thought or inner state'], [CONCL_RE, 'a conclusion']]) {
      const m = bare.match(re);
      if (!m) continue;
      const av = bare.match(ATTR_RE);
      const attributed = av && av.index < m.index;
      if (!attributed) err(id, `${at} states ${label} ("${m[1]}") outside speech or a post`);
    }
  }
  // repetition
  const norm = s.toLowerCase().replace(/\{[^}]*\}/g, 'x').replace(/\s+/g, ' ').trim();
  if (seenLines.has(norm)) err(id, `${at} repeats a line already used in ${seenLines.get(norm)}`);
  else seenLines.set(norm, id);
  const op = norm.split(' ').slice(0, 5).join(' ');
  openers.set(op, (openers.get(op) || 0) + 1);
}

// ---------- per storylet ----------
const flagSetters = new Map();   // flagKey -> [ids]
const flagUsers = new Map();     // flagKey -> [ids] (requires)
const usage = { actions: {}, channels: {}, newActions: {}, facts: {} };
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

for (const s of stories) {
  const id = s.id || '(no id)';
  const cat = catById.get(s.cat);
  // basics
  if (typeof s.id !== 'string' || !new RegExp(`^${cat.prefix}\\.[a-z0-9]+(-[a-z0-9]+)*$`).test(s.id)) err(id, `id must look like ${cat.prefix}.some-slug`);
  if (byId.has(s.id)) err(id, 'duplicate id'); else byId.set(s.id, s);
  if (!s.title || typeof s.title !== 'string') err(id, 'missing title');
  if (!vocab.tiers.includes(s.tier)) err(id, `bad tier "${s.tier}"`);
  if (typeof s.unwatched !== 'boolean') err(id, 'unwatched must be true or false');
  // roles
  const roles = new Set();
  if (!s.roles || typeof s.roles !== 'object' || !s.roles.A) err(id, 'roles must include A (the watched subject)');
  else {
    for (const [r, spec] of Object.entries(s.roles)) {
      if (!ROLE_RE.test(r)) { err(id, `bad role key "${r}"`); continue; }
      roles.add(r);
      if (typeof spec !== 'object' || spec === null) { err(id, `role ${r} must be an object`); continue; }
      for (const n of spec.needs || []) if (!vocab.needs.includes(n)) err(id, `role ${r}: unknown need "${n}"`);
      if (spec.rel !== undefined) {
        const m = String(spec.rel).match(/^([a-z-]+):([A-F])$/);
        if (!m) err(id, `role ${r}: rel must look like sibling-of:A`);
        else {
          if (!vocab.relationKinds.includes(m[1])) err(id, `role ${r}: unknown relation kind "${m[1]}"`);
          if (!s.roles[m[2]]) err(id, `role ${r}: rel points at missing role ${m[2]}`);
          if (m[2] === r) err(id, `role ${r}: rel points at itself`);
        }
      }
      if (r !== 'A' && !spec.rel && !(s.ambiguous && s.fairPlay && s.fairPlay.subject === r)) warn(id, `role ${r} has no rel to another role`);
      if (!spec.desc || typeof spec.desc !== 'string') err(id, `role ${r} needs a desc (what it is, in words)`);
    }
  }
  const checkFlag = (f, where, mustRoles = true) => {
    if (typeof f !== 'string' || !FLAG_RE.test(f)) { err(id, `${where}: bad flag "${f}"`); return false; }
    if (mustRoles) for (const r of flagScopeRoles(f)) if (!roles.has(r)) { err(id, `${where}: flag "${f}" uses missing role ${r}`); return false; }
    return true;
  };
  // when
  const w = s.when;
  if (!w || typeof w !== 'object') err(id, 'missing when');
  else {
    if (w.hours !== undefined && !(Array.isArray(w.hours) && w.hours.length === 2 && w.hours.every(h => isNum(h) && h >= 0 && h <= 24))) err(id, 'when.hours must be [start, end] in 0..24');
    if (w.days !== undefined && !vocab.days.includes(w.days)) err(id, `when.days "${w.days}" unknown`);
    if (w.weather !== undefined && !vocab.weather.includes(w.weather)) err(id, `when.weather "${w.weather}" unknown`);
    if (!Array.isArray(w.at) || !w.at.length) err(id, 'when.at must list at least one place type');
    else for (const p of w.at) if (!PLACES[p]) err(id, `when.at: unknown place "${p}"`);
    for (const f of w.requires || []) if (checkFlag(f, 'when.requires')) { const k = flagKey(f); if (!flagUsers.has(k)) flagUsers.set(k, []); flagUsers.get(k).push(id); }
    for (const f of w.forbids || []) checkFlag(f, 'when.forbids');
    if (w.cooldown !== undefined) {
      if (typeof w.cooldown !== 'object') err(id, 'when.cooldown must be an object');
      else for (const [k, v] of Object.entries(w.cooldown)) if (!['person', 'city'].includes(k) || !isNum(v) || v < 0) err(id, `when.cooldown.${k} bad`);
    }
    if (!isNum(w.weight) || w.weight <= 0) err(id, 'when.weight must be a positive number');
    for (const [k, v] of Object.entries(w.temper || {})) if (!vocab.temperament.includes(k) || !isNum(v) || v < -1 || v > 1) err(id, `when.temper.${k} bad`);
    for (const [k, v] of Object.entries(w.pressure || {})) if (!vocab.pressures.includes(k) || !(Array.isArray(v) && v.length === 2 && v.every(x => isNum(x) && x >= 0 && x <= 1) && v[0] <= v[1])) err(id, `when.pressure.${k} must be [lo, hi] in 0..1`);
    for (const t of w.lifeTiers || []) if (!vocab.lifeTiers.includes(t)) err(id, `when.lifeTiers "${t}" unknown`);
  }
  // beats
  const beats = Array.isArray(s.beats) ? s.beats : [];
  if (!beats.length) err(id, 'no beats');
  const beatById = new Map();
  const inside = new Set();
  let visibleCount = 0;
  for (const b of beats) {
    const bid = `beat ${b.id}`;
    if (!/^b\d+$/.test(b.id || '')) err(id, `${bid}: id must be b1, b2, ...`);
    if (beatById.has(b.id)) err(id, `${bid}: duplicate beat id`);
    beatById.set(b.id, b);
    const a = ACTIONS[b.do];
    if (!a) { err(id, `${bid}: unknown action "${b.do}"`); continue; }
    bump(usage.actions, b.do);
    if (a.status === 'new') bump(usage.newActions, b.do);
    const who = [].concat(b.who || []), withs = [].concat(b.with || []);
    if (!who.length) err(id, `${bid}: no who`);
    for (const r of [...who, ...withs]) if (!roles.has(r)) err(id, `${bid}: role ${r} does not exist`);
    if (b.at !== undefined && !PLACES[b.at]) err(id, `${bid}: unknown place "${b.at}"`);
    if (typeof b.indoors !== 'boolean') err(id, `${bid}: indoors must be true or false`);
    if (b.do === 'emote' && !vocab.emotes.includes(b.emote)) err(id, `${bid}: emote beat needs emote one of ${vocab.emotes.join(', ')}`);
    if (b.emote !== undefined && !vocab.emotes.includes(b.emote)) err(id, `${bid}: unknown emote "${b.emote}"`);
    // rule 7: after going in, a person is unseen until they come out
    const people = [...who, ...withs];
    if ((b.do === 'enter' || b.do === 'leave') && withs.length) err(id, `${bid}: ${b.do} lists everyone in who, not with`);
    for (const r of people) {
      if (inside.has(r)) {
        if (b.do === 'leave') continue;
        if (b.indoors === false) err(id, `${bid}: role ${r} is inside, so the beat must be indoors:true (SIGNAL LOST)`);
      }
    }
    if (b.do === 'enter') { if (b.indoors === true) err(id, `${bid}: the enter beat itself is seen from outside (indoors:false)`); who.forEach(r => inside.add(r)); }
    if (b.do === 'leave') { if (b.indoors === true) err(id, `${bid}: the leave beat itself is seen from outside (indoors:false)`); who.forEach(r => inside.delete(r)); }
    if (b.indoors === false) visibleCount++;
  }
  if (beats.length && !visibleCount) err(id, 'no visible beats: a storylet must show something');
  // log
  const log = s.log && typeof s.log === 'object' ? s.log : {};
  if (!s.log) err(id, 'missing log');
  const common = w && isNum(w.weight) && w.weight >= 8;
  const min = common ? 4 : 3;
  for (const k of Object.keys(log)) {
    const b = beatById.get(k);
    if (!b) { err(id, `log has lines for "${k}", which is not a beat`); continue; }
    if (b.indoors) err(id, `log lines for indoor beat ${k} (the feed shows SIGNAL LOST)`);
  }
  for (const b of beats) {
    if (b.indoors !== false) continue;
    const lines = log[b.id];
    if (!Array.isArray(lines)) { err(id, `visible beat ${b.id} has no log lines`); continue; }
    if (lines.length < min) err(id, `beat ${b.id} has ${lines.length} log phrasings, needs ${min}${common ? ' (common storylet)' : ''}`);
    const beatRoles = new Set([].concat(b.who || [], b.with || []));
    const aw = ACTIONS[b.do];
    for (const line of lines) {
      checkText(id, `log ${b.id}`, line, 'log', roles, beatRoles);
      // no line may describe an action that belongs to another beat
      if (typeof line === 'string' && aw) {
        const bare = stripQuotes(line);
        const own = wordRe(aw.words).test(bare);
        for (const o of beats) {
          if (o.id === b.id || o.do === b.do) continue;
          const ao = ACTIONS[o.do]; if (!ao || !STRICT.has(o.do)) continue;
          const m = bare.match(wordRe(ao.words));
          if (m && !own) err(id, `log ${b.id}: "${line.slice(0, 50)}..." describes "${m[1]}", which belongs to beat ${o.id} (${o.do})`);
        }
      }
    }
  }
  // fair play: setups may not name relations
  if (s.ambiguous) {
    for (const [k, lines] of Object.entries(log)) for (const line of lines) {
      const m = stripQuotes(line).match(REL_RE);
      if (m) err(id, `ambiguous setup: log ${k} uses the relation word "${m[1]}" (it would settle a truth early)`);
    }
  }
  // effects
  const ef = s.effects || {};
  for (const x of ef.warmth || []) if (!(Array.isArray(x) && x.length === 3 && roles.has(x[0]) && roles.has(x[1]) && isNum(x[2]))) err(id, 'effects.warmth entries are [roleA, roleB, number] with existing roles');
  for (const x of ef.pressure || []) if (!(Array.isArray(x) && x.length === 3 && roles.has(x[0]) && vocab.pressures.includes(x[1]) && isNum(x[2]))) err(id, 'effects.pressure entries are [role, pressure, number]');
  const setHere = [];
  for (const f of ef.flags || []) if (checkFlag(f, 'effects.flags')) setHere.push(f);
  if (ef.life !== undefined && !vocab.lifeChanges.includes(ef.life)) err(id, `effects.life "${ef.life}" unknown`);
  // next
  const nx = s.next || {};
  for (const f of nx.sets || []) if (checkFlag(f, 'next.sets')) setHere.push(f);
  if (nx.branches !== undefined) {
    if (!Array.isArray(nx.branches)) err(id, 'next.branches must be an array');
    else for (const br of nx.branches) {
      if (!isNum(br.w) || br.w <= 0) err(id, 'next.branches: w must be a positive number');
      if (!br.label) err(id, 'next.branches: needs a label');
      for (const f of br.sets || []) if (checkFlag(f, 'next.branches.sets')) setHere.push(f);
    }
  }
  for (const f of setHere) { const k = flagKey(f); if (!flagSetters.has(k)) flagSetters.set(k, new Set()); flagSetters.get(k).add(id); }
  s._sets = setHere;
  // reveals
  for (const [i, rv] of (s.reveals || []).entries()) {
    const rid = `reveal ${i + 1}`;
    const m = String(rv.fact).match(/^([A-F])\.([a-z-]+?)(?:-([A-F]))?$/);
    let key = null;
    if (m) key = m[3] ? m[2] : m[2];
    if (!m || !roles.has(m[1])) { err(id, `${rid}: bad fact "${rv.fact}"`); continue; }
    const fk = m[3] ? m[2] : m[2];
    const factName = fk;   // e.g. first-name, or relation-to (with -B suffix)
    if (!vocab.facts.includes(factName)) { err(id, `${rid}: fact "${factName}" is not in the schema`); continue; }
    if (factName === 'relation-to' && !(m[3] && roles.has(m[3]))) { err(id, `${rid}: relation-to needs a role, like B.relation-to-A`); continue; }
    const ch = vocab.channels[rv.channel];
    if (!ch) { err(id, `${rid}: channel "${rv.channel}" is not in the vocabulary`); continue; }
    if (!ch.carries.includes(factName)) err(id, `${rid}: channel "${rv.channel}" cannot carry "${factName}"`);
    bump(usage.channels, rv.channel); bump(usage.facts, factName);
    const b = beatById.get(rv.beat);
    if (!b) err(id, `${rid}: beat "${rv.beat}" does not exist`);
    else if (b.indoors) err(id, `${rid}: beat ${rv.beat} is indoors; nothing can be learned there`);
    else {
      const sp = { conversation: ['chat', 'hug', 'argue', 'queue-order', 'serve', 'walk-together', 'hand-over', 'point', 'club-queue', 'bump', 'escort', 'sit', 'stand', 'eat', 'picnic', 'emote'], phone: ['phone-call'], feed: ['post-feed'], introduction: ['chat', 'hug', 'hand-over', 'walk-together', 'wave', 'knock-and-wait'] }[rv.channel];
      if (sp && !sp.includes(b.do)) err(id, `${rid}: channel "${rv.channel}" cannot come from a "${b.do}" beat`);
    }
    if (!isNum(rv.chance) || rv.chance <= 0 || rv.chance > 1) err(id, `${rid}: chance must be in (0, 1]`);
    if (!Array.isArray(rv.log) || rv.log.length < 2) err(id, `${rid}: needs at least 2 log phrasings`);
    else rv.log.forEach(l => checkText(id, `reveal ${i + 1} log`, l, 'reveal', roles, null));
    if (['feeling-stated', 'plan-stated', 'opinion-stated', 'money-stated'].includes(factName) && rv.log) for (const l of rv.log) if (!/Says|says|Told|told|Posted|posted|Asks|asks|"|Tells|tells|Admits|admits|Mentions|mentions/.test(l)) err(id, `${rid}: a stated fact must read as stated ("Says...", "Posted...")`);
  }
  // hearsay
  if (s.unwatched === true && !s.hearsay) err(id, 'unwatched storylets need hearsay');
  if (ef.life && s.unwatched !== true) err(id, `effects.life "${ef.life}" is a lasting change: it must be unwatched with hearsay`);
  if (s.hearsay) {
    const h = s.hearsay;
    if (!roles.has(h.about)) err(id, `hearsay.about "${h.about}" is not a role`);
    if (!Array.isArray(h.speakers) || !h.speakers.length || h.speakers.some(x => !vocab.speakerKinds.includes(x))) err(id, 'hearsay.speakers must be a list from the speaker kinds');
    const ch = vocab.channels[h.channel];
    if (!ch) err(id, `hearsay.channel "${h.channel}" is not in the vocabulary`);
    else {
      if (ch.conf !== 'unconfirmed') err(id, 'hearsay is always unconfirmed: its channel must not be verified');
      if (!ch.carries.includes('news')) err(id, `hearsay.channel "${h.channel}" cannot carry news`);
      bump(usage.channels, h.channel);
    }
    const lead = { conversation: 'Overheard:', phone: 'Phone, one side:', feed: 'Posted:' }[h.channel];
    if (!Array.isArray(h.lines) || h.lines.length < 3) err(id, 'hearsay.lines needs at least 3 phrasings');
    else h.lines.forEach(l => { checkText(id, 'hearsay line', l, 'hearsay', roles, null); if (lead && !l.startsWith(lead)) err(id, `hearsay line must start with "${lead}": "${l.slice(0, 50)}"`); });
    if (!Array.isArray(h.entry) || h.entry.length < 2) err(id, 'hearsay.entry needs at least 2 phrasings');
    else h.entry.forEach(l => {
      checkText(id, 'hearsay entry', l, 'entry', roles, null);
      if (!/\b(overheard|posted|told|said|says|mentioned|heard)\b/i.test(l)) err(id, `hearsay entry must name its source: "${l.slice(0, 50)}"`);
      if (!/\b(was|were|had|left|moved|lost|ago|last|no longer|went|got|took|quit|broke|sold|started|opened|found|ended|packed|gone|did|came|turned|stopped|signed|handed|called|visited|stayed)\b/i.test(l)) err(id, `hearsay entry must be in the past tense: "${l.slice(0, 50)}"`);
    });
  }
  // lifeTiers sanity
  if (w && w.lifeTiers && s.tier === 'dramatic' && w.lifeTiers.includes('quiet')) err(id, 'a dramatic storylet cannot be hosted by a quiet life');
  // ambiguity bookkeeping
  if (s.ambiguous) {
    const fp = s.fairPlay;
    if (!fp || !roles.has(fp.subject) || !fp.truths || Object.keys(fp.truths).length < 2) err(id, 'ambiguous: fairPlay needs a subject role and at least 2 truths');
    if (s.resolves) err(id, 'a storylet cannot be both a setup and a reveal');
  } else if (s.fairPlay) err(id, 'fairPlay on a storylet that is not ambiguous');
  if (s.resolves && !(s.resolves.setup && s.resolves.truth)) err(id, 'resolves needs setup and truth');
}

// ---------- cross-storylet ----------
function tiersOf(s) { return (s.when && s.when.lifeTiers) || vocab.defaultLifeTiers[s.tier] || []; }
for (const s of stories) {
  const id = s.id;
  if (s.ambiguous && s.fairPlay && s.fairPlay.truths) {
    for (const [truth, rid] of Object.entries(s.fairPlay.truths)) {
      const r = byId.get(rid);
      if (!r) { err(id, `fairPlay truth "${truth}" names missing reveal storylet ${rid}`); continue; }
      if (!r.resolves || r.resolves.setup !== id || r.resolves.truth !== truth) err(id, `reveal ${rid} must carry resolves { setup: "${id}", truth: "${truth}" }`);
      const need = (r.when && r.when.requires || []).map(flagKey);
      if (!s._sets.map(flagKey).some(k => need.includes(k))) err(id, `reveal ${rid} requires none of the flags this setup sets`);
      if (!(r.reveals || []).length) err(rid, 'a reveal storylet must reveal at least one fact');
    }
    // every life tier that can host the setup must be able to host at least one of its reveals
    for (const lt of tiersOf(s)) if (!Object.values(s.fairPlay.truths).some(rid => byId.has(rid) && tiersOf(byId.get(rid)).includes(lt))) err(id, `a ${lt} life can host this setup but none of its reveals`);
  }
  if (s.resolves) {
    const set = byId.get(s.resolves.setup);
    if (!set || !set.ambiguous) err(id, `resolves "${s.resolves.setup}", which is not an ambiguous setup`);
    else if (!set.fairPlay.truths[s.resolves.truth] || set.fairPlay.truths[s.resolves.truth] !== id) err(id, `setup ${set.id} does not list this storylet for truth "${s.resolves.truth}"`);
  }
}
// flags: setters exist; reachable to a fixed point
const worldKeys = new Set(vocab.worldFlags);
const available = new Set(worldKeys);
for (const s of stories) for (const f of s.when && s.when.requires || []) {
  const k = flagKey(f);
  if (!flagSetters.has(k) && !worldKeys.has(k)) err(s.id, `requires flag "${f}", which nothing sets (and the game does not set it)`);
}
for (const s of stories) for (const f of s.when && s.when.forbids || []) {
  const k = flagKey(f);
  if (!flagSetters.has(k) && !worldKeys.has(k)) warn(s.id, `forbids flag "${f}", which nothing sets`);
}
const reachable = new Set();
for (let changed = true; changed;) {
  changed = false;
  for (const s of stories) {
    if (reachable.has(s.id)) continue;
    const ok = (s.when && s.when.requires || []).every(f => available.has(flagKey(f)));
    if (!ok) continue;
    reachable.add(s.id); changed = true;
    for (const f of s._sets) available.add(flagKey(f));
  }
}
for (const s of stories) if (!reachable.has(s.id)) err(s.id, 'unreachable: its required flags are never set by anything reachable');

// ---------- balance and totals ----------
const counts = {};      // cat -> tier -> n
for (const s of stories) { counts[s.cat] = counts[s.cat] || {}; counts[s.cat][s.tier] = (counts[s.cat][s.tier] || 0) + 1; }
const tierTotals = Object.fromEntries(vocab.tiers.map(t => [t, stories.filter(s => s.tier === t).length]));
const total = stories.length;
if (!PARTIAL && (total < 150 || total > 250)) warn('database', `${total} storylets; the plan asks for about 150 to 250`);
if (!PARTIAL && (tierTotals.mundane + tierTotals.texture) / Math.max(1, total) < 0.5) warn('database', `mundane + texture are ${(100 * (tierTotals.mundane + tierTotals.texture) / total).toFixed(0)}% of the database; aim for about half or more`);
const minTier = vocab.tiers.reduce((a, t) => tierTotals[t] < tierTotals[a] ? t : a, vocab.tiers[0]);
if (!PARTIAL && minTier !== 'dramatic') warn('database', `the smallest tier is ${minTier}; it should be dramatic`);
for (const c of vocab.categories) {
  const k = counts[c.id] || {};
  if (!PARTIAL && !(k.mundane || k.texture)) err(c.id, 'no quiet entries (mundane or texture): every category needs some');
  if (PARTIAL && counts[c.id] && !(k.mundane || k.texture)) err(c.id, 'no quiet entries (mundane or texture): every category needs some');
}
const bySize = vocab.categories.map(c => [c.id, Object.values(counts[c.id] || {}).reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
if (!PARTIAL && !['secrets', 'routine'].every(x => bySize.slice(0, 3).some(y => y[0] === x))) warn('database', `secrets and routine should be the most developed categories (largest: ${bySize.slice(0, 3).map(x => x.join(' ')).join(', ')})`);
const hotOpeners = [...openers.entries()].filter(([, n]) => n > 5).sort((a, b) => b[1] - a[1]);
for (const [op, n] of hotOpeners.slice(0, 12)) warn('phrasing', `${n} lines open with "${op}"`);

// ---------- names ----------
try {
  const names = readJSON(path.join(DATA, 'names.json'));
  const f = names.first.map(x => x.split('|')[0]);
  if (new Set(f).size !== f.length) err('names.json', 'duplicate first names');
  if (new Set(names.last).size !== names.last.length) err('names.json', 'duplicate last names');
  for (const x of names.first) if (!/^[^|]+\|[fmn]\|[^|]*$/.test(x)) err('names.json', `bad first-name entry "${x}"`);
  if (f.length < 150 || names.last.length < 120) warn('names.json', 'name pools are small');
} catch (e) { err('names.json', e.message); }

// ---------- no Math.random in the tools, and only allowed paths changed ----------
const needle = 'Math' + '\\.' + 'random';
for (const f of fs.readdirSync(__dirname).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (f !== 'validate.js' && new RegExp(needle).test(src)) err(f, 'uses Math.random; use seeded hashes only');
}
try {
  const out = cp.execSync(`git diff --name-only ${BASE}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
  const stray = out.filter(f => !f.startsWith('data/stories/') && !f.startsWith('tools/stories/'));
  for (const f of stray) err('git', `changed outside data/stories and tools/stories: ${f}`);
} catch (e) { if (!QUIET) warnings.push(`git: could not diff against ${BASE} (skipped the path check)`); }

// ---------- report ----------
if (STATS) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nStorylets by category and tier');
  console.log(pad('category', 14) + vocab.tiers.map(t => pad(t, 10)).join('') + 'total');
  for (const c of vocab.categories) {
    const k = counts[c.id] || {};
    console.log(pad(c.id, 14) + vocab.tiers.map(t => pad(k[t] || 0, 10)).join('') + Object.values(k).reduce((a, b) => a + b, 0));
  }
  console.log(pad('ALL', 14) + vocab.tiers.map(t => pad(tierTotals[t], 10)).join('') + total);
  console.log('\nNew actions the database uses (not in the game yet)');
  for (const [a, n] of Object.entries(usage.newActions).sort((x, y) => y[1] - x[1])) console.log(`  ${pad(a, 18)}${n} beats`);
  console.log('\nExisting actions used');
  for (const [a, n] of Object.entries(usage.actions).filter(([a]) => ACTIONS[a].status === 'existing').sort((x, y) => y[1] - x[1])) console.log(`  ${pad(a, 18)}${n} beats`);
  console.log('\nChannels used by reveals and hearsay');
  for (const [a, n] of Object.entries(usage.channels).sort((x, y) => y[1] - x[1])) console.log(`  ${pad(a, 14)}${n}`);
  const ambig = stories.filter(s => s.ambiguous);
  console.log(`\nAmbiguous setups: ${ambig.length}; reveals: ${stories.filter(s => s.resolves).length}; unwatched with hearsay: ${stories.filter(s => s.unwatched).length}`);
  const logLines = stories.reduce((n, s) => n + Object.values(s.log || {}).reduce((m, a) => m + a.length, 0), 0);
  console.log(`Live log lines: ${logLines}; flags set: ${flagSetters.size}; reachable storylets: ${reachable.size}/${total}`);
}
if (!QUIET || errors.length) {
  for (const e of errors) console.log('ERROR   ' + e);
  if (!QUIET) for (const w of warnings) console.log('warning ' + w);
}
console.log(`\n${total} storylets in ${files.length} files: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
