// Neon Terrarium: Camera, mouse, touch and keyboard controls, and the settings panel.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- camera ---------- */
let shadowDirty = true;
let spinT = 0, yaw = .7, yawT = .7, zoom = 13.2, zoomT = 13.2;
// Tilt mode (Space): the camera stays where it is, and dragging up and down (or W and S) tilts it, from a low angle up to
// nearly straight down, for placing things the isometric view hides; dragging sideways (or A and D) still turns it.
// Space again goes back to the isometric view.
let tiltMode = false, pitchT = PITCH0;
function setTiltMode(on){
  tiltMode = on; if (!on) pitchT = PITCH0;
  const el = document.getElementById('tiltChip'); if (el) el.hidden = !on;
}
const camPosTrue = new THREE.Vector3(), camPix = new THREE.Vector2(), keys = new Set(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
const YAW_MIN = .24;   // (was .12: the last stretch of a turn crept at about a tenth of a degree a frame for a quarter of a second, every frame of it drawn the old way, the whole city: owner's report Oct 27)
function updateCamera(dt){
  if (S.spin && !dragging){ spinT += dt; if (spinT > 6){ spinT = 0; yawT += PI/4; } }
  // the turn eases out, but never slower than YAW_MIN radians a second: an exponential ease alone crawled for about a second at the end (the whole city
  // drawn the old way for a movement too small to see) and then snapped the last few pixels into place, a visible jump just before the turn stopped
  { const d = yawT - yaw, ex = d*Math.min(1, dt*3.5), mn = YAW_MIN*dt; yaw += Math.abs(ex) >= mn || window.__YAW_EASE_OLD ? ex : Math.sign(d)*Math.min(Math.abs(d), mn); }
  PITCH += (pitchT - PITCH)*Math.min(1, dt*6); if (Math.abs(pitchT - PITCH) < 1e-4) PITCH = pitchT;
  zoom += (zoomT-zoom)*Math.min(1, dt*8);
  // easing never quite arrives, so a "still" camera kept drifting by fractions of a pixel; snap once close
  if (Math.abs(yawT-yaw) < 1e-3) yaw = yawT;
  if (Math.abs(zoomT-zoom) < 1e-3) zoom = zoomT;
  // WASD / arrow keys: pan across the ground, relative to the way the camera faces; Shift goes faster
  const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const rt = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  if (tiltMode && (fw || rt)){ pitchT = clamp(pitchT + fw*dt*.9, PITCH_MIN, PITCH_MAX); yawT += rt*dt*1.4; }   // (locked in place: the keys tilt and turn it instead; D swings the camera to its right, as E does)
  const panning = !tiltMode && (fw !== 0 || rt !== 0);
  if (panning){
    const sp = zoom*1.5*(keys.has('shift') ? 2.5 : 1)*dt/Math.hypot(fw, rt);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    camGoal.x += (-sy*fw + cy*rt)*sp; camGoal.z += (-cy*fw - sy*rt)*sp;
    const lim = GRID_MAX*LOT; camGoal.x = clamp(camGoal.x, -lim, lim); camGoal.z = clamp(camGoal.z, -lim, lim);
  }
  camT.lerp(camGoal, Math.min(1, dt*(panning ? 10 : 3))); if (camT.distanceTo(camGoal) < 1e-3) camT.copy(camGoal);
  // Move the camera in whole render pixels across the screen, so a pan slides the picture without the
  // pixels crawling. (Motion along the view direction changes nothing in an orthographic view.)
  const px = 2*zoom/H, sy = Math.sin(yaw), cy = Math.cos(yaw), sp_ = Math.sin(PITCH), cp_ = Math.cos(PITCH);
  _cr.set(cy, 0, -sy); _cv.set(-sy*cp_, -sp_, -cy*cp_); _cu.crossVectors(_cr, _cv);
  // (under the title screen the camera slides a hair every frame to keep the city in the turning pod's window: whole-pixel steps showed as a jitter)
  const pxS = FAR_SNAP_H ? 2*zoom/FAR_SNAP_H : px;   // (zoomed out: the moving view's pixels, which the sharp view's halve exactly, so the city stays put as it sharpens: sky.js applyRenderRes)
  const smooth = typeof TITLE !== 'undefined' && TITLE.on, snapPx = v => smooth ? v : Math.round(v/pxS)*pxS;
  const a = snapPx(camT.dot(_cr)), b = snapPx(camT.dot(_cu)), cTrue = camT.dot(_cv), c = SC.pin(cTrue);   // (the static cache keeps the camera's place along the view fixed for as long as it can: see staticcache.js)
  camPix.set(a/px, b/px);
  _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, cTrue);
  camPosTrue.set(_cs.x + sy*cp_*CAM_DIST, _cs.y + sp_*CAM_DIST, _cs.z + cy*cp_*CAM_DIST);   // (where the camera really is)
  _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, c);
  cam.position.set(_cs.x + sy*cp_*CAM_DIST, _cs.y + sp_*CAM_DIST, _cs.z + cy*cp_*CAM_DIST);
  cam.lookAt(_cs);
  placeSun();
  const asp = W/H; cam.left=-zoom*asp; cam.right=zoom*asp; cam.top=zoom; cam.bottom=-zoom; cam.updateProjectionMatrix();
}
// Touch: the starting zoom, at the start and after the title: 16 on the short side, the phone benchmark's view of a normal city (its turns),
// owner's choice Oct 30. Short-side zooms: times ZK for zoom itself (sky.js)
const TOUCH_ZOOM0 = 16;
function touchZoomPhys(){ return TOUCH_ZOOM0; }
function touchZoomFit(){ return TOUCH_ZOOM0; }
const ptrs = new Map(); let dragging = false, pinch0 = 0, zoom0 = 0, pinchX = 0;
let act = null;   // the gesture in progress: { kind:'paint'|'rotate'|'right'|'touch', x, y, moved, done:Set, timer }
const pdist = () => { const [a,b] = [...ptrs.values()]; return Math.hypot(a.x-b.x, a.y-b.y) || 1; };
const pang = () => { const [a,b] = [...ptrs.values()]; return Math.atan2(b.y - a.y, b.x - a.x); };
const pmid = () => { const [a,b] = [...ptrs.values()]; return { x: (a.x + b.x)/2, y: (a.y + b.y)/2 }; };
// a finger dragging the ground: the ground follows it (touch only; a mouse drag still turns the view)
function touchPan(dx, dy){
  const k = 2*zoom/(canvas.clientHeight || 1), sy = Math.sin(yaw), cy = Math.cos(yaw), f = dy*k/Math.max(.3, Math.sin(PITCH)), r = -dx*k;
  camGoal.x += cy*r - sy*f; camGoal.z += -sy*r - cy*f;
  const lim = GRID_MAX*LOT; camGoal.x = clamp(camGoal.x, -lim, lim); camGoal.z = clamp(camGoal.z, -lim, lim);
  camT.copy(camGoal); MON.userPan();
}
const pmidX = () => { const [a,b] = [...ptrs.values()]; return (a.x + b.x)/2; };
function paintAt(x, y){
  const t = targetOf(pickAt(x, y)); if (!t) return;
  const k = t.type === 'empty' || t.type === 'side' ? ckey(t.i, t.j) : t.type === 'megaUp' ? 'mega:' + t.m.id : ckey(t.c.i, t.c.j);
  if (act.done.has(k)) return;               // each spot changes at most once per stroke
  act.done.add(k); applyTarget(t);
}
// Shift (tapped): pick the height a building starts at (residential for now). Over a plot, a roof or open sky, tap Shift:
// that plot is held, and moving the pointer up and down raises or lowers where the new building will start, a floor at a
// time (an outline there, and a column for the scaffold under it). Click builds (a building of a random kind, on a
// scaffold if it starts above what's there); Shift again or Esc lets go.
let HL = null;
const hlTip = (() => { const d = document.createElement('div'); d.id = 'hlTip'; d.style.cssText = 'position:fixed;z-index:60;pointer-events:none;font:11px/1.3 "JetBrains Mono",monospace;color:#f3eadb;background:rgba(14,12,18,.82);border:1px solid rgba(255,255,255,.18);padding:3px 7px;transform:translate(14px,-50%);display:none;white-space:nowrap'; document.body.appendChild(d); return d; })();
function hlScreenY(x, y, z){ const v = new THREE.Vector3(x, y, z).project(cam), r = canvas.getBoundingClientRect(); return r.top + (1 - (v.y*.5 + .5))*r.height; }
function hlStart(){
  if (!S.zone || !ptrLast || hwMode || mtMode || delMode || megaPick) return;
  const t = targetOf(pickAt(ptrLast.x, ptrLast.y)); if (!t) return;
  // under a pod: pick how many floors the building under it is (a floor's gap always left under the pod)
  if (t.type === 'belowUp' && t.c && t.c.lift){
    const c = t.c, base = groundTop(c), deck = c.below && c.below.length ? .1 : 0, max = Math.floor((c.lift.y - base - deck + .02)/FH) - 1;
    if (max < 1) return;
    HL = { t, c, i: c.i, j: c.j, x: c.x, z: c.z, base: base + deck, under: true, max, sy: ptrLast.y, pxF: Math.max(4, hlScreenY(c.x, base, c.z) - hlScreenY(c.x, base + FH, c.z)), floors: 1 };
    hlMove(ptrLast.x, ptrLast.y); return;
  }
  let c = null, i, j;
  if (t.type === 'empty'){ i = t.i; j = t.j; }
  else if ((t.type === 'up' || t.type === 'onto') && t.c && !t.c.mega && !(t.type === 'onto' && t.c.sections.length)){ c = t.c; i = c.i; j = c.j; }
  else return;
  const base = c && c.sections.length ? c.height : CURB, x = i*LOT, z = j*LOT;
  const canRaise = (!c || !c.lift) && !hwAt(i, j).length && !mtAt(i, j).length;
  HL = { t, c, i, j, x, z, base, canRaise, sy: ptrLast.y, pxF: Math.max(4, hlScreenY(x, base, z) - hlScreenY(x, base + FH, z)), floors: 0 };
  hlMove(ptrLast.x, ptrLast.y);
}
function hlStop(){ HL = null; hlTip.style.display = 'none'; hover.visible = hoverFill.visible = hoverStrip.visible = false; }
function hlMove(px, py){
  if (!HL) return;
  if (HL.under){
    HL.floors = clamp(1 + Math.round((HL.sy - py)/HL.pxF), 1, HL.max);
    hoverMat.color.set(ZONES[S.zone].col); hoverStrip.visible = false; hoverFill.visible = false;
    hover.position.set(HL.x, HL.base + HL.floors*FH/2, HL.z); hover.scale.set(SIDE, HL.floors*FH, SIDE); hover.visible = true;
    hlTip.textContent = HL.floors + ' floor' + (HL.floors > 1 ? 's' : '') + ' under the pod (up to ' + HL.max + ') · click to build';
    hlTip.style.left = px + 'px'; hlTip.style.top = py + 'px'; hlTip.style.display = 'block'; return;
  }
  HL.floors = HL.canRaise ? clamp(Math.round((HL.sy - py)/HL.pxF), 0, 40) : 0;
  const y = HL.base + HL.floors*FH;
  hoverMat.color.set(ZONES[S.zone].col); hoverStrip.visible = false;
  hover.position.set(HL.x, y + FH, HL.z); hover.scale.set(SIDE, FH*2, SIDE); hover.visible = true;
  if (HL.floors){ hoverFill.position.set(HL.x, (HL.base + y)/2, HL.z); hoverFill.scale.set(SIDE*.92, y - HL.base, SIDE*.92); hoverFill.visible = true; } else hoverFill.visible = false;
  hlTip.textContent = HL.floors ? 'Starts ' + HL.floors + ' floor' + (HL.floors > 1 ? 's' : '') + ' up, on a scaffold · click to build' : HL.canRaise ? 'Move up to raise it · click to build' : 'No room to raise it here · click to build';
  hlTip.style.left = px + 'px'; hlTip.style.top = py + 'px'; hlTip.style.display = 'block';
}
function hlBuild(){
  const H0 = HL; hlStop(); const zone = S.zone; if (!H0 || !zone) return;
  if (H0.under){ addBelowUp(H0.c, zone, { mf: H0.floors }); return; }
  if (!H0.floors){ applyTarget(H0.t); return; }
  let c = H0.c || cells.get(ckey(H0.i, H0.j)) || addPlatform(H0.i, H0.j, null); if (!c) return;
  finishAnimsOn(c); addLift(c, H0.base + H0.floors*FH, zone);
}
// Space with Residential picked: one more single home on the plot, roof or pod under the pointer (a building as tall as you like, a floor at a time)
function unitAt(px, py){
  const t = targetOf(pickAt(px, py)); if (!t) return false;
  if (t.type === 'empty'){ const c = addPlatform(t.i, t.j, null); if (c){ finishAnimsOn(c); addSection(c, S.zone, { mf: 1 }); } return true; }
  if (t.type === 'belowUp' && t.c && t.c.lift){ addBelowUp(t.c, S.zone, { mf: 1 }); return true; }   // (under a pod: one home on the ground or on the building there, a floor's gap kept)
  if ((t.type === 'up' || (t.type === 'onto' && !t.c.sections.length)) && t.c && !t.c.mega){ addSection(t.c, S.zone, Object.assign({ mf: 1 }, t.after !== undefined ? { after: t.after } : {})); return true; }
  return false;
}
let shiftTap = null;
// a finger, with a zone picked: a tap builds a moment later (about a quarter second), so a second tap can make it a double tap instead.
// Double tap: one floor (as Space does). Double tap and, still pressing, drag up or down: pick the height (as Shift does); lifting builds.
// Nothing changes for a mouse.
let tapPend = null;
const DT_MS = 250, DT_PX = 40;
const tapWaits = () => S.zone && !hwMode && !mtMode && !megaPick && !delMode && !PERIM;
function tapBuild(x, y){ const a = act; act = { done: new Set() }; try { if (hwMode) hwClick(x, y); else if (mtMode) mtClick(x, y); else if (megaPick) placeMegaHere(x, y); else paintAt(x, y); } finally { act = a; } }
function tapFlush(){ if (!tapPend) return; const p = tapPend; tapPend = null; clearTimeout(p.timer); if (!(typeof LOADP !== 'undefined' && LOADP.on)) tapBuild(p.x, p.y); }
// Touch, with a zone picked (owner's choice, Oct 30, the mobile UI plan): a tap builds at once. The building just made stays "fresh" for a moment:
// tapping it again trims it to one floor (what a double tap used to do, as Space does), and pressing it again and dragging up or down picks the
// height it starts at (what double tap and drag did, as Shift does), lifting builds. The second tap always means "change what I just made".
// (Trimming changes the fresh section in place: one rebuild, no removal sweep, no second sound.)
let FRESH = null;
const FRESH_MS = 450, FRESH_PX = 40;
const freshNear = (x, y) => FRESH && performance.now() - FRESH.t < FRESH_MS && Math.hypot(x - FRESH.x, y - FRESH.y) < FRESH_PX && freshOk(FRESH);
const freshOk = f => cells.get(ckey(f.c.i, f.c.j)) === f.c && f.c.sections[f.c.sections.length - 1] === f.sec && !f.c.lift;
const tEmit = (name, d) => { try { dispatchEvent(new CustomEvent('nt:' + name, { detail: d })); } catch (e) {} };   // (for the touch tutorial: tutorial.js)
// Touch placing, as touch builders do it (owner, Oct 30; the conversation's research):
//  - snap: a tap that hits nothing to build on goes to the nearest plot within a fingertip (SNAP_PX), its top as if tapped there
//  - aim, then place: when a plot is narrower on screen than AIM_PX (zoomed out, about 6 mm on a phone), the first tap shows where it will build
//    (the outline) with a tick, and a second tap on it, or near the first, builds there; a tap elsewhere aims there instead. Closer in, a tap
//    builds at once as before. The aim goes when the view moves or after 8 s
const AIM_PX = 36, SNAP_PX = 40;
let AIM = null;
const plotPx = () => LOT*(canvas.clientHeight || innerHeight)/(2*zoom);
const camSig = () => camGoal.x.toFixed(3) + ',' + camGoal.z.toFixed(3) + ',' + zoomT.toFixed(3) + ',' + yawT.toFixed(4) + ',' + pitchT.toFixed(4);
const aimKey = t => !t ? null : t.type === 'empty' || t.type === 'side' ? t.type + ckey(t.i, t.j) : t.type === 'megaUp' ? 'mega:' + t.m.id : t.type + ckey(t.c.i, t.c.j);
function touchAimAt(x, y){
  const t = targetOf(pickAt(x, y)); if (t) return { t, x, y };
  let best = null, bd = SNAP_PX*SNAP_PX; const r = viewRect(), v = new THREE.Vector3();
  for (const c of cells.values()){ if (c.mega || c.wall) continue; v.set(c.x, c.sections.length ? c.height : CURB, c.z).project(cam); if (v.z > 1) continue;
    const sx = r.left + (v.x*.5 + .5)*r.width, sy = r.top + (1 - (v.y*.5 + .5))*r.height, d = (sx - x)**2 + (sy - y)**2; if (d < bd){ bd = d; best = [sx, sy]; } }
  if (!best) return null;
  const t2 = targetOf(pickAt(best[0], best[1])); return t2 ? { t: t2, x: best[0], y: best[1] } : null;
}
function aimClear(){ if (!AIM) return; AIM = null; hover.visible = hoverFill.visible = hoverStrip.visible = false; if (typeof TUI !== 'undefined' && TUI.aimTip) TUI.aimTip(null); }
setInterval(() => { if (AIM && (performance.now() - AIM.at > 8000 || AIM.cam !== camSig() || !S.zone)) aimClear(); }, 200);
function freshBuild(x, y){
  { const pk = typeof TUI !== 'undefined' ? pickAt(x, y) : null; if (pk && pk.c && pk.c.mega && megas.has(pk.c.mega) && TUI.megaTap(megas.get(pk.c.mega))) return; }
  if (S.zone && !hwMode && !mtMode && !megaPick && !delMode){
    const a = touchAimAt(x, y); if (!a){ aimClear(); return; }
    if (plotPx() < AIM_PX){
      const k = aimKey(a.t), same = AIM && AIM.cam === camSig() && (k === AIM.key || Math.hypot(x - AIM.fx, y - AIM.fy) < SNAP_PX);
      if (!same){ const moved = !!AIM; AIM = { t: a.t, key: k, x: a.x, y: a.y, fx: x, fy: y, at: performance.now(), cam: camSig() }; showHover(a.t);
        if (typeof TUI !== 'undefined'){ TUI.buzz(moved ? 4 : 8); if (TUI.aimTip) TUI.aimTip(x, y); } tEmit('aim'); return; }
      x = AIM.x; y = AIM.y; aimClear();
    } else { x = a.x; y = a.y; aimClear(); }
  }   // (a tap on a megastructure shows its screen's button, never builds)
  const t = targetOf(pickAt(x, y));
  const key = t && t.after === undefined ? (t.type === 'empty' ? ckey(t.i, t.j) : (t.type === 'up' || t.type === 'onto') && t.c && !t.c.mega && !t.c.lift ? ckey(t.c.i, t.c.j) : null) : null;
  const before = key && cells.get(key) ? cells.get(key).sections.length : 0;
  tapBuild(x, y);
  const c = key && cells.get(key);
  FRESH = c && c.sections.length === before + 1 && !c.lift ? { c, sec: c.sections[c.sections.length - 1], x, y, t: performance.now() } : null;
  if (FRESH){ if (typeof TUI !== 'undefined') TUI.buzz(12); tEmit('build'); }
}
// (hold: the region's plants and glows wait for a build sweep that will let them go; only when one follows. A hold with no sweep after it was never let
//  go, and every later edit in that region left its plants and glows as they were: a removed building's foliage stayed, owner Oct 30)
function freshRebuild(c, hold){
  stageFinishNear([c]); finishAnimsOn(c); if (hold) holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  refresh([c]); dropView(old);
  return old;
}
function freshTrim(f){
  if (!freshOk(f)) return false;
  const c = f.c, k = c.sections.length - 1, y0 = k > 0 ? c.sectionTops[k - 1] : CURB;
  if (f.sec.mf === 1) return true;
  f.sec.mf = 1; freshRebuild(c, true);
  startAnim(c, 'build', y0 - .05, c.height + 1.2, f.sec.zone, SIDE, null, null, { quiet: true });
  FRESH = null; tEmit('trim'); return true;
}
function freshUndo(f){   // (quietly, for the height pick that replaces it)
  if (!freshOk(f)) return false;
  f.c.sections.pop(); freshRebuild(f.c); FRESH = null; return true;
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (HL && e.pointerType === 'touch') hlStop();   // (a finger's height pick ends when it lifts: a stray one left over just goes)
  if (HL){ if (e.button === 0) hlBuild(); else hlStop(); return; }   // (a height being picked: a click builds there, any other button lets go)
  // (a mouse is one pointer: whatever an earlier press left behind, its release missed (the window lost focus mid-press, a menu or dialog took the release),
  //  is let go here, so this press starts clean instead of carrying on the old one: in delete mode that left the selection following the cursor, unpressed)
  if (e.pointerType === 'mouse' && ptrs.size){ ptrs.clear(); act = null; }
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragging = true;
  if (e.pointerType === 'touch' && ptrs.size === 1 && tapWaits() && freshNear(e.clientX, e.clientY)){   // pressing the building just made: trim it, or drag for a height
    act = { kind: 'fresh2', x: FRESH.x, y: FRESH.y, sy: e.clientY, started: false, f: FRESH }; return; }
  if (e.pointerType === 'touch' && tapPend){   // a second tap close to the first, soon after: a double tap. Anything else: the first tap builds now
    if (ptrs.size === 1 && performance.now() - tapPend.t < DT_MS + 150 && Math.hypot(e.clientX - tapPend.x, e.clientY - tapPend.y) < DT_PX){
      clearTimeout(tapPend.timer); const p = tapPend; tapPend = null;
      act = { kind: 'dtap', x: p.x, y: p.y, sy: e.clientY, started: false }; return; }
    tapFlush(); }
  if (ptrs.size === 2){ if (act && act.timer) clearTimeout(act.timer); if (act && (act.kind === 'dtap' || act.kind === 'fresh2') && HL) hlStop(); if (typeof TUI !== 'undefined') TUI.ring(null); act = { kind: 'pinch', touch: e.pointerType === 'touch', ang: pang(), mid: pmid() }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); hover.visible = hoverFill.visible = hoverStrip.visible = false; return; }
  if (delMode && e.button === 0){ act = { kind: 'del', x: e.clientX, y: e.clientY, moved: false, from: groundCellAt(e.clientX, e.clientY) }; return; }   // delete mode: drag selects
  if ((e.button === 0 || e.pointerType === 'touch') && !hwMode && !mtMode && !megaPick){   // someone in the street under the pointer: a click opens the monitor on them (monitor.js)
    // (the quick test here; the exact one, which waits for the graphics card, only once it's a click: a press that starts turning the view never waits for it)
    const who = MON.pick(e.clientX, e.clientY); if (who){ act = { kind: 'npc', id: who, x: e.clientX, y: e.clientY, moved: false }; return; } }
  if (e.pointerType === 'touch'){
    // tap builds, drag paints, press and hold removes
    act = { kind: 'touch', x: e.clientX, y: e.clientY, moved: false, done: new Set() };
    // (a ring fills under the finger while it's held, so a removal is seen coming and can be cancelled by lifting; what was removed can be put back from
    //  the Restore chip for a few seconds: touchui.js)
    if (typeof TUI !== 'undefined' && !megaPick) TUI.ring(e.clientX, e.clientY, 550);
    act.timer = setTimeout(() => { if (act && act.kind === 'touch' && !act.moved){ if (typeof TUI !== 'undefined') TUI.ring(null);
      if (hwMode) hwRightClick(act.x, act.y); else if (mtMode) mtRightClick(act.x, act.y); else if (megaPick) selectMega(null);
      else { const pk = pickAt(act.x, act.y), snap = typeof TUI !== 'undefined' ? TUI.snapCell(pk) : null; removeAt(pk); if (snap) TUI.offerRestore(snap); if (typeof TUI !== 'undefined') TUI.buzz(30); tEmit('remove'); }
      act.kind = 'none'; } }, 550);
    return;
  }
  if (e.button === 0 && (hwMode || mtMode)){ act = { kind: 'sky', x: e.clientX, y: e.clientY, moved: false }; return; }   // highway or metro mode: a click builds, a drag turns the view
  if (e.button === 0){
    // a click (no drag) builds; a drag rotates the view. With "Drag to paint" on, a drag that starts on the city paints instead.
    // (the city is only picked here when painting is on: the click itself picks on release, and a press that starts turning the
    // view used to pick at once, which could make a plot again on the spot: a 50 to 170 ms freeze, Oct 25 trace)
    const pk = S.paint && !megaPick ? pickAt(e.clientX, e.clientY) : null;
    if (!pk || pk.kind === 'sky' || !S.paint || megaPick) act = { kind: 'sky', x: e.clientX, y: e.clientY, moved: false };
    else { act = { kind: 'paint', done: new Set() }; paintAt(e.clientX, e.clientY); }
  }
  else if (e.button === 2) act = { kind: 'right', x: e.clientX, y: e.clientY, moved: false };
  else if (e.button === 1) act = { kind: 'rotate' };
});
canvas.addEventListener('pointermove', e => { const _t0 = performance.now(); try { pointerMove(e); } finally { PH.outside('pointer move', performance.now() - _t0); } });
function pointerMove(e){
  const p = ptrs.get(e.pointerId);
  if (!p){ ptrLast = { x: e.clientX, y: e.clientY };   // just hovering
    // someone in the street under the pointer: they're outlined, and a click opens the monitor on them instead of building (monitor.js)
    if (!delMode && !hwMode && !mtMode && !megaPick && e.pointerType !== 'touch'){ MON.hoverAt(e.clientX, e.clientY); if (MON.pick(e.clientX, e.clientY)){ hover.visible = hoverFill.visible = hoverStrip.visible = false; return; } }
    else MON.hoverAt(null);
    if (delMode){ hover.visible = hoverFill.visible = hoverStrip.visible = false; return; }
    if (hwMode){ hwHover(e.clientX, e.clientY); return; }
    if (mtMode){ mtHover(e.clientX, e.clientY); return; }
    if (HL){ hlMove(e.clientX, e.clientY); return; }
    if (megaPick) showMegaGhost(megaPick, groundCellAt(e.clientX, e.clientY), megaTurn); else showHover(targetOf(pickAtSoft(e.clientX, e.clientY))); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y, tilt = () => { if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); };
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!act) return;
  if (act.kind === 'pinch'){ if (titleUp()) return; if (ptrs.size === 2){
    // two fingers on a touch screen: dragged up or down together (the gap and the angle between them nearly unchanged) they tilt the view, as in
    // Google Maps; anything else pinches, twists and pans as before. Which one is decided once the fingers have moved a little, and kept.
    if (act.touch && !act.mode){ const m = pmid(), d = pdist(); let da = pang() - (act.a0 ?? act.ang); if (da > PI) da -= 2*PI; if (da < -PI) da += 2*PI;
      if (act.m0 === undefined){ act.m0 = act.mid; act.a0 = act.ang; }
      const mx = m.x - act.m0.x, my = m.y - act.m0.y, dd = Math.abs(d - pinch0)/Math.max(1, pinch0);
      if (Math.hypot(mx, my) > 14 || dd > .08 || Math.abs(da) > .12) act.mode = Math.abs(my) > 2*Math.abs(mx) && dd < .1 && Math.abs(da) < .1 ? 'tilt' : 'pinch';
      if (act.mode === 'pinch'){ pinch0 = d; zoom0 = zoomT; act.ang = pang(); act.mid = m; }
      if (act.mode !== 'tilt') return; act.mid = m; tEmit('tilt'); }
    if (act.touch && act.mode === 'tilt'){ const m = pmid(); pitchT = clamp(pitchT + (m.y - act.mid.y)*.006, PITCH_MIN, PITCH_MAX); act.mid = m; return; }
    zoomT = clamp(zoom0*pinch0/pdist(), 5*ZK, 60*ZK);   // (the limits on the short side: ZK, sky.js) if (act.touch && Math.abs(zoomT - zoom0) > .05*zoom0) tEmit('zoom');
    if (act.touch){ const a = pang(), m = pmid(); let da = a - act.ang; if (da > PI) da -= 2*PI; if (da < -PI) da += 2*PI; yawT += da; act.ang = a; touchPan(m.x - act.mid.x, m.y - act.mid.y); act.mid = m; }   // (twist turns, the pair together pans)
    else { const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } } return; }
  if (act.kind === 'rotate'){ yawT -= dx*.008; tilt(); return; }
  if (act.kind === 'del'){
    // (the button isn't held any more and its release never came: the drag is over where it stands, the selection kept as it was)
    if (e.pointerType === 'mouse' && !(e.buttons & 1)){ act = null; ptrs.clear(); dragging = false; return; }
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    const to = groundCellAt(e.clientX, e.clientY);
    if (act.moved && act.from && to){ delSel = { i0: Math.min(act.from.i, to.i), i1: Math.max(act.from.i, to.i), j0: Math.min(act.from.j, to.j), j1: Math.max(act.from.j, to.j) }; showAreaSel(delSel); }
    return;
  }
  if (act.kind === 'npc'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5){ act.moved = true; if (e.pointerType === 'touch'){ act.kind = 'touch'; touchPan(e.clientX - act.x, e.clientY - act.y); } else act.kind = 'sky'; } return; }
  if (act.kind === 'sky'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved){ yawT -= dx*.008; tilt(); hover.visible = hoverFill.visible = hoverStrip.visible = false; if (megaPick) showMegaGhost(null); } return; }
  if (act.kind === 'right'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved){ yawT -= dx*.008; tilt(); } return; }
  if (act.kind === 'fresh2'){   // the building just made, pressed again and dragged: it goes, and the height pick takes its place
    if (!act.started && Math.abs(e.clientY - act.sy) > 12){ act.started = true; if (freshUndo(act.f)){ ptrLast = { x: act.x, y: act.y }; hlStart(); } }
    if (act.started && HL) hlMove(act.x, e.clientY);
    return;
  }
  if (act.kind === 'dtap'){   // double tap, still pressing: dragging up or down picks the height
    if (!act.started && Math.abs(e.clientY - act.sy) > 12){ act.started = true; ptrLast = { x: act.x, y: act.sy }; hlStart(); }
    if (act.started && HL) hlMove(act.x, e.clientY);
    return;
  }
  if (act.kind === 'touch'){
    if (!act.moved && Math.hypot(e.clientX - act.x, e.clientY - act.y) > 10){ act.moved = true; clearTimeout(act.timer); if (typeof TUI !== 'undefined') TUI.ring(null); tEmit('pan'); hover.visible = hoverFill.visible = hoverStrip.visible = false; if (megaPick) showMegaGhost(null); touchPan(e.clientX - act.x, e.clientY - act.y); return; }
    if (act.moved) touchPan(dx, dy);
    return;
  }
  if (act.kind === 'paint'){ paintAt(e.clientX, e.clientY); showHover(targetOf(pickAt(e.clientX, e.clientY))); }
}
const endPtr = e => { const _t0 = performance.now(); try { endPtr0(e); } finally { PH.outside('pointer up', performance.now() - _t0); } };
function endPtr0(e){
  if (act && typeof LOADP !== 'undefined' && LOADP.on) act.moved = true;   // (a city is still being loaded from its recipes: a click edits nothing yet)
  if (act && ptrs.has(e.pointerId)){
    if (act.kind === 'npc' && !act.moved){ const who = MON.pick(e.clientX, e.clientY, true); if (who) MON.open(who); else { act.done = new Set(); paintAt(e.clientX, e.clientY); } }   // (the exact test now; nobody there after all: a click on the city)
    if (act.kind === 'del' && !act.moved){   // a click: inside the selection deletes it, anywhere else clears it
      const c = groundCellAt(e.clientX, e.clientY);
      if (delSel && c && c.i >= delSel.i0 && c.i <= delSel.i1 && c.j >= delSel.j0 && c.j <= delSel.j1) removeArea(delSel);
      delSel = null; showAreaSel(null);
    }
    if (act.kind === 'right' && !act.moved && delMode){ delSel = null; showAreaSel(null); }
    else if (act.kind === 'right' && !act.moved){ if (hwMode) hwRightClick(e.clientX, e.clientY); else if (mtMode) mtRightClick(e.clientX, e.clientY); else if (megaPick) selectMega(null); else removeAt(pickAt(e.clientX, e.clientY)); }   // right-click while placing: put it down (highways are only cut in highway mode)
    if (act.kind === 'sky' && !act.moved){ if (hwMode) hwClick(e.clientX, e.clientY); else if (mtMode) mtClick(e.clientX, e.clientY); else if (megaPick) placeMegaHere(e.clientX, e.clientY); else { act.done = new Set(); paintAt(e.clientX, e.clientY); } }
    if (act.kind === 'dtap' && !(typeof LOADP !== 'undefined' && LOADP.on)){
      if (act.started){ if (HL) hlBuild(); }
      else if (!unitAt(act.x, act.y)) tapBuild(act.x, act.y);   // (one floor; where one floor can't go, an ordinary tap)
    }
    if (act.kind === 'fresh2' && !(typeof LOADP !== 'undefined' && LOADP.on)){ if (act.started){ if (HL){ hlBuild(); tEmit('resize'); } } else freshTrim(act.f); }
    if (act.kind === 'touch' && !act.moved && tapWaits()){ clearTimeout(act.timer); if (typeof TUI !== 'undefined') TUI.ring(null); if (!(typeof LOADP !== 'undefined' && LOADP.on)) freshBuild(e.clientX, e.clientY); }
    else if (act.kind === 'touch' && !act.moved){ clearTimeout(act.timer); if (typeof TUI !== 'undefined') TUI.ring(null);
      if (hwMode) hwClick(e.clientX, e.clientY); else if (mtMode) mtClick(e.clientX, e.clientY); else if (megaPick) placeMegaHere(e.clientX, e.clientY);
      else { const pk = !S.zone && typeof TUI !== 'undefined' ? pickAt(e.clientX, e.clientY) : null;   // (no zone picked: a tap on a megastructure shows its button, or its card)
        if (pk && pk.c && pk.c.mega && megas.has(pk.c.mega)) TUI.megaTap(megas.get(pk.c.mega)); else { act.done = new Set(); paintAt(e.clientX, e.clientY); } } }
  }
  ptrs.delete(e.pointerId);
  if (!ptrs.size){ dragging = false; act = null; }
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { MON.hoverAt(null); if (!ptrs.size && !AIM){   // (a finger lifting is a leave too: an aim's outline stays)
 hover.visible = hoverFill.visible = hoverStrip.visible = false; showMegaGhost(null); hwGhost.g.visible = false; hwHighlight(null); } });
