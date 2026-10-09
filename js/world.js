// Neon Terrarium: The game world: cells, building stacks, batching, edits, build and remove animations, saving, picking.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ================= GAME: grow the floating platform and build zones on it, Townscaper style ================= */
// The world is a grid of cells, LOT apart. A cell is a piece of floating platform; it can hold a stack of floors,
// each floor belonging to a zone. Every piece is generated from a seed made of its grid position and floor number,
// so editing one spot never reshuffles anything else.
const ZONES = {
  low:  { key:'A', name:'Residential', col:'#38E8E0' },
  mid:  { key:'B', name:'Commercial',  col:'#FFB347' },
  high: { key:'C', name:'Luxury',      col:'#FF4FA3' },
  ind:  { key:'D', name:'Industrial',  col:'#E8E03A' },
};
const GRID_MAX = 100, MAX_LEVELS = 12;   // about 760 units in every direction from the start
const cells = new Map();
const ckey = (i,j) => i + ',' + j;
const SIDES4 = [[1,0],[-1,0],[0,1],[0,-1]];
const world = new THREE.Group(); world.matrixAutoUpdate = false; scene.add(world); city = world;
// The static cache (staticcache.js) is out of date whenever a static piece comes, goes, shows, hides or changes layer: every
// such place bumps this count (the world's add and remove here; showHidden and the sweeps below).
let SC_EDITS = 0;
// And where: the world boxes of what came, went, showed or hid, so the cache can redraw just that part of its picture (staticcache.js, scEditRect).
// `unknown`: something changed that has no box (the highway and metro builders say so): the whole picture is drawn again. `quiet`: a merge of a
// region's pieces into one mesh (rebuildSolid): the same triangles in the same order, so the picture doesn't change and no box is noted.
const SC_DIRTY = { boxes: [], unknown: false, quiet: 0 }, _dbx = new THREE.Box3();
// (only what the static picture can hold or its lighting can feel: a mesh on the static layer, or any that casts a shadow; plants, glows and the like
// that are drawn live and cast none change nothing in it)
function scRelevant(o){ let r = false; o.traverse(m => { if (!r && (m.isMesh || m.isPoints) && ((m.layers.mask & STATIC_BIT) || m.castShadow)) r = true; }); return r; }
function scNote(o){
  if (SC_DIRTY.quiet || SC_DIRTY.unknown || !o || !scRelevant(o)) return;
  _dbx.makeEmpty(); _dbx.setFromObject(o);
  if (_dbx.isEmpty()){ return; }
  const last = SC_DIRTY.boxes[SC_DIRTY.boxes.length - 1]; if (last && last.equals(_dbx)) return;   // (the same piece noted again)
  if (SC_DIRTY.boxes.length >= 40){ SC_DIRTY.unknown = true; return; }
  SC_DIRTY.boxes.push(_dbx.clone());
}
{ const add = world.add, remove = world.remove;
  world.add = function(){ SC_EDITS++; const r = add.apply(this, arguments); for (let i = 0; i < arguments.length; i++) scNote(arguments[i]); return r; };
  world.remove = function(){ SC_EDITS++; for (let i = 0; i < arguments.length; i++) scNote(arguments[i]); return remove.apply(this, arguments); }; }
// Static pieces (plots, regions, their plants and glows) never move once built: their matrices are set once and left
// alone, so the frame's world-matrix update skips them
// A piece's hidden faces (see hideCovered) are left out of the views drawn from the camera, but the sun's shadow map still
// draws them all (it draws shapes' far sides, and those faces have always darkened the sides of their block turned from the
// sun a little): three calls onBeforeRender only for camera views, so the range is cut there and restored straight after.
function hideBefore(r, s, c, g){ if (!g.userData.full) g.drawRange.count = g.userData.shown; }
function hideAfter(r, s, c, g){ g.drawRange.count = Infinity; }
// while a piece is swept in or out (sliced open), its hidden faces are drawn too (and its walls all at once: see below)
function showHidden(view, on){ SC_EDITS++; scNote(view); view.traverse(o => { const g = o.isMesh && o.geometry; if (!g) return;
  if (g.userData.shown !== undefined || g.userData.cut) g.userData.full = on;
  if (o.userData.sideOf) o.visible = !on; }); }
// Walls facing away. The graphics card throws away every triangle turned away from the camera, but only after it has
// done all the work for its corners; in a city of boxes that's half the walls, and every underside. So the buildings'
// triangles are kept in this order (see collect): A, the ones that may face the camera from anywhere (roofs, slopes);
// H, the ones never drawn by the camera (inside solid blocks: see hideCovered; and undersides, which the camera, always
// looking down, can never see); S, the walls, sorted by which way they face into SIDE_K slices of the compass; then D,
// the first half of S again, so that any run of slices going round the compass is one unbroken stretch. Each piece is
// drawn as two meshes over the same triangles: one draws A (or, for its shadow, A + H + S), the other only the slices
// of walls that can face the camera this frame (SIDE_ARC). A wall is only ever left out when it faces away by a margin,
// so nothing that would have been drawn is missing; the picture doesn't change. Shadows still draw every face.
const SIDE_K = 16, SIDE_ARC = { all: true, s: 0, L: SIDE_K, tall: true, ts: 0, tL: SIDE_K };
const RT0 = 1 + SIDE_K + SIDE_K/2;   // (the first row of the sticks' walls in a block's second order: see mergeCutGen)
// which order the merged blocks are drawn in (world.js, round 8 item 3): from far away the second one, with the lean round parts and the thin sticks' walls over a narrower arc
const FARM = { on: false, lean: false, sticks: false, key: 0, stamp: 0, applied: -1, appliedOn: null }, FAR_MESHES = new Set();
function farFrame(){
  const lim = 2*zoom/H;
  FARM.lean = FAR_CFG.lean && lim >= LEAN_LIM; FARM.sticks = FAR_CFG.sticks && lim >= STICK_LIM; FARM.on = FARM.lean || FARM.sticks; FARM.key = (FARM.lean ? 1 : 0) + (FARM.sticks ? 2 : 0);
  if (FARM.on !== FARM.appliedOn || FARM.stamp !== FARM.applied){ FARM.appliedOn = FARM.on; FARM.applied = FARM.stamp; for (const m of FAR_MESHES) m.geometry = FARM.on ? m.userData.farGeo : m.userData.stdGeo; }
}
// the run of slices (from s, L of them) that are not turned away; null if all of them are (or none, which can't be)
function arcRun(hid){
  let s = -1; for (let k = 0; k < SIDE_K; k++) if (!hid[k] && hid[(k + SIDE_K - 1)%SIDE_K]){ s = k; break; }
  if (s < 0) return null;
  let L = 0; while (L < SIDE_K && !hid[(s + L)%SIDE_K]) L++;
  if (s + L > SIDE_K + SIDE_K/2) return null;   // (can't happen with 8 slices; just in case)
  return { s, L };
}
function sideArc(){
  cam.updateMatrixWorld(); const e = cam.matrixWorld.elements, tx = e[8], tz = e[10];   // toward the camera (it's orthographic: the same for every pixel)
  if (Math.hypot(tx, tz) < 1e-3){ SIDE_ARC.all = true; SIDE_ARC.tall = true; return; }
  const a = Math.atan2(tz, tx), w = TAU/SIDE_K, hid = [], hidT = [];
  for (let k = 0; k < SIDE_K; k++){
    const p0 = k*w, p1 = p0 + w, da = ((a - p0)%TAU + TAU)%TAU;   // (is the camera's own direction inside the slice?)
    const best = da <= w ? 1 : Math.max(Math.cos(p0 - a), Math.cos(p1 - a));
    hid.push(best < -.002); hidT.push(best < .5);
  }
  const r = arcRun(hid);
  if (!r){ SIDE_ARC.all = true; SIDE_ARC.tall = true; return; }
  SIDE_ARC.all = false; SIDE_ARC.s = r.s; SIDE_ARC.L = r.L;
  // the thin sticks' walls, when they are drawn from far away: only the walls within 60 degrees of the camera (a stick under a pixel and a half wide shows its most frontal side; the other, at a slant, adds almost nothing)
  const t = FARM.sticks ? arcRun(hidT) : null;
  if (t){ SIDE_ARC.tall = false; SIDE_ARC.ts = t.s; SIDE_ARC.tL = t.L; } else { SIDE_ARC.tall = false; SIDE_ARC.ts = r.s; SIDE_ARC.tL = r.L; }
}
const cutRest = u => u.A + u.H + u.S;
// Pieces off screen. A merged block is drawn whole whenever any of it shows, and a tall tower's box can be the only
// part of a 3 x 3 block in view. mergeCut notes where each piece's triangles went (rows: A, then the wall slices), and each
// frame the pieces whose boxes miss the view are left out of the draw: the same triangles are drawn where they can show, in
// the same order, so the picture doesn't change. Several ranges go up in one call where the browser has WEBGL_multi_draw,
// else as one draw each (see renderBufferDirect below).
const CULL = { cam: null, minPx: 1, lvl: -1, stamp: 0, pl: new Float64Array(24), pad: 0, total: 0, drawn: 0, tris: 0 }, _cullM = new THREE.Matrix4(), _cullF = new THREE.Frustum();
function cullFrame(camera = cam, area = camera){   // (for the camera about to draw: the view's, or the static cache's; area: the camera whose frustum is what's wanted, a strip of the cache)
  CULL.cam = camera; area.updateMatrixWorld(); _cullM.multiplyMatrices(area.projectionMatrix, area.matrixWorldInverse); _cullF.setFromProjectionMatrix(_cullM);
  for (let i = 0; i < 6; i++){ const p = _cullF.planes[i]; CULL.pl.set([p.normal.x, p.normal.y, p.normal.z, p.constant], i*4); }
  CULL.pad = 4*(2*zoom/H);   // (a few screen pixels of room, in world units)
  { const lim = (2*zoom/H)*CULL.minPx; let lv = -1; for (let k = 0; k < SMALL_N; k++) if (SMALL_E[k] <= lim) lv = k; CULL.lvl = PH.tests.noSmall ? -1 : lv; }   // (triangles with no edge as long as a pixel's worth are left out)
  CULL.stamp++; CULL.total = CULL.drawn = CULL.tris = 0;
}
// (6) Speed-based detail while the view turns, tilts or zooms (a cheat: the overlay test "no speed-based detail" turns it off). Frames drawn the
// old way while the view changes leave out, per plot, triangles up to one or two size classes (SMALL_E) bigger than the usual cutoff, by how fast
// that plot moves on screen (render pixels a frame, around the pivot at the middle of the screen). Motion hides what the cache would show at rest:
// a still camera never reduces anything and the cache is always drawn at full detail. Plots near the cursor keep full detail whatever the speed.
// A plot drops a class only when clearly faster than the class's threshold (SD.hys) and gets it back only when clearly slower, one class a frame.
// Tune from the console (they take effect on the next frame): SD.v0 (px/frame where the first class goes), SD.step (each next class at this multiple),
// SD.max (classes at most), SD.fast (px/frame where a fast spin may drop fastMax more classes), SD.cursorPx (full detail within this many px of the
// cursor), SD.hys (margin round a threshold), SD.on = false.
const SD = { on: true, v0: 6, step: 2, max: 2, fast: 40, fastMax: 1, cursorPx: 200, hys: .25, hist: [0, 0, 0, 0, 0, 0], top: 0, pieces: 0, moving: false,
  dYaw: 0, dZoom: 0, dPitch: 0, pY: null, pZ: 0, pP: 0, list: [], stamp: -1 };
function sdTrack(){   // every frame: how far the view turned, tilted and zoomed since the last one
  SD.dYaw = SD.pY === null ? 0 : yaw - SD.pY; SD.dZoom = SD.pY === null ? 0 : (zoom - SD.pZ)/zoom; SD.dPitch = SD.pY === null ? 0 : PITCH - SD.pP;
  SD.pY = yaw; SD.pZ = zoom; SD.pP = PITCH;
}
const _sdVec = new THREE.Vector3(), _sdMat = new THREE.Matrix4();
function sdApply(){   // for a frame drawn the old way: each plot's extra size classes, from how fast it moves
  CULL.sd = false;
  if (!SD.on || PH.tests.noSpeed || PH.tests.noSmall) return;
  if (SD.stamp !== SC_EDITS){ SD.list = []; const seen = new Set(); world.traverse(o => { const g = o.isMesh && o.geometry, P = g && g.userData.pcs; if (P && !seen.has(P)){ seen.add(P); SD.list.push(P); } }); SD.stamp = SC_EDITS; }
  const w = Math.abs(SD.dYaw), tz = Math.abs(SD.dZoom), tp = Math.abs(SD.dPitch);
  SD.moving = w + tz + tp > 1e-6; SD.hist.fill(0); SD.top = 0; SD.pieces = 0;
  const lv = CULL.lvl, nT = SD.max + SD.fastMax, thr = [];
  const v0 = PH.tests.sdOld ? 10 : SD.v0;   // (round 6's start speed was 10; round 7 item 6 starts the first class at 6: a slow drag, under about 5, is untouched either way)
  for (let k = 0; k < nT; k++) thr.push(k < SD.max ? v0*SD.step**k : SD.fast*SD.step**(k - SD.max));
  if (!SD.moving){ for (const P of SD.list) if (P.xlOn){ P.xl.fill(0); P.xlOn = 0; } return; }   // (a still view is never reduced)
  cam.updateMatrixWorld(); const e = cam.matrixWorld.elements, upp = H/(2*zoom), sp = Math.sin(PITCH), cp = Math.cos(PITCH);
  const rx = e[0], rz = e[2], hr = Math.hypot(e[8], e[10]) || 1, fx = -e[8]/hr, fz = -e[10]/hr;
  const rr = renderer.domElement.getBoundingClientRect(), cur = typeof ptrLast !== 'undefined' && ptrLast ? [((ptrLast.x - rr.left)/rr.width)*2 - 1, -(((ptrLast.y - rr.top)/rr.height)*2 - 1)] : null;
  const VPm = _sdMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  for (const P of SD.list){
    if (!P.xl) P.xl = new Int8Array(P.n);
    let any = 0;
    for (let i = 0; i < P.n; i++){
      const o = i*6, b = P.box, cx = (b[o] + b[o + 1])/2, cz = (b[o + 4] + b[o + 5])/2, cy = (b[o + 2] + b[o + 3])/2, hx = (b[o + 1] - b[o])/2, hz = (b[o + 5] - b[o + 4])/2;
      const dx = cx - camT.x, dz = cz - camT.z;
      // the part of the piece nearest the pivot (a big piece is as slow as its slowest part)
      const a = Math.max(0, Math.abs(dx*rx + dz*rz) - (Math.abs(rx)*hx + Math.abs(rz)*hz)), bb = Math.max(0, Math.abs(dx*fx + dz*fz) - (Math.abs(fx)*hx + Math.abs(fz)*hz));
      let s = upp*(Math.hypot(w*bb, w*a*sp) + tp*Math.hypot(a, bb, 0));
      if (tz) s += upp*tz*Math.hypot(a*upp, bb*sp*upp);
      let L = P.xl[i], t = L;
      // plots near the cursor keep everything
      let keep = false;
      if (cur){ _sdVec.set(cx, cy, cz).applyMatrix4(VPm); keep = Math.hypot((_sdVec.x - cur[0])*W/2, (_sdVec.y - cur[1])*H/2) - upp*Math.max(hx, hz) < SD.cursorPx; }
      if (keep) t = 0;
      else {
        while (t < nT && s > thr[t]*(1 + SD.hys)) t++;                       // faster: drop a class (at once, as far as the speed says)
        if (t === L && L > 0 && s < thr[L - 1]*(1 - SD.hys)) t = L - 1;     // clearly slower: one class back a frame
      }
      if (keep && L > 0) t = L - 1;   // (and back from the cursor's side the same way)
      P.xl[i] = t; if (t) any = 1; SD.hist[t]++; SD.pieces++; if (s > SD.top) SD.top = s;
    }
    P.xlOn = any;
  }
  CULL.sd = true;
}
SD.line = () => 'speed-based detail: ' + (!SD.on || PH.tests.noSpeed ? 'off' : !SD.moving ? 'view still, full detail' : 'plots by extra classes ' + SD.hist.slice(0, SD.max + SD.fastMax + 1).map((n, k) => '+' + k + ': ' + n).join('  ') + '   fastest ' + SD.top.toFixed(0) + ' px/frame');
// which of a merged mesh's pieces touch the view (worked out once a frame per mesh); returns how many do
function pieceVis(P){
  if (P.stamp === CULL.stamp) return P.seen;
  const pl = CULL.pl, pad = CULL.pad, b = P.box, v = P.vis; let seen = 0;
  for (let i = 0; i < P.n; i++){
    const o = i*6; let ok = 1;
    for (let q = 0; q < 24; q += 4){ const nx = pl[q], ny = pl[q + 1], nz = pl[q + 2];   // (the corner furthest along the plane's normal)
      if (nx*(nx > 0 ? b[o + 1] : b[o]) + ny*(ny > 0 ? b[o + 3] : b[o + 2]) + nz*(nz > 0 ? b[o + 5] : b[o + 4]) + pl[q + 3] < -pad){ ok = 0; break; } }
    v[i] = ok; seen += ok;
  }
  P.stamp = CULL.stamp; P.seen = seen; CULL.total += P.n; CULL.drawn += seen;
  return seen;
}
// the ranges of rows r0 to r1 (inclusive) for the pieces on show, runs that sit next to each other joined; sets the mesh up to
// draw them. Returns false when everything shows (the plain draw range does it).
const MD = { s: new Int32Array(64), n: new Int32Array(64) };
function multiRows(o, P, r0, r1, t0 = 0, t1 = -1){
  if (PH.tests.noCull) return false;
  const seen = pieceVis(P), lv = CULL.lvl, xl = CULL.sd && P.xlOn ? P.xl : null; if (seen === P.n && lv < 0 && !xl && t1 < t0) return false;
  const v = P.vis, n = P.n; let m = 0, tot = 0;
  for (let sp = 0; sp < 2; sp++){ const ra = sp ? t0 : r0, rb = sp ? t1 : r1;
    for (let r = ra; r <= rb; r++) for (let i = 0; i < n; i++){
      if (!v[i]) continue; const x = xl ? xl[i] : 0, c = lv < 0 && !x ? P.rowN[r*n + i] : P.rowC[(r*n + i)*SMALL_N + Math.min(SMALL_N - 1, Math.max(lv, 0) + x)]; if (!c) continue;
      const st = P.rowS[r*n + i];
      if (m && MD.s[m - 1] + MD.n[m - 1] === st) MD.n[m - 1] += c;
      else { if (m === MD.s.length){ const s2 = new Int32Array(m*2), n2 = new Int32Array(m*2); s2.set(MD.s); n2.set(MD.n); MD.s = s2; MD.n = n2; } MD.s[m] = st; MD.n[m++] = c; }
      tot += c;
    } }
  o.userData.md = m ? { s: MD.s.slice(0, m), n: MD.n.slice(0, m) } : null;
  CULL.tris += tot; return tot;
}
function cutBefore(r, s, c, g){
  const u = g.userData.cut, P = g.userData.pcs; g.drawRange.start = 0; g.drawRange.count = g.userData.full ? cutRest(u) : u.A;
  if (P && !g.userData.full && c === CULL.cam){ const t = multiRows(this, P, 0, 0); if (t !== false){ g.drawRange.start = 0; g.drawRange.count = t; } }
}
function cutAfter(r, s, c, g){ g.drawRange.start = 0; g.drawRange.count = cutRest(g.userData.cut); this.userData.md = null; }
function sideBefore(r, s, c, g){
  const u = g.userData.cut, b = u.A + u.H, o = u.off, P = g.userData.pcs, A = SIDE_ARC, two = !!u.offT && !A.all;   // (two: the walls over their arc and the sticks' walls over theirs)
  if (A.all){ g.drawRange.start = b; g.drawRange.count = u.S; if (P && c === CULL.cam){ const t = P.far ? multiRows(this, P, 1, SIDE_K, RT0, RT0 + SIDE_K - 1) : multiRows(this, P, 1, SIDE_K); if (t !== false){ g.drawRange.start = 0; g.drawRange.count = t; } } return; }
  const s0 = A.s, e = s0 + A.L, end = e <= SIDE_K ? b + o[e] : b + u.S + o[e - SIDE_K];
  g.drawRange.start = b + o[s0]; g.drawRange.count = end - (b + o[s0]);
  if (P && c === CULL.cam){ const ts = A.ts, te = ts + A.tL; const t = two || P.far ? multiRows(this, P, 1 + s0, e, RT0 + ts, RT0 + te - 1) : multiRows(this, P, 1 + s0, e); if (t !== false){ g.drawRange.start = 0; g.drawRange.count = t; return; } }
  if (two){   // (no per-piece ranges: the two runs, in one multi-range draw)
    const tb = b + o[SIDE_K], ot = u.offT, ts = A.ts, te = ts + A.tL, s2 = tb + ot[ts], n2 = (te <= SIDE_K ? tb + ot[te] : b + u.S + o[SIDE_K/2] + ot[te - SIDE_K]) - s2, n1 = g.drawRange.count, s1 = g.drawRange.start;
    this.userData.md = { s: Int32Array.of(s1, s2), n: Int32Array.of(n1, n2) }; g.drawRange.start = 0; g.drawRange.count = n1 + n2;
  }
}
{ // (several ranges in one draw: three itself only draws one, so while a mesh with ranges is drawn the context's drawElements is swapped)
  const gl = renderer.getContext(), ext = window.NO_MULTI_DRAW ? null : gl.getExtension('WEBGL_multi_draw'), rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function(camera, sc, geo, mat, obj, grp){
    const md = obj.userData.md; if (!md) return rbd.call(this, camera, sc, geo, mat, obj, grp);
    const bpe = geo.index.array ? geo.index.array.BYTES_PER_ELEMENT : geo.userData.bpe, n = md.s.length;
    if (ext){ if (!md.o){ md.o = new Int32Array(n); for (let i = 0; i < n; i++) md.o[i] = md.s[i]*bpe; } }
    gl.drawElements = function(mode, count, type){
      if (ext) ext.multiDrawElementsWEBGL(mode, md.n, 0, type, md.o, 0, n);
      else { const f = Object.getPrototypeOf(gl).drawElements; for (let i = 0; i < n; i++) f.call(gl, mode, md.n[i], type, md.s[i]*bpe); }
    };
    try { return rbd.call(this, camera, sc, geo, mat, obj, grp); } finally { delete gl.drawElements; }
  };
}
// how many of a geometry's indices are its own triangles (the copied wall slices left out)
const triIndexCount = g => g.userData.cut ? cutRest(g.userData.cut) : (g.index ? g.index.count : g.attributes.position.count);
// Static and live (the static cache: see staticcache.js). A mesh that is built once and only changes with the camera, the sun and
// the time-of-day uniforms is moved to layer 5 (STATIC_BIT) when it joins the world; the live set (people, plants, vehicles,
// anything with a time uniform or a clipping plane, anything see-through) stays where it was. The camera draws both
// (layers.enableAll) until the cache is on, then the live set on top of the cache's picture. Anything unknown stays live.
const STATIC_BIT = 32;
const isStaticMat = m => !!m && (m.isMeshToonMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial) && !m.transparent && !m.userData.colorOnly && !m.userData.live && !m.clippingPlanes;
const markStatic = o => { if (o.isMesh && !o.isInstancedMesh && o.layers.mask === 1 && !o.userData.noStatic && isStaticMat(o.material)){ o.layers.mask = STATIC_BIT; if (o.material === ATLAS) glowOverlay(o); } };
// A frozen tree's matrices are set once and never change (nothing writes to them), so after the first pass over it the world-matrix
// update (every frame, main.js) doesn't walk it again: it was visiting some 12,000 objects a frame to find nothing to do.
// (Overlay test "walk every matrix" switches this off.)
const _omw = THREE.Object3D.prototype.updateMatrixWorld;
function frozenUpdate(force){
  if (this._mwDone && !this.matrixWorldNeedsUpdate && !force && !PH.tests.walkAll) return;
  _omw.call(this, force); this._mwDone = true;
}
function freezeTree(g){ g.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; markStatic(o); }); g.updateMatrixWorld = frozenUpdate; return g; }
let connGroup = null, curPorts = null, EXT = 12;
const camT = new THREE.Vector3(0, TARGET_Y, 0), camGoal = new THREE.Vector3(0, TARGET_Y, 0);
// The style (clutter, greenery, neon) of every piece is stored with it when it is built. Generation reads S.clutter,
// S.green and S.neon, so each piece is generated with its own stored values swapped in.
const STYLE_KEY = 'neonIsland.style';
const STYLE = (() => { try { const d = JSON.parse(localStorage.getItem(STYLE_KEY) || 'null'); if (d) return { clutter: d.clutter === undefined ? 1 : +d.clutter, green: d.green === undefined ? 1 : +d.green, neon: d.neon === undefined ? 1 : +d.neon }; } catch (e) {} return { clutter: 1, green: 1, neon: 1 }; })();
function saveStyle(){ try { localStorage.setItem(STYLE_KEY, JSON.stringify(STYLE)); } catch (e) {} }
const styleNow = () => ({ clutter: STYLE.clutter, green: STYLE.green, neon: STYLE.neon });
const DEFAULT_STYLE = { clutter: 1, green: 1, neon: 1 };
function withStyle(st, fn){
  const was = { clutter: S.clutter, green: S.green, neon: S.neon }, u = st || DEFAULT_STYLE;
  S.clutter = u.clutter === undefined ? 1 : u.clutter; S.green = u.green === undefined ? 1 : u.green; S.neon = u.neon === undefined ? 1 : u.neon;
  try { return fn(); } finally { S.clutter = was.clutter; S.green = was.green; S.neon = was.neon; }
}
function hash(...a){ let h = 2166136261; for (const v of a){ const s = String(v); for (let k=0;k<s.length;k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } } return h >>> 0; }

