// Neon Terrarium: a tiny voxel renderer (ART.vox) and the two models drawn with it: the delivery drone (texture 'ddrone') and the police hoverbike (textures 'pbike_r1c1' ... 'pbike_r2c4'), generated from a seed (ART.bikeGen).
// A model is a short list of boxes and ellipsoids on a pixel grid: one model unit is one screen pixel across (x), and a unit of height is cos(pitch) pixels. render() casts one ray per pixel (orthographic, at
// the game's camera pitch), keeps the nearest hit, shades it flat in 3 steps from the upper left, outlines it where the shape meets empty space, and returns a pixel buffer with alpha 0 or 255 only.
// All views of one model come from the same boxes, so they agree with each other. No Math.random, no Date.
//
//   const M = ART.vox.model(
//     ART.vox.box(cx, cy, cz, sx, sy, sz, ramp, o),     // centre and full size; ramp = [dark, mid, light] (0xRRGGBB), o = { yaw, emit, k }
//     ART.vox.ell(cx, cy, cz, rx, ry, rz, ramp, o));    // centre and radii
//   ART.vox.render(M, heading, w, h, opts) -> SG.Px     // heading in radians: 0 nose (+z) away from the camera, growing clockwise seen from above (pi/2: nose to the right)
//   ART.vox.blit(g, px, x, y)                           // paint a pixel buffer into a 2d context
// Model axes: x right (when heading 0), y up, z forward (the nose). The origin is the middle of the footprint on the ground.
// o.yaw turns one primitive about y; o.emit: unlit (the lamp's own color, ramp[0] only is used as the color, ramp[1] as the outline when given); o.k: nothing yet.
// opts: pitch (default .56), light [x right, y up, z toward camera] (default upper left), t1 / t2 (the light thresholds between dark|mid and mid|light), outline 'all' | 'br' | 'none' (default 'br'),
// outK (how much darker the outline is, default .6), align 'bottom' (default: the lowest pixel row is the last row, the model's origin on the middle column) or 'origin' (oy: the row of the origin), oy.
// The result carries .ox, .oy (the pixel of the model origin in the buffer), and .at(x, y, z) -> [col, row] of any model point, for checking that a rider sits right.
(() => {
  const V = {};
  const mk = (type, c, s, ramp, o) => Object.assign({ type, c, s, ramp, yaw: 0, emit: false }, o || {});
  V.box = (cx, cy, cz, sx, sy, sz, ramp, o) => mk('box', [cx, cy, cz], [sx / 2, sy / 2, sz / 2], ramp, o);
  V.ell = (cx, cy, cz, rx, ry, rz, ramp, o) => mk('ell', [cx, cy, cz], [rx, ry, rz], ramp, o);
  V.model = (...prims) => ({ prims });
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  V.render = (model, heading, w, h, opts = {}) => {
    const P = opts.pitch ?? .56, cp = Math.cos(P), sp = Math.sin(P);
    const L = norm(opts.light || [-.55, .65, .5]), t1 = opts.t1 ?? -.12, t2 = opts.t2 ?? .45, outline = opts.outline || 'br', outK = opts.outK ?? .6;
    const BW = w + 12, BH = h + 24, ox = BW / 2, oy = BH - 8, ca = Math.cos(heading), sa = Math.sin(heading), sx0 = 6;
    const col = new Int32Array(BW * BH).fill(-1), id = new Int16Array(BW * BH).fill(-1), zb = new Float32Array(BW * BH).fill(1e9);
    for (let i = 0; i < model.prims.length; i++) {
      const p = model.prims[i], a = heading + p.yaw, c = Math.cos(a), s = Math.sin(a), ramp = p.ramp;
      const cx = p.c[0] * ca + p.c[2] * sa, cy = p.c[1], cz = -p.c[0] * sa + p.c[2] * ca;
      const scv = cy * cp + cz * sp, S = p.s, isBox = p.type === 'box';   // the primitive's screen box (exact extents of the box or ellipsoid)
      const hu = isBox ? Math.abs(S[0] * c) + Math.abs(S[2] * s) : Math.sqrt(S[0] * c * S[0] * c + S[2] * s * S[2] * s);
      const hv = isBox ? Math.abs(S[0] * s * sp) + S[1] * cp + Math.abs(S[2] * c * sp) : Math.sqrt((S[0] * s * sp) ** 2 + (S[1] * cp) ** 2 + (S[2] * c * sp) ** 2);
      const q0 = Math.max(0, Math.floor(ox + cx - hu)), q1 = Math.min(BW - 1, Math.ceil(ox + cx + hu)), r0 = Math.max(0, Math.floor(oy - scv - hv)), r1 = Math.min(BH - 1, Math.ceil(oy - scv + hv));
      const dx = -cp * s, dy = -sp, dz = cp * c, box = p.type === 'box', S0 = p.s[0], S1 = p.s[1], S2 = p.s[2];
      for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
        const u = q + .5 - ox, v = oy - (r + .5), Oy = v * cp, Oz = v * sp;
        const rx = u - cx, ry = Oy - cy, rz = Oz - cz, lx = rx * c - rz * s, ly = ry, lz = rx * s + rz * c;
        let t, nx, ny, nz;
        if (box) {
          let tn = -1e9, tf = 1e9, ax = -1, sg = 0;
          const o0 = lx, o1 = ly, o2 = lz;
          for (let e = 0; e < 3; e++) {
            const o = e === 0 ? o0 : e === 1 ? o1 : o2, d = e === 0 ? dx : e === 1 ? dy : dz, hs = e === 0 ? S0 : e === 1 ? S1 : S2;
            if (Math.abs(d) < 1e-9) { if (Math.abs(o) > hs) { tn = 1e9; break; } continue; }
            let a1 = (-hs - o) / d, a2 = (hs - o) / d; if (a1 > a2) { const tmp = a1; a1 = a2; a2 = tmp; }
            if (a1 > tn) { tn = a1; ax = e; sg = d > 0 ? -1 : 1; }
            if (a2 < tf) tf = a2;
          }
          if (tn >= tf || ax < 0) continue;
          t = tn; nx = ax === 0 ? sg : 0; ny = ax === 1 ? sg : 0; nz = ax === 2 ? sg : 0;
        } else {
          const a0 = lx / S0, a1 = ly / S1, a2 = lz / S2, d0 = dx / S0, d1 = dy / S1, d2 = dz / S2;
          const A = d0 * d0 + d1 * d1 + d2 * d2, B = a0 * d0 + a1 * d1 + a2 * d2, C = a0 * a0 + a1 * a1 + a2 * a2 - 1, D = B * B - A * C;
          if (D <= 0) continue;
          t = (-B - Math.sqrt(D)) / A;
          nx = (lx + dx * t) / (S0 * S0); ny = (ly + dy * t) / (S1 * S1); nz = (lz + dz * t) / (S2 * S2);
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
        }
        const k = r * BW + q; if (t >= zb[k]) continue;
        zb[k] = t; id[k] = i;
        if (p.emit) col[k] = ramp[0];
        else {   // normal: frame -> world (x', y, z') -> view (right, up, toward the camera)
          const wx = nx * c + nz * s, wy = ny, wz = -nx * s + nz * c;
          const lum = wx * L[0] + (wy * cp + wz * sp) * L[1] + (wy * sp - wz * cp) * L[2];
          col[k] = lum >= t2 ? ramp[ramp.length - 1] : lum >= t1 ? ramp[ramp.length >> 1] : ramp[0];
        }
      }
    }
    let r1 = -1, c0 = BW, c1 = -1, r0 = BH;
    for (let r = 0; r < BH; r++) for (let q = 0; q < BW; q++) if (col[r * BW + q] >= 0) { if (r > r1) r1 = r; if (r < r0) r0 = r; if (q < c0) c0 = q; if (q > c1) c1 = q; }
    const px = new SG.Px(w, h), dy = opts.align === 'origin' ? Math.round(opts.oy) - Math.floor(oy) : (h - 1) - r1;   // shift rows so the lowest row lands on the last row
    px.ox = ox - sx0; px.oy = oy + dy; px.bounds = { r0: r0 + dy, r1: r1 + dy, c0: c0 - sx0, c1: c1 - sx0 };
    px.at = (x, y, z) => { const X = x * ca + z * sa, Z = -x * sa + z * ca; return [ox + X - sx0, oy - (y * cp + Z * sp) + dy]; };   // the point's position in pixel units (a pixel q covers q .. q + 1)
    const get = (q, r) => (q < 0 || r < 0 || q >= BW || r >= BH) ? -1 : col[r * BW + q];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = x + sx0, r = y - dy; let c = get(q, r); if (c < 0) continue;
      let edge = false;
      if (outline !== 'none') {
        if (get(q + 1, r) < 0 || get(q, r + 1) < 0) edge = true;
        if (outline === 'all' && (get(q - 1, r) < 0 || get(q, r - 1) < 0)) edge = true;
      }
      if (edge) { const p = model.prims[id[r * BW + q]]; c = p.emit && p.ramp.length > 1 ? p.ramp[1] : SG.shade(c, -outK); }
      px.set(x, y, c);
    }
    return px;
  };
  V.blit = (g, px, x, y) => { g.putImageData(new ImageData(px.d, px.w, px.h), x, y); };
  ART.vox = V;

  const { box, ell, model } = V, H = SG.hex;
  // ---------- the delivery drone: a round teal hover body, a lavender dome, four rotor arms, a sensor eye in front, the parcel strapped under ----------
  const TEAL = [H('#2f6f74'), H('#6fb0b0'), H('#a8d8d4')], DOME = [H('#8d78b8'), H('#bca8d8'), H('#e0d6f4')], INK = [H('#05080a'), H('#12191d'), H('#34464c')];
  const ORANGE = [H('#b8681b'), H('#e1911d'), H('#f6bc5a')], LENS = [H('#9ae8ea'), H('#134c50')];
  const PARCEL = [box(0, -.4, 0, 9.0, 4.6, 9.0, ORANGE), box(-2.8, 1.6, 0, .9, 1.4, 1.4, INK), box(2.8, 1.6, 0, .9, 1.4, 1.4, INK)];   // hangs on two short straps, lower than the belly
  const AR = 8.7, ANG = [0, 1, 2, 3, 4, 5, 6, 7].map(k => k * Math.PI / 4), STEEL = [H('#142026'), H('#2c4650'), H('#5f8590')];   // eight small rotor pods in a ring: at least 19 px wide from every side
  const DRONE = model(
    ell(0, 6.4, 0, 7.0, 4.7, 7.0, TEAL), ell(0, 9.6, 0, 3.9, 2.3, 3.9, DOME),
    box(-2.0, 12.6, 0, 1.0, 3.0, 1.0, INK), box(2.0, 12.6, 0, 1.0, 3.0, 1.0, INK),   // the two antennae
    ...[0, 1, 2, 3].map(k => box(0, 7.4, 0, AR * 2, 1.2, 1.4, INK, { yaw: k * Math.PI / 4 })),   // four bars through the middle
    ...ANG.map(a => ell(Math.sin(a) * AR, 8.0, Math.cos(a) * AR, 1.8, .7, 1.8, STEEL)),
    ell(0, 6.8, 6.9, 2.4, 2.2, 1.3, INK), ell(0, 6.8, 7.8, 1.4, 1.3, .8, LENS, { emit: true }),
    ...PARCEL);
  ART.drone = DRONE;
  ART.reg('ddrone', (g, W, Hh) => {
    const cw = 22, ch = 19;
    for (let k = 0; k < 8; k++) V.blit(g, V.render(DRONE, k * Math.PI / 4, cw, ch, { outline: 'all', outK: .85 }), k * cw, 0);
    // 8: the parcel set down on the doorstep
    V.blit(g, V.render(model(box(0, .9, 0, 6, 1.8, 3.8, ORANGE)), 0, cw, ch, { outline: 'br', outK: .5 }), 8 * cw, 0);
    // 9, 10: the club's leftovers, drawn here (a yellow-green splash that has run down a step, and a puddle): blobs from a seeded random stream, three values lit from the upper left
    const px = new SG.Px(cw * 3, ch), R = SG.rng(SG.seedOf('ddrone_puke', 1));
    const pal = [H('#6e8c28'), H('#96be3c'), H('#c4d25a')];
    const blob = (ox, cx, cy, rx, ry) => SG.ellipse(px, ox + cx, cy, rx, ry, (x, y, nx, ny, e) => SG.rampAt(pal, SG.lit(nx, ny)*.9 + (e < .25 ? -.12 : 0), x, y, false));
    // puke: a splash at the top that runs down in a thinning trail, ending in a small pool
    blob(0, 9, 8, 3.6, 1.9); blob(0, 12.5, 9.5, 1.6, 1.0);
    for (let y = 10; y < 16; y++){ px.set(10 - (y > 12 ? 1 : 0), y, y % 3 ? pal[1] : pal[0]); if (y < 13) px.set(11 - (y > 12 ? 1 : 0), y, pal[0]); }
    blob(0, 9.5, 17, 3.2, 1.2); blob(0, 5.8, 17.5, 1.7, .8);
    for (let k = 0; k < 3; k++) px.set(Math.round(R.r(4, 13)), Math.round(R.r(5, 8)), pal[2]);
    // puddle: a low irregular pool, wider than tall, a pale highlight at the upper left
    blob(cw, 11, 15.8, 8.4, 2.6); blob(cw, 6.4, 16.8, 3.6, 1.6); blob(cw, 15.6, 17.0, 4.2, 1.5); blob(cw, 12.5, 13.6, 3.0, 1.2);
    for (const [x, y] of [[8, 14], [9, 14], [14, 15]]) px.set(cw + x, y, pal[2]);
    SG.despeckle(px);
    V.blit(g, px, 9 * cw, 0);
  });

  // ---------- the police hoverbike, generated ----------
  // ART.bikeGen(seed): a hoverbike from a seed. Five builds (a low wedge interceptor, an armored brick, a twin-boom speeder,
  // a flat sled with one big ring thruster, a wasp with two pods and a waist), a livery (dark hull, sometimes white police
  // panels), an accent color for the light strips and headlight, the underglow, fins, and always the red and blue light bar
  // at the back. Whatever the build, the saddle's top sits at y 7 just behind the middle, where people.js seats the rider,
  // and the bars are in front of it. The seed the game rides is BIKE_SEED (picked from a sheet: tools/bikes.html).
  const RAMPS = {
    graphite: [H('#101114'), H('#1f2125'), H('#3a3d44')], gunmetal: [H('#111620'), H('#232c3c'), H('#45526a')],
    navy: [H('#0b1224'), H('#1a2848'), H('#36507e')], plum: [H('#140f1b'), H('#2a2136'), H('#4b3d62')], olive: [H('#12140f'), H('#262a20'), H('#454b3a')] };
  const PANEL = [H('#8f96a3'), H('#c9ced6'), H('#eef1f4')], DARK = [H('#08090b'), H('#15161a'), H('#2a2c32')], SEAT = [H('#0a0a0c'), H('#18181c'), H('#2c2c33')];
  const ACC = { cyan: [H('#3ce4ec'), H('#0f5a60')], magenta: [H('#ff4fd0'), H('#6a1a58')], amber: [H('#ffb43c'), H('#6a4210')], ice: [H('#9fd8ff'), H('#2a5a80')], acid: [H('#b4ff4a'), H('#3e6a14')] };
  const GLOWS = { blue: [H('#2a9cff'), H('#0b3f8a')], violet: [H('#9a5cff'), H('#3a1a80')], cyan: [H('#3cc4cc'), H('#0f5a60')], rose: [H('#ff4a8a'), H('#6a1a38')] };
  const GLASSR = [H('#10242c'), H('#1f4856'), H('#4a8a9a')];
  const RED_L = [H('#ff2a2a'), H('#701016')], BLUE_L = [H('#2a6cff'), H('#0c2a80')];
  const BUILDS = ['interceptor', 'brick', 'speeder', 'sled', 'wasp'];
  ART.bikeGen = seed => {
    const R = SG.rng(SG.seedOf('pbike', seed)), build = BUILDS[R.i(0, BUILDS.length - 1)];
    const liv = R.pick(Object.keys(RAMPS)), HULLR = RAMPS[liv], TRIMR = DARK, acc = R.pick(Object.keys(ACC)), A = ACC[acc], gl = R.pick(Object.keys(GLOWS)), G = GLOWS[gl];
    const panels = R.chance(.5), L = R.r(10, 12.5), Wd = R.r(3.6, 5), P = [];
    const emit = { emit: true };
    // the shared bits: saddle (top at y 7), bars, screen, headlight, light bar, underglow
    const common = (noseZ, tailZ, sideX, hullTop) => {
      P.push(box(0, 6.4, -1.2, 3.6, 1.2, 5.2, SEAT));                                          // the saddle
      P.push(box(0, Math.min(6.0, hullTop + .3), -1.2, 4.4, Math.max(.6, 6.0 - hullTop + .6), 6, TRIMR));   // its base on the hull
      P.push(box(0, 8.6, 3.2, 8.4, .9, 1.0, TRIMR), box(-4.1, 8.0, 3.2, .8, 1.6, .8, TRIMR), box(4.1, 8.0, 3.2, .8, 1.6, .8, TRIMR));   // the bars
      P.push(ell(0, 8.0, 5.0, 2.4, 2.0, 1.8, GLASSR));                                           // the screen
      P.push(box(0, 5.4, noseZ + .2, R.r(2.6, 4.2), 1.0, .7, A, emit));                          // the headlight
      const ly = hullTop + 1.4, lz = tailZ + R.r(2.2, 3.2);
      P.push(box(0, ly - .9, lz, 6.4, .8, 2.0, TRIMR));                                          // the light bar's base, on the tail
      P.push(box(2.2, ly, lz, 2.4, 1.1, 1.4, RED_L, emit), box(-2.2, ly, lz, 2.4, 1.1, 1.4, BLUE_L, emit));
      P.push(box(0, 1.1, (noseZ + tailZ)/2, sideX*1.3, .6, (noseZ - tailZ)*.85, G, emit));        // the glow under it
    };
    const strips = (x, y, z0, z1) => { P.push(box(-x, y, (z0 + z1)/2, .7, .9, z1 - z0, A, emit), box(x, y, (z0 + z1)/2, .7, .9, z1 - z0, A, emit)); };
    const fins = (x, y, z, h) => { if (R.chance(.6)) P.push(box(-x, y + h/2, z, .6, h, 2.6, HULLR), box(x, y + h/2, z, .6, h, 2.6, HULLR)); };
    if (build === 'interceptor'){   // long, low, a wedge nose stepping down, a tail fin, twin thrusters
      P.push(box(0, 3.8, -1, Wd*2, 3.2, L*1.6, HULLR));
      for (let k = 0; k < 3; k++) P.push(box(0, 3.4 - k*.5, L*.8 + k*1.3, Wd*2*(1 - k*.22), 2.4 - k*.5, 1.4, HULLR));
      if (panels) P.push(box(-Wd - .05, 4.0, 1, .4, 1.6, L, PANEL), box(Wd + .05, 4.0, 1, .4, 1.6, L, PANEL));
      P.push(box(0, 6.4, -L*.8 + 1, 1.0, 3.0, 3.2, HULLR));                                      // the tail fin
      for (const s of [-1, 1]){ P.push(ell(s*(Wd - .6), 4.0, -L*.8 - .6, 1.8, 1.8, 2.4, TRIMR), box(s*(Wd - .6), 4.0, -L*.8 - 2.6, 2.2, 2.2, .7, G, emit)); }
      strips(Wd + .1, 2.6, -L*.6, L*.6); common(L*.8 + 3.2, -L*.8 - 2.6, Wd, 5.4);
    } else if (build === 'brick'){   // a heavy armored block, a ram in front, one big square thruster
      const w = Wd + .8;
      P.push(box(0, 4.0, 0, w*2, 4.4, L*1.7, HULLR), box(0, 6.0, -.5, w*2 - 1.6, 1.2, L*1.4, HULLR));
      P.push(box(0, 2.8, L*.85 + .8, w*2 - .6, 2.2, 1.6, TRIMR));                              // the ram
      if (panels) P.push(box(-w - .05, 4.4, 0, .4, 2.0, L*1.2, PANEL), box(w + .05, 4.4, 0, .4, 2.0, L*1.2, PANEL));
      for (const s of [-1, 1]) P.push(box(s*(w + .3), 3.2, 0, .6, 2.6, L*.9, TRIMR));            // armor plates
      P.push(box(0, 4.2, -L*.85 - .8, w*1.4, 3.2, 1.6, TRIMR), box(0, 4.2, -L*.85 - 1.8, w*1.1, 2.4, .7, G, emit));
      strips(w + .65, 4.6, -L*.5, L*.5); common(L*.85 + 1.8, -L*.85 - 1.8, w, 6.6);
    } else if (build === 'speeder'){   // two long pods on booms, a thin spine with the saddle, a thruster at each pod's tail
      const x = Wd + .4;
      for (const s of [-1, 1]){ P.push(ell(s*x, 3.6, 0, 1.9, 1.9, L*.95, HULLR), box(s*x, 3.6, -L*.95, 2.2, 2.2, .7, G, emit));
        if (panels) P.push(box(s*(x + 1.6), 3.8, 1, .4, 1.0, L*.9, PANEL)); }
      P.push(box(0, 4.6, 0, 2.6, 2.4, L*1.5, HULLR), box(0, 4.2, L*.4, x*2, 1.0, 1.4, TRIMR), box(0, 4.2, -L*.5, x*2, 1.0, 1.4, TRIMR));
      P.push(ell(0, 5.2, L*.75, 2.0, 1.8, 3.2, HULLR));
      fins(x, 5.0, -L*.7, 2.2);
      strips(x + 1.9, 3.6, -L*.5, L*.5); common(L*.95 + .2, -L*.95, x + 2, 5.8);
    } else if (build === 'sled'){   // a flat wide hull, a spoiler, one big ring thruster
      P.push(ell(0, 3.6, 0, Wd + 1.2, 2.2, L, HULLR), box(0, 5.0, -1, Wd*1.4, 1.4, L*1.2, HULLR));
      if (panels) P.push(ell(0, 3.7, .5, Wd + 1.3, 1.0, L*.8, PANEL));
      P.push(box(0, 7.8, -L + 2, Wd*2 + 1, .7, 2.0, TRIMR), box(-Wd, 6.6, -L + 2, .6, 2.2, 1.6, TRIMR), box(Wd, 6.6, -L + 2, .6, 2.2, 1.6, TRIMR));   // the spoiler
      P.push(ell(0, 4.2, -L - .4, 2.8, 2.8, 1.4, TRIMR), ell(0, 4.2, -L - 1.4, 2.0, 2.0, .6, G, emit));
      strips(Wd + 1.1, 3.4, -L*.6, L*.6); common(L + .2, -L - 1.4, Wd + 1, 6.2);
    } else {   // wasp: a big front pod and rear pod, a narrow waist under the saddle, hover pods at the front
      P.push(ell(0, 4.6, L*.45, Wd, 2.8, L*.55, HULLR), ell(0, 4.8, -L*.5, Wd + .4, 3.0, L*.5, HULLR), box(0, 4.6, 0, 2.4, 2.0, L*.6, TRIMR));
      if (panels) P.push(ell(0, 5.0, -L*.5, Wd + .5, 1.2, L*.42, PANEL));
      for (const s of [-1, 1]){ P.push(ell(s*(Wd + .8), 3.0, L*.55, 1.4, 1.2, 2.4, TRIMR), box(s*(Wd + .8), 1.8, L*.55, 1.6, .5, 2.0, G, emit)); }
      P.push(ell(0, 4.8, -L - .2, 2.0, 2.0, 1.0, G, emit));
      fins(Wd*.7, 6.4, -L*.6, 2.6);
      strips(Wd + .1, 4.2, -L*.8, -L*.2); common(L, -L - .2, Wd, 6.8);
    }
    return { model: model(...P), build, livery: liv, accent: acc, glow: gl, panels };
  };
  // render a bike's eight views, each cropped to its drawn pixels (width kept even about the middle, so the origin stays the middle column)
  ART.BIKE_VIEWS = 32;   // views round the circle: one every 11.25 degrees, so a turn steps through them smoothly
  ART.bikeViews = (M, opts = { outline: 'br', outK: .5 }, n = 8) => Array.from({ length: n }, (_, k) => {
    const a = k*Math.PI*2/n, big = V.render(M, a, 48, 36, opts), bd = big.bounds, cx = Math.round(big.ox);
    const half = Math.max(cx - bd.c0, bd.c1 + 1 - cx), w = Math.max(8, half*2), h = bd.r1 - bd.r0 + 1;
    return { w, h, px: V.render(M, a, w, h, opts) };
  });
  const BIKE_SEED = 8;   // (an interceptor: gunmetal with white police panels, cyan strips, violet underglow)
  const BIKE = ART.bikeGen(BIKE_SEED).model, NV = ART.BIKE_VIEWS, BV = ART.bikeViews(BIKE, undefined, NV);
  ART.bike = BIKE;
  // textures 'pbike_v0' ... 'pbike_v31': view k is the heading k*360/32 degrees (0: nose away from the camera, then clockwise)
  BV.forEach((v, k) => { ART.SIZE['pbike_v' + k] = [v.w, v.h]; ART.reg('pbike_v' + k, (g, w, h) => V.blit(g, V.render(BIKE, k*Math.PI*2/NV, w, h, { outline: 'br', outK: .5 }), 0, 0)); });
})();
