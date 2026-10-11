// Neon Terrarium: the wanted posters and the radio cassette drawn in code (procedural art plan, items 2 and 3). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// WANTED: nine posters of 64 x 68 side by side (the police station's screens pick a frame; the board is transparent and the lines glow over the screen, as the old picture did). Each poster is a neon
// frame, "WANTED" in the bold font, a masked or helmeted face in line art, and the reward and class in the 3x5 font. A face is made of parts (head shape, eyes, mouth, top, mark); the parts are
// drawn into one Mask per poster and colored at blit time. Small details (which panel lines, where the scar runs) come from a fixed seed (SG.rng), so the same pixels come out every time.
// CASSETTE: 59 x 44 neon line art (shell, label window, two reel holes, screws, tape window). The two reel holes sit exactly under the CSS reels (.reel.l, .reel.r in style.css).
(() => {
  const PI = Math.PI;
  const SCH = {   // hot tube, accent (its shade), and the dim of the small print
    cyan:   { hot: 0x96fff5, accent: 0x1ebeb9 }, pink: { hot: 0xff96cd, accent: 0xe6328c }, green: { hot: 0xa6ffa0, accent: 0x32c85a }, amber: { hot: 0xffd78c, accent: 0xeb8c28 },
    violet: { hot: 0xdcaaff, accent: 0x9a46e6 }, red:  { hot: 0xff9a9a, accent: 0xe03a3a }, blue: { hot: 0xa6ccff, accent: 0x4a82ee },
  };
  const hx = ART.hexs;
  // ---------- face parts (m: the poster's mask; layer 1 the tube, 2 the accent) ----------
  const P = {
    // a head outline: an ellipse
    egg(m, cx, cy, rx, ry, v = 1){ m.ellipse(cx, cy, rx, ry, 1, v); },
    // a filled band or lens, outlined: pts polygon, fill accent, rim hot
    lens(m, pts){ m.fillPoly(pts, 2); m.poly(pts, true, 1, 1); },
    round(m, cx, cy, rx, ry){ m.fillEllipse(cx, cy, rx, ry, 2); m.ellipse(cx, cy, rx, ry, 1, 1); },
    glint(m, x, y, n = 3){ m.line(x, y, x + n - 1, y, 1, 1); },
    // a grille: n horizontal bars (or vertical when vert)
    grille(m, x, y, w, h, n, vert, v = 2){ for (let i = 0; i < n; i++){ const t = n === 1 ? 0 : i/(n - 1); if (vert){ const xx = Math.round(x + t*(w - 1)); m.line(xx, y, xx, y + h - 1, 1, v); } else { const yy = Math.round(y + t*(h - 1)); m.line(x, yy, x + w - 1, yy, 1, v); } } },
    // a rod ending in a ball
    antenna(m, x0, y0, x1, y1){ m.line(x0, y0, x1, y1, 1, 1); m.dot(x1 - 1, y1 - 1, 2, 1); },
    spike(m, x, y, w, h, v = 1){ m.fillPoly([[x - w/2, y], [x, y - h], [x + w/2, y]], v); },
    scar(m, x, y, dx, dy, ticks = 3){ m.line(x, y, x + dx, y + dy, 1, 1); for (let i = 1; i <= ticks; i++){ const t = i/(ticks + 1), px = x + dx*t, py = y + dy*t; m.line(px - 2, py - 1, px + 1, py + 1, 1, 1); } },
    cross(m, x, y){ m.line(x - 2, y, x + 2, y, 1, 1); m.line(x, y - 2, x, y + 2, 1, 1); },
    star(m, x, y){ m.line(x - 2, y, x + 2, y, 1, 1); m.line(x, y - 2, x, y + 2, 1, 1); m.set(x - 1, y - 1, 2); m.set(x + 1, y - 1, 2); m.set(x - 1, y + 1, 2); m.set(x + 1, y + 1, 2); },
    heart(m, x, y){ m.set(x - 2, y - 1, 1); m.set(x - 1, y - 2, 1); m.set(x, y - 1, 1); m.set(x + 1, y - 2, 1); m.set(x + 2, y - 1, 1); m.line(x - 2, y, x, y + 2, 1, 1); m.line(x + 2, y, x, y + 2, 1, 1); },
    bolt(m, x, y){ m.dot(x, y, 2, 1); },
  };
  // ---------- the nine characters: fn(m, rng) draws the head inside x 4..59, y 12..53, centre x 32 ----------
  const CAST = [
    // 1 NIX, a hacker: round helmet, headset with a mic, a wide visor, a breather grille, two antennas
    { dy: 2, alias: 'NIX', cls: 'HACKER', reward: '4,500', sch: 'cyan', draw(m, r){
      P.egg(m, 32, 33, 14, 17);
      m.ellipse(32, 33, 18, 20, 1, 2, PI*1.04, PI*1.96);                                                   // the headset band
      for (const x of [13, 47]){ m.fillRect(x, 28, 4, 11, 2); m.rect(x, 28, 4, 11, 1, 1); }                 // ear cups
      m.curve(15, 39, 15, 49, 26, 47, 1, 1); m.dot(26, 46, 2, 1);                                          // the mic boom
      P.lens(m, [[20, 27], [44, 27], [42, 32], [22, 32]]); P.glint(m, 24, 28, 5);
      m.line(26, 20, 38, 20, 1, 2); m.line(28, 22, 36, 22, 1, 2);
      m.rect(26, 37, 13, 8, 1, 1); P.grille(m, 28, 39, 9, 4, 4, true);
      P.antenna(m, 24, 17, 22, 11); P.antenna(m, 40, 17, 42, 11);
      P.scar(m, 36, 33, 4, 3, 1); } },
    // 2 VEX, a runner: a pointed hood, round goggles, a respirator with two filters
    { alias: 'VEX', cls: 'RUNNER', reward: '3,200', sch: 'pink', draw(m, r){
      m.curve(14, 52, 12, 24, 32, 12, 1, 1); m.curve(32, 12, 52, 24, 50, 52, 1, 1);                         // the hood
      m.curve(19, 48, 17, 32, 26, 20, 1, 2); m.curve(45, 48, 47, 32, 38, 20, 1, 2);                         // its folds
      m.ellipse(32, 35, 11, 14, 1, 1, PI*1.02, PI*1.98); m.line(21, 35, 21, 44, 1, 1); m.line(43, 35, 43, 44, 1, 1);
      P.round(m, 26, 31, 4, 4); P.round(m, 38, 31, 4, 4); m.line(30, 31, 34, 31, 1, 1); P.glint(m, 24, 29, 2); P.glint(m, 36, 29, 2);
      m.fillPoly([[23, 38], [41, 38], [38, 48], [26, 48]], 2); m.poly([[23, 38], [41, 38], [38, 48], [26, 48]], true, 1, 1);
      P.grille(m, 28, 40, 7, 6, 3, true, 1);
      m.ellipse(23, 44, 3, 3, 1, 1); m.ellipse(41, 44, 3, 3, 1, 1);
      P.star(m, 32, 18); } },
    // 3 BLIP, a medic: a domed head, big bug eyes, ear fins, antennas with balls, a grille mouth and a cross
    { dy: 2, alias: 'BLIP', cls: 'MEDIC', reward: '6,000', sch: 'green', draw(m, r){
      P.egg(m, 32, 32, 15, 16);
      P.antenna(m, 25, 17, 20, 11); P.antenna(m, 39, 17, 44, 11);
      for (const s of [-1, 1]){ const x = 32 + s*15; m.fillPoly([[x, 25], [x + s*6, 31], [x, 37]], 2); m.poly([[x, 25], [x + s*6, 31], [x, 37]], true, 1, 1); }
      P.round(m, 25, 31, 5, 5); P.round(m, 39, 31, 5, 5); m.dot(23, 29, 2, 1); m.dot(37, 29, 2, 1);
      P.cross(m, 32, 21); m.rect(26, 39, 13, 7, 1, 1); P.grille(m, 28, 41, 9, 3, 2, false, 1);
      m.line(30, 31, 34, 31, 1, 1); m.curve(18, 40, 22, 47, 28, 48, 1, 2); m.curve(46, 40, 42, 47, 36, 48, 1, 2); } },
    // 4 GASPAR, a smuggler: a gas mask, two round lenses, twin filter canisters and a snout, head straps
    { dy: 1, alias: 'GASPAR', cls: 'DEALER', reward: '8,500', sch: 'amber', draw(m, r){
      P.egg(m, 32, 32, 15, 18);
      m.curve(17, 22, 22, 15, 32, 15, 1, 2); m.curve(47, 22, 42, 15, 32, 15, 1, 2); m.line(32, 15, 32, 12, 1, 2);   // the straps over the head
      P.round(m, 25, 30, 5, 5); P.round(m, 39, 30, 5, 5); P.glint(m, 22, 27, 2); P.glint(m, 36, 27, 2);
      m.line(30, 30, 34, 30, 1, 1);
      m.fillPoly([[27, 38], [37, 38], [35, 48], [29, 48]], 2); m.poly([[27, 38], [37, 38], [35, 48], [29, 48]], true, 1, 1); P.grille(m, 30, 40, 5, 6, 3, true, 1);
      for (const x of [20, 44]){ m.ellipse(x, 44, 4, 4, 1, 1); m.fillEllipse(x, 44, 2, 2, 2); m.line(x, 40, x, 48, 1, 1); }
      P.scar(m, 21, 24, 6, 11, 2); } },
    // 5 MOTH, an assassin: cat-eared hood, slanted slit eyes, a stitched mouth, a scar
    { dy: 2, alias: 'MOTH', cls: 'GHOST', reward: '9,000', sch: 'violet', draw(m, r){
      m.poly([[17, 24], [18, 10], [28, 17]], false, 1, 1); m.poly([[47, 24], [46, 10], [36, 17]], false, 1, 1); m.fillPoly([[19, 20], [19, 13], [25, 18]], 2); m.fillPoly([[45, 20], [45, 13], [39, 18]], 2);
      P.egg(m, 32, 33, 15, 17);
      P.lens(m, [[19, 28], [30, 31], [30, 35], [21, 33]]); P.lens(m, [[45, 28], [34, 31], [34, 35], [43, 33]]);
      m.line(32, 31, 32, 38, 1, 1); m.line(24, 21, 28, 24, 1, 2); m.line(40, 21, 36, 24, 1, 2);
      m.line(23, 43, 41, 43, 1, 1); for (const x of [25, 28, 31, 34, 37, 40]) m.line(x, 41, x, 45, 1, 1);
      P.scar(m, 39, 22, 3, 15, 3); } },
    // 6 BRICK, an enforcer: a bucket helmet with a T slot, horns, rivets, chin vents
    { alias: 'BRICK', cls: 'MUSCLE', reward: '7,500', sch: 'red', draw(m, r){
      const pts = [[16, 19], [48, 19], [50, 40], [44, 52], [20, 52], [14, 40]]; m.fillPoly(pts, 0); m.poly(pts, true, 1, 1);
      P.spike(m, 23, 19, 6, 7); P.spike(m, 41, 19, 6, 7);
      P.lens(m, [[19, 27], [45, 27], [45, 32], [19, 32]]); P.lens(m, [[29, 32], [35, 32], [35, 43], [29, 43]]); P.glint(m, 21, 28, 6);
      for (const [x, y] of [[19, 23], [45, 23], [18, 44], [46, 44]]) m.dot(x, y, 1, 1);
      P.grille(m, 22, 46, 20, 4, 2, false, 2); m.line(26, 20, 38, 20, 1, 2);
      P.scar(m, 40, 33, 5, 9, 2); } },
    // 7 ORBIT, a tech: a square robot head, one big eye, an antenna with a ball, a speaker mouth, ear discs
    { alias: 'ORBIT', cls: 'TECH', reward: '4,000', sch: 'blue', draw(m, r){
      const pts = [[21, 19], [43, 19], [47, 23], [47, 47], [43, 51], [21, 51], [17, 47], [17, 23]]; m.poly(pts, true, 1, 1);
      P.antenna(m, 32, 19, 32, 14); P.antenna(m, 38, 19, 42, 15);
      m.fillEllipse(32, 31, 8, 7, 2); m.ellipse(32, 31, 8, 7, 1, 1); m.ellipse(32, 31, 4, 3, 1, 1); m.dot(31, 30, 2, 1);
      m.rect(23, 40, 18, 8, 1, 1); P.grille(m, 25, 42, 14, 4, 3, false, 2); m.line(21, 25, 25, 25, 1, 2); m.line(39, 25, 43, 25, 1, 2);
      for (const x of [13, 51]){ m.ellipse(x, 34, 3, 4, 1, 1); m.fillEllipse(x, 34, 1, 2, 2); } m.line(17, 34, 14, 34, 1, 1); m.line(47, 34, 50, 34, 1, 1);
      m.line(23, 51, 23, 53, 1, 2); m.line(41, 51, 41, 53, 1, 2); } },
    // 8 HOLLOW, a saboteur: a skull mask, hollow eyes, a cracked brow, a toothy jaw
    { alias: 'HOLLOW', cls: 'BOMBER', reward: '5,500', sch: 'cyan', draw(m, r){
      m.ellipse(32, 30, 15, 15, 1, 1, PI*.82, PI*2.18); m.poly([[20, 36], [22, 42], [24, 52], [40, 52], [42, 42], [44, 36]], false, 1, 1);
      m.fillEllipse(25, 31, 4, 5, 2); m.ellipse(25, 31, 4, 5, 1, 1); m.fillEllipse(39, 31, 4, 5, 2); m.ellipse(39, 31, 4, 5, 1, 1);
      m.fillPoly([[32, 37], [30, 42], [34, 42]], 2); m.poly([[32, 37], [30, 42], [34, 42]], true, 1, 1);
      m.line(24, 46, 40, 46, 1, 1); for (const x of [27, 30, 33, 36]) m.line(x, 44, x, 51, 1, 1);
      m.poly([[34, 16], [32, 20], [35, 23], [33, 26]], false, 1, 1);
      m.line(19, 21, 22, 24, 1, 2); m.line(45, 21, 42, 24, 1, 2); } },
    // 9 DOLL, a thief: a mohawk of spikes, round shades, a grin, ear rings, a heart sticker
    { alias: 'DOLL', cls: 'THIEF', reward: '5,000', sch: 'pink', draw(m, r){
      P.egg(m, 32, 37, 12, 15);
      const hs = [6, 9, 12, 14, 12, 9, 6]; for (let i = 0; i < 7; i++){ const x = 32 + (i - 3)*3.6, y = 24 + Math.abs(i - 3)*1.2 + 1; P.spike(m, x, y, 4, hs[i] - 2 + (r() < .5 ? 1 : 0), 2); m.line(x, y, x, y - hs[i] + 2, 1, 1); }
      for (const x of [20, 35]){ m.fillRect(x, 31, 9, 5, 2); m.rect(x, 31, 9, 5, 1, 1); P.glint(m, x + 1, 32, 2); } m.line(29, 32, 35, 32, 1, 1);
      m.curve(25, 43, 32, 50, 39, 43, 1, 1); m.line(26, 45, 38, 45, 1, 2);
      m.ellipse(18, 42, 2, 2, 1, 1); m.ellipse(46, 42, 2, 2, 1, 1); P.heart(m, 39, 40); } },
  ];
  const BANDS = [0, 0];
  function drawPoster(g, i, ox){
    const c = CAST[i], sc = SCH[c.sch], m = new ART.Mask(64, 68), rng = SG.rng(0x3a17 + i*7919).f;
    ART.frame(m, 64, 68, 0, 2, 1, 1); ART.frame(m, 64, 68, 1, 2, 1, 2);                      // the frame: a bright rule with a dim one inside it
    const f = new ART.Mask(64, 68); c.draw(f, rng); f.copyInto(m, 0, c.dy || 0);              // the face, moved down to sit under the title
    ART.paintMask(g, m, { hot: sc.hot, accent: sc.accent }, ox, 0, { halo: false });
    // the title, in the bold font with a one pixel drop of the accent, centered
    ART.text(g, 'WANTED', ox + 32, 3, 'bold', { color: hx(sc.hot), gap: 2, shadow: { color: hx(sc.accent), dx: 1, dy: 1 }, align: 'center' });
    ART.text(g, 'REWARD ' + c.reward + ' CR', ox + 32, 55, '3x5', { color: hx(sc.hot), align: 'center' });
    ART.text(g, 'CLASS: ' + c.cls, ox + 32, 61, '3x5', { color: hx(SG.mix(sc.accent, 0xffffff, .25)), align: 'center' });
  }
  ART.WANTED_CAST = CAST;
  ART.reg('wanted', (g, w, h) => { for (let i = 0; i < CAST.length; i++) drawPoster(g, i, i*64); }, { defer: true });

  // ---------- the radio cassette ----------
  // the reels (style.css): .reel 8 x 8 css px at left 30 / 79 and top 35 of the 118 x 88 box, so at the picture's 2x: left reel centre (17, 19.5), right reel centre (41.5, 19.5), a 4 x 4 square of spokes
  ART.reg('cassette', (g, w, h) => {
    const m = new ART.Mask(w, h), sc = { hot: 0xff77ff, accent: 0xb429d0 };
    const body = [[3, 1], [55, 1], [57, 3], [57, 40], [55, 42], [3, 42], [1, 40], [1, 3]];
    // the shell: a filled dark violet body (transparent outside), the rim tube
    g.fillStyle = '#4a1472'; for (let y = 1; y <= 42; y++){ const d = Math.min(y - 1, 42 - y), ins = d === 0 ? 2 : d === 1 ? 1 : 0; g.fillRect(1 + ins, y, 57 - 2*ins, 1); }
    m.poly(body, true, 1, 1);
    m.poly([[4, 3], [54, 3], [55, 4], [55, 39], [54, 40], [4, 40], [3, 39], [3, 4]], true, 1, 2);       // an inner rule
    // the label window: a lighter panel with two ruled lines and a title bar
    g.fillStyle = '#8a24a8'; g.fillRect(8, 5, 43, 8);
    m.rect(7, 4, 45, 10, 1, 1); m.line(10, 7, 48, 7, 1, 1); m.line(10, 10, 40, 10, 1, 2);
    m.fillRect(43, 9, 6, 2, 1);
    // the reel window: a racetrack with the counter window between the reels
    m.ellipse(17, 19.5, 6, 5, 1, 1); m.ellipse(41.5, 19.5, 6, 5, 1, 1); m.line(17, 14, 41, 14, 1, 1); m.line(17, 25, 41, 25, 1, 1);
    m.rect(25, 16, 9, 7, 1, 2); for (const x of [27, 30, 33]) m.line(x, 21, x, 22, 1, 2);
    // the two reel holes (transparent, the spokes of the CSS reels turn behind the ring), a ring of tube around each
    const holes = [[17, 19.5, 6], [41.5, 19.5, 7]];
    // the bottom: a trapezoid with the tape window, two screws at the corners
    m.poly([[10, 30], [48, 30], [51, 41], [7, 41]], true, 1, 1);
    g.fillStyle = '#240a3d'; g.fillRect(13, 33, 33, 6);
    m.line(13, 33, 45, 33, 1, 2); m.line(13, 38, 45, 38, 1, 2);
    for (const x of [19, 25, 33, 39]) m.line(x, 34, x, 37, 1, 2);
    m.line(29, 30, 29, 33, 1, 1); m.dot(28, 33, 3, 1);
    for (const [x, y] of [[5, 5], [53, 5], [5, 38], [53, 38]]){ m.ellipse(x, y, 1, 1, 1, 1); }
    for (const [x, y] of [[5, 28], [53, 28]]){ m.ellipse(x, y, 1, 1, 1, 1); }
    ART.paintMask(g, m, sc, 0, 0, { halo: false });
    // the holes last: clear a six by five (left) and seven by five (right) rounded window and ring it
    g.save();
    for (const [cx, cy, wd] of holes){ const x0 = Math.round(cx - wd/2), rows = [wd - 2, wd, wd, wd, wd - 2];
      for (let j = 0; j < 5; j++){ const ww = rows[j]; g.clearRect(x0 + (wd - ww)/2, 17 + j, ww, 1); }
      g.fillStyle = hx(0xb429d0); g.fillRect(x0 + 1, 22, wd - 2, 1); }
    g.restore();
  });
})();
