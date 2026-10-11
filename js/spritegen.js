// Neon Terrarium: sprites drawn in code (procedural foliage plan, items 2 to 4). The plants, grass, vines, laundry and floor decals used to be Retro Diffusion pictures (AI art, shrunk to true pixel size);
// these are drawn at load from seeds, in the same pixel-art style, and fill the sprite atlas (sprites.js) instead of the PNGs. This file is the core: the pixel buffer, the seeded random numbers, the palette,
// the drawing primitives and the registry. The families (spritegen_*.js) register one generator per kind. Nothing here touches the game or three.js, so a page with just these scripts can draw and show them
// (tools/procfol/sprites_dump.py).
//
// STYLE RULES (every generator follows them; the owner judges by eye against the old sprites):
//  * True pixel size: one sprite pixel is one screen pixel at the default 480p zoom (PX = 18 sprite pixels a world unit). No anti-aliasing, no blur, no half-transparent pixel (alpha is 0 or 255).
//  * Light from the upper left. Each material has a ramp of 3 to 5 values, hue-shifted: shadows cooler and more saturated, highlights warmer. No pure black, no pure gray.
//  * Silhouette first: a kind reads as a flat dark shape at 1x. Clusters of leaves, not single pixels; no isolated pixel except a deliberate highlight (a flower, a dew spot).
//  * Outlines: a darker shade of the local color, only where the shape meets empty space (selective: bottom and right, `edge(px, 'br')`, or all round as the old sprites had them, `edge(px, 'all')`).
//    The shape keeps its size: the edge is recolored, nothing is added outside.
//  * Dithering only in a few places, in regular 2 x 2 patterns (`dither2`), never random speckle.
//  * Colors from the shared foliage palette below, sampled from the old sprites (k-means over their pixels: tools/procfol/palette.py), so the city's tone does not shift; the looks system's grade and
//    palette blend work on top as before.
//  * Variants: a kind gets SG.COUNT[kind] seeds side by side in the atlas (SG.FCOUNT for floor decals); a plant picks its variant from a hash of its position (sprites.js), never from fxRand or Math.random.
//
// A generator is `function (px, R, v, w, h, SG)`: px the pixel buffer of exactly w x h (the kind's size, unchanged), R a seeded random stream (R.f(), R.r(a, b), R.i(a, b), R.pick(a), R.chance(p)), v the
// variant number. Drawing the same (kind, variant) twice gives the same pixels. No generator may use Math.random.
const SG = (() => {
  const SG = { VERSION: 1, gens: {} };
  // ---------- colors: 0xRRGGBB integers ----------
  const hex = s => parseInt(s.slice(1), 16);
  const rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const pack = (r, g, b) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
  const mix = (a, b, t) => { const p = rgb(a), q = rgb(b); return pack(p[0] + (q[0] - p[0])*t, p[1] + (q[1] - p[1])*t, p[2] + (q[2] - p[2])*t); };
  // a darker (t < 0) or lighter (t > 0) shade of c, hue-shifted: darker goes cooler and more saturated, lighter goes warmer
  const shade = (c, t) => { const [r, g, b] = rgb(c); const L = (r + g + b)/3;
    if (t < 0){ const k = -t; return pack(r*(1 - k*.62) - 3*k, g*(1 - k*.5), b*(1 - k*.34) + 6*k + (L < 90 ? 0 : 4*k)); }
    return pack(r + (255 - r)*t*.62 + 8*t, g + (255 - g)*t*.5 + 4*t, b + (255 - b)*t*.34 - 5*t); };
  SG.hex = hex; SG.rgb = rgb; SG.pack = pack; SG.mix = mix; SG.shade = shade;
  // ---------- the shared foliage palette (dark -> light ramps; from the old sprites, hue-shifted where the old ones were flat) ----------
  const ramp = (...l) => l.map(hex);
  SG.PAL = {
    olive:  ramp('#122010', '#223a1c', '#4e722e', '#6b8a3a', '#8fa04a', '#b2bf5a'),   // ground cover, hanging greenery, ivy (the old sprites' main green)
    leaf:   ramp('#1e472a', '#264e1e', '#39762b', '#5d932e', '#7ab747', '#9acd58'),   // bushes
    bright: ramp('#033a32', '#162d09', '#20841e', '#326c19', '#499c1f', '#7cc83c'),   // pothos, bright climbers
    cool:   ramp('#27323b', '#30504d', '#3c714c', '#5f9942', '#78cc76', '#a8e090'),   // grass tufts, reeds
    fern:   ramp('#1f4a35', '#368545', '#51a754', '#64b665', '#78cc76', '#a0dc8c'),
    pine:   ramp('#06240f', '#0c4a1c', '#16702a', '#2f9a38', '#58b94a'),              // bonsai pads
    bamboo: ramp('#095719', '#2a6d24', '#367625', '#529331', '#6baf3c', '#9cd462'),
    moss:   ramp('#00360b', '#0a611a', '#2f8a26', '#5b9439', '#8cc060'),
    pot:    ramp('#772c01', '#a64209', '#c95f22', '#e08a4a'),
    bark:   ramp('#1c140a', '#2c2b09', '#4a3a1c', '#6b5230'),
    pink:   ramp('#b84a78', '#ff96be', '#ffd0e0'),
    yellow: ramp('#c08a16', '#ffd23f', '#fff2a0'),
    white:  ramp('#b8c4d8', '#eef4ff'),
    violet: ramp('#6a4ab0', '#b18cff', '#dccaff'),
    red:    ramp('#a83a30', '#e0584a', '#ffa090'),
    // flat floor decals: narrow middle values (they take the scene's light like the paving)
    fMoss:  ramp('#1d3015', '#3b5621', '#59752f'), fCrack: ramp('#233519', '#4e6829', '#656f57'), fGrass: ramp('#06220f', '#103c11', '#214810', '#305312'), fLeaf: ramp('#1f2f14', '#3a5424', '#53762c'),
    // cloth (from the old laundry)
    clothBlue: ramp('#91b6ee', '#b3cbfe'), clothButter: ramp('#d9c670', '#fde899'), clothRose: ramp('#b37589', '#f4a6b3'), clothCream: ramp('#dee4d4', '#fdedd2'), clothJeans: ramp('#517092', '#5e819e', '#8cacb8'),
    clothSage: ramp('#8aa07a', '#b4c8a0'), clothLilac: ramp('#a890d8', '#cdadf8'), clothPeach: ramp('#d89a7e', '#fdbfa4'), clothShirt: ramp('#7a9cb6', '#a8c4cf'), clothSock: ramp('#c4be94', '#fbdcb6'),
  };
  // ---------- the pixel buffer: RGBA, alpha 0 or 255 ----------
  class Px {
    constructor(w, h){ this.w = w; this.h = h; this.d = new Uint8ClampedArray(w*h*4); this.n = 0; }
    inside(x, y){ return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    set(x, y, c){ x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const o = (y*this.w + x)*4; if (!this.d[o + 3]) this.n++; this.d[o] = (c >> 16) & 255; this.d[o + 1] = (c >> 8) & 255; this.d[o + 2] = c & 255; this.d[o + 3] = 255; }
    clear(x, y){ if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const o = (y*this.w + x)*4; if (this.d[o + 3]){ this.d[o + 3] = 0; this.n--; } }
    has(x, y){ return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y*this.w + x)*4 + 3] > 0; }
    get(x, y){ if (!this.has(x, y)) return -1; const o = (y*this.w + x)*4; return (this.d[o] << 16) | (this.d[o + 1] << 8) | this.d[o + 2]; }
  }
  SG.Px = Px;
  // ---------- seeded random numbers (never Math.random) ----------
  function mulberry(a){ return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  SG.rng = seed => { const f = mulberry(seed >>> 0);
    return { f, r: (a, b) => a + (b - a)*f(), i: (a, b) => a + Math.floor(f()*(b - a + 1)), pick: l => l[Math.floor(f()*l.length)], chance: p => f() < p, gauss: () => (f() + f() + f() - 1.5)/.75 }; };
  SG.seedOf = (kind, v) => (strHash(kind) ^ Math.imul(v + 1, 0x9E3779B1) ^ Math.imul(SG.VERSION, 0x85EBCA6B)) >>> 0;
  // ---------- drawing primitives ----------
  // light from the upper left: the direction a surface normal is compared with
  const LX = -.55, LY = -.8;
  SG.light = { x: LX, y: LY };
  // a value 0..1 from a normal (nx, ny) on a round form, plus a little of the form's height: 1 lit, 0 in shadow
  const lit = (nx, ny) => { const nz = Math.sqrt(Math.max(0, 1 - nx*nx - ny*ny)); return Math.max(0, Math.min(1, .5 + .5*(nx*LX + ny*LY) + .25*(nz - .5))); };
  SG.lit = lit;
  // 2 x 2 ordered dither: true when pixel (x, y) is "on" at level 0..4 (0 never, 4 always, 2 a checkerboard): regular, never speckle
  SG.dither2 = (x, y, level) => { const m = [[0, 2], [3, 1]][y & 1][x & 1]; return level > m; };
  // pick a color of a ramp at t (0 dark .. 1 light); `d` (0..1) pushes through a dither between two neighbouring values in a band
  SG.rampAt = (r, t, x, y, dith) => { const k = (r.length - 1)*Math.max(0, Math.min(.9999, t)), i = Math.floor(k), f = k - i; return (dith && SG.dither2(x, y, Math.round(f*4))) ? r[i + 1] : r[i]; };
  // a filled ellipse, each pixel colored by fn(x, y, nx, ny, edgeDist) (return a color, or -1 to skip)
  SG.ellipse = (px, cx, cy, rx, ry, fn) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++){
      const nx = (x + .5 - cx)/rx, ny = (y + .5 - cy)/ry, d = nx*nx + ny*ny; if (d > 1) continue;
      const c = fn(x, y, nx, ny, 1 - Math.sqrt(d)); if (c >= 0) px.set(x, y, c); } };
  // a shaded round cluster of leaves: `bumps` overlapping lobes (a scalloped edge), lit from the upper left on the ramp, a dither only on the band boundaries when dith is set
  SG.cluster = (px, cx, cy, rx, ry, rampc, R, o = {}) => {
    const bumps = o.bumps || 5, lobes = [[cx, cy, rx, ry]];
    for (let k = 0; k < bumps; k++){ const a = R.r(0, 6.283), rr = R.r(.45, .75); lobes.push([cx + Math.cos(a)*rx*rr, cy + Math.sin(a)*ry*rr*.85, rx*R.r(.35, .55), ry*R.r(.35, .55)]); }
    const lo = o.lo === undefined ? 0 : o.lo, hi = o.hi === undefined ? 1 : o.hi;
    for (const [lx, ly, lrx, lry] of lobes) SG.ellipse(px, lx, ly, Math.max(1, lrx), Math.max(1, lry), (x, y, nx, ny) => {
      // the lobe's own light; the cluster's overall light too, so lobes read as parts of one canopy
      const t = lit(nx, ny)*.6 + lit((x + .5 - cx)/rx, (y + .5 - cy)/ry)*.4;
      return SG.rampAt(rampc, lo + (hi - lo)*t, x, y, o.dither); });
  };
  // a line (Bresenham), one value, optional width in pixels (a plus-shaped brush for 2)
  SG.line = (px, x0, y0, x1, y1, c, wd = 1) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;){ px.set(x0, y0, c); if (wd > 1){ px.set(x0 + 1, y0, c); } if (x0 === x1 && y0 === y1) break; const e2 = 2*e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } } };
  // a quadratic curve from (x0, y0) through the control point (cx, cy) to (x1, y1): a polyline of Bresenham pieces
  SG.curve = (px, x0, y0, cx, cy, x1, y1, c, wd = 1) => { let lx = x0, ly = y0; const n = Math.max(6, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 1; k <= n; k++){ const t = k/n, u = 1 - t, x = u*u*x0 + 2*u*t*cx + t*t*x1, y = u*u*y0 + 2*u*t*cy + t*t*y1; SG.line(px, lx, ly, x, y, c, wd); lx = x; ly = y; } };
  // the points of such a curve (to hang leaves on it)
  SG.curvePts = (x0, y0, cx, cy, x1, y1, n) => { const o = []; for (let k = 0; k <= n; k++){ const t = k/n, u = 1 - t; o.push([u*u*x0 + 2*u*t*cx + t*t*x1, u*u*y0 + 2*u*t*cy + t*t*y1]); } return o; };
  // selective outline: every opaque pixel with empty space on the chosen sides is recolored to a darker shade of itself (sides: 'br' bottom and right, 'all', 'b' bottom only, 'bl', 'r')
  SG.edge = (px, sides = 'br', amount = .5) => {
    const pts = []; const has = (x, y) => px.has(x, y);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++){ if (!has(x, y)) continue;
      const e = (sides === 'all' && (!has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1)))
        || (sides.includes('b') && !has(x, y + 1)) || (sides.includes('r') && !has(x + 1, y)) || (sides.includes('l') && !has(x - 1, y)) || (sides.includes('t') && !has(x, y - 1));
      if (e) pts.push(x, y); }
    for (let k = 0; k < pts.length; k += 2) px.set(pts[k], pts[k + 1], shade(px.get(pts[k], pts[k + 1]), -amount));
  };
  // remove isolated pixels (no neighbour in the 4 directions): the style rule, applied after drawing
  SG.despeckle = px => { const kill = []; for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (px.has(x, y) && !px.has(x - 1, y) && !px.has(x + 1, y) && !px.has(x, y - 1) && !px.has(x, y + 1)) kill.push(x, y); for (let k = 0; k < kill.length; k += 2) px.clear(kill[k], kill[k + 1]); };
  // ---------- which kinds are drawn in code, and how many variants each has (a plain table: the plot worker reads it to lay out the floor decals' uvs, and draws nothing) ----------
  // Kinds not listed keep one slot and their picture (signs and glyphs are already drawn in code by sprites.js). Sizes and anchors stay in sprites.js (SPR, FLOOR_SPR) and do not change.
  SG.COUNT = {}; SG.FCOUNT = {};
  (function(){ const set = (t, list, n) => { for (const k of list) t[k] = n; };
    set(SG.COUNT, ['gt0','gt1','gt2','gt3','gt4','gt5','gt6','gt7','gt8','gt9'], 8);
    set(SG.COUNT, ['g_clover','g_cover','g_spread1','g_spread2','g_moss2','moss','g_flowers','fern','g_fern2','g_fern3','bush','bushFlower','bonsai','bamboo','succulent'], 6);
    set(SG.COUNT, ['vines','pothos','h_ivy','h_vine3','h_curtain1','h_curtain2','h_curtain3','h_heart','l_mossroots','w_tangle'], 4);
    set(SG.COUNT, ['l_tee_blue','l_tee_peach','l_tee_rose','l_tee_sage','l_tee_butter','l_tee_lilac','l_jeans','l_socks','l_towel_cream','l_towel_green','l_shirt_pink','l_shirt_blue'], 3);
    SG.COUNT.grass = 1; SG.COUNT.grassFar = 1;   // (the lawn tile sheet, 48 x 16: spritegen_lawn.js)
    set(SG.FCOUNT, ['f_moss1','f_moss2','f_weeds','f_crack','f_vine','f_mossmat','f_sprouts','f_seam','f_ivy','f_leaves','f_grass1','f_grass2'], 4); })();
  // the variant of a thing at a world position: a hash of the position, never a random draw (so the same plots come out whatever the variants are)
  SG.vAt = (n, x, y, z) => { if (n < 2 || self.__OLD_SPRITES) return 0;   // (the old pictures: variant 0, where the single picture was)
   
    let h = Math.imul(Math.round(x*20) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y*20) | 0, 0x165667b1) ^ Math.imul(Math.round(z*20) | 0, 0x9E3779B1);
    h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; return (h >>> 0) % n; };
  // ---------- registry ----------
  // SG.reg(kind, fn): the generator of one kind (its variant count is in SG.COUNT). A kind with no generator keeps its picture in assets/ (sprites.js loads it).
  SG.reg = (kind, fn) => { SG.gens[kind] = fn; };
  SG.has = kind => !!SG.gens[kind];
  // the pixels of one kind and variant, w x h; the buffer is cleared of anything outside it by construction
  SG.draw = (kind, w, h, v = 0) => { const px = new Px(w, h), R = SG.rng(SG.seedOf(kind, v)); SG.gens[kind](px, R, v, w, h, SG); return px; };
  // into a canvas 2d context at (x, y)
  SG.blit = (g, px, x, y) => { g.putImageData(new ImageData(px.d, px.w, px.h), x, y); };
  return SG;
})();
