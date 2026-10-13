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
    hzNear: { value: 30 }, hzFar: { value: 60 }, hzMax: { value: .82 }, hazeC: { value: new THREE.Color(0xbfe4e3) }, nightK: { value: 0 }, darkK: { value: 0 } };   // (nightK: the lamps; darkK: full night only)
  const BEND = `{ vec4 wq = modelMatrix * vec4(transformed, 1.0); float gq = dot(wq.xz - ctr, fwd); vG = gq; float gp = max(gq - g0, 0.0); transformed.y -= curveK*gp*gp; vWq = wq.xyz; }`;
  // cliff faces are painted per pixel by height (crisp strata, a dark wet splash zone, a weed line at the water), not by
  // their few vertices: a face is any steep, not green, surface of the land
  const ROCKY = `
    uniform float nightK;
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
      if (st < 0.55 && vWq.y > -0.4){ diffuseColor.rgb = rockAt(vWq)*(1.0 - 0.4*nightK); rockFace = true; }
      else if (st < 0.8 && green) diffuseColor.rgb = vec3(0.243, 0.420, 0.180);   // (the grass's lip, darker where it rolls over the edge)
      else if (st < 0.8 && vWq.y > -0.4){ diffuseColor.rgb = rockAt(vWq)*(1.0 - 0.4*nightK); rockFace = true; } }`;
  // (a cliff face takes its shade from which way it faces, not from cast shadows: on its narrow upright facets the shadow map
  // drew stepped bands)
  const ROCKY_LIGHTS = THREE.ShaderChunk.lights_fragment_begin.replace('directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap', 'directLight.visible, receiveShadow && !rockFace ) ) ? getShadow( directionalShadowMap');
  // night: what glows. A block's lamps, lit windows and greenhouse glass carry a glow (0..1, per vertex; see Tris); by night
  // it turns them warm amber, the glass a gold-green, as in the solarpunk boards (a teal, rainy dusk, every window warm)
  const GLOW_V = 'attribute float glow; varying float vGlow;\n';
  const GLOW_F = 'varying float vGlow;\n';
  const GLOW_APPLY = `if (vGlow > 0.0){ vec3 amber = vec3(1.0, 0.5, 0.2), lampY = vec3(1.0, 0.87, 0.47);
      float lamp = step(0.85, vGlow), sh = 0.74 + 0.26*abs(normalize(vNormal).x);
      vec3 gc = lamp > 0.5 ? lampY*1.04 : vGlow > 0.6 ? lampY*0.95*sh : mix(amber, vColor*vec3(0.9, 0.75, 0.45), 0.18)*sh;   // (.7: a tower's glass rooms, lit like windows)   // (windows and lamps: warm yellow; the glass up top: orange, still shaded by its facets)
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gc, nightK*(lamp > 0.5 ? 1.0 : 0.85)); }`;
  // a new home painted in, in watercolor: the wash rises up it from the ground with a ragged, bleeding edge (darker where the
  // pigment pools at the wash's rim), pale and watery behind the edge, then the color deepens to full as it dries
  const PAINT_F = `uniform float pRise, pDry, pB, pH;
    float ph21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    float pvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(ph21(i), ph21(i + vec2(1.0, 0.0)), f.x), mix(ph21(i + vec2(0.0, 1.0)), ph21(i + vec2(1.0, 1.0)), f.x), f.y); }\n`;
  const PAINT_APPLY = `{ float L = pB - 0.7 + (pH + 1.3)*pRise;
      float n = pvn(vWq.xz*2.1 + vWq.y*1.3)*0.6 + pvn(vWq.xz*5.3 - vWq.y*2.7)*0.3 + pvn(vWq.zx*11.0 + vWq.y*5.0)*0.1;
      float e = L + (n - 0.5)*1.1 - vWq.y;
      if (e < 0.0) discard;
      vec3 paper = vec3(0.98, 0.96, 0.91), base = diffuseColor.rgb;
      float wash = 1.0 - pDry, wet = 1.0 - smoothstep(0.0, 0.8, e);
      vec3 pale = mix(base, paper, 0.55) + (ph21(floor(gl_FragCoord.xy)) - 0.5)*0.06;   // (pale, with a little granulation)
      diffuseColor.rgb = mix(base, pale, clamp(wash*0.85 + wet*0.6, 0.0, 1.0));
      diffuseColor.rgb *= 1.0 - 0.3*(1.0 - smoothstep(0.0, 0.08, e))*step(pRise, 0.999); }`;
  // Light in watercolor: shade is a glaze laid over the paper, not a cut-out. The sun's shadow is read a few texels off along
  // a world-fixed noise, so its edge wanders like a brushed wash; where shade meets light the pigment pools in a darker
  // rim; and in the shade the color goes a little cool and granulates (the paper's tooth). (Directional light only.)
  const WC_F = `float wcS = 1.0, wcE = 0.0;
    float wch(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    float wcn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(wch(i), wch(i + vec2(1.0, 0.0)), f.x), mix(wch(i + vec2(0.0, 1.0)), wch(i + vec2(1.0, 1.0)), f.x), f.y); }\n`;
  const WC_SHADOW = `#include <shadowmap_pars_fragment>
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
    // (the wander is measured in world units and kept on the surface being lit, then projected into the shadow map: so it
    // stays put as the view turns, pans or zooms, and a wall never reads its own shadow from a spot off itself)
    float wcAt(sampler2D sm, vec2 size, float bias, mat4 M, vec3 p){ vec4 sc = M*vec4(p, 1.0); return getShadow(sm, size, bias, 1.0, sc); }
    float wcShadow(sampler2D sm, vec2 size, float bias, float nBias, mat4 M, vec3 nV){
      vec3 nW = normalize((vec4(nV, 0.0)*viewMatrix).xyz), w = vWq;
      vec2 q = w.xz + w.y*0.3;
      vec3 o = vec3(wcn(q*1.3) - 0.5, wcn(q*1.3 + 9.1) - 0.5, wcn(q*1.3 + 17.3) - 0.5)*0.34 + vec3(wcn(q*4.7 + 3.1) - 0.5, wcn(q*4.7 + 5.5) - 0.5, wcn(q*4.7 - 8.2) - 0.5)*0.12;
      o -= nW*dot(o, nW);
      vec3 ta = normalize(abs(nW.y) < 0.9 ? cross(nW, vec3(0.0, 1.0, 0.0)) : cross(nW, vec3(1.0, 0.0, 0.0))), tb = cross(nW, ta);
      vec3 base = w + nW*nBias + o;
      float s0 = wcAt(sm, size, bias, M, base);
      float sn = 0.25*(wcAt(sm, size, bias, M, base + ta*0.17) + wcAt(sm, size, bias, M, base - ta*0.17) + wcAt(sm, size, bias, M, base + tb*0.17) + wcAt(sm, size, bias, M, base - tb*0.17));
      wcS = min(wcS, s0); wcE = max(wcE, (1.0 - s0)*sn);
      return s0; }
    #endif`;
  const WC_APPLY = `{ float sh = 1.0 - wcS, gr = wcn(vWq.xz*5.3 + vWq.y*3.7)*0.6 + wcn(vWq.xz*11.0 - vWq.y*7.0)*0.4;
      gl_FragColor.rgb *= 1.0 - 0.2*wcE;                                                        // (the rim of the wash)
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb*vec3(0.88, 0.94, 1.1), sh*0.75*(1.0 - nightK));   // (a cool glaze)
      gl_FragColor.rgb *= 1.0 - sh*0.09*gr; }`;                                                 // (granulating in the shade)
  const WC_LIGHTS = c => c.replace('getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
    'wcShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowNormalBias, directionalShadowMatrix[ i ], geometry.normal )');
  // foliage in the wind: each vertex knows how far up its blade it is (aH, in units); it's pushed downwind by the square of
  // that, by a steady lean, by gusts that roll across the field in long waves, and by a quick flutter of its own; and it
  // dips a little as it bends, so the blade keeps its length. (The sway is applied before the bend: the mesh is in world units)
  const SWAY_V = 'attribute float aH; uniform float wTime;\n';
  const SWAY = `{ vec2 wd = vec2(0.83, 0.55), q = (modelMatrix*vec4(transformed, 1.0)).xz; float ph = dot(q, wd)*0.32 - wTime*1.25;
      float gust = 0.5 + 0.5*sin(ph) + 0.22*sin(ph*2.3 + q.x*0.7 - q.y*0.4);
      float flut = sin(wTime*4.1 + q.x*3.1 + q.y*2.3) + 0.5*sin(wTime*6.3 + q.x*5.0 - q.y*4.1);
      float k = aH*aH;
      vec2 d = wd*(0.08 + 0.3*gust*gust)*k + vec2(-wd.y, wd.x)*flut*0.035*k;
      transformed.xz += d; transformed.y -= dot(d, d)*0.55/max(aH, 0.05); }`;
  // bend any built-in material the same way (and haze it toward the horizon, unless it's only drawn into the shadow map)
  function bent(mat, haze = true, rocky = false, glow = false, paint = null, sway = null){
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CURV); if (paint) Object.assign(sh.uniforms, paint); if (sway) Object.assign(sh.uniforms, sway);
      sh.vertexShader = 'uniform vec2 ctr, fwd; uniform float curveK, g0; varying float vG; varying vec3 vWq;\n' + (glow ? GLOW_V : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BEND + (glow ? '\n vGlow = glow;' : ''));
      if (sway){ sh.vertexShader = SWAY_V + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY);
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '')); }
      if (glow) sh.fragmentShader = GLOW_F + sh.fragmentShader.replace('#include <fog_fragment>', GLOW_APPLY + '\n#include <fog_fragment>');
      if (paint) sh.fragmentShader = PAINT_F + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + PAINT_APPLY);
      if (haze) sh.fragmentShader = 'uniform float hzNear, hzFar, hzMax; uniform vec3 hazeC; varying float vG; varying vec3 vWq;\n' + (rocky ? 'bool rockFace;\n' + ROCKY + '\n' : '') + (rocky ? '' : 'uniform float nightK;\n') + WC_F + sh.fragmentShader
        .replace('#include <fog_fragment>', WC_APPLY + '\n#include <fog_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeC, smoothstep(hzNear, hzFar, vG)*hzMax);')
        .replace('#include <shadowmap_pars_fragment>', WC_SHADOW)
        .replace('#include <color_fragment>', rocky ? ROCKY_APPLY : '#include <color_fragment>').replace('#include <lights_fragment_begin>', WC_LIGHTS(rocky ? ROCKY_LIGHTS : THREE.ShaderChunk.lights_fragment_begin));
    };
    mat.customProgramCacheKey = () => 'bent' + (haze ? 1 : 0) + (rocky ? 'r' : '') + (glow ? 'g' : '') + (paint ? 'p' : '') + (sway ? 's' : '');
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
  const pieceM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true }), true, false, true);   // (pieces: walls stay their own color)
  const landDepth = bent(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false);

  // a growing list of flat-shaded, colored triangles; props are merged into it
  // (what glows by night is known by its color: GLOW maps a palette color to how it glows; dark window glass is lit in about
  // half the windows, picked by the window's position, so a window never flips when other homes or links are built)
  const GLOW = new Map(), LEAFC = new Set();
  class Tris {
    constructor(fol = false){ this.p = []; this.c = []; this.gl = null; this.k = 0; this.fol = fol ? [] : null; }
    glowRun(n0, col){ let v = GLOW.get(col); if (v === undefined) return;
      if (v < 0){ const P = this.p, n1 = this.p.length/3; let x = 0, y = 0, z = 0; for (let i = n0; i < n1; i++){ x += P[i*3]; y += P[i*3 + 1]; z += P[i*3 + 2]; } const k = n1 - n0;
        v = hash2(Math.round(x/k*8)*73856093 ^ Math.round(z/k*8)*19349663, Math.round(y/k*8)) < -v ? .9 : 0; }   // (lit or not by where the window is: the same window stays lit whatever else is built)
      if (v) (this.gl || (this.gl = [])).push(n0, this.p.length/3 - n0, v); }
    add(geo, m, col){
      // (on a home or a link, a leafy blob isn't drawn as a blob: it's noted, where it is and its size and shape, and grown
      // as real foliage instead; see folGeo)
      if (this.fol && LEAFC.has(col) && (geo === GEO.ico || geo === GEO.cone8)){ const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        this.fol.push([geo === GEO.cone8 ? 3 : sy > sx*1.5 ? 2 : sx > .38 ? 1 : 0, e[12], e[13], e[14], sx, sy, sz]); return; }
      const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const a = g.attributes.position.array, n0 = this.p.length/3;
      for (let i = 0; i < a.length; i += 3){ this.p.push(a[i], a[i + 1], a[i + 2]); this.c.push(col.r, col.g, col.b); } g.dispose(); this.glowRun(n0, col); }
    quad(a, b, c, d, col){ const n0 = this.p.length/3; for (const v of [a, b, c, a, c, d]){ this.p.push(v[0], v[1], v[2]); this.c.push(col.r, col.g, col.b); } this.glowRun(n0, col); }
    geo(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals();
      if (this.gl){ const a = new Float32Array(this.p.length/3); for (let i = 0; i < this.gl.length; i += 3) a.fill(this.gl[i + 2], this.gl[i], this.gl[i] + this.gl[i + 1]); g.setAttribute('glow', new THREE.BufferAttribute(a, 1)); }
      return g; }
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
    // (no bushes: the land is left open for homes and painted foliage)
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
      uniform float time, pxW; uniform sampler2D depthTex, dudvTex, causTex, reflTex, foamTex; uniform vec3 foamBox; uniform vec2 resPx; uniform vec4 box; uniform vec3 sunDir; uniform vec2 camXZ; uniform vec3 tint, glint, hazeC; uniform float hzNear, hzFar, hzMax, glintK, nightK;
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
          col += c * (1.0 - smoothstep(0.0, 4.5, d + dith*0.4)) * vec3(0.2, 0.18, 0.11) * (1.0 - nightK);
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
        col += nightK*rf.a*max(rf.rgb - vec3(0.45), 0.0)*vec3(0.9, 0.75, 0.55);   // (by night: the warm windows, mirrored and rippled)
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
    // night (past 19:00, full by 21:00): a high moon instead of the sun, cool and dim; a deep teal sky and haze; the sea gone
    // ink blue with pale moon glitter; and every lamp, lit window and greenhouse warm (nightK). A little of the glow comes on
    // at golden hour already, as the first lights do
    const n = smooth(19, 21, h); CURV.nightK.value = Math.max(n, .25*smooth(17.8, 18.8, h)); CURV.darkK.value = n;
    if (poolMesh) poolMesh.visible = n > .01;
    if (n > 0){
      const mz = new THREE.Vector3(-.35, .86, -.38).normalize(); sunDir.lerp(mz, n).normalize();
      sun.color.lerp(new THREE.Color(.72, .76, .9), n); sun.intensity = lerp(sun.intensity, .3, n);   // (a warmer night: the moon less blue, the shade a warm teal)
      hemi.color.lerp(new THREE.Color(.46, .52, .54), n); hemi.groundColor.setRGB(lerp(.42, .14, n), lerp(.48, .11, n), lerp(.29, .09, n)); hemi.intensity = lerp(hemi.intensity, .32, n);
      amb.color.setRGB(lerp(.81, .36, n), lerp(.9, .36, n), lerp(.94, .38, n));
      SKY.top.lerp(new THREE.Color(.06, .05, .1), n); SKY.mid.lerp(new THREE.Color(.11, .1, .16), n); SKY.low.lerp(new THREE.Color(.2, .19, .22), n);
      CURV.hazeC.value.copy(SKY.low);
      seaU.tint.value.lerp(new THREE.Color(.38, .42, .52), n); seaU.glint.value.lerp(new THREE.Color(.78, .88, 1.0), n); seaU.glintK.value = lerp(seaU.glintK.value, .5, n);
      seaU.sunDir.value.copy(sunDir);
    } else { hemi.groundColor.setRGB(.42, .48, .29); amb.color.setRGB(.81, .9, .94); }
    reflM.color.setRGB(lerp(1, .26, n), lerp(1, .36, n), lerp(1, .46, n));
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
  // By night the warm lights bleed, as wet paint does: what glows (warm and bright) is taken out, spread out
  // (two blurs), and laid back over the picture as a wash: its edge ragged against the paper's grain (fixed to the screen,
  // as paper is), a touch more pigment where it gives out. Its grain is read per pixel of the picture, so it stays pixel art.
  let glA = null, glB = null;
  const quad = new THREE.PlaneGeometry(2, 2), postScene = new THREE.Scene(), postQ = new THREE.Mesh(quad); postScene.add(postQ);
  const postV = 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const extractM = new THREE.ShaderMaterial({ uniforms: { src: { value: null } }, vertexShader: postV, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D src; varying vec2 vU;
      void main(){ vec3 c = texture2D(src, vU).rgb; float m = smoothstep(0.18, 0.42, c.r - c.b)*smoothstep(0.45, 0.8, c.r); gl_FragColor = vec4(c*m, 1.0); }` });
  const blurM = new THREE.ShaderMaterial({ uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: postV, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D src; uniform vec2 dir; varying vec2 vU;
      void main(){ vec3 c = vec3(0.0); float wt = 0.0;
        for (int i = -6; i <= 6; i++){ float f = float(i), w = exp(-f*f/18.0); c += texture2D(src, vU + dir*f*3.2).rgb*w; wt += w; }
        gl_FragColor = vec4(c/wt, 1.0); }` });
  const blit = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, glow: { value: null }, nightK: CURV.darkK, res: { value: new THREE.Vector2(480, 270) }, pOff: { value: new THREE.Vector2() } },
    vertexShader: postV, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tex, glow; uniform float nightK; uniform vec2 res, pOff; varying vec2 vU;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ vec3 c = texture2D(tex, vU).rgb;
        if (nightK > 0.01){
          vec2 px = floor(vU*res) + 0.5, q = px/res;                     // (one picture pixel at a time)
          vec3 g = texture2D(glow, q).rgb; float gl = dot(g, vec3(0.4, 0.4, 0.2));
          vec2 pp = floor(px - pOff); float paper = vn(pp*0.11)*0.55 + vn(pp*0.31 + 9.0)*0.3 + h21(pp)*0.15;   // (the grain moves with the ground as the view pans)
          float wash = smoothstep(0.02, 0.09, gl + (paper - 0.5)*0.05);
          float rim = wash*(1.0 - smoothstep(0.02, 0.1, gl - 0.04 + (paper - 0.5)*0.05));
          vec3 tint = normalize(g + 1e-4)*vec3(1.0, 0.92, 0.8);
          c += (g*1.6*(0.8 + 0.4*paper) + tint*0.08*wash + tint*0.1*rim)*nightK;
        }
        gl_FragColor = vec4(c, 1.0); }` }));
  const blitScene = new THREE.Scene(); blitScene.add(blit);
  const _po = new THREE.Vector3();
  function glowPass(){
    if (CURV.darkK.value <= .01) return;
    _po.set(0, 0, 0).project(cam); blit.material.uniforms.pOff.value.set(Math.round((_po.x + 1)/2*W), Math.round((_po.y + 1)/2*H));
    postQ.material = extractM; extractM.uniforms.src.value = rt.texture; renderer.setRenderTarget(glA); renderer.render(postScene, skyCam);
    postQ.material = blurM; blurM.uniforms.src.value = glA.texture; blurM.uniforms.dir.value.set(1/glA.width, 0); renderer.setRenderTarget(glB); renderer.render(postScene, skyCam);
    blurM.uniforms.src.value = glB.texture; blurM.uniforms.dir.value.set(0, 1/glA.height); renderer.setRenderTarget(glA); renderer.render(postScene, skyCam); }
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
    for (const g of [glA, glB]) if (g) g.dispose();
    glA = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); glB = glA.clone();   // (full size: at half size each one-pixel pan picked different pixels, and the glow shimmered)
    blit.material.uniforms.tex.value = rt.texture; blit.material.uniforms.glow.value = glA.texture; blit.material.uniforms.res.value.set(W, H);
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
  for (const c of HP.leaf) LEAFC.add(c);
  GLOW.set(HP.lamp, 1).set(HP.glass, .45).set(HP.glass2, .45).set(HP.glassT, .7).set(HP.glassD, -.5);   // (glassD: half the dark windows lit)
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
  // ---- outlines (seen from above): convex hulls, placed in the world, tested against each other ----
  function hull2(P){ if (P.length < 3) return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
    P = P.map(q => [Math.round(q[0]*200)/200, Math.round(q[1]*200)/200]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]), lo = [], up = [];
    for (const q of P){ while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = P.length - 1; i >= 0; i--){ const q = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); }
  // a local outline turned by rot and moved to (x, z) (as the mesh's rotation.y turns it)
  const placeHull = (H, x, z, rot) => { const c = Math.cos(rot), s_ = Math.sin(rot); return H.map(([u, v]) => [x + u*c + v*s_, z - u*s_ + v*c]); };
  // do two outlines overlap by more than a touch (separating axes)
  function hullsHit(A, B, tol = .1){
    for (const P of [A, B]) for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length], nx = b[1] - a[1], nz = a[0] - b[0], l = Math.hypot(nx, nz) || 1;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const q of A){ const d = (q[0]*nx + q[1]*nz)/l; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const q of B){ const d = (q[0]*nx + q[1]*nz)/l; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 - tol <= b0 || b1 - tol <= a0) return false; }
    return true; }
  const inHull = (P, x, z) => { let sg = 0; for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length], c = (b[0] - a[0])*(z - a[1]) - (b[1] - a[1])*(x - a[0]); if (c > 1e-9) sg |= 1; else if (c < -1e-9) sg |= 2; if (sg === 3) return false; } return true; };
  // how far from (cx, cz) along (dx, dz) the outline's edge is
  function hullExit(P, cx, cz, dx, dz){ let t = 0;
    for (let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx*ez - dz*ex; if (Math.abs(den) < 1e-9) continue;
      const tt = ((a[0] - cx)*ez - (a[1] - cz)*ex)/den, u = ((a[0] - cx)*dz - (a[1] - cz)*dx)/den; if (u >= -1e-6 && u <= 1 + 1e-6 && tt > t) t = tt; }
    return t; }
  // the farthest the outline (local) reaches along a local direction
  const hullReach = (H, ux, uz) => H.reduce((m, q) => Math.max(m, q[0]*ux + q[1]*uz), 0);
  // is anything already there: a placed block whose height range meets [y0, y1] and whose outline meets this one
  function blocked(W, y0, y1, skip){
    for (const q of PIECES){ if (skip && skip.includes(q)) continue; if (q.y > y1 - .05 || q.y + q.h < y0 + .05) continue; if (hullsHit(W, q.hullW)) return q; }
    return null; }
  // is the point (x, z) at height y inside a block (but not those in skip)
  const solidAt = (x, z, y0, y1, skip) => PIECES.some(q => !(skip && skip.includes(q)) && q.y < y1 && q.y + q.h > y0 && inHull(q.hullW, x, z));
  /* ---------- foliage parts: blades, flowers, fern fronds, seed heads (the grass brush and the homes' plants both use them) ---------- */
  const gU = { wTime: { value: 0 } };
  const grassM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true, side: THREE.DoubleSide }), true, false, false, null, gU);
  // (a sage, blue-leaning green, set apart from the meadow's yellow-green and kin to the homes' teal; warm ochre and cream at the tips)
  const GG = { greenA: [.37, .57, .38], greenB: [.29, .49, .38], greenC: [.5, .65, .42], dry: [.74, .66, .42], tip: [.92, .91, .7], fern: [.27, .49, .38], reed: [.76, .66, .44], head: [.88, .74, .5] };
  const FLOWERS = [[.95, .55, .42], [.96, .74, .76], [.72, .63, .88], [.99, .86, .46], [.97, .95, .9], [.93, .45, .52]];
  // a little indexed-mesh builder: positions, normals (mostly up, so a blade is lit like the meadow, whichever side shows),
  // colors, and aH
  class GB { constructor(){ this.P = []; this.N = []; this.C = []; this.H = []; this.I = []; }
    v(x, y, z, nx, ny, nz, c, h){ this.P.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; this.N.push(nx/l, ny/l, nz/l); this.C.push(c[0], c[1], c[2]); this.H.push(h); return this.P.length/3 - 1; }
    tri(a, b, c){ this.I.push(a, b, c); }
    mesh(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(this.H, 1)); g.setIndex(this.I); return g; } }
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];
  const mul3 = (a, k, cool = 0) => [a[0]*k*(1 - cool*.2), a[1]*k, a[2]*k*(1 + cool*.25)];
  // one blade: from its root up a gentle curve, leaning one way, tapering to a point; nSeg segments
  function blade(G, x, y, z, ang, len, w, lean, base, tip, nSeg = 3){
    const dx = Math.cos(ang), dz = Math.sin(ang), sx = -dz, sz = dx, nx = dx*.35, nz = dz*.35;
    let prev = null;
    for (let k = 0; k <= nSeg; k++){ const t = k/nSeg, ht = len*t, out = lean*len*Math.pow(t, 1.7), px = x + dx*out, pz = z + dz*out, py = y + ht*(1 - .18*lean*t), ww = w*Math.pow(1 - t, .8)*.5;
      const c = k === 0 ? mul3(base, .62, 1) : mix3(base, tip, Math.pow(t, 1.3)*.85);
      if (k === nSeg){ const tI = G.v(px, py, pz, nx, 1, nz, c, ht); if (prev) G.tri(prev[0], prev[1], tI); }
      else { const a = G.v(px - sx*ww, py, pz - sz*ww, nx, 1, nz, c, ht), b = G.v(px + sx*ww, py, pz + sz*ww, nx, 1, nz, c, ht); if (prev){ G.tri(prev[0], prev[1], b); G.tri(prev[0], b, a); } prev = [a, b]; } }
    return [x + dx*lean*len, y + len*(1 - .18*lean), z + dz*lean*len]; }
  // a flower head: five petals round a heart, facing up and a little out
  function flower(G, x, y, z, r, col, h){
    const heart = [.96, .8, .32], c0 = G.v(x, y + r*.15, z, 0, 1, 0, heart, h), n = 5, a0 = hash2(Math.round(x*97), Math.round(z*89))*6.28;
    for (let k = 0; k < n; k++){ const a = a0 + k/n*6.28, a1 = a - .5, a2 = a + .5;
      const p1 = G.v(x + Math.cos(a1)*r*.55, y + r*.05, z + Math.sin(a1)*r*.55, 0, 1, 0, col, h), p2 = G.v(x + Math.cos(a)*r, y - r*.1, z + Math.sin(a)*r, 0, 1, 0, mul3(col, .92), h), p3 = G.v(x + Math.cos(a2)*r*.55, y + r*.05, z + Math.sin(a2)*r*.55, 0, 1, 0, col, h);
      G.tri(c0, p1, p2); G.tri(c0, p2, p3); } }
  // a fern frond: an arching midrib with leaflets paired along it, smaller toward the tip
  function frond(G, x, y, z, ang, len, col){
    const dx = Math.cos(ang), dz = Math.sin(ang), sx = -dz, sz = dx, N = 7;
    const at = t => { const out = len*.85*Math.sin(t*1.45), up = len*.62*Math.sin(t*2.4)*(1 - .25*t); return [x + dx*out, y + Math.max(up, len*.05*(1 - t)), z + dz*out]; };
    blade(G, x, y, z, ang, len*.62, .04, 1.25, mul3(col, .8), col, 4);
    for (let k = 1; k <= N; k++){ const t = k/(N + 1), [px, py, pz] = at(t), L = len*.32*(1 - t*.75), c = mix3(col, GG.tip, t*.3);
      for (const sd of [-1, 1]){ const ex = px + (sx*sd*.9 + dx*.35)*L, ez = pz + (sz*sd*.9 + dz*.35)*L, ey = py - L*.22;
        const r0 = G.v(px, py, pz, 0, 1, 0, mul3(c, .85), py - y), r1 = G.v(px + dx*L*.28, py + .01, pz + dz*L*.28, 0, 1, 0, c, py - y), e = G.v(ex, ey, ez, 0, 1, 0, c, py - y + L*.4);
        G.tri(r0, r1, e); } } }
  // a seed head on a reed: a slim spindle
  function seedHead(G, x, y, z, len, col, h){ const w = len*.16, a = G.v(x, y, z, 0, 1, 0, col, h), b = G.v(x + w, y + len*.45, z, 0, 1, 0, col, h + len*.45), c = G.v(x - w*.6, y + len*.5, z + w*.6, 0, 1, 0, col, h + len*.5), d = G.v(x, y + len, z, 0, 1, 0, mul3(col, 1.08), h + len);
    G.tri(a, b, d); G.tri(a, d, c); }
  // the foliage grown where the leafy blobs were: 0 a mound of blades (now and then with a few flowers) for the plants in
  // pots and planters and along pergolas; 1 a fountain of arching fern fronds for the little trees' crowns (a tree fern);
  // 2 trailing vines with small leaves, hanging down, for the long thin blobs; 3 tall ornamental grass with seed heads for
  // the cypresses
  const VINE = [[.3, .55, .36], [.36, .6, .34], [.26, .5, .38]];
  function folGeo(fol){
    if (!fol || !fol.length) return null; const G = new GB();
    for (const [k, x, y, z, sx, sy, sz] of fol){ const R = rng((Math.imul(Math.round(x*97), 73856093) ^ Math.imul(Math.round(z*89), 19349663) ^ Math.imul(Math.round(y*71), 83492791)) >>> 0);
      const base = mix3(R.chance(.5) ? GG.greenA : GG.greenC, GG.greenB, R.r(.3, .7)), tip = mix3(GG.tip, base, .55);   // (a shade deeper than the meadow's: plants against pale walls)
      if (k === 0 && R.chance(.3)){ const y0 = y - sy*.5, n = R.i(6, 9), a0 = R.r(0, 6.28), fc = mix3(GG.fern, base, .5);   // (a little fern, spilling over)
        for (let i = 0; i < n; i++) frond(G, x, y0, z, a0 + i/n*6.28 + R.r(-.25, .25), (.22 + sy*1.2)*R.r(.85, 1.15), fc); }
      else if (k === 0){ const y0 = y - sy*.55, n = Math.max(18, Math.round(450*sx*sz)), L = .2 + sy*1.3;   // (a mound of blades, the outer ones arching over and down past the rim)
        for (let i = 0; i < n; i++){ const a = R.r(0, 6.28), rr = R.r(0, sx*.7), out = rr/(sx*.7); blade(G, x + Math.cos(a)*rr, y0, z + Math.sin(a)*rr, a, L*R.r(.65, 1.2), R.r(.06, .095), .3 + out*1.1 + R.r(0, .3), base, tip, 3); }
        if (R.chance(.35)){ const fc = R.pick(FLOWERS); for (let i = 0, m = R.i(1, 3); i < m; i++){ const a = R.r(0, 6.28), rr = R.r(0, sx*.4), top = blade(G, x + Math.cos(a)*rr, y0, z + Math.sin(a)*rr, a, L*1.15, .03, .25, base, base, 2); flower(G, top[0], top[1], top[2], .06, fc, top[1] - y0); } } }
      else if (k === 1){ const n = R.i(11, 16), fc = mix3(GG.fern, base, .4), a0 = R.r(0, 6.28);
        for (let i = 0; i < n; i++) frond(G, x, y - sy*.35, z, a0 + i/n*6.28 + R.r(-.2, .2), sx*R.r(1.3, 1.8), fc);
        for (let i = 0; i < 6; i++){ const a = R.r(0, 6.28); blade(G, x, y - sy*.35, z, a, sx*.9, .06, .3, base, tip, 3); } }
      else if (k === 2){ const top = y + sy*.8, n = R.i(2, 4);
        for (let i = 0; i < n; i++){ let px = x + R.r(-sx, sx)*.6, pz = z + R.r(-sz, sz)*.6, py = top; const L = sy*R.r(1.8, 2.8), steps = 7, c = R.pick(VINE), dx = R.r(-.04, .04), dz = R.r(-.04, .04);
          for (let st = 0; st < steps; st++){ const ny = py - L/steps, nx = px + dx, nz = pz + dz, h = top - ny;
            const a = G.v(px - .012, py, pz, 0, 1, 0, mul3(c, .8), top - py), b = G.v(px + .012, py, pz, 0, 1, 0, mul3(c, .8), top - py), cc = G.v(nx, ny, nz, 0, 1, 0, mul3(c, .8), h); G.tri(a, b, cc);
            const sd = st % 2 ? 1 : -1, la = R.r(0, 6.28), lx = Math.cos(la)*.09, lz = Math.sin(la)*.09, lc = mix3(c, GG.tip, R.r(0, .25));   // (a small heart-shaped leaf off each node, turning side to side)
            const l0 = G.v(nx, ny, nz, 0, 1, 0, lc, h), l1 = G.v(nx + lx*sd + lz*.4, ny - .03, nz + lz*sd - lx*.4, 0, 1, 0, lc, h + .03), l2 = G.v(nx + lx*sd*1.4, ny - .09, nz + lz*sd*1.4, 0, 1, 0, mul3(lc, .9), h + .09), l3 = G.v(nx + lx*sd*.6 - lz*.4, ny - .08, nz + lz*sd*.6 + lx*.4, 0, 1, 0, lc, h + .08);
            G.tri(l0, l1, l2); G.tri(l0, l2, l3); px = nx; py = ny; pz = nz; } } }
      else { const y0 = y - sy*.5, n = R.i(12, 18), rc = mix3(GG.reed, base, .5);
        for (let i = 0; i < n; i++){ const a = R.r(0, 6.28), rr = R.r(0, sx*.5), top = blade(G, x + Math.cos(a)*rr, y0, z + Math.sin(a)*rr, a, sy*R.r(.7, 1.05), .055, R.r(.08, .3), mul3(base, .85), rc, 4);
          if (R.chance(.5)) seedHead(G, top[0], top[1] - .02, top[2], R.r(.14, .22), GG.head, top[1] - y0); } } }
    return G.I.length ? G.mesh() : null; }
  const geoCache = new Map();
  function blockOf(kind, seed, below, above){ const key = kind + ':' + seed + ':' + (below ? 1 : 0) + (above ? 1 : 0); let g = geoCache.get(key); if (g) return g;
    const T = new Tris(true), k = KIND_KEYS.indexOf(kind) + 1, R = rng(Math.imul(seed, 2654435761) ^ k*97), D = rng(Math.imul(seed, 1597334677) ^ k*131);
    const top = KINDS[kind].build(T, R, D, { below, above }), cut = below ? .1 : .6, pts = [];
    let hmax = top; for (let i = 0; i < T.p.length; i += 3){ if (T.p[i + 1] > hmax) hmax = T.p[i + 1]; if (T.p[i + 1] > cut) pts.push([T.p[i], T.p[i + 2]]); }
    g = { geo: T.geo(), fol: folGeo(T.fol), top, hull: hull2(pts), h: hmax }; geoCache.set(key, g);
    if (geoCache.size > 400){ const k0 = geoCache.keys().next().value, o = geoCache.get(k0); o.geo.dispose(); if (o.fol) o.fol.dispose(); geoCache.delete(k0); }
    return g; }

  /* ---------- the homes as placed: free on the ground, stacked on each other, and joined to their neighbors ---------- */
  // A piece is one block: { id, kind, seed, x, z, rot, y (its floor), base (the block it sits on), up (the one on it), level }.
  // Ground blocks level the ground under them and keep clear of each other; a block can be stacked on the top of a stack
  // (up to four high), square on the one below. Every change remakes the links between neighbors (see links, below).
  let nextId = 1;
  const pieceMeshes = [];
  function pieceMesh(p){ const b = blockOf(p.kind, p.seed, !!p.base || p.level > 0, !!p.up);
    if (p.anim) p.anim.u.pH.value = b.h;
    const m = new THREE.Mesh(b.geo, p.anim ? p.anim.mat : pieceM); m.castShadow = !p.anim; m.receiveShadow = true; m.customDepthMaterial = landDepth; m.frustumCulled = false;
    if (b.fol){ const f = new THREE.Mesh(b.fol, grassM); f.receiveShadow = true; f.frustumCulled = false; f.visible = !p.anim; f.raycast = () => {}; m.add(f); m.userData.fol = f; }   // (its plants, swaying; shown once it's painted in)
    m.position.set(p.x, p.y, p.z); m.rotation.y = p.rot; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(); m.userData.piece = p; p.top = b.top; p.h = b.h; p.hullL = b.hull; p.hullW = placeHull(b.hull, p.x, p.z, p.rot); return m; }
  function remesh(p){ if (p.mesh){ scene.remove(p.mesh); pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); } p.mesh = pieceMesh(p); scene.add(p.mesh); pieceMeshes.push(p.mesh); }
  const stackTop = p => { while (p.up) p = p.up; return p; };
  const MAXLV = 8;   // (how many floors of blocks a home can reach)
  // can a block go here on the ground? wholly on land (right up to the cliff edge is fine), on ground that isn't too steep,
  // not on top of another home (they may touch: touching homes are joined); returns the pad height
  function check(kind, x, z, seed = 1, rot = 0){
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
    const b = blockOf(kind, seed, false, false);
    const by = blocked(placeHull(b.hull, x, z, rot), y, y + b.h); if (by) return { ok: false, why: 'something is in the way', by, y };
    return { ok: true, y };
  }
  const dirtyAround = p => { for (const ch of chunks.values()) if (ch.land && ch.i*CH < p.x + p.r + 3 && ch.i*CH + CH > p.x - p.r - 3 && ch.j*CH < p.z + p.r + 3 && ch.j*CH + CH > p.z - p.r - 3) ch.dirty = true; };
  const SAVE_KEY = 'neonIsland.coast.pieces';
  // the connections built with the connect brush: [{ a, b, type }] by block id
  const ULINK_KEY = 'neonIsland.coast.links';
  let ULINKS = []; try { ULINKS = JSON.parse(localStorage.getItem(ULINK_KEY) || '[]').filter(u => u && u.a && u.b); } catch (e) {}
  const saveLinks = () => { try { localStorage.setItem(ULINK_KEY, JSON.stringify(ULINKS)); } catch (e) {} };
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(PIECES.map(p => [p.kind, +p.x.toFixed(3), +p.z.toFixed(3), +p.rot.toFixed(4), +p.y.toFixed(3), p.seed, p.id, p.base ? p.base.id : 0, p.host ? p.host.id : 0, p.level]))); } catch (e) {} };
  /* ---------- a new home painted in, in watercolor ---------- */
  // Each new block gets its own copy of the material for a moment (see PAINT_APPLY): the wash rises up it from its floor,
  // then the color dries to full, and a bloom of pigment spreads on the ground (or roof) under it and soaks away. Homes put
  // down together (a brush full) are painted one after another, a beat apart. The links between homes wait until the
  // painting is done, then join them.
  const ANIM = { live: false, n: 0, list: [] };
  // (the paint materials are kept and reused, never thrown away: a new one, or the last one let go, meant compiling the
  // shader again in the middle of play, which is what made placing a home hitch)
  const PAINT_POOL = [];
  const newPaint = () => { const u = { pRise: { value: 0 }, pDry: { value: 0 }, pB: { value: 0 }, pH: { value: 2 } };
    return { u, mat: bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true }), true, false, true, u) }; };
  for (let i = 0; i < 8; i++) PAINT_POOL.push(newPaint());
  const freePaint = a => { PAINT_POOL.push({ u: a.u, mat: a.mat }); };
  function paintIn(p){
    const pm = PAINT_POOL.pop() || newPaint(); pm.u.pRise.value = 0; pm.u.pDry.value = 0; pm.u.pB.value = p.y;
    p.anim = { t: -Math.min(ANIM.n++*.02, .5), u: pm.u, mat: pm.mat, bloomed: false };
    ANIM.list.push(p); }
  const PIGMENT = [new THREE.Color(.8, .46, .32), new THREE.Color(.3, .62, .6), new THREE.Color(.86, .7, .42), new THREE.Color(.5, .68, .44), new THREE.Color(.88, .62, .58)];
  const BLOOMS = [];
  const bloomGeo = new THREE.PlaneGeometry(2, 2).rotateX(-PI/2);
  function bloom(p){
    const m = BLOOMS.find(b => !b.visible); if (!m) return;
    const r = KINDS[p.kind].rb*1.7 + .8; m.scale.set(r, 1, r); m.position.set(p.x, p.y + .03, p.z); m.rotation.y = p.seed;
    m.material.uniforms.bCol.value.copy(PIGMENT[p.seed % PIGMENT.length]); m.material.uniforms.bSeed.value = (p.seed % 97)*.37; m.material.uniforms.bT.value = 0; m.visible = true; m.userData.t = 0; }
  const bloomM = new THREE.ShaderMaterial({ uniforms: { bT: { value: 0 }, bCol: { value: new THREE.Color() }, bSeed: { value: 0 }, nightK: CURV.nightK },
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        vertexShader: 'varying vec2 vU; void main(){ vU = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
        fragmentShader: `uniform float bT, bSeed, nightK; uniform vec3 bCol; varying vec2 vU;
          float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
            return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
          float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); vec2 a = mod(q, 2.0), b = floor(q/2.0);
            float b2 = (a.x*2.0 + a.y*3.0 - 2.0*a.x*a.y), b1 = (b.x*2.0 + b.y*3.0 - 2.0*b.x*b.y); return (b2*4.0 + b1)/16.0; }
          void main(){
            float r = length(vU), g = 1.0 - pow(1.0 - min(bT*2.4, 1.0), 3.0), R = 0.3 + 0.62*g;
            float e = R*(0.8 + vn(vU*3.2 + bSeed)*0.32 + vn(vU*8.0 - bSeed)*0.1) - r;   // (inside the wash where e > 0: a ragged, bleeding rim)
            vec2 cell = floor(vU*6.0), cc = (cell + 0.5 + (vec2(h21(cell + bSeed), h21(cell - bSeed + 3.0)) - 0.5)*0.7)/6.0;
            float hd = h21(cell*1.3 + bSeed*0.7), drop = step(0.72, hd)*step(length(vU - cc), 0.035 + 0.05*hd)*step(R*0.85, length(cc))*step(length(cc), R*1.2);   // (splashed droplets past it)
            if (e < 0.0 && drop < 0.5) discard;
            float rim = e > 0.0 ? 1.0 - smoothstep(0.0, 0.07, e) : 1.0;
            float a = (0.26 + 0.34*rim)*(1.0 - smoothstep(0.4, 1.0, bT));
            a = floor(a*6.0 + bayer(gl_FragCoord.xy))/6.0; if (a <= 0.0) discard;
            gl_FragColor = vec4(bCol*(1.0 - 0.22*rim)*mix(1.0, 0.45, nightK), a); }` });
  for (let i = 0; i < 24; i++){ const m = new THREE.Mesh(bloomGeo, bloomM.clone()); m.material.uniforms.nightK = CURV.nightK; m.frustumCulled = false; m.renderOrder = 3; m.visible = false; scene.add(m); BLOOMS.push(m); }
  function animTick(dt){
    ANIM.n = 0;
    for (const m of BLOOMS) if (m.visible){ m.userData.t = ANIM.hold !== undefined ? ANIM.hold/.5 : m.userData.t + dt/.5; m.material.uniforms.bT.value = m.userData.t; if (m.userData.t >= 1) m.visible = false; }
    for (let i = ANIM.list.length - 1; i >= 0; i--){ const p = ANIM.list[i], a = p.anim;
      if (!a || !PIECES.includes(p)){ if (a) freePaint(a); p.anim = null; ANIM.list.splice(i, 1); continue; }
      a.t = ANIM.hold !== undefined ? ANIM.hold : a.t + dt; if (a.t < 0) continue;   // (hold: a test hook)
      if (!a.bloomed){ a.bloomed = true; bloom(p); }
      const r = Math.min(a.t/.17, 1); a.u.pRise.value = 1 - Math.pow(1 - r, 2.2); a.u.pDry.value = smooth(.06, .26, a.t);
      if (r >= 1 && p.mesh && !p.mesh.castShadow) p.mesh.castShadow = true;   // (its shadow comes once the wash has reached the top)
      if (a.t > .27){ p.anim = null; p.mesh.material = pieceM; p.mesh.castShadow = true; if (p.mesh.userData.fol) p.mesh.userData.fol.visible = true; freePaint(a); ANIM.list.splice(i, 1); } } }
  // A block can also be built off the side of another (host), on the same floor: it hangs from the wall it's set against, on
  // a stepped plaster corbel. How far a block reaches out from anything that stands on the ground is kept (reach): past
  // SUPPORT_REACH it gets supports of its own down to the ground, in the style of the home, and they count as standing.
  const SUPPORT_REACH = 3.6;
  function addPiece(kind, x, z, rot, y, quiet, seed = 1, base = null, id = 0, host = null, level = null){
    const lv = level !== null ? level : base ? base.level + 1 : host ? host.level : 0;
    const p = { id: id || nextId, kind, x, z, rot, y, seed, base, host, up: null, level: lv, r: KINDS[kind].r, reach: 0, cols: false };
    if (base) p.reach = base.reach;
    else if (host && lv > 0){ p.reach = host.reach + Math.hypot(x - host.x, z - host.z); if (p.reach > SUPPORT_REACH){ p.cols = true; p.reach = 0; } }
    nextId = Math.max(nextId, p.id + 1);
    if (ANIM.live) paintIn(p);
    if (base){ base.up = p; remesh(base); }
    remesh(p); PIECES.push(p);
    if (!base && lv === 0){ gridAdd(p); dirtyAround(p); }
    if (ANIM.live && lv === 0) grassAround(x, z, p.r + 1);   // (the grass under a new home goes)
    linksDirty = true; if (!quiet) save(); return p; }
  function removePiece(p){   // (and everything stacked on it or built off its side)
    if (!PIECES.includes(p)) return;
    if (p.up) removePiece(p.up);
    for (const q of PIECES.filter(q => q.host === p)) removePiece(q);
    scene.remove(p.mesh); pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); PIECES.splice(PIECES.indexOf(p), 1);
    if (ULINKS.some(u => u.a === p.id || u.b === p.id)){ ULINKS = ULINKS.filter(u => u.a !== p.id && u.b !== p.id); saveLinks(); }
    if (p.base){ p.base.up = null; remesh(p.base); } else if (p.level === 0){ gridDel(p); dirtyAround(p); }
    if (p.level === 0) grassAround(p.x, p.z, p.r + 1);
    linksDirty = true; save(); }

  // where a block of `kind` goes built off `host`'s side facing the point (wx, wz): square to the host, against its wall
  function sideSpot(host, kind, wx, wz, seed = PL.seed){
    let best = null, bd = -1e9, bk = 0;
    for (let k = 0; k < 4; k++){ const a = host.rot + k*PI/2, dx = Math.sin(a), dz = Math.cos(a), dd = (wx - host.x)*dx + (wz - host.z)*dz; if (dd > bd){ bd = dd; best = [dx, dz]; bk = k; } }
    // the new block's wall set right against the host's: how far the host reaches that way, and how far the new one reaches back
    const la = bk*PI/2, ux = Math.sin(la), uz = Math.cos(la), bN = blockOf(kind, seed, host.level > 0, false);
    const off = hullReach(host.hullL, ux, uz) + hullReach(bN.hull, -ux, -uz) - .06, x = host.x + best[0]*off, z = host.z + best[1]*off;
    if (host.level === 0){ const ck = check(kind, x, z, seed, host.rot); return Object.assign({ x, z, rot: host.rot, host }, ck); }   // (on the ground: a home set against it)
    const y = host.y;
    if (heightAt(x, z) > y - .3) return { ok: false, why: 'into the hillside', x, z, y, rot: host.rot, host };
    if (blocked(placeHull(bN.hull, x, z, host.rot), y, y + bN.h, [host])) return { ok: false, why: 'something is in the way', x, z, y, rot: host.rot, host };
    const reach = host.reach + off;
    return { ok: true, x, z, y, rot: host.rot, host, supports: reach > SUPPORT_REACH }; }

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
  // two blocks' facing walls: how far apart their middles are, which way, where each wall is, and the gap between them
  function pairOf(A, B){
    const dc = Math.hypot(B.x - A.x, B.z - A.z); if (dc < .05) return null;
    const dx = (B.x - A.x)/dc, dz = (B.z - A.z)/dc, tA = hullExit(A.hullW, A.x, A.z, dx, dz), tB = hullExit(B.hullW, B.x, B.z, -dx, -dz);
    return { A, B, dc, gap: dc - tA - tB, tA, tB, dx, dz }; }
  // what a connection is built as. Chosen ones are kept where they can be (a shared wall only between blocks that nearly
  // touch, a pergola or an arcade only on the ground with both homes about level; otherwise a bridge). 'random', and the
  // ones neighbors make themselves, pick what suits the spot: a wall when they touch; on the ground a pergola walk or an
  // arcade (now and then a glass walk); in the air a planted bridge or a skywalk, the skywalk more often the longer it is
  const LINK_TYPES = ['bridge', 'skywalk', 'pergola', 'arcade', 'wall', 'random'];
  function linkType(L, R){
    const ground = !L.A.level && !L.B.level && Math.abs(L.A.y - L.B.y) < 1.4, t = L.type || 'random';
    if (t === 'wall') return L.gap < 1.6 && L.A.level === L.B.level ? 'wall' : ground ? 'arcade' : 'bridge';
    if (t === 'pergola' || t === 'arcade') return ground ? t : 'bridge';
    if (t === 'bridge' || t === 'skywalk') return t;
    if (L.gap < .5 && L.A.level === L.B.level) return 'wall';
    if (ground) return R.chance(.12) ? 'skywalk' : R.chance(.58) ? 'pergola' : 'arcade';
    return R.chance(Math.min(.8, .35 + L.gap*.08)) ? 'skywalk' : 'bridge'; }
  // one connection drawn into T (its walk, bridge, arcade or shared wall, and the doorways where it meets the walls)
  function drawLink(T, L, pools){
    const { A, B, dc, dx, dz, tA, tB } = L;
    const ra = tA - .04, rb_ = tB - .04, h = hashPair(A.id, B.id), R = rng((h*4294967296) >>> 0);
    const type = linkType(L, R), fy = A.level ? 0 : .12, a = V3(A.x + dx*ra, A.y + fy, A.z + dz*ra), b = V3(B.x - dx*rb_, B.y + (B.level ? 0 : .12), B.z - dz*rb_);
    const len = a.distanceTo(b), sx = -dz, sz = dx;
    // the way follows the ground: wherever the land between the two doors rises above the straight line, the path is lifted
    // to ride over it (a long walk between two homes otherwise sank into the hill between them); see run, below
    const NP = Math.max(2, Math.ceil(len/.7)), lift = new Float32Array(NP + 1);
    for (let k = 0; k <= NP; k++){ const u = k/NP, px = a.x + (b.x - a.x)*u, pz = a.z + (b.z - a.z)*u, yl = a.y + (b.y - a.y)*u;
      let g = -1e9; for (const s_ of [-.55, 0, .55]) g = Math.max(g, heightAt(px + sx*s_, pz + sz*s_)); lift[k] = Math.max(0, g + .1 - yl); }
    for (let pass = 0; pass < 2; pass++) for (let k = 1; k < NP; k++) lift[k] = Math.max(lift[k], (lift[k - 1] + lift[k + 1])*.5);   // (eased, so it doesn't kink)
    const liftAt = u => { const f = clamp(u, 0, 1)*NP, k = Math.min(NP - 1, Math.floor(f)), t = f - k; return lift[k]*(1 - t) + lift[k + 1]*t; };
    const at = (u, s, y) => V3(a.x + (b.x - a.x)*u + sx*s, a.y + (b.y - a.y)*u + y + liftAt(u), a.z + (b.z - a.z)*u + sz*s);
    // a long piece (deck, rail, beam, roof) laid along the way in short lengths, so it bends with the lift
    const run = (s, y, w, h, col, up = 0, u0 = 0, u1 = 1) => { const n = Math.max(1, Math.ceil((u1 - u0)*NP)), o = .02/Math.max(len, .1);
      for (let k = 0; k < n; k++){ const ua = u0 + (u1 - u0)*k/n, ub = u0 + (u1 - u0)*(k + 1)/n; seg(T, at(ua - (k ? o : 0), s, y), at(ub + (k < n - 1 ? o : 0), s, y), w, h, col, up); } };
    // a doorway in each wall where the walk or the bridge meets it: a dark opening in a cream frame, under a small hood
    const door = (p, q) => { const d = V3(q.x - p.x, 0, q.z - p.z).normalize(), o = p.clone().addScaledVector(d, -.02), o2 = p.clone().addScaledVector(d, .05);
      seg(T, o, o2, .66, .98, HP.cream, .49); seg(T, o, o2.clone().addScaledVector(d, .02), .5, .82, HP.glassD, .41); seg(T, o, o2.clone().addScaledVector(d, .12), .8, .06, HP.terra, 1.02); };
    if (type !== 'wall'){ door(a, b); door(b, a); }
    if (type === 'wall'){   // touching: a shared wall with an arched way through
      const a2 = at(-.15, 0, 0), b2 = at(1.15, 0, 0), wh = A.level ? .9 : 1.1, wc = R.pick([HP.cream, HP.white, HP.sand]);
      seg(T, a2, b2, 1.3, wh, wc, wh/2); seg(T, a2, b2, 1.4, .08, HP.cream, wh + .04);
      for (const s of [-.66, .66]){ const c = at(.5, s, 0); box(T, c.x, c.y + .38, c.z, .5, .6, .5, HP.glassD); }
      for (let k = 0; k < 3; k++){ const c = at(.2 + k*.3, 0, wh + .08); plant(T, R, c.x, c.y, c.z, 1.1); }
    } else if (type === 'bridge' || type === 'skywalk'){   // up in the air: a planted bridge, or a glass skywalk
      if (len > 3.6 && (A.level || B.level)) for (let u = 1/Math.ceil(len/3); u < .999; u += 1/Math.ceil(len/3)){ const c = at(u, 0, 0), g = heightAt(c.x, c.z);   // (a long span: slim piers down to the ground)
        if (c.y - g > .4){ box(T, c.x, (c.y + g)/2 - .05, c.z, .16, c.y - g - .1, .16, HP.cream); box(T, c.x, g + .1, c.z, .3, .2, .3, HP.stone); } }
      if (type === 'bridge'){
        run(0, 0, .8, .1, HP.wood, .05);
        for (const s of [-.38, .38]){ run(s, .45, .05, .05, HP.rail);
          for (let u = 0; u <= 1.001; u += 1/Math.max(1, Math.round(len/.6))){ const c = at(u, s, 0); box(T, c.x, c.y + .25, c.z, .04, .42, .04, HP.rail); } }
        for (let u = .2; u < .85; u += .3) if (R.chance(.7)){ const c = at(u, R.pick([-.28, .28]), .1); pot(T, R, c.x, c.y, c.z, .8); }
        if (len > 2.5 && len <= 3.6){ const c = at(.5, 0, 0), g = heightAt(c.x, c.z); if (c.y - g > .4) box(T, c.x, (c.y + g)/2, c.z, .14, c.y - g, .14, HP.cream); }   // (a slim strut under a long one)
        { const c = at(.5, .38, 0); box(T, c.x, c.y + .62, c.z, .1, .1, .1, HP.lamp); box(T, c.x, c.y + .69, c.z, .14, .03, .14, HP.rail); }   // (a lamp on the rail)
      } else {
        run(0, 0, .9, .08, HP.stone, .04); run(0, 0, .92, .7, HP.glass, .45); run(0, 0, .96, .08, HP.cream, .84);
        for (let u = 0; u <= 1.001; u += 1/Math.max(1, Math.round(len/.5))){ const c = at(u, 0, 0); seg(T, at(u - .01, 0, 0), at(u + .01, 0, 0), .98, .82, HP.frame, .45); }
      }
    } else if (type === 'pergola'){   // on the ground: a pergola walk, posts and beams, vines along them, plants hanging down
      run(0, 0, 1.0, .14, HP.stone, .02);
      const n = Math.max(2, Math.round(len/.9));
      for (let k = 0; k <= n; k++) for (const s of [-.45, .45]){ const c = at(k/n, s, 0); if (solidAt(c.x, c.z, c.y, c.y + 1.3)) continue; box(T, c.x, c.y + .65, c.z, .09, 1.3, .09, HP.wood); }
      for (const s of [-.45, .45]) run(s, 1.32, .08, .1, HP.wood, 0, -.03, 1.03);
      for (let k = 0; k <= n*2; k++){ const c0 = at(k/(n*2), -.6, 1.4), c1 = at(k/(n*2), .6, 1.4); seg(T, c0, c1, .05, .06, HP.wood); }
      for (let k = 0; k < n*3; k++){ const c = at(R.r(0, 1), R.r(-.5, .5), 1.45); T.add(GEO.ico, mat(c.x, c.y, c.z, 0, R.r(0, 3), 0, .2, .12, .2), R.pick(HP.leaf));
        if (R.chance(.3)) T.add(GEO.ico, mat(c.x, c.y + .07, c.z, 0, 0, 0, .06, .06, .06), R.pick(HP.flower)); }
      for (let k = 0; k < n; k++) if (R.chance(.5)){ const c = at((k + .5)/n, R.pick([-.3, .3]), 0); T.add(GEO.ico, mat(c.x, c.y + 1.05, c.z, 0, 0, 0, .12, .25, .12), R.pick(HP.leaf)); }
      for (const u of [0, 1]) if (R.chance(.8)){ const c = at(u, R.pick([-.65, .65]), 0); pot(T, R, c.x, c.y, c.z, 1.1); }
      { const np = Math.max(1, Math.round(len/2.2)); for (let k = 0; k < np; k++){ const c = at((k + .5)/np, 0, 0); pools.push([c.x, c.z, Math.min(len/2, 1.1) + .9, .9]); } }   // (light pools spaced along the walk, not one stretched over all of it)
      // festoon lights strung along the beams, sagging between the posts
      for (const s of [-.45, .45]){ const nb = n*4; for (let k = 0; k <= nb; k++){ const u = k/nb, sag = .14*Math.sin(PI*((u*n) % 1)), c = at(u, s, 1.22 - sag); box(T, c.x, c.y, c.z, .06, .07, .06, HP.lamp); } }
    } else {   // on the ground: an arcade, white columns under a tiled roof, planters along it
      run(0, 0, 1.1, .14, HP.stone, .02);
      const n = Math.max(2, Math.round(len/.8));
      for (let k = 0; k <= n; k++) for (const s of [-.5, .5]){ const c = at(k/n, s, 0); if (solidAt(c.x, c.z, c.y, c.y + 1.2)) continue; T.add(GEO.cyl8, mat(c.x, c.y + .6, c.z, 0, 0, 0, .08, 1.2, .08), HP.white); }
      run(0, 1.2, 1.3, .12, HP.white, 0, -.04, 1.04); run(0, 1.34, 1.4, .1, HP.tile, 0, -.04, 1.04);
      for (let k = 0; k < n; k++) if (R.chance(.6)){ const c = at((k + .5)/n, R.pick([-.65, .65]), 0); pot(T, R, c.x, c.y, c.z, 1); }
      { const np = Math.max(1, Math.round(len/2.2)); for (let k = 0; k < np; k++){ const c = at((k + .5)/np, 0, 0); pools.push([c.x, c.z, Math.min(len/2, 1.1) + .8, .8]); } }
      for (let k = 0; k < n; k++){ const c = at((k + .5)/n, 0, 0); box(T, c.x, c.y + 1.06, c.z, .02, .2, .02, HP.rail); box(T, c.x, c.y + .9, c.z, .12, .14, .12, HP.lamp); }   // (a lantern hung in each bay)
    }
  }
  function buildLinks(){
    linksDirty = false;
    if (linksMesh){ scene.remove(linksMesh); linksMesh.geometry.dispose(); for (const c of linksMesh.children) c.geometry.dispose(); linksMesh = null; }
    const T = new Tris(true), pairs = [], deg = new Map(), joined = new Set(), pools = [];
    for (const p of PIECES) if (!p.level) pools.push([p.x, p.z, KINDS[p.kind].rb*1.25 + 1.5, 1]);   // (by night: the windows' light on the ground round a home)
    // the connections built with the connect brush come first, as chosen; then the ones neighbors make on their own
    const byId = new Map(PIECES.map(p => [p.id, p])), userKey = new Set();
    for (const u of ULINKS){ const A = byId.get(u.a), B = byId.get(u.b); if (!A || !B) continue; const L = pairOf(A, B); if (!L) continue;
      L.user = true; L.type = u.type; pairs.push(L); userKey.add(Math.min(A.id, B.id) + '|' + Math.max(A.id, B.id)); }
    const nUser = pairs.length;
    for (let i = 0; i < PIECES.length; i++) for (let j = i + 1; j < PIECES.length; j++){
      const A = PIECES[i], B = PIECES[j]; if (A.level !== B.level) continue;
      if (Math.abs(A.y - B.y) > (A.level ? .6 : 1.4)) continue;
      if (userKey.has(Math.min(A.id, B.id) + '|' + Math.max(A.id, B.id))) continue;
      const L = pairOf(A, B); if (!L || L.dc > 9 || L.gap > 3.6) continue;
      pairs.push(L); }
    const auto = pairs.splice(nUser).sort((p, q) => p.gap - q.gap); pairs.push(...auto);
    for (const L of pairs){
      const { A, B, dc, dx, dz, tA, tB } = L; if (!L.user && ((deg.get(A) || 0) >= 3 || (deg.get(B) || 0) >= 3)) continue;
      // the way between the two walls must be clear of every other block at its height, a body's width to each side
      const ly0 = Math.min(A.y, B.y) + .1, ly1 = ly0 + 1.4, ax0 = A.x + dx*tA, az0 = A.z + dz*tA, span = Math.max(0, dc - tA - tB);
      let clear = true;
      for (let u = 0; u <= span + 1e-6 && clear; u += .3) for (const s_ of [-.6, 0, .6]) if (solidAt(ax0 + dx*u - dz*s_, az0 + dz*u + dx*s_, ly0, ly1, [A, B])){ clear = false; break; }
      if (!clear && !L.user) continue;
      deg.set(A, (deg.get(A) || 0) + 1); deg.set(B, (deg.get(B) || 0) + 1); joined.add(A.id + '|' + B.id); joined.add(B.id + '|' + A.id);
      drawLink(T, L, pools);
    }
    // courtyards: three ground homes all joined to each other
    const g0 = PIECES.filter(p => !p.level);
    for (let i = 0; i < g0.length; i++) for (let j = i + 1; j < g0.length; j++) for (let k = j + 1; k < g0.length; k++){
      const [A, B, C] = [g0[i], g0[j], g0[k]];
      if (!joined.has(A.id + '|' + B.id) || !joined.has(B.id + '|' + C.id) || !joined.has(A.id + '|' + C.id)) continue;
      const cx = (A.x + B.x + C.x)/3, cz = (A.z + B.z + C.z)/3, cy = heightAt(cx, cz), R = rng(Math.imul(A.id + B.id*7 + C.id*31, 2654435761) >>> 0);
      if ([A, B, C].some(P => Math.hypot(P.x - cx, P.z - cz) < KINDS[P.kind].rb + .9)) continue;
      T.add(GEO.cyl12, mat(cx, cy + .05, cz, 0, 0, 0, 1.1, .12, 1.1), HP.stone); pools.push([cx, cz, 2.2, .8]);
      if (R.chance(.5)){ T.add(GEO.cyl12, mat(cx, cy + .2, cz, 0, 0, 0, .55, .2, .55), HP.cream); T.add(GEO.cyl12, mat(cx, cy + .29, cz, 0, 0, 0, .45, .03, .45), HP.glass);
        T.add(GEO.cyl8, mat(cx, cy + .5, cz, 0, 0, 0, .08, .45, .08), HP.cream); }
      else { T.add(GEO.cyl5, mat(cx, cy + .55, cz, 0, 0, 0, .08, 1.1, .08), HP.wood); T.add(GEO.ico, mat(cx, cy + 1.3, cz, 0, 0, 0, .7, .5, .7), R.pick(HP.leaf)); }
      for (let q = 0; q < 6; q++){ const a = q/6*PI*2 + R.r(0, .5); pot(T, R, cx + Math.cos(a)*.95, cy + .1, cz + Math.sin(a)*.95, 1); }
    }
    // under each block built off a side: a stepped plaster corbel springing from the wall it hangs on; and, where it
    // reaches too far out, supports to the ground in the home's own style
    for (const p of PIECES){ if (!p.host || p.level === 0) continue;
      const h = p.host, dx = (p.x - h.x), dz = (p.z - h.z), dl = Math.hypot(dx, dz) || 1, ux = dx/dl, uz = dz/dl, rbH = hullExit(h.hullW, h.x, h.z, ux, uz) - .05, rbP = Math.min(KINDS[p.kind].rb, (dl - rbH)*.9);
      const R = rng(Math.imul(p.id, 2654435761) >>> 0), wall = h.kind === 'tower' ? HP.cream : h.kind === 'pods' ? HP.white : HP.cream;
      if (!p.cols){
        for (let k = 0; k < 3; k++){ const out = rbP*1.7*(1 - k*.3), y = p.y - .08 - k*.16;
          const a = V3(h.x + ux*rbH, y, h.z + uz*rbH), b = V3(h.x + ux*(rbH + out), y, h.z + uz*(rbH + out)); seg(T, a, b, rbP*1.5*(1 - k*.15), .16, wall); }
        for (const s of [-1, 1]){ const sx = -uz*s*rbP*.55, sz = ux*s*rbP*.55;   // (a curved bracket each side)
          for (let k = 0; k < 4; k++){ const f = k/3, y = p.y - .1 - f*.9, o = rbH + (1 - f)*rbP*.9; box(T, h.x + ux*o + sx, y, h.z + uz*o + sz, .14, .2, .14, HP.terra); } }
        if (R.chance(.7)) for (let k = 0; k < 3; k++){ const c = V3(p.x - ux*rbP*.3 + R.r(-.4, .4)*-uz, p.y - .5 - k*.25, p.z - uz*rbP*.3 + R.r(-.4, .4)*ux); T.add(GEO.ico, mat(c.x, c.y, c.z, 0, 0, 0, .13, .22, .13), R.pick(HP.leaf)); }   // (vines hanging from it)
      } else {
        const g = Math.min(heightAt(p.x, p.z), p.y - .4), sty = h.kind;
        if (sty === 'tower' || sty === 'pods'){   // a round column, banded, a planter at its foot
          const col = sty === 'pods' ? HP.white : HP.cream; T.add(GEO.cyl12, mat(p.x, (p.y + g)/2, p.z, 0, 0, 0, .22, p.y - g, .22), col);
          for (let y = g + .8; y < p.y - .2; y += 1.1) T.add(GEO.cyl12, mat(p.x, y, p.z, 0, 0, 0, .26, .1, .26), sty === 'pods' ? HP.blue : HP.terra);
          T.add(GEO.cyl12, mat(p.x, p.y - .1, p.z, 0, 0, 0, .55, .2, .55), col); T.add(GEO.cyl12, mat(p.x, g + .12, p.z, 0, 0, 0, .45, .24, .45), HP.stone); plant(T, R, p.x + .3, g + .2, p.z, 1.2);
        } else {   // plaster piers carrying an arch, vines climbing them
          for (const s of [-1, 1]){ const px = p.x - uz*s*rbP*.7 + ux*rbP*.3, pz = p.z + ux*s*rbP*.7 + uz*rbP*.3;
            box(T, px, (p.y + g)/2, pz, .28, p.y - g, .28, HP.white); box(T, px, g + .1, pz, .4, .2, .4, HP.stone);
            for (let y = g + .3; y < p.y - .3; y += .45) if (R.chance(.6)) T.add(GEO.ico, mat(px + R.r(-.15, .15), y, pz + R.r(-.15, .15), 0, R.r(0, 3), 0, .14, .18, .14), R.pick(HP.leaf)); }
          const a = V3(p.x + uz*rbP*.7 + ux*rbP*.3, p.y - .15, p.z - ux*rbP*.7 + uz*rbP*.3), b = V3(p.x - uz*rbP*.7 + ux*rbP*.3, p.y - .15, p.z + ux*rbP*.7 + uz*rbP*.3);
          seg(T, a, b, .3, .3, HP.cream); seg(T, a, b, .34, .08, HP.terra, .17);
        }
      }
    }
    if (T.p.length){ linksMesh = T.mesh(pieceM); linksMesh.customDepthMaterial = landDepth; scene.add(linksMesh);
      const fg = folGeo(T.fol); if (fg){ const f = new THREE.Mesh(fg, grassM); f.receiveShadow = true; f.frustumCulled = false; f.raycast = () => {}; linksMesh.add(f); } }
    buildPools(pools);
  }
  // the warm light by night: a soft pool on the ground round each home, under each pergola and arcade, in each courtyard
  // (flat quads added over the ground, in a few dithered steps; only drawn when it's dark)
  const poolM = new THREE.ShaderMaterial({ uniforms: { nightK: CURV.darkK }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 aL; varying vec3 vL; varying vec2 vW; void main(){ vL = aL; vW = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    // (a wash of warm light: a ragged blot, its color running wet-in-wet from gold at the heart to rose-orange at the edge,
    // blooms where the water backed up into it, and more pigment at its rim)
    fragmentShader: `uniform float nightK; varying vec3 vL; varying vec2 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float r = length(vL.xy);
        float edge = 0.6 + 0.26*vn(vW*0.8) + 0.1*vn(vW*2.6 + 5.0), e = edge - r; if (e < 0.0) discard;
        float body = smoothstep(0.0, 0.45, e), bloom = vn(vW*1.4 + 7.0);
        vec3 c = mix(vec3(0.95, 0.42, 0.24), vec3(1.0, 0.74, 0.36), body*(0.6 + 0.4*bloom));
        float a = (0.25 + 0.5*body)*(0.75 + 0.5*smoothstep(0.35, 0.75, bloom)) + 0.45*(1.0 - smoothstep(0.0, 0.05, e));
        a = floor(a*7.0)/7.0;
        gl_FragColor = vec4(c*a*0.42*vL.z*nightK, 1.0); }` });
  let poolMesh = null;
  function buildPools(pools){
    if (poolMesh){ scene.remove(poolMesh); poolMesh.geometry.dispose(); poolMesh = null; } if (!pools.length) return;
    const P = [], L = [];
    for (const [x, z, r, k] of pools){ const y = heightAt(x, z) + .04;
      for (const [u, v] of [[-1, -1], [1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]]){ P.push(x + u*r, y, z + v*r); L.push(u, v, k); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 3));
    poolMesh = new THREE.Mesh(g, poolM); poolMesh.frustumCulled = false; poolMesh.renderOrder = 2; poolMesh.visible = CURV.darkK.value > .01; scene.add(poolMesh); }

  try { const L = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'), byId = new Map();
    for (const [kind, x, z, rot, y, seed, id, baseId, hostId, level] of L){ if (!KINDS[kind]) continue; const base = baseId ? byId.get(baseId) : null, host = hostId ? byId.get(hostId) : null;
      if ((baseId && !base) || (hostId && !host)) continue;
      byId.set(id || 0, addPiece(kind, x, z, rot, y, true, seed || 1, base, id || 0, host, level ?? null)); } } catch (e) {}

  /* ---------- foliage: painted with the grass brush ---------- */
  // Nothing tiled: every tuft is made of real blades, each its own curved, tapering strip (a few segments, leaning and
  // curling, lit from both sides), so the meadow has depth and length and moves. Five kinds: meadow grass; wildflowers (grass
  // with stems and five-petaled heads); ferns (arching fronds with paired leaflets); tall grass (long reeds with seed heads);
  // and a mix, which lays the kinds in drifts (fern in the hollows, flowers in patches, reeds in clumps) the way a meadow
  // grows. The color is laid on in watercolor: two greens running into each other across the ground in broad washes, a dry
  // ochre wash here and there, cool and dark at the roots, warm and pale at the tips where the light comes through.
  // The ground is cut into cells (.4 units) and each holds one tuft at most, so painting over the same place again adds
  // nothing; tufts are kept by cell and made again from their cell's seed. A mesh per 8-unit square, remade when painted.
  const GRASS_KEY = 'neonIsland.coast.grass', GC = .4, GSQ = 8;
  const GSTYLES = ['meadow', 'wildflowers', 'ferns', 'tall grass', 'mix'];
  const tufts = new Map(), gSquares = new Map(), gDirty = new Set();
  const sqKey = (i, j) => Math.floor(i*GC/GSQ) + ',' + Math.floor(j*GC/GSQ);
  try { for (const [i, j, st] of JSON.parse(localStorage.getItem(GRASS_KEY) || '[]')){ tufts.set(i + ',' + j, [i, j, st]); gDirty.add(sqKey(i, j)); } } catch (e) {}
  let gSaveT = 0; const saveGrass = () => { clearTimeout(gSaveT); gSaveT = setTimeout(() => { try { localStorage.setItem(GRASS_KEY, JSON.stringify([...tufts.values()])); } catch (e) {} }, 400); };
  // can a tuft grow here: on land, back from the cliff's edge, not steep, not inside a home
  function grassOK(x, z){ if ((coastX(z) - x)*rowCos(z) < 1.1) return null; const y = heightAt(x, z);
    if (Math.abs(heightAt(x + .35, z) - y) > .3 || Math.abs(heightAt(x, z + .35) - y) > .3) return null;
    if (solidAt(x, z, y - .2, y + .5)) return null; return y; }
  function tuft(G, i, j, st, part){   // (part: 'blot', the washed ground under it; 'plant', the plant itself; 'lo', the plant drawn simply, for far views)
    const R = rng((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0), x = (i + R.r(.1, .9))*GC, z = (j + R.r(.1, .9))*GC, y = grassOK(x, z); if (y === null) return;
    const wash = fbm(x*.12 + 3, z*.12 - 5), dryK = smooth(.58, .75, fbm(x*.07 - 20, z*.07 + 9))*.55;
    let base = mix3(mix3(GG.greenA, GG.greenB, smooth(.35, .65, wash)), GG.greenC, smooth(.55, .8, fbm(x*.3, z*.3))*.6); base = mix3(base, GG.dry, dryK);
    const tipC = mix3(GG.tip, base, .35), lean0 = R.r(.15, .45);
    // the ground under it washed darker, a ragged blot: blots run together into the patch's shadowed floor
    { const rr = GC*R.r(.85, 1.15), a0 = R.r(0, 6.28);
      if (part === 'blot'){ const gc = mul3(base, .72, .6), c0 = G.v(x, y + .025, z, 0, 1, 0, gc, 0), n = 7, ring_ = [];
        for (let k = 0; k < n; k++){ const a = a0 + k/n*6.28, q = rr*(.75 + .45*hash2(i*31 + k, j*17 - k)); ring_.push(G.v(x + Math.cos(a)*q, y + .02, z + Math.sin(a)*q, 0, 1, 0, mul3(gc, 1.06), 0)); }
        for (let k = 0; k < n; k++) G.tri(c0, ring_[(k + 1) % n], ring_[k]); return; } }
    // the simple one: the same tuft in the same place and colors, of a few broad single-triangle blades (and a triangle for a
    // flower, a frond, a seed head); about a tenth of the triangles, and at a distance it reads the same
    if (part === 'lo'){
      const one = (n, l0, l1, w, c0, c1, lean) => { const tops = []; for (let k = 0; k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .14); tops.push(blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(l0, l1), w, lean + R.r(-.1, .2), c0, c1, 1)); } return tops; };
      const dot = (p, r, col) => { const h = p[1] - y, a = G.v(p[0] - r, p[1], p[2], 0, 1, 0, col, h), b = G.v(p[0] + r*.5, p[1] + r*.3, p[2] - r*.86, 0, 1, 0, col, h), c = G.v(p[0] + r*.5, p[1] - r*.3, p[2] + r*.86, 0, 1, 0, col, h); G.tri(a, b, c); };
      const b2 = mix3(base, tipC, .22);   // (a touch lighter at the root: fewer, broader blades hide less of the dark ground, so they carry more of the tip color)
      if (st === 0) one(8, .26, .58, .32, b2, tipC, lean0);
      else if (st === 1){ one(6, .2, .42, .3, b2, tipC, lean0); const fc = R.pick(FLOWERS); for (const t of one(2, .32, .55, .05, mul3(base, .9), base, .15)) dot(t, .11, fc); }
      else if (st === 2){ const fc = mix3(GG.fern, base, .25); one(6, .4, .65, .36, mix3(fc, GG.tip, .12), mix3(fc, GG.tip, .35), 1.05); }
      else { const rc = mix3(GG.reed, base, .45); for (const t of one(5, .75, 1.25, .16, mix3(base, rc, .3), rc, .12)) if (R.chance(.6)) dot([t[0], t[1] + .06, t[2]], .07, GG.head); one(3, .2, .38, .26, b2, tipC, lean0); }
      return; }
    const grass = (n, l0, l1) => { for (let k = 0; k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .16), c = mix3(base, [base[0]*1.12, base[1]*1.06, base[2]*.9], R.f());
      blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a + R.r(-.6, .6), R.r(l0, l1), R.r(.08, .14), lean0 + R.r(-.15, .2), c, tipC, 3); } };
    if (st === 0) grass(R.i(10, 15), .24, .6);
    else if (st === 1){ grass(R.i(6, 9), .2, .45);
      const fc = R.pick(FLOWERS);   // (a clump keeps mostly to one color, as wildflowers do)
      for (let k = 0, n = R.i(2, 4); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .17), col = R.chance(.75) ? fc : R.pick(FLOWERS), top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.3, .62), .04, R.r(.05, .25), mul3(base, .9), base, 3);
        flower(G, top[0], top[1], top[2], R.r(.09, .14), col, top[1] - y); } }
    else if (st === 2){ const n = R.i(5, 8), a0 = R.r(0, 6.28), fc = mix3(GG.fern, base, .25); for (let k = 0; k < n; k++) frond(G, x, y, z, a0 + k/n*6.28 + R.r(-.3, .3), R.r(.42, .72), fc); }
    else { const rc = mix3(GG.reed, base, .45); for (let k = 0, n = R.i(6, 9); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .12), top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.75, 1.3), .05, R.r(.05, .2), mul3(base, .85), rc, 4);
        if (R.chance(.65)) seedHead(G, top[0], top[1] - .02, top[2], R.r(.16, .26), GG.head, top[1] - y); } grass(R.i(2, 4), .2, .4); } }
  // the mix: which kind grows where, in drifts
  function mixStyle(i, j){ const x = i*GC, z = j*GC, n = fbm(x*.16 + 11, z*.16 - 4), m = fbm(x*.35 - 7, z*.35 + 2), h = hash2(i*7 + 1, j*13 + 5);
    if (n < .33) return 2; if (n > .7 && m > .45) return 3; if (m > .62 || h < .08) return 1; return 0; }
  function paintGrass(cx, cz, r, style, erase){
    let any = false;
    for (let i = Math.floor((cx - r)/GC); i <= Math.ceil((cx + r)/GC); i++) for (let j = Math.floor((cz - r)/GC); j <= Math.ceil((cz + r)/GC); j++){
      const x = (i + .5)*GC, z = (j + .5)*GC, d = Math.hypot(x - cx, z - cz); if (d > r) continue; const k = i + ',' + j;
      if (erase){ if (tufts.delete(k)){ gDirty.add(sqKey(i, j)); any = true; } continue; }
      if (tufts.has(k) || hash2(i*3 + 17, j*5 + 29) > .93 - .25*smooth(r*.7, r, d)) continue;   // (a little thinner at the brush's rim)
      tufts.set(k, [i, j, style === 4 ? mixStyle(i, j) : style]); gDirty.add(sqKey(i, j)); any = true; }
    if (any) saveGrass(); }
  function buildSquare(key){
    const old = gSquares.get(key); if (old){ scene.remove(old); old.userData.hi.dispose(); old.userData.lo.dispose(); gSquares.delete(key); }
    // (two versions of the square: the full one, and the simple one for far views; every tuft is in both, so switching
    // never thins the meadow, see grassLOD)
    const [si, sj] = key.split(',').map(Number), G = new GB(), L = new GB(), n = GSQ/GC;
    for (let i = si*n; i < si*n + n; i++) for (let j = sj*n; j < sj*n + n; j++){ const t = tufts.get(i + ',' + j); if (!t) continue;
      tuft(G, i, j, t[2], 'blot'); tuft(G, i, j, t[2], 'plant'); tuft(L, i, j, t[2], 'blot'); tuft(L, i, j, t[2], 'lo'); }
    if (!G.I.length) return;
    const hi = G.mesh(), lo = L.mesh();
    for (const g of [hi, lo]){ g.computeBoundingSphere(); g.boundingSphere.radius += 1.5; }   // (room for the sway and the tall reeds: culled only when truly out of view)
    const m = new THREE.Mesh(GLOD.hi ? hi : lo, grassM); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = true; m.matrixAutoUpdate = false;
    m.userData = { hi, lo }; scene.add(m); gSquares.set(key, m); }
  // Far views draw the simple grass: below zoom 16 the full grass, past 19 the simple one (the gap keeps it from switching
  // back and forth at the edge); the whole meadow switches at once, at a zoom where a blade is about a pixel wide
  const GLOD = { hi: true };
  function grassLOD(){
    const want = GLOD.hi ? zoom < 19 : zoom < 16; if (want === GLOD.hi) return; GLOD.hi = want;
    for (const m of gSquares.values()) m.geometry = want ? m.userData.hi : m.userData.lo; }
  function grassTick(t){ gU.wTime.value = t; grassLOD(); const t0 = performance.now(); for (const k of gDirty){ gDirty.delete(k); buildSquare(k); if (performance.now() - t0 > 6) break; } }   // (about 6 ms of remaking a frame at most, so painting stays smooth)
  const grassAround = (x, z, r) => { for (let a = Math.floor((x - r)/GSQ); a <= Math.floor((x + r)/GSQ); a++) for (let b = Math.floor((z - r)/GSQ); b <= Math.floor((z + r)/GSQ); b++) if (gSquares.has(a + ',' + b)) gDirty.add(a + ',' + b); };

  ANIM.live = true;   // (homes from the save just appear; new ones are painted in)
  // the ghost: the block under the pointer, see-through, and a ring on the ground green or red
  const ghostM = bent(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .55, depthWrite: false }), false);
  const ringM = bent(new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), false);
  ghostM.customProgramCacheKey = () => 'bentGhost'; ringM.customProgramCacheKey = () => 'bentRing';
  const ghost = new THREE.Mesh(blockOf('townhouse', 1, false, false).geo, ghostM); ghost.visible = false;; ghost.frustumCulled = false; ghost.renderOrder = 5; scene.add(ghost);
  const RN = 48, ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((RN + 1)*2*3), 3));
  { const idx = []; for (let i = 0; i < RN; i++){ const a = i*2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); } ringGeo.setIndex(idx); }
  const ring = new THREE.Mesh(ringGeo, ringM); ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 6; scene.add(ring);
  const PL = { kind: null, rot: 0, hit: null, ok: null, ptr: null, onto: null, seed: 1 + PIECES.length*7 + (PIECES.reduce((a, p) => a + (p.seed || 0), 0) % 997), zkind: 'townhouse', zseed: 0 };   // (zkind, zseed: single mode's home)
  PL.zseed = PL.seed + 500;   // (seed: the next home's look; V rolls another)
  const status = document.getElementById('placeStatus');
  // the home under the pointer, if any (its block)
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  const _nm = new THREE.Matrix3();
  function pieceHit(cx, cy){
    if (!pieceMeshes.length) return null;
    const r = canvas.getBoundingClientRect(); _ndc.set((cx - r.left)/r.width*2 - 1, 1 - (cy - r.top)/r.height*2);
    _ray.setFromCamera(_ndc, cam); const h = _ray.intersectObjects(pieceMeshes, false)[0]; if (!h) return null;
    const n = h.face ? h.face.normal.clone().applyMatrix3(_nm.getNormalMatrix(h.object.matrixWorld)).normalize() : new THREE.Vector3(0, 1, 0);
    return { piece: h.object.userData.piece, point: h.point, top: n.y > .6 }; }
  const pieceAt = (cx, cy) => { const h = pieceHit(cx, cy); return h ? h.piece : null; };
  // what the next single home is: in one-by-one mode the picked kind and a fresh look each time; with the homes brush at its
  // smallest (single mode) a kind V steps through and a look that stays put until Shift+V, so the same home goes down again
  const oneHome = () => PL.kind === 'zone' && ZONE.size === 0;
  const curKind = () => oneHome() ? PL.zkind : PL.kind, curSeed = () => oneHome() ? PL.zseed : PL.seed;
  function showGhost(){
    PL.onto = null; PL.side = null; zHide();
    const K = curKind(), S = curSeed(), pre = oneHome() ? 'one home: ' + K + ' (V next) ' : '';
    const say = (t, ok) => { if (status){ status.textContent = pre + t; status.style.color = ok ? '#0f3b4a' : ''; } };
    const hov = K && PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, over = hov && hov.top ? hov.piece : null;
    if (hov && !hov.top){   // against a wall: build off that side, on that floor
      const sp = sideSpot(hov.piece, K, hov.point.x, hov.point.z, S); PL.ok = sp; PL.side = sp.ok ? sp : null;
      ghost.geometry = blockOf(K, S, hov.piece.level > 0, false).geo; ghost.position.set(sp.x, sp.ok ? sp.y : hov.piece.y, sp.z); ghost.rotation.y = sp.rot; ghost.visible = true; ring.visible = false;
      say(sp.ok ? (sp.supports ? 'off the side (far out: it gets supports)' : 'off the side') : sp.why, sp.ok); return; }
    if (over){   // over a home's roof: stack on top of it
      const t = stackTop(over), bS = blockOf(K, S, true, false), yS = t.y + t.top;
      const hitN = t.level < MAXLV - 1 ? blocked(placeHull(bS.hull, t.x, t.z, t.rot), yS, yS + bS.h, [t]) : null;
      const ok = t.level < MAXLV - 1 && !hitN; PL.onto = ok ? t : null; PL.ok = ok ? { ok: true, y: yS } : { ok: false, why: hitN ? 'it would run into a neighbor' : 'as high as it goes' };
      ghost.geometry = bS.geo; ghost.position.set(t.x, t.y + t.top, t.z); ghost.rotation.y = t.rot; ghost.visible = true; ring.visible = false;
      say(ok ? 'stack on top (floor ' + (t.level + 2) + ')' : PL.ok.why, ok); return; }
    const hit = K && PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null; PL.hit = hit;
    if (!hit || hit.sea){ ghost.visible = ring.visible = false; PL.ok = null; say(K ? (hit ? 'not on the sea' : '') : '', false); return; }
    const ck = check(K, hit.x, hit.z, S, PL.rot), r = KINDS[K].rb + .3; PL.ok = ck;
    const y = ck.ok ? ck.y : heightAt(hit.x, hit.z, true);
    ghost.geometry = blockOf(K, S, false, false).geo; ghost.position.set(hit.x, y, hit.z); ghost.rotation.y = PL.rot; ghost.visible = true;
    const a = ringGeo.attributes.position.array;
    for (let i = 0; i <= RN; i++){ const t = i/RN*PI*2, c = Math.cos(t), s = Math.sin(t);
      for (const [j, rr] of [[0, r], [1, r + .14]]){ const x = hit.x + c*rr, z = hit.z + s*rr, o = (i*2 + j)*3; a[o] = x; a[o + 1] = heightAt(x, z) + .07; a[o + 2] = z; } }
    ringGeo.attributes.position.needsUpdate = true; ring.visible = true;
    ringM.color.set(ck.ok ? 0x7dffb0 : 0xff6a5a);
    say(ck.ok ? '' : ck.why, ck.ok);
  }
  function placeHere(){
    if (!PL.ok || !PL.ok.ok) return;
    const K = curKind(), S = curSeed();
    if (PL.side){ const sp = PL.side; addPiece(K, sp.x, sp.z, sp.rot, sp.y, false, S, null, 0, sp.host); }
    else if (PL.onto){ const t = PL.onto; addPiece(K, t.x, t.z, t.rot, t.y + t.top, false, S, t); }
    else addPiece(K, PL.hit.x, PL.hit.z, PL.rot, PL.ok.y, false, S);
    if (!oneHome()) PL.seed++; }
  /* ---------- zone mode: paint homes, the neighborhood generated inside the brush ---------- */
  // The brush is a circle; Q makes it bigger, E smaller. At its smallest it places one home, a little stack at most; as it
  // grows it holds more homes, scattered off any grid (some touching, some a walk apart, so they join every way), and taller
  // stacks, the tallest toward the middle. The layout comes from a seed (V for another) and turns with R; each spot is
  // checked as a home placed alone would be, and the ones that can't go (the sea, a slope, a home already there) are left out.
  // Right click in zone mode clears the homes inside the brush.
  const ZONE = { on: true, size: 2 }, ZSIZE = [0, 2.8, 4.2, 5.8, 7.6, 9.6, 12];
  const ZW = [['townhouse', .35], ['villa', .25], ['tower', .2], ['pods', .2]];
  const zPick = R => { let u = R.f(); for (const [k, w] of ZW){ if ((u -= w) < 0) return k; } return 'townhouse'; };
  let zLayout = null, zKey = '';
  function zoneLayout(){
    const key = PL.seed + ':' + ZONE.size; if (key === zKey) return zLayout; zKey = key;
    const R = rng(Math.imul(PL.seed, 2246822519) ^ ZONE.size*7919), rad = ZSIZE[ZONE.size], out = [];
    const target = ZONE.size === 0 ? 1 : Math.max(2, Math.round(PI*rad*rad/15));
    const maxH = ZONE.size <= 1 ? 2 : ZONE.size <= 3 ? 4 : 6;
    for (let t = 0; t < 400 && out.length < target; t++){
      const kind = zPick(R), rb = KINDS[kind].rb, a = R.r(0, PI*2), q = ZONE.size === 0 ? 0 : Math.sqrt(R.f())*Math.max(0, rad - rb*.6);
      const lx = Math.cos(a)*q, lz = Math.sin(a)*q;
      if (out.some(o => Math.hypot(o.lx - lx, o.lz - lz) < o.rb + rb + R.r(-.1, 2.4))) continue;
      const h = 1 + Math.floor(Math.pow(R.f(), 1.4)*maxH*(1 - .45*q/Math.max(rad, 1))), stack = [];
      for (let k = 1; k < Math.min(h, maxH); k++) stack.push(R.chance(.55) ? kind : zPick(R));
      out.push({ kind, rb, lx, lz, rot: R.chance(.5) ? 0 : R.pick([PI/2, -PI/2, PI, R.r(-.6, .6)]), seed: R.i(1, 1e6), stack });
    }
    return zLayout = out; }
  const zGhosts = [];
  const zGhost = i => { while (zGhosts.length <= i){ const m = new THREE.Mesh(ghost.geometry, ghostM); m.frustumCulled = false; m.renderOrder = 5; m.visible = false; scene.add(m); zGhosts.push(m); } return zGhosts[i]; };
  const zHide = () => { for (const m of zGhosts) m.visible = false; };
  // where each home of the layout lands here, and whether it can go
  function zoneSpots(cx, cz){ const c = Math.cos(PL.rot), s_ = Math.sin(PL.rot);
    return zoneLayout().map(o => { const x = cx + o.lx*c - o.lz*s_, z = cz + o.lx*s_ + o.lz*c; return Object.assign({}, o, { x, z, rot: o.rot + PL.rot, ck: check(o.kind, x, z, o.seed, o.rot + PL.rot) }); }); }
  // How one spot of the layout goes down among the homes already built. Clear ground: as laid out. Landing on a home (the
  // spot's middle inside one): its blocks go on top of that stack, square to it, as many as fit. Not on one but bumping
  // into one: it is set against that home's wall, on the same floor as the home, and rises from there. Returns the column
  // (x, z, rot, and each block's kind, look, floor height), or null if it can't go at all.
  function planSpot(sp){
    const kinds = [sp.kind, ...sp.stack], ck = check(sp.kind, sp.x, sp.z, sp.seed, sp.rot);
    let x = sp.x, z = sp.z, rot = sp.rot, y = 0, base = null, host = null, lv = 0, how = 'ground';
    if (ck.ok) y = ck.y;
    else if (!ck.by) return null;
    else {
      const unders = PIECES.filter(q => inHull(q.hullW, sp.x, sp.z)).map(stackTop).sort((a, b) => (b.y + b.top) - (a.y + a.top));
      if (unders.length){ base = unders[0]; x = base.x; z = base.z; rot = base.rot; y = base.y + base.top; lv = base.level + 1; how = 'stack'; }
      else { const ss = sideSpot(ck.by, sp.kind, sp.x, sp.z, sp.seed); if (!ss.ok) return null;
        x = ss.x; z = ss.z; rot = ss.rot; y = ss.y; host = ss.host; lv = host.level; how = 'side'; } }
    const blocks = [], skip = base ? [base] : [];
    for (let i = 0; i < kinds.length && lv + i < MAXLV; i++){
      const k = kinds[i], sd = sp.seed + i*17, below = i > 0 || !!base || lv > 0, b = blockOf(k, sd, below, i < kinds.length - 1);
      if ((i > 0 || how === 'stack') && blocked(placeHull(b.hull, x, z, rot), y, y + b.h, skip)) break;
      blocks.push({ kind: k, seed: sd, y, below }); y += b.top;
    }
    return blocks.length ? { x, z, rot, base, host, how, blocks } : null; }
  function showZoneGhost(){
    zHide(); ghost.visible = false;
    const hit = PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null; PL.hit = hit;
    if (!hit || hit.sea){ ring.visible = false; PL.ok = null; if (status) status.textContent = hit ? 'not on the sea' : ''; return; }
    let gi = 0, n = 0, ns = 0, nd = 0;
    for (const sp of zoneSpots(hit.x, hit.z)){ const P = planSpot(sp); if (!P) continue; n++; if (P.how === 'stack') ns++; else if (P.how === 'side') nd++;
      P.blocks.forEach((bk, i) => { const m = zGhost(gi++); m.geometry = blockOf(bk.kind, bk.seed, bk.below, i < P.blocks.length - 1).geo; m.position.set(P.x, bk.y, P.z); m.rotation.y = P.rot; m.visible = true; }); }
    PL.ok = n ? { ok: true } : { ok: false, why: 'no room here' };
    const r = Math.max(ZSIZE[ZONE.size], 1.4), a = ringGeo.attributes.position.array;
    for (let i = 0; i <= RN; i++){ const t = i/RN*PI*2, c = Math.cos(t), s_ = Math.sin(t);
      for (const [j, rr] of [[0, r], [1, r + .18]]){ const x = hit.x + c*rr, z = hit.z + s_*rr, o = (i*2 + j)*3; a[o] = x; a[o + 1] = heightAt(x, z) + .07; a[o + 2] = z; } }
    ringGeo.attributes.position.needsUpdate = true; ring.visible = true; ringM.color.set(n ? 0x7dffb0 : 0xff6a5a);
    if (status){ status.textContent = 'brush ' + ZONE.size + ': ' + n + ' homes' + (ns ? ', ' + ns + ' on top of homes' : '') + (nd ? ', ' + nd + ' against homes' : '') + (n ? '' : ': no room here'); status.style.color = n ? '#0f3b4a' : ''; }
  }
  function placeZone(){
    if (!PL.hit || PL.hit.sea) return;
    for (const sp of zoneSpots(PL.hit.x, PL.hit.z)){
      const P = planSpot(sp); if (!P) continue;   // (planned again for each: an earlier home of this layout may now be there)
      const col = []; let p = null;
      P.blocks.forEach((bk, i) => { p = i === 0 ? addPiece(bk.kind, P.x, P.z, P.rot, bk.y, true, bk.seed, P.base, 0, P.host) : addPiece(bk.kind, P.x, P.z, P.rot, p.y + p.top, true, bk.seed, p); col.push(p); });
      // now and then a room reaches out off the side of a tall stack, a floor or two up
      const R = rng(sp.seed*7 + 3);
      if (col.length >= 3 && R.chance(.45)){ const host = col[R.i(1, col.length - 2)], kind = R.pick(['townhouse', 'villa', host.kind]), a = host.rot + R.i(0, 3)*PI/2;
        const ss = sideSpot(host, kind, host.x + Math.sin(a)*5, host.z + Math.cos(a)*5, sp.seed + 991); if (ss.ok) addPiece(kind, ss.x, ss.z, ss.rot, ss.y, true, sp.seed + 991, null, 0, host); }
    }
    save(); PL.seed++; }
  function clearZone(cx, cz){ const r = Math.max(ZSIZE[ZONE.size], 1.4);
    for (const p of PIECES.filter(q => !q.level && Math.hypot(q.x - cx, q.z - cz) < r)) removePiece(p); }
  function setMode(zone){
    ZONE.on = zone; document.querySelectorAll('.place .single').forEach(b => { b.hidden = zone; }); document.querySelectorAll('.place .zone').forEach(b => { b.hidden = !zone; });
    const mb = document.getElementById('modeBtn'); if (mb) mb.textContent = zone ? 'mode: zone' : 'mode: one by one';
    if (PL.kind) setKind(PL.kind); zHide(); }
  document.getElementById('modeBtn') && document.getElementById('modeBtn').addEventListener('click', () => setMode(!ZONE.on));
  function setKind(k){
    PL.kind = PL.kind === k ? null : k; CN.a = null; connGhost.visible = false;
    document.querySelectorAll('.place button[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === PL.kind));
    const tool = PL.kind === 'connect' || PL.kind === 'grass';
    document.querySelectorAll('.place .tip').forEach(t => { t.style.display = tool ? (t.classList.contains('t-' + PL.kind) ? '' : 'none') : (t.classList.contains('t-connect') || t.classList.contains('t-grass') ? 'none' : ''); });
    ghost.visible = ring.visible = false; zHide();
    if (!PL.kind && status) status.textContent = '';
  }
  // a ring round (x, z): on the ground, or at height y
  function ringAt(x, z, r, y = null, w = .14){ const a = ringGeo.attributes.position.array;
    for (let i = 0; i <= RN; i++){ const t = i/RN*PI*2, c = Math.cos(t), s_ = Math.sin(t);
      for (const [j, rr] of [[0, r], [1, r + w]]){ const px = x + c*rr, pz = z + s_*rr, o = (i*2 + j)*3; a[o] = px; a[o + 1] = (y === null ? heightAt(px, pz) : y) + .07; a[o + 2] = pz; } }
    ringGeo.attributes.position.needsUpdate = true; ring.visible = true; }

  /* ---------- the connect brush: a walk, a bridge, an arcade or a shared wall between two blocks you pick ---------- */
  // Click one block, then another: what joins them is shown, and a click builds it. V steps through the kinds; the last,
  // random, lets each connection choose what suits it (see linkType). Right click: let go of the first block, or, over a
  // block, take away the connections built to it.
  const CN = { a: null, type: 0, key: '', ok: false };
  const connGhost = new THREE.Mesh(new THREE.BufferGeometry(), ghostM); connGhost.visible = false; connGhost.frustumCulled = false; connGhost.renderOrder = 5; scene.add(connGhost);
  function showConnect(){
    ghost.visible = false; zHide();
    const hov = PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, P = hov ? hov.piece : null, tn = LINK_TYPES[CN.type];
    const say = (t, ok) => { if (status){ status.textContent = 'connect: ' + tn + ' (V next) ' + t; status.style.color = ok ? '#0f3b4a' : ''; } };
    if (!CN.a){ connGhost.visible = false; CN.ok = false;
      if (P){ ringAt(P.x, P.z, KINDS[P.kind].rb + .35, P.level ? P.y : null); ringM.color.set(0x7dffb0); } else ring.visible = false;
      say(P ? '· click to pick this one' : '· pick the first block', !!P); return; }
    const A = CN.a; ringAt(A.x, A.z, KINDS[A.kind].rb + .35, A.level ? A.y : null); ringM.color.set(0xffd27a);
    if (!P || P === A){ connGhost.visible = false; CN.ok = false; say('· now pick the second block', false); return; }
    const L = pairOf(A, P), why = !L ? 'they overlap' : L.gap < -.2 ? 'they overlap' : null;   // (no limit on how far: long spans get piers)
    CN.ok = !why;
    if (why){ connGhost.visible = false; say('· ' + why, false); return; }
    const key = A.id + '|' + P.id + '|' + CN.type;
    if (key !== CN.key){ CN.key = key; const T = new Tris(); L.user = true; L.type = LINK_TYPES[CN.type]; drawLink(T, L, []); connGhost.geometry.dispose(); connGhost.geometry = T.geo(); }
    connGhost.visible = true; say('· click to build it', true); }
  function placeConnect(){
    const hov = PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, P = hov ? hov.piece : null;
    if (!CN.a){ if (P){ CN.a = P; CN.key = ''; } return; }
    if (!P || P === CN.a || !CN.ok) return;
    const a = CN.a.id, b = P.id; ULINKS = ULINKS.filter(u => !((u.a === a && u.b === b) || (u.a === b && u.b === a))); ULINKS.push({ a, b, type: LINK_TYPES[CN.type] });
    saveLinks(); linksDirty = true; CN.a = null; CN.key = ''; connGhost.visible = false; }
  function unConnect(cx, cy){
    if (CN.a){ CN.a = null; connGhost.visible = false; return; }
    const P = pieceAt(cx, cy); if (!P) return; const n = ULINKS.length; ULINKS = ULINKS.filter(u => u.a !== P.id && u.b !== P.id); if (ULINKS.length !== n){ saveLinks(); linksDirty = true; } }

  /* ---------- the grass brush ---------- */
  // Click or drag to paint foliage, right click or right drag to clear it; Q bigger, E smaller; V steps through the kinds.
  const GR = { size: 2, style: 4, last: null }, GRS = [.6, 1.1, 1.8, 2.8, 4.2, 6];
  function showGrass(){
    ghost.visible = false; zHide(); connGhost.visible = false;
    const hit = PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null; PL.hit = hit;
    if (!hit || hit.sea){ ring.visible = false; if (status) status.textContent = 'grass: ' + GSTYLES[GR.style] + (hit ? ' · not on the sea' : ''); return; }
    ringAt(hit.x, hit.z, GRS[GR.size], null, .12); ringM.color.set(0xb8e08a);
    if (status){ status.textContent = 'grass: ' + GSTYLES[GR.style] + ' (V next) · brush ' + (GR.size + 1); status.style.color = '#0f3b4a'; } }
  function grassStroke(cx, cy, erase, force){
    const h = pick(cx, cy); if (!h || h.sea) return; const r = GRS[GR.size];
    if (!force && GR.last && Math.hypot(h.x - GR.last[0], h.z - GR.last[1]) < r*.35) return;
    GR.last = [h.x, h.z]; paintGrass(h.x, h.z, r, GR.style, erase); }
  document.querySelectorAll('.place button[data-k]').forEach(b => b.addEventListener('click', () => setKind(b.dataset.k)));
  setMode(true);

  /* ---------- turning, zooming, panning, tilting: as in the sky city; a click places, a right click removes ---------- */
  const ptrs = new Map(); let act = null, pinch0 = 0, zoom0 = 0, pinchX = 0;
  const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const pmidX = () => { const [a, b] = [...ptrs.values()]; return (a.x + b.x)/2; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2){ act = { kind: 'pinch' }; pinch0 = pdist(); zoom0 = zoomT; pinchX = pmidX(); return; }
    act = { kind: 'turn', b: e.button, x: e.clientX, y: e.clientY, moved: false };
    // the grass brush paints (left) or clears (right) as it's dragged; Alt+drag or the middle button still turns the view
    if (PL.kind === 'grass' && (e.button === 0 || e.button === 2) && !e.altKey && e.pointerType !== 'touch'){ act = { kind: 'paint', erase: e.button === 2 }; GR.last = null; grassStroke(e.clientX, e.clientY, act.erase, true); }
  });
  canvas.addEventListener('pointermove', e => {
    PL.ptr = { x: e.clientX, y: e.clientY };
    const p = ptrs.get(e.pointerId); if (!p || !act) return;
    if (act.kind === 'paint'){ ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); grassStroke(e.clientX, e.clientY, act.erase, false); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), ZMIN, ZMAX); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    if (act.moved){ yawT -= dx*.008; if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointerleave', () => { PL.ptr = null; });
  const endPtr = e => {
    if (act && act.kind === 'turn' && !act.moved && ptrs.has(e.pointerId)){
      if ((act.b === 0 || e.pointerType === 'touch') && PL.kind){ PL.ptr = { x: e.clientX, y: e.clientY };
        if (PL.kind === 'connect'){ showConnect(); placeConnect(); }
        else if (PL.kind === 'grass') grassStroke(e.clientX, e.clientY, false, true);
        else if (PL.kind === 'zone' && !oneHome()){ showZoneGhost(); placeZone(); } else { showGhost(); placeHere(); } }
      else if (act.b === 2 && PL.kind === 'connect') unConnect(e.clientX, e.clientY);
      else if (act.b === 2){ if (PL.kind === 'zone' && !oneHome()){ const h = pick(e.clientX, e.clientY); if (h) clearZone(h.x, h.z); } else { const p = pieceAt(e.clientX, e.clientY); if (p) removePiece(p); } }
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
    if ('1234'.includes(e.key) && e.key.length === 1){ if (ZONE.on) setKind('zone'); else setKind(KIND_KEYS[+e.key - 1]); return; }
    if (e.key === '5'){ setKind('connect'); return; }
    if (e.key === '6'){ setKind('grass'); return; }
    if (PL.kind === 'grass' && (k === 'q' || k === 'e')){ GR.size = clamp(GR.size + (k === 'q' ? 1 : -1), 0, GRS.length - 1); return; }
    if (PL.kind === 'grass' && k === 'v'){ GR.style = (GR.style + 1) % GSTYLES.length; return; }
    if (PL.kind === 'connect' && k === 'v'){ CN.type = (CN.type + 1) % LINK_TYPES.length; CN.key = ''; return; }
    if (k === 'z'){ setMode(!ZONE.on); return; }
    if (PL.kind === 'zone' && (k === 'q' || k === 'e')){ ZONE.size = clamp(ZONE.size + (k === 'q' ? 1 : -1), 0, ZSIZE.length - 1); return; }   // (Q: a bigger brush, E: a smaller one)
    if (k === 'v'){   // (single mode: the next kind of home, Shift+V another look of it; otherwise another look or layout)
      if (oneHome()){ if (e.shiftKey) PL.zseed++; else PL.zkind = KIND_KEYS[(KIND_KEYS.indexOf(PL.zkind) + 1) % KIND_KEYS.length]; } else PL.seed++; return; }
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
  reflM.onBeforeCompile = sh => { sh.uniforms.nightK = CURV.nightK;   // (by night the lit windows show in the water, warm)
    sh.vertexShader = GLOW_V + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = glow;');
    sh.fragmentShader = 'uniform float nightK;\n' + GLOW_F + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vGlow > 0.85 ? vec3(1.0, 0.85, 0.46) : vec3(1.0, 0.6, 0.28), step(0.01, vGlow)*nightK);\n#include <fog_fragment>'); };
  renderer.localClippingEnabled = true;
  function renderRefl(){
    const hide = [sea, spray, ghost, ring, connGhost, ...gSquares.values(), ...pieceMeshes.map(m => m.userData.fol).filter(Boolean), ...(linksMesh ? linksMesh.children : []), ...zGhosts, ...(poolMesh ? [poolMesh] : []), ...BLOOMS], vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
    scene.overrideMaterial = reflM; scene.scale.y = -1; scene.updateMatrixWorld(true);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = true;
    scene.overrideMaterial = null; scene.scale.y = 1; scene.updateMatrixWorld(true); hide.forEach((o, i) => { o.visible = vis[i]; });
  }
  setHour(11); resize();
  updateCamera(0); stream(1e9);   // (the first view whole, before the first frame)
  // compile now, while loading, every shader that would otherwise first be needed in play (the paint-in, the pigment
  // blooms, the night's light pools and glow bleed): a shader compiled mid-play stalls the frame
  { const g = blockOf('townhouse', 1, false, false).geo, tmp = [...PAINT_POOL.map(pm => new THREE.Mesh(g, pm.mat)), new THREE.Mesh(g, poolM), new THREE.Mesh(g, grassM)];
    for (const m of tmp){ m.visible = false; scene.add(m); } renderer.compile(scene, cam); for (const m of tmp) scene.remove(m);
    for (const m of [extractM, blurM]){ postQ.material = m; renderer.compile(postScene, skyCam); } renderer.compile(blitScene, skyCam); }
  const t0 = performance.now(), TOFF = { v: 0 }; let last = t0;   // (TOFF: a test hook, to look at the sea at a given moment)
  function frame(now){
    const dt = Math.min(.1, (now - last)/1000); last = now;
    updateCamera(dt); stream(6);
    if (PL.kind === 'connect') showConnect(); else if (PL.kind === 'grass') showGrass(); else if (PL.kind === 'zone' && !oneHome()) showZoneGhost(); else if (PL.kind) showGhost();
    animTick(dt);
    if (linksDirty && !ANIM.list.length) buildLinks();
    const t = TOFF.fix !== undefined ? TOFF.fix : (now - t0)/1000 + TOFF.v; seaU.time.value = t; sprayTick(dt, t); grassTick(t);
    foamStep(dt); renderRefl();
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(skyScene, skyCam);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam);
    renderer.autoClear = true; glowPass();
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(blitScene, skyCam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.COAST = { seaU, TOFF, WAVE, ANIM, scene, renderer, cam, screenOf(x, y, z){ const v = new THREE.Vector3(x, y, z).project(cam), r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1)/2*r.width, r.top + (1 - v.y)/2*r.height]; }, ULINKS: () => ULINKS, paintGrass, tufts, GR, CN, buildSquare, folGeo, get t0(){ return t0; }, setHour, heightAt, coastX, pick, PIECES,
    get state(){ return { yaw, zoom, pitch, x: camT.x, z: camT.z, k: V.k, gH: V.gH, chunks: chunks.size, built: [...chunks.values()].filter(c => c.mesh).length }; },
    go(o){ if (o.yaw !== undefined) yaw = yawT = o.yaw; if (o.zoom !== undefined) zoom = zoomT = o.zoom; if (o.pitch !== undefined) pitch = pitchT = o.pitch;
      if (o.x !== undefined) camGoal.x = camT.x = o.x; if (o.z !== undefined) camGoal.z = camT.z = o.z; },
    place(kind, x, z, rot = 0, seed = 1){ const ck = check(kind, x, z, seed, rot); return ck.ok ? addPiece(kind, x, z, rot, ck.y, false, seed) : ck; },
    stack(onto, kind, seed = 1){ const t = stackTop(onto); return t.level < MAXLV - 1 ? addPiece(kind, t.x, t.z, t.rot, t.y + t.top, false, seed, t) : null; },
    side(host, kind, ang, seed = 1){ const ss = sideSpot(host, kind, host.x + Math.sin(host.rot + ang)*5, host.z + Math.cos(host.rot + ang)*5, seed); return ss.ok ? addPiece(kind, ss.x, ss.z, ss.rot, ss.y, false, seed, null, 0, host) : ss; },
    clear(){ while (PIECES.length) removePiece(PIECES[0]); } };
})();
