/* section: club.js */
/* section: club -> Neon Dome club furniture, built in the pod lab's own grammar (STYLE.md set A motifs, STYLE2.md set B hardware),
   with the same kit, materials and renderer as the apartment furnisher.

   The four club styles are four sets, each a dialect the world already speaks:
     A  Neon lounge          Neon Tenement after dark: lacquer, velvet, brass brackets, M3 window-grille lattice, M6 glyph plates,
                             one M1 neon glyph, paper lanterns. Warm bulbs against one cold neon.
     B  Orbital lounge       Cream Module, 70s space-age (STYLE2 §2): molded cream shells (H9 light-edge seam), pill forms, chrome
                             bands, H2 portholes, burnt orange / mustard / avocado / teal upholstery. Never white plastic + cyan underglow.
     C  Industrial rave      Night Hab: painted hull steel with chipped edges, H6 hazard-yellow structure, H5 conduit and sagging
                             cables, H4 vents and fans, H7 status pips, one stencil code (M7), stickers, cargo-case forms.
     D  Crystal bathhouse    Showa sento turned aquarium bar: M2 mosaic tile bands, M8 terrazzo with glow chips, M9 frosted
                             scanline glass, chrome trim, H2 porthole tanks with water and fish, enamel mint and salmon.

   Rules kept from the style guides: one hero motif per piece plus one wear detail; about a third of seeds have no glow (lighting and
   screens excepted); glow is functional (a lamp, a screen, a sign, a status pip); no perimeter LED underglow; no real words, only
   pseudo-glyphs, code tags and the ten allowed single glyphs. Meters, fronts face +z, bottom at y = 0.
   Seat .44, bar stool .76, standing table 1.05, counter 1.08, DJ desk 1.0. */
