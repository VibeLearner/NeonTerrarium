/* Police cases (the bible: story/police; its ledgers as data: data/cases, made by tools/cases). A case runs over three weeks of game
   days: a boss case with the smaller cases that cross it and the everyday police work around them, all on the same day frame, sharing
   one cast. Each ledger row is played as moments (one per day it shows), each moment as a scene of the story engine (story.js), at its
   place, on its day, near its hour. A moment that can't be staged in its window (nobody free, no such place in this city) is passed by,
   and what its row sets still happens: the case moves on whether or not anyone was watching. The log only shows what the camera
   sees, so the player follows a case by watching the people in it. */
const CASES = (() => {
  const C = { on: false, run: null, arcs: null, journal: [], dbg: { why: '' } };
  const KEY = 'neonIsland.cases', BOSS_ARCS = ['b1-long-queue', 'b2-door-work', 'b3-the-regular', 'b4-dead-drop-days', 'b5-last-train'];
  const CROSS = { 'b1-long-queue': ['s1-lift-lobby-muggings', 's2-missing-delivery', 's3-stall-fire', 's7-missing-regular'], 'b2-door-work': ['s3-stall-fire', 's4-sky-mall-pickpocket'],
    'b3-the-regular': ['s1-lift-lobby-muggings', 's5-platform-lurker', 's6-screen-graffiti', 's7-missing-regular'], 'b4-dead-drop-days': ['s2-missing-delivery', 's6-screen-graffiti'],
    'b5-last-train': ['s1-lift-lobby-muggings', 's4-sky-mall-pickpocket', 's5-platform-lurker', 's7-missing-regular'] };
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
  // the place each boss case is centered on (its cover face works there), and the staff each case takes its people from
  const metroStations = () => [...places.values()].filter(pl => pl.id.startsWith('mt:') && pl.doors.length);
  const staffOf = pl => pl ? [...people.values()].filter(p => p.job === pl.id && ordinary(p)) : [];
  const CENTRE = { 'b1-long-queue': () => squares()[0], 'b2-door-work': () => megaOf('club')[0], 'b3-the-regular': () => megaOf('bathhouse').find(pl => pl.stalls && pl.stalls.size >= 2),
    'b4-dead-drop-days': () => megaOf('logistics')[0], 'b5-last-train': () => metroStations()[0] };
  // who in the place's staff a slot is (the rest are cast from the neighborhood the first time a moment needs them)
  const STAFF = { 'b2-door-work': ['boss', 'go-between-bartender', 'informant', 'b2-door-work/extra:kiosk-server', 'b2-door-work/extra:cleaner', 'b2-door-work/extra:stand-in'],
    'b4-dead-drop-days': ['boss', 'informant', 'go-between-bartender', 'b4-dead-drop-days/extra:driver'] };
  function canRun(arc){
    if (!stations().length) return 'no police station with its officers';
    const c = CENTRE[arc] && CENTRE[arc](); if (!c) return 'no ' + { 'b1-long-queue': 'square with stalls', 'b2-door-work': 'Neon Dome', 'b3-the-regular': 'bath house', 'b4-dead-drop-days': 'logistics hub', 'b5-last-train': 'metro station' }[arc];
    if (arc === 'b1-long-queue' && !staffOf(c).some(p => p.stall !== null && p.stall !== undefined)) return 'no stall keepers';
    if (arc === 'b2-door-work' && staffOf(c).length < 3) return 'too few Dome staff';
    return null;
  }

  /* ---------- the cast ---------- */
  // each slot is a real person for the whole run: the officers by shift from the station, the cover face by the job the case gives it,
  // the rest from the neighborhood; an extra (a customer, the landlord) is cast the first time a moment needs one, near where it happens
  function castRun(run){
    const st = stations()[0], cops = [...people.values()].filter(p => p.job === st.id).sort((a, b) => a.id < b.id ? -1 : 1);
    const order = cops.slice().sort((a, b) => U(a.id, run.seed, 'cop') - U(b.id, run.seed, 'cop'));
    const cast = run.cast;
    const hb = Math.round(HABIT[run.arc] ?? 12) % 24, lead = hb >= 7 && hb < 15 ? 0 : hb >= 15 && hb < 23 ? 1 : 2;   // (the pair on the case works the hours the operation does)
    for (const [id, L] of Object.entries(IDX.officers)){ const p = order.shift(); if (!p) return 'too few officers'; cast[id] = p.id; run.shift[p.id] = (L === 'A' || L === 'B') ? lead : SHIFT[L]; }
    const st2 = stations()[1]; if (st2){ const q = [...people.values()].filter(p => p.job === st2.id).sort((a, b) => U(a.id, run.seed, 'cop2') - U(b.id, run.seed, 'cop2'))[0]; if (q) cast['inside-officer-extra'] = q.id; }
    run.station = st.id;
    const ctr = CENTRE[run.arc](); run.centre = ctr.id;
    const used = new Set(Object.values(cast));
    if (run.arc === 'b1-long-queue'){
      const sq = ctr, keepers = staffOf(sq).filter(p => p.stall !== null && p.stall !== undefined && sq.stalls.has(p.stall)).sort((a, b) => a.id < b.id ? -1 : 1);
      const day_ = keepers.filter(p => p.nightShift >= .5), pool = day_.length ? day_ : keepers, boss = pool[H(run.seed, 'boss') % pool.length];   // (a day market keeper if there is one: the noon queue)
      cast.boss = boss.id; run.square = sq.id; run.stall = boss.stall; used.add(boss.id);
      const bv = sq.stalls.get(boss.stall).keepers[0], nb = keepers.filter(p => p !== boss && p.stall !== boss.stall).sort((a, b) => { const A = sq.stalls.get(a.stall).keepers[0], B = sq.stalls.get(b.stall).keepers[0]; return Math.hypot(A.x - bv.x, A.z - bv.z) - Math.hypot(B.x - bv.x, B.z - bv.z); })[0];
      if (nb){ cast['red-herring-stall-neighbor'] = nb.id; used.add(nb.id); }
    }
    if (run.arc === 'b3-the-regular'){   // the front desk and the tea counter keep the bath house's two stalls
      const ids = [...ctr.stalls.keys()].sort((a, b) => a - b), keep = k => staffOf(ctr).find(p => p.stall === ids[k] && !used.has(p.id));
      run.stalls = { desk: ids[0], tea: ids[1] };
      const d = keep(0), t = keep(1); if (d){ cast.informant = d.id; used.add(d.id); } if (t){ cast['go-between-clerk'] = t.id; used.add(t.id); }
    }
    for (const k of STAFF[run.arc] || []){ const p = staffOf(ctr).filter(q => !used.has(q.id)).sort((a, b) => U(a.id, run.seed, k) - U(b.id, run.seed, k))[0]; if (p){ cast[k] = p.id; used.add(p.id); } }
    // the flats the case's doors are in: a walk-up near its center, with people living in it
    const homes = [...places.values()].filter(pl => pl.cell && pl.cell.sections.some(sc => sc.zone === 'low') && [...people.values()].filter(p => p.home === pl.id && ordinary(p)).length >= 2);
    homes.sort((a, b) => Math.hypot(a.x - ctr.x, a.z - ctr.z) - Math.hypot(b.x - ctr.x, b.z - ctr.z));
    const sh = homes[H(run.seed, 'flat') % Math.min(3, homes.length || 1)]; run.safehouse = sh ? sh.id : null;
    if (!cast.boss){ const p = personFor(run, run.arc, 'boss-careless', { kind: 'open', place: ctr }); if (!p) return 'nobody for the cover face'; }
    return null;
  }
  // a slot's id as the run knows it: characters are shared by every arc in the run, extras belong to their arc
  const slotOf = (arc, id) => { const run = C.run, rm = run && run.sim && run.sim.remap; if (rm && arc === run.arc && rm[id]) id = rm[id];   // (the officer who turned plays the bible's inside man)
    return id.startsWith('extra:') ? arc + '/' + id : (id === 'boss-careless' || id === 'boss-careful') ? 'boss' : id; };
  const descFor = (arc, id) => { const A = C.arcs.get(arc), sl = A && A.slots[id === 'boss' ? 'boss-careless' : id]; return (sl && sl.desc) || ''; };
  const FLAT = /^extra:(resident|partner|caller)$/;
  function personFor(run, arc, id, anc){
    const k = slotOf(arc, id); if (run.cast[k]) return run.cast[k];
    if (IDX.officers[id] || id === 'inside-officer-extra' || id.startsWith('home:')) return null;
    // cast now: someone free near where the moment is, who isn't in the run yet; a man or a woman as the case's words have them,
    // and someone living in the case's flats for a resident at a door
    const used = new Set(Object.values(run.cast)), [x, z] = ancXZ(anc), d = descFor(id.includes('/') ? id.split('/')[0] : arc, id.split('/').pop());
    const g = /\b(man|he|his|boy)\b/i.test(d) ? 'm' : /\b(woman|she|her|girl|sister|mother)\b/i.test(d) ? 'f' : null;
    const fits = p => ordinary(p) && !used.has(p.id) && (!g || STORY.identOf(p.id).g === g);
    let pool = [...people.values()].filter(fits);
    if (FLAT.test(id.split('/').pop()) && run.safehouse){ const here = pool.filter(p => p.home === run.safehouse); if (here.length) pool = here; }
    const nearNow = pool.filter(p => !p.scene && Math.hypot(p.x - x, p.z - z) < 30);
    const p = near(nearNow, x, z)[0] || near(pool, x, z)[0]; if (!p) return null;
    run.cast[k] = p.id; note('cast', k, p.id); return p.id;
  }
  C.caseDesc = id => {   // (story.js descOf: someone the player hasn't a name for, as the case's own words see them)
    const run = C.run; if (!run) return null;
    for (const [k, v] of Object.entries(run.cast)) if (v === id){ const [arc, ex] = k.includes('/') ? k.split('/') : [run.arc, k];
      const names = ex === 'boss' ? ['boss-careless', 'boss-careful'] : [ex];
      for (const a of [arc, ...run.arcs]){ const A = C.arcs.get(a); if (!A) continue; for (const n of names){ const d = A.slots[n]; if (d && d.desc) return d.desc; } } }
    return null;
  };

  /* ---------- where it happens ---------- */
  const doorAnc = pl => { const d = pl && STORY.streetDoor(pl); return d ? { kind: 'door', door: d, place: pl.id } : null; };
  const nearestMega = (kind, x, z) => megaOf(kind).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] || null;
  function ancXZ(a){ if (!a) return [0, 0]; if (a.kind === 'door') return [a.door.stand.x, a.door.stand.z]; if (a.kind === 'open') return [a.place.x, a.place.z]; return [a.x || 0, a.z || 0]; }
  function centre(run){ const c = places.get(run.centre) || places.get(run.square) || places.get(run.station); return c ? [c.x, c.z] : [0, 0]; }
  const spotT = sp => ({ kind: 'spot', spot: sp, x: sp.x, z: sp.z, node: sp.node, y: sp.y });
  const pointAt = (x, z) => { const n = STORY.nearestNode(x, z); return n < 0 ? null : { kind: 'point', x: NG.x[n], z: NG.z[n], node: n }; };
  // a door anchor with someone kept at its side (the door worker at the Dome's door)
  const besideDoor = (a, id, side) => { if (!a || !id) return a; const d = a.door, tx = -d.n[1], tz = d.n[0], x = d.stand.x + tx*.55*side + d.n[0]*.1, z = d.stand.z + tz*.55*side + d.n[1]*.1;
    a.fixed = Object.assign(a.fixed || {}, { [id]: { kind: 'pt', x, z, node: d.node } }); return a; };
  // an open place with its stall keeper behind the counter and the rest at the counter's queue
  function atStall(pl, stall, keeperId){
    const S = pl && pl.stalls && pl.stalls.get(stall); if (!S) return pl ? { kind: 'open', place: pl } : null;
    const a = { kind: 'open', place: pl, spot: S.queue[0], fixed: {} }; if (keeperId && S.keepers[0]) a.fixed[keeperId] = spotT(S.keepers[0]); return a;
  }
  function anchorOf(run, arc, m, where){
    const [base, sub] = where.split('/'), [cx, cz] = centre(run);
    const seats = Math.max(0, ...m.steps.filter(s => SEATED.has(s.do)).map(s => s.who.length + s.with.length));   // (free seats it needs: one for each who sits)
    const homeOf = k => { const p = pOf(run.cast[k]); return p && places.get(p.home); };
    const nearest = list => list.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0] || null;
    switch (base){
      case 'town-square': {
        const sq = places.get(run.square) || nearest(squares()); if (!sq) return null;
        if (sub === 'food-stalls' && run.stall !== undefined && sq.stalls.has(run.stall)){
          const a = atStall(sq, run.stall, run.cast.boss);
          const nb = pOf(run.cast['red-herring-stall-neighbor']); if (nb && sq.stalls.has(nb.stall)) a.fixed[nb.id] = spotT(sq.stalls.get(nb.stall).keepers[0]);
          return a;
        }
        return { kind: 'open', place: sq };
      }
      case 'tenements': {
        // whose door: someone in it who lives in the case's flats, or the one knocked on, or the flats themselves
        const ks = m.people.map(id => slotOf(arc, id)), knocked = m.steps.filter(s => s.do === 'knock-and-wait').flatMap(s => s.with).map(id => slotOf(arc, id));
        for (const k of [...knocked, ...ks.filter(k => FLAT.test(k.split('/')[1] || ''))]){ const h = homeOf(k); if (h && (!pOf(run.cast[k]) || !pOf(run.cast[k]).cop || knocked.includes(k))){ const a = doorAnc(h); if (a) return a; } }
        if (run.safehouse) return doorAnc(places.get(run.safehouse));
        for (const id of m.people){ const p = pOf(run.cast[slotOf(arc, id)]); if (p && !p.cop) return doorAnc(places.get(p.home)); }
        return null;
      }
      case 'luxury-tower': return doorAnc(nearest([...places.values()].filter(pl => pl.cell && pl.cell.sections.some(sc => sc.zone === 'high') && STORY.streetDoor(pl))));
      case 'police-station': return doorAnc(places.get(run.station));
      case 'lift': {   // the lift hall nearest the flats (or the case's center)
        const sh = places.get(run.safehouse), x = sh ? sh.x : cx, z = sh ? sh.z : cz; let best = null, bd = 30;
        for (const pl of places.values()){ if (!pl.cell) continue; for (const d of pl.doors) if (d.lift){ const dd = Math.hypot(d.stand.x - x, d.stand.z - z); if (dd < bd){ bd = dd; best = { kind: 'door', door: d, place: pl.id }; } } }
        return best || (sh ? doorAnc(sh) : null);
      }
      case 'lawn': { const pl = STORY.openPlaceNear(cx, cz, 'lawn', seats) || STORY.openPlaceNear(cx, cz, 'bench', seats); return pl ? { kind: 'open', place: pl } : null; }
      case 'food-counter': { const pl = STORY.openPlaceNear(cx, cz, 'cafe-stool', seats); return pl ? { kind: 'open', place: pl } : null; }
      case 'shopfront': return doorAnc(STORY.shopNear(cx, cz, null));
      case 'bath-house': {
        const pl = places.get(run.centre && run.arc === 'b3-the-regular' ? run.centre : null) || nearest(megaOf('bathhouse')); if (!pl) return null;
        const ids = pl.stalls ? [...pl.stalls.keys()].sort((a, b) => a - b) : [];
        if (sub === 'front-desk') return atStall(pl, ids[0], arc === 'b3-the-regular' ? run.cast.informant : null);
        if (sub === 'tea-counter') return atStall(pl, ids[1], arc === 'b3-the-regular' ? run.cast['go-between-clerk'] : null);
        if (sub === 'pools' || seats) return { kind: 'open', place: pl };
        return ids.length > 1 ? atStall(pl, ids[1], null) : pl.open ? { kind: 'open', place: pl } : doorAnc(pl);   // (standing about: by the tea counter)
      }
      case 'neon-dome': {
        const a = doorAnc(nearest(megaOf('club'))); if (!a) return null;
        if (sub === 'door-staff' && arc === 'b2-door-work') return besideDoor(a, run.cast.boss, 1);   // (the door worker at the door, the queue past them)
        return a;
      }
      case 'metro-station': {   // the station's lift door down on the street (the platforms up top are the metro's own)
        const st = places.get(run.arc === 'b5-last-train' ? run.centre : null) || nearest(metroStations()); return st ? doorAnc(st) : null;
      }
      case 'sky-highway': {   // the street under the nearest highway
        let best = null, bd = Infinity; if (typeof highways !== 'undefined') for (const h of highways) for (const t of h.tiles){ const x = t.i*LOT, z = t.j*LOT, d = Math.hypot(x - cx, z - cz); if (d < bd){ bd = d; best = [x, z]; } }
        return best ? pointAt(best[0], best[1]) : null;
      }
      default: {
        const MK = { 'market-plaza': 'market', foundry: 'foundry', 'logistics-hub': 'logistics', 'hydroponic-farm': 'greenhouse', 'cloud-pagoda': 'pagoda', 'sky-mall': 'mall', 'data-spire': 'spire', 'radio-station': 'radio' }[base];
        if (!MK) return null;
        const own = MK === 'logistics' && run.arc === 'b4-dead-drop-days' ? places.get(run.centre) : null;
        return doorAnc(own || nearest(megaOf(MK)));
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
    const variant = opts.variant || (DEFAULT[arcId] ? (U(seed, 'variant') < .7 ? DEFAULT[arcId] : DEFAULT[arcId] === 'careful' ? 'careless' : 'careful') : U(seed, 'variant') < .5 ? 'careless' : 'careful');
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
      p.offDuty = ns ? (flagged(ns, 'suspended') && !flagged(ns, 'cleared')) || (flagged(ns, 'missing') && !flagged(ns, 'talking')) || (flagged(ns, 'escaped') && !run.closedAt) : false;
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
  function stage(run, arc, row, m, played){
    const anc0 = m.anc ? m.anc() : anchorOf(run, arc, m, row.where); if (!anc0) return 'no place';
    const ids = []; for (const id of m.people){ const p = personFor(run, arc, id, anc0); ids.push(p); }
    const L = {}, cast = {};
    m.people.forEach((id, k) => { if (ids[k] && Object.keys(cast).length < 6 && !Object.values(cast).includes(ids[k])){ const l = LETTERS[Object.keys(cast).length]; L[id] = l; cast[l] = ids[k]; } });
    if (!cast.A) return 'nobody';
    // someone waiting up on a platform takes the lift back down for it (on the train itself: they're gone till the next stop)
    for (const id of Object.values(cast)){ const p = pOf(id), M = p && p.metro;
      if (M && !M.ambient && (M.st === 'wait' || M.st === 'toSpot') && M.l && M.l.stn){ const st = M.l.stn.get(M.k); if (st && places.has(st.id)){ if (M.st === 'wait' && M.l._wait) M.l._wait.set(M.k, Math.max(0, (M.l._wait.get(M.k) || 1) - 1)); p.metro = null; p.at = st.id; p.until = 0; p.x = places.get(st.id).x; p.z = places.get(st.id).z; } } }
    // an everyday story moment gives way to the case (a raid doesn't wait for someone's chat at a door to finish)
    const prio = m.prio ?? 1; for (const id of Object.values(cast)){ const p = pOf(id); if (p && p.scene && (p.scene.s.tier !== 'case' || (p.scene.s.prio ?? 1) < prio)) STORY.endScene(p.scene, 'preempted'); }   // (and a small case moment gives way to a raid)
    for (const id of Object.values(cast)){ const p = pOf(id); if (!p) return 'busy: gone'; const why = p.scene ? 'in a scene ' + p.scene.s.id + ' p' + (p.scene.s.prio ?? '-') + ' ' + p.scene.phase : p.ride ? 'in a lift' : p.metro ? 'on the train' : p.club || p.clubbing ? 'at the club' : p.gone ? 'gone' : p.custody && !m.steps.some(s => s.do === 'escort') ? 'held' : null; if (why) return 'busy: ' + why; }
    const station = doorAnc(places.get(run.station));
    const beats = [], log = {};
    const fresh = () => Object.assign({}, anc0, { spot: anc0.spot, fixed: anc0.fixed });   // (each step its own anchor: the spots it takes are its own)
    m.steps.forEach((st, j) => {
      const who = st.who.filter(id => L[id]).map(id => L[id]), wit = st.with.filter(id => L[id]).map(id => L[id]);
      if (!who.length) return;
      const line = (st.line || '').replace(/\bOfficer \{/g, '{').replace(/\{([a-z0-9:-]+)((?:\.(?:he|him|his))?)\}/g, (x, id, pr) => L[id] ? '{' + L[id] + pr + '}' : 'someone');
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
    for (const id of Object.values(cast)){ const p = pOf(id); if (p && p.metroPlan && !p.metro) p.metroPlan = null; }   // (walking to the station: they turn back for it)
    const s = { id: 'case.' + arc + '.' + m.id, beats, log, roles: {}, effects: {}, next: null, tier: 'case', prio: m.prio ?? 1 };
    const sc = STORY.startScene(s, cast, { done: (sc, why) => { delete run.at[m.id]; if (played){ note('end', m.id, why); const n = run.tries[m.id] = (run.tries[m.id] || 0) + 1; if (why === 'done' || why === 'stopped' || n >= 3) played(why); else if (C.run && C.run.sim){ const e = C.run.sim.q.find(x => x.mom && x.wait); if (e) e.wait = false; } save(); } else finish(run, arc, row, m, why); } });
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

  /* ---------- the simulation: the police and the boss, racing (plan: .plans/living-cases-plan.md) ----------
     The boss case isn't a script. Once a game hour the operation does what its habits say (a collection, a run to the flat, a
     count), and each act leaves traces. Officers on shift near a trace may find it, by how well they work right now (focus: skill,
     diligence, stress, home). Found traces become leads on the part of the operation they point to; enough leads and the police
     act (a stakeout, a raid, an arrest). Leads raise the boss's heat, and heat makes the boss act (lie low, move the flat, cut a
     runner loose, lean on a cop, run). Whoever gets there first decides the ending, and how close the other side came is kept.
     All of it is a few dozen numbers once an hour; only what happens is staged, as scenes from the bible's beats or the lines below. */
  const clamp = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const FIND = .045, LEADK = .2;   // (how often a covered trace is found in an hour, and what a find is worth: tuned so a case runs two to four weeks)
  const lerp = (a, b, t) => a + (b - a)*t;
  const PAIR = { 'inside-officer': 'framed-officer', 'framed-officer': 'inside-officer', 'veteran-officer': 'rookie-officer', 'rookie-officer': 'veteran-officer' };
  const ON_SHIFT = (slot, h) => { const id = C.run && C.run.cast[slot], k = (C.run && id !== undefined && C.run.shift[id] !== undefined) ? C.run.shift[id] : SHIFT[IDX.officers[slot]] ?? 0, ws = [7, 15, 23][k]; return ((h - ws + 24) % 24) < 8; };
  // when each boss's operation runs: the collection hour (their habit), and where it happens
  const HABIT = { 'b1-long-queue': 11.8, 'b2-door-work': 22.5, 'b3-the-regular': 7.5, 'b4-dead-drop-days': 9, 'b5-last-train': 7 };
  const CENTRE_AT = { 'b1-long-queue': 'town-square/food-stalls', 'b2-door-work': 'neon-dome/door-staff', 'b3-the-regular': 'bath-house/tea-counter', 'b4-dead-drop-days': 'logistics-hub', 'b5-last-train': 'metro-station/platform' };
  // a row of the bible: what kind of beat it is, from what it sets and plants (so the simulation can stage it when that kind of thing happens)
  function tagRow(r){
    const S = r.sets.join(' '), who = new Set(r.moments.flatMap(m => m.people)), clue = k => r.clues.some(c => c.k === k);
    if (/boss:arrested/.test(S)) return 'arrest-boss';
    if (/safehouse\d?-burned/.test(S)) return 'raid';
    if (/\bg\d:arrested/.test(S)) return 'arrest-go';
    if (/boss:tipped-off/.test(S)) return 'tipoff';
    if (/B:cleared/.test(S)) return 'cleared';
    if (/B:suspended/.test(S)) return 'suspend';
    if (/B:framed/.test(S)) return 'frame';
    if (/inf:missing/.test(S)) return 'missing';
    if (/inf:talking/.test(S)) return 'found';
    if (who.has('inside-officer')) return 'insider';
    if (clue('herring') && !clue('plant') && !clue('pay')) return 'herring';
    if (clue('debunk') && !clue('plant')) return 'debunk';
    if (clue('pay') && [...who].some(id => IDX.officers[id])) return 'find';
    if (clue('plant')) return 'act';
    return [...who].some(id => IDX.officers[id]) ? 'police' : 'act';
  }
  // the lines the simulation stages when the bible has no beat for what happened (tokens: cop, partner, home, g1, boss, desk, h, o1..o4, res, suspect)
  const SIML = {
    'approach-door': { at: 'home:cop', steps: [
      ['knock-and-wait', ['g1'], [], '{g1} knocks at the door of {cop} and waits with a flat envelope.', 'paper:envelope'],
      ['hand-over', ['g1'], ['cop'], '{g1} hands {cop} the envelope and leaves without a word.', 'paper:envelope'],
      ['read-notice', ['cop'], [], '{cop} opens the envelope on the step, reads it, and folds it small.'] ] },
    'approach-street': { at: 'centre', steps: [
      ['walk-together', ['g1'], ['cop'], '{g1} falls into step beside {cop} at the end of the shift.'],
      ['chat', ['g1'], ['cop'], '{g1} says something low, and {cop} stops walking.'],
      ['walk', ['g1'], [], '{g1} walks on alone, hands in pockets.'] ] },
    'approach-comm': { at: 'home:cop', steps: [
      ['phone-call', ['cop'], [], 'At the door, comm, one side, {cop}: "Who is this? How do you have this number?"'],
      ['phone-call', ['cop'], [], 'Comm, one side, {cop}, quieter: "Leave my family out of it."'],
      ['stand', ['cop'], [], '{cop} stands on the step a long time after the call ends.'] ] },
    'confide-home': { at: 'home:cop', steps: [
      ['sit', ['cop'], ['home'], '{cop} sits on the step with {home} and talks low for a long time.'],
      ['hand-over', ['cop'], ['home'], '{cop} shows {home} a folded envelope.', 'paper:envelope'],
      ['hug', ['home'], ['cop'], '{home} puts an arm around {cop} and says: "Tell them. Tomorrow."'] ] },
    'confide-partner': { at: 'station', steps: [
      ['chat', ['cop'], ['partner'], '{cop} pulls {partner} aside by the station door: "Somebody came to my house."'],
      ['hand-over', ['cop'], ['partner'], '{cop} hands {partner} the envelope.', 'paper:envelope'],
      ['read-notice', ['partner'], [], '{partner} reads it twice and looks up at {cop}: "Then we use it."'] ] },
    'sting': { at: 'centre', steps: [
      ['wait-outside', ['g1'], [], '{g1} waits at the corner, an envelope ready, eyes on the street.'],
      ['hand-over', ['cop'], ['g1'], '{cop} takes the envelope from {g1}.'],
      ['arrest', ['partner'], ['g1'], '{partner} steps out of a doorway and takes hold of {g1}.'],
      ['escort', ['partner'], ['g1'], '{partner} walks {g1} toward the station, {cop} a step behind.'] ] },
    'leak': { at: 'centre', steps: [
      ['police-patrol', ['cop'], [], '{cop} walks past without scanning, then looks back over one shoulder.'],
      ['hand-over', ['cop'], ['g1'], '{cop} passes {g1} a folded sheet in the crowd and keeps walking.', 'paper:slip'] ] },
    'guilt': { at: 'home:cop', steps: [
      ['sit', ['cop'], [], ['{cop} sits on the step after the shift, comm in hand, and does not call anyone.', '{cop} stands at the door a long time with a hand on it, not going in.', '{cop} turns a folded envelope over and over, then puts it away.']],
      ['stand', ['cop'], [], '{cop} goes to the door, stops, and sits down again.'] ] },
    'flip': { at: 'station', steps: [
      ['hand-over', ['cop'], ['partner'], '{cop} sets a folded sheet in front of {partner}: "Read it before you say anything."', 'paper:slip'],
      ['read-notice', ['partner'], [], '{partner} reads it, then reads it again.'],
      ['walk-together', ['partner'], ['cop'], '{partner} walks {cop} to the desk sergeant without a word.'] ] },
    'exposed': { at: 'station', steps: [
      ['read-notice', ['desk'], [], '{desk} runs a finger down the evidence log and stops on one line.'],
      ['point', ['desk'], ['cop'], '{desk} calls {cop} over to the counter and points at the line.'],
      ['arrest', ['partner'], ['cop'], '{partner} takes the badge off {cop} and holds out a hand for the scanner.'],
      ['escort', ['partner'], ['cop'], '{partner} walks {cop} to the back of the station.'] ] },
    'home-argue': { at: 'home:cop', steps: [
      ['argue', ['home'], ['cop'], ['{home} and {cop} argue on the step: "You said you would be home by eight."', '{home} meets {cop} at the door with folded arms: "Again? Every night now?"', '{cop} and {home} argue in low voices on the step, then louder.']],
      ['walk', ['cop'], [], '{cop} walks back down the street alone.'] ] },
    'home-support': { at: 'home:cop', steps: [
      ['hand-over', ['home'], ['cop'], ['{home} meets {cop} at the door with a covered bowl kept warm.', '{home} waits up on the step with two cups of tea for when {cop} gets in.', '{home} takes the heavy bag off the shoulder of {cop} at the door.'], 'bowls:one'],
      ['hug', ['home'], ['cop'], '{home} holds on to {cop} a moment longer than usual.'] ] },
    'home-alone': { at: 'home:cop', steps: [
      ['eat', ['cop'], [], ['{cop} sits on the step outside, eating out of a paper bag, alone.', '{cop} comes home late and stands at the door a while before going in.', '{cop} eats standing at the corner stall, then walks home alone.'], 'food'] ] },
    'pair-good': { at: 'centre', steps: [
      ['eat', ['cop'], ['partner'], ['{cop} and {partner} split a bowl at the counter after the shift.', '{cop} and {partner} sit on the same bench and share a paper bag of buns.', '{cop} buys {partner} a tea without asking how {partner.he} takes it, and gets it right.']],
      ['chat', ['partner'], ['cop'], ['{partner} laughs at something {cop} says, the first time in days.', '{partner} tells {cop} a long story, hands going, and {cop} listens to all of it.', '{cop} and {partner} walk back to the station side by side, still talking.']] ] },
    'pair-bad': { at: 'centre', steps: [
      ['walk-together', ['cop'], ['partner'], ['{cop} and {partner} walk the beat a step apart, saying nothing.', '{cop} and {partner} take opposite sides of the street and do not cross.', '{partner} answers {cop} with one word and keeps walking.']],
      ['shrug', ['partner'], [], '{partner} writes in a notebook and does not show it to anyone.', 'paper:notebook'] ] },
    'find': { at: 'trace', steps: [
      ['search', ['cop'], [], ['{cop} crouches by the curb and picks up something small.', '{cop} stops, crouches, and pulls a folded scrap out from under a crate.', '{cop} lifts a torn label off the ground with two fingers.']],
      ['read-notice', ['cop'], [], '{cop} turns it over, reads it, and slips it into an evidence bag.', 'paper:slip'] ] },
    'find-record': { at: 'station', steps: [
      ['read-notice', ['desk'], [], '{desk} runs a finger down the scan log and stops at one line.'],
      ['point', ['desk'], ['cop'], '{desk} turns the screen toward {cop} and taps the line twice.'] ] },
    'stakeout': { at: 'target', steps: [
      ['stakeout', ['h'], [], '{h} stands across the way from the door, a paper cup going cold on the ledge.', 'cup'],
      ['stakeout', ['h'], [], '{h} is still there an hour later, eyes on the same door.'] ] },
    'raid-out': { at: 'station', steps: [
      ['walk-together', ['o1'], ['o2', 'o3', 'o4'], '{o1}, {o2}, {o3} and {o4} walk out of the station together before dawn.'] ] },
    'raid-in': { at: 'target', steps: [
      ['knock-and-wait', ['o1'], ['o2'], '{o1} knocks hard at the door while {o2} watches the street.'],
      ['enter', ['o1', 'o2'], [], '{o1} and {o2} go in through the door.'],
      ['wait-outside', ['o3', 'o4'], [], '{o3} and {o4} wait outside, one at each end of the building.'] ] },
    'raid-take': { at: 'target', steps: [
      ['arrest', ['o3'], ['suspect'], '{o3} brings {suspect} out of the building by the arm.'],
      ['escort', ['o3'], ['suspect'], '{o3} walks {suspect} toward the station in the gray light.'] ] },
    'raid-empty': { at: 'target', steps: [
      ['shrug', ['o2'], ['o1'], '{o2} comes back out shaking {o2.his} head: "Cleared out."'],
      ['carry', ['o1'], [], '{o1} carries out one empty crate, and nothing else.', 'crate'] ] },
    'cleanout': { at: 'target', steps: [
      ['carry', ['g1'], [], '{g1} carries a crate out of the building door in the dark.', 'crate'],
      ['carry', ['res'], [], '{res} follows with two bags and does not look back.', 'bag'],
      ['walk-together', ['g1'], ['res'], '{g1} and {res} walk away from the building fast.'] ] },
    'chase': { at: 'centre', steps: [
      ['run', ['g1'], [], '{g1} bolts across the open ground.'],
      ['run', ['cop'], ['g1'], '{cop} runs after {g1.him}, shouting for {g1.him} to stop.'],
      ['arrest', ['cop'], ['g1'], '{cop} catches {g1} and holds {g1.him} down until {g1.he} stops pulling.'],
      ['escort', ['cop'], ['g1'], '{cop} walks {g1} away in cuffs.'] ] },
    'arrest-boss': { at: 'centre', steps: [
      ['stakeout', ['h'], [], '{h} waits across from the place, a paper cup going cold.', 'cup'],
      ['arrest', ['h'], ['boss'], '{h} and {cop} step in and take {boss} by the arms.'],
      ['escort', ['h'], ['boss'], '{h} walks {boss} out past the people staring.'] ] },
    'arrest-miss': { at: 'centre', steps: [
      ['stakeout', ['h'], [], '{h} waits across the way all morning.'],
      ['shrug', ['h'], ['cop'], '{h} shrugs at {cop}: "Not today. Somebody told them."'] ] },
    'escape': { at: 'boss-home', steps: [
      ['carry', ['boss'], [], '{boss} leaves before dawn with a single bag.', 'duffel'],
      ['walk', ['boss'], [], '{boss} walks out of the neighborhood and does not look back.'] ] },
    'gone-notice': { at: 'centre', steps: [
      ['read-notice', ['cop'], [], '{cop} reads the sign taped up where {boss} used to be: "Closed until further notice."'] ] },
    'suspend': { at: 'station', steps: [
      ['read-notice', ['partner'], [], 'The screen shows a notice: "Officer {partner}, suspended pending review."'],
      ['stand', ['partner'], [], '{partner} stands in front of the screen and does not move.'] ] },
    'cleared': { at: 'station', steps: [
      ['post-feed', ['desk'], [], '{desk} posts a correction under the notice about {partner}.'],
      ['read-notice', ['partner'], [], '{partner} reads the corrected screen, then reads it again.'] ] },
    'demoted': { at: 'station', steps: [
      ['read-notice', ['cop'], [], 'The screen shows a notice: "Officer {cop}, reassigned to desk duty."'],
      ['sit', ['cop'], [], '{cop} sits at the far desk with a stack of paper and does not look up.'] ] },
  };

  function simInit(run){
    const s = run.sim = { v: 1, h: Math.floor(STORY.clock/60), h0: Math.floor(STORY.clock/60), cops: {}, bonds: {}, nodes: {}, traces: [], q: [], used: {}, staged: {}, turned: null, approached: null, framed: null,
      heat: 0, lowAt: false, ending: null, margin: 0, peak: 0, events: [], tipped: {}, plan: {}, day: -1, rival: null };
    // the boss: how careful, how far their reach, how much nerve, how set in their ways (a rival back from before is more careful, and knows the officers)
    const rv = (C.rivals || []).find(r => r.arc === run.arc && U(run.seed, 'rival') < .6);
    const careful = run.variant === 'careful';
    s.boss = rv ? Object.assign({}, rv.boss, { care: clamp(rv.boss.care + .15), back: (rv.back || 0) + 1 }) :
      { care: careful ? lerp(.55, .9, U(run.seed, 'care')) : lerp(.15, .5, U(run.seed, 'care')), reach: careful ? lerp(.5, .9, U(run.seed, 'reach')) : lerp(.2, .55, U(run.seed, 'reach')),
        nerve: lerp(.2, .9, U(run.seed, 'nerve')), habit: lerp(.4, .95, U(run.seed, 'habit')) };
    if (rv){ s.rival = rv; const back = rv.who && pOf(rv.who); if (back && !back.custody){ back.offDuty = false; for (const ps of C.past || []) ps.hidden = (ps.hidden || []).filter(x => x !== rv.who); run.cast.boss = rv.who; } C.rivals = C.rivals.filter(x => x !== rv); }
    // the operation: a runner and a flat always; a second runner and a second flat when the reach allows
    s.nodes = { g1: { slot: 'go-between-courier', lead: 0, thr: .5 }, safe1: { place: run.safehouse, lead: 0, thr: .55 }, boss: { slot: 'boss', lead: 0, thr: .8 } };
    if (s.boss.reach > .55){ s.nodes.g3 = { slot: 'go-between-bartender', lead: 0, thr: .55 }; s.nodes.safe2 = { place: null, lead: 0, thr: .6 }; }
    // the officers: who they are on a scale, at work and at home
    for (const slot of Object.keys(IDX.officers)){ const id = run.cast[slot], p = pOf(id), sp = p && STORY.sp(p); if (!sp) continue;
      const hist = (C.hist || {})[id] || {}, u = k => U(id, k, run.seed);
      const c = s.cops[slot] = { id, skill: clamp(lerp(.25, .85, U(id, 'skill')) + (slot === 'veteran-officer' ? .12 : slot === 'rookie-officer' ? -.08 : 0) + Math.min(.15, (hist.cases || 0)*.04)),
        dil0: clamp(lerp(.4, .9, U(id, 'dil')) + (slot === 'rookie-officer' ? .1 : 0)), integ: clamp(lerp(.35, .95, U(id, 'integ')) + (hist.demoted ? .15 : 0)),
        warmth: clamp(sp.temper.warm*.6 + sp.temper.outgoing*.4), stress: clamp(lerp(.1, .4, u('stress')) + (slot === 'burnout-officer' ? .3 : 0)),
        finds: 0, buried: 0, guilt: 0, state: 'ok', away: 0, remembers: rv && (rv.officers || []).includes(id) };
      c.home = homeOf(id); }
    for (const [a, b] of [['inside-officer', 'framed-officer'], ['veteran-officer', 'rookie-officer']]){ const A = s.cops[a], B = s.cops[b]; if (A && B) s.bonds[a] = s.bonds[b] = { v: clamp(.3 + .3*(A.warmth + B.warmth)/2 + .15*U(run.seed, a, 'bond')) }; }
    // the cast the lines need: who each officer lives with
    for (const [slot, c] of Object.entries(s.cops)) if (c.home.who) run.cast['home:' + slot] = c.home.who;
    s.tags = {}; for (const r of C.arcs.get(run.arc).rows) if (!r.cross.length && (r.variant === 'base' || (r.variant === 'careful' && s.boss.reach > .55))) (s.tags[tagRow(r)] = s.tags[tagRow(r)] || []).push(r.id);
    simNote(run, 'boss', JSON.stringify(Object.fromEntries(Object.entries(s.boss).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]))) + (rv ? ' (back again)' : ''));
  }
  // who an officer lives with and how it's going at home: a partner, family, or nobody; the quality is a spectrum (and the pressures a person carries weigh on it)
  function homeOf(id){
    const sp = STORY.sp(pOf(id)); if (!sp) return { kind: 'alone', q: .5, who: null };
    const live = sp.rels.filter(r => r.kind === 'cohabitant-of' && people.has(r.who)).map(r => r.who);
    const partner = sp.rels.find(r => r.kind === 'partner-of' && live.includes(r.who));
    const who = partner ? partner.who : live[0] || null, kind = partner ? 'partner' : who ? 'family' : 'alone';
    const q = clamp(lerp(.2, .9, U(id, 'homeq')) - sp.pressure.secret*.25 - sp.pressure.money*.15 + sp.temper.warm*.15);
    return { kind, q, who };
  }
  const sday = s => Math.floor((s.h - s.h0)/24) + 1;
  const simNote = (run, ...a) => { const s = run.sim; s.events.push('d' + sday(s) + ' ' + (((s.h % 24) + 24) % 24) + 'h ' + a.join(' ')); if (s.events.length > 160) s.events.shift(); note('sim', ...a); };
  // how well an officer works right now
  function focusOf(s, slot){
    const c = s.cops[slot]; if (!c) return 0;
    const sup = c.home.kind === 'alone' ? (c.warmth - .5)*.2 : (c.home.q - .5)*(c.home.kind === 'partner' ? .5 : .25);
    const dil = c.dil0*(1 - c.stress*.45);
    return clamp(c.skill*(.5 + .5*dil)*(1 - c.stress*.5)*(1 + sup) + (c.remembers ? .08 : 0));
  }
  // where the operation's acts happen, as a weight on how much each officer's shift covers it
  function cover(s, slot, at){
    const c = s.cops[slot]; if (!c || c.state === 'suspended' || c.state === 'fired' || c.away > 0) return 0;
    const lead = slot === 'inside-officer' || slot === 'framed-officer', second = slot === 'veteran-officer' || slot === 'rookie-officer', anyLead = Object.values(s.nodes).some(n => n.lead > .3);
    if (at === 'record') return slot === 'desk-sergeant' ? 1 : lead ? .25 : 0;
    if (slot === 'night-stakeout-officer') return s.plan.watch === at ? 1 : at === 'centre' ? .15 : .25;
    if (lead) return at === 'centre' ? .9 : .45;
    if (second) return anyLead || s.peak > .25 ? (at === 'centre' ? .5 : .8) : .1;
    return .12;   // (everyone else: on patrol, now and then near it)
  }
  // an act of the operation: who does it, where, and the traces it leaves
  function act(run, kind, node2, at){
    const s = run.sim, B = s.boss, n = Math.max(0, Math.round(.45 + (1 - B.care)*1.7 + B.habit*.5 + (U(run.seed, s.h, kind) - .5)*1.2));
    for (let k = 0; k < n; k++){
      const u = U(run.seed, s.h, kind, k), tk = u < .4 ? 'physical' : u < .65 ? 'witness' : u < .85 ? 'record' : 'pattern';
      let to = U(run.seed, s.h, kind, k, 'to') < .7 ? node2 : (U(run.seed, s.h, kind, k, 'b') < .5 ? 'boss' : 'g1');
      // a layer gone: the next one does that work now, and is the one seen doing it (no runner left: the boss carries it)
      for (const [a, b] of [['g1', 'g3'], ['g3', 'boss'], ['safe1', 'safe2'], ['safe2', 'boss']]) if (to === a && (!s.nodes[a] || s.nodes[a].burned)) to = s.nodes[b] && !s.nodes[b].burned ? b : 'boss';
      if (!s.nodes[to] || s.nodes[to].burned) continue;
      s.traces.push({ to, kind: tk, at: tk === 'record' ? 'record' : at, str: clamp(lerp(.25, .85, U(run.seed, s.h, kind, k, 's'))*(1 - B.care*.45)), h: s.h, gate: tk === 'pattern' ? 2 : 0 });
    }
    if (s.traces.length > 90) s.traces.splice(0, s.traces.length - 90);
  }
  function lead(run, to, amt, why){
    const s = run.sim, n = s.nodes[to]; if (!n || n.burned) return;
    const before = n.lead; n.lead = clamp(n.lead + amt); s.peak = Math.max(s.peak, n.lead);
    s.heat = clamp(s.heat + amt*(.45 + s.boss.nerve*.2)*(1.2 - s.boss.care*.4));
    if (Math.floor(before*10) !== Math.floor(n.lead*10)) simNote(run, 'lead', to, n.lead.toFixed(2), why || '');
  }
  // the hour: acts, finding, fading, what the police and the boss do about it
  function simHour(run){
    const s = run.sim, h = ((s.h % 24) + 24) % 24, B = s.boss, hb = HABIT[run.arc] ?? 12;
    if (s.ending) return;
    const low = s.heat > .75 && U(run.seed, s.h, 'low') < .6;   // (lying low: the operation slows)
    const near = (x, y) => h === Math.round(y) % 24;   // (this is that hour: a habit at 7:30 is the 8 o'clock hour)
    if (!low && near(h, hb)){ act(run, 'collect', 'g1', 'centre'); if (B.habit > .6) act(run, 'habit', 'boss', 'centre'); }
    if (!low && near(h, (hb + 2.5) % 24)) act(run, 'run', 'safe1', 'flat');
    if (!low && s.nodes.g3 && !s.nodes.g3.burned && near(h, 23) && s.h % 72 < 24) act(run, 'pass', 'g3', 'lift');
    if (!low && near(h, 2) && s.h % 48 < 24) act(run, 'count', 'safe1', 'flat');
    // finding: each trace, each officer on shift whose beat covers where it is
    const tunedOut = s.turned && s.cops[s.turned] && s.cops[s.turned].state === 'turned' ? s.turned : null;
    for (let i = s.traces.length - 1; i >= 0; i--){
      const t = s.traces[i];
      t.str *= t.kind === 'witness' ? .996 : t.kind === 'record' ? .99 : .985;   // (rain, cleaners, overwritten logs, people forgetting)
      if (t.str < .08){ s.traces.splice(i, 1); continue; }
      if (t.gate && s.traces.filter(x => x.found && x.at === t.at).length + (s.found || 0)*0 < t.gate && !s.nodes[t.to].lead) continue;   // (a pattern only shows to someone already looking)
      for (const slot of Object.keys(s.cops)){
        if (!ON_SHIFT(slot, h)) continue;
        const cv = cover(s, slot, t.at); if (!cv) continue;
        const pr = FIND*t.str*focusOf(s, slot)*cv + (s.bonds[slot] && ON_SHIFT(PAIR[slot], h) ? FIND*.3*s.bonds[slot].v*t.str : 0);
        if (U(run.seed, s.h, i, slot, 'find') >= pr) continue;
        s.traces.splice(i, 1);
        const c = s.cops[slot];
        if (slot === tunedOut){ c.buried++; simNote(run, 'buried', slot, t.kind); break; }   // (he saw it, and it went nowhere)
        let amt = t.str*LEADK;
        // what a pair shares: a strong bond and the find is worked by both; a cold one and half of it stays in one notebook
        const bd = s.bonds[slot]; if (bd) amt *= lerp(.7, 1.25, bd.v);
        if (tunedOut && PAIR[slot] === tunedOut && U(run.seed, s.h, i, 'eat') < .35){ amt *= .4; s.cops[tunedOut].buried++; simNote(run, 'evidence eaten', tunedOut); }
        c.finds++; if (bd) bd.v = clamp(bd.v + .004);
        lead(run, t.to, amt, slot + ' found ' + t.kind);
        if ((s.staged.find || 0) < 2) queue(run, { kind: 'find', slot, at: t.at, trace: t.kind });
        break;
      }
    }
    s.heat = clamp(s.heat - .0035);
    // the police act on what they know
    for (const [k, n] of Object.entries(s.nodes)){
      if (n.burned || s.plan[k] || n.lead < n.thr) continue;
      if (k === 'boss' && ((!Object.entries(s.nodes).some(([kk, m]) => kk !== 'boss' && m.burned) && n.lead < .95) || sday(s) < 9)) continue;   // (the boss last, with something in hand)
      s.plan[k] = { at: s.h + 18 + Math.floor(U(run.seed, k, 'p')*18), watch: k };   // (a stakeout first, then the move)
      s.plan.watch = k.startsWith('safe') ? 'flat' : k === 'g3' ? 'lift' : 'centre';
      queue(run, { kind: 'stakeout', node: k });
      simNote(run, 'plan', k, 'for hour', s.plan[k].at);
      // someone on the inside hears about it
      if (tunedOut && U(run.seed, k, s.h, 'tip') < .65){ s.tipped[k] = true; simNote(run, 'tipped', k); s.heat = clamp(s.heat + .1); }
    }
    for (const [k, pl] of Object.entries(s.plan)){
      if (k === 'watch' || !pl || pl.done || s.h < pl.at) continue;
      pl.done = true; move(run, k);
    }
    // the boss acts on the heat
    if (!s.lowAt && s.heat > .35){ s.lowAt = true; B.care = clamp(B.care + .1); simNote(run, 'boss goes careful'); }
    if (!s.moved && s.heat > .5 && s.nodes.safe1.lead > .3 && !s.nodes.safe1.burned){ s.moved = true; s.nodes.safe1.lead *= .4; queue(run, { kind: 'cleanout', node: 'safe1', hour: 3, place: run.safehouse }); newFlat(run); simNote(run, 'boss moves the flat'); }
    if (!s.approached && s.heat > .42 && B.reach*B.nerve > .18 && sday(s) >= 4) approach(run);
    if (!s.witness && s.heat > .55 && run.cast.informant){ s.witness = { gone: s.h }; run.flags['inf:missing'] = true; applyPeople(); queue(run, { kind: 'missing' }); simNote(run, 'the witness drops out of sight'); }
    if (s.witness && !s.witness.back && s.h - s.witness.gone > 72){   // the witness, found by whoever looks hardest
      const f = focusOf(s, 'veteran-officer'); if (U(run.seed, s.h, 'wit') < .03*f){ s.witness.back = s.h; run.flags['inf:talking'] = true; applyPeople(); lead(run, 'boss', .22, 'the witness talks'); queue(run, { kind: 'found' }); } }
    if (tunedOut && !s.framed && s.heat > .62){ const pt = PAIR[tunedOut]; if (focusOf(s, pt) > .4){ s.framed = { who: pt, at: s.h }; s.cops[pt].state = 'suspended'; run.flags[IDX.officers[pt] + ':suspended'] = true; applyPeople(); s.cops[pt].stress = clamp(s.cops[pt].stress + .2); queue(run, { kind: 'suspend', slot: pt }); simNote(run, 'frame', pt); } }
    if (s.framed && !s.framed.cleared && s.h - s.framed.at > 36){ const f = Math.max(focusOf(s, 'desk-sergeant'), focusOf(s, 'veteran-officer')); if (U(run.seed, s.h, 'clear') < .025*f){ s.framed.cleared = s.h; s.cops[s.framed.who].state = 'ok'; run.flags[IDX.officers[s.framed.who] + ':cleared'] = true; applyPeople(); queue(run, { kind: 'cleared', slot: s.framed.who }); lead(run, 'boss', .12, 'the frame comes apart'); } }
    if (!s.running && s.heat > .8 + (1 - B.care)*.12 && sday(s) >= 9){ s.running = s.h + Math.round(lerp(72, 30, B.care)); simNote(run, 'the boss gets ready to run, hour', s.running); }   // (a careless boss is slow to see it coming and slow to go; a careful one has the exit ready)
    if (s.running && s.h >= s.running && !s.ending) end(run, 'escaped');
    if (sday(s) > 32 && !s.ending) end(run, 'cold');
  }
  // a new flat for the operation, away from the one it left (the doors of the case move with it)
  function newFlat(run){
    const old = places.get(run.safehouse), ctr = places.get(run.centre) || old; if (!ctr) return;
    const homes = [...places.values()].filter(pl => pl.cell && pl.id !== run.safehouse && pl.cell.sections.some(sc => sc.zone === 'low') && [...people.values()].some(p => p.home === pl.id && ordinary(p)));
    homes.sort((a, b) => Math.hypot(a.x - ctr.x, a.z - ctr.z) - Math.hypot(b.x - ctr.x, b.z - ctr.z));
    const pick = homes[3 + H(run.seed, 'flat2') % Math.max(1, Math.min(6, homes.length - 3))] || homes[0]; if (pick) run.safehouse = pick.id;
    delete run.cast[run.arc + '/extra:resident']; delete run.cast[run.arc + '/extra:partner'];   // (new doors, new people at them)
  }
  // a move by the police on one part of the operation: a raid on a flat, an arrest of a runner, the boss
  function move(run, k){
    const s = run.sim, n = s.nodes[k], tip = !!s.tipped[k];
    const ok = U(run.seed, k, s.h, 'move') < clamp(.55 + .4*(n.lead - n.thr)/(1 - n.thr) - (tip ? .6 : 0) - (k === 'boss' && s.running ? .15 : 0));
    simNote(run, 'move', k, ok ? 'works' : 'fails', tip ? '(tipped)' : '');
    if (k === 'boss'){
      if (ok){ queue(run, { kind: 'arrest-boss' }); end(run, 'arrested'); }
      else { queue(run, { kind: 'arrest-miss' }); s.heat = clamp(s.heat + .25); n.lead = clamp(n.lead - .2); s.plan.boss = null; for (const c of Object.values(s.cops)) c.stress = clamp(c.stress + .06); }
      return;
    }
    const flags = ok && (k === 'g1' || k === 'g3') ? [k + ':arrested'] : [];   // (held once the raid has played, or its time has passed)
    if (k.startsWith('safe')){
      if (tip && !s.moved) queue(run, { kind: 'cleanout', node: k, hour: 3, place: run.safehouse });
      queue(run, { kind: 'raid', node: k, ok, hour: 4, place: run.safehouse });
    } else queue(run, { kind: ok && U(run.seed, k, s.h, 'chase') < .4 ? 'chase' : 'raid', node: k, ok, hour: 4, flags });
    if (ok){ n.burned = true; lead(run, 'boss', .2*(1 - s.boss.care*.4), k + ' taken'); s.heat = clamp(s.heat + .2);
      for (const c of Object.values(s.cops)) c.stress = clamp(c.stress - .06); }
    else { n.lead = clamp(n.lead - .25); s.plan[k] = null; s.heat = clamp(s.heat + .1); for (const c of Object.values(s.cops)) c.stress = clamp(c.stress + .05); }
  }
  // leaning on a cop: who has the most to lose, and what they do about it
  function approach(run){
    const s = run.sim; s.approached = true;
    const lev = slot => { const c = s.cops[slot], sp = STORY.sp(pOf(c.id)); if (!sp) return 0;
      return clamp((c.home.kind !== 'alone' ? .35 + sp.pressure.secret*.4 : 0) + sp.pressure.money*.35 + (c.home.kind === 'alone' ? sp.pressure.loneliness*.3 : 0) + (1 - c.integ)*.2); };
    const pick = ['inside-officer', 'framed-officer'].filter(x => s.cops[x]).sort((a, b) => lev(b) - lev(a))[0]; if (!pick) return;
    const c = s.cops[pick], L = lev(pick), bond = s.bonds[pick] ? s.bonds[pick].v : .4;
    const close = c.home.kind === 'alone' ? 0 : c.home.q;
    const score = c.integ*.55 + close*.35 + bond*.35 + c.warmth*.1 - L*.55 + (U(run.seed, 'resist') - .5)*.2;
    s.approached = { who: pick, lev: +L.toFixed(2), score: +score.toFixed(2), h: s.h };
    const how = c.home.kind !== 'alone' && L > .5 ? 'approach-door' : U(run.seed, 'how') < .5 ? 'approach-comm' : 'approach-street';
    queue(run, { kind: how, slot: pick });
    simNote(run, 'approach', pick, 'leverage', L.toFixed(2), 'score', score.toFixed(2));
    if (score > .42){   // tells: home first if home is somewhere to tell it, then the partner; the boss's next message is the trap
      c.state = 'told'; if (close > .45) queue(run, { kind: 'confide-home', slot: pick, after: 6 });
      queue(run, { kind: 'confide-partner', slot: pick, after: 14 });
      if (s.bonds[pick]) s.bonds[pick].v = clamp(s.bonds[pick].v + .15);
      s.sting = { at: s.h + 30 }; simNote(run, pick, 'tells');
    } else if (score > .3){ c.stress = clamp(c.stress + .15); if (s.bonds[pick]) s.bonds[pick].v = clamp(s.bonds[pick].v - .05); simNote(run, pick, 'says no, and tells nobody'); }
    else { c.state = 'turned'; s.turned = pick; s.remap = pick === 'framed-officer' ? { 'inside-officer': 'framed-officer', 'framed-officer': 'inside-officer' } : null; s.heat = clamp(s.heat - .1); simNote(run, pick, 'turns'); }
  }
  // the day: stress, home, the pair, guilt, exposure; the small moments that show it
  function simDay(run){
    const s = run.sim;
    for (const [slot, c] of Object.entries(s.cops)){
      if (c.state === 'fired') continue;
      if (c.away > 0) c.away--;
      c.home = homeOf(c.id);
      if (c.home.who) run.cast['home:' + slot] = c.home.who;
      const sup = c.home.kind === 'alone' ? 0 : (c.home.q - .5)*2*(c.home.kind === 'partner' ? 1 : .5);
      const going = (s.peak > .3 ? -.02 : .01) + (c.state === 'suspended' ? .05 : 0) + (c.state === 'turned' ? .03 : 0);
      c.stress = clamp(c.stress + going - .035*sup - .01 + (slot === 'burnout-officer' ? .01 : 0));
      // home shows it, now and then
      const r = U(run.seed, s.h, slot, 'home');
      if ((slot === 'inside-officer' || slot === 'framed-officer' || slot === 'veteran-officer' || slot === 'rookie-officer') && r < .22){
        if (c.home.who && c.stress > .5 && sup < 0) queue(run, { kind: 'home-argue', slot });
        else if (c.home.who && sup > .2) queue(run, { kind: 'home-support', slot });
        else if (!c.home.who && r < .08) queue(run, { kind: 'home-alone', slot });
      }
      if (c.state === 'turned'){
        c.guilt = clamp(c.guilt + .02 + c.integ*.07 + (c.home.kind === 'partner' ? c.home.q*.03 : 0) + (s.bonds[slot] ? s.bonds[slot].v*.03 : 0));
        if (U(run.seed, s.h, slot, 'leak') < .3) queue(run, { kind: 'leak', slot });
        if (c.guilt > .35 && U(run.seed, s.h, slot, 'g') < .3) queue(run, { kind: 'guilt', slot });
        if (c.guilt > .5 && U(run.seed, s.h, slot, 'flip') < .5){ c.state = 'flipped'; queue(run, { kind: 'flip', slot }); lead(run, 'boss', .3, slot + ' talks'); lead(run, 'g1', .2, slot + ' talks'); s.heat = clamp(s.heat + .25); simNote(run, slot, 'flips back'); continue; }
        const pt = PAIR[slot], pf = s.cops[pt] && s.cops[pt].state === 'ok' ? focusOf(s, pt) : 0;
        if (U(run.seed, s.h, slot, 'exp') < pf*.05*c.buried + focusOf(s, 'desk-sergeant')*.015*c.buried){ c.state = 'fired'; queue(run, { kind: 'exposed', slot }); lead(run, 'boss', .15, 'the inside man exposed'); simNote(run, slot, 'exposed'); run.flags[(IDX.officers[slot] || 'A') + ':arrested'] = true; applyPeople(); }
      }
    }
    // the pairs: up with good days and warmth, down with secrets and stress
    for (const [a, b] of [['inside-officer', 'framed-officer'], ['veteran-officer', 'rookie-officer']]){
      const bd = s.bonds[a]; if (!bd) continue; const A = s.cops[a], Bc = s.cops[b];
      bd.v = clamp(bd.v + .012*((A.warmth + Bc.warmth)/2 - .45) - .01*((A.stress + Bc.stress)/2 - .4) - (A.state === 'turned' || Bc.state === 'turned' ? .02 : 0));
      if (U(run.seed, s.h, a, 'pair') < .15) queue(run, { kind: bd.v > .6 ? 'pair-good' : bd.v < .3 ? 'pair-bad' : null, slot: a });
    }
    if (s.sting && s.h >= s.sting.at && !s.sting.done){ s.sting.done = true; const ok = !s.nodes.g1.burned; if (ok){ s.nodes.g1.burned = true; run.flags['g1:arrested'] = true; applyPeople(); lead(run, 'boss', .3, 'the sting'); queue(run, { kind: 'sting', slot: s.approached.who }); } }
  }
  function end(run, how){
    const s = run.sim; if (s.ending) return;
    const bossLead = s.nodes.boss.lead;
    s.ending = how; s.margin = how === 'arrested' ? +(s.heat).toFixed(2) : +(bossLead/s.nodes.boss.thr).toFixed(2);   // (arrested: how hot it ran; escaped: how close the police came)
    simNote(run, 'ending', how, 'margin', s.margin);
    if (how === 'arrested'){ run.flags['boss:arrested'] = true;
      // the boss talks: anyone still on the inside comes out with it
      if (s.turned && s.cops[s.turned].state === 'turned'){ s.cops[s.turned].state = 'fired'; queue(run, { kind: 'exposed', slot: s.turned, after: 20 }); run.flags[(IDX.officers[s.turned] || 'A') + ':arrested'] = true; } }
    if (how === 'escaped'){ run.flags['boss:escaped'] = true; queue(run, { kind: 'escape' }); queue(run, { kind: 'gone-notice', after: 30 });
      C.rivals = (C.rivals || []).concat([{ arc: run.arc, boss: s.boss, who: run.cast.boss, officers: Object.values(s.cops).map(c => c.id), margin: s.margin, back: s.boss.back || 0 }]); }
    if (how === 'cold') queue(run, { kind: 'gone-notice', after: 6 });
    // what each officer takes away from it: experience, and a demotion for one who sold out and came back
    C.hist = C.hist || {};
    for (const [slot, c] of Object.entries(s.cops)){ const hh = C.hist[c.id] = C.hist[c.id] || { cases: 0 }; hh.cases++; if (c.state === 'flipped'){ hh.demoted = true; queue(run, { kind: 'demoted', slot, after: 30 }); } if (c.state === 'fired') hh.fired = true; }
    applyPeople(); run.closedAt = day() + 1;
  }

  /* ---------- staging what the simulation says happened ---------- */
  // a queue of things to show: each staged when its people are free (a raid at its hour), dropped if it can't be shown in half a day
  function queue(run, e){
    const s = run.sim; if (!e.kind) return;
    e.from = s.h + (e.after || 0); e.until = e.from + (e.hour !== undefined ? 54 : 14); e.id = e.kind + ':' + s.h + ':' + s.q.length;
    s.staged[e.kind] = (s.staged[e.kind] || 0) + 1;
    s.q.push(e);
  }
  function flagsOf(run, e){ if (!e.flags || e.flagged) return; e.flagged = true; for (const f of e.flags) run.flags[f] = true; applyPeople(); }
  // the role tokens of the sim's own lines, as the run's cast keys
  function tokens(run, e){
    const s = run.sim, cop = e.slot || s.turned || 'inside-officer';
    const team = ['night-stakeout-officer', 'veteran-officer', 'rookie-officer', 'desk-sergeant', 'framed-officer', 'inside-officer', 'family-caller-officer', 'burnout-officer']
      .filter(k => s.cops[k] && s.cops[k].state !== 'fired' && s.cops[k].state !== 'suspended' && k !== s.turned);
    const runner = e.node === 'g3' ? 'go-between-bartender' : 'go-between-courier', taken = (s.nodes.g1 && s.nodes.g1.burned && runner === 'go-between-courier' && e.kind !== 'raid' && e.kind !== 'chase');
    const t = { cop: e.kind === 'find' && cop === 'desk-sergeant' ? 'inside-officer' : cop, partner: PAIR[cop] || 'desk-sergeant', home: 'home:' + cop, g1: taken ? (s.nodes.g3 && !s.nodes.g3.burned ? 'go-between-bartender' : 'boss') : runner, boss: 'boss', desk: 'desk-sergeant', h: 'night-stakeout-officer',
      res: run.arc + '/extra:resident', suspect: e.node === 'g3' ? 'go-between-bartender' : e.node && e.node.startsWith('safe') ? run.arc + '/extra:resident' : 'go-between-courier' };
    team.slice(0, 4).forEach((k, i) => t['o' + (i + 1)] = k);
    if (e.kind === 'find' && !['desk-sergeant'].includes(cop) && e.trace === 'record'){ t.cop = cop; }
    return t;
  }
  function anchorFor(run, e, at){
    const [cx, cz] = centre(run), s = run.sim;
    const target = () => { const k = e.node || (s.plan.watch === 'flat' ? 'safe1' : null); if (k && k.startsWith('safe')) return doorAnc(places.get(e.place || run.safehouse)); if (k === 'g3') return anchorOf(run, run.arc, { people: [], steps: [] }, 'lift'); return anchorOf(run, run.arc, { people: [], steps: [] }, CENTRE_AT[run.arc]); };
    switch (at){
      case 'station': return doorAnc(places.get(run.station));
      case 'centre': return anchorOf(run, run.arc, { people: [], steps: [] }, CENTRE_AT[run.arc]);
      case 'target': return target();
      case 'trace': return e.at === 'flat' ? doorAnc(places.get(run.safehouse)) : e.at === 'lift' ? anchorOf(run, run.arc, { people: [], steps: [] }, 'lift') : anchorOf(run, run.arc, { people: [], steps: [] }, CENTRE_AT[run.arc]);
      case 'boss-home': { const p = pOf(run.cast.boss); return p ? doorAnc(places.get(p.home)) : null; }
      default: if (at.startsWith('home:')){ const k = tokens(run, e)[at.slice(5)], p = pOf(run.cast[k]); return p ? doorAnc(places.get(p.home)) : null; }
    }
    return null;
  }
  // an event as a moment the scene engine can play: a beat of the bible if one fits, else the sim's own lines
  function momentFor(run, e){
    const s = run.sim, BIBLE = { find: 'find', missing: 'missing', found: 'found', suspend: 'suspend', cleared: 'cleared', leak: 'insider' };
    const tag = BIBLE[e.kind];
    if (tag && s.tags[tag] && !(e.kind === 'find' && e.trace === 'record')){
      const A = C.arcs.get(run.arc);
      for (const rid of s.tags[tag]){
        if (s.used[rid]) continue;
        const row = A.rows.find(r => r.id === rid); if (!row) continue;
        const ppl = new Set(row.moments.flatMap(m => m.people));
        if (ppl.has('inside-officer') && !s.turned) continue;   // (the inside man's beats only when there is one)
        if ((tag === 'suspend' || tag === 'cleared') && !s.framed) continue;
        s.used[rid] = true; return { row, moments: row.moments };
      }
    }
    const L = SIML[e.kind] || (e.kind === 'raid' ? null : null);
    if (e.kind === 'raid'){   // three moments: out of the station, in at the door, and what comes out
      return { sim: true, parts: [['raid-out', 'station'], ['raid-in', 'target'], [e.ok ? 'raid-take' : 'raid-empty', 'target']] };
    }
    if (e.kind === 'find' && e.trace === 'record') return { sim: true, parts: [['find-record', 'station']] };
    if (!L) return null;
    return { sim: true, parts: [[e.kind, L.at]] };
  }
  // what gives way to what: the turns of the case over the small moments around it
  const PRIO = { find: 0, 'find-record': 0, 'pair-good': 0, 'pair-bad': 0, 'home-alone': 0, 'home-support': 0, 'home-argue': 0, guilt: 1, leak: 1, stakeout: 1,
    'approach-door': 3, 'approach-street': 3, 'approach-comm': 3, 'confide-home': 3, 'confide-partner': 3, sting: 3, raid: 3, cleanout: 3, chase: 3, 'arrest-boss': 3, 'arrest-miss': 2, exposed: 3, flip: 3, escape: 3, suspend: 2, cleared: 2, demoted: 2, 'gone-notice': 1 };
  function simMoment(run, e, key, at, idx){
    const L = SIML[key], t = tokens(run, e); if (!L) return null;
    const map = x => t[x] || x;
    const steps = L.steps.map(([d, who, wit, line0, held], j) => { const line = Array.isArray(line0) ? line0[H(e.id, idx, j, 'v') % line0.length] : line0; return { do: d, who: who.map(map), with: wit.map(map), held, line: line.replace(/\{([a-z0-9]+)((?:\.(?:he|him|his))?)\}/g, (m, k, pr) => '{' + map(k) + pr + '}') }; });
    const ppl = []; for (const st of steps) for (const id of [...st.who, ...st.with]) if (!ppl.includes(id)) ppl.push(id);
    return { id: e.id + '.' + idx, day: null, hour: null, people: ppl, steps, anc: () => anchorFor(run, e, at), prio: PRIO[e.kind] ?? 1 };
  }
  // the queue, every few minutes: the next thing whose time it is
  function simStage(run){
    const s = run.sim, h = Math.floor(STORY.clock/60);
    let busy = Object.keys(run.at).length;
    for (let i = 0; i < s.q.length && busy < 3; i++){
      const e = s.q[i];
      if (e.wait) continue;   // (being played now)
      if (h < e.from) continue;
      if (h > e.until && !e.wait){ simNote(run, e.k ? 'shown in part' : 'not shown', e.kind); flagsOf(run, e); s.q.splice(i--, 1); continue; }
      if (e.hour !== undefined && !e.k && Math.abs(((hourNow() - e.hour + 36) % 24) - 12) < 10 && !C.now) continue;   // (raids before dawn, give or take two hours)
      if (!e.mom){ const m = momentFor(run, e); if (!m){ s.q.splice(i--, 1); continue; } e.mom = m; e.k = 0; }
      const M = e.mom, n = M.sim ? M.parts.length : M.moments.length;
      if (e.k >= n){ s.q.splice(i--, 1); continue; }
      const m = M.sim ? simMoment(run, e, M.parts[e.k][0], M.parts[e.k][1], e.k) : M.moments[e.k];
      if (!m){ e.k++; continue; }
      const row = M.sim ? { id: e.id, where: '', moments: [m], sets: [] } : M.row;
      const why = stage(run, M.sim ? 'sim' : run.arc, row, m, () => { e.k++; e.wait = false; e.until = Math.max(e.until, Math.floor(STORY.clock/60) + 10); });
      if (why){ if (e.why !== why){ e.why = why; note('sim wait', e.kind, why); } if (why === 'no place' || why === 'nothing' || why === 'nobody'){ e.k++; } continue; }
      e.wait = true; s.q.splice(i, 1); s.q.unshift(e); busy++;   // (it stays at the head until its parts are played)
      break;
    }
    // a played part moves the event on; once all its parts are played it leaves the queue
    for (let i = s.q.length - 1; i >= 0; i--){ const e = s.q[i]; if (e.mom && !e.wait && e.k >= (e.mom.sim ? e.mom.parts.length : e.mom.moments.length)){ flagsOf(run, e); s.q.splice(i, 1); } }
  }
  function simTick(run){
    if (!run.sim) simInit(run);
    const s = run.sim, now = Math.floor(STORY.clock/60);
    let n = 0;
    while (s.h < now && n++ < 72){ s.h++; if (((s.h % 24) + 24) % 24 === 6){ simDay(run); s.staged = {}; } simHour(run); }   // (a long gap: caught up an hour at a time, three days at most)
    if (s.h < now) s.h = now;
    if (!C.noStage) simStage(run);
  }
  // (tests: the simulation alone, n hours on, nothing staged)
  C.simFast = n => { const run = C.run; if (!run) return null; if (!run.sim) simInit(run); const s = run.sim; for (let k = 0; k < n && !s.ending; k++){ s.h++; if (((s.h % 24) + 24) % 24 === 6){ simDay(run); s.staged = {}; } simHour(run); } return s.ending; };
  C.sim = () => { const run = C.run, s = run && run.sim; if (!s) return null;
    return { day: sday(s), heat: +s.heat.toFixed(2), boss: s.boss, nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, (n.burned ? 'burned ' : '') + n.lead.toFixed(2)])),
      cops: Object.fromEntries(Object.entries(s.cops).map(([k, c]) => [IDX.officers[k], { focus: +focusOf(s, k).toFixed(2), stress: +c.stress.toFixed(2), home: c.home.kind + ' ' + c.home.q.toFixed(2), state: c.state, finds: c.finds }])),
      bonds: Object.fromEntries(Object.entries(s.bonds).map(([k, b]) => [IDX.officers[k], +b.v.toFixed(2)])), traces: s.traces.length, queue: s.q.map(e => e.kind), ending: s.ending, margin: s.margin, approached: s.approached, events: s.events.slice(-25) }; };

  /* ---------- every frame (from story.js) ---------- */
  let next = 0;
  let SOON = new Set();
  C.soon = id => SOON.has(id);
  C.tick = () => {
    if (!C.on || !IDX || !STORY.on) return;
    if (STORY.clock < next) return; next = STORY.clock + 4;   // (every few game minutes)
    const run = C.run;
    if (!run){
      if (C.paused) return;
      const last = C.lastEnd ?? -99; if (day() - last < 3) return;   // (a few quiet days between cases)
      // a boss case this city has the places for, not the one just played if there's another
      const ok = BOSS_ARCS.filter(a => !canRun(a)), fresh = ok.filter(a => a !== C.lastArc), pool = fresh.length ? fresh : ok;
      if (!pool.length){ C.dbg.why = canRun(BOSS_ARCS[0]); return; }
      start(pool[H(day(), 'pick') % pool.length]); return;
    }
    if (run.closedAt !== undefined && day() - run.closedAt >= 2){ SOON = new Set(); endRun(); return; }
    const cd = caseDay(); if (cd < 1) return;
    const h = hourNow();
    let staged = Object.keys(run.at).length;
    const soon = new Set();
    simTick(run);
    for (const arc of run.arcs) for (const row of (arc === run.arc ? [] : rowsFor(run, arc))){
      for (let k = 0; k < row.moments.length; k++){
        const m = row.moments[k]; if (run.done[m.id]) continue;
        if (k > 0 && !run.done[row.moments[k - 1].id]) break;
        if (run.at[m.id]) break;
        const d0 = m.day ?? row.days[0], d1 = row.days[1];
        if (cd > d1){ run.done[m.id] = 'missed'; note('missed', m.id); if (k === row.moments.length - 1) setRow(run, row); continue; }
        if (cd < d0) break;
        const want = hourOf(run, arc, row, m), dh = ((h - want) % 24 + 24) % 24;
        if (dh > 22.5 || dh <= 3) for (const id of m.people){ const q = run.cast[slotOf(arc, id)]; if (q) soon.add(q); }   // (due within the next hour and a half, or now)
        if (dh > 3 && !C.now) break;   // (its hour, give or take: it starts from a quarter before it, up to three hours after)
        if (staged >= 3) break;
        const why = stage(run, arc, row, m);
        if (why){ if (m._why !== why) note('wait', m.id, why); m._why = why; if (why === 'no place' || why === 'nothing'){ run.done[m.id] = why; note('skip', m.id, why); if (k === row.moments.length - 1) setRow(run, row); continue; } break; }
        staged++; break;
      }
    }
    SOON = soon;
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
    C.past = (C.past || []).concat([{ arc: run.arc, held: Object.values(run.cast).filter(id => { const p = pOf(id); return p && p.custody; }), hidden: run.flags['boss:escaped'] ? [run.cast.boss] : [] }]);
    for (const id of C.past[C.past.length - 1].hidden){ const p = pOf(id); if (p) p.offDuty = true; }   // (gone from the streets: a rival, for another time)
    C.lastArc = run.arc; C.run = null; C.lastEnd = day(); save();
  }

  /* ---------- keeping it ---------- */
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({ v: 1, run: C.run && Object.assign({}, C.run, { at: {} }), lastEnd: C.lastEnd, lastArc: C.lastArc, rivals: C.rivals || [], hist: C.hist || {}, past: C.past || [], paused: !!C.paused })); } catch (e){} }
  function restore(){
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d || d.v !== 1) return;
      C.run = d.run || null; if (C.run && !C.run.tries) C.run.tries = {}; C.lastEnd = d.lastEnd; C.lastArc = d.lastArc; C.rivals = d.rivals || []; C.hist = d.hist || {}; C.past = d.past || []; C.paused = !!d.paused;
      // (people come after the city loads: put the run on them once they're there)
      const wait = () => { if (typeof pplReady !== 'undefined' && pplReady && people.size){ applyPeople(); for (const ps of C.past){ for (const id of ps.held){ const p = pOf(id); if (p) p.custody = true; } for (const id of ps.hidden || []){ const p = pOf(id); if (p && !(C.run && C.run.cast.boss === id)) p.offDuty = true; } } } else setTimeout(wait, 500); }; wait();
    } catch (e){}
  }
  addEventListener('beforeunload', save);

  /* ---------- for tests and the curious ---------- */
  C.start = (arc, opts) => start(arc || BOSS_ARCS[0], Object.assign({ now: true }, opts || {}));
  C.stop = () => { if (C.run){ for (const sc of [...STORY.scenes]) if (sc.s.id.startsWith('case.')) STORY.endScene(sc, 'stopped'); for (const id of Object.values(C.run.cast)){ const p = pOf(id); if (p){ p.copShift = undefined; p.custody = undefined; p.offDuty = undefined; } } } C.run = null; save(); };
  C.state = () => { const run = C.run; if (!run) return { why: C.dbg.why, lastEnd: C.lastEnd, rivals: (C.rivals || []).length };
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
