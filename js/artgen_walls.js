// Neon Terrarium: the five wall hologram signs drawn in code (procedural art plan, item 7). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// One texture 'holo_walls' (ART.SIZE.holo_walls), five tall boards in the cells ART.WALL_NEW.cells, each filling its cell edge to edge: sushi, repair, air filter shop, satellite shop, loan shop.
// Every board is drawn as three masks (cyan tube, orange tube, a little extra color for the food and the chip) and painted with ART.paintMask. The sign is shown additively, so the board stays dark navy.
(() => {
  const PI = Math.PI, Mask = ART.Mask;
  const BOARD = 0x10143a;
  const CY = ART.scheme(0x96fff5, 0x1ebeb9, BOARD, .5), OR = ART.scheme(0xffb948, 0xe6791e, BOARD, .5);
  const SALMON = ART.scheme(0xff9c7c, 0xd9583a, BOARD), RICE = ART.scheme(0xeafff9, 0x7fd0c8, BOARD), GOLD = ART.scheme(0xffd978, 0xd8902c, BOARD);

  // the biggest integer scale at which the string fits maxW
  const fitS = (str, font, maxW, gap = 1, top = 4) => { let s = top; while (s > 1 && ART.textW(str, font, { scale: s, gap }) > maxW) s--; return s; };
  // a centered line of text into a mask; returns its height
  const line = (m, str, cx, y, font, maxW, v = 1, gap = 1, top = 4) => { const s = fitS(str, font, maxW, gap, top); while (s >= 2 && gap < 2 && ART.textW(str, font, { scale: s, gap: gap + 1 }) <= maxW) gap++; ART.textMask(m, str, cx, y, font, { scale: s, gap, align: 'center', v }); return ART.textH(font, { scale: s }); };

  // a four pointed sparkle: arms of length r, a hot center
  const spark = (m, x, y, r = 3, v = 1) => { m.line(x - r, y, x + r, y, 1, v); m.line(x, y - r, x, y + r, 1, v); m.dot(x, y, 1, 1); };
  // a dotted rule, dashes of d pixels every 2d
  const dots = (m, x0, x1, y, d = 2, v = 1, v2 = 2) => { let k = 0; for (let x = x0; x < x1; x += d + 1, k++) m.fillRect(x, y, d, 1, (Math.abs(k - ((x1 - x0)/(d + 1) >> 1)) < 2) ? v2 : v); };
  // the frame, corner blocks with a bright pip, sparkles just inside the corners
  const frame = (mc, mo, w, h, o = {}) => {
    ART.frame(mc, w, h, 0, 3, 3, 1);
    if (o.inner !== false) ART.frame(mc, w, h, 6, 2, 1, 2);
    for (const [x, y] of [[0, 0], [w - 9, 0], [0, h - 9], [w - 9, h - 9]]){ mc.fillRect(x, y, 9, 9, 1); mc.fillRect(x + 2, y + 2, 5, 5, 2); mc.fillRect(x + 3, y + 3, 3, 3, 1); }
    for (const [x, y] of [[16, 16], [w - 17, 16], [16, h - 17], [w - 17, h - 17]]) spark(mc, x, y, o.sr || 3, 1);
  };
  // ---- the icons ----
  const nigiri = (ms, cx, y) => {
    const r = ms.rice, s = ms.fish;
    r.fillPoly([[cx - 24, y + 22], [cx - 22, y + 14], [cx + 22, y + 14], [cx + 24, y + 22], [cx + 20, y + 30], [cx - 20, y + 30]], 1);
    for (let k = -18; k <= 18; k += 6) r.line(cx + k, y + 18, cx + k, y + 26, 1, 2);
    s.fillPoly([[cx - 30, y + 20], [cx - 28, y + 8], [cx - 18, y], [cx + 14, y - 2], [cx + 28, y + 6], [cx + 30, y + 18], [cx + 22, y + 22], [cx - 22, y + 22]], 1);
    s.line(cx - 22, y + 10, cx - 4, y + 3, 1, 2); s.line(cx - 8, y + 19, cx + 14, y + 8, 1, 2); s.line(cx + 6, y + 4, cx + 22, y + 12, 1, 2);
    ms.cy.line(cx - 32, y + 35, cx + 32, y + 35, 2, 1); ms.cy.line(cx - 28, y + 39, cx + 28, y + 39, 1, 2);
  };
  const robot = (ms, cx, y) => {
    const c = ms.cy, o = ms.or;
    c.line(cx, y, cx, y + 9, 2); c.fillEllipse(cx, y - 2, 3, 3, 1); o.dot(cx - 1, y - 3, 2, 2);
    c.rect(cx - 22, y + 10, 44, 34, 2, 1);                                   // the head
    c.fillRect(cx - 16, y + 18, 11, 9, 2); c.fillRect(cx + 5, y + 18, 11, 9, 2);   // the eyes
    c.fillRect(cx - 13, y + 20, 5, 5, 1); c.fillRect(cx + 8, y + 20, 5, 5, 1);
    for (let k = -9; k <= 9; k += 6) c.fillRect(cx + k - 1, y + 33, 2, 6, 2);       // the grille
    o.fillRect(cx - 28, y + 20, 6, 14, 1); o.fillRect(cx + 22, y + 20, 6, 14, 1);   // the ears
    o.line(cx - 22, y + 44, cx - 22, y + 50, 2); o.line(cx + 21, y + 44, cx + 21, y + 50, 2); c.line(cx - 28, y + 51, cx - 14, y + 51, 2); c.line(cx + 14, y + 51, cx + 28, y + 51, 2);
  };
  const wrench = (ms, cx, y) => {
    const o = ms.or;
    o.fillEllipse(cx, y + 14, 15, 14, 1);
    o.fillRect(cx - 5, y - 2, 10, 14, 0);                                      // the open jaw
    o.fillPoly([[cx - 6, y + 22], [cx + 6, y + 22], [cx + 8, y + 62], [cx + 11, y + 70], [cx + 10, y + 82], [cx - 10, y + 82], [cx - 11, y + 70], [cx - 8, y + 62]], 1);
    o.fillEllipse(cx, y + 76, 4, 4, 0); o.line(cx, y + 30, cx, y + 56, 1, 2);
    for (let k = 0; k < 3; k++) ms.cy.line(cx - 3, y + 34 + k*8, cx + 2, y + 34 + k*8, 1, 1);
    spark(ms.cy, cx - 26, y + 6, 3); spark(ms.cy, cx + 27, y + 40, 2);
  };
  const filter = (ms, cx, y) => {
    const o = ms.or, c = ms.cy, rx = 36, ry = 10, hh = 92;
    o.ellipse(cx, y, rx, ry, 2, 1);                                            // the top rim
    o.ellipse(cx, y, rx - 5, ry - 3, 1, 2);
    o.line(cx - rx, y, cx - rx, y + hh, 2); o.line(cx + rx, y, cx + rx, y + hh, 2);
    o.ellipse(cx, y + hh, rx, ry, 2, 1, 0, PI);                                // the bottom
    for (let k = -12; k <= 12; k += 8) o.line(cx + k, y + 8, cx + k, y + hh - 4, 1, 2);   // the grid
    for (let k = 0; k < 5; k++) o.line(cx - 15, y + 16 + k*13, cx + 15, y + 16 + k*13, 1, 2);
    o.line(cx - 15, y + 8, cx - 15, y + hh - 4, 1, 2); o.line(cx + 15, y + 8, cx + 15, y + hh - 4, 1, 2);
    for (let k = 0; k < 6; k++){ c.line(cx - 31, y + 12 + k*12, cx - 21, y + 8 + k*12, 1); c.line(cx + 21, y + 8 + k*12, cx + 31, y + 12 + k*12, 1); }   // the glowing vents
    c.ellipse(cx, y + hh + 6, 14, 6, 1, 1);                                     // the fan
    c.line(cx - 10, y + hh + 6, cx + 10, y + hh + 6, 1, 2); c.line(cx, y + hh + 1, cx, y + hh + 11, 1, 2);
    spark(c, cx - 52, y + 40, 4); spark(c, cx + 52, y + 70, 4); spark(c, cx - 48, y + 100, 2); spark(c, cx + 46, y - 6, 2);
    spark(o, cx + 50, y + 14, 2, 2); spark(o, cx - 54, y + 12, 2, 2);
  };
  const dish = (ms, cx, y) => {
    const c = ms.cy, o = ms.or, A = -.5, ca = Math.cos(A), sa = Math.sin(A), pts = [], rx = 46, ry = 17;
    for (let k = 0; k < 24; k++){ const a = k/24*PI*2, px = Math.cos(a)*rx, py = Math.sin(a)*ry; pts.push([cx + px*ca - py*sa, y + px*sa + py*ca]); }
    ms.fill.fillPoly(pts, 1); c.poly(pts, true, 2, 1);                          // the bowl, seen from the front
    c.curve(pts[0][0], pts[0][1], cx - 8, y + 44, pts[12][0], pts[12][1], 2, 1);   // its back curve
    const ax = cx + 26, ay = y - 40;
    o.line(cx - 8, y + 2, ax, ay, 2, 1); o.line(cx + 4, y + 2, ax - 2, ay + 2, 1, 2); o.fillEllipse(ax, ay - 2, 3, 3, 1);   // the feed arm
    c.line(cx - 2, y + 32, cx - 6, y + 50, 2, 1); c.line(cx - 18, y + 52, cx + 8, y + 52, 3, 1);
    spark(c, cx - 44, y - 16, 4); spark(c, cx + 46, y + 24, 3); spark(o, cx + 40, y - 40, 2, 2);
  };
  const waves = (ms, cx, y) => {
    const c = ms.cy, o = ms.or;
    for (let k = 0; k < 5; k++){ const rx = 16 + k*15, ry = 7 + k*5.5, yy = y + 8 + k*16;
      (k % 2 ? o : c).ellipse(cx, yy, rx, ry, 2, 1, .12*PI, .88*PI); }
    for (const s of [-1, 1]){ for (let k = 0; k < 17; k++){ const t = k/16, px = cx + s*(8 + t*72), py = y + t*88;
      if (k % 2 === 0) (k % 4 === 0 ? o : c).dot(px, py, 1 + (k < 8 ? 1 : 0), 1); } }
  };
  const chip = (ms, cx, y) => {
    const o = ms.or, c = ms.cy, x = cx - 46;
    c.rect(x, y, 56, 38, 3, 1); ms.fill.fillRect(x + 3, y + 3, 50, 32, 1);
    ms.gold.fillRect(x + 8, y + 9, 16, 14, 1);                                   // the chip
    ms.gold.line(x + 8, y + 16, x + 23, y + 16, 1, 2); ms.gold.line(x + 15, y + 9, x + 15, y + 22, 1, 2);
    o.line(x + 28, y + 24, x + 36, y + 24, 1, 2); o.line(x + 36, y + 24, x + 36, y + 14, 1, 2); o.line(x + 12, y + 28, x + 28, y + 28, 1, 2); o.line(x + 28, y + 28, x + 42, y + 28, 1, 2);
    c.fillRect(x + 32, y + 6, 8, 6, 1);
    o.line(cx + 32, y + 36, cx + 56, y - 2, 3, 1);                               // the percent sign
    c.ellipse(cx + 28, y + 6, 6, 6, 2, 1); c.ellipse(cx + 60, y + 30, 6, 6, 2, 1);
  };

  // ---- one board: fn(ms, w, h) draws into the masks, then everything is composed into one ImageData (little endian 0xAABBGGRR) and put on the canvas ----
  const px = c => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
  const board = (g, cell, fn) => {
    const [x, y, w, h] = cell, ms = {};
    for (const k of ['cy', 'or', 'fill', 'rice', 'fish', 'gold']) Object.defineProperty(ms, k, { enumerable: true, configurable: true, get(){ const m = new Mask(w, h); Object.defineProperty(ms, k, { value: m, enumerable: true }); return m; } });
    fn(ms, w, h);
    const img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer), cb = px(BOARD), cp = px(SG.mix(BOARD, 0x1e2a6a, .5));
    for (let j = 0; j < h; j++){ const edge = j < 9 || j >= h - 9; for (let i = 0; i < w; i++) d[j*w + i] = (edge || i < 9 || i >= w - 9) ? cb : cp; }
    // lay a mask's layers onto d: halo (3) too when withHalo
    const lay = (k, sc, withHalo, o) => { const dd = Object.getOwnPropertyDescriptor(ms, k); if (!dd || !dd.value) return; const L = (o && o.cache) || ART.maskLayers(dd.value, sc, o), col = [0, px(sc.hot), px(sc.accent), px(sc.halo === undefined ? 0 : sc.halo)];
      for (let i = 0; i < L.length; i++){ const v = L[i]; if (v && (v < 3 || withHalo)) d[i] = col[v]; } };
    lay('fill', ART.scheme(0x0a0d2c, 0x0a0d2c, BOARD), false, { halo: false, edge: false });
    lay('rice', RICE, false, { halo: false }); lay('fish', SALMON, false, { halo: false }); lay('gold', GOLD, false, { halo: false });
    const orL = ms.or && ART.maskLayers(ms.or, OR); lay('or', OR, true, { cache: orL }); lay('cy', CY, true); lay('or', OR, false, { cache: orL });       // the cyan halo may not cover an orange tube
    g.putImageData(img, x, y);
  };

  ART.reg('holo_walls', (g, W, H) => {
    const cells = ART.WALL_NEW.cells;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // 0 sushi
    board(g, cells[0], (ms, w, h) => {
      frame(ms.cy, ms.or, w, h); const cx = w/2, mw = w - 24;
      nigiri(ms, cx, 26);
      line(ms.or, 'SUSHI', cx, 88, 'bold', mw, 1, 2, 2);
      line(ms.cy, 'OPEN', cx, 122, 'bold', mw, 1, 1, 3);
      line(ms.or, '24/7', cx, 164, 'bold', mw, 1, 1, 3);
      dots(ms.cy, 22, w - 22, 208); dots(ms.or, 30, w - 30, 216, 2, 1, 1);
    });
    // 1 repair
    board(g, cells[1], (ms, w, h) => {
      frame(ms.cy, ms.or, w, h); const cx = w/2, mw = w - 22;
      robot(ms, cx, 24); wrench(ms, cx, 94);
      line(ms.or, 'REPAIR', cx, 196, '5x7', mw, 1, 1, 3);
      line(ms.cy, 'OPEN', cx, 230, 'bold', mw, 1, 1, 3);
      line(ms.or, '24/7', cx, 268, 'bold', mw, 1, 1, 3);
    });
    // 2 air filter shop
    board(g, cells[2], (ms, w, h) => {
      frame(ms.cy, ms.or, w, h, { sr: 4 }); const cx = w/2, mw = w - 24;
      filter(ms, cx, 34);
      line(ms.or, 'AIR FILTER', cx, 184, 'bold', mw, 1, 1, 3);
      line(ms.cy, 'PUREFLOW', cx, 222, 'bold', mw, 1, 1, 3);
      dots(ms.cy, 30, w - 30, 270); line(ms.cy, 'air filter shop', cx, 300, '5x7', mw, 1, 1, 1);
    });
    // 3 satellite shop
    board(g, cells[3], (ms, w, h) => {
      frame(ms.cy, ms.or, w, h, { sr: 4 }); const cx = w/2, mw = w - 24;
      dish(ms, cx, 66); waves(ms, cx, 110);
      line(ms.cy, 'CALL THE', cx, 214, 'bold', mw, 1, 1, 3);
      line(ms.cy, 'GROUND', cx, 240, 'bold', mw, 1, 1, 3);
      line(ms.or, 'TODAY', cx, 274, 'bold', mw, 1, 1, 4);
      line(ms.cy, 'satellite communication shop', cx, 336, '3x5', mw, 1, 1, 1);
    });
    // 4 loan shop
    board(g, cells[4], (ms, w, h) => {
      frame(ms.cy, ms.or, w, h); const cx = w/2, mw = w - 26;
      chip(ms, cx + 3, 24);
      line(ms.or, 'LOAN ON', cx, 76, 'bold', mw, 1, 1, 3);
      line(ms.or, 'CREDITS', cx, 106, 'bold', mw, 1, 1, 3);
      line(ms.cy, '47% INTEREST', cx, 146, 'bold', mw, 1, 1, 2);
      line(ms.or, 'ONLY', cx, 172, 'bold', mw, 1, 1, 3);
      dots(ms.cy, 32, w - 32, 214); line(ms.cy, 'LOAN SHOP', cx, 238, '5x7', mw, 1, 1, 2);
    });
  }, { defer: true });
})();
