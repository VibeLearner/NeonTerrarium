// Neon Terrarium stage: writes js/stage_scene.js, the film's script, as plain data: every person's every step, the drone, the train, the
// lifts, the camera, the hour, the lights, the weather, the person cam and the title. It reads tools/stage/probe.json (the city of
// js/stage_city.js built at once by tools/stage/probe.js: its walking network, doors, stations, plot heights) to put each step on the city's
// footways. Run once: `node tools/stage/make_scene.js`; from then on js/stage_scene.js IS the script (the stage never looks anything up).
// The apartment (STAGE_APARTMENT) is written separately: tools/stage/apartment.json, by hand, joined in here.
'use strict';
const fs = require('fs'), path = require('path');
const P = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe.json'), 'utf8'));
const APT = fs.existsSync(path.join(__dirname, 'apartment.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'apartment.json'), 'utf8')) : null;
const LOT = P.LOT, CURB = P.CURB, TARGET_Y = 0.6;
const DEG = Math.PI/180, r2 = v => Math.round(v*100)/100, r3 = v => Math.round(v*1000)/1000;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x, ss = x => { x = clamp01(x); return x*x*(3 - 2*x); }, lerp = (a, b, u) => a + (b - a)*u;
const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; }, seg = (t, a, b) => clamp01((t - a)/(b - a));
function rng(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }

/* ---------- the city as the probe found it ---------- */
const HT = new Map(P.plots.map(p => [p[0] + ',' + p[1], p[2]]));
const plotTop = (x, z) => { const i = Math.round(x/LOT), j = Math.round(z/LOT); if (Math.abs(x - i*LOT) > LOT*.46 || Math.abs(z - j*LOT) > LOT*.46) return -1e9; return HT.get(i + ',' + j) ?? -1e9; };
// how far above everything between a point (at head height) and a camera at this yaw and pitch the line to it runs (under 0: hidden)
function clearance(x, z, yaw, pitch, head = 1.2){ const sx = Math.sin(yaw), sz = Math.cos(yaw), k = Math.tan(pitch); let w = 1e9;
  for (let r = .4; r < 70; r += .25){ const h = plotTop(x + sx*r, z + sz*r); if (h > -1e8) w = Math.min(w, CURB + head + r*k - h); } return w; }
const NG = P.ng, ADJ = NG.nodes.map(() => []);
NG.edges.forEach(([a, b, cost, pts]) => { ADJ[a].push([b, cost, pts]); ADJ[b].push([a, cost, pts.slice().reverse()]); });
const nodeNear = (x, z, ok = () => true) => { let best = -1, bd = 1e9; NG.nodes.forEach(([nx, nz], k) => { const d = Math.hypot(nx - x, nz - z); if (d < bd && ok(nx, nz, k)){ bd = d; best = k; } }); return best; };
function route(a, b){   // the walking network's shortest way (Dijkstra on its costs), as points
  const n = NG.nodes.length, g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), via = new Array(n), done = new Uint8Array(n); g[a] = 0;
  for (;;){ let v = -1, bv = Infinity; for (let k = 0; k < n; k++) if (!done[k] && g[k] < bv){ bv = g[k]; v = k; } if (v < 0 || v === b) break; done[v] = 1;
    for (const [w, c, pts] of ADJ[v]) if (g[v] + c < g[w]){ g[w] = g[v] + c; from[w] = v; via[w] = pts; } }
  if (!isFinite(g[b])) return null;
  const chain = []; for (let v = b; v !== a; v = from[v]) chain.push(v); chain.reverse();
  const out = [NG.nodes[a].slice()]; for (const v of chain) for (const q of via[v].slice(1)) out.push(q.slice());
  return simplify(out);
}
function simplify(pts){ const o = [pts[0]]; for (let k = 1; k < pts.length - 1; k++){ const a = o[o.length - 1], b = pts[k], c = pts[k + 1];
    const cr = (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]); if (Math.abs(cr) > .02 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 6) o.push(b); } o.push(pts[pts.length - 1]); return o; }
const way = (ax, az, bx, bz) => route(nodeNear(ax, az), nodeNear(bx, bz));
const lenOf = pts => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
function pointAt(pts, d){ for (let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l || k === pts.length - 1){ const u = l ? Math.min(1, d/l) : 0; return [a[0] + (b[0] - a[0])*u, a[1] + (b[1] - a[1])*u, b[0] - a[0], b[1] - a[1]]; } d -= l; } return [pts[0][0], pts[0][1], 1, 0]; }
function distNear(pts, x, z){ let best = 0, bd = 1e9, acc = 0; for (let k = 1; k < pts.length; k++){ const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    const u = clamp01(((x - a[0])*(b[0] - a[0]) + (z - a[1])*(b[1] - a[1]))/(l*l)), d = Math.hypot(a[0] + (b[0] - a[0])*u - x, a[1] + (b[1] - a[1])*u - z); if (d < bd){ bd = d; best = acc + u*l; } acc += l; } return best; }

