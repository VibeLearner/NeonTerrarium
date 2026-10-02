// Neon Terrarium: Shared state, random numbers, renderer, materials and the geometry kit.
// All game scripts share one scope and load in order (see index.html).
'use strict';
const PI = Math.PI, TAU = PI * 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = { seed: 20260930, district: 'mixed', clutter: 1, green: 1, neon: 1,
  zone: null, hour: 15.5, wind: 1, cloudQ: 2, vclouds: true, rays: true, bloom: true, rim: true, grade: true, lights: true, ao: true, mist: true, wetOn: true, rain: false, cycle: false, outlines: true, palette: false, spin: false, paint: false, res: 480 };

/* ---------- seeded random ---------- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let R = mulberry32(S.seed);
const rnd = (a=0,b=1) => a + (b-a)*R();
const chance = p => R() < p;
const pick = arr => arr[Math.floor(R()*arr.length)];
const irand = (a,b) => Math.floor(rnd(a, b+1));

/* ---------- renderer ---------- */
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
// The view is orthographic, so the camera's distance changes nothing on screen; it only sets how deep the drawn
// slab is. It reaches far in front of and behind the point looked at, so a tall building on the near side of a big
// city is never clipped away while it's still in frame. (It used to reach 42 units in front and 53 behind, which cut
// off tall buildings near the camera as the view turned or panned.) Depth stays precise to well under a millimetre.
const NEAR = 10, FAR = 900, CAM_DIST = 400, PITCH = 32 * PI/180, TARGET_Y = 2.4;
const cam = new THREE.OrthographicCamera(-1,1,1,-1,NEAR,FAR);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
// the sun's view reaches 260 units toward it (see SUN_BACK in sky.js) and 340 past the view's middle; the depth bias
// is the old one scaled to this deeper range, so shadows sit as tightly to their casters as before
Object.assign(sun.shadow.camera, { left:-17, right:17, top:17, bottom:-17, near:1, far:600 });
sun.shadow.bias = -0.0008*110/600; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemi);

/* ---------- materials ---------- */
const gData = new Uint8Array([72,72,72,255, 150,150,150,255, 255,255,255,255]);
const gradTex = new THREE.DataTexture(gData, 3, 1, THREE.RGBAFormat);
gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.generateMipmaps = false; gradTex.needsUpdate = true;
const ALL_MATS = [];
// Lights come on one by one as evening falls (and go off one by one at dawn). Each light gets a switch-on point
// from where it stands, hashed by a cell of about one room; it's lit once LIGHTS_ON (the evening, 0 by day to 1 at
// night) passes it. A lamp, its halo and the light it throws share a cell, so they come on together.
const LIGHTS_ON = { value: 1 };
const LIT_GLSL = `
  float litOn(float thr, float lv, float tm){
    float dv = lv - thr, on = clamp(dv*40.0, 0.0, 1.0);
    if (dv > 0.0 && dv < 0.04) on *= step(0.4, fract(sin(thr*917.3 + floor(tm*9.0))*43758.5453));   // a stutter as it catches
    return on;
  }`;
function litOrder(x, y, z){ let h = Math.imul(Math.floor(x/.9), 73856093) ^ Math.imul(Math.floor(y/.95), 19349663) ^ Math.imul(Math.floor(z/.9), 83492791); h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return 46 + ((h >>> 0) % 185); }   // a byte: .18 to .9 of the way into the evening
const EM_KIND = { window:1, bulb:2, neon:3, trim:4, blink:6 };   // anything else that glows is kind 5 (fixed brightness)
const EM_I = { value: [0, .22, .3, .6, .45, 1.3, 1.7] };
// Aircraft-warning lights: red lights that blink on and off together, with the blink travelling up the height of
// a structure (a light's phase comes from its height), so a tower's lights chase upward.
const BLINK_GLSL = `float blink(float y, float t){ return step(fract(t*0.7 - y*0.045), 0.34); }`;

