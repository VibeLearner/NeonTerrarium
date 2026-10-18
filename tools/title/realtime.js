// Neon Terrarium: the title room, lit live. The bake (bake.py) leaves the room's surfaces unlit: its colours, which
// way each pixel faces, how far away it is, what it's made of, what glows, and the light the room throws back on
// itself. This lights them every frame: the sun through the porthole at whatever heading the turning pod has it, with
// real shadows (the room's own 3D model, already loaded for the plants and the lamp, is drawn into a shadow map from the
// sun), the sky's light through the glass, the room's lamps at night (the swinging pendant with its own moving shadow),
// the light bar (it blinks and lights the capsule), the light shafts marched through the sun's shadow map, ambient
// occlusion from the depth, the game's outlines, the hour's grade, a soft bloom, and the stepped, dithered pixel look.
'use strict';
const TITLE_RT = (() => {
  const C = THREE;
  const FS = `
#include <packing>
varying vec2 vUv;
uniform sampler2D tCol, tNrm, tDep, tMat, tGlow, tBar, tBounce, tStat, sunMap, sunDyn, lampMap;
uniform mat4 camWorld, sunMat, lampMat;
uniform vec2 projXY, res;
uniform float shafts, far, open, barOn, lampsK, density, exposure, bounceK, time, sunOn;
uniform vec3 sunDir, sunCol, skyCol, skyPos, hemiSky, hemiGround, ambCol, fillDir, fillCol, gradeHi, gradeLo, scatCol;
uniform vec3 pucks[3]; uniform vec3 downPos, pendPos, barPos, b5Pos, puckCol, downCol, pendCol, barCol, b5Col;
float dep(vec2 uv){ vec3 p = texture2D(tDep, uv).rgb; return dot(p, vec3(1., 1./255., 1./65025.))*far; }
vec3 vpos(vec2 uv){ float z = dep(uv); vec2 n = uv*2. - 1.; return vec3(n.x*z/projXY.x, n.y*z/projXY.y, -z); }
vec3 wpos(vec3 v){ return (camWorld*vec4(v, 1.)).xyz; }
float shadowAt(sampler2D m, mat4 M, vec3 p, float bias, float texel){
  vec4 s = M*vec4(p, 1.); s.xyz /= s.w; if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1.) return 1.;
  float sh = 0.; for (int k = 0; k < 5; k++){ vec2 o = k == 0 ? vec2(0.) : k == 1 ? vec2(1., 0.) : k == 2 ? vec2(-1., 0.) : k == 3 ? vec2(0., 1.) : vec2(0., -1.); float d = unpackRGBAToDepth(texture2D(m, s.xy + o*texel)); sh += s.z - bias > d ? 0. : 1.; }
  return sh/5.;
}
float shadow1(vec3 p){ vec4 s = sunMat*vec4(p, 1.); s.xyz /= s.w; if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1.) return 1.; return s.z - .002 > unpackRGBAToDepth(texture2D(sunMap, s.xy)) ? 0. : 1.; }
float band(float x){ return .12*smoothstep(.0, .06, x) + .38*smoothstep(.18, .26, x) + .5*smoothstep(.5, .58, x); }
vec3 pointL(vec3 P, vec3 N, vec3 A, vec3 L, float I, float dist, float decay){ vec3 d = L - P; float r = length(d); float att = pow(clamp(1. - r/dist, 0., 1.), decay); return A*band(max(dot(N, d/r), 0.))*I*att; }
vec3 aces(vec3 c){ c *= exposure/.6; mat3 a = mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777); mat3 b = mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602);
  c = a*c; vec3 x = c*(c + .0245786) - .000090537, y = c*(.983729*c + .4329510) + .238081; return clamp(b*(x/y), 0., 1.); }
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  vec4 col = texture2D(tCol, vUv); vec3 Vp = vpos(vUv), P = wpos(Vp), camP = wpos(vec3(0.));
  // light shafts: march from the eye to the surface (or the glass) through the sun's shadow map
  vec3 dir = normalize(P - camP); float len = min(length(P - camP), 14.); float acc = 0.;
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
  if (sunOn > 0. && shafts > 0.){ for (int i = 0; i < 24; i++){ float t = (float(i) + jit)/24.*len; acc += shadow1(camP + dir*t); } acc /= 24.; }
  float mu = dot(dir, -sunDir), g = .6, hg = (1. - g*g)/pow(1. + g*g - 2.*g*mu, 1.5)/12.566;
  vec3 scat = scatCol*acc*density*(.3 + 3.6*hg)*len*.12*sunOn;
  if (col.a < .5){ vec3 h = pow(aces(scat), vec3(1./2.2)); float l = dot(h, vec3(.3, .55, .15)); gl_FragColor = vec4(h/max(1e-3, l), clamp(l*1.1, 0., .85)); return; }
  vec3 A = toLin(col.rgb), N = normalize(mat3(camWorld)*(texture2D(tNrm, vUv).rgb*2. - 1.)); vec4 mt = texture2D(tMat, vUv);
  // ambient occlusion from the depth round each pixel
  vec2 st = texture2D(tStat, vUv).rg; float ao = st.r;   // (ambient occlusion and the outlines never change: worked out once, see STAT)
  // the lights
  float sh = sunOn > 0. ? min(shadowAt(sunMap, sunMat, P + N*.01, .0015, 1./2048.), shadowAt(sunDyn, sunMat, P + N*.01, .0015, 1./1024.)) : 0.;
  vec3 L = A*band(max(dot(N, -sunDir), 0.))*sunCol*sh;
  vec3 H = normalize(-sunDir - dir); L += sunCol*sh*pow(max(dot(N, H), 0.), mix(80., 6., mt.r))*(1. - mt.r)*.6*step(0., dot(N, -sunDir));
  vec3 toSky = skyPos - P; float rs = length(toSky); L += A*skyCol*max(dot(N, toSky/rs), 0.)*pow(clamp(1. - rs/10., 0., 1.), 1.4)*open;
  L += A*mix(hemiGround, hemiSky, .5*N.y + .5) + A*ambCol + A*band(max(dot(N, fillDir), 0.))*fillCol;
  L += pointL(P, N, A, b5Pos, .3, 3.5, 2.)*b5Col;
  if (lampsK > 0.){ for (int i = 0; i < 3; i++) L += pointL(P, N, A, pucks[i], .7*lampsK, 1.9, 2.)*puckCol;
    vec3 dd = P - downPos; float cs = dot(normalize(dd), vec3(0., -1., 0.)); L += pointL(P, N, A, downPos, 2.2*lampsK, 7., 1.6)*smoothstep(cos(.9), cos(.9*.2), cs)*downCol;
    float ls = shadowAt(lampMap, lampMat, P + N*.01, .003, 1./512.); L += pointL(P, N, A, pendPos, 1.6*lampsK, 3.2, 2.)*ls*pendCol; }
  L += pointL(P, N, A, barPos, .55*barOn, 1.6, 2.)*barCol;
  vec3 c = L*ao + toLin(texture2D(tBounce, vUv).rgb)*bounceK*ao + toLin(texture2D(tGlow, vUv).rgb)*1.4 + toLin(texture2D(tBar, vUv).rgb)*vec3(1., .82, .55)*1.6*barOn;
  // outlines: where the depth jumps
  c = c*(1. - st.g*.34) + scat;
  c = pow(aces(c), vec3(1./2.2));
  // the grade: the hour's highlight and shadow tints, a little more colour and contrast, a soft vignette
  float lm = dot(c, vec3(.3, .55, .15)); c *= mix(gradeLo, gradeHi, smoothstep(.06, .7, lm)); c = mix(vec3(lm), c, 1.15); c = (c - .42)*1.24 + .42;
  vec2 q = vUv - .5; c *= 1. - dot(q, q)*.85;
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`;
  // the parts that only depend on the baked surfaces, drawn once per view: occlusion (r) and the outlines (g)
  const STAT = `
varying vec2 vUv; uniform sampler2D tNrm, tDep; uniform vec2 projXY, res; uniform float far;
float dep(vec2 uv){ vec3 p = texture2D(tDep, uv).rgb; return dot(p, vec3(1., 1./255., 1./65025.))*far; }
vec3 vpos(vec2 uv){ float z = dep(uv); vec2 n = uv*2. - 1.; return vec3(n.x*z/projXY.x, n.y*z/projXY.y, -z); }
void main(){
  vec3 Vp = vpos(vUv), Nv = normalize(texture2D(tNrm, vUv).rgb*2. - 1.); float occ = 0.;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 12; i++){ float a = float(i)*2.39996 + float(j)*1.57, r = (float(i) + .25 + float(j)*.25)/12.; vec2 o = vec2(cos(a), sin(a))*r*18./res; vec3 q = vpos(vUv + o) - Vp; float d = length(q);
    occ += max(0., dot(Nv, q/max(d, 1e-4)) - .1)*smoothstep(.6, .05, d); }
  float ao = 1. - clamp(occ/48.*2.2, 0., .75);
  float e = 0., l0 = dep(vUv); for (int k = 0; k < 4; k++){ vec2 o = vec2(k == 0 ? 1. : k == 1 ? -1. : 0., k == 2 ? 1. : k == 3 ? -1. : 0.)/res; e = max(e, (dep(vUv + o) - l0)/l0); }
  gl_FragColor = vec4(ao, smoothstep(.05, .14, e), 0., 1.);
}`;
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  // bloom: the bright parts blurred small, added back with a warm halation fringe; then the pixel look
  const BRIGHT = 'varying vec2 vUv; uniform sampler2D t; void main(){ vec3 c = texture2D(t, vUv).rgb; gl_FragColor = vec4(max(c - .55, 0.)*2.2, 1.); }';
  const BLUR = 'varying vec2 vUv; uniform sampler2D t; uniform vec2 d; void main(){ vec3 c = vec3(0.); float w[5]; w[0] = .227; w[1] = .195; w[2] = .122; w[3] = .054; w[4] = .016; c += texture2D(t, vUv).rgb*w[0]; for (int i = 1; i < 5; i++){ c += texture2D(t, vUv + d*float(i)).rgb*w[i]; c += texture2D(t, vUv - d*float(i)).rgb*w[i]; } gl_FragColor = vec4(c, 1.); }';
  const FIN = `varying vec2 vUv; uniform sampler2D t, b; uniform vec2 res;
    float bay(vec2 p){ int x = int(mod(p.x, 4.)), y = int(mod(p.y, 4.)); int i = x + y*4; float v = 0.;
      if (i == 0) v = 0.; else if (i == 1) v = 8.; else if (i == 2) v = 2.; else if (i == 3) v = 10.; else if (i == 4) v = 12.; else if (i == 5) v = 4.; else if (i == 6) v = 14.; else if (i == 7) v = 6.;
      else if (i == 8) v = 3.; else if (i == 9) v = 11.; else if (i == 10) v = 1.; else if (i == 11) v = 9.; else if (i == 12) v = 15.; else if (i == 13) v = 7.; else if (i == 14) v = 13.; else v = 5.; return v/16. - .5; }
    void main(){ vec4 c = texture2D(t, vUv); vec3 bl = texture2D(b, vUv).rgb; vec3 o = c.rgb + bl*vec3(.16, .13, .1) + bl*vec3(.07, .025, 0.);
      o = floor(o*255./8. + .5 + bay(gl_FragCoord.xy))*8./255.; gl_FragColor = vec4(clamp(o, 0., 1.), c.a); }`;

  function create(canvas, scene, ROOM, base, meta){
    const r = new C.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false });
    { const gl = r.getContext(), src = gl.shaderSource.bind(gl); if (r.capabilities.isWebGL2) gl.shaderSource = (sh, t) => src(sh, t.replace('out highp vec4 pc_fragColor;', 'layout(location = 0) out highp vec4 pc_fragColor;\nlayout(location = 1) out highp vec4 pc_fragNormal;')); }
    r.setClearColor(0x000000, 0); r.autoClear = true;
    const mgr = new C.LoadingManager(), TL = new C.TextureLoader(mgr); mgr.onLoad = () => { api.loaded = true; }; const tex = (k, v, srgb) => { const t = TL.load(base + 'gb-' + k + '-' + v + '.png'); t.minFilter = t.magFilter = C.NearestFilter; t.generateMipmaps = false; return t; };
    const quad = new C.Mesh(new C.PlaneGeometry(2, 2)), qScene = new C.Scene(), qCam = new C.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false; qScene.add(quad);
    const U = { tCol: { value: null }, tNrm: { value: null }, tDep: { value: null }, tMat: { value: null }, tGlow: { value: null }, tBar: { value: null }, tBounce: { value: null }, tStat: { value: null }, sunDyn: { value: null }, sunMap: { value: null }, lampMap: { value: null },
      camWorld: { value: new C.Matrix4() }, sunMat: { value: new C.Matrix4() }, lampMat: { value: new C.Matrix4() }, projXY: { value: new C.Vector2() }, res: { value: new C.Vector2() },
      shafts: { value: 1 }, far: { value: 24 }, open: { value: 0 }, barOn: { value: 1 }, lampsK: { value: 0 }, density: { value: .3 }, exposure: { value: 1 }, bounceK: { value: .6 }, time: { value: 0 }, sunOn: { value: 1 },
      sunDir: { value: new C.Vector3(0, -1, 0) }, sunCol: { value: new C.Color() }, skyCol: { value: new C.Color() }, skyPos: { value: new C.Vector3() }, hemiSky: { value: new C.Color() }, hemiGround: { value: new C.Color() }, ambCol: { value: new C.Color() },
      fillDir: { value: new C.Vector3(0, 1, 0) }, fillCol: { value: new C.Color() }, gradeHi: { value: new C.Vector3(1, 1, 1) }, gradeLo: { value: new C.Vector3(1, 1, 1) }, scatCol: { value: new C.Color() },
      pucks: { value: [new C.Vector3(), new C.Vector3(), new C.Vector3()] }, downPos: { value: new C.Vector3() }, pendPos: { value: new C.Vector3() }, barPos: { value: new C.Vector3() }, b5Pos: { value: new C.Vector3() },
      puckCol: { value: new C.Color(0xffc888) }, downCol: { value: new C.Color(0xffc890) }, pendCol: { value: new C.Color(0xffb870) }, barCol: { value: new C.Color(0xffd296) }, b5Col: { value: new C.Color(0xffb070) } };
    const statU = { tNrm: U.tNrm, tDep: U.tDep, projXY: U.projXY, res: U.res, far: U.far };
    const stat = new C.ShaderMaterial({ vertexShader: VS, fragmentShader: STAT, uniforms: statU, depthTest: false, depthWrite: false }); let statRT = null, statDone = false;
    const light = new C.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: U, depthTest: false, depthWrite: false });
    const bright = new C.ShaderMaterial({ vertexShader: VS, fragmentShader: BRIGHT, uniforms: { t: { value: null } } }), blur = new C.ShaderMaterial({ vertexShader: VS, fragmentShader: BLUR, uniforms: { t: { value: null }, d: { value: new C.Vector2() } } });
    const fin = new C.ShaderMaterial({ vertexShader: VS, fragmentShader: FIN, uniforms: { t: { value: null }, b: { value: null }, res: { value: new C.Vector2() } }, transparent: true });
    // shadow maps: the room (layer 3), the plants and lamp (0) and the shutter (1), drawn from the sun and from the pendant's bulb
    const depthMat = new C.MeshDepthMaterial({ depthPacking: C.RGBADepthPacking, side: C.DoubleSide });
    // the sun's shadow in two: the room itself (big, still: redrawn only when the sun has moved a little) and the plants and the lamp (small, moving: every other frame)
    const sunRT = new C.WebGLRenderTarget(2048, 2048), dynRT = new C.WebGLRenderTarget(1024, 1024), lampRT = new C.WebGLRenderTarget(512, 512);
    const sunCam = new C.OrthographicCamera(-6, 6, 6, -6, .5, 30), lampCam = new C.PerspectiveCamera(150, 1, .05, 6);
    for (const c of [sunCam, lampCam]){ c.layers.enable(0); c.layers.enable(1); c.layers.enable(3); }
    const bias = new C.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
    const drawDepth = (cam, rt, mask) => { const m0 = cam.layers.mask; if (mask) cam.layers.mask = mask; const ov = scene.overrideMaterial, bg = scene.background; scene.overrideMaterial = depthMat; scene.background = null; r.setRenderTarget(rt); r.setClearColor(0xffffff, 1); r.clear(); r.render(scene, cam); r.setClearColor(0x000000, 0); r.setRenderTarget(null); scene.overrideMaterial = ov; scene.background = bg; cam.layers.mask = m0; };
    let main = null, bA = null, bB = null, view = null, cam = new C.PerspectiveCamera(), lastSun = null, frame = 0;
    let api = null; api = {
      ok: true, renderer: r, off: new Set(),   // (off: the profiler switching parts off: shafts, bloom, sunShadow, lampShadow)
      loaded: false,
      view(v){ view = v; const m = meta[v]; api.loaded = false; r.setPixelRatio(1); r.setSize(m.w, m.h, false);
        for (const [u, k, s] of [['tCol', 'color', 1], ['tNrm', 'normal', 0], ['tDep', 'depth', 0], ['tMat', 'mat', 0], ['tGlow', 'glow', 1], ['tBar', 'bar', 1], ['tBounce', 'bounce', 1]]) U[u].value = tex(k, v, s);
        cam.fov = m.cam.fov; cam.aspect = m.w/m.h; cam.near = .05; cam.far = 40; cam.position.set(...m.cam.pos); cam.lookAt(...m.cam.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        U.camWorld.value.copy(cam.matrixWorld); U.projXY.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]); U.res.value.set(m.w, m.h); U.far.value = m.depthFar || 24;
        for (const t of [main, bA, bB, statRT]) if (t) t.dispose(); statRT = new C.WebGLRenderTarget(m.w, m.h); statDone = false; main = new C.WebGLRenderTarget(m.w, m.h); bA = new C.WebGLRenderTarget(m.w >> 2, m.h >> 2); bB = new C.WebGLRenderTarget(m.w >> 2, m.h >> 2);
        fin.uniforms.res.value.set(m.w, m.h); lastSun = null; },
      // p: { sunDir (towards the room), sunCol, sunI, sky, skyI, hemi, amb, fill, density, lampsK, grade, open, barOn, bounceK, sunOn }
      draw(p){
        if (!view) return; frame++;
        U.sunDir.value.copy(p.sunDir); const wc = ROOM.winCenter();
        if (!statDone && api.loaded){ statDone = true; quad.material = stat; r.setRenderTarget(statRT); r.render(qScene, qCam); r.setRenderTarget(null); }
        U.tStat.value = statRT.texture;
        const moving = p.open < 1;   // (the shutter's plates are in the room's map: keep it fresh while they turn)
        U.shafts.value = api.off.has('shafts') ? 0 : 1;
        if ((p.sunOn > 0 || !lastSun) && !api.off.has('sunShadow')){
          if (!lastSun || lastSun.angleTo(p.sunDir) > .006 || (moving && frame % 4 === 0)){ lastSun = p.sunDir.clone();
            sunCam.position.copy(wc).addScaledVector(p.sunDir, -12); sunCam.lookAt(wc.clone().addScaledVector(p.sunDir, 2)); sunCam.updateMatrixWorld(); drawDepth(sunCam, sunRT, (1 << 1) | (1 << 3)); drawDepth(sunCam, dynRT, 1);
            U.sunMat.value.multiplyMatrices(bias, sunCam.projectionMatrix).multiply(sunCam.matrixWorldInverse); }
          else if (frame % 2 === 0) drawDepth(sunCam, dynRT, 1); }
        U.sunMap.value = sunRT.texture; U.sunDyn.value = dynRT.texture;
        const bulb = ROOM.bulbAt ? ROOM.bulbAt() : null;
        if (p.lampsK > 0 && bulb && !api.off.has('lampShadow')){ lampCam.position.copy(bulb).add(new C.Vector3(0, -.06, 0)); lampCam.lookAt(bulb.x, 0, bulb.z); lampCam.updateMatrixWorld(); if (frame % 3 === 0) drawDepth(lampCam, lampRT); U.lampMat.value.multiplyMatrices(bias, lampCam.projectionMatrix).multiply(lampCam.matrixWorldInverse); U.lampMap.value = lampRT.texture; U.pendPos.value.copy(bulb); }
        else U.lampMap.value = sunRT.texture;
        const L = ROOM.L;
        U.sunCol.value.set(p.sunCol).multiplyScalar(p.sunI); U.scatCol.value.set(p.sunCol); U.sunOn.value = p.sunOn;
        U.skyCol.value.set(p.sky).multiplyScalar(p.skyI*3); U.skyPos.value.copy(wc).addScaledVector(ROOM.winNormal(), .2);
        U.hemiSky.value.set(p.hemi[0]).multiplyScalar(p.hemi[2]); U.hemiGround.value.set(p.hemi[1]).multiplyScalar(p.hemi[2]); U.ambCol.value.setRGB(p.amb, p.amb, p.amb);
        U.fillDir.value.copy(L.fill.position).sub(L.fill.target.position).normalize(); U.fillCol.value.set(p.fill[0]).multiplyScalar(p.fill[1]);
        U.gradeHi.value.set(...p.grade[0]); U.gradeLo.value.set(...p.grade[1]); U.density.value = p.density; U.lampsK.value = p.lampsK; U.open.value = p.open; U.barOn.value = p.barOn; U.bounceK.value = p.bounceK;
        L.lamps.slice(0, 3).forEach(([l], i) => U.pucks.value[i].copy(l.position)); U.downPos.value.copy(L.lamps[3][0].position); if (ROOM.barLight) ROOM.barLight.getWorldPosition(U.barPos.value); U.b5Pos.value.copy(L.b5.position);
        quad.material = light; r.setRenderTarget(main); r.clear(); r.render(qScene, qCam);
        if (!api.off.has('bloom')){ quad.material = bright; bright.uniforms.t.value = main.texture; r.setRenderTarget(bA); r.render(qScene, qCam);
        quad.material = blur; for (let k = 0; k < 2; k++){ blur.uniforms.t.value = bA.texture; blur.uniforms.d.value.set(1.5/bA.width, 0); r.setRenderTarget(bB); r.render(qScene, qCam); blur.uniforms.t.value = bB.texture; blur.uniforms.d.value.set(0, 1.5/bA.height); r.setRenderTarget(bA); r.render(qScene, qCam); } }
        quad.material = fin; fin.uniforms.t.value = main.texture; fin.uniforms.b.value = bA.texture; r.setRenderTarget(null); r.clear(); r.render(qScene, qCam);
      }
    };
    return api;
  }
  return { create };
})();
