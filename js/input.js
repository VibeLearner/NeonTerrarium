// Neon Terrarium: Camera, mouse, touch and keyboard controls, and the settings panel.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- camera ---------- */
let shadowDirty = true; const _sunLast = new THREE.Vector3();
let spinT = 0, yaw = .7, yawT = .7, zoom = 13.2, zoomT = 13.2;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const camPix = new THREE.Vector2(), keys = new Set(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
function updateCamera(dt){
  if (S.spin && !dragging){ spinT += dt; if (spinT > 6){ spinT = 0; yawT += PI/4; } }
  yaw += (yawT-yaw)*Math.min(1, dt*3.5);
  zoom += (zoomT-zoom)*Math.min(1, dt*8);
  // easing never quite arrives, so a "still" camera kept drifting by fractions of a pixel; snap once close
  if (Math.abs(yawT-yaw) < 1e-3) yaw = yawT;
  if (Math.abs(zoomT-zoom) < 1e-3) zoom = zoomT;
  // WASD / arrow keys: pan across the ground, relative to the way the camera faces; Shift goes faster
  const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const rt = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  const panning = fw !== 0 || rt !== 0;
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
  const a = Math.round(camT.dot(_cr)/px)*px, b = Math.round(camT.dot(_cu)/px)*px, c = camT.dot(_cv);
  camPix.set(a/px, b/px);
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
  const k = t.type === 'empty' ? ckey(t.i, t.j) : t.type === 'megaUp' ? 'mega:' + t.m.kind : ckey(t.c.i, t.c.j);
  if (act.done.has(k)) return;               // each spot changes at most once per stroke
  act.done.add(k); applyTarget(t);
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragging = true;
  if (ptrs.size === 2){ if (act && act.timer) clearTimeout(act.timer); act = { kind: 'pinch' }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); hover.visible = false; return; }
  if (e.pointerType === 'touch'){
    // tap builds, drag paints, press and hold removes
    act = { kind: 'touch', x: e.clientX, y: e.clientY, moved: false, done: new Set() };
    act.timer = setTimeout(() => { if (act && act.kind === 'touch' && !act.moved){ removeAt(pickAt(act.x, act.y)); act.kind = 'none'; } }, 550);
    return;
  }
  if (e.button === 0){
    const pk = pickAt(e.clientX, e.clientY);
    // a click (no drag) builds; a drag rotates the view. With "Drag to paint" on, a drag that starts on the city paints instead.
    if (!pk || pk.kind === 'sky' || !S.paint) act = { kind: 'sky', x: e.clientX, y: e.clientY, moved: false };
    else { act = { kind: 'paint', done: new Set() }; paintAt(e.clientX, e.clientY); }
  }
  else if (e.button === 2) act = { kind: 'right', x: e.clientX, y: e.clientY, moved: false };
  else if (e.button === 1) act = { kind: 'rotate' };
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p){ showHover(targetOf(pickAt(e.clientX, e.clientY))); return; }   // just hovering
  const dx = e.clientX - p.x;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!act) return;
  if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), 5, 30); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
  if (act.kind === 'rotate'){ yawT -= dx*.008; return; }
  if (act.kind === 'sky'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved){ yawT -= dx*.008; hover.visible = false; } return; }
  if (act.kind === 'right'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; if (act.moved) yawT -= dx*.008; return; }
  if (act.kind === 'touch'){
    if (!act.moved && Math.hypot(e.clientX - act.x, e.clientY - act.y) > 10){ act.moved = true; clearTimeout(act.timer); const pk = pickAt(act.x, act.y); act.spin = !pk || pk.kind === 'sky' || !S.paint; if (!act.spin) paintAt(act.x, act.y); }
    if (act.moved){ if (act.spin) yawT -= dx*.008; else paintAt(e.clientX, e.clientY); }
    return;
  }
  if (act.kind === 'paint'){ paintAt(e.clientX, e.clientY); showHover(targetOf(pickAt(e.clientX, e.clientY))); }
});
const endPtr = e => {
  if (act && ptrs.has(e.pointerId)){
    if (act.kind === 'right' && !act.moved) removeAt(pickAt(e.clientX, e.clientY));
    if (act.kind === 'sky' && !act.moved){ act.done = new Set(); paintAt(e.clientX, e.clientY); }
    if (act.kind === 'touch' && !act.moved){ clearTimeout(act.timer); act.done = new Set(); paintAt(e.clientX, e.clientY); }
  }
  ptrs.delete(e.pointerId);
  if (!ptrs.size){ dragging = false; act = null; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { if (!ptrs.size) hover.visible = false; });
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
  if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') yawT += PI/4;
  else if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') yawT -= PI/4;
  else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9,5,30);
  else if (e.key === '-') zoomT = clamp(zoomT*1.1,5,30);
  else if ('1234'.includes(e.key) && e.key.length === 1) selectZone(['low','mid','high','ind'][+e.key - 1]);
  else if (e.key === 'Escape' || e.key === '0') selectZone(null);
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
function selectZone(z){
  S.zone = (z && S.zone !== z) ? z : null;
  document.querySelectorAll('.zone').forEach(b => { const on = b.dataset.zone === S.zone; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('modeHint').textContent = S.zone ? `Zone ${ZONES[S.zone].key}: click to build · click a roof to stack a section` + (S.paint ? ' · drag to paint' : '') : 'Click the sky to grow the platform · pick a zone to build';
}
document.querySelectorAll('.zone').forEach(b => b.addEventListener('click', () => selectZone(b.dataset.zone)));
$('outlines').addEventListener('change', e => { S.outlines = e.target.checked; });
document.querySelectorAll('#cloudChips button').forEach(b => b.addEventListener('click', () => {
  S.cloudQ = +b.dataset.q; document.querySelectorAll('#cloudChips button').forEach(x => x.classList.toggle('on', x === b)); makeTargets();
}));
$('vclouds').addEventListener('change', e => { S.vclouds = e.target.checked; });
$('rays').addEventListener('change', e => { S.rays = e.target.checked; });
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