// run a builder into its own group: the kit functions (box, plant, glow...) write into these globals
// Generating a piece produces data only (geometry per material, plant instances, glow points).
// Nothing is drawn per piece: pieces are batched into regions (see rebuildRegion).
// Every static toon material is folded into ONE material: its colour and glow ride along as vertex attributes,
// so a whole building is a single draw call no matter how many materials it was modelled with.
const ATLAS = new THREE.MeshToonMaterial({ color:0xffffff, gradientMap:gradTex, vertexColors:true });
// (performance overlay tests, exact mode only: variants of this shader, to find what its corners cost; see perfhud.js)
const ATLAS_TEST = { lean: false, noGlow: false, noData: false, gbuf: false };
ATLAS.customProgramCacheKey = () => 'atlas' + (ATLAS_TEST.lean ? 'L' : '') + (ATLAS_TEST.noGlow ? 'G' : '') + (ATLAS_TEST.noData ? 'D' : '') + (ATLAS_TEST.gbuf ? 'B' : '');
ATLAS.onBeforeCompile = sh => {
  sh.uniforms.emI = EM_I; sh.uniforms.fTime = FOL_UNI.time; sh.uniforms.lodFine = LOD.fine; sh.uniforms.lightsOn = LIGHTS_ON;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aEm; attribute float aFlk; attribute float aFine; attribute float aOn; uniform float emI[7]; uniform float fTime; uniform float lodFine; uniform float lightsOn; varying vec3 vEmis;' + FLK_GLSL + BLINK_GLSL + LIT_GLSL)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + LOD_CULL_GLSL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nint ek = int(aEm.a*255.0 + .5); if (ek == 0) vEmis = vec3(0.0); else { float lon = ek >= 1 && ek <= 4 ? litOn(aOn, lightsOn, fTime) : 1.0; vEmis = aEm.rgb * mix(ek == 1 ? .22*(1.0 - .6*lightsOn) : 0.0, emI[ek], lon) * flicker(aFlk, fTime);   // a switched-off window is just a dim room (and most corners don\'t glow at all: nothing to work out)\nif (ek == 6) vEmis *= mix(0.05, 1.0, blink((modelMatrix * vec4(transformed, 1.0)).y, fTime)); }');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEmis;')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmis;')
    // The light's three bands worked out instead of looked up: the gradient texture (core.js) is three texels, read
    // nearest, so the band is which third of 0..1 the light falls in, and its brightness the texel's value. The same
    // numbers, one texture read less for every pixel of every building (and at this size, many pixels are shaded
    // several times over: a triangle smaller than a pixel still costs a few).
    .replace('#include <gradientmap_pars_fragment>', `uniform sampler2D gradientMap;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ){
  float u = dot( normal, lightDirection )*0.5 + 0.5, i = clamp( floor( u*3.0 ), 0.0, 2.0 );
  return vec3( i < 0.5 ? ${gData[0]}.0/255.0 : i < 1.5 ? ${gData[4]}.0/255.0 : ${gData[8]}.0/255.0 );
}`);
  if (ATLAS_TEST.lean){   // the view position isn't used by these lights with this camera: not passed at all (same picture)
    sh.vertexShader = sh.vertexShader.replace('varying vec3 vViewPosition;', '').replace('vViewPosition = - mvPosition.xyz;', '');
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_toon_pars_fragment>', THREE.ShaderChunk.lights_toon_pars_fragment.replace('varying vec3 vViewPosition;', 'const vec3 vViewPosition = vec3( 0.0, 0.0, 1.0 );'));
  }
  // colors only: no sunlight, sky light or shadow lookup, and the vertex shader no longer passes the shadow map's
  // coordinates or the view position: what drawing the buildings would cost if the lighting were worked out afterwards,
  // once per pixel (picture changes: flat, unlit colors)
  if (ATLAS_TEST.gbuf){
    sh.vertexShader = sh.vertexShader.replace('#include <shadowmap_vertex>', '').replace('varying vec3 vViewPosition;', '').replace('vViewPosition = - mvPosition.xyz;', '');
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_toon_pars_fragment>', 'varying vec3 vNormal;').replace('#include <shadowmap_pars_fragment>', '')
      .replace('#include <lights_toon_fragment>', '').replace('#include <lights_fragment_begin>', '').replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '')
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', 'vec3 outgoingLight = diffuseColor.rgb*0.6 + totalEmissiveRadiance;');
  }
  if (ATLAS_TEST.noGlow) sh.vertexShader = sh.vertexShader.replace(/int ek = int\(aEm\.a\*255\.0 \+ \.5\);[^\n]*\n[^\n]*\n/, 'vEmis = aEm.rgb;\n');   // (picture changes: lights don't switch, flicker or blink)
  if (ATLAS_TEST.noData) sh.vertexShader = sh.vertexShader.replace(/int ek = int\(aEm\.a\*255\.0 \+ \.5\);[^\n]*\n[^\n]*\n/, 'vEmis = vec3(0.0);\n').replace('#include <color_vertex>', 'vColor = vec3(0.8);');   // (picture changes: no colors, no glow)
};
// the same material for the walls' mesh (see sideArc), so its draws merge apart from the rest; the same shader
const ATLAS_SIDE = ATLAS.clone(); ATLAS_SIDE.onBeforeCompile = ATLAS.onBeforeCompile; ATLAS_SIDE.customProgramCacheKey = ATLAS.customProgramCacheKey;
// The glow overlay (static cache, staticcache.js). The cache holds the buildings as they were drawn; the lights that flicker
// (aFlk) and the aircraft lights that blink (glow kind 6) change every frame. Each static building mesh carries a child mesh
// over just those triangles, drawn after the cache is copied in, with the same shader (so the same corner positions and
// depth), depth test "equal or nearer", no depth write, color image only: it repaints them where they're the visible surface.
// It sits on layer 6 (OV_BIT): the live pass draws it, the old path (which draws the buildings themselves) doesn't.
const OV_BIT = 64;
const ATLAS_OV = ATLAS.clone(); ATLAS_OV.onBeforeCompile = ATLAS.onBeforeCompile; ATLAS_OV.customProgramCacheKey = ATLAS.customProgramCacheKey; ATLAS_OV.depthWrite = false;
function glowOverlay(mesh){
  const g = mesh.geometry, fl = g.attributes.aFlk, em = g.attributes.aEm, on = g.attributes.aOn, I = g.index && g.index.array; if (!fl || !em || !on || !I) return;
  const F = fl.array, E = em.array, ON = on.array, u = g.userData.cut, fb = [], win = [];
  // flickering lights and aircraft lights (always), and the windows that switch (their threshold, aOn, against LIGHTS_ON): a window
  // stutters with the clock while LIGHTS_ON is within 0.04 above its threshold (litOn, core.js), so those are drawn every frame too
  const scan = (a, b) => { for (let q = a; q < b; q += 3){ const i0 = I[q], i1 = I[q + 1], i2 = I[q + 2], k0 = E[i0*4 + 3];
    if (F[i0] || F[i1] || F[i2] || k0 === 6 || E[i1*4 + 3] === 6 || E[i2*4 + 3] === 6) fb.push(i0, i1, i2);
    else if (k0 >= 1 && k0 <= 4) win.push(i0, i1, i2); } };
  if (u){ scan(0, u.A); scan(u.A + u.H, u.A + u.H + u.S); } else scan(0, g.userData.shown ?? I.length);   // (the walls once: not the copied slices; not the faces nobody sees)
  if (!fb.length && !win.length) return;
  const off = new Int32Array(257); for (let q = 0; q < win.length; q += 3) off[ON[win[q]] + 1]++;
  for (let b = 0; b < 256; b++) off[b + 1] += off[b];
  const cur = off.slice(0, 256), sorted = new Array(win.length);   // (windows by threshold, so the band of them to draw is one run)
  for (let q = 0; q < win.length; q += 3){ const p = cur[ON[win[q]]]++*3; sorted[p] = win[q]; sorted[p + 1] = win[q + 1]; sorted[p + 2] = win[q + 2]; }
  const out = fb.concat(sorted);
  const og = new THREE.BufferGeometry(), blockKey = mesh.userData.blockKey;
  if (blockKey !== undefined){
    // a region's merged mesh: the overlay gets vertex data of its own (just the corners its triangles use), so that a whole region of them can be joined into one draw (ovBatch below)
    const nv0 = g.attributes.position.count, map = new Int32Array(nv0).fill(-1), src = [], idx = new Array(out.length);
    for (let q = 0; q < out.length; q++){ const v = out[q]; let r = map[v]; if (r < 0){ r = map[v] = src.length; src.push(v); } idx[q] = r; }
    for (const k in g.attributes){ const a = g.attributes[k], n = a.itemSize, arr = new a.array.constructor(src.length*n);
      for (let v = 0; v < src.length; v++) for (let c = 0; c < n; c++) arr[v*n + c] = a.array[src[v]*n + c];
      og.setAttribute(k, new THREE.BufferAttribute(arr, n, a.normalized)); }
    og.setIndex(new THREE.BufferAttribute(src.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  } else {
    for (const k in g.attributes) og.setAttribute(k, g.attributes[k]);
    og.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
  }
  if (!g.boundingSphere) g.computeBoundingSphere(); og.boundingSphere = g.boundingSphere.clone();
  g.addEventListener('dispose', () => og.dispose());
  const ov = new THREE.Mesh(og, ATLAS_OV); ov.layers.mask = blockKey !== undefined && !ovPerBlock() ? 0 : OV_BIT; ov.receiveShadow = mesh.receiveShadow; ov.castShadow = false; ov.userData.isOv = true;
  ov.userData.ovInfo = { nFB: fb.length, off }; ov.onBeforeRender = ovBefore; ov.onAfterRender = ovAfter;
  mesh.add(ov);
  if (blockKey !== undefined) ovRegister(blockKey, ov, mesh.receiveShadow);
}
// what the overlay draws this frame: the flickering and blinking triangles, and the windows in the stutter band of LIGHTS_ON
function ovBefore(r, s, c, g){
  const u = this.userData.ovInfo, lv = LIGHTS_ON.value, lo = Math.max(0, Math.floor((lv - .04)*255) - 1), hi = Math.min(255, Math.ceil(lv*255) + 1);
  const a = u.nFB, o0 = u.off[lo]*3, b = hi >= lo ? (u.off[hi + 1] - u.off[lo])*3 : 0;   // (offsets are in triangles, ranges in indices)
  if (!b){ g.drawRange.start = 0; g.drawRange.count = a; }
  else if (!a){ g.drawRange.start = o0; g.drawRange.count = b; }
  else { g.drawRange.start = 0; g.drawRange.count = a + b; this.userData.md = { s: new Int32Array([0, a + o0]), n: new Int32Array([a, b]) }; }
}
function ovAfter(r, s, c, g){ g.drawRange.start = 0; g.drawRange.count = Infinity; this.userData.md = null; }
// The overlays of the merged regions (one each, 226 draw calls in a view at zoom 30) joined, a batch for every OVB x OVB block of regions: one mesh whose index holds each member's triangles one after another, and each frame
// the ranges of the members in view (what each member's own overlay would draw) go up in one multi-range draw. Opaque, no depth write, depth equal or nearer: only exactly coplanar duplicates could tell the
// order apart. The members' own overlays stay (layer 0, not drawn) for the overlay test "glow overlay: one draw per region (as before)".
const OVB = 4, ovBlocks = new Map(), ovBatches = new Map(), ovDirty = new Set(); let ovModeNow = null;
const ovPerBlock = () => !!(PH.tests.ovPerBlock || window.__OV_PER_BLOCK);
const ovSuperKey = k => { const c = k.indexOf(','); return Math.floor(+k.slice(0, c)/OVB) + ',' + Math.floor(+k.slice(c + 1)/OVB); };
function ovRegister(key, ov, rs){ let l = ovBlocks.get(key); if (!l) ovBlocks.set(key, l = []); l.push({ ov, rs }); ovDirty.add(ovSuperKey(key)); }
function ovForget(key){ if (ovBlocks.delete(key)) ovDirty.add(ovSuperKey(key)); }
function ovFlush(){
  const per = ovPerBlock();
  if (per !== ovModeNow){ ovModeNow = per; for (const l of ovBlocks.values()) for (const m of l) m.ov.layers.mask = per ? OV_BIT : 0; for (const b of ovBatches.values()) b.layers.mask = per ? 0 : OV_BIT; }
  if (!ovDirty.size) return;
  for (const sk of ovDirty){
    for (const sfx of ['r', 'p']){ const old = ovBatches.get(sk + sfx); if (old){ world.remove(old); old.geometry.dispose(); ovBatches.delete(sk + sfx); } }
    for (const rs of [true, false]){
      const mem = []; for (const [k, l] of ovBlocks) if (ovSuperKey(k) === sk) for (const m of l) if (m.rs === rs && m.ov.parent) mem.push(m);
      if (!mem.length) continue;
      let nv = 0, ni = 0; for (const m of mem){ nv += m.ov.geometry.attributes.position.count; ni += m.ov.geometry.index.count; }
      const names = Object.keys(mem[0].ov.geometry.attributes), geo = new THREE.BufferGeometry();
      if (mem.some(m => Object.keys(m.ov.geometry.attributes).length !== names.length || names.some(n => !m.ov.geometry.attributes[n]))) continue;
      for (const n of names){ const a0 = mem[0].ov.geometry.attributes[n], arr = new a0.array.constructor(nv*a0.itemSize); let q = 0; for (const m of mem){ const a = m.ov.geometry.attributes[n].array; arr.set(a, q); q += a.length; }
        geo.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized)); }
      const ix = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), rec = []; let k = 0, base = 0;
      for (const m of mem){ const g = m.ov.geometry, I = g.index.array; rec.push({ at: k, info: m.ov.userData.ovInfo, c: g.boundingSphere.center, r: g.boundingSphere.radius }); for (let q = 0; q < I.length; q++) ix[k++] = I[q] + base; base += g.attributes.position.count; }
      geo.setIndex(new THREE.BufferAttribute(ix, 1)); geo.computeBoundingSphere();
      const b = new THREE.Mesh(geo, ATLAS_OV); b.layers.mask = per ? 0 : OV_BIT; b.receiveShadow = rs; b.castShadow = false; b.frustumCulled = false; b.matrixAutoUpdate = false; b.updateMatrix(); b.matrixWorldNeedsUpdate = true;
      b.userData.ovb = rec; b.onBeforeRender = ovbBefore; b.onAfterRender = ovAfter; world.add(b); ovBatches.set(sk + (rs ? 'r' : 'p'), b);
    }
  }
  ovDirty.clear();
}
let _ovS = new Int32Array(256), _ovN = new Int32Array(256);
function ovbBefore(r, s, c, g){
  const rec = this.userData.ovb, lv = LIGHTS_ON.value, lo = Math.max(0, Math.floor((lv - .04)*255) - 1), hi = Math.min(255, Math.ceil(lv*255) + 1), pl = CULL.pl, pad = CULL.pad, cull = c === CULL.cam;
  let m = 0, tot = 0;
  for (let i = 0; i < rec.length; i++){
    const e = rec[i];
    if (cull){ const rr = e.r + pad; let out = false; for (let q = 0; q < 24; q += 4) if (pl[q]*e.c.x + pl[q + 1]*e.c.y + pl[q + 2]*e.c.z + pl[q + 3] < -rr){ out = true; break; } if (out) continue; }
    const u = e.info, a = u.nFB, o0 = u.off[lo]*3, b = hi >= lo ? (u.off[hi + 1] - u.off[lo])*3 : 0;
    if (m + 2 > _ovS.length){ const s2 = new Int32Array(_ovS.length*2), n2 = new Int32Array(_ovS.length*2); s2.set(_ovS); n2.set(_ovN); _ovS = s2; _ovN = n2; }
    if (a){ _ovS[m] = e.at; _ovN[m++] = a; tot += a; }
    if (b){ _ovS[m] = e.at + a + o0; _ovN[m++] = b; tot += b; }
  }
  if (!m){ g.drawRange.start = 0; g.drawRange.count = 0; this.userData.md = null; return; }
  g.drawRange.start = 0; g.drawRange.count = tot; this.userData.md = { s: _ovS.slice(0, m), n: _ovN.slice(0, m) };
}
let SIDE_SPLIT = false;   // (set while a plot or a megastructure is collected: see collect)
const atlasable = m => m && m.isMeshToonMaterial && !m.map && m !== M.cloud && m !== ATLAS && m !== ATLAS_SIDE;
// Faces nobody can ever see: wholly and well inside one of the piece's solid blocks (a box's end sunk into a wall, a post
// buried in a slab). From any angle the block is in front of them. A block only counts if it's always drawn (never thinned
// out when zoomed out), opaque and a true box. (Faces pressed flat against a block's face are kept: in testing they still
// changed a few pixels.)
// The hidden triangles go to the end of the bucket's list (hid: how many); they're left out of drawing but kept, so a
// building's sweep in or out (which slices it open) can draw them, and the walking maps still see every triangle.
const HIDE_DEEP = .01;   // how far inside a block a face must be to count as hidden (world units)
// the piece's blocks, ready for testing (once per piece): their inverse matrices, bounds and a grid to find them by
function prepCovers(covers){
  if (!covers || !covers.length) return null;
  const G = 1.0, grid = new Map(), key = (x, y, z) => ((x + 2048)*4096 + (y + 2048))*4096 + (z + 2048);
  // (only true boxes: square corners, not mirrored; a slanted or flipped one is left out rather than reasoned about)
  covers = covers.filter(e => { const d01 = e[0]*e[4] + e[1]*e[5] + e[2]*e[6], d02 = e[0]*e[8] + e[1]*e[9] + e[2]*e[10], d12 = e[4]*e[8] + e[5]*e[9] + e[6]*e[10];
    const s0 = Math.hypot(e[0], e[1], e[2]), s1 = Math.hypot(e[4], e[5], e[6]), s2 = Math.hypot(e[8], e[9], e[10]);
    const det = e[0]*(e[5]*e[10] - e[6]*e[9]) - e[4]*(e[1]*e[10] - e[2]*e[9]) + e[8]*(e[1]*e[6] - e[2]*e[5]);
    return s0 > 0 && s1 > 0 && s2 > 0 && det > 0 && Math.abs(d01) < 1e-6*s0*s1 && Math.abs(d02) < 1e-6*s0*s2 && Math.abs(d12) < 1e-6*s1*s2; });
  if (!covers.length) return null;
  const cv = covers.map(e => {
    const inv = new THREE.Matrix4().fromArray(e).invert().elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let q = 0; q < 8; q++){ const a = q & 1 ? .5 : -.5, c = q & 2 ? .5 : -.5, d = q & 4 ? .5 : -.5;
      const x = e[0]*a + e[4]*c + e[8]*d + e[12], y = e[1]*a + e[5]*c + e[9]*d + e[13], z = e[2]*a + e[6]*c + e[10]*d + e[14];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { inv, lim: [.5 - HIDE_DEEP/(sx || 1), .5 - HIDE_DEEP/(sy || 1), .5 - HIDE_DEEP/(sz || 1)], box: [x0, x1, y0, y1, z0, z1] };
  });
  cv.forEach((c, k) => { const [x0, x1, y0, y1, z0, z1] = c.box;
    for (let x = Math.floor(x0/G); x <= Math.floor(x1/G); x++) for (let y = Math.floor(y0/G); y <= Math.floor(y1/G); y++) for (let z = Math.floor(z0/G); z <= Math.floor(z1/G); z++){
      const h = key(x, y, z); let l = grid.get(h); if (!l) grid.set(h, l = []); l.push(k); } });
  return { cv, grid, key, G };
}
function hideCovered(b, C){
  b.hid = 0;
  if (!C || !b.i.length) return;
  const { cv, grid, key, G } = C;
  const P = b.p, I = b.i, n = I.length, out = new Array(n), hid = [];
  let nv = 0;
  for (let t = 0; t + 2 < n; t += 3){
    const a3 = I[t]*3, b3 = I[t + 1]*3, c3 = I[t + 2]*3;
    let hidden = false;
    const l = grid.get(key(Math.floor((P[a3] + P[b3] + P[c3])/3/G), Math.floor((P[a3 + 1] + P[b3 + 1] + P[c3 + 1])/3/G), Math.floor((P[a3 + 2] + P[b3 + 2] + P[c3 + 2])/3/G)));
    if (l){
      const tx0 = Math.min(P[a3], P[b3], P[c3]), tx1 = Math.max(P[a3], P[b3], P[c3]), ty0 = Math.min(P[a3 + 1], P[b3 + 1], P[c3 + 1]), ty1 = Math.max(P[a3 + 1], P[b3 + 1], P[c3 + 1]), tz0 = Math.min(P[a3 + 2], P[b3 + 2], P[c3 + 2]), tz1 = Math.max(P[a3 + 2], P[b3 + 2], P[c3 + 2]);
      for (let li = 0; li < l.length && !hidden; li++){
        const c = cv[l[li]], bx = c.box;
        if (tx0 < bx[0] || tx1 > bx[1] || ty0 < bx[2] || ty1 > bx[3] || tz0 < bx[4] || tz1 > bx[5]) continue;   // (not even within its bounds)
        // every corner well inside (something just under a block's skin can still show through it, so that's kept)
        const m = c.inv, lim = c.lim; let ok = true;
        for (let q = 0; q < 3 && ok; q++){ const o = q === 0 ? a3 : q === 1 ? b3 : c3, x = P[o], y = P[o + 1], z = P[o + 2];
          for (let a = 0; a < 3; a++) if (Math.abs(m[a]*x + m[4 + a]*y + m[8 + a]*z + m[12 + a]) > lim[a]){ ok = false; break; } }
        hidden = ok;
      }
    }
    if (hidden) hid.push(I[t], I[t + 1], I[t + 2]); else { out[nv++] = I[t]; out[nv++] = I[t + 1]; out[nv++] = I[t + 2]; }
  }
  if (!hid.length) return;
  for (let q = 0; q < hid.length; q++) out[nv + q] = hid[q];
  b.i = out; b.hid = hid.length;
}
// The buildings' triangles in the order sideArc wants: A, H, the walls slice by slice (S), then slices 0 to 3 again (D).
// A wall slice only takes triangles turned no higher than level (whatever faces at all upward may face the camera from
// anywhere); an underside is one the camera can't see at its lowest tilt, nor any higher.
// (W2a) Inside each list the triangles go largest first (by longest edge), and the layout notes how many have an edge of at
// least each size in SMALL_E: a frame draws only the front of each list, leaving out what is too small to paint more than a speck.
const SMALL_E = [0, 1, 2, 3, 4, 5].map(k => .0125*2**k), SMALL_N = SMALL_E.length;
function sideLayout(buckets, nAt){ return drain(sideLayoutGen(buckets, nAt)); }
// far: null for the plot's own order; { lean, sticks } for its second order, the one drawn from far away (round 8 item 3): the round parts that have a lean twin are replaced by it (the full ones go to H, so the
// shadows are the full ones), and the thin sticks' walls go to lists of their own (T), which a frame can draw over a narrower arc than the other walls.
function* sideLayoutGen(buckets, nAt, far = null){
  const A = [], H = [], S = Array.from({ length: SIDE_K }, () => []), T = Array.from({ length: SIDE_K }, () => []), w = TAU/SIDE_K, low = Math.sin(PITCH_MIN), lowC = Math.cos(PITCH_MIN);
  const Ae = [], Se = Array.from({ length: SIDE_K }, () => []), Te = Array.from({ length: SIDE_K }, () => []);   // longest edge of each triangle in A and in the slices
  let o2 = 0;
  for (const [mat, b] of buckets){
    if (!atlasable(mat)) continue;
    const I = b.i, nv = I.length - b.hid, P = b.p, nvb = P.length/3;
    let lk = null, stk = null;
    if (far && far.lean && b.lr){ lk = new Uint8Array(nvb); for (let i = 0; i < b.lr.length; i += 4){ lk.fill(1, b.lr[i], b.lr[i + 1]); lk.fill(2, b.lr[i + 2], b.lr[i + 3]); } }
    if (far && far.sticks && b.sk){ stk = new Uint8Array(nvb); for (let i = 0; i < b.sk.length; i += 2) stk.fill(1, b.sk[i], b.sk[i + 1]); }
    const add = (J, q) => {
      const a3 = J[q]*3, b3 = J[q + 1]*3, c3 = J[q + 2]*3;
      const ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2], vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
      const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx, l = Math.hypot(nx, ny, nz);
      let dst = A, de = Ae;
      if (l > 0){
        const y = ny/l, h = Math.hypot(nx, nz)/l;
        if (y*low + h*lowC < -.002){ dst = H; de = null; }   // an underside: away from the camera at every tilt and turn
        else if (y <= 0 && h > 0){ let ph = Math.atan2(nz, nx); if (ph < 0) ph += TAU; const sl = Math.min(SIDE_K - 1, Math.floor(ph/w));
          if (stk && stk[J[q]]){ dst = T[sl]; de = Te[sl]; } else { dst = S[sl]; de = Se[sl]; } }
      }
      dst.push(J[q] + o2, J[q + 1] + o2, J[q + 2] + o2);
      if (de) de.push(Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(P[c3] - P[b3], P[c3 + 1] - P[b3 + 1], P[c3 + 2] - P[b3 + 2])));
    };
    for (let q = 0; q < nv; q += 3){
      if (lk && lk[I[q]] === 1){ H.push(I[q] + o2, I[q + 1] + o2, I[q + 2] + o2); continue; }   // (a round part drawn by its lean twin here)
      add(I, q);
    }
    if (lk && b.li) for (let q = 0; q < b.li.length; q += 3) add(b.li, q);
    for (let q = nv; q < I.length; q++) H.push(I[q] + o2);
    o2 += nvb;
    yield;
  }
  const cls = new Int32Array((1 + (far ? 2 : 1)*SIDE_K)*SMALL_N);
  const bySize = (T_, E, row) => {   // largest first (ties keep their order); counts of those at least each size
    const n = E.length, ord = new Array(n); for (let i = 0; i < n; i++) ord[i] = i;
    ord.sort((p, q) => E[q] - E[p]);
    const out = new Array(n*3); for (let i = 0; i < n; i++){ const t = ord[i]*3; out[i*3] = T_[t]; out[i*3 + 1] = T_[t + 1]; out[i*3 + 2] = T_[t + 2]; }
    for (let k = 0; k < SMALL_N; k++){ let c = 0; while (c < n && E[ord[c]] >= SMALL_E[k]) c++; cls[row*SMALL_N + k] = c*3; }   // (in indices, as the ranges are)
    return out;
  };
  const As = bySize(A, Ae, 0); yield; const Ss = []; for (let j = 0; j < SIDE_K; j++){ Ss.push(bySize(S[j], Se[j], 1 + j)); yield; }
  const Ts = []; if (far) for (let j = 0; j < SIDE_K; j++){ Ts.push(bySize(T[j], Te[j], 1 + SIDE_K + j)); yield; }
  const off = [0]; for (const t of Ss) off.push(off[off.length - 1] + t.length);
  const offT = [0]; for (const t of Ts) offT.push(offT[offT.length - 1] + t.length);
  const nS = off[SIDE_K], nT = far ? offT[SIDE_K] : 0, nD = off[SIDE_K/2], nDT = far ? offT[SIDE_K/2] : 0, n = As.length + H.length + nS + nT + nD + nDT;
  const ix = nAt > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let k = 0; for (const v of As) ix[k++] = v; for (const v of H) ix[k++] = v; for (const t of Ss) for (const v of t) ix[k++] = v; for (const t of Ts) for (const v of t) ix[k++] = v;
  for (let j = 0; j < SIDE_K/2; j++) for (const v of Ss[j]) ix[k++] = v;
  for (let j = 0; j < (far ? SIDE_K/2 : 0); j++) for (const v of Ts[j]) ix[k++] = v;
  // (S, for the ranges of the shadow pass and where D starts, counts the walls of the sticks too: they sit after the other walls, before D)
  return { ix, cut: far ? { A: As.length, H: H.length, S: nS + nT, off, offT, cls, far: true } : { A: As.length, H: H.length, S: nS, off, cls } };
}
// run a generator to its end (the pieces that are cut into steps, run all at once)
function drain(g){ let r; while (!(r = g.next()).done); return r.value; }
function collect(fn){ return drain(collectGen((function*(){ fn(); })())); }
// the same, a step at a time (body: a generator that yields between its steps): see stageStart
function* collectGen(body){
  FAR_CFG.lean = !!(PH.tests.leanRound || window.__LEAN_ROUND); FAR_CFG.sticks = !!(PH.tests.thinSticks || window.__THIN_STICKS);   // (both off unless the tests are on)
  buckets = new Map(); emitters = []; carPads = []; curPorts = []; glowList = {}; curSpots = []; curCover = [];
  for (const k in SPR.size) FOL_LIST[k] = [];
  yield* body; yield;
  const covers = curCover; curCover = null;
  const geo = new Map();
  let nAt = 0;
  for (const [mat, b] of buckets){ if (atlasable(mat)) nAt += b.p.length/3; else geo.set(mat, bucketGeometry(b)); }
  if (nAt){
    const pos = new Float32Array(nAt*3), nrm = new Int8Array(nAt*4), col = new Uint8Array(nAt*3), em = new Uint8Array(nAt*4), flk = new Uint8Array(nAt), fine = new Uint8Array(nAt), ons = new Uint8Array(nAt);
    let o = 0;
    for (const [mat, b] of buckets){
      if (!atlasable(mat)) continue;
      const n = b.p.length/3; pos.set(b.p, o*3); { const bn = b.n; for (let q = 0, w = o*4; q < n; q++, w += 4){ nrm[w] = Math.round(bn[q*3]*127); nrm[w + 1] = Math.round(bn[q*3 + 1]*127); nrm[w + 2] = Math.round(bn[q*3 + 2]*127); } }   // (normals as bytes: exact on axis-aligned faces, under half a degree off otherwise)
      const r = Math.round(mat.color.r*255), gg = Math.round(mat.color.g*255), bl = Math.round(mat.color.b*255);
      for (let i=o;i<o+n;i++){ col[i*3] = r; col[i*3+1] = gg; col[i*3+2] = bl; }
      const k = mat.userData.glow;
      if (k){ const er = Math.min(255, Math.round(mat.emissive.r*255)), eg = Math.min(255, Math.round(mat.emissive.g*255)), eb = Math.min(255, Math.round(mat.emissive.b*255)), ek = EM_KIND[k] || 5;
        for (let i=o;i<o+n;i++){ em[i*4] = er; em[i*4+1] = eg; em[i*4+2] = eb; em[i*4+3] = ek; } }
      if (b.f){ flk.set(b.f, o); ons.set(b.o, o); }
      fine.set(b.d, o);
      o += n;
    }
    // the triangles: each bucket's indices, moved along by where its corners landed; first every bucket's visible ones (in
    // their order), then the hidden ones (drawn only while the piece is being swept in or out: see hideCovered)
    let ni = 0, nh = 0; const C = prepCovers(covers); for (const [mat, b] of buckets) if (atlasable(mat)){ bucketIndexUpTo(b); hideCovered(b, C); ni += b.i.length; nh += b.hid; yield; }
    let ix, cut = null;
    let farL = null;
    if (SIDE_SPLIT){ ({ ix, cut } = yield* sideLayoutGen(buckets, nAt));
      if ([...buckets.values()].some(b => b.li || b.sk)) farL = yield* sideLayoutGen(buckets, nAt, { lean: FAR_CFG.lean, sticks: FAR_CFG.sticks }); }
    else {
      ix = nAt > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let k = 0, kh = ni - nh;
      let o2 = 0; for (const [mat, b] of buckets){ if (!atlasable(mat)) continue; const I = b.i, nv = I.length - b.hid;
        for (let q = 0; q < nv; q++) ix[k++] = I[q] + o2;
        for (let q = nv; q < I.length; q++) ix[kh++] = I[q] + o2;
        o2 += b.p.length/3; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 4, true)); g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); g.setAttribute('aEm', new THREE.BufferAttribute(em, 4, true));
    g.setAttribute('aFlk', new THREE.BufferAttribute(flk, 1)); g.setAttribute('aFine', new THREE.BufferAttribute(fine, 1)); g.setAttribute('aOn', new THREE.BufferAttribute(ons, 1, true));
    if (cut){ g.userData.cut = cut; g.setDrawRange(0, cutRest(cut)); if (farL) g.userData.far = farL; }   // (A, H, S and D: see sideArc; far: the second order, see sideLayoutGen)
    else if (nh) g.userData.shown = ni - nh;   // (the hidden triangles come after this many indices: see hideBefore)
    geo.set(ATLAS, g);
  }
  for (const g of geo.values()) g.computeBoundingSphere();
  const fol = {}; for (const k in FOL_LIST) if (FOL_LIST[k].length) fol[k] = FOL_LIST[k];
  const out = { geo, fol, glows: glowList, emitters, pads: carPads, ports: curPorts, spots: curSpots };
  glowList = null; buckets = new Map(); curSpots = null;
  return out;
}
function disposeData(d){ if (d) for (const g of d.geo.values()) g.dispose(); }
function disposeGroup(g){ g.traverse(o => { if (o.isMesh || o.isPoints) o.geometry.dispose(); }); }
// one group for many pieces: a single mesh per material, one instanced batch per plant kind, one point batch per glow colour
function batchGroup(datas, withGeo = true){
  const g = new THREE.Group(), byMat = new Map(), fol = {}, gl = {};
  for (const d of datas){
    if (withGeo) for (const [m, geo] of d.geo){ let a = byMat.get(m); if (!a) byMat.set(m, a = []); a.push(geo); }
    for (const k in d.fol) fol[k] = (fol[k] || []).concat(d.fol[k]);
    for (const k in d.glows) gl[k] = (gl[k] || []).concat(d.glows[k]);
  }
  for (const [m, geos] of byMat){
    const merged = geos.length === 1 ? geos[0].clone() : THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, m);
    if (m.userData.colorOnly){ mesh.layers.set(1); mesh.renderOrder = 2; } else { mesh.castShadow = !m.userData.noCast; mesh.receiveShadow = true; }   // see-through glass: colour pass only
    g.add(mesh);
  }
  for (const k in SPR.size) FOL_LIST[k] = fol[k] || [];
  const saved = city; city = g; buildFoliage(); city = saved;
  if (Object.keys(gl).length) g.add(glowPoints(gl));
  return freezeTree(g);
}

