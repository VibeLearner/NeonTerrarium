// Neon Terrarium: the ground (a test page, coast.html). A clifftop meadow on the left that ends in a limestone cliff,
// the sea below it to the right, out to a soft horizon. Mood: the "feel" board (bright Mediterranean noon, deep teal sky,
// turquoise shallows going to deep blue, warm cream and ochre rock, hard clean shadows, a lot of quiet space).
// Drawn like the sky city: an orthographic camera at the same tilt, the scene rendered small and scaled up in hard
// pixels, toon lighting in three steps. The sea is one shader: its color comes from how deep the seabed is under each
// point (a height map baked from the same terrain function), with caustics in the shallows, foam that breathes against
// the rocks, wave streaks out deep, sun glints, and haze toward the horizon. No Math.random: everything is seeded.
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

  /* ---------- the land: a clifftop meadow, a cove with a little beach, the seabed falling away ---------- */
  const TOP = 6.5;   // the meadow's height above the sea
  const coastX = z => 1.5*n1(z*.06 + 2) + .9*n1(z*.19 + 7) + .35*n1(z*.6) - 7.5*Math.exp(-(((z - 9)/5.5)**2));   // the cliff edge (the cove bites in at z = 9)
  const cove = z => Math.exp(-(((z - 9)/4.2)**2));
  // offshore: a sea stack and a few rocks (part of the seabed, so the foam rings them)
  const STACK = { x: 15, z: -9, r: 2.3 };
  const ROCKS = [[5.5, -2, .9], [4.2, 17, .7], [7, 4, .55], [3.3, -16, .8], [6.5, 21, .6]];
  function heightAt(x, z){
    const s = coastX(z) - x;   // inland distance from the cliff edge (negative: out at sea)
    const top = TOP + .55*(fbm(x*.07, z*.07) - .5) + clamp(-x*.025, 0, .8);
    const c = cove(z);
    if (s > 0){
      // the cliff: a steep face with a ledge two thirds of the way down, then the meadow
      const face = s < 1.6 ? (s/1.6) : 1;
      let cliffY = top*Math.pow(face, .32);
      if (s < .9 && s > .45) cliffY = Math.min(cliffY, top*.62 + (s - .45)*1.2);   // (the ledge)
      const beachY = Math.min(top, .25 + .42*s + .02*s*s);   // in the cove: a sandy slope
      return lerp(cliffY, beachY, c);
    }
    // the seabed: a rocky shelf at the cliff's foot, sand in the cove, then the drop to deep water
    const o = -s;
    let y = -.15 - 1.1*Math.pow(o, .8) - .012*o*o;
    y += (fbm(x*.25, z*.25) - .5)*1.6*(1 - c*.7)*smooth(9, 2, o);  // rocks on the shelf near the cliff, smoother sand in the cove, a smooth floor out deep
    y = lerp(y, .2 - .55*o, c*smooth(5, 0, o));                    // the beach running into the water
    const rr = (cx, cz, r, hgt) => { const d = Math.hypot(x - cx, z - cz); if (d < r) y = Math.max(y, hgt - (d/r)**2*(hgt + 2.5)); };
    rr(STACK.x, STACK.z, STACK.r + 1.2, .45);
    for (const [rx, rz, rs] of ROCKS) rr(rx, rz, rs + .5, .35);
    return Math.max(y, -22);
  }

  /* ---------- the scene ---------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe4e3, 400, 460);
  const gData = new Uint8Array([150, 150, 150, 255, 200, 200, 200, 255, 240, 240, 240, 255]);
  const gradTex = new THREE.DataTexture(gData, 3, 1, THREE.RGBAFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  const toon = (hex, o) => new THREE.MeshToonMaterial(Object.assign({ color: hex, gradientMap: gradTex }, o || {}));

  // the terrain: a grid, fine near the coast so the cliff stands up straight, colored by what each point is
  const X0 = -64, X1 = 24, Z0 = -72, Z1 = 72, STEP = .36;
  const nx = Math.round((X1 - X0)/STEP) + 1, nz = Math.round((Z1 - Z0)/STEP) + 1;
  const pos = new Float32Array(nx*nz*3), col = new Float32Array(nx*nz*3);
  const C = h => new THREE.Color(h);
  const PAL = { grass: [C(0x5a8a3c), C(0x66934a), C(0x7a9f52), C(0x52803a)], dry: C(0xbdb07a), path: C(0xd2b282), sand: C(0xecd7a2), wet: C(0xc8b07f),
    rock: [C(0xefe5cf), C(0xe2cfa9), C(0xd6b27e), C(0xf4ecdc), C(0xc99f6c)], under: C(0xcdb98c), seaRock: C(0x8a9a86) };
  // a dirt path across the meadow to the cliff edge (the photos' country lane)
  const pathD = (x, z) => Math.abs(z - (2.5*Math.sin(x*.09 + .6) + x*.12 - 3));
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++, k++){
    const x = X0 + i*STEP, z = Z0 + j*STEP, y = heightAt(x, z);
    pos[k*3] = x; pos[k*3 + 1] = y; pos[k*3 + 2] = z;
    const s = coastX(z) - x, c = cove(z);
    let cc;
    if (y < -.05) cc = (fbm(x*.25, z*.25) > .55 ? PAL.seaRock : PAL.under);
    else {
      const slope = Math.abs(heightAt(x + .15, z) - heightAt(x - .15, z)) + Math.abs(heightAt(x, z + .15) - heightAt(x, z - .15));
      if (c > .45 && y < 2.2 && slope < 1.4) cc = y < .35 ? PAL.wet : PAL.sand;
      else if (slope > .9 && y < TOP - .25){ const band = Math.floor(y*1.35 + .6*n1(z*.3)) & 7; cc = PAL.rock[[0, 1, 3, 2, 0, 4, 1, 3][band]]; }   // strata in the limestone
      else {
        const p = fbm(x*.11 + 40, z*.11), q = vnoise(x*.9, z*.9);
        cc = PAL.grass[p < .38 ? 3 : p < .5 ? 0 : p < .62 ? 1 : 2].clone();
        if (s < 1.9 && s > 0) cc.lerp(PAL.dry, .55);                                   // sun-dried grass at the edge
        if (pathD(x, z) < .55 + .25*q && x < coastX(z) - 1.2) cc = PAL.path;
      }
    }
    col[k*3] = cc.r; col[k*3 + 1] = cc.g; col[k*3 + 2] = cc.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++){ const a = j*nx + i, b = a + 1, c2 = a + nx, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
  // flat shading: every triangle its own corners (the chunky faceted look of the city's toon blocks)
  const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g0.setAttribute('color', new THREE.BufferAttribute(col, 3)); g0.setIndex(idx);
  const terrainGeo = g0.toNonIndexed(); terrainGeo.computeVertexNormals();
  const HZ = { tgt: { value: new THREE.Vector2() }, fwd: { value: new THREE.Vector2(1, 0) }, horizon: { value: 30 } };
  const terrainM = toon(0xffffff, { vertexColors: true });
  terrainM.onBeforeCompile = sh => { Object.assign(sh.uniforms, HZ);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec2 tgt, fwd; uniform float horizon; varying vec3 vWp;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (dot(vWp.xz - tgt, fwd) > horizon) discard;'); };
  const terrain = new THREE.Mesh(terrainGeo, terrainM);
  terrain.receiveShadow = terrain.castShadow = true; scene.add(terrain);

  // the sea stack and the rocks: pale limestone, stacked and leaning a little
  const rockM = [toon(0xf2ead8), toon(0xe6d3ad), toon(0xd8b98a)];
  function stack(x, z, r, h, seed){
    const g = new THREE.Group(); let y = -2, rr = r;
    for (let i = 0; y < h; i++){
      const hh = .7 + hash2(seed, i)*1.1, m = new THREE.Mesh(new THREE.CylinderGeometry(rr*(.82 + .1*hash2(i, seed)), rr, hh, 6), rockM[[0, 0, 1, 0, 2, 1][i % 6]]);
      m.position.set(x + (hash2(seed + 3, i) - .5)*.25*i*.25, y + hh/2, z + (hash2(seed + 5, i) - .5)*.25); m.rotation.y = hash2(seed, i + 9)*PI;
      m.castShadow = true; g.add(m); y += hh; rr *= .9 + .06*hash2(seed + 7, i);
    }
    scene.add(g);
  }
  stack(STACK.x, STACK.z, STACK.r, 9.5, 11);
  for (const [rx, rz, rs] of ROCKS){ const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockM[(rx*7 | 0) % 3]); m.position.set(rx, rs*.15, rz); m.rotation.set(rx, rz, 0); m.castShadow = true; scene.add(m); }

  // a lone wind-bent tree at the edge, and a whitewashed low wall along the lane (from the board)
  { const g = new THREE.Group(), x = coastX(-14) - 4.5, z = -14, y = heightAt(x, z);
    const trunkM = toon(0x7a5a3e), leafM = [toon(0x3f6e2c), toon(0x527f33), toon(0x6a9a3c)];
    let px = x, py = y, pz = z;
    for (let i = 0; i < 6; i++){ const t = new THREE.Mesh(new THREE.CylinderGeometry(.18 - i*.02, .26 - i*.02, .9, 5), trunkM); t.position.set(px + .12, py + .45, pz); t.rotation.z = -.35 - i*.04; t.castShadow = true; g.add(t); px += .32; py += .78; }
    for (let i = 0; i < 9; i++){ const r = .9 + hash2(i, 3)*.7, b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafM[i % 3]);
      b.position.set(px - .6 + hash2(i, 1)*3.4, py + hash2(i, 2)*1.1 - .3, pz - 1.6 + hash2(i, 4)*3.2); b.scale.y = .62; b.castShadow = true; g.add(b); }
    scene.add(g); }
  { const wallM = toon(0xf6f1e6), capM = toon(0xe8e0cf);
    for (let x = -30; x < coastX(5) - 3; x += 1.2){ const z = 2.5*Math.sin(x*.09 + .6) + x*.12 - 3 + 1.6, y = heightAt(x, z);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.22, .55, .3), wallM); b.position.set(x, y + .25, z); b.rotation.y = -Math.atan(.12 + .225*Math.cos(x*.09 + .6)); b.castShadow = b.receiveShadow = true; scene.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.22, .08, .36), capM); c.position.set(x, y + .56, z); c.rotation.y = b.rotation.y; scene.add(c); } }

  /* ---------- the sea ---------- */
  // the seabed's depth under the water, baked once into a texture the sea reads
  const DX0 = -30, DX1 = 98, DZ0 = -64, DZ1 = 64, DN = 512;
  const dd = new Uint8Array(DN*DN);   // (as bytes, square-rooted: fine steps in the shallows where the foam and caustics need them)
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++){ const x = DX0 + (i + .5)/DN*(DX1 - DX0), z = DZ0 + (j + .5)/DN*(DZ1 - DZ0); dd[j*DN + i] = Math.round(Math.sqrt(clamp(-heightAt(x, z), 0, 24)/24)*255); }
  const dtex = new THREE.DataTexture(dd, DN, DN, THREE.RedFormat, THREE.UnsignedByteType); dtex.minFilter = dtex.magFilter = THREE.LinearFilter; dtex.needsUpdate = true;
  const seaU = { time: { value: 0 }, depthTex: { value: dtex }, box: { value: new THREE.Vector4(DX0, DZ0, DX1 - DX0, DZ1 - DZ0) },
    sunDir: { value: new THREE.Vector3() }, camXZ: { value: new THREE.Vector2() }, tint: { value: new THREE.Color(1, 1, 1) }, haze: { value: new THREE.Color(0xbfe4e3) },
    glint: { value: new THREE.Color(1, 1, 1) } };
  seaU.fogNear = { value: 400 }; seaU.fogFar = { value: 460 }; seaU.tgt = { value: new THREE.Vector2() }; seaU.fwd = { value: new THREE.Vector2(1, 0) }; seaU.horizon = { value: 30 };
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({ uniforms: seaU,
    vertexShader: `varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 v = viewMatrix * w; vDepth = -v.z; gl_Position = projectionMatrix * v; }`,
    fragmentShader: `
      uniform float time; uniform sampler2D depthTex; uniform vec4 box; uniform vec3 sunDir; uniform vec2 camXZ; uniform vec3 tint, haze, glint; uniform float fogNear, fogFar; uniform vec2 tgt, fwd; uniform float horizon;
      varying vec3 vW; varying float vDepth;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); float b = 0.0;
        b = mod(q.x + 2.0*q.y, 4.0) == 0.0 ? 0.0 : 0.0;
        int i = int(q.x) + int(q.y)*4; float m[16];
        m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
        for (int k = 0; k < 16; k++) if (k == i) b = m[k];
        return b/16.0; }
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
        float w = sin(dot(p, vec2(-0.92, 0.38))*0.55 + time*0.65 + sin(p.y*0.11)*2.0) + 0.6*sin(dot(p, vec2(-0.55, -0.83))*0.9 - time*0.9);
        col = mix(col, col*1.1 + vec3(0.02, 0.035, 0.04), step(1.52, w) * step(0.0, dith) * smoothstep(1.5, 5.0, d));
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
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 260 }); sun.shadow.bias = -.0006;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x6a7a4a, .55); scene.add(hemi);
  const SKY = { top: new THREE.Color(), mid: new THREE.Color(), low: new THREE.Color() };
  function setHour(h){
    const t = clamp((h - 6)/12.6, 0, 1), el = Math.sin(t*PI)*1.05 + .08, az = lerp(-.9, 2.4, t);
    sun.position.set(Math.cos(az)*Math.cos(el)*120, Math.sin(el)*120, Math.sin(az)*Math.cos(el)*120);
    const warm = smooth(15.5, 18.8, h);
    sun.color.setRGB(1, lerp(.98, .78, warm), lerp(.94, .55, warm)); sun.intensity = lerp(.92, .82, warm);
    hemi.color.setRGB(lerp(.8, 1, warm), lerp(.92, .8, warm), lerp(1, .78, warm)); hemi.intensity = lerp(.62, .55, warm);
    SKY.top.setRGB(lerp(.03, .1, warm), lerp(.27, .22, warm), lerp(.42, .4, warm));
    SKY.mid.setRGB(lerp(.1, .5, warm), lerp(.46, .48, warm), lerp(.58, .56, warm));
    SKY.low.setRGB(lerp(.72, .99, warm), lerp(.89, .78, warm), lerp(.87, .6, warm));
    seaU.haze.value.copy(SKY.low); scene.fog.color.copy(SKY.low);
    seaU.tint.value.setRGB(lerp(1, 1.06, warm), lerp(1, .9, warm), lerp(1, .82, warm));
    seaU.glint.value.setRGB(1, lerp(1, .9, warm), lerp(1, .7, warm));
    seaU.sunDir.value.copy(sun.position).normalize();
    skyU.cloud.value.setRGB(1, lerp(1, .9, warm), lerp(1, .8, warm)); skyU.cloudShade.value.setRGB(lerp(.84, .95, warm), lerp(.9, .8, warm), lerp(.95, .78, warm));
  }

  /* ---------- the pixels: drawn small, then scaled up hard ---------- */
  const PX = 3;
  let rt = null;
  const skyU = { top: { value: SKY.top }, mid: { value: SKY.mid }, low: { value: SKY.low }, hor: { value: .7 }, time: { value: 0 }, aspect: { value: 1.6 }, cloud: { value: new THREE.Color(1, 1, 1) }, cloudShade: { value: new THREE.Color(.84, .9, .95) }, yaw: { value: 0 } };
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: skyU, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, low, cloud, cloudShade; uniform float hor, time, aspect, yaw; varying vec2 vU;
      float bayer2(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0); float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
      void main(){ float y = (vU.y - hor)/max(0.05, 1.0 - hor); y += (bayer2(gl_FragCoord.xy) - 0.5)/14.0; y = floor(clamp(y, 0.0, 1.0)*14.0 + 0.5)/14.0;
        vec3 c = y > 0.35 ? mix(mid, top, (y - 0.35)/0.65) : mix(low, mid, smoothstep(0.0, 0.35, y));
        // a few heaped clouds sitting on the horizon, drifting slowly (they turn with the view)
        vec2 q = vec2(vU.x*aspect + yaw*0.9 + time*0.004, vU.y - hor);
        for (int i = 0; i < 4; i++){
          float fi = float(i), cx = mod(fi*1.37 + 0.4, 2.6*aspect/1.6), base = 0.03 + 0.09*mod(fi*0.61, 1.0), w = 0.1 + 0.06*mod(fi*1.9, 1.0);
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

  /* ---------- the camera: the sky city's (orthographic, tilted 32 degrees), turned to look out to sea ---------- */
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
  const view = { yaw: PI/2 + .5, pitch: 32*PI/180, zoom: 34, tx: 0, tz: -4 };
  function place(){
    const w = canvas.clientWidth, h = canvas.clientHeight, a = w/h, H = view.zoom/2;
    cam.left = -H*a; cam.right = H*a; cam.top = H; cam.bottom = -H; cam.updateProjectionMatrix();
    const D = 400; cam.position.set(view.tx - Math.cos(view.yaw)*Math.cos(view.pitch)*D, Math.sin(view.pitch)*D + 2, view.tz - Math.sin(view.yaw)*Math.cos(view.pitch)*D);
    cam.lookAt(view.tx, 2, view.tz);
    sun.target.position.set(view.tx, 0, view.tz);
    // the horizon: a distance ahead that lands about three quarters up the screen; everything fades into haze on the way there
    const sp = Math.sin(view.pitch), cp = Math.cos(view.pitch), R = (H*.42 + 2*cp)/sp;
    sea.scale.set(R*3, R*3, 1); sea.position.set(view.tx, 0, view.tz);
    seaU.tgt.value.set(view.tx, view.tz); seaU.fwd.value.set(Math.cos(view.yaw), Math.sin(view.yaw)); seaU.horizon.value = R;
    HZ.tgt.value.copy(seaU.tgt.value); HZ.fwd.value.copy(seaU.fwd.value); HZ.horizon.value = R;
    const near = D + R*.3*cp, far = D + R*.94*cp;   // (view depth: the target sits at D; a point g ahead at sea level is about g*cos(pitch) deeper)
    scene.fog.near = near; scene.fog.far = far; seaU.fogNear.value = near; seaU.fogFar.value = far;
    skyU.hor.value = .5 + .5*(R*sp - 2*cp)/H - .02; skyU.yaw.value = view.yaw;
    seaU.camXZ.value.set(cam.position.x, cam.position.z);
  }
  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false);
    if (rt) rt.dispose(); rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w/PX)), Math.max(1, Math.round(h/PX)), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    blit.material.map = rt.texture; blit.material.needsUpdate = true; skyU.aspect.value = w/h; place();
  }
  addEventListener('resize', resize);

  /* ---------- turning, zooming, panning ---------- */
  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, yaw: view.yaw, tx: view.tx, tz: view.tz }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.b === 2 || e.shiftKey){ const s = view.zoom/canvas.clientHeight, f = [Math.cos(view.yaw), Math.sin(view.yaw)], r = [-f[1], f[0]];
      view.tx = drag.tx - (dx*r[0] - dy*f[0]/Math.sin(view.pitch))*s; view.tz = drag.tz - (dx*r[1] - dy*f[1]/Math.sin(view.pitch))*s; }
    else view.yaw = drag.yaw + dx*.006;
    place(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom = clamp(view.zoom*Math.exp(e.deltaY*.0012), 10, 90); place(); }, { passive: false });
  document.querySelectorAll('.hud button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.hud button').forEach(x => x.classList.toggle('on', x === b)); setHour(+b.dataset.h); }));

  /* ---------- every frame ---------- */
  setHour(11); resize();
  const t0 = performance.now();
  function frame(now){
    const t = (now - t0)/1000;
    seaU.time.value = t;
    skyU.time.value = t;
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(skyScene, skyCam);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam);
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(blitScene, skyCam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.COAST = { view, place, setHour };
})();
