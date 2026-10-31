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
  // are in levels (E and D 1, C 2, B 3, A 4: the model's 2/3, 3, 6, 8 and 12 floors). Building a level is what "click a roof to stack" already does.
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
    caps: [1, 1, 2, 3, 4], capIndustry: 2,
    prodMid: .95, prodFar: .8,
    accessMid: .8, accessFar: .3, accessMetro: .95, jobNear: 3, jobMid: 7, shopR: 3, stationR: 2, corpR: 3, factoryR: 2,
    fill: 20, fillCheap: 10,   // (per hour, toward the target: a new level fills in a few minutes; the week's pace is set by power, Scrip and play time, not by this)
    baseline: .6, baselineH: 24, stipend: 15,
    offlineCapH: 8,
    startMoney: 800,
    metroTile: 25, metroStop: 150, hwTile: 120, hwFinish: 1500,
  };
  // the megastructures: the tier each unlocks at, what it costs, the power it draws, the jobs it gives (per level for the Sky mall), and its reach in plots
  const MEGA = {
    radio:      { tier: 0, cost: 0,     pwr: 4,  jobs: 6,  reach: 7, upReach: 2, upCost: 500, upGrowth: 1.6, what: 'Productivity +15% in reach' },
    emitter:    { tier: 0, cost: 250,   pwr: 0,  jobs: 10, what: 'Power for everything in reach' },
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
    { name: 'Registered', pop: 100, inc: 0, opens: 'Wire Nest, Town square, core upgrades and the stabilizer' },
    { name: 'Zoned', pop: 350, inc: 600, opens: 'Metro, Police station, Market Plaza, Foundry' },
    { name: 'Chartered', pop: 800, inc: 2200, opens: 'Luxury, Corps, Bath House, Neon Dome, LIDAR Array' },
    { name: 'Incorporated', pop: 1400, inc: 5500, opens: 'Sky highways, Sky mall, Logistics Hub, Hydroponic Farm' },
    { name: 'Sovereign', pop: 2200, inc: 12000, opens: 'Data Spire, Cloud Pagoda' },
    { name: 'The coast', pop: 3200, inc: 20000, size: 100, opens: 'The coast, through the Data Spire' },
  ];
  const GRADES = ['E', 'D', 'C', 'B', 'A'];
  const ZNAME = { R: 'Residential', C: 'Commercial', L: 'Luxury', I: 'Industrial', K: 'Corps' };
  const ZK = { low: 'R', mid: 'C', high: 'L', ind: 'I' };
  const TOUCHY = typeof TOUCH !== 'undefined' && TOUCH.on;

  /* ---------- state ---------- */
  if (!st || !st.on) return Object.assign(E, { dark: () => null, coastOpen: () => true, tapInfo: () => false, menuText: () => null, transit: () => null, freshState });
  E.on = true;
  document.documentElement.classList.add('econ');
  st = Object.assign(freshState(), st);
  function freshState(){ return { on: true, v: 1, money: P.startMoney, tier: 0, fresh: true, last: Date.now(), peak: 0, best: {}, occ: {}, cores: {}, ups: {}, auto: false, tut: { step: 0, done: false }, stock: 0, corp: false, metroPaid: {}, hwPaid: {} }; }
  const save = () => { st.last = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  addEventListener('pagehide', save); addEventListener('beforeunload', save);

  /* ---------- reading the city ---------- */
  const keyOf = c => c.i + ',' + c.j;
  const zoneOf = c => { const s = (c.below && c.below.length ? c.below[0] : c.sections[0]); if (!s) return null; const z = ZK[s.zone]; return z === 'I' && (s.corp || c.sections.some(x => x.corp)) ? 'K' : z; };
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
  function nextCoreBuildMs(){ const n = megaList('emitter').length; return Math.min(P.coreBuildMaxH*3600e3, P.coreBuildMin*60e3*Math.pow(P.coreBuildGrowth, Math.max(0, n - 1))); }
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
    const rows = [];
    let order = 0;
    for (const c of list){
      const z = zoneOf(c), k = keyOf(c); if (!z) continue;
      let coreD = Infinity; for (const m of cores){ const d = megaD(c.i, c.j, m); if (d < coreD) coreD = d; }
      const b = { c, z, k, floors: floorsOf(c), coreD, order: order++ };
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
      const cheap = b.lv < P.lvCheap;
      let occ = st.occ[b.k] || 0;
      let r = target >= occ ? P.fill + (cheap ? P.fillCheap : 0) : 6; if (b.z !== 'R' && b.z !== 'L') r = 20;
      occ += (target - occ)*Math.min(1, r*dtH); if (occ > b.floors) occ = b.floors;
      st.occ[b.k] = Math.round(occ*1000)/1000; b.occ = occ;
      const lit = Math.floor(occ + .3), best = st.best[b.k] || 0;   // (a level lights once it's about two thirds full)
      if (lit > best){ bonus += (lit - best)*P.bonus[b.z]*(b.z === 'R' && cheap ? P.cheapBonus : 1); st.best[b.k] = lit; if (live) E.emit('light', { c: b.c, lit }); }
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
  // world.js isDarkPlot asks: true = the whole building's lights off (core.js DARK), a number = every light above that height off, null = as before
  const darkQ = [];
  E.dark = c => { const d = darkCalc(c); c._econDark = d; return d; };
  function darkCalc(c){
    if (!isBld(c)) return null;
    const b = B.get(keyOf(c)); if (!b) return null;
    if (!b.powered) return true;
    if (b.lit >= b.floors || c.lift || c.below) return null;
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
  function say(msg){ const h = document.getElementById('modeHint'); if (h) h.textContent = msg; if (TOUCHY) note(msg, 3200); else flash(msg); }
  const zoneNow = zone => ZK[zone] === 'I' && st.corp && st.tier >= 3 ? 'K' : ZK[zone];
  function zoneLocked(z){ if ((z === 'L' || z === 'K') && st.tier < 3){ say((z === 'L' ? 'Luxury' : 'Corps') + ' opens at Chartered (' + fmt(TIERS[3].pop) + ' residents, ' + fmt(TIERS[3].inc) + ' Scrip/h)'); return true; } return false; }
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
    const c = orig(i, j, zone); if (c){ charge(g.cost); markCorp(c, g); if (g.z === 'K') refresh([c]); E.emit('build', { c, z: g.z, fresh: true }); }
    return c;
  });
  wrap('addSection', function (orig, c, zone, opt = {}){
    const fresh = !c.sections.length, g = fresh ? gateNew(zone) : gateUp(c, zone, opt); if (!g) return;
    const n0 = c.sections.length, f0 = floorsOf(c), r = orig(c, zone, opt);
    if (c.sections.length > n0){ charge(g.cost); markCorp(c, g); E.emit('build', { c, z: g.z, fresh, f0 }); }
    return r;
  });
  for (const nm of ['addLift', 'addFloatPod', 'addPodDown', 'addBelowUp']) wrap(nm, function (orig, c, a, b, d){
    const zone = nm === 'addLift' || nm === 'addFloatPod' ? b : a;
    const fresh = !c.sections.length && !(c.below && c.below.length), g = fresh ? gateNew(zone) : gateUp(c, zone, null); if (!g) return null;
    const n0 = c.sections.length + (c.below ? c.below.length : 0), r = orig(c, a, b, d);
    if (c.sections.length + (c.below ? c.below.length : 0) > n0){ charge(g.cost); markCorp(c, g); E.emit('build', { c, z: g.z, fresh }); }
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

  // on load: the table filled before the city is drawn, so each building is made with its lights as they were (not lit, then darkened)
  wrap('load', function (orig){ const ok = orig(); if (ok) try { step(1e-9, false); } catch (e) { console.warn('econ load', e); } return ok; });

  /* ---------- the clock ---------- */
  let lastT = now(), saveT = 0, booted = false;
  function boot(){
    booted = true;
    if (st.fresh){
      // a new sector: the tutorial starts with an Emitter Core and the Psycho-Acoustic Grid standing
      st.fresh = false; st.money = P.startMoney;
      const c0 = cells.get('0,0') || [...cells.values()][0];
      for (const kind of ['emitter', 'radio']) try { const blk = findMegaBlock(kind, c0); if (blk){ const m = spawnMegaAt(kind, blk); if (m && kind === 'emitter') coreState(m).readyAt = 0; } } catch (e) { console.warn('econ starter', e); }
      try { save(); if (typeof window.save === 'function') window.save(); } catch (e) {}
      onTier(0, false);
      st.last = now();
    } else onTier(st.tier, false);
    // time away: up to 8 hours count
    const away = Math.min(P.offlineCapH*3600e3, Math.max(0, now() - (st.last || now())));
    if (away > 60e3){
      const m0 = st.money, p0 = (step(1/3600, false), R.pop); let left = away/3600e3;
      while (left > 0){ const d = Math.min(left, 2/60); step(d, false); left -= d; }
      const dm = st.money - m0, dp = R.pop - p0;
      setTimeout(() => note('While you were away (' + fmtDur(away) + ') · +' + fmt(dm) + ' Scrip' + (dp > 1 ? ' · +' + fmt(dp) + ' residents' : ''), 7000), 2500);
    }
    lastT = now(); save();
  }
  const fmtDur = ms => ms >= 3600e3 ? (ms/3600e3).toFixed(1) + ' h' : Math.round(ms/60e3) + ' min';
  function tick(){
    if (typeof cells === 'undefined') return;
    if (!booted){ if (cells.size < 1) return; boot(); }
    const t = now(); let dt = (t - lastT)/1000; lastT = t;
    if (dt > 30){ dt = Math.min(dt, P.offlineCapH*3600); let left = dt/3600; while (left > 0){ const d = Math.min(left, 2/60); step(d, false); left -= d; } }
    else step(Math.max(0, dt)/3600, true);
    darkSync(); autoTick(); hud();
    if ((saveT += dt) > 10){ saveT = 0; save(); }
    if (typeof WIRELOG !== 'undefined' && WIRELOG.say && built('wirenest')) demandLine();
  }
  setInterval(tick, 1000);
  let demT = 40;
  function demandLine(){
    if (--demT > 0) return; demT = 45 + (Math.random()*30 | 0);
    const d = R.demandZ, names = { R: 'Residential', C: 'Commercial', I: 'Industrial', L: 'Luxury' };
    const up = Object.keys(d).filter(k => d[k] > 0), lo = Object.keys(d).filter(k => d[k] < 0);
    if (up.length) WIRELOG.say('CITY', names[up[Math.random()*up.length | 0]] + ' demand · elevated');
    else if (lo.length) WIRELOG.say('CITY', names[lo[0]] + ' demand · low');
    else WIRELOG.say('CITY', 'Zone demand · nominal · ' + fmt(R.rev) + ' Scrip/h');
  }

  /* ---------- the interface ---------- */
  const css = `
  .econ-hud { --e-bg: rgba(12,10,20,.9); --e-line: rgba(255,179,71,.38); --e-hair: rgba(255,255,255,.1); --e-txt: #efe6d6; --e-dim: #8f879e; --e-acc: #ffb347; --e-good: #5affa8; --e-bad: #ff5a6e;
    position: fixed; z-index: 4; top: calc(10px + env(safe-area-inset-top,0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: stretch; gap: 0;
    font: 11px/1.25 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--e-txt); background: var(--e-bg); border: 1px solid var(--e-line); letter-spacing: .02em; max-width: calc(100vw - 24px); }
  .econ-hud .eh { padding: 5px 10px; display: flex; flex-direction: column; justify-content: center; gap: 1px; border-right: 1px solid var(--e-hair); min-width: 0; white-space: nowrap; }
  .econ-hud .eh:last-child { border-right: 0; }
  .econ-hud [hidden] { display: none !important; }
  .econ-hud small { color: var(--e-dim); font-size: 8.5px; letter-spacing: .16em; text-transform: uppercase; }
  .econ-hud b { font-weight: 500; font-variant-numeric: tabular-nums; }
  .econ-hud .scrip b { color: var(--e-acc); font-size: 13px; } .econ-hud .rate { color: var(--e-good); font-size: 10px; } .econ-hud .rate.neg { color: var(--e-bad); }
  .econ-hud .bar { height: 3px; background: var(--e-hair); width: 100%; min-width: 64px; } .econ-hud .bar i { display: block; height: 100%; background: var(--e-acc); }
  .econ-hud .pw.over b { color: var(--e-bad); } .econ-hud .pw .bar i { background: #38e8e0; } .econ-hud .pw.over .bar i { background: var(--e-bad); }
  .econ-hud .dm { display: flex; gap: 6px; } .econ-hud .dm span { color: var(--e-dim); } .econ-hud .dm span.up { color: var(--e-good); } .econ-hud .dm span.dn { color: var(--e-bad); }
  .econ-hud button { all: unset; cursor: pointer; padding: 0 12px; color: var(--e-acc); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
  .econ-hud button:hover, .econ-hud button:focus-visible { color: #fff; background: rgba(255,179,71,.12); }
  .econ-corp { position: fixed; z-index: 4; top: calc(62px + env(safe-area-inset-top,0px)); left: 50%; transform: translateX(-50%); display: flex; font: 10px/1 'JetBrains Mono', monospace; border: 1px solid rgba(232,224,58,.5); background: rgba(12,10,20,.9); }
  .econ-corp[hidden] { display: none; } .econ-corp button { all: unset; cursor: pointer; padding: 7px 12px; color: #a9a2b6; letter-spacing: .12em; text-transform: uppercase; }
  .econ-corp button[aria-pressed="true"] { color: #12101a; background: #e8e03a; }
  .econ-flash { position: fixed; z-index: 6; left: 50%; top: calc(64px + env(safe-area-inset-top,0px)); transform: translateX(-50%); font: 11px/1.4 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.94); border: 1px solid rgba(255,90,110,.5); padding: 6px 12px; pointer-events: none; max-width: calc(100vw - 32px); text-align: center; }
  .econ-flash[hidden] { display: none; }
  .econ-note { position: fixed; z-index: 7; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom,0px)); transform: translateX(-50%); width: min(440px, calc(100vw - 32px)); font: 12px/1.45 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.95); border: 1px solid rgba(255,179,71,.45); border-left: 3px solid #ffb347; padding: 10px 14px; white-space: pre-line; }
  .econ-note[hidden] { display: none; } .econ-note .t { color: #ffb347; font-size: 9px; letter-spacing: .2em; text-transform: uppercase; display: block; margin-bottom: 4px; }
  .econ-note .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; } .econ-note button { all: unset; cursor: pointer; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #8f879e; padding: 6px 8px; }
  .econ-note button.go { color: #12101a; background: #ffb347; } .econ-note button:focus-visible { outline: 1px solid #ffb347; }
  .econ-tip { position: fixed; z-index: 61; pointer-events: none; font: 10.5px/1.4 'JetBrains Mono', monospace; color: #efe6d6; background: rgba(12,10,20,.92); border: 1px solid rgba(255,179,71,.35); padding: 5px 8px; transform: translate(16px, 10px); white-space: pre; display: none; }
  .econ-office { position: fixed; z-index: 30; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); overflow-y: auto; background: rgba(12,10,20,.97); border-left: 1px solid rgba(255,179,71,.35); color: #efe6d6;
    font: 12px/1.5 'JetBrains Mono', ui-monospace, monospace; padding: calc(14px + env(safe-area-inset-top,0px)) max(16px, env(safe-area-inset-right,0px)) calc(24px + env(safe-area-inset-bottom,0px)) 16px; }
  .econ-office[hidden] { display: none; }
  .econ-office header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .econ-office h2 { margin: 0; font-size: 12px; letter-spacing: .24em; text-transform: uppercase; color: #ffb347; font-weight: 500; }
  .econ-office h3 { margin: 18px 0 6px; font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; color: #8f879e; font-weight: 500; border-top: 1px solid rgba(255,255,255,.08); padding-top: 12px; }
  .econ-office .x { all: unset; cursor: pointer; width: 44px; height: 44px; display: grid; place-items: center; color: #8f879e; font-size: 16px; } .econ-office .x:hover { color: #fff; }
  .econ-office table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; } .econ-office td { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: top; } .econ-office td:last-child { text-align: right; white-space: nowrap; padding-left: 8px; }
  .econ-office .tier.done td { color: #8f879e; } .econ-office .tier.cur td { color: #ffb347; } .econ-office .tier small { display: block; color: #8f879e; font-size: 10px; }
  .econ-office .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.05); } .econ-office .row small { display: block; color: #8f879e; font-size: 10px; }
  .econ-office .btn { all: unset; cursor: pointer; padding: 6px 10px; border: 1px solid rgba(255,179,71,.5); color: #ffb347; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
  .econ-office .btn:hover, .econ-office .btn:focus-visible { background: rgba(255,179,71,.14); color: #fff; } .econ-office .btn[disabled] { opacity: .4; cursor: default; }
  .econ-office p { margin: 4px 0; color: #b9b0c8; }
  .econ-mini { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(6,5,10,.72); }
  .econ-mini[hidden] { display: none; }
  .econ-mini .box { background: #0d0a16; border: 1px solid rgba(56,232,224,.5); padding: 14px; font: 11px/1.4 'JetBrains Mono', monospace; color: #efe6d6; width: min(340px, calc(100vw - 32px)); }
  .econ-mini canvas { display: block; width: 100%; aspect-ratio: 1/1.1; background: #07060c; touch-action: none; cursor: pointer; }
  .econ-mini .top { display: flex; justify-content: space-between; margin-bottom: 8px; color: #38e8e0; letter-spacing: .14em; text-transform: uppercase; font-size: 10px; }
  .econ-mini .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: #8f879e; }
  .econ-mini button { all: unset; cursor: pointer; color: #38e8e0; letter-spacing: .14em; text-transform: uppercase; font-size: 10px; padding: 8px; }
  html.touch .econ-hud { top: calc(6px + env(safe-area-inset-top,0px)); font-size: 10px; } html.touch .econ-hud .eh { padding: 4px 7px; } html.touch .econ-hud .hide-t { display: none; }
  @media (max-width: 560px) { .econ-hud .hide-s { display: none; } }
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = css; document.head.appendChild(styleEl);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const hudEl = el('div', 'econ-hud'); hudEl.setAttribute('role', 'status'); hudEl.setAttribute('aria-label', 'City economy');
  hudEl.innerHTML = `<div class="eh scrip"><small>Scrip</small><b id="ehM">0</b><span class="rate" id="ehR">+0/h</span></div>
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
  let flashT = 0; function flash(msg){ flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => flashEl.hidden = true, 2600); }
  const noteEl = el('div', 'econ-note'); noteEl.hidden = true; noteEl.setAttribute('role', 'status'); document.body.appendChild(noteEl);
  let noteT = 0, noteTut = false;
  function note(msg, ms = 5000){ if (noteTut) return flash(msg.split('\n')[0]); noteEl.innerHTML = ''; noteEl.append(el('span', 't', 'City office'), document.createTextNode(msg)); noteEl.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => { if (!noteTut) noteEl.hidden = true; }, ms); }
  E.note = note;
  let hudQ = false; const hudSoon = () => { if (hudQ) return; hudQ = true; requestAnimationFrame(() => { hudQ = false; hud(); }); };
  function hud(){
    const $ = id => document.getElementById(id);
    $('ehM').textContent = fmt(st.money); const r = $('ehR'); r.textContent = (R.rev >= 0 ? '+' : '') + fmt(R.rev) + '/h'; r.classList.toggle('neg', R.rev < 0);
    $('ehP').textContent = fmt(R.pop);
    const over = R.demandAll > R.supply; $('ehPw').classList.toggle('over', over); $('ehPwV').textContent = fmt(Math.min(R.used, R.supply)) + '/' + fmt(R.supply) + (R.constructing && R.constructing.length ? ' +' : '');
    $('ehPwB').style.width = (R.supply ? Math.min(100, 100*R.demandAll/R.supply) : 100) + '%';
    const nt = TIERS[Math.min(st.tier + 1, TIERS.length - 1)], doneAll = st.tier >= TIERS.length - 1;
    $('ehTn').textContent = doneAll ? TIERS[st.tier].name : 'Next · ' + nt.name;
    $('ehTv').textContent = doneAll ? 'complete' : fmt(R.pop) + '/' + fmt(nt.pop) + (nt.inc ? ' · ' + fmt(R.rev) + '/' + fmt(nt.inc) : '');
    const k = doneAll ? 1 : Math.min(1, R.pop/nt.pop, nt.inc ? R.rev/nt.inc : 1); $('ehTb').style.width = (k*100) + '%';
    const dm = $('ehDm'); dm.hidden = !built('wirenest');
    if (!dm.hidden){ const d = R.demandZ; $('ehDmV').innerHTML = ['R', 'C', 'I', 'L'].filter(z => z !== 'L' || st.tier >= 3).map(z => `<span class="${d[z] > 0 ? 'up' : d[z] < 0 ? 'dn' : ''}" title="${ZNAME[z]} demand">${z}${d[z] > 0 ? '▲' : d[z] < 0 ? '▼' : '·'}</span>`).join(''); }
    corpSync();
    if (!officeEl.hidden && (offT = (offT + 1) % 3) === 0) renderOffice();
  }
  let offT = 0;
  document.getElementById('ehO').addEventListener('click', () => toggleOffice());

  /* ---------- the City office ---------- */
  const officeEl = el('aside', 'econ-office'); officeEl.hidden = true; officeEl.setAttribute('role', 'dialog'); officeEl.setAttribute('aria-label', 'City office'); document.body.appendChild(officeEl);
  function toggleOffice(open = officeEl.hidden){ officeEl.hidden = !open; if (open){ renderOffice(); E.emit('office'); const x = officeEl.querySelector('.x'); if (x) x.focus({ preventScroll: true }); } }
  E.office = toggleOffice;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !officeEl.hidden){ toggleOffice(false); e.stopPropagation(); } }, true);
  function renderOffice(){
    const keepScroll = officeEl.scrollTop;
    const rows = [];
    rows.push(`<header><h2>City office</h2><button class="x" type="button" aria-label="Close the City office">✕</button></header>`);
    rows.push(`<p>Classified <b style="color:#ffb347">${TIERS[st.tier].name}</b> · ${fmt(st.money)} Scrip · ${fmt(R.rev)} Scrip/h · ${fmt(R.pop)} residents · ${Math.round(R.emp*100)}% employed</p>`);
    rows.push(`<h3>Classification</h3><table>` + TIERS.slice(1).map((t, q) => { const n = q + 1, cls = n <= st.tier ? 'done' : n === st.tier + 1 ? 'cur' : '';
      return `<tr class="tier ${cls}"><td>${n <= st.tier ? '✓ ' : ''}${t.name}<small>${t.opens}</small></td><td>${fmt(t.pop)} res${t.inc ? '<br>' + fmt(t.inc) + '/h' : ''}${t.size ? '<br>' + t.size + ' lit bldgs' : ''}</td></tr>`; }).join('') + `</table>`);
    // power
    const cores = megaList('emitter');
    rows.push(`<h3>Power · ${fmt(R.used)} of ${fmt(R.supply)} in use${R.demandAll > R.supply ? ' · ' + fmt(R.demandAll - R.supply) + ' short' : ''}</h3>`);
    rows.push(`<p>Buildings nearest a core get power first. Within ${P.coreNear} plots the air is poor (Sector Grade drops); past ${P.coreMid} the lights flicker and output falls; past ${P.coreReach} there's no power at all.</p>`);
    cores.forEach((m, q) => { const s = coreState(m), ready = s.readyAt <= now();
      rows.push(`<div class="row"><div>Emitter Core ${q + 1}<small>${ready ? fmt(coreCapOf(m)) + ' power · upgrades ' + s.up : 'Charging · ' + fmtDur(s.readyAt - now()) + ' left'}</small></div>` +
        (ready ? `<button class="btn" data-up="${m.id}" ${st.tier < 1 ? 'disabled title="Opens at Registered"' : ''}>Upgrade · ${fmt(coreUpCost(m))}</button>` : `<button class="btn" data-mini="${m.id}" ${st.tier < 1 ? 'disabled title="Opens at Registered"' : ''}>Stabilize</button>`) + `</div>`); });
    rows.push(`<p>Next core: ${fmt(nextCoreCost())} Scrip, ${fmtDur(nextCoreBuildMs())} to charge. Place it from Buildings.</p>`);
    // megastructures
    rows.push(`<h3>Megastructures</h3>`);
    for (const kind of Object.keys(MEGA)){ if (kind === 'emitter' || !MEGA_TYPES[kind]) continue; const d = MEGA[kind], has = built(kind), open = d.tier <= st.tier;
      let act = '';
      if (has && d.upCost) act = `<button class="btn" data-upm="${kind}" ${kind === 'radio' && st.tier < 1 ? 'disabled' : ''}>Reach +${d.upReach} · ${fmt(megaUpCost(kind))}</button>`;
      else if (has && kind === 'mall'){ const m = megaList('mall')[0]; act = m && m.levels < 3 ? `<span>Level ${m.levels} · stack from the roof</span>` : '<span>Level 3</span>'; }
      else if (has) act = '<span>Built</span>';
      else act = open ? `<span>${fmt(d.cost)} Scrip</span>` : `<span style="color:#8f879e">${TIERS[d.tier].name}</span>`;
      rows.push(`<div class="row"><div>${MEGA_TYPES[kind].name}<small>${d.what}${d.reach ? ' · reach ' + megaReachKind(kind) + ' plots' : ''}</small></div>${act}</div>`); }
    if (built('spire')) rows.push(`<div class="row"><div>Overseer auto-upgrades<small>The cheapest full building gets its next level while you can afford it</small></div><button class="btn" data-auto="1" aria-pressed="${!!st.auto}">${st.auto ? 'On' : 'Off'}</button></div>`);
    // money
    rows.push(`<h3>Income per hour</h3><table>` + Object.entries(R.breakdown || {}).filter(([, v]) => Math.abs(v) >= .5).map(([k, v]) => `<tr><td>${k}</td><td>${v < 0 ? '−' : ''}${fmt(Math.abs(v))}</td></tr>`).join('') + `</table>`);
    rows.push(`<h3>How it works</h3><p>Every building costs Scrip and pays a burst the first time each of its levels lights up. Click or tap a building's roof to stack a level. Sector Grade (E to A) sets how many levels a plot may hold: cores and factories lower it; shops, stations, corps and the Police station raise it. Hover or tap a building to see why it's struggling.</p>`);
    rows.push(`<div class="row"><div>Tutorial</div><button class="btn" data-tut="1">Replay</button></div>`);
    officeEl.innerHTML = rows.join('');
    officeEl.scrollTop = keepScroll;
  }
  const megaReachKind = kind => { const m = megaList(kind)[0]; return m ? megaReach(m) : MEGA[kind].reach; };
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
  function infoOf(c){
    const b = B.get(keyOf(c)); if (!b) return null;
    const lines = [`${ZNAME[b.z]} · Grade ${gradeOf(b.lv)} · ${b.lit}/${b.floors} levels lit · cap ${b.cap}`];
    let why = null;
    if (b.coreD > P.coreReach) why = 'No Emitter Core in reach';
    else if (!b.powered) why = 'No power left · upgrade or add a core';
    else if (b.floors > b.cap) why = 'Over its Grade · top levels stay dark';
    else if (b.z === 'R' && b.jobBand === 'far' && !b.station) why = 'Too far from work · a metro stop helps';
    else if ((b.z === 'R' || b.z === 'L') && b.ef < .5) why = 'Few jobs in reach';
    else if (b.z === 'L' && b.occ < .5 && b.lv < P.lvLuxMin + 10) why = 'Grade too low for luxury';
    else if (b.z === 'R' && b.corpNear && b.lv > P.lvPricey) why = 'Priced out by corps nearby';
    else if (b.z === 'C' && b.occ < b.eff*.5) why = 'Not enough spending nearby';
    else if ((b.z === 'I' || b.z === 'K') && b.occ < b.eff*.6) why = 'Short of workers';
    else if (b.band === 'far') why = 'Far from a core · output down';
    else if (b.band === 'near') why = 'Beside a core · poor air';
    if (why) lines.push(why);
    if (b.earn > 0) lines.push('+' + fmt(b.earn) + ' Scrip/h in taxes');
    if (b.floors < b.cap && b.powered) lines.push('Next level: ' + fmt(upgradeCost(b.z, b.floors)) + ' Scrip');
    return lines.join('\n');
  }
  const tipEl = el('div', 'econ-tip'); document.body.appendChild(tipEl);
  let tipAt = 0;
  if (!TOUCHY) addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const t = performance.now(); if (t - tipAt < 120) return; tipAt = t;
    const cv = document.getElementById('view') || (typeof canvas !== 'undefined' ? canvas : null);
    if (!cv || e.target !== cv || (typeof S !== 'undefined' && S.zone) || (typeof megaPick !== 'undefined' && megaPick) || (typeof hwMode !== 'undefined' && (hwMode || mtMode))){ tipEl.style.display = 'none'; return; }
    let pk = null; try { pk = pickAt(e.clientX, e.clientY); } catch (er) {}
    const c = pk && pk.c && !pk.c.mega ? pk.c : null, txt = c ? infoOf(c) : null;
    if (!txt){ tipEl.style.display = 'none'; return; }
    tipEl.textContent = txt; tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px'; tipEl.style.display = 'block';
  }, { passive: true });
  E.tapInfo = pk => { const c = pk && pk.c && !pk.c.mega ? pk.c : null; const txt = c ? infoOf(c) : null; if (!txt) return false; note(txt, 4500); return true; };
  E.menuText = kind => { const d = MEGA[kind]; if (!d) return null; if (kind === 'emitter') return fmt(nextCoreCost()) + ' Scrip · ' + fmtDur(nextCoreBuildMs()) + ' to charge'; if (built(kind)) return kind === 'mall' ? 'Built · stack from its roof' : 'Built'; return fmt(d.cost) + ' Scrip · ' + d.what; };

  /* ---------- the stabilizer: an optional mini game that shortens a core's charge ---------- */
  // Keep the grid frequency in the safe band: the trace sinks, a tap or Space lifts it. Every second inside the band takes 15 seconds off the
  // charge; the band narrows and the pull grows the longer it runs. A core's charge can be cut by half at most this way.
  const MINI = (() => {
    const box = el('div', 'econ-mini'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Stabilize the core');
    box.innerHTML = `<div class="box"><div class="top"><span>Core stabilizer</span><span id="emHz">50.00 Hz</span></div><canvas id="emCv" width="300" height="330" aria-label="Frequency trace: tap or press Space to lift it"></canvas>
      <div class="foot"><span id="emSaved">0 s saved</span><button type="button" id="emClose">Done</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('#emCv'), g = cv.getContext('2d');
    let on = false, id = null, y = .5, v = 0, t = 0, inBand = 0, saved = 0, maxCut = 0, raf = 0, last = 0, trail = [];
    function open(coreId){
      const m = megas.get(coreId); if (!m) return; const s = coreState(m); if (s.readyAt <= now()) return;
      id = coreId; s.full = s.full || (s.readyAt - now()); s.cut = s.cut || 0; maxCut = s.full*.5 - s.cut;
      if (maxCut <= 1000){ note('This core is as stable as it gets · it charges on its own'); return; }
      on = true; box.hidden = false; y = .5; v = 0; t = 0; inBand = 0; saved = 0; trail = []; last = performance.now(); raf = requestAnimationFrame(loop); E.emit('mini');
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
      if (ok){ inBand += dt; const cut = dt*15; if (saved*1000 + cut*1000 <= maxCut){ saved += cut; E.cutBuild(id, cut*1000); } }
      trail.push(y); if (trail.length > 150) trail.shift();
      const W = cv.width, H = cv.height;
      g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(56,232,224,.12)'; g.fillRect(0, (mid - band/2)*H, W, band*H);
      g.strokeStyle = 'rgba(56,232,224,.5)'; g.strokeRect(.5, (mid - band/2)*H + .5, W - 1, band*H - 1);
      g.strokeStyle = 'rgba(255,255,255,.06)'; for (let q = 1; q < 6; q++){ g.beginPath(); g.moveTo(0, q*H/6); g.lineTo(W, q*H/6); g.stroke(); }
      g.strokeStyle = ok ? '#5affa8' : '#ff5a6e'; g.lineWidth = 2; g.beginPath(); trail.forEach((q, k) => { const x = W - (trail.length - k)*2; k ? g.lineTo(x, q*H) : g.moveTo(x, q*H); }); g.stroke();
      g.fillStyle = ok ? '#5affa8' : '#ff5a6e'; g.beginPath(); g.arc(W - 2, y*H, 5, 0, Math.PI*2); g.fill();
      document.getElementById('emHz').textContent = (50 + (mid - y)*4).toFixed(2) + ' Hz';
      document.getElementById('emSaved').textContent = Math.round(saved) + ' s saved' + (saved*1000 >= maxCut - 500 ? ' · limit reached' : '');
      const m = megas.get(id); if (!m || coreReady(m)) { close(); note('Core online'); }
    }
    return { open };
  })();

  /* ---------- the tutorial: a few notes that wait for the player to do each thing (no dimming, no spotlight) ---------- */
  const TUTE = (() => {
    const tap = TOUCHY ? 'Tap' : 'Click', tapL = tap.toLowerCase();
    const beats = [
      { say: `This is your sector. Everything here runs on Scrip.\nPick Residential and ${tapL} three empty plots near the Emitter Core to build homes.`, done: () => countZone('R') >= 3 },
      { say: `Residents need work. Pick Industrial and place a factory near the homes.`, done: () => countZone('I') >= 1 },
      { say: `Wages need somewhere to go. Pick Commercial and place a shop.`, done: () => countZone('C') >= 1 },
      { say: `Levels light up as people move in, and each pays Scrip the first time it lights. Wait for a few to light.`, done: () => Object.values(st.best).reduce((s, n) => s + n, 0) >= 3 },
      { say: `Grow up instead of out: with Residential picked, ${tapL} the roof of a lit home to stack a level. Sector Grade caps how tall it can go: build away from the core's poor air.`, ev: 'build', test: d => d && !d.fresh },
      { say: `Power comes from the Emitter Core. Build past its reach and the lights stay off. The bar at the top shows what's in use.`, next: true },
      { say: `Open the City office (top of the screen) to see what each classification unlocks.`, ev: 'office' },
      { say: `Reach ${fmt(TIERS[1].pop)} residents to be Registered. ${TOUCHY ? 'Tap' : 'Hover'} any building to see what it needs. The city is yours.`, next: true, last: true },
    ];
    let k = st.tut.done ? beats.length : (st.tut.step || 0), poll = 0;
    function show(){
      if (k >= beats.length){ noteTut = false; noteEl.hidden = true; return; }
      const b = beats[k]; noteTut = true; clearTimeout(noteT);
      noteEl.innerHTML = ''; noteEl.append(el('span', 't', 'Operator note · ' + (k + 1) + '/' + beats.length), document.createTextNode(b.say));
      const row = el('div', 'row'); const skip = el('button', '', 'Skip tutorial'); skip.type = 'button'; skip.onclick = finish; row.append(skip);
      if (b.next){ const go = el('button', 'go', b.last ? 'Done' : 'Next'); go.type = 'button'; go.onclick = advance; row.append(go); }
      noteEl.append(row); noteEl.hidden = false;
    }
    function advance(){ k++; st.tut.step = k; if (k >= beats.length) st.tut.done = true; save(); show(); }
    function finish(){ k = beats.length; st.tut.done = true; st.tut.step = k; save(); show(); }
    for (const ev of ['build', 'office']) E.onEv(ev, d => { const b = beats[k]; if (b && b.ev === ev && (!b.test || b.test(d))) advance(); });
    setInterval(() => { const b = beats[k]; if (b && b.done && b.done()) advance(); }, 800);
    return { start(){ if (k < beats.length) setTimeout(show, 1800); }, replay(){ k = 0; st.tut = { step: 0, done: false }; save(); show(); } };
  })();
  setTimeout(() => TUTE.start(), 0);

  /* ---------- for tests and the console ---------- */
  E.freshState = freshState; E.state = () => st; E.P = P; E.MEGA = MEGA; E.TIERS = TIERS; E.save = save; E.step = step; E.building = k => B.get(k); E.info = infoOf;
  E.dev = { money(n){ st.money += n; hud(); }, tier(t){ st.tier = Math.max(0, Math.min(TIERS.length - 1, t)); onTier(st.tier, true); hud(); }, run(h){ let left = h; while (left > 0){ const d = Math.min(left, 2/60); step(d, false); left -= d; } darkSync(); hud(); } };
  return E;
})();
window.ECON = ECON;