/* ---------- a platform piece: slab, rock root, railings and greenery on the open edges ---------- */
// Each plot's greenery: 'some' (the usual plants, moss and vines), 'none' (bare: nothing growing, nothing hanging
// over the edges) or 'grass' (an empty plot laid to lawn). Clicking an empty plot with no zone picked cycles it,
// and whatever it's left on becomes the setting for the next plots you add.
const GREEN_MODES = ['some', 'none', 'grass'], GREEN_KEY = 'neonIsland.greenDefault';
let GREEN_DEFAULT = (() => { try { const v = localStorage.getItem(GREEN_KEY); return GREEN_MODES.includes(v) ? v : 'some'; } catch (e) { return 'some'; } })();

// A click on a plot that isn't on the current setting brings it to the current setting; a click on one that is
// moves it (and the setting) on to the next.
function cycleGreen(c){
  stageFinishAll();
  const cur = c.green || 'some';
  c.green = cur !== GREEN_DEFAULT ? GREEN_DEFAULT : GREEN_MODES[(GREEN_MODES.indexOf(cur) + 1) % GREEN_MODES.length];
  GREEN_DEFAULT = c.green; try { localStorage.setItem(GREEN_KEY, GREEN_DEFAULT); } catch (e) {}
  refresh([c]); save(); sfx.play('place');
}
// the lawn: 16px grass tiles from the sheet (assets/floor/grass.png: fine grass, tufts, long blades)
const GRASS_MAT = (() => { const t = new THREE.TextureLoader().load('assets/floor/grass.png'); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const m = toon(0xffffff); m.map = t; m.userData.noCast = true; return m; })();   // tinted down a little to sit with the city's palette
const _gq = new THREE.Vector3();
function lawn(P, n){
  let b = buckets.get(GRASS_MAT); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(GRASS_MAT, b); }
  const s = LOT/n;
  for (let i=0;i<n;i++) for (let j=0;j<n;j++){
    const k = 0, u0 = k/3 + .001, u1 = (k + 1)/3 - .001, x0 = -LOT/2 + i*s, z0 = -LOT/2 + j*s;
    const C = [[x0, z0, u0, 1], [x0 + s, z0, u1, 1], [x0 + s, z0 + s, u1, 0], [x0, z0 + s, u0, 0]];
    for (const q of [0, 2, 1, 0, 3, 2]){ const [cx, cz, u, v] = C[q]; _gq.set(cx, .058, cz).applyMatrix4(P); b.p.push(_gq.x, _gq.y, _gq.z); b.n.push(0, 1, 0); b.u.push(u, v); b.d.push(0); }
  }
}
// Places to sit on a lawn: two of a picnic blanket (people eat there, facing each other), a pair of spots side by
// side (friends chatting) and a little hologram projector (whoever sits there watches a show on it), in the
// quarters of the plot (the middle stays clear for a park lamp). Sitting spots on the ground, so the sitting
// people's legs-out pose sits on the grass.
const PICNIC = [0xb8433a, 0x3f6a9a, 0xd8b04a];
function lawnSpots(c, P){
  const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => R() - .5), kinds = ['picnic', 'pair', 'holo'].sort(() => R() - .5);
  const gy = CURB + .09, clear = [];   // sitting spots: drawn .09 lower, so on the ground
  for (let g = 0; g < 2; g++){
    const [qx, qz] = quads[g], ax = qx*rnd(.8, 1.05), az = qz*rnd(.8, 1.05), ry = rnd(0, PI), ca = Math.cos(ry), sa = Math.sin(ry);
    const at = (u, v) => [ax + u*ca - v*sa, az + u*sa + v*ca];   // a frame turned to ry round the anchor
    const kind = kinds[g];
    if (kind === 'picnic'){
      // the blanket itself is brought by whoever comes to picnic, and goes home with them (people.js)
      clear.push([ax, az, .34]);
      const pic = { x: c.x + ax, z: c.z + az, ry, col: Math.floor(R()*3) };
      for (const s of [-1, 1]){ const [sx, sz] = at(s*.42, 0); clear.push([sx, sz, .14]); spotAt(P, sx, gy, sz, 'seat', null, [ax - sx, az - sz], { act: 'eat', pic }); }
    } else if (kind === 'pair'){
      for (const s of [-1, 1]){ const [sx, sz] = at(s*.2, 0); const [fx, fz] = at(0, .5); clear.push([sx, sz, .14]); spotAt(P, sx, gy, sz, 'seat', null, [fx - ax, fz - az], { act: 'pair' }); }
    } else {
      // the projector: a little dark puck with a lit lens; the show appears over it while someone watches (people.js)
      cyl(M.metalDark, P, ax, .1, az, .09, .05); cyl(M.neonCyan, P, ax, .13, az, .04, .015); clear.push([ax, az, .16]);
      const ad = hash('holo', c.i, c.j, g) % 9, n = chance(.5) ? 2 : 1;
      for (let k = 0; k < n; k++){ const off = n === 2 ? (k ? .22 : -.22) : 0, [sx, sz] = at(off, .62); clear.push([sx, sz, .14]);
        spotAt(P, sx, gy, sz, 'seat', null, [ax - sx, az - sz], { act: 'holo', hx: c.x + ax, hz: c.z + az, ad }); }
    }
  }
  return clear;
}
function buildPlatform(c){
  NO_GREEN = c.green === 'none';
  try { buildPlatformBody(c); } finally { NO_GREEN = false; }
}
function buildPlatformBody(c){
  R = mulberry32(hash('plat', c.i, c.j));
  const x = c.x, z = c.z, P = T(x, 0, z);
  // a flat slab: its underside is plain panelling with seams, and now and then a lift pad, a round thruster housing
  // with a faint blue glow, so it reads as what holds the piece up
  box(M.slabSide, P, 0, -.35, 0, LOT + .02, .6, LOT + .02);
  for (const t of [-LOT/4, 0, LOT/4]){ box(M.slabSeam, P, t, -.655, 0, .04, .02, LOT - .1); box(M.slabSeam, P, 0, -.655, t, LOT - .1, .02, .04); }
  for (const s2 of [-1, 1]) box(M.slabSeam, P, 0, -.12, s2*(LOT/2 + .012), LOT + .02, .05, .02);
  for (const s2 of [-1, 1]) box(M.slabSeam, P, s2*(LOT/2 + .012), -.12, 0, .02, .05, LOT + .02);
  // the lift pads hang near the open edges, where you can see them under the rim from the usual view
  const open = SIDES4.filter(([a, b]) => !cells.has(ckey(c.i + a, c.j + b)));
  const corners = CORNERS.filter(([sx, sz]) => open.some(([a, b]) => (a && a === sx) || (b && b === sz)));
  const pads = corners.length ? (R() < .55 ? 1 : 0) + (corners.length > 2 && R() < .3 ? 1 : 0) : 0;
  const used = []; c.lifts = [];
  for (let k=0; k<pads; k++){
    let cn; do cn = pick(corners); while (used.includes(cn) && used.length < corners.length); used.push(cn);
    const px = cn[0]*(LOT/2 - rnd(.55, .65)), pz = cn[1]*(LOT/2 - rnd(.55, .65)), r = rnd(.34, .42);
    cyl(M.metal, P, px, -.68, pz, r + .16, .06);                       // a collar where it meets the slab
    cyl(M.metalDark, P, px, -1.05, pz, r, .72);                        // the column, hanging well below the slab
    for (const y of [-.85, -1.15]) cyl(M.slabSeam, P, px, y, pz, r + .03, .05);   // bands round it
    put(U.cone, M.metalDark, under(P, T(px, -1.52, pz, 0, 2*(r + .16), .3, 2*(r + .16))));   // the flared pad
    cyl(M.slabSeam, P, px, -1.68, pz, r + .17, .05);                   // its lip
    cyl(M.padGlow, P, px, -1.71, pz, r + .08, .03);                    // the emitter face
    for (let a = 0; a < 4; a++){ const ca = Math.cos(a*PI/2 + PI/4), sa = Math.sin(a*PI/2 + PI/4);
      strut(M.metalDark, P, px + ca*r, -1.25, pz + sa*r, px + ca*(r + .32), -.66, pz + sa*(r + .32), .05); }   // brackets
    c.lifts.push({ x: x + px, z: z + pz, r: r + .1 });
    glow(P, px, -1.75, pz, 'blue', .55 + r*.6); glow(P, px, -2.1, pz, 'cyan', 1.6);   // a small glow on the face, a faint haze below (fainter by day)
  }
  // open edges: railing, vines over the drop, plants along the rim, the odd pipe
  for (const [a,b] of SIDES4){
    if (cells.has(ckey(c.i + a, c.j + b))) continue;
    const E = T(x + a*LOT/2, 0, z + b*LOT/2, Math.atan2(a, b));
    for (let t = -LOT/2 + .15; t < LOT/2; t += .45) cyl(M.frame, E, t, .2, -.12, .025, .36);
    box(M.frame, E, 0, .37, -.12, LOT, .035, .035);
    for (let t = -LOT/2 + .3; t < LOT/2 - .2; t += .5){
      if (chance(.45*S.green)) plant(hangKind(), E, t, .02, .03, rnd(.8,1.1), 't', true);
      if (chance(.2*S.green)) plant(bigKind(), E, t, .03, -.35, rnd(.6,.85));
      else if (chance(.25)) floorBig(E, t, .058, -.4, rnd(.7,.95));   // moss creeping in along the rim
    }
    if (chance(.3)) cyl(M.rust, E, rnd(-1,1), -.4, .08, .08, rnd(1,2.2), 0, PI/2);
  }
  if (c.mega) return;   // a megastructure lays its own ground across its plots
  // surface: sidewalk and street round a building, or a small paved plaza when the spot is empty
  if (c.sections.length) groundLot({ x, z, cls: c.sections[0].zone, elev: 0, base: CURB, deck: false, cross: cells.has(ckey(c.i, c.j + 1)) });
  else {
    box(G.asph, P, 0, .012, 0, LOT, .025, LOT);
    if (c.green === 'grass'){   // laid to lawn, edge to edge, with grass growing up out of it
      lawn(P, 4);
      // a garden lawn: one kind of short grass, packed in an even overlapping grid so it reads as a single carpet
      const n = 20, st = LOT/n;
      const clear = lawnSpots(c, P);   // the blankets, projectors and sitting places, kept clear of tall grass
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
        const gx = -LOT/2 + (i + .5 + rnd(-.2, .2))*st, gz = -LOT/2 + (j + .5 + rnd(-.2, .2))*st;
        if (clear.some(([x, z, r]) => (gx - x)**2 + (gz - z)**2 < r*r)) continue;
        plant('gt0', P, gx, .06, gz, rnd(.24, .28)); }
    }
    else { const n = 7, st = LOT/n;
      for (let i=0;i<n;i++) for (let j=0;j<n;j++) if (!chance(.04)) box(pick(TILES.mid), P, (i-(n-1)/2)*st, .03, (j-(n-1)/2)*st, st - .05, .045, st - .05); }
    for (let k=0;k<(chance(.75) ? 1 : 0) + (chance(.2) ? 1 : 0);k++) plant(pick(['bush','bushFlower','g_fern3','bonsai']), P, rnd(-1.3,1.3), .05, rnd(-1.3,1.3), rnd(.7,.95));
    if (c.green !== 'grass') for (let k=0;k<irand(3,5);k++) floorBig(P, rnd(-1.3,1.3), .056, rnd(-1.3,1.3), rnd(.8,1.15));   // moss and vines grown over the paving
    if (chance(.4)){ const Pb = under(P, T(rnd(-.9,.9), .05, rnd(-.9,.9), pick([0, PI/2]))); box(M.wood, Pb, 0, .14, 0, .5, .04, .15); box(M.frame, Pb, 0, .07, 0, .42, .14, .1);
      for (const sx of [-.13, .13]) spotAt(Pb, sx, .16, 0, 'seat', null, [0, 1]); }
  }
  const lamp = ([sx,sz]) => { const Pl = T(x + sx*(LOT/2 - .25), 0, z + sz*(LOT/2 - .25));
    cyl(M.metalDark, Pl, 0, .65, 0, .03, 1.3); box(M.metalDark, Pl, .12, 1.3, 0, .26, .03, .03);
    KEEP_LIGHT = true; box(M.bulb, Pl, .24, 1.26, 0, .12, .05, .1); glow(Pl, .24, 1.2, 0, 'warm', 1.4); KEEP_LIGHT = false; };
  // part of a park (see parkCells): a tall garden lamp with a lantern globe, throwing a much wider pool of light,
  // on every park tile, so the whole green is lit at night
  const parkLamp = () => { const Pl = T(x, 0, z);
    cyl(M.metalDark, Pl, 0, .08, 0, .12, .16); cyl(M.metalDark, Pl, 0, 1.0, 0, .035, 1.85); cyl(M.metalDark, Pl, 0, 1.25, 0, .05, .06);
    for (const a of [0, PI/2, PI, -PI/2]) box(M.metalDark, Pl, Math.sin(a)*.07, 1.9, Math.cos(a)*.07, .02, .14, .02);
    KEEP_LIGHT = true; sph(M.bulb, Pl, 0, 2.02, 0, .13); cyl(M.metalDark, Pl, 0, 2.17, 0, .1, .04); glow(Pl, 0, 2.02, 0, 'warm', 2.3); KEEP_LIGHT = false; };
  // the park lamps stand in the middle of every other plot, on a checkerboard laid over the whole island, so
  // however the green grows they keep an even spacing (and the plots between are lit from the four around them)
  if (!c.sections.length && c.park){ if ((c.i + c.j) % 2 === 0) parkLamp(); }
  else if (c.sections[0] && c.sections[0].zone === 'mid'){}   // the commercial streets are lit by their shops, not lamps
  else if (chance(.45)) lamp(pick(CORNERS));   // a street lamp on one corner
  else if (DARK) lamp(CORNERS[hash('lamp', c.i, c.j) % 4]);   // a dark street always has its one failing lamp
}

