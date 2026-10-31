// Neon Terrarium: the transmission log. Once the Wire Nest has arrived, a panel at the top right listens to the city and
// reports in short, dry fragments: CITY (read from the city as it stands), MESH (the network's chatter), CORP (the
// corporations' bulletins) and SIGNAL (something out there, slowly getting closer). Flavor only: nothing to type, nothing
// to answer. It moves through stages as play goes on: CITY alone at first, then the meshes and the first bulletins, then
// more corp traffic, then the signal ladder. The last 40 lines are kept. Click the header to fold it or open it again.
// On a touch screen it's a one-line ticker along the top instead (the newest line and how many came since you last looked);
// a tap opens the whole log in the shared bottom sheet (tsheet.js), newest at the bottom.
// Content plan: claude/transmission-log-plan.md in the project. Ticked from main.js; saves in this browser.
// (The command line, the trace agent and the corp file systems that were here are kept for the hacking mode later:
// js/wirefs.js holds the files; the code is in git history, "Transmission log: the trace offers every step".)
'use strict';
const WIRELOG = (() => {
  const KEY = 'neonIsland.wirelog', COLLAPSE_KEY = (typeof TOUCH !== 'undefined' && TOUCH.on ? 'touch:' : '') + 'neonIsland.wirelog.collapsed';   // (touch screens keep their own fold)
  const MAX_LINES = 40;
  const TS = typeof TSHEET !== 'undefined' && TSHEET.on ? TSHEET : null;   // (a touch screen: the ticker and the sheet)
  // stage timings, real seconds with the log running (WIRELOG.dev.fast() divides them)
  const T = { s1: 150, s2: 240, s3: 360, gapLo: 8, gapHi: 15 };
  // the corporations: SynthCorp is settled, the other three are placeholders until they get their names
  const CORP = { synth: 'SYNTHCORP', logi: 'HALVREN', media: 'MERIDIAN', civic: 'OSTRAVA' };
  const ZONE_NAME = { low: 'Zone A', mid: 'Zone B', high: 'Zone C', ind: 'Zone D' };

  const css = `
  #wirelog { --wl-bg: rgba(13,9,24,.94); --wl-line: rgba(214,92,255,.42); --wl-hair: rgba(214,92,255,.16); --wl-head: #ff6fb8; --wl-dim: #6f6888; --wl-txt: #d9d2ea;
    --c-city: #38e8e0; --c-mesh: #5affa8; --c-corp: #ffb347; --c-sig: #ff5a6e;
    position: fixed; top: calc(58px + env(safe-area-inset-top,0px)); right: 16px; width: min(372px, calc(100vw - 32px)); z-index: 3;
    font: 10.5px/1.5 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--wl-txt); letter-spacing: .02em; }
  #wirelog[hidden] { display: none; }
  #wirelog .wl-box { background: var(--wl-bg); border: 1px solid var(--wl-line); contain: layout paint style; }
  #wirelog header { display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 9px; border-bottom: 1px solid var(--wl-hair); cursor: pointer; user-select: none; }
  #wirelog header:hover .t, #wirelog header:focus-visible .t { color: #fff; } #wirelog header:focus-visible { outline: 1px solid var(--wl-line); outline-offset: -1px; }
  #wirelog header .chev { color: var(--wl-dim); font-size: 9px; width: 8px; text-align: center; }
  #wirelog header .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--wl-head); font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; white-space: nowrap; }
  #wirelog header .t .short { display: none; }
  #wirelog header .r { flex-shrink: 0; margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--wl-dim); font-size: 9px; letter-spacing: .14em; white-space: nowrap; }
  #wirelog .live { display: inline-block; width: 6px; height: 6px; background: var(--c-mesh); animation: wlBlink 1.6s steps(2) infinite; }
  @keyframes wlBlink { 50% { opacity: .25; } }
  #wirelog .wl-body { height: 178px; overflow-y: auto; overflow-x: hidden; padding: 4px 0 5px; scrollbar-width: thin; scrollbar-color: var(--wl-line) transparent; }
  #wirelog.collapsed .wl-body, #wirelog.collapsed .wl-foot { display: none; }
  #wirelog.collapsed header { border-bottom: 0; }
  #wirelog .wl-line { display: grid; grid-template-columns: 38px 50px minmax(0,1fr); gap: 6px; align-items: start; padding: 1px 9px; opacity: .8; }
  #wirelog .wl-line:nth-last-child(-n+4) { opacity: 1; }
  #wirelog .wl-line > span:last-child { white-space: normal; overflow-wrap: anywhere; }   /* (a long line wraps under itself; nothing is cut off) */
  #wirelog .wl-line .ts, #wirelog .wl-line .ch { white-space: nowrap; }
  #wirelog .wl-line .ts { color: var(--wl-dim); font-variant-numeric: tabular-nums; }
  #wirelog .wl-line .ch { letter-spacing: .1em; font-size: 9.5px; }
  #wirelog .ch-CITY .ch { color: var(--c-city); } #wirelog .ch-MESH .ch { color: var(--c-mesh); } #wirelog .ch-CORP .ch { color: var(--c-corp); } #wirelog .ch-SIGNAL .ch { color: var(--c-sig); }
  #wirelog .ch-SYS .ch { color: var(--wl-head); }
  #wirelog .ch-SIGNAL .tx { color: #ffc2c9; }
  #wirelog .wl-line.key .tx { color: #fff; }
  #wirelog .wl-foot { display: flex; gap: 12px; padding: 3px 9px 4px; border-top: 1px solid var(--wl-hair); color: var(--wl-dim); font-size: 9px; letter-spacing: .12em; white-space: nowrap; overflow: hidden; }
  #wirelog .wl-foot b { color: var(--wl-txt); font-weight: 400; font-variant-numeric: tabular-nums; }
  /* room for it: beside the monitor or the settings when they're open; pinned people go under it */
  body.watching #wirelog { right: calc(16px + min(340px, 100vw - 32px) + 8px); }
  body.deck-open #wirelog { right: 304px; }
  body.watching.deck-open #wirelog { right: calc(304px + min(340px, 100vw - 32px) + 8px); }
  body.wl-on .mon-pins { top: calc(58px + var(--wl-h, 0px) + 8px + env(safe-area-inset-top,0px)); }
  @media (max-width: 700px) {
    #wirelog { width: calc(100vw - 32px); }
    #wirelog.collapsed { width: auto; }
    #wirelog.collapsed header .t .full, #wirelog.collapsed header .nd { display: none; } #wirelog.collapsed header .t .short { display: inline; }
    #wirelog .wl-line { grid-template-columns: 34px 46px minmax(0,1fr); gap: 4px; }
    #wirelog .wl-body { height: 150px; }
  }
  `;

  /* ---------- state (saved) ---------- */
  const W = { on: false, stage: 0, st: 0, lines: [], sig: 0, seed: 0, mesh: ['A'] };
  let el = null, bodyEl = null, footEl = null, stick = true;
  let tickEl = null, unread = 0, newEl = null, fresh = 0;   // (touch: the ticker, the lines it hasn't shown you, the "new" chip in the sheet)
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object'){ for (const k of Object.keys(W)) if (k in v) W[k] = v[k]; } } catch (e) {}
    if (!Array.isArray(W.lines)) W.lines = []; if (!Array.isArray(W.mesh)) W.mesh = ['A'];
    W.lines = W.lines.filter(L => L && ['CITY', 'MESH', 'CORP', 'SIGNAL', 'SYS'].includes(L.ch) && !/leak|swarm|trace|Agent|Option|Pull|Transfer|Scan|FLAG/i.test(L.x)).map(({ t, ch, x, key }) => ({ t, ch, x, key })); };   // (lines from the old command line go)
  let saveDue = false;
  const save = () => { saveDue = true; };
  const flushSave = () => { if (!saveDue) return; saveDue = false; try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) {} };

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
    d.innerHTML = `<span class="ts">${esc(L.t)}</span><span class="ch">${esc(L.ch)}</span><span class="tx">${esc(L.x)}</span>`;
    return d;
  }
  function add(ch, x, o = {}){
    const L = { t: now(), ch, x }; if (o.key) L.key = 1;
    W.lines.push(L); while (W.lines.length > MAX_LINES) W.lines.shift(); save();
    if (bodyEl){ bodyEl.appendChild(lineEl(L)); while (bodyEl.childElementCount > MAX_LINES) bodyEl.firstElementChild.remove(); toEnd(); }
    if (TS) ticked(L);
  }
  function toEnd(){ if (bodyEl && stick) bodyEl.scrollTop = bodyEl.scrollHeight; }
  // the ticker shows the newest line; with the sheet open and the reader scrolled back up, a chip counts what came in below
  function ticked(L){
    if (!tickEl) return;
    const open = TS.isOpen(el);
    if (L){ tickEl.querySelector('.ch').textContent = L.ch; tickEl.querySelector('.tx').textContent = L.x; tickEl.dataset.ch = L.ch;
      if (!open) unread++; else if (!stick) fresh++; }
    const n = tickEl.querySelector('.n'); n.hidden = !unread; n.textContent = unread > 9 ? '9+' : String(unread);
    tickEl.setAttribute('aria-label', 'Transmission log' + (unread ? ', ' + unread + ' new' : '') + ': open');
    if (newEl){ newEl.hidden = !(open && fresh && !stick); newEl.textContent = '▼ ' + fresh + ' new'; }
  }
  function openSheet(){
    if (TS.isOpen(el)){ TS.close(el); return; }
    TS.open(el, { key: 'wirelog', title: 'Transmission log', detent: 'half', detents: ['half', 'full'], scroll: false, onClose: () => { fresh = 0; ticked(); } });
    unread = 0; fresh = 0; stick = true; toEnd(); ticked(); if (cur) foot(cur);
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
    if (n === 2){ add('CORP', `${CORP.logi} · depot 4 · night intake · ${ri(20, 60)} units`); }
    if (n === 3) add('SIGNAL', signalLine());
  }
  function stageTick(dt){
    W.st += dt;
    if (W.stage === 0 && W.st > T.s1) setStage(1);
    else if (W.stage === 1 && W.st > T.s2) setStage(2);
    else if (W.stage === 2 && W.st > T.s3) setStage(3);
  }

  /* ---------- the panel ---------- */
  function makePanel(){
    if (el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('aside'); el.id = 'wirelog'; el.setAttribute('aria-label', 'Transmission log');
    el.innerHTML = `<div class="wl-box">
      <header tabindex="0" role="button" aria-expanded="true" title="Open or fold the log"><span class="chev" aria-hidden="true">▾</span><span class="t"><span class="full">Transmission log</span><span class="short">Log</span></span><span class="r"><span class="live" aria-hidden="true"></span><span class="nd">NODE 07</span></span></header>
      <div class="wl-body" role="log" aria-live="polite"></div>
      <div class="wl-foot"><span>RX <b id="wlRx">0</b> pkt/s</span><span>MESH <b id="wlMesh">A</b></span><span>LINES <b id="wlN">0</b>/${MAX_LINES}</span></div></div>`;
    document.body.appendChild(el);
    bodyEl = el.querySelector('.wl-body'); footEl = el.querySelector('.wl-foot');
    bodyEl.addEventListener('scroll', () => { stick = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 6; if (stick && fresh){ fresh = 0; ticked(); } });
    const hd = el.querySelector('header'), fold = () => { if (!TS) setCollapsed(!el.classList.contains('collapsed')); };   // the whole header opens and folds it (on touch the sheet does)
    hd.addEventListener('click', fold); hd.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === hd){ e.preventDefault(); fold(); } });
    let col = null; try { col = localStorage.getItem(COLLAPSE_KEY); } catch (e) {}
    setCollapsed(!TS && col === '1', true);
    if (TS){
      tickEl = document.createElement('button'); tickEl.id = 'wlTick'; tickEl.className = 'wl-tick'; tickEl.type = 'button'; tickEl.hidden = true;
      tickEl.innerHTML = '<span class="live" aria-hidden="true"></span><span class="ch"></span><span class="tx"></span><b class="n" hidden></b>';
      tickEl.addEventListener('click', openSheet); document.body.appendChild(tickEl);
      newEl = document.createElement('button'); newEl.className = 'wl-new'; newEl.type = 'button'; newEl.hidden = true;
      newEl.addEventListener('click', () => { stick = true; toEnd(); fresh = 0; ticked(); });
      el.querySelector('.wl-box').appendChild(newEl);
      const last = W.lines[W.lines.length - 1]; if (last){ tickEl.querySelector('.ch').textContent = last.ch; tickEl.querySelector('.tx').textContent = last.x; tickEl.dataset.ch = last.ch; }
      ticked();
    }
    document.body.classList.add('wl-on');
    new ResizeObserver(() => document.body.style.setProperty('--wl-h', el.getBoundingClientRect().height + 'px')).observe(el);
    for (const L of W.lines) bodyEl.appendChild(lineEl(L));
    stick = true; toEnd();
  }
  function setCollapsed(c, quiet){
    el.classList.toggle('collapsed', c); const hd = el.querySelector('header'); hd.setAttribute('aria-expanded', !c); hd.querySelector('.chev').textContent = c ? '▸' : '▾';
    if (!quiet) try { localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); } catch (e) {}
    if (!c){ stick = true; toEnd(); }
    if (!quiet && typeof PERF !== 'undefined' && PERF.quiet) PERF.quiet(1000);
  }
  const setTxt = (n, v) => { v = String(v); if (n && n.textContent !== v) n.textContent = v; };
  function foot(s){
    if (!footEl || el.classList.contains('collapsed') || (TS && !TS.isOpen(el))) return;
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
      el.hidden = false; if (tickEl) tickEl.hidden = false;
    }
    if (zIter || (snapT += dt) > 3){ if (zoneStep()){ snapT = 0; cur = snap(); events(cur); } }
    flushBuild(dt);
    stageTick(dt);
    if ((next -= dt) <= 0){ next = T.gapLo + rnd()*(T.gapHi - T.gapLo); ambient(); }
    if ((footT += dt) > 3 && cur){ footT = 0; foot(cur); }
    if ((saveT += dt) > 3){ saveT = 0; flushSave(); }
  }
  addEventListener('pagehide', flushSave);

  const dev = {
    stage: n => { if (!started) return 'no Wire Nest yet'; setStage(n); return W.stage; },
    fast: (k = 20) => { for (const x of ['s1', 's2', 's3']) T[x] /= k; T.gapLo /= 4; T.gapHi /= 4; return T; },
    line: () => ambient(),
    reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
    state: () => W,
  };
  return { tick, dev, state: () => W, say: (ch, x) => { if (started) add(ch, x); } };   // (say: a line from elsewhere, economy.js)
})();
window.WIRELOG = WIRELOG;
