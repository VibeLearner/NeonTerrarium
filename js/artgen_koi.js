// Neon Terrarium: the holographic koi drawn in code (procedural art plan, item 5). Runs after spritegen.js, artgen.js and artgen_tools.js, shares their scope.
// 'koi' is a 1000 x 139 sheet of 10 frames of 100 x 139, seen from straight above (the whole frame is the pond): two koi circling a lotus over ripples. Unlike the old pictures the frames flow:
// each koi moves a tenth of the way round its circle per frame, its body follows the circle and bends with a tail wave of two full cycles per loop, the ripples grow outward and fade by a tenth of a
// ring gap per frame (frame 10 is frame 0 with every ring one step further out, so the loop closes), and the lotus glows slowly. The shader samples whole pixels, so colors are bright and
// saturated and every pixel is alpha 0 or 255. Everything is drawn through masks (one per color), nothing random is called: a fixed seed (SG.rng) gives each koi its small differences.
(() => {
  const PI = Math.PI, FR = 10, FW = 100, FH = 139, CX = 49.5, CY = 70;
  // ripple colors (bright to dim), lotus and koi schemes (hot = the tube, accent = fins, scales, shade)
  const RIP = [0x7c9cf0, 0x5a74d4, 0x4258a8];
  const KOI_A = ART.scheme(0xffb08c, 0xf0507c, 0, 0), KOI_B = ART.scheme(0xc8a8ff, 0x9456ff, 0, 0);
  const LOT_O = ART.scheme(0xffb4ee, 0xd844c4, 0, 0), LOT_I = ART.scheme(0x9afff4, 0x20c0ba, 0, 0);
  // width profile of a koi's body by u (0 head, 1 tail base): half widths in pixels, linear between the stops
  const PROF = [[0, .8], [.05, 2.4], [.14, 3.5], [.3, 4.5], [.48, 3.9], [.68, 2.5], [.88, 1.4], [1, 1.1]];
  const halfW = (u, k) => { for (let i = 1; i < PROF.length; i++) if (u <= PROF[i][0]){ const a = PROF[i - 1], b = PROF[i], t = (u - a[0])/(b[0] - a[0]); return (a[1] + (b[1] - a[1])*t)*k; } return PROF[PROF.length - 1][1]*k; };

  // one koi: head angle th on its orbit (rx, ry), length len, fatness k, tail wave phase ph. Returns the spine sampled every pixel (to len + tail), with normals.
  function spine(o, th, ph){
    const pts = [], n = Math.ceil(o.len + o.tail) + 1, rm = (o.rx + o.ry)/2;
    for (let s = 0; s <= n; s++){
      const a = th - s/rm, u = s/o.len, w = o.amp*Math.pow(Math.min(1.25, Math.max(0, u)), 1.6)*Math.sin(ph - u*4.2 + o.sh);
      const rx = o.rx + w, ry = o.ry + w;                                // the wave swings the body in and out of the circle
      pts.push({ x: o.cx + Math.cos(a)*rx, y: o.cy + Math.sin(a)*ry, s });
    }
    for (let i = 0; i < pts.length; i++){   // tangent (head first, towards the tail it points backwards), normal to the left of the swimming direction
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1;
      pts[i].tx = dx/l; pts[i].ty = dy/l; pts[i].nx = dy/l; pts[i].ny = -dx/l;   // tx,ty: forward (towards the head)
    }
    return pts;
  }
  // the koi's outline into mask m (layer 1 outline, layer 2 details) and its dilated body into the occlusion mask occ (so the ripples do not run through it)
  function drawKoi(m, occ, o, th, ph){
    const sp = spine(o, th, ph), L = Math.floor(o.len), at = u => sp[Math.min(sp.length - 1, Math.round(u*o.len))];
    const left = [], right = [];
    for (let s = 0; s <= L; s++){ const p = sp[s], w = halfW(s/o.len, o.k); left.push([p.x + p.nx*w, p.y + p.ny*w]); right.push([p.x - p.nx*w, p.y - p.ny*w]); }
    // tail: two lobes and a notch, following the spine's own wave
    const b = sp[L], tipI = Math.min(sp.length - 1, L + o.tail), t = sp[tipI], nt = sp[L + Math.round(o.tail*.55)] || t, tw = o.tw;
    const tl = [t.x + t.nx*tw, t.y + t.ny*tw], tr = [t.x - t.nx*tw, t.y - t.ny*tw], notch = [nt.x, nt.y];
    const cl = [b.x + (nt.x - b.x)*.5 + b.nx*(tw*.95), b.y + (nt.y - b.y)*.5 + b.ny*(tw*.95)], cr = [b.x + (nt.x - b.x)*.5 - b.nx*(tw*.95), b.y + (nt.y - b.y)*.5 - b.ny*(tw*.95)];
    const bl = left[L], br = right[L];
    // occlusion: body polygon + the tail triangle(s), grown by one pixel
    const polyB = left.concat(right.slice().reverse()), tmp = o.tmp; tmp.d.fill(0);
    tmp.fillPoly(polyB, 1); tmp.fillPoly([bl, cl, tl, notch, tr, cr, br], 1);
    { let x0 = FW, x1 = 0, y0 = FH, y1 = 0; for (const q of polyB.concat([tl, tr, notch])){ x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      x0 = Math.max(1, Math.floor(x0) - 1); x1 = Math.min(FW - 2, Math.ceil(x1) + 1); y0 = Math.max(1, Math.floor(y0) - 1); y1 = Math.min(FH - 2, Math.ceil(y1) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tmp.d[y*FW + x]){ for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 3) occ.d[(y + j)*FW + x + i] = 1; } }
    // body outline
    m.poly(left, false, 1, 1); m.poly(right, false, 1, 1); m.line(left[0][0], left[0][1], right[0][0], right[0][1], 1, 1);
    // tail lobes
    m.curve(bl[0], bl[1], cl[0], cl[1], tl[0], tl[1], 1, 2); m.curve(tl[0], tl[1], (tl[0] + notch[0])/2 + t.tx*1.5, (tl[1] + notch[1])/2 + t.ty*1.5, notch[0], notch[1], 1, 2);
    m.curve(br[0], br[1], cr[0], cr[1], tr[0], tr[1], 1, 2); m.curve(tr[0], tr[1], (tr[0] + notch[0])/2 + t.tx*1.5, (tr[1] + notch[1])/2 + t.ty*1.5, notch[0], notch[1], 1, 2);
    m.line(b.x, b.y, notch[0], notch[1], 1, 2);
    // pectoral fins: a swept triangle on each side, flapping a little with the wave
    for (const sd of [1, -1]){
      const a0 = at(.2), a1 = at(.27), a2 = at(.37), sw = 1 + .25*Math.sin(ph + (sd > 0 ? 0 : PI*.5));
      const w0 = halfW(.2, o.k), w1 = halfW(.37, o.k), x0 = a0.x + sd*a0.nx*w0, y0 = a0.y + sd*a0.ny*w0, x1 = a1.x + sd*a1.nx*(w0 + 6*sw) - a1.tx*2, y1 = a1.y + sd*a1.ny*(w0 + 6*sw) - a1.ty*2;
      m.curve(x0, y0, a0.x + sd*a0.nx*(w0 + 3.5), a0.y + sd*a0.ny*(w0 + 3.5), x1 + (-a1.tx)*3, y1 + (-a1.ty)*3, 1, 2);
      m.line(x1 - a1.tx*3, y1 - a1.ty*3, a2.x + sd*a2.nx*w1, a2.y + sd*a2.ny*w1, 1, 2);
    }
    // gill line, eyes, and the scale ladder (little back-swept arcs across the body)
    { const g = at(.17), w = halfW(.17, o.k) - 1; m.curve(g.x + g.nx*w, g.y + g.ny*w, g.x - g.tx*1.5, g.y - g.ty*1.5, g.x - g.nx*w, g.y - g.ny*w, 1, 2); }
    { const e = at(.08), w = halfW(.08, o.k) - 1.4; m.set(e.x + e.nx*w, e.y + e.ny*w, 2); m.set(e.x - e.nx*w, e.y - e.ny*w, 2); }
    for (const u of o.rows){ const c = at(u), w = halfW(u, o.k)*.7, bx = c.x - c.tx*2.5, by = c.y - c.ty*2.5; m.line(c.x + c.nx*w, c.y + c.ny*w, bx, by, 1, 2); m.line(c.x - c.nx*w, c.y - c.ny*w, bx, by, 1, 2); }
    { const a = at(.3), z = at(.84); m.line(a.x, a.y, z.x, z.y, 1, 2); }   // the dorsal line
  }
  // the lotus: two rings of pointed petals seen from above; the inner ring glows (hot and accent swap) slowly
  function drawLotus(mo, mi, f){
    const petal = (m, a, r, wd, v, base) => {
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca, bx = CX + ca*base, by = CY + sa*base, tx = CX + ca*r, ty = CY + sa*r, mx = CX + ca*(base + (r - base)*.5), my = CY + sa*(base + (r - base)*.5);
      m.curve(bx, by, mx + px*wd, my + py*wd, tx, ty, 1, v); m.curve(bx, by, mx - px*wd, my - py*wd, tx, ty, 1, v);
    };
    for (let i = 0; i < 8; i++) petal(mo, i*PI/4 + PI/8, 15, 5.6, 1, 3.5);
    const glow = Math.sin(2*PI*f/FR) > -.2 ? 1 : 2;
    for (let i = 0; i < 6; i++) petal(mi, i*PI/3 - PI/2, 10, 3.6, glow, 2);
    mi.fillRect(Math.round(CX) - 1, CY - 1, 2, 2, glow === 1 ? 2 : 1);
  }
  // the ripples: ring t (0 to 4) is a tenth of a gap further out each frame; the new one is born at the lotus and the old one fades dashed at the edge. ((t) alone decides the look, so the loop closes)
  function drawRipples(lms){
    return f => {
      for (let k = 0; k < 4; k++){
        const t = k + f/FR, r = 14 + t*8.5, ry = r*1.12, lvl = t < .5 ? 2 : t > 3.1 ? 2 : t > 2.4 ? 1 : 0, rot = t*.9, slots = 14, n = Math.ceil(r*PI*2*1.4), lm = lms[lvl];
        for (let i = 0; i < n; i++){
          const a = (i/n)*PI*2, slot = Math.floor((((a + rot)/(PI*2)) % 1 + 1) % 1*slots);
          if (lvl === 2 && slot % 4 === 3) continue; if (lvl === 1 && slot % 7 === 3) continue;
          if (t < .5 && slot % 2) continue;
          lm.set(CX + Math.cos(a)*r, CY + Math.sin(a)*ry, 1);
        }
      }
    };
  }
  ART.reg('koi', (g, w, h) => {
    const rng = SG.rng(0x6b01 + 7), mA = new ART.Mask(FW, FH), mB = new ART.Mask(FW, FH), lms = [0, 1, 2].map(() => new ART.Mask(FW, FH)), mO = new ART.Mask(FW, FH), mI = new ART.Mask(FW, FH), occ = new ART.Mask(FW, FH), tmp = new ART.Mask(FW, FH);
    // the two koi: opposite on slightly different circles, different sizes; fixed seed gives their small differences (scale rows, tail wave offset)
    const mk = (r0, len, k, tail, tw, amp, th0, sh, rows) => ({ cx: CX, cy: CY, rx: r0, ry: r0*1.1, len, k, tail, tw, amp, th0, sh, rows, tmp });
    const A = mk(34, 44, 1.55, 12, 7, 1.5, -2.3, rng.r(0, 1), [.36, .46, .56, .66]);
    const B = mk(33, 38, 1.4, 11, 6.5, 1.3, -2.3 + PI, rng.r(1, 2.2), [.38, .49, .6]);
    // the sheet is composed in one ImageData (the masks painted over each other in order: layer 1 the tube color, 2 the accent), put on the canvas once
    const img = g.createImageData(w, h), px = new Uint32Array(img.data.buffer), abgr = c => 0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
    const put = (m, f, c1, c2) => { const d = m.d, k1 = abgr(c1), k2 = abgr(c2); for (let y = 0; y < FH; y++){ const o = y*FW, q = y*w + f*FW; for (let x = 0; x < FW; x++){ const v = d[o + x]; if (v) px[q + x] = v === 1 ? k1 : k2; } } };
    const rip = drawRipples(lms);
    for (let f = 0; f < FR; f++){
      for (const m of [mA, mB, mO, mI, occ, ...lms]) m.d.fill(0);
      const adv = f/FR*PI*2, wph = f/FR*PI*4;         // a tenth of the circle per frame; the tail wave goes through two cycles per loop
      drawKoi(mA, occ, A, A.th0 + adv, wph); drawKoi(mB, occ, B, B.th0 + adv, wph + 1.3 + PI*0);
      rip(f);
      for (let lv = 0; lv < 3; lv++){ const d = lms[lv].d; for (let i = 0; i < d.length; i++) if (occ.d[i]) d[i] = 0; put(lms[lv], f, RIP[lv], RIP[lv]); }
      drawLotus(mO, mI, f);
      put(mO, f, LOT_O.hot, LOT_O.accent); put(mI, f, LOT_I.hot, LOT_I.accent); put(mA, f, KOI_A.hot, KOI_A.accent); put(mB, f, KOI_B.hot, KOI_B.accent);
    }
    g.putImageData(img, 0, 0);
  }, { defer: true });
})();
