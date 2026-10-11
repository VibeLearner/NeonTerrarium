// Sprites drawn in code: lawn grass (gt0..gt9), ground cover (g_clover, g_cover, g_spread1, g_spread2, g_moss2, moss, g_flowers) and ferns (fern, g_fern2, g_fern3).
// Runs after spritegen.js in the same scope. Style rules are in the header of spritegen.js. Local helpers only; nothing here touches the DOM.
(() => {
  const P = SG.PAL;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rc = (r, i) => r[clamp(Math.round(i), 0, r.length - 1)];
  const reedHead = SG.mix(P.red[0], P.bark[1], .45);
  const reedHeadLt = SG.mix(P.red[1], P.bark[2], .5);

  // ---------- grass blades ----------
  // one blade from (x0, y0) up: height H rows, a curve (lean along the way, bend squared toward the tip), width up to wmax (leaf shaped: wide low, pointed), ramp index lvl.
  function blade(px, ramp, x0, y0, H, bend, lean, wmax, lvl){
    const rows = Math.max(2, Math.round(H));
    let pc = Math.round(x0);
    for (let k = 0; k <= rows; k++){
      const t = k/rows, y = y0 - k, cx = x0 + lean*t + bend*t*t;
      const wd = wmax >= 2 ? clamp(Math.round(wmax*(1.2 - t)*1.05), 1, wmax) : 1;
      let lx = Math.round(cx - (wd - 1)/2), rx = lx + wd - 1;
      if (lx > pc + 1) lx = pc + 1; else if (rx < pc - 1) rx = pc - 1;   // steep bend: no gap between rows
      for (let x = lx; x <= rx; x++){
        let i = lvl + (t > .72 ? 1 : 0) + (t < .18 ? -1 : 0);
        if (wd >= 2){ if (x === lx) i += 1; else if (x === rx && wd >= 3) i -= 1; }
        px.set(x, y, rc(ramp, i));
      }
      pc = Math.round(cx);
    }
  }
  // blades from the base: o = {n, spread, h0 (edge height), h1 (middle height), fan, curl, wmax, lvl, jit}
  function tuft(px, R, w, h, o){
    const ramp = o.ramp || P.cool, base = h - 1, cx = (w - 1)/2, bl = [];
    for (let i = 0; i < o.n; i++){
      const u = clamp((i + .5)/o.n*2 - 1 + R.r(-.16, .16)*(o.jit || 1), -1, 1);
      const mid = 1 - Math.pow(Math.abs(u), o.prof || 1.4);
      const H = (o.h0 + (o.h1 - o.h0)*mid)*R.r(.78, 1.08);
      bl.push({ u, x0: cx + u*o.spread + R.r(-.4, .4), H, d: R.f(), bend: u*o.fan*H + R.gauss()*o.curl*H, lean: u*o.lean*H*.3 });
    }
    bl.sort((a, b) => a.d - b.d);
    let mn = 1e9, mx = -1e9;
    for (const b of bl){ mn = Math.min(mn, b.x0); mx = Math.max(mx, b.x0); }
    // dark mound under the blades so the base row is solid
    const lo = Math.round(mn - (o.wmax >= 2 ? 1 : 0)), hi = Math.round(mx + (o.wmax >= 2 ? 1 : 0));
    for (let x = lo; x <= hi; x++){ px.set(x, base, rc(ramp, o.lvl - 1)); if (o.mound && x > lo && x < hi) px.set(x, base - 1, rc(ramp, o.lvl - 1 + (x < cx ? .6 : 0))); }
    for (const b of bl){
      const lvl = o.lvl + (b.d > .55 ? 1 : 0) + (b.u < -.25 ? 1 : 0) - (b.u > .5 ? 1 : 0);
      blade(px, ramp, b.x0, base - (o.mound ? 1 : 0), b.H, b.bend, b.lean, o.wmax, lvl);
    }
    return bl;
  }
  const finish = (px, sides, amt) => { if (sides) SG.edge(px, sides, amt); SG.despeckle(px); };

  const TUFT = {
    gt0: { n: 12, spread: 5.5, h0: 7, h1: 14, fan: .55, curl: .22, wmax: 2, lvl: 2, lean: 1 },
    gt1: { n: 10, spread: 6, h0: 4, h1: 8, fan: .9, curl: .1, wmax: 2, lvl: 2, lean: 1.4 },
    gt2: { n: 7, spread: 3, h0: 3, h1: 7, fan: .6, curl: .2, wmax: 2, lvl: 2, lean: 1 },
    gt3: { n: 12, spread: 5, h0: 2, h1: 6, fan: 1.1, curl: .15, wmax: 2, lvl: 1, lean: 1.5, mound: 1 },
    gt4: { n: 6, spread: 4, h0: 6, h1: 11, fan: .5, curl: .12, wmax: 3, lvl: 1, lean: 1, mound: 1 },
  };
  for (const k of Object.keys(TUFT)) SG.reg(k, function (px, R, v, w, h){
    const o = Object.assign({}, TUFT[k]);
    // a variant leans, widens or thins a little; same kind
    o.n += (v % 3) - 1 + (v > 4 ? 1 : 0); o.spread *= .9 + .05*(v % 4); o.fan *= .8 + .1*(v % 5); o.curl *= .6 + .3*(v % 3);
    if (k === 'gt0' || k === 'gt1') o.lean *= (v & 1 ? 1.6 : .6) * (v & 2 ? -1 : 1);
    if (v === 6 || v === 7) { o.h1 *= .85; o.lvl += k === 'gt0' ? -1 : 0; }
    tuft(px, R, w, h, o); finish(px, 'br', .32);
  });

  // reeds: tall straight blades, a few with cattail heads
  SG.reg('gt5', function (px, R, v, w, h){
    const ramp = P.cool, base = h - 1, n = 11 + (v % 3);
    const bl = [];
    for (let i = 0; i < n; i++){ const u = (i + .5)/n*2 - 1 + R.r(-.1, .1); bl.push({ u, x0: (w - 1)/2 + u*(w*.42), H: R.r(5, 11) - Math.abs(u)*2, d: R.f(), bend: R.gauss()*1.2, lean: R.gauss()*.6 }); }
    bl.sort((a, b) => a.d - b.d);
    const heads = bl.filter(b => b.H > 8.5).sort((a, b) => b.H - a.H).slice(0, 2 + (v & 1));
    for (let x = 1; x < w - 1; x++) px.set(x, base, rc(ramp, 1));
    for (let x = 2; x < w - 2; x++) px.set(x, base - 1, rc(ramp, 1 + (x < w/2 ? 1 : 0)));
    for (const b of bl){
      const lvl = 2 + (b.d > .5 ? 1 : 0) + (b.u < -.2 ? 1 : 0);
      const hd = heads.includes(b);
      blade(px, ramp, b.x0, base - 1, hd ? b.H + 2 : b.H, b.bend*(hd ? .3 : 1), b.lean, 1, lvl);
      if (hd){
        const tx = Math.round(b.x0 + b.lean + b.bend*.3), ty = base - 1 - Math.round(b.H + 2);
        for (let y = 0; y < 4; y++){ px.set(tx, ty - 3 + y, y === 0 ? reedHeadLt : reedHead); px.set(tx + 1, ty - 3 + y, reedHead); }
        px.set(tx, ty - 4, reedHead);
      }
    }
    finish(px, 'br', .3);
  });

  // thick clumps: dense overlapping blades, a dark mound at the foot
  const CLUMP = {
    gt6: { n: 17, spread: 6.5, h0: 5, h1: 13, fan: .5, curl: .2, wmax: 2, lvl: 1, lean: 1, mound: 1, prof: 1.2 },
    gt7: { n: 18, spread: 6.8, h0: 8, h1: 13, fan: .35, curl: .25, wmax: 2, lvl: 1, lean: 1, mound: 1, prof: 2 },
    gt8: { n: 17, spread: 6.8, h0: 9, h1: 14, fan: .3, curl: .3, wmax: 2, lvl: 1, lean: 1, mound: 1, prof: 2.5 },
    gt9: { n: 16, spread: 6.2, h0: 4, h1: 12, fan: .75, curl: .15, wmax: 2, lvl: 1, lean: 1.5, mound: 1, prof: 1 },
  };
  for (const k of Object.keys(CLUMP)) SG.reg(k, function (px, R, v, w, h){
    const o = Object.assign({}, CLUMP[k]);
    o.n += (v % 3) - 1; o.fan *= .8 + .1*(v % 5); o.curl *= .7 + .2*(v % 3); o.lean *= (v & 1 ? 1.5 : .7) * (v & 2 ? -1 : 1);
    o.h1 = Math.min(h - 3, o.h1*(.88 + .04*(v % 4)));
    tuft(px, R, w, h, o);
    finish(px, 'br', .35);
  });

  // ---------- ground cover: leaves on a low mound ----------
  // an oriented leaf (long radius a, short radius b, angle ang from the x axis), shaded: lit upper left, a darker lower rim; hf (0..1) raises it toward the light on high parts of the mound
  function leaf(px, ramp, cx, cy, a, b, ang, lvl, hf){
    const ca = Math.cos(ang), sa = Math.sin(ang), rr = Math.ceil(Math.max(a, b)) + 1;
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++){
      const dx = x + .5 - cx, dy = y + .5 - cy, u = (dx*ca + dy*sa)/a, s = (-dx*sa + dy*ca)/b, d = u*u + s*s;
      if (d > 1) continue;
      const nx = (dx/Math.max(a, b)), ny = (dy/Math.max(a, b));
      let t = SG.lit(nx*.9, ny*.9);
      let i = lvl + (t - .5)*3 + hf*.6;
      if (d > .62 && ny > .12) i -= 1;           // lower rim
      px.set(x, y, rc(ramp, i));
    }
  }
  // mound height profile: 0..1 across x
  function profile(R, w, pw){ const ph = R.r(0, 6.28), ph2 = R.r(0, 6.28), f1 = R.r(.25, .45), f2 = R.r(.6, .9);
    return x => { const nx = (x + .5 - w/2)/(w/2); return Math.pow(Math.max(0, 1 - nx*nx), pw)*(.82 + .12*Math.sin(x*f1 + ph) + .08*Math.sin(x*f2 + ph2)); }; }
  // o = {ramp, lr (leaf long radius), asp (aspect), dens (leaves per 100 pixels), pw, hfrac, lvl, tri (clover), flat (angles mostly horizontal), flowers: [colors], nfl}
  function cover(px, R, w, h, o){
    const ramp = o.ramp, base = h - 1, prof = profile(R, w, o.pw), H = (h - 1)*o.hfrac, tops = [];
    for (let x = 0; x < w; x++){ const t = Math.round(base - H*prof(x)); for (let y = Math.max(0, t); y <= base; y++) px.set(x, y, rc(ramp, 1 + (y < base - 3 ? .6 : 0))); }
    const n = Math.round(w*h*o.dens/100), L = [];
    for (let i = 0; i < n; i++){
      const x = R.r(1, w - 1), top = base - H*prof(x);
      const fy = Math.pow(R.f(), .8); const y = top + (base - top)*fy - 1 + R.r(-1, 1);
      const sz = R.r(.8, 1.15), ang = o.flat ? R.r(-.7, .7) + (R.chance(.5) ? 0 : Math.PI) : -Math.PI/2 + R.r(-1.1, 1.1);
      L.push({ x, y, sz, ang, hf: 1 - (y - top)/Math.max(1, base - top) });
    }
    L.sort((p, q) => p.y - q.y);
    for (const l of L){
      const hfv = clamp(l.hf, 0, 1), lvl = o.lvl - 1.1 + (l.x < w*.45 ? .5 : 0) - (1 - hfv)*.9;
      if (o.tri){ for (let k = 0; k < 3; k++){ const a = l.ang + (k - 1)*.95; leaf(px, ramp, l.x + Math.cos(a)*o.lr*l.sz*.7, l.y + Math.sin(a)*o.lr*l.sz*.55, o.lr*.62*l.sz, o.lr*.5*l.sz, a, lvl, hfv); } }
      else leaf(px, ramp, l.x, l.y, o.lr*l.sz, o.lr*l.sz/o.asp, l.ang, lvl, hfv);
      if (hfv > .55) tops.push(l);
    }
    if (o.flowers){
      const nf = o.nfl + R.i(0, 2);
      for (let i = 0; i < nf && tops.length; i++){
        const l = tops.splice(R.i(0, tops.length - 1), 1)[0], col = o.flowers[i % o.flowers.length];
        const x = Math.round(l.x), y = Math.round(l.y);
        if (R.chance(.55)){ px.set(x, y, col[1]); px.set(x + 1, y, col[1]); px.set(x, y - 1, col[2]); }
        else { px.set(x, y, col[2]); px.set(x + 1, y + 1, col[0]); px.set(x + 1, y, col[1]); }
      }
    }
    for (let x = 0; x < w; x++) if (px.has(x, base - 1)) px.set(x, base, rc(ramp, 1));
    return prof;
  }
  const FLOW = { white: [P.white[0], P.white[1], P.white[1]], yellow: [P.yellow[0], P.yellow[1], P.yellow[2]], pink: [P.pink[0], P.pink[1], P.pink[2]], violet: [P.violet[0], P.violet[1], P.violet[2]] };
  const COVER = {
    g_clover: { ramp: P.olive, lr: 2.8, asp: 1.15, dens: 4.2, pw: .55, hfrac: .8, lvl: 3, tri: 1 },
    g_cover: { ramp: P.olive, lr: 2.6, asp: 1.9, dens: 5.2, pw: .5, hfrac: .78, lvl: 3, flat: 1 },
    g_spread1: { ramp: P.olive, lr: 3.4, asp: 1.9, dens: 3.6, pw: .45, hfrac: .85, lvl: 3 },
    g_spread2: { ramp: P.olive, lr: 3.1, asp: 2.1, dens: 3.8, pw: .6, hfrac: .88, lvl: 2.7 },
    g_flowers: { ramp: P.olive, lr: 2.6, asp: 1.8, dens: 5, pw: .5, hfrac: .8, lvl: 3, nfl: 6 },
  };
  for (const k of Object.keys(COVER)) SG.reg(k, function (px, R, v, w, h){
    const o = Object.assign({}, COVER[k]);
    o.lr *= .9 + .07*(v % 4); o.pw *= .85 + .06*(v % 5); o.dens *= .9 + .06*(v % 3); o.lvl += (v % 2 ? .3 : 0);
    if (k === 'g_flowers') o.flowers = [[FLOW.white, FLOW.yellow, FLOW.pink, FLOW.violet][v % 4], [FLOW.yellow, FLOW.white, FLOW.violet, FLOW.pink][v % 4]];
    if (k === 'g_clover' && v % 3 === 0){ o.flowers = [FLOW.white]; o.nfl = 3; }
    if (k === 'g_cover' && v === 4){ o.flowers = [FLOW.yellow]; o.nfl = 3; }
    cover(px, R, w, h, o); finish(px, 'br', .4);
  });

  // moss: smooth lumpy mounds (overlapping clusters)
  SG.reg('g_moss2', function (px, R, v, w, h){
    const base = h - 1, ramp = P.olive;
    const nb = 3 + (v % 3), prof = profile(R, w, .6);
    for (let k = 0; k < nb; k++){
      const cx = w*(.2 + .6*(k + R.f()*.6)/nb), rx = R.r(w*.2, w*.3), ry = R.r(h*.32, h*.46);
      SG.cluster(px, cx, base - ry*.55 - (k % 2)*1.5*R.f(), rx, ry, ramp, R, { bumps: 3, lo: .3, hi: .95 });
    }
    for (let x = 1; x < w - 1; x++){ const t = Math.round(base - (h - 3)*prof(x)*.55); for (let y = Math.max(0, t); y <= base; y++) if (!px.has(x, y)) px.set(x, y, rc(ramp, y > base - 3 ? 1 : 2)); }
    finish(px, 'br', .45);
  });
  SG.reg('moss', function (px, R, v, w, h){
    const base = h - 1, ramp = P.moss;
    const cx = (w - 1)/2;
    SG.cluster(px, cx, base - 4, w*.42, 4.6, ramp, R, { bumps: 4, lo: .1, hi: .95 });
    for (let k = 0; k < 3; k++) SG.cluster(px, cx + R.r(-4, 4), base - 6 - R.r(0, 1.5), R.r(2.5, 4), R.r(2, 3), ramp, R, { bumps: 2, lo: .3, hi: 1 });
    for (let x = 1; x < w - 1; x++) px.set(x, base, rc(ramp, 0.4));
    finish(px, 'all', .45);
  });

  // ---------- ferns: fronds as arcs, leaflets alternating along them and shrinking toward the tip ----------
  // a frond: an arc from (ox, oy) drawn as a solid swept shape (widest early, tapering to the tip) whose edges are cut by alternating leaflet notches slanting toward the tip; the upper side is lit
  function frond(px, ramp, ox, oy, L, ang, droop, lmax, lvl, R, spacing, rise){
    rise = rise || .9;
    const sx = Math.sin(ang), cy = -Math.cos(ang);
    const c0x = ox + sx*L*.55, c0y = oy + cy*L*rise, x1 = ox + sx*L*(.9 + Math.abs(sx)*.15), y1 = oy + cy*L*.4 + droop*Math.abs(sx)*L*.45;
    const n = Math.max(8, Math.round(L*2)), pts = SG.curvePts(ox, oy, c0x, c0y, x1, y1, n), sp = spacing || 3;
    const T = [], N = [];
    for (let k = 0; k <= n; k++){
      const a = pts[Math.min(n, k + 1)], b = pts[Math.max(0, k - 1)]; let tx = a[0] - b[0], ty = a[1] - b[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = -ty, ny = tx; if (nx*SG.light.x + ny*SG.light.y < 0){ nx = -nx; ny = -ny; }   // normal toward the light
      T.push([tx, ty]); N.push([nx, ny]);
    }
    const hwOf = t => lmax*Math.min(1, .35 + t*3)*(1 - t*.8);
    for (let k = 0; k <= n; k++){
      const t = k/n, hw = hwOf(t), [x, y] = pts[k], [nx, ny] = N[k];
      for (let d = -hw; d <= hw + .01; d += .5){
        const lt = d/Math.max(1, hw);                      // +1 on the lit side
        px.set(x + nx*d, y + ny*d, rc(ramp, lvl + lt*1.2 + (t > .85 ? .4 : 0) - (lt < -.7 ? .6 : 0)));
      }
    }
    // notches between leaflets: alternate sides, slanting toward the tip
    for (let k = sp; k < n - 1; k += sp){
      const t = k/n, hw = hwOf(t); if (hw < 1.8) continue;
      const side = ((k/sp) | 0) & 1 ? 1 : -1, [x, y] = pts[k], [nx, ny] = N[k], [tx, ty] = T[k];
      for (let d = hw*.45; d <= hw + .4; d += .5){ const q = d*side; px.set(x + nx*q - tx*d*.7, y + ny*q - ty*d*.7, rc(ramp, lvl - 1.4)); }
    }
    // midrib
    for (let k = 1; k < n - 1; k++) if (hwOf(k/n) > 1.5) px.set(pts[k][0], pts[k][1], rc(ramp, lvl - .7));
  }
  function ferns(px, R, w, h, o){
    const ox = (w - 1)/2 + (o.ox || 0), oy = o.oy;
    const n = o.n, fr = [];
    for (let i = 0; i < n; i++){
      const u = (i + .5)/n*2 - 1 + R.r(-.12, .12), ang = u*o.fan, L = (o.L0 + (o.L1 - o.L0)*(1 - Math.pow(Math.abs(u), 1.6)))*R.r(.88, 1.08);
      fr.push({ ang, L, d: R.f(), u });
    }
    fr.sort((a, b) => a.d - b.d);
    for (const f of fr) frond(px, o.ramp, ox, oy, f.L, f.ang, o.droop, o.lmax*R.r(.85, 1.1), o.lvl + (f.d > .5 ? 1 : 0) + (f.u < -.2 ? .5 : 0) - 1, R, o.sp, o.rise);
  }
  SG.reg('g_fern2', function (px, R, v, w, h){
    ferns(px, R, w, h, { ramp: P.olive, n: 5 + (v % 2), fan: 1.4 + .05*(v % 3), L0: 15, L1: 19, droop: 1.3, lmax: 3.1, lvl: 3, oy: h - 2, sp: 3, rise: .95 });
    finish(px, 'br', .4);
  });
  SG.reg('g_fern3', function (px, R, v, w, h){
    ferns(px, R, w, h, { ramp: P.olive, n: 6 + (v % 2), fan: 1.45 + .05*(v % 3), L0: 18, L1: 23, droop: 1.35, lmax: 3.3, lvl: 3, oy: h - 2, sp: 3, rise: .95 });
    finish(px, 'br', .4);
  });
  SG.reg('fern', function (px, R, v, w, h){
    const pot = P.pot, cx = (w - 1)/2, top = h - 7;
    for (let y = 0; y < 6; y++){
      const half = y === 0 ? 4.2 : 3.6 - y*.28, x0 = Math.round(cx - half), x1 = Math.round(cx + half);
      for (let x = x0; x <= x1; x++){ let i = y === 0 ? 3 : 2; if (x - x0 <= 1) i += 1; else if (x1 - x <= 1) i -= 1; if (y === 5) i -= 1; px.set(x, top + 1 + y, rc(pot, i)); }
    }
    ferns(px, R, w, h, { ramp: P.fern, n: 5 + (v % 2), fan: 1.25, L0: 10, L1: 14, droop: 1.2, lmax: 2.3, lvl: 3.3, oy: top + 1.5, sp: 3, rise: .95 });
    finish(px, 'br', .3);
  });
})();