/* ---------- writing a part ---------- */
// keys [t, x, z, act, fx, fz, alpha, y]
const K = (t, x, z, act = 'idle', fx = 0, fz = 1, a = 1, y = null) => { const k = [r3(t), r2(x), r2(z), act, r2(fx), r2(fz), r2(a)]; if (y !== null) k.push(r3(y)); return k; };
// walk (or run) a path from t0 at speed v: a key at every corner
function walkKeys(pts, t0, v, act = 'walk'){ const out = []; let t = t0; out.push(K(t, pts[0][0], pts[0][1], act));
  for (let k = 1; k < pts.length; k++){ t += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])/v; out.push(K(t, pts[k][0], pts[k][1], act)); } return { keys: out, t }; }
// a part of a path: from distance d0 to d1, from time t0 at speed v
function walkPart(pts, d0, d1, t0, v, act = 'walk'){ const out = []; const dir = d1 >= d0 ? 1 : -1; let acc = 0, t = t0;
  const P0 = pointAt(pts, d0); out.push(K(t, P0[0], P0[1], act));
  const cut = []; for (let k = 1; k < pts.length - 1; k++){ acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cut.push(acc); }
  let last = d0; for (const c of (dir > 0 ? cut : cut.slice().reverse())) if ((dir > 0 && c > d0 && c < d1) || (dir < 0 && c < d0 && c > d1)){ t += Math.abs(c - last)/v; const q = pointAt(pts, c); out.push(K(t, q[0], q[1], act)); last = c; }
  t += Math.abs(d1 - last)/v; const q = pointAt(pts, d1); out.push(K(t, q[0], q[1], act)); return { keys: out, t };
}
const SHAPES = { 'tee short': 1, 'graphic buzz': 1, 'stripe afro': 1, 'headphones shorts': 1, 'tank spiky': 1, 'sweater beard': 1 };
const looks = [['tee short', 1, 1, 5, 1, 1], ['stripe afro', 3, 0, 3, 2, 0], ['sweater beard', 2, 2, 6, 0, 2], ['graphic buzz', 0, 4, 7, 1, 1], ['headphones shorts', 4, 6, 1, 0, 0], ['tank spiky', 3, 7, 2, 3, 1]];
const look = n => { const L = looks[n % looks.length]; return { shape: L[0], skin: L[1], hair: L[2], top: L[3], acc: L[4], bot: L[5] }; };
const cast = [];
const part = (id, name, lk, keys, emotes = []) => { cast.push(Object.assign({ id, name, keys: keys.slice().sort((a, b) => a[0] - b[0]), emotes }, lk.role ? { role: lk.role } : { look: lk })); };

/* ---------- the timeline ---------- */
const GARDEN = { i0: -2, i1: 1, j0: -2, j1: 1 }, GC = { x: (GARDEN.i0 + GARDEN.i1)/2*LOT, z: (GARDEN.j0 + GARDEN.j1)/2*LOT };
const MK = { built: 13.6, dive: 14.5, p: [17, 24], leave2: 28.6 };
const GV = { pitch: 46*DEG, y1: .95, y2: -1.79 };   // the two person-cam views' yaw (the second looks east across the lawn, at the second person's front door)
const HOME = { cell: [2, -1], door: P.doors.find(d => d.key === 'd:2,-1'), pod: '2,-1|0|1' };   // (a low home on the lawn's east side: its door faces the lawn)
const STAND = HOME.door.stand, WALL = HOME.door.wall;

// the lawn's spots, checked against the plot heights for a clear line to each view's camera
const LAWN = { x0: (GARDEN.i0 - .5)*LOT + 1.2, x1: (GARDEN.i1 + .5)*LOT - 1.2, z0: (GARDEN.j0 - .5)*LOT + 1.2, z1: (GARDEN.j1 + .5)*LOT - 1.2 };
function best(yaw, score){ let b = null; for (let x = LAWN.x0; x <= LAWN.x1; x += .25) for (let z = LAWN.z0; z <= LAWN.z1; z += .25){ const c = clearance(x, z, yaw, GV.pitch); if (c < 1.5) continue; const v = Math.min(c, 5) + score(x, z); if (!b || v > b.v) b = { x, z, v, c }; } return b; }
// the second pair: on the lawn a few steps from the door, the whole way to it in sight
let s2 = null;
for (let x = LAWN.x0; x <= LAWN.x1; x += .25) for (let z = LAWN.z0; z <= LAWN.z1; z += .25){
  const dd = Math.hypot(x - STAND[0], z - STAND[1]); if (dd < 2.6 || dd > 5) continue;
  if (clearance(x, z, GV.y2, GV.pitch) < 1.5) continue;
  const w = way(x, z, STAND[0], STAND[1]); if (!w) continue; const L = lenOf(w); if (L > 8) continue;
  let ok = true; for (let d = 0; d <= L; d += .2){ const q = pointAt(w, d); if (clearance(q[0], q[1], GV.y2, GV.pitch) < .6){ ok = false; break; } } if (!ok) continue;
  const v = clearance(x, z, GV.y2, GV.pitch) - .3*L; if (!s2 || v > s2.v) s2 = { x, z, v, way: w, L };
}
if (!s2) throw new Error('no spot for the second pair');
const s1 = best(GV.y1, (x, z) => (Math.hypot(x - s2.x, z - s2.z) > 5 ? 0 : -50) - .05*Math.hypot(x - GC.x, z - GC.z));
console.log('spots', s1, { x: s2.x, z: s2.z, L: s2.L });

