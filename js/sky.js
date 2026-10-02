// Neon Terrarium: Time of day, the pixel composite (outlines, sky, stars, rain, reflections, light shafts) and clouds.
// All game scripts share one scope and load in order (see index.html).
'use strict';
/* ---------- time of day ---------- */
const C = h => new THREE.Color(h);
const KEYS = [
  { h:0,    top:C(0x0b1226), bot:C(0x1B2A4A), sun:C(0x7086c9), si:.42, hs:C(0x34507a), hg:C(0x1a1f2e), hi:.55, night:1,   cloud:C(0x3a4766) },
  { h:5,    top:C(0x0f1830), bot:C(0x2C3A52), sun:C(0x7086c9), si:.4,  hs:C(0x3a5480), hg:C(0x1f2233), hi:.55, night:.95, cloud:C(0x44506e) },
  { h:6.6,  top:C(0x3a4f7e), bot:C(0xF2C9A5), sun:C(0xffb07a), si:.75, hs:C(0x8a9cc4), hg:C(0x5a4a4a), hi:.6,  night:.5,  cloud:C(0xe8b9a8) },
  { h:9,    top:C(0x7fb2dc), bot:C(0xd4e6f0), sun:C(0xfff1dc), si:1.0, hs:C(0xbcd6ee), hg:C(0x8a7a66), hi:.6,  night:.04, cloud:C(0xf4f1ea) },
  { h:12,   top:C(0x6aa6d6), bot:C(0xcfe4f2), sun:C(0xfff6e6), si:1.1, hs:C(0xc4dcf0), hg:C(0x8a7a66), hi:.62, night:0,   cloud:C(0xffffff) },
  { h:15.5, top:C(0x78a8d2), bot:C(0xeed8bc), sun:C(0xffe6bc), si:1.0, hs:C(0xc8cfe0), hg:C(0x7a6a58), hi:.6,  night:.05, cloud:C(0xfbf0e2) },
  { h:17.2, top:C(0x6f8fc0), bot:C(0xF6B35C), sun:C(0xffb35c), si:1.0, hs:C(0xc9a6a0), hg:C(0x6a4a3a), hi:.55, night:.35, cloud:C(0xF2C9A5) },
  { h:18.9, top:C(0x2c3a6e), bot:C(0xc97a9a), sun:C(0xd77aa0), si:.5,  hs:C(0x6a6aa0), hg:C(0x3a2f44), hi:.5,  night:.8,  cloud:C(0x9a86b8) },
  { h:20.5, top:C(0x0d1530), bot:C(0x1f2d52), sun:C(0x7086c9), si:.42, hs:C(0x34507a), hg:C(0x1a1f2e), hi:.55, night:1,   cloud:C(0x3a4766) },
  { h:24,   top:C(0x0b1226), bot:C(0x1B2A4A), sun:C(0x7086c9), si:.42, hs:C(0x34507a), hg:C(0x1a1f2e), hi:.55, night:1,   cloud:C(0x3a4766) },
];
const cur = { top:new THREE.Color(), bot:new THREE.Color(), sun:new THREE.Color(), hs:new THREE.Color(), hg:new THREE.Color(), cloud:new THREE.Color(), si:1, hi:.6, night:0 };
const RAIN_SKY = C(0x28324a), tmpC = new THREE.Color();
// The sun keeps a fixed direction but travels with the view, so its shadow box always covers what's on screen,
// however far from the start the player has built. The box snaps in steps, and shadows redraw only when it moves.
// Its size comes from the screen: the farthest ground point in view is a screen corner, the screen's half-width
// sideways (zoom times the aspect) and its half-height deep (zoom over the sine of the pitch), plus room for
// rooftops at the top of the screen, which stand on ground further back. A square that wide around the view's
// middle covers every corner however the view is turned. (Casters outside it don't need covering: seen from the
// sun, a shadow lands on the same spot of the shadow map as the thing that casts it.)
// The sun stands far back (SUN_BACK) and sees deep (core.js), so tall buildings well toward the sun, whose long
// shadows reach into view in the evening, are always in its view.
const SUN_DIR = new THREE.Vector3(0, 1, 0), _sunC = new THREE.Vector3(), _sunCLast = new THREE.Vector3(1e9, 0, 0);
const SUN_BACK = 260;
// Stable shadows: the box only ever moves by whole shadow-map texels, measured along the sun's own view axes, so
// when it moves and the shadows are redrawn they land on exactly the same grid as before and nothing changes on
// screen (moving it any other amount made every shadow edge in the city re-pixelate at once, a visible pop).
// The box also comes in a few fixed sizes, each a fifth bigger than the last, so zooming re-pixelates the shadows
// only a handful of times instead of every few units.
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _lz = new THREE.Vector3(), _lUp = new THREE.Vector3(0, 1, 0);
let _shHalfLast = 0;
function placeSun(){
  const asp = Math.max(1, W/H), reach = Math.hypot(zoomT*asp, zoomT/Math.sin(PITCH)) + 30;   // +30: tall rooftops at the screen edge, and the box's steps
  const half = 30*Math.pow(1.2, Math.max(0, Math.ceil(Math.log(reach/30)/Math.log(1.2))));
  if (half !== _shHalfLast){
    const sc = sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix();
    _shHalfLast = half; shadowDirty = true; _sunCLast.set(1e9, 0, 0);
  }
  // the sun camera's axes, as three.js's lookAt builds them: z toward the sun, x = up x z, y = z x x
  _lz.copy(SUN_DIR); _lx.crossVectors(_lUp, _lz).normalize(); _ly.crossVectors(_lz, _lx);
  const texel = 2*half/sun.shadow.mapSize.x, step = texel*Math.max(1, Math.round(6/texel));
  const u = Math.round(camGoal.dot(_lx)/step)*step, v = Math.round(camGoal.dot(_ly)/step)*step, w = Math.round(camGoal.dot(_lz)/6)*6;   // along the sun it makes no difference to the grid
  _sunC.copy(_lx).multiplyScalar(u).addScaledVector(_ly, v).addScaledVector(_lz, w);
  if (_sunC.distanceToSquared(_sunCLast) > 1e-8){ _sunCLast.copy(_sunC); shadowDirty = true; }
  sun.target.position.copy(_sunC); sun.target.updateMatrixWorld();
  sun.position.copy(_sunC).addScaledVector(SUN_DIR, SUN_BACK);
}
// Colour grades by time of day: lift tints the shadows, gain the highlights; sat and con are saturation and
// contrast. Golden hour: warm highlights over violet-teal shadows. Blue hour: cool and soft. Night: deep blue-violet
// shadows and a little extra saturation so neon pops. Rain mutes it all.
const GRADES = {
  day:    { lift: [.0, .006, .02], gain: [1.02, 1.0, .97], sat: 1.06, con: 1.03 },
  golden: { lift: [.025, .0, .055], gain: [1.1, .99, .84], sat: 1.14, con: 1.07 },
  blue:   { lift: [.0, .012, .05], gain: [.95, .98, 1.07], sat: 1.04, con: 1.02 },
  night:  { lift: [.012, .0, .04], gain: [.97, .98, 1.04], sat: 1.16, con: 1.08 },
  rain:   { lift: [.01, .015, .03], gain: [.95, .98, 1.0], sat: .86, con: .98 },
};
const _gr = { lift: [0, 0, 0], gain: [0, 0, 0], sat: 0, con: 0 };
function gradeFor(h, rain){
  // weights for each look across the day (golden hour round sunrise and sunset, blue hour just after dusk and before dawn)
  const bump = (x, a, b, c, d) => x <= a || x >= d ? 0 : x < b ? (x - a)/(b - a) : x <= c ? 1 : (d - x)/(d - c);
  const w = { golden: Math.max(bump(h, 15.4, 16.6, 18.2, 19.0), bump(h, 5.4, 6.0, 7.0, 8.0)), blue: Math.max(bump(h, 18.6, 19.3, 19.8, 20.6), bump(h, 4.4, 5.0, 5.4, 6.0)) };
  w.night = (h >= 20.2 || h < 4.8) ? 1 : (h > 19.6 ? (h - 19.6)/.6 : h < 5.4 ? (5.4 - h)/.6 : 0);
  w.night = Math.max(0, Math.min(1, w.night)) * (1 - w.blue*.6);
  w.day = Math.max(0, 1 - w.golden - w.blue - w.night);
  const tot = w.day + w.golden + w.blue + w.night;
  _gr.lift = [0, 0, 0]; _gr.gain = [0, 0, 0]; _gr.sat = 0; _gr.con = 0;
  for (const k of ['day', 'golden', 'blue', 'night']){ const g = GRADES[k], f = w[k]/tot;
    for (let q=0; q<3; q++){ _gr.lift[q] += g.lift[q]*f; _gr.gain[q] += g.gain[q]*f; } _gr.sat += g.sat*f; _gr.con += g.con*f; }
  if (rain){ const r = GRADES.rain, f = .65; for (let q=0; q<3; q++){ _gr.lift[q] += (r.lift[q] - _gr.lift[q])*f; _gr.gain[q] += (r.gain[q] - _gr.gain[q])*f; } _gr.sat += (r.sat - _gr.sat)*f; _gr.con += (r.con - _gr.con)*f; }
  return w;
}
function applyTime(){
  const h = S.hour;
  let i = 0; while (i < KEYS.length-2 && KEYS[i+1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i+1], t = Math.min(1, Math.max(0, (h-a.h)/(b.h-a.h)));
  for (const k of ['top','bot','sun','hs','hg','cloud']) cur[k].copy(a[k]).lerp(b[k], t);
  for (const k of ['si','hi','night']) cur[k] = a[k] + (b[k]-a[k])*t;
  if (S.rain){ cur.top.lerp(RAIN_SKY,.55); cur.bot.lerp(RAIN_SKY,.5); cur.cloud.lerp(RAIN_SKY,.5); cur.si *= .55; cur.night = Math.min(1, cur.night+.15); }
  const night = cur.night;
  // One continuous path, so shadows never flip: by day the sun climbs from the east (6:00) and sets in the west
  // (18:00); after that the same light rises as the moon over the west and travels back across the night sky to be
  // the sunrise in the east. Its height follows |sin|, so it never dips below the horizon. (It used to jump straight
  // from the setting sun to the moon on the other side, flipping every shadow at about 17:48 and 6:12.)
  const ang = ((h - 6)/12)*PI;
  SUN_DIR.set(Math.cos(ang)*.9, .32 + Math.abs(Math.sin(ang))*.9, .5).normalize(); placeSun();
  sun.color.copy(cur.sun); sun.intensity = cur.si;
  hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
  M.cloud.color.copy(cur.cloud);
  const tn = FOL_UNI.tint.value.copy(cur.hs).multiplyScalar(cur.hi*.9).add(tmpC.copy(cur.sun).multiplyScalar(cur.si*.55));
  tn.r = Math.min(tn.r,1.1); tn.g = Math.min(tn.g,1.1); tn.b = Math.min(tn.b,1.1);
  FOL_UNI.neonI.value = .8 + .2*night;
  for (const m of ALL_MATS){
    const g = m.userData.glow; if (!g) continue;
    m.emissiveIntensity = g==='window' ? .22+1.1*night : g==='bulb' ? .3+1.2*night : g==='neon' ? .6+1.0*night : g==='trim' ? .45+.9*night : 1.3;
  }
  { const e = EM_I.value; e[1] = .22+1.1*night; e[2] = .3+1.2*night; e[3] = .6+1.0*night; e[4] = .45+.9*night; e[5] = 1.3; e[6] = 1.5+.4*night; }
  for (const k of ['pink','cyan','amber','warm']) GLOW[k].opacity = .1 + .8*night;
  GLOW.red.opacity = .95;
  GLOW_NIGHT.value = .1 + .8*night;
  GLOW.blue.opacity = .85;
  comp.uniforms.skyTop.value.copy(cur.top); comp.uniforms.skyBot.value.copy(cur.bot);
  comp.uniforms.haze.value.copy(cur.bot); comp.uniforms.night.value = night;
  const w = gradeFor(h, S.rain);
  if (S.grade === false){ glowMix.uniforms.lift.value.set(0, 0, 0); glowMix.uniforms.gain.value.set(1, 1, 1); glowMix.uniforms.sat.value = 1; glowMix.uniforms.con.value = 1; }
  else { glowMix.uniforms.lift.value.fromArray(_gr.lift); glowMix.uniforms.gain.value.fromArray(_gr.gain); glowMix.uniforms.sat.value = _gr.sat; glowMix.uniforms.con.value = _gr.con; }
  // rim light: warm sunlight, strongest at golden hour, a little by day; cool moonlight at night; weak in the rain
  comp.uniforms.rimI.value = S.rim === false ? 0 : (.25*w.day + 1.0*w.golden + .3*w.blue + .45*w.night)*(S.rain ? .35 : 1);
  comp.uniforms.rimCol.value.setRGB(1.0, .7, .38).lerp(tmpC.setRGB(.42, .55, .9), Math.min(1, w.night + w.blue*.5));
  return night;
}
function phaseName(h){
  if (h >= 5 && h < 8) return 'Dawn';
  if (h >= 8 && h < 16) return 'Day';
  if (h >= 16 && h < 18.3) return 'Golden hour';
  if (h >= 18.3 && h < 19.9) return 'Dusk';
  return 'Night';
}

/* ---------- post: pixel composite ---------- */
const PAL_HEX = ['#1B2A4A','#2C3A52','#4A5566','#C9B89A','#E3D6BD','#9EC4E0','#F2C9A5','#F6B35C','#3F5A2C','#6B8A3A','#8FA04A','#8A4A2A','#A0603A','#FFCF7A','#F4A340','#FF4FA3','#38E8E0','#FFB347','#EEF0EE','#7FE8E0',
  '#0B1226','#141C30','#262033','#33302E',
  '#5f9a94','#c98a8a','#c9a24a','#3f6fa8','#d9a55a','#c0674a','#9aa982','#9c5a44','#cfe8e0','#eadbd6','#5f7d5b','#3f5f58','#6b7280','#55585c','#7a7064','#b49a78'];
// the star map view: SKY_EL is the elevation at the middle of the screen, SKY_H half the screen's height (radians),
// SKY_TURN how far the sky turns for each turn of the camera
const SKY_EL = .3, SKY_H = .5, SKY_TURN = 1, SKY_DRIFT = 0;   // a real sky: fixed around the world, so turning the camera looks at another part of it; panning never moves it (it's infinitely far away)
const comp = new THREE.ShaderMaterial({
  uniforms: {
    tColor:{value:null}, tDepth:{value:null}, tNormal:{value:null}, res:{value:new THREE.Vector2(1,1)},
    near:{value:NEAR}, far:{value:FAR}, camDist:{value:CAM_DIST}, skyTop:{value:new THREE.Color()}, skyBot:{value:new THREE.Color()}, haze:{value:new THREE.Color()},
    night:{value:0}, lodLines: LOD.lines, pxK:{value:1}, starOff:{value:new THREE.Vector2()}, skyYaw:{value:0}, rainOff:{value:new THREE.Vector2()}, windR:{value:1}, outlines:{value:1}, palOn:{value:0}, time:{value:0},
    pal:{value: PAL_HEX.map(h => { const c=new THREE.Color(h); return new THREE.Vector3(c.r,c.g,c.b); })},
    tCloud:{value:null}, VP:{value:new THREE.Matrix4()}, upView:{value:new THREE.Vector3(0,1,0)}, wet:{value:.2}, rainOn:{value:0},
    invVP:{value:new THREE.Matrix4()}, shadowMap:{value:null}, shadowMat:{value:new THREE.Matrix4()},
    sunDir:{value:new THREE.Vector3(0,1,0)}, sunCol:{value:new THREE.Color()}, cityGlow:{value:new THREE.Color(0xff4fa3)}, glowC:{value:new THREE.Vector2()},
    cloudOn:{value:1}, raysOn:{value:1}, rayI:{value:1}, rainDark:{value:0},
    sunV:{value:new THREE.Vector3(0,0,1)}, rimI:{value:0}, rimCol:{value:new THREE.Color()}, tLight:{value:null},
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    const float SKY_H = ${SKY_H.toFixed(3)}, SKY_EL = ${SKY_EL.toFixed(3)};
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal;
    uniform vec2 res; uniform float near; uniform float far; uniform float camDist;
    uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 haze;
    uniform vec3 sunV; uniform float rimI; uniform vec3 rimCol; uniform sampler2D tLight;
    uniform float night; uniform float lodLines; uniform float pxK; uniform vec2 starOff; uniform float skyYaw; uniform vec2 rainOff; uniform vec2 glowC; uniform float windR; uniform float outlines; uniform float palOn; uniform float time;
    uniform vec3 pal[${PAL_HEX.length}];
    uniform mat4 invVP; uniform sampler2D shadowMap; uniform mat4 shadowMat;
    uniform mat4 VP; uniform vec3 upView; uniform float wet; uniform float rainOn; uniform sampler2D tCloud;
    uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 cityGlow;
    uniform float cloudOn; uniform float raysOn; uniform float rayI; uniform float rainDark;
    varying vec2 vUv;
    #include <packing>
    // ---- 3D value noise for the cloud volumes ----
    float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float vnoise(vec3 x){
      vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p){ return 0.55*vnoise(p) + 0.3*vnoise(p*2.03) + 0.15*vnoise(p*4.1); }
    // 4x4 ordered dither, for crisp retro banding instead of smooth gradients
    float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
    float bayer(vec2 a){ return b2(0.5*a)*0.25 + b2(a); }
    // is this point in the sun, going by the shadow map?
    float litAt(vec3 p){
      vec4 sc = shadowMat * vec4(p, 1.0); sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
      return step(sc.z - 0.003, unpackRGBAToDepth(texture2D(shadowMap, sc.xy)));
    }
    float rawD(vec2 uv){ return texture2D(tDepth, uv).x; }
    float D(vec2 uv){ return near + rawD(uv)*(far-near); }
    vec3 N(vec2 uv){ return texture2D(tNormal, uv).rgb*2.0-1.0; }
    // arithmetic hash (no sin): the sin trick loses precision on some GPUs and lines the stars up in streaks
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float ne(vec2 o, float d, vec3 n){
      float dd = D(vUv+o) - d; vec3 nn = N(vUv+o);
      float nd = dot(n-nn, vec3(1.0,1.0,1.0));
      float ni = clamp(smoothstep(-0.01, 0.01, nd), 0.0, 1.0);
      float di = clamp(sign(dd*0.25 + 0.01), 0.0, 1.0);
      return (1.0 - dot(n, nn)) * di * ni;
    }
    void main(){
      vec2 px = 1.0/res;
      vec4 c = texture2D(tColor, vUv);
      float rd = rawD(vUv);
      vec3 col;
      if (rd >= 0.99999){
        vec3 sky = mix(skyBot, skyTop, smoothstep(0.05, 0.95, vUv.y));
        // The stars are a full 360-degree sky map. The view onto it is a flat strip: heading across, elevation up,
        // both in whole sky pixels, so turning the camera slides the stars straight sideways at an even pace (a
        // perspective view swung them through arcs, which felt wrong next to the flat, orthographic city). It turns
        // with the camera, so each turn looks at another part of the sky. Panning and zooming don't move it.
        vec2 ndc2 = vUv*2.0 - 1.0;
        float pix = 2.0*SKY_H/(res.y*pxK);                       // one base pixel, as an angle
        float az = skyYaw + starOff.x + ndc2.x*(res.x/res.y)*SKY_H, el = SKY_EL + starOff.y + ndc2.y*SKY_H;
        az = floor(az/pix)*pix; el = floor(el/pix)*pix;          // whole pixels, so stars never shimmer while turning
        vec3 sd = vec3(cos(el)*cos(az), sin(el), cos(el)*sin(az));
        float cellA = pix*3.5, nAz = floor(6.2831853/cellA);
        float row = floor(el/cellA), azw = mod(az, 6.2831853), colI = floor(azw/6.2831853*nAz), cw = 6.2831853/nAz;
        vec3 gN = normalize(vec3(.35, .8, .48));
        float band = exp(-pow(dot(sd, gN), 2.0)*30.0);          // the galaxy band
        float hs = hash(vec2(row, colI));
        float star = 0.0;
        if (hs > .955 - band*.06){
          float bright = fract(hs*713.0), big = step(.93, fract(hs*97.0));
          float m0 = big > .5 ? .33 : .2;
          vec2 off = vec2(mix(m0, 1.0 - m0, hash(vec2(colI, row + 31.0))), mix(m0, 1.0 - m0, hash(vec2(row + 7.0, colI))));
          vec2 d = vec2((azw - (colI + off.x)*cw)/pix, (el - (row + off.y)*cellA)/pix);   // in pixels
          float r = length(d);
          star = step(r, big > .5 ? 1.05 : .55)*(.45 + .55*bright)*(big > .5 && r > .55 ? .5 : 1.0);
        }
        float above = smoothstep(-.02, .2, el);
        star *= night*above;
        float haze = band*above*night*.05*(.6 + .4*hash(floor(vec2(az, el)/(pix*2.0))));
        sky += vec3(.55, .5, .8)*floor(haze*40.0 + bayer(gl_FragCoord.xy)*.99)/40.0;   // dithered, so it stays pixel art
        col = sky + vec3(star) + c.rgb;
      } else {
        float d = near + rd*(far-near);
        vec3 n = N(vUv);
        float dd = 0.0;
        dd += clamp(D(vUv+vec2(px.x,0.0)) - d, 0.0, 1.0);
        dd += clamp(D(vUv-vec2(px.x,0.0)) - d, 0.0, 1.0);
        dd += clamp(D(vUv+vec2(0.0,px.y)) - d, 0.0, 1.0);
        dd += clamp(D(vUv-vec2(0.0,px.y)) - d, 0.0, 1.0);
        float dei = floor(smoothstep(0.25, 0.55, dd)*2.0)/2.0;
        float nei = ne(vec2(px.x,0.0), d, n) + ne(vec2(-px.x,0.0), d, n) + ne(vec2(0.0,px.y), d, n) + ne(vec2(0.0,-px.y), d, n);
        nei = step(0.1, nei);
        // zoomed out: crease lines inside shapes fade away and silhouettes soften, so the city doesn't turn to noise
        float k = dei > 0.0 ? 1.0 - 0.5*dei*(1.0 - 0.5*lodLines) : 1.0 + 0.4*nei*(1.0 - lodLines);
        col = c.rgb * mix(1.0, k, outlines);
        // Rim light: where an edge faces the sun with open space (or something far behind) beyond it, the edge
        // catches the light: a crisp warm line a pixel or two wide, and a soft warm wash on faces turned to the sun.
        // Only where the shadow map says the sun really reaches. Strongest at golden hour; cool moonlight at night.
        // light from the city's own lamps, neon and windows falling on the surfaces round them (the night-light
        // pass, below): tinted by each surface's colour, with a little added so dark walls still pick it up; stepped
        // and dithered so it stays pixel art
        { vec3 lt = texture2D(tLight, vUv).rgb;
          lt = floor(lt*14.0 + bayer(gl_FragCoord.xy)*.99)/14.0;
          col += lt*(c.rgb*1.25 + .05); }
        if (rimI > 0.01){
          vec2 sd2 = sunV.xy; float sl = length(sd2);
          if (sl > 0.05){
            sd2 /= sl;
            float gap = max(D(vUv + sd2*px*1.5) - d, D(vUv + sd2*px*2.5) - d);
            float edge = step(0.8, gap)*step(-0.25, dot(n, sunV));
            vec4 pw = invVP*vec4(vUv*2.0 - 1.0, rd*2.0 - 1.0, 1.0); pw /= pw.w;
            float lit = litAt(pw.xyz);
            float face = max(dot(n, sunV), 0.0);
            col += rimCol*rimI*lit*(edge*0.45 + face*face*0.22);   // a gentle edge line, not a glowing outline
          }
        }
        col = mix(col, haze, 0.35*smoothstep(camDist + 5.5, camDist + 53.0, d));   // the far side of the island fades into haze
      }
      // ---- rays through the scene for clouds and light shafts ----
      vec2 ndc = vUv*2.0 - 1.0;
      vec4 pn = invVP * vec4(ndc, -1.0, 1.0); pn /= pn.w;
      vec4 pf = invVP * vec4(ndc, rd*2.0 - 1.0, 1.0); pf /= pf.w;
      vec3 ro = pn.xyz, seg = pf.xyz - pn.xyz;
      float tEnd = length(seg); vec3 rdir = seg / tEnd;
      float dith = bayer(gl_FragCoord.xy);
      float DK = 95.0/(far - near);   // depth tolerances below were set for a 95-unit depth range
      // ---- wet ground: bright lights (neon, windows, lamps) leave vertical streaks on wet pavement ----
      // Not a mirror: dull walls barely show, and only crisp puddle patches reflect clearly. No ripples or jitter.
      if (rd < 0.99999 && wet > 0.0 && dot(N(vUv), upView) > 0.93){
        vec3 wp = ro + rdir*tEnd;
        float pud = step(0.6, fbm(vec3(floor(wp.xz*6.0)/6.0*0.8, 0.0)));        // crisp-edged puddle patches
        pud *= 0.35 + 0.65*rainOn;
        vec3 rr = reflect(rdir, vec3(0.0, 1.0, 0.0));
        vec3 hitCol = vec3(0.0); float hit = 0.0, t = 0.03; vec2 huv = vec2(0.0);
        for (int i=0; i<22; i++){
          t += 0.05 + t*0.14;
          vec3 q = wp + rr*t;
          vec4 cp = VP * vec4(q, 1.0); cp.xyz /= cp.w;
          vec2 uv = cp.xy*0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float sd = texture2D(tDepth, uv).x, qd = cp.z*0.5 + 0.5;
          if (qd > sd + 0.0003*DK && qd - sd < 0.015*DK){ huv = uv; hit = 1.0; break; }
        }
        if (hit > 0.5){
          // smear the reflection downward a few pixels: the streaky look of lights on wet asphalt
          vec2 st = vec2(0.0, -1.0/res.y);
          hitCol = texture2D(tColor, huv).rgb*0.4 + texture2D(tColor, huv+st*2.0).rgb*0.3 + texture2D(tColor, huv+st*4.0).rgb*0.2 + texture2D(tColor, huv+st*6.0).rgb*0.1;
          float lum = dot(hitCol, vec3(0.3, 0.59, 0.11));
          float bright = smoothstep(0.35, 0.95, lum);                       // only lights really reflect
          float k = wet * mix(bright*0.9, 0.7, pud);                         // puddles reflect everything, pavement only the lights
          k = floor(k*5.0 + 0.5)/5.0;                                        // stepped, to stay pixel art
          col = mix(col, max(col, hitCol*0.9), clamp(k, 0.0, 0.8));
        } else if (pud > 0.0){
          col = mix(col, mix(skyBot, skyTop, 0.5)*0.7, 0.35*pud*wet*2.0);   // puddles show the sky when nothing is above
        }
      }
      if (cloudOn > 0.5){
        // clouds come from their own lower-resolution pass (see cloudMat), upscaled with crisp pixels
        vec4 cl = texture2D(tCloud, vUv);
        if (cl.a > 0.001){ float q = floor(cl.a*5.0 + dith)/5.0; col = mix(col, cl.rgb/cl.a, q); }   // dithered fade at the edges, like mist
      }
      if (raysOn > 0.5 && rayI > 0.01){
        // light shafts: haze near the island lit wherever the shadow map says the sun gets through
        float t0 = max(0.0, (12.0 - ro.y)/min(rdir.y, -0.001)), t1 = min(tEnd, (-0.5 - ro.y)/min(rdir.y, -0.001));
        if (t1 > t0){
          const int RSTEPS = 12;
          float dt = (t1 - t0)/float(RSTEPS), acc = 0.0;
          for (int i=0; i<RSTEPS; i++){
            vec3 p = ro + rdir*(t0 + (float(i) + dith)*dt);
            float hz = smoothstep(-0.5, 1.0, p.y) * exp(-p.y/4.0) * smoothstep(13.0, 7.0, length(p.xz - glowC));
            acc += litAt(p) * hz * dt;
          }
          float shafts = acc * 0.016 * rayI;   // (12 dithered steps look the same as 20 at this resolution)
          shafts = floor(shafts*10.0 + dith)/10.0;                  // stepped, so the beams read as pixel art
          col += sunCol * shafts;
        }
      }
      // ---- rain: pixel streaks in three depth layers ----
      // Each layer sits at a depth: buildings in front of it hide its drops, so rain falls between and behind
      // things instead of lying on the screen. Layers are tied to the world (they slide with the view when it pans
      // or turns, nearer layers more), fall along one slant, and splash on wet ground.
      if (rainOn > 0.5){
        vec3 rc = mix(vec3(0.72, 0.8, 0.92), vec3(0.45, 0.55, 0.78), night);
        for (int L=0; L<3; L++){
          float fl = float(L);
          float layerD = camDist - 15.4 + fl*16.15;                        // near, middle, far (units from the camera)
          if (near + rd*(far - near) < layerD) continue;                   // something is in front of this layer
          vec2 p = (gl_FragCoord.xy + rainOff*(1.25 - fl*0.25))*pxK + vec2(fl*311.0, fl*97.0);   // base pixels, like the stars
          p.x += p.y*(0.03 + windR*0.2);                                   // the slant: near straight down when calm, raking in a storm
          float colm = floor(p.x);
          float speed = (330.0 - fl*90.0)*(0.9 + windR*0.12), len = (6.0 - fl*1.7)*(0.9 + windR*0.15), spacing = 70.0 + fl*25.0;
          float y = p.y + time*speed + hash(vec2(colm, fl*13.0))*500.0;
          float seg = floor(y/spacing), pos = mod(y, spacing);
          float on = step(hash(vec2(colm, seg + fl*71.0)), 0.16 - fl*0.03) * step(pos, len);
          col = mix(col, rc, on*(0.42 - fl*0.1));
        }
        // splashes: single pixels that flash on up-facing surfaces, fixed to the ground so they don't swim
        if (rd < 0.99999 && dot(N(vUv), upView) > 0.9){
          vec3 wp = ro + rdir*tEnd;
          vec2 sc = floor(wp.xz*7.0);
          float ph = fract(time*1.7 + hash(sc)*7.0);
          float sp = step(hash(sc + 19.0), 0.22) * step(ph, 0.07) * step(0.5, hash(floor(wp.xz*14.0)));
          col = mix(col, rc*1.15, sp*0.6);
        }
      }
      if (palOn > 0.5){
        vec3 best = pal[0]; float bd = 1e9;
        for (int i=0; i<${PAL_HEX.length}; i++){ vec3 df = col - pal[i]; float dist = dot(df*df, vec3(0.3,0.59,0.11)); if (dist < bd){ bd = dist; best = pal[i]; } }
        col = best;
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest:false, depthWrite:false,
});
const compScene = new THREE.Scene(), compCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), comp));


/* ---------- clouds: shapes baked once into a texture, then marched cheaply at lower resolution ---------- */
// Building the puff clusters and noise every step of every pixel every frame was the expensive part.
// Now a single GPU pass at load time writes the whole cloud field into a tiling texture (32 height slices of
// 128x128 laid out 8 by 4), and each march step is one texture read. The field wraps every 80 units, so the
// drift is just sliding the lookup. The march then runs at half (or third) resolution and is upscaled crisply.
const CLOUD_NOISE = `
  float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
  float bayer(vec2 a){ return b2(0.5*a)*0.25 + b2(a); }
`;
const cloudBakeMat = new THREE.ShaderMaterial({
  uniforms: { mode:{value:0} },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: CLOUD_NOISE + `
    uniform float mode;
    // lattice noise that wraps every 'per' units in x and z, so the baked field tiles seamlessly
    float h3p(vec3 i, float per){ i.xz = mod(i.xz, per); return h3(i); }
    float vnP(vec3 x, float per){
      vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h3p(i,per), h3p(i+vec3(1,0,0),per), f.x), mix(h3p(i+vec3(0,1,0),per), h3p(i+vec3(1,1,0),per), f.x), f.y),
                 mix(mix(h3p(i+vec3(0,0,1),per), h3p(i+vec3(1,0,1),per), f.x), mix(h3p(i+vec3(0,1,1),per), h3p(i+vec3(1,1,1),per), f.x), f.y), f.z);
    }
    float fbmP(vec3 p, float per){ return 0.55*vnP(p,per) + 0.3*vnP(p*2.0,per*2.0) + 0.15*vnP(p*4.0,per*4.0); }
    float chash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    // Cumulus: clusters of round puffs on flat bases, on a grid with empty cells for gaps. Negative = outside.
    float puffP(vec3 p, float cs, float baseY, float rMin, float rMax, float seedK, float gap, inout vec3 nrm){
      float P = 80.0/cs;
      vec2 c = floor(p.xz/cs);
      float f = -1.0;
      for (int j=-1; j<=1; j++) for (int i=-1; i<=1; i++){
        vec2 cc = c + vec2(float(i), float(j)), cw = mod(cc, P);
        if (chash(cw + seedK) < gap) continue;
        vec2 ctr = (cc + 0.2 + 0.6*vec2(chash(cw + 1.3 + seedK), chash(cw + 7.1 + seedK)))*cs;
        float hs = chash(cw + 3.7 + seedK);
        float size = hs < 0.55 ? mix(0.4, 0.65, hs/0.55) : mix(0.85, 1.25, (hs-0.55)/0.45);
        for (int k=0; k<6; k++){
          float fk = float(k);
          float rr = mix(rMin, rMax, chash(cw*1.7 + fk*3.1 + seedK)) * size * (k == 0 ? 1.0 : mix(0.45, 0.8, chash(cw + fk*2.3 + seedK)));
          vec3 sc = vec3(ctr.x + (chash(cw + fk*5.3 + seedK) - 0.5)*cs*0.7*size,
                         baseY + rr*0.45 + (k == 0 ? rr*0.4 : chash(cw + fk*4.1 + seedK)*rr*0.35),
                         ctr.y + (chash(cw + fk*9.7 + seedK) - 0.5)*cs*0.7*size);
          vec3 dv = p - sc; dv.y *= 1.25;
          float dd = 1.0 - length(dv)/rr;
          if (dd > f){ f = dd; nrm = dv/rr; }
        }
      }
      return f - (1.0 - smoothstep(baseY, baseY + 0.6, p.y));
    }
    void main(){
      vec2 fc = gl_FragCoord.xy;
      float slice = floor(fc.y/128.0)*8.0 + floor(fc.x/128.0);
      vec2 uv = mod(fc, 128.0)/128.0;
      vec3 p = vec3(-40.0 + uv.x*80.0, -16.0 + (slice + 0.5)/32.0*16.0, -40.0 + uv.y*80.0);
      vec3 n1 = vec3(0.0,1.0,0.0), n2 = n1; float a, c;
      if (mode < 0.5){ a = puffP(p, 4.0, -13.5, 0.9, 1.7, 0.0, 0.78, n1); c = puffP(p, 16.0, -15.0, 3.0, 4.6, 41.0, 0.62, n2); }   // under the island
      else           { a = puffP(p, 5.0, -10.0, 1.2, 2.3, 17.0, 0.78, n1); c = puffP(p, 20.0, -12.0, 3.8, 6.2, 63.0, 0.55, n2); }   // round the edge
      float f = a; vec3 n = n1; if (c > f){ f = c; n = n2; }
      f += (fbmP(p*0.45, 36.0) - 0.5)*0.75;                 // frayed, wispy edges
      gl_FragColor = vec4(clamp(f*0.5 + 0.5, 0.0, 1.0), normalize(n + vec3(0.0,1e-4,0.0))*0.5 + 0.5);
    }`,
  depthTest:false, depthWrite:false,
});
const cloudAtlas = [0,1].map(() => new THREE.WebGLRenderTarget(1024, 512, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, generateMipmaps:false }));
const bakeScene = new THREE.Scene(); bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), cloudBakeMat));
function bakeClouds(){
  for (let m=0; m<2; m++){ cloudBakeMat.uniforms.mode.value = m; renderer.setRenderTarget(cloudAtlas[m]); renderer.render(bakeScene, compCam); }
  renderer.setRenderTarget(null);
}
const cloudMat = new THREE.ShaderMaterial({
  uniforms: {
    tDepth:{value:null}, invVP:comp.uniforms.invVP, time:comp.uniforms.time, cloudOff:{value:new THREE.Vector2()}, texSea:{value:cloudAtlas[0].texture}, texRing:{value:cloudAtlas[1].texture},
    sunDir:comp.uniforms.sunDir, sunCol:comp.uniforms.sunCol, skyTop:comp.uniforms.skyTop, skyBot:comp.uniforms.skyBot,
    night:comp.uniforms.night, cityGlow:comp.uniforms.cityGlow, glowC:comp.uniforms.glowC, rainDark:comp.uniforms.rainDark,
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: CLOUD_NOISE + `
    uniform sampler2D tDepth; uniform mat4 invVP; uniform float time; uniform vec2 cloudOff;
    uniform sampler2D texSea; uniform sampler2D texRing;
    uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 cityGlow; uniform vec2 glowC;
    uniform float night; uniform float rainDark;
    varying vec2 vUv;
    vec2 tileUV(float s, vec2 xz){ vec2 inner = clamp(xz, 0.5/128.0, 1.0 - 0.5/128.0); return (vec2(mod(s, 8.0), floor(s/8.0)) + inner)/vec2(8.0, 4.0); }
    vec4 atl(sampler2D t, vec3 q){
      vec2 xz = fract((q.xz + 40.0)/80.0);
      float sl = clamp((q.y + 16.0)/16.0*32.0 - 0.5, 0.0, 30.999), s0 = floor(sl);
      return mix(texture2D(t, tileUV(s0, xz)), texture2D(t, tileUV(s0 + 1.0, xz)), sl - s0);
    }
    void main(){
      float rd = texture2D(tDepth, vUv).x;
      vec2 ndc = vUv*2.0 - 1.0;
      vec4 pn = invVP * vec4(ndc, -1.0, 1.0); pn /= pn.w;
      vec4 pf = invVP * vec4(ndc, rd*2.0 - 1.0, 1.0); pf /= pf.w;
      vec3 ro = pn.xyz, seg = pf.xyz - pn.xyz; float tEnd = length(seg); vec3 rdir = seg/tEnd;
      float dith = bayer(gl_FragCoord.xy);
      vec3 acc = vec3(0.0); float T = 1.0;
      if (rdir.y < -0.01){
        float t0 = max(0.0, (-0.5 - ro.y)/rdir.y), t1 = min(tEnd, (-15.5 - ro.y)/rdir.y);
        if (t1 > t0){
          const int STEPS = 22;
          float dt = (t1 - t0)/float(STEPS);
          vec3 shade = mix(skyBot, skyTop, 0.35)*0.55*(1.0 - 0.35*rainDark);
          vec3 litC = sunCol*1.05 + skyTop*0.25;
          vec3 drift = vec3(cloudOff.x, 0.0, cloudOff.y);
          for (int i=0; i<STEPS; i++){
            vec3 p = ro + rdir*(t0 + (float(i) + dith)*dt), q = p + drift;
            float f = -1.0; vec3 n = vec3(0.0,1.0,0.0);
            if (p.y < -6.0){ vec4 sa = atl(texSea, q); f = sa.r*2.0 - 1.0; n = sa.gba*2.0 - 1.0; }
            float r = length(p.xz);
            if (r > 14.0){ vec4 sb = atl(texRing, q); float f2 = sb.r*2.0 - 1.0 - (1.0 - smoothstep(15.0, 19.0, r))*2.0; if (f2 > f){ f = f2; n = sb.gba*2.0 - 1.0; } }
            float mist = p.y < -10.0 ? clamp((vnoise(q*0.07) - 0.55)*2.2, 0.0, 1.0) * smoothstep(-16.0, -13.5, p.y) * smoothstep(-10.0, -12.0, p.y) * 0.25 : 0.0;
            float dens = mist;
            if (f > -0.15){ f += (vnoise(q*2.4) - 0.5)*0.18; dens = max(mist, smoothstep(0.0, 0.32, f)); }
            if (dens > 0.001){
              float light = clamp(dot(normalize(n), sunDir)*0.45 + 0.5 - (1.0 - dens)*0.1, 0.0, 1.0);
              light = floor(light*3.0 + dith*0.6)/3.0;                     // three crisp shading bands
              vec3 cc = mix(shade, litC, light);
              cc += cityGlow * night * 0.55 * exp(-length(p.xz - glowC)/9.0) * smoothstep(-11.0, -6.0, p.y);   // neon glow on the undersides
              float a = clamp(dens*dt*0.8, 0.0, 1.0);
              acc += T*a*cc; T *= 1.0 - a;
              if (T < 0.02) break;
            }
          }
        }
      }
      gl_FragColor = vec4(acc, 1.0 - T);
    }`,
  depthTest:false, depthWrite:false,
});
const cloudScene = new THREE.Scene(); cloudScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), cloudMat));
let rtCloud = null;