function toon(hex, o={}){
  const m = new THREE.MeshToonMaterial({ color:hex, gradientMap:gradTex });
  if (o.em){ m.emissive = new THREE.Color(o.em); m.emissiveIntensity = 1; m.userData.glow = o.kind; }
  ALL_MATS.push(m); return m;
}
const M = {
  paving: toon(0xa99e89), rock: toon(0x6e5a4a,{flat:1}), rockDark: toon(0x4d4038,{flat:1}),
  wallWarm: toon(0xC9B89A), wallLight: toon(0xE3D6BD), wallGray: toon(0xa39d90), wallPatch: toon(0xA0603A), wallCorr: toon(0x7d8b8c),
  wallWhite: toon(0xEEF0EE), wallWhite2: toon(0xdde3e1),
  wallInd: toon(0x5f7d5b), wallIndDark: toon(0x455a4b), wallRust: toon(0x8A4A2A),
  trim: toon(0xE3D6BD), metal: toon(0x7a8290), metalDark: toon(0x3a4252), rust: toon(0x8A4A2A), wood: toon(0x7a5a3a),
  green1: toon(0x3F5A2C,{flat:1}), green2: toon(0x6B8A3A,{flat:1}), green3: toon(0x8FA04A,{flat:1}), trunk: toon(0x6a4a32,{flat:1}),
  grass: toon(0x6B8A3A), pot: toon(0xA0603A),
  glassDark: toon(0x2c3a52), glassTeal: toon(0x2b4a55),
  winLit: toon(0x5a4630,{em:0xFFCF7A, kind:'window'}),
  bulb: toon(0x5a4630,{em:0xFFCF7A, kind:'bulb'}),
  neonPink: toon(0x5a1d3a,{em:0xFF4FA3, kind:'neon'}), neonCyan: toon(0x145452,{em:0x38E8E0, kind:'neon'}), neonAmber: toon(0x5a3e18,{em:0xFFB347, kind:'neon'}),
  trimCyan: toon(0x2a5452,{em:0x7FE8E0, kind:'trim'}),
  thruster: toon(0x1a3050,{em:0x5ab8ff, kind:'thruster'}),
  padGlow: toon(0x16243a,{em:0x2f6aa8, kind:'thruster'}), slabSide: toon(0x4c505a), slabSeam: toon(0x353840),
  cloth1: toon(0xFF7FB0), cloth2: toon(0xEEF0EE), cloth3: toon(0x6fa8dc), cloth4: toon(0xF6B35C),
  awn1: toon(0xc95a7a), awn2: toon(0x3f8f8a), awn3: toon(0xd98b3a),
  crate: toon(0x9a7a52), veg1: toon(0x8FA04A,{flat:1}), veg2: toon(0xF6B35C,{flat:1}), veg3: toon(0xd9534f,{flat:1}),
  cloud: toon(0xffffff,{flat:1}), pad: toon(0x3a4252),
};
const CLOTH = [M.cloth1,M.cloth2,M.cloth3,M.cloth4];
const AWN = [M.awn1,M.awn2,M.awn3];
const VEG = [M.veg1,M.veg2,M.veg3];
const greenMat = () => pick([M.green1,M.green2,M.green3]);
// Detail levels for zooming out. At 480 lines a zoomed-out city gets only a few pixels per floor, so one-pixel
// details (railings, cables, window frames, small plants, crease outlines) turn to noise. Past the default zoom
// these thin out gradually until the city reads as clean blocks of colour and light. 0 = full detail, 1 = far.
const LOD = { fine: { value: 0 }, plants: { value: 0 }, lines: { value: 0 } };
// Thin and tiny pieces carry an id (1-255, 0 = always kept); as LOD.fine rises, more of them are dropped.
// A dropped piece's triangles are moved outside the view in the vertex shader, which costs nothing.
const LOD_CULL_GLSL = 'if (aFine > 0.5 && lodFine*255.0 > aFine) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);';
const normalMat = new THREE.MeshNormalMaterial();
normalMat.onBeforeCompile = sh => {
  sh.uniforms.lodFine = LOD.fine;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFine; uniform float lodFine;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + LOD_CULL_GLSL);
};

