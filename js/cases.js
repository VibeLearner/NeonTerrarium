/* Police cases (the bible: story/police; its ledgers as data: data/cases, made by tools/cases). A case runs over three weeks of game
   days: a boss case with the smaller cases that cross it and the everyday police work around them, all on the same day frame, sharing
   one cast. Each ledger row is played as moments (one per day it shows), each moment as a scene of the story engine (story.js), at its
   place, on its day, near its hour. A moment that can't be staged in its window (nobody free, no such place in this city) is passed by,
   and what its row sets still happens: the case moves on whether or not anyone was watching. The log only shows what the camera
   sees, so the player follows a case by watching the people in it. */
const CASES = (() => {
  const C = { on: false, run: null, arcs: null, journal: [], dbg: { why: '' } };
  const KEY = 'neonIsland.cases', BOSS_ARCS = ['b1-long-queue'];   // (the others wait for their places: the Dome door, the metro attendant, the dispatcher)
  const CROSS = { 'b1-long-queue': ['s1-lift-lobby-muggings', 's2-missing-delivery', 's3-stall-fire', 's7-missing-regular'] };
  const DEFAULT = { 'b1-long-queue': 'careless', 'b2-door-work': 'careful' };
  const SHIFT = { A: 0, B: 0, G: 0, C: 1, D: 1, F: 1, E: 2, H: 2 }, SHIFT_HOUR = [11, 18.5, 2];
  let IDX = null;
  const H = (...a) => STORY.H(...a), U = (...a) => STORY.U(...a);
  const pOf = id => people.get(id) || null;
  const day = () => STORY.day();
  const hourNow = () => (STORY.clock % 1440)/60;
  const get = f => fetch('data/cases/' + f + '.json' + (STORY.ver ? '?v=' + STORY.ver : '')).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  C.load = () => get('index').then(ix => { IDX = ix; return Promise.all(ix.arcs.map(a => get(a.id))); }).then(arcs => {
    C.arcs = new Map(arcs.map(a => [a.id, a])); restore(); C.on = true;
  }).catch(e => { C.failed = String(e); console.warn('cases: not loaded (' + e + ')'); });
  const note = (...a) => { C.journal.push('d' + caseDay() + ' ' + Math.floor(hourNow()) + 'h ' + a.join(' ')); if (C.journal.length > 300) C.journal.shift(); };

  /* ---------- the city it can happen in ---------- */
  const megaOf = kind => [...places.values()].filter(pl => pl.mega && pl.mega.kind === kind);
  const stations = () => megaOf('police').filter(pl => [...people.values()].filter(p => p.job === pl.id).length >= 8);
  const squares = () => megaOf('square').filter(pl => pl.stalls && pl.stalls.size >= 3);
  const adult = p => { const s = STORY.sp(p); return !!s && s.age >= 18 && s.age < 70; };
  const ordinary = p => p && !p.visitor && !p.cop && !p.guard && !p.archivist && !p.gone && !p.custody && places.has(p.home) && adult(p);
  const near = (list, x, z) => list.slice().sort((a, b) => { const A = places.get(a.home), B = places.get(b.home); return Math.hypot(A.x - x, A.z - z) - Math.hypot(B.x - x, B.z - z) || (a.id < b.id ? -1 : 1); });
  function canRun(arc){
    if (!stations().length) return 'no police station with its officers';
    if (arc === 'b1-long-queue' && !squares().length) return 'no square with stalls';
    return null;
  }

  /* ---------- the cast ---------- */
  // each slot is a real person for the whole run: the officers by shift from the station, the cover face by the job the case gives it,
  // the rest from the neighborhood; an extra (a customer, the landlord) is cast the first time a moment needs one, near where it happens
  function castRun(run){
    const st = stations()[0], cops = [...people.values()].filter(p => p.job === st.id).sort((a, b) => a.id < b.id ? -1 : 1);
    const order = cops.slice().sort((a, b) => U(a.id, run.seed, 'cop') - U(b.id, run.seed, 'cop'));
    const cast = run.cast;
    for (const [id, L] of Object.entries(IDX.officers)){ const p = order.shift(); if (!p) return 'too few officers'; cast[id] = p.id; run.shift[p.id] = SHIFT[L]; }
    const st2 = stations()[1]; if (st2){ const q = [...people.values()].filter(p => p.job === st2.id).sort((a, b) => U(a.id, run.seed, 'cop2') - U(b.id, run.seed, 'cop2'))[0]; if (q) cast['inside-officer-extra'] = q.id; }
    run.station = st.id;
    if (run.arc === 'b1-long-queue'){
      const sq = squares()[0], keepers = [...people.values()].filter(p => p.job === sq.id && p.stall !== null && p.stall !== undefined && ordinary(p) && sq.stalls.has(p.stall)).sort((a, b) => a.id < b.id ? -1 : 1);
      if (!keepers.length) return 'no stall keepers';
      const day_ = keepers.filter(p => p.nightShift >= .5), pool = day_.length ? day_ : keepers, boss = pool[H(run.seed, 'boss') % pool.length];   // (a day market keeper if there is one: the noon queue) cast.boss = boss.id; run.square = sq.id; run.stall = boss.stall;
      const bv = sq.stalls.get(boss.stall).keepers[0], nb = keepers.filter(p => p !== boss && p.stall !== boss.stall).sort((a, b) => { const A = sq.stalls.get(a.stall).keepers[0], B = sq.stalls.get(b.stall).keepers[0]; return Math.hypot(A.x - bv.x, A.z - bv.z) - Math.hypot(B.x - bv.x, B.z - bv.z); })[0];
      if (nb) cast['red-herring-stall-neighbor'] = nb.id;
      const used = new Set(Object.values(cast)), around = near([...people.values()].filter(p => ordinary(p) && !used.has(p.id) && p.job !== sq.id), sq.x, sq.z);
      const take = (id, test) => { const p = around.find(q => !used.has(q.id) && (!test || test(q))) || around.find(q => !used.has(q.id)); if (p){ cast[id] = p.id; used.add(p.id); } };
      take('go-between-courier', p => p.courier); take('red-herring-night-courier', p => p.courier || p.nightWorker); take('informant', p => !!p.job);
      // the flat where the bowls are counted: a home near the square, and someone who lives there
      take('b1-long-queue/extra:resident', p => p.zone === 'low');
      const res = pOf(cast['b1-long-queue/extra:resident']); run.safehouse = res ? res.home : null;
      take('b1-long-queue/extra:partner', p => res && p.home !== res.home && Math.hypot(places.get(p.home).x - places.get(res.home).x, places.get(p.home).z - places.get(res.home).z) < 12);
    }
    return null;
  }
  // a slot's id as the run knows it: characters are shared by every arc in the run, extras belong to their arc
  const slotOf = (arc, id) => id.startsWith('extra:') ? arc + '/' + id : (id === 'boss-careless' || id === 'boss-careful') ? 'boss' : id;
  function personFor(run, arc, id, anc){
    const k = slotOf(arc, id); if (run.cast[k]) return run.cast[k];
    if (IDX.officers[id] || id === 'inside-officer-extra') return null;
    // cast now: someone free near where the moment is, who isn't in the run yet
    const used = new Set(Object.values(run.cast)), [x, z] = ancXZ(anc);
    const cands = [...people.values()].filter(p => ordinary(p) && !used.has(p.id) && !p.scene && Math.hypot(p.x - x, p.z - z) < 30);
    const p = near(cands, x, z)[0] || near([...people.values()].filter(p => ordinary(p) && !used.has(p.id)), x, z)[0]; if (!p) return null;
    run.cast[k] = p.id; note('cast', k, p.id); return p.id;
  }
  C.caseDesc = id => {   // (story.js descOf: someone the player hasn't a name for, as the case's own words see them)
    const run = C.run; if (!run) return null;
    for (const [k, v] of Object.entries(run.cast)) if (v === id){ const [arc, ex] = k.includes('/') ? k.split('/') : [run.arc, k];
      const A = C.arcs.get(arc) || C.arcs.get(run.arc), d = A && A.slots[ex === 'boss' ? 'boss-careless' : ex]; if (d && d.desc) return d.desc;
      for (const a of run.arcs){ const s = C.arcs.get(a).slots[ex === 'boss' ? 'boss-careless' : ex]; if (s && s.desc) return s.desc; } }
    return null;
  };

  /* ---------- where it happens ---------- */
  const doorAnc = pl => { const d = pl && STORY.streetDoor(pl); return d ? { kind: 'door', door: d, place: pl.id } : null; };
  const nearestMega = (kind, x, z) => megaOf(kind).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] || null;
  function ancXZ(a){ if (!a) return [0, 0]; if (a.kind === 'door') return [a.door.stand.x, a.door.stand.z]; if (a.kind === 'open') return [a.place.x, a.place.z]; return [a.x || 0, a.z || 0]; }
  function centre(run){ const sq = places.get(run.square) || places.get(run.station); return sq ? [sq.x, sq.z] : [0, 0]; }
  const spotT = sp => ({ kind: 'spot', spot: sp, x: sp.x, z: sp.z, node: sp.node, y: sp.y });
  function anchorOf(run, arc, m, where){
    const [base, sub] = where.split('/'), [cx, cz] = centre(run);
    const seats = Math.max(0, ...m.steps.filter(s => SEATED.has(s.do)).map(s => s.who.length + s.with.length));   // (free seats it needs: one for each who sits)
    const homeOf = k => { const p = pOf(run.cast[k]); return p && places.get(p.home); };
    switch (base){
      case 'town-square': {
        const sq = places.get(run.square) || squares()[0]; if (!sq) return null;
        if (sub === 'food-stalls' && run.stall !== undefined && sq.stalls.has(run.stall)){
          const S = sq.stalls.get(run.stall), a = { kind: 'open', place: sq, spot: S.queue[0], fixed: {} };
          if (run.cast.boss) a.fixed[run.cast.boss] = spotT(S.keepers[0]);
          const nb = pOf(run.cast['red-herring-stall-neighbor']); if (nb && sq.stalls.has(nb.stall)) a.fixed[nb.id] = spotT(sq.stalls.get(nb.stall).keepers[0]);
          return a;
        }
        return { kind: 'open', place: sq };
      }
      case 'tenements': {
        // whose door: the 6B partner's if they're in it, else the flat's, else the officer whose door it is
        const ks = m.people.map(id => slotOf(arc, id));
        for (const k of ['b1-long-queue/extra:partner', 'b1-long-queue/extra:resident']) if (ks.includes(k)){ const a = doorAnc(homeOf(k)); if (a) return a; }
        if (m.steps.some(s => s.do === 'knock-and-wait' && s.with.includes('inside-officer'))){ const a = doorAnc(homeOf('inside-officer')); if (a) return a; }
        const sh = places.get(run.safehouse); if (sh) return doorAnc(sh);
        for (const id of m.people){ const p = pOf(run.cast[slotOf(arc, id)]); if (p && !p.cop) return doorAnc(places.get(p.home)); }
        return null;
      }
      case 'police-station': return doorAnc(places.get(run.station));
      case 'lift': {   // the lift hall nearest the flat (or the square)
        const sh = places.get(run.safehouse), x = sh ? sh.x : cx, z = sh ? sh.z : cz; let best = null, bd = 30;
        for (const pl of places.values()){ if (!pl.cell) continue; for (const d of pl.doors) if (d.lift){ const dd = Math.hypot(d.stand.x - x, d.stand.z - z); if (dd < bd){ bd = dd; best = { kind: 'door', door: d, place: pl.id }; } } }
        return best || (sh ? doorAnc(sh) : null);
      }
      case 'lawn': { const pl = STORY.openPlaceNear(cx, cz, 'lawn', seats) || STORY.openPlaceNear(cx, cz, 'bench', seats); return pl ? { kind: 'open', place: pl } : null; }
      case 'food-counter': { const pl = STORY.openPlaceNear(cx, cz, 'cafe-stool', seats); return pl ? { kind: 'open', place: pl } : null; }
      case 'shopfront': return doorAnc(STORY.shopNear(cx, cz, null));
      case 'bath-house': { const pl = nearestMega('bathhouse', cx, cz); return pl ? (pl.open ? { kind: 'open', place: pl } : doorAnc(pl)) : null; }
      default: {
        const MK = { 'market-plaza': 'market', foundry: 'foundry', 'logistics-hub': 'logistics', 'hydroponic-farm': 'greenhouse', 'cloud-pagoda': 'pagoda', 'neon-dome': 'club', 'sky-mall': 'mall', 'data-spire': 'spire', 'radio-station': 'radio' }[base];
        if (!MK) return null;   // (the metro platform, the sky highway, a luxury tower: not staged yet)
        return doorAnc(nearestMega(MK, cx, cz));
      }
    }
  }

  /* ---------- the run: which rows, when ---------- */
  function rowsFor(run, arcId){
    const A = C.arcs.get(arcId), v = arcId === run.arc ? run.variant : 'base', coop = run.coop;
    const use = A.rows.filter(r => r.variant === 'base' || (r.variant === v && (v === 'careful' || coop)));
    const gone = new Set(); for (const r of use) if (r.variant !== 'base' && r.rel === 'replaces') r.relTo.forEach(x => gone.add(x));
    return use.filter(r => !gone.has(r.id));
  }
  function start(arcId, opts){
    opts = opts || {};
    const why = canRun(arcId); if (why){ C.dbg.why = why; return null; }
    const seed = opts.seed ?? H(arcId, day(), 'run');
    const coop = stations().length >= 2;
    const variant = opts.variant || (U(seed, 'variant') < .7 ? DEFAULT[arcId] || 'careless' : (DEFAULT[arcId] === 'careful' ? 'careless' : 'careful'));
    const run = { arc: arcId, arcs: [arcId, ...(CROSS[arcId] || []), 'ordinary-police-work'].filter(a => C.arcs.has(a)), seed, variant, coop, start: day() + (opts.now ? 0 : 1), cast: {}, shift: {}, done: {}, flags: {}, at: {}, tries: {} };
    const bad = castRun(run); if (bad){ C.dbg.why = bad; return null; }
    C.run = run; applyPeople(); note('start', arcId, variant, coop ? 'with station 2' : 'one station'); save(); return run;
  }
  const caseDay = () => C.run ? day() - C.run.start + 1 : 0;
  C.caseDay = caseDay;
  // what the run does to people: officers' shifts, who is held at the station, who stays home
  function applyPeople(){
    const run = C.run; if (!run) return;
    for (const [id, k] of Object.entries(run.shift)){ const p = pOf(id); if (p) p.copShift = k; }
    const flagged = (k, f) => !!run.flags[k + ':' + f];
    for (const [k, id] of Object.entries(run.cast)){
      const p = pOf(id); if (!p) continue;
      const ns = nsOf(k);
      p.custody = ns ? flagged(ns, 'arrested') : false;
      p.offDuty = ns ? (flagged(ns, 'suspended') && !flagged(ns, 'cleared')) || (flagged(ns, 'missing') && !flagged(ns, 'talking')) : false;
    }
  }
  const NS_OF = {}; const nsOf = k => { if (!IDX) return null; if (!Object.keys(NS_OF).length) for (const [ns, ids] of Object.entries(IDX.ns)) for (const id of ids) NS_OF[id === 'boss-careless' || id === 'boss-careful' ? 'boss' : id] = ns; return NS_OF[k] || null; };
  C.routine = (p, h) => {   // (people.js desire)
    const run = C.run;
    if (p.custody){ const st = places.get(run ? run.station : null) || stations()[0]; return st ? st.id : null; }
    if (p.offDuty) return p.home;
    return null;
  };

  /* ---------- staging a moment ---------- */
  const SEATED = new Set(['sit', 'eat', 'picnic']);
  const AWAY = new Set(['walk', 'run', 'walk-together', 'carry', 'leave']);
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  function stage(run, arc, row, m){
    const anc0 = anchorOf(run, arc, m, row.where); if (!anc0) return 'no place';
    const ids = []; for (const id of m.people){ const p = personFor(run, arc, id, anc0); ids.push(p); }
    const L = {}, cast = {};
    m.people.forEach((id, k) => { if (ids[k] && Object.keys(cast).length < 6 && !Object.values(cast).includes(ids[k])){ const l = LETTERS[Object.keys(cast).length]; L[id] = l; cast[l] = ids[k]; } });
    if (!cast.A) return 'nobody';
    for (const id of Object.values(cast)){ const p = pOf(id); if (!p) return 'busy: gone'; const why = p.scene ? 'in a scene' : p.ride ? 'in a lift' : p.metro || p.metroPlan ? 'on the metro' : p.club || p.clubbing ? 'at the club' : p.gone ? 'gone' : p.custody && !m.steps.some(s => s.do === 'escort') ? 'held' : null; if (why) return 'busy: ' + why; }
    const station = doorAnc(places.get(run.station));
    const beats = [], log = {};
    const fresh = () => Object.assign({}, anc0, { spot: anc0.spot, fixed: anc0.fixed });   // (each step its own anchor: the spots it takes are its own)
    m.steps.forEach((st, j) => {
      const who = st.who.filter(id => L[id]).map(id => L[id]), wit = st.with.filter(id => L[id]).map(id => L[id]);
      if (!who.length) return;
      const line = (st.line || '').replace(/\{([a-z0-9:-]+)((?:\.(?:he|him|his))?)\}/g, (x, id, pr) => L[id] ? '{' + L[id] + pr + '}' : 'someone');
      const b = { id: 'b' + j, who, with: wit, at: 'case', do: st.do, held: st.held, hold: st.stay ? 16 + U(m.id, j)*6 : undefined };
      if (st.do === 'escort'){ Object.assign(b, { do: 'walk-together', anc: station }); beats.push(b); log[b.id] = [line]; beats.push({ id: 'b' + j + 'in', who: [...who, ...wit], with: [], at: 'case', do: 'enter', anc: station }); return; }
      if (AWAY.has(st.do)){
        if (j === 0) Object.assign(b, { do: st.do === 'leave' ? 'walk' : st.do, anc: fresh });   // (arriving: to where it happens)
        else Object.assign(b, { do: st.do === 'leave' ? 'walk' : st.do, anc: { kind: 'here' }, away: true, at: 'street' });   // (going off from it)
      } else if (st.do === 'enter'){ if (anc0.kind === 'door') b.anc = fresh; else Object.assign(b, { do: 'walk', anc: fresh }); }
      else b.anc = fresh;
      if (st.do === 'stakeout') b.hold = 18 + U(m.id, j)*8;
      beats.push(b); log[b.id] = [line];
    });
    if (!beats.length) return 'nothing';
    const s = { id: 'case.' + arc + '.' + m.id, beats, log, roles: {}, effects: {}, next: null, tier: 'case' };
    const sc = STORY.startScene(s, cast, { done: (sc, why) => { delete run.at[m.id]; finish(run, arc, row, m, why); } });
    if (!sc) return 'could not start';
    run.at[m.id] = true; note('stage', arc, m.id, JSON.stringify(cast)); return null;
  }
  function finish(run, arc, row, m, why){
    note('end', m.id, why);
    // it couldn't be played through (no free seat, someone stuck or called away): again later in its window, a few times
    if (why && why !== 'done' && why !== 'stopped'){ const n = run.tries[m.id] = (run.tries[m.id] || 0) + 1; if (n < 4){ save(); return; } }
    run.done[m.id] = why || 'done';
    if (row.moments[row.moments.length - 1] === m) setRow(run, row);
    save();
  }
  function setRow(run, row){
    for (const f of row.sets){ run.flags[f] = true; }
    if (row.sets.length) note('flags', row.sets.join(' '));
    applyPeople();
    if (run.flags['case:closed'] && !run.closedAt) run.closedAt = day();
  }

  /* ---------- every frame (from story.js) ---------- */
  let next = 0;
  C.tick = () => {
    if (!C.on || !IDX || !STORY.on) return;
    if (STORY.clock < next) return; next = STORY.clock + 4;   // (every few game minutes)
    const run = C.run;
    if (!run){
      if (C.paused) return;
      const last = C.lastEnd ?? -99; if (day() - last < 3) return;   // (a few quiet days between cases)
      const arc = BOSS_ARCS[H(day(), 'pick') % BOSS_ARCS.length]; start(arc); return;
    }
    if (run.closedAt !== undefined && day() - run.closedAt >= 2){ endRun(); return; }
    const cd = caseDay(); if (cd < 1) return;
    const h = hourNow();
    let staged = Object.keys(run.at).length;
    for (const arc of run.arcs) for (const row of rowsFor(run, arc)){
      for (let k = 0; k < row.moments.length; k++){
        const m = row.moments[k]; if (run.done[m.id]) continue;
        if (k > 0 && !run.done[row.moments[k - 1].id]) break;
        if (run.at[m.id]) break;
        const d0 = m.day ?? row.days[0], d1 = row.days[1];
        if (cd > d1){ run.done[m.id] = 'missed'; note('missed', m.id); if (k === row.moments.length - 1) setRow(run, row); continue; }
        if (cd < d0) break;
        const want = hourOf(run, arc, row, m), dh = ((h - want) % 24 + 24) % 24;
        if (dh > 3 && !C.now) break;   // (its hour, give or take: it starts from a quarter before it, up to three hours after)
        if (staged >= 3) break;
        const why = stage(run, arc, row, m);
        if (why){ if (m._why !== why) note('wait', m.id, why); m._why = why; if (why === 'no place' || why === 'nothing'){ run.done[m.id] = why; note('skip', m.id, why); if (k === row.moments.length - 1) setRow(run, row); continue; } break; }
        staged++; break;
      }
    }
  };
  function hourOf(run, arc, row, m){
    if (m.hour !== null && m.hour !== undefined) return (m.hour - .25 + 24) % 24;
    for (const id of m.people){ const L = IDX.officers[id]; if (L) return SHIFT_HOUR[SHIFT[L]]; }
    const base = row.where.split('/')[0];
    return { 'police-station': 9, 'town-square': 12, tenements: 18, lift: 19, lawn: 10, 'market-plaza': 11 }[base] ?? 14;
  }
  function endRun(){
    const run = C.run; note('closed', run.arc);
    for (const id of Object.values(run.cast)){ const p = pOf(id); if (!p) continue; p.copShift = undefined; p.offDuty = undefined; }
    // the arrested stay held (the cover face and the officer who sold out); everyone else back to their lives
    C.past = (C.past || []).concat([{ arc: run.arc, held: Object.values(run.cast).filter(id => { const p = pOf(id); return p && p.custody; }) }]);
    C.run = null; C.lastEnd = day(); save();
  }

  /* ---------- keeping it ---------- */
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({ v: 1, run: C.run && Object.assign({}, C.run, { at: {} }), lastEnd: C.lastEnd, past: C.past || [], paused: !!C.paused })); } catch (e){} }
  function restore(){
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d || d.v !== 1) return;
      C.run = d.run || null; if (C.run && !C.run.tries) C.run.tries = {}; C.lastEnd = d.lastEnd; C.past = d.past || []; C.paused = !!d.paused;
      // (people come after the city loads: put the run on them once they're there)
      const wait = () => { if (typeof pplReady !== 'undefined' && pplReady && people.size){ applyPeople(); for (const ps of C.past) for (const id of ps.held){ const p = pOf(id); if (p) p.custody = true; } } else setTimeout(wait, 500); }; wait();
    } catch (e){}
  }
  addEventListener('beforeunload', save);

  /* ---------- for tests and the curious ---------- */
  C.start = (arc, opts) => start(arc || BOSS_ARCS[0], Object.assign({ now: true }, opts || {}));
  C.stop = () => { if (C.run){ for (const sc of [...STORY.scenes]) if (sc.s.id.startsWith('case.')) STORY.endScene(sc, 'stopped'); for (const id of Object.values(C.run.cast)){ const p = pOf(id); if (p){ p.copShift = undefined; p.custody = undefined; p.offDuty = undefined; } } } C.run = null; save(); };
  C.state = () => { const run = C.run; if (!run) return { why: C.dbg.why, lastEnd: C.lastEnd };
    const all = run.arcs.flatMap(a => rowsFor(run, a).flatMap(r => r.moments)), done = all.filter(m => run.done[m.id]);
    return { arc: run.arc, variant: run.variant, coop: run.coop, day: caseDay(), moments: all.length, done: done.length, played: done.filter(m => run.done[m.id] === 'done').length,
      skipped: done.filter(m => run.done[m.id] !== 'done').map(m => m.id + ':' + run.done[m.id]).slice(-12), flags: Object.keys(run.flags), staging: Object.keys(run.at), cast: run.cast }; };
  C.who = slot => C.run && pOf(C.run.cast[slot]);
  C.setDay = d => { if (C.run) C.run.start = day() - d + 1; };   // (tests: make it this case day now)
  return C;
})();
window.CASES = CASES;
STORY.caseDesc = CASES.caseDesc;
CASES.load();
