#!/usr/bin/env node
'use strict';
/*
 * lifesheet.js: a dry run with no game.
 *
 * Makes 50 citizens from seeds in a small fake city, runs a storylet picker for a simulated week
 * with a simple director, and prints what a patient watcher of each person would have in their
 * monitor log by the end. The watcher only sees a person during fixed watching windows, so the
 * sheet shows the live lines from those windows and the hearsay that reached them, never what
 * happened in between.
 *
 * Seeded and deterministic: all randomness is a hash of strings (no built-in random calls anywhere).
 *
 * Usage:
 *   node tools/stories/lifesheet.js                      summary and three sample sheets
 *   node tools/stories/lifesheet.js --seed neon-2        another city
 *   node tools/stories/lifesheet.js --all                every sheet on screen
 *   node tools/stories/lifesheet.js --only 7             one citizen
 *   node tools/stories/lifesheet.js --save               write tools/stories/sheets/*.md
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const SEED = String(opt('seed', 'neon-1'));
const PEOPLE = Number(opt('people', 50));
const DAYS = 7;

// ---------- seeded hashing (no built-in random) ----------
function xmur3(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
const hash = (...parts) => xmur3(SEED + '|' + parts.join('|'))();
const unit = (...parts) => hash(...parts) / 4294967296;           // 0..1
const pick = (arr, ...parts) => arr[hash(...parts) % arr.length];
const roll = (p, ...parts) => unit(...parts) < p;

// ---------- load data ----------
const dataDir = path.join(__dirname, '..', '..', 'data', 'stories');
const vocab = JSON.parse(fs.readFileSync(path.join(dataDir, 'vocab.json'), 'utf8'));
const names = JSON.parse(fs.readFileSync(path.join(dataDir, 'names.json'), 'utf8'));
const stories = [];
for (const f of fs.readdirSync(dataDir).filter(f => /^\d\d-.*\.json$/.test(f)).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  for (const s of c.storylets) {
    const when = Object.assign({ hours: [0, 24], days: 'any', weather: 'any', weight: 5 }, s.when || {});
    when.cooldown = Object.assign({ person: 24, city: 1 }, when.cooldown || {});
    stories.push(Object.assign({}, s, { category: c.category, when, unwatched: !!s.unwatched }));
  }
}
const byId = new Map(stories.map(s => [s.id, s]));
const lifeTiersOf = s => s.when.lifeTiers || vocab.defaultLifeTiers[s.tier];

// ---------- the fake city ----------
const DISTRICTS = [
  { id: 'lowtown', name: 'Lowtown', zone: 'low' },
  { id: 'midrow', name: 'Midrow', zone: 'mid' },
  { id: 'terrace', name: 'Sky Terrace', zone: 'high' },
  { id: 'foundry', name: 'Foundry Side', zone: 'ind' },
  { id: 'market', name: 'Market Row', zone: 'mid' }
];
const EMPLOYERS = [
  { id: 'noodle', name: 'Night Noodle', job: 'stall-keeper', district: 'market' },
  { id: 'tea', name: 'Lantern Tea House', job: 'stall-keeper', district: 'midrow' },
  { id: 'grocer', name: 'Tanaka Grocers', job: 'shop-worker', district: 'lowtown' },
  { id: 'repair', name: 'Okada Repair', job: 'shop-worker', district: 'market' },
  { id: 'records', name: 'Harbor Records', job: 'office-worker', district: 'terrace' },
  { id: 'clinic', name: 'Clear Water Clinic', job: 'office-worker', district: 'midrow' },
  { id: 'foundry', name: 'Foundry No. 4', job: 'industrial', district: 'foundry' },
  { id: 'forge', name: 'Kiln & Forge', job: 'industrial', district: 'foundry' },
  { id: 'dome', name: 'Neon Dome', job: 'club-staff', district: 'terrace' },
  { id: 'parcel', name: 'Swift Parcel', job: 'courier', district: 'market' },
  { id: 'radio', name: 'Radio Kowloon', job: 'radio', district: 'terrace' },
  { id: 'baths', name: 'Steam House', job: 'bathhouse-staff', district: 'lowtown' }
];
const JOB_NEEDS = { 'stall-keeper': ['stall-keeper'], 'shop-worker': ['shop-worker'], 'office-worker': ['office-worker'], industrial: ['industrial-worker'], foundry: ['industrial-worker'], courier: ['courier'], 'club-staff': ['club-worker', 'night-worker'], radio: ['night-worker'], 'bathhouse-staff': [], logistics: [], greenhouse: [], 'hotel-spa': [], police: [] };
const REGULARS = ['stall', 'bench', 'club', 'bar-kiosk', 'lawn', 'square', 'bathhouse', 'metro'];
const CITY = { 'city:metro-line-opened': true, 'city:lawn-built': true, 'city:stall-opened': true, 'city:bench-placed': false, 'city:club-opened': false, 'city:lift-built': false, 'city:dropoff-built': false, 'city:plaza-built': false };

const PLACE_TEXT = {
  'home-door': ['the home door', 'the stoop', 'the front step'],
  street: ['the sidewalk', 'the street', 'the corner'],
  'shop-door': ['the shop door', 'a shopfront'],
  'work-door': ['the work door', 'the workplace entrance'],
  stall: ['the noodle stall', 'the tea stall', 'the dumpling counter'],
  square: ['the square', 'the pond edge'],
  'cafe-stool': ['the cafe stools', 'the stool row'],
  bench: ['the bench by the pond', 'a plaza bench'],
  lawn: ['the lawn', 'the grass plot'],
  'bar-kiosk': ['the bar kiosk'],
  'club-queue': ['the rope line'],
  'club-door': ['the club door'],
  'metro-station': ['the metro entrance'],
  platform: ['the platform'],
  'lift-base': ['the lift base'],
  dropoff: ['the drop-off'],
  'empty-plot': ['the cleared lot'],
  'station-door': ['the station door'],
  'market-mall': ['the market mall'],
  mall: ['the mall entrance'],
  bathhouse: ['the bathhouse'],
  'foundry-gate': ['the foundry gate'],
  any: ['the block']
};
const ITEMS = ['a paper bag', 'a box', 'a crate', 'a bundle', 'a parcel', 'a lamp'];

// ---------- entities ----------
const firstPool = names.first.map(x => { const [n, g, nick] = x.split('|'); return { n, g, nick: (nick || '').split(',').filter(Boolean) }; });
const lastPool = names.last;
let extraCount = 0;
const entities = new Map();

function makeEntity(id, seedKey, o) {
  const f = pick(firstPool, seedKey, 'first');
  const e = Object.assign({
    id, first: f.n, g: f.g, nick: f.nick.length ? pick(f.nick, seedKey, 'nick') : null, last: pick(lastPool, seedKey, 'last'),
    age: 18 + (hash(seedKey, 'age') % 47), extra: false, district: pick(DISTRICTS, seedKey, 'dist').id,
    job: null, employer: null, jobless: false, regulars: [], temper: {
      outgoing: unit(seedKey, 'outgoing'), careful: unit(seedKey, 'careful'), warm: unit(seedKey, 'warm')
    }, pressure: {
      money: unit(seedKey, 'p-money') * 0.9, loneliness: unit(seedKey, 'p-lone') * 0.8, 'work-trouble': unit(seedKey, 'p-work') * 0.8,
      secret: unit(seedKey, 'p-secret') * 0.7, 'life-change': unit(seedKey, 'p-life') * 0.6
    }, flags: {}, world: {}, rels: [], life: undefined, counts: {}, gone: false, umbrella: roll(0.7, seedKey, 'umb'), stray: roll(0.25, seedKey, 'stray')
  }, o || {});
  entities.set(id, e);
  return e;
}
const ageRange = e => e.age < 30 ? 'twenties' : e.age < 40 ? 'thirties' : e.age < 50 ? 'forties' : e.age < 60 ? 'fifties' : 'sixties or older';
const homeText = e => DISTRICTS.find(d => d.id === e.district).name;

const INV = { 'parent-of': 'child-of', 'child-of': 'parent-of', 'grandparent-of': 'grandchild-of', 'grandchild-of': 'grandparent-of', 'creditor-of': 'debtor-of', 'debtor-of': 'creditor-of', 'landlord-of': 'tenant-of', 'tenant-of': 'landlord-of', 'boss-of': 'employee-of', 'employee-of': 'boss-of', 'aunt-uncle-of': 'niece-nephew-of', 'niece-nephew-of': 'aunt-uncle-of', 'shopkeeper-of': 'customer-of', 'customer-of': 'shopkeeper-of' };
function addRel(a, kind, b) { // a is <kind> of b
  const inv = INV[kind] || kind;
  if (!b.rels.some(r => r.kind === kind && r.who === a.id)) b.rels.push({ kind, who: a.id });
  if (!a.rels.some(r => r.kind === inv && r.who === b.id)) a.rels.push({ kind: inv, who: a.id === b.id ? a.id : b.id });
}
// rel entries on X: { kind, who }: "who is <kind> of X"
function relsOf(x, kind) { return x.rels.filter(r => r.kind === kind).map(r => entities.get(r.who)).filter(Boolean); }

function makeExtra(forE, tag, o) {
  const id = 'x' + (++extraCount);
  return makeEntity(id, SEED + '|x|' + forE.id + '|' + tag + '|' + extraCount, Object.assign({ extra: true }, o || {}));
}
// A scratch extra is built to fit a role's needs but is only registered if the storylet is actually played.
function scratchExtra(forE, tag, needs, o) {
  const seedKey = SEED + '|s|' + forE.id + '|' + tag;
  const f = pick(firstPool, seedKey, 'first');
  const x = {
    id: 'x?' + tag, first: f.n, g: f.g, nick: f.nick.length ? pick(f.nick, seedKey, 'nick') : null, last: pick(lastPool, seedKey, 'last'),
    age: 18 + (hash(seedKey, 'age') % 40), extra: true, scratch: true, district: forE.district, job: null, employer: null, regulars: [],
    temper: { outgoing: unit(seedKey, 'o'), careful: unit(seedKey, 'c'), warm: unit(seedKey, 'w') }, pressure: { money: 0.3, loneliness: 0.3, 'work-trouble': 0.3, secret: 0.2, 'life-change': 0.2 },
    flags: {}, world: {}, rels: [], life: undefined, gone: false, umbrella: true, stray: false, seedKey
  };
  Object.assign(x, o || {});
  for (const n of needs || []) {
    if (n === 'senior') x.age = 62 + (hash(seedKey, 'sage') % 20);
    if (n === 'young-adult') x.age = 20 + (hash(seedKey, 'yage') % 9);
    if (n === 'stall-keeper') { x.job = 'stall-keeper'; x.employer = 'a food stall'; }
    if (n === 'shop-worker') { x.job = 'shop-worker'; x.employer = 'a repair shop'; }
    if (n === 'club-worker') { x.job = 'club-staff'; x.employer = 'Neon Dome'; }
    if (n === 'other-district') x.district = DISTRICTS.find(d => d.id !== forE.district).id;
  }
  return x;
}
function registerExtra(x) {
  if (!x.scratch) return x;
  x.id = 'x' + (++extraCount); delete x.scratch; entities.set(x.id, x);
  if (x.lazyRel) { addRel(x, x.lazyRel.kind, x.lazyRel.T); delete x.lazyRel; }
  return x;
}

// citizens
const citizens = [];
const lifeOrder = Array.from({ length: PEOPLE }, (_, i) => i).sort((a, b) => hash('lifeorder', a) - hash('lifeorder', b));
const nQuiet = Math.round(PEOPLE * 0.6), nText = Math.round(PEOPLE * 0.3);
const lifeOf = {};
lifeOrder.forEach((idx, r) => { lifeOf[idx] = r < nQuiet ? 'quiet' : r < nQuiet + nText ? 'textured' : 'eventful'; });
for (let i = 0; i < PEOPLE; i++) {
  const c = makeEntity('c' + (i + 1), 'citizen-' + i, { life: lifeOf[i], idx: i });
  const emp = pick(EMPLOYERS, 'citizen-' + i, 'emp');
  if (roll(0.88, 'citizen-' + i, 'employed')) { c.job = emp.job; c.employer = emp.name; c.employerId = emp.id; if (roll(0.7, 'citizen-' + i, 'workhere')) c.district = emp.district; }
  c.age = 19 + (hash('citizen-' + i, 'age2') % 50);
  c.regulars = REGULARS.filter((r, k) => roll(0.28, 'citizen-' + i, 'reg', k));
  if (c.job === 'stall-keeper' && !c.regulars.includes('stall')) c.regulars.push('stall');
  citizens.push(c);
}
// households: pair up citizens within a district, otherwise alone or with an extra
const unhoused = new Set(citizens.map(c => c.id));
for (const d of DISTRICTS) {
  const here = citizens.filter(c => c.district === d.id);
  for (let k = 0; k + 1 < here.length; k += 2) {
    if (!roll(0.55, 'house', d.id, k)) continue;
    const a = here[k], b = here[k + 1];
    addRel(a, 'cohabitant-of', b); a.house = b.house = 'h-' + a.id; unhoused.delete(a.id); unhoused.delete(b.id);
    if (roll(0.4, 'couple', a.id)) { addRel(a, 'partner-of', b); a.partner = b.id; b.partner = a.id; }
    else if (roll(0.5, 'kin', a.id)) addRel(a, 'sibling-of', b);
  }
}
for (const c of citizens) {
  if (!c.house) {
    c.house = 'h-' + c.id;
    if (roll(0.3, 'extra-roommate', c.id)) { const x = makeExtra(c, 'roommate', { district: c.district }); addRel(c, 'cohabitant-of', x); x.house = c.house; }
    if (roll(0.3, 'extra-partner', c.id)) { const x = makeExtra(c, 'partner', { district: c.district }); addRel(c, 'partner-of', x); c.partner = x.id; }
  }
  // friends
  const nF = 1 + (hash(c.id, 'nfriends') % 3);
  for (let k = 0; k < nF; k++) {
    if (roll(0.5, c.id, 'friend-citizen', k)) { const o = pick(citizens, c.id, 'friend', k); if (o !== c) addRel(c, 'friend-of', o); }
    else { const x = makeExtra(c, 'friend' + k); addRel(c, 'friend-of', x); }
  }
  // family
  if (roll(0.8, c.id, 'parent')) { const x = makeExtra(c, 'parent', { age: c.age + 24 }); addRel(x, 'parent-of', c); }
  if (roll(0.45, c.id, 'sibling') && !c.rels.some(r => r.kind === 'sibling-of')) { const x = makeExtra(c, 'sibling', { district: pick(DISTRICTS, c.id, 'sibd').id }); addRel(c, 'sibling-of', x); }
  if (roll(0.25, c.id, 'gp')) { const x = makeExtra(c, 'grandparent', { age: c.age + 48 }); addRel(x, 'grandparent-of', c); }
  if (c.age > 30 && roll(0.25, c.id, 'child')) { const x = makeExtra(c, 'child', { age: 5 + (hash(c.id, 'cage') % 7) }); addRel(x, 'child-of', c); }
  if (roll(0.25, c.id, 'cousin')) { const x = makeExtra(c, 'cousin'); addRel(c, 'cousin-of', x); }
  if (roll(0.2, c.id, 'ex')) { const x = makeExtra(c, 'ex'); addRel(x, 'ex-of', c); }
  // work and neighborhood
  for (const o of citizens) { if (o === c) continue; if (o.employerId && o.employerId === c.employerId) addRel(c, 'coworker-of', o); if (o.district === c.district && roll(0.3, 'nbr', c.id, o.id) && c.id < o.id) addRel(c, 'neighbor-of', o); }
  if (!c.rels.some(r => r.kind === 'neighbor-of')) { const x = makeExtra(c, 'neighbor', { district: c.district }); addRel(c, 'neighbor-of', x); }
  if (c.job && !c.rels.some(r => r.kind === 'employee-of')) { const x = makeExtra(c, 'boss', { age: 40 + (hash(c.id, 'bage') % 20) }); addRel(x, 'boss-of', c); }
  const x = makeExtra(c, 'landlord', { age: 45 + (hash(c.id, 'lage') % 20) }); addRel(x, 'landlord-of', c);
  const sk = makeExtra(c, 'shopkeeper', { job: 'stall-keeper' }); addRel(sk, 'shopkeeper-of', c);
  if (c.pressure.money > 0.55) { const cr = makeExtra(c, 'creditor'); addRel(cr, 'creditor-of', c); }
}
// lazily created relations
const LAZY = new Set(['acquaintance-of', 'stranger-to', 'rival-of', 'creditor-of', 'coworker-of', 'friend-of', 'boss-of', 'neighbor-of', 'shopkeeper-of', 'landlord-of', 'ex-of']);

// ---------- needs ----------
const isSenior = e => e.age >= 60;
function meets(e, need, A) {
  const kin = e.rels.filter(r => r.kind === 'cohabitant-of').map(r => entities.get(r.who));
  switch (need) {
    case 'adult': return e.age >= 18;
    case 'young-adult': return e.age >= 18 && e.age < 30;
    case 'middle-aged': return e.age >= 30 && e.age < 60;
    case 'senior': return isSenior(e);
    case 'lives-alone': return kin.length === 0;
    case 'lives-with-others': return kin.length > 0;
    case 'lives-with-family': return kin.some(k => e.rels.some(r => r.who === k.id && ['sibling-of', 'parent-of', 'child-of'].includes(r.kind)));
    case 'lives-with-nonfamily': return kin.some(k => !e.rels.some(r => r.who === k.id && ['sibling-of', 'parent-of', 'child-of', 'partner-of'].includes(r.kind)));
    case 'same-district': return A && e.district === A.district;
    case 'other-district': return A && e.district !== A.district;
    case 'employed': return !!e.job && !e.jobless;
    case 'unemployed': return !e.job || e.jobless;
    case 'stall-keeper': return e.job === 'stall-keeper';
    case 'shop-worker': return e.job === 'shop-worker';
    case 'industrial-worker': return e.job === 'industrial' || e.job === 'foundry';
    case 'office-worker': return e.job === 'office-worker';
    case 'night-worker': return ['club-staff', 'radio'].includes(e.job) || roll(0.12, e.id, 'nightw');
    case 'courier': return e.job === 'courier';
    case 'club-worker': return e.job === 'club-staff';
    case 'outgoing': return e.temper.outgoing > 0.6;
    case 'private': return e.temper.outgoing < 0.4;
    case 'careful': return e.temper.careful > 0.6;
    case 'impulsive': return e.temper.careful < 0.4;
    case 'warm': return e.temper.warm > 0.6;
    case 'guarded': return e.temper.warm < 0.4;
    case 'partnered': return !!e.partner;
    case 'single': return !e.partner;
    case 'has-umbrella': return e.umbrella;
    case 'has-pet-stray-habit': return e.stray;
    default:
      if (need.startsWith('regular:')) return e.regulars.includes(need.slice(8));
      if (need.startsWith('zone:')) return DISTRICTS.find(d => d.id === e.district).zone === need.slice(5);
      if (need.startsWith('pressure-high:')) return e.pressure[need.slice(14)] > 0.6;
      return true;
  }
}

// ---------- state ----------
const cityLog = { dramaticTimes: [], dramaticTotal: 0, notableByDay: {}, lastCity: {} };
const personLast = {}; // storyletId|entityId -> hour
const pairFlags = {};  // 'a|b' -> {name:true}
const cityFlags = Object.assign({}, CITY);
const busyUntil = {};  // entity id -> absolute minute
const pending = {};    // setup memory: setupId|A|B -> { truth, B }
const played = [];     // all played storylets
const watch = {};      // citizen id -> { window: [h0,h1], log: [], known: {}, notebook: [] }
const pairKey = (a, b) => [a, b].sort().join('|');
const hasFlag = (f, cast) => {
  const [sc, name] = f.split(':');
  if (sc === 'city') return !!cityFlags['city:' + name];
  if (sc === 'world') return false;
  if (sc === 'single') return !!cast.A.world[name];
  const rs = sc.split('+');
  if (rs.length === 1) return !!cast[rs[0]].flags[name];
  return !!(pairFlags[pairKey(cast[rs[0]].id, cast[rs[1]].id)] || {})[name];
};
const setFlag = (f, cast) => {
  const [sc, name] = f.split(':');
  if (sc === 'city') { cityFlags['city:' + name] = true; return; }
  if (sc === 'world') return;
  if (sc === 'single') { cast.A.world[name] = true; return; }
  const rs = sc.split('+');
  if (rs.length === 1) cast[rs[0]].flags[name] = true;
  else { const k = pairKey(cast[rs[0]].id, cast[rs[1]].id); (pairFlags[k] = pairFlags[k] || {})[name] = true; }
};

// scripted game events: the "player" changes the city, so displacement storylets can fire (deterministic picks)
const EVENTS = [
  { day: 1, flag: 'home-demolished', who: citizens[hash('ev1') % PEOPLE] },
  { day: 2, flag: 'workplace-removed', who: citizens.filter(c => c.job)[hash('ev2') % citizens.filter(c => c.job).length] },
  { day: 3, flag: 'newly-arrived', who: citizens[hash('ev3') % PEOPLE] },
  { day: 3, flag: 'new-neighbor-moved-in', who: citizens[hash('ev4') % PEOPLE] },
  { day: 4, city: 'city:club-opened' }, { day: 5, city: 'city:plaza-built' }
];

// ---------- picker ----------
function rainAt(day, hour) { const r = hash('rain', day) % 100 < 35; return r && hour >= 12 && hour < 22; }
function inHours(h, [a, b]) { return a <= b ? (h >= a && h < b) : (h >= a || h < b); }

function tryCast(s, A, nowH, dayOfWeek, hour) {
  const w = s.when;
  const cast = { A };
  // subject needs
  for (const n of (s.roles.A.needs || [])) if (!meets(A, n, A)) return null;
  // choose other roles
  const rolesToCast = Object.keys(s.roles).filter(r => r !== 'A').sort();
  const used = new Set([A.id]);
  // setup reveals use the stranger created by the setup
  if (s.resolves) {
    const mem = pending[s.resolves.setup + '|' + A.id];
    if (!mem || mem.truth !== s.resolves.truth) return null;
    cast.B = mem.B; used.add(mem.B.id);
  }
  for (const r of rolesToCast) {
    if (cast[r]) continue;
    const spec = s.roles[r];
    let cands = [];
    if (spec.rel) {
      const [kind, target] = spec.rel.split(':');
      const T = cast[target]; if (!T) return null;
      cands = relsOf(T, kind);
      if (!cands.length && LAZY.has(kind) && A.life !== undefined) {
        const x = scratchExtra(A, 'lazy-' + r + '-' + s.id, spec.needs, { district: T.district, age: kind === 'boss-of' || kind === 'landlord-of' ? 45 : undefined });
        if (kind === 'stranger-to' || kind === 'acquaintance-of') x.lazyRel = { kind, T }; else x.lazyRel = { kind, T };
        cands = [x];
      }
      cands = cands.filter(c => !used.has(c.id));
    } else {
      // a stranger or an unrelated person: a fresh extra
      const x = scratchExtra(A, 'stranger-' + r + '-' + s.id + '-' + nowH, spec.needs, { district: pick(DISTRICTS, A.id, s.id, r, nowH).id });
      if (/officer/.test(spec.desc)) x.job = 'police';
      cands = [x];
    }
    cands = cands.filter(c => (spec.needs || []).every(n => meets(c, n, A)) && !c.gone && (c.extra || (busyUntil[c.id] || 0) <= nowH * 60));
    if (!cands.length) return null;
    // pair-flag requirements are checked per candidate
    const reqs = (w.requires || []).filter(f => f.split(':')[0].split('+').includes(r));
    const ok = cands.filter(c => { const tmp = Object.assign({}, cast, { [r]: c }); return reqs.every(f => { const sc = f.split(':')[0].split('+'); return sc.every(x => tmp[x]) ? hasFlag(f, tmp) : true; }); });
    if (!ok.length) return null;
    cast[r] = ok[hash('cast', A.id, s.id, r, nowH) % ok.length]; used.add(cast[r].id);
  }
  // remaining flag checks
  for (const f of w.requires || []) { const sc = f.split(':')[0]; if (!['city', 'world', 'single'].includes(sc) && !sc.split('+').every(x => cast[x])) return null; if (!hasFlag(f, cast)) return null; }
  for (const f of w.forbids || []) { const sc = f.split(':')[0]; if (['city', 'world', 'single'].includes(sc) || sc.split('+').every(x => cast[x])) if (hasFlag(f, cast)) return null; }
  return cast;
}

function eligible(s, A, nowH, day, hour) {
  const w = s.when;
  if (!lifeTiersOf(s).includes(A.life)) return null;
  if (!inHours(hour, w.hours)) return null;
  const dow = day % 7; const weekend = dow >= 5;
  if (w.days === 'weekday' && weekend) return null;
  if (w.days === 'weekend' && !weekend) return null;
  if (w.weather === 'rain' && !rainAt(day, hour)) return null;
  if (w.weather === 'clear' && rainAt(day, hour)) return null;
  const last = personLast[s.id + '|' + A.id]; if (last !== undefined && nowH - last < w.cooldown.person) return null;
  const lc = cityLog.lastCity[s.id]; if (lc !== undefined && nowH - lc < w.cooldown.city) return null;
  for (const [k, [lo, hi]] of Object.entries(w.pressure || {})) if (!(A.pressure[k] >= lo && A.pressure[k] <= hi)) return null;
  // director
  if (s.tier === 'dramatic') {
    if (cityLog.dramaticTotal >= 3) return null;
    if (cityLog.dramaticTimes.some(t => nowH - t < 36)) return null;
  }
  if (s.tier === 'notable' && (cityLog.notableByDay[day] || 0) >= 8) return null;
  const cast = tryCast(s, A, nowH, day, hour);
  return cast;
}

function weightOf(s, A, cast, nowH) {
  A.nowH = nowH;
  const w = s.when;
  let x = w.weight;
  const tf = { mundane: 1, texture: 0.85, notable: 0.55, dramatic: 0.4 }[s.tier];
  x *= tf;
  if (w.requires && w.requires.length) x *= 3;           // pay off set-ups when they are due
  if (s.resolves) x *= 2.5;
  for (const [k, v] of Object.entries(w.temper || {})) x *= 1 + v * (A.temper[k] - 0.5) * 2;
  if (A.regulars.some(r => (w.at || []).some(p => p.includes(r)))) x *= 1.3;
  x *= Math.pow(0.3, A.counts[s.id] || 0);                       // variety: each repeat this week is much less likely
  if (s.tier === 'dramatic') x *= 1 + (A.nowH || 0) / 10;     // the director leans harder as the week goes on without one
  if (s.tier === 'notable' || s.tier === 'dramatic') x *= { quiet: 1, textured: 1.6, eventful: 3 }[A.life];
  return Math.max(0.01, x);
}

// ---------- rendering ----------
function genderWords(e) { return e.g === 'f' ? { he: 'she', him: 'her', his: 'her', man: 'woman' } : e.g === 'm' ? { he: 'he', him: 'him', his: 'his', man: 'man' } : { he: 'they', him: 'them', his: 'their', man: 'person' }; }
function relWord(kind, e) {
  const f = e.g === 'f', m = e.g === 'm';
  const map = { 'grandchild-of': f ? 'granddaughter' : m ? 'grandson' : 'grandchild', 'stranger-to': 'stranger', 'tenant-of': 'tenant', 'employee-of': 'employee', 'debtor-of': 'debtor', 'customer-of': 'customer', 'sibling-of': f ? 'sister' : m ? 'brother' : 'sibling', 'parent-of': f ? 'mother' : m ? 'father' : 'parent', 'child-of': f ? 'daughter' : m ? 'son' : 'child', 'grandparent-of': f ? 'grandmother' : 'grandfather', 'cousin-of': 'cousin', 'partner-of': 'partner', 'friend-of': 'friend', 'coworker-of': 'coworker', 'neighbor-of': 'neighbor', 'ex-of': 'ex', 'rival-of': 'rival', 'creditor-of': 'creditor', 'landlord-of': 'landlord', 'boss-of': 'boss', 'cohabitant-of': 'housemate', 'acquaintance-of': 'acquaintance', 'shopkeeper-of': 'shopkeeper' };
  return map[kind] || kind.replace(/-of$/, '');
}
// the relation of role X, as a kind: to A, or (for A itself) to B. rels on Y read "who is <kind> of Y"
function relKindOf(X, cast, to, want) {
  const Y = to || (X === cast.A ? cast.B : cast.A); if (!X || !Y) return null;
  if (want && Y.rels.some(r => r.who === X.id && r.kind === want)) return want;   // two people can be neighbors and coworkers: say the one the storylet is about
  const r = Y.rels.find(r => r.who === X.id); return r ? r.kind : null;
}
// the relation each role has in a storylet, from its roles (B: neighbor-of:A gives B neighbor-of, A neighbor-of)
function wantKinds(s) {
  const w = {};
  for (const [R, spec] of Object.entries(s.roles || {})) if (spec.rel) { const [kind, T] = spec.rel.split(':'); w[R] = kind; if (T === 'A' && R === 'B' && !w.A) w.A = INV[kind] || kind; }
  return w;
}
function addrWord(kind, e) {
  const f = e.g === 'f', m = e.g === 'm';
  if (kind === 'parent-of') return f ? 'Mom' : m ? 'Dad' : 'Ba';
  if (kind === 'grandparent-of') return f ? 'Grandma' : m ? 'Grandpa' : 'Gran';
  return kind ? relWord(kind, e) : 'friend';
}
function relLabel(k, W) {   // a known relation, as shown next to a name: "housemate", or "friend of Niamh"
  if (!k.rel) return null;
  if (!k.relTo || k.relTo === W.owner) return k.rel;
  const t = W.known[k.relTo] || {}; const T = entities.get(k.relTo);
  return k.rel + ' of ' + (t.first || (T ? descFor(T, W.known, W).replace(/^an? /, 'the ') : 'someone'));
}
function descFor(e, K, W) {
  const k = K && K[e.id];
  if (k && k.first) { const rl = W ? relLabel(k, W) : k.rel; return k.first + (rl ? ' (' + rl + ')' : ''); }
  const gw = genderWords(e);
  if (e.job === 'police') return 'a patrol officer';
  if (e.age < 14) return 'a small child';
  if (e.age >= 60) return 'an elderly ' + gw.man;
  if (e.job === 'stall-keeper' && k && k.jobKnown) return 'a stall keeper';
  return e.g === 'f' ? 'an unknown female resident' : e.g === 'm' ? 'an unknown male resident' : 'an unknown resident';
}
function fillTemplate(line, ctx, K, mode) {
  // mode 'live' or 'reveal' or 'hearsay'
  return line.replace(/\{([A-F])(?:\.([a-z]+))?\}|\{(place2?|n|item|S|L|seen)\}/g, (m, role, prop, other) => {
    if (other) {
      if (other === 'seen') return String(ctx.seen || 0);
      if (other === 'place') return ctx.place; if (other === 'place2') return ctx.place2; if (other === 'n') return String(ctx.n); if (other === 'item') return ctx.item;
      if (other === 'S') return (ctx.Sid && K[ctx.Sid] && K[ctx.Sid].first) || ctx.S; if (other === 'L') return ctx.L; return m;
    }
    const e = ctx.cast[role]; if (!e) return m;
    const gw = genderWords(e);
    switch (prop) {
      case undefined: { const k = K[e.id]; if (role === 'A' && !(k && k.first)) return 'Subject'; return k && k.first ? k.first : descFor(e, K, ctx.W); }
      case 'desc': return descFor(e, K, ctx.W);
      case 'he': return gw.he; case 'him': return gw.him; case 'his': return gw.his;
      case 'first': return e.first; case 'full': return e.first + ' ' + e.last; case 'nick': return e.nick || e.first;
      case 'rel': { const kind = relKindOf(e, ctx.cast, ctx.relTo && ctx.relTo[role], ctx.want && ctx.want[role]); return kind ? relWord(kind, e) : 'acquaintance'; }
      case 'addr': return addrWord(relKindOf(e, ctx.cast, ctx.relTo && ctx.relTo[role], ctx.want && ctx.want[role]), e); case 'job': return e.job || 'worker'; case 'employer': return e.employer || 'a local firm';
      case 'home': return 'the ' + homeText(e) + ' side'; case 'age': return ageRange(e);
      default: return m;
    }
  });
}

// ---------- the week ----------
function setup() {
  for (const c of citizens) {
    const start = 7 + (hash(c.id, 'wstart') % 11);          // watching window starts between 07 and 17
    const len = 6 + (hash(c.id, 'wlen') % 3);               // six to eight hours a day
    watch[c.id] = { owner: c.id, window: [start, start + len], log: [], known: {}, notebook: [], seenSeq: [], placeDays: {}, heard: {} };
  }
}
const inWindow = (c, absMin) => { const h = (absMin % 1440) / 60; const [a, b] = watch[c.id].window; return h >= a && h < b; };
const clock = absMin => String(Math.floor((absMin % 1440) / 60)).padStart(2, '0') + ':' + String(absMin % 60).padStart(2, '0');

function play(s, A, cast, nowH) {
  for (const r of Object.keys(cast)) cast[r] = registerExtra(cast[r]);
  const day = Math.floor(nowH / 24), hour = nowH % 24;
  const startMin = nowH * 60 + (hash('min', A.id, s.id, nowH) % 40);
  let t = startMin;
  const W = watch[A.id];
  const ctx = { cast, place: '', place2: '', n: 0, item: pick(ITEMS, A.id, s.id, 'item'), S: 'Subject', L: '', W, seen: 0, relTo: null, want: wantKinds(s) };
  const snapCtx = extra => Object.assign({}, ctx, { cast: Object.assign({}, cast) }, extra || {});
  const placeOf = at => pick(PLACE_TEXT[at] || PLACE_TEXT.any, A.id, s.id, at, nowH);
  const rec = { id: s.id, tier: s.tier, category: s.category, A: A.id, at: startMin, seen: 0, lost: 0 };
  const beatTimes = {};
  const beatsSeen = [];
  const day0 = Math.floor(startMin / 1440);
  for (const b of s.beats) {
    const dur = 3 + (hash('dur', A.id, s.id, b.id, nowH) % 7);
    t += dur; beatTimes[b.id] = t;
    ctx.place = placeOf(b.at); ctx.place2 = placeOf('street'); ctx.n = 3 + (hash('n', A.id, s.id, b.id) % 15);
    const watched = inWindow(A, t) && !A.gone;
    // anything the subject is not part of (no A in who or with) still shows on camera
    if (b.indoors) { if (watched) { W.log.push({ t, kind: 'lost', text: 'SIGNAL LOST' }); rec.lost++; } continue; }
    if (!watched) continue;
    const lines = (s.log || {})[b.id]; if (!lines || !lines.length) continue;
    const idx = hash('line', A.id, s.id, b.id, nowH) % lines.length;
    W.log.push({ t, kind: 'live', snap: JSON.stringify(W.known), tmpl: lines[idx], ctx: snapCtx(), sid: s.id });
    beatsSeen.push(b.id); rec.seen++;
    // sightings: on how many separate days the watcher has seen this person at this kind of place
    const pk = b.at || 'any'; (W.placeDays[pk] = W.placeDays[pk] || new Set()).add(Math.floor(t / 1440));
  }
  // reveals: a line teaches exactly what it states (see learnFrom)
  for (const r of s.reveals || []) {
    const [role, ...rest] = r.fact.split('.'); const fact = rest.join('.');
    if (!beatsSeen.includes(r.beat)) continue;
    if (!roll(r.chance, 'reveal', A.id, s.id, r.fact, nowH)) continue;
    const e = cast[role]; if (!e) continue;
    const beat = s.beats.find(b => b.id === r.beat);
    const seenN = (W.placeDays[(beat && beat.at) || 'any'] || new Set()).size;
    if (r.minSeen && seenN < r.minSeen) continue;
    const lines = r.log.filter(l => !/\{seen\}/.test(l) || seenN >= 2); if (!lines.length) continue;
    const line = pick(lines, 'revealline', A.id, s.id, r.fact, nowH);
    const vtime = beatTimes[r.beat] + 1;
    const relTo = {}; const rm = fact.match(/^relation-to-([A-F])$/); if (rm && rm[1] !== 'A' && cast[rm[1]]) relTo[role] = cast[rm[1]];
    const lctx = snapCtx({ seen: seenN, relTo });
    const present = new Set(['A', ...[].concat((beat && beat.who) || [], (beat && beat.with) || [])]);
    const learned = learnFrom(line, lctx, W, r.channel, vtime, rm ? { role, to: rm[1] } : null, present);
    if (fact === 'job' || fact === 'employer') (W.known[e.id] = W.known[e.id] || {}).jobKnown = true;
    W.log.push({ t: vtime, kind: 'reveal', snap: JSON.stringify(W.known), tmpl: line, ctx: lctx, channel: r.channel, fact: r.fact });
    W.notebook.push({ at: vtime, who: e.id, fact: r.fact, channel: r.channel, verified: r.channel === 'document' || r.channel === 'introduction', tmpl: line, ctx: lctx, learned });
  }
  namesInPassing(s, A, cast, W, beatsSeen, beatTimes, nowH, snapCtx);
  if (s.resolves) delete pending[s.resolves.setup + '|' + A.id];
  // ambiguous setups choose a hidden truth that this life can host
  if (s.ambiguous && s.fairPlay) {
    const ok = Object.entries(s.fairPlay.truths).filter(([, id]) => byId.has(id) && lifeTiersOf(byId.get(id)).includes(A.life));
    if (ok.length) {
      const [truth] = ok[hash('truth', A.id, s.id, nowH) % ok.length];
      const Bx = cast[s.fairPlay.subject];
      pending[s.id + '|' + A.id] = { truth, B: Bx };
      // wire the hidden relation for the reveal storylet now, so later casts find it
      const rv = byId.get(s.fairPlay.truths[truth]);
      const spec = rv.roles.B;
      if (spec && spec.rel) { const [kind, target] = spec.rel.split(':'); const T = target === 'A' ? A : (rv.roles[target] && rv.roles[target].rel ? relsOf(A, rv.roles[target].rel.split(':')[0])[0] : null); if (T) addRel(Bx, kind, T); }
      if (spec && (spec.needs || []).includes('other-district')) Bx.district = DISTRICTS.find(d => d.id !== A.district).id;
      rec.truth = truth;
    }
  }
  // effects and flags
  const ef = s.effects || {};
  for (const [r, p, d] of ef.pressure || []) { if (cast[r]) cast[r].pressure[p] = Math.min(1, Math.max(0, cast[r].pressure[p] + d)); }
  for (const f of ef.flags || []) setFlag(f, cast);
  for (const f of (s.next && s.next.sets) || []) setFlag(f, cast);
  const br = (s.next && s.next.branches) || [];
  if (br.length) {
    const total = br.reduce((a, b) => a + b.w, 0); let x = unit('branch', A.id, s.id, nowH) * total; let chosen = br[0];
    for (const b of br) { if (x < b.w) { chosen = b; break; } x -= b.w; }
    for (const f of chosen.sets || []) setFlag(f, cast);
    rec.branch = chosen.label + (chosen.fizzle ? ' (fizzle)' : '');
  }
  if (ef.life) {
    A.life_changes = (A.life_changes || []).concat(ef.life);
    if (ef.life === 'job-lost') A.jobless = true;
    if (ef.life === 'job-found') A.jobless = false;
    if (ef.life === 'left-city') A.gone = true;
    if (ef.life === 'breakup') { A.partner = null; }
    if (ef.life === 'new-partner') A.partner = cast.B ? cast.B.id : 'x';
  }
  // bookkeeping
  (A.counts = A.counts || {})[s.id] = (A.counts[s.id] || 0) + 1;
  personLast[s.id + '|' + A.id] = nowH; cityLog.lastCity[s.id] = nowH;
  if (s.tier === 'dramatic') { cityLog.dramaticTotal++; cityLog.dramaticTimes.push(nowH); }
  if (s.tier === 'notable') cityLog.notableByDay[day] = (cityLog.notableByDay[day] || 0) + 1;
  const endMin = t + 2;
  for (const e of Object.values(cast)) if (!e.extra) busyUntil[e.id] = Math.max(busyUntil[e.id] || 0, endMin);
  played.push(rec);
  // hearsay for things that happened out of sight
  if (s.hearsay) scheduleHearsay(s, A, cast, nowH, startMin);
  return rec;
}

function relKindFor(e, cast) {
  const rr = cast.A.rels.find(r => r.who === e.id);   // e is <kind> of A
  return rr ? rr.kind : 'acquaintance-of';
}

// What a line teaches: the names it contains and, for a relation reveal, the relation it states. Nothing else.
// A name in a document or an introduction is verified; anywhere else it is unconfirmed until a verified source comes.
const REL_STATE_RE = new RegExp('(?<![A-Za-z])(' + vocab.relationWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(s|es)?(?![A-Za-z])', 'i');
function learnFrom(line, ctx, W, channel, at, relFact, present) {
  const verified = channel === 'document' || channel === 'introduction';
  const out = { names: [], rel: false, loose: [] };
  for (const [role, e] of Object.entries(ctx.cast)) {
    if (!e || !e.id) continue;
    // a name is tied to a person only if that person is in the scene; a name on a label for someone not there is
    // just a name, until something links it to a face
    if (present && !present.has(role)) { if (new RegExp('\\{' + role + '\\.(first|full|nick)\\}').test(line)) out.loose.push(e.id); continue; }
    const k = (W.known[e.id] = W.known[e.id] || {});
    const via = { channel, verified, at };
    if (new RegExp('\\{' + role + '\\.(first|full)\\}').test(line)) {
      if (!k.first) { k.first = e.first; k.firstAt = at; out.names.push(e.id); }
      if (!k.firstVia || (verified && !k.firstVia.verified)) k.firstVia = via;
    }
    if (new RegExp('\\{' + role + '\\.full\\}').test(line) && !k.last) { k.last = e.last; k.lastVia = via; }
    if (new RegExp('\\{' + role + '\\.nick\\}').test(line) && e.nick && !k.nick) { k.nick = e.nick; k.nickVia = via; out.names.push(e.id); }
  }
  if (relFact) {
    const X = ctx.cast[relFact.role], T = ctx.cast[relFact.to];
    const states = new RegExp('\\{(' + relFact.role + '|' + relFact.to + ')\\.(rel|addr)\\}').test(line) || REL_STATE_RE.test(line.replace(/\{[^}]*\}/g, ' '));
    if (X && T && states) {
      const kind = relKindOf(X, ctx.cast, T, ctx.want && ctx.want[relFact.role]);
      if (kind) { const k = (W.known[X.id] = W.known[X.id] || {}); k.rel = relWord(kind, X); k.relTo = T.id; k.relVia = { channel, verified, at }; out.rel = true; }
    }
  }
  return out;
}
// Names in passing (vocab.passing): people who know each other use names. At most one line per storylet.
function namesInPassing(s, A, cast, W, beatsSeen, beatTimes, nowH, snapCtx) {
  const P = vocab.passing; if (!P) return;
  const K = W.known, kA = K[A.id] || {};
  for (const b of s.beats) {
    if (!beatsSeen.includes(b.id)) continue;
    const who = [].concat(b.who || []), withs = [].concat(b.with || []), all = [...who, ...withs];
    const at = beatTimes[b.id] + 1;
    // a name tag at work
    const tagAt = A.job && !A.jobless && P.nameTag.jobs[A.job];
    if (tagAt && tagAt.includes(b.at) && who.includes('A') && !kA.first && roll(P.nameTag.chance, 'tag', A.id, s.id, b.id, nowH)) {
      const line = pick(P.nameTag.lines, 'tagline', A.id, s.id, nowH); return push(line, { A, B: cast.B }, 'document', at, A.id, 'first-name');
    }
    // answering the phone
    if (b.do === 'phone-call' && who.includes('A') && !kA.first && roll(P.phone.chance, 'phone', A.id, s.id, b.id, nowH)) {
      const line = pick(P.phone.lines, 'phoneline', A.id, s.id, nowH); return push(line, { A, B: cast.B }, 'phone', at, A.id, 'first-name');
    }
    // a parcel label (not where a storylet already turns on a label), a door plate (one resident), an order called out
    const hasDoc = (s.reveals || []).some(r => r.channel === 'document');
    if (P.parcelLabel.actions.includes(b.do) && who.includes('A') && !kA.last && !hasDoc && !s.ambiguous && !s.resolves && roll(P.parcelLabel.chance, 'parcel', A.id, s.id, b.id, nowH)) {
      return push(pick(P.parcelLabel.lines, 'parcelline', A.id, s.id, nowH), { A }, 'document', at, A.id, 'full-name');
    }
    const alone = !A.rels.some(q => q.kind === 'cohabitant-of');
    if (P.doorPlate.actions.includes(b.do) && P.doorPlate.places.includes(b.at) && who.includes('A') && alone && !kA.last && !hasDoc && roll(P.doorPlate.chance, 'plate', A.id, s.id, b.id, nowH)) {
      return push(pick(P.doorPlate.lines, 'plateline', A.id, s.id, nowH), { A }, 'document', at, A.id, 'full-name');
    }
    if (P.orderCall.actions.includes(b.do) && all.includes('A') && !kA.first && ['stall', 'cafe-stool', 'bar-kiosk', 'market-mall'].includes(b.at) && roll(P.orderCall.chance, 'order', A.id, s.id, b.id, nowH)) {
      return push(pick(P.orderCall.lines, 'orderline', A.id, s.id, nowH), { A }, 'conversation', at, A.id, 'first-name');
    }
    // a hello by name from someone of theirs who happens to pass (only people who live or work nearby)
    const G = P.greeting;
    if (G.actions.includes(b.do) && G.places.includes(b.at) && who.includes('A') && all.length === 1 && !kA.first && roll(G.chance, 'greet', A.id, s.id, b.id, nowH)) {
      const near = A.rels.filter(q => G.kinds.includes(q.kind)).map(q => entities.get(q.who)).filter(e => e && !e.gone && e.district === A.district && e.age >= 14);
      if (near.length) { const X = pick(near, 'greeter', A.id, s.id, b.id, nowH); return push(pick(G.lines, 'greetline', A.id, s.id, b.id, nowH), { A, B: X }, 'conversation', at, A.id, 'first-name'); }
    }
    if (!P.actions.includes(b.do) || !all.includes('A')) continue;
    for (const r of all) {
      if (r === 'A') continue;
      const X = cast[r]; if (!X || X.job === 'police') continue;
      const knows = A.rels.some(q => q.who === X.id && q.kind !== 'stranger-to');
      if (!knows) continue;
      const kX = K[X.id] || {};
      const canA = !kA.first || (A.nick && !kA.nick), canX = !kX.first;
      if (!canA && !canX) continue;
      if (!roll(P.chance, 'passing', A.id, s.id, b.id, r, nowH)) continue;
      const toA = canA && (!canX || roll(0.6, 'passing-dir', A.id, s.id, nowH));
      let line, fact;
      if (toA) {
        const nick = A.nick && !kA.nick && (kA.first || roll(P.nickChance, 'passing-nick', A.id, s.id, nowH));
        line = pick(nick ? P.toANick : P.toA, 'passing-line', A.id, s.id, b.id, nowH); fact = nick ? 'nickname' : 'first-name';
        return push(line, { A, B: X }, 'conversation', at, A.id, fact);
      }
      line = pick(P.byA, 'passing-line', A.id, s.id, b.id, nowH);
      return push(line, { A, B: X }, 'conversation', at, X.id, 'first-name');
    }
  }
  function push(line, pc, channel, at, whoId, fact) {
    const lctx = snapCtx({ cast: pc });
    const learned = learnFrom(line, lctx, W, channel, at, null);
    W.log.push({ t: at, kind: 'reveal', snap: JSON.stringify(W.known), tmpl: line, ctx: lctx, channel, fact: 'passing.' + fact });
    W.notebook.push({ at, who: whoId, fact: 'X.' + fact, channel, verified: channel === 'document', tmpl: line, ctx: lctx, learned, passing: true });
  }
}

const hearsayQueue = [];
const retells = {};
function scheduleHearsay(s, A, cast, nowH, startMin) {
  const hs = s.hearsay;
  const kindsFor = { neighbor: ['neighbor-of'], friend: ['friend-of'], coworker: ['coworker-of'], family: ['sibling-of', 'parent-of', 'child-of', 'cousin-of', 'grandparent-of', 'grandchild-of'], acquaintance: ['acquaintance-of'], shopkeeper: ['shopkeeper-of', 'customer-of'], landlord: ['landlord-of', 'tenant-of'] };
  const speakers = [];
  for (const sk of hs.speakers) {
    if (sk === 'anyone') { citizens.filter(c => c.district === A.district && c !== A).slice(0, 4).forEach(c => speakers.push({ c, kind: 'anyone' })); continue; }
    for (const kind of kindsFor[sk] || []) for (const r of A.rels.filter(r => r.kind === kind)) { const e = entities.get(r.who); if (e && !e.extra) speakers.push({ c: e, kind: sk }); }
  }
  // citizens in the same district also pass things on
  const seen = new Set();
  for (const sp of speakers) {
    if (seen.has(sp.c.id)) continue; seen.add(sp.c.id);
    for (let d = 0; d < 6; d++) {
      if (!roll(0.5, 'hs-try', s.id, A.id, sp.c.id, d, nowH)) continue;
      const when = nowH + 5 + Math.floor(d / 2) * 24 + (hash('hs-hour', s.id, A.id, sp.c.id, d) % 16);
      hearsayQueue.push({ at: when * 60 + (hash('hs-min', sp.c.id, d) % 50), s, A, sp, nowH, cast, key: s.id + A.id + sp.c.id + d });
    }
  }
}
function runHearsay(upToAbs, fromAbs) {
  for (const h of hearsayQueue.filter(h => !h.done && h.at >= fromAbs && h.at < upToAbs)) {
    h.done = true;
    const C = h.sp.c; if (C.gone || h.at >= DAYS * 1440) continue;
    if (!inWindow(C, h.at)) continue;
    if ((busyUntil[C.id] || 0) > h.at) continue;
    const Wc = watch[C.id];
    // the same speaker passes the same news on at most twice
    const evKey = h.s.id + '|' + h.A.id + '|' + h.nowH, tellKey = evKey + '|' + C.id;
    retells[tellKey] = (retells[tellKey] || 0) + 1; if (retells[tellKey] > 2) continue;
    const L = pick(C.rels.map(r => entities.get(r.who)).filter(Boolean), 'hs-listener', h.key) || makeExtra(C, 'listener');
    const line = pick(h.s.hearsay.lines, 'hs-line', h.key);
    const ctx = { cast: { A: h.A, S: C, L }, S: 'Subject', Sid: C.id, W: Wc, L: descFor(L, Wc.known), place: pick(['the stoop', 'the stall counter', 'a bench', 'the square'], h.key), place2: '', n: 0, item: '' };
    // people talk about people they know by name: the absent person is named in the gossip. On the speaker's monitor
    // that is just a name (nobody in view to tie it to); on the absent person's own notebook it is their first name,
    // heard secondhand
    const ctx2 = Object.assign({}, ctx, { cast: { A: h.A } });
    Wc.log.push({ t: h.at, kind: 'hearsay', snap: JSON.stringify(Wc.known), tmpl: line.replace(/\{A\.desc\}|\{A\}/g, h.A.first), ctx: ctx2, absentId: h.A.id, sid: h.s.id });
    busyUntil[C.id] = h.at + 4;
    // the absent person's notebook gains a past-tense secondhand entry
    // one entry per event: a second person saying the same thing adds a source, it doesn't add a line
    const kind = h.sp.kind === 'anyone' ? 'neighbor' : h.sp.kind;
    const WA = watch[h.A.id];
    const had = WA.notebook.find(n => n.evKey === evKey);
    if (had) {
      if (had.sources.includes(C.id)) continue;
      had.sources.push(C.id); had.kinds.push(kind);
      if (had.sources.length === 2) WA.log.push({ t: h.at, kind: 'entry', tmpl: 'Heard again, from a ' + kind + ' (in conversation). Two people now say the same.', ctx: { cast: { A: h.A } } });
      continue;
    }
    const entry = pick(h.s.hearsay.entry, 'hs-entry', h.key).replace('{S}', 'a ' + kind);
    { const k = (WA.known[h.A.id] = WA.known[h.A.id] || {}); if (!k.first) { k.first = h.A.first; k.firstAt = h.at; k.firstVia = { channel: 'hearsay', verified: false, at: h.at }; } }
    WA.notebook.push({ at: h.at, who: h.A.id, fact: 'hearsay', channel: 'conversation', verified: false, text: entry, via: C.id, evKey, sources: [C.id], kinds: [kind] });
    WA.log.push({ t: h.at, kind: 'entry', tmpl: entry, ctx: { cast: { A: h.A } } });
  }
}

function runWeek() {
  setup();
  let lastRun = 0;
  for (let nowH = 0; nowH < DAYS * 24; nowH++) {
    const day = Math.floor(nowH / 24), hour = nowH % 24;
    for (const ev of EVENTS) if (ev.day === day && hour === 6) { if (ev.who) ev.who.world[ev.flag] = true; if (ev.city) cityFlags[ev.city] = true; }
    for (const A of citizens) {
      if (A.gone) continue;
      if ((busyUntil[A.id] || 0) > nowH * 60) continue;
      const curve = hour < 6 ? 0.02 : hour < 9 ? 0.15 : hour < 17 ? 0.18 : hour < 23 ? 0.28 : 0.12;
      const mult = { quiet: 0.75, textured: 0.9, eventful: 1.1 }[A.life] * 0.6;
      if (!roll(curve * mult, 'slot', A.id, nowH)) continue;
      const opts = [];
      for (const s of stories) {
        const cast = eligible(s, A, nowH, day, hour);
        if (cast) opts.push({ s, cast, w: weightOf(s, A, cast, nowH) });
      }
      if (!opts.length) continue;
      const total = opts.reduce((a, o) => a + o.w, 0); let x = unit('pick', A.id, nowH) * total; let chosen = opts[opts.length - 1];
      for (const o of opts) { if (x < o.w) { chosen = o; break; } x -= o.w; }
      play(chosen.s, A, chosen.cast, nowH);
    }
    runHearsay((nowH + 1) * 60, nowH * 60);
  }
}

// ---------- output ----------
const cap = t => t.replace(/(^|[.!?]\s+|Overheard:\s+|Posted:\s+|one side:\s+|:\s+")([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
function renderLog(c) {
  const W = watch[c.id]; const out = [];
  const entries = W.log.slice().sort((a, b) => a.t - b.t);
  for (const e of entries) {
    const day = Math.floor(e.t / 1440) + 1; const stamp = 'D' + day + ' ' + clock(e.t);
    if (e.kind === 'lost') { out.push({ stamp, text: 'SIGNAL LOST', cls: 'lost' }); continue; }
    if (e.kind === 'entry') { out.push({ stamp, text: 'Notebook entry: ' + cap(fillTemplate(e.tmpl, e.ctx, W.known)), cls: 'entry' }); continue; }
    const text = cap(fillTemplate(e.tmpl, e.ctx, W.known));
    const was = cap(fillTemplate(e.tmpl, e.ctx, JSON.parse(e.snap)));
    out.push({ stamp, text, was: was !== text ? was : null, cls: e.kind });
  }
  return out.filter((l, i) => !(l.cls === 'lost' && out[i - 1] && out[i - 1].cls === 'lost'));
}
function describeTruth(c) {
  const bits = [c.first + ' ' + c.last + (c.nick ? ' ("' + c.nick + '")' : ''), ageRange(c) + ', ' + (c.g === 'f' ? 'female' : c.g === 'm' ? 'male' : 'nonbinary'), c.job ? c.job + ' at ' + c.employer : 'no job', homeText(c) + ', ' + (c.rels.some(r => r.kind === 'cohabitant-of') ? 'shares a home' : 'lives alone')];
  if (c.partner) bits.push('has a partner');
  const fam = ['sibling-of', 'parent-of', 'child-of'].filter(k => c.rels.some(r => r.kind === k)).length;
  bits.push(fam + ' kinds of family nearby');
  return bits.join('; ');
}
function sheet(c, fmt) {
  const W = watch[c.id]; const lines = renderLog(c);
  const mine = played.filter(p => p.A === c.id);
  const L = [];
  L.push('## Citizen ' + (c.idx + 1) + ': ' + (W.known[c.id] && W.known[c.id].first ? W.known[c.id].first : 'Subject') + ' (' + c.life + ' life)');
  L.push('');
  L.push('Answer key (hidden from the watcher): ' + describeTruth(c));
  L.push('Watching window each day: ' + clock(W.window[0] * 60) + ' to ' + clock(Math.min(W.window[1], 24) * 60) + '. Storylets that happened to this person this week: ' + mine.length + '; lines the watcher got: ' + lines.filter(l => l.cls === 'live' || l.cls === 'reveal').length + '.');
  L.push('');
  L.push('Monitor log:');
  L.push('');
  if (!lines.length) L.push('    (nothing reached the monitor this week)');
  for (const l of lines) { L.push('    ' + l.stamp + '  ' + l.text + (l.was ? '  [rewritten]' : '')); if (l.was) L.push('                  first logged as: ' + l.was); }
  L.push('');
  // The notebook: details (only what a document, an introduction or a stated name gave), the people around them
  // (names and stated relations), and observations (everything else, labeled by how the watcher knows it, never
  // by what it might mean)
  const VIA = v => !v ? '' : ({ document: 'read on a document', introduction: 'introduced', conversation: 'overheard', phone: 'heard on the phone', feed: 'posted', seen: 'seen', hearsay: 'heard secondhand' }[v.channel] || v.channel) + ', ' + (v.verified ? 'verified' : 'unconfirmed');
  const HOW = { seen: 'Seen', conversation: 'Overheard', phone: 'On the phone', feed: 'Posted', document: 'Read', introduction: 'Introduced' };
  const DETAIL = { job: 'Job', employer: 'Employer', home: 'Home', cohabitants: 'Lives with', 'age-range': 'Age' };
  const stamp = t => 'D' + (Math.floor(t / 1440) + 1) + ' ' + clock(t);
  const text = n => cap(fillTemplate(n.tmpl, n.ctx, W.known)).replace(/^(Overheard|Posted|Phone, one side):\s*/, '');
  const ks = W.known[c.id] || {};
  const det = [];
  if (ks.first) det.push('- Name: ' + ks.first + (ks.last ? ' ' + ks.last : '') + ' [' + VIA(ks.lastVia && ks.lastVia.verified ? ks.lastVia : ks.firstVia) + ']');
  if (ks.nick) det.push('- Goes by: ' + ks.nick + ' [' + VIA(ks.nickVia) + ']');
  const isDetail = n => n.fact !== 'hearsay' && !n.passing && n.who === c.id && (n.channel === 'document' || n.channel === 'introduction') && DETAIL[n.fact.split('.').slice(1).join('.')];
  for (const n of W.notebook.filter(isDetail)) det.push('- ' + DETAIL[n.fact.split('.').slice(1).join('.')] + ': ' + text(n) + ' [' + VIA(n) + ']');
  const ppl = [];
  for (const [id, k] of Object.entries(W.known)) {
    if (id === c.id || !(k.first || k.rel)) continue;
    const e = entities.get(id); if (!e) continue;
    const who = k.first ? k.first + (k.last ? ' ' + k.last : '') : descFor(e, {}, W).replace(/^an? /, 'An ').replace(/^unknown/, 'Unknown');
    const rl = relLabel(k, W);
    const bits = []; if (k.first) bits.push('name ' + VIA(k.lastVia && k.lastVia.verified ? k.lastVia : k.firstVia)); if (rl) bits.push('relation ' + VIA(k.relVia));
    ppl.push('- ' + who + (rl ? ': ' + rl : '') + ' [' + bits.join('; ') + ']');
  }
  const obs = [];
  for (const n of W.notebook) {
    if (n.passing || isDetail(n) || (n.learned && n.learned.rel)) continue;
    if (n.fact === 'hearsay') { obs.push('- ' + stamp(n.at) + ' Secondhand: ' + n.text.replace(/\s+$/, '') + ' [unconfirmed; heard from ' + n.sources.length + (n.sources.length > 1 ? ' people: ' + Object.entries(n.kinds.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})).map(([k, v]) => v > 1 ? v + ' ' + k + 's' : 'a ' + k).join(', ') : ' person') + ']'); continue; }
    if (n.learned && n.learned.names.length && /first-name|full-name|last-name|nickname/.test(n.fact)) continue;   // it's in the details already
    obs.push('- ' + stamp(n.at) + ' ' + (HOW[n.channel] || n.channel) + ': ' + text(n) + ' [' + (n.verified ? 'verified' : 'unconfirmed') + ']');
  }
  L.push('Notebook, details:');
  L.push('');
  L.push(det.length ? det.join('\n') : '- (blank)');
  L.push('');
  L.push('Notebook, people around them:');
  L.push('');
  L.push(ppl.length ? ppl.join('\n') : '- (none known)');
  L.push('');
  L.push('Notebook, observations:');
  L.push('');
  L.push(obs.length ? obs.join('\n') : '- (none)');
  L.push('');
  L.push('What really happened, most of it unseen: ' + (mine.length ? mine.map(p => p.id.replace(/^[a-z]+\./, '')).join(', ') : 'nothing of note') + '.');
  L.push('');
  return L.join('\n');
}