const GW = .5;   // walking pace (the game's)
function pair(id, names, spot, ang, k, until){
  const ox = Math.cos(ang)*.38, oz = Math.sin(ang)*.38, A = [spot.x - ox, spot.z - oz], B = [spot.x + ox, spot.z + oz];
  const from = (p, s) => [p[0] + Math.cos(ang + s)*2.2, p[1] + Math.sin(ang + s)*2.2];
  const tIn = 14.7, tThere = tIn + 2.2/GW;
  const talk = (me, other, first, tEnd) => { const keys = [], f0 = from(me, first ? 2.6 : -.5), dl = first ? 0 : .25;
    keys.push(K(0, f0[0], f0[1], 'idle', me[0] - f0[0], me[1] - f0[1]), K(tIn + dl, f0[0], f0[1], 'walk'), K(tThere + dl, me[0], me[1], 'talk', other[0] - me[0], other[1] - me[1]));
    // they take turns talking, 2.3 s each
    for (let t = tThere + dl, n = 0; t < tEnd; t += 2.3, n++) keys.push(K(Math.min(t, tEnd), me[0], me[1], (n % 2 === 0) === first ? 'talk' : 'idle', other[0] - me[0], other[1] - me[1]));
    return keys; };
  return { A, B, talk };
}
// the second pair: Kwame walks home when the talk is done; Eun waves him off
const pr2 = pair('p2', null, s2, 2.3, 1);
const homeW = way(pr2.A[0], pr2.A[1], STAND[0], STAND[1]), HOME_V = .9, Lh = lenOf(homeW);
MK.door = MK.leave2 + Lh/HOME_V + .5; MK.open = MK.door + .4;
const APTT = { holo: 5.4, furn: 5.4, back: 5.4 };
MK.room = MK.open + APTT.holo; MK.unroom = MK.room + APTT.furn; MK.back = MK.unroom + APTT.back; MK.garden = MK.back; MK.square = MK.garden + 6.5;
const sh = MK.square - 33.5, MG = { walk0: 31 + sh, stop: 35.6 + sh, reach: 36.0 + sh, rob1: 37.6 + sh, alarm: 35.3 + sh, copsGo: 37.9 + sh, pass: 38.9 + sh };
console.log('MK', MK, 'MG', MG);

const pr1 = pair('p1', null, s1, -.6, 0);
part('deepa', 'Deepa Rao', look(0), pr1.talk(pr1.A, pr1.B, true, 200));
part('marcus', 'Marcus Okafor', look(1), pr1.talk(pr1.B, pr1.A, false, 200));
{ const k = pr2.talk(pr2.A, pr2.B, true, MK.leave2); const w = walkKeys(homeW, MK.leave2, HOME_V);
  k.push(...w.keys.slice(1));   // home along the footway
  k.push(K(w.t + .05, STAND[0], STAND[1], 'walk', WALL[0] - STAND[0], WALL[1] - STAND[1]), K(MK.door, WALL[0], WALL[1], 'walk', WALL[0] - STAND[0], WALL[1] - STAND[1], 0));   // in through the door
  part('kwame', 'Kwame Mensah', look(2), k); }
{ const k = pr2.talk(pr2.B, pr2.A, false, MK.leave2 - .4); const me = pr2.B;
  k.push(K(MK.leave2 - .4, me[0], me[1], 'wave', pr2.A[0] - me[0], pr2.A[1] - me[1]), K(MK.leave2 + 1.4, me[0], me[1], 'idle', STAND[0] - me[0], STAND[1] - me[1]));
  part('eun', 'Eun Seo', look(3), k); }
// two out walking on the lawn's far side and one standing about, all clear of the pairs
{ const s = [[GC.x + 4.6, GC.z + 4.2], [GC.x + 4.6, GC.z - 5.4]], w = way(s[0][0], s[0][1], s[1][0], s[1][1]) || s; const L = lenOf(w), v = .42;
  const keys = []; for (let t = 14.3, n = 0; t < 80; n++){ const r = n % 2 ? w.slice().reverse() : w; const q = walkKeys(r, t, v); keys.push(...(n ? q.keys.slice(1) : q.keys)); t = q.t; }
  part('lawn1', 'stroller', look(4), keys); }
{ const s = [[GC.x - 5.6, GC.z + 4.6], [GC.x + 2.2, GC.z + 4.6]], w = way(s[0][0], s[0][1], s[1][0], s[1][1]) || s; const v = .4;
  const keys = []; for (let t = 14.3, n = 0; t < 80; n++){ const r = n % 2 ? w : w.slice().reverse(); const q = walkKeys(r, t, v); keys.push(...(n ? q.keys.slice(1) : q.keys)); t = q.t; }
  part('lawn2', 'stroller', look(5), keys); }

