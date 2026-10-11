// Neon Terrarium: the lawn tile drawn in code (procedural foliage plan). Runs after spritegen.js, shares its scope. The lawn is one 16 x 16 tile repeated edge to edge (world.js lawn(), the first third of a
// 48 x 16 sheet; the other two thirds are kept for the sheet's old layout), so every tile here wraps round: what leaves on the right comes back on the left. Opaque, three values near the old tile's two
// (#4b7544 and #325745, average about 64, 103, 68), in short blade marks laid on a regular grid, a few lighter tips, no random speckle.
(() => {
  const P = { mid: 0x47703f, dark: 0x325745, dark2: 0x3b6340, light: 0x58824a };
  // a blade mark at (x, y): two dark pixels one above the other (the blade), a mid one beside it for the lit side, a light tip now and then; everything wraps at the tile's edge
  const mark = (px, ox, W, x, y, len, light) => {
    const set = (a, b, c) => px.set(ox + ((a % W) + W) % W, ((b % 16) + 16) % 16, c);
    for (let k = 0; k < len; k++) set(x, y + k, k === 0 && light ? P.light : P.dark);
    set(x - 1, y + len - 1, P.dark2);
  };
  SG.reg('grass', function (px, R, v, w, h) {
    for (let t = 0; t < 3; t++){
      const ox = t*16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px.set(ox + x, y, P.mid);
      if (t === 0){   // fine grass: marks on a 4 x 4 grid, each nudged by a seeded half step, so it reads as an even carpet without lines
        for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) { const jx = R.i(0, 2), jy = R.i(0, 2); mark(px, ox, 16, gx*4 + jx, gy*4 + jy, 2, R.chance(.3)); mark(px, ox, 16, gx*4 + 2 + jy, gy*4 + 2 + jx, R.chance(.6) ? 2 : 1, false); }
      } else if (t === 1){   // sparse tufts (marks of 3, in a wider rhythm)
        for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) { mark(px, ox, 16, gx*8 + R.i(1, 5), gy*8 + R.i(0, 4), 3, true); mark(px, ox, 16, gx*8 + R.i(1, 5) + 2, gy*8 + R.i(0, 4) + 3, 2, false); }
      } else {   // long blades: runs of 3 to 4
        for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 3; gx++) mark(px, ox, 16, gx*5 + R.i(0, 3), gy*4 + R.i(0, 2), R.i(3, 4), R.chance(.5));
      }
    }
  });
  // the lawn from far, once its tufts (gt0) have merged into a carpet: the tile with every pixel drawn three quarters of the way to the tufts' average color (what the eye averages from above), so the
  // swap at the far zoom (sprites.js folFar) changes the average little. Drawn from the tuft generator itself, so it follows it if it changes.
  SG.reg('grassFar', function (px, R, v, w, h) {
    let r = 0, g = 0, b = 0, n = 0;
    if (SG.has('gt0')) for (let k = 0; k < SG.COUNT.gt0; k++){ const t = SG.draw('gt0', 16, 15, k); for (let i = 0; i < t.d.length; i += 4) if (t.d[i + 3]){ r += t.d[i]; g += t.d[i + 1]; b += t.d[i + 2]; n++; } }
    const avg = n ? SG.pack(r/n, g/n, b/n) : P.mid, base = SG.draw('grass', w, h, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(x, y, SG.mix(SG.mix(base.get(x, y), avg, .75), 0x000000, .04));
  });
})();
