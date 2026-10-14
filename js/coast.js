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
  renderer.shadowMap.autoUpdate = false;
const PROF = { on: false, acc: {}, n: 0, calls: 0, tris: 0 };   // (a test hook: time per part of the frame)
    const SHD = { dirty: true, key: '' };   // (set dirty wherever something that casts a shadow comes, goes or changes)   // (the shadow map is redrawn only when the light, the view's shadow box or what casts changes: see shadowTick)
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
    hzNear: { value: 30 }, hzFar: { value: 60 }, hzMax: { value: .82 }, hazeC: { value: new THREE.Color(0xbfe4e3) }, nightK: { value: 0 }, darkK: { value: 0 }, gTime: { value: 0 }, uShopA: { value: new THREE.Color(.96, .52, .82) }, uShopB: { value: new THREE.Color(1.0, .48, .7) }, uShopC: { value: new THREE.Color(.92, .56, .5) }, uRip: { value: [...Array(8)].map(() => new THREE.Vector3(0, 0, -99)) } };   // (nightK: the lamps; darkK: full night only; gTime: seconds, for the water's glow)

  // The shops' light by night, set apart from the homes' gold: each shop is lit in one of three, picked by its seed, so a
  // market is a mix of them. The windows take the first color; the light on the ground runs from the second (its heart) to
  // the third (its rim).
  //   1 plum-rose: pushed toward magenta-rose, warm but nothing like gold
  //   2 fuchsia: a warm lantern pink
  //   3 peach: a lantern rose-peach
  const SHOPLIGHTS = [[[.96, .52, .82], [.98, .58, .8], [.78, .3, .66]], [[1.0, .48, .7], [1.0, .56, .66], [.84, .3, .6]], [[.92, .56, .5], [.95, .62, .52], [.86, .38, .46]]];
  const shopOf = (kind, seed) => COM(kind) ? 1 + (Math.imul(seed | 0, 2654435761) >>> 0) % 3 : 0;  const BEND = `{ vec4 wq = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wq = instanceMatrix * wq;   // (a copy's own place in the world: the watercolor shadow is looked up there)
    #endif
    wq = modelMatrix * wq; float gq = dot(wq.xz - ctr, fwd); vG = gq; float gp = max(gq - g0, 0.0); transformed.y -= curveK*gp*gp; vWq = wq.xyz; }`;
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
  // One ring wave from a touch at c, age seconds ago: a fake of the real thing (the Cauchy-Poisson ring wave on deep water),
  // not a simulation. A packet of a few crests whose envelope spreads at the group speed cg while the crests themselves run
  // at twice that (born at the back of the packet, gone at its front), stretching longer as it travels (longer waves are
  // faster), weaker as 1/sqrt(r) as it spreads and dying away with time. Adds its height to h; returns how much it shears
  // the water there (the slope of the passing wave, |dh/dt|), which is what makes plankton glow.
  const GLOW_F = `varying float vGlow; uniform float gTime; uniform vec3 uRip[8], uShopA, uShopB, uShopC;
  vec3 shopLight(float v){ return v < 0.135 ? uShopA : v < 0.165 ? uShopB : uShopC; }
  float ripW(vec2 q, vec2 c, float age, float amp, inout float h){
    if (age <= 0.0 || age > 3.2) return 0.0;
    float r = length(q - c), cg = 0.42, R = 0.05 + cg*age, w = 0.16 + 0.14*age;
    float x = (r - R)/(r < R ? w : w*0.35), env = exp(-x*x);
    float kk = 22.0/(1.0 + 0.8*age), ph = kk*(r - 2.0*cg*age), d = amp*env*exp(-0.9*age)/sqrt(1.0 + 3.0*r);
    h += sin(ph)*d; return pow(abs(cos(ph)), 6.0)*d; }
`;
  const GLOW_APPLY = `if (vGlow > 0.0){ vec3 amber = vec3(1.0, 0.5, 0.2), lampY = vec3(1.0, 0.87, 0.47);
      float lamp = step(0.85, vGlow), sh = 0.74 + 0.26*abs(normalize(vNormal).x), k = nightK*(lamp > 0.5 ? 1.0 : 0.85);
      vec3 gc;
      if (lamp > 0.5) gc = lampY*1.04;
      else if (vGlow > 0.2 && vGlow < 0.3) gc = vColor*1.25;
      else if (vGlow > 0.1 && vGlow < 0.2){ gc = shopLight(vGlow)*(0.9 + 0.12*sh); k = nightK; }   // (.12, .15, .18: a shop's windows, in plum-rose, fuchsia or peach)
      else if (vGlow > 0.3 && vGlow < 0.4){
        // water, alive by night: dark and still, but stirred here and there (each 2.2-unit cell has its own moment and pace;
        // some stay quiet) and wherever the pointer passes; each stir sends out a ring wave (ripW), and the plankton light up
        // where it shears the water, with single sparks flashing in the stirred places and a rare twinkle anywhere. The glow
        // is stepped into a few washes, so it stays watercolor. By day the same waves only shade the water a little.
        vec2 q = vWq.xz, c0 = floor(q/2.2); float g = 0.0, hh = 0.0;
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++){
          vec2 c = c0 + vec2(float(i), float(j));
          float h1 = fract(sin(dot(c, vec2(127.1, 311.7)))*43758.5), h2 = fract(sin(dot(c, vec2(269.5, 183.3)))*43758.5);
          float per = 6.0 + 6.0*h1, age = mod(gTime + h2*per, per);
          if (h2 < 0.6) g += ripW(q, (c + 0.2 + 0.6*vec2(h1, h2))*2.2, age, 0.75, hh); }
        for (int i = 0; i < 8; i++) g += ripW(q, uRip[i].xy, gTime - uRip[i].z, 1.0, hh);
        vec2 sc = floor(q*22.0); float sn = fract(sin(dot(sc + floor(gTime*7.0)*vec2(1.7, 3.1), vec2(12.9898, 78.233)))*43758.5);
        g *= 3.5;   // (the plankton's gain: a gentle stir lights them well)
        float spark = step(0.88, sn)*smoothstep(0.12, 0.5, g) + step(0.997, sn)*0.45;
        float gs = floor(min(g, 1.2)*4.0 + 0.4)/4.0;
        gc = vec3(0.05, 0.13, 0.17) + vec3(0.36, 0.9, 0.7)*gs + vec3(0.78, 1.0, 0.88)*spark*0.85;
        gl_FragColor.rgb *= 1.0 + hh*0.22*(1.0 - nightK);
        k = nightK; }
      else gc = vGlow > 0.6 ? lampY*0.95*sh : mix(amber, vColor*vec3(0.9, 0.75, 0.45), 0.18)*sh;   // (.7: a tower's glass rooms, lit like windows)
      // (windows and lamps: warm yellow; the glass up top: orange, still shaded by its facets; .25: lit in its own color, for
      // neon, screens, red lanterns; .35: water, lit softly from within)
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gc, k); }`;
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
  // The wind, as it moves over a liquid (Paquier, Moisy and Rabaud's "turbulent windprint"; cat's paws): below the onset of
  // waves, gusts only wrinkle the surface, in disordered streaks drawn out along the wind and carried downwind with it;
  // where a gust is strong enough, a patch of regular ripples grows (the shear instability), crests across the wind,
  // running downwind, and fades as the gust passes. The grass is treated as that liquid: windPaw() is the strength of the
  // gust at a place (0 calm, 1 a full cat's paw), and windCrest() the ripple crests inside it. Both the sway and the glow
  // by night follow them, so what glows is what the wind is stirring.
  const WIND_GLSL = `
    float wHn(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float wVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(wHn(i), wHn(i + vec2(1.0, 0.0)), f.x), mix(wHn(i + vec2(0.0, 1.0)), wHn(i + vec2(1.0, 1.0)), f.x), f.y); }
    float windPaw(vec2 q, float t){ vec2 wd = vec2(0.83, 0.55), wn = vec2(-0.55, 0.83);
      vec2 p = vec2(dot(q, wd) - t*1.5, dot(q, wn));   // (carried downwind)
      float n = 0.62*wVn(p*vec2(0.1, 0.24) + vec2(0.0, t*0.04)) + 0.38*wVn(p*vec2(0.23, 0.52) + vec2(t*0.09, 5.3));   // (drawn out along the wind; slowly changing)
      return smoothstep(0.44, 0.76, n); }
    float windCrest(vec2 q, float t){ return 0.5 + 0.5*sin(dot(q, vec2(0.83, 0.55))*5.5 - t*4.2 + 1.3*wVn(q*0.9)); }
    // the glow's own touch of it: small gusts that live only a moment (born, carried a little way downwind, gone), and in
    // each a single thin slice of light across the wind, fading gently in and out
    float windGlint(vec2 q, float t){ vec2 wd = vec2(0.83, 0.55), wn = vec2(-0.55, 0.83);
      vec2 p = vec2(dot(q, wd) - t*0.9, dot(q, wn));
      float life = 0.5 + 0.5*sin(t*1.7 + 6.2831*wVn(floor(p*vec2(0.2, 0.3)) + 3.1)), n = wVn(p*vec2(0.2, 0.3) + vec2(t*0.3, 0.0));   // (each patch has its own short life)
      float gp = smoothstep(0.52, 0.8, n)*smoothstep(0.3, 0.9, life);   // (not 'patch': a reserved word in GLSL)
      float slice = pow(0.5 + 0.5*sin(dot(q, wd)*4.0 - t*2.2), 10.0);   // (thin: a slice, not a band)
      return gp*slice; }
  `;
  const SWAY_V = 'attribute float aH; attribute vec3 aG; uniform float wTime; varying float vGl; varying vec3 vGc;\n' + WIND_GLSL;
  const SWAY = `{ vec2 wd = vec2(0.83, 0.55); vec4 wq_ = vec4(transformed, 1.0); float sc_ = 1.0;
      #ifdef USE_INSTANCING
        wq_ = instanceMatrix*wq_; sc_ = length(instanceMatrix[0].xyz);
      #endif
      vec2 q = (modelMatrix*wq_).xz; float ph = dot(q, wd)*0.32 - wTime*1.25;
      float paw = windPaw(q, wTime), crest = windCrest(q, wTime);
      float gust = 0.3 + 0.3*sin(ph) + 0.12*sin(ph*2.3 + q.x*0.7 - q.y*0.4) + 0.75*paw*(0.75 + 0.25*crest);
      vGc = aG; vGl = windGlint(q, wTime)*smoothstep(0.08, 0.5, aH);   // (the tips glow, in a thin slice where a passing gust touches)
      float flut = sin(wTime*4.1 + q.x*3.1 + q.y*2.3) + 0.5*sin(wTime*6.3 + q.x*5.0 - q.y*4.1);
      float hw = aH*sc_, hk = min(hw, 0.8), k = hk*hk;   // (the bend tops out at a tall grass's height: a tree's crown sways, its trunk stays put)
      vec2 d = wd*(0.08 + 0.3*gust*gust)*k + vec2(-wd.y, wd.x)*flut*0.035*k;
      vec3 dl = vec3(d.x, -dot(d, d)*0.55/max(hw, 0.05), d.y);
      #ifdef USE_INSTANCING
        dl = (dl*mat3(instanceMatrix))/(sc_*sc_);   // (back into the copy's own frame)
      #endif
      transformed += dl; }`;
  // bend any built-in material the same way (and haze it toward the horizon, unless it's only drawn into the shadow map)
  function bent(mat, haze = true, rocky = false, glow = false, paint = null, sway = null){
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CURV); if (paint) Object.assign(sh.uniforms, paint); if (sway) Object.assign(sh.uniforms, sway);
      sh.vertexShader = 'uniform vec2 ctr, fwd; uniform float curveK, g0; varying float vG; varying vec3 vWq;\n' + (glow ? GLOW_V : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BEND + (glow ? '\n vGlow = glow;' : ''));
      if (sway){ sh.vertexShader = SWAY_V + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY);
        // (by night, the wind's glow: stepped into a few washes, faint)
        sh.fragmentShader = 'varying float vGl; varying vec3 vGc;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb += vGc*(floor(vGl*3.0 + 0.35)/3.0)*0.75*nightK;\n#include <fog_fragment>');
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
  { const ob = landDepth.onBeforeCompile; landDepth.onBeforeCompile = sh => { ob(sh);   // (a land patch's skirts are in its own mesh, marked: they cast no shadow)
      sh.vertexShader = 'attribute float skirt; varying float vSk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSk = skirt;');
      sh.fragmentShader = 'varying float vSk;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (vSk > 0.5) discard;'); };
    landDepth.customProgramCacheKey = () => 'bentDepthSk'; }

  // a growing list of flat-shaded, colored triangles; props are merged into it
  // (what glows by night is known by its color: GLOW maps a palette color to how it glows; dark window glass is lit in about
  // half the windows, picked by the window's position, so a window never flips when other homes or links are built)
  const GLOW = new Map(), LEAFC = new Set();
  class Tris {
    constructor(fol = false, shop = false){ this.p = []; this.c = []; this.gl = null; this.k = 0; this.fol = fol ? [] : null; this.shop = shop; }
    append(o){ const n0 = this.p.length/3; for (let i = 0; i < o.p.length; i++){ this.p.push(o.p[i]); this.c.push(o.c[i]); }
      if (o.gl) for (let i = 0; i < o.gl.length; i += 3) (this.gl || (this.gl = [])).push(o.gl[i] + n0, o.gl[i + 1], o.gl[i + 2]);
      if (o.fol && this.fol) for (const f of o.fol) this.fol.push(f); }
    glowRun(n0, col){ let v = GLOW.get(col); if (v === undefined) return;
      if (v < 0){ const P = this.p, n1 = this.p.length/3; let x = 0, y = 0, z = 0; for (let i = n0; i < n1; i++){ x += P[i*3]; y += P[i*3 + 1]; z += P[i*3 + 2]; } const k = n1 - n0;
        v = hash2(Math.round(x/k*8)*73856093 ^ Math.round(z/k*8)*19349663, Math.round(y/k*8)) < -v ? .9 : 0; }   // (lit or not by where the window is: the same window stays lit whatever else is built)
      if (v && this.shop && !(v > .2 && v < .4)) v = .09 + .03*this.shop;   // (a shop: its windows and glass lit in its own light (.12, .15, .18), not the homes' gold)
      if (v) (this.gl || (this.gl = [])).push(n0, this.p.length/3 - n0, v); }
    add(geo, m, col){
      if (this.remap){ const c2 = this.remap.get(col); if (c2) col = c2; }   // (a building's own shade of a shared color)
      // (on a home or a link, a leafy blob isn't drawn as a blob: it's noted, where it is and its size and shape, and grown
      // as real foliage instead; see folGeo)
      if (this.fol && LEAFC.has(col) && (geo === GEO.ico || geo === GEO.cone8)){ const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        this.fol.push([geo === GEO.cone8 ? 3 : sy > sx*1.5 ? 2 : sx > .38 ? 1 : 0, e[12], e[13], e[14], sx, sy, sz]); return; }
      const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); const a = g.attributes.position.array, n0 = this.p.length/3;
      for (let i = 0; i < a.length; i += 3){ this.p.push(a[i], a[i + 1], a[i + 2]); this.c.push(col.r, col.g, col.b); } g.dispose(); this.glowRun(n0, col); }
    quad(a, b, c, d, col){ if (this.remap){ const c2 = this.remap.get(col); if (c2) col = c2; } const n0 = this.p.length/3; for (const v of [a, b, c, a, c, d]){ this.p.push(v[0], v[1], v[2]); this.c.push(col.r, col.g, col.b); } this.glowRun(n0, col); }
    geo(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals();
      if (this.gl){ const a = new Float32Array(this.p.length/3); for (let i = 0; i < this.gl.length; i += 3) a.fill(this.gl[i + 2], this.gl[i], this.gl[i] + this.gl[i + 1]); g.setAttribute('glow', new THREE.BufferAttribute(a, 1)); }
      return g; }
    mesh(mat = landM){ const m = new THREE.Mesh(this.geo(), mat); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = landDepth; m.matrixAutoUpdate = false; m.frustumCulled = true; return m; }
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
        // (the leveled ground under a piece keeps the meadow's color: its own stone base covers what's under it, and a pale
        // circle of packed earth wider than the building showed round its edges as patches)
        if (slope > .9 && sp < 4 && y < .2 + .15*n1(z*1.7)) cc = PAL.algae;                // (the tide line: weed on the wet rock)
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
    // (the land's triangles written straight into typed arrays, each with its flat normal worked out here: building them
    // through growing arrays and letting three work out the normals took most of a chunk's time)
    const NV = CN*CN*6, LP = new Float32Array(NV*3), LC = new Float32Array(NV*3), LN = new Float32Array(NV*3); let w = 0;
    const tri = (A, B, C2) => { const ax = pos[A*3], ay = pos[A*3 + 1], az = pos[A*3 + 2], bx = pos[B*3], by = pos[B*3 + 1], bz = pos[B*3 + 2], cx = pos[C2*3], cy = pos[C2*3 + 1], cz = pos[C2*3 + 2];
      const ux = cx - bx, uy = cy - by, uz = cz - bz, vx = ax - bx, vy = ay - by, vz = az - bz;
      let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let q = 0; q < 3; q++){ const v = q === 0 ? A : q === 1 ? B : C2; LP[w] = pos[v*3]; LP[w + 1] = pos[v*3 + 1]; LP[w + 2] = pos[v*3 + 2]; LC[w] = col[v*3]; LC[w + 1] = col[v*3 + 1]; LC[w + 2] = col[v*3 + 2]; LN[w] = nx; LN[w + 1] = ny; LN[w + 2] = nz; w += 3; } };
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++){ const a = j*VN + i, b = a + 1, c2 = a + VN, d = c2 + 1; tri(a, c2, b); tri(b, c2, d); }
    // skirts down from the edges, both ways round, so a coarser neighbor never leaves a crack
    const skirt = (a, b) => { const A = [pos[a*3], pos[a*3 + 1], pos[a*3 + 2]], B = [pos[b*3], pos[b*3 + 1], pos[b*3 + 2]], A2 = [A[0], A[1] - 3, A[2]], B2 = [B[0], B[1] - 3, B[2]], cl = new THREE.Color(col[a*3], col[a*3 + 1], col[a*3 + 2]);
      SK.quad(A, B, B2, A2, cl); SK.quad(A, A2, B2, B, cl); };
    const SK = new Tris(), BT = new Tris();   // (skirts: their own mesh, which casts no shadow; a skirt showing on a cliff face shadowed it in a dotted line)
    for (let i = 0; i < CN; i++){ skirt(i, i + 1); skirt(CN*VN + i, CN*VN + i + 1); skirt(i*VN, (i + 1)*VN); skirt(i*VN + CN, (i + 1)*VN + CN); }
    const near = (x, z, m) => pads.some(p => Math.hypot(x - p.x, z - p.z) < p.r + m);
    // (no bushes: the land is left open for homes and painted foliage)
    const ns = SK.p.length/3, NT = NV + ns, P2 = new Float32Array(NT*3), C2 = new Float32Array(NT*3), N2 = new Float32Array(NT*3), S2 = new Float32Array(NT);
    P2.set(LP); C2.set(LC); N2.set(LN); P2.set(SK.p, NV*3); C2.set(SK.c, NV*3); for (let v = NV; v < NT; v++){ N2[v*3 + 1] = 1; S2[v] = 1; }   // (skirts lit like the ground)
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(P2, 3)); lg.setAttribute('color', new THREE.BufferAttribute(C2, 3)); lg.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); lg.setAttribute('skirt', new THREE.BufferAttribute(S2, 1));
    const m = new THREE.Mesh(lg, landM); m.castShadow = m.receiveShadow = true; m.customDepthMaterial = landDepth; m.matrixAutoUpdate = false; m.frustumCulled = true;
    // (the skirts are in the land mesh itself, above)
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
      // (faked, not solved: the look of shoaling from plain curves of depth, which cost a few multiplies where the real
      // dispersion relation took a tanh, two pows and a sinh per wave per vertex. In the shallows the crests bunch up
      // (k grows), the wave stands up taller (Ks) and its crests fall behind (lag), as before)
      vec2 D = rot(WD, ang); float k0 = 6.2832/L, w = sqrt(GRAV*k0);
      float shallow = 1.0 - smoothstep(0.15, 0.9*L/6.2832 + 1.0, d);   // (0 in deep water, 1 at the shore)
      float k = k0*(1.0 + 1.6*shallow*shallow);
      float Ks = 1.0 + 1.1*shallow*shallow;
      float lag = (k - k0)*3.2*(1.0 - smoothstep(0.0, 5.0, sh));
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
      vec3 disp = vec3(0.0); vec2 slope = vec2(0.0); jac = 1.0; float env = setEnv(p);
      train(p, d, sh, SWL, 2.6*env, 0.0, 0.0, big, 0.5, disp, slope, jac);   // (the set's waves)
      train(p, d, sh, 8.0, 0.13, 0.7, 0.4, big, 0.08, disp, slope, jac);            // (a little wind chop across it)
      // depth-limited breaking, wave by wave: a crest can stand at most about 0.39 of the depth above the still water (a
      // height of 0.78 of the depth, crest to trough). Where this crest gets there it breaks: its top is cut off and runs
      // on as a bore of white water
      float ratio = disp.y/max(0.39*d, 1e-3);
      brk = smoothstep(0.8, 1.2, ratio)*smoothstep(0.05, 0.6, sh);
      // against rock (a stack, a boulder, the cliff's foot) the wave doesn't just fade: the open sea's crest arriving there
      // slams into it and turns to white water round it
      float k0r = 6.2832/SWL, raw = 2.6*env*cos(k0r*dot(WD, p) - sqrt(GRAV*k0r)*time)*(1.0 + wForce);
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
  function sprayTick(dt, t, check = true){
    if (check){ hitPoints();
    for (const [x, z, up] of hitPts){
      const key = x.toFixed(2) + ',' + z.toFixed(2), hh = WAVE.h(x, z, t), prev = hitPrev.get(key);
      hitPrev.set(key, hh);
      if (prev !== undefined && prev < 1.3 && hh >= 1.3){ const a = Math.min(1, (hh - 1.0)/1.8); spawnSpray(x, z, Math.round(4 + a*10), up*(.6 + .5*a)); }   // (a big crest just arrived)
    }
    if (hitPrev.size > 6000) hitPrev.clear(); }
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
    h = ((h % 24) + 24) % 24; const morning = h < 12;
    const warm = morning ? 1 - smooth(6.4, 8.6, h) : smooth(15.5, 18.8, h);   // (low sun: warm light at both ends of the day)
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
    const n = morning ? 1 - smooth(4.8, 6.3, h) : smooth(19, 21, h); CURV.nightK.value = Math.max(n, .25*(morning ? 1 - smooth(6.2, 7.2, h) : smooth(17.8, 18.8, h))); CURV.darkK.value = n;
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
  let rt = null, reflRT = null, hlRT = null;
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
  const blit = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, glow: { value: null }, nightK: CURV.darkK, res: { value: new THREE.Vector2(480, 270) }, pOff: { value: new THREE.Vector2() }, hlTex: { value: null }, hlOn: { value: 0 } },
    vertexShader: postV, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tex, glow, hlTex; uniform float nightK, hlOn; uniform vec2 res, pOff; varying vec2 vU;
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
        if (hlOn > 0.5){   // (the highlight: a one-pixel line just outside the shape's outline, and the faintest wash inside)
          vec2 q = (floor(vU*res) + 0.5)/res, e = 1.0/res; vec2 m = texture2D(hlTex, q).rg;
          vec2 n = max(max(texture2D(hlTex, q + vec2(e.x, 0.0)).rg, texture2D(hlTex, q - vec2(e.x, 0.0)).rg), max(texture2D(hlTex, q + vec2(0.0, e.y)).rg, texture2D(hlTex, q - vec2(0.0, e.y)).rg));
          vec3 hc = n.r > n.g ? vec3(0.9, 0.38, 0.26) : vec3(0.66, 0.94, 0.7); float edge = step(0.5, max(n.r, n.g))*(1.0 - step(0.5, max(m.r, m.g)));
          c = mix(c, hc, edge*0.7); c = mix(c, m.r > m.g ? vec3(0.9, 0.38, 0.26) : vec3(0.66, 0.94, 0.7), step(0.5, max(m.r, m.g))*0.06); }
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
    if (hlRT) hlRT.dispose(); hlRT = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }); blit.material.uniforms.hlTex.value = hlRT.texture;
  }
  addEventListener('resize', resize);

  /* ---------- the camera: the sky city's, exactly (see input.js) ---------- */
  const camT = new THREE.Vector3(HOME.x, TY, HOME.z), camGoal = camT.clone(), keys = new Set();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 1400);
  const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3(), _cs = new THREE.Vector3();
  // the shadow box: fitted around the ground on screen, seen from the sun, its texels kept still as the view pans
  const sunM = new THREE.Matrix4(), sunX = new THREE.Vector3(), sunY = new THREE.Vector3(), sunZ = new THREE.Vector3(), _o = new THREE.Vector3(), SHADOW = { size: 0 };
  const SHFIT = { size: 0 };
  function fitShadow(){
    sunM.lookAt(sunDir, _o.set(0, 0, 0), new THREE.Vector3(0, 1, 0)); sunM.extractBasis(sunX, sunY, sunZ);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    const gF = Math.min(V.gMax, V.gH*1.05);
    for (const u of [-V.hw, V.hw]) for (const g of [V.back, (V.back + gF)/2, gF]) for (const y of [-3, TOP + 12]){
      const gp = Math.max(g - V.g0, 0), px = V.cx + V.rx*u + V.fx*g, pz = V.cz + V.rz*u + V.fz*g, py = y - V.k*gp*gp;
      const a = px*sunX.x + py*sunX.y + pz*sunX.z, b = px*sunY.x + py*sunY.y + pz*sunY.z, c = px*sunZ.x + py*sunZ.y + pz*sunZ.z;
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, c);
    }
    // (the box is fitted with a margin and kept while the view stays inside it: panning a little no longer moves it, so
    // the cached shadow map isn't redrawn every frame of a pan; it's refitted when the view leaves it, zooms well in or
    // out, or the sun moves)
    const need = Math.max(x1 - x0, y1 - y0)*1.04, ncx = (x0 + x1)/2, ncy = (y0 + y1)/2, F = SHFIT, sk = sunDir.x.toFixed(4) + sunDir.y.toFixed(4) + sunDir.z.toFixed(4);
    if (F.size && F.sun === sk && need <= F.size && need > F.size*.55 && Math.abs(ncx - F.mx) + need/2 <= F.size/2 && Math.abs(ncy - F.my) + need/2 <= F.size/2 && z1 <= F.z1 && z0 >= F.z0) return;
    let size = Math.ceil(need*1.3/16)*16;
    const tex = size/sun.shadow.mapSize.x, mx = Math.round(ncx/tex)*tex, my = Math.round(ncy/tex)*tex, back = 160;
    z1 += 12; z0 -= 12; Object.assign(F, { size, mx, my, z0, z1, sun: sk });
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
      let rc = rockMeshes.get(c); if (!rc){ rc = { mesh: buildRocks(c), seen: 0 }; rockMeshes.set(c, rc); SHD.dirty = true; } rc.seen = fcount;
    }
    todo.sort((a, b) => a[0] - b[0]);   // (pieces just placed first, then what's missing, nearest first, then detail changes)
    const t0 = performance.now();
    for (const [, ch, lod] of todo){
      const old = ch.mesh; ch.mesh = buildChunk(ch.i, ch.j, lod); ch.lod = lod; ch.dirty = false; SHD.dirty = true; if (PROF.on){ PROF.builds = (PROF.builds || 0) + 1; (PROF.log || (PROF.log = [])).push(ch.i + ',' + ch.j + ':' + lod); }
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
    const tw = performance.now(); moveWindow(V.cx + V.fx*ahead, V.cz + V.fz*ahead, budget > 100 ? 1e9 : 3); if (PROF.on) PROF.win = (PROF.win || 0) + performance.now() - tw;
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
    leaf: [C(0x4e8a34), C(0x6aa03c), C(0x3d7430), C(0x82b048)], pot: C(0xb5583a), stone: C(0xd8ccb2), flower: [C(0xf08a5a), C(0xf5c84c), C(0xe6739a)],
    red: C(0xb84a3c), redD: C(0x8a3329), jade: C(0x3a8a76), jade2: C(0x276556), lattice: C(0x5a2a22),   // (the pagoda house: lacquer red, jade tiles)
    rust: C(0xc4703e), rust2: C(0x9e5530), solar: C(0x2b4877), solarL: C(0x6f8fbf), tank: C(0xb9b7ad),
    apricot: C(0xe8a578), butter: C(0xe9c877), mist: C(0x98c6bb), sage: C(0xadc493), rose: C(0xd99788), blushD: C(0xe2ad99),
    neonG: C(0x8dffc6).multiplyScalar(1.1), neonP: C(0xff86b4).multiplyScalar(1.1), pool: C(0x5f968f), fall: C(0x9cc7b8), lily: C(0x5f9a5a), moss: C(0x7f9e5c), timber: C(0x5a3a2a), lanternR: C(0xe0503a).multiplyScalar(1.1), screen: C(0x7fd0ff).multiplyScalar(1.1), ringW: C(0xe2fff2).multiplyScalar(1.1),
    soil: C(0x5b4532), indBlue: C(0x6cc4ff).multiplyScalar(1.1), indWhite: C(0xd6efff).multiplyScalar(1.05), ghGlass: C(0x9fcfc6), soil2: C(0x4a3626) };   // (industrial: cool blue light, blue-white windows, greenhouse glass)   // (the grotto: neon trim and signs, the lit pool and its falls)
  // the plaster colors a home can be washed in besides white: soft, chalky, and all from the scene's own colors (the sand,
  // the terracotta, the sea's teal, the meadow's sage), so a street of them reads as one watercolor
  const PLASTER = [HP.blushD, HP.apricot, HP.butter, HP.mist, HP.sage, HP.rose, HP.apricot, HP.mist];   // (the garden terrace: weathered rust, solar glass)
  for (const c of HP.leaf) LEAFC.add(c);
  GLOW.set(HP.indBlue, .25).set(HP.indWhite, .25).set(HP.ringW, .25).set(HP.lanternR, .25).set(HP.screen, .25).set(HP.neonG, .25).set(HP.neonP, .25).set(HP.pool, .35).set(HP.fall, .25).set(HP.lamp, 1).set(HP.glass, .45).set(HP.glass2, .45).set(HP.glassT, .7).set(HP.glassD, -.5);   // (glassD: half the dark windows lit)
  Object.assign(GEO, { cyl12: new THREE.CylinderGeometry(1, 1, 1, 12), cyl16: new THREE.CylinderGeometry(1, 1, 1, 16), sph: new THREE.IcosahedronGeometry(1, 1),
    dome: new THREE.SphereGeometry(1, 12, 6, 0, PI*2, 0, PI/2), ring: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
    frus4: new THREE.CylinderGeometry(.62, 1, 1, 4, 1).rotateY(PI/4), half16: new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -PI/2, PI), hip4: new THREE.CylinderGeometry(.08, 1, 1, 4, 1).rotateY(PI/4) });   // (square frustums: a roof's flared skirt, and a hipped roof)
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
  // a square flared roof w by d (at its eaves), h tall, its base at y; the corners turned up, a jade ridge and a finial
  const SQ2 = Math.SQRT2;
  function jadeRoof(T, D, y, w, d, h, hip){
    T.add(hip ? GEO.hip4 : GEO.frus4, mat(0, y + h/2, 0, 0, 0, 0, w/2*SQ2, h, d/2*SQ2), HP.jade);
    T.add(hip ? GEO.hip4 : GEO.frus4, mat(0, y + .02, 0, 0, 0, 0, w/2*SQ2 + .04, .05, d/2*SQ2 + .04), HP.jade2);   // (the eave's edge, darker)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const cx = sx*w/2, cz = sz*d/2;   // (each corner swept up)
      T.add(GEO.box, mat(cx*.97, y + .1, cz*.97, -sz*.55, 0, sx*.55, .12, .22, .12), HP.jade2); T.add(GEO.box, mat(cx*1.0, y + .2, cz*1.0, 0, 0, 0, .06, .06, .06), HP.jade); }
    if (D.chance(.85)){ const lx = w*.36, lz = d/2 + .08; for (const sx of [-1, 1]){ box(T, sx*lx, y - .12, lz, .02, .12, .02, HP.rail); box(T, sx*lx, y - .26, lz, .13, .17, .13, HP.lamp); box(T, sx*lx, y - .17, lz, .16, .03, .16, HP.redD); } } }   // (paper lanterns under the eave)
  // a lattice window on a face facing +z: dark frame, glass, and a fret of bars across it
  const latticeZ = (T, R, x, y, z, w, h) => { box(T, x, y, z + .01, w + .1, h + .1, .04, HP.lattice); box(T, x, y, z + .03, w, h, .04, R.chance(.4) ? HP.lamp : HP.glassD);
    for (let k = 1; k < 3; k++){ box(T, x - w/2 + k*w/3, y, z + .06, .025, h, .02, HP.lattice); box(T, x, y - h/2 + k*h/3, z + .06, w, .025, .02, HP.lattice); } };
  // the same, on a face facing +x (sd 1) or -x (sd -1)
  const latticeX = (T, R, x, y, z, w, h, sd) => { box(T, x + sd*.01, y, z, .04, h + .1, w + .1, HP.lattice); box(T, x + sd*.03, y, z, .04, h, w, R.chance(.4) ? HP.lamp : HP.glassD);
    for (let k = 1; k < 3; k++){ box(T, x + sd*.06, y, z - w/2 + k*w/3, .02, h, .025, HP.lattice); box(T, x + sd*.06, y - h/2 + k*h/3, z, .02, .025, w, HP.lattice); } };
  // Each kind is a block: build(T, R, D, ctx) draws it at the origin and returns how high its top is. R draws its body (so
  // a block's size never changes), D its trimmings. ctx.below: it sits on another block (no pad, steps, door or garden at
  // its foot); ctx.above: another block sits on it (no roof garden, dome or greenhouse: a flat roof to stand on).
  // the smart field's layout (local units): 4 plots of P a side, lanes Ln between them, a margin lane E round them
  const FIELD = { P: 1.15, Ln: .78, E: .62 }; FIELD.S = 4*FIELD.P + 3*FIELD.Ln + 2*FIELD.E;
  FIELD.c = i => -FIELD.S/2 + FIELD.E + FIELD.P/2 + i*(FIELD.P + FIELD.Ln); FIELD.lane = k => -FIELD.S/2 + FIELD.E + FIELD.P + FIELD.Ln/2 + k*(FIELD.P + FIELD.Ln); FIELD.edge = FIELD.S/2 - FIELD.E/2;
  const KINDS = {
    townhouse: { name: 'Greenhouse townhouse', r: 1.9, rb: 1.1, build(T, R, D, ctx){
      const w = R.r(1.9, 2.3), d = R.r(1.5, 1.9), fl = ctx.below ? 1 : R.i(1, 2), fh = 1.2, H = fl*fh, wall = R.pick([HP.teal, HP.sea, HP.teal, HP.ochre, HP.blush, HP.apricot, HP.rose, HP.sage]), y0 = ctx.below ? 0 : .12;
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
      const towerC = [HP.cream, HP.cream, HP.butter, HP.mist, HP.blush, HP.apricot][Math.floor(D.f()*6)];   // (its plaster bands: cream, or a soft color)
      if (!ctx.below) T.add(GEO.cyl12, mat(0, .06, 0, 0, 0, 0, 1.55, .12, 1.55), HP.stone);
      for (let i = 0; i < lv; i++){
        const r = R.r(.85, 1.15) - i*.04, band = (i + (ctx.below ? 1 : 0)) % 2 ? HP.terra : towerC;
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
      const y0 = ctx.below ? 0 : .2, main = R.r(.85, 1.0), c2 = R.pick([HP.white, HP.cream, HP.white, HP.mist, HP.blush, HP.butter, HP.apricot]);
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
      const vc = Math.floor(w*997) % 3 === 0 ? HP.white : PLASTER[Math.floor(d*991) % PLASTER.length];   // (a third stay white; the rest take a plaster color, and its upper floors mostly keep to it)
      for (let i = 0; i < n; i++){
        const h = i === 0 && !ctx.below ? 1.1 : .95, c = R.pick([vc, vc, vc, HP.white]);
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
    // the pagoda house (boards 15, 27): lacquer-red timber floors, each a little narrower, a flared jade-tiled skirt between
    // them with its corners swept up, lattice windows, paper lanterns under the eaves, a balcony with a rail on the upper
    // floor, a hipped jade roof with a finial; a stone plinth, a double door, potted pines and grasses at its foot
    pagoda: { name: 'Pagoda house', r: 1.9, rb: 1.15, build(T, R, D, ctx){
      const w = R.r(1.75, 2.05), d = R.r(1.55, 1.8), fl = ctx.below ? 1 : R.i(1, 2), fh = 1.0, wall = R.pick([HP.red, HP.red, HP.redD]);
      let y = ctx.below ? 0 : .2;
      if (!ctx.below){ box(T, 0, .1, 0, w + .7, .2, d + .7, HP.stone); box(T, 0, .21, d/2 + .45, .9, .06, .3, HP.stone); }
      for (let f = 0; f < fl; f++){
        const ww = w - f*.22, dd = d - f*.18;
        box(T, 0, y + fh/2, 0, ww, fh, dd, wall);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(T, sx*ww/2, y + fh/2, sz*dd/2, .11, fh, .11, HP.redD);   // (the corner posts)
        box(T, 0, y + fh - .06, 0, ww + .04, .1, dd + .04, HP.redD);   // (the beam under the eave)
        const front = f === 0 && !ctx.below;
        for (const wx of [-ww*.29, ww*.29]) latticeZ(T, D, wx, y + fh*.55, dd/2, .38, .42);
        latticeZ(T, D, 0, y + fh*.55, -dd/2 - .07, .5, .4);
        for (const sd of [-1, 1]) latticeX(T, D, sd*ww/2, y + fh*.55, 0, .42, .38, sd);   // (a window in each side)
        if (front){ box(T, 0, y + .45, dd/2 + .03, .62, .82, .06, HP.lattice); box(T, 0, y + .45, dd/2 + .05, .02, .8, .04, HP.redD); for (const sx of [-.16, .16]) box(T, sx, y + .45, dd/2 + .07, .22, .6, .02, HP.wood); }   // (a double door)
        if (f > 0 || ctx.below){ box(T, 0, y + .04, dd/2 + .22, ww*.8, .07, .4, HP.wood);   // (a balcony on the upper floor)
          for (let k = 0; k <= 6; k++) box(T, -ww*.4 + k*ww*.8/6, y + .25, dd/2 + .4, .03, .38, .03, HP.lattice); box(T, 0, y + .44, dd/2 + .4, ww*.8, .04, .04, HP.lattice);
          if (D.chance(.7)) pot(T, D, ww*.3, y + .07, dd/2 + .25, .8); }
        y += fh;
        if (f < fl - 1 || ctx.above){ jadeRoof(T, D, y - .02, ww + .6, dd + .55, .2, false); y += .16; }
      }
      let top;
      if (!ctx.above){ const ww = w - (fl - 1)*.22, dd = d - (fl - 1)*.18, rh = .95; jadeRoof(T, D, y - .02, ww + .7, dd + .65, rh, true);
        // (the hips: a darker tile line down each corner, so the roof's planes read)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const a = V3(sx*(ww + .7)/2*.04, y + rh - .02, sz*(dd + .65)/2*.04), b = V3(sx*(ww + .7)/2*.98, y + .02, sz*(dd + .65)/2*.98); seg(T, a, b, .07, .05, HP.jade2, .02); }
        T.add(GEO.cyl5, mat(0, y + rh + .12, 0, 0, 0, 0, .03, .3, .03), HP.ochre); T.add(GEO.ico, mat(0, y + rh + .28, 0, 0, 0, 0, .06, .06, .06), HP.ochre);
        top = y + .05; }   // (a roof can't be stood on: top is the eave line)
      else { box(T, 0, y - .04, 0, w - (fl - 1)*.22 + .1, .08, d - (fl - 1)*.18 + .1, HP.redD); top = y; }
      if (!ctx.below){ for (const sx of [-1, 1]){ T.add(GEO.cyl5, mat(sx*(w/2 + .2), .45, d/2 + .2, 0, 0, sx*.15, .05, .5, .05), HP.wood); T.add(GEO.ico, mat(sx*(w/2 + .25), .78, d/2 + .2, 0, 0, 0, .3, .2, .3), D.pick(HP.leaf)); }   // (a little pine each side of the door)
        for (let k = 0; k < 4; k++) if (D.chance(.7)) pot(T, D, D.r(-w/2, w/2), .2, -d/2 - .25, .9); }
      return top;
    } },
    // the garden terrace (boards 08, 29): weathered rust boxes stacked and cantilevered off each other, each with a ribbon of
    // glass, planted troughs along the open edges spilling grass and trailing vines down the faces; up top a tilted solar
    // panel on legs and a water tank, among roof planters
    terrace: { name: 'Garden terrace', r: 2.0, rb: 1.3, build(T, R, D, ctx){
      const y0 = ctx.below ? 0 : .12, n = ctx.below ? R.i(1, 2) : R.i(2, 3), bh = .85;
      if (!ctx.below) box(T, 0, .06, 0, 2.9, .12, 2.6, HP.stone);
      box(T, 0, y0 + n*bh/2, 0, .7, n*bh, .7, HP.stone);   // (the core every box hangs off: stair and pipes)
      let y = y0, lastW = 1.6, lastD = 1.3;
      for (let i = 0; i < n; i++){
        const turn = (i + (ctx.below ? 1 : 0)) % 2, w = R.r(1.5, 1.95), d = R.r(1.1, 1.35), ox = i === n - 1 ? 0 : R.r(-.35, .35), oz = i === n - 1 ? 0 : R.r(-.3, .3);
        const W = turn ? d : w, Dd = turn ? w : d, col = R.pick([HP.rust, HP.rust, HP.rust2]);
        box(T, ox, y + bh/2, oz, W, bh, Dd, col);
        box(T, ox, y + bh - .04, oz, W + .08, .08, Dd + .08, HP.rust2);   // (its lip)
        // a ribbon of glass round it, cut by mullions
        box(T, ox, y + bh*.52, oz, W + .02, bh*.38, Dd + .02, HP.glassD);
        for (const [fx, fz, len, along] of [[0, Dd/2 + .02, W, 'x'], [0, -Dd/2 - .02, W, 'x'], [W/2 + .02, 0, Dd, 'z'], [-W/2 - .02, 0, Dd, 'z']]){
          const k = Math.max(2, Math.round(len/.32)); for (let j = 0; j <= k; j++){ const t = -len/2 + j*len/k; box(T, ox + fx + (along === 'x' ? t : 0), y + bh*.52, oz + fz + (along === 'z' ? t : 0), .035, bh*.4, .035, HP.frame); } }
        if (D.chance(.5)) box(T, ox + W*.25, y + bh*.52, oz + Dd/2 + .03, W*.3, bh*.34, .02, HP.lamp);   // (one room lit)
        // planted troughs along the open edges, spilling over; vines hanging down the faces
        for (const sz of [-1, 1]) if (D.chance(.75)){ const tz = oz + sz*(Dd/2 + .14); box(T, ox, y + bh + .02, tz, W*.9, .16, .2, HP.rust2);
          for (let j = 0; j < 4; j++) plant(T, D, ox - W*.38 + j*W*.76/3, y + bh + .08, tz, .95);
          for (let j = 0; j < 2; j++) if (D.chance(.7)) T.add(GEO.ico, mat(ox + D.r(-W*.4, W*.4), y + bh*.55, tz + sz*.04, 0, 0, 0, .1, .3, .1), D.pick(HP.leaf)); }
        lastW = W; lastD = Dd; y += bh;
      }
      const top = y + .04;
      box(T, 0, y + .02, 0, lastW + .1, .06, lastD + .1, HP.stone);
      if (!ctx.above){
        // a tilted solar panel on legs, its cells lined out, and a water tank with bands
        const pw = Math.min(1.3, lastW*.8), pd = .75, tilt = .42, px = -lastW*.08, pz = -lastD*.12;
        for (const [lx, lz, lh] of [[-pw/2 + .08, -pd/2 + .1, .2], [pw/2 - .08, -pd/2 + .1, .2], [-pw/2 + .08, pd/2 - .1, .52], [pw/2 - .08, pd/2 - .1, .52]]) box(T, px + lx, y + lh/2, pz + lz, .04, lh, .04, HP.metal);
        T.add(GEO.box, mat(px, y + .38, pz, tilt, 0, 0, pw, .05, pd), HP.solar);
        for (let k = 1; k < 4; k++) T.add(GEO.box, mat(px - pw/2 + k*pw/4, y + .41, pz, tilt, 0, 0, .015, .02, pd), HP.solarL);
        T.add(GEO.box, mat(px, y + .41, pz, tilt, 0, 0, pw, .02, .015), HP.solarL);
        const tx = lastW*.32, tz = lastD*.22; T.add(GEO.cyl12, mat(tx, y + .35, tz, 0, 0, 0, .2, .6, .2), HP.tank);
        for (const by of [.15, .55]) T.add(GEO.cyl12, mat(tx, y + by, tz, 0, 0, 0, .215, .04, .215), HP.metal); T.add(GEO.cyl8, mat(tx, y + .7, tz, 0, 0, 0, .1, .1, .1), HP.metal);
        for (let k = 0; k < 3; k++) if (D.chance(.8)) plant(T, D, D.r(-lastW*.4, lastW*.4), y + .05, lastD*.38, 1.1);
      }
      if (!ctx.below){ box(T, .36, .5, .36, .06, .8, .06, HP.metal); for (let k = 0; k < 5; k++) if (D.chance(.75)) pot(T, D, D.r(-1.2, 1.2), .12, D.r(.9, 1.15), 1); }
      return top;
    } },
    // COMMERCIAL (the commercial zone mixes these four; see CW).
    // the noodle stall (board 09): a little box of a shop with its whole front open on a lit kitchen, a counter and stools,
    // cloth flaps over the opening, a tiled canopy, vertical neon signs off its side; on the roof the clutter of a city
    // stall (air units, pipes, a water drum) and now and then an old rail beam on posts gone over to vines
    noodle: { name: 'Noodle stall', com: true, r: 1.7, rb: 1.05, build(T, R, D, ctx){
      const y0 = ctx.below ? 0 : .12, w = R.r(1.5, 1.8), d = R.r(1.1, 1.3), h = R.r(1.0, 1.12), zf = d/2 - .1, wall = R.pick([HP.teal, HP.sea, HP.mist, HP.rust2, HP.teal]);
      if (!ctx.below){ box(T, 0, .06, .1, w + .6, .12, d + .8, HP.stone); }
      box(T, 0, y0 + h/2, -.1, w, h, d, wall);
      box(T, 0, y0 + h - .04, -.1, w + .06, .08, d + .06, HP.rail);
      box(T, 0, y0 + .6, zf + .02, w - .26, .5, .04, HP.lamp);   // (the lit kitchen)
      for (let k = 0; k < 3; k++) box(T, -w/2 + .35 + k*(w - .7)/2, y0 + .62, zf + .05, .16, .1, .04, HP.metal);   // (pots on the range)
      box(T, 0, y0 + .36, zf + .17, w - .16, .07, .3, HP.wood); box(T, 0, y0 + .17, zf + .29, w - .16, .34, .04, D.pick([HP.rust, HP.red, HP.wood]));
      const noren = D.pick([HP.red, HP.cream, HP.doorT]); for (let k = 0; k < 4; k++) box(T, -w*.36 + k*w*.24, y0 + h - .2, zf + .06, w*.2, .22, .02, k % 2 ? noren : HP.cream);
      if (!ctx.below) for (let k = 0; k < 3; k++){ const sx = -w*.3 + k*w*.3; T.add(GEO.cyl8, mat(sx, .27, zf + .55, 0, 0, 0, .025, .3, .025), HP.metal); T.add(GEO.cyl8, mat(sx, .43, zf + .55, 0, 0, 0, .1, .04, .1), D.pick([HP.red, HP.butter, HP.teal])); }
      else { box(T, 0, .04, zf + .45, w, .06, .5, HP.wood); box(T, 0, .3, zf + .68, w, .04, .03, HP.rail); }
      box(T, 0, y0 + h + .02, zf + .32, w + .3, .05, .7, D.pick([HP.tile, HP.terra2, HP.jade]));   // (the canopy)
      for (const sx of [-1, 1]) T.add(GEO.cyl5, mat(sx*(w/2 + .1), y0 + h - .2, zf + .62, 0, 0, 0, .025, .45, .025), HP.rail);
      const sd = D.chance(.5) ? 1 : -1; for (let k = 0; k < D.i(1, 2); k++){ const sz = zf - .15 - k*.45;
        box(T, sd*(w/2 + .08), y0 + h*.62 + k*.12, sz, .06, .74, .24, HP.frame); box(T, sd*(w/2 + .12), y0 + h*.62 + k*.12, sz, .03, .64, .18, D.pick([HP.neonP, HP.neonG, HP.lamp]));
        for (let j = 0; j < 3; j++) box(T, sd*(w/2 + .14), y0 + h*.62 + k*.12 + .2 - j*.2, sz, .02, .08, .1, HP.frame); }
      const top = y0 + h + .04;
      if (!ctx.above){
        box(T, -w*.25, top + .16, -.3, .4, .3, .34, HP.metal); box(T, -w*.25, top + .16, -.12, .26, .2, .02, HP.rail);   // (an air unit)
        T.add(GEO.cyl12, mat(w*.25, top + .25, -.4, 0, 0, 0, .16, .5, .16), HP.tank); T.add(GEO.cyl5, mat(w*.25 + .2, top + .05, 0, 0, 0, PI/2, .03, .5, .03), HP.metal);
        for (let k = 0; k < 3; k++) if (D.chance(.7)) pot(T, D, D.r(-w*.4, w*.4), top, zf - .15, .8);
        for (let k = 0; k < 4; k++) if (D.chance(.6)) T.add(GEO.ico, mat(D.r(-w*.45, w*.45), top - .1, zf + .04, 0, 0, 0, .07, D.r(.2, .32), .07), D.pick(HP.leaf));
        if (!ctx.below && D.chance(.55)){ const by = top + .7;   // (the old rail beam, overgrown)
          for (const sx of [-1, 1]) box(T, sx*(w/2 + .15), by/2, -.6, .12, by, .12, HP.rust2);
          box(T, 0, by + .06, -.6, w + .7, .14, .3, HP.rust2); for (let k = 0; k < 5; k++) plant(T, D, -w/2 + k*w/4, by + .13, -.6, .8);
          for (let k = 0; k < 4; k++) T.add(GEO.ico, mat(D.r(-w/2, w/2), by - .2, -.45, 0, 0, 0, .07, D.r(.25, .35), .07), D.pick(HP.leaf)); } }
      return top;
    } },
    // the lantern shophouse (board 28): a narrow two-floor house of dark timber, its ground floor an open shop spilling crates
    // of fruit under an awning, signs hung out sideways off the front, the upper floor jutting over the street with lattice
    // windows and a planted balcony; a string of lanterns slung across the front between two poles; a tiled hip roof
    lantern: { name: 'Lantern shophouse', com: true, r: 1.8, rb: 1.15, build(T, R, D, ctx){
      const w = R.r(1.4, 1.65), d = R.r(1.5, 1.8), fh = .95, fl = ctx.below ? 1 : 2, up = R.pick([HP.cream, HP.blush, HP.butter, HP.mist, HP.cream]);
      let y = ctx.below ? 0 : .12;
      if (!ctx.below) box(T, 0, .06, .15, w + .6, .12, d + .9, HP.stone);
      for (let f = 0; f < fl; f++){ const shop = f === 0 && !ctx.below, oz = shop ? 0 : .15, wc = shop ? HP.timber : up;
        box(T, 0, y + fh/2, oz, w, fh, d, wc);
        for (const sx of [-1, 1]) box(T, sx*w/2, y + fh/2, oz + d/2, .09, fh, .09, HP.timber);
        box(T, 0, y + fh - .04, oz, w + .08, .08, d + .08, HP.timber);
        if (shop){ box(T, 0, y + .48, d/2 + .02, w - .24, .72, .04, HP.lamp);
          for (let k = 0; k < 3; k++){ const cx = -w*.3 + k*w*.3; box(T, cx, .2, d/2 + .2, .3, .16, .24, HP.wood); for (let j = 0; j < 3; j++) T.add(GEO.ico, mat(cx - .08 + j*.08, .32, d/2 + .2, 0, 0, 0, .05, .05, .05), D.pick(HP.flower)); }
          box(T, 0, y + fh - .1, d/2 + .25, w + .1, .04, .5, D.pick([HP.terra, HP.teal, HP.red, HP.sea])); }
        else { latticeZ(T, D, -w*.22, y + fh*.55, oz + d/2, .38, .42); latticeZ(T, D, w*.22, y + fh*.55, oz + d/2, .38, .42);
          if (f > 0 || ctx.below){ box(T, 0, y + .04, oz + d/2 + .18, w*.85, .06, .32, HP.timber); for (let k = 0; k <= 5; k++) box(T, -w*.42 + k*w*.84/5, y + .2, oz + d/2 + .33, .03, .3, .03, HP.timber);
            box(T, 0, y + .36, oz + d/2 + .33, w*.85, .04, .04, HP.timber); for (let k = 0; k < 2; k++) if (D.chance(.75)) pot(T, D, -w*.3 + k*w*.6, y + .07, oz + d/2 + .2, .8);
            for (let k = 0; k < 2; k++) if (D.chance(.6)) T.add(GEO.ico, mat(D.r(-w*.4, w*.4), y - .02, oz + d/2 + .34, 0, 0, 0, .06, D.r(.2, .3), .06), D.pick(HP.leaf)); } }
        latticeZ(T, D, 0, y + fh*.55, oz - d/2 - .07, .4, .38);
        // signs hung out sideways off the front corners
        for (const sx of [-1, 1]) if (D.chance(shop ? .9 : .5)){ const sy = y + fh*.55, sz = oz + d/2 + .18;
          box(T, sx*(w/2 - .02), sy, sz, .24, .56, .05, HP.frame); box(T, sx*(w/2 - .02), sy, sz, .2, .48, .07, D.pick([HP.lamp, HP.neonP, HP.neonG, HP.butter, HP.red]));
          box(T, sx*(w/2 - .02), sy + .32, sz - .06, .03, .1, .16, HP.rail); }
        y += fh; }
      let top;
      if (!ctx.above){ const oz = ctx.below ? 0 : .15; T.add(GEO.hip4, mat(0, y + .32, oz, 0, 0, 0, (w + .45)/2*SQ2, .64, (d + .45)/2*SQ2), HP.tile); T.add(GEO.hip4, mat(0, y + .02, oz, 0, 0, 0, (w + .5)/2*SQ2, .05, (d + .5)/2*SQ2), HP.terra2);
        top = y + .05; }
      else { box(T, 0, y - .04, 0, w + .1, .08, d + .1, HP.timber); top = y; }
      if (!ctx.below){ const lz = d/2 + .75, px = w/2 + .3;   // (the lantern string)
        for (const sx of [-1, 1]) T.add(GEO.cyl5, mat(sx*px, .95, lz, 0, 0, 0, .03, 1.7, .03), HP.timber);
        const n = 6; for (let k = 0; k < n; k++){ const t = (k + .5)/n, x = -px + t*2*px, sag = 1.68 - Math.sin(t*PI)*.25;
          box(T, x, sag, lz, .14, .17, .14, k % 2 ? HP.lamp : HP.lanternR); box(T, x, sag + .1, lz, .1, .03, .1, HP.timber); }
        for (let k = 0; k < 2; k++) if (D.chance(.7)) pot(T, D, D.r(-w/2, w/2), .12, -d/2 - .2, .9); }
      return top;
    } },
    // the solar workshop (board 29): a chunky rust-orange box, its front a workbench under a strip light with a glowing
    // screen, tools and pots on the shelves; a big solar panel tilted over it all on a frame, overhanging; a water tank and a
    // flue pipe on the roof, a ladder up the side, a roof planter trailing vines, pots and a paved pad out front
    kiosk: { name: 'Solar workshop', com: true, r: 1.8, rb: 1.15, build(T, R, D, ctx){
      const y0 = ctx.below ? 0 : .12, w = R.r(1.6, 1.9), d = R.r(1.3, 1.5), h = R.r(1.1, 1.25), zf = d/2;
      if (!ctx.below){ box(T, 0, .06, .1, w + .6, .12, d + .8, HP.stone); for (let k = 0; k < 3; k++) box(T, -w*.3 + k*w*.3, .13, zf + .5, .4, .02, .3, HP.sand); }
      box(T, 0, y0 + h/2, 0, w, h, d, HP.rust);
      box(T, 0, y0 + h - .05, 0, w + .08, .1, d + .08, HP.rust2); box(T, 0, y0 + .05, 0, w + .06, .1, d + .06, HP.rust2);
      box(T, 0, y0 + .6, zf + .01, w - .3, .62, .04, HP.glassD);   // (the open front: dark inside)
      box(T, 0, y0 + .9, zf + .04, w - .4, .04, .04, HP.lamp);   // (the strip light)
      box(T, 0, y0 + .36, zf + .14, w - .25, .06, .3, HP.wood); box(T, 0, y0 + .18, zf + .06, w - .25, .3, .1, HP.rust2);
      box(T, -w*.2, y0 + .52, zf + .08, .3, .22, .03, HP.frame); box(T, -w*.2, y0 + .52, zf + .1, .26, .18, .02, HP.screen);
      for (let k = 0; k < 3; k++) if (D.chance(.8)) pot(T, D, w*.05 + k*w*.13, y0 + .39, zf + .12, .6);
      for (let k = 0; k < 4; k++) box(T, w*.25 + (k % 2)*.1, y0 + .7 + Math.floor(k/2)*.1, zf + .04, .04, .08, .02, D.pick([HP.blue, HP.metal, HP.butter]));
      if (!ctx.below){ T.add(GEO.cyl8, mat(w*.25, .3, zf + .45, 0, 0, 0, .09, .36, .09), HP.wood); T.add(GEO.cyl8, mat(w*.25, .5, zf + .45, 0, 0, 0, .15, .04, .15), HP.wood); }   // (a stool)
      else { box(T, 0, .04, zf + .3, w, .06, .4, HP.rust2); box(T, 0, .3, zf + .48, w, .04, .03, HP.rail); }
      for (let k = 0; k < 6; k++) box(T, -w/2 - .02, y0 + .15 + k*.17, -d*.2, .04, .03, .3, HP.metal);   // (a ladder rung up the side)
      for (const sz of [-d*.2 - .15, -d*.2 + .15]) box(T, -w/2 - .02, y0 + h/2, sz, .04, h, .03, HP.metal);
      const top = y0 + h + .04;
      if (!ctx.above){
        const pw = w + .3, pd = d + .35, tilt = .3, py = top + .55;   // (rising toward the back, its front edge low over the counter)
        for (const [lx, lz, lh] of [[-pw/2 + .15, -pd/2 + .2, .95], [pw/2 - .15, -pd/2 + .2, .95], [-pw/2 + .15, pd/2 - .25, .2], [pw/2 - .15, pd/2 - .25, .2]]) box(T, lx, top + lh/2, lz, .05, lh, .05, HP.metal);
        T.add(GEO.box, mat(0, py, 0, tilt, 0, 0, pw, .06, pd), HP.solar);
        for (let k = 1; k < 5; k++) T.add(GEO.box, mat(-pw/2 + k*pw/5, py + .035, 0, tilt, 0, 0, .015, .02, pd), HP.solarL);
        for (let k = 1; k < 3; k++) T.add(GEO.box, mat(0, py + .035 - Math.sin(tilt)*(-pd/2 + k*pd/3), Math.cos(tilt)*(-pd/2 + k*pd/3), tilt, 0, 0, pw, .02, .015), HP.solarL);
        T.add(GEO.cyl12, mat(w*.3, top + .3, -d*.25, 0, 0, 0, .2, .55, .2), HP.tank); for (const by of [.12, .45]) T.add(GEO.cyl12, mat(w*.3, top + by, -d*.25, 0, 0, 0, .215, .04, .215), HP.metal);
        T.add(GEO.cyl5, mat(-w*.32, top + .5, -d*.3, 0, 0, 0, .05, 1.0, .05), HP.metal);
        box(T, -w*.1, top + .08, zf - .15, w*.6, .14, .2, HP.rust2); for (let k = 0; k < 3; k++) plant(T, D, -w*.35 + k*w*.25, top + .12, zf - .15, .85);
        for (let k = 0; k < 3; k++) if (D.chance(.7)) T.add(GEO.ico, mat(-w*.1 + D.r(-w*.25, w*.25), top - .12, zf + .04, 0, 0, 0, .07, D.r(.22, .34), .07), D.pick(HP.leaf)); }
      if (!ctx.below) for (let k = 0; k < 4; k++) if (D.chance(.75)) pot(T, D, D.r(-w/2 - .1, w/2 + .1), .12, D.r(zf + .3, zf + .6), 1);
      return top;
    } },
    // The grotto market (boards 20, 14, 22): a round hill of the coast's own limestone, in strata, on flat
    // ground and opened toward the front by one great arch, so the camera looks into it. Inside, ring terraces step up the
    // back wall, each lined with lit shopfronts under awnings and little neon signs, planters spilling vines over the edges,
    // a stair up the middle; a pool on the floor, lit from below, with ribbons of water falling into it through a round
    // skylight in the roof. The arch is ringed with stones and a green neon trim; neon blade signs on its pillars; the roof is
    // moss and grass and tree ferns, with the skylight's rim of stones and vines hanging down through it.
    grotto: { name: 'Grotto market', com: true, solo: true, r: 3.0, rb: 2.7, build(T, R, D, ctx){
      const y0 = .12, zc = -.25, ax = R.r(2.5, 2.7), az = R.r(2.25, 2.45), rc = R.r(1.68, 1.8), hc = R.r(2.0, 2.25), ao = R.r(1.05, 1.18), roc = .5, NS = 26;
      const ROCK = [PAL.rock[0], PAL.rock[1], PAL.rock[3], PAL.rock[2], PAL.rock[0], PAL.rock[4]], band0 = R.i(0, 5);
      const Ly = []; { let y = y0; const Ht = R.r(3.5, 3.85); while (y < Ht - .1){ const hh = Math.min(R.r(.32, .44), Ht - y); Ly.push([y, hh]); y += hh; } }
      const Htop = Ly[Ly.length - 1][0] + Ly[Ly.length - 1][1], archTop = hc + (Htop - hc)*.3, hs = y0 + .9;   // (hs: where the arch springs)
      const ell = th => ax*az/Math.hypot(az*Math.sin(th), ax*Math.cos(th));   // (the hill's outline, by angle from the front)
      const shrink = Ly.map(([y, hh]) => { const u = (y + hh/2 - y0)/(Htop - y0); return (u < .4 ? 1 : Math.sqrt(Math.max(.12, 1 - Math.pow((u - .4)/.6, 2)*.72))) + R.r(-.03, .03); });
      const innerR = (y, hh) => y + hh <= hc + .01 ? rc : Math.max(roc, rc - (rc - roc)*Math.min(1, (y + hh/2 - hc)/((Htop - hc)*.62)));
      const mouth = (y, hh) => { const ym = y + hh/2; return ym < hs ? ao : ym < archTop ? ao*Math.sqrt(1 - Math.pow((ym - hs)/(archTop - hs), 2)) : 0; };   // (round-headed: full width to the springing, then curving in)
      const at = (th, r) => [Math.sin(th)*r, zc + Math.cos(th)*r];
      const seg = (th, r0, r1, y, hh, col, wPad = .06) => { const rm = (r0 + r1)/2, [x, z] = at(th, rm); T.add(GEO.box, mat(x, y + hh/2, z, 0, th, 0, 2*r1*Math.sin(PI/NS) + wPad, hh, r1 - r0), col); };
      // the plinth and a forecourt before the mouth
      T.add(GEO.cyl16, mat(0, .06, zc, 0, 0, 0, ax + .25, .12, az + .25), HP.stone);
      box(T, 0, .06, zc + az + .35, 2*rc*Math.sin(ao) + .9, .12, .8, HP.stone); box(T, 0, .03, zc + az + .82, 2*rc*Math.sin(ao), .06, .25, HP.stone);
      // the hill: strata in rings, hollow round the cave, the mouth cut out of the front, the vault closing in to an oculus
      let prevOpen = null;
      Ly.forEach(([y, hh], li) => {
        const sk = shrink[li], ri = innerR(y, hh), al = mouth(y, hh), col = ROCK[(li + band0) % ROCK.length], open = [];
        const skN = li < Ly.length - 1 ? shrink[li + 1] : 0;
        for (let i = 0; i < NS; i++){
          const th = (i + .5)/NS*PI*2 - PI, ro = ell(th)*sk, gone = Math.abs(th) < al; open.push(gone); if (gone) continue;
          seg(th, ri, ro, y, hh, col);
          // the ledge left where the next stratum steps in: moss on it, now and then a clump of grass
          const roN = li < Ly.length - 1 ? ell(th)*skN : ri, w = ro - Math.max(roN, ri);
          if (w > .1 && y + hh > hc*.6){ const rr = Math.max(roN, ri); seg(th, rr - .02, ro + .02, y + hh, .05, HP.moss, .08);
            if (D.chance(li === Ly.length - 1 ? .5 : .3)){ const [px, pz] = at(th + D.r(-.08, .08), (rr + ro)/2); plant(T, D, px, y + hh + .04, pz, D.r(1.0, 1.5)); } }
          // green neon down the edges of the mouth, and along the underside of the arch
          const nb = i > 0 && Math.abs((i - .5)/NS*PI*2 - PI) < al || i < NS - 1 && Math.abs((i + 1.5)/NS*PI*2 - PI) < al;
          if (nb){ const eth = th + (Math.abs((i - .5)/NS*PI*2 - PI) < al ? -1 : 1)*PI/NS; const [ex, ez] = at(eth, ro - .03); box(T, ex, y + hh/2, ez, .05, hh + .01, .05, HP.neonG); }
          if (prevOpen && prevOpen[i]){ const [nx, nz] = at(th, ro - .03); T.add(GEO.box, mat(nx, y + .02, nz, 0, th, 0, 2*ro*Math.sin(PI/NS) + .04, .05, .05), HP.neonG);
            if (D.chance(.45)){ const [vx, vz] = at(th, ri + .1); T.add(GEO.ico, mat(vx, y - .12, vz, 0, 0, 0, .07, D.r(.2, .32), .07), D.pick(HP.leaf)); } }
          // vines down the inside of the vault
          if (y > hc && D.chance(.22)){ const [vx, vz] = at(th, ri + .06); T.add(GEO.ico, mat(vx, y - .05, vz, 0, 0, 0, .07, D.r(.2, .3), .07), D.pick(HP.leaf)); }
        }
        prevOpen = open;
      });
      // the oculus's rim of stones
      for (let i = 0; i < 12; i++){ const a = i/12*PI*2, [x, z] = at(a, roc + .06); T.add(GEO.box, mat(x, Htop + .07, z, 0, a, 0, .3, .14, .16), HP.stone); }
      // inside: the floor, the pool under the oculus, falls of water through it
      T.add(GEO.cyl16, mat(0, y0 + .01, zc, 0, 0, 0, rc + .05, .02, rc + .05), HP.cream);
      const pr = .45; T.add(GEO.cyl16, mat(0, y0 + .1, zc, 0, 0, 0, pr + .09, .2, pr + .09), HP.stone); T.add(GEO.cyl16, mat(0, y0 + .19, zc, 0, 0, 0, pr, .04, pr), HP.pool);
      for (let k = 0; k < 3; k++){ const a = D.r(0, PI*2), q = D.r(.12, .32); T.add(GEO.cyl8, mat(Math.sin(a)*q, y0 + .22, zc + Math.cos(a)*q, 0, 0, 0, .09, .01, .09), HP.lily); }
      for (let k = 0; k < 6; k++){ const a = k/6*PI*2 + D.r(-.4, .4), [fx, fz] = at(a, D.r(.12, .36)), w = D.r(.025, .05); box(T, fx, (y0 + .2 + Htop)/2, fz, w, Htop - y0 - .2, w, HP.fall); }
      // the ring terraces round the back, each lined with shops facing the pool, a stair up the middle
      const nt = R.i(2, 3), th0 = .55, dep = .34, AW = [HP.terra, HP.teal, HP.butter, HP.rose, HP.sea, HP.apricot], SG = [HP.neonG, HP.neonP, HP.lamp, HP.neonP], bk = 1.55;
      for (let k = 0; k < nt; k++){ const r0 = rc - (nt - k)*dep, ya = y0 + k*th0, yt = ya + th0, M = 12;
        for (let i = 0; i < M; i++){ const t0 = PI - bk + i*2*bk/M, t1 = t0 + 2*bk/M;
          for (const th of [t0 + (t1 - t0)/2]){ const tt = th > PI ? th - 2*PI : th, [x, z] = at(tt, (r0 + rc)/2);
            T.add(GEO.box, mat(x, y0 + (yt - y0)/2, z, 0, tt, 0, 2*rc*Math.sin(bk/M) + .05, yt - y0, rc - r0), k % 2 ? PAL.rock[1] : HP.stone);
            const [lx, lz] = at(tt, r0 + .02); T.add(GEO.box, mat(lx, yt + .02, lz, 0, tt, 0, 2*r0*Math.sin(bk/M) + .03, .05, .08), HP.cream); } }
        const n = k === nt - 1 ? 3 : 4;
        for (let i = 0; i < n; i++){ let th = PI - bk + .22 + (i + .5)*(2*bk - .44)/n; if (Math.abs(th - PI) < .25) continue; if (th > PI) th -= 2*PI;
          const fc = th + PI, w = d => at(th, r0 - d), wy = ya + th0*.45, [wx, wz] = w(.02), [ax2, az2] = w(.12), [gx, gz] = w(.03);
          T.add(GEO.box, mat(wx, wy, wz, 0, fc, 0, .36, .38, .02), HP.frame); T.add(GEO.box, mat(wx, wy, wz, 0, fc, 0, .3, .32, .04), D.chance(.85) ? HP.lamp : HP.glassD);
          T.add(GEO.box, mat(ax2, wy + .22, az2, 0, fc, 0, .4, .04, .22), D.pick(AW)); T.add(GEO.box, mat(gx, wy + .33, gz, 0, fc, 0, .22, .07, .03), D.pick(SG));
          if (k > 0 && D.chance(.55)){ const [hx, hz] = w(-.04); T.add(GEO.ico, mat(hx, ya + th0*.8, hz, 0, 0, 0, .06, .2, .06), D.pick(HP.leaf)); } }
        for (let i = 0; i < 3; i++) if (D.chance(.7)){ const th = PI - bk + D.r(.2, 2*bk - .2), [px, pz] = at(th, (r0 + rc)/2 - .05); if (Math.abs(th - PI) > .25) plant(T, D, px, yt, pz, .8); }
        for (let s = 0; s < 2; s++){ const [sx, sz] = at(PI, r0 - .1 - (1 - s)*.12); box(T, sx, ya + (s + .5)*th0/2, sz, .4, th0/2, .14, HP.stone); } }
      // a shop in each wall of the cave by the mouth, facing in
      for (const sd of [-1, 1]){ const th = sd*(ao + .35), fc = th + PI, [wx, wz] = at(th, rc - .03), [ax2, az2] = at(th, rc - .14), [gx, gz] = at(th, rc - .04);
        T.add(GEO.box, mat(wx, y0 + .5, wz, 0, fc, 0, .5, .5, .04), D.chance(.85) ? HP.lamp : HP.glassD); T.add(GEO.box, mat(ax2, y0 + .82, az2, 0, fc, 0, .6, .04, .24), D.pick(AW)); T.add(GEO.box, mat(gx, y0 + .96, gz, 0, fc, 0, .34, .09, .03), D.pick(SG)); }
      // out front: blade signs on the hill beside the mouth, lanterns, pots
      for (const sd of [-1, 1]){ const th = sd*(ao + .28), ro = ell(th) + .1, [bx, bz] = at(th, ro + .12), [nx, nz] = at(th, ro + .14);
        T.add(GEO.box, mat(bx, y0 + 1.3, bz, 0, th, 0, .07, .95, .3), HP.frame); T.add(GEO.box, mat(nx, y0 + 1.3, nz, 0, th, 0, .09, .82, .2), sd > 0 ? HP.neonP : HP.neonG);
        const lx = sd*(rc*Math.sin(ao) + .25), lz = zc + az + .55; T.add(GEO.cyl5, mat(lx, .55, lz, 0, 0, 0, .03, .85, .03), HP.rail); box(T, lx, 1.02, lz, .14, .18, .14, HP.lamp);
        for (let k = 0; k < 2; k++) if (D.chance(.8)) pot(T, D, sd*D.r(.4, rc*Math.sin(ao)), .12, zc + az + D.r(.3, .6), 1); }
      // a tree fern or two on the hilltop
      for (let k = 0, n = D.i(1, 3); k < n; k++){ const th = D.r(-PI, PI), q = D.r(roc + .35, Math.max(roc + .4, ell(th)*shrink[shrink.length - 1] - .2)), [x, z] = at(th, q);
        T.add(GEO.cyl5, mat(x, Htop + .4, z, 0, 0, D.r(-.1, .1), .06, .8, .06), HP.wood); T.add(GEO.ico, mat(x, Htop + .85, z, 0, 0, 0, .5, .3, .5), D.pick(HP.leaf)); }
      return Htop + .1;
    } },
    // From the cavern colony (board 20): the ring rotunda, the viaduct arcade and the ring court (and the lagoon garden, which went to residential).
    // The ring rotunda: a round stone drum with an arched glass door under a canopy, then floors of glass each girdled by a
    // balcony with a rail and a ring of white neon, plants along the balconies; a shallow glass dome and a roof garden.
    rotunda: { name: 'Ring rotunda', com: true, r: 1.9, rb: 1.25, build(T, R, D, ctx){
      const fl = ctx.below ? R.i(1, 2) : R.i(2, 3), fh = .78, rr = R.r(.9, 1.0); let y = ctx.below ? 0 : .12;
      if (!ctx.below){ T.add(GEO.cyl16, mat(0, .06, 0, 0, 0, 0, 1.5, .12, 1.5), HP.stone);
        T.add(GEO.cyl16, mat(0, y + .45, 0, 0, 0, 0, rr + .15, .9, rr + .15), HP.cream);
        for (let k = 0; k < 8; k++){ const a = k/8*PI*2 + PI/8, x = Math.sin(a)*(rr + .16), z = Math.cos(a)*(rr + .16); if (Math.abs(a - PI*2) < .5 || a < .5) continue;
          T.add(GEO.box, mat(x, y + .45, z, 0, a, 0, .22, .4, .03), D.chance(.7) ? HP.lamp : HP.glassD); T.add(GEO.cyl8, mat(x, y + .65, z, PI/2, a, 0, .11, .03, .11), HP.frame); }
        box(T, 0, y + .36, rr + .16, .5, .62, .04, HP.glass2); T.add(GEO.cyl8, mat(0, y + .67, rr + .16, PI/2, 0, 0, .25, .045, .25), HP.glass2);   // (the arched door)
        box(T, 0, y + .9, rr + .4, .9, .04, .55, HP.glassT); for (const sx of [-1, 1]) box(T, sx*.42, y + .45, rr + .62, .03, .9, .03, HP.frame);   // (its glass canopy)
        y += .9; ringBal(y); }
      for (let f = 0; f < fl; f++){ const r = rr - f*.04;
        T.add(GEO.cyl16, mat(0, y + fh/2, 0, 0, 0, 0, r, fh - .02, r), D.chance(.6) ? HP.glass2 : HP.glassT);
        for (let k = 0; k < 12; k++){ const a = k/12*PI*2; box(T, Math.sin(a)*r, y + fh/2, Math.cos(a)*r, .05, fh, .05, HP.frame); }
        y += fh; if (f < fl - 1 || ctx.above) ringBal(y); }
      function ringBal(yb){ T.add(GEO.cyl16, mat(0, yb + .02, 0, 0, 0, 0, rr + .28, .08, rr + .28), HP.cream);
        for (let k = 0; k < 16; k++){ const a = k/16*PI*2; box(T, Math.sin(a)*(rr + .25), yb + .15, Math.cos(a)*(rr + .25), .025, .22, .025, HP.rail); } T.add(GEO.ring, mat(0, yb + .26, 0, 0, 0, 0, rr + .25, .03, rr + .25), HP.rail); T.add(GEO.ring, mat(0, yb - .03, 0, 0, 0, 0, rr + .3, .03, rr + .3), HP.ringW);
        for (let k = 0; k < 3; k++) if (D.chance(.7)){ const a = D.r(0, PI*2); plant(T, D, Math.sin(a)*(rr + .14), yb + .06, Math.cos(a)*(rr + .14), .8); }
        if (D.chance(.5)){ const a = D.r(0, PI*2); T.add(GEO.ico, mat(Math.sin(a)*(rr + .28), yb - .2, Math.cos(a)*(rr + .28), 0, 0, 0, .07, .3, .07), D.pick(HP.leaf)); } }
      let top;
      if (!ctx.above){ T.add(GEO.cyl16, mat(0, y + .03, 0, 0, 0, 0, rr + .06, .06, rr + .06), HP.cream); T.add(GEO.dome, mat(0, y + .06, 0, 0, 0, 0, rr*.75, .35, rr*.75), HP.glass2);
        T.add(GEO.ring, mat(0, y + .03, 0, 0, 0, 0, rr + .09, .03, rr + .09), HP.ringW); T.add(GEO.cyl5, mat(0, y + .5, 0, 0, 0, 0, .025, .3, .025), HP.metal);
        for (let k = 0; k < 6; k++){ const a = k/6*PI*2 + D.r(-.3, .3); plant(T, D, Math.sin(a)*(rr - .1), y + .06, Math.cos(a)*(rr - .1), 1.0); }
        top = y + .06; }
      else { T.add(GEO.cyl16, mat(0, y - .03, 0, 0, 0, 0, rr + .1, .06, rr + .1), HP.cream); top = y; }
      return top;
    } },
    // The viaduct arcade: a run of stone arches carrying a planted walk, a little shop tucked under each arch (lit window,
    // awning, sign) with a lantern hung from the keystone; on top a rail, planters spilling vines down the face, lamps.
    viaduct: { name: 'Viaduct arcade', com: true, r: 2.0, rb: 1.4, build(T, R, D, ctx){
      const n = 3, L = R.r(2.6, 3.0), d = R.r(.85, 1.0), y0 = ctx.below ? 0 : .12, H = y0 + R.r(1.2, 1.4), pw = .24, bw = (L - (n + 1)*pw)/n, ar = bw/2, spr = H - .12 - ar;
      const AW = [HP.terra, HP.teal, HP.butter, HP.rose, HP.sea], SG = [HP.neonG, HP.neonP, HP.lamp, HP.ringW], stoneC = R.pick([HP.stone, PAL.rock[1], HP.cream]);
      if (!ctx.below) box(T, 0, .06, .1, L + .5, .12, d + .8, HP.stone);
      box(T, 0, (y0 + H)/2, -d/2 + .06, L, H - y0, .12, PAL.rock[2]);   // (the back of the bays: the shops' walls)
      for (let i = 0; i <= n; i++){ const x = -L/2 + pw/2 + i*(bw + pw); box(T, x, (y0 + H)/2, 0, pw, H - y0, d, stoneC); box(T, x, y0 + .06, 0, pw + .06, .12, d + .06, HP.cream); }
      for (let i = 0; i < n; i++){ const cx = -L/2 + pw + bw/2 + i*(bw + pw);
        for (let x = -ar; x < ar - .01; x += .12){ const xm = x + .06, ay = spr + Math.sqrt(Math.max(0, ar*ar - xm*xm)); box(T, cx + xm, (ay + H)/2, d/2 - .12, .13, H - ay + .02, .24, stoneC); }
        box(T, cx, spr - .02, d/2 - .06, bw + .02, .04, .14, HP.cream);   // (the springing line)
        const wy = y0 + .45, sz = -d/2 + .14; box(T, cx, wy, sz, bw*.75, .5, .04, D.chance(.85) ? HP.lamp : HP.glassD); box(T, cx, wy, sz - .01, bw*.82, .56, .02, HP.frame);
        box(T, cx, wy + .32, sz + .12, bw*.85, .04, .24, D.pick(AW)); box(T, cx, wy + .44, sz + .02, bw*.5, .08, .03, D.pick(SG));
        box(T, cx, spr + ar - .25, d/2 - .2, .02, .2, .02, HP.rail); box(T, cx, spr + ar - .38, d/2 - .2, .12, .14, .12, D.pick([HP.lamp, HP.lanternR]));
        if (!ctx.below && D.chance(.7)) pot(T, D, cx + D.r(-bw*.3, bw*.3), y0, d/2 + .15, .8); }
      box(T, 0, H + .07, 0, L + .12, .14, d + .2, HP.cream);
      const top = H + .14;
      for (let j = 0; j < 6; j++) if (D.chance(.65)) T.add(GEO.ico, mat(-L/2 + .2 + j*(L - .4)/5 + D.r(-.1, .1), H - .12, d/2 + .1, 0, 0, 0, .07, D.r(.24, .36), .07), D.pick(HP.leaf));
      if (!ctx.above){
        for (const sz of [-1, 1]){ for (let k = 0; k <= 8; k++) box(T, -L/2 + .05 + k*(L - .1)/8, top + .14, sz*(d/2 + .06), .03, .28, .03, HP.rail); box(T, 0, top + .28, sz*(d/2 + .06), L, .04, .04, HP.rail); }
        box(T, 0, top + .08, d/2 - .08, L - .2, .14, .18, HP.terra2); for (let k = 0; k < 6; k++) plant(T, D, -L/2 + .3 + k*(L - .6)/5, top + .14, d/2 - .08, .9);
        for (const sx of [-1, 1]){ const lx = sx*(L/2 - .3); T.add(GEO.cyl5, mat(lx, top + .35, -d/2 + .15, 0, 0, 0, .025, .7, .025), HP.metal); T.add(GEO.ico, mat(lx, top + .74, -d/2 + .15, 0, 0, 0, .07, .07, .07), HP.ringW); }
        if (D.chance(.6)){ const tx = D.r(-L*.2, L*.2); T.add(GEO.cyl5, mat(tx, top + .4, -.05, 0, 0, 0, .05, .8, .05), HP.wood); T.add(GEO.ico, mat(tx, top + .85, -.05, 0, 0, 0, .45, .3, .45), D.pick(HP.leaf)); } }
      return top;
    } },
    // The ring court: two floors of shops in a ring round an open court, glass inside and out, white neon round each floor's
    // edge, a gap in the front to walk in; in the court a tree and a little round pool; on top a ring of garden, its vines
    // hanging down into the court.
    ringcourt: { name: 'Ring court', com: true, solo: true, r: 2.6, rb: 2.25, build(T, R, D, ctx){
      const y0 = .12, Ro = R.r(2.0, 2.15), Ri = R.r(1.05, 1.15), fh = .8, fl = 2, NS = 20, gap = .32;
      const at = (th, r) => [Math.sin(th)*r, Math.cos(th)*r];
      T.add(GEO.cyl16, mat(0, .06, 0, 0, 0, 0, Ro + .3, .12, Ro + .3), HP.stone);
      T.add(GEO.cyl16, mat(0, y0 + .01, 0, 0, 0, 0, Ri, .02, Ri), HP.cream);
      for (let f = 0; f <= fl; f++){ const y = y0 + f*fh;
        for (let i = 0; i < NS; i++){ const th = (i + .5)/NS*PI*2 - PI, door = f === 0 && Math.abs(th) < gap, cw = 2*Ro*Math.sin(PI/NS) + .05, ci = 2*Ri*Math.sin(PI/NS) + .03;
          const [sx, sz] = at(th, (Ri + Ro)/2);
          if (f > 0 || !door) T.add(GEO.box, mat(sx, y + (f ? .04 : .03), sz, 0, th, 0, cw, f ? .1 : .06, Ro - Ri), f === fl ? HP.cream : HP.stone);   // (a floor, or the roof)
          if (f === fl) continue;
          if (door){ const [px, pz] = at(th, Ro); T.add(GEO.box, mat(px, y + .5, pz, 0, th, 0, .04, .9, .06), HP.frame); continue; }
          const [ox, oz] = at(th, Ro - .03), [ix, iz] = at(th, Ri + .03), lit = c => D.chance(c) ? HP.lamp : HP.glassD;
          T.add(GEO.box, mat(ox, y + fh/2 + .04, oz, 0, th, 0, cw - .06, fh - .14, .04), i % 3 === 0 ? lit(.7) : HP.glassT);
          T.add(GEO.box, mat(ix, y + fh/2 + .04, iz, 0, th, 0, ci - .05, fh - .14, .04), i % 2 ? lit(.75) : HP.glass2);
          const [mx, mz] = at(th + PI/NS, Ro - .02), [nx, nz] = at(th + PI/NS, Ri + .02); T.add(GEO.box, mat(mx, y + fh/2 + .04, mz, 0, th, 0, .05, fh, .05), HP.frame); T.add(GEO.box, mat(nx, y + fh/2 + .04, nz, 0, th, 0, .05, fh, .05), HP.frame);
          if (f === 0 && i % 4 === 1){ const [ax, az] = at(th, Ri - .1); T.add(GEO.box, mat(ax, y + .72, az, 0, th, 0, ci + .05, .04, .22), D.pick([HP.terra, HP.teal, HP.butter, HP.rose])); } }
        if (f > 0){ T.add(GEO.ring, mat(0, y + .02, 0, 0, 0, 0, Ro + .02, .03, Ro + .02), HP.ringW); } }
      const top = y0 + fl*fh + .09;
      for (let k = 0; k < 10; k++){ const th = D.r(-PI, PI), [x, z] = at(th, D.r(Ri + .2, Ro - .2)); plant(T, D, x, top, z, D.r(1.0, 1.4)); }
      for (let k = 0; k < 8; k++){ const th = D.r(-PI, PI), [x, z] = at(th, Ri - .02); T.add(GEO.ico, mat(x, top - .2, z, 0, 0, 0, .07, D.r(.24, .36), .07), D.pick(HP.leaf)); }
      for (let i = 0; i < 24; i++){ const th = i/24*PI*2, [x, z] = at(th, Ro - .05); box(T, x, top + .12, z, .03, .24, .03, HP.rail); }
      T.add(GEO.ring, mat(0, top + .24, 0, 0, 0, 0, Ro - .05, .03, Ro - .05), HP.rail);
      // the court: a tree, a little pool, benches
      T.add(GEO.cyl5, mat(-.25, y0 + .7, -.2, 0, 0, .08, .07, 1.4, .07), HP.wood); T.add(GEO.ico, mat(-.2, y0 + 1.45, -.2, 0, 0, 0, .7, .45, .7), D.pick(HP.leaf));
      T.add(GEO.cyl16, mat(.35, y0 + .07, .25, 0, 0, 0, .38, .12, .38), HP.stone); T.add(GEO.cyl16, mat(.35, y0 + .13, .25, 0, 0, 0, .32, .03, .32), HP.pool);
      for (const a of [2.2, 4.0]){ const [x, z] = at(a, Ri - .3); T.add(GEO.box, mat(x, y0 + .12, z, 0, a, 0, .45, .06, .16), HP.wood); }
      return top;
    } },
    // RESIDENTIAL, though it came from the colony. The lagoon garden: a round pool in a stone rim, softly aglow at night, lily pads; a curving walk out to an island with a
    // tree; lamp posts round the rim with white globes; a little glass cafe on the rim with an awning, tables out front.
    lagoon: { name: 'Lagoon garden', solo: true, r: 2.6, rb: 2.25, build(T, R, D, ctx){
      const y0 = .12, Rp = R.r(1.85, 2.0), at = (th, r) => [Math.sin(th)*r, Math.cos(th)*r];
      T.add(GEO.cyl16, mat(0, .06, 0, 0, 0, 0, Rp + .4, .12, Rp + .4), HP.stone);
      T.add(GEO.ring, mat(0, y0 + .1, 0, 0, 0, 0, Rp + .1, .2, Rp + .1), HP.cream); T.add(GEO.ring, mat(0, y0 + .1, 0, 0, 0, 0, Rp, .2, Rp), HP.stone);
      T.add(GEO.cyl16, mat(0, y0 + .12, 0, 0, 0, 0, Rp, .04, Rp), HP.pool);
      for (let k = 0; k < 7; k++){ const a = D.r(0, PI*2), q = D.r(.5, Rp - .3), [x, z] = at(a, q); T.add(GEO.cyl8, mat(x, y0 + .15, z, 0, 0, 0, D.r(.1, .2), .01, D.r(.1, .2)), HP.lily); }
      const ia = R.r(-.6, .6), [ix, iz] = at(ia + PI, Rp*.35);   // (the island, toward the back)
      T.add(GEO.cyl16, mat(ix, y0 + .14, iz, 0, 0, 0, .5, .2, .5), HP.stone); T.add(GEO.cyl16, mat(ix, y0 + .25, iz, 0, 0, 0, .44, .04, .44), HP.moss);
      T.add(GEO.cyl5, mat(ix, y0 + .85, iz, 0, 0, .06, .07, 1.2, .07), HP.wood); T.add(GEO.ico, mat(ix, y0 + 1.5, iz, 0, 0, 0, .75, .45, .75), D.pick(HP.leaf));
      for (let k = 0; k < 4; k++) plant(T, D, ix + D.r(-.3, .3), y0 + .27, iz + D.r(-.3, .3), .9);
      // the walk: a curve of stone slabs from the front rim out to the island
      const N = 8, [fx, fz] = at(.5, Rp + .05);
      for (let k = 0; k <= N; k++){ const t = k/N, bx = fx + (ix - fx)*t + Math.sin(t*PI)*.55, bz = fz + (iz - fz)*t, dx = (ix - fx) + Math.cos(t*PI)*PI*.55, dz = iz - fz;
        T.add(GEO.box, mat(bx, y0 + .24 + Math.sin(t*PI)*.08, bz, 0, Math.atan2(dx, dz), 0, .42, .07, .3), HP.cream); }
      for (let k = 0; k < 6; k++){ const a = k/6*PI*2 + .3, [x, z] = at(a, Rp + .25); T.add(GEO.cyl5, mat(x, y0 + .45, z, 0, 0, 0, .025, .9, .025), HP.metal); T.add(GEO.ico, mat(x, y0 + .93, z, 0, 0, 0, .08, .08, .08), HP.ringW); }
      // the cafe on the rim
      const ca = R.r(-2.4, -1.9)*(R.chance(.5) ? 1 : -1), [cx, cz] = at(ca, Rp + .05);
      T.add(GEO.cyl12, mat(cx, y0 + .45, cz, 0, 0, 0, .42, .8, .42), HP.glass2); T.add(GEO.cyl12, mat(cx, y0 + .87, cz, 0, 0, 0, .48, .06, .48), HP.cream);
      T.add(GEO.dome, mat(cx, y0 + .9, cz, 0, 0, 0, .4, .25, .4), HP.terra); T.add(GEO.ring, mat(cx, y0 + .85, cz, 0, 0, 0, .5, .03, .5), HP.ringW);
      for (let k = 0; k < 2; k++){ const a = ca + (k ? .35 : -.35), [tx, tz] = at(a, Rp + .3); T.add(GEO.cyl8, mat(tx, y0 + .2, tz, 0, 0, 0, .03, .4, .03), HP.metal); T.add(GEO.cyl8, mat(tx, y0 + .4, tz, 0, 0, 0, .14, .03, .14), HP.cream); }
      for (let k = 0; k < 5; k++){ const a = D.r(0, PI*2); if (Math.abs(a - ((ca + PI*2) % (PI*2))) < .5) continue; const [x, z] = at(a, Rp + .3); pot(T, D, x, y0, z, .9); }
      return y0 + .25;
    } },
    // INDUSTRIAL: power and food, run by drones and machines (the solarpunk farm boards). All stand alone on the ground.
    // Their light by night is a cool blue-white, set apart from the homes' gold and the shops' pinks; the fields are edged
    // in glowing blue. (The drones and machines that will work them come later; the hive and the barn are where they'll
    // launch from.)
    // The wind megaturbine: a mast far taller than anything else on the coast, tapering, banded, ringed with blue lights,
    // on an octagonal plinth with a service block; its nacelle and blades are a separate part that turns to face the wind
    // and spins (see ROTORS).
    turbine: { name: 'Wind megaturbine', ind: true, solo: true, rotor: true, r: 2.4, rb: 1.7, build(T, R, D, ctx){
      const y0 = .12, H = R.r(13, 15.5); ctx.hub = H;
      T.add(GEO.cyl8, mat(0, .25, 0, 0, PI/8, 0, 1.75, .5, 1.75), HP.stone); T.add(GEO.cyl8, mat(0, .52, 0, 0, PI/8, 0, 1.35, .08, 1.35), HP.cream);
      for (let k = 0; k < 8; k++){ const a = k/8*PI*2 + PI/8; box(T, Math.sin(a)*1.72, .53, Math.cos(a)*1.72, .12, .06, .12, HP.indBlue); }   // (lights round the plinth)
      box(T, 1.0, .9, .7, .9, .8, .8, HP.white); box(T, 1.0, 1.32, .7, 1.0, .06, .9, HP.metal); box(T, 1.0, .85, 1.11, .32, .5, .03, HP.indWhite);   // (the service block, its door lit)
      const segs = 7; for (let k = 0; k < segs; k++){ const t0 = k/segs, t1 = (k + 1)/segs, ya = .56 + (H - .56)*t0, yb = .56 + (H - .56)*t1, ra = .58 - .3*t0, rb = .58 - .3*t1;
        T.add(GEO.cyl12, mat(0, (ya + yb)/2, 0, 0, 0, 0, (ra + rb)/2, yb - ya + .01, (ra + rb)/2), k % 3 === 2 ? HP.cream : HP.white);
        if (k % 2 === 1) T.add(GEO.cyl12, mat(0, yb, 0, 0, 0, 0, rb + .04, .08, rb + .04), HP.indBlue); }   // (a ring of blue light every other band)
      T.add(GEO.cyl8, mat(0, H - .1, 0, 0, 0, 0, .34, .2, .34), HP.metal);
      for (let k = 0; k < 10; k++) box(T, -.3, 1.0 + k*(H - 2)/10, .45 - k*.01, .05, .05, .16, HP.metal);   // (rungs of the climbing ladder)
      return H; } },
    // The smart field: a plot of dark soil in beds, rows of crops (lettuce heads, a taller grain), the beds edged and divided
    // by rails of glowing blue (the board's grid of light), sensor posts at the corners, an irrigation pipe along one side.
    field: { name: 'Smart field', ind: true, solo: true, r: 4.6, rb: 4.1, build(T, R, D, ctx){
      // a 4 x 4 grid of plots, each its own crop, each edged in glowing blue; paved lanes between them and round them, wide
      // enough for the harvesters to drive (FIELD gives the layout to the machines)
      const y0 = .12, { P, Ln, E, S } = FIELD, CROPS = [[C(0x5f8f3e), C(0x76a64a)], [C(0x8fa83c), C(0xb5c060)], [C(0x3f7d5c), C(0x5a9a74)], [C(0x6f9a3a), C(0x9fb850)]];
      box(T, 0, .06, 0, S + .2, .12, S + .2, HP.stone); box(T, 0, y0 + .02, 0, S, .04, S, C(0xc9c2b2));   // (the paving: lanes and margin)
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){ const cx = FIELD.c(i), cz = FIELD.c(j), [c1, c2] = R.pick(CROPS), grain = R.chance(.3);
        box(T, cx, y0 + .06, cz, P, .08, P, HP.soil);
        for (let r_ = 0; r_ < 3; r_++){ const z = cz - P/2 + .2 + r_*(P - .4)/2;
          for (let x = cx - P/2 + .16; x <= cx + P/2 - .14; x += grain ? .12 : .2){
            if (grain) box(T, x, y0 + .22, z, .04, .24 + D.r(0, .05), .04, D.chance(.5) ? c1 : c2);
            else T.add(GEO.ico, mat(x, y0 + .16, z, 0, D.r(0, 3), 0, .09, .07, .09), D.chance(.5) ? c1 : c2); } }
        for (const [x, z, lx, lz] of [[cx, cz - P/2 - .03, P + .1, .05], [cx, cz + P/2 + .03, P + .1, .05], [cx - P/2 - .03, cz, .05, P + .1], [cx + P/2 + .03, cz, .05, P + .1]]) box(T, x, y0 + .1, z, lx, .05, lz, HP.indBlue); }
      for (let k = 0; k < 3; k++){ const l = FIELD.lane(k); for (let q = -1; q <= 1; q += 2) box(T, l, y0 + .05, q*(S/2 - .1), .04, .02, .2, HP.white); }   // (lane markings at the ends)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]){ T.add(GEO.cyl5, mat(sx*(S/2 - .05), y0 + .5, sz*(S/2 - .05), 0, 0, 0, .04, 1.0, .04), HP.metal); box(T, sx*(S/2 - .05), y0 + 1.02, sz*(S/2 - .05), .12, .07, .12, HP.indBlue); }
      return y0 + .3; } },
    // The geodesic dome greenhouse: a low ring wall with round windows, a glass dome ribbed in white (meridians and two
    // latitudes), an airlock porch at the front, rows of planters and a little tree inside showing through, grow lights
    // in a blue ring under the dome by night.
    dome: { name: 'Dome greenhouse', ind: true, solo: true, r: 2.1, rb: 1.75, build(T, R, D, ctx){
      const y0 = .12, rr = R.r(1.45, 1.65), wh = .5;
      T.add(GEO.cyl16, mat(0, .06, 0, 0, 0, 0, rr + .35, .12, rr + .35), HP.stone);
      T.add(GEO.cyl16, mat(0, y0 + wh/2, 0, 0, 0, 0, rr, wh, rr), R.pick([HP.white, HP.mist, HP.cream]));
      for (let k = 0; k < 8; k++){ const a = k/8*PI*2 + .2; if (Math.abs(Math.sin(a/2)) < .2) continue; T.add(GEO.cyl8, mat(Math.sin(a)*(rr + .01), y0 + wh/2, Math.cos(a)*(rr + .01), PI/2, a, 0, .1, .03, .1), HP.indWhite); }
      T.add(GEO.ring, mat(0, y0 + wh + .02, 0, 0, 0, 0, rr - .02, .06, rr - .02), HP.indBlue);
      T.add(GEO.dome, mat(0, y0 + wh, 0, 0, 0, 0, rr - .05, rr*.85, rr - .05), HP.ghGlass);
      for (let k = 0; k < 8; k++) T.add(GEO.ring, mat(0, y0 + wh, 0, PI/2, k/8*PI, 0, rr - .02, .04, rr*.86), HP.white);   // (meridian ribs: rings stood on edge, half of each under the wall)
      for (const f of [.45, .8]){ const ry = Math.sqrt(1 - f*f); T.add(GEO.ring, mat(0, y0 + wh + rr*.85*f, 0, 0, 0, 0, (rr - .02)*ry, .04, (rr - .02)*ry), HP.white); }
      box(T, 0, y0 + .4, rr + .25, .6, .8, .5, HP.white); box(T, 0, y0 + .38, rr + .51, .34, .62, .03, HP.ghGlass); box(T, 0, y0 + .83, rr + .25, .66, .06, .56, HP.metal);
      for (let k = 0; k < 6; k++) plant(T, D, D.r(-rr*.55, rr*.55), y0 + wh, D.r(-rr*.55, rr*.55), 1.2);
      T.add(GEO.cyl5, mat(.1, y0 + wh + .45, -.2, 0, 0, 0, .05, .9, .05), HP.wood); T.add(GEO.ico, mat(.1, y0 + wh + 1.0, -.2, 0, 0, 0, .45, .3, .45), D.pick(HP.leaf));
      return y0 + wh + rr*.85; } },
    // Glass tunnels: two or three hoop houses side by side, glass over white hoops, ends glazed with a door, crops in rows
    // inside, a blue light strip along each ridge.
    tunnels: { name: 'Glass tunnels', ind: true, solo: true, r: 2.5, rb: 2.1, build(T, R, D, ctx){
      const y0 = .12, n = R.i(2, 3), L = R.r(3.4, 4.0), rt = .62, gap = .2, W = n*2*rt + (n - 1)*gap;
      box(T, 0, .06, 0, W + .5, .12, L + .5, HP.stone);
      for (let i = 0; i < n; i++){ const cx = -W/2 + rt + i*(2*rt + gap);
        box(T, cx, y0 + .03, 0, 2*rt - .05, .06, L, HP.soil);
        for (let r_ = 0; r_ < 3; r_++) for (let z = -L/2 + .3; z <= L/2 - .3; z += .3) T.add(GEO.ico, mat(cx - rt*.55 + r_*rt*.55, y0 + .14, z, 0, D.r(0, 3), 0, .1, .08, .1), D.chance(.5) ? C(0x5f8f3e) : C(0x76a64a));
        T.add(GEO.half16, mat(cx, y0, 0, -PI/2, 0, 0, rt, L, rt), HP.ghGlass);
        for (let h = 0; h <= 5; h++){ const z = -L/2 + h*L/5; for (let s = 0; s < 8; s++){ const a = (s + .5)/8*PI; T.add(GEO.box, mat(cx + Math.cos(a)*(rt + .01), y0 + Math.sin(a)*(rt + .01), z, 0, 0, a, .04, 2*rt*Math.sin(PI/16) + .02, .05), HP.white); } }
        box(T, cx, y0 + rt + .02, 0, .04, .03, L - .1, HP.indBlue);
        box(T, cx, y0 + .3, L/2 + .01, .3, .55, .03, HP.white); box(T, cx, y0 + .3, L/2 + .03, .22, .45, .02, HP.indWhite); }
      return y0 + rt; } },
    // The solar barn: a dark timber barn under a big roof of solar panels tilted to the sun, battery cabinets along its side
    // with blue charge lights, a wide door open on a lit bay (where the machines will roll out), a small wind vane.
    barn: { name: 'Solar barn', ind: true, solo: true, r: 2.2, rb: 1.7, build(T, R, D, ctx){
      const y0 = .12, w = R.r(2.6, 3.0), d = R.r(1.8, 2.1), h = 1.1;
      box(T, 0, .06, .2, w + .7, .12, d + 1.1, HP.stone);
      box(T, 0, y0 + h/2, 0, w, h, d, R.pick([HP.timber, HP.rust2, C(0x3e4a4c)]));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(T, sx*w/2, y0 + h/2, sz*d/2, .1, h, .1, HP.metal);
      box(T, 0, y0 + .42, d/2 + .01, w*.55, .78, .03, HP.indWhite); box(T, 0, y0 + .83, d/2 + .03, w*.6, .06, .05, HP.metal);   // (the bay, lit)
      for (const sz of [-1, 1]){ const tz = sz*d/4, ty = y0 + h + .22 + (sz < 0 ? .35 : 0);   // (two banks of panels, the back one higher: a sawtooth)
        T.add(GEO.box, mat(0, ty, tz, -.32, 0, 0, w + .3, .06, d/2 + .15), HP.solar);
        for (let k = 1; k < 6; k++) T.add(GEO.box, mat(-(w + .3)/2 + k*(w + .3)/6, ty + .035, tz, -.32, 0, 0, .015, .02, d/2 + .15), HP.solarL); }
      box(T, 0, y0 + h + .2, -d/4, w, .4, .06, HP.metal);
      for (let k = 0; k < 3; k++){ const z = -d/2 + .35 + k*.55; box(T, w/2 + .25, y0 + .35, z, .36, .7, .42, HP.white); box(T, w/2 + .44, y0 + .45, z, .02, .3, .12, HP.indBlue); }
      T.add(GEO.cyl5, mat(-w/2 + .2, y0 + h + .9, -d/2 + .2, 0, 0, 0, .025, 1.2, .025), HP.metal); box(T, -w/2 + .2, y0 + h + 1.45, -d/2 + .2, .4, .04, .06, HP.metal);
      for (let k = 0; k < 3; k++) if (D.chance(.7)) pot(T, D, D.r(-w/2, -w/4), .12, d/2 + .4, 1);
      return y0 + h + .6; } },
    // The drone hive: a white mast on four legs carrying a saucer hangar (a flattened dome with a ring of docking ports and a
    // band of blue light), a landing deck under it ringed with lights, a lit lift door at its foot. The drones will come and
    // go from here.
    hive: { name: 'Drone hive', ind: true, solo: true, r: 2.2, rb: 1.6, build(T, R, D, ctx){
      const y0 = .12, H = R.r(3.4, 4.2), sr = R.r(1.25, 1.45);
      T.add(GEO.cyl12, mat(0, .06, 0, 0, 0, 0, 1.7, .12, 1.7), HP.stone); T.add(GEO.cyl12, mat(0, .15, 0, 0, 0, 0, 1.3, .06, 1.3), HP.cream);
      for (let k = 0; k < 12; k++){ const a = k/12*PI*2; box(T, Math.sin(a)*1.25, .2, Math.cos(a)*1.25, .08, .04, .08, HP.indBlue); }
      T.add(GEO.cyl12, mat(0, y0 + H/2, 0, 0, 0, 0, .32, H, .32), HP.white); box(T, 0, y0 + .4, .33, .3, .6, .03, HP.indWhite);
      for (let k = 0; k < 4; k++){ const a = k/4*PI*2 + PI/4, lx = Math.sin(a), lz = Math.cos(a); seg(T, V3(lx*1.05, y0, lz*1.05), V3(lx*.35, y0 + H*.55, lz*.35), .08, .08, HP.metal, 0); }
      const sy = y0 + H; T.add(GEO.cyl16, mat(0, sy, 0, 0, 0, 0, sr, .22, sr), HP.white); T.add(GEO.dome, mat(0, sy + .1, 0, 0, 0, 0, sr*.82, .55, sr*.82), HP.white);
      T.add(GEO.dome, mat(0, sy - .1, 0, PI, 0, 0, sr*.9, .3, sr*.9), HP.mist);   // (its underside)
      T.add(GEO.ring, mat(0, sy, 0, 0, 0, 0, sr + .02, .07, sr + .02), HP.indBlue);
      for (let k = 0; k < 8; k++){ const a = k/8*PI*2; T.add(GEO.cyl8, mat(Math.sin(a)*sr*.7, sy + .32, Math.cos(a)*sr*.7, 0, 0, 0, .14, .06, .14), HP.glassD); }   // (docking ports)
      T.add(GEO.cyl8, mat(0, sy + .7, 0, 0, 0, 0, .12, .12, .12), HP.indBlue); T.add(GEO.cyl5, mat(0, sy + .95, 0, 0, 0, 0, .02, .4, .02), HP.metal);
      return sy + .7; } },
    // The vertical farm: a tall glass capsule (a cylinder with a rounded top) on a white collar, white bands at each floor,
    // the floors inside green with crops and lit in blue-white, a lift tube up one side.
    vfarm: { name: 'Vertical farm', ind: true, solo: true, r: 1.8, rb: 1.3, build(T, R, D, ctx){
      const y0 = .12, rr = R.r(.95, 1.1), fl = R.i(4, 6), fh = .62, H = fl*fh;
      T.add(GEO.cyl16, mat(0, .06, 0, 0, 0, 0, rr + .45, .12, rr + .45), HP.stone); T.add(GEO.cyl16, mat(0, y0 + .2, 0, 0, 0, 0, rr + .12, .4, rr + .12), HP.white);
      for (let f = 0; f < fl; f++){ const y = y0 + .4 + f*fh;
        T.add(GEO.cyl16, mat(0, y + .03, 0, 0, 0, 0, rr - .08, .06, rr - .08), HP.white);
        T.add(GEO.cyl16, mat(0, y + .14, 0, 0, 0, 0, rr - .18, .16, rr - .18), f % 2 ? C(0x5f8f3e) : C(0x76a64a));
        T.add(GEO.cyl16, mat(0, y + fh - .06, 0, 0, 0, 0, rr - .2, .03, rr - .2), HP.indWhite);   // (grow lights)
        T.add(GEO.ring, mat(0, y + .02, 0, 0, 0, 0, rr + .02, .06, rr + .02), HP.white); }
      T.add(GEO.ring, mat(0, y0 + .4 + H/2, 0, 0, 0, 0, rr, H, rr), HP.ghGlass);
      T.add(GEO.dome, mat(0, y0 + .4 + H, 0, 0, 0, 0, rr, rr*.7, rr), HP.ghGlass); T.add(GEO.ring, mat(0, y0 + .4 + H, 0, 0, 0, 0, rr + .03, .08, rr + .03), HP.indBlue);
      T.add(GEO.cyl8, mat(rr + .12, y0 + .4 + H/2, 0, 0, 0, 0, .14, H + .3, .14), HP.ghGlass); T.add(GEO.cyl8, mat(rr + .12, y0 + .4 + H + .17, 0, 0, 0, 0, .16, .05, .16), HP.indBlue); T.add(GEO.cyl8, mat(rr + .12, y0 + .5 + H*.4, 0, 0, 0, 0, .1, .2, .1), HP.white);
      return y0 + .4 + H + rr*.7; } },
  };
  // COM: a shop (the commercial zone's); SOLO: one that stands alone on the ground (nothing stacks on it, it stacks on nothing)
  // industry's blues: each building lit in one shade of neon blue, picked by its seed (its rails, rings, lights and the
  // blue-white of its windows together): ice cyan, cyan, azure, cornflower
  const IND_SHADES = [[0x7fe9ff, 0xdaf8ff], [0x2fcfff, 0xc6f0ff], [0x4f98ff, 0xcfe0ff], [0x7a80ff, 0xdcdcff]].map(([b, w]) => {
    const B = C(b).multiplyScalar(1.1), W = C(w).multiplyScalar(1.05); GLOW.set(B, .25).set(W, .25); return new Map([[HP.indBlue, B], [HP.indWhite, W]]); });
  const indShade = seed => (Math.imul(seed | 0, 2246822519) >>> 0) % IND_SHADES.length;
  const COM = k => !!(KINDS[k] && KINDS[k].com), SOLO = k => !!(KINDS[k] && KINDS[k].solo), RES_KEYS = Object.keys(KINDS).filter(k => !KINDS[k].com && !KINDS[k].ind), COM_KEYS = Object.keys(KINDS).filter(k => KINDS[k].com), IND_KEYS = Object.keys(KINDS).filter(k => KINDS[k].ind), IND = k => !!(KINDS[k] && KINDS[k].ind);
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
    let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; for (const w of W){ a0 = Math.min(a0, w[0]); b0 = Math.min(b0, w[1]); a1 = Math.max(a1, w[0]); b1 = Math.max(b1, w[1]); }
    for (const q of PIECES){ if (skip && skip.includes(q)) continue; if (q.y > y1 - .05 || q.y + q.h < y0 + .05) continue; if (q.bb && (q.bb[0] > a1 || q.bb[2] < a0 || q.bb[1] > b1 || q.bb[3] < b0)) continue; if (hullsHit(W, q.hullW)) return q; }
    return null; }
  // is the point (x, z) at height y inside a block (but not those in skip)
  const solidAt = (x, z, y0, y1, skip, list = PIECES) => list.some(q => q.y < y1 && q.y + q.h > y0 && (!q.bb || (x >= q.bb[0] && x <= q.bb[2] && z >= q.bb[1] && z <= q.bb[3])) && !(skip && skip.includes(q)) && inHull(q.hullW, x, z));
  /* ---------- foliage parts: blades, flowers, fern fronds, seed heads (the grass brush and the homes' plants both use them) ---------- */
  const gU = { wTime: { value: 0 } };
  const grassM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true, side: THREE.DoubleSide }), true, false, false, null, gU);
  // (a sage, blue-leaning green, set apart from the meadow's yellow-green and kin to the homes' teal; warm ochre and cream at the tips)
  // the wind's glow by night (see WIND_GLSL): the meadow and the homes' plants a pale foxfire green, kin to the sage
  const WGLOW = [.58, 1.0, .72];
  const GG = { greenA: [.37, .57, .38], greenB: [.29, .49, .38], greenC: [.5, .65, .42], dry: [.74, .66, .42], tip: [.92, .91, .7], fern: [.27, .49, .38], reed: [.76, .66, .44], head: [.88, .74, .5] };
  const FLOWERS = [[.95, .55, .42], [.96, .74, .76], [.72, .63, .88], [.99, .86, .46], [.97, .95, .9], [.93, .45, .52]];
  // a little indexed-mesh builder: positions, normals (mostly up, so a blade is lit like the meadow, whichever side shows),
  // colors, and aH
  // (gc: the glow color the vertices made next take, for the wind's glow by night (see SWAY); black is none)
  class GB { constructor(gc = null){ this.P = []; this.N = []; this.C = []; this.H = []; this.I = []; this.GL = []; this.gc = gc || [0, 0, 0]; }
    v(x, y, z, nx, ny, nz, c, h){ this.P.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; this.N.push(nx/l, ny/l, nz/l); this.C.push(c[0], c[1], c[2]); this.H.push(h); this.GL.push(this.gc[0], this.gc[1], this.gc[2]); return this.P.length/3 - 1; }
    tri(a, b, c){ this.I.push(a, b, c); }
    mesh(){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(this.H, 1)); g.setAttribute('aG', new THREE.Float32BufferAttribute(this.GL, 3)); g.setIndex(this.I); return g; } }
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
    if (!fol || !fol.length) return null; const G = new GB(WGLOW);
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
    const T = new Tris(true, shopOf(kind, seed)), k = KIND_KEYS.indexOf(kind) + 1; if (KINDS[kind].ind) T.remap = IND_SHADES[indShade(seed)]; const R = rng(Math.imul(seed, 2654435761) ^ k*97), D = rng(Math.imul(seed, 1597334677) ^ k*131);
    const cx_ = { below, above }, top = KINDS[kind].build(T, R, D, cx_), cut = below ? .1 : .6, pts = [];
    let hmax = top; for (let i = 0; i < T.p.length; i += 3){ if (T.p[i + 1] > hmax) hmax = T.p[i + 1]; if (T.p[i + 1] > cut) pts.push([T.p[i], T.p[i + 2]]); }
    g = { geo: T.geo(), fol: folGeo(T.fol), top, hull: hull2(pts), h: hmax, hub: cx_.hub }; geoCache.set(key, g);
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
    const m = new THREE.Mesh(b.geo, p.anim ? p.anim.mat : pieceM); m.castShadow = !p.anim; m.receiveShadow = true; m.customDepthMaterial = landDepth; m.frustumCulled = true;
    if (b.fol){ if (!b.fol.boundingSphere){ b.fol.computeBoundingSphere(); b.fol.boundingSphere.radius += .6; } const f = new THREE.Mesh(b.fol, grassM); f.receiveShadow = true; f.frustumCulled = true; f.visible = !p.anim; f.raycast = () => {}; m.add(f); m.userData.fol = f; }   // (its plants, swaying; shown once it's painted in)
    m.position.set(p.x, p.y, p.z); m.rotation.y = p.rot; m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(); m.userData.piece = p; p.top = b.top; p.h = b.h; p.hullL = b.hull; p.hullW = placeHull(b.hull, p.x, p.z, p.rot);
    p.bb = p.hullW.reduce((o, q) => [Math.min(o[0], q[0]), Math.min(o[1], q[1]), Math.max(o[2], q[0]), Math.max(o[3], q[1])], [1e9, 1e9, -1e9, -1e9]);
    m.visible = !!p.anim;   // (a finished home is drawn in its area's batch, below; its own mesh stays for picking)
    return m; }
  /* ---------- homes drawn in batches: every finished home in a 24-unit area merged into one mesh, and its plants into
     another, so a neighborhood is two draws instead of two per home (the sky city's trick for its buildings). A batch is
     made again when a home in it comes, goes or changes. ---------- */
  const HB = { size: 24, map: new Map(), dirty: new Set() };
  const regKey = p => Math.floor(p.x/HB.size) + ',' + Math.floor(p.z/HB.size);
  function mergeInto(geos, indexed){
    let nv = 0, ni = 0; for (const [g] of geos){ nv += g.attributes.position.count; if (indexed) ni += g.index.count; }
    const P = new Float32Array(nv*3), N = new Float32Array(nv*3), Cc = new Float32Array(nv*3), X = new Float32Array(nv), I = indexed ? new Uint32Array(ni) : null, GLc = indexed ? new Float32Array(nv*3) : null;
    let o = 0, oi = 0;
    for (const [g, M] of geos){ const pa = g.attributes.position.array, na = g.attributes.normal.array, ca = g.attributes.color.array, xa = indexed ? g.attributes.aH.array : g.attributes.glow ? g.attributes.glow.array : null, n = g.attributes.position.count;
      if (!M){ P.set(pa, o*3); N.set(na, o*3); }
      else { const e = M.elements;   // (homes are only turned about y and moved: the normals turn with the same matrix)
        for (let k = 0, a = 0, w = o*3; k < n; k++, a += 3, w += 3){ const x = pa[a], y = pa[a + 1], z = pa[a + 2];
          P[w] = e[0]*x + e[4]*y + e[8]*z + e[12]; P[w + 1] = e[1]*x + e[5]*y + e[9]*z + e[13]; P[w + 2] = e[2]*x + e[6]*y + e[10]*z + e[14];
          const nx = na[a], ny = na[a + 1], nz = na[a + 2]; N[w] = e[0]*nx + e[4]*ny + e[8]*nz; N[w + 1] = e[1]*nx + e[5]*ny + e[9]*nz; N[w + 2] = e[2]*nx + e[6]*ny + e[10]*nz; } }
      if (xa) X.set(xa, o);
      Cc.set(ca, o*3); if (GLc && g.attributes.aG) GLc.set(g.attributes.aG.array, o*3);
      if (indexed){ const ia = g.index.array; for (let k = 0; k < ia.length; k++) I[oi + k] = ia[k] + o; oi += ia.length; }
      o += n; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute(indexed ? 'aH' : 'glow', new THREE.BufferAttribute(X, 1)); if (indexed){ g.setIndex(new THREE.BufferAttribute(I, 1)); g.setAttribute('aG', new THREE.BufferAttribute(GLc, 3)); }
    g.computeBoundingSphere(); if (indexed) g.boundingSphere.radius += .6; return g; }
  function buildBatch(key){
    const old = HB.map.get(key); if (old){ for (const m of old){ scene.remove(m); m.geometry.dispose(); } HB.map.delete(key); }
    const ps = PIECES.filter(p => !p.anim && p.mesh && regKey(p) === key); if (!ps.length) return;
    const out = [], hg = mergeInto(ps.map(p => [p.mesh.geometry, p.mesh.matrixWorld]), false);
    const hm = new THREE.Mesh(hg, pieceM); hm.castShadow = hm.receiveShadow = true; hm.customDepthMaterial = landDepth; hm.matrixAutoUpdate = false; hm.raycast = () => {}; hm.userData.batch = key; scene.add(hm); out.push(hm);
    const fs = ps.filter(p => p.mesh.userData.fol).map(p => [p.mesh.userData.fol.geometry, p.mesh.matrixWorld]);
    if (fs.length){ const fm = new THREE.Mesh(mergeInto(fs, true), grassM); fm.receiveShadow = true; fm.matrixAutoUpdate = false; fm.raycast = () => {}; fm.userData.batch = key; fm.userData.fol = true; scene.add(fm); out.push(fm); }
    HB.map.set(key, out); SHD.dirty = true; }
  function batchTick(){ if (!HB.dirty.size) return false; for (const k of HB.dirty) buildBatch(k); HB.dirty.clear(); return true; }
  // The megaturbines' moving part (ROTORS): a nacelle turned to face into the wind (the same wind the grass bends in), and
  // three long white blades on its hub, spinning slowly; drawn on its own, outside the batches, and kept out of the cached
  // shadows (a turning shadow would mean redrawing them every frame).
  // (the wind up at the hub isn't the wind at the ground: it veers with height (the Ekman spiral), and here it's turned
  // so the rotors face the usual view three-quarters on, their blades reading as a wheel and not a line)
  const ROTORS = new Set(), WIND_YAW = HOME.yaw - .45;
  const rotorGeo = IND_SHADES.map(sh => { const N = new Tris(), B = new Tris(); N.remap = B.remap = sh;
    N.add(GEO.box, mat(0, 0, -.25, 0, 0, 0, .7, .7, 2.0), HP.white); N.add(GEO.box, mat(0, -.3, -.25, 0, 0, 0, .72, .1, 2.02), HP.metal); N.add(GEO.box, mat(0, .1, -1.27, 0, 0, 0, .5, .3, .05), HP.indBlue);
    B.add(GEO.cone8, mat(0, 0, .95, PI/2, 0, 0, .38, .7, .38), HP.white);
    for (let k = 0; k < 3; k++){ const a = k/3*PI*2, L = 6.2, n = 5;
      for (let i = 0; i < n; i++){ const t0 = i/n, t1 = (i + 1)/n, r0 = .3 + L*t0, r1 = .3 + L*t1, w = .42 - .3*(t0 + t1)/2;
        B.add(GEO.box, mat(Math.sin(a)*(r0 + r1)/2, Math.cos(a)*(r0 + r1)/2, .75, 0, .12, -a, w, r1 - r0 + .02, .07), i === n - 1 ? HP.indBlue : HP.white); } }
    return { n: N.geo(), b: B.geo() }; });
  function makeRotor(p, hub){ const rg = rotorGeo[indShade(p.seed)], g = new THREE.Group(), n = new THREE.Mesh(rg.n, pieceM), b = new THREE.Mesh(rg.b, pieceM);
    for (const m of [n, b]){ m.receiveShadow = true; m.castShadow = false; m.raycast = () => {}; g.add(m); }
    g.position.set(p.x, p.y + hub + .2, p.z); g.rotation.y = WIND_YAW; g.userData.spin = b; b.rotation.z = (p.seed % 7)*.9; return g; }
  /* ---------- the drones and machines that work the industrial zone (AGENTS) ---------- */
  // Drones live in the drone hives, three to a hive: one at a time they lift off a docking port, fly out at cruising height
  // to a field, a glass tunnel or a dome nearby, sweep it low in passes, scanning with a blue light under them, then fly
  // home and settle back in. Machines live in the solar barns, two to a barn: one rolls out of the lit bay to a field the
  // way is clear to, drives its crop rows up and down like a harvester, and rolls home. And on every drone rail a shuttle
  // pod glides from end to end, pausing at each. All of them are copies of one shape each (one draw per kind), moved each
  // frame along a list of waypoints; drones carry a soft shadow under them; their lights glow by night.
  const AG = { list: [], key: '', t: 0 };
  const agGeo = (() => { const D = new Tris(), V = new Tris(), P = new Tris();
    D.add(GEO.box, mat(0, 0, 0, 0, 0, 0, .2, .06, .2), HP.white); D.add(GEO.cyl8, mat(0, .04, 0, 0, 0, 0, .08, .04, .08), HP.indBlue);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){ D.add(GEO.box, mat(x*.1, 0, z*.1, 0, Math.atan2(x, z), 0, .03, .03, .2), HP.metal); D.add(GEO.cyl8, mat(x*.17, .03, z*.17, 0, 0, 0, .085, .01, .085), HP.glassD); }
    D.add(GEO.cyl8, mat(0, -.045, 0, 0, 0, 0, .05, .03, .05), HP.indBlue); D.add(GEO.box, mat(0, 0, .11, 0, 0, 0, .05, .03, .02), HP.indWhite);
    V.add(GEO.box, mat(0, .12, 0, 0, 0, 0, .34, .14, .5), HP.white); V.add(GEO.box, mat(0, .22, -.02, 0, 0, 0, .3, .03, .4), HP.solar);
    for (const x of [-.19, .19]) for (const z of [-.16, .16]) V.add(GEO.cyl8, mat(x, .07, z, 0, 0, PI/2, .07, .06, .07), HP.rail);
    V.add(GEO.box, mat(0, .1, .3, 0, 0, 0, .44, .08, .08), HP.metal); for (let k = 0; k < 5; k++) V.add(GEO.box, mat(-.18 + k*.09, .05, .34, 0, 0, 0, .02, .07, .05), HP.metal);   // (the harvester comb)
    for (const x of [-.12, .12]) V.add(GEO.box, mat(x, .14, .255, 0, 0, 0, .05, .03, .02), HP.indWhite); V.add(GEO.box, mat(0, .17, -.26, 0, 0, 0, .2, .03, .02), HP.indBlue);
    P.add(GEO.box, mat(0, -.14, 0, 0, 0, 0, .06, .16, .06), HP.metal); P.add(GEO.cyl8, mat(0, -.32, 0, PI/2, 0, 0, .14, .5, .14), HP.white); P.add(GEO.sph, mat(0, -.32, .25, 0, 0, 0, .14, .14, .1), HP.white); P.add(GEO.sph, mat(0, -.32, -.25, 0, 0, 0, .14, .14, .1), HP.white);
    P.add(GEO.box, mat(0, -.3, 0, 0, 0, 0, .29, .07, .38), HP.indWhite); P.add(GEO.box, mat(0, -.46, 0, 0, 0, 0, .05, .02, .3), HP.indBlue);
    return { d: D.geo(), v: V.geo(), p: P.geo() }; })();
  const agMesh = (geo, n) => { const m = new THREE.InstancedMesh(geo, pieceM, n); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; m.raycast = () => {}; scene.add(m); return m; };
  const AGM = { d: agMesh(agGeo.d, 96), v: agMesh(agGeo.v, 48), p: agMesh(agGeo.p, 48) };
  AGM.sh = new THREE.InstancedMesh(new THREE.CircleGeometry(.16, 12).rotateX(-PI/2), new THREE.MeshBasicMaterial({ color: 0x1d2a26, transparent: true, opacity: .28, depthWrite: false }), 96);
  AGM.sh.count = 0; AGM.sh.frustumCulled = false; AGM.sh.renderOrder = 2; AGM.sh.raycast = () => {}; scene.add(AGM.sh);
  // a piece's own frame: from its local (u across, v front) to the world
  const toW = (p, u, v) => { const c = Math.cos(p.rot), s_ = Math.sin(p.rot); return [p.x + u*c + v*s_, p.z - u*s_ + v*c]; };
  const extentOf = p => { let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [u, v] of p.hullL){ u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } return [u0, u1, v0, v1]; };
  function agentsRebuild(){
    const old = new Map(AG.list.map(a => [a.id, a])); AG.list = [];
    const work = PIECES.filter(p => p.kind === 'field' || p.kind === 'tunnels' || p.kind === 'dome');
    for (const h of PIECES.filter(p => p.kind === 'hive')){
      const near = work.filter(f => Math.hypot(f.x - h.x, f.z - h.z) < 18);
      for (let k = 0; k < 3; k++){ const id = 'd' + h.id + ':' + k, a = old.get(id) || { id, type: 'd', x: h.x, y: h.y + h.top - .35, z: h.z, wp: [], wait: 1 + k*2.2, yaw: 0, vx: 0, vz: 0 };
        a.home = h; a.port = k; a.near = near; AG.list.push(a); } }
    for (const b of PIECES.filter(p => p.kind === 'barn')){
      const near = work.filter(f => f.kind === 'field' && Math.hypot(f.x - b.x, f.z - b.z) < 18);
      for (let k = 0; k < 2; k++){ const id = 'v' + b.id + ':' + k, [hx, hz] = toW(b, (k - .5)*.55, .45), a = old.get(id) || { id, type: 'v', x: hx, y: b.y + .14, z: hz, wp: [], wait: 2 + k*5, yaw: b.rot, vx: 0, vz: 0 };
        a.home = b; a.slot = k; a.near = near; AG.list.push(a); } }
    RAILS.forEach((r, i) => { const id = 'p' + i + ':' + r.ax.toFixed(1) + ',' + r.az.toFixed(1), a = old.get(id) || { id, type: 'p', u: (i*.37) % 1, dir: 1, pause: 0 }; a.rail = r; AG.list.push(a); }); }
  // where a drone docks, and the passes it flies over a field, a tunnel or a dome
  const dockOf = a => { const h = a.home, ang = a.port/3*PI*2 + .4; return [h.x + Math.sin(ang)*.62, h.y + h.top - .38, h.z + Math.cos(ang)*.62]; };
  // a drone's way from (x0, z0) to (x1, z1) at cruise height: high enough over everything along it, and round a turbine's
  // mast (never up through its blades) by a waypoint stepped out to the side
  function droneLeg(x0, z0, x1, z1, base, floor){
    let cy = base; const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, out = [];
    for (const q of PIECES){ if (!q.bb) continue; const t = clamp(((q.x - x0)*dx + (q.z - z0)*dz)/(L*L), 0, 1), px = x0 + dx*t, pz = z0 + dz*t, d = Math.hypot(q.x - px, q.z - pz);
      if (q.kind === 'turbine'){ if (d < 1.8 && t > 0 && t < 1){ const sd = ((q.x - x0)*dz - (q.z - z0)*dx) > 0 ? 1 : -1; out.push([t, q.x + (dz/L)*2.6*sd, q.z - (dx/L)*2.6*sd]); } continue; }
      if (d < (q.r || 2) + .8) cy = Math.max(cy, q.y + q.h + .7); }
    out.sort((a, b) => a[0] - b[0]); return { y: Math.min(cy, floor + 6.6), via: out.map(o => [o[1], o[2]]) }; }   // (never as high as a turbine's blades reach down)
  // a drone's round: up off its port, over to a field, a tunnel or a dome (round anything tall, round turbines), down low
  // over it (over a field, along each row of plots), back up and home
  function planDrone(a){
    const [dx, dy, dz] = dockOf(a), cruise = a.home.y + a.home.top + 1.2 + a.port*.35, R = Math.random;
    if (!a.near.length){ const ang = R()*6.28, px = a.home.x + Math.sin(ang)*3, pz = a.home.z + Math.cos(ang)*3, g = droneLeg(dx, dz, px, pz, cruise, a.home.y); a.wp = [[dx, g.y, dz, 1.2], [px, g.y, pz, 2.2], [dx, g.y, dz, 2.2], [dx, dy, dz, .9, 3 + R()*4]]; return; }
    const f = a.near[Math.floor(R()*a.near.length)], [u0, u1, v0, v1] = extentOf(f), low = f.y + f.h + (f.kind === 'field' ? .8 : .5), passes = f.kind === 'field' ? 4 : 3, wp = [];
    const [ex, ez] = toW(f, u0 + .3, v0 + .4), go = droneLeg(dx, dz, ex, ez, cruise, a.home.y);
    wp.push([dx, go.y, dz, 1.2]); for (const [vx, vz] of go.via) wp.push([vx, go.y, vz, 2.6]); wp.push([ex, go.y, ez, 2.6], [ex, low, ez, 1.0]);
    for (let k = 0; k < passes; k++){ const v = f.kind === 'field' ? FIELD.c(k) : v0 + .4 + (v1 - v0 - .8)*(k + .5)/passes, [x0, z0] = toW(f, k % 2 ? u1 - .3 : u0 + .3, v), [x1, z1] = toW(f, k % 2 ? u0 + .3 : u1 - .3, v); wp.push([x0, low, z0, .9], [x1, low, z1, .9, 0, 1]); }
    const last = wp[wp.length - 1], back = droneLeg(last[0], last[2], dx, dz, cruise, a.home.y);
    wp.push([last[0], back.y, last[2], 1.0]); for (const [vx, vz] of back.via) wp.push([vx, back.y, vz, 2.6]); wp.push([dx, back.y, dz, 2.6], [dx, dy, dz, .8, 3 + R()*6]); a.wp = wp; }
  // is the way from (x0, z0) to (x1, z1) clear of every piece but those in skip, a rover's width wide
  const wayClear = (x0, z0, x1, z1, skip) => { const L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0)/L, nz = (x1 - x0)/L;
    for (let t = 0; t <= 1.0001; t += .25/L) for (const o of [-.38, 0, .38]){ const x = x0 + (x1 - x0)*t + nx*o, z = z0 + (z1 - z0)*t + nz*o; if (PIECES.some(q => !skip.includes(q) && q.hullW && !q.level && inHull(q.hullW, x, z))) return false; } return true; };
  // a harvester's round: out of the barn's bay to the nearest corner of the field's margin lane it has a clear way to, then
  // up and down the lanes between the plots (never over them), round the margin and home the same way
  function planRover(a){
    const b = a.home, [hx, hz] = toW(b, (a.slot - .5)*.55, .45), [ox, oz] = toW(b, (a.slot - .5)*.55, 1.9), R = Math.random;
    const park = () => { a.wp = [[ox, 0, oz, .5], [hx, 0, hz, .5, 6 + R()*6]]; };
    if (!a.near.length) return park();
    const f = a.near[Math.floor(R()*a.near.length)], E = FIELD.edge, lanes = [0, 1, 2].map(FIELD.lane);
    const corners = [[-E, -E], [E, -E], [E, E], [-E, E]].map(([u, v]) => { const [x, z] = toW(f, u, v); return { u, v, x, z, d: Math.hypot(x - ox, z - oz) }; }).sort((p, q) => p.d - q.d);
    const ent = corners.find(c => wayClear(ox, oz, c.x, c.z, [b, f])); if (!ent) return park();
    const wp = [[ox, 0, oz, .55], [ent.x, 0, ent.z, .7]], P = (u, v, sp, work = 0) => { const [x, z] = toW(f, u, v); wp.push([x, 0, z, sp, 0, work]); };
    const vs = ent.v, us = ent.u, order = us < 0 ? lanes : lanes.slice().reverse();
    P(order[0], vs, .6);
    order.forEach((l, k) => { const vFrom = k % 2 ? -vs : vs; P(l, -vFrom, .42, 1); if (k < order.length - 1) P(order[k + 1], -vFrom, .6); });
    const vEnd = order.length % 2 ? -vs : vs; P(us, vEnd, .6); P(us, vs, .6);
    wp.push([ent.x, 0, ent.z, .6], [ox, 0, oz, .6], [hx, 0, hz, .45, 8 + R()*10]); a.wp = wp; a.field = f; }
  const groundY = (x, z) => { let y = heightAt(x, z); for (const q of PIECES) if (!q.level && q.bb && x >= q.bb[0] && x <= q.bb[2] && z >= q.bb[1] && z <= q.bb[3] && inHull(q.hullW, x, z)) y = Math.max(y, q.y + (q.kind === 'field' ? .16 : .12)); return y; };
  const _am = new THREE.Matrix4(), _aq = new THREE.Quaternion(), _ae = new THREE.Euler(0, 0, 0, 'YXZ'), _ap = new THREE.Vector3(), _as = new THREE.Vector3(1, 1, 1);
  function agentTick(dt){
    dt = Math.min(dt, .1); AG.t += dt;
    if (AG.t > .5){ AG.t = 0; const key = PIECES.filter(p => p.kind === 'hive' || p.kind === 'barn' || p.kind === 'field' || p.kind === 'tunnels' || p.kind === 'dome').map(p => p.id + p.kind).join(',') + '|' + RAILS.map(r => r.ax.toFixed(1)).join(',');
      if (key !== AG.key){ AG.key = key; agentsRebuild(); } }
    let nd = 0, nv = 0, np = 0, ns = 0;
    for (const a of AG.list){
      if (a.type === 'p'){ const r = a.rail, L = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1;
        if (a.pause > 0) a.pause -= dt; else { a.u += a.dir*dt*1.1/L; if (a.u >= 1 || a.u <= 0){ a.u = clamp(a.u, 0, 1); a.dir *= -1; a.pause = 2 + Math.random()*2; } }
        const e = a.u*a.u*(3 - 2*a.u), x = r.ax + (r.bx - r.ax)*e, z = r.az + (r.bz - r.az)*e;
        _ae.set(0, Math.atan2(r.bx - r.ax, r.bz - r.az), 0); _am.compose(_ap.set(x, r.y, z), _aq.setFromEuler(_ae), _as.setScalar(1.35)); AGM.p.setMatrixAt(np++, _am); continue; }
      if (a.wait > 0){ a.wait -= dt; } else if (!a.wp.length){ if (a.type === 'd') planDrone(a); else planRover(a); }
      else { const w = a.wp[0], ty = a.type === 'v' ? groundY(a.x, a.z) : w[1], dx = w[0] - a.x, dy = a.type === 'v' ? 0 : ty - a.y, dz = w[2] - a.z, d = Math.hypot(dx, dy, dz), step = w[3]*dt;
        if (d <= step){ a.x = w[0]; a.z = w[2]; if (a.type === 'd') a.y = ty; a.wp.shift(); if (w[4]) a.wait = w[4]; }
        else { a.x += dx/d*step; a.z += dz/d*step; if (a.type === 'd') a.y += dy/d*step; const h = Math.hypot(dx, dz); if (h > .01) a.yaw = Math.atan2(dx, dz); }
        a.vx = a.vx*.85 + (d > step ? dx/d*w[3] : 0)*.15; a.vz = a.vz*.85 + (d > step ? dz/d*w[3] : 0)*.15; }
      if (a.type === 'v'){ a.y = groundY(a.x, a.z); _ae.set(0, a.yaw, 0); _am.compose(_ap.set(a.x, a.y, a.z), _aq.setFromEuler(_ae), _as.setScalar(1.45)); AGM.v.setMatrixAt(nv++, _am); continue; }
      // a drone leans into its flight, and bobs a little as it hovers
      const sp = Math.hypot(a.vx, a.vz), bob = Math.sin(performance.now()*.004 + a.port*2)*.02;
      _ae.set(Math.min(.35, sp*.12), a.yaw, 0); _am.compose(_ap.set(a.x, a.y + bob, a.z), _aq.setFromEuler(_ae), _as.setScalar(2.1)); AGM.d.setMatrixAt(nd++, _am);
      const g = groundY(a.x, a.z), hgt = a.y - g; if (hgt > .25){ _am.compose(_ap.set(a.x, g + .03, a.z), _aq.identity(), _as.setScalar(clamp(2.4 - hgt*.15, 1, 2.4))); AGM.sh.setMatrixAt(ns++, _am); } }
    for (const [m, n] of [[AGM.d, nd], [AGM.v, nv], [AGM.p, np], [AGM.sh, ns]]){ m.count = n; if (n) m.instanceMatrix.needsUpdate = true; } }
  function rotorTick(dt){ for (const g of ROTORS) g.userData.spin.rotation.z -= dt*.55; }
  function remesh(p){ SHD.dirty = true; HB.dirty.add(regKey(p)); if (p.mesh){ scene.remove(p.mesh); pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); } p.mesh = pieceMesh(p); scene.add(p.mesh); pieceMeshes.push(p.mesh);
    if (p.rotorG){ scene.remove(p.rotorG); ROTORS.delete(p.rotorG); p.rotorG = null; }
    if (KINDS[p.kind].rotor){ const b = blockOf(p.kind, p.seed, false, false); p.rotorG = makeRotor(p, b.hub || 10); scene.add(p.rotorG); ROTORS.add(p.rotorG); } }
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
  // and the ones neighbors would make on their own that were taken away (by pair of ids), so they stay gone
  const NOLINK_KEY = 'neonIsland.coast.nolinks'; let NOLINK = new Set(); try { NOLINK = new Set(JSON.parse(localStorage.getItem(NOLINK_KEY) || '[]')); } catch (e) {}
  const pairId = (a, b) => Math.min(a, b) + '|' + Math.max(a, b);
  const saveLinks = () => { try { localStorage.setItem(ULINK_KEY, JSON.stringify(ULINKS)); localStorage.setItem(NOLINK_KEY, JSON.stringify([...NOLINK])); } catch (e) {} };
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
      if (r >= 1 && p.mesh && !p.mesh.castShadow){ p.mesh.castShadow = true; SHD.dirty = true; }   // (its shadow comes once the wash has reached the top)
      if (a.t > .27){ SHD.dirty = true; p.anim = null; p.mesh.material = pieceM; p.mesh.castShadow = true; p.mesh.visible = false; HB.dirty.add(regKey(p)); if (p.mesh.userData.fol) p.mesh.userData.fol.visible = true; freePaint(a); ANIM.list.splice(i, 1); } } }
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
    dropLinkCache(p); linksDirty = true; if (!quiet) save(); return p; }
  function removePiece(p){   // (and everything stacked on it or built off its side)
    if (!PIECES.includes(p)) return;
    if (p.up) removePiece(p.up);
    for (const q of PIECES.filter(q => q.host === p)) removePiece(q);
    scene.remove(p.mesh); if (p.rotorG){ scene.remove(p.rotorG); ROTORS.delete(p.rotorG); p.rotorG = null; } pieceMeshes.splice(pieceMeshes.indexOf(p.mesh), 1); PIECES.splice(PIECES.indexOf(p), 1); SHD.dirty = true; HB.dirty.add(regKey(p)); dropLinkCache(p);
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
  let linksDirty = true, linksMesh = null; const RAILS = [];
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
    if (IND(L.A.kind) || IND(L.B.kind)){   // (industry's own: a service track or a pipeline on the ground, a drone rail when anything's in the way or it's a long or uneven span)
      const t = L.type || 'random', hard = L.blocked || L.gap > 7 || Math.abs(L.A.y - L.B.y) > 1.2 || L.A.level || L.B.level;
      if (t === 'bridge' || t === 'skywalk' || hard) return 'rail';
      if (t === 'pergola') return 'pipe'; if (t === 'arcade' || t === 'wall') return 'track';
      return R.chance(.5) ? 'track' : 'pipe'; }
    const ground = !L.A.level && !L.B.level && Math.abs(L.A.y - L.B.y) < 1.4, t = L.type || 'random';
    if (t === 'wall') return L.gap < .5 && L.A.level === L.B.level ? 'wall' : 'wing';   // (apart: an enclosed wing joins them instead of a shared wall)
    if (t === 'pergola' || t === 'arcade' || t === 'bridge' || t === 'skywalk') return t;   // (every kind, at any height: up in the air a pergola or an arcade is carried as a bridge)
    if (L.gap < .5 && L.A.level === L.B.level) return 'wall';
    if (ground) return R.chance(.12) ? 'skywalk' : R.chance(.58) ? 'pergola' : 'arcade';
    return R.chance(.15) ? R.pick(['pergola', 'arcade']) : R.chance(Math.min(.8, .35 + L.gap*.08)) ? 'skywalk' : 'bridge'; }
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
    if (type !== 'wall' && type !== 'wing' && type !== 'rail' && type !== 'pipe' && type !== 'track'){ door(a, b); door(b, a); }
    // a long span up in the air gets slim piers down to the ground, whatever it's built as
    if (type !== 'rail' && len > 3.6 && (A.level || B.level)) for (let u = 1/Math.ceil(len/3); u < .999; u += 1/Math.ceil(len/3)){ const c = at(u, 0, 0), g = heightAt(c.x, c.z);
      if (c.y - g > .4){ box(T, c.x, (c.y + g)/2 - .05, c.z, .16, c.y - g - .1, .16, HP.cream); box(T, c.x, g + .1, c.z, .3, .2, .3, HP.stone); } }
    if (type === 'track'){   // industry, on the ground: a paved service lane for the machines, edged in blue light, a dashed centre line
      run(0, 0, .95, .1, C(0xb9b2a4), .02); for (const s_ of [-.46, .46]) run(s_, .1, .05, .03, HP.indBlue, 0, .02, .98);
      const n = Math.max(1, Math.round(len/.5)); for (let k = 0; k < n; k++) if (k % 2 === 0){ const c0 = at((k + .2)/n, 0, .1), c1 = at((k + .8)/n, 0, .1); seg(T, c0, c1, .06, .02, HP.white); }
      { const np = Math.max(1, Math.round(len/2.4)); for (let k = 0; k < np; k++){ const c = at((k + .5)/np, 0, 0); pools.push([c.x, c.z, 1.2, 41.4]); } }
    } else if (type === 'pipe'){   // industry, on the ground: twin pipes (water, power) on low trestles, glowing rings at the joints
      const n = Math.max(2, Math.round(len/.8));
      for (let k = 0; k <= n; k++){ const c = at(k/n, 0, 0); if (solidAt(c.x, c.z, c.y, c.y + .6, [A, B])) continue;
        for (const s_ of [-.22, .22]){ const f = at(k/n, s_*1.3, 0); seg(T, V3(f.x, f.y, f.z), V3(c.x + sx*s_*.6, c.y + .42, c.z + sz*s_*.6), .05, .05, HP.metal); }
        box(T, c.x, c.y + .42, c.z, .6*Math.abs(sz) + .08, .05, .6*Math.abs(sx) + .08, HP.metal); }
      run(-.14, .5, .12, .12, HP.white, 0, -.02, 1.02); run(.14, .5, .09, .09, HP.metal, 0, -.02, 1.02);
      for (let k = 1; k < Math.max(2, Math.round(len/1.6)); k++){ const u = k/Math.max(2, Math.round(len/1.6)); seg(T, at(u - .015, -.14, .5), at(u + .015, -.14, .5), .16, .16, HP.indBlue); }
      { const np = Math.max(1, Math.round(len/2.6)); for (let k = 0; k < np; k++){ const c = at((k + .5)/np, 0, 0); pools.push([c.x, c.z, 1.0, 41.3]); } }
    } else if (type === 'rail'){   // industry, up in the air: a drone rail, a slim white beam on T pylons, a dashed line of blue light along each side; raised
      // above anything between (it never cuts through a farm module), pylons only where the ground is clear
      let top = Math.max(a.y, b.y) + 1.9;
      for (let k = 0; k <= 24; k++){ const u = k/24, px = a.x + (b.x - a.x)*u, pz = a.z + (b.z - a.z)*u;
        for (const q of PIECES){ if (q === A || q === B || !q.hullW || !q.bb || px < q.bb[0] - .6 || px > q.bb[2] + .6 || pz < q.bb[1] - .6 || pz > q.bb[3] + .6) continue;
          if (inHull(q.hullW, px, pz) || [[.6, 0], [-.6, 0], [0, .6], [0, -.6]].some(([ox, oz]) => inHull(q.hullW, px + ox, pz + oz))) top = Math.max(top, q.y + q.h + 1.05); } }   // (clear of it with the pods hanging under)
      const pa = V3(a.x + dx*.55, 0, a.z + dz*.55), pb = V3(b.x - dx*.55, 0, b.z - dz*.55);   // (the end pylons stand just off each building's wall, outside it)
      L.rail = { ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, y: top };   // (for the shuttle pods; see AGENTS)
      const rp = u => V3(pa.x + (pb.x - pa.x)*u, top, pa.z + (pb.z - pa.z)*u), L2 = Math.hypot(pb.x - pa.x, pb.z - pa.z), nseg = Math.max(2, Math.ceil(L2/.8));
      for (let k = 0; k < nseg; k++){ const r0 = rp(k/nseg), r1 = rp((k + 1)/nseg); seg(T, r0, r1, .26, .18, HP.white); seg(T, r0, r1, .3, .04, HP.metal, -.1);
        if (k % 2 === 0) for (const s_ of [-.14, .14]) seg(T, V3(r0.x + sx*s_, r0.y, r0.z + sz*s_), V3(r1.x + sx*s_, r1.y, r1.z + sz*s_), .02, .04, HP.indBlue, .02); }
      const npy = Math.max(1, Math.round(L2/2.6));
      for (let k = 0; k <= npy; k++){ let u = k/npy, c = rp(u), ok = false;
        for (let t = 0; t < 7 && !ok; t++){ const uu = clamp(u + (t % 2 ? 1 : -1)*Math.ceil(t/2)*.04, 0, 1), cc = rp(uu); if (!PIECES.some(q => q.hullW && inHull(q.hullW, cc.x, cc.z) && q !== A && q !== B) || uu === 0 || uu === 1){ c = cc; ok = !PIECES.some(q => q.hullW && inHull(q.hullW, cc.x, cc.z)); } }
        if (!ok) continue; const g = heightAt(c.x, c.z);
        box(T, c.x, (g + top)/2 - .08, c.z, .16, top - g - .16, .16, HP.white); box(T, c.x, top - .12, c.z, .5*Math.abs(sz) + .14, .08, .5*Math.abs(sx) + .14, HP.metal);
        box(T, c.x, g + .12, c.z, .36, .24, .36, HP.stone); box(T, c.x, top - .3, c.z, .1, .06, .1, HP.indBlue); pools.push([c.x, c.z, 1.1, 41.4]); }
    } else if (type === 'wall'){   // touching: a shared wall with an arched way through
      const a2 = at(-.15, 0, 0), b2 = at(1.15, 0, 0), wh = A.level ? .9 : 1.1, wc = R.pick([HP.cream, HP.white, HP.sand]);
      seg(T, a2, b2, 1.3, wh, wc, wh/2); seg(T, a2, b2, 1.4, .08, HP.cream, wh + .04);
      for (const s of [-.66, .66]){ const c = at(.5, s, 0); box(T, c.x, c.y + .38, c.z, .5, .6, .5, HP.glassD); }
      for (let k = 0; k < 3; k++){ const c = at(.2 + k*.3, 0, wh + .08); plant(T, R, c.x, c.y, c.z, 1.1); }
    } else if (type === 'wing'){   // an enclosed wing between them: plaster walls with a row of windows, a tiled roof
      const wc = R.pick([HP.cream, HP.white, HP.sand, HP.apricot, HP.butter]), h = A.level ? .95 : 1.15, n = Math.max(1, Math.round(len/.7));
      run(0, 0, 1.2, .14, HP.stone, .02, -.02, 1.02); run(0, 0, 1.1, h, wc, h/2 + .08, -.04, 1.04);
      for (let k = 0; k < n; k++) for (const s_ of [-.56, .56]){ const c = at((k + .5)/n, s_, 0); box(T, c.x, c.y + h*.55, c.z, .1, .42, .1, HP.frame);
        box(T, c.x + sx*Math.sign(s_)*.01, c.y + h*.55, c.z + sz*Math.sign(s_)*.01, .08, .36, .08, R.chance(.45) ? HP.lamp : HP.glassD); }
      run(0, h + .1, 1.3, .1, HP.cream, 0, -.06, 1.06); run(0, h + .22, 1.36, .12, HP.tile, 0, -.06, 1.06);
      if (R.chance(.7)) for (let k = 0; k < n; k++){ const c = at((k + .5)/n, 0, h + .28); plant(T, R, c.x, c.y, c.z, .9); }
    } else if (type === 'bridge' || type === 'skywalk'){   // up in the air: a planted bridge, or a glass skywalk
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
    linksDirty = false; SHD.dirty = true;
    RAILS.length = 0;
    if (linksMesh){ scene.remove(linksMesh); linksMesh.geometry.dispose(); for (const c of linksMesh.children) c.geometry.dispose(); linksMesh = null; }   // (merged copies only: the cached parts stay)
    const T = new Tris(true), pairs = [], deg = new Map(), joined = new Set(), pools = [];
    for (const p of PIECES) if (!p.level) pools.push([p.x, p.z, KINDS[p.kind].rb*1.25 + 1.5, IND(p.kind) ? 41.6 : 1 + 10*shopOf(p.kind, p.seed)]);
    for (const p of PIECES) if (p.kind === 'field'){ const c = Math.cos(p.rot), s_ = Math.sin(p.rot); const h = FIELD.S/2 - .9; for (const [u, v] of [[-h, -h], [h, -h], [-h, h], [h, h], [0, h], [0, -h], [h, 0], [-h, 0], [0, 0]]) pools.push([p.x + u*c + v*s_, p.z - u*s_ + v*c, 1.7, 41.5]); }   // (the blue round a field's edges)   // (+10 per shop light: a shop's, in its light)   // (by night: the windows' light on the ground round a home)
    // the connections built with the connect brush come first, as chosen; then the ones neighbors make on their own
    const byId = new Map(PIECES.map(p => [p.id, p])), userKey = new Set();
    for (const u of ULINKS){ const A = byId.get(u.a), B = byId.get(u.b); if (!A || !B) continue; const L = pairOf(A, B); if (!L) continue;
      L.user = true; L.type = u.type; pairs.push(L); userKey.add(Math.min(A.id, B.id) + '|' + Math.max(A.id, B.id)); }
    const nUser = pairs.length;
    for (let i = 0; i < PIECES.length; i++) for (let j = i + 1; j < PIECES.length; j++){
      const A = PIECES[i], B = PIECES[j]; if (A.level !== B.level) continue;
      if (IND(A.kind) !== IND(B.kind)) continue;   // (industry joins only industry by itself, with its own tracks, pipes and rails)
      if (Math.abs(A.y - B.y) > (A.level ? .6 : 1.4)) continue;
      if (Math.abs(A.x - B.x) > 9 || Math.abs(A.z - B.z) > 9) continue;
      if (userKey.has(Math.min(A.id, B.id) + '|' + Math.max(A.id, B.id)) || NOLINK.has(pairId(A.id, B.id))) continue;
      const L = pairOf(A, B); if (!L || L.dc > 9 || L.gap > 3.6) continue;
      pairs.push(L); }
    const auto = pairs.splice(nUser).sort((p, q) => p.gap - q.gap); pairs.push(...auto);
    for (const v of LCACHE.values()) v.used = false;
    for (const L of pairs){
      const { A, B, dc, dx, dz, tA, tB } = L; if (!L.user && ((deg.get(A) || 0) >= 3 || (deg.get(B) || 0) >= 3)) continue;
      // the way between the two walls must be clear of every other block at its height, a body's width to each side
      const ly0 = Math.min(A.y, B.y) + .1, ly1 = ly0 + 1.4, ax0 = A.x + dx*tA, az0 = A.z + dz*tA, span = Math.max(0, dc - tA - tB);
      let clear = true;
      const ex = ax0 + dx*span, ez = az0 + dz*span, near = PIECES.filter(q => q !== A && q !== B && q.bb && q.bb[0] < Math.max(ax0, ex) + .7 && q.bb[2] > Math.min(ax0, ex) - .7 && q.bb[1] < Math.max(az0, ez) + .7 && q.bb[3] > Math.min(az0, ez) - .7);
      if (near.length) for (let u = 0; u <= span + 1e-6 && clear; u += .3) for (const s_ of [-.6, 0, .6]) if (solidAt(ax0 + dx*u - dz*s_, az0 + dz*u + dx*s_, ly0, ly1, null, near)){ clear = false; break; }
      if (!clear && IND(A.kind) && IND(B.kind)) L.blocked = true; else if (!clear && !L.user) continue;
      deg.set(A, (deg.get(A) || 0) + 1); deg.set(B, (deg.get(B) || 0) + 1); joined.add(A.id + '|' + B.id); joined.add(B.id + '|' + A.id);
      // (each connection is drawn once and kept: a rebuild after placing one home only draws the new ones)
      const ck = [A.id, B.id, L.user ? L.type : '-', L.blocked ? 'blk' : '', A.x.toFixed(2), A.z.toFixed(2), A.y.toFixed(2), B.x.toFixed(2), B.z.toFixed(2), B.y.toFixed(2), A.rot.toFixed(3), B.rot.toFixed(3), A.kind, B.kind, A.seed, B.seed, !!A.up, !!B.up].join('|');
      let cl = LCACHE.get(ck); if (!cl){ const shopL = COM(A.kind) && COM(B.kind) ? shopOf(A.kind, A.seed) : 0, lt = new Tris(true, shopL), lp = []; drawLink(lt, L, lp); if (shopL) for (const q of lp) q[3] += 10*shopL; cl = { rail: L.rail || null, geo: lt.p.length ? lt.geo() : null, fol: folGeo(lt.fol), pools: lp, ax: (A.x + B.x)/2, az: (A.z + B.z)/2, r: L.dc/2, a: A.id, b: B.id }; LCACHE.set(ck, cl); }
      cl.used = true; for (const q of cl.pools) pools.push(q); if (cl.rail) RAILS.push(cl.rail);
    }
    // courtyards: three ground homes all joined to each other
    // (found from each home's few links, not by trying every three homes)
    const adj = new Map(); for (const k of joined){ const [a, b] = k.split('|').map(Number); if (a < b){ (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); } }
    const byId2 = new Map(PIECES.map(p => [p.id, p])), tris3 = [];
    for (const [a, ns] of adj) for (const b of ns) for (const c of ns) if (c > b && adj.get(b) && adj.get(b).has(c)) tris3.push([a, b, c]);
    for (const [ia, ib, ic] of tris3){
      const A = byId2.get(ia), B = byId2.get(ib), C = byId2.get(ic); if (!A || !B || !C || A.level || B.level || C.level) continue;
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
    // (the links' parts kept from before are merged with what's new: courtyards and corbels, drawn fresh, are few)
    const used = [...LCACHE.values()].filter(v => v.used), withGeo = used.filter(v => v.geo), gs = withGeo.map(v => [v.geo, null]), fs = used.filter(v => v.fol).map(v => [v.fol, null]);
    if (T.p.length) gs.push([T.geo(), null]); const tf = folGeo(T.fol); if (tf) fs.push([tf, null]);
    linkRanges = []; { let o = 0; for (const v of withGeo){ const n = v.geo.attributes.position.count; linkRanges.push([o, o + n, v.a, v.b]); o += n; } }   // (which vertices are which link: for picking one to take away)
    if (gs.length){ linksMesh = new THREE.Mesh(mergeInto(gs, false), pieceM); linksMesh.castShadow = linksMesh.receiveShadow = true; linksMesh.customDepthMaterial = landDepth; linksMesh.matrixAutoUpdate = false; scene.add(linksMesh);
      if (fs.length){ const f = new THREE.Mesh(mergeInto(fs, true), grassM); f.receiveShadow = true; f.frustumCulled = true; f.raycast = () => {}; f.matrixAutoUpdate = false; linksMesh.add(f); } }
    buildPools(pools);
    for (const [k, v] of LCACHE) if (!v.used){ if (v.geo) v.geo.dispose(); if (v.fol) v.fol.dispose(); LCACHE.delete(k); }
  }
  // connections kept from earlier rebuilds; the ones near a home that comes or goes are drawn again (its pad changes the ground)
  const LCACHE = new Map(); let linkRanges = [];
  function dropLinkCache(p){ for (const [k, v] of LCACHE) if (Math.hypot(v.ax - p.x, v.az - p.z) < v.r + 8){ if (v.geo) v.geo.dispose(); if (v.fol) v.fol.dispose(); LCACHE.delete(k); } }
  // the warm light by night: a soft pool on the ground round each home, under each pergola and arcade, in each courtyard
  // (flat quads added over the ground, in a few dithered steps; only drawn when it's dark)
  const poolM = new THREE.ShaderMaterial({ uniforms: { nightK: CURV.darkK, uSH: { value: [] }, uSE: { value: [] } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute vec3 aL; varying vec3 vL; varying vec2 vW; void main(){ vL = aL; vW = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    // (a wash of warm light: soft all the way out, fading to nothing at a gently ragged edge (no rim, no step at the edge,
    // so it never reads as a patch laid on the ground), its color running from gold at the heart to rose-orange outward)
    fragmentShader: `uniform float nightK; uniform vec3 uSH[4], uSE[4]; varying vec3 vL; varying vec2 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float r = length(vL.xy);
        float edge = 0.6 + 0.26*vn(vW*0.8) + 0.1*vn(vW*2.6 + 5.0), e = edge - r; if (e < 0.0) discard;
        float body = smoothstep(0.0, 0.45, e), bloom = vn(vW*1.4 + 7.0);
        float si = floor(vL.z/10.0), shop = step(0.5, si);
        vec3 sH = si < 1.5 ? uSH[0] : si < 2.5 ? uSH[1] : si < 3.5 ? uSH[2] : uSH[3], sE = si < 1.5 ? uSE[0] : si < 2.5 ? uSE[1] : si < 3.5 ? uSE[2] : uSE[3];
        vec3 c = mix(mix(vec3(0.95, 0.42, 0.24), sE, shop), mix(vec3(1.0, 0.74, 0.36), sH, shop), body*(0.6 + 0.4*bloom));
        float a = pow(smoothstep(0.0, 0.6, e), 1.6)*(0.55 + 0.3*bloom);
        a = floor(a*10.0 + h21(gl_FragCoord.xy)*0.999)/10.0;   // (fine steps, dithered: no bands)
        gl_FragColor = vec4(c*a*0.42*(vL.z - 10.0*si)*nightK, 1.0); }` });
  poolM.uniforms.uSH.value = [...SHOPLIGHTS.map(L => new THREE.Color(...L[1])), new THREE.Color(.62, .82, 1.0)]; poolM.uniforms.uSE.value = [...SHOPLIGHTS.map(L => new THREE.Color(...L[2])), new THREE.Color(.3, .5, .9)];   // (the 4th: industry's cool blue)
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
  const GRASS_KEY = 'neonIsland.coast.grass', GC = .4, GSQ = 32;   // (GC: a tuft's cell; GSQ: an area of grass, drawn together)
  const GSTYLES = ['meadow', 'wildflowers', 'ferns', 'tall grass', 'mix'];
  const tufts = new Map(), gSquares = new Map(), gDirty = new Set(), tdata = new Map();
  const sqKey = (i, j) => Math.floor(i*GC/GSQ) + ',' + Math.floor(j*GC/GSQ);
  try { for (const [i, j, st] of JSON.parse(localStorage.getItem(GRASS_KEY) || '[]')){ tufts.set(i + ',' + j, [i, j, st]); gDirty.add(sqKey(i, j)); } } catch (e) {}
  let PLOAD = []; try { PLOAD = JSON.parse(localStorage.getItem('neonIsland.coast.plants') || '[]'); } catch (e) {}   // (the trees; taken in once their layer is made, below)
  let gSaveT = 0; const saveGrass = () => { clearTimeout(gSaveT); gSaveT = setTimeout(() => { try { localStorage.setItem(GRASS_KEY, JSON.stringify([...tufts.values()])); } catch (e) {} }, 400); };
  // can a tuft grow here: on land, back from the cliff's edge, not steep, not inside a home
  function grassOK(x, z){ if ((coastX(z) - x)*rowCos(z) < 1.1) return null; const y = heightAt(x, z);
    if (Math.abs(heightAt(x + .35, z) - y) > .3 || Math.abs(heightAt(x, z + .35) - y) > .3) return null;
    if (solidAt(x, z, y - .2, y + .5)) return null; return y; }
  // one plant of a kind, at (x, y, z), in the colors given
  function plantOf(G, R, x, y, z, st, base, tipC, lean0){
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

  /* ---------- the commercial zone's planting: small trees and upright plants, in their own colors ---------- */
  // Five kinds, none taller than a shop's first floor: a parasol tree (a flat, spreading crown on a slim leaning trunk), a
  // street tree (a round clipped crown on a straight stem), a columnar shrub (a narrow spindle of leaves), a bamboo clump
  // (jointed canes with leaf sprays from the upper nodes) and sword plants (stiff upright blades, like flax or snake plant).
  // Leaves are small diamonds laid over the crown's shape, facing out, dark beneath and catching light on top. Colored from
  // a palette of a leaf color, a tip (light) color and an accent, plus bark.
  const COMPAL = {
    // (glow: its light by night, when the wind stirs it; each a lighter, cooler-or-warmer kin of its leaves, none pink)
    seaglass: { leaf: [.3, .52, .55], tip: [.64, .82, .78], acc: [.4, .6, .7], bark: [.36, .31, .3], glow: [.3, .6, .74] },   // (cool blue-green and silver; glows aqua)
    indigo: { leaf: [.24, .27, .5], tip: [.62, .67, .84], acc: [.34, .44, .66], bark: [.3, .28, .32], glow: [.44, .46, .8] },   // (deep blue-violet with silver; glows periwinkle)
    gold: { leaf: [.66, .52, .2], tip: [.96, .84, .46], acc: [.44, .48, .24], bark: [.38, .3, .24], glow: [.66, .52, .26] } };   // (ochre gold and olive; glows amber, like fireflies)
  const COMPALS = ['seaglass', 'indigo', 'gold'];
  const COMKINDS = ['parasol tree', 'street tree', 'column shrub', 'bamboo', 'sword plants'];
  function leafD(G, x, y, z, nx, ny, nz, s, col, h){ const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let ux = -nz, uy = 0, uz = nx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; const vx = ny*uz - nz*uy, vy = nz*ux - nx*uz, vz = nx*uy - ny*ux;
    const a = G.v(x + ux*s, y + uy*s, z + uz*s, nx, ny, nz, col, h), b = G.v(x + vx*s*.5, y + vy*s*.5, z + vz*s*.5, nx, ny, nz, col, h), c = G.v(x - ux*s*.7, y - uy*s*.7, z - uz*s*.7, nx, ny, nz, mul3(col, .9), h), d = G.v(x - vx*s*.5, y - vy*s*.5, z - vz*s*.5, nx, ny, nz, col, h);
    G.tri(a, b, c); G.tri(a, c, d); }
  function crown(G, R, cx, cy, cz, rx, ry, rz, n, P, h0){
    for (let k = 0; k < n; k++){ const th = R.r(0, 6.28), ph = Math.acos(R.r(-.75, 1)), q = R.r(.7, 1.02), dx = Math.sin(ph)*Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph)*Math.sin(th);
      const x = cx + dx*rx*q, y = cy + dy*ry*q, z = cz + dz*rz*q, up = (dy + 1)/2, col = mix3(mix3(mul3(P.leaf, .62, .5), P.leaf, smooth(0, .5, up)), P.tip, smooth(.55, 1, up)*R.r(.5, 1));
      leafD(G, x, y, z, dx + R.r(-.4, .4), dy + .5 + R.r(-.3, .3), dz + R.r(-.4, .4), R.r(.05, .08), R.chance(.12) ? mix3(col, P.acc, .6) : col, h0 + (y - cy) + ry); } }
  function trunkG(G, x0, z0, x1, h, r0, r1, col, segs = 4){ let prev = null; const gc0 = G.gc; G.gc = [0, 0, 0];   // (bark doesn't glow)
    for (let k = 0; k <= segs; k++){ const t = k/segs, y = h*t, x = x0 + (x1 - x0)*t*t, r = r0 + (r1 - r0)*t, ring_ = [];
      for (let m = 0; m < 5; m++){ const a = m/5*6.28; ring_.push(G.v(x + Math.cos(a)*r, y, z0 + Math.sin(a)*r, Math.cos(a), 0, Math.sin(a), mul3(col, .85 + .15*t), y)); }
      if (prev) for (let m = 0; m < 5; m++){ const m2 = (m + 1) % 5; G.tri(prev[m], ring_[m2], ring_[m]); G.tri(prev[m], prev[m2], ring_[m2]); } prev = ring_; } G.gc = gc0; }
  function comPlant(G, R, x, y, z, kind, P){
    G.gc = P.glow;
    if (kind === 0){ const lean = R.r(.12, .26), th = R.r(1.35, 1.6); trunkG(G, x, z, x + lean, th, .07, .04, P.bark, 6);
      crown(G, R, x + lean, y + th + .14, z, R.r(.58, .7), .22, R.r(.52, .64), 420, P, th - .1); crown(G, R, x + lean*.7 - .1, y + th - .12, z + .08, .36, .14, .32, 120, P, th - .35); }
    else if (kind === 1){ const th = R.r(1.0, 1.2); trunkG(G, x, z, x, th, .05, .035, P.bark, 5); crown(G, R, x, y + th + .26, z, .38, .36, .38, 320, P, th); }
    else if (kind === 2){ const hh = R.r(.42, .55); crown(G, R, x, y + hh + .02, z, .15, hh, .15, 170, P, 0); trunkG(G, x, z, x, .08, .03, .03, P.bark, 1); }
    else if (kind === 3){ const n = R.i(5, 8);
      for (let k = 0; k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .13), bx = x + Math.cos(a)*rr, bz = z + Math.sin(a)*rr, L = R.r(.75, 1.15), lean = R.r(.02, .1), la = R.r(0, 6.28), cane = mix3(P.acc, P.tip, R.r(0, .35));
        G.gc = [0, 0, 0]; const top = blade(G, bx, y, bz, la, L, .045, lean, mul3(cane, .8), cane, 6); G.gc = P.glow;
        for (let j = 3; j <= 6; j++){ const t = j/6, px = bx + Math.cos(la)*lean*L*Math.pow(t, 1.7), pz = bz + Math.sin(la)*lean*L*Math.pow(t, 1.7), py = y + L*t*.97;
          for (let m = 0; m < 2; m++) blade(G, px, py, pz, R.r(0, 6.28), R.r(.12, .2), .045, R.r(1.1, 1.6), P.leaf, P.tip, 2); } } }
    else { const n = R.i(7, 11);
      for (let k = 0; k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .1), c = R.chance(.3) ? mix3(P.leaf, P.acc, .7) : P.leaf;
        blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.55, .95), R.r(.11, .16), R.r(.03, .14), mul3(c, .75), mix3(c, P.tip, .7), 4); } } }
  const comFolGeo = (kind, pal, seed = 1) => { const G = new GB(); comPlant(G, rng(seed*7919 + kind*31 + 5), 0, 0, 0, kind, COMPAL[pal]); return G.mesh(); };

  /* ---------- the industrial zone's planting (preview): working land, warm against the blue ---------- */
  // Five kinds: a poplar (a tall narrow windbreak tree, planted in rows), sunflowers (tall stems, broad leaves, gold heads
  // with dark hearts), golden grain (wheat-like blades with heavy seed heads), a wildflower strip (low grass full of small
  // flowers, for the pollinators) and reeds (tall blades with brown cattail heads). Colored from a palette: leaf, grain,
  // the flowers it scatters, and the warm glow it gives when the wind stirs it by night.
  const INDPAL = {
    harvest: { acc: [.6, .62, .3], leaf: [.4, .55, .26], tip: [.72, .78, .42], grain: [.86, .68, .3], grainTip: [.98, .86, .5], fl: [[.98, .8, .25], [.62, .45, .8], [.97, .95, .88], [.95, .58, .22]], bark: [.4, .33, .26], glow: [.72, .52, .22] },
    rust: { acc: [.62, .4, .24], leaf: [.3, .45, .28], tip: [.6, .68, .4], grain: [.76, .44, .22], grainTip: [.92, .66, .4], fl: [[.9, .45, .2], [.82, .3, .2], [.96, .88, .7], [.95, .7, .3]], bark: [.36, .28, .24], glow: [.72, .4, .2] },
    sage: { acc: [.56, .66, .6], leaf: [.42, .56, .48], tip: [.74, .82, .7], grain: [.84, .78, .58], grainTip: [.96, .93, .78], fl: [[.72, .66, .9], [.97, .96, .92], [.95, .86, .5], [.6, .72, .9]], bark: [.4, .36, .32], glow: [.66, .64, .42] } };
  const INDKINDS = ['poplar', 'sunflowers', 'golden grain', 'wildflower strip', 'reeds'];
  function sunHead(G, x, y, z, r, petal, h){   // (a disc tilted up toward the sky: a small dark heart, a solid ring of gold, petal tips beyond)
    const heart = [.32, .2, .1], N = [0, .8, -.55], U = (a, k) => [x + Math.cos(a)*r*k, y + Math.sin(a)*r*k*.55, z + Math.sin(a)*r*k*.8], n = 13;
    const c0 = G.v(x, y + .01, z - .01, ...N, heart, h), r1 = [], r2 = [];
    for (let k = 0; k <= n; k++){ const a = k/n*6.28; r1.push(G.v(...U(a, .34), ...N, mul3(heart, 1.25), h)); r2.push(G.v(...U(a, .78), ...N, petal, h)); }
    for (let k = 0; k < n; k++){ G.tri(c0, r1[k], r1[k + 1]); G.tri(r1[k], r2[k], r2[k + 1]); G.tri(r1[k], r2[k + 1], r1[k + 1]);
      const tip = G.v(...U((k + .5)/n*6.28, 1.18), ...N, mix3(petal, [1, 1, .9], .15), h); G.tri(r2[k], tip, r2[k + 1]); } }
  function indPlant(G, R, x, y, z, kind, P){
    G.gc = P.glow;
    if (kind === 0){ G.hs = .45; const th = R.r(.9, 1.1); trunkG(G, x, z, x, th, .05, .035, P.bark, 4); crown(G, R, x, y + th + .55, z, .22, .75, .22, 300, P, th); }
    else if (kind === 1){ G.hs = .7; for (let k = 0, n = R.i(3, 5); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .16), L = R.r(.8, 1.25), la = R.r(0, 6.28);
        G.gc = [0, 0, 0]; const top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, la, L, .05, R.r(.02, .1), mul3(P.leaf, .8), P.leaf, 4); G.gc = P.glow;
        for (let j = 0; j < 2; j++) blade(G, x + Math.cos(a)*rr, y + L*R.r(.3, .6), z + Math.sin(a)*rr, R.r(0, 6.28), R.r(.2, .3), .16, R.r(.8, 1.3), P.leaf, P.tip, 2);
        sunHead(G, top[0], top[1], top[2], R.r(.2, .26), P.fl[0], L); } }
    else if (kind === 2){ for (let k = 0, n = R.i(12, 16); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .15), c = mix3(P.grain, P.leaf, R.r(0, .25));
        const top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.55, .85), .05, R.r(.05, .25), mul3(c, .8), P.grainTip, 4);
        if (R.chance(.75)) seedHead(G, top[0], top[1] - .02, top[2], R.r(.14, .2), P.grainTip, top[1] - y); } }
    else if (kind === 3){ for (let k = 0, n = R.i(14, 18); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .3); blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.2, .36), .08, R.r(.2, .5), mul3(P.leaf, .85), P.tip, 3); }
      for (let k = 0, n = R.i(10, 14); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .32), top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, R.r(.28, .55), .03, R.r(.05, .2), P.leaf, P.leaf, 2);
        flower(G, top[0], top[1], top[2], R.r(.08, .12), R.pick(P.fl), top[1] - y); } }
    else { for (let k = 0, n = R.i(9, 13); k < n; k++){ const a = R.r(0, 6.28), rr = R.r(0, .12), L = R.r(.8, 1.3), top = blade(G, x + Math.cos(a)*rr, y, z + Math.sin(a)*rr, a, L, .06, R.r(.03, .15), mul3(P.leaf, .8), P.tip, 4);
        if (R.chance(.45)){ G.gc = [0, 0, 0]; seedHead(G, top[0], top[1] - .1, top[2], R.r(.16, .22), [.38, .24, .14], L); G.gc = P.glow; } } } }
  const indFolGeo = (kind, pal, seed = 1) => { const G = new GB(); indPlant(G, rng(seed*6151 + kind*37 + 9), 0, 0, 0, kind, INDPAL[pal]); return G.mesh(); };

  /* ---------- the grass as copies: a few tufts of each kind made once, stamped everywhere ---------- */
  // Each kind has GV tufts, made at load in a neutral green. Every tuft painted on the ground is one of those, turned, sized
  // and tinted by where it grows (the watercolor washes of greens and dry ochre, as before), so a meadow is a handful of
  // draws whatever its size, and painting only adds a copy. Under each, a ragged darker blot of ground (one shape, copied).
  const GV = 5, VBASE = GG.greenA, VTIP = mix3(GG.tip, GG.greenA, .35), VAR = [];
  for (let st = 0; st < 4; st++){ VAR.push([]); for (let v = 0; v < GV; v++){ const G = new GB(WGLOW), R = rng(st*7919 + v*104729 + 11); plantOf(G, R, 0, 0, 0, st, VBASE, VTIP, R.r(.15, .45)); VAR[st].push(G.mesh()); } }
  /* ---------- the commercial zone's trees and plants: a layer of their own, over or under the grass ---------- */
  // On a coarser grid than the grass (cells of PC units, a plant in most), kept apart from it, so the grass can be painted
  // under the trees and the trees over the grass. Each plant is a copy of one of PV made at load for each kind and palette
  // (the 3D plant up close, a card far off, as the grass); the palette is laid on in drifts, sea-glass, indigo and gold
  // running into each other across an area.
  const PLANT_KEY = 'neonIsland.coast.plants', PC = 1.6, PV = 3, PSTYLES = [...COMKINDS, 'mix'];
  const PVAR = COMKINDS.map((_, k) => COMPALS.map((pal, pi) => [...Array(PV)].map((_, v) => { const G = new GB(); comPlant(G, rng(k*7919 + pi*104729 + v*31 + 3), 0, 0, 0, k, COMPAL[pal]); return G.mesh(); })));
  // and the industrial zone's: sunflowers, golden grain, wildflower strips (kinds 5, 6, 7), in the harvest colors, three to a cell
  const IPK = [1, 2, 3], IPSTYLES = ['sunflowers', 'golden grain', 'wildflower strip', 'mix'], NCOM = COMKINDS.length;
  for (const ik of IPK) PVAR.push([[...Array(PV)].map((_, v) => { const G = new GB(); indPlant(G, rng(ik*6151 + v*37 + 9), 0, 0, 0, ik, INDPAL.harvest); return G.mesh(); })]);
  const pRow = (kind, pal, v) => 4*GV + (kind < NCOM ? (kind*3 + pal)*PV : NCOM*3*PV + (kind - NCOM)*PV) + v;   // (its row in the card bake)
  const plants = new Map(), pdata = new Map();
  const pSqKey = (i, j) => Math.floor(i*PC/GSQ) + ',' + Math.floor(j*PC/GSQ);
  for (const [i, j, k] of PLOAD){ plants.set(i + ',' + j, [i, j, k]); gDirty.add(pSqKey(i, j)); }
  let pSaveT = 0; const savePlants = () => { clearTimeout(pSaveT); pSaveT = setTimeout(() => { try { localStorage.setItem(PLANT_KEY, JSON.stringify([...plants.values()])); } catch (e) {} }, 400); };
  // which kind grows where, in the mix: trees in groves, columns and swords along their edges, bamboo in clumps
  function mixPlant(i, j){ const x = i*PC, z = j*PC, n = fbm(x*.13 + 31, z*.13 - 8), m = fbm(x*.31 - 2, z*.31 + 17), h = hash2(i*7 + 3, j*11 + 1);
    if (n > .58) return h < .5 ? 0 : 1; if (m > .62) return 3; if (n < .36) return h < .55 ? 4 : 2; return h < .5 ? 2 : h < .8 ? 1 : 4; }
  function plantRecs(i, j, kind){
    const k = i + ',' + j; let L = pdata.get(k); if (L !== undefined) return L; L = [];
    const ind = kind >= NCOM, n = ind ? 3 : 1;
    for (let sI = 0; sI < n; sI++){
      const R = rng((Math.imul(i, 83492791) ^ Math.imul(j, 19349663) ^ 0x5bd1 ^ Math.imul(sI + 1, 2654435761)) >>> 0), x = (i + R.r(ind ? .1 : .25, ind ? .9 : .75))*PC, z = (j + R.r(ind ? .1 : .25, ind ? .9 : .75))*PC, y = grassOK(x, z);
      const reach = ind ? .25 : .5, hgt = ind ? 1.3 : 2.1;
      if (y === null || ![0, 1, 2, 3].every(q => { const a = q*PI/2 + .7; return !solidAt(x + Math.cos(a)*reach, z + Math.sin(a)*reach, y - .2, y + hgt); })) continue;   // (a crown keeps clear of walls)
      const d = fbm(x*.08 - 13, z*.08 + 21) + (R.f() - .5)*.12, pal = ind ? 0 : d < .46 ? 0 : d < .56 ? 1 : 2;
      L.push({ x, y, z, kind, pal, v: R.i(0, PV - 1), rot: R.r(0, PI*2), s: R.r(.88, 1.12), tint: [1, 1, 1], plant: true }); }
    pdata.set(k, L); return L; }
  // the industrial mix: golden grain, with wildflower strips in bands across it (for the pollinators) and sunflowers in clumps
  function mixInd(i, j){ const x = i*PC, z = j*PC, band = Math.sin(x*.42 + z*.31 + 2*fbm(x*.1, z*.1)), n = fbm(x*.21 + 5, z*.21 - 9);
    if (Math.abs(band) < .28) return NCOM + 2; if (n > .62) return NCOM; return NCOM + 1; }
  function paintPlants(cx, cz, r, style, erase, ind = false){
    let any = false;
    for (let i = Math.floor((cx - r)/PC); i <= Math.ceil((cx + r)/PC); i++) for (let j = Math.floor((cz - r)/PC); j <= Math.ceil((cz + r)/PC); j++){
      const d = Math.hypot((i + .5)*PC - cx, (j + .5)*PC - cz); if (d > r + PC*.3) continue; const k = i + ',' + j;
      if (erase){ if (plants.delete(k)){ pdata.delete(k); gDirty.add(pSqKey(i, j)); any = true; } continue; }
      if (plants.has(k) || (!ind && hash2(i*5 + 41, j*3 + 7) > .8)) continue;
      plants.set(k, [i, j, ind ? (style >= 3 ? mixInd(i, j) : NCOM + style) : style >= COMKINDS.length ? mixPlant(i, j) : style]); gDirty.add(pSqKey(i, j)); any = true; }
    if (any){ savePlants(); SHD.dirty = true; } }
  const blotGeo = (() => { const G = new GB(), gc = mul3(VBASE, .72, .6), c0 = G.v(0, .025, 0, 0, 1, 0, gc, 0), n = 9, ring_ = [];
    for (let k = 0; k < n; k++){ const a = k/n*6.28, q = GC*(.8 + .4*hash2(k*31 + 5, k*17 + 3)); ring_.push(G.v(Math.cos(a)*q, .02, Math.sin(a)*q, 0, 1, 0, mul3(gc, 1.06), 0)); }
    for (let k = 0; k < n; k++) G.tri(c0, ring_[(k + 1) % n], ring_[k]); return G.mesh(); })();
  // where a tuft grows, which copy, how it's turned and sized, and its tint (kept, until the ground under it changes)
  function tuftRec(i, j, st){
    const k = i + ',' + j; let r = tdata.get(k); if (r !== undefined) return r;
    const R = rng((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0), x = (i + R.r(.1, .9))*GC, z = (j + R.r(.1, .9))*GC, y = grassOK(x, z);
    if (y === null){ tdata.set(k, null); return null; }
    const wash = fbm(x*.12 + 3, z*.12 - 5), dryK = smooth(.58, .75, fbm(x*.07 - 20, z*.07 + 9))*.55;
    let base = mix3(mix3(GG.greenA, GG.greenB, smooth(.35, .65, wash)), GG.greenC, smooth(.55, .8, fbm(x*.3, z*.3))*.6); base = mix3(base, GG.dry, dryK);
    const tint = base.map((c, q) => clamp(c/VBASE[q], .55, 1.9));
    r = { x, y, z, st, v: Math.floor(hash2(i*13 + 7, j*29 + 3)*GV) % GV, rot: hash2(i*5 + 1, j*7 + 2)*PI*2, s: .85 + .3*hash2(i*11 + 4, j*3 + 9), tint };
    tdata.set(k, r); return r; }

  // the far grass: each tuft as a card, an image of it baked at load from 16 sides (at the view's own downward angle), its
  // colors and the way its surfaces face kept apart so the light, shadows, the night and the haze still fall on it live. A
  // card shows the bake nearest the angle it's seen from, blended with the next, and sways at the top in the wind. All the
  // cards of an area are one draw.
  const CARD = { cols: 16, rows: 4*GV + 5*3*PV + 3*PV, cell: 48, x0: -1.1, x1: 1.1, y0: -.6, y1: 2.4 };   // (tall enough for the trees)
  const cardAlb = new THREE.WebGLRenderTarget(CARD.cols*CARD.cell, CARD.rows*CARD.cell, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const cardNrm = new THREE.WebGLRenderTarget(CARD.cols*CARD.cell, CARD.rows*CARD.cell, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  (function bakeCards(){
    const bs = new THREE.Scene(), bm = new THREE.Mesh(VAR[0][0], null); bm.frustumCulled = false; bs.add(bm);
    const albM = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const nrmM = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN)*0.5 + 0.5, 1.0); }' });
    const bc = new THREE.OrthographicCamera(CARD.x0, CARD.x1, CARD.y1, CARD.y0, .1, 60), P = PITCH0;
    const cc = new THREE.Color(), ca = renderer.getClearAlpha(); renderer.getClearColor(cc);
    for (const [rt, m] of [[cardAlb, albM], [cardNrm, nrmM]]){
      bm.material = m; rt.scissorTest = false; rt.viewport.set(0, 0, rt.width, rt.height); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
      rt.scissorTest = true;
      const ROWS = []; for (let st = 0; st < 4; st++) for (let v = 0; v < GV; v++) ROWS.push([VAR[st][v], st*GV + v]);
      for (let k = 0; k < PVAR.length; k++) for (let pi = 0; pi < PVAR[k].length; pi++) for (let v = 0; v < PV; v++) ROWS.push([PVAR[k][pi][v], pRow(k, pi, v)]);
      for (const [geo, row] of ROWS){ bm.geometry = geo;
        for (let c = 0; c < CARD.cols; c++){ const th = c/CARD.cols*PI*2;
          bc.position.set(-Math.sin(th)*Math.cos(P)*20, Math.sin(P)*20, -Math.cos(th)*Math.cos(P)*20); bc.up.set(0, 1, 0); bc.lookAt(0, 0, 0); bc.updateMatrixWorld();
          rt.viewport.set(c*CARD.cell, row*CARD.cell, CARD.cell, CARD.cell); rt.scissor.copy(rt.viewport); renderer.setRenderTarget(rt); renderer.render(bs, bc); } }
      rt.scissorTest = false; }
    renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
  })();
  const cardGeo = (() => { const g = new THREE.BufferGeometry(), { x0, x1, y0, y1 } = CARD;
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; })();
  const cardM = bent(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, vertexColors: true, map: cardAlb.texture, alphaTest: .5 }));
  { const ob = cardM.onBeforeCompile, cu = { nTex: { value: cardNrm.texture } };
    cardM.onBeforeCompile = sh => { ob(sh); Object.assign(sh.uniforms, gU, cu);
      sh.vertexShader = 'attribute vec2 aCard; attribute vec3 aGc; uniform float wTime; varying vec2 vCA; varying vec2 vCB; varying float vCm; varying float vCy; varying float vGl2; varying vec3 vGc2;\n' + WIND_GLSL + sh.vertexShader
        .replace('#include <project_vertex>', `
          vec4 anc = modelViewMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0); float sc = length(instanceMatrix[0].xyz);
          vec3 fw = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); float cy = cos(aCard.y), sy = sin(aCard.y);
          float lx = cy*fw.x - sy*fw.z, lz = sy*fw.x + cy*fw.z, f = mod(atan(lx, lz)/6.2831853*${CARD.cols}.0 + ${CARD.cols*4}.0, ${CARD.cols}.0), c0 = floor(f), c1 = mod(c0 + 1.0, ${CARD.cols}.0);
          vCm = f - c0; vCy = aCard.y;
          vCA = vec2((c0 + uv.x)/${CARD.cols}.0, (aCard.x + uv.y)/${CARD.rows}.0); vCB = vec2((c1 + uv.x)/${CARD.cols}.0, (aCard.x + uv.y)/${CARD.rows}.0);
          vec2 q = (modelMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0)).xz, wd = vec2(0.83, 0.55); float ph = dot(q, wd)*0.32 - wTime*1.25, paw = windPaw(q, wTime), crest = windCrest(q, wTime), gust = 0.3 + 0.3*sin(ph) + 0.12*sin(ph*2.3 + q.x*0.7 - q.y*0.4) + 0.75*paw*(0.75 + 0.25*crest);
          vGc2 = aGc; vGl2 = windGlint(q, wTime)*smoothstep(0.25, 0.7, uv.y);
          float k = uv.y*uv.y*0.7; vec2 d = wd*(0.08 + 0.3*gust*gust)*k;
          vec3 dv = (viewMatrix*vec4(d.x, 0.0, d.y, 0.0)).xyz*sc;
          vec4 mvPosition = anc + vec4(position.xy*sc + dv.xy, 0.0, 0.0);
          gl_Position = projectionMatrix*mvPosition;`)
        .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4((mvPosition.xyz - viewMatrix[3].xyz)*mat3(viewMatrix), 1.0); vWq = worldPosition.xyz; vG = dot(worldPosition.xz - ctr, fwd);`);
      sh.fragmentShader = 'uniform sampler2D nTex; varying vec2 vCA; varying vec2 vCB; varying float vCm; varying float vCy; varying float vGl2; varying vec3 vGc2;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb += vGc2*(floor(vGl2*3.0 + 0.35)/3.0)*0.75*nightK;\n#include <fog_fragment>')
        .replace('#include <map_fragment>', `{ vec4 tA = texture2D(map, vCA), tB = texture2D(map, vCB), tx = mix(tA, tB, vCm); diffuseColor *= vec4(tx.rgb/max(tx.a, 1e-3), tx.a); }`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          { vec4 nA = texture2D(nTex, vCA), nB = texture2D(nTex, vCB); vec3 nl = normalize((nA.xyz*nA.a*(1.0 - vCm) + nB.xyz*nB.a*vCm)/max(nA.a*(1.0 - vCm) + nB.a*vCm, 1e-3)*2.0 - 1.0 + 1e-4);
            float c = cos(vCy), s = sin(vCy); vec3 nw = vec3(c*nl.x + s*nl.z, nl.y, -s*nl.x + c*nl.z); normal = normalize((viewMatrix*vec4(nw, 0.0)).xyz); }`); };
    cardM.customProgramCacheKey = () => 'grassCard'; }

  // the mix: which kind grows where, in drifts
  function mixStyle(i, j){ const x = i*GC, z = j*GC, n = fbm(x*.16 + 11, z*.16 - 4), m = fbm(x*.35 - 7, z*.35 + 2), h = hash2(i*7 + 1, j*13 + 5);
    if (n < .33) return 2; if (n > .7 && m > .45) return 3; if (m > .62 || h < .08) return 1; return 0; }
  function paintGrass(cx, cz, r, style, erase){
    let any = false;
    for (let i = Math.floor((cx - r)/GC); i <= Math.ceil((cx + r)/GC); i++) for (let j = Math.floor((cz - r)/GC); j <= Math.ceil((cz + r)/GC); j++){
      const x = (i + .5)*GC, z = (j + .5)*GC, d = Math.hypot(x - cx, z - cz); if (d > r) continue; const k = i + ',' + j;
      if (erase){ if (tufts.delete(k)){ tdata.delete(k); gDirty.add(sqKey(i, j)); any = true; } continue; }
      if (tufts.has(k) || hash2(i*3 + 17, j*5 + 29) > .93 - .25*smooth(r*.7, r, d)) continue;   // (a little thinner at the brush's rim)
      tufts.set(k, [i, j, style === 4 ? mixStyle(i, j) : style]); gDirty.add(sqKey(i, j)); any = true; }
    if (any) saveGrass(); }
  // an area of grass: its tufts as copies, a draw for each kind and copy up close, one draw of cards far off, one of blots
  const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3(), _gc = new THREE.Color(), _gy = new THREE.Vector3(0, 1, 0);
  function buildSquare(key){
    const old = gSquares.get(key); if (old){ scene.remove(old); for (const m of old.children){ if (m.userData.own) m.geometry.dispose(); m.dispose && m.dispose(); } gSquares.delete(key); }
    const [si, sj] = key.split(',').map(Number), n = GSQ/GC, recs = [];
    for (let i = si*n; i < si*n + n; i++) for (let j = sj*n; j < sj*n + n; j++){ const t = tufts.get(i + ',' + j); if (!t) continue; const r = tuftRec(i, j, t[2]); if (r) recs.push(r); }
    const pn = GSQ/PC, precs = [];
    for (let i = si*pn; i < si*pn + pn; i++) for (let j = sj*pn; j < sj*pn + pn; j++){ const t = plants.get(i + ',' + j); if (!t) continue; for (const r of plantRecs(i, j, t[2])) precs.push(r); }
    if (!recs.length && !precs.length) return;
    const grp = new THREE.Group(); let ylo = 1e9, yhi = -1e9;
    const put = (im, k, r) => { _gq.setFromAxisAngle(_gy, r.rot); _gm.compose(_gp.set(r.x, r.y, r.z), _gq, _gs.setScalar(r.s)); im.setMatrixAt(k, _gm); im.setColorAt(k, _gc.setRGB(r.tint[0], r.tint[1], r.tint[2])); };
    const mk = (geo, mat, list) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((r, k) => put(im, k, r)); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.raycast = () => {}; grp.add(im); return im; };
    for (const r of recs.concat(precs)){ ylo = Math.min(ylo, r.y); yhi = Math.max(yhi, r.y); }
    if (recs.length) mk(blotGeo, grassM, recs).userData.kind = 'blot';
    for (let k = 0; k < PVAR.length; k++) for (let pi = 0; pi < PVAR[k].length; pi++) for (let v = 0; v < PV; v++){ const l = precs.filter(r => r.kind === k && r.pal === pi && r.v === v); if (l.length){ const im = mk(PVAR[k][pi][v], grassM, l); im.userData.kind = 'near'; im.castShadow = k < NCOM; } }
    for (let st = 0; st < 4; st++) for (let v = 0; v < GV; v++){ const l = recs.filter(r => r.st === st && r.v === v); if (l.length) mk(VAR[st][v], grassM, l).userData.kind = 'near'; }
    const all = recs.concat(precs), cg = cardGeo.clone(), ac = new Float32Array(all.length*2), agc = new Float32Array(all.length*3);
    all.forEach((r, k) => { ac[k*2] = r.plant ? pRow(r.kind, r.pal, r.v) : r.st*GV + r.v; ac[k*2 + 1] = r.rot; agc.set(r.plant ? (r.kind < NCOM ? COMPAL[COMPALS[r.pal]].glow : INDPAL.harvest.glow) : WGLOW, k*3); });
    cg.setAttribute('aCard', new THREE.InstancedBufferAttribute(ac, 2)); cg.setAttribute('aGc', new THREE.InstancedBufferAttribute(agc, 3)); const cm = mk(cg, cardM, all); cm.userData.kind = 'far'; cm.userData.own = true;
    grp.userData = { box: new THREE.Box3(new THREE.Vector3(si*GSQ, ylo - .5, sj*GSQ), new THREE.Vector3(si*GSQ + GSQ, yhi + 2, sj*GSQ + GSQ)) };
    for (const m of grp.children) m.visible = m.userData.kind === 'blot' || (m.userData.kind === 'near') === GLOD.hi;
    scene.add(grp); gSquares.set(key, grp); }
  // Up close the real tufts; past zoom 19 the cards (back below 16: the gap keeps it from switching to and fro). Areas out
  // of view aren't drawn.
  const GLOD = { hi: true }, _gf = new THREE.Frustum(), _gpm = new THREE.Matrix4();
  function grassLOD(){
    const want = GLOD.hi ? zoom < 19 : zoom < 16;
    if (want !== GLOD.hi){ GLOD.hi = want; for (const g of gSquares.values()) for (const m of g.children) m.visible = m.userData.kind === 'blot' || (m.userData.kind === 'near') === want; }
    _gf.setFromProjectionMatrix(_gpm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const g of gSquares.values()) g.visible = _gf.intersectsBox(g.userData.box); }
  function grassTick(t){ gU.wTime.value = t; CURV.gTime.value = t; grassLOD(); const t0 = performance.now(); for (const k of gDirty){ gDirty.delete(k); buildSquare(k); if (performance.now() - t0 > 6) break; } }   // (about 6 ms of remaking a frame at most)
  const grassAround = (x, z, r) => { for (let i = Math.floor((x - r)/GC); i <= Math.ceil((x + r)/GC); i++) for (let j = Math.floor((z - r)/GC); j <= Math.ceil((z + r)/GC); j++){ const k = i + ',' + j; if (tdata.has(k)){ tdata.delete(k); gDirty.add(sqKey(i, j)); } }
    for (let i = Math.floor((x - r - .5)/PC); i <= Math.ceil((x + r + .5)/PC); i++) for (let j = Math.floor((z - r - .5)/PC); j <= Math.ceil((z + r + .5)/PC); j++){ const k = i + ',' + j; if (pdata.has(k)){ pdata.delete(k); gDirty.add(pSqKey(i, j)); SHD.dirty = true; } } };

  ANIM.live = true;   // (homes from the save just appear; new ones are painted in)
  // the ghost: the block under the pointer, see-through, and a ring on the ground green or red
  const ghostM = bent(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .55, depthWrite: false }), false);
  const ringM = bent(new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), false);
  ghostM.customProgramCacheKey = () => 'bentGhost'; ringM.customProgramCacheKey = () => 'bentRing';
  const ghost = new THREE.Mesh(blockOf('townhouse', 1, false, false).geo, ghostM); ghost.visible = false;; ghost.frustumCulled = false; ghost.renderOrder = 5; scene.add(ghost);
  const RN = 48, ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((RN + 1)*2*3), 3));
  { const idx = []; for (let i = 0; i < RN; i++){ const a = i*2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); } ringGeo.setIndex(idx); }
  const ring = new THREE.Mesh(ringGeo, ringM); ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 6; scene.add(ring);
  const PL = { kind: null, rot: 0, hit: null, ok: null, ptr: null, onto: null, seed: 1 + PIECES.length*7 + (PIECES.reduce((a, p) => a + (p.seed || 0), 0) % 997), zkinds: { zone: 'townhouse', czone: 'noodle', izone: 'field' }, zseed: 0, zoneFol: 'res' };   // (zkinds, zseed: single mode's building, per zone)
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
  const isZone = k => k === 'zone' || k === 'czone' || k === 'izone', ZUNIT = () => PL.kind === 'czone' ? 'shop' : PL.kind === 'izone' ? 'structure' : 'home';
  const oneHome = () => isZone(PL.kind) && ZONE.size === 0;
  const curKind = () => oneHome() ? PL.zkinds[PL.kind] : PL.kind, curSeed = () => oneHome() ? PL.zseed : PL.seed;
  function showGhost(){
    PL.onto = null; PL.side = null; zHide();
    const K = curKind(), S = curSeed(), pre = oneHome() ? 'one ' + ZUNIT() + ': ' + KINDS[K].name.toLowerCase() + ' (V next) ' : '';
    const say = (t, ok) => { if (status){ status.textContent = pre + t; status.style.color = ok ? '#5c7060' : '#c0623f'; } };
    const hov0 = K && !SOLO(K) && PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, hov = hov0 && !(hov0.top && SOLO(hov0.piece.kind)) ? hov0 : null, over = hov && hov.top ? hov.piece : null;   // (the grotto goes on the ground only, and nothing stacks on it)
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
  const ZW = [['townhouse', .24], ['villa', .19], ['tower', .14], ['pods', .13], ['pagoda', .12], ['terrace', .12], ['lagoon', .06]];
  const CW = [['noodle', .21], ['lantern', .21], ['kiosk', .17], ['rotunda', .14], ['viaduct', .14], ['grotto', .07], ['ringcourt', .06]];   // (the commercial zone's mix)
  const IW = [['field', .34], ['tunnels', .2], ['dome', .13], ['barn', .11], ['hive', .07], ['vfarm', .06], ['turbine', .09]];   // (fields often don't fit where smaller things do, so they're weighted up)   // (the industrial zone's mix)
  const zPick = R => { const W = PL.kind === 'czone' ? CW : PL.kind === 'izone' ? IW : ZW; let u = R.f(); for (const [k, w] of W){ if ((u -= w) < 0) return k; } return W[0][0]; };
  const zPickStack = R => { for (let t = 0; t < 8; t++){ const k = zPick(R); if (!SOLO(k)) return k; } return PL.kind === 'czone' ? 'lantern' : 'townhouse'; };
  let zLayout = null, zKey = '';
  function zoneLayout(){
    const key = PL.kind + ':' + PL.seed + ':' + ZONE.size; if (key === zKey) return zLayout; zKey = key;
    const R = rng(Math.imul(PL.seed, 2246822519) ^ ZONE.size*7919), rad = ZSIZE[ZONE.size], out = [];
    const target = ZONE.size === 0 ? 1 : Math.max(2, Math.round(PI*rad*rad/15));
    const maxH = ZONE.size <= 1 ? 2 : ZONE.size <= 3 ? 4 : 6;
    for (let t = 0; t < 400 && out.length < target; t++){
      const kind = zPick(R), rb = KINDS[kind].rb, a = R.r(0, PI*2), q = ZONE.size === 0 ? 0 : Math.sqrt(R.f())*Math.max(0, rad - rb*.6);
      const lx = Math.cos(a)*q, lz = Math.sin(a)*q;
      if (out.some(o => Math.hypot(o.lx - lx, o.lz - lz) < o.rb + rb + R.r(-.1, 2.4))) continue;
      const h = 1 + Math.floor(Math.pow(R.f(), 1.4)*maxH*(1 - .45*q/Math.max(rad, 1))), stack = [];
      if (!SOLO(kind)) for (let k = 1; k < Math.min(h, maxH); k++) stack.push(R.chance(.55) ? kind : zPickStack(R));
      out.push({ kind, rb, lx, lz, rot: SOLO(kind) || R.chance(.5) ? 0 : R.pick([PI/2, -PI/2, PI, R.r(-.6, .6)]), seed: R.i(1, 1e6), stack });
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
    else if (!ck.by || SOLO(sp.kind)) return null;
    else {
      const unders = PIECES.filter(q => !SOLO(q.kind) && inHull(q.hullW, sp.x, sp.z)).map(stackTop).sort((a, b) => (b.y + b.top) - (a.y + a.top));
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
    if (status){ status.textContent = 'brush ' + ZONE.size + ': ' + n + ' ' + ZUNIT() + 's' + (ns ? ', ' + ns + ' on top of others' : '') + (nd ? ', ' + nd + ' against others' : '') + (n ? '' : ': no room here'); status.style.color = n ? '#5c7060' : '#c0623f'; }
  }
  function placeZone(){
    if (!PL.hit || PL.hit.sea) return;
    for (const sp of zoneSpots(PL.hit.x, PL.hit.z)){
      const P = planSpot(sp); if (!P) continue;   // (planned again for each: an earlier home of this layout may now be there)
      const col = []; let p = null;
      P.blocks.forEach((bk, i) => { p = i === 0 ? addPiece(bk.kind, P.x, P.z, P.rot, bk.y, true, bk.seed, P.base, 0, P.host) : addPiece(bk.kind, P.x, P.z, P.rot, p.y + p.top, true, bk.seed, p); col.push(p); });
      // now and then a room reaches out off the side of a tall stack, a floor or two up
      const R = rng(sp.seed*7 + 3);
      if (col.length >= 3 && R.chance(.45)){ const host = col[R.i(1, col.length - 2)], kind = R.pick(PL.kind === 'czone' ? ['lantern', 'noodle', host.kind] : ['townhouse', 'villa', host.kind]), a = host.rot + R.i(0, 3)*PI/2;
        const ss = sideSpot(host, kind, host.x + Math.sin(a)*5, host.z + Math.cos(a)*5, sp.seed + 991); if (ss.ok) addPiece(kind, ss.x, ss.z, ss.rot, ss.y, true, sp.seed + 991, null, 0, host); }
    }
    save(); PL.seed++; }
  function clearZone(cx, cz){ const r = Math.max(ZSIZE[ZONE.size], 1.4);
    for (const p of PIECES.filter(q => !q.level && Math.hypot(q.x - cx, q.z - cz) < r)) removePiece(p); }
  /* ---------- the panels: zones (residential, for now), then the landscape tools; the controls on hover ---------- */
  // Residential is one zone with two ways to build: the brush (Q/E sizes it; smallest is one home) or one by one (pick a
  // kind). Choosing it turns the zone on in the current way; the way and the kinds show under it while it's on.
  let lastKind = 'townhouse';
  const resActive = () => PL.kind === 'zone' || !!(PL.kind && KINDS[PL.kind] && !COM(PL.kind) && !IND(PL.kind)), comActive = () => PL.kind === 'czone' || COM(PL.kind), indActive = () => PL.kind === 'izone' || IND(PL.kind);
  function setMode(zone){
    ZONE.on = zone; const was = resActive();
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', (b.dataset.mode === 'zone') === zone));
    if (was){ PL.kind = null; setKind(zone ? 'zone' : lastKind); } else refreshUI(); zHide(); }
  function setKind(k){
    PL.kind = PL.kind === k ? null : k; DSEL = null; delLine.visible = false;
    if (k === 'czone' || COM(k)) PL.zoneFol = 'com'; else if (k === 'izone' || IND(k)) PL.zoneFol = 'ind'; else if (k === 'zone' || KINDS[k]) PL.zoneFol = 'res';   // (the grass tool plants what the last zone picked grows) CN.a = null; connGhost.visible = false; outline.visible = false;
    if (PL.kind && KINDS[PL.kind] && !COM(PL.kind) && !IND(PL.kind)) lastKind = PL.kind;
    if (PL.kind === 'czone' || PL.kind === 'izone' || COM(PL.kind) || IND(PL.kind)) PL.rot = Math.round(yaw/(PI/12))*(PI/12);   // (shops come turned to face the view: their fronts (the grotto's arch) toward the camera)
    ghost.visible = ring.visible = false; zHide();
    if (!PL.kind && status) status.textContent = '';
    refreshUI(); }
  function refreshUI(){
    const res = document.getElementById('zoneRes'); if (res) res.classList.toggle('on', resActive());
    const com = document.getElementById('zoneCom'); if (com) com.classList.toggle('on', comActive());
    const ind = document.getElementById('zoneInd'); if (ind) ind.classList.toggle('on', indActive());
    const sub = document.getElementById('resSub'); if (sub) sub.hidden = !resActive();
    const kinds = document.getElementById('resKinds'); if (kinds) kinds.hidden = ZONE.on;
    document.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === PL.kind));
    const tip = document.getElementById('ctrlTool'); if (tip) tip.innerHTML = controlsFor();
    const gb = document.querySelector('button[data-k=grass] b'); if (gb) gb.textContent = PL.zoneFol === 'com' ? 'Trees' : PL.zoneFol === 'ind' ? 'Planting' : 'Grass';
    if (status) status.classList.toggle('idle', !PL.kind || PL.kind === 'del'); }
  // what the keys and the mouse do with whatever is chosen (shown when Controls is hovered)
  function controlsFor(){
    const row = (k, t) => '<div class="row"><kbd>' + k + '</kbd><span>' + t + '</span></div>';
    if (PL.kind === 'del') return '<h4>Clear an area</h4>' + row('drag', 'select an area') + row('click inside', 'clear it: buildings, walkways, grass') + row('click outside / Esc', 'let the selection go') + row('X', 'back to building');
    if (PL.kind === 'grass' && PL.zoneFol === 'ind') return '<h4>Planting (industrial)</h4>' + row('click / drag', 'plant') + row('right drag', 'clear it (the grass stays)') + row('Q / E', 'bigger / smaller brush') + '<div class="row"><span>pick Residential first for grass, which grows under it</span></div>';
    if (PL.kind === 'grass' && PL.zoneFol === 'com') return '<h4>Trees (commercial)</h4>' + row('click / drag', 'plant') + row('right drag', 'clear the trees (the grass stays)') + row('Q / E', 'bigger / smaller brush') + row('Alt + drag', 'turn the view') + '<div class="row"><span>pick Residential first for grass, which grows under the trees</span></div>';
    if (PL.kind === 'grass') return '<h4>Grass</h4>' + row('click / drag', 'paint') + row('right drag', 'clear') + row('Q / E', 'bigger / smaller brush') + row('V', 'next kind: meadow, wildflowers, ferns, tall grass, mix') + row('Alt + drag', 'turn the view');
    if (PL.kind === 'connect') return '<h4>Walkways</h4>' + row('click, click', 'pick two buildings to join') + row('V', 'next kind: bridge, skywalk, pergola, arcade, wall (or a wing, if they\'re apart), random') + row('right click', 'take away the walkway under it (or let go of the first pick)');
    if (isZone(PL.kind)){ const u = ZUNIT(); return '<h4>' + (PL.kind === 'czone' ? 'Commercial' : PL.kind === 'izone' ? 'Industrial' : 'Residential') + ': brush</h4>' + row('click', 'build the ' + u + 's in the brush') + row('Q / E', 'bigger / smaller (smallest: one ' + u + ')') + row('V', ZONE.size ? 'another layout' : 'next kind (Shift+V: new look)') + row('R', 'turn') + row('right click', ZONE.size ? 'clear the brush' : 'remove the ' + u + ' under it'); }
    if (COM(PL.kind)) return '<h4>Commercial: ' + KINDS[PL.kind].name.toLowerCase() + '</h4>' + row('click', 'build it (on flat ground)') + row('V', 'another look') + row('R', 'turn (it starts facing you)') + row('right click', 'remove the building under it');
    if (PL.kind && KINDS[PL.kind]) return '<h4>Residential: one by one</h4>' + row('click', 'place (on a roof: stack; on a wall: build off it)') + row('V', 'another look') + row('R', 'turn') + row('right click', 'remove (and all above)') + row('Z', 'switch to the brush');
    return '<h4>Pick a zone or a tool</h4>' + row('right click', 'take away the walkway, home or grass under it') + row('1', 'residential') + row('2', 'commercial') + row('3', 'industrial') + row('5', 'walkways') + row('6', 'grass') + row('X', 'clear an area');
  }
  document.getElementById('zoneRes') && document.getElementById('zoneRes').addEventListener('click', () => setKind(resActive() ? PL.kind : 'zone'));   // (always the brush: Q/E size it, smallest is one home)
  document.getElementById('zoneCom') && document.getElementById('zoneCom').addEventListener('click', () => setKind(comActive() ? PL.kind : 'czone'));
  document.getElementById('zoneInd') && document.getElementById('zoneInd').addEventListener('click', () => setKind(indActive() ? PL.kind : 'izone'));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode === 'zone')));
  // a ring round (x, z): on the ground, or at height y
  function ringAt(x, z, r, y = null, w = .14){ ringM.depthTest = true; const a = ringGeo.attributes.position.array;
    for (let i = 0; i <= RN; i++){ const t = i/RN*PI*2, c = Math.cos(t), s_ = Math.sin(t);
      for (const [j, rr] of [[0, r], [1, r + w]]){ const px = x + c*rr, pz = z + s_*rr, o = (i*2 + j)*3; a[o] = px; a[o + 1] = (y === null ? heightAt(px, pz) : y) + .07; a[o + 2] = pz; } }
    ringGeo.attributes.position.needsUpdate = true; ring.visible = true; }

  /* ---------- clearing an area (X), as in the sky city: drag to select, click inside to clear, outside to let go ---------- */
  // The selection is a rectangle squared to the view as it was when the drag began (its sides along the screen's right and
  // up, laid on the ground); everything whose middle is inside goes: homes and shops with all built on or off them, the
  // walkways to them, and the grass. Shown by its edge on the ground and the outline of what it holds.
  let DSEL = null;
  function delRect(a, b){ const c = Math.cos(yaw), s_ = Math.sin(yaw), U = p => p.x*c - p.z*s_, Vv = p => p.x*s_ + p.z*c;
    const r = { c, s: s_, u0: Math.min(U(a), U(b)), u1: Math.max(U(a), U(b)), v0: Math.min(Vv(a), Vv(b)), v1: Math.max(Vv(a), Vv(b)) };
    r.key = [r.u0, r.u1, r.v0, r.v1].map(v => v.toFixed(2)).join(','); return r; }
  const inDel = (r, x, z) => { const u = x*r.c - z*r.s, v = x*r.s + z*r.c; return u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1; };
  const delAt = (r, u, v) => ({ x: u*r.c + v*r.s, z: -u*r.s + v*r.c });   // (back from the view's axes to the ground)
  const delLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe0583c, transparent: true, opacity: .8, depthTest: false }));
  delLine.frustumCulled = false; delLine.renderOrder = 7; delLine.visible = false; scene.add(delLine);
  function showDel(){
    ghost.visible = ring.visible = false; zHide(); connGhost.visible = false; if (status) status.textContent = '';
    if (!DSEL){ delLine.visible = false; return; }
    const r = DSEL, P = [], at = (u, v) => { const q = delAt(r, u, v); return [q.x, heightAt(q.x, q.z) + .1, q.z]; };
    const edge = (ua, va, ub, vb) => { const n = Math.max(1, Math.ceil(Math.hypot(ub - ua, vb - va)/.4)); for (let k = 0; k < n; k++) P.push(...at(ua + (ub - ua)*k/n, va + (vb - va)*k/n), ...at(ua + (ub - ua)*(k + 1)/n, va + (vb - va)*(k + 1)/n)); };
    edge(r.u0, r.v0, r.u1, r.v0); edge(r.u1, r.v0, r.u1, r.v1); edge(r.u1, r.v1, r.u0, r.v1); edge(r.u0, r.v1, r.u0, r.v0);
    delLine.geometry.dispose(); delLine.geometry = new THREE.BufferGeometry(); delLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); delLine.visible = true;
    for (const p of PIECES) if (inDel(r, p.x, p.z)) hlPiece(p, hlDel); }
  function clearArea(r){
    for (const p of PIECES.slice()) if (PIECES.includes(p) && inDel(r, p.x, p.z)) removePiece(p);
    for (let u = r.u0; u <= r.u1 + .01; u += .7) for (let v = r.v0; v <= r.v1 + .01; v += .7){ const q = delAt(r, Math.min(u, r.u1), Math.min(v, r.v1)); paintGrass(q.x, q.z, .5, GR.style, true); paintPlants(q.x, q.z, .5, 0, true); }
    delLine.visible = false; save(); }

  /* ---------- the connect brush: a walk, a bridge, an arcade or a shared wall between two blocks you pick ---------- */
  // Click one block, then another: what joins them is shown, and a click builds it. V steps through the kinds; the last,
  // random, lets each connection choose what suits it (see linkType). Right click: let go of the first block, or, over a
  // block, take away the connections built to it.
  const CN = { a: null, type: 0, key: '', ok: false };
  const connGhost = new THREE.Mesh(new THREE.BufferGeometry(), ghostM); connGhost.visible = false; connGhost.frustumCulled = false; connGhost.renderOrder = 5; scene.add(connGhost);
  // the outline of the way, stretched from the first block's wall to the pointer (or to the second block): its two edges
  // following the ground, a tick across every step, and the ends squared off
  const outM = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .95, depthTest: false });
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), outM); outline.frustumCulled = false; outline.renderOrder = 7; outline.visible = false; scene.add(outline);
  function drawOutline(A, tx, tz, ty, ok){
    const dx0 = tx - A.x, dz0 = tz - A.z, dl = Math.hypot(dx0, dz0); if (dl < .3){ outline.visible = false; return; }
    const dx = dx0/dl, dz = dz0/dl, sx = -dz, sz = dx, t0 = hullExit(A.hullW, A.x, A.z, dx, dz), L = Math.max(.2, dl - t0), n = Math.max(2, Math.ceil(L/.5));
    const y0 = A.level ? A.y : heightAt(A.x + dx*t0, A.z + dz*t0) + .12, P = [];
    const at = (u, s_) => { const x = A.x + dx*(t0 + L*u) + sx*s_, z = A.z + dz*(t0 + L*u) + sz*s_, yl = y0 + (ty - y0)*u; return [x, Math.max(yl, heightAt(x, z) + .1), z]; };
    for (const s_ of [-.5, .5]) for (let k = 0; k < n; k++) P.push(...at(k/n, s_), ...at((k + 1)/n, s_));
    for (let k = 0; k <= n; k++) P.push(...at(k/n, -.5), ...at(k/n, .5));
    outline.geometry.dispose(); outline.geometry = new THREE.BufferGeometry(); outline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    outM.color.set(ok ? 0x9ee6a8 : 0xffd27a); outline.visible = true; }
  function showConnect(){
    ghost.visible = false; zHide();
    const hov = PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, P = hov ? hov.piece : null, tn = LINK_TYPES[CN.type];
    const say = (t, ok) => { if (status){ status.textContent = 'walkways: ' + tn + ' (V next) ' + t; status.style.color = ok ? '#5c7060' : '#c0623f'; } };
    if (!CN.a){ connGhost.visible = false; outline.visible = false; CN.ok = false;
      const lk = PL.ptr ? linkAt(PL.ptr.x, PL.ptr.y) : null;
      if (lk){ ring.visible = false; hlLink(lk, hlDel); say('', false); return; }   // (the outline says it; no words)
      if (P){ ringAt(P.x, P.z, KINDS[P.kind].rb + .35, P.level ? P.y : null); ringM.color.set(0x7dffb0); hlPiece(P, hlSel, false); } else ring.visible = false;
      say(P ? '· click to pick this one' : '· pick the first block', !!P); return; }
    const A = CN.a; ringAt(A.x, A.z, KINDS[A.kind].rb + .35, A.level ? A.y : null); ringM.color.set(0xffd27a);
    hlPiece(A, hlSel, false); if (P && P !== A) hlPiece(P, hlSel, false);
    if (!P || P === A){ connGhost.visible = false; CN.ok = false; const h = PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null;
      if (h) drawOutline(A, h.x, h.z, A.level ? A.y : heightAt(h.x, h.z) + .12, false); else outline.visible = false;
      say('· now pick the second block', false); return; }
    const L = pairOf(A, P), why = !L ? 'they overlap' : L.gap < -.2 ? 'they overlap' : null;   // (no limit on how far: long spans get piers)
    CN.ok = !why;
    { const bx = P.x - (P.x - A.x)/(L ? L.dc : 1)*(L ? L.tB : 0), bz = P.z - (P.z - A.z)/(L ? L.dc : 1)*(L ? L.tB : 0); drawOutline(A, bx, bz, P.level ? P.y : heightAt(bx, bz) + .12, !why); }
    if (why){ connGhost.visible = false; say('· ' + why, false); return; }
    const key = A.id + '|' + P.id + '|' + CN.type;
    if (key !== CN.key){ CN.key = key; const T = new Tris(); L.user = true; L.type = LINK_TYPES[CN.type]; drawLink(T, L, []); connGhost.geometry.dispose(); connGhost.geometry = T.geo(); }
    connGhost.visible = true; say('· click to build it', true); }
  function placeConnect(){
    const hov = PL.ptr ? pieceHit(PL.ptr.x, PL.ptr.y) : null, P = hov ? hov.piece : null;
    if (!CN.a){ if (P){ CN.a = P; CN.key = ''; } return; }
    if (!P || P === CN.a || !CN.ok) return;
    const a = CN.a.id, b = P.id; NOLINK.delete(pairId(a, b)); ULINKS = ULINKS.filter(u => !((u.a === a && u.b === b) || (u.a === b && u.b === a))); ULINKS.push({ a, b, type: LINK_TYPES[CN.type] });
    saveLinks(); linksDirty = true; CN.a = null; CN.key = ''; connGhost.visible = false; outline.visible = false; }
  // What a click is about to act on, shown by its outline only, faintly: terracotta for what a right click would take away,
  // a soft green for what a click would pick.
  // (how: the shapes are drawn flat into a mask of their own, red for take-away, green for pick, and the last pass draws a
  // line one pixel wide just outside the mask's edge, so only the outline shows, over whatever is in front of it)
  const hlDel = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false }), hlSel = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false });
  const hlScene = new THREE.Scene();
  const hlGroup = new THREE.Group(); hlGroup.renderOrder = 8;
  const _I4 = new THREE.Matrix4(), hlDisc = new THREE.CircleGeometry(.9, 24).rotateX(-PI/2), hlDisk = new THREE.MeshBasicMaterial({ color: 0xe0583c, transparent: true, opacity: .28, depthTest: false, depthWrite: false });
  function hlClear(){ while (hlGroup.children.length) hlGroup.remove(hlGroup.children[0]); }
  function hlAdd(geo, M, mat){ const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.matrix.copy(M); m.matrixWorld.copy(M); m.frustumCulled = false; m.renderOrder = 8; m.raycast = () => {}; hlGroup.add(m); }
  function hlPiece(p, mat, all = true){ const seen = new Set(), go = q => { if (!q || seen.has(q)) return; seen.add(q); if (q.mesh) hlAdd(q.mesh.geometry, q.mesh.matrixWorld, mat);
      if (all){ go(q.up); for (const r of PIECES) if (r.host === q) go(r); } }; go(p); }   // (a home and all that goes with it: what's stacked on it and built off it)
  function hlLink(lk, mat){ for (const v of LCACHE.values()) if (v.used && v.geo && pairId(v.a, v.b) === pairId(lk[0], lk[1])){ hlAdd(v.geo, _I4, mat); } }   // (its plants left out: blades would be all edges)
  const grassNear = (x, z, r) => { for (let i = Math.floor((x - r)/GC); i <= Math.ceil((x + r)/GC); i++) for (let j = Math.floor((z - r)/GC); j <= Math.ceil((z + r)/GC); j++) if (tufts.has(i + ',' + j)) return true; return false; };
  function showRemoveHover(){
    ghost.visible = false; zHide(); connGhost.visible = false; ring.visible = false;
    const say = () => { if (status) status.textContent = ''; };   // (the outline says what a right click would take; no words)
    if (!PL.ptr){ if (status) status.textContent = ''; return; }
    const { x, y } = PL.ptr, lk = linkAt(x, y);
    if (lk){ hlLink(lk, hlDel); say('Right click to take away this walkway'); return; }
    const p = pieceAt(x, y); if (p){ hlPiece(p, hlDel); const nm = COM(p.kind) || SOLO(p.kind) ? 'this ' + KINDS[p.kind].name.toLowerCase() : 'this home'; say(p.up || PIECES.some(r => r.host === p) ? 'Right click to take away ' + nm + ' and what\'s built on it' : 'Right click to take away ' + nm); return; }
    const h = pick(x, y);
    if (h && !h.sea && grassNear(h.x, h.z, .9)){ ringAt(h.x, h.z, .9, null, .06); ringM.color.set(0xe0583c); ringM.depthTest = false;   // (over the blades, so it shows)
      say('Right click to clear the grass here'); return; }   // (just the ring round it)
    if (status) status.textContent = ''; }
  // the walkway under the pointer, if it's nearer than any block there: [a id, b id]
  function linkAt(cx, cy){
    if (!linksMesh) return null; const r = canvas.getBoundingClientRect(); _ndc.set((cx - r.left)/r.width*2 - 1, 1 - (cy - r.top)/r.height*2);
    _ray.setFromCamera(_ndc, cam); const h = _ray.intersectObject(linksMesh, false)[0]; if (!h || !h.face) return null;
    const ph = _ray.intersectObjects(pieceMeshes, false)[0]; if (ph && ph.distance < h.distance - .05) return null;
    const v = h.face.a; for (const [o0, o1, a, b] of linkRanges) if (v >= o0 && v < o1) return [a, b]; return null; }
  // with no tool picked, a right click takes away what's under the pointer: a walkway (if it's in front), else a home (and
  // all above it), else the grass there
  function removeAt(cx, cy){
    if (linkAt(cx, cy)){ unConnect(cx, cy); return; }
    const p = pieceAt(cx, cy); if (p){ removePiece(p); return; }
    const h = pick(cx, cy); if (h && !h.sea) paintGrass(h.x, h.z, .9, 0, true); }
  function unConnect(cx, cy){
    if (CN.a){ CN.a = null; connGhost.visible = false; outline.visible = false; return; }
    const lk = linkAt(cx, cy);
    if (lk){ const [a, b] = lk, n = ULINKS.length; ULINKS = ULINKS.filter(u => pairId(u.a, u.b) !== pairId(a, b)); if (ULINKS.length === n) NOLINK.add(pairId(a, b));   // (a built one is unbuilt; one homes made themselves stays away)
      saveLinks(); linksDirty = true; return; }
    const P = pieceAt(cx, cy); if (!P) return; const n = ULINKS.length; ULINKS = ULINKS.filter(u => u.a !== P.id && u.b !== P.id); if (ULINKS.length !== n){ saveLinks(); linksDirty = true; } }

  /* ---------- the grass brush ---------- */
  // Click or drag to paint foliage, right click or right drag to clear it; Q bigger, E smaller; V steps through the kinds.
  const GR = { size: 2, style: 4, pstyle: 5, istyle: 3, last: null }, GRS = [.6, 1.1, 1.8, 2.8, 4.2, 6];
  function showGrass(){
    ghost.visible = false; zHide(); connGhost.visible = false;
    const hit = PL.ptr ? pick(PL.ptr.x, PL.ptr.y) : null; PL.hit = hit;
    const com = PL.zoneFol === 'com', ind = PL.zoneFol === 'ind', nm = com ? 'trees, mixed' : ind ? 'sunflowers, grain and wildflowers' : 'grass: ' + GSTYLES[GR.style];
    if (!hit || hit.sea){ ring.visible = false; if (status) status.textContent = nm + (hit ? ' · not on the sea' : ''); return; }
    ringAt(hit.x, hit.z, GRS[GR.size], null, .12); ringM.color.set(com ? 0x9fd8e0 : ind ? 0xf0d080 : 0xb8e08a);
    if (status){ status.textContent = nm + (com || ind ? '' : ' (V next)') + ' · brush ' + (GR.size + 1); status.style.color = '#33413a'; } }
  function grassStroke(cx, cy, erase, force){
    const h = pick(cx, cy); if (!h || h.sea) return; const r = GRS[GR.size];
    if (!force && GR.last && Math.hypot(h.x - GR.last[0], h.z - GR.last[1]) < r*.35) return;
    GR.last = [h.x, h.z]; if (PL.zoneFol === 'com') paintPlants(h.x, h.z, r, GR.pstyle, erase); else if (PL.zoneFol === 'ind') paintPlants(h.x, h.z, r, GR.istyle, erase, true); else paintGrass(h.x, h.z, r, GR.style, erase); }
  document.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => setKind(b.dataset.k)));
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
    if (PL.kind === 'del' && e.button === 0 && !e.altKey){ act = { kind: 'del', x: e.clientX, y: e.clientY, moved: false, from: pick(e.clientX, e.clientY) }; return; }   // (clear mode: a drag selects)
    // the grass brush paints (left) or clears (right) as it's dragged; Alt+drag or the middle button still turns the view
    if (PL.kind === 'grass' && (e.button === 0 || e.button === 2) && !e.altKey && e.pointerType !== 'touch'){ act = { kind: 'paint', erase: e.button === 2 }; GR.last = null; grassStroke(e.clientX, e.clientY, act.erase, true); }
  });
  // the pointer stirring the water (the lagoon garden's pool, the grotto's): a ring wave from where it passed (glowing by
  // night), the last 8 spots kept (uRip: x, z, time), a new one each time it has moved a little over the water
  const RIP = { i: 0, x: 1e9, z: 1e9, t: 0 };
  function stirWater(cx, cy){
    const now = CURV.gTime.value; if (now - RIP.t < .07) return;
    const h = pick(cx, cy); if (!h) return;
    const inPool = PIECES.some(p => p.kind === 'lagoon' ? Math.hypot(h.x - p.x, h.z - p.z) < 1.85 : p.kind === 'grotto' ? Math.hypot(h.x - (p.x - Math.sin(p.rot)*.25), h.z - (p.z - Math.cos(p.rot)*.25)) < .45 : false);
    if (!inPool || Math.hypot(h.x - RIP.x, h.z - RIP.z) < .25) return;
    CURV.uRip.value[RIP.i].set(h.x, h.z, now); RIP.i = (RIP.i + 1) % 8; RIP.x = h.x; RIP.z = h.z; RIP.t = now; }
  canvas.addEventListener('pointermove', e => {
    PL.ptr = { x: e.clientX, y: e.clientY };
    stirWater(e.clientX, e.clientY);
    const p = ptrs.get(e.pointerId); if (!p || !act) return;
    if (act.kind === 'paint'){ ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); grassStroke(e.clientX, e.clientY, act.erase, false); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act.kind === 'del'){ if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true; const to = pick(e.clientX, e.clientY);
      if (act.moved && act.from && to) DSEL = delRect(act.from, to); return; }
    if (act.kind === 'pinch'){ if (ptrs.size === 2){ zoomT = clamp(zoom0*pinch0/pdist(), ZMIN, ZMAX); const mx = pmidX(); yawT -= (mx - pinchX)*.008; pinchX = mx; } return; }
    if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) act.moved = true;
    if (act.moved){ yawT -= dx*.008; if (tiltMode) pitchT = clamp(pitchT + dy*.006, PITCH_MIN, PITCH_MAX); canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointerleave', () => { PL.ptr = null; hlClear(); });
  const endPtr = e => {
    if (act && act.kind === 'del' && !act.moved && ptrs.has(e.pointerId)){ const h = pick(e.clientX, e.clientY); if (DSEL && h && inDel(DSEL, h.x, h.z)) clearArea(DSEL); DSEL = null; }   // (a click: inside the selection clears it, anywhere else lets it go)
    if (act && act.kind === 'turn' && !act.moved && ptrs.has(e.pointerId) && PL.kind === 'del' && act.b === 2){ DSEL = null; }
    else if (act && act.kind === 'turn' && !act.moved && ptrs.has(e.pointerId)){
      if ((act.b === 0 || e.pointerType === 'touch') && PL.kind){ PL.ptr = { x: e.clientX, y: e.clientY };
        if (PL.kind === 'connect'){ showConnect(); placeConnect(); }
        else if (PL.kind === 'grass') grassStroke(e.clientX, e.clientY, false, true);
        else if (isZone(PL.kind) && !oneHome()){ showZoneGhost(); placeZone(); } else { showGhost(); placeHere(); } }
      else if (act.b === 2 && PL.kind === 'connect') unConnect(e.clientX, e.clientY);
      else if (act.b === 2 && !PL.kind) removeAt(e.clientX, e.clientY);   // (no tool: take away what's under the pointer)
      else if (act.b === 2){ if (isZone(PL.kind) && !oneHome()){ const h = pick(e.clientX, e.clientY); if (h) clearZone(h.x, h.z); } else { const p = pieceAt(e.clientX, e.clientY); if (p) removePiece(p); } }
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
    if (e.key === '1'){ setKind('zone'); return; }
    if (e.key === '2'){ setKind('czone'); return; }
    if (e.key === '3'){ setKind('izone'); return; }
    if (e.key === '5'){ setKind('connect'); return; }
    if (e.key === '6'){ setKind('grass'); return; }
    if (k === 'x' && !e.repeat){ setKind('del'); return; }
    if (PL.kind === 'grass' && (k === 'q' || k === 'e')){ GR.size = clamp(GR.size + (k === 'q' ? 1 : -1), 0, GRS.length - 1); return; }
    if (PL.kind === 'grass' && k === 'v'){ if (PL.zoneFol === 'com' || PL.zoneFol === 'ind') return; else GR.style = (GR.style + 1) % GSTYLES.length; return; }
    if (PL.kind === 'connect' && k === 'v'){ CN.type = (CN.type + 1) % LINK_TYPES.length; CN.key = ''; return; }
    if (isZone(PL.kind) && (k === 'q' || k === 'e')){ ZONE.size = clamp(ZONE.size + (k === 'q' ? 1 : -1), 0, ZSIZE.length - 1); return; }   // (Q: a bigger brush, E: a smaller one)
    if (k === 'v'){   // (single mode: the next kind of home, Shift+V another look of it; otherwise another look or layout)
      if (oneHome()){ if (e.shiftKey) PL.zseed++; else { const KS = PL.kind === 'czone' ? COM_KEYS : PL.kind === 'izone' ? IND_KEYS : RES_KEYS; PL.zkinds[PL.kind] = KS[(KS.indexOf(PL.zkinds[PL.kind]) + 1) % KS.length]; } } else PL.seed++; return; }
    if (e.key === 'Escape' || e.key === '0'){ if (PL.kind === 'del' && DSEL){ DSEL = null; return; } if (PL.kind) setKind(PL.kind); return; }
    if (k === 'q') yawT -= PI/4;
    else if (k === 'e') yawT += PI/4;
    else if (e.key === '+' || e.key === '=') zoomT = clamp(zoomT*.9, ZMIN, ZMAX);
    else if (e.key === '-') zoomT = clamp(zoomT*1.1, ZMIN, ZMAX);
  });
  // the time panel: a slider through the whole day, and the times to jump to
  const tSlider = document.getElementById('timeSlider'), tClock = document.getElementById('clock');
  const periodOf = h => h < 4.8 || h >= 21 ? 'Night' : h < 6.4 ? 'Dawn' : h < 9 ? 'Morning' : h < 12 ? 'Late morning' : h < 14 ? 'Midday' : h < 17 ? 'Afternoon' : h < 19 ? 'Golden hour' : 'Dusk';
  function setTime(h){ setHour(h); if (tSlider){ tSlider.value = h; tSlider.style.setProperty('--p', (h/24*100).toFixed(2) + '%'); } const pe = document.getElementById('period'); if (pe) pe.textContent = periodOf(h); const ro = document.getElementById('readout'); if (ro) ro.textContent = String(Math.floor(h) % 24).padStart(2, '0') + ':' + String(Math.floor((h % 1)*60)).padStart(2, '0') + ' · ' + periodOf(h); if (tClock){ const hh = Math.floor(h) % 24, mm = Math.floor((h % 1)*60); tClock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
    document.querySelectorAll('[data-h]').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.h - h) < .01)); }
  if (tSlider) tSlider.addEventListener('input', () => setTime(+tSlider.value));
  document.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => setTime(+b.dataset.h)));
  // settings opens on the right, as in the sky city; the turn buttons either side of the cards
  { const dt_ = document.getElementById('deckToggle'), dk = document.getElementById('deck');
    if (dt_ && dk) dt_.addEventListener('click', () => { dk.hidden = !dk.hidden; dt_.textContent = dk.hidden ? 'Settings' : 'Close'; dt_.setAttribute('aria-expanded', String(!dk.hidden)); }); }
  document.getElementById('rotL') && document.getElementById('rotL').addEventListener('click', () => { yawT -= PI/4; });
  document.getElementById('rotR') && document.getElementById('rotR').addEventListener('click', () => { yawT += PI/4; });

  /* ---------- every frame ---------- */
  // the reflection pass: everything above the water, flipped upside down about it and drawn flat in its own colors (no
  // lights, no shadows) into a target the size of the view, where the sea reads it at its own pixel, through the ripples
  const reflM = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)] });   // (double sided: a mirrored view turns the faces' winding round)
  reflM.onBeforeCompile = sh => { sh.uniforms.nightK = CURV.nightK; sh.uniforms.uShopA = CURV.uShopA; sh.uniforms.uShopB = CURV.uShopB; sh.uniforms.uShopC = CURV.uShopC;   // (by night the lit windows show in the water, warm)
    sh.vertexShader = GLOW_V + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = glow;');
    sh.fragmentShader = 'uniform float nightK;\n' + GLOW_F + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vGlow > 0.85 ? vec3(1.0, 0.85, 0.46) : vGlow > 0.2 && vGlow < 0.3 ? vColor*1.2 : vGlow > 0.1 && vGlow < 0.2 ? shopLight(vGlow) : vGlow > 0.3 && vGlow < 0.4 ? vec3(0.1, 0.22, 0.25) : vec3(1.0, 0.6, 0.28), step(0.01, vGlow)*nightK);\n#include <fog_fragment>'); };
  renderer.localClippingEnabled = true;
  // (the reflection is drawn from a camera mirrored in the water's plane, not by flipping the whole scene, which made
  // every object's matrix be worked out again twice a frame; it's drawn every other frame, the ripples hide the step, and
  // only from what stands near enough the water to show in it: the land and homes far inland are left out)
  const reflCam = new THREE.OrthographicCamera(); reflCam.matrixAutoUpdate = false;
  const MIRROR = new THREE.Matrix4().makeScale(1, -1, 1);
  let reflFrame = 0;
  const nearSea = (x, z, m) => coastX(z) - x < m;
  function renderRefl(){
    if ((reflFrame++ & 1) && !TOFF.fix) return;
    reflCam.projectionMatrix.copy(cam.projectionMatrix); reflCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    reflCam.matrix.multiplyMatrices(MIRROR, cam.matrixWorld); reflCam.updateMatrixWorld(true);
    const hide = [sea, spray, ghost, ring, connGhost, outline, hlGroup, ...zGhosts, ...BLOOMS];
    for (const m of gSquares.values()) hide.push(m);
    if (poolMesh) hide.push(poolMesh);
    if (linksMesh) hide.push(...linksMesh.children);
    for (const m of pieceMeshes){ if (m.userData.fol) hide.push(m.userData.fol); if (!nearSea(m.position.x, m.position.z, 22)) hide.push(m); }
    for (const [k, ms] of HB.map){ const [bi, bj] = k.split(',').map(Number); for (const m of ms) if (m.userData.fol || !nearSea((bi + 1)*HB.size, (bj + .5)*HB.size, 22)) hide.push(m); }
    for (const ch of chunks.values()) if (ch.mesh && !nearSea(ch.i*CH + CH, ch.j*CH + CH/2, 14) && !nearSea(ch.i*CH + CH, ch.j*CH, 14) && !nearSea(ch.i*CH + CH, ch.j*CH + CH, 14)) hide.push(ch.mesh);
    const vis = hide.map(o => o.visible); for (const o of hide) o.visible = false;
    scene.overrideMaterial = reflM;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.render(scene, reflCam);
    scene.overrideMaterial = null; hide.forEach((o, i) => { o.visible = vis[i]; });
  }

  setTime(11); resize();
  updateCamera(0); stream(1e9);   // (the first view whole, before the first frame)
  // compile now, while loading, every shader that would otherwise first be needed in play (the paint-in, the pigment
  // blooms, the night's light pools and glow bleed): a shader compiled mid-play stalls the frame
  { const g = blockOf('townhouse', 1, false, false).geo, tmp = [...PAINT_POOL.map(pm => new THREE.Mesh(g, pm.mat)), new THREE.Mesh(g, poolM), new THREE.Mesh(g, grassM)];
    { const ig = new THREE.InstancedMesh(blotGeo, grassM, 1); ig.setColorAt(0, new THREE.Color()); tmp.push(ig); const cg = cardGeo.clone(); cg.setAttribute('aCard', new THREE.InstancedBufferAttribute(new Float32Array(2), 2)); const ic = new THREE.InstancedMesh(cg, cardM, 1); ic.setColorAt(0, new THREE.Color()); tmp.push(ic); }
    for (const m of tmp){ m.visible = false; scene.add(m); } renderer.compile(scene, cam); for (const m of tmp) scene.remove(m);
    for (const m of [extractM, blurM]){ postQ.material = m; renderer.compile(postScene, skyCam); } renderer.compile(blitScene, skyCam); }
  const t0 = performance.now(), TOFF = { v: 0 }; let last = t0;   // (TOFF: a test hook, to look at the sea at a given moment)
  // The shadows are cached: the scene's casters don't move, so the shadow map is drawn again only when the light moves,
  // the shadow box moves with the view, or a caster comes, goes or changes (SHD.dirty, set wherever that happens)
  function shadowTick(){
    const sc = sun.shadow.camera, k = sun.position.x.toFixed(3) + ',' + sun.position.y.toFixed(3) + ',' + sun.position.z.toFixed(3) + ',' + sc.right.toFixed(2) + ',' + sc.far.toFixed(1) + ',' + sun.target.position.x.toFixed(3);
    if (k !== SHD.key || SHD.dirty){ SHD.key = k; SHD.dirty = false; renderer.shadowMap.needsUpdate = true; } }
  // PROF: a test hook, time per part of the frame (CPU side; the GPU's share shows up in render)
  const tk = (name, t0_) => { if (PROF.on){ const t1 = performance.now(); PROF.acc[name] = (PROF.acc[name] || 0) + t1 - t0_; return t1; } return 0; };
  let fNo = 0, halfDt = 0, ghostKey = '';
  function frame(now){
    const dt = Math.min(.1, (now - last)/1000); last = now; fNo++; let q = PROF.on ? performance.now() : 0;
    updateCamera(dt); q = tk('camera', q); stream(3); q = tk('stream', q);
    { const gk = [PL.kind || '-', PL.ptr ? PL.ptr.x + ',' + PL.ptr.y : '-', camT.x.toFixed(3), camT.z.toFixed(3), yaw.toFixed(4), zoom.toFixed(3), pitch.toFixed(4), PIECES.length, linksDirty, ZONE.size, PL.seed, PL.zseed, PL.zkinds.zone, PL.zkinds.czone, PL.zkinds.izone, PL.rot, DSEL ? DSEL.key : '-', GR.size, GR.style, GR.pstyle, GR.istyle, PL.zoneFol, CN.type, CN.a ? CN.a.id : 0, ULINKS.length].join('|');
      if (gk !== ghostKey){ ghostKey = gk;   // (the ghost is worked out again only when something it shows has changed: the raycasts and checks are the costly part)
        hlClear();
        if (PL.kind === 'connect') showConnect(); else if (PL.kind === 'del') showDel(); else if (PL.kind === 'grass') showGrass(); else if (isZone(PL.kind) && !oneHome()) showZoneGhost(); else if (PL.kind) showGhost(); else showRemoveHover(); } }
    q = tk('ghost', q);
    animTick(dt); rotorTick(dt); agentTick(dt); const batched = batchTick();
    if (linksDirty && !ANIM.list.length && !batched) buildLinks();   // (not in the same frame as a batch: the two together made a hitch)
    q = tk('anim+links', q);
    const t = TOFF.fix !== undefined ? TOFF.fix : (now - t0)/1000 + TOFF.v; seaU.time.value = t; sprayTick(dt, t, !(fNo & 3) || TOFF.fix !== undefined); /* (a crest's arrival is caught every fourth frame; the spray itself moves every frame) */ q = tk('spray', q); grassTick(t); q = tk('grass', q);
    halfDt += dt; if ((fNo & 1) || TOFF.fix !== undefined){ foamStep(halfDt); halfDt = 0; } q = tk('foam', q); renderRefl(); q = tk('reflection', q);   // (the foam's slow: it keeps up at half the rate)
    shadowTick();
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(skyScene, skyCam);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam); if (PROF.on){ PROF.calls += renderer.info.render.calls; PROF.tris += renderer.info.render.triangles; } q = tk('main render', q);
    renderer.autoClear = true; glowPass(); q = tk('glow', q);
    blit.material.uniforms.hlOn.value = hlGroup.children.length ? 1 : 0;
    if (hlGroup.children.length){ hlScene.add(hlGroup); renderer.setRenderTarget(hlRT); const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(hlScene, cam); renderer.setClearColor(cc, ca); }
    renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(blitScene, skyCam); q = tk('blit', q); if (PROF.on) PROF.n++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.COAST = { buildLinks: () => buildLinks(), batchTick: () => batchTick(), buildChunk: (i, j, l) => buildChunk(i, j, l), heightRow, coveAt, rocksNear, rowCos, PROF, seaU, TOFF, WAVE, ANIM, scene, renderer, cam, screenOf(x, y, z){ const v = new THREE.Vector3(x, y, z).project(cam), r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1)/2*r.width, r.top + (1 - v.y)/2*r.height]; }, ULINKS: () => ULINKS, paintGrass, tufts, GR, CN, buildSquare, folGeo, get t0(){ return t0; }, setHour: h => setTime(h), heightAt, coastX, pick, PIECES, CURV, AG, agentTick: dt => agentTick(dt), FIELD, inHull: (P, x, z) => inHull(P, x, z), RAILS, indFolGeo, INDKINDS, paintPlants, plants, comFolGeo, COMPAL, COMKINDS, grassM,
    get state(){ return { yaw, zoom, pitch, x: camT.x, z: camT.z, k: V.k, gH: V.gH, chunks: chunks.size, built: [...chunks.values()].filter(c => c.mesh).length }; },
    go(o){ if (o.yaw !== undefined) yaw = yawT = o.yaw; if (o.zoom !== undefined) zoom = zoomT = o.zoom; if (o.pitch !== undefined) pitch = pitchT = o.pitch;
      if (o.x !== undefined) camGoal.x = camT.x = o.x; if (o.z !== undefined) camGoal.z = camT.z = o.z; },
    place(kind, x, z, rot = 0, seed = 1){ const ck = check(kind, x, z, seed, rot); return ck.ok ? addPiece(kind, x, z, rot, ck.y, false, seed) : ck; },
    stack(onto, kind, seed = 1){ const t = stackTop(onto); return t.level < MAXLV - 1 ? addPiece(kind, t.x, t.z, t.rot, t.y + t.top, false, seed, t) : null; },
    side(host, kind, ang, seed = 1){ const ss = sideSpot(host, kind, host.x + Math.sin(host.rot + ang)*5, host.z + Math.cos(host.rot + ang)*5, seed); return ss.ok ? addPiece(kind, ss.x, ss.z, ss.rot, ss.y, false, seed, null, 0, host) : ss; },
    clear(){ while (PIECES.length) removePiece(PIECES[0]); } };
})();