/* ---------- a building: a stack of sections, each a complete building from the zone's set of types ---------- */
// A click builds a whole building. Clicking its roof stacks another complete section on top (any zone),
// and removing takes the top section off. Each section keeps its own seed, so the rest never changes.
const tankYard = (lot, st, P0) => buildTankYard(lot, P0);   // the round tanks on legs
const glassHotelTower = (lot, st, P0) => glassHotel(lot, st, P0, 'tower');
const glassHotelPodium = (lot, st, P0) => glassHotel(lot, st, P0, 'podium');
const SECTION_TYPES = {
  low:  { ground: [[buildTenement,6],[podHouse,1.5],[octoHouse,1.2],[deckHouse,1.3]], upper: [[buildTenement,5],[podHouse,2],[octoHouse,1.2]] },
  // the commercial quarter: shops under neon names, tiled-roof shops, stall streets, pagodas, glass and brutalist
  // towers, glass-dome markets, food plazas, and the market-street types; no longer the pod, octagon and deck
  // houses, which the residential blocks share
  mid:  { ground: [[signShop,3.4],[tiledShop,1.8],[foodDeck,1.2],[foodTower,1.4],[stallMarket,1.4],[pagodaHall,1],[glassTower,.75],[arcologyTower,.8],[domeMarket,.8],[foodPlaza,.8],
                   [billboardLot,.7],[buildShophouse,1],[platformTower,.7],[containerStack,.9],[spiralTower,.8],[cornerMarket,1]],
          upper: [[signShop,2.6],[foodDeck,2.4],[tiledShop,1.4],[buildShophouse,.9],[platformTower,.5],[containerStack,.7]] },
  high: { ground: [[buildTower,1]], upper: [[slabTower,2],[glassHotelTower,1.5],[glassHotelPodium,1],[roundTower,1],[twistTower,1],[gardenTower,1],[domeTower,1],[shellTower,1],[cascadeTerraces,.8]] },
  ind:  { ground: [[hall,1],[silos,1],[stiltFactory,1],[tankYard,1],[scrapShed,1],[gearWorkshop,1],[repairsBlock,1],[partsWarehouse,1],[lubeShed,.8],[stackedWorks,2.6],[decoWorks,1.1],[brutalTower,1.1]], upper: [[hall,2],[silos,1],[scrapShed,1],[repairsBlock,1],[partsWarehouse,1],[brutalTower,.6]] },
};
function pickWeighted(list){ const tot = list.reduce((s,[,w]) => s + w, 0); let r = R()*tot; for (const [f,w] of list){ if ((r -= w) <= 0) return f; } return list[0][0]; }
// The white garden-city towers only stack with each other: on a white luxury section only another white one goes
// up, and a white one only goes up on ground or on another white section (the other luxury types look jarring
// against them). Sections of other zones are left as they are.
const WHITE_TYPES = new Set([domeTower, shellTower, cascadeTerraces]);
const STALL_TYPES = new Set([stallMarket, foodDeck, foodTower, foodPlaza, billboardLot, domeMarket, cornerMarket]);
// A plot's building is its stack of sections. A plot with a side pod can have two: c.below, a building on the
// ground, and c.sections, the pod hanging over it on its scaffold (from c.lift.y), with a gap between them.
function buildStack(c){ drain(buildStackGen(c)); }
function* buildStackGen(c){
  c.belowTop = null; c.belowTops = [];
  c.liftRoof = null;
  if (c.lift && c.below && c.below.length){
    c.belowTop = yield* stackRunGen(c, c.below, CURB, 'b', true); c.belowTops = c.sectionTops;
    c.liftRoof = c._topLot && c._topLot.roof ? c._topLot.roof : null; c._topLot = null;   // the roof's corners, for the scaffold's legs
  }
  const y = yield* stackRunGen(c, c.sections, c.lift ? c.lift.y : CURB, '', !c.belowTop);   // a side pod's stack starts up in the air, on its scaffold
  c.height = y;
  c.walks = null; c.liftCab = null;
  if (c.lift) liftScaffold(c, c.lift.y);
  rooftopBoard(c, y);
  steamVent(c);
}
// one stack of sections from y; returns its top. (A section's look is seeded by its own number kh when it has one, so
// adding a section under a pod leaves the ones above as they were.)
function* stackRunGen(c, secs, y, tag, first){
  let prevWhite = false, prevDeck = false;
  c.sectionTops = [];
  for (let k = 0; k < secs.length; k++){ const sec = secs[k];
    R = mulberry32(hash('sec', c.i, c.j, sec.kh ?? k, sec.zone, sec.seed));   // (the same whether a building stands under a pod or not, so it keeps its look)
    const st = STY[sec.zone], upper = k > 0, last = k === secs.length - 1;
    LUX = sec.zone === 'high' ? luxPalette(hash('lux', c.i, c.j, k, sec.seed)) : sec.zone === 'ind' ? indPalette(hash('ind', c.i, c.j, k, sec.seed)) : null;   // each district's own light colours
    const lot = { x: c.x, z: c.z, cls: sec.zone, elev: 0, base: y, signs: 0, occupied: true, height: 0, floors: 0 };
    lot.aloft = !upper && tag === '' && !!c.lift;   // the bottom of a side pod: it stands on a scaffold deck, not the street
    lot.padOK = tag === 'b' ? (R(), false) : last && R() < .3;   // (under a pod: the same draw whatever's on top, so adding a section never re-rolls the one below it)
    if (upper){   // a deck for the new section to stand on
      box(M.concDD, T(c.x, y, c.z), 0, .05, 0, SIDE - .1, .1, SIDE - .1);
      box(pick(st.neonMats), T(c.x, y, c.z), 0, .02, (SIDE - .1)/2 + .015, SIDE - .1, .03, .03);
    }
    const P0 = T(c.x + rnd(-.1,.1), y + (upper ? .1 : 0), c.z + rnd(-.1,.1), rnd(-st.yaw, st.yaw));
    let types = SECTION_TYPES[sec.zone][upper ? 'upper' : 'ground'];
    if (upper && sec.zone === 'high') types = types.filter(([f]) => WHITE_TYPES.has(f) === prevWhite);
    if (upper && sec.zone === 'mid' && prevDeck) types = [[foodDeck, 5]].concat(types);   // decks of stalls like to pile up
    let builder = pickWeighted(types);
    if (lot.aloft && sec.zone === 'mid' && ![signShop, tiledShop, glassTower].includes(builder)) builder = pickWeighted([[signShop, 3], [tiledShop, 2], [glassTower, 1]]);   // on a pod's deck: a building that keeps to it
    if (lot.aloft && sec.zone === 'high' && ![slabTower, roundTower, twistTower, gardenTower, domeTower, shellTower].includes(builder)) builder = pickWeighted([[slabTower, 3], [roundTower, 2], [twistTower, 1], [gardenTower, 1], [domeTower, 1], [shellTower, 1]]);   // (a tower that keeps to the platform)
    if (lot.aloft && sec.zone === 'ind' && ![hall, partsWarehouse].includes(builder)) builder = pickWeighted([[hall, 3], [partsWarehouse, 2]]);   // (a works that keeps to the deck)
    if (sec.mf){ lot.mf = sec.mf; if (sec.zone === 'low') builder = buildTenement; else if (sec.zone === 'mid') builder = signShop; else if (sec.zone === 'ind') builder = hall; else if (sec.zone === 'high') builder = slabTower; }   // built into a gap: a tenement (or shop) short enough to fit
    // most commercial buildings stand on a ring of market stalls opening onto the street (the stall streets, decks
    // and plazas are stalls already, so they stand on the ground)
    const onStalls = !upper && !sec.mf && !lot.aloft && sec.zone === 'mid' && !STALL_TYPES.has(builder) && hash('stallbase', c.i, c.j, sec.seed) % 100 < 60;
    let P1 = P0, hb = 0;
    NO_ROOF = !last || tag === 'b';   // (the building under a side pod: a flat roof for the scaffold to stand on)
    try { withStyle(sec.style, () => {
      if (onStalls){ stallBase(lot, st, P0); hb = lot.height; P1 = under(P0, T(0, hb, 0)); lot.base += hb; lot.height = 0; }
      builder(lot, st, P1);
    }); } finally { LUX = null; }
    NO_ROOF = false;
    if (onStalls){ lot.base -= hb; lot.height += hb; }
    prevWhite = !!lot.white; prevDeck = builder === foodDeck || builder === foodTower;
    y += (upper ? .1 : 0) + Math.max(lot.height, FH);
    c.sectionTops.push(y);
    if (k === 0 && first) c.firstFloors = lot.floors || 2;
    if (last && !lot.hasCarPad && R() < .7 && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length) addPerch({ x: c.x, z: c.z, height: y });   // (no drone perch under a highway: its pillar stands there)
    if (last) c._topLot = lot;
    yield;   // (a step: a section is built; see stageStart)
  }
  return y;
}
/* ---------- side pods: a building hung off the side of a taller one ---------- */
const LIFT_MIN = .9;   // the lowest a pod hangs (deck height above the street): room for people to walk under
// the deck height for a click at height y on the side of building c: snapped to a floor, with the pod's top no higher than c's roof
function liftSnap(c, y){
  // the section the pointer is on: a pod lines up with that section's floor (its deck on the top of the one below);
  // on the bottom section, with the floor the pointer is on, as long as it's above the ground floor
  const tops = c.sectionTops || [];
  let k = tops.findIndex(t => y < t); if (k < 0) k = tops.length - 1;
  let ly = k >= 1 ? tops[k - 1] : CURB + Math.max(1, Math.floor((y - CURB)/FH))*FH;
  if (ly < CURB + LIFT_MIN) return null;
  if (ly > c.height - .5) ly = c.height - .5;
  return ly;
}
// neighbours a pod at deck height y0 can tie into: a building that rises past the deck (a pod too, if it hangs lower)
function liftSupports(c, y0){
  const out = [];
  for (const d of SIDES4){
    const n = cells.get(ckey(c.i + d[0], c.j + d[1]));
    if (n && !n.mega && n.sections.length && n.height >= y0 + 1.0 && (!n.lift || n.lift.y <= y0 - .5)) out.push(d);
  }
  return out;
}
// The commercial pod's rig, after the night-market reference: heavy dark steel. Four lattice-truss towers at the corners
// with Warren girders between them every couple of metres, X-braced on every face; a thick grated deck; orange work
// lights on the joints and a red beacon on top; cables and ladders hanging below; a neon sign hung off the deck; and
// the walkways as truss bridges with lamps along them, to a steel door frame (with a neon name over it) in each neighbour.
const TRUSS = toon(0x2a3038), TRUSS2 = toon(0x3e3430), TRUSS_LIT = toon(0x5a2a10, { em: 0xff8a2a, kind: 'bulb' });
const COM_POD_SIGNS = [['sign_c_pawn', 'gold'], ['sign_c_open', 'pink'], ['sign_c_noodles', 'amber'], ['sign_c_techparts', 'cyan'], ['sign_c_hotel', 'cyan'], ['sign_c_robot', 'pink'], ['sign_c_mods', 'cyan'], ['sign_c_dataloan', 'pink']];
function trussCol(P, x, z, y0, y1, w, mat){   // a square lattice column: four chords, zigzag diagonals on each face, rings
  const h = w/2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(mat, P, x + sx*h, (y0 + y1)/2, z + sz*h, .05, y1 - y0, .05);
  const step = w*1.1;
  for (let y = y0, k = 0; y < y1 - .05; y += step, k++){
    const ya = y, yb = Math.min(y1, y + step);
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]){
      const f = k % 2; strut(mat, P, x + (f ? bx : ax), ya, z + (f ? bz : az), x + (f ? ax : bx), yb, z + (f ? az : bz), .018);
    }
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) box(mat, P, x + (ax + bx)/2, ya, z + (az + bz)/2, Math.abs(bx - ax) + .04, .035, Math.abs(bz - az) + .04);
  }
}
function trussBeam(P, ax, az, bx, bz, y, h, mat, r = .02){   // a Warren girder from a to b: top and bottom chords, zigzag web
  strut(mat, P, ax, y, az, bx, y, bz, r + .01); strut(mat, P, ax, y + h, az, bx, y + h, bz, r + .01);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L/(h*1.1)));
  for (let k = 0; k < n; k++){ const u0 = k/n, u1 = (k + 1)/n, up = k % 2;
    strut(mat, P, ax + (bx - ax)*u0, y + (up ? 0 : h), az + (bz - az)*u0, ax + (bx - ax)*u1, y + (up ? h : 0), az + (bz - az)*u1, r); }
}
function workLight(P, x, y, z){ box(M.metalDark, P, x, y, z, .09, .07, .09); box(TRUSS_LIT, P, x, y - .045, z, .07, .02, .07); glow(P, x, y - .06, z, 'orange', .38); }
// The commercial lift (after the neon glass lift reference): a steel frame glazed on three sides, cyan neon up the
// front corners and magenta up the back, two big gears on its side, a head with a neon ring over the pulley, and at
// the foot a control console with a lit screen and a LIFT sign. F: local +z out from the deck's side; the gate is on +x.
// the lift shaft's glass: a dim warm tint (unlit, so a bright colour would glow at night)
const LIFT_GLASS = new THREE.MeshBasicMaterial({ color: 0x4a3c30, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }); LIFT_GLASS.userData.colorOnly = true;
function liftShaftCom(F, x, z, base, y0){
  const h = .24, top = y0 + 1.1;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(TRUSS, F, x + sx*h, (base + top)/2, z + sz*h, .05, top - base, .05);
  for (const [sx, sz, m] of [[1, -1, M.neonCyan], [1, 1, M.neonCyan], [-1, -1, M.neonPink], [-1, 1, M.neonPink]]) box(m, F, x + sx*(h + .03), (base + top)/2, z + sz*(h + .03), .015, top - base - .2, .015);
  // glass on the back and the two sides (the gate side stays open)
  box(LIFT_GLASS, F, x - h, (base + top)/2, z, .01, top - base, 2*h); box(LIFT_GLASS, F, x, (base + top)/2, z - h, 2*h, top - base, .01); box(LIFT_GLASS, F, x, (base + top)/2, z + h, 2*h, top - base, .01);
  for (let y = base + 1.0; y < top - .2; y += 1.0) for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [-h, h, h, h], [-h, -h, -h, h]]) box(TRUSS, F, x + (ax + bx)/2, y, z + (az + bz)/2, Math.abs(bx - ax) + .06, .04, Math.abs(bz - az) + .06);
  // the gears on the side, part way up
  const gy = base + Math.min(2.2, (y0 - base)*.5);
  for (const [dy, r] of [[0, .3], [.5, .2]]){ put(U.cyl16, TRUSS2, under(F, T(x, gy + dy, z + h + .07, 0, r*2, .05, r*2, PI/2))); put(U.torus, M.metalDark, under(F, T(x, gy + dy, z + h + .1, 0, r*1.9, r*1.9, .3, 0))); }
  // the head: a dark housing, a neon ring over the pulley, a lamp
  box(M.metalDark, F, x, top + .08, z, .6, .16, .6); put(U.torus, M.neonPink, under(F, T(x, top + .22, z, 0, .36, .36, .3, PI/2))); glow(F, x, top + .1, z + .32, 'pink', .3);
  // at the foot: the gate frame in cyan, a console with a lit screen, the LIFT sign
  box(M.neonCyan, F, x + h + .02, base + 1.06, z, .02, .03, 2*h);
  box(M.metalDark, F, x + .2, base + .3, z + h + .26, .26, .6, .2); box(M.screen || COM.glassLit, F, x + .2, base + .5, z + h + .365, .18, .14, .01);
  box(M.metalDark, F, x + h + .03, base + 1.32, z, .02, .26, .5); plant('sign_c_lift', under(F, T(x + h + .05, 0, z, PI/2)), 0, base + 1.32, 0, .45, 'c', true);
}
function liftScaffoldCom(c, y0){
  R = mulberry32(hash('liftc', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), E = .9, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const mat = () => chance(.75) ? TRUSS : TRUSS2;
  // the deck: a thick steel slab with a grating, hazard-striped edges
  box(TRUSS, P, 0, y0 - .14, 0, 2.4, .2, 2.4);
  for (let x = -1.1; x <= 1.11; x += .12) box(M.metalDark, P, x, y0 - .03, 0, .03, .02, 2.32);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1])));
    for (let x = -1.15; x < 1.15; x += .2) box(Math.round(x*5) % 2 ? M.hazard : M.metalDark, F, x + .1, y0 - .2, 1.205, .2, .07, .01); }
  // the corner towers, and girders between them every couple of metres
  // the towers stand on anchor points: the roof's corners (taken in so a tower sits wholly on it) when there's a
  // building below, else the deck's corners on the street; the deck girders run between their tops
  const QS = [[-1, -1], [1, -1], [1, 1], [-1, 1]], tw = .34;
  let feet = QS.map(([sx, sz]) => [sx*E, sz*E]);
  if (onRoof){
    const rc = c.liftRoof || QS.map(([sx, sz]) => [c.x + sx*.75, base, c.z + sz*.75]);
    const cx = rc.reduce((a, p) => a + p[0], 0)/4, cz = rc.reduce((a, p) => a + p[2], 0)/4;
    feet = QS.map(([sx, sz]) => { let best = rc[0], bd = -Infinity; for (const p of rc){ const d = sx*(p[0] - cx) + sz*(p[2] - cz); if (d > bd){ bd = d; best = p; } }
      const k = tw*.75 + rnd(0, .08), dx = cx - best[0], dz = cz - best[2], l = Math.hypot(dx, dz) || 1; return [best[0] - c.x + dx/l*k, best[2] - c.z + dz/l*k]; });
  }
  for (const [x, z] of feet){ trussCol(P, x, z, base, y0 - .24, tw, mat()); box(M.concDD, P, x, base + .03, z, .5, .06, .5); }
  const edges = feet.map((f, k) => [f[0], f[1], feet[(k + 1) % 4][0], feet[(k + 1) % 4][1]]);
  for (let y = base + 1.3; y < y0 - .9; y += rnd(1.6, 2.1)) for (const [ax, az, bx, bz] of edges) trussBeam(P, ax, az, bx, bz, y, .3, mat());
  for (const [ax, az, bx, bz] of edges) trussBeam(P, ax, az, bx, bz, y0 - .58, .32, TRUSS);   // the deck girders
  // big X braces on two faces
  for (const [ax, az, bx, bz] of edges) if (chance(.5)){ strut(mat(), P, ax, base + .3, az, bx, y0 - .6, bz, .025); strut(mat(), P, bx, base + .3, bz, ax, y0 - .6, az, .025); }
  // work lights on the deck girders, a beacon on a corner
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (chance(.75)) workLight(P, sx*(E + .22), y0 - .3, sz*(E + .22));
  { const [sx, sz] = pick([[-1, -1], [1, -1], [1, 1], [-1, 1]]); cyl(M.metalDark, P, sx*1.15, y0 + .35, sz*1.15, .02, .7); beaconLight(P, sx*1.15, y0 + .74, sz*1.15, .07, .8); }
  // cables sagging down from the deck, a ladder hanging off one side
  for (let k = 0; k < irand(2, 4); k++){ const a = rnd(0, TAU), r = rnd(.6, 1.1); sagCable(P, Math.cos(a)*r, y0 - .25, Math.sin(a)*r, Math.cos(a + .6)*r*.6, y0 - rnd(1, 2.2), Math.sin(a + .6)*r*.6, rnd(.2, .5)); }
  // the street entrance: a steel booth with a lit shutter and a ladder cage up the scaffold (or a ladder from the roof below)
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  // the lift: a glass shaft lit with neon, from the street to the deck, its glass cab carrying people up and down
  const LX = .5, LZ = 1.44;
  { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));
    liftShaftCom(F, LX, LZ, CURB, y0);
    const Wp = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(F);
    const cc = Wp(LX, LZ), fr = Wp(LX + .26, LZ), ix = Wp(LX, .85), g = Wp(1, 0), o = Wp(0, 0), gx = g.x - o.x, gz = g.z - o.z;
    c.liftCab = { x: cc.x, z: cc.z, fx: fr.x, fz: fr.z, nx: gx, nz: gz, ix: ix.x, iz: ix.z, y0, ry: Math.atan2(gx, gz), style: 'com' };
  }
  // rails: steel posts and two rails, a neon sign hung off the deck's front (a side with no walkway, not the entrance)
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join()), lift = d === hs;
    for (let x = -1.15; x <= 1.16; x += .38){ if ((bridge && Math.abs(x) < .5) || (lift && Math.abs(x - LX) < .32)) continue; box(TRUSS, F, x, y0 + .25, 1.17, .04, .5, .04); }
    for (const yy of [.48, .26]){ if (lift){ box(TRUSS, F, (-1.17 + LX - .3)/2, y0 + yy, 1.17, LX - .3 + 1.17, .03, .03); box(TRUSS, F, (LX + .3 + 1.17)/2, y0 + yy, 1.17, 1.17 - LX - .3, .03, .03); } else if (bridge){ box(TRUSS, F, -.83, y0 + yy, 1.17, .66, .03, .03); box(TRUSS, F, .83, y0 + yy, 1.17, .66, .03, .03); } else box(TRUSS, F, 0, y0 + yy, 1.17, 2.34, .03, .03); }
  }
  { const sd = free.filter(d => d !== hs); if (sd.length && chance(.85*S.neon)){ const d = pick(sd), F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), [sn, sc] = pick(COM_POD_SIGNS);
      box(M.metalDark, F, 0, y0 - .6, 1.26, 1.7, .5, .06); for (const s of [-1, 1]) box(M.metalDark, F, s*.7, y0 - .3, 1.22, .04, .1, .1);
      fitSign(under(F, T(0, 0, 1.3, 0)), sn, 0, y0 - .6, 0, 1.6, .8, sc); } }
  // the walkways: truss bridges over the street, lamps along them, to a steel door in each neighbour
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.2, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .8;
    box(TRUSS, F, 0, y0 - .1, zm, w + .1, .1, L);
    for (let z = z0 + .05; z < z1; z += .1) box(M.metalDark, F, 0, y0 - .04, z, w - .04, .015, .03);
    for (const s of [-1, 1]){ trussBeam(F, s*w/2, z0, s*w/2, z1, y0 - .05, .55, TRUSS, .016); box(TRUSS, F, s*w/2, y0 - .32, zm, .06, .06, L); }
    trussBeam(F, -w/2, z0 + .02, w/2, z0 + .02, y0 - .4, .3, TRUSS);   // under-girder
    for (let z = z0 + .3; z < z1 - .1; z += .7){ const s = Math.round(z/.7) % 2 ? 1 : -1; workLight(F, s*(w/2 + .02), y0 + .62, z); }
    if (chance(.6)) sagCable(F, -w/2 - .05, y0 - .2, z0 + .1, -w/2 - .05, y0 - .2, z1 - .1, .5);
    // the door in the neighbour: a heavy steel frame round a lit door, a neon name over it now and then
    box(TRUSS, F, 0, y0 + .52, z1 + .16, .82, 1.1, .36);
    box(M.metalDark, F, 0, y0 + .5, z1 - .03, .7, 1.04, .05);
    box(M.hazard, F, 0, y0 + 1.04, z1 - .06, .7, .05, .03);
    if (chance(.5*S.neon)){ const [sn, sc] = pick(COM_POD_SIGNS); fitSign(under(F, T(0, 0, z1 - .08, PI)), sn, 0, y0 + 1.3, 0, .9, .5, sc); }
    glow(F, 0, y0 + .7, z1 - .1, 'warm', .4);
    box(M.metalDark, F, 0, y0 + .5, z0 + .02, .62, 1.0, .05);
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, z1 - .2).applyMatrix4(F);
    const dA = new THREE.Vector3(0, 0, z0 + .05).applyMatrix4(F), dB = new THREE.Vector3(0, 0, z1 - .06).applyMatrix4(F), o0 = new THREE.Vector3(0, 0, 0).applyMatrix4(F), fz = new THREE.Vector3(0, 0, 1).applyMatrix4(F), nx = fz.x - o0.x, nz = fz.z - o0.z;
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01, doors: [{ x: dA.x, z: dA.z, n: [nx, nz] }, { x: dB.x, z: dB.z, n: [-nx, -nz] }], col: 0x3c4450 });
  }
}
// The industrial pod's trestle, after the works reference: concrete piers, heavy rusted I-beam columns X-braced
// between deep girders, a riveted girder frame round a steel-plate deck, and bundles of rusty pipe running under the deck
// and down to the ground. The walkways are box trusses with pipes running through them and a railed catwalk on top, to
// a shuttered steel door in each neighbour. Red lights, as the works have.
const IND_RUST = toon(0x4a3026), IND_RUST2 = toon(0x5e3a28), IND_STEEL = toon(0x34363a), IND_RED = toon(0x5a1010, { em: 0xff3a24, kind: 'bulb' });
function iBeam(mat, P, x, z, y0, y1, w = .16){ box(mat, P, x, (y0 + y1)/2, z, w, y1 - y0, .05); for (const s of [-1, 1]) box(mat, P, x, (y0 + y1)/2, z + s*w/2, w, y1 - y0, .04); }
function indLight(P, x, y, z){ box(M.metalDark, P, x, y, z, .1, .08, .1); box(IND_RED, P, x, y - .05, z, .08, .02, .08); glow(P, x, y - .07, z, 'ember', .4); }
// The industrial lift (after the works tower reference): a heavy lattice tower of rusted angle posts, zigzag bracing
// on three faces, a head housing with a big pulley, cables and a counterweight, and at the foot the winding motor with
// its flywheel, a red warning lamp and a hazard gate. The light is the cab's own: red neon round it, orange inside.
// F: local +z out from the deck's side; the gate is on the +x face, along the street.
const IND_LIFT_NEON = toon(0x5a1010, { em: 0xff3a24, kind: 'neon' });
function liftShaftInd(F, x, z, base, y0){
  const h = .24, top = y0 + 1.12;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ box(IND_RUST, F, x + sx*h, (base + top)/2, z + sz*h, .06, top - base, .06); }
  // zigzag lattice on the back and both sides (the gate face stays open), a ring every bay
  const bay = .7;
  for (let y = base + .1, k = 0; y < top - .2; y += bay, k++){
    const y1 = Math.min(top - .1, y + bay), fl = k % 2 ? 1 : -1;
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [-h, h, h, h], [-h, -h, -h, h]]){
      box(IND_STEEL, F, x + (ax + bx)/2, y1, z + (az + bz)/2, Math.abs(bx - ax) + .07, .045, Math.abs(bz - az) + .07);
      const [p0, p1] = fl > 0 ? [[ax, az], [bx, bz]] : [[bx, bz], [ax, az]];
      strut(IND_RUST2, F, x + p0[0], y + .03, z + p0[1], x + p1[0], y1 - .03, z + p1[1], .016);
    }
  }
  for (let y = base + 2.2; y < top - .6; y += 2.2) for (const s of [-1, 1]) box(IND_RED, F, x + h + .035, y, z + s*h, .012, .05, .025);   // red marker lamps up the front posts
  // the head: a heavy housing over the tower, the pulley on top, a red lamp
  box(IND_STEEL, F, x, top + .1, z, .68, .2, .68); box(IND_RUST, F, x, top + .22, z, .5, .06, .5);
  put(U.torus, IND_RUST2, under(F, T(x, top + .42, z, 0, .4, .4, .4, 0, PI/2)));
  indLight(F, x + .3, top - .02, z + .3);
  // cables down the back, and a big counterweight riding on them
  for (const s of [-1, 1]) strut(M.metalDark, F, x + s*.08, base + .5, z - .19, x + s*.08, top, z - .19, .007);
  box(IND_STEEL, F, x, (base + top)*.6, z - .19, .26, .5, .07); box(M.hazard, F, x, (base + top)*.6 - .2, z - .15, .26, .06, .01);
  // at the foot: the winding motor and its flywheel, a red lamp over the gate, a hazard-striped gate across the front
  box(IND_STEEL, F, x - .5, base + .24, z, .34, .48, .44); box(IND_RUST, F, x - .5, base + .5, z, .26, .06, .3);
  put(U.cyl16, IND_RUST2, under(F, T(x - .5, base + .32, z + .25, 0, .4, .06, .4, PI/2)));
  box(IND_RED, F, x - .33, base + .4, z - .12, .01, .04, .1);
  for (const s of [-1, 1]) box(M.hazard, F, x + h + .02, base + .53, z + s*h, .03, 1.0, .06);
  box(M.hazard, F, x + h + .02, base + 1.05, z, .03, .06, .54);
  box(IND_LIFT_NEON, F, x + h + .045, base + 1.1, z, .01, .02, .5);
  glow(F, x + h + .1, base + 1.05, z, 'ember', .3);
}
function liftScaffoldInd(c, y0){
  R = mulberry32(hash('lifti', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), E = .92, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const rust = () => pick([IND_RUST, IND_RUST, IND_RUST2, IND_STEEL]);
  // the deck: a steel plate inside a deep riveted girder frame
  box(IND_STEEL, P, 0, y0 - .05, 0, 2.3, .06, 2.3);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1])));
    box(IND_RUST, F, 0, y0 - .2, 1.15, 2.42, .34, .1);
    for (let x = -1.1; x <= 1.11; x += .22) box(M.metalDark, F, x, y0 - .2, 1.205, .03, .03, .01); }   // rivets
  // the columns: concrete piers, I-beams, deep girders between them, X braces in each bay
  // the columns stand on anchor points: the roof's corners (taken in so the beam and its plate sit wholly on it) when
  // there's a building below, else the deck's corners on the street; the girders run between them
  const cols = [[-E, -E], [E, -E], [E, E], [-E, E]];
  let feet = cols.map(([x, z]) => [x, z]);
  if (onRoof){
    const rc = c.liftRoof || cols.map(([sx, sz]) => [c.x + Math.sign(sx)*.75, base, c.z + Math.sign(sz)*.75]);
    const cx = rc.reduce((a, p) => a + p[0], 0)/4, cz = rc.reduce((a, p) => a + p[2], 0)/4;
    feet = cols.map(([sx, sz]) => { let best = rc[0], bd = -Infinity; for (const p of rc){ const d = sx*(p[0] - cx) + sz*(p[2] - cz); if (d > bd){ bd = d; best = p; } }
      const k = .22 + rnd(0, .08), dx = cx - best[0], dz = cz - best[2], l = Math.hypot(dx, dz) || 1; return [best[0] - c.x + dx/l*k, best[2] - c.z + dz/l*k]; });
  }
  for (const [x, z] of feet){ if (!onRoof) box(M.concM, P, x, base + .3, z, .5, .6, .5); else box(M.concDD, P, x, base + .03, z, .34, .06, .34); iBeam(rust(), P, x, z, base + (onRoof ? .06 : .6), y0 - .37); }
  const edges = feet.map((f, k) => [f[0], f[1], feet[(k + 1) % 4][0], feet[(k + 1) % 4][1]]);
  const fx0 = Math.min(...feet.map(f => f[0])) + .15, fx1 = Math.max(...feet.map(f => f[0])) - .15, fz0 = Math.min(...feet.map(f => f[1])) + .15, fz1 = Math.max(...feet.map(f => f[1])) - .15;
  const lv = [base + (onRoof ? .1 : .6)]; for (let y = lv[0] + rnd(1.5, 1.9); y < y0 - .9; y += rnd(1.5, 1.9)) lv.push(y); lv.push(y0 - .37);
  for (let k = 1; k < lv.length; k++) for (const [ax, az, bx, bz] of edges){
    if (k < lv.length - 1) box(rust(), P, (ax + bx)/2, lv[k], (az + bz)/2, Math.abs(bx - ax) + .14, .14, Math.abs(bz - az) + .14);   // girder
    if (chance(.8)){ strut(rust(), P, ax, lv[k - 1] + .08, az, bx, lv[k] - .08, bz, .035); strut(rust(), P, bx, lv[k - 1] + .08, bz, ax, lv[k] - .08, az, .035); }   // X brace
  }
  // pipes: a bundle under the deck along one axis, one of them dropping down a column to the ground (or onto the roof below)
  const ax = chance(.5);
  for (let q = 0; q < irand(2, 3); q++){
    const o = -.45 + q*.32, yy = y0 - .55 - q*.05, mat = pick([M.inRust, M.inPipe, M.inRust2, M.inPipe2]), r = rnd(.07, .1);
    const pts = ax ? [[-1.3, yy, o], [1.3, yy, o]] : [[o, yy, -1.3], [o, yy, 1.3]];
    if (q === 0){ const end = ax ? [Math.min(E - .2, fx1), yy, clamp(o, fz0, fz1)] : [clamp(o, fx0, fx1), yy, Math.min(E - .2, fz1)]; pipeRun(mat, P, [pts[0], end, [end[0], base + .25, end[2]], [end[0] + (ax ? .4 : 0), base + .25, end[2] + (ax ? 0 : .4)]], r, true); }
    else pipeRun(mat, P, pts, r, true);
  }
  if (chance(.5)) emitters.push(new THREE.Vector3(rnd(-.8, .8), y0 - .5, rnd(-.8, .8)).applyMatrix4(P));   // a leaky joint
  // red lights on the deck frame, a beacon on a corner post
  for (const [sx, sz] of cols) if (chance(.7)) indLight(P, sx*1.2, y0 - .4, sz*1.2);
  { const [sx, sz] = pick(cols); cyl(IND_STEEL, P, sx*1.1, y0 + .45, sz*1.1, .025, .9); beaconLight(P, sx*1.1, y0 + .93, sz*1.1, .07, .8); }
  // the lift: a heavy lattice tower beside the deck on a side with no walkway, from the street up past the deck, its
  // steel cab lined in red neon carrying people between the street and the deck
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  const LX = .5, LZ = 1.44;
  { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));
    liftShaftInd(F, LX, LZ, CURB, y0);
    const Wp = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(F);
    const cc = Wp(LX, LZ), fr = Wp(LX + .26, LZ), ix = Wp(LX, .85), g = Wp(1, 0), o = Wp(0, 0), gx = g.x - o.x, gz = g.z - o.z;
    c.liftCab = { x: cc.x, z: cc.z, fx: fr.x, fz: fr.z, nx: gx, nz: gz, ix: ix.x, iz: ix.z, y0, ry: Math.atan2(gx, gz), style: 'ind' };
  }
  // pipe rails round the deck (gaps for the walkways)
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join()), lift = d === hs;
    for (let x = -1.15; x <= 1.16; x += .46){ if ((bridge && Math.abs(x) < .5) || (lift && Math.abs(x - LX) < .32)) continue; cyl(IND_STEEL, F, x, y0 + .24, 1.15, .02, .48); }
    for (const yy of [.48, .26]){ if (lift){ strut(IND_RUST2, F, -1.15, y0 + yy, 1.15, LX - .3, y0 + yy, 1.15, .018); strut(IND_RUST2, F, LX + .3, y0 + yy, 1.15, 1.15, y0 + yy, 1.15, .018); } else if (bridge){ strut(IND_RUST2, F, -1.15, y0 + yy, 1.15, -.5, y0 + yy, 1.15, .018); strut(IND_RUST2, F, .5, y0 + yy, 1.15, 1.15, y0 + yy, 1.15, .018); } else strut(IND_RUST2, F, -1.15, y0 + yy, 1.15, 1.15, y0 + yy, 1.15, .018); }
  }
  // the walkways: box trusses over the street, pipes running through them, a railed catwalk on top
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.2, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .9, th = .75;
    box(IND_STEEL, F, 0, y0 - .04, zm, w, .06, L);                       // the catwalk plate
    for (const s of [-1, 1]){
      box(IND_RUST, F, s*w/2, y0 - .09, zm, .12, .12, L); box(IND_RUST, F, s*w/2, y0 - th, zm, .12, .12, L);   // top and bottom chords
      const n = Math.max(2, Math.round(L/.62));
      for (let k = 0; k <= n; k++){ const z = z0 + k*L/n; box(IND_RUST, F, s*w/2, y0 - th/2 - .05, z, .1, th - .1, .1); }   // verticals
      for (let k = 0; k < n; k++){ const za = z0 + k*L/n, zb = z0 + (k + 1)*L/n; strut(IND_RUST2, F, s*w/2, y0 - th + .05, za, s*w/2, y0 - .14, zb, .025); strut(IND_RUST2, F, s*w/2, y0 - .14, za, s*w/2, y0 - th + .05, zb, .025); }
      for (let z = z0 + .15; z < z1; z += .55) cyl(IND_STEEL, F, s*(w/2 - .05), y0 + .25, z, .018, .5);
      strut(IND_STEEL, F, s*(w/2 - .05), y0 + .5, z0, s*(w/2 - .05), y0 + .5, z1, .02);
    }
    box(IND_STEEL, F, 0, y0 - th, zm, w, .05, L);                          // the bottom of the box
    for (let q = 0; q < irand(2, 3); q++){ const x = -.25 + q*.25, yy = y0 - th + .14 + (q % 2)*.18; pipeRun(pick([M.inRust, M.inPipe, M.inRust2]), F, [[x, yy, z0 - .1], [x, yy, z1 + .15]], rnd(.06, .09), true); }
    indLight(F, 0, y0 - th - .08, zm);
    // the door in the neighbour: a steel frame round a sliding steel door, a red light over it
    box(IND_STEEL, F, 0, y0 + .5, z1 + .14, .84, 1.06, .32);
    box(M.metalDark, F, 0, y0 + .5, z1 - .03, .72, 1.0, .05);
    indLight(F, 0, y0 + 1.08, z1 - .12);
    box(M.metalDark, F, 0, y0 + .5, z0 + .02, .62, 1.0, .05);
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, z1 - .2).applyMatrix4(F);
    const dA = new THREE.Vector3(0, 0, z0 + .05).applyMatrix4(F), dB = new THREE.Vector3(0, 0, z1 - .06).applyMatrix4(F), o0 = new THREE.Vector3(0, 0, 0).applyMatrix4(F), fz = new THREE.Vector3(0, 0, 1).applyMatrix4(F), nx = fz.x - o0.x, nz = fz.z - o0.z;
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01, doors: [{ x: dA.x, z: dA.z, n: [nx, nz] }, { x: dB.x, z: dB.z, n: [-nx, -nz] }], col: 0x5a5e64 });
  }
}
// The lift's shaft (after the pod-on-a-tower reference, made slim): four rusty posts with rings and braces from the
// street to just over the deck, a head with a pulley wheel and a lamp, two cables and a counterweight, and at the foot
// a motor housing with a big gear and a cyan status light, and a striped gate. F: local +z out from the deck's side.
const LIFT_IRON = toon(0x5a3a2a), LIFT_DARK = toon(0x2e3036);
function liftShaft(F, x, z, base, y0){
  const h = .22, top = y0 + 1.08;   // (the head clears the cab, which is .95 tall, at the top)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(LIFT_IRON, F, x + sx*h, (base + top)/2, z + sz*h, .04, top - base, .04);
  for (let y = base + .9; y < top - .2; y += .9){
    for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [-h, -h, -h, h]]) box(LIFT_DARK, F, x + (ax + bx)/2, y, z + (az + bz)/2, Math.abs(bx - ax) + .05, .035, Math.abs(bz - az) + .05);
    strut(LIFT_IRON, F, x - h, y - .85, z - h, x + h, y, z - h, .012);   // a brace on the back
  }
  // the head: a housing over the shaft, a pulley wheel, a lamp
  box(LIFT_DARK, F, x, top + .08, z, .56, .16, .56);
  put(U.torus, LIFT_IRON, under(F, T(x, top + .26, z, 0, .3, .3, .3, 0, PI/2)));
  box(M.bulb, F, x + .2, top - .04, z + .27, .06, .05, .05); glow(F, x + .2, top - .08, z + .3, 'warm', .3);
  // cables, and a counterweight on one
  for (const s of [-1, 1]) strut(M.metalDark, F, x + s*.06, base + .5, z - .17, x + s*.06, top, z - .17, .006);
  box(LIFT_DARK, F, x - .06, (base + top)*.55, z - .17, .1, .32, .06);
  // at the foot: the motor and its gear, a status light, a striped gate across the front
  // (the gate is on the shaft's +x face, along the street, so the way in stays on the plot's own sidewalk)
  box(LIFT_DARK, F, x - .42, base + .2, z, .28, .4, .34);
  put(U.cyl16, LIFT_IRON, under(F, T(x - .42, base + .28, z + .19, 0, .34, .05, .34, PI/2)));
  box(M.neonCyan, F, x - .29, base + .38, z - .1, .01, .03, .08);
  for (const s of [-1, 1]) box(M.hazard, F, x + h + .01, base + .53, z + s*h, .02, 1.0, .05);
  box(M.hazard, F, x + h + .01, base + 1.04, z, .02, .05, .5);
}
// The luxury pod's platform, after the garden-tower references: no scaffold at all, but a finished podium the tower
// stands on. A cream stone deck with a gold edge, a glass storey under it lit from inside behind gold mullions, a stone
// soffit, and slim round stone columns with gold collars standing on anchor points (the roof's corners below, or plinths
// on the street). Glass balustrades with a gold handrail, round planters with bonsai at the corners. The lift is a glass
// tube ringed in gold with a gold dome, its cab a glass capsule; the walkways are glass skybridges between gold lattice
// trusses, a gold arch beneath.
U.luxVault = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, -PI/2, PI).rotateX(-PI/2).toNonIndexed();   // a half tube along z, open below
const LUX_TRIM = toon(0x8a6a2a, { em: 0xd8a850, kind: 'trim' });   // gold that glows softly after dark (the vestibules)
const LUX_STONE = toon(0xe6dccb), LUX_STONE2 = toon(0xcfc3ad);
const LUX_GLASS = new THREE.MeshBasicMaterial({ color: 0x8a8068, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }); LUX_GLASS.userData.colorOnly = true;
function luxCol(P, x, z, y0, y1, r = .08){   // a round stone column, gold collars at the foot, head and every couple of metres
  put(U.cyl16, LUX_STONE, under(P, T(x, (y0 + y1)/2, z, 0, 2*r, y1 - y0, 2*r)));
  for (const y of [y0 + .05, y1 - .05]) put(U.cyl16, M.idGold, under(P, T(x, y, z, 0, 2*r + .06, .07, 2*r + .06)));
  for (let y = y0 + 2; y < y1 - 1; y += 2) put(U.cyl16, M.idGold, under(P, T(x, y, z, 0, 2*r + .03, .04, 2*r + .03)));
}
const LUX_TUBE_GLASS = new THREE.MeshBasicMaterial({ color: 0x4a2c10, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });   // (added light: it glows warm against the dark) LUX_TUBE_GLASS.userData.colorOnly = true;
function luxTube(F, x, z, base, y0){
  const r = .27, top = y0 + 1.12;
  put(U.cyl16, LUX_TUBE_GLASS, under(F, T(x, (base + top)/2, z, 0, 2*r, top - base, 2*r)));   // (a warm amber glass, lit from within)
  for (let k = 0; k < 8; k++){ const a = k*TAU/8 + TAU/16; box(M.idGold, F, x + Math.sin(a)*r, (base + top)/2, z + Math.cos(a)*r, .025, top - base, .025); }
  for (let y = base + .9; y < top - .2; y += .9) put(U.torus, LUX_TRIM, under(F, T(x, y, z, 0, 2*r + .02, 2*r + .02, .5, PI/2)));   // gold rings that glow after dark
  // the foot: a round stone plinth with a gold band; the head: a stone drum, a gold dome and finial
  put(U.cyl16, LUX_STONE, under(F, T(x, base + .05, z, 0, 2*r + .16, .1, 2*r + .16))); put(U.cyl16, M.idGold, under(F, T(x, base + .11, z, 0, 2*r + .1, .03, 2*r + .1)));
  put(U.cyl16, LUX_STONE, under(F, T(x, top + .07, z, 0, 2*r + .12, .14, 2*r + .12))); put(U.cyl16, M.idGold, under(F, T(x, top + .15, z, 0, 2*r + .14, .03, 2*r + .14)));
  put(U.lxDome, M.idGold, under(F, T(x, top + .16, z, 0, r*.9, r*.75, r*.9)));
  cyl(M.idGold, F, x, top + .16 + r*.75 + .06, z, .012, .14); sph(M.idGoldLit, F, x, top + .16 + r*.75 + .14, z, .025);
  // a gold call panel by the gate, and the gate itself: two slim gold posts and a lintel on the street side
  box(LUX_STONE2, F, x + r + .1, base + .45, z - r - .02, .08, .5, .1); box(M.screen || M.idGoldLit, F, x + r + .145, base + .52, z - r - .02, .01, .1, .06);
  for (const s of [-1, 1]) box(M.idGold, F, x + r + .01, base + .55, z + s*.2, .035, 1.0, .035);
  box(M.idGold, F, x + r + .01, base + 1.07, z, .035, .05, .44);
}
function liftPlatformLux(c, y0){
  R = mulberry32(hash('liftl', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), H = 1.22, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const pH = .5, yb = y0 - .14 - pH;   // the glass storey's height, the soffit's underside
  // the deck: a stone slab with a gold band round its edge
  box(LUX_STONE, P, 0, y0 - .07, 0, 2*H, .14, 2*H);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))); box(M.idGold, F, 0, y0 - .07, H + .005, 2*H + .02, .04, .012); }
  // the glass storey under it: a lit room behind gold mullions, then the stone soffit
  const gw = 2*H - .24, lit = pick(LIT_ROOMS);
  box(LUX_STONE2, P, 0, y0 - .14 - pH/2, 0, gw - .12, pH, gw - .12);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1])));
    box(lit, F, 0, y0 - .14 - pH/2, gw/2 - .055, gw - .16, pH - .1, .01);
    box(LUX_GLASS, F, 0, y0 - .14 - pH/2, gw/2, gw, pH, .01);
    for (let x = -gw/2; x <= gw/2 + .01; x += gw/6) box(M.idGold, F, x, y0 - .14 - pH/2, gw/2 + .01, .03, pH, .03); }
  box(LUX_STONE, P, 0, yb - .05, 0, 2*H - .1, .1, 2*H - .1);
  for (const d of SIDES4){ const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))); box(M.idGold, F, 0, yb - .05, H - .045, 2*H - .08, .03, .012); }
  // the columns: on the roof's corners below (taken in), or on plinths on the street under the platform's corners
  const QS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let feet = QS.map(([sx, sz]) => [sx*.92, sz*.92]);
  if (onRoof){
    const rc = c.liftRoof || QS.map(([sx, sz]) => [c.x + sx*.75, base, c.z + sz*.75]);
    const cx = rc.reduce((a, p) => a + p[0], 0)/4, cz = rc.reduce((a, p) => a + p[2], 0)/4;
    feet = QS.map(([sx, sz]) => { let best = rc[0], bd = -Infinity; for (const p of rc){ const d = sx*(p[0] - cx) + sz*(p[2] - cz); if (d > bd){ bd = d; best = p; } }
      const k = .2, dx = cx - best[0], dz = cz - best[2], l = Math.hypot(dx, dz) || 1;
      return [clamp(best[0] - c.x + dx/l*k, -H + .2, H - .2), clamp(best[2] - c.z + dz/l*k, -H + .2, H - .2)]; });
  }
  for (const [x, z] of feet){
    box(LUX_STONE2, P, x, base + .08, z, .3, .16, .3); box(M.idGold, P, x, base + .165, z, .26, .02, .26);
    luxCol(P, x, z, base + .16, yb - .1);
  }
  // round planters on the deck's corners, a bonsai in each, hanging green off the soffit here and there
  for (const [sx, sz] of QS){ const x = sx*(H - .02), z = sz*(H - .02);
    put(U.cyl16, LUX_STONE, under(P, T(x, y0 + .06, z, 0, .36, .12, .36))); put(U.cyl16, M.idGold, under(P, T(x, y0 + .125, z, 0, .37, .02, .37)));
    if (chance(.8*S.green)) plant('bonsai', P, x, y0 + .13, z, rnd(.8, 1.0)); }
  for (let k = 0; k < 4; k++) if (chance(.5*S.green)){ const d = SIDES4[k], F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))); plant(hangKind(), F, rnd(-.8, .8), yb - .1, H - .05, rnd(.55, .75), 't', true); }
  // the lift: a gold-ringed glass tube on a side with no walkway
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  const LX = .5, LZ = 1.5;
  { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));
    luxTube(F, LX, LZ, CURB, y0);
    const Wp = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(F);
    const cc = Wp(LX, LZ), fr = Wp(LX + .29, LZ), ix = Wp(LX, .9), g = Wp(1, 0), o = Wp(0, 0), gx = g.x - o.x, gz = g.z - o.z;
    c.liftCab = { x: cc.x, z: cc.z, fx: fr.x, fz: fr.z, nx: gx, nz: gz, ix: ix.x, iz: ix.z, y0, ry: Math.atan2(gx, gz), style: 'lux' };
  }
  // glass balustrades with a gold handrail (gaps for the walkways and the lift)
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join()), lift = d === hs;
    const runs = lift ? [[-H + .2, LX - .32], [LX + .32, H - .2]] : bridge ? [[-H + .2, -.5], [.5, H - .2]] : [[-H + .2, H - .2]];
    for (const [a, b] of runs){ if (b - a < .05) continue;
      box(LUX_GLASS, F, (a + b)/2, y0 + .22, H - .04, b - a, .4, .01);
      box(M.idGold, F, (a + b)/2, y0 + .43, H - .04, b - a + .02, .025, .035);
      for (const x of [a, b]) box(M.idGold, F, x, y0 + .22, H - .04, .03, .44, .03); }
  }
  // the walkways: glass skybridges between gold lattice trusses, a gold arch under each, to a doorway in each neighbour
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.2, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .8, ht = .62;
    box(LUX_STONE, F, 0, y0 - .05, zm, w + .06, .1, L);
    for (const s of [-1, 1]){
      trussBeam(F, s*w/2, z0, s*w/2, z1, y0, ht, M.idGold, .014);
      box(LUX_GLASS, F, s*(w/2 - .02), y0 + ht/2, zm, .01, ht - .04, L);
      // the arch: a curve of gold from the platform to the wall, its spandrel braced up to the deck
      const n = 8, rise = .45;
      for (let k = 0; k < n; k++){ const u0 = k/n, u1 = (k + 1)/n, ya = y0 - .1 - rise*4*u0*(1 - u0), yc = y0 - .1 - rise*4*u1*(1 - u1);
        strut(M.idGold, F, s*w/2, ya - .12, z0 + L*u0, s*w/2, yc - .12, z0 + L*u1, .03);
        if (k) strut(M.idGold, F, s*w/2, ya - .12, z0 + L*u0, s*w/2, y0 - .1, z0 + L*u0, .015); }
    }
    box(LUX_GLASS, F, 0, y0 + ht, zm, w, .01, L); box(M.idGold, F, 0, y0 + ht, zm, .03, .02, L);   // the glass roof, a gold ridge
    // where the neighbour stands back from the plot's edge (a round tower, a set-back lobby), a glass vestibule under a
    // barrel vault ribbed in gold carries the walkway on to its wall, and the door goes there
    const gap = wallGap(cells.get(ckey(c.i + d[0], c.j + d[1])), F, y0, z1), ze = z1 + (gap > .04 ? gap + .04 : 0);
    if (ze > z1){ const vm = (z1 + ze)/2, vl = ze - z1 + .02;
      box(LUX_STONE, F, 0, y0 - .05, vm, w + .06, .1, vl);
      for (const s of [-1, 1]){ box(LUX_GLASS, F, s*w/2, y0 + .4, vm, .01, .8, vl); box(LUX_TRIM, F, s*w/2, y0 + .01, vm, .03, .03, vl); box(LUX_TRIM, F, s*w/2, y0 + .8, vm, .03, .03, vl); }
      put(U.luxVault, LUX_GLASS, under(F, T(0, y0 + .8, vm, 0, w/2, w/2, vl)));
      for (let z = z1; z <= ze + .001; z += Math.max(.2, (ze - z1)/Math.ceil((ze - z1)/.3))){
        put(U.halfRing, LUX_TRIM, under(F, T(0, y0 + .8, z, 0, w/2, w/2, 1.6)));
        for (const s of [-1, 1]) box(M.idGold, F, s*w/2, y0 + .4, z, .03, .8, .03); }
    }
    // the doorways: a stone surround with a gold frame in the neighbour's wall, a gold frame on the platform's side
    box(LUX_STONE, F, 0, y0 + .52, ze + .16, .84, 1.08, .36);
    box(M.idGold, F, 0, y0 + .5, ze - .03, .64, 1.02, .05);
    box(LUX_STONE2, F, 0, y0 + 1.06, ze - .05, .76, .06, .1);
    if (ze > z1){ box(M.idGold, F, 0, y0 + 1.0, ze - .12, .1, .03, .06); box(LUX_TRIM, F, 0, y0 + .97, ze - .12, .07, .03, .05); glow(F, 0, y0 + .94, ze - .14, 'gold', .28); }   // a lamp over the door
    box(M.idGold, F, 0, y0 + .5, z0 + .02, .62, 1.0, .05);
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, ze - .2).applyMatrix4(F);
    const dA = new THREE.Vector3(0, 0, z0 + .05).applyMatrix4(F), dB = new THREE.Vector3(0, 0, ze - .06).applyMatrix4(F), o0 = new THREE.Vector3(0, 0, 0).applyMatrix4(F), fz = new THREE.Vector3(0, 0, 1).applyMatrix4(F), nx = fz.x - o0.x, nz = fz.z - o0.z;
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01, doors: [{ x: dA.x, z: dA.z, n: [nx, nz] }, { x: dB.x, z: dB.z, n: [-nx, -nz] }], col: 0xd8c8a0 });
  }
}
function liftScaffold(c, y0){
  if (c.sections[0] && c.sections[0].zone === 'mid') return liftScaffoldCom(c, y0);   // a commercial pod: the heavy steel rig
  if (c.sections[0] && c.sections[0].zone === 'ind') return liftScaffoldInd(c, y0);
  if (c.sections[0] && c.sections[0].zone === 'high') return liftPlatformLux(c, y0);   // a luxury pod: a finished platform, no scaffold   // an industrial pod: the trestle   // a commercial pod: the heavy steel rig
  R = mulberry32(hash('lift', c.i, c.j, Math.round(y0*100)));
  const P = T(c.x, 0, c.z), E = .98, base = c.belowTop ?? CURB, onRoof = c.belowTop != null;   // on the roof of the building below, if there is one   // poles just inside the deck's corners, clear of the sidewalk's corners
  const sup = liftSupports(c, y0), supKey = new Set(sup.map(d => d.join()));
  const tube = () => pick([M.metal, M.metal, M.rust, M.frame]);
  const wobble = () => rnd(-.03, .03);
  // the deck: planks on bearers, a little bigger than the pod
  box(M.frame, P, 0, y0 - .1, 0, 2.36, .08, 2.36);
  for (let x = -1.12; x <= 1.13; x += .16) box(pick([M.wood, M.wood, M.crate]), P, x, y0 - .03, 0, .14, .05, 2.3);
  // Anchor points: the four corners under the deck, and four feet. With a building below, each foot is a corner of its
  // roof (taken inward a little, at random, so no two rigs stand alike); with nothing below, the street under the deck.
  // Each leg runs from its deck corner to its foot, leaning in or splaying out as the roof is narrower or turned, so it
  // always lands on the roof. Ledgers and braces join the legs along their actual lines.
  const QS = [[-1, -1], [1, -1], [1, 1], [-1, 1]], top = QS.map(([sx, sz]) => [sx*E, y0 - .1, sz*E]);
  let feet;
  if (onRoof){
    const rc = c.liftRoof || QS.map(([sx, sz]) => [c.x + sx*.6, base, c.z + sz*.6]);   // (no corners recorded: a safe square well inside)
    const cx = rc.reduce((a, p) => a + p[0], 0)/4, cz = rc.reduce((a, p) => a + p[2], 0)/4;
    feet = QS.map(([sx, sz]) => {   // the roof corner lying furthest toward this deck corner
      let best = rc[0], bd = -Infinity; for (const p of rc){ const d = sx*(p[0] - cx) + sz*(p[2] - cz); if (d > bd){ bd = d; best = p; } }
      const k = rnd(.08, .2), dx = cx - best[0], dz = cz - best[2], l = Math.hypot(dx, dz) || 1;
      return [best[0] - c.x + dx/l*k, base, best[2] - c.z + dz/l*k];
    });
  } else feet = top.map(([x, , z]) => [x + wobble(), base, z + wobble()]);
  const legAt = (k, y) => { const a = feet[k], b = top[k], u = Math.max(0, Math.min(1, (y - a[1])/(b[1] - a[1]))); return [a[0] + (b[0] - a[0])*u, a[2] + (b[2] - a[2])*u]; };
  for (let k = 0; k < 4; k++){
    const [fx, fy, fz] = feet[k], [tx, ty, tz] = top[k];
    strut(chance(.25) ? M.wood : tube(), P, fx, fy, fz, tx, ty, tz, .03);
    box(M.concDD, P, fx, fy + .02, fz, .14, .04, .14);   // a base plate
  }
  // a prop or two from mid-roof up to the middle of a deck edge, so a wide deck on a small roof reads as braced
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) if (chance(.4)){
    const fx = (feet[a][0] + feet[b][0])/2, fz = (feet[a][2] + feet[b][2])/2, tx = (top[a][0] + top[b][0])/2, tz = (top[a][2] + top[b][2])/2;
    strut(tube(), P, fx, base, fz, tx, y0 - .1, tz, .025); box(M.concDD, P, fx, base + .02, fz, .12, .04, .12);
  }
  // ledgers between neighbouring legs every metre or so, and cross braces on a couple of faces, all along the legs' lines
  for (let y = base + 1.0; y < y0 - .3; y += rnd(.85, 1.1)) for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) if (chance(.85)){
    const [ax, az] = legAt(a, y), [bx, bz] = legAt(b, y); strut(tube(), P, ax, y, az, bx, y + rnd(-.04, .04), bz, .02); }
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]){
    if (!chance(.55)) continue;
    const yl = base + .25, yh = y0 - .15; if (yh - yl < .6) continue;
    const [ax, az] = legAt(a, yl), [bx, bz] = legAt(b, yh), [cx2, cz2] = legAt(b, yl), [dx2, dz2] = legAt(a, yh);
    strut(tube(), P, ax, yl, az, bx, yh, bz, .018); if (chance(.6)) strut(tube(), P, cx2, yl, cz2, dx2, yh, dz2, .018);
  }
  // the stair hut and ladder: on a side with no walkway, the pod's front door at street level
  const free = SIDES4.filter(d => !supKey.has(d.join()));
  const hs = free.length ? free[hash('liftdoor', c.i, c.j) % free.length] : SIDES4[0];
  // the lift: a slim shaft beside the deck on that side, from the street up past the deck, its cab carrying people
  // between the street and the deck (the cab itself moves: see the lifts in people.js)
  const LX = .5, LZ = 1.42;
  { const F = under(P, T(0, 0, 0, Math.atan2(hs[0], hs[1])));   // local +z out to that side
    liftShaft(F, LX, LZ, CURB, y0);
    const W = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(F);
    const cc = W(LX, LZ), fr = W(LX + .26, LZ), ix = W(LX, .85), g = W(1, 0), o = W(0, 0), gx = g.x - o.x, gz = g.z - o.z;
    c.liftCab = { x: cc.x, z: cc.z, fx: fr.x, fz: fr.z, nx: gx, nz: gz, ix: ix.x, iz: ix.z, y0, ry: Math.atan2(gx, gz) };
  }
  // rails round the deck's open edges (a gap where a walkway leaves), with the odd plant pot and washing
  for (const d of SIDES4){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), bridge = supKey.has(d.join()), lift = d === hs;
    for (let x = -1.1; x <= 1.11; x += .55){ if ((bridge && Math.abs(x) < .45) || (lift && Math.abs(x - LX) < .32)) continue; cyl(tube(), F, x, y0 + .23, 1.15, .015, .46); }
    if (lift){ strut(tube(), F, -1.1, y0 + .45, 1.15, LX - .28, y0 + .45, 1.15, .015); if (LX + .28 < 1.1) strut(tube(), F, LX + .28, y0 + .45, 1.15, 1.1, y0 + .45, 1.15, .015); }
    else if (bridge){ strut(tube(), F, -1.1, y0 + .45, 1.15, -.42, y0 + .45, 1.15, .015); strut(tube(), F, .42, y0 + .45, 1.15, 1.1, y0 + .45, 1.15, .015); }
    else { strut(tube(), F, -1.1, y0 + .45, 1.15, 1.1, y0 + .45, 1.15, .015); if (chance(.35*S.clutter)) for (let x = -.8; x < .9; x += .4) if (chance(.6)) plant(laundryKind(), F, x, y0 + .45, 1.16, .8, 't', true); }
    if (chance(.4*S.green)) plant(pick(['bush', 'fern', 'succulent', 'bushFlower']), F, lift ? rnd(-.9, LX - .4) : rnd(-.9, .9), y0, 1.02, rnd(.5, .65));
    if (chance(.35*S.green)) plant(hangKind(), F, rnd(-.9, .9), y0 - .12, 1.18, rnd(.6, .8), 't', true);
  }
  // the walkways: planks over the street to a door in each neighbour that reaches the deck
  c.walks = [];
  for (const d of sup){
    const F = under(P, T(0, 0, 0, Math.atan2(d[0], d[1]))), z0 = 1.1, z1 = LOT - 1.05, L = z1 - z0, zm = (z0 + z1)/2, w = .74;
    box(M.frame, F, 0, y0 - .09, zm, w + .08, .06, L);
    for (let z = z0 + .05; z < z1; z += .17) box(pick([M.wood, M.wood, M.crate]), F, 0, y0 - .035, z, w, .045, .14);
    for (const s of [-1, 1]){
      for (let z = z0 + .1; z < z1; z += .5) cyl(tube(), F, s*w/2, y0 + .23, z, .015, .46);
      strut(tube(), F, s*w/2, y0 + .45, z0, s*w/2, y0 + .45, z1 - .05, .015);
      strut(tube(), F, s*w/2, y0 - .1, zm, s*(w/2 + .05), y0 - .9, z0 + .1, .02);   // braces down to the scaffold
      strut(tube(), F, s*w/2, y0 - .1, zm + .3, s*w/2, y0 - .75, z1 - .05, .02);    // and back to the wall
    }
    // overhead: two tall poles at the ends, a bar across them, a string of bulbs or a line of washing
    const top = y0 + rnd(1.5, 1.9);
    for (const z of [z0 + .08, z1 - .08]) for (const s of [-1, 1]) strut(tube(), F, s*(w/2 + .02), y0, z, s*(w/2 + .02), top, z, .016);
    for (const s of [-1, 1]) strut(tube(), F, s*(w/2 + .02), top, z0 + .08, s*(w/2 + .02), top + rnd(-.06, .06), z1 - .08, .016);
    if (chance(.55)) bulbString(F, -w/2, top - .05, z0 + .1, w/2, top - .05, z1 - .1, .12);
    else if (chance(.7*S.clutter)) for (let z = z0 + .3; z < z1 - .2; z += .3) if (chance(.7)) plant(laundryKind(), F, 0, top - .02, z, .8, 't', true);
    // the door in the neighbour's wall: a frame, a lit door, a little step, set into the wall so no gap shows
    box(M.concDD, F, 0, y0 + .5, z1 + .18, .7, 1.02, .4);
    box(M.frame, F, 0, y0 + .5, z1 - .03, .62, 1.02, .04);
    box(M.metalDark, F, 0, y0 + 1.03, z1 - .1, .7, .04, .16);
    glow(F, 0, y0 + .7, z1 - .08, 'warm', .4);
    // and one on the pod's own side
    box(M.frame, F, 0, y0 + .5, z0 + .03, .6, 1.0, .05);
    // (the doors themselves slide open for the people crossing: see the doors in people.js)
    const a = new THREE.Vector3(0, y0, z0 + .2).applyMatrix4(F), b = new THREE.Vector3(0, y0, z1 - .2).applyMatrix4(F);
    const dA = new THREE.Vector3(0, 0, z0 + .065).applyMatrix4(F), dB = new THREE.Vector3(0, 0, z1 - .06).applyMatrix4(F), o0 = new THREE.Vector3(0, 0, 0).applyMatrix4(F), fz = new THREE.Vector3(0, 0, 1).applyMatrix4(F), nx = fz.x - o0.x, nz = fz.z - o0.z;
    c.walks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: y0 + .01, doors: [{ x: dA.x, z: dA.z, n: [nx, nz] }, { x: dB.x, z: dB.z, n: [-nx, -nz] }], col: null });
  }
}
// Hologram billboards on the roofs: a small one on about half the commercial roofs, and on tall buildings of the
// commercial and residential zones now and then a big one on posts, with its slogan scrolling underneath. Picked from
// the plot and its top section, so a roof keeps its billboard through rebuilds. The two big wall holograms (the sign
// down a face, the air-filter picture) don't depend on the roof or the top section at all, so a building that has one
// keeps it as you stack more onto it (the roof billboards and the side board do change with the top section).
const airCells = new Set();   // the towers that may throw an air-filter hologram (whether or not there's room for it right now)
const AIR_HOLO_ODDS = 20;     // one commercial building in this many that hasn't got the wall hologram throws the big air-filter picture, which makes one in 30 overall
const WALL_HOLO_ODDS = 3;     // one commercial building in this many, once it's tall enough, wears a wall hologram
const WALL_HOLO_MIN_Y = 2.4;  // 'tall enough': stacking a section can make a building shorter (the whole stack is built afresh), but never
                              // below this for two or more sections, so a building that has a hologram keeps it as it grows
