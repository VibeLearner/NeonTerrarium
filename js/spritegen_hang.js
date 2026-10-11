// Neon Terrarium: hanging greenery and floor decals drawn in code (procedural foliage plan). Runs after spritegen.js, shares its scope.
// Hanging kinds: strands fall from a solid top row with a little sway, leaves alternate along each strand.
// Floor decals: flat plant layers on transparent in the narrow middle values of SG.PAL.fMoss / fCrack / fGrass / fLeaf (they take the scene's light like the paving).
(() => {
  const P = SG.PAL, clamp01 = t => Math.max(0, Math.min(1, t));

  // ---------- local helpers ----------
  // a value noise 0..1 on a lattice of step s (smooth, clumpy: no speckle)
  const hash = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const vnoise = (x, y, st, seed) => { const gx = x/st, gy = y/st, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy,
      a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed), u = fx*fx*(3 - 2*fx), w = fy*fy*(3 - 2*fy);
    return a + (b - a)*u + (c - a)*w + (a - b - c + d)*u*w; };

  // a leaf shape: rows of strings, 'X' is leaf. Side leaves hang off the stem to one side (col 0 touches the stem); H leaves are centered under the stem point.
  const SH = {
    S:  { g: ['XX', 'XX'], ar: 0 },
    S3: { g: ['XXX', '.XX'], ar: 0 },
    M:  { g: ['.XX.', 'XXXX', '.XXX', '..X.'], ar: 1 },
    L:  { g: ['.XXX.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'], ar: 1 },
    H3: { g: ['X.X', 'XXX', '.X.'], c: 1 },
    H4: { g: ['XX.XX', 'XXXXX', '.XXX.', '..X..'], c: 2 },
    H5: { g: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'], c: 3 },
  };
  // draw one leaf at the stem point (x, y); side -1 or 1; tone 0..1 (this leaf's base value); rng = [lo, hi] of the ramp
  function leaf(px, x, y, side, name, ramp, rng, tone) {
    const s = SH[name], g = s.g, rows = g.length, cols = g[0].length;
    const centered = s.c !== undefined;
    const x0 = centered ? x - s.c + side : x + side*1, y0 = centered ? y : y - s.ar;
    const cxl = centered ? x0 + (cols - 1)/2 : (side > 0 ? x0 + (cols - 1)/2 : x0 - (cols - 1)/2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (g[r][c] !== 'X') continue;
      const X = centered ? x0 + c : x0 + side*c, Y = y0 + r;
      const dx = (X - cxl)/(cols/2 + .3), dy = (r + .5 - rows/2)/(rows/2 + .3);
      const t = clamp01(tone - .38*(dx*.6 + dy*.8) + .1);
      px.set(X, Y, SG.rampAt(ramp, rng[0] + (rng[1] - rng[0])*t, X, Y, false));
    }
  }
  // one strand from the top: a swaying path, thicker at the top, leaves alternating along it
  function strand(px, R, o) {
    const ph = R.r(0, 6.28), fr = R.r(.16, .34), gap0 = o.gap || 3, rng = o.rng || [.3, 1], y0 = o.y0 || 0, ramp = o.ramp;
    let side = R.chance(.5) ? 1 : -1, last = y0 - 1, lx = o.x0, gap = gap0;
    const pts = [];
    for (let y = y0; y < y0 + o.len; y++) {
      const x = Math.round(o.x0 + o.amp*Math.sin(ph + (y - y0)*fr)*Math.min(1, (y - y0)/5) + (o.drift || 0)*(y - y0)/o.len);
      px.set(x, y, ramp[o.stem || 1]);
      if (o.thick && y - y0 < o.thick) px.set(x + 1, y, ramp[2]);
      lx = x; pts.push(x);
    }
    for (let i = 0; i < pts.length; i++) {
      const y = y0 + i, t = i/o.len;
      if (i < (o.skip === undefined ? 2 : o.skip) || y - last < gap) continue;
      const nm = o.leafAt ? o.leafAt(t, R) : o.leaf;
      leaf(px, pts[i], y, side, nm, ramp, rng, R.r(.3, .75));
      side = -side; last = y; gap = gap0 + (R.chance(.35) ? 1 : 0);
    }
    // a leaf at the tip
    const tn = o.tipLeaf || (o.leafAt ? o.leafAt(1, R) : o.leaf);
    leaf(px, pts[pts.length - 1], y0 + o.len - 1, side, tn, ramp, rng, R.r(.3, .6));
  }
  // the solid top row (the anchor) with a short leafy lip below it
  function lip(px, R, w, ramp, rows, rng) {
    for (let x = 0; x < w; x++) px.set(x, 0, (x & 1) ? ramp[2] : ramp[1]);
    for (let r = 1; r < rows; r++) for (let x = 0; x < w; x++) {
      const n = vnoise(x, r*3, 2.5, 7);
      if (n > .22 + r*.2) px.set(x, r, SG.rampAt(ramp, rng[0] + (rng[1] - rng[0])*clamp01(.75 - r*.28 - (x/w)*.2 + (n - .5)*.4), x, r, false));
    }
  }
  // strand x positions spread across the width, jittered
  const spread = (R, n, w, m) => { const xs = []; for (let i = 0; i < n; i++) xs.push(Math.round(m + (n === 1 ? (w - 1 - 2*m)/2 : i*(w - 1 - 2*m)/(n - 1)) + R.r(-.9, .9))); return xs; };
  const finish = (px, amt) => { SG.edge(px, 'br', amt === undefined ? .42 : amt); };
  // keep row 0 solid across the full width (the anchor): fill gaps
  const anchor = (px, w, ramp) => { for (let x = 0; x < w; x++) if (!px.has(x, 0)) px.set(x, 0, ramp[1]); };

  // ---------- vines: thin long strands with small paired leaves ----------
  SG.reg('vines', (px, R, v, w, h) => {
    const ramp = P.bright, n = R.i(4, 6), xs = spread(R, n, w, 1);
    lip(px, R, w, ramp, 2, [.45, .9]);
    xs.forEach((x, i) => strand(px, R, { x0: x, len: i === (v % n) ? h - 1 : Math.round(R.r(.4, .9)*(h - 1)), amp: R.r(.8, 2), gap: 3, thick: 5, leafAt: t => t < .5 ? 'S3' : 'S', ramp, stem: 2, rng: [.45, 1] }));
    anchor(px, w, ramp); finish(px, .45);
  });

  // ---------- pothos: heart-shaped leaves along trailing stems ----------
  SG.reg('pothos', (px, R, v, w, h) => {
    const ramp = P.bright, n = R.i(3, 4), xs = spread(R, n, w, 3);
    lip(px, R, w, ramp, 4, [.4, 1]);
    xs.forEach((x, i) => strand(px, R, { x0: x, y0: 1, len: Math.round(R.r(.55, 1)*(h - 2)), amp: R.r(.8, 1.6), gap: 4, thick: 3, skip: 3, leafAt: t => t < .35 ? 'H4' : 'H3', ramp, rng: [.5, 1] }));
    anchor(px, w, ramp); finish(px, .4);
  });

  // ---------- ivy: pointed multi-lobed leaves on trailing stems ----------
  SG.reg('h_ivy', (px, R, v, w, h) => {
    const ramp = P.olive, n = R.i(6, 8), xs = spread(R, n, w, 2);
    lip(px, R, w, ramp, 3, [.1, .75]);
    xs.forEach(x => strand(px, R, { x0: x, len: Math.round(R.r(.45, 1)*(h - 1)), amp: R.r(.6, 1.6), gap: 4, thick: 4, skip: 2, leafAt: t => t < .6 ? 'L' : 'M', ramp, rng: [.0, .72] }));
    anchor(px, w, ramp); finish(px, .5);
  });

  // ---------- h_vine3: a dense narrow hank ----------
  SG.reg('h_vine3', (px, R, v, w, h) => {
    const ramp = P.olive, n = R.i(5, 6), xs = spread(R, n, w, 1);
    lip(px, R, w, ramp, 2, [.1, .7]);
    xs.forEach(x => strand(px, R, { x0: x, len: Math.round(R.r(.5, 1)*(h - 1)), amp: R.r(.7, 1.5), gap: 2, thick: 3, leafAt: t => R.chance(.5) ? 'M' : 'S3', ramp, rng: [.0, .62] }));
    anchor(px, w, ramp); finish(px, .5);
  });

  // ---------- curtains: many strands side by side ----------
  const curtain = (kind, opt) => SG.reg(kind, (px, R, v, w, h) => {
    const ramp = opt.ramp, n = Math.round(w/opt.sp) + (v & 1), xs = spread(R, n, w, 1);
    lip(px, R, w, ramp, opt.lip, opt.rng);
    xs.forEach((x, i) => { const e = Math.sin(Math.PI*(i + .5)/n); // shorter at the sides
      strand(px, R, { x0: x, len: Math.max(8, Math.round((.45 + .55*R.f()*e + .1*e)*(h - 1))), amp: R.r(.5, 1.5), gap: opt.gap, thick: opt.thick, leafAt: t => t < .4 ? opt.big : opt.small, ramp, rng: opt.rng }); });
    anchor(px, w, ramp); finish(px, opt.edge);
  });
  curtain('h_curtain1', { ramp: P.olive, sp: 2.6, lip: 4, gap: 2, thick: 4, big: 'M', small: 'S3', rng: [.0, .62], edge: .5 });
  curtain('h_curtain2', { ramp: P.olive, sp: 4.2, lip: 3, gap: 3, thick: 3, big: 'M', small: 'S', rng: [.0, .66], edge: .5 });
  curtain('h_curtain3', { ramp: P.olive, sp: 3.2, lip: 4, gap: 3, thick: 5, big: 'M', small: 'S3', rng: [.0, .48], edge: .35 });

  // ---------- h_heart: a curtain of hearts ----------
  SG.reg('h_heart', (px, R, v, w, h) => {
    const ramp = P.olive, n = Math.round(w/4.4) + (v & 1), xs = spread(R, n, w, 2);
    lip(px, R, w, ramp, 4, [.15, .8]);
    xs.forEach((x, i) => { const e = Math.sin(Math.PI*(i + .5)/n);
      strand(px, R, { x0: x, len: Math.max(9, Math.round((.5 + .5*R.f()*e + .1*e)*(h - 1))), amp: R.r(.6, 1.4), gap: 3, thick: 3, skip: 3, leafAt: t => t < .5 ? 'H4' : 'H3', ramp, rng: [.0, .78] }); });
    anchor(px, w, ramp); finish(px, .5);
  });

  // ---------- l_mossroots: a moss clump with roots hanging under it ----------
  SG.reg('l_mossroots', (px, R, v, w, h) => {
    const cx = w/2 + R.r(-1, 1), cy = h*.36, B = P.bark, M = P.olive;
    const n = R.i(7, 9);
    for (let i = 0; i < n; i++) {
      const x0 = cx + (i - (n - 1)/2)*R.r(2, 2.8), y1 = h - 1 - R.i(0, 8), x1 = x0 + R.r(-3, 3), c = B[R.i(2, 3)];
      SG.curve(px, x0, cy + 1, x0 + R.r(-3, 3), (cy + y1)/2, x1, y1, c, 1);
      SG.curve(px, x0 + 1, cy + 1, x0 + R.r(-3, 3) + 1, (cy + y1)/2, x1 + 1, y1 - 2, B[1], 1);
    }
    // a back lobe, then several lit lumps so the clump is knobbly, not one dome
    SG.cluster(px, cx + 1, cy + 1, w*.44, h*.27, M, R, { bumps: 8, lo: .0, hi: .45 });
    for (let i = 0; i < 4; i++) SG.cluster(px, cx + (i - 1.5)*w*.2 + R.r(-1, 1), cy - 1 + R.r(-2, 2), w*R.r(.16, .22), h*R.r(.14, .2), M, R, { bumps: 4, lo: .15, hi: .75, dither: true });
    for (let i = 0; i < 4; i++) { const x = cx + R.r(-10, 10), y = cy + R.r(5, h*.55); SG.cluster(px, x, y, 2.2, 1.7, M, R, { bumps: 2, lo: .1, hi: .6 }); }
    SG.despeckle(px); finish(px, .45);
  });

  // ---------- w_tangle: crossing roots wrapped in moss ----------
  SG.reg('w_tangle', (px, R, v, w, h) => {
    const B = P.bark, M = P.olive, n = R.i(9, 11);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = [R.r(1, w - 2), R.r(h*.2, h - 2)], b = [R.r(1, w - 2), R.r(1, h - 2)];
      const c = [(a[0] + b[0])/2 + R.r(-9, 9), (a[1] + b[1])/2 + R.r(-7, 7)];
      SG.curve(px, a[0], a[1], c[0], c[1], b[0], b[1], B[R.i(2, 3)], 2);
      SG.curve(px, a[0], a[1] + 1, c[0], c[1] + 1, b[0], b[1] + 1, B[1], 1);
      pts.push(...SG.curvePts(a[0], a[1], c[0], c[1], b[0], b[1], 5).slice(1, 5));
    }
    const m = R.i(12, 15);
    for (let i = 0; i < m; i++) { const p = R.pick(pts); SG.cluster(px, p[0], p[1], R.r(2.5, 4.2), R.r(2, 3.2), M, R, { bumps: 3, lo: R.r(.0, .3), hi: .75, dither: R.chance(.4) }); }
    SG.despeckle(px); finish(px, .45);
  });

  // =====================================================================================
  // ---------- floor decals ----------
  // =====================================================================================
  const FM = P.fMoss, FC = P.fCrack, FL = P.fLeaf, FG = P.fGrass;
  // an irregular filled blob, each pixel colored from a 3 value ramp by light (upper left) plus a clumpy noise
  function patch(px, R, cx, cy, rx, ry, ramp, o = {}) {
    const p1 = R.r(0, 6.28), p2 = R.r(0, 6.28), p3 = R.r(0, 6.28), rough = o.rough === undefined ? .22 : o.rough, seed = R.i(1, 9999);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const dx = (x + .5 - cx)/rx, dy = (y + .5 - cy)/ry, rad = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const lim = 1 + rough*(.5*Math.sin(2*th + p1) + .35*Math.sin(3*th + p2) + .25*Math.sin(5*th + p3));
      if (rad > lim) continue;
      const n = vnoise(x, y, o.cell || 3, seed);
      if (o.holes && rad < lim - .25 && vnoise(x + 40, y, 2.6, seed + 3) < o.holes) continue;
      const t = clamp01(.5 - .22*(dx*.55 + dy*.8) + (n - .5)*(o.nz === undefined ? .7 : o.nz) - (rad > lim - .18 ? .12 : 0) + (o.bias || 0) + .1);
      px.set(x, y, SG.rampAt(ramp, t, x, y, !!o.dither));
    }
  }
  const lump = (px, R, x, y, r, ramp, lo, hi) => SG.cluster(px, x, y, r, r*.85, ramp, R, { bumps: 2, lo, hi, dither: true });

  SG.reg('f_moss1', (px, R, v, w, h) => {
    patch(px, R, w/2 + R.r(-.6, .6), h/2 + R.r(-.6, .6), w*R.r(.34, .42), h*R.r(.3, .4), FM, { rough: .28 });
    for (let i = 0; i < 2 + (v & 1); i++) lump(px, R, R.r(4, w - 4), R.r(4, h - 4), 2, FM, .5, 1);
    SG.despeckle(px);
  });
  SG.reg('f_moss2', (px, R, v, w, h) => {
    const k = 2 + (v & 1);
    for (let i = 0; i < k; i++) patch(px, R, w*(.28 + .44*i/(k - 1) ) + R.r(-1, 1), h/2 + R.r(-3, 3), w*R.r(.2, .28), h*R.r(.2, .3), FM, { rough: .3 });
    SG.despeckle(px);
  });
  SG.reg('f_mossmat', (px, R, v, w, h) => {
    patch(px, R, w/2, h/2, w*R.r(.4, .47), h*R.r(.38, .46), FM, { rough: .3, holes: .27 + .04*v, cell: 3.5 });
    for (let i = 0; i < 4; i++) lump(px, R, R.r(5, w - 5), R.r(5, h - 5), 2, FM, .55, 1);
    SG.despeckle(px);
  });

  // blades radiating from a point (a weed seen from above)
  function rosette(px, R, cx, cy, n, len, ramp, lo) {
    const a0 = R.r(0, 6.28);
    for (let i = 0; i < n; i++) { const a = a0 + i*6.283/n + R.r(-.3, .3), l = len*R.r(.7, 1.1), ex = cx + Math.cos(a)*l, ey = cy + Math.sin(a)*l;
      SG.line(px, cx, cy, ex, ey, ramp[1]);
      SG.line(px, cx + Math.cos(a)*l*.45, cy + Math.sin(a)*l*.45, ex, ey, ramp[(lo || 1) + (Math.cos(a)*-.55 + Math.sin(a)*-.8 > 0 ? 1 : 0)]); }
    SG.ellipse(px, cx, cy, 1.4, 1.4, () => ramp[2]);
  }
  SG.reg('f_weeds', (px, R, v, w, h) => {
    const k = R.i(3, 4);
    for (let i = 0; i < k; i++) rosette(px, R, R.r(5, w - 5), R.r(5, h - 5), R.i(5, 6), R.r(3.5, 5.5), FL, 1);
    for (let i = 0; i < 2; i++) lump(px, R, R.r(4, w - 4), R.r(4, h - 4), 2.2, FM, .2, .8);
    SG.despeckle(px);
  });

  SG.reg('f_crack', (px, R, v, w, h) => {
    // a meandering crack (dark) across, with a branch, moss and weeds along it
    const a = [R.r(1, 5), R.r(2, h - 3)], b = [w - R.r(1, 5), R.r(2, h - 3)], c = [w/2 + R.r(-4, 4), h/2 + R.r(-7, 7)];
    SG.curve(px, a[0], a[1], c[0], c[1], b[0], b[1], FC[0], 1);
    const q = SG.curvePts(a[0], a[1], c[0], c[1], b[0], b[1], 8);
    const br = q[R.i(3, 5)]; SG.curve(px, br[0], br[1], br[0] + R.r(-4, 4), br[1] + R.r(5, 8)*(R.chance(.5) ? 1 : -1), br[0] + R.r(-5, 5), br[1] + R.r(6, 10)*(R.chance(.5) ? 1 : -1), FC[0], 1);
    for (let i = 0; i < 3; i++) { const p = q[R.i(1, 7)]; lump(px, R, p[0], p[1], R.r(2, 3.2), FM, .25, 1); }
    for (let i = 0; i < 2; i++) { const p = q[R.i(2, 6)]; rosette(px, R, p[0], p[1] + R.r(-2, 2), 4, R.r(3, 4.5), FL, 1); }
    SG.despeckle(px);
  });

  // creeping stem with leaf pairs
  function creeper(px, R, x0, y0, x1, y1, bend, leafR, ramp, every, leafSz) {
    const cx = (x0 + x1)/2 + R.r(-bend, bend), cy = (y0 + y1)/2 + R.r(-bend, bend), pts = SG.curvePts(x0, y0, cx, cy, x1, y1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)/every));
    SG.curve(px, x0, y0, cx, cy, x1, y1, ramp[0], 1);
    pts.forEach((p, i) => { if (i === 0) return;
      const nx = pts[i - 1], ang = Math.atan2(p[1] - nx[1], p[0] - nx[0]), s = i % 2 ? 1 : -1, a2 = ang + s*R.r(1.0, 1.5);
      const lx = p[0] + Math.cos(a2)*leafSz*.8, ly = p[1] + Math.sin(a2)*leafSz*.8;
      SG.cluster(px, lx, ly, leafSz*R.r(.8, 1.1), leafSz*R.r(.6, .85), ramp, R, { bumps: 0, lo: .3, hi: 1 }); });
    return pts;
  }
  SG.reg('f_vine', (px, R, v, w, h) => {
    const p = creeper(px, R, R.r(2, 6), R.r(3, h - 4), w - R.r(2, 6), R.r(3, h - 4), 8, 0, FL, 3, 2.2);
    const m = p[R.i(2, p.length - 3)]; creeper(px, R, m[0], m[1], m[0] + R.r(-6, 6), R.chance(.5) ? 2 : h - 3, 4, 0, FL, 3, 2);
    for (let i = 0; i < 2; i++) lump(px, R, R.r(4, w - 4), R.r(4, h - 4), 2, FM, .3, .9);
    SG.despeckle(px);
  });
  SG.reg('f_ivy', (px, R, v, w, h) => {
    const p = creeper(px, R, R.r(2, 6), R.r(2, h - 3), w - R.r(2, 6), R.r(2, h - 3), 8, 0, FL, 2.4, 2.7);
    for (let i = 0; i < 2; i++) { const m = p[R.i(2, p.length - 3)]; creeper(px, R, m[0], m[1], m[0] + R.r(-7, 7), R.chance(.5) ? 2 : h - 3, 3, 0, FL, 2.4, 2.5); }
    SG.despeckle(px);
  });

  // a seam: a wobbling band of moss along a line, 1 to 4 pixels thick, with gaps
  function seamMoss(px, R, x0, y0, x1, y1, vert, seed, thick) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0)*i/n), y = Math.round(y0 + (y1 - y0)*i/n), nn = vnoise(i, 5, 3.4, seed), wd = Math.round(thick*(.35 + 1.1*nn)), off = Math.round((vnoise(i, 17, 5, seed + 1) - .5)*2);
      for (let k = 0; k < wd; k++) { const o = k - (wd >> 1) + off, X = vert ? x + o : x, Y = vert ? y : y + o;
        const t = k === 0 ? .72 : (k === wd - 1 ? .1 : .45); px.set(X, Y, SG.rampAt(FM, t + (nn - .5)*.3, X, Y, false)); } }
  }
  SG.reg('f_sprouts', (px, R, v, w, h) => {
    // sprouts along a tile seam: moss in the seam, tiny seedlings with two leaves
    const y = Math.round(h*.62 + R.r(-1, 1));
    seamMoss(px, R, 1, y, w - 2, y, false, 5 + v, 3);
    const k = R.i(4, 5);
    for (let i = 0; i < k; i++) { const x = Math.round(3 + (w - 6)*(i + R.f()*.5)/k), yy = y - R.i(0, 1), hh = R.i(2, 4), s = R.chance(.5) ? 1 : -1;
      for (let j = 0; j < hh; j++) px.set(x, yy - j, FL[j ? 1 : 0]);
      const ty = yy - hh;
      for (const d of [-1, 1]) { const c = d < 0 ? FL[2] : FL[1];
        px.set(x + d, ty, c); px.set(x + d*2, ty + (d*s > 0 ? 0 : 1), c); px.set(x + d*2, ty - (d*s > 0 ? 1 : 0), c); px.set(x + d, ty + 1, FL[0]); }
      px.set(x, ty, FL[2]); px.set(x, ty - 1, FL[2]); }
    SG.despeckle(px);
  });

  SG.reg('f_seam', (px, R, v, w, h) => {
    // moss growing along tile seams: a cross, a T or an L, with bulges and gaps
    const cx = Math.round(w/2 + R.r(-2, 2)), cy = Math.round(h/2 + R.r(-2, 2)), kind = v % 4, sd = 11 + v*3;
    seamMoss(px, R, 1, cy, w - 2, cy, false, sd, 4);
    if (kind === 0) seamMoss(px, R, cx, 1, cx, h - 2, true, sd + 1, 4);
    else if (kind === 1) seamMoss(px, R, cx, cy, cx, h - 2, true, sd + 1, 4);
    else if (kind === 2) seamMoss(px, R, cx, 1, cx, cy, true, sd + 1, 4);
    else seamMoss(px, R, cx, 1, cx, h - 2, true, sd + 1, 3);
    for (let i = 0; i < 3; i++) lump(px, R, R.r(3, w - 3), cy + R.r(-3, 3), 2.4, FM, .4, 1);
    SG.despeckle(px);
  });

  SG.reg('f_leaves', (px, R, v, w, h) => {
    // fallen leaves lying about: small ovals with a vein, tilted
    const n = R.i(10, 13), placed = [];
    for (let i = 0; i < n; i++) {
      const x = R.r(3, w - 3), y = R.r(3, h - 3); if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < 4.6)) continue; placed.push([x, y]);
      const a = R.r(0, 3.14), len = R.r(2.8, 4), tone = R.r(.45, 1);
      for (let k = -len; k <= len; k += .5) { const t = k/len, wd = (1 - t*t)*1.5 + .2;
        for (let m = -wd; m <= wd; m += .5) { const X = x + Math.cos(a)*k - Math.sin(a)*m, Y = y + Math.sin(a)*k + Math.cos(a)*m;
          px.set(X, Y, SG.rampAt(FL, clamp01(tone + (-(X - x)*.3 - (Y - y)*.45)*.3), X, Y, false)); } }
      for (let k = -len + .5; k <= len - .5; k += .5) px.set(x + Math.cos(a)*k, y + Math.sin(a)*k, FL[1]);
    }
    SG.despeckle(px);
  });

  // grass fringe along an edge: the base is the bottom, solid; blades rise from it in tufts
  const fringe = (kind, tall, spiky) => SG.reg(kind, (px, R, v, w, h) => {
    const base = h - 2;
    for (let x = 0; x < w; x++) { px.set(x, h - 1, FG[1]); px.set(x, base, FG[2]); }
    let x = 0;
    while (x < w) {
      const bw = spiky ? 1 : R.i(1, 3), ht = Math.max(2, Math.round(R.r(.4, 1)*tall*(.65 + .5*vnoise(x, 0, 7, v + 4))));
      const lean = R.r(-1.2, 1.2);
      for (let b = 0; b < bw && x + b < w; b++) { const hb = b === 1 ? ht - 1 : ht;
        for (let k = 0; k < hb; k++) { const X = Math.round(x + b + lean*k/hb*1.6), Y = base - 1 - k; if (Y < 0) continue;
          const t = k/hb, lite = (b === 0 || spiky) ? 0 : -1; px.set(X, Y, t > .7 ? FG[3] : (t > .35 ? FG[2] : FG[1])); } }
      x += bw + (R.chance(spiky ? .15 : .35) ? 1 : 0);
    }
    for (let x2 = 0; x2 < w; x2++) if (px.has(x2, base - 1) && px.get(x2, base - 1) === FG[1] && (x2 & 1)) px.set(x2, base - 1, FG[0]);
    SG.despeckle(px);
  });
  fringe('f_grass1', 6, false);
  fringe('f_grass2', 7, true);
})();
