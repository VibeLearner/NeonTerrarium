// Walk mode: the per-object detail, drawn in the fragment shader. Every piece of the city knows where each pixel sits
// on its own face (a box's front, a crate's side, a window's pane) and how big that face is in the world, so detail is
// placed by what the thing is: fan grilles and louvres on AC units, framed panes with real rooms behind them, planks and
// nails on crates, slats on shutters, bevels and worn edges on everything, drips under ledges, dirt at the foot of walls.
'use strict';
const DETAIL_GLSL = /* glsl */`
  float h21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x*p.y); }
  float h31(vec3 p){ return h21(p.xy + p.z*17.13); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm2(vec2 p){ return vn(p)*.55 + vn(p*2.07 + 3.1)*.3 + vn(p*4.3 + 7.7)*.15; }

  // the face of a box this pixel is on: uv in world units from the face's corner, the face's size, which axis, which way
  struct Face { vec2 w; vec2 dim; int ax; float sg; float ed; float edV; float edB; float edT; };
  Face faceOf(vec3 lp, vec3 sz){
    Face F; vec3 a = abs(lp);
    if (a.x >= a.y && a.x >= a.z){ F.ax = 0; F.w = (vec2(lp.z, lp.y) + .5)*vec2(sz.z, sz.y); F.dim = vec2(sz.z, sz.y); F.sg = sign(lp.x); }
    else if (a.z >= a.y){ F.ax = 2; F.w = (vec2(lp.x, lp.y) + .5)*vec2(sz.x, sz.y); F.dim = vec2(sz.x, sz.y); F.sg = sign(lp.z); }
    else { F.ax = 1; F.w = (vec2(lp.x, lp.z) + .5)*vec2(sz.x, sz.z); F.dim = vec2(sz.x, sz.z); F.sg = sign(lp.y); }
    F.edV = min(F.w.x, F.dim.x - F.w.x); F.edB = F.w.y; F.edT = F.dim.y - F.w.y; F.ed = min(F.edV, min(F.edB, F.edT));
    return F;
  }
  // a crisp bevel: the top and left rims catch light, the others go dark, the corners wear through
  vec3 bevel(vec3 c, Face F, float px, float wearK){
    float e = F.ed;
    if (e < px*1.6){ bool lit = (F.edT < px*1.6) || (F.w.x < px*1.6 && F.edT > px*1.6); c *= lit ? 1.3 : .66; }
    else if (e < px*3.2 && h21(floor(F.w/px)) < wearK) c = mix(c, vec3(.62, .6, .58), .55);    // chipped back to the bare stuff
    return c;
  }
  // a lit room seen through a window: the ray goes into a box behind the glass; walls, floor and ceiling
  // each get their own shade, and the back wall gets furniture
  vec3 room(vec2 p, vec2 dim, vec3 vt, float seed, out float lightK){
    float D = max(.18, dim.x*.6);
    vec3 d = -vt; d.z = min(d.z, -.05);
    float tx = d.x > 0. ? (dim.x - p.x)/d.x : (0. - p.x)/min(d.x, -1e-4);
    float ty = d.y > 0. ? (dim.y - p.y)/d.y : (0. - p.y)/min(d.y, -1e-4);
    float tz = -D/d.z; float t = min(tx, min(ty, tz)); vec3 hp = vec3(p, 0.) + d*t;
    vec3 pal[4]; pal[0] = vec3(1., .78, .5); pal[1] = vec3(.55, .78, 1.); pal[2] = vec3(1., .55, .78); pal[3] = vec3(.95, .9, .7);
    vec3 wall = pal[int(seed*3.99)]; vec3 c; lightK = 1.;
    if (t == tz){ c = wall*.95;                                                                  // back wall
      vec2 q = hp.xy/dim;
      if (seed > .5 && q.y < .45 && q.x > .2 && q.x < .75) c *= .45;                             // a sofa or a desk
      if (q.y > .55 && q.y < .8 && abs(q.x - fract(seed*7.)*.6 - .2) < .08) c = mix(c, vec3(.2, .15, .25), .7);   // a poster
      if (fract(seed*13.) > .6 && q.y > .48 && q.y < .52) c *= .5;                                // a shelf
      if (fract(seed*31.) > .75 && abs(q.x - .5) < .06 && q.y < .62) c *= .25;                    // someone home
    } else if (t == ty){ c = d.y > 0. ? wall*1.15 : wall*vec3(.45, .38, .32); if (d.y > 0. && length(hp.xz - vec2(dim.x*.5, -D*.5)) < .05) c = vec3(1.3, 1.2, 1.); }   // ceiling (and its lamp) or floor
    else c = wall*.7;                                                                            // side walls
    c *= .65 + .35*clamp(1. - t/(D*2.2), 0., 1.);
    // curtains or blinds in front
    vec2 q = p/dim;
    if (seed > .3 && seed < .7 && (q.x < .2 || q.x > .8)){ c = mix(vec3(.7, .3, .35), vec3(.9, .7, .5), fract(seed*5.))*(.75 + .25*sin(q.x*90.)); lightK = .7; }
    else if (seed >= .7 && q.y > .55 && fract(q.y*dim.y/.016) < .4){ c *= .35; }
    return c;
  }
`;
// the class ids the shader switches on
const CLS = { none: 0, plaster: 1, concrete: 2, metal: 3, shutter: 4, corr: 5, rust: 6, brick: 7, wood: 8, crate: 9, card: 10, glass: 11, canvas: 12, organic: 13, paint: 14, interior: 15, glow: 16, cream: 17 };
const DETAIL_MAIN = /* glsl */`
  {
    float PX = uPx;                                       // one screen pixel, in world units
    vec3 nn = normalize(vWNrm); bool flat_ = abs(nn.y) > .85;
    vec3 c = diffuseColor.rgb;
    bool box = vGt > .5 && vGt < 1.5, cyl = vGt > 1.5 && vGt < 2.5 && max(vSz.x, vSz.z) < .7;   // (big round-tagged shapes are walls, not pipes)
    float big = max(vSz.x, max(vSz.y, vSz.z));
    int K = int(uCls + .5);
    vec2 puv = planeUV(vWPos, nn);
    // ---- the surface texture, by position in the world (fine: about one texel per screen pixel)
    // the parallax-shifted texture colour, from the surface pass (sTex, sRoad)
    if (uHasTex > .5) c = sRoad ? sTex*(vWPos.y < .06 ? 1.0 : 1.08) : mix(c*sTex*2.0, sTex*1.2, uMix);
    vec3 cBase = c;
    if (box){
      Face F = faceOf(vLp, vSz);
      bool small = big < 1.0;
      // ---- AC units: a fan grille on the front, louvres on the sides, screws on top
      bool ac = (K == 17 || K == 3) && vSz.x > .17 && vSz.x < .34 && vSz.y > .11 && vSz.y < .24 && vSz.z > .11 && vSz.z < .26;
      if (ac){
        if (F.ax == 2 && F.sg > 0.){
          vec2 cc = vec2(F.dim.x*.6, F.dim.y*.5); float r = F.dim.y*.4, d = length(F.w - cc), an = atan(F.w.y - cc.y, F.w.x - cc.x);
          if (d < r){ c *= fract(d/(PX*2.6)) < .38 ? .32 : .78; if (abs(sin(an*3. + d*30.)) < .22 && d > r*.25) c *= .55; if (d < r*.22) c = vec3(.55, .56, .6)*(d < r*.1 ? .8 : 1.1); }
          else if (d < r + PX*1.5) c *= .45;
          if (F.w.x < F.dim.x*.28 && F.w.y > F.dim.y*.55 && F.w.y < F.dim.y*.8 && F.w.x > PX*3.) c = mix(c, vec3(.92, .9, .8), .7);   // the label
          if (F.w.x < F.dim.x*.28 && F.w.y < F.dim.y*.45 && fract(F.w.y/(PX*3.)) < .35 && F.w.x > PX*3.) c *= .55;                   // vents
        } else if (F.ax == 0){ if (F.ed > PX*3. && fract(F.w.y/(PX*3.)) < .4) c *= .5; }
        else if (F.ax == 1 && F.sg > 0.){ vec2 s = abs(F.w - F.dim*.5) - (F.dim*.5 - PX*3.); if (s.x > -PX*.6 && s.y > -PX*.6 && s.x < PX*.6 && s.y < PX*.6) c *= .4; c *= .92 + .16*vn(F.w*30.); }
        c *= F.ax == 1 ? 1.0 : mix(.82, 1., F.w.y/F.dim.y);
        c = bevel(c, F, PX, .18);
        // a rust stain dripping from the bottom of the front
        if (F.ax == 2 && F.edB < F.dim.y*.3 && vn(vec2(F.w.x*90., 0.)) > .62) c *= vec3(.85, .7, .58);
      }
      // ---- small boxes of metal or plastic: a door panel, screws, vent slots, grime
      else if ((K == 3 || K == 17) && small){
        if (F.ax != 1 && F.dim.x > PX*8. && F.dim.y > PX*8.){
          float inset = PX*2.5; vec2 q = F.w - inset, qd = F.dim - inset*2.;
          bool line = (abs(q.x) < PX*.7 || abs(q.x - qd.x) < PX*.7 || abs(q.y) < PX*.7 || abs(q.y - qd.y) < PX*.7) && q.x > -PX && q.y > -PX && q.x < qd.x + PX && q.y < qd.y + PX;
          if (line) c *= .55;
          if (length(F.w - vec2(PX*1.5, F.dim.y - PX*1.5)) < PX*.8 || length(F.w - vec2(F.dim.x - PX*1.5, F.dim.y - PX*1.5)) < PX*.8) c = vec3(.75);
          if (F.w.y > F.dim.y*.7 && F.w.y < F.dim.y - PX*4. && F.w.x > F.dim.x*.3 && F.w.x < F.dim.x*.7 && fract(F.w.y/(PX*2.5)) < .4) c *= .45;
        }
        c *= flat_ ? 1.05 : mix(.78, 1., F.w.y/max(F.dim.y, .01));
        c = bevel(c, F, PX, .25);
      }
      // ---- crates: planks with gaps, a frame round the edges, nails
      else if (K == 9){
        float pl = F.dim.y/3.; float g = fract(F.w.y/pl);
        if (g < PX/pl*1.2) c *= .35; else c *= .9 + .2*h21(vec2(floor(F.w.y/pl), floor(F.w.x/.07)));
        c *= .92 + .12*sin(F.w.x*140. + floor(F.w.y/pl)*3.);                                         // grain
        if (F.edV < .022) c *= 1.15;                                                                  // the frame boards
        if (F.edV < .022 && F.edV > .008 && abs(g - .5) < .12 && h21(floor(F.w/PX)) > .3) c = vec3(.3);   // nails
        if (F.ax == 2 && F.edV > .05 && F.w.y > F.dim.y*.4 && F.w.y < F.dim.y*.6 && fract(F.w.x/(PX*3.)) < .6) c *= .7;   // a stencilled mark
        c = bevel(c, F, PX, .3);
      }
      // ---- cardboard: flaps and a tape strip on top, printed marks on the sides
      else if (K == 10){
        if (F.ax == 1){ if (abs(F.w.y - F.dim.y*.5) < PX*.7) c *= .6; if (abs(F.w.x - F.dim.x*.5) < F.dim.x*.12) c = mix(c, vec3(.82, .76, .6), .7); }
        else { if (F.w.y > F.dim.y*.55 && F.w.y < F.dim.y*.75 && F.w.x > F.dim.x*.2 && F.w.x < F.dim.x*.45) c *= .55; if (abs(F.w.x - F.dim.x*.7) < PX*.8 && F.w.y > F.dim.y*.3 && F.w.y < F.dim.y*.7) c *= .55; }
        c *= .9 + .15*vn(F.w*60.); c = bevel(c, F, PX, .4);
      }
      // ---- roller shutters: slats, side rails, the bottom bar, a padlock
      else if (K == 4){
        c *= fract(F.w.y/(PX*3.)) < .34 ? .62 : 1.0 + .06*vn(F.w*40.);
        if (F.edV < PX*3.) c *= .55; if (F.edB < PX*4.) c *= .75;
        if (abs(F.w.x - F.dim.x*.5) < PX*2. && F.edB > PX*1. && F.edB < PX*5.) c = vec3(.75, .62, .25);
        c *= .85 + .3*fbm2(vec2(F.w.x*8., F.w.y*2.));                                                // grime
      }
      // ---- canvas awnings and cloth: weave, seams, sag, a soiled lower edge
      else if (K == 12){
        c *= mod(floor(F.w.x/PX) + floor(F.w.y/PX), 2.) < .5 ? 1.04 : .96;
        if (fract(F.w.x/.18) < PX/.18*1.1) c *= .8;
        c *= .8 + .2*sin(clamp(F.w.x/max(F.dim.x, .01), 0., 1.)*3.1416);
        c *= mix(.75, 1., smoothstep(0., F.dim.y*.6, F.edB + (F.ax == 1 ? 1. : 0.)));
        c *= .88 + .2*fbm2(F.w*14.);
        if (F.ax != 1 && F.dim.y < .14 && fract(F.w.x/.05) > .5) c *= .82;                            // the scalloped valance
      }
      // ---- windows (unlit): a frame, mullions, a sill, the sky in the glass, grime in the corners
      else if (K == 11){
        float fr = .016;
        bool frame = F.ed < fr || (F.dim.x > .28 && abs(F.w.x - F.dim.x*.5) < fr*.5) || (F.dim.y > .3 && abs(F.w.y - F.dim.y*.62) < fr*.5);
        if (F.ax == 1) c *= .9;
        else if (frame){ c = vec3(.24, .25, .29)*(F.edT < fr ? 1.4 : 1.); if (F.edB < fr) c = vec3(.5, .48, .45); }
        else { float sk = smoothstep(0., 1., F.w.y/F.dim.y); c = mix(c*.8, uSky*.75, sk*.55); float s = fract((F.w.x + F.w.y)*3.2); if (s > .4 && s < .48) c += .12; c *= mix(.7, 1., smoothstep(0., .04, F.ed)); }
      }
      // ---- walls and slabs: corners in shadow, dirt at the foot, drips from the top, chipped edges
      else if (K == 1 || K == 2 || K == 5 || K == 7 || K == 14 || K == 17){
        if (F.ax != 1){
          c *= mix(.72, 1., smoothstep(0., .1, F.edV));
          c *= mix(.7, 1., smoothstep(0., .22, F.edB));
          float L = .15 + .5*h21(vec2(floor(F.w.x*24.), vSz.y)); float dr = F.edT;
          if (dr < L){ float s = smoothstep(.45, .8, vn(vec2(F.w.x*55., 0.))); c *= 1. - .3*s*(1. - dr/L); }
          if (F.edT < PX*1.5) c *= 1.25;                                                                // a lit top edge
        } else if (F.sg > 0.) c *= .92 + .12*fbm2(F.w*6.);
        else c *= .7;                                                                                   // undersides
        if (F.ed < .012 && vn(F.w*120.) > .6) c = mix(c, vec3(.6, .58, .56), .6);                      // chips
        if (small) c = bevel(c, F, PX, .2);
      }
      else if (K == 3 || K == 6 || K == 8){ c = bevel(c, F, PX, .3); if (F.ax != 1) c *= mix(.8, 1., smoothstep(0., .2, F.edB)); if (K == 3 && vn(F.w*80.) > .78) c *= vec3(.95, .75, .6); }
    }
    else if (cyl){
      float L = vSz.y, v = (vLp.y + .5)*L, r = vSz.x*.5, an = atan(vLp.z, vLp.x);
      if (L < .7 && r > .07){                                       // drums and tanks: rolled ridges, a rim, rust
        float f = v/L; if (abs(f - .33) < .02 || abs(f - .66) < .02) c *= .55; if (abs(f - .35) < .015 || abs(f - .68) < .015) c *= 1.25;
        if (f > .96) c *= .7; c *= .85 + .25*fbm2(vec2(an*3., v*12.)); if (vn(vec2(an*8., v*20.)) > .72) c *= vec3(.9, .65, .5);
      } else {                                                      // pipes and poles: joints, brackets, rust runs
        float j = fract(v/.45); if (j < .03) c *= 1.35; else if (j < .06) c *= .55;
        c *= .9 + .15*vn(vec2(an*2., v*30.)); if (vn(vec2(an*5., v*4.)) > .7) c *= vec3(.85, .65, .5);
      }
      c *= .85 + .3*clamp(cos(an - .8)*.5 + .5, 0., 1.);            // a band of light down its length
    }
    // ---- big walls the game built round (towers, curved fronts): dirt at the foot, drips from the top, a lit top edge
    else if (vGt > 1.5 && vGt < 2.5 && !flat_){
      float L = vSz.y, up = (vLp.y + .5)*L, dn = L - up;
      c *= mix(.7, 1., smoothstep(0., .25, up));
      float an = atan(vLp.z, vLp.x)*max(vSz.x, vSz.z)*.5, dl = .15 + .5*h21(vec2(floor(an*24.), L));
      if (dn < dl){ float s = smoothstep(.45, .8, vn(vec2(an*55., 0.))); c *= 1. - .3*s*(1. - dn/dl); }
      if (dn < PX*1.5) c *= 1.2;
    }
    // ---- walls everywhere: big streaks of grime (soft, large)
    if (uGrimeOn > .5 && !flat_){ float g = texture2D(uGrime, vec2(vWPos.x + vWPos.z, vWPos.y*.35)*.12).r; c *= mix(.66, 1.0, g); }
    // the procedural detail darkens what is sunk and lights what stands proud: read it back as relief
    if (box || cyl){ float lb = dot(cBase, vec3(.3, .59, .11)) + .02; sProcH = clamp(dot(c, vec3(.3, .59, .11))/lb, 0., 2.); }
    // keep the colour a real surface could have: never brighter than about 90% in any channel, and scale all three
    // together so a bright patch on a cream wall stays cream (clamping channels one by one tinted it orange)
    c = max(c, vec3(0.)); float cMx = max(c.r, max(c.g, c.b)); if (cMx > .9) c *= .9/cMx;
    diffuseColor.rgb = pow(c, vec3(2.2));     // into linear light
  }
`;
