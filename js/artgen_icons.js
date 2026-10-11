// Neon Terrarium: the shop icon signs and the police badge drawn in code (procedural art plan, item 1). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// Each of the 15 icons is drawn once as a mask of neon line art on a dark board (a frame tube, an icon of 1 and 2 pixel tubes, a halo ring), and colored at blit time: pink, cyan and amber come from one drawing
// (ART.NEON). Sizes are the old signs' (SPR.size, unchanged), so they are sprite-atlas kinds like the plants: SG.reg makes the atlas draw them (sprites.js), the old picture only with the old art switch.
// The tube is the brightest value and the board stays dark: the sprite shader lights a pixel by itself only above a mean of 0.35 (the evening switch-on).
(() => {
  const PI = Math.PI;
  // ---- the icons: fn(m, w, h): strokes into the mask (layer 1 the tube, 2 the accent), inside the frame; (w, h) the sign's size ----
  const ICON = {
    // a bowl of ramen: the bowl, a half egg, noodles on top, steam, chopsticks
    ramen(m, w, h){ const cx = w/2, y = 12;
      m.ellipse(cx, y, 9, 8, 2, 1, 0, PI);                                   // the bowl
      m.line(cx - 10, y, cx + 9, y, 2);                                      // the rim
      m.line(cx - 4, y + 10, cx + 3, y + 10, 2);                             // the foot
      m.ellipse(cx - 3, y - 1, 3, 2, 1, 1, PI, PI*2);                        // the half egg
      for (const dx of [2, 5, 8]) m.curve(cx + dx - 1, y - 1, cx + dx + 1, y - 3, cx + dx, y - 5, 1, 2);   // noodles
      m.curve(cx - 6, y - 4, cx - 8, y - 6, cx - 6, y - 8, 1); m.curve(cx - 1, y - 6, cx + 1, y - 8, cx - 1, y - 9, 1);   // steam
      m.line(cx + 4, y - 9, cx + 9, y - 2, 1); m.line(cx + 6, y - 9, cx + 11, y - 3, 1); },                                // chopsticks
    // a cup with a handle on a saucer, steam rising
    coffee(m, w, h){ const cx = w/2, y = 10;
      m.poly([[cx - 8, y], [cx + 7, y], [cx + 5, y + 9], [cx - 6, y + 9]], true, 2);
      m.ellipse(cx + 9, y + 4, 3, 3, 2, 1, -PI/2, PI/2);                     // the handle
      m.line(cx - 11, y + 11, cx + 11, y + 11, 2);                           // the saucer
      m.curve(cx - 3, y - 2, cx - 5, y - 4, cx - 3, y - 6, 1, 2); m.curve(cx + 2, y - 2, cx + 4, y - 4, cx + 2, y - 6, 1, 2); },
    // a washtub with suds
    laundry(m, w, h){ const cx = w/2, y = 9;
      m.poly([[cx - 9, y], [cx + 8, y], [cx + 6, y + 10], [cx - 7, y + 10]], true, 2);
      m.curve(cx - 7, y + 4, cx - 4, y + 2, cx - 1, y + 4, 1, 2); m.curve(cx - 1, y + 4, cx + 2, y + 6, cx + 6, y + 3, 1, 2);   // the water
      m.ellipse(cx - 4, y - 3, 2, 2, 1); m.ellipse(cx + 1, y - 5, 3, 3, 1); m.ellipse(cx + 6, y - 3, 2, 2, 1);                     // suds
      m.line(cx - 8, y + 12, cx - 5, y + 12, 1); m.line(cx + 4, y + 12, cx + 7, y + 12, 1); },
    // a bowl with chopsticks lifting a strand of noodles
    noodles(m, w, h){ const cx = w/2, y = 14;
      m.ellipse(cx, y, 9, 7, 2, 1, 0, PI); m.line(cx - 10, y, cx + 9, y, 2); m.line(cx - 3, y + 8, cx + 3, y + 8, 2);
      m.line(cx - 3, y - 11, cx + 3, y - 1, 1); m.line(cx - 1, y - 11, cx + 5, y - 2, 1);                  // chopsticks
      m.curve(cx - 2, y - 5, cx - 6, y - 4, cx - 5, y, 1, 2); m.curve(cx + 1, y - 4, cx - 2, y - 3, cx - 1, y, 1, 2); m.curve(cx + 4, y - 3, cx + 2, y - 2, cx + 4, y, 1, 2); },
    // a potted plant: three pointed leaves
    plant(m, w, h){ const cx = w/2;
      m.poly([[cx - 6, 15], [cx + 6, 15], [cx + 4, 21], [cx - 4, 21]], true, 2);
      m.line(cx, 15, cx, 10, 2);
      m.curve(cx, 11, cx - 7, 11, cx - 9, 4); m.curve(cx, 11, cx - 4, 4, cx - 9, 4);                  // the left leaf
      m.curve(cx, 11, cx + 7, 11, cx + 9, 4); m.curve(cx, 11, cx + 4, 4, cx + 9, 4);                  // the right leaf
      m.curve(cx, 9, cx - 3, 5, cx, 2); m.curve(cx, 9, cx + 3, 5, cx, 2);                             // the top leaf
      m.line(cx - 7, 15, cx + 7, 15, 1, 2); },
    // a wrench
    repair(m, w, h){ const cx = w/2;
      m.line(cx - 8, h - 7, cx + 3, 6, 2); m.line(cx - 6, h - 6, cx + 5, 7, 2);                       // the handle
      m.ellipse(cx + 6, 6, 4, 4, 2, 1, PI*.9, PI*2.6);                                                 // the jaw
      m.ellipse(cx - 8, h - 6, 2, 2, 1, 1); m.line(cx - 6, 14, cx - 2, 12, 1, 2); },
    // a cocktail glass with an olive
    cocktail(m, w, h){ const cx = w/2;
      m.poly([[cx - 8, 6], [cx + 8, 6], [cx, 16]], true, 2);
      m.line(cx, 16, cx, 22, 2); m.line(cx - 5, 23, cx + 5, 23, 2);
      m.line(cx - 5, 9, cx + 5, 9, 1, 2);                                                               // the drink
      m.line(cx + 4, 3, cx - 2, 12, 1); m.ellipse(cx - 2, 11, 2, 2, 1, 2); },
    // two beamed notes
    music(m, w, h){ const cx = w/2;
      m.fillEllipse(cx - 6, 21, 4, 3); m.fillEllipse(cx + 5, 19, 4, 3);
      m.line(cx - 3, 20, cx - 3, 6, 2); m.line(cx + 8, 18, cx + 8, 4, 2); m.line(cx - 3, 6, cx + 8, 4, 2); m.line(cx - 3, 9, cx + 8, 7, 2, 2); },
    // a joystick on its box
    arcade(m, w, h){ const cx = w/2;
      m.ellipse(cx, 6, 3, 3, 2); m.line(cx, 9, cx, 17, 2);
      m.poly([[cx - 10, 22], [cx - 7, 17], [cx + 8, 17], [cx + 11, 22]], true, 2);
      m.ellipse(cx + 6, 20, 1, 1, 1, 2); m.ellipse(cx + 2, 20, 1, 1, 1, 2); },
    // a medical cross
    clinic(m, w, h){ const cx = w/2, cy = h/2;
      m.poly([[cx - 3, cy - 10], [cx + 3, cy - 10], [cx + 3, cy - 3], [cx + 10, cy - 3], [cx + 10, cy + 3], [cx + 3, cy + 3], [cx + 3, cy + 10], [cx - 3, cy + 10], [cx - 3, cy + 3], [cx - 10, cy + 3], [cx - 10, cy - 3], [cx - 3, cy - 3]], true, 2); },
    // an open book
    books(m, w, h){ const cx = w/2;
      m.poly([[cx - 11, 6], [cx - 1, 8], [cx - 1, 18], [cx - 11, 16]], true, 1); m.poly([[cx + 11, 6], [cx + 1, 8], [cx + 1, 18], [cx + 11, 16]], true, 1);
      m.line(cx, 8, cx, 18, 2);
      for (const y of [10, 12, 14]){ m.line(cx - 9, y - 1, cx - 3, y, 1, 2); m.line(cx + 9, y - 1, cx + 3, y, 1, 2); } },
    // a bed seen from the side
    hotel(m, w, h){ const cx = w/2;
      m.line(cx - 10, 5, cx - 10, 17, 2); m.line(cx + 10, 11, cx + 10, 17, 2);
      m.line(cx - 10, 13, cx + 11, 13, 2);
      m.rect(cx - 8, 9, 7, 4, 1); m.line(cx - 1, 10, cx + 10, 10, 1, 2); },
    // a vinyl disc
    records(m, w, h){ const cx = w/2, cy = h/2;
      m.ellipse(cx, cy, 11, 11, 2); m.ellipse(cx, cy, 4, 4, 1); m.fillEllipse(cx, cy, 1.5, 1.5);
      m.ellipse(cx, cy, 8, 8, 1, 2, PI*.1, PI*.6); m.ellipse(cx, cy, 8, 8, 1, 2, PI*1.1, PI*1.6); },
    // a croissant: a crescent cut into slanted segments, the horns curling in
    bakery(m, w, h){ const cx = w/2, q = (x0, y0, c0, c1, x1, y1, t) => { const u = 1 - t; return [u*u*x0 + 2*u*t*c0 + t*t*x1, u*u*y0 + 2*u*t*c1 + t*t*y1]; };
      m.curve(cx - 12, 17, cx, -3, cx + 12, 17, 2); m.curve(cx - 6, 17, cx, 6, cx + 6, 17, 1);
      m.line(cx - 12, 17, cx - 6, 17, 2); m.line(cx + 12, 17, cx + 6, 17, 2);
      for (const t of [.2, .4, .6, .8]){ const [ox, oy] = q(cx - 12, 17, cx, -3, cx + 12, 17, t), [ix, iy] = q(cx - 6, 17, cx, 6, cx + 6, 17, t); m.line(ox, oy + 1, ix, iy - 1, 1, 2); } },
    // a game controller
    games(m, w, h){ const cx = w/2;
      m.poly([[cx - 11, 7], [cx - 7, 5], [cx + 7, 5], [cx + 11, 7], [cx + 12, 14], [cx + 9, 17], [cx + 5, 13], [cx - 5, 13], [cx - 9, 17], [cx - 12, 14]], true, 2);
      m.line(cx - 7, 9, cx - 3, 9, 1, 2); m.line(cx - 5, 7, cx - 5, 11, 1, 2);
      m.ellipse(cx + 5, 8, 1, 1, 1, 2); m.ellipse(cx + 8, 10, 1, 1, 1, 2); },
  };
  // the sign's own parts: the board with its frame and the icon, into a pixel buffer
  const drawSign = (px, w, h, shop, color) => {
    const sc = ART.NEON[color];
    ART.boardPx(px, w, h, sc);
    const m = new ART.Mask(w, h);
    ART.frame(m, w, h, 0, 2, 1); ICON[shop](m, w, h);
    ART.maskToPx(px, m, sc, 0, 0, { board: (x, y) => { const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y); return dx + dy >= 1; } });
  };
  for (const shop of ART.SHOPS) for (const color of ART.COLORS) SG.reg('sign_' + shop + '_' + color, function (px, R, v, w, h) { drawSign(px, w, h, shop, color); });
  // the police badge: a shield outline in blue tube with a small star at the top, a big red star outline inside, no board (40 x 50)
  const star = (m, cx, cy, ro, ri, wd, v, rot = -PI/2) => { const pts = []; for (let k = 0; k < 10; k++){ const a = rot + k*PI/5, r = k % 2 ? ri : ro; pts.push([cx + Math.cos(a)*r, cy + Math.sin(a)*r]); } m.poly(pts, true, wd, v); };
  SG.reg('sign_police', function (px, R, v, w, h) {
    const blue = { hot: 0x61c3ff, accent: 0x2f84e0 }, red = { hot: 0xff4c4f, accent: 0xc4020b };
    const mb = new ART.Mask(w, h), mr = new ART.Mask(w, h), cx = w/2;
    // the shield: flat top with a dip and two shoulders, sides curving down to a point
    mb.poly([[2, 5], [8, 3], [14, 6], [cx, 1], [26, 6], [32, 3], [38, 5], [37, 24], [34, 35], [27, 43], [cx, 49], [13, 43], [6, 35], [3, 24]], true, 2);
    star(mb, cx, 11, 5, 2.2, 1, 1);
    star(mr, cx, 30, 13, 5.5, 2, 1);
    ART.maskToPx(px, mb, { hot: blue.hot, accent: blue.accent }, 0, 0, { halo: false });
    ART.maskToPx(px, mr, { hot: red.hot, accent: red.accent }, 0, 0, { halo: false });
  });
})();
