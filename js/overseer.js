// Neon Terrarium: the Data Spire's city ledger. Double-click the Data Spire and the city glitches, a curtain of falling
// glyphs closes over it, and the Spire's view boots: a full-screen ledger of the city the player is building, in the
// Spire's own night-ops style (warm black, bone and amber, signal red for police matters, a pale teal only for transit;
// chamfered panels with coded tabs, ruler ticks, an angular display face). At its heart a top-down map: every plot,
// the megastructures, highways and metro lines, where people are gathered right now (an amber heat), and where the
// police incidents happened (numbered red pins, matched in the list beside it). Around it: population and who's awake,
// floors by zone, growth over the days played (from the ledger, cityledger.js), the busiest places, transit, police,
// markets and nightlife. All read from the city as it stands when the view opens (the city holds while it's open).
// The first time, the High Overseer asks whether to remember the coast: yes ("Accessing") switches the television
// off and the coast on (coast.html). After that first visit the question no longer pops up: the coast is a box at the
// side, ACCESS whenever the player likes. Esc or CLOSE: back to the city. While open the city stops drawing (O.hold).
'use strict';
const OVERSEER = (() => {
  const O = { open: false, hold: false };
  const ACCESS_KEY = 'neonIsland.coastAccessed';
  const css = `
  #spire { --bg: #0b0907; --ink: #ebe1cc; --dim: #8d8170; --faint: #3a3127; --hair: #251f18; --amb: #f3a53a; --amb2: #ffd08a; --red: #ff5b45; --teal: #86d4c6;
    position: fixed; inset: 0; z-index: 60; color: var(--ink); background: var(--bg); overflow: hidden; user-select: none;
    font: 10.5px/1.4 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .03em;
    display: grid; grid-template-columns: 286px minmax(0, 1fr) 308px; grid-template-rows: 46px minmax(0, 1fr) 164px; gap: 8px; padding: 10px; }
  #spire * { box-sizing: border-box; }
  #spire::before { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(rgba(235,225,204,.05) 1px, transparent 1.2px) 0 0 / 14px 14px, radial-gradient(120% 90% at 50% 40%, transparent 50%, rgba(0,0,0,.6) 100%); }
  #spire .hd, #spire .disp { font-family: 'Chakra Petch', 'JetBrains Mono', sans-serif; }
  #spire .amb { color: var(--amb); } #spire .red { color: var(--red); } #spire .dim { color: var(--dim); } #spire .teal { color: var(--teal); } #spire b { color: var(--ink); font-weight: 600; }
  #spire .blink { animation: spBlink 1.1s steps(2) infinite; } @keyframes spBlink { 50% { opacity: .25; } }
  /* the top bar: no boxes, one rule, a hatched band under the name */
  #spire .top { grid-column: 1 / -1; position: relative; display: flex; align-items: center; gap: 18px; padding: 0 4px; border-bottom: 1px solid var(--faint); }
  #spire .top::after { content: ''; position: absolute; left: 0; bottom: -4px; width: 286px; height: 3px; background: repeating-linear-gradient(-45deg, var(--amb) 0 3px, transparent 3px 7px); opacity: .55; }
  #spire .brand { display: flex; align-items: baseline; gap: 10px; }
  #spire .brand .hd { font-size: 21px; font-weight: 600; letter-spacing: .18em; color: var(--ink); }
  #spire .brand small { font-size: 9px; letter-spacing: .26em; color: var(--amb); }
  #spire .top .mid { margin: 0 auto; display: flex; align-items: baseline; gap: 14px; }
  #spire .top .clock { font-size: 26px; font-weight: 600; letter-spacing: .06em; color: var(--amb2); }
  #spire .top .mid span { font-size: 9.5px; letter-spacing: .2em; color: var(--dim); }
  #spire .close { font: 600 11px/1 'Chakra Petch', sans-serif; letter-spacing: .24em; color: var(--ink); background: transparent; border: 1px solid var(--faint); padding: 7px 12px; cursor: pointer;
    clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px); }
  #spire .close:hover, #spire .close:focus-visible { border-color: var(--amb); color: var(--amb); outline: none; }
  /* panels: a chamfered corner, a coded tab, ruler ticks along the foot */
  #spire .pn { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: rgba(20,16,12,.72); border: 1px solid var(--faint);
    clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px); padding: 26px 10px 12px; }
  #spire .pn::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 5px; pointer-events: none;
    background: repeating-linear-gradient(90deg, var(--faint) 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, var(--dim) 0 1px, transparent 1px 40px); opacity: .7; }
  #spire .pn > .tab { position: absolute; left: 0; right: 0; top: 0; height: 20px; display: flex; align-items: center; gap: 8px; padding: 0 9px 0 16px; border-bottom: 1px solid var(--hair); }
  #spire .pn > .tab::before { content: ''; position: absolute; left: 6px; top: 6px; width: 3px; height: 8px; background: var(--amb); }
  #spire .pn > .tab code { font: 9px 'JetBrains Mono', monospace; color: var(--bg); background: var(--amb); padding: 0 4px; letter-spacing: .05em; }
  #spire .pn > .tab .hd { font-size: 11px; font-weight: 600; letter-spacing: .2em; color: var(--ink); }
  #spire .pn > .tab .m { margin-left: auto; font-size: 8.5px; letter-spacing: .16em; color: var(--dim); white-space: nowrap; }
  #spire .col { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  #spire .col > .pn { flex: 1; }
  #spire .big { font: 600 40px/1 'Chakra Petch', sans-serif; letter-spacing: .02em; color: var(--ink); }
  #spire .unit { font-size: 9px; letter-spacing: .22em; color: var(--dim); margin-left: 6px; }
  #spire .kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; font-size: 10px; } #spire .kv > :nth-child(odd) { color: var(--dim); letter-spacing: .1em; } #spire .kv > :nth-child(even) { text-align: right; }
  /* a meter: blocks, filled in amber */
  #spire .meter { display: flex; gap: 2px; height: 8px; margin: 7px 0 6px; } #spire .meter i { flex: 1; background: var(--faint); } #spire .meter i.on { background: var(--amb); } #spire .meter i.sl { background: #5a4a35; }
  #spire .bars { display: grid; gap: 5px; }
  #spire .bar { display: grid; grid-template-columns: 74px minmax(0, 1fr) 42px; align-items: center; gap: 8px; font-size: 9.5px; }
  #spire .bar > span:first-child { color: var(--dim); letter-spacing: .1em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #spire .bar .tr { position: relative; height: 7px; background: repeating-linear-gradient(90deg, var(--hair) 0 1px, transparent 1px 6px); border-bottom: 1px solid var(--faint); }
  #spire .bar .tr i { position: absolute; left: 0; top: 0; bottom: 1px; background: var(--amb); }
  #spire .bar > span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  #spire .bar.teal .tr i { background: var(--teal); } #spire .bar.wide { grid-template-columns: 170px minmax(0, 1fr) 34px; }
  #spire .spark { display: grid; grid-template-columns: 62px minmax(0, 1fr) 52px; align-items: center; gap: 8px; height: 26px; font-size: 9.5px; }
  #spire .spark > span:first-child { color: var(--dim); letter-spacing: .12em; }
  #spire .spark canvas { width: 100%; height: 22px; display: block; }
  #spire .spark > span:last-child { text-align: right; } #spire .spark em { display: block; font-style: normal; font-size: 8.5px; color: var(--amb); }
  /* the map */
  #spire .map { padding: 20px 0 0; }
  #spire .map canvas.mp { position: absolute; left: 0; top: 20px; width: 100%; height: calc(100% - 20px); }
  #spire .legend { position: absolute; left: 10px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px 12px; max-width: 70%; font-size: 8.5px; letter-spacing: .14em; color: var(--dim); background: rgba(11,9,7,.78); padding: 5px 8px; border-left: 2px solid var(--amb); }
  #spire .legend span { display: flex; align-items: center; gap: 5px; } #spire .legend i { display: inline-block; width: 8px; height: 8px; }
  /* incidents */
  #spire .inc { display: grid; gap: 0; }
  #spire .inc .it { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 5px 0; border-bottom: 1px dashed var(--hair); }
  #spire .inc .n { display: grid; place-items: center; width: 17px; height: 17px; background: var(--red); color: #1a0703; font: 600 10px/1 'Chakra Petch', sans-serif; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
  #spire .inc .it.old .n { background: #7a3328; color: var(--ink); }
  #spire .inc .t1 { color: var(--ink); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #spire .inc .t2 { color: var(--dim); font-size: 9px; letter-spacing: .06em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #spire .inc .w { color: var(--dim); font-size: 9px; text-align: right; white-space: nowrap; }
  #spire .empty { color: var(--dim); font-size: 10px; line-height: 1.6; padding: 6px 0; }
  /* the bottom row */
  #spire .bot { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, .85fr); gap: 8px; min-height: 0; }
  #spire .coast .disp { font-size: 15px; font-weight: 600; letter-spacing: .14em; margin: 2px 0 4px; }
  #spire .coast p { margin: 0 0 9px; color: var(--dim); font-size: 9.5px; line-height: 1.5; }
  #spire .acc { font: 600 12px/1 'Chakra Petch', sans-serif; letter-spacing: .3em; color: var(--bg); background: var(--amb); border: 0; padding: 9px 14px 9px 16px; cursor: pointer;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
  #spire .acc:hover, #spire .acc:focus-visible { background: var(--amb2); outline: none; }
  /* the question (the first time) */
  #spire .ask { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, 92%); z-index: 3; background: rgba(11,9,7,.96); border: 1px solid var(--amb);
    clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); padding: 18px 20px 26px; box-shadow: 0 0 0 9999px rgba(11,9,7,.45); }
  #spire .ask .k { font-size: 9px; letter-spacing: .3em; color: var(--amb); }
  #spire .ask h1 { margin: 6px 0 2px; font: 600 28px/1.05 'Chakra Petch', sans-serif; letter-spacing: .14em; color: var(--ink); text-shadow: 2px 0 rgba(255,91,69,.35), -2px 0 rgba(134,212,198,.3); }
  #spire .ask h1.glitch { animation: spGl 3s infinite; }
  @keyframes spGl { 0%, 92%, 100% { transform: none; clip-path: none; } 93% { transform: translate(-3px, 1px); clip-path: inset(10% 0 55% 0); } 95% { transform: translate(3px, -1px); clip-path: inset(50% 0 12% 0); } }
  #spire .ask .sub { font-size: 9px; letter-spacing: .24em; color: var(--dim); margin-bottom: 14px; }
  #spire .ask p { margin: 0 0 18px; font-size: 12px; line-height: 1.6; color: var(--ink); min-height: 4.8em; }
  #spire .ask p .cur { display: inline-block; width: .6em; height: 1em; background: var(--amb); vertical-align: -2px; animation: spBlink .8s steps(2) infinite; }
  #spire .ask .btns { display: flex; gap: 12px; }
  #spire .ask button { flex: 1; position: relative; font: 600 13px/1 'Chakra Petch', sans-serif; letter-spacing: .4em; padding: 11px 0 11px .4em; cursor: pointer; background: transparent; color: var(--amb); border: 1px solid var(--amb); }
  #spire .ask button.no { color: var(--ink); border-color: var(--faint); }
  #spire .ask button:hover, #spire .ask button:focus-visible { background: var(--amb); color: var(--bg); outline: none; }
  #spire .ask button.no:hover, #spire .ask button.no:focus-visible { background: var(--ink); color: var(--bg); }
  #spire .ask button small { position: absolute; left: 0; right: 0; bottom: -15px; font: 8px 'JetBrains Mono', monospace; letter-spacing: .3em; color: var(--dim); }
  /* in and out */
  #spire .boot { animation: spIn .5s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes spIn { 0% { clip-path: inset(0 100% 0 0); opacity: 0; } 100% { clip-path: inset(0 0 0 0); opacity: 1; } }
  #spire.leave { animation: spOut .5s steps(6) forwards; }
  @keyframes spOut { 30% { filter: hue-rotate(60deg) contrast(1.8); transform: translateX(-8px) skewX(-5deg); } 60% { clip-path: inset(40% 0 35% 0); transform: translateX(10px); } 100% { clip-path: inset(50% 0 50% 0); opacity: 0; } }
  @media (max-width: 1100px) { #spire { grid-template-columns: 240px minmax(0, 1fr) 260px; } #spire .bot { grid-template-columns: repeat(2, minmax(0, 1fr)); } #spire { grid-template-rows: 46px minmax(0, 1fr) 300px; } }
  @media (max-width: 760px) { #spire { display: block; overflow-y: auto; } #spire > *, #spire .col, #spire .bot { display: block; margin-bottom: 8px; } #spire .pn { min-height: 150px; margin-bottom: 8px; } #spire .map { height: 60vh; } #spire .top { height: 46px; } }
  /* the city, glitching before the curtain */
  canvas.ovs-glitch { animation: ovsCity .7s steps(8) both; }
  @keyframes ovsCity { 0% { filter: none; transform: none; } 20% { filter: saturate(2.2) contrast(1.4) hue-rotate(25deg) drop-shadow(4px 0 0 rgba(255,0,70,.6)); transform: translate(-6px, 0); }
    45% { filter: invert(.15) saturate(2.6) hue-rotate(-40deg) drop-shadow(-5px 0 0 rgba(0,255,220,.6)); transform: translate(7px, 2px) skewX(3deg); }
    70% { filter: contrast(2.2) brightness(1.4) hue-rotate(80deg); transform: translate(-3px, -2px); } 100% { filter: brightness(.5) contrast(1.6); transform: none; } }
  #ovsCurtain { position: fixed; inset: 0; z-index: 59; pointer-events: none; }
  #ovsBars { position: fixed; inset: 0; z-index: 58; pointer-events: none; mix-blend-mode: screen;
    background: repeating-linear-gradient(0deg, rgba(255,181,71,.0) 0 18px, rgba(255,181,71,.14) 18px 20px, rgba(0,255,220,.0) 20px 46px, rgba(120,255,230,.1) 46px 47px); animation: ovsBarsMove .7s linear both; }
  @keyframes ovsBarsMove { from { background-position: 0 0; opacity: 0; } 20% { opacity: 1; } to { background-position: 0 220px; opacity: .8; } }
  `;
  let built = false, root = null, raf = 0, last = 0, keyH = null, typingT = 0, resizeH = null, t0 = 0, D = null;
  const HEX = '0123456789ABCDEF', GLY = 'アイウエオカキクケコサシスセソ01#%&*+=<>/\\[]{}';
  const $ = (q) => root.querySelector(q);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const p2 = n => String(Math.floor(n)).padStart(2, '0');
  const hm = h => { h = ((h % 24) + 24) % 24; return p2(h) + ':' + p2((h % 1)*60); };
  const safe = (f, d) => { try { const v = f(); return v === undefined || Number.isNaN(v) ? d : v; } catch (e) { return d; } };
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const accessed = () => { try { return localStorage.getItem(ACCESS_KEY); } catch (e) { return null; } };
  function build(){
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    if (!document.querySelector('link[href*="Chakra+Petch"]')){ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&display=swap'; document.head.appendChild(l); }
    built = true;
  }

  /* ---------- reading the city (it holds still while the view is open) ---------- */
  function read(){
    const hour = safe(() => S.hour, 12), day = safe(() => STORY.dayOf(STORY.clock), 1), sleeps = typeof asleep === 'function';
    const plots = [], megs = [], hw = [], mt = new Set();
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    const grow = (i, j) => { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; };
    const zf = { low: 0, mid: 0, high: 0, ind: 0 };
    safe(() => { for (const c of cells.values()){ grow(c.i, c.j); if (c.mega) continue; const z = {}; for (const s of c.sections){ z[s.zone] = (z[s.zone] || 0) + 1; if (zf[s.zone] !== undefined) zf[s.zone]++; }
      plots.push({ i: c.i, j: c.j, lv: c.sections.length, zone: Object.keys(z).sort((a, b) => z[b] - z[a])[0] || null }); } });
    safe(() => { for (const m of megas.values()){ const a = Math.round(m.x/LOT - (m.w - 1)/2), b = Math.round(m.z/LOT - (m.h - 1)/2); megs.push({ m, i: a, j: b, w: m.w, h: m.h, name: (MEGA_TYPES[m.kind] || {}).name || m.kind }); grow(a, b); grow(a + m.w - 1, b + m.h - 1); } });
    safe(() => { for (const h of highways){ const t = (h.tiles || []).map(t => Array.isArray(t) ? t : [t.i, t.j]).filter(t => isFinite(t[0])); if (t.length) hw.push(t); for (const [i, j] of t) grow(i, j); } });
    if (!hw.length) safe(() => { const by = new Map(); for (const [k, arr] of hwIndex){ const [i, j] = k.split(',').map(Number); for (const e of arr){ const h = e.h || e; let l = by.get(h); if (!l) by.set(h, l = []); l.push([i, j]); } } for (const l of by.values()) hw.push(l); });
    safe(() => { for (const [k, arr] of mtIndex) if (arr && arr.length){ mt.add(k); const [i, j] = k.split(',').map(Number); grow(i, j); } });
    if (!isFinite(i0)){ i0 = j0 = -2; i1 = j1 = 2; }
    // people
    let awake = 0, out = 0; const pop = safe(() => pplList.length, 0);
    safe(() => { for (const p of pplList){ const zz = sleeps ? asleep(p, hour) : (hour < 6.5 || hour > 23); if (!zz) awake++; if (p.walk || p.at !== p.home) out++; } });
    const cr = LEDGER.crowds(), tr = LEDGER.transit(), po = LEDGER.police();
    // markets and the dome
    const mk = safe(() => { let tot = 0, act = 0; for (const pl of places.values()){ if (!pl.stalls) continue; for (const st of pl.stalls.values()){ tot++; if (st.keepers.some(sp => { const p = sp.by && people.get(sp.by); return p && !p.walk && p.at === pl.id; })) act++; } } return { tot, act }; }, { tot: 0, act: 0 });
    const dome = safe(() => [...megas.values()].some(m => m.kind === 'club'), false), domeOpen = dome && safe(() => clubOpenAt(hour), false), clubbers = safe(() => pplList.filter(p => p.club && !p.walk).length, 0);
    // the heat: people out, bucketed by plot
    const heat = new Map(); for (const [x, z] of cr.pts){ const k = Math.round(x/LOT) + ',' + Math.round(z/LOT); heat.set(k, (heat.get(k) || 0) + 1); }
    let hot = null; for (const [k, n] of heat) if (!hot || n > hot.n){ const [i, j] = k.split(',').map(Number); hot = { i, j, n }; }
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
    const sector = (i, j) => 'ABCDEFGH'[Math.max(0, Math.min(7, Math.floor((i - i0)/ni*8)))] + (Math.max(0, Math.min(5, Math.floor((j - j0)/nj*6))) + 1);
    D = { hour, day, plots, megs, hw, mt, i0, i1, j0, j1, ni, nj, zf, pop, awake, out, cr, tr, po, mk, dome, domeOpen, clubbers, heat, hot, sector,
      inc: LEDGER.inc().slice().reverse(), grow: LEDGER.grow(), count: LEDGER.count(), clock: safe(() => STORY.clock, 0) };
    return D;
  }
  const whenTxt = c => { const d = STORY.dayOf ? STORY.dayOf(c) : Math.floor(c/1440) + 1, h = (c % 1440)/60; return 'D' + d + ' ' + hm(h); };
  const agoTxt = c => { const m = Math.max(0, D.clock - c); return m < 60 ? Math.round(m) + ' min ago' : m < 1440 ? Math.round(m/60) + ' h ago' : Math.round(m/1440) + ' d ago'; };

  /* ---------- the view ---------- */
  function dom(){
    const d = D, asl = d.pop - d.awake, first = !accessed(), tot = d.zf.low + d.zf.mid + d.zf.high + d.zf.ind || 1;
    const meter = (f, n = 24) => Array.from({ length: n }, (_, k) => `<i class="${k < Math.round(f*n) ? 'on' : ''}"></i>`).join('');
    const zrow = (lbl, v) => `<div class="bar"><span>${lbl}</span><span class="tr"><i style="width:${(100*v/Math.max(1, Math.max(d.zf.low, d.zf.mid, d.zf.high, d.zf.ind))).toFixed(1)}%"></i></span><span>${fmt(v)}</span></div>`;
    const topMax = Math.max(1, ...d.cr.top.map(t => t.n));
    const metroMax = Math.max(1, ...d.tr.metro.map(l => l.riders));
    const incs = d.inc.slice(0, 7);
    root = document.createElement('div'); root.id = 'spire'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Data Spire: city ledger');
    root.innerHTML = `
      <div class="top boot"><div class="brand"><span class="hd">DATA SPIRE</span><small>CIVIC LEDGER · NODE 07</small></div>
        <div class="mid"><span>DAY ${d.day}</span><span class="clock disp">${hm(d.hour)}</span><span>${esc(safe(() => phaseName(d.hour), '').toUpperCase())}${safe(() => S.rain, false) ? ' · RAIN' : ''}</span></div>
        <button class="close" type="button">CLOSE · ESC</button></div>
      <div class="col">
        <div class="pn boot"><div class="tab"><code>L-01</code><span class="hd">POPULATION</span><span class="m">${fmt(d.count.plots)} PLOTS</span></div>
          <div><span class="big">${fmt(d.pop)}</span><span class="unit">RESIDENTS</span></div>
          <div class="meter">${Array.from({ length: 24 }, (_, k) => `<i class="${k < Math.round(d.awake/Math.max(1, d.pop)*24) ? 'on' : 'sl'}"></i>`).join('')}</div>
          <div class="kv"><span>AWAKE</span><span class="amb">${fmt(d.awake)}</span><span>ASLEEP</span><span>${fmt(asl)}</span><span>OUT AND ABOUT</span><span>${fmt(d.out)}</span><span>AT HOME</span><span>${fmt(d.pop - d.out)}</span></div></div>
        <div class="pn boot"><div class="tab"><code>L-02</code><span class="hd">FLOORS BY ZONE</span><span class="m">${fmt(tot)} TOTAL</span></div>
          <div class="bars">${zrow('RESIDENTIAL', d.zf.low)}${zrow('COMMERCIAL', d.zf.mid)}${zrow('LUXURY', d.zf.high)}${zrow('INDUSTRIAL', d.zf.ind)}</div>
          <div class="kv" style="margin-top:8px"><span>MEGASTRUCTURES</span><span>${d.megs.length}</span><span>TALLEST</span><span>${Math.max(0, ...d.plots.map(p => p.lv))} FLOORS</span></div></div>
        <div class="pn boot"><div class="tab"><code>L-03</code><span class="hd">GROWTH</span><span class="m gm"></span></div><div class="sparks"></div></div>
      </div>
      <div class="pn map boot"><div class="tab"><code>L-04</code><span class="hd">CITY PLAN</span><span class="m">${d.ni} × ${d.nj} · N ↑ · ${fmt(d.cr.out)} OUT NOW</span></div>
        <canvas class="mp"></canvas>
        <div class="legend"><span><i style="background:rgba(243,165,58,.8);border-radius:50%"></i>CROWDS</span><span><i style="background:var(--red);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></i>INCIDENTS</span>
          <span><i style="border:1px solid var(--ink)"></i>STRUCTURES</span><span><i style="background:rgba(243,165,58,.45);height:3px"></i>SKY HIGHWAY</span><span><i style="border-top:2px dashed var(--teal);height:0"></i>METRO</span></div>
        ${first ? `<div class="ask"><div class="k">ARCHIVE REQUEST · COASTAL SECTOR</div><h1 class="glitch">HIGH OVERSEER</h1><div class="sub">MEMORY ARCHIVE // FRAGMENT 03</div><p class="say"></p>
          <div class="btns"><button class="yes" type="button">YES<small>Y</small></button><button class="no" type="button">NO<small>N</small></button></div></div>` : ''}</div>
      <div class="col">
        <div class="pn boot" style="flex:1.7"><div class="tab"><code>L-05</code><span class="hd">INCIDENTS</span><span class="m">${d.inc.length ? 'LAST ' + incs.length + ' OF ' + d.inc.length : 'NONE LOGGED'}</span></div>
          ${incs.length ? `<div class="inc">${incs.map((x, k) => `<div class="it ${k > 2 ? 'old' : ''}"><span class="n">${k + 1}</span><div><div class="t1">${esc(x.title)}</div><div class="t2">${esc(x.kase)} · ${esc(x.place)} · ${d.sector(Math.round(x.x/LOT), Math.round(x.z/LOT))}</div></div><div class="w">${whenTxt(x.c)}<br><span class="dim">${agoTxt(x.c)}</span></div></div>`).join('')}</div>`
            : `<div class="empty">No police matters on record yet.<br>The Spire logs each incident as it happens: where, when, and which case.${d.po.stations ? '' : '<br><span class="amb">No police station stands in the city.</span>'}</div>`}</div>
        <div class="pn boot"><div class="tab"><code>L-06</code><span class="hd">POLICE</span><span class="m">${d.po.stations} STATION${d.po.stations === 1 ? '' : 'S'}</span></div>
          <div class="kv"><span>OFFICERS</span><span>${fmt(d.po.officers)}</span><span>ON THE STREETS</span><span class="amb">${fmt(d.po.beat)}</span><span>OPEN CASE</span><span>${d.po.caseOpen ? esc(d.po.caseOpen) : '<span class="dim">NONE</span>'}</span>
            ${d.po.caseDay ? `<span>CASE DAY</span><span>${d.po.caseDay} / 21</span>` : ''}<span>INCIDENTS TODAY</span><span class="red">${d.inc.filter(x => Math.floor(x.c/1440) === Math.floor(d.clock/1440)).length}</span></div></div>
      </div>
      <div class="bot">
        <div class="pn boot"><div class="tab"><code>L-07</code><span class="hd">WHERE PEOPLE ARE</span><span class="m">${d.hot ? 'HOTSPOT ' + d.sector(d.hot.i, d.hot.j) : ''}</span></div>
          ${d.cr.top.length ? `<div class="bars">${d.cr.top.slice(0, 5).map(t => `<div class="bar wide"><span title="${esc(t.name)}">${esc(t.name.toUpperCase())}${t.pl ? ' <span class="amb">' + d.sector(Math.round(t.pl.x/LOT), Math.round(t.pl.z/LOT)) + '</span>' : ''}</span><span class="tr"><i style="width:${(100*t.n/topMax).toFixed(1)}%"></i></span><span>${t.n}</span></div>`).join('')}</div>` : '<div class="empty">Everyone is at home.</div>'}</div>
        <div class="pn boot"><div class="tab"><code>L-08</code><span class="hd">TRANSIT</span><span class="m">${d.tr.air} DRONES AIRBORNE</span></div>
          <div class="kv" style="margin-bottom:7px"><span>SKY HIGHWAYS</span><span>${d.tr.hwRoutes ? d.tr.hwRoutes + ' ROUTES · <span class="amb">' + d.tr.hwCars + ' CARS</span>' : '<span class="dim">NONE BUILT</span>'}</span><span>METRO</span><span>${d.tr.metro.length ? d.tr.metro.length + ' LINES' : '<span class="dim">NONE BUILT</span>'}</span></div>
          <div class="bars">${d.tr.metro.slice(0, 3).map(l => `<div class="bar teal"><span>LINE ${l.n}</span><span class="tr"><i style="width:${(100*l.riders/metroMax).toFixed(1)}%"></i></span><span>${l.riders}</span></div>`).join('')}</div></div>
        <div class="pn boot"><div class="tab"><code>L-09</code><span class="hd">MARKETS · NIGHTLIFE</span><span class="m"></span></div>
          <div class="kv"><span>STALLS OPEN</span><span>${d.mk.tot ? d.mk.act + ' / ' + d.mk.tot : '<span class="dim">NO MARKET</span>'}</span><span>NEON DOME</span><span>${d.dome ? (d.domeOpen ? '<span class="amb">OPEN</span> · ' + d.clubbers + ' INSIDE' : 'CLOSED · OPENS 19:00') : '<span class="dim">NOT BUILT</span>'}</span>
            <span>FOOT TRAFFIC</span><span>${d.pop ? Math.round(100*d.out/d.pop) : 0}% OUT</span></div>
          <div class="meter">${meter(d.mk.tot ? d.mk.act/d.mk.tot : 0)}</div></div>
        <div class="pn boot coast"><div class="tab"><code>L-10</code><span class="hd">ARCHIVE</span><span class="m">${first ? 'UNOPENED' : 'FRAGMENT 03'}</span></div>
          <div class="disp">THE COAST</div><p>A record that survives in the archive. ${first ? 'Not yet accessed.' : 'Accessed before. Incomplete.'}</p>
          <button class="acc" type="button">ACCESS</button></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelectorAll('.boot').forEach((el, k) => { el.style.animationDelay = (.05*k) + 's'; });
    $('.close').addEventListener('click', close); $('.acc').addEventListener('click', yes);
    if (first){
      $('.yes').addEventListener('click', yes); $('.no').addEventListener('click', dismiss);
      const say = $('.say'), Q = 'A record of the coast survives in the archive. It is incomplete. Would you like to remember?'; let qi = 0;
      const tick = () => { if (!O.open || !say.isConnected) return; if (qi < Q.length){ qi = Math.min(Q.length, qi + 2); say.innerHTML = esc(Q.slice(0, qi)) + '<span class="cur"></span>'; typingT = setTimeout(tick, 24); } };
      typingT = setTimeout(tick, 800);
    }
  }
  // growth: one small line per measure, by day (by hour while there's less than two days of record)
  function sparks(){
    const box = $('.sparks'), g = D.grow.concat([Object.assign({ c: D.clock }, D.count)]).sort((a, b) => a.c - b.c);
    const byDay = new Map(); for (const s of g) byDay.set(Math.floor(s.c/1440), s);
    let series = [...byDay.values()], unit = 'BY DAY';
    if (series.length < 3){ series = g.slice(-48); unit = 'BY HOUR'; }
    $('.gm').textContent = series.length > 1 ? unit + ' · ' + series.length + ' POINTS' : 'RECORDING';
    const rows = [['PEOPLE', 'pop'], ['PLOTS', 'plots'], ['FLOORS', 'floors'], ['STRUCT', 'megas']];
    box.innerHTML = rows.map(([lbl, k]) => { const a = series[0][k], b = series[series.length - 1][k], dlt = b - a;
      return `<div class="spark"><span>${lbl}</span><canvas data-k="${k}"></canvas><span>${fmt(b)}<em>${series.length > 1 ? (dlt >= 0 ? '+' : '') + fmt(dlt) : '—'}</em></span></div>`; }).join('');
    for (const cv of box.querySelectorAll('canvas')){
      const r = cv.getBoundingClientRect(), dp = DPR(); cv.width = Math.max(1, r.width*dp); cv.height = Math.max(1, r.height*dp);
      const c = cv.getContext('2d'), k = cv.dataset.k, v = series.map(s => s[k]), lo = Math.min(...v), hi = Math.max(...v), W = cv.width, H = cv.height;
      c.strokeStyle = 'rgba(235,225,204,.12)'; c.lineWidth = dp; for (let x = 0; x <= 4; x++){ c.beginPath(); c.moveTo(W*x/4, H - dp); c.lineTo(W*x/4, H - 4*dp); c.stroke(); }
      if (v.length < 2){ c.fillStyle = '#f3a53a'; c.fillRect(W - 3*dp, H/2 - dp, 3*dp, 3*dp); continue; }
      const P = (k2) => [k2/(v.length - 1)*(W - 4*dp) + 2*dp, H - 3*dp - (hi > lo ? (v[k2] - lo)/(hi - lo) : .5)*(H - 7*dp)];
      c.beginPath(); v.forEach((_, k2) => { const [x, y] = P(k2); k2 ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.strokeStyle = '#ebe1cc'; c.lineWidth = 1.2*dp; c.stroke();
      c.lineTo(W - 2*dp, H); c.lineTo(2*dp, H); c.closePath(); c.fillStyle = 'rgba(243,165,58,.12)'; c.fill();
      const [x, y] = P(v.length - 1); c.fillStyle = '#f3a53a'; c.fillRect(x - 2*dp, y - 2*dp, 4*dp, 4*dp);
    }
  }

  /* ---------- the plan: drawn once, then a light overlay each frame ---------- */
  let cv = null, cg = null, base = null, F = null;
  function setupMap(){
    cv = $('canvas.mp'); const r = cv.getBoundingClientRect(), dp = DPR(); cv.width = Math.max(1, Math.round(r.width*dp)); cv.height = Math.max(1, Math.round(r.height*dp)); cg = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 30*dp, d = D;
    const t = Math.min((W - pad*2)/d.ni, (H - pad*2 - 26*dp)/d.nj, 40*dp), ox = (W - t*d.ni)/2, oy = (H - 26*dp - t*d.nj)/2 + 4*dp;
    F = { t, P: (i, j) => [ox + (i - d.i0 + .5)*t, oy + (j - d.j0 + .5)*t], X: x => x/LOT, dp };
    base = document.createElement('canvas'); base.width = W; base.height = H; const g = base.getContext('2d');
    g.fillStyle = '#0d0b08'; g.fillRect(0, 0, W, H);
    // the survey grid and its rulers
    g.strokeStyle = 'rgba(235,225,204,.05)'; g.lineWidth = 1;
    for (let i = 0; i <= d.ni; i++){ const x = ox + i*t; g.beginPath(); g.moveTo(x, oy); g.lineTo(x, oy + d.nj*t); g.stroke(); }
    for (let j = 0; j <= d.nj; j++){ const y = oy + j*t; g.beginPath(); g.moveTo(ox, y); g.lineTo(ox + d.ni*t, y); g.stroke(); }
    g.fillStyle = '#8d8170'; g.font = (8*dp) + 'px JetBrains Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= d.ni; i++){ const x = ox + i*t; g.fillRect(x, oy - 6*dp, 1, i % 5 ? 3*dp : 6*dp); if (i % 5 === 0 && i < d.ni) g.fillText(String(d.i0 + i), x + t/2, oy - 13*dp); }
    for (let j = 0; j <= d.nj; j++){ const y = oy + j*t; g.fillRect(ox - 6*dp, y, j % 5 ? 3*dp : 6*dp, 1); if (j % 5 === 0 && j < d.nj){ g.save(); g.translate(ox - 15*dp, y + t/2); g.fillText(String(d.j0 + j), 0, 0); g.restore(); } }
    // the plots: bone, a little warmer the taller they are; luxury rose, industry olive
    const ZC = { low: [235, 225, 204], mid: [243, 190, 120], high: [230, 150, 130], ind: [170, 175, 140] };
    for (const p of d.plots){ const [x, y] = F.P(p.i, p.j), c = ZC[p.zone] || [120, 110, 95], a = p.lv ? .1 + Math.min(.32, p.lv*.03) : .05, s = t*.82;
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; g.fillRect(x - s/2, y - s/2, s, s); }
    // highways and the metro
    g.lineCap = 'round';
    for (const tl of d.hw){ const set = new Set(tl.map(q => q[0] + ',' + q[1])); g.strokeStyle = 'rgba(243,165,58,.42)'; g.lineWidth = Math.max(2*dp, t*.26);
      for (const [i, j] of tl) for (const [di, dj] of [[1, 0], [0, 1]]) if (set.has((i + di) + ',' + (j + dj))){ const a = F.P(i, j), b = F.P(i + di, j + dj); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }
    g.strokeStyle = 'rgba(134,212,198,.75)'; g.lineWidth = 1.5*dp; g.setLineDash([4*dp, 3*dp]);
    for (const k of d.mt){ const [i, j] = k.split(',').map(Number); for (const [di, dj] of [[1, 0], [0, 1]]) if (d.mt.has((i + di) + ',' + (j + dj))){ const a = F.P(i, j), b = F.P(i + di, j + dj); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }
    g.setLineDash([]);
    // the crowds: an amber heat where people are right now
    g.globalCompositeOperation = 'lighter';
    const hmax = Math.max(1, ...d.heat.values());
    for (const [k, n] of d.heat){ const [i, j] = k.split(',').map(Number), [x, y] = F.P(i, j), f = n/hmax, r = t*(.6 + 1.1*Math.sqrt(f)), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(243,165,58,${(.05 + .38*Math.pow(f, .8)).toFixed(3)})`); gr.addColorStop(1, 'rgba(243,165,58,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // the megastructures: outlined, named where there's room
    g.font = '600 ' + (8.5*dp) + 'px Chakra Petch, JetBrains Mono, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    for (const m of d.megs){ const [x0, y0] = F.P(m.i, m.j), w = m.w*t, h = m.h*t, x = x0 - t/2 + 1.5, y = y0 - t/2 + 1.5;
      g.fillStyle = 'rgba(11,9,7,.55)'; g.fillRect(x, y, w - 3, h - 3);
      g.strokeStyle = m.m.kind === 'police' ? 'rgba(134,212,198,.9)' : 'rgba(235,225,204,.7)'; g.lineWidth = dp; g.strokeRect(x, y, w - 3, h - 3);
      if (w > 46*dp){ g.fillStyle = m.m.kind === 'police' ? '#86d4c6' : 'rgba(235,225,204,.85)'; g.fillText(m.name.toUpperCase(), x + 3*dp, y + 3*dp, w - 8*dp); } }
    // every incident on record as a faint mark; the latest seven numbered
    for (const x of d.inc.slice(7)){ const [px, py] = F.P(x.x/LOT, x.z/LOT); g.fillStyle = 'rgba(255,91,69,.4)'; g.fillRect(px - 1.5*dp, py - 1.5*dp, 3*dp, 3*dp); }
    d.inc.slice(0, 7).reverse().forEach((x, kk, arr) => { const k = arr.length - 1 - kk, [px, py] = F.P(x.x/LOT, x.z/LOT), s = (k < 3 ? 8 : 6)*dp;
      g.fillStyle = k < 3 ? '#ff5b45' : '#a8473a'; g.beginPath(); g.moveTo(px, py - s); g.lineTo(px + s, py); g.lineTo(px, py + s); g.lineTo(px - s, py); g.closePath(); g.fill();
      g.fillStyle = '#1a0703'; g.font = '600 ' + (8.5*dp) + 'px Chakra Petch, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 1), px, py + .5*dp); });
    // the hotspot
    if (d.hot && d.hot.n > 2){ const [x, y] = F.P(d.hot.i, d.hot.j); g.strokeStyle = '#ffd08a'; g.lineWidth = dp; g.strokeRect(x - t*.9, y - t*.9, t*1.8, t*1.8);
      g.fillStyle = '#ffd08a'; g.font = (8.5*dp) + 'px JetBrains Mono, monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('HOTSPOT · ' + d.hot.n + ' PEOPLE', x + t, y - t); }
    // north
    g.fillStyle = '#8d8170'; g.font = '600 ' + (10*dp) + 'px Chakra Petch, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('N ↑', W - 10*dp, 8*dp);
  }
  function drawMap(t){
    if (!base) return; const g = cg, W = cv.width, H = cv.height, dp = F.dp; g.drawImage(base, 0, 0);
    // the newest incident breathes; a survey line crosses the plan
    const x0 = D.inc[0]; if (x0){ const [px, py] = F.P(x0.x/LOT, x0.z/LOT), k = (t*.6) % 1; g.strokeStyle = `rgba(255,91,69,${.8*(1 - k)})`; g.lineWidth = 1.5*dp; g.beginPath(); g.arc(px, py, (8 + k*22)*dp, 0, 7); g.stroke(); }
    const sx = ((t*.08) % 1)*W, gr = g.createLinearGradient(sx - 40*dp, 0, sx, 0); gr.addColorStop(0, 'rgba(243,165,58,0)'); gr.addColorStop(1, 'rgba(243,165,58,.08)'); g.fillStyle = gr; g.fillRect(sx - 40*dp, 0, 40*dp, H);
    g.fillStyle = 'rgba(243,165,58,.5)'; g.fillRect(sx, 0, dp, H);
  }
  let lastClk = '';
  function loop(now){
    if (!O.open) return; raf = requestAnimationFrame(loop);
    if (now - last < 40) return; last = now; drawMap(now/1000);
    const c = $('.clock'); if (c){ const s = (now/500 | 0) % 2 ? hm(D.hour) : hm(D.hour).replace(':', ' '); if (s !== lastClk){ lastClk = s; c.textContent = s; } }
  }

  /* ---------- in and out ---------- */
  // the curtain: glyphs falling in columns, each column's black following its glyph down, closing over the city
  function curtain(ms, then){
    const c = document.createElement('canvas'); c.id = 'ovsCurtain'; const dpr = DPR(); c.width = innerWidth*dpr; c.height = innerHeight*dpr; c.style.width = '100%'; c.style.height = '100%';
    document.body.appendChild(c); const g = c.getContext('2d'), cw = 14*dpr, cols = Math.ceil(c.width/cw), sp = Array.from({ length: cols }, () => .55 + Math.random()*.9), dl = Array.from({ length: cols }, () => Math.random()*.35);
    const ts = performance.now();
    const step = (now) => { const u = Math.min(1, (now - ts)/ms); g.font = (12*dpr) + 'px JetBrains Mono, monospace';
      for (let k = 0; k < cols; k++){ const p = Math.max(0, Math.min(1.15, (u - dl[k])/(1 - dl[k]*.6)*sp[k])), y = p*c.height;
        g.fillStyle = '#0b0907'; g.fillRect(k*cw, 0, cw + 1, y - 12*dpr);
        g.fillStyle = Math.random() < .15 ? '#ffd38a' : 'rgba(255,181,71,.85)'; g.fillText(GLY[(Math.random()*GLY.length) | 0], k*cw + 2*dpr, y - 12*dpr);
        g.fillStyle = 'rgba(235,225,204,.5)'; g.fillText(HEX[(Math.random()*16) | 0], k*cw + 2*dpr, y - 26*dpr); }
      if (u < 1) requestAnimationFrame(step); else { g.fillStyle = '#0b0907'; g.fillRect(0, 0, c.width, c.height); then(c); } };
    requestAnimationFrame(step);
  }
  O.show = (m) => {
    if (O.open || O.busy) return; O.busy = true; if (!built) build();
    if (typeof MON !== 'undefined' && MON.close) try { MON.close(); } catch (e){}
    if (typeof music !== 'undefined' && music.hold) music.hold(true);   // (the radio goes quiet while the view is up)
    if (typeof PERF !== 'undefined') PERF.quiet(4000);
    const city = canvas; city.classList.add('ovs-glitch');
    const bars = document.createElement('div'); bars.id = 'ovsBars'; document.body.appendChild(bars);
    setTimeout(() => curtain(650, (c) => {
      O.open = true; O.hold = true; t0 = performance.now(); read(); dom(); last = 0;
      requestAnimationFrame(() => { if (!O.open) return; setupMap(); sparks(); raf = requestAnimationFrame(loop); });
      resizeH = () => { if (O.open && root){ setupMap(); sparks(); } }; addEventListener('resize', resizeH);
      if (city) city.classList.remove('ovs-glitch'); bars.remove();
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 150, fill: 'forwards' }).onfinish = () => c.remove();
      keyH = e => { if (!O.open) return; e.stopPropagation(); const k = e.key.toLowerCase(), ask = root && root.querySelector('.ask');
        if (ask && k === 'y') yes(); else if (ask && (k === 'n' || k === 'escape')) dismiss(); else if (k === 'escape') close(); };
      addEventListener('keydown', keyH, true);
      setTimeout(() => { const b = root && (root.querySelector('.ask .yes') || root.querySelector('.close')); if (b) b.focus({ preventScroll: true }); O.busy = false; }, 700);
    }), 380);
  };
  function closeDesk(){ O.open = false; cancelAnimationFrame(raf); clearTimeout(typingT); if (keyH) removeEventListener('keydown', keyH, true); keyH = null; if (resizeH) removeEventListener('resize', resizeH); resizeH = null; base = null; }
  function close(){
    if (!O.open || O.busy) return; O.busy = true; O.hold = false;   // (the city draws again under the view as it leaves)
    if (typeof music !== 'undefined' && music.hold) music.hold(false);
    if (typeof PERF !== 'undefined') PERF.quiet(2500);
    root.classList.add('leave'); setTimeout(() => { closeDesk(); root.remove(); root = null; O.busy = false; }, 520);
  }
  // no, the first time: the question folds away; the ledger stays, and the coast waits in its box at the side
  function dismiss(){ const a = root && root.querySelector('.ask'); if (!a || O.busy) return; clearTimeout(typingT);
    a.animate([{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -46%) scale(.97)' }], { duration: 260, easing: 'ease-in' }).onfinish = () => a.remove();
    const b = root.querySelector('.close'); if (b) b.focus({ preventScroll: true }); }
  function yes(){
    if (!O.open || O.busy) return; O.busy = true;
    try { localStorage.setItem(ACCESS_KEY, String(safe(() => STORY.day() + 1, 1))); } catch (e) {}
    const say = root.querySelector('.say'); if (say) say.innerHTML = 'Accessing<span class="cur"></span>';
    const acc = root.querySelector('.acc'); if (acc) acc.textContent = 'ACCESSING';
    setTimeout(() => { if (typeof TV !== 'undefined') TV.go('coast.html'); else location.href = 'coast.html'; }, 350);
  }
  // a double click on the Data Spire: the pointer's ray against each spire's whole height (the plot's own pick box stops at its plinth)
  const _r = new THREE.Raycaster(), _n = new THREE.Vector2(), _b = new THREE.Box3(), _h = new THREE.Vector3();
  function spireAt(cx, cy){
    if (typeof megas === 'undefined') return null; const r = canvas.getBoundingClientRect(); _n.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1); _r.setFromCamera(_n, cam);
    for (const m of megas.values()){ if (m.kind !== 'spire') continue; const hx = m.w*LOT/2 - .4, hz = m.h*LOT/2 - .4;
      _b.min.set(m.x - hx, CURB, m.z - hz); _b.max.set(m.x + hx, (m.top || 30), m.z + hz); if (_r.ray.intersectBox(_b, _h)) return m; }
    return null;
  }
  canvas.addEventListener('dblclick', e => { if (O.open || O.busy) return; if (typeof hwMode !== 'undefined' && (hwMode || mtMode || megaPick || delMode)) return; const m = spireAt(e.clientX, e.clientY); if (m){ e.preventDefault(); O.show(m); } });
  return O;
})();
// arriving back from the coast: the television comes on once the city has drawn
if (typeof TV !== 'undefined') TV.ready = () => typeof pplReady !== 'undefined' && pplReady;
