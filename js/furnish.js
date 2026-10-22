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
  const SAVE_KEY = 'neonIsland.furnish', NEAR = 46, CG = .22, PAGE = 'furnish.html?v=2026-10-22t';
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
  F._stream = (h, send) => stream(h, send, () => true);   // (for checks: the batches the lab gets)

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
      warmStart();   // (the far city's stand-ins made while the player picks)
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
    if (F.open){ e.preventDefault(); e.stopImmediatePropagation(); if (e.key === 'Escape' && !ov.classList.contains('live')) close(); return; }   // (the apartment has the keys; Esc before it shows cancels)   // (the apartment has the keys: none reach the city under it)
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
    const keepHov = hover.visible, keepStrip = hoverStrip.visible;
    setPick(false); tip.hidden = true;
    hover.visible = keepHov; hoverStrip.visible = keepStrip; if (keepStrip) hoverStrip.material.color.set(zoneCol(h.zone));   // (the picked floor stays lit under the opening page)
    openHome(h);
  }

  /* ---------- the city for the lab: a head at once, then the plots streamed nearest first ---------- */
  // The lab's hologram starts as soon as it has the head (cells, homes, camera: no geometry, a few ms) and paces itself on the
  // progress sent with each batch of plots. The home's own plot goes first, then the ring round it at full detail (with its
  // normals), then the rest of the city clustered: kept from earlier visits, then made from
  // arrays the game still holds, and last the plots whose arrays were let go (pmEnsure asks the worker for them).
  const ownArr = a => { const d = a && Object.getOwnPropertyDescriptor(a, 'array'); return d && 'value' in d ? d.value : null; };   // (a getter: the arrays are let go)
  function emTable(){
    const E = [[0, 0, 0, 0]], map = new Map([['0,0,0,0', 0]]);
    return { E, at(r, g, b, f){ const k = (((r*256 + g)*256 + b)*256) + f; let v = map.get(k); if (v !== undefined) return v;
      if (E.length >= 255){ let best = 1, bd = 1e9; for (let i = 1; i < E.length; i++){ const q = E[i], d = Math.abs(q[0] - r) + Math.abs(q[1] - g) + Math.abs(q[2] - b) + (q[3] === f ? 0 : 500); if (d < bd){ bd = d; best = i; } } map.set(k, best); return best; }
      v = E.length; E.push([r, g, b, f]); map.set(k, v); return v; } };
  }
  // one geometry as plain arrays (copies: they are transferred to the lab), or null when its arrays are let go
  function readGeo(m, g, EM, box, withN){
    const P = g.attributes.position, pa = ownArr(P); if (!P) return {}; if (!pa || pa.length < P.count*3) return null;
    const n = P.count; if (!n) return {};
    const cls = m && m.transparent ? 'glass' : m && m.type === 'ShaderMaterial' ? 'fx' : 'solid';
    const CA = g.attributes.color, ca = CA ? ownArr(CA) : null; if (CA && !ca) return null;
    const EA = g.attributes.aEm, ea = EA ? ownArr(EA) : null; if (EA && !ea) return null;
    const pos = pa.length === n*3 ? pa.slice() : pa.slice(0, n*3);
    const NA = withN ? g.attributes.normal : null, na = NA ? ownArr(NA) : null; if (NA && !na) return null;   // (near plots: the normals too, which saves the lab working them out)
    for (let i = 0; i < n*3; i += 3){ const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < box[0]) box[0] = x; if (x > box[3]) box[3] = x; if (y < box[1]) box[1] = y; if (y > box[4]) box[4] = y; if (z < box[2]) box[2] = z; if (z > box[5]) box[5] = z; }
    const mc = m && m.color ? m.color : null, white = !mc || (mc.r === 1 && mc.g === 1 && mc.b === 1);
    let col;
    if (ca && CA.normalized && ca instanceof Uint8Array && CA.itemSize === 3 && white) col = ca.slice(0, n*3);   // (the atlas: rgb bytes as they are)
    else { col = new Uint8Array(n*3); const base = m && !m.vertexColors && mc ? [mc.r*255, mc.g*255, mc.b*255] : !mc ? [159, 184, 200] : null, mk = mc ? [mc.r, mc.g, mc.b] : [1, 1, 1];
      const s = CA ? CA.itemSize : 3, sc = CA && CA.normalized && ca instanceof Uint8Array ? 1 : 255;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++){ let v = base ? base[k] : ca ? ca[i*s + k]*sc*mk[k] : 255*mk[k]; col[i*3 + k] = v < 0 ? 0 : v > 255 ? 255 : v + .5; } }
    const em = new Uint8Array(n);
    if (ea){ const s = EA.itemSize, sc = EA.normalized && ea instanceof Uint8Array ? 1 : 255; let lk = -1, lv = 0;
      for (let i = 0; i < n; i++){ const o2 = i*s, r = ea[o2]*sc + .5 | 0, gg = ea[o2 + 1]*sc + .5 | 0, b = ea[o2 + 2]*sc + .5 | 0; if (!(r | gg | b)) continue;
        const f = s > 3 ? ea[o2 + 3]*sc + .5 | 0 : 1, key = ((r*256 + gg)*256 + b)*256 + f; if (key !== lk){ lk = key; lv = EM.at(r, gg, b, f); } em[i] = lv; } }
    if (cls === 'fx') for (let i = 0; i < n; i++) if (!em[i]) em[i] = EM.at(col[i*3], col[i*3 + 1], col[i*3 + 2], 3);
    let idx; if (g.index){ const ia = g.index.array; idx = ia instanceof Uint32Array ? ia.slice() : Uint32Array.from(ia); } else { idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
    const part = { pos, col, em, idx, n }; if (na && NA.itemSize === 3){ const sc = !NA.normalized || na instanceof Float32Array ? 1 : na instanceof Int8Array ? 1/127 : na instanceof Int16Array ? 1/32767 : 0;
      if (sc === 1 && na instanceof Float32Array) part.nrm = na.slice(0, n*3); else if (sc){ const f = new Float32Array(n*3); for (let i = 0; i < n*3; i++) f[i] = Math.max(-1, na[i]*sc); part.nrm = f; } }
    return { cls, part };
  }
  const joinParts = L => { if (L.length === 1) return L[0]; let n = 0, ni = 0; for (const p of L){ n += p.n; ni += p.idx.length; }
    const pos = new Float32Array(n*3), col = new Uint8Array(n*3), em = new Uint8Array(n), idx = new Uint32Array(ni); let o2 = 0, oi = 0;
    for (const p of L){ pos.set(p.pos, o2*3); col.set(p.col, o2*3); em.set(p.em, o2); for (let t = 0; t < p.idx.length; t++) idx[oi + t] = p.idx[t] + o2; o2 += p.n; oi += p.idx.length; }
    const out = { pos, col, em, idx, n };
    if (L.every(p => p.nrm)){ const nrm = new Float32Array(n*3); let o3 = 0; for (const p of L){ nrm.set(p.nrm, o3); o3 += p.n*3; } out.nrm = nrm; }
    return out; };
  // a plot's geometries by class. far: solid only, and the stand-in tier when the game holds one (fewer corners to cluster)
  function readPlot(o, EM, far){
    const d = o.data; if (!d || !d.geo) return {};
    const C = {}, box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    const sg = far && d.sgeo && ownArr(d.sgeo.attributes.position) ? d.sgeo : null;
    for (const [m, g0] of d.geo){
      const g = sg && m === ATLAS ? sg : g0;
      if (far && m && (m.transparent || m.type === 'ShaderMaterial')) continue;
      const r = readGeo(m, g, EM, box, !far); if (r === null) return null; if (!r.cls) continue;
      (C[r.cls] || (C[r.cls] = [])).push(r.part);
    }
    const out = {}; for (const k in C) out[k] = joinParts(C[k]);
    out._box = box[0] > box[3] ? [o.x || 0, 0, o.z || 0, o.x || 0, 0, o.z || 0] : box.map(v => +v.toFixed(4));
    return out;
  }
  // the clustered stand-in of a part (vertices merged on a CG grid, as the lab's own city pack does)
  function cluster(c){
    const n = c.n, id = new Int32Array(n), m = new Map(), P = new Float64Array(n*3), Co = new Uint8Array(n*3), E = new Uint8Array(n), cnt = new Uint32Array(n); let nc = 0;
    const pos = c.pos, col = c.col, ce = c.em;
    for (let i = 0; i < n; i++){
      const x = pos[i*3], y = pos[i*3 + 1], z = pos[i*3 + 2];
      const key = ((Math.round(x/CG) + 32768)*65536 + (Math.round(y/CG) + 32768))*65536 + (Math.round(z/CG) + 32768);
      let v = m.get(key);
      if (v === undefined){ v = nc++; m.set(key, v); Co[v*3] = col[i*3]; Co[v*3 + 1] = col[i*3 + 1]; Co[v*3 + 2] = col[i*3 + 2]; }
      id[i] = v; P[v*3] += x; P[v*3 + 1] += y; P[v*3 + 2] += z; cnt[v]++; if (ce[i]) E[v] = ce[i];
    }
    const src = c.idx, I = new Uint32Array(src.length); let ni = 0;
    for (let t = 0; t < src.length; t += 3){ const a = id[src[t]], b = id[src[t + 1]], d = id[src[t + 2]]; if (a !== b && b !== d && a !== d){ I[ni++] = a; I[ni++] = b; I[ni++] = d; } }
    const used = new Int32Array(nc).fill(-1); let u = 0; for (let t = 0; t < ni; t++) if (used[I[t]] < 0) used[I[t]] = u++;
    const op = new Float32Array(u*3), oc = new Uint8Array(u*3), oe = new Uint8Array(u);
    for (let v = 0; v < nc; v++){ const w = used[v]; if (w < 0) continue; const k = cnt[v]; op[w*3] = P[v*3]/k; op[w*3 + 1] = P[v*3 + 1]/k; op[w*3 + 2] = P[v*3 + 2]/k; oc[w*3] = Co[v*3]; oc[w*3 + 1] = Co[v*3 + 1]; oc[w*3 + 2] = Co[v*3 + 2]; oe[w] = E[v]; }
    const idx = new Uint32Array(ni); for (let t = 0; t < ni; t++) idx[t] = used[I[t]];
    return { pos: op, col: oc, em: oe, idx, n: u };
  }
  // clustered stand-ins are kept while the plot is unchanged (same data object): a second visit, or the warm-up while picking, makes it quick.
  // (emission kept as rgba rows, not as one visit's table indices)
  const COARSE = new WeakMap();
  function coarseOf(B, EM){
    const co = {}, keep = { parts: {} };
    for (const k in B){ if (k === 'glass' || k === '_box') continue; const cc = cluster(B[k]); if (!cc.n) continue; co[k] = cc;
      keep.parts[k] = { pos: cc.pos.slice(), col: cc.col.slice(), idx: cc.idx.slice(), n: cc.n, e4: Array.from(cc.em, v => v ? EM.E[v] : null) }; }
    keep.box = B._box; return { co, keep };
  }
  function fromCache(ce, EM){ const out = {}; for (const k in ce.parts){ const p = ce.parts[k], em = new Uint8Array(p.n); for (let i = 0; i < p.n; i++){ const q = p.e4[i]; if (q) em[i] = EM.at(q[0], q[1], q[2], q[3]); }
    out[k] = { pos: p.pos.slice(), col: p.col.slice(), em, idx: p.idx.slice(), n: p.n }; } return out; }
  // While picking, the stand-ins of plots whose arrays the game still holds are made in idle moments (a few ms at a time)
  const WARM = { q: null, EM: emTable() };
  function warmStart(){
    if (!WARM.pre){ WARM.pre = true; const l = document.createElement('link'); l.rel = 'prefetch'; l.href = PAGE; document.head.appendChild(l); }   // (the page itself fetched ahead, so a click opens it from the cache)
    if (WARM.q) return; WARM.q = []; for (const c of cells.values()) if (c.data && c.data.geo) WARM.q.push(c); for (const m of megas.values()) if (m.data && m.data.geo) WARM.q.push(m); pickIdle(warmStep); }
  function warmStep(dl){
    if (!WARM.q || F.open) { WARM.q = null; return; }
    const end = performance.now() + (dl && dl.timeRemaining ? Math.min(10, Math.max(3, dl.timeRemaining() - 1)) : 4);
    while (WARM.q.length && performance.now() < end){ const o = WARM.q.pop(); if (!o.data || COARSE.has(o.data)) continue;
      const B = readPlot(o, WARM.EM, true); if (!B) continue;   // (let go: made on the visit, if it's far)
      COARSE.set(o.data, coarseOf(B, WARM.EM).keep); }
    if (WARM.q.length) pickIdle(warmStep); else WARM.q = null;
  }
  F.warmStart = warmStart;

  function head(home){
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
    const MK = ['id', 'kind', 'i', 'j', 'w', 'h', 'x', 'z', 'top', 'roofH', 'rot', 'levels', 'seed', 'si', 'sj'];   // (the plain fields only: a megastructure also holds its meshes and parts)
    const megasOut = []; for (const m of megas.values()){ const r = {}; for (const k of MK){ const v = m[k]; if (typeof v === 'number' || typeof v === 'string') r[k] = v; } megasOut.push(r); }
    const camera = { pos: cam.position.toArray(), quat: cam.quaternion.toArray(), zoom: cam.zoom, type: cam.type, left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom, goal: [camGoal.x, camGoal.y || 0, camGoal.z] };
    const consts = { LOT, FH, CURB, ISL_R, SIDE }; for (const n of ['POD_Z1', 'POD_FAR', 'MAX_HEIGHT', 'MAX_SECTIONS', 'PLAT_BOTTOM']){ try { const v = (0, eval)(n); if (typeof v === 'number') consts[n] = v; } catch (e) {} }
    return { v: 1, source: { live: true, streaming: true, at: new Date().toISOString() }, consts, Q: null, camera, cells: cellsOut, megas: megasOut, em: [[0, 0, 0, 0]], homes, towers, plots: [] };
  }
  const tick = () => new Promise(r => setTimeout(r, 0)), nap = ms => new Promise(r => setTimeout(r, ms));
  // the plots, in batches: send(plots, em, k, done, xfer) for each; returns stats, or null when cancelled
  async function stream(home, send, alive){
    const EM = emTable(), st = { t0: performance.now(), plots: 0, near: 0, cached: 0, made: 0, ensured: 0, missing: 0, verts: 0, bytes: 0, batches: 0, firstMs: 0 };
    const all = [];
    for (const c of cells.values()) if (c.data && c.data.geo) all.push({ o: c, kind: 'cell', id: [c.i, c.j], cell: c });
    for (const m of megas.values()) if (m.data && m.data.geo) all.push({ o: m, kind: 'mega', id: m.id });
    for (const t of all){ const bb = t.o._bb || (t.o.data && t.o.data._bb), cx = bb ? (bb.min.x + bb.max.x)/2 : t.o.x, cz = bb ? (bb.min.z + bb.max.z)/2 : t.o.z, r = bb ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)/2 : LOT;
      t.d = Math.hypot(cx - home.x, cz - home.z); t.near = t.d < NEAR + r; t.home = t.cell && t.cell.i === home.cell[0] && t.cell.j === home.cell[1]; }
    all.sort((a, b) => (b.home - a.home) || (b.near - a.near) || a.d - b.d);
    const N = all.length || 1; let out = [], xfer = [], last = performance.now(), done = 0;
    const flush = (fin) => { if (!out.length && !fin) return; send(out, EM.E.slice(), done/N, !!fin, xfer); st.batches++; if (!st.firstMs) st.firstMs = performance.now() - st.t0; out = []; xfer = []; };
    const emit = p => { out.push(p); st.plots++; done++;
      for (const tier of ['full', 'coarse']) if (p[tier]) for (const k in p[tier]){ const q = p[tier][k]; xfer.push(q.pos.buffer, q.col.buffer, q.em.buffer, q.idx.buffer); if (q.nrm) xfer.push(q.nrm.buffer); st.verts += q.n; st.bytes += q.pos.byteLength + q.col.byteLength + q.em.byteLength + q.idx.byteLength + (q.nrm ? q.nrm.byteLength : 0); } };
    const one = t => {   // true when it went out
      if (!t.near){ const ce = COARSE.get(t.o.data); if (ce){ emit({ kind: t.kind, id: t.id, box: ce.box, coarse: fromCache(ce, EM) }); st.cached++; return true; } }
      const B = readPlot(t.o, EM, !t.near); if (!B) return false;
      const box = B._box;
      if (t.near){ delete B._box; emit({ kind: t.kind, id: t.id, box, full: B }); st.near++; }
      else { const { co, keep } = coarseOf(B, EM); COARSE.set(t.o.data, keep); emit({ kind: t.kind, id: t.id, box, coarse: co }); st.made++; }
      return true;
    };
    const ensure = t => { if (!t.cell) return true; try { return pmEnsure(t.cell, t.near ? 'full' : 'stand'); } catch (e) { return true; } };
    const slice = async () => { if (performance.now() - last > 6){ flush(); await tick(); last = performance.now(); } return alive(); };
    // 1. the home and the ring round it (any let go are asked for at once, so the worker makes them while the rest goes out)
    const nearL = all.filter(t => t.near), farL = all.filter(t => !t.near);
    let wait = [];
    for (const t of nearL){ if (t.home ? (ensure(t) && one(t)) : one(t)){ if (t.home) flush(); } else { ensure(t); wait.push(t); } if (!await slice()) return null; }
    // 2. the far plots the game holds (or kept from before)
    const later = [];
    for (const t of farL){ if (!one(t)) later.push(t); if (!await slice()) return null; }
    // 3. what's let go: the near ones first, then the far ones, asked for a handful at a time
    const t1 = performance.now(); let q = wait.concat(later), asked = new Set();
    while (q.length && performance.now() - t1 < 45000){
      const next = []; let n = 0;
      for (const t of q){
        if (!asked.has(t) && n < 24 && !t.near) asked.add(t);
        const ok = (t.near || asked.has(t)) && ensure(t) && one(t);
        if (ok) st.ensured++; else { next.push(t); if (asked.has(t)) n++; }
        if (!await slice()) return null;
      }
      q = next; if (q.length){ flush(); await nap(25); if (!alive()) return null; }
    }
    st.missing = q.length; done = N; flush(true);
    st.ms = Math.round(performance.now() - st.t0); st.firstMs = Math.round(st.firstMs); st.MB = +(st.bytes/1048576).toFixed(1);
    return st;
  }

  /* ---------- the overlay ---------- */
  const ov = document.getElementById('furnish');
  const nightNow = () => { try { return comp.uniforms.night.value > .5 ? 'night' : 'day'; } catch (e) { return S.hour < 6.5 || S.hour >= 19 ? 'night' : 'day'; } };
  // a click opens the apartment's page straight away over the city as it stands (the picked floor still lit); the lab's hologram starts from this view
  // as soon as it has the head, and the plots follow while it plays
  function openHome(h){
    if (F.busy || F.open) return;
    F.busy = true; F.home = h; F.open = true; F.hold = true; F.dirty = false; F.run = (F.run || 0) + 1;
    ov.hidden = false; ov.classList.remove('live'); document.body.classList.add('furnish-open');
    const fr = document.createElement('iframe'); fr.className = 'furnish-frame'; fr.title = 'Furnish pod'; fr.setAttribute('allow', 'fullscreen');
    F.frame = fr; fr.src = PAGE + '#build'; ov.appendChild(fr);
    F.openT = performance.now();
  }
  async function begin(fr, h){
    const run = F.run, alive = () => F.open && F.run === run && F.frame === fr;
    const post = (m, x) => { try { fr.contentWindow.postMessage(m, location.origin, x || []); } catch (e) { console.error('Furnish pod: could not send', m.type, e); } };
    const t0 = performance.now(), hd = head(h);
    post({ type: 'furnish:begin', head: hd, home: h, recipe: getRecipe(h), tier: null, time: nightNow(), label: label(h) + ' · floor ' + h.floor });
    const headMs = performance.now() - t0;
    let st = null;
    try { st = await stream(h, (plots, em, k, done, x) => post({ type: 'furnish:plots', plots, em, k, done }, x), alive); }
    catch (e) { console.error('Furnish pod: gathering the city failed', e); post({ type: 'furnish:plots', plots: [], em: [[0, 0, 0, 0]], k: 1, done: true }); }
    if (st){ st.headMs = Math.round(headMs); st.sinceClick = Math.round(performance.now() - F.openT); F.lastStats = st;
      console.log('Furnish pod: city sent', JSON.stringify(st)); }
  }
  function close(){
    F.busy = false; F.hold = false; F.open = false;
    if (F.frame){ F.frame.remove(); F.frame = null; }
    ov.hidden = true; ov.classList.remove('live'); document.body.classList.remove('furnish-open');
    hover.visible = false; hoverStrip.visible = false; hoverStrip.material.color.set(0xff5ad8);
    try { canvas.focus(); } catch (e) {} LAST_INPUT = performance.now();
  }
  F.close = close;
  F._open = openHome;   // (for checks: open a home row from homesOf)
  addEventListener('message', e => {
    const fr = F.frame; if (!fr || e.source !== fr.contentWindow || e.origin !== location.origin) return;
    const m = e.data || {}, h = F.home;
    if (m.type === 'furnish:ready'){ if (F.busy){ F.busy = false; begin(fr, h); } }
    else if (m.type === 'furnish:live'){ ov.classList.add('live'); hover.visible = false; hoverStrip.visible = false; try { fr.focus(); } catch (err) {} }   // (the hologram has the screen: the paused city under it can go)
    else if (m.type === 'furnish:save'){
      const ok = putRecipe(h, m.recipe); try { save(); } catch (err) {}
      fr.contentWindow.postMessage({ type: 'furnish:saved', ok }, location.origin);
    } else if (m.type === 'furnish:exit'){
      if (m.recipe) putRecipe(h, m.recipe);
      close();
    } else if (m.type === 'furnish:error'){ console.warn('Furnish pod:', m.message); close(); flash(m.message || 'The apartment could not be opened.'); }
  });
  return F;
})();
