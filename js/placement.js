// Neon Terrarium: Planner mode, the placement puzzle (owner, Nov 4). Opened on its own link, index.html#plan, with cities of its own (saveguard.js keeps
// them apart from the sandbox's: nothing converts either way). No money and no build limits: any building can go anywhere, and the puzzle is where.
// Every building sends out effects in a radius (power, haze, noise, safety, a watched feeling, jobs, things to do) and homes judge where they stand:
//   fill = levels x needs x support x (0.4 + 0.6 x comfort)
// needs: powered and reachable; support: the share of its people with a job in reach (capacity shared between everyone in reach); comfort: five dials
// (Quiet, Air, Safety, Ease, Life), 0.7 x their average + 0.3 x the lowest. Only supported residents count toward the next tier, and each tier also asks
// for a number of thriving homes (every dial at 0.7 or more), so a field of half-empty towers can't progress on size alone.
// Tiers unlock one new tool and at most one new thing to read: Air and Life from the start, Noise with the metro, Safety and the watched feeling with
// police. A new dial fades in over twenty minutes so reaching a tier never empties homes. Crime is a few hotspots that form where streets are busy at night
// and nobody watches, and drift away from police, losing strength each move. The design document: claude/placement-mode.md (and the owner's Claude doc).
// Loads after the world, megastructures, transit, input and economy.js (it wraps the build functions) and before main.js.
'use strict';
const PLAN = (() => {
  const E = { on: false };
  const ON = typeof NT_PLAN !== 'undefined' && NT_PLAN;
  if (!ON) return Object.assign(E, { dark: () => null, coastOpen: () => true, tapInfo: () => false, menuText: () => null, transit: () => null, megaClick: () => false });
  E.on = true;
  document.documentElement.classList.add('plan');
  const KEY = 'neonIsland.plan';
  const TOUCHY = typeof TOUCH !== 'undefined' && TOUCH.on;
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
  function freshState(){ return { v: 1, tier: 0, fresh: true, occ: {}, best: {}, forks: {}, tut: { step: 0, done: false, v: 2 }, hints: {}, intro: {}, dialAt: {}, wind: Math.random()*Math.PI*2, crime: { spots: [], since: 0, n: 0, firstAt: 0 }, peak: { res: 0, thr: 0 }, corp: false, firstZ: {} }; }
  st = Object.assign(freshState(), st || {});
  if (!st.tut || !st.tut.v){ st.tut = { step: 0, done: !!(st.tut && st.tut.done), v: 2 }; }   // (a city from the first tutorial: its step numbers mean nothing now)
  // (a city from before Quiet and Safety counted from the start: they fade in, as a newly opened comfort does)
  if (!st.fresh){ if (!st.dialAt.quiet && st.tier < 2) st.dialAt.quiet = Date.now(); if (!st.dialAt.safety && st.tier < 3) st.dialAt.safety = Date.now(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  addEventListener('pagehide', save); addEventListener('beforeunload', save);

  /* ---------- the numbers ---------- */
  const P = {
    ppl: { R: 24, L: 9 }, work: .5,                       // residents per level; the share of them who need a job
    jobs: { I: 30, C: 10, K: 14 },                         // jobs per level
    shop: 70,                                              // residents a commercial building's first level serves
    walk: 8, shopWalk: 5, stationR: 2, stationJobR: 3,     // reach, in plots (Chebyshev)
    coreReach: 9, coreWide: 12, edge: 2, scrubDrain: 1.1,
    coreCap: 60, draw: { R: 1, L: 1.5, C: 1.5, I: 2, K: 2.5 },   // a core powers this much; each level draws this, taller buildings a little more per level  // a core's reach; the last 2 plots flicker (80%); each scrubber on a core drains about a plot, less each time, never below half
    floorSupport: .3, refit: 20,                            // seconds a megastructure takes to switch how it runs
    shadow: 3, crimeR: 3,                                  // a tall building shades haze for this many plots behind it; crime reaches as far
    shopTall: [.75, .45],                                  // the second commercial level draws this share of the first's visitors, each one above that the second number
    dialFadeMs: 20*60e3,                                   // a new dial fades in over twenty minutes (time to answer it before it bites)
    fillUp: .07, fillDown: .05, fillStep: .012,            // moving in and out, per second
    smooth: 20,                                            // seconds: the counts the tiers read are smoothed this much
  };
  // the tiers: supported residents and thriving homes. Each opens tools; dials and lenses open with the thing that makes them
  const TIERS = [
    { name: 'Unlisted', res: 0, thr: 0 },
    { name: 'Settled', res: 150, thr: 4, opens: ['radio', 'scrubber', 'square', 'wirenest'] },
    { name: 'Connected', res: 400, thr: 10, opens: ['metro', 'market', 'foundry'] },
    { name: 'Patrolled', res: 750, thr: 20, opens: ['police', 'bathhouse'], dial: 'ease' },
    { name: 'Nightfall', res: 1100, thr: 32, opens: ['club', 'pylons'] },
    { name: 'Secured', res: 1450, thr: 45, opens: ['perimeter', 'drones', 'lidar'] },
    { name: 'Uptown', res: 1850, thr: 60, opens: ['luxury', 'corps', 'greenhouse'] },
    { name: 'Skyline', res: 2400, thr: 80, opens: ['highway', 'mall', 'pagoda', 'logistics'] },
    { name: 'Sovereign', res: 3000, thr: 100, opens: ['spire', 'coast'] },
  ];
  const START_KINDS = ['emitter'];   // (the Grid opens at Settled, with a note of its own)
  const KIND_TIER = {}; TIERS.forEach((t, q) => (t.opens || []).forEach(k => { KIND_TIER[k] = q; })); for (const k of START_KINDS) KIND_TIER[k] = 0;
  const REPEAT = new Set(['emitter', 'police', 'scrubber']);   // as many as you like; every other megastructure is one per city
  const OPEN_NAME = { metro: 'Metro', pylons: 'Wider broadcast', perimeter: 'Perimeters', drones: 'Police drones', luxury: 'Luxury homes', corps: 'Corps', highway: 'Sky highways', coast: 'The coast' };
  // what each dial is and how it's said
  const DIALS = ['air', 'quiet', 'safety', 'ease', 'life'];
  const DNAME = { air: 'Clean air', quiet: 'Quiet', safety: 'Safety', ease: 'Privacy', life: 'Things to do', work: 'Jobs' };
  const dialTier = d => d === 'ease' ? 3 : 0;   // (Air, Quiet, Safety and Life from the start; Ease, the watched feeling, with police)
  const dialOn = d => st.tier >= dialTier(d);
  const ZONEK = { low: 'R', mid: 'C', high: 'L', ind: 'I' };
  const ZNAME = { R: 'Home', L: 'Luxury home', C: 'Shop', I: 'Industry', K: 'Corps' };

  /* ---------- the Air Scrubber: a new megastructure for this mode (2 x 2, repeatable) ---------- */
  M.scBody = toon(0x7c8786); M.scBody2 = toon(0x67716f); M.scBand = toon(0x434c4d); M.scGrill = toon(0x252b2c); M.scPad = toon(0x5d6564);
  M.scNeon = toon(0x0e3826, { em: 0x5affa8, kind: 'neon' }); M.scVent = toon(0x123a30, { em: 0x7affc8, kind: 'window' }); M.scMoss = toon(0x4c7f3c);
  function buildAirScrubber(m){
    R = mulberry32(hash('mega', m.kind, m.si ?? m.i, m.sj ?? m.j, m.seed));
    const S_ = m.w*LOT, P_ = T(m.x, 0, m.z, megaAngle(m, pick([0, PI/2, PI, -PI/2])));
    box(G.asph, P_, 0, .012, 0, S_, .025, S_);
    const n = 8, stp = S_/n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (!chance(.06)) box(pick(TILES.ind), P_, (a - (n - 1)/2)*stp, .03, (b - (n - 1)/2)*stp, stp - .05, .045, stp - .05);
    box(M.scPad, P_, 0, CURB + .1, 0, S_ - 1.2, .2, S_ - 1.2);
    // two filter towers, banded, a ring of light under each cap, and a fan housing on top
    const towers = [[-1.45, -.4], [1.35, .55]];
    let top = 0;
    towers.forEach(([x, z], q) => {
      const h = 4.2 + q*1.1 + R()*.4, r = .95 - q*.08;
      put(U.cyl16 || U.cyl, M.scBody, under(P_, T(x, CURB + .2 + h/2, z, 0, 2*r, h, 2*r)));
      for (let y = CURB + .7; y < CURB + h - .4; y += .7) put(U.cyl16 || U.cyl, M.scBand, under(P_, T(x, y, z, 0, 2*r + .08, .1, 2*r + .08)));
      for (let k = 0; k < 8; k++){ const a = k*TAU/8; box(M.scGrill, P_, x + Math.sin(a)*r, CURB + .9, z + Math.cos(a)*r, .22, .9, .05, a); }   // the intake slots at the foot
      put(U.cyl16 || U.cyl, M.scNeon, under(P_, T(x, CURB + .2 + h - .25, z, 0, 2*r + .1, .12, 2*r + .1)));
      put(U.cyl16 || U.cyl, M.scBody2, under(P_, T(x, CURB + .2 + h + .2, z, 0, 2*r + .2, .4, 2*r + .2)));
      put(U.cyl16 || U.cyl, M.scGrill, under(P_, T(x, CURB + .2 + h + .45, z, 0, 2*r - .3, .1, 2*r - .3)));
      for (let k = 0; k < 4; k++){ const a = k*PI/4 + q; box(M.scBand, P_, x, CURB + .2 + h + .52, z, 2*r - .5, .04, .1, a); }   // the fan's blades
      glow(P_, x, CURB + .2 + h - .25, z, 'green', 1.4); glow(P_, x, CURB + .2 + h + .6, z, 'green', .9);
      top = Math.max(top, CURB + .2 + h + .6);
    });
    // the intake box between them, its grille lit from inside, ducts up into each tower
    box(M.scBody2, P_, 0, CURB + .85, 0, 1.6, 1.3, 1.1);
    for (let k = 0; k < 5; k++) box(M.scVent, P_, -.6 + k*.3, CURB + .85, .56, .16, .9, .02);
    glow(P_, 0, CURB + .9, .7, 'cyan', .8);
    for (const [x, z] of towers){ strut(M.scBand, P_, 0, CURB + 1.3, 0, x*.72, CURB + 2.1, z*.72, .2); }
    // pipes along the ground, a little moss where the clean air settles
    strut(M.metalDark, P_, -S_/2 + .7, CURB + .35, S_/2 - .8, S_/2 - .7, CURB + .35, S_/2 - .8, .12);
    strut(M.metalDark, P_, -S_/2 + .7, CURB + .55, S_/2 - .8, -S_/2 + .7, CURB + .55, -S_/2 + .9, .1);
    for (let k = 0; k < 7; k++) box(M.scMoss, P_, (R() - .5)*(S_ - 1.6), CURB + .22, (R() - .5)*(S_ - 1.6), .3 + R()*.4, .05, .3 + R()*.4, R()*PI);
    m.solid = { m: P_.toArray(), x0: -S_/2 + .4, x1: S_/2 - .4, z0: -S_/2 + .4, z1: S_/2 - .4, y1: top };
    m.roofH = CURB + .3; m.top = top + .3;
  }
  MEGA_TYPES.scrubber = { name: 'Air Scrubber', need: { any: 99999 }, odds: 1e9, w: 2, h: 2, maxLevels: 1, colour: '#5affa8', build: buildAirScrubber };
  MEGA_OVER.scrubber = .2;
  // (mega.js read the saved unlocks before this type existed, so it dropped the scrubber's: put it back, or it would "unlock" again on every load)
  try { if (JSON.parse(localStorage.getItem(MEGA_UNLOCK_KEY) || '[]').includes('scrubber')) megaUnlockedKinds.add('scrubber'); } catch (e) {}

  /* ---------- reading the city ---------- */
  const keyOf = c => c.i + ',' + c.j;
  const isBld = c => c.sections.length > 0 && !c.mega && !c.wall;
  const zoneOf = c => { const s = (c.below && c.below.length ? c.below[0] : c.sections[0]); if (!s) return null; const z = ZONEK[s.zone]; return z === 'I' && (s.corp || c.sections.some(x => x.corp)) ? 'K' : z; };
  const floorsOf = c => c.sections.length + (c.lift && c.below ? c.below.length : 0);
  const isHome = z => z === 'R' || z === 'L';
  const megaD = (i, j, m) => Math.max(Math.max(m.i - i, 0, i - (m.i + m.w - 1)), Math.max(m.j - j, 0, j - (m.j + m.h - 1)));
  const cheb = (ai, aj, bi, bj) => Math.max(Math.abs(ai - bi), Math.abs(aj - bj));
  const megaList = kind => typeof megasOfKind === 'function' ? megasOfKind(kind) : [];
  const built = kind => megaList(kind).length > 0;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const now = () => Date.now();
  const opened = k => KIND_TIER[k] === undefined || st.tier >= KIND_TIER[k];
  const wind = () => [Math.cos(st.wind), Math.sin(st.wind)];
  const transitStops = () => { const out = []; if (typeof metros === 'undefined') return out; for (const l of metros){ const n = l.tiles.length; for (let k = 0; k < n; k++) if (mtIsStop(l, k)) out.push(l.tiles[k]); } return out; };
  const dropOffs = () => { const out = []; if (typeof highways === 'undefined') return out; for (const h of highways) if (h.done && h.tiles.length > 1){ const e = h.tiles[h.tiles.length - 1]; out.push({ i: e.i, j: e.j }); } return out; };

  // the city as the simulation reads it: plain data, so a building that isn't there yet can be added to see what it would do (the preview)
  function snapshot(){
    const blds = [];
    for (const c of cells.values()) if (isBld(c)){ const z = zoneOf(c); if (z) blds.push({ k: keyOf(c), i: c.i, j: c.j, z, floors: Math.max(1, floorsOf(c)), h: c.height || CURB, c }); }
    const ms = []; if (typeof megas !== 'undefined') for (const m of megas.values()) ms.push({ id: m.id, kind: m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels || 1, top: m.top || CURB, m });
    const walls = []; for (const c of cells.values()) if (c.wall && !c.mega) walls.push({ i: c.i, j: c.j });
    const tracks = []; if (typeof metros !== 'undefined') for (const l of metros) for (const t of l.tiles) tracks.push({ i: t.i, j: t.j });
    const plots = new Set(); for (const c of cells.values()) plots.add(keyOf(c));
    return { blds, ms, walls, tracks, stops: transitStops(), drops: dropOffs(), plots };
  }

  /* ---------- the simulation: what every home would hold, as things stand ---------- */

  // the Grid's song: four traits read from what the Acoustic Panel is playing, smoothed over a minute (the autopilot moves the dials on its own)
  const SONG = { tempo: 0, bright: 0, rev: 0, freeze: 0 };
  function songTick(dt){
    if (typeof GRIDPANEL === 'undefined' || !GRIDPANEL.el) return;
    const q = id => { const e = GRIDPANEL.el.querySelector('#' + id); return e ? parseFloat(e.value) : NaN; };
    const bpm = q('g-bpmSlider'), hz = q('g-warmthFilterSlider'), rv = q('g-spaceReverbSlider');
    const fz = GRIDPANEL.el.querySelector('#g-freezeStatusText'), frozen = fz && /ACTIVE/.test(fz.textContent) ? 1 : 0;
    const k = Math.min(1, dt/30), cl = v => Math.max(-1, Math.min(1, v));
    if (isFinite(bpm)) SONG.tempo += (cl((82 - bpm)/25) - SONG.tempo)*k;           // slower than the default: positive
    if (isFinite(hz)) SONG.bright += (cl((hz - 2500)/2000) - SONG.bright)*k;     // a brighter filter: positive
    if (isFinite(rv)) SONG.rev += (cl((rv - .84)/.16) - SONG.rev)*k;            // more resonance: positive
    SONG.freeze += (frozen - SONG.freeze)*k;
  }
  // what the song does to each dial: each trait helps one and costs another (no song is best at everything)
  function songPush(){
    const s = SONG, p = { quiet: s.tempo - s.bright*.8, life: s.bright - s.tempo*.6, ease: s.rev - s.freeze*.6, safety: -s.rev*.6, air: s.freeze };
    for (const d in p) p[d] = Math.max(-1, Math.min(1, p[d]));
    return p;
  }
  const gridReach = () => 7 + (st.tier >= 4 ? 4 : 0);

  // The city as maps: each source paints its effect once onto a grid over the city (haze, noise, the watched feeling, the eyes on the street), and
  // jobs and things to do are shared out with box sums (a summed-area table of the people who'd come, a difference grid for what each place offers).
  // A home then reads its own square. A few thousand buildings take a few milliseconds.
  function compute(snap, opt = {}){
    const T0 = performance.now(), tier = opt.tier ?? st.tier, fk = id => st.forks[id] || null;
    // the grid: every plot, with room round it for reach
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const k of snap.plots){ const c = k.indexOf(','), i = +k.slice(0, c), j = +k.slice(c + 1); if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    if (!isFinite(i0)){ i0 = j0 = -1; i1 = j1 = 1; }
    const PAD = 14; i0 -= PAD; j0 -= PAD; i1 += PAD; j1 += PAD;
    const NI = i1 - i0 + 1, NJ = j1 - j0 + 1, NN = NI*NJ;
    const id = (i, j) => (i - i0)*NJ + (j - j0), inG = (i, j) => i >= i0 && i <= i1 && j >= j0 && j <= j1;
    const F = () => new Float32Array(NN);
    // a source's box: its footprint (a plot, or a megastructure's block) grown by r, clipped to the grid
    const box = (s, r) => [Math.max(i0, Math.round(s.i) - r), Math.min(i1, Math.round(s.i) + (s.w || 1) - 1 + r), Math.max(j0, Math.round(s.j) - r), Math.min(j1, Math.round(s.j) + (s.h || 1) - 1 + r)];
    const dTo = (s, a, b) => { const si = Math.round(s.i), sj = Math.round(s.j); return Math.max(Math.max(si - a, 0, a - (si + (s.w || 1) - 1)), Math.max(sj - b, 0, b - (sj + (s.h || 1) - 1))); };
    const fall = (s, d) => d > s.r ? 0 : s.s*(1 - d/(s.r + 1));
    // tall: three levels or more (a megastructure by its height)
    const LV = new Uint8Array(NN), lvOfTop = t => Math.max(1, Math.floor((t - CURB - .5)/(3*FH)) + 1);   // (levels on each plot: a megastructure by its height)
    for (const b of snap.blds) if (inG(b.i, b.j)) LV[id(b.i, b.j)] = b.floors;
    for (const m of snap.ms){ const lv = lvOfTop(m.top); for (let a = 0; a < m.w; a++) for (let q = 0; q < m.h; q++) if (inG(m.i + a, m.j + q)) LV[id(m.i + a, m.j + q)] = Math.max(LV[id(m.i + a, m.j + q)], lv); }
    // cores: their reach, drained by the scrubbers nearest each (each one less than the last, never below half)
    const cores = snap.ms.filter(m => m.kind === 'emitter').map(m => ({ ...m, reach: fk(m.id) === 'wide' ? P.coreWide : P.coreReach, drained: 0, nS: 0 }));
    for (const s of snap.ms) if (s.kind === 'scrubber'){ let best = null, bd = Infinity; for (const c of cores){ const d = megaD(s.i, s.j, c); if (d < bd){ bd = d; best = c; } } if (best){ const f = fk(s.id); best.drained += P.scrubDrain*(f === 'turbo' ? 1.5 : f === 'quiet' ? .7 : 1)*Math.pow(.5, best.nS++); } }
    for (const c of cores) c.reachNow = Math.max(c.reach*.5, c.reach - c.drained);
    // power on the grid: 2 inside a core's reach, 1 at its edge (the last two plots flicker), 0 outside every core
    const PWR = new Uint8Array(NN);
    for (const c of cores){ const rIn = Math.floor(c.reachNow - P.edge), rOut = Math.floor(c.reachNow), [a0, a1, b0, b1] = box(c, rOut);
      for (let a = a0; a <= a1; a++){ const da = a < c.i ? c.i - a : a > c.i + c.w - 1 ? a - c.i - c.w + 1 : 0;
        for (let b = b0; b <= b1; b++){ const db = b < c.j ? c.j - b : b > c.j + c.h - 1 ? b - c.j - c.h + 1 : 0, d = da > db ? da : db, k = (a - i0)*NJ + (b - j0), v = d <= rIn ? 2 : 1; if (v > PWR[k]) PWR[k] = v; } } }
    // load: each core powers P.coreCap; the buildings nearest a core are served first, each by the nearest core in reach with room. Past that, dark.
    const drawOf = b => { const n = b.floors - 1; return P.draw[b.z]*(b.floors + .08*n*n + .02*n*n*n); };   // (1, 2.1, 3.5, 5.3, 7.6, 10.5 for 1 to 6 levels)
    for (const c of cores){ c.cap = P.coreCap; c.load = 0; }
    const PW = new Map(), cand = [];
    const CB = cores.map(c => { const x0 = Math.round(c.i), y0 = Math.round(c.j); return { c, x0, x1: x0 + (c.w || 1) - 1, y0, y1: y0 + (c.h || 1) - 1, rr: Math.floor(c.reachNow) }; });
    for (const b of snap.blds){ const g = inG(b.i, b.j) ? PWR[id(b.i, b.j)] : 0; if (!g){ PW.set(b.k, { v: 0, why: 'reach' }); continue; }
      const near = []; let dn = Infinity;
      for (const q of CB){ const da = b.i < q.x0 ? q.x0 - b.i : b.i > q.x1 ? b.i - q.x1 : 0, db = b.j < q.y0 ? q.y0 - b.j : b.j > q.y1 ? b.j - q.y1 : 0, d = da > db ? da : db;
        if (d <= q.rr){ near.push(q.c, d); if (d < dn) dn = d; } }
      cand.push({ b, d: dn, g, w: drawOf(b), near }); }
    const byK = (x, y) => x.b.k < y.b.k ? -1 : x.b.k > y.b.k ? 1 : 0;
    for (const c of cores) c.refused = 0;
    // first, each core serves the buildings it's nearest to, closest first; then the ones it couldn't take try the other cores they're in reach of
    const mine = new Map(cores.map(c => [c, []])), over = [];
    for (const x of cand){ let bc = null, bd = Infinity; for (let q = 0; q < x.near.length; q += 2) if (x.near[q + 1] < bd){ bd = x.near[q + 1]; bc = x.near[q]; } if (bc) mine.get(bc).push({ x, d: bd }); }
    for (const [c, L_] of mine){ L_.sort((a_, b_) => a_.d - b_.d || byK(a_.x, b_.x)); for (const { x } of L_){ if (c.cap - c.load >= x.w - 1e-6){ c.load += x.w; PW.set(x.b.k, { v: x.g, core: c.id, w: x.w }); } else { c.refused++; over.push(x); } } }
    over.sort((x, y) => x.d - y.d || byK(x, y));
    for (const x of over){ let best = null, bd = Infinity;
      for (let q = 0; q < x.near.length; q += 2){ const c = x.near[q], d = x.near[q + 1]; if (c.cap - c.load < x.w - 1e-6) continue; if (d < bd){ bd = d; best = c; } }
      if (best){ best.load += x.w; PW.set(x.b.k, { v: x.g, core: best.id, w: x.w }); } else { const ids = []; for (let q = 0; q < x.near.length; q += 2){ x.near[q].refused++; ids.push(x.near[q].id); } PW.set(x.b.k, { v: 0, why: 'load', w: x.w, cores: ids }); } }
    const lit = b => { const v = PW.get(b.k); return !!(v && v.v); };
    // who can reach what: from megastructures and stations along connected ground (hopping two plots between buildings); cut off, nobody comes
    const PLOT = new Uint8Array(NN), OCC = new Uint8Array(NN), REACH = new Uint8Array(NN), queue = [];
    for (const k of snap.plots){ const c = k.indexOf(','); PLOT[id(+k.slice(0, c), +k.slice(c + 1))] = 1; }
    for (const b of snap.blds) OCC[id(b.i, b.j)] = 1;
    const seed = (i, j) => { if (!inG(i, j)) return; const k = id(i, j); if (!REACH[k] && PLOT[k]){ REACH[k] = 1; queue.push(i, j); } };
    for (const m of snap.ms) for (let a = 0; a < m.w; a++) for (let q = 0; q < m.h; q++) seed(m.i + a, m.j + q);
    for (const t of snap.stops) for (let a = -2; a <= 2; a++) for (let q = -2; q <= 2; q++) seed(t.i + a, t.j + q);
    while (queue.length){ const j = queue.pop(), i = queue.pop(), hop = OCC[id(i, j)] ? 2 : 1;
      for (let a = -hop; a <= hop; a++) for (let q = -hop; q <= hop; q++){ const x = i + a, y = j + q; if (!inG(x, y)) continue; const k = id(x, y); if (REACH[k]) continue; if (Math.max(Math.abs(a), Math.abs(q)) === 1 || OCC[k]) seed(x, y); } }
    // the wind: haze leans a plot downwind
    const [wx_, wz_] = wind(), wx = Math.round(wx_), wz = Math.round(wz_);
    const night = .45, day = .6;   // (a source only at night, or only by day, counts this much of a whole day: the counts never swing with the clock)
    // the painted fields
    const POL = F(), C1 = F(), C2 = F(), C3 = F(), NOI = F(), TRK = F(), WAT = F(), E1 = F(), E2 = F(), E3 = F();
    const top3 = (A, B, C, k, v) => { if (v > A[k]){ C[k] = B[k]; B[k] = A[k]; A[k] = v; } else if (v > B[k]){ C[k] = B[k]; B[k] = v; } else if (v > C[k]) C[k] = v; };
    const paint = (s, f) => { const [a0, a1, b0, b1] = box(s, s.r), x0 = Math.round(s.i), x1 = x0 + (s.w || 1) - 1, y0 = Math.round(s.j), y1 = y0 + (s.h || 1) - 1, R1 = s.r + 1;
      for (let a = a0; a <= a1; a++){ const da = a < x0 ? x0 - a : a > x1 ? a - x1 : 0, row = (a - i0)*NJ - j0;
        for (let b = b0; b <= b1; b++){ const db = b < y0 ? y0 - b : b > y1 ? b - y1 : 0, d = da > db ? da : db; if (d > s.r) continue; f(row + b, s.s*(1 - d/R1), a, b, d, x0, x1, y0, y1); } } };
    // haze: a tall building (three levels or more) on the way shades the plots up to P.shadow behind it, and breathes part of what it stops
    // itself (BLK); past that, the haze goes on as if nothing were there. The source's own building never shades its own haze.
    const BLK = F(), SRC = { air: [], noise: [] };
    // (the tiles a stacked shop's levels would take, spread out one level each: its own, the ring of 8, then the ring of 16)
    const RING = (() => { const r = [[0, 0]]; for (const d of [1, 2]) for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) if (Math.max(Math.abs(a), Math.abs(b)) === d) r.push([a, b]); return r; })();
    const pol = s => { const si = Math.round(s.i + ((s.w || 1) - 1)/2), sj = Math.round(s.j + ((s.h || 1) - 1)/2), o = s.o;
      if (o && !s.quiet && !s.plume) SRC.air.push({ i: o.i, j: o.j, w: o.w || 1, h: o.h || 1, s: s.s, k: o.k });
      paint(s, (k, v, a, b, d, x0, x1, y0, y1) => {
        if (d >= 1){ const steps = Math.max(Math.abs(si - a), Math.abs(sj - b));
          for (let q = 1; q < steps && q <= P.shadow; q++){ const x = Math.round(a + (si - a)*q/steps), y = Math.round(b + (sj - b)*q/steps);
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) break;
            if (o && x >= o.i && x < o.i + (o.w || 1) && y >= o.j && y < o.j + (o.h || 1)) break;
            const kk = (x - i0)*NJ + (y - j0); if (LV[kk] >= Math.max(3, s.lv || 1)){ BLK[kk] = Math.max(BLK[kk], v*.7); v *= .3; break; } } }   // (a source taller than the building in the way blows over it)
        POL[k] += v; }); };
    const clean = s => paint(s, (k, v) => top3(C1, C2, C3, k, v));
    const watch = s => paint(s, (k, v) => { WAT[k] += v; });
    const eye = s => paint(s, (k, v) => top3(E1, E2, E3, k, v));
    // noise: anything tall (three levels or more) between the source and a plot two or more away soaks up more than half of it
    const noise = s => { const si = Math.round(s.i + ((s.w || 1) - 1)/2), sj = Math.round(s.j + ((s.h || 1) - 1)/2);
      if (!s.track && s.s > .3) SRC.noise.push({ i: s.i, j: s.j, w: s.w || 1, h: s.h || 1, s: s.s, k: s.k });
      paint(s, (k, v, a, b, d, x0, x1, y0, y1) => {
        if (d >= 2){ const steps = Math.max(Math.abs(si - a), Math.abs(sj - b)); for (let q = 1; q < steps; q++){ const x = Math.round(a + (si - a)*q/steps), y = Math.round(b + (sj - b)*q/steps); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue; if (LV[(x - i0)*NJ + (y - j0)] >= 3){ v *= .45; break; } } }
        if (s.track){ if (v > TRK[k]) TRK[k] = v; } else NOI[k] += v; }); };
    // jobs and things to do: who offers how much, within what reach
    const jobsS = [], lifeS = [];
    const foundries = snap.ms.filter(m => m.kind === 'foundry');
    for (const b of snap.blds){
      if (!lit(b)) continue;   // (no power: no jobs, nothing to do, no smoke)
      if (b.z === 'I' || b.z === 'K'){
        jobsS.push({ i: b.i, j: b.j, r: P.walk, cap: b.floors*(b.z === 'K' ? P.jobs.K : P.jobs.I)*(1 + .1*(b.floors - 1)), lux: b.z === 'K', k: b.k, z: b.z });
        if (b.z === 'I'){ const fd = foundries.some(f => megaD(b.i, b.j, f) <= 5) ? .6 : 1, n = b.floors, S_ = (1.5 + .35*(n - 1))*fd, own = { i: b.i, j: b.j, k: b.k };
          // close in: a cloud that shrinks as the stack rises (radius 3, then 2 at two or three levels, 1 from four) and holds less of the smoke
          const loc = Math.max(.3, 1 - .2*(n - 1));
          pol({ i: b.i + wx, j: b.j + wz, r: n >= 4 ? 1 : n >= 2 ? 2 : 3, s: S_*loc, lv: n, o: own });
          // the rest rides the wind: a thin trail, then it comes down 2 tiles farther for each level (over water too: build there later and it lands
          // on you). Only a building at least as tall as the stack, and three levels or more, stops it on the way down
          if (n >= 2){ const L = 2*n; let rest = S_*(1 - loc);
            for (let q = 1; q <= L; q++){ const x = b.i + Math.round(wx_*q), y = b.j + Math.round(wz_*q);
              // a building at least as tall as the stack (and three levels or more) in the way catches most of it, and breathes it
              if (inG(x, y) && LV[id(x, y)] >= Math.max(3, n)){ const k = id(x, y); BLK[k] = Math.max(BLK[k], rest*.7*1.4); rest *= .3; }
              else if (q >= 2 && q < L) pol({ i: x, j: y, r: 0, s: rest*.12, lv: n, o: own, quiet: true }); }
            pol({ i: b.i + Math.round(wx_*L), j: b.j + Math.round(wz_*L), r: 2, s: rest, lv: n, o: own, plume: true }); }
          noise({ i: b.i, j: b.j, r: 2, s: 1.6 + .4*(n - 1), k: b.k }); }   // (the noise stays close, and grows with height: tall industry is still no neighbor)
        else noise({ i: b.i, j: b.j, r: 1, s: .6, k: b.k });
      } else if (b.z === 'C'){
        jobsS.push({ i: b.i, j: b.j, r: P.walk, cap: b.floors*P.jobs.C, k: b.k, z: b.z });
        lifeS.push({ i: b.i, j: b.j, r: P.shopWalk, cap: P.shop*(1 + P.shopTall[0]*Math.min(1, b.floors - 1) + P.shopTall[1]*Math.max(0, b.floors - 2)), k: b.k });   // (a tall shop: fewer visitors per level)
        { const n = b.floors, s1 = .25*day, f = n === 1 ? 1 : .75;   // stacked: 3/4 the noise its levels would make spread round it one level each
          for (let q = 0; q < n && q < RING.length; q++) noise({ i: b.i + RING[q][0], j: b.j + RING[q][1], r: 1, s: s1*f, k: b.k });
          if (n*s1*f > .3) SRC.noise.push({ i: b.i, j: b.j, w: 1, h: 1, s: n*s1*f, k: b.k }); }
        eye({ i: b.i, j: b.j, r: 1, s: .15 });
      }
    }
    const megaJobs = { market: 40, foundry: 80, logistics: 60, greenhouse: 30, mall: 25, club: 20, square: 12, pagoda: 20, wirenest: 6, spire: 6, police: 4, emitter: 4, bathhouse: 6, lidar: 4 };
    const stopNearM = m => snap.stops.some(t => megaD(t.i, t.j, m) <= 3);
    for (const m of snap.ms){
      const lv = m.levels || 1, J = megaJobs[m.kind];
      if (J) jobsS.push({ ...m, r: P.walk + 1, cap: J*(m.kind === 'mall' ? lv : 1), lux: m.kind === 'pagoda' || m.kind === 'spire' });
      switch (m.kind){
        case 'emitter': { const f = fk(m.id); pol({ ...m, i: m.i + wx, j: m.j + wz, r: 2, s: 2.2*(f === 'clean' ? .5 : f === 'wide' ? 1.15 : 1), lv: lvOfTop(m.top), o: { i: m.i, j: m.j, w: m.w, h: m.h, k: m.id } }); break; }
        case 'foundry': pol({ ...m, i: m.i + wx, j: m.j + wz, r: 5, s: 3, lv: lvOfTop(m.top), o: { i: m.i, j: m.j, w: m.w, h: m.h, k: m.id } }); noise({ ...m, r: 3, s: 3.2, k: m.id }); break;
        case 'scrubber': { const f = fk(m.id); clean({ ...m, r: f === 'turbo' ? 4 : f === 'quiet' ? 2 : 3, s: 2.6 }); noise({ ...m, r: 2, s: f === 'quiet' ? 1.1 : 2.2 }); break; }
        case 'greenhouse': clean({ ...m, r: 5, s: 1.6 }); lifeS.push({ ...m, r: 5, cap: 80 }); break;
        case 'square': lifeS.push({ ...m, r: 6, cap: 300, square: true }); noise({ ...m, r: 2, s: 1.0*day }); eye({ ...m, r: 3, s: .25 }); break;
        case 'market': lifeS.push({ ...m, r: 7, cap: stopNearM(m) ? 400 : 240 }); noise({ ...m, r: 2, s: 1.6*day }); eye({ ...m, r: 2, s: .2 }); break;
        case 'mall': lifeS.push({ ...m, r: 6, cap: 300*lv }); noise({ ...m, r: 2, s: 1.4*day }); break;
        case 'club': lifeS.push({ ...m, r: 6, cap: 220 }); noise({ ...m, r: 3, s: 2.6*night }); eye({ ...m, r: 3, s: .3 }); break;
        case 'logistics': noise({ ...m, r: 2, s: 2.4 }); break;
        case 'bathhouse': lifeS.push({ ...m, r: 4, cap: 100 }); break;
        case 'police': { const f = fk(m.id); watch({ ...m, r: f === 'beat' ? 4 : 3, s: f === 'beat' ? .28 : f === 'watch' ? .55 : .42 }); eye({ ...m, r: f === 'beat' ? 7 : f === 'watch' ? 4 : 5, s: f === 'beat' ? .75 : f === 'watch' ? 1 : .9 }); break; }
        case 'lidar': watch({ ...m, r: 6, s: .4 }); break;
        case 'wirenest': watch({ ...m, r: 4, s: .1 }); break;
      }
    }
    if (tier >= 5 && snap.ms.some(m => m.kind === 'wirenest')) for (const m of snap.ms) if (m.kind === 'police'){ watch({ ...m, r: 6, s: .1 }); eye({ ...m, r: 6, s: .2 }); }   // the drones, flying inside the Wire Nest's signal
    for (const t of snap.tracks) noise({ i: t.i, j: t.j, r: 2, s: 1.5, track: true });
    for (const t of snap.stops) noise({ i: t.i, j: t.j, r: 3, s: 2 });
    for (const d of snap.drops){ noise({ i: d.i, j: d.j, r: 2, s: 1.8 }); lifeS.push({ i: d.i, j: d.j, r: 4, cap: 150 }); }
    for (const w of snap.walls){ watch({ i: w.i, j: w.j, r: 2, s: .14 }); eye({ i: w.i, j: w.j, r: 1, s: .35 }); }
    const patrol = opt.patrol || PATROL;
    const polAt = (i, j) => { if (!inG(i, j)) return 0; const k = id(i, j); return Math.max(0, POL[k] + .5*BLK[k] - (C1[k] + .5*C2[k] + .25*C3[k])); };   // (BLK: a tall building breathes part of the haze it stops)
    const noiseAt = (i, j) => { if (!inG(i, j)) return 0; const k = id(i, j); return NOI[k] + TRK[k]; };
    const watchAt = (i, j) => inG(i, j) ? WAT[id(i, j)] : 0;
    const coverAt = (i, j) => { const k = inG(i, j) ? id(i, j) : -1; const e = k < 0 ? 0 : E1[k] + .5*E2[k] + .25*E3[k]; return Math.min(1, e + Math.min(.7, (patrol.get(i + ',' + j) || 0)/12)); };
    // the people who'd come: workers (ordinary and luxury) and residents, as summed-area tables
    const WR = new Float64Array(NN), WL = new Float64Array(NN), PEO = new Float64Array(NN);
    const homesB = snap.blds.filter(b => isHome(b.z));
    const stopNear = (i, j) => snap.stops.some(t => cheb(i, j, t.i, t.j) <= P.stationR);
    const hubs = snap.ms.filter(m => m.kind === 'logistics');
    let WRst = 0, WLst = 0, PEOst = 0, Whub = 0;
    for (const b of homesB){ if (!inG(b.i, b.j) || !lit(b)) continue; const ppl = b.floors*P.ppl[b.z], w = ppl*P.work, k = id(b.i, b.j); (b.z === 'L' ? WL : WR)[k] += w; PEO[k] += ppl;
      b._st = stopNear(b.i, b.j); b._hub = hubs.some(m => megaD(b.i, b.j, m) <= 12);
      if (b._st){ if (b.z === 'L') WLst += w; else WRst += w; PEOst += ppl; } if (b._hub && b.z === 'R') Whub += w; }
    const sat = A => { const S_ = new Float64Array((NI + 1)*(NJ + 1)); for (let a = 0; a < NI; a++){ let row = 0; for (let b = 0; b < NJ; b++){ row += A[a*NJ + b]; S_[(a + 1)*(NJ + 1) + b + 1] = S_[a*(NJ + 1) + b + 1] + row; } } return S_; };
    const SR = sat(WR), SL = sat(WL), SP = sat(PEO);
    const bsum = (S_, [a0, a1, b0, b1]) => a0 > a1 || b0 > b1 ? 0 : S_[(a1 - i0 + 1)*(NJ + 1) + (b1 - j0 + 1)] - S_[(a0 - i0)*(NJ + 1) + (b1 - j0 + 1)] - S_[(a1 - i0 + 1)*(NJ + 1) + (b0 - j0)] + S_[(a0 - i0)*(NJ + 1) + (b0 - j0)];
    // what each offers: a box add (difference grid), integrated once
    const DR = new Float64Array((NI + 1)*(NJ + 1)), DL = new Float64Array((NI + 1)*(NJ + 1)), DF = new Float64Array((NI + 1)*(NJ + 1));
    const badd = (D_, [a0, a1, b0, b1], v) => { if (a0 > a1 || b0 > b1) return; const W_ = NJ + 1; D_[(a0 - i0)*W_ + (b0 - j0)] += v; D_[(a0 - i0)*W_ + (b1 - j0 + 1)] -= v; D_[(a1 - i0 + 1)*W_ + (b0 - j0)] -= v; D_[(a1 - i0 + 1)*W_ + (b1 - j0 + 1)] += v; };
    const integ = D_ => { const W_ = NJ + 1, out = new Float32Array(NN); for (let a = 0; a < NI; a++) for (let b = 0; b < NJ; b++){ const k = a*W_ + b; let v = D_[k]; if (a) v += D_[k - W_]; if (b) v += D_[k - 1]; if (a && b) v -= D_[k - W_ - 1]; D_[k] = v; out[a*NJ + b] = v; } return out; };
    // the pull: full close in, about half over the last few plots of a reach (a commute, not a cliff)
    const stR = s => snap.stops.some(t => dTo(s, t.i, t.j) <= P.stationJobR);
    let poolR = 0, poolL = 0, poolHub = 0, poolLife = 0;
    for (const s of jobsS){
      const full = box(s, s.r), inner = box(s, s.r - 3), sumW = (S_) => .55*bsum(S_, full) + .45*bsum(S_, inner);
      s.st = stR(s); s.hub = !s.lux && s.z === 'I' && hubs.some(m => megaD(s.i, s.j, m) <= 6);
      s.D = s.lux ? sumW(SL) + (s.st ? .9*WLst : 0) : sumW(SR) + .33*sumW(SL) + (s.st ? .9*WRst : 0) + (s.hub ? .8*Whub : 0);
      const v = s.D > 0 ? Math.min(1, s.cap/s.D) : 1; s.v = v;
      if (s.lux){ badd(DL, full, .55*v); badd(DL, inner, .45*v); if (s.st) poolL += .9*v; }
      else { badd(DR, full, .55*v); badd(DR, inner, .45*v); badd(DL, full, .33*.55*v); badd(DL, inner, .33*.45*v); if (s.st) poolR += .9*v; if (s.hub) poolHub += .8*v; }
    }
    const seats = Whub > 0 ? Math.min(1, 300/Whub) : 1;
    for (const s of lifeS){
      const full = box(s, s.r), inner = box(s, s.r - 2);
      s.st = stR(s); s.D = .6*bsum(SP, full) + .4*bsum(SP, inner) + (s.st ? .8*PEOst : 0);
      const v = (s.D > 0 ? Math.min(1, s.cap/s.D) : 1)*(s.square && polAt(Math.round(s.i + 2), Math.round(s.j + 2)) > 1 ? .6 : 1); s.v = v;
      badd(DF, full, .6*v); badd(DF, inner, .4*v); if (s.st) poolLife += .8*v;
    }
    const SUPR = integ(DR), SUPL = integ(DL), LIFE = integ(DF);
    // the few things that act on a handful of homes directly
    const bath = snap.ms.filter(m => m.kind === 'bathhouse').map(m => ({ m, boost: (snap.blds.some(b => b.z === 'I' && megaD(b.i, b.j, m) <= 3) || snap.ms.some(o => o.kind === 'emitter' && megaD(o.i, o.j, m) <= 3)) ? 1.5 : 1 }));
    const pagoda = snap.ms.filter(m => m.kind === 'pagoda'), corps = snap.blds.filter(b => b.z === 'K'), grids = snap.ms.filter(m => m.kind === 'radio');
    const CORP = corps.length ? new Float64Array((NI + 1)*(NJ + 1)) : null; if (CORP) for (const o of corps) badd(CORP, box(o, 3), 1); const corpNear = CORP ? integ(CORP) : null;
    const gr = gridReach();
    // every building: its needs; homes: support, dials and fill
    const H = [];
    const jobK = new Map(), lifeK = new Map(); for (const s of jobsS) if (s.k) jobK.set(s.k, s); for (const s of lifeS) if (s.k) lifeK.set(s.k, s);
    for (const b of snap.blds){
      const pv = PW.get(b.k) || { v: 0, why: 'reach' }, pw = pv.v, edge = pw === 1;
      const h = { b, k: b.k, z: b.z, floors: b.floors, isolated: !REACH[id(b.i, b.j)], powered: pw > 0, edge, overload: pv.why === 'load', overCores: pv.cores || null, draw: pv.w || drawOf(b), shade: inG(b.i, b.j) ? BLK[id(b.i, b.j)] : 0 };
      h.need = !h.powered || h.isolated ? 0 : edge ? .8 : 1;
      H.push(h);
      if (!isHome(b.z)){
        const s = jobK.get(b.k), l = lifeK.get(b.k);
        const staff = s && s.D ? Math.min(1, s.D/s.cap) : 0, shop = l && l.D ? Math.min(1, l.D/l.cap) : 0;
        h.fill = h.need*Math.max(.25, b.z === 'C' ? Math.max(shop, staff) : staff);
        continue;
      }
      const k = inG(b.i, b.j) ? id(b.i, b.j) : -1;
      h.people = b.floors*P.ppl[b.z];
      h.support = clamp01((k < 0 ? 0 : (b.z === 'L' ? SUPL[k] : SUPR[k])) + (b._st ? (b.z === 'L' ? poolL : poolR) : 0) + (b._hub && b.z === 'R' ? poolHub*seats : 0));
      h.base = {};
      h.base.life = clamp01((k < 0 ? 0 : LIFE[k]) + (b._st ? poolLife : 0));
      h.base.air = clamp01(1 - polAt(b.i, b.j)/2);
      h.noise = noiseAt(b.i, b.j);
      h.base.quiet = clamp01(1 - h.noise/3);
      h.watched = watchAt(b.i, b.j)*(b.z === 'L' ? .3 : 1);
      h.base.ease = clamp01(1 - h.watched);
      // the Bath House: within 4 plots, a quarter of what's missing of Ease and Quiet (half again with waste heat beside it)
      for (const { m, boost } of bath) if (megaD(b.i, b.j, m) <= 4){ const g = .25*boost; h.base.ease += (1 - h.base.ease)*g; h.base.quiet += (1 - h.base.quiet)*g; }
      h.grid = grids.some(m => megaD(b.i, b.j, m) <= gr);
      h.pagoda = b.z === 'L' && pagoda.some(m => megaD(b.i, b.j, m) <= 6);
      let rent = 1;
      if (b.z === 'R' && corpNear && k >= 0 && corpNear[k] > 0) rent *= .7;   // priced out by the corps
      if (b.z === 'R' && pagoda.some(m => megaD(b.i, b.j, m) <= 4)) rent *= .85;
      h.rent = rent;
    }
    const powerAt = (i, j) => inG(i, j) ? PWR[id(i, j)] : 0;
    // the city's balance, if every powered home were full: workers against jobs, residents against things to do
    const tot = { people: 0, workers: 0, jobs: 0, life: 0 };
    for (const b of homesB) if (lit(b)){ const ppl = b.floors*P.ppl[b.z]; tot.people += ppl; tot.workers += ppl*P.work; }
    for (const s_ of jobsS) tot.jobs += s_.cap; for (const s_ of lifeS) tot.life += s_.cap;
    return finish({ H, byK: new Map(H.map(h => [h.k, h])), cores, tot, ms: performance.now() - T0, polAt, noiseAt, watchAt, coverAt, powerAt, src: SRC, field: { i0, j0, NI, NJ } }, opt);
  }
  // the quick part, every second: crime on the corners, the Grid's song, dials fading in, comfort and fill (the maps above are made only after an edit)
  function finish(base, opt = {}){
    const tier = opt.tier ?? st.tier, spots = opt.spots || st.crime.spots, push = songPush();
    const crimeAt = (i, j) => { let x = 0; for (const s of spots){ const d = cheb(i, j, s.i, s.j); if (d <= P.crimeR) x += s.heat*(1 - d/(P.crimeR + 1)); } return x; };
    let counted = 0, people = 0, thr = 0;
    for (const h of base.H){ if (!isHome(h.z)) continue; const b = h.b;
      h.crime = clamp01(crimeAt(b.i, b.j)); h.dials = { ...h.base, safety: 1 - h.crime };
      // the Grid: within its broadcast, the song lifts a third of what's missing of a dial, or costs a little
      if (h.grid) for (const d in push){ const v = push[d]; if (v > 0) h.dials[d] += (1 - h.dials[d])*v/3; else h.dials[d] *= 1 + .1*v; }
      if (h.pagoda) for (const d of DIALS) h.dials[d] = Math.min(1, h.dials[d] + .08);
      // dials not open yet count as fine; a dial just opened fades in
      const wts = h.z === 'L' ? { air: 1.3, quiet: 1.3, life: 1.3, safety: 1, ease: .3 } : { air: 1, quiet: 1, life: 1, safety: 1, ease: 1 };
      const comfortOf = (dl, out) => { let sum = 0, n = 0, lo = 1;
        for (const d of DIALS){ if (tier < dialTier(d)){ if (out) out[d] = null; continue; }
          const f = opt.fade === false ? 1 : fadeOf(d), v = 1 - f*(1 - clamp01(dl[d])); if (out) out[d] = v; sum += v*wts[d]; n += wts[d]; if (v < lo) lo = v; }
        return n ? .7*sum/n + .3*lo : 1; };
      h.eff = {};
      h.comfort = comfortOf(h.dials, h.eff);
      // unhappy: what bothers the people living there before any crime (a poor place to live, or no work), and what crime adds on top
      const crimeHit = h.crime;
      h.comfort0 = crimeHit > 0 ? comfortOf({ ...h.dials, safety: Math.min(1, h.dials.safety + crimeHit) }, null) : h.comfort;
      h.unhappy = clamp01(1 - (.65*h.comfort0 + .35*Math.min(1, h.support/.8)));
      h.crimeLoss = Math.max(0, h.comfort0 - h.comfort);
      h.fill = h.need*Math.max(P.floorSupport, h.support)*(.4 + .6*h.comfort)*h.rent;
      h.countShare = h.support/Math.max(P.floorSupport, h.support);   // (of those who live there, the share with work: only they count toward the tiers)
      h.target = h.fill*h.people;
      h.counted = h.target*h.countShare;
      h.thriving = h.need === 1 && h.support >= .8 && DIALS.every(d => h.eff[d] === null || h.eff[d] >= .7);
      counted += h.counted; people += h.target; if (h.thriving) thr++;
    }
    return Object.assign(base, { counted, people, thr, crimeAt });
  }
  const fadeOf = d => { const at = st.dialAt[d]; if (!at) return 1; return clamp01((now() - at)/P.dialFadeMs); };

  /* ---------- the live city: residents move toward what the simulation says, the lights follow ---------- */
  const B = new Map();   // per building: { c, z, floors, occ, lit, h (the simulation's row) }
  let LAST = null, BASE = null, REV = 0, SM = { res: 0, thr: 0, init: false };
  const arrived = new Map();
  const PATROL = new Map();
  function patrolTick(dt){
    for (const [k, v] of PATROL){ const n = v*Math.pow(.995, dt); if (n < .05) PATROL.delete(k); else PATROL.set(k, n); }
    if (typeof onDutyCops !== 'function') return;
    let cops = []; try { cops = onDutyCops(); } catch (e) {}
    for (const p of cops){ if (!isFinite(p.x)) continue; const i = Math.round(p.x/LOT), j = Math.round(p.z/LOT);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++){ const k = (i + a) + ',' + (j + b); PATROL.set(k, (PATROL.get(k) || 0) + dt*(a || b ? .5 : 1)); } }
  }
  function step(dt, live){
    songTick(dt);
    if (live) patrolTick(dt);
    // (the maps again only after an edit, or every half minute for anything the wraps don't see; otherwise just the quick part)
    if (!BASE || BASE.rev !== REV || now() - BASE.at > 30e3){ BASE = compute(snapshot()); BASE.rev = REV; BASE.at = now(); }
    const R_ = finish(BASE);
    LAST = R_;
    let res = 0, thrN = 0;
    for (const h of R_.H){
      const c = h.b.c, k = h.k; let occ = st.occ[k] || 0;
      const tgt = h.fill*h.floors;   // (in levels)
      if (tgt > occ) occ = Math.min(tgt, occ + (tgt - occ)*Math.min(1, P.fillUp*dt) + P.fillStep*dt*h.floors);
      else occ = Math.max(tgt, occ - (occ - tgt)*Math.min(1, P.fillDown*dt) - P.fillStep*dt*.5*h.floors);
      if (occ > h.floors) occ = h.floors;
      st.occ[k] = Math.round(occ*1000)/1000;
      const lit = Math.floor(occ + .5), best = st.best[k] || 0;
      if (lit > best){ st.best[k] = lit; if (live && SM.init) E.emit('light', { c, lit, z: h.z, floors: h.floors }); }
      else if (lit < best) st.best[k] = lit;
      const b = { c, k, z: h.z, floors: h.floors, occ, lit, h, powered: h.powered, edge: h.edge, isolated: h.isolated };
      if (isHome(h.z)){
        const ppl = occ/h.floors*h.people; res += ppl*h.countShare;
        if (h.thriving && occ >= h.fill*h.floors*.9) thrN++;
        const seen = arrived.get(k);
        if (seen === undefined || ppl < seen || !live) arrived.set(k, ppl);
        else if (ppl - seen >= (h.z === 'L' ? 2 : 4)){ arrived.set(k, ppl); if (b.lit === best) E.emit('arrive', { c, z: h.z, n: Math.round(ppl - seen), lit }); }
      }
      B.set(k, b);
    }
    for (const k of [...B.keys()]) if (!R_.byK.has(k)) B.delete(k);
    for (const k of Object.keys(st.occ)) if (!R_.byK.has(k)){ delete st.occ[k]; delete st.best[k]; }
    // the counts the tiers read, smoothed
    if (!SM.init){ SM.res = res; SM.thr = thrN; SM.init = true; }
    else { const a = Math.min(1, dt/P.smooth); SM.res += (res - SM.res)*a; SM.thr += (thrN - SM.thr)*a; }
    E.r = { res: SM.res, raw: res, thr: SM.thr, thrNow: thrN, people: R_.people, target: R_.counted };
    // a tier, once reached, is kept
    while (st.tier < TIERS.length - 1){ const t = TIERS[st.tier + 1]; if (SM.res + .5 < t.res || Math.floor(SM.thr + .5) < t.thr) break; st.tier++; onTier(st.tier, live); }
  }

  /* ---------- crime: unhappy homes breed it, it spreads, and it makes the homes round it unhappy too ----------
     A hotspot forms where enough unhappy people live close together (a poor place to live, or no work). It grows while what bothers them is still
     there, and adds to their unhappiness, so left alone it gets worse and spreads to the next unhappy block. Fix the cause and it fades: its growth
     counts only half of what crime itself adds, so crime alone can't keep itself alive. Police (from Patrolled) push it away, a third weaker each move;
     busy lit streets and walls watch too. It reaches P.crimeR plots, the same as a tall building's haze shadow. */
  const CRIME = (() => {
    const C = {}, R = P.crimeR, GROW = .38;
    // the people in each home now, and how unhappy they are
    function homes(){
      const out = [];
      for (const b of B.values()){ const h = b.h; if (!h || !isHome(h.z) || b.occ <= 0 || h.unhappy === undefined) continue;
        out.push({ i: b.c.i, j: b.c.j, ppl: b.occ/h.floors*h.people, u: h.unhappy, u2: h.unhappy + .5*.65*h.crimeLoss }); }   // (.65: comfort's share of unhappiness)
      return out;
    }
    // how bad it is round a plot: unhappy people near (for a new hotspot), and the mood that feeds one already there
    const clusterAt = (H, i, j) => { let w = 0; for (const x of H) if (cheb(i, j, x.i, x.j) <= R && x.u > .3) w += x.ppl*(x.u - .3); return w; };
    // (mood: with half of crime's own effect; cause: without it. A hotspot grows only while both are over the line, so fixing the cause ends it)
    const moodAt = (H, i, j) => { let w = 0, s = 0, s0 = 0; for (const x of H){ const d = cheb(i, j, x.i, x.j); if (d > R) continue; const k = x.ppl*(1 - d/(R + 1)); w += k; s += k*x.u2; s0 += k*x.u; } return w > 0 ? { m: s/w, c: s0/w } : { m: 0, c: 0 }; };
    function best(H, near, avoid){
      let bst = null, bs = 0;
      for (const x of H){ if (x.u < .3) continue; if (near && (cheb(near.i, near.j, x.i, x.j) < 2 || cheb(near.i, near.j, x.i, x.j) > 6)) continue;
        if (st.crime.spots.some(s => cheb(s.i, s.j, x.i, x.j) < (avoid || 4))) continue;
        const sc = clusterAt(H, x.i, x.j)*(1 - (LAST ? LAST.coverAt(x.i, x.j) : 0)); if (sc > bs){ bs = sc; bst = x; } }
      return bst ? { i: bst.i, j: bst.j, sc: bs } : null;
    }
    const wallBetween = (a, b) => { const steps = Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)); for (let q = 1; q < steps; q++){ const c = cells.get(Math.round(a.i + (b.i - a.i)*q/steps) + ',' + Math.round(a.j + (b.j - a.j)*q/steps)); if (c && c.wall && !c.mega) return true; } return false; };
    const FORM = 25;   // (about three homes of unhappy people, more than half of them very unhappy)
    C.tick = dt => {
      const cr = st.crime;
      if (!LAST || !booted){ return; }
      if (!cr.since) cr.since = now();
      const H = homes(), cov = (i, j) => LAST.coverAt(i, j);
      const cap = 2 + st.tier;
      // a new hotspot: never while the first lessons are on, and at most one every half a minute or so
      const calm = !st.tut.done || now() - cr.since < 90e3;
      if (!calm && cr.spots.length < cap && Math.random() < dt/30){ const t = best(H); if (t && t.sc >= FORM){ cr.spots.push({ i: t.i, j: t.j, heat: .3, h0: .3, p: 0, trail: [], id: ++cr.n }); E.emit('crime', { first: cr.n === 1, i: t.i, j: t.j }); } }
      for (let q = cr.spots.length - 1; q >= 0; q--){ const s = cr.spots[q], c = cov(s.i, s.j), md = moodAt(H, s.i, s.j), mood = md.c > GROW - .05 ? md.m : Math.min(md.m, GROW - .05);
        s.mood = mood; s.cause = md.c;
        if (c >= .4){ s.p += dt; s.heat = Math.max(0, s.heat - dt*.002); }
        else { s.p = Math.max(0, s.p - dt*.5); s.heat = clamp01(s.heat + dt*(mood > GROW ? .006*(mood - GROW)/.1 : -(.004 + .01*(GROW - mood)))); }
        s.h0 = Math.max(s.h0, s.heat);
        // left to burn, it spreads to the next unhappy block
        if (s.heat > .75 && c < .4 && cr.spots.length < cap && Math.random() < dt/50){ const t = best(H, s, 3); if (t && t.sc >= FORM*.5){ cr.spots.push({ i: t.i, j: t.j, heat: .3, h0: .3, p: 0, trail: [], id: ++cr.n }); E.emit('crimeSpread', { from: s, i: t.i, j: t.j }); } }
        if (s.p > 60){   // pressured for a minute: it drifts to the nearest unwatched unhappy homes, a third weaker
          s.p = 0; let to = null, bd = Infinity;
          for (const x of H){ if (x.u < .3) continue; const d = cheb(s.i, s.j, x.i, x.j); if (d < 1 || d > 7 || s.trail.some(y => y.i === x.i && y.j === x.j) || cov(x.i, x.j) >= .35 || cr.spots.some(o => o !== s && cheb(o.i, o.j, x.i, x.j) < 3) || wallBetween(s, x)) continue; if (d < bd){ bd = d; to = x; } }
          s.heat *= .67; s.trail.push({ i: s.i, j: s.j }); if (s.trail.length > 4) s.trail.shift();
          if (to){ s.i = to.i; s.j = to.j; E.emit('crimeMove', s); } else s.heat *= .5;
        }
        if (s.heat < .06 || (s.heat < s.h0*.25 && mood < GROW)){ cr.spots.splice(q, 1); E.emit('crimeGone', s); }
      }
    };
    // where the next one would form (the LIDAR Array shows it)
    C.forecast = () => { if (!LAST) return null; const t = best(homes()); return t && t.sc >= FORM*.6 ? t : null; };
    C.risk = (i, j) => clusterAt(homes(), i, j)/FORM;
    return C;
  })();

  /* ---------- dark floors: the levels nobody lives on yet stay unlit (world.js isDarkPlot asks) ---------- */
  const darkQ = [];
  E.dark = c => { const d = darkCalc(c); c._planDark = d; return d; };
  function darkCalc(c){
    if (!isBld(c)) return null;
    const b = B.get(keyOf(c)); if (!b) return CURB + .05;
    if (!b.powered) return true;
    if (c.lift || c.below) return b.lit > 0 ? (b.edge ? -2 : null) : CURB + .05;
    if (b.lit >= b.floors) return b.edge ? -2 : null;
    return (b.lit <= 0 ? CURB : (c.sectionTops && c.sectionTops[b.lit - 1]) || CURB + b.lit*3*FH) + .05;
  }
  function darkSync(){ for (const b of B.values()){ if (!b.c.data && !b.c.view) continue; const d = darkCalc(b.c); if (d !== (b.c._planDark === undefined ? null : b.c._planDark) && !darkQ.includes(b.c)) darkQ.push(b.c); } }
  function darkFlush(){
    while (darkQ.length){
      const c = darkQ.shift();
      if (cells.get(keyOf(c)) !== c || !c.sections.length) continue;
      if (typeof animCells !== 'undefined' && animCells.has && animCells.has(c)){ darkQ.push(c); return; }
      if (darkCalc(c) === (c._planDark === undefined ? null : c._planDark)) continue;
      try { if (typeof stageRefresh === 'function' && typeof STAGE_ON === 'function' && STAGE_ON() && typeof RW !== 'undefined' && RW.usable()) stageRefresh([c]); else refresh([c]); } catch (e) {}
      return;
    }
  }
  setInterval(() => { if (!document.hidden) darkFlush(); }, 450);

  /* ---------- events ---------- */
  const listeners = {};
  E.emit = (n, d) => { (listeners[n] || []).forEach(f => { try { f(d); } catch (e) { console.warn('plan event', n, e); } }); };
  E.onEv = (n, f) => (listeners[n] || (listeners[n] = [])).push(f);
  E.onEv('light', d => { const i = darkQ.indexOf(d.c); if (i >= 0) darkQ.splice(i, 1); darkQ.unshift(d.c); setTimeout(darkFlush, 0); });

  /* ---------- tiers ---------- */
  function unlockFor(t){
    for (let q = 0; q <= t; q++){ const ks = q === 0 ? START_KINDS : TIERS[q].opens || []; for (const k of ks) if (MEGA_TYPES[k] && typeof unlockMegaKind === 'function') unlockMegaKind(k); }
    for (let q = 1; q <= t; q++){ const d = TIERS[q].dial; if (d && !st.dialAt[d]) st.dialAt[d] = now(); }
    document.documentElement.classList.toggle('plan-nolux', t < 6);
    document.documentElement.classList.toggle('plan-noperim', t < 5);
    if (typeof renderBmenu === 'function') try { renderBmenu(); } catch (e) {}
    try { if (typeof $ === 'function' && $('tmenu')) $('tmenu').hidden = !E.transit('mt'); } catch (e) {}
    lensSync();
  }
  function onTier(t, live){
    REV++; unlockFor(t);
    E.emit('tier', t);
    save();
    if (!live) return;
    celebrate(t);
    if (typeof WIRELOG !== 'undefined' && WIRELOG.say) WIRELOG.say('SYS', `Sector status · ${TIERS[t].name}`);
  }
  E.coastOpen = () => st.tier >= TIERS.length - 1;
  E.transit = which => which === 'hw' ? st.tier >= 7 : st.tier >= 2;

  /* ---------- the rules on every build: what's open, and the ledger of what changed ---------- */
  function wrap(name, fn){ const orig = self[name]; if (typeof orig !== 'function') return; self[name] = function (){ return fn.call(this, orig, ...arguments); }; }
  const zoneNow = zone => ZONEK[zone] === 'I' && st.corp && st.tier >= 6 ? 'K' : ZONEK[zone];
  function zoneLocked(z){ if ((z === 'L' || z === 'K') && st.tier < 6){ say((z === 'L' ? 'Luxury' : 'Corps') + ' opens at ' + TIERS[6].name); return true; } return false; }
  const markCorp = (c, z) => { if (z !== 'K') return; for (const s of c.sections) if (s.zone === 'ind') s.corp = 1; if (c.below) for (const s of c.below) if (s.zone === 'ind') s.corp = 1; };
  let tilesN = 0;
  wrap('addPlatform', function (orig, i, j, zone){
    if (zone){ const z = zoneNow(zone); if (zoneLocked(z)) return null; ledgerMark(); const c = orig(i, j, zone); if (c){ markCorp(c, z); if (z === 'K') refresh([c]); E.emit('build', { c, z, fresh: true }); } return c; }
    ledgerMark(); const c = orig(i, j, zone); if (c){ tilesN++; E.emit('tile', { c }); } return c;
  });
  wrap('addSection', function (orig, c, zone, opt = {}){
    const fresh = !c.sections.length, z = zoneNow(zone), have = zoneOf(c);
    if (zoneLocked(z)) return;
    if (have && have !== z && !(have === 'K' && z === 'I')){ say(ZNAME[have] + ': only the same kind stacks on it'); return; }
    ledgerMark(); const n0 = c.sections.length, r = orig(c, zone, opt);
    if (c.sections.length > n0){ markCorp(c, have === 'K' ? 'K' : z); E.emit('build', { c, z, fresh }); }
    return r;
  });
  for (const nm of ['addLift', 'addFloatPod', 'addPodDown', 'addBelowUp']) wrap(nm, function (orig, c, a, b, d){
    const zone = nm === 'addLift' || nm === 'addFloatPod' ? b : a, z = zoneNow(zone); if (zoneLocked(z)) return null;
    const have = c && (c.sections.length || (c.below && c.below.length)) ? zoneOf(c) : null;
    if (have && have !== z && !(have === 'K' && z === 'I')){ say(ZNAME[have] + ': only the same kind stacks on it'); return null; }
    ledgerMark(); const r = orig(c, a, b, d); if (r) E.emit('build', { c, z }); return r;
  });
  for (const nm of ['removeSection', 'removePlatform', 'removeBelow', 'removePodSection', 'removeArea', 'removeMega', 'removeMegaTier', 'perimApply', 'removeWallTier', 'turnMega', 'addMegaTier', 'hwRemove', 'mtRemove', 'hwCutAt', 'mtCutAt']) wrap(nm, function (orig, ...a){ ledgerMark(); const r = orig(...a); E.emit('remove', {}); if (nm.includes('Mega')) try { renderBmenu(); } catch (e) {} return r; });
  // megastructures: at their tier; one each, apart from cores, police and scrubbers
  E.megaGate = kind => {
    const t = KIND_TIER[kind];
    if (t === undefined || t > st.tier){ say(MEGA_TYPES[kind].name + ' opens at ' + TIERS[t === undefined ? TIERS.length - 1 : t].name); return false; }
    if (!REPEAT.has(kind) && built(kind)){ say('One ' + MEGA_TYPES[kind].name + ' per city'); return false; }
    return true;
  };
  wrap('placeFromMenu', function (orig, kind, ci, cj, turned){
    if (!E.megaGate(kind)) return null;
    ledgerMark(); const m = orig(kind, ci, cj, turned);
    if (m){ E.emit('mega', { m, kind }); save(); try { renderBmenu(); } catch (e) {} }
    return m;
  });
  // Clear island: a fresh start, so a new starter core, and the old city's hotspots, refits and choices go with it
  wrap('clearIsland', function (orig, ...a){ const r = orig(...a); if (!st.tut.done){ st.tut = { step: 0, done: false, v: 2 }; setTimeout(() => { try { TUTE.restart(); } catch (e) {} }, 0); } st.fresh = true; st.crime.spots.length = 0; st.refit = {}; st.forks = {}; booted = false; BASE = null; REV++; save(); return r; });
  // always night, as in Economy: only the picture (sky, glows, window lights) is worked out as if it were this hour; the clock, people's days and
  // the stories run on as usual. The simulation never reads the hour, so nothing in the puzzle changes
  const NIGHT_HOUR = 23;
  wrap('phaseName', function (){ return 'Night'; });
  wrap('applyTime', function (orig){ if (typeof S === 'undefined') return orig(); const h = S.hour; S.hour = NIGHT_HOUR; try { return orig(); } finally { S.hour = h; } });
  wrap('fieldPlan', function (){ return []; });   // (no force-field dome over the cores here: their reach is the grid wave)
  wrap('maybeSpawnMegas', function (){ /* nothing arrives on its own here: the tiers open things, the player places them */ });
  wrap('mtApply', function (orig, t){ if (t && t.ok && st.tier < 2){ say('The metro opens at ' + TIERS[2].name); return false; } ledgerMark(); return orig(t); });
  wrap('hwApply', function (orig, t){ if (t && t.ok && st.tier < 7){ say('Sky highways open at ' + TIERS[7].name); return false; } ledgerMark(); return orig(t); });
  wrap('load', function (orig){ const ok = orig(); if (ok) try { step(1e-6, false); } catch (e) { console.warn('plan load', e); } return ok; });
  // a megastructure's line in the Buildings menu: what it does, in a few words
  const WHAT = { emitter: 'Powers up to 60 · some pollution', radio: 'Its music lifts one need, lowers another', scrubber: 'Removes pollution · noisy · shrinks a core\'s reach', square: 'Things to do nearby',
    wirenest: 'The city speaks up · crime map', market: 'Things to do and jobs · wants a station', foundry: 'Many jobs · heavy pollution and noise', police: 'Safety · less privacy',
    bathhouse: 'Homes nearby relax · loves waste heat', club: 'Things to do at night · loud after dark', lidar: 'Forecasts crime · no privacy nearby', greenhouse: 'Removes pollution, silent · big',
    mall: 'Things to do and jobs · blocks noise', pagoda: 'Luxury fills easily · rents rise', logistics: 'Shuttles workers to industry', spire: 'Exact forecasts · the coast' };
  E.menuText = kind => { const t = KIND_TIER[kind]; if (t !== undefined && t > st.tier) return 'Opens at ' + TIERS[t].name; const n = megaList(kind).length; return (WHAT[kind] || '') + (REPEAT.has(kind) && n ? ' · ' + n + ' built' : !REPEAT.has(kind) && n ? ' · built' : ''); };

  /* ---------- the clock ---------- */
  let lastT = now(), booted = false, needView = true, saveT = 0;
  function boot(){
    booted = true;
    if (st.fresh){
      st.fresh = false;
      const c0 = cells.get('0,0') || [...cells.values()][0];
      if (!megaList('emitter').length) try { const blk = findMegaBlock('emitter', c0); if (blk) spawnMegaAt('emitter', blk); } catch (e) { console.warn('plan starter', e); }
      try { if (typeof window.save === 'function') window.save(); } catch (e) {}
    }
    unlockFor(st.tier);
    lastT = now(); save();
  }
  function tick(){
    if (typeof cells === 'undefined') return;
    if (!booted){ if (cells.size < 1) return; boot(); }
    const t = now(), dt = Math.min(2, Math.max(0, (t - lastT)/1000)); lastT = t;
    step(dt, true);
    CRIME.tick(dt);
    if (needView && !(typeof TITLE !== 'undefined' && TITLE.on)){ needView = false; if (!st.tut.done) try { const m = megaList('emitter')[0]; if (m) camGoal.set(m.x, camGoal.y, m.z); zoomT = 12*(typeof ZK !== 'undefined' ? ZK : 1); } catch (e) {} }
    darkSync(); ui(); hintTick(); voiceTick(); ledgerTick();
    if ((saveT += dt) > 10){ saveT = 0; save(); }
  }
  let tickErr = 0; setInterval(() => { try { tick(); } catch (e) { if (tickErr++ < 5) console.error('plan tick', e); } }, 1000);

  /* ---------- the interface: kept small and quiet. A goal card, a row of lenses, one line from the city ---------- */
  const css = `
  html.plan { --p-bg: rgba(11,10,18,.9); --p-line: rgba(255,255,255,.12); --p-txt: #ece4d6; --p-dim: #958ea3; --p-acc: #8fe8d8; --p-warm: #ffb347; --p-good: #6ff0a8; --p-bad: #ff7a8a; }
  html.plan #modeHint { display: none !important; }
  html.plan .tmode { display: none !important; }
  html.plan #hour, html.plan #presets, html.plan label.tog:has(#cycle) { display: none !important; }   /* (always night here: the time controls would change nothing you can see) */
  html.plan-nolux .zone[data-zone="high"], html.plan-nolux [data-perim="high"] { display: none !important; }
  html.plan-noperim .perim { display: none !important; }
  .pl-goal { position: fixed; z-index: 4; left: max(16px, env(safe-area-inset-left,0px)); top: calc(40px + env(safe-area-inset-top,0px)); width: 214px; box-sizing: border-box;
    font: 12px/1.3 'JetBrains Mono', ui-monospace, monospace; color: var(--p-txt); background: var(--p-bg); border: 1px solid var(--p-line); padding: 10px 12px 11px; }
  .pl-goal .k { display: flex; justify-content: space-between; align-items: baseline; color: var(--p-dim); font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; }
  .pl-goal .k button { all: unset; cursor: pointer; color: var(--p-dim); font-size: 12px; padding: 0 2px; letter-spacing: 0; } .pl-goal .k button:hover, .pl-goal .k button:focus-visible { color: #fff; }
  .pl-goal .n { font-size: 16px; letter-spacing: .08em; color: #fff; margin: 3px 0 8px; }
  .pl-goal .r { margin-top: 6px; } .pl-goal .r div { display: flex; justify-content: space-between; color: var(--p-dim); font-size: 11px; } .pl-goal .r b { color: var(--p-txt); font-weight: 500; font-variant-numeric: tabular-nums; }
  .pl-goal .bar { height: 3px; background: rgba(255,255,255,.1); margin-top: 4px; overflow: hidden; } .pl-goal .bar i { display: block; height: 100%; background: var(--p-acc); transition: width .6s; }
  .pl-goal .r.ok b { color: var(--p-good); } .pl-goal .r.ok .bar i { background: var(--p-good); }
  .pl-goal.bump { animation: plBump .5s ease-out; } @keyframes plBump { 0% { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(143,232,216,.18); } 100% { box-shadow: none; } }
  .pl-lens { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); top: calc(10px + env(safe-area-inset-top,0px)); display: flex; gap: 2px; font: 11px/1 'JetBrains Mono', monospace; background: var(--p-bg); border: 1px solid var(--p-line); padding: 3px; }
  .pl-lens button { all: unset; cursor: pointer; padding: 7px 11px; color: var(--p-dim); letter-spacing: .12em; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
  .pl-lens button i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); opacity: .7; }
  .pl-lens button:hover, .pl-lens button:focus-visible { color: #fff; } .pl-lens button[aria-pressed="true"] { color: #0c0b12; background: var(--c); } .pl-lens button[aria-pressed="true"] i { background: #0c0b12; }
  .pl-lens button.fresh { animation: plPulse 1.2s ease-in-out 5; }
  .pl-voice { all: unset; box-sizing: border-box; cursor: pointer; position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); top: calc(52px + env(safe-area-inset-top,0px)); max-width: min(560px, calc(100vw - 480px));
    font: 12px/1.4 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.78); border-left: 2px solid var(--p-warm); padding: 6px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .6s; }
  .pl-voice[hidden] { display: none; } .pl-voice em { font-style: normal; color: var(--p-warm); } .pl-voice small { color: var(--p-dim); font-size: 11px; }
  .pl-voice:hover, .pl-voice:focus-visible { background: rgba(11,10,18,.95); }
  .pl-ledger { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); top: calc(88px + env(safe-area-inset-top,0px)); pointer-events: none; font: 13px/1.3 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.88); padding: 6px 12px; white-space: nowrap; opacity: 0; transition: opacity .4s; }
  .pl-ledger.on { opacity: 1; } .pl-ledger b { font-weight: 600; } .pl-ledger b.up { color: var(--p-good); } .pl-ledger b.dn { color: var(--p-bad); } .pl-ledger span { color: var(--p-dim); }
  .pl-chip { position: fixed; z-index: 6; pointer-events: none; transform: translate(16px, -130%); font: 600 15px/1 'JetBrains Mono', monospace; padding: 6px 9px; background: rgba(11,10,18,.92); border: 1px solid currentColor; white-space: nowrap; }
  .pl-chip[hidden] { display: none; } .pl-chip.up { color: var(--p-good); } .pl-chip.dn { color: var(--p-bad); } .pl-chip.flat { color: var(--p-dim); } .pl-chip small { display: block; margin-top: 4px; font: 400 11px/1.2 'JetBrains Mono', monospace; color: var(--p-dim); }
  .pl-card { position: fixed; z-index: 7; width: 252px; box-sizing: border-box; font: 12px/1.35 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.96); border: 1px solid var(--p-line); padding: 11px 12px 12px; }
  .pl-card[hidden] { display: none; } .pl-card.hov { pointer-events: none; } .pl-card .t { display: flex; justify-content: space-between; align-items: baseline; } .pl-card .t b { font-size: 13px; font-weight: 600; } .pl-card .t span { color: var(--p-dim); font-size: 11px; }
  .pl-card .tag { display: inline-block; margin-top: 5px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #0c0b12; background: var(--p-good); padding: 2px 6px; }
  .pl-card .d { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 4px 8px; margin-top: 9px; } .pl-card .d span { color: var(--p-dim); font-size: 11px; }
  .pl-card .d .bar { height: 4px; background: rgba(255,255,255,.1); } .pl-card .d .bar i { display: block; height: 100%; background: #9a93a8; } .pl-card .d .lo { color: var(--p-warm); } .pl-card .d .bar.lo i { background: var(--p-warm); }
  .pl-card .fix { margin-top: 9px; color: var(--p-warm); font-size: 11.5px; } .pl-card .fix.ok { color: var(--p-good); }
  .pl-card .opts { display: grid; gap: 6px; margin-top: 9px; } .pl-card .opts button { all: unset; cursor: pointer; padding: 8px 10px; border: 1px solid var(--p-line); display: block; }
  .pl-card .opts button b { display: block; font-weight: 600; } .pl-card .opts button small { color: var(--p-dim); font-size: 11px; } .pl-card .opts button:hover, .pl-card .opts button:focus-visible { border-color: var(--p-acc); }
  .pl-card .opts button[aria-pressed="true"] { border-color: var(--p-acc); background: rgba(143,232,216,.1); } .pl-card .opts button[disabled] { opacity: .45; cursor: default; }
  .pl-card .x { all: unset; cursor: pointer; color: var(--p-dim); padding: 0 2px; } .pl-card .x:hover { color: #fff; }
  .pl-card .load { margin-top: 9px; } .pl-card .load > div:first-child { display: flex; justify-content: space-between; } .pl-card .load span { color: var(--p-dim); font-size: 11px; } .pl-card .load b.bad { color: var(--p-bad); }
  .pl-card .load .bar, .pl-card .fix .bar { height: 4px; background: rgba(255,255,255,.1); margin-top: 4px; } .pl-card .bar i { display: block; height: 100%; background: var(--p-acc); } .pl-card .bar.mid i { background: #ffc24a; } .pl-card .bar.bad i { background: var(--p-bad); }
  .pl-card .load small { display: block; margin-top: 5px; color: var(--p-dim); font-size: 10.5px; } .pl-card .fix .bar { margin-top: 6px; }
  .pl-card .row { display: flex; gap: 6px; margin-top: 9px; } .pl-card .row button { all: unset; cursor: pointer; font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--p-acc); padding: 6px 0; }
  .pl-note { position: fixed; z-index: 7; width: min(330px, calc(100vw - 24px)); box-sizing: border-box; font: 14px/1.45 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.96); border: 1px solid rgba(143,232,216,.4); border-left: 3px solid var(--p-acc); padding: 12px 14px; right: 18px; bottom: 150px; }
  .pl-note[hidden] { display: none; } .pl-note .say { display: block; font-size: 15px; color: #fff; } .pl-note .sub { display: block; margin-top: 5px; color: #b6aec4; font-size: 12.5px; }
  .pl-note .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 11px; flex-wrap: wrap; } .pl-note .n { color: var(--p-dim); font-size: 11px; font-variant-numeric: tabular-nums; }
  .pl-note .bt { display: flex; gap: 4px; margin-left: auto; } .pl-note button { all: unset; box-sizing: border-box; cursor: pointer; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--p-dim); padding: 7px 10px; white-space: nowrap; } .pl-note button:hover { color: #fff; }
  .pl-note button.go { color: #0c0b12; background: var(--p-acc); }
  .pl-lead { position: fixed; z-index: 6; height: 2px; transform-origin: 0 50%; background: linear-gradient(90deg, rgba(143,232,216,.85), rgba(143,232,216,.25)); pointer-events: none; }
  .pl-lead::after { content: ''; position: absolute; right: -6px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: #8fe8d8; box-shadow: 0 0 10px #8fe8d8; }
  .pl-lead[hidden] { display: none; } html.plan.title-on .pl-lead { display: none; }
  .pl-note.done { animation: plDone .45s ease-out; } @keyframes plDone { 0% { box-shadow: 0 0 0 6px rgba(111,240,168,.25); } 100% { box-shadow: none; } }
  .pl-pulse { animation: plPulse 1.2s ease-in-out infinite !important; position: relative; z-index: 5; }
  @keyframes plPulse { 0%, 100% { box-shadow: 0 0 0 1px rgba(143,232,216,.9); } 50% { box-shadow: 0 0 0 1px rgba(143,232,216,.9), 0 0 16px 4px rgba(143,232,216,.45); } }
  .pl-say { position: fixed; z-index: 6; left: 50%; top: calc(120px + env(safe-area-inset-top,0px)); transform: translateX(-50%); font: 13px/1.4 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.95); border: 1px solid var(--p-line); padding: 7px 12px; pointer-events: none; }
  .pl-say[hidden] { display: none; }
  .pl-float { position: fixed; z-index: 5; pointer-events: none; font: 600 13px/1 'JetBrains Mono', monospace; color: #dffef4; text-shadow: 0 1px 0 #000; background: rgba(10,8,18,.7); padding: 4px 7px; transform: translate(-50%, -50%); animation: plFloat 1.5s ease-out forwards; white-space: nowrap; }
  .pl-float.big { font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: #fff; }
  @keyframes plFloat { 0% { opacity: 0; transform: translate(-50%, -30%); } 15% { opacity: 1; transform: translate(-50%, -70%); } 75% { opacity: 1; transform: translate(-50%, -150%); } 100% { opacity: 0; transform: translate(-50%, -190%); } }
  .pl-class { position: fixed; z-index: 8; left: 50%; top: 24%; transform: translate(-50%, 0); text-align: center; pointer-events: none; font-family: 'JetBrains Mono', monospace; color: #fff; width: min(560px, calc(100vw - 32px)); }
  .pl-class .k { font-size: 11px; letter-spacing: .4em; text-transform: uppercase; color: var(--p-acc); animation: plIn .5s ease-out both; }
  .pl-class .n { font-size: clamp(28px, 6vw, 50px); letter-spacing: .14em; text-transform: uppercase; margin: 6px 0 14px; text-shadow: 0 0 18px rgba(143,232,216,.8), 0 0 2px #fff; animation: plBig .9s cubic-bezier(.2,1.4,.4,1) both; }
  .pl-class .cards { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; } .pl-class .cards span { font-size: 12.5px; padding: 6px 10px; background: rgba(11,10,18,.92); border: 1px solid rgba(143,232,216,.5); color: #dffef4; animation: plIn .45s ease-out both; }
  .pl-class.out { animation: plOut .6s ease-in forwards; }
  @keyframes plBig { 0% { opacity: 0; transform: scale(1.7); filter: blur(6px); } 100% { opacity: 1; transform: none; filter: none; } }
  @keyframes plIn { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: none; } }
  @keyframes plOut { to { opacity: 0; transform: translate(-50%, -14px); } }
  .pl-badge { position: fixed; z-index: 60; right: max(18px, env(safe-area-inset-right,0px)); top: calc(14px + env(safe-area-inset-top,0px)); font: 11px/1 'JetBrains Mono', monospace; letter-spacing: .3em; text-transform: uppercase; color: var(--p-acc); border: 1px solid rgba(143,232,216,.45); padding: 6px 9px; pointer-events: none; display: none; }
  html.plan.title-on .pl-badge { display: block; } html.plan.title-on .pl-goal, html.plan.title-on .pl-lens, html.plan.title-on .pl-voice, html.plan.title-on .pl-note { display: none; }
  .pl-legend { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); bottom: calc(118px + env(safe-area-inset-bottom,0px)); display: flex; gap: 12px; align-items: center; font: 11px/1 'JetBrains Mono', monospace; color: var(--p-dim); background: rgba(11,10,18,.85); padding: 7px 11px; pointer-events: none; white-space: nowrap; }
  .pl-legend[hidden] { display: none; } .pl-legend span { display: flex; gap: 6px; align-items: center; } .pl-legend i { width: 11px; height: 11px; display: inline-block; }
  .pl-corp { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); bottom: calc(118px + env(safe-area-inset-bottom,0px)); display: flex; font: 11px/1 'JetBrains Mono', monospace; border: 1px solid rgba(232,224,58,.5); background: rgba(11,10,18,.92); }
  .pl-corp[hidden] { display: none; } .pl-corp button { all: unset; cursor: pointer; padding: 8px 13px; color: var(--p-dim); letter-spacing: .12em; text-transform: uppercase; } .pl-corp button[aria-pressed="true"] { color: #0c0b12; background: #e8e03a; }
  .pl-goal .bal { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--p-line); } .pl-goal .bal .hd { color: var(--p-dim); font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 2px; }
  .pl-goal .bl { margin-top: 5px; } .pl-goal .bl > div:first-child { display: flex; justify-content: space-between; color: var(--p-dim); font-size: 11px; } .pl-goal .bl b { font-weight: 500; color: var(--p-txt); font-variant-numeric: tabular-nums; }
  .pl-goal .bl.lo b { color: var(--p-bad); } .pl-goal .bl.hi b { color: #ffc24a; } .pl-goal .bl.ok b { color: var(--p-good); }
  .pl-goal .cb, .pl-goal .fb { position: relative; height: 4px; background: rgba(255,255,255,.08); margin-top: 3px; } .pl-goal .cb::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(255,255,255,.5); }
  .pl-goal .cb i, .pl-goal .fb i { position: absolute; top: 0; bottom: 0; display: block; } .pl-goal .fb i { left: 0; background: var(--p-acc); }
  .pl-goal .bl.lo .cb i { background: var(--p-bad); } .pl-goal .bl.hi .cb i { background: #ffc24a; } .pl-goal .bl.ok .cb i { background: var(--p-good); }
  .pl-goal .r.thr { cursor: pointer; margin-left: -4px; margin-right: -4px; padding: 2px 4px 3px; } .pl-goal .r.thr:hover, .pl-goal .r.thr:focus-visible { background: rgba(255,255,255,.06); outline: none; }
  .pl-card .d .bar { position: relative; } .pl-card .d .bar u { position: absolute; top: -2px; bottom: -2px; width: 1px; background: rgba(255,255,255,.35); }
  .pl-card .d .mid { color: #ffc24a; } .pl-card .d .bar.mid i { background: #c99a3a; }
  .pl-card .nt { margin-top: 8px; display: grid; gap: 3px; font-size: 11px; } .pl-card .nt .bad { color: var(--p-bad); } .pl-card .nt .mid { color: var(--p-dim); }
  .pl-legend .gr { gap: 8px; } .pl-legend .gr b { width: 92px; height: 8px; display: inline-block; }
  .pl-legend i.src { width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle, #fff 0 25%, var(--c) 45%, transparent 72%); box-shadow: 0 0 6px var(--c); }
  .pl-legend .hk { gap: 4px; } .pl-legend .hk i { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px #0b0a12; margin-left: 4px; }
  .pl-thr { position: fixed; z-index: 5; left: calc(max(16px, env(safe-area-inset-left,0px)) + 222px); top: calc(40px + env(safe-area-inset-top,0px)); width: 260px; box-sizing: border-box;
    font: 12px/1.35 'JetBrains Mono', monospace; color: var(--p-txt); background: rgba(11,10,18,.95); border: 1px solid var(--p-line); padding: 10px 12px 12px; }
  .pl-thr[hidden] { display: none; } .pl-thr .t { display: flex; justify-content: space-between; align-items: baseline; } .pl-thr .t b { font-size: 13px; }
  .pl-thr button { all: unset; cursor: pointer; } .pl-thr .x { color: var(--p-dim); } .pl-thr .x:hover { color: #fff; }
  .pl-thr .nav { display: flex; align-items: center; gap: 8px; margin: 9px 0 8px; } .pl-thr .nav > div { flex: 1; text-align: center; } .pl-thr .nav b { display: block; font-size: 15px; color: #fff; letter-spacing: .06em; }
  .pl-thr .nav small { color: var(--p-dim); font-size: 10.5px; } .pl-thr .nav button { font-size: 18px; color: var(--p-acc); padding: 2px 8px; border: 1px solid var(--p-line); } .pl-thr .nav button:hover { border-color: var(--p-acc); }
  .pl-thr .rows { display: grid; gap: 2px; } .pl-thr .rows button { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 5px 7px; border-left: 2px solid transparent; }
  .pl-thr .rows button span { color: var(--p-dim); } .pl-thr .rows button b { font-weight: 500; font-variant-numeric: tabular-nums; } .pl-thr .rows button i { grid-column: 1 / -1; height: 3px; background: rgba(255,74,90,.45); }
  .pl-thr .rows button i u { display: block; height: 100%; background: #4dff9a; } .pl-thr .rows button:hover { background: rgba(255,255,255,.05); }
  .pl-thr .rows button[aria-pressed="true"] { border-left-color: var(--p-acc); background: rgba(143,232,216,.08); } .pl-thr .rows button[aria-pressed="true"] span { color: #fff; }
  .pl-thr .k { display: flex; gap: 6px; align-items: center; margin-top: 9px; color: var(--p-dim); font-size: 10.5px; } .pl-thr .k i { width: 9px; height: 9px; display: inline-block; } .pl-thr .k i:last-of-type { margin-left: 8px; }
  html.touch .pl-thr { left: 50%; top: auto; bottom: calc(150px + env(safe-area-inset-bottom,0px)); transform: translateX(-50%); width: min(320px, calc(100vw - 24px)); }
  html.plan.title-on .pl-thr { display: none; }
  html.plan .gdeck { top: calc(var(--pl-goal-b, 160px) + 10px); }
  html.plan:not(.gdeck-on) .bmenu { top: calc(var(--pl-goal-b, 160px) + 12px); }
  html.touch .pl-goal { top: calc(54px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); width: 176px; padding: 8px 10px; }
  html.touch .pl-goal .n { font-size: 14px; margin-bottom: 5px; }
  html.touch .pl-lens { top: auto; left: max(12px, env(safe-area-inset-left,0px)); transform: none; bottom: auto; top: calc(var(--pl-goal-b, 150px) + 8px); }
  html.touch .pl-lens button { padding: 8px 9px; font-size: 10px; }
  html.touch .pl-voice { top: auto; bottom: calc(150px + env(safe-area-inset-bottom,0px)); max-width: calc(100vw - 32px); white-space: normal; }
  html.touch .pl-ledger { top: calc(10px + env(safe-area-inset-top,0px)); }
  html.touch .pl-note { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(150px + env(safe-area-inset-bottom,0px)); font-size: 13.5px; }
  html.touch .pl-card { left: 50% !important; top: auto !important; bottom: calc(150px + env(safe-area-inset-bottom,0px)); transform: translateX(-50%); width: min(300px, calc(100vw - 24px)); }
  html.touch .pl-legend, html.touch .pl-corp { bottom: calc(210px + env(safe-area-inset-bottom,0px)); }
  @media (max-width: 900px) { html:not(.touch) .pl-voice { max-width: calc(100vw - 260px); } html:not(.touch) .pl-note { right: auto; left: 50%; transform: translateX(-50%); } }
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = n => Math.round(n).toLocaleString('en-US');

  { const bd = el('div', 'pl-badge', 'Planner'); bd.setAttribute('aria-hidden', 'true'); document.body.appendChild(bd); }
  // the goal: the next tier, its two bars
  const goalEl = el('div', 'pl-goal'); goalEl.setAttribute('role', 'status'); goalEl.setAttribute('aria-label', 'Next goal'); document.body.appendChild(goalEl);
  // (built once per shape; the numbers, bars and colors are then set in place, so a highlight on it keeps going and a click on it is never lost)
  let goalKey = '';
  function goal(){
    const r = E.r || { res: 0, thr: 0 }, done = st.tier >= TIERS.length - 1, nt = TIERS[Math.min(st.tier + 1, TIERS.length - 1)];
    const V = {}, W = {}, C = {};
    let html;
    if (done){ html = `<div class="k"><span>${esc(TIERS[st.tier].name)}</span><button type="button" data-help aria-label="Replay the tutorial">?</button></div><div class="n"><span data-v="res"></span> residents</div><div class="r thr" data-thr role="button" tabindex="0"><div><span>Thriving homes ›</span><b data-v="thr"></b></div></div>`;
      V.res = fmt(r.res); V.thr = String(Math.floor(r.thr + .5)); }
    else {
      const a = Math.min(1, r.res/nt.res), b = Math.min(1, (r.thr + .5 | 0)/nt.thr);
      html = `<div class="k"><span>Next</span><button type="button" data-help aria-label="Replay the tutorial">?</button></div><div class="n">${esc(nt.name)}</div>` +
        `<div class="r" data-c="ra" title="Residents with jobs: only they count toward goals"><div><span>Residents with jobs</span><b data-v="res"></b></div><div class="bar"><i data-w="ra"></i></div></div>` +
        `<div class="r thr" data-c="rb" data-thr role="button" tabindex="0" title="See what each home is missing"><div><span>Thriving homes ›</span><b data-v="thr"></b></div><div class="bar"><i data-w="rb"></i></div></div>`;
      V.res = `${fmt(Math.min(r.res, nt.res))} / ${fmt(nt.res)}`; V.thr = `${Math.min(nt.thr, r.thr + .5 | 0)} / ${nt.thr}`;
      W.ra = `width:${(100*a).toFixed(1)}%`; W.rb = `width:${(100*b).toFixed(1)}%`; C.ra = 'r' + (a >= 1 ? ' ok' : ''); C.rb = 'r thr' + (b >= 1 ? ' ok' : '');
    }
    html += balance(V, W, C);
    if (html !== goalKey){ goalKey = html; goalEl.innerHTML = html; }
    for (const e of goalEl.querySelectorAll('[data-v]')){ const v = V[e.dataset.v]; if (v !== undefined && e.textContent !== v) e.textContent = v; }
    for (const e of goalEl.querySelectorAll('[data-w]')){ const v = W[e.dataset.w]; if (v !== undefined && e.getAttribute('style') !== v) e.setAttribute('style', v); }
    for (const e of goalEl.querySelectorAll('[data-c]')){ const v = C[e.dataset.c]; if (v !== undefined && e.className !== v) e.className = v; }
    stackLeft();
  }
  // the city's balance: how full the homes are, and whether there are too few or too many jobs and things to do for the people the homes hold
  function balance(V, W, C){
    if (!LAST || !LAST.tot) return '';
    const t = LAST.tot, hs = LAST.H.filter(h => isHome(h.z) && h.powered); if (!hs.length) return '';
    let liv = 0, room = 0; for (const h of hs){ const b = B.get(h.k); room += h.people; liv += b ? b.occ/h.floors*h.people : 0; }
    const row = (key, name, need, have, tip) => {
      const d = have - need, base = Math.max(1, need), f = Math.max(-1, Math.min(1, d/base)), ok = Math.abs(d) <= .1*base;
      V[key] = !need && !have ? '–' : ok ? 'balanced' : d < 0 ? `short ${fmt(-d)}` : `${fmt(d)} spare`;
      C[key] = 'bl ' + (ok ? 'ok' : d < 0 ? 'lo' : 'hi');
      W[key] = f < 0 ? `right:50%;width:${(50*-f).toFixed(1)}%` : `left:50%;width:${(50*f).toFixed(1)}%`;
      return `<div class="bl" data-c="${key}" title="${esc(tip)}"><div><span>${name}</span><b data-v="${key}"></b></div><div class="cb"><i data-w="${key}"></i></div></div>`; };
    V.bh = `${fmt(liv)} / ${fmt(room)}`; W.bh = `width:${room ? (100*liv/room).toFixed(1) : 0}%`;
    return `<div class="bal" data-bal><div class="hd">City balance</div>` +
      `<div class="bl res" title="Everyone living in your powered homes, out of the room they have"><div><span>Homes filled</span><b data-v="bh"></b></div><div class="fb"><i data-w="bh"></i></div></div>` +
      row('bj', 'Jobs', t.workers, t.jobs, 'Workers a full city would have (half its residents) against the jobs there are. Short: build industry or shops. Spare: room for more homes.') +
      row('bt', 'Things to do', t.people, t.life, 'Residents a full city would have against room at shops and squares. Short: build shops. Spare: room for more homes.') + `</div>`;
  }
  goalEl.addEventListener('click', e => { if (e.target.closest('[data-help]')) TUTE.replay(); else if (e.target.closest('[data-thr]')) THR.open(); });
  goalEl.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-thr]')){ e.preventDefault(); THR.open(); } });
  let stackT = 0;
  function stackLeft(){ cancelAnimationFrame(stackT); stackT = requestAnimationFrame(() => { const de = document.documentElement, r = goalEl.getBoundingClientRect(); if (r.height){ const b = Math.ceil(r.bottom) + 'px'; if (de.style.getPropertyValue('--pl-goal-b') !== b) de.style.setProperty('--pl-goal-b', b); } }); }

  // the views: one at a time (V cycles). Power has no view: each core sends a wave over its reach instead (WAVE, below)
  const LENSES = [
    { id: 'air', name: 'Pollution', c: '#e8d84a', at: 0 },
    { id: 'noise', name: 'Noise', c: '#c77dff', at: 0 },
    { id: 'safety', name: 'Safety', c: '#7fb4ff', at: 0, keys: [['#4f8fff', 'Watched over'], ['#b06aff', 'No privacy'], ['#ff3a4a', 'Crime']] },
  ];
  const lensEl = el('div', 'pl-lens'); lensEl.setAttribute('role', 'group'); lensEl.setAttribute('aria-label', 'Views'); document.body.appendChild(lensEl);
  let lens = null, lensTemp = null;
  function lensSync(){
    const html = LENSES.filter(l => st.tier >= l.at).map(l => `<button type="button" data-l="${l.id}" style="--c:${l.c}" aria-pressed="${(lensTemp || lens) === l.id}" title="${l.name} view (V cycles)"><i></i>${l.name}</button>`).join('');
    if (lensEl.innerHTML !== html){ const prev = new Set([...lensEl.querySelectorAll('button')].map(b => b.dataset.l)); lensEl.innerHTML = html; lensEl.querySelectorAll('button').forEach(b => { if (prev.size && !prev.has(b.dataset.l)) b.classList.add('fresh'); }); }
    else lensEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((lensTemp || lens) === b.dataset.l)));
  }
  lensEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; b.classList.remove('fresh'); setLens(lens === b.dataset.l ? null : b.dataset.l); E.emit('lens', lens); });
  function setLens(id){ lens = id; if (id) THR.close(); lensSync(); VIEW.draw(); }
  addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey && !e.altKey){ const ls = [null, ...LENSES.filter(l => st.tier >= l.at).map(l => l.id)]; setLens(ls[(ls.indexOf(lens) + 1) % ls.length]); E.emit('lens', lens); }
    if (e.key === 'Escape'){ if (lens) setLens(null); THR.close(); hideCard(); } });

  const VSW = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
  // (layer 1 is drawn after the cached city with its depth put back, so these sit in the scene: buildings hide the ground under them)
  const overlayMat = (fs, uni, add) => { const m = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VSW, fragmentShader: fs, transparent: true, depthTest: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }); m.extensions = { derivatives: true }; return m; };
  const onLayer = (o, order) => { o.layers.set(1); o.renderOrder = order; o.frustumCulled = false; if (typeof scene !== 'undefined') scene.add(o); return o; };

  /* ---------- a building lit in a color: thin bright edges, a faint fill (the furnish hologram's look), for the views and the thriving check ---------- */
  const TINT = (() => {
    const N = 1600, ig = new THREE.BoxGeometry(1, 1, 1);
    const aCol = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3), aPulse = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    ig.setAttribute('aCol', aCol); ig.setAttribute('aPulse', aPulse);
    const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aCol; attribute float aPulse; varying vec3 vC; varying float vP; varying vec2 vUv; varying vec3 vN; varying vec3 vS;
        void main(){ vC = aCol; vP = aPulse; vUv = uv; vN = normal; mat4 im = instanceMatrix; vS = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz)); gl_Position = projectionMatrix*viewMatrix*modelMatrix*im*vec4(position, 1.); }`,
      fragmentShader: `uniform float uT; varying vec3 vC; varying float vP; varying vec2 vUv; varying vec3 vN; varying vec3 vS;
        void main(){ vec2 sz = abs(vN.y) > .5 ? vS.xz : abs(vN.x) > .5 ? vS.zy : vS.xy; vec2 dm = min(vUv, 1. - vUv)*sz; float d = min(dm.x, dm.y);
          float ln = 1. - smoothstep(.06, .16, d), gl = exp(-d/.3)*.5, fill = abs(vN.y) > .5 ? .35 : .2;
          float k = vP > .5 ? .55 + .45*sin(uT*5. + vP) : 1.;
          gl_FragColor = vec4(vC*(ln + gl + fill)*k, 1.); }` });
    const mesh = new THREE.InstancedMesh(ig, mat, N); mesh.count = 0; onLayer(mesh, 994); mesh.visible = false;
    const m4 = new THREE.Matrix4(), qi = new THREE.Quaternion(), p_ = new THREE.Vector3(), s_ = new THREE.Vector3(), cc = new THREE.Color();
    (function run(){ requestAnimationFrame(run); if (mesh.visible) mat.uniforms.uT.value = performance.now()/1000; })();
    // list: [{ c (a plot) or m (a megastructure), col, pulse }]
    function set(list){
      let n = 0;
      for (const it of list || []){ if (n >= N) break; cc.set(it.col);
        if (it.m){ const m = it.m; p_.set(m.x, ((m.top || CURB + 6) + CURB)/2, m.z); s_.set(m.w*LOT - .5, Math.max(1, (m.top || CURB + 6) - CURB), m.h*LOT - .5); }
        else { const c = it.c, y0 = c.lift && !(c.below && c.below.length) ? c.lift.y : CURB, y1 = Math.max(y0 + .6, c.height || CURB + 3); p_.set(c.x, (y0 + y1)/2, c.z); s_.set(SIDE + .16, y1 - y0 + .1, SIDE + .16); }
        m4.compose(p_, qi, s_); mesh.setMatrixAt(n, m4); aCol.setXYZ(n, cc.r, cc.g, cc.b); aPulse.setX(n, it.pulse ? 1 + (n % 7) : 0); n++; }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; aCol.needsUpdate = true; aPulse.needsUpdate = true; mesh.visible = n > 0;
    }
    return { set, clear(){ mesh.count = 0; mesh.visible = false; } };
  })();
  /* ---------- a pin over a building: a round badge, dark-rimmed so it reads over any color under it (fine, so-so, poor, a source) ---------- */
  const PINS = (() => {
    const mk = (fill, draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 96; const g = cv.getContext('2d');
      g.beginPath(); g.arc(48, 44, 34, 0, Math.PI*2); g.fillStyle = '#0b0a12'; g.fill(); g.beginPath(); g.arc(48, 44, 28, 0, Math.PI*2); g.fillStyle = fill; g.fill();
      g.beginPath(); g.moveTo(36, 74); g.lineTo(48, 92); g.lineTo(60, 74); g.closePath(); g.fillStyle = '#0b0a12'; g.fill();
      g.strokeStyle = '#0b0a12'; g.fillStyle = '#0b0a12'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; draw(g);
      const t = new THREE.CanvasTexture(cv); return t; };
    const TEX = {
      good: mk('#4dff9a', g => { g.beginPath(); g.moveTo(34, 45); g.lineTo(44, 55); g.lineTo(62, 34); g.stroke(); }),
      mid: mk('#ffc24a', g => { g.beginPath(); g.moveTo(48, 28); g.lineTo(48, 48); g.stroke(); g.beginPath(); g.arc(48, 59, 4.5, 0, Math.PI*2); g.fill(); }),
      bad: mk('#ff4a5a', g => { g.beginPath(); g.moveTo(37, 33); g.lineTo(59, 55); g.moveTo(59, 33); g.lineTo(37, 55); g.stroke(); }),
      air: mk('#ffffff', g => { g.lineWidth = 6; for (const y of [34, 45, 56]){ g.beginPath(); g.moveTo(31, y); g.bezierCurveTo(38, y - 6, 44, y + 6, 50, y); g.bezierCurveTo(56, y - 6, 60, y + 4, 65, y); g.stroke(); } }),
      noise: mk('#ffffff', g => { g.beginPath(); g.moveTo(30, 38); g.lineTo(38, 38); g.lineTo(48, 29); g.lineTo(48, 59); g.lineTo(38, 50); g.lineTo(30, 50); g.closePath(); g.fill(); g.lineWidth = 5; g.beginPath(); g.arc(50, 44, 10, -.8, .8); g.stroke(); g.beginPath(); g.arc(50, 44, 17, -.8, .8); g.stroke(); }),
    };
    const pool = [], live = [];
    const get = () => { const sp = pool.pop() || onLayer(new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })), 1001); sp.center.set(.5, 0); sp.visible = true; return sp; };
    (function run(){ requestAnimationFrame(run); if (!live.length) return; const t = performance.now()/1000;
      for (const sp of live) if (sp.userData.src) sp.scale.setScalar(sp.userData.s*(1 + .12*Math.sin(t*5 + sp.userData.ph))); })();
    // list: [{ c (a plot) or m (a megastructure), kind: good | mid | bad | air | noise }]
    function set(list){
      while (live.length){ const sp = live.pop(); sp.visible = false; pool.push(sp); }
      for (const it of list || []){ if (live.length >= 400) break; const sp = get(); sp.material.map = TEX[it.kind]; sp.material.needsUpdate = true;
        let x, y, z, sz; if (it.m){ x = it.m.x; z = it.m.z; y = (it.m.top || CURB + 6) + .6; sz = 2.6; } else { const c = it.c; x = c.x; z = c.z; y = Math.max(CURB + 1, c.height || CURB + 3) + .5; sz = 1.9; }
        const src = it.kind === 'air' || it.kind === 'noise'; if (src) sz *= 1.25;
        sp.position.set(x, y, z); sp.scale.setScalar(sz); sp.userData = { src, s: sz, ph: (x + z)*.37 }; live.push(sp); }
    }
    return { set, clear(){ set([]); } };
  })();
  // how a home is doing on one measure: good, so-so, poor
  const GRADE = { good: '#4dff9a', mid: '#ffc24a', bad: '#ff4a5a' };
  const grade = v => v >= .7 ? GRADE.good : v >= .4 ? GRADE.mid : GRADE.bad;

  /* ---------- the views ----------
     Air: the haze as a weather radar paints rain, cool where it's light, hot where it's thick, in coarse grains that drift with the wind; its sources
     glow and pulse. Noise: violet rings spreading out from each loud place, brighter and pinker where it's loud. Homes are lit by how they're doing. */
  const VIEW = (() => {
    const leg = el('div', 'pl-legend'); leg.hidden = true; document.body.appendChild(leg);
    // the field: one plane over the city, a small texture of haze (red) and noise (green) per plot, colored in the shader
    const FS = `uniform sampler2D tF; uniform float uMode; uniform float uT; uniform vec4 uG; uniform float uLOT; uniform vec2 uWind; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      vec3 ramp(float p){ vec3 c = vec3(.06, .22, .42);
        c = mix(c, vec3(.1, .55, .72), smoothstep(.25, .5, p)); c = mix(c, vec3(.24, .78, .34), smoothstep(.5, .85, p)); c = mix(c, vec3(.96, .86, .24), smoothstep(.85, 1.2, p));
        c = mix(c, vec3(.98, .52, .14), smoothstep(1.2, 1.6, p)); c = mix(c, vec3(.92, .16, .14), smoothstep(1.6, 2., p)); c = mix(c, vec3(.84, .2, .86), smoothstep(2., 2.5, p)); return mix(c, vec3(1.), smoothstep(2.6, 3.2, p)); }
      void main(){
        vec2 uv = vec2((vW.x/uLOT - uG.x + .5)/uG.z, (vW.z/uLOT - uG.y + .5)/uG.w);
        if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) discard;
        vec4 f = texture2D(tF, uv);
        if (uMode < .5){
          float p = f.r*4., lw = max(fwidth(p*2.), 1e-3); vec2 bin = floor((vW.xz - uWind*uT*.5)/(uLOT*.2)); float q = p*(.8 + .4*hash(bin));
          if (q < .2) discard;
          vec3 c = ramp(q); float x = q*2., d = min(fract(x), 1. - fract(x));
          c = mix(c, min(c*1.6 + .12, vec3(1.)), (1. - smoothstep(0., lw*1.6, d))*.55);
          gl_FragColor = vec4(c, smoothstep(.2, .55, q)*.8);
        } else {
          float nz = f.g*4., x = nz*2.2 + uT*.8, lw = max(fwidth(x), 1e-3); if (nz < .3) discard;
          float d = min(fract(x), 1. - fract(x));
          float ln = 1. - smoothstep(0., lw*1.5, d), gl = exp(-d/(lw*5.))*.5;
          vec3 base = mix(vec3(.16, .08, .38), vec3(.45, .2, .95), smoothstep(.3, 3., nz)), lc = mix(vec3(.62, .5, 1.), vec3(1., .31, .84), smoothstep(.8, 2.6, nz));
          gl_FragColor = vec4(base*.6 + lc*(ln + gl), smoothstep(.3, .9, nz)*(.3 + .62*max(ln, gl)));
        } }`;
    const fmat = overlayMat(FS, { tF: { value: null }, uMode: { value: 0 }, uT: { value: 0 }, uG: { value: new THREE.Vector4() }, uLOT: { value: LOT }, uWind: { value: new THREE.Vector2() } }, false);
    const plane = onLayer(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fmat), 993); plane.rotation.x = -Math.PI/2; plane.visible = false;
    let tex = null, texFor = null;
    function field(){
      const base = BASE; if (!base || !base.field) return false; if (texFor === base && tex) return true;
      const { i0, j0, NI, NJ } = base.field, data = new Uint8Array(NI*NJ*4);
      for (let a = 0; a < NI; a++) for (let b = 0; b < NJ; b++){ const o = (b*NI + a)*4; data[o] = Math.min(255, base.polAt(i0 + a, j0 + b)/4*255); data[o + 1] = Math.min(255, base.noiseAt(i0 + a, j0 + b)/4*255); data[o + 3] = 255; }
      if (tex) tex.dispose();
      tex = new THREE.DataTexture(data, NI, NJ, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true; texFor = base;
      fmat.uniforms.tF.value = tex; fmat.uniforms.uG.value.set(i0, j0, NI, NJ);
      plane.scale.set(NI*LOT, NJ*LOT, 1); plane.position.set((i0 + (NI - 1)/2)*LOT, CURB + .12, (j0 + (NJ - 1)/2)*LOT);
      return true;
    }
    // the sources: a glow on the ground under each, pulsing with its strength
    const glowC = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.18, 'rgba(255,255,255,.85)'); r.addColorStop(.45, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI*2); g.stroke(); return new THREE.CanvasTexture(cv); })();
    const NS = 300, spots = onLayer(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowC, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }), NS), 996);
    spots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NS*3), 3); spots.count = 0; spots.visible = false;
    let spotList = [];
    const m4 = new THREE.Matrix4(), qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
    (function run(){ requestAnimationFrame(run); if (!plane.visible && !spots.visible) return; const t = performance.now()/1000; fmat.uniforms.uT.value = t;
      if (!spots.visible) return;
      for (let n = 0; n < spots.count; n++){ const o = spotList[n], k = (t*.6 + o.ph) % 1; pp.set(o.x, CURB + .16, o.z); ss.setScalar(o.r*(.8 + .55*k)); m4.compose(pp, qf, ss); spots.setMatrixAt(n, m4); cc.set(o.col).multiplyScalar(1.15 - .8*k); spots.setColorAt(n, cc); }
      spots.instanceMatrix.needsUpdate = true; spots.instanceColor.needsUpdate = true; })();
    // safety keeps its tiles: watched over, feeling watched, crime
    const tileMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .34, depthTest: false, depthWrite: false });
    const MAXT = 3000, tiles = onLayer(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tileMat, MAXT), 995); tiles.count = 0;
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXT*3), 3);
    function safetyTiles(){ const R_ = LAST, L_ = LENSES[2].keys; let n = 0;
      for (const c of cells.values()){ if (n >= MAXT) break; if (c.mega) continue; let col = null;
        if (R_.crimeAt(c.i, c.j) > .25) col = L_[2][0]; else if (tierOK(3) && R_.watchAt(c.i, c.j) > .35) col = L_[1][0]; else if (R_.coverAt(c.i, c.j) > .45) col = L_[0][0];
        if (!col) continue; cc.set(col); pp.set(c.i*LOT, CURB + .08, c.j*LOT); ss.set(LOT*.94, LOT*.94, 1); m4.compose(pp, qf, ss); tiles.setMatrixAt(n, m4); tiles.setColorAt(n, cc); n++; }
      tiles.count = n; tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true; tiles.visible = n > 0; }
    const tierOK = t => st.tier >= t;
    const pinOf = v => v >= .7 ? 'good' : v >= .4 ? 'mid' : 'bad';
    let pins = [];
    const homeTints = d => { const out = []; for (const b of B.values()){ const h = b.h; if (!h || !isHome(h.z) || !h.eff || h.eff[d] === null || h.eff[d] === undefined) continue; out.push({ c: b.c, col: grade(h.eff[d]) }); pins.push({ c: b.c, kind: pinOf(h.eff[d]) }); } return out; };
    const AIR_HOT = '#ffa060', NOISE_HOT = '#ff4fd8';
    function sources(list, col, tint){
      spotList = [];
      for (const s of list){ const m = typeof megas !== 'undefined' && s.k && megas.get(s.k); const x = (s.i + (s.w - 1)/2)*LOT, z = (s.j + (s.h - 1)/2)*LOT;
        spotList.push({ x, z, r: LOT*(1.1 + .55*Math.min(3, s.s))*Math.max(1, Math.max(s.w, s.h)*.7), col, ph: (Math.abs(s.i*7 + s.j*13) % 10)/10 });
        const pk = AIR_HOT === col ? 'air' : 'noise';
        if (m){ tint.push({ m, col: '#ffffff', pulse: true }); pins.push({ m, kind: pk }); }
        else if (s.k){ const b = B.get(s.k); if (b && !isHome(b.z)){ tint.push({ c: b.c, col: '#ffffff', pulse: true }); pins.push({ c: b.c, kind: pk }); } } }
      spots.count = Math.min(NS, spotList.length); spots.visible = spots.count > 0;
    }
    const GRAD_AIR = 'linear-gradient(90deg,#0f3a6b,#1a8cb8,#3dc757,#f5db3d,#fa8524,#eb2924,#d633db,#fff)', GRAD_NOISE = 'linear-gradient(90deg,#2a1462,#7333f2,#a07dff,#ff4fd6)';
    const homesKey = `<span class="hk"><i style="background:${GRADE.good}"></i>fine <i style="background:${GRADE.mid}"></i>so-so <i style="background:${GRADE.bad}"></i>poor</span>`;
    function draw(){
      const id = lensTemp || lens;
      plane.visible = false; spots.visible = false; tiles.visible = false;
      if (!id || !LAST){ leg.hidden = true; ARROWS.show(false); if (!THR.on()){ TINT.clear(); PINS.clear(); } return; }
      if (lens && THR.on()) THR.close();   // (a view the player opened replaces the panel; the preview's own view only shows its field under it)
      const tint = []; pins = [];
      if (id === 'air' || id === 'noise'){
        if (field()){ fmat.uniforms.uMode.value = id === 'air' ? 0 : 1; const [wx, wz] = wind(); fmat.uniforms.uWind.value.set(wx, wz); plane.visible = true; }
        tint.push(...homeTints(id === 'air' ? 'air' : 'quiet'));
        sources(LAST.src ? (id === 'air' ? LAST.src.air : LAST.src.noise) : [], id === 'air' ? AIR_HOT : NOISE_HOT, tint);
        leg.innerHTML = `<span class="gr"><b style="background:${id === 'air' ? GRAD_AIR : GRAD_NOISE}"></b>${id === 'air' ? 'pollution: light → heavy' : 'noise: quiet → loud'}</span><span><i class="src" style="--c:#fff"></i>source</span>${homesKey}` + (id === 'air' ? '<span>wind ➜ drifts it</span>' : '');
      } else if (id === 'safety'){
        safetyTiles(); tint.push(...homeTints('safety'));
        leg.innerHTML = LENSES[2].keys.filter((k, q) => q !== 1 || tierOK(3)).map(([c_, t]) => `<span><i style="background:${c_}"></i>${t}</span>`).join('') + homesKey;
      }
      if (!THR.on()){ TINT.set(tint); PINS.set(pins); }
      leg.hidden = false; ARROWS.show(id === 'air');
    }
    setInterval(() => { if (lens || lensTemp) draw(); }, 1200);
    return { draw };
  })();
  // the wind, in the Air view: a few soft chevrons drifting over the ground the way the haze leans
  const ARROWS = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(18, 14); g.lineTo(42, 32); g.lineTo(18, 50); g.stroke();
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: .45, depthTest: false, depthWrite: false, color: 0xffffff });
    const N = 24, mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 1.4), mat, N); mesh.frustumCulled = false; mesh.layers.set(1); mesh.renderOrder = 996; mesh.visible = false;
    if (typeof scene !== 'undefined') scene.add(mesh);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), p_ = new THREE.Vector3(), s_ = new THREE.Vector3(1, 1, 1);
    let on = false;
    (function run(){ requestAnimationFrame(run); if (!on) return; const [wx, wz] = wind(), t = performance.now()/1000, a = Math.atan2(-wz, wx);
      qq.setFromEuler(new THREE.Euler(-Math.PI/2, 0, a, 'YXZ'));
      const cx = camT.x, cz = camT.z;
      for (let k = 0; k < N; k++){ const u = ((k*.618 + t*.05) % 1), v = ((k*.377) % 1); const L = 40; const x = cx + (v - .5)*L + wx*(u - .5)*L, z = cz + (((k*.271) % 1) - .5)*L + wz*(u - .5)*L;
        p_.set(x, CURB + .15, z); m4.compose(p_, qq, s_); mesh.setMatrixAt(k, m4); }
      mesh.instanceMatrix.needsUpdate = true; })();
    return { show(v){ on = v; mesh.visible = v; } };
  })();

  /* ---------- a core's reach: a hologram grid that sweeps out over the ground (and the water) as far as its power goes ----------
     When a core is clicked, looping under a core being placed, and from every core when a new goal is reached. The last plots of a reach, where power flickers, are amber. The furnish pod's hologram colors: cyan lines, a pink front. */
  const WAVE = (() => {
    const FS = `uniform vec2 uC; uniform vec2 uH; uniform float uR; uniform float uE; uniform float uProg; uniform float uEnd; uniform float uA; uniform float uLOT; varying vec3 vW;
      void main(){
        vec2 q = max(abs(vW.xz - uC) - uH, 0.); float dd = max(q.x, q.y);
        if (dd > uR + uLOT*.05) discard;
        float tr = uProg*(uR + uLOT) - dd, aa = max(length(fwidth(vW.xz)), 1e-3);
        vec2 g = vW.xz/uLOT + .5, gd = min(fract(g), 1. - fract(g))*uLOT; float pl = 1. - smoothstep(aa*.6, aa*2.2, min(gd.x, gd.y));
        vec2 g4 = g*4., sd = min(fract(g4), 1. - fract(g4))*uLOT*.25; float sl = 1. - smoothstep(aa*.5, aa*1.6, min(sd.x, sd.y));
        float trail = tr >= 0. ? exp(-tr/(uLOT*2.4)) : 0., front = exp(-tr*tr/(uLOT*uLOT*.16));
        float bnd = (1. - smoothstep(aa, aa*3. + uLOT*.06, abs(dd - uR)))*uEnd, edge = smoothstep(uR - uE - .02, uR - uE + .02, dd);
        vec3 cy = vec3(.22, .91, .88), pk = vec3(1., .31, .64), am = vec3(1., .72, .3), lc = mix(cy, am, edge*.75);
        vec3 c = (lc*(pl*.95 + sl*.32 + .08)*trail + pk*front*(.3 + .7*max(pl, sl)) + mix(cy, am, edge)*bnd)*uA;
        gl_FragColor = vec4(c, 1.); }`;
    const geo = new THREE.PlaneGeometry(1, 1), live = [], pool = [];   // (pool: finished waves' materials, kept so their program is never thrown away and compiled again)
    let ghost = null, ghostAt = 0, clickN = 0;
    function fire(m, opt = {}){
      if (typeof scene === 'undefined' || live.length > 10 || !m) return;
      const reach = m.reachNow !== undefined ? m.reachNow : P.coreReach, rOut = Math.floor(reach), rIn = Math.floor(reach - P.edge);
      const cx = (m.i + (m.w - 1)/2)*LOT, cz = (m.j + (m.h - 1)/2)*LOT, R = rOut*LOT;
      const mat = pool.pop() || overlayMat(FS, { uC: { value: new THREE.Vector2() }, uH: { value: new THREE.Vector2() }, uR: { value: 0 }, uE: { value: 0 }, uProg: { value: 0 }, uEnd: { value: 0 }, uA: { value: 1 }, uLOT: { value: LOT } }, true);
      { const u = mat.uniforms; u.uC.value.set(cx, cz); u.uH.value.set(m.w*LOT/2, m.h*LOT/2); u.uR.value = R; u.uE.value = (rOut - rIn)*LOT; u.uProg.value = 0; u.uEnd.value = 0; u.uA.value = opt.big ? 1 : .8; }
      const mesh = onLayer(new THREE.Mesh(geo, mat), 992); mesh.rotation.x = -Math.PI/2; const span = 2*(R + LOT) + Math.max(m.w, m.h)*LOT; mesh.scale.set(span, span, 1); mesh.position.set(cx, CURB + .13, cz);
      live.push({ mesh, mat, t0: performance.now(), dur: 1300 + reach*80, hold: opt.ghost ? 500 : 1300 });
      if (live.length === 1) requestAnimationFrame(tick);
    }
    function tick(){ const t = performance.now();
      for (let i = live.length - 1; i >= 0; i--){ const w = live[i], e = t - w.t0, k = Math.min(1, e/w.dur), u = w.mat.uniforms;
        u.uProg.value = 1 - Math.pow(1 - k, 1.6); const after = Math.max(0, e - w.dur*.85); u.uEnd.value = Math.min(1, after/250)*Math.max(0, 1 - Math.max(0, e - w.dur)/w.hold);
        if (e > w.dur + w.hold){ scene.remove(w.mesh); pool.push(w.mat); live.splice(i, 1); } }
      if (live.length) requestAnimationFrame(tick); }
    // only when asked: a click on a core, a core being placed (looping), a new goal reached
    setInterval(() => { if (ghost && !document.hidden && now() - ghostAt > 2600){ ghostAt = now(); fire(ghost, { ghost: true }); } }, 400);
    return {
      fire, clicks: () => clickN,
      click(m){ const c = LAST && LAST.cores.find(x => x.id === m.id); fire(c || { ...m, reachNow: P.coreReach }, { big: true }); clickN++; E.emit('coreWave', m); },
      ghost(b){ const k = b ? b.i + ',' + b.j : ''; if (k === (ghost ? ghost.i + ',' + ghost.j : '')) return; ghost = b ? { i: b.i, j: b.j, w: b.w, h: b.h, reachNow: P.coreReach } : null; if (ghost){ ghostAt = now(); fire(ghost, { ghost: true }); } },
      all(big){ if (LAST) LAST.cores.forEach(c => fire(c, { big })); },
    };
  })();

  /* ---------- thriving homes, one requirement at a time: the panel lists each with how many homes pass it, and the city lights them (green passes, red doesn't) ---------- */
  const THR = (() => {
    const box = el('div', 'pl-thr'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Thriving homes'); document.body.appendChild(box);
    let sel = 'all', open = false, key = '';
    const RQ = () => [
      { id: 'all', name: 'Thriving', test: h => h.thriving && ((B.get(h.k) || {}).occ || 0) >= h.fill*h.floors*.9, say: 'Every check below, and moved in' },
      { id: 'need', name: 'Power', test: h => h.need === 1, say: 'Full power (not at the edge), and joined to the city' },
      { id: 'work', name: 'Jobs', test: h => h.support >= .8, say: '80% of its workers have a job within reach' },
      ...DIALS.filter(dialOn).map(d => ({ id: d, name: DNAME[d], test: h => h.eff[d] === null || h.eff[d] >= .7, say: { air: 'Little pollution', quiet: 'Little noise', safety: 'No crime close by', ease: 'Not too many police', life: 'Shops or fun within 5 tiles' }[d] + ' (70% or more)' })),
    ];
    function draw(){
      if (!open || !LAST) return;
      const hs = LAST.H.filter(h => isHome(h.z)), rq = RQ(); if (!rq.some(r => r.id === sel)) sel = 'all';
      const cur = rq.find(r => r.id === sel);
      let html = `<div class="t"><b>Thriving homes</b><button type="button" class="x" aria-label="Close">✕</button></div><div class="nav"><button type="button" data-step="-1" aria-label="Previous">‹</button><div><b>${esc(cur.name)}</b><small>${esc(cur.say)}</small></div><button type="button" data-step="1" aria-label="Next">›</button></div><div class="rows">`;
      for (const r of rq){ const n = hs.filter(r.test).length, f = hs.length ? n/hs.length : 0;
        html += `<button type="button" data-r="${r.id}" aria-pressed="${r.id === sel}"><span>${esc(r.name)}</span><b>${n} / ${hs.length}</b><i><u style="width:${(100*f).toFixed(0)}%"></u></i></button>`; }
      html += `</div><div class="k"><i style="background:${GRADE.good}"></i>passes <i style="background:${GRADE.bad}"></i>doesn't</div>`;
      if (html !== key){ key = html; box.innerHTML = html; }
      TINT.set(hs.map(h => ({ c: h.b.c, col: cur.test(h) ? GRADE.good : GRADE.bad }))); PINS.set(hs.map(h => ({ c: h.b.c, kind: cur.test(h) ? 'good' : 'bad' })));
    }
    box.addEventListener('click', e => {
      if (e.target.closest('.x')){ close(); return; }
      const st_ = e.target.closest('[data-step]'); if (st_){ const rq = RQ(), q = rq.findIndex(r => r.id === sel); sel = rq[(q + +st_.dataset.step + rq.length) % rq.length].id; draw(); E.emit('thrPick', sel); return; }
      const r = e.target.closest('[data-r]'); if (r){ sel = r.dataset.r; draw(); E.emit('thrPick', sel); }
    });
    setInterval(draw, 1200);
    function close(){ if (!open) return; open = false; box.hidden = true; key = ''; TINT.clear(); PINS.clear(); }
    return { on: () => open, close, open(){ if (open){ close(); return; } open = true; if (lens){ lens = null; lensSync(); VIEW.draw(); } box.hidden = false; draw(); E.emit('thrOpen'); } };
  })();
  // the hotspots, always there faintly at night once police exist, bright in the Safety lens
  const HOT = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 20, 64, 64, 62); gr.addColorStop(0, 'rgba(255,40,60,0)'); gr.addColorStop(.6, 'rgba(255,40,60,.6)'); gr.addColorStop(.8, 'rgba(255,90,110,1)'); gr.addColorStop(1, 'rgba(255,40,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv), live = new Map();
    let fore = null;
    function sync(){
      const want = new Set(), bright = (lens || lensTemp) === 'safety', dim = typeof isNight === 'function' && isNight(S.hour) ? .5 : .22;
      for (const s of st.crime.spots){ want.add(s.id); let o = live.get(s.id);
        if (!o){ const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI/2; m.layers.set(1); m.renderOrder = 996; m.frustumCulled = false; if (typeof scene !== 'undefined') scene.add(m); o = { m, ph: Math.random()*6, x: s.i*LOT, z: s.j*LOT }; live.set(s.id, o); }
        o.tx = s.i*LOT; o.tz = s.j*LOT; o.heat = s.heat; o.op = bright ? 1 : dim; }
      for (const [k, o] of live) if (!want.has(k)){ scene.remove(o.m); o.m.material.dispose(); o.m.geometry.dispose(); live.delete(k); }
      const f = built('lidar') ? CRIME.forecast() : null;
      if (f && !fore){ fore = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: .5, depthTest: false, depthWrite: false })); fore.rotation.x = -Math.PI/2; fore.layers.set(1); fore.renderOrder = 996; fore.frustumCulled = false; scene.add(fore); }
      if (fore){ fore.visible = !!f && bright; if (f) fore.position.set(f.i*LOT, CURB + .2, f.j*LOT); }
    }
    setInterval(() => { try { sync(); } catch (e) {} }, 1000);
    (function run(){ requestAnimationFrame(run); if (!live.size && !fore) return; const t = performance.now()/1000;
      for (const o of live.values()){ o.x += (o.tx - o.x)*.02; o.z += (o.tz - o.z)*.02; const k = (t*.35 + o.ph) % 1, R0 = LOT*(1.2 + o.heat*1.6);
        o.m.position.set(o.x, CURB + .18, o.z); o.m.scale.setScalar(R0*(.6 + k*.8)); o.m.material.opacity = o.op*(.35 + o.heat*.6)*(1 - k); }
      if (fore && fore.visible) fore.scale.setScalar(LOT*(1.6 + .2*Math.sin(t*2))); })();
    return {};
  })();

  // the city's voice: the single biggest complaint right now, where, and what would help
  const voiceEl = el('button', 'pl-voice'); voiceEl.type = 'button'; voiceEl.hidden = true; document.body.appendChild(voiceEl);
  const LENS_OF = { air: 'air', quiet: 'noise', safety: 'safety', ease: 'safety' };
  const PROB = {
    power: ['no power: outside every core\'s reach', 'build inside a core\'s reach (click a core to see it), or add a core'], overload: ['no power: the core is fully loaded', 'add another core nearby'],
    isolated: ['cut off from the city', 'connect it with ground'], work: ['no jobs within 8 tiles', 'industry or shops nearer, or a metro stop'],
    air: ['pollution', 'move homes away from industry and cores, or add an Air Scrubber'], quiet: ['too much noise', 'move away from loud buildings, or put a tall building in between'],
    safety: ['crime nearby', 'make the homes nearby happier, or add police'], ease: ['too many police: no privacy', 'fewer police here, or a Bath House'], life: ['nothing to do within 5 tiles', 'add shops or a square nearby'],
  };
  let voice = null, voiceT = 0;
  // what holds a home back the most: its needs first, then work, then its lowest dial
  function worstOf(h){
    if (!h.powered) return h.overload ? 'overload' : 'power'; if (h.isolated) return 'isolated';
    let w = 'work', lo = h.support;
    for (const d of DIALS){ const v = h.eff[d]; if (v !== null && v < lo){ lo = v; w = d; } }
    return lo < .85 ? w : null;
  }
  function placeName(i, j){
    let bestM = null, bd = 5; if (typeof megas !== 'undefined') for (const m of megas.values()){ if (m.kind === 'emitter') continue; const d = megaD(i, j, m); if (d < bd){ bd = d; bestM = m; } }
    if (bestM) return 'Around the ' + MEGA_TYPES[bestM.kind].name;
    let ci = 0, cj = 0, n = 0; for (const c of cells.values()){ ci += c.i; cj += c.j; n++; } ci /= n || 1; cj /= n || 1;
    const di = i - ci, dj = j - cj; if (Math.hypot(di, dj) < 3) return 'Downtown';
    // (on the screen's terms: north is away from the camera at its usual angle)
    const a = Math.atan2(dj, di), sec = ['East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest', 'North', 'Northeast'][((Math.round(a/(Math.PI/4)) % 8) + 8) % 8];
    return sec + ' blocks';
  }
  function topComplaint(){
    if (!LAST) return null;
    const agg = {};
    for (const h of LAST.H){ if (!isHome(h.z)) continue; const w = worstOf(h); if (!w) continue; const lost = h.people*(1 - h.fill) + 1; const a = agg[w] || (agg[w] = { n: 0, lost: 0, i: 0, j: 0 }); a.n++; a.lost += lost; a.i += h.b.i*lost; a.j += h.b.j*lost; }
    let best = null; for (const k in agg) if (!best || agg[k].lost > agg[best].lost) best = k;
    if (!best) return null; const a = agg[best]; return { k: best, i: a.i/a.lost, j: a.j/a.lost, n: a.n };
  }
  function voiceTick(){
    if (--voiceT > 0) return; voiceT = 15;
    if (!st.tut.done){ voiceEl.hidden = true; return; }
    const v = topComplaint(); voice = v;
    if (!v){ voiceEl.hidden = true; return; }
    const [p, fix] = PROB[v.k];
    voiceEl.innerHTML = `<em>${esc(placeName(Math.round(v.i), Math.round(v.j)))}</em> · ${esc(p)} <small>· ${esc(fix)}</small>`;
    voiceEl.title = 'Show me'; voiceEl.hidden = false;
    if (!st.hints.voice && st.tut.done){ st.hints.voice = 1; save(); }
  }
  voiceEl.addEventListener('click', () => { if (!voice) return; try { camGoal.set(voice.i*LOT, camGoal.y, voice.j*LOT); } catch (e) {}
    if (voice.k === 'power'){ let bst = null, bd = Infinity; for (const m of megaList('emitter')){ const d = megaD(Math.round(voice.i), Math.round(voice.j), m); if (d < bd){ bd = d; bst = m; } } if (bst) WAVE.click(bst); }
    const l = LENS_OF[voice.k]; if (l && st.tier >= LENSES.find(x => x.id === l).at){ setLens(l); } E.emit('voice', voice); });

  // the ledger: after an edit, one line on what it changed, and for whom
  const ledgerEl = el('div', 'pl-ledger'); ledgerEl.setAttribute('role', 'status'); document.body.appendChild(ledgerEl);
  let ledgerBefore = null, ledgerAt = 0, ledgerT = 0;
  function ledgerMark(){ REV++; if (!ledgerBefore && LAST) ledgerBefore = snapOf(LAST); ledgerAt = now() + 900; }
  // (a copy of what each home counts, taken before the edit: the live rows are rewritten every second)
  const snapOf = R_ => ({ byK: new Map([...R_.byK].map(([k, h]) => [k, { k, z: h.z, b: h.b, counted: h.counted || 0, need: h.need, support: h.support, rent: h.rent, eff: h.eff ? { ...h.eff } : {} }])) });
  const CAUSE = {
    up: { work: n => `${n} home${n > 1 ? 's' : ''} reach jobs`, life: n => `more to do for ${n} home${n > 1 ? 's' : ''}`, air: n => `cleaner air for ${n} home${n > 1 ? 's' : ''}`, quiet: n => `quieter for ${n} home${n > 1 ? 's' : ''}`,
      safety: n => `safer for ${n} home${n > 1 ? 's' : ''}`, ease: n => `more privacy for ${n} home${n > 1 ? 's' : ''}`, power: n => `${n} home${n > 1 ? 's' : ''} powered`, new: () => 'new homes fill', rent: n => `rents ease for ${n}` },
    dn: { work: n => `${n} home${n > 1 ? 's' : ''} lost jobs nearby`, life: n => `less to do for ${n} home${n > 1 ? 's' : ''}`, air: n => `pollution reaches ${n} home${n > 1 ? 's' : ''}`, quiet: n => `noise reaches ${n} home${n > 1 ? 's' : ''}`,
      safety: n => `crime near ${n} home${n > 1 ? 's' : ''}`, ease: n => `${n} home${n > 1 ? 's' : ''} lose privacy`, power: n => `${n} home${n > 1 ? 's' : ''} lost power`, new: () => 'homes gone', rent: n => `${n} home${n > 1 ? 's' : ''} priced out` },
  };
  // compare two runs of the simulation: the change in counted residents, and the reason that moved it most
  function diff(A, Bn){
    const by = {}; let tot = 0;
    const keys = new Set([...A.byK.keys(), ...Bn.byK.keys()]);
    for (const k of keys){ const a = A.byK.get(k), b = Bn.byK.get(k); if ((a && !isHome(a.z)) || (b && !isHome(b.z))) continue;
      const ca = a ? a.counted : 0, cb = b ? b.counted : 0, d = cb - ca; if (Math.abs(d) < .5) continue; tot += d;
      let why = 'new';
      if (a && b){ let bw = 0; const cand = [['power', b.need - a.need], ['work', b.support - a.support], ['rent', b.rent - a.rent]]; for (const x of DIALS) if (a.eff[x] !== null && b.eff[x] !== null) cand.push([x, (b.eff[x] - a.eff[x])*.6]);
        for (const [x, v] of cand) if (Math.sign(v) === Math.sign(d) && Math.abs(v) > bw){ bw = Math.abs(v); why = x; } }
      const r = by[why] || (by[why] = { d: 0, n: 0, homes: [] }); r.d += d; r.n++; r.homes.push(b || a); }
    let main = null; for (const k in by) if (Math.sign(by[k].d) === Math.sign(tot) && (!main || Math.abs(by[k].d) > Math.abs(by[main].d))) main = k;
    return { tot, main, by };
  }
  function ledgerTick(){
    if (!ledgerBefore || now() < ledgerAt || !LAST) return;
    const d = diff(ledgerBefore, LAST); ledgerBefore = null;
    if (Math.abs(d.tot) < 1 || !d.main){ return; }
    const up = d.tot > 0, f = CAUSE[up ? 'up' : 'dn'][d.main], n = d.by[d.main].n;
    ledgerEl.innerHTML = `<b class="${up ? 'up' : 'dn'}">${up ? '+' : '−'}${fmt(Math.abs(d.tot))}</b> <span>residents · ${esc(f ? f(n) : '')}</span>`;
    ledgerEl.classList.add('on'); clearTimeout(ledgerT); ledgerT = setTimeout(() => ledgerEl.classList.remove('on'), 4200);
    E.emit('ledger', d);
  }

  // a short line when something can't be done
  const sayEl = el('div', 'pl-say'); sayEl.hidden = true; document.body.appendChild(sayEl);
  let sayT = 0; function say(msg){ sayEl.textContent = msg; sayEl.hidden = false; clearTimeout(sayT); sayT = setTimeout(() => sayEl.hidden = true, 2600); }
  E.say = say;

  // Factory or Corps, once corps are open
  const corpEl = el('div', 'pl-corp', `<button type="button" data-c="0">Factory</button><button type="button" data-c="1">Corps</button>`); corpEl.hidden = true; document.body.appendChild(corpEl);
  corpEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.corp = b.dataset.c === '1'; save(); corpSync(); });
  const corpSync = () => { corpEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.c === '1') === !!st.corp))); corpEl.hidden = !(typeof S !== 'undefined' && S.zone === 'ind' && st.tier >= 6); };

  function ui(){ goal(); corpSync(); }

  /* ---------- the preview: while a zone or a megastructure is held over the city, who it would help (green) and bother (red), and by how many ---------- */
  const chipEl = el('div', 'pl-chip'); chipEl.hidden = true; document.body.appendChild(chipEl);
  const PV = (() => {
    const N = 200, mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .7, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: false });
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N); beams.count = 0; beams.frustumCulled = false; beams.layers.set(1); beams.renderOrder = 997;
    beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3);
    if (typeof scene !== 'undefined') scene.add(beams);
    const m4 = new THREE.Matrix4(), qi = new THREE.Quaternion(), p_ = new THREE.Vector3(), s_ = new THREE.Vector3(), green = new THREE.Color(0x6ff0a8), red = new THREE.Color(0xff5a6e);
    let key = '', res = null, shownAt = 0, pvLens = false;   // (pvLens: the lens on now is the preview's own, so clearing the preview may turn it off; the tutorial's stays)
    function clear(){ pend = null; clearTimeout(pendT); beams.count = 0; beams.visible = false; chipEl.hidden = true; key = ''; res = null; if (pvLens){ pvLens = false; if (lensTemp){ lensTemp = null; lensSync(); VIEW.draw(); } } }
    // what the city would be with one more thing: a building (a new one or a level on one) or a megastructure
    function trial(add){
      const snap = snapshot();
      if (add.mega){ snap.ms.push({ id: '__pv', kind: add.mega, i: add.i, j: add.j, w: add.w, h: add.h, levels: 1, top: CURB + 6 }); for (let a = 0; a < add.w; a++) for (let q = 0; q < add.h; q++) snap.plots.add((add.i + a) + ',' + (add.j + q)); }
      else { const k = add.i + ',' + add.j, b = snap.blds.find(x => x.k === k); if (b) b.floors++; else { snap.blds.push({ k, i: add.i, j: add.j, z: add.z, floors: 1, h: CURB + 3*FH }); snap.plots.add(k); } }
      return compute(snap);
    }
    let pend = null, pendT = 0;
    function show(add, x, y){
      if (!LAST || !add){ clear(); return; }
      const k = JSON.stringify(add);
      if (x !== undefined){ chipEl.style.left = x + 'px'; chipEl.style.top = y + 'px'; }
      if (k !== key && k !== pend){ pend = k; clearTimeout(pendT); chipEl.hidden = true; beams.visible = false; pendT = setTimeout(() => { if (pend === k){ pend = null; run(add, k); } }, 110); return; }
      if (k === key && x !== undefined && res) chipEl.hidden = false;
    }
    function run(add, k){
      if (!LAST) return;
      { key = k; const after = trial(add); res = diff(LAST, after); res.after = after; shownAt = performance.now();
        // a beam over each home it changes
        let n = 0;
        for (const r of Object.values(res.by)) for (const h of r.homes){ if (n >= N || !h || !h.b) continue; const c = h.b.c || cells.get(h.k); if (!c) continue;
          const A = LAST.byK.get(h.k), Bq = res.after.byK.get(h.k), d = (Bq ? Bq.counted : 0) - (A ? A.counted : 0); if (Math.abs(d) < .5) continue;
          const top = (c.sectionTops && c.sectionTops[c.sectionTops.length - 1]) || c.height || CURB + 3; p_.set(c.x, top + 1.6, c.z); s_.set(.34, 3, .34); m4.compose(p_, qi, s_); beams.setMatrixAt(n, m4); beams.setColorAt(n, d > 0 ? green : red); n++; }
        beams.count = n; beams.instanceMatrix.needsUpdate = true; if (beams.instanceColor) beams.instanceColor.needsUpdate = true; beams.visible = n > 0;
        const exact = built('spire'), t = res.tot, v = exact ? Math.round(t) : Math.round(t/5)*5;
        const up = t >= 1, dn = t <= -1, f = res.main && CAUSE[up ? 'up' : 'dn'][res.main];
        chipEl.className = 'pl-chip ' + (up ? 'up' : dn ? 'dn' : 'flat');
        chipEl.innerHTML = (up || dn) ? `${up ? '+' : '−'}${fmt(Math.abs(v || 5))} residents<small>${exact ? '' : 'about · '}${esc(f ? f(res.by[res.main].n) : '')}</small>` : `No change<small>no homes gain or lose people</small>`;
        E.emit('preview', res);
      }
      chipEl.hidden = false;
    }
    return { show, clear, get shownFor(){ return res ? performance.now() - shownAt : 0; }, get lensOn(){ return pvLens; } };
  })();
  E.previewMs = () => PV.shownFor;
  const pvLensOn = () => PV.lensOn;
  // a zone held over a plot (world.js showHover), a megastructure's footprint (showMegaGhost)
  let pvXY = [0, 0];
  addEventListener('pointermove', e => { pvXY = [e.clientX, e.clientY]; }, { passive: true });
  wrap('showHover', function (orig, t){
    const r = orig(t);
    try {
      if (!t || !S.zone || TOUCHY){ if (!(typeof megaPick !== 'undefined' && megaPick)) PV.clear(); return r; }
      const z = zoneNow(S.zone);
      let add = null;
      if (t.type === 'empty') add = { i: t.i, j: t.j, z };
      else if ((t.type === 'up' || t.type === 'onto') && t.c && !t.c.mega && !t.c.wall){ const have = zoneOf(t.c); if (!have || have === z) add = { i: t.c.i, j: t.c.j, z }; }
      if (add) PV.show(add, pvXY[0], pvXY[1]); else PV.clear();
    } catch (e) { console.warn('plan preview', e); }
    return r;
  });
  wrap('showMegaGhost', function (orig, kind, cell, turned){
    const r = orig(kind, cell, turned);
    try {
      if (!kind || !cell){ PV.clear(); WAVE.ghost(null); return r; }
      const blk = megaBlockAt(kind, cell.i, cell.j, turned);
      WAVE.ghost(kind === 'emitter' && blk.ok ? blk : null);   // (a core being placed shows how far it would reach)
      if (!blk.ok){ PV.clear(); return r; }
      PV.show({ mega: kind, i: blk.i, j: blk.j, w: blk.w, h: blk.h }, pvXY[0], pvXY[1]);
    } catch (e) { console.warn('plan preview', e); }
    return r;
  });
  setInterval(() => { const mp = typeof megaPick !== 'undefined' && megaPick; if (!mp) WAVE.ghost(null); if (!(typeof S !== 'undefined' && S.zone) && !mp) PV.clear(); }, 400);

  /* ---------- a home, up close: its dials, the lowest one, and what would help (hover with a mouse, a tap on a touch screen) ---------- */
  const cardEl = el('div', 'pl-card'); cardEl.hidden = true; cardEl.setAttribute('role', 'dialog'); document.body.appendChild(cardEl);
  let cardFor = null, cardPinned = false;
  function hideCard(){ cardEl.hidden = true; cardFor = null; cardPinned = false; cardEl.classList.remove('hov'); }
  let cardXY = [0, 0];
  function homeCard(c, x, y){
    const b = B.get(keyOf(c)), h = b && b.h; if (!h) return false;
    const home = isHome(h.z), w = home ? worstOf(h) : null, ppl = home ? Math.round(b.occ/h.floors*(h.people || 0)) : 0;
    let html = `<div class="t"><b>${ZNAME[h.z]}</b><span>${h.floors} level${h.floors > 1 ? 's' : ''}</span></div>`;
    const notes = [];
    if (home){
      html += `<div class="t"><span>${fmt(ppl)} of ${fmt(h.people)} residents</span></div>`;
      if (h.thriving) html += `<span class="tag">Thriving</span>`;
      const pass = (d, v) => v >= (d === 'work' ? .8 : .7);
      const rows = [['work', h.support], ...DIALS.filter(d => h.eff[d] !== null).map(d => [d, h.eff[d]])];
      html += `<div class="d">` + rows.map(([d, v]) => { const cls = d === w ? 'lo' : pass(d, v) ? '' : 'mid'; return `<span class="${cls}">${DNAME[d]}</span><div class="bar ${cls}"><i style="width:${(100*clamp01(v)).toFixed(0)}%"></i><u style="left:${d === 'work' ? 80 : 70}%"></u></div>`; }).join('') + `</div>`;
      if (!h.powered) notes.push(['bad', h.overload ? 'No power: its core is fully loaded' : 'No power: outside every core\'s reach']); else if (h.edge) notes.push(['mid', 'At the edge of a core\'s reach: 80% power']);
      if (h.isolated) notes.push(['bad', 'Cut off: join it to the city with ground']);
      if (h.crime > .12) notes.push(['bad', 'Crime nearby']);
      if (h.unhappy >= .45 && ppl > 0) notes.push(['bad', 'Unhappy: may turn to crime']);
      html += w ? `<div class="fix">${esc(PROB[w][1][0].toUpperCase() + PROB[w][1].slice(1))}</div>` : `<div class="fix ok">Happy here</div>`;
    } else {
      html += `<div class="t"><span>${h.powered ? h.isolated ? 'Cut off' : Math.round(h.fill*100) + '% busy' : 'No power'}</span></div>`;
      if (!h.powered || h.isolated) notes.push(['bad', h.isolated ? PROB.isolated[1] : PROB[h.overload ? 'overload' : 'power'][1]]);
      if (h.z === 'I') notes.push(['mid', h.floors >= 2 ? `More jobs per level · smaller cloud close in, but its smoke lands ${2*h.floors} tiles downwind, over anything shorter` : 'Gives jobs · pollution drifts downwind']);
      if (h.z === 'C') notes.push(['mid', h.floors >= 2 ? 'Stacked: 3/4 the noise of the same shops spread out, but fewer visitors per level' : 'Gives jobs and things to do · a little noise']);
    }
    notes.push(['mid', `Uses ${(+h.draw).toFixed(1)} power`]);
    if (h.shade > .2) notes.push(['mid', 'Blocks pollution for the homes behind it, and breathes some of it']);
    if (notes.length) html += `<div class="nt">` + notes.map(([k, t]) => `<div class="${k}">${esc(t)}</div>`).join('') + `</div>`;
    if (cardEl.innerHTML !== html) cardEl.innerHTML = html;
    cardEl.hidden = false; cardFor = c; cardEl.classList.toggle('hov', !cardPinned);
    if (!TOUCHY && x !== undefined){ cardXY = [x, y]; const r = cardEl.getBoundingClientRect(); cardEl.style.left = Math.min(innerWidth - r.width - 8, x + 18) + 'px'; cardEl.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y + 12)) + 'px'; }
    E.emit('card', c);
    return true;
  }
  E.tapInfo = pk => { const c = pk && pk.c && !pk.c.mega ? pk.c : null; if (!c || !homeCard(c)) return false; cardPinned = true; cardEl.classList.remove('hov'); return true; };   // (a tap pins it: the next tap elsewhere closes it)
  // with a mouse: rest the pointer on a building with nothing picked. A box test against the buildings (not the full pick, which reads every
  // triangle), once a frame at most, so the card follows the pointer without a wait
  const ray_ = new THREE.Raycaster(), ndc_ = new THREE.Vector2(), bx_ = new THREE.Box3(), hit_ = new THREE.Vector3();
  function buildingAt(x, y){
    const r = viewRect(); ndc_.set(((x - r.left)/r.width)*2 - 1, -((y - r.top)/r.height)*2 + 1); ray_.setFromCamera(ndc_, cam);
    let best = null, bt = Infinity;
    for (const b of B.values()){ const c = b.c, y0 = c.lift && !(c.below && c.below.length) ? c.lift.y - .2 : CURB - .1, y1 = Math.max(y0 + .6, c.height || CURB + 3) + 1.2;   // (+1.2: the roof's things)
      bx_.min.set(c.x - SIDE/2, y0, c.z - SIDE/2); bx_.max.set(c.x + SIDE/2, y1, c.z + SIDE/2);
      if (ray_.ray.intersectBox(bx_, hit_)){ const t = hit_.distanceToSquared(ray_.ray.origin); if (t < bt){ bt = t; best = c; } } }
    return best;
  }
  let hovT = 0, hovC = null, hovE = null, hovRaf = 0;
  if (!TOUCHY) addEventListener('pointermove', e => {
    if (cardPinned) return;
    hovE = e; if (hovRaf) return;
    hovRaf = requestAnimationFrame(() => { hovRaf = 0; const ev = hovE; if (!ev) return;
      const busy = (typeof S !== 'undefined' && S.zone) || (typeof megaPick !== 'undefined' && megaPick) || (typeof delMode !== 'undefined' && delMode) || (typeof hwMode !== 'undefined' && (hwMode || mtMode)) || (typeof TITLE !== 'undefined' && TITLE.on);
      if (busy || ev.target !== (typeof canvas !== 'undefined' ? canvas : null)){ clearTimeout(hovT); hovC = null; if (!cardEl.hidden && !cardEl.contains(ev.target) && !cardFor?.kind) hideCard(); return; }
      let c = null; try { c = buildingAt(ev.clientX, ev.clientY); } catch (err) {}
      if (c && c === hovC){ clearTimeout(hovT); if (!cardEl.hidden) homeCard(c, ev.clientX, ev.clientY); return; }
      hovC = c; clearTimeout(hovT);
      if (c) hovT = setTimeout(() => { if (hovC === c) homeCard(c, ev.clientX, ev.clientY); }, cardEl.hidden ? 60 : 0);
      else hovT = setTimeout(() => { if (!hovC && !cardPinned) hideCard(); }, 700); });   // (it stays a moment after the pointer leaves, to be read)
  }, { passive: true });
  // the card's numbers move with the city: refreshed while it's open on a building
  setInterval(() => { if (!cardEl.hidden && cardFor && !cardFor.kind && cells.get(keyOf(cardFor)) === cardFor) homeCard(cardFor, TOUCHY ? undefined : cardXY[0], cardXY[1]); }, 1000);

  /* ---------- tuning: a core, a police station or a scrubber picks how it runs; the Grid picks its song ---------- */
  const FORKS = {
    emitter: { tier: 1, a: ['wide', 'Wide', 'Reaches 12 tiles · a little more pollution'], b: ['clean', 'Clean', 'Half the pollution · 9 tiles'] },
    police: { tier: 3, a: ['beat', 'Beat', 'Patrols farther · thinner, less watched'], b: ['watch', 'Watch', 'Strong close by · more watched'] },
    scrubber: { tier: 4, a: ['quiet', 'Quiet', 'Half the noise · smaller reach'], b: ['turbo', 'Turbo', 'Bigger reach · shrinks its core\'s reach more'] },
  };
  const PRESETS = [
    { id: 'clean', name: 'Clean Hum', dial: 'air', sub: 'Clean air up · Privacy down', set: { freeze: 1 } },
    { id: 'lull', name: 'Lull', dial: 'quiet', sub: 'Quiet up · Things to do down', set: { bpm: 60, hz: 1600, freeze: 0 } },
    { id: 'pulse', name: 'Night Pulse', dial: 'life', sub: 'Life up · Quiet down', set: { bpm: 112, hz: 4600, freeze: 0 }, at: 4 },
    { id: 'open', name: 'Open Air', dial: 'ease', sub: 'Privacy up · Safety down', set: { rv: 1, freeze: 0 } },
  ];
  function applyPreset(p){
    if (typeof GRIDPANEL === 'undefined' || !GRIDPANEL.el) return;
    const sl = (id, v) => { const e = GRIDPANEL.el.querySelector('#' + id); if (!e || v === undefined) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    sl('g-bpmSlider', p.set.bpm ?? 82); sl('g-warmthFilterSlider', p.set.hz ?? 2500); sl('g-spaceReverbSlider', p.set.rv ?? .84);
    const fz = GRIDPANEL.el.querySelector('#g-freezeStatusText'), frozen = fz && /ACTIVE/.test(fz.textContent);
    if (!!p.set.freeze !== !!frozen){ const b = GRIDPANEL.el.querySelector('#g-freezeSwitch'); if (b) b.click(); }
    st.preset = p.id; save();
  }
  function cardAt(m){ const p = screenOf(m.x, (m.top || CURB + 5) + 1, m.z); if (!p || TOUCHY) return; const r = cardEl.getBoundingClientRect(); cardEl.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, p[0] - r.width/2)) + 'px'; cardEl.style.top = Math.max(8, p[1] - r.height - 12) + 'px'; }
  let forkKey = '';
  function forkCard(m){
    const f = FORKS[m.kind], cur = st.forks[m.id], ref = st.refit && st.refit[m.id], open = f && st.tier >= f.tier;
    let html = `<div class="t"><b>${esc(m.kind === 'emitter' ? 'Power core' : MEGA_TYPES[m.kind].name)}</b><button type="button" class="x" aria-label="Close">✕</button></div>`;
    if (m.kind === 'emitter'){ const c = LAST && LAST.cores.find(x => x.id === m.id), ld = c ? c.load : 0, cap = c ? c.cap : P.coreCap, fr = Math.min(1, ld/cap), dark = LAST ? LAST.H.filter(h => h.overload && h.overCores && h.overCores.includes(m.id)).length : 0, full = fr > .97 || (c && c.refused > 0);
      html += `<div class="load"><div><span>Power used</span><b class="${full ? 'bad' : ''}">${ld.toFixed(0)} / ${cap}</b></div><div class="bar ${full ? 'bad' : fr > .8 ? 'mid' : ''}"><i style="width:${(100*fr).toFixed(0)}%"></i></div>` +
        `<small>${full ? `Full${dark ? `: ${dark} building${dark > 1 ? 's' : ''} without power` : ''}. Add another core nearby.` : `Reaches ${Math.floor(c ? c.reachNow : P.coreReach)} tiles · taller buildings use more`}</small></div>`; }
    if (open){ html += `<div class="opts">`;
      for (const o of [f.a, f.b]) html += `<button type="button" data-f="${o[0]}" aria-pressed="${(ref ? ref.v : cur) === o[0]}" ${ref ? 'disabled' : ''}><b>${o[1]}</b><small>${o[2]}</small></button>`;
      html += `</div>`;
      if (ref){ const left = Math.max(0, Math.ceil((ref.at - now())/1000)); html += `<div class="fix">Refitting to ${esc((f.a[0] === ref.v ? f.a : f.b)[1])}: ${left}s<div class="bar"><i style="width:${(100*(1 - left/P.refit)).toFixed(0)}%"></i></div></div>`; }
      else if (cur) html += `<div class="fix ok">Pick the other to switch (${P.refit}s)</div>`; }
    if (m.kind === 'police' && typeof PRECINCT !== 'undefined') html += `<div class="row"><button type="button" data-desk>Precinct desk</button></div>`;
    const same = cardFor === m && !cardEl.hidden && forkKey === html;   // (redrawn only when something on it changed: a redraw under the pointer would swallow a click)
    forkKey = html; if (!same) cardEl.innerHTML = html; cardEl.hidden = false; cardPinned = true; cardEl.classList.remove('hov'); cardFor = m; if (!same) cardAt(m);
  }
  function gridCard(m){
    if (!st.hints.gridSong){ st.hints.gridSong = 1; save(); }
    const push = songPush();
    let html = `<div class="t"><b>Broadcast</b><button type="button" class="x" aria-label="Close">✕</button></div><div class="opts">`;
    for (const p of PRESETS){ const open = dialOn(p.dial) && (!p.at || st.tier >= p.at); if (!open) continue; html += `<button type="button" data-p="${p.id}" aria-pressed="${st.preset === p.id}"><b>${p.name}</b><small>${p.sub}</small></button>`; }
    html += `</div>`;
    const ups = DIALS.filter(d => dialOn(d) && push[d] > .15).map(d => DNAME[d] + ' ↑'), dns = DIALS.filter(d => dialOn(d) && push[d] < -.15).map(d => DNAME[d] + ' ↓');
    html += `<div class="fix ${ups.length ? 'ok' : ''}">${ups.concat(dns).join(' · ') || 'Neutral'} <small style="color:var(--p-dim)">within ${gridReach()} plots</small></div><div class="row"><button type="button" data-panel>Acoustic Panel</button></div>`;
    cardEl.innerHTML = html; cardEl.hidden = false; cardPinned = true; cardEl.classList.remove('hov'); cardFor = m; cardAt(m);
  }
  cardEl.addEventListener('click', e => {
    if (e.target.closest('.x')){ hideCard(); return; }
    const m = cardFor && cardFor.kind ? cardFor : null; if (!m) return;
    const fb = e.target.closest('[data-f]'); if (fb && !fb.disabled){ const v = fb.dataset.f, had = st.forks[m.id]; if (had === v) return;
      if (!had){ st.forks[m.id] = v; save(); E.emit('fork', { m, v }); forkCard(m); ledgerMark(); }
      else { st.refit = st.refit || {}; st.refit[m.id] = { v, at: now() + P.refit*1000 }; save(); forkCard(m); } return; }
    const pb = e.target.closest('[data-p]'); if (pb){ const p = PRESETS.find(x => x.id === pb.dataset.p); if (p){ applyPreset(p); E.emit('preset', p); setTimeout(() => cardFor === m && gridCard(m), 50); } return; }
    if (e.target.closest('[data-panel]')){ hideCard(); try { music.panel.show(); } catch (err) {} }
    if (e.target.closest('[data-desk]')){ hideCard(); try { PRECINCT.show(m.m || m); } catch (err) {} }
  });
  addEventListener('pointerdown', e => { if (!cardEl.hidden && !cardEl.contains(e.target) && cardPinned) hideCard(); }, true);
  setInterval(() => {
    if (st.refit) for (const id in st.refit){ const r = st.refit[id]; if (!r || !(r.at > 0) || now() >= r.at){ if (r && r.v) st.forks[id] = r.v; delete st.refit[id]; ledgerMark(); save(); } }
    if (cardFor && cardFor.kind && cardFor.kind !== 'radio' && !cardEl.hidden && cardPinned) forkCard(cardFor);   // (its load and any refit, live)
  }, 1000);
  E.megaClick = m => {
    if (!m) return false;
    if (m.kind === 'emitter'){ WAVE.click(m); forkCard(m); return true; }   // (a click on a core: its reach as a wave, its load, and its tuning once that's open)
    if (m.kind === 'radio' && st.tier >= 0){ gridCard(m); return true; }
    const f = FORKS[m.kind]; if (f && st.tier >= f.tier){ forkCard(m); return true; }
    return false;
  };

  /* ---------- just-in-time tips: each hidden rule told once, the first time it bites ---------- */
  const noteEl = el('div', 'pl-note'); noteEl.hidden = true; noteEl.setAttribute('role', 'status'); document.body.appendChild(noteEl);
  let noteTut = false, noteT = 0;
  const anyB = f => { for (const b of B.values()) if (f(b)) return true; return false; };
  const HINTS = {
    isolated: { say: 'That building is cut off.', sub: 'Nobody can reach it. Join it to the city with ground.', on: () => anyB(b => b.isolated) },
    power: { say: 'Out of power.', sub: 'It sits outside every core\'s reach. Click a core to see how far its grid goes, or place another core.', on: () => anyB(b => !b.isolated && !b.powered && !(b.h && b.h.overload)) },
    work: { say: 'Homes need work within reach.', sub: 'Industry and shops give jobs. Only residents with work count toward the next goal.', on: () => anyB(b => isHome(b.z) && b.powered && !b.isolated && b.h.support < .4), wait: 25 },
    overload: { say: 'A core is full.', sub: 'The buildings farthest from it lost power, and any jobs or shops among them stopped too. Click the core to see its load, and add another core nearby.', on: () => anyB(b => b.h && b.h.overload) },
    shade: { say: 'That tower is blocking pollution.', sub: 'Homes behind it get cleaner air, but its own residents breathe more of it. Unhappy, they may turn to crime.', on: () => anyB(b => isHome(b.z) && b.h.shade > .3 && b.occ > 0), wait: 6 },
    gridSong: { say: 'Click the Grid to pick its song.', sub: 'Each song lifts one comfort and lowers another for homes nearby. The Acoustic Panel lets you shape your own.', on: () => built('radio') && !st.preset, wait: 15 },
  };
  let hintUntil = 0; const since = {};
  function hint(k){
    if (st.hints[k] || noteTut || !st.tut.done || now() < hintUntil || celebrating) return false;
    const h = HINTS[k]; if (!h) return false; st.hints[k] = 1; save();
    showNote(h.say, h.sub, null, 9000); return true;
  }
  function hintTick(){
    for (const k of Object.keys(HINTS)){ if (st.hints[k]) continue; if (!HINTS[k].on()){ delete since[k]; continue; }
      since[k] = since[k] || now(); if (now() - since[k] < (HINTS[k].wait || 0)*1000) continue; if (hint(k)) return; }
    // a tier's one new idea, told once after its celebration
    if (st.tut.done && !celebrating && st.tier > 0 && !st.intro[st.tier] && !noteTut && now() > hintUntil){ st.intro[st.tier] = 1; save(); const t = INTRO[st.tier]; if (t){ showNote(t[0], t[1], t[2], 12000); if (t[3]) LENSES.forEach(l => { if (l.id === t[3]) { const b = lensEl.querySelector(`[data-l="${l.id}"]`); if (b) b.classList.add('fresh'); } }); } }
  }
  const INTRO = {
    1: ['The Psycho-Acoustic Grid is open.', 'Place it from the Buildings menu. Its music lifts one comfort and lowers another for homes within 7 tiles. Cores can be tuned now too: click one.', null],
    2: ['The metro is open.', 'It carries people to far jobs and shops. Tracks and stations are loud: keep homes a few tiles off.', null],
    3: ['Police are open.', 'They push crime away. Too many near homes and people lose their privacy: a new need, Privacy.', null, 'safety'],
    4: ['Nights matter now.', 'The Neon Dome brings life after dark, and noise. The Grid\'s broadcast reaches farther.', null],
    5: ['Perimeters and police drones.', 'Walls stop crime spreading, but ordinary homes inside feel boxed in. The LIDAR Array forecasts crime.', null],
    6: ['Luxury homes and corps.', 'Luxury wants quiet, clean air and corps jobs, and doesn\'t mind being watched. Corps push ordinary rents up.', null],
    7: ['Sky highways.', 'Drop-offs bring visitors and life to shops, and noise to homes nearby.', null],
    8: ['The Data Spire.', 'Its forecasts are exact. Through it, the coast.', null],
  };
  function showNote(say_, sub, at, ms, act){
    noteEl.className = 'pl-note'; noteEl.innerHTML = ''; const s1 = el('span', 'say'); s1.textContent = say_; const s2 = el('span', 'sub'); s2.textContent = sub;
    const row = el('div', 'row'), ok = el('button', 'go', 'Got it'); ok.type = 'button'; ok.onclick = () => { noteEl.hidden = true; hintUntil = now() + 4000; };
    const bt = el('div', 'bt'); if (act){ const a = el('button', '', act.label); a.type = 'button'; a.onclick = () => { noteEl.hidden = true; hintUntil = now() + 4000; act.fn(); }; bt.append(a); } bt.append(ok);
    row.append(el('div', ''), bt);
    noteEl.append(s1, s2, row); noteEl.hidden = false; hintUntil = now() + ms; clearTimeout(noteT); noteT = setTimeout(() => { if (!noteTut) noteEl.hidden = true; }, ms);
  }

  // the first crime: said once, with the way to see it
  E.onEv('crime', d => { if (!d || !d.first || st.hints.crime) return; st.hints.crime = 1; save();
    const go = () => { if (noteTut || celebrating){ setTimeout(go, 4000); return; }
      showNote('Crime has started.', 'Unhappy homes nearby. Point at them to see why: fix that and it fades. Left alone, it spreads.', null, 15000, { label: 'Show me', fn: () => { try { camGoal.set(d.i*LOT, camGoal.y, d.j*LOT); } catch (e) {} setLens('safety'); } }); };
    go(); });

  /* ---------- a new tier: a ring of light from every core, the lit homes flash in a wave, and what it opens ---------- */
  let celebrating = false;
  const _v = new THREE.Vector3();
  function screenOf(x, y, z){ try { _v.set(x, y, z).project(cam); if (_v.z > 1) return null; const r = viewRect(); return [r.left + (_v.x*.5 + .5)*r.width, r.top + (1 - (_v.y*.5 + .5))*r.height]; } catch (e) { return null; } }
  function floatText(x, y, z, text, cls = ''){ const p = screenOf(x, y, z); if (!p) return; const f = el('div', 'pl-float ' + cls); f.textContent = text; f.style.left = p[0] + 'px'; f.style.top = (p[1] - 28) + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1600); }
  function celebrate(t){
    celebrating = true; setTimeout(() => celebrating = false, 4400);
    const names = (TIERS[t].opens || []).map(k => MEGA_TYPES[k] ? MEGA_TYPES[k].name : OPEN_NAME[k]).filter(Boolean);
    const box = el('div', 'pl-class'); box.setAttribute('role', 'status');
    box.append(el('div', 'k', 'The city grows'), el('div', 'n', ''), el('div', 'cards', '')); box.children[1].textContent = TIERS[t].name;
    names.forEach((n, q) => { const c = el('span', ''); c.textContent = n; c.style.animationDelay = (.5 + q*.12) + 's'; box.lastChild.append(c); });
    document.body.appendChild(box); setTimeout(() => box.classList.add('out'), 3900); setTimeout(() => box.remove(), 4600);
    goalEl.classList.remove('bump'); void goalEl.offsetWidth; goalEl.classList.add('bump');
    try { if (typeof sfx !== 'undefined'){ sfx.play('megaArrive', { gain: .55, spread: 0 }); if (sfx.tone) [0, 4, 7, 12, 16].forEach((n, q) => sfx.tone(392*Math.pow(2, n/12), { gain: .12, at: .25 + q*.11, dur: q === 4 ? 1.4 : .6 })); } } catch (e) {}
    if (typeof scene === 'undefined') return;
    const cores = megaList('emitter');
    WAVE.all(true);
    const lit = [...B.values()].filter(b => b.lit > 0 && !b.isolated).map(b => ({ b, d: cores.length ? Math.min(...cores.map(m => Math.hypot(b.c.x - m.x, b.c.z - m.z))) : 0 })).sort((a, c) => a.d - c.d).slice(0, 60);
    for (const { b, d } of lit) setTimeout(() => pulseLevel(b.c, b.lit, b.z, true), 1600*Math.sqrt(Math.min(1, d/((P.coreReach + 1)*LOT))));
  }

  /* ---------- a level lighting up: current runs up the building to the level that lit, it flashes, and who moved in rises off it ---------- */
  const ZCOL = { R: 0x6fc24a, C: 0xffb347, L: 0xff4fa3, I: 0xe8e03a, K: 0xe8e03a };
  const pulseGeo = new THREE.BoxGeometry(1, 1, 1), pulseEdge = new THREE.EdgesGeometry(pulseGeo), pulses = [];
  function pulseLevel(c, lit, z, whole){
    if (typeof scene === 'undefined' || pulses.length > (whole ? 70 : 8)) return;
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = whole ? (c.lift ? c.lift.y : CURB) : (!c.lift && lit > 1 && tops[lit - 2]) || (c.lift ? c.lift.y : CURB);
    const h = Math.max(.6, y1 - y0), w = SIDE + .15, col = ZCOL[z] || 0xffffff;
    const fill = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .75, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const edge = new THREE.LineSegments(pulseEdge, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, depthTest: false }));
    for (const o of [fill, edge]){ o.layers.set(1); o.renderOrder = 997; o.position.set(c.x, y0 + h/2, c.z); o.scale.set(w, h, w); scene.add(o); }
    pulses.push({ fill, edge, t0: performance.now(), w, h });
    if (pulses.length === 1) requestAnimationFrame(pulseTick);
  }
  function pulseTick(t){
    for (let i = pulses.length - 1; i >= 0; i--){ const p = pulses[i], k = Math.min(1, (t - p.t0)/900), e = 1 - Math.pow(1 - k, 3), g = 1 + .35*e;
      p.fill.scale.set(p.w*g, p.h*(1 + .2*e), p.w*g); p.edge.scale.copy(p.fill.scale); p.fill.material.opacity = .75*(1 - k); p.edge.material.opacity = 1 - k;
      if (k >= 1){ for (const o of [p.fill, p.edge]){ scene.remove(o); o.material.dispose(); } pulses.splice(i, 1); } }
    if (pulses.length) requestAnimationFrame(pulseTick);
  }
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const surges = [];
  function surge(c, lit, z, done, big){
    if (typeof scene === 'undefined' || surges.length > 5){ done(); return; }
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = c.lift ? c.lift.y : CURB;
    const h = Math.max(1, y1 - y0), w = SIDE, R0 = w*(big ? .8 : .74), dir = Math.random() < .5 ? -1 : 1;
    const turns = Math.max(2, h/1.6)*(.85 + Math.random()*.3), col = new THREE.Color(ZCOL[z] || 0xffffff).lerp(new THREE.Color(0xffffff), Math.random()*.2);
    const N = big ? 4 : lit === 1 ? 2 : 3, th = big ? .11 : .07;
    const root = new THREE.Group(); root.position.set(c.x, y0, c.z);
    const SEG = Math.round(40*turns), strands = [];
    for (let s = 0; s < N; s++){
      const ph = s*Math.PI*2/N, pts = [];
      for (let q = 0; q <= SEG; q++){ const u = q/SEG, a = ph + dir*u*turns*Math.PI*2, j = q && q < SEG ? (Math.random() - .5)*.22 : 0; pts.push(new THREE.Vector3(Math.cos(a)*(R0 + j), u*h, Math.sin(a)*(R0 + j))); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, th, 5, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); head.scale.setScalar(big ? 1.5 : 1);
      for (const o of [outer, head]){ o.layers.set(1); o.renderOrder = 998; o.frustumCulled = false; root.add(o); }
      strands.push({ outer, head, curve });
    }
    const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    top.position.set(0, h, 0); top.layers.set(1); top.renderOrder = 999; root.add(top);
    scene.add(root);
    surges.push({ root, strands, top, t0: performance.now(), SEG, w, done, fired: false, climb: big ? 950 : 700, burst: big ? 1.8 : 1 });
    if (surges.length === 1) requestAnimationFrame(surgeTick);
  }
  function surgeTick(){ const t = performance.now();
    for (let i = surges.length - 1; i >= 0; i--){ const s = surges[i], e2 = Math.max(0, t - s.t0);
      const k = Math.min(1, e2/s.climb), head = k < 1 ? k*k*(3 - 2*k)*.85 + k*.15 : 1, tail = Math.max(0, head - .38), fk = Math.max(0, (e2 - s.climb)/450), cr = .75 + Math.random()*.25;
      for (const q of s.strands){ const a = Math.floor(tail*s.SEG), b = Math.max(a + 1, Math.ceil(head*s.SEG)); q.outer.geometry.setDrawRange(a*5*6, (b - a)*5*6); q.outer.material.opacity = .95*cr*(1 - fk);
        q.head.position.copy(q.curve.getPointAt(Math.min(1, Math.max(0, head)))); q.head.material.opacity = (1 - fk)*cr; }
      if (k >= 1){ if (!s.fired){ s.fired = true; try { s.done(); } catch (e) {} } const e3 = Math.min(1, fk*1.4); s.top.material.opacity = 1 - e3; s.top.scale.setScalar(s.w*s.burst*(1.5 + 3.5*e3)); }
      if (fk >= 1){ scene.remove(s.root); s.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); surges.splice(i, 1); } }
    if (surges.length) requestAnimationFrame(surgeTick);
  }
  let lastTone = 0;
  E.onEv('light', d => {
    const c = d.c, z = d.z || 'R', first = !st.firstZ[z] && d.lit === 1; if (first){ st.firstZ[z] = 1; save(); }
    surge(c, d.lit, z, () => pulseLevel(c, d.lit, z), first);
    if (first) setTimeout(() => { const y = (!c.lift && c.sectionTops && c.sectionTops[d.lit - 1]) || c.height || CURB + 2; floatText(c.x, y + 1.4, c.z, 'First ' + ZNAME[z].toLowerCase(), 'big'); }, first ? 950 : 700);
    try { if (typeof sfx !== 'undefined' && sfx.tone && performance.now() - lastTone > 160){ lastTone = performance.now(); const PENT = [0, 2, 4, 7, 9, 12, 14, 16], f = n => 392*Math.pow(2, n/12), n0 = PENT[Math.min(PENT.length - 1, d.lit - 1)];
      setTimeout(() => { sfx.tone(f(n0), { gain: .12 }); if (first){ sfx.tone(f(n0 + 4), { gain: .08, at: .07 }); sfx.tone(f(n0 + 7), { gain: .08, at: .14, dur: .8 }); } }, (first ? 950 : 700) - 60); } } catch (e) {}
  });
  const trickles = [];
  E.onEv('arrive', d => {
    const c = d.c; if (typeof scene === 'undefined' || trickles.length > 5 || !c) return;
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[Math.max(0, (d.lit || 1) - 1)]) || c.height || CURB + 2, y0 = c.lift ? c.lift.y : CURB;
    const hw = SIDE/2 + .06, k0 = Math.random()*4 | 0, dir = Math.random() < .5 ? 1 : 3;
    const corner = q => { const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]][(k0 + q*dir) % 4]; return [a[0]*hw, a[1]*hw]; };
    const pts = [], add = (x, y, z) => pts.push(new THREE.Vector3(c.x + x, y, c.z + z)); const [ax, az] = corner(0); add(ax, y0 + .05, az); add(ax, y1, az); for (let q = 1; q <= 4; q++){ const [x, z] = corner(q); add(x, y1, z); }
    const path = new THREE.CurvePath(); for (let q = 1; q < pts.length; q++) path.add(new THREE.LineCurve3(pts[q - 1], pts[q]));
    const col = new THREE.Color(ZCOL[d.z] || 0x38e8e0), SEG = 160;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, SEG, .05, 4, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    tube.layers.set(1); tube.renderOrder = 997; tube.frustumCulled = false; scene.add(tube);
    const t0 = performance.now(); trickles.push(tube);
    (function run(){ const k = Math.min(1, (performance.now() - t0)/1100), hd = k*(2 - k), tl = Math.max(0, hd - .22), a = Math.floor(tl*SEG), b = Math.max(a + 1, Math.ceil(hd*SEG));
      tube.geometry.setDrawRange(a*4*6, (b - a)*4*6); tube.material.opacity = .9*(k < .85 ? 1 : (1 - k)/.15);
      if (k < 1) return requestAnimationFrame(run); scene.remove(tube); tube.geometry.dispose(); tube.material.dispose(); trickles.splice(trickles.indexOf(tube), 1); })();
    setTimeout(() => floatText(c.x, y1 + .3, c.z, '+' + d.n), 300);
  });
  // a building placed off on its own: said at once
  E.onEv('build', d => { if (!d || !d.c) return; setTimeout(() => { const b = B.get(keyOf(d.c)); if (b && b.isolated) floatText(d.c.x, (d.c.height || CURB) + 1.2, d.c.z, 'Cut off', ''); }, 1200); });

  /* ---------- the tutorial: a guided first district ----------
     On a new city it lays out some ground round the core and walks the player through building a district that works, on glowing tiles, making a
     couple of mistakes on purpose to show what each need looks like when it's missing (no jobs, pollution, noise, no power). Each step waits for
     the player to do the thing, then says what happened, and moves on only when they press Next. Replayed on a built city, it's the same lessons
     as cards to read. */
  const MARK = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.strokeRect(10, 10, 108, 108); g.globalAlpha = .22; g.fillStyle = '#fff'; g.fillRect(10, 10, 108, 108);
    const tex = new THREE.CanvasTexture(cv);
    const bcv = document.createElement('canvas'); bcv.width = 32; bcv.height = 128; const bg = bcv.getContext('2d'), gr = bg.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); bg.fillStyle = gr; bg.fillRect(0, 0, 32, 128);
    const btex = new THREE.CanvasTexture(bcv);
    const ccv = document.createElement('canvas'); ccv.width = ccv.height = 64; const cg = ccv.getContext('2d');
    cg.lineJoin = 'round'; cg.lineCap = 'round'; cg.beginPath(); cg.moveTo(12, 18); cg.lineTo(32, 42); cg.lineTo(52, 18);
    cg.strokeStyle = '#061214'; cg.lineWidth = 16; cg.stroke(); cg.strokeStyle = '#9ff7ea'; cg.lineWidth = 9; cg.stroke();
    const ctex = new THREE.CanvasTexture(ccv), sets = [];
    for (let k = 0; k < 3; k++){
      const tile = onLayer(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: 0x8fe8d8, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending })), 999); tile.rotation.x = -Math.PI/2;
      const beam = onLayer(new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, color: 0x8fe8d8, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending })), 999); beam.center.set(.5, 0);
      const chev = onLayer(new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthTest: false, depthWrite: false })), 1000); chev.center.set(.5, 0);
      sets.push({ tile, beam, chev });
    }
    let list = [];
    const show = (o, v) => { o.tile.visible = o.beam.visible = o.chev.visible = v; };
    sets.forEach(o => show(o, false));
    (function run(){ requestAnimationFrame(run); if (!list.length) return; const t = performance.now()/1000;
      list.forEach((p, k) => { const o = sets[k], c = cells.get(p.i + ',' + p.j), top = c && c.sections.length ? (c.height || CURB) : CURB, x = p.i*LOT, z = p.j*LOT, pu = .5 + .5*Math.sin(t*4);
        o.tile.position.set(x, top + .16, z); o.tile.scale.set(LOT*.94, LOT*.94, 1); o.tile.material.opacity = .6 + .4*pu;
        o.beam.position.set(x, top + .1, z); o.beam.scale.set(LOT*.55, 9, 1); o.beam.material.opacity = .35 + .2*pu;
        o.chev.position.set(x, top + 9.4 + .8*Math.sin(t*3), z); o.chev.scale.set(2.2, 2.2, 1); }); })();
    return { set(ps){ list = (ps || []).slice(0, sets.length); sets.forEach((o, k) => show(o, k < list.length)); },
      top(p){ const c = cells.get(p.i + ',' + p.j); return (c && c.sections.length ? (c.height || CURB) : CURB) + 10.6; } };
  })();

  const TUTE = (() => {
    const Tap = TOUCHY ? 'Tap' : 'Click';
    const zoneBtn = z => () => document.querySelector(TOUCHY ? '.zones' : `.zone[data-zone="${z}"]`);
    const lensBtn = id => () => lensEl.querySelector(`[data-l="${id}"]`);
    const core = () => megaList('emitter')[0] || null;
    // the district, measured from the core's corner (the wind blows toward +i here, so industry goes that way and homes the other)
    const LAY = { H1: [-3, 0], I1: [3, 0], HB: [4, 0], S1: [-1, 2], W1: [-9, 0], W2: [-10, 0] };
    const GROUND = { a0: -8, a1: 5, b0: -2, b1: 3 };
    const AUTO = [['H1', 'low'], [[-3, 1], 'low'], [[-3, 1], 'low'], [[-4, 0], 'low'], [[-4, 0], 'low'], ['I1', 'ind'], [[3, -1], 'ind'], ['S1', 'mid'], [[-2, -1], 'mid']];
    const pt = k => { const m = core(), o = m ? [m.i, m.j] : [0, 0], v = typeof k === 'string' ? LAY[k] : k; return { i: o[0] + v[0], j: o[1] + v[1] }; };
    const cellAt = p => cells.get(p.i + ',' + p.j);
    const zoneAt = p => { const c = cellAt(p); return c && !c.mega && c.sections.length ? zoneOf(c) : null; };
    const anyBuilt = () => { for (const c of cells.values()) if (!c.mega && c.sections.length) return true; return false; };
    let base = {}, cardOn = null, thrN = 0; E.onEv('card', c => { cardOn = c; }); E.onEv('thrOpen', () => thrN++);
    const focus = ps => { try { let x = 0, z = 0; for (const p of ps){ x += p.i*LOT; z += p.j*LOT; } camGoal.set(x/ps.length, camGoal.y, z/ps.length); } catch (e) {} };
    // laying the ground, and building the rest of the district: a few at a time, so it reads as being built
    let job = null;
    function run(steps, done){ job = { steps, done }; (function go(){ if (!job || job.steps !== steps) return; const f = steps.shift(); if (!f){ job = null; if (done) done(); return; } try { f(); } catch (e) { console.warn('plan tutorial', e); } setTimeout(go, f.wait || 60); })(); }
    function layGround(done){
      const m = core(); if (!m){ done(); return; }
      st.wind = 0; REV++; save();
      const want = []; for (let a = GROUND.a0; a <= GROUND.a1; a++) for (let b = GROUND.b0; b <= GROUND.b1; b++){ const p = pt([a, b]); if (!cells.has(p.i + ',' + p.j)) want.push(p); }
      want.sort((x, y) => cheb(x.i, x.j, m.i, m.j) - cheb(y.i, y.j, m.i, m.j));
      const steps = []; for (let q = 0; q < want.length; q += 3){ const grp = want.slice(q, q + 3); const f = () => { for (const p of grp) if (!cells.has(p.i + ',' + p.j)) addPlatform(p.i, p.j, null); }; f.wait = 70; steps.push(f); }
      run(steps, done);
    }
    function autoBuild(done){
      const steps = [];
      { const f = () => { const c = cellAt(pt('W2')); if (c) while (c.sections.length) removeSection(c); }; f.wait = 400; steps.push(f); }
      const lv = {};
      for (const [k, z] of AUTO){ const p = pt(k), key = p.i + ',' + p.j; lv[key] = (lv[key] || 0) + 1; const n = k === 'H1' || k === 'I1' || k === 'S1' ? 2 : lv[key];
        const f = () => { let c = cellAt(p); if (!c) c = addPlatform(p.i, p.j, null); if (c && !c.mega && c.sections.length < n){ if (typeof finishAnimsOn === 'function') finishAnimsOn(c); addSection(c, z); } }; f.wait = 380; steps.push(f); }
      run(steps, done);
    }
    const res = (say, sub) => ({ say, sub });
    const GUIDED = [
      { say: 'This is your power core.', sub: `${Tap} it to see how far its power reaches.`, focus: () => { const m = core(); return m ? [{ i: m.i, j: m.j }] : []; },
        done: () => WAVE.clicks() > base.clicks,
        res: res('Build inside its grid.', 'The grid shows how far the power reaches. The card shows how much power is in use: a core can only power so many buildings, and taller buildings use more.') },
      { say: 'Place a home on the glowing tile.', sub: TOUCHY ? 'Pick Residential, then tap the tile.' : 'Pick Residential and point at the tile before you click: the tag shows how many residents the city would gain (+) or lose (−) by building there.',
        mark: ['H1'], zone: 'low', done: () => zoneAt(pt('H1')) === 'R',
        res: res('It barely fills.', 'Nobody has a job nearby, and only residents with jobs count toward your goals.' + (TOUCHY ? ' The line at the top says what each build changed.' : '')) },
      { say: `${TOUCHY ? 'Tap' : 'Point at'} the home to see what it needs.`, sub: TOUCHY ? 'Tap the home.' : 'Rest the pointer on the home.', mark: ['H1'], noZone: true,
        done: () => { const c = cellAt(pt('H1')); return c && cardOn === c && !cardEl.hidden && cardFor === c; },
        onDone: () => { cardPinned = true; cardEl.classList.remove('hov'); },
        res: res('Each bar is one need.', `The line marks enough. Jobs and Things to do are short: nothing is built nearby yet. The orange bar is the biggest problem, and the note under it says what would help. ${Tap} anywhere to close the card.`) },
      { say: 'Now place industry on the glowing tile.', sub: 'Pick Industrial.', mark: ['I1'], zone: 'ind', done: () => zoneAt(pt('I1')) === 'I',
        res: res('The home fills up.', 'Industry gives jobs to homes within 8 tiles. It also makes pollution, and the wind carries it one way.') },
      { say: 'Now a mistake, on purpose.', sub: 'Place a home right next to the industry, on the glowing tile.', mark: ['HB'], zone: 'low', done: () => zoneAt(pt('HB')) === 'R',
        resCard: 'HB', res: res('It struggles.', 'Its card is open: Clean air and Quiet are low. Industry is polluting and loud up close. You can check any building like this with no zone picked.') },
      { say: 'Open the Pollution view.', sub: `Views show what you can't see.${TOUCHY ? '' : ' Press V to cycle through them.'}`, target: lensBtn('air'), done: () => lens === 'air',
        res: res('Warm colors are heavy pollution.', 'The white badge marks where it comes from, and the arrows show the wind. Stacking industry shrinks the cloud around it, but carries the smoke farther downwind before it lands.') },
      { say: 'Now open the Noise view.', sub: 'The button next to Pollution.', target: lensBtn('noise'), done: () => lens === 'noise',
        res: res('Rings spread from loud buildings.', 'Industry is loud up close, and louder as it stacks. A stacked shop makes 3/4 the noise of the same shops spread out. A building three levels or taller in between soaks noise up.') },
      { say: 'Remove the struggling home.', sub: TOUCHY ? 'Press and hold it.' : 'Right-click it.', mark: ['HB'], noZone: true, onShow: () => setLens(null), done: () => !zoneAt(pt('HB')),
        res: res('Gone.', 'Moving things costs nothing: build, look, and move it if it doesn\'t work.') },
      { say: 'Place a shop on the glowing tile.', sub: 'Pick Commercial.', mark: ['S1'], zone: 'mid', done: () => zoneAt(pt('S1')) === 'C',
        res: res('Things to do.', 'Shops give homes within 5 tiles somewhere to go, and a few jobs. Stacked shops are quieter than the same shops spread out, but each extra level draws fewer people.') },
      { say: 'Add ground on the glowing tiles.', sub: `With no zone picked, ${TOUCHY ? 'tap' : 'click'} each one. (${TOUCHY ? 'Tap a picked zone again' : 'Press Esc'} to put a zone down.)`, mark: ['W1', 'W2'], noZone: true,
        done: () => !!cellAt(pt('W1')) && !!cellAt(pt('W2')) && !zoneAt(pt('W1')) && !zoneAt(pt('W2')),
        res: res('Ground spreads your city out.', 'Farther from industry is cleaner and quieter. But jobs reach 8 tiles, shops 5, and power only as far as a core\'s grid.') },
      { say: 'Place a home on the farthest tile.', sub: 'Another mistake, on purpose.', mark: ['W2'], zone: 'low', done: () => zoneAt(pt('W2')) === 'R',
        resCard: 'W2', res: res('No power.', `It's outside the core's reach, so it stays dark. ${Tap} the core to see where its grid ends. A second core would power it, but every core makes some pollution.`) },
      { say: 'Tall buildings block pollution.', sub: 'A building three levels or taller shields the homes up to 3 tiles behind it, but only from industry no taller than itself. The people inside breathe what they block, and unhappy residents turn to crime. Every level also uses more power than the last.', next: true },
      { say: 'Let\'s finish your starter district.', sub: 'Watch: the dark home goes, and two more homes, more industry and a second shop go up.', onShow: () => { base.auto = false; autoBuild(() => { base.auto = true; }); }, done: () => base.auto === true, min: 1500,
        resNoZone: true, res: res('Your district is running.', `People are moving in. It's one home short of your first goal: that one is up to you. ${TOUCHY ? 'Tap' : 'Point at'} any building to see how it's doing.`) },
      { say: 'This is your city\'s balance.', sub: 'Homes filled: how many live in your homes, out of the room they have. Jobs and Things to do: short means build more of it, spare means there\'s room for more homes.', target: () => goalEl.querySelector('[data-bal]'), next: true },
      { say: `Your goal: ${TIERS[1].res} residents and ${TIERS[1].thr} thriving homes.`, sub: `${Tap} Thriving homes to see which homes miss what.`, target: () => goalEl.querySelector('[data-thr]'), done: () => thrN > base.thr,
        res: res('Check one need at a time.', 'Use the arrows: homes that pass glow green, the rest red. Replay these lessons from the ? on the goal card.'), last: true },
    ];
    const LESSONS = [
      { say: 'Power comes from cores.', sub: `${Tap} a core to see how far it reaches and how much power it uses. Buildings outside its grid, or past a full core, stay dark.` },
      { say: 'Read the tag before you build.', sub: 'With a zone picked, point at a tile: the tag shows how many residents the city would gain (+) or lose (−) there.' },
      { say: `${TOUCHY ? 'Tap' : 'Point at'} a building to see what it needs.`, sub: 'Each bar is one need; the line marks enough. The note at the bottom says what would help.' },
      { say: 'Industry and cores make pollution.', sub: 'Open the Pollution view: warm colors are heavy, white badges are its sources, and the wind carries it one way. Stacked industry keeps its cloud small but lands its smoke farther downwind.' },
      { say: 'Industry, shops and transit are loud.', sub: 'The Noise view shows it. A building three levels or taller in between soaks it up. A stacked shop makes 3/4 the noise of the same shops spread out.' },
      { say: 'Ground spreads you out.', sub: 'Farther from industry is cleaner and quieter, but jobs reach 8 tiles, shops 5, and power only as far as a core\'s grid.' },
      GUIDED[11],
      { say: 'Unhappy homes turn to crime.', sub: 'It spreads and makes the homes around it unhappy too. Fix what bothers them and it fades; police push it away.' },
      { say: 'Watch your balance and your goal.', sub: `The balance bars say what's short. ${Tap} Thriving homes to check one need at a time.`, last: true },
    ];
    let beats = GUIDED, mode = 'guided';
    const U = { k: st.tut.done ? GUIDED.length : Math.min(st.tut.step || 0, GUIDED.length) };
    let lit = null, phase = 'do', shownAt = 0;
    const unpulse = () => { if (lit){ lit.classList.remove('pl-pulse'); lit = null; } };
    function render(b, say_, sub_, btn){
      noteEl.className = 'pl-note tut'; noteEl.innerHTML = '';
      const s1 = el('span', 'say'); s1.textContent = say_; const s2 = el('span', 'sub'); s2.textContent = sub_;
      const row = el('div', 'row'), n = el('span', 'n'); n.textContent = (U.k + 1) + ' / ' + beats.length;
      const bt = el('div', 'bt'), skip = el('button', '', 'Skip'); skip.type = 'button'; skip.onclick = finish; bt.append(skip);
      if (btn){ const go = el('button', 'go', btn); go.type = 'button'; go.onclick = advance; bt.append(go); }
      row.append(n, bt); noteEl.append(s1, s2, row); noteEl.hidden = false;
    }
    function show(){
      unpulse(); MARK.set([]);
      if (U.k >= beats.length){ end(); return; }
      const b = beats[U.k]; noteTut = true; clearTimeout(noteT); phase = 'do'; shownAt = now();
      base = { clicks: WAVE.clicks(), thr: thrN, auto: base.auto };
      if (mode === 'lessons' || b.next) render(b, b.say, b.sub, b.last ? 'Got it' : 'Next');
      else render(b, b.say, b.sub, null);
      if (mode === 'guided'){
        const ps = b.mark ? b.mark.map(pt) : b.focus ? b.focus() : null;
        if (b.mark) MARK.set(ps); if (ps && ps.length) focus(ps);
        if (b.noZone && typeof S !== 'undefined' && S.zone && typeof selectZone === 'function') try { selectZone(null); } catch (e) {}
        if (b.onShow) try { b.onShow(); } catch (e) {}
      }
      wrongSaid = false; refresh();
    }
    // a marked tile holding the wrong kind of building (or a building where only ground was wanted): say so, and how to undo it
    let wrongSaid = false;
    const ZW = { low: 'R', mid: 'C', ind: 'I' }, ZN = { R: 'a home', C: 'a shop', I: 'industry', L: 'a luxury home', K: 'corps' };
    function wrongOn(b){
      if (!b.mark) return null;
      for (const k of b.mark){ const z = zoneAt(pt(k)); if (!z) continue; if (b.zone ? z !== ZW[b.zone] : b.noZone && (k === 'W1' || k === 'W2')) return z; }
      return null;
    }
    // the note sits beside what it's about: a glowing tile (or the core) in the city, or a button; a thin line points the way. Off on a touch
    // screen, where it keeps its place at the bottom
    const lead = el('div', 'pl-lead'); lead.hidden = true; document.body.appendChild(lead);
    let at = null;
    function anchor(){
      const b = beats[U.k]; if (!b || mode !== 'guided' || TOUCHY) return null;
      const t = phase === 'do' ? (b.target ? b.target() : null) : null; if (t) return { el: t };
      if (b.mark){ const p = pt(b.mark[0]); return { w: [p.i*LOT, MARK.top(p) - 9.6, p.j*LOT] }; }
      if (b.focus){ const ps = b.focus(), m = core(); if (m) return { w: [m.x, (m.top || CURB + 6) + .5, m.z] }; }
      if (b.target){ const e = b.target(); if (e) return { el: e }; }
      return null;
    }
    function place(){
      const s_ = noteEl.style;
      const free = () => { if (at){ at = null; s_.left = s_.top = s_.right = s_.bottom = s_.transform = ''; noteEl.classList.remove('anch'); } lead.hidden = true; };
      if (!noteTut || noteEl.hidden) return free();
      const a = anchor(); let px = null, py = null, side = 'x';
      if (a && a.el){ const r = a.el.getBoundingClientRect(); if (r.width){ px = r.left + r.width/2; py = r.top < innerHeight/2 ? r.bottom : r.top; side = 'y'; } }
      else if (a && a.w){ const p = screenOf(a.w[0], a.w[1], a.w[2]); if (p && p[0] > 0 && p[0] < innerWidth && p[1] > 0 && p[1] < innerHeight){ px = p[0]; py = p[1]; } }
      if (px === null) return free();
      const w = noteEl.offsetWidth || 330, h = noteEl.offsetHeight || 120, gap = 56;
      let x, y;
      if (side === 'y'){ x = px - w/2; y = py < innerHeight/2 ? py + 18 : py - h - 18; }
      else { x = px + gap; if (x + w > innerWidth - 12) x = px - gap - w; y = py - h/2; }
      x = Math.max(12, Math.min(innerWidth - w - 12, x)); y = Math.max(60, Math.min(innerHeight - h - 130, y));
      if (!at) at = { x, y }; else { at.x += (x - at.x)*.2; at.y += (y - at.y)*.2; }
      noteEl.classList.add('anch'); s_.left = Math.round(at.x) + 'px'; s_.top = Math.round(at.y) + 'px'; s_.right = s_.bottom = 'auto'; s_.transform = 'none';
      // the line: from the note's nearest edge to the point
      const ex = px < at.x ? at.x : px > at.x + w ? at.x + w : px, ey = py < at.y ? at.y : py > at.y + h ? at.y + h : py, dx = px - ex, dy = py - ey, L = Math.hypot(dx, dy);
      if (L < 8){ lead.hidden = true; return; }
      lead.hidden = false; lead.style.left = ex + 'px'; lead.style.top = ey + 'px'; lead.style.width = (L - 6) + 'px'; lead.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    (function placeLoop(){ requestAnimationFrame(placeLoop); try { place(); } catch (e) {} })();
    function refresh(){
      const b = beats[U.k]; if (!b || noteEl.hidden) return;
      const t = phase === 'do' && mode === 'guided' ? (b.target ? b.target() : b.zone && !(typeof S !== 'undefined' && S.zone === b.zone) ? zoneBtn(b.zone)() : null) : null;
      if (t !== lit){ unpulse(); if (t){ t.classList.add('pl-pulse'); lit = t; } }
    }
    function check(){
      const b = beats[U.k]; if (!b || noteEl.hidden || !noteTut || mode !== 'guided' || phase !== 'do' || b.next) { refresh(); return; }
      const wz = wrongOn(b);
      if (wz && !wrongSaid){ wrongSaid = true; render(b, b.say, `That tile has ${ZN[wz] || 'something else'} on it. ${TOUCHY ? 'Press and hold' : 'Right-click'} it to remove it, then try again.`, null); refresh(); return; }
      if (!wz && wrongSaid){ wrongSaid = false; render(b, b.say, b.sub, null); }
      if (now() - shownAt < (b.min || 600) || !b.done || !b.done()){ refresh(); return; }
      phase = 'res'; unpulse(); MARK.set([]);
      if (b.onDone) try { b.onDone(); } catch (e) {}
      // (a building to look at: the zone goes down, so pointing works, and its card opens on it, left of it, clear of the note)
      if ((b.resCard || b.resNoZone) && typeof S !== 'undefined' && S.zone && typeof selectZone === 'function') try { selectZone(null); } catch (e) {}
      if (b.resCard){ const k0 = U.k; let tries = 0; (function open(){ if (U.k !== k0) return; try { const c = cellAt(pt(b.resCard)); if (!c) return;
        const p = screenOf(c.x, Math.max(CURB + 1, c.height || CURB + 3), c.z) || [innerWidth/2, innerHeight/2];
        if (homeCard(c, TOUCHY ? undefined : Math.max(8, p[0] - 290), p[1] - 60)){ cardPinned = true; cardEl.classList.remove('hov'); return; } } catch (e) {}
        if (++tries < 6) setTimeout(open, 500); })(); }   // (its numbers arrive within a second of building it)
      render(b, b.res.say, b.res.sub, b.last ? 'Got it' : 'Next'); noteEl.classList.add('done');
    }
    function advance(){ if (U.k === beats.length - 1){ finish(); return; } U.k++; if (mode === 'guided'){ st.tut.step = U.k; save(); } show(); }
    function end(){ unpulse(); MARK.set([]); noteTut = false; noteEl.hidden = true; noteEl.className = 'pl-note'; if (mode === 'guided' || !st.tut.done){ st.tut.done = true; st.tut.step = GUIDED.length; save(); } beats = GUIDED; U.k = GUIDED.length; }
    function finish(){ job = null; U.k = beats.length; end(); }
    setInterval(check, 300);
    const gestureDone = () => { if (!TOUCHY) return true; try { const g = JSON.parse(localStorage.getItem('touch:nt.tut') || 'null'); return !!(g && g.done); } catch (e) { return true; } };
    const ready = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on);
    function begin(){
      if (st.tut.done) return;
      // a new city: the guided district. A city already built (from before this tutorial): the lessons to read
      if ((st.tut.step || 0) === 0 && anyBuilt()){ mode = 'lessons'; beats = LESSONS; U.k = 0; show(); return; }
      mode = 'guided'; beats = GUIDED; U.k = Math.min(st.tut.step || 0, GUIDED.length);
      if (U.k === 0){ noteTut = true; render(null, 'Laying out your first district…', 'A little ground around your core.', null); noteEl.querySelector('.n').textContent = ''; layGround(() => setTimeout(show, 500)); }
      else show();
    }
    function start(){ if (st.tut.done) return; if (!gestureDone() || !ready() || !booted || !core()) return setTimeout(start, 1500); setTimeout(begin, 1200); }
    U.start = start;
    U.restart = () => { job = null; unpulse(); MARK.set([]); noteTut = false; noteEl.hidden = true; beats = GUIDED; U.k = 0; start(); };
    U.replay = () => { job = null; st.tut = { step: 0, done: false, v: 2 }; save(); if (anyBuilt()){ mode = 'lessons'; beats = LESSONS; U.k = 0; show(); } else begin(); };
    return U;
  })();
  setTimeout(() => TUTE.start(), 0);

  /* ---------- for tests and the console ---------- */
  E.freshState = freshState; E.state = () => st; E.P = P; E.TIERS = TIERS; E.save = save; E.compute = compute; E.snapshot = snapshot; E.last = () => LAST; E.building = k => B.get(k);
  E.crime = CRIME; E.song = () => ({ ...SONG, push: songPush() });
  E.dev = { tier(t){ st.tier = Math.max(0, Math.min(TIERS.length - 1, t)); onTier(st.tier, true); }, wind(a){ st.wind = a; save(); } };
  return E;
})();
