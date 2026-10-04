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
/* ---------- hover cars: real car bodies on hover pads, in several kinds ---------- */
// Each body is a side silhouette pushed out to the car's width (a painted lower body, a glass cabin set a touch in from
// the sides, a roof panel and pillars over it), riding on hover pads underneath instead of wheels. Kinds: a low wedge
// sports car (std), a checkered yellow taxi with a roof sign and ducted fans, a long black limousine with gold trim
// (lux), a tall rounded family minivan (van) and a beat-up old sedan (beat). The pads are pivot groups the flight code
// tilts (back while cruising, straight down to land, park and take off).
U.taper = new THREE.CylinderGeometry(.18, .5, 1, 16).toNonIndexed();
const CARM = {
  strip: toon(0x606060, { em:0xfff0d8, kind:'thruster' }),
  head:  toon(0x707070, { em:0xfff4dc, kind:'thruster' }),
  tail:  toon(0x401010, { em:0xff3030, kind:'thruster' }),
  taxiSign: toon(0x5a3e18, { em:0xffd060, kind:'thruster' }),
  std:  [toon(0x24272e), toon(0x9a1f26), toon(0xd8dade), toon(0x1f4a7a), toon(0x3a7a5a), toon(0xd8782a)],   // the first few are the ones the highway traffic uses
  taxi: [toon(0xe8b830)],
  lux:  [toon(0x16171c), toon(0x4a1626), toon(0x1a2448), toon(0xe8e6e0)],
  beat: [toon(0x8A4A2A), toon(0x7d8b8c), toon(0x6b6048), toon(0x5a6a58)],
  van:  [toon(0x2e3d55), toon(0xd9d2c0), toon(0x3f6a6a), toon(0xb8503a), toon(0x8a9098)],
  chrome: toon(0xb8c0c8), gold: toon(0xc9a24a), black: toon(0x15161a), under: toon(0x22252c), grille: toon(0x0e0f12),
  check: toon(0x17181c), seat: toon(0x8a7a62),
};
function carPart(g, geo, mat, x, y, z, sx, sy, sz, rx=0, ry=0, rz=0){
  const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.set(rx,ry,rz); g.add(m); return m;
}
function carSprite(g, mat, x, y, z, sc){ const sp = new THREE.Sprite(mat); sp.position.set(x,y,z); sp.scale.set(sc,sc,1); sp.layers.set(1); g.add(sp); return sp; }
// a side silhouette ([z, y] points, nose toward +z) pushed out to width w, centred on x = 0 (cached by its shape)
const carProfileCache = new Map();
function carProfile(pts, w, bev = .012){
  const key = JSON.stringify(pts) + w + bev;
  let geo = carProfileCache.get(key);
  if (!geo){
    const sh = new THREE.Shape(); pts.forEach(([z, y], k) => k ? sh.lineTo(z, y) : sh.moveTo(z, y));
    const d = Math.max(.01, w - 2*bev);
    geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev*.8, bevelSegments: 1, curveSegments: 4 });
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(-PI/2)); geo.translate(d/2, 0, 0);
    geo.computeVertexNormals(); carProfileCache.set(key, geo);
  }
  return geo;
}
// the shapes, per kind: the painted body up to the waist, the glass cabin over it, the roof panel's span, door seams
const CAR_SHAPES = {
  std: { L: 1.04, W: .46, pads: 2,
    body: [[-.52,-.05],[.5,-.06],[.54,-.01],[.52,.04],[.3,.08],[.12,.11],[-.4,.13],[-.53,.12],[-.54,.03]],
    cab:  [[.16,.105],[-.02,.215],[-.22,.21],[-.42,.125]], roof: [-.2, -.02], roofY: .212, seams: [.02, -.2], belt: .1 },
  taxi: { L: 1.0, W: .44, pads: 2,
    body: [[-.5,-.06],[.48,-.06],[.52,-.01],[.51,.06],[.42,.11],[.18,.14],[-.42,.15],[-.5,.12],[-.52,.02]],
    cab:  [[.2,.135],[.04,.29],[-.3,.29],[-.42,.14]], roof: [-.29, .03], roofY: .29, seams: [.05, -.17], belt: .13 },
  lux: { L: 1.3, W: .43, pads: 3,
    body: [[-.65,-.05],[.63,-.05],[.66,0],[.65,.08],[.58,.115],[.3,.13],[-.6,.135],[-.66,.11],[-.67,.02]],
    cab:  [[.3,.125],[.17,.245],[-.5,.245],[-.6,.13]], roof: [-.49, .16], roofY: .245, seams: [.12, -.08, -.28], belt: .12 },
  van: { L: 1.06, W: .5, pads: 3,
    body: [[-.52,-.06],[.48,-.06],[.53,-.01],[.545,.06],[.52,.13],[.42,.18],[-.5,.18],[-.535,.1],[-.53,0]],
    cab:  [[.43,.17],[.22,.37],[-.46,.375],[-.51,.17]], roof: [-.45, .2], roofY: .372, seams: [.1, -.14], belt: .16 },
  beat: { L: 1.0, W: .44, pads: 2,
    body: [[-.5,-.06],[.49,-.06],[.51,0],[.5,.09],[.2,.12],[-.45,.13],[-.51,.1],[-.51,0]],
    cab:  [[.2,.115],[.09,.26],[-.3,.26],[-.43,.125]], roof: [-.29, .08], roofY: .26, seams: [.05, -.15], belt: .12 },
};
function buildCar(kind, forcedBody){
  const g = new THREE.Group(), rr = Math.random, pk = a => a[Math.floor(rr()*a.length)];
  const S_ = CAR_SHAPES[kind] || CAR_SHAPES.std, L = S_.L, W = S_.W, out = { g, flick:[], wobble: kind === 'beat' ? 1 : 0, len0: L + .05 };
  const body = forcedBody || pk(CARM[kind]), trim = kind === 'lux' ? CARM.gold : kind === 'std' ? CARM.black : CARM.chrome;
  const nose = Math.max(...S_.body.map(p => p[0])), tailZ = Math.min(...S_.body.map(p => p[0]));
  // body, cabin glass, roof panel, pillars
  carPart(g, carProfile(S_.body, W), body, 0, 0, 0, 1, 1, 1);
  carPart(g, carProfile(S_.cab, W*.9, .008), M.glassDark, 0, 0, 0, 1, 1, 1);
  const [r0, r1] = S_.roof; carPart(g, U.box, body, 0, S_.roofY + .012, (r0 + r1)/2, W*.9 + .01, .03, r1 - r0);
  for (const z of S_.seams){   // door pillars up through the glass, and the seam down the door
    const yTop = S_.roofY, yb = S_.belt;
    for (const sx of [-1, 1]){ carPart(g, U.box, body, sx*W*.45, (yb + yTop)/2, z, .03, yTop - yb, .035); carPart(g, U.box, CARM.grille, sx*(W/2 + .002), .03, z, .006, S_.belt - .02, .012); }
  }
  carPart(g, U.box, CARM.under, 0, -.07, (nose + tailZ)/2 - .01, W*.82, .035, L*.86);     // the dark underside the pads hang from
  // lights
  for (const sx of [-1, 1]){
    carPart(g, U.box, CARM.head, sx*W*.33, .04, nose - .005, W*.22, .03, .02);
    carPart(g, U.box, CARM.tail, sx*W*.34, .07, tailZ + .01, W*.2, .03, .02);
  }
  carSprite(g, GLOW.warm, 0, .03, nose + .12, .55);
  // hover pads underneath, in pairs along the car
  out.pods = [];
  const n = S_.pads, px = W*.27;
  for (let q = 0; q < n; q++){
    const pz = (n === 1 ? 0 : (q/(n - 1) - .5)*L*.62);
    for (const sx of [-1, 1]){
      const pv = new THREE.Group(); pv.position.set(sx*px, -.1, pz); g.add(pv); out.pods.push(pv);
      carPart(pv, U.cyl16, kind === 'beat' && rr() < .3 ? pk(CARM.beat) : M.frame, 0, 0, 0, .14, .035, .14);   // the pad
      carPart(pv, U.cyl16, trim === CARM.gold ? CARM.gold : M.concDD, 0, .01, 0, .155, .012, .155);           // its rim
      carPart(pv, U.cyl16, M.thruster, 0, -.02, 0, .11, .012, .11);                                            // the glowing face
      const tg = carSprite(pv, GLOW.blue, 0, -.08, 0, .38);
      if (kind === 'beat' && sx > 0 && q === 0) out.flick.push(tg);                                           // one sputtering pad
    }
  }
  // what makes each kind
  if (kind === 'taxi'){
    carPart(g, U.box, CARM.black, 0, S_.roofY + .04, -.12, .18, .025, .11);                                  // the sign's base
    carPart(g, U.box, CARM.taxiSign, 0, S_.roofY + .075, -.12, .2, .055, .1);                                // the lit TAXI sign
    carSprite(g, GLOW.amber, 0, S_.roofY + .09, -.12, .45);
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) for (const row of [0, 1])                          // checker band down the sides
      if ((i + row)%2 === 0) carPart(g, U.box, CARM.check, sx*(W/2 + .003), .045 + row*.035, -.36 + i*.09, .006, .035, .09);
    for (const sx of [-1, 1]) carPart(g, U.box, CARM.check, sx*(W/2 + .003), -.025, 0, .006, .025, L*.88);   // dark skirt stripe
    for (const sx of [-1, 1]){   // ducted fans in the front wings, and a pair high at the back
      const F = (x, y, z, r) => { carPart(g, U.torus, CARM.black, x, y, z, r, r, 1.4); carPart(g, U.cyl16, CARM.grille, x, y, z, r*.85, .02, r*.85, PI/2);
        carPart(g, U.box, M.frame, x, y, z + .006, r*.8, .012, .012); carPart(g, U.box, M.frame, x, y, z + .006, .012, r*.8, .012); };
      F(sx*W*.3, .045, nose - .03, .11); F(sx*W*.22, .16, tailZ - .01, .09);
    }
  }
  if (kind === 'lux'){
    for (const sx of [-1, 1]){
      carPart(g, U.box, CARM.gold, sx*(W/2 + .003), S_.belt - .005, -.02, .006, .012, L*.92);               // gold line along the waist
      carPart(g, U.box, CARM.gold, sx*(W/2 + .003), -.03, -.02, .006, .012, L*.9);                         // and along the sill
    }
    carPart(g, U.box, CARM.grille, 0, .045, nose + .002, W*.42, .07, .02);                                   // the tall grille
    for (let k = -2; k <= 2; k++) carPart(g, U.box, CARM.gold, k*W*.08, .045, nose + .012, .012, .07, .012);
    carPart(g, U.box, CARM.gold, 0, .085, nose + .01, W*.44, .012, .02);
    carPart(g, U.box, CARM.gold, 0, S_.roofY + .03, (r0 + r1)/2, .02, .012, r1 - r0 - .04);                 // a fine line along the roof
  }
  if (kind === 'std'){
    carPart(g, U.box, body, 0, .19, tailZ + .04, W*.95, .015, .08);                                        // rear wing
    for (const sx of [-1, 1]){
      carPart(g, U.box, CARM.black, sx*W*.36, .165, tailZ + .05, .02, .05, .03);                           // its struts
      carPart(g, U.box, CARM.grille, sx*(W/2 + .003), .035, -.16, .006, .05, .16);                         // side intakes
    }
    carPart(g, U.box, CARM.grille, 0, -.015, nose - .005, W*.6, .03, .02);                                   // a low front intake
    for (const sx of [-1, 1]){ carPart(g, U.cyl16, CARM.black, sx*W*.2, .03, tailZ - .01, .08, .03, .08, PI/2); carPart(g, U.cyl16, M.thruster, sx*W*.2, .03, tailZ - .027, .055, .01, .055, PI/2); }   // twin thrusters out the back
  }
  if (kind === 'van'){
    for (const sx of [-1, 1]) carPart(g, U.box, CARM.chrome, sx*(W/2 + .003), .02, -.02, .006, .012, L*.82);   // a rubbing strip
    carPart(g, U.box, CARM.black, 0, S_.roofY + .035, -.1, W*.55, .015, .03); carPart(g, U.box, CARM.black, 0, S_.roofY + .035, -.3, W*.55, .015, .03);   // roof bars
    for (const z of [-.3, -.05]) carPart(g, U.box, CARM.seat, 0, .21, z, W*.7, .08, .06);                   // seats seen through the glass
  }
  if (kind === 'beat'){
    carPart(g, U.box, pk([M.corrBlue, M.hazard, M.rustRed, M.cream2]), W/2 + .004, .03, rr()*.2 - .1, .006, .09, .22);   // mismatched door panel
    carPart(g, U.box, M.cream2, -W/2 - .004, .06, .1, .006, .03, .12, .3);                                  // tape patch
    carPart(g, U.box, M.rust, 0, S_.roofY + .03, -.1, .14, .008, .14);                                       // rust on the roof
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
const DRONES_MAX = 14, DRONES_MIN = 3;   // built up front; how many are out working depends on the size of the city (see droneActive)
for (let i=0;i<DRONES_MAX;i++){
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
  drones.push({ idx: i, g, red, redGlow, phase:'inside', timer:0, at:0, to:0, k:0, cruise:0, blink: Math.random()*2 });
}
let ports = [], portLots = [];
// Almost every building gets a compact drone perch: a slim mast on the roof topped by a small deck with a hangar pod.
// Masts keep the perch clear of whatever else is on the roof.
function addPerch(l){
  const sx = pick([-1,1]), sz = pick([-1,1]);
  // sized for the drone: about .6 across its rotors and .35 tall with its parcel slung under it, so the landing square is
  // .72 across and the hangar .72 deep and wide and .46 tall inside, with a doorway it fits through
  const base = new THREE.Vector3(l.x + sx*rnd(.12,.3), l.height, l.z + sz*rnd(.12,.3));
  const mast = rnd(.45,.8), P = T(base.x, base.y + mast, base.z, pick([0, PI/2, PI, -PI/2]));
  cyl(M.frame, I4, base.x, base.y + mast/2, base.z, .045, mast);
  for (const s of [-1, 1]) strut(M.frame, I4, base.x, base.y + mast*.35, base.z, base.x + s*.3, base.y + mast - .02, base.z, .02);   // braces under the deck
  box(M.concDD, P, 0, 0, 0, 1.56, .06, .82);                                     // the deck
  box(M.hazard, P, .38, .035, 0, .5, .02, .06); box(M.hazard, P, .38, .035, 0, .06, .02, .5);   // a cross on the landing square
  for (const [x, z] of [[.72, -.35], [.72, .35], [.06, -.35], [.06, .35]]){ box(M.neonCyan, P, x, .045, z, .05, .03, .05); glow(P, x, .08, z, 'cyan', .3); }
  // the hangar: walls, a roof, a lit inside, the shutter rolled up over the doorway
  const hx = -.4, hw = .8, hd = .78, hh = .52;
  box(M.shutter, P, hx, .03 + hh/2, -hd/2, hw, hh, .04); box(M.shutter, P, hx, .03 + hh/2, hd/2, hw, hh, .04);
  box(M.shutter, P, hx - hw/2, .03 + hh/2, 0, .04, hh, hd);
  box(M.metalDark, P, hx, .05 + hh, 0, hw + .06, .05, hd + .06);
  box(M.interiorCool, P, hx - hw/2 + .03, .03 + hh/2, 0, .01, hh - .1, hd - .12); glow(P, hx, .3, 0, 'cyan', .45);
  box(M.metalDark, P, hx + hw/2, .03 + hh - .05, 0, .05, .1, hd);               // the shutter, rolled up
  box(M.neonAmber, P, hx + hw/2, .03 + hh - .1, hd/2 - .04, .03, .04, .04);
  (curPorts || ports).push({ pad: new THREE.Vector3(.38, .27, 0).applyMatrix4(P), inside: new THREE.Vector3(hx, .27, 0).applyMatrix4(P), busy: false });
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
// how many drones are out on deliveries: three on a young island, up to all of them in a large city (the scale is highway.js's hwTraffic)
const droneActive = () => DRONES_MIN + Math.round((DRONES_MAX - DRONES_MIN)*Math.pow(typeof hwTraffic === 'function' ? hwTraffic(performance.now()/1000) : 0, .85));
function updateDrones(dt, t, night){
  const active = droneActive();
  for (const d of drones){
    if (ports.length < 2){ d.g.visible = false; continue; }
    const pos = d.g.position;
    _dp.copy(pos);
    switch (d.phase){
      case 'inside':
        d.timer -= dt;
        if (d.idx >= active){ d.timer = Math.max(d.timer, .5); break; }   // (the city is too small to keep this one busy yet)
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
let steamCeil = null;
function setupSteam(){
  if (steamPts){ scene.remove(steamPts); steamPts.geometry.dispose(); steamPts = null; }
  steamSrc = emitters.slice();
  // under a sky highway the steam can't rise through the deck: each source's ceiling (the deck's underside over it, or
  // none), where its puffs flatten out, spread along under the deck and fade
  steamCeil = new Float32Array(steamSrc.length).fill(1e9);
  if (typeof hwAt === 'function' && highways.length) steamSrc.forEach((e, k) => {
    for (const x of [e.x, e.x + .7]){ const i = Math.round(x/LOT), j = Math.round(e.z/LOT);
      for (const { h, k: t } of hwAt(i, j)){ const under = hwY(h.tiles[t].L) - HW_THICK - HW_GIRDER; if (under > e.y - .2) steamCeil[k] = Math.min(steamCeil[k], under); } }
  });
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
    const k = (i/STEAM_PER)|0, top = steamCeil ? steamCeil[k] - .45 : 1e9, up = e.y + L*2.3, over = Math.max(0, up - top);   // (over: how far past the deck above it)
    P[i*3] = e.x + L*.7 + Math.sin(steamWob[i] + L*4)*.08 + Math.cos(steamWob[i])*over*.9; P[i*3+1] = Math.min(up, top); P[i*3+2] = e.z + L*.2 + Math.sin(steamWob[i])*over*.9;
    Sz[i] = (.45 + L*1.5)*Math.max(.45, 1 - over*.5); A[i] = Math.min(1, L*6)*(1 - L)*.75*Math.max(0, 1 - over/1.3);
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