/* ---------- the square: the mugging ---------- */
const SQ = P.megas.find(m => m.kind === 'square'), SC = { x: (SQ.i + (SQ.w - 1)/2)*LOT, z: (SQ.j + (SQ.h - 1)/2)*LOT };
const STREET = { yaw: Math.PI, pitch: 38*DEG, zoom: 8.6 };
const tc = [Math.sin(STREET.yaw), Math.cos(STREET.yaw)], pp = [tc[1], -tc[0]];
const MP = [SC.x + tc[0]*4, SC.z + tc[1]*4];   // the open ground between the pavilion and the camera
const va = nodeNear(MP[0] - pp[0]*7, MP[1] - pp[1]*7), vb = nodeNear(MP[0] + pp[0]*7, MP[1] + pp[1]*7);
const vp = route(va, vb), dC = distNear(vp, MP[0], MP[1]), VSTOP = pointAt(vp, dC);
const m0n = nodeNear(VSTOP[0] + pp[0]*3.6 - tc[0]*.8, VSTOP[1] + pp[1]*3.6 - tc[1]*.8);
const mp = route(m0n, nodeNear(VSTOP[0], VSTOP[1])), mL = lenOf(mp), RUN = 1.7, hitD = Math.max(0, mL - .42), MHIT = pointAt(mp, hitD), tStrike = MG.reach - hitD/RUN;
const STN = P.line.stations.find(s => s.k === 0), CAB = P.line.cabs.find(c => c.k === 0);
const fd = [MHIT[0] - CAB.x, MHIT[1] - CAB.z], fl = Math.hypot(fd[0], fd[1]);
const flee = way(MHIT[0], MHIT[1], MHIT[0] + fd[0]/fl*13, MHIT[1] + fd[1]/fl*13), fL = lenOf(flee), FLEE_V = 1.6, fleeEnd = MG.rob1 + fL/FLEE_V;
const VW = .5;
{ // the victim: across the square, stopped dead, robbed, then hurrying on the way they were going
  const k = []; const d0 = Math.max(0, dC - (MG.stop - (MK.garden - 1))*VW);
  k.push(...walkPart(vp, d0, dC, MG.stop - (dC - d0)/VW, VW).keys);
  k.push(K(MG.stop + .01, VSTOP[0], VSTOP[1], 'stare', MHIT[0] - VSTOP[0], MHIT[1] - VSTOP[1]), K(MG.rob1 + .2, VSTOP[0], VSTOP[1], 'stare', MHIT[0] - VSTOP[0], MHIT[1] - VSTOP[1]));
  const on = walkPart(vp, dC, lenOf(vp), MG.rob1 + .2, 1.0); k.push(...on.keys);
  part('victim', 'victim', look(6), k, [[MG.stop, 'bang', 1.6]]); }
const MUG = { flee, fL, fleeEnd };
{ // the mugger: waiting at the side of the square from the start, runs in, the hold-up, away
  const k = [K(0, mp[0][0], mp[0][1], 'idle', VSTOP[0] - mp[0][0], VSTOP[1] - mp[0][1]), K(tStrike, mp[0][0], mp[0][1], 'idle', VSTOP[0] - mp[0][0], VSTOP[1] - mp[0][1])];
  k.push(...walkPart(mp, 0, hitD, tStrike, RUN, 'run').keys.slice(1));
  k.push(K(MG.reach + .01, MHIT[0], MHIT[1], 'talk', VSTOP[0] - MHIT[0], VSTOP[1] - MHIT[1]), K(MG.rob1, MHIT[0], MHIT[1], 'talk', VSTOP[0] - MHIT[0], VSTOP[1] - MHIT[1]));
  k.push(...walkPart(flee, 0, fL, MG.rob1, FLEE_V, 'run').keys.slice(1));
  const end = flee[flee.length - 1]; k.push(K(fleeEnd + .01, end[0], end[1], 'idle', -fd[0], -fd[1]));
  part('mugger', 'mugger', { shape: 'graphic buzz', skin: 1, hair: 0, top: 0, acc: 0, bot: 1 }, k, [[fleeEnd + .3, 'sweat', 2.5]]); }