function summary() {
  const out = [];
  const tiers = { quiet: 0, textured: 0, eventful: 0 }; citizens.forEach(c => tiers[c.life]++);
  out.push('# Life sheet: ' + PEOPLE + ' citizens, ' + DAYS + ' days, seed "' + SEED + '"');
  out.push('');
  out.push('Eventfulness split: ' + Object.entries(tiers).map(([k, v]) => k + ' ' + v + ' (' + Math.round(v / PEOPLE * 100) + '%)').join(', ') + '.');
  out.push('Storylets played in the week (seen or not): ' + played.length + '.');
  const byTier = {}, byCat = {}; played.forEach(p => { byTier[p.tier] = (byTier[p.tier] || 0) + 1; byCat[p.category] = (byCat[p.category] || 0) + 1; });
  out.push('By tier: ' + Object.entries(byTier).map(([k, v]) => k + ' ' + v).join(', ') + '.');
  out.push('By category: ' + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') + '.');
  const dist = {}; played.forEach(p => { dist[p.A] = (dist[p.A] || 0); });
  const perLife = {}; for (const c of citizens) { const n = played.filter(p => p.A === c.id).length; (perLife[c.life] = perLife[c.life] || []).push(n); }
  out.push('Storylets per person by life: ' + Object.entries(perLife).map(([k, v]) => k + ' avg ' + (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)).join(', ') + '.');
  const domByLife = {}; for (const p of played) { const c = entities.get(p.A); if (p.tier === 'notable' || p.tier === 'dramatic') domByLife[c.life] = (domByLife[c.life] || 0) + 1; }
  out.push('Notable and dramatic storylets by life: ' + (Object.entries(domByLife).map(([k, v]) => k + ' ' + v).join(', ') || 'none') + '.');
  const dram = played.filter(p => p.tier === 'dramatic');
  out.push('Dramatic storylets this week (director cap 3, none within 36 hours of each other): ' + (dram.length ? dram.map(p => p.id).join(', ') : 'none') + '.');
  // unique sequences
  const seqAll = citizens.map(c => played.filter(p => p.A === c.id).map(p => p.id).join('>'));
  const seqLog = citizens.map(c => watch[c.id].log.filter(l => l.sid).map(l => l.sid).join('>'));
  const dupes = a => { const m = {}; a.forEach((s, i) => { (m[s] = m[s] || []).push(i + 1); }); return Object.values(m).filter(v => v.length > 1); };
  const dAll = dupes(seqAll), dLog = dupes(seqLog);
  out.push('Distinct full-week storylet sequences: ' + new Set(seqAll).size + ' of ' + PEOPLE + (dAll.length ? ' (shared by citizens ' + dAll.map(v => v.join(' and ')).join('; ') + ')' : '') + '.');
  out.push('Distinct sequences in what the watcher saw: ' + new Set(seqLog).size + ' of ' + PEOPLE + (dLog.length ? ' (shared by citizens ' + dLog.map(v => v.join(' and ')).join('; ') + ')' : '') + '.');
  const lived = citizens.filter(c => watch[c.id].log.some(l => l.cls === 'live' || l.kind === 'live')).length;
  out.push('Citizens with at least one live line: ' + lived + ' of ' + PEOPLE + '.');
  let seenL = 0, lostL = 0, revL = 0, hsL = 0, entL = 0;
  for (const c of citizens) for (const l of watch[c.id].log) { if (l.kind === 'live') seenL++; else if (l.kind === 'lost') lostL++; else if (l.kind === 'reveal') revL++; else if (l.kind === 'hearsay') hsL++; else if (l.kind === 'entry') entL++; }
  out.push('Lines across all monitors: live ' + seenL + ', reveals ' + revL + ', hearsay overheard ' + hsL + ', hearsay notebook entries ' + entL + ', signal lost ' + lostL + '.');
  const chains = played.filter(p => p.branch);
  out.push('Chains that rolled a branch: ' + chains.length + ' (' + chains.filter(p => /fizzle/.test(p.branch)).length + ' fizzled).');
  const truths = played.filter(p => p.truth);
  out.push('Ambiguous setups played: ' + truths.length + (truths.length ? ' (hidden truths: ' + truths.map(p => p.truth).join(', ') + ')' : '') + '.');
  const setups = played.filter(p => p.truth), resolved = played.filter(p => byId.get(p.id).resolves);
  out.push('Ambiguous setups that were later settled by a reveal storylet: ' + resolved.length + ' of ' + setups.length + '.');
  // how fast the watcher learns names: the subject's own first name, by day of watching
  const firstDay = citizens.map(c => { const k = watch[c.id].known[c.id]; return k && k.first ? Math.floor(k.firstAt / 1440) + 1 : null; });
  out.push('Subjects whose first name the watcher had: ' + [1, 2, 3, 5, 7].map(d => 'by day ' + d + ' ' + firstDay.filter(x => x && x <= d).length).join(', ') + ' (of ' + PEOPLE + ').');
  const verifiedFull = citizens.filter(c => { const k = watch[c.id].known[c.id]; return k && k.last; }).length;
  out.push('Subjects with a full name by the end of the week: ' + verifiedFull + '. Other people named on the monitors: ' + citizens.reduce((a, c) => a + Object.entries(watch[c.id].known).filter(([id, k]) => id !== c.id && k.first).length, 0) + '; with a stated relation: ' + citizens.reduce((a, c) => a + Object.entries(watch[c.id].known).filter(([id, k]) => id !== c.id && k.rel).length, 0) + '.');
  const gone = citizens.filter(c => c.gone).length; if (gone) out.push('Citizens who left the city: ' + gone + ' (still in the notebook, past tense).');
  out.push('');
  return out.join('\n');
}

runWeek();
const head = summary();
const only = opt('only', null);
const showAll = opt('all', false) === true || args.includes('--all');
const sample = only ? [citizens[Number(only) - 1]] : showAll ? citizens : [citizens.find(c => c.life === 'quiet'), citizens.find(c => c.life === 'textured'), citizens.find(c => c.life === 'eventful')].filter(Boolean);
if (args.includes('--save')) {
  const dir = path.join(__dirname, 'sheets'); fs.mkdirSync(dir, { recursive: true });
  const tag = SEED.replace(/[^a-z0-9-]/gi, '');
  fs.writeFileSync(path.join(dir, 'week-' + tag + '-summary.md'), head);
  fs.writeFileSync(path.join(dir, 'week-' + tag + '-all-' + PEOPLE + '-citizens.md'), head + '\n' + citizens.map(c => sheet(c)).join('\n'));
  console.log('wrote tools/stories/sheets/week-' + tag + '-summary.md and week-' + tag + '-all-' + PEOPLE + '-citizens.md');
}
console.log(head);
console.log(sample.map(c => sheet(c)).join('\n'));