function rooftopBoard(c, y){
  const top = c.sections[c.sections.length - 1], lot = c._topLot; c._topLot = null;
  airCells.delete(c);
  if (!top || c.dark) return;
  const mid = c.sections.some(s => s.zone === 'mid');
  // A building has the wall hologram or the air-filter one, never both: the plots that get the wall hologram are
  // picked first, and the air-filter tower is picked from the others. Both picks come from the plot alone, so
  // stacking never swaps one for the other.
  const key = c.i + ',' + c.j, wallPick = window.WALL_FORCE === key || hash('wallholo', c.i, c.j) % WALL_HOLO_ODDS === 0;
  const airPick = window.AIR_FORCE === key || (!wallPick && hash('airholo', c.i, c.j) % AIR_HOLO_ODDS === 0);
  const hw = hash('wallside', c.i, c.j), wsd = SIDES4[hw & 3], wallOn = mid && y >= WALL_HOLO_MIN_Y && wallPick && !airPick;
  // one commercial building in WALL_HOLO_ODDS (and not an air-filter tower), tall enough, wears a hologram ad down one
  // face, as wide as the building, never out past its plot, from just under the roofline to the top of the ground floor
  if (wallOn){
    const Wd = 2.2, yb = CURB + FH + .1;   // the ground floor is left clear for the shopfront
    wallHologram(T(c.x + wsd[0]*1.18, yb, c.z + wsd[1]*1.18, Math.atan2(wsd[0], wsd[1])), Wd, y - .08 - yb, (hw >>> 4) % 50, (hw >>> 10) % WALL_CELLS.length);
  }
  // one tall commercial tower in thirty throws the huge air-filter hologram out over the street from its top floor.
  // The picture (three plots wide) hangs over the three plots in front of the tower, so it's thrown from the face whose
  // three front plots are the lowest, and only if they're all lower than the picture's bottom edge (else it would be
  // inside a building). When a neighbour changes, the tower is rebuilt (see refresh) and picks again.
  if (mid && (c.sections.length >= 3 || y >= 6) && y >= 5 && airPick){
    airCells.add(c);
    const ha = hash('airside', c.i, c.j), W = 3*LOT - .8, pair = (ha >>> 10) % 3, H = W*AIR_ASPECT[pair], yp = y - .6;
    const front = ([a, b]) => { let m = 0; for (let l = -1; l <= 1; l++){ const n = cells.get(ckey(c.i + a + (a ? 0 : l), c.j + b + (b ? 0 : l))); if (n) m = Math.max(m, n.height); } return m; };
    const sd = SIDES4.map((d, k) => [d, front(d) + ((ha >>> k*2) & 3)*.01]).sort((p, q) => p[1] - q[1])[0];
    if (sd[1] <= yp - H/2 - .3 || window.AIR_FORCE === c.i + ',' + c.j){
      const d = sd[0];
      airHologram(T(c.x + d[0]*1.12, yp, c.z + d[1]*1.12, Math.atan2(d[0], d[1])), W, H, 3.2, (ha >>> 4) % 50, window.AIR_PAIR !== undefined ? window.AIR_PAIR : pair);
    }
  }
  if (lot && lot.hasCarPad) return;   // a car pad on the roof: no roof billboard or side board
  const hv = hash('board', c.i, c.j, c.sections.length, top.seed), r = hv % 100;
  let size = -1;
  if ((top.zone === 'mid' || top.zone === 'low') && y > 4.5 && r < (top.zone === 'mid' ? 45 : 28)) size = y > 6.5 ? 2 : 1;
  else if (top.zone === 'mid' && r < 72) size = 0;
  // and on the commercial streets, often a board hung off the side of the building too, part way up (never on the
  // face that has the wall hologram)
  const sbs = SIDES4[(hv >>> 4) & 3];
  if (mid && y > 2.4 && (hv >>> 20) % 100 < 40 && !(wallOn && sbs === wsd)) sideBoard(c, y, hv);
  if (size < 0) return;
  const side = [[0, 1], [1, 0], [0, -1], [-1, 0]][(hv >>> 8) & 3], off = size ? .1 : .45;
  holoBoard(T(c.x + side[0]*off, y, c.z + side[1]*off, Math.atan2(side[0], side[1])), size, (hv >>> 11) % 9, (hv >>> 15) % 211);
}
// a billboard bracketed off a building's side wall, facing out over the street
function sideBoard(c, y, hv){
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]][(hv >>> 4) & 3], h = Math.max(1.4, y*(.45 + ((hv >>> 9) & 7)*.04));
  const off = 1.12, x = c.x + side[0]*off, z = c.z + side[1]*off, ry = Math.atan2(side[0], side[1]);
  const P = T(x, h, z, ry);
  for (const s of [-1, 1]){ box(M.metalDark, P, s*.45, .3, -.12, .06, .06, .3); box(M.metalDark, P, s*.45, .05, -.05, .05, .5, .05); }   // the brackets into the wall
  holoBoard(under(P, T(0, -.2, .05, 0)), 0, (hv >>> 13) % 9, (hv >>> 2) % 211);
}
// Steam vents: now and then a grate in the street beside a building breathes steam, and the mist (sky.js) gathers
// round it. Common by industry (about 3 plots in 10), rare elsewhere (1 in 25); picked from the plot's position, so a
// plot keeps its vent (or lack of one) through rebuilds.
let VENTS = [];
function steamVent(c){
  c.vent = null;
  const hv = hash('vent', c.i, c.j), ind = c.sections.some(s => s.zone === 'ind');
  if (hv % 100 >= (ind ? 30 : 4)) return;
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]][(hv >> 8) & 3], along = (((hv >> 12) & 255)/255 - .5)*1.4;
  const off = SIDE/2 + .32, x = c.x + side[0]*off + side[1]*along, z = c.z + side[1]*off + side[0]*along;
  const P = T(x, 0, z, side[0] ? PI/2 : 0);
  box(M.concDD, P, 0, .03, 0, .62, .04, .44);                                         // the kerb round the grate
  box(M.frame, P, 0, .045, 0, .52, .02, .34);
  for (let k=0; k<6; k++) box(M.metalDark, P, -.22 + k*.088, .058, 0, .04, .012, .32);   // slats
  box(M.neonAmber, P, .27, .06, .18, .04, .02, .04);                                   // a little warning light
  emitters.push(new THREE.Vector3(x, .1, z));
  emitters.push(new THREE.Vector3(x + .1, .1, z - .06));
  c.vent = { x, z, s: .75 + ((hv >> 20) & 63)/63*.5 };                                // how strongly it breathes
}