const PDOOR = P.doors.find(d => d.mega === 'police' && Math.abs(d.wall[1] - 22.8) < .1 && d.wall[0] < -36);
for (const n of [0, 1]){   // two officers out of the station and after him, on foot
  const end = flee[flee.length - 1], to = [end[0] + (n ? .6 : -.6), end[1] + (n ? .3 : -.3)];
  const cp = way(PDOOR.stand[0], PDOOR.stand[1], to[0], to[1]), tGo = MG.copsGo + n*.35, V = 1.9;
  const k = [K(0, PDOOR.wall[0], PDOOR.wall[1], 'idle', -1, 0, 0), K(tGo, PDOOR.wall[0], PDOOR.wall[1], 'run', -1, 0, 0), K(tGo + .35, cp[0][0], cp[0][1], 'run')];
  const w = walkKeys(cp, tGo + .35, V, 'run'); k.push(...w.keys.slice(1)); k.push(K(w.t + .01, to[0], to[1], 'idle', end[0] - to[0], end[1] - to[1]));
  part('cop' + (n + 1), 'officer', { role: 'cop' }, k);
}
// the drone: off its pad when the alarm goes, over the hold-up, its light red on the mugger, then on him as he runs
const DR = P.drones[0].map((d, k) => ({ k, p: d.pos, d: Math.hypot(d.pos[0] - MHIT[0], d.pos[2] - MHIT[1]) })).sort((a, b) => a.d - b.d)[0];
const drone = { station: 0, index: DR.k, keys: [] };
{ const R0 = DR.p, cruise = R0[1] + 1.2, low = CURB + 4.4, k = drone.keys, yawTo = (x, z, x2, z2) => r3(Math.atan2(x2 - x, z2 - z));
  const DK = (t, x, y, z, yw, light, red, e = 'lin') => k.push([r3(t), r2(x), r2(y), r2(z), yw, light, red, e]);
  const yw0 = yawTo(R0[0], R0[2], MHIT[0], MHIT[1]);
  DK(0, R0[0], R0[1], R0[2], yw0, 0, 0); DK(MG.alarm, R0[0], R0[1], R0[2], yw0, 0, 0);
  DK(MG.alarm + .8, R0[0], cruise, R0[2], yw0, .4, 0, 'ss');
  DK(MG.reach + .3, MHIT[0], low, MHIT[1] - .4, yw0, 1, 0, 'ss');
  DK(MG.reach + .9, MHIT[0], low, MHIT[1] - .4, yw0, 1, 1, 'ss');
  for (let t = MG.rob1; t <= fleeEnd + .01; t += .5){ const q = pointAt(flee, Math.min(fL, (t - MG.rob1)*FLEE_V)); DK(t, q[0], low, q[1] - .4, yawTo(MHIT[0], MHIT[1], q[0], q[1]), 1, 1); }
  const end = flee[flee.length - 1]; DK(fleeEnd + 60, end[0], low, end[1] - .4, k[k.length - 1][4], 1, 1); }

// the square's crowd: people crossing it every way and standing about in twos and threes; when it happens they stop and stare
const RC = rng(4401);
const marks = [[MHIT[0], MHIT[1], 1.8], [VSTOP[0], VSTOP[1], 1.8], [mp[0][0], mp[0][1], 1.2]]; for (let d = 0; d <= lenOf(vp); d += 1){ const q = pointAt(vp, d); marks.push([q[0], q[1], .8]); }
for (let d = 0; d <= fL; d += 1){ const q = pointAt(flee, d); marks.push([q[0], q[1], .9]); }
const clear = (x, z, pad = 0) => marks.every(([mx, mz, r]) => Math.hypot(x - mx, z - mz) > r + pad);
function crowd(tag, cx, cz, rad, nWalk, nGroups, t0, t1, react, keepOut){
  const nodes = NG.nodes.map((q, k) => [q[0], q[1], k]).filter(([x, z]) => Math.hypot(x - cx, z - cz) < rad && (!keepOut || keepOut(x, z)));
  let made = 0, li = 0;
  for (let w = 0, tries = 0; w < nWalk && tries < nWalk*30; tries++){
    const a = nodes[Math.floor(RC()*nodes.length)], b = nodes[Math.floor(RC()*nodes.length)]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < rad*.6) continue;
    const r = route(a[2], b[2]); if (!r) continue; const L = lenOf(r); if (L < 4 || L > rad*3.5) continue;
    let ok = true; for (let d = 0; ok && d <= L; d += .3){ const q = pointAt(r, d); if (!clear(q[0], q[1]) || (keepOut && !keepOut(q[0], q[1]))) ok = false; } if (!ok) continue;
    const v = .38 + RC()*.18, off = RC()*L;
    // back and forth from t0 (starting part way along); stopping to stare while it happens
    const keys = []; let t = t0, d = off, dir = 1, stopped = false;
    const at = d_ => pointAt(r, d_);
    keys.push(K(t, at(d)[0], at(d)[1], 'walk'));
    while (t < t1){
      const end = dir > 0 ? L : 0, dt = Math.abs(end - d)/v;
      if (react && !stopped && t + dt > react.t0){   // stops where they are when it happens, stares, then goes on
        const dd = d + dir*(react.t0 - t)*v, q = at(dd), far = Math.hypot(q[0] - react.x, q[1] - react.z);
        if (far < react.r){ const w1 = walkPart(r, d, dd, t, v); keys.push(...w1.keys.slice(1));
          keys.push(K(react.t0 + .01, q[0], q[1], 'stare', react.x - q[0], react.z - q[1]), K(react.t1, q[0], q[1], 'stare', react.x - q[0], react.z - q[1]));
          t = react.t1; d = dd; stopped = true; continue; }
        stopped = true; }
      const w1 = walkPart(r, d, end, t, v); keys.push(...w1.keys.slice(1)); t = w1.t; d = end; dir = -dir;
    }
    part(tag + w, 'passer-by', look(7 + li++), keys, react ? [[react.t0 + .2 + RC()*.4, 'bang', 1.4]] : []); w++; made++;
  }
  for (let g = 0, tries = 0; g < nGroups && tries < nGroups*40; tries++){
    const c = nodes[Math.floor(RC()*nodes.length)]; if (!clear(c[0], c[1], 1.2)) continue;
    const n = RC() < .45 ? 3 : 2, a0 = RC()*Math.PI*2;
    for (let q = 0; q < n; q++){ const a = a0 + q*Math.PI*2/n, x = c[0] + Math.cos(a)*.38, z = c[1] + Math.sin(a)*.38, fx = c[0] - x, fz = c[1] - z;
      const keys = [K(t0, x, z, 'talk', fx, fz)];
      if (react){ keys.push(K(react.t0, x, z, 'talk', fx, fz), K(react.t0 + .01, x, z, 'stare', react.x - x, react.z - z), K(react.t1, x, z, 'stare', react.x - x, react.z - z), K(react.t1 + .01, x, z, 'talk', fx, fz)); }
      keys.push(K(t1, x, z, 'talk', fx, fz));
      part(tag + 'g' + g + '_' + q, 'standing', look(11 + li++), keys, react ? [[react.t0 + .3 + RC()*.4, 'bang', 1.4]] : []); }
    g++;
  }
}
const SQT = { t0: MK.garden - 1, t1: 400 };
crowd('sq', SC.x, SC.z, 10, 16, 6, SQT.t0, SQT.t1, { t0: tStrike + .4, t1: MG.rob1 + 2.4, x: MHIT[0], z: MHIT[1], r: 11 });

