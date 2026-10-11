// Neon Terrarium: the shared drawing tools of the art generators (procedural art plan). Runs after artgen.js, shares its scope; touches no game state.
//  * Bitmap fonts drawn in code: '3x5' (tiny print), '5x7' (signs and small print), 'bold' (the 5x7 thickened, headlines), 'narrow' (3x5 stretched to 7 rows, tall narrow boards). Upper case, digits and the
//    punctuation the copy uses. Hard pixels only. ART.text / ART.textW / ART.textMask.
//  * A Mask: a small grid of layer values (0 empty, 1 hot tube, 2 accent, 3 halo) with line, curve, ellipse, polygon, fill and text drawing; ART.paintMask colors it at blit time, so one drawing gives all the
//    colors of a sign (the tube's lit upper left, a darker shade on the lower right where it meets empty space, a soft halo ring one pixel out on the board). Painting goes through canvas fills of
//    horizontal runs, not per-pixel generators, so it stays fast.
//  * Boards: ART.board draws the dark rounded or chamfered backing with its frame.
// Style (spritegen.js header applies): true pixel size, no anti-aliasing, the tube is the brightest value, never pure white (a one-pixel hot core only where the old art had one).
(() => {
  // ---------- fonts ----------
  const rows = s => s.split(',');
  const F57 = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110', D: '11110,10001,10001,10001,10001,10001,11110',
    E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000', G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001',
    I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,11001,10101,10011,10001,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000',
    Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001', S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
    U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,11011,10001', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111', 3: '11110,00001,00001,01110,00001,00001,11110',
    4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110', 6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000',
    8: '01110,10001,10001,01110,10001,10001,01110', 9: '01110,10001,10001,01111,00001,00010,01100',
    '.': '00000,00000,00000,00000,00000,01100,01100', ',': '00000,00000,00000,00000,01100,00100,01000', '!': '00100,00100,00100,00100,00100,00000,00100', '?': '01110,10001,00001,00010,00100,00000,00100',
    ':': '00000,01100,01100,00000,01100,01100,00000', '-': '00000,00000,00000,11111,00000,00000,00000', '+': '00000,00100,00100,11111,00100,00100,00000', '*': '00000,10101,01110,11111,01110,10101,00000',
    '/': '00001,00001,00010,00100,01000,10000,10000', '%': '11001,11010,00010,00100,01000,01011,10011', "'": '00100,00100,01000,00000,00000,00000,00000', '&': '01100,10010,10100,01000,10101,10010,01101',
    '(': '00010,00100,01000,01000,01000,00100,00010', ')': '01000,00100,00010,00010,00010,00100,01000', '=': '00000,00000,11111,00000,11111,00000,00000', '#': '01010,01010,11111,01010,11111,01010,01010',
    '_': '00000,00000,00000,00000,00000,00000,11111', ' ': '000,000,000,000,000,000,000',
  };
  const F35 = {
    A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011', D: '110,101,101,101,110', E: '111,100,110,100,111', F: '111,100,110,100,100', G: '011,100,101,101,011',
    H: '101,101,111,101,101', I: '111,010,010,010,111', J: '001,001,001,101,010', K: '101,101,110,101,101', L: '100,100,100,100,111', M: '101,111,111,101,101', N: '110,101,101,101,101',
    O: '010,101,101,101,010', P: '110,101,110,100,100', Q: '010,101,101,111,011', R: '110,101,110,101,101', S: '011,100,010,001,110', T: '111,010,010,010,010', U: '101,101,101,101,111',
    V: '101,101,101,101,010', W: '101,101,111,111,101', X: '101,101,010,101,101', Y: '101,101,010,010,010', Z: '111,001,010,100,111',
    0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '110,001,010,100,111', 3: '110,001,110,001,110', 4: '101,101,111,001,001', 5: '111,100,110,001,110', 6: '011,100,111,101,111',
    7: '111,001,010,010,010', 8: '111,101,111,101,111', 9: '111,101,111,001,110',
    '.': '000,000,000,000,010', ',': '000,000,000,010,100', '!': '010,010,010,000,010', '?': '110,001,010,000,010', ':': '000,010,000,010,000', '-': '000,000,111,000,000', '+': '000,010,111,010,000',
    '*': '000,101,010,101,000', '/': '001,001,010,100,100', '%': '101,001,010,100,101', "'": '010,010,000,000,000', '(': '010,100,100,100,010', ')': '010,001,001,001,010', '=': '000,111,000,111,000',
    ' ': '00,00,00,00,00', '_': '000,000,000,000,111',
  };
  const FONTS = {};
  const build = (src, h) => { const o = {}; for (const k in src){ const r = rows(src[k]); o[k] = { w: r[0].length, h, r }; } return o; };
  FONTS['5x7'] = build(F57, 7); FONTS['3x5'] = build(F35, 5);
  // bold: the 5x7 with every stroke one pixel wider to the right (a 6 x 7 letter); narrow: the 3x5 stretched to 7 rows (rows 1 and 3 doubled), a tall thin letter
  FONTS.bold = {}; for (const k in F57){ const r = rows(F57[k]), w = r[0].length; FONTS.bold[k] = { w: w + (k === ' ' ? 0 : 1), h: 7, r: r.map(s => { let o = ''; for (let i = 0; i < w + 1; i++) o += ((s[i] === '1') || (s[i - 1] === '1')) ? '1' : '0'; return k === ' ' ? s : o; }) }; }
  FONTS.narrow = {}; for (const k in F35){ const r = rows(F35[k]); FONTS.narrow[k] = { w: r[0].length, h: 7, r: [r[0], r[1], r[1], r[2], r[3], r[3], r[4]] }; }
  ART.FONTS = FONTS;
  const glyphOf = (font, ch) => FONTS[font][ch] || FONTS[font][ch.toUpperCase()] || FONTS[font]['?'];
  // the width of a string in pixels (gap pixels between letters), at integer scale s
  ART.textW = (str, font = '5x7', o = {}) => { const gap = o.gap === undefined ? 1 : o.gap, s = o.scale || 1; let w = 0; for (const ch of String(str)) w += glyphOf(font, ch).w*s + gap*s; return Math.max(0, w - gap*s); };
  ART.textH = (font = '5x7', o = {}) => FONTS[font]['A'].h*(o.scale || 1);
  // calls put(x, y) for every lit pixel of the string (x, y its top left)
  const eachPx = (str, x, y, font, o, put) => {
    const gap = o.gap === undefined ? 1 : o.gap, s = o.scale || 1; let cx = x;
    for (const ch of String(str)){ const gl = glyphOf(font, ch);
      gl.r.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] === '1') put(cx + xx*s, y + yy*s, s); });
      cx += gl.w*s + gap*s; }
  };
  // text on a canvas 2d context: o.color (default white), o.scale, o.gap, o.shadow {color, dx, dy}, o.align 'left'|'center'|'right' (x is then the centre or the right end)
  ART.text = (g, str, x, y, font = '5x7', o = {}) => {
    const w = ART.textW(str, font, o); if (o.align === 'center') x = Math.round(x - w/2); else if (o.align === 'right') x = x - w;
    if (o.shadow){ g.fillStyle = o.shadow.color; eachPx(str, x + (o.shadow.dx || 1), y + (o.shadow.dy || 1), font, o, (px, py, s) => g.fillRect(px, py, s, s)); }
    g.fillStyle = o.color || '#ffffff'; eachPx(str, x, y, font, o, (px, py, s) => g.fillRect(px, py, s, s)); return w;
  };
  // text into a mask (layer value v)
  ART.textMask = (m, str, x, y, font = '5x7', o = {}) => {
    const w = ART.textW(str, font, o); if (o.align === 'center') x = Math.round(x - w/2); else if (o.align === 'right') x = x - w;
    eachPx(str, x, y, font, o, (px, py, s) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) m.set(px + i, py + j, o.v || 1); }); return w;
  };
  // ---------- the mask ----------
  class Mask {
    constructor(w, h){ this.w = w; this.h = h; this.d = new Uint8Array(w*h); }
    set(x, y, v = 1){ x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y*this.w + x] = v; }
    get(x, y){ return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y*this.w + x] : 0; }
    clear(x, y){ this.set(x, y, 0); }
    // a dot of width wd (2 = a 2 x 2 square whose top left is (x, y))
    dot(x, y, wd = 1, v = 1){ x = Math.round(x); y = Math.round(y); for (let j = 0; j < wd; j++) for (let i = 0; i < wd; i++) this.set(x + i, y + j, v); }
    line(x0, y0, x1, y1, wd = 1, v = 1){
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (;;){ this.dot(x0, y0, wd, v); if (x0 === x1 && y0 === y1) break; const e2 = 2*e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } }
      return this; }
    poly(pts, close = true, wd = 1, v = 1){ for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], wd, v); if (close && pts.length > 2) this.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], wd, v); return this; }
    // a quadratic curve through the control point
    curve(x0, y0, cx, cy, x1, y1, wd = 1, v = 1){ const n = Math.max(8, Math.ceil(Math.hypot(x1 - x0, y1 - y0)*1.5)); let lx = x0, ly = y0;
      for (let k = 1; k <= n; k++){ const t = k/n, u = 1 - t, x = u*u*x0 + 2*u*t*cx + t*t*x1, y = u*u*y0 + 2*u*t*cy + t*t*y1; this.line(lx, ly, x, y, wd, v); lx = x; ly = y; } return this; }
    // an ellipse outline, or an arc of it (angles in radians, 0 to the right, clockwise on screen because y runs down)
    ellipse(cx, cy, rx, ry, wd = 1, v = 1, a0 = 0, a1 = Math.PI*2){ const n = Math.max(16, Math.ceil(Math.max(rx, ry)*Math.abs(a1 - a0)*3)); let px = null, py = null;
      for (let k = 0; k <= n; k++){ const a = a0 + (a1 - a0)*k/n, x = Math.round(cx + Math.cos(a)*rx - (wd > 1 ? .5 : 0)), y = Math.round(cy + Math.sin(a)*ry - (wd > 1 ? .5 : 0));
        if (px !== null && (x !== px || y !== py)) this.line(px, py, x, y, wd, v); else if (px === null) this.dot(x, y, wd, v); px = x; py = y; } return this; }
    fillEllipse(cx, cy, rx, ry, v = 1){ for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++){ const nx = (x + .5 - cx)/rx, ny = (y + .5 - cy)/ry; if (nx*nx + ny*ny <= 1) this.set(x, y, v); } return this; }
    rect(x, y, w, h, wd = 1, v = 1){ this.fillRect(x, y, w, wd, v); this.fillRect(x, y + h - wd, w, wd, v); this.fillRect(x, y, wd, h, v); this.fillRect(x + w - wd, y, wd, h, v); return this; }
    fillRect(x, y, w, h, v = 1){ for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v); return this; }
    // a filled polygon (even-odd scanlines at pixel centres)
    fillPoly(pts, v = 1){ let y0 = 1e9, y1 = -1e9; for (const p of pts){ y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++){ const yy = y + .5, xs = [];
        for (let i = 0; i < pts.length; i++){ const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1])/(b[1] - a[1])*(b[0] - a[0])); }
        xs.sort((p, q) => p - q); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, v); } return this; }
    // the mask moved by (dx, dy) and mirrored left to right (about its own centre) when flip
    copyInto(m, dx = 0, dy = 0, flip = false){ for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++){ const v = this.d[y*this.w + x]; if (v) m.set((flip ? this.w - 1 - x : x) + dx, y + dy, v); } return m; }
    // pixels counted per layer (the load budget counts these)
    count(){ let n = 0; for (let i = 0; i < this.d.length; i++) if (this.d[i]) n++; return n; }
  }
  ART.Mask = Mask;
  // ---------- colors ----------
  const hexs = c => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  ART.hexs = hexs;
  // a neon scheme from the tube's bright color: hot (the tube), accent (its darker shade where the tube turns away from the light), halo (a faint glow ring one pixel out on the board), board
  ART.scheme = (hot, accent, board, haloK = .28) => ({ hot: hot, accent: accent, board: board, halo: SG.mix(board, accent, haloK) });
  // the old signs' three colors (kept: the tube is above 0.35 in brightness and the board below it, the sprite shader's evening switch-on depends on it)
  ART.NEON = { pink: ART.scheme(0xff96cd, 0xe6328c, 0x1b1e4a), cyan: ART.scheme(0x96fff5, 0x1ebeb9, 0x1b1e4a), amber: ART.scheme(0xffd78c, 0xeb8c28, 0x1b1e4a) };
  // a mask colored: 0 nothing, 1 hot, 2 accent, 3 halo (empty pixels next to a tube, on the board) per pixel. The 'edge' step turns the lower right side of a thick tube to the accent (a pixel whose
  // neighbour above or left is tube, and whose neighbour below or right is empty); layer 2 is always the accent, layer 1 the hot tube.
  ART.maskLayers = (m, sc, o = {}) => {
    const w = m.w, h = m.h, out = new Uint8Array(w*h), at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? m.d[y*w + x] : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const v = m.d[y*w + x];
      if (v === 1){ const lit = (at(x, y - 1) || at(x - 1, y)); out[y*w + x] = (o.edge !== false && lit && (!at(x + 1, y) || !at(x, y + 1))) ? 2 : 1; }
      else if (v === 2) out[y*w + x] = 2;
      else if (v === 0 && o.halo !== false && sc.halo !== undefined && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) out[y*w + x] = 3;
    }
    return out;
  };
  // paint a mask onto a canvas at (ox, oy), one fillRect per horizontal run
  ART.paintMask = (g, m, sc, ox = 0, oy = 0, o = {}) => {
    const w = m.w, h = m.h, out = ART.maskLayers(m, sc, o), cols = [null, hexs(sc.hot), hexs(sc.accent), hexs(sc.halo === undefined ? 0 : sc.halo)];
    for (let v = 3; v >= 1; v--){ g.fillStyle = cols[v];
      for (let y = 0; y < h; y++){ let x = 0; while (x < w){ if (out[y*w + x] !== v){ x++; continue; } let x1 = x; while (x1 < w && out[y*w + x1] === v) x1++; g.fillRect(ox + x, oy + y, x1 - x, 1); x = x1; } } }
  };
  // the same into a spritegen pixel buffer (SG.Px), for the sprite-atlas kinds (halo pixels only where the board is: o.board is a function (x, y) -> bool, default everywhere)
  ART.maskToPx = (px, m, sc, ox = 0, oy = 0, o = {}) => {
    const out = ART.maskLayers(m, sc, o);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++){ const v = out[y*m.w + x]; if (!v) continue;
      if (v === 3 && o.board && !o.board(x, y)) continue; px.set(ox + x, oy + y, v === 1 ? sc.hot : v === 2 ? sc.accent : sc.halo); }
  };
  // ---------- boards ----------
  // the dark backing: a w x h rectangle with its corners cut by one pixel (chamfer c, default 1), board color from the scheme; draws the frame tube into mask m (a 1 pixel rule at the edge, inset i)
  ART.board = (g, w, h, sc, o = {}) => {
    const c = o.chamfer === undefined ? 1 : o.chamfer; g.fillStyle = hexs(sc.board);
    for (let y = 0; y < h; y++){ const dy = Math.min(y, h - 1 - y), inset = Math.max(0, c - dy); g.fillRect(inset, y, w - 2*inset, 1); }
  };
  // the board into a spritegen pixel buffer (same shape as ART.board)
  ART.boardPx = (px, w, h, sc, o = {}) => { const c = o.chamfer === undefined ? 1 : o.chamfer;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y); if (dx + dy >= c) px.set(x, y, sc.board); } };
  // a frame tube into a mask: inset i pixels from the edge, corners cut by c pixels
  ART.frame = (m, w, h, i = 0, c = 2, wd = 1, v = 1) => { m.poly([[i + c, i], [w - 1 - i - c, i], [w - 1 - i, i + c], [w - 1 - i, h - 1 - i - c], [w - 1 - i - c, h - 1 - i], [i + c, h - 1 - i], [i, h - 1 - i - c], [i, i + c]], true, wd, v); return m; };
})();