let rtC = null, rtN = null, W = 480, H = 270;
function makeTargets(){
  if (rtC){ rtC.depthTexture.dispose(); rtC.dispose(); rtN.dispose(); }
  const opt = { minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, format:THREE.RGBAFormat };
  rtC = new THREE.WebGLRenderTarget(W,H,opt);
  rtC.depthTexture = new THREE.DepthTexture(W,H); rtC.depthTexture.type = THREE.UnsignedIntType;
  rtC.depthTexture.minFilter = rtC.depthTexture.magFilter = THREE.NearestFilter;
  rtN = new THREE.WebGLRenderTarget(W,H,opt);
  comp.uniforms.tColor.value = rtC.texture; comp.uniforms.tDepth.value = rtC.depthTexture; comp.uniforms.tNormal.value = rtN.texture;
  comp.uniforms.res.value.set(W,H);
  if (rtCloud) rtCloud.dispose();
  const q = S.cloudQ || 2;
  rtCloud = new THREE.WebGLRenderTarget(Math.ceil(W/q), Math.ceil(H/q), opt);
  comp.uniforms.tCloud.value = rtCloud.texture; cloudMat.uniforms.tDepth.value = rtC.depthTexture;
  if (rtOut) rtOut.dispose();
  rtOut = new THREE.WebGLRenderTarget(W, H, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });
  makeGlowTargets(); makeLightTarget();
  upMat.uniforms.t.value = rtFinal.texture; upMat.uniforms.srcRes.value.set(W, H); upMat.uniforms.dstRes.value.set(DW, DH);
}
/* ---------- bloom and halation ---------- */
// After the composite, the bright, saturated light in the frame (neon, lit windows, lamps, glints) is pulled out into
// a quarter-size image and blurred: bloom. A further blur at an eighth of the size, tinted warm red, gives halation,
// the soft fringe film shows round bright lights. Both are added back at the game's own resolution, stepped and
// dithered so the glow stays pixel art, before the frame is scaled to the screen. White walls in the sun don't bloom:
// the brightness that counts is weighted by colour. Stronger at night. Costs: a handful of passes over images of at
// most a quarter of 480p.
const GLOW_FX = { night: comp.uniforms.night };
const fsVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const glowPick = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, texel: { value: new THREE.Vector2() }, night: GLOW_FX.night },
  vertexShader: fsVert,
  fragmentShader: `uniform sampler2D t; uniform vec2 texel; uniform float night; varying vec2 vUv;
    vec3 pickC(vec2 uv){
      vec3 c = texture2D(t, uv).rgb;
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0.0 ? (mx - mn)/mx : 0.0;
      float yel = smoothstep(.2, .38, (min(c.r, c.g) - c.b)/max(mx, .001));   // warm yellow window light (not white, not beige walls)
      float key = mx*(.45 + .55*max(sat, .95*yel));                  // coloured light counts, white surfaces much less
      float th = mix(.8, .5, night);                                // by day only the brightest lights bloom
      return c*smoothstep(th, th + .25, key)*(1.0 + .7*yel);         // and the windows glow a little stronger
    }
    void main(){   // a 4x4 average with four bilinear taps
      vec3 a = pickC(vUv + texel*vec2(-1.0, -1.0)) + pickC(vUv + texel*vec2(1.0, -1.0)) + pickC(vUv + texel*vec2(-1.0, 1.0)) + pickC(vUv + texel*vec2(1.0, 1.0));
      gl_FragColor = vec4(a*.25, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const glowBlur = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: fsVert,
  fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
    void main(){   // 9 taps folded into 5 bilinear reads
      vec3 c = texture2D(t, vUv).rgb*.227;
      c += (texture2D(t, vUv + dir*1.385).rgb + texture2D(t, vUv - dir*1.385).rgb)*.316;
      c += (texture2D(t, vUv + dir*3.231).rgb + texture2D(t, vUv - dir*3.231).rgb)*.07;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const glowCopy = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: fsVert,
  fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }', depthTest: false, depthWrite: false });
const glowMix = new THREE.ShaderMaterial({
  uniforms: { t: { value: null }, tB: { value: null }, tH: { value: null }, night: GLOW_FX.night, on: { value: 1 },
              lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, con: { value: 1 } },
  vertexShader: fsVert,
  fragmentShader: `uniform sampler2D t; uniform sampler2D tB; uniform sampler2D tH; uniform float night; uniform float on; varying vec2 vUv;
    uniform vec3 lift; uniform vec3 gain; uniform float sat; uniform float con;
    float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }
    float bayer(vec2 a){ return b2(0.5*a)*0.25 + b2(a); }
    void main(){
      vec3 c = texture2D(t, vUv).rgb;
      vec3 b = texture2D(tB, vUv).rgb, h = texture2D(tH, vUv).rgb;
      float k = mix(.6, 1.7, night);
      vec3 add = b*k + h*vec3(1.0, .42, .3)*mix(.3, 1.0, night);   // bloom, and a warm red halation round it
      add = floor(add*20.0 + bayer(gl_FragCoord.xy)*.99)/20.0;       // stepped and dithered: pixel art, not a smooth haze
      c += add*on*(1.0 - .85*c);                                      // screen-like: bright pixels (a lit hotel facade) don't blow out to white
      // colour grading for the time of day: tinted shadows (lift), tinted highlights (gain), saturation, contrast
      c = c*gain + lift*(1.0 - c);
      float l = dot(c, vec3(.299, .587, .114));
      c = mix(vec3(l), c, sat);
      c = (c - .5)*con + .5;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const glowScene = new THREE.Scene(), glowQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowCopy); glowScene.add(glowQuad);
