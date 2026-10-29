// Neon Terrarium: the city ledger. Keeps a little history for the Data Spire's city view (overseer.js): where police
// incidents happened (each police-case moment as it starts: when, which case, which step, where), and the city's
// growth (population, built plots, floors, megastructures), sampled once a game hour. Saved in this browser.
// Also the shared readings of the city as it stands now (crowds, transit, police), so the view and anything else
// can ask the same questions the same way.
'use strict';
const LEDGER = (() => {
  const KEY = 'neonIsland.ledger', MAX_INC = 60, MAX_GROW = 24*21;
  const L = { inc: [], grow: [] };
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v){ if (Array.isArray(v.inc)) L.inc = v.inc; if (Array.isArray(v.grow)) L.grow = v.grow; } } catch (e) {}
  let dirty = false; const save = () => { dirty = true; };
  setInterval(() => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) {} }, 5000);
  addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) {} });
  const safe = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const clock = () => safe(() => STORY.clock, 0);

  /* ---------- names for places ---------- */
  const ZN = { low: 'Residential', mid: 'Commercial', high: 'Luxury', ind: 'Industrial' };
  function placeLabel(pl){
    if (typeof pl === 'string') pl = safe(() => places.get(pl), null);
    if (!pl) return 'Street';
    if (pl.mega){ const t = MEGA_TYPES[pl.mega.kind]; return t ? t.name : pl.mega.kind; }
    if (pl.id.startsWith('mt:')) return 'Metro station';
    if (pl.id.startsWith('b:')) return 'Street bench';
    if (pl.cell){ const z = {}; for (const s of pl.cell.sections || []) z[s.zone] = (z[s.zone] || 0) + 1; const k = Object.keys(z).sort((a, b) => z[b] - z[a])[0]; return (ZN[k] || 'City') + ' block'; }
    if (pl.open) return 'Plaza';
    return 'Building';
  }

  /* ---------- incidents: each police-case moment as it starts ---------- */
  function caseTitle(arcId){ return String(arcId || '').replace(/^[bs]\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  function stepTitle(arcId, mid){
    return safe(() => { const a = CASES.arcs.get(arcId); const r = a.rows.find(r => (r.moments || []).some(m => m.id === mid)); return r ? r.title : null; }, null);
  }
  function whereOf(s, cast){
    let a = safe(() => s.beats[0].anc, null); if (typeof a === 'function') a = safe(a, null);
    let x = null, z = null, pid = null;
    if (a){ if (a.kind === 'door' && a.door){ x = a.door.stand.x; z = a.door.stand.z; pid = a.place; } else if (a.kind === 'open' && a.place){ x = a.place.x; z = a.place.z; pid = a.place.id; } else if (a.x !== undefined){ x = a.x; z = a.z; } }
    if (x === null){ const p = safe(() => people.get(cast.A), null); if (p){ const pl = places.get(p.at); x = p.walk || !pl ? p.x : pl.x; z = p.walk || !pl ? p.z : pl.z; pid = pl ? pl.id : null; } }
    return { x, z, pid };
  }
  function hook(){
    if (typeof STORY === 'undefined' || !STORY.startScene || STORY.startScene._ledger) return;
    const orig = STORY.startScene;
    const wrapped = function (s, cast, opts){
      const sc = orig.apply(this, arguments);
      if (sc && s && s.tier === 'case') safe(() => {
        const [, arc, mid] = String(s.id).split('.'); const w = whereOf(s, cast || {}); if (w.x === null) return;
        const c = clock();
        L.inc.push({ c, arc, title: stepTitle(arc, mid) || 'Police matter', kase: caseTitle(arc), x: +w.x.toFixed(1), z: +w.z.toFixed(1), place: placeLabel(w.pid) });
        while (L.inc.length > MAX_INC) L.inc.shift(); save();
      });
      return sc;
    };
    wrapped._ledger = true; STORY.startScene = wrapped;
  }

  /* ---------- growth: a sample each game hour ---------- */
  function count(){
    let plots = 0, floors = 0;
    safe(() => { for (const c of cells.values()){ if (!c.sections || !c.sections.length) continue; plots++; floors += c.sections.length; } });
    return { pop: safe(() => pplList.length, 0), plots, floors, megas: safe(() => megas.size, 0) };
  }
  let lastH = -1;
  function sample(){
    if (typeof pplReady === 'undefined' || !pplReady) return;
    if (typeof OVERSEER !== 'undefined' && OVERSEER.hold) return;
    const c = clock(), h = Math.floor(c/60); if (h === lastH) return; lastH = h;
    const last = L.grow[L.grow.length - 1]; if (last && Math.floor(last.c/60) === h) return;
    L.grow.push(Object.assign({ c }, count())); while (L.grow.length > MAX_GROW) L.grow.shift(); save();
  }
  setInterval(() => { hook(); sample(); }, 4000);
  hook();

  /* ---------- the city now ---------- */
  const where = p => { if (p.walk || p.metro || p.spot || !places.has(p.at)) return [p.x, p.z]; const pl = places.get(p.at); return [pl.x, pl.z]; };
  function crowds(){
    const at = new Map(), pts = [];
    safe(() => { for (const p of pplList){ if (p.gone) continue; const out = p.walk || p.at !== p.home; if (!out) continue;
      const [x, z] = where(p); if (x === undefined || !isFinite(x)) continue; pts.push([x, z]); if (!p.walk && p.at) at.set(p.at, (at.get(p.at) || 0) + 1); } });
    const top = [...at.entries()].filter(([id]) => !String(id).startsWith('c:') || true).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([id, n]) => ({ id, n, name: placeLabel(id), pl: safe(() => places.get(id), null) }));
    return { pts, top, out: pts.length };
  }
  function transit(){
    const metro = safe(() => metros.map((l, k) => ({ n: k + 1, riders: (l._riders || []).length, stops: typeof mtStops === 'function' ? mtStops(l).length : (l.st || []).length + 2, tiles: (l.tiles || []).length })), []);
    const air = safe(() => drones.filter(d => (d.phase && d.phase !== 'inside') || (d.state && d.state !== 'sit')).length, 0);
    return { hwRoutes: safe(() => highways.length, 0), hwCars: safe(() => hwCars.length, 0), metro, air, drones: safe(() => drones.length, 0) };
  }
  function police(){
    const cops = safe(() => pplList.filter(p => p.cop && !p.guard), []);
    const beat = cops.filter(p => p.walk || p.patrol || (p.at && p.at !== p.job && p.at !== p.home)).length;
    const st = safe(() => [...megas.values()].filter(m => m.kind === 'police').length, 0);
    const run = safe(() => CASES.run, null);
    return { officers: cops.length, beat, stations: st, caseOpen: run ? caseTitle(run.arc) : null, caseDay: run ? safe(() => CASES.caseDay(), null) : null };
  }
  return { inc: () => L.inc, grow: () => L.grow, count, crowds, transit, police, placeLabel, caseTitle, sample, _L: L };
})();
