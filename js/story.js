// Neon Terrarium: stories. Who people are (names, ages, the people in their lives), the small changes in their days,
// and the story moments (storylets, data/stories/) played out on the street with real people, for the person the player
// is watching on the monitor (monitor.js).
// All game scripts share one scope and load in order (see index.html). Loads after people.js and metro.js.
'use strict';
//
// How it fits together:
// - Everyone already has a home, maybe a job and a routine (people.js). Here each of them also gets a name, an age, a
//   temperament and a place in a web of people: the household, neighbors two doors down, coworkers, the keeper of the
//   stall they use, a couple of friends across town, family elsewhere. Those long ties keep anyone a few steps from
//   anyone else (six degrees: the monitor's answer key, and STORY.degreesOf(), show the numbers).
// - Days vary a little: a sick day at home (nobody sees it: the door just stays shut), a late start, a day off. All by
//   hash of the person and the day, so the same city has the same week.
// - The player clicks someone: the monitor follows them. While they're watched, a director picks storylets that fit
//   them, the hour and the people around them, and plays them out: real people walk to real doors, knock, hand things
//   over, talk. The monitor logs only what can be seen from where they are (rules in tools/stories/SCHEMA.md), and
//   learns only what a line states.
// - Delivery drones wait at the door for someone to come out and take the parcel. What's in it follows the person's
//   life (medicine when they're sick, a dress, a letter, papers from a law office), and so does what they do next:
//   nothing, a call, a post on the mesh.
// - People who aren't watched still get sick and get parcels; the people who know them talk about it, and the player
//   can overhear it while watching someone else.

/* ---------- fast forward ---------- */
// The clock (S.hour, with the day cycle on) and the people (their walking, waiting and deciding) run faster together:
// at 10x a day takes six minutes, at 60x one. People speed up less than the clock, so they still read as people.
// Fast forward needs the clock running, so it switches the day cycle on if it was off, and back to 1x puts it back as it was: left running, the sun's
// creep had the shadow map redrawn every half second at 1x, and the crisp shadows re-snapping to its new grid read as a flicker over the whole city.
const FF = { clock: 1, ppl: 1, t: null, cycleWas: null };
FF.set = k => {
  FF.clock = k; FF.ppl = k >= 60 ? 6 : k >= 10 ? 3 : 1;
  const box = document.getElementById('cycle');
  if (k > 1 && !S.cycle){ FF.cycleWas = false; S.cycle = true; if (box) box.checked = true; }
  else if (k <= 1 && FF.cycleWas === false){ FF.cycleWas = null; S.cycle = false; if (box) box.checked = false; }
};
FF.peopleTime = (dt, now) => { if (FF.t === null) FF.t = now; FF.t += dt*FF.ppl; return FF.t; };

