// Neon Terrarium: the Precinct desk. Double-click a police station and its operations screen comes up over the city, in the style of a
// survey terminal (green phosphor on black, hairline grids, coded panels, dense tables): the call log, the units on shift by badge number,
// the drones' rounds and the points they've scanned, where the trouble is (hotspots by sector and by hour), the stations, and the case
// files, coded, never named, each with its stage, its last logged activity and the lead the desk would chase next. At its heart a 2D plan
// of the city with all of it on: click an officer to follow them on the person cam, a call to take the camera there, a drone to trace its
// route. The city holds still while the desk is open.
// The calls: the city's real ones (street robberies on the dark streets, the case moments, see people.js and cityledger.js) and the
// everyday ones a precinct takes (noise, shoplifting, pickpockets, disturbances, fare dodging, break-ins), made up from where people actually
// are, a few an hour, more at night. They're kept with the city (localStorage 'neonIsland.precinct', one of the city's keys: saveguard.js).
// All game scripts share one scope and load in order (see index.html); this one loads after cityledger.js and overseer.js.
'use strict';
const PRECINCT = (() => {
  const PD = { open: false, hold: false, busy: false };
  const KEY = 'neonIsland.precinct', MAXC = 320;
  const safe = (f, d) => { try { const v = f(); return v === undefined || Number.isNaN(v) ? d : v; } catch (e) { return d; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const p2 = n => String(Math.floor(n)).padStart(2, '0');
  const clock = () => safe(() => STORY.clock, 0);
  const tc = c => 'D' + (Math.floor(c/1440) + 1) + ' ' + p2((c % 1440)/60) + ':' + p2(c % 60);
  const hm = c => p2((c % 1440)/60) + ':' + p2(c % 60);
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
    if (PD.hold || typeof pplReady === 'undefined' || !pplReady) return;
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
      (st.drones || []).forEach((d, q) => out.push({ id: 'D-' + (k + 1) + p2(q + 1), stn: k, mode: String(d.mode || 'rest').toUpperCase(), x: d.pos.x, z: d.pos.z, way: (d.way || []).map(w => [w.x, w.z]), sec: sector(d.pos.x, d.pos.z) })); }); });
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
  function read(){
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
    const lidar = safe(() => { const L = megasOfKind('lidar'); if (!L.length) return 0; let n = 0, k = 0; for (const c of cells.values()){ n++; if (lidarCovers(c.x, c.z)) k++; } return n ? k/n : 0; }, 0);
    const closed = today.filter(c => c.st !== 'open' && c.st !== 'LOGGED').length;
    const arrToday = today.filter(c => c.st === 'ARREST').length;
    const last = calls.find(c => c.pri <= 2 && c.src !== 'case') || calls[0] || null;
    return { now, calls, today, recent, hot, byHour, ofc, dr, stn, lidar, closed, arrToday, last, cs: cases(), hour: (now % 1440)/60, day: day0 + 1,
      bikes: safe(() => POLICE_BIKES.map(b => ({ x: b.x, z: b.z, path: b.path && b.mode !== 'park' ? b.path.pts : null })), []) };
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
  #prec .bt { grid-column:1/-1; display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1.45fr); gap:6px; min-height:0; }
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
  #prec.in > * { animation:pdIn .5s steps(6) both; } @keyframes pdIn { from { opacity:0; clip-path:inset(0 0 100% 0); } to { opacity:1; clip-path:inset(0); } }
  #prec.out { animation:pdOut .35s steps(4) both; } @keyframes pdOut { to { opacity:0; clip-path:inset(48% 0 48% 0); } }
  @media (max-width:1000px){ #prec { grid-template-columns:1fr; grid-template-rows:42px 52vh auto auto auto 22px; overflow:auto; } #prec .map { grid-row:auto; height:52vh; } #prec .bt { grid-template-columns:1fr; } }
  `;
  let root = null, cv = null, g = null, D = null, raf = 0, keyH = null, resH = null, sel = null, hov = null, F = null, base = null;
  const $ = q => root.querySelector(q);
  function build(){ if (document.getElementById('precCss')) return; const st = document.createElement('style'); st.id = 'precCss'; st.textContent = css; document.head.appendChild(st); }
  function dom(){
    const d = D, onDuty = d.ofc.filter(o => o.st !== 'OFF SHIFT' && o.st !== 'STOOD DOWN' && o.st !== 'GOING HOME').length, beat = d.ofc.filter(o => o.st === 'ON BEAT' || o.st === 'RESPONDING' || o.st === 'EN ROUTE').length;
    const air = d.dr.list.filter(x => x.mode !== 'REST').length, openCalls = d.calls.filter(c => c.st === 'open').length;
    const callRows = d.calls.slice(0, 60).map(c => `<tr class="click" data-call="${c.id}"><td>${String(c.id).padStart(5, '0')}</td><td>${tc(c.c)}</td><td class="pri${c.pri}">P${c.pri}</td><td>${esc(c.kind)}${c.file ? ' <span class="amb">' + c.file + '</span>' : ''}</td><td>${c.sec}</td><td>${c.unit ? badge(c.unit) : '<span class="dim">----</span>'}</td><td class="st-${c.st}">${c.st === 'open' ? 'OPEN' : c.st}</td></tr>`).join('');
    const ofRows = d.ofc.map(o => `<tr class="click" data-cop="${esc(o.id)}"><td class="hi">${o.b}</td><td>${o.unit}</td><td>${o.shift}</td><td class="${o.st === 'RESPONDING' ? 'red' : o.st === 'ON BEAT' ? 'hi' : o.st === 'OFF SHIFT' || o.st === 'STOOD DOWN' || o.st === 'GOING HOME' ? 'dim' : ''}">${o.st}</td><td>${o.sec}</td></tr>`).join('');
    const drRows = d.dr.list.map(x => `<tr class="click" data-drone="${x.id}"><td class="hi">${x.id}</td><td>STN-${p2(x.stn + 1)}</td><td class="${x.mode === 'CHASE' ? 'red' : x.mode === 'REST' ? 'dim' : ''}">${x.mode === 'REST' ? 'DOCKED' : x.mode === 'CHASE' ? 'PURSUIT' : x.mode === 'FLY' ? 'SWEEP' : x.mode === 'HOME' ? 'RTB' : x.mode}</td><td>${x.way.length}</td><td>${x.sec}</td></tr>`).join('');
    const maxH = Math.max(1, ...d.byHour), hNow = Math.floor(d.hour);
    const maxS = Math.max(1, ...d.hot.map(h => h[1]));
    const cfs = d.cs.out.map((f, k) => `<div class="cf"><div class="l1"><b>${f.file}</b><span class="${f.major ? 'amb' : 'dim'}">${f.major ? 'MAJOR' : 'LINKED'}</span><span class="dim">${f.major ? 'DAY ' + Math.min(21, f.done + 1) + '/21' : 'STAGE ' + Math.min(f.total, f.done + 1) + '/' + f.total}</span><span style="margin-left:auto">${f.closed ? '<span class="hi">CLOSED</span>' : 'OPEN'}</span></div>
        <div class="pg">${Array.from({ length: Math.min(40, f.total) }, (_, q) => `<i class="${q < Math.round(f.done/f.total*Math.min(40, f.total)) ? 'on' : ''}"></i>`).join('')}</div>
        <div class="dim">LAST ACTIVITY ${f.last ? tc(f.last.c) + ' · ' + esc(String(f.last.place || '').toUpperCase()) + ' · ' + sector(f.last.x, f.last.z) : 'NONE LOGGED'}</div>
        ${f.lead ? `<div class="ld">LEAD <em>${esc(f.lead.when)}</em> · ${esc(f.lead.where)}${f.lead.who ? ' · ' + esc(String(f.lead.desc).toUpperCase()) + `<button data-watch="${esc(f.lead.who)}">WATCH</button>` : ''}</div>` : ''}</div>`).join('');
    const tickTxt = d.calls.slice(0, 14).map(c => `${hm(c.c)} ${c.sec} ${c.kind}${c.unit ? ' · ' + badge(c.unit) : ''} · ${c.st === 'open' ? 'OPEN' : c.st}`).join('   //   ') || 'NO TRAFFIC';
    root = document.createElement('div'); root.id = 'prec'; root.className = 'in'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Precinct desk');
    root.innerHTML = `
      <div class="top"><div><small>PRECINCT</small><b>OPERATIONS DESK</b></div><div><small>STATIONS ${d.stn.length}</small><b>${d.stn.map(s => 'STN-' + p2(s.n)).join(' · ') || 'NONE'}</b></div>
        <div><small>DAY ${d.day} · CITY TIME</small><span class="clk">${hm(d.now)}</span></div>
        <div><small>UNITS ON DUTY · OUT</small><b>${onDuty} · ${beat}</b></div><div><small>CALLS TODAY · OPEN</small><b>${d.today.length} · <span class="${openCalls ? 'warn' : ''}">${openCalls}</span></b></div>
        <div><small>ARRESTS TODAY · TOTAL</small><b>${d.arrToday} · ${R.arrests}</b></div><div><small>DRONES UP · POINTS SCANNED</small><b>${air}/${d.dr.list.length} · ${d.dr.scans}</b></div>
        <div><small>LIDAR COVER</small><b>${Math.round(d.lidar*100)}%</b></div><div class="sp"></div><button class="close" type="button">CLOSE · ESC</button></div>
      <div class="pn map"><div class="h"><b>A · CITY PLAN</b><span>CALLS 72 H · UNITS · DRONE ROUTES · HOTSPOTS</span><span class="r">${B.ni} × ${B.nj} PLOTS · N ↑ · CLICK A UNIT TO FOLLOW · A CALL TO GO THERE</span></div><canvas></canvas><div class="tip"></div>
        <div class="lg"><span><i style="background:var(--hi);border-radius:50%"></i>OFFICER</span><span><i style="background:var(--red);border-radius:50%"></i>RESPONDING</span><span><i style="border:1px solid var(--ink)"></i>DRONE · ROUTE</span>
          <span><i style="background:var(--amb);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></i>CASE</span><span><i style="background:var(--ink);clip-path:polygon(0 40%,100% 40%,100% 60%,0 60%)"></i>CALL</span><span><i style="background:rgba(255,93,74,.4)"></i>HOTSPOT</span><span><i style="border:1px dashed var(--dim);border-radius:50%"></i>LIDAR</span></div></div>
      <div class="rt">
        <div class="pn"><div class="h"><b>B · CALL LOG</b><span>LAST ${Math.min(60, d.calls.length)} OF ${d.calls.length}</span><span class="r">LAST P1-P2: ${d.last ? esc(d.last.kind) + ' · ' + d.last.sec + ' · ' + tc(d.last.c) : 'NONE'}</span></div>
          <div class="tw">${d.calls.length ? `<table><colgroup><col style="width:46px"><col style="width:76px"><col style="width:26px"><col><col style="width:30px"><col style="width:46px"><col style="width:72px"></colgroup>
            <tr><th>ID</th><th>TIME</th><th>PRI</th><th>TYPE</th><th>SEC</th><th>UNIT</th><th>STATUS</th></tr>${callRows}</table>` : `<div class="empty">No calls on record yet.${d.stn.length ? '' : ' A police station has to stand in the city.'}</div>`}</div></div>
      </div>
      <div class="bt">
          <div class="pn"><div class="h"><b>C · UNITS</b><span>${d.ofc.length} SWORN</span><span class="r">CLICK TO FOLLOW</span></div>
            <div class="tw"><table><colgroup><col style="width:46px"><col style="width:60px"><col style="width:46px"><col><col style="width:28px"></colgroup><tr><th>BADGE</th><th>CALLSIGN</th><th>SHIFT</th><th>STATUS</th><th>SEC</th></tr>${ofRows}</table></div></div>
          <div class="pn"><div class="h"><b>D · DRONE OPS</b><span>COVER ${Math.round(d.dr.cov*100)}%</span><span class="r">${d.dr.pts.length} PTS / 10 MIN</span></div>
            <div class="tw"><table><colgroup><col style="width:44px"><col style="width:52px"><col><col style="width:26px"><col style="width:28px"></colgroup><tr><th>ID</th><th>BASE</th><th>MODE</th><th>WPT</th><th>SEC</th></tr>${drRows}</table>
            <div class="kv" style="margin-top:6px">${d.stn.map(s => `<span>STN-${p2(s.n)} · ${s.sec}</span><span>${s.staff} STAFF · ${s.out} OUT · ${s.drones} DRN</span>`).join('')}</div></div></div>
        </div>
      <div class="tick"><span class="k">COMMS</span><span class="run">${esc(tickTxt)}</span></div>`;
    // the bottom right: hotspots and case files share the lower right (under the call log)
    const bt = root.querySelector('.bt');
    const hp = document.createElement('div'); hp.className = 'pn'; hp.innerHTML = `<div class="h"><b>E · HOTSPOTS</b><span>72 H</span><span class="r">BY HOUR · NOW ${p2(hNow)}:00</span></div>
      ${d.hot.length ? d.hot.map(([s, n]) => `<div style="display:grid;grid-template-columns:28px 1fr 22px;gap:6px;align-items:center"><span class="hi">${s}</span><span><span class="bar" style="width:${(100*n/maxS).toFixed(0)}%"></span></span><span style="text-align:right">${n}</span></div>`).join('') : '<div class="empty">NO CALLS IN 72 H</div>'}
      <div class="hist">${d.byHour.map((n, h) => `<i class="${h === hNow ? 'now' : ''}" style="height:${(100*n/maxH).toFixed(0)}%"></i>`).join('')}</div><div class="hx"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`;
    const cp = document.createElement('div'); cp.className = 'pn'; cp.innerHTML = `<div class="h"><b>F · CASE FILES</b><span>${d.cs.open ? 'CASE DAY ' + d.cs.day + ' / 21' : 'NONE ACTIVE'}</span><span class="r">${d.cs.heat !== null && d.cs.heat !== undefined ? 'PRESSURE ' + Math.round(d.cs.heat*100) + '%' : ''}</span></div>
      <div class="tw">${cfs || '<div class="empty">No case files open. When a case opens, its file shows here: coded, with its stage, the last logged activity and the next lead.</div>'}</div>`;
    bt.appendChild(hp); bt.appendChild(cp);
    document.body.appendChild(root);
    $('.close').addEventListener('click', close);
    root.addEventListener('click', e => {
      const w = e.target.closest('[data-watch]'); if (w){ follow(w.dataset.watch); return; }
      const r = e.target.closest('tr.click'); if (!r) return;
      if (r.dataset.cop) follow(r.dataset.cop);
      else if (r.dataset.call){ const c = R.calls.find(q => q.id === +r.dataset.call); if (c) goTo(c.x, c.z); }
      else if (r.dataset.drone){ sel = sel === r.dataset.drone ? null : r.dataset.drone; root.querySelectorAll('tr[data-drone]').forEach(t => t.classList.toggle('sel', t.dataset.drone === sel)); drawBase(); }
    });
  }
  /* the plan */
  function setup(){
    cv = $('.map canvas'); const r = cv.getBoundingClientRect(), dp = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(10, r.width*dp); cv.height = Math.max(10, r.height*dp); g = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 26*dp, s = Math.min((W - 2*pad)/(B.ni*LOT), (H - 2*pad)/(B.nj*LOT)), ox = (W - B.ni*LOT*s)/2 - (B.i0 - .5)*LOT*s, oz = (H - B.nj*LOT*s)/2 - (B.j0 - .5)*LOT*s;
    F = { dp, s, P: (x, z) => [ox + x*s, oz + z*s] }; drawBase();
    cv.addEventListener('mousemove', e => { const rr = cv.getBoundingClientRect(); hov = pickMap((e.clientX - rr.left)*F.dp, (e.clientY - rr.top)*F.dp); const tip = $('.tip');
      if (hov){ tip.style.display = 'block'; tip.style.left = (e.clientX - rr.left + 12) + 'px'; tip.style.top = (e.clientY - rr.top + 26) + 'px'; tip.textContent = hov.label; } else tip.style.display = 'none'; });
    cv.addEventListener('mouseleave', () => { hov = null; $('.tip').style.display = 'none'; });
    cv.addEventListener('click', () => { if (!hov) return; if (hov.cop) follow(hov.cop); else if (hov.call) goTo(hov.call.x, hov.call.z); else if (hov.drone){ sel = sel === hov.drone ? null : hov.drone; root.querySelectorAll('tr[data-drone]').forEach(t => t.classList.toggle('sel', t.dataset.drone === sel)); drawBase(); } });
  }
  function drawBase(){
    const W = cv.width, H = cv.height, dp = F.dp, s = F.s, P = F.P;
    base = document.createElement('canvas'); base.width = W; base.height = H; const b = base.getContext('2d');
    b.fillStyle = '#030805'; b.fillRect(0, 0, W, H);
    // the grid: a fine one every plot, a heavier one per sector, labels round the edge
    b.strokeStyle = 'rgba(143,220,149,.06)'; b.lineWidth = dp;
    for (let i = B.i0; i <= B.i1 + 1; i++){ const [x] = P((i - .5)*LOT, 0); b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
    for (let j = B.j0; j <= B.j1 + 1; j++){ const [, y] = P(0, (j - .5)*LOT); b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    b.strokeStyle = 'rgba(143,220,149,.18)'; b.font = (8.5*dp) + 'px JetBrains Mono, monospace'; b.fillStyle = 'rgba(143,220,149,.45)';
    for (let k = 0; k <= 8; k++){ const [x] = P((B.i0 - .5 + k*B.ni/8)*LOT, 0); b.beginPath(); b.setLineDash([2*dp, 4*dp]); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); if (k < 8) b.fillText('ABCDEFGH'[k], x + 4*dp, 12*dp); }
    for (let k = 0; k <= 6; k++){ const [, y] = P(0, (B.j0 - .5 + k*B.nj/6)*LOT); b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); if (k < 6) b.fillText(String(k + 1), 4*dp, y + 12*dp); }
    b.setLineDash([]);
    // the hotspots: calls of the last 72 hours, as a soft red heat
    for (const c of D.recent){ const [x, y] = P(c.x, c.z), r = (c.pri <= 2 ? 34 : 24)*dp*Math.max(.6, s/4), gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,93,74,.16)'); gr.addColorStop(1, 'rgba(255,93,74,0)'); b.fillStyle = gr; b.fillRect(x - r, y - r, 2*r, 2*r); }
    // plots and structures
    safe(() => { for (const c of cells.values()){ if (c.mega) continue; const [x, y] = P(c.x - LOT/2 + .2, c.z - LOT/2 + .2), w = (LOT - .4)*s, lv = c.sections.length;
      b.fillStyle = lv ? `rgba(143,220,149,${.05 + .05*Math.min(4, lv)})` : c.wall ? 'rgba(143,220,149,.25)' : 'rgba(143,220,149,.025)'; b.fillRect(x, y, w, w);
      if (lv){ b.strokeStyle = 'rgba(143,220,149,.22)'; b.strokeRect(x + .5, y + .5, w - 1, w - 1); } } });
    safe(() => { for (const m of megas.values()){ const [x, y] = P(m.x - m.w*LOT/2 + .15, m.z - m.h*LOT/2 + .15), w = (m.w*LOT - .3)*s, h = (m.h*LOT - .3)*s, pol = m.kind === 'police';
      b.fillStyle = pol ? 'rgba(214,255,210,.18)' : 'rgba(143,220,149,.08)'; b.fillRect(x, y, w, h); b.strokeStyle = pol ? '#d6ffd2' : 'rgba(143,220,149,.45)'; b.lineWidth = (pol ? 1.6 : 1)*dp; b.strokeRect(x, y, w, h);
      if (pol){ const k = D.stn.findIndex(q => q.m === m); b.fillStyle = '#d6ffd2'; b.font = '600 ' + (10*dp) + 'px JetBrains Mono, monospace'; b.fillText('STN-' + p2(k + 1), x + 4*dp, y + 12*dp); } } });
    // the sky highways and the metro, faint
    safe(() => { b.strokeStyle = 'rgba(143,220,149,.18)'; b.lineWidth = 2*dp; for (const h of highways){ b.beginPath(); h.tiles.forEach((t, k) => { const [x, y] = P(t.i*LOT, t.j*LOT); k ? b.lineTo(x, y) : b.moveTo(x, y); }); b.stroke(); } });
    // LIDAR range
    safe(() => { b.strokeStyle = 'rgba(143,220,149,.3)'; b.setLineDash([4*dp, 5*dp]); b.lineWidth = dp; for (const m of megasOfKind('lidar')){ const [x, y] = P(m.x, m.z); b.beginPath(); b.arc(x, y, LIDAR_R*s, 0, 7); b.stroke(); } b.setLineDash([]); });
    // the drones' scans of the last ten minutes: dots fading with age
    for (const [x0, z0, a] of D.dr.pts){ const [x, y] = P(x0, z0); b.fillStyle = `rgba(143,220,149,${(.7*(1 - a)).toFixed(2)})`; b.fillRect(x - 1.5*dp, y - 1.5*dp, 3*dp, 3*dp); }
    // bike routes
    b.strokeStyle = 'rgba(143,220,149,.4)'; b.lineWidth = dp; b.setLineDash([1*dp, 3*dp]);
    for (const bk of D.bikes) if (bk.path && bk.path.length > 1){ b.beginPath(); bk.path.forEach(([x0, z0], k) => { const [x, y] = P(x0, z0); k ? b.lineTo(x, y) : b.moveTo(x, y); }); b.stroke(); }
    b.setLineDash([]);
    // drone routes
    for (const d of D.dr.list){ const on = sel === d.id; if (!d.way.length) continue; b.strokeStyle = on ? '#d6ffd2' : 'rgba(143,220,149,.45)'; b.lineWidth = (on ? 1.6 : 1)*dp; b.setLineDash(on ? [] : [5*dp, 4*dp]);
      b.beginPath(); const [sx, sy] = P(d.x, d.z); b.moveTo(sx, sy); for (const [x0, z0] of d.way){ const [x, y] = P(x0, z0); b.lineTo(x, y); } b.stroke(); b.setLineDash([]);
      for (const [x0, z0] of d.way){ const [x, y] = P(x0, z0); b.strokeStyle = on ? '#d6ffd2' : 'rgba(143,220,149,.6)'; b.strokeRect(x - 2.5*dp, y - 2.5*dp, 5*dp, 5*dp); } }
    // calls: case activity as amber diamonds, the rest as ticks (open ones brighter)
    for (const c of D.recent){ const [x, y] = P(c.x, c.z);
      if (c.src === 'case'){ b.fillStyle = '#ffb03a'; b.beginPath(); b.moveTo(x, y - 5*dp); b.lineTo(x + 5*dp, y); b.lineTo(x, y + 5*dp); b.lineTo(x - 5*dp, y); b.closePath(); b.fill(); }
      else { b.strokeStyle = c.st === 'open' ? '#ff5d4a' : c.pri <= 2 ? 'rgba(255,176,58,.8)' : 'rgba(143,220,149,.7)'; b.lineWidth = 1.3*dp; b.beginPath(); b.moveTo(x - 4*dp, y - 4*dp); b.lineTo(x + 4*dp, y + 4*dp); b.moveTo(x + 4*dp, y - 4*dp); b.lineTo(x - 4*dp, y + 4*dp); b.stroke(); } }
    // officers and drones
    for (const o of D.ofc){ if (!isFinite(o.x) || o.st === 'OFF SHIFT' || o.st === 'STOOD DOWN') continue; const [x, y] = P(o.x, o.z); b.fillStyle = o.st === 'RESPONDING' ? '#ff5d4a' : o.st === 'AT STATION' ? 'rgba(143,220,149,.5)' : '#d6ffd2'; b.beginPath(); b.arc(x, y, 2.6*dp, 0, 7); b.fill(); }
    for (const d of D.dr.list){ const [x, y] = P(d.x, d.z); b.strokeStyle = d.mode === 'CHASE' ? '#ff5d4a' : '#d6ffd2'; b.lineWidth = 1.4*dp; b.strokeRect(x - 4*dp, y - 4*dp, 8*dp, 8*dp); b.fillStyle = '#d6ffd2'; b.font = (8*dp) + 'px JetBrains Mono, monospace'; b.fillText(d.id, x + 6*dp, y - 5*dp); }
    b.fillStyle = 'rgba(143,220,149,.55)'; b.font = (9*dp) + 'px JetBrains Mono, monospace'; b.textAlign = 'right'; b.fillText('N ↑', W - 8*dp, 14*dp); b.textAlign = 'left';
  }
  function pickMap(px, py){
    if (!F) return null; const P = F.P, r = 9*F.dp; let best = null, bd = r*r;
    const tryIt = (x0, z0, o) => { const [x, y] = P(x0, z0), d = (x - px)**2 + (y - py)**2; if (d < bd){ bd = d; best = o; } };
    for (const d of D.dr.list) tryIt(d.x, d.z, { drone: d.id, label: d.id + ' · ' + d.mode + ' · ' + d.way.length + ' WAYPOINTS · CLICK TO TRACE' });
    for (const o of D.ofc) if (isFinite(o.x) && o.st !== 'OFF SHIFT' && o.st !== 'STOOD DOWN') tryIt(o.x, o.z, { cop: o.id, label: o.b + ' · ' + o.unit + ' · ' + o.st + ' · CLICK TO FOLLOW' });
    for (const c of D.recent) tryIt(c.x, c.z, { call: c, label: String(c.id).padStart(5, '0') + ' · ' + c.kind + (c.file ? ' ' + c.file : '') + ' · ' + tc(c.c) + ' · ' + (c.st === 'open' ? 'OPEN' : c.st) + ' · CLICK TO GO' });
    return best;
  }
  function loop(now){
    if (!PD.open) return; raf = requestAnimationFrame(loop);
    if (!base || !g) return; if (loop.t && now - loop.t < 50) return; loop.t = now;
    const W = cv.width, H = cv.height, dp = F.dp, t = now/1000; g.drawImage(base, 0, 0);
    // a sweep across the plan, and the open calls pulsing
    const sx = ((t*.07) % 1)*W, gr = g.createLinearGradient(sx - 60*dp, 0, sx, 0); gr.addColorStop(0, 'rgba(143,220,149,0)'); gr.addColorStop(1, 'rgba(143,220,149,.07)'); g.fillStyle = gr; g.fillRect(sx - 60*dp, 0, 60*dp, H); g.fillStyle = 'rgba(143,220,149,.35)'; g.fillRect(sx, 0, dp, H);
    const k = (t*.7) % 1; for (const c of D.recent) if (c.st === 'open'){ const [x, y] = F.P(c.x, c.z); g.strokeStyle = `rgba(255,93,74,${(.8*(1 - k)).toFixed(2)})`; g.lineWidth = 1.3*dp; g.beginPath(); g.arc(x, y, (5 + k*16)*dp, 0, 7); g.stroke(); }
    if (hov){ const o = hov.cop ? D.ofc.find(q => q.id === hov.cop) : hov.drone ? D.dr.list.find(q => q.id === hov.drone) : hov.call; if (o){ const [x, y] = F.P(o.x, o.z); g.strokeStyle = '#d6ffd2'; g.lineWidth = dp; g.strokeRect(x - 8*dp, y - 8*dp, 16*dp, 16*dp); } }
    const c = $('.clk'); if (c){ const s2 = (now/500 | 0) % 2 ? hm(D.now) : hm(D.now).replace(':', ' '); if (c.textContent !== s2) c.textContent = s2; }
  }
  /* ---------- in and out ---------- */
  function follow(id){ close(() => { try { if (MON.ready()) MON.open(id); } catch (e){ console.warn('precinct: follow', e); } }); }
  function goTo(x, z){ close(() => { safe(() => { camGoal.set(x, 0, z); zoomT = Math.min(zoomT, 14); }); }); }
  PD.show = m => {
    if (PD.open || PD.busy) return; PD.busy = true; build(); tick();
    safe(() => { if (MON.id) MON.close(); }); safe(() => music.hold && music.hold(true)); safe(() => PERF.quiet(4000));
    PD.open = true; PD.hold = true; sel = null; hov = null; D = read(); dom();
    requestAnimationFrame(() => { if (!PD.open) return; setup(); raf = requestAnimationFrame(loop); PD.busy = false; });
    keyH = e => { if (!PD.open) return; e.stopPropagation(); if (e.key === 'Escape') close(); }; addEventListener('keydown', keyH, true);
    resH = () => { if (PD.open && root) setup(); }; addEventListener('resize', resH);
  };
  function close(then){
    if (!PD.open) return; PD.hold = false; safe(() => music.hold && music.hold(false)); safe(() => PERF.quiet(2500));
    cancelAnimationFrame(raf); if (keyH) removeEventListener('keydown', keyH, true); keyH = null; if (resH) removeEventListener('resize', resH); resH = null;
    const r = root; root = null; base = null; g = null; F = null; PD.open = false;
    if (r){ r.classList.remove('in'); r.classList.add('out'); setTimeout(() => r.remove(), 360); }
    if (typeof then === 'function') setTimeout(then, 60);
  }
  PD.close = close; PD._R = () => R; PD._read = read;
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
