// Neon Terrarium: code-drawn sprites, family "shrubs and laundry": bush, bushFlower, bonsai, bamboo, succulent and the twelve pieces of laundry. Runs after spritegen.js (shared scope: SG).
// Style rules are in the header of spritegen.js. Everything here is seeded (R), no Math.random, no DOM.
(() => {
  const P = SG.PAL, lit = SG.lit;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // a shaded round form: lit from the upper left by its own normal and by the whole canopy's (gx, gy, grx, gry); the lower right rim goes dark so overlaps read as gaps between clusters
  function ball(px, cx, cy, rx, ry, r, g, o = {}) {
    SG.ellipse(px, cx, cy, rx, ry, (x, y, nx, ny, ed) => {
      if (o.rim !== false && ed < .3 && nx*.55 + ny*.8 > .2) return r[0];
      const t = lit(nx, ny)*.55 + lit((x + .5 - g[0])/g[2], (y + .5 - g[1])/g[3])*.45;
      return SG.rampAt(r, t, x, y, true);
    });
  }
  // glints: short 2 pixel light strokes on the lit side of a canopy
  function glints(px, R, g, r, n) {
    for (let k = 0; k < n; k++) {
      const x = Math.round(g[0] + R.r(-.7, .1)*g[2]), y = Math.round(g[1] + R.r(-.8, -.05)*g[3]);
      if (!px.has(x, y) || !px.has(x + 1, y)) continue;
      px.set(x, y, r[r.length - 1]); px.set(x + 1, y, r[r.length - 2]);
    }
  }

  // ---------------- bushes ----------------
  function bush(px, R, v, w, h, flower) {
    const r = P.leaf.slice(1), g = [w/2, 8.2, 9.8, 8];
    const n = R.i(6, 8), balls = [];
    for (let k = 0; k < n; k++) {
      const a = k/n*6.283 + R.r(-.4, .4), rr = k === 0 ? 0 : R.r(.45, 1);
      balls.push([w/2 + Math.cos(a)*5.6*rr + R.r(-.8, .8), 8.4 + Math.sin(a)*4.9*rr, R.r(3.1, 4.5), R.r(2.9, 4.1)]);
    }
    balls.push([w/2 + R.r(-1.5, 1.5), 4.4 + R.r(-.5, .5), R.r(3.8, 4.8), R.r(3.6, 4.4)]);
    // base fill so the silhouette has no holes, dark: it is the gap color
    SG.ellipse(px, w/2, 8.4, 8.4, 6.6, () => r[0]);
    balls.sort((a, b) => b[1] - a[1]);
    for (const b of balls) ball(px, b[0], b[1], b[2], b[3], r, g);
    glints(px, R, [w/2 - 1, 5, 8, 5], r, 6);
    // a short stem at the base
    const sx = Math.round(w/2 - 1 + R.i(-1, 0));
    for (let x = 0; x < w; x++) for (let y = 15; y < h; y++) px.clear(x, y);
    for (let y = 15; y < h; y++) { px.set(sx, y, P.bark[2]); px.set(sx + 1, y, P.bark[1]); }
    px.set(sx + 2, 15, P.bark[1]); px.set(sx - 1, 15, P.bark[2]);
    SG.edge(px, 'br', .42);
    if (flower) {
      const col = v === 5 ? P.violet : v === 4 ? P.yellow : P.pink;
      const nf = R.i(4, 6); const spots = [];
      for (let k = 0, tries = 0; k < nf && tries < 60; tries++) {
        const x = R.i(2, w - 4), y = R.i(1, 12);
        if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(d => px.has(x + d[0], y + d[1]))) continue;
        if (spots.some(s => Math.abs(s[0] - x) < 4 && Math.abs(s[1] - y) < 3)) continue;
        spots.push([x, y]); k++;
        px.set(x, y, col[2]); px.set(x + 1, y, col[1]); px.set(x, y + 1, col[1]); px.set(x + 1, y + 1, col[0]);
      }
    }
  }
  SG.reg('bush', (px, R, v, w, h) => bush(px, R, v, w, h, false));
  SG.reg('bushFlower', (px, R, v, w, h) => bush(px, R, v, w, h, true));

  // ---------------- a pot (bonsai, succulent) ----------------
  // rim row, then a body that tapers; left lit, right dark; x0..x1 the rim span
  function pot(px, x0, x1, y0, rows, tint) {
    const pr = P.pot.map(c => tint ? SG.mix(c, tint, .25) : c);
    for (let k = 0; k < rows; k++) {
      const y = y0 + k, ins = k === 0 ? 0 : (k === rows - 1 && rows > 3 ? 2 : 1);
      for (let x = x0 + ins; x <= x1 - ins; x++) {
        const f = (x - x0 - ins)/Math.max(1, x1 - x0 - 2*ins);
        px.set(x, y, k === 0 ? (x === x1 - ins ? pr[2] : pr[3]) : f < .2 ? pr[3] : f > .75 ? pr[1] : pr[2]);
      }
      if (k === 0) px.set(x1, y, pr[1]);
    }
    for (let x = x0 + 1; x <= x1 - 1; x++) px.set(x, y0 + 1, x < x1 - 2 ? px.get(x, y0 + 1) : pr[0]); // shade under the rim
    px.set(x0 + 1, y0 + rows - 1, pr[1]);
  }

  // ---------------- bonsai ----------------
  SG.reg('bonsai', (px, R, v, w, h) => {
    const pr = P.pine, bk = P.bark, potTop = h - 5, cx = Math.floor(w/2);
    // trunk: a short random walk upward from the pot, thick at the base
    const n = R.i(3, 4), top = R.i(4, 6), pts = [];
    let x = cx + R.i(-1, 0), dir = R.pick([-1, 1]);
    for (let y = potTop - 1; y >= top; y--) {
      pts.push([x, y]);
      if (R.chance(.45)) { x += dir; if (R.chance(.4)) dir = -dir; }
      x = clamp(x, 5, w - 7);
    }
    pts.forEach(([tx, ty], i) => {
      const wd = i < 4 ? 3 : i < 9 ? 2 : 1;
      for (let k = 0; k < wd; k++) px.set(tx + k, ty, k === 0 ? bk[3] : k === wd - 1 ? bk[1] : bk[2]);
    });
    // foliage pads: flat, scalloped below, from low to high; the highest sits on the trunk top
    const pads = [], nPads = n - 1 + (R.chance(.5) ? 0 : 0);
    const ys = [top - 1, top + R.i(4, 5), top + R.i(8, 10), top + R.i(11, 12)].slice(0, nPads);
    ys.forEach((py, i) => {
      const t = pts[clamp(potTop - 1 - py, 0, pts.length - 1)] || pts[pts.length - 1];
      const side = i === 0 ? 0 : (i % 2 ? -1 : 1)*(R.chance(.8) ? 1 : -1);
      const rx = i === 0 ? R.r(4, 5) : R.r(3.6, 5.2), ry = R.r(1.8, 2.5), px0 = clamp(t[0] + 1 + side*R.r(2, 3.6), rx, w - rx);
      pads.push([px0, py + 1, rx, ry, t]);
      // a short branch from the trunk
      SG.line(px, t[0] + 1, t[1] + 1, px0, py + 2, bk[2]);
    });
    pads.sort((a, b) => b[1] - a[1]);
    for (const [cx0, cy0, rx, ry] of pads) {
      const g = [cx0, cy0, rx, ry];
      SG.ellipse(px, cx0, cy0, rx, ry, (x, y, nx, ny, ed) => {
        if (ny > .1 && ed < .5) return pr[1 + (x + y & 1 && ny > .45 ? 0 : 1)] ; // scalloped dark underside
        const t = lit(nx, ny*1.4) ;
        return SG.rampAt(pr, .15 + .75*t, x, y, true);
      });
      // scallops under the pad
      for (let k = 0; k < 3; k++) { const sx = Math.round(cx0 + R.r(-.7, .7)*rx), sy = Math.round(cy0 + ry); if (px.has(sx, sy - 1)) { px.set(sx, sy, pr[1]); if (R.chance(.5)) px.set(sx + 1, sy, pr[0]); } }
      // light on top
      for (let k = 0; k < 2; k++) { const gx = Math.round(cx0 - rx*.5 + R.r(0, rx*.7)), gy = Math.round(cy0 - ry*.55); if (px.has(gx, gy) && px.has(gx + 1, gy)) { px.set(gx, gy, pr[4]); px.set(gx + 1, gy, pr[4]); } }
    }
    SG.edge(px, 'br', .35);
    pot(px, cx - 4, cx + 4, potTop, 5, 0);
    // soil line over the rim
    px.set(cx - 3, potTop, bk[2]); px.set(cx - 2, potTop, bk[1]); px.set(cx + 2, potTop, bk[1]); px.set(cx + 3, potTop, bk[2]);
    pts.slice(0, 1).forEach(([tx]) => { px.set(tx, potTop - 1, bk[3]); });
  });

  // ---------------- bamboo ----------------
  SG.reg('bamboo', (px, R, v, w, h) => {
    const br = P.bamboo, n = R.i(2, 4), xs = [];
    for (let tries = 0; xs.length < n && tries < 80; tries++) {
      const x = R.i(1, w - 4);
      if (xs.every(o => Math.abs(o - x) >= 4)) xs.push(x);
    }
    xs.sort((a, b) => a - b);
    const mid = xs[Math.floor(xs.length/2)];
    // back canes first (the middle one is in front and tallest)
    const order = xs.slice().sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));
    for (const bx of order) {
      const topY = bx === mid ? R.i(3, 6) : R.i(6, 12), lean = R.pick([-1, 0, 0, 1]), shiftY = R.i(12, 24);
      const seg = []; let ny = topY + R.i(4, 6);
      while (ny < h - 2) { seg.push(ny); ny += R.i(5, 7); }
      const xAt = y => bx + (lean && y > shiftY ? lean : 0) * -1 + (lean && y <= shiftY ? 0 : 0);
      for (let y = topY; y < h; y++) {
        const x = xAt(y), node = seg.includes(y);
        if (node) { px.set(x, y, br[2]); px.set(x + 1, y, br[1]); px.set(x + 2, y, br[0]); }
        else { px.set(x, y, y === topY ? br[4] : br[3]); px.set(x + 1, y, br[2]); px.set(x + 2, y, br[1]); }
        if (!node && y > topY && seg.includes(y + 1)) px.set(x, y, br[4]);
        if (!node && y > topY + 1 && (y + bx) % 5 === 0) px.set(x, y, br[4]);
      }
      if (lean && shiftY < h) { const y = shiftY; px.set(xAt(y - 1) + 1, y, br[2]); }
      // leaf sprays near the top
      const spots = [[topY, 1], [topY, -1], [topY + 4, R.pick([-1, 1])]];
      for (const [ly, d] of spots) {
        const x0 = xAt(ly) + (d > 0 ? 2 : 0), len = 3, droop = R.chance(.4) ? 0 : 1;
        for (let k = 1; k <= len; k++) {
          const lx = x0 + d*k, lyy = ly - (k >= 2 ? 1 : 0) - (k === len && droop ? 0 : 0);
          px.set(lx, lyy, k === 1 ? br[3] : br[4]);
          if (k === 2) px.set(lx, lyy + 1, br[2]);
          if (k === 3 || (k === 2 && len === 2)) px.set(lx, lyy - 1, br[5]);
        }
      }
    }
    SG.despeckle(px);
  });

  // ---------------- succulent ----------------
  SG.reg('succulent', (px, R, v, w, h) => {
    const rr = v % 2 ? P.cool : P.bright, cx = 3.5, by = h - 5.5;
    const leaves = [], nl = R.i(5, 7);
    for (let k = 0; k < nl; k++) { const a = -1.35 + 2.7*k/(nl - 1) + R.r(-.12, .12); leaves.push([a, R.r(3.4, 4.6) - Math.abs(a)*.9]); }
    leaves.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
    for (const [a, len] of leaves) {
      const ex = cx + Math.sin(a)*(len + .8), ey = by - Math.cos(a)*len - .2;
      SG.line(px, cx, by, ex, ey, a < -.1 ? rr[4] : a > .1 ? rr[2] : rr[3], 2);
      px.set(Math.round(ex), Math.round(ey), a < 0 ? rr[5] : rr[3]);
    }
        SG.edge(px, 'br', .4);
    pot(px, 0, w - 1, h - 5, 5, v % 3 === 2 ? 0xa04030 : 0);
    for (let x = 1; x < w - 1; x++) px.set(x, h - 5 + 0, px.get(x, h - 5)); // keep rim
  });

  // ---------------- laundry ----------------
  const light = (c, t = .45) => SG.mix(c, 0xfff6ec, t);
  const PEGS = [P.pot[3], P.pink[1], P.yellow[1], P.violet[1], P.white[1]];
  // fill a template ('#' cloth), then shade: light top edge, shadow on the right and under, folds
  function garment(px, rows, cl, R, o = {}) {
    const base = cl[1], sh = cl[0], deep = SG.shade(cl[0], -.25), hi = light(cl[1], .5);
    const W = rows[0].length, H = rows.length;
    rows.forEach((s, y) => { for (let x = 0; x < W; x++) if (s[x] === '#') px.set(x, y, base); });
    // folds: vertical shadow strokes of 2 to 4 pixels
    const folds = o.folds || [];
    for (const [fx, fy, len, c] of folds) for (let k = 0; k < len; k++) if (px.has(fx, fy + k)) px.set(fx, fy + k, c === 2 ? deep : o.soft ? SG.mix(base, sh, .6) : sh);
    // right side and underside shadow (light from the upper left)
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      if (!px.has(x, y)) continue;
      if (!px.has(x + 1, y) && (o.edgeAll || y > 1)) px.set(x, y, sh);
      else if (!px.has(x, y + 1) && o.under && (x + y) % 2 === 0) px.set(x, y, sh);
    }
    // lighter top edge where it hangs
    for (let x = 0; x < W; x++) if (px.has(x, 0)) px.set(x, 0, hi);
    if (o.after) o.after(px, base, sh, deep, hi);
    // clothes pegs at the top edge
    const pc = o.peg || R.pick(PEGS), xs = o.pegs || [1, W - 2];
    for (const x of xs) { if (px.has(x, 0)) px.set(x, 0, pc); if (o.pegTall && px.has(x, 1)) px.set(x, 1, SG.shade(pc, -.3)); }
  }
  const TEE = ['.#######.', '#########', '#########', '..#####..', '..#####..', '..#####..', '..#####..', '..#####..'];
  const SHIRT = ['.#######.', '.#######.', '#########', '#########', '#########', '#########', '#########', '..#####..', '..#####..', '..#####..'];
  function tee(name, cloth) {
    SG.reg(name, (px, R, v, w, h) => {
      const cl = P[cloth], f1 = R.i(3, 4), f2 = R.i(5, 6), pk = v === 2;
      garment(px, TEE, cl, R, {
        pegs: [R.i(1, 2), R.i(6, 7)], pegTall: v === 1,
        folds: [[f1, 3 + (v === 1 ? 1 : 0), R.i(2, 3), 1], [f2, 4, R.i(2, 3), v === 0 ? 2 : 1],],
        under: false,
        after: (p, base, sh, deep, hi) => {
          // neck: a darker notch in the middle of the top
          for (let x = 3; x <= 5; x++) p.set(x, 0, SG.mix(base, sh, x === 4 ? .75 : .45));
          p.set(4, 1, SG.mix(base, sh, .5));
          if (pk) { p.set(3, 4, hi); p.set(3, 5, hi); }                 // a pocket
          if (v === 1) { for (let x = 3; x <= 5; x++) p.set(x, 6, sh); } // a stripe
          if (v === 0) { p.set(1, 1, hi); }
        } });
    });
  }
  tee('l_tee_blue', 'clothBlue'); tee('l_tee_peach', 'clothPeach'); tee('l_tee_rose', 'clothRose'); tee('l_tee_sage', 'clothSage'); tee('l_tee_butter', 'clothButter'); tee('l_tee_lilac', 'clothLilac');
  function shirt(name, cloth) {
    SG.reg(name, (px, R, v, w, h) => {
      const cl = P[cloth];
      garment(px, SHIRT, cl, R, {
        pegs: [R.i(1, 2), R.i(6, 7)], edgeAll: true,
        folds: [[2, 3, R.i(3, 4), 1], [6, 3, R.i(3, 4), 1], [R.i(3, 5) === 4 ? 3 : 5, 7, 2, 1]],
        after: (p, base, sh, deep, hi) => {
          const col = SG.mix(sh, base, .1), dk = SG.shade(sh, -.2);
          p.set(3, 0, dk); p.set(5, 0, dk); p.set(4, 0, col); p.set(4, 1, dk);   // collar
          for (const y of [3, 5]) p.set(4, y, SG.mix(base, sh, .55));     // buttons
          if (v === 0) p.set(2, 1, hi);
          
        } });
    });
  }
  shirt('l_shirt_pink', 'clothPeach'); shirt('l_shirt_blue', 'clothShirt');
  // pink shirt keeps its own cloth ramp (old one was pink-peach); the table in the core has no clothPink, so mix one locally
  P.__pinkShirt = [SG.mix(P.clothRose[0], P.clothPeach[1], .55), SG.mix(P.clothPeach[1], 0xffd8cc, .5)];
  shirt('l_shirt_pink', '__pinkShirt');
  function towel(name, cloth, w0, h0, vertical) {
    SG.reg(name, (px, R, v, w, h) => {
      const cl = P[cloth], rows = [];
      for (let y = 0; y < h; y++) rows.push('#'.repeat(w));
      const cut = v === 1 ? 1 : 0;
      garment(px, rows, cl, R, {
        pegs: [R.i(1, 2), R.i(w - 3, w - 2)], edgeAll: true, soft: true,
        folds: [[R.i(2, 3), 2, R.i(3, 5), 1], [R.i(w - 4, w - 3), R.i(3, 4), R.i(3, 4), 1]],
        after: (p, base, sh, deep, hi) => {
          // stripe(s) across the bottom
          const sy = h - 3 - (v === 2 ? 1 : 0);
          for (let x = 1; x < w - 1; x++) { p.set(x, sy, SG.mix(base, sh, .7)); }
                    if (v === 1) { p.clear(w - 1, h - 1); p.clear(0, h - 1); }
          if (cut === 0 && R.chance(.5)) p.clear(w - 1, h - 1);
        } });
    });
  }
  towel('l_towel_cream', 'clothCream', 9, 10); towel('l_towel_green', 'clothSage', 10, 9);
  SG.reg('l_socks', (px, R, v, w, h) => {
    const cl = P.clothSock, bands = [P.pink[1], P.clothBlue[0], P.clothSage[0]][v % 3], sh = cl[0], base = cl[1];
    const rows = ['###..###', '###..###', '.##..##.', '.##..##.', '.###.###', '.##..##.'];
    garment(px, rows, cl, R, { pegs: [1, 6], peg: PEGS[(v + 1) % PEGS.length], edgeAll: true,
      after: (p, b, s, d, hi) => {
        for (const x of [0, 1, 2, 5, 6, 7]) p.set(x, 1, bands);              // cuff band
        p.set(1, 5, s); p.set(6, 5, s); p.set(2, 4, s); p.set(5, 4, s);       // toe and heel patches
        if (v === 1) { p.set(2, 2, s); p.set(5, 3, s); }
      } });
    for (const x of [0, 2, 5, 7]) if (px.has(x, 0)) px.set(x, 0, light(base, .5));
    for (const x of [1, 6]) px.set(x, 0, [P.pot[3], P.pink[1], P.yellow[1]][v % 3]);
  });
  SG.reg('l_jeans', (px, R, v, w, h) => {
    const cl = P.clothJeans, rows = [];
    for (let y = 0; y < h; y++) rows.push(y < 6 ? '########' : '###..###');
    const dk = cl[0], md = cl[1], lt = cl[2];
    garment(px, rows, [dk, SG.mix(md, lt, .3)], R, { pegs: [1, 6], edgeAll: false,
      after: (p) => {
        for (let x = 0; x < 8; x++) { p.set(x, 0, lt); p.set(x, 1, SG.mix(md, lt, .35)); }
        p.set(3, 1, dk); p.set(4, 1, dk);                                       // button and fly
        for (let y = 2; y < 6; y++) { p.set(3, y, SG.mix(md, dk, .45)); }          // fly seam
        const f = v === 0 ? [[1, 3], [2, 4]] : v === 1 ? [[6, 3], [1, 4]] : [[1, 3], [6, 5]];
        for (const [fx, fy] of f) { for (let k = 0; k < 3; k++) p.set(fx, fy + k, SG.mix(md, dk, .6)); }
        for (let y = 2; y < h; y++) { if (p.has(0, y)) p.set(0, y, SG.mix(md, lt, .5)); if (p.has(7, y)) p.set(7, y, dk); if (p.has(2, y) && y > 5) p.set(2, y, dk); if (p.has(5, y) && y > 5) p.set(5, y, SG.mix(md, lt, .4)); }
        for (const x of [0, 1, 2, 5, 6, 7]) p.set(x, h - 1, lt);                // hems
        p.set(3, 6, dk); p.set(4, 6, dk);                                        // crotch
        p.set(2, 2, dk);                                                        // pocket
        for (let y = 6; y < h; y++) { if (v === 2 && y === 8) { p.set(1, y, lt); p.set(6, y, lt); } }
      } });
    for (const x of [1, 6]) px.set(x, 0, PEGS[(v + 1) % PEGS.length]);
  });
})();
