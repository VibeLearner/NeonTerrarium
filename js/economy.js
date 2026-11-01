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
    pwr: { R: 3, C: 6, L: 9, I: 12, K: 9 }, stationPwr: 6, hwPwr: 8,
    coreCap: 80, coreCost: 250, coreCostGrowth: 1.35, coreBuildMin: 20, coreBuildGrowth: 1.45, coreBuildMaxH: 2,
    coreUpCost: 250, coreUpCostGrowth: 1.6, coreUpGain: .5, coreUpDecay: .85, coreUpPollCut: .2, coreJobs: 10, coreUpkeep: 10,
    coreReach: 9, coreNear: 2, coreMid: 5,
    ppl: { R: 24, L: 9 }, jobsI: 36, jobsK: 12, unempStay: .4,
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
    fill: 40, fillCheap: 20,   // (per model hour, toward the target: at the clicker pace a new level lights in a second or two)
    baseline: .6, baselineH: 24, stipend: 15,
    startMoney: 800,
    metroTile: 25, metroStop: 150, hwTile: 120, hwFinish: 1500,
  };
  // the megastructures: the tier each unlocks at, what it costs, the power it draws, the jobs it gives (per level for the Sky mall), and its reach in plots
  const MEGA = {
    radio:      { tier: 0, cost: 300,   pwr: 4,  jobs: 6,  reach: 7, upReach: 2, upCost: 500, upGrowth: 1.6, what: 'buildings within 7 plots earn 15% more' },
    emitter:    { tier: 0, cost: 250,   pwr: 0,  jobs: 10, what: 'powers every building within 9 plots' },
    wirenest:   { tier: 1, cost: 600,   pwr: 4,  jobs: 6,  what: 'Demand readout in the log, data income' },
    square:     { tier: 1, cost: 400,   pwr: 4,  jobs: 6,  reach: 5, what: 'Residents in reach spend 15% more' },
    police:     { tier: 2, cost: 1500,  pwr: 6,  jobs: 8,  reach: 7, upReach: 2, upCost: 1000, upGrowth: 1.6, what: 'Sector Grade +15 in reach' },
    market:     { tier: 2, cost: 1500,  pwr: 8,  jobs: 10, what: 'A big shop anchor: 1,200 sales an hour' },
    foundry:    { tier: 2, cost: 2000,  pwr: 16, jobs: 14, what: 'Factory output +20%' },
    bathhouse:  { tier: 3, cost: 4000,  pwr: 6,  jobs: 0,  reach: 5, what: 'Cheap homes in reach work better' },
    club:       { tier: 3, cost: 5000,  pwr: 10, jobs: 10, what: 'Spending +10% across the city' },
    lidar:      { tier: 3, cost: 5000,  pwr: 6,  jobs: 0,  reach: 8, what: '+2% tax from homes in reach' },
    mall:       { tier: 4, cost: 10000, pwr: 12, jobs: 8,  levelGrowth: 2, what: '2,000 big-shop sales an hour per level' },
    logistics:  { tier: 4, cost: 12000, pwr: 14, jobs: 24, what: 'Better trade rates, more storage' },
    greenhouse: { tier: 4, cost: 10000, pwr: 12, jobs: 12, what: 'Local food: 15% less goods demand' },
    spire:      { tier: 5, cost: 30000, pwr: 10, jobs: 0,  after: 'foundry', what: 'The Overseer upgrades buildings for you' },
    pagoda:     { tier: 5, cost: 40000, pwr: 14, jobs: 12, what: 'Luxury fills easier; visitors pay' },
  };
  const TIERS = [
    { name: 'Unlisted', pop: 0, inc: 0 },
    { name: 'Registered', pop: 100, inc: 0, opens: 'Wire Nest, Town square, core upgrades, stabilizer' },
    { name: 'Zoned', pop: 300, inc: 500, opens: 'Metro, Police station, Market Plaza, Foundry' },
    { name: 'Chartered', pop: 650, inc: 1800, opens: 'Luxury, Corps, Bath House, Neon Dome, LIDAR Array' },
    { name: 'Incorporated', pop: 1100, inc: 4500, opens: 'Sky highways, Sky mall, Logistics Hub, Hydroponic Farm' },
    { name: 'Sovereign', pop: 1700, inc: 9500, opens: 'Data Spire, Cloud Pagoda' },
    { name: 'The coast', pop: 2500, inc: 16000, size: 80, opens: 'The coast, through the Data Spire' },
  ];
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
  function freshState(){ return { on: true, v: 1, money: P.startMoney, tier: 0, fresh: true, last: Date.now(), peak: 0, best: {}, occ: {}, cores: {}, ups: {}, auto: false, tut: { step: 0, done: false }, stock: 0, corp: false, metroPaid: {}, hwPaid: {} }; }
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
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const now = () => Date.now();

  function coreState(m){ let s = st.cores[m.id]; if (!s) s = st.cores[m.id] = { up: 0, readyAt: 0 }; return s; }
  const coreReady = m => coreState(m).readyAt <= now();
  function coreCapOf(m){ const s = coreState(m); let c = P.coreCap; for (let k = 0; k < s.up; k++) c += P.coreCap*P.coreUpGain*Math.pow(P.coreUpDecay, k); return c; }
  const coreUpCost = m => Math.round(P.coreUpCost*Math.pow(P.coreUpCostGrowth, coreState(m).up));
  function nextCoreCost(){ const n = megaList('emitter').length; return Math.round(P.coreCost*Math.pow(P.coreCostGrowth, Math.max(0, n - 1))); }
  function nextCoreBuildMs(){ const n = megaList('emitter').length; return Math.min(P.coreBuildMaxH*3600e3, P.coreBuildMin*60e3*Math.pow(P.coreBuildGrowth, Math.max(0, n - 1)))/K; }
  const megaReach = (m) => { const d = MEGA[m.kind]; return (d.reach || 0) + (d.upReach ? d.upReach*(st.ups[m.kind] || 0) : 0); };
  const megaUpCost = kind => Math.round(MEGA[kind].upCost*Math.pow(MEGA[kind].upGrowth, st.ups[kind] || 0));
  const countZone = z => { let n = 0; for (const c of cells.values()) if (isBld(c) && zoneOf(c) === z) n++; return n; };
  const placeCost = z => Math.round(P.cost[z]*Math.pow(P.countGrowth, countZone(z)));
  const upgradeCost = (z, lv) => Math.round(P.cost[z]*P.levelCost*Math.pow(P.levelGrowth, lv - 1));
  const transitStops = () => { const out = []; if (typeof metros === 'undefined') return out; for (const l of metros){ const n = l.tiles.length; for (let k = 0; k < n; k++) if (mtIsStop(l, k)) out.push(l.tiles[k]); } return out; };
  const hwDone = () => typeof highways !== 'undefined' && highways.some(h => h.done);

  /* ---------- the simulation ---------- */
  const B = new Map();   // per building: { c, z, floors, lv, cap, eff, powered, ... } (rebuilt each tick)
  const pv = { sales: 0, capTotal: 1, staffR: 0, staffL: 0, ratioR: 1, demand: 0, goodsShort: 0, unempAccR: 0, unempAccL: 0 };
  const R = E.r = { money: 0, rev: 0, pop: 0, popL: 0, supply: 0, used: 0, size: 0, emp: 0, breakdown: {}, demandZ: {}, dark: 0 };
  let peakLocal = st.peak || 0;
  function step(dtH, live){
    const T = now();
    const coresAll = megaList('emitter'), cores = coresAll.filter(coreReady);
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
      let coreD = Infinity; for (const m of cores){ const d = megaD(c.i, c.j, m); if (d < coreD) coreD = d; }
      const b = { c, z, k, floors: floorsOf(c), coreD, order: order++, isolated: !reach.has(k) };
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
      b.powered = b.coreD <= P.coreReach && used + need <= supply;
      if (b.powered) used += need;
      b.eff = b.powered ? Math.min(b.floors, b.cap) : 0;
    }
    // who moves in
    let bonus = 0; const capPrev = Math.max(1, pv.capTotal);
    const lshift = built('pagoda') ? 10 : 0;
    for (const b of rows){
      let target = 0;
      if (b.z === 'R'){ const fill = (!b.corpNear || b.lv <= P.lvPricey) ? 1 : 1 - (1 - P.priceyMin)*(b.lv - P.lvPricey)/(100 - P.lvPricey); target = b.eff*fill*(P.unempStay + (1 - P.unempStay)*pv.ratioR); }
      else if (b.z === 'L') target = b.eff*Math.max(0, Math.min(1, (b.lv - P.lvLuxMin + lshift)/(P.lvLuxFull - P.lvLuxMin)));
      else if (b.z === 'I') target = b.eff*pv.staffR;
      else if (b.z === 'K') target = b.eff*pv.staffL;
      else if (b.z === 'C') target = b.eff*Math.max(0, Math.min(1, pv.sales/capPrev));
      if (b.isolated) target = 0;
      const cheap = b.lv < P.lvCheap;
      let occ = st.occ[b.k] || 0;
      let r = target >= occ ? P.fill + (cheap ? P.fillCheap : 0) : 6; if (b.z !== 'R' && b.z !== 'L') r = 20;
      occ += (target - occ)*Math.min(1, r*dtH); if (occ > b.floors) occ = b.floors;
      st.occ[b.k] = Math.round(occ*1000)/1000; b.occ = occ;
      const lit = Math.floor(occ + .5), best = st.best[b.k] || 0;   // (a level lights once it's about half full: homes short of work still light, they just earn less)
      if (lit > best){ const pay = (lit - best)*P.bonus[b.z]*(b.z === 'R' && cheap ? P.cheapBonus : 1); bonus += pay; st.best[b.k] = lit; if (live) E.emit('light', { c: b.c, lit, pay }); }
      b.lit = lit;
    }
    // jobs
    let accR = 0, accL = 0, popR = 0, popL = 0;
    const access = b => { let a = b.jobBand === 'near' ? 1 : b.jobBand === 'mid' ? P.accessMid : P.accessFar; if (b.station) a = Math.max(a, P.accessMetro); return a; };
    for (const b of rows){ if (b.z === 'R'){ const p = b.occ*P.ppl.R; popR += p; accR += p*access(b); } if (b.z === 'L'){ const p = b.occ*P.ppl.L; popL += p; accL += p*access(b); } }
    let jobsR = megaJobs, jobsL = 0;
    for (const b of rows){ if (b.z === 'I') jobsR += b.eff*P.jobsI; if (b.z === 'K') jobsL += b.eff*P.jobsK; }
    const empR = Math.min(jobsR, accR), empL = Math.min(jobsL, accL);
    const ratioR = accR > 0 ? empR/accR : 0, ratioL = accL > 0 ? empL/accL : 0;
    pv.staffR = jobsR > 0 ? empR/jobsR : 0; pv.staffL = jobsL > 0 ? empL/jobsL : 0; pv.ratioR = popR > 0 ? empR/popR : 1;
    pv.unempAccR = accR - empR; pv.unempAccL = accL - empL;
    // shops
    let capTotal = 0, bigCap = 0;
    for (const b of rows) if (b.z === 'C'){ const c = b.eff*P.cCap*(b.station ? 1 + P.cStation : 1); capTotal += c; if (b.eff >= P.bigShop) bigCap += c; }
    const anchorCap = (built('market') ? 1200 : 0) + megaList('mall').reduce((s, m) => s + 2000*(m.levels || 1), 0);
    capTotal += anchorCap; bigCap += anchorCap;
    const luxCap = P.luxSmall + (1 - P.luxSmall)*(capTotal > 0 ? bigCap/capTotal : 0);
    // wages, taxes and spending
    let income = 0, demand = 0, lidarTax = 0;
    const dome = built('club') ? 1.1 : 1;
    for (const b of rows){
      if (b.z !== 'R' && b.z !== 'L') { b.earn = 0; continue; }
      const ppl = b.occ*P.ppl[b.z], ef = access(b)*(b.z === 'R' ? ratioR : ratioL);
      const prod = (b.band === 'near' ? 1 : b.band === 'mid' ? P.prodMid : P.prodFar)*(b.lv < P.lvCheap ? Math.min(1, P.cheapProd + (b.covB ? .15 : 0)) : 1)*(b.covA ? 1.15 : 1);
      const inc = ppl*(ef*(b.z === 'R' ? P.incR : P.incL)*prod + (1 - ef)*(b.z === 'R' ? P.incRU : P.incLU));
      income += inc; if (b.covL) lidarTax += inc*.02;
      const shop = b.station ? Math.max(.95, b.shopNear ? 1 : .85) : (b.shopNear ? 1 : .85);
      demand += inc*P.spend*shop*(b.z === 'L' ? luxCap : 1)*(b.covS ? 1.15 : 1)*dome;
      b.earn = inc*P.tax; b.ef = ef; b.prod = prod;
    }
    const taxes = income*P.tax + lidarTax;
    // goods
    let prodGoods = 0;
    const foundry = built('foundry') ? 1.2 : 1;
    for (const b of rows) if (b.z === 'I') prodGoods += b.occ*P.goodsFloor*(b.band === 'near' ? 1 : b.band === 'mid' ? P.prodMid : P.prodFar)*(b.corpNear ? 1 + P.corpBoost : 1)*foundry;
    const hw = hwDone(), logi = built('logistics');
    const importCut = Math.max(0, (hw ? P.importPost : P.importPre) - (logi ? .1 : 0)), exportRate = Math.min(1, (hw ? P.exportPost : P.exportPre) + (logi ? .2 : 0));
    const wantSales = Math.min(demand, capTotal);
    const needGoods = wantSales/P.salesPerGood*dtH*(built('greenhouse') ? .85 : 1);
    const avail = st.stock + prodGoods*dtH;
    let domestic, imported = 0, exportInc = 0;
    if (avail >= needGoods){
      domestic = wantSales; st.stock = avail - needGoods;
      const stockCap = (P.stockH + (logi ? 4 : 0))*prodGoods;
      if (st.stock > stockCap){ exportInc = (st.stock - stockCap)*P.goodValue*exportRate/dtH; st.stock = stockCap; }
    } else { domestic = needGoods > 0 ? wantSales*avail/needGoods : 0; imported = wantSales - domestic; st.stock = 0; }
    const commRev = P.cShare*(domestic + imported*(1 - importCut));
    pv.sales = wantSales; pv.capTotal = capTotal; pv.demand = demand; pv.goodsShort = wantSales > 0 ? imported/wantSales : 0;
    const visitors = (built('wirenest') ? (popR + popL)*.3 : 0) + (built('pagoda') ? popL*.5 : 0);
    const upkeep = coresAll.length*P.coreUpkeep;
    const revenue = taxes + commRev + exportInc + visitors - upkeep;
    peakLocal = Math.max(peakLocal*Math.exp(-dtH/P.baselineH), revenue); st.peak = peakLocal;
    let eff = Math.max(revenue, P.baseline*peakLocal);
    const cheapest = Math.min(P.cost.R, P.cost.C);
    if (eff < P.stipend && st.money < cheapest) eff = P.stipend;
    st.money += eff*dtH + bonus;
    // what the city shows
    Object.assign(R, { rev: eff, raw: revenue, pop: popR + popL, popL, supply, used, demandAll, size: rows.filter(b => b.powered).length + (typeof megas !== 'undefined' ? megas.size : 0),
      emp: (popR + popL) > 0 ? (empR + empL)/(popR + popL) : 0, jobsR, jobsL, accR, capTotal, demand, prodGoods, short: pv.goodsShort, constructing: coresAll.filter(m => !coreReady(m)),
      breakdown: { 'Shop sales': commRev, 'Wage taxes': taxes, 'Exports': exportInc, 'Data and visitors': visitors, 'Core upkeep': -upkeep, 'Lost to import cut': -imported*importCut*P.cShare } });
    R.demandZ = {
      R: (jobsR - accR) > 15 ? 1 : pv.ratioR < .7 ? -1 : 0,
      C: demand > capTotal*.85 ? 1 : demand < capTotal*.4 ? -1 : 0,
      I: (pv.unempAccR > P.jobsI*1.2 || pv.goodsShort > .05) ? 1 : (pv.staffR < .6 ? -1 : 0),
      L: st.tier >= 3 ? ((jobsL - accL) > 4 ? 1 : 0) : 0,
    };
    B.clear(); for (const b of rows) B.set(b.k, b);
    for (const k of Object.keys(st.occ)) if (!B.has(k)) delete st.occ[k];   // (a building gone: the next on that plot starts empty, its best floor remembered)
    // the tiers
    while (st.tier < TIERS.length - 1){
      const t = TIERS[st.tier + 1];
      if (R.pop < t.pop || R.rev < t.inc || (t.size && R.size < t.size)) break;
      st.tier++; onTier(st.tier, live);
    }
  }

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
    note(TIERS[t].name.toUpperCase() + ' · ' + (TIERS[t].opens || ''), 7000);
    if (typeof WIRELOG !== 'undefined' && WIRELOG.say) WIRELOG.say('SYS', `Sector classification · ${TIERS[t].name}`);
    save();
  }
  E.coastOpen = () => st.tier >= TIERS.length - 1;

  /* ---------- the rules on every build: money, zones, height ---------- */
  function say(msg){ if (TOUCHY) note(msg, 3200); else flash(msg); }   // (the sandbox's instruction line under the city is hidden in Economy)
  const zoneNow = zone => ZONEK[zone] === 'I' && st.corp && st.tier >= 3 ? 'K' : ZONEK[zone];
  function zoneLocked(z){ if ((z === 'L' || z === 'K') && st.tier < 3){ say((z === 'L' ? 'Luxury' : 'Corps') + ' opens at Chartered (' + fmt(TIERS[3].pop) + ' residents, ' + fmt(TIERS[3].inc) + ' Scrip/min)'); return true; } return false; }
  function afford(cost){ if (st.money >= cost) return true; say('Not enough Scrip · ' + fmt(cost) + ' needed, ' + fmt(st.money) + ' held'); return false; }
  function charge(cost){ st.money -= cost; E.emit('spend', cost); hudSoon(); }
  // a new building on a plot that had none
  function gateNew(zone){ const z = zoneNow(zone); if (!z || zoneLocked(z)) return null; const cost = placeCost(z); return afford(cost) ? { z, cost } : null; }
  // more on a plot that has a building: the same zone only, under the Sector Grade's height, priced by its floors
  function gateUp(c, zone, opt){
    const z = zoneNow(zone), have = zoneOf(c);
    if (have && have !== z){ say(ZNAME[have] + ' building · only ' + ZNAME[have].toLowerCase() + ' can go on it in Economy'); return null; }
    if (zoneLocked(z)) return null;
    const b = B.get(keyOf(c)), floors = floorsOf(c), cap = b ? b.cap : P.caps[2];
    if (floors >= cap){ say('Sector Grade ' + (b ? gradeOf(b.lv) : '?') + ' · ' + cap + ' level' + (cap > 1 ? 's' : '') + ' max here · raise the grade to build higher'); return null; }
    if (typeof MAX_SECTIONS !== 'undefined' && c.sections.length >= MAX_SECTIONS) return null;
    const cost = upgradeCost(z, floors); if (!afford(cost)) return null;
    return { z, cost };
  }
  const markCorp = (c, g) => { if (g.z !== 'K') return; for (const s of c.sections) if (s.zone === 'ind') s.corp = 1; if (c.below) for (const s of c.below) if (s.zone === 'ind') s.corp = 1; };
  function wrap(name, fn){ const orig = self[name]; if (typeof orig !== 'function') return; self[name] = function (){ return fn.call(this, orig, ...arguments); }; }
  wrap('addPlatform', function (orig, i, j, zone){
    if (!zone) return orig(i, j, zone);
    const g = gateNew(zone); if (!g) return null;
    const c = orig(i, j, zone); if (c){ charge(g.cost); markCorp(c, g); if (g.z === 'K') refresh([c]); E.emit('build', { c, z: g.z, fresh: true, cost: g.cost }); }
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
      // a new sector: the tutorial starts with an Emitter Core and the Psycho-Acoustic Grid standing
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
    darkSync(); autoTick(); hud();
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
  .econ-note { position: fixed; z-index: 7; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom,0px)); transform: translateX(-50%); width: min(480px, calc(100vw - 32px)); box-sizing: border-box;
    font: 15px/1.45 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.96); border: 1px solid rgba(255,179,71,.45); border-left: 4px solid #ffb347; padding: 12px 16px; white-space: pre-line; }
  .econ-note[hidden] { display: none; } .econ-note .t { color: #ffb347; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; display: block; margin-bottom: 6px; }
  .econ-note .say { font-size: 17px; line-height: 1.35; color: #fff; display: block; }
  .econ-note .sub { display: block; margin-top: 6px; color: #b9b0c8; font-size: 13px; }
  .econ-note .prog { display: flex; gap: 6px; margin-top: 10px; } .econ-note .prog i { width: 22px; height: 6px; background: rgba(255,255,255,.12); } .econ-note .prog i.on { background: #ffb347; }
  .econ-note .row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 10px; } .econ-note button { all: unset; cursor: pointer; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #9a92aa; padding: 8px 10px; }
  .econ-note button.go { color: #12101a; background: #ffb347; } .econ-note button:focus-visible { outline: 1px solid #ffb347; }
  .econ-note.done-flash { animation: enDone .5s ease-out; } @keyframes enDone { 0% { border-color: #5affa8; box-shadow: 0 0 0 6px rgba(90,255,168,.25); } 100% { box-shadow: none; } }
  .econ-pulse { animation: ePulse 1.1s ease-in-out infinite !important; position: relative; z-index: 5; }
  @keyframes ePulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(255,179,71,.9), 0 0 0 6px rgba(255,179,71,.0); } 50% { box-shadow: 0 0 0 2px rgba(255,179,71,.9), 0 0 18px 6px rgba(255,179,71,.55); } }
  .econ-tip { position: fixed; z-index: 61; pointer-events: none; font: 13px/1.5 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.95); border: 1px solid rgba(255,179,71,.4); padding: 8px 11px; transform: translate(18px, 12px); white-space: pre; display: none; }
  .econ-tip .h { color: #ffb347; } .econ-tip .bad { color: #ff8a98; } .econ-tip .ok { color: #5affa8; }
  .econ-float { position: fixed; z-index: 5; pointer-events: none; font: 600 15px/1 'JetBrains Mono', monospace; color: #ffb347; text-shadow: 0 0 8px rgba(255,179,71,.7), 0 1px 0 #000; transform: translate(-50%, -50%); animation: eFloat 1.3s ease-out forwards; white-space: nowrap; }
  .econ-float.cost { color: #ff8a98; font-size: 12px; text-shadow: 0 1px 0 #000; } .econ-float.warn { color: #ff8a98; font-size: 12px; }
  @keyframes eFloat { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.7); } 15% { opacity: 1; transform: translate(-50%, -60%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -260%) scale(1); } }
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
  .econ-mini button { all: unset; cursor: pointer; color: #38e8e0; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; padding: 8px; }
  html.touch .econ-hud { top: calc(54px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); transform: none; font-size: 11px; } html.touch .econ-hud .eh { padding: 5px 9px; } html.touch .econ-hud .hide-t { display: none; }
  html.touch .econ-corp { top: calc(112px + env(safe-area-inset-top,0px)); left: max(12px, env(safe-area-inset-left,0px)); transform: none; }
  html.touch .econ-note { font-size: 14px; padding: 11px 14px; bottom: calc(150px + env(safe-area-inset-bottom,0px)); } html.touch .econ-note .say { font-size: 16px; }
  html.touch .econ-flash { top: calc(116px + env(safe-area-inset-top,0px)); }
  @media (max-width: 560px) { .econ-hud .hide-s { display: none; } }
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const hudEl = el('div', 'econ-hud'); hudEl.setAttribute('role', 'status'); hudEl.setAttribute('aria-label', 'City economy');
  hudEl.innerHTML = `<div class="eh scrip"><small>Scrip</small><b id="ehM">0</b><span class="rate" id="ehR">+0/min</span></div>
    <div class="eh"><small>Residents</small><b id="ehP">0</b></div>
    <div class="eh pw hide-t" id="ehPw"><small>Power</small><b id="ehPwV">0/0</b><div class="bar"><i id="ehPwB"></i></div></div>
    <div class="eh hide-s"><small id="ehTn">Next</small><b id="ehTv">0/100</b><div class="bar"><i id="ehTb"></i></div></div>
    <div class="eh hide-s" id="ehDm" hidden><small>Demand</small><div class="dm" id="ehDmV"></div></div>
    <button type="button" id="ehO" aria-haspopup="dialog">Office</button>`;
  document.body.appendChild(hudEl);
  const corpEl = el('div', 'econ-corp', `<button type="button" data-c="0">Factory</button><button type="button" data-c="1">Corps</button>`); corpEl.hidden = true; corpEl.setAttribute('role', 'group'); corpEl.setAttribute('aria-label', 'Industrial kind');
  document.body.appendChild(corpEl);
  corpEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.corp = b.dataset.c === '1'; corpSync(); save(); });
  const corpSync = () => { corpEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.c === '1') === !!st.corp))); corpEl.hidden = !(typeof S !== 'undefined' && S.zone === 'ind' && st.tier >= 3); };
  const flashEl = el('div', 'econ-flash'); flashEl.hidden = true; document.body.appendChild(flashEl);
  let flashT = 0; function flash(msg){ flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => flashEl.hidden = true, 2800); }
  const noteEl = el('div', 'econ-note'); noteEl.hidden = true; noteEl.setAttribute('role', 'status'); document.body.appendChild(noteEl);
  let noteT = 0, noteTut = false;
  function note(msg, ms = 5000){ if (noteTut) return flash(msg.split('\n')[0]); noteEl.innerHTML = ''; noteEl.append(el('span', 't', 'City office'), el('span', 'sub', '')); noteEl.lastChild.textContent = msg; noteEl.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { if (!noteTut) noteEl.hidden = true; }, ms); }
  E.note = note;

  /* ---------- the light-up: a pulse round the level that just lit, and the Scrip it paid rising off it ---------- */
  const _v = new THREE.Vector3();
  function screenOf(x, y, z){ try { _v.set(x, y, z).project(cam); if (_v.z > 1) return null; const r = viewRect(); return [r.left + (_v.x*.5 + .5)*r.width, r.top + (1 - (_v.y*.5 + .5))*r.height]; } catch (e) { return null; } }
  function floatText(x, y, z, text, cls = ''){ const p = screenOf(x, y, z); if (!p) return; const f = el('div', 'econ-float ' + cls); f.textContent = text; f.style.left = p[0] + 'px'; f.style.top = p[1] + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1400); }
  const ZCOL = { R: 0x38e8e0, C: 0xffb347, L: 0xff4fa3, I: 0xe8e03a, K: 0xe8e03a };
  const pulseGeo = new THREE.BoxGeometry(1, 1, 1), pulseEdge = new THREE.EdgesGeometry(pulseGeo), pulses = [];
  function pulseLevel(c, lit, z){
    if (typeof scene === 'undefined' || pulses.length > 8) return;
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = (!c.lift && lit > 1 && tops[lit - 2]) || (c.lift ? c.lift.y : CURB);
    const h = Math.max(.6, y1 - y0), w = (typeof SIDE !== 'undefined' ? SIDE : 3) + .15, col = ZCOL[z] || 0xffffff;
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
  function surge(c, lit, z, done){
    if (typeof scene === 'undefined' || surges.length > 5){ done(); return; }
    const tops = c.sectionTops || [], y1 = (!c.lift && tops[lit - 1]) || c.height || CURB + 2, y0 = c.lift ? c.lift.y : CURB;
    const h = Math.max(1, y1 - y0), w = (typeof SIDE !== 'undefined' ? SIDE : 3), R = w*.74, turns = Math.max(2, h/1.6), col = ZCOL[z] || 0xffffff;
    const root = new THREE.Group(); root.position.set(c.x, y0, c.z);
    const SEG = Math.round(40*turns), RAD = 5, strands = [];
    for (let s = 0; s < 3; s++){
      const ph = s*Math.PI*2/3, pts = [];
      for (let q = 0; q <= SEG; q++){ const u = q/SEG, a = ph + u*turns*Math.PI*2, j = q && q < SEG ? (Math.random() - .5)*.22 : 0;
        pts.push(new THREE.Vector3(Math.cos(a)*(R + j), u*h + (Math.random() - .5)*.1, Math.sin(a)*(R + j))); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, .085, RAD, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      const inner = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, .035, RAD, false), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      head.scale.set(1.1, 1.1, 1);
      for (const o of [outer, inner, head]){ o.layers.set(1); o.renderOrder = 998; o.frustumCulled = false; root.add(o); }
      strands.push({ outer, inner, head, curve });
    }
    const base = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    base.position.set(0, .1, 0); base.scale.set(w*2.2, w*2.2, 1); base.layers.set(1); base.renderOrder = 998; root.add(base);
    const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    top.position.set(0, h, 0); top.layers.set(1); top.renderOrder = 999; root.add(top);
    scene.add(root);
    surges.push({ root, strands, base, top, t0: performance.now(), per: SEG*RAD*6, SEG, h, w, done, fired: false });
    if (surges.length === 1) requestAnimationFrame(surgeTick);
  }
  const CLIMB = 750, FADE = 450;
  function surgeTick(){ const t = performance.now();
    for (let i = surges.length - 1; i >= 0; i--){ const s = surges[i], el2 = Math.max(0, t - s.t0);
      const k = Math.min(1, el2/CLIMB), head = k < 1 ? k*k*(3 - 2*k)*.85 + k*.15 : 1, tail = Math.max(0, head - .38), fk = Math.max(0, (el2 - CLIMB)/FADE);
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
        const e2 = Math.min(1, fk*1.4); s.top.material.opacity = 1 - e2; s.top.scale.setScalar(s.w*(1.5 + 3.5*e2));
      }
      if (fk >= 1){ scene.remove(s.root); s.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); surges.splice(i, 1); }
    }
    if (surges.length) requestAnimationFrame(surgeTick);
  }
  let lastBump = 0;
  E.onEv('light', d => {
    const b = B.get(keyOf(d.c)), z = b ? b.z : 'R', c = d.c, y = (!c.lift && c.sectionTops && c.sectionTops[d.lit - 1]) || c.height || CURB + 2;
    surge(c, d.lit, z, () => pulseLevel(c, d.lit, z));
    setTimeout(() => floatText(c.x, y + .6, c.z, '+' + fmt(d.pay) + ' Scrip'), CLIMB);
    try { if (typeof sfx !== 'undefined' && performance.now() - lastBump > 250) sfx.play('place'); } catch (e) {}
    const m = document.getElementById('ehM'); if (m && performance.now() - lastBump > 200){ lastBump = performance.now(); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
  });
  E.onEv('build', d => { if (!d || !d.c) return; const c = d.c; setTimeout(() => { floatText(c.x, (c.height || CURB) + .4, c.z, '−' + fmt(d.cost) + ' Scrip', 'cost');
    const b = B.get(keyOf(c)); if (b && b.isolated) { floatText(c.x, (c.height || CURB) + 1.4, c.z, 'Isolated', 'warn'); say('Isolated · nobody can reach it · connect it to the city with ground'); } }, 60); });

  let hudQ = false; const hudSoon = () => { if (hudQ) return; hudQ = true; requestAnimationFrame(() => { hudQ = false; hud(); }); };
  const perMin = v => fmt(v) + '/min';
  function hud(){
    const $ = id => document.getElementById(id);
    $('ehM').textContent = fmt(st.money); const r = $('ehR'); r.textContent = (R.rev >= 0 ? '+' : '') + perMin(R.rev); r.classList.toggle('neg', R.rev < 0);
    $('ehP').textContent = fmt(R.pop);
    const over = R.demandAll > R.supply; $('ehPw').classList.toggle('over', over); $('ehPwV').textContent = fmt(Math.min(R.used, R.supply)) + '/' + fmt(R.supply) + (R.constructing && R.constructing.length ? ' +' : '');
    $('ehPwB').style.width = (R.supply ? Math.min(100, 100*R.demandAll/R.supply) : 100) + '%';
    const nt = TIERS[Math.min(st.tier + 1, TIERS.length - 1)], doneAll = st.tier >= TIERS.length - 1;
    $('ehTn').textContent = doneAll ? TIERS[st.tier].name : 'Next · ' + nt.name;
    $('ehTv').textContent = doneAll ? 'complete' : fmt(R.pop) + '/' + fmt(nt.pop) + ' residents';
    const k = doneAll ? 1 : Math.min(1, R.pop/nt.pop, nt.inc ? R.rev/nt.inc : 1); $('ehTb').style.width = (k*100) + '%';
    const dm = $('ehDm'); dm.hidden = !built('wirenest');
    if (!dm.hidden){ const d = R.demandZ; $('ehDmV').innerHTML = ['R', 'C', 'I', 'L'].filter(z => z !== 'L' || st.tier >= 3).map(z => `<span class="${d[z] > 0 ? 'up' : d[z] < 0 ? 'dn' : ''}" title="${ZNAME[z]} demand">${z}${d[z] > 0 ? '▲' : d[z] < 0 ? '▼' : '·'}</span>`).join(''); }
    corpSync();
    if (!officeEl.hidden && (offT = (offT + 1) % 2) === 0) renderOffice();
  }
  let offT = 0;
  document.getElementById('ehO').addEventListener('click', () => toggleOffice());

  /* ---------- the City office: the next goal first, the rest folded away ---------- */
  const officeEl = el('aside', 'econ-office'); officeEl.hidden = true; officeEl.setAttribute('role', 'dialog'); officeEl.setAttribute('aria-label', 'City office'); document.body.appendChild(officeEl);
  function toggleOffice(open = officeEl.hidden){ officeEl.hidden = !open; if (open){ renderOffice(); E.emit('office'); const x = officeEl.querySelector('.x'); if (x) x.focus({ preventScroll: true }); } }
  E.office = toggleOffice;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !officeEl.hidden){ toggleOffice(false); e.stopPropagation(); } }, true);
  const openSec = { power: true };
  officeEl.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.sec) openSec[d.dataset.sec] = d.open; }, true);
  const sec = (key, title, body) => `<details data-sec="${key}" ${openSec[key] ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  function renderOffice(){
    const keepScroll = officeEl.scrollTop, out = [];
    out.push(`<header><h2>City office</h2><button class="x" type="button" aria-label="Close the City office">✕</button></header>`);
    out.push(`<div class="stats"><div><small>Scrip</small><b>${fmt(st.money)}</b></div><div><small>Per min</small><b>${fmt(R.rev)}</b></div><div><small>Residents</small><b>${fmt(R.pop)}</b></div></div>`);
    if (st.tier < TIERS.length - 1){ const t = TIERS[st.tier + 1];
      const m = (lab, a, b) => `<div class="meter"><div><span>${lab}</span><span>${fmt(Math.min(a, b))} / ${fmt(b)}</span></div><div class="bar"><i style="width:${Math.min(100, 100*a/b)}%"></i></div></div>`;
      out.push(`<div class="next"><small style="color:#9a92aa;letter-spacing:.14em;text-transform:uppercase;font-size:10px">Next classification</small><div class="nm">${t.name}</div><p>Unlocks ${t.opens}</p>${m('Residents', R.pop, t.pop)}${t.inc ? m('Scrip per min', R.rev, t.inc) : ''}${t.size ? m('Lit buildings', R.size, t.size) : ''}</div>`);
    } else out.push(`<div class="next"><div class="nm">Every classification reached</div><p>The coast is open through the Data Spire.</p></div>`);
    // power
    const cores = megaList('emitter');
    let pw = `<p>${fmt(R.used)} of ${fmt(R.supply)} in use${R.demandAll > R.supply ? ' · <span style="color:#ff8a98">' + fmt(R.demandAll - R.supply) + ' short</span>' : ''}. Closest buildings get power first; nothing past ${P.coreReach} plots.</p>`;
    cores.forEach((m, q) => { const s = coreState(m), ready = s.readyAt <= now();
      pw += `<div class="row"><div>Emitter Core ${q + 1}<small>${ready ? fmt(coreCapOf(m)) + ' power' : 'Charging · ' + fmtDur(s.readyAt - now())}</small></div>` +
        (ready ? `<button class="btn" data-up="${m.id}" ${st.tier < 1 ? 'disabled title="Opens at Registered"' : ''}>Upgrade · ${fmt(coreUpCost(m))}</button>` : `<button class="btn" data-mini="${m.id}" ${st.tier < 1 ? 'disabled title="Opens at Registered"' : ''}>Stabilize</button>`) + `</div>`; });
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
    if (b.dataset.upm) return E.upMega(b.dataset.upm);
    if (b.dataset.mini) return MINI.open(b.dataset.mini);
    if (b.dataset.auto){ st.auto = !st.auto; save(); return renderOffice(); }
    if (b.dataset.tut){ toggleOffice(false); return TUTE.replay(); }
  });

  /* ---------- what a building is doing: hover (mouse) or tap with no zone picked (touch) ---------- */
  function whyOf(b){
    if (b.isolated) return 'Isolated · nobody can reach it';
    if (b.coreD > P.coreReach) return 'No Emitter Core in reach';
    if (!b.powered) return 'Out of power · upgrade or add a core';
    if (b.floors > b.cap) return 'Over its Grade · top levels stay dark';
    if (b.z === 'R' && b.jobBand === 'far' && !b.station) return 'Too far from work';
    if ((b.z === 'R' || b.z === 'L') && b.ef < .5) return 'Few jobs nearby';
    if (b.z === 'L' && b.occ < .5 && b.lv < P.lvLuxMin + 10) return 'Grade too low for luxury';
    if (b.z === 'R' && b.corpNear && b.lv > P.lvPricey) return 'Priced out by corps';
    if (b.z === 'C' && b.occ < b.eff*.5) return 'Not enough shoppers nearby';
    if ((b.z === 'I' || b.z === 'K') && b.occ < b.eff*.6) return 'Short of workers';
    if (b.band === 'near') return 'Beside a core · poor air';
    return null;
  }
  function infoOf(c){
    const b = B.get(keyOf(c)); if (!b) return null;
    const why = whyOf(b);
    return { head: `${ZNAME[b.z]} · Grade ${gradeOf(b.lv)}`, lines: [`${b.lit} of ${b.floors} level${b.floors > 1 ? 's' : ''} lit · max ${b.cap}`, why ? '! ' + why : '✓ Doing well', b.floors < b.cap && b.powered && !b.isolated ? 'Next level · ' + fmt(upgradeCost(b.z, b.floors)) + ' Scrip' : null].filter(Boolean), bad: !!why };
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
  const MINI = (() => {
    const box = el('div', 'econ-mini'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Stabilize the core');
    box.innerHTML = `<div class="box"><div class="top"><span>Core stabilizer</span><span id="emHz">50.00 Hz</span></div><canvas id="emCv" width="300" height="330" aria-label="Frequency trace: tap or press Space to lift it"></canvas>
      <div class="foot"><span id="emSaved">0 s saved</span><button type="button" id="emClose">Done</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('#emCv'), g = cv.getContext('2d');
    let on = false, id = null, y = .5, v = 0, t = 0, saved = 0, maxCut = 0, raf = 0, last = 0, trail = [];
    function open(coreId){
      const m = megas.get(coreId); if (!m) return; const s = coreState(m); if (s.readyAt <= now()) return;
      id = coreId; s.full = s.full || (s.readyAt - now()); s.cut = s.cut || 0; maxCut = s.full*.5 - s.cut;
      if (maxCut <= 500){ note('This core is as stable as it gets'); return; }
      on = true; box.hidden = false; y = .5; v = 0; t = 0; saved = 0; trail = []; last = performance.now(); raf = requestAnimationFrame(loop); E.emit('mini');
    }
    function close(){ on = false; box.hidden = true; cancelAnimationFrame(raf); if (id){ const m = megas.get(id); if (m){ const s = coreState(m); s.cut = (s.cut || 0) + saved*1000; } } save(); renderOffice(); }
    const lift = () => { if (on) v -= .55; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); lift(); });
    addEventListener('keydown', e => { if (!on) return; if (e.code === 'Space'){ e.preventDefault(); e.stopPropagation(); lift(); } if (e.key === 'Escape'){ e.stopPropagation(); close(); } }, true);
    box.querySelector('#emClose').addEventListener('click', close);
    function loop(ts){
      if (!on) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(.05, (ts - last)/1000); last = ts; t += dt;
      const grav = .9 + t*.025, band = Math.max(.08, .26 - t*.004), mid = .5 + Math.sin(t*.7)*.12*Math.min(1, t/20);
      v += grav*dt; v *= .985; y += v*dt; if (y < 0){ y = 0; v = 0; } if (y > 1){ y = 1; v = 0; }
      const ok = Math.abs(y - mid) < band/2;
      if (ok){ const cut = dt*2; if (saved*1000 + cut*1000 <= maxCut){ saved += cut; E.cutBuild(id, cut*1000); } }
      trail.push(y); if (trail.length > 150) trail.shift();
      const W = cv.width, H = cv.height;
      g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(56,232,224,.12)'; g.fillRect(0, (mid - band/2)*H, W, band*H);
      g.strokeStyle = 'rgba(56,232,224,.5)'; g.strokeRect(.5, (mid - band/2)*H + .5, W - 1, band*H - 1);
      g.strokeStyle = 'rgba(255,255,255,.06)'; for (let q = 1; q < 6; q++){ g.beginPath(); g.moveTo(0, q*H/6); g.lineTo(W, q*H/6); g.stroke(); }
      g.strokeStyle = ok ? '#5affa8' : '#ff5a6e'; g.lineWidth = 2; g.beginPath(); trail.forEach((q, k) => { const x = W - (trail.length - k)*2; k ? g.lineTo(x, q*H) : g.moveTo(x, q*H); }); g.stroke();
      g.fillStyle = ok ? '#5affa8' : '#ff5a6e'; g.beginPath(); g.arc(W - 2, y*H, 5, 0, Math.PI*2); g.fill();
      document.getElementById('emHz').textContent = (50 + (mid - y)*4).toFixed(2) + ' Hz';
      document.getElementById('emSaved').textContent = saved.toFixed(1) + ' s saved' + (saved*1000 >= maxCut - 300 ? ' · limit reached' : '');
      const m = megas.get(id); if (!m || coreReady(m)) { close(); note('Core online'); }
    }
    return { open };
  })();

  /* ---------- the tutorial: one short thing at a time, the button to use glowing, the city answering at once (no dimming, no spotlight) ---------- */
  const TUTE = (() => {
    const tap = TOUCHY ? 'Tap' : 'Click';
    const zoneBtn = z => () => document.querySelector(TOUCHY ? '.zones' : `.zone[data-zone="${z}"]`);
    const litCount = () => Object.values(st.best).reduce((s, n) => s + n, 0);
    const homesStacked = () => { for (const b of B.values()) if (b.z === 'R' && b.floors >= 2) return true; return false; };
    const beats = [
      { say: 'Your goal: grow this sector into a city.', sub: `Climb six classifications, from ${TIERS[0].name} to ${TIERS[TIERS.length - 1].name}, by housing people and earning Scrip. Each one unlocks new buildings.`, next: true },
      { say: 'This tower is your Emitter Core.', sub: 'It powers every building within 9 plots. No power, no lights, no people. Build near it, but not right against it: the air there is poor.', next: true },
      { say: `Pick Residential, then ${tap.toLowerCase()} 3 plots near the core.`, sub: 'A plot or two away is best: right beside the core the air is poor.', target: zoneBtn('low'), count: () => [countZone('R'), 3], done: () => countZone('R') >= 3 },
      { say: 'Pick Industrial and place a factory.', sub: 'It gives your residents jobs.', target: zoneBtn('ind'), done: () => countZone('I') >= 1 },
      { say: 'Pick Commercial and place a shop.', sub: 'Shops earn the most Scrip.', target: zoneBtn('mid'), done: () => countZone('C') >= 1 },
      { say: `Pick Residential and ${tap.toLowerCase()} a lit home's roof to stack a level.`, sub: 'Taller homes hold more people. If it says the Grade is too low, try a home further from the core.', target: zoneBtn('low'), done: homesStacked, nextAfter: 40 },
      { say: `Next goal: ${TIERS[1].name}.`, sub: `Reach ${fmt(TIERS[1].pop)} residents. Megastructures in the Buildings menu boost what's around them: the Psycho-Acoustic Grid makes nearby buildings earn more. ${TOUCHY ? 'Tap' : 'Hover'} any building to see what it needs.`, next: true, last: true, target: () => document.getElementById('ehO') },
    ];
    let k = st.tut.done ? beats.length : Math.min(st.tut.step || 0, beats.length), lit = null;
    const unpulse = () => { if (lit){ lit.classList.remove('econ-pulse'); lit = null; } };
    function show(){
      unpulse();
      if (k >= beats.length){ noteTut = false; noteEl.hidden = true; return; }
      const b = beats[k]; noteTut = true; clearTimeout(noteT);
      noteEl.innerHTML = ''; noteEl.className = 'econ-note';
      const say = el('span', 'say'); say.textContent = b.say; const sub = el('span', 'sub'); sub.textContent = b.sub;
      const prog = el('div', 'prog'); beats.forEach((_, q) => prog.append(el('i', q <= k ? 'on' : '')));
      noteEl.append(say, sub); if (b.count){ const n = el('span', 'sub'); n.dataset.count = '1'; noteEl.append(n); }
      const row = el('div', 'row'); row.style.justifyContent = 'space-between'; row.append(prog);
      const btns = el('div', ''); const skip = el('button', '', 'Skip'); skip.type = 'button'; skip.onclick = finish; btns.append(skip);
      if (b.next){ const go = el('button', 'go', b.last ? 'Got it' : 'Next'); go.type = 'button'; go.onclick = advance; btns.append(go); }
      row.append(btns); noteEl.append(row); noteEl.hidden = false; shownAt = Date.now(); refresh();
    }
    let shownAt = 0;
    function refresh(){
      const b = beats[k]; if (!b || noteEl.hidden) return;
      if (b.nextAfter && Date.now() - shownAt > b.nextAfter*1000 && !noteEl.querySelector('button.go')){ const go = el('button', 'go', 'Next'); go.type = 'button'; go.onclick = advance; const bt = noteEl.querySelector('.row > div:last-child'); if (bt) bt.append(go); }
      const n = noteEl.querySelector('[data-count]'); if (n && b.count){ const [a, m] = b.count(); n.textContent = Math.min(a, m) + ' / ' + m; }
      const t = b.target && b.target(); if (t !== lit){ unpulse(); if (t){ t.classList.add('econ-pulse'); lit = t; } }
    }
    function advance(){ k++; st.tut.step = k; if (k >= beats.length) st.tut.done = true; save(); noteEl.classList.add('done-flash'); setTimeout(show, k >= beats.length ? 0 : 260); }
    function finish(){ k = beats.length; st.tut.done = true; st.tut.step = k; save(); show(); }
    for (const ev of ['build', 'office']) E.onEv(ev, d => { const b = beats[k]; if (b && b.ev === ev && (!b.test || b.test(d))) advance(); });
    setInterval(() => { const b = beats[k]; if (!b) return; if (b.done && b.done()) advance(); else refresh(); }, 400);
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
