// Neon Terrarium: Hover cars, delivery drones, their shadows, chimney steam.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- clouds, vehicles, steam, rain ---------- */
const clouds = (() => {
  const cloudBlob = new THREE.IcosahedronGeometry(.5,1), rr = mulberry32(99), list = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const add = (cx,cy,cz,n,sz) => { for (let k=0;k<n;k++){ const s=sz*(0.8+rr()*1.3);
    q.setFromEuler(new THREE.Euler(rr()*3, rr()*3, rr()*3));
    list.push(cloudBlob.clone().applyMatrix4(m.compose(new THREE.Vector3(cx+(rr()-.5)*3.2, cy+(rr()-.5)*.8, cz+(rr()-.5)*3.2), q, new THREE.Vector3(s*2, s*1.05, s*2)))); } };
  for (let c=0;c<22;c++){ const a=c/22*TAU+rr()*.3, r=17+rr()*9; add(Math.cos(a)*r, -10+rr()*3.5, Math.sin(a)*r, 6+Math.floor(rr()*4), .55); }
  for (let c=0;c<8;c++){ const a=c/8*TAU+rr(), r=29+rr()*4; add(Math.cos(a)*r, 2+rr()*6, Math.sin(a)*r, 6, .9); }
  const mesh = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(list,false), M.cloud);
  scene.add(mesh); return mesh;
})();

