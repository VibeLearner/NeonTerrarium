// Walk mode: the renderer. One fixed orthographic camera (32 degrees down, turned 45), drawn at 720 lines and scaled
// up in whole pixels. Every surface gets a code-drawn texture by what it is made of, mapped by its position in the
// world (no texture coordinates needed), on the game's three-band toon shading. Night switches windows on one by one,
// neon and lanterns light the street, and rain wets the ground, which reflects the city. Whatever stands between the
// camera and the walker dissolves around them.
'use strict';
(async () => {
  const RES = [1280, 720], ZOOM = 2.3, PITCH = 32*Math.PI/180, YAW = Math.PI/4, GROUND = .04;
  const cv = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: /still=/.test(location.search) });
  renderer.setPixelRatio(1); renderer.setSize(RES[0], RES[1], false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.LinearEncoding;
  const status = document.getElementById('status'); const say = t => { if (status) status.textContent = t; };

  // ---- the block, as the game made it
  say('Loading the block');
  const meta = await fetch('block.json').then(r => r.json());
  const parts = await Promise.all([...Array(meta.chunks || 1).keys()].map(i => fetch('block_' + i + '.txt').then(r => r.text()).then(t => { const b = atob(t.trim()), u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return u; })));
  const bin = (() => { const n = parts.reduce((a, p) => a + p.length, 0), u = new Uint8Array(n); let o = 0; for (const p of parts){ u.set(p, o); o += p.length; } return u.buffer; })();

  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const cam = new THREE.OrthographicCamera(-ZOOM*16/9, ZOOM*16/9, ZOOM, -ZOOM, .1, 120);

  // ---- shared uniforms
  const camDirW = new THREE.Vector3(Math.sin(YAW)*Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW)*Math.cos(PITCH));
  const U = { uTime: { value: 0 }, uLights: { value: 0 }, uEmDay: { value: 0 }, uRain: { value: 0 }, uMirror: { value: 0 }, uGround: { value: GROUND },
    uPlayer: { value: new THREE.Vector3() }, uPlayerY: { value: 0 }, uFadeR: { value: .9 }, uRes: { value: new THREE.Vector2(RES[0], RES[1]) }, uRefl: { value: null },
    uGrime: { value: TEX.grime }, uPuddle: { value: TEX.puddle }, uPaving: { value: TEX.paving }, uAsphalt: { value: TEX.asphalt },
    uAsph: { value: 110/TEX.asphalt.userData.n }, uPav: { value: TEXEL/TEX.paving.userData.n }, uPx: { value: 2*ZOOM/RES[1] },
    uCamDir: { value: camDirW }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color(.6, .7, .9) }, uSunK: { value: 1 }, uPOM: { value: 1 } };

  // what each of the game's materials is made of: detail class, texture, parallax depth (world units), roughness, metal
  function classOf(m){
    const n = m.name;
    if (m.kind === 'window') return { k: CLS.interior, tex: 'glass', em: true, win: true, r: .15 };
    if (m.kind) return { k: CLS.glow, tex: 'glow', em: true, r: .3 };
    if (/^frame$|^metalDark$|^metal$|inPipe|^neon$|^mat(29\d|30[0-2]|28\d)$|slabSeam/.test(n)) return { k: CLS.metal, tex: 'metal', d: .004, r: .45, m: .55 };
    if (/shutter/.test(n)) return { k: CLS.shutter, tex: 'shutter', d: .008, r: .5, m: .5 };
    if (/corr/i.test(n)) return { k: CLS.corr, tex: 'corr', d: .014, r: .5, m: .45 };
    if (/^conc|slabSide/.test(n)) return { k: CLS.concrete, tex: 'concrete', ground: true, d: .012, r: .88 };
    if (/rust/i.test(n) && !/rustRed/.test(n)) return { k: CLS.rust, tex: 'rust', mix: .75, d: .008, r: .85, m: .2 };
    if (/brick/i.test(n)) return { k: CLS.brick, tex: 'brick', mix: .8, d: .014, r: .85 };
    if (/^pot$/.test(n)) return { k: CLS.organic, tex: 'organic', d: .004, r: .8 };
    if (/wood/i.test(n)) return { k: CLS.wood, tex: 'wood', mix: .55, d: .008, r: .75 };
    if (/crate/.test(n)) return { k: CLS.crate, tex: 'wood', mix: .4, d: .008, r: .78 };
    if (/card|paper/.test(n)) return { k: CLS.card, tex: 'card', mix: .5, d: .003, r: .9 };
    if (/glass|^window$|mat295/.test(n)) return { k: CLS.glass, tex: 'glass', r: .08 };
    if (/awn|cloth/.test(n)) return { k: CLS.canvas, tex: 'canvas', d: .003, r: .92 };
    if (/veg|grass/.test(n)) return { k: CLS.organic, tex: 'organic', d: .004, r: .6 };
    if (/hazard|white2/.test(n)) return { k: CLS.paint, tex: 'paint', ground: true, d: .006, r: .6 };
    if (/cream|white/.test(n)) return { k: CLS.cream, tex: 'plaster', grime: true, d: .006, r: .55 };
    return { k: CLS.plaster, tex: 'plaster', grime: true, d: .013, r: .9 };
  }

  // the surface pass: parallax occlusion through the height in the texture's alpha, the sun's shadow inside the
  // surface, and a normal from the height; then the per-object detail; then relief from that detail
  const SURFACE = `
    vec3 sN = normalize(vWNrm); vec3 sAn = abs(sN); vec3 sT, sB;
    if (sAn.y >= sAn.x && sAn.y >= sAn.z){ sT = vec3(1., 0., 0.); sB = sN.y > 0. ? vec3(0., 0., -1.) : vec3(0., 0., 1.); }
    else if (sAn.x >= sAn.z){ sT = sN.x > 0. ? vec3(0., 0., -1.) : vec3(0., 0., 1.); sB = vec3(0., 1., 0.); }
    else { sT = sN.z > 0. ? vec3(1., 0., 0.) : vec3(-1., 0., 0.); sB = vec3(0., 1., 0.); }
    bool sFlat = sAn.y > .85;
    bool sRoad = uGroundCls > .5 && sFlat && sN.y > 0. && vWPos.y < .2;
    float sSc = sRoad ? (vWPos.y < .06 ? uAsph : uPav) : uScale;
    float sDepth = uDepth*uPOM*(sRoad ? 1.2 : 1.0);
    vec2 sUV = vec2(dot(vWPos, sT), dot(vWPos, sB))*sSc;
    vec2 sGx = dFdx(sUV), sGy = dFdy(sUV);
    vec3 sTex = vec3(.5); float sH = 1.; float sShadow = 0.; float sProcH = 1.;
    #define SAMP(uv) (sRoad ? (vWPos.y < .06 ? textureGrad(uAsphalt, uv, sGx, sGy) : textureGrad(uPaving, uv, sGx, sGy)) : textureGrad(uTex, uv, sGx, sGy))
    if (uHasTex > .5 && uMirror < .5){
      if (sDepth > 0.){
        vec3 vt = vec3(dot(uCamDir, sT), dot(uCamDir, sB), dot(uCamDir, sN));
        float L = 40.; vec2 dUV = -vt.xy/max(vt.z, .2)*sDepth*sSc/L;
        float cur = 1.; vec2 uv = sUV; float h = SAMP(uv).a;
        for (int i = 0; i < 40; i++){ if (h >= cur) break; uv += dUV; cur -= 1./L; h = SAMP(uv).a; }
        vec2 pv = uv - dUV; float a1 = h - cur, b1 = SAMP(pv).a - (cur + 1./L); float w = clamp(a1/(a1 - b1 + 1e-5), 0., 1.); uv = mix(uv, pv, w); h = SAMP(uv).a;
        sUV = uv; sH = h;
        // the sun's shadow inside the surface
        vec3 lt = vec3(dot(uSunDir, sT), dot(uSunDir, sB), dot(uSunDir, sN));
        if (lt.z > .05){ vec2 sd = lt.xy/lt.z*sDepth*sSc/14.; float hh = h; vec2 q = uv; float occ = 0.;
          for (int i = 1; i <= 14; i++){ q += sd; hh += 1./14.*(1. - h)*1.2; float t = SAMP(q).a; occ = max(occ, (t - hh)*10.); }
          sShadow = clamp(occ, 0., 1.); }
        // the normal from the height around this point
        vec2 e = vec2(1./uTexN, 0.)*(sRoad ? 1.0 : 1.0);
        float hx = SAMP(sUV + e.xy).a - SAMP(sUV - e.xy).a, hy = SAMP(sUV + e.yx).a - SAMP(sUV - e.yx).a;
        float k = sDepth*sSc*uTexN*.5;
        vec3 nT = normalize(vec3(-hx*k, -hy*k, 1.));
        sN = normalize(sT*nT.x + sB*nT.y + sN*nT.z);
      }
      sTex = SAMP(sUV).rgb;
    }
  `;
  const RELIEF = `
    {
      vec3 Nv = normalize((viewMatrix*vec4(sN, 0.)).xyz);
      // relief from the per-object detail (grilles, planks, slats, seams), by its change across the pixel
      float dHx = dFdx(sProcH), dHy = dFdy(sProcH);
      vec3 vSx = dFdx(-vViewPosition), vSy = dFdy(-vViewPosition), R1 = cross(vSy, Nv), R2 = cross(Nv, vSx); float fDet = dot(vSx, R1);
      vec3 vGrad = sign(fDet)*(dHx*R1 + dHy*R2)*uPx*.9;
      normal = normalize(abs(fDet)*Nv - vGrad);
      if (dot(normal, vec3(0., 0., 1.)) < 0.) normal = Nv;
    }
  `;

  // the environment the shiny things reflect: a sky by day, a dark sky full of coloured city light by night
  const pmrem = new THREE.PMREMGenerator(renderer);
  function envFor(L){
    const s = new THREE.Scene(); const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
      uniforms: { a: { value: new THREE.Color(L.skyA).convertSRGBToLinear() }, b: { value: new THREE.Color(L.skyB).convertSRGBToLinear() }, g: { value: new THREE.Color(L.hemiG).convertSRGBToLinear() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 a, b, g; varying vec3 vP; void main(){ float y = normalize(vP).y; gl_FragColor = vec4(y > 0. ? mix(b, a, pow(y, .6)) : mix(b*.6, g*.5, -y), 1.); }' }));
    s.add(sky);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.sunC).multiplyScalar(L.night ? 2 : 25) }));
    sunDisc.position.set(...L.sun).normalize().multiplyScalar(40); s.add(sunDisc);
    if (L.night) for (let i = 0; i < 26; i++){ const c = [0xff4fa3, 0x38e8e0, 0xffb347, 0xffcf7a, 0xb070ff][i % 5]; const p = new THREE.Mesh(new THREE.PlaneGeometry(4 + Math.random()*6, 2 + Math.random()*4), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.5 + Math.random()*2), side: THREE.DoubleSide }));
      const a = Math.random()*Math.PI*2, y = -6 + Math.random()*18; p.position.set(Math.cos(a)*40, y, Math.sin(a)*40); p.lookAt(0, y, 0); s.add(p); }
    const crt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cc = new THREE.CubeCamera(.1, 100, crt); s.add(cc); cc.update(renderer, s);
    const rt = pmrem.fromCubemap(crt.texture); return rt.texture;
  }

  function mkMat(opts, kind, cls){
    cls = cls || { k: CLS.none, tex: kind === 'cloth' ? 'canvas' : null, d: kind === 'cloth' ? .003 : 0, r: kind === 'leaf' ? .55 : .85 };
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: cls.r != null ? cls.r : .8, metalness: cls.m || 0, envMapIntensity: 1 }, opts));
    m.userData.cls = cls; MATS.push(m);
    const tex = cls.tex ? TEX[cls.tex] : null;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U, { uTex: { value: tex || TEX.plaster }, uScale: { value: tex ? TEXEL/tex.userData.n : 1 }, uTexN: { value: tex ? tex.userData.n : 256 }, uCls: { value: cls.k || 0 },
        uMix: { value: cls.mix || 0 }, uHasTex: { value: tex ? 1 : 0 }, uGrimeOn: { value: cls.grime && !/nogrime/.test(location.search) ? 1 : 0 }, uGroundCls: { value: cls.ground ? 1 : 0 }, uEm: { value: cls.em ? 1 : 0 },
        uWin: { value: cls.win ? 1 : 0 }, uNoFade: { value: m.userData.noFade ? 1 : 0 }, uDepth: { value: cls.d || 0 }, uRough: { value: cls.r != null ? cls.r : .8 }, uMetal: { value: cls.m || 0 } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aOrd; attribute vec3 aLp; attribute vec3 aSz; attribute float aGt;\nvarying float vOrd; varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vView; varying vec3 vLp; varying vec3 vSz; varying float vGt;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 wp_ = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp_ = instanceMatrix * wp_;
          #endif
          wp_ = modelMatrix * wp_; vWPos = wp_.xyz; vView = (viewMatrix * wp_).xyz;
          vec3 on_ = objectNormal;
          #ifdef USE_INSTANCING
            on_ = mat3(instanceMatrix) * on_;
          #endif
          vWNrm = normalize(mat3(modelMatrix) * on_);
          vOrd = aOrd; vLp = aLp/16000.; vSz = aSz/1000.; vGt = aGt;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vOrd; varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vView; varying vec3 vLp; varying vec3 vSz; varying float vGt;
          uniform sampler2D uTex, uGrime, uPuddle, uPaving, uAsphalt, uRefl; uniform float uScale, uTexN, uMix, uHasTex, uGrimeOn, uGroundCls, uEm, uWin, uNoFade, uCls, uAsph, uPav, uPx, uDepth, uRough, uMetal, uSunK, uPOM;
          uniform float uTime, uLights, uEmDay, uRain, uMirror, uGround, uFadeR, uPlayerY; uniform vec3 uPlayer, uCamDir, uSunDir, uSunCol, uSky; uniform vec2 uRes;
          float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); float i = q.x + q.y*4.;
            if (i < .5) return .03; if (i < 1.5) return .53; if (i < 2.5) return .16; if (i < 3.5) return .66; if (i < 4.5) return .78; if (i < 5.5) return .28; if (i < 6.5) return .91; if (i < 7.5) return .41;
            if (i < 8.5) return .22; if (i < 9.5) return .72; if (i < 10.5) return .09; if (i < 11.5) return .59; if (i < 12.5) return .97; if (i < 13.5) return .47; if (i < 14.5) return .84; return .34; }
          vec2 planeUV(vec3 p, vec3 n){ vec3 a = abs(n); return a.y > a.x && a.y > a.z ? p.xz : (a.x > a.z ? vec2(p.z, p.y) : vec2(p.x, p.y)); }
          ${DETAIL_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uMirror > .5 && 2.0*uGround - vWPos.y < uGround + .02) discard;
          if (uNoFade < .5 && uMirror < .5){
            vec2 d = vView.xy - uPlayer.xy; float r = length(d*vec2(.8, 1.0));
            bool floorish = normalize(vWNrm).y > .6 && vWPos.y < uPlayerY + .55;   // (never the ground or a step he could stand on)
            if (!floorish && vWPos.y > uPlayerY + .06 && vView.z > uPlayer.z + .35 && r < uFadeR){ float th = smoothstep(uFadeR, uFadeR*.55, r)*.92; if (bayer4(gl_FragCoord.xy) < th) discard; } }`)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + (/dbg=2/.test(location.search) ? 'vec3 sN = normalize(vWNrm); bool sFlat = false; float sH = 1.; float sShadow = 0.; float sProcH = 1.; vec3 sTex = vec3(.5); bool sRoad = false;' : SURFACE + (/dbg=6/.test(location.search) ? 'diffuseColor.rgb = pow(sTex, vec3(2.2));' : /dbg=7/.test(location.search) ? 'diffuseColor.rgb = pow(diffuseColor.rgb*.8, vec3(2.2));' : /dbg=X/.test(location.search) ? DETAIL_MAIN.replace('// keep the colour', 'c = abs(c - cBase)*4.; // keep the colour') : /dbg=9/.test(location.search) ? DETAIL_MAIN.replace('else if (K == 1 || K == 2', 'else if (false && K == 1 || K == 2').replace('if (box){', 'if (box && false){') : /dbg=8/.test(location.search) ? DETAIL_MAIN.replace('// keep the colour', 'c = cBase; // keep the colour') : DETAIL_MAIN)) + `
          diffuseColor.rgb *= 1. - sShadow*.62*uSunK;
          float sWet = 0.;
          if (uRain > .01 && sN.y > .7 && vWPos.y < .2 && uMirror < .5) sWet = texture2D(uPuddle, vWPos.xz*.22).r*uRain;
          if (sWet > .001) sN = normalize(mix(sN, normalize(vWNrm), smoothstep(.0, .5, sWet)));   // water fills the pits: a puddle is flat`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(uRough + (1. - sH)*.15, .04, 1.);
          if (uRain > .01 && !sFlat) roughnessFactor *= mix(1., .8, uRain);
          if (uRain > .01 && sFlat) roughnessFactor = mix(roughnessFactor*.75, .2, sWet);
          // a bumpy normal inside one pixel can't hold a sharp highlight: widen it by how fast the normal turns across
          // the pixel, so point lights don't spark on single pixels and flicker as the camera moves
          { vec3 dnx = dFdx(sN), dny = dFdy(sN); float var = dot(dnx, dnx) + dot(dny, dny); roughnessFactor = max(roughnessFactor, clamp(sqrt(var)*2.5 + (sFlat ? .5 : .32)*(1. - sWet), 0., 1.)); }`)
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = uMetal*(sH > .6 ? 1. : .5);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (/dbg=1/.test(location.search) ? '' : RELIEF))
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (uEm > .5){
            if (uWin > .5){
              float on = step(vOrd/255., uLights);
              vec3 em3 = vec3(1.);
              if (vGt > .5 && vGt < 1.5){
                Face F = faceOf(vLp, vSz);
                vec3 N = normalize(vWNrm), B = abs(N.y) > .9 ? vec3(0., 0., 1.) : vec3(0., 1., 0.), T = normalize(cross(B, N));
                vec3 vt = vec3(dot(uCamDir, T), dot(uCamDir, B), dot(uCamDir, N));
                float lk; float sd = h31(floor(vWPos*2.7) + vSz*13.);
                vec3 rc = room(F.w, F.dim, vt, sd, lk);
                float fr = .014; bool frame = F.ed < fr || (F.dim.x > .3 && abs(F.w.x - F.dim.x*.5) < fr*.5);
                if (frame){ em3 = vec3(0.); diffuseColor.rgb = vec3(.03); }
                else { em3 = pow(rc*lk, vec3(2.2)); diffuseColor.rgb = mix(pow(rc*.16, vec3(2.2)), vec3(.02), on); }
              }
              totalEmissiveRadiance = em3*on*1.6*mix(vec3(1.), emissive/max(max(emissive.r, emissive.g), max(emissive.b, .01)), .35);
            } else {
              float on = max(uLights, uEmDay);
              totalEmissiveRadiance *= on*(.85 + .25*texture2D(uTex, planeUV(vWPos, normalize(vWNrm))*uScale).r)*1.8;
            }
          }`)
        .replace('#include <tonemapping_fragment>', (/dbg=4/.test(location.search) ? 'gl_FragColor.rgb = diffuseColor.rgb + vec3(.0);' : '') + (/dbg=5/.test(location.search) ? 'gl_FragColor.rgb = vec3(vGt/3., fract(vSz.x*4.), fract(vSz.z*4.));' : '') + `
          if (sWet > .001){
            // the reflection, softened (rain on the water) and only where the ground is the mirror's own level
            vec2 rq = gl_FragCoord.xy/uRes, rp = 1.6/uRes;
            vec3 rf = (texture2D(uRefl, rq).rgb*2. + texture2D(uRefl, rq + vec2(rp.x, 0.)).rgb + texture2D(uRefl, rq - vec2(rp.x, 0.)).rgb
              + texture2D(uRefl, rq + vec2(0., rp.y)).rgb + texture2D(uRefl, rq - vec2(0., rp.y)).rgb)/6.;
            rf *= 1. - smoothstep(.015, .04, abs(vWPos.y - uGround));
            float shim = .85 + .15*texture2D(uPuddle, vWPos.xz*1.7 + vec2(uTime*.05, -uTime*.03)).r;
            gl_FragColor.rgb = mix(gl_FragColor.rgb*.55, gl_FragColor.rgb*.25 + rf*.95*shim, sWet*.9) + rf*.08*uRain;
          } else if (uRain > .01 && sFlat && vWPos.y < .2 && uMirror < .5) gl_FragColor.rgb *= .65;
          #include <tonemapping_fragment>`);
    };
    m.customProgramCacheKey = () => 'k' + (cls.k || 0) + (cls.tex || 'none') + (cls.win ? 'w' : '') + (m.userData.noFade ? 'n' : '') + (cls.em ? 'e' : '') + (cls.ground ? 'g' : '');
    return m;
  }
  const MATS = [];

  // ---- decode the geometry (the data comes in several files)
  say('Building the materials');
  let o = 0;
  const bounds = new THREE.Box3();
  const triList = [];   // for the walking grid
  for (const md of meta.mats){
    const nv = md.nv, ni = md.ni;
    const q16 = new Uint16Array(bin, o, nv*3); o += nv*6; o = (o + 3) & ~3;
    const pos = new Float32Array(nv*3); for (let q = 0; q < nv*3; q++){ const a = q % 3; pos[q] = meta.qlo[a] + q16[q]/65535*meta.qspan[a]; }
    const nrm = new Int8Array(bin, o, nv*3); o += nv*3;
    const ord = new Uint8Array(bin, o, nv); o += nv;
    o = (o + 3) & ~3;
    let idx; if (md.i16){ idx = new Uint16Array(bin, o, ni); o += ni*2; o = (o + 3) & ~3; } else { idx = new Uint32Array(bin, o, ni); o += ni*4; }
    const lp = new Int16Array(bin, o, nv*3); o += nv*6;
    const sz = new Uint16Array(bin, o, nv*3); o += nv*6;
    const gt = new Uint8Array(bin, o, nv); o += nv;
    o = (o + 3) & ~3;
    if (md.type !== 'MeshToonMaterial') continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    g.setAttribute('aOrd', new THREE.BufferAttribute(new Float32Array(ord), 1));
    g.setAttribute('aLp', new THREE.BufferAttribute(new Float32Array(lp), 3)); g.setAttribute('aSz', new THREE.BufferAttribute(new Float32Array(sz), 3)); g.setAttribute('aGt', new THREE.BufferAttribute(new Float32Array(gt), 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); bounds.union(g.boundingBox);
    const cls = classOf(md);
    const __hl = (location.search.match(/hl=([^&]+)/)||[])[1]; const mat = mkMat({ color: new THREE.Color(__hl && __hl.split(',').includes(md.name) ? '#ff0000' : md.color), emissive: md.em ? new THREE.Color(md.em).convertSRGBToLinear() : new THREE.Color(0) }, null, cls);
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = !cls.win; mesh.receiveShadow = true;
    world.add(mesh); triList.push([pos, idx]);
  }

  // ---- plants, laundry, signs
  say('Growing the plants');
  PLANTS.build(meta);
  // plants must touch something: mark every 10 cm cell that holds a surface, then drop leaves, stems and flowers
  // with no surface within 30 cm (vines the game drew as flat sprites down the platform's edge hang in the air in 3D)
  { const r = .1, x0 = bounds.min.x - .5, y0 = bounds.min.y - .5, z0 = bounds.min.z - .5;
    const nx = Math.ceil((bounds.max.x - x0 + .5)/r), ny = Math.ceil((bounds.max.y - y0 + .5)/r), nz = Math.ceil((bounds.max.z - z0 + .5)/r);
    const occ = new Uint8Array(nx*ny*nz), mark = (x, y, z) => { const i = Math.floor((x - x0)/r), j = Math.floor((y - y0)/r), k = Math.floor((z - z0)/r); if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) occ[(j*nz + k)*nx + i] = 1; };
    for (const [pos, idx] of triList) for (let t = 0; t < idx.length; t += 3){
      const a = idx[t]*3, b = idx[t + 1]*3, c = idx[t + 2]*3;
      const L = Math.max(Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]), Math.hypot(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]), Math.hypot(pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]));
      const n = Math.min(400, Math.ceil(L/.07));
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++){ const fu = u/n || 0, fv = v/n || 0, fw = 1 - fu - fv;
        mark(pos[a]*fw + pos[b]*fu + pos[c]*fv, pos[a + 1]*fw + pos[b + 1]*fu + pos[c + 1]*fv, pos[a + 2]*fw + pos[b + 2]*fu + pos[c + 2]*fv); } }
    const near = (x, y, z) => { const i = Math.floor((x - x0)/r), j = Math.floor((y - y0)/r), k = Math.floor((z - z0)/r);
      for (let dj = -3; dj <= 3; dj++) for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++){ const I = i + di, J = j + dj, K = k + dk;
        if (I >= 0 && J >= 0 && K >= 0 && I < nx && J < ny && K < nz && occ[(J*nz + K)*nx + I]) return true; } return false; };
    PLANTS.prune(near); }
  world.add(PLANTS.meshes(mkMat));

  // ---- glows (sprites, added light) and the lights that reach the street at night
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const GCOL = { pink: 0xFF4FA3, cyan: 0x38E8E0, amber: 0xFFB347, warm: 0xFFCF7A, blue: 0x5ab8ff, red: 0xff2a2a, orange: 0xff6a14, green: 0x4aff7a };
  const gp = [], gc = [], gs = [], lightsWanted = [];
  for (const k in meta.glows){ const a = meta.glows[k], col = new THREE.Color(GCOL[k] || 0xffcf7a);
    for (let q = 0; q < a.length; q += 4){ gp.push(a[q], a[q + 1], a[q + 2]); { const lc = col.clone().convertSRGBToLinear().multiplyScalar(1.6); gc.push(lc.r, lc.g, lc.b); } gs.push(a[q + 3]); if (a[q + 1] < 3.2) lightsWanted.push({ x: a[q], y: a[q + 1], z: a[q + 2], col, s: a[q + 3] }); } }
  const glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); glowGeo.setAttribute('size', new THREE.Float32BufferAttribute(gs, 1));
  const glowMat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: glowTex }, uOn: { value: 0 }, uMirror: U.uMirror, uGround: U.uGround },
    vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float uOn; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 36.0*size*uOn; }',
    fragmentShader: 'uniform sampler2D uTex; varying vec3 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC*t.a*.9, 1.); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = new THREE.Points(glowGeo, glowMat); world.add(glows);
  // the strongest few near the ground become real lights (spread out, so the street is lit in many places)
  lightsWanted.sort((a, b) => b.s - a.s);
  const picked = []; for (const L of lightsWanted){ if (picked.length >= 22) break; if (picked.every(p => Math.hypot(p.x - L.x, p.z - L.z) > .7)) picked.push(L); }
  const pointLights = picked.map(L => { const pl = new THREE.PointLight(L.col.clone().convertSRGBToLinear(), 0, 2.8, 2); pl.position.set(L.x, L.y, L.z); world.add(pl); return pl; });

  // ---- sky light, sun and its shadows
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4038, .5); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, .15); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.0); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 2;
  const ctr = bounds.getCenter(new THREE.Vector3());
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 80 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  sun.target.position.copy(ctr); scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x8fa8ff, .25); fill.position.copy(ctr).add(new THREE.Vector3(.7, .35, -.8).multiplyScalar(30)); fill.target.position.copy(ctr); scene.add(fill, fill.target);

  // ---- the walker: a small blocky person with a walk cycle
  const walker = new THREE.Group(); world.add(walker);
  const wmat = c => { const m = mkMat({ color: new THREE.Color(c) }, 'cloth', { tex: 'canvas', s: 96 }); m.userData.noFade = true; return m; };
  const part = (w, h, d, c, x, y, z, parent = walker) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wmat(c)); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  const hipL = new THREE.Group(), hipR = new THREE.Group(), shL = new THREE.Group(), shR = new THREE.Group();
  hipL.position.set(-.035, .2, 0); hipR.position.set(.035, .2, 0); shL.position.set(-.075, .4, 0); shR.position.set(.075, .4, 0); walker.add(hipL, hipR, shL, shR);
  part(.05, .2, .06, '#2a3550', 0, -.1, 0, hipL); part(.05, .2, .06, '#2a3550', 0, -.1, 0, hipR); part(.055, .035, .085, '#1a1a1a', 0, -.19, .012, hipL); part(.055, .035, .085, '#1a1a1a', 0, -.19, .012, hipR);
  part(.13, .2, .08, '#2f8f8a', 0, .31, 0); part(.135, .04, .085, '#d98b3a', 0, .215, 0);
  part(.04, .17, .05, '#2f8f8a', 0, -.07, 0, shL); part(.04, .17, .05, '#2f8f8a', 0, -.07, 0, shR); part(.035, .035, .04, '#e0b088', 0, -.16, 0, shL); part(.035, .035, .04, '#e0b088', 0, -.16, 0, shR);
  part(.09, .09, .09, '#e0b088', 0, .47, 0); part(.1, .045, .1, '#ff4fa3', 0, .52, -.005); part(.1, .05, .03, '#ff4fa3', 0, .485, -.04);
  part(.1, .12, .05, '#6b4a2a', 0, .32, -.065);   // the backpack

  // ---- where you can walk: the ground under each spot, and what stands in the way
  say('Mapping the streets');
  const G = { r: .06, x0: bounds.min.x - .5, z0: bounds.min.z - .5 }; G.nx = Math.ceil((bounds.max.x - G.x0 + .5)/G.r); G.nz = Math.ceil((bounds.max.z - G.z0 + .5)/G.r);
  const ground = new Float32Array(G.nx*G.nz).fill(-99), block = new Uint8Array(G.nx*G.nz);
  for (const [pos, idx] of triList){
    for (let t = 0; t < idx.length; t += 3){
      const a = idx[t]*3, b = idx[t + 1]*3, c = idx[t + 2]*3;
      const y0 = Math.min(pos[a + 1], pos[b + 1], pos[c + 1]), y1 = Math.max(pos[a + 1], pos[b + 1], pos[c + 1]);
      if (y0 > 1.3) continue;
      const xa = Math.min(pos[a], pos[b], pos[c]), xb = Math.max(pos[a], pos[b], pos[c]), za = Math.min(pos[a + 2], pos[b + 2], pos[c + 2]), zb = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
      const i0 = Math.max(0, Math.floor((xa - G.x0)/G.r)), i1 = Math.min(G.nx - 1, Math.floor((xb - G.x0)/G.r)), j0 = Math.max(0, Math.floor((za - G.z0)/G.r)), j1 = Math.min(G.nz - 1, Math.floor((zb - G.z0)/G.r));
      const flat = y1 - y0 < .01;
      if (flat && y1 < .2){ for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (y1 > ground[j*G.nx + i]) ground[j*G.nx + i] = y1; }
      else if (y1 > .2 && y0 < 1.1 && (xb - xa)*(zb - za) < 4){ for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j*G.nx + i] = 1; }
    }
  }
  const cellAt = (x, z) => { const i = Math.floor((x - G.x0)/G.r), j = Math.floor((z - G.z0)/G.r); return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? -1 : j*G.nx + i; };
  const free = (x, z) => { for (const [dx, dz] of [[0, 0], [.07, 0], [-.07, 0], [0, .07], [0, -.07]]){ const k = cellAt(x + dx, z + dz); if (k < 0 || block[k] || ground[k] < -1) return false; } return true; };
  // start on the street in front of the block, at the nearest free spot
  const P = new THREE.Vector3((meta.cells[0].x + meta.cells[3].x)/2, 0, (meta.cells[0].z + meta.cells[3].z)/2 + 1.4);
  { let best = null, bd = 1e9; for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++){ const x = G.x0 + (i + .5)*G.r, z = G.z0 + (j + .5)*G.r; if (!free(x, z)) continue; const d = Math.hypot(x - P.x, z - P.z); if (d < bd){ bd = d; best = [x, z]; } } if (best){ P.x = best[0]; P.z = best[1]; } }

  // ---- steam from the grates
  const steam = []; for (let q = 0; q < (meta.steam || []).length; q += 3) steam.push(new THREE.Vector3(meta.steam[q], meta.steam[q + 1], meta.steam[q + 2]));
  const puffN = steam.length*14, puffGeo = new THREE.BufferGeometry(), puffPos = new Float32Array(puffN*3), puffA = new Float32Array(puffN), puffT = new Float32Array(puffN).map(() => Math.random()*3);
  puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPos, 3)); puffGeo.setAttribute('a', new THREE.BufferAttribute(puffA, 1));
  const puffs = new THREE.Points(puffGeo, new THREE.ShaderMaterial({ uniforms: { uTex: { value: glowTex }, uC: { value: new THREE.Color(0xdfe6f0) } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 18.0 + 30.0*(1.0 - a); }',
    fragmentShader: 'uniform sampler2D uTex; uniform vec3 uC; varying float vA; void main(){ float t = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(uC, t*vA*.35); }' }));
  world.add(puffs);

  // ---- render targets and the final pass: outlines, bloom, rain, grade, sky
  const mkRT = depth => { const rt = new THREE.WebGLRenderTarget(RES[0], RES[1], { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType }); if (depth){ rt.depthTexture = new THREE.DepthTexture(RES[0], RES[1]); rt.depthTexture.type = THREE.UnsignedIntType; } return rt; };
  const rtMain = mkRT(true), rtRefl = mkRT(true); U.uRefl.value = rtRefl.texture;
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  const post = new THREE.ShaderMaterial({
    uniforms: { tC: { value: rtMain.texture }, tD: { value: rtMain.depthTexture }, uRes: U.uRes, uTime: U.uTime, uRain: U.uRain, uSkyA: { value: new THREE.Color() }, uSkyB: { value: new THREE.Color() },
      uGrade: { value: new THREE.Vector3(1, 1, 1) }, uLine: { value: new THREE.Color(0x141420) }, uBloom: { value: .6 }, uNight: { value: 0 }, uHaze: { value: new THREE.Color() }, uExpo: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D tC, tD; uniform vec2 uRes; uniform float uTime, uRain, uBloom, uNight, uExpo; uniform vec3 uSkyA, uSkyB, uGrade, uLine, uHaze; varying vec2 vU;
      float D(vec2 o){ return texture2D(tD, vU + o/uRes).r; }
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
      vec3 bright(vec2 uv){ vec3 s = texture2D(tC, uv).rgb*uExpo; return max(s - .9, 0.); }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0., 1.); }
      void main(){
        float d = D(vec2(0));
        vec3 c;
        if (d >= .9999){                                                       // the sky (already in screen colours), soft pixel clouds by day
          vec2 p = floor(vU*uRes/3.0); float cl = 0.0;
          for (int k = 0; k < 3; k++){ float s = pow(2.0, float(k)); cl += h(floor(p/(24.0/s)) + float(k)*7.0)*(.5/s); }
          c = mix(uSkyB, uSkyA, vU.y) + vec3(smoothstep(.62, .9, cl))*(1.0 - uNight)*.25;
        } else {
          c = texture2D(tC, vU).rgb;
          // ambient occlusion from the depth around this pixel: corners, under ledges, behind clutter
          float ao = 0.;
          for (int i = 0; i < 16; i++){ float a = float(i)*2.39996 + h(vU*uRes)*6.28; float r = 1.5 + float(i)*1.1;
            float dd = D(vec2(cos(a), sin(a))*r) - d; ao += clamp(-dd*420., 0., 1.)*(1. - clamp(-dd*55., 0., 1.)); }
          ao /= 16.; c *= 1. - ao*.62;
          c = mix(c, uHaze, clamp((d - .45)*1.6, 0., 1.)*(.1 + uNight*.18));
          // bloom in three sizes
          vec3 b1 = vec3(0), b2 = vec3(0), b3 = vec3(0);
          for (int i = 0; i < 12; i++){ float a = float(i)*.5236; vec2 o = vec2(cos(a), sin(a));
            b1 += bright(vU + o*2.5/uRes); b2 += bright(vU + o*8.0/uRes) + bright(vU + o*15.0/uRes); b3 += bright(vU + o*30.0/uRes) + bright(vU + o*48.0/uRes); }
          c = c*uExpo + (b1*.045 + b2*.03 + b3*.02)*uBloom*2. + bright(vU)*uBloom*.25;
          c = pow(aces(c), vec3(1./2.2));                                      // filmic tone, then to screen colours
          // light outlines: depth steps and creases
          float l = D(vec2(-1,0)), r = D(vec2(1,0)), u = D(vec2(0,1)), b = D(vec2(0,-1));
          float sil = max(max(l - d, r - d), max(u - d, b - d)), crease = abs(l + r - 2.0*d) + abs(u + b - 2.0*d);
          float edge = max(step(.0016, sil), step(.0011, crease)*.4);
          c = mix(c, uLine, edge*.35);
        }
        c *= uGrade;
        float lum = dot(c, vec3(.299, .587, .114)); c = mix(c, c*vec3(.9, .94, 1.1), (1. - smoothstep(.0, .4, lum))*.3); c = mix(c, c*vec3(1.06, 1.02, .93), smoothstep(.55, 1.0, lum)*.25);
        if (uRain > .01){ vec2 q = vU*uRes; q.x += q.y*.18; float col = floor(q.x/3.0); float ph = h(vec2(col, 1.0)); float y = fract((q.y/uRes.y)*6.0 + uTime*(2.4 + ph) + ph*7.0);
          float streak = step(.975, h(vec2(col, floor((q.y/uRes.y)*6.0 + uTime*(2.4 + ph) + ph*7.0)))) * smoothstep(.0, .25, y)*(1.0 - y); c = mix(c, vec3(.75, .8, 1.0), streak*.25*uRain); }
        vec2 v = vU - .5; c *= 1.0 - dot(v, v)*.3; c += (h(vU*uRes + uTime) - .5)*.018;
        gl_FragColor = vec4(c, 1.0);
      }`, depthTest: false, depthWrite: false });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  // ---- times of day
  const LOOKS = {
    day:   { sun: [-.62, .78, .55], sunC: 0xfff1d6, sunI: 2.9, hemiS: 0xbfd4ff, hemiG: 0x5a4a3a, hemiI: .75, amb: .04, env: .75, lights: 0, emDay: .15, glow: .3, pl: 0, skyA: 0x7fb2e8, skyB: 0xe8d8e0, grade: [1.02, 1.0, .97], bloom: .3, night: 0, haze: 0xc8d4e8, sky: 0x9cc4f0, fillI: .35, expo: 1.0, sunK: 1 },
    dusk:  { sun: [-.85, .3, .3], sunC: 0xffa060, sunI: 2.4, hemiS: 0x8a7ab0, hemiG: 0x3a2a30, hemiI: .5, amb: .03, env: .7, lights: .55, emDay: .6, glow: .6, pl: 3.5, skyA: 0x4a4a8a, skyB: 0xff9a70, grade: [1.04, .97, .96], bloom: .5, night: .5, haze: 0xb07aa0, sky: 0xf0a080, fillI: .3, expo: 1.15, sunK: .8 },
    night: { sun: [-.4, .85, .3], sunC: 0x8a9ad8, sunI: .4, hemiS: 0x4a3a7a, hemiG: 0x16121e, hemiI: .3, amb: .02, env: 1.0, lights: 1, emDay: 1, glow: .55, pl: 2.6, skyA: 0x140f2a, skyB: 0x3a1a4a, grade: [.98, .97, 1.06], bloom: .32, night: 1, haze: 0x3a2050, sky: 0x4a3a7a, fillI: .12, expo: 1.05, sunK: .25 },
  };
  const ENV = {}; for (const k in LOOKS) ENV[k] = envFor(LOOKS[k]);
  let look = 'night', rain = true;
  function applyLook(){
    const L = LOOKS[look];
    sun.position.copy(ctr).add(new THREE.Vector3(...L.sun).multiplyScalar(30)); sun.color.set(L.sunC).convertSRGBToLinear(); sun.intensity = L.sunI;
    hemi.color.set(L.hemiS).convertSRGBToLinear(); hemi.groundColor.set(L.hemiG).convertSRGBToLinear(); hemi.intensity = L.hemiI; amb.intensity = L.amb;
    if (!/dbg=3/.test(location.search)) for (const m of MATS){ const had = !!m.envMap; m.envMap = ENV[look]; m.envMapIntensity = L.env; if (!had) m.needsUpdate = true; }
    U.uSunK.value = L.sunK; post.uniforms.uExpo.value = L.expo;
    U.uLights.value = L.lights; U.uEmDay.value = L.emDay; glowMat.uniforms.uOn.value = L.glow;
    pointLights.forEach(pl => pl.intensity = L.pl);
    post.uniforms.uSkyA.value.set(L.skyA); post.uniforms.uSkyB.value.set(L.skyB); post.uniforms.uGrade.value.set(...L.grade); post.uniforms.uBloom.value = L.bloom; post.uniforms.uNight.value = L.night;
    U.uRain.value = rain ? 1 : 0;
    U.uSunDir.value.set(...L.sun).normalize(); U.uSunCol.value.set(L.sunC).multiplyScalar(L.sunI); U.uSky.value.set(L.sky); post.uniforms.uHaze.value.set(L.haze).convertSRGBToLinear(); fill.intensity = L.fillI;
    document.querySelectorAll('[data-look]').forEach(b => b.setAttribute('aria-pressed', b.dataset.look === look));
    document.getElementById('rainBtn').setAttribute('aria-pressed', rain);
  }
  document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => { look = b.dataset.look; applyLook(); }));
  document.getElementById('rainBtn').addEventListener('click', () => { rain = !rain; applyLook(); });
  try { const q = new URLSearchParams(location.search); if (q.get('look')) look = q.get('look'); if (q.get('rain') === '0') rain = false; } catch (e) {}
  applyLook();

  // ---- input: screen-relative walking
  const keys = new Set();
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){ keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  // touch / click: hold to walk toward the pointer
  let ptr = null; cv.addEventListener('pointerdown', e => { ptr = e; cv.setPointerCapture(e.pointerId); }); cv.addEventListener('pointermove', e => { if (ptr) ptr = e; }); cv.addEventListener('pointerup', () => ptr = null); cv.addEventListener('pointercancel', () => ptr = null);
  const FW = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW)), RT = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));

  // ---- the frame
  let last = performance.now(), phase = 0, face = Math.PI + YAW, moving = 0;
  const camDir = new THREE.Vector3(Math.sin(YAW)*Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW)*Math.cos(PITCH));
  const _v = new THREE.Vector3();
  let STILL = 0; try { STILL = +(new URLSearchParams(location.search).get('still') || 0); } catch (e) {}
  let nFrames = 0;
  function frame(now){
    if (!STILL || nFrames < STILL) requestAnimationFrame(frame);
    nFrames++;
    const dt = Math.min(.05, (now - last)/1000); last = now; U.uTime.value = now/1000;
    // walking
    let fx = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    let rx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    if (ptr){ const r = cv.getBoundingClientRect(); const px = (ptr.clientX - r.left)/r.width - .5, py = (ptr.clientY - r.top)/r.height - .5; const sx = px*2*ZOOM*16/9, sy = -py*2*ZOOM; const ls = Math.hypot(sx, sy); if (ls > .15){ rx = sx/ls; fx = sy/ls; } }
    if (fx || rx){
      const sp = (keys.has('shift') ? 2.1 : 1.15)*dt, l = Math.hypot(fx, rx);
      _v.copy(FW).multiplyScalar(fx/l).addScaledVector(RT, rx/l);
      const nx = P.x + _v.x*sp, nz = P.z + _v.z*sp;
      if (free(nx, nz)){ P.x = nx; P.z = nz; } else if (free(nx, P.z)) P.x = nx; else if (free(P.x, nz)) P.z = nz;
      const want = Math.atan2(_v.x, _v.z); let dA = want - face; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); face += dA*Math.min(1, dt*14);
      phase += dt*(keys.has('shift') ? 13 : 9); moving = Math.min(1, moving + dt*6);
    } else moving = Math.max(0, moving - dt*6);
    const gk = cellAt(P.x, P.z), gy = gk >= 0 && ground[gk] > -1 ? ground[gk] : 0;
    P.y += (gy - P.y)*Math.min(1, dt*18);
    walker.position.set(P.x, P.y + Math.abs(Math.sin(phase))*.012*moving, P.z); walker.rotation.y = face;
    const sw = Math.sin(phase)*.6*moving; hipL.rotation.x = sw; hipR.rotation.x = -sw; shL.rotation.x = -sw*.8; shR.rotation.x = sw*.8;
    // camera: follows, moving in whole render pixels so nothing crawls
    const tgt = _v.set(P.x, P.y + .45, P.z).addScaledVector(FW, .9);
    const right = RT, up = new THREE.Vector3().crossVectors(camDir, right).normalize().negate();
    const px = 2*ZOOM/RES[1], a = Math.round(tgt.dot(right)/px)*px, b = Math.round(tgt.dot(up)/px)*px, cdist = tgt.dot(camDir);
    const snapped = new THREE.Vector3().addScaledVector(right, a).addScaledVector(up, b).addScaledVector(camDir, cdist);
    cam.position.copy(snapped).addScaledVector(camDir, 60); cam.lookAt(snapped); cam.updateMatrixWorld();
    const pv = new THREE.Vector3(P.x, P.y + .3, P.z).applyMatrix4(cam.matrixWorldInverse); U.uPlayer.value.copy(pv); U.uPlayerY.value = P.y;
    // steam
    for (let s = 0; s < steam.length; s++) for (let k = 0; k < 14; k++){ const i = s*14 + k; puffT[i] += dt; if (puffT[i] > 3) puffT[i] -= 3; const t = puffT[i]/3; puffPos[i*3] = steam[s].x + Math.sin(i*1.7 + t*3)*.06*t; puffPos[i*3 + 1] = steam[s].y + t*.9; puffPos[i*3 + 2] = steam[s].z + Math.cos(i*2.3)*.05*t; puffA[i] = Math.sin(t*Math.PI); }
    puffGeo.attributes.position.needsUpdate = true; puffGeo.attributes.a.needsUpdate = true;
    // the reflection (rain only): the world mirrored in the ground plane, drawn from the same camera
    if (U.uRain.value > .01 && !/norefl/.test(location.search)){
      world.scale.y = -1; world.position.y = 2*GROUND; U.uMirror.value = 1; U.uRefl.value = blank; glows.visible = puffs.visible = false;
      renderer.setRenderTarget(rtRefl); renderer.setClearColor(new THREE.Color(LOOKS[look].skyB).multiplyScalar(.5)); renderer.clear(); renderer.shadowMap.autoUpdate = false; renderer.render(scene, cam);
      world.scale.y = 1; world.position.y = 0; U.uMirror.value = 0; U.uRefl.value = rtRefl.texture; glows.visible = puffs.visible = true; renderer.shadowMap.autoUpdate = true;
    }
    renderer.setRenderTarget(rtMain); renderer.setClearColor(0x000000); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    if (!window.__ready && (!STILL || nFrames >= STILL)){ window.__ready = true; say(''); }
  }
  requestAnimationFrame(frame);
  window.WALK = { P, counts: PLANTS.counts, setLook: l => { look = l; applyLook(); }, setRain: r => { rain = r; applyLook(); } };
})().catch(e => { const s = document.getElementById('status'); if (s) s.textContent = 'Could not start: ' + e.message; console.error(e); });
