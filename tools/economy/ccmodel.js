// A Cookie Clicker style model of Economy mode: every (zone, level) pair is a "building type". Each unit costs 15% more than the last of
// its type; taller levels cost much more and make much more. Zones lean on each other (jobs, shoppers, workers). x2 upgrades unlock with counts.
// A greedy player buys the best value it can afford, at most one action every ACT seconds. Prints when each classification is reached.
const P = {
  zones: { R: { cost: 15, prod: 6, ppl: 24 }, I: { cost: 90, prod: 30, jobs: 30 }, C: { cost: 220, prod: 80, jobs: 10 }, L: { cost: 9000, prod: 2000, ppl: 9 }, K: { cost: 70000, prod: 14000, jobs: 12 } },
  lvCost: 9, lvProd: 5.5, grow: 1.15,
  pwr: { R: 1, I: 3, C: 2, L: 3, K: 4 },
  core: { cost: 150, grow: 2.4, cap: 40, upCost: 400, upGrow: 3.2, upGain: .5 },
  tile: { cost: 5, grow: 1.02 },
  upAt: [1, 5, 25, 50, 100, 150, 200, 250], upMul: [10, 50, 500, 5e3, 5e4, 5e5, 5e6, 5e7],
  light: 20,    // a lit level pays this many seconds of its own output
  sat: .65, ACT: 2.5, start: 60,
};
const ZK = Object.keys(P.zones);
const maxLv = tier => tier < 2 ? 2 : tier < 4 ? 3 : 4;
const zoneOpen = (z, tier) => z === 'L' ? tier >= 3 : z === 'K' ? tier >= 4 : true;
const MEGAS = (JSON.parse(process.argv[2] || '{}').MEGAS) || [ // tier, cost, global multiplier
  { k: 'grid', tier: 0, cost: 400, mul: 1.10 }, { k: 'square', tier: 1, cost: 6e3, mul: 1.10 }, { k: 'wire', tier: 1, cost: 15e3, mul: 1.08 },
  { k: 'police', tier: 2, cost: 2e5, mul: 1.12 }, { k: 'market', tier: 2, cost: 4e5, mul: 1.15 }, { k: 'foundry', tier: 2, cost: 6e5, mul: 1.15 },
  { k: 'bath', tier: 3, cost: 8e6, mul: 1.12 }, { k: 'club', tier: 3, cost: 1.5e7, mul: 1.15 }, { k: 'lidar', tier: 3, cost: 2.5e7, mul: 1.1 },
  { k: 'mall', tier: 4, cost: 4e8, mul: 1.2 }, { k: 'logi', tier: 4, cost: 7e8, mul: 1.2 }, { k: 'green', tier: 4, cost: 1e9, mul: 1.15 },
  { k: 'spire', tier: 5, cost: 2e10, mul: 1.25 }, { k: 'pagoda', tier: 5, cost: 4e10, mul: 1.25 },
];
const OV = JSON.parse(process.argv[2] || '{}'); for (const k in OV) P[k] = OV[k];
const TIERS = OV.TIERS || [
  { name: 'Registered', pop: 100, inc: 150, sat: 50, pwr: 60, emp: 50, lit: 6 },
  { name: 'Zoned', pop: 350, inc: 2500, sat: 55, pwr: 200, emp: 60, lit: 15 },
  { name: 'Chartered', pop: 800, inc: 6e4, sat: 58, pwr: 450, emp: 65, lit: 30 },
  { name: 'Incorporated', pop: 1500, inc: 1.5e6, sat: 60, pwr: 900, emp: 70, lit: 50 },
  { name: 'Sovereign', pop: 2500, inc: 4e7, sat: 62, pwr: 1600, emp: 72, lit: 75 },
  { name: 'The coast', pop: 4000, inc: 1e9, sat: 65, pwr: 2600, emp: 75, lit: 100 },
];
function run(verbose){
  const S = { t: 0, money: P.start, n: {}, up: {}, cores: 1, coreUp: 0, megas: new Set(), tier: 0, tiles: 9, bldgs: 0, times: [], earned: 0 };
  for (const z of ZK){ S.n[z] = [0, 0, 0, 0]; S.up[z] = 0; }
  const levels = z => S.n[z].reduce((a, b) => a + b, 0);
  const supply = () => S.cores*P.core.cap*(1 + P.core.upGain*S.coreUp);
  const need = () => ZK.reduce((s, z) => s + levels(z)*P.pwr[z], 0);
  const megaMul = () => [...S.megas].reduce((m, k) => m*MEGAS.find(x => x.k === k).mul, 1);
  function stats(){
    const res = levels('R')*P.zones.R.ppl + levels('L')*P.zones.L.ppl;
    const jobs = levels('I')*P.zones.I.jobs + levels('C')*P.zones.C.jobs + levels('K')*P.zones.K.jobs + S.cores*10;
    const emp = res ? Math.min(1, jobs/res) : 1, staff = jobs ? Math.min(1, res/jobs) : 1, shop = levels('C') ? Math.min(1, res/(levels('C')*45)) : 1;
    const pw = Math.min(1, supply()/Math.max(1, need()));
    const sat = P.sat*100;
    const mul = { R: (.4 + .6*emp)*(.6 + .8*P.sat), L: (.4 + .6*emp)*(.6 + .8*P.sat), I: .3 + .7*staff, K: .3 + .7*staff, C: .3 + .7*shop };
    let inc = 0; const unit = {};
    for (const z of ZK){ unit[z] = []; for (let L = 0; L < 4; L++){ const u = P.zones[z].prod*Math.pow(P.lvProd, L)*Math.pow(2, S.up[z])*mul[z]*megaMul()*pw; unit[z][L] = u; inc += S.n[z][L]*u; } }
    return { res, jobs, emp, staff, shop, pw, sat, inc, unit, lit: S.bldgs };
  }
  const costOf = (z, L) => P.zones[z].cost*Math.pow(P.lvCost, L)*Math.pow(P.grow, S.n[z][L]) + (L === 0 ? P.tile.cost*Math.pow(P.tile.grow, S.tiles) : 0);
  let nextAct = 0;
  for (S.t = 0; S.t < 4*3600 && S.tier < TIERS.length; S.t++){
    const st = stats();
    if (verbose && S.t % 600 === 0) if (S.t % 1200 === 0) console.log('  t', S.t/60, 'inc', fmt(st.inc), 'money', fmt(S.money), 'tier', S.tier, 'res', Math.round(st.res), 'pw', st.pw.toFixed(2), 'emp', st.emp.toFixed(2));
    S.money += st.inc/60; S.earned += st.inc/60;
    // classification
    const T = TIERS[S.tier];
    const forced = P.at && S.t >= P.at[S.tier]*60, met = !P.at && st.res >= T.pop && st.inc >= T.inc && st.sat >= T.sat && supply() >= T.pwr && st.emp*100 >= T.emp && S.bldgs >= T.lit;
    if (forced || met){ if (forced) console.log('  @', P.at[S.tier], 'min: res', Math.round(st.res), 'inc', fmt(st.inc), 'pwr', Math.round(supply()), 'emp', Math.round(st.emp*100), 'bldgs', S.bldgs, 'levels', ZK.map(z => levels(z)).reduce((a,b)=>a+b,0)); S.times.push([T.name, S.t]); S.tier++; if (verbose) console.log(`${(S.t/60).toFixed(1)} min  ${T.name}  inc ${fmt(st.inc)}/min  money ${fmt(S.money)} res ${Math.round(st.res)} lv ${ZK.map(z => z + levels(z)).join(' ')} up ${ZK.map(z => S.up[z]).join('')} cores ${S.cores}+${S.coreUp} megas ${S.megas.size}`); }
    if (S.t < nextAct) continue;
    // options: value = income gained per Scrip
    const opts = [];
    const base = st.inc;
    for (const z of ZK){ if (!zoneOpen(z, S.tier)) continue; for (let L = 0; L < maxLv(S.tier); L++){
      if (L > 0 && S.n[z][L] >= S.n[z][L - 1]) continue;   // (a level needs a building under it)
      const c = costOf(z, L); S.n[z][L]++; const g = stats().inc - base + st.unit[z][L]*P.light/60*0; S.n[z][L]--;
      const lb = st.unit[z][L]*P.light/60 + (P.flat || 0)*Math.pow(P.lvCost, L); opts.push({ c, g: g + lb/300, do(){ S.n[z][L]++; if (L === 0){ S.tiles++; S.bldgs++; } S.money += lb; } }); } }
    for (const z of ZK){ const k = S.up[z]; if (k >= P.upAt.length || levels(z) < P.upAt[k]) continue; const c = P.zones[z].cost*P.upMul[k];
      opts.push({ c, g: Σ(z, st)*1, do(){ S.up[z]++; } }); }
    for (const m of MEGAS) if (m.tier <= S.tier && !S.megas.has(m.k)) opts.push({ c: m.cost, g: base*(m.mul - 1), do(){ S.megas.add(m.k); } });
    const cc = P.core.cost*Math.pow(P.core.grow, S.cores - 1), uc = P.core.upCost*Math.pow(P.core.upGrow, S.coreUp);
    const pwShort = need() > supply()*.9 || (base > 0 && supply() < TIERS[S.tier].pwr && S.money > 3*Math.min(cc, uc));
    if (pwShort) opts.push({ c: Math.min(cc, uc), g: Infinity, do(){ if (cc <= uc) S.cores++; else S.coreUp++; } });
    const aff = opts.filter(o => o.c <= S.money);
    if (!aff.length) continue;
    aff.sort((a, b) => b.g/b.c - a.g/a.c);
    // a sensible player: don't spend on something now if a much better deal is within a short wait
    const best = opts.slice().sort((a, b) => b.g/b.c - a.g/a.c)[0];
    const wait = best.c <= S.money ? 0 : (best.c - S.money)/(base/60 || 1);
    const pick = wait > 0 && wait < 40 ? null : aff[0];
    if (!pick) continue;
    S.money -= pick.c; pick.do(); nextAct = S.t + P.ACT;
  }
  return S;
  function Σ(z, st){ let s = 0; for (let L = 0; L < 4; L++) s += S.n[z][L]*st.unit[z][L]; return s; }
}
function fmt(n){ const u = ['', 'K', 'M', 'B', 'T', 'Qa']; let k = 0; while (Math.abs(n) >= 1000 && k < u.length - 1){ n /= 1000; k++; } return (k ? n.toFixed(2) : Math.round(n)) + u[k]; }
const S = run(true);
console.log('end', (S.t/60).toFixed(1), 'min tier', S.tier);
