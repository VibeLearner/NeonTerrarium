// Neon Terrarium: the coast (a test page, coast.html). A clifftop meadow that ends in a limestone cliff, and the sea
// below it. The coast runs on forever both ways: the land is everything on one side of it, the sea everything on the
// other, so panning inland shows more meadow, panning out to sea shows more sea, and the coast itself wanders, bites
// into coves with little beaches, and has stacks and rocks off it, all made up as the view gets there.
// Mood: the "feel" board (bright Mediterranean noon, deep teal sky, turquoise shallows going to deep blue, warm cream and
// ochre rock, hard clean shadows, a lot of quiet space).
//
// Drawn and steered like the sky city: the same orthographic camera, tilt, zoom range and controls, drawn at the city's
// line count and scaled up in hard pixels, toon lighting in three steps.
// The ground is flat, as in the sky city, seen at a true isometric angle (35.26 degrees down, turned 45 degrees), zoom
// 30 to start and out to 60. (The materials can still bend the far ground down into a horizon; it's switched off: k = 0.)
// The land comes in chunks, made as they come into view (coarser where the view squeezes them small) and dropped once
// long out of view. The sea is one shader whose color comes from how deep the seabed is under each point: a window of
// depths around the view, kept in a texture that wraps around, so as the view moves only the new strip is worked out.
// Pieces are placed freely: anywhere on the land, at any angle, no grid. Each sits on a pad: the ground under it is
// leveled and blended back into the slope around it. No Math.random: everything is seeded.
'use strict';
(() => {
  const PI = Math.PI;
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputEncoding = THREE.LinearEncoding;

  /* ---------- seeded noise ---------- */
  const hash2 = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0)/4294967296; };
  const sm = t => t*t*(3 - 2*t);
  function vnoise(x, y){ const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = sm(xf), v = sm(yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a + (b - a)*u) + ((c + (d - c)*u) - (a + (b - a)*u))*v; }
  const fbm = (x, y, o = 4) => { let s = 0, a = .5, f = 1, n = 0; for (let i = 0; i < o; i++){ s += a*vnoise(x*f + i*17.3, y*f - i*9.1); n += a; a *= .5; f *= 2.03; } return s/n; };
  const n1 = x => vnoise(x, 0.5)*2 - 1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a)*t;
  const smooth = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

  /* ---------- the land: one endless coast running along z, the land toward -x, the sea toward +x ---------- */
  const TOP = 6.5;   // the meadow's height above the sea at the cliff
  // coves: one now and then along the coast (a stretch of 46 units has one or not); the first sits by the starting view
  const COVE_CELL = 46;
  function coveOf(c){
    if (c === 0) return { z: 9, w: 4.2, amp: 7.5 };
    if (hash2(c, 77) > .55) return null;
    return { z: c*COVE_CELL + 8 + hash2(c, 78)*30, w: 3.4 + hash2(c, 79)*2.6, amp: 5 + hash2(c, 80)*3.5 };
  }
  function coveAt(z){   // [how much of a cove this is (0 to 1, for the beach), how far the coast bites in]
    const c0 = Math.floor(z/COVE_CELL); let f = 0, bite = 0;
    for (let c = c0 - 1; c <= c0 + 1; c++){ const v = coveOf(c); if (!v) continue;
      f = Math.max(f, Math.exp(-(((z - v.z)/v.w)**2))); bite += v.amp*Math.exp(-(((z - v.z)/(v.w*1.3))**2)); }
    return [f, bite];
  }
  // the cliff edge's x at z: headlands and bays slowly, wobbles quickly, coves bitten out
  const coastBase = z => 6*n1(z*.012 + 3) + 1.5*n1(z*.06 + 2) + .9*n1(z*.19 + 7) + .35*n1(z*.6);
  const coastX = z => coastBase(z) - coveAt(z)[1];
  // offshore: a sea stack now and then and a few rocks (part of the seabed too, so the foam rings them), per stretch of 20
  const ROCK_CELL = 20, rockCache = new Map();
  function rocksOf(c){
    let r = rockCache.get(c); if (r) return r; r = [];
    const at = (z, o) => coastX(z) + o;
    if (c === -1) r.push({ x: at(-9, 13), z: -9, r: 2.3, stack: 9.5 });   // (the starting view's stack)
    else if (hash2(c, 31) < .38){ const z = c*ROCK_CELL + 4 + hash2(c, 32)*12; r.push({ x: at(z, 7 + hash2(c, 33)*8), z, r: 1.6 + hash2(c, 34)*1.2, stack: 6 + hash2(c, 35)*5 }); }
    const n = 1 + Math.floor(hash2(c, 36)*3);
    for (let i = 0; i < n; i++){ const z = c*ROCK_CELL + hash2(c, 40 + i)*ROCK_CELL; r.push({ x: at(z, 1.6 + hash2(c, 50 + i)*5.5), z, r: .5 + hash2(c, 60 + i)*.45 }); }
    rockCache.set(c, r); return r;
  }
  function rocksNear(z){ const c0 = Math.floor(z/ROCK_CELL), out = []; for (let c = c0 - 1; c <= c0 + 1; c++) out.push(...rocksOf(c)); return out; }

  /* ---------- placed pieces (they level the ground under them, so the heights need them) ---------- */
  const PIECES = [], PCELL = 16, pieceGrid = new Map();   // (the lookup buckets are only for finding pieces near a point; pieces sit anywhere)
  const pcells = (p, f) => { const m = p.r + 2; for (let a = Math.floor((p.x - m)/PCELL); a <= Math.floor((p.x + m)/PCELL); a++) for (let b = Math.floor((p.z - m)/PCELL); b <= Math.floor((p.z + m)/PCELL); b++) f(a + ',' + b); };
  const gridAdd = p => pcells(p, k => { let l = pieceGrid.get(k); if (!l) pieceGrid.set(k, l = []); l.push(p); });
  const gridDel = p => pcells(p, k => { const l = pieceGrid.get(k); if (l){ const i = l.indexOf(p); if (i >= 0) l.splice(i, 1); } });
  function piecesNear(x0, z0, x1, z1){ const out = new Set();
    for (let a = Math.floor(x0/PCELL); a <= Math.floor(x1/PCELL); a++) for (let b = Math.floor(z0/PCELL); b <= Math.floor(z1/PCELL); b++){ const l = pieceGrid.get(a + ',' + b); if (l) for (const p of l) out.add(p); }
    return [...out]; }

  // the height at (x, z), with the row's coast, cove and rocks worked out once (a terrain row and a depth row share z)
  // how the coast runs at z: distances are taken across it, not along x, so a cove's sides keep the same cliff as the open coast
  const rowCos = z => { const sl = (coastX(z + .4) - coastX(z - .4))/.8; return 1/Math.sqrt(1 + sl*sl); };
  function heightRow(x, z, cx, cv, rocks, pads, cs){
    const s = cx - x;   // inland distance from the cliff edge, along x (negative: out at sea)
    if (s > 0){
      const sp = s*cs;   // (and across the coast)
      const top = TOP + .55*(fbm(x*.07, z*.07) - .5) + clamp(s*.025, 0, .8) + 3.2*smooth(26, 90, s)*(fbm(x*.018 + 5, z*.018 - 3) - .38);   // (rolling a little more, far inland)
      // the cliff: sheer, with a ledge part way down, rolling over onto the meadow in about a unit; a cove is the same cliff
      // curving round its bay
      let y = top*(sp < 1 ? Math.pow(sp, .35) : 1);
      if (sp < .7 && sp > .35) y = Math.min(y, top*.6 + (sp - .35)*1.4);   // (the ledge)
      if (pads) for (const p of pads){ const d = Math.hypot(x - p.x, z - p.z), w = 1 - smooth(p.r + .2, p.r + 1.8, d); if (w > 0) y = lerp(y, p.y, w); }
      return y;
    }
    // the seabed: a rocky shelf at the cliff's foot, then the drop to deep water; in a cove, a sandy floor and a strip of
    // sand at the foot of the cliff, just above the water
    const o = -s*cs;
    let y = -.15 - 1.1*Math.pow(o, .8) - .012*o*o;
    if (o < 9) y += (fbm(x*.25, z*.25) - .5)*1.6*(1 - cv*.7)*smooth(9, 2, o);
    y = lerp(y, .32 - .7*o, cv*smooth(4, 0, o));
    // rubble at the cliff's foot: rock fallen from the face, some of it just breaking the surface, so the waterline is
    // ragged and broken up, not a ruled line where the cliff meets the sea
    if (o < 1.8 && cv < .6){ const rb = ((fbm(x*1.15 + 7, z*1.15 - 3, 3) - .5)*1.7 + .2 - o*.5)*(1 - cv*1.6); if (rb > y) y = rb; }
    for (const k of rocks){ const r = k.r + (k.stack ? 1.2 : .5), hgt = k.stack ? .45 : .35, d = Math.hypot(x - k.x, z - k.z); if (d < r) y = Math.max(y, hgt - (d/r)**2*(hgt + 2.5)); }
    return Math.max(y, -24);
  }
  // the height anywhere; raw: as the land lies before any piece leveled it
  const heightAt = (x, z, raw) => { const [cv] = coveAt(z); return heightRow(x, z, coastX(z), cv, rocksNear(z), raw ? null : piecesNear(x - 4, z - 4, x + 4, z + 4), rowCos(z)); };

  /* ---------- the bend, the haze, the materials ---------- */
  const scene = new THREE.Scene();
  const CURV = { ctr: { value: new THREE.Vector2() }, fwd: { value: new THREE.Vector2(1, 0) }, curveK: { value: 0 }, g0: { value: 30 },
    hzNear: { value: 30 }, hzFar: { value: 60 }, hzMax: { value: .82 }, hazeC: { value: new THREE.Color(0xbfe4e3) } };
  const BEND = `{ vec4 wq = modelMatrix * vec4(transformed, 1.0); float gq = dot(wq.xz - ctr, fwd); vG = gq; float gp = max(gq - g0, 0.0); transformed.y -= curveK*gp*gp; vWq = wq.xyz; }`;
  // cliff faces are painted per pixel by height (crisp strata, a dark wet splash zone, a weed line at the water), not by
  // their few vertices: a face is any steep, not green, surface of the land
  const ROCKY = `
    vec3 rockAt(vec3 w){
      float wob = 0.35*sin(w.x*0.41 + w.z*0.33) + 0.2*sin(w.x*1.3 - w.z*1.1), y = w.y + wob*0.3;
      if (y < 0.22 + 0.1*sin(w.x*2.1 + w.z*1.7)) return vec3(0.384, 0.439, 0.306);
      if (y < 0.85 + 0.2*sin(w.x*0.9 + w.z*0.7)) return vec3(0.549, 0.478, 0.376);
      float m = mod(floor(y*1.5 + wob), 7.0);
      return m < 1.0 ? vec3(0.937, 0.898, 0.812) : m < 2.0 ? vec3(0.886, 0.812, 0.663) : m < 3.0 ? vec3(0.957, 0.925, 0.863) : m < 4.0 ? vec3(0.839, 0.698, 0.494)
           : m < 5.0 ? vec3(0.937, 0.898, 0.812) : m < 6.0 ? vec3(0.788, 0.624, 0.424) : vec3(0.886, 0.812, 0.663);
    }`;
  const ROCKY_APPLY = `#include <color_fragment>
    rockFace = false;
    { vec3 upV = normalize((viewMatrix*vec4(0.0, 1.0, 0.0, 0.0)).xyz); float st = dot(normalize(vNormal), upV);
      bool green = diffuseColor.g > diffuseColor.r*1.12;
      if (st < 0.55 && vWq.y > -0.4){ diffuseColor.rgb = rockAt(vWq); rockFace = true; }
      else if (st < 0.8 && green) diffuseColor.rgb = vec3(0.243, 0.420, 0.180);   // (the grass's lip, darker where it rolls over the edge)
      else if (st < 0.8 && vWq.y > -0.4){ diffuseColor.rgb = rockAt(vWq); rockFace = true; } }`;
  // (a cliff face takes its shade from which way it faces, not from cast shadows: on its narrow upright facets the shadow map
  // drew stepped bands)
  const ROCKY_LIGHTS = THREE.ShaderChunk.lights_fragment_begin.replace('directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap', 'directLight.visible, receiveShadow && !rockFace ) ) ? getShadow( directionalShadowMap');
  // bend any built-in material the same way (and haze it toward the horizon, unless it's only drawn into the shadow map)
  function bent(mat, haze = true, rocky = false){
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CURV);
      sh.vertexShader = 'uniform vec2 ctr, fwd; uniform float curveK, g0; varying float vG; varying vec3 vWq;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BEND);
      if (haze) sh.fragmentShader = 'uniform float hzNear, hzFar, hzMax; uniform vec3 hazeC; varying float vG; varying vec3 vWq;\n' + (rocky ? 'bool rockFace;\n' + ROCKY + '\n' : '') + sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeC, smoothstep(hzNear, hzFar, vG)*hzMax);')
        .replace('#include <color_fragment>', rocky ? ROCKY_APPLY : '#include <color_fragment>').replace('#include <lights_fragment_begin>', rocky ? ROCKY_LIGHTS : '#include <lights_fragment_begin>');
    };
    mat.customProgramCacheKey = () => 'bent' + (haze ? 1 : 0) + (rocky ? 'r' : '');
    return mat;
  }
  const gData = new Uint8Array([150, 150, 150, 255, 200, 200, 200, 255, 240, 240, 240, 255]);
  const gradTex = new THREE.DataTexture(gData, 3, 1, THREE.RGBAFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  const C = h => new THREE.Color(h);
  const PAL = { grass: [C(0x5a8a3c), C(0x66934a), C(0x7a9f52), C(0x52803a)], dry: C(0xbdb07a), path: C(0xd2b282), sand: C(0xecd7a2), wet: C(0xc8b07f),
    rock: [C(0xefe5cf), C(0xe2cfa9), C(0xd6b27e), C(0xf4ecdc), C(0xc99f6c)], under: C(0xcdb98c), wetRock: C(0x8c7a60), algae: C(0x62704e), rubble: C(0xcbb48c), rubble2: C(0xb59c74), seaRock: C(0x8a9a86), pad: C(0xd9c9a3),
    bush: [C(0x4a7a30), C(0x5d8a38)], wall: C(0xf6f1e6), cap: C(0xe8e0cf), stack: [C(0xf2ead8), C(0xe6d3ad), C(0xd8b98a)],
    white: C(0xf6f1e6), white2: C(0xe9e2d2), terra: C(0xc8663e), terra2: C(0xa9522f), door: C(0x3e6e7a), stone: C(0xe6d3ad), soil: C(0x5b4532), plank: C(0x8a6644), leaf: C(0x6a9a3c) };
  // everything on the land is one material, colored per vertex: one draw for each chunk, props and all
  const landM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true }), true, true);
  const pieceM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true }));   // (pieces: walls stay their own color)
  const landDepth = bent(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false);

  // a growing list of flat-shaded, colored triangles; props are merged into it
  class Tris {
    constructor(){ this.p = []; this.c = []; }
    add(geo, m, col){ const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 3){ this.p.push(a[i], a[i + 1], a[i + 2]); this.c.push(col.r, col.g, col.b); } g.dispose(); }
    quad(a, b, c, d, col){ for (const v of [a, b, c, a, c, d]){ this.p.push(v[0], v[1], v[2]); this.c.push(col.r, col.g, col.b); } }
    geo(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return g; }
    mesh(mat = landM){ const m = new THREE.Mesh(this.geo(), mat); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = landDepth; m.matrixAutoUpdate = false; m.frustumCulled = false; return m; }
  }
  const GEO = { cyl5: new THREE.CylinderGeometry(1, 1, 1, 5), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone4: new THREE.CylinderGeometry(0, 1, 1, 4), cone8: new THREE.CylinderGeometry(0, 1, 1, 8), ico: new THREE.IcosahedronGeometry(1, 0), dod: new THREE.DodecahedronGeometry(1, 0), box: new THREE.BoxGeometry(1, 1, 1) };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const mat = (x, y, z, rx, ry, rz, sx, sy, sz) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  function bush(T, x, z, seed){ const y = heightAt(x, z), r = .45 + hash2(seed, 5)*.5; T.add(GEO.ico, mat(x, y + r*.3, z, 0, hash2(seed, 6)*PI, 0, r, r*.6, r), PAL.bush[seed & 1]); }

  /* ---------- the view (needed by the chunks for their detail) ---------- */
  const PITCH0 = Math.atan(1/Math.SQRT2), PITCH_MIN = 12*PI/180, PITCH_MAX = 82*PI/180, CAM_DIST = 400, TY = 2, ZMIN = 5, ZMAX = 60, YAW_MIN = .12;
  const HOME = { x: 0, z: -4, yaw: PI*3/4, zoom: 30 };   // (true isometric: 35.26 degrees down, turned 45 degrees)
  let yaw = HOME.yaw, yawT = yaw, zoom = HOME.zoom, zoomT = zoom, pitch = PITCH0, pitchT = PITCH0, tiltMode = false;
  let W = 480, H = 270;
  const V = { g0: 30, cx: 0, cz: 0, fx: 0, fz: -1, rx: 1, rz: 0, sp: .5, cp: .85, k: 0, gH: 40, hw: 30, back: -30, gMax: 60, asp: 1.6 };

  /* ---------- chunks of land, made as they come into view ---------- */
  const CH = 16;   // a chunk: 16 units square; its grid is 40, 20 or 10 across, finer where the view shows it bigger
  const chunks = new Map();
  function chunkHasLand(ci, cj){   // does any of the chunk lie inland of the coast (plus the beach and foam)?
    const x0 = ci*CH, z0 = cj*CH; let mx = -1e9;
    for (let k = 0; k <= 8; k++) mx = Math.max(mx, coastX(z0 + k*CH/8));
    return x0 < mx + 1;
  }
  function buildChunk(ci, cj, lod){
    const STEP = .4*(1 << lod), CN = Math.round(CH/STEP), x0 = ci*CH, z0 = cj*CH, n = CN + 3;   // heights with a one-cell border (for the slope)
    const pads = piecesNear(x0 - 3, z0 - 3, x0 + CH + 3, z0 + CH + 3);
    const hs = new Float32Array(n*n), rowC = [], rowV = [], rowS = [];
    for (let j = 0; j < n; j++){ const z = z0 + (j - 1)*STEP, [cv] = coveAt(z), cx = coastX(z), rk = rocksNear(z), cs = rowCos(z); rowC.push(cx); rowV.push(cv); rowS.push(cs);
      for (let i = 0; i < n; i++) hs[j*n + i] = heightRow(x0 + (i - 1)*STEP, z, cx, cv, rk, pads, cs); }
    const VN = CN + 1, pos = new Float32Array(VN*VN*3), col = new Float32Array(VN*VN*3);
    for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++){
      const k = j*VN + i, x = x0 + i*STEP, z = z0 + j*STEP, h = (a, b) => hs[(j + 1 + b)*n + i + 1 + a], y = h(0, 0);
      pos[k*3] = x; pos[k*3 + 1] = y; pos[k*3 + 2] = z;
      const cx = rowC[j + 1], c = rowV[j + 1], s = cx - x, sp = s*rowS[j + 1];
      let cc;
      if (y < -.05) cc = fbm(x*.25, z*.25) > .55 ? PAL.seaRock : PAL.under;
      else if (s <= 0 && c > .3) cc = y < .14 ? PAL.wet : PAL.sand;   // (a cove's strip of sand at the cliff's foot)
      else if (s <= 0) cc = y < .18 ? PAL.algae : y < .45 ? PAL.wetRock : (vnoise(x*2.3, z*2.3) > .5 ? PAL.rubble : PAL.rubble2);   // (fallen rock at the foot: dark and wet where the sea reaches)
      else {
        const slope = (Math.abs(h(1, 0) - h(-1, 0)) + Math.abs(h(0, 1) - h(0, -1)))*.15/STEP;
        let pad = 0; for (const p of pads){ const d = Math.hypot(x - p.x, z - p.z); if (d < p.r*.9) pad = 1; }
        if (pad) cc = PAL.pad;   // (the leveled ground under a piece: packed earth)
        else if (slope > .9 && sp < 4 && y < .2 + .15*n1(z*1.7)) cc = PAL.algae;                // (the tide line: weed on the wet rock)
        else if (slope > .9 && sp < 4 && y < .75 + .25*n1(z*.9 + 4)) cc = PAL.wetRock;    // (the splash zone, darker)
        else if (slope > .9 && sp < 4){ const band = Math.floor(y*1.35 + .6*n1(z*.3)) & 7; cc = PAL.rock[[0, 1, 3, 2, 0, 4, 1, 3][band]]; }   // strata in the limestone
        else {
          const p = fbm(x*.11 + 40, z*.11), q = vnoise(x*.9, z*.9);
          cc = PAL.grass[p < .38 ? 3 : p < .5 ? 0 : p < .62 ? 1 : 2].clone();
          if (fbm(x*.05 - 9, z*.05 + 4) > .64) cc.lerp(PAL.dry, .3 + .1*q);              // dry patches inland
        }
      }
      col[k*3] = cc.r; col[k*3 + 1] = cc.g; col[k*3 + 2] = cc.b;
    }
    const T = new Tris();
    const vert = v => { T.p.push(pos[v*3], pos[v*3 + 1], pos[v*3 + 2]); T.c.push(col[v*3], col[v*3 + 1], col[v*3 + 2]); };
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++){ const a = j*VN + i, b = a + 1, c2 = a + VN, d = c2 + 1; for (const v of [a, c2, b, b, c2, d]) vert(v); }
    // skirts down from the edges, both ways round, so a coarser neighbor never leaves a crack
    const skirt = (a, b) => { const A = [pos[a*3], pos[a*3 + 1], pos[a*3 + 2]], B = [pos[b*3], pos[b*3 + 1], pos[b*3 + 2]], A2 = [A[0], A[1] - 3, A[2]], B2 = [B[0], B[1] - 3, B[2]], cl = new THREE.Color(col[a*3], col[a*3 + 1], col[a*3 + 2]);
      SK.quad(A, B, B2, A2, cl); SK.quad(A, A2, B2, B, cl); };
    const SK = new Tris(), BT = new Tris();   // (skirts: their own mesh, which casts no shadow; a skirt showing on a cliff face shadowed it in a dotted line)
    for (let i = 0; i < CN; i++){ skirt(i, i + 1); skirt(CN*VN + i, CN*VN + i + 1); skirt(i*VN, (i + 1)*VN); skirt(i*VN + CN, (i + 1)*VN + CN); }
    const near = (x, z, m) => pads.some(p => Math.hypot(x - p.x, z - p.z) < p.r + m);
    if (lod < 2){
      // bushes, scattered over the whole land the same way whatever the chunks (one chance in each 4-unit patch, thicker in clumps)
      for (let a = x0/4; a < (x0 + CH)/4; a++) for (let b = z0/4; b < (z0 + CH)/4; b++){
        if (hash2(a*7 + 3, b*13 + 5) > .06 + .4*smooth(.5, .72, fbm(a*.22 + 3, b*.22 - 7))) continue;
        const x = a*4 + hash2(a, b + 77)*4, z = b*4 + hash2(a + 31, b)*4, s = coastX(z) - x;
        if (s*rowCos(z) > 2.2 && !near(x, z, .6)) bush(BT, x, z, (a*92821) ^ b);
      }
    }
    const m = T.mesh(), sk = SK.mesh(), nr = sk.geometry.attributes.normal;
    for (let v = 0; v < nr.count; v++) nr.setXYZ(v, 0, 1, 0);   // (a skirt that shows in a crack is lit like the ground, not like a wall)
    sk.castShadow = false; m.add(sk);
    if (BT.p.length) m.add(BT.mesh(pieceM));
    scene.add(m); return m;
  }
  // stacks and rocks, a stretch at a time
  const rockMeshes = new Map();
  function buildRocks(c){
    const T = new Tris();
    for (const k of rocksOf(c)){
      if (k.stack){ let y = -2, rr = k.r; const sd = c*31 + 11;
        for (let i = 0; y < k.stack; i++){ const hh = .7 + hash2(sd, i)*1.1, w = rr*(.91 + .05*hash2(i, sd));
          T.add(GEO.cyl6, mat(k.x + (hash2(sd + 3, i) - .5)*.25*i*.25, y + hh/2, k.z + (hash2(sd + 5, i) - .5)*.25, 0, hash2(sd, i + 9)*PI, 0, w, hh, w), PAL.stack[[0, 0, 1, 0, 2, 1][i % 6]]);
          y += hh; rr *= .9 + .06*hash2(sd + 7, i); } }
      else T.add(GEO.dod, mat(k.x, k.r*.15, k.z, k.x, k.z, 0, k.r, k.r, k.r), PAL.stack[(Math.abs(k.x*7) | 0) % 3]);
    }
    const m = T.mesh(); m.receiveShadow = false; scene.add(m); return m;   // (the stacks' rings would shadow each other in jagged steps; toon shading gives them their shade)
  }

  /* ---------- the sea ---------- */
  // the seabed's depth under the water, as bytes, square-rooted (fine steps in the shallows where the foam and caustics
  // need them). The texture wraps around: texel i holds world texel i mod DN, so when the window around the view moves,
  // only the strip that came into it is worked out, a few rows or columns a frame.
  const DN = 2048, TEX = .375, DW_ = DN*TEX;
  const D = new Uint8Array(DN*DN*2).fill(255);   // (two bytes a texel: the depth, and how far the shore is)
  const dtex = new THREE.DataTexture(D, DN, DN, THREE.RGFormat, THREE.UnsignedByteType); dtex.internalFormat = 'RG8';   // (r128 doesn't pick RG8 on its own)
  dtex.minFilter = dtex.magFilter = THREE.LinearFilter; dtex.wrapS = dtex.wrapT = THREE.RepeatWrapping; dtex.needsUpdate = true;
  const WIN = { x0: null, z0: null, rows: new Array(DN) };   // the window's first texel in x and z; per texture row, its coast
  const mod = (a, n) => ((a % n) + n) % n;
  function rowInfo(iz){ const z = (iz + .5)*TEX, [cv] = coveAt(z), sl = (coastX(z + .4) - coastX(z - .4))/.8; return { cx: coastX(z), cv, rk: rocksNear(z), z, cos: 1/Math.sqrt(1 + sl*sl) }; }
  // a texel: [depth (square-rooted, 24 units deep at most), distance to the shore (4 units at most)]. The shore distance is
  // the distance out from the cliff edge (straightened by how the coast runs here), or from a rock, whichever is nearer;
  // anything standing above the water (a beach, fallen rock) is shore itself.
  function cell(ix, r, out, o2){
    const x = (ix + .5)*TEX, o = x - r.cx;
    if (o <= 0){ out[o2] = 0; out[o2 + 1] = 0; return; }
    let dist = o*r.cos;
    for (const k of r.rk){ const dd = Math.hypot(x - k.x, r.z - k.z) - (k.stack ? k.r*1.05 : k.r*.95); if (dd < dist) dist = dd; }
    let dep = 255;
    if (o < 27){ const h = heightRow(x, r.z, r.cx, r.cv, r.rk, null, r.cos); if (h >= 0) dist = 0; dep = Math.round(Math.sqrt(clamp(-h, 0, 24)/24)*255); }
    out[o2] = dep; out[o2 + 1] = Math.round(clamp(dist/4, 0, 1)*255);
  }
  function fillRow(iz){ const r = WIN.rows[mod(iz, DN)] = rowInfo(iz), row = mod(iz, DN)*DN; for (let ix = WIN.x0; ix < WIN.x0 + DN; ix++) cell(ix, r, D, (row + mod(ix, DN))*2); }
  function fillCol(ix){ const c = mod(ix, DN); for (let iz = WIN.z0; iz < WIN.z0 + DN; iz++) cell(ix, WIN.rows[mod(iz, DN)], D, (mod(iz, DN)*DN + c)*2); }
  function moveWindow(cx, cz, ms){
    const tx = Math.floor(cx/TEX) - DN/2, tz = Math.floor(cz/TEX) - DN/2;
    if (WIN.x0 === null || Math.abs(tx - WIN.x0) >= DN || Math.abs(tz - WIN.z0) >= DN){   // (a jump: the whole window afresh)
      WIN.x0 = tx; WIN.z0 = tz; for (let iz = tz; iz < tz + DN; iz++) fillRow(iz); dtex.needsUpdate = true; return; }
    const t0 = performance.now(); let changed = false;
    while (performance.now() - t0 < ms){
      if (Math.abs(tz - WIN.z0) >= 4){ if (tz > WIN.z0){ WIN.z0++; fillRow(WIN.z0 + DN - 1); } else { WIN.z0--; fillRow(WIN.z0); } changed = true; }
      else if (Math.abs(tx - WIN.x0) >= 4){ if (tx > WIN.x0){ WIN.x0++; fillCol(WIN.x0 + DN - 1); } else { WIN.x0--; fillCol(WIN.x0); } changed = true; }
      else break;
    }
    if (changed) dtex.needsUpdate = true;
  }
  // the sea's mesh: a fine grid laid over the ground the view shows (moved and stretched to it every frame), fine enough for
  // the waves to lift it
  function gridGeo(n){ const p = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) p.push(i/n, j/n, 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++){ const a = j*(n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, b, c, b, d, c); }   // (wound to face up: the grid's axes are the view's right and forward)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); return g; }
  // The waves, as water actually moves (shared by the grid, the shading, the foam pass, and on the cpu the spray):
  // - Gerstner (trochoidal) waves: each bit of water goes round in a circle as a wave passes, so the surface is lifted AND
  //   pushed sideways: water bunches up into a sharp, narrow crest and spreads out into a long, flat trough.
  // - Dispersion: a wave's speed comes from its length (w^2 = g k tanh(k h)), so longer waves run faster.
  // - Groups: the swell is a few trains of nearly the same length coming from nearly the same way. Where they line up they
  //   add into a group of big waves, where they don't they cancel; a group travels at half the speed of its waves, so each
  //   wave rises at the back of a group, grows as it runs through it, and fades out at its front.
  // - Shoaling: in shallow water a wave slows, its crests shorten and it grows taller (energy conservation: H ~ 1/sqrt(cg)),
  //   and the slower crests near rocks make the waves bend round them (refraction).
  // - Breaking: a wave breaks when its height reaches about 0.78 of the depth, or when it is too steep for its length (the
  //   crest folds over: where the surface's Jacobian drops to 0). That's where the white water comes from.
  // Gravity is slowed to 0.45 g so the motion reads at the game's scale. (1 unit is about a metre.)
  const WAVE_GLSL = `
    uniform float wForce;   // (a test switch: louder swell)
    const vec2 WD = vec2(-1.0, 0.0), WP = vec2(0.0, -1.0);   // (straight in from the open sea, square on to the cliffs: the land lies toward -x)
    const float GRAV = 9.81*0.45;
    float tanh_(float x){ float e = exp(2.0*clamp(x, -9.0, 9.0)); return (e - 1.0)/(e + 1.0); }
    float shAt(vec2 q){ vec2 i = (q - box.xy)/box.zw; if (i.x < 0.0 || i.y < 0.0 || i.x > 1.0 || i.y > 1.0) return 4.0; return texture2D(depthTex, q/box.zw).g*4.0; }
    // the ebb and flow: two sine waves at right angles, multiplied (the small, slow background swell, lit in facets)
    float ebb(vec2 q){ return 0.24*sin(dot(q, vec2(0.8, 0.6))*0.55 + time*1.1)*sin(dot(q, vec2(-0.6, 0.8))*0.42 - time*0.8)
                            + 0.12*sin(dot(q, vec2(0.28, 0.96))*0.9 + time*1.6)*sin(dot(q, vec2(-0.96, 0.28))*0.75 + time*1.3); }
    vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
    // one train: its length L, its amplitude out in deep water A0, its direction (an angle off WD), its phase. Adds to the
    // displacement, the slope and the Jacobian. kh: the water's depth in wavelengths (k0 h); Ks: its shoaling; lag: how far
    // its crests have fallen behind by slowing in the shallows
    void train(vec2 p, float d, float sh, float L, float A0, float ang, float ph, float Ksc, float qs,
               inout vec3 disp, inout vec2 slope, inout float jac){
      vec2 D = rot(WD, ang); float k0 = 6.2832/L, w = sqrt(GRAV*k0);
      float h = max(d, 0.02), kh0 = k0*h;
      float k = min(k0/pow(tanh_(pow(kh0, 0.75)), 0.6667), 3.0*k0);     // (the dispersion relation, solved: Fenton & McKee; bounded, so the phase can't tear where the floor drops sharply)
      float kh = k*h, n = 0.5*(1.0 + 2.0*kh/max(sinh(min(2.0*kh, 18.0)), 1e-4));
      float cg = n*w/k, cg0 = 0.5*w/k0, Ks = clamp(sqrt(cg0/cg), 1.0, 2.2);   // (shoaling: as the group slows, the wave grows)
      float lag = (k - k0)*3.2*(1.0 - smoothstep(0.0, 5.0, sh));         // (its crests fall behind where it's shallow)
      float a = A0*Ks*Ksc, th = k0*dot(D, p) - w*time + ph - lag;
      float Q = qs/(k*max(a, 1e-3));                                     // (how far the water swings sideways: sharpens the crest)
      Q = min(Q, 1.0);
      float S = sin(th), C = cos(th);
      disp += vec3(-Q*a*D.x*S, a*C, -Q*a*D.y*S);
      slope += -k*a*S*D;
      jac -= Q*k*a*C;
    }
    // the whole sea at p (a point of the still surface): returns its displacement (xyz), and through out-arguments the
    // surface normal, the Jacobian (below ~0.25 the crest is folding: whitecaps) and how much it's breaking in the shallows
    // The sets: the swell arrives in sets of one to three waves, calm between them. A set is a group: its envelope travels
    // at the group speed (half the waves' own speed), so each wave of it rises at the back of the set, runs through it and
    // fades out at its front. Each set has its own size (how many waves) and its own strength, from a gentle rise to a big
    // one; the strength also wanders a little along the crest. (s: distance along the swell in the set's own frame.)
    const float SWL = 28.0, SETP = 85.0;
    float setEnv(vec2 p){ float k0 = 6.2832/SWL, cg = 0.5*sqrt(GRAV/k0);
      float s = dot(WD, p) - cg*time, idx = floor(s/SETP), u = s - idx*SETP;
      float h1 = fract(sin(idx*12.9898)*43758.5453), h2 = fract(sin(idx*78.233 + 1.3)*24634.6345), h3 = fract(sin(idx*39.425 + 2.7)*13719.913);
      float n = 1.0 + floor(h1*2.999), len = n*SWL*1.25, o = h3*(SETP - len - 4.0);
      float e = (u > o && u < o + len) ? pow(sin(3.14159*(u - o)/len), 2.0) : 0.0;
      return e*(0.35 + 0.85*h2)*(0.72 + 0.28*sin(dot(WP, p)*0.035 + idx*2.1)); }
    vec3 waves(vec2 p, float d, float sh, out vec3 nrm, out float jac, out float brk){
      // behind a rock (up-swell of here) the water is sheltered; it fills in further on
      float lee = max((1.0 - smoothstep(0.2, 0.9, shAt(p - WD*3.0)))*0.8, (1.0 - smoothstep(0.2, 0.9, shAt(p - WD*7.0)))*0.5);
      float big = (1.0 + wForce)*(1.0 - 0.85*lee)*smoothstep(0.05, 1.2, sh);
      vec3 disp = vec3(0.0); vec2 slope = vec2(0.0); jac = 1.0;
      train(p, d, sh, SWL, 2.6*setEnv(p), 0.0, 0.0, big, 0.5, disp, slope, jac);   // (the set's waves)
      train(p, d, sh, 8.0, 0.13, 0.7, 0.4, big, 0.08, disp, slope, jac);            // (a little wind chop across it)
      // depth-limited breaking, wave by wave: a crest can stand at most about 0.39 of the depth above the still water (a
      // height of 0.78 of the depth, crest to trough). Where this crest gets there it breaks: its top is cut off and runs
      // on as a bore of white water
      float ratio = disp.y/max(0.39*d, 1e-3);
      brk = smoothstep(0.8, 1.2, ratio)*smoothstep(0.05, 0.6, sh);
      // against rock (a stack, a boulder, the cliff's foot) the wave doesn't just fade: the open sea's crest arriving there
      // slams into it and turns to white water round it
      float k0r = 6.2832/SWL, raw = 2.6*setEnv(p)*cos(k0r*dot(WD, p) - sqrt(GRAV*k0r)*time)*(1.0 + wForce);
      brk = max(brk, (1.0 - smoothstep(0.25, 1.9, sh))*smoothstep(0.5, 1.5, raw));
      if (ratio > 1.0){ float f = 1.0/ratio; disp.y *= f; slope *= f; }
      // a trough can't reach the seabed (it flattens over the shallows), and the water's swing sideways dies away as the
      // floor comes up, so the surface never dips below the sand or slides into the rock
      float floorY = -0.55*max(d, 0.0);
      if (disp.y < floorY){ float f = floorY/min(disp.y, -1e-4); disp.y = floorY; slope *= f; }
      float sw = smoothstep(0.3, 3.0, d); disp.x *= sw; disp.z *= sw; jac = mix(1.0, jac, sw);
      vec2 sl = slope/max(jac, 0.2);
      nrm = normalize(vec3(-sl.x, 1.0, -sl.y));
      return disp; }`;
  // the same swell on the cpu (deep water, no shoaling): for the spray against the rocks
  const WAVE = { D: [-1, 0], P: [0, -1] };
  WAVE.h = (x, z, t) => {   // the set's wave height at a point (deep water: no shoaling)
    const G = 9.81*.45, SWL = 28, SETP = 85, k0 = 2*PI/SWL, cg = .5*Math.sqrt(G/k0), fr = v => v - Math.floor(v);
    const s = WAVE.D[0]*x + WAVE.D[1]*z - cg*t, idx = Math.floor(s/SETP), u = s - idx*SETP;
    const h1 = fr(Math.sin(idx*12.9898)*43758.5453), h2 = fr(Math.sin(idx*78.233 + 1.3)*24634.6345), h3 = fr(Math.sin(idx*39.425 + 2.7)*13719.913);
    const n = 1 + Math.floor(h1*2.999), len = n*SWL*1.25, o = h3*(SETP - len - 4);
    const e = (u > o && u < o + len) ? Math.pow(Math.sin(PI*(u - o)/len), 2) : 0;
    const A = 2.6*e*(.35 + .85*h2)*(.72 + .28*Math.sin((WAVE.P[0]*x + WAVE.P[1]*z)*.035 + idx*2.1));
    return A*Math.cos(k0*(WAVE.D[0]*x + WAVE.D[1]*z) - Math.sqrt(G*k0)*t);
  };
  // The ripple map (a "dudv" map: two channels, each an offset to where the water's pattern is read) and the caustics (a
  // net of bright lines: where the edges between seeded cells come close, a Worley pattern), both 64 x 64 and tiling, made
  // here from sums of whole-number sines and points on a torus.
  const TN = 64, dudvD = new Uint8Array(TN*TN*2), causD = new Uint8Array(TN*TN);
  for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++){ const a = x/TN*PI*2, b = y/TN*PI*2, k = (y*TN + x)*2;
    dudvD[k] = Math.round(255*clamp(.5 + .24*Math.sin(a + 2*b + 1.3) + .15*Math.sin(3*a - b + .4) + .1*Math.sin(2*a + 5*b + 2.2), 0, 1));
    dudvD[k + 1] = Math.round(255*clamp(.5 + .24*Math.sin(2*a - b + .7) + .15*Math.sin(a + 3*b + 2.9) + .1*Math.sin(5*a - 2*b + 1.1), 0, 1)); }
  { const pts = []; for (let i = 0; i < 11; i++) pts.push([hash2(i, 901)*TN, hash2(i, 902)*TN]);
    for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++){ let f1 = 1e9, f2 = 1e9;
      for (const [px, py] of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){ const d = Math.hypot(x + .5 - px - ox*TN, y + .5 - py - oy*TN); if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
      const e = f2 - f1; causD[y*TN + x] = e < 1.6 ? 255 : e < 2.8 ? 120 : 0; } }
  const dudvTex = new THREE.DataTexture(dudvD, TN, TN, THREE.RGFormat, THREE.UnsignedByteType); dudvTex.internalFormat = 'RG8';
  dudvTex.wrapS = dudvTex.wrapT = THREE.RepeatWrapping; dudvTex.minFilter = dudvTex.magFilter = THREE.LinearFilter; dudvTex.needsUpdate = true;
  const causTex = new THREE.DataTexture(causD, TN, TN, THREE.RedFormat, THREE.UnsignedByteType);
  causTex.wrapS = causTex.wrapT = THREE.RepeatWrapping; causTex.minFilter = causTex.magFilter = THREE.NearestFilter; causTex.needsUpdate = true;
  const seaU = Object.assign({ dudvTex: { value: dudvTex }, causTex: { value: causTex }, reflTex: { value: null }, resPx: { value: new THREE.Vector2(480, 270) }, pxW: { value: .1 }, time: { value: 0 }, depthTex: { value: dtex }, box: { value: new THREE.Vector4(0, 0, DW_, DW_) },
    sunDir: { value: new THREE.Vector3() }, camXZ: { value: new THREE.Vector2() }, tint: { value: new THREE.Color(1, 1, 1) }, glint: { value: new THREE.Color(1, 1, 1) }, glintK: { value: 1 }, wForce: { value: 0 }, foamTex: { value: null }, foamBox: { value: new THREE.Vector3(0, 0, 128) } }, CURV);
  seaU.gO = { value: new THREE.Vector2() }; seaU.gU = { value: new THREE.Vector2(1, 0) }; seaU.gV = { value: new THREE.Vector2(0, 1) };
  const sea = new THREE.Mesh(gridGeo(200), new THREE.ShaderMaterial({ uniforms: seaU,
    vertexShader: `uniform vec2 ctr, fwd, gO, gU, gV; uniform float curveK, g0, time; uniform sampler2D depthTex; uniform vec4 box; varying vec2 vP; varying float vG; varying vec3 vWN; varying vec3 vWJ;
      ${WAVE_GLSL}
      void main(){
        vec2 p = gO + gU*position.x + gV*position.y;
        vec2 inn = (p - box.xy)/box.zw; float inBox = step(0.0, inn.x)*step(inn.x, 1.0)*step(0.0, inn.y)*step(inn.y, 1.0);
        vec2 tx = texture2D(depthTex, p/box.zw).rg; float d = inBox > 0.5 ? tx.r*tx.r*24.0 : 24.0, sh = inBox > 0.5 ? tx.g*4.0 : 4.0;
        // the waves move the surface: up and down, and sideways (the water bunching into the crests)
        vec3 nw; float jw, bw; vec3 dsp = waves(p, d, sh, nw, jw, bw);
        vWN = nw; vWJ = vec3(jw, bw, dsp.y);   // (the fragment reads these instead of working the waves out again)
        float y = dsp.y + ebb(p)*smoothstep(0.5, 3.0, sh);
        vec4 wp = vec4(p.x + dsp.x, y, p.y + dsp.z, 1.0);
        vP = p; vG = dot(p - ctr, fwd); float gp = max(vG - g0, 0.0); wp.y -= curveK*gp*gp; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float time, pxW; uniform sampler2D depthTex, dudvTex, causTex, reflTex, foamTex; uniform vec3 foamBox; uniform vec2 resPx; uniform vec4 box; uniform vec3 sunDir; uniform vec2 camXZ; uniform vec3 tint, glint, hazeC; uniform float hzNear, hzFar, hzMax, glintK;
      varying vec2 vP; varying float vG; varying vec3 vWN; varying vec3 vWJ;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0);
        float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
      vec3 ramp(float d){   // depth in units: foam-white sand line, turquoise, teal, deep blue, ink
        vec3 c0 = vec3(0.60, 0.88, 0.80), c1 = vec3(0.27, 0.76, 0.75), c2 = vec3(0.10, 0.56, 0.66), c3 = vec3(0.06, 0.37, 0.58), c4 = vec3(0.05, 0.26, 0.47);
        if (d < 0.6) return mix(c0, c1, d/0.6);
        if (d < 2.4) return mix(c1, c2, (d - 0.6)/1.8);
        if (d < 7.0) return mix(c2, c3, (d - 2.4)/4.6);
        return mix(c3, c4, clamp((d - 7.0)/12.0, 0.0, 1.0)); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      ${WAVE_GLSL}
      // one travelling wave: adds its height and its slope
      void wave(vec2 q, vec2 dir, float f, float sp, float a, inout float h, inout vec2 gr){ float ph = dot(dir, q)*f + time*sp; h += a*sin(ph); gr += a*f*cos(ph)*dir; }
      void main(){
        vec2 p = vP;
        float dith = bayer(gl_FragCoord.xy) - 0.5;
        // the ripples: two layers of the ripple map drifting different ways give an offset; it's snapped to whole pixels of
        // the view (pxW: a pixel's width on the ground), so what it moves stays crisp pixel art instead of smearing
        vec2 dd = texture2D(dudvTex, p*0.045 + vec2(time*0.013, time*0.008)).rg + texture2D(dudvTex, p*vec2(-0.07, 0.065) + vec2(-time*0.01, time*0.016)).rg - 1.0;
        vec2 off = floor(dd*0.45/pxW + 0.5)*pxW;
        vec2 uv = (p + off*0.5)/box.zw, inn = (p - box.xy)/box.zw;
        float inBox = step(0.0, inn.x)*step(inn.x, 1.0)*step(0.0, inn.y)*step(inn.y, 1.0);
        vec2 tx = texture2D(depthTex, uv).rg;
        float d = inBox > 0.5 ? tx.r*tx.r*24.0 : 24.0, sh = inBox > 0.5 ? tx.g*4.0 : 4.0;
        // the color by depth, banded the way pixel art bands a gradient (dithered at the edges of the bands)
        float dq = d + dith*0.55*(0.3 + d*0.12);
        float bands = d < 3.0 ? 6.0 : 2.0;
        dq = floor(dq*bands + 0.5)/bands;
        vec3 col = ramp(max(dq, 0.0));
        // the moving surface: a long swell, a cross swell and three sizes of chop, each a sine travelling its own way,
        // over a slowly warped plane so no crest runs dead straight. Their summed slope lights each spot: turned toward the
        // sun or the eye it catches light, turned away it falls into shade; drawn in a few flat steps, dithered between.
        vec2 q = p + 0.9*vec2(sin(p.y*0.23 + time*0.31), sin(p.x*0.21 - time*0.27));
        float h = 0.0; vec2 gr = vec2(0.0);
        wave(q, vec2(-0.91, 0.41), 0.42, 0.95, 1.00, h, gr);
        wave(q, vec2(-0.58, -0.81), 0.66, 1.25, 0.55, h, gr);
        wave(q, vec2(0.28, 0.96), 1.07, 1.70, 0.34, h, gr);
        wave(q, vec2(-0.97, -0.24), 1.73, 2.20, 0.21, h, gr);
        wave(q, vec2(0.71, -0.70), 2.61, 2.90, 0.12, h, gr);
        float calm = smoothstep(0.3, 3.0, d);   // (the shallows lie calmer and clearer)
        vec2 sd = normalize(sunDir.xz + 1e-4), tc = normalize(camXZ - p);
        // the ebb and flow lit in facets: the surface taken as flat triangles on a coarse grid (1.25 units), each lit by the
        // sun as one, in a few steps, so the swell reads as slow-moving low-poly planes (the pixel-art way of drawing it)
        const float CS = 1.25;
        vec2 cg = p/CS, c0 = floor(cg), cf = cg - c0;
        vec2 qa = c0*CS, qb = (cf.x > cf.y ? c0 + vec2(1.0, 0.0) : c0 + vec2(1.0, 1.0))*CS, qc = (cf.x > cf.y ? c0 + vec2(1.0, 1.0) : c0 + vec2(0.0, 1.0))*CS;
        vec3 fa = vec3(qa.x, ebb(qa)*2.2, qa.y), fb = vec3(qb.x, ebb(qb)*2.2, qb.y), fc = vec3(qc.x, ebb(qc)*2.2, qc.y);   // (its heights doubled: drawn bolder than it is)
        vec3 fn = normalize(cross(fc - fa, fb - fa)); if (fn.y < 0.0) fn = -fn;
        vec3 sun3 = normalize(sunDir);
        float frel = (dot(fn, sun3) - sun3.y)*calm*smoothstep(0.5, 3.0, sh), fl = frel + dith*0.03;
        col *= fl < -0.1 ? 0.86 : fl < -0.035 ? 0.94 : fl > 0.1 ? 1.11 : fl > 0.035 ? 1.05 : 1.0;
        col += fl > 0.1 ? vec3(0.015, 0.035, 0.045) : vec3(0.0);
        float lit = frel*5.5 + (-dot(gr, sd)*0.55 - dot(gr, tc)*0.45)*calm*0.35;   // (where the glints sit: the brightest facets, and a little of the chop)
        // reflections: the cliffs, stacks and buildings drawn upside down under the water line (a pass of their own each frame),
        // read through the same ripples, a whole number of pixels off
        vec4 rf = texture2D(reflTex, (gl_FragCoord.xy + floor(dd*vec2(2.0, 3.0) + 0.5))/resPx);
        col = mix(col, rf.rgb*vec3(0.5, 0.68, 0.78) + col*0.25, rf.a*0.42);
        // caustics: two layers of the tiled net drifting across each other, read through the ripples, brightest in the
        // shallows and gone by deep water
        if (d < 4.5){
          vec2 cu = (p + off)*0.17;
          float c = max(texture2D(causTex, cu + vec2(time*0.021, time*0.013)).r, texture2D(causTex, cu*1.13 + vec2(-time*0.017, time*0.024) + 0.37).r);
          col += c * (1.0 - smoothstep(0.0, 4.5, d + dith*0.4)) * vec3(0.2, 0.18, 0.11);
        }
        // the waves: lit by their true surface (the sun on it, in a few flat steps), lighter up the crests where the water is
        // thin and the light comes through it (turquoise), darker down in the troughs
        vec3 wn_ = normalize(vWN); float wj = vWJ.x, wbrk = vWJ.y; vec3 wd = vec3(0.0, vWJ.z, 0.0);
        vec3 sunN = normalize(sunDir);
        float rel = dot(wn_, sunN) - sunN.y + dith*0.05;
        col *= rel < -0.2 ? 0.7 : rel < -0.08 ? 0.84 : rel > 0.16 ? 1.16 : rel > 0.05 ? 1.07 : 1.0;
        float hy = clamp(wd.y/2.8, -1.0, 1.0), hq = floor(hy*3.0 + dith*0.9)/3.0;
        col *= 1.0 + 0.16*hq;
        col = mix(col, vec3(0.2, 0.68, 0.7), step(0.55, hy + dith*0.15)*0.38*smoothstep(0.0, 0.6, wj));
        // foam: what the foam pass has kept (whitecaps where crests folded, white water where waves broke, left in place and
        // breaking up into lace as it dissolves), drawn through a lace pattern of its own
        vec2 fuv = (p - foamBox.xy)/foamBox.z;
        float fm = (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) ? texture2D(foamTex, fuv).r : 0.0;
        float fz = vn(p*1.3 - WD*time*0.2)*0.55 + vn(p*3.1 + time*0.15)*0.3 + vn(p*6.3)*0.15;
        float fOn = step(1.0 - fm*0.95 + dith*0.12, fz), fThick = step(1.0 - fm*0.6 + dith*0.12, fz);
        col = mix(col, mix(vec3(0.76, 0.92, 0.92), vec3(0.95, 0.99, 0.98), fThick), fOn*0.92);
        // the crest folding right now: the sharp white lip
        col = mix(col, vec3(0.96, 0.99, 0.98), step(wj + dith*0.12, 0.12)*step(0.0, wd.y));
        // whitecaps: little flecks of white that pop up out at sea and fade, here and there
        vec2 wcell = floor(p/3.4); float wph = h21(wcell*1.7 + 4.0), wt = time*0.22 + wph, wk = floor(wt), wl = fract(wt);
        vec2 wpos = (wcell + 0.2 + 0.6*vec2(h21(wcell + wk), h21(wcell - wk + 9.0)))*3.4;
        float wr = length((p - wpos)*vec2(1.0, 1.7));
        col = mix(col, vec3(0.93, 0.98, 0.98), step(0.62, h21(wcell + wk*1.3)) * step(wl, 0.16) * step(wr, 0.45*(1.0 - wl/0.16) + dith*0.08) * smoothstep(3.0, 6.0, d));
        // sun glints: a scatter of sparkles winking on and off, thicker looking toward the sun, and a pixel or two on the
        // facets that catch the most light
        vec2 gcell = floor(p*3.2);
        float gg = h21(gcell + floor(time*2.2 + h21(gcell)*7.0));
        float toward = dot(normalize(p - camXZ + 1e-4), sd);
        col = mix(col, glint, step(0.9978 - 0.009*glintK*smoothstep(0.1, 1.0, toward) - 0.002, gg) * smoothstep(0.8, 3.0, d));
        vec2 cell = floor(p*3.0);
        float tw = h21(cell + floor(time*3.0 + h21(cell)*9.0));
        col = mix(col, glint, step(1.5 - 0.3*glintK, lit + dith*0.25) * step(0.8, tw) * calm);
        // the shore: white water churning close in, broken foam lines rolling in toward it, and a lip of foam that runs up
        // and draws back
        float nz = sin(p.x*1.3 + p.y*2.1 + time*0.5)*0.5 + sin(p.x*2.9 - p.y*1.1 - time*0.8)*0.5;
        float surge = 0.5 + 0.5*sin(time*0.9 + p.x*0.05 + p.y*0.04 + h*0.6);
        float churn = 1.0 - smoothstep(0.0, 1.5, sh);
        col = mix(col, col*0.75 + vec3(0.22, 0.27, 0.26), step(dith + 0.51, churn*0.9));
        float hit = clamp(wbrk + wd.y*0.25, 0.0, 1.0);   // (a wave reaching the rocks throws the foam further out)
        float lip = step(sh + dith*0.14, 0.18 + 0.09*nz + 0.2*surge + 0.55*hit) + step(d, 0.08);
        float rp = fract(sh*0.55 + time*0.2 + nz*0.05), band = smoothstep(0.7, 0.92, rp)*(1.0 - smoothstep(0.94, 1.0, rp));
        float roll = step(1.0 - band*0.75, vn(p*1.9 + vec2(time*0.12, -time*0.07)) + dith*0.15) * step(sh, 2.0) * step(0.1, sh);
        col = mix(col, vec3(0.96, 0.99, 0.98), clamp(lip + roll*0.85, 0.0, 1.0));
        col *= tint;
        col = mix(col, hazeC, smoothstep(hzNear, hzFar, vG)*hzMax);
        gl_FragColor = vec4(col, 1.0);
      }` }));
  sea.frustumCulled = false; scene.add(sea);

  /* ---------- foam that lasts: a window of the sea around the view, kept frame to frame ---------- */
  // Each frame: what was there, a little dissolved and drifted on with the waves, and whatever is breaking now (crests
  // folding over, waves breaking in the shallows) added. Two targets taking turns; the window follows the view in whole texels.
  const FN = 256, FW = 128, FT = FW/FN;   // (half a unit a texel: the lace pattern drawn over it gives the detail)
  const fOpt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType, depthBuffer: false };
  let foamA = new THREE.WebGLRenderTarget(FN, FN, fOpt), foamB = new THREE.WebGLRenderTarget(FN, FN, fOpt);
  const foamU = { prev: { value: null }, time: seaU.time, depthTex: seaU.depthTex, box: seaU.box, wForce: seaU.wForce,
    org: { value: new THREE.Vector2() }, orgPrev: { value: new THREE.Vector2() }, dt: { value: 0 }, fw: { value: FW } };
  const foamScene = new THREE.Scene(), foamCam = new THREE.Camera();
  const foamQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: foamU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D prev, depthTex; uniform vec2 org, orgPrev; uniform vec4 box; uniform float time, dt, fw; varying vec2 vU;
      ${WAVE_GLSL}
      void main(){
        vec2 p = org + vU*fw;
        vec2 pu = (p - WD*0.6*dt - orgPrev)/fw;   // (foam drifts on a little with the waves)
        float old = (pu.x > 0.0 && pu.y > 0.0 && pu.x < 1.0 && pu.y < 1.0) ? texture2D(prev, pu).r : 0.0;
        vec2 i = (p - box.xy)/box.zw; float inB = step(0.0, i.x)*step(i.x, 1.0)*step(0.0, i.y)*step(i.y, 1.0);
        vec2 tx = texture2D(depthTex, p/box.zw).rg; float d = inB > 0.5 ? tx.r*tx.r*24.0 : 24.0, sh = inB > 0.5 ? tx.g*4.0 : 4.0;
        vec3 n; float j, b; vec3 w = waves(p, d, sh, n, j, b);
        float now = max(smoothstep(0.45, 0.05, j)*step(0.0, w.y), b);   // (folding crests; breaking in the shallows and against rock)
        now *= step(0.01, d);
        float keep = old*exp(-dt/(2.2 + 2.5*old));   // (thick foam lasts longer than thin)
        gl_FragColor = vec4(max(keep, now), 0.0, 0.0, 1.0);
      }` }));
  foamQuad.frustumCulled = false; foamScene.add(foamQuad);
  let foamOrg = null;
  function foamStep(dt){
    const ox = Math.round((V.cx - FW/2)/FT)*FT, oz = Math.round((V.cz - FW/2)/FT)*FT;
    if (!foamOrg) foamOrg = [ox, oz];
    foamU.prev.value = foamA.texture; foamU.orgPrev.value.set(foamOrg[0], foamOrg[1]); foamU.org.value.set(ox, oz); foamU.dt.value = dt;
    renderer.setRenderTarget(foamB); renderer.render(foamScene, foamCam);
    foamOrg = [ox, oz]; const t = foamA; foamA = foamB; foamB = t;
    seaU.foamTex.value = foamA.texture; seaU.foamBox.value.set(ox, oz, FW);
  }

  /* ---------- spray: where a wave hits the rocks ---------- */
  // Points along the cliff's foot and round the rocks in view are checked each frame against the swell (WAVE.h, the
  // shader's trains on the cpu): when a big crest arrives at one (its height rising through a high mark), it throws a burst of white drops up and back out
  // over the water, higher against the cliff; they fall and thin out. Drawn as single dithered pixels in the scene, so the
  // cliff hides what's behind it. (A seeded stream, not Math.random.)
  const SPN = 1200, spPos = new Float32Array(SPN*3), spA = new Float32Array(SPN), spV = new Float32Array(SPN*3), spL = new Float32Array(SPN).fill(1), spAge = new Float32Array(SPN).fill(9);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('aA', new THREE.BufferAttribute(spA, 1));
  const spray = new THREE.Points(spGeo, new THREE.ShaderMaterial({ uniforms: { tint: seaU.tint, size: { value: 2 } }, depthWrite: false,
    vertexShader: 'attribute float aA; uniform float size; varying float vA; void main(){ vA = aA; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 tint; varying float vA;
      float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0); float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
      void main(){ if (vA < 0.03 || bayer(gl_FragCoord.xy) > vA) discard; gl_FragColor = vec4(vec3(0.95, 0.99, 1.0)*tint, 1.0); }` }));
  spray.frustumCulled = false; spray.renderOrder = 4; scene.add(spray);
  let spI = 0, spSeed = 12345;
  const srnd = () => { spSeed = (Math.imul(spSeed, 1664525) + 1013904223) >>> 0; return spSeed/4294967296; };
  function spawnSpray(x, z, n, up){
    for (let k = 0; k < n; k++){
      const i = spI++ % SPN, back = .3 + srnd()*1.3, side = (srnd() - .5)*1.6;
      spPos[i*3] = x + (srnd() - .5)*.5; spPos[i*3 + 1] = .05 + srnd()*.25; spPos[i*3 + 2] = z + (srnd() - .5)*.5;
      spV[i*3] = -WAVE.D[0]*back + WAVE.P[0]*side; spV[i*3 + 1] = up*(.55 + srnd()*.6); spV[i*3 + 2] = -WAVE.D[1]*back + WAVE.P[1]*side;
      spL[i] = .55 + srnd()*.7; spAge[i] = 0;
    }
  }
  const hitPts = [], hitPrev = new Map(); let hitAt = '';
  function hitPoints(){   // the cliff's foot every unit along the coast in view, and a ring round each rock
    const key = Math.round(V.cx) + ',' + Math.round(V.cz) + ',' + Math.round(zoom) + ',' + yaw.toFixed(2);
    if (key === hitAt) return; hitAt = key; hitPts.length = 0;
    const pts = [[-V.hw, V.back], [V.hw, V.back], [-V.hw, V.gMax], [V.hw, V.gMax]].map(([u, g]) => [V.cx + V.rx*u + V.fx*g, V.cz + V.rz*u + V.fz*g]);
    const z0 = Math.min(...pts.map(p => p[1])), z1 = Math.max(...pts.map(p => p[1]));
    for (let z = Math.floor(z0); z <= z1; z += 1){ const x = coastX(z) + .3*rowCos(z); if (inRect(x, z, 2) !== null) hitPts.push([x, z, coveAt(z)[0] > .4 ? 1.4 : 2.6 + 1.2*vnoise(z*.3, 3)]); }
    for (let c = Math.floor(z0/ROCK_CELL) - 1; c <= Math.floor(z1/ROCK_CELL) + 1; c++) for (const k of rocksOf(c)){
      if (inRect(k.x, k.z, 4) === null) continue;
      const r = (k.stack ? k.r*1.05 : k.r*.95) + .3, n = k.stack ? 14 : 7;
      for (let i = 0; i < n; i++){ const a = i/n*PI*2; hitPts.push([k.x + Math.cos(a)*r, k.z + Math.sin(a)*r, k.stack ? 2.4 : 1.6]); }
    }
  }
  function sprayTick(dt, t){
    hitPoints();
    for (const [x, z, up] of hitPts){
      const key = x.toFixed(2) + ',' + z.toFixed(2), hh = WAVE.h(x, z, t), prev = hitPrev.get(key);
      hitPrev.set(key, hh);
      if (prev !== undefined && prev < 1.3 && hh >= 1.3){ const a = Math.min(1, (hh - 1.0)/1.8); spawnSpray(x, z, Math.round(4 + a*10), up*(.6 + .5*a)); }   // (a big crest just arrived)
    }
    if (hitPrev.size > 6000) hitPrev.clear();
    for (let i = 0; i < SPN; i++){
      if (spAge[i] >= spL[i]){ spA[i] = 0; continue; }
      spAge[i] += dt; spV[i*3 + 1] -= 6.5*dt;
      spPos[i*3] += spV[i*3]*dt; spPos[i*3 + 1] += spV[i*3 + 1]*dt; spPos[i*3 + 2] += spV[i*3 + 2]*dt;
      spA[i] = spPos[i*3 + 1] < -.05 ? 0 : Math.max(0, 1 - spAge[i]/spL[i])*1.1;
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.aA.needsUpdate = true;
  }

  /* ---------- light: noon, afternoon, golden hour ---------- */
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0015; sun.shadow.normalBias = .3;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x6a7a4a, .55); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xcfe6f0, .1); scene.add(amb);   // (shade is lit by the bright sky and the sea: shadows stay soft, not black)
  const SKY = { top: new THREE.Color(), mid: new THREE.Color(), low: new THREE.Color() };
  function setHour(h){
    const t = clamp((h - 6)/12.6, 0, 1), el = Math.sin(t*PI)*.82 + .3, az = lerp(-.9, 2.4, t);
    sunDir.set(Math.cos(az)*Math.cos(el), Math.sin(el), Math.sin(az)*Math.cos(el));
    const warm = smooth(15.5, 18.8, h);
    sun.color.setRGB(1, lerp(.98, .78, warm), lerp(.94, .55, warm)); sun.intensity = lerp(.92, .82, warm);
    hemi.color.setRGB(lerp(.8, 1, warm), lerp(.92, .8, warm), lerp(1, .78, warm)); hemi.intensity = lerp(.52, .5, warm);
    SKY.top.setRGB(lerp(.03, .1, warm), lerp(.27, .22, warm), lerp(.42, .4, warm));
    SKY.mid.setRGB(lerp(.1, .5, warm), lerp(.46, .48, warm), lerp(.58, .56, warm));
    SKY.low.setRGB(lerp(.72, .99, warm), lerp(.89, .78, warm), lerp(.87, .6, warm));
    CURV.hazeC.value.copy(SKY.low);
    seaU.tint.value.setRGB(lerp(1, 1.06, warm), lerp(1, .9, warm), lerp(1, .82, warm));
    seaU.glint.value.setRGB(1, lerp(1, .9, warm), lerp(1, .7, warm));
    seaU.sunDir.value.copy(sunDir);
    // golden hour: the low sun's glitter is fewer, bigger sparkles, not a carpet of them (see glint density in the sea)
    seaU.glintK.value = lerp(1, .4, warm);
  }

  /* ---------- the pixels: drawn at the city's line count, then scaled up hard ---------- */
  let rt = null, reflRT = null;
  const skyU = { top: { value: SKY.top }, mid: { value: SKY.mid }, low: { value: SKY.low }, hor: { value: .7 }, ease: { value: .4 } };
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: skyU, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low; uniform float hor, ease; varying vec2 vU;
      void main(){ float y = (vU.y - hor)/max(0.05, 1.0 - hor);   // (pale at the sea's horizon, deepening up to the top; slower where the meadow's skyline stands higher)
        vec3 c = y <= 0.0 ? low : y > ease ? mix(mid, top, smoothstep(ease, 1.0, y)) : mix(low, mid, smoothstep(0.0, ease, y));
        gl_FragColor = vec4(c, 1.0); }` }));
  const skyScene = new THREE.Scene(); skyScene.add(skyQuad);
  const skyCam = new THREE.Camera();
  const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: null }));
  const blitScene = new THREE.Scene(); blitScene.add(blit);
  function resize(){
    const dpr = devicePixelRatio || 1, DWp = Math.max(1, Math.round(innerWidth*dpr)), DHp = Math.max(1, Math.round(innerHeight*dpr));
    // the city's render lines (its Settings choice if one is saved, else 480), each a whole number of screen pixels
    let lines = 480; try { const v = +localStorage.getItem('neonIsland.renderLines'); if ([240, 480, 720].includes(v)) lines = v; } catch (e) {}
    H = Math.ceil(DHp/Math.max(1, Math.round(DHp/lines))); W = Math.max(1, Math.round(H*DWp/DHp));
    renderer.setSize(DWp, DHp, false); canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    if (rt) rt.dispose(); rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    if (reflRT) reflRT.dispose(); reflRT = new THREE.WebGLRenderTarget(Math.ceil(W/2), Math.ceil(H/2),   // (half size: it's rippled anyway)
      { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    seaU.reflTex.value = reflRT.texture; seaU.resPx.value.set(W, H);
    blit.material.map = rt.texture; blit.material.needsUpdate = true;
  }
  addEventListener('resize', resize);

  /* ---------- the camera: the sky city's, exactly (see input.js) ---------- */
  const camT = new THREE.Vector3(HOME.x, TY, HOME.z), camGoal = camT.clone(), keys = new Set();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 1400);
  const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
  // the shadow box: fitted around the ground on screen, seen from the sun, its texels kept still as the view pans
  const sunM = new THREE.Matrix4(), sunX = new THREE.Vector3(), sunY = new THREE.Vector3(), sunZ = new THREE.Vector3(), _o = new THREE.Vector3(), SHADOW = { size: 0 };
  function fitShadow(){
    sunM.lookAt(sunDir, _o.set(0, 0, 0), new THREE.Vector3(0, 1, 0)); sunM.extractBasis(sunX, sunY, sunZ);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    const gF = Math.min(V.gMax, V.gH*1.05);
    for (const u of [-V.hw, V.hw]) for (const g of [V.back, (V.back + gF)/2, gF]) for (const y of [-3, TOP + 12]){
      const gp = Math.max(g - V.g0, 0), px = V.cx + V.rx*u + V.fx*g, pz = V.cz + V.rz*u + V.fz*g, py = y - V.k*gp*gp;
      const a = px*sunX.x + py*sunX.y + pz*sunX.z, b = px*sunY.x + py*sunY.y + pz*sunY.z, c = px*sunZ.x + py*sunZ.y + pz*sunZ.z;
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, c);
    }
    let size = Math.max(x1 - x0, y1 - y0)*1.04; size = Math.ceil(size/16)*16;   // (in steps, so the texel size only changes with the zoom)
    const tex = size/sun.shadow.mapSize.x, mx = Math.round((x0 + x1)/2/tex)*tex, my = Math.round((y0 + y1)/2/tex)*tex, back = 160;
    sun.position.copy(sunX).multiplyScalar(mx).addScaledVector(sunY, my).addScaledVector(sunZ, z1 + back);
    sun.target.position.copy(sun.position).addScaledVector(sunZ, -1);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera;
    sc.left = -size/2; sc.right = size/2; sc.top = size/2; sc.bottom = -size/2; sc.near = 1; sc.far = back + (z1 - z0) + 40; sc.updateProjectionMatrix();
  }
  function updateCamera(dt){
    { const d = yawT - yaw, ex = d*Math.min(1, dt*3.5), mn = YAW_MIN*dt; yaw += Math.abs(ex) >= mn ? ex : Math.sign(d)*Math.min(Math.abs(d), mn); }
    pitch += (pitchT - pitch)*Math.min(1, dt*6); if (Math.abs(pitchT - pitch) < 1e-4) pitch = pitchT;
    zoom += (zoomT - zoom)*Math.min(1, dt*8);
    if (Math.abs(yawT - yaw) < 1e-3) yaw = yawT;
    if (Math.abs(zoomT - zoom) < 1e-3) zoom = zoomT;
    const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const rt_ = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (tiltMode && (fw || rt_)){ pitchT = clamp(pitchT + fw*dt*.9, PITCH_MIN, PITCH_MAX); yawT += rt_*dt*1.4; }
    const panning = !tiltMode && (fw !== 0 || rt_ !== 0);
    if (panning){
      const sp = zoom*1.5*(keys.has('shift') ? 2.5 : 1)*dt/Math.hypot(fw, rt_), sy = Math.sin(yaw), cy = Math.cos(yaw);
      camGoal.x += (-sy*fw + cy*rt_)*sp; camGoal.z += (-cy*fw - sy*rt_)*sp;
    }
    camT.lerp(camGoal, Math.min(1, dt*(panning ? 10 : 3))); if (camT.distanceTo(camGoal) < 1e-3) camT.copy(camGoal);
    // move in whole render pixels across the screen, so a pan slides the picture without the pixels crawling
    const px = 2*zoom/H, sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    _cr.set(cy, 0, -sy); _cv.set(-sy*cp, -sp, -cy*cp); _cu.crossVectors(_cr, _cv);
    const a = Math.round(camT.dot(_cr)/px)*px, b = Math.round(camT.dot(_cu)/px)*px, c = camT.dot(_cv);
    _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, c);
    cam.position.set(_cs.x + sy*cp*CAM_DIST, _cs.y + sp*CAM_DIST, _cs.z + cy*cp*CAM_DIST);
    cam.lookAt(_cs); cam.updateMatrixWorld();
    const asp = W/H; cam.left = -zoom*asp; cam.right = zoom*asp; cam.top = zoom; cam.bottom = -zoom; cam.updateProjectionMatrix();
    // flat ground, as in the sky city: no bend (k stays 0; the bend code is kept should a horizon be wanted again)
    const k = 0, g0 = 0;
    // the ground on screen: across, the screen's width; along, from behind the bottom edge (tall stacks there still show) to
    // the top edge
    const hw = zoom*asp + 4, back = -(zoom + (TOP + 12 - TY)*cp)/sp - 2, gMax = (zoom + (TY + 3)*cp)/sp + 4, gH = gMax;
    Object.assign(V, { g0, cx: _cs.x, cz: _cs.z, fx: -sy, fz: -cy, rx: cy, rz: -sy, sp, cp, k, gH, hw, back, gMax, asp });
    CURV.ctr.value.set(_cs.x, _cs.z); CURV.fwd.value.set(-sy, -cy); CURV.curveK.value = k; CURV.g0.value = g0;
    CURV.hzNear.value = 1e5; CURV.hzFar.value = 2e5; CURV.hzMax.value = 0;   // (no haze: nothing is far off)
    skyU.hor.value = 1;
    seaU.camXZ.value.set(cam.position.x, cam.position.z);
    { const m = 6, u0 = -hw - m, g0_ = back - m, g1 = gMax + m;   // (the grid: across the screen's width, from below the bottom edge to past the top)
      seaU.gO.value.set(_cs.x + (-sy*0 + cy)*u0 + (-sy)*g0_, _cs.z + (-sy)*u0 + (-cy)*g0_); seaU.gU.value.set(cy*(2*(hw + m)), -sy*(2*(hw + m))); seaU.gV.value.set(-sy*(g1 - g0_), -cy*(g1 - g0_)); }
    fitShadow();
    seaU.pxW.value = 2*zoom/H;   // (a render pixel's width on the ground: the ripples move things by whole pixels)
  }

  /* ---------- streaming: which chunks the view needs, and how finely ---------- */
  let fcount = 0;
  // the grid step a spot g ahead needs: about 3.5 render pixels a cell, with the view's squeeze along g counted in
  function lodAt(g, cur){
    const along = g > V.g0 ? V.sp - 2*V.k*(g - V.g0)*V.cp : V.sp, dens = H/(2*zoom)*Math.max(along, .2), L = Math.log2(3.5/dens/.4);
    if (cur !== undefined && L > cur - .3 && L < cur + 1.3) return cur;   // (hysteresis: a chunk at a boundary doesn't flicker between two)
    return clamp(Math.floor(L), 0, 2);
  }
  const inRect = (x, z, m) => { const dx = x - V.cx, dz = z - V.cz, u = dx*V.rx + dz*V.rz, g = dx*V.fx + dz*V.fz; return Math.abs(u) < V.hw + m && g > V.back - m && g < V.gMax + m ? g : null; };
  function stream(budget){
    fcount++;
    const gF = V.gMax, pts = [[-V.hw, V.back], [V.hw, V.back], [-V.hw, gF], [V.hw, gF]].map(([u, g]) => [V.cx + V.rx*u + V.fx*g, V.cz + V.rz*u + V.fz*g]);
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), z0 = Math.min(...pts.map(p => p[1])), z1 = Math.max(...pts.map(p => p[1]));
    const todo = [];
    for (let j = Math.floor(z0/CH); j <= Math.floor(z1/CH); j++) for (let i = Math.floor(x0/CH); i <= Math.floor(x1/CH); i++){
      const mx = i*CH + CH/2, mz = j*CH + CH/2, g = inRect(mx, mz, CH*.75); if (g === null) continue;
      const key = i + ',' + j; let ch = chunks.get(key);
      if (!ch){ ch = { i, j, land: chunkHasLand(i, j), mesh: null, lod: undefined, seen: 0, dirty: false }; chunks.set(key, ch); }
      ch.seen = fcount; if (!ch.land) continue;
      const want = lodAt(g, ch.mesh ? ch.lod : undefined);
      if (!ch.mesh || ch.dirty || want !== ch.lod) todo.push([(ch.mesh ? 1e4 : 0) + (ch.dirty ? -2e4 : 0) + Math.hypot(mx - V.cx, mz - V.cz), ch, want]);
    }
    for (let c = Math.floor(z0/ROCK_CELL) - 1; c <= Math.floor(z1/ROCK_CELL) + 1; c++){
      const rs = rocksOf(c); if (!rs.some(k => inRect(k.x, k.z, 14) !== null)) continue;
      let rc = rockMeshes.get(c); if (!rc){ rc = { mesh: buildRocks(c), seen: 0 }; rockMeshes.set(c, rc); } rc.seen = fcount;
    }
    todo.sort((a, b) => a[0] - b[0]);   // (pieces just placed first, then what's missing, nearest first, then detail changes)
    const t0 = performance.now();
    for (const [, ch, lod] of todo){
      const old = ch.mesh; ch.mesh = buildChunk(ch.i, ch.j, lod); ch.lod = lod; ch.dirty = false;
      if (old){ scene.remove(old); old.traverse(o => o.geometry && o.geometry.dispose()); }
      if (performance.now() - t0 > budget) break;
    }
    // drop what's long out of view (kept a while, so a turn back and forth doesn't remake it)
    if (fcount % 30 === 0){
      for (const [k, ch] of chunks) if (fcount - ch.seen > 400 && chunks.size > 700){ if (ch.mesh){ scene.remove(ch.mesh); ch.mesh.traverse(o => o.geometry && o.geometry.dispose()); } chunks.delete(k); }
      for (const [k, rc] of rockMeshes) if (fcount - rc.seen > 400 && rockMeshes.size > 140){ scene.remove(rc.mesh); rc.mesh.geometry.dispose(); rockMeshes.delete(k); }
      if (rockCache.size > 600) rockCache.clear();
    }
    // the depth window: centered a little ahead of the view, where most of the sea on screen is
    const ahead = Math.min(V.gH*.4, DW_*.25);
    moveWindow(V.cx + V.fx*ahead, V.cz + V.fz*ahead, budget > 100 ? 1e9 : 3);
    seaU.box.value.set(WIN.x0*TEX, WIN.z0*TEX, DW_, DW_);
  }

  /* ---------- picking: the point of land or sea under the pointer, on the bent world ---------- */
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  function pick(clientX, clientY){
    const r = canvas.getBoundingClientRect(), nx = (clientX - r.left)/r.width*2 - 1, ny = 1 - (clientY - r.top)/r.height*2;
    _ro.set(nx, ny, -1).unproject(cam); cam.getWorldDirection(_rd);
    const surf = (x, z) => { const g = (x - V.cx)*V.fx + (z - V.cz)*V.fz, gp = Math.max(g - V.g0, 0), h = heightAt(x, z); return [Math.max(h, 0) - V.k*gp*gp, h]; };
    let t = _rd.y < 0 ? Math.max(0, (_ro.y - (TOP + 14))/(-_rd.y)) : 0, prev = t;
    for (let n = 0; n < 4000; n++){
      const x = _ro.x + _rd.x*t, y = _ro.y + _rd.y*t, z = _ro.z + _rd.z*t, [sy] = surf(x, z), gap = y - sy;
      if (gap <= 0){   // crossed: narrow it down
        let lo = prev, hi = t; for (let i = 0; i < 10; i++){ const m = (lo + hi)/2, [s2] = surf(_ro.x + _rd.x*m, _ro.z + _rd.z*m); if (_ro.y + _rd.y*m <= s2) hi = m; else lo = m; }
        const hx = _ro.x + _rd.x*hi, hz = _ro.z + _rd.z*hi, [, h] = surf(hx, hz); return { x: hx, z: hz, sea: h < 0 }; }
      if (y < -V.k*Math.pow(Math.max(0, (x - V.cx)*V.fx + (z - V.cz)*V.fz - V.g0), 2) - 40) return null;   // (under everything: past the horizon)
      prev = t; t += clamp(gap*.3, .15, 2.5);
    }
    return null;
  }

  /* ---------- homes: placed anywhere, at any angle, on a leveled pad, each one generated from its own seed ---------- */
  // The residential zone, from the solarpunk board: homes that wear their plants, soft shapes, warm plaster and
  // terracotta, greenhouse glass. Four kinds, each built from parts by a seeded stream, so no two come out the same:
  //   townhouse: a plaster house of one or two floors, a curved glass greenhouse on the roof, an outside stair, a tiled
  //              lean-to, an awning over a bright door, planters on every ledge
  //   tower:     round rooms stacked and offset, wrapped in glass, cream and terracotta bands, planted balconies, a roof garden
  //   pods:      white domes and a capsule room stacked together, round windows, a blue trim, a little tiled hut on top,
  //              pipes and an antenna
  //   villa:     white blocks stepping back as they rise, flat terraces with planters, an arcade, a terracotta dome
  // (the glass colors go a little past full: it glows, even on its shaded side)
  const HP = { teal: C(0x3f8f8a), sea: C(0x5aa79a), cream: C(0xf2e8d5), ochre: C(0xe8c48a), white: C(0xf6f1e6), blush: C(0xefc9b8), sand: C(0xe9d9b8),
    terra: C(0xc8663e), terra2: C(0xa9522f), tile: C(0xb85a36), glass: C(0x8fd8c4).multiplyScalar(1.12), glass2: C(0x84d4be).multiplyScalar(1.2), glassT: C(0x7fc0c4).multiplyScalar(1.15), glassD: C(0x2f5960), frame: C(0x2e403e),
    doorO: C(0xd0702e), doorT: C(0x3e6e7a), wood: C(0x9a6a3e), rail: C(0x3a3f3e), metal: C(0x9aa3a6), blue: C(0x3a9ec4), lamp: C(0xffd27a),
    leaf: [C(0x4e8a34), C(0x6aa03c), C(0x3d7430), C(0x82b048)], pot: C(0xb5583a), stone: C(0xd8ccb2), flower: [C(0xf08a5a), C(0xf5c84c), C(0xe6739a)] };
  Object.assign(GEO, { cyl12: new THREE.CylinderGeometry(1, 1, 1, 12), cyl16: new THREE.CylinderGeometry(1, 1, 1, 16), sph: new THREE.IcosahedronGeometry(1, 1),
    dome: new THREE.SphereGeometry(1, 12, 6, 0, PI*2, 0, PI/2), ring: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true) });
  const rng = seed => { let a = seed >>> 0; return { f(){ a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; },
    r(lo, hi){ return lo + (hi - lo)*this.f(); }, i(lo, hi){ return lo + Math.floor(this.f()*(hi - lo + 1)); }, pick(l){ return l[Math.floor(this.f()*l.length)]; }, chance(p){ return this.f() < p; } }; };
  // little parts
  const plant = (T, R, x, y, z, s = 1) => { T.add(GEO.ico, mat(x, y + .1*s, z, 0, R.r(0, PI), 0, .2*s, .17*s, .2*s), R.pick(HP.leaf));
    if (R.chance(.35)) T.add(GEO.ico, mat(x + .06*s, y + .2*s, z, 0, 0, 0, .07*s, .07*s, .07*s), R.pick(HP.flower)); };
  const pot = (T, R, x, y, z, s = 1) => { T.add(GEO.cyl6, mat(x, y + .08*s, z, 0, 0, 0, .1*s, .16*s, .1*s), HP.pot); plant(T, R, x, y + .14*s, z, s); };
  const box = (T, x, y, z, w, h, d, c, ry = 0) => T.add(GEO.box, mat(x, y, z, 0, ry, 0, w, h, d), c);
  const shrub = (T, R, x, z, s = 1) => { for (let k = 0; k < 3; k++) T.add(GEO.ico, mat(x + R.r(-.15, .15)*s, .18*s + k*.05, z + R.r(-.15, .15)*s, 0, R.r(0, 3), 0, .28*s, .22*s, .28*s), R.pick(HP.leaf)); };
  // a window on a flat face facing +z (at depth z), with a frame and a sill; lit warm or dark glass
  const winZ = (T, R, x, y, z, w, h, arch) => { box(T, x, y, z + .01, w + .08, h + .08, .04, HP.frame); box(T, x, y, z + .03, w, h, .04, R.chance(.35) ? HP.lamp : HP.glassD);
    if (arch) T.add(GEO.cyl8, mat(x, y + h/2, z + .02, PI/2, 0, 0, w/2 + .04, .05, w/2 + .04), HP.frame);
    box(T, x, y - h/2 - .04, z + .08, w + .14, .04, .12, HP.stone); };
  // Each kind is a block: build(T, R, D, ctx) draws it at the origin and returns how high its top is. R draws its body (so
  // a block's size never changes), D its trimmings. ctx.below: it sits on another block (no pad, steps, door or garden at
  // its foot); ctx.above: another block sits on it (no roof garden, dome or greenhouse: a flat roof to stand on).
  const KINDS = {
    townhouse: { name: 'Greenhouse townhouse', r: 1.9, rb: 1.1, build(T, R, D, ctx){
      const w = R.r(1.9, 2.3), d = R.r(1.5, 1.9), fl = ctx.below ? 1 : R.i(1, 2), fh = 1.2, H = fl*fh, wall = R.pick([HP.teal, HP.sea, HP.teal, HP.ochre, HP.blush]), y0 = ctx.below ? 0 : .12;
      if (!ctx.below) box(T, 0, .06, 0, w + .5, .12, d + .5, HP.stone);
      box(T, 0, y0 + H/2, 0, w, H, d, wall);
      for (let f = 0; f < fl; f++) box(T, 0, y0 + (f + 1)*fh - .05, 0, w + .06, .08, d + .06, HP.cream);
      const dx = D.r(-w/2 + .4, w/2 - .4), door = D.pick([HP.doorO, HP.doorO, HP.doorT]);
      if (!ctx.below){ box(T, dx, .55, d/2 + .03, .42, .8, .06, door); T.add(GEO.cyl8, mat(dx, .95, d/2 + .03, PI/2, 0, 0, .21, .06, .21), door);
        box(T, dx, 1.12, d/2 + .2, .66, .05, .4, D.pick([HP.cream, HP.terra])); box(T, dx + .32, .9, d/2 + .12, .07, .12, .07, HP.lamp); }
      else { box(T, dx, .45, d/2 + .03, .5, .7, .06, HP.glass); box(T, dx, .05, d/2 + .25, .8, .06, .4, HP.stone); box(T, dx, .3, d/2 + .43, .8, .04, .03, HP.rail); pot(T, D, dx + .3, .08, d/2 + .3, .8); }
      for (let f = 0; f < fl; f++) for (const wx of [-w*.3, w*.28]) if (f > 0 || ctx.below || Math.abs(wx - dx) > .5) winZ(T, D, wx, y0 + f*fh + .65, d/2, .34, .42, D.chance(.5));
      for (let f = 0; f < fl; f++) winZ(T, D, 0, y0 + f*fh + .65, -d/2 - .07, .3, .38, false);
      const top = y0 + H + .11;
      box(T, 0, y0 + H + .06, 0, w + .14, .1, d + .14, HP.cream);
      if (!ctx.above){
        if (D.chance(.9)){ const gw = w*D.r(.6, .85), gd = d*D.r(.7, .85), gh = .6, gy = top, gx = D.r(-.15, .15)*w;
          box(T, gx, gy + gh/2, 0, gw, gh, gd, HP.glass); T.add(GEO.cyl12, mat(gx, gy + gh, 0, 0, 0, PI/2, gd/2, gw, gd/2), HP.glass2);
          for (let k = 0; k <= Math.round(gw/.35); k++){ const x = gx - gw/2 + k*gw/Math.round(gw/.35); box(T, x, gy + gh/2, gd/2 + .01, .04, gh, .02, HP.frame); box(T, x, gy + gh/2, -gd/2 - .01, .04, gh, .02, HP.frame);
            T.add(GEO.ring, mat(x, gy + gh, 0, 0, 0, PI/2, gd/2 + .02, .05, gd/2 + .02), HP.frame); }
          for (let k = 0; k < 4; k++) pot(T, D, gx - gw/2 + .2 + k*(gw - .4)/3, gy, gd/2 - .2, .9); }
        for (let k = 0; k < 4; k++) if (D.chance(.7)) pot(T, D, -w/2 + .2 + k*(w - .4)/3, top, d/2 + .02, .8);
      }
      if (!ctx.below && (fl > 1 || D.chance(.6))){ const sx = -w/2 - .28, n = Math.round((fl > 1 ? fh : H)/.2);
        for (let k = 0; k < n; k++){ const y = .12 + k*.2, z = d/2 - .25 - k*(d - .5)/n; box(T, sx, y + .1, z, .5, .08, .25, HP.stone); if (k % 3 === 1) pot(T, D, sx - .17, y + .14, z, .6); }
        box(T, sx - .24, .12 + n*.1 + .35, 0, .04, .05, d - .3, HP.rail); box(T, sx, .12 + n*.2 + .05, -d/2 + .3, .5, .1, .55, HP.stone); }
      if (!ctx.below && D.chance(.6)){ const lw = .7, lh = fh*.75, lx = w/2 + lw/2 - .02;
        box(T, lx, .12 + lh/2, D.r(-.2, .2), lw, lh, d*.7, wall); T.add(GEO.box, mat(lx + .05, .12 + lh + .08, 0, 0, 0, -.3, lw + .25, .08, d*.8), HP.tile); winZ(T, D, lx, .12 + lh*.55, d*.35, .28, .3, false); }
      box(T, w/2 + .02, y0 + fh*.75, -d*.2, .2, .3, .3, HP.metal);
      if (!ctx.below){ for (let k = 0; k < 4; k++) if (D.chance(.7)) pot(T, D, D.r(-w/2, w/2), .12, d/2 + .3 + D.r(0, .2), 1); shrub(T, D, -w/2 - .2, d/2 + .2, .9); }
      return top;
    } },
    tower: { name: 'Round terrace tower', r: 1.8, rb: 1.15, build(T, R, D, ctx){
      const lv = ctx.below ? R.i(1, 2) : R.i(2, 3), lh = 1.0; let y = ctx.below ? 0 : .12, ox = 0, oz = 0;
      if (!ctx.below) T.add(GEO.cyl12, mat(0, .06, 0, 0, 0, 0, 1.55, .12, 1.55), HP.stone);
      for (let i = 0; i < lv; i++){
        const r = R.r(.85, 1.15) - i*.04, band = (i + (ctx.below ? 1 : 0)) % 2 ? HP.terra : HP.cream;
        if (i > 0){ ox = clamp(ox + R.r(-.3, .3), -.35, .35); oz = clamp(oz + R.r(-.3, .3), -.35, .35); }
        T.add(GEO.cyl16, mat(ox, y + .17, oz, 0, 0, 0, r + .04, .34, r + .04), band);
        T.add(GEO.cyl16, mat(ox, y + .34 + (lh - .46)/2, oz, 0, 0, 0, r*.95, lh - .46, r*.95), HP.glassT);
        for (let k = 0; k < 8; k++){ const a = k/8*PI*2 + i; box(T, ox + Math.cos(a)*r*.95, y + .34 + (lh - .46)/2, oz + Math.sin(a)*r*.95, .05, lh - .46, .05, HP.frame); }
        T.add(GEO.cyl16, mat(ox, y + lh - .06, oz, 0, 0, 0, r + .08, .12, r + .08), HP.cream);
        if (D.chance(.5)) for (let k = 0; k < 3; k++){ const a = D.r(0, PI*2); plant(T, D, ox + Math.cos(a)*(r - .1), y + .34, oz + Math.sin(a)*(r - .1), .9); }
        y += lh;
      }
      // (the top is pulled back to the middle, so a block above sits square on it)
      T.add(GEO.cyl16, mat(ox/2, y - .02, oz/2, 0, 0, 0, 1.05, .08, 1.05), HP.cream);
      if (!ctx.above){ const rr = 1.0;
        for (let k = 0; k < 12; k++){ const a = k/12*PI*2; box(T, ox/2 + Math.cos(a)*rr*.95, y + .15, oz/2 + Math.sin(a)*rr*.95, .04, .3, .04, HP.rail); }
        T.add(GEO.ring, mat(ox/2, y + .3, oz/2, 0, 0, 0, rr*.97, .04, rr*.97), HP.rail);
        for (let k = 0; k < 5; k++){ const a = D.r(0, PI*2), q = D.r(.1, .65); plant(T, D, ox/2 + Math.cos(a)*q, y, oz/2 + Math.sin(a)*q, 1.4); }
        if (D.chance(.5)){ T.add(GEO.cyl5, mat(ox/2 + .2, y + .35, oz/2, 0, 0, 0, .06, .7, .06), HP.wood); T.add(GEO.ico, mat(ox/2 + .2, y + .85, oz/2, 0, 0, 0, .42, .32, .42), D.pick(HP.leaf)); } }
      if (!ctx.below){ box(T, 0, .5, 1.12, .44, .76, .1, HP.wood); T.add(GEO.cyl8, mat(0, .88, 1.12, PI/2, 0, 0, .22, .1, .22), HP.wood); box(T, 0, .08, 1.35, .8, .1, .35, HP.stone);
        for (let k = 0; k < 5; k++){ const a = .4 + k*1.1; shrub(T, D, Math.cos(a)*1.35, Math.sin(a)*1.35, .8); if (D.chance(.6)) T.add(GEO.ico, mat(Math.cos(a)*1.35, .38, Math.sin(a)*1.35, 0, 0, 0, .09, .09, .09), D.pick(HP.flower)); } }
      return y + .02;
    } },
    pods: { name: 'Patchwork pod house', r: 1.9, rb: 1.2, build(T, R, D, ctx){
      const y0 = ctx.below ? 0 : .2, main = R.r(.85, 1.0), c2 = R.pick([HP.white, HP.cream, HP.white]);
      if (!ctx.below) box(T, 0, .1, 0, 2.8, .2, 2.4, HP.stone);
      const cyD = y0 + main*.85;
      T.add(GEO.sph, mat(.2, cyD, -.1, 0, 0, 0, main, main*.95, main), c2);
      T.add(GEO.cyl16, mat(.2, cyD, -.1, 0, 0, 0, main*1.02, .1, main*1.02), HP.blue);
      const cy = y0 + .15 + R.r(.55, .8), cl = R.r(1.0, 1.3), cr = R.r(.42, .55), side = R.chance(.5) ? -1 : 1;
      T.add(GEO.cyl16, mat(side*.9, cy, .35, 0, 0, PI/2, cr, cl, cr), c2); T.add(GEO.sph, mat(side*(.9 + cl/2), cy, .35, 0, 0, 0, cr, cr, cr), c2);
      T.add(GEO.cyl16, mat(side*(.9 + cl/2 + cr*.82), cy, .35, 0, 0, PI/2, cr*.62, .06, cr*.62), HP.glassD); T.add(GEO.cyl16, mat(side*(.9 + cl/2 + cr*.86), cy, .35, 0, 0, PI/2, cr*.66, .03, cr*.66), HP.frame);
      if (!ctx.below) box(T, side*.9, cy - cr - .15, .35, .12, .3, .12, HP.metal);
      for (let k = 0; k < 4; k++){ const a = D.r(-.9, .9) + (k < 2 ? 0 : PI), el = D.r(.15, .5), nx = Math.sin(a)*Math.cos(el), ny = Math.sin(el), nz = Math.cos(a)*Math.cos(el);
        T.add(GEO.cyl8, mat(.2 + nx*main, cyD + ny*main*.95, -.1 + nz*main, Math.PI/2 - el, a, 0, .17, .06, .17), D.chance(.4) ? HP.lamp : HP.glassD); }
      const top = y0 + main*1.72;
      // a flat round deck over the dome's crown: a roof to stand on (or the next block's floor)
      T.add(GEO.cyl12, mat(.2, top - .05, -.1, 0, 0, 0, .75, .1, .75), HP.cream); T.add(GEO.cyl12, mat(.2, top - .15, -.1, 0, 0, 0, .4, .2, .4), c2);
      if (!ctx.above){
        if (D.chance(.7)){ const r2 = D.r(.4, .5); T.add(GEO.sph, mat(-.05, top + r2*.55, -.25, 0, 0, 0, r2, r2*.9, r2), c2); T.add(GEO.cyl8, mat(-.05, top + r2*.55, -.25 + r2*.98, PI/2, 0, 0, .12, .05, .12), HP.glassD); }
        if (D.chance(.8)){ box(T, .5, top + .22, .1, .5, .44, .45, HP.cream); T.add(GEO.cone4, mat(.5, top + .56, .1, 0, PI/4, 0, .48, .28, .45), HP.tile); winZ(T, D, .5, top + .24, .33, .18, .18, false); }
        T.add(GEO.cyl5, mat(.8, top + .55, -.35, 0, 0, 0, .025, 1.1, .025), HP.rail); box(T, .8, top + 1.05, -.35, .25, .06, .06, HP.blue);
      }
      T.add(GEO.cyl5, mat(-.75, y0 + main*.6, -.6, 0, 0, 0, .05, main*1.4, .05), HP.metal); T.add(GEO.cyl5, mat(-.4, y0 + main*1.3, -.6, 0, 0, PI/2, .05, .7, .05), HP.metal);
      if (!ctx.below){ box(T, -.3, .55, .78, .4, .7, .1, D.pick([HP.doorT, HP.wood])); box(T, -.3, .25, 1.05, .6, .1, .35, HP.stone);
        for (let k = 0; k < 5; k++) pot(T, D, D.r(-1.2, 1.2), .2, D.r(.7, 1.1), 1); shrub(T, D, -1.1, -.8, .9); shrub(T, D, 1.1, -.9, .8); }
      return top;
    } },
    villa: { name: 'White terraced villa', r: 2.0, rb: 1.4, build(T, R, D, ctx){
      if (!ctx.below) box(T, 0, .06, 0, 3.3, .12, 3.0, HP.stone);
      const n = ctx.below ? 1 : R.i(2, 3); let w = R.r(2.5, 2.8), d = R.r(2.2, 2.5), y = ctx.below ? 0 : .12, bz = 0;
      for (let i = 0; i < n; i++){
        const h = i === 0 && !ctx.below ? 1.1 : .95, c = R.pick([HP.white, HP.white, HP.cream, HP.sand]);
        box(T, 0, y + h/2, bz, w, h, d, c);
        const k = Math.max(2, Math.round(w/.7));
        for (let j = 0; j < k; j++){ const x = -w/2 + (j + .5)*w/k; if (i === 0 && !ctx.below){ box(T, x, y + .38, bz + d/2 + .02, .34, .56, .04, HP.glassD); T.add(GEO.cyl8, mat(x, y + .66, bz + d/2 + .02, PI/2, 0, 0, .17, .04, .17), HP.glassD); }
          else if (D.chance(.6)) winZ(T, D, x, y + h*.5, bz + d/2, .26, .36, true); }
        box(T, 0, y + h + .04, bz, w + .1, .08, d + .1, HP.cream);
        const last = i === n - 1;
        if (!last || ctx.above){ /* the next floor (or block) up sits back, or square on it */ }
        if (!last){ const nd = d*R.r(.6, .72), nz = bz - (d - nd)/2;
          box(T, 0, y + h + .16, bz + d/2 - .03, w, .2, .06, c); for (let j = 0; j < 4; j++) if (D.chance(.7)) pot(T, D, -w/2 + .3 + j*(w - .6)/3, y + h + .08, bz + d/2 - .2, .9);
          y += h; w *= R.r(.65, .8); d = nd; bz = nz; }
        else y += h;
      }
      const top = y + .08;
      if (!ctx.above){ const dr = Math.min(w, d)*.45; T.add(GEO.cyl12, mat(0, top + .15, bz, 0, 0, 0, dr, .3, dr), HP.white);
        T.add(GEO.dome, mat(0, top + .3, bz, 0, 0, 0, dr*1.02, dr*.9, dr*1.02), D.pick([HP.terra, HP.terra2, HP.ochre]));
        T.add(GEO.cyl5, mat(0, top + .3 + dr*.9, bz, 0, 0, 0, .03, .3, .03), HP.rail); }
      if (!ctx.below){ for (const [x, z] of [[-1.5, 1.2], [1.5, -1.1]]) if (D.chance(.8)) T.add(GEO.cone8, mat(x, .75, z, 0, 0, 0, .28, 1.4, .28), HP.leaf[2]);
        for (let k = 0; k < 3; k++) shrub(T, D, D.r(-1.4, 1.4), D.r(1.25, 1.45), .8); }
      return top;
    } },
  };
  const KIND_KEYS = Object.keys(KINDS);
  const geoCache = new Map();
  function blockOf(kind, seed, below, above){ const key = kind + ':' + seed + ':' + (below ? 1 : 0) + (above ? 1 : 0); let g = geoCache.get(key); if (g) return g;
    const T = new Tris(), k = KIND_KEYS.indexOf(kind) + 1, R = rng(Math.imul(seed, 2654435761) ^ k*97), D = rng(Math.imul(seed, 1597334677) ^ k*131);
    const top = KINDS[kind].build(T, R, D, { below, above }); g = { geo: T.geo(), top }; geoCache.set(key, g);
    if (geoCache.size > 400){ const k0 = geoCache.keys().next().value; geoCache.get(k0).geo.dispose(); geoCache.delete(k0); }
    return g; }

  /* ---------- the homes as placed: free on the ground, stacked on each other, and joined to their neighbors ---------- */
  // A piece is one block: { id, kind, seed, x, z, rot, y (its floor), base (the block it sits on), up (the one on it), level }.
  // Ground blocks level the ground under them and keep clear of each other; a block can be stacked on the top of a stack
  // (up to four high), square on the one below. Every change remakes the links between neighbors (see links, below).
  let nextId = 1;
  const pieceMeshes = [];
  function pieceMesh(p){ const b = blockOf(p.kind, p.seed, !!p.base, !!p.up);
    const m = new THREE.Mesh(b.geo, pieceM); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = landDepth; m.frustumCulled = false;
    m.position.set(p.x, p.y, p.z); m.rotation.y = p.rot; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(); m.userData.piece = p; p.top = b.top; return m; }
  function remesh(p){ if (p.mesh){ scene.remove(p.mesh); pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); } p.mesh = pieceMesh(p); scene.add(p.mesh); pieceMeshes.push(p.mesh); }
  const stackTop = p => { while (p.up) p = p.up; return p; };
  const stackH = p => { let n = 1; while (p.base){ p = p.base; } while (p.up){ p = p.up; n++; } return n; };
  // can a block go here on the ground? wholly on land (right up to the cliff edge is fine), on ground that isn't too steep,
  // not on top of another home (they may touch: touching homes are joined); returns the pad height
  function check(kind, x, z){
    const r = KINDS[kind].r, rb = KINDS[kind].rb, cx = coastX(z), sl = (coastX(z + .5) - coastX(z - .5)), edge = (cx - x)/Math.sqrt(1 + sl*sl);
    if (edge < rb + .3) return { ok: false, why: 'over the edge' };
    let lo = 1e9, hi = -1e9, sum = 0, n = 0;
    for (const [a, rr] of [[0, 0], ...[...Array(8)].map((_, i) => [i/8*PI*2 + .4, r*.6])]){
      const sx = x + Math.cos(a)*rr, sz = z + Math.sin(a)*rr; if ((coastX(sz) - sx)*rowCos(sz) < 1.2) continue;
      const h = heightAt(sx, sz, true); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++; }
    if (!n) return { ok: false, why: 'over the edge' };
    const y = sum/n;
    if (lo < .35) return { ok: false, why: 'too close to the water' };
    if (hi - lo > 1.0) return { ok: false, why: 'too steep' };
    for (const p of piecesNear(x - r - 4, z - r - 4, x + r + 4, z + r + 4)) if (Math.hypot(x - p.x, z - p.z) < rb + KINDS[p.kind].rb - .15) return { ok: false, why: 'something is in the way' };
    return { ok: true, y };
  }
  const dirtyAround = p => { for (const ch of chunks.values()) if (ch.land && ch.i*CH < p.x + p.r + 3 && ch.i*CH + CH > p.x - p.r - 3 && ch.j*CH < p.z + p.r + 3 && ch.j*CH + CH > p.z - p.r - 3) ch.dirty = true; };
  const SAVE_KEY = 'neonIsland.coast.pieces';
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(PIECES.map(p => [p.kind, +p.x.toFixed(3), +p.z.toFixed(3), +p.rot.toFixed(4), +p.y.toFixed(3), p.seed, p.id, p.base ? p.base.id : 0]))); } catch (e) {} };
  function addPiece(kind, x, z, rot, y, quiet, seed = 1, base = null, id = 0){
    const p = { id: id || nextId, kind, x, z, rot, y, seed, base, up: null, level: base ? base.level + 1 : 0, r: KINDS[kind].r };
    nextId = Math.max(nextId, p.id + 1);
    if (base){ base.up = p; remesh(base); }
    remesh(p); PIECES.push(p);
    if (!base){ gridAdd(p); dirtyAround(p); }
    linksDirty = true; if (!quiet) save(); return p; }
  function removePiece(p){   // (and everything stacked on it)
    if (p.up) removePiece(p.up);
    scene.remove(p.mesh); pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); PIECES.splice(PIECES.indexOf(p), 1);
    if (p.base){ p.base.up = null; remesh(p.base); } else { gridDel(p); dirtyAround(p); }
    linksDirty = true; save(); }

  /* ---------- links: what joins neighbors ---------- */
  // Two blocks on the same level whose walls come within a few units of each other are joined, by what suits the gap and
  // the height: touching blocks share a wall with an arched way through; on the ground a pergola walk (posts, beams, vines,
  // hanging plants) or a tiled arcade between them; up in the air a planted bridge or a glass skywalk. Three ground homes
  // joined to each other make a courtyard between them, with a fountain and a tree. Each home joins its three nearest
  // neighbors at most, and not through another home. All the links are one mesh, made again whenever a home comes or goes.
  let linksDirty = true, linksMesh = null;
  const hashPair = (a, b) => { let h = Math.imul(Math.min(a, b), 73856093) ^ Math.imul(Math.max(a, b), 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0)/4294967296; };
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sz = new THREE.Vector3(), _sm = new THREE.Matrix4();
  // a box from point a to point b (its length along them), w wide and h tall, lifted by up
  function seg(T, a, b, w, h, col, up = 0){
    _sz.subVectors(b, a); const L = _sz.length(); if (L < 1e-3) return; _sz.divideScalar(L);
    _sx.set(_sz.z, 0, -_sz.x); if (_sx.lengthSq() < 1e-6) _sx.set(1, 0, 0); _sx.normalize(); _sy.crossVectors(_sz, _sx);
    _sm.makeBasis(_sx.clone().multiplyScalar(w), _sy.clone().multiplyScalar(h), _sz.clone().multiplyScalar(L));
    _sm.setPosition(_sa.addVectors(a, b).multiplyScalar(.5).addScaledVector(_sy, up));
    T.add(GEO.box, _sm, col); }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function buildLinks(){
    linksDirty = false;
    if (linksMesh){ scene.remove(linksMesh); linksMesh.geometry.dispose(); linksMesh = null; }
    const T = new Tris(), pairs = [], deg = new Map(), joined = new Set();
    for (let i = 0; i < PIECES.length; i++) for (let j = i + 1; j < PIECES.length; j++){
      const A = PIECES[i], B = PIECES[j]; if (A.level !== B.level) continue;
      if (Math.abs(A.y - B.y) > (A.level ? .6 : 1.4)) continue;
      const dc = Math.hypot(B.x - A.x, B.z - A.z), gap = dc - KINDS[A.kind].rb - KINDS[B.kind].rb;
      if (gap > 3.6) continue;
      pairs.push({ A, B, dc, gap }); }
    pairs.sort((p, q) => p.gap - q.gap);
    for (const L of pairs){
      const { A, B, dc } = L; if ((deg.get(A) || 0) >= 3 || (deg.get(B) || 0) >= 3) continue;
      const dx = (B.x - A.x)/dc, dz = (B.z - A.z)/dc;
      // not through another home on the same level
      if (PIECES.some(C => C !== A && C !== B && C.level === A.level && (() => { const t = (C.x - A.x)*dx + (C.z - A.z)*dz; if (t < 0 || t > dc) return false; return Math.abs((C.x - A.x)*dz - (C.z - A.z)*dx) < KINDS[C.kind].rb + .3; })())) continue;
      deg.set(A, (deg.get(A) || 0) + 1); deg.set(B, (deg.get(B) || 0) + 1); joined.add(A.id + '|' + B.id); joined.add(B.id + '|' + A.id);
      const ra = KINDS[A.kind].rb*.85, rb_ = KINDS[B.kind].rb*.85, h = hashPair(A.id, B.id), R = rng((h*4294967296) >>> 0);
      const fy = A.level ? 0 : .12, a = V3(A.x + dx*ra, A.y + fy, A.z + dz*ra), b = V3(B.x - dx*rb_, B.y + fy, B.z - dz*rb_);
      const len = a.distanceTo(b), sx = -dz, sz = dx, at = (u, s, y) => V3(a.x + (b.x - a.x)*u + sx*s, a.y + (b.y - a.y)*u + y, a.z + (b.z - a.z)*u + sz*s);
      if (L.gap < .5){   // touching: a shared wall with an arched way through
        const a2 = at(-.15, 0, 0), b2 = at(1.15, 0, 0), wh = A.level ? .9 : 1.1, wc = R.pick([HP.cream, HP.white, HP.sand]);
        seg(T, a2, b2, 1.3, wh, wc, wh/2); seg(T, a2, b2, 1.4, .08, HP.cream, wh + .04);
        for (const s of [-.66, .66]){ const c = at(.5, s, 0); box(T, c.x, c.y + .38, c.z, .5, .6, .5, HP.glassD); }
        for (let k = 0; k < 3; k++){ const c = at(.2 + k*.3, 0, wh + .08); plant(T, R, c.x, c.y, c.z, 1.1); }
      } else if (A.level){   // up in the air: a planted bridge, or a glass skywalk
        if (R.chance(.55)){
          seg(T, a, b, .8, .1, HP.wood, .05);
          for (const s of [-.38, .38]){ seg(T, at(0, s, .45), at(1, s, .45), .05, .05, HP.rail);
            for (let u = 0; u <= 1.001; u += 1/Math.max(1, Math.round(len/.6))){ const c = at(u, s, 0); box(T, c.x, c.y + .25, c.z, .04, .42, .04, HP.rail); } }
          for (let u = .2; u < .85; u += .3) if (R.chance(.7)){ const c = at(u, R.pick([-.28, .28]), .1); pot(T, R, c.x, c.y, c.z, .8); }
          if (len > 2.5){ const c = at(.5, 0, 0); box(T, c.x, c.y - 1.2, c.z, .14, 2.4, .14, HP.cream); }   // (a slim strut under a long one)
        } else {
          seg(T, a, b, .9, .08, HP.stone, .04); seg(T, a, b, .92, .7, HP.glass, .45); seg(T, a, b, .96, .08, HP.cream, .84);
          for (let u = 0; u <= 1.001; u += 1/Math.max(1, Math.round(len/.5))){ const c = at(u, 0, 0); seg(T, at(u - .01, 0, 0), at(u + .01, 0, 0), .98, .82, HP.frame, .45); }
        }
      } else if (R.chance(.55)){   // on the ground: a pergola walk, posts and beams, vines along them, plants hanging down
        seg(T, a, b, 1.0, .14, HP.stone, .02);
        const n = Math.max(2, Math.round(len/.9));
        for (let k = 0; k <= n; k++) for (const s of [-.45, .45]){ const c = at(k/n, s, 0); box(T, c.x, c.y + .65, c.z, .09, 1.3, .09, HP.wood); }
        for (const s of [-.45, .45]) seg(T, at(-.03, s, 1.32), at(1.03, s, 1.32), .08, .1, HP.wood);
        for (let k = 0; k <= n*2; k++){ const c0 = at(k/(n*2), -.6, 1.4), c1 = at(k/(n*2), .6, 1.4); seg(T, c0, c1, .05, .06, HP.wood); }
        for (let k = 0; k < n*3; k++){ const c = at(R.r(0, 1), R.r(-.5, .5), 1.45); T.add(GEO.ico, mat(c.x, c.y, c.z, 0, R.r(0, 3), 0, .2, .12, .2), R.pick(HP.leaf));
          if (R.chance(.3)) T.add(GEO.ico, mat(c.x, c.y + .07, c.z, 0, 0, 0, .06, .06, .06), R.pick(HP.flower)); }
        for (let k = 0; k < n; k++) if (R.chance(.5)){ const c = at((k + .5)/n, R.pick([-.3, .3]), 0); T.add(GEO.ico, mat(c.x, c.y + 1.05, c.z, 0, 0, 0, .12, .25, .12), R.pick(HP.leaf)); }
        for (const u of [0, 1]) if (R.chance(.8)){ const c = at(u, R.pick([-.65, .65]), 0); pot(T, R, c.x, c.y, c.z, 1.1); }
      } else {   // on the ground: an arcade, white columns under a tiled roof, planters along it
        seg(T, a, b, 1.1, .14, HP.stone, .02);
        const n = Math.max(2, Math.round(len/.8));
        for (let k = 0; k <= n; k++) for (const s of [-.5, .5]){ const c = at(k/n, s, 0); T.add(GEO.cyl8, mat(c.x, c.y + .6, c.z, 0, 0, 0, .08, 1.2, .08), HP.white); }
        seg(T, at(-.04, 0, 1.2), at(1.04, 0, 1.2), 1.3, .12, HP.white); seg(T, at(-.04, 0, 1.34), at(1.04, 0, 1.34), 1.4, .1, HP.tile);
        for (let k = 0; k < n; k++) if (R.chance(.6)){ const c = at((k + .5)/n, R.pick([-.65, .65]), 0); pot(T, R, c.x, c.y, c.z, 1); }
      }
    }
    // courtyards: three ground homes all joined to each other
    const g0 = PIECES.filter(p => !p.level);
    for (let i = 0; i < g0.length; i++) for (let j = i + 1; j < g0.length; j++) for (let k = j + 1; k < g0.length; k++){
      const [A, B, C] = [g0[i], g0[j], g0[k]];
      if (!joined.has(A.id + '|' + B.id) || !joined.has(B.id + '|' + C.id) || !joined.has(A.id + '|' + C.id)) continue;
      const cx = (A.x + B.x + C.x)/3, cz = (A.z + B.z + C.z)/3, cy = heightAt(cx, cz), R = rng(Math.imul(A.id + B.id*7 + C.id*31, 2654435761) >>> 0);
      if ([A, B, C].some(P => Math.hypot(P.x - cx, P.z - cz) < KINDS[P.kind].rb + .9)) continue;
      T.add(GEO.cyl12, mat(cx, cy + .05, cz, 0, 0, 0, 1.1, .12, 1.1), HP.stone);
      if (R.chance(.5)){ T.add(GEO.cyl12, mat(cx, cy + .2, cz, 0, 0, 0, .55, .2, .55), HP.cream); T.add(GEO.cyl12, mat(cx, cy + .29, cz, 0, 0, 0, .45, .03, .45), HP.glass);
        T.add(GEO.cyl8, mat(cx, cy + .5, cz, 0, 0, 0, .08, .45, .08), HP.cream); }
      else { T.add(GEO.cyl5, mat(cx, cy + .55, cz, 0, 0, 0, .08, 1.1, .08), HP.wood); T.add(GEO.ico, mat(cx, cy + 1.3, cz, 0, 0, 0, .7, .5, .7), R.pick(HP.leaf)); }
      for (let q = 0; q < 6; q++){ const a = q/6*PI*2 + R.r(0, .5); pot(T, R, cx + Math.cos(a)*.95, cy + .1, cz + Math.sin(a)*.95, 1); }
    }
    if (T.p.length){ linksMesh = T.mesh(pieceM); linksMesh.customDepthMaterial = landDepth; scene.add(linksMesh); }
  }

  try { const L = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'), byId = new Map();
    for (const [kind, x, z, rot, y, seed, id, baseId] of L){ if (!KINDS[kind]) continue; const base = baseId ? byId.get(baseId) : null; if (baseId && !base) continue;
      byId.set(id || 0, addPiece(kind, x, z, rot, y, true, seed || 1, base, id || 0)); } } catch (e) {}

  // the ghost: the block under the pointer, see-through, and a ring on the ground green or red
  const ghostM = bent(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .55, depthWrite: false }), false);
  const ringM = bent(new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), false);
  ghostM.customProgramCacheKey = () => 'bentGhost'; ringM.customProgramCacheKey = () => 'bentRing';
  const ghost = new THREE.Mesh(blockOf('townhouse', 1, false, false).geo, ghostM); ghost.visible = false; ghost.frustumCulled = false; ghost.renderOrder = 5; scene.add(ghost);
  const RN = 48, ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((RN + 1)*2*3), 3));
  { const idx = []; for (let i = 0; i < RN; i++){ const a = i*2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); } ringGeo.setIndex(idx); }
  const ring = new THREE.Mesh(ringGeo, ringM); ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 6; scene.add(ring);
  const PL = { kind: null, rot: 0, hit: null, ok: null, ptr: null, onto: null, seed: 1 + PIECES.length*7 + (PIECES.reduce((a, p) => a + (p.seed || 0), 0) % 997) };   // (seed: the next home's look; V rolls another)
  const status = document.getElementById('placeStatus');
  // the home under the pointer, if any (its block)
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  function pieceAt(cx, cy){
    if (!pieceMeshes.length) return null;
    const r = canvas.getBoundingClientRect(); _ndc.set((cx - r.left)/r.width*2 - 1, 1 - (cy - r.top)/r.height*2);
    _ray.setFromCamera(_ndc, cam); const h = _ray.intersectObjects(pieceMeshes, false)[0];
    return h ? h.object.userData.piece : null; }
  function showGhost(){
    PL.onto = null;
    const over = PL.kind && PL.ptr ? pieceAt(PL.ptr.x, PL.ptr.y) : null;
    if (over){   // over a home: stack on top of it
      const t = stackTop(over), ok = stackH(t) < 4; PL.onto = ok ? t : null; PL.ok = ok ? { ok: true, y: t.y + t.top } : { ok: false, why: 'as high as it goes' };
      ghost.geometry = blockOf(PL.kind, PL.seed, true, false).geo; ghost.position.set(t.x, t.y + t.top, t.z); ghost.rotation.y = t.rot; ghost.visible = true; ring.visible = false;
      if (status) status.textContent = ok ? 'stack on top' : PL.ok.why; return; }
    const hit = PL.kind && PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null; PL.hit = hit;
    if (!hit || hit.sea){ ghost.visible = ring.visible = false; PL.ok = null; if (status) status.textContent = PL.kind ? (hit ? 'not on the sea' : '') : ''; return; }
    const ck = check(PL.kind, hit.x, hit.z), r = KINDS[PL.kind].rb + .3; PL.ok = ck;
    const y = ck.ok ? ck.y : heightAt(hit.x, hit.z, true);
    ghost.geometry = blockOf(PL.kind, PL.seed, false, false).geo; ghost.position.set(hit.x, y, hit.z); ghost.rotation.y = PL.rot; ghost.visible = true;
    const a = ringGeo.attributes.position.array;
    for (let i = 0; i <= RN; i++){ const t = i/RN*PI*2, c = Math.cos(t), s = Math.sin(t);
      for (const [j, rr] of [[0, r], [1, r + .14]]){ const x = hit.x + c*rr, z = hit.z + s*rr, o = (i*2 + j)*3; a[o] = x; a[o + 1] = heightAt(x, z) + .07; a[o + 2] = z; } }
    ringGeo.attributes.position.needsUpdate = true; ring.visible = true;
    ringM.color.set(ck.ok ? 0x7dffb0 : 0xff6a5a);
    if (status) status.textContent = ck.ok ? '' : ck.why;
  }
  function placeHere(){
    if (!PL.ok || !PL.ok.ok) return;
    if (PL.onto){ const t = PL.onto; addPiece(PL.kind, t.x, t.z, t.rot, t.y + t.top, false, PL.seed, t); }
    else addPiece(PL.kind, PL.hit.x, PL.hit.z, PL.rot, PL.ok.y, false, PL.seed);
    PL.seed++; }
  function setKind(k){
    PL.kind = PL.kind === k ? null : k;
    document.querySelectorAll('.place button').forEach(b => b.classList.toggle('on', b.dataset.k === PL.kind));
    if (!PL.kind){ ghost.visible = ring.visible = false; if (status) status.textContent = ''; }
  }
  document.querySelectorAll('.place button').forEach(b => b.addEventListener('click', () => setKind(b.dataset.k)));

  /* ---------- turning, zooming, panning, tilting: as in the sky city; a click places, a right click removes ---------- */
  const ptrs = new Map(); let act = null, pinch0 = 0, zoom0 = 0, pinchX = 0;
  const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const pmidX = () => { const [a, b] = [...ptrs.values()]; return (a.x + b.x)/2; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2){ act = { kind: 'pinch' }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); return; }
    act = { kind: 'turn', b: e.button, x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    PL.ptr = { x: e.clientX, y: e.clientY };
    const p = ptrs.get(e.pointerId); if (!p || !act) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), ZMIN, ZMAX); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    if (act.moved){ yawT -= dx*.008; if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointerleave', () => { PL.ptr = null; });
  const endPtr = e => {
    if (act && act.kind === 'turn' && !act.moved && ptrs.has(e.pointerId)){
      if ((act.b === 0 || e.pointerType === 'touch') && PL.kind){ PL.ptr = { x: e.clientX, y: e.clientY }; showGhost(); placeHere(); }
      else if (act.b === 2){ const p = pieceAt(e.clientX, e.clientY); if (p) removePiece(p); }
    }
    ptrs.delete(e.pointerId); if (!ptrs.size){ act = null; canvas.style.cursor = 'grab'; }
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomT = clamp(zoomT*(1 + Math.sign(e.deltaY)*.1), ZMIN, ZMAX); }, { passive: false });
  const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const tiltChip = document.getElementById('tiltChip');
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'shift') keys.add('shift');
    if (PAN_KEYS.includes(k)){ keys.add(k); e.preventDefault(); return; }
    if (e.key === ' '){ e.preventDefault(); if (!e.repeat){ tiltMode = !tiltMode; if (!tiltMode) pitchT = PITCH0; if (tiltChip) tiltChip.hidden = !tiltMode; } return; }
    if (k === 'h' || e.key === 'Home'){ camGoal.set(HOME.x, TY, HOME.z); return; }
    if (k === 'r'){ PL.rot += (e.shiftKey ? -1 : 1)*PI/12; return; }   // (turn the piece: 15 degrees a press, any angle it lands on)
    if ('1234'.includes(e.key) && e.key.length === 1){ setKind(KIND_KEYS[+e.key - 1]); return; }
    if (k === 'v'){ PL.seed++; return; }   // (another look for the next home)
    if (e.key === 'Escape' || e.key === '0'){ if (PL.kind) setKind(PL.kind); return; }
    if (k === 'q') yawT -= PI/4;
    else if (k === 'e') yawT += PI/4;
    else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9, ZMIN, ZMAX);
    else if (e.key === '-') zoomT = clamp(zoomT*1.1, ZMIN, ZMAX);
  });
  document.querySelectorAll('.hud .light button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.hud .light button').forEach(x => x.classList.toggle('on', x === b)); setHour(+b.dataset.h); }));

  /* ---------- every frame ---------- */
  // the reflection pass: everything above the water, flipped upside down about it and drawn flat in its own colors (no
  // lights, no shadows) into a target the size of the view, where the sea reads it at its own pixel, through the ripples
  const reflM = new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] });
  renderer.localClippingEnabled = true;
  function renderRefl(){
    const hide = [sea, spray, ghost, ring], vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
    scene.overrideMaterial = reflM; scene.scale.y = -1; scene.updateMatrixWorld(true);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = true;
    scene.overrideMaterial = null; scene.scale.y = 1; scene.updateMatrixWorld(true); hide.forEach((o, i) => { o.visible = vis[i]; });
  }
  setHour(11); resize();
  updateCamera(0); stream(1e9);   // (the first view whole, before the first frame)
  const t0 = performance.now(), TOFF = { v: 0 }; let last = t0;   // (TOFF: a test hook, to look at the sea at a given moment)
  function frame(now){
    const dt = Math.min(.1, (now - last)/1000); last = now;
    updateCamera(dt); stream(6);
    if (PL.kind) showGhost();
    if (linksDirty) buildLinks();
    const t = TOFF.fix !== undefined ? TOFF.fix : (now - t0)/1000 + TOFF.v; seaU.time.value = t; sprayTick(dt, t);
    foamStep(dt); renderRefl();
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(skyScene, skyCam);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam);
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(blitScene, skyCam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.COAST = { seaU, TOFF, WAVE, get t0(){ return t0; }, setHour, heightAt, coastX, pick, PIECES,
    get state(){ return { yaw, zoom, pitch, x: camT.x, z: camT.z, k: V.k, gH: V.gH, chunks: chunks.size, built: [...chunks.values()].filter(c => c.mesh).length }; },
    go(o){ if (o.yaw !== undefined) yaw = yawT = o.yaw; if (o.zoom !== undefined) zoom = zoomT = o.zoom; if (o.pitch !== undefined) pitch = pitchT = o.pitch;
      if (o.x !== undefined) camGoal.x = camT.x = o.x; if (o.z !== undefined) camGoal.z = camT.z = o.z; },
    place(kind, x, z, rot = 0, seed = 1){ const ck = check(kind, x, z); return ck.ok ? addPiece(kind, x, z, rot, ck.y, false, seed) : ck; },
    stack(onto, kind, seed = 1){ const t = stackTop(onto); return stackH(t) < 4 ? addPiece(kind, t.x, t.z, t.rot, t.y + t.top, false, seed, t) : null; },
    clear(){ while (PIECES.length) removePiece(PIECES[0]); } };
})();
