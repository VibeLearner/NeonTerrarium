// Neon Terrarium: pacing. The rhythm of what the monitor shows, for the person being watched (and, slower, the people pinned).
// All game scripts share one scope and load in order (see index.html). Loads after story.js and cases.js, before monitor.js.
// Plan: claude/pacing-director-plan.md in the project.
'use strict';
//
// The story engine (story.js) knows what can happen: storylets, parcels, names in passing, the case moments (cases.js).
// This decides when, on a clock of real seconds of watching (so fast forward doesn't starve it), in a loop:
//   calm   (40 to 110 s)  ambient lines now and then: what's different about today, never a list cycled through
//   build  (2 to 4 min)   cues that something is coming, closer together near the end, tied to what is coming
//   payoff                about half the time big (a storylet, a parcel; for officers a call from a resident), half small (a
//                         fragment: a piece of who they are, through a channel that fits where they are). Never nothing.
//   after  (30 to 60 s)   quiet
// Anything the story engine logs on its own (a storylet, a case moment) counts as the moment, and the loop waits it out.
// Everything here is either a log line (nothing changes in the city) or goes through the engine's own way of starting a
// scene. Fragments are always true: a line only says what is so of the city right now. Off camera nothing is learned;
// what happens to someone while they're not watched is remembered, and when they're watched again the first payoff
// leans on it (someone who was there mentions it).
// Switch: PACE.set(false) (or the #dev readout's button) puts the old director back.