const cars = [];
/* ---------- hover cars: low angular bodies on four drum hover pods, in several kinds ---------- */
// Original design: wedge hull, glass cabin, drum-shaped hover pods in dark hoops, vertical light strips on the
// front pods, blue thrusters underneath. Kinds: standard, taxi, luxury, beat-up and cargo van.
U.taper = new THREE.CylinderGeometry(.18, .5, 1, 16).toNonIndexed();
const CARM = {
  strip: toon(0x606060, { em:0xfff0d8, kind:'thruster' }),
  tail:  toon(0x401010, { em:0xff3030, kind:'thruster' }),
  taxiSign: toon(0x5a3e18, { em:0xffc040, kind:'thruster' }),
  std:  [toon(0x2a2e36), toon(0x3a3f48), toon(0x3a3036), toon(0x40464e)],
  taxi: [toon(0xe0b43a)],
  lux:  [toon(0xe8e8e4), toon(0x2a2050), toon(0x15161c), toon(0x6a1f3a)],
  beat: [toon(0x8A4A2A), toon(0x7d8b8c), toon(0x6b6048), toon(0x5a6a58)],
  van:  [toon(0x8a9098), toon(0x4f7fa3), toon(0xd9d2c0)],
  chrome: toon(0xb8c0c8),
};
function carPart(g, geo, mat, x, y, z, sx, sy, sz, rx=0, ry=0, rz=0){
  const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.set(rx,ry,rz); g.add(m); return m;
}
function carSprite(g, mat, x, y, z, sc){ const sp = new THREE.Sprite(mat); sp.position.set(x,y,z); sp.scale.set(sc,sc,1); sp.layers.set(1); g.add(sp); return sp; }
function buildCar(kind){
  const g = new THREE.Group(), rr = Math.random, pk = a => a[Math.floor(rr()*a.length)];
  const L = kind === 'lux' ? 1.15 : kind === 'van' ? 1.2 : 1.0, W = kind === 'van' ? .5 : .44;
  const body = pk(CARM[kind]);
  const out = { g, flick:[], wobble: kind === 'beat' ? 1 : 0 };
  // a sleek, slightly flattened tube: tapered tail, body section, glass cabin, long pointed glass nose
  const R_ = kind === 'van' ? .19 : kind === 'lux' ? .13 : .14, cy = .04, FL = .8;   // FL flattens the height
  const glassF = kind === 'van' ? .22 : kind === 'lux' ? .42 : .36;
  const tailLen = R_*1.6, bodyLen = L*(1-glassF) - tailLen*.8, glassLen = L*glassF;
  const zb = -L/2 + tailLen + bodyLen/2 - .05, zg = zb + bodyLen/2 + glassLen/2;
  carPart(g, U.cyl16, body, 0, cy, zb, 2*R_, bodyLen, 2*R_*FL, PI/2);
  carPart(g, U.cyl16, M.glassDark, 0, cy, zg, 2*R_*.97, glassLen, 2*R_*.97*FL, PI/2);
  carPart(g, U.sph, M.glassDark, 0, cy, zg + glassLen/2, 2*R_*.97, 2*R_*.97*FL, R_*2.6);       // long pointed glass nose
  carPart(g, U.taper, body, 0, cy, zb - bodyLen/2 - tailLen/2, 2*R_, tailLen, 2*R_*FL, -PI/2); // tail narrowing to a point
  carPart(g, U.cyl16, M.frame, 0, cy, zb + bodyLen/2, 2*R_+.015, .03, 2*R_*FL+.015, PI/2);       // seam between body and glass
  carPart(g, U.box, CARM.strip, 0, cy + R_*FL + .004, zb, .025, .015, bodyLen*.7);               // light strip along the top
  carPart(g, U.box, body, 0, cy + R_*FL + .06, zb - bodyLen/2 - tailLen*.2, .025, .11, tailLen*.9, .5);   // small tail fin
  for (const sx of [-1,1]) carPart(g, U.box, M.frame, sx*(R_+.003), cy, zb + bodyLen*.15, .01, R_*.8, .02);   // door line
  if (kind === 'van') for (const zz of [-.15, .05]) carPart(g, U.cyl16, M.hazard, 0, cy, zb + zz, 2*R_+.01, .05, 2*R_*FL+.01, PI/2);   // cargo bands
  // four slim hover pods on swivels: each pod is a pivot group the flight code turns
  // (thrusters tilt back while cruising, and swing to point straight down to land, park and take off)
  const px = R_ + .1, pz = L*.28;
  out.pods = [];
  for (const sx of [-1,1]) for (const sz of [-1,1]){
    carPart(g, U.box, M.frame, sx*(px-.06), cy-.02, sz*pz, .07, .03, .07);                // strut to the body
    const pv = new THREE.Group(); pv.position.set(sx*px, -.02, sz*pz); g.add(pv); out.pods.push(pv);
    carPart(pv, U.cyl16, kind === 'beat' && rr() < .3 ? pk(CARM.beat) : M.frame, 0, 0, 0, .24, .1, .24, 0, 0, PI/2);   // drum
    carPart(pv, U.cyl16, M.concDD, sx*.06, 0, 0, .27, .02, .27, 0, 0, PI/2);            // thin outer hoop
    const lit = sz > 0 || kind === 'lux';
    if (lit && !(kind === 'beat' && sx < 0 && sz > 0)) carPart(pv, U.box, CARM.strip, 0, 0, sz*.125, .025, .16, .015);   // vertical light strip
    carPart(pv, U.cyl16, M.thruster, 0, -.13, 0, .1, .03, .1);                              // nozzle
    const tg = carSprite(pv, GLOW.blue, 0, -.2, 0, .45);
    if (kind === 'beat' && sx > 0 && sz < 0) out.flick.push(tg);                          // one sputtering thruster
  }
  // tail lights and headlight glow
  for (const sx of [-1,1]) carPart(g, U.box, CARM.tail, sx*R_*.3, cy, zb - bodyLen/2 - tailLen + .03, .05, .03, .02);
  carSprite(g, GLOW.warm, 0, cy, zg + glassLen/2 + R_*1.2, .6);
  if (kind === 'taxi'){
    carPart(g, U.box, CARM.taxiSign, 0, cy + R_ + .05, zb + .05, .16, .07, .09);
    carSprite(g, GLOW.amber, 0, cy + R_ + .07, zb + .05, .5);
    for (let i=0;i<5;i++) for (const sx of [-1,1]) if (i%2===0) carPart(g, U.box, M.frame, sx*(R_+.004), cy, zb - bodyLen/2 + .08 + i*.09, .01, .05, .05);   // checker band
  }
  if (kind === 'lux'){
    const neon = pk([M.neonCyan, M.neonPink, M4.neonPurple]);
    for (const sx of [-1,1]){ carPart(g, U.box, CARM.chrome, sx*(R_+.004), cy+.02, 0, .01, .015, L*.75); carPart(g, U.box, neon, sx*R_*.5, cy - R_ - .005, 0, .02, .02, L*.7); }
    carSprite(g, NEON_GLOW.get(neon) === 'cyan' ? GLOW.cyan : GLOW.pink, 0, cy - R_ - .06, 0, .8);
  }
  if (kind === 'beat'){
    carPart(g, U.box, pk([M.corrBlue, M.hazard, M.rustRed, M.cream2]), R_+.005, cy, zb + rr()*.2-.1, .01, R_*1.1, .2);   // mismatched door panel
    carPart(g, U.box, M.cream2, -R_-.005, cy+.03, zb + .1, .01, .03, .12, .3);           // tape patch
    carPart(g, U.box, M.rust, 0, cy + R_ + .003, zb - bodyLen*.3, .12, .01, .14);       // rust patch on top
  }
  return out;
}
const tripCars = [];
let skyTop = 13;
(function buildCars(){
  const lanes = [
    {r:14.2,h:3.0,sp:.17,ph:0}, {r:14.2,h:3.2,sp:.17,ph:3.1}, {r:15.4,h:5.4,sp:-.13,ph:0}, {r:15.4,h:5.6,sp:-.13,ph:2.2},
    {r:13.6,h:7.8,sp:.11,ph:1}, {r:6.5,h:12.3,sp:-.19,ph:0}, {r:10.4,h:11.6,sp:.15,ph:4}, {r:16.8,h:.9,sp:.09,ph:5}, {r:14.6,h:9.6,sp:-.1,ph:.5},
    {r:12.9,h:4.4,sp:.14,ph:1.6}, {r:15.9,h:7.0,sp:-.12,ph:4.4}, {r:11.6,h:10.4,sp:.13,ph:2.7},
  ];
  const kinds = ['std','taxi','lux','beat','van','taxi','std','beat','lux','taxi','std','van'];
  // six cars keep circling the island; the rest make trips
  for (let i=0;i<5;i++){ const c = buildCar(kinds[(i+6)%kinds.length]); c.g.visible = false; scene.add(c.g); tripCars.push({ ...c, phase:'away', timer: 2 + i*3.5, pad:null, from:new THREE.Vector3(), to:new THREE.Vector3(), k:0, len:1, bank:0 }); }
})();

