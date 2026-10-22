// Neon Terrarium: Furnish pod. Pick a floor of a residential or luxury building (or a lifted pod) and do the apartment up in the
// Pod Furniture Lab's Build mode, which runs full screen in an iframe (furnish.html: three.js r149, so it never mixes with the game's r128).
// The game sends the lab the city round the home (every plot's geometry: full detail near the home, a clustered stand-in further out),
// the home, the camera and the time of day; the lab sends the apartment's recipe back on Save and on Exit, and it is kept with the city
// (localStorage 'neonIsland.furnish', one of the city's keys: saveguard.js), so it goes into the save slot, files and the cloud with it.
// How it's regenerated and the message protocol: docs/furnish.md.
// All game scripts share one scope and load in order (see index.html); this one loads after input.js.
'use strict';
const FURN = (() => {
  const F = { pick: false, open: false, hold: false, busy: false, hov: null, fl: 0, userFloor: false, frame: null, home: null };
  const SAVE_KEY = 'neonIsland.furnish', NEAR = 46, CG = .22, PAGE = 'furnish.html?v=2026-10-22a';
  const btn = document.getElementById('furnBtn'), hint = document.getElementById('modeHint');
  const tip = document.createElement('div'); tip.className = 'furn-tip'; tip.hidden = true; document.body.appendChild(tip);

  /* ---------- the saved homes ---------- */
  const keyOf = h => h.cell[0] + ',' + h.cell[1] + '|' + h.section + '|' + h.floor;
  function store(){ try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && s.homes && typeof s.homes === 'object') return s; } catch (e) {} return { v: 1, homes: {} }; }
  function putRecipe(h, recipe){
    if (!recipe || !recipe.home || !Array.isArray(recipe.pieces)) return false;
    const s = store(); s.homes[keyOf(h)] = { at: new Date().toISOString(), zone: h.zone, kind: h.kind, n: recipe.pieces.length, recipe };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch (e) { console.warn('Furnish pod: could not save the home', e); return false; }
  }
  const getRecipe = h => { const e = store().homes[keyOf(h)]; return e && e.recipe || null; };
  F.saved = () => Object.keys(store().homes);

  /* ---------- the homes in a building: every floor of its residential and luxury sections, and a lifted pod ---------- */
  const DIRS = [[0, 1, 'S'], [1, 0, 'E'], [0, -1, 'N'], [-1, 0, 'W']];
  const exposed = (c, y) => DIRS.filter(([a, b]) => { const n = cells.get(ckey(c.i + a, c.j + b)); return !n || !((n.height || 0) > y + FH*.5); }).map(d => d[2]);
  const homeZone = z => z === 'low' || z === 'high';
  function homesOf(c){
    const H = [];
    if (!c || c.mega || !c.sections || !c.sections.length) return H;
    const run = (secs, tops, base0, idBase, isLift) => {
      for (let k = 0; k < secs.length; k++){
        const sec = secs[k], top = tops[k]; if (top === undefined) break;
        const base = k === 0 ? base0 : sec.at !== undefined && sec.at > tops[k - 1] + .01 ? sec.at : tops[k - 1] + .1;
        const pod = isLift && k === 0;
        if (!pod && !homeZone(sec.zone)) continue;
        const n = Math.max(1, Math.floor((top - base)/FH + .15));
        for (let f = 0; f < n; f++){
          const y = base + f*FH, y1 = Math.min(top, y + FH); if (y1 - y < FH*.6) break;
          const row = { cell: [c.i, c.j], section: idBase + k, floor: Math.round((y - CURB)/FH) + 1, sf: f, y: +y.toFixed(3), y1: +y1.toFixed(3),
            zone: sec.zone === 'high' ? 'high' : 'low', kind: sec.zone === 'high' ? 'luxury' : 'tower', x: c.x, z: c.z, sides: exposed(c, y), v: 1, d: null, top, base };
          if (pod && f === 0){ const L = c.lift; Object.assign(row, { section: -1, kind: 'lift', v: L.v || 1, d: L.d || null, y1: +Math.min(top, y + FH*1.15).toFixed(3),
            sides: L.d ? [L.d[0] > 0 ? 'E' : L.d[0] < 0 ? 'W' : L.d[1] > 0 ? 'S' : 'N'] : exposed(c, y) }); }
          else if (pod && !homeZone(sec.zone)) break;
          H.push(row);
        }
      }
    };
    if (c.lift && c.below && c.below.length && c.belowTops) run(c.below, c.belowTops, CURB, 100, false);
    run(c.sections, c.sectionTops || [], c.lift ? c.lift.y : CURB, 0, !!c.lift);
    return H;
  }
  F.homesOf = homesOf;
  F._gather = (h, p) => gather(h, p || (() => {}));   // (for checks: the payload openHome sends)

  /* ---------- pick mode ---------- */
  const zoneCol = z => ZONES[z] ? ZONES[z].col : '#e3d6bd';
  const label = h => h.kind === 'lift' ? 'Lifted pod' : h.kind === 'luxury' ? 'Luxury' : 'Residential';
  function setPick(on){
    if (on === F.pick) return;
    F.pick = on; F.hov = null; showPick(null);
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); document.body.classList.toggle('furnishing', on);
    if (on){
      if (typeof LOADP !== 'undefined' && LOADP.on){ F.pick = false; btn.classList.remove('on'); btn.setAttribute('aria-pressed', false); document.body.classList.remove('furnishing'); flash('The city is still loading. Try again in a moment.'); return; }
      if (S.zone) selectZone(null);
      if (delMode) setDelMode(false, true);
      if (megaPick) selectMega(null, true);
      if (hwMode) setHwMode(false, true);
      if (mtMode) setMtMode(false, true);
      if (HL) hlStop();
      if (MON.id) MON.close();
      hint.textContent = 'Furnish pod: point at a residential or luxury building · scroll or Up / Down picks the floor · click to furnish · Esc to cancel';
      if (ptrLast) hoverAt(ptrLast.x, ptrLast.y);
    } else { hoverStrip.material.color.set(0xff5ad8); tip.hidden = true; selectZone(null); }   // (the strip's own pink back, for the side pods)
  }
  F.setPick = setPick;
  function flash(msg){ hint.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => { if (!F.pick) selectZone(S.zone || null); }, 3500); }
  // the building under the pointer: its homes, and the floor the pointer is at (kept once the player scrolls)
  function hoverAt(x, y){
    const pk = pickAt(x, y);
    const c = pk && pk.c && !pk.c.mega && pk.kind !== 'plat' && pk.kind !== 'sky' ? pk.c : null;
    if (!c){ F.hov = null; showPick(null, x, y); return; }
    const rows = homesOf(c);
    if (!rows.length){ F.hov = { c, rows }; showPick(F.hov, x, y); return; }
    if (!F.hov || F.hov.c !== c){ F.hov = { c, rows }; F.userFloor = false; }
    else F.hov.rows = rows;
    if (!F.userFloor){ const py = pk.p ? pk.p.y : rows[0].y; let k = 0; for (let i = 0; i < rows.length; i++) if (rows[i].y <= py + .05) k = i; F.fl = k; }
    F.fl = clamp(F.fl, 0, rows.length - 1);
    showPick(F.hov, x, y);
  }
  function stepFloor(d){
    if (!F.hov || !F.hov.rows.length) return;
    F.fl = clamp(F.fl + d, 0, F.hov.rows.length - 1); F.userFloor = true;
    showPick(F.hov, ptrLast ? ptrLast.x : null, ptrLast ? ptrLast.y : null);
  }
  // the building outlined, the floor as a bright band round it (a lifted pod: just the pod)
  function showPick(hv, px, py){
    hoverFill.visible = false; hoverStrip.visible = false;
    if (!hv){ hover.visible = false; tip.hidden = true; return; }
    const c = hv.c;
    if (!hv.rows.length){
      hover.visible = false;
      const z = c.sections[c.sections.length - 1].zone;
      tip.textContent = (ZONES[z] ? ZONES[z].name : 'This building') + ': only residential and luxury floors can be furnished';
      tip.classList.add('no'); placeTip(px, py); return;
    }
    tip.classList.remove('no');
    const r = hv.rows[F.fl], col = zoneCol(r.zone);
    let y0, y1;
    if (r.kind === 'lift' || (c.lift && r.section >= 0 && r.section < 100)){ y0 = c.lift.y; y1 = c.height;
      if (c.podBlocks) for (const [s0, s1] of c.podBlocks) if (r.y >= s0 - .05 && r.y <= s1){ y0 = s0; y1 = s1; } }
    else { const same = hv.rows.filter(q => q.section >= 100 === r.section >= 100); y0 = Math.min(...same.map(q => q.base)); y1 = Math.max(...same.map(q => q.top)); }
    hoverMat.color.set(col);
    hover.position.set(c.x, (y0 + y1)/2, c.z); hover.scale.set(SIDE + .1, Math.max(.2, y1 - y0), SIDE + .1); hover.visible = true;
    hoverStrip.material.color.set(col);
    hoverStrip.position.set(c.x, (r.y + r.y1)/2, c.z); hoverStrip.scale.set(SIDE + .3, (r.y1 - r.y)*.94, SIDE + .3); hoverStrip.visible = true;
    const saved = !!getRecipe(r);
    tip.textContent = label(r) + ' · floor ' + r.floor + (r.kind === 'lift' ? '' : ' (' + (F.fl + 1) + ' of ' + hv.rows.length + ')') + (saved ? ' · furnished' : '') + ' · click to ' + (saved ? 'open' : 'furnish');
    placeTip(px, py);
  }
  function placeTip(px, py){ if (px == null){ tip.hidden = true; return; } tip.style.left = px + 'px'; tip.style.top = py + 'px'; tip.hidden = false; }

  // pick mode takes the pointer, the wheel and a few keys before the building controls see them; dragging still turns the view
  canvas.addEventListener('pointerdown', e => {
    if (!F.pick || ptrs.size) return;   // (a second finger: the pinch as usual)
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragging = true;
    act = e.button === 0 || e.pointerType === 'touch' ? { kind: e.pointerType === 'touch' ? 'touch' : 'sky', x: e.clientX, y: e.clientY, moved: false, furn: true, done: new Set() } : e.button === 2 ? { kind: 'right', x: e.clientX, y: e.clientY, moved: false, furn: true } : { kind: 'rotate' };
  }, { capture: true });
  canvas.addEventListener('pointermove', e => {
    if (!F.pick) return;
    if (!ptrs.has(e.pointerId)){ e.stopImmediatePropagation(); ptrLast = { x: e.clientX, y: e.clientY }; hoverAt(e.clientX, e.clientY); }
  }, { capture: true });
  const endP = e => {
    if (!F.pick || !act || !act.furn || !ptrs.has(e.pointerId)) return;
    const click = !act.moved && (act.kind === 'sky' || act.kind === 'touch'), right = !act.moved && act.kind === 'right';
    act.moved = true;   // (input.js only tidies up)
    if (right) setPick(false);
    else if (click && e.pointerType === 'touch'){   // (touch: a tap lights a floor, a second tap on the same floor furnishes it)
      const pc = F.hov && F.hov.c, pf = F.fl; ptrLast = { x: e.clientX, y: e.clientY }; hoverAt(e.clientX, e.clientY);
      if (pc && F.hov && F.hov.c === pc && F.fl === pf) confirm(); }
    else if (click) confirm();
  };
  canvas.addEventListener('pointerup', endP, { capture: true });
  canvas.addEventListener('wheel', e => { if (!F.pick || !F.hov || !F.hov.rows.length) return; e.preventDefault(); e.stopImmediatePropagation(); stepFloor(e.deltaY < 0 ? 1 : -1); }, { capture: true, passive: false });
  addEventListener('keydown', e => {
    if (F.open){ e.preventDefault(); e.stopImmediatePropagation(); return; }   // (the apartment has the keys: none reach the city under it)
    if (!F.pick || (e.target.closest && e.target.closest('input,select,textarea'))) return;
    const k = e.key;
    if (k === 'Escape'){ setPick(false); }
    else if (k === 'ArrowUp' || k === 'PageUp'){ stepFloor(1); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 'PageDown'){ stepFloor(-1); e.preventDefault(); }
    else if (k === 'Enter'){ confirm(); }
    else if ('123456x0 r'.includes(k.toLowerCase()) && k.length === 1){ }   // (no zones, delete, transport or tilt while picking)
    else return;
    e.stopImmediatePropagation();
  }, { capture: true });
  btn.addEventListener('click', () => setPick(!F.pick));

  function confirm(){
    if (!F.hov || !F.hov.rows.length || F.busy) return;
    const h = Object.assign({}, F.hov.rows[F.fl]); delete h.top; delete h.base;
    setPick(false);
    openHome(h);
  }

  /* ---------- the city for the lab ---------- */
  const ownArr = a => { const d = a && Object.getOwnPropertyDescriptor(a, 'array'); return d && 'value' in d ? d.value : null; };   // (a getter: the arrays are let go)
  function emTable(){
    const E = [[0, 0, 0, 0]], map = new Map([['0,0,0,0', 0]]);
    return { E, at(r, g, b, f){ const k = r + ',' + g + ',' + b + ',' + f; let v = map.get(k); if (v !== undefined) return v;
      if (E.length >= 255){ let best = 1, bd = 1e9; for (let i = 1; i < E.length; i++){ const q = E[i], d = Math.abs(q[0] - r) + Math.abs(q[1] - g) + Math.abs(q[2] - b) + (q[3] === f ? 0 : 500); if (d < bd){ bd = d; best = i; } } return best; }
      v = E.length; E.push([r, g, b, f]); map.set(k, v); return v; } };
  }
  // one plot (or megastructure): its parts by class (solid, glass, fx) as plain arrays, or null when its arrays are let go
  function readPlot(o, EM){
    const d = o.data; if (!d || !d.geo) return {};
    const C = {}, box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const [m, g] of d.geo){
      const P = g.attributes.position, pa = ownArr(P); if (!P) continue; if (!pa || pa.length < P.count*3) return null;
      const n = P.count; if (!n) continue;
      const cls = m && m.transparent ? 'glass' : m && m.type === 'ShaderMaterial' ? 'fx' : 'solid';
      const CA = g.attributes.color, ca = CA ? ownArr(CA) : null; if (CA && !ca) return null;
      const EA = g.attributes.aEm, ea = EA ? ownArr(EA) : null; if (EA && !ea) return null;
      const mc = m && m.color ? m.color : null, white = !mc || (mc.r === 1 && mc.g === 1 && mc.b === 1), byte = CA && CA.normalized && ca instanceof Uint8Array;
      const base = m && !m.vertexColors && mc ? [mc.r*255, mc.g*255, mc.b*255] : !mc ? [159, 184, 200] : null;
      const pos = new Float32Array(n*3), col = new Uint8Array(n*3), em = new Uint8Array(n);
      for (let i = 0; i < n*3; i++){ const v = pa[i]; pos[i] = v; const k = i % 3; if (v < box[k]) box[k] = v; if (v > box[k + 3]) box[k + 3] = v; }
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++){
        let v = base ? base[k] : ca ? (byte ? ca[i*CA.itemSize + k] : ca[i*CA.itemSize + k]*255) : 255;
        if (!base && !white) v *= mc.getComponent ? mc.getComponent(k) : [mc.r, mc.g, mc.b][k];
        col[i*3 + k] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
      if (ea){ const s = EA.itemSize, sc = EA.normalized && ea instanceof Uint8Array ? 1 : 255;
        for (let i = 0; i < n; i++){ const o2 = i*s, r = Math.round(ea[o2]*sc), gg = Math.round(ea[o2 + 1]*sc), b = Math.round(ea[o2 + 2]*sc), f = s > 3 ? Math.round(ea[o2 + 3]*sc) : 1; if (r | gg | b) em[i] = EM.at(r, gg, b, f); } }
      if (cls === 'fx') for (let i = 0; i < n; i++) if (!em[i]) em[i] = EM.at(col[i*3], col[i*3 + 1], col[i*3 + 2], 3);
      let idx; if (g.index){ const ia = g.index.array; idx = new Uint32Array(ia.length); idx.set(ia); } else { idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
      (C[cls] || (C[cls] = [])).push({ pos, col, em, idx, n });
    }
    const out = {};
    for (const k in C){ const L = C[k]; if (L.length === 1){ out[k] = L[0]; continue; }
      let n = 0, ni = 0; for (const p of L){ n += p.n; ni += p.idx.length; }
      const pos = new Float32Array(n*3), col = new Uint8Array(n*3), em = new Uint8Array(n), idx = new Uint32Array(ni); let o2 = 0, oi = 0;
      for (const p of L){ pos.set(p.pos, o2*3); col.set(p.col, o2*3); em.set(p.em, o2); for (let t = 0; t < p.idx.length; t++) idx[oi + t] = p.idx[t] + o2; o2 += p.n; oi += p.idx.length; }
      out[k] = { pos, col, em, idx, n }; }
    out._box = box.map(v => +v.toFixed(4));
    return out;
  }
  // the clustered stand-in of a part (vertices merged on a CG grid, as the lab's own city pack does)
  function cluster(c){
    const n = c.n, id = new Int32Array(n), m = new Map(), P = [], Co = [], E = [], cnt = [];
    for (let i = 0; i < n; i++){
      const key = ((Math.round(c.pos[i*3]/CG) + 32768)*65536 + (Math.round(c.pos[i*3 + 1]/CG) + 32768))*65536 + (Math.round(c.pos[i*3 + 2]/CG) + 32768);
      let v = m.get(key);
      if (v === undefined){ v = cnt.length; m.set(key, v); P.push(0, 0, 0); Co.push(c.col[i*3], c.col[i*3 + 1], c.col[i*3 + 2]); E.push(c.em[i]); cnt.push(0); }
      id[i] = v; P[v*3] += c.pos[i*3]; P[v*3 + 1] += c.pos[i*3 + 1]; P[v*3 + 2] += c.pos[i*3 + 2]; cnt[v]++; if (c.em[i]) E[v] = c.em[i];
    }
    const I = []; for (let t = 0; t < c.idx.length; t += 3){ const a = id[c.idx[t]], b = id[c.idx[t + 1]], d = id[c.idx[t + 2]]; if (a !== b && b !== d && a !== d) I.push(a, b, d); }
    const used = new Int32Array(cnt.length).fill(-1); let u = 0; for (const v of I) if (used[v] < 0) used[v] = u++;
    const pos = new Float32Array(u*3), col = new Uint8Array(u*3), em = new Uint8Array(u);
    for (let v = 0; v < cnt.length; v++){ const w = used[v]; if (w < 0) continue; for (let k = 0; k < 3; k++){ pos[w*3 + k] = P[v*3 + k]/cnt[v]; col[w*3 + k] = Co[v*3 + k]; } em[w] = E[v]; }
    const idx = new Uint32Array(I.length); for (let t = 0; t < I.length; t++) idx[t] = used[I[t]];
    return { pos, col, em, idx, n: u };
  }
  // the stand-ins are kept between visits while the plot is unchanged (same data object), so a second visit is quick
  const COARSE = new WeakMap();
  const yieldNow = () => new Promise(r => setTimeout(r, 0));
  async function gather(home, progress){
    const EM = emTable(), plots = [], missing = [], xfer = [];
    const todo = [];
    for (const c of cells.values()) if (c.data && c.data.geo) todo.push({ o: c, kind: 'cell', id: [c.i, c.j], cell: c });
    for (const m of megas.values()) if (m.data && m.data.geo) todo.push({ o: m, kind: 'mega', id: m.id });
    const nearOf = t => { const bb = t.o._bb || (t.o.data && t.o.data._bb); const cx = bb ? (bb.min.x + bb.max.x)/2 : t.o.x, cz = bb ? (bb.min.z + bb.max.z)/2 : t.o.z, r = bb ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)/2 : LOT;
      return Math.hypot(cx - home.x, cz - home.z) < NEAR + r; };
    const emCache = new Map();   // (the coarse caches hold emission as rgba, not as this visit's table indices)
    const fromCache = (t, ce) => { const out = {}; for (const k in ce.parts){ const p = ce.parts[k], em = new Uint8Array(p.n); for (let i = 0; i < p.n; i++){ const q = p.e4[i]; em[i] = q ? EM.at(q[0], q[1], q[2], q[3]) : 0; }
      out[k] = { pos: p.pos.slice(), col: p.col.slice(), em, idx: p.idx.slice(), n: p.n }; } return out; };
    const t0 = performance.now(); let pending = todo, done = 0, last = performance.now();
    while (pending.length && performance.now() - t0 < 60000){
      const next = [];
      for (const t of pending){
        const near = nearOf(t), cached = !near && COARSE.get(t.o.data);
        if (cached){ plots.push({ kind: t.kind, id: t.id, box: cached.box, coarse: fromCache(t, cached) }); done++; continue; }
        let ready = true; if (t.cell){ try { ready = pmEnsure(t.cell, 'full'); } catch (e) { ready = true; } }
        const B = ready ? readPlot(t.o, EM) : null;
        if (!B){ next.push(t); continue; }
        const box = B._box; delete B._box;
        if (near) plots.push({ kind: t.kind, id: t.id, box, full: B });
        else {
          const co = {}, keep = { box, parts: {} };
          for (const k in B){ if (k === 'glass') continue; const cc = cluster(B[k]); if (!cc.n) continue; co[k] = cc;
            keep.parts[k] = { pos: cc.pos.slice(), col: cc.col.slice(), idx: cc.idx.slice(), n: cc.n, e4: Array.from(cc.em, v => v ? EM.E[v] : null) }; }
          COARSE.set(t.o.data, keep); plots.push({ kind: t.kind, id: t.id, box, coarse: co });
        }
        done++;
        if (performance.now() - last > 14){ progress(done/todo.length); await yieldNow(); last = performance.now(); if (!F.busy) return null; }
      }
      pending = next;
      if (pending.length){ progress(done/todo.length); await new Promise(r => setTimeout(r, 120)); if (!F.busy) return null; }
    }
    for (const t of pending) missing.push({ kind: t.kind, id: t.id });
    for (const p of plots) for (const tier of ['full', 'coarse']) if (p[tier]) for (const k in p[tier]){ const q = p[tier][k]; xfer.push(q.pos.buffer, q.col.buffer, q.em.buffer, q.idx.buffer); }
    // the cells and megastructures, as the lab's city pack lists them
    const cellsOut = [], towers = [], homes = [];
    for (const c of cells.values()){
      const secs = c.sections || [];
      const o = { i: c.i, j: c.j, x: c.x, z: c.z, h: +(c.height || 0).toFixed(2), zone: c.mega ? 'mega' : c.park ? '' : secs.length ? secs[secs.length - 1].zone : '' };
      if (secs.length) o.sections = secs.map(s => ({ zone: s.zone, seed: s.seed })); if (c.sectionTops) o.tops = c.sectionTops.map(v => +v.toFixed(3));
      if (c.lift) o.lift = Object.assign({}, c.lift); if (c.mega) o.mega = c.mega; if (c.park) o.park = 1; if (c.firstFloors) o.ff = c.firstFloors; try { if (isDarkPlot(c)) o.dark = 1; } catch (e) {}
      cellsOut.push(o);
      const H = homesOf(c); for (const h of H){ const r = Object.assign({}, h); delete r.top; delete r.base; delete r.y1; homes.push(r); }
      const bySec = new Map(); for (const h of H){ if (h.kind === 'lift') continue; const L = bySec.get(h.section) || []; L.push(h); bySec.set(h.section, L); }
      for (const [s, L] of bySec) towers.push({ cell: [c.i, c.j], section: s, zone: L[0].zone, kind: L[0].kind, floors: [L[0].floor, L[L.length - 1].floor], base: +L[0].base.toFixed(3), top: +L[0].top.toFixed(3), x: c.x, z: c.z });
    }
    const megasOut = []; for (const m of megas.values()){ const r = {}; for (const k in m){ const v = m[k]; if (v == null || typeof v === 'function' || (typeof v === 'object' && (v.isObject3D || v.isBufferGeometry || v.isMaterial || v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)))) continue; try { r[k] = JSON.parse(JSON.stringify(v)); } catch (e) {} } megasOut.push(r); }
    const camera = { pos: cam.position.toArray(), quat: cam.quaternion.toArray(), zoom: cam.zoom, type: cam.type, left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom, goal: [camGoal.x, camGoal.y || 0, camGoal.z] };
    const consts = { LOT, FH, CURB, ISL_R, SIDE }; for (const n of ['POD_Z1', 'POD_FAR', 'MAX_HEIGHT', 'MAX_SECTIONS', 'PLAT_BOTTOM']){ try { const v = (0, eval)(n); if (typeof v === 'number') consts[n] = v; } catch (e) {} }
    return { city: { v: 1, source: { live: true, at: new Date().toISOString(), missing: missing.length }, consts, Q: null, camera, cells: cellsOut, megas: megasOut, em: EM.E, homes, towers, plots }, xfer };
  }

  /* ---------- the overlay ---------- */
  const ov = document.getElementById('furnish'), ovMsg = document.getElementById('furnishMsg'), ovBar = document.getElementById('furnishBar');
  const nightNow = () => { try { return comp.uniforms.night.value > .5 ? 'night' : 'day'; } catch (e) { return S.hour < 6.5 || S.hour >= 19 ? 'night' : 'day'; } };
  function status(t, k){ ovMsg.textContent = t; ovBar.style.width = k == null ? '0' : Math.round(k*100) + '%'; ovBar.parentNode.hidden = k == null; }
  async function openHome(h){
    if (F.busy || F.open) return;
    F.busy = true; F.home = h; F.open = true; ov.hidden = false; document.body.classList.add('furnish-open'); ov.classList.remove('live');
    status('Gathering the city around ' + label(h).toLowerCase() + ', floor ' + h.floor, 0);
    let g = null; try { g = await gather(h, k => status(ovMsg.textContent, k)); } catch (e) { console.error('Furnish pod: gathering the city failed', e); }
    if (!F.busy) return;
    if (!g){ status('The city could not be gathered. Try again.', null); setTimeout(close, 2500); return; }
    status('Opening the apartment', 1);
    F.hold = true;   // (the city waits under the apartment: main.js)
    const fr = document.createElement('iframe'); fr.className = 'furnish-frame'; fr.title = 'Furnish pod'; fr.setAttribute('allow', 'fullscreen');
    F.frame = fr; F.payload = g; F.dirty = false;
    fr.src = PAGE + '#build'; ov.appendChild(fr);
  }
  function close(){
    F.busy = false; F.hold = false; F.open = false; F.payload = null;
    if (F.frame){ F.frame.remove(); F.frame = null; }
    ov.hidden = true; ov.classList.remove('live'); document.body.classList.remove('furnish-open');
    try { canvas.focus(); } catch (e) {} LAST_INPUT = performance.now();
  }
  F.close = close;
  F._open = openHome;   // (for checks: open a home row from homesOf)
  addEventListener('message', e => {
    const fr = F.frame; if (!fr || e.source !== fr.contentWindow || e.origin !== location.origin) return;
    const m = e.data || {}, h = F.home;
    if (m.type === 'furnish:ready' && F.payload){
      const g = F.payload; F.payload = null;
      const tier = null;   // (a new home: the building picks its size, and its windows come from the real facade)
      fr.contentWindow.postMessage({ type: 'furnish:open', city: g.city, home: h, recipe: getRecipe(h), tier, time: nightNow(), label: label(h) + ' · floor ' + h.floor }, location.origin, g.xfer);
      ov.classList.add('live'); F.busy = false; try { fr.focus(); } catch (err) {}
    } else if (m.type === 'furnish:save'){
      const ok = putRecipe(h, m.recipe); try { save(); } catch (err) {}
      fr.contentWindow.postMessage({ type: 'furnish:saved', ok }, location.origin);
    } else if (m.type === 'furnish:exit'){
      if (m.recipe) putRecipe(h, m.recipe);
      close();
    } else if (m.type === 'furnish:error'){
      console.warn('Furnish pod:', m.message); status(m.message || 'The apartment could not be opened.', null); setTimeout(close, 3000);
    }
  });
  document.getElementById('furnishCancel').addEventListener('click', close);
  return F;
})();