// About one building in seventy stands on a dark street: almost no light, and what's left flickers (see DARK in core.js)
const isDarkPlot = c => !!c.sections.length && !c.mega && hash('dark', c.i, c.j) % 70 === 0;
/* ---------- rebuilding ---------- */
// Pieces are batched in regions of REG x REG grid cells; an edit only re-batches the regions it touched.
const REG = 5, regions = new Map(), dirtyRegions = new Set();
const regKey = (i, j) => Math.floor(i/REG) + ',' + Math.floor(j/REG);
// a cell's solid geometry is drawn as its own mesh (usually one draw call); plants and glows are batched per region
// the walls' mesh of a building mesh in the A/H/S/D order (sideArc): the same triangles, no shadow of its own
function sideMesh(mesh){
  const sm = new THREE.Mesh(mesh.geometry, ATLAS_SIDE); sm.receiveShadow = mesh.receiveShadow; sm.castShadow = false; sm.layers.mask = mesh.layers.mask;
  sm.onBeforeRender = sideBefore; sm.onAfterRender = cutAfter; sm.userData.sideOf = mesh; mesh.userData.side = sm;
  return sm;
}
function cellView(c){
  if (c.view){ world.remove(c.view); c.view = null; markSolid(c); }
  if (!c.data) return;
  const g = new THREE.Group();
  for (const [m, geo] of c.data.geo){
    const mesh = new THREE.Mesh(geo, m);
    if (m.userData.colorOnly){ mesh.layers.set(1); mesh.renderOrder = 2; } else { mesh.castShadow = !m.userData.noCast; mesh.receiveShadow = true; }   // see-through glass: colour pass only
    if (geo.userData.shown !== undefined){ mesh.onBeforeRender = hideBefore; mesh.onAfterRender = hideAfter; }
    g.add(mesh);
    if (geo.userData.cut){ mesh.onBeforeRender = cutBefore; mesh.onAfterRender = cutAfter; g.add(sideMesh(mesh)); }   // (and its walls: see sideArc)
  }
  world.add(freezeTree(g)); c.view = g;
  markSolid(c);
}
// Where the pod's building meets the deck on the lift's side: a ray from the deck's edge in toward the building finds
// its wall, and the door (opening as people and bots come and go: see the doors in people.js) goes there. The riders
// walk to it and in.
// one pass over a cell's triangles keeps those in the corridor some rays run through (so a ray test stays cheap)
function corridorTris(geoMap, sx, sz, ex, ez, by0, by1, pad = .25){
  const bx0 = Math.min(sx, ex) - pad, bx1 = Math.max(sx, ex) + pad, bz0 = Math.min(sz, ez) - pad, bz1 = Math.max(sz, ez) + pad, tris = [];
  for (const [, g] of geoMap){   // (glass counts: a door can go in a shopfront)
    const P = g.attributes.position.array, I = g.index ? g.index.array : null, n = I ? triIndexCount(g) : P.length/3;   // (not the copied wall slices: see sideArc)
    for (let k = 0; k < n; k += 3){
      const a = (I ? I[k] : k)*3, b = (I ? I[k + 1] : k + 1)*3, q = (I ? I[k + 2] : k + 2)*3;
      if (Math.max(P[a], P[b], P[q]) < bx0 || Math.min(P[a], P[b], P[q]) > bx1) continue;
      if (Math.max(P[a + 2], P[b + 2], P[q + 2]) < bz0 || Math.min(P[a + 2], P[b + 2], P[q + 2]) > bz1) continue;
      if (Math.max(P[a + 1], P[b + 1], P[q + 1]) < by0 || Math.min(P[a + 1], P[b + 1], P[q + 1]) > by1) continue;
      tris.push(new THREE.Vector3(P[a], P[a + 1], P[a + 2]), new THREE.Vector3(P[b], P[b + 1], P[b + 2]), new THREE.Vector3(P[q], P[q + 1], P[q + 2]));
    } }
  return tris;
}
function rayTris(tris, ray, far, hit){ let best = far; for (let k = 0; k < tris.length; k += 3) if (ray.intersectTriangle(tris[k], tris[k + 1], tris[k + 2], false, hit)){ const dd = hit.distanceTo(ray.origin); if (dd < best) best = dd; } return best; }
// how far past a walkway's end the neighbour's wall really is (a round or set-back tower stands short of the plot's edge)
function wallGap(n, F, y0, z1, far = 1.6){
  if (!n || !n.data || !n.data.geo) return 0;
  const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(F), a = W(0, 0, z1), b = W(0, 0, z1 + far), ux = (b.x - a.x)/far, uz = (b.z - a.z)/far;
  const tris = corridorTris(n.data.geo, a.x, a.z, b.x, b.z, y0 + .2, y0 + .9), ray = new THREE.Ray(), hit = new THREE.Vector3(), ds = [];
  for (const h of [.3, .55, .8]) for (const o of [-.2, 0, .2]){ ray.origin.set(a.x + uz*o, y0 + h, a.z - ux*o); ray.direction.set(ux, 0, uz); ds.push(rayTris(tris, ray, far, hit)); }
  ds.sort((p, q) => p - q);
  const d = ds[ds.length - 2];   // the second furthest: a rail or a plant stops some rays short
  return d >= far - 1e-6 ? 0 : d;
}
function podDoorSpot(c){
  const L = c.liftCab, dx = L.ix - L.x, dz = L.iz - L.z, l = Math.hypot(dx, dz) || 1, ux = dx/l, uz = dz/l;
  // the rays start inside the building and run out toward the lift: the first thing each meets is the inside of the
  // front wall (or a counter or shelf short of it), and they stop at the deck's edge
  const S0 = 1.0, far = .7, sx = L.x + ux*S0, sz = L.z + uz*S0, ex = L.x + ux*(S0 - far), ez = L.z + uz*(S0 - far), pad = .2;
  const tris = corridorTris(c.data.geo, sx, sz, ex, ez, L.y0 + .2, L.y0 + .9);
  // three heights and three offsets; clutter inside stops some short, so the wall is the second furthest out
  const ds = [], ray = new THREE.Ray(), hit = new THREE.Vector3();
  for (const h of [.3, .55, .8]) for (const o of [-.12, 0, .12]){
    ray.origin.set(sx - uz*o, L.y0 + h, sz + ux*o); ray.direction.set(-ux, 0, -uz);
    ds.push(rayTris(tris, ray, far, hit)); }
  ds.sort((a, b) => b - a);
  const d = S0 - Math.min(far, ds[1] + .01);                                 // from the cab to the wall's face
  L.door = { x: L.x + ux*d, z: L.z + uz*d, n: [-ux, -uz] };                  // the wall point, facing out to the lift
  L.ix = L.door.x - ux*.12; L.iz = L.door.z - uz*.12;                       // where the riders step through
}
// the highest point of everything built so far in this collect (rooftop antennas and tanks included)
// the highest point of what's been built so far over a small square (x0..x1, z0..z1): any triangle reaching over it counts,
// so a wide roof box or a rooftop tank whose corners lie outside the square still does
function bucketTopIn(x0, x1, z0, z1){
  let m = -1e9;
  for (const b of buckets.values()){ const p = b.p;
    for (let q = 0; q + 8 < p.length; q += 9){
      const ax = p[q], bx = p[q + 3], cx = p[q + 6]; if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1) continue;
      const az = p[q + 2], bz = p[q + 5], cz = p[q + 8]; if (Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
      const y = Math.max(p[q + 1], p[q + 4], p[q + 7]); if (y > m) m = y; } }
  return m;
}
// the height of the highest surface built so far right over the point (x, z) (each triangle's own height there)
function bucketHeightAt(x, z){
  let m = -1e9;
  for (const b of buckets.values()){ const p = b.p;
    for (let q = 0; q + 8 < p.length; q += 9){
      const ax = p[q], az = p[q + 2], bx = p[q + 3], bz = p[q + 5], cx = p[q + 6], cz = p[q + 8];
      if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || z < Math.min(az, bz, cz) || z > Math.max(az, bz, cz)) continue;
      const d = (bz - cz)*(ax - cx) + (cx - bx)*(az - cz); if (Math.abs(d) < 1e-9) continue;   // (seen edge-on from above: a wall)
      const u = ((bz - cz)*(x - cx) + (cx - bx)*(z - cz))/d, v = ((cz - az)*(x - cx) + (ax - cx)*(z - cz))/d, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const y = u*p[q + 1] + v*p[q + 4] + w*p[q + 7]; if (y > m) m = y; } }
  return m;
}
function bucketTop(){ let m = CURB; for (const b of buckets.values()){ const p = b.p; for (let q = 1; q < p.length; q += 3) if (p[q] > m) m = p[q]; } return m; }
// A plot's generation in steps: the platform, then each section, then the pieces of collect (the typed arrays, hideCovered a bucket at a time, the wall layout), each a step
// that ends in a yield (see collectGen, stackRunGen, sideLayoutGen). Run all at once it is the old rebuildCell; run by stageStep it is a few milliseconds a frame.
function* cellBody(c){
  withStyle(c.style, () => buildPlatform(c)); yield;
  if (c.sections.length){ PUT_KEEPOUT = lineKeepOut(c); if (STAGE) STAGE.keep = PUT_KEEPOUT; try { yield* buildStackGen(c); } finally { PUT_KEEPOUT = null; } }
  c.topY = c.sections.length ? bucketTop() : CURB; hwFeet(c); mtFeet(c);   // (and the feet of any highway over it)
}
function rebuildCell(c){
  if (STAGE_Q.length || STAGE_READY.length) stageFinishAll();   // (a plot still being built in steps is finished first)
  finishAnimsOn(c);   // a neighbour's edit can rebuild a cell that is still animating
  disposeData(c.data);
  c.height = CURB;
  c.dark = isDarkPlot(c);
  DARK = c.dark;
  SIDE_SPLIT = true;
  try { c.data = drain(collectGen(cellBody(c))); } finally { DARK = false; SIDE_SPLIT = false; }
  rebuildCellPost(c);
}
function rebuildCellPost(c){
  if (pplReady && pplFrame >= 60) c._nvFresh = true;   // (built or changed during play: the never-seen job works these out)
  if (c.liftCab) podDoorSpot(c);
  if (c.mega){ const m = megas.get(c.mega); if (m && m.roofH) c.height = m.roofH; }
  cellView(c);
  c.emitters = c.data.emitters; c.pads = c.data.pads; c.ports = c.data.ports;
  dirtyRegions.add(regKey(c.i, c.j));
}
// ---- plots built in steps (round 8, item 2). One job at a time; between its steps the globals the builders write into are put back as they were, so nothing else that builds
// (a megastructure, a sync edit) can see or spoil a half-made piece. A job that is still running when another edit starts is finished at once (stageFinishAll). ----
// things to do a few frames from now (the police alert's second bike route and the like): later(fn, frames)
const LATER = []; const later = (fn, n = 1) => { if (PH.tests.alertNow || window.__ALERT_NOW) fn(); else LATER.push({ fn, n }); };
function runLater(){ for (let i = 0; i < LATER.length; i++){ const e = LATER[i]; if (--e.n <= 0){ LATER.splice(i--, 1); e.fn(); } } }
let STAGE = null; const STAGE_Q = [], STAGE_READY = []; let FRAME_WORK = 0, SOLID_WAIT = 0;   // (FRAME_WORK: milliseconds of the spread work done this frame, so the region merge, a step of its own, waits for a quieter frame)
let _stageTick = 0;
const stageNow = () => window.__realNow ? ++_stageTick : performance.now();   // (under the test harness, whose clock is scripted, a step budget counts steps, so two runs do the same)
const STAGE_ON = () => !(PH.tests.stageNow || window.__STAGE_NOW);
const FOL_KEYS = Object.keys(SPR.size);
const stageCap = () => ({ R, buckets, emitters, carPads, curPorts, glowList, curSpots, curCover, fol: FOL_KEYS.map(k => FOL_LIST[k]), DARK, SIDE_SPLIT, PUT_KEEPOUT, STAGE });
const stageApply = s => { R = s.R; buckets = s.buckets; emitters = s.emitters; carPads = s.carPads; curPorts = s.curPorts; glowList = s.glowList; curSpots = s.curSpots; curCover = s.curCover;
  for (let q = 0; q < FOL_KEYS.length; q++) FOL_LIST[FOL_KEYS[q]] = s.fol[q]; DARK = s.DARK; SIDE_SPLIT = s.SIDE_SPLIT; PUT_KEEPOUT = s.PUT_KEEPOUT; STAGE = s.STAGE; };
function stageStart(c, onDone){
  const job = { c, onDone, state: null, dark: isDarkPlot(c), keep: null, data: null, gen: null };
  job.gen = (function*(){ job.data = yield* collectGen(cellBody(c)); })();
  STAGE_Q.push(job); return job;
}
function stageSlice(job){   // one step of the job; true when it is finished
  const prev = stageCap();
  if (job.state) stageApply(job.state);
  STAGE = job; DARK = job.dark; SIDE_SPLIT = true; PUT_KEEPOUT = job.keep;
  let r; try { r = job.gen.next(); } finally { job.state = stageCap(); stageApply(prev); }
  return r.done;
}
function stageStep(ms = 4){
  FRAME_WORK = 0;
  if (STAGE_READY.length){ const t0 = stageNow(), j = STAGE_READY.shift(); j.onDone(j.data); FRAME_WORK += stageNow() - t0; return; }   // (finishing a plot, which merges and animates, is a frame of its own)
  const job = STAGE_Q[0]; if (!job) return; const t0 = stageNow();
  for (;;){ if (stageSlice(job)){ STAGE_Q.shift(); STAGE_READY.push(job); break; } if (stageNow() - t0 >= ms) break; }
  FRAME_WORK += stageNow() - t0;
}
// An edit to plot c, built in steps: c first, then whatever its edit makes rebuild (air towers, pods), each only after the one before is in place (they read each other's heights),
// then the air towers once more (as refresh does), and then the rest of refresh. done(prebuilt) runs in the frame after the last step.
function stageChain(c, done){
  const old = { view: c.view, data: c.data }, built = new Map(), todo = refreshTodo([c]);
  const seq = todo.concat(todo.filter(x => airCells.has(x)));
  let k = 0;
  const next = () => {
    if (k >= seq.length){   // all made: put the plots in place and finish the edit as refresh does
      for (const x of built.keys()) if (x !== c){ finishAnimsOn(x); disposeData(x.data); }   // (what rebuildCell does first)
      c.view = null; c.data = null;
      refresh([c], [], built);
      return done({ old });
    }
    const x = seq[k++], job = stageStart(x, data => {
      const prev = built.get(x); if (prev) disposeData(prev.data);   // (an air tower made twice: the first is not used)
      built.set(x, { data, dark: job.dark });
      next();
    });
  };
  next();
}
function stageFinishAll(){
  while (STAGE_READY.length || STAGE_Q.length){
    if (STAGE_READY.length){ const j = STAGE_READY.shift(); j.onDone(j.data); continue; }
    const job = STAGE_Q[0]; while (!stageSlice(job)); STAGE_Q.shift(); job.onDone(job.data);
  }
}
/* ---------- solid geometry merged by region ---------- */
// Every plot and megastructure keeps its own view (one mesh per material), but drawing a big city one building at a
// time costs the processor more than the drawing itself: a few thousand separate draws a frame. So the settled pieces of
// each block (MREG x MREG plots) are merged, per material, into one mesh, and their own meshes are hidden. Only solid,
// opaque pieces drawn in the main layer are merged (see-through ones keep their own order of drawing). A piece being
// swept in or out is left out of its region's merge while it animates, so the sweep draws it as before; regions are
// remade (at the start of the next frame) whenever one of their pieces changes.
const solidRegions = new Map(), solidDirty = new Set(), animCells = new Set();
// (merged in blocks of MREG x MREG plots, smaller than the regions: a block is drawn whole whenever any of it is on screen)
const MREG = 3, mergeKey = (i, j) => Math.floor(i/MREG) + ',' + Math.floor(j/MREG);
const solidAbort = key => { if (SOLID_JOB && SOLID_JOB.key === key) SOLID_JOB = null; };   // (a block changed while it was being merged in steps: that merge is dropped, the block is merged again)
const markSolid = c => { if (c){ const k = mergeKey(c.i, c.j); solidAbort(k); solidDirty.add(k); } };
// every merge block that overlaps a region (REG x REG plots)
function markSolidRegion(rk){ const [a, b] = rk.split(',').map(Number);
  for (let i = Math.floor(a*REG/MREG); i <= Math.floor((a*REG + REG - 1)/MREG); i++) for (let j = Math.floor(b*REG/MREG); j <= Math.floor((b*REG + REG - 1)/MREG); j++){ solidAbort(i + ',' + j); solidDirty.add(i + ',' + j); } }