/* ---------- delivery drones flying between rooftop docks ---------- */
const drones = [];
const redLight = toon(0x401010, { em:0xff2a2a, kind:'thruster' });
const DRONES_PER_SECTION = 3;   // the test island counts as one section for now
for (let i=0;i<DRONES_PER_SECTION;i++){
  const g = new THREE.Group();
  const b = new THREE.Mesh(U.box, M.metalDark); b.scale.set(.3,.09,.3); g.add(b);
  const rotors = [];
  for (const [x,z] of [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]]){
    const arm = new THREE.Mesh(U.box, M.frame); arm.scale.set(.04,.03,.04); arm.position.set(x*.8,.04,z*.8); g.add(arm);
    const r = new THREE.Mesh(U.cyl, M.metal); r.scale.set(.18,.015,.18); r.position.set(x,.07,z); g.add(r); rotors.push(r);
  }
  const c = new THREE.Mesh(U.box, pick([M.crate, M.hazard, M.corrBlue])); c.scale.set(.2,.16,.2); c.position.y = -.14; g.add(c);
  const amber = new THREE.Mesh(U.box, M.neonAmber); amber.scale.set(.05,.05,.05); amber.position.set(0,.08,.15); g.add(amber);
  const red = new THREE.Mesh(U.box, redLight); red.scale.set(.06,.06,.06); red.position.set(0,.09,-.15); g.add(red);
  const redGlow = new THREE.Sprite(GLOW.red); redGlow.scale.set(.55,.55,1); redGlow.position.set(0,.1,-.16); redGlow.layers.set(1); g.add(redGlow);
  g.visible = false; scene.add(g);
  drones.push({ g, red, redGlow, phase:'inside', timer:0, at:0, to:0, k:0, cruise:0, blink: Math.random()*2 });
}
let ports = [], portLots = [];
// Almost every building gets a compact drone perch: a slim mast on the roof topped by a small deck with a hangar pod.
// Masts keep the perch clear of whatever else is on the roof.
function addPerch(l){
  const sx = pick([-1,1]), sz = pick([-1,1]);
  const base = new THREE.Vector3(l.x + sx*rnd(.25,.55), l.height, l.z + sz*rnd(.25,.55));
  const mast = rnd(.45,.8), P = T(base.x, base.y + mast, base.z, pick([0, PI/2, PI, -PI/2]));
  cyl(M.frame, I4, base.x, base.y + mast/2, base.z, .03, mast);
  box(M.concDD, P, 0, 0, 0, .62, .05, .38);
  box(M.hazard, P, .12, .03, 0, .26, .045, .045);
  for (const z of [-.16,.16]){ box(M.neonCyan, P, .28, .035, z, .04, .03, .04); glow(P, .28, .07, z, 'cyan', .35); }
  box(M.shutter, P, -.19, .14, 0, .24, .24, .32);
  box(M.interiorCool, P, -.065, .12, 0, .02, .16, .22); glow(P, -.03, .12, 0, 'cyan', .45);
  box(M.neonAmber, P, -.19, .28, .12, .04, .04, .04);
  (curPorts || ports).push({ pad: new THREE.Vector3(.14, .1, 0).applyMatrix4(P), inside: new THREE.Vector3(-.19, .1, 0).applyMatrix4(P), busy: false });
}
function buildDronePorts(lots){
  ports = []; portLots = lots;
  for (const l of lots) if (l.occupied && !l.plaza && !l.hasCarPad && l.height >= 1.5 && chance(.88)) addPerch(l);
}
function resetDrones(){
  drones.forEach((d, i) => {
    d.g.visible = false;
    if (ports.length < 2) return;
    d.phase = 'inside'; d.at = ports[Math.floor(Math.random()*ports.length)]; d.timer = .5 + i*1.5 + Math.random()*1.5;
  });
}
// cruising height: high enough to clear every building the straight line between the two perches passes over
function droneCruise(a, b){
  let y = Math.max(a.y, b.y) + 1 + Math.random()*1.4;
  for (let i=1;i<12;i++){
    const x = a.x + (b.x-a.x)*i/12, z = a.z + (b.z-a.z)*i/12;
    for (const l of portLots) if (Math.abs(x-l.x) < 1.6 && Math.abs(z-l.z) < 1.6) y = Math.max(y, l.height + 1.3);
  }
  return y;
}
const _dp = new THREE.Vector3(), DRONE_SPEED = 1.7;
function updateDrones(dt, t, night){
  for (const d of drones){
    if (ports.length < 2){ d.g.visible = false; continue; }
    const pos = d.g.position;
    _dp.copy(pos);
    switch (d.phase){
      case 'inside':
        d.timer -= dt;
        if (d.timer <= 0){
          const from = d.at;
          const cand = ports.filter(p => p !== d.at && !p.busy);
          if (!cand.length){ d.timer = 1; break; }
          // short hops between nearby docks, so drones stay around the part of the city being built
          const dd = p => (p.pad.x - from.pad.x)**2 + (p.pad.z - from.pad.z)**2;
          cand.sort((a, b) => dd(a) - dd(b));
          const to = cand[Math.floor(Math.random()*Math.min(6, cand.length))];
          d.to = to; to.busy = true; d.k = 0; d.phase = 'exit';
          d.heading = Math.atan2(from.pad.x - from.inside.x, from.pad.z - from.inside.z);
        }
        break;
      case 'exit': {    // roll out of the hangar onto the deck
        const from = d.at; d.k = Math.min(1, d.k + dt/1.8);
        const u = d.k*d.k*(3 - 2*d.k); pos.copy(from.inside).lerp(from.pad, u);
        if (d.k >= 1){ d.k = 0; d.phase = 'spool'; d.hoverFrom = pos.clone(); const to = d.to; d.goHeading = Math.atan2(to.pad.x - pos.x, to.pad.z - pos.z); }
        break;
      }
      case 'spool': {   // lift a touch off the deck and turn to face the destination
        d.k = Math.min(1, d.k + dt/1.6); const u = d.k*d.k*(3 - 2*d.k);
        pos.copy(d.hoverFrom).setY(d.hoverFrom.y + .2*u);
        let dh = d.goHeading - d.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); d.heading += dh*Math.min(1, dt*2.5);
        if (d.k >= 1){
          const to = d.to, cruise = droneCruise(pos, to.pad);
          d.cp = [pos.clone(), new THREE.Vector3(pos.x, cruise, pos.z), new THREE.Vector3(to.pad.x, cruise, to.pad.z), to.pad.clone()];
          const est = d.cp[0].distanceTo(d.cp[1]) + d.cp[1].distanceTo(d.cp[2]) + d.cp[2].distanceTo(d.cp[3]);
          d.k = 0; d.len = Math.max(2, est*.85/DRONE_SPEED); d.phase = 'fly';
        }
        break;
      }
      case 'fly':       // up, across and down in one smooth curve, easing in and out
        d.k = Math.min(1, d.k + dt/d.len);
        bez(pos, d.cp[0], d.cp[1], d.cp[2], d.cp[3], d.k*d.k*(3 - 2*d.k));
        if (d.k >= 1){ d.k = 0; d.phase = 'enter'; d.enterHeading = d.heading; }
        break;
      case 'enter': {   // roll in through the door and disappear inside
        const to = d.to; d.k = Math.min(1, d.k + dt/1.8);
        const u = d.k*d.k*(3 - 2*d.k); pos.copy(to.pad).lerp(to.inside, u);
        const want = Math.atan2(to.pad.x - to.inside.x, to.pad.z - to.inside.z);
        let dh = want - d.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); d.heading += dh*Math.min(1, dt*3);
        if (d.k >= 1){ to.busy = false; d.phase = 'inside'; d.at = d.to; d.timer = 1 + Math.random()*3; }
        break;
      }
    }
    d.g.visible = d.phase !== 'inside';
    // face the way it's flying, pitch nose-down with speed, bank into turns
    const vx = (pos.x - _dp.x)/Math.max(dt,1e-4), vz = (pos.z - _dp.z)/Math.max(dt,1e-4), vh = Math.hypot(vx, vz);
    let turn = 0;
    if (d.phase === 'fly' && vh > .2){ let dh = Math.atan2(vx, vz) - d.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); turn = dh; d.heading += dh*Math.min(1, dt*3); }
    d.g.rotation.y = d.heading || 0;
    d.pitch = (d.pitch||0) + (.28*Math.min(1, vh/DRONE_SPEED) - (d.pitch||0))*Math.min(1, dt*2.5);
    d.bank = (d.bank||0) + (Math.max(-.2, Math.min(.2, -turn*1.2)) - (d.bank||0))*Math.min(1, dt*2.5);
    d.g.rotation.x = d.phase === 'fly' ? d.pitch : 0; d.g.rotation.z = d.bank;
    const on = night > .3 && ((t + d.blink) % 1.4) < .9;
    d.red.visible = on; d.redGlow.visible = on;
  }
}
// a point well outside the camera's view, where cars appear from and vanish to
function viewRadius(){ return zoomT*(W/H)*1.2 + 18; }
function offscreen(y){ const a = Math.random()*TAU, r = viewRadius() + 12 + Math.random()*8; return new THREE.Vector3(camGoal.x + Math.cos(a)*r, y, camGoal.z + Math.sin(a)*r); }
function flyTo(c, target, speed){ c.from.copy(c.g.position); c.to.copy(target); c.k = 0; c.len = Math.max(.01, c.from.distanceTo(c.to)/speed); }
// Trips follow smooth cubic curves: arrivals stay high until they're over the pad, then ease down onto it;
// departures lift off vertically and bend gradually into forward flight. Speed eases in and out along the curve.
function bez(out, a, b, c, d, u){ const v = 1-u; return out.set(0,0,0).addScaledVector(a, v*v*v).addScaledVector(b, 3*v*v*u).addScaledVector(c, 3*v*u*u).addScaledVector(d, u*u*u); }
function startCurve(c, a, b, cc, d, speed){
  c.cp = [a.clone(), b.clone(), cc.clone(), d.clone()];
  const est = a.distanceTo(b) + b.distanceTo(cc) + cc.distanceTo(d);
  c.k = 0; c.len = Math.max(1.5, est*.85/speed);
}
const _prev = new THREE.Vector3();
function updateTrips(dt, t){
  for (const c of tripCars){
    const pos = c.g.position;
    _prev.copy(pos);
    const follow = () => { c.k = Math.min(1, c.k + dt/c.len); const u = c.k*c.k*(3 - 2*c.k); bez(pos, c.cp[0], c.cp[1], c.cp[2], c.cp[3], u); return c.k >= 1; };
    switch (c.phase){
      case 'away':
        c.g.visible = false; c.timer -= dt;
        if (c.timer <= 0){
          const vr2 = (viewRadius() + 6)**2, free = carPads.filter(p => !p.busy && (p.pos.x - camGoal.x)**2 + (p.pos.z - camGoal.z)**2 < vr2);
          c.g.visible = true;
          if (free.length && Math.random() < .6){
            c.pad = free[Math.floor(Math.random()*free.length)]; c.pad.busy = true;
            c.cruise = skyTop + .8 + Math.random()*2;
            const start = offscreen(c.cruise), pad = c.pad.pos.clone().setY(c.pad.pos.y + .22);
            const dir = new THREE.Vector3(pad.x - start.x, 0, pad.z - start.z).normalize();
            startCurve(c, start, new THREE.Vector3(pad.x, c.cruise, pad.z).addScaledVector(dir, -6), new THREE.Vector3(pad.x, c.cruise - .5, pad.z), pad, 3.6);
            pos.copy(start); c.heading = Math.atan2(dir.x, dir.z); c.phase = 'arrive';
          } else {
            const high = true, y = skyTop + 1 + Math.random()*3;
            const a = Math.random()*TAU, off = high ? (Math.random()-.5)*16 : (16 + Math.random()*5)*(Math.random()<.5?-1:1);
            const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(off);
            const vr = viewRadius() + 16, ctr = new THREE.Vector3(camGoal.x, 0, camGoal.z);
            const A = dir.clone().multiplyScalar(-vr).add(side).add(ctr).setY(y), D = dir.clone().multiplyScalar(vr).add(side).add(ctr).setY(y + (Math.random()-.5)*2);
            startCurve(c, A, A.clone().lerp(D, .33).add(side.clone().multiplyScalar(.15)), A.clone().lerp(D, .66).sub(side.clone().multiplyScalar(.15)), D, 4.4);
            pos.copy(A); c.heading = Math.atan2(dir.x, dir.z); c.phase = 'flyby';
          }
        }
        break;
      case 'flyby': if (follow()){ c.phase = 'away'; c.timer = 5 + Math.random()*10; } break;
      case 'arrive': if (follow()){ c.phase = 'parked'; c.timer = 6 + Math.random()*10; } break;
      case 'parked':
        c.timer -= dt;
        if (c.timer <= 0){
          // pick where to leave for, then spool up: hover up a little and turn to face that way
          c.exit = offscreen(c.cruise); c.hoverFrom = pos.clone(); c.k = 0; c.phase = 'spool';
          c.exitHeading = Math.atan2(c.exit.x - pos.x, c.exit.z - pos.z);
        }
        break;
      case 'spool': {
        c.k = Math.min(1, c.k + dt/1.8); const u = c.k*c.k*(3 - 2*c.k);
        pos.copy(c.hoverFrom).setY(c.hoverFrom.y + .25*u);
        let dh = c.exitHeading - c.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        c.heading += dh*Math.min(1, dt*2.5);
        if (c.k >= 1){
          const dir = new THREE.Vector3(Math.sin(c.exitHeading), 0, Math.cos(c.exitHeading));
          startCurve(c, pos, pos.clone().setY(c.cruise - .3), new THREE.Vector3(pos.x, c.cruise, pos.z).addScaledVector(dir, 5), c.exit, 3.8);
          c.pad.busy = false; c.pad = null; c.phase = 'depart';
        }
        break;
      }
      case 'depart': if (follow()){ c.phase = 'away'; c.timer = 6 + Math.random()*12; } break;
    }
    // face the direction of travel, turning smoothly (keep the last heading while rising or sinking straight)
    const vx = (pos.x - _prev.x)/Math.max(dt, 1e-4), vz = (pos.z - _prev.z)/Math.max(dt, 1e-4), vh = Math.hypot(vx, vz);
    if (vh > .25 && c.phase !== 'spool'){ let dh = Math.atan2(vx, vz) - (c.heading||0); dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.turn = dh; c.heading = (c.heading||0) + dh*Math.min(1, dt*3); }
    else c.turn = 0;
    c.g.rotation.y = c.heading || 0;
    // pods follow forward speed: straight down when hovering, swinging back as the car picks up speed
    const podTarget = .95*Math.min(1, vh/3.2);
    c.tilt = (c.tilt || 0) + (podTarget - (c.tilt || 0))*Math.min(1, dt*2);
    for (const pv of c.pods) pv.rotation.x = c.tilt;
    // bank into turns, a slight nose-down lean when speeding up; beat-up ones wobble
    const bankT = Math.max(-.25, Math.min(.25, -(c.turn||0)*1.5)) + (c.wobble ? Math.sin(t*3.1 + (c.len||0))*.05 : 0);
    c.bank = (c.bank || 0) + (bankT - (c.bank || 0))*Math.min(1, dt*2.5);
    c.g.rotation.z = c.bank;
    c.g.rotation.x = .05*Math.min(1, vh/4);
    for (const f of c.flick) f.visible = Math.sin(t*23 + (c.len||0)*7) + Math.sin(t*7.7) > -.6;
  }
}
function resetTrips(){ tripCars.forEach((c,i) => { if (c.pad) c.pad.busy = false; c.pad = null; c.phase = 'away'; c.g.visible = false; c.timer = 2 + i*3 + Math.random()*3; }); }
/* ---------- vehicle shadows ---------- */
// Moving things casting into the real shadow map would force the whole city's shadows to redraw every frame.
// Instead each car and drone drops a flat pixel shadow, cast along the sun's direction onto whatever roof or
// street is below it: 8 quads in one draw call. The shape darkens what is under it by the same amount the
// city's own shadows do, and fades with height and at night.
const VSH_MAX = 16;
const vShadow = (() => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { strength: { value: .6 }, tint: { value: new THREE.Color(.42, .47, .66) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    // a hard-edged rounded shape, stepped like a pixel sprite (no soft falloff)
    fragmentShader: 'uniform float strength; uniform vec3 tint; varying vec2 vUv; void main(){ vec2 d = (vUv - .5)*2.0; vec2 q = abs(d); float r = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 1.0/3.0); if (r > 1.0) discard; gl_FragColor = vec4(mix(vec3(1.0), tint, strength), 1.0); }',
    blending: THREE.MultiplyBlending, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-PI/2);
  const m = new THREE.InstancedMesh(geo, mat, VSH_MAX);
  m.layers.set(1); m.frustumCulled = false; m.renderOrder = 1;
  scene.add(m);
  return m;
})();
// the height of whatever is below a point: a roof, the street, or nothing (open sky off the platform)
function surfaceAt(x, z){
  const c = cells.get(ckey(Math.round(x/LOT), Math.round(z/LOT)));
  if (!c) return null;
  if (c.mega) return c.height;
  if (c.sections.length && Math.abs(x - c.x) < SIDE/2 && Math.abs(z - c.z) < SIDE/2) return c.height;
  return CURB + .06;
}
const _vs = new THREE.Vector3(), _vf = new THREE.Vector3(), _vm = new THREE.Matrix4(), _vq = new THREE.Quaternion(), _vsc = new THREE.Vector3(), _vup = new THREE.Vector3(0,1,0);
function updateVehicleShadows(){
  const sd = _vs.copy(SUN_DIR);
  vShadow.material.uniforms.strength.value = .8 * Math.min(1, sun.intensity/1.1);
  let n = 0;
  const cast = (g, len, wid) => {
    if (n >= VSH_MAX || !g.visible || sd.y < .15) return;
    const p = g.position;
    // walk down the sun ray: guess the surface height, land on it, re-check the height there
    let h = surfaceAt(p.x, p.z), x = p.x, z = p.z;
    for (let k = 0; k < 3 && h !== null; k++){
      const t = (p.y - h)/sd.y; x = p.x - sd.x*t; z = p.z - sd.z*t;
      const h2 = surfaceAt(x, z); if (h2 === h) break; h = h2;
    }
    if (h === null || h > p.y - .05) return;
    const lift = p.y - h, fade = Math.max(.45, 1 - lift/14);
    _vf.set(0, 0, 1).applyQuaternion(g.quaternion);
    _vq.setFromAxisAngle(_vup, Math.atan2(_vf.x, _vf.z));
    _vm.compose(_vsc.set(x, h + .015, z), _vq, new THREE.Vector3(wid*fade, 1, len*fade));
    vShadow.setMatrixAt(n++, _vm);
  };
  for (const c of tripCars) cast(c.g, c.len0 || 1.05, .5);
  for (const c of cars) cast(c.g, c.len0 || 1.05, .5);
  for (const d of drones) cast(d.g, .42, .42);
  vShadow.count = n;
  vShadow.instanceMatrix.needsUpdate = true;
}

