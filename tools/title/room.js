// The title screen's room, built in 3D and lit for real, then baked to pictures (bake.html, bake.py).
// A lived-in flat on a bright morning, after the owner's interiors folder: the angle of a corner with the round window
// on the right and a wall of fixtures on the left; the contents of the porthole kitchen (a deep-sleeved round window
// wrapped in tubing, a glossy counter crowded with jars, a kettle, pots, fruit and plants, a utensil rail and a towel),
// mint cabinets and a rounded fridge, big sage floor tiles and a striped rug in the sunlight, pendant lamps and a grid
// panel light, flex ducts and conduits across the ceiling, and the NEON TERRARIUM sign on the wall as an art piece.
// Everything is made here from geometry and canvas textures (colour and bump drawn together): no pictures go in.
// Plan: project doc claude/title-screen-plan.md.
'use strict';
const ROOM = (() => {
  const R = {};
  const C = THREE;
  let seed = 11; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const rr = (a, b) => a + rnd()*(b - a), pick = a => a[Math.floor(rnd()*a.length)];
  // the room: back wall (the window's) at z = BACK, left wall at x = LEFT, floor y = 0, ceiling y = CEIL
  const BACK = -2, LEFT = -3.4, RIGHT = 3.2, CEIL = 3.05, FRONT = 5, WALL_T = .5;
  const WIN = { x: 1.25, y: 1.6, r: 1.28 };
  Object.assign(R, { WIN, BACK, WALL_T, LEFT, CEIL });
  const SIGN = { x: -1.72, y: 2.02, z: BACK + .07, w: 1.9, h: .74 };
  R.SIGN = SIGN;

  /* ---------- textures: colour and bump drawn from one recipe ---------- */
  function texSet(w, h, draw, rep){
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cc = mk(), hc = mk(), gc = cc.getContext('2d'), gh = hc.getContext('2d');
    gh.fillStyle = '#808080'; gh.fillRect(0, 0, w, h);
    draw(gc, gh, w, h);
    const wrap = (c, srgb) => { const t = new C.CanvasTexture(c); if (srgb) t.encoding = C.sRGBEncoding; t.anisotropy = 8; if (rep){ t.wrapS = t.wrapT = C.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
    return { map: wrap(cc, true), bump: wrap(hc, false) };
  }
  const specks = (g, w, h, n, cols, s0 = 1, s1 = 3) => { for (let i = 0; i < n; i++){ g.fillStyle = cols[i % cols.length]; const s = rr(s0, s1); g.fillRect(rnd()*w, rnd()*h, s, s); } };
  const scratches = (g, w, h, n, col) => { g.strokeStyle = col; for (let i = 0; i < n; i++){ g.lineWidth = rr(.5, 1.4); g.beginPath(); const x = rnd()*w, y = rnd()*h, a = rr(-.4, .4), l = rr(6, 40); g.moveTo(x, y); g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l); g.stroke(); } };
  const stains = (g, w, h, n, col) => { for (let i = 0; i < n; i++){ const x = rnd()*w, y = rnd()*h, r = rr(8, 46), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2*r, 2*r); } };
  // a seam: dark line in colour, a groove in the bump map
  const seam = (g, gh, x0, y0, x1, y1, lw = 2) => { g.strokeStyle = 'rgba(40,60,50,.55)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); gh.strokeStyle = '#303030'; gh.lineWidth = lw + 1; gh.beginPath(); gh.moveTo(x0, y0); gh.lineTo(x1, y1); gh.stroke(); };
  const rivet = (g, gh, x, y, r = 3) => { g.fillStyle = 'rgba(70,90,80,.8)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(240,250,240,.6)'; g.fillRect(x - r*.5, y - r*.6, r*.6, r*.5); gh.fillStyle = '#e0e0e0'; gh.beginPath(); gh.arc(x, y, r, 0, 7); gh.fill(); };
  const label = (g, x, y, w, h, bg, fg, lines) => { g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = fg; for (let i = 0; i < lines; i++) g.fillRect(x + 3, y + 3 + i*(h - 4)/lines, rr(w*.3, w - 6), Math.max(1, (h - 8)/lines*.5)); };
  // the walls: mint panels of a ship-like flat, scuffed and stickered, with a hatch and a grille
  const wall = texSet(1024, 768, (g, gh, w, h) => {
    g.fillStyle = '#93b5a1'; g.fillRect(0, 0, w, h);
    stains(g, w, h, 40, 'rgba(60,90,70,.10)'); stains(g, w, h, 30, 'rgba(255,250,225,.10)'); stains(g, w, h, 12, 'rgba(120,85,50,.08)');
    specks(g, w, h, 2600, ['rgba(50,80,65,.18)', 'rgba(255,255,240,.18)', 'rgba(110,80,50,.10)']);
    scratches(g, w, h, 120, 'rgba(235,245,235,.35)');
    const xs = [0, 210, 470, 600, 860, 1024], ys = [0, 300, 470, 768];
    for (const x of xs) seam(g, gh, x, 0, x, h, 3); for (const y of ys) seam(g, gh, 0, y, w, y, 3);
    seam(g, gh, 470, 300, 600, 300, 2);
    for (const x of xs) for (const y of ys) if (x > 0 && x < w && y > 0 && y < h){ rivet(g, gh, x - 10, y - 10); rivet(g, gh, x + 10, y + 10); }
    g.strokeStyle = 'rgba(40,60,50,.6)'; g.lineWidth = 2; g.strokeRect(640, 520, 180, 150); gh.strokeStyle = '#303030'; gh.lineWidth = 3; gh.strokeRect(640, 520, 180, 150);
    for (let i = 0; i < 9; i++){ g.fillStyle = 'rgba(30,45,38,.55)'; g.fillRect(250, 330 + i*12, 180, 5); gh.fillStyle = '#404040'; gh.fillRect(250, 330 + i*12, 180, 5); }
    label(g, 40, 330, 110, 26, '#e9e0c8', 'rgba(60,60,50,.6)', 3); label(g, 880, 60, 90, 40, '#d6573b', 'rgba(255,240,220,.8)', 2);
    label(g, 520, 60, 54, 54, '#f0d27a', 'rgba(60,50,30,.7)', 4); label(g, 690, 400, 70, 18, '#3f6f7a', 'rgba(220,240,240,.8)', 1);
    g.fillStyle = 'rgba(200,80,50,.75)'; g.fillRect(14, 14, 40, 8); g.fillRect(14, 26, 24, 8);
  }, [1, 1]);
  const ceilT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#7d766a'; g.fillRect(0, 0, w, h); specks(g, w, h, 900, ['rgba(40,35,30,.25)', 'rgba(255,250,235,.12)']); stains(g, w, h, 20, 'rgba(40,30,20,.15)');
    for (const v of [0, 256]){ seam(g, gh, v, 0, v, h, 3); seam(g, gh, 0, v, w, v, 3); }
    for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236], [276, 276], [492, 492], [276, 492], [492, 276]]) rivet(g, gh, x, y);
  }, [1, 1]);
  // the floor: big sage stone tiles of mixed sizes, grout, wear where people walk
  const floorT = texSet(1024, 1024, (g, gh, w, h) => {
    g.fillStyle = '#6f6a5c'; g.fillRect(0, 0, w, h);
    const tiles = []; for (let y = 0; y < h; y += 128){ let x = (y/128) % 2 ? -64 : 0; while (x < w){ const tw = pick([128, 192, 256, 256, 320]); tiles.push([x, y, tw, 128]); x += tw; } }
    for (const [x, y, tw, th] of tiles){
      g.fillStyle = pick(['#cfc6ae', '#c5bea8', '#d6cdb5', '#bdb8a2', '#b9c2b0', '#c9c0a6']); g.fillRect(x + 3, y + 3, tw - 6, th - 6);
      const gr = g.createLinearGradient(x, y, x + tw, y + th); gr.addColorStop(0, 'rgba(255,255,245,.10)'); gr.addColorStop(1, 'rgba(30,50,40,.10)'); g.fillStyle = gr; g.fillRect(x + 3, y + 3, tw - 6, th - 6);
      gh.fillStyle = '#909090'; gh.fillRect(x + 3, y + 3, tw - 6, th - 6);
      if (rnd() < .2){ g.strokeStyle = 'rgba(40,55,45,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + rr(10, tw - 10), y + 4); g.lineTo(x + rr(10, tw - 10), y + th - 4); g.stroke(); }
    }
    specks(g, w, h, 6000, ['rgba(40,55,45,.22)', 'rgba(255,255,245,.25)', 'rgba(120,100,70,.12)'], 1, 2.5);
    stains(g, w, h, 30, 'rgba(70,60,40,.10)'); scratches(g, w, h, 160, 'rgba(240,245,235,.25)');
  }, [2.2, 2.2]);
  const stoneT = texSet(512, 256, (g, gh, w, h) => {
    g.fillStyle = '#ece5d6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++){ g.strokeStyle = i % 3 ? 'rgba(150,140,120,.25)' : 'rgba(110,120,110,.35)'; g.lineWidth = rr(.6, 2); g.beginPath(); let x = rnd()*w, y = rnd()*h; g.moveTo(x, y); for (let k = 0; k < 6; k++){ x += rr(10, 60); y += rr(-14, 14); g.lineTo(x, y); } g.stroke(); }
    specks(g, w, h, 900, ['rgba(120,110,90,.25)', 'rgba(255,255,255,.4)'], .6, 1.6);
  }, [2, 1]);
  const woodT = texSet(512, 256, (g, gh, w, h) => {
    g.fillStyle = '#93582f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++){ const y = rnd()*h; g.strokeStyle = i % 2 ? 'rgba(60,32,15,.35)' : 'rgba(210,150,95,.22)'; g.lineWidth = rr(.6, 2.4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w*.3, y + rr(-6, 6), w*.6, y + rr(-6, 6), w, y + rr(-5, 5)); g.stroke(); }
    for (let x = 0; x < w; x += 128){ g.fillStyle = 'rgba(40,20,10,.5)'; g.fillRect(x, 0, 2, h); gh.fillStyle = '#404040'; gh.fillRect(x, 0, 2, h); }
  }, [1, 1]);
  const enamelT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#7fb59c'; g.fillRect(0, 0, w, h); stains(g, w, h, 20, 'rgba(255,255,240,.12)'); stains(g, w, h, 14, 'rgba(50,80,60,.12)');
    specks(g, w, h, 500, ['rgba(60,70,60,.4)', 'rgba(250,250,240,.3)'], .8, 2.2); scratches(g, w, h, 40, 'rgba(240,250,240,.4)');
    for (let i = 0; i < 6; i++){ const x = rnd()*w, y = rnd()*h; g.fillStyle = 'rgba(200,120,70,.7)'; g.fillRect(x, y, rr(2, 6), rr(2, 5)); }
  }, [1, 1]);
  const creamT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#e8dfc8'; g.fillRect(0, 0, w, h); stains(g, w, h, 26, 'rgba(150,120,80,.12)'); specks(g, w, h, 700, ['rgba(120,100,70,.35)', 'rgba(255,255,250,.4)'], .8, 2.5);
    scratches(g, w, h, 50, 'rgba(160,140,110,.35)');
    for (let i = 0; i < 30; i++){ const x = rnd()*w, y = rnd()*h; g.fillStyle = 'rgba(110,80,50,.55)'; g.beginPath(); g.arc(x, y, rr(1, 3), 0, 7); g.fill(); }
    for (let k = 0; k < 8; k++){ const a = k/8*w; seam(g, gh, a, 0, a, h, 2); }
  }, [1, 1]);
  const rugT = texSet(512, 512, (g, gh, w, h) => {
    const cols = ['#e9c58a', '#c7743c', '#f2dfb6', '#b55a2c', '#e9c58a', '#8e3f22'];
    for (let x = 0, k = 0; x < w; k++){ const sw = pick([18, 26, 40, 12]); g.fillStyle = cols[k % cols.length]; g.fillRect(x, 0, sw, h); x += sw; }
    for (let y = 0; y < h; y += 3){ g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, y, w, 1); gh.fillStyle = '#707070'; gh.fillRect(0, y, w, 1); }
    specks(g, w, h, 2000, ['rgba(60,30,10,.18)', 'rgba(255,240,210,.2)'], 1, 2);
  });
  const metalT = texSet(256, 256, (g, gh, w, h) => { g.fillStyle = '#b9bdb6'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++){ g.fillStyle = y % 3 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(0, y, w, 1); } specks(g, w, h, 300, ['rgba(60,50,40,.3)', 'rgba(140,100,60,.25)']); }, [2, 2]);
  const panelT = texSet(512, 256, (g, gh, w, h) => {
    g.fillStyle = '#d8d0ba'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8b8370'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    for (let i = 0; i < 8; i++){ g.fillStyle = '#3d3d38'; g.fillRect(20 + i*58, 34, 30, 54); gh.fillStyle = '#c0c0c0'; gh.fillRect(20 + i*58, 34, 30, 54); g.fillStyle = pick(['#ff8a4a', '#9ad8c0', '#ffe08a', '#e9e9e0']); g.fillRect(26 + i*58, 100, 16, 9); }
    for (let i = 0; i < 4; i++){ g.fillStyle = '#efe9da'; g.beginPath(); g.arc(60 + i*110, 175, 30, 0, 7); g.fill(); g.strokeStyle = '#555'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.moveTo(60 + i*110, 175); g.lineTo(60 + i*110 + Math.cos(i)*22, 175 - Math.sin(i + 1)*22); g.stroke(); }
    label(g, 20, 222, 200, 18, '#3a6b5c', 'rgba(230,240,230,.8)', 1); label(g, 300, 222, 120, 18, '#c94f3b', 'rgba(255,240,230,.8)', 1);
  });
  const screenT = texSet(256, 160, (g, gh, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d6e74'); gr.addColorStop(1, '#58b8a6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,255,240,.7)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < w; x += 8) g.lineTo(x, h*.6 + Math.sin(x/16)*18 + rr(-4, 4)); g.stroke(); g.fillStyle = 'rgba(230,255,240,.8)'; g.fillRect(12, 12, 60, 6); g.fillRect(12, 24, 40, 6); });
  const posterT = texSet(256, 360, (g, gh, w, h) => { g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(w/2, h*.42, w*.34, 0, 7); g.fill(); g.fillStyle = '#d0573a'; g.fillRect(w*.44, h*.25, w*.12, h*.45); g.fillStyle = '#3f6f7a'; g.fillRect(w*.3, h*.72, w*.4, h*.06); g.fillStyle = '#2f3a36'; g.fillRect(w*.15, h*.86, w*.7, 6); g.fillRect(w*.15, h*.9, w*.45, 4); });
  const towelT = texSet(64, 128, (g, gh, w, h) => { g.fillStyle = '#e8a33a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4){ g.fillStyle = 'rgba(120,60,10,.15)'; g.fillRect(0, y, w, 1); } g.fillStyle = '#c3751f'; g.fillRect(0, h - 14, w, 4); });
  const ventT = texSet(256, 192, (g, gh, w, h) => { g.fillStyle = '#6c8f7e'; g.fillRect(0, 0, w, h); for (let y = 14; y < h - 10; y += 10){ g.fillStyle = '#25352e'; g.fillRect(14, y, w - 28, 5); g.fillStyle = '#b4d3c3'; g.fillRect(14, y + 5, w - 28, 1); gh.fillStyle = '#202020'; gh.fillRect(14, y, w - 28, 5); } g.strokeStyle = '#a7c7b6'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); });
  const signTex = (on) => { const c = document.createElement('canvas'); c.width = 1024; c.height = 400; const g = c.getContext('2d');
    g.font = '150px Silkscreen, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const tube = (txt, y, core, mid, glow, dead) => {
      if (on){ g.save(); g.shadowColor = glow; g.shadowBlur = 40; g.strokeStyle = mid; g.lineWidth = 16; g.strokeText(txt, 512, y); g.restore(); }
      g.strokeStyle = on ? mid : dead; g.lineWidth = 9; g.strokeText(txt, 512, y); g.strokeStyle = on ? core : 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.strokeText(txt, 512, y); };
    tube('NEON', 118, '#fff0f8', '#ff4fa3', '#ff2f96', '#6a3a52');
    g.font = '118px Silkscreen, monospace'; tube('TERRARIUM', 290, '#eafff0', '#2bdc6c', '#10b04c', '#2f5a3e');
    const t = new C.CanvasTexture(c); t.encoding = C.sRGBEncoding; return t; };

  /* ---------- materials ---------- */
  const std = o => new C.MeshStandardMaterial(Object.assign({ roughness: .78, metalness: .04 }, o));
  const withBump = (set, o, k = .012) => std(Object.assign({ map: set.map, bumpMap: set.bump, bumpScale: k }, o));
  const M = {
    wall: withBump(wall, { roughness: .82 }, .02), ceil: withBump(ceilT, { roughness: .9 }, .02), floor: withBump(floorT, { roughness: .5, metalness: .05 }, .015),
    stone: withBump(stoneT, { roughness: .12, metalness: .05 }, .002), wood: withBump(woodT, { roughness: .5 }), enamel: withBump(enamelT, { roughness: .32, metalness: .1 }, .006),
    cream: withBump(creamT, { roughness: .42, metalness: .25 }, .01), creamPlain: std({ color: 0xe6ddc6, roughness: .45, metalness: .25 }), rug: withBump(rugT, { roughness: .95 }, .02),
    steel: withBump(metalT, { roughness: .28, metalness: .85 }, .002), chrome: std({ color: 0xdedcd4, roughness: .12, metalness: 1 }),
    copper: std({ color: 0xc0784a, roughness: .3, metalness: .9 }), dark: std({ color: 0x2b302d, roughness: .6, metalness: .35 }), rubber: std({ color: 0x3a3e3a, roughness: .85 }),
    flex: std({ color: 0x9a9c92, roughness: .5, metalness: .55 }), flexDark: std({ color: 0x4d524e, roughness: .6, metalness: .4 }),
    glass: std({ color: 0xe8f2ee, roughness: .05, metalness: .1, transparent: true, opacity: .4 }), ceramic: std({ color: 0xf1ece0, roughness: .2, metalness: .02 }),
    pot: std({ color: 0xb8643b, roughness: .85 }), soil: std({ color: 0x3a2a1e, roughness: 1 }), basket: std({ color: 0xb08850, roughness: .95 }),
    panel: withBump(panelT, { roughness: .4 }), screen: std({ map: screenT.map, emissive: 0xffffff, emissiveMap: screenT.map, emissiveIntensity: .7, roughness: .2 }),
    poster: std({ map: posterT.map, roughness: .9 }), towel: std({ map: towelT.map, roughness: .95, side: C.DoubleSide }), vent: withBump(ventT, { roughness: .6 }),
    lampShade: std({ color: 0xd9822f, roughness: .4, metalness: .5, side: C.DoubleSide }), lampGlow: new C.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }),
    leafs: [0x3f7f45, 0x4f9a52, 0x2f6b3a, 0x6aaa5a, 0x5c8f4a, 0x7cb35e].map(c => std({ color: c, roughness: .55, side: C.DoubleSide })),
    fruit: [0xf08a24, 0xf2b233, 0xd8432a, 0xe8c547, 0x9fbf3a].map(c => std({ color: c, roughness: .4 })),
  };
  R.M = M;

  /* ---------- geometry helpers ---------- */
  let scene = null;
  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new C.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.s) m.scale.setScalar(o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true; scene.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, o) => add(new C.BoxGeometry(w, h, d), mat, x, y, z, o);
  const cyl = (r0, r1, h, mat, x, y, z, o = {}) => add(new C.CylinderGeometry(r0, r1, h, o.seg || 20), mat, x, y, z, o);
  function rbox(w, h, d, r){
    const s = new C.Shape(), x = -w/2 + r, y = -h/2 + r, ww = w - 2*r, hh = h - 2*r;
    s.absarc(x, y, r, Math.PI, 1.5*Math.PI); s.absarc(x + ww, y, r, 1.5*Math.PI, 2*Math.PI); s.absarc(x + ww, y + hh, r, 0, .5*Math.PI); s.absarc(x, y + hh, r, .5*Math.PI, Math.PI);
    const g = new C.ExtrudeGeometry(s, { depth: Math.max(.001, d - 2*r), bevelEnabled: true, bevelThickness: r, bevelSize: r*.98, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, 0, -(d - 2*r)/2); return g;
  }
  const lathe = (pts, mat, x, y, z, o = {}) => add(new C.LatheGeometry(pts.map(([a, b]) => new C.Vector2(a, b)), o.seg || 28), mat, x, y, z, o);
  function pipe(pts, r, mat, clamps = 0){
    const curve = new C.CatmullRomCurve3(pts.map(p => new C.Vector3(...p)), false, 'catmullrom', .08);
    add(new C.TubeGeometry(curve, Math.max(24, pts.length*16), r, 10, false), mat, 0, 0, 0);
    for (let i = 1; i <= clamps; i++){ const t = i/(clamps + 1), p = curve.getPoint(t), tg = curve.getTangent(t); const m = add(new C.CylinderGeometry(r*1.5, r*1.5, r*1.6, 12), M.dark, p.x, p.y, p.z); m.quaternion.setFromUnitVectors(new C.Vector3(0, 1, 0), tg); }
    return curve;
  }
  // a flexible duct: a tube with ribs every few centimetres
  function flexDuct(pts, r, mat){
    const curve = new C.CatmullRomCurve3(pts.map(p => new C.Vector3(...p)));
    add(new C.TubeGeometry(curve, 80, r*.92, 14, false), M.flexDark, 0, 0, 0);
    const len = curve.getLength(), n = Math.floor(len/.045);
    for (let i = 0; i <= n; i++){ const t = i/n, p = curve.getPoint(t), tg = curve.getTangent(t); const m = add(new C.TorusGeometry(r, r*.13, 6, 16), mat, p.x, p.y, p.z, { cast: i % 3 === 0 }); m.quaternion.setFromUnitVectors(new C.Vector3(0, 0, 1), tg); }
  }
  function leafGeo(len, wid){
    const s = new C.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(wid, len*.35, 0, len); s.quadraticCurveTo(-wid, len*.35, 0, 0);
    const g = new C.ShapeGeometry(s, 5); const p = g.attributes.position; for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i); p.setZ(i, -Math.abs(x)*.5 + Math.sin(y/len*Math.PI)*len*.08); } g.computeVertexNormals(); return g;
  }
  const LEAF = [leafGeo(.16, .07), leafGeo(.24, .1), leafGeo(.1, .05), leafGeo(.32, .09)];
  function pot(x, y, z, s, mat){
    lathe([[0, 0], [.13*s, 0], [.15*s, .02*s], [.17*s, .22*s], [.19*s, .24*s], [.19*s, .28*s], [.165*s, .28*s]], mat, x, y, z);
    cyl(.165*s, .165*s, .01, M.soil, x, y + .27*s, z, { cast: false });
  }
  // a plant: stems from the pot with leaves along them; kinds: bush, tall (upright fronds), trail (hanging vines), herb
  function plant(x, y, z, s, kind, potMat){
    if (potMat !== null) pot(x, y, z, s, potMat || M.pot);
    const top = y + .27*s, stems = kind === 'tall' ? 9 : kind === 'trail' ? 7 : kind === 'herb' ? 14 : 11;
    for (let k = 0; k < stems; k++){
      const a = rnd()*Math.PI*2, lean = kind === 'tall' ? rr(.05, .35) : kind === 'trail' ? rr(.6, 1.2) : rr(.2, .7);
      const len = (kind === 'tall' ? rr(.6, 1.2) : kind === 'trail' ? rr(.6, 1.4) : kind === 'herb' ? rr(.15, .3) : rr(.25, .55))*s;
      const pts = []; for (let i = 0; i <= 6; i++){ const t = i/6; const dx = Math.cos(a)*lean*t*len, dz = Math.sin(a)*lean*t*len;
        const dy = kind === 'trail' ? (t < .25 ? t*.4*len : .1*len - (t - .25)*len*1.1) : t*len*(1 - lean*.3*t); pts.push(new C.Vector3(x + dx, top + dy, z + dz)); }
      const curve = new C.CatmullRomCurve3(pts); add(new C.TubeGeometry(curve, 12, .006*s, 4), M.leafs[2], 0, 0, 0, { cast: false });
      const nl = kind === 'trail' ? 9 : kind === 'tall' ? 5 : 4;
      for (let i = 1; i <= nl; i++){ const t = kind === 'tall' ? .45 + i/nl*.55 : i/nl; const p = curve.getPoint(t);
        const lf = add(LEAF[kind === 'tall' ? 3 : kind === 'herb' ? 2 : pick([0, 1, 0])], pick(M.leafs), p.x, p.y, p.z, { s: s*(kind === 'herb' ? .7 : 1)*rr(.8, 1.25) });
        lf.rotation.set(rr(-1.2, .4) - (kind === 'trail' ? 1.2 : 0), a + rr(-1.2, 1.2), rr(-.8, .8)); }
    }
  }
  function bolts(cx, cy, z, r, n, size = .018){ for (let k = 0; k < n; k++){ const a = k/n*Math.PI*2; cyl(size, size, .025, M.steel, cx + Math.cos(a)*r, cy + Math.sin(a)*r, z, { rx: Math.PI/2, cast: false, seg: 8 }); } }
  function jar(x, y, z, h, r, fill){ lathe([[0, 0], [r, 0], [r, h*.85], [r*.8, h*.92], [r*.8, h]], M.glass, x, y, z, { cast: false }); if (fill) cyl(r*.9, r*.9, h*.6, fill, x, y + h*.3, z, { cast: false }); cyl(r*.82, r*.82, .02, M.steel, x, y + h + .01, z); }
  function bowlOfFruit(x, y, z, r){ lathe([[0, 0], [r*.5, 0], [r, r*.45], [r*1.02, r*.48]], M.ceramic, x, y, z); for (let i = 0; i < 7; i++){ const a = rnd()*7, d = rnd()*r*.6; add(new C.SphereGeometry(rr(.03, .045), 12, 10), pick(M.fruit), x + Math.cos(a)*d, y + r*.4 + rr(0, .04), z + Math.sin(a)*d); } }
  function plate(x, y, z, r){ lathe([[0, 0], [r*.7, 0], [r, r*.12], [r*1.02, r*.13]], M.ceramic, x, y, z, { cast: false }); }
  function kettle(x, y, z){
    lathe([[0, 0], [.1, 0], [.12, .04], [.12, .14], [.09, .2], [.03, .22], [.03, .24]], M.chrome, x, y, z);
    add(new C.CylinderGeometry(.012, .022, .14, 10), M.chrome, x + .14, y + .12, z, { rz: -.9 });
    pipe([[x - .06, y + .2, z], [x, y + .3, z], [x + .07, y + .2, z]], .01, M.dark);
  }
  function ladle(x, y, z, len){ cyl(.005, .005, len, M.chrome, x, y - len/2, z, { seg: 6 }); add(new C.SphereGeometry(.03, 12, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2), M.chrome, x, y - len, z); }
  function pendant(x, z, drop, r = .14){
    cyl(.004, .004, drop, M.dark, x, CEIL - drop/2, z, { cast: false, seg: 4 });
    const y = CEIL - drop; lathe([[.02, .02], [r*.4, 0], [r*.9, -r*.55], [r, -r*.6]], M.lampShade, x, y, z);
    add(new C.SphereGeometry(r*.35, 14, 10), M.lampGlow, x, y - r*.35, z, { cast: false });
    const l = new C.PointLight(0xffb060, .55, 2.6, 2); l.position.set(x, y - r*.6, z); scene.add(l);
  }

  /* ---------- the room ---------- */
  R.build = sc => {
    scene = sc; seed = 11;
    const W = WIN;
    // the shell outside the room (so the sun only comes in by the window)
    box(9, .3, 9, M.dark, (LEFT + RIGHT)/2, CEIL + .17, 1.5); box(.3, 4, 9, M.dark, LEFT - .17, 1.5, 1.5); box(.3, 4, 9, M.dark, RIGHT + .17, 1.5, 1.5);
    // the back wall with the porthole cut through
    const ws = new C.Shape(); ws.moveTo(LEFT, 0); ws.lineTo(RIGHT, 0); ws.lineTo(RIGHT, CEIL); ws.lineTo(LEFT, CEIL); ws.lineTo(LEFT, 0);
    const hole = new C.Path(); hole.absarc(W.x, W.y, W.r + .02, 0, Math.PI*2, true); ws.holes.push(hole);
    const wg = new C.ExtrudeGeometry(ws, { depth: WALL_T, bevelEnabled: false, curveSegments: 72 });
    { const uv = wg.attributes.uv, p = wg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i)/2.4, p.getY(i)/1.8); }
    add(wg, M.wall, 0, 0, BACK - WALL_T);
    // floor, ceiling, side walls, skirting
    const fg = new C.PlaneGeometry(RIGHT - LEFT, FRONT - BACK); fg.rotateX(-Math.PI/2); add(fg, M.floor, (LEFT + RIGHT)/2, 0, (BACK + FRONT)/2, { cast: false });
    const cg = new C.PlaneGeometry(RIGHT - LEFT, FRONT - BACK); { const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*(RIGHT - LEFT)/1.6, uv.getY(i)*(FRONT - BACK)/1.6); } cg.rotateX(Math.PI/2); add(cg, M.ceil, (LEFT + RIGHT)/2, CEIL, (BACK + FRONT)/2);
    const lw = new C.PlaneGeometry(FRONT - BACK, CEIL); { const uv = lw.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*(FRONT - BACK)/2.4, uv.getY(i)*CEIL/1.8); } lw.rotateY(Math.PI/2); add(lw, M.wall, LEFT, CEIL/2, (BACK + FRONT)/2);
    const rw = lw.clone(); rw.rotateY(Math.PI); add(rw, M.wall, RIGHT, CEIL/2, (BACK + FRONT)/2);
    box(RIGHT - LEFT, .12, .05, M.dark, (LEFT + RIGHT)/2, .06, BACK + .025, { cast: false }); box(.05, .12, FRONT - BACK, M.dark, LEFT + .025, .06, (BACK + FRONT)/2, { cast: false });

    /* --- the porthole: a deep sleeve of cream plates, a chunky ring, tubing round it, the glass's frame --- */
    { const sl = new C.CylinderGeometry(W.r, W.r, WALL_T, 72, 1, true); sl.rotateX(Math.PI/2); add(sl, std({ map: creamT.map, bumpMap: creamT.bump, bumpScale: .01, roughness: .4, metalness: .3, side: C.BackSide }), W.x, W.y, BACK - WALL_T/2); }
    for (let k = 0; k < 20; k++){ const a = k/20*Math.PI*2; const rib = box(.035, .025, WALL_T*.96, M.creamPlain, W.x + Math.cos(a)*(W.r - .015), W.y + Math.sin(a)*(W.r - .015), BACK - WALL_T/2); rib.rotation.z = a;
      if (k % 4 === 1){ const lt = box(.05, .012, .18, M.lampGlow, W.x + Math.cos(a)*(W.r - .03), W.y + Math.sin(a)*(W.r - .03), BACK - WALL_T*.55, { cast: false }); lt.rotation.z = a; } }
    add(new C.TorusGeometry(W.r + .09, .16, 22, 128), M.cream, W.x, W.y, BACK + .04);
    add(new C.TorusGeometry(W.r + .02, .045, 12, 128), M.chrome, W.x, W.y, BACK + .14, { cast: false });
    add(new C.RingGeometry(W.r + .22, W.r + .5, 128), M.creamPlain, W.x, W.y, BACK + .006, { cast: false });
    bolts(W.x, W.y, BACK + .02, W.r + .4, 32);
    for (let k = 0; k < 12; k++){ const a = k/12*Math.PI*2 + .13; const b = box(.12, .07, .1, M.creamPlain, W.x + Math.cos(a)*(W.r + .3), W.y + Math.sin(a)*(W.r + .3), BACK + .1); b.rotation.z = a; }
    add(new C.TorusGeometry(W.r - .04, .055, 12, 128), M.creamPlain, W.x, W.y, BACK - WALL_T + .05);
    box(.08, W.r*2 - .1, .07, M.creamPlain, W.x + .38, W.y, BACK - WALL_T + .07);
    box(.05, .3, .08, M.chrome, W.x + .38, W.y - .15, BACK - WALL_T + .13); cyl(.04, .04, .05, M.dark, W.x + .38, W.y + .25, BACK - WALL_T + .13, { rx: Math.PI/2 });
    // tubing wrapped round the ring, clamped to it; a copper line outside that; a flex run up to the ceiling
    { const pts = []; for (let k = 0; k <= 40; k++){ const a = Math.PI*.15 + k/40*Math.PI*1.25; pts.push([W.x + Math.cos(a)*(W.r + .62), W.y + Math.sin(a)*(W.r + .62), BACK + .16]); } pipe(pts, .055, M.flex, 6); }
    { const pts = []; for (let k = 0; k <= 30; k++){ const a = Math.PI*.55 + k/30*Math.PI*.95; pts.push([W.x + Math.cos(a)*(W.r + .74), W.y + Math.sin(a)*(W.r + .74), BACK + .1]); } pipe(pts, .03, M.copper, 4); }
    pipe([[W.x + W.r + .55, W.y + .4, BACK + .16], [W.x + W.r + .7, W.y + 1.0, BACK + .3], [W.x + W.r + .7, CEIL - .1, BACK + .5]], .055, M.flex, 2);
    // cable bundles and junction boxes above the window
    for (let i = 0; i < 5; i++){ const x0 = W.x - .9 + i*.12; pipe([[x0, CEIL, BACK + .3 + i*.03], [x0 + .05, W.y + W.r + .55, BACK + .12], [x0 + .2, W.y + W.r + .42, BACK + .08]], .012 + (i % 2)*.006, i % 3 ? M.rubber : M.copper); }
    box(.34, .26, .12, M.creamPlain, W.x - .55, W.y + W.r + .68, BACK + .07); box(.22, .16, .02, M.panel, W.x - .55, W.y + W.r + .68, BACK + .135, { cast: false });
    box(.2, .3, .1, M.dark, W.x + .75, W.y + W.r + .72, BACK + .06);
    // the glass: depth only (the city shows through in the game), so the haze stops at it
    const glass = new C.Mesh(new C.CircleGeometry(W.r, 72), new C.MeshBasicMaterial({ colorWrite: false })); glass.position.set(W.x, W.y, BACK - WALL_T + .04); scene.add(glass);

    /* --- the window bench, crowded with plants --- */
    box(2.5, .08, .58, M.wood, W.x, .78, BACK + .26); box(2.4, .74, .52, M.cream, W.x, .37, BACK + .26);
    for (let i = 0; i < 4; i++) box(.5, .3, .01, M.creamPlain, W.x - .9 + i*.6, .45, BACK + .525, { cast: false });
    plant(W.x - .9, .82, BACK + .25, 1.1, 'bush'); plant(W.x - .45, .82, BACK + .3, .7, 'herb', M.basket); plant(W.x + .05, .82, BACK + .2, .9, 'trail');
    plant(W.x + .55, .82, BACK + .3, .75, 'herb'); plant(W.x + .95, .82, BACK + .22, 1.25, 'tall'); jar(W.x - .2, .82, BACK + .42, .16, .05, M.fruit[1]);
    cyl(.07, .06, .12, M.copper, W.x + .3, .88, BACK + .42); add(new C.SphereGeometry(.03, 10, 8), M.fruit[0], W.x - .65, .85, BACK + .45);

    /* --- the kitchen run along the back wall, left of the window --- */
    const K0 = LEFT + .05, K1 = W.x - W.r - .55, KW = K1 - K0, KX = (K0 + K1)/2;
    box(KW, .1, .58, M.dark, KX, .05, BACK + .27, { cast: false });
    const units = Math.round(KW/.6);
    for (let i = 0; i < units; i++){ const x = K0 + (i + .5)*KW/units, w = KW/units - .02;
      add(rbox(w, .76, .6, .015), M.enamel, x, .48, BACK + .3);
      if (i === 1){ box(w*.86, .4, .02, M.dark, x, .5, BACK + .61); box(w*.8, .3, .01, std({ color: 0x1b1f1d, roughness: .1, metalness: .4 }), x, .5, BACK + .62, { cast: false }); box(w*.6, .025, .03, M.chrome, x, .74, BACK + .64); for (let k = 0; k < 5; k++) cyl(.022, .022, .03, M.chrome, x - w*.36 + k*w*.18, .8, BACK + .62, { rx: Math.PI/2, seg: 12 }); }
      else { box(w*.86, .005, .005, M.dark, x, .66, BACK + .605, { cast: false }); box(w*.5, .02, .03, M.chrome, x, .76, BACK + .625); box(.02, .14, .03, M.chrome, x + w*.32, .45, BACK + .625); if (i % 2) box(w*.3, .1, .005, std({ color: 0xe8dcc0 }), x - w*.2, .4, BACK + .603, { cast: false }); }
    }
    add(rbox(KW + .04, .05, .64, .02), M.stone, KX, .885, BACK + .31);
    box(KW, .55, .02, std({ color: 0x2f3a36, roughness: .35, metalness: .2 }), KX, 1.18, BACK + .012, { cast: false });
    for (let y = .93; y < 1.45; y += .07) box(KW, .004, .006, M.dark, KX, y, BACK + .024, { cast: false });
    cyl(.012, .012, KW*.8, M.chrome, KX, 1.32, BACK + .08, { rz: Math.PI/2 });
    for (let i = 0; i < 9; i++){ const x = K0 + .25 + i*(KW*.8 - .1)/9; ladle(x, 1.31, BACK + .09, rr(.14, .26)); }
    { const tw = new C.PlaneGeometry(.22, .36, 4, 8); const p = tw.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i)*9)*.012 + Math.abs(p.getX(i))*.08); tw.computeVertexNormals(); add(tw, M.towel, K0 + KW*.62, 1.15, BACK + .1); }
    box(KW*.7, .03, .22, M.wood, KX - KW*.1, 1.58, BACK + .11); for (let k = 0; k < 2; k++) box(.02, .12, .18, M.dark, KX - KW*.1 - KW*.3 + k*KW*.6, 1.52, BACK + .1);
    for (let i = 0; i < 8; i++) jar(K0 + .25 + i*KW*.085, 1.595, BACK + .11, rr(.1, .18), rr(.035, .05), pick([M.fruit[1], M.basket, M.soil, M.fruit[0], null, M.leafs[3]]));
    const cy0 = .91;
    kettle(K0 + .45, cy0, BACK + .3); jar(K0 + .78, cy0, BACK + .2, .3, .09, M.basket); jar(K0 + .98, cy0, BACK + .18, .22, .07, M.fruit[0]);
    bowlOfFruit(KX + .1, cy0, BACK + .38, .13); plate(KX - .25, cy0, BACK + .45, .12); plate(KX - .24, cy0 + .015, BACK + .45, .11);
    for (let i = 0; i < 3; i++){ lathe([[0, 0], [.03, 0], [.03, .18], [.012, .24], [.012, .28]], std({ color: pick([0x3f6f7a, 0xc94f3b, 0xe0c27a]), roughness: .15, transparent: true, opacity: .85 }), K1 - .5 + i*.07, cy0, BACK + .16); }
    plant(K1 - .25, cy0, BACK + .3, .65, 'herb'); cyl(.06, .05, .1, M.dark, KX + .45, cy0 + .05, BACK + .2); box(.3, .02, .2, M.wood, KX + .45, cy0 + .01, BACK + .4, { ry: .2 });
    add(rbox(.32, .18, .14, .03), M.creamPlain, K0 + .3, 1.69, BACK + .12); cyl(.03, .03, .02, M.dark, K0 + .22, 1.7, BACK + .2, { rx: Math.PI/2 });
    // the sign, a neon art piece on the wall above the counter: a backing board, standoffs, the tubes, a cable down
    box(SIGN.w + .14, SIGN.h + .14, .04, std({ color: 0x1b1d1f, roughness: .5, metalness: .4 }), SIGN.x, SIGN.y, BACK + .03);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(.018, .018, .05, M.chrome, SIGN.x + dx*(SIGN.w/2 + .02), SIGN.y + dy*(SIGN.h/2 + .02), BACK + .07, { rx: Math.PI/2, seg: 10 });
    const signMat = new C.MeshBasicMaterial({ map: signTex(true), transparent: true, toneMapped: false });
    const sign = new C.Mesh(new C.PlaneGeometry(SIGN.w, SIGN.h), signMat); sign.position.set(SIGN.x, SIGN.y, SIGN.z); scene.add(sign);
    R.signMesh = sign; R.signOn = signMat.map; R.signOff = signTex(false);
    pipe([[SIGN.x + SIGN.w/2 - .1, SIGN.y - SIGN.h/2, BACK + .05], [SIGN.x + SIGN.w/2, SIGN.y - SIGN.h/2 - .15, BACK + .04], [SIGN.x + SIGN.w/2 + .1, 1.62, BACK + .03]], .008, M.rubber);
    R.signLights = [];
    for (const [c, y] of [[0xff4fa3, SIGN.y + .18], [0x2bdc6c, SIGN.y - .18]]){ const l = new C.PointLight(c, 1.2, 2.4, 2); l.position.set(SIGN.x, y, BACK + .45); scene.add(l); R.signLights.push(l); }

    /* --- the left wall: the fridge in the corner, then a wall of fixtures --- */
    const FZ = BACK + .45;
    add(rbox(.7, 1.85, .7, .12), M.enamel, LEFT + .38, .95, FZ); box(.66, .01, .66, M.dark, LEFT + .38, 1.2, FZ, { cast: false });
    box(.03, .5, .04, M.chrome, LEFT + .75, 1.5, FZ + .25); box(.03, .3, .04, M.chrome, LEFT + .75, .9, FZ + .25);
    box(.01, .3, .24, std({ color: 0xece4cf }), LEFT + .735, 1.55, FZ - .05, { cast: false }); box(.01, .2, .16, std({ color: 0xf0d27a }), LEFT + .735, 1.3, FZ - .15, { cast: false });
    for (let k = 0; k < 4; k++) box(.006, .006, .2, M.dark, LEFT + .735, .25 + k*.02, FZ, { cast: false });
    plant(LEFT + .38, 1.9, FZ, .8, 'trail');
    const LZ = (z, y, w, h, mat, d = .06) => box(d, h, w, mat, LEFT + d/2, y, z);
    LZ(.35, 1.55, .9, .55, M.panel, .05); LZ(.35, 1.55, .96, .61, M.dark, .03);
    LZ(-.45, 2.15, .55, .34, M.screen, .045); LZ(-.45, 2.15, .62, .4, M.creamPlain, .03);
    for (let i = 0; i < 3; i++){ const z = .95 + i*.2; cyl(.07, .07, .04, M.creamPlain, LEFT + .03, 2.25, z, { rz: Math.PI/2 }); cyl(.055, .055, .045, M.ceramic, LEFT + .035, 2.25, z, { rz: Math.PI/2, cast: false }); }
    for (let i = 0; i < 4; i++) pipe([[LEFT + .07 + i*.03, .12, -.2 + i*.08], [LEFT + .07 + i*.03, 1.2, -.2 + i*.08], [LEFT + .08 + i*.03, 1.26, .0 + i*.08], [LEFT + .08 + i*.03, 2.5, .0 + i*.08], [LEFT + .1, CEIL - .05, .05 + i*.08]], .02 + (i % 2)*.008, i === 1 ? M.copper : M.steel, 2);
    LZ(1.0, .5, .5, .8, M.vent, .04);
    box(.22, .3, .4, M.creamPlain, LEFT + .12, 1.2, 1.25); box(.03, .24, .32, M.dark, LEFT + .24, 1.2, 1.25);
    { const lx = LEFT + .3, ly = 1.85, lz = 1.55; pipe([[LEFT + .02, ly, lz], [lx - .05, ly + .05, lz], [lx, ly - .02, lz]], .012, M.dark); lathe([[.02, .02], [.08, -.02], [.15, -.12], [.16, -.14]], M.lampShade, lx, ly, lz); add(new C.SphereGeometry(.05, 12, 8), M.lampGlow, lx, ly - .08, lz, { cast: false }); const l = new C.PointLight(0xffb060, .6, 2.4, 2); l.position.set(lx, ly - .12, lz); scene.add(l); }
    box(.25, .03, .8, M.wood, LEFT + .13, 1.0, 1.85); for (let i = 0, z = 1.5; i < 10; i++){ const w = rr(.03, .06), h = rr(.16, .26); box(.18, h, w, std({ color: pick([0xc9553b, 0x3f6f7a, 0xe0c27a, 0x5c7a4a, 0xd9d2bf, 0x8a5a9a]) }), LEFT + .12, 1.015 + h/2, z + w/2); z += w + .006; }
    LZ(2.4, 1.6, .42, .6, M.poster, .02);
    plant(LEFT + .45, 0, 2.6, 1.7, 'tall'); plant(LEFT + .4, 0, 1.6, 1.0, 'bush');

    /* --- the ceiling: a grid panel light, pendants, ducts and conduit runs --- */
    { const gx = -1.6, gz = 0.2; box(.9, .06, .9, M.dark, gx, CEIL - .03, gz); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) box(.38, .02, .38, M.lampGlow, gx - .21 + i*.42, CEIL - .065, gz - .21 + j*.42, { cast: false });
      const l = new C.PointLight(0xffd8a0, .5, 4, 2); l.position.set(gx, CEIL - .3, gz); scene.add(l); }
    pendant(.15, .9, .95); pendant(-.15, -.2, 1.25, .12); pendant(-2.5, 1.0, .7, .16); pendant(2.2, -.3, .95, .13);
    flexDuct([[LEFT + .1, CEIL - .35, -1.2], [-1.6, CEIL - .3, -1.4], [-.3, CEIL - .4, -1.6], [W.x - .3, CEIL - .3, BACK + .45]], .1, M.flex);
    flexDuct([[RIGHT - .05, CEIL - .5, -.4], [2.0, CEIL - .25, -.2], [.8, CEIL - .18, .6], [-.6, CEIL - .2, 1.6]], .08, M.flex);
    for (let i = 0; i < 4; i++) pipe([[LEFT, CEIL - .12 - i*.05, -1.85 + i*.06], [RIGHT, CEIL - .12 - i*.05, -1.85 + i*.06]], .025, i % 2 ? M.steel : M.copper, 5);
    for (let x = LEFT + .5; x < RIGHT; x += .9) box(.05, .25, .3, M.dark, x, CEIL - .14, -1.75);
    box(.6, .35, .5, M.creamPlain, 2.4, CEIL - .2, .9); box(.5, .25, .01, M.vent, 2.4, CEIL - .2, 1.155, { cast: false });

    /* --- the floor: a striped rug in the sunlight, a stool, a basket of fruit, a big plant --- */
    const rug = new C.PlaneGeometry(2.0, 1.3); rug.rotateX(-Math.PI/2); add(rug, M.rug, -.1, .005, .55, { cast: false });
    lathe([[0, 0], [.16, 0], [.16, .02], [.04, .04], [.04, .55], [.18, .58], [.18, .62]], M.wood, 1.9, 0, 1.1);
    lathe([[0, 0], [.18, 0], [.22, .3], [.23, .32]], M.basket, -2.3, 0, 2.2); for (let i = 0; i < 5; i++) add(new C.SphereGeometry(.045, 10, 8), pick(M.fruit), -2.3 + rr(-.1, .1), .3, 2.2 + rr(-.1, .1));
    plant(2.65, 0, -.9, 1.5, 'bush');
  };

  /* ---------- light ---------- */
  R.light = sc => {
    const sun = new C.DirectionalLight(0xffc982, 5.2);
    sun.position.set(WIN.x + 3.0, WIN.y + 4.2, BACK - 7.5); sun.target.position.set(WIN.x - 1.3, 0, 1.2);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .015;
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .5, far: 22 });
    sc.add(sun, sun.target);
    sc.add(new C.HemisphereLight(0xc8dde8, 0x8a6a48, .13));
    sc.add(new C.AmbientLight(0x6a7a70, .06));
    // bounce: warm off the sunlit floor and rug and the bench, cool off the walls
    const b1 = new C.PointLight(0xffc58a, 1.1, 5, 2); b1.position.set(-.2, .35, .9); sc.add(b1);
    const b2 = new C.PointLight(0xffd8a8, .5, 4, 2); b2.position.set(WIN.x, 1.0, BACK + .8); sc.add(b2);
    const b3 = new C.PointLight(0xa8c8c0, .18, 6, 2); b3.position.set(1.5, 2.2, 3.5); sc.add(b3);
    return sun;
  };
  return R;
})();