/* ---------- the passer-by: past the hold-up, to the station, up the lift, onto the train ---------- */
const RT = { speed: 1.3, intoCab: .5, lift: 3.0, toPlat: 1.6, trainIn: 2.6, doorsOpen: .7, board: 1.0, wait: .6, close: .7 };
const by = NG.nodes[nodeNear(MHIT[0] + (CAB.x - MHIT[0])*.12, MHIT[1] + (CAB.z - MHIT[1])*.12 + .6)];
const ax = -(CAB.z - MHIT[1]), az = CAB.x - MHIT[0], al = Math.hypot(ax, az) || 1;
const fromN = NG.nodes[nodeNear(by[0] + ax/al*5, by[1] + az/al*5)];
const leg1 = way(fromN[0], fromN[1], by[0], by[1]), leg2 = way(by[0], by[1], CAB.x, CAB.z), rway = leg1.concat(leg2.slice(1));
const T = {}; { const t0 = MG.pass - lenOf(leg1)/RT.speed; let tt = t0 + lenOf(rway)/RT.speed;
  T.start = t0; T.atLift = tt; T.inCab = tt += RT.intoCab; T.atTop = tt += RT.lift; T.onPlat = tt += RT.toPlat;
  T.trainAt = T.onPlat - .2; T.doorsOpen = T.trainAt + RT.doorsOpen; T.inTrain = T.doorsOpen + RT.board; T.close = T.inTrain + RT.wait; T.depart = T.close + RT.close; }
const yPlat = P.line.MT_Y + P.line.MT_PLAT_Y, TOP = STN.lift, DOOR = STN.door, INN = STN.inn;
{ const k = [K(0, rway[0][0], rway[0][1], 'idle', rway[1][0] - rway[0][0], rway[1][1] - rway[0][1]), K(T.start, rway[0][0], rway[0][1], 'walk')];
  k.push(...walkKeys(rway, T.start, RT.speed).keys.slice(1));
  k.push(K(T.inCab, CAB.x, CAB.z, 'idle', DOOR[0] - CAB.x, DOOR[1] - CAB.z, 1, CURB));
  for (let n = 1; n <= 8; n++){ const u = n/8; k.push(K(T.inCab + (T.atTop - T.inCab)*u, CAB.x, CAB.z, 'idle', DOOR[0] - CAB.x, DOOR[1] - CAB.z, 1, lerp(CURB, yPlat, ss(u)) + .02)); }   // up in the lift
  k.push(K(T.onPlat, DOOR[0], DOOR[1], 'walk', DOOR[0] - TOP[0], DOOR[1] - TOP[1], 1, yPlat), K(T.doorsOpen, DOOR[0], DOOR[1], 'idle', INN[0] - DOOR[0], INN[1] - DOOR[1], 1, yPlat));
  k.push(K(T.doorsOpen + RT.board*.45, lerp(DOOR[0], INN[0], .45), lerp(DOOR[1], INN[1], .45), 'walk', INN[0] - DOOR[0], INN[1] - DOOR[1], 1, yPlat), K(T.inTrain, INN[0], INN[1], 'walk', INN[0] - DOOR[0], INN[1] - DOOR[1], 0, yPlat));
  part('rider', 'passer-by', { shape: 'sweater beard', skin: 0, hair: 3, top: 5, acc: 2, bot: 0 }, k); }
// people about the street on the way to the station (none on the lift)
{ const mid = pointAt(rway, lenOf(rway)*.55); crowd('st', mid[0], mid[1], 11, 10, 2, T.start - 4, 400, null, (x, z) => Math.hypot(x - CAB.x, z - CAB.z) > 1.6); }

const train = { k: 0, to: P.line.stops[P.line.stops.length - 1].k, open: r3(T.trainAt), close: r3(T.close), depart: r3(T.depart), v: 7.5, a: 2.2 };
{ const s0 = P.line.stops[0].s, s1 = P.line.stops[P.line.stops.length - 1].s, D = s1 - s0, ta = train.v/train.a, da = .5*train.a*ta*ta; T.arrive = T.depart + 2*ta + Math.max(0, (D - 2*da)/train.v); }
const lifts = [[0, [[0, CAB.y0], [r3(T.inCab), CAB.y0], [r3(T.atTop), CAB.y1, 'ss'], [r3(T.atTop + 2), CAB.y1], [r3(T.atTop + 5), CAB.y0, 'ss']]]];
console.log('T', T);

