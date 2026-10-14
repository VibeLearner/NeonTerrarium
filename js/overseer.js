// Neon Terrarium: the High Overseer. Double-click the Data Spire and the city glitches, a curtain of falling glyphs closes
// over it, and the Overseer's desk boots up, laid out after the "Overturn" rotation desk of uispace: a strip of readouts
// across the top (the archive's integrity in amber, the clock), the city's plan in the middle, cut into 48
// sectors and drawn as tiny extruded blocks coloured by whether each sector has turned in for the night (its residents'
// bedtimes), the turn schedule beside it, and along the bottom the tiers (the four zones), a crossings log streaming in,
// and the hold lever. Everything on it is read from the city as it stands. In a callout on the plan, wired to the Spire,
// the question: whether to remember. Yes: the television switches off, and the coast comes on (coast.html). No: the
// desk glitches away, back to the city. While the desk covers the screen the city stops drawing (OVERSEER.hold; main.js).
'use strict';
const OVERSEER = (() => {
  const O = { open: false, hold: false };
  const css = `
  #ovs { position: fixed; inset: 0; z-index: 60; color: #9aa29e; font: 10px/1.35 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .06em; background: #040505;
    display: grid; grid-template-columns: minmax(0, 1.62fr) minmax(320px, 1fr); grid-template-rows: 62px minmax(0, 1fr) 208px; gap: 7px; padding: 9px; overflow: hidden; user-select: none; }
  #ovs * { box-sizing: border-box; }
  #ovs b, #ovs .w { color: #e8ebe9; font-weight: 600; } #ovs .amb { color: #ffa834; } #ovs .red { color: #ff5a3c; } #ovs .grn { color: #59c27a; } #ovs .dim { color: #565e5a; }
  #ovs .blink { animation: ovsBlink 1s steps(2) infinite; } @keyframes ovsBlink { 50% { opacity: .2; } }
  #ovs .scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px); z-index: 20; }
  /* the top strip: cells of readouts between hairlines */
  #ovs .top { grid-column: 1 / -1; display: flex; border: 1px solid #262b28; background: #070908; min-width: 0; }
  #ovs .top .c { padding: 7px 11px 6px; border-right: 1px solid #262b28; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; white-space: nowrap; overflow: hidden; }
  #ovs .top .c:last-child { border-right: 0; margin-left: auto; text-align: right; } #ovs .top .c.fix { flex-shrink: 0; }
  #ovs .top small { font-size: 8.5px; letter-spacing: .2em; color: #6b736f; } #ovs .top .v { font-size: 12.5px; color: #e8ebe9; letter-spacing: .08em; }
  #ovs .top .big { font: 600 34px/1 'JetBrains Mono', monospace; color: #ffa834; letter-spacing: .02em; text-shadow: 0 0 18px rgba(255,168,52,.35); }
  #ovs .top .clock { font: 600 29px/1 'JetBrains Mono', monospace; color: #e8ebe9; letter-spacing: .02em; }
  #ovs .top .row { display: flex; align-items: center; gap: 10px; }
  #ovs .sq { display: inline-block; width: 13px; height: 13px; background: #59c27a; box-shadow: 0 0 8px rgba(89,194,122,.5); vertical-align: -2px; }
  #ovs .seg { display: flex; gap: 2px; height: 9px; width: 150px; } #ovs .seg i { flex: 1; background: #2a2416; } #ovs .seg i.on { background: #ffa834; } #ovs .seg i.hot { background: #ffd38a; animation: ovsBlink .8s steps(2) infinite; }
  /* panels, lettered */
  #ovs .pn { position: relative; border: 1px solid #262b28; background: #060807; min-height: 0; min-width: 0; overflow: hidden; }
  #ovs .pn > header { position: relative; z-index: 3; display: flex; align-items: center; gap: 8px; height: 22px; padding: 0 8px; border-bottom: 1px solid #1c201e; font-size: 9px; letter-spacing: .22em; color: #9aa29e; background: #060807; white-space: nowrap; }
  #ovs .k { display: inline-grid; place-items: center; width: 15px; height: 15px; border: 1px solid #a8b0ac; color: #e8ebe9; font-weight: 600; letter-spacing: 0; font-size: 9px; }
  #ovs header .r { margin-left: auto; color: #565e5a; }
  #ovs canvas { display: block; }
  /* A: the plan */
  #ovs .plan canvas.iso { position: absolute; left: 0; top: 22px; width: 100%; height: calc(100% - 22px); }
  #ovs .legend { position: absolute; left: 10px; bottom: 10px; z-index: 4; border: 1px solid #262b28; background: rgba(4,5,5,.88); padding: 6px 9px 7px; font-size: 8.5px; letter-spacing: .16em; display: grid; grid-template-columns: auto auto; gap: 3px 14px; }
  #ovs .legend h5 { grid-column: 1 / -1; margin: 0 0 2px; font: 600 8.5px/1 'JetBrains Mono', monospace; letter-spacing: .25em; color: #a8b0ac; }
  #ovs .legend span { display: flex; align-items: center; gap: 6px; } #ovs .legend i { width: 9px; height: 9px; display: inline-block; }
  #ovs .inset { position: absolute; right: 10px; top: 32px; z-index: 4; width: 196px; border: 1px solid #262b28; background: rgba(4,5,5,.9); }
  #ovs .inset h5 { margin: 0; padding: 4px 7px; border-bottom: 1px solid #1c201e; font: 600 8.5px/1 'JetBrains Mono', monospace; letter-spacing: .2em; color: #a8b0ac; display: flex; justify-content: space-between; }
  #ovs .inset canvas { width: 100%; height: 118px; }
  #ovs .callout { position: absolute; z-index: 4; border: 1px solid #e5432d; background: rgba(28,6,4,.9); padding: 5px 8px; font-size: 8.5px; letter-spacing: .12em; color: #ffb3a6; white-space: nowrap; line-height: 1.5; }
  #ovs .callout b { color: #fff; }
  /* the question, a callout of its own wired to the Spire */
  #ovs .ask { position: absolute; right: 10px; bottom: 10px; z-index: 5; width: 318px; border: 1px solid #ffa834; background: rgba(8,6,2,.94); box-shadow: 0 0 0 3px rgba(4,5,5,.9), 0 0 40px rgba(255,168,52,.12); }
  #ovs .ask .hd { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-bottom: 1px solid rgba(255,168,52,.35); background: rgba(255,168,52,.1); color: #ffcf7a; font-size: 8.5px; letter-spacing: .24em; }
  #ovs .ask .hd .k { border-color: #ffa834; color: #ffa834; }
  #ovs .ask .bd { padding: 12px 14px 22px; }
  #ovs .ask h1 { margin: 0 0 3px; font: 400 23px/1.05 'Silkscreen', monospace; letter-spacing: .1em; color: #f4ecd8; text-shadow: 2px 0 rgba(255,60,60,.35), -2px 0 rgba(60,255,230,.3), 0 0 18px rgba(255,168,52,.3); }
  #ovs .ask h1.glitch { animation: ovsGl 2.8s infinite; }
  @keyframes ovsGl { 0%, 91%, 100% { transform: none; clip-path: none; } 92% { transform: translate(-3px, 1px); clip-path: inset(10% 0 55% 0); } 94% { transform: translate(3px, -1px); clip-path: inset(50% 0 12% 0); } 96% { transform: translate(-1px, 0); clip-path: inset(30% 0 30% 0); } }
  #ovs .ask .sub { color: #6b736f; font-size: 8.5px; letter-spacing: .26em; margin-bottom: 9px; }
  #ovs .ask p { margin: 0 0 13px; color: #d6ddd9; font-size: 11.5px; line-height: 1.55; min-height: 4.65em; letter-spacing: .03em; }
  #ovs .ask p .cur { display: inline-block; width: .6em; height: 1em; background: #ffa834; vertical-align: -2px; animation: ovsBlink .8s steps(2) infinite; }
  #ovs .btns { display: flex; gap: 12px; }
  #ovs .btn { position: relative; flex: 1; padding: 9px 12px; border: 1px solid #ffa834; background: transparent; color: #ffa834; font: 600 12px/1 'JetBrains Mono', monospace; letter-spacing: .45em; text-indent: .45em; cursor: pointer; transition: background .12s steps(2), color .12s steps(2); }
  #ovs .btn.no { border-color: #6b736f; color: #c8d0cc; }
  #ovs .btn:hover, #ovs .btn:focus-visible { background: #ffa834; color: #0a0703; outline: none; animation: ovsJit .25s steps(2) infinite; }
  #ovs .btn.no:hover, #ovs .btn.no:focus-visible { background: #c8d0cc; color: #040505; }
  #ovs .btn small { position: absolute; bottom: -15px; left: 0; right: 0; text-indent: 0; font-size: 8px; letter-spacing: .3em; color: #565e5a; }
  @keyframes ovsJit { 50% { transform: translate(1px, -1px); } }
  /* B: the turn schedule */
  #ovs .sched { display: flex; flex-direction: column; }
  #ovs .tw { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  #ovs table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  #ovs th { font-weight: 400; font-size: 8px; letter-spacing: .18em; color: #6b736f; text-align: left; padding: 5px 5px 4px; border-bottom: 1px solid #1c201e; white-space: nowrap; overflow: hidden; }
  #ovs td { padding: 0 5px; height: 17px; border-bottom: 1px solid #111413; color: #c8d0cc; white-space: nowrap; overflow: hidden; text-overflow: clip; font-size: 9.5px; }
  #ovs tr.next td { background: rgba(255,168,52,.17); color: #ffd9a0; } #ovs tr.next td:first-child { box-shadow: inset 2px 0 #ffa834; }
  #ovs tr.vac td { color: #4b524e; }
  #ovs .st { display: inline-block; min-width: 56px; text-align: center; padding: 1px 4px; font-size: 8px; letter-spacing: .14em; line-height: 11px; }
  #ovs .st.turned { background: #8c2f1f; color: #ffd9cf; } #ovs .st.nxt { background: #ffa834; color: #140b00; font-weight: 600; } #ovs .st.stb { border: 1px solid #d9c7a0; color: #d9c7a0; }
  #ovs .st.pend { border: 1px solid #3f8f57; color: #59c27a; } #ovs .st.vac { border: 1px dashed #333936; color: #4b524e; }
  #ovs td.tl { position: relative; } #ovs td.tl::before { content: ''; position: absolute; left: 5px; right: 5px; top: 8px; height: 1px; background: #1c201e; }
  #ovs td.tl i { position: absolute; top: 4px; width: 2px; height: 9px; background: #59c27a; } #ovs tr.next td.tl i { background: #ffa834; box-shadow: 0 0 6px #ffa834; } #ovs tr.turnd td.tl i { background: #c2462c; }
  #ovs .now { position: absolute; top: 0; bottom: 0; width: 1px; background: #ffa834; box-shadow: 0 0 6px #ffa834; z-index: 2; pointer-events: none; }
  #ovs .now span { position: absolute; top: 2px; left: 3px; font-size: 7.5px; letter-spacing: .2em; color: #140b00; background: #ffa834; padding: 0 3px; }
  #ovs .ilk { border-top: 1px solid #1c201e; padding: 6px 8px 7px; display: flex; flex-direction: column; gap: 5px; font-size: 8.5px; letter-spacing: .16em; }
  #ovs .ilk .bar { display: flex; gap: 2px; height: 7px; } #ovs .ilk .bar i { flex: 1; background: #3f8f57; } #ovs .ilk .bar i.r { background: #c2462c; } #ovs .ilk .bar i.off { background: #1c201e; }
  #ovs .ilk .rd { display: flex; justify-content: space-between; }
  /* the bottom row */
  #ovs .bot { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.3fr) minmax(0, .95fr); gap: 7px; min-height: 0; }
  #ovs .tiers .rows { padding: 4px 8px; display: flex; flex-direction: column; gap: 0; }
  #ovs .tr { display: grid; grid-template-columns: 20px 60px 36px minmax(70px, 1fr) 76px 62px; align-items: center; gap: 8px; height: 37px; border-bottom: 1px solid #111413; font-size: 9.5px; }
  #ovs .tr.h { height: 18px; font-size: 7.5px; color: #565e5a; letter-spacing: .18em; }
  #ovs .rn { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid currentColor; font-weight: 600; font-size: 9px; letter-spacing: 0; }
  #ovs .hb { position: relative; height: 9px; background: repeating-linear-gradient(90deg, #1c201e 0 1px, transparent 1px 25%); border-bottom: 1px solid #262b28; }
  #ovs .hb i { position: absolute; top: 1px; bottom: 1px; opacity: .85; } #ovs .hb u { position: absolute; top: -3px; bottom: -3px; width: 1px; background: #ffa834; }
  #ovs .tr .aw { font-size: 9px; line-height: 1.3; } #ovs .tr .ss { font-size: 8px; letter-spacing: .14em; }
  #ovs .log table td { height: 19px; font-size: 9px; } #ovs .log tr.alert td { background: rgba(229,67,45,.22); color: #ffc2b5; } #ovs .log tr.alert td:first-child { box-shadow: inset 2px 0 #e5432d; }
  #ovs .log tr.in td { animation: ovsRow .6s steps(4); } @keyframes ovsRow { 0% { background: rgba(255,168,52,.35); color: #fff; } }
  #ovs .hold .bd { display: grid; grid-template-columns: 112px 1fr; grid-template-rows: auto 1fr; gap: 4px 12px; padding: 8px 10px; height: calc(100% - 22px); }
  #ovs .ind { grid-column: 1 / -1; display: flex; gap: 14px; font-size: 8px; letter-spacing: .16em; margin-bottom: 4px; } #ovs .ind span { display: flex; align-items: center; gap: 4px; }
  #ovs .ind i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid #565e5a; } #ovs .ind i.g { background: #59c27a; border-color: #59c27a; box-shadow: 0 0 5px #59c27a; } #ovs .ind i.a { background: #ffa834; border-color: #ffa834; }
  #ovs .hold svg { width: 112px; height: 104px; display: block; }
  #ovs .kv { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 8.5px; letter-spacing: .14em; align-content: start; }
  #ovs .kv span:nth-child(even) { color: #e8ebe9; text-align: right; }
  #ovs .mimic { display: grid; grid-template-columns: repeat(8, 9px); gap: 2px; margin-top: 7px; } #ovs .mimic i { height: 9px; }
  #ovs .mimic i.nx { animation: ovsBlink .8s steps(2) infinite; }
  /* booting: frames draw in; leaving: it all jitters and drops away */
  #ovs .boot { animation: ovsIn .55s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes ovsIn { 0% { clip-path: inset(50% 50% 50% 50%); opacity: 0; } 60% { clip-path: inset(0 48% 0 48%); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 1; } }
  #ovs.leave { animation: ovsOut .5s steps(6) forwards; }
  @keyframes ovsOut { 0% { filter: none; } 30% { filter: hue-rotate(90deg) contrast(2); transform: translateX(-8px) skewX(-6deg); } 60% { clip-path: inset(40% 0 35% 0); transform: translateX(10px); } 100% { clip-path: inset(50% 0 50% 0); opacity: 0; } }
  @media (max-width: 1420px) { #ovs .top .c.opt { display: none; } }
  @media (max-width: 1100px) { #ovs .top .c.opt2 { display: none; } #ovs .tr { grid-template-columns: 22px 60px 42px minmax(40px, 1fr) 84px; } #ovs .tr > :nth-child(6) { display: none; } }
  @media (max-height: 700px) { #ovs { grid-template-rows: 58px minmax(0, 1fr) 176px; } #ovs .tr { height: 29px; } #ovs .hold svg { height: 84px; } }
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
  let built = false, root = null, raf = 0, last = 0, keyH = null, typingT = 0, resizeH = null, spire = null, t0 = 0;
  const HEX = '0123456789ABCDEF', GLY = 'アイウエオカキクケコサシスセソ01#%&*+=<>/\\[]{}';
  const ROM = ['I', 'II', 'III', 'IV'], TIER_COL = ['#e8ebe9', '#5aa0ff', '#59c27a', '#ffa834'], TIER_NAME = ['RESIDENT', 'COMMERCE', 'LUXURY', 'INDUSTRY'], ZONE_T = { low: 0, mid: 1, high: 2, ind: 3 };
  const $ = (q) => root.querySelector(q);
  const fmt = n => n.toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const p2 = n => String(Math.floor(n)).padStart(2, '0');
  const hm = h => { h = ((h % 24) + 24) % 24; return p2(h) + ':' + p2((h % 1)*60); };
  const hms = s => { s = Math.max(0, Math.floor(s)); return p2(s/3600) + ':' + p2((s % 3600)/60) + ':' + p2(s % 60); };
  const hsh = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const cmean = hs => { if (!hs.length) return null; let x = 0, y = 0; for (const h of hs){ const a = h/24*Math.PI*2; x += Math.cos(a); y += Math.sin(a); } return ((Math.atan2(y, x)/(Math.PI*2)*24) + 24) % 24; };
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  function build(){ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); built = true; }

  /* ---------- the model: the city read into 48 sectors, the people into tiers ---------- */
  let M = null;
  function model(){
    const hour = typeof S !== 'undefined' ? S.hour : 12, sleeps = typeof asleep === 'function';
    const plots = [], megs = [], hw = new Map(), mt = new Set();
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    const grow = (i, j) => { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; };
    if (typeof cells !== 'undefined') for (const c of cells.values()){
      grow(c.i, c.j); if (c.mega) continue;
      const z = {}; for (const s of c.sections) z[s.zone] = (z[s.zone] || 0) + 1;
      plots.push({ i: c.i, j: c.j, lv: c.sections.length + (c.lift ? 3 : 0), zone: Object.keys(z).sort((a, b) => z[b] - z[a])[0] || null });
    }
    if (typeof megas !== 'undefined') for (const m of megas.values()){
      const a = Math.round(m.x/LOT - (m.w - 1)/2), b = Math.round(m.z/LOT - (m.h - 1)/2);
      megs.push({ m, i: a, j: b, w: m.w, h: m.h, lv: Math.min(26, Math.max(3, ((m.top || 12) - CURB)/(typeof FH !== 'undefined' ? FH : 2.6))) });
      grow(a, b); grow(a + m.w - 1, b + m.h - 1);
    }
    if (typeof hwIndex !== 'undefined') for (const [k, arr] of hwIndex){ if (!arr || !arr.length) continue; const [i, j] = k.split(',').map(Number); grow(i, j); for (const h of arr){ let l = hw.get(h); if (!l) hw.set(h, l = []); l.push([i, j]); } }
    if (typeof mtIndex !== 'undefined') for (const [k, arr] of mtIndex){ if (arr && arr.length){ const [i, j] = k.split(',').map(Number); grow(i, j); mt.add(k); } }
    if (!isFinite(i0)){ i0 = j0 = -1; i1 = j1 = 1; }
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
    const secOf = (i, j) => { const c = Math.max(0, Math.min(7, Math.floor((i - i0)/ni*8))), r = Math.max(0, Math.min(5, Math.floor((j - j0)/nj*6))); return r*8 + c; };
    // the people, by the sector and the tier of their home
    const sec = Array.from({ length: 48 }, (_, k) => ({ k, n: k + 1, bed: [], wake: [], ppl: 0, out: 0, cops: 0, plots: 0, lv: 0 }));
    const tier = [0, 1, 2, 3].map(t => ({ t, pop: 0, awake: 0, bed: [], wake: [] }));
    const ppl = typeof pplList !== 'undefined' ? pplList : [], zoneAt = new Map(plots.map(p => [p.i + ',' + p.j, p.zone]));
    let awake = 0, out = 0;
    for (const p of ppl){
      const pl = typeof places !== 'undefined' && places.get(p.home); if (!pl) continue;
      const i = Math.round(pl.x/LOT), j = Math.round(pl.z/LOT), s = sec[secOf(i, j)], t = tier[ZONE_T[zoneAt.get(i + ',' + j)] ?? 1];
      const zz = sleeps ? asleep(p, hour) : (hour < 6.5 || hour > 23);
      s.ppl++; s.bed.push(p.bed); s.wake.push(p.wake); if (p.cop) s.cops++; if (zz) s.out++;
      t.pop++; t.bed.push(p.bed); t.wake.push(p.wake); if (!zz){ t.awake++; awake++; } else out++;
    }
    for (const p of plots){ const s = sec[secOf(p.i, p.j)]; s.plots++; s.lv += p.lv; }
    // each sector's turn: when its residents, on the whole, go to bed; turned while most of them are asleep
    for (const s of sec){
      s.at = cmean(s.bed); s.wk = cmean(s.wake);
      if (s.at === null){ s.state = 'vac'; continue; }
      s.dt = (s.at - hour + 24) % 24; s.state = s.out/s.ppl >= .5 ? 'turned' : 'pend';
    }
    const up = sec.filter(s => s.state === 'pend').sort((a, b) => a.dt - b.dt);
    if (up[0]) up[0].state = 'nxt'; for (const s of up.slice(1, 4)) s.state = 'stb';
    const order = sec.filter(s => s.at !== null).sort((a, b) => ((a.at - 18 + 24) % 24) - ((b.at - 18 + 24) % 24)).concat(sec.filter(s => s.at === null));
    order.forEach((s, q) => { s.q = q + 1; });
    for (const t of tier){ t.at = cmean(t.bed); t.wk = cmean(t.wake); }
    const sp = spire && megs.find(g => g.m === spire), spSec = sp ? secOf(sp.i + (sp.w - 1)/2, sp.j + (sp.h - 1)/2) : -1;
    // someone for the red callout: a courier if there is one out, else anyone
    let who = null; if (ppl.length){ const cs = ppl.filter(p => p.courier && places.get(p.home)); const pool = cs.length ? cs : ppl; who = pool[(Math.random()*pool.length) | 0]; }
    M = { hour, plots, megs, hw, mt, i0, i1, j0, j1, ni, nj, secOf, sec, order, tier, awake, asleep: out, pop: ppl.length, spSec, sp, who, turned: sec.filter(s => s.state === 'turned').length, live: sec.filter(s => s.state !== 'vac').length, next: sec.find(s => s.state === 'nxt') || null };
    return M;
  }
  const SCOL = { pend: ['#4f9a62', '#2f6a3e', '#23502f'], turned: ['#a4492f', '#6e2c1c', '#521f14'], nxt: ['#ffd08a', '#c99a4c', '#9a7334'], stb: ['#d8c59c', '#a8946c', '#7c6c4c'],
    vac: ['#3a403d', '#2a2f2c', '#202422'], mega: ['#d0d6d2', '#8e9591', '#6a716d'] };
  const tierOf = p => M.tier.find(t => t.t === (ZONE_T[p] ?? 1));
  const permit = id => { const h = hsh(id); return (1 + h % 9) + '-' + String(100 + (h >>> 4) % 900) + '-' + String(100 + (h >>> 14) % 900); };

  /* ---------- the plan: tiny extruded blocks on an iso grid, coloured by sector state ---------- */
  // fit: { tw, ox, oy, lz } for the tile range B into a W x H box; P(i, j, z) the screen point
  function fit(B, W, H, pad){
    const n = (B.i1 - B.i0 + 1) + (B.j1 - B.j0 + 1), tw = Math.min(64*DPR(), (W*(1 - pad))/(n/2), (H*(1 - pad))/(n/4 + 1.3)), th = tw/2;
    const lz = th*.3, ox = W/2 - ((B.i1 - B.i0 + 1) - (B.j1 - B.j0 + 1))*tw/4, oy = H/2 - n*th/4 + tw*.5;
    return { tw, th, lz, P: (i, j, z) => [ox + ((i - B.i0) - (j - B.j0))*tw/2, oy + ((i - B.i0) + (j - B.j0))*th/2 - z] };
  }
  function prism(g, F, i, j, w, h, z, cols, ins){
    const a = F.P(i - .5 + ins, j - .5 + ins, z), b = F.P(i + w - .5 - ins, j - .5 + ins, z), c = F.P(i + w - .5 - ins, j + h - .5 - ins, z), d = F.P(i - .5 + ins, j + h - .5 - ins, z);
    const bg = F.P(i + w - .5 - ins, j - .5 + ins, 0), cg = F.P(i + w - .5 - ins, j + h - .5 - ins, 0), dg = F.P(i - .5 + ins, j + h - .5 - ins, 0);
    if (z > 0){
      g.fillStyle = cols[2]; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(cg[0], cg[1]); g.lineTo(bg[0], bg[1]); g.closePath(); g.fill();   // the right face
      g.fillStyle = cols[1]; g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(c[0], c[1]); g.lineTo(cg[0], cg[1]); g.lineTo(dg[0], dg[1]); g.closePath(); g.fill();   // the left face
    }
    g.fillStyle = cols[0]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = .6; g.stroke();
    return a;
  }
  function sectorPoly(F, s){
    const c = s % 8, r = (s/8) | 0, M_ = M, ia = M_.i0 - .5 + c*M_.ni/8, ib = M_.i0 - .5 + (c + 1)*M_.ni/8, ja = M_.j0 - .5 + r*M_.nj/6, jb = M_.j0 - .5 + (r + 1)*M_.nj/6;
    return [F.P(ia, ja, 0), F.P(ib, ja, 0), F.P(ib, jb, 0), F.P(ia, jb, 0)].map(p => [p[0] + F.tw/2*0, p[1]]);
  }
  function polyPath(g, pts){ g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }
  // draws the city within B; opts.labels: sector numbers, edge letters, roads named
  function drawCity(g, W, H, B, opts){
    const F = fit(B, W, H, opts.pad), d = DPR(), inB = (i, j) => i >= B.i0 - .01 && i <= B.i1 + .01 && j >= B.j0 - .01 && j <= B.j1 + .01;
    // the field of dots behind it
    g.fillStyle = '#040505'; g.fillRect(0, 0, W, H);
    let rs = 7; const rnd = () => (rs = (rs*16807) % 2147483647)/2147483647;
    for (let k = 0; k < (W*H)/(900*d*d); k++){ g.fillStyle = 'rgba(160,175,168,' + (.05 + rnd()*.18) + ')'; g.fillRect(rnd()*W, rnd()*H, d*(rnd() < .1 ? 1.4 : .8), d*(rnd() < .1 ? 1.4 : .8)); }
    // the ground of each sector, and their seams
    if (opts.labels) for (let s = 0; s < 48; s++){ const st = M.sec[s].state; polyPath(g, sectorPoly(F, s)); g.fillStyle = st === 'vac' ? 'rgba(255,255,255,.012)' : st === 'turned' ? 'rgba(164,73,47,.07)' : 'rgba(79,154,98,.045)'; g.fill(); }
    // the roads: highways as dark slabs, the metro as a pale line
    for (const [h, tl] of M.hw) for (const [i, j] of tl) if (inB(i, j)) prism(g, F, i, j, 1, 1, 0, ['#151917', '#151917', '#151917'], -.02);
    if (M.mt.size){ g.strokeStyle = 'rgba(120,170,200,.55)'; g.lineWidth = 1.4*d; g.setLineDash([3*d, 2*d]);
      for (const k of M.mt){ const [i, j] = k.split(',').map(Number); if (!inB(i, j)) continue; const p = F.P(i, j, 0);
        for (const [di, dj] of [[1, 0], [0, 1]]) if (M.mt.has((i + di) + ',' + (j + dj))){ const q = F.P(i + di, j + dj, 0); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); } }
      g.setLineDash([]); }
    if (opts.labels) for (let s = 0; s < 48; s++){ polyPath(g, sectorPoly(F, s)); g.strokeStyle = 'rgba(150,165,158,.16)'; g.lineWidth = d*.8; g.setLineDash([2*d, 3*d]); g.stroke(); g.setLineDash([]); }
    // the blocks, back to front
    const items = [];
    for (const p of M.plots) if (inB(p.i, p.j)) items.push({ k: p.i + p.j, i: p.i, j: p.j, w: 1, h: 1, lv: p.lv, cols: SCOL[M.sec[M.secOf(p.i, p.j)].state] });
    for (const m of M.megs) if (inB(m.i, m.j) || inB(m.i + m.w - 1, m.j + m.h - 1)) items.push({ k: m.i + m.j + (m.w + m.h)/2 - 1, i: m.i, j: m.j, w: m.w, h: m.h, lv: m.lv, cols: SCOL.mega, mega: m });
    items.sort((a, b) => a.k - b.k || a.i - b.i);
    const tops = [];
    for (const it of items){
      const z = Math.max(it.lv ? 2*d : 0, it.lv*F.lz*(it.mega ? .55 : 1)), a = prism(g, F, it.i, it.j, it.w, it.h, z, it.cols, it.mega ? .08 : .17);
      if (it.mega && it.mega.m === spire) tops.push(F.P(it.i + it.w/2 - .5, it.j + it.h/2 - .5, z));
    }
    // the sodium lamps at the street corners
    const lamps = [];
    for (const p of M.plots) if (inB(p.i, p.j) && (hsh(p.i + ':' + p.j) % 3) === 0){ const q = F.P(p.i + .5, p.j + .5, 0); lamps.push(q); g.fillStyle = 'rgba(255,168,52,.18)'; g.beginPath(); g.arc(q[0], q[1], 2.6*d, 0, 7); g.fill(); g.fillStyle = '#ffb44a'; g.fillRect(q[0] - .6*d, q[1] - .6*d, 1.2*d, 1.2*d); }
    // the Spire's sector, outlined in red; the numbers; the edges lettered; the roads named
    if (opts.labels){
      if (M.spSec >= 0){ polyPath(g, sectorPoly(F, M.spSec)); g.strokeStyle = '#e5432d'; g.lineWidth = 1.6*d; g.stroke(); }
      g.font = '600 ' + (8*d) + 'px JetBrains Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let s = 0; s < 48; s++){ const P = sectorPoly(F, s), cx = (P[0][0] + P[2][0])/2, cy = (P[0][1] + P[2][1])/2, st = M.sec[s].state, lb = String(s + 1);
        const bw = g.measureText(lb).width + 6*d, bh = 11*d;
        g.fillStyle = st === 'vac' ? 'rgba(40,45,42,.85)' : M.spSec === s ? '#e5432d' : st === 'nxt' ? '#ffa834' : '#e8ebe9'; g.fillRect(cx - bw/2, cy - bh/2, bw, bh);
        g.fillStyle = st === 'vac' ? '#6b736f' : M.spSec === s ? '#fff' : '#0a0c0b'; g.fillText(lb, cx, cy + .5*d); }
      g.fillStyle = '#7d8581'; g.font = (8.5*d) + 'px JetBrains Mono, monospace';
      for (let c = 0; c < 8; c++){ const p = F.P(M.i0 - .5 + (c + .5)*M.ni/8, M.j0 - 1.6, 0); g.fillText('ABCDEFGH'[c], p[0], p[1]); }
      for (let r = 0; r < 6; r++){ const p = F.P(M.i0 - 1.6, M.j0 - .5 + (r + .5)*M.nj/6, 0); g.fillText(String(r + 1), p[0], p[1]); }
      const used = new Set(); let q = 0;
      for (const [h, tl] of M.hw){ if (tl.length < 3) continue; const is = tl.map(t => t[0]), js = tl.map(t => t[1]), ew = Math.max(...is) - Math.min(...is) >= Math.max(...js) - Math.min(...js);
        let nm = 'DRIVE ' + (ew ? 'E' : 'N'); if (used.has(nm)) nm = 'DRIVE ' + (ew ? 'W' : 'S'); if (used.has(nm)) nm = 'DRIVE ' + (++q + 1); used.add(nm);
        const [i, j] = tl[(tl.length/2) | 0], p = F.P(i, j, 0); g.font = '600 ' + (7.5*d) + 'px JetBrains Mono, monospace'; const w = g.measureText(nm).width + 6*d;
        g.fillStyle = 'rgba(4,5,5,.85)'; g.fillRect(p[0] - w/2, p[1] - 5*d, w, 10*d); g.strokeStyle = '#3a403d'; g.lineWidth = d*.8; g.strokeRect(p[0] - w/2, p[1] - 5*d, w, 10*d); g.fillStyle = '#a8b0ac'; g.fillText(nm, p[0], p[1] + .5*d); }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    return { F, tops, lamps };
  }

  /* ---------- the desk ---------- */
  function dom(){
    const m = M, hr = m.hour, nx = m.next, frac = m.live ? m.turned/m.live : 0;
    const dayN = typeof STORY !== 'undefined' && STORY.day ? STORY.day() + 1 : 1, dawn = ((6 - hr) + 24) % 24;
    const tiersSorted = m.tier.filter(t => t.at !== null).map(t => ({ t, dt: (t.at - hr + 24) % 24 })).sort((a, b) => a.dt - b.dt);
    const tNext = tiersSorted[0] ? ROM[tiersSorted[0].t.t] : 'I', tPrev = tiersSorted.length ? ROM[tiersSorted[tiersSorted.length - 1].t.t] : 'IV';
    const spLbl = m.spSec >= 0 ? 'S' + (m.spSec + 1) : 'S--', segs = Array.from({ length: 24 }, (_, k) => k < Math.round(frac*24) ? 'on' : k === Math.round(frac*24) ? 'hot' : '');
    root = document.createElement('div'); root.id = 'ovs'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'High Overseer');
    root.innerHTML = `
      <div class="top boot">
        <div class="c"><small>NEON TERRARIUM</small><span class="v">OVERSEER · DESK 1</span><small>DATA SPIRE · ${spLbl}</small></div>
        <div class="c opt"><small>PLOTS ${fmt(m.plots.length)}</small><span class="v">CITIZENS ${fmt(m.pop)}</span><small>STRUCT ${m.megs.length} · H ${hr.toFixed(2)}</small></div>
        <div class="c"><small>TURNING</small><span class="v"><i class="sq"></i>&nbsp; TIER ${tPrev} <span class="dim">→</span> <span class="amb">${tNext}</span></span><small>&nbsp;</small></div>
        <div class="c fix"><div class="row"><div style="display:flex;flex-direction:column;gap:3px"><small>${nx ? 'SECTOR ' + nx.n + ' NEXT' : 'ALL SECTORS'}</small><span class="v">TURN AT ${nx ? hm(nx.at) : '--:--'}</span><small>#${nx ? nx.q : '--'} / 48</small></div>
          <div style="display:flex;flex-direction:column;gap:2px"><small class="amb">ARCHIVE · COAST.MEM</small><span class="big">63%</span></div></div></div>
        <div class="c opt2"><small>NEXT ${nx ? 'S' + nx.n : '--'} · ${nx ? hm(nx.dt).replace(':', 'H ') + 'M' : '--'}</small><span class="v">${m.turned} / 48 TURNED</span><small>${m.live} LIVE · SLIP 0 S</small></div>
        <div class="c"><small>TURN ${tPrev} → ${tNext} · RING ${Math.max(1, Math.ceil(frac*6))}</small><div class="seg">${segs.map(c => `<i class="${c}"></i>`).join('')}</div><small>${Math.round(frac*100)}% · ${m.turned}/${m.live || 0}</small></div>
        <div class="c"><small>AWAKE</small><span class="v grn">${fmt(m.awake)}</span><small>ASLEEP <b>${fmt(m.asleep)}</b></small></div>
        <div class="c opt"><small>CONTROLLER</small><span class="v">HIGH OVERSEER</span><small><span class="amb">LEVER 1 ARMED</span> · ${spLbl}</small></div>
        <div class="c fix"><span class="clock clk">${hm(hr)}:00</span><small>DAY ${dayN} · ${dawn.toFixed(2)} H TO DAWN</small></div>
      </div>
      <div class="pn plan boot"><header><span class="k">A</span>PLAN · NEON TERRARIUM · 48 SECTORS<span class="r">${m.ni} × ${m.nj} PLOTS · N ↑</span></header>
        <canvas class="iso"></canvas>
        <div class="inset"><h5><span>INSET · ${spLbl} · SPIRE</span><span class="dim">UPLINK</span></h5><canvas class="ins"></canvas></div>
        <div class="callout"></div>
        <div class="legend"><h5>LEGEND</h5><span><i style="background:#4f9a62"></i>PENDING</span><span><i style="background:#a4492f"></i>TURNED</span><span><i style="background:#d8c59c"></i>STANDBY</span><span><i style="background:#ffa834"></i>NEXT</span>
          <span><i style="background:#3a403d"></i>VACANT</span><span><i style="background:#d0d6d2"></i>STRUCTURE</span><span><i style="border:1.5px solid #e5432d"></i>UPLINK</span><span><i style="background:#ffb44a;border-radius:50%;transform:scale(.55)"></i>LAMP</span></div>
        <div class="ask"><div class="hd"><span class="k">!</span>ARCHIVE REQUEST · ${spLbl} UPLINK<span style="margin-left:auto" class="blink">●</span></div>
          <div class="bd"><h1 class="glitch">HIGH OVERSEER</h1><div class="sub">MEMORY ARCHIVE // COASTAL SECTOR // FRAGMENT 03</div>
          <p class="say"></p>
          <div class="btns"><button class="btn yes" type="button">YES<small>[ Y ]</small></button><button class="btn no" type="button">NO<small>[ N / ESC ]</small></button></div></div></div>
      </div>
      <div class="pn sched boot"><header><span class="k">B</span>TURN SCHEDULE<span class="r">${hm(hr)} · ${m.live} LIVE</span></header>
        <div class="tw"><table><colgroup><col style="width:26px"><col style="width:44px"><col style="width:48px"><col style="width:74px"><col style="width:46px"><col style="width:46px"><col><col style="width:30px"><col style="width:42px"></colgroup>
          <thead><tr><th>#</th><th>SECTOR</th><th>TURN AT</th><th>STATE</th><th>WAKES</th><th>BODIES</th><th>18 · 00 · 06</th><th>HOLD</th><th>CHECK</th></tr></thead><tbody></tbody></table></div>
        <div class="ilk"><div class="bar">${Array.from({ length: 30 }, (_, k) => `<i class="${k >= 28 ? 'r' : k > 24 ? 'off' : ''}"></i>`).join('')}</div>
          <div class="rd"><span>LOCK ERR <b>0</b></span><span>INTERLOCK <span class="grn">OK</span></span><span>SLIP <b>0 S</b></span><span>UPLINK <span class="amb blink">${spLbl}</span></span></div></div>
      </div>
      <div class="bot">
        <div class="pn tiers boot"><header><span class="k">C</span>TIERS<span class="r">0 — 24 H</span></header><div class="rows"></div></div>
        <div class="pn log boot"><header><span class="k">D</span>CROSSINGS LOG<span class="r blink">REC</span></header>
          <table><colgroup><col style="width:58px"><col style="width:80px"><col><col style="width:40px"><col style="width:40px"><col style="width:78px"></colgroup>
          <thead><tr><th>TIME</th><th>PERMIT</th><th>TAG</th><th>SEAM</th><th>GATE</th><th>STATUS</th></tr></thead><tbody></tbody></table></div>
        <div class="pn hold boot"><header><span class="k">E</span>HOLD<span class="r">MANUAL 9.4</span></header>
          <div class="bd"><div class="ind"><span><i class="g"></i>ARM</span><span><i class="a"></i>GRIP</span><span><i></i>FREE</span><span class="dim" style="margin-left:auto">LEVER 1</span></div><div>
            <svg viewBox="0 0 112 104"><path d="M14 86 A46 46 0 0 1 98 86" fill="none" stroke="#262b28" stroke-width="7"/><path d="M14 86 A46 46 0 0 1 40 46" fill="none" stroke="#3f8f57" stroke-width="7"/><path d="M74 46 A46 46 0 0 1 98 86" fill="none" stroke="#8c2f1f" stroke-width="7"/>
              <text x="8" y="100" fill="#6b736f" font-size="7" font-family="JetBrains Mono" letter-spacing="1">NORMAL</text><text x="80" y="100" fill="#6b736f" font-size="7" font-family="JetBrains Mono" letter-spacing="1">HOLD</text>
              <g class="lev" style="transform-origin:56px 86px"><line x1="56" y1="86" x2="56" y2="34" stroke="#e8ebe9" stroke-width="3"/><rect x="49" y="24" width="14" height="12" fill="#ffa834"/></g><circle cx="56" cy="86" r="6" fill="#0a0c0b" stroke="#a8b0ac"/></svg></div>
            <div><div class="kv"><span>HOLD AVAILABLE</span><span class="amb">90 S</span><span>SLIP</span><span>0 S</span><span>HOLDS THIS YEAR</span><span>2</span><span>ARCHIVE</span><span class="amb">FRAGMENT 03</span><span>CIRCUIT</span><span class="grn">A · OK</span></div>
              <div class="mimic">${m.sec.map(s => `<i class="${s.state === 'nxt' ? 'nx' : ''}" style="background:${s.k === m.spSec ? '#e5432d' : SCOL[s.state][0]}"></i>`).join('')}</div></div></div></div>
      </div>
      <div class="scan"></div>`;
    document.body.appendChild(root);
    root.querySelectorAll('.boot').forEach((el, k) => { el.style.animationDelay = (.07*k) + 's'; });
    $('.yes').addEventListener('click', yes); $('.no').addEventListener('click', no);
    tiersDom(); logInit();
    // the question types itself out
    const say = $('.say'), Q = 'A record of the coast survives in the archive. It is incomplete. Would you like to remember?'; let qi = 0;
    const tick = () => { if (!O.open) return; if (qi < Q.length){ qi = Math.min(Q.length, qi + 2); say.innerHTML = Q.slice(0, qi) + '<span class="cur"></span>'; typingT = setTimeout(tick, 24); } };
    typingT = setTimeout(tick, 900);
  }
  // B: as many rows as fit, the NEXT one among them
  function schedDom(){
    const tw = $('.tw'), tb = tw.querySelector('tbody'), H = tw.clientHeight - 22, fitN = Math.max(4, Math.floor(H/18));
    const live = M.order.filter(s => s.state !== 'vac'), ni = Math.max(0, live.findIndex(s => s.state === 'nxt'));
    let a = Math.max(0, Math.min(ni - 4, live.length - fitN)); const rows = live.slice(a, a + fitN - (live.length > fitN ? 1 : 0));
    if (live.length > fitN && rows[rows.length - 1] !== live[live.length - 1]) rows.push(live[live.length - 1]);
    const word = { turned: 'TURNED', nxt: 'NEXT', stb: 'STANDBY', pend: 'PENDING', vac: 'VACANT' }, ev = h => ((h - 18 + 24) % 24);
    const evs = rows.map(s => ev(s.at)).concat([ev(M.hour)]), lo = Math.min(...evs) - .25, hi = Math.max(...evs) + .25, pos = h => (ev(h) - lo)/(hi - lo)*100;
    const th = tw.querySelector('thead th:nth-child(7)'); if (th) th.textContent = hm(lo + 18) + ' → ' + hm(hi + 18);
    tb.innerHTML = rows.map(s => `<tr class="${s.state === 'nxt' ? 'next' : ''} ${s.state === 'turned' ? 'turnd' : ''}"><td>${p2(s.q)}</td><td>S${s.n} <span class="dim">${'ABCDEFGH'[s.k % 8]}${((s.k/8) | 0) + 1}</span></td><td>${hm(s.at)}</td>
      <td><span class="st ${s.state}">${word[s.state]}</span></td><td>${s.wk !== null ? hm(s.wk) : '--'}</td><td>${fmt(s.ppl)}</td><td class="tl"><i style="left:calc(5px + (100% - 10px)*${(pos(s.at)/100).toFixed(3)})"></i></td>
      <td>${s.k === M.spSec ? '<span class="amb">90</span>' : '<span class="dim">—</span>'}</td><td>${s.cops ? '<span class="grn">■ ' + s.cops + '</span>' : '<span class="dim">□</span>'}</td></tr>`).join('');
    // the NOW line down the timeline column
    const first = tb.querySelector('td.tl'); if (!first) return;
    const r = first.getBoundingClientRect(), R = tw.getBoundingClientRect(), x = r.left - R.left + 5 + (r.width - 10)*pos(M.hour)/100;
    const n = document.createElement('div'); n.className = 'now'; n.style.left = x + 'px'; n.innerHTML = '<span>NOW</span>'; tw.appendChild(n);
  }
  function tiersDom(){
    const hb = (a, b, c) => { if (a === null || b === null) return ''; const L = h => (h/24*100).toFixed(2) + '%';
      return b >= a ? `<i style="left:${L(a)};width:${L(b - a)};background:${c}"></i>` : `<i style="left:0;width:${L(b)};background:${c}"></i><i style="left:${L(a)};right:0;background:${c}"></i>`; };
    const hr = M.hour;
    $('.tiers .rows').innerHTML = `<div class="tr h"><span></span><span>TIER</span><span>POP</span><span style="display:flex;justify-content:space-between"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></span><span>AWAKE / ASLEEP</span><span>STATE</span></div>` +
      M.tier.map(t => { const asl = t.pop - t.awake, toBed = t.at !== null ? (t.at - hr + 24) % 24 : 99, toWake = t.wk !== null ? (t.wk - hr + 24) % 24 : 99;
        const st = !t.pop ? ['NONE', 'dim'] : toWake < 1 && asl > 0 ? ['WAKING', 'grn'] : toBed < 1 ? ['GOING UNDER', 'amb'] : asl > t.awake ? ['SEDATED', 'red'] : ['AWAKE', 'w'];
        return `<div class="tr"><span class="rn" style="color:${TIER_COL[t.t]}">${ROM[t.t]}</span><span>${TIER_NAME[t.t]}</span><span class="w">${fmt(t.pop)}</span>
          <span class="hb">${hb(t.wk, t.at, TIER_COL[t.t])}<u style="left:${(hr/24*100).toFixed(2)}%"></u></span><span class="aw"><span class="grn">${fmt(t.awake)}</span> <span class="dim">/</span> ${fmt(asl)}<br><span class="dim">${t.wk !== null ? hm(t.wk) + '–' + hm(t.at) : '--'}</span></span><span class="ss ${st[1]}">${st[0]}</span></div>`; }).join('');
  }
  // D: a row now and then: someone crossing a seam between sectors
  let logRows = [], logT = 0;
  function logRow(alert, ago = 0){
    const ppl = typeof pplList !== 'undefined' ? pplList : []; if (!ppl.length) return null;
    const p = ppl[(Math.random()*ppl.length) | 0], home = places.get(p.home), job = p.job && places.get(p.job);
    const sh = home ? M.secOf(Math.round(home.x/LOT), Math.round(home.z/LOT)) + 1 : 1, sj = job ? M.secOf(Math.round(job.x/LOT), Math.round(job.z/LOT)) + 1 : ((hsh(p.id + 'g') % 48) + 1);
    let tag = 'RESIDENT'; try { tag = STORY.descOf(p.id); } catch (e){}
    tag = String(tag).replace(/^an? /, '').toUpperCase();
    const st = alert ? ['NO PERMIT', 'red'] : p.cop ? ['PATROL', 'grn'] : p.courier ? ['COURIER', 'amb'] : Math.random() < .12 ? ['SEAM CREW', 'amb'] : ['CLEARED', 'dim'];
    const t = M.hour*3600 + (performance.now() - t0)/1000 - ago;
    return { alert, html: `<td>${hms(t)}</td><td>${permit(p.id)}</td><td>${esc(tag)}</td><td>S${sh}</td><td>G${sj}</td><td class="${st[1]}">${st[0]}</td>` };
  }
  function logInit(){
    logRows = []; const tb = $('.log tbody'); if (!tb) return;
    let ago = 0; for (let k = 0; k < 8; k++){ ago += 4 + Math.random()*40; const r = logRow(k === 0, ago); if (r) logRows.push(r); }
    tb.innerHTML = logRows.map(r => `<tr class="${r.alert ? 'alert' : ''}">${r.html}</tr>`).join('');
  }
  function logPush(){
    const tb = $('.log tbody'), r = logRow(Math.random() < .08); if (!tb || !r) return;
    const tr = document.createElement('tr'); tr.className = 'in' + (r.alert ? ' alert' : ''); tr.innerHTML = r.html; tb.insertBefore(tr, tb.firstChild);
    const H = tb.parentElement.parentElement.clientHeight - 22; while (tb.children.length > 2 && tb.offsetHeight + 22 > H) tb.lastChild.remove();
  }

  /* ---------- the live canvases (30 frames a second while open) ---------- */
  let cv = {}, base = null, ins = null, streams = [];
  function sizeCanvas(c){ const r = c.getBoundingClientRect(), d = DPR(); c.width = Math.max(1, Math.round(r.width*d)); c.height = Math.max(1, Math.round(r.height*d)); return c.getContext('2d'); }
  function setupCanvases(){
    cv.i = $('canvas.iso'); cv.ig = sizeCanvas(cv.i); cv.n = $('canvas.ins'); cv.ng = sizeCanvas(cv.n);
    const d = DPR(), W = cv.i.width, H = cv.i.height, askR = $('.ask').getBoundingClientRect(), cR = cv.i.getBoundingClientRect();
    // the plan, drawn once to its own canvas, left of the question
    base = document.createElement('canvas'); base.width = W; base.height = H; const bg = base.getContext('2d');
    const room = Math.max(.62, 1 - (askR.width + 20)/cR.width*.55);
    bg.save(); const sub = document.createElement('canvas'); sub.width = Math.round(W*room); sub.height = H;
    const r = drawCity(sub.getContext('2d'), sub.width, H, { i0: M.i0, i1: M.i1, j0: M.j0, j1: M.j1 }, { labels: true, pad: .05 });
    const dy = H*.06; bg.fillStyle = '#040505'; bg.fillRect(0, 0, W, H); drawCity(bg, W, H, { i0: 0, i1: -1, j0: 0, j1: -1 }, { pad: 0 }); bg.drawImage(sub, 0, -dy); bg.restore();
    const up = q => [q[0], q[1] - dy];
    base.F = Object.assign({}, r.F, { P: (i, j, z) => up(r.F.P(i, j, z)) }); base.lamps = r.lamps.map(up); base.spire = r.tops[0] ? up(r.tops[0]) : null;
    // the leader from the question to the Spire, and from the callout to whoever it names
    const ax = (askR.left - cR.left)*d, ay = (askR.top - cR.top + 34)*d;
    if (base.spire){ const [sx, sy] = base.spire; bg.strokeStyle = '#ffa834'; bg.lineWidth = d; bg.beginPath(); bg.moveTo(ax, ay); bg.lineTo(ax - 18*d, ay); bg.lineTo(sx, sy); bg.stroke();
      bg.beginPath(); bg.arc(sx, sy, 4*d, 0, 7); bg.stroke(); bg.fillStyle = '#ffa834'; bg.fillRect(sx - 1.5*d, sy - 1.5*d, 3*d, 3*d); }
    calloutPlace(bg, cR, d);
    // the inset: the Spire's own few blocks, close
    if (M.sp){ const s = M.sp; ins = drawCity(cv.ng, cv.n.width, cv.n.height, { i0: s.i - 3, i1: s.i + s.w + 2, j0: s.j - 3, j1: s.j + s.h + 2 }, { pad: .06 }); }
    else { cv.ng.fillStyle = '#040505'; cv.ng.fillRect(0, 0, cv.n.width, cv.n.height); }
    // the faint data streams falling over the plan (it's being read)
    const cols = Math.floor(W/(26*d)); streams = Array.from({ length: cols }, (_, k) => ({ x: k*26*d + 6*d, y: Math.random()*H, v: (18 + Math.random()*40)*d, n: 6 + (Math.random()*10 | 0), on: Math.random() < .45, ch: Array.from({ length: 16 }, () => HEX[Math.random()*16 | 0]) }));
    schedDom();
  }
  function calloutPlace(bg, cR, d){
    const el = $('.callout'), p = M.who; if (!p){ el.style.display = 'none'; return; }
    const home = places.get(p.home), i = Math.round(home.x/LOT), j = Math.round(home.z/LOT), sk = M.secOf(i, j), F = base.F;
    const plot = M.plots.find(q => q.i === i && q.j === j), pt = F.P(i, j, (plot ? plot.lv : 2)*F.lz);
    let tag = 'RESIDENT'; try { tag = STORY.descOf(p.id); } catch (e){}
    const zone = plot && plot.zone, t = ZONE_T[zone] ?? 1, out = typeof asleep === 'function' && !asleep(p, M.hour);
    el.innerHTML = `<b>${permit(p.id)}</b> &nbsp;${esc(String(tag).replace(/^an? /, '').toUpperCase())}<br>TIER ${ROM[t]} · ${p.cop ? 'PATROL' : p.courier ? 'COURIER' : p.job ? 'WORKER' : 'RESIDENT'} · ${p.courier && out ? 'NO PERMIT' : out ? 'OUT' : 'IN'}<br><span style="color:#c98a7e">SEEN S${sk + 1} · ${hm(M.hour)}</span>`;
    const w = el.offsetWidth, h = el.offsetHeight, px = pt[0]/d, py = pt[1]/d + 22;
    let x = px - w - 40, y = py - h - 46; if (x < 8) x = px + 40; if (y < 30) y = py + 40;
    const askR = $('.ask').getBoundingClientRect(); if (x + w > askR.left - cR.left - 8 && y + h > askR.top - cR.top) y = Math.max(30, askR.top - cR.top - h - 10);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    const ex = (x + (x < px ? w : 0))*d, ey = (y - 22 + h)*d;
    bg.strokeStyle = '#e5432d'; bg.lineWidth = d; bg.beginPath(); bg.moveTo(ex, ey); bg.lineTo(pt[0], pt[1]); bg.stroke(); bg.beginPath(); bg.arc(pt[0], pt[1], 3.5*d, 0, 7); bg.stroke();
  }
  function drawPlan(t, dt){
    const g = cv.ig, W = cv.i.width, H = cv.i.height, d = DPR(); g.drawImage(base, 0, 0);
    // the streams
    g.font = (9*d) + 'px JetBrains Mono, monospace';
    for (const s of streams){ if (!s.on) continue; s.y += s.v*dt; if (s.y - s.n*11*d > H){ s.y = -Math.random()*H*.5; s.on = Math.random() < .6; }
      if (Math.random() < .1) s.ch[(Math.random()*16) | 0] = HEX[(Math.random()*16) | 0];
      for (let k = 0; k < s.n; k++){ g.fillStyle = k === 0 ? 'rgba(255,208,138,.55)' : 'rgba(150,190,170,' + (.16*(1 - k/s.n)) + ')'; g.fillText(s.ch[k % 16], s.x, s.y - k*11*d); } }
    // the next sector to turn, breathing; a handful of lamps flickering
    if (M.next){ polyPath(g, sectorPoly(base.F, M.next.k)); g.strokeStyle = 'rgba(255,168,52,' + (.35 + .45*(.5 + .5*Math.sin(t*4))) + ')'; g.lineWidth = 1.6*d; g.stroke(); }
    for (let k = 0; k < 5 && base.lamps.length; k++){ const q = base.lamps[(Math.random()*base.lamps.length) | 0]; g.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.8)' : 'rgba(255,200,120,.9)'; g.fillRect(q[0] - d, q[1] - d, 2*d, 2*d); }
    // the reading head drifting over the plan, and a scan line crossing it
    const cx = W*.36 + Math.sin(t*.37)*W*.22, cy = H*.5 + Math.cos(t*.29)*H*.28;
    g.strokeStyle = 'rgba(255,168,52,.6)'; g.lineWidth = d; g.beginPath(); g.moveTo(cx - 14*d, cy); g.lineTo(cx - 4*d, cy); g.moveTo(cx + 4*d, cy); g.lineTo(cx + 14*d, cy); g.moveTo(cx, cy - 14*d); g.lineTo(cx, cy - 4*d); g.moveTo(cx, cy + 4*d); g.lineTo(cx, cy + 14*d); g.stroke();
    g.fillStyle = 'rgba(255,168,52,.85)'; g.fillText((cx/W*M.ni + M.i0).toFixed(2) + ' / ' + (cy/H*M.nj + M.j0).toFixed(2), cx + 16*d, cy - 8*d);
    const sy = ((t*.12) % 1)*H; const gr = g.createLinearGradient(0, sy - 30*d, 0, sy); gr.addColorStop(0, 'rgba(255,168,52,0)'); gr.addColorStop(1, 'rgba(255,168,52,.07)'); g.fillStyle = gr; g.fillRect(0, sy - 30*d, W, 30*d);
  }
  let lastClk = '';
  function loop(now){
    if (!O.open) return; raf = requestAnimationFrame(loop);
    if (now - last < 33) return; const dt = last ? Math.min(.1, (now - last)/1000) : 0; last = now; const t = now/1000, el = (now - t0)/1000;
    if (base) drawPlan(t, dt);
    const ck = hms(M.hour*3600 + el); if (ck !== lastClk){ lastClk = ck; const c = $('.clk'); if (c) c.textContent = ck; }
    logT += dt; if (logT > 2.4){ logT = 0; logPush(); }
    const lv = $('.lev'); if (lv) lv.style.transform = 'rotate(' + (-38 + Math.sin(t*.8)*3) + 'deg)';
  }

  /* ---------- in and out ---------- */
  // the curtain: glyphs falling in columns, each column's black following its glyph down, closing over the city
  function curtain(ms, then){
    const c = document.createElement('canvas'); c.id = 'ovsCurtain'; const dpr = DPR(); c.width = innerWidth*dpr; c.height = innerHeight*dpr; c.style.width = '100%'; c.style.height = '100%';
    document.body.appendChild(c); const g = c.getContext('2d'), cw = 14*dpr, cols = Math.ceil(c.width/cw), sp = Array.from({ length: cols }, () => .55 + Math.random()*.9), dl = Array.from({ length: cols }, () => Math.random()*.35);
    const ts = performance.now();
    const step = (now) => { const u = Math.min(1, (now - ts)/ms); g.font = (12*dpr) + 'px JetBrains Mono, monospace';
      for (let k = 0; k < cols; k++){ const p = Math.max(0, Math.min(1.15, (u - dl[k])/(1 - dl[k]*.6)*sp[k])), y = p*c.height;
        g.fillStyle = '#040505'; g.fillRect(k*cw, 0, cw + 1, y - 12*dpr);
        g.fillStyle = Math.random() < .15 ? '#ffd38a' : 'rgba(255,181,71,.85)'; g.fillText(GLY[(Math.random()*GLY.length) | 0], k*cw + 2*dpr, y - 12*dpr);
        g.fillStyle = 'rgba(170,220,200,.5)'; g.fillText(HEX[(Math.random()*16) | 0], k*cw + 2*dpr, y - 26*dpr); }
      if (u < 1) requestAnimationFrame(step); else { g.fillStyle = '#040505'; g.fillRect(0, 0, c.width, c.height); then(c); } };
    requestAnimationFrame(step);
  }
  O.show = (m) => {
    if (O.open || O.busy) return; O.busy = true; if (!built) build();
    spire = m || (typeof megas !== 'undefined' ? [...megas.values()].find(q => q.kind === 'spire') : null) || null;
    if (typeof MON !== 'undefined' && MON.close) try { MON.close(); } catch (e){}
    if (typeof music !== 'undefined' && music.hold) music.hold(true);   // (the radio goes quiet while the desk is up)
    const city = canvas; city.classList.add('ovs-glitch');
    const bars = document.createElement('div'); bars.id = 'ovsBars'; document.body.appendChild(bars);
    setTimeout(() => curtain(650, (c) => {
      O.open = true; O.hold = true; t0 = performance.now(); model(); dom(); last = 0;
      // (the canvases are sized once the panels have their size: after the boot animations' first frame)
      requestAnimationFrame(() => { if (!O.open) return; setupCanvases(); raf = requestAnimationFrame(loop); });
      resizeH = () => { if (O.open && root){ root.querySelectorAll('.now').forEach(n => n.remove()); setupCanvases(); } }; addEventListener('resize', resizeH);
      if (city) city.classList.remove('ovs-glitch'); bars.remove();
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 150, fill: 'forwards' }).onfinish = () => c.remove();
      keyH = e => { if (!O.open) return; e.stopPropagation(); const k = e.key.toLowerCase(); if (k === 'y') yes(); else if (k === 'n' || k === 'escape') no(); };
      addEventListener('keydown', keyH, true);
      setTimeout(() => { const b = $('.yes'); if (b) b.focus({ preventScroll: true }); O.busy = false; }, 700);
    }), 380);
  };
  function closeDesk(){ O.open = false; cancelAnimationFrame(raf); clearTimeout(typingT); if (keyH) removeEventListener('keydown', keyH, true); keyH = null; if (resizeH) removeEventListener('resize', resizeH); resizeH = null; base = null; }
  function no(){
    if (!O.open || O.busy) return; O.busy = true; O.hold = false;   // (the city draws again under the desk as it leaves)
    if (typeof music !== 'undefined' && music.hold) music.hold(false);
    root.classList.add('leave'); setTimeout(() => { closeDesk(); root.remove(); root = null; O.busy = false; }, 520);
  }
  function yes(){
    if (!O.open || O.busy) return; O.busy = true; $('.say').innerHTML = 'Remembering<span class="cur"></span>';
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