function updateCars(t){
  for (const c of cars){
    const a = c.ph + t*c.sp, x = Math.cos(a)*c.r, z = Math.sin(a)*c.r;
    c.g.position.set(x, c.h + Math.sin(t*1.3+c.ph)*.2 + (c.wobble ? Math.sin(t*5.3+c.ph)*.04 : 0), z);
    const dir = Math.sign(c.sp);
    c.g.rotation.y = Math.atan2(-Math.sin(a)*dir, Math.cos(a)*dir);
    c.g.rotation.z = -dir*.12 + (c.wobble ? Math.sin(t*3.1+c.ph)*.06 : 0);      // bank into the turn; beat-up ones wobble
    for (const pv of c.pods) pv.rotation.x = .95 + Math.sin(t*1.7+c.ph)*.06;       // cruising: thrusters tilted back
    for (const f of c.flick) f.visible = Math.sin(t*23 + c.ph*7) + Math.sin(t*7.7) > -.6;   // sputtering thruster
  }
}

// Steam: every puff from every chimney in one batch of points, updated in place each frame
const STEAM_PER = 6;
let steamPts = null, steamLife = null, steamWob = null, steamSrc = [];
const steamMat = new THREE.ShaderMaterial({
  uniforms: { map:{ value: glowTex }, color:{ value: new THREE.Color(0xeef0ee) }, scale: GLOW_PTS_UNI.scale },
  vertexShader: 'attribute float size; attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; }',
  fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < .01) discard; gl_FragColor = vec4(color, a); }',
  transparent: true, depthWrite: false,
});
function setupSteam(){
  if (steamPts){ scene.remove(steamPts); steamPts.geometry.dispose(); steamPts = null; }
  steamSrc = emitters.slice();
  const n = steamSrc.length*STEAM_PER; if (!n) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  steamLife = new Float32Array(n); steamWob = new Float32Array(n);
  for (let i=0;i<n;i++){ steamLife[i] = (i % STEAM_PER)/STEAM_PER; steamWob[i] = Math.random()*TAU; }
  steamPts = new THREE.Points(g, steamMat); steamPts.layers.set(1); steamPts.frustumCulled = false; scene.add(steamPts);
}
const steamCol = new THREE.Color();
function updateSteam(dt, night){
  if (!steamPts) return;
  steamMat.uniforms.color.value.setRGB(1,1,1).lerp(steamCol.set(0x6a7596), night);
  const P = steamPts.geometry.attributes.position.array, Sz = steamPts.geometry.attributes.size.array, A = steamPts.geometry.attributes.alpha.array;
  for (let i=0;i<steamLife.length;i++){
    let L = steamLife[i] + dt*.32; if (L > 1) L -= 1; steamLife[i] = L;
    const e = steamSrc[(i/STEAM_PER)|0];
    P[i*3] = e.x + L*.7 + Math.sin(steamWob[i] + L*4)*.08; P[i*3+1] = e.y + L*2.3; P[i*3+2] = e.z + L*.2;
    Sz[i] = .45 + L*1.5; A[i] = Math.min(1, L*6)*(1 - L)*.75;
  }
  steamPts.geometry.attributes.position.needsUpdate = true; steamPts.geometry.attributes.size.needsUpdate = true; steamPts.geometry.attributes.alpha.needsUpdate = true;
}

const RN = 800, rainPos = new Float32Array(RN*6), rainDrops = [];
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos,3));
for (let i=0;i<RN;i++) rainDrops.push({ x:(Math.random()-.5)*40, y:Math.random()*20-3, z:(Math.random()-.5)*40, v:14+Math.random()*6 });
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color:0x9fc3e8, transparent:true, opacity:.28, blending:THREE.AdditiveBlending, depthWrite:false }));
rain.layers.set(1); rain.frustumCulled = false; scene.add(rain);
function updateRain(dt){
  rain.visible = false; return;   // rain is now drawn in the composite (see "rain: pixel streaks")
  for (let i=0;i<RN;i++){
    const d = rainDrops[i]; d.y -= d.v*dt; d.x -= d.v*dt*.08; if (d.y < -3){ d.y = 17; d.x = (Math.random()-.5)*40; }
    const o = i*6; rainPos[o]=d.x; rainPos[o+1]=d.y; rainPos[o+2]=d.z; rainPos[o+3]=d.x+.06; rainPos[o+4]=d.y+.6; rainPos[o+5]=d.z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}