// (no zooming while the title screen is up: its view of the city is set by the title, owner Oct 30)
const titleUp = () => typeof TITLE !== 'undefined' && TITLE.on;
canvas.addEventListener('wheel', e => { e.preventDefault(); if (titleUp()) return; zoomT = clamp(zoomT*(1+Math.sign(e.deltaY)*.1), 5, 60); }, { passive:false });
const PAN_KEYS = ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
let LAST_INPUT = performance.now();   // (rest when idle: main.js)
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => { LAST_INPUT = performance.now(); }, { passive: true, capture: true });
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === 'shift'){ keys.delete('shift');
  if (shiftTap && performance.now() - shiftTap < 400){ if (HL) hlStop(); else hlStart(); } shiftTap = null; } });   // (a tap, not Shift held with another key: the height pick)
addEventListener('blur', () => keys.clear());
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,select')) return;
  const k = e.key.toLowerCase();
  if (k === 'shift'){ keys.add('shift'); if (!e.repeat) shiftTap = performance.now(); } else shiftTap = null;
  if (HL && e.key === 'Escape'){ hlStop(); return; }
  if (PAN_KEYS.includes(k)){ keys.add(k); MON.userPan(); e.preventDefault(); return; }
  if (k === 'h' || e.key === 'Home'){ centerView(); return; }
  if (e.key === ' '){ e.preventDefault(); if (e.repeat) return;
    if (S.zone && !HL && !hwMode && !mtMode && !delMode && !megaPick && !tiltMode && ptrLast && unitAt(ptrLast.x, ptrLast.y)){ showHover(targetOf(pickAt(ptrLast.x, ptrLast.y))); return; }   // (Residential: one more home; otherwise Space tilts as before)
    setTiltMode(!tiltMode); return; }
  if (k === 'x' && !e.repeat){ setDelMode(!delMode); return; }
  if (e.key === '5' && !e.repeat){ if (hwUnlocked()) setHwMode(!hwMode); return; }
  if (e.key === '6' && !e.repeat){ if (hwUnlocked()) setMtMode(!mtMode); return; }
  if (hwMode && (e.key === '[' || e.key === 'PageDown')){ hwSetLevel(hwLevel - 1); return; }
  if (hwMode && (e.key === ']' || e.key === 'PageUp')){ hwSetLevel(hwLevel + 1); return; }
  if (hwMode && k === 'l' && !e.repeat){ hwSetLanesUI(hwLanesPick === 2 ? 3 : 2); return; }
  if (k === 'r' && !megaPick && !delMode && !e.repeat){   // turn the megastructure under the pointer
    const pk = ptrLast ? pickAt(ptrLast.x, ptrLast.y) : null;
    if (pk && pk.kind === 'mega' && pk.c.mega){ const m = megas.get(pk.c.mega); if (m) turnMega(m); }
    return;
  }
  if (k === 'r' && megaPick){ megaTurn = !megaTurn; if (ptrLast) showMegaGhost(megaPick, groundCellAt(ptrLast.x, ptrLast.y), megaTurn); return; }
  // Q / E: the camera swings round the spot it looks at, to its own left (Q) or right (E), the way A / D and the arrows move it
  if (k === 'q') yawT -= PI/4;
  else if (k === 'e') yawT += PI/4;
  else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9,5,60);
  else if (e.key === '-') zoomT = clamp(zoomT*1.1,5,60);
  else if ('1234'.includes(e.key) && e.key.length === 1) selectZone(['low','mid','high','ind'][+e.key - 1]);
  else if (e.key === 'Escape' && !$('hwHelp').hidden) setHwHelp(false);
  else if (e.key === 'Escape' && !$('mtHelp').hidden) setMtHelp(false);
  else if ((e.key === 'Escape' || e.key === '0') && hwMode) setHwMode(false);
  else if ((e.key === 'Escape' || e.key === '0') && mtMode) setMtMode(false);
  else if (e.key === 'Escape' && MON.id && !delMode && !megaPick) MON.close();
  else if (e.key === 'Escape' || e.key === '0'){ if (delMode){ if (delSel){ delSel = null; showAreaSel(null); } else setDelMode(false); } else if (megaPick) selectMega(null); else selectZone(null); }
});

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const fmt = h => { const m = Math.round(h*60)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
let lastLabel = '';
function syncTimeUI(){
  const label = fmt(S.hour)+'|'+phaseName(S.hour)+'|'+W+'|'+H;
  if (label === lastLabel) return; lastLabel = label;
  $('clock').textContent = fmt(S.hour); $('phase').textContent = phaseName(S.hour);
  $('readout').textContent = fmt(S.hour)+' · '+phaseName(S.hour)+(S.rain?' · Rain':'');
  if (document.activeElement !== $('hour')) $('hour').value = S.hour;
}
function setPresetActive(btn){ document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', b === btn)); }
$('hour').addEventListener('input', e => { S.hour = +e.target.value; setPresetActive(null); lastLabel=''; window.HOUR_DRAG_AT = performance.now(); });   // (HOUR_DRAG_AT: the shadows keep up every few frames while it's dragged, sky.js)
document.querySelectorAll('#presets button').forEach(b => b.addEventListener('click', () => {
  S.hour = +b.dataset.h;   // time only: rain stays however the Rain box is set
  $('hour').value = S.hour; setPresetActive(b); lastLabel='';
}));
$('rain').addEventListener('change', e => { S.rain = e.target.checked; lastLabel=''; });
// the day and night cycle: the clock runs on its own, a whole day in an hour of real time (see main.js)
$('cycle').addEventListener('change', e => { S.cycle = e.target.checked; FF.cycleWas = null; if (S.cycle) setPresetActive(null); });
const windWord = v => v < .15 ? 'Calm' : v < .7 ? 'Light' : v < 1.3 ? 'Breezy' : v < 1.7 ? 'Windy' : 'Stormy';
$('wind').addEventListener('input', e => { S.wind = +e.target.value; $('windOut').textContent = windWord(S.wind); });
const NOTES = {
  mixed:'Market core in the middle, with tenements, towers and factories around it.',
  low:'Patched metal, crooked stacks, laundry, wild plants, bare bulbs and handwritten neon.',
  mid:'Weathered concrete, shopfronts with awnings, string lights and bold neon.',
  high:'Clean white terraced towers, cyan trim, bonsai and bamboo, landing pads.',
  ind:'Green-painted metal, chimneys with steam, tank yards, pipes and amber lights.',
};
// the style sliders only set what the next pieces get; nothing already built is regenerated
const amountWord = v => v < .25 ? 'Minimal' : v < .75 ? 'Light' : v < 1.3 ? 'Normal' : v < 1.7 ? 'Heavy' : 'Packed';
for (const k of ['clutter','green','neon']){
  $(k).value = STYLE[k]; $(k+'Out').textContent = amountWord(STYLE[k]);
  $(k).addEventListener('input', e => { STYLE[k] = +e.target.value; $(k+'Out').textContent = amountWord(STYLE[k]); saveStyle(); });
}
$('reseed').addEventListener('click', () => { if ($('reseed').dataset.armed){ clearIsland(); delete $('reseed').dataset.armed; $('reseed').textContent = 'Clear island'; }
  else { $('reseed').dataset.armed = '1'; $('reseed').textContent = 'Click again to clear'; setTimeout(() => { delete $('reseed').dataset.armed; $('reseed').textContent = 'Clear island'; }, 2500); } });
function selectZone(z){
  if (PERIM){ PERIM = null; document.querySelectorAll('.perim[data-perim]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); }); }   // (a zone and Perimeter are never both picked: perimeter.js)
  S.zone = (z && S.zone !== z) ? z : null;
  if (S.zone && delMode) setDelMode(false, true);
  if (S.zone && megaPick) selectMega(null, true);
  if (S.zone && hwMode) setHwMode(false, true);
  if (S.zone && mtMode) setMtMode(false, true);
  document.querySelectorAll('.zone[data-zone]').forEach(b => { const on = b.dataset.zone === S.zone; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (megaPick || delMode || hwMode || mtMode) return;
  $('modeHint').textContent = S.zone ? `Zone ${ZONES[S.zone].key}: click to build · click a roof to stack a section` + ' · click a wall to hang a side building · Space adds one floor · tap Shift to pick a height' + (S.paint ? ' · drag to paint' : '') : 'Click the sky to grow the platform · pick a zone to build';
}
document.querySelectorAll('.zone[data-zone]').forEach(b => b.addEventListener('click', () => selectZone(b.dataset.zone)));
// the sky highways (highway.js): the Highway button, and its height and lanes controls
$('hwBtn').addEventListener('click', () => setHwMode(!hwMode));
$('hwDown').addEventListener('click', () => hwSetLevel(hwLevel - 1));
$('hwUp').addEventListener('click', () => hwSetLevel(hwLevel + 1));
$('hwLanes').addEventListener('click', () => hwSetLanesUI(hwLanesPick === 2 ? 3 : 2));
// the metro (metro.js): its button in Transport
$('mtBtn').addEventListener('click', () => setMtMode(!mtMode));
$('outlines').addEventListener('change', e => { S.outlines = e.target.checked; });
// Optimize framerate (see applyRenderRes in sky.js): remembered in this browser
// Detail tiers (world.js TIER): far blocks drawn as stand-ins with their smallest pieces left out; remembered in this browser, and switched at once
{ try { const v = localStorage.getItem('neonIsland.tiers'); if (v !== null) S.tiers = v === '1'; } catch (e) {} if (S.tiers === undefined) S.tiers = true; $('tiers').checked = S.tiers;
  $('tiers').addEventListener('change', e => { S.tiers = e.target.checked; try { localStorage.setItem('neonIsland.tiers', S.tiers ? '1' : '0'); } catch (e2) {} tierApplyNow(); }); }
document.querySelectorAll('#zoomResChips button').forEach(b => {
  b.classList.toggle('on', +b.dataset.f === ZOOM_RES);
  b.addEventListener('click', () => { setZoomRes(+b.dataset.f); document.querySelectorAll('#zoomResChips button').forEach(x => x.classList.toggle('on', x === b)); });
});
$('farView').checked = FARV.on; $('farView').addEventListener('change', e => setFarView(e.target.checked));   // (sky.js)
$('cap720').checked = CAP720; $('cap720').addEventListener('change', e => setCap720(e.target.checked));   // (sky.js)
for (const id of ['idleRest', 'autoPerf']){
  try { const v = localStorage.getItem('neonIsland.' + id); if (v !== null){ S[id] = v === '1'; $(id).checked = S[id]; } } catch (e) {}
  $(id).addEventListener('change', e => { S[id] = e.target.checked; try { localStorage.setItem('neonIsland.' + id, S[id] ? '1' : '0'); } catch (e2) {} if (id === 'autoPerf') PERF.grow = Infinity; });
}
// the render resolution: 240p, 480p or 720p (see setRenderLines in sky.js)
document.querySelectorAll('#resChips button').forEach(b => {
  b.classList.toggle('on', +b.dataset.lines === RENDER_LINES);
  b.addEventListener('click', () => { setRenderLines(+b.dataset.lines); document.querySelectorAll('#resChips button').forEach(x => x.classList.toggle('on', x === b)); });
});
document.querySelectorAll('#cloudChips button').forEach(b => b.addEventListener('click', () => {
  S.cloudQ = +b.dataset.q; document.querySelectorAll('#cloudChips button').forEach(x => x.classList.toggle('on', x === b)); makeTargets();
}));
$('vclouds').addEventListener('change', e => { S.vclouds = e.target.checked; });
$('rays').addEventListener('change', e => { S.rays = e.target.checked; });
$('bloom').addEventListener('change', e => { S.bloom = e.target.checked; });
$('rim').addEventListener('change', e => { S.rim = e.target.checked; });
$('grade').addEventListener('change', e => { S.grade = e.target.checked; });
$('lights').addEventListener('change', e => { S.lights = e.target.checked; });
$('ao').addEventListener('change', e => { S.ao = e.target.checked; });
$('mist').addEventListener('change', e => { S.mist = e.target.checked; });
$('wet').addEventListener('change', e => { S.wetOn = e.target.checked; });
$('spin').checked = S.spin; $('spin').addEventListener('change', e => { S.spin = e.target.checked; });
$('musicVol').value = music.volume; $('musicVolOut').textContent = Math.round(music.volume*100) + '%';
$('musicVol').addEventListener('input', e => { music.setVolume(+e.target.value); $('musicVolOut').textContent = Math.round(music.volume*100) + '%'; });
$('sfxVol').value = sfx.volume; $('sfxVolOut').textContent = Math.round(sfx.volume*100) + '%';
$('sfxVol').addEventListener('input', e => { sfx.setVolume(+e.target.value); $('sfxVolOut').textContent = Math.round(sfx.volume*100) + '%'; });
$('paint').checked = S.paint; $('paint').addEventListener('change', e => { S.paint = e.target.checked; selectZone(S.zone); });
$('rotBL').addEventListener('click', () => { yawT += PI/4; });
$('rotBR').addEventListener('click', () => { yawT -= PI/4; });
$('deckToggle').addEventListener('click', () => {
  const open = $('deck').classList.toggle('open'); document.body.classList.toggle('deck-open', open); $('deckToggle').setAttribute('aria-expanded', open); $('deckToggle').textContent = open ? 'Close' : 'Settings';
  PERF.quiet(1500);   // (opening a panel isn't the city running slow)
});

/* ---------- the Buildings menu ---------- */
// Shows up once the first megastructure has arrived. Every kind that has arrived is listed and can be placed again,
// as many times as you like; kinds still to come aren't shown until they arrive. Pick one, and its footprint
// follows the pointer (green-lit in its colour where it fits, red where it doesn't): click to put one down, R turns
// it, right-click or Esc stops placing.
let megaPick = null, megaTurn = false, ptrLast = null;
const BMENU_OPEN_KEY = (typeof TOUCH !== 'undefined' && TOUCH.on ? 'touch:' : '') + 'neonIsland.bmenuOpen';   // (touch screens keep their own: a menu left open on a desktop doesn't open over the city on a phone)
function selectMega(kind, quiet){
  megaPick = kind && megaPick !== kind ? kind : null;
  if (megaPick && delMode) setDelMode(false, true);
  if (megaPick && S.zone) selectZone(null);
  if (megaPick && hwMode) setHwMode(false, true);
  if (megaPick && mtMode) setMtMode(false, true);
  document.querySelectorAll('.bitem').forEach(b => { const on = b.dataset.kind === megaPick; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  hover.visible = hoverFill.visible = hoverStrip.visible = false;
  if (megaPick){ const t = MEGA_TYPES[megaPick];
    $('modeHint').textContent = `Placing: ${t.name} · click to build` + (t.w !== t.h ? ' · R turns it' : '') + ' · right-click or Esc to stop';
    if (ptrLast) showMegaGhost(megaPick, groundCellAt(ptrLast.x, ptrLast.y), megaTurn); }
  else { showMegaGhost(null); if (!quiet) selectZone(S.zone); }
}
function placeMegaHere(x, y){
  const c = groundCellAt(x, y); if (!c) return;
  const m = placeFromMenu(megaPick, c.i, c.j, megaTurn);
  if (!m) return;   // doesn't fit there (the footprint shows red)
  if (typeof TOUCH !== 'undefined' && TOUCH.on){ selectMega(null, true); return; }   // (touch: one per pick, so the placing footprint and its TURN button go once it's down)
  showMegaGhost(megaPick, c, megaTurn);
}
function setBmenuOpen(open){
  $('bmenuHead').setAttribute('aria-expanded', open); $('bmenuList').hidden = !open;
  try { localStorage.setItem(BMENU_OPEN_KEY, open ? '1' : '0'); } catch (e) {}
}
function renderBmenu(){
  const any = megaUnlockedKinds.size > 0;
  $('bmenu').hidden = !any; $('tmenu').hidden = !hwUnlocked(); if (!any) return;
  const list = $('bmenuList'); list.textContent = '';
  for (const kind of Object.keys(MEGA_TYPES).filter(k => megaUnlockedKinds.has(k))){   // only what has arrived: the rest stay a surprise
    const t = MEGA_TYPES[kind], open = megaUnlockedKinds.has(kind);
    const b = document.createElement('button'); b.className = 'bitem' + (open ? '' : ' locked'); b.dataset.kind = kind; b.style.setProperty('--m', t.colour);
    b.setAttribute('aria-pressed', megaPick === kind); if (megaPick === kind) b.classList.add('on');
    const n = megasOfKind(kind).length;
    b.innerHTML = `<i class="sw"></i><b></b><small></small>`;
    b.querySelector('b').textContent = open ? t.name : 'Locked';
    b.querySelector('small').textContent = open ? `${t.w} × ${t.h} plots` + (n ? ` · ${n} built` : '') : 'Arrives with ' + megaNeedText(kind);
    if (open) b.addEventListener('click', () => selectMega(kind)); else { b.disabled = true; b.title = 'Arrives on its own with ' + megaNeedText(kind); }
    list.appendChild(b);
  }
}
$('bmenuHead').addEventListener('click', () => { setBmenuOpen($('bmenuList').hidden); $('bmenuHead').classList.remove('fresh'); });
// a kind arriving for the first time: open the menu and make the header pulse so it gets noticed
function onMegaUnlock(){
  renderBmenu(); if (!document.getElementById('bmenuList')) return;
  const tch = typeof TOUCH !== 'undefined' && TOUCH.on;   // (touch: the button pulses, the list doesn't open: on a phone it covered a third of the city and took the next tap)
  if (!tch) setBmenuOpen(true); $('bmenuHead').classList.add('fresh');
  if (megaUnlockedKinds.size === 4){ if (!tch) setTmenuOpen(true); $('tmenuHead').classList.add('fresh'); }   // the fourth: sky highways arrive
}
// Transport (under Buildings): arrives with the fourth megastructure, or at once in a city that already has highways
const hwUnlocked = () => megaUnlockedKinds.size >= 4 || highways.length > 0 || metros.length > 0;
const TMENU_OPEN_KEY = (typeof TOUCH !== 'undefined' && TOUCH.on ? 'touch:' : '') + 'neonIsland.tmenuOpen';
function setTmenuOpen(open){
  $('tmenuHead').setAttribute('aria-expanded', open); $('tmenuList').hidden = !open;
  try { localStorage.setItem(TMENU_OPEN_KEY, open ? '1' : '0'); } catch (e) {}
}
$('tmenuHead').addEventListener('click', () => { setTmenuOpen($('tmenuList').hidden); $('tmenuHead').classList.remove('fresh'); });
{ let open = false; try { open = localStorage.getItem(TMENU_OPEN_KEY) === '1'; } catch (e) {} setTmenuOpen(open); }
function setHwHelp(on){ $('hwHelp').hidden = !on; $('hwHelpBtn').setAttribute('aria-expanded', on); if (on && $('mtHelp')) $('mtHelp').hidden = true, $('mtHelpBtn').setAttribute('aria-expanded', false); }
$('hwHelpBtn').addEventListener('click', () => setHwHelp($('hwHelp').hidden));
$('hwHelpClose').addEventListener('click', () => setHwHelp(false));
function setMtHelp(on){ $('mtHelp').hidden = !on; $('mtHelpBtn').setAttribute('aria-expanded', on); if (on) setHwHelp(false); }
$('mtHelpBtn').addEventListener('click', () => setMtHelp($('mtHelp').hidden));
$('mtHelpClose').addEventListener('click', () => setMtHelp(false));
{ let open = false; try { open = localStorage.getItem(BMENU_OPEN_KEY) === '1'; } catch (e) {} setBmenuOpen(open); renderBmenu(); }

/* ---------- delete mode ---------- */
// X (or the button by the zones) switches to deleting: drag across the city to select a block of plots, click
// inside it to delete everything there (buildings, platform and any megastructure reaching into it), click outside
// it to drop the selection. X again goes back to building. Rotating still works with Q/E or a right-drag.
let delMode = false, delSel = null;
function setDelMode(on, quiet){
  delMode = on; delSel = null; showAreaSel(null);
  if (on){ if (S.zone) selectZone(null); if (megaPick) selectMega(null, true); if (hwMode) setHwMode(false, true); if (mtMode) setMtMode(false, true); hover.visible = hoverFill.visible = hoverStrip.visible = false; showMegaGhost(null); }
  document.body.classList.toggle('deleting', on);
  $('delBtn').classList.toggle('on', on); $('delBtn').setAttribute('aria-pressed', on);
  if (on) $('modeHint').textContent = typeof TOUCH !== 'undefined' && TOUCH.on ? 'Erase: drag to select, tap inside to clear it · two fingers to move' : 'Delete mode: drag to select an area · click inside it to delete · click outside to clear · X to go back to building';
  if (typeof TUI !== 'undefined') TUI.eraseChip(on);
  else if (!quiet) selectZone(S.zone ? S.zone : null);
}
$('delBtn').addEventListener('click', () => setDelMode(!delMode));