let rtFinal = null, rtB = [], rtHal = [];
function makeGlowTargets(){
  for (const r of [rtFinal, ...rtB, ...rtHal]) if (r) r.dispose();
  const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false };
  rtFinal = new THREE.WebGLRenderTarget(W, H, lin);
  const qw = Math.max(1, Math.ceil(W/4)), qh = Math.max(1, Math.ceil(H/4)), ew = Math.max(1, Math.ceil(W/8)), eh = Math.max(1, Math.ceil(H/8));
  rtB = [0, 1].map(() => new THREE.WebGLRenderTarget(qw, qh, lin));
  rtHal = [0, 1].map(() => new THREE.WebGLRenderTarget(ew, eh, lin));
}
function glowPass(mat, target){ glowQuad.material = mat; renderer.setRenderTarget(target); renderer.render(glowScene, compCam); }
// run after the composite has been drawn into rtOut; leaves the finished frame in rtFinal
function renderGlow(){
  glowMix.uniforms.on.value = S.bloom ? 1 : 0;
  if (!S.bloom){ glowMix.uniforms.t.value = rtOut.texture; glowMix.uniforms.tB.value = rtB[0].texture; glowMix.uniforms.tH.value = rtHal[0].texture; glowPass(glowMix, rtFinal); return; }   // no bloom, but still graded
  const [b0, b1] = rtB, [h0, h1] = rtHal;
  glowPick.uniforms.t.value = rtOut.texture; glowPick.uniforms.texel.value.set(1/W, 1/H); glowPass(glowPick, b0);
  glowBlur.uniforms.t.value = b0.texture; glowBlur.uniforms.dir.value.set(1/b0.width, 0); glowPass(glowBlur, b1);
  glowBlur.uniforms.t.value = b1.texture; glowBlur.uniforms.dir.value.set(0, 1/b0.height); glowPass(glowBlur, b0);
  glowCopy.uniforms.t.value = b0.texture; glowPass(glowCopy, h0);   // halation: the bloom, smaller and blurred twice as wide
  glowBlur.uniforms.t.value = h0.texture; glowBlur.uniforms.dir.value.set(2/h0.width, 0); glowPass(glowBlur, h1);
  glowBlur.uniforms.t.value = h1.texture; glowBlur.uniforms.dir.value.set(0, 2/h0.height); glowPass(glowBlur, h0);
  glowMix.uniforms.t.value = rtOut.texture; glowMix.uniforms.tB.value = b0.texture; glowMix.uniforms.tH.value = h0.texture;
  glowPass(glowMix, rtFinal);
}
/* ---------- night lights: light from the city's lamps falling on the surfaces round them ---------- */
// Every glow point (lamps, neon, windows, signs, beacons) is also a small light. In one pass at half the game's
// resolution each is drawn as a square on screen big enough for its reach; for every pixel inside, the surface there
// is rebuilt from the depth image, and if it's within reach it's lit with a soft falloff, more where it faces the
// light (from the normal image). Lights accumulate additively and the composite adds the result. The cost depends on
// how much of the screen the light pools cover, not on how many lights there are. A light just off screen still lights
// what's on screen: its square is pulled to the screen's edge (never further from any lit pixel than its centre was).
// Flicker, blinking beacons and dark streets come with the glow points. Only after dusk.
const NL_UNI = { scale: { value: 10 }, time: FOL_UNI.time, res: { value: new THREE.Vector2(1, 1) }, invVP: comp.uniforms.invVP,
                 tDepth: { value: null }, tNormal: { value: null }, lightI: { value: 0 } };
