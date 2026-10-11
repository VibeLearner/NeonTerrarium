// Neon Terrarium: the holographic koi drawn in code (procedural art plan, item 5). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// 'koi' is a 1000 x 139 sheet of 10 frames of 100 x 139, seen from straight above (the whole frame is the pond): two big filled koi circling a lotus over ripples. Unlike the old pictures the frames flow:
// each koi moves a tenth of the way round its circle per frame, its body follows the circle and bends with a tail wave of two full cycles per loop, the ripples grow outward and fade through dashes by
// a tenth of a ring gap per frame (frame 10 is frame 0 with every ring one step further out, so the loop closes), and the lotus and its glow rings pulse slowly. The shader samples whole pixels and
// shows alpha >= .5 only, so colors are bright and saturated (as bright as the old sheet) and every pixel is alpha 0 or 255. Everything is drawn through masks (value = a palette slot) and composed
// into one ImageData, nothing random is called: a fixed seed (SG.rng) gives each koi its small differences (back spots, tail wave offset).
(() => {
  const PI = Math.PI, FR = 10, FW = 100, FH = 139, CX = 49.5, CY = 70;
  // palettes by mask value: 1 outline tube, 2 accent (scales, spots), 3 body fill, 4 back stripe, 5 fin fill, 6 eye
  const PAL_A = [0, 0xffe2c0, 0xd83c60, 0xf06458, 0xf0b078, 0xf08478, 0x3a0c1c];
  const PAL_B = [0, 0xdce4ff, 0x4a3cd8, 0x586cf0, 0x98acf4, 0x7c5cf0, 0x10104a];
  const PAL_LO = [0, 0xffd6f6, 0xd848c0, 0xf07cd0, 0xf4b4e4];            // outer petals
  const PAL_LI = [0, 0xc4fff8, 0x20c0ba, 0x50dcd0, 0xc8f4ec];            // inner petals and heart
  const RIPC = [0x94b0ec, 0x7094e4, 0x5a80d8];                            // ripples, bright to dim
  const GLOW = [0, 0x78c0ec, 0xe888d8];
  // width profile of a koi's body by u (0 head, 1 tail base): half widths (times k), linear between the stops
  const PROF = [[0, .8], [.05, 2.4], [.14, 3.5], [.3, 4.5], [.48, 3.9], [.68, 2.5], [.88, 1.4], [1, 1.1]];
  const halfW = (u, k) => { for (let i = 1; i < PROF.length; i++) if (u <= PROF[i][0]){ const a = PROF[i - 1], b = PROF[i], t = (u - a[0])/(b[0] - a[0]); return (a[1] + (b[1] - a[1])*t)*k; } return PROF[PROF.length - 1][1]*k; };

  // the spine of a koi: head angle th on its orbit, wave phase ph; sampled every pixel, with tangent (forward) and normal
  function spine(o, th, ph){
    const pts = [], n = Math.ceil(o.len + o.tail) + 1, rm = (o.rx + o.ry)/2;
    for (let s = 0; s <= n; s++){
      const a = th - s/rm, u = s/o.len, w = o.amp*Math.pow(Math.min(1.25, Math.max(0, u)), 1.6)*Math.sin(ph - u*4.2 + o.sh);
      pts.push({ x: o.cx + Math.cos(a)*(o.rx + w), y: o.cy + Math.sin(a)*(o.ry + w), s });
    }
    for (let i = 0; i < pts.length; i++){
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1;
      pts[i].tx = dx/l; pts[i].ty = dy/l; pts[i].nx = dy/l; pts[i].ny = -dx/l;
    }
    return pts;
  }
  // one koi into mask m (palette values) and its shape, grown by 2 pixels, into occ (the ripples stop at the fish)
  function drawKoi(m, occ, o, th, ph){
    const sp = spine(o, th, ph), L = Math.floor(o.len), at = u => sp[Math.min(sp.length - 1, Math.round(u*o.len))], q = o.k/1.3;
    const left = [], right = [];
    for (let s = 0; s <= L; s++){ const p = sp[s], w = halfW(s/o.len, o.k); left.push([p.x + p.nx*w, p.y + p.ny*w]); right.push([p.x - p.nx*w, p.y - p.ny*w]); }
    const b = sp[L], t = sp[Math.min(sp.length - 1, L + o.tail)], nt = sp[L + Math.round(o.tail*.55)] || t, tw = o.tw, bl = left[L], br = right[L];
    const tl = [t.x + t.nx*tw, t.y + t.ny*tw], tr = [t.x - t.nx*tw, t.y - t.ny*tw], notch = [nt.x, nt.y];
    const cl = [(b.x + nt.x)/2 + b.nx*tw*.95, (b.y + nt.y)/2 + b.ny*tw*.95], cr = [(b.x + nt.x)/2 - b.nx*tw*.95, (b.y + nt.y)/2 - b.ny*tw*.95];
    const body = left.concat(right.slice().reverse()), tail = [bl, cl, tl, notch, tr, cr, br], tmp = o.tmp; tmp.d.fill(0);
    // fins first (the body goes over their roots)
    const fins = [];
    for (const sd of [1, -1]){
      const a0 = at(.16), a1 = at(.34), a2 = at(.37), sw = 1 + .2*Math.sin(ph + (sd > 0 ? 0 : PI*.5)), w0 = halfW(.16, o.k) - 1, w2 = halfW(.37, o.k) - 1;
      const f = [[a0.x + sd*a0.nx*w0, a0.y + sd*a0.ny*w0], [a1.x + sd*a1.nx*(w2 + 8*q*sw), a1.y + sd*a1.ny*(w2 + 8*q*sw)], [a2.x + sd*a2.nx*w2, a2.y + sd*a2.ny*w2]];
      fins.push(f); m.fillPoly(f, 5);
    }
    m.fillPoly(tail, 5);
    m.fillPoly(body, 3);
    // the lighter back stripe and the spots
    { const a = [], c = []; for (let u = .1; u <= .86; u += .04){ const p = at(u), w = halfW(u, o.k)*.34; a.push([p.x + p.nx*w, p.y + p.ny*w]); c.push([p.x - p.nx*w, p.y - p.ny*w]); } m.fillPoly(a.concat(c.reverse()), 4); }
    for (const sp2 of o.spots){ const p = at(sp2[0]), w = halfW(sp2[0], o.k)*sp2[1], r = sp2[2]*q; m.fillEllipse(p.x + p.nx*w, p.y + p.ny*w, r, r*.8, 2); }
    // the fish's shape into the occlusion mask
    tmp.fillPoly(body, 1); tmp.fillPoly(tail, 1); for (const f of fins) tmp.fillPoly(f, 1);
    { let x0 = FW, x1 = 0, y0 = FH, y1 = 0; for (const p of body.concat(tail, fins[0], fins[1])){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      x0 = Math.max(2, Math.floor(x0) - 1); x1 = Math.min(FW - 3, Math.ceil(x1) + 1); y0 = Math.max(2, Math.floor(y0) - 1); y1 = Math.min(FH - 3, Math.ceil(y1) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tmp.d[y*FW + x]){ for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 3) occ.d[(y + j)*FW + x + i] = 1; } }
    // outlines (2 px on the body, 1 px on fins and tail), scale chevrons, gill, eyes
    m.poly(left, false, 2, 1); m.poly(right, false, 2, 1); m.line(left[0][0], left[0][1], right[0][0], right[0][1], 2, 1);
    m.curve(bl[0], bl[1], cl[0], cl[1], tl[0], tl[1], 1, 1); m.curve(tl[0], tl[1], (tl[0] + notch[0])/2 + t.tx*2, (tl[1] + notch[1])/2 + t.ty*2, notch[0], notch[1], 1, 1);
    m.curve(br[0], br[1], cr[0], cr[1], tr[0], tr[1], 1, 1); m.curve(tr[0], tr[1], (tr[0] + notch[0])/2 + t.tx*2, (tr[1] + notch[1])/2 + t.ty*2, notch[0], notch[1], 1, 1);
    m.line(b.x, b.y, notch[0], notch[1], 1, 2);
    for (const f of fins) m.poly(f, true, 1, 1);
    { const g = at(.19), w = halfW(.19, o.k) - 2; m.curve(g.x + g.nx*w, g.y + g.ny*w, g.x - g.tx*2.5, g.y - g.ty*2.5, g.x - g.nx*w, g.y - g.ny*w, 1, 2); }
    for (const u of o.rows){ const c = at(u), w = halfW(u, o.k)*.78, bx = c.x - c.tx*3.5, by = c.y - c.ty*3.5; m.line(c.x + c.nx*w, c.y + c.ny*w, bx, by, 1, 2); m.line(c.x - c.nx*w, c.y - c.ny*w, bx, by, 1, 2); }
    { const e = at(.085), w = halfW(.085, o.k) - 3.2; m.dot(e.x + e.nx*w - 1, e.y + e.ny*w - 1, 2, 6); m.dot(e.x - e.nx*w - 1, e.y - e.ny*w - 1, 2, 6); }
  }
  // a filled pointed petal (angle a, tip radius r, half width wd, base radius): fill value vf, outline value vo
  function petal(m, a, r, wd, base, vf, vo, outline){
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca, L = [], R = [];
    for (let k = 0; k <= 8; k++){ const t = k/8, d = base + (r - base)*t, bulge = Math.sin(t*PI*.9 + .1)*wd*(1 - t*.25); L.push([CX + ca*d + px*bulge, CY + sa*d + py*bulge]); R.push([CX + ca*d - px*bulge, CY + sa*d - py*bulge]); }
    if (!outline) m.fillPoly(L.concat(R.reverse()), vf); else { m.poly(L, false, 1, vo); m.poly(R, false, 1, vo); }
  }
  function drawLotus(mo, mi, f){
    for (const ol of [false, true]) for (let i = 0; i < 8; i++) petal(mo, i*PI/4 + PI/8, 16, 6.5, 3, 3, 1, ol);
    const glow = Math.sin(2*PI*f/FR) > -.2;
    for (const ol of [false, true]) for (let i = 0; i < 6; i++) petal(mi, i*PI/3 - PI/2, 11, 4.4, 2, 3, 1, ol);
    mi.fillEllipse(CX, CY, 3.4, 3.4, glow ? 4 : 3); mi.ellipse(CX, CY, 3.4, 3.4, 1, 1);
  }
  // ripples: ring t (0 to 4) moves out a tenth of a gap per frame; it is born dashed at the lotus and fades through dashes at the edge. Only t decides the look, so the loop closes.
  function drawRipples(lms){
    return f => {
      for (let k = 0; k < 4; k++){
        const t = k + f/FR, r = 21 + t*7.2, ry = r*1.12, lvl = t < .5 ? 2 : t > 3.1 ? 2 : t > 2.4 ? 1 : 0, rot = t*.9, slots = 14, n = Math.ceil(r*PI*2*1.4), lm = lms[lvl];
        for (let i = 0; i < n; i++){
          const a = (i/n)*PI*2, slot = Math.floor((((a + rot)/(PI*2)) % 1 + 1) % 1*slots);
          if (lvl === 2 && slot % 4 === 3) continue; if (lvl === 1 && slot % 7 === 3) continue;
          if (t < .5 && slot % 2) continue;
          lm.dot(CX + Math.cos(a)*r - 1, CY + Math.sin(a)*ry - 1, 2, 1);
        }
      }
    };
  }
  // two glow rings around the lotus: one breathes, one turns by a slot a loop (period of its pattern: two slots)
  function drawGlow(m, f){
    const r1 = 19.5 + Math.round(1.5*Math.sin(2*PI*f/FR)), n1 = 110;
    for (let i = 0; i < n1; i++){ const a = i/n1*PI*2; if (Math.floor(a/(PI*2)*20) % 2) continue; m.dot(CX + Math.cos(a)*r1 - 1, CY + Math.sin(a)*r1*1.1 - 1, 2, 1); }
    const n2 = 130;
    for (let i = 0; i < n2; i++){ const a = i/n2*PI*2; if (Math.floor(a/(PI*2)*24 + f*.2) % 2) continue; m.dot(CX + Math.cos(a)*25 - 1, CY + Math.sin(a)*25*1.1 - 1, 2, 2); }
  }
  ART.reg('koi', (g, w, h) => {
    const rng = SG.rng(0x6b01 + 7), M = () => new ART.Mask(FW, FH), mA = M(), mB = M(), mO = M(), mI = M(), mG = M(), occ = M(), tmp = M(), lms = [M(), M(), M()];
    const img = g.createImageData(w, h), px = new Uint32Array(img.data.buffer), abgr = c => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
    const put = (m, f, pal) => { const ks = pal.map(abgr), d = m.d; for (let y = 0; y < FH; y++){ const o = y*FW, q = y*w + f*FW; for (let x = 0; x < FW; x++){ const v = d[o + x]; if (v) px[q + x] = ks[v]; } } };
    // the two koi: opposite on slightly different circles, different sizes; the seed gives each its spots and tail wave offset
    const mk = (r0, len, k, tail, tw, amp, th0, sh, rows) => ({ cx: CX, cy: CY, rx: r0, ry: r0*1.1, len, k, tail, tw, amp, th0, sh, rows, tmp,
      spots: [[rng.r(.34, .42), rng.r(.15, .3), 2.6], [rng.r(.5, .58), -rng.r(.15, .3), 2.4], [rng.r(.66, .72), rng.r(0, .2), 1.8]] });
    const A = mk(35, 66, 2.42, 17, 8.5, 1.6, -2.3, rng.r(0, 1), [.4, .5, .6, .7]);
    const B = mk(33, 60, 2.2, 15, 8, 1.4, -2.3 + PI, rng.r(1, 2.2), [.4, .5, .6, .7]);
    const rip = drawRipples(lms);
    for (let f = 0; f < FR; f++){
      for (const m of [mA, mB, mO, mI, mG, occ, ...lms]) m.d.fill(0);
      const adv = f/FR*PI*2, wph = f/FR*PI*4;
      drawKoi(mA, occ, A, A.th0 + adv, wph); drawKoi(mB, occ, B, B.th0 + adv, wph + 1.3);
      rip(f); drawGlow(mG, f); drawLotus(mO, mI, f);
      for (let lv = 0; lv < 3; lv++){ const d = lms[lv].d; for (let i = 0; i < d.length; i++) if (occ.d[i]) d[i] = 0; put(lms[lv], f, [0, RIPC[lv]]); }
      { const d = mG.d; for (let i = 0; i < d.length; i++) if (occ.d[i]) d[i] = 0; } put(mG, f, GLOW);
      put(mO, f, PAL_LO); put(mI, f, PAL_LI); put(mA, f, PAL_A); put(mB, f, PAL_B);
    }
    g.putImageData(img, 0, 0);
  }, { defer: true });
})();