/* ---------- the camera, the hour, the lights, the weather ---------- */
const OUT = { t0: T.arrive + .5, dur: 9 }, TITLE = { t0: OUT.t0 + OUT.dur, dur: 8.5 };
const camera = [];
const C = (t, pose, e = 'lin') => camera.push([r3(t), pose, e]);
for (let t = 0; t <= MK.dive + 1e-9; t += .25){ const u = ease(seg(t, .3, MK.built + .6));
  C(t, { x: r2(GC.x), y: TARGET_Y, z: r2(GC.z), yaw: r3(.55 + .62*ss(t/MK.dive)), zoom: r3(Math.exp(lerp(Math.log(8), Math.log(31), u))), pitch: r3(lerp(40, 34, u)*DEG) }); }
C(MK.p[0], { follow: 'deepa', smooth: .6, dy: .5, yaw: GV.y1, pitch: r3(GV.pitch), zoom: 4.4 }, 'ease');
C(MK.p[1] - .3, { follow: 'deepa', smooth: .6, dy: .5, yaw: GV.y1, pitch: r3(GV.pitch), zoom: 4.4 });
C(MK.p[1] + 2.2, { follow: 'kwame', smooth: .8, dy: .5, yaw: GV.y2, pitch: r3(GV.pitch), zoom: 4.4 }, 'ease');
C(MK.garden, { follow: 'kwame', smooth: .8, dy: .5, yaw: GV.y2, pitch: r3(GV.pitch), zoom: 4.4 });
const SQP = { x: r2(MP[0]), y: r3(CURB + .5), z: r2(MP[1]), yaw: r3(STREET.yaw), pitch: r3(STREET.pitch), zoom: STREET.zoom };
C(MK.square, Object.assign({ hump: 1.6 }, SQP), 'ease');
C(MG.alarm + .6, SQP);
C(MG.alarm + 2.2, Object.assign({}, SQP, { y: 1.6, zoom: 10 }), 'ss');
C(MG.pass - .4, Object.assign({}, SQP, { y: 1.6, zoom: 10 }));
C(MG.pass + 2.2, { follow: 'rider', smooth: .8, dy: .4, yaw: r3(STREET.yaw), pitch: r3(35*DEG), zoom: 7.8 }, 'ease');
C(T.depart + .3, { follow: 'rider', smooth: .8, dy: .4, yaw: r3(STREET.yaw), pitch: r3(35*DEG), zoom: 7.8 });
C(T.depart + 2.5, { train: .5, yaw: r3(Math.PI), pitch: r3(11*DEG), zoom: 9.5 }, 'ease');
C(OUT.t0, { train: .5, yaw: r3(Math.PI), pitch: r3(11*DEG), zoom: 9.5 });
const OUTP = { x: r2(GC.x + 1.5*LOT), y: TARGET_Y, z: r2(GC.z + 1.5*LOT), yaw: r3(Math.PI - .5), zoom: 27, pitch: r3(31*DEG) };
C(OUT.t0 + OUT.dur, OUTP, 'ease');
C(TITLE.t0 + TITLE.dur, Object.assign({}, OUTP, { yaw: r3(OUTP.yaw - .08) }));
// the hour: morning held through the build, the garden and the apartment; golden hour from when the hologram starts back out (behind it) to the
// train pulling out; night by the end of its run
const hour = [[0, 10], [r3(MK.unroom), 10], [r3(MK.unroom + .01), 17.2, 'hold'], [r3(T.depart + .4), 17.2], [r3(T.arrive - .2), 22.2, 'ss']];
// the lights: as the hour has them until the ride, off for the ride, then on one by one as the camera pulls back
const lights = [[0, null], [r3(T.depart + 2), null], [r3(T.depart + 2.01), 0, 'hold'], [r3(OUT.t0 + 1.5), 0], [r3(OUT.t0 + 1.5 + 1/.11), 1]];
const weather = [[r3(lerp(T.depart, T.arrive, .45)), 'rain', 6]];
const black = [[0, 1], [1, 0, 'ss'], [r3(TITLE.t0), 0], [r3(TITLE.t0 + 1.4), .4, 'ss'], [r3(TITLE.t0 + TITLE.dur - .8), .4], [r3(TITLE.t0 + TITLE.dur), 1, 'ss']];
const shadowBox = [[0, 150], [r3(MK.dive), 150], [r3(MK.dive + .01), 0, 'hold']];

