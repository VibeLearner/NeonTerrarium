// Neon Terrarium: tree tops drawn in code (Nov 2026). Runs after spritegen.js and shares its rules (true pixel size, light from the upper left, ramps hue-shifted,
// clusters not speckle, selective outline). Only the crowns are sprites: trunks and limbs are real geometry (garden.js treeAt), and a crown is drawn as four
// copies crossed round its middle (canopy()) so it reads full from every angle the camera turns to.
//
// Every kind shares one family of ramps (palette B's lush greens, its coral and cream blossom, a muted amber and a soft violet), the same light and the same
// outline, so any two kinds can stand side by side in a grove without one looking out of place. Kinds and sizes (SPR.size in sprites.js, variants SG.COUNT in
// spritegen.js):
//   tc_round 36x30   round leafy (an oak or a lime)        tc_oval 26x36     tall oval (a hornbeam)          tc_willow 40x38   weeping willow
//   tc_pine 28x40    tiered conifer                         tc_cypress 14x40  narrow flame                    tc_blossom 38x30  cherry blossom
//   tc_maple 36x30   amber and coral leaves                 tc_umbrella 44x22 wide flat-topped crown          tc_palm 40x30     palm fronds
//   tc_airy 30x32    sparse and light (a birch)             tc_wisteria 38x34 green crown, violet racemes     tc_puff 22x18     a small clump, for a limb's own crown
// tools/treelab/ builds the lab page that shows them all (every kind, every variant) to keep or drop.
(() => {
  const ramp = (...l) => l.map(SG.hex);
  const TP = {
    leaf:    ramp('#14301a', '#1f4a22', '#2f6a2a', '#468a32', '#62a83c', '#86c454', '#b0dc78'),
    deep:    ramp('#0e2a20', '#183f2e', '#24573a', '#357046', '#4f8c54', '#73ab68'),
    airy:    ramp('#24421e', '#3c6428', '#5a8a36', '#7aaa46', '#9cc460', '#c2dc86'),
    blossom: ramp('#7a3050', '#b2547a', '#e2829e', '#f8aabe', '#ffd2dc', '#fff0f2'),
    maple:   ramp('#4a2016', '#7a3420', '#ae4e2c', '#d8723e', '#f09a58', '#ffc282'),
    amber:   ramp('#4e3216', '#7a5222', '#a87430', '#d09a40', '#ecc062'),
    wist:    ramp('#2e2458', '#4a3c8a', '#6e58b8', '#9a82dc', '#c4b0f2', '#e6dcff'),
    palm:    ramp('#15301a', '#244c22', '#386c2a', '#538c34', '#76ac46', '#a2cc66'),
    bark:    ramp('#1e140c', '#33241a', '#4a3626'),
  };
  // a variant's own temperature: the same ramp nudged a little warmer or cooler, so variants of a kind differ but stay in the family
  const tint = (r, v, k = .08) => { const t = ((v*37) % 7)/6 - .5; return r.map(c => t > 0 ? SG.mix(c, SG.shade(c, .3), t*k*2) : SG.mix(c, SG.shade(c, -.3), -t*k*2)); };
  const TAU = Math.PI*2;
  // a crown: one mass in shadow, lobes round it in the middle values, lit lobes toward the upper left; a few branch pixels peeking through low down
  function crown(px, R, cx, cy, rx, ry, rp, o = {}){
    const n = o.n || 7;
    SG.cluster(px, cx, cy + ry*.06, rx, ry, rp, R, { bumps: o.bumps || 7, lo: 0, hi: .5 });
    for (let k = 0; k < n; k++){ const a = R.r(0, TAU), d = R.r(.25, .62);
      SG.cluster(px, cx + Math.cos(a)*rx*d, cy + Math.sin(a)*ry*d*.85, rx*R.r(.32, .5), ry*R.r(.32, .5), rp, R, { bumps: 4, lo: .18, hi: .82 }); }
    for (let k = 0; k < Math.ceil(n/2); k++){ const a = R.r(Math.PI*1.02, Math.PI*1.55), d = R.r(.1, .48);
      SG.cluster(px, cx + Math.cos(a)*rx*d, cy + Math.sin(a)*ry*d, rx*R.r(.24, .38), ry*R.r(.24, .38), rp, R, { bumps: 3, lo: .45, hi: 1 }); }
    if (o.twigs !== false) for (let k = 0; k < (o.twigs || 2); k++){ const x0 = cx + R.r(-rx*.25, rx*.25), y0 = cy + ry*R.r(.35, .6);
      const x1 = x0 + R.r(-rx*.3, rx*.3), y1 = y0 - ry*R.r(.25, .45); if (px.has(x0, y0)) SG.line(px, x0, y0, x1, y1, R.pick(TP.bark.slice(1))); }
  }
  // dots of blossom or fruit over a crown, in small clusters (never single pixels)
  function dots(px, R, n, rp, lo = 2){ for (let k = 0; k < n; k++){ const x = R.i(1, px.w - 3), y = R.i(1, px.h - 3);
    if (!px.has(x, y) || !px.has(x + 1, y) || !px.has(x, y + 1)) continue;
    const c = rp[R.i(lo, rp.length - 1)]; px.set(x, y, c); px.set(x + 1, y, rp[Math.max(0, lo - 1)]); if (R.chance(.5)) px.set(x, y + 1, rp[Math.min(rp.length - 1, lo + 1)]); } }
  const done = px => { SG.despeckle(px); SG.edge(px, 'br', .45); };
  // ---- the kinds ----
  SG.reg('tc_round', function (px, R, v, w, h){
    const rp = tint(TP.leaf, v), rx = w*R.r(.4, .47), ry = h*R.r(.38, .45);
    crown(px, R, w/2, h/2 + 1, rx, ry, rp, { n: R.i(6, 9) });
    if (v % 4 === 3) dots(px, R, 6, TP.blossom, 3);
    done(px);
  });
  SG.reg('tc_oval', function (px, R, v, w, h){
    const rp = tint(R.chance(.5) ? TP.leaf : TP.deep, v);
    // one tall mass, then lobes up its height (not stacked balls)
    SG.cluster(px, w/2, h*.55, w*.46, h*.44, rp, R, { bumps: 9, lo: 0, hi: .5 });
    for (let k = 0; k < 9; k++){ const y = h*R.r(.18, .88), x = w/2 + R.r(-w*.22, w*.22), lit = x < w/2 && y < h*.6;
      SG.cluster(px, x, y, w*R.r(.18, .28), h*R.r(.1, .15), rp, R, { bumps: 3, lo: lit ? .4 : .15, hi: lit ? 1 : .75 }); }
    done(px);
  });
  SG.reg('tc_willow', function (px, R, v, w, h){
    const rp = tint(TP.airy, v, .1), top = h*.3;
    // the hanging curtain first (behind the crown): strands of leaves in loose bunches, longest at the sides, gaps between bunches
    let x = 2;
    while (x < w - 2){
      const bunch = R.i(2, 4), gap = R.i(1, 3);
      for (let b = 0; b < bunch && x < w - 2; b++, x++){
        const e = Math.abs(x - w/2)/(w/2), len = h*(.3 + .45*e)*R.r(.65, 1.05), y0 = top + h*R.r(.02, .14), sway = R.r(-2, 2), side = x < w/2;
        for (let y = 0; y < len; y++){ const xx = x + sway*(y/len)**2, t = 1 - y/len;
          if (y % 4 === 3 && R.chance(.35)) continue;   // a break in the strand now and then
          px.set(xx, y0 + y, SG.rampAt(rp, (side ? .35 : .2) + .45*t, xx, y0 + y, false));
          if (y % 3 === 1 && R.chance(.45)) px.set(xx + (side ? -1 : 1), y0 + y, rp[side ? 4 : 2]); }
      }
      x += gap;
    }
    crown(px, R, w/2, top, w*.4, h*.22, rp, { n: 6, twigs: false });
    done(px);
  });
  SG.reg('tc_pine', function (px, R, v, w, h){
    const rp = tint(TP.deep, v), tiers = R.i(5, 7);
    // tiers from the bottom up, each a dense drooping skirt that overlaps the one below; darker underneath, lit from the left
    for (let k = 0; k < tiers; k++){ const t = k/(tiers - 1), y = h*(.95 - t*.78), half = w*(.49 - t*.4)*R.r(.92, 1.05), th = h*(.2 - t*.06);
      for (let x = -Math.ceil(half); x <= half; x++){ const e = Math.abs(x)/half, drop = e*e*th*.55, top = y - th*(1 - e*.75), bot = y + drop;
        for (let yy = Math.floor(top); yy <= bot; yy++){ const q = (yy - top)/(bot - top + .001), lt = .78 - q*.55 + (x < 0 ? .12 : -.05) - e*.12;
          px.set(w/2 + x, yy, SG.rampAt(rp, lt, w/2 + x, yy, true)); } } }
    for (let y = 0; y < 3; y++) px.set(w/2, y, rp[3]);
    done(px);
  });
  SG.reg('tc_cypress', function (px, R, v, w, h){
    const rp = tint(TP.deep, v, .06);
    for (let y = 1; y < h - 1; y++){ const t = y/h, half = Math.max(1, w*.5*Math.sin(Math.min(1, t*1.25)*Math.PI*.5)*(t > .85 ? (1 - t)*6 : 1)) + (y % 5 === 0 ? 1 : 0);
      for (let x = -half; x <= half; x++){ const lt = .55 - x/half*.35 + ((y + Math.round(x)) % 4 === 0 ? .15 : 0); px.set(Math.round(w/2 + x), y, SG.rampAt(rp, lt, x, y, true)); } }
    done(px);
  });
  SG.reg('tc_blossom', function (px, R, v, w, h){
    const leafy = v % 3 === 2;
    if (leafy){ crown(px, R, w/2, h/2 + 1, w*.45, h*.4, tint(TP.leaf, v), { n: R.i(7, 10) }); dots(px, R, 22, TP.blossom, 2); }
    else {
      // green underneath, mostly hidden: blossom over it, so the leaves show only as a soft shadow at the bottom
      SG.cluster(px, w/2, h*.6, w*.42, h*.32, tint(TP.leaf, v), R, { bumps: 6, lo: .05, hi: .4 });
      crown(px, R, w/2, h/2, w*.45, h*.38, v % 2 ? TP.blossom : SG.mix ? TP.blossom.map(c => SG.mix(c, SG.hex('#fff4ec'), .35)) : TP.blossom, { n: R.i(7, 10), twigs: 1 });
      dots(px, R, 8, TP.blossom, 4); }
    done(px);
  });
  SG.reg('tc_maple', function (px, R, v, w, h){
    const rp = [TP.maple, tint(TP.amber, v), TP.maple.map((c, i) => SG.mix(c, TP.amber[Math.min(i, 4)], .5)), tint(TP.leaf, v)][v % 4];
    crown(px, R, w/2, h/2 + 1, w*R.r(.4, .46), h*R.r(.38, .44), rp, { n: R.i(7, 10) });
    done(px);
  });
  SG.reg('tc_umbrella', function (px, R, v, w, h){
    const rp = tint(R.chance(.5) ? TP.leaf : TP.airy, v), layers = R.i(2, 3);
    for (let k = 0; k < layers; k++){ const y = h*(.62 - k*.2), rx = w*(.47 - k*.08); crown(px, R, w/2 + R.r(-2, 2), y, rx, h*.2, rp, { n: 6, bumps: 9, twigs: k ? false : 3 }); }
    done(px);
  });
  SG.reg('tc_palm', function (px, R, v, w, h){
    const rp = tint(TP.palm, v), cx = w/2, cy = h*.34, n = R.i(10, 13);
    // fronds all round the crown, back ones first (darker): a rib arching up and out and drooping at the tip, with a fringe of leaflets either side of it
    const fr = []; for (let k = 0; k < n; k++) fr.push({ a: k/n*TAU + R.r(-.2, .2), len: R.r(.4, .5)*w });
    fr.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
    for (const f of fr){ const ca = Math.cos(f.a), sa = Math.sin(f.a), back = sa < 0;
      const ex = cx + ca*f.len, ey = cy + sa*f.len*.3 + h*R.r(.3, .45), mx = cx + ca*f.len*.55, my = cy + sa*f.len*.2 - h*R.r(.1, .2);
      const pts = SG.curvePts(cx, cy, mx, my, ex, ey, 18), base = (back ? .25 : .5) + (ca < 0 ? .2 : 0);
      pts.forEach(([x, y], i) => { if (i < 2) return; const t = i/18, fl = Math.max(1, Math.round((1 - Math.abs(t - .45)*1.4)*5));
        for (let q = 1; q <= fl; q++){ px.set(x - q*.5, y + q, SG.rampAt(rp, base - q*.05, x, y + q, true)); px.set(x + q*.5, y + q, SG.rampAt(rp, base - .15 - q*.05, x, y + q, true)); }
        px.set(x, y, SG.rampAt(rp, base + .3 - t*.2, x, y, false)); }); }
    SG.cluster(px, cx, cy + 1, 3.5, 2.5, TP.amber, R, { bumps: 2, lo: .1, hi: .55 });
    done(px);
  });
  SG.reg('tc_airy', function (px, R, v, w, h){
    const rp = tint(TP.airy, v), n = R.i(12, 16);
    // a loose, light crown: many small clumps with sky between them, a few pale twigs only near the bottom
    for (let k = 0; k < 2; k++){ const x0 = w/2 + R.r(-2, 2), y0 = h*.98, x1 = w/2 + R.r(-w*.25, w*.25), y1 = h*R.r(.55, .7); SG.line(px, x0, y0, x1, y1, SG.hex('#cfc6b4')); }
    for (let k = 0; k < n; k++){ const a = R.r(0, TAU), d = Math.sqrt(R.f())*.85, x = w/2 + Math.cos(a)*w*.38*d, y = h*.46 + Math.sin(a)*h*.4*d, lit = y < h*.5 && x < w*.55;
      SG.cluster(px, x, y, R.r(3.5, 5.5), R.r(3, 4.5), rp, R, { bumps: 3, lo: lit ? .4 : .12, hi: lit ? 1 : .72 }); }
    done(px);
  });
  SG.reg('tc_wisteria', function (px, R, v, w, h){
    const rp = tint(TP.leaf, v), top = h*.32;
    crown(px, R, w/2, top, w*.42, h*.26, rp, { n: 6, twigs: false });
    const wr = v % 3 === 1 ? TP.blossom : TP.wist;
    for (let k = 0; k < R.i(8, 12); k++){ const x = R.i(4, w - 5), y0 = top + R.i(0, Math.round(h*.18)), len = R.i(6, 12);
      for (let y = 0; y < len; y++){ const t = y/len, half = (1 - t)*1.6; for (let q = -half; q <= half; q++) px.set(x + q, y0 + y, SG.rampAt(wr, .9 - t*.6 - (q > 0 ? .15 : 0), x + q, y0 + y, true)); } }
    done(px);
  });
  SG.reg('tc_puff', function (px, R, v, w, h){
    const rp = tint([TP.leaf, TP.leaf, TP.airy, TP.deep][v % 4], v);
    crown(px, R, w/2, h/2 + .5, w*.44, h*.42, rp, { n: 4, twigs: 1 });
    if (v % 5 === 4) dots(px, R, 4, TP.blossom, 3);
    done(px);
  });
})();