(window.PODLAB_SECTIONS = window.PODLAB_SECTIONS || []).push({ id: 'club', build(K) {
  const { B, T, V, PI, M, TX } = K;
  const H = K.HAB, S = K.STYLE;
  const sin = Math.sin, cos = Math.cos;
  const SEAT = .44, GAP = .2;   // GAP: clearance between a seat front and a booth table
  const dry = () => (H.isDry && H.isDry()) || (S.isDry && S.isDry());

  function dims(b) {
    b.g.updateMatrixWorld(true);
    const bx = new T.Box3().setFromObject(b.g, true), s = new T.Vector3(); bx.getSize(s);
    const q = v => Math.round(v * 100) / 100;
    return { W: q(s.x), D: q(s.z), H: q(s.y) };
  }
  const glowOn = (c, p = .66) => c.chance(p);   // about a third of decorative glow rolls off

  /* ---------------- per-set kits (materials and colors, all on the color stream) ---------------- */
  function kitA(c) {
    const lac = c.pick([{ n: 'lacquer red', c: '#8e2a26' }, { n: 'jade lacquer', c: '#25685b' }, { n: 'black lacquer', c: '#1e181b' }, { n: 'mustard lacquer', c: '#a87a24' }]);
    const vel = c.pick([{ n: 'oxblood velvet', c: '#6b1d29' }, { n: 'plum velvet', c: '#58284c' }, { n: 'jade velvet', c: '#22544b' }, { n: 'gold velvet', c: '#a77a26' }, { n: 'rust velvet', c: '#8a3a22' }]);
    const neon = c.pick(['#ff3fa4', '#38e8ff', '#ff3fa4', '#9b6bff']);
    return {
      lac, vel, neon,
      lacM: M(lac.c, { roughness: .3, metalness: .05 }),
      velM: H.softM(c, vel.c, { print: c.chance(.25) ? 'quilt' : 'plain' }),
      velDark: H.softM(c, H.shade(vel.c, -.25), { print: 'plain' }),
      brassM: M('#b98c43', { roughness: .32, metalness: .85 }),
      warm: '#ffcf8a'
    };
  }
  function kitB(c) {
    const shell = c.pick([{ n: 'cream', c: '#ece2c9' }, { n: 'bone', c: '#d8ccb0' }, { n: 'warm white', c: '#f1ebdd' }, { n: 'mint shell', c: '#9fcbb5' }]);
    const up = c.pick([{ n: 'burnt orange', c: '#cf6a2e' }, { n: 'mustard', c: '#d8a431' }, { n: 'avocado', c: '#8a9a3c' }, { n: 'teal', c: '#2f8c8c' }, { n: 'walnut brown', c: '#6a4a31' }]);
    return {
      shell, up,
      shellM: H.shellM(c, shell.c, { gloss: .55 }),
      shell2M: H.shellM(c, H.shade(shell.c, -.12), { gloss: .45 }),
      upM: H.softM(c, up.c, { print: c.pick(['plain', 'plain', 'quilt', 'stripe']) }),
      up2M: H.softM(c, H.shade(up.c, -.18), { print: 'plain' }),
      chromeM: H.chromeM(),
      edge: c.pick(['#ffb35c', '#ffcf8a', '#5ff0ff']),
      warm: '#ffb35c'
    };
  }
  function kitC(c) {
    const hull = c.pick([{ n: 'gunmetal', c: '#2c3338' }, { n: 'hull teal', c: '#2f5a60' }, { n: 'deep navy', c: '#1a2531' }, { n: 'oxide green', c: '#3d4a3c' }]);
    const pad = c.pick([{ n: 'rust leather', c: '#a8532c' }, { n: 'black leather', c: '#2a2624' }, { n: 'plum leather', c: '#6b3f5e' }, { n: 'oatmeal canvas', c: '#cdbfa3' }]);
    const neon = c.pick(['#ff4f9a', '#ff3b30', '#5ff0ff', '#a6ff4d']);
    return {
      hull, pad, neon,
      hullM: H.hullM(c, hull.c, { wear: .55, rivets: c.chance(.5) }),
      hull2M: H.hullM(c, H.shade(hull.c, -.2), { wear: .4 }),
      padM: pad.n.includes('canvas') ? H.softM(c, pad.c, { print: 'plain' }) : H.leatherM(c, pad.c),
      hazM: H.hazardM(c),
      rubM: H.rubberM(),
      darkM: H.darkM()
    };
  }
  function kitD(c) {
    const tiles = c.pick([
      { n: 'sky and jade tile', cols: ['#6fa3b8', '#2f7d6d', '#d9cfb4'] },
      { n: 'mint and salmon tile', cols: ['#a8d4c0', '#ef8c74', '#ecd79b'] },
      { n: 'cobalt and cream tile', cols: ['#3554a8', '#d9cfb4', '#6fa3b8'] },
      { n: 'jade and butter tile', cols: ['#2f7d6d', '#ecd79b', '#a8d4c0'] }]);
    const enamel = c.pick([{ n: 'mint enamel', c: '#a8d4c0' }, { n: 'salmon enamel', c: '#ef8c74' }, { n: 'butter enamel', c: '#ecd79b' }, { n: 'sky enamel', c: '#8fb9cc' }]);
    const mode = c.pick(['wave', 'steps', 'rows', 'diamond']);
    return {
      tiles, enamel, mode,
      tileTex: (rx, ry) => TX(S.mosaicBand, [c, { w: 256, h: 128, tile: 16, grout: 2, mode, colors: tiles.cols, groutColor: '#e9e4d6' }], [rx, ry]),
      enamelM: M(enamel.c, { roughness: .35 }),
      chromeM: H.chromeM(),
      terrazzo: (rep) => S.terrazzoMat ? S.terrazzoMat(c, { base: c.pick(['#d9cfb4', '#b9ab98', '#4a4652']), glow: c.pick(['#38e8ff', '#ff3fa4', '#a6ff4d']) }, rep || [1, 1], { roughness: .35 }) : M('#d9cfb4', { roughness: .35 }),
      frost: () => { const t = TX(S.scanlineGlass, [c, { w: 256, h: 256, tint: c.pick(['#cfe8ec', '#f2e4c8', '#d9eef0']), rain: c.chance(.4) }]); return M('#e8f4f4', { map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: .35, transparent: true, opacity: .78, roughness: .15 }) },
      water: c.pick(['#38c8e0', '#2fb8a8', '#5fa8ff']),
      neon: c.pick(['#38e8ff', '#ff3fa4', '#38e8ff'])
    };
  }
  const tileM = (kd, rx, ry) => M('#ffffff', { map: kd.tileTex(rx, ry), roughness: .3 });

  /* ---------------- shared small parts ---------------- */
  // one fish: two shapes, warm or cold color
  function fish(b, c, x, y, z, ry) {
    const col = c.pick(['#ff8a3c', '#ffd23c', '#ff4f7a', '#f2f2f2', '#ff6a2a']);
    const m = M(col, { roughness: .45 });
    b.sub(x, y, z, ry);
    const body = b.add(new T.SphereGeometry(.03, 10, 8), m); body.scale.set(1.7, 1, .55);
    const tail = b.add(new T.ConeGeometry(.022, .035, 4), m, -.06, 0, 0); tail.rotation.z = PI / 2;
    b.pop();
  }
  // a paper lantern hanging from y (top), with pseudo-glyph plate painted on its skin (M6) and a warm bulb
  function paperLantern(b, c, x, y, z, R, Hh, col) {
    const skin = dry() ? null : TX(S.glyphColumn, [c, { n: 2, cell: 48, plate: col, ink: S.inkFor ? S.inkFor(col) : '#26232b', vertical: true }]);
    const m = new T.MeshStandardMaterial({ color: '#000', emissive: col, emissiveIntensity: 1.25, emissiveMap: skin, map: skin });
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new T.Vector2(R * (0.55 + 0.45 * sin(t * PI)), -Hh * t)); }
    const g = new T.LatheGeometry(pts, 20);
    b.add(g, m, x, y, z);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; const rib = []; for (let k = 0; k <= 8; k++) { const t = k / 8; const rr = R * (0.55 + 0.45 * sin(t * PI)) + .003; rib.push(V(x + cos(a) * rr, y - Hh * t, z + sin(a) * rr)); } b.tube(rib, .0035, M('#2a1a14', { roughness: .6 }), 12); }
    b.cyl(R * .58, R * .58, .025, M('#2a1a14', { roughness: .5 }), x, y - .012, z, 14);
    b.cyl(R * .58, R * .58, .025, M('#2a1a14', { roughness: .5 }), x, y - Hh - .013, z, 14);
    const tas = b.add(new T.ConeGeometry(.02, .1, 8), M('#b8322a', { roughness: .8 }), x, y - Hh - .08, z);
    tas.rotation.x = PI;
  }
  // a pseudo-glyph sign plate (M6) on a face at z, centered on x, bottom at y
  function glyphPlate(b, c, w, h, x, y, z, plate) {
    const src = dry() ? null : TX(S.glyphColumn, [c, { n: Math.max(1, Math.round(h / w)), cell: 64, plate, ink: S.inkFor ? S.inkFor(plate) : '#26232b', vertical: h > w }]);
    S.decal(b, src, w, h, x, y + h / 2, z + .003, 0, 0, { rough: .5 });
  }

  /* =========================================================================================
     BOOTHS
     ========================================================================================= */
  // one booth bench along x, seat front at +z, back against z = -D/2 - bt. Built in the current sub.
  function benchA(b, c, k, L, D, bh) {
    const bt = .14, z0 = 0;
    b.box(L, .1, D + bt, k.lacM, 0, 0, -bt / 2);                                  // lacquer kick plinth
    b.box(L, .014, .006, k.brassM, 0, .045, D / 2 + .001);                         // brass kick strip
    b.soft(L - .02, SEAT - .1, D - .02, .06, .045, k.velM, 0, .1, z0);              // seat cushion
    b.box(L, SEAT + .02 - .1, bt, k.lacM, 0, .1, -D / 2 - bt / 2);                   // lacquer back frame under the tufting
    b.box(L, bh - .06 - SEAT, .035, k.lacM, 0, SEAT, -D / 2 - bt + .0175);            // back board the channels are tufted onto
    const n = Math.max(3, Math.round(L / .16));                                    // channel tufting: real channels, readable at 720p
    for (let i = 0; i < n; i++) b.softV(L / n - .006, bh - SEAT - .06, bt - .04, .04, .03, k.velM, -L / 2 + L / n * (i + .5), SEAT, -D / 2 - bt + .02);
    b.box(L + .02, .06, bt + .02, k.lacM, 0, bh - .06, -D / 2 - bt / 2);             // lacquer cap rail
    b.box(L + .02, .008, .01, k.brassM, 0, bh - .035, -D / 2 + .006);                // brass edge on the cap
    b.surface(0, bh, -D / 2 - bt / 2, L, bt * .6);
  }
  function benchB(b, c, k, L, D, bh) {
    const bt = .2;
    H.rrSlab(b, L, .16, D + bt, .12, k.shellM, 0, 0, -bt / 2);                    // molded shell plinth
    b.box(L - .02, .012, .006, k.chromeM, 0, .08, D / 2 + .001);                   // chrome band
    b.soft(L - .04, SEAT - .16, D - .06, .1, .06, k.upM, 0, .16, .0);              // fat seat cushion
    b.box(L, bh - .16, bt, k.shellM, 0, .16, -D / 2 - bt / 2);                     // molded back shell
    b.softV(L - .1, bh - SEAT - .12, .1, .08, .05, k.up2M, 0, SEAT + .02, -D / 2 - .02);   // inset back cushion against the shell
    return bt;
  }
  function benchC(b, c, k, L, D, bh) {
    const bt = .1;
    b.box(L, .3, D + bt, k.hullM, 0, 0, -bt / 2);                                  // hull base box
    H.vent(b, { w: Math.min(.5, L * .4), h: .12, x: -L * .2, y: .08, z: D / 2, mat: k.hull2M, slots: 6 });
    const bays = Math.max(1, Math.round(L / .6));
    for (let i = 0; i < bays; i++) b.soft(L / bays - .03, SEAT - .3, D - .04, .04, .03, k.padM, -L / 2 + L / bays * (i + .5), .3, 0);
    for (const s of [-1, 1]) H.hazardBar(b, .05, bh, .05, s * (L / 2 - .025), 0, -D / 2 - bt / 2, c);   // hazard-yellow posts
    H.hazardBar(b, L, .05, .05, 0, bh - .05, -D / 2 - bt / 2, c);
    b.box(L - .1, bh - .3 - .05, .03, k.hull2M, 0, .3, -D / 2 - bt + .015);         // deck-plate back panel, from the base up
    for (let i = 0; i < bays; i++) b.softV(L / bays - .1, .28, .07, .03, .025, k.padM, -L / 2 + L / bays * (i + .5), SEAT + .12, -D / 2 - bt + .03);
    return bt;
  }
  function benchD(b, c, k, L, D, bh) {
    const bt = .12;
    b.box(L, .32, D + bt, tileM(k, L / .4, .32 / .2), 0, 0, -bt / 2);            // mosaic-tiled base
    b.box(L + .02, .03, D + bt + .02, k.chromeM, 0, .32, -bt / 2);                  // chrome cap on the tiles
    b.soft(L - .04, SEAT - .35, D - .06, .05, .03, k.enamelM, 0, .35, 0);          // enamel-vinyl seat
    // frosted scanline glass back in a chrome frame
    b.box(L - .06, bh - .35 - .03, .02, k.frost(), 0, .35, -D / 2 - bt / 2);
    for (const s of [-1, 1]) b.box(.03, bh - .32, .04, k.chromeM, s * (L / 2 - .015), .35, -D / 2 - bt / 2);
    b.box(L, .03, .05, k.chromeM, 0, bh - .03, -D / 2 - bt / 2);
    return bt;
  }
  const BENCH = { A: benchA, B: benchB, C: benchC, D: benchD };

  function boothTable(b, c, set, k, w, d, x, z) {
    const th = .74;
    if (set === 'A') { b.rbox(w, .045, d, .03, S.terrazzoMat ? S.terrazzoMat(c, { base: '#d9cfb4', glow: k.neon }, [w, d], { roughness: .3 }) : k.lacM, x, th - .045, z); b.cyl(.04, .04, th - .045, k.brassM, x, 0, z, 12); b.cyl(.2, .22, .03, k.lacM, x, 0, z, 20); }
    else if (set === 'B') { H.pill(b, w, .05, d, k.shellM, x, th - .05, z); b.cyl(.09, .14, th - .05, k.shellM, x, 0, z, 24); b.ring(.12, .006, k.chromeM, x, .02, z); }
    else if (set === 'C') { b.box(w, .05, d, k.hull2M, x, th - .05, z); b.box(w - .06, th - .05, d - .06, k.hullM, x, 0, z); H.hatch(b, { w: w * .5, h: .3, x, y: .15, z: z + d / 2 - .03, mat: k.hull2M, latch: 'handle' }); }
    else { b.rbox(w, .04, d, .04, k.terrazzo([w, d]), x, th - .04, z); b.cyl(.05, .05, th - .04, k.chromeM, x, 0, z, 14); b.cyl(.18, .2, .04, tileM(k, 1.5, .3), x, 0, z, 20); }
    b.surface(x, th, z, w * .8, d * .8);
  }

  // hero detail on the open end of a booth, per set
  function boothEnd(b, c, set, k, x, D, bh, side) {
    const zc = -D / 2 + .05;
    if (set === 'A') {
      S.grillePanel(b, c, D + .12, bh - .1, x, .1, zc + D / 2 - .06, k.brass ? '#b98c43' : '#b98c43', c.pick(['diamond', 'circles', 'zigzag', 'squares']), { mode: 'rods', cell: .14, ry: side * PI / 2 });
    } else if (set === 'B') {
      b.sub(x, 0, zc, side * PI / 2);
      H.rrPanel(b, D + .2, bh, .08, .16, k.shellM, -0.0, 0, 0);
      H.porthole(b, { R: .14, ring: .035, spokes: 0, mat: k.chromeM, glass: true, glow: glowOn(c) ? k.edge : null, x: 0, y: bh * .62, z: .05, bolts: false });
      b.pop();
    } else if (set === 'C') {
      b.sub(x, 0, zc, side * PI / 2);
      b.box(D + .1, bh, .04, k.hull2M, 0, 0, 0);
      H.stencil(b, c, { text: H.code(c), x: 0, y: bh * .55, z: .021, size: .16 });
      if (glowOn(c, .55)) H.pips(b, c, { n: 4, x: 0, y: bh * .3, z: .021 });
      b.pop();
    } else {
      b.sub(x, 0, zc, side * PI / 2);
      b.box(D + .1, bh, .06, tileM(k, (D + .1) / .4, bh / .2), 0, 0, 0);
      H.porthole(b, { R: .17, ring: .03, spokes: 0, mat: k.chromeM, glass: true, glow: k.water, x: 0, y: bh * .55, z: .035, bolts: true });
      b.pop();
    }
  }

  function booth(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const form = r.opt('form', ['straight', 'L', 'U', 'U', 'straight']);
      const back = r.opt('back', ['low', 'tall']);
      const L = form === 'straight' ? r.opt('len', [1.2, 1.6, 2.0]) : form === 'U' ? r.opt('len', [2.4, 2.8]) : r.opt('len', [1.6, 2.0]);
      const D = .56, bh = back === 'tall' ? (set === 'C' ? 1.25 : 1.3) : 1.0;
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const bench = BENCH[set];
      // back run
      b.sub(0, 0, 0, 0); const bt = bench(b, c, k, L, D, bh) || .14; b.pop();
      if (form === 'L' || form === 'U') {
        const Ls = form === 'U' ? r.opt('arm', [1.2, 1.5]) : r.opt('arm', [.9, 1.2]);
        const sides = form === 'U' ? [-1, 1] : [-1];
        for (const s of sides) { b.sub(s * (L / 2 - D / 2 - bt), 0, D / 2 + Ls / 2, -s * PI / 2); bench(b, c, k, Ls, D, bh); b.pop(); }
        // table clear of every seat front (GAP each side), so the sofas read as separate pieces around it
        if (form === 'U') { const tw = Math.min(1.1, L - 2 * (D + bt) - 2 * GAP), td = Math.min(.75, Ls - GAP - .2); boothTable(b, c, set, k, tw, td, 0, D / 2 + GAP + td / 2); }
        const endX = form === 'U' ? null : L / 2;
        if (endX != null) boothEnd(b, c, set, k, endX + .03, D, bh, 1);
      } else {
        if (r.flag('ends', .6)) { boothEnd(b, c, set, k, -L / 2 - .03, D, bh, -1); boothEnd(b, c, set, k, L / 2 + .03, D, bh, 1); }
        if (r.flag('table', .5)) boothTable(b, c, set, k, Math.min(1.2, L * .6), .6, 0, D / 2 + GAP + .3);
      }
      // a light per set: A a small brass sconce with a warm bulb above the back, B a light-edge seam, C a caged work lamp, D a glyph
      if (set === 'A' && glowOn(c)) { const x = c.range(-L * .3, L * .3); b.rod(V(x, bh, -D / 2 - .07), V(x, bh + .22, -D / 2 - .07), .008, k.brassM); b.add(new T.SphereGeometry(.07, 16, 8, 0, PI * 2, 0, PI * .5), k.brassM, x, bh + .2, -D / 2 - .07).rotation.x = PI; b.add(new T.SphereGeometry(.035, 12, 8), new T.MeshStandardMaterial({ color: '#000', emissive: k.warm, emissiveIntensity: 1.8 }), x, bh + .17, -D / 2 - .07); b.light(k.warm, x, bh + .12, -D / 2 + .05, .9, 2.5); p.push('brass sconce with a warm bulb'); }
      if (set === 'B' && glowOn(c)) { H.lightEdge(b, { w: L - .2, h: .02, x: 0, y: bh - .1, z: -D / 2 + .001, color: k.edge, intensity: 1.6 }); p.push('light-edge line in the shell seam'); }
      if (set === 'C' && glowOn(c, .5)) { H.cable(b, [-L / 2, bh + .02, -D / 2 - .05], [L / 2, bh + .02, -D / 2 - .05], { sag: .12, r: .007, color: '#1c1c1c' }); p.push('a cable slung along the top rail'); }
      if (set === 'D' && glowOn(c)) { S.glyphTube(b, c, c.pick(['水', '雨', '星']), .24, k.neon, 0, bh + .02, -D / 2 - bt / 2); p.push('one neon glyph above the back'); }
      // wear, one per piece
      const wear = c.pick(['tape', 'number', 'sticker', 'none']);
      if (wear === 'tape') { b.box(.12, .003, .04, M('#8d9296', { roughness: .7 }), c.range(-L * .3, L * .3), SEAT + .001, c.range(-.1, .1), c.range(-.5, .5)); p.push('tape repair on the seat'); }
      if (wear === 'number') { H.stencil(b, c, { text: String(c.int(1, 24)).padStart(2, '0'), x: L / 2 - .12, y: .2, z: D / 2 + .002, size: .08, color: set === 'A' ? '#d8b25a' : undefined }); p.push('booth number on the base'); }
      if (wear === 'sticker' && set !== 'A') { S.sticker(b, c, .08, .08, c.range(-L * .3, L * .3), .18, D / 2 + .004); p.push('a sticker on the base'); }
      b.mark();
      const nm = { A: 'Lounge booth', B: 'Orbital booth', C: 'Rave booth', D: 'Bathhouse booth' }[set];
      p.unshift(form + ' run, ' + back + ' back', { A: k.vel && k.vel.n, B: k.up && k.up.n, C: k.pad && k.pad.n, D: k.tiles && k.tiles.n }[set]);
      return { b, name: nm, parts: p, role: 'Booth seating', seats: Math.round(L / .55) * (form === 'U' ? 2 : form === 'L' ? 1.5 : 1), ...dims(b) };
    };
  }

  /* =========================================================================================
     BAR STOOLS
     ========================================================================================= */
  function stool(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const sH = .76, base = r.opt('base', set === 'C' ? ['crate', 'legs', 'pedestal'] : ['pedestal', 'legs']);
      const back = r.flag('back', .35);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      if (set === 'A') {
        if (base === 'pedestal') { b.cyl(.2, .22, .03, k.lacM, 0, 0, 0, 24); b.cyl(.03, .03, sH - .07, k.brassM, 0, .03, 0, 12); b.ring(.16, .012, k.brassM, 0, .3, 0); }
        else { for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.rod(V(.2 * cos(a), 0, .2 * sin(a)), V(.13 * cos(a), sH - .06, .13 * sin(a)), .016, k.lacM, 8); } b.ring(.17, .012, k.brassM, 0, .28, 0); }
        b.cyl(.2, .19, .04, k.lacM, 0, sH - .08, 0, 24);
        b.soft(.38, .07, .38, .19, .035, k.velM, 0, sH - .04, 0);
        b.ring(.19, .006, k.brassM, 0, sH - .06, 0);
        if (back) { S.grillePanel(b, c, .34, .26, 0, sH + .06, -.2, '#b98c43', c.pick(['diamond', 'circles', 'squares']), { mode: 'rods', cell: .1 }); for (const s of [-1, 1]) b.rod(V(s * .16, sH - .06, -.17), V(s * .16, sH + .32, -.2), .01, k.brassM); }
        p.push(k.vel.n + ' seat', 'brass foot ring');
      } else if (set === 'B') {
        b.cyl(.2, .24, .05, k.shellM, 0, 0, 0, 32);
        b.cyl(.05, .1, sH - .14, k.shellM, 0, .05, 0, 24);                  // molded tulip stem
        b.ring(.17, .01, k.chromeM, 0, .32, 0);
        b.cyl(.21, .17, .06, k.shell2M, 0, sH - .14, 0, 32);
        b.soft(.4, .09, .4, .2, .04, k.upM, 0, sH - .08, 0);
        if (back) { H.rrPanel(b, .38, .3, .05, .14, k.shellM, 0, sH, -.19); b.softV(.3, .2, .04, .08, .015, k.up2M, 0, sH + .05, -.165); }
        p.push(k.up.n + ' cushion', 'molded tulip stem', 'chrome foot ring');
      } else if (set === 'C') {
        if (base === 'crate') { b.box(.42, sH - .1, .42, k.hullM, 0, 0, 0); H.hazardBar(b, .44, .04, .44, 0, 0, 0, c); H.stencil(b, c, { text: H.code(c), x: 0, y: sH * .45, z: .211, size: .1 }); p.push('equipment crate base with a stencil code'); }
        else if (base === 'legs') { for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + PI / 2; b.rod(V(.24 * cos(a), 0, .24 * sin(a)), V(.13 * cos(a), sH - .08, .13 * sin(a)), .018, k.hazM, 8); } b.ring(.19, .014, k.hazM, 0, .3, 0); p.push('hazard-yellow welded legs'); }
        else { b.cyl(.22, .22, .04, k.hullM, 0, 0, 0, 6); b.cyl(.035, .035, sH - .12, k.darkM, 0, .04, 0, 10); b.ring(.17, .014, k.darkM, 0, .3, 0); p.push('hex pedestal'); }
        b.cyl(.19, .19, .03, k.hull2M, 0, sH - .1, 0, 20);
        b.soft(.38, .07, .38, .19, .03, k.padM, 0, sH - .07, 0);
        if (c.chance(.4)) { b.box(.11, .003, .035, M('#8d9296', { roughness: .7 }), c.range(-.05, .05), sH + .001, c.range(-.06, .06), c.range(-.6, .6)); p.push('tape repair'); }
        if (back) { for (const s of [-1, 1]) b.rod(V(s * .12, sH - .08, -.16), V(s * .12, sH + .3, -.2), .012, k.hazM); b.softV(.3, .14, .06, .03, .02, k.padM, 0, sH + .14, -.22, .1); }
      } else {
        const foot = r.opt('foot', ['drum', 'disc', 'drum']);
        if (foot === 'drum') { b.cyl(.2, .22, .2, tileM(k, 3, 1), 0, 0, 0, 24); b.cyl(.21, .21, .02, k.chromeM, 0, .2, 0, 24); }   // tiled drum foot
        else { b.cyl(.24, .25, .025, k.chromeM, 0, 0, 0, 32); b.cyl(.025, .025, .2, k.chromeM, 0, .025, 0, 12); }
        b.cyl(.025, .025, sH - .28, k.chromeM, 0, .22, 0, 12);
        b.ring(.15, .01, k.chromeM, 0, .38, 0);
        b.cyl(.19, .19, .03, k.chromeM, 0, sH - .1, 0, 24);
        b.soft(.38, .07, .38, .19, .03, k.enamelM, 0, sH - .07, 0);
        if (back) { H.porthole(b, { R: .13, ring: .025, spokes: 0, mat: k.chromeM, glass: false, x: 0, y: sH + .2, z: -.19, bolts: false }); for (const s of [-1, 1]) b.rod(V(s * .1, sH - .06, -.17), V(s * .1, sH + .1, -.19), .009, k.chromeM); }
        p.push(k.enamel.n + ' seat', foot === 'drum' ? 'mosaic-tiled foot' : 'chrome disc foot', 'chrome column');
      }
      if (back) p.push('small back');
      b.surface(0, sH, 0, .3, .3, { pool: [] });
      b.mark();
      return { b, name: { A: 'Lounge stool', B: 'Tulip stool', C: 'Rave stool', D: 'Bathhouse stool' }[set], parts: p, role: 'Bar stool', ...dims(b) };
    };
  }

  /* =========================================================================================
     COCKTAIL TABLES (standing height)
     ========================================================================================= */
  function cocktail(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const th = 1.05, shape = r.opt('top', ['round', 'square', 'round']);
      const R = r.opt('size', [.3, .36]);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const top = (mat, t) => shape === 'round' ? b.cyl(R, R, t, mat, 0, th - t, 0, 36) : b.rbox(R * 1.8, t, R * 1.8, .03, mat, 0, th - t, 0);
      if (set === 'A') {
        top(S.terrazzoMat ? S.terrazzoMat(c, { base: c.pick(['#d9cfb4', '#26232b']), glow: k.neon }, [1, 1], { roughness: .3 }) : k.lacM, .04);
        if (shape === 'round') b.ring(R, .008, k.brassM, 0, th - .02, 0); else b.box(R * 1.8 + .01, .01, R * 1.8 + .01, k.brassM, 0, th - .03, 0);
        b.cyl(.035, .035, th - .04, k.lacM, 0, 0, 0, 14); b.ring(.06, .01, k.brassM, 0, th * .5, 0);
        const legs = r.opt('foot', ['disc', 'cross']);
        if (legs === 'disc') b.cyl(.24, .26, .03, k.lacM, 0, 0, 0, 24); else for (const a of [PI / 4, -PI / 4]) b.box(.56, .04, .05, k.lacM, 0, 0, 0, a);
        p.push('terrazzo top with glow chips', 'brass rim');
      } else if (set === 'B') {
        if (shape === 'round') b.cyl(R, R * .96, .05, k.shellM, 0, th - .05, 0, 40); else H.pill(b, R * 2.2, .05, R * 1.5, k.shellM, 0, th - .05, 0);
        b.ring(shape === 'round' ? R * .97 : R * .7, .006, k.chromeM, 0, th - .025, 0);
        b.cyl(.06, .12, th - .05, k.shellM, 0, 0, 0, 28); b.cyl(.24, .26, .04, k.shell2M, 0, 0, 0, 32);
        if (glowOn(c, .4)) { H.lightEdge(b, { w: .05, h: .5, x: 0, y: .25, z: .085, color: k.edge, intensity: 1.4 }); p.push('light-edge down the stem'); }
        p.push('molded shell table', 'chrome trim');
      } else if (set === 'C') {
        const base = r.opt('base', ['drum', 'spool', 'frame']);
        top(H.hullM(c, '#3a4048', { wear: .5 }), .045);
        if (base === 'drum') { b.cyl(.24, .24, th - .045, k.hullM, 0, 0, 0, 20); for (const y of [.1, .5, .9]) b.ring(.245, .012, k.hull2M, 0, y, 0); H.stencil(b, c, { text: H.code(c), x: 0, y: .5, z: .245, size: .12 }); p.push('oil-drum base with stencil'); }
        else if (base === 'spool') { b.cyl(.3, .3, .03, M('#7a5a3a', { roughness: .85 }), 0, 0, 0, 24); b.cyl(.12, .12, th - .08, M('#2b2b2b', { roughness: .8 }), 0, .03, 0, 18); for (let y = .08; y < th - .1; y += .035) b.ring(.125, .012, M(c.pick(['#c83030', '#3050c8', '#e8c030']), { roughness: .6 }), 0, y, 0); p.push('cable-spool base'); }
        else { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) H.hazardBar(b, .04, th - .045, .04, sx * .16, 0, sz * .16, c); H.hazardBar(b, .36, .04, .36, 0, .2, 0, c); p.push('welded hazard frame'); }
        if (glowOn(c, .45)) { H.pips(b, c, { n: 3, x: 0, y: th - .02, z: shape === 'round' ? R : R * .9 }); p.push('status pips on the edge'); }
      } else {
        top(k.terrazzo([1, 1]), .04);
        b.ring(shape === 'round' ? R : R * 1.2, .008, k.chromeM, 0, th - .02, 0);
        b.cyl(.03, .03, th - .04, k.chromeM, 0, 0, 0, 14);
        b.cyl(.22, .24, .12, tileM(k, 3, .6), 0, 0, 0, 24); b.cyl(.23, .23, .015, k.chromeM, 0, .12, 0, 24);
        if (glowOn(c, .5)) { const gm = M('#000', { emissive: k.water, emissiveIntensity: 1.1, transparent: true, opacity: .8 }); b.cyl(.045, .045, th - .3, gm, 0, .16, 0, 14); b.cyl(.06, .06, th - .3, H.glassM({ tint: '#bfeaf0', opacity: .25 }), 0, .16, 0, 18); p.push('lit water stem'); }
        p.push('terrazzo top', 'mosaic-tiled foot');
      }
      b.surface(0, th, 0, R * 1.4, R * 1.4, { round: shape === 'round' });
      b.mark();
      return { b, name: { A: 'Lounge high table', B: 'Orbital high table', C: 'Rave high table', D: 'Bathhouse high table' }[set], parts: p, role: 'Standing table', ...dims(b) };
    };
  }

  /* =========================================================================================
     BAR COUNTERS (decor only on the ground floor)
     ========================================================================================= */
  function counter(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const L = r.opt('len', [1.6, 2.2, 2.8]), D = .62, th = 1.08;
      const form = r.opt('form', ['straight', 'straight', 'return']);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const run = (len) => {
        if (set === 'A') {
          b.box(len, th - .05, D - .05, k.lacM, 0, 0, -.025);
          // M2 mosaic band across the front, set into lacquer (HK estate tiles)
          const mz = M('#ffffff', { map: TX(S.mosaicBand, [c, { w: 256, h: 64, tile: 16, mode: c.pick(['steps', 'wave', 'diamond']), colors: [k.lac.c === '#1e181b' ? '#a8322d' : '#d9cfb4', '#2f7d6d', '#c9952f'] }], [len / .6, 1]), roughness: .3 });
          b.box(len - .06, .28, .01, mz, 0, .45, D / 2 - .02);
          b.box(len, .012, .012, k.brassM, 0, .44, D / 2 - .014); b.box(len, .012, .012, k.brassM, 0, .73, D / 2 - .014);
          b.box(len + .04, .05, D + .04, S.terrazzoMat ? S.terrazzoMat(c, { base: '#26232b', glow: k.neon }, [len, 1], { roughness: .25 }) : k.lacM, 0, th - .05, 0);
          b.rod(V(-len / 2 + .05, .12, D / 2 + .08), V(len / 2 - .05, .12, D / 2 + .08), .018, k.brassM);
        } else if (set === 'B') {
          H.rrSlab(b, len, th - .06, D, .14, k.shellM, 0, 0, 0);
          const pan = Math.max(1, Math.floor(len / .7)); for (let i = 0; i < pan; i++) H.rrPanel(b, len / pan - .12, .55, .02, .12, k.shell2M, -len / 2 + len / pan * (i + .5), .25, D / 2);
          H.pill(b, len + .08, .06, D + .08, H.shellM(c, '#6a4a31', { gloss: .6 }), 0, th - .06, 0);
          b.box(len, .016, .01, k.chromeM, 0, .14, D / 2 + .006);
          if (glowOn(c)) { H.lightEdge(b, { w: len - .1, h: .02, x: 0, y: th - .12, z: D / 2 + .002, color: k.edge, intensity: 1.6 }); p.push('light-edge under the walnut top'); }
        } else if (set === 'C') {
          b.box(len, th - .05, D, k.hullM, 0, 0, 0);
          const bays = Math.max(1, Math.round(len / .8));
          for (let i = 0; i < bays; i++) { const x = -len / 2 + len / bays * (i + .5); H.hatch(b, { w: len / bays - .14, h: .62, x, y: .2, z: D / 2, mat: k.hull2M, latch: 'tab', c, code: i === 0 ? H.code(c) : null }); }
          H.hazardBar(b, len + .02, .08, .04, 0, 0, D / 2 - .02, c);
          b.box(len + .04, .05, D + .06, M('#5b6168', { roughness: .45, metalness: .6, map: TX(H.deckPlateTex, [c, { base: '#5b6168', plates: 2 }], [len / .8, 1]) }), 0, th - .05, 0);
          H.conduit(b, [[-len / 2 + .05, .1, D / 2 + .03], [len / 2 - .05, .1, D / 2 + .03]], { r: .02, mat: k.darkM, toward: [0, 0, -1] });
          if (glowOn(c, .5)) { H.pips(b, c, { n: 5, x: len / 2 - .18, y: th - .14, z: D / 2 }); p.push('status pips'); }
          if (c.chance(.6)) { S.sticker(b, c, .1, .1, c.range(-len * .3, len * .3), .55, D / 2 + .003); S.sticker(b, c, .08, .08, c.range(-len * .3, len * .3), .35, D / 2 + .003); p.push('stickers on the hatches'); }
        } else {
          b.box(len, th - .05, D, tileM(k, len / .4, (th - .05) / .2), 0, 0, 0);
          b.box(len, .06, .02, k.chromeM, 0, .02, D / 2 + .005);
          // porthole tanks set into the front
          const n = Math.max(1, Math.floor(len / .9)); for (let i = 0; i < n; i++) { const x = -len / 2 + len / n * (i + .5); H.porthole(b, { R: .16, ring: .028, spokes: 0, mat: k.chromeM, glass: true, glow: k.water, x, y: .55, z: D / 2 + .01, bolts: true }); }
          b.box(len + .04, .05, D + .06, k.terrazzo([len, 1]), 0, th - .05, 0);
          b.box(len + .04, .012, .012, k.chromeM, 0, th - .04, D / 2 + .03);
          p.push('porthole tanks in the tiled front');
        }
        // back-edge bottles and glasses (dressing surface too)
        const n = Math.floor(len / .14);
        for (let i = 0; i < n; i++) { if (!c.chance(.4)) continue; const x = -len / 2 + .08 + i * .14, hb = c.range(.22, .32), rb = c.range(.035, .045);
          const col = c.pick(['#c8902e', '#2e8a5a', '#e8e2d0', '#7a2a40', '#3a6ad0', '#d8b850']);
          const pts = [[0, 0], [rb, 0], [rb, hb * .62], [rb * .4, hb * .8], [rb * .32, hb], [0, hb]].map(q => new T.Vector2(q[0], q[1]));
          b.add(new T.LatheGeometry(pts, 14), M(col, { roughness: .12, metalness: .1, transparent: true, opacity: .8 }), x, th, -D / 2 + .1); }
        b.surface(0, th, .05, len * .8, D * .5);
      };
      if (form === 'straight') { run(L); p.unshift('straight counter'); }
      else { b.sub(0, 0, 0); run(L); b.pop(); const Lr = .9; b.sub(-L / 2 + D / 2, 0, D / 2 + Lr / 2, PI / 2); run(Lr); b.pop(); p.unshift('counter with a return'); }
      b.mark();
      return { b, name: { A: 'Lounge counter', B: 'Orbital counter', C: 'Rave counter', D: 'Bathhouse counter' }[set], parts: p, role: 'Bar counter (decor, no serving)', ...dims(b) };
    };
  }

  /* =========================================================================================
     DJ BOOTH
     ========================================================================================= */
  function deckGear(b, c, th, z, k, set) {
    const dark = M('#1c1d22', { roughness: .4, metalness: .4 });
    for (const s of [-1, 1]) {
      b.box(.42, .05, .36, dark, s * .32, th, z);
      b.cyl(.15, .15, .012, M('#111114', { roughness: .3, metalness: .6 }), s * .32 - .03, th + .05, z, 32);
      b.cyl(.04, .04, .004, M(c.pick(['#e8e2d0', '#d84a3a', '#2e8a5a']), { roughness: .5 }), s * .32 - .03, th + .062, z, 16);
      b.rod(V(s * .32 + .15, th + .065, z - .12), V(s * .32 + .1, th + .065, z + .06), .005, H.chromeM());
    }
    b.box(.22, .07, .34, dark, 0, th, z);
    H.pips(b, c, { n: 6, x: 0, y: th + .072, z: z + .05, spacing: .025 });
    for (let i = 0; i < 3; i++) b.box(.012, .01, .1, M('#c9ccd2', { roughness: .3, metalness: .8 }), -.05 + i * .05, th + .07, z - .07);
    if (c.chance(.6)) { const sc = H.screen(b, c, { w: .3, h: .2, x: c.pick([-.6, .6]), y: th + .02, z: z - .12, kind: c.pick(['wave', 'bars', 'grid']), tint: set === 'C' ? '#7dff9a' : '#5ff0ff' }); }
  }
  function dj(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const W = r.opt('width', [1.6, 2.0]), D = .7, th = 1.0;
      const form = r.opt('form', ['desk', 'desk', 'podium']);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      if (set === 'A') {
        b.box(W, th, D, k.lacM, 0, 0, 0);
        S.grillePanel(b, c, W - .2, th - .25, 0, .12, D / 2, '#b98c43', c.pick(['diamond', 'circles', 'zigzag', 'rosette']), { mode: 'plane', cell: .16 });
        const glyph = c.pick(S.GLYPHS || ['夜']);
        if (glowOn(c, .8)) { S.glyphTube(b, c, glyph, .42, k.neon, 0, .3, D / 2 + .02); p.push('neon glyph over a brass grille front'); } else p.push('brass grille front');
        b.box(W + .06, .04, D + .06, k.lacM, 0, th - .04, 0);
        for (const s of [-1, 1]) paperLantern(b, c, s * (W / 2 - .1), th + .9, -D / 2 + .05, .12, .3, c.pick(['#c8322a', '#d8a23a']));
        for (const s of [-1, 1]) b.rod(V(s * (W / 2 - .1), th, -D / 2 + .05), V(s * (W / 2 - .1), th + .9, -D / 2 + .05), .012, k.brassM);
      } else if (set === 'B') {
        if (form === 'podium') { b.cyl(W * .42, W * .46, th, k.shellM, 0, 0, 0, 40); }
        else { H.rrSlab(b, W, th, D, .3, k.shellM, 0, 0, 0); }
        H.porthole(b, { R: .22, ring: .05, spokes: 6, mat: k.chromeM, glass: true, glow: glowOn(c) ? k.edge : null, x: 0, y: th * .5, z: form === 'podium' ? W * .44 : D / 2 + .01, bolts: true });
        b.ring(form === 'podium' ? W * .45 : W * .45, .01, k.chromeM, 0, .12, 0);
        b.box(W - .1, .03, D - .1, k.shell2M, 0, th - .03, 0);
        p.push('molded shell with a big porthole');
      } else if (set === 'C') {
        // flight cases on a hazard frame, with conduit and a fan
        const cases = form === 'podium' ? 1 : 2;
        for (let i = 0; i < cases; i++) { const x = cases === 1 ? 0 : (i - .5) * W / 2; b.box(W / cases - .04, th - .1, D, k.hullM, x, .1, 0); for (const y of [.25, .75]) b.box(W / cases - .02, .03, D + .01, M('#9aa0a6', { roughness: .4, metalness: .8 }), x, y * th, 0); H.hatch(b, { w: W / cases - .2, h: .3, x, y: .35, z: D / 2, mat: k.hull2M, latch: 'handle', c, code: i === 0 ? H.code(c) : null }); }
        H.hazardBar(b, W + .04, .1, D + .04, 0, 0, 0, c);
        H.fan(b, { R: .12, x: W / 2 - .2, y: th - .3, z: D / 2, mat: k.hull2M, blades: 5 });
        H.cable(b, [-W / 2 + .1, th, -D / 2], [-W / 2 - .05, .05, -D / 2 + .1], { sag: .2, r: .01, color: '#151515', plugs: 'b' });
        if (c.chance(.7)) { S.sticker(b, c, .12, .12, -W / 4, th * .45, D / 2 + .004); p.push('stickers on the cases'); }
        p.push('flight cases on a hazard frame', 'a fan grille');
      } else {
        b.box(W, th - .06, D, tileM(k, W / .4, th / .2), 0, 0, 0);
        b.box(W - .3, .45, .04, k.frost(), 0, .3, D / 2 + .01);
        for (const s of [-1, 1]) b.box(.04, .5, .06, k.chromeM, s * (W / 2 - .15), .28, D / 2 + .01);
        b.box(W + .04, .06, D + .04, k.terrazzo([W, 1]), 0, th - .06, 0);
        if (glowOn(c, .8)) { const gm = M('#000', { emissive: k.water, emissiveIntensity: .9 }); b.box(W - .34, .4, .01, gm, 0, .32, D / 2 - .01); p.push('frosted glass front lit from behind'); }
        p.push(k.tiles.n + ' body');
      }
      deckGear(b, c, th, -.02, k, set);
      b.surface(0, th, 0, W * .8, D * .5);
      b.mark();
      return { b, name: { A: 'Lounge DJ booth', B: 'Orbital DJ booth', C: 'Rave DJ booth', D: 'Bathhouse DJ booth' }[set], parts: p, role: 'DJ booth (one per club)', ...dims(b) };
    };
  }

  /* =========================================================================================
     PENDANTS (hang from the dome frame; cord top at 2.6 m)
     ========================================================================================= */
  function pendant(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const top = 2.6, y = r.opt('drop', [1.9, 2.1]);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const cord = (x, z, y1) => { b.rod(V(x, top, z), V(x, y1, z), .004, M('#18181c', { roughness: .6 })); b.cyl(.04, .03, .02, M('#18181c', { roughness: .5 }), x, top - .02, z, 12); };
      if (set === 'A') {
        const n = r.opt('count', [1, 3]);
        for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : (i - 1) * .32, yy = y - (n === 1 ? 0 : Math.abs(i - 1) * .12), R = c.range(.14, .19); cord(x, 0, yy); paperLantern(b, c, x, yy, 0, R, R * 1.7, c.pick(['#c8322a', '#d8a23a', '#c8322a', '#b8406a'])); }
        b.light(k.warm, 0, y - .2, 0, 1.2, 4); p.push(n + ' paper lantern' + (n > 1 ? 's' : '') + ' with glyph plates');
      } else if (set === 'B') {
        cord(0, 0, y + .02);
        const R = r.opt('size', [.22, .3]);
        const dome = b.add(new T.SphereGeometry(R, 32, 16, 0, PI * 2, 0, PI * .5), k.shellM, 0, y, 0);
        b.ring(R, .012, k.chromeM, 0, y, 0);
        b.add(new T.SphereGeometry(R * .55, 20, 12), M('#000', { emissive: k.warm, emissiveIntensity: 1.6 }), 0, y - .02, 0);
        b.light(k.warm, 0, y - .1, 0, 1.4, 4); p.push('molded dome shade', 'chrome rim');
      } else if (set === 'C') {
        const nL = r.opt('lamps', [1, 2, 3]), x2 = .15 + nL * .17;
        b.rod(V(-x2, y + .2, 0), V(x2, y + .2, 0), .02, k.darkM); cord(-x2, 0, y + .2); cord(x2, 0, y + .2);
        if (r.flag('tray', .4)) { H.cable(b, [-x2, y + .2, 0], [x2, y + .2, 0], { sag: .1, r: .006, color: '#151515' }); }
        for (let li = 0; li < nL; li++) { const x = nL === 1 ? 0 : -x2 + .15 + li * (2 * x2 - .3) / (nL - 1); b.rod(V(x, y + .2, 0), V(x, y + .05, 0), .006, k.darkM);
          for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.rod(V(x + .07 * cos(a), y + .05, .07 * sin(a)), V(x + .05 * cos(a), y - .12, .05 * sin(a)), .004, k.hazM); }
          b.ring(.07, .005, k.hazM, x, y + .05, 0); b.add(new T.SphereGeometry(.04, 12, 10), M('#000', { emissive: '#ffae3a', emissiveIntensity: 1.8 }), x, y - .05, 0); }
        b.light('#ffae3a', 0, y - .05, 0, 1.2, 4); p.push(nL + ' caged work lamp' + (nL > 1 ? 's' : '') + ' on a conduit bar');
      } else {
        const nG = r.opt('globes', [1, 3]), R0 = r.opt('size', [.12, .16]);
        for (let gi = 0; gi < nG; gi++) { const a = gi / nG * PI * 2, x = nG === 1 ? 0 : .26 * cos(a), z = nG === 1 ? 0 : .26 * sin(a), yy = y - (nG === 1 ? 0 : gi * .14), R = R0 * (gi === 0 ? 1 : .8);
          cord(x, z, yy + .04);
          b.add(new T.SphereGeometry(R, 24, 18), H.glassM({ tint: '#bfeaf0', opacity: .35 }), x, yy - R, z);
          b.add(new T.SphereGeometry(R * .97, 24, 18, 0, PI * 2, PI * .45, PI * .55), M('#000', { emissive: k.water, emissiveIntensity: .9, transparent: true, opacity: .8 }), x, yy - R, z);
          fish(b, c, x + .02, yy - R - .02, z, c.range(0, PI * 2));
          b.ring(.045, .008, k.chromeM, x, yy, z); }
        b.light(k.water, 0, y - .25, 0, 1.0, 3.5); p.push(nG + ' glass globe tank' + (nG > 1 ? 's' : '') + ' with fish');
      }
      b.mark();
      return { b, name: { A: 'Lantern cluster', B: 'Dome pendant', C: 'Work-lamp bar', D: 'Globe tank pendant' }[set], parts: p, role: 'Pendant light', ceiling: true, ...dims(b) };
    };
  }

  /* =========================================================================================
     NEON SIGNS (wall)
     ========================================================================================= */
  function sign(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const kind = r.opt('kind', ['glyph', 'plate', 'icon']);
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const col = set === 'A' ? k.neon : set === 'B' ? c.pick(['#ffb35c', '#ff4f9a']) : set === 'C' ? k.neon : k.neon;
      const y0 = 1.2;
      if (kind === 'plate') {
        const plate = set === 'A' ? c.pick(['#a8322d', '#2f7d6d', '#c9952f']) : set === 'B' ? '#ece2c9' : set === 'C' ? '#e2b230' : '#a8d4c0';
        glyphPlate(b, c, .32, .8, 0, y0, .02, plate);
        b.box(.36, .84, .02, set === 'B' ? k.shellM : set === 'C' ? k.hullM : set === 'D' ? k.chromeM : k.lacM, 0, y0 - .02, 0);
        S.neonTube(b, [[-.2, y0 - .04, .05], [.2, y0 - .04, .05], [.2, y0 + .84, .05], [-.2, y0 + .84, .05], [-.2, y0 - .04, .05]], col, { r: .006, normal: [0, 0, 1], standoff: .03 });
        p.push('glyph plate ringed by a neon tube');
      } else {
        const glyph = kind === 'glyph' ? c.pick(S.GLYPHS || ['夜']) : c.pick(S.ICONS || ['heart', 'star', 'moon']);
        const sz = r.opt('size', [.5, .7]);
        if (set === 'B') H.rrPanel(b, sz + .3, sz + .3, .04, .12, k.shellM, 0, y0 - .15, 0);
        else if (set === 'C') { b.box(sz + .3, sz + .3, .03, M('#ffffff', { map: TX(H.deckPlateTex, [c, { base: '#3a4048', plates: 2 }]), roughness: .5, metalness: .5 }), 0, y0 - .15, 0); H.stencil(b, c, { text: H.code(c), x: (sz + .3) / 2 - .1, y: y0 - .08, z: .016, size: .06 }); }
        else if (set === 'D') { b.box(sz + .3, sz + .3, .03, tileM(k, (sz + .3) / .4, (sz + .3) / .2), 0, y0 - .15, 0); }
        S.glyphTube(b, c, glyph, sz, col, 0, y0, .04);
        p.push((kind === 'glyph' ? 'single neon glyph ' + glyph : 'neon icon'));
      }
      b.light(col, 0, y0 + .3, .3, .8, 2.5);
      b.mark();
      return { b, name: { A: 'Lounge sign', B: 'Orbital sign', C: 'Rave sign', D: 'Bathhouse sign' }[set], parts: p, role: 'Wall sign', wall: true, ...dims(b) };
    };
  }

  /* =========================================================================================
     CENTERPIECES
     ========================================================================================= */
  function centerpiece(set) {
    return (r, c) => {
      const b = new B(), p = [];
      const k = { A: kitA, B: kitB, C: kitC, D: kitD }[set](c);
      const Hh = r.opt('height', [2.0, 2.4]);
      if (set === 'A') {
        // lantern tree: lacquer post in a brass grille cage, lanterns on arms
        b.cyl(.35, .38, .12, k.lacM, 0, 0, 0, 24); b.ring(.36, .01, k.brassM, 0, .1, 0);
        b.cyl(.06, .07, Hh, k.lacM, 0, .12, 0, 16);
        for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; S.grillePanel(b, c, .3, .7, .22 * cos(a), .12, .22 * sin(a), '#b98c43', 'diamond', { mode: 'rods', cell: .12, ry: -a + PI / 2 }); }
        const arms = r.opt('arms', [3, 4]);
        for (let i = 0; i < arms; i++) { const a = i / arms * PI * 2, yy = Hh - .1 - (i % 2) * .3, R = .5; b.rod(V(0, yy, 0), V(R * cos(a), yy + .05, R * sin(a)), .012, k.brassM); paperLantern(b, c, R * cos(a), yy + .02, R * sin(a), .14, .26, c.pick(['#c8322a', '#d8a23a'])); }
        b.light(k.warm, 0, Hh - .3, 0, 1.6, 5); p.push('lantern tree with a brass grille cage');
      } else if (set === 'B') {
        // 70s cream module: molded column with a dome cap and flush chrome portholes lit from inside, optionally ringed by a round
        // upholstered banquette (the conversation-pit move). One hero (the portholes), one wear detail (a scuffed kick band).
        const R = r.opt('girth', [.34, .42]), nP = r.opt('ports', [3, 4]), seat = r.flag('seat', .55);
        const y0 = seat ? 0 : .06, bodyH = Hh - R * .9;
        if (!seat) { b.cyl(R + .06, R + .08, .06, k.chromeM, 0, 0, 0, 40); }
        else {
          const SR = R + .46, rollM = H.softM(c, k.up.c, { print: 'plain' });
          b.cyl(SR - .02, SR, .3, k.up2M, 0, 0, 0, 48);                            // plinth in the darker shade
          b.cyl(SR, SR, .03, k.chromeM, 0, .3, 0, 48);                              // chrome lip
          b.add(new T.TorusGeometry(SR - .2, .1, 12, 48), rollM, 0, .4, 0).rotation.x = PI / 2;   // rolled cushion
          b.cyl(SR - .12, SR - .12, .08, rollM, 0, .33, 0, 48);
          for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; b.box(.012, .2, .03, k.up2M, (R + .05) * sin(a), .42, (R + .05) * cos(a), a); }   // button tufts at the back rest
          b.add(new T.TorusGeometry(R + .06, .07, 10, 40), rollM, 0, .62, 0).rotation.x = PI / 2;   // back roll against the column
          b.surface(0, .45, 0, SR * 2, SR * 2, { seat: true });
        }
        b.cyl(R, R, bodyH, k.shellM, 0, y0, 0, 48);
        b.add(new T.SphereGeometry(R, 40, 14, 0, PI * 2, 0, PI / 2), k.shellM, 0, y0 + bodyH, 0);
        b.ring(R + .004, .014, k.chromeM, 0, y0 + bodyH, 0);
        b.cyl(R + .003, R + .003, .16, k.shell2M, 0, y0 + (seat ? .7 : .06), 0, 48);   // scuffed kick band, a shade darker
        const portY = y0 + bodyH * (seat ? .66 : .58), lit = glowOn(c, .7), pc = c.pick([k.edge, '#ffb35c', '#38c8e0']);
        const discM = lit ? M('#1a1410', { emissive: pc, emissiveIntensity: 1.1, roughness: .2 }) : M('#2a2a30', { roughness: .15, metalness: .4 });
        for (let i = 0; i < nP; i++) {
          const a = i / nP * PI * 2 + PI / 4;
          b.sub(R * sin(a), portY, R * cos(a), a);
          b.add(new T.CircleGeometry(.155, 32), discM, 0, 0, .004);
          b.ring(.17, .028, k.chromeM, 0, 0, -.004, PI * 2, false);
          for (let q = 0; q < 6; q++) { const t = q / 6 * PI * 2; b.add(new T.SphereGeometry(.009, 8, 6), k.chromeM, .17 * cos(t), .17 * sin(t), .024); }
          b.pop();
        }
        if (lit) { b.light(pc, 0, portY, 0, .9, 3.5); p.push('portholes lit from inside'); } else p.push('dark smoked portholes');
        p.push(seat ? 'molded column ringed by a round tufted banquette' : 'molded column on a chrome foot');
      } else if (set === 'C') {
        // speaker tower on a hazard frame, fan, conduit up to the dome frame
        const w = r.opt('width', [.6, .8]);
        H.hazardBar(b, w + .1, .1, w + .1, 0, 0, 0, c);
        const n = Math.round((Hh - .3) / .5);
        for (let i = 0; i < n; i++) { const y = .1 + i * .5; b.box(w, .48, w, k.hullM, 0, y, 0); const dr = M('#111114', { roughness: .7 }); b.add(new T.CylinderGeometry(.18, .07, .06, 24, 1, true), dr, 0, y + .24, w / 2 + .01).rotation.x = PI / 2; b.ring(.18, .015, k.hull2M, 0, y + .24, w / 2 + .02, PI * 2, false); }
        H.conduit(b, [[w / 2 - .06, .1, -w / 2 - .03], [w / 2 - .06, Hh, -w / 2 - .03]], { r: .025, mat: k.darkM, toward: [0, 0, 1] });
        if (glowOn(c, .6)) { H.pips(b, c, { n: 6, x: 0, y: .3 + n * .5 - .1, z: w / 2 }); p.push('status pips'); }
        H.stencil(b, c, { text: H.code(c), x: -w / 4, y: .25, z: w / 2 + .002, size: .1 });
        p.push('stacked speaker tower on a hazard frame');
      } else {
        // aquarium column on a mosaic plinth, chrome caps, fish and weed
        const R = r.opt('girth', [.32, .42]);
        b.cyl(R + .08, R + .1, .35, tileM(k, 3, .8), 0, 0, 0, 32); b.cyl(R + .1, R + .1, .02, k.chromeM, 0, .35, 0, 32);
        const gm = M('#000', { emissive: k.water, emissiveIntensity: .55, transparent: true, opacity: .55, depthWrite: false });
        b.cyl(R - .01, R - .01, Hh - .55, gm, 0, .37, 0, 32);
        b.cyl(R, R, Hh - .55, H.glassM({ tint: '#bfeaf0', opacity: .22 }), 0, .37, 0, 40);
        b.cyl(R + .04, R + .04, .1, k.chromeM, 0, Hh - .18, 0, 32); b.cyl(R + .06, R + .06, .08, tileM(k, 3, .3), 0, Hh - .08, 0, 32);
        for (let i = 0; i < c.int(4, 7); i++) { const a = c.range(0, PI * 2), rr = c.range(.05, R * .7); fish(b, c, rr * cos(a), c.range(.6, Hh - .4), rr * sin(a), c.range(0, PI * 2)); }
        for (let i = 0; i < 4; i++) { const x = c.range(-R * .6, R * .6), z = c.range(-R * .6, R * .6), hh = c.range(.3, .8); const pts = []; for (let q = 0; q <= 6; q++) pts.push(V(x + sin(q * .9 + i) * .02, .4 + hh * q / 6, z)); b.tube(pts, .008, M(c.pick(['#3f9a5a', '#2f7a4a', '#7ab84a']), { roughness: .6 }), 12); }
        b.light(k.water, 0, Hh * .5, 0, 1.2, 4); p.push('aquarium column on a mosaic plinth');
      }
      b.mark();
      return { b, name: { A: 'Lantern tree', B: 'Porthole column', C: 'Speaker tower', D: 'Aquarium column' }[set], parts: p, role: 'Centerpiece', ...dims(b) };
    };
  }

  /* ---------------- registration: one category per kind, four sets per category ---------------- */
  const SETS = ['A', 'B', 'C', 'D'];
  const reg = (k, label, fn, nm) => ({ k, label, archs: Object.fromEntries(SETS.map(s => ['club_' + k + '_' + s, [nm[s], fn(s), { set: s }]])) });
  return {
    categories: [
      reg('cl_booths', 'Booths', booth, { A: 'Lounge booth', B: 'Orbital booth', C: 'Rave booth', D: 'Bathhouse booth' }),
      reg('cl_stools', 'Bar stools', stool, { A: 'Lounge stool', B: 'Tulip stool', C: 'Rave stool', D: 'Bathhouse stool' }),
      reg('cl_tables', 'High tables', cocktail, { A: 'Lounge high table', B: 'Orbital high table', C: 'Rave high table', D: 'Bathhouse high table' }),
      reg('cl_counters', 'Bar counters', counter, { A: 'Lounge counter', B: 'Orbital counter', C: 'Rave counter', D: 'Bathhouse counter' }),
      reg('cl_dj', 'DJ booths', dj, { A: 'Lounge DJ booth', B: 'Orbital DJ booth', C: 'Rave DJ booth', D: 'Bathhouse DJ booth' }),
      reg('cl_pendants', 'Pendants', pendant, { A: 'Lantern cluster', B: 'Dome pendant', C: 'Work-lamp bar', D: 'Globe tank pendant' }),
      reg('cl_signs', 'Neon signs', sign, { A: 'Lounge sign', B: 'Orbital sign', C: 'Rave sign', D: 'Bathhouse sign' }),
      reg('cl_center', 'Centerpieces', centerpiece, { A: 'Lantern tree', B: 'Porthole column', C: 'Speaker tower', D: 'Aquarium column' })
    ]
  };
}});
