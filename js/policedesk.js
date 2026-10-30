// Neon Terrarium: the Precinct desk. Double-click a police station and its operations screen comes up over the city, in the style of a
// survey terminal (green phosphor on black, hairline grids, coded panels, dense tables): the call log, the units on shift by badge number,
// the drones' rounds and the points they've scanned, where the trouble is (hotspots by sector and by hour), the stations, and the case
// files, coded, never named, each with its stage, its last logged activity and the lead the desk would chase next. At its heart a 2D plan
// of the city with all of it on: click an officer to follow them on the person cam, a call to take the camera there, a drone to trace its
// route. The city goes on under the desk (main.js simBody: simulated, not drawn), so the plan is live: zoom it, drag it, click anything.
// The calls: the city's real ones (street robberies on the dark streets, the case moments, see people.js and cityledger.js) and the
// everyday ones a precinct takes (noise, shoplifting, pickpockets, disturbances, fare dodging, break-ins), made up from where people actually
// are, a few an hour, more at night. They're kept with the city (localStorage 'neonIsland.precinct', one of the city's keys: saveguard.js).
// All game scripts share one scope and load in order (see index.html); this one loads after cityledger.js and overseer.js.
'use strict';
const PRECINCT = (() => {
  const PD = { open: false, hold: false, busy: false, live: true };
  const KEY = 'neonIsland.precinct', MAXC = 320;
  const safe = (f, d) => { try { const v = f(); return v === undefined || Number.isNaN(v) ? d : v; } catch (e) { return d; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const p2 = n => String(Math.floor(n)).padStart(2, '0');
  const clock = () => safe(() => STORY.clock, 0);
  const tc = c => 'D' + (Math.floor(c/1440) + 1) + ' ' + p2((c % 1440)/60) + ':' + p2(c % 60);
  const hm = c => { const m = Math.round(c) % 1440; return p2(m/60) + ':' + p2(m % 60); };   // (rounded to the minute, as the city's own clock is: input.js fmt)
  const hsh = s => { let v = 2166136261; s = String(s); for (let i = 0; i < s.length; i++){ v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };
  const badge = id => '#' + (1000 + hsh(id + ':badge') % 9000);
  const fileNo = arc => { const ks = safe(() => [...CASES.arcs.keys()].sort(), []), k = ks.indexOf(arc); return 'CF-' + (k < 0 ? 1000 + hsh(arc + ':file') % 9000 : 1000 + (hsh('cf') % 2000) + k*373); };   // (coded, never named; unique per file)

  /* ---------- the record ---------- */
  let R = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && Array.isArray(v.calls)) return v; } catch (e) {} return null; })() || { v: 1, calls: [], seq: 0, arrests: 0, lastH: -1 };
  let dirty = false; const save = () => { dirty = true; };
  setInterval(() => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} }, 4000);
  addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} });
  const stations = () => safe(() => [...megas.values()].filter(m => m.kind === 'police'), []);
  const cops = () => safe(() => pplList.filter(p => p.cop && !p.guard && !p.gone), []);
  const ZN = { low: 'RESIDENTIAL', mid: 'COMMERCIAL', high: 'LUXURY', ind: 'INDUSTRIAL' };
  // the city's sectors: an 8 x 6 grid over its plots, A1 to H6 (the same idea as the Data Spire's)
  function bounds(){ let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity; safe(() => { for (const c of cells.values()){ if (c.i < i0) i0 = c.i; if (c.i > i1) i1 = c.i; if (c.j < j0) j0 = c.j; if (c.j > j1) j1 = c.j; } });
    if (!isFinite(i0)){ i0 = j0 = -2; i1 = j1 = 2; } return { i0, i1, j0, j1, ni: i1 - i0 + 1, nj: j1 - j0 + 1 }; }
  let B = bounds();
  const sector = (x, z) => { const i = Math.round(x/LOT), j = Math.round(z/LOT); return 'ABCDEFGH'[Math.max(0, Math.min(7, Math.floor((i - B.i0)/B.ni*8)))] + (Math.max(0, Math.min(5, Math.floor((j - B.j0)/B.nj*6))) + 1); };
  const zoneAt = (x, z) => safe(() => { const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT))); if (!c) return null; if (c.mega) return 'mega:' + megas.get(c.mega).kind; return c.sections.length ? c.sections[0].zone : c.wall ? c.wall.zone : null; }, null);
  const nearestCop = (x, z) => { let best = null, bd = Infinity; for (const p of cops()){ if (p.offDuty || p.x === undefined) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd){ bd = d; best = p; } } return best; };
  function addCall(o){
    const c = Object.assign({ id: ++R.seq, c: clock(), st: 'open', sec: sector(o.x, o.z) }, o);
    if (!c.unit){ const p = nearestCop(o.x, o.z); if (p) c.unit = p.id; }
    R.calls.push(c); while (R.calls.length > MAXC) R.calls.shift(); save(); return c;
  }
  // the everyday calls: what kind goes with what's there
  const KINDS = {
    low: [['NOISE COMPLAINT', 3, .05], ['DOMESTIC DISPUTE', 2, .25], ['BREAK-IN', 2, .3], ['SUSPICIOUS PERSON', 3, .1], ['VANDALISM', 3, .2]],
    mid: [['SHOPLIFTING', 3, .45], ['PICKPOCKET', 2, .3], ['DISTURBANCE', 3, .2], ['FRAUD REPORT', 3, .15], ['STALL DISPUTE', 4, .05]],
    high: [['TRESPASS', 3, .3], ['ALARM ACTIVATION', 4, .05], ['THEFT FROM VEHICLE', 2, .2], ['HARASSMENT', 2, .25]],
    ind: [['CARGO THEFT', 2, .3], ['TRESPASS', 3, .3], ['INDUSTRIAL ALARM', 4, .05], ['SCRAP THEFT', 3, .35]],
    club: [['DISTURBANCE', 2, .35], ['ASSAULT', 1, .5], ['INTOXICATED PERSON', 3, .15]],
    metro: [['FARE EVASION', 4, .4], ['PICKPOCKET', 2, .3], ['TRESPASS ON TRACKS', 2, .4]],
    open: [['DISTURBANCE', 3, .2], ['PICKPOCKET', 2, .3], ['LOST PROPERTY', 5, 0], ['STREET VENDING', 4, .1]],
  };
  function simHour(h){
    if (!stations().length) return;
    const pts = safe(() => LEDGER.crowds().pts, []); if (!pts.length) return;
    const hr = ((h % 24) + 24) % 24, night = hr >= 21 || hr < 4 ? 1.8 : hr < 7 ? .5 : 1;
    const mean = Math.min(5, (.45 + pts.length/160)*night);
    let n = 0; for (let k = 0; k < 8; k++) if (Math.random() < mean/8) n++;
    for (let q = 0; q < n; q++){
      const [x, z] = pts[Math.floor(Math.random()*pts.length)], zn = zoneAt(x, z);
      const set = zn === 'mega:club' ? KINDS.club : zn && zn.startsWith('mega:') ? KINDS.open : (safe(() => mtAt(Math.round(x/LOT), Math.round(z/LOT)).length, 0) ? KINDS.metro : KINDS[zn] || KINDS.open);
      const [kind, pri, arr] = set[Math.floor(Math.random()*set.length)];
      const at = h*60 + Math.floor(Math.random()*60);
      addCall({ kind, pri, x: +(x + (Math.random() - .5)*.8).toFixed(1), z: +(z + (Math.random() - .5)*.8).toFixed(1), src: 'call', c: at, due: at + 12 + Math.floor(Math.random()*70), arr });
    }
  }
  function resolve(){
    const now = clock();
    for (const c of R.calls){ if (c.st !== 'open' || c.due === undefined || now < c.due) continue;
      const u = Math.random(); c.st = u < (c.arr || 0) ? 'ARREST' : u < (c.arr || 0) + .35 ? 'CLEARED' : u < .9 ? 'ADVISED' : 'UNFOUNDED'; c.done = c.due; if (c.st === 'ARREST') R.arrests++; save(); }
  }
  // the real ones: robberies on the dark streets (people.js logEvent), and the case moments (cityledger.js)
  function hookLog(){
    if (typeof logEvent !== 'function' || logEvent._pd) return;
    const orig = logEvent;
    const w = function (e){ orig.apply(this, arguments); safe(() => {
      if (STORY.engine === false) return;
      if (e.kind === 'mugging') addCall({ kind: 'ROBBERY · STREET', pri: 1, x: +e.x.toFixed(1), z: +e.z.toFixed(1), src: 'real', due: clock() + 25 + Math.floor(Math.random()*40), arr: .4 });
      else if (e.kind === 'police'){ const last = [...R.calls].reverse().find(c => c.src === 'real' && c.st === 'open'); if (last && e.officer) { last.unit = e.officer; save(); } }
    }); };
    w._pd = true; logEvent = w;
  }
  let incSeen = -1;
  function caseCalls(){
    const inc = safe(() => LEDGER.inc(), []); if (incSeen < 0){ incSeen = R.incSeen ?? inc.length; }
    if (incSeen > inc.length) incSeen = inc.length;
    for (let k = incSeen; k < inc.length; k++){ const x = inc[k], ord = x.arc === 'ordinary-police-work'; addCall(ord ? { kind: 'POLICE MATTER', pri: 3, x: x.x, z: x.z, src: 'real', c: x.c, due: x.c + 30, arr: .2 } : { kind: 'CASE ACTIVITY', pri: 2, x: x.x, z: x.z, src: 'case', file: fileNo(x.arc), c: x.c, st: 'LOGGED' }); }
    incSeen = R.incSeen = inc.length;
  }
  function tick(){
    if ((PD.hold && !PD.live) || typeof pplReady === 'undefined' || !pplReady || safe(() => STORY.engine === false, false)) return;   // (no calls while the storylet engine is off)
    hookLog(); caseCalls(); B = bounds();
    const h = Math.floor(clock()/60);
    if (R.lastH < 0 || h - R.lastH > 6) R.lastH = h - 1;   // (a long gap: only the last hour or so is made up)
    while (R.lastH < h){ R.lastH++; simHour(R.lastH); }
    resolve();
  }
  setInterval(tick, 1500);

  /* ---------- reading it all for the screen ---------- */
  const ORD = { RESPONDING: 0, 'ON BEAT': 1, 'EN ROUTE': 2, 'AT STATION': 3, REPORTING: 4, 'GOING HOME': 5, 'OFF SHIFT': 6, 'STOOD DOWN': 7 };
  function officers(){
    const now = clock(), hr = (now % 1440)/60;
    return cops().map(p => {
      const shift = p.copShift ?? Math.min(2, Math.floor((p.nightShift || 0)*3)), sn = ['DAY', 'SWING', 'NIGHT'][shift];
      const onShift = typeof working === 'function' ? safe(() => working(p, hr), false) : true;
      const st = p.offDuty ? 'STOOD DOWN' : p.rush || p.callout ? 'RESPONDING' : p.patrol ? 'ON BEAT' : p.walk ? (onShift ? 'EN ROUTE' : 'GOING HOME') : p.at === p.job ? 'AT STATION' : onShift ? 'REPORTING' : 'OFF SHIFT';
      const pl = safe(() => places.get(p.at), null), x = p.walk || !pl ? p.x : pl.x, z = p.walk || !pl ? p.z : pl.z;
      const stn = stations().findIndex(m => 'm:' + m.id === p.job);
      return { id: p.id, b: badge(p.id), unit: (stn + 1) + '-' + 'ADC'[shift] + '-' + p2(hsh(p.id) % 60), shift: sn, st, x, z, sec: isFinite(x) ? sector(x, z) : '--', stn };
    }).sort((a, b) => (ORD[a.st] - ORD[b.st]) || a.b.localeCompare(b.b));
  }
  function droneOps(){
    const out = []; let scans = 0, cov = 0, n = 0;
    safe(() => { POLICE_STATIONS.forEach((st, k) => { scans += st.crew.scans || 0; cov += safe(() => st.crew.coverage(), 0); n++;
      (st.drones || []).forEach((d, q) => out.push({ id: 'D-' + (k + 1) + p2(q + 1), ref: d, stn: k, mode: String(d.mode || 'rest').toUpperCase(), x: d.pos.x, z: d.pos.z, y: d.pos.y, way: (d.way || []).map(w => [w.x, w.z]), sec: sector(d.pos.x, d.pos.z) })); }); });
    const pts = []; safe(() => { const now = performance.now(), byKey = new Map([...crossAt.values()].map(q => [q.key, q])); for (const st of POLICE_STATIONS) for (const [k, t] of st.crew.visits) if (now - t < 600000){ const c = byKey.get(k); if (c) pts.push([c.x, c.z, (now - t)/600000]); } });
    return { list: out, scans, cov: n ? cov/n : 0, pts };
  }
  function cases(){
    const run = safe(() => CASES.run, null), out = [];
    if (!run) return { out, open: false };
    const today = safe(() => STORY.day(), 0) - run.start + 1, inc = safe(() => LEDGER.inc(), []);
    for (const arc of [...new Set(run.arcs)]){
      if (arc === 'ordinary-police-work') continue;
      const A = safe(() => CASES.arcs.get(arc), null); if (!A) continue;
      const rows = A.rows.filter(r => r.variant === 'base' || r.variant === (arc === run.arc ? run.variant : 'base'));
      const ms = rows.flatMap(r => r.moments.map(m => ({ m, r })));
      const major = arc === run.arc, done = major ? Math.min(21, Math.max(0, today - 1)) : ms.filter(x => run.done[x.m.id]).length, total = major ? 21 : ms.length;   // (the major file runs on its days: the case is played out over three weeks)
      const last = [...inc].reverse().find(x => x.arc === arc);
      const dOf = x => x.m.day ?? x.r.days[0], next = ms.filter(x => !run.done[x.m.id] && dOf(x) >= today).sort((a, b) => dOf(a) - dOf(b) || a.m.hour - b.m.hour)[0];
      let lead = null;
      if (next){
        const where = String(next.r.where || '').split('/')[0].replace(/-/g, ' ').toUpperCase();
        const slot = k => k.startsWith('extra:') ? arc + '/' + k : (k === 'boss-careless' || k === 'boss-careful') ? 'boss' : k;   // (as cases.js names the run's slots)
        const who = (next.m.people || []).map(k => run.cast[slot(k)]).find(id => { const p = id && people.get(id); return p && !p.cop; });
        const desc = who ? safe(() => STORY.descOf(who), 'a subject') : null;
        const dd = dOf(next) - today;
        lead = { when: (dd <= 0 ? 'TODAY' : dd === 1 ? 'TOMORROW' : 'IN ' + dd + ' DAYS') + ' ~' + p2(next.m.hour) + ':00', where, who, desc };
      }
      out.push({ file: fileNo(arc), major, done, total, last, lead, closed: !!run.closedAt && major });
    }
    return { out, open: true, day: today, heat: safe(() => run.sim.heat, null) };
  }
  let slowD = null;
  function read(slow){
    B = bounds();
    const now = clock(), day0 = Math.floor(now/1440);
    const calls = R.calls.slice().sort((a, b) => b.c - a.c);
    const today = calls.filter(c => Math.floor(c.c/1440) === day0);
    const recent = calls.filter(c => now - c.c < 3*1440);
    const bySec = new Map(), byHour = new Array(24).fill(0);
    for (const c of recent){ bySec.set(c.sec, (bySec.get(c.sec) || 0) + 1); byHour[Math.floor((c.c % 1440)/60)]++; }
    const hot = [...bySec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const ofc = officers(), dr = droneOps();
    const stn = stations().map((m, k) => ({ m, n: k + 1, sec: sector(m.x, m.z), staff: ofc.filter(o => o.stn === k).length, out: ofc.filter(o => o.stn === k && (o.st === 'ON BEAT' || o.st === 'RESPONDING' || o.st === 'EN ROUTE')).length, drones: dr.list.filter(d => d.stn === k).length,
      bikes: safe(() => POLICE_BIKES.filter(b => b.m === m).length, 0) }));
    if (!slowD) slow = true;
    const lidar = !slow ? slowD.lidar : safe(() => { const L = megasOfKind('lidar'); if (!L.length) return 0; let n = 0, k = 0; for (const c of cells.values()){ n++; if (lidarCovers(c.x, c.z)) k++; } return n ? k/n : 0; }, 0);
    const closed = today.filter(c => c.st !== 'open' && c.st !== 'LOGGED').length;
    const arrToday = today.filter(c => c.st === 'ARREST').length;
    const last = calls.find(c => c.pri <= 2 && c.src !== 'case') || calls[0] || null;
    const pts = safe(() => LEDGER.crowds().pts, []);
    const out = { pts, now, calls, today, recent, hot, byHour, ofc, dr, stn, lidar, closed, arrToday, last, cs: slow ? cases() : slowD.cs, hour: (now % 1440)/60, day: day0 + 1,
      bikes: safe(() => POLICE_BIKES.map((b, k) => ({ id: 'B-' + p2(k + 1), ref: b, mode: b.mode, stn: stations().indexOf(b.m), x: b.x, z: b.z, path: b.path && b.mode !== 'park' ? b.path.pts : null })), []) };
    if (slow) slowD = { lidar, cs: out.cs }; return out;
  }

  /* ---------- the screen ---------- */
  const css = `
  #prec { --bg:#030805; --ink:#8fdc95; --hi:#d6ffd2; --dim:#4c7a52; --faint:#1b3321; --hair:#10200f; --amb:#ffb03a; --red:#ff5d4a;
    position:fixed; inset:0; z-index:60; background:var(--bg); color:var(--ink); overflow:hidden; user-select:none; font:10px/1.35 'JetBrains Mono', ui-monospace, monospace; letter-spacing:.02em;
    display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); grid-template-rows:42px minmax(0,1.2fr) minmax(0,1fr) 22px; gap:6px; padding:8px; }
  #prec * { box-sizing:border-box; }
  #prec::after { content:''; position:absolute; inset:0; pointer-events:none; background:repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px); mix-blend-mode:multiply; }
  #prec .hi { color:var(--hi); } #prec .dim { color:var(--dim); } #prec .amb { color:var(--amb); } #prec .red { color:var(--red); }
  #prec .top { grid-column:1/-1; display:flex; align-items:stretch; border:1px solid var(--faint); }
  #prec .top > div { padding:4px 12px; border-right:1px solid var(--faint); display:flex; flex-direction:column; justify-content:center; white-space:nowrap; }
  #prec .top small { font-size:8.5px; letter-spacing:.16em; color:var(--dim); } #prec .top b { font-weight:500; color:var(--hi); letter-spacing:.12em; }
  #prec .top .clk { font-size:20px; color:var(--hi); letter-spacing:.06em; }
  #prec .top .warn { background:var(--amb); color:#120a00; padding:0 6px; }
  #prec .top .sp { flex:1; border-right:0; }
  #prec .close { margin:6px; background:transparent; border:1px solid var(--dim); color:var(--ink); font:inherit; letter-spacing:.2em; padding:0 12px; cursor:pointer; }
  #prec .close:hover { border-color:var(--hi); color:var(--hi); }
  #prec .pn { position:relative; border:1px solid var(--faint); min-width:0; min-height:0; overflow:hidden; padding:20px 8px 6px; background:linear-gradient(rgba(143,220,149,.015), transparent); }
  #prec .pn > .h { position:absolute; left:0; right:0; top:0; height:18px; display:flex; gap:10px; align-items:center; padding:0 8px; border-bottom:1px solid var(--hair); font-size:9.5px; letter-spacing:.14em; white-space:nowrap; overflow:hidden; }
  #prec .pn > .h b { color:var(--hi); font-weight:500; } #prec .pn > .h .r { margin-left:auto; color:var(--dim); }
  #prec .map { padding:18px 0 0; }
  #prec .map canvas { position:absolute; left:0; top:18px; width:100%; height:calc(100% - 18px); cursor:crosshair; }
  #prec .tip { position:absolute; pointer-events:none; background:rgba(3,8,5,.92); border:1px solid var(--ink); padding:3px 7px; color:var(--hi); font-size:9.5px; white-space:nowrap; display:none; z-index:2; }
  #prec .lg { position:absolute; left:8px; bottom:6px; display:flex; flex-wrap:wrap; gap:3px 12px; font-size:8.5px; letter-spacing:.12em; color:var(--dim); background:rgba(3,8,5,.8); padding:3px 6px; border:1px solid var(--hair); }
  #prec .lg i { display:inline-block; width:8px; height:8px; margin-right:4px; vertical-align:-1px; }
  #prec .rt { display:grid; min-height:0; }
  #prec .bt { grid-column:1/-1; display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr) minmax(0,1.25fr) minmax(0,1.25fr); gap:6px; min-height:0; }
  #prec table { width:100%; border-collapse:collapse; table-layout:fixed; font-variant-numeric:tabular-nums; }
  #prec th { text-align:left; font-weight:400; color:var(--dim); font-size:8.5px; letter-spacing:.12em; padding:1px 4px 3px; border-bottom:1px solid var(--hair); white-space:nowrap; }
  #prec td { padding:1px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-bottom:1px solid rgba(27,51,33,.4); }
  #prec tr.click { cursor:pointer; } #prec tr.click:hover td { background:rgba(143,220,149,.08); color:var(--hi); }
  #prec tr.sel td { background:rgba(143,220,149,.12); color:var(--hi); }
  #prec .tw { overflow:auto; height:100%; scrollbar-width:thin; scrollbar-color:var(--faint) transparent; }
  #prec .pri1 { color:var(--red); } #prec .pri2 { color:var(--amb); }
  #prec .st-open { color:var(--amb); } #prec .st-ARREST { color:var(--hi); } #prec .st-LOGGED { color:var(--amb); }
  #prec .bar { display:inline-block; height:6px; background:var(--ink); vertical-align:0; }
  #prec .kv { display:grid; grid-template-columns:auto 1fr; gap:1px 10px; } #prec .kv > :nth-child(odd){ color:var(--dim); letter-spacing:.1em; } #prec .kv > :nth-child(even){ text-align:right; color:var(--hi); }
  #prec .hist { display:flex; align-items:flex-end; gap:2px; height:44px; border-bottom:1px solid var(--faint); margin:4px 0 2px; } #prec .hist i { flex:1; background:var(--ink); min-height:1px; } #prec .hist i.now { background:var(--amb); }
  #prec .hx { display:flex; justify-content:space-between; color:var(--dim); font-size:8px; }
  #prec .cf { border-bottom:1px dashed var(--faint); padding:4px 0 5px; } #prec .cf:last-child { border-bottom:0; }
  #prec .cf .l1 { display:flex; gap:8px; align-items:baseline; } #prec .cf .l1 b { color:var(--hi); font-weight:500; letter-spacing:.08em; }
  #prec .cf .pg { display:flex; gap:1px; height:6px; margin:3px 0; } #prec .cf .pg i { flex:1; background:var(--faint); } #prec .cf .pg i.on { background:var(--ink); }
  #prec .cf .ld { color:var(--ink); } #prec .cf .ld em { font-style:normal; color:var(--amb); }
  #prec .cf button, #prec .lnk { background:transparent; border:1px solid var(--dim); color:var(--ink); font:inherit; font-size:8.5px; letter-spacing:.14em; padding:0 6px; cursor:pointer; margin-left:6px; }
  #prec .cf button:hover, #prec .lnk:hover { border-color:var(--hi); color:var(--hi); }
  #prec .tick { grid-column:1/-1; border:1px solid var(--faint); display:flex; align-items:center; overflow:hidden; white-space:nowrap; font-size:9.5px; }
  #prec .tick span.k { background:var(--ink); color:var(--bg); padding:0 6px; margin-right:10px; letter-spacing:.14em; height:100%; display:flex; align-items:center; }
  #prec .tick .run { display:inline-block; padding-left:100%; animation:pdTick 60s linear infinite; } @keyframes pdTick { to { transform:translateX(-100%); } }
  #prec .empty { color:var(--dim); padding:6px 2px; line-height:1.6; }
  #prec .det { position:absolute; right:8px; top:26px; width:min(300px,42%); background:rgba(3,8,5,.9); border:1px solid var(--ink); padding:8px 10px 10px; z-index:2; }
  #prec .det[hidden] { display:none; }
  #prec .det h4 { margin:0 0 2px; font-weight:500; color:var(--hi); letter-spacing:.14em; font-size:11px; } #prec .det .s { color:var(--dim); font-size:9px; letter-spacing:.12em; margin-bottom:6px; }
  #prec .det .kv { margin:4px 0 8px; } #prec .det .row { display:flex; gap:6px; flex-wrap:wrap; }
  #prec .det button { background:transparent; border:1px solid var(--ink); color:var(--hi); font:inherit; font-size:9px; letter-spacing:.14em; padding:3px 8px; cursor:pointer; } #prec .det button:hover { background:rgba(143,220,149,.15); }
  #prec .det button.back { border-color:var(--dim); color:var(--ink); }
  #prec .det .tl { display:flex; align-items:center; gap:0; margin:6px 0; } #prec .det .tl i { flex:1; height:2px; background:var(--faint); } #prec .det .tl b { width:8px; height:8px; border:1px solid var(--ink); background:var(--bg); } #prec .det .tl b.on { background:var(--ink); }
  #prec .det .tlx { display:flex; justify-content:space-between; color:var(--dim); font-size:8.5px; }
  #prec .rt { grid-template-rows:minmax(0,1.5fr) minmax(0,1fr); gap:6px; }
  #prec canvas.ch { display:block; width:100%; }
  #prec .act { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:10px; height:100%; }
  #prec .act .c1, #prec .act .c2 { display:flex; flex-direction:column; min-height:0; gap:4px; }
  #prec .act .lbl { font-size:8.5px; letter-spacing:.14em; color:var(--dim); display:flex; justify-content:space-between; }
  #prec .act canvas { flex:1; min-height:0; }
  #prec .mb { display:inline-block; height:5px; background:var(--ink); vertical-align:1px; } #prec .mb.o { background:var(--amb); }
  #prec .sig { display:inline-flex; gap:1px; align-items:flex-end; height:9px; vertical-align:-1px; } #prec .sig i { width:3px; background:var(--faint); } #prec .sig i.on { background:var(--ink); } #prec .sig.r i.on { background:var(--red); }
  #prec .secs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); gap:6px; height:100%; }
  #prec .sc { position:relative; border:1px solid var(--hair); min-height:0; display:flex; flex-direction:column; cursor:pointer; }
  #prec .sc:hover { border-color:var(--dim); }
  #prec .sc .t { display:flex; justify-content:space-between; padding:1px 4px; font-size:9px; } #prec .sc .t b { color:var(--hi); font-weight:500; }
  #prec .sc canvas { flex:1; min-height:0; width:100%; }
  #prec .sc .f { padding:0 4px 2px; font-size:8.5px; color:var(--dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #prec .dro { display:grid; grid-template-rows:auto minmax(0,1fr); height:100%; gap:4px; }
  #prec .top .bigv { font-size:22px; color:var(--hi); letter-spacing:.04em; line-height:1; } #prec .top .bigv small { font-size:9px; margin-left:4px; }
  #prec.in > * { animation:pdIn .5s steps(6) both; } @keyframes pdIn { from { opacity:0; clip-path:inset(0 0 100% 0); } to { opacity:1; clip-path:inset(0); } }
  #prec.out { animation:pdOut .35s steps(4) both; } @keyframes pdOut { to { opacity:0; clip-path:inset(48% 0 48% 0); } }
  #prec .live { color:var(--red); animation:pdBlink 1.2s steps(2) infinite; } @keyframes pdBlink { 50% { opacity:.25; } }
  #prec .mc { position:absolute; right:8px; bottom:36px; display:flex; gap:3px; align-items:center; z-index:2; background:rgba(3,8,5,.8); padding:3px; border:1px solid var(--hair); }
  #prec .mc button { background:transparent; border:1px solid var(--dim); color:var(--hi); font:inherit; font-size:10px; min-width:22px; height:20px; padding:0 6px; cursor:pointer; letter-spacing:.1em; } #prec .mc button:hover { border-color:var(--hi); background:rgba(143,220,149,.12); }
  #prec .mc .zr { color:var(--dim); font-size:9px; min-width:34px; text-align:right; padding-right:3px; }
  #prec .det { max-height:calc(100% - 96px); overflow:auto; scrollbar-width:thin; }
  #prec .det .dh { display:flex; align-items:center; gap:8px; } #prec .det .dh h4 { flex:1; } #prec .det .dh .x { border-color:var(--dim); color:var(--ink); padding:1px 6px; }
  #prec .det .vl { display:flex; justify-content:space-between; font-size:8.5px; letter-spacing:.14em; color:var(--dim); border-top:1px solid var(--hair); padding-top:4px; } #prec .det .vl span { color:var(--red); }
  #prec .det canvas.viz { position:static; display:block; width:100%; height:112px; margin:3px 0 6px; border:1px solid var(--hair); background:rgba(143,220,149,.02); }
  #prec .det button.on { background:var(--ink); color:var(--bg); }
  #prec .dro { grid-template-rows:minmax(0,1.15fr) minmax(0,1fr); } #prec .dro canvas { height:100%; min-height:0; }
  #prec .map canvas { cursor:crosshair; touch-action:none; }
  @media (max-width:1000px){ #prec { grid-template-columns:1fr; grid-template-rows:42px 52vh auto auto auto 22px; overflow:auto; } #prec .map { grid-row:auto; height:52vh; } #prec .bt { grid-template-columns:1fr; } }
  `;
  let root = null, cv = null, g = null, D = null, raf = 0, keyH = null, resH = null, hov = null, F = null, base = null, baseAt = null;
  // SEL: what's picked (a unit, a drone, a bike, a call, a station, a plot, a sector, the LIDAR array, a case subject), shown in the card on the
  // plan with a live readout of its own. VIEW: the same thing seen from overhead, the city itself re-scanned twice a second
  let SEL = null, VIEW = null, SNAP = null, dataAt = 0, slowAt = 0, cardAt = 0, sampAt = 0, lastT = 0;
  const VT = { k: 1, cx: 0, cz: 0, track: false, drag: null, moved: false };   // the plan's zoom (1 = the whole city) and the point at its centre
  const TRAIL = new Map(), SAMP = [];   // (each unit's track, a point a second while the desk is open; the picked one's finer samples, for its speed and range)
  const $ = q => root.querySelector(q);
  function build(){ if (document.getElementById('precCss')) return; const st = document.createElement('style'); st.id = 'precCss'; st.textContent = css; document.head.appendChild(st); }
  const SIGL = { RESPONDING: 4, 'ON BEAT': 4, 'EN ROUTE': 3, 'AT STATION': 2, REPORTING: 2, 'GOING HOME': 1, 'OFF SHIFT': 0, 'STOOD DOWN': 0 };
  // the storylet engine off (story.js): no calls come in and the story's clock holds, but the sky's hour still moves, and that's the time shown
  const paused = () => safe(() => STORY.engine === false, false), shownNow = () => paused() ? Math.floor(D.now/1440)*1440 + safe(() => S.hour, 0)*60 : D.now;
  const onDuty = o => o.st !== 'OFF SHIFT' && o.st !== 'STOOD DOWN' && o.st !== 'GOING HOME';
  const onMap = o => o.st !== 'OFF SHIFT' && o.st !== 'STOOD DOWN';
  const DMODE = m => m === 'REST' ? 'DOCKED' : m === 'CHASE' ? 'PURSUIT' : m === 'FLY' ? 'SWEEP' : m === 'HOME' ? 'RTB' : m;
  const BMODE = m => m === 'park' ? 'PARKED' : m === 'rush' ? 'RESPONDING' : m === 'home' ? 'RTB' : 'PATROL';
  // the panels' insides, made again from the latest reading (a second apart; the slow ones every five)
  function put(q, html){ const el = root && root.querySelector('[data-q="' + q + '"]'); if (!el || el._h === html) return; el._h = html; const st = el.scrollTop; el.innerHTML = html; el.scrollTop = st; }
  function refreshDom(slow){
    const d = D, beat = d.ofc.filter(o => o.st === 'ON BEAT' || o.st === 'RESPONDING' || o.st === 'EN ROUTE').length, nDuty = d.ofc.filter(onDuty).length;
    const air = d.dr.list.filter(x => x.mode !== 'REST').length, openCalls = d.calls.filter(c => c.st === 'open').length;
    const isSel = (t, id) => SEL && SEL.type === t && (SEL.id === id || (SEL.c && SEL.c.id === id)) ? ' sel' : '';
    put('top', `<div><small>PRECINCT</small><b>OPERATIONS DESK</b></div><div><small>STATIONS ${d.stn.length}</small><b>${d.stn.map(s => 'STN-' + p2(s.n)).join(' · ') || 'NONE'}</b></div>
        <div><small>DAY ${d.day} · CITY TIME · ${paused() ? '<span class="amb">‖ STORY PAUSED</span>' : '<span class="live">● LIVE</span>'}</small><span class="clk">${hm(shownNow())}</span></div>
        <div><small>CALLS · LAST 72 H</small><span class="bigv">${d.recent.length}<small class="dim">${d.recent.length && d.hot.length ? 'PEAK ' + d.hot[0][0] : ''}</small></span></div>
        <div><small>UNITS ON DUTY · OUT</small><b>${nDuty} · ${beat}</b></div><div><small>CALLS TODAY · OPEN</small><b>${d.today.length} · <span class="${openCalls ? 'warn' : ''}">${openCalls}</span></b></div>
        <div><small>ARRESTS TODAY · TOTAL</small><b>${d.arrToday} · ${R.arrests}</b></div><div><small>DRONES UP · POINTS SCANNED</small><b>${air}/${d.dr.list.length} · ${d.dr.scans}</b></div>
        <div><small>LIDAR COVER</small><b>${Math.round(d.lidar*100)}%</b></div><div class="sp"></div><button class="close" type="button">CLOSE · ESC</button>`);
    put('callsH', `<b>B · CALL LOG</b><span>LAST ${Math.min(60, d.calls.length)} OF ${d.calls.length}</span><span class="r">LAST P1-P2: ${d.last ? esc(d.last.kind) + ' · ' + d.last.sec + ' · ' + tc(d.last.c) : 'NONE'}</span>`);
    put('calls', d.calls.length ? `<table><colgroup><col style="width:46px"><col style="width:76px"><col style="width:26px"><col><col style="width:30px"><col style="width:46px"><col style="width:72px"><col style="width:70px"></colgroup>
      <tr><th>ID</th><th>TIME</th><th>PRI</th><th>TYPE</th><th>SEC</th><th>UNIT</th><th>RESPONSE</th><th>STATUS</th></tr>${d.calls.slice(0, 60).map(c => `<tr class="click${isSel('call', c.id)}" data-call="${c.id}"><td>${String(c.id).padStart(5, '0')}</td><td>${tc(c.c)}</td><td class="pri${c.pri}">P${c.pri}</td><td>${esc(c.kind)}${c.file ? ' <span class="amb">' + c.file + '</span>' : ''}</td><td>${c.sec}</td><td>${c.unit ? badge(c.unit) : '<span class="dim">----</span>'}</td><td>${c.st === 'open' ? `<span class="mb o" style="width:${Math.min(40, 4 + (d.now - c.c)/90*40).toFixed(0)}px"></span>` : c.done ? `<span class="mb" style="width:${Math.min(40, 2 + (c.done - c.c)/90*40).toFixed(0)}px"></span> <span class="dim">${Math.round(c.done - c.c)}m</span>` : ''}</td><td class="st-${c.st}">${c.st === 'open' ? 'OPEN' : c.st}</td></tr>`).join('')}</table>`
      : `<div class="empty">No calls on record yet.${d.stn.length ? '' : ' A police station has to stand in the city.'}</div>`);
    put('ofcH', `<b>C · UNITS</b><span>${d.ofc.length} SWORN</span><span class="r">CLICK TO PICK OUT ON THE PLAN</span>`);
    put('ofc', `<table><colgroup><col style="width:46px"><col style="width:60px"><col style="width:46px"><col><col style="width:28px"><col style="width:26px"></colgroup><tr><th>BADGE</th><th>CALLSIGN</th><th>SHIFT</th><th>STATUS</th><th>SEC</th><th>SIG</th></tr>${d.ofc.map(o => `<tr class="click${isSel('cop', o.id)}" data-cop="${esc(o.id)}"><td class="hi">${o.b}</td><td>${o.unit}</td><td>${o.shift}</td><td class="${o.st === 'RESPONDING' ? 'red' : o.st === 'ON BEAT' ? 'hi' : !onDuty(o) ? 'dim' : ''}">${o.st}</td><td>${o.sec}</td><td><span class="sig ${o.st === 'RESPONDING' ? 'r' : ''}">${[3, 5, 7, 9].map((h, q) => `<i class="${q < SIGL[o.st] ? 'on' : ''}" style="height:${h}px"></i>`).join('')}</span></td></tr>`).join('')}</table>`);
    put('drH', `<b>D · DRONE OPS</b><span>COVER ${Math.round(d.dr.cov*100)}%</span><span class="r">${d.dr.pts.length} PTS / 10 MIN</span>`);
    put('dr', `<table><colgroup><col style="width:44px"><col style="width:52px"><col><col style="width:26px"><col style="width:28px"></colgroup><tr><th>ID</th><th>BASE</th><th>MODE</th><th>WPT</th><th>SEC</th></tr>${d.dr.list.map(x => `<tr class="click${isSel('drone', x.id)}" data-drone="${x.id}"><td class="hi">${x.id}</td><td>STN-${p2(x.stn + 1)}</td><td class="${x.mode === 'CHASE' ? 'red' : x.mode === 'REST' ? 'dim' : ''}">${DMODE(x.mode)}</td><td>${x.way.length}</td><td>${x.sec}</td></tr>`).join('')}</table>
      <div class="kv" style="margin-top:4px">${d.stn.map(s => `<span>STN-${p2(s.n)} · ${s.sec}</span><span>${s.staff} STAFF · ${s.out} OUT · ${s.drones} DRN</span>`).join('')}</div>`);
    const run = $('.tick .run'), tt = d.calls.slice(0, 14).map(c => `${hm(c.c)} ${c.sec} ${c.kind}${c.unit ? ' · ' + badge(c.unit) : ''} · ${c.st === 'open' ? 'OPEN' : c.st}`).join('   //   ') || 'NO TRAFFIC';
    if (run && !run.textContent) run.textContent = tt; else if (run && slow) run._next = tt;
    if (!slow) return;
    put('actH', `<b>E · ACTIVITY</b><span>CALLS VS TIME · 72 H</span><span class="r">${d.recent.length} CALLS · ${d.recent.filter(c => c.st === 'ARREST').length} ARRESTS · ${d.hot.length ? 'HOTTEST ' + d.hot[0][0] : ''}</span>`);
    put('cfH', `<b>F · CASE FILES</b><span>${d.cs.open ? 'CASE DAY ' + d.cs.day + ' / 21' : 'NONE ACTIVE'}</span><span class="r">${d.cs.heat !== null && d.cs.heat !== undefined ? 'PRESSURE ' + Math.round(d.cs.heat*100) + '%' : ''}</span>`);
    put('cf', d.cs.out.map(f => `<div class="cf"><div class="l1"><b>${f.file}</b><span class="${f.major ? 'amb' : 'dim'}">${f.major ? 'MAJOR' : 'LINKED'}</span><span class="dim">${f.major ? 'DAY ' + Math.min(21, f.done + 1) + '/21' : 'STAGE ' + Math.min(f.total, f.done + 1) + '/' + f.total}</span><span style="margin-left:auto">${f.closed ? '<span class="hi">CLOSED</span>' : 'OPEN'}</span></div>
        <div class="pg">${Array.from({ length: Math.min(40, f.total) }, (_, q) => `<i class="${q < Math.round(f.done/f.total*Math.min(40, f.total)) ? 'on' : ''}"></i>`).join('')}</div>
        <div class="dim">LAST ACTIVITY ${f.last ? tc(f.last.c) + ' · ' + esc(String(f.last.place || '').toUpperCase()) + ' · ' + sector(f.last.x, f.last.z) : 'NONE LOGGED'}</div>
        ${f.lead ? `<div class="ld">LEAD <em>${esc(f.lead.when)}</em> · ${esc(f.lead.where)}${f.lead.who ? ' · ' + esc(String(f.lead.desc).toUpperCase()) + `<button data-watch="${esc(f.lead.who)}">WATCH</button>` : ''}</div>` : ''}</div>`).join('')
      || '<div class="empty">No case files open. When a case opens, its file shows here: coded, with its stage, the last logged activity and the next lead.</div>');
    try { charts(); } catch (e){ console.warn('desk charts', e); }   // (a chart that can't draw never keeps the desk from opening, or from closing)
  }
  function dom(){
    const d = D;
    root = document.createElement('div'); root.id = 'prec'; root.className = 'in'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Precinct desk');
    root.innerHTML = `
      <div class="top" data-q="top"></div>
      <div class="pn map"><div class="h"><b>A · CITY PLAN</b><span>LIVE · UNITS · DRONES · BIKES · FOOT TRAFFIC · CALLS 72 H</span><span class="r">${B.ni} × ${B.nj} PLOTS · N ↑ · WHEEL ZOOM · DRAG PAN · CLICK ANYTHING</span></div><canvas></canvas><div class="tip"></div>
        <div class="mc"><button type="button" data-z="in" title="Zoom in (+)">+</button><button type="button" data-z="out" title="Zoom out (−)">−</button><button type="button" data-z="fit" title="The whole city (0)">FIT</button><span class="zr">1.0×</span></div>
        <div class="det" hidden><div class="dh"><h4></h4><button type="button" class="x" title="Close (Esc)">✕</button></div><div class="s"></div><div class="vl"></div><canvas class="viz"></canvas><div class="kv"></div><div class="row"></div></div>
        <div class="lg"><span><i style="background:var(--hi);border-radius:50%"></i>OFFICER</span><span><i style="background:var(--red);border-radius:50%"></i>RESPONDING</span><span><i style="border:1px solid var(--ink)"></i>DRONE · ROUTE</span><span><i style="background:var(--ink);clip-path:polygon(50% 0,100% 100%,0 100%)"></i>BIKE</span>
          <span><i style="background:var(--amb);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></i>CASE</span><span><i style="background:var(--ink);clip-path:polygon(0 40%,100% 40%,100% 60%,0 60%)"></i>CALL</span><span><i style="background:rgba(255,93,74,.4)"></i>HOTSPOT</span><span><i style="background:var(--dim);transform:scale(.35)"></i>FOOT TRAFFIC</span><span><i style="border:1px dashed var(--dim);border-radius:50%"></i>LIDAR</span></div></div>
      <div class="rt">
        <div class="pn"><div class="h" data-q="callsH"></div><div class="tw" data-q="calls"></div></div>
        <div class="pn"><div class="h" data-q="actH"></div>
          <div class="act"><div class="c1"><div class="lbl"><span>CALLS PER 3 H</span><span>— CALLS · ▲ ARREST · ◆ CASE</span></div><canvas class="ch" data-ch="line"></canvas>
            <div class="lbl"><span>BY HOUR OF DAY</span><span>NOW IN AMBER</span></div><canvas class="ch" data-ch="hist"></canvas></div>
            <div class="c2"><div class="lbl"><span>BY TYPE</span><span>72 H</span></div><canvas class="ch" data-ch="types"></canvas></div></div></div>
      </div>
      <div class="bt">
        <div class="pn"><div class="h" data-q="ofcH"></div><div class="tw" data-q="ofc"></div></div>
        <div class="pn"><div class="h" data-q="drH"></div><div class="dro"><div class="tw" data-q="dr"></div><canvas class="ch" data-ch="drones"></canvas></div></div>
      </div>
      <div class="tick"><span class="k">COMMS</span><span class="run"></span></div>`;
    const bt = root.querySelector('.bt');
    const hp = document.createElement('div'); hp.className = 'pn';
    const secs = secPick(d);
    hp.innerHTML = `<div class="h"><b>G · SECTOR SCANS</b><span>${secs.length} HOTTEST · 72 H</span><span class="r">CLICK TO OPEN ON THE PLAN</span></div>
      <div class="secs">${secs.map(q => `<div class="sc" data-sec="${q.name}"><div class="t"><b>${q.name}</b><span>${q.n} CALLS · ${q.units} UNIT${q.units === 1 ? '' : 'S'}</span></div><canvas></canvas><div class="f">${q.last ? esc(q.last.kind) + ' · ' + hm(q.last.c) : 'QUIET'}</div></div>`).join('') || '<div class="empty">NO SECTORS YET</div>'}</div>`;
    const cp = document.createElement('div'); cp.className = 'pn'; cp.innerHTML = `<div class="h" data-q="cfH"></div><div class="tw" data-q="cf"></div>`;
    bt.appendChild(hp); bt.appendChild(cp);
    document.body.appendChild(root);
    const run = $('.tick .run'); run.addEventListener('animationiteration', () => { if (run._next){ run.textContent = run._next; run._next = null; } });   // (the comms line takes new traffic between passes, not mid-sentence)
    root.addEventListener('click', e => {
      if (e.target.closest('.close')){ close(); return; }
      const z = e.target.closest('[data-z]'); if (z){ zoomBy(z.dataset.z); return; }
      if (e.target.closest('.det .x')){ select(null); return; }
      const fb = e.target.closest('[data-follow]'); if (fb){ follow(fb.dataset.follow); return; }
      const a = e.target.closest('[data-act]'); if (a){ act(a.dataset.act, a.dataset.arg); return; }
      const w = e.target.closest('[data-watch]'); if (w){ select({ type: 'person', id: w.dataset.watch }, true); scanOn(); return; }
      const sc = e.target.closest('.sc[data-sec]'); if (sc){ select({ type: 'sector', name: sc.dataset.sec }, true); return; }
      const r = e.target.closest('tr.click'); if (!r) return;
      if (r.dataset.cop) select({ type: 'cop', id: r.dataset.cop }, true);
      else if (r.dataset.call){ const c = R.calls.find(q => q.id === +r.dataset.call); if (c) select({ type: 'call', id: c.id, c }, true); }
      else if (r.dataset.drone) select({ type: 'drone', id: r.dataset.drone }, true);
    });
    refreshDom(true);
  }
  // the sectors worth a close look: the six with the most calls in 72 hours (or with the most plots, a quiet city)
  let SECS = [];
  function secBox(name){ const a = 'ABCDEFGH'.indexOf(name[0]), b = +name.slice(1) - 1; return { i0: B.i0 + Math.floor(a*B.ni/8), i1: B.i0 + Math.ceil((a + 1)*B.ni/8) - 1, j0: B.j0 + Math.floor(b*B.nj/6), j1: B.j0 + Math.ceil((b + 1)*B.nj/6) - 1 }; }
  function secPick(d){
    const m = new Map(); for (const c of d.recent){ const q = m.get(c.sec) || { n: 0, last: null, byH: new Array(24).fill(0) }; q.n++; if (!q.last || c.c > q.last.c) q.last = c; q.byH[Math.floor((c.c % 1440)/60)]++; m.set(c.sec, q); }
    if (m.size < 6) safe(() => { for (const c of cells.values()){ if (!c.sections.length) continue; const k = sector(c.x, c.z); if (!m.has(k)) m.set(k, { n: 0, last: null, byH: new Array(24).fill(0) }); if (m.size >= 6) break; } });
    SECS = [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([name, q]) => { const bx = secBox(name); return Object.assign({ name, units: d.ofc.filter(o => o.sec === name && o.st !== 'OFF SHIFT' && o.st !== 'STOOD DOWN' && o.st !== 'GOING HOME').length,
      cx: (bx.i0 + bx.i1)/2*LOT, cz: (bx.j0 + bx.j1)/2*LOT, bx }, q); });
    return SECS;
  }
  const GR = { ink: '#8fdc95', hi: '#d6ffd2', dim: 'rgba(143,220,149,.45)', faint: 'rgba(143,220,149,.14)', amb: '#ffb03a', red: '#ff5d4a' };
  function fitCanvas(c){ const r = c.getBoundingClientRect(), dp = Math.min(2, devicePixelRatio || 1); c.width = Math.max(4, r.width*dp); c.height = Math.max(4, r.height*dp); const x = c.getContext('2d'); x.font = (8.5*dp) + 'px JetBrains Mono, monospace'; return [x, c.width, c.height, dp]; }
  function axes(x, W, H, dp, L, Rr, T, Bm, ny){
    x.strokeStyle = GR.faint; x.lineWidth = dp; for (let k = 0; k <= ny; k++){ const y = T + (H - T - Bm)*k/ny; x.beginPath(); x.setLineDash([2*dp, 3*dp]); x.moveTo(L, y); x.lineTo(W - Rr, y); x.stroke(); } x.setLineDash([]);
    x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(L, T); x.lineTo(L, H - Bm); x.lineTo(W - Rr, H - Bm); x.stroke();
  }
  function charts(){
    const d = D;
    for (const c of root.querySelectorAll('canvas.ch')){
      const [x, W, H, dp] = fitCanvas(c), kind = c.dataset.ch;
      if (kind === 'line'){   // calls per 3 hours over 72 hours: a profile line with its area, arrests and case activity marked
        const n = 24, bins = new Array(n).fill(0), arr = new Array(n).fill(0), cas = new Array(n).fill(0), t0 = d.now - 72*60;
        for (const q of d.recent){ const k = Math.min(n - 1, Math.max(0, Math.floor((q.c - t0)/180))); bins[k]++; if (q.st === 'ARREST') arr[k]++; if (q.src === 'case') cas[k]++; }
        const mx = Math.max(2, ...bins), L = 22*dp, Rr = 6*dp, T = 6*dp, Bm = 12*dp, X = k => L + (W - L - Rr)*k/(n - 1), Y = v => H - Bm - (H - T - Bm)*v/mx;
        axes(x, W, H, dp, L, Rr, T, Bm, 4);
        x.fillStyle = GR.dim; x.textAlign = 'right'; x.fillText(String(mx), L - 4*dp, T + 6*dp); x.fillText('0', L - 4*dp, H - Bm);
        x.textAlign = 'center'; for (const [k, lb] of [[0, '-72H'], [8, '-48H'], [16, '-24H'], [23, 'NOW']]) x.fillText(lb, X(k), H - 2*dp);
        const gr = x.createLinearGradient(0, T, 0, H - Bm); gr.addColorStop(0, 'rgba(143,220,149,.28)'); gr.addColorStop(1, 'rgba(143,220,149,.02)');
        x.beginPath(); bins.forEach((v, k) => k ? x.lineTo(X(k), Y(v)) : x.moveTo(X(k), Y(v))); x.lineTo(X(n - 1), H - Bm); x.lineTo(X(0), H - Bm); x.closePath(); x.fillStyle = gr; x.fill();
        x.beginPath(); bins.forEach((v, k) => k ? x.lineTo(X(k), Y(v)) : x.moveTo(X(k), Y(v))); x.strokeStyle = GR.hi; x.lineWidth = 1.4*dp; x.stroke();
        bins.forEach((v, k) => { x.fillStyle = GR.ink; x.fillRect(X(k) - 1.5*dp, Y(v) - 1.5*dp, 3*dp, 3*dp);
          if (arr[k]){ x.fillStyle = GR.hi; x.beginPath(); x.moveTo(X(k), Y(v) - 9*dp); x.lineTo(X(k) + 3.5*dp, Y(v) - 4*dp); x.lineTo(X(k) - 3.5*dp, Y(v) - 4*dp); x.fill(); }
          if (cas[k]){ x.fillStyle = GR.amb; x.beginPath(); x.moveTo(X(k), H - Bm - 7*dp); x.lineTo(X(k) + 3*dp, H - Bm - 4*dp); x.lineTo(X(k), H - Bm - 1*dp); x.lineTo(X(k) - 3*dp, H - Bm - 4*dp); x.fill(); } });
        x.strokeStyle = GR.amb; x.setLineDash([3*dp, 3*dp]); x.beginPath(); x.moveTo(X(n - 1), T); x.lineTo(X(n - 1), H - Bm); x.stroke(); x.setLineDash([]);
      } else if (kind === 'hist'){   // by hour of the day
        const L = 4*dp, Bm = 11*dp, mx = Math.max(1, ...d.byHour), bw = (W - 2*L)/24, hn = Math.floor(d.hour);
        d.byHour.forEach((v, h) => { const bh = (H - Bm - 3*dp)*v/mx; x.fillStyle = h === hn ? GR.amb : v ? GR.ink : GR.faint; x.fillRect(L + h*bw + dp, H - Bm - Math.max(dp, bh), bw - 2*dp, Math.max(dp, bh)); });
        x.fillStyle = GR.dim; x.textAlign = 'left'; for (const h of [0, 6, 12, 18]) x.fillText(p2(h), L + h*bw, H - 1*dp); x.textAlign = 'right'; x.fillText('23', W - L, H - 1*dp);
        x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(L, H - Bm); x.lineTo(W - L, H - Bm); x.stroke();
      } else if (kind === 'types'){   // calls by type: horizontal bars, arrests inside
        const m = new Map(); for (const q of d.recent){ const k = q.kind.split(' · ')[0]; const e = m.get(k) || [0, 0]; e[0]++; if (q.st === 'ARREST') e[1]++; m.set(k, e); }
        const rows = [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8), mx = Math.max(1, ...rows.map(r => r[1][0])), rh = Math.min(16*dp, H/Math.max(4, rows.length)), L = W*.52;
        rows.forEach(([k, [n, a]], q) => { const y = q*rh + 2*dp, bw = (W - L - 22*dp)*n/mx;
          x.fillStyle = GR.dim; x.textAlign = 'left'; x.fillText(k.slice(0, 18), 0, y + rh*.62);
          x.fillStyle = GR.faint; x.fillRect(L, y + rh*.28, W - L - 22*dp, rh*.42); x.fillStyle = GR.ink; x.fillRect(L, y + rh*.28, bw, rh*.42);
          if (a){ x.fillStyle = GR.hi; x.fillRect(L, y + rh*.28, (W - L - 22*dp)*a/mx, rh*.42); }
          x.fillStyle = GR.hi; x.textAlign = 'right'; x.fillText(String(n), W, y + rh*.62); });
        if (!rows.length){ x.fillStyle = GR.dim; x.fillText('NO CALLS', 0, 12*dp); }
      } else if (kind === 'drones'){   // waypoints left per drone as bars, and the patrol coverage as a ring gauge
        const list = d.dr.list, L = 18*dp, Bm = 12*dp, T = 6*dp, gw = Math.min(H*.9, W*.32), cw = W - gw - 8*dp, mx = Math.max(5, ...list.map(q => q.way.length));
        axes(x, cw, H, dp, L, 4*dp, T, Bm, 3);
        const bw = (cw - L - 6*dp)/Math.max(1, list.length);
        list.forEach((q, k) => { const bh = (H - T - Bm)*q.way.length/mx, X0 = L + k*bw + bw*.2; x.fillStyle = q.mode === 'CHASE' ? GR.red : q.way.length ? GR.ink : GR.faint; x.fillRect(X0, H - Bm - Math.max(dp, bh), bw*.6, Math.max(dp, bh));
          x.fillStyle = GR.dim; x.textAlign = 'center'; x.fillText(q.id.slice(-2), X0 + bw*.3, H - 2*dp); });
        x.textAlign = 'right'; x.fillStyle = GR.dim; x.fillText(String(mx), L - 3*dp, T + 6*dp); x.save(); x.translate(6*dp, H/2); x.rotate(-Math.PI/2); x.textAlign = 'center'; x.fillText('WPT', 0, 0); x.restore();
        const cx = W - gw/2, cy = H/2, r = Math.max(1, gw/2 - 6*dp), f = d.dr.cov;   // (at least a pixel: a short chart on a phone gave a negative radius, which threw and left the desk stuck open)
        x.strokeStyle = GR.faint; x.lineWidth = 5*dp; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
        x.strokeStyle = GR.hi; x.beginPath(); x.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + f*Math.PI*2); x.stroke(); x.lineWidth = dp;
        for (let k = 0; k < 24; k++){ const a = k/24*Math.PI*2; x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(cx + Math.cos(a)*(r + 5*dp), cy + Math.sin(a)*(r + 5*dp)); x.lineTo(cx + Math.cos(a)*(r + (k % 6 ? 7 : 10)*dp), cy + Math.sin(a)*(r + (k % 6 ? 7 : 10)*dp)); x.stroke(); }
        x.fillStyle = GR.hi; x.textAlign = 'center'; x.font = (13*dp) + 'px JetBrains Mono, monospace'; x.fillText(Math.round(f*100) + '%', cx, cy + 3*dp); x.font = (7.5*dp) + 'px JetBrains Mono, monospace'; x.fillStyle = GR.dim; x.fillText('COVER 5 MIN', cx, cy + 14*dp);
      }
    }
    for (const el of root.querySelectorAll('.sc canvas')){ const q = SECS.find(s2 => s2.name === el.parentNode.dataset.sec); if (q) el._sec = q; }
  }
  // a sector card: its plots seen from above inside a scan ring, its calls and units, the scan sweeping round; a bar of its calls by hour under it
  function drawSec(el, t){
    const q = el._sec; if (!q) return; if (!el._fit){ el._fit = fitCanvas(el); } const [x, W, H, dp] = el._fit; x.clearRect(0, 0, W, H);
    const bx = q.bx, ni = bx.i1 - bx.i0 + 1, nj = bx.j1 - bx.j0 + 1, hb = 10*dp, s = Math.min((W - 8*dp)/(ni*LOT), (H - hb - 8*dp)/(nj*LOT)), ox = W/2 - (bx.i0 + bx.i1)/2*LOT*s, oz = (H - hb)/2 - (bx.j0 + bx.j1)/2*LOT*s, P = (a, b) => [ox + a*s, oz + b*s];
    const cx = W/2, cy = (H - hb)/2, rr = Math.max(1, Math.min(W, H - hb)/2 - 3*dp);
    x.strokeStyle = GR.faint; x.lineWidth = dp; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, rr*.5, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(cx - rr, cy); x.lineTo(cx + rr, cy); x.moveTo(cx, cy - rr); x.lineTo(cx, cy + rr); x.stroke();
    safe(() => { for (let i = bx.i0; i <= bx.i1; i++) for (let j = bx.j0; j <= bx.j1; j++){ const c = cells.get(ckey(i, j)); if (!c) continue; const [a, b] = P(c.x - LOT/2 + .3, c.z - LOT/2 + .3), w = (LOT - .6)*s, lv = c.mega ? 3 : c.sections.length;
      x.fillStyle = `rgba(143,220,149,${(.06 + .08*Math.min(4, lv)).toFixed(2)})`; x.fillRect(a, b, w, w); if (lv){ x.strokeStyle = 'rgba(143,220,149,.4)'; x.strokeRect(a + .5, b + .5, w - 1, w - 1); } } });
    // the sweep
    const ang = (t*1.3 + q.name.charCodeAt(0)) % (Math.PI*2), gr = x.createConicGradient ? x.createConicGradient(ang - .9, cx, cy) : null;
    if (gr){ gr.addColorStop(0, 'rgba(143,220,149,0)'); gr.addColorStop(.14, 'rgba(143,220,149,.22)'); gr.addColorStop(.145, 'rgba(143,220,149,0)'); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); }
    x.strokeStyle = GR.ink; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(ang)*rr, cy + Math.sin(ang)*rr); x.stroke();
    for (const c of D.recent){ if (c.sec !== q.name) continue; const [a, b] = P(c.x, c.z); x.strokeStyle = c.st === 'open' ? GR.red : c.src === 'case' ? GR.amb : GR.hi; x.lineWidth = 1.2*dp; x.beginPath(); x.moveTo(a - 3*dp, b - 3*dp); x.lineTo(a + 3*dp, b + 3*dp); x.moveTo(a + 3*dp, b - 3*dp); x.lineTo(a - 3*dp, b + 3*dp); x.stroke(); }
    for (const o of D.ofc){ if (o.sec !== q.name || !isFinite(o.x) || o.st === 'OFF SHIFT' || o.st === 'STOOD DOWN') continue; const [a, b] = P(o.x, o.z); x.fillStyle = o.st === 'RESPONDING' ? GR.red : GR.hi; x.beginPath(); x.arc(a, b, 2*dp, 0, 7); x.fill(); }
    const mx = Math.max(1, ...q.byH), bw = W/24; q.byH.forEach((v, h) => { const bh = (hb - 3*dp)*v/mx; x.fillStyle = v ? GR.ink : GR.faint; x.fillRect(h*bw + .5*dp, H - Math.max(dp, bh), bw - dp, Math.max(dp, bh)); });
  }
  /* ---------- the plan: live, zoomable, everything on it clickable ---------- */
  // Two layers. The still one (grid, plots and buildings, stations, highways, ranges, the 72 hours of calls and their heat) is drawn into a
  // canvas a little bigger than the view and only made again when the zoom changes, the view slides past its margin or the record changes;
  // dragging just slides it. The moving one (people on foot, officers, drones, bikes, their routes and tracks, the picked thing) is drawn
  // over it fresh every frame from where they are now: thirty times a second, with the city itself not being drawn at all.
  const live = { cop: id => { const p = safe(() => people.get(id), null); if (!p) return null; const pl = !p.walk && safe(() => places.get(p.at), null); return pl ? [pl.x, pl.z] : isFinite(p.x) ? [p.x, p.z] : null; } };
  const droneOf = id => D && D.dr.list.find(q => q.id === id), bikeOf = id => D && D.bikes.find(q => q.id === id);
  function posOf(s){
    if (!s) return null;
    switch (s.type){
      case 'cop': case 'person': return live.cop(s.id);
      case 'drone': { const d = droneOf(s.id); return d ? [d.ref.pos.x, d.ref.pos.z] : null; }
      case 'bike': { const b = bikeOf(s.id); return b ? [b.ref.x, b.ref.z] : null; }
      case 'call': return [s.c.x, s.c.z];
      case 'stn': case 'lidar': case 'mega': return [s.m.x, s.m.z];
      case 'plot': return [s.x, s.z];
      case 'sector': { const bx = secBox(s.name); return [(bx.i0 + bx.i1)/2*LOT, (bx.j0 + bx.j1)/2*LOT]; }
    }
    return null;
  }
  function sectorQ(name){
    const bx = secBox(name), q = { name, n: 0, last: null, byH: new Array(24).fill(0), bx, cx: (bx.i0 + bx.i1)/2*LOT, cz: (bx.j0 + bx.j1)/2*LOT, units: 0 };
    for (const c of D.recent) if (c.sec === name){ q.n++; if (!q.last || c.c > q.last.c) q.last = c; q.byH[Math.floor((c.c % 1440)/60)]++; }
    q.units = D.ofc.filter(o => o.sec === name && onDuty(o)).length; return q;
  }
  function setup(){
    cv = $('.map canvas'); const r = cv.getBoundingClientRect(), dp = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(10, r.width*dp); cv.height = Math.max(10, r.height*dp); g = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 26*dp, s0 = Math.min((W - 2*pad)/(B.ni*LOT), (H - 2*pad)/(B.nj*LOT));
    F = { dp, W, H, s0, M: Math.round(Math.max(W, H)*.3) }; xf(); base = null; charts(); for (const el of root.querySelectorAll('.sc canvas')) el._fit = null; const vz = $('.viz'); if (vz) vz._fit = null;
    if (cv._on) return; cv._on = true;
    const at = e => { const rr = cv.getBoundingClientRect(); return [(e.clientX - rr.left)*F.dp, (e.clientY - rr.top)*F.dp, e.clientX - rr.left, e.clientY - rr.top]; };
    cv.addEventListener('mousemove', e => {
      const [px, py, lx, ly] = at(e), tip = $('.tip');
      if (VT.drag){ const dx = px - VT.drag.x, dy = py - VT.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4*F.dp) VT.moved = true;
        if (VT.moved && !VIEW){ VT.cx = VT.drag.cx - dx/F.s; VT.cz = VT.drag.cz - dy/F.s; VT.track = false; clampVT(); xf(); } }
      if (VIEW || VT.moved){ hov = null; tip.style.display = 'none'; cv.style.cursor = VT.moved ? 'grabbing' : 'crosshair'; return; }
      hov = pickMap(px, py); cv.style.cursor = hov ? 'pointer' : 'crosshair';
      if (hov){ tip.style.display = 'block'; tip.style.left = (lx + 12) + 'px'; tip.style.top = (ly + 26) + 'px'; tip.textContent = hov.label; } else tip.style.display = 'none'; });
    cv.addEventListener('mouseleave', () => { hov = null; $('.tip').style.display = 'none'; });
    cv.addEventListener('mousedown', e => { if (e.button !== 0) return; const [px, py] = at(e); VT.drag = { x: px, y: py, cx: VT.cx, cz: VT.cz }; VT.moved = false; });
    addEventListener('mouseup', upH);
    cv.addEventListener('click', () => { if (VT.moved){ VT.moved = false; return; } if (VIEW || !hov) return; select(hov.s, false); });
    cv.addEventListener('dblclick', e => { if (VIEW) return; const [px, py] = at(e); zoomAt(px, py, 2); });
    cv.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-Math.max(-120, Math.min(120, e.deltaY))*.0022);
      if (VIEW){ VIEW.half = Math.max(2.5, Math.min(60, VIEW.half/f)); SNAP && (SNAP.due = 0); return; }
      const [px, py] = at(e); zoomAt(px, py, f); }, { passive: false });
  }
  const upH = () => { if (VT.drag){ VT.drag = null; if (cv) cv.style.cursor = 'crosshair'; } };
  function xf(){ const s = F.s0*VT.k; F.s = s; F.P = (x, z) => [F.W/2 + (x - VT.cx)*s, F.H/2 + (z - VT.cz)*s]; F.inv = (px, py) => [VT.cx + (px - F.W/2)/s, VT.cz + (py - F.H/2)/s]; const zr = root && $('.zr'); if (zr) zr.textContent = VT.k.toFixed(1) + '×'; }
  function clampVT(){ const x0 = (B.i0 - 1)*LOT, x1 = (B.i1 + 1)*LOT, z0 = (B.j0 - 1)*LOT, z1 = (B.j1 + 1)*LOT; VT.cx = Math.max(x0, Math.min(x1, VT.cx)); VT.cz = Math.max(z0, Math.min(z1, VT.cz)); }
  function fit(){ VT.k = 1; VT.cx = (B.i0 + B.i1)/2*LOT; VT.cz = (B.j0 + B.j1)/2*LOT; VT.track = false; }
  function zoomAt(px, py, f){ const [wx, wz] = F.inv(px, py), k = Math.max(1, Math.min(18, VT.k*f)); VT.k = k; const s = F.s0*k; VT.cx = wx - (px - F.W/2)/s; VT.cz = wz - (py - F.H/2)/s; if (k === 1) fit(); clampVT(); xf(); }
  function zoomBy(z){
    if (z === 'fit'){ if (VIEW){ VIEW.half = VIEW.half0; SNAP && (SNAP.due = 0); return; } fit(); xf(); return; }
    const f = z === 'in' ? 1.6 : 1/1.6;
    if (VIEW){ VIEW.half = Math.max(2.5, Math.min(60, VIEW.half/f)); SNAP && (SNAP.due = 0); return; }
    const p = VT.track && posOf(SEL); if (p) { VT.k = Math.max(1, Math.min(18, VT.k*f)); xf(); } else zoomAt(F.W/2, F.H/2, f);
  }
  // the still layer
  function drawBase(){
    const dp = F.dp, s = F.s, M = F.M, BW = F.W + 2*M, BH = F.H + 2*M;
    if (!base || base.width !== BW || base.height !== BH){ base = document.createElement('canvas'); base.width = BW; base.height = BH; }
    const b = base.getContext('2d'), cx0 = VT.cx, cz0 = VT.cz, P = (x, z) => [BW/2 + (x - cx0)*s, BH/2 + (z - cz0)*s];
    baseAt = { cx: cx0, cz: cz0, k: VT.k, gen: D.sig, W: F.W, H: F.H };
    const vis = (x, y, r) => x > -r && y > -r && x < BW + r && y < BH + r;
    b.fillStyle = '#030805'; b.fillRect(0, 0, BW, BH);
    const pl = LOT*s;
    // the grid: a fine one every plot (once the plots are big enough to want one), a heavier one per sector
    if (pl > 7*dp){ b.strokeStyle = 'rgba(143,220,149,.06)'; b.lineWidth = dp; b.beginPath();
      for (let i = B.i0; i <= B.i1 + 1; i++){ const [x] = P((i - .5)*LOT, 0); if (x >= 0 && x <= BW){ b.moveTo(x, 0); b.lineTo(x, BH); } }
      for (let j = B.j0; j <= B.j1 + 1; j++){ const [, y] = P(0, (j - .5)*LOT); if (y >= 0 && y <= BH){ b.moveTo(0, y); b.lineTo(BW, y); } } b.stroke(); }
    b.strokeStyle = 'rgba(143,220,149,.18)'; b.setLineDash([2*dp, 4*dp]); b.beginPath();
    for (let k = 0; k <= 8; k++){ const [x] = P((B.i0 - .5 + k*B.ni/8)*LOT, 0); b.moveTo(x, 0); b.lineTo(x, BH); }
    for (let k = 0; k <= 6; k++){ const [, y] = P(0, (B.j0 - .5 + k*B.nj/6)*LOT); b.moveTo(0, y); b.lineTo(BW, y); } b.stroke(); b.setLineDash([]);
    // the hotspots: the last 72 hours' calls as a soft red heat
    for (const c of D.recent){ const [x, y] = P(c.x, c.z), r = (c.pri <= 2 ? 34 : 24)*dp*Math.max(.6, Math.min(3, s/4)); if (!vis(x, y, r)) continue; const gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,93,74,.16)'); gr.addColorStop(1, 'rgba(255,93,74,0)'); b.fillStyle = gr; b.fillRect(x - r, y - r, 2*r, 2*r); }
    // plots and buildings: a plot's brightness is how built up it is; zoomed in, its floors show as nested outlines (a simple stand-in for height)
    const nest = pl > 26*dp;
    safe(() => { for (const c of cells.values()){ if (c.mega) continue; const [x, y] = P(c.x - LOT/2 + .2, c.z - LOT/2 + .2), w = (LOT - .4)*s; if (!vis(x, y, w)) continue; const lv = c.sections.length;
      b.fillStyle = lv ? `rgba(143,220,149,${.05 + .05*Math.min(4, lv)})` : c.wall ? 'rgba(143,220,149,.25)' : 'rgba(143,220,149,.025)'; b.fillRect(x, y, w, w);
      if (lv){ b.strokeStyle = 'rgba(143,220,149,.24)'; b.lineWidth = dp; b.strokeRect(x + .5, y + .5, w - 1, w - 1);
        if (nest){ const st = Math.min(5*dp, w/(2*Math.min(6, lv) + 2)); b.strokeStyle = 'rgba(143,220,149,.16)'; for (let q = 1; q < Math.min(6, lv + 1); q++) b.strokeRect(x + q*st, y + q*st, w - 2*q*st, w - 2*q*st);
          b.fillStyle = 'rgba(143,220,149,.5)'; b.font = (7.5*dp) + 'px JetBrains Mono, monospace'; b.fillText((ZN[c.sections[0].zone] || '').slice(0, 3) + ' ' + lv, x + 3*dp, y + w - 3*dp); } }
      else if (c.wall && nest){ b.fillStyle = 'rgba(143,220,149,.5)'; b.font = (7.5*dp) + 'px JetBrains Mono, monospace'; b.fillText(c.wall.gate ? 'GATE' : 'WALL', x + 3*dp, y + w - 3*dp); } } });
    safe(() => { for (const m of megas.values()){ const [x, y] = P(m.x - m.w*LOT/2 + .15, m.z - m.h*LOT/2 + .15), w = (m.w*LOT - .3)*s, h = (m.h*LOT - .3)*s, pol = m.kind === 'police'; if (!vis(x, y, Math.max(w, h))) continue;
      b.fillStyle = pol ? 'rgba(214,255,210,.18)' : 'rgba(143,220,149,.08)'; b.fillRect(x, y, w, h); b.strokeStyle = pol ? '#d6ffd2' : 'rgba(143,220,149,.45)'; b.lineWidth = (pol ? 1.6 : 1)*dp; b.strokeRect(x, y, w, h);
      if (pol){ const k = D.stn.findIndex(q => q.m === m); b.fillStyle = '#d6ffd2'; b.font = '600 ' + (10*dp) + 'px JetBrains Mono, monospace'; b.fillText('STN-' + p2(k + 1), x + 4*dp, y + 12*dp); }
      else if (nest || w > 60*dp){ b.fillStyle = 'rgba(143,220,149,.55)'; b.font = (8*dp) + 'px JetBrains Mono, monospace'; b.fillText(String(m.kind).toUpperCase(), x + 4*dp, y + 11*dp); } } });
    // each station's range rings
    b.setLineDash([2*dp, 4*dp]); b.lineWidth = dp; b.font = (8*dp) + 'px JetBrains Mono, monospace';
    for (const st of D.stn){ const [x, y] = P(st.m.x, st.m.z); for (const n of [5, 10, 15]){ b.strokeStyle = 'rgba(143,220,149,.16)'; b.beginPath(); b.arc(x, y, n*LOT*s, 0, 7); b.stroke(); b.fillStyle = 'rgba(143,220,149,.4)'; b.fillText(n + ' PL', x + n*LOT*s*.71 + 3*dp, y - n*LOT*s*.71); } }
    b.setLineDash([]);
    // the sky highways, faint; the LIDAR range
    safe(() => { b.strokeStyle = 'rgba(143,220,149,.18)'; b.lineWidth = 2*dp; for (const h of highways){ b.beginPath(); h.tiles.forEach((t, k) => { const [x, y] = P(t.i*LOT, t.j*LOT); k ? b.lineTo(x, y) : b.moveTo(x, y); }); b.stroke(); } });
    safe(() => { b.strokeStyle = 'rgba(143,220,149,.3)'; b.setLineDash([4*dp, 5*dp]); b.lineWidth = dp; for (const m of megasOfKind('lidar')){ const [x, y] = P(m.x, m.z); b.beginPath(); b.arc(x, y, LIDAR_R*s, 0, 7); b.stroke(); } b.setLineDash([]); });
    // the drones' scans of the last ten minutes: dots fading with age
    for (const [x0, z0, a] of D.dr.pts){ const [x, y] = P(x0, z0); b.fillStyle = `rgba(143,220,149,${(.7*(1 - a)).toFixed(2)})`; b.fillRect(x - 1.5*dp, y - 1.5*dp, 3*dp, 3*dp); }
    // calls: case activity as amber diamonds, the rest as crosses (open ones red)
    for (const c of D.recent){ const [x, y] = P(c.x, c.z); if (!vis(x, y, 8*dp)) continue;
      if (c.src === 'case'){ b.fillStyle = '#ffb03a'; b.beginPath(); b.moveTo(x, y - 5*dp); b.lineTo(x + 5*dp, y); b.lineTo(x, y + 5*dp); b.lineTo(x - 5*dp, y); b.closePath(); b.fill(); }
      else { b.strokeStyle = c.st === 'open' ? '#ff5d4a' : c.pri <= 2 ? 'rgba(255,176,58,.8)' : 'rgba(143,220,149,.7)'; b.lineWidth = 1.3*dp; b.beginPath(); b.moveTo(x - 4*dp, y - 4*dp); b.lineTo(x + 4*dp, y + 4*dp); b.moveTo(x + 4*dp, y - 4*dp); b.lineTo(x - 4*dp, y + 4*dp); b.stroke(); }
      if (nest){ b.fillStyle = 'rgba(214,255,210,.7)'; b.font = (7.5*dp) + 'px JetBrains Mono, monospace'; b.fillText(c.kind.split(' · ')[0].slice(0, 16), x + 7*dp, y + 3*dp); } }
  }
  // what's under the pointer: the moving things first (where they are now), then calls, stations and arrays, then the plot itself
  function pickMap(px, py){
    if (!F || !D) return null; const P = F.P, r = 10*F.dp; let best = null, bd = r*r;
    const tryIt = (x0, z0, o) => { const [x, y] = P(x0, z0), d = (x - px)**2 + (y - py)**2; if (d < bd){ bd = d; best = o; } };
    for (const d of D.dr.list) tryIt(d.ref.pos.x, d.ref.pos.z, { s: { type: 'drone', id: d.id }, label: d.id + ' · ' + DMODE(d.mode) + ' · ' + d.way.length + ' WAYPOINTS · CLICK FOR TELEMETRY' });
    for (const b of D.bikes) if (b.ref.mode !== 'park') tryIt(b.ref.x, b.ref.z, { s: { type: 'bike', id: b.id }, label: 'BIKE ' + b.id + ' · ' + BMODE(b.ref.mode) + ' · CLICK FOR ITS RUN' });
    for (const o of D.ofc){ if (!onMap(o)) continue; const p = live.cop(o.id); if (p) tryIt(p[0], p[1], { s: { type: 'cop', id: o.id }, label: o.b + ' · ' + o.unit + ' · ' + o.st + ' · CLICK TO TRACK' }); }
    if (best) return best; bd = r*r;
    for (const c of D.recent) tryIt(c.x, c.z, { s: { type: 'call', id: c.id, c }, label: String(c.id).padStart(5, '0') + ' · ' + c.kind + (c.file ? ' ' + c.file : '') + ' · ' + tc(c.c) + ' · ' + (c.st === 'open' ? 'OPEN' : c.st) + ' · CLICK FOR THE INCIDENT' });
    if (best) return best;
    const [wx, wz] = F.inv(px, py);
    for (const m of safe(() => [...megas.values()], [])) if (Math.abs(wx - m.x) < m.w*LOT/2 && Math.abs(wz - m.z) < m.h*LOT/2){
      if (m.kind === 'police'){ const st = D.stn.find(q => q.m === m); return { s: { type: 'stn', m }, label: 'STN-' + p2(st ? st.n : 0) + ' · ' + (st ? st.staff : 0) + ' STAFF · CLICK FOR THE STATION BOARD' }; }
      if (m.kind === 'lidar') return { s: { type: 'lidar', m }, label: 'LIDAR ARRAY · CLICK FOR ITS COVER' };
      return { s: { type: 'mega', m }, label: String(m.kind).toUpperCase() + ' · ' + sector(m.x, m.z) + ' · CLICK FOR DETAILS' }; }
    const c = safe(() => cells.get(ckey(Math.round(wx/LOT), Math.round(wz/LOT))), null);
    if (c) return { s: { type: 'plot', x: c.x, z: c.z, i: c.i, j: c.j }, label: 'PLOT ' + c.i + ',' + c.j + ' · ' + sector(c.x, c.z) + ' · ' + (c.sections.length ? (ZN[c.sections[0].zone] || '') + ' · ' + c.sections.length + ' SECTIONS' : c.wall ? 'PERIMETER' : 'OPEN GROUND') + ' · CLICK' };
    return null;
  }
  // a unit's heading and speed from its finer samples (the picked one) or its track (the rest)
  function motion(arr, dtMin){
    if (!arr || arr.length < 2) return { v: 0, hd: null };
    const a = arr[arr.length - 1]; let b = arr[arr.length - 2]; for (let k = arr.length - 2; k >= 0; k--){ b = arr[k]; if (a[2] - b[2] >= dtMin) break; }
    const dt = Math.max(.001, (a[2] - b[2])/1000), dx = a[0] - b[0], dz = a[1] - b[1], d = Math.hypot(dx, dz);
    return { v: d/LOT/dt, hd: d > .02 ? Math.atan2(dx, -dz) : null };
  }
  const deg = a => p2((((a*180/Math.PI) % 360) + 360) % 360).padStart(3, '0');
  function sample(now){
    // every unit's track, a point a second
    if (now - (sample.t || 0) > 1000){ sample.t = now;
      const add = (k, p) => { if (!p) return; let tr = TRAIL.get(k); if (!tr){ tr = []; TRAIL.set(k, tr); } const l = tr[tr.length - 1]; if (l && Math.hypot(l[0] - p[0], l[1] - p[1]) < .03){ l[2] = now; return; } tr.push([p[0], p[1], now]); if (tr.length > 40) tr.shift(); };
      for (const o of D.ofc) if (onMap(o)) add('cop:' + o.id, live.cop(o.id));
      for (const d of D.dr.list) add('drone:' + d.id, [d.ref.pos.x, d.ref.pos.z]);
      for (const b of D.bikes) if (b.ref.mode !== 'park') add('bike:' + b.id, [b.ref.x, b.ref.z]); }
    // the picked one's, four a second (its speed, its range to a call)
    if (SEL && now - sampAt > 250){ sampAt = now; const p = posOf(SEL); if (p){ let rng = null;
        if (SEL.type === 'call'){ const u = SEL.c.unit && live.cop(SEL.c.unit); rng = u ? Math.hypot(u[0] - SEL.c.x, u[1] - SEL.c.z)/LOT : null; }
        SAMP.push([p[0], p[1], now, rng, SEL.type === 'drone' ? safe(() => droneOf(SEL.id).ref.pos.y, 0) : 0]); if (SAMP.length > 240) SAMP.shift(); } }
  }
  function loop(now){
    if (!PD.open) return; raf = requestAnimationFrame(loop);
    if (!g || !F) return; if (lastT && now - lastT < 33) return; const dtF = Math.min(.1, (now - (lastT || now))/1000); lastT = now;
    const t = now/1000;
    if (now - dataAt > 1000){ const slow = now - slowAt > 5000; dataAt = now; if (slow) slowAt = now; D = read(slow); D.sig = D.calls.length + ':' + R.seq + ':' + D.calls.filter(c => c.st === 'open').length + ':' + B.i0 + ',' + B.j0 + ',' + B.ni + ',' + B.nj + ':' + D.stn.length; refreshDom(slow); }
    sample(now);
    if (now - cardAt > 500){ cardAt = now; card(); }
    for (const el of root.querySelectorAll('.sc canvas')) drawSec(el, t);
    if (SEL) viz(t);
    if (VIEW){ drawView(t, now); return; }
    if (VT.track && SEL){ const p = posOf(SEL); if (p){ const e = Math.min(1, dtF*5); VT.cx += (p[0] - VT.cx)*e; VT.cz += (p[1] - VT.cz)*e; xf(); } }
    const W = F.W, H = F.H, dp = F.dp, s = F.s, P = F.P;
    if (!baseAt || baseAt.k !== VT.k || baseAt.gen !== D.sig || baseAt.W !== W || baseAt.H !== H || Math.abs(baseAt.cx - VT.cx)*s > F.M*.9 || Math.abs(baseAt.cz - VT.cz)*s > F.M*.9) drawBase();
    g.fillStyle = '#030805'; g.fillRect(0, 0, W, H);
    g.drawImage(base, Math.round(-F.M + (baseAt.cx - VT.cx)*s), Math.round(-F.M + (baseAt.cz - VT.cz)*s));
    const on = (x, y, r) => x > -r && y > -r && x < W + r && y < H + r, big = LOT*s > 26*dp;
    // the people on foot, where they are this moment
    g.fillStyle = 'rgba(143,220,149,.55)'; const ps = big ? 2*dp : dp;
    safe(() => { for (const p of pplList){ if (!p.walk || p.gone || p.cop) continue; const x = W/2 + (p.x - VT.cx)*s, y = H/2 + (p.z - VT.cz)*s; if (x < 0 || y < 0 || x > W || y > H) continue; g.fillRect(x, y, ps, ps); } });
    // the tracks: where each unit has been these last forty seconds or so
    g.lineWidth = dp;
    for (const [k, tr] of TRAIL){ if (tr.length < 2) continue; const mine = SEL && k === SEL.type + ':' + SEL.id; if (!mine && VT.k < 1.6) continue;
      g.strokeStyle = mine ? 'rgba(214,255,210,.8)' : 'rgba(143,220,149,.22)'; g.setLineDash(mine ? [] : [2*dp, 3*dp]); g.beginPath(); tr.forEach(([x0, z0], q) => { const [x, y] = P(x0, z0); q ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.setLineDash([]);
    // bikes: their routes dotted, each bike a wedge pointing the way it rides
    for (const b of D.bikes){ const r = b.ref; if (r.mode === 'park' && VT.k < 2.5) continue;
      const mine = SEL && SEL.type === 'bike' && SEL.id === b.id, path = r.path && r.mode !== 'park' ? r.path.pts : null;
      if (path && path.length > 1 && (mine || VT.k >= 1.4 || r.mode === 'rush')){ g.strokeStyle = mine ? '#d6ffd2' : r.mode === 'rush' ? 'rgba(255,93,74,.55)' : 'rgba(143,220,149,.4)'; g.setLineDash([dp, 3*dp]); g.beginPath(); path.forEach(([x0, z0], q) => { const [x, y] = P(x0, z0); q ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); }
      const [x, y] = P(r.x, r.z); if (!on(x, y, 10*dp)) continue; const m = motion(TRAIL.get('bike:' + b.id), 900), a = m.hd ?? (isFinite(r.hx) ? Math.atan2(r.hx, -r.hz) : 0);
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = r.mode === 'rush' ? '#ff5d4a' : r.mode === 'park' ? 'rgba(143,220,149,.45)' : '#8fdc95'; g.beginPath(); g.moveTo(0, -5*dp); g.lineTo(3.5*dp, 4*dp); g.lineTo(-3.5*dp, 4*dp); g.closePath(); g.fill(); g.restore();
      if (big || mine){ g.fillStyle = 'rgba(214,255,210,.8)'; g.font = (7.5*dp) + 'px JetBrains Mono, monospace'; g.fillText(b.id, x + 6*dp, y + 9*dp); } }
    // drones: their routes and waypoints, each drone a square with its rotors turning
    for (const d of D.dr.list){ const p = d.ref.pos, mine = SEL && SEL.type === 'drone' && SEL.id === d.id, way = d.ref.way || [];
      if (way.length){ g.strokeStyle = mine ? '#d6ffd2' : 'rgba(143,220,149,.45)'; g.lineWidth = (mine ? 1.6 : 1)*dp; g.setLineDash(mine ? [] : [5*dp, 4*dp]);
        g.beginPath(); const [sx, sy] = P(p.x, p.z); g.moveTo(sx, sy); for (const w of way){ const [x, y] = P(w.x, w.z); g.lineTo(x, y); } g.stroke(); g.setLineDash([]);
        g.lineWidth = dp; for (const w of way){ const [x, y] = P(w.x, w.z); g.strokeStyle = mine ? '#d6ffd2' : 'rgba(143,220,149,.6)'; g.strokeRect(x - 2.5*dp, y - 2.5*dp, 5*dp, 5*dp); } }
      const [x, y] = P(p.x, p.z); if (!on(x, y, 20*dp)) continue; const ch = d.mode === 'CHASE', rest = d.mode === 'REST';
      g.strokeStyle = ch ? '#ff5d4a' : rest ? 'rgba(143,220,149,.5)' : '#d6ffd2'; g.lineWidth = 1.4*dp; g.strokeRect(x - 4*dp, y - 4*dp, 8*dp, 8*dp);
      if (!rest){ const a = t*9; g.lineWidth = dp; for (let q = 0; q < 4; q++){ const ox = (q & 1 ? 1 : -1)*5.5*dp, oy = (q & 2 ? 1 : -1)*5.5*dp; g.beginPath(); g.moveTo(x + ox - Math.cos(a + q)*2.5*dp, y + oy - Math.sin(a + q)*2.5*dp); g.lineTo(x + ox + Math.cos(a + q)*2.5*dp, y + oy + Math.sin(a + q)*2.5*dp); g.stroke(); } }
      if (ch){ const k = (t*1.5) % 1; g.strokeStyle = `rgba(255,93,74,${(.8*(1 - k)).toFixed(2)})`; g.beginPath(); g.arc(x, y, (8 + k*18)*dp, 0, 7); g.stroke(); }
      if (!rest || big || mine){ g.fillStyle = '#d6ffd2'; g.font = (8*dp) + 'px JetBrains Mono, monospace'; g.fillText(d.id + (big ? ' · ' + DMODE(d.mode) + ' · ALT ' + p.y.toFixed(1) : ''), x + 8*dp, y - 6*dp); } }
    // officers
    g.lineWidth = dp;
    for (const o of D.ofc){ if (!onMap(o)) continue; const p = live.cop(o.id); if (!p) continue; const [x, y] = P(p[0], p[1]); if (!on(x, y, 12*dp)) continue;
      const resp = o.st === 'RESPONDING'; g.fillStyle = resp ? '#ff5d4a' : o.st === 'AT STATION' ? 'rgba(143,220,149,.5)' : '#d6ffd2'; g.beginPath(); g.arc(x, y, (big ? 3.4 : 2.6)*dp, 0, 7); g.fill();
      if (resp){ const k = (t*1.2 + (hsh(o.id) % 100)/100) % 1; g.strokeStyle = `rgba(255,93,74,${(.7*(1 - k)).toFixed(2)})`; g.beginPath(); g.arc(x, y, (4 + k*10)*dp, 0, 7); g.stroke(); }
      if (big && o.st !== 'AT STATION'){ const m = motion(TRAIL.get('cop:' + o.id), 1500); if (m.hd !== null){ g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(m.hd)*9*dp, y - Math.cos(m.hd)*9*dp); g.stroke(); } }
      if (VT.k >= 2.6 || (SEL && SEL.id === o.id)){ g.fillStyle = 'rgba(214,255,210,.85)'; g.font = (8*dp) + 'px JetBrains Mono, monospace'; g.fillText(o.b, x + 5*dp, y - 4*dp); } }
    // open calls pulsing
    { const k = (t*.7) % 1; for (const c of D.recent) if (c.st === 'open'){ const [x, y] = P(c.x, c.z); if (!on(x, y, 30*dp)) continue; g.strokeStyle = `rgba(255,93,74,${(.8*(1 - k)).toFixed(2)})`; g.lineWidth = 1.3*dp; g.beginPath(); g.arc(x, y, (5 + k*16)*dp, 0, 7); g.stroke(); } }
    // the screen's own furniture: sector letters round the edge, callouts, compass, scale bar, the polar inset, the sweep
    overlay(t);
    // the picked thing: brackets turning round it wherever it is now; the hovered one boxed
    if (SEL){ const p = posOf(SEL); if (p){ const [x, y] = P(p[0], p[1]); let rr = 13*dp;
        if (SEL.type === 'sector'){ const bx = secBox(SEL.name), [a, b2] = P((bx.i0 - .5)*LOT, (bx.j0 - .5)*LOT), [c2, d2] = P((bx.i1 + .5)*LOT, (bx.j1 + .5)*LOT); g.strokeStyle = '#d6ffd2'; g.setLineDash([5*dp, 4*dp]); g.strokeRect(a, b2, c2 - a, d2 - b2); g.setLineDash([]); rr = 0; }
        else if (SEL.m){ rr = Math.max(13*dp, Math.max(SEL.m.w, SEL.m.h)*LOT*s*.62); } else if (SEL.type === 'plot') rr = Math.max(13*dp, LOT*s*.62);
        if (rr){ g.strokeStyle = SEL.type === 'call' ? '#ff5d4a' : '#d6ffd2'; g.lineWidth = 1.4*dp; const a0 = t*.8; for (let q = 0; q < 4; q++){ g.beginPath(); g.arc(x, y, rr, a0 + q*Math.PI/2, a0 + q*Math.PI/2 + .7); g.stroke(); } g.lineWidth = dp; } } }
    if (hov && (!SEL || hov.s.type !== SEL.type || hov.s.id !== SEL.id)){ const p = posOf(hov.s); if (p){ const [x, y] = P(p[0], p[1]);
        if (hov.s.type === 'plot'){ const w = (LOT - .3)*s; g.strokeStyle = 'rgba(214,255,210,.7)'; g.lineWidth = dp; g.strokeRect(x - w/2, y - w/2, w, w); }
        else if (hov.s.m){ const m = hov.s.m, w = m.w*LOT*s, h = m.h*LOT*s; g.strokeStyle = '#d6ffd2'; g.lineWidth = dp; g.strokeRect(x - w/2, y - h/2, w, h); }
        else { g.strokeStyle = '#d6ffd2'; g.lineWidth = dp; g.strokeRect(x - 8*dp, y - 8*dp, 16*dp, 16*dp); } } }
    const c = $('.clk'); if (c){ const s2 = (now/500 | 0) % 2 ? hm(shownNow()) : hm(shownNow()).replace(':', ' '); if (c.textContent !== s2) c.textContent = s2; }
  }
  function overlay(t){
    const W = F.W, H = F.H, dp = F.dp, s = F.s, P = F.P;
    g.font = (8.5*dp) + 'px JetBrains Mono, monospace'; g.fillStyle = 'rgba(143,220,149,.5)';
    for (let k = 0; k < 8; k++){ const [x] = P((B.i0 - .5 + (k + .5)*B.ni/8)*LOT, 0); if (x > 10*dp && x < W - 10*dp) g.fillText('ABCDEFGH'[k], x - 3*dp, 12*dp); }
    for (let k = 0; k < 6; k++){ const [, y] = P(0, (B.j0 - .5 + (k + .5)*B.nj/6)*LOT); if (y > 20*dp && y < H - 10*dp) g.fillText(String(k + 1), 4*dp, y + 3*dp); }
    // a sweep across the plan
    const sx = ((t*.07) % 1)*W, gr = g.createLinearGradient(sx - 60*dp, 0, sx, 0); gr.addColorStop(0, 'rgba(143,220,149,0)'); gr.addColorStop(1, 'rgba(143,220,149,.07)'); g.fillStyle = gr; g.fillRect(sx - 60*dp, 0, 60*dp, H); g.fillStyle = 'rgba(143,220,149,.35)'; g.fillRect(sx, 0, dp, H);
    // callouts: boxed labels on leader lines, as on a survey plot
    const placed = [];
    const callout = (x0, z0, lines, dx, dy, col) => { const [x, y] = P(x0, z0); if (x < -40*dp || y < -40*dp || x > W + 40*dp || y > H + 40*dp) return; const tx = Math.max(6*dp, Math.min(W - 160*dp, x + dx*dp)); let ty = Math.max(30*dp, Math.min(H - 60*dp, y + dy*dp));
      g.font = (9*dp) + 'px JetBrains Mono, monospace'; const w = Math.max(...lines.map(l => g.measureText(l).width)) + 10*dp, h = lines.length*12*dp + 4*dp;
      for (let k = 0; k < 12 && placed.some(r => tx < r[0] + r[2] + 4*dp && tx + w > r[0] - 4*dp && ty - 4*dp < r[1] + r[3] + 4*dp && ty - 4*dp + h > r[1] - 4*dp); k++) ty += h + 6*dp;
      placed.push([tx, ty - 4*dp, w, h]);
      g.strokeStyle = col; g.lineWidth = dp; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty + 6*dp); g.stroke(); g.beginPath(); g.arc(x, y, 3*dp, 0, 7); g.stroke();
      g.fillStyle = 'rgba(3,8,5,.88)'; g.fillRect(tx, ty - 4*dp, w, h); g.strokeRect(tx, ty - 4*dp, w, h);
      lines.forEach((l, k) => { g.fillStyle = k ? 'rgba(143,220,149,.85)' : '#d6ffd2'; g.fillText(l, tx + 5*dp, ty + 7*dp + k*12*dp); }); };
    if (VT.k < 3){
      if (D.hot.length){ const q = secBox(D.hot[0][0]); callout((q.i0 + q.i1)/2*LOT, (q.j0 + q.j1)/2*LOT, ['HOTSPOT ' + D.hot[0][0], D.hot[0][1] + ' CALLS · 72 H'], 70, -60, 'rgba(255,93,74,.8)'); }
      if (D.last) callout(D.last.x, D.last.z, ['LAST P' + D.last.pri + ' · ' + D.last.kind, tc(D.last.c) + ' · ' + D.last.sec + (D.last.unit ? ' · ' + badge(D.last.unit) : '')], -150, 50, 'rgba(255,176,58,.85)');
      for (const st of D.stn) callout(st.m.x, st.m.z, ['STN-' + p2(st.n) + ' · ' + st.sec, st.staff + ' STAFF · ' + st.out + ' OUT · ' + st.drones + ' DRONES'], 60, 60, 'rgba(214,255,210,.7)'); }
    // the compass rose and a scale bar of a round number of plots
    g.font = (8.5*dp) + 'px JetBrains Mono, monospace';
    { const cx = 34*dp, cy = H - 70*dp, r = 20*dp; g.strokeStyle = 'rgba(143,220,149,.5)'; g.lineWidth = dp; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      for (let k = 0; k < 16; k++){ const a = k/16*Math.PI*2, l = k % 4 ? 3 : 6; g.beginPath(); g.moveTo(cx + Math.sin(a)*r, cy - Math.cos(a)*r); g.lineTo(cx + Math.sin(a)*(r - l*dp), cy - Math.cos(a)*(r - l*dp)); g.stroke(); }
      g.fillStyle = '#d6ffd2'; g.beginPath(); g.moveTo(cx, cy - r + 2*dp); g.lineTo(cx + 4*dp, cy); g.lineTo(cx - 4*dp, cy); g.fill(); g.fillStyle = 'rgba(143,220,149,.6)'; g.textAlign = 'center';
      for (const [l, a] of [['N', 0], ['E', 1], ['S', 2], ['W', 3]]){ const aa = a*Math.PI/2; g.fillText(l, cx + Math.sin(aa)*(r + 8*dp), cy - Math.cos(aa)*(r + 8*dp) + 3*dp); } g.textAlign = 'left'; }
    { const n = [1, 2, 5, 10, 20].find(q => q*LOT*s > 50*dp) || 20, L = n*LOT*s, x1 = W - 12*dp, x0 = x1 - L, y = H - 14*dp; g.strokeStyle = 'rgba(143,220,149,.7)'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); for (let k = 0; k <= 5; k++){ const x = x0 + L*k/5; g.moveTo(x, y); g.lineTo(x, y - (k % 5 ? 3 : 6)*dp); } g.stroke();
      g.fillStyle = 'rgba(143,220,149,.7)'; g.textAlign = 'right'; g.fillText(n + ' PLOT' + (n > 1 ? 'S' : ''), x1, y - 8*dp); g.textAlign = 'left'; }
    // an inset: the calls around the first station by bearing and distance, the units out on it too
    if (D.stn.length && !SEL){ const st = D.stn[0].m, r = Math.min(56*dp, H*.13), cx = r + 30*dp, cy = r + 40*dp;
      g.fillStyle = 'rgba(3,8,5,.85)'; g.fillRect(cx - r - 8*dp, cy - r - 18*dp, 2*r + 16*dp, 2*r + 26*dp); g.strokeStyle = 'rgba(143,220,149,.35)'; g.strokeRect(cx - r - 8*dp, cy - r - 18*dp, 2*r + 16*dp, 2*r + 26*dp);
      g.fillStyle = 'rgba(143,220,149,.7)'; g.fillText('POLAR · STN-01 AT CENTER', cx - r - 4*dp, cy - r - 7*dp);
      for (const f of [1, .66, .33]){ g.strokeStyle = 'rgba(143,220,149,.25)'; g.beginPath(); g.arc(cx, cy, r*f, 0, 7); g.stroke(); }
      g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
      const far = Math.max(LOT*6, ...D.recent.map(c => Math.hypot(c.x - st.x, c.z - st.z)));
      const a = t*1.1; g.strokeStyle = 'rgba(143,220,149,.6)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r); g.stroke();
      for (const c of D.recent){ const dx = (c.x - st.x)/far*r, dz = (c.z - st.z)/far*r; if (dx*dx + dz*dz > r*r) continue; g.fillStyle = c.src === 'case' ? '#ffb03a' : c.st === 'open' ? '#ff5d4a' : '#8fdc95'; g.fillRect(cx + dx - 1.5*dp, cy + dz - 1.5*dp, 3*dp, 3*dp); }
      for (const o of D.ofc){ if (!onMap(o)) continue; const p = live.cop(o.id); if (!p) continue; const dx = (p[0] - st.x)/far*r, dz = (p[1] - st.z)/far*r; if (dx*dx + dz*dz > r*r) continue; g.fillStyle = '#d6ffd2'; g.beginPath(); g.arc(cx + dx, cy + dz, 1.6*dp, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(143,220,149,.55)'; g.textAlign = 'right'; g.fillText(Math.round(far/LOT) + ' PL', cx + r, cy + r + 6*dp); g.textAlign = 'left'; }
  }
  /* ---------- the card: what's picked, with a live readout of its own kind ---------- */
  function select(s, focus){
    SEL = s; VIEW = null; SNAP = null; SAMP.length = 0; sampAt = 0; cardAt = 0;
    const det = $('.det'); det.hidden = !s;
    if (!s){ VT.track = false; const lg = $('.lg'); if (lg) lg.style.display = ''; refreshDom(false); return; }
    if (s.type === 'call'){ const c = R.calls.find(q => q.id === s.id); if (c) s.c = c; }
    const p = posOf(s);
    if (focus && p){ VT.cx = p[0]; VT.cz = p[1]; const want = s.type === 'sector' ? Math.min(4, Math.max(1.5, B.ni/((secBox(s.name).i1 - secBox(s.name).i0 + 1)*2.2))) : s.type === 'stn' || s.type === 'lidar' ? 2 : 2.6; if (VT.k < want) VT.k = want; clampVT(); xf(); }
    VT.track = !!focus && (s.type === 'cop' || s.type === 'drone' || s.type === 'bike' || s.type === 'person');
    const vz = $('.viz'); vz._fit = null; vz._sec = null; vz._kind = s.type;
    card(); refreshDom(false);
  }
  function act(a, arg){
    if (a === 'track'){ VT.track = !VT.track; if (VT.track && VT.k < 2.2){ VT.k = 2.2; xf(); } card(); }
    else if (a === 'scan') scanOn();
    else if (a === 'plan'){ VIEW = null; SNAP = null; card(); }
    else if (a === 'cop') select({ type: 'cop', id: arg }, true);
    else if (a === 'stn'){ const st = D.stn[+arg]; if (st) select({ type: 'stn', m: st.m }, true); }
    else if (a === 'sector') select({ type: 'sector', name: arg }, true);
  }
  const KVS = rows => rows.map(([k, v, c]) => `<span>${k}</span><span${c ? ' class="' + c + '"' : ''}>${v}</span>`).join('');
  function card(){
    if (!SEL || !root) return; const det = $('.det'); if (det.hidden) return; const lg = $('.lg'); if (lg) lg.style.display = VIEW ? 'none' : '';
    const c = cardData(SEL); if (!c){ select(null); return; }
    const set = (q, html) => { const el = det.querySelector(q); if (el._h !== html){ el._h = html; el.innerHTML = html; } };
    const trk = c.trk ? `<button type="button" data-act="track" class="${VT.track ? 'on' : ''}">${VT.track ? '■ TRACKING' : '◎ TRACK ON PLAN'}</button>` : '';
    const scan = VIEW ? '<button type="button" data-act="plan" class="back">◂ BACK TO PLAN</button>' : '<button type="button" data-act="scan">OVERHEAD SCAN ▸</button>';
    set('h4', c.h); set('.s', c.s); set('.vl', c.vl + '<span>' + (VIEW ? '● OVERHEAD LIVE' : '● LIVE') + '</span>'); set('.kv', KVS(c.kv)); set('.row', trk + scan + (c.row || ''));
  }
  function cardData(s){
    const d = D, pos = posOf(s);
    if (s.type === 'cop'){ const o = d.ofc.find(q => q.id === s.id); if (!o) return null; const mine = d.calls.filter(c => c.unit === s.id), last = mine[0], m = motion(SAMP, 900), stn = d.stn[o.stn];
      return { h: 'UNIT ' + o.b, s: o.unit + ' · ' + o.shift + ' SHIFT · STN-' + p2((o.stn ?? 0) + 1), vl: 'UNIT TRACKER · 3 PLOTS ROUND', trk: true,
        kv: [['STATUS', o.st, o.st === 'RESPONDING' ? 'red' : ''], ['SECTOR', pos ? sector(pos[0], pos[1]) : o.sec], ['HEADING · SPEED', (m.hd === null ? '---' : deg(m.hd) + '°') + ' · ' + m.v.toFixed(2) + ' PL/S'],
          ['FROM STATION', stn && pos ? (Math.hypot(pos[0] - stn.m.x, pos[1] - stn.m.z)/LOT).toFixed(1) + ' PL' : '--'], ['CALLS · 72 H · ARRESTS', mine.filter(c => d.now - c.c < 4320).length + ' · ' + mine.filter(c => c.st === 'ARREST').length],
          ['LAST CALL', last ? esc(last.kind) + ' · ' + hm(last.c) : 'NONE']],
        row: `<button type="button" data-follow="${esc(s.id)}">FOLLOW ON CAM ▸</button>` }; }
    if (s.type === 'person'){ const desc = safe(() => STORY.descOf(s.id), 'subject'), m = motion(SAMP, 900);
      return { h: 'SUBJECT', s: esc(String(desc).toUpperCase()), vl: 'SUBJECT TRACKER', trk: true,
        kv: [['SECTOR', pos ? sector(pos[0], pos[1]) : '--'], ['STATUS', safe(() => people.get(s.id).walk, null) ? 'ON THE MOVE' : 'INDOORS'], ['HEADING · SPEED', (m.hd === null ? '---' : deg(m.hd) + '°') + ' · ' + m.v.toFixed(2) + ' PL/S']],
        row: `<button type="button" data-follow="${esc(s.id)}">FOLLOW ON CAM ▸</button>` }; }
    if (s.type === 'drone'){ const q = droneOf(s.id); if (!q) return null; const r = q.ref, m = motion(SAMP, 600), way = r.way || [], nx = way[0];
      return { h: 'DRONE ' + s.id, s: 'STN-' + p2(q.stn + 1) + ' · ' + DMODE(q.mode), vl: 'FLIGHT TELEMETRY · SCAN RADAR', trk: true,
        kv: [['ALTITUDE', r.pos.y.toFixed(1) + ' U'], ['HEADING · SPEED', (m.hd === null ? '---' : deg(m.hd) + '°') + ' · ' + m.v.toFixed(2) + ' PL/S'], ['SECTOR', sector(r.pos.x, r.pos.z)],
          ['NEXT WAYPOINT', nx ? sector(nx.x, nx.z) + ' · ' + (Math.hypot(nx.x - r.pos.x, nx.z - r.pos.z)/LOT).toFixed(1) + ' PL' : 'NONE'], ['ROUTE', way.length ? way.slice(0, 5).map(w => sector(w.x, w.z)).join(' › ') + (way.length > 5 ? ' …' : '') : 'DOCKED']] }; }
    if (s.type === 'bike'){ const b = bikeOf(s.id); if (!b) return null; const r = b.ref, m = motion(SAMP, 600), path = r.path && r.mode !== 'park' ? r.path.pts : null;
      return { h: 'BIKE ' + s.id, s: 'STN-' + p2(b.stn + 1) + ' · ' + BMODE(r.mode), vl: 'SPEED · ROUTE PROGRESS', trk: true,
        kv: [['MODE', BMODE(r.mode), r.mode === 'rush' ? 'red' : ''], ['RIDER', r.cop ? badge(r.cop.id) : r.rider ? 'ABOARD' : 'NONE'], ['SPEED', m.v.toFixed(2) + ' PL/S'], ['SECTOR', sector(r.x, r.z)],
          ['ROUTE LEFT', path ? (left(path, r.x, r.z)/LOT).toFixed(1) + ' PL' : '--']],
        row: r.cop ? `<button type="button" data-act="cop" data-arg="${esc(r.cop.id)}">RIDER ▸</button>` : '' }; }
    if (s.type === 'call'){ const c = s.c, done = c.st !== 'open' && c.st !== 'LOGGED', u = c.unit && live.cop(c.unit), rng = u ? Math.hypot(u[0] - c.x, u[1] - c.z)/LOT : null;
      return { h: 'CALL ' + String(c.id).padStart(5, '0'), s: 'P' + c.pri + ' · ' + esc(c.kind) + (c.file ? ' · ' + c.file : ''), vl: 'INCIDENT TIMELINE · UNIT RANGE',
        kv: [['STATUS', done ? c.st + ' ' + hm(c.done ?? c.c) : c.st === 'LOGGED' ? 'LOGGED' : 'OPEN · ' + Math.round(d.now - c.c) + ' MIN', !done && c.st !== 'LOGGED' ? 'red' : ''], ['SECTOR', c.sec],
          ['SOURCE', c.src === 'real' ? 'STREET REPORT' : c.src === 'case' ? 'CASE FILE' : 'CALLER'], ['UNIT', c.unit ? badge(c.unit) : '—'], ['UNIT RANGE', rng === null ? '--' : rng < .7 ? 'ON SCENE' : rng.toFixed(1) + ' PL']],
        row: c.unit ? `<button type="button" data-act="cop" data-arg="${esc(c.unit)}">UNIT ▸</button><button type="button" data-follow="${esc(c.unit)}">FOLLOW UNIT ▸</button>` : '' }; }
    if (s.type === 'stn'){ const k = d.stn.findIndex(q => q.m === s.m); if (k < 0) return null; const st = d.stn[k], near = d.recent.filter(c => Math.hypot(c.x - s.m.x, c.z - s.m.z) < 10*LOT);
      return { h: 'STN-' + p2(st.n), s: 'STATION BOARD · ' + st.sec, vl: 'ROSTER · DRONES · BIKES',
        kv: [['STAFF · OUT', st.staff + ' · ' + st.out], ['DRONES UP', d.dr.list.filter(q => q.stn === k && q.mode !== 'REST').length + ' / ' + st.drones], ['BIKES OUT', d.bikes.filter(b => b.stn === k && b.ref.mode !== 'park').length + ' / ' + st.bikes],
          ['CALLS IN 10 PL · 72 H', near.length], ['OPEN NEAR', near.filter(c => c.st === 'open').length, near.some(c => c.st === 'open') ? 'red' : '']] }; }
    if (s.type === 'lidar'){ return { h: 'LIDAR ARRAY', s: sector(s.m.x, s.m.z) + ' · PULSED SCAN', vl: 'COVER · SCAN BEAM',
        kv: [['RANGE', (LIDAR_R/LOT).toFixed(0) + ' PLOTS'], ['CITY COVERED', Math.round(d.lidar*100) + '%'], ['POD SCANS', 'UNLOCKED']] }; }
    if (s.type === 'mega'){ const q = sectorQ(sector(s.m.x, s.m.z));
      return { h: String(s.m.kind).toUpperCase(), s: 'MEGASTRUCTURE · ' + q.name, vl: 'SECTOR ' + q.name + ' · SWEEP', sec: q,
        kv: [['FOOTPRINT', s.m.w + ' × ' + s.m.h + ' PLOTS'], ['CALLS IN SECTOR · 72 H', q.n], ['UNITS IN SECTOR', q.units]], row: `<button type="button" data-act="sector" data-arg="${q.name}">SECTOR ${q.name} ▸</button>` }; }
    if (s.type === 'plot'){ const c = safe(() => cells.get(ckey(s.i, s.j)), null); if (!c) return null; const q = sectorQ(sector(s.x, s.z)), lv = c.sections.length;
      return { h: 'PLOT ' + s.i + ',' + s.j, s: (lv ? (ZN[c.sections[0].zone] || 'BUILT') : c.wall ? 'PERIMETER · ' + (ZN[c.wall.zone] || '') : 'OPEN GROUND') + ' · ' + q.name, vl: 'SECTOR ' + q.name + ' · SWEEP', sec: q,
        kv: [['SECTIONS', lv || '—'], ['ON FOOT HERE', safe(() => pplList.filter(p => p.walk && !p.gone && Math.abs(p.x - c.x) < LOT/2 && Math.abs(p.z - c.z) < LOT/2).length, 0)], ['CALLS IN SECTOR · 72 H', q.n], ['UNITS IN SECTOR', q.units]],
        row: `<button type="button" data-act="sector" data-arg="${q.name}">SECTOR ${q.name} ▸</button>` }; }
    if (s.type === 'sector'){ const q = sectorQ(s.name);
      return { h: 'SECTOR ' + q.name, s: (q.bx.i1 - q.bx.i0 + 1) + ' × ' + (q.bx.j1 - q.bx.j0 + 1) + ' PLOTS', vl: 'SECTOR SWEEP · CALLS BY HOUR', sec: q,
        kv: [['CALLS · 72 H', q.n], ['UNITS IN SECTOR', q.units], ['LAST', q.last ? esc(q.last.kind) + ' · ' + hm(q.last.c) : 'QUIET']] }; }
    return null;
  }
  function left(pts, x, z){ let bi = 0, bd = Infinity; pts.forEach(([a, b], k) => { const d2 = (a - x)**2 + (b - z)**2; if (d2 < bd){ bd = d2; bi = k; } }); let L = Math.sqrt(bd); for (let k = bi; k < pts.length - 1; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); return L; }
  // the card's readout, drawn every frame: a different instrument for each kind of thing
  function viz(t){
    const el = $('.viz'); if (!el || $('.det').hidden) return; const kind = SEL.type;
    if (kind === 'sector' || kind === 'plot' || kind === 'mega'){ if (!el._sec || (cardAt && el._secAt !== cardAt)){ const name = kind === 'sector' ? SEL.name : sector(...posOf(SEL)); el._sec = sectorQ(name); el._secAt = cardAt; } if (!el._fit) el._fit = fitCanvas(el); drawSec(el, t); return; }
    if (!el._fit) el._fit = fitCanvas(el); const [x, W, H, dp] = el._fit; x.clearRect(0, 0, W, H); x.lineWidth = dp; x.font = (8*dp) + 'px JetBrains Mono, monospace';
    const pos = posOf(SEL); if (!pos){ x.fillStyle = GR.dim; x.fillText('NO SIGNAL', 8*dp, 14*dp); return; }
    // a radar round a point: plots, people on foot, units, calls, a sweep; what the sweep has just passed shows brightest
    const radar = (cx, cy, rr, R0, opt) => {
      const sc = rr/R0, Q = (wx, wz) => [cx + (wx - pos[0])*sc, cy + (wz - pos[1])*sc], ang = (t*(opt.sp || 1.6)) % (Math.PI*2);
      x.save(); x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.clip();
      safe(() => { const i0 = Math.round((pos[0] - R0)/LOT), i1 = Math.round((pos[0] + R0)/LOT), j0 = Math.round((pos[1] - R0)/LOT), j1 = Math.round((pos[1] + R0)/LOT);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++){ const c = cells.get(ckey(i, j)); if (!c) continue; const [a, b] = Q(c.x - LOT/2 + .2, c.z - LOT/2 + .2), w = (LOT - .4)*sc, lv = c.mega ? 3 : c.sections.length; x.fillStyle = `rgba(143,220,149,${(.04 + .05*Math.min(4, lv)).toFixed(2)})`; x.fillRect(a, b, w, w); if (lv){ x.strokeStyle = 'rgba(143,220,149,.25)'; x.strokeRect(a + .5, b + .5, w - 1, w - 1); } } });
      const gr = x.createConicGradient ? x.createConicGradient(ang - .9, cx, cy) : null; if (gr){ gr.addColorStop(0, 'rgba(143,220,149,0)'); gr.addColorStop(.14, 'rgba(143,220,149,.2)'); gr.addColorStop(.145, 'rgba(143,220,149,0)'); x.fillStyle = gr; x.fillRect(cx - rr, cy - rr, 2*rr, 2*rr); }
      const lit = (a, b) => { let da = ang - Math.atan2(b - cy, a - cx); da = ((da % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); return 1 - Math.min(1, da/(Math.PI*1.6)); };
      safe(() => { for (const p of pplList){ if (!p.walk || p.gone || p.cop) continue; if (Math.abs(p.x - pos[0]) > R0 || Math.abs(p.z - pos[1]) > R0) continue; const [a, b] = Q(p.x, p.z); const l = opt.lit ? lit(a, b) : .6; x.fillStyle = `rgba(214,255,210,${(.25 + .75*l).toFixed(2)})`; x.fillRect(a - dp, b - dp, 2*dp, 2*dp); } });
      for (const c of D.recent){ if (Math.abs(c.x - pos[0]) > R0 || Math.abs(c.z - pos[1]) > R0) continue; const [a, b] = Q(c.x, c.z); x.strokeStyle = c.st === 'open' ? GR.red : c.src === 'case' ? GR.amb : GR.dim; x.beginPath(); x.moveTo(a - 3*dp, b - 3*dp); x.lineTo(a + 3*dp, b + 3*dp); x.moveTo(a + 3*dp, b - 3*dp); x.lineTo(a - 3*dp, b + 3*dp); x.stroke(); }
      for (const o of D.ofc){ if (!onMap(o) || o.id === SEL.id) continue; const p = live.cop(o.id); if (!p || Math.abs(p[0] - pos[0]) > R0 || Math.abs(p[1] - pos[1]) > R0) continue; const [a, b] = Q(p[0], p[1]); x.fillStyle = o.st === 'RESPONDING' ? GR.red : GR.hi; x.beginPath(); x.arc(a, b, 2.4*dp, 0, 7); x.fill(); }
      const tr = TRAIL.get(SEL.type + ':' + SEL.id); if (tr && tr.length > 1){ x.strokeStyle = 'rgba(214,255,210,.6)'; x.setLineDash([2*dp, 2*dp]); x.beginPath(); tr.forEach(([a0, b0], q) => { const [a, b] = Q(a0, b0); q ? x.lineTo(a, b) : x.moveTo(a, b); }); x.lineTo(cx, cy); x.stroke(); x.setLineDash([]); }
      if (opt.way && opt.way.length){ x.strokeStyle = GR.hi; x.beginPath(); x.moveTo(cx, cy); for (const w of opt.way){ const [a, b] = Q(w.x, w.z); x.lineTo(a, b); } x.stroke(); for (const w of opt.way){ const [a, b] = Q(w.x, w.z); x.strokeRect(a - 2.5*dp, b - 2.5*dp, 5*dp, 5*dp); } }
      x.restore();
      x.strokeStyle = GR.dim; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.stroke(); x.strokeStyle = GR.faint; x.beginPath(); x.arc(cx, cy, rr*.5, 0, 7); x.moveTo(cx - rr, cy); x.lineTo(cx + rr, cy); x.moveTo(cx, cy - rr); x.lineTo(cx, cy + rr); x.stroke();
      x.strokeStyle = GR.ink; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(ang)*rr, cy + Math.sin(ang)*rr); x.stroke();
      for (let k = 0; k < 36; k++){ const a = k/36*Math.PI*2, l = k % 9 ? 2 : 5; x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(cx + Math.sin(a)*rr, cy - Math.cos(a)*rr); x.lineTo(cx + Math.sin(a)*(rr + l*dp), cy - Math.cos(a)*(rr + l*dp)); x.stroke(); }
      const hd = motion(SAMP, 700).hd; x.fillStyle = opt.col || GR.hi; x.save(); x.translate(cx, cy); x.rotate(hd ?? 0); x.beginPath(); x.moveTo(0, -6*dp); x.lineTo(4*dp, 4*dp); x.lineTo(0, 2*dp); x.lineTo(-4*dp, 4*dp); x.closePath(); x.fill(); x.restore();
      x.fillStyle = GR.dim; x.fillText('N', cx - 2.5*dp, cy - rr - 7*dp); };
    const spark = (x0, y0, w, h, vals, mx, col, label) => { x.strokeStyle = GR.faint; x.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1); if (vals.length > 1){ x.strokeStyle = col; x.beginPath(); vals.forEach((v, k) => { const a = x0 + w*k/(vals.length - 1), b = y0 + h - 2*dp - (h - 4*dp)*Math.min(1, v/mx); k ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); } x.fillStyle = GR.dim; x.fillText(label, x0 + 3*dp, y0 + 9*dp); };
    const speeds = () => { const out = []; for (let k = 4; k < SAMP.length; k++){ const a = SAMP[k], b = SAMP[k - 4]; out.push(Math.hypot(a[0] - b[0], a[1] - b[1])/LOT/Math.max(.001, (a[2] - b[2])/1000)); } return out.slice(-60); };
    if (kind === 'cop' || kind === 'person'){
      const rr = Math.min(H/2 - 8*dp, W*.3), cx = rr + 10*dp; radar(cx, H/2, rr, 3*LOT, { col: kind === 'cop' && D.ofc.find(o => o.id === SEL.id && o.st === 'RESPONDING') ? GR.red : GR.hi });
      const x0 = cx + rr + 14*dp, w = W - x0 - 4*dp, sp = speeds(), m = motion(SAMP, 900);
      x.fillStyle = GR.hi; x.font = (15*dp) + 'px JetBrains Mono, monospace'; x.fillText(m.hd === null ? '---°' : deg(m.hd) + '°', x0, 18*dp); x.font = (8*dp) + 'px JetBrains Mono, monospace'; x.fillStyle = GR.dim; x.fillText('HEADING', x0 + 52*dp, 17*dp);
      spark(x0, 26*dp, w, H*.36, sp, Math.max(.5, ...sp), GR.ink, 'SPEED ' + m.v.toFixed(2) + ' PL/S');
      // a signal strip: the unit's radio, livelier when it's moving
      const y0 = 30*dp + H*.36, h = H - y0 - 4*dp, n = 26; for (let k = 0; k < n; k++){ const v = .25 + .75*Math.abs(Math.sin(t*3 + k*.7 + hsh(SEL.id) % 7))*Math.min(1, .3 + m.v*1.5); x.fillStyle = k/n < v ? GR.ink : GR.faint; x.fillRect(x0 + k*w/n, y0 + h*(1 - v), w/n - dp, h*v); }
      return; }
    if (kind === 'drone'){ const q = droneOf(SEL.id); if (!q) return; const r = q.ref;
      const rr = Math.min(H/2 - 8*dp, W*.3), cx = W - rr - 12*dp; radar(cx, H/2, rr, 2.5*LOT, { lit: true, sp: 2.4, way: r.way, col: q.mode === 'CHASE' ? GR.red : GR.hi });
      // an altitude tape and the climb over the last minute
      const tx = 8*dp, tw = 34*dp, top = 8*dp, bot = H - 8*dp, alts = SAMP.map(a => a[4] || 0), mxA = Math.max(10, ...alts) * 1.2, ya = v => bot - (bot - top)*v/mxA;
      x.strokeStyle = GR.dim; x.strokeRect(tx + .5, top + .5, tw, bot - top); for (let v = 0; v <= mxA; v += 2){ const y = ya(v); x.beginPath(); x.moveTo(tx + tw - (v % 10 ? 4 : 8)*dp, y); x.lineTo(tx + tw, y); x.stroke(); if (v % 10 === 0){ x.fillStyle = GR.dim; x.fillText(String(v), tx + 3*dp, y + 3*dp); } }
      const ay = ya(r.pos.y); x.fillStyle = GR.hi; x.beginPath(); x.moveTo(tx + tw + 1*dp, ay); x.lineTo(tx + tw + 8*dp, ay - 4*dp); x.lineTo(tx + tw + 8*dp, ay + 4*dp); x.fill(); x.fillText(r.pos.y.toFixed(1), tx + tw + 10*dp, ay + 3*dp);
      const x0 = tx + tw + 40*dp, w = cx - rr - 16*dp - x0; if (w > 30*dp){ const sp = speeds(); spark(x0, 8*dp, w, (H - 22*dp)/2, alts.slice(-60), mxA, GR.hi, 'ALT'); spark(x0, 14*dp + (H - 22*dp)/2, w, (H - 22*dp)/2, sp, Math.max(.5, ...sp), GR.ink, 'SPD'); }
      return; }
    if (kind === 'bike'){ const b = bikeOf(SEL.id); if (!b) return; const r = b.ref, m = motion(SAMP, 600), mx = 1.5, cx = W*.3, cy = H*.72, rr = Math.min(W*.24, H*.62);
      x.lineWidth = 6*dp; x.strokeStyle = GR.faint; x.beginPath(); x.arc(cx, cy, rr, Math.PI, 0); x.stroke(); x.strokeStyle = r.mode === 'rush' ? GR.red : GR.ink; x.beginPath(); x.arc(cx, cy, rr, Math.PI, Math.PI + Math.PI*Math.min(1, m.v/mx)); x.stroke(); x.lineWidth = dp;
      for (let k = 0; k <= 10; k++){ const a = Math.PI + Math.PI*k/10; x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(cx + Math.cos(a)*(rr + 5*dp), cy + Math.sin(a)*(rr + 5*dp)); x.lineTo(cx + Math.cos(a)*(rr + (k % 5 ? 8 : 12)*dp), cy + Math.sin(a)*(rr + (k % 5 ? 8 : 12)*dp)); x.stroke(); }
      const na = Math.PI + Math.PI*Math.min(1, m.v/mx); x.strokeStyle = GR.hi; x.lineWidth = 1.6*dp; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(na)*(rr - 6*dp), cy + Math.sin(na)*(rr - 6*dp)); x.stroke(); x.lineWidth = dp;
      x.fillStyle = GR.hi; x.textAlign = 'center'; x.font = (13*dp) + 'px JetBrains Mono, monospace'; x.fillText(m.v.toFixed(2), cx, cy - 4*dp); x.font = (8*dp) + 'px JetBrains Mono, monospace'; x.fillStyle = GR.dim; x.fillText('PL/S', cx, cy + 8*dp); x.textAlign = 'left';
      const path = r.path && r.mode !== 'park' ? r.path.pts : null, x0 = W*.6, w = W - x0 - 8*dp;
      x.fillStyle = GR.dim; x.fillText('ROUTE', x0, 14*dp);
      if (path && path.length > 1){ let tot = 0; for (let k = 0; k < path.length - 1; k++) tot += Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]); const f = Math.max(0, Math.min(1, 1 - left(path, r.x, r.z)/Math.max(.01, tot)));
        x.strokeStyle = GR.dim; x.strokeRect(x0 + .5, 20*dp, w, 10*dp); x.fillStyle = r.mode === 'rush' ? GR.red : GR.ink; x.fillRect(x0 + 2*dp, 22*dp, (w - 3*dp)*f, 6*dp); x.fillStyle = GR.hi; x.fillText(Math.round(f*100) + '% DONE', x0, 44*dp);
        // the route's shape, small, with the bike on it
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const [a, b2] of path){ a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b2); b1 = Math.max(b1, b2); }
        const bh = H - 54*dp, ss = Math.min(w/Math.max(.1, a1 - a0), bh/Math.max(.1, b1 - b0)), Q = (a, b2) => [x0 + (a - a0)*ss, 50*dp + (b2 - b0)*ss];
        x.strokeStyle = GR.ink; x.setLineDash([2*dp, 2*dp]); x.beginPath(); path.forEach(([a, b2], k) => { const [u, v] = Q(a, b2); k ? x.lineTo(u, v) : x.moveTo(u, v); }); x.stroke(); x.setLineDash([]); const [u, v] = Q(r.x, r.z); x.fillStyle = GR.hi; x.beginPath(); x.arc(u, v, 3*dp, 0, 7); x.fill(); }
      else { x.fillStyle = GR.dim; x.fillText('PARKED AT THE BAY', x0, 30*dp); }
      return; }
    if (kind === 'call'){ const c = SEL.c, now = D.now, t0 = c.c, t1 = Math.max(now, (c.done ?? now)), span = Math.max(30, t1 - t0 + 10), X = v => 10*dp + (W - 20*dp)*(v - t0)/span;
      x.strokeStyle = GR.dim; x.beginPath(); x.moveTo(X(t0), 22*dp); x.lineTo(X(t0 + span), 22*dp); x.stroke();
      for (let m = 0; m <= span; m += 10){ x.beginPath(); x.moveTo(X(t0 + m), 22*dp); x.lineTo(X(t0 + m), (m % 60 ? 25 : 28)*dp); x.stroke(); }
      const done = c.st !== 'open' && c.st !== 'LOGGED';
      const mark = (v, l, col, up) => { const a = X(v); x.fillStyle = col; x.beginPath(); x.arc(a, 22*dp, 3.5*dp, 0, 7); x.fill(); x.fillText(l, Math.min(W - 60*dp, a - 2*dp), up ? 13*dp : 38*dp); };
      x.fillStyle = 'rgba(255,93,74,.18)'; x.fillRect(X(t0), 19*dp, X(done ? c.done : now) - X(t0), 6*dp);
      mark(t0, 'LOGGED ' + hm(t0), GR.amb, true); if (c.unit) mark(t0 + 2, 'UNIT', GR.ink, false); if (done) mark(c.done, c.st + ' ' + hm(c.done), GR.hi, true);
      if (!done && (t*2 | 0) % 2){ x.strokeStyle = GR.red; x.beginPath(); x.moveTo(X(now), 14*dp); x.lineTo(X(now), 30*dp); x.stroke(); }
      // the unit's range to the scene, sampled while the card is open
      const rs = SAMP.map(a => a[3]).filter(v => v !== null && v !== undefined), y0 = 46*dp, h = H - y0 - 4*dp, mx = Math.max(2, ...rs);
      x.strokeStyle = GR.faint; x.strokeRect(10*dp + .5, y0 + .5, W - 20*dp, h); x.fillStyle = GR.dim; x.fillText(c.unit ? 'UNIT RANGE TO SCENE · PL' : 'NO UNIT ASSIGNED', 14*dp, y0 + 10*dp);
      if (rs.length > 1){ x.strokeStyle = GR.amb; x.beginPath(); rs.slice(-80).forEach((v, k, a) => { const u = 10*dp + (W - 20*dp)*k/Math.max(1, a.length - 1), w2 = y0 + h - 2*dp - (h - 14*dp)*v/mx; k ? x.lineTo(u, w2) : x.moveTo(u, w2); }); x.stroke(); x.fillStyle = GR.hi; x.textAlign = 'right'; x.fillText(rs[rs.length - 1].toFixed(1) + ' PL', W - 14*dp, y0 + 10*dp); x.textAlign = 'left'; }
      const sy = y0 + h - 2*dp - (h - 14*dp)*.7/mx; x.strokeStyle = 'rgba(214,255,210,.35)'; x.setLineDash([3*dp, 3*dp]); x.beginPath(); x.moveTo(10*dp, sy); x.lineTo(W - 10*dp, sy); x.stroke(); x.setLineDash([]); x.fillStyle = GR.dim; x.fillText('ON SCENE', W - 60*dp, sy - 3*dp);
      return; }
    if (kind === 'stn'){ const k = D.stn.findIndex(q => q.m === SEL.m); if (k < 0) return; const mine = D.ofc.filter(o => o.stn === k), cx = H/2 + 6*dp, cy = H/2, rr = H/2 - 10*dp, n = Math.max(1, mine.length);
      mine.forEach((o, q) => { const a0 = -Math.PI/2 + q/n*Math.PI*2 + .03, a1 = -Math.PI/2 + (q + 1)/n*Math.PI*2 - .03; x.lineWidth = 7*dp; x.strokeStyle = o.st === 'RESPONDING' ? GR.red : o.st === 'ON BEAT' || o.st === 'EN ROUTE' ? GR.hi : onDuty(o) ? GR.ink : GR.faint; x.beginPath(); x.arc(cx, cy, rr, a0, a1); x.stroke(); });
      x.lineWidth = dp; x.fillStyle = GR.hi; x.textAlign = 'center'; x.font = (15*dp) + 'px JetBrains Mono, monospace'; x.fillText(String(mine.filter(onDuty).length), cx, cy + 3*dp); x.font = (7.5*dp) + 'px JetBrains Mono, monospace'; x.fillStyle = GR.dim; x.fillText('ON DUTY', cx, cy + 13*dp); x.textAlign = 'left';
      const a = t*1.4; x.strokeStyle = GR.dim; x.beginPath(); x.arc(cx, cy, rr - 9*dp, a, a + .5); x.stroke();
      const x0 = cx + rr + 18*dp, w = W - x0 - 6*dp, drs = D.dr.list.filter(q => q.stn === k), bks = D.bikes.filter(b => b.stn === k);
      const lights = (y, label, items, isOut, isHot) => { x.fillStyle = GR.dim; x.fillText(label, x0, y); items.forEach((it, q) => { const u = x0 + q*14*dp, on = isOut(it), hot = isHot(it), bl = hot && (t*3 | 0) % 2; x.fillStyle = hot ? (bl ? GR.red : 'rgba(255,93,74,.4)') : on ? GR.hi : GR.faint; x.fillRect(u, y + 5*dp, 10*dp, 10*dp); }); if (!items.length){ x.fillStyle = GR.faint; x.fillText('NONE', x0, y + 14*dp); } };
      lights(12*dp, 'DRONES · UP LIT · PURSUIT RED', drs, q => q.mode !== 'REST', q => q.mode === 'CHASE');
      lights(42*dp, 'BIKES · OUT LIT · RESPONDING RED', bks, b => b.ref.mode !== 'park', b => b.ref.mode === 'rush');
      const near = D.recent.filter(c => Math.hypot(c.x - SEL.m.x, c.z - SEL.m.z) < 10*LOT), byH = new Array(24).fill(0); for (const c of near) byH[Math.floor((c.c % 1440)/60)]++;
      const mx = Math.max(1, ...byH), y0 = 74*dp, h = H - y0 - 4*dp, hn = Math.floor(D.hour); x.fillStyle = GR.dim; x.fillText('CALLS NEAR BY HOUR', x0, y0 - 2*dp); byH.forEach((v, q) => { const bh = Math.max(dp, (h - 6*dp)*v/mx); x.fillStyle = q === hn ? GR.amb : v ? GR.ink : GR.faint; x.fillRect(x0 + q*w/24, y0 + h - bh, w/24 - dp, bh); });
      return; }
    if (kind === 'lidar'){ const cx = W/2, cy = H/2, rr = H/2 - 8*dp, f = D.lidar;
      for (const q of [1, .66, .33]){ x.strokeStyle = GR.faint; x.beginPath(); x.arc(cx, cy, rr*q, 0, 7); x.stroke(); }
      const k = (t*.6) % 1; x.strokeStyle = `rgba(143,220,149,${(.8*(1 - k)).toFixed(2)})`; x.beginPath(); x.arc(cx, cy, rr*k, 0, 7); x.stroke();
      x.lineWidth = 5*dp; x.strokeStyle = GR.faint; x.beginPath(); x.arc(cx, cy, rr + 1*dp, 0, 7); x.stroke(); x.strokeStyle = GR.hi; x.beginPath(); x.arc(cx, cy, rr + 1*dp, -Math.PI/2, -Math.PI/2 + f*Math.PI*2); x.stroke(); x.lineWidth = dp;
      x.fillStyle = GR.hi; x.textAlign = 'center'; x.font = (14*dp) + 'px JetBrains Mono, monospace'; x.fillText(Math.round(f*100) + '%', cx, cy + 4*dp); x.font = (7.5*dp) + 'px JetBrains Mono, monospace'; x.fillStyle = GR.dim; x.fillText('OF THE CITY', cx, cy + 14*dp); x.textAlign = 'left';
      return; }
  }
  /* ---------- the overhead scan: the city itself, seen from above, re-scanned twice a second ---------- */
  // Any card can turn the plan into an overhead scan of its subject: the city rendered from a camera of its own above it (as the person cam
  // draws its feed), turned to green phosphor with its edges traced bright. It's scanned again every half second, following the subject if it
  // moves; the reticle and the overlays are drawn every frame on top, where the subject is now. The wheel zooms the scan in and out.
  let srt = null, scam = null, sbuf = null, pmat = null, pscene = null, pcam = null;
  const SW = 640, SH = 400;
  // the phosphor look on the graphics card: luminance stretched about the scene's own average (the render's smallest mip), edges traced
  // bright, scan lines; drawn into a corner of the city's own canvas (hidden under the desk) and copied across, so nothing waits on a read-back
  function phosphorPass(){
    if (pmat) return pmat;
    pmat = new THREE.ShaderMaterial({ uniforms: { tex: { value: srt.texture }, px: { value: new THREE.Vector2(1/SW, 1/SH) } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `uniform sampler2D tex; uniform vec2 px; varying vec2 vU;
        float L(vec2 u){ return dot(texture2D(tex, u).rgb, vec3(.3, .59, .11)); }
        void main(){
          float avg = dot(textureLod(tex, vec2(.5), 12.).rgb, vec3(.3, .59, .11));
          float lo = avg*.3, hi = max(avg*2.8, .05), span = hi - lo;
          float l = clamp((L(vU) - lo)/span, 0., 1.);
          float ed = min(1., (abs(L(vU + vec2(px.x, 0.)) - L(vU - vec2(px.x, 0.))) + abs(L(vU + vec2(0., px.y)) - L(vU - vec2(0., px.y))))/span*1.6);
          float v = .08 + .55*pow(l, .9) + .55*ed; if (mod(gl_FragCoord.y, 3.) < 1.) v *= .72; v = min(1., v);
          gl_FragColor = vec4((40.*v + 150.*ed*v)/255., 230.*v/255., (70.*v + 120.*ed*v)/255., 1.); }` });
    pscene = new THREE.Scene(); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pmat); q.frustumCulled = false; pscene.add(q); pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return pmat;
  }
  function snap(x, y, z, half){
    const gpu = MRT && renderer.domElement.width >= SW && renderer.domElement.height >= SH;
    if (!srt){ srt = new THREE.WebGLRenderTarget(SW, SH, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }); scam = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR); scam.layers.enableAll(); scam.layers.disable(6); }
    const asp = SW/SH; scam.left = -half*asp; scam.right = half*asp; scam.top = half; scam.bottom = -half; scam.updateProjectionMatrix();
    const pt = 52*PI/180, yw = safe(() => yaw, .7), cp = Math.cos(pt);
    scam.position.set(x + Math.sin(yw)*cp*CAM_DIST, y + Math.sin(pt)*CAM_DIST, z + Math.cos(yw)*cp*CAM_DIST); scam.lookAt(x, y, z); scam.updateMatrixWorld();
    const res0 = FOL_UNI.res.value.clone(), rt0 = renderer.getRenderTarget(), all0 = SIDE_ARC.all, ac = renderer.autoClear, vp0 = new THREE.Vector4(); renderer.getViewport(vp0);
    const cvs = document.createElement('canvas'); cvs.width = SW; cvs.height = SH; const cx = cvs.getContext('2d', gpu ? undefined : { willReadFrequently: true }); let ok = false;
    try {
      scene.updateMatrixWorld();   // (the city's matrices are brought up to date once a frame by its own loop, which isn't drawing under the desk)
      FOL_UNI.res.value.set(SW, SH); SIDE_ARC.all = true; cullFrame(scam); CULL.lvl = -1; CULL.sd = false;
      if (typeof pplFeedPre === 'function') pplFeedPre(scam); if (typeof bikeFeedPre === 'function') bikeFeedPre(scam);
      renderer.setRenderTarget(srt); renderer.setClearColor(0x020604, 1); renderer.autoClear = true; renderer.render(scene, scam);
      if (gpu){ phosphorPass(); const pr = renderer.getPixelRatio(); renderer.setRenderTarget(null); renderer.setViewport(0, 0, SW/pr, SH/pr); renderer.render(pscene, pcam);
        cx.drawImage(renderer.domElement, 0, renderer.domElement.height - SH, SW, SH, 0, 0, SW, SH); ok = true; }
      else { if (!sbuf) sbuf = new Uint8Array(SW*SH*4); renderer.readRenderTargetPixels(srt, 0, 0, SW, SH, sbuf); }
    } catch (e){ console.warn('precinct: scan', e); }
    finally { if (typeof pplFeedPost === 'function') pplFeedPost(); if (typeof bikeFeedPost === 'function') bikeFeedPost();
      FOL_UNI.res.value.copy(res0); SIDE_ARC.all = all0; renderer.autoClear = ac; renderer.setRenderTarget(rt0); renderer.setViewport(vp0.x, vp0.y, vp0.z, vp0.w); safe(() => { sideArc(); cullFrame(); }); }
    if (!ok && sbuf){   // (no WebGL2, or a canvas smaller than the scan: the same look worked out here instead)
      const buf = sbuf, L = new Float32Array(SW*SH); for (let y2 = 0; y2 < SH; y2++) for (let x2 = 0; x2 < SW; x2++){ const q = ((SH - 1 - y2)*SW + x2)*4; L[y2*SW + x2] = .3*buf[q] + .59*buf[q + 1] + .11*buf[q + 2]; }
      const hs = new Uint32Array(256); for (const v of L) hs[v | 0]++; let lo = 0, hi = 255, acc = 0; for (let k = 0; k < 256; k++){ acc += hs[k]; if (acc < L.length*.02) lo = k; if (acc < L.length*.985) hi = k; }
      const im = cx.createImageData(SW, SH), D2 = im.data, span = Math.max(20, hi - lo);
      for (let y2 = 1; y2 < SH - 1; y2++) for (let x2 = 1; x2 < SW - 1; x2++){ const k = y2*SW + x2, l = Math.max(0, Math.min(1, (L[k] - lo)/span));
        const ed = Math.min(1, (Math.abs(L[k + 1] - L[k - 1]) + Math.abs(L[k + SW] - L[k - SW]))/span*1.6);
        let v = .08 + .55*Math.pow(l, .9) + .55*ed; if (y2 % 3 === 0) v *= .72; v = Math.min(1, v);
        const o = k*4; D2[o] = 40*v + 150*ed*v; D2[o + 1] = 230*v; D2[o + 2] = 70*v + 120*ed*v; D2[o + 3] = 255; }
      cx.putImageData(im, 0, 0); }
    const pm = scam.projectionMatrix.clone(), mw = scam.matrixWorldInverse.clone(), V = new THREE.Vector3(), P = (wx, wy, wz) => { V.set(wx, wy, wz).applyMatrix4(mw).applyMatrix4(pm); return [(V.x*.5 + .5)*SW, (1 - (V.y*.5 + .5))*SH]; };
    return { img: cvs, P };
  }
  const HALF = { cop: 6, person: 6, call: 7, drone: 10, bike: 7, plot: 6, stn: 9, lidar: 14, mega: 9 };
  function scanOn(){ if (!SEL) return; const h = SEL.type === 'sector' ? Math.max(8, (secBox(SEL.name).i1 - secBox(SEL.name).i0 + 1)*LOT*.65) : SEL.m ? Math.max(HALF[SEL.type] || 8, Math.max(SEL.m.w, SEL.m.h)*LOT*.8) : HALF[SEL.type] || 8;
    VIEW = { half: h, half0: h }; SNAP = null; hov = null; const tip = $('.tip'); if (tip) tip.style.display = 'none'; card(); }
  function drawView(t, now){
    const W = F.W, H = F.H, dp = F.dp;
    const pos = posOf(SEL); if (!pos){ VIEW = null; card(); return; }
    if (!SNAP || now > SNAP.due){ const t0 = performance.now(), sn = snap(pos[0], CURB, pos[1], VIEW.half); SNAP = Object.assign(sn, { at: SNAP ? SNAP.at : now, prev: SNAP ? SNAP.img : null, swapAt: now, due: now + Math.max(500, (performance.now() - t0)*4), ms: performance.now() - t0, x: pos[0], z: pos[1], half: VIEW.half }); }
    const S2 = SNAP;
    g.fillStyle = '#020604'; g.fillRect(0, 0, W, H);
    const k = Math.min(W/SW, H/SH), w = SW*k, h = SH*k, ox = (W - w)/2, oy = (H - h)/2, Q = (x, y, z) => { const [a, b] = S2.P(x, y, z); return [ox + a*k, oy + b*k]; };
    // the first scan builds up line by line; after that each new one fades in over the last
    const u = Math.min(1, (now - S2.at)/700); g.save(); g.beginPath(); g.rect(ox, oy, w, h*u); g.clip();
    const fa = Math.min(1, (now - S2.swapAt)/180); if (S2.prev && fa < 1){ g.drawImage(S2.prev, ox, oy, w, h); g.globalAlpha = fa; } g.drawImage(S2.img, ox, oy, w, h); g.globalAlpha = 1; g.restore();
    const by = oy + ((t*.12) % 1)*h; const gr = g.createLinearGradient(0, by - 30*dp, 0, by); gr.addColorStop(0, 'rgba(143,220,149,0)'); gr.addColorStop(1, 'rgba(143,220,149,.12)'); g.fillStyle = gr; g.fillRect(ox, by - 30*dp, w, 30*dp);
    g.strokeStyle = 'rgba(143,220,149,.35)'; g.lineWidth = dp; g.strokeRect(ox + .5, oy + .5, w - 1, h - 1);
    for (const [x0, y0, sx, sy] of [[ox, oy, 1, 1], [ox + w, oy, -1, 1], [ox, oy + h, 1, -1], [ox + w, oy + h, -1, -1]]){ g.strokeStyle = '#d6ffd2'; g.beginPath(); g.moveTo(x0 + sx*18*dp, y0); g.lineTo(x0, y0); g.lineTo(x0, y0 + sy*18*dp); g.stroke(); }
    g.save(); g.beginPath(); g.rect(ox, oy, w, h); g.clip();
    const [cx, cy] = Q(pos[0], CURB + .5, pos[1]), rr = (16 + 3*Math.sin(t*4))*dp;
    // what's around, where it is now: drone routes, the call's unit, the sector's box, other units nearby
    if (SEL.type === 'drone'){ const d = droneOf(SEL.id), way = d ? d.ref.way || [] : []; if (way.length){ g.strokeStyle = '#d6ffd2'; g.setLineDash([6*dp, 4*dp]); g.beginPath(); let [a, b] = Q(pos[0], CURB, pos[1]); g.moveTo(a, b); for (const wp of way){ [a, b] = Q(wp.x, CURB, wp.z); g.lineTo(a, b); } g.stroke(); g.setLineDash([]);
      way.forEach((wp, q) => { const [a2, b2] = Q(wp.x, CURB, wp.z); g.strokeRect(a2 - 4*dp, b2 - 4*dp, 8*dp, 8*dp); g.fillStyle = '#d6ffd2'; g.font = (9*dp) + 'px JetBrains Mono, monospace'; g.fillText('W' + (q + 1), a2 + 6*dp, b2 - 4*dp); }); } }
    if (SEL.type === 'call' && SEL.c.unit){ const o = D.ofc.find(q => q.id === SEL.c.unit), p = live.cop(SEL.c.unit); if (o && p){ const [a, b] = Q(p[0], CURB + .5, p[1]); g.strokeStyle = 'rgba(255,176,58,.9)'; g.setLineDash([4*dp, 4*dp]); g.beginPath(); g.moveTo(a, b); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffb03a'; g.beginPath(); g.arc(a, b, 4*dp, 0, 7); g.fill(); g.font = (9*dp) + 'px JetBrains Mono, monospace'; g.fillText(o.b, a + 7*dp, b - 5*dp); } }
    if (SEL.type === 'sector'){ const bx = secBox(SEL.name), cs = [[bx.i0 - .5, bx.j0 - .5], [bx.i1 + .5, bx.j0 - .5], [bx.i1 + .5, bx.j1 + .5], [bx.i0 - .5, bx.j1 + .5]].map(([i, j]) => Q(i*LOT, CURB, j*LOT));
      g.strokeStyle = '#d6ffd2'; g.setLineDash([5*dp, 4*dp]); g.beginPath(); cs.forEach(([a, b], q) => q ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.stroke(); g.setLineDash([]); }
    for (const c of D.recent){ const [a, b] = Q(c.x, CURB, c.z); if (a < ox || b < oy || a > ox + w || b > oy + h) continue; g.strokeStyle = c.st === 'open' ? '#ff5d4a' : c.src === 'case' ? '#ffb03a' : 'rgba(214,255,210,.6)'; g.lineWidth = 1.2*dp; g.beginPath(); g.moveTo(a - 5*dp, b - 5*dp); g.lineTo(a + 5*dp, b + 5*dp); g.moveTo(a + 5*dp, b - 5*dp); g.lineTo(a - 5*dp, b + 5*dp); g.stroke(); }
    g.font = (8.5*dp) + 'px JetBrains Mono, monospace';
    for (const o of D.ofc){ if (!onMap(o) || o.id === SEL.id) continue; const p = live.cop(o.id); if (!p) continue; const [a, b] = Q(p[0], CURB + .5, p[1]); if (a < ox || b < oy || a > ox + w || b > oy + h) continue; g.strokeStyle = o.st === 'RESPONDING' ? '#ff5d4a' : '#d6ffd2'; g.lineWidth = dp; g.strokeRect(a - 5*dp, b - 5*dp, 10*dp, 10*dp); g.fillStyle = '#d6ffd2'; g.fillText(o.b, a + 7*dp, b - 6*dp); }
    for (const d of D.dr.list){ if (SEL.id === d.id) continue; const p = d.ref.pos, [a, b] = Q(p.x, p.y, p.z); if (a < ox || b < oy || a > ox + w || b > oy + h) continue; g.strokeStyle = '#d6ffd2'; g.beginPath(); g.moveTo(a - 6*dp, b); g.lineTo(a, b - 6*dp); g.lineTo(a + 6*dp, b); g.lineTo(a, b + 6*dp); g.closePath(); g.stroke(); g.fillStyle = '#d6ffd2'; g.fillText(d.id, a + 8*dp, b - 6*dp); }
    // the reticle on the subject, where it is this frame
    if (SEL.type !== 'sector'){ g.strokeStyle = SEL.type === 'call' ? '#ff5d4a' : '#d6ffd2'; g.lineWidth = 1.4*dp; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
      for (let q = 0; q < 4; q++){ const a = q*Math.PI/2 + t*.6; g.beginPath(); g.moveTo(cx + Math.cos(a)*(rr + 4*dp), cy + Math.sin(a)*(rr + 4*dp)); g.lineTo(cx + Math.cos(a)*(rr + 12*dp), cy + Math.sin(a)*(rr + 12*dp)); g.stroke(); }
      g.lineWidth = dp; g.setLineDash([2*dp, 4*dp]); g.beginPath(); g.moveTo(ox, cy); g.lineTo(cx - rr - 14*dp, cy); g.moveTo(cx + rr + 14*dp, cy); g.lineTo(ox + w, cy); g.moveTo(cx, oy); g.lineTo(cx, cy - rr - 14*dp); g.moveTo(cx, cy + rr + 14*dp); g.lineTo(cx, oy + h); g.stroke(); g.setLineDash([]); }
    g.restore();
    g.fillStyle = 'rgba(214,255,210,.85)'; g.font = (9.5*dp) + 'px JetBrains Mono, monospace';
    g.fillText('OVERHEAD SCAN · ' + sector(pos[0], pos[1]) + ' · ' + (pos[0]/LOT).toFixed(1) + ', ' + (pos[1]/LOT).toFixed(1) + ' · ' + Math.round(VIEW.half*2/LOT) + ' PLOTS ACROSS · WHEEL ZOOMS', ox + 10*dp, oy + h - 10*dp);
    g.fillText('LIVE ' + hm(D.now) + ' · SCAN ' + Math.max(0, Math.round((S2.due - now)/100)/10).toFixed(1) + ' S', ox + 10*dp, oy + 16*dp); if ((t*2 | 0) % 2){ g.fillStyle = '#ff5d4a'; g.beginPath(); g.arc(ox + w - 14*dp, oy + 12*dp, 3.5*dp, 0, 7); g.fill(); }
  }
  /* ---------- in and out ---------- */
  function follow(id){ close(() => { try { if (MON.ready()) MON.open(id); } catch (e){ console.warn('precinct: follow', e); } }); }
  PD.show = m => {
    if (PD.open || PD.busy) return; PD.busy = true; build(); tick();
    safe(() => { if (MON.id) MON.close(); }); safe(() => music.hold && music.hold(true)); safe(() => PERF.quiet(4000));
    PD.open = true; PD.hold = true; SEL = null; hov = null; VIEW = null; SNAP = null; TRAIL.clear(); SAMP.length = 0; lastT = 0; slowD = null;
    D = read(true); D.sig = ''; dataAt = slowAt = performance.now(); fit(); dom();
    requestAnimationFrame(() => { if (!PD.open) return; setup(); if (m){ const st = D.stn.find(q => q.m === m); if (st && D.stn.length > 1) select({ type: 'stn', m }, false); } raf = requestAnimationFrame(loop); PD.busy = false; });
    keyH = e => { if (!PD.open) return; e.stopPropagation();
      if (e.key === 'Escape'){ if (VIEW){ VIEW = null; SNAP = null; card(); } else if (SEL) select(null); else close(); }
      else if (e.key === '+' || e.key === '='){ zoomBy('in'); } else if (e.key === '-' || e.key === '_'){ zoomBy('out'); } else if (e.key === '0'){ zoomBy('fit'); } };
    addEventListener('keydown', keyH, true);
    resH = () => { if (PD.open && root) setup(); }; addEventListener('resize', resH);
  };
  function close(then){
    if (!PD.open) return; PD.hold = false; safe(() => music.hold && music.hold(false)); safe(() => PERF.quiet(2500));
    cancelAnimationFrame(raf); if (keyH) removeEventListener('keydown', keyH, true); keyH = null; if (resH) removeEventListener('resize', resH); resH = null; removeEventListener('mouseup', upH);
    const r = root; root = null; base = null; baseAt = null; g = null; F = null; cv = null; PD.open = false; VIEW = null; SNAP = null; SEL = null; if (srt){ srt.dispose(); srt = null; } if (pmat){ pmat.dispose(); pmat = null; pscene = null; }
    if (r){ r.classList.remove('in'); r.classList.add('out'); setTimeout(() => r.remove(), 360); }
    if (typeof then === 'function') setTimeout(then, 60);
  }
  PD.close = close; PD._R = () => R; PD._read = read; PD._xy = (x, z) => { if (!F) return null; const [a, b] = F.P(x, z), r = cv.getBoundingClientRect(); return [r.left + a/F.dp, r.top + b/F.dp]; }; PD._dbg = () => ({ ms: SNAP && SNAP.ms, k: VT.k, sel: SEL && SEL.type, view: !!VIEW });
  // a double click on a police station: the pointer's ray against its whole height
  const _r = new THREE.Raycaster(), _n = new THREE.Vector2(), _b = new THREE.Box3(), _h = new THREE.Vector3();
  function stationAt(cx, cy){
    const r = canvas.getBoundingClientRect(); _n.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1); _r.setFromCamera(_n, cam);
    let best = null, bd = Infinity;
    for (const m of stations()){ const hx = m.w*LOT/2 - .3, hz = m.h*LOT/2 - .3; _b.min.set(m.x - hx, CURB, m.z - hz); _b.max.set(m.x + hx, (m.top || 8), m.z + hz);
      if (_r.ray.intersectBox(_b, _h)){ const d = _h.distanceTo(_r.ray.origin); if (d < bd){ bd = d; best = m; } } }
    return best;
  }
  canvas.addEventListener('dblclick', e => {
    if (PD.open || PD.busy) return; if (typeof OVERSEER !== 'undefined' && (OVERSEER.open || OVERSEER.busy)) return;
    if (typeof hwMode !== 'undefined' && (hwMode || mtMode || megaPick || delMode)) return; if (typeof FURN !== 'undefined' && (FURN.pick || FURN.open)) return;
    const m = stationAt(e.clientX, e.clientY); if (m){ e.preventDefault(); PD.show(m); }
  });
  return PD;
})();