const nightLightMat = new THREE.ShaderMaterial({
  uniforms: NL_UNI,
  vertexShader: `attribute float size; attribute vec4 aCol; attribute float aFlk; uniform float scale; uniform float time;
    varying vec3 vL; varying vec3 vC; varying float vR;` + FLK_GLSL + BLINK_GLSL + `
    void main(){
      vec4 w = modelMatrix*vec4(position, 1.0); vL = w.xyz;
      float R = clamp(size*1.25, .7, 3.4); vR = R;
      float op = aCol.a < -1.5 ? mix(.05, 1.0, blink(w.y, time)) : 1.0;
      vC = aCol.rgb*op*flicker(aFlk, time);
      vec4 cp = projectionMatrix*viewMatrix*w; cp.xyz /= cp.w;
      gl_Position = vec4(clamp(cp.xy, -1.0, 1.0), 0.0, 1.0);   // pulled onto the screen if it's just off it
      gl_PointSize = 2.0*R*scale;
    }`,
  fragmentShader: `uniform sampler2D tDepth; uniform sampler2D tNormal; uniform vec2 res; uniform mat4 invVP; uniform float lightI;
    varying vec3 vL; varying vec3 vC; varying float vR;
    void main(){
      vec2 uv = gl_FragCoord.xy/res;
      float rd = texture2D(tDepth, uv).x; if (rd >= 0.99999) discard;   // sky
      vec4 p = invVP*vec4(uv*2.0 - 1.0, rd*2.0 - 1.0, 1.0); p /= p.w;
      vec3 d = vL - p.xyz; float dist = length(d); if (dist > vR) discard;
      float f = 1.0 - dist/vR; f *= f;
      vec3 n = texture2D(tNormal, uv).rgb*2.0 - 1.0;
      vec3 lv = normalize(mat3(viewMatrix)*d + vec3(0.0, 0.0, 1e-4));
      float ndl = .3 + .7*max(dot(n, lv), 0.0);
      gl_FragColor = vec4(vC*f*ndl*lightI, 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
});
let rtLight = null;
function makeLightTarget(){
  if (rtLight) rtLight.dispose();
  rtLight = new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(W/2)), Math.max(1, Math.ceil(H/2)), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false });
  comp.uniforms.tLight.value = rtLight.texture;
  NL_UNI.res.value.set(rtLight.width, rtLight.height);
}
// after the colour and normal passes; fills rtLight for the composite
function renderNightLights(night){
  const I = S.lights === false ? 0 : Math.max(0, Math.min(1, (night - .15)/.6))*.72;
  NL_UNI.lightI.value = I;
  renderer.setRenderTarget(rtLight); renderer.setClearColor(0x000000, 1); renderer.clear(true, false, false);
  if (I <= 0) return;
  NL_UNI.tDepth.value = rtC.depthTexture; NL_UNI.tNormal.value = rtN.texture;
  NL_UNI.scale.value = rtLight.height/(2*zoom);
  scene.overrideMaterial = nightLightMat; cam.layers.set(4);
  renderer.render(scene, cam);
  scene.overrideMaterial = null;
}
// The finished frame is scaled to the screen with "sharp bilinear" filtering: every render pixel stays a crisp
// square, and where the scale isn't a whole number only the one-screen-pixel seam between two render pixels is
// blended. So pixels are all the same size (no ripple when things move) at any zoom.
let rtOut = null;
const upMat = new THREE.ShaderMaterial({
  uniforms: { t:{ value:null }, srcRes:{ value:new THREE.Vector2(1,1) }, dstRes:{ value:new THREE.Vector2(1,1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D t; uniform vec2 srcRes; uniform vec2 dstRes; varying vec2 vUv;
    void main(){
      vec2 texel = vUv*srcRes, base = floor(texel), s = texel - base;
      float scale = max(1.0, dstRes.y/srcRes.y);
      float range = 0.5 - 0.5/scale;
      vec2 cd = s - 0.5;
      vec2 f = (cd - clamp(cd, -range, range))*scale + 0.5;
      gl_FragColor = texture2D(t, (base + f)/srcRes);
    }`,
  depthTest:false, depthWrite:false,
});
const upScene = new THREE.Scene(); upScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), upMat));
// Render resolution. At the default zoom and closer the game is drawn at about 480 lines, each render pixel a
// whole number of screen pixels. Zooming out, it is drawn at more lines in step with the zoom, so every building
// keeps the same pixels and the pixels themselves get smaller on screen, up to the screen's own resolution.
// (Past that, the detail levels in main.js take over.) Stars and rain are measured in base pixels (pxK) so they
// keep their size.
const ZOOM_REF = 13.2;
let DW = 1, DH = 1, BASE_H = 270, pxK = 1;
function resize(){
  const dpr = devicePixelRatio || 1;
  DW = Math.max(1, Math.round(innerWidth*dpr)); DH = Math.max(1, Math.round(innerHeight*dpr));
  BASE_H = Math.ceil(DH / Math.max(1, Math.round(DH / 480)));
  renderer.setSize(DW, DH, false);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  H = 0; applyRenderRes(zoom);
}
function applyRenderRes(z){
  const f = Math.max(1, z/ZOOM_REF), step = Math.round(Math.log(f)/Math.log(1.04));   // 4% steps, so targets aren't remade every frame
  const h = Math.min(DH, Math.round(BASE_H*Math.pow(1.04, step)));
  if (h === H) return;
  H = h; W = Math.max(1, Math.round(h*DW/DH)); pxK = BASE_H/H;
  FOL_UNI.res.value.set(W, H); comp.uniforms.pxK.value = pxK;
  makeTargets();
}
addEventListener('resize', resize);