const PACE = (() => {
  const P = { data: null, now: 0, st: new Map(), dbg: { last: '' }, off: false, pinScene: null };
  try { P.off = localStorage.getItem('neonIsland.pacingOff') === '1'; } catch (e){}
  P.on = () => !P.off && !!P.data && !!STORY.on;
  P.set = on => { P.off = !on; try { if (on) localStorage.removeItem('neonIsland.pacingOff'); else localStorage.setItem('neonIsland.pacingOff', '1'); } catch (e){} };
  fetch('data/stories/pacing.json' + (STORY.ver ? '?v=' + STORY.ver : '')).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { P.data = d; }).catch(e => console.warn('pacing: not loaded (' + e + '); the story engine paces itself'));

  const T = { calm: [40, 110], build: [120, 240], after: [30, 60], amb: [25, 60], firstCalm: [5, 12], firstBuild: [25, 50], pin: [180, 360], copPity: 300, kindGap: 240 };
  const rnd = ([a, b]) => a + Math.random()*(b - a);
  const pOf = id => (typeof people !== 'undefined' && people.get(id)) || null;
  const d2 = (a, b) => (a.x - b.x)**2 + (a.z - b.z)**2;
  const isCop = p => !!(p && p.cop && !p.guard);
  // out where the camera can see them (and not in a moment of the engine's own)
  const isOut = p => !!p && p.x !== undefined && !p.scene && !p.metro && !p.ride && !p.club && !p.clubbing && (!!p.walk || !!p.spot || !!p.patrol);

  /* ---------- the state kept for each person ---------- */
  function st(id){
    let s = P.st.get(id);
    if (!s){ s = { phase: 'calm', t: 0, len: rnd(T.calm), quiet: 0, ambIn: rnd(T.amb)*.6, plan: null, big: false, cues: [], cueI: 0, kinds: {}, used: {}, away: [], pinIn: rnd(T.pin)*.5, seenAt: -1e9, first: false, catchup: false, retry: 0, last: '' }; P.st.set(id, s); }
    return s;
  }
  function toPhase(s, ph){
    s.phase = ph; s.t = 0; s.cueI = 0; s.retry = 0; s.eased = false;
    s.len = ph === 'calm' ? rnd(T.calm) : ph === 'build' ? (s.first ? rnd(T.firstBuild) : rnd(T.build)) : ph === 'after' ? rnd(T.after) : 0;
    if (ph === 'after'){ s.plan = null; s.cues = []; }
  }

  /* ---------- picking a line: never the same one twice running for this person ---------- */
  function line(s, key, list){
    if (!list || !list.length) return null;
    const recent = s.used[key] || (s.used[key] = []), keep = Math.min(list.length - 1, 3);   // (the last few used for this person: none of them again yet)
    const free_ = list.map((_, i) => i).filter(i => !recent.includes(i)), k = free_.length ? free_[Math.floor(Math.random()*free_.length)] : Math.floor(Math.random()*list.length);
    recent.push(k); while (recent.length > keep) recent.shift();
    return list[k];
  }
  const hourWord = h => h >= 5 && h < 12 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night';
  const clock = () => { const m = Math.floor(STORY.clock % 1440); return String(Math.floor(m/60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hrs = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1)*60)).padStart(2, '0');
  const known = id => STORY.known(id) || {};
  // a fact about them already in this monitor's notebook
  const hasFact = (sub, f) => STORY.notes(sub).some(n => n.who === sub && (n.fact || '').split('.').slice(1).join('.') === f);

  // log a line on the watched person's monitor, learning what it says (names, a relation), and file it if it's a fact
  function say(sub, tmpl, cast, ctx, how){
    how = how || {};
    if (!tmpl) return false;
    if (how.channel){
      const present = new Set(Object.keys(cast));
      const learned = STORY.learnFrom(tmpl, cast, present, how.channel, how.rel || null, ctx || {});
      P.mine = true; const e = STORY.logLine(tmpl, cast, ctx || {}, 'reveal', { channel: how.channel, fact: how.fact || 'A.said', paced: true }); P.mine = false;
      if (e && how.fact) STORY.note(sub, { t: STORY.clock, who: how.who || sub, fact: how.fact, channel: how.channel, verified: how.channel === 'document' || how.channel === 'introduction', tmpl, cast: Object.assign({}, cast), ctx: Object.assign({}, ctx || {}), learned });
      return !!e;
    }
    P.mine = true; const e = STORY.logLine(tmpl, cast, ctx || {}, how.kind || 'live', { paced: true }); P.mine = false;
    return !!e;
  }

  /* ---------- who's around ---------- */
  function around(p, r){
    const out = [], r2 = r*r;
    for (const q of pplList){ if (q === p || q.x === undefined || q.gone) continue; if (d2(q, p) < r2) out.push(q); }
    return out;
  }
  // someone near who knows them, out on the street, and what they are to them
  function knower(p, r, filter){
    const sp = STORY.sp(p); if (!sp) return null;
    let best = null, bd = r*r;
    for (const rel of sp.rels){ if (rel.kind === 'stranger-to') continue; const q = pOf(rel.who); if (!q || !isOut(q)) continue;
      if (filter && !filter(rel, q)) continue; const d = d2(q, p); if (d < bd){ bd = d; best = { q, kind: rel.kind }; } }
    return best;
  }
  const GROUP = { 'shopkeeper-of': 'keeper', 'neighbor-of': 'neighbor', 'coworker-of': 'coworker', 'boss-of': 'coworker', 'employee-of': 'coworker', 'friend-of': 'friend',
    'cohabitant-of': 'household', 'partner-of': 'household', 'sibling-of': 'household', 'parent-of': 'household', 'child-of': 'household' };
  const INTRO_OK = new Set(['friend-of', 'partner-of', 'sibling-of', 'parent-of', 'child-of', 'cousin-of', 'coworker-of', 'neighbor-of', 'boss-of', 'grandparent-of', 'aunt-uncle-of']);

  /* ---------- fragments: a piece of who they are, through a channel that fits where they are ---------- */
  // Returns a list of { f (the fact it gives), rank (lower first: name, work, home, household, habits, the people in their life), cue (what a
  // build before it shows), run () }, for what this moment can show. The order is a ladder, but a rung that fits the moment better wins sometimes.
  function fragments(sub, p, s){
    const D = P.data, out = [], K = known(sub), sp = STORY.sp(p); if (!sp || !isOut(p)) return out;
    const h = STORY.hourNow(), greet = () => line(s, 'greet', D.greet[hourWord(h)]) || 'Hey';
    const cop = isCop(p);
    if (!K.first){
      // someone who knows them, close enough to hear
      const k = knower(p, 2.6, (rel, q) => rel.kind !== 'shopkeeper-of' || (p.spot && (p.spot.kind === 'queue' || p.spot.kind === 'seat')));
      if (k){ const g = cop && isCop(k.q) ? 'partner' : GROUP[k.kind] || 'any';
        out.push({ f: 'name', rank: 0, cue: 'approach', B: k.q.id, run: () => { const ok = say(sub, line(s, 'n.' + g, D.name[g]), { A: sub, B: k.q.id }, { S: greet() }, { channel: 'conversation', fact: 'A.first-name' }); if (ok) emote(k.q, 'note', 2); return ok; } }); }
      // a name tag, at a counter or a door they work at
      const tags = STORY.data() && STORY.data().vocab.passing.nameTag.jobs[STORY.jobKind(p) || ''];
      const atWork = p.job && typeof working === 'function' && working(p, h) && ((p.spot && p.spot.kind === 'vendor') || (places.get(p.job) && d2(places.get(p.job), p) < 9));
      if (tags && atWork) out.push({ f: 'name', rank: 0, cue: 'generic', run: () => say(sub, line(s, 'n.tag', D.name.tag), { A: sub }, {}, { channel: 'document', fact: 'A.first-name' }) });
      // a call: anywhere out on the street (an officer's comes over the radio)
      if (p.walk || p.patrol || p.spot){
        if (cop) out.push({ f: 'name', rank: .5, cue: 'radio', run: () => say(sub, line(s, 'n.radio', D.name.radio), { A: sub }, { n: 100 + (hash(sub) % 900) }, { channel: 'phone', fact: 'A.first-name' }) });
        else out.push({ f: 'name', rank: .6, cue: 'comm', run: () => { const ok = say(sub, line(s, 'n.comm', D.name.comm), { A: sub }, {}, { channel: 'phone', fact: 'A.first-name' }); if (ok) emote(p, 'dots', 2); return ok; } });
      }
    }
    // an officer working near another: they call each other by name
    if (cop){ const o = around(p, 5).find(q => isCop(q) && !known(q.id).first && isOut(q));
      if (o) out.push({ f: 'partner-name', rank: K.first ? 1 : 2, cue: 'radio', B: o.id, run: () => say(sub, line(s, 'n.partner', D.name.partner).replace(/\{A/g, '{X').replace(/\{B/g, '{A').replace(/\{X/g, '{B'), { A: sub, B: o.id }, {}, { channel: 'conversation', fact: 'B.first-name', who: o.id }) }); }
    // where they work: a lanyard or a badge, near work or on the way there
    if (p.job && !cop){
      const pl = places.get(p.job), near = pl && (d2(pl, p) < 16 || (p.walk && p.walk.to === p.job));
      if (near && !hasFact(sub, 'employer')) out.push({ f: 'employer', rank: 1, cue: 'generic', run: () => say(sub, line(s, 'employer', D.employer), { A: sub }, { employer: STORY.employerName(p) }, { channel: 'document', fact: 'A.employer' }) });
      else if (near && !hasFact(sub, 'job')) out.push({ f: 'job', rank: 1.2, cue: 'generic', run: () => say(sub, line(s, 'job', D.job), { A: sub }, { job: STORY.JOB_WORD[STORY.jobKind(p)] || 'worker' }, { channel: 'document', fact: 'A.job' }) });
    }
    // home: at their own door (just out, or nearly in)
    const hp = places.get(p.home), w = p.walk;
    const atHome = hp && w && ((w.doorA && hp.doors.includes(w.doorA) && w.s < 1.6) || (w.to === p.home && w.len - w.s < 1.6));
    if (atHome && !hasFact(sub, 'home')) out.push({ f: 'home', rank: 2, cue: 'generic', run: () => say(sub, line(s, 'home', D.home), { A: sub }, { placeId: p.home }, { channel: 'document', fact: 'A.home' }) });
    // the people in their life: introduced, by name and what they are to them
    const kin = knower(p, 2.4, (rel, q) => INTRO_OK.has(rel.kind) && !(known(q.id).first && known(q.id).rel));
    if (kin && !cop) out.push({ f: 'relation', rank: 3.5, cue: 'approach', B: kin.q.id, run: () => say(sub, line(s, 'intro', D.intro), { A: sub, B: kin.q.id }, {}, { channel: 'introduction', fact: 'B.relation-to-A', who: kin.q.id, rel: { role: 'B', to: 'A' } }) });
    // a nickname, once the name is known
    if (K.first && !K.nick && STORY.identOf(sub).nick){ const k = knower(p, 2.6, rel => GROUP[rel.kind] && GROUP[rel.kind] !== 'keeper');
      if (k) out.push({ f: 'nick', rank: 4, cue: 'approach', B: k.q.id, run: () => say(sub, line(s, 'n.nick', D.name.nick), { A: sub, B: k.q.id }, { S: greet() }, { channel: 'conversation', fact: 'A.nickname' }) }); }
    return out;
  }
  // when they've been away from the camera and something happened: someone who was there (or anyone who knows them) mentions it
  function catchupFrag(sub, p, s){
    const D = P.data; if (!s.away.length || !isOut(p)) return null;
    const ev = s.away[s.away.length - 1], cat = D.catchup[ev.cat] ? ev.cat : 'any';
    const k = knower(p, 3, (rel, q) => (ev.with || []).includes(q.id)) || knower(p, 3);
    const list = D.catchup[cat], comm = list.filter(l => /^Comm/.test(l)), talk = list.filter(l => !/^Comm/.test(l));
    if (k && talk.length) return { f: 'catchup', cue: 'approach', B: k.q.id, run: () => { const ok = say(sub, line(s, 'cu.' + cat, talk), { A: sub, B: k.q.id }, {}, { channel: 'conversation', fact: 'A.news' }); if (ok) s.away.length = 0; return ok; } };
    if (comm.length && (p.walk || p.spot)) return { f: 'catchup', cue: 'comm', run: () => { const ok = say(sub, line(s, 'cu.c.' + cat, comm), { A: sub }, {}, { channel: 'phone', fact: 'A.news' }); if (ok) s.away.length = 0; return ok; } };
    return null;
  }
  function bestFrag(list){
    if (!list.length) return null;
    list.sort((a, b) => a.rank - b.rank);
    return list.length > 1 && Math.random() < .25 ? list[1] : list[0];   // (now and then the second rung: the ladder isn't a script)
  }

  /* ---------- a resident's call on an officer: a scene of the engine's own ---------- */
  function callScene(sub, p, s){
    if (!isOut(p) || p.custody || p.offDuty || p.onBike || !p.patrol && !(p.walk && p.walk.beat)) return false;
    const h = STORY.hourNow(), D = P.data;
    const kinds = Object.entries(D.call.kinds).filter(([, k]) => { const [a, b] = k.hours; return a <= b ? h >= a && h < b : h >= a || h < b; });
    if (!kinds.length) return false;
    const cands = around(p, 10).filter(q => STORY.free(q) && (q.walk || q.spot) && d2(q, p) > 1 && !(typeof asleep === 'function' && asleep(q, h)));
    if (!cands.length) return false;
    cands.sort((a, b) => d2(a, p) - d2(b, p));
    const B = cands[0], [kind, K] = kinds[Math.floor(Math.random()*kinds.length)];
    const sd = STORY.data(); if (!sd) return false;
    const story = { id: 'pace.call.' + kind, category: 'law', tier: 'texture', roles: { A: { desc: 'an officer' }, B: { desc: 'a resident' } }, when: sd.stories[0].when, game: true, log: {},
      beats: [{ id: 'b1', do: 'wave', who: 'B', with: 'A', at: 'any' }, { id: 'b2', do: 'chat', who: 'B', with: 'A', at: 'any' }, { id: 'b3', do: 'point', who: 'B', with: 'A', at: 'any' }, { id: 'b4', do: 'walk', who: 'A', at: 'street' }] };
    const ln = key => sc => line(s, 'call.' + key, D.call[key]);   // (a line function takes the scene: story.js reads a function with no parameters as no lines)
    const lines = { b1: ln('b1'), b2: sc => line(s, 'call.say.' + kind, K.say), b3: sc => {
        // the report taken down: the resident's name off their ID
        const t = line(s, 'call.id', D.call.id); const learned = STORY.learnFrom(t, sc.cast, new Set(['A', 'B']), 'document', null, {});
        if (STORY.watch === sc.cast.A) STORY.note(sc.cast.A, { t: STORY.clock, who: sc.cast.B, fact: 'B.full-name', channel: 'document', verified: true, tmpl: t, cast: Object.assign({}, sc.cast), ctx: {}, learned });
        return t; }, b4: ln('b4') };
    const sc = STORY.startScene(story, { A: sub, B: B.id }, { lines });
    if (sc){ emote(B, 'bang', 1.6); P.dbg.last = 'call: ' + kind; }
    return !!sc;
  }

  /* ---------- the plan for a build: what's coming, so the cues can point at it ---------- */
  function plan(sub, p, s){
    const cop = isCop(p);
    if (s.first){ const f = bestFrag(fragments(sub, p, s)); return f ? { kind: 'frag', frag: f } : { kind: 'frag' }; }
    if (s.catchup){ const c = catchupFrag(sub, p, s); if (c) return { kind: 'frag', frag: c }; }
    if (cop){ const pity = s.quiet > T.copPity; s.big = s.big || pity; return s.big ? { kind: 'call' } : { kind: 'frag', frag: bestFrag(fragments(sub, p, s)) }; }
    if (s.big){
      const opts = STORY.choose(sub); if (opts.length){ const o = STORY.pickOpt(opts, sub); const B = Object.entries(o.cast).find(([r, x]) => r !== 'A' && !r.startsWith('_') && x && x.id !== sub); return { kind: 'story', sid: o.s.id, B: B ? B[1].id : null, phone: o.s.beats.some(b => b.do === 'phone-call') }; }
      if (p.at === p.home && !p.walk) return { kind: 'drone' };
    }
    return { kind: 'frag', frag: bestFrag(fragments(sub, p, s)) };
  }
  function cueFor(sub, p, s){
    const D = P.data, pl = s.plan || {}, f = pl.frag;
    const kind = pl.kind === 'drone' ? 'drone' : pl.kind === 'call' ? 'resident' : pl.kind === 'story' ? (pl.phone ? 'comm' : pl.B ? 'approach' : 'generic') : f ? f.cue : (isCop(p) ? 'radio' : 'generic');
    const B = pl.B || (f && f.B);
    if ((kind === 'approach' || kind === 'resident') && B){ const q = pOf(B); if (q && isOut(q) && d2(q, p) < 30*30) return say(sub, line(s, 'cue.' + kind, D.cues[kind]), { A: sub, B }, {}); }
    if (kind === 'resident'){ const q = around(p, 10).find(x => STORY.free(x) && (x.walk || x.spot)); if (q) return say(sub, line(s, 'cue.resident', D.cues.resident), { A: sub, B: q.id }, {}); }
    const k2 = kind === 'approach' || kind === 'resident' ? (isCop(p) ? 'radio' : 'generic') : kind;
    return say(sub, line(s, 'cue.' + k2, D.cues[k2]), { A: sub }, {});
  }

  /* ---------- the payoff ---------- */
  function payoff(sub, p, s){
    const tryBig = () => {
      if (isCop(p)) return callScene(sub, p, s);
      const opts = STORY.choose(sub);
      if (opts.length){ const same = s.plan && s.plan.sid && opts.find(o => o.s.id === s.plan.sid); const sc = STORY.startOpt(same || STORY.pickOpt(opts, sub)); if (sc){ P.dbg.last = 'storylet: ' + sc.s.id; return true; } }
      if (STORY.tryDrone(sub)){ P.dbg.last = 'parcel'; return true; }
      return false;
    };
    const trySmall = () => {
      if (s.catchup){ const c = catchupFrag(sub, p, s); if (c && c.run()){ P.dbg.last = 'catch-up'; return true; } }
      const f = (s.plan && s.plan.frag && fragments(sub, p, s).find(x => x.f === s.plan.frag.f)) || bestFrag(fragments(sub, p, s));
      if (f && f.run()){ P.dbg.last = 'fragment: ' + f.f; return true; }
      return false;
    };
    const order = s.first || s.catchup ? [trySmall, tryBig] : s.big ? [tryBig, trySmall] : [trySmall, tryBig];
    for (const fn of order) if (fn()){ s.first = false; s.catchup = false; s.quiet = 0; s.big = Math.random() < .5; toPhase(s, 'after'); return; }
    // never nothing: hold the build a little longer and try again (they may be indoors, or alone just now)
    s.retry++; P.dbg.last = 'payoff waiting (' + s.retry + ')';
    s.len = s.t + (s.retry < 6 ? 15 : 40);
  }

  /* ---------- ambient lines: what's different about now ---------- */
  const COMPASS = ['northbound', 'northeast', 'eastbound', 'southeast', 'southbound', 'southwest', 'westbound', 'northwest'];
  function ambient(sub, p, s){
    const D = P.data, A = D.amb, h = STORY.hourNow(), opts = [];
    if (!isOut(p)) return false;
    const add = (kind, w, make) => { if (P.now - (s.kinds[kind] ?? -1e9) < (kind === 'heading' ? 150 : T.kindGap)) return; opts.push({ kind, w, make }); };
    const rain = STORY.raining(), walking = !!(p.walk && !p.walk.scene), near = around(p, 3);
    if (rain && walking && !(p.um && p.um.on)) add(p.rainRun > pplNow ? 'run' : 'rain', 3, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (rain && p.um && p.um.on) add('umbrella', 1.5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (rain && (h >= 19 || h < 5) && walking) add('neon', 1.2, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (walking && near.length >= 6) add('crowd', 1.5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { n: near.length }));
    if (walking && !around(p, 8).some(q => q.walk) && (h >= 21 || h < 6)) add('empty', 1.5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    { const pin = (typeof MON !== 'undefined' && MON.pins) ? MON.pins() : [];
      const q = near.find(q => q.walk && (known(q.id).first || pin.includes(q.id)) && !q.scene);
      if (q && walking) add('pass', 3, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub, B: q.id }, {})); }
    if (!isCop(p) && walking && around(p, 4).some(q => isCop(q))) add('cop', 1.2, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (h >= 0 && h < 5 && walking) add('latehour', 1.5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { when: clock() }));
    if (p.spot){ s.spotSince = s.spotKey === p.spot.key ? s.spotSince : STORY.clock; s.spotKey = p.spot.key; const m = Math.round(STORY.clock - s.spotSince);
      if (m >= 20) add('linger', 1.5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { n: m, placeId: p.at })); } else s.spotKey = null;
    { const w = p.walk; if (walking && w.to && w.len - w.s > 2){
        if (w.to === p.home) add('homeward', 1.2, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { placeId: p.home }));
        else { const sd = STORY.seenDays(sub, 'enter:' + w.to); if (sd.size >= 2) add('usual', 1.4, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { placeId: w.to })); } } }
    if (walking && p.held) add('carry', 1, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (walking && (p.hurry || p.rush) && !rain) add('hurry', 1, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, {}));
    if (walking){ const q = near.find(q => q.walk && !q.scene && !known(q.id).first); if (q) add('passby', .7, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub, B: q.id }, {})); }
    if (p.spot && p.spot.kind === 'seat') add('sitting', .8, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { placeId: p.at }));
    if (p.spot && p.spot.kind === 'queue') add('queue', .8, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { placeId: p.at }));
    if (walking) add('clock', .35, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { when: clock() }));
    if (walking && (p.dx || p.dz)){ const a = Math.round(((Math.atan2(p.dx, -p.dz)/(Math.PI*2)) * 8 + 8)) % 8;
      add('heading', .5, k => say(sub, line(s, 'a.' + k, A[k]), { A: sub }, { S: COMPASS[a] })); }
    if (!opts.length) return false;
    const tot = opts.reduce((a, o) => a + o.w, 0); let x = Math.random()*tot, ch = opts[0];
    for (const o of opts){ if (x < o.w){ ch = o; break; } x -= o.w; }
    if (ch.make(ch.kind)){ s.kinds[ch.kind] = P.now; return true; }
    return false;
  }
  // the engine's routine lines (out of a door, into one, sitting down...), varied: now and then with a few words of what the street is like
  let ROUT = null;
  P.routine = (sub, p, list, salt) => {
    const D = P.data, s = st(sub);
    if (!ROUT){ ROUT = new Map(); const E = STORY.data().engine.routine; for (const [k, v] of Object.entries(E)) ROUT.set(v, k); }
    const kind = ROUT.get(list); if (!kind) return null;
    const base = line(s, 'r.' + kind, list); if (!base) return null;
    s.ambIn = Math.max(s.ambIn, 12);   // (a line just went out: the next ambient one waits)
    if (Math.random() > .45 || !/[.!?]$/.test(base)) return base;
    const h = STORY.hourNow(), near = p.x !== undefined ? around(p, 3).length : 0;
    const tk = STORY.raining() ? 'rain' : near >= 6 ? 'crowd' : (h >= 21 || h < 6) && near === 0 ? 'empty' : h >= 19 || h < 5 ? 'night' : h >= 6 && h < 9 ? 'morning' : null;
    if (!tk || P.now - (s.kinds['tail.' + tk] ?? -1e9) < 180) return base;
    s.kinds['tail.' + tk] = P.now;
    return base + ' ' + line(s, 't.' + tk, D.tails[tk]);
  };

  /* ---------- at a door (story.js watchRoutine tells us of every change of where they are) ---------- */
  P.transition = (sub, p, prev, state) => { const s = st(sub); s.defer = () => doorFrag(sub, p, prev, state); };   // (said after the engine's own line for the door)
  function doorFrag(sub, p, prev, state){
    const D = P.data, s = st(sub); if (!D) return;
    const ripe = (s.phase === 'build' && s.t > s.len*.4) || (s.phase === 'calm' && Math.random() < .3);   // (a fragment at a door is a payoff: when one is due, or now and then as a surprise)
    const done = () => { s.first = false; s.quiet = 0; toPhase(s, 'after'); };
    const atOwnDoor = (prev === 'in:' + p.home && p.walk && p.walk.doorA) || (state === 'in:' + p.home && prev.startsWith('walk:'));
    if (atOwnDoor && !known(sub).first && !hasFact(sub, 'home') && (ripe || s.first)){ if (say(sub, line(s, 'home', D.home), { A: sub }, { placeId: p.home }, { channel: 'document', fact: 'A.home' })) return done(); }   // (the door plate: a name first, when there isn't one yet)
    // out of their own door
    if (prev === 'in:' + p.home && p.walk && p.walk.doorA){
      const deps = STORY.departures(sub), prevH = [...deps.entries()].filter(([d]) => d < STORY.day()).map(([, h]) => h), h = STORY.hourNow();
      if (prevH.length >= 3){
        const mean = prevH.reduce((a, b) => a + b, 0)/prevH.length, spread = Math.max(...prevH.map(x => Math.abs(x - mean)));
        if (spread < .6 && Math.abs(h - mean) < .6 && !hasFact(sub, 'habit') && ripe){ if (say(sub, line(s, 'habit', D.habit), { A: sub }, { placeId: p.home, when: clock(), seen: prevH.length + 1 }, { channel: 'seen', fact: 'A.habit' })) return done(); }
        else if (h - mean > 1.2 && P.now - (s.kinds.late ?? -1e9) > T.kindGap){ s.kinds.late = P.now; say(sub, line(s, 'a.late', D.amb.late), { A: sub }, { placeId: p.home, when: clock() }); }
        else if (mean - h > 1.2 && P.now - (s.kinds.early ?? -1e9) > T.kindGap){ s.kinds.early = P.now; say(sub, line(s, 'a.early', D.amb.early), { A: sub }, { placeId: p.home, when: clock() }); }
      }
      // with someone from home
      const mate = (STORY.sp(p) || { rels: [] }).rels.find(r => r.kind === 'cohabitant-of' && (q => q && q.walk && q.walk.doorA === p.walk.doorA && d2(q, p) < 2.5)(pOf(r.who)));
      if (mate && !hasFact(sub, 'cohabitants') && ripe){ if (say(sub, line(s, 'together', D.together), { A: sub, B: mate.who }, { placeId: p.home }, { channel: 'seen', fact: 'A.cohabitants' })) return done(); }
      if (ripe && !hasFact(sub, 'home')){ if (say(sub, line(s, 'home', D.home), { A: sub }, { placeId: p.home }, { channel: 'document', fact: 'A.home' })) return done(); }
      return;
    }
    if (!state.startsWith('in:') || !prev.startsWith('walk:')) return;
    const at = p.at;
    // home, with someone already in
    if (at === p.home){
      const mate = (STORY.sp(p) || { rels: [] }).rels.find(r => r.kind === 'cohabitant-of' && (q => q && q.at === p.home && !q.walk && !q.scene)(pOf(r.who)));
      if (mate && !hasFact(sub, 'cohabitants') && ripe){ if (say(sub, line(s, 'household', D.household), { A: sub, B: mate.who }, { placeId: p.home }, { channel: 'seen', fact: 'A.cohabitants' })) return done(); }
      if (ripe && !hasFact(sub, 'home')){ if (say(sub, line(s, 'home', D.home), { A: sub }, { placeId: p.home }, { channel: 'document', fact: 'A.home' })) return done(); }
      return;
    }
    // somewhere they keep coming back to, or somewhere new
    const sd = STORY.seenDays(sub, 'enter:' + at), n = sd.has(STORY.day()) ? sd.size - 1 : sd.size, total = [...STORY.seenKeys(sub).keys()].filter(k => k.startsWith('enter:')).length;
    if (n >= 2 && ripe && !STORY.notes(sub).some(x => x.fact === 'A.regular' && x.ctx && x.ctx.placeId === at)){ if (say(sub, line(s, 'regular', D.regular), { A: sub }, { placeId: at, seen: n + 1 }, { channel: 'seen', fact: 'A.regular' })) return done(); }
    if (n === 0 && total >= 3 && P.now - (s.kinds.newplace ?? -1e9) > T.kindGap){ s.kinds.newplace = P.now; say(sub, line(s, 'a.newplace', D.amb.newplace), { A: sub }, { placeId: at }); s.ambIn = Math.max(s.ambIn, 15); }
  }

  /* ---------- what counts as something happening ---------- */
  STORY.logHooks.push(e => {
    if (!P.on() || P.mine || e.subject !== STORY.watch) return;
    if (e.kind === 'reveal' || e.kind === 'hearsay' || (e.kind === 'live' && e.sid)){ const s = st(e.subject); s.quiet = 0; if (e.kind !== 'live' && (s.phase === 'calm' || s.phase === 'build')){ s.first = false; toPhase(s, 'after'); } }
  });
  // what happened to people while nobody watched them (kept a few deep, for when they're watched again)
  STORY.finishHooks.push(sc => {
    if (sc.s.tier === 'case' || !sc.s.category) return;
    for (const id of Object.values(sc.cast)){ if (id === STORY.watch) continue;
      const s = st(id); s.away.push({ cat: sc.s.category, t: STORY.clock, with: Object.values(sc.cast).filter(x => x !== id) }); if (s.away.length > 4) s.away.shift(); }
  });

  /* ---------- fast forward: eased back to normal speed for a payoff ---------- */
  function easeFF(){
    if (typeof FF === 'undefined' || FF.clock <= 1) return;
    FF.set(1); document.querySelectorAll('#ffbar button[data-ff]').forEach(x => x.classList.toggle('on', x.dataset.ff === '1'));
    P.dbg.last = 'fast forward eased to 1x';
  }

  /* ---------- every frame (from story.js) ---------- */
  let lastWatch = null;
  P.tick = rdt => {
    P.now += rdt;
    if (!P.on() || typeof pplReady === 'undefined' || !pplReady) return;
    const sub = STORY.watch;
    if (sub) watchTick(sub, rdt);
    lastWatch = sub;
    pinTick(rdt);
    if (DEV) devDraw();
  };
  function watchTick(sub, rdt){
    const p = pOf(sub); if (!p) return;
    const s = st(sub);
    if (lastWatch !== sub){   // (picked up, or back to them)
      const gone = P.now - s.seenAt;
      if (!known(sub).first){ s.first = true; s.phase = 'calm'; s.t = 0; s.len = rnd(T.firstCalm); }
      else if (gone > 60){ toPhase(s, 'calm'); s.len = Math.min(s.len, 30); }
      s.catchup = s.away.length > 0;
      s.ambIn = Math.min(s.ambIn, 10 + Math.random()*12);
    }
    s.seenAt = P.now;
    s.quiet += rdt;
    if (p.scene){ s.inScene = true; return; }   // (a moment of the engine's own: it is the moment)
    if (s.inScene){ s.inScene = false; s.quiet = 0; toPhase(s, 'after'); return; }
    s.t += rdt;
    if (s.defer){ const f = s.defer; s.defer = null; f(); if (s.phase === 'after') return; }   // (a door just now: a fragment there, said after the engine's own line)
    if (s.phase === 'calm' || s.phase === 'build'){ s.ambIn -= rdt; if (s.ambIn <= 0){ s.ambIn = rnd(T.amb); if (!(s.phase === 'build' && s.cues.length)) ambient(sub, p, s); else if (Math.random() < .5) ambient(sub, p, s); } }
    if (s.phase === 'calm' && s.t >= s.len){
      toPhase(s, 'build'); s.plan = plan(sub, p, s);
      const n = s.first ? 1 : 1 + (Math.random() < .6 ? 1 : 0) + (Math.random() < .3 ? 1 : 0);
      s.cues = Array.from({ length: n }, () => .3 + Math.random()*.6).sort((a, b) => a - b);
    } else if (s.phase === 'build'){
      const u = s.t/s.len;
      if (s.cueI < s.cues.length && u >= s.cues[s.cueI]){ s.cueI++; if (isOut(p)) cueFor(sub, p, s); }
      if (s.len - s.t < 6 && !s.eased && s.retry === 0 && isOut(p)){ s.eased = true; easeFF(); }
      if (s.t >= s.len) payoff(sub, p, s);
    } else if (s.phase === 'after' && s.t >= s.len) toPhase(s, 'calm');
  }
  // the pinned: now and then, a moment of their life starts while you're watching someone else (their chip lights up: something is happening)
  function pinTick(rdt){
    const pins = (typeof MON !== 'undefined' && MON.pins) ? MON.pins() : []; if (!pins.length) return;
    if (P.pinScene && STORY.scenes.has(P.pinScene)) return;   // (one at a time)
    P.pinScene = null;
    for (const id of pins){ if (id === STORY.watch) continue; const p = pOf(id); if (!p || isCop(p)) continue;
      const s = st(id); s.pinIn -= rdt; if (s.pinIn > 0) continue; s.pinIn = rnd(T.pin);
      const opts = STORY.choose(id); if (!opts.length){ P.dbg.pin = id + ': ' + (STORY.dbg.why || 'nothing fits'); continue; }
      const sc = STORY.startOpt(STORY.pickOpt(opts, id)); if (sc){ P.pinScene = sc; P.dbg.pin = id + ': ' + sc.s.id; return; } }
  }

  /* ---------- for cases.js: the officer being watched as backup ---------- */
  P.backupOk = (wp, [x, z]) => isCop(wp) && isOut(wp) && !wp.custody && !wp.offDuty && !wp.onBike && typeof working === 'function' && working(wp, STORY.hourNow()) && (wp.x - x)**2 + (wp.z - z)**2 < 28*28;
  P.backupCalled = (id, anc) => { if (id !== STORY.watch || !P.data) return; const s = st(id), pid = anc && (anc.kind === 'door' ? anc.place : anc.kind === 'open' ? anc.place.id : undefined);
    say(id, line(s, 'backup', P.data.backup), { A: id }, { placeId: pid }); P.dbg.last = 'backup call'; };

  /* ---------- the feed's hint: a thread nearing its payoff (monitor.js) ---------- */
  P._call = id => { const p = pOf(id); return !!p && callScene(id, p, st(id)); };   // (tests)
  P.hint = id => { if (!P.on()) return -1; const s = P.st.get(id); return s && s.phase === 'build' && !s.inScene ? Math.min(1, s.t/s.len) : -1; };

  /* ---------- keeping it (with the city's stories: story.js saves this with them) ---------- */
  P.saveData = () => { const out = []; for (const [id, s] of P.st){ if (!s.away.length && s.phase === 'calm' && !s.quiet) continue; out.push([id, { phase: s.phase === 'build' ? 'calm' : s.phase, quiet: Math.round(s.quiet), away: s.away, big: s.big }]); } return { v: 1, st: out.slice(-40) }; };
  { const wait = () => { if (STORY.on){ const d = STORY.paceSaved; if (d && d.v === 1) for (const [id, v] of d.st || []){ const s = st(id); s.quiet = v.quiet || 0; s.away = v.away || []; s.big = !!v.big; } } else setTimeout(wait, 500); }; wait(); }

  /* ---------- the #dev readout ---------- */
  const DEV = location.hash.includes('dev');
  let devEl = null, devAt = 0;
  function devDraw(){
    if (P.now - devAt < .5) return; devAt = P.now;
    if (!devEl){ devEl = document.createElement('div'); devEl.id = 'paceDev';
      devEl.style.cssText = 'position:fixed;left:8px;bottom:64px;z-index:9;font:11px/1.35 monospace;color:#bfe;background:rgba(5,8,15,.82);border:1px solid rgba(56,232,224,.3);padding:6px 8px;border-radius:3px;max-width:320px;white-space:pre-wrap;pointer-events:auto';
      document.body.appendChild(devEl);
      devEl.addEventListener('click', e => { if (e.target.dataset.pace){ P.set(P.off); } }); }
    const rows = ['PACING ' + (P.on() ? 'on' : 'off') + ' <button data-pace="1" style="font:inherit">' + (P.on() ? 'turn off' : 'turn on') + '</button>'];
    const sub = STORY.watch;
    if (sub){ const s = st(sub); rows.push('watching: ' + s.phase + ' ' + Math.round(s.t) + '/' + Math.round(s.len) + 's  quiet ' + Math.round(s.quiet) + 's  next line ' + Math.max(0, Math.round(s.ambIn)) + 's' +
      '\nplan: ' + (s.plan ? s.plan.kind + (s.plan.sid ? ' ' + s.plan.sid : '') + (s.plan.frag ? ' ' + s.plan.frag.f : '') : '-') + (s.big ? ' (big)' : ' (small)') + (s.first ? ' first hook' : '') + (s.catchup ? ' catch-up' : '')); }
    rows.push('last: ' + (P.dbg.last || '-') + (P.dbg.pin ? '\npinned: ' + P.dbg.pin : '') + '\nengine: ' + (STORY.dbg.why || '-'));
    devEl.innerHTML = rows.join('\n');
  }
  return P;
})();
window.PACE = PACE;
