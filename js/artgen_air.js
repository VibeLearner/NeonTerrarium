// Neon Terrarium: the six big holograms of the air-filter tower's hack cycle, drawn in code (procedural art plan, item 7, first half). Runs after artgen.js and artgen_tools.js, shares their scope.
// Three pairs, a clean corporate ad and the hacked version that takes it over: Caelum-Sol pure air / "WE HAVE A RIGHT TO BREATHE FOR FREE", Aether-Vane Platform 9 / "THE SKY BELONGS TO NO ONE",
// Synth Corp security / "BIG BROTHER IS WATCHING". The boards are shown additive (dark is see-through), so the ground stays near black and the letters are thick (2 px or more, the scanlines
// eat every other row). The corporate side is clean and ordered; the hacked side is ragged: brush lettering, red and cyan splits, torn rows. A fixed seed in, the same pixels out.
(() => {
  const NAVY = '#050b20', CY = '#3ff0ff', CYD = '#17a6cc', GOLD = '#ffd23c', ORG = '#ff9a2a', RED = '#ff3a4c', REDD = '#b01c34', ICE = '#d6f6ff', BLU = '#6fb6e8', BLD = '#2b5fa0';
  const fr = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const bg = (g, w, h) => fr(g, NAVY, 0, 0, w, h);
  const T = (g, s, cx, y, font, sc, col, o = {}) => ART.text(g, s, cx, y, font, Object.assign({ color: col, scale: sc, align: 'center' }, o));
  const box = (g, x, y, w, h, t, c) => { fr(g, c, x, y, w, t); fr(g, c, x, y + h - t, w, t); fr(g, c, x, y, t, h); fr(g, c, x + w - t, y, t, h); };
  // a rule of dots (d wide, every 2d)
  const dots = (g, x0, x1, y, d, c) => { for (let x = x0; x + d <= x1; x += d*2) fr(g, c, x, y, d, d); };
  // corner brackets: an L of arm length a, thickness t, at each corner of the rectangle
  const brackets = (g, x, y, w, h, a, t, c) => { for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    fr(g, c, sx > 0 ? px : px - a, sy > 0 ? py : py - t, a, t); fr(g, c, sx > 0 ? px : px - t, sy > 0 ? py : py - a, t, a); } };
  // a four-point sparkle, arm r
  const spark = (g, x, y, r, c, c2) => { fr(g, c, x - r, y - 1, 2*r + 2, 2); fr(g, c, x - 1, y - r, 2, 2*r + 2); fr(g, c2 || c, x - 2, y - 2, 4, 4); fr(g, c, x - 1, y - 1, 2, 2);
    fr(g, c, x - r/2 - 1, y - r/2 - 1, 2, 2); fr(g, c, x + r/2, y + r/2, 2, 2); fr(g, c, x + r/2, y - r/2 - 1, 2, 2); fr(g, c, x - r/2 - 1, y + r/2, 2, 2); };
  const hexPts = (cx, cy, r) => { const p = []; for (let k = 0; k < 6; k++){ const a = -Math.PI/2 + k*Math.PI/3; p.push([cx + Math.cos(a)*r, cy + Math.sin(a)*r]); } return p; };
  const sch = (hot, acc) => ({ hot: parseInt(hot.slice(1), 16), accent: parseInt(acc.slice(1), 16), board: 0x050b20 });
  const S_GOLD = sch(GOLD, ORG), S_CY = sch(CY, CYD), S_RED = sch(RED, REDD), S_ICE = sch(ICE, BLU);
  const glow = (g, m, s, ox, oy) => ART.paintMask(g, m, s, ox, oy, { halo: false });
  // glitch: torn rows copied sideways (the board's own pixels), and bright blocks
  const tear = (g, x0, x1, R, n, y0, y1, maxS) => { for (let i = 0; i < n; i++){ const y = R.i(y0, y1), hh = R.i(2, 5), s = R.i(-maxS, maxS) || maxS; g.drawImage(g.canvas, x0, y, x1 - x0, hh, x0 + s, y, x1 - x0, hh); } };
  const blocks = (g, R, n, x0, y0, x1, y1, cols) => { for (let i = 0; i < n; i++){ const bw = R.i(6, 30), bh = R.i(2, 5); fr(g, R.pick(cols), R.i(x0, x1 - bw), R.i(y0, y1 - bh), bw, bh); } };
  // the hacked frame: two offset rectangles (cyan up left, red down right) with gaps torn out of them
  const hackFrame = (g, w, h, R) => {
    box(g, 8, 8, w - 16, h - 16, 3, CY); box(g, 12, 12, w - 20, h - 20, 3, RED);
    for (let i = 0; i < 9; i++){ const hor = R.chance(.5), len = R.i(14, 46); const x = R.i(14, w - 60), y = R.i(14, h - 60);
      if (hor){ const yy = R.chance(.5) ? 8 : h - 14; fr(g, NAVY, x, yy, len, 3); } else { const xx = R.chance(.5) ? 8 : w - 14; fr(g, NAVY, xx, y, 3, len); } }
    blocks(g, R, 12, 4, 4, w - 4, h - 4, [CY, RED, CY, RED, ORG]); };
  // brush lettering: the bold font sheared by row, rows tipped, with streaks and drips, one pass in one color; the same seed gives the same shape for every pass
  const brush = (g, str, cx, y, sc, col, seed, o = {}) => {
    const R = SG.rng(seed), fn = o.font || 'bold', F = ART.FONTS[fn], sk = o.skew === undefined ? .32 : o.skew, w = ART.textW(str, fn, { scale: sc }) + Math.round(6*sk)*sc, fat = o.fat === undefined ? 1 : o.fat, dr = o.drip === undefined ? .1 : o.drip;
    let x = Math.round(cx - w/2) + (o.dx || 0); const yy = y + (o.dy || 0); g.fillStyle = col;
    for (const ch of str){ const gl = F[ch] || F['?'];
      gl.r.forEach((row, ry) => { const sh = Math.round((6 - ry)*sk)*sc; for (let rx = 0; rx < row.length; rx++){ if (row[rx] !== '1') continue; g.fillRect(x + rx*sc + sh - (fat >> 1), yy + ry*sc - (fat >> 1), sc + fat, sc + fat);
        if (ry === 6 && R.chance(dr)){ const dl = R.i(2, 6)*sc >> 1; g.fillRect(x + rx*sc + sh + (sc >> 1) - 1, yy + 7*sc, 3, dl); }
        if (sk && (rx === row.length - 1 || row[rx + 1] !== '1') && R.chance(.05)) g.fillRect(x + (rx + 1)*sc + sh, yy + ry*sc, R.i(2, 4)*sc, 3); } });
      x += (gl.w + 1)*sc; } };
  // brush lettering with the red split behind and the cyan on top
  const brushSplit = (g, str, cx, y, sc, seed, o = {}) => { brush(g, str, cx, y, sc, RED, seed, Object.assign({}, o, { dx: 4, dy: 2 })); brush(g, str, cx, y, sc, o.col || CY, seed, o); };
  // the isometric filter stack: diamonds of a slab pile in a mask (top face with a grille)
  const filterStack = (m, cx, cy, hw, hh, n, gap, wd) => {
    for (let k = n - 1; k >= 0; k--){ const y = cy + k*gap;
      m.poly([[cx - hw, y], [cx, y - hh], [cx + hw, y], [cx, y + hh]], true, wd, 1);
      if (k < n - 1){ m.line(cx - hw, y, cx - hw, y + gap, wd, 1); m.line(cx + hw, y, cx + hw, y + gap, wd, 1); m.line(cx, y + hh, cx, y + hh + gap, wd, 1); } }
    for (let i = -2; i <= 2; i++){ if (!i) continue; const f = i/3; m.line(cx - hw*(1 - Math.abs(f)) + hw*f, cy - hh*(1 - Math.abs(f))*0 + (-hh*(1 - Math.abs(f)))*0 + hh*f*-0, cx, cy, 0, 0); }
    m.line(cx - hw*.5, cy - hh*.5, cx + hw*.5, cy + hh*.5, wd > 2 ? 2 : 1, 2); m.line(cx + hw*.5, cy - hh*.5, cx - hw*.5, cy + hh*.5, wd > 2 ? 2 : 1, 2); };
  // a shield into a mask: top edge flat with a notch, the point at the bottom
  const shield = (m, cx, cy, r, wd, v = 1) => m.poly([[cx - r, cy - r*.8], [cx, cy - r], [cx + r, cy - r*.8], [cx + r, cy + r*.1], [cx + r*.5, cy + r*.65], [cx, cy + r*1.05], [cx - r*.5, cy + r*.65], [cx - r, cy + r*.1]], true, wd, v);
  const hash = (m, cx, cy, r) => 0;
  // a cloud outline filled with the board color, into a mask
  const cloud = (m, cx, cy, s, wd) => { for (const [dx, dy, rx, ry] of [[-26, 2, 14, 10], [-8, -6, 17, 14], [12, -3, 16, 12], [28, 4, 13, 9]]) m.ellipse(cx + dx*s, cy + dy*s, rx*s, ry*s, wd, 1, Math.PI, Math.PI*2);
    m.line(cx - 40*s, cy + 12*s, cx + 41*s, cy + 12*s, wd, 1); };

  // ======================= 1. Caelum-Sol: pure air (clean, gold and cyan) =======================
  ART.reg('holo_pureair', (g, w, h) => {
    bg(g, w, h);
    box(g, 6, 6, w - 12, h - 12, 3, CY); box(g, 14, 14, w - 28, h - 28, 2, GOLD);
    for (const [x, y] of [[4, 4], [w - 12, 4], [4, h - 12], [w - 12, h - 12]]) fr(g, GOLD, x, y, 8, 8);
    for (const y of [h/2 - 3]) { fr(g, CY, 12, y, 6, 6); fr(g, CY, w - 18, y, 6, 6); }
    // the logo: a gold hexagon around a stack of cyan filter slabs, with sparkles
    const m = new ART.Mask(120, 112); m.poly(hexPts(60, 56, 50), true, 3, 1); m.poly(hexPts(60, 56, 42), true, 1, 2); glow(g, m, S_GOLD, 196, 36);
    const f = new ART.Mask(120, 112); filterStack(f, 60, 40, 28, 12, 3, 12, 2); glow(g, f, S_CY, 196, 36);
    spark(g, 318, 62, 11, GOLD, ICE); spark(g, 340, 96, 6, CY); spark(g, 178, 112, 5, GOLD);
    T(g, 'CAELUM-SOL', 256, 160, 'bold', 5, GOLD, { shadow: { color: '#a85a10', dx: 3, dy: 3 } });
    T(g, 'HAS THE PUREST', 256, 204, '5x7', 4, CY); T(g, 'FILTRATION SYSTEM', 256, 240, '5x7', 4, ICE);
    dots(g, 150, 360, 284, 3, GOLD); fr(g, ORG, 250, 281, 12, 8);
    T(g, 'PURE AIR * LUXURY FILTRATION * CERTIFIED', 256, 298, '3x5', 2, GOLD);
    spark(g, 118, 338, 7, CY); spark(g, 394, 338, 7, CY);
    for (let i = 0; i < 17; i++){ const hh = [2, 4, 8, 12, 6, 14, 8, 4, 10, 16, 8, 6, 12, 5, 8, 3, 2][i]; fr(g, CYD, 222 + i*4, 340 - hh/2, 3, hh); }
  }, { defer: true });

  // ======================= 2. hacked: WE HAVE A RIGHT TO BREATHE FOR FREE =======================
  ART.reg('holo_freeair', (g, w, h) => {
    bg(g, w, h); const R = SG.rng(0x6a1d);
    for (let y = 22; y < h - 22; y += 6) fr(g, '#071433', 18, y, w - 36, 2);
    hackFrame(g, w, h, R); tear(g, 16, w - 16, R, 10, 30, h - 40, 8);
    const f = new ART.Mask(160, 120); filterStack(f, 80, 44, 56, 24, 3, 20, 3); glow(g, f, S_CY, 176, 28);
    const x = new ART.Mask(160, 130); x.line(14, 4, 146, 116, 8, 1); x.line(146, 4, 14, 116, 8, 1); ART.paintMask(g, x, S_RED, 172, 24, { halo: false, edge: false });
    for (let i = 0; i < 30; i++){ const a = R.r(0, 6.28), d = R.r(90, 150); const bs = R.i(3, 7); fr(g, R.chance(.6) ? RED : CY, 256 + Math.cos(a)*d*1.5, 100 + Math.sin(a)*d*.55, bs, bs); }
    brushSplit(g, 'WE HAVE A RIGHT', 256, 212, 4, 21, { skew: .12, font: '5x7', drip: .04, fat: 2 });
    brush(g, 'TO BREATHE FOR FREE', 256, 262, 4, REDD, 22, { skew: .12, font: '5x7', dx: 4, dy: 3, drip: .04, fat: 2 }); brush(g, 'TO BREATHE FOR FREE', 256, 262, 4, RED, 22, { skew: .12, font: '5x7', drip: .04, fat: 2 });
    blocks(g, R, 8, 30, 308, w - 30, 330, [CY, RED]);
  }, { defer: true });

  // ======================= 3. Aether-Vane: Platform 9 recruitment (clean, cyan and gold) =======================
  const ship = (g, cx, y, u, flip, mid) => {
    const X = (x, w) => flip ? cx - (x + w)*u : cx + x*u, r = (x, yy, w, hh, c) => fr(g, c, X(x, w), y + yy*u, w*u, hh*u);
    if (mid){   // the front view: a tall tower on two pods
      r(-1, -6, 2, 5, ICE); r(-3, -2, 6, 1, CY); r(-6, 0, 12, 4, ICE); r(-4, 1, 8, 1, BLD); r(-9, 4, 18, 4, BLU); r(-7, 5, 14, 1, CY); r(-12, 8, 24, 5, BLU); r(-12, 11, 24, 2, BLD);
      r(-5, 13, 3, 2, ORG); r(2, 13, 3, 2, ORG); r(-15, 7, 3, 7, ICE); r(12, 7, 3, 7, ICE); r(-15, 12, 3, 2, ORG); r(12, 12, 3, 2, ORG); r(-2, 8, 4, 3, CY);
    } else {    // the side view facing right: cabin, hull, an engine glow behind
      r(5, -7, 1, 6, ICE); r(2, -3, 7, 1, CY); r(3, -1, 11, 5, ICE); r(5, 0, 7, 1, BLD); r(-2, 4, 26, 3, ICE); r(-4, 7, 28, 3, BLU); r(-4, 9, 24, 3, BLD); r(0, 12, 16, 2, BLD);
      r(20, 5, 7, 3, BLU); r(24, 7, 4, 2, BLD); r(-8, 5, 4, 5, ORG); r(-6, 6, 2, 3, GOLD); r(8, 7, 8, 1, CY); r(-4, 5, 2, 1, CY); r(-2, 2, 2, 2, ICE); }
  };
  ART.reg('holo_aether', (g, w, h) => {
    bg(g, w, h);
    box(g, 8, 8, w - 16, h - 16, 3, CY); box(g, 16, 16, w - 32, h - 32, 1, CYD); brackets(g, 4, 4, w - 8, h - 8, 34, 6, GOLD);
    for (const y of [150, 270]) { fr(g, CYD, 12, y, 4, 24); fr(g, CYD, w - 16, y, 4, 24); }
    spark(g, 232, 44, 4, GOLD); spark(g, 256, 40, 5, GOLD); spark(g, 280, 44, 4, GOLD);
    T(g, 'AETHER-VANE', 256, 62, 'bold', 5, GOLD, { shadow: { color: '#a85a10', dx: 3, dy: 3 } });
    T(g, 'CORPORATE RECRUITMENT - PLATFORM 9', 256, 108, '5x7', 2, CY);
    T(g, 'JOIN AETHER-VANE TODAY!', 256, 142, '5x7', 3, ORG);
    T(g, 'WORK ON PLATFORM 9 ALONGSIDE THE', 256, 184, '5x7', 2, ICE); T(g, 'FIRST EVER KITER COMMUNITY', 256, 204, '5x7', 2, ICE);
    fr(g, CY, 150, 232, 212, 3); fr(g, GOLD, 236, 230, 40, 7);
    ship(g, 76, 270, 4, false, false); ship(g, 256, 262, 4, false, true); ship(g, 436, 270, 4, true, false);
    fr(g, CYD, 40, 344, 432, 2);
    const m = new ART.Mask(364, 44); m.poly([[14, 0], [350, 0], [363, 14], [363, 30], [350, 43], [14, 43], [0, 30], [0, 14]], true, 3, 1); ART.paintMask(g, m, S_GOLD, 74, 360, { halo: false });
    T(g, 'JOIN NOW * OPEN RECRUITMENT', 256, 375, '5x7', 2, ICE);
  }, { defer: true });

  // ======================= 4. hacked: THE SKY BELONGS TO NO ONE =======================
  ART.reg('holo_sky', (g, w, h) => {
    bg(g, w, h); const R = SG.rng(0x5c1e);
    for (let y = 20; y < h - 20; y += 6) fr(g, '#08153a', 20, y, w - 40, 2);
    hackFrame(g, w, h, R); tear(g, 16, w - 16, R, 12, 30, h - 40, 8);
    const c1 = new ART.Mask(120, 50); cloud(c1, 60, 30, 1, 3); ART.paintMask(g, c1, S_RED, 204, 46, { halo: false, edge: false }); ART.paintMask(g, c1, S_CY, 200, 42, { halo: false, edge: false });
    brushSplit(g, 'THE SKY', 256, 92, 6, 31, { skew: .3, fat: 2 }); brushSplit(g, 'BELONGS TO', 256, 166, 6, 32, { skew: .3, fat: 2 }); brushSplit(g, 'NO ONE', 256, 240, 6, 33, { skew: .3, fat: 2 });
    T(g, 'PROTEST', 160, 356, '5x7', 2, ICE); T(g, 'REBEL', 256, 356, '5x7', 2, ICE); T(g, 'RESIST', 352, 356, '5x7', 2, ICE);
    for (const x of [100, 208, 304, 408]) fr(g, x % 8 ? RED : CY, x - 3, 359, 6, 6);
  }, { defer: true });

  // ======================= 5. Synth Corp: security (clean, cyan and gold) =======================
  ART.reg('holo_synth', (g, w, h) => {
    bg(g, w, h);
    box(g, 8, 8, w - 16, h - 16, 3, CY); box(g, 16, 16, w - 32, h - 32, 1, CYD); brackets(g, 4, 4, w - 8, h - 8, 40, 6, GOLD);
    for (let y = 120; y < 260; y += 8) { fr(g, CYD, 22, y, 4, 4); fr(g, CYD, w - 26, y, 4, 4); }
    const sh = new ART.Mask(64, 64); shield(sh, 32, 32, 26, 3); sh.line(20, 32, 29, 42, 3, 2); sh.line(29, 42, 46, 20, 3, 2); glow(g, sh, S_GOLD, 56, 34);
    T(g, 'SYNTH CORP', 290, 54, 'bold', 5, CY, { shadow: { color: '#0a5f86', dx: 3, dy: 3 } });
    T(g, 'HAS YOUR BACK', 256, 122, '5x7', 5, GOLD, { shadow: { color: '#a85a10', dx: 3, dy: 3 } });
    fr(g, CYD, 90, 178, 332, 2);
    T(g, 'ADVANCED SECURITY', 256, 192, '5x7', 3, CY);
    T(g, "THAT MAKES SURE YOU'RE SAFE ANYWHERE", 256, 226, '5x7', 2, ICE);
    const s1 = new ART.Mask(64, 70); shield(s1, 32, 34, 30, 4); s1.line(20, 34, 29, 44, 3, 2); s1.line(29, 44, 46, 20, 3, 2); glow(g, s1, S_CY, 128, 252);
    const s2 = new ART.Mask(64, 70); shield(s2, 32, 34, 30, 4); s2.rect(21, 30, 22, 17, 3, 1); s2.ellipse(32, 29, 7, 8, 3, 1, Math.PI, Math.PI*2); s2.fillRect(30, 37, 4, 5, 2); glow(g, s2, S_GOLD, 320, 252);
    T(g, 'SAFE', 160, 330, '5x7', 3, GOLD); T(g, 'PROTECTION', 352, 330, '5x7', 3, CY);
  }, { defer: true });

  // ======================= 6. hacked: BIG BROTHER IS WATCHING =======================
  ART.reg('holo_watch', (g, w, h) => {
    bg(g, w, h); const R = SG.rng(0x1b09);
    for (let y = 20; y < h - 20; y += 6) fr(g, '#0a0f2c', 20, y, w - 40, 2);
    hackFrame(g, w, h, R); tear(g, 16, w - 16, R, 10, 30, h - 40, 8);
    brushSplit(g, 'BIG BROTHER', 256, 44, 5, 41, { skew: 0, fat: 2, drip: .03 }); brushSplit(g, 'IS WATCHING', 256, 100, 5, 42, { skew: 0, fat: 2, drip: .03 });
    const e = new ART.Mask(260, 120); e.curve(0, 60, 130, -30, 260, 60, 4, 1); e.curve(0, 60, 130, 150, 260, 60, 4, 1);
    ART.paintMask(g, e, S_RED, 126, 150, { halo: false, edge: false });
    const ir = new ART.Mask(260, 120); ir.ellipse(130, 60, 36, 36, 4, 1); ir.poly([[110, 44], [150, 44], [130, 60], [150, 76], [110, 76], [130, 60]], true, 3, 2);
    ART.paintMask(g, ir, S_CY, 126, 150, { halo: false, edge: false });
    for (const dx of [-110, -66, -22, 22, 66, 110]) fr(g, RED, 256 + dx - 2, 128 + Math.abs(dx)/5, 4, 10);
    T(g, 'SURVEILLANCE', 256, 300, '5x7', 4, RED, { shadow: { color: '#5a0c1c', dx: 3, dy: 3 } });
    blocks(g, R, 6, 24, 140, 130, 290, [CY, RED]); blocks(g, R, 6, 390, 140, 490, 290, [CY, RED]);
  }, { defer: true });
})();