/* ---------- glow billboards ---------- */
const glowTex = (() => { const c=document.createElement('canvas'); c.width=c.height=32; const g=c.getContext('2d');
  const gr=g.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.3,'rgba(255,255,255,.5)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,32,32); return new THREE.CanvasTexture(c); })();
const GLOW = {};
[['pink',0xFF4FA3],['cyan',0x38E8E0],['amber',0xFFB347],['warm',0xFFCF7A],['blue',0x5ab8ff],['red',0xff2a2a],['blink',0xff2a2a],['orange',0xff6a14],['green',0x4aff7a]].forEach(([k,hex]) => {
  GLOW[k] = new THREE.SpriteMaterial({ map:glowTex, color:hex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true });
});
const NEON_GLOW = new Map([[M.neonPink,'pink'],[M.neonCyan,'cyan'],[M.neonAmber,'amber']]);

/* ---------- geometry kit ---------- */
const U = {
  box: new THREE.BoxGeometry(1,1,1).toNonIndexed(),
  cyl: new THREE.CylinderGeometry(.5,.5,1,8).toNonIndexed(),
  sph: new THREE.SphereGeometry(.5,8,6).toNonIndexed(),
  blob: new THREE.IcosahedronGeometry(.5,0),
};
const rbCache = new Map();
function roundedBox(w,h,d,r){
  const key = [w,h,d,r].map(v=>v.toFixed(2)).join('_');
  if (rbCache.has(key)) return rbCache.get(key);
  const b = Math.min(r*0.6, h*0.2, 0.08);
  const sw = w-2*b, sd = d-2*b;
  const rr = Math.max(0, Math.min(r, sw/2-0.01, sd/2-0.01));
  const s = new THREE.Shape(), x=-sw/2, y=-sd/2;
  if (rr > 0.02){
    s.moveTo(x+rr,y); s.lineTo(x+sw-rr,y); s.absarc(x+sw-rr,y+rr,rr,-PI/2,0,false);
    s.lineTo(x+sw,y+sd-rr); s.absarc(x+sw-rr,y+sd-rr,rr,0,PI/2,false);
    s.lineTo(x+rr,y+sd); s.absarc(x+rr,y+sd-rr,rr,PI/2,PI,false);
    s.lineTo(x,y+rr); s.absarc(x+rr,y+rr,rr,PI,1.5*PI,false);
  } else { s.moveTo(x,y); s.lineTo(x+sw,y); s.lineTo(x+sw,y+sd); s.lineTo(x,y+sd); s.lineTo(x,y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01,h-2*b), bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:1, curveSegments:2 });
  g.rotateX(-PI/2);
  g.translate(0, -(h-2*b)/2, 0);
  rbCache.set(key, g); return g;
}

let buckets = new Map();
// Each primitive is transformed straight into its material's vertex list (no per-primitive geometry objects),
// which keeps generating a building quick enough to do mid-click.
const _nm = new THREE.Matrix3();
// Dark streets: a few plots have almost no light. While one is generated, DARK is set: most of its lamps, windows,
// neon and trim are swapped for unlit look-alikes (picked by position, so the same ones stay off), and whatever
// still glows flickers badly. KEEP_LIGHT protects a light from going out (the street lamp: it flickers instead).
let DARK = false, KEEP_LIGHT = false;
const DARK_SUB = { window: toon(0x22303f), bulb: toon(0x3d3226), neon: toon(0x2a2230), trim: toon(0x2c3438) };
const posHash = (x, y, z) => hash('lit', Math.round(x*20), Math.round(y*20), Math.round(z*20)) % 100;
function put(geo, mat, m){
  if (DARK && !KEEP_LIGHT && mat.userData && DARK_SUB[mat.userData.glow] && posHash(m.elements[12], m.elements[13], m.elements[14]) < 82) mat = DARK_SUB[mat.userData.glow];
  let b = buckets.get(mat); if (!b){ b = { p: [], n: [], d: [], f: mat.userData && mat.userData.glow ? [] : null, o: mat.userData && mat.userData.glow ? [] : null }; buckets.set(mat, b); }
  const fid = b.f ? (DARK && mat.userData.glow !== 'blink' ? heavyFlickerId() : flickerId(mat.userData.glow)) : 0;
  const did = b.f ? 0 : detailId(geo, m), ord = b.f ? litOrder(m.elements[12], m.elements[13], m.elements[14]) : 0;   // lights are never dropped: they carry the look from far away
  const P = geo.attributes.position.array, N = geo.attributes.normal ? geo.attributes.normal.array : null, idx = geo.index ? geo.index.array : null;
  const e = m.elements, ne = _nm.getNormalMatrix(m).elements, bp = b.p, bn = b.n;
  const cnt = idx ? idx.length : P.length/3;
  for (let q=0;q<cnt;q++){
    const v = (idx ? idx[q] : q)*3, x = P[v], y = P[v+1], z = P[v+2];
    bp.push(e[0]*x + e[4]*y + e[8]*z + e[12], e[1]*x + e[5]*y + e[9]*z + e[13], e[2]*x + e[6]*y + e[10]*z + e[14]);
    if (N){ const a = N[v], c = N[v+1], d = N[v+2];
      const nx = ne[0]*a + ne[3]*c + ne[6]*d, ny = ne[1]*a + ne[4]*c + ne[7]*d, nz = ne[2]*a + ne[5]*c + ne[8]*d, l = Math.hypot(nx, ny, nz) || 1;
      bn.push(nx/l, ny/l, nz/l); }
    else bn.push(0, 1, 0);
    if (b.f){ b.f.push(fid); b.o.push(ord); }
    b.d.push(did);
  }
}
// Is this piece a fine detail? Sticks (two thin sides: posts, rails, cables, frames, pipes) and tiny bits
// (small in every direction). Flat panels, with only one thin side, are kept: they read even when small.
function detailId(geo, m){
  let s = geo.userData._size;
  if (!s){ geo.computeBoundingBox(); const bb = geo.boundingBox; s = geo.userData._size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]; }
  const e = m.elements;
  const d = [Math.hypot(e[0], e[1], e[2])*s[0], Math.hypot(e[4], e[5], e[6])*s[1], Math.hypot(e[8], e[9], e[10])*s[2]].sort((a, b) => a - b);
  return (d[1] < .09 || d[2] < .14) ? 1 + Math.floor(Math.random()*255) : 0;
}
// which lights flicker: some neon, fewer lamps and trims, the odd window (Math.random, so the city's layout
// randomness is untouched)
const FLK_ODDS = { neon: .08, bulb: .06, trim: .03, window: .02 };
function flickerId(kind){ return Math.random() < (FLK_ODDS[kind] || 0) ? 1 + Math.floor(Math.random()*198) : 0; }
// ids 200 to 254 flicker hard and often: the failing lights of a dark street
const heavyFlickerId = () => 200 + Math.floor(Math.random()*55);
function bucketGeometry(b){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  if (b.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));   // floor decals
  return g;
}
const _p=new THREE.Vector3(), _q=new THREE.Quaternion(), _e=new THREE.Euler(), _s=new THREE.Vector3();
function T(x=0,y=0,z=0,ry=0,sx=1,sy=1,sz=1,rx=0,rz=0){ _e.set(rx,ry,rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x,y,z), _q, _s.set(sx,sy,sz)); }
const under = (P,L) => P.clone().multiply(L);
const I4 = new THREE.Matrix4();
const MIN_T = .052; // about one render pixel at 480p
function box(mat,P,x,y,z,w,h,d,ry=0,rx=0,rz=0){ put(U.box, mat, under(P, T(x,y,z,ry,Math.max(w,MIN_T),Math.max(h,MIN_T),Math.max(d,MIN_T),rx,rz))); }
function cyl(mat,P,x,y,z,r,h,rx=0,rz=0){ r = Math.max(r, MIN_T/2); put(U.cyl, mat, under(P, T(x,y,z,0,2*r,h,2*r,rx,rz))); }
function sph(mat,P,x,y,z,r,sy=1){ put(U.sph, mat, under(P, T(x,y,z,0,2*r,2*r*sy,2*r))); }
function blob(mat,P,x,y,z,r,sy=1){ put(U.blob, mat, under(P, T(x,y,z,rnd(0,TAU),2*r,2*r*sy,2*r,rnd(0,1)))); }

let city = null, glowGroup = null, emitters = [];
// Places where people can stand or sit (bench seats, stall keepers' and customers' spots), noted while a piece is
// generated: world position, which way they face, and what kind of spot it is. See people.js.
let curSpots = null;
const _sv = new THREE.Vector3(), _sd = new THREE.Vector3();
function spotAt(P, x, y, z, kind, stall = null, face = [0, 1]){
  if (!curSpots) return;
  _sv.set(x, y, z).applyMatrix4(P);
  const fl = face === 'origin' ? [-x, -z] : face;   // 'origin': facing the middle of P (a cart, a table)
  _sd.set(fl[0], 0, fl[1]).transformDirection(P);
  curSpots.push({ x: _sv.x, y: _sv.y, z: _sv.z, fx: _sd.x, fz: _sd.z, kind, stall });
}
