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
function updateCamera(dt){
  if (S.spin && !dragging){ spinT += dt; if (spinT > 6){ spinT = 0; yawT += PI/4; } }
  yaw += (yawT-yaw)*Math.min(1, dt*3.5);
  PITCH += (pitchT - PITCH)*Math.min(1, dt*6); if (Math.abs(pitchT - PITCH) < 1e-4) PITCH = pitchT;
  zoom += (zoomT-zoom)*Math.min(1, dt*8);
  // easing never quite arrives, so a "still" camera kept drifting by fractions of a pixel; snap once close
  if (Math.abs(yawT-yaw) < 1e-3) yaw = yawT;
  if (Math.abs(zoomT-zoom) < 1e-3) zoom = zoomT;
  // WASD / arrow keys: pan across the ground, relative to the way the camera faces; Shift goes faster
  const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const rt = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  if (tiltMode && (fw || rt)){ pitchT = clamp(pitchT + fw*dt*.9, PITCH_MIN, PITCH_MAX); yawT -= rt*dt*1.4; }   // (locked in place: the keys tilt and turn it instead)
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
  const a = Math.round(camT.dot(_cr)/px)*px, b = Math.round(camT.dot(_cu)/px)*px, cTrue = camT.dot(_cv), c = SC.pin(cTrue);   // (the static cache keeps the camera's place along the view fixed for as long as it can: see staticcache.js)
  camPix.set(a/px, b/px);
  _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, cTrue);
  camPosTrue.set(_cs.x + sy*cp_*CAM_DIST, _cs.y + sp_*CAM_DIST, _cs.z + cy*cp_*CAM_DIST);   // (where the camera really is)
  _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, c);
  cam.position.set(_cs.x + sy*cp_*CAM_DIST, _cs.y + sp_*CAM_DIST, _cs.z + cy*cp_*CAM_DIST);
  cam.lookAt(_cs);
  placeSun();
  const asp = W/H; cam.left=-zoom*asp; cam.right=zoom*asp; cam.top=zoom; cam.bottom=-zoom; cam.updateProjectionMatrix();
}
const ptrs = new Map(); let dragging = false, pinch0 = 0, zoom0 = 0, pinchX = 0;
let act = null;   // the gesture in progress: { kind:'paint'|'rotate'|'right'|'touch', x, y, moved, done:Set, timer }
const pdist = () => { const [a,b] = [...ptrs.values()]; return Math.hypot(a.x-b.x, a.y-b.y) || 1; };
const pmidX = () => { const [a,b] = [...ptrs.values()]; return (a.x + b.x)/2; };
function paintAt(x, y){
  const t = targetOf(pickAt(x, y)); if (!t) return;
  const k = t.type === 'empty' || t.type === 'side' ? ckey(t.i, t.j) : t.type === 'megaUp' ? 'mega:' + t.m.id : ckey(t.c.i, t.c.j);
  if (act.done.has(k)) return;               // each spot changes at most once per stroke
  act.done.add(k); applyTarget(t);
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragging = true;
  if (ptrs.size === 2){ if (act && act.timer) clearTimeout(act.timer); act = { kind: 'pinch' }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); hover.visible = hoverFill.visible = false; return; }
  if (delMode && e.button === 0){ act = { kind: 'del', x: e.clientX, y: e.clientY, moved: false, from: groundCellAt(e.clientX, e.clientY) }; return; }   // delete mode: drag selects
  if (e.pointerType === 'touch'){
    // tap builds, drag paints, press and hold removes
    act = { kind: 'touch', x: e.clientX, y: e.clientY, moved: false, done: new Set() };
    act.timer = setTimeout(() => { if (act && act.kind === 'touch' && !act.moved){ if (hwMode) hwRightClick(act.x, act.y); else if (mtMode) mtRightClick(act.x, act.y); else removeAt(pickAt(act.x, act.y)); act.kind = 'none'; } }, 550);
    return;
  }
  if (e.button === 0 && (hwMode || mtMode)){ act = { kind: 'sky', x: e.clientX, y: e.clientY, moved: false }; return; }   // highway or metro mode: a click builds, a drag turns the view
  if (e.button === 0){
    const pk = pickAt(e.clientX, e.clientY);
    // a click (no drag) builds; a drag rotates the view. With "Drag to paint" on, a drag that starts on the city paints instead.
    if (!pk || pk.kind === 'sky' || !S.paint || megaPick) act = { kind: 'sky', x: e.clientX, y: e.clientY, moved: false };
    else { act = { kind: 'paint', done: new Set() }; paintAt(e.clientX, e.clientY); }
  }
  else if (e.button === 2) act = { kind: 'right', x: e.clientX, y: e.clientY, moved: false };
  else if (e.button === 1) act = { kind: 'rotate' };
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p){ ptrLast = { x: e.clientX, y: e.clientY };   // just hovering
    if (delMode){ hover.visible = hoverFill.visible = false; return; }
    if (hwMode){ hwHover(e.clientX, e.clientY); return; }
    if (mtMode){ mtHover(e.clientX, e.clientY); return; }
    if (megaPick) showMegaGhost(megaPick, groundCellAt(e.clientX, e.clientY), megaTurn); else showHover(targetOf(pickAt(e.clientX, e.clientY))); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y, tilt = () => { if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); };
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!act) return;
  if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), 5, 30); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
  if (act.kind === 'rotate'){ yawT -= dx*.008; tilt(); return; }
  if (act.kind === 'del'){
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    const to = groundCellAt(e.clientX, e.clientY);
    if (act.moved && act.from && to){ delSel = { i0: Math.min(act.from.i, to.i), i1: Math.max(act.from.i, to.i), j0: Math.min(act.from.j, to.j), j1: Math.max(act.from.j, to.j) }; showAreaSel(delSel); }
    return;
  }
  if (act.kind === 'sky'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved){ yawT -= dx*.008; tilt(); hover.visible = hoverFill.visible = false; if (megaPick) showMegaGhost(null); } return; }
  if (act.kind === 'right'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved){ yawT -= dx*.008; tilt(); } return; }
  if (act.kind === 'touch'){
    if (!act.moved && Math.hypot(e.clientX - act.x, e.clientY - act.y) > 10){ act.moved = true; clearTimeout(act.timer); const pk = pickAt(act.x, act.y); act.spin = !pk || pk.kind === 'sky' || !S.paint; if (!act.spin) paintAt(act.x, act.y); }
    if (act.moved){ if (act.spin){ yawT -= dx*.008; tilt(); } else paintAt(e.clientX, e.clientY); }
    return;
  }
  if (act.kind === 'paint'){ paintAt(e.clientX, e.clientY); showHover(targetOf(pickAt(e.clientX, e.clientY))); }
});
const endPtr = e => {
  if (act && typeof LOADP !== 'undefined' && LOADP.on) act.moved = true;   // (a city is still being loaded from its recipes: a click edits nothing yet)
  if (act && ptrs.has(e.pointerId)){
    if (act.kind === 'del' && !act.moved){   // a click: inside the selection deletes it, anywhere else clears it
      const c = groundCellAt(e.clientX, e.clientY);
      if (delSel && c && c.i >= delSel.i0 && c.i <= delSel.i1 && c.j >= delSel.j0 && c.j <= delSel.j1) removeArea(delSel);
      delSel = null; showAreaSel(null);
    }
    if (act.kind === 'right' && !act.moved && delMode){ delSel = null; showAreaSel(null); }
    else if (act.kind === 'right' && !act.moved){ if (hwMode) hwRightClick(e.clientX, e.clientY); else if (mtMode) mtRightClick(e.clientX, e.clientY); else if (megaPick) selectMega(null); else removeAt(pickAt(e.clientX, e.clientY)); }   // right-click while placing: put it down (highways are only cut in highway mode)
    if (act.kind === 'sky' && !act.moved){ if (hwMode) hwClick(e.clientX, e.clientY); else if (mtMode) mtClick(e.clientX, e.clientY); else if (megaPick) placeMegaHere(e.clientX, e.clientY); else { act.done = new Set(); paintAt(e.clientX, e.clientY); } }
    if (act.kind === 'touch' && !act.moved){ clearTimeout(act.timer); if (hwMode) hwClick(e.clientX, e.clientY); else if (mtMode) mtClick(e.clientX, e.clientY); else if (megaPick) placeMegaHere(e.clientX, e.clientY); else { act.done = new Set(); paintAt(e.clientX, e.clientY); } }
  }
  ptrs.delete(e.pointerId);
  if (!ptrs.size){ dragging = false; act = null; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { if (!ptrs.size){ hover.visible = hoverFill.visible = false; showMegaGhost(null); hwGhost.g.visible = false; hwHighlight(null); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomT = clamp(zoomT*(1+Math.sign(e.deltaY)*.1), 5, 30); }, { passive:false });
const PAN_KEYS = ['w','a','s','d','arrowup','arrowdown'];
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === 'shift') keys.delete('shift'); });
addEventListener('blur', () => keys.clear());
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,select')) return;
  const k = e.key.toLowerCase();
  if (k === 'shift') keys.add('shift');
  if (PAN_KEYS.includes(k)){ keys.add(k); e.preventDefault(); return; }
  if (k === 'h' || e.key === 'Home'){ centerView(); return; }
  if (e.key === ' '){ e.preventDefault(); if (!e.repeat) setTiltMode(!tiltMode); return; }
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
  if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') yawT += PI/4;
  else if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') yawT -= PI/4;
  else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9,5,30);
  else if (e.key === '-') zoomT = clamp(zoomT*1.1,5,30);
  else if ('1234'.includes(e.key) && e.key.length === 1) selectZone(['low','mid','high','ind'][+e.key - 1]);
  else if (e.key === 'Escape' && !$('hwHelp').hidden) setHwHelp(false);
  else if (e.key === 'Escape' && !$('mtHelp').hidden) setMtHelp(false);
  else if ((e.key === 'Escape' || e.key === '0') && hwMode) setHwMode(false);
  else if ((e.key === 'Escape' || e.key === '0') && mtMode) setMtMode(false);
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
  $('readout').textContent = fmt(S.hour)+' · '+phaseName(S.hour)+(S.rain?' · Rain':'')+' · '+W+'×'+H;
  if (document.activeElement !== $('hour')) $('hour').value = S.hour;
}
function setPresetActive(btn){ document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', b === btn)); }
$('hour').addEventListener('input', e => { S.hour = +e.target.value; setPresetActive(null); lastLabel=''; });
document.querySelectorAll('#presets button').forEach(b => b.addEventListener('click', () => {
  S.hour = +b.dataset.h;   // time only: rain stays however the Rain box is set
  $('hour').value = S.hour; setPresetActive(b); lastLabel='';
}));
$('rain').addEventListener('change', e => { S.rain = e.target.checked; lastLabel=''; });
// the day and night cycle: the clock runs on its own, a whole day in an hour of real time (see main.js)
$('cycle').addEventListener('change', e => { S.cycle = e.target.checked; if (S.cycle) setPresetActive(null); });
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
// the radio host forgets what it's said (two clicks, like clearing the island)
$('resetRj').addEventListener('click', () => { const b = $('resetRj');
  if (b.dataset.armed){ music.rj.reset(); delete b.dataset.armed; b.textContent = 'Radio host reset'; setTimeout(() => { b.textContent = 'Reset radio host'; }, 1800); }
  else { b.dataset.armed = '1'; b.textContent = 'Click again to reset'; setTimeout(() => { if (b.dataset.armed){ delete b.dataset.armed; b.textContent = 'Reset radio host'; } }, 2500); } });
function selectZone(z){
  S.zone = (z && S.zone !== z) ? z : null;
  if (S.zone && delMode) setDelMode(false, true);
  if (S.zone && megaPick) selectMega(null, true);
  if (S.zone && hwMode) setHwMode(false, true);
  if (S.zone && mtMode) setMtMode(false, true);
  document.querySelectorAll('.zone[data-zone]').forEach(b => { const on = b.dataset.zone === S.zone; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (megaPick || delMode || hwMode || mtMode) return;
  $('modeHint').textContent = S.zone ? `Zone ${ZONES[S.zone].key}: click to build · click a roof to stack a section` + ' · click high on a wall to hang a pod' + (S.paint ? ' · drag to paint' : '') : 'Click the sky to grow the platform · pick a zone to build';
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
for (const id of ['capRes', 'autoPerf']){
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
  const open = $('deck').classList.toggle('open'); $('deckToggle').setAttribute('aria-expanded', open); $('deckToggle').textContent = open ? 'Close' : 'Settings';
});

/* ---------- the Buildings menu ---------- */
// Shows up once the first megastructure has arrived. Every kind that has arrived is listed and can be placed again,
// as many times as you like; kinds still to come aren't shown until they arrive. Pick one, and its footprint
// follows the pointer (green-lit in its colour where it fits, red where it doesn't): click to put one down, R turns
// it, right-click or Esc stops placing.
let megaPick = null, megaTurn = false, ptrLast = null;
const BMENU_OPEN_KEY = 'neonIsland.bmenuOpen';
function selectMega(kind, quiet){
  megaPick = kind && megaPick !== kind ? kind : null;
  if (megaPick && delMode) setDelMode(false, true);
  if (megaPick && S.zone) selectZone(null);
  if (megaPick && hwMode) setHwMode(false, true);
  if (megaPick && mtMode) setMtMode(false, true);
  document.querySelectorAll('.bitem').forEach(b => { const on = b.dataset.kind === megaPick; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  hover.visible = hoverFill.visible = false;
  if (megaPick){ const t = MEGA_TYPES[megaPick];
    $('modeHint').textContent = `Placing: ${t.name} · click to build` + (t.w !== t.h ? ' · R turns it' : '') + ' · right-click or Esc to stop';
    if (ptrLast) showMegaGhost(megaPick, groundCellAt(ptrLast.x, ptrLast.y), megaTurn); }
  else { showMegaGhost(null); if (!quiet) selectZone(S.zone); }
}
function placeMegaHere(x, y){
  const c = groundCellAt(x, y); if (!c) return;
  const m = placeFromMenu(megaPick, c.i, c.j, megaTurn);
  if (!m) return;   // doesn't fit there (the footprint shows red)
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
  renderBmenu(); if (!document.getElementById('bmenuList')) return; setBmenuOpen(true); $('bmenuHead').classList.add('fresh');
  if (megaUnlockedKinds.size === 4){ setTmenuOpen(true); $('tmenuHead').classList.add('fresh'); }   // the fourth: sky highways arrive
}
// Transport (under Buildings): arrives with the fourth megastructure, or at once in a city that already has highways
const hwUnlocked = () => megaUnlockedKinds.size >= 4 || highways.length > 0 || metros.length > 0;
const TMENU_OPEN_KEY = 'neonIsland.tmenuOpen';
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
  if (on){ if (S.zone) selectZone(null); if (megaPick) selectMega(null, true); if (hwMode) setHwMode(false, true); if (mtMode) setMtMode(false, true); hover.visible = hoverFill.visible = false; showMegaGhost(null); }
  document.body.classList.toggle('deleting', on);
  $('delBtn').classList.toggle('on', on); $('delBtn').setAttribute('aria-pressed', on);
  if (on) $('modeHint').textContent = 'Delete mode: drag to select an area · click inside it to delete · click outside to clear · X to go back to building';
  else if (!quiet) selectZone(S.zone ? S.zone : null);
}
$('delBtn').addEventListener('click', () => setDelMode(!delMode));
