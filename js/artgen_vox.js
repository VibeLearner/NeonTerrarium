// Neon Terrarium: a tiny voxel renderer (ART.vox) and the two models drawn with it: the delivery drone (texture 'ddrone') and the police hoverbike (textures 'pbike_r1c1' ... 'pbike_r2c4').
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
  const PARCEL = [box(0, .4, 1.0, 7.6, 5.0, 7.0, ORANGE), box(0, 1.2, 1.0, 7.8, 5.3, 1.0, INK)];
  const DRONE = model(
    ell(0, 7.0, 0, 6.4, 5.0, 6.4, TEAL), ell(0, 10.6, 0, 3.7, 2.4, 3.7, DOME),
    box(0, 8.4, 0, 17.2, 1.5, 1.7, INK, { yaw: Math.PI / 4 }), box(0, 8.4, 0, 17.2, 1.5, 1.7, INK, { yaw: -Math.PI / 4 }),   // two bars crossed: four rotors
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(s => ell(s[0] * 6.1, 9.4, s[1] * 6.1, 2.4, .7, 2.4, INK)),
    ell(0, 7.2, 6.1, 2.4, 2.2, 1.3, INK), ell(0, 7.2, 7.0, 1.4, 1.3, .8, LENS, { emit: true }),
    box(0, .6, 1.0, 7.2, 4.4, 6.6, ORANGE));
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

  // ---------- the police hoverbike: a dark chunky hull, cyan light strips, blue thruster glow, a low saddle, a screen and a red and blue light bar at the back ----------
  const HULL = [H('#101114'), H('#1f2125'), H('#3a3d44')], TRIM = [H('#0c0d0f'), H('#1c1d20'), H('#303237')], CY = [H('#3cc4cc'), H('#0f5a60')], BLUE = [H('#2a9cff'), H('#0b3f8a')];
  const RED = [H('#ff2a2a'), H('#701016')], BLU = [H('#2a6cff'), H('#0c2a80')], GLASS = [H('#10242c'), H('#1f4856'), H('#4a8a9a')];
  const BIKE = model(
    ell(0, 4.0, 0, 4.8, 3.0, 11.6, HULL),                  // the hull (its ends rise, like a boat's)
    ell(-3.4, 3.6, -1, 1.9, 2.0, 8, TRIM), ell(3.4, 3.6, -1, 1.9, 2.0, 8, TRIM),   // the side pods
    ell(0, 5.4, 7.4, 3.0, 2.6, 4.6, HULL),                 // the nose fairing
    ell(0, 7.8, 5.2, 2.5, 2.2, 2.2, GLASS),                // the screen
    box(0, 8.6, 3.0, 8.6, 1.0, 1.2, TRIM),                 // the bars
    box(0, 7.2, -7.2, 6.4, 3.4, 4.0, HULL), box(0, 9.2, -8.8, 9.0, 1.2, 1.6, TRIM),   // the tail and the light bar's rail
    box(3.0, 10.2, -8.8, 2.6, 1.2, 1.6, RED, { emit: true }), box(-3.0, 10.2, -8.8, 2.6, 1.2, 1.6, BLU, { emit: true }),
    ell(-3.7, 5.0, -9.4, 1.8, 1.8, 2.6, TRIM), ell(3.7, 5.0, -9.4, 1.8, 1.8, 2.6, TRIM),    // the thrusters
    box(-3.7, 5.0, -11.8, 2.4, 2.4, .8, BLUE, { emit: true }), box(3.7, 5.0, -11.8, 2.4, 2.4, .8, BLUE, { emit: true }),
    box(0, 1.1, 0, 6.6, .6, 13, BLUE, { emit: true }),     // the glow under the hull
    box(-4.8, 4.6, -4, .7, 1.0, 4, CY, { emit: true }), box(4.8, 4.6, -4, .7, 1.0, 4, CY, { emit: true }), box(-4.8, 4.6, 3, .7, 1.0, 5, CY, { emit: true }), box(4.8, 4.6, 3, .7, 1.0, 5, CY, { emit: true }),   // the light strips
    box(0, 5.6, 11.8, 3.6, 1.1, .7, CY, { emit: true }));  // the headlight
  ART.bike = BIKE;
  const BSIZE = { r1c1: [14, 17], r1c2: [24, 17], r1c3: [26, 16], r1c4: [23, 18], r2c1: [14, 18], r2c2: [19, 18], r2c3: [26, 16], r2c4: [24, 18] };
  const BVIEWS = ['r2c1', 'r1c4', 'r2c3', 'r2c4', 'r1c1', 'r1c2', 'r1c3', 'r2c2'];   // view k of the game: heading k * 45 degrees (0: nose away, then clockwise)
  BVIEWS.forEach((n, k) => ART.reg('pbike_' + n, (g, w, h) => V.blit(g, V.render(BIKE, k * Math.PI / 4, w, h, { outline: 'br', outK: .5 }), 0, 0)));
})();