function flushSolid(){
  flushSuper();
  if (SYNC_NOW()){ solidFinish(); if (solidDirty.size){ for (const k of solidDirty) rebuildSolid(k); solidDirty.clear(); } }
  else if (SOLID_JOB || solidDirty.size) solidStep(Math.max(1, 4 - FRAME_WORK));   // (a block's merge in steps over the frames, after the frame's other spread work)
  ovFlush();
}
const mergeable = o => o.isMesh && !o.isInstancedMesh && (o.layers.mask === 1 || o.layers.mask === STATIC_BIT) && !o.material.transparent && o.geometry.index && !o.userData.noMerge;
// the block's merged meshes taken down (its plots draw one by one again, the same picture)
function solidRemoveOld(key){
  const old = solidRegions.get(key);
  if (old && old.far) for (const m of old.far){ FAR_MESHES.delete(m); m.geometry = m.userData.stdGeo; if (m.userData.farGeo) m.userData.farGeo.dispose(); }   // (the one not held by the mesh is let go here; the other with the group)
  if (old){ SC_DIRTY.quiet++; try { for (const m of old.members) m.visible = !(m.userData.sideOf && m.geometry.userData.full); world.remove(old.group); disposeGroup(old.group); solidRegions.delete(key); } finally { SC_DIRTY.quiet--; } }
  ovForget(key);   // (a walls' mesh stays hidden while its piece is swept: see showHidden)
}
function rebuildSolid(key){ solidFinish(); SC_DIRTY.quiet++; try { drain(rebuildSolidGen(key)); } finally { SC_DIRTY.quiet--; } }
// the same in steps (merging a block is 20 to 80 ms in one piece): a step per attribute, per row of triangles, per material. SOLID_JOB: the block being merged, if any.
let SOLID_JOB = null;
function solidSlice(){ SC_DIRTY.quiet++; try { return SOLID_JOB.gen.next().done; } finally { SC_DIRTY.quiet--; } }
function solidFinish(){ if (SOLID_JOB){ while (!solidSlice()); SOLID_JOB = null; } }
function solidStep(ms){
  if (!SOLID_JOB){ if (!solidDirty.size) return; const k = solidDirty.values().next().value; solidDirty.delete(k); SOLID_JOB = { key: k, gen: rebuildSolidGen(k) }; }
  const t0 = stageNow();
  do { if (solidSlice()){ SOLID_JOB = null; break; } } while (stageNow() - t0 < ms);
  FRAME_WORK += stageNow() - t0;
}
function* rebuildSolidGen(key){
  solidRemoveOld(key);
  const byMat = new Map(), members = [];
  for (const c of [...cells.values(), ...megas.values()]){
    if (!c.view || c.view.parent !== world || !c.view.visible || mergeKey(c.i, c.j) !== key || animCells.has(c)) continue;   // (only views actually on show)
    for (const o of c.view.children) if (mergeable(o) && !o.userData.sideOf){ let l = byMat.get(o.material); if (!l) byMat.set(o.material, l = []); l.push(o); }   // (a walls' mesh goes with its building's)
  }
  if (!byMat.size) return;
  yield;
  const g = new THREE.Group(), farMeshes = [];
  for (const [mat, list] of byMat){
    if (list.length < 2) continue;   // (nothing to gain)
    list.sort((a, b) => a.id - b.id);   // (in the order three would have drawn them one by one: where two pieces meet at exactly the same depth, the same one wins)
    const cutting = list.some(o => o.geometry.userData.cut);
    const merged = cutting ? yield* mergeCutGen(list.map(o => o.geometry)) : yield* mergeIndexedGen(list.map(o => o.geometry)); if (!merged) continue;
    dropCpuCopy(merged);
    let mergedFar = null;
    if (cutting && list.some(o => o.geometry.userData.far)){ mergedFar = yield* mergeCutGen(list.map(o => o.geometry), true, merged); if (mergedFar) dropCpuCopy(mergedFar, true); }   // (the second order, drawn from far away: sharing the corners)
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.userData.blockKey = key;   // (the glow overlay is batched by it: see ovBatch)
    mesh.userData.sortId = list[0].id;   // (drawn where its first piece would have been: see the opaque sort below)
    if (merged.userData.shown !== undefined){ mesh.onBeforeRender = hideBefore; mesh.onAfterRender = hideAfter; }
    g.add(mesh);
    if (cutting){ mesh.onBeforeRender = cutBefore; mesh.onAfterRender = cutAfter; const sm = sideMesh(mesh); sm.userData.sortId = list[0].userData.side ? list[0].userData.side.id : list[0].id; g.add(sm);
      if (mergedFar){ for (const o of [mesh, sm]){ o.userData.stdGeo = merged; o.userData.farGeo = mergedFar; farMeshes.push(o); FAR_MESHES.add(o); } FARM.stamp++; } }
    for (const o of list){ o.visible = false; members.push(o); if (o.userData.side){ o.userData.side.visible = false; members.push(o.userData.side); } }
  }
  if (!g.children.length) return;
  yield;
  world.add(freezeTree(g)); solidRegions.set(key, { group: g, members, far: farMeshes });
}
// A region's merged geometry is read by nothing once it is on the card (the merge copies from the plots' own geometry, which stays; picking tests boxes; the glow overlay is cut from it before the first draw),
// so its CPU arrays are let go right after their upload: they were 1.2 GB of the 3 GB heap in the biggest city. (Overlay test "keep the CPU copies of merged geometry" switches it off.)
function dropCpuCopy(geo, indexOnly = false){
  if (PH.tests.keepCpu || window.__KEEP_CPU) return;
  if (geo.index) geo.userData.bpe = geo.index.array.BYTES_PER_ELEMENT;
  const free = function(){ this.array = null; };
  if (!indexOnly) for (const n in geo.attributes) geo.attributes[n].onUpload(free);
  if (geo.index) geo.index.onUpload(free);
}
// Indexed geometries joined into one: corners one after another, and the triangles of all of them, the ones shown first
// (each piece's in order), then the hidden ones (see hideCovered). Null if they don't share the same attributes.
function mergeIndexed(geos){ return drain(mergeIndexedGen(geos)); }
function* mergeIndexedGen(geos){
  const names = Object.keys(geos[0].attributes);
  for (const g of geos) if (Object.keys(g.attributes).length !== names.length || names.some(n => !g.attributes[n] || g.attributes[n].itemSize !== geos[0].attributes[n].itemSize || g.attributes[n].normalized !== geos[0].attributes[n].normalized || g.attributes[n].array.constructor !== geos[0].attributes[n].array.constructor)) return null;
  let nv = 0, ni = 0, nh = 0;
  for (const g of geos){ nv += g.attributes.position.count; ni += g.index.count; nh += g.index.count - (g.userData.shown ?? g.index.count); }
  const out = new THREE.BufferGeometry();
  for (const n of names){ const a0 = geos[0].attributes[n], arr = new a0.array.constructor(nv*a0.itemSize); let o = 0;
    for (const g of geos){ const a = g.attributes[n].array; arr.set(a, o); o += a.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized)); yield; }
  const ix = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let k = 0, kh = ni - nh, base = 0;
  for (const g of geos){ const I = g.index.array, sh = g.userData.shown ?? I.length;
    for (let q = 0; q < sh; q++) ix[k++] = I[q] + base;
    for (let q = sh; q < I.length; q++) ix[kh++] = I[q] + base;
    base += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  if (nh) out.userData.shown = ni - nh;
  out.computeBoundingSphere();
  return out;
}
// Building geometries joined in the A/H/S/D order (sideArc): every piece's A, every piece's H, then each wall slice of
// every piece in turn, then slices 0 to 3 again. (A piece without the order counts as all A, and its hidden ones as H.)
function mergeCut(geos){ return drain(mergeCutGen(geos)); }
function* mergeCutGen(geos, far = false, shared = null){
  const names = Object.keys(geos[0].attributes);
  for (const g of geos) if (Object.keys(g.attributes).length !== names.length || names.some(n => !g.attributes[n] || g.attributes[n].itemSize !== geos[0].attributes[n].itemSize || g.attributes[n].normalized !== geos[0].attributes[n].normalized || g.attributes[n].array.constructor !== geos[0].attributes[n].array.constructor)) return null;
  let nv = 0; for (const g of geos) nv += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const n of names){
    if (shared){ out.setAttribute(n, shared.attributes[n]); continue; }   // (the second order of a block uses the first one's corners)
    const a0 = geos[0].attributes[n], arr = new a0.array.constructor(nv*a0.itemSize); let o = 0;
    for (const g of geos){ const a = g.attributes[n].array; arr.set(a, o); o += a.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized)); yield; }
  const seg = g => { const fo = far && g.userData.far, I = fo ? fo.ix : g.index.array, u = fo ? fo.cut : g.userData.cut;
    if (u){ const base = u.A + u.H, r = { I, u, a: [0, u.A], h: [u.A, base], s: u.off.map(x => base + x), t: new Array(SIDE_K + 1).fill(0) };
      if (u.offT){ const bt = base + u.off[SIDE_K]; r.t = u.offT.map(x => bt + x); } return r; }
    const sh = g.userData.shown ?? I.length; return { I, u: null, a: [0, sh], h: [sh, I.length], s: new Array(SIDE_K + 1).fill(I.length), t: new Array(SIDE_K + 1).fill(0) }; };
  const parts = geos.map(seg);
  let nA = 0, nH = 0; const nB = new Array(SIDE_K).fill(0), nT = new Array(SIDE_K).fill(0);
  for (const p of parts){ nA += p.a[1] - p.a[0]; nH += p.h[1] - p.h[0]; for (let k = 0; k < SIDE_K; k++){ nB[k] += p.s[k + 1] - p.s[k]; nT[k] += p.t[k + 1] - p.t[k]; } }
  const off = [0]; for (let k = 0; k < SIDE_K; k++) off.push(off[k] + nB[k]);
  const offT = [0]; for (let k = 0; k < SIDE_K; k++) offT.push(offT[k] + (far ? nT[k] : 0));
  const n = nA + nH + off[SIDE_K] + offT[SIDE_K] + off[SIDE_K/2] + offT[SIDE_K/2], ix = nv > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let k = 0;
  // where each piece's own triangles landed, row by row (row 0: A; rows 1 to K: the wall slices; then slices 0 to K/2 - 1 again; for the far order the sticks' walls and their first half again), and its box:
  // what lets a frame draw only the pieces that are on screen (see cullPieces)
  const RT0 = 1 + SIDE_K + SIDE_K/2, nP = geos.length, rows = far ? RT0 + SIDE_K + SIDE_K/2 : RT0, rowS = new Int32Array(rows*nP), rowN = new Int32Array(rows*nP), box = new Float32Array(nP*6);
  const rowC = new Int32Array(rows*nP*SMALL_N);   // (per piece and row: how many triangles are at least each size)
  const srcRow = row => row <= SIDE_K ? row : row < RT0 ? row - SIDE_K : row < RT0 + SIDE_K ? SIDE_K + 1 + (row - RT0) : SIDE_K + 1 + (row - RT0 - SIDE_K);
  const put = (lo, row) => { let base = 0; parts.forEach((p, gi) => { const I = p.I, r = typeof lo === 'function' ? lo(p) : null; const [x, y] = r || [p[lo][0], p[lo][1]];
    if (row >= 0){ rowS[row*nP + gi] = k; rowN[row*nP + gi] = y - x;
      const src = srcRow(row), cu = p.u, o = (row*nP + gi)*SMALL_N;
      for (let l = 0; l < SMALL_N; l++) rowC[o + l] = cu && cu.cls ? (src*SMALL_N + l < cu.cls.length ? cu.cls[src*SMALL_N + l] : 0) : y - x; }
    for (let q = x; q < y; q++) ix[k++] = I[q] + base; base += geos[gi].attributes.position.count; }); };
  put('a', 0); put('h', -1); yield;
  for (let j = 0; j < SIDE_K; j++){ put(p => [p.s[j], p.s[j + 1]], 1 + j); if (j % 4 === 3) yield; }
  if (far) for (let j = 0; j < SIDE_K; j++){ put(p => [p.t[j], p.t[j + 1]], RT0 + j); if (j % 4 === 3) yield; }
  for (let j = 0; j < SIDE_K/2; j++){ put(p => [p.s[j], p.s[j + 1]], 1 + SIDE_K + j); if (j % 4 === 3) yield; }
  if (far) for (let j = 0; j < SIDE_K/2; j++) put(p => [p.t[j], p.t[j + 1]], RT0 + SIDE_K + j);
  if (shared) for (let q = 0; q < nP; q++){ const o = shared.userData.pcs ? shared.userData.pcs.box : null; if (o) box.set(o.subarray(q*6, q*6 + 6), q*6); }
  else geos.forEach((g, gi) => { const P = g.attributes.position.array; let x0 = 1e30, x1 = -1e30, y0 = 1e30, y1 = -1e30, z0 = 1e30, z1 = -1e30;
    for (let q = 0; q < P.length; q += 3){ const x = P[q], y = P[q + 1], z = P[q + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    box.set([x0, x1, y0, y1, z0, z1], gi*6); });
  yield;
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  const sTot = off[SIDE_K] + offT[SIDE_K];
  out.userData.cut = far ? { A: nA, H: nH, S: sTot, off, offT, far: true } : { A: nA, H: nH, S: off[SIDE_K], off }; out.setDrawRange(0, nA + nH + sTot);
  if (nP > 1) out.userData.pcs = { n: nP, rowS, rowN, rowC, box, stamp: -1, vis: new Uint8Array(nP), seen: 0, far };
  if (shared && shared.boundingSphere) out.boundingSphere = shared.boundingSphere.clone(); else out.computeBoundingSphere();
  return out;
}
// three's own order for solid things (by layer group, render order, shader, material, distance, then creation), except that
// a region's merged mesh takes the place of the first of its pieces
// (and whatever doesn't write the normal image after everything that does: see mrtBegin in sky.js)
const mrtLast = r => mrtWants(r.object, r.material) ? 0 : 1;
// (the overlay's test: cut-out sprites, which throw pixels away, after every plain solid draw; see perfhud.js)
const cutLast = r => PH.tests.cutoutsLast && r.material.userData.cutout ? 1 : 0;
renderer.setOpaqueSort((a, b) => a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder : MRT && mrtLast(a) !== mrtLast(b) ? mrtLast(a) - mrtLast(b) : cutLast(a) !== cutLast(b) ? cutLast(a) - cutLast(b) : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder
  : a.program !== b.program ? a.program.id - b.program.id : a.material.id !== b.material.id ? a.material.id - b.material.id : a.z !== b.z ? a.z - b.z
  : (a.object.userData.sortId ?? a.id) - (b.object.userData.sortId ?? b.id));
// and likewise for see-through things (three's order: layer group, render order, distance back to front, creation)
renderer.setTransparentSort((a, b) => a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder
  : a.z !== b.z ? b.z - a.z : (a.object.userData.sortId ?? a.id) - (b.object.userData.sortId ?? b.id));
function rebuildRegion(key){
  const old = regions.get(key);
  superDirty.add('r' + superKey(key));
  if (old){ disposeGroup(old); regions.delete(key); }
  const datas = [...cells.values(), ...megas.values()].filter(c => c.data && regKey(c.i, c.j) === key).map(c => c.data);
  if (!datas.length) return;
  regions.set(key, batchGroup(datas, false));   // (not drawn itself: see the super-regions below)
}
// Super-regions. Each region's plants and glows (and those of each region's bridges and walkways, below) are still
// worked out on their own, at the same moments as before (so the flicker each light is given, and when a new piece's
// plants appear, are unchanged), but they are drawn SREG x SREG regions at a time: one batch per kind of thing instead
// of one per region. Plants and glows are drawn whole wherever the view is (they aren't culled), so a bigger batch draws
// nothing more; it only costs fewer draw calls.
const SREG = 4, superRegions = new Map(), superDirty = new Set();
const superKey = rk => { const c = rk.indexOf(','); return Math.floor(+rk.slice(0, c)/SREG) + ',' + Math.floor(+rk.slice(c + 1)/SREG); };
function flushSuper(){
  if (!superDirty.size) return;
  const once = !SYNC_NOW(), todo = once ? [superDirty.values().next().value] : superDirty;
  for (const sk of todo){
    const old = superRegions.get(sk);
    if (old){ world.remove(old); disposeMerged(old); superRegions.delete(sk); }
    const src = sk[0] === 'r' ? [...regions].map(([k, g]) => [k, g]) : [...connRegions].map(([k, r]) => [k, r.group]), key = sk.slice(1);
    const groups = src.filter(([k]) => superKey(k) === key).map(([, g]) => g);
    if (!groups.length) continue;
    const g = mergeLeaves(groups); world.add(freezeTree(g)); superRegions.set(sk, g);
  }
  if (once) superDirty.delete(todo[0]); else superDirty.clear();
}
// geometry a merged batch made itself is freed with it; geometry it shares with a region's own batch is not
function disposeMerged(g){ g.traverse(o => { if ((o.isMesh || o.isPoints) && o.userData.own) o.geometry.dispose(); }); }
// Everything drawn in some region batches, joined: one object per kind (plain mesh per material and settings, plant
// instances, glow points per layer), in the regions' order.
function mergeLeaves(groups){
  const cls = new Map();
  groups.forEach((grp, gi) => grp.traverse(o => {
    if (!(o.isMesh || o.isPoints)) return;
    // (what is culled to the view, the bridges and walkways themselves, stays a mesh per region: a bigger one would be
    // drawn whenever any of it is on screen, all of it, and close up that is a lot of geometry out of sight)
    const k = (o.isInstancedMesh ? 'I' : o.isPoints ? 'P' : 'M') + o.material.id + '|' + o.layers.mask + '|' + o.renderOrder + '|' + o.castShadow + '|' + o.receiveShadow + '|' + (o.frustumCulled ? 'cull' + gi : '');
    let l = cls.get(k); if (!l) cls.set(k, l = []); l.push(o);
  }));
  const out = new THREE.Group();
  for (const list of cls.values()){
    const o0 = list[0]; let obj;
    if (list.length === 1){
      obj = o0.isInstancedMesh ? new THREE.InstancedMesh(o0.geometry, o0.material, o0.count) : o0.isPoints ? new THREE.Points(o0.geometry, o0.material) : new THREE.Mesh(o0.geometry, o0.material);
      if (o0.isInstancedMesh) obj.instanceMatrix = o0.instanceMatrix;
    } else if (o0.isInstancedMesh){
      const geo = new THREE.BufferGeometry(), g0 = o0.geometry;
      for (const n in g0.attributes){ const a = g0.attributes[n]; if (!a.isInstancedBufferAttribute) geo.setAttribute(n, a); }
      if (g0.index) geo.setIndex(g0.index);
      let n = 0; for (const o of list) n += o.count;
      for (const nm in g0.attributes){ const a0 = g0.attributes[nm]; if (!a0.isInstancedBufferAttribute) continue;
        const arr = new a0.array.constructor(n*a0.itemSize); let q = 0; for (const o of list){ const a = o.geometry.attributes[nm]; arr.set(a.array.subarray(0, o.count*a0.itemSize), q); q += o.count*a0.itemSize; }
        geo.setAttribute(nm, new THREE.InstancedBufferAttribute(arr, a0.itemSize, a0.normalized)); }
      obj = new THREE.InstancedMesh(geo, o0.material, n); let q = 0;
      for (const o of list){ obj.instanceMatrix.array.set(o.instanceMatrix.array.subarray(0, o.count*16), q); q += o.count*16; }
      obj.userData.own = true;
    } else {
      const geos = list.map(o => o.geometry), names = Object.keys(geos[0].attributes), geo = new THREE.BufferGeometry();
      const idx = !!geos[0].index;
      let nv = 0, ni = 0; for (const g of geos){ nv += g.attributes.position.count; if (idx) ni += g.index.count; }
      for (const nm of names){ const a0 = geos[0].attributes[nm], arr = new a0.array.constructor(nv*a0.itemSize); let q = 0;
        for (const g of geos){ arr.set(g.attributes[nm].array, q); q += g.attributes[nm].array.length; }
        geo.setAttribute(nm, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized)); }
      if (idx){ const ix = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let k = 0, base = 0;
        for (const g of geos){ const I = g.index.array; for (let q = 0; q < I.length; q++) ix[k++] = I[q] + base; base += g.attributes.position.count; }
        geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
      geo.computeBoundingSphere();
      obj = o0.isPoints ? new THREE.Points(geo, o0.material) : new THREE.Mesh(geo, o0.material); obj.userData.own = true;
    }
    obj.userData.sortId = Math.min(...list.map(o => o.userData.sortId ?? o.id));   // (drawn in the order its first piece would have been: see the sorts below)
    obj.layers.mask = o0.layers.mask; obj.renderOrder = o0.renderOrder; obj.castShadow = o0.castShadow; obj.receiveShadow = o0.receiveShadow; obj.frustumCulled = o0.frustumCulled;
    out.add(obj);
  }
  return out;
}
// Bridges and lines between neighbours: each pair is generated once and cached until either side changes
const pairCache = new Map();
// pairs are batched by region too, and a region's batch is only redone when its set of pairs changed
const connRegions = new Map();
function rebuildConnections(){
  const lots = [...cells.values()].filter(c => c.sections.length && !c.lift)
    .map(c => ({ i: c.i, j: c.j, style: c.sections[0].style, x: c.x, z: c.z, cls: c.sections[0].zone, height: c.sectionTops[0], base: CURB, firstFloors: c.firstFloors, floors: c.firstFloors }));
  const used = new Set(), byReg = new Map();
  for (const [a,b] of neighbors(lots)){
    const key = [a.x, a.z, b.x, b.z, a.height, b.height, a.cls, b.cls, a.firstFloors, b.firstFloors].map(v => typeof v === 'number' ? v.toFixed(2) : v).join('|') + '|' + JSON.stringify(a.style || DEFAULT_STYLE);
    used.add(key);
    let d = pairCache.get(key);
    if (!d){ CONV_SINK = []; d = collect(() => withStyle(a.style, () => connectPair(a, b))); d.conv = CONV_SINK; CONV_SINK = null; pairCache.set(key, d); }
    const rk = regKey(a.i, a.j);
    let r = byReg.get(rk); if (!r) byReg.set(rk, r = { keys: [], datas: [] });
    r.keys.push(key); r.datas.push(d);
  }
  for (const [rk, cr] of connRegions) if (!byReg.has(rk)){ disposeGroup(cr.group); connRegions.delete(rk); superDirty.add('c' + superKey(rk)); }
  for (const [rk, r] of byReg){
    const sig = r.keys.join('#'), cr = connRegions.get(rk);
    if (cr && cr.sig === sig) continue;
    if (cr) disposeGroup(cr.group);
    connRegions.set(rk, { sig, group: batchGroup(r.datas) }); superDirty.add('c' + superKey(rk));   // (drawn in its super-region)
  }
  for (const [k, d] of pairCache) if (!used.has(k)){ disposeData(d); pairCache.delete(k); }
  setConveyors([...pairCache.values()].flatMap(d => d.conv || []));
}
// a dock near the middle of the view, for drones that need a new home
function nearPort(){
  if (!ports.length) return undefined;
  const dd = p => (p.pad.x - camGoal.x)**2 + (p.pad.z - camGoal.z)**2;
  const near = ports.slice().sort((a, b) => dd(a) - dd(b)).slice(0, 10);
  return near[Math.floor(Math.random()*near.length)];
}
// after any change: refresh steam, drone perches, landing pads, traffic heights, framing
function syncAgents(){ syncAgentsA(); syncSteamMap(); syncPeople(); syncAgentsEnd(); }
function syncAgentsA(){
  ports = []; carPads = []; emitters = [];
  for (const c of cells.values()){ ports.push(...c.ports); carPads.push(...c.pads); emitters.push(...c.emitters); }
  for (const m of megas.values()) if (m.data) emitters.push(...m.data.emitters);
  for (const m of megas.values()) if (m.data && m.data.ports) ports.push(...m.data.ports);   // e.g. the logistics hub's drone bays   // e.g. steam off the food carts
  for (const d of pairCache.values()) if (d.emitters) emitters.push(...d.emitters);   // steam leaking from the pipework between buildings
  portLots = [...cells.values()].map(c => ({ x: c.x, z: c.z, height: c.height }));
  VENTS = [...cells.values()].filter(c => c.vent).map(c => c.vent);   // steam vents, for the mist
  setupSteam();
  for (const d of drones) if (!ports.includes(d.at) || (d.phase !== 'inside' && !ports.includes(d.to))){
    d.phase = 'inside'; d.g.visible = false; d.at = nearPort(); d.timer = 1 + Math.random()*2;
  }
  for (const c of tripCars) if (c.pad && !carPads.includes(c.pad)){ c.pad = null; c.phase = 'away'; c.g.visible = false; c.timer = 2 + Math.random()*4; }
  let top = 6; for (const c of cells.values()) if (c.height > top) top = c.height;
  for (const m of megas.values()) if (m.top > top) top = m.top;
  skyTop = top + 2.4;
}
// the steam map (vents for the mist, lift pads for their shimmer), a few vents a frame when the upkeep is spread
let STEAM_JOB = null;
const steamArgs = () => [VENTS, [...cells.values()].flatMap(c => c.lifts || [])];
function syncSteamMap(){ makeSteamMap(...steamArgs()); }
function syncSteamStep(ms){ if (!STEAM_JOB) STEAM_JOB = makeSteamMapGen(...steamArgs()); const t0 = stageNow(); do { if (STEAM_JOB.next().done){ STEAM_JOB = null; return true; } } while (stageNow() - t0 < ms); return false; }
function syncAgentsEnd(){
  shadowDirty = true;
  save();
}
// What an edit leaves to do after its own plots are built (the bridges between neighbors, the steam map, the walking network, residents, jobs, bots, saving the city) is a
// whole-city rebuild of 150 to 400 ms. Done at once it froze the frame the piece was placed in; now it runs a stage a frame while the sweep-in animation plays (the piece's own plots are built at
// once). A new edit restarts the stages (each one rebuilds from the cities' cells, so a repeat is safe). Loading, and the overlay test "edit upkeep in the same frame", do it all at once.
let SYNC_Q = null;
const SYNC_STAGES = [() => rebuildConnections(), () => syncAgentsA(), ms => syncSteamStep(ms), ms => syncPeopleNetStep(ms), ms => syncPeopleRestStep(ms), () => syncAgentsEnd()];
const SYNC_NOW = () => !!(PH.tests.syncNow || window.__SYNC_NOW) || !pplReady || pplFrame < 60;   // (the first second of a session is loading)
function queueSync(){ SYNC_Q = 0; syncPeopleAbort(); STEAM_JOB = null; }
function stepSync(ms = 3){ if (SYNC_Q === null) return; const q = SYNC_Q, t0 = stageNow();
  const r = SYNC_STAGES[q](Math.max(1, ms - FRAME_WORK)); FRAME_WORK += stageNow() - t0; if (r === false) return; SYNC_Q = q + 1 >= SYNC_STAGES.length ? null : q + 1; }   // (a stage is a frame's work, or several frames' for the walking network and the residents: those answer false until they are done)
function finishSync(){ while (SYNC_Q !== null){ const q = SYNC_Q; const r = SYNC_STAGES[q](Infinity); if (r === false) continue; SYNC_Q = q + 1 >= SYNC_STAGES.length ? null : q + 1; } }
// the middle of everything built: where the camera starts, and where H jumps back to
function centerView(now = false){
  let x = 0, z = 0, n = 0;
  for (const c of cells.values()){ x += c.x; z += c.z; n++; }
  if (n) camGoal.set(x/n, TARGET_Y, z/n); else camGoal.set(0, TARGET_Y, 0);
  if (now) camT.copy(camGoal);
}
// Parks: lawn plots that touch each other side to side form a green; a green of four or more is a park, and its
// plots get the park lamps. Worked out over the whole island before every rebuild, and any plot whose status
// changed is rebuilt too (so painting the fourth tile lights up the other three).
function parkCells(){
  const changed = [], seen = new Set();
  for (const c of cells.values()){
    if (seen.has(c)) continue;
    const lawnish = q => q && !q.mega && !q.sections.length && q.green === 'grass';
    if (!lawnish(c)){ seen.add(c); if (c.park){ c.park = false; changed.push(c); } continue; }
    const group = [c], stack = [c]; seen.add(c);
    while (stack.length){ const q = stack.pop(); for (const [a, b] of SIDES4){ const n = cells.get(ckey(q.i + a, q.j + b)); if (n && !seen.has(n) && lawnish(n)){ seen.add(n); group.push(n); stack.push(n); } } }
    const park = group.length >= 4;
    for (const q of group) if (!!q.park !== park){ q.park = park; changed.push(q); }
  }
  return changed;
}
// the plots an edit to these must rebuild (the plots themselves, a park's, an air-filter hologram's tower, a side pod hanging on them), the pods last
function refreshTodo(list, megaList = []){
  list = list.concat(parkCells());
  // an air-filter hologram hangs over the plots in front of its tower, so a change next door rebuilds the tower too
  for (const a of airCells){
    if (cells.get(ckey(a.i, a.j)) !== a){ airCells.delete(a); continue; }
    const near = c => c && c !== a && Math.abs(c.i - a.i) <= 1 && Math.abs(c.j - a.j) <= 1;
    if (list.some(near) || megaList.some(m => (m.cells || []).some(near))) list.push(a);
  }
  // a side pod's walkways go to the neighbours tall enough to reach: a change next door rebuilds the pod, after the neighbour
  for (const c of [...list]) if (c) for (const [a, b] of SIDES4){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n && n.lift) list.push(n); }
  return [...new Set(list)].filter(Boolean).sort((p, q) => (p.lift ? 1 : 0) - (q.lift ? 1 : 0));
}
function refresh(list, megaList = [], prebuilt = null){
  if (!prebuilt && (STAGE_Q.length || STAGE_READY.length)) stageFinishAll();
  const todo = refreshTodo(list, megaList);
  for (const c of todo){ if (prebuilt && prebuilt.has(c)){ c.dark = prebuilt.get(c).dark; c.data = prebuilt.get(c).data; rebuildCellPost(c); } else rebuildCell(c); }
  // an air-filter tower picks its face from its neighbours' heights, so if one of them was only built after it in this
  // pass (loading a saved city builds every plot in one go), build the tower again now that they all stand
  if (!prebuilt) for (const c of todo) if (airCells.has(c) && !anims.some(a => a.c === c)) rebuildCell(c);
  for (const m of megaList) rebuildMega(m);
  for (const k of dirtyRegions){ markSolidRegion(k); if (heldRegions.has(k)) pendingRegions.add(k); else rebuildRegion(k); } dirtyRegions.clear();
  if (SYNC_NOW()) { rebuildConnections(); syncAgents(); } else { queueSync(); shadowDirty = true; }   // (after a player's edit the rest is done a stage a frame: see queueSync)
}
function rebuildAll(){ refresh([...cells.values()], [...megas.values()]); }

/* ---------- edits ---------- */
const newCell = (i, j, sections = []) => ({ i, j, x: i*LOT, z: j*LOT, green: GREEN_DEFAULT, sections, sectionTops: [], firstFloors: 2, group: null, height: CURB, ports: [], pads: [], emitters: [] });
// Every edit plays out as a short animation (see "build and remove animations" below): the old look of the
// cell is kept aside, the new one is built, and a glowing outline and scan line sweep between them.
const PLAT_BOTTOM = -5.6;
function addPlatform(i, j, zone = null){
  if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX || cells.has(ckey(i,j))) return null;
  const c = newCell(i, j, zone ? [{ zone, seed: (Math.random()*1e9)|0, style: styleNow() }] : []);
  c.style = styleNow();
  cells.set(ckey(i,j), c);
  holdRegion(c);
  refresh([c, ...SIDES4.map(([a,b]) => cells.get(ckey(i+a, j+b)))]);
  startAnim(c, 'build', PLAT_BOTTOM, c.height + 1.2, zone, zone ? SIDE : LOT, null);
  if (zone) maybeSpawnMegas(c);
  return c;
}
function removePlatform(c){
  if (c.sections.length) return;
  finishAnimsOn(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  cells.delete(ckey(c.i, c.j)); dirtyRegions.add(regKey(c.i, c.j));
  refresh(SIDES4.map(([a,b]) => cells.get(ckey(c.i+a, c.j+b))));
  startAnim(c, 'remove', PLAT_BOTTOM, CURB + 1.4, null, LOT, old);
}
const MAX_SECTIONS = 4, MAX_HEIGHT = 24;
function addSection(c, zone){
  stageFinishAll();
  if (c.sections.length >= MAX_SECTIONS || c.height > MAX_HEIGHT) return;
  finishAnimsOn(c);
  const y0 = c.sections.length ? c.height : CURB;
  // under a highway: only as many floors as fit beneath it (a section that still reaches it is built a floor or two shorter)
  const cap = hwCap(c), sec = { zone, seed: (Math.random()*1e9)|0, style: styleNow() };
  if (cap !== null){ const f = Math.floor((cap - y0 - (c.sections.length ? .1 : 0) + .02)/FH); if (f < 1) return; sec.mf = f; }
  holdRegion(c);
  if (cap === null && !c.lift && STAGE_ON()){
    // the piece is made in steps over the next frames; the plot keeps its old look until it is ready, then the sweep builds the new one (the edit's own frame is a few milliseconds)
    c.sections.push(sec);
    stageChain(c, prebuilt => {
      const old = { view: prebuilt.old.view, data: prebuilt.old.data };
      dropView(old);
      startAnim(c, 'build', y0 - .05, c.height + 1.2, zone, SIDE, null);
      later(() => maybeSpawnMegas(c), 1);   // (a megastructure arriving is a build of its own: a frame of its own)
    });
    return;
  }
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.push(sec);
  if (cap !== null){
    for (let tries = 0; tries < 8; tries++){
      rebuildCell(c); disposeData(c.data); c.data = null;
      if (c.topY <= cap) break;                                  // (measured on the real geometry: antennas, tanks and signs count)
      if (sec.mf <= 1) break;
      sec.mf = Math.max(1, sec.mf - Math.max(1, Math.ceil((c.topY - cap)/FH)));
    }
    if (c.topY > cap) c.sections.pop();
  }
  refresh([c]);
  dropView(old);   // the new look already contains everything below the new section
  if (!c.sections.includes(sec)){ releaseRegion(regKey(c.i, c.j)); return; }   // (it wouldn't fit under the highway)
  startAnim(c, 'build', y0 - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c);
}
// hang a pod off the side of a taller building, over the empty plot c, its deck at height y
function addLift(c, y, zone){
  stageFinishAll();
  if (!c || c.mega || c.lift || hwAt(c.i, c.j).length || mtAt(c.i, c.j).length) return null;   // (not under a highway or the metro)
  if (c.sections.length && y < c.height + FH - .05) return null;   // over a shorter building: a floor's gap at least
  finishAnimsOn(c);
  holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  if (c.sections.length){ c.below = c.sections; c.sections = []; }   // the building already there stays, under the pod
  c.lift = { y };
  c.sections.push({ zone, seed: (Math.random()*1e9)|0, style: styleNow() });
  if (c.below){ rebuildCell(c); disposeData(c.data); c.data = null; if (c.belowTop > c.lift.y - GAP_MERGE) c.lift.y = c.belowTop + FH; }   // its roof flattened for the scaffold may sit a touch differently
  refresh([c]);
  dropView(old);
  startAnim(c, 'build', c.below ? (c.belowTop ?? CURB) - .05 : CURB - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c);
  return c;
}
// the gap a pod needs under it; less than this and the pod and the building under it become one building
const GAP_MERGE = .85;
const groundTop = c => c.below && c.below.length ? (c.belowTop ?? CURB) : CURB;
function mergePod(c){ c.sections = (c.below || []).concat(c.sections); c.sections.forEach(s => { delete s.kh; }); c.below = null; c.lift = null; }
// a pod grows a section downward: the new section hangs under it, and the pod's deck drops by its height
function addPodDown(c, zone){
  if (!c.lift || c.sections.length >= MAX_SECTIONS) return null;
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.forEach((s, k) => { if (s.kh === undefined) s.kh = k; });
  const y0 = c.lift.y, gapF = Math.floor((y0 - groundTop(c) - (c.below && c.below.length ? .1 : 0) + .02)/FH);
  const sec = { zone, seed: (Math.random()*1e9)|0, style: styleNow(), kh: -1 - c.sections.length, mf: Math.max(1, gapF >= 2 ? gapF - 1 : gapF) };   // leaves a floor's gap, or fills the last one
  c.sections.unshift(sec);
  let h = 0;
  for (let tries = 0; tries < 4; tries++){
    rebuildCell(c); disposeData(c.data); c.data = null;          // a build to measure the new section
    h = c.sectionTops[0] - y0;
    const over = groundTop(c) + GAP_MERGE - (y0 - h);
    if (gapF < 2 || over <= 0 || sec.mf <= 1) break;
    sec.mf = Math.max(1, sec.mf - Math.ceil(over/FH));
  }
  const ny = y0 - h;
  if (gapF < 2 || ny - groundTop(c) < GAP_MERGE) mergePod(c); else c.lift.y = ny;
  refresh([c]); dropView(old);
  startAnim(c, 'build', CURB - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c); return c;
}
// a building on the ground under a pod (or a section more on it): if it reaches up to the pod, the two become one
function addBelowUp(c, zone){
  if (!c.lift) return null;
  if ((c.below || []).length >= MAX_SECTIONS) return null;
  finishAnimsOn(c); holdRegion(c);
  const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  const y0 = groundTop(c), deck = c.below && c.below.length ? .1 : 0, gapF = Math.floor((c.lift.y - y0 - deck + .02)/FH);   // whole floors of room (a section on another stands on a thin deck)
  const sec = { zone, seed: (Math.random()*1e9)|0, style: styleNow(), mf: Math.max(1, gapF >= 2 ? gapF - 1 : gapF) };
  (c.below = c.below || []).push(sec);
  // build it; if it still reaches into the gap (a section under it can be re-rolled taller), try it a floor or two shorter
  for (let tries = 0; tries < 4; tries++){
    rebuildCell(c); disposeData(c.data); c.data = null;
    const over = c.belowTop - (c.lift.y - GAP_MERGE);
    if (gapF < 2 || over <= 0 || sec.mf <= 1) break;
    sec.mf = Math.max(1, sec.mf - Math.ceil(over/FH));
  }
  if (gapF < 2 || c.belowTop > c.lift.y - GAP_MERGE) mergePod(c);
  refresh([c]); dropView(old);
  startAnim(c, 'build', y0 - .05, c.height + 1.2, zone, SIDE, null);
  maybeSpawnMegas(c); return c;
}
function removeBelow(c){
  if (!c.below || !c.below.length) return;
  finishAnimsOn(c);
  const top = c.belowTop ?? CURB, zone = c.below[c.below.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.below.pop(); if (!c.below.length) c.below = null;
  refresh([c]);
  startAnim(c, 'remove', groundTop(c) - .05, top + 1.2, zone, SIDE, old);
}
function removeSection(c){
  if (!c.sections.length) return removePlatform(c);
  finishAnimsOn(c);
  const top = c.height, zone = c.sections[c.sections.length - 1].zone, old = { view: c.view, data: c.data }; c.view = null; c.data = null;
  c.sections.pop(); if (!c.sections.length){ c.lift = null; if (c.below){ c.sections = c.below; c.below = null; } }   // the last of a pod takes its scaffold with it (and a building under it stays)
  refresh([c]);
  startAnim(c, 'remove', (c.sections.length ? c.height : CURB) - .05, top + 1.2, zone, SIDE, old);
}
// Delete mode: everything in a block of plots goes at once: megastructures that reach into it (whole), and every
// plot in it, buildings and platform alike, each with the removal sweep. One rebuild for the lot at the end.
function removeArea(r){
  const inR = (i, j) => i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1;
  for (const m of [...megas.values()]) if (m.i <= r.i1 && m.i + m.w - 1 >= r.i0 && m.j <= r.j1 && m.j + m.h - 1 >= r.j0) removeMega(m);
  const gone = [], touched = new Set();
  for (const c of [...cells.values()]){
    if (!inR(c.i, c.j) || c.mega) continue;
    finishAnimsOn(c);
    const top = c.sections.length ? c.height : CURB, zone = c.sections.length ? c.sections[0].zone : null;
    const old = { view: c.view, data: c.data }; c.view = null; c.data = null;
    cells.delete(ckey(c.i, c.j)); dirtyRegions.add(regKey(c.i, c.j)); gone.push(c);
    startAnim(c, 'remove', PLAT_BOTTOM, top + 1.4, zone, LOT, old);
  }
  for (const c of gone) for (const [a, b] of SIDES4){ const n = cells.get(ckey(c.i + a, c.j + b)); if (n) touched.add(n); }
  if (gone.length){ refresh([...touched]); save(); sfx.play('remove'); }
  return gone.length;
}
// the selection in delete mode: a red patch over the plots, with an outline
const selFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI/2), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: .26, depthTest: false, depthWrite: false }));
const selEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff4a5a, transparent: true, opacity: .95, depthTest: false }));
for (const o of [selFill, selEdge]){ o.layers.set(1); o.renderOrder = 999; o.visible = false; scene.add(o); }
function showAreaSel(r){
  if (!r){ selFill.visible = selEdge.visible = false; return; }
  const x = (r.i0 + r.i1)/2*LOT, z = (r.j0 + r.j1)/2*LOT, sx = (r.i1 - r.i0 + 1)*LOT - .2, sz = (r.j1 - r.j0 + 1)*LOT - .2;
  let top = CURB; for (const c of cells.values()) if (c.i >= r.i0 && c.i <= r.i1 && c.j >= r.j0 && c.j <= r.j1) top = Math.max(top, c.height);
  selFill.position.set(x, CURB + .09, z); selFill.scale.set(sx, 1, sz);
  const h = Math.min(top + .6, 30) + .7;
  selEdge.position.set(x, -.6 + h/2, z); selEdge.scale.set(sx, h, sz);
  selFill.visible = selEdge.visible = true;
}
function dropView(old){ if (old.view) world.remove(old.view); disposeData(old.data); }

