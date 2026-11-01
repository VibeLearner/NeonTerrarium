// Neon Terrarium: economy mode. A city started as "Economy" on the title screen (New city) runs on Scrip: every building costs a little,
// pays a burst the first time each of its floors lights up, and earns while people live, work and shop in it. Power comes from Emitter
// Cores, height from the Sector Grade of the plot, and the megastructures unlock tier by tier as the sector is classified upward
// (Registered, Zoned, Chartered, Incorporated, Sovereign, then the coast). Sandbox cities (every city made before this, and any city
// started as Sandbox) never load any of it: ECON.on stays false and every hook below steps aside.
// The numbers come from the balancing model (claude/economy-balance.md, the Economy Balancer artifact): a simulated player reaches the
// coast in about six days of two short sessions a day. The city is simulated in totals per building (not per resident), once a second.
// Loads after the world, megastructures, transit and input (it wraps their build functions) and before main.js.
'use strict';
const ECON = (() => {
  const KEY = 'neonIsland.economy';
  const E = { on: false };
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }

  /* ---------- the numbers (balanced: claude/economy-balance.md) ---------- */
  // The model counts floors; the game builds in sections (a stacked piece of building, usually two to four floors, each of its own design). Here a
  // level is a section, worth about three of the model's floors, so everything per floor is three times as much per level and the Sector Grade caps
  // are in levels (E 1, D 2, C 2, B 3, A 4: the model's 2/3, 3, 6, 8 and 12 floors). Building a level is what "click a roof to stack" already does.
  // Pace (owner, Oct 31: a clicker, not an idle game): the model's hour passes in one real minute, so every rate per hour reads per minute,
  // a level fills in a second or two, a core charges in seconds to a couple of minutes, and nothing builds up while the game is closed.
  const K = 60;   // model hours per real hour
  const P = {
    // Cookie Clicker style (owner, Nov 1): every (zone, level) is its own kind of building. Each one costs 17% more than the last of its kind;
    // a level up costs 9x the one under it and makes 5.5x as much. x2 upgrades per zone open as you build (10, 25, 50... levels of it).
    // Output is per minute at full staff. Tuned in a model (scratch ccmodel.js) for about 2.5 hours to The coast: see claude/economy-mode.md
    Z: { R: { cost: 15, prod: 12 }, I: { cost: 90, prod: 45 }, C: { cost: 220, prod: 110 }, L: { cost: 9000, prod: 2000 }, K: { cost: 70000, prod: 14000 } },
    lvCost: 9, lvProd: 5.5, grow: 1.17,
    upAt: [10, 25, 50, 100, 150, 200, 250, 300], upMul: [100, 2000, 5e4, 5e6, 5e8, 5e10, 5e12, 5e14],
    lightS: 60, lightFlat: 6, fullS: 120,   // (a level lighting pays a minute of its own output, plus a little; a full building, two minutes of the whole building's)
    tileCost: 5, tileGrow: 1.02,
    jobsC: 10, shopPpl: 45,
    // noise sources: strength and radius in plots (a factory gets louder per level); megastructures [strength, radius]
    noise: { I: 2.2, perLv: .6, rI: 2, C: .7, rC: 1, mega: { radio: [3.2, 3], club: [2.6, 2], market: [1.6, 2], foundry: [3.2, 3], logistics: [2.4, 2], mall: [1.4, 2] } },
    // satisfaction (0 to 100) for a home: a base, then air, noise, work, shops, outages and megastructures
    sat: { base: 60, airNear: -20, airMid: -2, airFar: 4, noise: 6, noiseMax: 30, jobNear: 8, jobFar: -12, shop: 6, outage: -20, square: 10, bath: 8, police: 4 },
    // after an outage: people drift back over ~90 s; a share never comes back (more the longer it was dark: 1% per 2.4 s, up to 60%) for 5 min
    outBackMs: 90e3, outBackRate: 1.6, outHoldMs: 300e3, outLossS: 2.4, outLossMax: .6,
    pwr: { R: 1, C: 2, L: 3, I: 3, K: 4 }, stationPwr: 6, hwPwr: 8,
    coreCap: 40, coreCost: 150, coreCostGrowth: 2.4, coreBuildMin: 20, coreBuildGrowth: 1.45, coreBuildMaxH: 2,
    coreUpCost: 400, coreUpCostGrowth: 3.2, coreUpGain: .5, coreUpDecay: 1, coreUpPollCut: .2, coreJobs: 10, coreUpkeep: 10,
    coreReach: 9, coreNear: 2, coreMid: 5, coreReachLow: 7, lowMs: 90e3,   // (after a restart: 7 plots for 90 s)
    surgeFirst: 120e3, surgeGap: [180e3, 300e3], surgeStage: 5000,   // (power surges: the first two minutes after the tutorial, then every 3 to 5 min; 5 s per stage, yellow, orange, red)
    ppl: { R: 24, L: 9 }, jobsI: 30, jobsK: 12, unempStay: .4,
    incR: 10, incRU: 2, incL: 60, incLU: 6, tax: .08, spend: .6,
    cCap: 450, cShare: .4, cStation: .3, luxSmall: .4, bigShop: 2,
    goodsFloor: 30, salesPerGood: 10, goodValue: 5, exportPre: .3, exportPost: .7, importPre: .5, importPost: .2, stockH: 2, corpBoost: .25,
    cost: { R: 20, C: 40, L: 80, I: 100, K: 150 }, countGrowth: 1.04, levelCost: 4.17, levelGrowth: 2.46,
    bonus: { R: 60, C: 75, L: 180, I: 30, K: 90 }, cheapBonus: .7,
    lvBase: 50, lvCore: -25, lvFactory: -15, lvTrack: -10, lvStation: 15, lvShop: 10, lvCorp: 22, lvPolice: 15,
    lvCheap: 35, cheapProd: .7, lvPricey: 65, priceyMin: .3, lvLuxMin: 45, lvLuxFull: 75,
    caps: [2, 2, 2, 3, 4], capIndustry: 2,   // (E and D 2: any first home can take a second level, so the tutorial stack always works)
    prodMid: .95, prodFar: .8,
    accessMid: .8, accessFar: .3, accessMetro: .95, jobNear: 3, jobMid: 7, shopR: 3, stationR: 2, corpR: 3, factoryR: 2,
    fill: 40, fillCheap: 20, trickle: 8, trickleCheap: 3,   // (trickle: the rest of a lit level, per model hour: about 15 s to fill out)
      // (per model hour, toward the target: at the clicker pace a new level lights in a second or two)
    stipend: 6,
    startMoney: 500,   // (enough for the tutorial's home, tiles, factory and shop)
    metroTile: 400, metroStop: 3000, hwTile: 2e6, hwFinish: 3e7,
  };
  // the megastructures: the tier each unlocks at, what it costs, the power it draws, the jobs it gives (per level for the Sky mall), and its reach in plots
  const MEGA = {   // mul: a city-wide multiplier on all output once it stands (the Grid's is local instead: +15% in its reach)
    radio:      { tier: 0, cost: 400,   mul: 1,    pwr: 4,  jobs: 6,  reach: 7, upReach: 2, upCost: 2e4, upGrowth: 20, what: 'buildings within 7 plots earn 15% more' },
    emitter:    { tier: 0, cost: 150,   mul: 1,    pwr: 0,  jobs: 10, what: 'powers every building within 9 plots' },
    wirenest:   { tier: 1, cost: 2e4,   mul: 1.1,  pwr: 4,  jobs: 6,  what: 'All output +10%; demand in the log' },
    square:     { tier: 1, cost: 8e3,   mul: 1.15, pwr: 4,  jobs: 6,  reach: 5, what: 'All output +15%; homes in reach happier' },
    police:     { tier: 2, cost: 5e5,   mul: 1.2,  pwr: 6,  jobs: 8,  reach: 7, upReach: 2, upCost: 2e6, upGrowth: 20, what: 'All output +20%; Grade +15 in reach' },
    market:     { tier: 2, cost: 1e6,   mul: 1.25, pwr: 8,  jobs: 10, what: 'All output +25%' },
    foundry:    { tier: 2, cost: 2e6,   mul: 1.25, pwr: 16, jobs: 14, what: 'All output +25%' },
    bathhouse:  { tier: 3, cost: 5e7,   mul: 1.3,  pwr: 6,  jobs: 0,  reach: 5, what: 'All output +30%; homes in reach happier' },
    club:       { tier: 3, cost: 1e8,   mul: 1.4,  pwr: 10, jobs: 10, what: 'All output +40%' },
    lidar:      { tier: 3, cost: 2e8,   mul: 1.3,  pwr: 6,  jobs: 0,  reach: 8, what: 'All output +30%' },
    mall:       { tier: 4, cost: 5e9,   mul: 1.6,  pwr: 12, jobs: 8,  levelGrowth: 10, what: 'All output +60%' },
    logistics:  { tier: 4, cost: 1e10,  mul: 1.6,  pwr: 14, jobs: 24, what: 'All output +60%' },
    greenhouse: { tier: 4, cost: 2e10,  mul: 1.5,  pwr: 12, jobs: 12, what: 'All output +50%' },
    spire:      { tier: 5, cost: 5e11,  mul: 2,    pwr: 10, jobs: 0,  after: 'foundry', what: 'All output x2; the Overseer upgrades for you' },
    pagoda:     { tier: 5, cost: 1e12,  mul: 2,    pwr: 14, jobs: 12, what: 'All output x2' },
  };

  // each classification needs all of these: residents, their average satisfaction, power from the cores, employment, Scrip per minute, buildings lit
  const TIERS = [
    { name: 'Unlisted', pop: 0, inc: 0 },
    { name: 'Registered', pop: 120, sat: 50, pwr: 40, emp: 0, inc: 100, lit: 8, opens: 'Wire Nest, Town square, core upgrades' },
    { name: 'Zoned', pop: 400, sat: 55, pwr: 120, emp: 50, inc: 2500, lit: 20, opens: 'Metro, Police station, Market Plaza, Foundry' },
    { name: 'Chartered', pop: 1300, sat: 58, pwr: 400, emp: 60, inc: 4e5, lit: 50, opens: 'Luxury, Corps, Bath House, Neon Dome, LIDAR Array' },
    { name: 'Incorporated', pop: 2600, sat: 60, pwr: 800, emp: 65, inc: 3e7, lit: 100, opens: 'Sky highways, Sky mall, Logistics Hub, Hydroponic Farm' },
    { name: 'Sovereign', pop: 4500, sat: 62, pwr: 1600, emp: 70, inc: 1.5e10, lit: 160, opens: 'Data Spire, Cloud Pagoda' },
    { name: 'The coast', pop: 7000, sat: 65, pwr: 2800, emp: 72, inc: 5e10, lit: 220, opens: 'The coast, through the Data Spire' },
  ];
  const REQS = [['pop', 'Residents'], ['sat', 'Satisfaction', '%'], ['pwr', 'Power'], ['emp', 'Employment', '%'], ['inc', 'Scrip per min'], ['lit', 'Lit buildings']];
  const GRADES = ['E', 'D', 'C', 'B', 'A'];
  const ZNAME = { R: 'Residential', C: 'Commercial', L: 'Luxury', I: 'Industrial', K: 'Corps' };
  const ZONEK = { low: 'R', mid: 'C', high: 'L', ind: 'I' };
  const TOUCHY = typeof TOUCH !== 'undefined' && TOUCH.on;

  /* ---------- state ---------- */
  if (!st || !st.on) return Object.assign(E, { dark: () => null, coastOpen: () => true, tapInfo: () => false, menuText: () => null, transit: () => null, freshState });
  E.on = true;
  document.documentElement.classList.add('econ');
  { const hs = document.createElement('style'); hs.textContent = 'html.econ #modeHint{display:none!important}'; document.head.appendChild(hs); }
  st = Object.assign(freshState(), st);
  function freshState(){ return { on: true, v: 1, money: P.startMoney, tier: 0, fresh: true, last: Date.now(), peak: 0, best: {}, occ: {}, cores: {}, ups: {}, auto: false, tut: { step: 0, done: false }, hints: {}, firstZ: {}, full: {}, up: {}, away: {}, back: {}, stock: 0, corp: false, metroPaid: {}, hwPaid: {} }; }
  const save = () => { st.last = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  addEventListener('pagehide', save); addEventListener('beforeunload', save);

  /* ---------- reading the city ---------- */
  const keyOf = c => c.i + ',' + c.j;
  const zoneOf = c => { const s = (c.below && c.below.length ? c.below[0] : c.sections[0]); if (!s) return null; const z = ZONEK[s.zone]; return z === 'I' && (s.corp || c.sections.some(x => x.corp)) ? 'K' : z; };
  const floorsOf = c => c.sections.length + (c.lift && c.below ? c.below.length : 0);   // (levels: see the numbers above)
  const isBld = c => c.sections.length > 0 && !c.mega && !c.wall;
  const megaD = (i, j, m) => Math.max(Math.max(m.i - i, 0, i - (m.i + m.w - 1)), Math.max(m.j - j, 0, j - (m.j + m.h - 1)));
  const cheb = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
  const built = kind => (typeof megasOfKind === 'function' ? megasOfKind(kind) : []).length > 0;
  const megaList = kind => typeof megasOfKind === 'function' ? megasOfKind(kind) : [];
  const capFor = lv => P.caps[lv < 30 ? 0 : lv < 50 ? 1 : lv < 70 ? 2 : lv < 85 ? 3 : 4];
  const gradeOf = lv => GRADES[lv < 30 ? 0 : lv < 50 ? 1 : lv < 70 ? 2 : lv < 85 ? 3 : 4];
  // numbers grow huge: in full up to a million, then 1.23M, 4.56B, 7.89T, Qa, Qi, Sx...
  const BIG = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const fmt = n => { if (!isFinite(n)) return '∞'; const a = Math.abs(n); if (a < 1e6) return Math.round(n).toLocaleString('en-US'); let k = 0, v = n; while (Math.abs(v) >= 1000 && k < BIG.length - 1){ v /= 1000; k++; } return (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)) + BIG[k]; };
  const now = () => Date.now();

  function coreState(m){ let s = st.cores[m.id]; if (!s) s = st.cores[m.id] = { up: 0, readyAt: 0 }; return s; }
  const coreReady = m => coreState(m).readyAt <= now();
  const coreOnline = m => coreReady(m) && !coreState(m).off;
  const coreRch = m => coreState(m).lowUntil > now() ? P.coreReachLow : P.coreReach;   // (reach: shorter for a while after a restart)
  function coreCapOf(m){ const s = coreState(m); let c = P.coreCap; for (let k = 0; k < s.up; k++) c += P.coreCap*P.coreUpGain*Math.pow(P.coreUpDecay, k); return c; }
  const coreUpCost = m => Math.round(P.coreUpCost*Math.pow(P.coreUpCostGrowth, coreState(m).up));
  function nextCoreCost(){ const n = megaList('emitter').length; return Math.round(P.coreCost*Math.pow(P.coreCostGrowth, Math.max(0, n - 1))); }
  function nextCoreBuildMs(){ const n = megaList('emitter').length; return Math.min(P.coreBuildMaxH*3600e3, P.coreBuildMin*60e3*Math.pow(P.coreBuildGrowth, Math.max(0, n - 1)))/K; }
  const megaReach = (m) => { const d = MEGA[m.kind]; return (d.reach || 0) + (d.upReach ? d.upReach*(st.ups[m.kind] || 0) : 0); };
  const megaUpCost = kind => Math.round(MEGA[kind].upCost*Math.pow(MEGA[kind].upGrowth, st.ups[kind] || 0));
  const countZone = z => { let n = 0; for (const c of cells.values()) if (isBld(c) && zoneOf(c) === z) n++; return n; };
  // how many of each (zone, level) the city has: level index 0 is a building's first level (rebuilt each tick, and on demand)
  const LVN = { R: [0, 0, 0, 0], C: [0, 0, 0, 0], L: [0, 0, 0, 0], I: [0, 0, 0, 0], K: [0, 0, 0, 0] };
  function countLevels(){ for (const z in LVN) LVN[z].fill(0); for (const c of cells.values()) if (isBld(c)){ const z = zoneOf(c), f = Math.min(4, floorsOf(c)); if (LVN[z]) for (let q = 0; q < f; q++) LVN[z][q]++; } }
  const levelsOf = z => LVN[z] ? LVN[z].reduce((a, b) => a + b, 0) : 0;
  const unitCost = (z, q) => Math.round(P.Z[z].cost*Math.pow(P.lvCost, q)*Math.pow(P.grow, LVN[z][q]));   // the next level q (0 = a new building)
  const placeCost = z => { countLevels(); return unitCost(z, 0); };
  const upgradeCost = (z, lv) => { countLevels(); return unitCost(z, Math.min(3, lv)); };   // (lv: the levels it has now, so the next is index lv)
  const tileCost = () => Math.round(P.tileCost*Math.pow(P.tileGrow, cells.size));
  // the x2 upgrades: the k-th for a zone opens at P.upAt[k] levels of it and costs P.upMul[k] times its base price
  const upNext = z => { const k = (st.up && st.up[z]) || 0; return k < P.upAt.length ? { k, at: P.upAt[k], cost: P.Z[z].cost*P.upMul[k], open: levelsOf(z) >= P.upAt[k] } : null; };
  const megaMul = () => { let m = 1; if (typeof megas !== 'undefined') for (const x of megas.values()){ const d = MEGA[x.kind]; if (d && d.mul) m *= d.mul; } return m; };
  const transitStops = () => { const out = []; if (typeof metros === 'undefined') return out; for (const l of metros){ const n = l.tiles.length; for (let k = 0; k < n; k++) if (mtIsStop(l, k)) out.push(l.tiles[k]); } return out; };
  const hwDone = () => typeof highways !== 'undefined' && highways.some(h => h.done);

  /* ---------- the simulation ---------- */
  const B = new Map();   // per building: { c, z, floors, lv, cap, eff, powered, ... } (rebuilt each tick)
  const pv = { sales: 0, capTotal: 1, staffR: 0, staffL: 0, ratioR: 1, demand: 0, goodsShort: 0, unempAccR: 0, unempAccL: 0 };
  const R = E.r = { money: 0, rev: 0, pop: 0, popL: 0, supply: 0, used: 0, size: 0, emp: 0, breakdown: {}, demandZ: {}, dark: 0 };
  let peakLocal = st.peak || 0;
  const arrived = new Map();   // (residents last announced per building: not saved, so opening a city doesn't replay arrivals)
  function step(dtH, live){
    const T = now();
    const coresAll = megaList('emitter'), cores = coresAll.filter(coreOnline);
    let supply = 0; for (const m of cores) supply += coreCapOf(m);
    const avgUp = cores.length ? cores.reduce((s, m) => s + coreState(m).up, 0)/cores.length : 0, pollMul = Math.pow(1 - P.coreUpPollCut, avgUp);
    // what the megastructures, the metro and the highways draw first
    let megaPwr = 0, megaJobs = cores.length*P.coreJobs;
    if (typeof megas !== 'undefined') for (const m of megas.values()){ const d = MEGA[m.kind]; if (!d || m.kind === 'emitter') continue; const lv = m.kind === 'mall' ? m.levels || 1 : 1; megaPwr += d.pwr*lv; megaJobs += d.jobs*lv; }
    const stops = transitStops(); megaPwr += stops.length*P.stationPwr + (typeof highways !== 'undefined' ? highways.filter(h => h.done).length*P.hwPwr : 0);
    let used = Math.min(supply, megaPwr);
    // the buildings and where they stand
    const list = [];
    for (const c of cells.values()) if (isBld(c)) list.push(c);
    const inds = [], corps = [], shops = [], jobMegas = [];
    for (const c of list){ const z = zoneOf(c); if (z === 'I') inds.push(c); else if (z === 'K') corps.push(c); else if (z === 'C') shops.push(c); }
    if (typeof megas !== 'undefined') for (const m of megas.values()) if (MEGA[m.kind] && MEGA[m.kind].jobs) jobMegas.push(m);
    const anchors = [...megaList('market'), ...megaList('mall')];
    const reachers = {}; for (const k of ['radio', 'police', 'square', 'bathhouse', 'lidar']) reachers[k] = megaList(k);
    const near = (c, arr, r) => { for (const o of arr) if (o !== c && cheb(c, o) <= r) return true; return false; };
    const minD = (c, arr) => { let d = Infinity; for (const o of arr){ const q = cheb(c, o); if (q < d) d = q; } return d; };
    const inReach = (c, k) => { for (const m of reachers[k]) if (megaD(c.i, c.j, m) <= megaReach(m)) return true; return false; };
    // Who can reach what: reach spreads from the megastructures (and metro stops) along any connected ground, built on or not,
    // and hops up to two plots between buildings. A building on land of its own, cut off from all of that, stays empty.
    const reach = new Set(), occupied = new Map();
    for (const c of list) occupied.set(keyOf(c), c);
    const queue = [], seed = (i, j) => { const k = i + ',' + j; if (!reach.has(k) && cells.has(k)){ reach.add(k); queue.push([i, j]); } };
    if (typeof megas !== 'undefined') for (const m of megas.values()) for (const b0 of m.cells || []) if (b0){ reach.add(b0.i + ',' + b0.j); queue.push([b0.i, b0.j]); }
    for (const t of stops) for (let a = -P.stationR; a <= P.stationR; a++) for (let q = -P.stationR; q <= P.stationR; q++) seed(t.i + a, t.j + q);
    while (queue.length){ const [i, j] = queue.pop(), hop = occupied.has(i + ',' + j) ? 2 : 1;
      for (let a = -hop; a <= hop; a++) for (let q = -hop; q <= hop; q++){ const k = (i + a) + ',' + (j + q); if (reach.has(k)) continue;
        if (Math.max(Math.abs(a), Math.abs(q)) === 1 || occupied.has(k)) seed(i + a, j + q); } }
    const rows = [];
    let order = 0;
    for (const c of list){
      const z = zoneOf(c), k = keyOf(c); if (!z) continue;
      let coreD = Infinity, inRange = false; for (const m of cores){ const d = megaD(c.i, c.j, m); if (d < coreD) coreD = d; if (d <= coreRch(m)) inRange = true; }
      const b = { c, z, k, floors: floorsOf(c), coreD, inRange, order: order++, isolated: !reach.has(k) };
      b.band = coreD <= P.coreNear ? 'near' : coreD <= P.coreMid ? 'mid' : 'far';
      b.station = stops.some(t => Math.max(Math.abs(t.i - c.i), Math.abs(t.j - c.j)) <= P.stationR);
      b.track = !b.station && typeof mtAt === 'function' && mtAt(c.i, c.j).length > 0;
      b.shopNear = near(c, shops, P.shopR) || anchors.some(m => megaD(c.i, c.j, m) <= P.shopR + 1);
      b.corpNear = near(c, corps, P.corpR); b.factoryNear = near(c, inds, P.factoryR);
      if (z === 'R' || z === 'L'){
        const jd = Math.min(minD(c, z === 'R' ? inds : corps), z === 'R' ? jobMegas.reduce((d, m) => Math.min(d, megaD(c.i, c.j, m)), Infinity) : Infinity);
        b.jobBand = jd <= P.jobNear ? 'near' : jd <= P.jobMid ? 'mid' : 'far';
      }
      b.covA = inReach(c, 'radio'); b.covP = inReach(c, 'police'); b.covS = inReach(c, 'square'); b.covB = inReach(c, 'bathhouse'); b.covL = inReach(c, 'lidar');
      let lv = P.lvBase;
      if (b.band === 'near') lv += P.lvCore*pollMul;
      if (b.factoryNear) lv += P.lvFactory*(b.corpNear ? .5 : 1);
      if (b.track) lv += P.lvTrack;
      if (b.station) lv += P.lvStation;
      if (b.shopNear) lv += P.lvShop;
      if (b.corpNear) lv += P.lvCorp;
      if (b.covP) lv += P.lvPolice;
      b.lv = Math.max(0, Math.min(100, lv));
      b.cap = z === 'I' || z === 'K' ? P.capIndustry : capFor(b.lv);
      rows.push(b);
    }
    // power: nearest a core first, oldest first; out of every core's reach, nothing
    rows.sort((a, b) => a.coreD - b.coreD || a.order - b.order);
    let demandAll = megaPwr;
    for (const b of rows){
      const need = P.pwr[b.z]*Math.min(b.floors, b.cap); demandAll += need;
      b.powered = b.inRange && used + need <= supply;
      if (b.powered) used += need;
      b.eff = b.powered ? Math.min(b.floors, b.cap) : 0;
    }
    // noise: factories, shops and the loud megastructures, adding up by density (a few shops: a murmur; a factory row or the Grid: loud)
    const srcs = [];
    for (const b of rows){ if (!b.powered) continue; if (b.z === 'I' || b.z === 'K') srcs.push({ i: b.c.i, j: b.c.j, w: 1, h: 1, s: P.noise.I + P.noise.perLv*(b.floors - 1), r: P.noise.rI }); else if (b.z === 'C') srcs.push({ i: b.c.i, j: b.c.j, w: 1, h: 1, s: P.noise.C, r: P.noise.rC }); }
    if (typeof megas !== 'undefined') for (const m of megas.values()){ const n = P.noise.mega[m.kind]; if (n) srcs.push({ i: m.i, j: m.j, w: m.w, h: m.h, s: n[0], r: n[1] }); }
    noiseSrcs = srcs;
    for (const b of rows) b.noise = noiseAt(b.c.i, b.c.j);
    // who moves in
    let bonus = 0;
    const lshift = built('pagoda') ? 10 : 0, T0 = now();
    if (!st.away) st.away = {}; if (!st.back) st.back = {};
    for (const b of rows){
      let target = 0;
      if (b.z === 'R'){ const fill = (!b.corpNear || b.lv <= P.lvPricey) ? 1 : 1 - (1 - P.priceyMin)*(b.lv - P.lvPricey)/(100 - P.lvPricey); target = b.eff*fill*(P.unempStay + (1 - P.unempStay)*pv.ratioR); }
      else if (b.z === 'L') target = b.eff*Math.max(0, Math.min(1, (b.lv - P.lvLuxMin + lshift)/(P.lvLuxFull - P.lvLuxMin)));
      else if (b.z === 'I') target = b.eff*Math.max(.25, pv.staffR);
      else if (b.z === 'K') target = b.eff*Math.max(.25, pv.staffL);
      else if (b.z === 'C') target = b.eff*Math.max(.25, pv.shopR);
      if (b.isolated) target = 0;
      // an outage: people leave; when the power's back they drift home over about 90 s, and the longer it was off, the more never come back
      // (for a few minutes: then the place fills up as usual again)
      let occ = st.occ[b.k] || 0;
      const aw = st.away[b.k], bk = st.back[b.k];
      if (!b.powered && !b.isolated && occ > .3 && !aw && b.inRange === false) st.away[b.k] = { t: T0, occ };
      if (b.powered && aw){ const lost = Math.min(P.outLossMax, (T0 - aw.t)/1000/P.outLossS); st.back[b.k] = { until: T0 + P.outBackMs, hold: T0 + P.outHoldMs, cap: aw.occ*(1 - lost), lost }; delete st.away[b.k]; }
      const slow = bk && T0 < bk.until, held = bk && T0 < bk.hold; if (bk && !held) delete st.back[b.k];
      if (held) target = Math.min(target, bk.cap);
      const cheap = b.lv < P.lvCheap;
      // moving in: a level's first half arrives at once (it lights in a second), the rest trickle in over about fifteen seconds
      const nextLight = Math.floor(occ + .5) + .5;
      if (target >= occ){
        if (slow) occ += (target - occ)*Math.min(1, P.outBackRate*dtH);
        else if (target >= nextLight){ const r = P.fill + (cheap ? P.fillCheap : 0); occ = Math.min(occ + (target - occ)*Math.min(1, r*dtH), nextLight + .02); }
        else occ += (target - occ)*Math.min(1, (P.trickle + (cheap ? P.trickleCheap : 0))*dtH);
      } else occ += (target - occ)*Math.min(1, 6*dtH);
      if (occ > b.floors) occ = b.floors;
      st.occ[b.k] = Math.round(occ*1000)/1000; b.occ = occ;
      const lit = Math.floor(occ + .5), best = st.best[b.k] || 0;   // (a level lights once it's about half full: homes short of work still light, they just earn less)
      let lightNow = false;
      if (lit > best){ let pay = 0; for (let q = best; q < lit; q++) pay += unitOut(b.z, q)*P.lightS/60 + P.lightFlat*Math.pow(P.lvCost, q);
        bonus += pay; st.best[b.k] = lit; lightNow = true; if (live) E.emit('light', { c: b.c, lit, pay, z: b.z, cap: b.cap, floors: b.floors }); }
      b.lit = lit;
      // people trickling in between light-ups: every few residents (homes) a small glow runs round the building's edges
      if (b.z === 'R' || b.z === 'L'){ const ppl = occ*P.ppl[b.z], seen = arrived.get(b.k);
        if (seen === undefined || ppl < seen || !live) arrived.set(b.k, ppl);
        else if (ppl - seen >= (b.z === 'L' ? 2 : 3)){ arrived.set(b.k, ppl); if (!lightNow) E.emit('arrive', { c: b.c, z: b.z, n: Math.round(ppl - seen), lit }); } }
      // full: every level it has lit and as many people as it can hold where it stands (within 5%). Once per height; a payout on top
      const isFull = b.floors >= 1 && lit >= b.floors && b.eff > 0 && occ >= b.eff*.95 && !b.isolated && b.powered;
      if (isFull && (st.full[b.k] || 0) < b.floors){
        st.full[b.k] = b.floors;
        if (live && st.fullInit){ let pay = 0; for (let q = 0; q < b.floors; q++) pay += unitOut(b.z, q); pay = Math.round(pay*P.fullS/60); bonus += pay; E.emit('full', { c: b.c, z: b.z, floors: b.floors, pay }); }
      }
    }
    st.fullInit = true;   // (an old save: whatever was already full is marked quietly the first time, no burst of jackpots)
    // jobs
    let accR = 0, accL = 0, popR = 0, popL = 0;
    const access = b => { let a = b.jobBand === 'near' ? 1 : b.jobBand === 'mid' ? P.accessMid : P.accessFar; if (b.station) a = Math.max(a, P.accessMetro); return a; };
    for (const b of rows){ if (b.z === 'R'){ const p = b.occ*P.ppl.R; popR += p; accR += p*access(b); } if (b.z === 'L'){ const p = b.occ*P.ppl.L; popL += p; accL += p*access(b); } }
    let jobsR = megaJobs, jobsL = 0, cLv = 0;
    for (const b of rows){ if (b.z === 'I') jobsR += b.eff*P.jobsI; if (b.z === 'C'){ jobsR += b.eff*P.jobsC; cLv += b.eff; } if (b.z === 'K') jobsL += b.eff*P.jobsK; }
    const empR = Math.min(jobsR, accR), empL = Math.min(jobsL, accL);
    const ratioR = accR > 0 ? empR/accR : 0, ratioL = accL > 0 ? empL/accL : 0;
    pv.staffR = jobsR > 0 ? Math.min(1, accR/jobsR) : 0; pv.staffL = jobsL > 0 ? Math.min(1, accL/jobsL) : 0; pv.ratioR = popR > 0 ? empR/popR : 1;
    pv.unempAccR = accR - empR; pv.unempAccL = accL - empL;
    pv.shopR = cLv > 0 ? Math.min(1, (popR + popL)/(cLv*P.shopPpl)) : 1;
    // satisfaction, home by home: air, noise, work, shops, the power staying on, the megastructures in reach
    let satW = 0, satN = 0;
    for (const b of rows){ if (b.z !== 'R' && b.z !== 'L'){ b.sat = null; continue; }
      const parts = [];
      const add = (v, why) => { if (Math.round(v)) parts.push([Math.round(v), why]); return v; };
      let sv = P.sat.base;
      sv += add(b.band === 'near' ? P.sat.airNear*pollMul : b.band === 'mid' ? P.sat.airMid : P.sat.airFar, 'air');
      sv += add(-Math.min(P.sat.noiseMax, b.noise*P.sat.noise), 'noise');
      sv += add(b.station && b.jobBand === 'far' ? 0 : b.jobBand === 'near' ? P.sat.jobNear : b.jobBand === 'mid' ? 0 : P.sat.jobFar, 'work');
      sv += add(b.shopNear ? P.sat.shop : -P.sat.shop, 'shops');
      if (st.back[b.k] || st.away[b.k]) sv += add(P.sat.outage, 'outage');
      sv += add((b.covS ? P.sat.square : 0) + (b.covB ? P.sat.bath : 0) + (b.covP ? P.sat.police : 0), 'megastructures');
      b.sat = Math.max(0, Math.min(100, sv)); b.satParts = parts;
      const w = b.occ*P.ppl[b.z]; satW += b.sat*w; satN += w; }
    const sat = satN > 0 ? satW/satN : 0;
    // output: every lit level makes its own Scrip (a level q makes P.lvProd^q times the first), scaled by how full it is, how happy and
    // employed the homes are, the core's band, the Grid in reach, the zone's x2 upgrades and every megastructure's multiplier
    const mm = megaMul(), out = { R: 0, C: 0, I: 0, L: 0, K: 0 };
    for (const b of rows){ if (!b.powered){ b.earn = 0; continue; }
      let e = 0; for (let q = 0; q < b.floors; q++){ const share = Math.max(0, Math.min(1, b.occ - q)); if (share > 0) e += share*unitOut(b.z, q, 1); }
      const band = b.band === 'near' ? 1 : b.band === 'mid' ? P.prodMid : P.prodFar;
      let mul = band*(b.covA ? 1.15 : 1);
      if (b.z === 'R' || b.z === 'L'){ const ef = access(b)*(b.z === 'R' ? ratioR : ratioL); b.ef = ef; mul *= (.5 + .5*ef)*(.6 + .8*(b.sat || 0)/100); }
      b.earn = e*mul*mm; out[b.z] += b.earn; }
    const revenue = out.R + out.C + out.I + out.L + out.K;
    let eff = revenue;
    if (eff < P.stipend && st.money < P.Z.R.cost + tileCost()) eff = P.stipend;   // (never stuck: a trickle when there's nothing coming in and nothing to spend)
    st.money += eff*dtH*60/K + bonus;   // (output is per real minute)
    // what the city shows
    const litN = rows.filter(b => b.powered && b.lit > 0).length;
    Object.assign(R, { rev: eff, raw: revenue, pop: popR + popL, popL, supply, used, demandAll, sat, lit: litN, size: litN + (typeof megas !== 'undefined' ? megas.size : 0),
      emp: (popR + popL) > 0 ? (empR + empL)/(popR + popL) : 0, jobsR, jobsL, accR, constructing: coresAll.filter(m => !coreReady(m)),
      breakdown: { 'Homes': out.R, 'Shops': out.C, 'Factories': out.I, 'Luxury': out.L, 'Corps': out.K } });
    R.demandZ = {
      R: (jobsR - accR) > 15 ? 1 : pv.ratioR < .7 ? -1 : 0,
      C: pv.shopR >= 1 && (popR + popL) > cLv*P.shopPpl*1.3 ? 1 : pv.shopR < .5 ? -1 : 0,
      I: pv.unempAccR > P.jobsI*1.2 ? 1 : (pv.staffR < .6 ? -1 : 0),
      L: st.tier >= 3 ? ((jobsL - accL) > 4 ? 1 : 0) : 0,
    };
    B.clear(); for (const b of rows) B.set(b.k, b);
    countLevels();
    for (const k of Object.keys(st.occ)) if (!B.has(k)){ delete st.occ[k]; delete st.away[k]; delete st.back[k]; }   // (a building gone: the next on that plot starts empty, its best floor remembered)
    // the classifications: every requirement met
    while (st.tier < TIERS.length - 1){
      const t = TIERS[st.tier + 1];
      if (!REQS.every(([k]) => !t[k] || reqVal(k) >= t[k])) break;
      st.tier++; onTier(st.tier, live);
    }
  }
  // a requirement's current value (satisfaction and employment as percentages)
  function reqVal(k){ return k === 'pop' ? R.pop : k === 'sat' ? R.sat || 0 : k === 'pwr' ? R.supply : k === 'emp' ? (R.emp || 0)*100 : k === 'inc' ? R.rev : k === 'lit' ? R.lit || 0 : 0; }
  // what one full level q of zone z makes per minute (with its x2 upgrades; pass raw to leave out the megastructures)
  function unitOut(z, q, raw){ return P.Z[z].prod*Math.pow(P.lvProd, q)*Math.pow(2, (st.up && st.up[z]) || 0)*(raw ? 1 : megaMul()); }
  // noise at a plot: each source adds its strength, fading out over its radius (in plots, from its footprint)
  let noiseSrcs = [];
  function noiseAt(i, j){ let n = 0; for (const s of noiseSrcs){ const d = Math.max(Math.max(s.i - i, 0, i - (s.i + s.w - 1)), Math.max(s.j - j, 0, j - (s.j + s.h - 1))); if (d <= s.r) n += s.s*(1 - d/(s.r + 1)); } return n; }
  E.noiseAt = noiseAt;

  /* ---------- dark floors: unpowered buildings, and the floors nobody lives on yet ---------- */
  // world.js isDarkPlot asks: true = the whole building's lights off (core.js DARK), a positive number = every light above that height off,
  // -1 or -2 = all lit but flickering a little or a lot (mid-way or far from a core), null = as before
  const darkQ = [];
  E.dark = c => { const d = darkCalc(c); c._econDark = d; return d; };
  function darkCalc(c){
    if (!isBld(c)) return null;
    const b = B.get(keyOf(c)); if (!b) return CURB + .05;   // (just placed: dark until someone moves in, never a flash of light first)
    if (!b.powered) return true;
    if (c.lift || c.below) return b.lit > 0 ? (b.band === 'far' ? -2 : b.band === 'mid' ? -1 : null) : CURB + .05;
    if (b.lit >= b.floors) return b.band === 'far' ? -2 : b.band === 'mid' ? -1 : null;   // (lit: the lights flicker more the further it stands from a core, core.js)
    return (b.lit <= 0 ? CURB : (c.sectionTops && c.sectionTops[b.lit - 1]) || CURB + b.lit*3*FH) + .05;   // (the top of the last lived-in level)
  }
  function darkSync(){
    for (const b of B.values()){ if (!b.c.data && !b.c.view) continue; const d = darkCalc(b.c); if (d !== (b.c._econDark === undefined ? null : b.c._econDark) && !darkQ.includes(b.c)) darkQ.push(b.c); }
  }
  function darkFlush(){
    while (darkQ.length){
      const c = darkQ.shift();
      if (cells.get(keyOf(c)) !== c || !c.sections.length) continue;
      if (typeof animCells !== 'undefined' && animCells.has && animCells.has(c)) { darkQ.push(c); return; }
      if (darkCalc(c) === (c._econDark === undefined ? null : c._econDark)) continue;
      try { if (typeof stageRefresh === 'function' && typeof STAGE_ON === 'function' && STAGE_ON() && typeof RW !== 'undefined' && RW.usable()) stageRefresh([c]); else refresh([c]); } catch (e) {}
      return;
    }
  }
  setInterval(() => { if (!document.hidden) darkFlush(); }, 450);

  /* ---------- events (the tutorial listens) ---------- */
  const listeners = {};
  E.emit = (n, d) => { (listeners[n] || []).forEach(f => { try { f(d); } catch (e) {} }); };
  E.onEv = (n, f) => (listeners[n] || (listeners[n] = [])).push(f);

  // a level lighting for the first time: that building is redrawn at once (after this tick's numbers are in), ahead of the rest
  E.onEv('light', d => { const i = darkQ.indexOf(d.c); if (i >= 0) darkQ.splice(i, 1); darkQ.unshift(d.c); setTimeout(darkFlush, 0); });

  /* ---------- tiers ---------- */
  const TIER_KINDS = {}; for (const k in MEGA) (TIER_KINDS[MEGA[k].tier] = TIER_KINDS[MEGA[k].tier] || []).push(k);
  function onTier(t, live){
    for (let q = 0; q <= t; q++) for (const k of TIER_KINDS[q] || []) if (typeof unlockMegaKind === 'function' && typeof MEGA_TYPES !== 'undefined' && MEGA_TYPES[k] && !(MEGA[k].after && !built(MEGA[k].after))) unlockMegaKind(k);
    if (typeof renderBmenu === 'function') try { renderBmenu(); } catch (e) {}
    E.emit('tier', t);
    if (!live) return;
    celebrate(t);
    if (typeof WIRELOG !== 'undefined' && WIRELOG.say) WIRELOG.say('SYS', `Sector classification · ${TIERS[t].name}`);
    save();
  }
  E.coastOpen = () => st.tier >= TIERS.length - 1;

  /* ---------- the rules on every build: money, zones, height ---------- */
  function say(msg){ if (TOUCHY) note(msg, 3200); else flash(msg); }   // (the sandbox's instruction line under the city is hidden in Economy)
  const zoneNow = zone => ZONEK[zone] === 'I' && st.corp && st.tier >= 3 ? 'K' : ZONEK[zone];
  function zoneLocked(z){ if ((z === 'L' || z === 'K') && st.tier < 3){ say((z === 'L' ? 'Luxury' : 'Corps') + ' opens at Chartered (' + fmt(TIERS[3].pop) + ' residents, ' + fmt(TIERS[3].inc) + ' Scrip/min)'); return true; } return false; }
  function afford(cost){ if (st.money >= cost) return true; const w = etaTxt(cost); say('Not enough Scrip · ' + fmt(cost) + ' needed, ' + fmt(st.money) + ' held' + (w ? ' · ready in ' + w : '')); return false; }
  // how long until the Scrip is there at the current rate (null if it never will be)
  function etaTxt(cost){ const need = cost - st.money; if (need <= 0) return null; const r = R && R.rev > 0 ? R.rev : 0; if (!r) return null; const sec = Math.ceil(need/r*60); return sec < 60 ? 'about ' + Math.max(1, sec) + ' s' : 'about ' + Math.ceil(sec/60) + ' min'; }
  function charge(cost){ st.money -= cost; E.emit('spend', cost); hudSoon(); }
  // a new building on a plot that had none
  function gateNew(zone){ const z = zoneNow(zone); if (!z || zoneLocked(z)) return null; const cost = placeCost(z); return afford(cost) ? { z, cost } : null; }
  // more on a plot that has a building: the same zone only, under the Sector Grade's height, priced by its floors
  function gateUp(c, zone, opt){
    const z = zoneNow(zone), have = zoneOf(c);
    if (have && have !== z){ say(ZNAME[have] + ' building · only ' + ZNAME[have].toLowerCase() + ' can go on it in Economy'); return null; }
    if (zoneLocked(z)) return null;
    const b = B.get(keyOf(c)), floors = floorsOf(c), cap = b ? b.cap : P.caps[2];
    if (floors >= cap){ hint('grade'); say('Sector Grade ' + (b ? gradeOf(b.lv) : '?') + ' · ' + cap + ' level' + (cap > 1 ? 's' : '') + ' max here · raise the grade to build higher'); return null; }
    if (typeof MAX_SECTIONS !== 'undefined' && c.sections.length >= MAX_SECTIONS) return null;
    const cost = upgradeCost(z, floors); if (!afford(cost)) return null;
    return { z, cost };
  }
  const markCorp = (c, g) => { if (g.z !== 'K') return; for (const s of c.sections) if (s.zone === 'ind') s.corp = 1; if (c.below) for (const s of c.below) if (s.zone === 'ind') s.corp = 1; };
  function wrap(name, fn){ const orig = self[name]; if (typeof orig !== 'function') return; self[name] = function (){ return fn.call(this, orig, ...arguments); }; }
  // new ground costs Scrip: 5 for the first, about 2% more for every plot the city already has (empty, or under a building placed with it)
  wrap('addPlatform', function (orig, i, j, zone){
    const tc = tileCost();
    if (!zone){ if (!afford(tc)) return null; const c = orig(i, j, zone); if (c){ charge(tc); setTimeout(() => floatText(c.x, CURB + .4, c.z, '−' + fmt(tc) + ' Scrip', 'cost'), 40); E.emit('tile', { c, cost: tc }); } return c; }
    const g = gateNew(zone); if (!g) return null; if (st.money < g.cost + tc){ afford(g.cost + tc); return null; }
    const c = orig(i, j, zone); if (c){ charge(g.cost + tc); markCorp(c, g); if (g.z === 'K') refresh([c]); E.emit('build', { c, z: g.z, fresh: true, cost: g.cost + tc }); }
    return c;
  });
  wrap('addSection', function (orig, c, zone, opt = {}){
    const fresh = !c.sections.length, g = fresh ? gateNew(zone) : gateUp(c, zone, opt); if (!g) return;
    const n0 = c.sections.length, f0 = floorsOf(c), r = orig(c, zone, opt);
    if (c.sections.length > n0){ charge(g.cost); markCorp(c, g); E.emit('build', { c, z: g.z, fresh, f0, cost: g.cost }); }
    return r;
  });
  for (const nm of ['addLift', 'addFloatPod', 'addPodDown', 'addBelowUp']) wrap(nm, function (orig, c, a, b, d){
    const zone = nm === 'addLift' || nm === 'addFloatPod' ? b : a;
    const fresh = !c.sections.length && !(c.below && c.below.length), g = fresh ? gateNew(zone) : gateUp(c, zone, null); if (!g) return null;
    const n0 = c.sections.length + (c.below ? c.below.length : 0), r = orig(c, a, b, d);
    if (c.sections.length + (c.below ? c.below.length : 0) > n0){ charge(g.cost); markCorp(c, g); E.emit('build', { c, z: g.z, fresh, cost: g.cost }); }
    return r;
  });
  // megastructures: one of each (Emitter Cores as many as you like), at their tier, for Scrip
  E.megaGate = kind => {
    const d = MEGA[kind]; if (!d) return true;
    if (d.tier > st.tier){ say(MEGA_TYPES[kind].name + ' opens at ' + TIERS[d.tier].name); return false; }
    if (d.after && !built(d.after)){ say(MEGA_TYPES[kind].name + ' needs the ' + MEGA_TYPES[d.after].name + ' first'); return false; }
    if (kind !== 'emitter' && built(kind)){ say('One ' + MEGA_TYPES[kind].name + ' per sector'); return false; }
    return afford(kind === 'emitter' ? nextCoreCost() : d.cost);
  };
  wrap('placeFromMenu', function (orig, kind, ci, cj, turned){
    if (!E.megaGate(kind)) return null;
    const cost = kind === 'emitter' ? nextCoreCost() : MEGA[kind] ? MEGA[kind].cost : 0, ms = kind === 'emitter' ? nextCoreBuildMs() : 0;
    const m = orig(kind, ci, cj, turned);
    if (m){ charge(cost); if (kind === 'emitter') coreState(m).readyAt = now() + ms; E.emit('mega', { m, kind }); save(); hudSoon(); }
    return m;
  });
  wrap('addMegaTier', function (orig, m){
    if (!m || m.kind !== 'mall'){ say('Only the Sky mall grows in Economy'); return; }
    if (m.levels >= MEGA_TYPES.mall.maxLevels) return;
    const cost = Math.round(MEGA.mall.cost*Math.pow(MEGA.mall.levelGrowth, m.levels)); if (!afford(cost)) return;
    const l0 = m.levels, r = orig(m); if (m.levels > l0) charge(cost); return r;
  });
  wrap('fieldPlan', function (){ return []; });   // (no force-field dome over the city in Economy: the cores show their reach on the ground instead)
  wrap('maybeSpawnMegas', function (){ /* in Economy nothing arrives on its own: the tiers unlock, the player builds */ });
  // transit: the metro opens at Zoned, the sky highways at Incorporated; track and stops are bought plot by plot
  E.transit = which => which === 'hw' ? st.tier >= 4 : st.tier >= 2;
  wrap('mtApply', function (orig, t){
    if (!t || !t.ok) return orig(t);
    if (st.tier < 2){ say('The metro opens at Zoned'); return false; }
    const cost = { start: P.metroTile + P.metroStop, extend: P.metroTile, reopen: P.metroTile, prepend: P.metroTile, finish: P.metroStop, stop: P.metroStop }[t.type] || 0;
    if (cost && !afford(cost)) return false;
    const r = orig(t); if (r && cost) charge(cost); return r;
  });
  wrap('hwApply', function (orig, t){
    if (!t || !t.ok) return orig(t);
    if (st.tier < 4){ say('Sky highways open at Incorporated'); return false; }
    const cost = t.type === 'finish' ? P.hwFinish : P.hwTile;
    if (!afford(cost)) return false;
    const r = orig(t); if (r) charge(cost); return r;
  });

  /* ---------- upgrades bought in the City office ---------- */
  E.upCore = id => { const m = typeof megas !== 'undefined' && megas.get(id); if (!m || m.kind !== 'emitter' || st.tier < 1) return; const c = coreUpCost(m); if (!afford(c)) return; charge(c); coreState(m).up++; save(); renderOffice(); };
  const UPNAME = {
    R: ['Rewired walk-ups', 'Hot water on every floor', 'Rooftop gardens', 'Noise-proof glass', 'Smart co-ops', 'Sky bridges', 'Arcology lease', 'Vertical villages'],
    C: ['Neon frontage', 'Late licences', 'Holo-menus', 'Drone delivery', 'Night markets', 'Data-loan kiosks', 'Mega-mall franchise', 'Sector brand'],
    I: ['Second shift', 'Robot arms', 'Waste-heat loop', 'Fab printers', 'Lights-out lines', 'Fusion cell', 'Orbital supply', 'Nanoforge'],
    L: ['Concierge desks', 'Private lifts', 'Sky pools', 'Bio-air', 'Penthouse holos', 'Cloud suites', 'Orbital views', 'Gilded spires'],
    K: ['Quarterly targets', 'Shell companies', 'Lobbyists', 'Data harvest', 'Mergers', 'Sector charter', 'Board of AIs', 'The monopoly'],
  };
  E.upZone = z => { const u = upNext(z); if (!u || !u.open || !afford(u.cost)) return; charge(u.cost); st.up[z] = u.k + 1; save(); renderOffice(); say(`${UPNAME[z][u.k]} · ${ZNAME[z]} output x2`); };
  E.upMega = kind => { const d = MEGA[kind]; if (!d || !d.upCost || !built(kind) || (kind === 'radio' && st.tier < 1)) return; const c = megaUpCost(kind); if (!afford(c)) return; charge(c); st.ups[kind] = (st.ups[kind] || 0) + 1; save(); renderOffice(); };
  E.cutBuild = (id, ms) => { const m = megas.get(id); if (!m) return; const s = coreState(m); s.readyAt = Math.max(now(), s.readyAt - ms); hudSoon(); };

  /* ---------- the Overseer: once the Data Spire stands, the cheapest building ready to grow gets its next floor ---------- */
  let autoT = 0;
  function autoTick(){
    if (!st.auto || !built('spire') || (typeof anims !== 'undefined' && anims.length)) return;
    if ((autoT = (autoT + 1) % 5)) return;
    let best = null, bc = Infinity;
    for (const b of B.values()){ if (!b.powered || b.floors >= b.cap || b.occ < b.floors - .1 || b.c.lift) continue; const k = upgradeCost(b.z, b.floors); if (k < bc){ bc = k; best = b; } }
    if (!best || st.money < bc*1.2 || R.supply - R.demandAll < P.pwr[best.z]) return;
    const zone = { R: 'low', C: 'mid', L: 'high', I: 'ind', K: 'ind' }[best.z];
    const keep = st.corp; st.corp = best.z === 'K'; try { addSection(best.c, zone, {}); } finally { st.corp = keep; }
  }

  // Always night in Economy, so the lights coming on are the show (owner, Oct 31). Only the picture: the clock, the people's days and the stories
  // run on as usual; the sky, sun, glows and window lights are worked out as if it were this hour.
  const NIGHT_HOUR = 23;
  wrap('phaseName', function (){ return 'Night'; });   // (the label under the clock agrees with the sky)
  wrap('applyTime', function (orig){ if (typeof S === 'undefined') return orig(); const h = S.hour; S.hour = NIGHT_HOUR; try { return orig(); } finally { S.hour = h; } });

  // on load: the table filled before the city is drawn, so each building is made with its lights as they were (not lit, then darkened)
  wrap('load', function (orig){ const ok = orig(); if (ok) try { step(1e-9, false); } catch (e) { console.warn('econ load', e); } return ok; });

  /* ---------- the clock ---------- */
  let lastT = now(), saveT = 0, booted = false, needView = true;
  function boot(){
    booted = true;
    if (st.fresh){
      // a new sector: it starts with one Emitter Core (the Psycho-Acoustic Grid is an optional build)
      st.fresh = false; st.money = P.startMoney;
      const c0 = cells.get('0,0') || [...cells.values()][0];
      for (const kind of ['emitter']) try { const blk = findMegaBlock(kind, c0); if (blk){ const m = spawnMegaAt(kind, blk); if (m && kind === 'emitter') coreState(m).readyAt = 0; } } catch (e) { console.warn('econ starter', e); }
      try { save(); if (typeof window.save === 'function') window.save(); } catch (e) {}
      onTier(0, false);
      st.last = now();
    } else onTier(st.tier, false);
    // (time away doesn't count: progress comes from playing)
    lastT = now(); save();
  }
  const fmtDur = ms => ms >= 3600e3 ? (ms/3600e3).toFixed(1) + ' h' : ms >= 60e3 ? Math.round(ms/60e3) + ' min' : Math.max(1, Math.round(ms/1000)) + ' s';
  function tick(){
    if (typeof cells === 'undefined') return;
    if (!booted){ if (cells.size < 1) return; boot(); }
    const t = now(); let dt = Math.min(2, Math.max(0, (t - lastT)/1000)); lastT = t;   // (a hidden tab or a long gap: no catching up)
    step(dt*K/3600, true);
    if (needView && !(typeof TITLE !== 'undefined' && TITLE.on)){ needView = false; try { const m = megaList('emitter')[0]; if (m) camGoal.set(m.x, camGoal.y, m.z); zoomT = 12*(typeof ZK !== 'undefined' ? ZK : 1); } catch (e) {} }   // (each time the city opens: in close on the core)
    darkSync(); autoTick(); hud(); hintTick(); try { powerTick(dt*1000); } catch (e) { console.warn('surge', e); }
    if ((saveT += dt) > 10){ saveT = 0; save(); }
    if (typeof WIRELOG !== 'undefined' && WIRELOG.say && built('wirenest')) demandLine();
  }
  let tickErr = 0; setInterval(() => { try { tick(); } catch (e) { if (tickErr++ < 5) console.error('economy tick', e); } }, 1000);
  let demT = 40;
  function demandLine(){
    if (--demT > 0) return; demT = 45 + (Math.random()*30 | 0);
    const d = R.demandZ, names = { R: 'Residential', C: 'Commercial', I: 'Industrial', L: 'Luxury' };
    const up = Object.keys(d).filter(k => d[k] > 0), lo = Object.keys(d).filter(k => d[k] < 0);
    if (up.length) WIRELOG.say('CITY', names[up[Math.random()*up.length | 0]] + ' demand · elevated');
    else if (lo.length) WIRELOG.say('CITY', names[lo[0]] + ' demand · low');
    else WIRELOG.say('CITY', 'Zone demand · nominal · ' + fmt(R.rev) + ' Scrip/min');
  }

  /* ---------- the interface ---------- */
  const css = `
  .econ-hud { --e-bg: rgba(12,10,20,.92); --e-line: rgba(255,179,71,.38); --e-hair: rgba(255,255,255,.1); --e-txt: #efe6d6; --e-dim: #9a92aa; --e-acc: #ffb347; --e-good: #5affa8; --e-bad: #ff5a6e;
    position: fixed; z-index: 4; top: calc(10px + env(safe-area-inset-top,0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: stretch;
    font: 12px/1.25 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--e-txt); background: var(--e-bg); border: 1px solid var(--e-line); max-width: calc(100vw - 24px); }
  .econ-hud .eh { padding: 6px 12px; display: flex; flex-direction: column; justify-content: center; gap: 2px; border-right: 1px solid var(--e-hair); min-width: 0; white-space: nowrap; }
  .econ-hud .eh:last-child { border-right: 0; }
  .econ-hud [hidden] { display: none !important; }
  .econ-hud small { color: var(--e-dim); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; }
  .econ-hud b { font-weight: 500; font-variant-numeric: tabular-nums; }
  .econ-hud .scrip b { color: var(--e-acc); font-size: 16px; } .econ-hud .rate { color: var(--e-good); font-size: 11px; } .econ-hud .rate.neg { color: var(--e-bad); }
  .econ-hud .scrip b.bump { animation: ehBump .35s ease-out; } @keyframes ehBump { 0% { transform: scale(1.25); color: #fff; } 100% { transform: none; } }
  .econ-hud .bar { height: 4px; background: var(--e-hair); width: 100%; min-width: 70px; } .econ-hud .bar i { display: block; height: 100%; background: var(--e-acc); transition: width .4s; }
  .econ-hud .pw.over b { color: var(--e-bad); } .econ-hud .pw .bar i { background: #38e8e0; } .econ-hud .pw.over .bar i { background: var(--e-bad); }
  .econ-hud .dm { display: flex; gap: 7px; } .econ-hud .dm span { color: var(--e-dim); } .econ-hud .dm span.up { color: var(--e-good); } .econ-hud .dm span.dn { color: var(--e-bad); }
  .econ-hud button { all: unset; cursor: pointer; padding: 0 14px; color: var(--e-acc); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
  .econ-hud button:hover, .econ-hud button:focus-visible { color: #fff; background: rgba(255,179,71,.12); }
  .econ-corp { position: fixed; z-index: 4; top: calc(70px + env(safe-area-inset-top,0px)); left: 50%; transform: translateX(-50%); display: flex; font: 12px/1 'JetBrains Mono', monospace; border: 1px solid rgba(232,224,58,.5); background: rgba(12,10,20,.92); }
  .econ-corp[hidden] { display: none; } .econ-corp button { all: unset; cursor: pointer; padding: 9px 14px; color: #a9a2b6; letter-spacing: .12em; text-transform: uppercase; }
  .econ-corp button[aria-pressed="true"] { color: #12101a; background: #e8e03a; }
  .econ-flash { position: fixed; z-index: 6; left: 50%; top: calc(74px + env(safe-area-inset-top,0px)); transform: translateX(-50%); font: 13px/1.45 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.95); border: 1px solid rgba(255,90,110,.55); padding: 8px 14px; pointer-events: none; max-width: calc(100vw - 32px); text-align: center; }
  .econ-flash[hidden] { display: none; }
  .econ-note { position: fixed; z-index: 7; right: max(16px, env(safe-area-inset-right,0px)); bottom: calc(150px + env(safe-area-inset-bottom,0px)); width: min(400px, calc(100vw - 32px)); box-sizing: border-box;
    font: 15px/1.45 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.96); border: 1px solid rgba(255,179,71,.45); border-left: 4px solid #ffb347; padding: 12px 16px; white-space: pre-line; }
  .econ-note[hidden] { display: none; } .econ-note .t { color: #ffb347; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; display: block; margin-bottom: 6px; }
  .econ-note .say { font-size: 17px; line-height: 1.35; color: #fff; display: block; }
  .econ-note .sub { display: block; margin-top: 6px; color: #b9b0c8; font-size: 13px; }
  .econ-note .prog { display: flex; gap: 4px; margin-top: 10px; flex: 1 1 auto; min-width: 0; max-width: 220px; } .econ-note .prog i { flex: 1 1 0; min-width: 6px; max-width: 22px; height: 6px; background: rgba(255,255,255,.12); }   /* (the pips shrink to fit however many steps there are) */ .econ-note .prog i.on { background: #ffb347; }
  .econ-note .row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 10px; flex-wrap: wrap; } .econ-note .row > div:last-child { display: flex; gap: 4px; flex: none; margin-left: auto; } .econ-note button { all: unset; cursor: pointer; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #9a92aa; padding: 8px 10px; }
  .econ-note button.go { color: #12101a; background: #ffb347; } .econ-note button:focus-visible { outline: 1px solid #ffb347; }
  .econ-note.done-flash { animation: enDone .5s ease-out; } @keyframes enDone { 0% { border-color: #5affa8; box-shadow: 0 0 0 6px rgba(90,255,168,.25); } 100% { box-shadow: none; } }
  .econ-pulse { animation: ePulse 1.1s ease-in-out infinite !important; position: relative; z-index: 5; }
  @keyframes ePulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(255,179,71,.9), 0 0 0 6px rgba(255,179,71,.0); } 50% { box-shadow: 0 0 0 2px rgba(255,179,71,.9), 0 0 18px 6px rgba(255,179,71,.55); } }
  .econ-tip { position: fixed; z-index: 61; pointer-events: none; font: 13px/1.5 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.95); border: 1px solid rgba(255,179,71,.4); padding: 8px 11px; transform: translate(18px, 12px); white-space: pre; display: none; }
  .econ-tip .h { color: #ffb347; } .econ-tip .bad { color: #ff8a98; } .econ-tip .ok { color: #5affa8; }
  .econ-float { position: fixed; z-index: 5; pointer-events: none; font: 700 20px/1 'JetBrains Mono', monospace; color: #ffb347; text-shadow: 0 0 8px rgba(255,179,71,.7), 0 1px 0 #000; background: rgba(10,8,18,.72); padding: 5px 9px 6px; border-radius: 4px; transform: translate(-50%, -50%); animation: eFloat 1.6s ease-out forwards; white-space: nowrap; }
  .econ-float.cost { color: #ff8a98; font-size: 17px; text-shadow: 0 1px 0 #000; } .econ-float.big { color: #fff; font-size: 16px; letter-spacing: .14em; text-transform: uppercase; text-shadow: 0 0 10px rgba(56,232,224,.9), 0 1px 0 #000; } .econ-float.warn { color: #ff8a98; font-size: 17px; } .econ-float.boost { color: #5ae8ff; font-size: 16px; text-shadow: 0 0 8px rgba(90,232,255,.8), 0 1px 0 #000; }
  @keyframes eFloat { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.7); } 12% { opacity: 1; transform: translate(-50%, -70%) scale(1.15); } 70% { opacity: 1; transform: translate(-50%, -170%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -230%) scale(1); } }
  .econ-float.arrive { font-size: 13px; color: #c9fffb; text-shadow: 0 1px 0 #000; padding: 3px 7px; animation-duration: 1.3s; }
  .econ-reach { position: fixed; z-index: 6; pointer-events: none; transform: translate(-50%, -100%); font: 600 14px/1.35 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(10,8,18,.9); border: 1px solid currentColor; padding: 7px 11px; text-align: center; white-space: nowrap; }
  .econ-reach b { display: block; font-size: 17px; } .econ-reach[hidden] { display: none; }
  .econ-office { box-sizing: border-box; position: fixed; z-index: 30; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); overflow-y: auto; background: rgba(12,10,20,.97); border-left: 1px solid rgba(255,179,71,.35); color: #efe6d6;
    font: 14px/1.5 'JetBrains Mono', ui-monospace, monospace; padding: calc(12px + env(safe-area-inset-top,0px)) max(18px, env(safe-area-inset-right,0px)) calc(24px + env(safe-area-inset-bottom,0px)) 18px; }
  .econ-office[hidden] { display: none; }
  .econ-office header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .econ-office h2 { margin: 0; font-size: 13px; letter-spacing: .24em; text-transform: uppercase; color: #ffb347; font-weight: 500; }
  .econ-office .x { all: unset; cursor: pointer; width: 44px; height: 44px; display: grid; place-items: center; color: #9a92aa; font-size: 18px; } .econ-office .x:hover { color: #fff; }
  .econ-office .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.08); }
  .econ-office .stats div { background: #12101c; padding: 10px; } .econ-office .stats small { display: block; color: #9a92aa; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; } .econ-office .stats b { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .econ-office .next { margin-top: 14px; border: 1px solid rgba(255,179,71,.4); padding: 12px; } .econ-office .next .nm { color: #ffb347; font-size: 16px; } .econ-office .next p { margin: 4px 0 10px; color: #b9b0c8; font-size: 13px; }
  .econ-office .meter { margin-top: 8px; font-size: 13px; } .econ-office .meter div { display: flex; justify-content: space-between; } .econ-office .meter .bar { height: 6px; background: rgba(255,255,255,.1); margin-top: 3px; } .econ-office .meter .bar i { display: block; height: 100%; background: #ffb347; }
  .econ-office details { border-top: 1px solid rgba(255,255,255,.08); margin-top: 14px; } .econ-office summary { cursor: pointer; padding: 12px 0 6px; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #9a92aa; list-style: none; display: flex; justify-content: space-between; }
  .econ-office summary::after { content: '+'; } .econ-office details[open] summary::after { content: '–'; } .econ-office summary:hover { color: #fff; }
  .econ-office .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.05); } .econ-office .row small { display: block; color: #9a92aa; font-size: 12px; }
  .econ-office .btn { all: unset; cursor: pointer; padding: 8px 12px; border: 1px solid rgba(255,179,71,.5); color: #ffb347; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
  .econ-office .btn:hover, .econ-office .btn:focus-visible { background: rgba(255,179,71,.14); color: #fff; } .econ-office .btn[disabled] { opacity: .4; cursor: default; }
  .econ-office p { margin: 6px 0; color: #b9b0c8; font-size: 13px; } .econ-office table { width: 100%; border-collapse: collapse; font-size: 13px; } .econ-office td { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.05); } .econ-office td:last-child { text-align: right; }
  .econ-office .done td { color: #7d768c; } .econ-office .cur td { color: #ffb347; }
  .econ-mini { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(6,5,10,.72); }
  .econ-mini[hidden] { display: none; }
  .econ-mini .box { background: #0d0a16; border: 1px solid rgba(56,232,224,.5); padding: 14px; font: 13px/1.4 'JetBrains Mono', monospace; color: #efe6d6; width: min(340px, calc(100vw - 32px)); }
  .econ-mini canvas { display: block; width: 100%; aspect-ratio: 1/1.1; background: #07060c; touch-action: none; cursor: pointer; }
  .econ-mini .top { display: flex; justify-content: space-between; margin-bottom: 8px; color: #38e8e0; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }
  .econ-mini .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: #9a92aa; }
  .econ-hud .nx { display: none; }   /* (the objectives panel, top left, shows this now) */
  .econ-obj { position: fixed; z-index: 4; left: max(16px, env(safe-area-inset-left,0px)); top: calc(40px + env(safe-area-inset-top,0px)); width: 236px; box-sizing: border-box;
    font: 12px/1.3 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.9); border: 1px solid rgba(255,179,71,.38); padding: 9px 11px 10px; }
  .econ-obj .h { display: flex; justify-content: space-between; align-items: baseline; } .econ-obj .h small { color: #9a92aa; font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; }
  .econ-obj .h b { color: #ffb347; font-size: 15px; font-weight: 600; } .econ-obj .h span { color: #ffb347; font-size: 13px; font-variant-numeric: tabular-nums; }
  .econ-obj .ov { height: 9px; background: rgba(255,255,255,.1); margin: 6px 0 8px; position: relative; overflow: hidden; } .econ-obj .ov i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #ff9a2a, #ffb347); transition: width .4s; }
  .econ-obj .ov i::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent); animation: eoSheen 2.4s linear infinite; } @keyframes eoSheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
  .econ-obj .r { margin-top: 5px; } .econ-obj .r div { display: flex; justify-content: space-between; color: #b9b0c8; font-size: 11.5px; } .econ-obj .r div b { color: #efe6d6; font-weight: 500; font-variant-numeric: tabular-nums; }
  .econ-obj .r .bar { height: 4px; background: rgba(255,255,255,.1); margin-top: 3px; } .econ-obj .r .bar i { display: block; height: 100%; background: #9a92aa; transition: width .4s; }
  .econ-obj .r.ok div b { color: #5affa8; } .econ-obj .r.ok .bar i { background: #5affa8; } .econ-obj .r.lim .bar i { background: #ffb347; } .econ-obj .r.lim div span::before { content: '▸ '; color: #ffb347; }
  .econ-obj .u { margin-top: 8px; color: #9a92aa; font-size: 11px; } .econ-obj .u em { color: #c9fffb; font-style: normal; }
  html.touch .econ-obj { top: calc(112px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); width: 200px; padding: 7px 9px; } html.touch .econ-corp { top: calc(250px + env(safe-area-inset-top,0px)); }
  html.econ-nolux .zone[data-zone="high"], html.econ-nolux [data-perim="high"] { display: none !important; }   /* (Luxury stays hidden until Chartered) */
  .zone.econ-new { animation: ePulse 1.1s ease-in-out 6; }
  html.econ .gdeck { top: calc(var(--econ-obj-b, 190px) + 10px); }   /* (the left column, top to bottom: goals, the Grid's player, Buildings) */
  html.econ:not(.gdeck-on) .bmenu { top: calc(var(--econ-obj-b, 190px) + 12px); }
  .econ-legend { position: fixed; z-index: 5; left: 50%; transform: translateX(-50%); top: calc(76px + env(safe-area-inset-top,0px)); display: flex; align-items: center; gap: 14px; white-space: nowrap; max-width: calc(100vw - 32px);
    font: 600 15px/1.2 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.95); border: 1px solid rgba(143,196,255,.55); padding: 9px 14px; }
  .econ-legend[hidden] { display: none; } .econ-legend b { color: #8fc4ff; letter-spacing: .12em; text-transform: uppercase; font-size: 14px; }
  .econ-legend span { display: flex; align-items: center; gap: 7px; } .econ-legend i { width: 15px; height: 15px; display: inline-block; } .econ-legend em { color: #b9b0c8; font-style: normal; font-weight: 400; font-size: 13px; }
  .econ-legend button { all: unset; cursor: pointer; color: #9a92aa; padding: 2px 6px; font-size: 16px; } .econ-legend button:hover { color: #fff; }
  .econ-hud .vw > div { display: flex; gap: 2px; } .econ-hud .vw button { padding: 3px 7px; font-size: 11px; letter-spacing: .08em; border: 1px solid rgba(143,196,255,.35); color: #8fc4ff; }
  .econ-hud .vw button[aria-pressed="true"] { color: #12101a; background: #8fc4ff; }
  html.touch .econ-legend { top: auto; bottom: calc(150px + env(safe-area-inset-bottom,0px)); }
  .econ-mini .how { margin: 0 0 8px; color: #b9b0c8; font-size: 12px; line-height: 1.45; }
  .econ-mini .meter { height: 8px; background: rgba(255,255,255,.1); margin-top: 8px; } .econ-mini .meter i { display: block; height: 100%; width: 0; background: #5affa8; transition: width .1s; } .econ-mini .meter.big { height: 14px; }
  .econ-mini .crankbtn { all: unset; cursor: pointer; display: grid; place-items: center; gap: 4px; margin: 10px auto; width: 150px; height: 150px; border-radius: 50%; border: 2px solid #7ab8ff; color: #cfe6ff; background: radial-gradient(#13203a, #07060c); box-shadow: 0 0 22px rgba(122,184,255,.35); user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .econ-mini .crankbtn span { font-size: 54px; line-height: 1; display: block; } .econ-mini .crankbtn b { font-size: 12px; letter-spacing: .3em; text-transform: uppercase; } .econ-mini .crankbtn:active { transform: scale(.96); }
  .econ-mark { position: fixed; z-index: 6; transform: translate(-50%, -100%); cursor: pointer; font: 600 13px/1.3 'JetBrains Mono', monospace; color: #fff; background: rgba(10,8,18,.92); border: 2px solid var(--sc, #ff3a3a); padding: 6px 10px 8px; text-align: center; white-space: nowrap; box-shadow: 0 0 16px var(--sc, #ff3a3a); }
  .econ-mark b { display: block; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: var(--sc, #ff3a3a); } .econ-mark span { font-size: 11.5px; color: #d8d0e4; }
  .econ-mark i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--sc); }
  .econ-mark.s2 { animation: emBlink .5s steps(2) infinite; } @keyframes emBlink { 50% { box-shadow: 0 0 2px var(--sc); } }
  .econ-mark.off { --sc: #8a8396; border-color: #ff5a6e; box-shadow: 0 0 14px rgba(255,90,110,.5); } .econ-mark.off b { color: #ff8a98; }
  .econ-mini button { all: unset; cursor: pointer; color: #38e8e0; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; padding: 8px; }
  .zone.econ-cant { opacity: .5; } .zone[data-econ-cost] { position: relative; } .zone[data-econ-cost]::after { content: attr(data-econ-cost); position: absolute; right: 4px; top: 3px; font: 9.5px/1 'JetBrains Mono', monospace; color: #ffb347; opacity: .85; pointer-events: none; }
  .econ-note.anch { width: min(360px, calc(100vw - 24px)); } .econ-note.anch::after { content: ''; position: absolute; left: var(--ax, 50%); top: 100%; margin-left: -9px; border: 9px solid transparent; border-top-color: #ffb347; }
  .econ-note.anch.below::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: #ffb347; }
  .econ-note.tip { border-left-color: #38e8e0; } .econ-note.tip .t { color: #38e8e0; }
  .econ-class { position: fixed; z-index: 8; left: 50%; top: 22%; transform: translate(-50%, 0); text-align: center; pointer-events: none; font-family: 'JetBrains Mono', monospace; color: #fff; width: min(560px, calc(100vw - 32px)); }
  .econ-class .k { font-size: 12px; letter-spacing: .4em; text-transform: uppercase; color: #ffb347; animation: ecIn .5s ease-out both; }
  .econ-class .n { font-size: clamp(30px, 7vw, 56px); letter-spacing: .12em; text-transform: uppercase; margin: 6px 0 14px; text-shadow: 0 0 18px rgba(255,179,71,.85), 0 0 2px #fff; animation: ecBig .9s cubic-bezier(.2,1.4,.4,1) both; }
  .econ-class .cards { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .econ-class .cards span { font-size: 13px; padding: 7px 11px; background: rgba(12,10,20,.92); border: 1px solid rgba(56,232,224,.55); color: #c9fffb; animation: ecIn .45s ease-out both; }
  .econ-class.out { animation: ecOut .6s ease-in forwards; }
  @keyframes ecBig { 0% { opacity: 0; transform: scale(1.8); filter: blur(6px); } 100% { opacity: 1; transform: none; filter: none; } }
  @keyframes ecIn { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: none; } }
  @keyframes ecOut { to { opacity: 0; transform: translate(-50%, -14px); } }
  html.touch .econ-hud { top: calc(54px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); transform: none; font-size: 11px; } html.touch .econ-hud .eh { padding: 5px 9px; } html.touch .econ-hud .hide-t { display: none; }
  html.touch .econ-corp { top: calc(112px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); transform: none; }
  html.touch .econ-note { font-size: 14px; padding: 11px 14px; right: auto; left: 50%; transform: translateX(-50%); bottom: calc(150px + env(safe-area-inset-bottom,0px)); }
  @media (max-width: 900px) { html:not(.touch) .econ-note { right: auto; left: 50%; transform: translateX(-50%); } } html.touch .econ-note .say { font-size: 16px; }
  html.touch .econ-flash { top: calc(116px + env(safe-area-inset-top,0px)); }
  @media (max-width: 560px) { .econ-hud .hide-s { display: none; } }
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const hudEl = el('div', 'econ-hud'); hudEl.setAttribute('role', 'status'); hudEl.setAttribute('aria-label', 'City economy');
  hudEl.innerHTML = `<div class="eh scrip"><small>Scrip</small><b id="ehM">0</b><span class="rate" id="ehR">+0/min</span></div>
    <div class="eh"><small>Residents</small><b id="ehP">0</b></div>
    <div class="eh pw hide-t" id="ehPw"><small>Power</small><b id="ehPwV">0/0</b><div class="bar"><i id="ehPwB"></i></div></div>
    <div class="eh hide-s nx"><small id="ehTn">Next</small><b id="ehTv">0/100</b><div class="bar"><i id="ehTb"></i></div></div>
    <div class="eh hide-s" id="ehDm" hidden><small>Demand</small><div class="dm" id="ehDmV"></div></div>
    <div class="eh vw" role="group" aria-label="Map views"><small>Map</small><div><button type="button" id="ehV_power" aria-pressed="false" title="Where power reaches (V cycles the maps)">Power</button><button type="button" id="ehV_air" aria-pressed="false" title="Air pollution round the cores">Air</button><button type="button" id="ehV_noise" aria-pressed="false" title="Noise from factories, shops and the Grid">Noise</button></div></div>
    <button type="button" id="ehO" aria-haspopup="dialog">Office</button>`;
  document.body.appendChild(hudEl);
  const objEl = el('div', 'econ-obj'); objEl.setAttribute('role', 'status'); objEl.setAttribute('aria-label', 'Next classification'); document.body.appendChild(objEl);
  let objKey = '';
  function objectives(){
    const done = st.tier >= TIERS.length - 1, nt = TIERS[Math.min(st.tier + 1, TIERS.length - 1)];
    if (done){ const k = 'done'; if (objKey !== k){ objKey = k; objEl.innerHTML = `<div class="h"><small>Sector</small><b>${TIERS[st.tier].name}</b></div><div class="u">Every classification reached. The coast is open.</div>`; } stackLeft(); return; }
    const req = REQS.filter(([k]) => nt[k]).map(([k, lab, pc]) => [lab, Math.max(0, reqVal(k)), nt[k], pc]);
    const fr = req.map(r => Math.min(1, r[1]/r[2])), overall = fr.reduce((a, b) => a + b, 0)/Math.max(1, fr.length), lim = Math.min(...fr);
    const rows = req.map((r, k) => { const f = fr[k]; return `<div class="r ${f >= 1 ? 'ok' : f === lim ? 'lim' : ''}"><div><span>${r[0]}</span><b>${r[3] ? Math.floor(Math.min(r[1], r[2])) + ' / ' + r[2] + '%' : fmt(Math.min(r[1], r[2])) + ' / ' + fmt(r[2])}</b></div><div class="bar"><i style="width:${100*f}%"></i></div></div>`; }).join('');
    const opens = (nt.opens || '').split(',').slice(0, 3).map(x => x.trim()).filter(Boolean).join(', ');
    const html = `<div class="h"><small>Next · ${nt.name}</small><span>${Math.floor(overall*100)}%</span></div><div class="ov"><i style="width:${100*overall}%"></i></div>${rows}${opens ? `<div class="u">Unlocks <em>${opens}</em></div>` : ''}`;
    if (html !== objKey){ objKey = html; objEl.innerHTML = html; }
    stackLeft();
  }
  // keep the left column from overlapping: the goals' bottom, then the Grid player's (which the Buildings menu sits under, style.css)
  let stackT = 0;
  function stackLeft(){ cancelAnimationFrame(stackT); stackT = requestAnimationFrame(() => { const de = document.documentElement, r = objEl.getBoundingClientRect();
    if (r.height){ const b = Math.ceil(r.bottom) + 'px'; if (de.style.getPropertyValue('--econ-obj-b') !== b) de.style.setProperty('--econ-obj-b', b); }
    const gd = document.querySelector('.gdeck'); if (gd && de.classList.contains('gdeck-on')){ const g = gd.getBoundingClientRect(); if (g.height){ const b2 = Math.ceil(g.bottom) + 'px'; if (de.style.getPropertyValue('--gdeck-b') !== b2) de.style.setProperty('--gdeck-b', b2); } } }); }
  const corpEl = el('div', 'econ-corp', `<button type="button" data-c="0">Factory</button><button type="button" data-c="1">Corps</button>`); corpEl.hidden = true; corpEl.setAttribute('role', 'group'); corpEl.setAttribute('aria-label', 'Industrial kind');
  document.body.appendChild(corpEl);
  corpEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.corp = b.dataset.c === '1'; corpSync(); save(); });
  const corpSync = () => { corpEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.c === '1') === !!st.corp))); corpEl.hidden = !(typeof S !== 'undefined' && S.zone === 'ind' && st.tier >= 3); };
  const flashEl = el('div', 'econ-flash'); flashEl.hidden = true; document.body.appendChild(flashEl);
  let flashT = 0; function flash(msg){ flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => flashEl.hidden = true, 2800); }
  const noteEl = el('div', 'econ-note'); noteEl.hidden = true; noteEl.setAttribute('role', 'status'); document.body.appendChild(noteEl);
  let noteT = 0, noteTut = false;
  function note(msg, ms = 5000, title = 'City office'){ if (noteTut) return flash(msg.split('\n')[0]); noteEl.innerHTML = ''; noteEl.className = 'econ-note'; noteEl.append(el('span', 't', title), el('span', 'sub', '')); noteEl.lastChild.textContent = msg; noteEl.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { if (!noteTut) noteEl.hidden = true; }, ms); }
  E.note = note;

  /* ---------- just-in-time tips: each hidden rule explained once, the first time it actually bites, and why ---------- */
  const anyB = f => { for (const b of B.values()) if (f(b)) return true; return false; };
  const HINTS = {
    isolated: { say: 'Isolated: no ground joins that building to the city, so nobody can get there.', sub: 'Connect it with ground to the core or another building (or build within two plots of one).', on: () => anyB(b => b.isolated) },
    reach: { say: 'Out of the Emitter Core\'s reach.', sub: 'A core powers buildings within 9 plots. Past that the lights stay off: build another Emitter Core nearer (Buildings menu).', on: () => anyB(b => !b.isolated && !b.inRange && !megaList('emitter').some(m => coreState(m).off)) },
    power: { say: 'Power is maxed out.', sub: 'New levels stay dark until there is more power. Build another Emitter Core, or upgrade one in the Office.', on: () => R.demandAll > R.supply },
    grade: { say: 'Sector Grade caps how tall buildings grow.', sub: 'Shops, metro stops and police raise it; cores and factories lower it. A plot further from the core usually grows taller.', on: () => true },
    jobs: { say: 'Homes need work nearby.', sub: 'Factories and shops give jobs. Without them people move in slowly and fewer levels light.', on: () => anyB(b => (b.z === 'R' || b.z === 'L') && !b.isolated && b.powered && (b.ef < .5 || (b.jobBand === 'far' && !b.station))), wait: 25 },
    shoppers: { say: 'Shops need shoppers.', sub: 'Build homes around your shops: more residents nearby, more Scrip.', on: () => anyB(b => b.z === 'C' && b.powered && !b.isolated && b.occ < b.eff*.5), wait: 25 },
    grid: { first: 1, say: 'You can afford the Psycho-Acoustic Grid.', sub: 'A megastructure: every building within 7 plots of it earns 15% more. Find it in the Buildings menu. Optional, one per sector.', on: () => st.money >= MEGA.radio.cost && !built('radio') && countZone('R') >= 3 },
    charge: { say: 'New Emitter Cores take time to charge.', sub: 'Open the Office to see the charge, and play the stabilizer to speed it up.', on: () => megaList('emitter').some(m => !coreReady(m)) },
    demand: { say: 'The Wire Nest reads demand.', sub: 'In the top bar, ▲ means the city wants more of that zone; ▼ means it has enough.', on: () => built('wirenest') },
    metro: { say: 'The metro is open.', sub: 'Metro stops connect far blocks and raise Sector Grade around them. Find it under Transit.', on: () => st.tier >= 2 },
  };
  let hintShowing = 0;
  function hint(k){
    if (st.hints[k] || noteTut || !st.tut.done || Date.now() < hintShowing || celebrating) return false;
    const h = HINTS[k]; if (!h) return false;
    st.hints[k] = 1; save(); hintShowing = Date.now() + 9000;
    noteEl.innerHTML = ''; noteEl.className = 'econ-note tip';
    const sy = el('span', 'say'); sy.textContent = h.say; const sb = el('span', 'sub'); sb.textContent = h.sub;
    const row = el('div', 'row'), ok = el('button', 'go', 'Got it'); ok.type = 'button'; ok.onclick = () => { noteEl.hidden = true; hintShowing = 0; }; row.append(ok);
    noteEl.append(el('span', 't', 'Tip'), sy, sb, row); noteEl.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { noteEl.hidden = true; hintShowing = 0; }, 9000);
    return true;
  }
  let hintT = 0;
  const since = {};
  function hintTick(){
    if (++hintT % 2) return;
    const ks = Object.keys(HINTS).sort((a, b) => (HINTS[b].first || 0) - (HINTS[a].first || 0));
    for (const k of ks){ if (k === 'grade' || st.hints[k]) continue;
      if (!HINTS[k].on()){ delete since[k]; continue; }   // (a situational one waits until the problem has lasted a while, so it isn't just a building settling in)
      since[k] = since[k] || Date.now(); if (Date.now() - since[k] < (HINTS[k].wait || 0)*1000) continue;
      if (hint(k)) return; }
  }

  /* ---------- a new classification: the biggest moment in the game. A ring of light runs out from every core, the lit buildings flash in a wave, the unlocks are named ---------- */
  let celebrating = false;
  function celebrate(t){
    celebrating = true; setTimeout(() => celebrating = false, 4200);
    const opened = (TIER_KINDS[t] || []).filter(k => MEGA_TYPES[k]).map(k => MEGA_TYPES[k].name);
    const extra = { 2: ['Metro'], 3: ['Luxury homes', 'Corps'], 4: ['Sky highways'], 6: ['The coast'] }[t] || [];
    const box = el('div', 'econ-class'); box.setAttribute('role', 'status');
    box.append(el('div', 'k', 'Sector classified'), el('div', 'n', ''), el('div', 'cards', '')); box.children[1].textContent = TIERS[t].name;
    [...extra, ...opened].forEach((n, q) => { const c = el('span', ''); c.textContent = (q < extra.length ? 'Opens · ' : 'New · ') + n; c.style.animationDelay = (.5 + q*.12) + 's'; box.lastChild.append(c); });
    document.body.appendChild(box); setTimeout(() => box.classList.add('out'), 3800); setTimeout(() => box.remove(), 4500);
    try { if (typeof sfx !== 'undefined'){ sfx.play('megaArrive', { gain: .6, spread: 0 }); if (sfx.tone) [0, 4, 7, 12, 16].forEach((n, q) => sfx.tone(392*Math.pow(2, n/12), { gain: .13, at: .25 + q*.11, dur: q === 4 ? 1.4 : .6 })); } } catch (e) {}
    if (typeof scene === 'undefined') return;
    // the rings
    const cores = megaList('emitter');
    for (const m of cores){ const ring = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI/2; ring.position.set(m.x, CURB + .3, m.z); ring.layers.set(1); ring.renderOrder = 999; ring.frustumCulled = false; scene.add(ring);
      const t0 = performance.now(), R1 = (P.coreReach + 1)*LOT;
      (function go(){ const k = Math.min(1, (performance.now() - t0)/1600), e = 1 - Math.pow(1 - k, 2); ring.scale.setScalar(.5 + R1*e); ring.material.opacity = .9*(1 - k); if (k < 1) requestAnimationFrame(go); else { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } })(); }
    // the wave: every lit building flashes as the ring passes it
    const lit = [...B.values()].filter(b => b.lit > 0 && !b.isolated).map(b => ({ b, d: cores.length ? Math.min(...cores.map(m => Math.hypot(b.c.x - m.x, b.c.z - m.z))) : 0 })).sort((a, c) => a.d - c.d).slice(0, 60);
    for (const { b, d } of lit) setTimeout(() => pulseLevel(b.c, b.lit, b.z, true), 1600*Math.sqrt(Math.min(1, d/((P.coreReach + 1)*LOT))));
  }

  /* ---------- the light-up: a pulse round the level that just lit, and the Scrip it paid rising off it ---------- */
  const _v = new THREE.Vector3();
  function screenOf(x, y, z){ try { _v.set(x, y, z).project(cam); if (_v.z > 1) return null; const r = viewRect(); return [r.left + (_v.x*.5 + .5)*r.width, r.top + (1 - (_v.y*.5 + .5))*r.height]; } catch (e) { return null; } }
  function floatText(x, y, z, text, cls = ''){ const p = screenOf(x, y, z); if (!p) return; const f = el('div', 'econ-float ' + cls); f.textContent = text; f.style.left = p[0] + 'px'; f.style.top = (p[1] - 34) + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1700); }
  const ZCOL = { R: 0x6fc24a, C: 0xffb347, L: 0xff4fa3, I: 0xe8e03a, K: 0xe8e03a };
  const pulseGeo = new THREE.BoxGeometry(1, 1, 1), pulseEdge = new THREE.EdgesGeometry(pulseGeo), pulses = [];
  function pulseLevel(c, lit, z, whole, colOver){
    if (typeof scene === 'undefined' || pulses.length > (whole ? 70 : 8)) return;
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = whole ? (c.lift ? c.lift.y : CURB) : (!c.lift && lit > 1 && tops[lit - 2]) || (c.lift ? c.lift.y : CURB);
    const h = Math.max(.6, y1 - y0), w = (typeof SIDE !== 'undefined' ? SIDE : 3) + .15, col = colOver || ZCOL[z] || 0xffffff;
    const fill = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .8, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const edge = new THREE.LineSegments(pulseEdge, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, depthTest: false }));
    for (const o of [fill, edge]){ o.layers.set(1); o.renderOrder = 997; o.position.set(c.x, y0 + h/2, c.z); o.scale.set(w, h, w); scene.add(o); }
    pulses.push({ fill, edge, t0: performance.now(), w, h });
    if (pulses.length === 1) requestAnimationFrame(pulseTick);
  }
  function pulseTick(t){
    for (let i = pulses.length - 1; i >= 0; i--){ const p = pulses[i], k = Math.min(1, (t - p.t0)/900), e = 1 - Math.pow(1 - k, 3), g = 1 + .35*e;
      p.fill.scale.set(p.w*g, p.h*(1 + .2*e), p.w*g); p.edge.scale.copy(p.fill.scale); p.fill.material.opacity = .8*(1 - k); p.edge.material.opacity = 1 - k;
      if (k >= 1){ for (const o of [p.fill, p.edge]){ scene.remove(o); o.material.dispose(); } pulses.splice(i, 1); } }
    if (pulses.length) requestAnimationFrame(pulseTick);
  }
  /* the surge: three strands of current spiral up from the street round the building to the level that lit, then that level flashes */
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const surges = [];
  // tier 0: a home's first level (two thin strands, quick); 1: any other level (three); 2: a building topped out, or the first of its zone (four, thicker, slower, a bigger burst)
  function surge(c, lit, z, done, tier = 1){
    if (typeof scene === 'undefined' || surges.length > 5){ done(); return; }
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = c.lift ? c.lift.y : CURB;
    const h = Math.max(1, y1 - y0), w = (typeof SIDE !== 'undefined' ? SIDE : 3), R = w*(tier === 2 ? .8 : .74), dir = Math.random() < .5 ? -1 : 1;
    const turns = Math.max(2, h/1.6)*(.85 + Math.random()*.3), col = new THREE.Color(ZCOL[z] || 0xffffff).lerp(new THREE.Color(0xffffff), Math.random()*.2);
    const N = [2, 3, 4][tier], th = [.06, .085, .12][tier];
    const root = new THREE.Group(); root.position.set(c.x, y0, c.z);
    const SEG = Math.round(40*turns), RAD = 5, strands = [];
    for (let s = 0; s < N; s++){
      const ph = s*Math.PI*2/N, pts = [];
      for (let q = 0; q <= SEG; q++){ const u = q/SEG, a = ph + dir*u*turns*Math.PI*2, j = q && q < SEG ? (Math.random() - .5)*.22 : 0;
        pts.push(new THREE.Vector3(Math.cos(a)*(R + j), u*h + (Math.random() - .5)*.1, Math.sin(a)*(R + j))); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, th, RAD, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      const inner = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, th*.42, RAD, false), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      head.scale.setScalar([.8, 1.1, 1.6][tier]);
      for (const o of [outer, inner, head]){ o.layers.set(1); o.renderOrder = 998; o.frustumCulled = false; root.add(o); }
      strands.push({ outer, inner, head, curve });
    }
    const base = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    base.position.set(0, .1, 0); base.scale.set(w*2.2, w*2.2, 1); base.layers.set(1); base.renderOrder = 998; root.add(base);
    const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    top.position.set(0, h, 0); top.layers.set(1); top.renderOrder = 999; root.add(top);
    scene.add(root);
    surges.push({ root, strands, base, top, t0: performance.now(), SEG, h, w, done, fired: false, climb: [600, 750, 950][tier], burst: [1, 1, 1.8][tier] });
    if (surges.length === 1) requestAnimationFrame(surgeTick);
  }
  const CLIMB = 750, FADE = 450;
  function surgeTick(){ const t = performance.now();
    for (let i = surges.length - 1; i >= 0; i--){ const s = surges[i], el2 = Math.max(0, t - s.t0);
      const k = Math.min(1, el2/s.climb), head = k < 1 ? k*k*(3 - 2*k)*.85 + k*.15 : 1, tail = Math.max(0, head - .38), fk = Math.max(0, (el2 - s.climb)/FADE);
      const crackle = .75 + Math.random()*.25;
      for (const st2 of s.strands){
        const a = Math.floor(tail*s.SEG), b = Math.max(a + 1, Math.ceil(head*s.SEG)), rng = RADS => [a*RADS*6, (b - a)*RADS*6];
        const [o0, n0] = rng(5); st2.outer.geometry.setDrawRange(o0, n0); st2.inner.geometry.setDrawRange(o0, n0);
        st2.outer.material.opacity = .95*crackle*(1 - fk); st2.inner.material.opacity = (1 - fk);
        const p = st2.curve.getPointAt(Math.min(1, Math.max(0, head))); st2.head.position.copy(p); st2.head.material.opacity = (1 - fk)*crackle;
      }
      s.base.material.opacity = Math.max(0, 1 - el2/500); s.base.scale.setScalar(s.w*(2.2 + el2/400));
      if (k >= 1){
        if (!s.fired){ s.fired = true; try { s.done(); } catch (e) {} }
        const e2 = Math.min(1, fk*1.4); s.top.material.opacity = 1 - e2; s.top.scale.setScalar(s.w*s.burst*(1.5 + 3.5*e2));
      }
      if (fk >= 1){ scene.remove(s.root); s.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); surges.splice(i, 1); }
    }
    if (surges.length) requestAnimationFrame(surgeTick);
  }
  let lastBump = 0;
  E.onEv('light', d => {
    const b = B.get(keyOf(d.c)) || d, z = d.z || (b && b.z) || 'R', c = d.c, y = (!c.lift && c.sectionTops && c.sectionTops[d.lit - 1]) || c.height || CURB + 2;
    const firstOfZone = !st.firstZ[z] && d.lit === 1; if (firstOfZone){ st.firstZ[z] = 1; save(); }
    const topped = false, tier = firstOfZone ? 2 : d.lit === 1 && b && b.floors > 1 ? 0 : 1, climb = [600, 750, 950][tier];
    surge(c, d.lit, z, () => pulseLevel(c, d.lit, z), tier);
    setTimeout(() => { floatText(c.x, y + .6, c.z, '+' + fmt(d.pay) + ' Scrip'); if (tier === 2) setTimeout(() => floatText(c.x, y + 1.6, c.z, topped ? 'Max height' : 'First ' + ZNAME[z].toLowerCase(), 'big'), 180); }, climb);
    // its own tone, climbing the scale with the level (a pentatonic step per level), a chord when it's a big one
    try { if (typeof sfx !== 'undefined' && sfx.tone && performance.now() - lastBump > 140){ const PENT = [0, 2, 4, 7, 9, 12, 14, 16], f = n => 392*Math.pow(2, n/12), n0 = PENT[Math.min(PENT.length - 1, d.lit - 1)];
      setTimeout(() => { sfx.tone(f(n0), { gain: tier === 0 ? .1 : .15 }); if (tier === 2){ sfx.tone(f(n0 + 4), { gain: .1, at: .07 }); sfx.tone(f(n0 + 7), { gain: .1, at: .14, dur: .8 }); } }, climb - 60); } } catch (e) {}
    const m = document.getElementById('ehM'); if (m && performance.now() - lastBump > 200){ lastBump = performance.now(); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
  });
  E.onEv('build', d => { if (!d || !d.c) return; const c = d.c; setTimeout(() => { floatText(c.x, (c.height || CURB) + .4, c.z, '−' + fmt(d.cost) + ' Scrip', 'cost');
    const b = B.get(keyOf(c)); if (b && b.isolated) { floatText(c.x, (c.height || CURB) + 1.4, c.z, 'Isolated', 'warn'); if (st.hints.isolated) say('Isolated · nobody can reach it · connect it to the city with ground'); else hint('isolated'); } }, 60); });

  /* ---------- people trickling in: a small glow runs up one corner of the building and round its top edge (lighter than a light-up, and a different shape) ---------- */
  const trickles = [];
  E.onEv('arrive', d => {
    const c = d.c; if (typeof scene === 'undefined' || trickles.length > 6 || !c) return;
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[Math.max(0, (d.lit || 1) - 1)]) || c.height || CURB + 2, y0 = c.lift ? c.lift.y : CURB;
    const hw = (typeof SIDE !== 'undefined' ? SIDE : 3)/2 + .06, k0 = Math.random()*4 | 0, dir = Math.random() < .5 ? 1 : 3;
    const corner = q => { const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]][(k0 + q*dir) % 4]; return [a[0]*hw, a[1]*hw]; };
    const pts = [], add = (x, y, z) => pts.push(new THREE.Vector3(c.x + x, y, c.z + z));
    const [ax, az] = corner(0); add(ax, y0 + .05, az); add(ax, y1, az);
    for (let q = 1; q <= 4; q++){ const [x, z] = corner(q); add(x, y1, z); }
    const path = new THREE.CurvePath(); for (let q = 1; q < pts.length; q++) path.add(new THREE.LineCurve3(pts[q - 1], pts[q]));
    const col = new THREE.Color(ZCOL[d.z] || 0x38e8e0), SEG = 160;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, SEG, .055, 4, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); head.scale.setScalar(.7);
    for (const o of [tube, head]){ o.layers.set(1); o.renderOrder = 997; o.frustumCulled = false; scene.add(o); }
    const t0 = performance.now(), T = 1100; trickles.push(tube);
    (function run(){ const k = Math.min(1, (performance.now() - t0)/T), hd = k*(2 - k), tl = Math.max(0, hd - .22), a = Math.floor(tl*SEG), b = Math.max(a + 1, Math.ceil(hd*SEG));
      tube.geometry.setDrawRange(a*4*6, (b - a)*4*6); tube.material.opacity = .9*(k < .85 ? 1 : (1 - k)/.15); head.position.copy(path.getPointAt(Math.min(1, Math.max(0, hd)))); head.material.opacity = tube.material.opacity;
      if (k < 1) return requestAnimationFrame(run);
      for (const o of [tube, head]){ scene.remove(o); if (o.geometry) o.geometry.dispose(); o.material.dispose(); } trickles.splice(trickles.indexOf(tube), 1); })();
    setTimeout(() => floatText(c.x, y1 + .3, c.z, '+' + d.n + (d.n === 1 ? ' resident' : ' residents'), 'arrive'), 350);
    try { if (typeof sfx !== 'undefined' && sfx.tone && Math.random() < .6) sfx.tone(1175 + Math.random()*200, { gain: .035, dur: .18, glide: .95 }); } catch (e) {}
  });

  /* ---------- a full building: the uplink. A holographic scan sweeps down the building and back, it glitches between magenta and cyan,
     a beam of light shoots up off the roof into the sky, glyphs of data rise off it like rain running backwards, and a hologram tag
     over it decodes out of noise into FULL HOUSE and the payout ---------- */
  const FULLNAME = { R: 'Full house', L: 'Full house', C: 'Packed', I: 'Full shift', K: 'Full floor' };
  const NOISE = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF#%&@$/\\<>';
  const glyphTex = (() => { const out = []; for (const ch of 'アカサタナ01ﾊﾐﾑ7F#') { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.font = 'bold 44px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.fillStyle = '#fff'; g.fillText(ch, 32, 34); out.push(new THREE.CanvasTexture(cv)); } return out; })();
  let jackQ = [], jackOn = false;
  E.onEv('full', d => { if (jackQ.length >= 3){ floatText(d.c.x, (d.c.height || CURB + 2) + .4, d.c.z, FULLNAME[d.z] + ' +' + fmt(d.pay), 'big'); return; } jackQ.push(d); if (!jackOn) nextJack(); });
  function nextJack(){ const d = jackQ.shift(); if (!d){ jackOn = false; return; } jackOn = true; try { jackpot(d); } catch (e) { console.warn('uplink', e); } setTimeout(nextJack, 3000); }
  // the hologram's face, drawn on a canvas each frame while it decodes
  function holoDraw(g, W, H, col, name, pay, k, flick){
    g.clearRect(0, 0, W, H);
    const cut = 26; g.beginPath(); g.moveTo(0, 0); g.lineTo(W - cut, 0); g.lineTo(W, cut); g.lineTo(W, H); g.lineTo(cut, H); g.lineTo(0, H - cut); g.closePath();
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},.20)`); bg.addColorStop(1, 'rgba(8,6,16,.55)'); g.fillStyle = bg; g.fill();
    g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    if (flick){ const y = Math.random()*H; g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y, W, 6 + Math.random()*10); } g.restore();
    const hex = '#' + col.getHexString(); g.strokeStyle = hex; g.lineWidth = 4; g.shadowColor = hex; g.shadowBlur = 16; g.stroke(); g.shadowBlur = 0;
    g.fillStyle = hex; g.fillRect(0, 0, 10, H - cut);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 22px "JetBrains Mono", monospace'; g.fillStyle = hex; g.fillText('OCCUPANCY 100%', W/2, 40);
    g.font = '700 58px "JetBrains Mono", monospace';
    const off = k < 1 ? 4 + Math.random()*3 : 0; if (off){ g.fillStyle = 'rgba(255,43,214,.85)'; g.fillText(name, W/2 - off, 110); g.fillStyle = 'rgba(43,243,255,.85)'; g.fillText(name, W/2 + off, 110); }
    g.shadowColor = hex; g.shadowBlur = k >= 1 ? 22 : 8; g.fillStyle = '#fff'; g.fillText(name, W/2, 110); g.shadowBlur = 0;
    if (pay !== null){ g.font = '700 40px "JetBrains Mono", monospace'; g.shadowColor = '#ffb347'; g.shadowBlur = 14; g.fillStyle = '#ffb347'; g.fillText(pay, W/2, 182); g.shadowBlur = 0; }
  }
  function jackpot(d){
    const c = d.c, top = (c.sectionTops && c.sectionTops[c.sectionTops.length - 1]) || c.height || CURB + 3, y0 = c.lift ? c.lift.y : CURB, H = Math.max(1, top - y0);
    const zc = new THREE.Color(ZCOL[d.z] || 0x38e8e0), MAG = new THREE.Color(0xff2bd6), CYA = new THREE.Color(0x2bf3ff), w = (typeof SIDE !== 'undefined' ? SIDE : 3) + .2;
    [0, 70, 190, 240, 380, 520].forEach((t, q) => setTimeout(() => pulseLevel(c, Math.max(1, d.floors), d.z, true, q % 2 ? MAG : CYA), t));
    setTimeout(() => pulseLevel(c, Math.max(1, d.floors), d.z, true, zc), 1500);
    const snd = typeof sfx !== 'undefined' && sfx.tone ? sfx.tone : () => {};
    try { for (let q = 0; q < 7; q++) snd(900 + Math.random()*1600, { gain: .03, at: q*.045, dur: .05, glide: .6 + Math.random()*.6 }); } catch (e) {}
    setTimeout(() => { try { snd(110, { gain: .16, dur: .9, glide: .5 }); snd(220, { gain: .1, dur: 1.1, glide: .5 }); [0, 7, 12, 19].forEach((n, q) => snd(659*Math.pow(2, n/12), { gain: .08, at: .05 + q*.06, dur: q === 3 ? 1.3 : .5, glide: .9 })); } catch (e) {} }, 500);
    const m = document.getElementById('ehM'); if (m){ m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
    if (typeof scene === 'undefined') return;
    const g = new THREE.Group(); scene.add(g);
    const add = (o, parent = g) => { o.traverse(q => { q.layers.set(1); q.renderOrder = 998; q.frustumCulled = false; }); parent.add(o); return o; };
    const addMat = (col, op = 1) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // the scan, down the building and back
    const ringG = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, .06, w)), ring = add(new THREE.LineSegments(ringG, new THREE.LineBasicMaterial({ color: CYA, transparent: true, depthTest: false })));
    const sheet = add(new THREE.Mesh(new THREE.PlaneGeometry(w, w), addMat(CYA, .35))); sheet.rotation.x = -Math.PI/2;
    ring.position.set(c.x, top, c.z); sheet.position.set(c.x, top, c.z);
    // the projector on the roof
    const emit = new THREE.Vector3(c.x, top + .15, c.z);
    const lens = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: zc, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }))); lens.position.copy(emit);
    // the hologram: a panel over the roof, turned to face the camera as it is now, then left where it is (turn the view and it stays put)
    const HW = 6.8, HH = HW*256/512, cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const gc = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    const panel = add(new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide })));
    panel.renderOrder = 999; panel.quaternion.copy(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(panel.quaternion), upv = new THREE.Vector3(0, 1, 0).applyQuaternion(panel.quaternion);
    const centre = new THREE.Vector3(c.x, top + 2.4 + HH/2, c.z); panel.position.copy(centre);
    // the projection: four rays from the lens to the panel's corners, and faint sheets between them
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b_]) => centre.clone().addScaledVector(right, a*HW/2).addScaledVector(upv, b_*HH/2));
    const rayPos = []; for (const k_ of corners) rayPos.push(emit.x, emit.y, emit.z, k_.x, k_.y, k_.z);
    const rayG = new THREE.BufferGeometry(); rayG.setAttribute('position', new THREE.Float32BufferAttribute(rayPos, 3));
    const rays = add(new THREE.LineSegments(rayG, new THREE.LineBasicMaterial({ color: zc, transparent: true, opacity: 0, depthTest: false })));
    const conePos = []; for (let q = 0; q < 4; q++){ const a_ = corners[q], b2 = corners[(q + 1) % 4]; conePos.push(emit.x, emit.y, emit.z, a_.x, a_.y, a_.z, b2.x, b2.y, b2.z); }
    const coneG = new THREE.BufferGeometry(); coneG.setAttribute('position', new THREE.Float32BufferAttribute(conePos, 3));
    const cone = add(new THREE.Mesh(coneG, addMat(zc, 0)));
    // data rising off the roof
    const bits = [];
    for (let q = 0; q < 40; q++){ const sp = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex[q % glyphTex.length], color: q % 4 ? zc : (q % 8 ? MAG : 0xffffff), transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })));
      const a = Math.random()*Math.PI*2, r = Math.random()*w*.9; sp.position.set(c.x + Math.cos(a)*r, top + Math.random()*.5, c.z + Math.sin(a)*r); sp.scale.setScalar(.4 + Math.random()*.25);
      bits.push({ sp, v: 2.5 + Math.random()*4, t0: 300 + Math.random()*1200 }); }
    const name = FULLNAME[d.z].toUpperCase(), t0 = performance.now(), LIFE = 4200;
    (function run(){ const el_ = performance.now() - t0;
      const sk = Math.min(1, el_/900), sy = sk < .5 ? top - H*(sk*2) : y0 + H*((sk - .5)*2), so = el_ < 900 ? 1 : Math.max(0, 1 - (el_ - 900)/200);
      ring.position.y = sheet.position.y = sy; ring.material.opacity = so; sheet.material.opacity = .35*so; ring.material.color.copy(Math.floor(el_/60) % 2 ? CYA : MAG);
      // the projector warms up at 350 ms; the panel unfolds from a line, flickering, by 700 ms; it all folds back up in the last 400 ms
      const on = Math.max(0, Math.min(1, (el_ - 350)/350)), off = el_ > LIFE - 400 ? Math.max(0, (LIFE - el_)/400) : 1, live = on*off, fl = Math.random() < .06 ? .45 : 1;
      lens.material.opacity = live; lens.scale.setScalar(1 + .3*Math.sin(el_/40));
      panel.scale.set(1, Math.max(.02, on < 1 ? on*on : off), 1); panel.material.opacity = live*fl;
      rays.material.opacity = .8*live*fl; cone.material.opacity = .07*live;
      if (on > 0){ const k = Math.min(1, Math.max(0, (el_ - 600)/800)), n = Math.floor(k*name.length); let txt = name.slice(0, n); for (let q = n; q < name.length; q++) txt += name[q] === ' ' ? ' ' : NOISE[(Math.random()*NOISE.length) | 0];
        const pk = Math.min(1, Math.max(0, (el_ - 1400)/600)); holoDraw(gc, 512, 256, zc, txt, el_ > 1400 ? '+' + fmt(Math.round(d.pay*pk)) + ' Scrip' : null, k, Math.random() < .08); tex.needsUpdate = true; }
      for (const b_ of bits){ const t = el_ - b_.t0; if (t < 0) continue; b_.sp.position.y += b_.v*.016; b_.sp.material.opacity = Math.max(0, Math.min(1, t/120) - t/1500)*(Math.random() < .12 ? .2 : 1);
        if (Math.random() < .04) b_.sp.material.map = glyphTex[(Math.random()*glyphTex.length) | 0]; }
      if (el_ < LIFE) return requestAnimationFrame(run);
      scene.remove(g); g.traverse(o => { if (o.material){ if (o.material.map && o.material.map === tex) tex.dispose(); o.material.dispose(); } }); for (const gg of [ringG, sheet.geometry, panel.geometry, rayG, coneG]) gg.dispose(); })();
  }

  /* ---------- reach: while placing a megastructure with a reach, the area it covers and what it would touch; once placed, the boost runs out to each one ---------- */
  const REACH_FX = { radio: ['Psycho-Acoustic Grid', b => true, '+15% Scrip'], police: ['Police station', b => true, '+15 Grade'], square: ['Town square', b => b.z === 'R' || b.z === 'L', '+15% spending'],
    bathhouse: ['Bath House', b => b.z === 'R', 'homes work better'], lidar: ['LIDAR', b => b.z === 'R' || b.z === 'L', '+2% tax'] };
  const reachFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: .05, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  const reachEdge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => new THREE.Vector3(x, y, 0))), new THREE.LineBasicMaterial({ transparent: true, opacity: .95, depthTest: false }));
  // a beam of light over each building it would touch, a tile on each plot it covers, and a low wall of light round the edge
  const tagMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .75, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const tags = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tagMat, 160); tags.count = 0; tags.frustumCulled = false;
  const tileMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .22, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tileMat, 900); tiles.count = 0; tiles.frustumCulled = false;
  const wallMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .32, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const wall = new THREE.Group(); for (let q = 0; q < 4; q++) wall.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat));
  for (const o of [reachFill, reachEdge, tags, tiles, wall]){ if (o === reachFill || o === reachEdge) o.rotation.x = -Math.PI/2; o.traverse(q => { q.layers.set(1); q.renderOrder = 996; q.frustumCulled = false; }); o.visible = false; if (typeof scene !== 'undefined') scene.add(o); }
  const reachLbl = el('div', 'econ-reach'); reachLbl.hidden = true; document.body.appendChild(reachLbl);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), _qi = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function reachOf(kind){ const d = MEGA[kind]; return d ? (d.reach || 0) + (d.upReach ? d.upReach*(st.ups[kind] || 0) : 0) : 0; }
  function touched(kind, blk){ const fx = REACH_FX[kind], r = reachOf(kind), out = []; for (const b of B.values()) if (!b.isolated && fx[1](b) && megaD(b.c.i, b.c.j, blk) <= r) out.push(b); return out; }
  function reachShow(kind, g){
    const fx = REACH_FX[kind];
    if (!fx || !g){ reachFill.visible = reachEdge.visible = tags.visible = tiles.visible = wall.visible = false; reachLbl.hidden = true; return; }
    const r = reachOf(kind), col = new THREE.Color(MEGA_TYPES[kind].colour || '#5ae8ff');
    const x = (g.i + (g.w - 1)/2)*LOT, z = (g.j + (g.h - 1)/2)*LOT, sx = (g.w + 2*r)*LOT, sz = (g.h + 2*r)*LOT;
    reachFill.material.color.copy(col); reachEdge.material.color.copy(col); tagMat.color.copy(col); tileMat.color.copy(col); wallMat.color.copy(col);
    const WH = 1.1; [[0, -sz/2, sx, 0], [0, sz/2, sx, 0], [-sx/2, 0, sz, Math.PI/2], [sx/2, 0, sz, Math.PI/2]].forEach(([ox, oz, len, ry], q) => { const w_ = wall.children[q]; w_.position.set(x + ox, CURB + WH/2, z + oz); w_.rotation.y = ry; w_.scale.set(len, WH, 1); });
    let nt = 0; for (let a = g.i - r; a <= g.i + g.w - 1 + r && nt < 900; a++) for (let q = g.j - r; q <= g.j + g.h - 1 + r && nt < 900; q++){ const cc = cells.get(a + ',' + q); if (!cc || (a >= g.i && a < g.i + g.w && q >= g.j && q < g.j + g.h)) continue;
      _p.set(a*LOT, CURB + .07, q*LOT); _s.set(LOT*.86, LOT*.86, 1); _m4.compose(_p, _q, _s); tiles.setMatrixAt(nt++, _m4); }
    tiles.count = nt; tiles.instanceMatrix.needsUpdate = true;
    reachFill.position.set(x, CURB + .06, z); reachFill.scale.set(sx, sz, 1); reachEdge.position.set(x, CURB + .1, z); reachEdge.scale.set(sx, sz, 1);
    const hit = touched(kind, g); tags.count = Math.min(160, hit.length);
    for (let q = 0; q < tags.count; q++){ const c = hit[q].c, top = (c.sectionTops && c.sectionTops[c.sectionTops.length - 1]) || c.height || CURB + 3; _p.set(c.x, top + 2, c.z); _s.set(.32, 4, .32); _m4.compose(_p, _qi, _s); tags.setMatrixAt(q, _m4); }
    tags.instanceMatrix.needsUpdate = true;
    reachFill.visible = reachEdge.visible = tags.visible = tiles.visible = wall.visible = true;
    const sp = screenOf(x, CURB + 3, z);
    if (sp){ reachLbl.style.color = MEGA_TYPES[kind].colour; reachLbl.innerHTML = `<b>${hit.length} building${hit.length === 1 ? '' : 's'} · ${fx[2]}</b>reach ${r} plots · ${nt} plots covered`; reachLbl.style.left = sp[0] + 'px'; reachLbl.style.top = (sp[1] - 20) + 'px'; reachLbl.hidden = false; } else reachLbl.hidden = true;
  }
  wrap('showMegaGhost', function (orig, kind, cell, turned){ const r = orig(kind, cell, turned); try { reachShow(kind && cell ? kind : null, typeof megaGhost !== 'undefined' ? megaGhost : null); } catch (e) {} return r; });
  setInterval(() => { if (reachEdge.visible && (typeof megaPick === 'undefined' || !megaPick)) reachShow(null); }, 300);
  // placed: a signal arcs from the megastructure to each building in reach, nearest first, and each one flashes and shows the boost
  E.onEv('mega', d => { const fx = REACH_FX[d.kind]; if (!fx || !d.m) return; setTimeout(() => boostWave(d.m, d.kind), 400); });
  function boostWave(m, kind){
    if (typeof scene === 'undefined') return;
    const fx = REACH_FX[kind], col = new THREE.Color(MEGA_TYPES[kind].colour || '#5ae8ff'), hit = touched(kind, m).sort((a, b) => megaD(a.c.i, a.c.j, m) - megaD(b.c.i, b.c.j, m)).slice(0, 40);
    const top = new THREE.Vector3(m.x, (m.roofH || CURB + 4) + 1, m.z), r = reachOf(kind);
    // the area, drawn once and swept outward
    const ring = reachEdge.clone(); ring.material = reachEdge.material.clone(); ring.material.color.copy(col); ring.visible = true; ring.position.set(m.x, CURB + .12, m.z); scene.add(ring);
    const t0 = performance.now();
    (function grow(){ const k = Math.min(1, (performance.now() - t0)/1400), e = 1 - Math.pow(1 - k, 2); ring.scale.set((m.w + 2*r*e)*LOT, (m.h + 2*r*e)*LOT, 1); ring.material.opacity = k < .8 ? 1 : (1 - k)*5; if (k < 1) requestAnimationFrame(grow); else { scene.remove(ring); ring.material.dispose(); } })();
    hit.forEach((b, q) => {
      const dd = megaD(b.c.i, b.c.j, m), delay = 1400*Math.sqrt(dd/Math.max(1, r));
      setTimeout(() => {
        const end = new THREE.Vector3(b.c.x, (b.c.height || CURB + 2) + .3, b.c.z), mid = top.clone().lerp(end, .5); mid.y = Math.max(top.y, end.y) + 2 + dd*.4;
        const pts = new THREE.QuadraticBezierCurve3(top, mid, end).getPoints(40), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, depthTest: false }));
        line.layers.set(1); line.renderOrder = 998; line.frustumCulled = false; scene.add(line);
        const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); spark.scale.setScalar(1.2); spark.layers.set(1); spark.renderOrder = 999; scene.add(spark);
        const a0 = performance.now();
        (function fly(){ const k = Math.min(1, (performance.now() - a0)/450), n = Math.max(2, Math.round(k*40));
          line.geometry.setDrawRange(Math.max(0, n - 14), Math.min(14, n)); spark.position.copy(pts[Math.min(40, n)]);
          if (k < 1) return requestAnimationFrame(fly);
          scene.remove(line); line.geometry.dispose(); line.material.dispose(); scene.remove(spark); spark.material.dispose();
          pulseLevel(b.c, Math.max(1, b.lit || b.floors), b.z, true, col);
          if (q < 24) floatText(b.c.x, (b.c.height || CURB + 2) + .4, b.c.z, fx[2], 'boost'); })();
      }, delay + q*25);
    });
    if (hit.length) setTimeout(() => say(`${fx[0]} · ${hit.length} building${hit.length === 1 ? '' : 's'} in reach · ${fx[2]}`), 300);
  }

  let hudQ = false; const hudSoon = () => { if (hudQ) return; hudQ = true; requestAnimationFrame(() => { hudQ = false; hud(); }); };
  const perMin = v => fmt(v) + '/min';
  function hud(){
    const $ = id => document.getElementById(id);
    $('ehM').textContent = fmt(st.money); const r = $('ehR'); r.textContent = (R.rev >= 0 ? '+' : '') + perMin(R.rev); r.classList.toggle('neg', R.rev < 0);
    $('ehP').textContent = fmt(R.pop);
    const over = R.demandAll > R.supply; $('ehPw').classList.toggle('over', over); $('ehPwV').textContent = fmt(Math.min(R.used, R.supply)) + '/' + fmt(R.supply) + (R.constructing && R.constructing.length ? ' +' : '');
    $('ehPwB').style.width = (R.supply ? Math.min(100, 100*R.demandAll/R.supply) : 100) + '%';
    const nt = TIERS[Math.min(st.tier + 1, TIERS.length - 1)], doneAll = st.tier >= TIERS.length - 1;
    // two gates (residents and Scrip/min): the bar follows the one further behind, and that's the one the text names
    const kp = Math.min(1, R.pop/nt.pop), ki = nt.inc ? Math.min(1, Math.max(0, R.rev)/nt.inc) : 1, byInc = !doneAll && ki < kp;
    $('ehTv').textContent = doneAll ? 'complete' : byInc ? fmt(Math.max(0, R.rev)) + '/' + fmt(nt.inc) + ' Scrip/min' : fmt(R.pop) + '/' + fmt(nt.pop) + ' residents';
    $('ehTv').parentNode.title = doneAll ? '' : `${nt.name} needs ${fmt(nt.pop)} residents (${fmt(R.pop)} now)` + (nt.inc ? ` and ${fmt(nt.inc)} Scrip/min (${fmt(Math.max(0, R.rev))} now)` : '');
    const k = doneAll ? 1 : Math.min(kp, ki); $('ehTb').style.width = (k*100) + '%'; $('ehTb').style.background = byInc ? '#5affa8' : '';
    $('ehTn').textContent = doneAll ? TIERS[st.tier].name : 'Next · ' + nt.name + (nt.inc && !byInc && kp >= 1 ? '' : nt.inc && byInc ? ' · income' : '');
    for (const zb of document.querySelectorAll('.zone[data-zone]')){ const z = zoneNow(zb.dataset.zone); if (!z || !P.Z[z]) continue;
      const locked = (z === 'L' || z === 'K') && st.tier < 3, cost = placeCost(z), can = !locked && st.money >= cost;
      zb.classList.toggle('econ-cant', !locked && !can); zb.dataset.econCost = locked ? 'Chartered' : fmt(cost); }
    objectives();
    { const can = ['R', 'C', 'I', 'L', 'K'].some(z => { const u = upNext(z); return u && u.open && st.money >= u.cost && !((z === 'L' || z === 'K') && st.tier < 3); }); const ob = $('ehO'); if (ob.classList.contains('ready') !== can){ ob.classList.toggle('ready', can); ob.textContent = can ? 'Office ●' : 'Office'; ob.title = can ? 'An upgrade is ready to buy' : ''; } }
    { const nl = st.tier < 3, de = document.documentElement; if (de.classList.contains('econ-nolux') !== nl){ de.classList.toggle('econ-nolux', nl); if (!nl){ const zb = document.querySelector('.zone[data-zone="high"]'); if (zb){ zb.classList.add('econ-new'); setTimeout(() => zb.classList.remove('econ-new'), 7000); } } } }
    const dm = $('ehDm'); dm.hidden = !built('wirenest');
    if (!dm.hidden){ const d = R.demandZ; $('ehDmV').innerHTML = ['R', 'C', 'I', 'L'].filter(z => z !== 'L' || st.tier >= 3).map(z => `<span class="${d[z] > 0 ? 'up' : d[z] < 0 ? 'dn' : ''}" title="${ZNAME[z]} demand">${z}${d[z] > 0 ? '▲' : d[z] < 0 ? '▼' : '·'}</span>`).join(''); }
    corpSync();
    if (!officeEl.hidden && (offT = (offT + 1) % 2) === 0) renderOffice();
  }
  let offT = 0;
  document.getElementById('ehO').addEventListener('click', () => toggleOffice());
  for (const k of ['power', 'air', 'noise']) document.getElementById('ehV_' + k).addEventListener('click', () => VIEW.toggle(k));

  /* ---------- the City office: the next goal first, the rest folded away ---------- */
  const officeEl = el('aside', 'econ-office'); officeEl.hidden = true; officeEl.setAttribute('role', 'dialog'); officeEl.setAttribute('aria-label', 'City office'); document.body.appendChild(officeEl);
  function toggleOffice(open = officeEl.hidden){ officeEl.hidden = !open; if (open){ renderOffice(); E.emit('office'); const x = officeEl.querySelector('.x'); if (x) x.focus({ preventScroll: true }); } }
  E.office = toggleOffice;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !officeEl.hidden){ toggleOffice(false); e.stopPropagation(); } }, true);
  const openSec = { power: true };
  officeEl.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.sec) openSec[d.dataset.sec] = d.open; }, true);
  const sec = (key, title, body, def) => `<details data-sec="${key}" ${(openSec[key] ?? def) ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  function renderOffice(){
    const keepScroll = officeEl.scrollTop, out = [];
    out.push(`<header><h2>City office</h2><button class="x" type="button" aria-label="Close the City office">✕</button></header>`);
    out.push(`<div class="stats"><div><small>Scrip</small><b>${fmt(st.money)}</b></div><div><small>Per min</small><b>${fmt(R.rev)}</b></div><div><small>Residents</small><b>${fmt(R.pop)}</b></div></div>`);
    if (st.tier < TIERS.length - 1){ const t = TIERS[st.tier + 1];
      const m = (lab, a, b) => `<div class="meter"><div><span>${lab}</span><span>${fmt(Math.min(a, b))} / ${fmt(b)}</span></div><div class="bar"><i style="width:${Math.min(100, 100*a/b)}%"></i></div></div>`;
      out.push(`<div class="next"><small style="color:#9a92aa;letter-spacing:.14em;text-transform:uppercase;font-size:10px">Next classification</small><div class="nm">${t.name}</div><p>Unlocks ${t.opens}</p>${REQS.filter(([k]) => t[k]).map(([k, lab]) => m(lab, reqVal(k), t[k])).join('')}</div>`);
    } else out.push(`<div class="next"><div class="nm">Every classification reached</div><p>The coast is open through the Data Spire.</p></div>`);
    // the x2 upgrades: one per zone at a time, open once you've built enough of that zone
    { let ups = '';
      for (const z of ['R', 'C', 'I', 'L', 'K']){ if ((z === 'L' || z === 'K') && st.tier < 3) continue; const u = upNext(z); if (!u) continue;
        ups += `<div class="row"><div>${UPNAME[z][u.k] || ZNAME[z] + ' ' + (u.k + 1)}<small>${ZNAME[z]} output x2${u.open ? '' : ' · opens at ' + u.at + ' ' + ZNAME[z].toLowerCase() + ' levels (' + levelsOf(z) + ')'}</small></div>` +
          `<button class="btn" data-upz="${z}" ${u.open && st.money >= u.cost ? '' : 'disabled'}>${fmt(u.cost)}</button></div>`; }
      out.push(sec('ups', 'Upgrades', ups || '<p>All bought.</p>', true)); }
    // power
    const cores = megaList('emitter');
    let pw = `<p>${fmt(R.used)} of ${fmt(R.supply)} in use${R.demandAll > R.supply ? ' · <span style="color:#ff8a98">' + fmt(R.demandAll - R.supply) + ' short</span>' : ''}. Closest buildings get power first; nothing past ${P.coreReach} plots.</p>`;
    cores.forEach((m, q) => { const s = coreState(m), ready = s.readyAt <= now();
      const stat = !ready ? 'Charging · ' + fmtDur(s.readyAt - now()) : s.off ? '<span style="color:#ff8a98">Offline</span>' : s.surge ? '<span style="color:#ffb347">Power surge</span>' : fmt(coreCapOf(m)) + ' power' + (s.lowUntil > now() ? ' · reach ' + P.coreReachLow + ' for ' + fmtDur(s.lowUntil - now()) : '');
      pw += `<div class="row"><div>Emitter Core ${q + 1}<small>${stat}</small></div>` +
        (s.off ? `<button class="btn" data-restart="${m.id}">Restart</button>` : s.surge ? `<button class="btn" data-mini="${m.id}">Stabilize</button>` : ready ? `<button class="btn" data-up="${m.id}" ${st.tier < 1 ? 'disabled title="Opens at Registered"' : ''}>Upgrade · ${fmt(coreUpCost(m))}</button>` : '') + `</div>`; });
    pw += `<p>Another core: ${fmt(nextCoreCost())} Scrip from Buildings.</p>`;
    out.push(sec('power', 'Power', pw));
    // megastructures
    let mg = '';
    for (const kind of Object.keys(MEGA)){ if (kind === 'emitter' || !MEGA_TYPES[kind]) continue; const d = MEGA[kind], has = built(kind), open = d.tier <= st.tier;
      if (!open && !has) continue;
      let act = '';
      if (has && d.upCost) act = `<button class="btn" data-upm="${kind}" ${kind === 'radio' && st.tier < 1 ? 'disabled' : ''}>Reach +${d.upReach} · ${fmt(megaUpCost(kind))}</button>`;
      else if (has && kind === 'mall'){ const m = megaList('mall')[0]; act = m && m.levels < 3 ? `<span>Level ${m.levels}</span>` : '<span>Level 3</span>'; }
      else if (has) act = '<span style="color:#5affa8">Built</span>';
      else act = `<span>${fmt(d.cost)}</span>`;
      mg += `<div class="row"><div>${MEGA_TYPES[kind].name}<small>${d.what}</small></div>${act}</div>`; }
    if (built('spire')) mg += `<div class="row"><div>Overseer auto-upgrades<small>Grows your fullest buildings for you</small></div><button class="btn" data-auto="1" aria-pressed="${!!st.auto}">${st.auto ? 'On' : 'Off'}</button></div>`;
    const locked = Object.keys(MEGA).filter(k => k !== 'emitter' && MEGA[k].tier > st.tier).length;
    if (locked) mg += `<p>${locked} more unlock as the city is classified.</p>`;
    out.push(sec('megas', 'Megastructures', mg));
    out.push(sec('income', 'Income per min', `<table>` + Object.entries(R.breakdown || {}).filter(([, v]) => Math.abs(v) >= .5).map(([k, v]) => `<tr><td>${k}</td><td>${v < 0 ? '−' : ''}${fmt(Math.abs(v))}</td></tr>`).join('') + `</table>`));
    out.push(sec('ladder', 'All classifications', `<table>` + TIERS.slice(1).map((t, q) => { const n = q + 1, cls = n <= st.tier ? 'done' : n === st.tier + 1 ? 'cur' : '';
      return `<tr class="${cls}"><td>${n <= st.tier ? '✓ ' : ''}${t.name}</td><td>${fmt(t.pop)} residents</td></tr>`; }).join('') + `</table>`));
    out.push(sec('help', 'How it works', `<p><b>Goal:</b> grow the sector through six classifications to The coast. <b>Emitter Core:</b> powers every building within 9 plots; build more cores to grow outward. <b>Megastructures</b> are optional boosts, one of each, each helping what's in its reach.</p><p>Build, and each level pays Scrip the moment people move in and light it. Click a lit roof to stack a level. Sector Grade (E to A) caps the levels: cores and factories lower it, shops, stations and police raise it. Buildings must connect to the city by ground (or sit within two plots of another building).</p><div class="row"><div>Tutorial</div><button class="btn" data-tut="1">Replay</button></div>`));
    officeEl.innerHTML = out.join('');
    officeEl.scrollTop = keepScroll;
  }
  officeEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.classList.contains('x')) return toggleOffice(false);
    if (b.dataset.up) return E.upCore(b.dataset.up);
    if (b.dataset.upz) return E.upZone(b.dataset.upz);
    if (b.dataset.upm) return E.upMega(b.dataset.upm);
    if (b.dataset.mini){ toggleOffice(false); return MINI.open(b.dataset.mini); }
    if (b.dataset.restart){ toggleOffice(false); return RESTART.open(b.dataset.restart); }
    if (b.dataset.auto){ st.auto = !st.auto; save(); return renderOffice(); }
    if (b.dataset.tut){ toggleOffice(false); return TUTE.replay(); }
  });

  /* ---------- what a building is doing: hover (mouse) or tap with no zone picked (touch) ---------- */
  function whyOf(b){
    if (b.isolated) return 'Isolated · nobody can reach it';
    if (!b.inRange) return megaList('emitter').some(m => coreState(m).off) ? 'Core offline or out of reach' : 'No Emitter Core in reach';
    if (!b.powered) return 'Out of power · upgrade or add a core';
    if (b.floors > b.cap) return 'Over its Grade · top levels stay dark';
    if (b.z === 'R' && b.jobBand === 'far' && !b.station) return 'Too far from work';
    if ((b.z === 'R' || b.z === 'L') && b.ef < .5) return 'Few jobs nearby';
    if (b.z === 'L' && b.occ < .5 && b.lv < P.lvLuxMin + 10) return 'Grade too low for luxury';
    if (b.z === 'R' && b.corpNear && b.lv > P.lvPricey) return 'Priced out by corps';
    if (b.z === 'C' && b.occ < b.eff*.5) return 'Not enough shoppers nearby';
    if ((b.z === 'I' || b.z === 'K') && b.occ < b.eff*.6) return 'Short of workers';
    if (b.noise >= 2.5 && (b.z === 'R' || b.z === 'L')) return 'Noisy here · factories, shops or the Grid nearby';
    if (b.band === 'near') return 'Beside a core · poor air';
    return null;
  }
  function infoOf(c){
    const b = B.get(keyOf(c)); if (!b) return null;
    const why = whyOf(b);
    return { head: `${ZNAME[b.z]} · Grade ${gradeOf(b.lv)}`, lines: [`${b.lit} of ${b.floors} level${b.floors > 1 ? 's' : ''} lit · max ${b.cap}` + (b.earn ? ' · ' + fmt(b.earn) + '/min' : ''), ...(b.sat != null ? [(() => { const neg = (b.satParts || []).filter(p_ => p_[0] < 0).sort((a_, c_) => a_[0] - c_[0])[0]; return 'Satisfaction ' + Math.round(b.sat) + '%' + (neg ? ' · ' + neg[1] + ' ' + neg[0] : ''); })()] : []), why ? '! ' + why : '✓ Doing well', b.floors < b.cap && b.powered && !b.isolated ? (() => { const cst = upgradeCost(b.z, b.floors), w = etaTxt(cst); return 'Next level · ' + fmt(cst) + ' Scrip' + (st.money >= cst ? ' · ready now' : w ? ' · ready in ' + w : ''); })() : null].filter(Boolean), bad: !!why };
  }
  const infoText = i => [i.head, ...i.lines].join('\n');
  const tipEl = el('div', 'econ-tip'); document.body.appendChild(tipEl);
  let tipAt = 0;
  if (!TOUCHY) addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const t = performance.now(); if (t - tipAt < 100) return; tipAt = t;
    const cv = document.getElementById('view') || (typeof canvas !== 'undefined' ? canvas : null);
    if (!cv || e.target !== cv || (typeof S !== 'undefined' && S.zone) || (typeof megaPick !== 'undefined' && megaPick) || (typeof hwMode !== 'undefined' && (hwMode || mtMode))){ tipEl.style.display = 'none'; return; }
    let pk = null; try { pk = pickAt(e.clientX, e.clientY); } catch (er) {}
    const c = pk && pk.c && !pk.c.mega ? pk.c : null, info = c ? infoOf(c) : null;
    if (!info){ tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = ''; const h = el('span', 'h'); h.textContent = info.head; tipEl.append(h);
    for (const l of info.lines){ const s_ = el('span', l.startsWith('!') ? 'bad' : l.startsWith('✓') ? 'ok' : ''); s_.textContent = '\n' + l; tipEl.append(s_); }
    tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px'; tipEl.style.display = 'block';
  }, { passive: true });
  E.tapInfo = pk => { const c = pk && pk.c && !pk.c.mega ? pk.c : null; const i = c ? infoOf(c) : null; if (!i) return false; note(infoText(i), 4500); return true; };
  E.menuText = kind => { const d = MEGA[kind]; if (!d) return null; if (kind === 'emitter') return fmt(nextCoreCost()) + ' Scrip · powers 9 plots around it · charges in ' + fmtDur(nextCoreBuildMs()); if (built(kind)) return kind === 'mall' ? 'Built · stack from its roof' : 'Built'; return fmt(d.cost) + ' Scrip · ' + d.what; };

  /* ---------- the stabilizer: an optional mini game that shortens a core's charge ---------- */
  // Keep the grid frequency in the safe band: the trace sinks, a tap or Space lifts it. Every second inside the band takes two seconds off the
  // charge; the band narrows and the pull grows the longer it runs. A core's charge can be cut by half at most this way.
  /* ---------- the power view: click a core (or Power in the top bar, or V) to see how far it reaches and its bands, color-coded on the ground:
     poor air close in, 95% output in the middle, 80% out to the edge of its reach ---------- */
  const VIEWS = {
    power: { name: 'Power', keys: [['#8fc4ff', 'Full'], ['#4f86d9', '95%'], ['#2c4f8f', '80%'], ['#3a3446', 'None']] },
    air:   { name: 'Air', keys: [['#c4553a', 'Poor'], ['#c9a03a', 'Fair'], ['#5fbf5a', 'Clean']] },
    noise: { name: 'Noise', keys: [['#e8d36a', 'Low'], ['#ff9a3a', 'Moderate'], ['#ff4a4a', 'High']] },
  };
  const VIEW = (() => {
    const tileMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: .38, depthTest: false, depthWrite: false });
    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tileMat, 2000); tiles.count = 0; tiles.frustumCulled = false; tiles.layers.set(1); tiles.renderOrder = 995;
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2000*3), 3);
    const lines = new THREE.Group();
    if (typeof scene !== 'undefined'){ scene.add(tiles); scene.add(lines); }
    const leg = el('div', 'econ-legend'); leg.hidden = true; document.body.appendChild(leg);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
    let mode = null, until = 0, single = null;
    function square(m, r, col){ const x0 = (m.i - r - .5)*LOT, x1 = (m.i + m.w - 1 + r + .5)*LOT, z0 = (m.j - r - .5)*LOT, z1 = (m.j + m.h - 1 + r + .5)*LOT, y = CURB + .14;
      const g = new THREE.BufferGeometry().setFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, y, z)));
      const ln = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .95, depthTest: false })); ln.layers.set(1); ln.renderOrder = 996; ln.frustumCulled = false; lines.add(ln); }
    function colorAt(c, cores){
      let best = Infinity, bm = null; for (const m of cores){ const d = megaD(c.i, c.j, m); if (d < best){ best = d; bm = m; } }
      const K_ = VIEWS[mode].keys;
      if (mode === 'power'){ if (!bm) return K_[3][0]; if (!coreOnline(bm) || best > coreRch(bm)) return best > coreRch(bm) + 3 ? null : K_[3][0]; return best <= P.coreNear ? K_[0][0] : best <= P.coreMid ? K_[1][0] : K_[2][0]; }
      if (mode === 'air') return best <= P.coreNear ? K_[0][0] : best <= P.coreMid ? K_[1][0] : K_[2][0];
      const n = noiseAt(c.i, c.j); return n < 1 ? null : n < 2.5 ? K_[0][0] : n < 5 ? K_[1][0] : K_[2][0];
    }
    function draw(){
      for (const o of [...lines.children]){ lines.remove(o); o.geometry.dispose(); o.material.dispose(); }
      const all = megaList('emitter'), cores = single && megas.has(single.id) ? [single] : all;
      if (!mode){ tiles.visible = false; leg.hidden = true; sync(); return; }
      let n = 0;
      for (const c of cells.values()){ if (n >= 2000) break; if (c.mega) continue; const col = colorAt(c, mode === 'noise' ? all : cores); if (!col) continue;
        cc.set(col); pp.set(c.i*LOT, CURB + .08, c.j*LOT); ss.set(LOT*.94, LOT*.94, 1); m4.compose(pp, q, ss); tiles.setMatrixAt(n, m4); tiles.setColorAt(n, cc); n++; }
      tiles.count = n; tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true; tiles.visible = n > 0;
      if (mode === 'power') for (const m of cores){ square(m, coreRch(m), '#8fc4ff'); }
      if (mode === 'air') for (const m of cores){ square(m, P.coreNear, VIEWS.air.keys[0][0]); square(m, P.coreMid, VIEWS.air.keys[1][0]); }
      const v = VIEWS[mode], one = single && megas.has(single.id) ? single : null, so = one ? coreState(one) : null;
      let note_ = mode === 'power' ? `Reach ${one ? coreRch(one) : P.coreReach} plots` : mode === 'air' ? 'Poor air: lower Grade, unhappy homes' : 'From factories, shops, the Grid';
      if (so && so.lowUntil > now()) note_ = `Reach ${P.coreReachLow} for ${fmtDur(so.lowUntil - now())}`;
      if (so && so.off) note_ = 'Offline: click it to restart';
      leg.innerHTML = `<b>${v.name}</b>` + v.keys.map(([c_, t]) => `<span><i style="background:${c_}"></i>${t}</span>`).join('') + `<em>${note_}</em><button type="button" aria-label="Close the map">✕</button>`;
      leg.hidden = false; sync();
    }
    leg.addEventListener('click', e => { if (e.target.closest('button')) hide(); });
    function set(m_){ mode = m_; single = null; until = 0; draw(); }
    function show(m){ mode = 'power'; single = m; until = Date.now() + 9000; draw(); E.emit('coreview'); }
    function toggle(m_){ if (mode === m_ && !single) hide(); else set(m_); }
    function hide(){ mode = null; single = null; draw(); }
    const sync = () => { for (const k in VIEWS){ const b = document.getElementById('ehV_' + k); if (b) b.setAttribute('aria-pressed', String(mode === k && !single)); } };
    setInterval(() => { if (!mode) return; if (single && Date.now() > until) return hide(); draw(); }, 1000);
    addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey && !e.altKey){ const order = [null, 'power', 'air', 'noise']; set(order[(order.indexOf(mode) + 1) % order.length]); } if (e.key === 'Escape' && mode) hide(); });
    return { show, toggle, hide, get on(){ return mode; } };
  })();

  /* ---------- noise over homes: faint rings of sound hang over the homes that hear it, more and redder the louder it is ---------- */
  const NOISEFX = (() => {
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = '#fff'; g.lineCap = 'round';
      for (let k = 0; k < 3; k++){ g.globalAlpha = 1 - k*.28; g.lineWidth = 5 - k; const r = 14 + k*12; g.beginPath(); g.arc(64, 54, r, Math.PI*1.18, Math.PI*1.82); g.stroke(); } return new THREE.CanvasTexture(cv); })();
    const live = new Map();
    function sync(){
      const want = new Set();
      for (const b of B.values()){ if ((b.z !== 'R' && b.z !== 'L') || !b.lit || b.noise < 1) continue; want.add(b.k);
        let o = live.get(b.k); if (!o){ if (live.size > 140) continue; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.layers.set(1); sp.renderOrder = 6; if (typeof scene !== 'undefined') scene.add(sp); o = { sp, ph: Math.random()*6 }; live.set(b.k, o); }
        const top = (b.c.sectionTops && b.c.sectionTops[b.c.sectionTops.length - 1]) || b.c.height || CURB + 3;
        o.lvl = b.noise < 2.5 ? 0 : b.noise < 5 ? 1 : 2; o.sp.material.color.set(VIEWS.noise.keys[o.lvl][0]); o.sp.position.set(b.c.x, top + .9, b.c.z); }
      for (const [k, o] of live) if (!want.has(k)){ scene.remove(o.sp); o.sp.material.dispose(); live.delete(k); }
    }
    setInterval(() => { try { sync(); } catch (e) {} }, 1000);
    (function run(){ requestAnimationFrame(run); if (!live.size) return; const t = performance.now()/1000;
      for (const o of live.values()){ const k = (t*(.6 + o.lvl*.35) + o.ph) % 1; o.sp.scale.set(1.3 + k*.9 + o.lvl*.3, (1.3 + k*.9 + o.lvl*.3)*.5, 1); o.sp.material.opacity = (.25 + o.lvl*.2)*(1 - k); } })();
    return {};
  })();

  /* ---------- smoke: each working core breathes out smog that hangs thick close in and thins out band by band to the edge of its reach ---------- */
  const SMOKE = (() => {
    const tex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
      for (let k = 0; k < 9; k++){ const x = 18 + Math.random()*28, y = 18 + Math.random()*28, r = 10 + Math.random()*16, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
      return new THREE.CanvasTexture(cv); })();
    const pool = [], live = [], MAX = 180;
    for (let k = 0; k < MAX; k++){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4c4656, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false })); sp.visible = false; sp.renderOrder = 5; if (typeof scene !== 'undefined') scene.add(sp); pool.push(sp); }
    let last = performance.now(), acc = 0;
    (function run(){ requestAnimationFrame(run); const t = performance.now(), dt = Math.min(.1, (t - last)/1000); last = t; if (document.hidden) return;
      const cores = typeof megas !== 'undefined' ? megaList('emitter').filter(coreOnline) : [];
      acc += dt*3.5*cores.length;
      while (acc >= 1 && pool.length){ acc -= 1; const m = cores[(Math.random()*cores.length) | 0], sp = pool.pop(), a = Math.random()*Math.PI*2, r0 = (m.w/2)*LOT*.6;
        sp.position.set(m.x + Math.cos(a)*r0, CURB + .6 + Math.random()*1.2, m.z + Math.sin(a)*r0); sp.visible = true;
        live.push({ sp, m, vx: Math.cos(a), vz: Math.sin(a), sp0: (coreRch(m) + 1)*LOT/(11 + Math.random()*6), t0: t, rise: .05 + Math.random()*.12, s0: 2.2 + Math.random()*1.6 }); }
      if (acc > 3) acc = 3;
      for (let i = live.length - 1; i >= 0; i--){ const p = live[i], sp = p.sp, age = (t - p.t0)/1000;
        sp.position.x += p.vx*p.sp0*dt; sp.position.z += p.vz*p.sp0*dt; sp.position.y += p.rise*dt;
        const dPl = Math.max(0, Math.max(Math.abs(sp.position.x - p.m.x), Math.abs(sp.position.z - p.m.z))/LOT - p.m.w/2 + .5), rch = coreRch(p.m);
        const dens = dPl <= P.coreNear ? .2 : dPl <= P.coreMid ? .2 - .12*(dPl - P.coreNear)/(P.coreMid - P.coreNear) : dPl <= rch ? .08 - .065*(dPl - P.coreMid)/(rch - P.coreMid) : .015 - (dPl - rch)*.015;
        sp.material.opacity = Math.max(0, Math.min(1, age/.8)*dens); sp.scale.setScalar(p.s0*(1 + age*.35));
        if (dens <= 0 || !coreOnline(p.m)){ sp.visible = false; sp.material.opacity = 0; pool.push(sp); live.splice(i, 1); } } })();
    return {};
  })();

  /* ---------- the core's pulse: every few seconds a grid of light runs out over the ground from each working core, flowing round the
     buildings (a ring round each one as it passes) instead of through them, as far as the core reaches ---------- */
  const PULSE = (() => {
    const mk = ring => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = '#fff';
      if (ring){ g.lineWidth = 5; g.strokeRect(4, 4, 56, 56); g.lineWidth = 1; g.globalAlpha = .6; g.strokeRect(10, 10, 44, 44); }
      else { g.lineWidth = 2; g.strokeRect(1, 1, 62, 62); g.globalAlpha = .45; g.lineWidth = 1; for (const k of [16, 32, 48]){ g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.moveTo(0, k); g.lineTo(64, k); g.stroke(); } }
      const t = new THREE.CanvasTexture(cv); return t; };
    const mat = tex => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const N = 1400, mkMesh = tex => { const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat(tex), N); im.count = 0; im.frustumCulled = false; im.layers.set(1); im.renderOrder = 994;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3); if (typeof scene !== 'undefined') scene.add(im); return im; };
    const grid = mkMesh(mk(false)), rings = mkMesh(mk(true));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color(), base = new THREE.Color(0x7ab8ff);
    let G = [], Rg = [], t0 = 0, maxD = 0, running = false;
    // a walk over the ground from every working core: open ground carries the pulse on, a building takes it (a ring round its foot) and stops it, so it flows round
    function plan(){
      const cores = megaList('emitter').filter(coreOnline); G = []; Rg = []; maxD = 0; if (!cores.length) return false;
      const dist = new Map(), Q = [], occ = c => isBld(c) || !!c.wall;
      for (const m of cores) for (const b0 of m.cells || []) if (b0){ const k = b0.i + ',' + b0.j; dist.set(k, 0); Q.push([b0.i, b0.j, m]); }
      for (let h = 0; h < Q.length; h++){ const [i, j, m] = Q[h], d0 = dist.get(i + ',' + j);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const ni = i + a, nj = j + b, k = ni + ',' + nj; if (dist.has(k)) continue; const c = cells.get(k); if (!c || c.mega) continue;
          if (megaD(ni, nj, m) > coreRch(m)) continue; dist.set(k, d0 + 1); maxD = Math.max(maxD, d0 + 1);
          if (occ(c)) Rg.push({ c, d: d0 + 1 }); else { G.push({ c, d: d0 + 1 }); Q.push([ni, nj, m]); } } }
      const place = (im, arr, sz) => { arr.length = Math.min(arr.length, N); arr.forEach((o, k) => { pp.set(o.c.i*LOT, CURB + .06, o.c.j*LOT); ss.set(sz, sz, 1); m4.compose(pp, q, ss); im.setMatrixAt(k, m4); }); im.count = arr.length; im.instanceMatrix.needsUpdate = true; };
      place(grid, G, LOT); place(rings, Rg, LOT*.99); return true;
    }
    const SPEED = 7, WIDTH = 1.1;
    function tick(){
      requestAnimationFrame(tick); if (!running) return;
      const front = (performance.now() - t0)/1000*SPEED;
      const paint = (im, arr, gain) => { for (let k = 0; k < arr.length; k++){ const x = (front - arr[k].d)/WIDTH, a = x > -1 && x < 2.5 ? Math.exp(-x*x)*(1 - arr[k].d/(maxD + 2))*gain : 0; cc.copy(base).multiplyScalar(a); im.setColorAt(k, cc); } im.instanceColor.needsUpdate = true; };
      paint(grid, G, .9); paint(rings, Rg, 1.4);
      if (front > maxD + 3){ running = false; grid.visible = rings.visible = false; }
    }
    requestAnimationFrame(tick);
    setInterval(() => { if (running || document.hidden || !booted) return; if (plan()){ t0 = performance.now(); running = true; grid.visible = rings.visible = true; } }, 4500);
    return {};
  })();

  /* ---------- power surges: now and then a core surges, yellow, orange, red. Stabilize it in time (the trace mini game) or it shuts down;
     a dead core comes back by cranking it (click fast to fill the bar), and for a while after its reach is shorter ---------- */
  const SURGE_COL = ['#ffe14a', '#ff9a2a', '#ff3a3a'];
  const surgeStage = s => s.surge ? Math.min(2, Math.floor((now() - s.surge.t0)/P.surgeStage)) : -1;
  E.coreLook = m => { if (!m) return null; const s = coreState(m); if (s.off) return { off: true }; if (s.surge) return { col: SURGE_COL[surgeStage(s)] }; return null; };
  let surgeLbl = null;
  function powerTick(dms){
    const t = now(), cores = megaList('emitter');
    for (const m of cores){ const s = coreState(m);
      if (s.surge){ if (MINI.openFor === m.id || s.surge.paused) s.surge.t0 += dms;   // (the clock stops while you're working on it, or reading about it)
        else if (t - s.surge.t0 >= 3*P.surgeStage) shutdown(m); } }
    if (!st.tut.done || st.tier < 0) return;
    if (!st.nextSurge) st.nextSurge = t + P.surgeFirst;
    if (t >= st.nextSurge && !cores.some(m => coreState(m).surge)){
      const ok = cores.filter(m => coreOnline(m)); st.nextSurge = t + P.surgeGap[0] + Math.random()*(P.surgeGap[1] - P.surgeGap[0]);
      if (ok.length){ const m = ok[(Math.random()*ok.length) | 0]; coreState(m).surge = { t0: t }; save();
        if (!st.hints.surge){ st.hints.surge = 1; coreState(m).surge.paused = true; surgeIntro(m); } else say('Power surge! Click the Emitter Core to stabilize it'); try { if (typeof sfx !== 'undefined' && sfx.tone) [0, .18, .36].forEach(a => sfx.tone(880, { gain: .1, at: a, dur: .12, glide: 1 })); } catch (e) {} } }
    surgeMarks();
  }
  // the first surge explains itself, over the core, with the clock held until you've read it or clicked the core
  let surgeAt = null;
  function surgeIntro(m){
    noteEl.innerHTML = ''; noteEl.className = 'econ-note tip'; surgeAt = () => ({ w: [m.x, (m.roofH || CURB + 6) + 3, m.z], gap: 40 });
    const sy = el('span', 'say'); sy.textContent = 'Power surge! Your Emitter Core is overloading.';
    const sb = el('span', 'sub'); sb.textContent = 'It glows yellow, then orange, then red. Click the core and keep the trace inside the band to stabilize it. If it reaches red it shuts down, and its buildings go dark until you crank it back up. The clock waits until you click.';
    const row = el('div', 'row'), ok = el('button', 'go', 'Got it'); ok.type = 'button'; ok.onclick = () => { const s = coreState(m); if (s.surge) s.surge.paused = false; noteEl.hidden = true; surgeAt = null; }; row.append(ok);
    noteEl.append(el('span', 't', 'Power surge'), sy, sb, row); noteEl.hidden = false; clearTimeout(noteT); hintShowing = Date.now() + 120e3;
  }
  (function tipLoop(){ requestAnimationFrame(tipLoop); if (!surgeAt || noteTut) return; if (noteEl.hidden){ surgeAt = null; return; }
    const a = surgeAt(), p = a && screenOf(a.w[0], a.w[1], a.w[2]), s_ = noteEl.style;
    if (!p){ return; } const w = noteEl.offsetWidth || 340, cx = Math.min(innerWidth - w/2 - 12, Math.max(w/2 + 12, p[0]));
    noteEl.classList.add('anch'); s_.left = cx + 'px'; s_.top = (p[1] - a.gap) + 'px'; s_.right = 'auto'; s_.bottom = 'auto'; s_.transform = 'translate(-50%, -100%)'; s_.setProperty('--ax', (p[0] - cx + w/2) + 'px'); })();
  function shutdown(m){ const s = coreState(m); s.surge = null; s.off = true; save(); say('Emitter Core offline · click it and crank it back up'); hudSoon();
    try { if (typeof sfx !== 'undefined' && sfx.tone){ sfx.tone(220, { gain: .16, dur: .9, glide: 1.6 }); sfx.tone(110, { gain: .14, dur: 1.2, glide: 1.5 }); } } catch (e) {} }
  // the label over a surging or dead core: what's wrong and what to do, with the time left
  const marks = new Map();
  function surgeMarks(){
    for (const m of megaList('emitter')){ const s = coreState(m); let lb = marks.get(m.id);
      const want = s.surge || s.off;
      if (!want){ if (lb){ lb.remove(); marks.delete(m.id); } continue; }
      if (!lb){ lb = el('div', 'econ-mark'); document.body.appendChild(lb); marks.set(m.id, lb); lb.addEventListener('click', () => coreClick(m)); }
      if (s.off){ lb.className = 'econ-mark off'; lb.innerHTML = '<b>Offline</b><span>Click to restart</span>'; }
      else { const k = surgeStage(s), left = Math.max(0, 3*P.surgeStage - (now() - s.surge.t0)); lb.className = 'econ-mark s' + k; lb.style.setProperty('--sc', SURGE_COL[k]);
        lb.innerHTML = `<b>Power surge</b><span>Click to stabilize · ${Math.ceil(left/1000)} s</span><i style="width:${100*left/(3*P.surgeStage)}%"></i>`; }
    }
    for (const [id, lb] of marks) if (!megas.has(id)){ lb.remove(); marks.delete(id); }
  }
  // the glow over a surging core: a big light that swells and flickers in the stage's color, and a warning ring on the ground round it
  const flares = new Map();
  function flareFor(m){ let f = flares.get(m.id); if (f) return f;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); sp.layers.set(1); sp.renderOrder = 998;
    const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 64), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI/2; ring.layers.set(1); ring.renderOrder = 997;
    for (const o of [sp, ring]){ o.frustumCulled = false; if (typeof scene !== 'undefined') scene.add(o); }
    f = { sp, ring }; flares.set(m.id, f); return f; }
  (function flareLoop(){ requestAnimationFrame(flareLoop); const t = performance.now()/1000;
    for (const [id, f] of flares){ const m = megas.get(id), s = m && coreState(m);
      if (!s || !s.surge){ for (const o of [f.sp, f.ring]){ scene.remove(o); o.geometry && o.geometry.dispose(); o.material.dispose(); } flares.delete(id); continue; }
      const k = surgeStage(s), col = SURGE_COL[k], fl = .75 + .25*Math.sin(t*(10 + k*8))*Math.sin(t*3.3), y = (m.roofH || CURB + 6)*.6;
      f.sp.material.color.set(col); f.sp.position.set(m.x, y, m.z); f.sp.scale.setScalar(m.w*LOT*(1.1 + .25*k)*fl); f.sp.material.opacity = .65 + .35*fl;
      const rp = (t*(.8 + k*.5)) % 1; f.ring.material.color.set(col); f.ring.position.set(m.x, CURB + .12, m.z); f.ring.scale.setScalar(m.w*LOT*(.6 + rp*1.6)); f.ring.material.opacity = (1 - rp)*.9; }
    if (typeof megas !== 'undefined') for (const m of megaList('emitter')) if (coreState(m).surge && !flares.has(m.id)) flareFor(m); })();
  (function markLoop(){ requestAnimationFrame(markLoop); if (!marks.size) return;
    for (const [id, lb] of marks){ const m = megas.get(id); if (!m) continue; const p = screenOf(m.x, (m.roofH || CURB + 6) + 1.5, m.z); if (!p){ lb.style.display = 'none'; continue; } lb.style.display = ''; lb.style.left = p[0] + 'px'; lb.style.top = p[1] + 'px'; } })();
  // clicking a megastructure with no zone picked (input.js): a core shows its reach, or opens the fix it needs
  function coreClick(m){ const s = coreState(m); if (s.off) return RESTART.open(m.id); if (s.surge){ if (s.surge.paused){ s.surge.paused = false; if (surgeAt){ noteEl.hidden = true; surgeAt = null; } } return MINI.open(m.id); } VIEW.show(m); return true; }
  E.megaClick = m => { if (!m || m.kind !== 'emitter') return false; coreClick(m); return true; };

  const MINI = (() => {
    const box = el('div', 'econ-mini'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Stabilize the core');
    box.innerHTML = `<div class="box"><div class="top"><span>Surge stabilizer</span><span id="emHz">50.00 Hz</span></div><p class="how">Keep the trace inside the band: click, tap or press Space to lift it.</p><canvas id="emCv" width="300" height="300" aria-label="Frequency trace: tap or press Space to lift it"></canvas>
      <div class="meter"><i id="emStab"></i></div><div class="foot"><span id="emSaved">Stability 0%</span><button type="button" id="emClose">Leave it</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('#emCv'), g = cv.getContext('2d');
    let on = false, id = null, y = .5, v = 0, t = 0, stab = 0, raf = 0, last = 0, trail = [];
    const NEED = 4;   // seconds inside the band
    function open(coreId){
      const m = megas.get(coreId); if (!m || !coreState(m).surge) return;
      id = coreId; api.openFor = id; on = true; box.hidden = false; y = .5; v = 0; t = 0; stab = 0; trail = []; last = performance.now(); raf = requestAnimationFrame(loop); E.emit('mini');
    }
    function close(){ on = false; box.hidden = true; cancelAnimationFrame(raf); api.openFor = null; save(); }
    const lift = () => { if (on) v -= .55; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); lift(); });
    addEventListener('keydown', e => { if (!on) return; if (e.code === 'Space'){ e.preventDefault(); e.stopPropagation(); lift(); } if (e.key === 'Escape'){ e.stopPropagation(); close(); } }, true);
    box.querySelector('#emClose').addEventListener('click', close);
    function loop(ts){
      if (!on) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (ts - last)/1000); last = ts; t += dt;
      const grav = .9 + t*.03, band = Math.max(.1, .26 - t*.006), mid = .5 + Math.sin(t*.9)*.14*Math.min(1, t/6);
      v += grav*dt; v *= .985; y += v*dt; if (y < 0){ y = 0; v = 0; } if (y > 1){ y = 1; v = 0; }
      const ok = Math.abs(y - mid) < band/2;
      stab = Math.max(0, Math.min(NEED, stab + (ok ? dt : -dt*.35)));
      trail.push(y); if (trail.length > 150) trail.shift();
      const W = cv.width, H = cv.height;
      g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(122,184,255,.12)'; g.fillRect(0, (mid - band/2)*H, W, band*H);
      g.strokeStyle = 'rgba(122,184,255,.6)'; g.strokeRect(.5, (mid - band/2)*H + .5, W - 1, band*H - 1);
      g.strokeStyle = 'rgba(255,255,255,.06)'; for (let q = 1; q < 6; q++){ g.beginPath(); g.moveTo(0, q*H/6); g.lineTo(W, q*H/6); g.stroke(); }
      g.strokeStyle = ok ? '#5affa8' : '#ff5a6e'; g.lineWidth = 2; g.beginPath(); trail.forEach((q, k) => { const x = W - (trail.length - k)*2; k ? g.lineTo(x, q*H) : g.moveTo(x, q*H); }); g.stroke();
      g.fillStyle = ok ? '#5affa8' : '#ff5a6e'; g.beginPath(); g.arc(W - 2, y*H, 5, 0, Math.PI*2); g.fill();
      document.getElementById('emHz').textContent = (50 + (mid - y)*4).toFixed(2) + ' Hz';
      document.getElementById('emSaved').textContent = 'Stability ' + Math.round(100*stab/NEED) + '%';
      document.getElementById('emStab').style.width = (100*stab/NEED) + '%';
      const m = megas.get(id); if (!m || !coreState(m).surge){ close(); return; }
      if (stab >= NEED){ const s = coreState(m); s.surge = null; const pay = Math.max(50, Math.round(R.rev*.5)); st.money += pay; close(); hudSoon(); surgeMarks();
        say('Core stabilized · +' + fmt(pay) + ' Scrip'); floatText(m.x, (m.roofH || CURB + 6) + 1, m.z, '+' + fmt(pay) + ' Scrip');
        try { if (typeof sfx !== 'undefined' && sfx.tone) [0, 4, 7, 12].forEach((n, q) => sfx.tone(523*Math.pow(2, n/12), { gain: .1, at: q*.06, dur: .4 })); } catch (e) {}
        pulseLevel({ x: m.x, z: m.z, sectionTops: [], height: m.roofH || CURB + 6 }, 1, 'R', true, new THREE.Color(0x7ab8ff)); }
    }
    const api = { open, openFor: null };
    return api;
  })();

  // a dead core: crank it. Every click, tap or Space press fills the bar; it drains on its own, so it takes a quick burst
  const RESTART = (() => {
    const box = el('div', 'econ-mini'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Restart the core');
    box.innerHTML = `<div class="box crank"><div class="top"><span>Restart the core</span><span id="erPct">0%</span></div><p class="how">Click as fast as you can (or tap, or hammer Space) to spin it back up before the charge drains.</p>
      <button type="button" class="crankbtn" id="erBtn"><span id="erRot">⟳</span><b>Crank</b></button><div class="meter big"><i id="erBar"></i></div><div class="foot"><span>Back on at 100% · reach ${P.coreReachLow} plots for ${Math.round(P.lowMs/1000)} s</span><button type="button" id="erClose">Later</button></div></div>`;
    document.body.appendChild(box);
    let on = false, id = null, k = 0, raf = 0, last = 0, rot = 0;
    const hit = () => { if (!on) return; k = Math.min(1, k + .065); rot += 40; if (k >= 1) return done(); try { if (typeof sfx !== 'undefined' && sfx.tone) sfx.tone(300 + k*700, { gain: .05, dur: .06, glide: .8 }); } catch (e) {} };
    box.querySelector('#erBtn').addEventListener('pointerdown', e => { e.preventDefault(); hit(); });
    addEventListener('keydown', e => { if (!on) return; if (e.code === 'Space' || e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); if (!e.repeat) hit(); } if (e.key === 'Escape'){ e.stopPropagation(); close(); } }, true);
    box.querySelector('#erClose').addEventListener('click', () => close());
    function open(coreId){ const m = megas.get(coreId); if (!m || !coreState(m).off) return; id = coreId; on = true; k = 0; box.hidden = false; last = performance.now(); raf = requestAnimationFrame(loop); }
    function close(){ on = false; box.hidden = true; cancelAnimationFrame(raf); }
    function loop(ts){ if (!on) return; raf = requestAnimationFrame(loop); const dt = Math.min(.05, (ts - last)/1000); last = ts;
      k = Math.max(0, k - dt*.16); rot += dt*k*900;
      document.getElementById('erBar').style.width = (k*100) + '%'; document.getElementById('erPct').textContent = Math.round(k*100) + '%'; document.getElementById('erRot').style.transform = `rotate(${rot}deg)`;
    }
    function done(){ const m = megas.get(id); close(); if (!m) return; const s = coreState(m); s.off = false; s.lowUntil = now() + P.lowMs; save(); surgeMarks(); hudSoon();
      say(`Core back online · reach ${P.coreReachLow} plots for ${Math.round(P.lowMs/1000)} s`); try { if (typeof sfx !== 'undefined' && sfx.tone) [0, 7, 12, 19].forEach((n, q) => sfx.tone(262*Math.pow(2, n/12), { gain: .1, at: q*.07, dur: .5 })); } catch (e) {}
      VIEW.show(m); }
    return { open };
  })();

  /* ---------- the tutorial: one short thing at a time, the button to use glowing, the city answering at once (no dimming, no spotlight) ---------- */
  const TUTE = (() => {
    const tap = TOUCHY ? 'Tap' : 'Click';
    const zoneBtn = z => () => document.querySelector(TOUCHY ? '.zones' : `.zone[data-zone="${z}"]`);
    const litCount = () => Object.values(st.best).reduce((s, n) => s + n, 0);
    const homesStacked = () => { for (const b of B.values()) if (b.z === 'R' && b.floors >= 2) return true; return false; };
    // the new empty tiles laid since the step began, and how far out from the core the furthest one (joined to the city) reaches
    const emptyKeys = () => { const k_ = new Set(); for (const c of cells.values()) if (!c.mega && !c.sections.length && !(c.below && c.below.length) && !c.lift && !c.wall) k_.add(keyOf(c)); return k_; };
    const farTile = b => { const m = megaList('emitter')[0]; if (!m || !b._base) return 0; let best = 0;
      for (const c of cells.values()){ if (c.mega || c.sections.length || c.lift || c.wall || b._base.has(keyOf(c))) continue; best = Math.max(best, megaD(c.i, c.j, m)); } return best; };
    const emptyN = () => { let n = 0; for (const c of cells.values()) if (!c.mega && !c.sections.length && !(c.below && c.below.length) && !c.lift && !c.wall) n++; return n; };
    const homes = () => [...B.values()].filter(b => b.z === 'R');
    const farHome = () => homes().some(b => b.band !== 'near' && !b.isolated);
    const coreAt = () => { const m = megaList('emitter')[0]; return m ? { w: [m.x, (m.roofH || CURB + 6) + 3, m.z], gap: 40 } : null; };
    const homeAt = f => () => { const b = homes().find(f || (() => true)); return b ? { w: [b.c.x, ((b.c.sectionTops && b.c.sectionTops[b.c.sectionTops.length - 1]) || b.c.height || CURB + 3) + .6, b.c.z] } : null; };
    const elAt = f => () => { const e = f(); return e ? { el: e } : null; };
    const beats = [
      { say: 'Goal: grow this sector into a city.', sub: `Climb six classifications to ${TIERS[TIERS.length - 1].name}, each unlocking new buildings. This glowing tower is your Emitter Core: it powers every building within 9 plots.`, next: true, at: coreAt },
      { say: 'Click your Emitter Core.', sub: 'See how far its power reaches.', at: coreAt, ev: 'coreview' },
      { say: 'Switch maps up here.', sub: 'Power: where power reaches. Air: poor air near cores. Noise: factories, shops, the Grid. Press V to cycle.', next: true, at: elAt(() => document.querySelector('.econ-hud .vw')) },
      { say: `Pick Residential and ${tap.toLowerCase()} the ground right next to the core.`, sub: 'People move in, the lights come on, and every lit level pays Scrip.', target: zoneBtn('low'), at: elAt(zoneBtn('low')), done: () => countZone('R') >= 1 },
      { say: () => homes().some(b => b.band === 'near') ? 'Too close to the core.' : 'Homes right beside the core get poor air.', sub: 'Within two plots of a core the air is poor, so homes there have a low Sector Grade and can\'t grow tall. Three plots out the air is clean.', next: true, at: homeAt(b => b.band === 'near') },
      { say: 'Now lay some empty ground.', sub: (TOUCHY ? 'Tap Residential again so no zone is picked, then tap' : 'Click Residential again (or press Esc) so no zone is picked, then click') + ' beside your city to place empty tiles in a line, away from the core, until one is 3 plots out. Everything must connect by ground, or it\'s isolated and nobody can move in.', target: () => document.querySelector('.zone.on') || null, at: elAt(zoneBtn('low')), enter: emptyKeys, count: b => [farTile(b), 3], countFmt: (a_, m_) => 'Furthest new tile: ' + a_ + ' of ' + m_ + ' plots out', done: b => farTile(b) >= 3 },
      { say: `Now pick Residential and build a home on the far tile, 3 plots from the core.`, sub: 'Out there the air is clean and homes grow taller. But it\'s further from work, so keep jobs close.', target: zoneBtn('low'), at: elAt(zoneBtn('low')), done: farHome },
      { say: 'Pick Industrial and place a factory near your homes.', sub: 'It gives them jobs. Homes far from work fill slowly.', target: zoneBtn('ind'), at: elAt(zoneBtn('ind')), done: () => countZone('I') >= 1 },
      { say: 'Pick Commercial and place a shop.', sub: 'Shops earn the most Scrip.', target: zoneBtn('mid'), at: elAt(zoneBtn('mid')), done: () => countZone('C') >= 1 },
      { say: `Pick Residential and ${tap.toLowerCase()} a lit home's roof to stack a level.`, sub: 'Taller homes hold more people. Fill one completely for a Full House.', target: zoneBtn('low'), at: homeAt(b => b.lit > 0 && b.band !== 'near'), done: homesStacked, nextAfter: 40 },
      { say: `Next goal: ${TIERS[1].name}.`, sub: `This panel tracks it: fill every bar to reach the next city size. ${TOUCHY ? 'Tap' : 'Hover'} any building to see what it needs.`, next: true, last: true, target: () => document.querySelector('.econ-obj'), at: elAt(() => document.querySelector('.econ-obj')) },
    ];
    let k = st.tut.done ? beats.length : Math.min(st.tut.step || 0, beats.length), lit = null;
    const unpulse = () => { if (lit){ lit.classList.remove('econ-pulse'); lit = null; } };
    function show(){
      unpulse(); { const s_ = noteEl.style; s_.left = s_.top = s_.right = s_.bottom = s_.transform = ''; noteEl.classList.remove('anch', 'below'); }
      if (k >= beats.length){ noteTut = false; noteEl.hidden = true; return; }
      const b = beats[k]; noteTut = true; clearTimeout(noteT);
      noteEl.innerHTML = ''; noteEl.className = 'econ-note';
      if (b.enter) b._base = b.enter(); const say = el('span', 'say'); say.textContent = typeof b.say === 'function' ? b.say() : b.say; const sub = el('span', 'sub'); sub.textContent = b.sub;
      const prog = el('div', 'prog'); beats.forEach((_, q) => prog.append(el('i', q <= k ? 'on' : '')));
      noteEl.append(say, sub); if (b.count){ const n = el('span', 'sub'); n.dataset.count = '1'; noteEl.append(n); }
      const row = el('div', 'row'); row.style.justifyContent = 'space-between'; row.append(prog);
      const btns = el('div', ''); const skip = el('button', '', 'Skip'); skip.type = 'button'; skip.onclick = finish; btns.append(skip);
      if (b.next){ const go = el('button', 'go', b.last ? 'Got it' : 'Next'); go.type = 'button'; go.onclick = advance; btns.append(go); }
      row.append(btns); noteEl.append(row); noteEl.hidden = false; shownAt = Date.now(); refresh();
    }
    let shownAt = 0;
    // the note hovers over what it's talking about: above a button, or over a spot in the city (it follows the camera); otherwise its corner
    function place(){
      const b = beats[k]; const a = !noteEl.hidden && noteTut && b && b.at ? b.at() : null;
      let x = null, y = null, below = false;
      if (a && a.el){ const r = a.el.getBoundingClientRect(); if (r.width){ x = r.left + r.width/2; y = r.top - 14; if (r.top < innerHeight*.35){ y = r.bottom + 14; below = true; } } }
      else if (a && a.w){ const p = screenOf(a.w[0], a.w[1], a.w[2]); if (p && p[1] > 60 && p[1] < innerHeight - 40){ x = p[0]; y = p[1] - (a.gap || 24); } }
      const st_ = noteEl.style;
      if (x === null){ if (noteEl.classList.contains('anch')){ noteEl.classList.remove('anch', 'below'); st_.left = st_.top = st_.right = st_.bottom = st_.transform = ''; st_.removeProperty('--ax'); } return; }
      const w = noteEl.offsetWidth || 340, cx = Math.min(innerWidth - w/2 - 12, Math.max(w/2 + 12, x));
      noteEl.classList.add('anch'); noteEl.classList.toggle('below', below);
      const L_ = Math.round(cx) + 'px', T_ = Math.round(y) + 'px'; if (st_.left === L_ && st_.top === T_) return;
      st_.left = L_; st_.top = T_; st_.right = 'auto'; st_.bottom = 'auto'; st_.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'; st_.setProperty('--ax', (x - cx + w/2) + 'px');
    }
    (function placeLoop(){ requestAnimationFrame(placeLoop); if (noteTut) place(); })();
    function refresh(){
      const b = beats[k]; if (!b || noteEl.hidden) return;
      if (b.nextAfter && Date.now() - shownAt > b.nextAfter*1000 && !noteEl.querySelector('button.go')){ const go = el('button', 'go', 'Next'); go.type = 'button'; go.onclick = advance; const bt = noteEl.querySelector('.row > div:last-child'); if (bt) bt.append(go); }
      const n = noteEl.querySelector('[data-count]'); if (n && b.count){ const [a, m] = b.count(b); n.textContent = b.countFmt ? b.countFmt(Math.min(a, m), m) : Math.min(a, m) + ' / ' + m; }
      const t = b.target && b.target(); if (t !== lit){ unpulse(); if (t){ t.classList.add('econ-pulse'); lit = t; } }
    }
    function advance(){ k++; st.tut.step = k; if (k >= beats.length) st.tut.done = true; save(); noteEl.classList.add('done-flash'); setTimeout(show, k >= beats.length ? 0 : 260); }
    function finish(){ k = beats.length; st.tut.done = true; st.tut.step = k; save(); show(); }
    for (const ev of ['build', 'office', 'coreview']) E.onEv(ev, d => { const b = beats[k]; if (b && b.ev === ev && (!b.test || b.test(d))) advance(); });
    setInterval(() => { const b = beats[k]; if (!b || noteEl.hidden) return; if (b.done && b.done(b)) advance(); else refresh(); }, 400);
    // (on a touch screen the gesture tutorial goes first, tutorial.js: these notes wait until it's done or skipped)
    const gestureDone = () => { if (!TOUCHY) return true; try { const g = JSON.parse(localStorage.getItem('touch:nt.tut') || 'null'); return !!(g && g.done); } catch (e) { return true; } };
    function start(){ if (k >= beats.length) return; if (!gestureDone()) return setTimeout(start, 2000); setTimeout(show, 1200); }
    return { start, replay(){ k = 0; st.tut = { step: 0, done: false }; save(); show(); } };
  })();
  setTimeout(() => TUTE.start(), 0);

  /* ---------- for tests and the console ---------- */
  E.freshState = freshState; E.state = () => st; E.P = P; E.MEGA = MEGA; E.TIERS = TIERS; E.save = save; E.step = step; E.building = k => B.get(k); E.info = infoOf;
  E.dev = { money(n){ st.money += n; hud(); }, tier(t){ st.tier = Math.max(0, Math.min(TIERS.length - 1, t)); onTier(st.tier, true); hud(); }, light(c, lit = 1){ E.emit("light", { c, lit, pay: 0 }); }, run(h){ let left = h; while (left > 0){ const d = Math.min(left, 2/60); step(d, false); left -= d; } darkSync(); hud(); } };
  return E;
})();
window.ECON = ECON;