const STORY = (() => {
  const ST = { on: false, failed: null, watch: null, follow: true, clock: 0, lastHour: null, degrees: null, ver: '' };
  { const cs = document.currentScript; ST.ver = (cs && cs.src.split('?v=')[1]) || ''; }
  const mix = h => { h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return h >>> 0; };
  const H = (...a) => mix(hash(a.join('|')));
  const U = (...a) => H(...a)/4294967296;
  const pick = (arr, ...a) => arr[H(...a) % arr.length], STORY_PICK = pick;
  const roll = (p, ...a) => U(...a) < p;
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const day = () => Math.floor(ST.clock/1440);
  const hourNow = () => (ST.clock % 1440)/60;
  ST.day = day;
  let D = null;   // the data: { vocab, names, engine, stories, byId }

  /* ---------- data ---------- */
  const get = f => fetch('data/stories/' + f + '.json' + (ST.ver ? '?v=' + ST.ver : '')).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  // what the game can stage on its streets today: storylets whose seen steps are all things people can do here
  const ACT_OK = new Set(['walk', 'run', 'walk-together', 'enter', 'leave', 'stand', 'wait-outside', 'knock-and-wait', 'read-notice', 'point', 'shrug', 'wave', 'emote', 'umbrella',
    'water-plant', 'chat', 'argue', 'hug', 'hand-over', 'serve', 'queue-order', 'phone-call', 'post-feed', 'sit', 'eat', 'picnic', 'bump', 'carry', 'pick-up', 'share-umbrella',
    'watch-hologram']);   // (no 'receive-delivery': parcels come with a real drone, from the engine's deliveries below)
  const AT_OK = new Set(['home-door', 'street', 'shop-door', 'work-door', 'stall', 'square', 'cafe-stool', 'bench', 'lawn', 'market-mall', 'bar-kiosk', 'any', 'foundry-gate']);
  const MOVE = new Set(['walk', 'run', 'walk-together', 'carry']);
  const TALK = new Set(['chat', 'argue', 'hug', 'hand-over', 'serve', 'queue-order', 'share-umbrella', 'bump', 'pick-up']);
  ST.load = () => get('vocab').then(vocab => {
    const files = vocab.categories.map((c, i) => String(i + 1).padStart(2, '0') + '-' + c.id);
    return Promise.all([get('names'), get('engine'), ...files.map(get)]).then(([names, engine, ...cats]) => {
      const stories = [];
      for (const c of cats) for (const s of c.storylets){
        const when = Object.assign({ hours: [0, 24], days: 'any', weather: 'any', weight: 5 }, s.when || {});
        when.cooldown = Object.assign({ person: 24, city: 1 }, when.cooldown || {});
        const st = Object.assign({}, s, { category: c.category, when, unwatched: !!s.unwatched });
        st.game = !st.unwatched && s.beats.every(b => b.indoors || (ACT_OK.has(b.do) && (!b.at || AT_OK.has(b.at))));
        stories.push(st);
      }
      D = { vocab, names, engine, stories, byId: new Map(stories.map(s => [s.id, s])) };
      D.first = names.first.map(x => { const [n, g, nick] = x.split('|'); return { n, g, nick: (nick || '').split(',').filter(Boolean) }; });
      D.relRe = new RegExp('(?<![A-Za-z])(' + vocab.relationWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(s|es)?(?![A-Za-z])', 'i');
      restore();
      ST.on = true;
    });
  }).catch(e => { ST.failed = String(e); console.warn('stories: not loaded (' + e + '); the monitor still follows people'); });

  /* ---------- who people are ---------- */
  const SPM = new Map();   // person id -> story person
  const IDENT = new Map(); // person id -> { first, last, nick, g } kept for people the player knows, even after they're gone
  function genderOf(p){
    if (typeof PG !== 'undefined' && PG.live && PG.live() && PG.shapes){
      const sh = PG.shapes[PG.shapeOf(p.row)];
      if (sh){ if ((sh.props || []).includes('beard')) return 'm'; if (/skirt|dress/.test(sh.bottom + ' ' + sh.top + ' ' + sh.name)) return 'f'; }
    }
    const u = U(p.id, 'g'); return u < .47 ? 'f' : u < .94 ? 'm' : 'n';
  }
  function makeSP(p){
    const id = p.id, g = genderOf(p);
    const pools = D.pools || (D.pools = { f: D.first.filter(f => f.g === 'f' || f.g === 'n'), m: D.first.filter(f => f.g === 'm' || f.g === 'n'), n: D.first });
    const pool = pools[g] || D.first, f = pick(pool.length ? pool : D.first, id, 'first');
    const elder = typeof PG !== 'undefined' && PG.shapes && PG.shapes[PG.shapeOf(p.row)] && /elder|cane/.test(PG.shapes[PG.shapeOf(p.row)].name);
    const sp = { id, g, first: f.n, nick: f.nick.length ? pick(f.nick, id, 'nick') : null, last: pick(D.names.last, id, 'last'),
      age: elder ? 62 + H(id, 'age') % 22 : 19 + H(id, 'age') % 46,
      life: (u => u < .6 ? 'quiet' : u < .9 ? 'textured' : 'eventful')(U(id, 'life')),
      temper: { outgoing: Math.max(0, Math.min(1, ((p.outgoing ?? .5) - .25)/.65)), careful: U(id, 'careful'), warm: U(id, 'warm') },
      pressure: { money: U(id, 'p-money')*.9, loneliness: U(id, 'p-lone')*.8, 'work-trouble': U(id, 'p-work')*.8, secret: U(id, 'p-secret')*.7, 'life-change': U(id, 'p-life')*.6 },
      regulars: ['stall', 'bench', 'club', 'bar-kiosk', 'lawn', 'square', 'bathhouse', 'metro'].filter((r, k) => roll(.28, id, 'reg', k)),
      rels: [], flags: {}, counts: {}, umbrella: roll(.6, id, 'umb') };
    return sp;
  }
  const FLAGS0 = new Map();   // flags and counts saved last session, put back when the person is next made
  const spOf = p => { if (!p) return null; let s = SPM.get(p.id); if (!s && D){ s = makeSP(p); SPM.set(p.id, s); const f = FLAGS0.get(p.id); if (f){ FLAGS0.delete(p.id); Object.assign(s.flags, f[0]); Object.assign(s.counts, f[1]); } } return s; };
  ST.sp = spOf;
  ST.pOf = id => pOf(id);
  const pOf = id => people.get(id) || null;
  const ident = id => { const s = SPM.get(id); if (s){ const v = { first: s.first, last: s.last, nick: s.nick, g: s.g }; IDENT.set(id, v); return v; } return IDENT.get(id) || { first: '?', last: '?', nick: null, g: 'n' }; };

  // what they do for a living, as a storylet's needs and lines know it
  function jobKind(p){
    const pl = p.job && places.get(p.job); if (!pl) return null;
    if (p.courier) return 'courier';
    const k = pl.mega && pl.mega.kind;
    if (k) return { square: 'stall-keeper', mall: 'shop-worker', market: 'shop-worker', foundry: 'industrial', logistics: 'industrial', club: 'club-staff', radio: 'radio', wirenest: 'radio', police: 'police', pagoda: 'hotel-spa', greenhouse: 'greenhouse', bathhouse: 'bathhouse-staff' }[k] || 'shop-worker';
    const c = pl.cell, z = c && c.sections && c.sections.length ? c.sections[c.sections.length - 1].zone : 'mid';
    return { mid: 'shop-worker', high: 'office-worker', ind: 'industrial', low: 'shop-worker' }[z] || 'shop-worker';
  }
  const JOB_WORD = { 'stall-keeper': 'stall keeper', 'shop-worker': 'shop assistant', 'office-worker': 'office clerk', industrial: 'line worker', courier: 'courier', 'club-staff': 'door staff',
    radio: 'grid technician', police: 'officer', 'hotel-spa': 'hotel staff', greenhouse: 'grower', 'bathhouse-staff': 'bathhouse attendant' };
  const SHOPS = ['Okada Repair', 'Tanaka Grocers', 'Lantern Tea House', 'Harbor Records', 'Clear Water Clinic', 'Swift Parcel', 'Kiln and Forge', 'Blue Heron Noodles', 'Moth Light Optics', 'Sato Hardware', 'Copperline Print', 'Little Ox Laundry'];
  function employerName(p){
    const pl = p.job && places.get(p.job); if (!pl) return 'a local firm';
    const k = pl.mega && pl.mega.kind;
    if (k) return { square: 'the night market', mall: 'the mall', market: 'the market mall', foundry: 'Foundry No. ' + (1 + H(pl.id) % 9), logistics: 'the logistics hub', club: 'the Neon Dome', radio: 'the Psycho-Acoustic Grid',
      police: 'the precinct', pagoda: 'the Cloud Pagoda', greenhouse: 'the greenhouse farm', bathhouse: 'the bathhouse' }[k] || 'the ' + k;
    return pick(SHOPS, pl.id, 'shop');
  }
  // a place as the camera sees it: never "home" or "work" (the player has to work that out)
  function placeText(pl, salt){
    if (!pl) return 'a building';
    const k = pl.mega && pl.mega.kind;
    if (k) return MEGA_NAME[k] || 'the ' + k;
    if (pl.open) return pl.cell && pl.cell.green === 'grass' ? 'the lawn' : 'the plaza';
    return 'a building';
  }
  // (logs saved before buildings were named plainly: their old descriptions read as "a building")
  const OLD_PLACE = new Map([...['a door', 'a tenement door', 'a patched metal door', 'a door under the laundry lines', 'a shopfront door', 'a door under an awning', 'a door between two stalls',
    'a tower lobby', 'a glass door in a white tower', 'a lobby with cyan trim', 'a factory door', 'a green-painted works door', 'a door by the tank yard', 'the door', 'the step', 'the front step',
    'the work door', 'the staff door', 'the shop door'].map(t => [t, 'a building']), ['the precinct door', 'the police station'], ['the foundry gate', 'the foundry'], ['the noodle stall', 'the stall'],
    ['the tea stall', 'the stall'], ['the dumpling counter', 'the counter'], ['the pond edge', 'the square'], ['the cafe stools', 'the seats'], ['the stool row', 'the seats'], ['the bench by the pond', 'the seats'],
    ['a plaza bench', 'the seats'], ['the grass plot', 'the lawn'], ['the bar kiosk', 'the kiosk'], ['the market mall', 'the market plaza'], ['the little plaza', 'the plaza'], ['a bench by the walk', 'the plaza'], ['a bench on the lawn', 'the lawn']]);

  // A building as the log names it, from what the player has found out so far (rendered each time, so an old line catches up): the subject's own
  // home or workplace once a line has stated it ("her home", "his workplace"), someone else's once their name and that fact are known ("Mika's
  // building"), a landmark by its name (the signs say so), and otherwise just "a building". Open places by what they are.
  const MEGA_NAME = { square: 'the town square', mall: 'the sky mall', market: 'the market plaza', foundry: 'the foundry', logistics: 'the logistics hub', club: 'the Neon Dome',
    radio: 'the Psycho-Acoustic Grid', police: 'the police station', pagoda: 'the Cloud Pagoda', greenhouse: 'the hydroponic farm', bathhouse: 'the bathhouse', spire: 'the Data Spire', wirenest: 'the Wire Nest', emitter: 'the Emitter Core' };
  const ASSOC = { rev: -1, m: new Map() };   // place id -> [{ who, kind: 'home' | 'work' }], from the notebook's stated facts
  function assocOf(pid){
    if (ASSOC.rev !== ST.rev){ ASSOC.rev = ST.rev; ASSOC.m.clear();
      for (const list of NOTES.values()) for (const n of list){
        const f = (n.fact || '').split('.').slice(1).join('.'), p = n.who && pOf(n.who); if (!p) continue;
        const kind = f === 'home' || f === 'cohabitants' ? 'home' : f === 'job' || f === 'employer' ? 'work' : null; if (!kind) continue;
        const at = kind === 'home' ? p.home : p.job; if (!at) continue;
        const a = ASSOC.m.get(at) || ASSOC.m.set(at, []).get(at); if (!a.some(x => x.who === n.who && x.kind === kind)) a.push({ who: n.who, kind });
      } }
    return ASSOC.m.get(pid) || null;
  }
  function placeName(pid, subj){
    const pl = places.get(pid); if (!pl) return 'a building';
    const k = pl.mega && pl.mega.kind, a = assocOf(pid) || [];
    const own = a.find(x => x.who === subj);
    if (own) return PRON(ident(subj).g).his + (own.kind === 'home' ? ' home' : ' workplace');
    if (k) return MEGA_NAME[k] || 'the ' + k;
    if (pl.open) return pl.cell && pl.cell.green === 'grass' ? 'the lawn' : 'the plaza';
    for (const x of a){ const kk = KN.get(x.who); if (kk && kk.first) return kk.first + '\'s ' + (x.kind === 'home' ? 'building' : 'workplace'); }
    for (const x of a){ const kk = KN.get(x.who); if (kk && kk.rel && (!kk.relTo || kk.relTo === subj)) return 'a ' + kk.rel + '\'s building'; }
    return 'a building';
  }
  ST.placeName = placeName;
  ST.testFact = (who, fact) => note(who, { t: ST.clock, who, fact: 'A.' + fact, channel: 'document', verified: true, tmpl: '(test)', cast: { A: who }, ctx: {}, learned: { names: [], rel: false, loose: [] } });   // (tools: as if a line had stated it)

  /* ---------- the web of people (six degrees) ---------- */
  const INV = { 'parent-of': 'child-of', 'child-of': 'parent-of', 'grandparent-of': 'grandchild-of', 'grandchild-of': 'grandparent-of', 'creditor-of': 'debtor-of', 'debtor-of': 'creditor-of',
    'landlord-of': 'tenant-of', 'tenant-of': 'landlord-of', 'boss-of': 'employee-of', 'employee-of': 'boss-of', 'aunt-uncle-of': 'niece-nephew-of', 'niece-nephew-of': 'aunt-uncle-of',
    'shopkeeper-of': 'customer-of', 'customer-of': 'shopkeeper-of' };
  // rels on Y read "who is <kind> of Y"
  function addRel(a, kind, b){
    if (!a || !b || a === b) return;
    if (!b.rels.some(r => r.kind === kind && r.who === a.id)) b.rels.push({ kind, who: a.id });
    const inv = INV[kind] || kind;
    if (!a.rels.some(r => r.kind === inv && r.who === b.id)) a.rels.push({ kind: inv, who: b.id });
  }
  const relsOf = (x, kind) => x.rels.filter(r => r.kind === kind).map(r => SPM.get(r.who)).filter(s => s && people.has(s.id));
  const extraRels = [];   // relations made when a storylet needed one (a creditor, a rival): [aId, kind, bId], kept through rebuilds
  let netSig = '', netAt = -1e9;
  function buildNet(){
    const T = [performance.now()], TN = ['start'];
    const list = [...people.values()].filter(p => !p.visitor && places.has(p.home));
    const sps = list.map(spOf);
    for (const s of sps){ s.rels = []; s.home = pOf(s.id).home; if (s.k === undefined) s.k = H(s.id); }
    // (pair keys from numbers: the string hash for each pair, in the sorts below, was most of the time this took)
    const K2 = (a, b, salt) => mix(a.k ^ Math.imul(b.k, 0x9e3779b1) ^ salt);
    const byId = new Map(sps.map(s => [s.id, s]));
    T.push(performance.now()); TN.push('hh');
    // households: partners, siblings, parents and children, housemates; family shares a surname
    const homes = new Map(); for (const p of list){ (homes.get(p.home) || homes.set(p.home, []).get(p.home)).push(spOf(p)); }
    for (const [hid, hs] of homes){
      hs.sort((a, b) => a.id < b.id ? -1 : 1);
      if (hs.length < 2) continue;
      const [a, b] = hs, u = U(hid, 'house');
      for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) addRel(hs[i], 'cohabitant-of', hs[j]);
      if (u < .45){ addRel(a, 'partner-of', b); if (roll(.5, hid, 'sharename')) b.last = a.last; }
      else if (u < .7){ addRel(a, 'sibling-of', b); b.last = a.last; }
      for (const c of hs.slice(2)){
        if (c.age + 18 <= a.age){ addRel(a, 'parent-of', c); c.last = a.last; }
        else if (roll(.4, c.id, 'kin')){ addRel(c, 'sibling-of', a); c.last = a.last; }
      }
    }
    T.push(performance.now()); TN.push('nb');
    // neighbors: people in the homes next door
    const G = new Map(), gk = (x, z) => Math.floor(x/(LOT*2)) + ',' + Math.floor(z/(LOT*2));
    for (const [hid, hs] of homes){ const pl = places.get(hid); if (!pl) continue; const k = gk(pl.x, pl.z); (G.get(k) || G.set(k, []).get(k)).push([pl, hs]); }
    for (const [hid, hs] of homes){
      const pl = places.get(hid); if (!pl) continue;
      const gx = Math.floor(pl.x/(LOT*2)), gz = Math.floor(pl.z/(LOT*2)), near = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [o, os] of G.get((gx + a) + ',' + (gz + b)) || []) if (o.id !== hid && Math.hypot(o.x - pl.x, o.z - pl.z) < LOT*1.7) near.push(...os);
      for (const s of hs){ near.sort((x, y) => K2(s, x, 11) - K2(s, y, 11)); for (const o of near.slice(0, 3)) addRel(o, 'neighbor-of', s); }
    }
    T.push(performance.now()); TN.push('cw');
    // coworkers, and a boss where there's a crew
    const jobs = new Map(); for (const p of list) if (p.job && !p.cop && !p.guard){ (jobs.get(p.job) || jobs.set(p.job, []).get(p.job)).push(spOf(p)); }
    for (const [jid, js] of jobs){
      for (const s of js){ const o = js.filter(x => x !== s).sort((x, y) => K2(s, x, 22) - K2(s, y, 22)); for (const c of o.slice(0, 3)) addRel(c, 'coworker-of', s); }
      if (js.length >= 3){ const boss = js.reduce((m, x) => x.age > m.age ? x : m, js[0]); for (const s of js) if (s !== boss) addRel(boss, 'boss-of', s); }
    }
    T.push(performance.now()); TN.push('kp');
    // the keeper of the stall they use
    const keepers = list.filter(p => p.stall !== null && p.stall !== undefined && p.job && places.get(p.job) && places.get(p.job).stalls).map(spOf);
    if (keepers.length) for (const s of sps){ if (keepers.includes(s)) continue; addRel(keepers[H(s.id, 'stallk') % keepers.length], 'shopkeeper-of', s); }
    T.push(performance.now()); TN.push('lt');
    // long ties across town: friends, family elsewhere, an ex. These keep the whole city a few steps apart.
    const N = sps.length;
    const SALT = { fr: 31, kin: 37, exs: 41, cred: 43 };
    const sample = (s, salt, n) => { const out = []; for (let k = 0; k < n && N > 1; k++){ const o = sps[mix(s.k ^ Math.imul(SALT[salt] + k*97, 0x85ebca6b)) % N]; if (o !== s && !out.includes(o)) out.push(o); } return out; };
    for (const s of sps){
      for (const o of sample(s, 'fr', 2)) addRel(o, 'friend-of', s);
      const far = sample(s, 'kin', 6).filter(o => { const a = places.get(o.home), b = places.get(s.home); return a && b && Math.hypot(a.x - b.x, a.z - b.z) > LOT*4; });
      if (far.length && roll(.35, s.id, 'kinfar')){ const o = far[0], u = U(s.id, 'kinkind');
        if (u < .45) addRel(o, 'sibling-of', s); else if (u < .7 && o.age >= s.age + 18) addRel(o, 'parent-of', s); else addRel(o, 'cousin-of', s); }
      if (roll(.12, s.id, 'ex')){ const o = sample(s, 'exs', 1)[0]; if (o) addRel(o, 'ex-of', s); }
      if (s.pressure.money > .55){ const o = sample(s, 'cred', 1)[0]; if (o) addRel(o, 'creditor-of', s); }
      if (!s.rels.some(r => r.kind === 'landlord-of') && roll(.5, s.home, 'rent')){ const o = sps[H(s.home, 'landlord') % N]; if (o && o.home !== s.home) addRel(o, 'landlord-of', s); }
    }
    for (const [a, k, b] of extraRels){ const A = byId.get(a), B = byId.get(b); if (A && B) addRel(A, k, B); }
    T.push(performance.now()); TN.push('cc');
    // everyone in one web: small groups left apart are tied to the rest by a friendship
    const comp = new Map(); let ci = 0;
    for (const s of sps){ if (comp.has(s.id)) continue; const q = [s]; comp.set(s.id, ci); while (q.length){ const x = q.pop(); for (const r of x.rels){ if (!comp.has(r.who) && byId.has(r.who)){ comp.set(r.who, ci); q.push(byId.get(r.who)); } } } ci++; }
    if (ci > 1){ const size = new Map(); for (const c of comp.values()) size.set(c, (size.get(c) || 0) + 1); const big = [...size].sort((a, b) => b[1] - a[1])[0][0];
      const bigList = sps.filter(s => comp.get(s.id) === big), done = new Set();
      for (const s of sps){ const c = comp.get(s.id); if (c === big || done.has(c)) continue; done.add(c); addRel(bigList[H(s.id, 'bridge') % bigList.length], 'friend-of', s); } }
    T.push(performance.now()); TN.push('end');
    degreesFor = [sps, byId]; ST.degrees = null;   // (measured when asked for: the answer key)
    T.push(performance.now()); ST.netParts = TN.map((n, i) => n + ':' + ((T[i + 1] ?? T[i]) - T[i]).toFixed(1)).join(' ');
  }
  function measureDegrees(sps, byId){
    if (sps.length < 2){ ST.degrees = { people: sps.length, mean: 0, max: 0, within6: 1 }; return; }
    let tot = 0, cnt = 0, mx = 0, in6 = 0;
    const src = Math.min(12, sps.length);
    for (let k = 0; k < src; k++){
      const s = sps[H('deg', k) % sps.length], dist = new Map([[s.id, 0]]), q = [s.id];
      for (let i = 0; i < q.length; i++){ const x = byId.get(q[i]), d = dist.get(q[i]); for (const r of x.rels) if (!dist.has(r.who) && byId.has(r.who)){ dist.set(r.who, d + 1); q.push(r.who); } }
      for (const d of dist.values()){ if (!d) continue; tot += d; cnt++; if (d > mx) mx = d; if (d <= 6) in6++; }
    }
    ST.degrees = { people: sps.length, mean: cnt ? +(tot/cnt).toFixed(2) : 0, max: mx, within6: cnt ? +(in6/cnt).toFixed(3) : 1 };
  }
  let degreesFor = null;
  ST.degreesOf = () => { if (!ST.degrees && degreesFor) measureDegrees(...degreesFor); return ST.degrees; };
  // made again after the city changes (residents or places): checked every few seconds, and visitors passing through don't count
  let netCheck = -1e9;
  function maybeBuildNet(){
    if (!pplReady || ST.clockReal - netCheck < 3) return; netCheck = ST.clockReal;
    let n = 0; for (const p of pplList) if (!p.visitor) n++;
    const sig = n + ':' + placesEpoch;
    if (sig === netSig) return;
    netSig = sig; netAt = ST.clockReal; const t0 = performance.now(); buildNet(); ST.netMs = performance.now() - t0;
  }

  /* ---------- the shape of the day: sick, late, a day off ---------- */
  // A sickness starts on a day by hash and lasts one to three days. Sick people stay home, all day; nobody outside sees it.
  function sickOn(id, d){
    for (let k = 0; k < 3; k++){ const s = d - k; if (U(id, 'sick', s) < .025 && k < 1 + H(id, 'sicklen', s) % 3) return s; }
    return null;
  }
  ST.sickSince = id => sickOn(id, day());
  ST.isSick = id => sickOn(id, day()) !== null;
  const dayOff = (id, d) => U(id, 'off', d) < .04;
  const lateBy = (id, d) => U(id, 'late', d) < .1 ? .5 + U(id, 'latemin', d) : 0;
  // people.js desire(): where they want to be, when the day isn't an ordinary one (null: as usual)
  ST.routine = (p, h) => {
    if (!ST.on || p.visitor || p.cop || p.guard || p.archivist) return null;
    const d = day();
    if (sickOn(p.id, d) !== null) return p.home;
    if (p.job && working(p, h)){
      if (dayOff(p.id, d)) return pplRand() < p.outgoing ? (leisure(p) || p.home) : p.home;
      const late = lateBy(p.id, d); if (late && hrange(p.ws, (p.ws + late) % 24)(h)) return p.home;
    }
    return null;
  };

  /* ---------- the player's notebook ---------- */
  // known: what the player has learned about each person (a name and how, a stated relation and to whom)
  // logs: what each watched person's monitor showed, in order; notes: the notebook entries filed under each person
  const KN = new Map(), LOGS = new Map(), NOTES = new Map(), SEEN = new Map();   // SEEN: person id -> place key -> Set of days seen there
  const kn = id => KN.get(id) || KN.set(id, {}).get(id);
  ST.known = id => KN.get(id) || null;
  ST.log = id => LOGS.get(id) || [];
  ST.notes = id => NOTES.get(id) || [];
  const seenDays = (id, key) => { let m = SEEN.get(id); if (!m) SEEN.set(id, m = new Map()); let s = m.get(key); if (!s) m.set(key, s = new Set()); return s; };
  ST.rev = 0;   // bumped whenever a log, a note or what's known changes (the monitor redraws)

  // a line rendered with what the player knows now: {A} is "Subject" until a name is learned, {B.desc} a descriptor
  function relWord(kind, g){
    const f = g === 'f', m = g === 'm';
    const map = { 'grandchild-of': f ? 'granddaughter' : m ? 'grandson' : 'grandchild', 'stranger-to': 'stranger', 'tenant-of': 'tenant', 'employee-of': 'employee', 'debtor-of': 'debtor', 'customer-of': 'customer',
      'sibling-of': f ? 'sister' : m ? 'brother' : 'sibling', 'parent-of': f ? 'mother' : m ? 'father' : 'parent', 'child-of': f ? 'daughter' : m ? 'son' : 'child', 'grandparent-of': f ? 'grandmother' : m ? 'grandfather' : 'grandparent',
      'cousin-of': 'cousin', 'partner-of': 'partner', 'friend-of': 'friend', 'coworker-of': 'coworker', 'neighbor-of': 'neighbor', 'ex-of': 'ex', 'rival-of': 'rival', 'creditor-of': 'creditor', 'landlord-of': 'landlord',
      'boss-of': 'boss', 'cohabitant-of': 'housemate', 'acquaintance-of': 'acquaintance', 'shopkeeper-of': 'stall keeper', 'aunt-uncle-of': f ? 'aunt' : m ? 'uncle' : 'relative', 'niece-nephew-of': f ? 'niece' : m ? 'nephew' : 'relative' };
    return map[kind] || String(kind).replace(/-of$/, '');
  }
  const addrWord = (kind, g) => kind === 'parent-of' ? (g === 'f' ? 'Mom' : g === 'm' ? 'Dad' : 'Ba') : kind === 'grandparent-of' ? (g === 'f' ? 'Grandma' : g === 'm' ? 'Grandpa' : 'Gran') : relWord(kind, g);
  // the relation of X, as a kind: to `to`, or to A (for A itself, to B); the storylet's own relation first
  function relKind(xid, cast, to, want){
    const toId = to || (xid === cast.A ? cast.B : cast.A); const Y = toId && SPM.get(toId); if (!Y) return null;
    if (want && Y.rels.some(r => r.who === xid && r.kind === want)) return want;
    const r = Y.rels.find(r => r.who === xid); return r ? r.kind : null;
  }
  function descOf(id){
    const k = KN.get(id), I = ident(id), p = pOf(id), s = SPM.get(id);
    if (k && k.first) return k.first + (k.rel ? ' (' + relLabel(k) + ')' : '');
    if (p && p.cop && !p.guard) return 'officer #' + (1000 + H(id, 'badge') % 9000);   // (the badge shows a number; the name has to be heard)
    const cd = ST.caseDesc && ST.caseDesc(id); if (cd) return cd;
    if (p && p.cop) return 'a patrol officer';
    if (s && s.age >= 60) return 'an elderly ' + (I.g === 'f' ? 'woman' : I.g === 'm' ? 'man' : 'person');
    return I.g === 'f' ? 'an unknown female resident' : I.g === 'm' ? 'an unknown male resident' : 'an unknown resident';
  }
  function relLabel(k){
    if (!k.rel) return null;
    if (!k.relTo || k.relTo === ST.watch) return k.rel;
    const t = KN.get(k.relTo); return t && t.first ? k.rel + ' of ' + t.first : 'someone\'s ' + k.rel;
  }
  const PRON = g => g === 'f' ? { he: 'she', him: 'her', his: 'her' } : g === 'm' ? { he: 'he', him: 'him', his: 'his' } : { he: 'they', him: 'them', his: 'their' };
  function render(e){
    const c = e.cast || {}, x = e.ctx || {};
    const t = e.tmpl.replace(/\{([A-F])(?:\.([a-z]+))?\}|\{(place2?|n|item|seen|when|sender|look|S|L)\}/g, (m, role, prop, other) => {
      if (other) return other === 'place' ? (x.placeId !== undefined && places.has(x.placeId) ? placeName(x.placeId, c.A || e.subject || ST.watch) : (OLD_PLACE.get(x.place) || x.place) || 'the street') : other === 'place2' ? x.place2 || 'the street' : other === 'n' ? String(x.n || 3) : other === 'item' ? x.item || 'a bag'
        : other === 'seen' ? String(x.seen || 1) : other === 'when' ? x.when || 'yesterday' : other === 'sender' ? x.sender || 'a sender' : other === 'look' ? x.look || 'a parcel'
        : other === 'S' ? x.S || 'someone' : x.L || 'someone';
      const id = c[role]; if (!id) return m;
      const I = ident(id), k = KN.get(id) || {}, pr = PRON(I.g);
      switch (prop){
        case undefined: return k.first ? k.first : (role === 'A' && id === (e.subject || ST.watch)) ? 'Subject' : descOf(id);
        case 'desc': return id === (e.subject || ST.watch) ? (k.first || 'Subject') : descOf(id);   // (the watched person is never a descriptor on their own monitor)
        case 'he': return pr.he === 'they' ? '\u0001they' : pr.he; case 'him': return pr.him; case 'his': return pr.his;   // (they: its verb is made plural below)
        case 'first': return I.first; case 'full': return I.first + ' ' + I.last; case 'nick': return I.nick || I.first;
        case 'rel': { const kd = relKind(id, c, x.relTo && x.relTo[role], x.want && x.want[role]); return kd ? relWord(kd, I.g) : 'acquaintance'; }
        case 'addr': return addrWord(relKind(id, c, x.relTo && x.relTo[role], x.want && x.want[role]), I.g);
        case 'job': return x.job || 'worker'; case 'employer': return x.employer || 'a local firm';
        case 'home': return x.home || 'the block'; case 'age': return x.age || 'adult';
        default: return m;
      }
    });
    return cap(plural(t).replace(/^Posted: /, 'Posted to the mesh: ').replace(/^Phone, one side:/, 'Comm, one side:').replace(/\bhandset\b/g, 'comm'));   // (the last two: logs saved before the comm)
  }
  // "they" with a verb written for he or she: is/was/has/does/goes/-es/-s made plural ("they goes" reads "they go")
  const IRREG = { is: 'are', was: 'were', has: 'have', does: 'do', goes: 'go', says: 'say' };
  const plural = t => t.indexOf('\u0001') < 0 ? t : t.replace(/\u0001they (\w+)/g, (m, v) => 'they ' + (IRREG[v] || (/(ch|sh|ss|x|z|o)es$/.test(v) ? v.slice(0, -2) : /ies$/.test(v) ? v.slice(0, -3) + 'y' : /[^su]s$/.test(v) ? v.slice(0, -1) : v))).replace(/\u0001/g, '');
  const cap = t => t.replace(/(^|[.!?]\s+|Overheard:\s+|mesh:\s+|one side:\s+|:\s+")([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
  ST.render = render;

  // what a line teaches: the names it contains (for people in the scene), and a relation it states
  function learnFrom(line, cast, present, channel, relFact, ctx){
    const verified = channel === 'document' || channel === 'introduction', out = { names: [], rel: false, loose: [] };
    for (const [role, id] of Object.entries(cast)){
      if (!id) continue;
      const has = re => new RegExp('\\{' + role + '\\.' + re + '\\}').test(line);
      if (!has('(first|full|nick)')) continue;
      if (present && !present.has(role)){ out.loose.push(id); continue; }
      const k = kn(id), I = ident(id), via = { channel, verified, at: ST.clock };
      if (has('(first|full)')){ if (!k.first){ k.first = I.first; k.firstAt = ST.clock; out.names.push(id); } if (!k.firstVia || (verified && !k.firstVia.verified)) k.firstVia = via; }
      if (has('full') && !k.last){ k.last = I.last; k.lastVia = via; }
      if (has('nick') && I.nick && !k.nick){ k.nick = I.nick; k.nickVia = via; out.names.push(id); }
    }
    if (relFact){
      const X = cast[relFact.role], T = cast[relFact.to];
      const states = new RegExp('\\{(' + relFact.role + '|' + relFact.to + ')\\.(rel|addr)\\}').test(line) || D.relRe.test(line.replace(/\{[^}]*\}/g, ' '));
      if (X && T && states){ const kd = relKind(X, cast, T, ctx && ctx.want && ctx.want[relFact.role]);
        if (kd){ const k = kn(X); k.rel = relWord(kd, ident(X).g); k.relTo = T; k.relVia = { channel, verified, at: ST.clock }; out.rel = true; } }
    }
    if (out.names.length || out.rel || out.loose.length) ST.rev++;
    return out;
  }
  // a line on the watched person's monitor
  function logLine(tmpl, cast, ctx, kind, extra){
    const sub = ST.watch; if (!sub) return null;
    const e = Object.assign({ t: ST.clock, tmpl, cast: Object.assign({}, cast), ctx: Object.assign({}, ctx || {}), kind, subject: sub }, extra || {});
    e.first = render(e);
    const L = LOGS.get(sub) || LOGS.set(sub, []).get(sub); L.push(e); if (L.length > 400) L.splice(0, L.length - 400);
    ST.rev++; for (const f of ST.logHooks) try { f(e); } catch (er){ console.warn('log hook', er); }
    return e;
  }
  ST.logHooks = [];   // (pacing.js listens: what counts as something happening)
  function note(who, e){ const n = NOTES.get(who) || NOTES.set(who, []).get(who); n.push(e); if (n.length > 120) n.splice(0, n.length - 120); ST.rev++; }

  /* ---------- scenes: storylets played on the street ---------- */
  const SC = new Set();
  ST.scenes = SC;
  const free = p => p && people.get(p.id) === p && !p.visitor && !p.cop && !p.guard && !p.archivist && !p.club && !p.clubbing && !p.metro && !p.metroPlan && !p.ride && !p.scene && !p.patrol
    && !p.gone && !p.custody && !(p.walk && (p.walk.beat || p.walk.puke)) && places.has(p.home);
  // the nearest node of the walking network to a point (a grid of the nodes, made again when the network is)
  let _ngRef = null, _ngGrid = null;
  function nearestNode(x, z){
    if (_ngRef !== NG){ _ngRef = NG; _ngGrid = new Map(); for (let i = 0; i < NG.x.length; i++){ const k = Math.floor(NG.x[i]/2) + ',' + Math.floor(NG.z[i]/2); (_ngGrid.get(k) || _ngGrid.set(k, []).get(k)).push(i); } }
    const gx = Math.floor(x/2), gz = Math.floor(z/2); let best = -1, bd = Infinity;
    for (let r = 0; r <= 4 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++){
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      for (const i of _ngGrid.get((gx + a) + ',' + (gz + b)) || []){ const d = (NG.x[i] - x)**2 + (NG.z[i] - z)**2; if (d < bd){ bd = d; best = i; } } }
    return best;
  }
  const streetDoor = pl => pl && pl.doors.find(d => !d.lift && !d.noDraw) || (pl && pl.doors.find(d => !d.lift)) || null;
  // a walk of a scene's own (people.js hands it back here when it ends instead of arriving)
  function walkFrom(p, tgt){
    const st = p.sc; let head = [], a, dA = null;
    const tx = tgt.x ?? (tgt.door ? tgt.door.stand.x : 0), tz = tgt.z ?? (tgt.door ? tgt.door.stand.z : 0);
    if (st.mode === 'in'){
      const pl = places.get(st.place), d = tgt.door && pl && pl.doors.includes(tgt.door) ? tgt.door : (pl && nearestOf(pl.doors.filter(d => !d.lift), tx, tz));
      if (!d) return false;
      if (tgt.kind === 'inside' && tgt.door === d) return true;   // already in there
      head = [[d.inside.x, d.inside.z], [d.wall.x, d.wall.z]]; a = d.node; dA = d;
    } else { head = [[st.x, st.z]]; a = nearestNode(st.x, st.z); if (a < 0) return false; }
    let b, tail = [], dB = null;
    if (tgt.kind === 'door'){ b = tgt.door.node; tail = [[tgt.x, tgt.z]]; }
    else if (tgt.kind === 'inside'){ b = tgt.door.node; tail = [[tgt.door.wall.x, tgt.door.wall.z], [tgt.door.inside.x, tgt.door.inside.z]]; dB = tgt.door; }
    else { b = tgt.node ?? nearestNode(tgt.x, tgt.z); if (b < 0) return false; tail = [[tgt.x, tgt.z]]; }
    const mid = route(a, b); if (!mid) return false;
    const pts = head.concat(mid, tail), cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    p.walk = { pts, cum, len: cum[cum.length - 1], s: 0, to: tgt.place || null, doorA: dA, doorB: dB, spot: null, safe0: cum[head.length], safe1: cum[pts.length - 1 - tail.length], scene: true, tgt };
    st.mode = 'walk'; return true;
  }
  // people.js: a scene walk has ended
  ST.walkDone = p => {
    const w = p.walk, st = p.sc; p.walk = null; if (!st) return;
    const t = w && w.tgt;
    if (t && t.kind === 'inside'){ st.mode = 'in'; st.place = t.place; p.at = t.place; }
    else { st.mode = 'out'; const e = w.pts[w.pts.length - 1]; st.x = e[0]; st.z = e[1]; p.x = st.x; p.z = st.z; }
    st.arrived = true;
  };
  // people.js: how someone in a scene stands (null: indoors, not drawn)
  ST.pose = (p, t) => {
    const st = p.sc; if (!st || st.mode === 'in' || st.mode === 'walk') return null;
    p.x = st.x; p.z = st.z;
    let frame = F_IDLE + Math.floor(t*2.5 + p.phase) % PPL.idle;
    if (st.gest && Math.floor(t*.6 + p.phase) % 3 > 0) frame = F_SPEC + Math.floor(t*6 + p.phase) % 6;
    // what the step has them doing, in its own frames (generated people only; the old sheet keeps the talk and idle frames)
    const sc = p.scene, b = sc && sc.b, mine = b && [].concat(b.who || []).some(r => sc.cast[r] === p.id), since = t - (st.t0 ?? t);
    if (b && PG.live() && sc.phase !== 'gather'){
      if (b.do !== st.do0){ st.do0 = b.do; st.t0 = t; }
      const d = b.do;
      const holdIdle = () => { const m = PG.heldModeOf(p.held); return (m === 'side' ? F_SIDEIDLE : m === 'hand' ? F_HOLDIDLE : F_CARRYIDLE) + Math.floor(t*2 + p.phase) % 2; };
      if (d === 'pick-up' && mine){ if (!p.held) p.held = st.pick || PG.heldPick('box', '', p.id); frame = since < 1 ? F_CROUCH + Math.min(3, Math.floor(since*4)) : holdIdle(); }
      else if (d === 'hand-over' && mine && p.held) frame = F_GIVE + Math.floor(t*2) % 2;
      else if (p.held && !(st.gest && Math.floor(t*.6 + p.phase) % 3 > 0)) frame = holdIdle();
      else if (d === 'sit' && mine) frame = F_SIT + Math.floor(t*1.2 + p.phase) % 4;
      else if ((d === 'eat' || d === 'picnic') && mine) frame = F_SITEAT + Math.floor(t*1.6 + p.phase) % 4;   // (an eat step seats them: see beginHold)
      else if (d === 'phone-call' && mine) frame = F_COMM + Math.floor(t*1.5 + p.phase) % 4;
      else if (d === 'post-feed' && mine) frame = F_USE + Math.floor(t*4 + p.phase) % 6;
      else if (d === 'wave') frame = F_WAVE + Math.floor(t*6 + p.phase) % 4;
      else if (d === 'hug') frame = F_HUG + Math.floor(t*1.2 + p.phase) % 2;
      else if (d === 'water-plant' && mine) frame = F_WATER + Math.floor(t*3 + p.phase) % 4;
      else if (d === 'argue' && Math.floor(t*.8 + p.phase) % 2) frame = F_ANGRY + Math.floor(t*6 + p.phase) % 6;
      else if ((d === 'police-scan' || d === 'read-notice') && mine && !p.held) frame = F_USE + Math.floor(t*4 + p.phase) % 6;   // (the scanner, or a screen held up to read)
      else if (d === 'search' && mine) frame = F_CROUCH + (since < 1 ? Math.min(3, Math.floor(since*4)) : 2 + Math.floor(t*1.5 + p.phase) % 2);   // (down at the drawer, the bin, the floor)
      else if ((d === 'arrest' || d === 'point') && mine) frame = F_GIVE + Math.floor(t*2) % 2;   // (a hand out: on a shoulder, at the thing)
    }
    if (st.face){ const sd = st.face[0]*_camR.x + st.face[1]*_camR.z; if (Math.abs(sd) > 1e-3) p.flip = sd < 0 ? -1 : 1; }
    return { x: st.x, z: st.z, y: st.y ?? CURB, frame };
  };

  // where a step happens
  function homeDoorTarget(owner, slot){
    const pl = places.get(owner.home), d = streetDoor(pl); if (!d) return null;
    const tx = -d.n[1], tz = d.n[0], o = (slot - .5)*.34, out = .12 + (slot > 1 ? .2 : 0);
    return { kind: 'door', door: d, place: pl.id, x: d.stand.x + tx*o + d.n[0]*out, z: d.stand.z + tz*o + d.n[1]*out };
  }
  // the open place a step happens at, of the kind its line describes: a lawn is a lawn plot, the square and its stalls are the town square, a seat
  // anywhere with seats; for a step that sits (sit, eat, picnic) only a place with a free seat. None near enough: the storylet isn't started (placesOk).
  const OPEN_FIT = {
    lawn: pl => !!pl.bench,
    square: pl => !!(pl.mega && pl.mega.kind === 'square'), stall: pl => !!(pl.mega && pl.mega.kind === 'square'), 'market-mall': pl => !!(pl.mega && pl.mega.kind === 'square'),
    'bar-kiosk': pl => !!(pl.mega && pl.mega.kind === 'square'), 'cafe-stool': pl => !!pl.stalls, bench: pl => true };
  const SEATED = new Set(['sit', 'eat', 'picnic']);
  function openPlaceNear(x, z, at, seated){   // (seated: how many free seats it needs, one for each person in the step)
    const fit = OPEN_FIT[at] || (() => true);
    let best = null, bd = Infinity;
    for (const pl of places.values()){ if (!pl.open || !pl.spots || !pl.spots.length || !fit(pl)) continue;
      if (seated && pl.spots.reduce((n, sp) => n + (sp.kind === 'seat' && !sp.by && !sp.up ? 1 : 0), 0) < seated) continue;
      const d = Math.hypot(pl.x - x, pl.z - z); if (d < bd){ bd = d; best = pl; } }
    return bd < 40 ? best : null;
  }
  // every open-place step of a storylet has a place of its kind near the one who leads it (so a line about the lawn is played on a lawn)
  function placesOk(s, cast){
    for (const b of s.beats){ if (b.indoors || !OPEN_FIT[b.at]) continue;
      const lead = pOf(cast[[].concat(b.who || [])[0]] || cast.A); if (!lead) return false;
      const [x, z] = posOf(lead); if (!openPlaceNear(x, z, b.at, SEATED.has(b.do) ? [].concat(b.who || [], b.with || []).length : 0)) return false; }
    return true;
  }
  function shopNear(x, z, not){
    let best = null, bd = Infinity;
    for (const pl of places.values()){ if (!pl.cell || !(pl.fun > 1) || pl.id === not || !streetDoor(pl)) continue; const d = Math.hypot(pl.x - x, pl.z - z); if (d < bd){ bd = d; best = pl; } }
    return best;
  }
  const posOf = p => { const st = p.sc; if (st && st.mode === 'walk') return [p.x, p.z]; if (st && st.mode !== 'in') return [st.x, st.z]; const pl = places.get(st ? st.place : p.at); return pl ? [pl.x, pl.z] : [p.x || 0, p.z || 0]; };
  function streetPoint(p, salt){
    const [x, z] = posOf(p), a = U(p.id, salt, 'ang')*Math.PI*2, r = 3 + U(p.id, salt, 'r')*4;
    const n = nearestNode(x + Math.cos(a)*r, z + Math.sin(a)*r); if (n < 0) return null;
    return { kind: 'pt', node: n, x: NG.x[n], z: NG.z[n] };
  }
  function freeSpotAt(pl, kind, near){
    const list = pl.spots.filter(s => !s.by && !s.up && (kind ? s.kind === kind : (s.kind === 'stand' || s.kind === 'seat')));
    if (!list.length) return null;
    if (near) list.sort((a, b) => Math.hypot(a.x - near[0], a.z - near[1]) - Math.hypot(b.x - near[0], b.z - near[1]));
    return list[0];
  }
  // resolve a step's place for the whole step: one anchor all its people gather at
  function anchorFor(sc, b){
    if (b.anc) return typeof b.anc === 'function' ? b.anc(sc) : b.anc;   // (a case step brings its own: cases.js)
    const who = [].concat(b.who || []), lead = sc.cast[who[0]] ? pOf(sc.cast[who[0]]) : null; if (!lead) return null;
    const at = b.at || 'any';
    if (at === 'home-door'){ const owner = pOf(sc.cast[sc.owner]); return owner ? { kind: 'home', owner } : null; }
    if (at === 'work-door' || at === 'foundry-gate'){ const wp = pOf(sc.cast.A); const pl = wp && wp.job && places.get(wp.job); const d = streetDoor(pl); return d ? { kind: 'door', door: d, place: pl.id } : null; }
    if (at === 'shop-door'){ const [x, z] = posOf(lead), pl = shopNear(x, z, lead.home); const d = streetDoor(pl); return d ? { kind: 'door', door: d, place: pl.id } : null; }
    if (OPEN_FIT[at]){ const [x, z] = posOf(lead), pl = openPlaceNear(x, z, at, SEATED.has(b.do) ? [].concat(b.who || [], b.with || []).length : 0); return pl ? { kind: 'open', place: pl } : null; }
    return { kind: 'here' };
  }
  // where in the anchor this person stands, and whether that's a walk
  function targetIn(sc, anc, p, slot, b){
    if (anc.fixed && anc.fixed[p.id]) return anc.fixed[p.id];   // (someone with a place of their own in it: the keeper behind the counter)
    if (anc.kind === 'point'){ const a = slot*2.1 + .4, r = slot ? .42 : 0; return { kind: 'pt', x: anc.x + Math.cos(a)*r, z: anc.z + Math.sin(a)*r, node: anc.node }; }   // (a spot on the street: under the highway)
    if (anc.kind === 'home') return homeDoorTarget(anc.owner, slot);
    if (anc.kind === 'door'){ const d = anc.door, tx = -d.n[1], tz = d.n[0], o = (slot - .5)*.34; return { kind: 'door', door: d, place: anc.place, x: d.stand.x + tx*o + d.n[0]*.15, z: d.stand.z + tz*o + d.n[1]*.15 }; }
    if (anc.kind === 'open'){
      if (!anc.spot){ const [x, z] = posOf(p); anc.spot = freeSpotAt(anc.place, SEATED.has(b.do) ? 'seat' : null, [x, z]); if (!anc.spot) return null; anc.spot.by = p.id; sc.spots.push(anc.spot); }
      const s = anc.spot; if (slot === 0) return { kind: 'spot', spot: s, x: s.x, z: s.z, node: s.node, y: s.y };
      if (SEATED.has(b.do)){ const s2 = freeSpotAt(anc.place, 'seat', [s.x, s.z]); if (!s2) return null; s2.by = p.id; sc.spots.push(s2); return { kind: 'spot', spot: s2, x: s2.x, z: s2.z, node: s2.node, y: s2.y }; }   // (everyone in a sitting step on a seat of their own)
      const a = slot*2.1, x = s.x + Math.cos(a)*.38, z = s.z + Math.sin(a)*.38; return { kind: 'pt', x, z, node: s.node };
    }
    // here: the lead stays where they are (or steps out of where they are); others come to them
    const lead = pOf(sc.cast[[].concat(b.who)[0]]);
    if (p === lead){ if (p.sc.mode === 'in'){ const pl = places.get(p.sc.place), d = streetDoor(pl); return d ? { kind: 'door', door: d, place: pl.id, x: d.stand.x + d.n[0]*.15, z: d.stand.z + d.n[1]*.15 } : null; } return { kind: 'stay' }; }
    const [x, z] = posOf(lead), a = slot*2.4 + U(sc.id, 'ang')*6; return { kind: 'pt', x: x + Math.cos(a)*.36, z: z + Math.sin(a)*.36, node: nearestNode(x, z) };
  }
  // who is the "home" of a storylet's home-door steps: whoever is knocked on, else A
  function ownerOf(s, cast){
    for (const b of s.beats) if (b.do === 'knock-and-wait'){ const knock = [].concat(b.who || []); const r = Object.keys(cast).find(r => !knock.includes(r) && s.beats.some(o => o.at === 'home-door' && [].concat(o.who || [], o.with || []).includes(r))); if (r) return r; }
    return 'A';
  }

  function startScene(s, cast, opts){
    const sc = { id: s.id + ':' + ST.clock, s, cast, i: -1, phase: 'next', until: 0, spots: [], seen: [], times: {}, prog: {}, want: wantKinds(s), opts: opts || {}, t0: pplNow };
    sc.owner = ownerOf(s, cast);
    for (const id of Object.values(cast)){
      const p = pOf(id);
      const st = { mode: 'in', place: p.at, x: p.x, z: p.z, face: null, gest: false };
      if (p.walk){ st.mode = 'out'; if (p.walk.spot && p.walk.spot.by === p.id) p.walk.spot.by = null; p.walk = null; st.x = p.x; st.z = p.z; }
      else if (p.spot){ st.mode = 'out'; st.x = p.spot.x; st.z = p.spot.z; st.y = p.spot.y; if (p.spot.by === p.id) p.spot.by = null; p.spot = null; }
      else if (p.patrol){ st.mode = 'out'; st.x = p.x; st.z = p.z; p.patrol = null; }
      else if (!places.has(p.at) || !places.get(p.at).doors.length) return null;
      if (st.mode === 'out' && (st.x === undefined || nearestNode(st.x, st.z) < 0)) return null;
      p.chain = null; p.hurry = false; p.rush = false; p.sc = st; p.scene = sc;
    }
    SC.add(sc); return sc;
  }
  ST.finishHooks = [];   // (pacing.js: what happened to whom while nobody watched)
  ST.endStats = {};   // (how moments end, by kind: for the stress test, tools/stress)
  function endScene(sc, why){
    { const k = (sc.s.tier === 'case' ? 'case' : (sc.s.category || 'story')) + ' ' + String(why || '').split(' ')[0]; ST.endStats[k] = (ST.endStats[k] || 0) + 1; }
    SC.delete(sc);
    for (const sp of sc.spots) if (sp.by && Object.values(sc.cast).includes(sp.by)) sp.by = null;
    for (const id of Object.values(sc.cast)){
      const p = pOf(id); if (!p || p.scene !== sc) continue;
      const st = p.sc; p.scene = null; p.sc = null; p.held = undefined;
      if (p.walk && p.walk.scene){ const w = p.walk; p.walk = null; if (w.tgt && w.tgt.kind === 'inside'){ p.at = w.tgt.place; p.until = pplNow + 2; continue; } const e = w.pts[Math.min(w.pts.length - 1, walkSeg(w))]; if (st){ st.mode = 'out'; st.x = p.x ?? e[0]; st.z = p.z ?? e[1]; } }
      if (!st || st.mode === 'in'){ p.at = st ? st.place : p.at; p.until = pplNow + 25 + pplRand()*40; continue; }   // (in for a while: not straight back out)
      // out on the street: back to the day, from where they stand
      const n = nearestNode(st.x, st.z), want = (typeof desire === 'function' && desire(p, S.hour)) || p.home;
      p.x = st.x; p.z = st.z;
      if (!(n >= 0 && startTripAt(p, st.x, st.z, { node: n }, want) || n >= 0 && startTripAt(p, st.x, st.z, { node: n }, p.home))) sendHome(p);
    }
    if (sc.opts.done) sc.opts.done(sc, why);
  }
  function wantKinds(s){
    const w = {};
    for (const [R, spec] of Object.entries(s.roles || {})) if (spec.rel){ const [kind, T] = spec.rel.split(':'); w[R] = kind; if (T === 'A' && R === 'B' && !w.A) w.A = INV[kind] || kind; }
    return w;
  }
  // the subject sees it: they're in it and out on the street, or it's at the door of the place they're in, or near them
  function visible(sc, b, anc){
    const sub = ST.watch; if (!sub || b.indoors) return false;
    const p = pOf(sub); if (!p) return false;
    if (sc.dlv && sc.cast.A !== sub && !(anc && anc.kind === 'home' && p.at === anc.owner.home && !p.walk && !p.spot)) return false;   // someone else's parcel: only from the door of where they are
    const inIt = Object.values(sc.cast).includes(sub);
    const st = p.sc || null, out = st ? st.mode !== 'in' : !!(p.walk || p.spot);
    const roles = [].concat(b.who || [], b.with || []), mine = roles.some(r => sc.cast[r] === sub);
    if (mine && out) return true;
    if (anc && anc.kind === 'home' && !out && p.at === anc.owner.home) return true;   // at the door of where they are
    if (inIt && anc && (anc.kind === 'door') && !out && p.at === anc.place) return true;
    const lead = pOf(sc.cast[roles[0]]); if (lead && out){ const [x, z] = posOf(lead), [sx, sz] = posOf(p); if (Math.hypot(x - sx, z - sz) < 6) return true; }
    return false;
  }
  const EMO_FOR = { argue: 'anger', hug: 'heart', 'hand-over': 'bang', chat: 'note', 'phone-call': 'dots', 'post-feed': 'note', 'knock-and-wait': 'dots', 'queue-order': 'dots', point: 'bang', wave: 'note', shrug: 'quest' };
  const PLACE_TEXT = { 'home-door': ['a building'], street: ['the sidewalk', 'the street', 'the corner'], 'shop-door': ['a shopfront'], 'work-door': ['a building'],
    stall: ['the stall', 'the counter'], square: ['the square'], 'cafe-stool': ['the seats'], bench: ['the seats'],
    lawn: ['the lawn'], 'bar-kiosk': ['the kiosk'], 'market-mall': ['the market plaza'], 'foundry-gate': ['the foundry'], any: ['the block'] };
  const ITEMS = ['a paper bag', 'a box', 'a crate', 'a bundle', 'a parcel', 'a lamp'];
  // the building or open place a step is at, by id (rendered by placeName): the anchor's, or for a step into a building, the one being entered
  function placeIdOf(sc, b, anc){
    if (anc){ if (anc.kind === 'home') return anc.owner.home; if (anc.kind === 'door') return anc.place; if (anc.kind === 'open') return anc.place.id; }
    const lead = pOf(sc.cast[[].concat(b.who || [])[0]]); if (!lead) return undefined;
    if (lead.walk && lead.walk.tgt && lead.walk.tgt.place !== undefined) return lead.walk.tgt.place;
    if (lead.sc && lead.sc.mode === 'in' && lead.sc.place !== undefined) return lead.sc.place;
    return undefined;
  }
  function ctxFor(sc, b, anc){
    const A = pOf(sc.cast.A), pid = placeIdOf(sc, b, anc);
    return { placeId: pid, place: pick(PLACE_TEXT[b.at || 'any'] || PLACE_TEXT.any, sc.id, b.id), place2: pick(PLACE_TEXT.street, sc.id, 'p2'), n: 3 + H(sc.id, b.id, 'n') % 12, item: pick(ITEMS, sc.id, 'item'),
      want: sc.want, job: A ? JOB_WORD[jobKind(A)] || 'worker' : 'worker', employer: A ? employerName(A) : '', when: DAYS[day() % 7] };
  }
  // one step at a time: gather, then hold the moment for a few seconds
  function stepScene(sc){
    if (sc.phase === 'gather'){
      let all = true;
      for (const id of sc.movers){ const p = pOf(id); if (p && p.scene === sc && p.sc.mode === 'walk'){ all = false; const s = p.walk ? p.walk.s : 0; if (s > (sc.prog[id] ?? -1) + .05){ sc.prog[id] = s; sc.since = pplNow; } } }
      if (!all && pplNow - sc.since < 30) return;   // (stuck: nobody has moved on for half a minute)
      if (!all){ endScene(sc, 'stuck'); return; }
      beginHold(sc);
      return;
    }
    if (sc.phase === 'hold'){ if (pplNow < sc.until) return; afterBeat(sc); sc.phase = 'next'; }
    if (sc.phase !== 'next') return;
    sc.i++;
    const b = sc.s.beats[sc.i];
    if (!b){ finishScene(sc); return; }
    sc.b = b;
    const who = [].concat(b.who || []), withs = [].concat(b.with || []);
    for (const id of Object.values(sc.cast)){ const p = pOf(id); if (p && p.sc){ p.sc.gest = false; } }
    if (b.indoors){   // inside, out of sight: the people in it go in where they stand, and time passes
      for (const r of who){ const p = pOf(sc.cast[r]); if (p && p.sc && p.sc.mode === 'out'){ const pl = places.get(p.at) && streetDoor(places.get(p.at)) ? places.get(p.at) : places.get(p.home); const d = streetDoor(pl); if (d) walkFrom(p, { kind: 'inside', door: d, place: pl.id }); } }
      sc.movers = who.map(r => sc.cast[r]); sc.phase = 'gather'; sc.since = pplNow; sc.anchor = null; sc.indoorHold = 14 + U(sc.id, b.id)*16;
      return;
    }
    const anc = anchorFor(sc, b); if (!anc){ endScene(sc, 'no place'); return; }
    sc.anchor = anc;
    const movers = [];
    const people_ = [...who, ...withs], roleOrder = Object.keys(sc.cast);
    const nb = sc.s.beats[sc.i + 1], nAnc = MOVE.has(b.do) && !b.away && anc.kind === 'here' && nb && !nb.indoors && nb.at && nb.at !== 'street' && nb.at !== 'any' ? anchorFor(sc, nb) : null;
    people_.forEach(r => {
      const slot = roleOrder.indexOf(r);
      const p = pOf(sc.cast[r]); if (!p || !p.sc) return;
      const isWho = who.includes(r);
      if (b.do === 'enter' && isWho){
        const pl = anc.kind === 'home' ? places.get(anc.owner.home) : anc.kind === 'door' ? places.get(anc.place) : places.get(p.at) || places.get(p.home);
        const d = streetDoor(pl); if (d && walkFrom(p, { kind: 'inside', door: d, place: pl.id })) movers.push(p.id);
        return;
      }
      if (MOVE.has(b.do) && isWho && anc.kind === 'here' && nAnc && nAnc.kind !== 'here'){   // a walk that leads to where the next step happens
        const t = targetIn(sc, nAnc, p, slot, nb); if (t && t.kind !== 'stay' && walkFrom(p, t.kind === 'spot' ? { kind: 'pt', x: t.x, z: t.z, node: t.node } : t)) movers.push(p.id);
        return;
      }
      if (MOVE.has(b.do) && isWho && anc.kind === 'here'){   // a walk somewhere: along the street (together: the second keeps beside the first)
        if (!sc.walkTo) sc.walkTo = streetPoint(pOf(sc.cast[who[0]]), sc.id + b.id);
        const t = sc.walkTo; if (!t) return;
        const o = slot*.3, tgt = { kind: 'pt', node: t.node, x: t.x + o, z: t.z + o*.6 };
        if (walkFrom(p, tgt)) movers.push(p.id);
        return;
      }
      const tgt = targetIn(sc, anc, p, slot, b); if (!tgt && anc.kind === 'open' && (isWho || SEATED.has(b.do))){ sc.noSpot = true; return; } if (!tgt || tgt.kind === 'stay') return;
      const st = p.sc;
      if (st.mode === 'out' && Math.hypot(st.x - tgt.x, st.z - tgt.z) < .2) return;
      if (tgt.kind === 'spot'){ if (walkFrom(p, { kind: 'pt', x: tgt.x, z: tgt.z, node: tgt.node })) { movers.push(p.id); st.y = tgt.y; } return; }
      if (walkFrom(p, tgt)) movers.push(p.id);
    });
    if (sc.noSpot){ endScene(sc, 'no spot'); return; }   // (nowhere free to do it: nothing logged)
    sc.walkTo = MOVE.has(b.do) ? sc.walkTo : null;
    sc.movers = movers; sc.phase = 'gather'; sc.since = pplNow;
    // a walk is logged as it starts; everything else once everyone's there
    if (MOVE.has(b.do) || b.do === 'enter') logBeat(sc, b, anc);
  }
  function beginHold(sc){
    const b = sc.b;
    if (b.indoors){ sc.phase = 'hold'; sc.until = pplNow + sc.indoorHold; return; }
    const who = [].concat(b.who || []), withs = [].concat(b.with || []), ppl = [...who, ...withs].map(r => pOf(sc.cast[r])).filter(Boolean);
    // face each other (or the door, for a knock), gesture while talking
    for (const p of ppl){ if (!p.sc || p.sc.mode !== 'out') continue;
      const other = ppl.find(o => o !== p && o.sc && o.sc.mode === 'out');
      if (other) p.sc.face = [other.sc.x - p.sc.x, other.sc.z - p.sc.z];
      else if (sc.anchor && sc.anchor.kind === 'home'){ const d = streetDoor(places.get(sc.anchor.owner.home)); if (d) p.sc.face = [-d.n[0], -d.n[1]]; }
      p.sc.gest = TALK.has(b.do) || b.do === 'phone-call' || b.do === 'post-feed' || b.do === 'knock-and-wait';
      if (SEATED.has(b.do)){ p.sc.y = (p.sc.y ?? CURB) - .09; p.sc.gest = false; }
    }
    const em = b.emote || EMO_FOR[b.do]; if (em && ppl[0] && EMO[em] !== undefined) emote(ppl[0], em, 2.4);
    if (!MOVE.has(b.do) && b.do !== 'enter') logBeat(sc, b, sc.anchor);
    sc.phase = 'hold'; sc.until = pplNow + (b.hold ?? (MOVE.has(b.do) || b.do === 'enter' ? .5 : 4 + U(sc.id, b.id, 'hold')*4));
  }
  function logBeat(sc, b, anc){
    if (sc.seenBeat && sc.seenBeat[b.id]) return;
    const vis = visible(sc, b, anc); sc.times[b.id] = ST.clock;
    if (!vis) return;
    (sc.seenBeat = sc.seenBeat || {})[b.id] = true; sc.seen.push(b.id);
    const lines = (sc.opts.lines && sc.opts.lines[b.id]) || (sc.s.log || {})[b.id]; if (!lines || !lines.length) return;
    const ctx = ctxFor(sc, b, anc);
    const line = typeof lines === 'function' ? lines(sc) : pick(lines, sc.id, b.id, 'line');
    if (line) logLine(line, sc.cast, ctx, 'live', { sid: sc.s.id });
    heldFor(sc, b, line ? line.replace(/\{item\}/g, ctx.item || '') : '');
    // a place this subject was seen at, for counted sightings
    if (anc && ST.watch){ const key = anc.kind === 'home' ? 'home:' + anc.owner.home : anc.kind === 'door' ? 'door:' + anc.place : anc.kind === 'open' ? 'open:' + anc.place.id : 'street'; seenDays(ST.watch, sc.s.id + '|' + b.at + '|' + key).add(day()); }
  }
  // what the step's line says is in their hands, drawn there (peoplegen_held.js): a carry, a pick-up or a hand-over always holds something (a box if the line
  // doesn't say); walking, leaving and going in hold what the line names when it says they have it with them
  const WITH_RE = /\b(carr(y|ies|ying)|with|holding|holds|hauls|lugs|clutch\w*|under one arm|takes|lifts|picks up|hands|passes|brings|balanc\w*)\b/i;
  function heldFor(sc, b, line){
    const who = [].concat(b.who || []), p = who.length && pOf(sc.cast[who[0]]); if (!p) return;
    const k = b.held ? PG.heldPick(b.held.split(':')[0], b.held.split(':')[1] || '', p.id) : PG.heldFromText ? PG.heldFromText(line, p.id) : null;
    if (b.do === 'carry' || b.do === 'hand-over'){ if (!p.held || k) p.held = k || p.held || PG.heldPick('box', '', p.id); }
    else if (b.do === 'pick-up'){ if (p.sc) p.sc.pick = k || PG.heldPick('box', '', p.id); }
    else if (k && (b.held || WITH_RE.test(line)) && ['walk', 'leave', 'enter', 'walk-together', 'stand', 'wait-outside', 'knock-and-wait'].includes(b.do)) p.held = k;
  }
  function afterHandOver(sc, b){
    if (b.do !== 'hand-over') return;
    const giver = pOf(sc.cast[[].concat(b.who || [])[0]]), to = pOf(sc.cast[[].concat(b.with || [])[0]]);
    if (giver && giver.held){ if (to) to.held = giver.held; giver.held = undefined; }
  }
  function afterBeat(sc){
    const b = sc.b; if (!b || !sc.seen.includes(b.id)) return;
    const ctxBase = ctxFor(sc, b, sc.anchor);
    for (const r of sc.s.reveals || []){
      if (r.beat !== b.id) continue;
      if (!roll(r.chance, 'rv', sc.id, r.fact)) continue;
      const [role, ...rest] = r.fact.split('.'), fact = rest.join('.'), e = sc.cast[role]; if (!e) continue;
      const anc = sc.anchor, key = anc ? (anc.kind === 'home' ? 'home:' + anc.owner.home : anc.kind === 'door' ? 'door:' + anc.place : anc.kind === 'open' ? 'open:' + anc.place.id : 'street') : 'street';
      const seenN = ST.watch ? seenDays(ST.watch, sc.s.id + '|' + b.at + '|' + key).size : 0;
      if (r.minSeen && seenN < r.minSeen) continue;
      const lines = r.log.filter(l => !/\{seen\}/.test(l) || seenN >= 2); if (!lines.length) continue;
      const line = pick(lines, sc.id, r.fact, 'rl');
      const relTo = {}, rm = fact.match(/^relation-to-([A-F])$/); if (rm && rm[1] !== 'A' && sc.cast[rm[1]]) relTo[role] = sc.cast[rm[1]];
      const ctx = Object.assign({}, ctxBase, { seen: seenN, relTo });
      const present = new Set(['A', ...[].concat(b.who || [], b.with || [])]);
      const learned = learnFrom(line, sc.cast, present, r.channel, rm ? { role, to: rm[1] } : null, ctx);
      const ln = logLine(line, sc.cast, ctx, 'reveal', { channel: r.channel, fact: r.fact });
      if (ln) note(ST.watch, { t: ST.clock, who: e, fact: r.fact, channel: r.channel, verified: r.channel === 'document' || r.channel === 'introduction', tmpl: line, cast: Object.assign({}, sc.cast), ctx, learned });
    }
    if (sc.s.tier !== 'case'){ passing(sc, b); gossipIn(sc, b); }   // (a case's moment is its own: no names in passing, no gossip in it)
    else copNames(sc, b);
    afterHandOver(sc, b);
  }
  // Officers working a case together call each other by name (across the room, on the radio): when the one you're watching
  // is in a moment with another officer, now and then one of them says the other's first name, and the log hears it.
  const COP_CALLS = ['{X} calls across to {Y}: "{Y.first}, with me."', '{X} on the radio: "{Y.first}, you copy?"', '{X} nods to {Y}. "Morning, {Y.first}."',
    '{X} waves {Y} over: "{Y.first}, over here."', '{X} to {Y}, quietly: "Easy, {Y.first}."'];
  function copNames(sc, b){
    if (!ST.watch) return;
    const roles = [...new Set([].concat(b.who || [], b.with || []))].filter(r => { const p = pOf(sc.cast[r]); return p && p.cop && !p.guard; });
    if (roles.length < 2 || !Object.values(sc.cast).includes(ST.watch)) return;
    if (U(sc.id, b.id, 'copname') > .45) return;
    const unknown = roles.filter(r => { const k = KN.get(sc.cast[r]); return !(k && k.first); }); if (!unknown.length) return;
    const yR = unknown.includes(Object.keys(sc.cast).find(r => sc.cast[r] === ST.watch)) ? Object.keys(sc.cast).find(r => sc.cast[r] === ST.watch) : unknown[0];   // (the one being watched first: their name is what you'd want)
    const xR = roles.find(r => r !== yR), tmpl = pick(COP_CALLS, sc.id, b.id, 'cc').replace(/\{X/g, '{' + xR).replace(/\{Y/g, '{' + yR);
    const ctx = ctxFor(sc, b, sc.anchor), learned = learnFrom(tmpl, sc.cast, new Set([xR, yR]), 'conversation', null, ctx);
    const ln = logLine(tmpl, sc.cast, ctx, 'reveal', { channel: 'conversation', fact: yR + '.name' });
    if (ln) note(ST.watch, { t: ST.clock, who: sc.cast[yR], fact: 'name', channel: 'conversation', verified: false, tmpl, cast: Object.assign({}, sc.cast), ctx, learned });
  }
  function finishScene(sc){
    const s = sc.s, A = SPM.get(sc.cast.A);
    // effects, flags, branches (as in the life sheet), and the cooldowns
    const cast = {}; for (const [r, id] of Object.entries(sc.cast)) cast[r] = SPM.get(id);
    const ef = s.effects || {};
    for (const [r, p, d] of ef.pressure || []) if (cast[r]) cast[r].pressure[p] = Math.min(1, Math.max(0, cast[r].pressure[p] + d));
    const setF = f => setFlag(f, cast);
    (ef.flags || []).forEach(setF); ((s.next && s.next.sets) || []).forEach(setF);
    const br = (s.next && s.next.branches) || [];
    if (br.length){ const tot = br.reduce((a, b) => a + b.w, 0); let x = U(sc.id, 'branch')*tot; for (const b of br){ if (x < b.w){ (b.sets || []).forEach(setF); break; } x -= b.w; } }
    if (A){ A.counts[s.id] = (A.counts[s.id] || 0) + 1; }
    LAST[s.id + '|' + sc.cast.A] = ST.clock; CITYLAST[s.id] = ST.clock;
    if (s.tier === 'dramatic') DRAMA.push(ST.clock);
    if (s.tier === 'notable') NOTABLE[day()] = (NOTABLE[day()] || 0) + 1;
    if (s.ambiguous && s.fairPlay){ const tr = Object.entries(s.fairPlay.truths).filter(([, id]) => D.byId.has(id) && D.byId.get(id).game); if (tr.length){ const [truth] = tr[H(sc.id, 'truth') % tr.length]; PENDING[s.id + '|' + sc.cast.A] = { truth, B: sc.cast[s.fairPlay.subject] }; } }
    if (s.resolves) delete PENDING[s.resolves.setup + '|' + sc.cast.A];
    for (const f of ST.finishHooks) try { f(sc); } catch (er){ console.warn('finish hook', er); }
    endScene(sc, 'done');
  }

  /* ---------- picking a storylet ---------- */
  const LAST = {}, CITYLAST = {}, DRAMA = [], NOTABLE = {}, PENDING = {}, PAIR = {};
  const pairKey = (a, b) => [a, b].sort().join('|');
  function hasFlag(f, cast){
    const [sc, name] = f.split(':');
    if (sc === 'city') return cityFlag(name);
    if (sc === 'world') return false;
    if (sc === 'single') return !!(cast.A && cast.A.world && cast.A.world[name]);
    const rs = sc.split('+');
    if (rs.length === 1) return !!(cast[rs[0]] && cast[rs[0]].flags[name]);
    return !!(cast[rs[0]] && cast[rs[1]] && (PAIR[pairKey(cast[rs[0]].id, cast[rs[1]].id)] || {})[name]);
  }
  function setFlag(f, cast){
    const [sc, name] = f.split(':');
    if (sc === 'city' || sc === 'world' || sc === 'single') return;
    const rs = sc.split('+');
    if (rs.length === 1){ if (cast[rs[0]]) cast[rs[0]].flags[name] = true; }
    else if (cast[rs[0]] && cast[rs[1]]){ const k = pairKey(cast[rs[0]].id, cast[rs[1]].id); (PAIR[k] = PAIR[k] || {})[name] = true; }
  }
  function cityFlag(name){
    const kinds = new Set([...places.values()].filter(pl => pl.mega).map(pl => pl.mega.kind));
    return { 'metro-line-opened': typeof metros !== 'undefined' && metros.length > 0, 'club-opened': kinds.has('club'), 'lawn-built': [...cells.values()].some(c => c.green === 'grass'),
      'stall-opened': kinds.has('square'), 'plaza-built': kinds.has('square'), 'bench-placed': kinds.has('square'), 'lift-built': [...cells.values()].some(c => c.liftCab), 'dropoff-built': false }[name] || false;
  }
  const raining = () => (typeof LK !== 'undefined' && LK.rainNow ? LK.rainNow() > .35 : !!S.rain);
  function meets(s, need, A, p){
    const kinH = s.rels.filter(r => r.kind === 'cohabitant-of');
    switch (need){
      case 'adult': return s.age >= 18; case 'young-adult': return s.age < 30; case 'middle-aged': return s.age >= 30 && s.age < 60; case 'senior': return s.age >= 60;
      case 'lives-alone': return !kinH.length; case 'lives-with-others': return kinH.length > 0;
      case 'lives-with-family': return kinH.some(k => s.rels.some(r => r.who === k.who && ['sibling-of', 'parent-of', 'child-of'].includes(r.kind)));
      case 'lives-with-nonfamily': return kinH.some(k => !s.rels.some(r => r.who === k.who && ['sibling-of', 'parent-of', 'child-of', 'partner-of'].includes(r.kind)));
      case 'same-district': { const a = A && places.get(A.home), b = places.get(s.home); return !!(a && b && Math.hypot(a.x - b.x, a.z - b.z) < LOT*3); }
      case 'other-district': { const a = A && places.get(A.home), b = places.get(s.home); return !!(a && b && Math.hypot(a.x - b.x, a.z - b.z) >= LOT*3); }
      case 'employed': return !!p.job; case 'unemployed': return !p.job;
      case 'stall-keeper': return jobKind(p) === 'stall-keeper'; case 'shop-worker': return jobKind(p) === 'shop-worker'; case 'industrial-worker': return jobKind(p) === 'industrial';
      case 'office-worker': return jobKind(p) === 'office-worker'; case 'night-worker': return !!p.nightWorker; case 'courier': return !!p.courier; case 'club-worker': return jobKind(p) === 'club-staff';
      case 'outgoing': return s.temper.outgoing > .6; case 'private': return s.temper.outgoing < .4; case 'careful': return s.temper.careful > .6; case 'impulsive': return s.temper.careful < .4;
      case 'warm': return s.temper.warm > .6; case 'guarded': return s.temper.warm < .4;
      case 'partnered': return s.rels.some(r => r.kind === 'partner-of'); case 'single': return !s.rels.some(r => r.kind === 'partner-of');
      case 'has-umbrella': return s.umbrella; 
      case 'sick': return sickOn(s.id, day()) !== null;
      default:
        if (need.startsWith('regular:')) return s.regulars.includes(need.slice(8));
        if (need.startsWith('zone:')) return p.zone === need.slice(5);
        if (need.startsWith('pressure-high:')) return s.pressure[need.slice(14)] > .6;
        return true;
    }
  }
  let NEAR = new Map();
  const nearFree = a => { let l = NEAR.get(a.id); if (l) return l; const [x, z] = posOf(a);
    l = pplList.filter(q => q !== a && free(q) && places.get(q.home) && Math.hypot(places.get(q.home).x - x, places.get(q.home).z - z) < LOT*3); NEAR.set(a.id, l); return l; };
  const LAZY = new Set(['acquaintance-of', 'stranger-to', 'rival-of', 'creditor-of', 'boss-of', 'landlord-of', 'ex-of']);
  // a cast for storylet s with A = person a (and any roles already fixed in `fixed`): real people, free right now
  function tryCast(s, a, fixed, nowH){
    const A = spOf(a); if (!A) return null;
    for (const n of (s.roles.A.needs || [])) if (!meets(A, n, A, a)) return null;
    const cast = { A }, used = new Set([A.id]);
    if (s.resolves){ const m = PENDING[s.resolves.setup + '|' + A.id]; if (!m || m.truth !== s.resolves.truth) return null; const b = SPM.get(m.B); if (!b || !free(pOf(m.B))) return null; cast.B = b; used.add(b.id); }
    for (const [r, id] of Object.entries(fixed || {})){ if (cast[r]) continue; const x = SPM.get(id); if (!x) return null; cast[r] = x; used.add(id); }
    for (const r of Object.keys(s.roles).filter(r => r !== 'A').sort()){
      const spec = s.roles[r];
      if (cast[r]){   // fixed: still has to fit the role
        if (spec.rel){ const [kind, T] = spec.rel.split(':'); if (cast[T] && !cast[T].rels.some(q => q.kind === kind && q.who === cast[r].id)) return null; }
        if (!(spec.needs || []).every(n => meets(cast[r], n, A, pOf(cast[r].id)))) return null;
        continue;
      }
      let cands = [];
      if (spec.rel){
        const [kind, T] = spec.rel.split(':'); const TT = cast[T]; if (!TT) return null;
        cands = relsOf(TT, kind);
        if (!cands.length && LAZY.has(kind)){   // nobody like that yet: someone nearby becomes it
          const near = nearFree(a).filter(q => !used.has(q.id)).slice(0, 12);
          const q = near[H(A.id, s.id, r) % (near.length || 1)]; if (q){ const xs = spOf(q); cands = [xs]; cast['_lazy' + r] = [xs.id, kind, TT.id]; }
        }
      } else {   // somebody near, free, with no particular tie
        cands = nearFree(a).slice(0, 16).map(spOf);
        if (/officer/.test(spec.desc || '')) return null;
      }
      const [ax0, az0] = posOf(a);
      cands = cands.filter(c => { if (!c || used.has(c.id)) return false; const q = pOf(c.id); if (!free(q)) return false; const [cx, cz] = posOf(q); return Math.hypot(cx - ax0, cz - az0) < 22 && (spec.needs || []).every(n => meets(c, n, A, q)); });   // (near enough to be part of it soon)
      const reqs = (s.when.requires || []).filter(f => f.split(':')[0].split('+').includes(r));
      cands = cands.filter(c => { const tmp = Object.assign({}, cast, { [r]: c }); return reqs.every(f => { const sc2 = f.split(':')[0].split('+'); return sc2.every(x => tmp[x]) ? hasFlag(f, tmp) : true; }); });
      if (!cands.length) return null;
      cast[r] = cands[H(A.id, s.id, r, nowH) % cands.length]; used.add(cast[r].id);
    }
    for (const f of s.when.requires || []){ const sc2 = f.split(':')[0]; if (!['city', 'world', 'single'].includes(sc2) && !sc2.split('+').every(x => cast[x])) return null; if (!hasFlag(f, cast)) return null; }
    for (const f of s.when.forbids || []){ const sc2 = f.split(':')[0]; if (['city', 'world', 'single'].includes(sc2) || sc2.split('+').every(x => cast[x])) if (hasFlag(f, cast)) return null; }
    // the home of the home-door steps must have a door to stand at, and its owner must be in to answer it
    const ids = {}; for (const [r, x] of Object.entries(cast)) if (!r.startsWith('_')) ids[r] = x.id;
    const owner = ownerOf(s, ids), op = pOf(ids[owner]);
    if (s.beats.some(b => b.at === 'home-door') && (!op || !streetDoor(places.get(op.home)))) return null;
    if (owner !== 'A' && op && (op.at !== op.home || op.walk)) return null;
    if (s.beats.some(b => b.at === 'work-door' || b.at === 'foundry-gate') && !(a.job && streetDoor(places.get(a.job)))) return null;
    if (s.beats.some(b => b.do === 'enter' && (b.at === 'work-door' || b.at === 'foundry-gate')) && (!(working(a, hourNow()) || working(a, (hourNow() + .75) % 24)) || ST.routine(a, (hourNow() + .75) % 24))) return null;   // (off to work only when work is about to start)
    // every place it happens has to be near where they are now (a moment, not a trek across town: the walking would be
    // most of it, and far trips are the metro's)
    const [ax, az] = posOf(a);
    for (const fb of s.beats){
      if (fb.indoors || !fb.at || fb.at === 'street' || fb.at === 'any') continue;
      let L = null;
      if (fb.at === 'home-door'){ const o = pOf(ids[owner]); L = o && places.get(o.home); }
      else if (fb.at === 'work-door' || fb.at === 'foundry-gate') L = places.get(a.job);
      else if (fb.at === 'shop-door') L = shopNear(ax, az, a.home);
      else L = openPlaceNear(ax, az);
      if (!L || Math.hypot(L.x - ax, L.z - az) > 18) return null;
    }
    // where each person is when it starts has to fit how the storylet first shows them: someone it has come out of a door
    // is indoors there now; someone indoors can only first be seen coming out, or answering their own door (handing
    // something over, talking on the step); anyone it first shows walking, waiting or knocking is already out
    const firstSeen = new Set(), ANSWER = new Set(['leave', 'hand-over', 'chat', 'hug', 'argue', 'pick-up', 'serve']);
    for (const b of s.beats){
      for (const r of [...[].concat(b.who || []), ...[].concat(b.with || [])]){
        if (firstSeen.has(r) || !ids[r]) continue; firstSeen.add(r);
        if (b.indoors) continue;
        const q = pOf(ids[r]); if (!q) return null;
        const inside = !q.walk && !q.spot;
        if (b.do === 'leave'){ if (!inside) return null; if (b.at === 'home-door' && q.at !== q.home && q.at !== (op && op.home)) return null; if ((b.at === 'work-door' || b.at === 'foundry-gate') && q.at !== q.job) return null; continue; }
        if (inside && !(ANSWER.has(b.do) && b.at === 'home-door' && q.at === pOf(ids[owner]).home)) { if (q.id === ST.watch || [].concat(b.who || []).includes(r)) return null; }
      }
    }
    return cast;
  }
  function weightOf(s, A, a){
    const w = s.when; let x = w.weight*{ mundane: 1, texture: .85, notable: .55, dramatic: .4 }[s.tier];
    if (w.requires && w.requires.length) x *= 3;
    if (s.resolves) x *= 2.5;
    if (s.roles.A.needs && s.roles.A.needs.includes('sick')) x *= 6;
    for (const [k, v] of Object.entries(w.temper || {})) x *= 1 + v*(A.temper[k] - .5)*2;
    if (A.regulars.some(r => (w.at || []).some(p => p.includes(r)))) x *= 1.3;
    x *= Math.pow(.3, A.counts[s.id] || 0);
    if (s.tier === 'notable' || s.tier === 'dramatic') x *= { quiet: 1, textured: 1.6, eventful: 3 }[A.life];
    return Math.max(.01, x);
  }
  const inHours = (h, [a, b]) => a <= b ? h >= a && h < b : h >= a || h < b;
  function eligibleWhen(s, A, nowH, h){
    const w = s.when, tiers = w.lifeTiers || D.vocab.defaultLifeTiers[s.tier];
    if (!s.game || !tiers.includes(A.life) || !inHours(h, w.hours)) return false;
    const dow = day() % 7, weekend = dow >= 5;
    if ((w.days === 'weekday' && weekend) || (w.days === 'weekend' && !weekend)) return false;
    if ((w.weather === 'rain' && !raining()) || (w.weather === 'clear' && raining())) return false;
    const last = LAST[s.id + '|' + A.id]; if (last !== undefined && (ST.clock - last)/60 < w.cooldown.person) return false;
    const lc = CITYLAST[s.id]; if (lc !== undefined && (ST.clock - lc)/60 < w.cooldown.city) return false;
    for (const [k, [lo, hi]] of Object.entries(w.pressure || {})) if (!(A.pressure[k] >= lo && A.pressure[k] <= hi)) return false;
    if (s.tier === 'dramatic' && (DRAMA.filter(t => ST.clock - t < 7*1440).length >= 3 || DRAMA.some(t => ST.clock - t < 36*60))) return false;
    if (s.tier === 'notable' && (NOTABLE[day()] || 0) >= 8) return false;
    return true;
  }
  // the director: for the person being watched, now and then, a moment of their life (or of someone's life that they're part of).
  // With pacing on (pacing.js) this is only the fallback: pacing decides when, and asks choose() for what.
  let dirNext = 0;
  // the storylets that fit this person right now, each with a cast and a weight ([] and DBG.why when none do)
  function choose(sub){
    const p = sub && pOf(sub); if (!p || !D || p.scene){ DBG.why = !p ? 'no subject' : p.scene ? 'in a scene' : 'no data'; return []; }
    if (!free(p) || (p.walk && !p.walk.scene && p.walk.s < .5)){ DBG.why = 'busy'; return []; }
    const h = hourNow(), A = spOf(p), nowH = Math.floor(ST.clock/60);
    if (asleep(p, h) && !ST.isSick(p.id)){ DBG.why = 'asleep'; return []; }
    const atWork = p.job && working(p, h) && p.at === p.job;
    const opts = []; NEAR = new Map();
    const consider = (s, a, fixed) => {
      const As = spOf(a); if (!As || !eligibleWhen(s, As, nowH, h)) return;
      if (ST.isSick(p.id) && !(s.roles.A.needs || []).includes('sick')) return;   // (the watched person is sick: nothing takes them out)
      if (atWork && !s.beats.some(b => b.at === 'work-door') && s.category !== 'work') return;
      const cast = tryCast(s, a, fixed, nowH); if (!cast) return;
      if (!placesOk(s, Object.fromEntries(Object.entries(cast).filter(([r]) => !r.startsWith('_lazy')).map(([r, x]) => [r, x.id])))) return;   // (its lawn, square or seat isn't near)
      opts.push({ s, cast, w: weightOf(s, As, a)*(a === p ? 1 : .6) });
    };
    for (const s of D.stories) consider(s, p, null);
    // their part in someone else's moment: someone who knows them comes by
    const [px0, pz0] = posOf(p);
    const others = A.rels.map(r => pOf(r.who)).filter(q => q && free(q) && (([x, z]) => Math.hypot(x - px0, z - pz0) < 22)(posOf(q))).slice(0, 10);
    for (const q of others) for (const s of D.stories){ if (!s.game || !s.roles.B || !s.roles.B.rel) continue; const [, T] = s.roles.B.rel.split(':'); if (T !== 'A') continue; consider(s, q, { B: p.id }); }
    DBG.runs++; DBG.opts = opts.length; DBG.top = opts.slice().sort((a, b) => b.w - a.w).slice(0, 5).map(o => o.s.id);
    if (!opts.length) DBG.why = 'nothing fits';
    return opts;
  }
  const pickOpt = (opts, salt) => { const tot = opts.reduce((a, o) => a + o.w, 0); let x = U(salt, ST.clock, 'pick')*tot, ch = opts[opts.length - 1]; for (const o of opts){ if (x < o.w){ ch = o; break; } x -= o.w; } return ch; };
  function startOpt(ch){
    const ids = {}; for (const [r, s] of Object.entries(ch.cast)){ if (r.startsWith('_lazy')){ extraRels.push(s); const [a, k, b] = s; addRel(SPM.get(a), k, SPM.get(b)); continue; } ids[r] = s.id; }
    const sc = startScene(ch.s, ids); DBG.why = sc ? 'started ' + ch.s.id : 'could not start ' + ch.s.id; return sc;
  }
  // a parcel on its way to their door (false: not now)
  function tryDrone(sub){ const p = pOf(sub); if (!p || p.at !== p.home || p.walk || DELIV.get(sub) === day()) return false; if (!sendDrone(p.home)) return false; DELIV.set(sub, day()); DBG.why = 'drone sent'; return true; }
  function director(){
    if (typeof PACE !== 'undefined' && PACE.on()){ DBG.why = 'paced (pacing.js)'; return; }
    const sub = ST.watch, p = sub && pOf(sub); if (!p || !D || p.scene){ DBG.why = !p ? 'no subject' : p.scene ? 'in a scene' : 'no data'; return; }
    if (ST.clock < dirNext) return;
    dirNext = ST.clock + 20 + U(sub, ST.clock, 'dir')*30;
    if (!free(p) || (p.walk && !p.walk.scene && p.walk.s < .5)){ DBG.why = 'busy'; return; }
    if (asleep(p, hourNow()) && !ST.isSick(p.id)){ DBG.why = 'asleep'; return; }
    // a parcel on its way: often when they're sick at home (medicine, broth), now and then on an ordinary day
    if (p.at === p.home && !p.walk && DELIV.get(sub) !== day() && roll(ST.isSick(sub) ? .6 : .12, sub, ST.clock, 'drone') && tryDrone(sub)) return;
    const opts = choose(sub); if (!opts.length) return;
    // the quiet stretches are real: often nothing happens
    if (!roll(.55, sub, ST.clock, 'go')) return;
    startOpt(pickOpt(opts, sub));
  }
  ST.choose = choose; ST.pickOpt = pickOpt; ST.startOpt = startOpt; ST.tryDrone = tryDrone;
  const DBG = { runs: 0, opts: 0, why: '', top: [] };
  ST.startScene = startScene; ST.endScene = endScene; ST.openPlaceNear = openPlaceNear; ST.nearestNode = nearestNode; ST.streetDoor = streetDoor; ST.shopNear = shopNear; ST.H = H; ST.U = U;
  // (for pacing.js: the pieces a fragment is made of)
  ST.logLine = logLine; ST.note = note; ST.learnFrom = learnFrom; ST.free = free; ST.jobKind = jobKind; ST.JOB_WORD = JOB_WORD; ST.employerName = employerName;
  ST.seenDays = seenDays; ST.seenKeys = id => SEEN.get(id) || new Map(); ST.departures = id => DEP.get(id) || new Map(); ST.news = () => NEWS; ST.raining = raining; ST.data = () => D;
  ST.hourNow = hourNow; ST.relWord = relWord; ST.pick = pick;
  ST.dbg = DBG; ST._dir = () => { dirNext = 0; director(); return DBG; };   // (for tests: a director pass now)

  /* ---------- names in passing, and gossip ---------- */
  function passing(sc, b){
    const P = D.vocab.passing, sub = ST.watch; if (!P || !sub) return;
    const A = sc.cast.A; if (A !== sub) return;
    const kA = KN.get(A) || {}, Ap = pOf(A), As = SPM.get(A);
    const who = [].concat(b.who || []), all = [...who, ...[].concat(b.with || [])];
    const push = (line, cast, channel, whoId, fact) => {
      const present = new Set(Object.keys(cast)), learned = learnFrom(line, cast, present, channel, null, {});
      const e = logLine(line, cast, {}, 'reveal', { channel, fact: 'passing.' + fact }); if (e) note(sub, { t: ST.clock, who: whoId, fact: 'X.' + fact, channel, verified: channel === 'document', tmpl: line, cast, ctx: {}, learned, passing: true });
    };
    const tagAt = Ap && Ap.job && P.nameTag.jobs[jobKind(Ap)];
    if (tagAt && tagAt.includes(b.at) && who.includes('A') && !kA.first && roll(P.nameTag.chance, 'tag', sc.id, b.id)) return push(pick(P.nameTag.lines, sc.id, 'tagl'), { A }, 'document', A, 'first-name');
    if (b.do === 'phone-call' && who.includes('A') && !kA.first && roll(P.phone.chance, 'ph', sc.id, b.id)) return push(pick(P.phone.lines, sc.id, 'phl'), { A }, 'phone', A, 'first-name');
    if (P.orderCall.actions.includes(b.do) && all.includes('A') && !kA.first && ['stall', 'cafe-stool', 'bar-kiosk', 'market-mall'].includes(b.at) && roll(P.orderCall.chance, 'oc', sc.id, b.id)) return push(pick(P.orderCall.lines, sc.id, 'ocl'), { A }, 'conversation', A, 'first-name');
    if (!P.actions.includes(b.do) || !all.includes('A')) return;
    for (const r of all){
      if (r === 'A') continue;
      const X = sc.cast[r]; if (!X || !As || !As.rels.some(q => q.who === X && q.kind !== 'stranger-to')) continue;
      const kX = KN.get(X) || {}, I = ident(A);
      const canA = !kA.first || (I.nick && !kA.nick), canX = !kX.first; if (!canA && !canX) continue;
      if (!roll(P.chance, 'pass', sc.id, b.id, r)) continue;
      if (canA && (!canX || roll(.6, 'pdir', sc.id))){ const nick = I.nick && !kA.nick && (kA.first || roll(P.nickChance, 'pn', sc.id)); return push(pick(nick ? P.toANick : P.toA, sc.id, b.id, 'pl'), { A, B: X }, 'conversation', A, nick ? 'nickname' : 'first-name'); }
      return push(pick(P.byA, sc.id, b.id, 'pl'), { A, B: X }, 'conversation', X, 'first-name');
    }
  }
  // news about people: who is sick, who got what. Kept short, and told by people who know the person.
  const NEWS = [];   // { kind, who, day, sender, look, tellers: Set }
  function news(kind, who, extra){
    if (NEWS.some(n => n.kind === kind && n.who === who && day() - n.day < 2)) return;
    NEWS.push(Object.assign({ kind, who, day: day(), told: 0 }, extra || {})); if (NEWS.length > 200) NEWS.shift();
  }
  function gossipIn(sc, b){
    if (!TALK.has(b.do) || !ST.watch) return;
    const all = [...[].concat(b.who || []), ...[].concat(b.with || [])];
    if (!all.some(r => sc.cast[r] === ST.watch)) return;
    for (const r of all){ const X = sc.cast[r]; if (X && X !== ST.watch) if (tellNews(X, sc.id + b.id)) return; }
  }
  // speaker X passes on something about someone they know, in front of the watched person
  function tellNews(X, salt){
    const Xs = SPM.get(X); if (!Xs) return false;
    const mine = NEWS.filter(n => n.who !== X && n.who !== ST.watch && n.told < 4 && day() - n.day <= 3 && Xs.rels.some(r => r.who === n.who));
    if (!mine.length || !roll(.5, 'news', X, salt)) return false;
    const n = mine[H(X, salt, 'pickn') % mine.length]; n.told++;
    const E = D.engine.gossip, line = pick(E[n.kind], X, n.who, salt);
    const dd = day() - n.day, ctx = { when: dd <= 0 ? 'today' : dd === 1 ? 'yesterday' : 'on ' + DAYS[n.day % 7], sender: n.sender, look: n.look };
    const cast = { B: X, C: n.who };
    logLine(line, cast, ctx, 'hearsay', { about: n.who });
    learnFrom(line, cast, new Set(['B']), 'conversation', null, ctx);   // (C isn't here: their name is just a name, unless already known)
    // the person talked about gets a secondhand entry in their notebook
    const rel = Xs.rels.find(r => r.who === n.who), kindWord = rel ? relWord(rel.kind, Xs.g) : 'neighbor';
    const ent = pick(E.entry[n.kind], X, n.who, 'ent').replace('{S}', 'a ' + (['housemate', 'partner', 'sister', 'brother', 'mother', 'father'].includes(kindWord) ? 'relative' : kindWord));
    const prev = (NOTES.get(n.who) || []).find(e => e.ev === n.kind + ':' + n.day);
    if (prev){ if (!prev.sources.includes(X)){ prev.sources.push(X); ST.rev++; } }
    else note(n.who, { t: ST.clock, who: n.who, fact: 'hearsay', channel: 'conversation', verified: false, text: render({ tmpl: ent, cast: {}, ctx }), ev: n.kind + ':' + n.day, sources: [X] });
    const k = kn(n.who); if (!k.first){ k.first = ident(n.who).first; k.firstAt = ST.clock; k.firstVia = { channel: 'hearsay', verified: false, at: ST.clock }; }
    return true;
  }
  // sickness news spreads from the people who'd know: a few times a game day, for anyone sick
  let newsScan = -1;
  function scanNews(){
    const h = Math.floor(ST.clock/180); if (h === newsScan) return; newsScan = h;
    for (const s of SPM.values()){ const since = sickOn(s.id, day()); if (since !== null && day() - since >= 0) news('sick', s.id); }
  }

  /* ---------- the subject's ordinary day, as the monitor sees it ---------- */
  let subPrev = null;
  function watchRoutine(){
    const sub = ST.watch, p = sub && pOf(sub); if (!p || !D || p.scene) { subPrev = null; return; }
    const E = D.engine.routine;
    // (an officer on the beat walks from corner to corner: their walk is headed for the station on paper, but they're at a street corner, not inside)
    const state = p.metro ? 'metro' : p.walk ? (p.walk.beat ? 'beat' : 'walk:' + (p.walk.to || '')) : p.patrol ? 'post:' + p.patrol.key : p.spot ? 'spot:' + p.spot.key : 'in:' + p.at;
    if (subPrev === null){ subPrev = state; return; }
    if (state === subPrev) return;
    const prev = subPrev; subPrev = state;
    const A = { A: sub };
    if (typeof PACE !== 'undefined' && PACE.on()) PACE.transition(sub, p, prev, state);   // (fragments that happen at a door: pacing.js)
    const pick = (list, ...salt) => (typeof PACE !== 'undefined' && PACE.on() && PACE.routine(sub, p, list, salt)) || STORY_PICK(list, ...salt);   // (pacing: varied, and never the same line twice running)
    if (state === 'metro'){ logLine(pick(E.metro, sub, ST.clock, 'mt'), A, {}, 'live'); return; }
    if (prev === 'metro'){ logLine(pick(E.metroOff, sub, ST.clock, 'mo'), A, {}, 'live'); return; }
    if (state.startsWith('post:')){ if (prev === 'beat' && roll(.35, sub, ST.clock, 'pt') && E.patrol) logLine(pick(E.patrol, sub, ST.clock, 'pt'), A, {}, 'live'); return; }
    if ((state === 'beat' || state.startsWith('walk:')) && prev.startsWith('in:') && p.walk && p.walk.doorA){
      const pl = places.get(prev.slice(3)); logLine(pick(E.leave, sub, ST.clock, 'lv'), A, { place: placeText(pl), placeId: pl ? pl.id : undefined }, 'live');
      if (pl && pl.id === p.home){ seenDays(sub, 'leave-home').add(day()); const firsts = DEP.get(sub) || DEP.set(sub, new Map()).get(sub); if (!firsts.has(day())) firsts.set(day(), hourNow()); }
    }
    else if (state.startsWith('in:') && prev.startsWith('walk:')){
      const pl = places.get(p.at), n = seenDays(sub, 'enter:' + p.at); n.add(day());
      const useSeen = n.size >= 2 && roll(.5, sub, ST.clock, 'es');
      logLine(pick(useSeen ? E.enterSeen : E.enter, sub, ST.clock, 'en'), A, { place: placeText(pl), placeId: pl ? pl.id : undefined, seen: n.size }, 'live');
    }
    else if (state.startsWith('spot:') && p.spot){
      const pl = places.get(p.at), k = p.spot.kind, list = k === 'seat' ? E.seat : k === 'queue' ? E.queue : k === 'vendor' ? E.keeper : E.stand;
      logLine(pick(list, sub, ST.clock, 'sp'), A, { place: placeText(pl), placeId: pl ? pl.id : undefined }, 'live');
      // chatting with someone standing beside them: smalltalk, and now and then a name or some news
      const mate = p.spot.near && p.spot.near.find(o => o.by && people.get(o.by) && !people.get(o.by).walk);
      if (mate){ const B = mate.by; logLine(pick(E.chat, sub, B, ST.clock), { A: sub, B }, { place: placeText(pl), placeId: pl ? pl.id : undefined }, 'live');
        if (!tellNews(B, 'amb' + ST.clock) && roll(.35, sub, B, ST.clock, 'st')) logLine(pick(E.smalltalk, sub, B, ST.clock, 'stl'), { A: sub, B }, {}, 'live');
        const fake = { id: 'amb:' + ST.clock, cast: { A: sub, B } }; passing(fake, { id: 'b1', do: 'chat', who: ['A'], with: ['B'], at: 'square' }); }
    }
  }
  // a door that stays shut at the hour they usually come out
  const DEP = new Map();   // subject -> day -> hour first seen leaving home
  let absAt = { id: null, day: -1, n: 0 };
  function watchAbsence(){
    const sub = ST.watch, p = sub && pOf(sub); if (!p || p.scene || !D) return;
    if (absAt.id !== sub || absAt.day !== day()) absAt = { id: sub, day: day(), n: 0 };
    if (p.walk || p.spot || p.at !== p.home) return;
    const deps = DEP.get(sub); if (!deps) return;
    const prev = [...deps.entries()].filter(([d]) => d < day()).map(([, h]) => h); if (!prev.length) return;
    const usual = prev.reduce((a, b) => a + b, 0)/prev.length, h = hourNow();
    if (deps.has(day())) return;
    const E = D.engine.absence;
    if (absAt.n === 0 && h > usual + .35 && h < usual + 2){ absAt.n = 1; logLine(pick(E.first, sub, day()), { A: sub }, { seen: prev.length }, 'live'); }
    else if (absAt.n === 1 && h > usual + 2.2 && h < usual + 6){ absAt.n = 2; logLine(pick(E.later, sub, day(), 'l'), { A: sub }, {}, 'live'); }
  }

  /* ---------- deliveries: the drone waits for someone to come out ---------- */
  // people.js: a drone has reached a home's door. Returns true if someone is coming out for it.
  ST.botAtDoor = (b, door, t) => {
    if (!ST.on || door.lift) return false;
    const pl = [...places.values()].find(x => x.doors && x.doors.includes(door)); if (!pl) return false;
    const home = pplList.filter(q => q.home === pl.id && q.at === pl.id && !q.walk && free(q) && !asleep(q, S.hour));
    if (!home.length) return false;
    const sub = ST.watch, q = home.find(x => x.id === sub) || home[H(pl.id, ST.clock, 'rcpt') % home.length];
    const kind = packageFor(q), K = D.engine.delivery.kinds[kind];
    const react = (() => { const sp = spOf(q), w = Object.assign({}, K.react); w.mesh *= .5 + sp.temper.outgoing; w.silent *= 1.5 - sp.temper.outgoing; w.phone *= sp.rels.length ? 1 : .2;
      const tot = w.silent + w.phone + w.mesh; let x = U(q.id, ST.clock, 'react')*tot; return x < w.silent ? 'silent' : (x -= w.silent) < w.phone ? 'phone' : 'mesh'; })();
    const E = D.engine.delivery;
    const beats = [{ id: 'b2', do: 'leave', who: 'A', at: 'home-door' }, { id: 'b3', do: 'pick-up', who: 'A', at: 'home-door' }];
    if (react === 'phone') beats.push({ id: 'b4', do: 'phone-call', who: 'A', at: 'home-door' });
    beats.push({ id: 'b5', do: 'enter', who: 'A', at: 'home-door' });
    if (react === 'mesh') beats.push({ id: 'b6', do: 'post-feed', who: 'A', at: 'home-door', indoors: true });
    const s = { id: 'dlv.' + kind, category: 'deliveries', tier: 'mundane', roles: { A: { desc: 'someone at home' } }, when: D.stories[0].when, beats, log: {}, game: true };
    const lines = { b2: E.take, b3: () => null, b4: K.phone, b5: react === 'silent' ? K.silent : ['{A} goes back in with it. The door slides shut.', '{A} goes in, the parcel under one arm.'] };
    if (ST.watch === q.id) logLine(pick(E.arrive, q.id, ST.clock, 'arr'), { A: q.id }, { placeId: pl.id }, 'live');
    const sc = startScene(s, { A: q.id }, { lines, done: (sc2, why) => { b.storyWait = false; if (why !== 'done' && !b.taken){ b.storyNobody = true; } } });
    if (!sc) return false;
    sc.dlv = { kind, K, react, bot: b }; b.storyWait = true; b.taken = false; b.waitT = t;
    news('parcel', q.id, { sender: K.sender, look: K.look });
    return true;
  };
  // what's in the parcel follows their life
  function packageFor(p){
    const s = spOf(p), K = D.engine.delivery.kinds, sick = ST.isSick(p.id), opts = [];
    const fits = w => w === 'any' || (w === 'sick' && sick) || (w === 'outgoing' && s.temper.outgoing > .6) || (w === 'partnered' && s.rels.some(r => r.kind === 'partner-of'))
      || (w === 'partnered-secret' && s.rels.some(r => r.kind === 'partner-of') && s.pressure.secret > .45) || (w === 'family-away' && s.rels.some(r => ['sibling-of', 'parent-of', 'cousin-of'].includes(r.kind) && SPM.get(r.who) && SPM.get(r.who).home !== s.home))
      || (w === 'money' && s.pressure.money > .6) || (w === 'work-trouble' && s.pressure['work-trouble'] > .55) || (w === 'industrial' && jobKind(p) === 'industrial') || (w === 'careful' && s.temper.careful > .6) || (w === 'warm' && s.temper.warm > .6);
    for (const [k, v] of Object.entries(K)) if ((v.when || ['any']).some(fits)) opts.push([k, v.weight*((v.when || []).includes('sick') && sick ? 3 : 1)]);
    const tot = opts.reduce((a, o) => a + o[1], 0); let x = U(p.id, ST.clock, 'pkg')*tot;
    for (const [k, w] of opts){ if (x < w) return k; x -= w; } return opts.length ? opts[0][0] : 'gift';
  }
  // the person reaches the step (beat b3): they take it from the drone, the label is read, what it is shows
  function deliveryTake(sc){
    const d = sc.dlv; if (!d || d.took) return; d.took = true;
    const b = d.bot; b.taken = true; b.storyWait = false;
    { const q = pOf(sc.cast.A); if (q){ const k = { flowers: 'flowers', soup: 'food', bottle: 'bottle', letter: 'paper', legal: 'paper', seeds: 'pot', medicine: 'bag' }[d.kind] || 'box'; q.held = PG.heldPick(k, d.K.look || '', q.id); } }   // (what came, in their hands: peoplegen_held.js)
    if (!sc.seen.includes('b3') && !sc.seen.includes('b2')) return;
    const E = D.engine.delivery, A = sc.cast.A, ctx = { sender: d.K.sender, look: d.K.look };
    const lab = pick(E.label, sc.id, 'lab'), learned = learnFrom(lab, sc.cast, new Set(['A']), 'document', null, ctx);
    const e = logLine(lab, sc.cast, ctx, 'reveal', { channel: 'document', fact: 'A.full-name' });
    if (e) note(A, { t: ST.clock, who: A, fact: 'A.full-name', channel: 'document', verified: true, tmpl: lab, cast: sc.cast, ctx, learned });
    const lk = pick(E.look, sc.id, 'look'); logLine(lk, sc.cast, ctx, 'live');
    if (d.react === 'mesh'){ const m = pick(d.K.mesh, sc.id, 'mesh'); d.mesh = m; }
  }
  // a drone sent to a home's door (the nearest one free at its shop)
  function sendDrone(home){
    const pl = places.get(home), d = streetDoor(pl); if (!d) return false;
    const free_ = bots.filter(b => b.state === 'in' && places.get(b.hub) && places.get(b.hub).doors.length).sort((a, b) => { const A = places.get(a.hub), B = places.get(b.hub); return Math.hypot(A.x - pl.x, A.z - pl.z) - Math.hypot(B.x - pl.x, B.z - pl.z); });
    for (const b of free_.slice(0, 4)){
      const hub = places.get(b.hub), from = hub.doors[0], mid = route(from.node, d.node); if (!mid) continue;
      b.walk = walkOf([[from.inside.x, from.inside.z], [from.wall.x, from.wall.z]].concat(mid), { doorA: from, doorB: null, target: d }); b.state = 'go'; b.door = null; return true;
    }
    return false;
  }
  ST.sendDrone = id => { const p = pOf(id); return !!p && sendDrone(p.home); };
  const DELIV = new Map();   // subject -> the day a drone was last sent their way
  ST.deliveries = () => D ? Object.keys(D.engine.delivery.kinds) : [];

  /* ---------- every frame ---------- */
  ST.clockReal = 0;
  ST.tick = rdt => {
    ST.clockReal += rdt;
    // the game clock, in minutes since the first day (the hour slider moving back counts as the next day)
    if (ST.lastHour === null){   // the first frame: the clock picks up at the hour the city is at (on the saved day, or the day after if that hour has passed)
      ST.lastHour = S.hour; const d0 = Math.floor(ST.clock/1440), m = S.hour*60; ST.clock = (m >= ST.clock - d0*1440 ? d0 : d0 + 1)*1440 + m; }
    let dh = S.hour - ST.lastHour; if (dh < 0) dh += 24; ST.lastHour = S.hour; ST.clock += dh*60;
    if (!ST.on || !pplReady) return;
    maybeBuildNet();
    for (const sc of [...SC]){
      // someone in it was taken away (a rebuild, the club, a removal): it ends where it is
      { const lost = Object.values(sc.cast).find(id => { const p = pOf(id); return !p || p.scene !== sc || (p.walk && !p.walk.scene); }); if (lost){ const p = pOf(lost); endScene(sc, 'lost ' + (!p ? 'gone' : p.scene !== sc ? 'other scene' : 'walk ' + (p.walk.beat ? 'beat' : p.walk.to))); continue; } }
      if (sc.dlv && sc.b && sc.b.id === 'b3' && sc.phase === 'hold') deliveryTake(sc);
      if (sc.dlv && sc.dlv.mesh && sc.b && sc.b.id === 'b6' && sc.phase === 'hold'){ const m = sc.dlv.mesh; sc.dlv.mesh = null; if (ST.watch === sc.cast.A) logLine(m, sc.cast, {}, 'reveal', { channel: 'feed', fact: 'A.said' }); }
      try { stepScene(sc); } catch (e){ console.warn('story scene', sc.s.id, e); endScene(sc, 'error'); }
    }
    if (typeof CASES !== 'undefined') try { CASES.tick(); } catch (e){ console.warn('cases', e); }
    director(); watchRoutine(); watchAbsence(); scanNews();
    if (typeof PACE !== 'undefined') try { PACE.tick(rdt); } catch (e){ console.warn('pacing', e); }
    if (ST.clockReal - savedAt > 10){ savedAt = ST.clockReal; save(); }
  };
  // indoors beats of a delivery scene: a post on the mesh is still readable from outside
  ST.setWatch = id => { ST.watch = id; subPrev = null; dirNext = ST.clock + 3; ST.rev++; if (id) ident(id); };

  /* ---------- keeping it between sessions ---------- */
  const KEY = 'neonIsland.stories';
  let savedAt = 0;
  function save(){
    try {
      const ids = new Set([...KN.keys(), ...LOGS.keys(), ...NOTES.keys()]);
      for (const L of LOGS.values()) for (const e of L) for (const id of Object.values(e.cast || {})) ids.add(id);
      const idents = {}; for (const id of ids){ const I = ident(id); if (I.first !== '?') idents[id] = I; }
      const logs = [...LOGS.entries()].slice(-30).map(([k, L]) => [k, L.slice(-200).map(e => ({ t: e.t, tmpl: e.tmpl, cast: e.cast, ctx: e.ctx, kind: e.kind, first: e.first, channel: e.channel }))]);
      const data = { v: 1, clock: ST.clock, known: [...KN.entries()], logs, notes: [...NOTES.entries()].map(([k, n]) => [k, n.slice(-80)]), idents,
        flags: [...SPM.values()].filter(s => Object.keys(s.flags).length || Object.keys(s.counts).length).map(s => [s.id, s.flags, s.counts]), pair: PAIR, last: LAST, citylast: CITYLAST, pending: PENDING, extra: extraRels.slice(-200),
        seen: [...SEEN.entries()].map(([id, m]) => [id, [...m.entries()].map(([k, s]) => [k, [...s].slice(-14)])]), dep: [...DEP.entries()].map(([id, m]) => [id, [...m.entries()].slice(-14)]),
        pace: typeof PACE !== 'undefined' && PACE.saveData ? PACE.saveData() : ST.paceSaved || null };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e){}
  }
  function restore(){
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return; const d = JSON.parse(raw); if (!d || d.v !== 1) return;
      ST.clock = d.clock || 0;
      for (const [k, v] of d.known || []) KN.set(k, v);
      for (const [k, L] of d.logs || []) LOGS.set(k, L.map(e => Object.assign(e, { subject: k })));
      for (const [k, n] of d.notes || []) NOTES.set(k, n);
      for (const [k, v] of Object.entries(d.idents || {})) IDENT.set(k, v);
      for (const [id, f, c] of d.flags || []) FLAGS0.set(id, [f, c]);
      Object.assign(PAIR, d.pair || {}); Object.assign(LAST, d.last || {}); Object.assign(CITYLAST, d.citylast || {}); Object.assign(PENDING, d.pending || {});
      extraRels.push(...(d.extra || []));
      for (const [id, m] of d.seen || []) SEEN.set(id, new Map(m.map(([k, s]) => [k, new Set(s)])));
      for (const [id, m] of d.dep || []) DEP.set(id, new Map(m));
      ST.paceSaved = d.pace || null;   // (pacing.js picks it up)
    } catch (e){}
  }
  addEventListener('beforeunload', save);
  ST.forget = () => { KN.clear(); LOGS.clear(); NOTES.clear(); SEEN.clear(); DEP.clear(); try { localStorage.removeItem(KEY); } catch (e){} ST.rev++; };

  /* ---------- for the monitor ---------- */
  ST.identOf = ident;
  ST.descOf = descOf;
  ST.relLabel = relLabel;
  ST.placeText = placeText;
  ST.peopleAround = sub => {   // everyone the player has a name or a stated relation for, who came up on this monitor
    const ids = new Set();
    for (const e of LOGS.get(sub) || []) for (const id of Object.values(e.cast || {})) if (id !== sub) ids.add(id);
    for (const [id, k] of KN) if (k.relTo === sub) ids.add(id);
    return [...ids].filter(id => { const k = KN.get(id); return k && (k.first || k.rel); });
  };
  ST.loose = sub => {   // names heard on this monitor for nobody the player can put a face to yet
    const out = [];
    for (const e of LOGS.get(sub) || []) for (const [r, id] of Object.entries(e.cast || {})){
      const k = KN.get(id); if (k && k.first) continue;
      const full = new RegExp('\\{' + r + '\\.full\\}').test(e.tmpl), first = full || new RegExp('\\{' + r + '\\.first\\}').test(e.tmpl); if (!first) continue;
      const I = ident(id), nm = I.first + (full ? ' ' + I.last : ''); if (!out.includes(nm)) out.push(nm);
    }
    return out;
  };
  ST.stats = () => ({ on: ST.on, people: SPM.size, scenes: SC.size, degrees: ST.degreesOf(), day: day() + 1, news: NEWS.length, stories: D ? D.stories.filter(s => s.game).length : 0 });
  return ST;
})();
window.STORY = STORY;
STORY.load();