/* ---------- build and remove animations ---------- */
// Building: an outline of the new piece glows in, then the piece is revealed from the bottom up behind a bright
// scan line in the zone's colour. Removing runs the other way: the scan line sweeps down and the piece is gone.
// A new piece's plants, signs and light glows appear when its sweep ends; a removed piece's go right away.
// Shadows redraw when a sweep ends.
renderer.localClippingEnabled = true;
const anims = [], heldRegions = new Map(), pendingRegions = new Set();
const OUTLINE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
function holdRegion(c){ const k = regKey(c.i, c.j); heldRegions.set(k, (heldRegions.get(k) || 0) + 1); }
function releaseRegion(k){
  const n = (heldRegions.get(k) || 1) - 1;
  if (n > 0){ heldRegions.set(k, n); return; }
  heldRegions.delete(k);
  if (pendingRegions.has(k)){ pendingRegions.delete(k); rebuildRegion(k); }
}
function animMaterials(u){
  const atlas = ATLAS.clone();
  atlas.clippingPlanes = [u.plane];
  atlas.onBeforeCompile = sh => {
    ATLAS.onBeforeCompile(sh);
    sh.uniforms.bandH = u.h; sh.uniforms.bandCol = u.col; sh.uniforms.bandOn = u.on;
    sh.vertexShader = sh.vertexShader.replace('varying vec3 vEmis;', 'varying vec3 vEmis; varying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vEmis;', 'varying vec3 vEmis; varying float vWY; uniform float bandH; uniform vec3 bandCol; uniform float bandOn;')
      .replace('totalEmissiveRadiance = vEmis;', 'totalEmissiveRadiance = vEmis + bandCol * bandOn * step(bandH - 0.16, vWY);');
  };
  atlas.customProgramCacheKey = () => 'animAtlas';
  const nrm = normalMat.clone(); nrm.clippingPlanes = [u.plane]; nrm.onBeforeCompile = normalMat.onBeforeCompile;
  return { atlas, nrm };
}
function startAnim(c, kind, y0, y1, zone, w, old, sound, opts = {}){
  SC_EDITS++;
  const view = kind === 'build' ? c.view : old.view;
  scNote(view);   // (the cache's rectangle redraw: this piece's box)
  const held = kind === 'build';   // plants and glows arrive when a build finishes, but leave as soon as a removal starts
  if (!view){ if (old) dropView(old); if (held) releaseRegion(regKey(c.i, c.j)); return; }
  const col = new THREE.Color(zone ? (ZONES[zone] ? ZONES[zone].col : zone) : '#e3d6bd');
  const u = { plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), kind === 'build' ? y0 : y1), h: { value: y0 }, col: { value: col.clone().multiplyScalar(1.6) }, on: { value: 1 } };
  const mats = animMaterials(u);
  view.traverse(o => { if (!o.isMesh) return; if (o.userData.isOv){ o.visible = false; return; }   // (the glow overlay waits: the sweep draws the piece itself)
    o.userData.baseMat = o.material; o.userData.baseLayer = o.layers.mask; o.material = o.material === ATLAS ? mats.atlas : o.material; if (!o.material.userData.colorOnly) o.layers.set(3); });
  showHidden(view, true);   // (sliced open by the sweep: the faces normally hidden inside can show)
  if (kind === 'remove' && c.view) c.view.visible = false;   // what's left appears when the sweep is done
  const lineMat = () => new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const box = new THREE.LineSegments(OUTLINE_GEO, lineMat()), scan = new THREE.LineSegments(OUTLINE_GEO, lineMat());
  const by0 = Math.max(y0, kind === 'build' && !zone && y0 < -1 ? -.7 : y0);   // a bare platform's outline hugs the slab, not the rock under it
  const [wx, wz] = Array.isArray(w) ? w : [w, w];
  box.position.set(c.x, (by0 + y1)/2, c.z); box.scale.set(wx + .08, Math.max(.1, y1 - by0), wz + .08);
  scan.scale.set(wx + .2, .001, wz + .2);
  const lines = [box, scan];
  // a slow arrival (megastructures) adds a footprint drawn on the ground and two fainter scan lines trailing the first
  const foot = opts.slow && !opts.bare ? new THREE.LineSegments(OUTLINE_GEO, lineMat()) : null, trail = opts.slow ? [0, 1].map(() => new THREE.LineSegments(OUTLINE_GEO, lineMat())) : [];
  if (foot){ foot.position.set(c.x, by0 + .02, c.z); foot.scale.set(wx + .3, .001, wz + .3); lines.push(foot); }
  for (const l of trail){ l.scale.copy(scan.scale); lines.push(l); }
  for (const l of lines){ l.layers.set(1); l.renderOrder = 998; scene.add(l); }
  if (!opts.quiet){ if (sound) sfx.play(sound, { spread: 0 }); else sfx.play(kind === 'build' ? 'place' : 'remove'); }
  const a = { c, kind, view, old, u, mats, box, scan, foot, trail, lines, x: c.x, z: c.z, y0, by0, y1, wx, wz, t: 0, dur: opts.slow ? 4.6 : kind === 'build' ? .15 : .12, slow: !!opts.slow, bare: !!opts.bare, onEnd: opts.onEnd, cue: opts.cue, reg: regKey(c.i, c.j), held };
  animCells.add(c); solidAbort(mergeKey(c.i, c.j)); solidRemoveOld(mergeKey(c.i, c.j)); solidDirty.add(mergeKey(c.i, c.j));   // (out of its region's merge while it animates: its own meshes show; the rest of the block is merged again at the next flush)
  anims.push(a);
  return a;
}
const easeOut = x => 1 - (1 - x)*(1 - x);
const easeInOut = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2;
// A megastructure's arrival, slow and deliberate (about four and a half seconds): its footprint is traced on the
// ground and pulses; a wireframe of the whole structure rises out of it; then the structure is revealed from the
// ground up behind a glowing scan line with two fainter ones trailing it, easing in and out; a last bright flash
// of the outline, and the glow dies away.
function slowAnim(a, p){
  const grow = easeInOut(clamp(p/.2, 0, 1)), q = easeInOut(clamp((p - .2)/.64, 0, 1));
  const h = a.y0 + (a.y1 - a.y0)*q;
  a.u.plane.constant = h; a.u.h.value = h;
  const pulse = .55 + .45*Math.sin(a.t*9);
  if (a.foot) a.foot.material.opacity = (p < .9 ? Math.min(1, p/.06) : (1 - p)/.1)*pulse;
  const top = a.by0 + (a.y1 - a.by0)*grow;
  a.box.position.y = (a.by0 + top)/2; a.box.scale.y = Math.max(.02, top - a.by0);
  const flash = p > .84 ? Math.sin(clamp((p - .84)/.16, 0, 1)*PI) : 0;
  a.box.material.opacity = a.bare ? 0 : p < .84 ? .35 + .4*pulse*Math.min(1, p/.1) : Math.max(0, .75*(1 - (p - .84)/.16) + flash);
  const on = h > a.y0 + .02 && h < a.y1 - .02;
  a.scan.position.set(a.x, h, a.z); a.scan.material.opacity = on ? 1 : 0;
  a.trail.forEach((l, k) => { const th = h - (k + 1)*.45; l.position.set(a.x, th, a.z); l.material.opacity = on && th > a.y0 ? .45/(k + 1) : 0; });
  a.u.on.value = p < .92 ? 1 : 0;
  a.u.col.value.copy(new THREE.Color(a.box.material.color)).multiplyScalar(1.6*(p < .84 ? 1 : 1 - (p - .84)/.16));
}
function updateAnims(dt){
  for (let i = anims.length - 1; i >= 0; i--){
    const a = anims[i]; a.t += dt;
    const p = Math.min(1, a.t/a.dur);
    if (a.slow){
      // a sound timed to the animation (cue.at seconds in), played once
      if (a.cue && !a.cued && a.t >= a.cue.at){ a.cued = true; sfx.play(a.cue.name, { spread: 0 }); }
      slowAnim(a, p); if (p >= 1) endAnim(i); continue;
    }
    let h, boxOp;
    if (a.kind === 'build'){
      const q = easeOut(clamp((p - .15)/.7, 0, 1));
      h = a.y0 + (a.y1 - a.y0)*q;
      boxOp = p < .15 ? p/.15 : p > .8 ? (1 - p)/.2 : 1;
    } else {
      const q = easeOut(clamp(p/.85, 0, 1));
      h = a.y1 - (a.y1 - a.y0)*q;
      boxOp = (p > .75 ? (1 - p)/.25 : 1) * ((a.t*40 % 1) < .7 ? 1 : .55);   // flickers as it goes
    }
    a.u.plane.constant = h; a.u.h.value = h;
    a.u.on.value = p < .97 ? 1 : 0;
    a.box.material.opacity = .9*boxOp;
    a.scan.position.set(a.x, h, a.z); a.scan.material.opacity = (h > a.y0 + .02 && h < a.y1 - .02) ? 1 : 0;
    if (p >= 1) endAnim(i);
  }
}
function endAnim(i){
  SC_EDITS++;
  const a = anims[i]; anims.splice(i, 1); scNote(a.view);
  if (!anims.some(b => b.c === a.c)){ animCells.delete(a.c); markSolid(a.c); }   // (back into its region's merge)
  for (const l of a.lines){ scene.remove(l); l.material.dispose(); }
  a.view.traverse(o => { if (o.isMesh && o.userData.isOv){ o.visible = true; return; } if (o.isMesh){ o.material = o.userData.baseMat || o.material; if (o.userData.baseLayer !== undefined) o.layers.mask = o.userData.baseLayer; else o.layers.set(0); } });
  showHidden(a.view, false);
  a.mats.atlas.dispose(); a.mats.nrm.dispose();
  if (a.kind === 'remove'){ dropView(a.old); if (a.c.view) a.c.view.visible = true; }
  if (a.held) releaseRegion(a.reg);
  shadowDirty = true;
  if (a.onEnd) a.onEnd();
}
function finishAnimsOn(c){ for (let i = anims.length - 1; i >= 0; i--) if (anims[i].c === c) endAnim(i); }
function clearIsland(){
  STAGE_Q.length = 0; STAGE_READY.length = 0; LATER.length = 0; SYNC_Q = null; syncPeopleAbort(); STEAM_JOB = null; if (typeof NV !== 'undefined'){ NV.queue.length = 0; if (NV.job){ nvFree(NV.job); NV.job = null; } }   // (anything still being made in steps belongs to the old city)
  while (anims.length) endAnim(anims.length - 1);
  for (const c of cells.values()){ disposeData(c.data); c.data = null; cellView(c); }
  for (const m of megas.values()){ disposeData(m.data); m.data = null; cellView(m); if (m.fx){ m.fx.dispose(); m.fx = null; } }
  megas.clear();
  for (const k of [...regions.keys()]){ disposeGroup(regions.get(k)); regions.delete(k); superDirty.add('r' + superKey(k)); }
  SOLID_JOB = null;
  for (const k of [...solidRegions.keys()]){ const r = solidRegions.get(k); world.remove(r.group); disposeGroup(r.group); solidRegions.delete(k); ovForget(k); } solidDirty.clear(); animCells.clear();   // (ovForget: the glow overlay's batches drop the region too, or its lights stay drawn with nothing under them)
  cells.clear(); hwClearAll(); mtClearAll();
  for (let i=-1;i<=1;i++) for (let j=-1;j<=1;j++) cells.set(ckey(i,j), newCell(i, j));
  rebuildAll(); centerView();
}

/* ---------- saving (this browser only) ---------- */
const SAVE_KEY = 'neonIsland.v2';
const MEGA_SAVE_KEY = 'neonIsland.megas';
function save(){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...cells.values()].map(c => [c.i, c.j, c.sections, c.style || DEFAULT_STYLE, c.green || 'some', c.lift ? c.lift.y : 0, c.lift && c.below ? c.below : 0])));
    localStorage.setItem(MEGA_SAVE_KEY, JSON.stringify([...megas.values()].map(m => ({ id: m.id, kind: m.kind, i: m.i, j: m.j, w: m.w, h: m.h, levels: m.levels, seed: m.seed, centre: m.centre || undefined, rot: m.rot, si: m.si, sj: m.sj }))));
  } catch (e) {}
  hwSave(); mtSave();
}
function load(){
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!Array.isArray(d) || !d.length) return false;
    for (const [i,j,secs,st,gr,lf,bl] of d){ const c = newCell(i, j, (secs || []).filter(s => s && ZONES[s.zone])); c.style = st || DEFAULT_STYLE; c.green = GREEN_MODES.includes(gr) ? gr : 'some'; if (lf > 0 && c.sections.length){ c.lift = { y: lf }; if (Array.isArray(bl)){ const b2 = bl.filter(s => s && ZONES[s.zone]); if (b2.length) c.below = b2; } } cells.set(ckey(i,j), c); }
    hwLoad(); mtLoad();   // (before the plots are built: the highways' and the metro's pillars stand on them)
    try { for (const m of JSON.parse(localStorage.getItem(MEGA_SAVE_KEY) || '[]')) { const mm = placeMega(m.kind, m.i, m.j, m.seed, m.w, m.h, m.levels, m.id || null); if (mm && m.centre) mm.centre = m.centre; if (mm && Number.isInteger(m.rot)) mm.rot = ((m.rot % 4) + 4) % 4; if (mm && Number.isInteger(m.si) && Number.isInteger(m.sj)){ mm.si = m.si; mm.sj = m.sj; } } } catch (e) {}
    return true;
  } catch (e) { return false; }
}

/* ---------- picking: what is under the pointer, and what a click there would do ---------- */
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _box3 = new THREE.Box3(), _hit = new THREE.Vector3();
function pickAt(cx, cy){
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  ray.setFromCamera(_ndc, cam);
  let best = null;
  const test = (c, kind) => {
    if (!ray.ray.intersectBox(_box3, _hit)) return;
    const d = _hit.distanceTo(ray.ray.origin);
    if (!best || d < best.d) best = { d, c, kind, p: _hit.clone() };
  };
  for (const c of cells.values()){
    if (c.mega){ _box3.min.set(c.x - LOT/2, CURB, c.z - LOT/2); _box3.max.set(c.x + LOT/2, c.height, c.z + LOT/2); test(c, 'mega'); }
    else if (c.sections.length){ _box3.min.set(c.x - SIDE/2, c.lift ? c.lift.y - .15 : CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.height, c.z + SIDE/2); test(c, 'bld');
      if (c.lift){   // under a pod: the building on the ground (if any), and the gap up to the pod
        const gt = groundTop(c);
        if (gt > CURB){ _box3.min.set(c.x - SIDE/2, CURB, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, gt, c.z + SIDE/2); test(c, 'low'); }
        _box3.min.set(c.x - SIDE/2, gt, c.z - SIDE/2); _box3.max.set(c.x + SIDE/2, c.lift.y - .15, c.z + SIDE/2); test(c, 'gap');
      } }
    _box3.min.set(c.x - LOT/2, -.8, c.z - LOT/2); _box3.max.set(c.x + LOT/2, CURB, c.z + LOT/2); test(c, 'plat');
  }
  if (best) return best;
  // open sky: where the pointer ray crosses the platform height
  const o = ray.ray.origin, dir = ray.ray.direction;
  if (Math.abs(dir.y) < 1e-4) return null;
  const t = (CURB - o.y)/dir.y; if (t < 0) return null;
  const p = o.clone().addScaledVector(dir, t);
  return { kind: 'sky', p, i: Math.round(p.x/LOT), j: Math.round(p.z/LOT) };
}
// turn a pick into a build target
function targetOf(pk){
  if (!pk) return null;
  if (pk.kind === 'sky') return cells.has(ckey(pk.i, pk.j)) ? null : { type: 'empty', i: pk.i, j: pk.j };
  // under a pod: the top part of the gap grows the pod down; the bottom part, the ground and the roof of the building
  // under it build up from the ground
  if (pk.c && pk.c.lift && !pk.c.mega && (pk.kind === 'gap' || pk.kind === 'plat' || (pk.kind === 'low' && Math.abs(pk.p.y - groundTop(pk.c)) < .03))){
    const c = pk.c, gt = groundTop(c), mid = (gt + c.lift.y)/2;
    return pk.kind === 'gap' && pk.p.y > mid ? { type: 'podDown', c } : { type: 'belowUp', c };
  }
  const c = pk.c, top = pk.kind === 'plat' ? CURB : pk.kind === 'low' ? groundTop(c) : c.height;
  if (Math.abs(pk.p.y - top) < .03){
    if (c.mega){   // a megastructure's roof: another tier if it stacks, otherwise nothing builds there
      const m = megas.get(c.mega);
      return m && pk.kind === 'mega' && m.levels < MEGA_TYPES[m.kind].maxLevels ? { type: 'megaUp', m } : null;
    }
    return pk.kind === 'bld' ? { type: 'up', c } : { type: 'onto', c };
  }
  // a side face: build next door in that direction
  const dx = pk.p.x - c.x, dz = pk.p.z - c.z;
  const [a,b] = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const n = cells.get(ckey(c.i + a, c.j + b));
  if (n && n.mega) return null;
  // high up the side of a building, with any zone picked and an empty plot next to it: hang a pod there
  // (open sky next door too: the platform grows under it)
  const inGrid = Math.abs(c.i + a) <= GRID_MAX && Math.abs(c.j + b) <= GRID_MAX;
  // (or over a shorter building next door, if there's a floor's gap between its roof and the pod)
  const shorter = n && n.sections.length && !n.lift && !n.mega;
  if ((S.zone === 'low' || S.zone === 'mid' || S.zone === 'ind' || S.zone === 'high') && (pk.kind === 'bld' || pk.kind === 'low') && !c.mega && (n ? !n.sections.length || shorter : inGrid) && pk.p.y > CURB + FH){
    const host = pk.kind === 'low' ? { sectionTops: c.belowTops, height: groundTop(c) } : c;
    let ly = liftSnap(host, pk.p.y);
    if (ly !== null && shorter && ly < n.height + FH - .05){   // too low over the shorter building: the first floor of the tall one that clears it
      const need = n.height + FH - .05, cand = (host.sectionTops || []).concat([...Array(40)].map((_, q) => CURB + (q + 1)*FH)).filter(v => v >= need && v <= host.height - .5).sort((a, b) => a - b);
      ly = cand.length ? cand[0] : null;
    }
    if (ly !== null) return { type: 'side', c: n || null, i: c.i + a, j: c.j + b, y: ly, from: c };
  }
  return n ? { type: 'onto', c: n } : { type: 'empty', i: c.i + a, j: c.j + b };
}
function applyTarget(t){
  if (!t) return null;
  const zone = S.zone;
  if (t.type === 'empty') return addPlatform(t.i, t.j, zone);
  if (t.type === 'megaUp'){ if (zone) addMegaTier(t.m); return null; }
  if (t.type === 'podDown') return zone ? addPodDown(t.c, zone) : null;
  if (t.type === 'belowUp') return zone ? addBelowUp(t.c, zone) : null;
  if (t.type === 'onto' && t.c.lift){ return zone ? addBelowUp(t.c, zone) : null; }
  if (t.type === 'side'){ if (!zone) return null; const c = t.c || addPlatform(t.i, t.j, null); if (c) finishAnimsOn(c); return c ? addLift(c, t.y, zone) : null; }
  if (!zone && t.type === 'onto' && !t.c.mega && !t.c.sections.length){ cycleGreen(t.c); return t.c; }   // no zone picked: an empty plot's greenery cycles
  if (!zone || t.c.mega) return null;
  addSection(t.c, zone); return t.c;
}
function removeAt(pk){ stageFinishAll(); if (!pk || pk.kind === 'sky') return; if (pk.c.mega) return removeMegaTier(megas.get(pk.c.mega)); if (pk.kind === 'low') return removeBelow(pk.c); removeSection(pk.c); }

/* ---------- hover outline showing where a click would build ---------- */
const hoverMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false });
const hover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)), hoverMat);
hover.layers.set(1); hover.renderOrder = 999; hover.visible = false; scene.add(hover);
// a side pod's outline is filled too (in its own pink), so it stands out against the wall it hangs from
const hoverFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff5ad8, transparent: true, opacity: .22, depthTest: false, depthWrite: false }));
hoverFill.layers.set(1); hoverFill.renderOrder = 998; hoverFill.visible = false; scene.add(hoverFill);
function showHover(t){
  hoverFill.visible = false;
  if (!t){ hover.visible = false; return; }
  hoverMat.color.set(t && (t.type === 'side' || t.type === 'podDown') ? '#ff5ad8' : S.zone ? ZONES[S.zone].col : '#e3d6bd');   // a side pod: its own colour
  let x, z, y0, h, w, wz;
  if (t.type === 'megaUp'){
    if (!S.zone){ hover.visible = false; return; }
    const [sx, sz] = megaSize(t.m);
    hover.position.set(t.m.x, t.m.roofH + 1.6, t.m.z); hover.scale.set(sx - .6, 3.2, sz - .6); hover.visible = true; return;
  }
  if (t.type === 'empty'){
    x = t.i*LOT; z = t.j*LOT;
    if (S.zone){ y0 = CURB; h = FH*3; w = SIDE; } else { y0 = -.6; h = .68; w = LOT; }
  } else if (t.type === 'side'){ x = t.i*LOT; z = t.j*LOT; y0 = t.y; h = FH*2; w = SIDE; }
  else if (t.type === 'podDown'){ x = t.c.x; z = t.c.z; h = Math.min(FH*2, t.c.lift.y - groundTop(t.c)); y0 = t.c.lift.y - h; w = SIDE; }
  else if (t.type === 'belowUp'){ x = t.c.x; z = t.c.z; y0 = groundTop(t.c); h = Math.min(FH*2, Math.max(.3, t.c.lift.y - y0 - .1)); w = SIDE; }
  else if (t.type === 'onto'){ x = t.c.x; z = t.c.z; y0 = t.c.sections.length ? t.c.height : CURB; h = FH*3; w = SIDE; }
  else { x = t.c.x; z = t.c.z; y0 = t.c.height; h = FH*2; w = SIDE; }
  if (t.type !== 'empty' && !S.zone){ hover.visible = false; return; }
  hover.position.set(x, y0 + h/2, z); hover.scale.set(w, h, w); hover.visible = true;
  if (t.type === 'side' || t.type === 'podDown'){ hoverFill.position.copy(hover.position); hoverFill.scale.copy(hover.scale); hoverFill.visible = true; }
}

/* ---------- placing a megastructure from the Buildings menu: its footprint follows the pointer ---------- */
// the plot under the pointer at street level (ignores what stands there, so tall buildings don't get in the way)
function groundCellAt(cx, cy){
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  ray.setFromCamera(_ndc, cam);
  const o = ray.ray.origin, dir = ray.ray.direction; if (Math.abs(dir.y) < 1e-4) return null;
  const t = (CURB - o.y)/dir.y; if (t < 0) return null;
  const p = o.clone().addScaledVector(dir, t);
  return { i: Math.round(p.x/LOT), j: Math.round(p.z/LOT) };
}
const ghostFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI/2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, depthTest: false, depthWrite: false }));
const ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthTest: false }));
for (const o of [ghostFill, ghostEdge]){ o.layers.set(1); o.renderOrder = 999; o.visible = false; scene.add(o); }
let megaGhost = null;   // { kind, i, j, w, h, ok } while placing
function showMegaGhost(kind, cell, turned){
  if (!kind || !cell){ ghostFill.visible = ghostEdge.visible = false; megaGhost = null; return; }
  const b = megaBlockAt(kind, cell.i, cell.j, turned); megaGhost = Object.assign({ kind }, b);
  const col = b.ok ? MEGA_TYPES[kind].colour : '#ff3040';
  const x = (b.i + (b.w - 1)/2)*LOT, z = (b.j + (b.h - 1)/2)*LOT, sx = b.w*LOT - .3, sz = b.h*LOT - .3, h = 2.4;
  ghostFill.material.color.set(col); ghostEdge.material.color.set(col);
  ghostFill.position.set(x, CURB + .08, z); ghostFill.scale.set(sx, 1, sz);
  ghostEdge.position.set(x, CURB + h/2, z); ghostEdge.scale.set(sx, h, sz);
  ghostFill.visible = ghostEdge.visible = true;
}

function generate(){ rebuildAll(); }