/* ---------- the person cam ---------- */
const monitor = [
  { t0: MK.p[0] + .1, t1: MK.p[1], actor: 'deepa', name: 'DEEPA RAO', sub: 'name verified', cam: 'CAM 12', clock: 'D1 10:00', yaw: r3(GV.y1 + .9), pitch: r3(48*DEG), fade: .3,
    log: [[MK.p[0] + .6, 'D1 10:00', 'Marcus calls across the lawn: "Deepa!"'], [MK.p[0] + 1.8, 'D1 10:01', 'Deepa complains to Marcus about the shift at the foundry.'],
          [MK.p[0] + 3.0, 'D1 10:02', 'Marcus asks how a courier ever gets a day off. Deepa laughs.'], [MK.p[0] + 4.3, 'D1 10:03', 'Deepa and Marcus, same lawn, same hour. 5 days running.']] },
  { t0: MK.p[1] + .1, t1: MK.door, actor: 'kwame', name: 'KWAME MENSAH', sub: 'name verified', cam: 'CAM 07', clock: 'D1 10:07', yaw: r3(GV.y2 - .9), pitch: r3(48*DEG), fade: .5,
    log: [[MK.p[1] + .6, 'D1 10:07', 'Name tag on Kwame: "Kwame."'], [MK.p[1] + 1.8, 'D1 10:08', 'Kwame shows Eun a photo: the crew at the night market.'],
          [MK.p[1] + 3.0, 'D1 10:09', 'Kwame lives at Block 12. Eun lives two doors down.'], [MK.p[1] + 4.3, 'D1 10:10', 'Kwame works as a line worker. Nights, mostly.']] }];
const brackets = [[MK.p[0], MK.p[1], 'deepa'], [MK.p[1], MK.door - .6, 'kwame']];
// the front door: opens as Kwame gets to it, shuts behind him
const doors = [[HOME.door.key, [[0, 0], [r3(MK.door - 1.1), 0], [r3(MK.door - .5), 1, 'ss'], [r3(MK.door + .4), 1], [r3(MK.door + 1.2), 0, 'ss']]]];
const apartment = APT ? Object.assign({ pod: HOME.pod, open: r3(MK.open), room: r3(MK.room), unroom: r3(MK.unroom), back: r3(MK.back), fade: .8 }, APT) : null;
const end = r3(TITLE.t0 + TITLE.dur);

const J = v => JSON.stringify(v);
const L = a => '[\n' + a.map(r => '    ' + J(r)).join(',\n') + '\n  ]';
const out = `// Neon Terrarium stage: the film's script, every move in it (js/stage.js plays it; nothing happens that is not written here).
// Made once by tools/stage/make_scene.js from the city as built (tools/stage/probe.json); from then on this file is the script: edit it by hand.
// Times are seconds into the film. Positions are world x, z (plot (i, j) stands at i*3.8, j*3.8).
//   cast:    each person: look, and keys [t, x, z, act, faceX, faceZ, alpha, y]: from one key to the next they go straight across doing the
//            first key's act (walk, run, idle, talk, stare, wave, phone); faceX/Z is which way they face standing still; alpha how much of
//            them shows; y how high their feet are. emotes [t, kind, seconds]
//   drone:   the police drone that flies (the station's others stay on their pads): keys [t, x, y, z, yaw, light, red, easing]
//   train:   waits at stop k, doors open at open, shut from close, pulls out at depart, runs to stop 'to' at top speed v, pick-up a
//   lifts:   [stop, [[t, y, easing]...]]: the station lift cab's height
//   camera:  [t, pose, easing]: { x, y, z, yaw, pitch, zoom } or { follow: person, ... } or { train: height above it, ... }; hump: out over the roofs between keys
//   hour, lights (null: as the hour has them), black (the fade), shadowBox: [t, value, easing]; weather: [t, kind, fade seconds]
//   monitor: the person cam: who, from when to when, its log lines; brackets: [from, to, person]; doors: a door's opening [0..1] over time
'use strict';
window.STAGE_KEYS = window.STAGE_KEYS || {};
${APT ? "// the apartment, as Furnish pod finds a pod's saved home (the stage answers the game's question for it: saveguard.js)\nwindow.STAGE_KEYS['neonIsland.furnish'] = " + J(J({ v: 1, homes: { [HOME.pod]: { at: '2026-10-28T00:00:00.000Z', zone: 'low', kind: 'tower', n: APT.recipe.pieces.length, recipe: APT.recipe } } })) + ';' : ''}
const STAGE_SCENE = {
  end: ${end},
  marks: ${J({ MK, MG: Object.fromEntries(Object.entries(MG).map(([k, v]) => [k, r3(v)])), T: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, r3(v)])), out: OUT, title: TITLE })},
  title: { neon: ${r3(TITLE.t0 + .5)}, terrarium: ${r3(TITLE.t0 + .9)} },
  hour: ${J(hour)},
  lights: ${J(lights)},
  weather: ${J(weather)},
  black: ${J(black)},
  shadowBox: ${J(shadowBox)},
  camera: ${L(camera)},
  monitor: ${J(monitor)},
  brackets: ${J(brackets)},
  doors: ${J(doors)},
  drone: ${J(drone)},
  train: ${J(train)},
  lifts: ${J(lifts)},
  apartment: ${J(apartment)},
  cast: [
${cast.map(c => '    ' + J(c)).join(',\n')}
  ],
};
`;
fs.writeFileSync(path.join(__dirname, '../../js/stage_scene.js'), out);
console.log('cast', cast.length, 'camera keys', camera.length, 'end', end);
