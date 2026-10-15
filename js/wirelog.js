// Neon Terrarium: the transmission log. Once the Wire Nest has arrived, a panel at the top right listens to the city and
// reports to the operator in short, dry fragments: CITY (read from the city as it stands), MESH (the network), CORP
// (the corporations' bulletins) and SIGNAL (something out there, slowly getting closer). It moves through stages as
// play goes on: CITY alone at first, then the meshes, then a data leak on mesh A that the player can answer with an agent
// swarm (which types out the same commands the hacking uses later, so the player learns them by watching), then the
// signal ladder. Only the last 40 lines are kept; the ones that matter (the leak, files pulled) also go to an archive.
// Content plan: claude/transmission-log-plan.md in the project. Ticked from main.js; saves in this browser.
// Under the lines, a prompt: the player types the same commands the swarm does (-probe, -cd, -ls, -scan, -read, -pull,
// -deploy, and -help, never pointed at) against the corporations' file systems (wirefs.js). Click it or press / to type;
// while typing the game's keys are off; Esc leaves; Up recalls; Tab completes.
'use strict';
const WIRELOG = (() => {
  const KEY = 'neonIsland.wirelog', COLLAPSE_KEY = 'neonIsland.wirelog.collapsed';
  const MAX_LINES = 40, MAX_ARCHIVE = 30;
  // stage timings, real seconds with the log running (WIRELOG.dev.fast() divides them)
  const T = { s1: 150, s2: 240, s3: 360, reoffer: 180, gapLo: 8, gapHi: 15 };
  // the corporations: SynthCorp is settled, the other three are placeholders until they get their names
  const CORP = { synth: 'SYNTHCORP', logi: 'HALVREN', media: 'MERIDIAN', civic: 'OSTRAVA' };
  const ZONE_NAME = { low: 'Zone A', mid: 'Zone B', high: 'Zone C', ind: 'Zone D' };

  const css = `
  #wirelog { --wl-bg: rgba(13,9,24,.94); --wl-line: rgba(214,92,255,.42); --wl-hair: rgba(214,92,255,.16); --wl-head: #ff6fb8; --wl-dim: #6f6888; --wl-txt: #d9d2ea;
    --c-city: #38e8e0; --c-mesh: #5affa8; --c-corp: #ffb347; --c-sig: #ff5a6e; --c-cmd: #f6d6ff;
    position: fixed; top: calc(58px + env(safe-area-inset-top,0px)); right: 16px; width: min(372px, calc(100vw - 32px)); z-index: 3;
    font: 10.5px/1.5 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--wl-txt); letter-spacing: .02em; }
  #wirelog[hidden] { display: none; }
  #wirelog .wl-box { background: var(--wl-bg); border: 1px solid var(--wl-line); contain: layout paint style; }
  #wirelog header { display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 6px 0 9px; border-bottom: 1px solid var(--wl-hair); cursor: pointer; user-select: none; }
  #wirelog header:hover .t, #wirelog header:focus-visible .t { color: #fff; } #wirelog header:focus-visible { outline: 1px solid var(--wl-line); outline-offset: -1px; }
  #wirelog header .chev { color: var(--wl-dim); font-size: 9px; width: 8px; text-align: center; }
  #wirelog header .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--wl-head); font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; }
  #wirelog header .t .short { display: none; }
  #wirelog header .r { flex-shrink: 0; margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--wl-dim); font-size: 9px; letter-spacing: .14em; white-space: nowrap; }
  #wirelog .live { display: inline-block; width: 6px; height: 6px; background: var(--c-mesh); animation: wlBlink 1.6s steps(2) infinite; }
  @keyframes wlBlink { 50% { opacity: .25; } }
  #wirelog header button { font: inherit; font-size: 9px; letter-spacing: .14em; color: var(--wl-dim); background: transparent; border: 1px solid var(--wl-hair); border-radius: 0; padding: 1px 6px; cursor: pointer; }
  #wirelog header button:hover, #wirelog header button:focus-visible { color: var(--wl-head); border-color: var(--wl-line); outline: none; }
  #wirelog header button.fresh { color: var(--c-corp); border-color: var(--c-corp); animation: wlBlink 1s steps(2) 6; }
  #wirelog .wl-body { height: 178px; overflow-y: auto; overflow-x: hidden; padding: 4px 0 5px; scrollbar-width: thin; scrollbar-color: var(--wl-line) transparent; }
  #wirelog.collapsed .wl-body, #wirelog.collapsed .wl-foot { display: none; }
  #wirelog.collapsed header { border-bottom: 0; }
  #wirelog .wl-line { display: grid; grid-template-columns: 38px 50px minmax(0,1fr); gap: 6px; padding: 0 9px; white-space: nowrap; opacity: .8; }
  #wirelog .wl-body > :nth-child(-n+4), #wirelog .wl-body > :nth-child(-n+4) .wl-line { opacity: 1; }
  #wirelog .wl-blk { border-left: 1px solid var(--wl-hair); margin-left: 2px; } #wirelog .wl-blk .wl-line { padding-left: 7px; }
  #wirelog .wl-line > span:last-child { overflow: hidden; text-overflow: ellipsis; }
  #wirelog .wl-line .ts { color: var(--wl-dim); font-variant-numeric: tabular-nums; }
  #wirelog .wl-line .ch { letter-spacing: .1em; font-size: 9.5px; }
  #wirelog .ch-CITY .ch { color: var(--c-city); } #wirelog .ch-MESH .ch { color: var(--c-mesh); } #wirelog .ch-CORP .ch { color: var(--c-corp); } #wirelog .ch-SIGNAL .ch { color: var(--c-sig); }
  #wirelog .ch-SYS .ch { color: var(--wl-head); } #wirelog .ch-CMD .ch { color: var(--wl-head); }
  #wirelog .opt .done { margin-left: 6px; color: var(--wl-dim); font-size: 9px; letter-spacing: .14em; }
  #wirelog .ch-CMD .tx { color: var(--c-cmd); } #wirelog .ch-SIGNAL .tx { color: #ffc2c9; }
  #wirelog .wl-line.key .tx { color: #fff; }
  #wirelog .cur { display: inline-block; width: .55em; height: 1.05em; background: var(--wl-head); vertical-align: -2px; margin-left: 1px; animation: wlBlink .8s steps(2) infinite; }
  #wirelog .wl-line.has-opt > span:last-child { overflow: visible; white-space: normal; }
  #wirelog .opt button { font: inherit; font-size: 9.5px; letter-spacing: .16em; margin-left: 6px; padding: 0 7px; border-radius: 0; cursor: pointer; background: transparent; color: var(--c-mesh); border: 1px solid var(--c-mesh); }
  #wirelog .opt button.n { color: var(--wl-dim); border-color: var(--wl-hair); }
  #wirelog .opt button:hover, #wirelog .opt button:focus-visible { background: var(--c-mesh); color: #07120c; outline: none; }
  #wirelog .opt button.n:hover, #wirelog .opt button.n:focus-visible { background: var(--wl-dim); color: #0d0918; }
  #wirelog .opt button:disabled { opacity: .35; pointer-events: none; }
  #wirelog .bar { color: var(--c-mesh); letter-spacing: -.5px; }
  #wirelog .wl-foot { display: flex; gap: 12px; padding: 3px 9px 4px; border-top: 1px solid var(--wl-hair); color: var(--wl-dim); font-size: 9px; letter-spacing: .12em; white-space: nowrap; overflow: hidden; }
  #wirelog .wl-foot b { color: var(--wl-txt); font-weight: 400; font-variant-numeric: tabular-nums; }
  /* the archive */
  #wirelog .arc { padding: 2px 0; }
  #wirelog .arc button.it { display: grid; grid-template-columns: 38px minmax(0,1fr) auto; gap: 6px; width: 100%; text-align: left; font: inherit; color: var(--wl-txt); background: transparent; border: 0; border-bottom: 1px dashed var(--wl-hair); border-radius: 0; padding: 3px 9px; cursor: pointer; white-space: nowrap; }
  #wirelog .arc button.it:hover, #wirelog .arc button.it:focus-visible { background: rgba(214,92,255,.1); outline: none; }
  #wirelog .arc .ts { color: var(--wl-dim); } #wirelog .arc .nm { overflow: hidden; text-overflow: ellipsis; } #wirelog .arc .kd { color: var(--c-corp); font-size: 9px; letter-spacing: .12em; }
  #wirelog .arc .empty { padding: 6px 9px; color: var(--wl-dim); }
  #wirelog .doc { padding: 6px 9px; white-space: pre-wrap; }
  #wirelog .doc .hd { color: var(--c-corp); letter-spacing: .14em; font-size: 9.5px; margin-bottom: 4px; }
  #wirelog .doc .back { font: inherit; font-size: 9px; letter-spacing: .14em; color: var(--wl-dim); background: transparent; border: 1px solid var(--wl-hair); border-radius: 0; padding: 1px 6px; margin-top: 6px; cursor: pointer; }
  /* the agents: boxes branching off the log's left side, joined to it by a wire */
  #wirelog .wl-agents { position: absolute; right: calc(100% + 22px); top: 30px; display: grid; gap: 8px; width: 238px; pointer-events: none; }
  #wirelog .ag { position: relative; contain: layout paint style; background: var(--wl-bg); border: 1px solid var(--wl-line); opacity: 0; transform: translateX(8px); transition: opacity .25s, transform .25s; }
  #wirelog .ag.on { opacity: 1; transform: none; } #wirelog .ag.gone { opacity: 0; }
  #wirelog .ag::after { content: ''; position: absolute; left: 100%; top: 12px; width: 22px; height: 1px; background: var(--wl-line); }
  #wirelog .ag::before { content: ''; position: absolute; left: calc(100% + 19px); top: 10px; width: 5px; height: 5px; background: var(--c-mesh); box-shadow: 0 0 5px var(--c-mesh); }
  #wirelog .ag .h { display: flex; justify-content: space-between; align-items: center; height: 20px; padding: 0 7px; border-bottom: 1px solid var(--wl-hair); color: var(--wl-head); font-size: 9px; letter-spacing: .18em; }
  #wirelog .chip { font-size: 8.5px; letter-spacing: .14em; padding: 0 5px; border: 1px solid var(--wl-dim); color: var(--wl-dim); }
  #wirelog .chip.flag { border-color: var(--c-corp); color: var(--c-corp); } #wirelog .chip.clear { border-color: var(--c-city); color: var(--c-city); }
  #wirelog .chip.wait { animation: wlBlink 1s steps(2) infinite; }
  #wirelog .ag .b { padding: 3px 7px 4px; white-space: nowrap; overflow: hidden; }
  #wirelog .ag .b div { overflow: hidden; text-overflow: ellipsis; } #wirelog .ag .cmd { color: var(--c-cmd); } #wirelog .ag .res { color: var(--wl-dim); }
  /* room for it: beside the monitor or the settings when they're open; pinned people go under it */
  body.watching #wirelog { right: calc(16px + min(340px, 100vw - 32px) + 8px); }
  body:has(#deck.open) #wirelog { right: 304px; }
  body.watching:has(#deck.open) #wirelog { right: calc(304px + min(340px, 100vw - 32px) + 8px); }
  body.wl-on .mon-pins { top: calc(58px + var(--wl-h, 0px) + 8px + env(safe-area-inset-top,0px)); }
  /* the prompt */
  #wirelog .wl-in { display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-bottom: 1px solid var(--wl-hair); background: rgba(214,92,255,.03); cursor: text; }
  #wirelog .wl-in.tr input { color: var(--c-mesh); } #wirelog .wl-in.tr .pr { color: var(--c-mesh); }
  #wirelog .ch-TRACE .ch { color: var(--c-mesh); } #wirelog .ch-TRACE .tx { color: #c9ffe2; }
  #wirelog .wl-in .pw { max-width: 52%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; color: var(--wl-dim); font-size: 9.5px; }
  #wirelog .wl-in .pr { color: var(--wl-head); }
  #wirelog .wl-in input { flex: 1; min-width: 0; font: inherit; color: var(--c-cmd); background: transparent; border: 0; outline: none; padding: 0; caret-color: var(--wl-head); caret-shape: block; }
  #wirelog .wl-in .fk { display: none; } #wirelog .wl-in:not(.on):not(.has) .fk { display: inline-block; margin-left: -4px; }
  #wirelog .wl-in.on { background: rgba(214,92,255,.06); } #wirelog .wl-in.busy input { color: var(--wl-dim); }
  #wirelog.collapsed .wl-in { display: none; }
  #wirelog .ch-OP .ch { color: var(--wl-head); } #wirelog .ch-OP .tx { color: var(--c-cmd); }
  #wirelog .ch-DOC .ch { color: var(--c-corp); } #wirelog .ch-DOC .tx { color: #efe6d2; }
  #wirelog .wl-line.ch-DOC > span:last-child { white-space: normal; overflow: visible; }
  #wirelog .ag.op .h span:first-child { color: var(--c-cmd); }
  #wirelog .ag .b .ln { color: var(--wl-txt); }
  @media (max-width: 700px) {
    #wirelog { width: calc(100vw - 32px); }
    #wirelog.collapsed { width: auto; }
    #wirelog.collapsed header .t .full, #wirelog.collapsed header .nd { display: none; } #wirelog.collapsed header .t .short { display: inline; }
    #wirelog .wl-line { grid-template-columns: 34px 46px minmax(0,1fr); gap: 4px; }
    #wirelog .wl-body { height: 150px; }
    #wirelog .wl-agents { right: auto; left: 0; top: calc(100% + 8px); width: min(238px, calc(100vw - 32px)); }
    #wirelog .ag::before, #wirelog .ag::after { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { #wirelog .live, #wirelog .cur, #wirelog .chip.wait, #wirelog header button.fresh { animation: none; } #wirelog .ag { transition: none; } }
  `;

  /* ---------- state (saved) ---------- */
  const W = { on: false, stage: 0, st: 0, lines: [], archive: [], leak: 'none', leakT: 0, sig: 0, seed: 0, mesh: ['A'], cwd: [], probed: [], scanned: [], hist: [], trace: 'none', traceT: 0, gseq: 0 };
  let el = null, bodyEl = null, footEl = null, agentsEl = null, view = 'log', fast = false, stick = true;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') Object.assign(W, v); } catch (e) {}
    for (const k of ['cwd', 'probed', 'scanned', 'hist']) if (!Array.isArray(W[k])) W[k] = []; };
  let saveDue = false;
  const save = () => { saveDue = true; };
  const flushSave = () => { if (!saveDue) return; saveDue = false; try { localStorage.setItem(KEY, JSON.stringify(W, (k, v) => k === 'el' ? undefined : v)); } catch (e) {} };

  /* ---------- small helpers ---------- */
  let rs = 1;
  const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (a, b) => a + Math.floor(rnd()*(b - a + 1));
  const pk = a => a[Math.floor(rnd()*a.length)];
  const pad = (n, k = 2) => String(n).padStart(k, '0');
  const now = () => (typeof fmt === 'function' ? fmt(S.hour) : '--:--');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const safe = (f, d) => { try { const v = f(); return v === undefined || Number.isNaN(v) ? d : v; } catch (e) { return d; } };

  /* ---------- reading the city ---------- */
  // the zone counts, a slice of the city per frame (a big city in one go is a hitch every few seconds)
  const Z0 = () => ({ low: 0, mid: 0, high: 0, ind: 0, any: 0, lowPlots: 0, midPlots: 0, highPlots: 0 });
  let zIter = null, zAcc = null, zLast = null;
  function zoneStep(budget = 250){
    if (!zIter){ zIter = safe(() => cells.values(), null); zAcc = Z0(); if (!zIter){ zLast = zAcc; return true; } }
    for (let n = 0; n < budget; n++){
      const r = zIter.next(); if (r.done){ zLast = zAcc; zIter = null; return true; }
      const c = r.value, sec = c.sections; if (!sec || !sec.length) continue;
      zAcc.any++; let lo = 0, mi = 0, hi = 0;
      for (const x of sec){ if (zAcc[x.zone] !== undefined) zAcc[x.zone]++; if (x.zone === 'low') lo = 1; else if (x.zone === 'mid') mi = 1; else if (x.zone === 'high') hi = 1; }
      zAcc.lowPlots += lo; zAcc.midPlots += mi; zAcc.highPlots += hi;
    }
    return false;
  }
  function snap(){
    const z = zLast || Z0();
    const kinds = {}; safe(() => { for (const m of megas.values()) kinds[m.kind] = (kinds[m.kind] || 0) + 1; });
    return { z, kinds, metros: safe(() => metros.length, 0), hw: safe(() => highways.length, 0), rain: safe(() => pplRaining, !!S.rain),
      phase: safe(() => phaseName(S.hour), 'Day'), club: !!kinds.club && safe(() => clubOpenAt(S.hour), false) };
  }
  const residents = () => safe(() => pplList.length, 0);
  const outside = () => safe(() => { let n = 0; for (const p of pplList) if (p.walk || (p.at && p.at !== p.home)) n++; return n; }, 0);
  const clubbers = () => safe(() => { let n = 0; for (const p of pplList) if (p.club && !p.walk) n++; return n; }, 0);
  const officers = () => safe(() => pplList.filter(p => p.cop && (p.patrol || (p.walk && p.walk.beat))).length, 0);
  function stalls(){
    return safe(() => { let tot = 0, act = 0;
      for (const pl of places.values()){ if (!pl.stalls) continue;
        for (const st of pl.stalls.values()){ tot++; if (st.keepers.some(sp => { const p = sp.by && people.get(sp.by); return p && !p.walk && p.at === pl.id; })) act++; } }
      return { tot, act }; }, { tot: 0, act: 0 });
  }
  const ridersOn = l => safe(() => (l._riders || []).filter(p => p.metro && p.metro.st === 'ride').length || (l._riders || []).length, 0);
  const districts = z => Math.max(2, Math.min(9, Math.ceil((z.any || 1)/35)));
  const nodes = (z, k) => 40 + (z.any || 0)*3 + (k*37 % 23);

  /* ---------- lines ---------- */
  function lineEl(L){
    const d = document.createElement('div'); d.className = 'wl-line ch-' + L.ch + (L.key ? ' key' : '');
    d.innerHTML = `<span class="ts">${esc(L.t)}</span><span class="ch">${L.ch === 'CMD' ? 'AGENT' : L.ch === 'OP' ? 'OPER' : L.ch === 'DOC' ? 'FILE' : esc(L.ch)}</span><span class="tx">${esc(L.x)}</span>`;
    return d;
  }
  // the newest line sits just under the prompt; what one command prints stays together, top to bottom, in a block
  let grp = 0;
  function put(d, L){
    if (!bodyEl || view !== 'log') return;
    if (L.g){ let b = bodyEl.querySelector('.wl-blk[data-g="' + L.g + '"]'); if (!b){ b = document.createElement('div'); b.className = 'wl-blk'; b.dataset.g = L.g; bodyEl.insertBefore(b, bodyEl.firstChild); } b.appendChild(d); }
    else bodyEl.insertBefore(d, bodyEl.firstChild);
    trim(); toTop();
  }
  const keep = L => { W.lines.push(L); while (W.lines.length > MAX_LINES) W.lines.shift(); save(); };
  function add(ch, x, o = {}){
    const L = { t: now(), ch, x }; if (o.key) L.key = 1; const g = o.g === undefined ? grp : o.g; if (g) L.g = g; if (o.opt) L.opt = o.opt;
    W.lines.push(L); while (W.lines.length > MAX_LINES) W.lines.shift();
    if (o.arc) archive(o.arc.title || x, o.arc.kind || 'EVENT', o.arc.body || [x]);
    save();
    if (bodyEl && view === 'log'){ const d = lineEl(L); L.el = d; put(d, L); return d; }
    return null;
  }
  function trim(){ if (!bodyEl) return; while (bodyEl.querySelectorAll('.wl-line').length > MAX_LINES){ const last = bodyEl.lastElementChild; if (!last) break;
    if (last.classList.contains('wl-blk')){ if (last.firstElementChild) last.firstElementChild.remove(); if (!last.childElementCount) last.remove(); } else last.remove(); } }
  function toTop(){ if (bodyEl && stick) bodyEl.scrollTop = 0; }
  function archive(title, kind, body){
    W.archive.push({ t: now(), title, kind, body }); while (W.archive.length > MAX_ARCHIVE) W.archive.shift(); save();
    const b = el && el.querySelector('#wlArc'); if (b){ b.textContent = 'ARC ' + W.archive.length; b.classList.remove('fresh'); void b.offsetWidth; b.classList.add('fresh'); }
  }

  /* ---------- the ambient lines: templates per channel, each picked least-recently-used ---------- */
  const used = new Map();
  const CITY = [
    s => { const t = stalls(); if (!t.tot) return null; const night = S.hour >= 16.5 || S.hour < 1; return `${night ? 'Night' : 'Day'} market · ${t.act}/${t.tot} stalls active`; },
    s => { if (!s.metros) return null; const l = pk(metros), n = metros.indexOf(l) + 1; return `Metro L${n} · nominal · ${ridersOn(l)} aboard`; },
    s => { const r = residents(); if (!r) return null; const o = outside(); return `Foot traffic · ${o} on street · ${Math.round(100*o/r)}%`; },
    s => s.kinds.club ? (s.club ? `Neon Dome · open · occupancy ${clubbers()}` : `Neon Dome · closed · opens 19:00`) : null,
    s => `Residents · ${residents()} registered · ${s.z.lowPlots} res blocks`,
    s => { const mw = ((s.z.any*.42 + Object.keys(s.kinds).length*3.1) * (s.phase === 'Night' || s.phase === 'Dusk' ? 1.34 : 1)).toFixed(1); return `Grid draw · ${mw} MW · ${s.phase.toLowerCase()} profile`; },
    s => s.kinds.police ? `Police · ${officers()} officers on beat` : null,
    s => s.hw ? `Sky highways · ${s.hw} routes · toll nominal` : null,
    s => s.kinds.greenhouse ? `Hydroponic farm · cycle ${ri(3, 41)} · yield nominal` : null,
    s => s.kinds.logistics ? `Logistics hub · ${ri(120, 640)} parcels sorted · 1 hr` : null,
    s => `Floor count · ${s.z.low + s.z.mid + s.z.high + s.z.ind} · ${s.z.ind} industrial`,
    s => s.rain ? `Precip · active · street count ${outside()}` : null,
  ];
  const MESH = [
    s => `Mesh ${pk(W.mesh)} · online · ${nodes(s.z, W.mesh.length)} nodes`,
    s => `Mesh ${pk(W.mesh)} · traffic elevated · ${ri(18, 96)} MB/s`,
    s => `Mesh ${pk(W.mesh)} · handshake failed · retry ${ri(1, 3)}/3`,
    s => `Mesh ${pk(W.mesh)} · packet loss ${(rnd()*3).toFixed(1)}% · resolved`,
    s => `Mesh ${pk(W.mesh)} · route change · ${ri(3, 11)} hops`,
    s => `Mesh ${pk(W.mesh)} · ${ri(2, 19)} devices joined · District ${ri(1, districts(s.z))}`,
    s => `Mesh ${pk(W.mesh)} · traffic elevated · source unresolved`,
    s => `Mesh ${pk(W.mesh)} · certificate rotated · ${ri(40, 400)} hosts`,
  ];
  const model = () => pk(['SK', 'VX', 'LN', 'OR', 'TK', 'HM']) + '-' + ri(2, 9);
  const CORPS = [
    s => `${CORP.synth} · recall · ${model()} ${pk(['optics', 'hand', 'spine cable', 'cochlear', 'knee'])} · batch ${ri(10, 29)}-${pk(['J', 'K', 'Q', 'R'])}`,
    s => `${CORP.synth} · firmware ${ri(4, 9)}.${ri(0, 9)}.${ri(0, 9)} · pushed · ${ri(200, 4800)} units`,
    s => `${CORP.synth} · clinic intake · ${ri(4, 60)} fittings · District ${ri(1, districts(s.z))}`,
    s => `${CORP.synth} · warranty void · ${model()} · third-party repair`,
    s => `${CORP.synth} · hiring · field technicians · ${ri(8, 60)}`,
    s => `${CORP.logi} · route ${ri(1, 12)} · freight volume +${ri(3, 31)}%`,
    s => `${CORP.logi} · drone fleet · ${ri(12, 140)} airborne · nominal`,
    s => `${CORP.logi} · depot ${ri(1, 6)} · backlog ${ri(40, 900)} parcels`,
    s => { const h = ri(0, 21); return `${CORP.logi} · lane closure · route ${ri(1, 12)} · ${pad(h)}:00-${pad(h + 2)}:00`; },
    s => `${CORP.media} · campaign live · ${ri(6, 60)} billboards · District ${ri(1, districts(s.z))}`,
    s => `${CORP.media} · audience share · ${ri(11, 64)}% · prime slot`,
    s => `${CORP.media} · ad slot vacant · ${ri(2, 30)} panels · ${pk(Object.values(ZONE_NAME))}`,
    s => `${CORP.media} · content review · ${ri(2, 40)} items withdrawn`,
    s => rnd() < .4 ? `${CORP.civic} · maintenance window · grid sector ${ri(1, 6)} · 02:00-04:00` : `${CORP.civic} · substation ${ri(1, 9)} · load ${ri(41, 97)}%`,
    s => `${CORP.civic} · tender awarded · camera array · ${ri(20, 400)} units`,
    s => `${CORP.civic} · meter audit · District ${ri(1, districts(s.z))} · pending`,
    s => `${CORP.civic} · sensor install · ${ri(6, 80)} poles · District ${ri(1, districts(s.z))}`,
  ];
  // the signal ladder: each line one step further than the last, then holding at the top until the drones come
  const SIG_BEARING = () => 340 + (W.seed % 30);
  function signalLine(){
    const k = W.sig++; save(); const b = SIG_BEARING();
    if (k === 0) return `Unregistered carrier · 2.4 GHz · bearing ${b}`;
    if (k === 1) return `Unregistered carrier · 2.4 GHz · bearing ${b + 2} · persistent`;
    if (k < 11){ const passes = k - 1; return passes === 3 ? `Civic registry · no match · carrier ${pad(W.seed % 97)}-${b}` : `Material composite scan detected · ${passes} pass${passes > 1 ? 'es' : ''}`; }
    const c = Math.min(6, 1 + Math.floor((k - 11)/2)), alt = Math.max(140, 320 - (k - 11)*15);
    return rnd() < .25 ? `Material composite scan detected · ${9 + (k - 11)} passes` : `Airspace contact · unidentified · ${c > 1 ? c + ' contacts · ' : ''}altitude ${alt} m`;
  }
  function pickFrom(list, ch, s){
    const opts = list.map((f, i) => ({ f, i, last: used.get(ch + i) || -1e9 })).sort((a, b) => a.last - b.last);
    const tnow = performance.now();
    for (const o of opts.slice(0, Math.max(3, Math.ceil(opts.length*.6))).sort(() => rnd() - .5)){
      const x = safe(() => o.f(s), null); if (x){ used.set(ch + o.i, tnow); return x; }
    }
    for (const o of opts){ const x = safe(() => o.f(s), null); if (x){ used.set(ch + o.i, tnow); return x; } }
    return null;
  }
  // what each stage mixes, as weights
  const MIX = [ { CITY: 1 }, { CITY: .55, MESH: .35, CORP: .1 }, { CITY: .4, MESH: .25, CORP: .35 }, { CITY: .32, MESH: .2, CORP: .28, SIGNAL: .2 } ];
  function ambient(){
    const s = cur || snap(), mix = MIX[Math.min(W.stage, MIX.length - 1)];
    let r = rnd(), ch = 'CITY'; for (const k in mix){ r -= mix[k]; if (r <= 0){ ch = k; break; } }
    if (ch === 'SIGNAL'){ add('SIGNAL', signalLine()); return; }
    const x = pickFrom(ch === 'CITY' ? CITY : ch === 'MESH' ? MESH : CORPS, ch, s);
    if (x) add(ch, x);
  }

  /* ---------- the city changing: event lines ---------- */
  let base = null, cur = null, build = null, rainWatch = null;
  function events(s){
    if (!base){ base = s; return; }
    const dz = {}; let tot = 0; for (const k of ['low', 'mid', 'high', 'ind']){ dz[k] = s.z[k] - base.z[k]; tot += Math.abs(dz[k]); }
    if (tot > 40){ base = s; build = null; return; }   // (a city loading or clearing all at once: no flood of lines)
    if (tot){ build = build || { d: { low: 0, mid: 0, high: 0, ind: 0 }, t: 0 }; for (const k in dz) build.d[k] += dz[k]; build.t = 0; }
    for (const k in s.kinds) if ((s.kinds[k] || 0) > (base.kinds[k] || 0) && k !== 'wirenest' && MEGA_TYPES[k]){ const t = MEGA_TYPES[k]; add('CITY', `${t.name} · registered · ${t.w}x${t.h} plots`, { key: 1 }); }
    for (const k in base.kinds) if ((s.kinds[k] || 0) < base.kinds[k]){ const t = MEGA_TYPES[k]; if (t) add('CITY', `${t.name} · deregistered`); }
    if (s.metros > base.metros) add('CITY', `Metro L${s.metros} · commissioned`, { key: 1 }); else if (s.metros < base.metros) add('CITY', `Metro line · decommissioned · ${s.metros} remain`);
    if (s.hw > base.hw) add('CITY', `Sky highway H${s.hw} · toll gate registered`, { key: 1 }); else if (s.hw < base.hw) add('CITY', `Sky highway · route closed · ${s.hw} remain`);
    if (s.rain && !base.rain){ add('CITY', `Precip onset · street count ${outside()}`); rainWatch = { n: outside(), t: 0 }; }
    else if (!s.rain && base.rain) add('CITY', 'Precip ceased');
    if (s.phase !== base.phase){
      if (s.phase === 'Dusk') add('CITY', 'Street lighting · on · dusk profile');
      else if (s.phase === 'Dawn') add('CITY', 'Street lighting · off · dawn profile');
      else if (s.phase === 'Night') add('CITY', `Night shift · ${officers() ? officers() + ' officers · ' : ''}curfew none`);
    }
    if (s.club && !base.club) add('CITY', `Neon Dome · doors open · ${now()}`); else if (!s.club && base.club && s.kinds.club) add('CITY', 'Neon Dome · closed');
    // the network grows with the city
    if (W.stage >= 1){ if (s.z.any >= 60 && !W.mesh.includes('B')){ W.mesh.push('B'); add('MESH', `Mesh B · online · ${nodes(s.z, 2)} nodes`); } if (s.z.any >= 120 && !W.mesh.includes('C')){ W.mesh.push('C'); add('MESH', `Mesh C · online · ${nodes(s.z, 3)} nodes`); } }
    base = s;
  }
  function flushBuild(dt){
    if (build && (build.t += dt) > 5){
      for (const k in build.d){ const n = build.d[k]; if (n > 0) add('CITY', `${ZONE_NAME[k]} · construction logged · +${n} floor${n > 1 ? 's' : ''}`); else if (n < 0) add('CITY', `${ZONE_NAME[k]} · demolition logged · ${n} floor${n < -1 ? 's' : ''}`); }
      build = null;
    }
    if (rainWatch && (rainWatch.t += dt) > 60){ const n = outside(), d = rainWatch.n ? Math.round(100*(n - rainWatch.n)/rainWatch.n) : 0; add('CITY', `Foot traffic · ${d >= 0 ? '+' : ''}${d}% · precip`); rainWatch = null; }
  }

  /* ---------- timing helpers that follow the game loop (they wait while the game is paused) ---------- */
  const waits = [];
  const sleep = sec => new Promise(res => waits.push({ t: fast ? Math.min(sec, .15) : sec, res }));
  function runWaits(dt){ for (let i = waits.length - 1; i >= 0; i--){ const w = waits[i]; if ((w.t -= dt) <= 0){ waits.splice(i, 1); w.res(); } } }
  // type text into a node, a character at a time (a click on the log finishes it)
  async function typeInto(node, text, cps = 26){
    const cur = document.createElement('span'); cur.className = 'cur'; node.textContent = ''; node.appendChild(cur);
    for (let i = 1; i <= text.length; i++){ if (!fast) await sleep(1/cps); node.textContent = text.slice(0, i); node.appendChild(cur); }
    cur.remove();
  }
  /* ---------- Y / N under a line ---------- */
  function optButtons(d, yes, no, labels = ['Y', 'N']){
    if (!d) return; d.classList.add('has-opt'); const tx = d.querySelector('.tx'); const o = document.createElement('span'); o.className = 'opt';
    o.innerHTML = `<button type="button" class="y">${labels[0]}</button><button type="button" class="n">${labels[1]}</button>`; tx.appendChild(o);
    const off = (w) => { o.querySelectorAll('button').forEach(b => b.remove()); if (w){ const t = document.createElement('span'); t.className = 'done'; t.textContent = w; o.appendChild(t); } };
    o.querySelector('.y').addEventListener('click', e => { e.stopPropagation(); off('approved'); yes(); });
    o.querySelector('.n').addEventListener('click', e => { e.stopPropagation(); off('declined'); no(); });
    d._off = off;
  }

  /* ---------- the packet swarm: three agents scanning the leaking host's folders at once ---------- */
  const MEMO = WIREFS.MEMO;
  function agentBox(n){
    const b = document.createElement('div'); b.className = 'ag';
    b.innerHTML = `<div class="h"><span>SWARM ${pad(n)} · SCAN</span><span class="chip wait">WAIT</span></div><div class="b"><div class="cmd"></div><div class="res">&nbsp;</div></div>`;
    agentsEl.appendChild(b); requestAnimationFrame(() => b.classList.add('on'));
    return b;
  }
  async function swarmAgent(n, dir, took){
    const b = agentBox(n); await sleep(.25*n);
    await typeInto(b.querySelector('.cmd'), '> -scan root/' + dir, 24);
    await sleep(took);
    const files = WIREFS.TREE.synthcorp[dir], fl = files.filter(f => f[2].includes('f')), kb = fl.reduce((a, f) => a + f[1], 0);
    const chip = b.querySelector('.chip'); chip.className = 'chip ' + (fl.length ? 'flag' : 'clear'); chip.textContent = fl.length ? 'FLAG' : 'CLEAR';
    b.querySelector('.res').textContent = `${fl.length} file${fl.length === 1 ? '' : 's'} flagged${fl.length === 1 ? ' · ' + sizeTxt(kb) : ''}`;
    if (!W.scanned.includes('synthcorp/' + dir)) W.scanned.push('synthcorp/' + dir);
    return { b, dir, fl };
  }
  async function swarm(){
    W.leak = 'swarm'; save(); fast = false;
    grp = ++W.gseq; add('TRACE', 'Packet swarm · 3 agents · synthcorp root'); grp = 0;
    const out = await Promise.all([swarmAgent(1, 'documents', 3), swarmAgent(2, 'reports', 4.4), swarmAgent(3, 'archive', 5.8)]);
    grp = ++W.gseq;
    add('TRACE', `Scan complete · ${out.reduce((a, r) => a + r.fl.length, 0)} files flagged`, { key: 1 });
    for (const r of out) for (const f of r.fl) add('SYS', `FLAG · ${r.dir}/${f[0]} · ${sizeTxt(f[1])}`);
    grp = 0; W.leak = 'scanned'; save();
    await sleep(6); for (const r of out) r.b.classList.add('gone'); await sleep(.4); for (const r of out) r.b.remove();
  }
  // the leak: found by the first probe of mesh A, whoever runs it
  function leakFound(){
    if (W.leak !== 'none') return; W.leak = 'found';
    add('MESH', 'Mesh A · data leak detected · 3 packets · synthcorp', { key: 1, arc: { title: 'Data leak · mesh A · 3 packets', kind: 'EVENT' } });
    if (W.stage < 2){ W.stage = 2; W.st = 0; } save();
  }

  /* ---------- the network trace: an agent that proposes the next command, one at a time, and waits for a yes ---------- */
  // Each step asks before it runs (a little friction, and a look at the command); approved, it types the command into the
  // prompt itself and runs it there, so the player sees exactly what to type. If the player types it first, the step clears.
  let P = null, tracing = false, traceWait = 2, offerT = 0;
  const skipped = new Map(); let clock = 0;
  const inSynth = () => W.cwd.length >= 2 && W.cwd[1] === 'synthcorp';
  function nextStep(){
    for (const m of ['A', 'B', 'C']) if (meshOn(m) && !W.probed.includes(m)) return { key: 'probe' + m, cmd: '-probe ' + MESHL[m], why: `Mesh ${m} · unprobed` };
    if (W.leak === 'found' && !inSynth()) return { key: 'cdleak', cmd: '-cd /mesha/synthcorp', why: 'Leak source · synthcorp' };
    if (W.leak === 'found') return { key: 'swarm', swarm: true, why: 'Root · 4 dirs · unscanned' };
    if (W.leak === 'scanned' && !archived('sk3_recall_memo')) return { key: 'pull', cmd: inSynth() && W.cwd.length === 2 ? '-pull root/archive/sk3_recall_memo' : '-pull /mesha/synthcorp/root/archive/sk3_recall_memo', why: 'Flagged · 2.1 MB' };
    return null;
  }
  function propose(nx){
    const txt = nx.swarm ? `Next · deploy packet swarm · 3 agents · scan root` : `Next · ${nx.cmd}`;
    const g = ++W.gseq; add('TRACE', nx.why, { g });
    const d = add('TRACE', txt, { g, opt: nx.key, key: 1 });
    P = { nx, L: W.lines[W.lines.length - 1] };
    optButtons(d, () => approve(), () => decline());
  }
  function approve(){ const p = P; if (!p) return; P = null; if (p.nx.swarm) swarm(); else traceRun(p.nx.cmd); }
  function decline(){ const p = P; if (!p) return; P = null; skipped.set(p.nx.key, clock + 90); traceWait = 4; add('TRACE', 'Step skipped · standby', { g: 0 }); }
  async function traceRun(cmdText){
    tracing = true;
    while (busy || (inEl && document.activeElement === inEl)) await sleep(.25);   // (the player's own typing first)
    if (view !== 'log') showView('log');
    if (el.classList.contains('collapsed')) setCollapsed(false);
    rowEl.classList.add('tr', 'has'); inEl.readOnly = true;
    for (let i = 1; i <= cmdText.length; i++){ inEl.value = cmdText.slice(0, i); await sleep(1/24); }
    await sleep(.35); inEl.value = ''; rowEl.classList.remove('tr', 'has'); inEl.readOnly = false;
    await exec(cmdText, 'TRACE');
    tracing = false; traceWait = 1.5;
  }
  function offerTrace(){
    W.trace = 'offered'; save();
    const d = add('SYS', 'Option · enable network trace agent', { g: 0, opt: 'trace', key: 1 });
    optButtons(d, traceYes, traceNo);
  }
  function traceYes(){ W.trace = 'on'; save(); add('TRACE', 'Network trace · enabled · listening', { g: 0 }); if (W.stage < 1) setStage(1); traceWait = 2; }
  function traceNo(){ W.trace = 'declined'; W.traceT = 0; save(); add('SYS', 'Network trace · standby', { g: 0 }); }
  function traceTick(dt){
    clock += dt;
    if (W.trace === 'none' && (offerT += dt) > 5) offerTrace();
    if (W.trace === 'declined' && (W.traceT += dt) > T.reoffer) offerTrace();
    // the leak moves on when the player does the work themselves
    if (W.leak === 'found' && ['documents', 'reports', 'archive'].every(d => W.scanned.includes('synthcorp/' + d))) W.leak = 'scanned';
    if ((W.leak === 'scanned' || W.leak === 'found') && archived('sk3_recall_memo')){ W.leak = 'done'; W.st = 0; save(); }
    if (P){ const nx = nextStep(); if (!nx || nx.key !== P.nx.key){ if (P.L && P.L.el && P.L.el._off) P.L.el._off('done by hand'); P = null; traceWait = 2; } return; }
    if (W.trace !== 'on' || tracing || busy || W.leak === 'swarm') return;
    if ((traceWait -= dt) > 0) return;
    const nx = nextStep(); if (!nx || (skipped.get(nx.key) || 0) > clock) return;
    propose(nx);
  }

  /* ---------- the command line: the player's own -probe, -cd, -ls, -scan, -read, -pull, -deploy ---------- */
  const FS = WIREFS, MESHN = { mesha: 'A', meshb: 'B', meshc: 'C' }, MESHL = { A: 'mesha', B: 'meshb', C: 'meshc' };
  const CMDS = ['-probe', '-cd', '-ls', '-scan', '-read', '-pull', '-deploy', '-help'];
  const meshOn = m => W.stage >= 1 && W.mesh.includes(m);
  const sizeTxt = kb => kb >= 1024 ? (kb/1024).toFixed(1) + ' MB' : kb + ' KB';
  const pstr = p => '/' + p.join('/');
  function nodeAt(p){
    if (!p.length) return { k: 'top', p };
    const m = MESHN[p[0]]; if (!m) return null; if (!meshOn(m)) return { k: 'off', p, m };
    if (p.length === 1) return { k: 'mesh', p, m };
    const h = p[1]; if (!FS.HOSTS[m].includes(h)) return null;
    if (p.length === 2) return { k: 'host', p, m, h };
    if (p[2] !== 'root') return null;
    if (p.length === 3) return { k: 'root', p, m, h };
    const files = FS.TREE[h][p[3]]; if (!files) return null;
    if (p.length === 4) return { k: 'dir', p, m, h, d: p[3], files };
    if (p.length === 5){ const f = files.find(x => x[0] === p[4]); return f ? { k: 'file', p, m, h, d: p[3], f } : null; }
    return null;
  }
  function norm(base, str){ const out = str.startsWith('/') ? [] : base.slice(); for (const seg of str.split('/')){ if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg.toLowerCase()); } return out; }
  function resolve(str, base){ if (!str) return nodeAt(base); let n = nodeAt(norm(base, str)); if (!n || n.k === 'off'){ const a = norm([], str); if (MESHN[a[0]]) n = nodeAt(a) || n; } return n; }
  function kids(n){
    if (!n) return [];
    if (n.k === 'top') return ['A', 'B', 'C'].filter(meshOn).map(m => MESHL[m]);
    if (n.k === 'mesh') return W.probed.includes(n.m) ? FS.HOSTS[n.m].slice() : [];
    if (n.k === 'host') return ['root'];
    if (n.k === 'root') return Object.keys(FS.TREE[n.h]);
    if (n.k === 'dir') return n.files.map(f => f[0]);
    return [];
  }
  const nope = (str, n) => n && n.k === 'off' ? `Mesh ${n.m} · no route` : `No such path · ${str}`;
  const flagged = (h, d) => W.scanned.includes(h + '/' + d);
  const archived = name => W.archive.some(a => a.title === name);
  // each command, run against a context: the log (the player) or an agent's box
  const RUN = {
    async probe(c, a){
      let m = a[0] ? (MESHN[a[0].toLowerCase()] || MESHN['mesh' + a[0].toLowerCase()]) : c.cwd.length ? MESHN[c.cwd[0]] : null;
      if (!m) return c.say('SYS', a[0] ? `No such mesh · ${a[0]}` : 'Probe · mesh required');
      if (!meshOn(m)) return c.say('SYS', `Mesh ${m} · no route`);
      await c.wait(1.2);
      if (!W.probed.includes(m)){ W.probed.push(m); save(); }
      const r = c.say('MESH', `Mesh ${m} · ${FS.HOSTS[m].length} hosts · ${FS.HOSTS[m].join(' · ')}`, true);
      if (m === 'A') leakFound();
      return r;
    },
    async cd(c, a){
      if (!a[0]){ c.cwd.length = 0; c.moved(); return; }
      const n = resolve(a[0], c.cwd); if (!n || n.k === 'off') return c.say('SYS', nope(a[0], n));
      if (n.k === 'file') return c.say('SYS', `Not a folder · ${n.f[0]}`);
      if (n.k === 'host' && !W.probed.includes(n.m)) return c.say('SYS', `Host unlisted · -probe ${MESHL[n.m]}`);
      c.cwd.length = 0; c.cwd.push(...n.p); c.moved();
      if (n.k === 'host') c.say('CORP', `${n.h.toUpperCase()} · root · ${Object.keys(FS.TREE[n.h]).length} dirs`);
    },
    async ls(c, a){
      const n = resolve(a[0] || '', c.cwd); if (!n || n.k === 'off') return c.say('SYS', nope(a[0] || pstr(c.cwd), n));
      if (n.k === 'top'){ const k = kids(n); return c.say('SYS', k.length ? `Meshes · ${k.join(' · ')}` : 'No mesh in range'); }
      if (n.k === 'mesh') return W.probed.includes(n.m) ? c.say('MESH', `${MESHL[n.m]} · ${FS.HOSTS[n.m].join(' · ')}`) : c.say('SYS', `${MESHL[n.m]} · hosts unlisted · -probe ${MESHL[n.m]}`);
      if (n.k === 'host') return c.say('CORP', `${n.h} · root`);
      if (n.k === 'root') return c.say('CORP', `root · ${kids(n).length} dirs · ${kids(n).join(' · ')}`);
      if (n.k === 'file') return c.say('SYS', `${n.f[0]} · ${sizeTxt(n.f[1])}${n.f[2].includes('e') ? ' · ENC' : ''}`);
      c.say('CORP', `${n.d} · ${n.files.length} files${flagged(n.h, n.d) ? '' : ' · unscanned'}`);
      for (const f of n.files) c.say('SYS', `${f[0]} · ${sizeTxt(f[1])}${f[2].includes('e') ? ' · ENC' : ''}${flagged(n.h, n.d) && f[2].includes('f') ? ' · FLAG' : ''}`);
    },
    async scan(c, a){
      const n = resolve(a[0] || '', c.cwd); if (!n || n.k === 'off') return c.say('SYS', nope(a[0] || pstr(c.cwd), n));
      if (n.k !== 'dir') return c.say('SYS', 'Scan · folder required');
      const t = 1.2 + .45*n.files.length, live = c.live(); const t0 = t;
      for (let r = t; r > 0; r -= .25){ const k = Math.round(10*(1 - r/t0)); live(`Scan · ${n.d} · ${'█'.repeat(k)}${'░'.repeat(10 - k)}`); await c.wait(.25); }
      if (!flagged(n.h, n.d)){ W.scanned.push(n.h + '/' + n.d); save(); }
      const fl = n.files.filter(f => f[2].includes('f')), mb = fl.reduce((s, f) => s + f[1], 0);
      live(`Scan · ${n.d} · ${fl.length} file${fl.length === 1 ? '' : 's'} flagged${fl.length ? ' · ' + sizeTxt(mb) : ''}`, true);
      for (const f of fl) c.say('SYS', `FLAG · ${f[0]} · ${sizeTxt(f[1])}`);
      return `${n.d} · ${fl.length} flagged`;
    },
    async read(c, a){
      const n = resolve(a[0] || '', c.cwd); if (!a[0]) return c.say('SYS', 'Read · file required'); if (!n || n.k === 'off') return c.say('SYS', nope(a[0], n));
      if (n.k !== 'file') return c.say('SYS', `Not a file · ${a[0]}`);
      const [name, kb, mk, body] = n.f;
      if (mk.includes('e')) return c.say('SYS', `${name} · encrypted · key not held`);
      if (kb > FS.READ_MAX) return c.say('SYS', `${name} · ${sizeTxt(kb)} · too large to read · pull it`);
      await c.wait(.3);
      add('DOC', `${name} · ${sizeTxt(kb)} · ${n.h}`, { key: 1 });
      for (const l of body) if (l) add('DOC', l);
      return `${name} · read`;
    },
    async pull(c, a){
      const n = resolve(a[0] || '', c.cwd); if (!a[0]) return c.say('SYS', 'Pull · file required'); if (!n || n.k === 'off') return c.say('SYS', nope(a[0], n));
      if (n.k !== 'file') return c.say('SYS', `Not a file · ${a[0]}`);
      const [name, kb, mk, body] = n.f;
      if (mk.includes('e')) return c.say('SYS', `Transfer refused · ${name} · encrypted`);
      if (archived(name)) return c.say('SYS', `${name} · already archived`);
      const secs = Math.max(2, Math.min(30, Math.round(kb/1024*6.7))), live = c.live();
      for (let r = secs; r >= 0; r--){ const k = Math.round(10*(secs - r)/secs);
        live(`Transfer · ${sizeTxt(kb)} · 00:${pad(r)} <span class="bar">${'█'.repeat(k)}${'░'.repeat(10 - k)}</span>`, false, true); if (r) await c.wait(1); }
      live(`Transfer · ${sizeTxt(kb)} · complete`, true);
      add('SYS', 'Pull complete · 1 file archived', { key: 1, arc: { title: name, kind: 'FILE', body } });
      return `${name} · archived`;
    },
    async deploy(c, a){
      if (c.agent) return c.say('SYS', 'Agent · cannot deploy');
      const id = +String(a[0] || '').replace(/^(agent|a)/i, ''); if (!(id >= 1 && id <= 3)) return c.say('SYS', 'Deploy · agent 1-3 required');
      if (agentsBusy[id]) return c.say('SYS', `Agent ${pad(id)} · busy`);
      const sub = a.slice(1).join(' ').trim(); if (!sub) return c.say('SYS', `Deploy · agent ${pad(id)} · command required`);
      const verb = sub.split(/\s+/)[0].replace(/^-/, '').toLowerCase();
      if (!RUN[verb] || verb === 'deploy' || verb === 'help') return c.say('SYS', `Agent ${pad(id)} · command not supported · ${verb}`);
      runAgent(id, sub, c.cwd.slice());
      return c.say('SYS', `Agent ${pad(id)} · deployed · ${sub.startsWith('-') ? sub : '-' + sub}`);
    },
    async help(c){
      for (const l of ['-probe <mesh> · list its hosts', '-cd <path> · move · .. goes up · / to top', '-ls [path] · list what is there', '-scan <folder> · flag what matters',
        '-read <file> · open a small file', '-pull <file> · download to the archive', '-deploy <1-3> <command> · an agent runs it', 'Tab · complete · Up · recall · Esc · leave']) c.say('SYS', l);
    },
  };
  // the player's context: the log itself
  let inEl = null, pwEl = null, rowEl = null, busy = false, hi = -1, draft = '', lastCmd = -1e9;
  // the city's chatter holds while the player is at the prompt, so what they read comes through in one piece
  const typing = () => busy || (inEl && document.activeElement === inEl) || performance.now() - lastCmd < 8000;
  const opCtx = { cwd: null, agent: 0,
    say(ch, x){ add(ch, x); return x; },
    wait: sec => sleep(sec),
    moved(){ W.cwd = opCtx.cwd; save(); showCwd(); },
    live(){ const L = { t: now(), ch: 'SYS', x: '' }; if (grp) L.g = grp; const d = lineEl(L), tx = d.querySelector('.tx'); let shown = false;
      return (txt, final, html) => { if (!shown){ shown = true; put(d, L); }
        if (html) tx.innerHTML = txt; else tx.textContent = txt;
        if (final){ L.x = txt; keep(L); } }; },
  };
  // an agent's context: its own box beside the log; what it finds goes to the log as well
  const agentsBusy = {}, FAILS = /^(No such|Not a|Mesh . · no route|Transfer refused|Unknown|Host unlisted|Agent)|encrypted · key|too large to read|required$|already archived$/;
  function runAgent(id, sub, cwd){
    agentsBusy[id] = true;
    const b = document.createElement('div'); b.className = 'ag op';
    const verb = sub.split(/\s+/)[0].replace(/^-/, '').toLowerCase();
    b.innerHTML = `<div class="h"><span>AGENT ${pad(id)} · ${esc(verb.toUpperCase())}</span><span class="chip wait">WAIT</span></div><div class="b"><div class="cmd"></div><div class="ln res">&nbsp;</div></div>`;
    agentsEl.appendChild(b); requestAnimationFrame(() => b.classList.add('on'));
    const res = b.querySelector('.res'); let lastSay = '';
    const ctx = { cwd, agent: id,
      say(ch, x, toLog){ res.textContent = x; lastSay = x; if (ch === 'SYS' && FAILS.test(x)) ctx.failed = true; if (toLog || ch === 'MESH') add(ch, x, { g: 0 }); return x; },
      wait: sec => sleep(sec), moved(){},
      live(){ return (txt, final, html) => { if (html) res.innerHTML = txt; else res.textContent = txt.replace(/<[^>]+>/g, ''); if (final) lastSay = txt; }; },
    };
    (async () => {
      await typeInto(b.querySelector('.cmd'), '> ' + (sub.startsWith('-') ? sub : '-' + sub), 24);
      const parts = sub.split(/\s+/).slice(1);
      let out = null; try { out = await RUN[verb](ctx, parts); } catch (e) { ctx.failed = true; out = 'fault'; }
      if (ctx.failed) out = lastSay;
      const fail = !!ctx.failed;
      const chip = b.querySelector('.chip'); chip.className = 'chip ' + (fail ? 'flag' : 'clear'); chip.textContent = fail ? 'FAIL' : 'DONE';
      add('SYS', `Agent ${pad(id)} · ${fail ? 'failed' : 'done'} · ${out || lastSay}`, { g: 0 });
      agentsBusy[id] = false;
      await sleep(6); b.classList.add('gone'); await sleep(.4); b.remove();
    })();
  }
  function showCwd(){ if (pwEl) pwEl.textContent = '‎' + (opCtx.cwd.length ? pstr(opCtx.cwd) : '/'); }
  async function exec(raw, by){
    const line = raw.trim(); if (!line) return;
    if (view !== 'log') showView('log');
    W.hist.push(line); while (W.hist.length > 30) W.hist.shift(); hi = -1; save(); lastCmd = performance.now();
    grp = ++W.gseq; stick = true;
    add(by || 'OP', '> ' + line);
    const parts = line.split(/\s+/), verb = parts[0].replace(/^-/, '').toLowerCase();
    if (!RUN[verb]){ add('SYS', `Unknown command · ${parts[0]}`); grp = 0; return; }
    busy = true; rowEl.classList.add('busy'); inEl.readOnly = true;
    try { await RUN[verb](opCtx, parts.slice(1)); } catch (e) { add('SYS', 'Fault · ' + verb); }
    busy = false; grp = 0; rowEl.classList.remove('busy'); inEl.readOnly = false; toTop();
  }
  // Tab: the command, an agent number, a mesh or a path, from what's there now
  function complete(){
    const v = inEl.value, parts = v.split(' '), last = parts[parts.length - 1], verb = parts[0].replace(/^-/, '').toLowerCase();
    let opts = [], pre = last, head = '';
    if (parts.length === 1) opts = CMDS.slice();
    else if (verb === 'deploy' && parts.length === 2) opts = ['1', '2', '3'];
    else if (verb === 'probe' && parts.length === 2) opts = ['A', 'B', 'C'].filter(meshOn).map(m => MESHL[m]);
    else {
      const k = last.lastIndexOf('/'); head = k >= 0 ? last.slice(0, k + 1) : ''; pre = last.slice(k + 1).toLowerCase();
      const base = k >= 0 ? resolve(head.length > 1 ? head.slice(0, -1) : head, opCtx.cwd) : nodeAt(opCtx.cwd);
      opts = kids(base).map(x => base.k === 'dir' ? x : x + '/');
    }
    const m = opts.filter(o => o.toLowerCase().startsWith(pre.toLowerCase())); if (!m.length) return;
    let common = m[0]; for (const o of m) while (!o.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    const tail = m.length === 1 ? m[0] + (m[0].endsWith('/') ? '' : ' ') : common;
    const nv = parts.slice(0, -1).concat([head + tail]).join(' ');
    if (nv !== v){ inEl.value = nv; return; }
    if (m.length > 1) add('SYS', m.join(' · '));
  }
  function promptSetup(){
    rowEl = el.querySelector('.wl-in'); inEl = rowEl.querySelector('input'); pwEl = rowEl.querySelector('.pw');
    opCtx.cwd = W.cwd = (nodeAt(W.cwd) && nodeAt(W.cwd).k !== 'off') ? W.cwd : []; showCwd();
    inEl.addEventListener('focus', () => { rowEl.classList.add('on'); try { keys.clear(); } catch (e) {} });
    inEl.addEventListener('blur', () => rowEl.classList.remove('on'));
    const has = () => rowEl.classList.toggle('has', !!inEl.value); inEl.addEventListener('input', has); inEl.addEventListener('keyup', has);
    inEl.addEventListener('keydown', e => {
      e.stopPropagation();   // (the game's keys stay off while typing)
      if (e.key === 'Escape'){ e.preventDefault(); inEl.blur(); return; }
      if (e.key === 'Tab'){ e.preventDefault(); if (!busy && !tracing) complete(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); if (busy || !W.hist.length) return;
        if (hi < 0){ draft = inEl.value; hi = W.hist.length; } hi = Math.max(0, Math.min(W.hist.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
        inEl.value = hi === W.hist.length ? draft : W.hist[hi]; if (hi === W.hist.length) hi = -1; return; }
      if (e.key === 'Enter'){ e.preventDefault(); if (busy || tracing) return; const v = inEl.value; inEl.value = ''; exec(v); }
    });
    inEl.addEventListener('keyup', e => e.stopPropagation());
  }
  // "/" anywhere in the game: start typing
  addEventListener('keydown', e => {
    if (e.key !== '/' || !el || el.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (typeof OVERSEER !== 'undefined' && OVERSEER.open) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (el.classList.contains('collapsed')) setCollapsed(false);
    if (inEl) inEl.focus();
  }, true);

  /* ---------- stages ---------- */
  function boot(){
    W.seed = W.seed || ((Math.random()*1e9) | 0); rs = W.seed;
    const s = snap();
    add('SYS', 'Wire Nest · online · node 07', { key: 1 });
    add('SYS', 'Sniffer · listening · 2.4 / 5.8 GHz');
    add('CITY', `Index · ${s.z.any} buildings · ${residents()} residents`);
  }
  function setStage(n){
    W.stage = n; W.st = 0; save();
    if (n === 1){ add('MESH', `Mesh A · online · ${nodes(cur ? cur.z : snap().z, 1)} nodes`); add('CORP', `${CORP.synth} · recall · SK-3 optics · batch 14-J`); }
    if (n === 2) leakFound();
    if (n === 3) add('SIGNAL', signalLine());
  }
  function stageTick(dt){
    W.st += dt;
    if (W.stage === 0 && W.st > T.s1) setStage(1);
    else if (W.stage === 2 && W.leak === 'done' && W.st > T.s3) setStage(3);
  }

  /* ---------- the panel ---------- */
  function makePanel(){
    if (el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('aside'); el.id = 'wirelog'; el.setAttribute('aria-label', 'Transmission log');
    el.innerHTML = `<div class="wl-agents" aria-hidden="true"></div><div class="wl-box">
      <header tabindex="0" role="button" aria-expanded="true" title="Open or fold the log"><span class="chev" aria-hidden="true">▾</span><span class="t"><span class="full">Transmission log</span><span class="short">Log</span></span><span class="r"><span class="live" aria-hidden="true"></span><span class="nd">NODE 07</span>
        <button type="button" id="wlArc" title="Saved events and pulled files">ARC 0</button></span></header>
      <label class="wl-in"><span class="pw"></span><span class="pr">&gt;</span><span class="cur fk" aria-hidden="true"></span><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command line"></label>
      <div class="wl-body" role="log" aria-live="polite"></div>
      <div class="wl-foot"><span>RX <b id="wlRx">0</b> pkt/s</span><span>MESH <b id="wlMesh">A</b></span><span>LINES <b id="wlN">0</b>/${MAX_LINES}</span></div></div>`;
    document.body.appendChild(el);
    bodyEl = el.querySelector('.wl-body'); footEl = el.querySelector('.wl-foot'); agentsEl = el.querySelector('.wl-agents');
    bodyEl.addEventListener('scroll', () => { stick = bodyEl.scrollTop < 6; });
    bodyEl.addEventListener('click', e => { if (!e.target.closest('button')) fast = true; });   // a click hurries the swarm along
    el.querySelector('#wlArc').addEventListener('click', e => { e.stopPropagation(); el.querySelector('#wlArc').classList.remove('fresh'); if (el.classList.contains('collapsed')) setCollapsed(false); showView(view === 'log' ? 'arc' : 'log'); });
    const hd = el.querySelector('header'), fold = () => setCollapsed(!el.classList.contains('collapsed'));   // the whole header opens and folds it
    hd.addEventListener('click', fold); hd.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === hd){ e.preventDefault(); fold(); } });
    let col = null; try { col = localStorage.getItem(COLLAPSE_KEY); } catch (e) {}
    setCollapsed(col === '1', true);
    document.body.classList.add('wl-on');
    new ResizeObserver(() => document.body.style.setProperty('--wl-h', el.getBoundingClientRect().height + 'px')).observe(el);
    promptSetup();
    showView('log');
  }
  function setCollapsed(c, quiet){
    el.classList.toggle('collapsed', c); const hd = el.querySelector('header'); hd.setAttribute('aria-expanded', !c); hd.querySelector('.chev').textContent = c ? '▸' : '▾';
    if (!quiet) try { localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); } catch (e) {}
    if (!c) toTop();
  }
  function showView(v, doc){
    view = v; bodyEl.innerHTML = ''; el.querySelector('#wlArc').textContent = v === 'log' ? 'ARC ' + W.archive.length : 'LOG';
    if (v === 'log'){
      for (const L of W.lines){ const d = lineEl(L); L.el = d; put(d, L); }
      const lastOpt = k => [...W.lines].reverse().find(L => L.opt === k);
      if (W.trace === 'offered'){ const L = lastOpt('trace'); if (L) optButtons(L.el, traceYes, traceNo); }
      if (P){ const L = lastOpt(P.nx.key); if (L){ P.L = L; optButtons(L.el, () => approve(), () => decline()); } }
      stick = true; toTop(); return;
    }
    if (v === 'doc'){
      const a = W.archive[doc]; const d = document.createElement('div'); d.className = 'doc';
      d.innerHTML = `<div class="hd">${esc(a.kind)} · ${esc(a.title)} · ${esc(a.t)}</div>${a.body.map(esc).join('\n')}<br><button type="button" class="back">BACK</button>`;
      d.querySelector('.back').addEventListener('click', () => showView('arc'));
      bodyEl.appendChild(d); bodyEl.scrollTop = 0; return;
    }
    const box = document.createElement('div'); box.className = 'arc';
    if (!W.archive.length) box.innerHTML = '<div class="empty">Archive · empty</div>';
    W.archive.map((a, i) => [a, i]).reverse().forEach(([a, i]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'it';
      b.innerHTML = `<span class="ts">${esc(a.t)}</span><span class="nm">${esc(a.title)}</span><span class="kd">${esc(a.kind)}</span>`;
      b.addEventListener('click', () => showView('doc', i)); box.appendChild(b);
    });
    bodyEl.appendChild(box); bodyEl.scrollTop = 0;
  }
  const setTxt = (n, v) => { v = String(v); if (n && n.textContent !== v) n.textContent = v; };
  function foot(s){
    if (!footEl || el.classList.contains('collapsed')) return;
    setTxt(footEl.querySelector('#wlRx'), Math.round((60 + s.z.any*4.5 + outside()*.8) * (.9 + rnd()*.2)));
    setTxt(footEl.querySelector('#wlMesh'), W.mesh.join(' '));
    setTxt(footEl.querySelector('#wlN'), W.lines.length);
  }

  /* ---------- the tick (main.js, once a frame; not while the Overseer's desk is up) ---------- */
  let next = 4, snapT = 0, saveT = 0, footT = 0, started = false;
  const unlocked = () => safe(() => megaUnlockedKinds.has('wirenest') || megasOfKind('wirenest').length > 0, false);
  function tick(rdt){
    const dt = Math.min(rdt, .25);
    if (!started){
      if (!unlocked()) return;
      started = true; load(); rs = W.seed || 1; while (!zoneStep(1e9)); makePanel();
      if (!W.on){ W.on = true; boot(); }
      if (['offered', 'declined', 'running'].includes(W.leak)) W.leak = W.probed.includes('A') ? 'found' : 'none';   // (saves from before the trace)
      if (W.leak === 'swarm') W.leak = 'found';   // (reloaded mid-swarm: it asks again)
      if (W.trace === 'offered') W.trace = 'none';
      el.hidden = false; showView('log');
    }
    runWaits(dt);
    if (zIter || (snapT += dt) > 3){ if (zoneStep()){ snapT = 0; cur = snap(); events(cur); } }
    flushBuild(dt);
    stageTick(dt);
    traceTick(dt);
    if (W.leak !== 'swarm' && !tracing && !typing() && (next -= dt) <= 0){ next = T.gapLo + rnd()*(T.gapHi - T.gapLo); ambient(); }
    if ((footT += dt) > 3 && cur){ footT = 0; foot(cur); }
    if ((saveT += dt) > 3){ saveT = 0; flushSave(); }
  }
  addEventListener('pagehide', flushSave);

  const dev = {
    stage: n => { if (!started) return 'no Wire Nest yet'; setStage(n); return W.stage; },
    fast: (k = 20) => { for (const x of ['s1', 's3', 'reoffer']) T[x] /= k; T.gapLo /= 4; T.gapHi /= 4; return T; },
    leak: () => { if (started) leakFound(); },
    trace: () => { if (started) traceYes(); },
    line: () => ambient(),
    reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
    state: () => W,
    run: line => exec(line), complete: v => { inEl.value = v; complete(); return inEl.value; },
  };
  return { tick, dev, state: () => W };
})();
window.WIRELOG = WIRELOG;
