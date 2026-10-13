// Neon Terrarium: the coast (a test page, coast.html). A clifftop meadow that ends in a limestone cliff, and the sea
// below it. The coast runs on forever both ways: the land is everything on one side of it, the sea everything on the
// other, so panning inland shows more meadow and cliff, panning out to sea shows more sea, and the coast itself
// wanders, bites into coves with little beaches, and has stacks and rocks off it, all made up as the view gets there.
// Mood: the "feel" board (bright Mediterranean noon, deep teal sky, turquoise shallows going to deep blue, warm cream and
// ochre rock, hard clean shadows, a lot of quiet space).
// Drawn and steered like the sky city: the same orthographic camera, tilt, zoom range and controls (drag or Q / E to
// turn, the wheel to zoom, WASD or the arrows to pan, Space to tilt, H to go back), drawn at the city's line count and
// scaled up in hard pixels, toon lighting in three steps. The land comes in chunks, made as they come into view and
// dropped once far behind. The sea is one shader: its color comes from how deep the seabed is under each point (a
// window of depths baked around the view and moved along with it), with caustics in the shallows, foam that breathes
// against the rocks, swell lines out deep, sun glints, and haze toward the horizon. No Math.random: everything is seeded.
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
  // coves: one now and then along the coast (a cell of 46 units has one or not); the first sits by the starting view
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
  // offshore: a sea stack now and then and a few rocks (part of the seabed too, so the foam rings them); per cell of 20
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
  // the lane across the meadow, keeping about the same distance from the cliff, with a whitewashed wall beside it
  const laneS = z => 17 + 5*n1(z*.035 + 11);
  // the height at (x, z), with the row's coast, cove and rocks worked out once (a terrain row and a depth row share z)
  function heightRow(x, z, cx, cv, rocks){
    const s = cx - x;   // inland distance from the cliff edge (negative: out at sea)
    if (s > 0){
      const top = TOP + .55*(fbm(x*.07, z*.07) - .5) + clamp(s*.025, 0, .8) + 3.2*smooth(26, 90, s)*(fbm(x*.018 + 5, z*.018 - 3) - .38);   // (rolling a little more, far inland)
      // the cliff: a steep face with a ledge two thirds of the way down, then the meadow
      const face = s < 1.6 ? (s/1.6) : 1;
      let cliffY = top*Math.pow(face, .32);
      if (s < .9 && s > .45) cliffY = Math.min(cliffY, top*.62 + (s - .45)*1.2);   // (the ledge)
      const beachY = Math.min(top, .25 + .42*s + .02*s*s);   // in a cove: a sandy slope
      return lerp(cliffY, beachY, cv);
    }
    // the seabed: a rocky shelf at the cliff's foot, sand in a cove, then the drop to deep water
    const o = -s;
    let y = -.15 - 1.1*Math.pow(o, .8) - .012*o*o;
    if (o < 9) y += (fbm(x*.25, z*.25) - .5)*1.6*(1 - cv*.7)*smooth(9, 2, o);   // rocks on the shelf, smoother sand in a cove
    y = lerp(y, .2 - .55*o, cv*smooth(5, 0, o));                                 // the beach running into the water
    for (const k of rocks){ const r = k.r + (k.stack ? 1.2 : .5), hgt = k.stack ? .45 : .35, d = Math.hypot(x - k.x, z - k.z); if (d < r) y = Math.max(y, hgt - (d/r)**2*(hgt + 2.5)); }
    return Math.max(y, -24);
  }
  const heightAt = (x, z) => { const [cv] = coveAt(z); return heightRow(x, z, coastX(z), cv, rocksNear(z)); };

  /* ---------- the scene ---------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe4e3, 400, 460);
  const gData = new Uint8Array([150, 150, 150, 255, 200, 200, 200, 255, 240, 240, 240, 255]);
  const gradTex = new THREE.DataTexture(gData, 3, 1, THREE.RGBAFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  const C = h => new THREE.Color(h);
  const PAL = { grass: [C(0x5a8a3c), C(0x66934a), C(0x7a9f52), C(0x52803a)], dry: C(0xbdb07a), path: C(0xd2b282), sand: C(0xecd7a2), wet: C(0xc8b07f),
    rock: [C(0xefe5cf), C(0xe2cfa9), C(0xd6b27e), C(0xf4ecdc), C(0xc99f6c)], under: C(0xcdb98c), seaRock: C(0x8a9a86),
    trunk: C(0x7a5a3e), leaf: [C(0x3f6e2c), C(0x527f33), C(0x6a9a3c)], bush: [C(0x4a7a30), C(0x5d8a38)], wall: C(0xf6f1e6), cap: C(0xe8e0cf),
    stack: [C(0xf2ead8), C(0xe6d3ad), C(0xd8b98a)] };
  // everything on the land is one material, colored per vertex: one draw for each chunk, props and all
  const HZ = { tgt: { value: new THREE.Vector2() }, fwd: { value: new THREE.Vector2(1, 0) }, horizon: { value: 30 } };
  const landM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true });
  landM.onBeforeCompile = sh => { Object.assign(sh.uniforms, HZ);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec2 tgt, fwd; uniform float horizon; varying vec3 vWp;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (dot(vWp.xz - tgt, fwd) > horizon) discard;'); };

  // a growing list of flat-shaded, colored triangles; props are merged into it
  class Tris {
    constructor(){ this.p = []; this.c = []; }
    add(geo, m, col){ const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 3){ this.p.push(a[i], a[i + 1], a[i + 2]); this.c.push(col.r, col.g, col.b); } g.dispose(); }
    mesh(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, landM); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; return m; }
  }
  const GEO = { cyl5: new THREE.CylinderGeometry(1, 1, 1, 5), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), ico: new THREE.IcosahedronGeometry(1, 0), dod: new THREE.DodecahedronGeometry(1, 0), box: new THREE.BoxGeometry(1, 1, 1) };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const mat = (x, y, z, rx, ry, rz, sx, sy, sz) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  // a wind-bent tree, leaning inland (away from the sea wind)
  function tree(T, x, z, seed){
    let px = x, py = heightAt(x, z) - .1; const pz = z;
    for (let i = 0; i < 6; i++){ const r0 = .26 - i*.02, r1 = .18 - i*.02; T.add(GEO.cyl5, mat(px - .12, py + .45, pz, 0, 0, .35 + i*.04, (r0 + r1)/2, .9, (r0 + r1)/2), PAL.trunk); px -= .32; py += .78; }
    for (let i = 0; i < 9; i++){ const r = .9 + hash2(i + seed, 3)*.7;
      T.add(GEO.ico, mat(px + .6 - hash2(i + seed, 1)*3.4, py + hash2(i + seed, 2)*1.1 - .3, pz - 1.6 + hash2(i + seed, 4)*3.2, 0, hash2(seed, i), 0, r, r*.62, r), PAL.leaf[i % 3]); }
  }
  function bush(T, x, z, seed){ const y = heightAt(x, z), r = .45 + hash2(seed, 5)*.5; T.add(GEO.ico, mat(x, y + r*.3, z, 0, hash2(seed, 6)*PI, 0, r, r*.6, r), PAL.bush[seed & 1]); }

  /* ---------- chunks of land, made as they come into view ---------- */
  const CH = 16, STEP = .4, CN = Math.round(CH/STEP);   // a chunk: 16 units square, a 40 x 40 grid
  const chunks = new Map();
  function chunkHasLand(ci, cj){   // does any of the chunk's x range lie inland of the coast (plus the beach and foam)?
    const x0 = ci*CH, z0 = cj*CH; let mx = -1e9;
    for (let k = 0; k <= 8; k++) mx = Math.max(mx, coastX(z0 + k*CH/8));
    return x0 < mx + 1;
  }
  function buildChunk(ci, cj){
    const x0 = ci*CH, z0 = cj*CH, n = CN + 3;   // heights with a one-cell border (for the slope)
    const hs = new Float32Array(n*n), rowC = [], rowV = [];
    for (let j = 0; j < n; j++){ const z = z0 + (j - 1)*STEP, [cv] = coveAt(z), cx = coastX(z), rk = rocksNear(z); rowC.push(cx); rowV.push(cv);
      for (let i = 0; i < n; i++) hs[j*n + i] = heightRow(x0 + (i - 1)*STEP, z, cx, cv, rk); }
    const V = CN + 1, pos = new Float32Array(V*V*3), col = new Float32Array(V*V*3);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++){
      const k = j*V + i, x = x0 + i*STEP, z = z0 + j*STEP, h = (a, b) => hs[(j + 1 + b)*n + i + 1 + a], y = h(0, 0);
      pos[k*3] = x; pos[k*3 + 1] = y; pos[k*3 + 2] = z;
      const cx = rowC[j + 1], c = rowV[j + 1], s = cx - x;
      let cc;
      if (y < -.05) cc = fbm(x*.25, z*.25) > .55 ? PAL.seaRock : PAL.under;
      else {
        const slope = (Math.abs(h(1, 0) - h(-1, 0)) + Math.abs(h(0, 1) - h(0, -1)))*.15/STEP;
        if (c > .45 && y < 2.2 && slope < 1.4) cc = y < .35 ? PAL.wet : PAL.sand;
        else if (slope > .9 && s < 4){ const band = Math.floor(y*1.35 + .6*n1(z*.3)) & 7; cc = PAL.rock[[0, 1, 3, 2, 0, 4, 1, 3][band]]; }   // strata in the limestone
        else {
          const p = fbm(x*.11 + 40, z*.11), q = vnoise(x*.9, z*.9);
          cc = PAL.grass[p < .38 ? 3 : p < .5 ? 0 : p < .62 ? 1 : 2].clone();
          if (s < 1.9 && s > 0) cc.lerp(PAL.dry, .55);                                   // sun-dried grass at the edge
          else if (fbm(x*.05 - 9, z*.05 + 4) > .64) cc.lerp(PAL.dry, .35);              // dry patches inland
          if (Math.abs(s - laneS(z)) < .55 + .25*q) cc = PAL.path;
        }
      }
      col[k*3] = cc.r; col[k*3 + 1] = cc.g; col[k*3 + 2] = cc.b;
    }
    const T = new Tris();
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++){
      const a = j*V + i, b = a + 1, c2 = a + V, d = c2 + 1;
      for (const v of [a, c2, b, b, c2, d]){ T.p.push(pos[v*3], pos[v*3 + 1], pos[v*3 + 2]); T.c.push(col[v*3], col[v*3 + 1], col[v*3 + 2]); }
    }
    // the wall along the lane, with gaps
    for (let z = z0 + .6; z < z0 + CH; z += 1.2){
      if (n1(z*.05 + 30) < -.35) continue;
      const ls = laneS(z), x = coastX(z) - ls - 1.6; if (x < x0 || x >= x0 + CH) continue;
      const dx = (coastX(z + .3) - laneS(z + .3)) - (coastX(z - .3) - laneS(z - .3)), ry = Math.atan2(dx, .6) + PI/2, y = heightAt(x, z);
      T.add(GEO.box, mat(x, y + .25, z, 0, ry, 0, 1.22, .55, .3), PAL.wall); T.add(GEO.box, mat(x, y + .56, z, 0, ry, 0, 1.22, .08, .36), PAL.cap);
    }
    // a lone tree now and then, and bushes
    const seed = (ci*7919) ^ (cj*104729);
    for (let t = 0; t < 2; t++){ if (hash2(seed, 90 + t) > .15) continue;
      const x = x0 + 2 + hash2(seed, 91 + t)*(CH - 4), z = z0 + 2 + hash2(seed, 93 + t)*(CH - 4), s = coastX(z) - x;
      if (s > 3.5 && Math.abs(s - laneS(z)) > 3 && coveAt(z)[0] < .3) tree(T, x, z, seed + t*13); }
    for (let t = 0; t < 7; t++){ const x = x0 + hash2(seed, 120 + t)*CH, z = z0 + hash2(seed, 140 + t)*CH, s = coastX(z) - x;
      if (s > 2.5 && Math.abs(s - laneS(z)) > 1.5 && hash2(seed, 160 + t) < .6 && coveAt(z)[0] < .3) bush(T, x, z, seed + t); }
    const m = T.mesh(); scene.add(m); return m;
  }
  // stacks and rocks, a cell at a time
  const rockMeshes = new Map();
  function buildRocks(c){
    const T = new Tris();
    for (const k of rocksOf(c)){
      if (k.stack){ let y = -2, rr = k.r; const sd = c*31 + 11;
        for (let i = 0; y < k.stack; i++){ const hh = .7 + hash2(sd, i)*1.1;
          T.add(GEO.cyl6, mat(k.x + (hash2(sd + 3, i) - .5)*.25*i*.25, y + hh/2, k.z + (hash2(sd + 5, i) - .5)*.25, 0, hash2(sd, i + 9)*PI, 0, rr*(.91 + .05*hash2(i, sd)), hh, rr*(.91 + .05*hash2(i, sd))), PAL.stack[[0, 0, 1, 0, 2, 1][i % 6]]);
          y += hh; rr *= .9 + .06*hash2(sd + 7, i); } }
      else T.add(GEO.dod, mat(k.x, k.r*.15, k.z, k.x, k.z, 0, k.r, k.r, k.r), PAL.stack[(Math.abs(k.x*7) | 0) % 3]);
    }
    const m = T.mesh(); scene.add(m); return m;
  }

  /* ---------- the sea ---------- */
  // the seabed's depth under the water, baked into a window around the view (as bytes, square-rooted: fine steps in the
  // shallows where the foam and caustics need them). When the view nears the window's edge a new one is baked, a few rows
  // a frame, and swapped in when done.
  const DW_ = 256, DN = 768;
  const dtex = new THREE.DataTexture(new Uint8Array(DN*DN), DN, DN, THREE.RedFormat, THREE.UnsignedByteType); dtex.minFilter = dtex.magFilter = THREE.LinearFilter;
  const seaU = { time: { value: 0 }, depthTex: { value: dtex }, box: { value: new THREE.Vector4(0, 0, DW_, DW_) },
    sunDir: { value: new THREE.Vector3() }, camXZ: { value: new THREE.Vector2() }, tint: { value: new THREE.Color(1, 1, 1) }, haze: { value: new THREE.Color(0xbfe4e3) },
    glint: { value: new THREE.Color(1, 1, 1) }, fogNear: { value: 400 }, fogFar: { value: 460 }, tgt: { value: new THREE.Vector2() }, fwd: { value: new THREE.Vector2(1, 0) }, horizon: { value: 30 } };
  let bake = null, bakeAt = null;
  function startBake(cx, cz){ bake = { x0: Math.round(cx - DW_/2), z0: Math.round(cz - DW_/2), j: 0, d: new Uint8Array(DN*DN) }; }
  function bakeRows(ms){
    const t0 = performance.now(), b = bake;
    while (b.j < DN && performance.now() - t0 < ms){
      for (let r = 0; r < 8 && b.j < DN; r++, b.j++){
        const z = b.z0 + (b.j + .5)/DN*DW_, [cv] = coveAt(z), cx = coastX(z), rk = rocksNear(z), row = b.j*DN;
        for (let i = 0; i < DN; i++){ const x = b.x0 + (i + .5)/DN*DW_, o = x - cx;
          b.d[row + i] = o <= 0 ? 0 : o > 27 ? 255 : Math.round(Math.sqrt(clamp(-heightRow(x, z, cx, cv, rk), 0, 24)/24)*255); }
      }
    }
    if (b.j < DN) return;
    dtex.image = { data: b.d, width: DN, height: DN }; dtex.needsUpdate = true;
    seaU.box.value.set(b.x0, b.z0, DW_, DW_); bakeAt = { x: b.x0 + DW_/2, z: b.z0 + DW_/2 }; bake = null;
  }
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({ uniforms: seaU,
    vertexShader: `varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 v = viewMatrix * w; vDepth = -v.z; gl_Position = projectionMatrix * v; }`,
    fragmentShader: `
      uniform float time; uniform sampler2D depthTex; uniform vec4 box; uniform vec3 sunDir; uniform vec2 camXZ; uniform vec3 tint, haze, glint; uniform float fogNear, fogFar; uniform vec2 tgt, fwd; uniform float horizon;
      varying vec3 vW; varying float vDepth;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0);
        float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
      vec3 ramp(float d){   // depth in units: foam-white sand line, turquoise, teal, deep blue, ink
        vec3 c0 = vec3(0.60, 0.88, 0.80), c1 = vec3(0.27, 0.76, 0.75), c2 = vec3(0.10, 0.56, 0.66), c3 = vec3(0.06, 0.37, 0.58), c4 = vec3(0.05, 0.26, 0.47);
        if (d < 0.6) return mix(c0, c1, d/0.6);
        if (d < 2.4) return mix(c1, c2, (d - 0.6)/1.8);
        if (d < 7.0) return mix(c2, c3, (d - 2.4)/4.6);
        return mix(c3, c4, clamp((d - 7.0)/12.0, 0.0, 1.0)); }
      void main(){
        vec2 p = vW.xz;
        if (dot(p - tgt, fwd) > horizon) discard;   // (the horizon: a straight line across the view, the sky beyond)
        vec2 uv = (p - box.xy)/box.zw;
        float inBox = step(0.0, uv.x)*step(uv.x, 1.0)*step(0.0, uv.y)*step(uv.y, 1.0);
        float dv = texture2D(depthTex, uv).r; float d = inBox > 0.5 ? dv*dv*24.0 : 24.0;
        float dith = bayer(gl_FragCoord.xy) - 0.5;
        // the color by depth, banded the way pixel art bands a gradient (dithered at the edges of the bands)
        float dq = d + dith*0.55*(0.3 + d*0.12);
        float bands = d < 3.0 ? 6.0 : 2.0;
        dq = floor(dq*bands + 0.5)/bands;
        vec3 col = ramp(max(dq, 0.0));
        // caustics in the shallows: a net of light on the sand
        if (d < 3.2){
          float c = abs(sin(p.x*1.6 + time*0.9 + sin(p.y*1.2 + time*0.6)*1.4) * sin(p.y*1.8 - time*0.7 + sin(p.x*1.05 - time*0.4)*1.3));
          col += step(0.82 + dith*0.08, c) * (1.0 - d/3.2) * vec3(0.16, 0.14, 0.08);
        }
        // long swell lines out deep, drifting toward the shore
        vec2 dir = vec2(-0.92, 0.38), per = vec2(0.38, 0.92);
        float w = sin(dot(p, dir)*0.55 + time*0.65 + sin(dot(p, per)*0.09)*1.6);
        float wm = sin(dot(p, per)*0.21 + dot(p, dir)*0.05 + 1.3) * sin(dot(p, per)*0.083 - time*0.05 - 0.7);   // (crests come and go along their length)
        col = mix(col, col*1.1 + vec3(0.03, 0.045, 0.05), step(0.982, w) * step(0.3, wm) * smoothstep(1.5, 5.0, d));
        // foam: a white lip on the rocks and the sand, and lines that breathe in and out from it
        float fn = sin(p.x*2.3 + p.y*1.7) * 0.18;
        float lip = step(d, 0.16 + fn*0.3);
        float surge = 0.5 + 0.5*sin(time*0.8 + p.x*0.07 + p.y*0.05);
        float ring = step(abs(fract(d*0.85 - time*0.22 + fn) - 0.5), 0.05) * step(d, 1.3 + surge*0.6) * step(0.05, d);
        float edge = step(d, 0.32 + surge*0.22 + fn*0.4);
        col = mix(col, vec3(0.97, 1.0, 0.98), clamp(lip + ring*0.85 + edge*0.55, 0.0, 1.0));
        // sun glints: sparkles thicker where the sea lies toward the sun
        vec2 sd = normalize(sunDir.xz + 1e-4);
        float toward = dot(normalize(p - camXZ + 1e-4), sd);
        vec2 cell = floor(p*3.2);
        float g = h21(cell + floor(time*2.2 + h21(cell)*7.0));
        float dens = 0.9988 - 0.006*smoothstep(0.35, 1.0, toward) * smoothstep(1.0, 4.0, d);
        col = mix(col, glint, step(dens, g) * smoothstep(0.8, 3.0, d));
        col *= tint;
        // haze toward the horizon (the same as the land's fog)
        float hz = clamp((vDepth - fogNear)/(fogFar - fogNear) + dith*0.06, 0.0, 1.0);
        hz = floor(hz*7.0 + 0.5)/7.0;
        col = mix(col, haze, hz*hz);
        gl_FragColor = vec4(col, 1.0);
      }` }));
  sea.rotation.x = -PI/2; scene.add(sea);

  /* ---------- light: noon, afternoon, golden hour ---------- */
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 300 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x6a7a4a, .55); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xcfe6f0, .1); scene.add(amb);   // (shade is lit by the bright sky and the sea: shadows stay soft, not black)
  const SKY = { top: new THREE.Color(), mid: new THREE.Color(), low: new THREE.Color() };
  function setHour(h){
    const t = clamp((h - 6)/12.6, 0, 1), el = Math.sin(t*PI)*1.05 + .08, az = lerp(-.9, 2.4, t);
    sunDir.set(Math.cos(az)*Math.cos(el), Math.sin(el), Math.sin(az)*Math.cos(el));
    const warm = smooth(15.5, 18.8, h);
    sun.color.setRGB(1, lerp(.98, .78, warm), lerp(.94, .55, warm)); sun.intensity = lerp(.92, .82, warm);
    hemi.color.setRGB(lerp(.8, 1, warm), lerp(.92, .8, warm), lerp(1, .78, warm)); hemi.intensity = lerp(.52, .5, warm);
    SKY.top.setRGB(lerp(.03, .1, warm), lerp(.27, .22, warm), lerp(.42, .4, warm));
    SKY.mid.setRGB(lerp(.1, .5, warm), lerp(.46, .48, warm), lerp(.58, .56, warm));
    SKY.low.setRGB(lerp(.72, .99, warm), lerp(.89, .78, warm), lerp(.87, .6, warm));
    seaU.haze.value.copy(SKY.low); scene.fog.color.copy(SKY.low);
    seaU.tint.value.setRGB(lerp(1, 1.06, warm), lerp(1, .9, warm), lerp(1, .82, warm));
    seaU.glint.value.setRGB(1, lerp(1, .9, warm), lerp(1, .7, warm));
    seaU.sunDir.value.copy(sunDir);
    skyU.cloud.value.setRGB(1, lerp(1, .9, warm), lerp(1, .8, warm)); skyU.cloudShade.value.setRGB(lerp(.84, .95, warm), lerp(.9, .8, warm), lerp(.95, .78, warm));
  }

  /* ---------- the pixels: drawn at the city's line count, then scaled up hard ---------- */
  let rt = null, W = 480, H = 270;
  const skyU = { top: { value: SKY.top }, mid: { value: SKY.mid }, low: { value: SKY.low }, hor: { value: .7 }, time: { value: 0 }, aspect: { value: 1.6 }, cloud: { value: new THREE.Color(1, 1, 1) }, cloudShade: { value: new THREE.Color(.84, .9, .95) }, yaw: { value: 0 } };
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: skyU, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low, cloud, cloudShade; uniform float hor, time, aspect, yaw; varying vec2 vU;
      float bayer2(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0); float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
      void main(){ float y = (vU.y - hor)/max(0.05, 1.0 - hor); y += (bayer2(gl_FragCoord.xy) - 0.5)/14.0; y = floor(clamp(y, 0.0, 1.0)*14.0 + 0.5)/14.0;
        vec3 c = y > 0.35 ? mix(mid, top, (y - 0.35)/0.65) : mix(low, mid, smoothstep(0.0, 0.35, y));
        // a few heaped clouds sitting on the horizon, drifting slowly (they turn with the view)
        vec2 q = vec2(vU.x*aspect - yaw*0.9 + time*0.004, vU.y - hor);
        for (int i = 0; i < 6; i++){
          float fi = float(i), cx = mod(fi*1.37 + 0.4, 2.6*aspect/1.6), base = 0.02 + 0.07*mod(fi*0.61, 1.0), w = 0.045 + 0.035*mod(fi*1.9, 1.0);
          vec2 r = vec2(mod(q.x - cx + aspect, aspect*1.6) - aspect*0.8, q.y - base);
          float m = 0.0, sh = 0.0;
          for (int j = 0; j < 5; j++){ float fj = float(j), ox = (fj - 2.0)*w*0.55, rr = w*(0.55 + 0.45*fract(sin(fi*7.1 + fj*3.3)*43.7)), oy = rr*0.45;
            float dd = length((r - vec2(ox, oy))*vec2(1.0, 1.35)); m = max(m, step(dd, rr)); sh = max(sh, step(dd, rr)*step(r.y - oy, -rr*0.25)); }
          m *= step(0.0, r.y);
          c = mix(c, mix(cloud, cloudShade, sh), m);
        }
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
    blit.material.map = rt.texture; blit.material.needsUpdate = true; skyU.aspect.value = W/H;
  }
  addEventListener('resize', resize);

  /* ---------- the camera: the sky city's, exactly (see input.js) ---------- */
  const PITCH0 = 32*PI/180, PITCH_MIN = 12*PI/180, PITCH_MAX = 82*PI/180, CAM_DIST = 400, TY = 2, ZMIN = 5, ZMAX = 30, YAW_MIN = .12;
  const HOME = { x: 0, z: -4, yaw: PI - .5, zoom: 13.2 };
  let yaw = HOME.yaw, yawT = yaw, zoom = HOME.zoom, zoomT = zoom, pitch = PITCH0, pitchT = PITCH0, tiltMode = false;
  const camT = new THREE.Vector3(HOME.x, TY, HOME.z), camGoal = camT.clone(), keys = new Set();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 900);
  const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
  const hf = z => lerp(1.12, .76, smooth(5, 15, z));   // where the horizon sits, as a fraction up the screen: off the top when zoomed right in
  let R = 30;
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
    const px = 2*zoom/H, sy = Math.sin(yaw), cy = Math.cos(yaw), sp_ = Math.sin(pitch), cp_ = Math.cos(pitch);
    _cr.set(cy, 0, -sy); _cv.set(-sy*cp_, -sp_, -cy*cp_); _cu.crossVectors(_cr, _cv);
    const a = Math.round(camT.dot(_cr)/px)*px, b = Math.round(camT.dot(_cu)/px)*px, c = camT.dot(_cv);
    _cs.copy(_cr).multiplyScalar(a).addScaledVector(_cu, b).addScaledVector(_cv, c);
    cam.position.set(_cs.x + sy*cp_*CAM_DIST, _cs.y + sp_*CAM_DIST, _cs.z + cy*cp_*CAM_DIST);
    cam.lookAt(_cs);
    const asp = W/H; cam.left = -zoom*asp; cam.right = zoom*asp; cam.top = zoom; cam.bottom = -zoom; cam.updateProjectionMatrix();
    // the horizon: a straight line a set way up the screen, the ground beyond it cut away for the sky; haze on the way there
    // (a point g ahead of the target on the sea sits g*sin(pitch) - TY*cos(pitch) up the screen from its middle)
    const f = hf(zoom), amt = smooth(5, 14, zoom);
    R = ((2*f - 1)*zoom + TY*cp_)/sp_;
    const fx = -sy, fz = -cy;   // the ground direction the camera faces
    seaU.tgt.value.set(camT.x, camT.z); seaU.fwd.value.set(fx, fz); seaU.horizon.value = R;
    HZ.tgt.value.copy(seaU.tgt.value); HZ.fwd.value.copy(seaU.fwd.value); HZ.horizon.value = R;
    const gNear = ((2*(f - .42) - 1)*zoom + TY*cp_)/sp_, nearG = lerp(R*1.1, gNear, amt), farG = lerp(R*2.5, R*.94, amt);
    const near = CAM_DIST + nearG*cp_, far = CAM_DIST + farG*cp_;
    scene.fog.near = near; scene.fog.far = far; seaU.fogNear.value = near; seaU.fogFar.value = far;
    skyU.hor.value = f - .02; skyU.yaw.value = yaw;
    seaU.camXZ.value.set(cam.position.x, cam.position.z);
    const rad = Math.max(R, zoom/sp_) + zoom*asp + 30; sea.scale.set(rad, rad, 1); sea.position.set(camT.x, 0, camT.z);
    // the sun follows the view, its shadow box sized to what's on screen
    sun.position.copy(sunDir).multiplyScalar(150).add(camT); sun.target.position.copy(camT); sun.target.updateMatrixWorld();
    const sb = clamp(zoom*2.3, 22, 72), sc = sun.shadow.camera;
    if (sc.right !== sb){ sc.left = -sb; sc.right = sb; sc.top = sb; sc.bottom = -sb; sc.updateProjectionMatrix(); }
    return { sy, cy, sp: sp_, cp: cp_, asp };
  }

  /* ---------- streaming: which chunks the view needs ---------- */
  let fcount = 0;
  function stream(v, budget){
    fcount++;
    // the ground the screen covers: across, the screen's width; along, from below the bottom edge (tall cliffs there still
    // show) to the horizon or the top edge, whichever is nearer
    const hw = zoom*v.asp + 6, back = -(zoom + 12*v.cp)/v.sp - 6, front = Math.min(R, (zoom + TY*v.cp)/v.sp) + 6;
    const rx = v.cy, rz = -v.sy, fx = -v.sy, fz = -v.cy, cx = camT.x, cz = camT.z;
    const pts = [[-hw, back], [hw, back], [-hw, front], [hw, front]].map(([u, g]) => [cx + rx*u + fx*g, cz + rz*u + fz*g]);
    const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), z0 = Math.min(...pts.map(p => p[1])), z1 = Math.max(...pts.map(p => p[1]));
    const inView = (x, z, m) => { const dx = x - cx, dz = z - cz, u = dx*rx + dz*rz, g = dx*fx + dz*fz; return Math.abs(u) < hw + m && g > back - m && g < front + m; };
    const want = [];
    for (let j = Math.floor(z0/CH); j <= Math.floor(z1/CH); j++) for (let i = Math.floor(x0/CH); i <= Math.floor(x1/CH); i++){
      const mx = i*CH + CH/2, mz = j*CH + CH/2; if (!inView(mx, mz, CH*.75)) continue;
      const key = i + ',' + j; let ch = chunks.get(key);
      if (!ch){ ch = { i, j, land: chunkHasLand(i, j), mesh: null, seen: 0 }; chunks.set(key, ch); }
      ch.seen = fcount;
      if (ch.land && !ch.mesh) want.push([Math.hypot(mx - cx, mz - cz), ch]);
    }
    for (let c = Math.floor(z0/ROCK_CELL) - 1; c <= Math.floor(z1/ROCK_CELL) + 1; c++){
      const rs = rocksOf(c); if (!rs.some(k => inView(k.x, k.z, 14))) continue;
      let rc = rockMeshes.get(c); if (!rc){ rc = { mesh: buildRocks(c), seen: 0 }; rockMeshes.set(c, rc); } rc.seen = fcount;
    }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    for (const [, ch] of want){ ch.mesh = buildChunk(ch.i, ch.j); if (performance.now() - t0 > budget) break; }
    // drop what's long out of view (kept a while, so a turn back and forth doesn't remake it)
    if (fcount % 30 === 0){
      for (const [k, ch] of chunks) if (fcount - ch.seen > 600 && chunks.size > 140){ if (ch.mesh){ scene.remove(ch.mesh); ch.mesh.geometry.dispose(); } chunks.delete(k); }
      for (const [k, rc] of rockMeshes) if (fcount - rc.seen > 600 && rockMeshes.size > 24){ scene.remove(rc.mesh); rc.mesh.geometry.dispose(); rockMeshes.delete(k); }
      if (rockCache.size > 400) rockCache.clear();
    }
    // the depth window: start a new one once the view is within reach of the edge of this one
    if (!bake && bakeAt && Math.max(Math.abs(camT.x - bakeAt.x), Math.abs(camT.z - bakeAt.z)) > DW_/2 - Math.hypot(hw, Math.max(-back, front)) - 8) startBake(camT.x, camT.z);
    if (bake) bakeRows(4);
  }

  /* ---------- turning, zooming, panning, tilting: as in the sky city ---------- */
  const ptrs = new Map(); let act = null, pinch0 = 0, zoom0 = 0, pinchX = 0;
  const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const pmidX = () => { const [a, b] = [...ptrs.values()]; return (a.x + b.x)/2; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2){ act = { kind: 'pinch' }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); return; }
    act = { kind: 'turn', x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p || !act) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), ZMIN, ZMAX); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    if (act.moved){ yawT -= dx*.008; if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); canvas.style.cursor = 'grabbing'; }
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (!ptrs.size){ act = null; canvas.style.cursor = 'grab'; } };
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
    if (k === 'q') yawT -= PI/4;
    else if (k === 'e') yawT += PI/4;
    else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9, ZMIN, ZMAX);
    else if (e.key === '-') zoomT = clamp(zoomT*1.1, ZMIN, ZMAX);
  });
  document.querySelectorAll('.hud button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.hud button').forEach(x => x.classList.toggle('on', x === b)); setHour(+b.dataset.h); }));

  /* ---------- every frame ---------- */
  setHour(11); resize();
  { const v = updateCamera(0); startBake(camT.x, camT.z); bakeRows(1e9); stream(v, 1e9); }   // (the first view whole, before the first frame)
  const t0 = performance.now(); let last = t0;
  function frame(now){
    const dt = Math.min(.1, (now - last)/1000); last = now;
    const v = updateCamera(dt); stream(v, 6);
    const t = (now - t0)/1000; seaU.time.value = t; skyU.time.value = t;
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(skyScene, skyCam);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam);
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(blitScene, skyCam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.COAST = { setHour, heightAt, coastX, get state(){ return { yaw, zoom, pitch, x: camT.x, z: camT.z, chunks: chunks.size, built: [...chunks.values()].filter(c => c.mesh).length }; },
    go(o){ if (o.yaw !== undefined) yaw = yawT = o.yaw; if (o.zoom !== undefined) zoom = zoomT = o.zoom; if (o.x !== undefined){ camGoal.x = camT.x = o.x; } if (o.z !== undefined){ camGoal.z = camT.z = o.z; } } };
})();
