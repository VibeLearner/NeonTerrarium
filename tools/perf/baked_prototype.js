// Neon Terrarium: baked far buildings (round 10, item 1: the prototype). Inert unless window.__BAKED_PROTO is set (a test page).
// A plot's real geometry is baked, from outside each face of a shell of boxes that follows its mass, into small textures (per texel: the vertex color,
// the emissive color and kind, the normal, the window's switch-on threshold). The shell is drawn with the buildings' own toon lighting reading those
// textures instead of vertex attributes, so sun, sky light, shadows, the evening switch-on and the grade keep working. Flickering and blinking pieces
// are baked switched off and stay live through the glow overlay. What sticks out of the shell by more than BK.keep, and the ground layer, stay real.
const BK = { shellOpts: {}, tpu: 16, out: .3, inn: .7, keep: .3, ground: .3, vox: .2, protoOn: () => !!window.__BAKED_PROTO, stats: [] };
const bkRanges = g => { const u = g.userData.cut; return u ? [[0, u.A], [u.A + u.H, u.A + u.H + u.S]] : [[0, g.userData.shown ?? g.index.count]]; };
// ---- the shell: js/shell.js (item 2) works out the boxes and what stays real; here its face rectangles become bake faces (u across the picture, v up it) ----
function bkShellOf(g){
  const P = g.attributes.position.array, I = g.index.array, cut = g.userData.cut, part = Shell.atlasParts(P, I, cut), r = Shell.build([part], BK.shellOpts);
  const keepSet = new Set(r.keep[0]), faces = [], bakeIx = [], keepIx = [];
  for (const f of r.faces){
    // (a, then its next two axes: a0..a1 along (a + 1) % 3, b0..b1 along (a + 2) % 3)
    const o = f.ax === 0 ? { u: 2, v: 1, u0: f.b0, u1: f.b1, v0: f.a0, v1: f.a1 } : f.ax === 1 ? { u: 0, v: 2, u0: f.b0, u1: f.b1, v0: f.a0, v1: f.a1 } : { u: 0, v: 1, u0: f.a0, u1: f.a1, v0: f.b0, v1: f.b1 };
    faces.push({ a: f.ax, s: f.dir, plane: f.c, u: o.u, v: o.v, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1, box: f.box });
  }
  for (const [a, b] of part.vis) for (let t = a; t < b; t++){ const q = t*3; if (keepSet.has(t)) keepIx.push(I[q], I[q + 1], I[q + 2]); else bakeIx.push(I[q], I[q + 1], I[q + 2]); }
  return { boxes: r.boxes, faces, bakeIx, keepIx, stats: r.stats };
}
// ---- baking ----
const BK_FACE_MAT = new THREE.ShaderMaterial({
  uniforms: { uPass: { value: 0 }, uSlab: { value: 1 } },
  vertexShader: `uniform int uPass; attribute vec3 color; attribute vec4 aEm; attribute float aOn; attribute float aFlk; varying vec4 vA; varying float vD;
    void main(){
      if (uPass == 0) vA = vec4(color, 1.0);
      else if (uPass == 1){ int ek = int(aEm.a*255.0 + .5); bool live = aFlk > 0.5 || ek == 6; vA = vec4(aEm.rgb, live ? 0.0 : float(ek)/255.0); }
      else vA = vec4(normal.xyz*127.0/255.0 + 127.0/255.0, aOn);   // (the normal is a byte per axis, exact on what the buildings' own int8 normals hold)
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: 'uniform int uPass; uniform float uSlab; varying vec4 vA; varying float vD; void main(){ gl_FragColor = uPass == 0 ? vec4(vA.rgb, (clamp(vD/uSlab, 0.0, 1.0)*254.0 + 1.0)/255.0) : vA; }', side: THREE.DoubleSide, blending: THREE.NoBlending,
});
const bkCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), bkScene = new THREE.Scene(); bkScene.userData.always = true;   // (always: the test harness skips most draws; a bake is work a skipped frame still has to do)
function bkPack(faces, W){ let x = 0, y = 0, rowH = 0; const order = faces.slice().sort((p, q) => q.h - p.h);
  for (const f of order){ if (x + f.w + 2 > W){ x = 0; y += rowH + 2; rowH = 0; } f.ax = x + 1; f.ay = y + 1; x += f.w + 2; rowH = Math.max(rowH, f.h); }
  return y + rowH + 2; }
function bkBake(g, sh){
  const faces = sh.faces;
  for (const f of faces){ f.w = Math.max(2, Math.ceil((f.u1 - f.u0)*BK.tpu)); f.h = Math.max(2, Math.ceil((f.v1 - f.v0)*BK.tpu)); }
  const W = 1024, Hh = bkPack(faces, W);
  const bg = new THREE.BufferGeometry(); for (const k in g.attributes) bg.setAttribute(k, g.attributes[k]); bg.setIndex(new THREE.BufferAttribute(g.index.count > 0 && g.attributes.position.count > 65535 ? new Uint32Array(sh.bakeIx) : new Uint16Array(sh.bakeIx), 1));
  const mesh = new THREE.Mesh(bg, BK_FACE_MAT); mesh.frustumCulled = false; bkScene.add(mesh);
  const rts = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(W, Hh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false }));
  const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha(), pac = renderer.autoClear;
  renderer.autoClear = false; renderer.setClearColor(0x000000, 0);
  for (const f of faces){
    const cu = (f.u0 + f.u1)/2, cv = (f.v0 + f.v1)/2, c = [0, 0, 0]; c[f.a] = f.plane + f.s*BK.out; c[f.u] = cu; c[f.v] = cv;
    const cam = bkCam; cam.left = -(f.u1 - f.u0)/2; cam.right = (f.u1 - f.u0)/2; cam.top = (f.v1 - f.v0)/2; cam.bottom = -(f.v1 - f.v0)/2; cam.near = 0; cam.far = BK.out + BK.inn; cam.updateProjectionMatrix();
    cam.position.set(c[0], c[1], c[2]);
    const tgt = c.slice(); tgt[f.a] -= f.s; cam.up.set(0, f.a === 1 ? 0 : 1, f.a === 1 ? -1 : 0);
    cam.lookAt(tgt[0], tgt[1], tgt[2]); cam.updateMatrixWorld();
    // where the face's corners land in the picture: the shell's texture coordinates (right and up of the picture along the face's u and v)
    const ru = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), rv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const du = [0, 0, 0]; du[f.u] = 1; const dv = [0, 0, 0]; dv[f.v] = 1;
    f.flipU = ru.x*du[0] + ru.y*du[1] + ru.z*du[2] < 0; f.flipV = rv.x*dv[0] + rv.y*dv[1] + rv.z*dv[2] < 0;
    rts.forEach((rt, pass) => { rt.viewport.set(f.ax, f.ay, f.w, f.h); rt.scissor.set(f.ax, f.ay, f.w, f.h); rt.scissorTest = true; renderer.setRenderTarget(rt); renderer.clear(true, true, false); BK_FACE_MAT.uniforms.uPass.value = pass; BK_FACE_MAT.uniforms.uSlab.value = BK.out + BK.inn; renderer.render(bkScene, cam); });
  }
  bkScene.remove(mesh); bg.dispose();
  for (const rt of rts) rt.scissorTest = false;
  renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa); renderer.autoClear = pac;
  // read back, and fill what nothing was found at from its neighbors (a face's texels that saw nothing in the slab), face by face; the three pictures become plain textures
  const bufs = rts.map(rt => { const b = new Uint8Array(W*Hh*4); renderer.readRenderTargetPixels(rt, 0, 0, W, Hh, b); return b; });
  let holes = 0, area = 0;
  for (const f of faces){
    for (let it = 0; it < 8; it++){
      let left = 0; const A = bufs[0], mark = [];
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++){ const p = ((f.ay + y)*W + f.ax + x)*4; if (A[p + 3]) continue;
        let q = -1; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]){ const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= f.w || Y >= f.h) continue; const r = ((f.ay + Y)*W + f.ax + X)*4; if (A[r + 3]){ q = r; break; } }
        if (q >= 0) mark.push(p, q); else left++; }
      if (it === 0){ holes += mark.length/2 + left; }
      for (let m = 0; m < mark.length; m += 2) for (const b of bufs){ for (let k = 0; k < 4; k++) b[mark[m] + k] = b[mark[m + 1] + k]; bufs[0][mark[m] + 3] = 255; }
      if (!mark.length) break;
    }
    area += f.w*f.h;
  }
  for (const rt of rts) rt.dispose();
  const tex = bufs.map(b => { const t = new THREE.DataTexture(b, W, Hh, THREE.RGBAFormat, THREE.UnsignedByteType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
  return { tex, bufs, W, H: Hh, texels: W*Hh, holes, area };
}
// ---- the shell as geometry, and its material: the buildings' toon lighting reading the baked textures ----
// The shell's faces are drawn at the slab's outer boundary (BK.out outside the wall plane); the fragment shader marches the ray into the baked depth (relief mapping) to find the surface the
// real building shows there, so balconies, frames and sills keep their parallax and stick out of the wall's plane as they should. Fragments whose ray finds nothing are thrown away.
const BK_MATS = [];
function bkMaterial(at){
  const m = ATLAS.clone(); m.vertexColors = false; m.customProgramCacheKey = () => 'baked';
  m.userData.bk = at; BK_MATS.push(m);
  m.onBeforeCompile = sh => {
    ATLAS.onBeforeCompile(sh);
    sh.uniforms.tA = { value: at.tex[0] }; sh.uniforms.tE = { value: at.tex[1] }; sh.uniforms.tN = { value: at.tex[2] }; sh.uniforms.uSlab = { value: BK.out + BK.inn }; sh.uniforms.uSteps = BK.steps;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aO; attribute vec3 aU; attribute vec3 aV; attribute vec4 aR; varying vec3 vO; varying vec3 vU; varying vec3 vV; varying vec4 vR; varying vec3 vP; varying vec3 vNo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvO = aO; vU = aU; vV = aV; vR = aR; vP = (modelMatrix*vec4(transformed, 1.0)).xyz; vNo = normal;')
      .replace(/int ek = int\(aEm\.a\*255\.0 \+ \.5\);[^\n]*\n[^\n]*\n/, 'vEmis = vec3(0.0);\n')
      .replace(LOD_CULL_GLSL, '');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tA; uniform sampler2D tE; uniform sampler2D tN; uniform float uSlab; uniform int uSteps; uniform mat4 projectionMatrix; varying vec3 vO; varying vec3 vU; varying vec3 vV; varying vec4 vR; varying vec3 vP; varying vec3 vNo; uniform float emI[7]; uniform float lightsOn; uniform float fTime; vec3 bkN; vec2 bkUv;' + LIT_GLSL
        + `
float bkDepth(vec2 l){ vec4 t = texture2D(tA, vR.xy + l*vR.zw); return t.a < .001 ? 2.0 : (t.a*255.0 - 1.0)/254.0; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  vec3 bkD = normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2]));
  float bkUU = dot(vU, vU), bkVV = dot(vV, vV), bkDD = -dot(bkD, normalize(vNo));
  vec2 bkL0 = vec2(dot(vP - vO, vU)/bkUU, dot(vP - vO, vV)/bkVV), bkDL = vec2(dot(bkD, vU)/bkUU, dot(bkD, vV)/bkVV)*(uSlab/max(bkDD, .02));
  float bkS = -1.0, bkPrev = 0.0;
  for (int i = 0; i <= 64; i++){ if (i > uSteps) break; float si = float(i)/float(uSteps); vec2 l = bkL0 + bkDL*si;
    if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) break;
    if (si >= bkDepth(l)){ bkS = si; break; } bkPrev = si; }
  if (bkS < 0.0) discard;
  { float lo = bkPrev, hi = bkS; for (int k = 0; k < 5; k++){ float mid = (lo + hi)*.5; vec2 l = bkL0 + bkDL*mid; if (mid >= bkDepth(l)) hi = mid; else lo = mid; } bkS = hi; }
  bkUv = vR.xy + clamp(bkL0 + bkDL*bkS, 0.0, 1.0)*vR.zw;
  { vec3 ph = vP + bkD*(bkS*uSlab/max(bkDD, .02)); vec4 cc = projectionMatrix*viewMatrix*vec4(ph, 1.0); gl_FragDepth = cc.z/cc.w*.5 + .5; }`)
      .replace('#include <color_fragment>', 'vec4 bkA = texture2D(tA, bkUv); diffuseColor.rgb *= bkA.rgb;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( vNormal );', 'vec3 wN = (texture2D(tN, bkUv).rgb*255.0 - 127.0)/127.0; bkN = normalize((viewMatrix*vec4(wN, 0.0)).xyz); vec3 normal = bkN;'))
      .replace('totalEmissiveRadiance = vEmis;', `vec4 bkE = texture2D(tE, bkUv); int ek = int(bkE.a*255.0 + .5); vec3 bkEm = vec3(0.0);
        if (ek > 0){ float lon = ek <= 4 ? litOn(texture2D(tN, bkUv).a, lightsOn, fTime) : 1.0; bkEm = bkE.rgb*mix(ek == 1 ? .22*(1.0 - .6*lightsOn) : 0.0, emI[ek], lon); }
        totalEmissiveRadiance = bkEm;`)
      .replace('#include <dithering_fragment>', THREE.ShaderChunk.dithering_fragment.replace(/vNormal/g, 'bkN'));
  };
  return m;
}
BK.steps = { value: 32 };
function bkShellGeometry(sh, at, inflate){
  const pos = [], nrm = [], ao = [], au = [], av = [], ar = [], ix = [];
  for (const f of sh.faces){
    const k = pos.length/3, po = f.plane + (inflate ? f.s*BK.out : 0);
    const pt = (cu, cv) => { const c = [0, 0, 0]; c[f.a] = po; c[f.u] = cu; c[f.v] = cv; return c; };
    const ux0 = (f.ax + .5)/at.W, ux1 = (f.ax + f.w - .5)/at.W, uy0 = (f.ay + .5)/at.H, uy1 = (f.ay + f.h - .5)/at.H;
    const cuO = f.flipU ? f.u1 : f.u0, cvO = f.flipV ? f.v1 : f.v0, O = pt(cuO, cvO);
    const U = [0, 0, 0], V = [0, 0, 0]; U[f.u] = (f.flipU ? -1 : 1)*(f.u1 - f.u0); V[f.v] = (f.flipV ? -1 : 1)*(f.v1 - f.v0);
    for (const [cu, cv] of [[f.u0, f.v0], [f.u1, f.v0], [f.u1, f.v1], [f.u0, f.v1]]){
      pos.push(...pt(cu, cv)); const n = [0, 0, 0]; n[f.a] = f.s; nrm.push(...n); ao.push(...O); au.push(...U); av.push(...V); ar.push(ux0, uy0, ux1 - ux0, uy1 - uy0); }
    const p = i => [pos[(k + i)*3], pos[(k + i)*3 + 1], pos[(k + i)*3 + 2]], A = p(0), B = p(1), C = p(2);
    const cr = [(B[1] - A[1])*(C[2] - A[2]) - (B[2] - A[2])*(C[1] - A[1]), (B[2] - A[2])*(C[0] - A[0]) - (B[0] - A[0])*(C[2] - A[2]), (B[0] - A[0])*(C[1] - A[1]) - (B[1] - A[1])*(C[0] - A[0])];
    if (cr[f.a]*f.s > 0) ix.push(k, k + 1, k + 2, k, k + 2, k + 3); else ix.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (inflate){ geo.setAttribute('aO', new THREE.Float32BufferAttribute(ao, 3)); geo.setAttribute('aU', new THREE.Float32BufferAttribute(au, 3)); geo.setAttribute('aV', new THREE.Float32BufferAttribute(av, 3)); geo.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 4)); }
  geo.setIndex(ix); geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo;
}
const BK_CASTER = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });   // (the exact boxes: only for the shadow map; drawn, they change no pixel)
// ---- the prototype's page hook: this plot is drawn baked ----
function bkProto(c){
  const g = c.data.geo.get(ATLAS); if (!g || !g.index) return null;
  const t0 = performance.now(), sh = bkShellOf(g), t1 = performance.now(), at = bkBake(g, sh), t2 = performance.now();
  const grp = new THREE.Group(), sg = bkShellGeometry(sh, at, true), mat = bkMaterial(at);
  const sm = new THREE.Mesh(sg, mat); sm.castShadow = false; sm.receiveShadow = true; grp.add(sm);
  const cm = new THREE.Mesh(bkShellGeometry(sh, at, false), BK_CASTER); cm.castShadow = true; cm.receiveShadow = false; grp.add(cm);
  const kg = new THREE.BufferGeometry(); for (const k in g.attributes) kg.setAttribute(k, g.attributes[k]); kg.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(sh.keepIx) : new Uint16Array(sh.keepIx), 1)); kg.boundingSphere = g.boundingSphere; kg.boundingBox = g.boundingBox;
  const km = new THREE.Mesh(kg, ATLAS); km.castShadow = true; km.receiveShadow = true; km.userData.cell = c; grp.add(km);
  // the glow overlay of what was baked off: the flickering and blinking pieces (and the windows near their switch-on), drawn over the shell as the real ones are
  const og = new THREE.BufferGeometry(); for (const k in g.attributes) og.setAttribute(k, g.attributes[k]); og.setIndex(new THREE.BufferAttribute(g.attributes.position.count > 65535 ? new Uint32Array(sh.bakeIx) : new Uint16Array(sh.bakeIx), 1)); og.boundingSphere = g.boundingSphere;
  const om = new THREE.Mesh(og, ATLAS); om.layers.mask = 0; om.receiveShadow = true; grp.add(om);
  glowOverlay(om); freezeTree(grp);
  world.add(grp);
  for (const o of c.view.children) if (o.material === ATLAS || o.material === ATLAS_SIDE){ o.visible = false; o.userData.noMerge = true; }
  c.baked = { grp, sh, at };
  solidDirty.add(mergeKey(c.i, c.j)); shadowDirty = true;
  const info = { boxes: sh.boxes.length, faces: sh.faces.length, tris: sh.faces.length*2, kept: sh.keepIx.length/3, baked: sh.bakeIx.length/3, atlas: [at.W, at.H], mb: +(at.texels*12/1048576).toFixed(2), holeShare: +(at.holes/at.area).toFixed(3), msShell: +(t1 - t0).toFixed(0), msBake: +(t2 - t1).toFixed(0) };
  BK.stats.push(info); return info;
}
