// Neon Terrarium: the nine animated hologram ads drawn in code (procedural art plan, item 6). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// Texture 'holo_ads' (384 x 432): nine rows of 48 px, a strip of 64 x 48 cells per ad, one cell per frame. The first six ads are portrait 40 x 46 (six frames each), the last three landscape
// 64 x 44 (four frames each): exactly what HOLO_MAT (buildings.js) crops and plays (frame = floor(t*4 + seed) mod 6 or 4). The shader tints a board with ink * max(r, g, b) * 1.9, so only the
// brightest channel of a pixel matters: the ads are drawn in greys on black, tube 255, accents 154, a dim glow ring 48, text 232, and the rest of every cell is black (as the old sheet).
// Each frame is one Mask (layer 1 the tube, 2 the accent) painted with ART.paintMask; the animations loop exactly: every motion is a function of f over the strip's frame count.
(() => {
  const PI = Math.PI, TAU = PI*2, Mk = ART.Mask;
  const SC = { hot: 0xffffff, accent: 0x9a9a9a, halo: 0x303030, board: 0 };
  const TXT = '#e8e8e8';
  const S = (a, f, n) => Math.sin(TAU*f/n + (a || 0));

  // ---- a little robot: o.head 'box' | 'round' | 'ears', o.ant (antenna), o.blink (the antenna ball is hot), o.eyes (eye height) ----
  // (T: the top of the antenna ball; the robot is 24 wide with arms and 28 tall)
  function robot(m, cx, T, o = {}){
    if (o.ant !== false){ m.fillRect(cx - 1, T, 2, 2, o.blink ? 1 : 2); m.line(cx, T + 2, cx, T + 3); }
    const hy = T + 4;
    if (o.head === 'round') m.ellipse(cx - .5, hy + 4, 6, 4.5, 1, 1);
    else { m.rect(cx - 6, hy, 12, 8); if (o.head === 'ears'){ m.fillRect(cx - 8, hy + 2, 2, 4, 2); m.fillRect(cx + 6, hy + 2, 2, 4, 2); } }
    const ey = hy + 2 + (o.eyes || 0);
    m.fillRect(cx - 4, ey, 2, 2); m.fillRect(cx + 2, ey, 2, 2); m.line(cx - 3, hy + 6, cx + 2, hy + 6, 1, 2);
    m.fillRect(cx - 1, hy + 8, 2, 1, 2);
    const ty = T + 13; m.rect(cx - 7, ty, 14, 10); m.rect(cx - 3, ty + 2, 6, 4, 1, 2); m.dot(cx - 1, ty + 7, 2, 2);
    m.rect(cx - 5, ty + 10, 4, 5); m.rect(cx + 1, ty + 10, 4, 5); m.fillRect(cx - 6, ty + 14, 6, 1); m.fillRect(cx, ty + 14, 6, 1);
    return { ty };
  }
  const armR = (m, cx, ty) => { m.line(cx + 7, ty + 2, cx + 11, ty + 4); m.line(cx + 11, ty + 4, cx + 11, ty + 9); m.dot(cx + 10, ty + 9, 2); };
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'], HEART2 = ['001101100', '011111110', '111111111', '011111110', '001111100', '000111000', '000010000'];
  const heart = (m, cx, y, big) => { const p = big ? HEART2 : HEART, w = p[0].length; p.forEach((r, j) => { for (let i = 0; i < w; i++) if (r[i] === '1') m.set(cx - (w >> 1) + i, y + j, 1); }); };

  // ---- the portrait ads (40 x 46, six frames): label strip on top, the picture below ----
  const PORTRAIT = [
    { label: 'ROBOT ADS', draw(m, f){   // a robot waving
        const w = Math.round(3*S(0, f, 6)), T = 15, { ty } = robot(m, 20, T, { blink: f % 3 === 0 });
        armR(m, 20, ty);
        const ex = 9, ey = ty + 1, hx = ex + w, hy = ty - 8 - (Math.abs(w) > 2 ? 1 : 0);
        m.line(13, ty + 2, ex, ey); m.line(ex, ey, hx, hy); m.dot(hx - 1, hy - 1, 3, 1); } },
    { label: 'BOT SHOP', draw(m, f){    // a robot swinging a wrench
        const a = -2.25 + .28*S(0, f, 6), cx = 24, T = 15, { ty } = robot(m, cx, T, { head: 'round', blink: f % 2 === 0 });
        armR(m, cx, ty);
        const hx = 14, hy = ty + 3, len = 13, c = Math.cos(a), sn = Math.sin(a), tx = hx + c*len, tyy = hy + sn*len;
        m.line(cx - 7, ty + 2, hx, hy);                  // the arm
        m.line(hx, hy, tx, tyy, 2);                      // the wrench handle
        const nx = -sn, ny = c;                          // the jaw: a U of two prongs
        m.line(tx + nx*3, tyy + ny*3, tx + nx*3 + c*3, tyy + ny*3 + sn*3); m.line(tx - nx*3, tyy - ny*3, tx - nx*3 + c*3, tyy - ny*3 + sn*3);
        m.line(tx + nx*3, tyy + ny*3, tx - nx*3, tyy - ny*3);
        if (f % 3 === 1){ const sx = Math.round(tx) - 5, sy = Math.round(tyy) - 2; m.line(sx - 2, sy, sx + 2, sy); m.line(sx, sy - 2, sx, sy + 2); } } },
    { label: 'MY FRIEND', draw(m, f){   // a robot with open arms and a beating heart
        const T = 15, { ty } = robot(m, 20, T, { ant: false, head: 'ears', eyes: f % 3 === 2 ? 1 : 0 });
        const big = [1, 0, 1, 0, 0, 0][f];
        heart(m, 20, big ? 12 : 13, big);
        const hx = Math.round(2*S(0, f, 6));
        m.line(13, ty + 2, 9, ty + 1); m.line(9, ty + 1, 7 + hx, ty - 5); m.dot(6 + hx, ty - 6, 2);
        m.line(27, ty + 2, 31, ty + 1); m.line(31, ty + 1, 33 - hx, ty - 5); m.dot(32 - hx, ty - 6, 2); } },
    { label: 'RAMEN', draw(m, f, fx){    // a bowl with steam
        const cx = 20, y = 32;
        m.ellipse(cx, y, 13, 8, 2, 1, 0, PI); m.line(cx - 14, y, cx + 13, y, 2); m.line(cx - 5, y + 9, cx + 4, y + 9, 2);
        m.curve(cx - 11, y + 4, cx - 4, y + 7, cx + 3, y + 5, 1, 2);                 // a band on the bowl
        m.ellipse(cx - 6, y - 1, 4, 3, 1, 2, PI, TAU); m.dot(cx - 7, y - 3, 2, 2);   // the egg half
        for (const dx of [0, 5, 10]) m.curve(cx + dx - 1, y - 1, cx + dx + 1, y - 3, cx + dx, y - 5, 1, 2);
        m.line(cx + 5, y - 6, cx + 14, y - 16); m.line(cx + 8, y - 6, cx + 17, y - 14);   // chopsticks
        [10, 16, 22].forEach((x, i) => { for (let y2 = 26; y2 >= 14; y2--) if ((y2 + 2*f + i*4) % 8 < 6) fx.set(x + Math.round(1.3*Math.sin(TAU*(y2 + 2*f)/12 + i*2)), y2, y2 < 19 ? 2 : 1); }); } },
    { label: 'LAUNDRY', draw(m, f){      // a washer, the drum turning
        m.rect(8, 14, 24, 28, 1); m.line(8, 21, 31, 21, 1, 2);
        m.ellipse(13, 17.5, 2, 2, 1, 1); m.rect(19, 16, 9, 3, 1, 2); if (f % 2 === 0) m.dot(30, 16, 1, 1);
        m.fillRect(10, 42, 3, 2, 2); m.fillRect(27, 42, 3, 2, 2);
        const cx = 20, cy = 32; m.ellipse(cx, cy, 9, 9, 2, 1); m.ellipse(cx, cy, 6, 6, 1, 2);
        for (let k = 0; k < 3; k++){ const a = TAU*k/3 + TAU*f/18, x = cx + Math.cos(a)*3.6, y = cy + Math.sin(a)*3.6; m.fillEllipse(x, y, 1.6, 1.6, 1); m.line(cx, cy, x - Math.cos(a), y - Math.sin(a), 1, 2); }
        m.dot(cx - 4, cy - 5, 1, 1); } },
    { label: 'ARCADE', draw(m, f){       // a joystick rocking on its console
        m.poly([[6, 36], [34, 36], [37, 43], [3, 43]], true, 1); m.line(4, 40, 36, 40, 1, 2);
        m.ellipse(16, 38, 4, 1.5, 1, 1); const a = .32*S(0, f, 6), bx = 16, by = 37, tx = bx + Math.sin(a)*18, ty = by - Math.cos(a)*18;
        m.line(bx, by, tx, ty, 2); m.fillEllipse(tx, ty - 1, 4, 4, 1);
        m.ellipse(27, 38, 2, 2, 1, f % 2 === 0 ? 1 : 2); m.ellipse(32, 38, 2, 2, 1, f % 2 === 0 ? 2 : 1);
        if (f % 3 === 1){ m.line(30, 17, 34, 17, 1, 1); m.line(32, 15, 32, 19, 1, 1); } else if (f % 3 === 2){ m.line(6, 29, 10, 29, 1, 1); m.line(8, 27, 8, 31, 1, 1); } } },
  ];

  // ---- the landscape ads (64 x 44, four frames) ----
  const LAND = [
    { draw(m, f, fx, g){   // a respirator mask breathing, with 'AIR FILTERS' beside it
        const s = [1, 1.08, 1, .92][f], cx = 47, cy = 22, P = (x, y) => [cx + x*s, cy + y*s], L = (a, b, c, d, v = 1, wd = 1) => m.line(...P(a, b), ...P(c, d), wd, v);
        m.ellipse(...P(0, -1), 11*s, 17*s, 1, 1);                                                       // the head
        m.poly([[-10, -10], [10, -10], [11, -3], [-11, -3]].map(p => P(p[0], p[1])), true, 1);          // the visor
        L(-8, -8, -4, -8, 2); L(-8, -6, -6, -6, 2);                                                       // its shine
        m.poly([[-8, 0], [8, 0], [7, 9], [0, 14], [-7, 9]].map(p => P(p[0], p[1])), true, 1);           // the cup
        for (const x of [-4.5, -2.25, 0, 2.25, 4.5]) L(x, 1, x, x === 0 ? 13 : 11, 2); L(-7, 4, 7, 4, 2); L(-7, 7, 7, 7, 2);
        for (const sx of [-1, 1]){ m.ellipse(...P(sx*10, 6), 3*s, 3*s, 1, 1); m.dot(...P(sx*10, 6), 1, 2); }   // the filter cartridges
        g('AIR', 5, 11, '3x5'); g('FILTERS', 5, 18, '3x5'); } },
    { draw(m, f, fx, g){   // a dish sending waves
        const C = [12, 24], d = [.64, -.77], p = [.77, .64], E1 = [C[0] + 10*p[0], C[1] + 10*p[1]], E2 = [C[0] - 10*p[0], C[1] - 10*p[1]];
        const ctrl = [C[0] - d[0]*18, C[1] - d[1]*18], F = [C[0] + d[0]*11, C[1] + d[1]*11];
        m.curve(E1[0], E1[1], ctrl[0], ctrl[1], E2[0], E2[1], 1, 1); m.line(E1[0], E1[1], E2[0], E2[1], 1, 1);
        for (const t of [.33, .66]){ const rx = E2[0] + (E1[0] - E2[0])*t, ry = E2[1] + (E1[1] - E2[1])*t; m.line(rx, ry, rx - d[0]*(t*(1 - t))*20 , ry - d[1]*(t*(1 - t))*20, 1, 2); }
        m.line(C[0], C[1], F[0], F[1], 1, 1); m.fillEllipse(F[0], F[1], 2, 2, 1);
                const bx = C[0] - d[0]*6, by = C[1] - d[1]*6; m.line(bx, by, bx - 1, 38, 2); m.line(4, 40, 15, 40, 2);
        const a = Math.atan2(d[1], d[0]); const wv = new Mk(m.w, m.h);
        for (let k = 0; k < 3; k++){ const r = 4 + (3*f + 12*k) % 36; wv.ellipse(F[0], F[1], r, r, 1, r < 16 ? 1 : 2, a - .75, a + .75); }
        for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++){ const v = wv.d[y*m.w + x]; if (v && !(y > 19 && x > 24)) fx.set(x, y, v); }
        g('MESSAGES', 23, 22, '3x5'); g('TO', 23, 28, '3x5'); g('GROUNDERS', 23, 34, '3x5'); } },
    { draw(m, f, fx, g){   // a dancer in four poses
      const POSE = [
        { n: [46, 11], h: [46, 7], le: [41, 8], lh: [38, 3], re: [51, 8], rh: [54, 3], hip: [46, 22], lk: [43, 30], lf: [41, 38], rk: [49, 30], rf: [51, 38] },
        { n: [46, 11], h: [46, 7], le: [41, 16], lh: [44, 21], re: [52, 7], rh: [55, 2], hip: [47, 22], lk: [44, 30], lf: [43, 38], rk: [51, 29], rf: [49, 38] },
        { n: [46, 11], h: [46, 7], le: [40, 12], lh: [35, 14], re: [52, 11], rh: [57, 8], hip: [46, 22], lk: [41, 30], lf: [43, 38], rk: [51, 30], rf: [49, 38] },
        { n: [46, 11], h: [46, 7], le: [41, 8], lh: [39, 3], re: [52, 15], rh: [56, 19], hip: [45, 22], lk: [45, 30], lf: [47, 38], rk: [48, 29], rf: [45, 38] }][f];
      const P = POSE;
      const hx = P.hip[0], nx = P.n[0], dress = [[nx - 3, 12], [nx + 3, 12], [hx + 2, 18], [hx + 6, 28], [hx - 6, 28], [hx - 2, 18]];
      m.fillPoly(dress, 2); m.poly(dress, true, 1);
      m.line(nx - 3, 11, ...P.le); m.line(...P.le, ...P.lh); m.line(nx + 3, 11, ...P.re); m.line(...P.re, ...P.rh);
      m.line(hx - 3, 28, ...P.lk, 2); m.line(...P.lk, ...P.lf, 2); m.line(hx + 3, 28, ...P.rk, 2); m.line(...P.rk, ...P.rf, 2);
      m.fillEllipse(P.h[0], P.h[1], 3, 3, 1); m.line(P.h[0] + 3, P.h[1], P.h[0] + 5, P.h[1] + 4, 1, 2);
      m.line(33, 40, 59, 40, 1, 2);
      const st = [[35, 8], [57, 28], [35, 28], [58, 12]][f]; m.line(st[0] - 2, st[1], st[0] + 2, st[1], 1, 1); m.line(st[0], st[1] - 2, st[0], st[1] + 2, 1, 1);
      g('NEON', 5, 9, '5x7'); g('CLUB', 5, 21, '5x7'); } },
  ];

  // the whole sheet is composed in one buffer (the masks are tiny: 48 cells of at most 64 x 48) and put on the canvas once; the words are drawn after it with the font's fillRects
  ART.reg('holo_ads', (g, w, h) => {
    const img = g.createImageData(w, h), buf = new Uint32Array(img.data.buffer), words = [];
    buf.fill(0xff000000);
    const COL = [0, 0xffffffff, 0xff9a9a9a, 0xff303030];   // ABGR: nothing, tube, accent, glow ring
    const blit = (m, ox, oy, halo) => { const out = ART.maskLayers(m, SC, { edge: false, halo }), cw = m.w;
      for (let y = 0; y < m.h; y++){ const r = (oy + y)*w + ox, q = y*cw; for (let x = 0; x < cw; x++){ const v = out[q + x]; if (v) buf[r + x] = COL[v]; } } };
    const cell = (row, f, cw, ch, d, label) => {
      const m = new Mk(cw, ch), fx = new Mk(cw, ch), ox = f*64, oy = row*48, land = cw > 40;
      ART.frame(m, cw, ch, 0, 2, 1, 1);
      if (land) ART.frame(m, cw, ch, 2, 1, 1, 2); else m.line(3, 11, cw - 4, 11, 1, 2);
      // the portrait ads' label is written after the tubes; the landscape ads write their own words through the 4th argument
      d.draw(m, f, fx, (str, x, y, font) => words.push([str, ox + x, oy + y, font, {}]));
      if (label) words.push([label, ox + 20, oy + 4, '3x5', { align: 'center' }]);
      blit(m, ox, oy, true); blit(fx, ox, oy, false);
    };
    PORTRAIT.forEach((a, i) => { for (let f = 0; f < 6; f++) cell(i, f, 40, 46, a, a.label); });
    LAND.forEach((a, i) => { for (let f = 0; f < 4; f++) cell(6 + i, f, 64, 44, a, null); });
    g.putImageData(img, 0, 0);
    for (const [str, x, y, font, o] of words) ART.text(g, str, x, y, font, { color: TXT, align: o.align });
  }, { defer: true });
})();
