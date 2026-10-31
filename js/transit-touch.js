// Neon Terrarium: building the sky highways and the metro with a finger (touch screens only; a mouse builds as before, highway.js and metro.js).
// All game scripts share one scope and load in order (see index.html); this one after input.js, which hands it the taps and drags in highway
// and metro mode (TT.downAt, TT.tap, TT.drawStart, TT.drawMove, TT.drawEnd).
//  - aim, then place (owner, Oct 31): the first tap shows the outline of the piece and where it will go (the ghost the mouse sees on hover); a second
//    tap on it, or near the first (NEAR_PX), places it; a tap elsewhere aims there instead. The aim goes when the view moves or after AIM_MS.
//  - drag to build: a drag that starts on a line's open end (or on the outline) draws track through the plots the finger passes, at the line's height,
//    as an outline; lifting leaves the outline, and a tap on it places the whole stretch (a tap elsewhere drops it). Where the rules say no, the
//    outline stops at the last good plot, the plot in the way shown red, with a short prompt saying why. A drag that starts anywhere else moves the city.
//  - the metro's first station, while no track leaves it yet: a double tap turns it a quarter turn, the way the track will leave it, and aims the
//    next piece that way.
//  - a station needs a platform tile under it: the prompt says so.
// Prompts go through TUI.toast (touchui.js) when it's there.
'use strict';
const TT = (() => {
  const U = { on(){ return false; }, downAt(){ return null; }, tap(){ return false; }, drawStart(){}, drawMove(){}, drawEnd(){}, cancel(){}, clear(){}, busy(){ return false; }, relevel(){ return false; }, turns: 0, draws: 0 };
  if (typeof TOUCH === 'undefined' || !TOUCH.on) return U;
  const NEAR_PX = 40, AIM_MS = 8000, DT2_MS = 400, DT_PX = 40, END_PX = 44;
  const aimMs = () => window.__TT_AIM_MS || AIM_MS;   // (a slow headless check can stretch it)
  const NOTILE = 'No tile here for a station';
  const say = s => { if (s && typeof TUI !== 'undefined' && TUI.toast) TUI.toast(s); };
  const buzz = ms => { if (typeof TUI !== 'undefined' && TUI.buzz) TUI.buzz(ms); };
  const aimTip = (x, y) => { if (typeof TUI !== 'undefined' && TUI.aimTip) TUI.aimTip(x, y); };
  // the rules' reasons (highway.js hwTileWhy, metro.js mtTileWhy and the rest), cut down to a few words for a prompt
  const SHORT = [
    [/off the map/, 'Edge of the world'], [/megastructure/, 'Blocked by a megastructure'],
    [/sky ramp would hit a building/, 'No room for the ramp: a building'], [/sky ramp/, 'No room for the ramp'],
    [/building is too tall/, 'Blocked by a tall building'], [/building is in the way/, 'Blocked by a building: go higher'],
    [/another highway is there/, 'Another highway in the way'], [/metro line is already here/, 'Another line in the way'],
    [/metro station's lift/, 'A station lift is in the way'], [/metro is in the way/, 'The metro is in the way'],
    [/highway's ramp/, 'A highway ramp is in the way'], [/sky highway is in the way/, 'A highway is in the way'],
    [/station's lift|lift has no room|room here for the/, 'No room for the station lift'], [/lift down to the street/, 'No room for the lift'],
    [/stays a station/, 'Go straight on from the end station'], [/straight track/, 'Stations need straight track'],
    [/too close to another station/, 'Too close to another station'], [/come into the first station from behind/, 'Close the loop from behind the station'],
    [/needs a second station/, 'Add a second station first'], [/^finished/, 'Finished: hold the drop-off to reopen'],
    [/next plot first/, 'Add the next piece first'], [/out of range/, 'Too high or too low'],
  ];
  const short = why => { if (!why) return ''; if (why === NOTILE) return why; for (const [re, s] of SHORT) if (re.test(why)) return s; const w = why.split(':')[0]; return w[0].toUpperCase() + w.slice(1); };

  /* ---------- picking and targets ---------- */
  const pickAt = (hw, x, y) => hw ? hwPickTouch(x, y) : mtPickTouch(x, y);
  // what a tap would do (highway.js hwTargetAt, metro.js mtTargetAt), and on the metro a station only where there's a platform tile under it
  function tgt(hw, pk){
    let t = hw ? hwTargetAt(pk) : mtTargetAt(pk); if (!t || hw) return t;
    const n = t.l ? t.l.tiles.length : 0, at = t.type === 'start' || t.type === 'prepend' ? t : t.type === 'finish' ? t.l.tiles[n - 1] : t.type === 'stop' ? t.l.tiles[t.k] : null;
    if (at && !cells.get(ckey(at.i, at.j))) t = Object.assign({}, t, { ok: false, why: NOTILE });
    return t;
  }
  const tkey = t => !t ? '' : [t.type, t.h ? 'h' + t.h.id : t.l ? 'l' + t.l.id : '', t.i !== undefined ? t.i + ',' + t.j : '', t.k !== undefined ? t.k : '', t.L !== undefined ? t.L : ''].join(':');
  const showGhost = (hw, t) => { if (hw) hwShowGhost(t); else mtShowGhost(t); };
  const hideGhost = () => { hwGhost.g.visible = false; hwHighlight(null); };

  /* ---------- aim, then place ---------- */
  let AIM = null, LAST = null;   // AIM: { t, key, fx, fy, at, cam, hw, strict }; LAST: the last tap on a metro line's first station (for the double tap)
  function aimClear(){ if (!AIM) return; AIM = null; hideGhost(); aimTip(null); }
  // (strict: placed only by a tap on the piece itself, not one near it: the piece a turn aims sits right beside the station, which may be double tapped again)
  function aim(hw, t, x, y, quiet, strict){
    if (!t){ aimClear(); return; }
    AIM = { t, key: tkey(t), fx: x, fy: y, at: performance.now(), cam: camSig(), hw, strict: !!strict };
    showGhost(hw, t); buzz(6);
    if (quiet) return;
    if (!t.ok && t.why && (t.type !== 'none' || (t.h && t.h.done))) say(short(t.why));   // (a plain piece of a line has nothing to say: holding it cuts it back)
    else if (t.ok && t.type === 'loop') say('Tap again to close the loop');
    else if (t.ok && t.type === 'join') say('Tap again to join the lines');
    else if (t.ok && t.type !== 'none') aimTip(x, y);
  }
  function place(A){
    let t = tgt(A.hw, pickAt(A.hw, A.fx, A.fy)); if (tkey(t) !== A.key) t = A.t;   // (as it stands now: nothing moved, so the same piece, its checks run again)
    if (!t || !t.ok){ say(short(t && t.why) || 'Can\'t build here'); buzz(20); return; }
    aimClear();
    if (A.hw ? hwApply(t) : mtApply(t)){ buzz(12); U.places = (U.places || 0) + 1; }
  }

  /* ---------- the metro's first station: a double tap turns it ---------- */
  const rot = d => [-d[1], d[0]];
  const NEXT = new Map();   // a line -> the way the next double tap tries (a blocked way is passed over next time, so a station never sticks)
  function turn(l){
    if (l.tiles.length > 1){ say('Track already connected'); buzz(20); return; }
    const t0 = l.tiles[0], d = l.dir0 || [1, 0], nd = NEXT.get(l) || rot(d), ni = t0.i + nd[0], nj = t0.j + nd[1];
    let why = mtTileWhy(ni, nj);
    if (!why){ const tmp = { tiles: [t0, { i: ni, j: nj }], st: [], sides: {} }; if (![1, -1].some(sd => mtLiftOK(tmp, 0, sd))) why = 'lift'; }
    if (why){ NEXT.set(l, rot(nd)); say('No space that way'); buzz(20); return; }
    NEXT.delete(l);
    const before = mtTouched(l); l.dir0 = nd; mtActive = l; mtCommit(l, before); sfx.play('place'); buzz(10); U.turns++;
    // and the next piece aimed that way: a tap on it builds on from the station
    const t = tgt(false, { kind: 'mtGround', i: ni, j: nj, d: 0, near: true }), p = hwScreenAt((t0.i*.25 + ni*.75)*LOT, MT_Y, (t0.j*.25 + nj*.75)*LOT);
    if (t && t.l === l && p) aim(false, t, p[0], p[1], true, true); else aimClear();
  }

  /* ---------- drag to build ---------- */
  // DR: { o (where it starts: { kind: 'hw'|'hwNew'|'mtLast'|'mtFirst'|'mtNew', h|l, keep }), tiles (the new plots, in order away from the line), block, drawing, at, cam }
  let DR = null;
  const DH = hwHiMake(0x38e8e0, .3), DB = hwHiMake(0xff3a4a, .32);   // the stretch's outline, and the plot in the way
  const isNew = o => o.kind === 'hwNew' || o.kind === 'mtNew';
  const isHw = o => o.kind === 'hw' || o.kind === 'hwNew';
  // the plots of the line the stretch carries on from (its last two, outward), so the outline turns where the track will
  const anchor = o => o.kind === 'hw' ? o.h.tiles.slice(-2) : o.kind === 'mtLast' ? o.l.tiles.slice(-2) : o.kind === 'mtFirst' ? o.l.tiles.slice(0, 2).reverse() : [];
  const chainOf = () => anchor(DR.o).concat(DR.tiles);
  // can the next plot go at (i, j)? { why, tile }
  function stepWhy(i, j, chain){
    const o = DR.o, cur = chain[chain.length - 1];
    if (isHw(o)){
      const L = Math.max(cur.L - HW_STEP_L, Math.min(cur.L + HW_STEP_L, hwLevel)), tile = { i, j, L };   // (each plot steps toward the chosen height, as a tap's piece does)
      let why = hwTileWhy(i, j, L, o.h || null);
      if (!why && DR.tiles.some(q => q.i === i && q.j === j && Math.abs(q.L - L) < 2)) why = 'another highway is there';
      if (!why && chain.length === 1) why = hwRampWhy(cur.i, cur.j, cur.L, [cur.i - i, cur.j - j], o.h || null);   // (the entry ramp's sky, behind the first plot)
      return { why, tile };
    }
    const tile = { i, j };
    let why = mtTileWhy(i, j);
    if (!why && DR.tiles.some(q => q.i === i && q.j === j)) why = 'a metro line is already here';
    if (!why && chain.length === 1){ const tmp = { tiles: [cur, tile], st: [], sides: {} }; if (![1, -1].some(sd => mtLiftOK(tmp, 0, sd))) why = 'the first station\'s lift has no room'; }
    if (!why && o.kind === 'mtLast' && o.l.done && !DR.tiles.length && o.keep){ const pv = chain[chain.length - 2]; if (pv && (i - cur.i !== cur.i - pv.i || j - cur.j !== cur.j - pv.j)) why = 'the end station stays a station'; }
    return { why, tile };
  }
  // the finger's plot, where its line crosses the height the line runs at
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  function tileAt(x, y, py){
    const r = canvas.getBoundingClientRect(); _ndc.set(((x - r.left)/r.width)*2 - 1, -((y - r.top)/r.height)*2 + 1); _ray.setFromCamera(_ndc, cam);
    const o = _ray.ray.origin, d = _ray.ray.direction; if (Math.abs(d.y) < 1e-4) return null;
    const s = (py - o.y)/d.y; if (s < 0) return null;
    return { i: Math.round((o.x + d.x*s)/LOT), j: Math.round((o.z + d.z*s)/LOT) };
  }
  const lineY = q => q.L !== undefined ? hwY(q.L) : MT_Y;
  const tmpLine = tiles => ({ id: 'tt', lanes: DR.o.h ? DR.o.h.lanes : hwLanesPick, tiles, done: false, st: [], sides: {} });
  function drawShow(){
    const chain = chainOf(), k0 = anchor(DR.o).length, hw = isHw(DR.o), show = hw ? hwHiShow : mtHiShow;
    hwGhost.g.visible = false; hwHighlight(null);
    DH.key = ''; if (DR.tiles.length) show(DH, tmpLine(chain), k0, chain.length - 1, 0x38e8e0); else show(DH, null);
    DB.key = ''; if (DR.block) show(DB, tmpLine(chain.concat([DR.block])), chain.length, chain.length, 0xff3a4a); else show(DB, null);
  }
  function drawHide(){ hwHiShow(DH, null); hwHiShow(DB, null); }
  function drawClear(){ if (!DR) return; DR = null; drawHide(); hideGhost(); }
  let lastBlock = '';
  function blockAt(b){
    DR.block = b; const k = b.i + ',' + b.j + ':' + b.why;
    if (k !== lastBlock){ lastBlock = k; say(short(b.why)); buzz(16); }
  }
  // where a drag starting at (x, y) would draw from: a drawn stretch, the outline aimed, or a line's open end (the nearest within END_PX), or null
  function downAt(x, y){
    if (!(hwMode || mtMode)) return null;
    const hw = hwMode, near = (wx, wy, wz) => { const p = hwScreenAt(wx, wy, wz); return p ? Math.hypot(p[0] - x, p[1] - y) : Infinity; };
    if (DR && !DR.drawing && isHw(DR.o) === hw && camSig() === DR.cam){   // a stretch waiting to be placed: drawing on from it (from the plot pressed)
      let m = -1, bd = NEAR_PX; DR.tiles.forEach((q, k) => { const d = near(q.i*LOT, lineY(q), q.j*LOT); if (d < bd){ bd = d; m = k; } });
      if (m >= 0) return { cont: m };
    }
    if (AIM && AIM.hw === hw && AIM.cam === camSig() && AIM.t && Math.hypot(x - AIM.fx, y - AIM.fy) < NEAR_PX){ const t = AIM.t;
      if (hw && (t.type === 'extend' || t.type === 'finish')) return { kind: 'hw', h: t.h };
      if (hw && t.type === 'start' && t.ok) return { kind: 'hwNew', i: t.i, j: t.j, L: t.L };
      if (!hw && (t.type === 'extend' || t.type === 'finish' || t.type === 'reopen')) return mtLastOf(t.l);
      if (!hw && t.type === 'prepend') return { kind: 'mtFirst', l: t.l };
      if (!hw && t.type === 'start' && t.ok) return { kind: 'mtNew', i: t.i, j: t.j };
    }
    let best = null, bd = END_PX;
    const cand = (d, o) => { if (d < bd){ bd = d; best = o; } };
    if (hw) for (const h of highways){ if (h.done) continue; const e = h.tiles[h.tiles.length - 1]; cand(near(e.i*LOT, hwY(e.L), e.j*LOT), { kind: 'hw', h }); }
    else for (const l of metros){ if (l.loop) continue; const n = l.tiles.length, e = l.tiles[n - 1];
      cand(near(e.i*LOT, MT_Y, e.j*LOT), mtLastOf(l));
      if (n > 1 && (!l.done || l === mtActive)) cand(near(l.tiles[0].i*LOT, MT_Y, l.tiles[0].j*LOT), { kind: 'mtFirst', l }); }
    return best;
  }
  const mtLastOf = l => ({ kind: 'mtLast', l, keep: l.done && !mtIsStop(l, l.tiles.length - 2) });
  function drawStart(o){
    aimClear(); LAST = null; lastBlock = '';
    if (o.cont !== undefined && DR){ DR.tiles.length = o.cont + 1; DR.block = null; DR.drawing = true; return; }
    drawClear();
    DR = { o, tiles: isNew(o) ? [o.kind === 'hwNew' ? { i: o.i, j: o.j, L: o.L } : { i: o.i, j: o.j }] : [], block: null, drawing: true };
    drawShow();
  }
  function drawMove(x, y){
    if (!DR || !DR.drawing) return;
    const base = isNew(DR.o) ? 1 : 0;
    for (let guard = 0; guard < 48; guard++){
      const chain = chainOf(), cur = chain[chain.length - 1], to = tileAt(x, y, lineY(cur)); if (!to) break;
      if (to.i === cur.i && to.j === cur.j){ DR.block = null; break; }
      // the finger back over the stretch, or the end it started from: the stretch cut back to there
      let m = -1; for (let k = DR.tiles.length - 1; k >= 0; k--) if (DR.tiles[k].i === to.i && DR.tiles[k].j === to.j){ m = k; break; }
      if (m >= base - 1 && m >= 0){ DR.tiles.length = Math.max(base, m + 1); DR.block = null; continue; }
      const a0 = anchor(DR.o), e = a0[a0.length - 1];
      if (e && e.i === to.i && e.j === to.j){ DR.tiles.length = base; DR.block = null; break; }
      // one plot nearer the finger: along the longer way first, the other if that one is in the way
      const di = Math.sign(to.i - cur.i), dj = Math.sign(to.j - cur.j);
      const ways = (Math.abs(to.i - cur.i) >= Math.abs(to.j - cur.j) ? [[di, 0], [0, dj]] : [[0, dj], [di, 0]]).filter(([a, b]) => a || b);
      let stepped = false, first = null;
      for (const [a, b] of ways){
        const ni = cur.i + a, nj = cur.j + b, pv = chain[chain.length - 2];
        if (pv && pv.i === ni && pv.j === nj){ if (DR.tiles.length > base){ DR.tiles.pop(); stepped = true; break; } continue; }   // (back the way it came: a plot taken off)
        const s = stepWhy(ni, nj, chain);
        if (!s.why){ DR.tiles.push(s.tile); DR.block = null; stepped = true; break; }
        if (!first) first = Object.assign({ why: s.why }, s.tile);
      }
      if (!stepped){ if (first) blockAt(first); break; }
    }
    drawShow();
  }
  function drawEnd(){
    if (!DR || !DR.drawing) return;
    DR.drawing = false;
    const base = isNew(DR.o) ? 1 : 0;
    // carried on from the first station: the new first station needs its tile and room for its lift; plots are taken off the end until it has
    if (DR.o.kind === 'mtFirst'){ let why = '';
      while (DR.tiles.length){ const f = DR.tiles[DR.tiles.length - 1], tmp = { tiles: DR.tiles.slice().reverse().concat(DR.o.l.tiles), st: [], sides: {} };
        if (cells.get(ckey(f.i, f.j)) && [1, -1].some(sd => mtLiftOK(tmp, 0, sd))) break;
        why = why || (cells.get(ckey(f.i, f.j)) ? 'No room for the station lift' : NOTILE); DR.tiles.pop(); }
      if (why) say(why); }
    DR.block = null;
    if (DR.tiles.length <= base){ drawClear(); return; }
    DR.at = performance.now(); DR.cam = camSig(); drawShow();
  }
  // a tap on the stretch (any of its plots, or between two)
  function onStretch(x, y){
    const chain = chainOf(), k0 = Math.max(0, anchor(DR.o).length - 1);
    for (let k = k0; k < chain.length; k++){ const q = chain[k], p = hwScreenAt(q.i*LOT, lineY(q), q.j*LOT); if (p && Math.hypot(p[0] - x, p[1] - y) < NEAR_PX) return true;
      const r = chain[k + 1]; if (r){ const m = hwScreenAt((q.i + r.i)*LOT/2, (lineY(q) + lineY(r))/2, (q.j + r.j)*LOT/2); if (m && Math.hypot(m[0] - x, m[1] - y) < NEAR_PX) return true; } }
    return false;
  }
  // the whole stretch built, in one go (one rebuild of the plots it touches, one sound)
  function placeStretch(){
    const o = DR.o, T_ = DR.tiles.map(q => Object.assign({}, q)); drawClear();
    if (o.kind === 'hw'){ const h = o.h, e = h.tiles[h.tiles.length - 1]; if (!highways.includes(h) || h.done) return; h.tiles.push(...T_); hwActive = h; hwCommit(h, [[e.i, e.j]].concat(T_.map(q => [q.i, q.j]))); }
    else if (o.kind === 'hwNew'){ const h = { id: hwNext++, lanes: hwLanesPick, tiles: T_, done: false, side: 1 }; highways.push(h); hwActive = h; hwCommit(h, T_.map(q => [q.i, q.j])); }
    else if (o.kind === 'mtLast'){ const l = o.l; if (!metros.includes(l)) return; const before = mtTouched(l), n = l.tiles.length;
      if (l.done){ l.done = false; if (o.keep) l.st = [...l.st, n - 1]; }   // (a finished line carried on from its end station, which stays a station, as a tap does: metro.js 'reopen')
      l.tiles.push(...T_); mtActive = l; mtCommit(l, before); }
    else if (o.kind === 'mtFirst'){ const l = o.l; if (!metros.includes(l)) return; const before = mtTouched(l), keys = mtStationKeys(l), sides = mtSideKeys(l);
      keys.delete(mtTileKey(l.tiles[0]));   // (the old first station turns to plain track: metro.js 'prepend')
      mtReshape(l, T_.slice().reverse().concat(l.tiles), keys, sides); mtActive = l; mtCommit(l, before); }
    else if (o.kind === 'mtNew'){ const l = { id: mtNext++, tiles: T_, done: false, st: [], sides: {} }; metros.push(l); mtActive = l; mtCommit(l, []); }
    sfx.play('place'); buzz(14); U.draws++;
  }

  /* ---------- a tap ---------- */
  function tap(x, y){
    if (!(hwMode || mtMode) || (typeof LOADP !== 'undefined' && LOADP.on)) return false;
    const hw = hwMode, now = performance.now();
    if (DR && !DR.drawing){ if (isHw(DR.o) === hw && DR.cam === camSig() && onStretch(x, y)){ placeStretch(); LAST = null; return true; } drawClear(); }   // (a tap elsewhere drops it, and aims there)
    const pk = pickAt(hw, x, y), t = tgt(hw, pk);
    if (AIM && AIM.hw === hw && AIM.cam === camSig() && AIM.t && AIM.t.type !== 'none' && (tkey(t) === AIM.key || (!AIM.strict && Math.hypot(x - AIM.fx, y - AIM.fy) < NEAR_PX))){ place(AIM); LAST = null; return true; }
    const st = !hw && pk && pk.kind === 'mtTile' && !pk.l.loop && pk.k === 0 ? pk.l : null;   // the first station of a line
    if (st && LAST && LAST.l === st && now - LAST.t < DT2_MS && Math.hypot(x - LAST.x, y - LAST.y) < DT_PX){ LAST = null; aimClear(); turn(st); return true; }
    LAST = st ? { l: st, t: now, x, y } : null;
    aim(hw, t, x, y, !!st && t && t.type === 'none');   // (a first tap on the station says nothing: it may be the first of a double tap)
    return true;
  }
  // the height or the lanes changed with an aim up: aimed again where it was, at the new height
  function relevel(){ if (AIM && AIM.hw && hwMode){ const A = AIM; aim(true, tgt(true, pickAt(true, A.fx, A.fy)), A.fx, A.fy); } return true; }

  setInterval(() => {
    if (!hwMode && !mtMode){ if (AIM) aimClear(); if (DR){ DR = null; drawHide(); } LAST = null; return; }
    if (DR && DR.drawing && !(typeof act !== 'undefined' && act && act.draw)) drawEnd();   // (the finger went without a lift: the stretch stays as drawn)
    const now = performance.now(), cs = camSig();
    if (AIM && (now - AIM.at > aimMs() || AIM.cam !== cs || AIM.hw !== hwMode)) aimClear();
    if (DR && !DR.drawing && (now - DR.at > aimMs() || DR.cam !== cs || isHw(DR.o) !== hwMode)) drawClear();
  }, 200);

  Object.assign(U, {
    on(){ return true; }, downAt, tap, drawStart, drawMove, drawEnd, relevel,
    cancel(){ if (DR && DR.drawing) drawClear(); },
    clear(){ aimClear(); drawClear(); LAST = null; },
    busy(){ return !!(AIM || DR); },
  });
  return U;
})();
