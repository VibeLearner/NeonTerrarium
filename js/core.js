// Neon Terrarium: Shared state, random numbers, renderer, materials and the geometry kit.
// All game scripts share one scope and load in order (see index.html).
'use strict';
const PI = Math.PI, TAU = PI * 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = { seed: 20260930, district: 'mixed', clutter: 1, green: 1, neon: 1,
  zone: null, hour: 15.5, wind: 1, cloudQ: 2, vclouds: true, rays: true, bloom: true, rim: true, grade: true, lights: true, ao: true, mist: true, wetOn: true, rain: false, cycle: false, outlines: true, palette: false, spin: false, paint: false, res: 480, capRes: true, autoPerf: true };

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

/* ---------- drawing the city once: color and normals in one pass ---------- */
// The city used to be drawn twice a frame: once for its colors, and again for the normal image (which way every
// surface faces, for the outlines, ambient occlusion and night lights), every triangle a second time. Now the color pass
// writes both at once: each material also writes, to a second image, exactly what the normal pass drew there (the
// surface's own normal, as MeshNormalMaterial worked it out; flat "facing the camera" for plants and people). Things the
// normal pass never drew (glass, glows, sprites, light beams) leave the second image alone: see mrtWants and main.js.
// WebGL 2 only; without it the old second pass runs.
const MRT = renderer.capabilities.isWebGL2;
if (MRT){
  // a second output for every fragment shader (three declares the first without a location, which two outputs need)
  const gl = renderer.getContext(), src = gl.shaderSource.bind(gl);
  gl.shaderSource = (sh, s) => src(sh, s.replace('out highp vec4 pc_fragColor;', 'layout(location = 0) out highp vec4 pc_fragColor;\nlayout(location = 1) out highp vec4 pc_fragNormal;'));
  // every built-in material: the normal as MeshNormalMaterial computes it (normal_vert, defaultnormal_vertex), written
  // as it packs it (packNormalToRGB), at full opacity
  // (toon materials, nearly everything, already carry exactly this normal as vNormal: they reuse it rather than pass the
  // same three numbers a second time for every corner of every triangle)
  THREE.ShaderChunk.common += '\n#ifndef TOON\nvarying vec3 vMrtN;\n#endif';
  THREE.ShaderChunk.project_vertex += `
#ifndef TOON
{ vec3 mrtN = normal;
#ifdef USE_INSTANCING
  mat3 mrtM = mat3( instanceMatrix );
  mrtN /= vec3( dot( mrtM[ 0 ], mrtM[ 0 ] ), dot( mrtM[ 1 ], mrtM[ 1 ] ), dot( mrtM[ 2 ], mrtM[ 2 ] ) );
  mrtN = mrtM * mrtN;
#endif
  vMrtN = normalize( normalMatrix * mrtN ); }
#endif`;
  THREE.ShaderChunk.dithering_fragment += '\n#ifdef TOON\npc_fragNormal = vec4( normalize( normalize( vNormal ) ) * 0.5 + 0.5, 1.0 );\n#else\npc_fragNormal = vec4( normalize( normalize( vMrtN ) ) * 0.5 + 0.5, 1.0 );\n#endif';
}
// A shader material of the game's own that the normal pass drew with MeshNormalMaterial gets the same normal here:
// flat = the normal it wrote itself in the normal pass (plants and people: a flat one facing the camera).
function mrtShader(mat, flat = null, cutout = false){
  if (cutout) mat.userData.cutout = true;   // (it throws pixels away: see the opaque sort in world.js)
  if (!MRT) return mat;
  if (!flat) mat.vertexShader = mat.vertexShader.replace(/void main\(\)\s*\{/, 'varying vec3 vMrtN;\nvoid main(){ vMrtN = normalize( normalMatrix * normal );');
  const out = flat ? `pc_fragNormal = ${flat};` : 'pc_fragNormal = vec4( normalize( normalize( vMrtN ) ) * 0.5 + 0.5, 1.0 );';
  const f = mat.fragmentShader, k = f.lastIndexOf('}');
  mat.fragmentShader = (flat ? '' : 'varying vec3 vMrtN;\n') + f.slice(0, k) + out + '\n' + f.slice(k);
  mat.userData.mrt = true;
  return mat;
}
// Does this draw write the normal image? Only what the normal pass drew (layer 0, plants and people on layer 2, pieces
// mid-sweep on layer 3), with a material that knows how. A see-through one only if it blends normally: it writes the
// normal at full opacity, which with normal blending replaces what's under it, as the normal pass did.
const mrtWants = (o, m) => (o.layers.mask & 45) !== 0 && (m.userData.mrt === true || m.isMeshToonMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshNormalMaterial)
  && !(m.transparent && m.blending !== THREE.NormalBlending);

const scene = new THREE.Scene();
// World matrices are brought up to date once a frame (main.js), not by every one of the frame's passes; the scene
// itself never moves, so it doesn't force its whole tree to recompute either (see freezeTree in world.js)
scene.autoUpdate = false; scene.matrixAutoUpdate = false;
// The view is orthographic, so the camera's distance changes nothing on screen; it only sets how deep the drawn
// slab is. It reaches far in front of and behind the point looked at, so a tall building on the near side of a big
// city is never clipped away while it's still in frame. (It used to reach 42 units in front and 53 behind, which cut
// off tall buildings near the camera as the view turned or panned.) Depth stays precise to well under a millimetre.
const NEAR = 10, FAR = 900, CAM_DIST = 400, PITCH0 = 32 * PI/180, TARGET_Y = 2.4;
let PITCH = PITCH0;   // the camera's tilt: the isometric view's, unless tilt mode (Space) has it raised or lowered
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
const LIGHTS_ON = { value: 0 };
let LIGHTS_GOAL = 0;
const LIGHTS_RATE = .11;   // how far through the switch-on order it gets per second: a jump straight to night still takes about seven seconds to light up
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
// 1 in the Smooth render mode (see setRenderLines in sky.js): the shaders skip their pixel-art stepping and dithering
const SMOOTH_LOOK = { value: 0 };
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
[['pink',0xFF4FA3],['cyan',0x38E8E0],['amber',0xFFB347],['warm',0xFFCF7A],['blue',0x5ab8ff],['red',0xff2a2a],['blink',0xff2a2a],['orange',0xff6a14],['green',0x4aff7a],['gold',0xffc24a],['ivory',0xfff3dc],['lemon',0xfff25a],['rosegold',0xffaa80],['platinum',0xe2d6ff],['ember',0xff4a2a],['sodium',0xffa23a],['hazard',0xffc21a],['arc',0xcfe6ff],['toxic',0xc6ff3a],['crimson',0xff1a3a],['spill',0x8a5826],['spill2',0x7e4020],['scarlet',0xff2a1a],['rosered',0xff3a5a],['blood',0xc8101c],['redorange',0xff5230]].forEach(([k,hex]) => {
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
let curCover = null;   // while a piece is collected: the solid blocks in it, as matrices (see hideCovered in world.js)
// Each primitive is transformed straight into its material's vertex list (no per-primitive geometry objects),
// which keeps generating a building quick enough to do mid-click.
const _nm = new THREE.Matrix3();
// Dark streets: a few plots have almost no light. While one is generated, DARK is set: most of its lamps, windows,
// neon and trim are swapped for unlit look-alikes (picked by position, so the same ones stay off), and whatever
// still glows flickers badly. KEEP_LIGHT protects a light from going out (the street lamp: it flickers instead).
let DARK = false, KEEP_LIGHT = false;
let LUX = null, NO_GREEN = false;   // NO_GREEN: while a bare plot (no greenery) is generated, see world.js   // while a luxury section is generated: { mats: Map(neon -> its gold/ivory/... stand-in), glows: { kind: kind } }
const DARK_SUB = { window: toon(0x22303f), bulb: toon(0x3d3226), neon: toon(0x2a2230), trim: toon(0x2c3438) };
const posHash = (x, y, z) => hash('lit', Math.round(x*20), Math.round(y*20), Math.round(z*20)) % 100;
// Where a highway's pillar comes down onto a roof (see hwFeet), the rooftop clutter there (tanks, boxes, chimneys,
// plants) is left out, so the pillar meets the roof itself: { y, spots: [{ x, z }] } while such a plot is built, else null.
// Only small pieces above the ground floor count; walls, roof slabs and big roof forms stay.
let PUT_KEEPOUT = null;
const KEEP_R = .45;
function inKeepOut(x, y, z, r){ if (y < PUT_KEEPOUT.y) return false; for (const s of PUT_KEEPOUT.spots) if (Math.abs(x - s.x) < r + KEEP_R && Math.abs(z - s.z) < r + KEEP_R) return true; return false; }
function keptOut(geo, m){
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, e = m.elements, cx0 = (bb.min.x + bb.max.x)/2, cy0 = (bb.min.y + bb.max.y)/2, cz0 = (bb.min.z + bb.max.z)/2;
  const hx0 = (bb.max.x - bb.min.x)/2, hy0 = (bb.max.y - bb.min.y)/2, hz0 = (bb.max.z - bb.min.z)/2;
  const hx = Math.abs(e[0])*hx0 + Math.abs(e[4])*hy0 + Math.abs(e[8])*hz0, hz = Math.abs(e[2])*hx0 + Math.abs(e[6])*hy0 + Math.abs(e[10])*hz0;
  if (hx > .85 || hz > .85) return false;                                                    // (a big piece: part of the building)
  const hy = Math.abs(e[1])*hx0 + Math.abs(e[5])*hy0 + Math.abs(e[9])*hz0;
  const x = e[0]*cx0 + e[4]*cy0 + e[8]*cz0 + e[12], y = e[1]*cx0 + e[5]*cy0 + e[9]*cz0 + e[13], z = e[2]*cx0 + e[6]*cy0 + e[10]*cz0 + e[14];
  return inKeepOut(x, y - hy, z, Math.max(hx, hz));
}
function put(geo, mat, m, lean){
  if (PUT_KEEPOUT && keptOut(geo, m)) return;
  if (LUX){ let sub = LUX.mats.get(mat); if (!sub && LUX.auto && mat.userData && mat.userData.glow) sub = LUX.auto(mat); if (sub){ mat = sub; if (LUX.halo) LUX.halo(sub, m); } }
  if (DARK && !KEEP_LIGHT && mat.userData && DARK_SUB[mat.userData.glow] && posHash(m.elements[12], m.elements[13], m.elements[14]) < 82) mat = DARK_SUB[mat.userData.glow];
  let b = buckets.get(mat); if (!b){ b = { p: [], n: [], d: [], f: mat.userData && mat.userData.glow ? [] : null, o: mat.userData && mat.userData.glow ? [] : null }; buckets.set(mat, b); }
  const fid = b.f ? (DARK && mat.userData.glow !== 'blink' ? heavyFlickerId() : flickerId(mat.userData.glow)) : 0;
  const did = b.f ? 0 : detailId(geo, m), ord = b.f ? litOrder(m.elements[12], m.elements[13], m.elements[14]) : 0;   // lights are never dropped: they carry the look from far away
  if (curCover && geo === U.box && did === 0 && atlasable(mat) && !mat.userData.colorOnly) curCover.push(m.elements.slice());   // a solid block: may hide what's inside it (see hideCovered)
  const bp = b.p, base = bp.length/3, w = weldOf(geo);
  bucketIndexUpTo(b);
  const nFull = pushCorners(b, geo, w, m, fid, ord, did);
  const bi = b.i, tri = w.tri; for (let q = 0; q < tri.length; q++) bi.push(base + tri[q]);
  b.ni = bp.length/3;
  // far order (neverseen-like cheats, round 8 item 3): a lean twin of a round part (fewer sides), and the thin sticks, noted for the second layout of the plot (world.js sideLayoutGen)
  if (FAR_CFG.lean && atlasable(mat)){
    const le = lean || LEAN_OF.get(geo);
    if (le && (lean || leanOk(geo, m))){ const lg = lean || le, w2 = weldOf(lg), base2 = bp.length/3, n2 = pushCorners(b, lg, w2, m, fid, ord, did), t2 = w2.tri;
      const li = b.li || (b.li = []), lr = b.lr || (b.lr = []); for (let q = 0; q < t2.length; q++) li.push(base2 + t2[q]); lr.push(base, base + nFull, base2, base2 + n2); b.ni = bp.length/3; }
  }
  if (FAR_CFG.sticks && did > 0 && LAST_STICK && atlasable(mat)){ (b.sk || (b.sk = [])).push(base, base + nFull); }
}
// a shape's corners, transformed, onto the end of a bucket's lists; how many
function pushCorners(b, geo, w, m, fid, ord, did){
  const P = geo.attributes.position.array, N = geo.attributes.normal ? geo.attributes.normal.array : null, src = w.src, bp = b.p, bn = b.n;
  const e = m.elements, ne = _nm.getNormalMatrix(m).elements;
  // each corner once (the shape's welded corners), and its triangles as indices into them: the same triangles in the same
  // order as before, but a corner shared by two triangles of a face is stored, and transformed on the card, only once
  for (let q=0;q<src.length;q++){
    const v = src[q]*3, x = P[v], y = P[v+1], z = P[v+2];
    bp.push(e[0]*x + e[4]*y + e[8]*z + e[12], e[1]*x + e[5]*y + e[9]*z + e[13], e[2]*x + e[6]*y + e[10]*z + e[14]);
    if (N){ const a = N[v], c = N[v+1], d = N[v+2];
      const nx = ne[0]*a + ne[3]*c + ne[6]*d, ny = ne[1]*a + ne[4]*c + ne[7]*d, nz = ne[2]*a + ne[5]*c + ne[8]*d, l = Math.hypot(nx, ny, nz) || 1;
      bn.push(nx/l, ny/l, nz/l); }
    else bn.push(0, 1, 0);
    if (b.f){ b.f.push(fid); b.o.push(ord); }
    b.d.push(did);
  }
  return src.length;
}
// Round parts with a lean twin (round 8 item 3, a cheat: the overlay test "full round parts"): the 16-sided cylinder has an 8-sided one (the same circle, every second corner), a rounded plate a coarser corner.
// A twin is made only for a part small enough that the two outlines are within a quarter of a pixel of each other at the zoom where the lean ones start to be drawn (LEAN_LIM, in world units a pixel).
const FAR_CFG = { lean: true, sticks: true }, LEAN_OF = new Map(), LEAN_LIM = .0227, STICK_LIM = .035;
const LEAN_R = { cyl16: .098 };   // (a 16-gon against its 8-gon: the gap is .0576 of the radius, so up to 4.3 pixels of radius at LEAN_LIM)
function leanOk(geo, m){ const e = m.elements; return .5*Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10])) <= LEAN_R.cyl16; }
// A shape's corners with duplicates merged (same position and normal, bit for bit) and its triangles as indices into them.
// Kept on the shape, and remade if its positions change.
const _wf = new Float64Array(1), _wu = new Uint32Array(_wf.buffer);
const _wk = x => { _wf[0] = x; return _wu[0].toString(36) + ':' + _wu[1].toString(36); };   // (exact: tells -0 from 0)
function weldOf(geo){
  const pa = geo.attributes.position, na = geo.attributes.normal, idx = geo.index ? geo.index.array : null;
  let w = geo.userData._weld;
  if (w && w.pa === pa.array && w.pv === pa.version && w.na === (na && na.array) && w.nv === (na ? na.version : 0) && w.idx === idx) return w;
  const P = pa.array, N = na ? na.array : null, cnt = idx ? idx.length : P.length/3, map = new Map(), src = [], tri = new Uint32Array(cnt);
  for (let q = 0; q < cnt; q++){
    const v = idx ? idx[q] : q, o = v*3;
    let key = _wk(P[o]) + ',' + _wk(P[o + 1]) + ',' + _wk(P[o + 2]);
    if (N) key += '|' + _wk(N[o]) + ',' + _wk(N[o + 1]) + ',' + _wk(N[o + 2]);
    let k = map.get(key); if (k === undefined){ k = src.length; map.set(key, k); src.push(v); }
    tri[q] = k;
  }
  w = geo.userData._weld = { pa: P, pv: pa.version, na: N, nv: na ? na.version : 0, idx, src: Uint32Array.from(src), tri };
  return w;
}
// Corners written straight into a bucket (floor decals, hologram quads: three per triangle) get plain indices of their own,
// in order, so every bucket ends up indexed.
function bucketIndexUpTo(b){
  if (!b.i){ b.i = []; b.ni = 0; }
  const n = b.p.length/3; for (let v = b.ni; v < n; v++) b.i.push(v); b.ni = n;
}
// Is this piece a fine detail? Sticks (two thin sides: posts, rails, cables, frames, pipes) and tiny bits
// (small in every direction). Flat panels, with only one thin side, are kept: they read even when small.
let LAST_STICK = false; const STICK_W = .06;
function detailId(geo, m){
  let s = geo.userData._size;
  if (!s){ geo.computeBoundingBox(); const bb = geo.boundingBox; s = geo.userData._size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]; }
  const e = m.elements;
  const d = [Math.hypot(e[0], e[1], e[2])*s[0], Math.hypot(e[4], e[5], e[6])*s[1], Math.hypot(e[8], e[9], e[10])*s[2]].sort((a, b) => a - b);
  LAST_STICK = d[1] < STICK_W && d[2] >= .14;   // (a long piece thin in two directions: see FAR_CFG)
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
  bucketIndexUpTo(b); g.setIndex(new THREE.BufferAttribute(b.p.length/3 > 65535 ? new Uint32Array(b.i) : new Uint16Array(b.i), 1));
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
function spotAt(P, x, y, z, kind, stall = null, face = [0, 1], extra = null){
  if (!curSpots) return;
  _sv.set(x, y, z).applyMatrix4(P);
  const fl = face === 'origin' ? [-x, -z] : face;   // 'origin': facing the middle of P (a cart, a table)
  _sd.set(fl[0], 0, fl[1]).transformDirection(P);
  curSpots.push(Object.assign({ x: _sv.x, y: _sv.y, z: _sv.z, fx: _sd.x, fz: _sd.z, kind, stall }, extra));
}
