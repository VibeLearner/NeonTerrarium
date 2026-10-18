// The title screen's room, take two: a faithful rebuild of the owner's first reference (the porthole kitchen) in the
// game's look. Two walls meet in a corner: the kitchen wall square to the camera, and the hull wall swung away to the
// left, through which a deep porthole opens (an olive bulge, a dark groove, a chrome rim, a cream bulkhead, a stepped
// cream sleeve with slots and lamps). Before it a round table crowded with breakfast and plants; below it chrome pipes
// with grab handles along the curved foot of the hull. The kitchen: a cream capsule appliance with a dark window and an
// orange light strip, a dark splash with chrome pipes, a rail of ladles, a saucepan, a mustard towel, a big chrome
// canister and jars, a herb pot in a basket, a white counter of fruit, white cabinets with chrome pulls, knobs and an
// oven. A dark ceiling of machinery, a tube light, a hanging plant. A teal slate floor, a striped rug in the sun, an
// orange chair at the left edge, a brown cabinet at the right. All geometry and canvas textures: no pictures go in.
// Same interface as room.js (bake.html loads either). Plan: project doc claude/title-screen-plan.md.
'use strict';
const ROOM = (() => {
  const R = {};
  const C = THREE;
  let seed = 23; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const rr = (a, b) => a + rnd()*(b - a), pick = a => a[Math.floor(rnd()*a.length)];
  // Laid out from the reference's own proportions (camera at the origin, 1.68 m up, looking down -z, 50 degree lens):
  // the kitchen block stands forward on the right (front at z = -5.64), the hull wall with the porthole is behind on the
  // left, turned so its normal points right of the camera by 54.5 degrees (so the sleeve's right side shows).
  const CEIL = 4.8, KB = 0;   // (KB: the kitchen's back wall in its own frame; the kit group places and turns it)
  const N_ANG = 75.5*Math.PI/180, WC = new C.Vector3(-1.02, 2.37, -3.43);   // (placed by the owner in the arranging tool)   // (the porthole is in the left wall, facing across the room toward the kitchen)
  const WIN = { r: 1.4, rf: 1.66, r2: 1.16, depth: .85 };
  const hull = new C.Group(); hull.rotation.y = N_ANG; hull.position.set(WC.x, 0, WC.z); hull.updateMatrixWorld(true);
  const kit = new C.Group(); kit.position.set(-.05, 0, -5.74); kit.rotation.y = -19.5*Math.PI/180;   // (the owner's placement, slid .3 m along its run so the porthole's bulge clears its left end) kit.updateMatrixWorld(true);   // (pushed back against the far wall, its left end at the porthole wall, turned 33 degrees to face the window)
  const toWorld = (x, y, z) => { hull.updateMatrixWorld(true); return new C.Vector3(x, y, z).applyMatrix4(hull.matrixWorld); };
  // the movable pieces (the arranging tool moves these groups; each turns about its own centre)
  const G = { table: new C.Group(), chair: new C.Group(), cabinet: new C.Group(), rug: new C.Group() };
  R.WIN = WIN; R.CEIL = CEIL;
  R.winCenter = () => toWorld(0, WC.y, -WIN.depth);
  R.winTop = () => toWorld(0, WC.y + WIN.r2, -WIN.depth);
  R.winNormal = () => new C.Vector3(Math.sin(hull.rotation.y), 0, Math.cos(hull.rotation.y));
  const SIGN = { x: 3.45, y: 2.25, z: .03, w: 1.1, h: .42 };   // (in the kitchen's frame here; turned into world numbers for the bake's anchors below)
  { const v = new C.Vector3(SIGN.x, SIGN.y, SIGN.z).applyMatrix4(kit.matrixWorld); SIGN.lx = SIGN.x; SIGN.lz = SIGN.z; SIGN.x = v.x; SIGN.z = v.z; }   // (the title sign: right of the reference's frame, on the kitchen wall past the capsule)
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
  const scratches = (g, w, h, n, col) => { g.strokeStyle = col; for (let i = 0; i < n; i++){ g.lineWidth = rr(.5, 1.4); g.beginPath(); const x = rnd()*w, y = rnd()*h, a = rr(-.6, .6), l = rr(6, 40); g.moveTo(x, y); g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l); g.stroke(); } };
  const stains = (g, w, h, n, col, r0 = 8, r1 = 46) => { for (let i = 0; i < n; i++){ const x = rnd()*w, y = rnd()*h, r = rr(r0, r1), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2*r, 2*r); } };
  const drips = (g, w, h, n, col) => { for (let i = 0; i < n; i++){ const x = rnd()*w, y = rnd()*h*.6, l = rr(20, 120); const gr = g.createLinearGradient(x, y, x, y + l); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, rr(1, 3), l); } };
  const seam = (g, gh, x0, y0, x1, y1, lw = 2, col = 'rgba(50,40,25,.55)') => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); gh.strokeStyle = '#303030'; gh.lineWidth = lw + 1; gh.beginPath(); gh.moveTo(x0, y0); gh.lineTo(x1, y1); gh.stroke(); };
  const rivet = (g, gh, x, y, r = 3, col = 'rgba(80,65,40,.8)') => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,245,220,.55)'; g.fillRect(x - r*.5, y - r*.6, r*.6, r*.5); gh.fillStyle = '#e0e0e0'; gh.beginPath(); gh.arc(x, y, r, 0, 7); gh.fill(); };
  const fineText = (g, x, y, w, rows, col, size = 3) => { g.fillStyle = col; for (let r = 0; r < rows; r++){ let cx = x; while (cx < x + w){ const ww = rr(size*.6, size*2.6); g.fillRect(cx, y + r*size*1.8, ww, size); cx += ww + size*.7; } } };
  const glyphs = (g, x, y, n, size, col) => { g.fillStyle = col; for (let i = 0; i < n; i++){ const gx = x + i*size*1.25; for (let k = 0; k < 5; k++){ if (rnd() < .5) g.fillRect(gx + rr(0, size*.7), y + rr(0, size*.8), rr(size*.15, size*.7), size*.14); else g.fillRect(gx + rr(0, size*.8), y + rr(0, size*.3), size*.14, rr(size*.3, size*.9)); } } };
  // the hull: olive-tan paint over plates, weathered, streaked, rivets
  const hullT = texSet(1024, 1024, (g, gh, w, h) => {
    g.fillStyle = '#a98f5c'; g.fillRect(0, 0, w, h);
    stains(g, w, h, 60, 'rgba(90,65,30,.16)', 20, 90); stains(g, w, h, 40, 'rgba(255,235,190,.12)', 20, 70); drips(g, w, h, 40, 'rgba(70,50,25,.22)');
    specks(g, w, h, 5000, ['rgba(70,50,25,.25)', 'rgba(255,240,205,.2)', 'rgba(40,30,15,.2)'], .8, 2.6); scratches(g, w, h, 160, 'rgba(255,240,210,.3)');
    for (const y of [0, 340, 700]) seam(g, gh, 0, y, w, y, 3); for (const x of [0, 512]) seam(g, gh, x, 0, x, h, 3);
    for (let x = 16; x < w; x += 48){ rivet(g, gh, x, 352); rivet(g, gh, x, 712); }
  }, [1, 1]);
  const creamT = texSet(1024, 512, (g, gh, w, h) => {
    g.fillStyle = '#e6dcc1'; g.fillRect(0, 0, w, h); stains(g, w, h, 40, 'rgba(150,120,70,.14)', 10, 60); stains(g, w, h, 20, 'rgba(255,255,245,.2)');
    specks(g, w, h, 1800, ['rgba(110,85,50,.35)', 'rgba(255,255,250,.35)'], .8, 2.5); scratches(g, w, h, 80, 'rgba(150,125,90,.35)');
    for (let i = 0; i < 60; i++){ g.fillStyle = 'rgba(100,75,45,.6)'; g.beginPath(); g.arc(rnd()*w, rnd()*h, rr(1, 3.5), 0, 7); g.fill(); }
    for (let k = 0; k <= 8; k++){ const x = k/8*w; seam(g, gh, x, 0, x, h, 2, 'rgba(120,100,70,.5)'); }
    for (let k = 0; k < 8; k++){ const x = (k + .5)/8*w; g.fillStyle = 'rgba(70,60,45,.65)'; g.fillRect(x - 18, h*.42, 36, 10); gh.fillStyle = '#404040'; gh.fillRect(x - 18, h*.42, 36, 10); rivet(g, gh, x - 40, 14, 3, 'rgba(120,100,70,.8)'); rivet(g, gh, x + 40, h - 14, 3, 'rgba(120,100,70,.8)'); }
  }, [1, 1]);
  const enamelT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#ebe5d4'; g.fillRect(0, 0, w, h); stains(g, w, h, 18, 'rgba(160,130,90,.14)'); specks(g, w, h, 500, ['rgba(110,90,60,.4)', 'rgba(255,255,255,.4)'], .8, 2.2); scratches(g, w, h, 30, 'rgba(150,130,100,.3)');
    for (let i = 0; i < 14; i++){ g.fillStyle = 'rgba(90,70,45,.55)'; g.beginPath(); g.arc(rnd()*w, rnd()*h, rr(1, 3), 0, 7); g.fill(); }
  }, [1, 1]);
  const counterEdgeT = texSet(1024, 64, (g, gh, w, h) => { g.fillStyle = '#ece6d6'; g.fillRect(0, 0, w, h); fineText(g, 20, 14, 420, 4, 'rgba(60,55,45,.55)', 3); fineText(g, 520, 14, 260, 3, 'rgba(60,55,45,.5)', 3); specks(g, w, h, 300, ['rgba(110,90,60,.4)'], .6, 1.6); });
  const appT = texSet(1024, 512, (g, gh, w, h) => {   // the capsule appliance's skin: panels, labels, glyphs, stickers, wear
    g.fillStyle = '#e8dec4'; g.fillRect(0, 0, w, h); stains(g, w, h, 30, 'rgba(160,125,80,.14)', 10, 70); specks(g, w, h, 1500, ['rgba(110,85,50,.35)', 'rgba(255,255,250,.4)'], .8, 2.2);
    for (const x of [140, 870]) seam(g, gh, x, 0, x, h, 2, 'rgba(120,100,70,.55)'); seam(g, gh, 0, 70, w, 70, 2, 'rgba(120,100,70,.5)'); seam(g, gh, 0, 440, w, 440, 2, 'rgba(120,100,70,.5)');
    glyphs(g, 330, 160, 4, 30, 'rgba(70,60,50,.8)'); fineText(g, 520, 165, 120, 2, 'rgba(70,60,50,.7)', 4);
    fineText(g, 20, 120, 100, 3, 'rgba(70,60,50,.6)', 3); g.fillStyle = '#d6573b'; g.fillRect(900, 120, 90, 30); fineText(g, 905, 126, 80, 2, 'rgba(255,240,220,.9)', 3);
    g.fillStyle = '#3f6f7a'; g.fillRect(920, 170, 70, 14); g.fillStyle = 'rgba(70,60,50,.7)'; g.fillRect(40, 380, 60, 6); g.fillRect(40, 392, 40, 6);
    for (let i = 0; i < 6; i++){ g.fillStyle = '#2c2a26'; g.fillRect(30 + i*16, 420, 10, 6); }
    for (let x = 160; x < 860; x += 70){ rivet(g, gh, x, 470, 3, 'rgba(120,100,70,.8)'); }
  }, [1, 1]);
  const floorT = texSet(1024, 1024, (g, gh, w, h) => {
    g.fillStyle = '#3e4f4b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 170){ let x = (y/170) % 2 ? -110 : 0; while (x < w){ const tw = pick([170, 230, 290, 340]);
      g.fillStyle = pick(['#668a84', '#5b7d77', '#71918a', '#557570', '#688681']); g.fillRect(x + 4, y + 4, tw - 8, 162);
      const gr = g.createLinearGradient(x, y, x + tw, y + 170); gr.addColorStop(0, 'rgba(255,255,240,.08)'); gr.addColorStop(1, 'rgba(10,20,20,.12)'); g.fillStyle = gr; g.fillRect(x + 4, y + 4, tw - 8, 162);
      gh.fillStyle = '#909090'; gh.fillRect(x + 4, y + 4, tw - 8, 162); x += tw; } }
    specks(g, w, h, 7000, ['rgba(20,30,28,.25)', 'rgba(230,240,230,.2)', 'rgba(120,100,70,.12)'], 1, 2.6); stains(g, w, h, 40, 'rgba(30,25,15,.12)', 20, 90); scratches(g, w, h, 140, 'rgba(220,235,225,.22)');
  }, [6, 6]);
  const splashT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#1d1c18'; g.fillRect(0, 0, w, h); gh.fillStyle = '#404040'; gh.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y/32) % 2 ? -32 : 0; x < w; x += 64){ g.fillStyle = pick(['#3a3a30', '#353528', '#40402f', '#2f3129', '#45432f']); g.fillRect(x + 2, y + 2, 60, 28);
      g.fillStyle = 'rgba(255,245,215,.07)'; g.fillRect(x + 3, y + 3, 56, 5); gh.fillStyle = '#a0a0a0'; gh.fillRect(x + 2, y + 2, 60, 28); }
    stains(g, w, h, 20, 'rgba(120,90,50,.15)'); specks(g, w, h, 900, ['rgba(220,200,160,.15)', 'rgba(0,0,0,.2)'], .8, 2);
  }, [1, 1]);
  const rugT = texSet(512, 512, (g, gh, w, h) => {
    const cols = ['#ead7a8', '#d9a84a', '#ead7a8', '#c8742e', '#f0e2bc', '#7a4a24'];
    for (let y = 0, k = 0; y < h; k++){ const sw = pick([22, 30, 14, 36]); g.fillStyle = cols[k % cols.length]; g.fillRect(0, y, w, sw); y += sw; }
    for (let x = 0; x < w; x += 3){ g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, 0, 1, h); gh.fillStyle = '#707070'; gh.fillRect(x, 0, 1, h); }
    specks(g, w, h, 2500, ['rgba(70,40,15,.2)', 'rgba(255,245,215,.22)'], 1, 2);
  });
  const woodT = texSet(512, 256, (g, gh, w, h) => {
    g.fillStyle = '#8a5530'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++){ const y = rnd()*h; g.strokeStyle = i % 2 ? 'rgba(55,28,12,.35)' : 'rgba(205,145,90,.22)'; g.lineWidth = rr(.6, 2.4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w*.3, y + rr(-6, 6), w*.6, y + rr(-6, 6), w, y + rr(-5, 5)); g.stroke(); }
    stains(g, w, h, 14, 'rgba(40,20,8,.18)');
  }, [1, 1]);
  const darkMetalT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#3b332a'; g.fillRect(0, 0, w, h); stains(g, w, h, 30, 'rgba(120,95,60,.18)', 10, 70); specks(g, w, h, 2500, ['rgba(15,12,8,.35)', 'rgba(170,140,95,.18)'], .8, 2.4); scratches(g, w, h, 90, 'rgba(190,160,110,.25)');
    for (const y of [0, 256]) seam(g, gh, 0, y, w, y, 3, 'rgba(10,8,5,.6)'); for (const x of [0, 170, 340]) seam(g, gh, x, 0, x, h, 3, 'rgba(10,8,5,.6)');
  }, [1, 1]);
  const metalT = texSet(256, 256, (g, gh, w, h) => { g.fillStyle = '#c4c4bc'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++){ g.fillStyle = y % 3 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; g.fillRect(0, y, w, 1); } specks(g, w, h, 300, ['rgba(60,50,40,.3)', 'rgba(140,100,60,.25)']); }, [2, 2]);
  const towelT = texSet(64, 128, (g, gh, w, h) => { g.fillStyle = '#e09a2a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4){ g.fillStyle = 'rgba(120,60,10,.18)'; g.fillRect(0, y, w, 1); } g.fillStyle = '#c3751f'; g.fillRect(0, h - 14, w, 4); });
  const leatherT = texSet(256, 256, (g, gh, w, h) => { g.fillStyle = '#7e4524'; g.fillRect(0, 0, w, h); stains(g, w, h, 20, 'rgba(255,200,140,.14)'); stains(g, w, h, 20, 'rgba(60,25,8,.22)'); for (let k = 1; k < 4; k++){ seam(g, gh, k*w/4, 0, k*w/4, h, 2, 'rgba(60,25,8,.5)'); } });
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
    hull: withBump(hullT, { roughness: .7, metalness: .15 }, .02), cream: withBump(creamT, { roughness: .4, metalness: .25 }, .012), creamPlain: std({ color: 0xe3d8bd, roughness: .42, metalness: .25 }),
    enamel: withBump(enamelT, { roughness: .3, metalness: .08 }, .004), counterEdge: std({ map: counterEdgeT.map, roughness: .3 }), app: withBump(appT, { roughness: .38, metalness: .2 }, .006),
    floor: withBump(floorT, { roughness: .45, metalness: .05 }, .02), rug: withBump(rugT, { roughness: .95 }, .03), wood: withBump(woodT, { roughness: .45 }), darkMetal: withBump(darkMetalT, { roughness: .55, metalness: .5 }, .02),
    steel: withBump(metalT, { roughness: .3, metalness: .65 }, .002), chrome: std({ color: 0xf0ece0, roughness: .22, metalness: .72 }), copper: std({ color: 0xc0784a, roughness: .28, metalness: .9 }),
    brass: std({ color: 0xc8994e, roughness: .3, metalness: .9 }), dark: std({ color: 0x24201c, roughness: .55, metalness: .4 }), blackGlass: std({ color: 0x14130f, roughness: .06, metalness: .5 }),
    rubber: std({ color: 0x2e2a26, roughness: .85 }), splash: withBump(splashT, { roughness: .25, metalness: .2 }, .01), glass: std({ color: 0xf0f2e8, roughness: .04, metalness: .1, transparent: true, opacity: .32 }), ceramic: std({ color: 0xf1ebdc, roughness: .18 }),
    pot: std({ color: 0xa8583a, roughness: .85 }), soil: std({ color: 0x3a2a1e, roughness: 1 }), basket: std({ color: 0xb0884e, roughness: .95 }),
    towel: std({ map: towelT.map, roughness: .95, side: C.DoubleSide }), leather: withBump(leatherT, { roughness: .55 }, .01), brownCab: std({ color: 0x4a3020, roughness: .45, metalness: .25 }),
    lampGlow: new C.MeshBasicMaterial({ color: 0xffc06a, toneMapped: false }), tubeGlow: new C.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }),
    leafs: [0x3f6f3a, 0x557f3c, 0x2e5a30, 0x6f9a4a, 0x4d7a3a, 0x86a65a].map(c => std({ color: c, roughness: .55, side: C.DoubleSide })),
    fruit: [0xf08a24, 0xf2a62a, 0xd8432a, 0xe8c547, 0xe07a2a, 0xb84a2a].map(c => std({ color: c, roughness: .38 })),
    bread: std({ color: 0xc88a45, roughness: .7 }),
  };
  R.M = M;

  /* ---------- geometry helpers ---------- */
  let scene = null, parent = null;
  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new C.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.s) m.scale.setScalar(o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true; (o.p || parent || scene).add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, o) => add(new C.BoxGeometry(w, h, d), mat, x, y, z, o);
  const cyl = (r0, r1, h, mat, x, y, z, o = {}) => add(new C.CylinderGeometry(r0, r1, h, o.seg || 20, 1, !!o.open), mat, x, y, z, o);
  function rbox(w, h, d, r, bev = 4){
    const s = new C.Shape(), x = -w/2 + r, y = -h/2 + r, ww = w - 2*r, hh = h - 2*r;
    s.absarc(x, y, r, Math.PI, 1.5*Math.PI); s.absarc(x + ww, y, r, 1.5*Math.PI, 2*Math.PI); s.absarc(x + ww, y + hh, r, 0, .5*Math.PI); s.absarc(x, y + hh, r, .5*Math.PI, Math.PI);
    const bt = Math.min(r, d*.45), g = new C.ExtrudeGeometry(s, { depth: Math.max(.001, d - 2*bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt*.9, bevelSegments: bev, curveSegments: 10 });
    g.translate(0, 0, -(d - 2*bt)/2); return g;
  }
  const lathe = (pts, mat, x, y, z, o = {}) => add(new C.LatheGeometry(pts.map(([a, b]) => new C.Vector2(a, b)), o.seg || 28), mat, x, y, z, o);
  function pipe(pts, r, mat, clamps = 0, o = {}){
    const curve = new C.CatmullRomCurve3(pts.map(p => new C.Vector3(...p)), false, 'catmullrom', .1);
    add(new C.TubeGeometry(curve, Math.max(24, pts.length*16), r, 10, false), mat, 0, 0, 0, o);
    for (let i = 1; i <= clamps; i++){ const t = i/(clamps + 1), p = curve.getPoint(t), tg = curve.getTangent(t); const m = add(new C.CylinderGeometry(r*1.5, r*1.5, r*1.8, 12), M.dark, p.x, p.y, p.z, o); m.quaternion.setFromUnitVectors(new C.Vector3(0, 1, 0), tg); }
    return curve;
  }
  function leafGeo(len, wid){
    const s = new C.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(wid, len*.35, 0, len); s.quadraticCurveTo(-wid, len*.35, 0, 0);
    const g = new C.ShapeGeometry(s, 5); const p = g.attributes.position; for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i); p.setZ(i, -Math.abs(x)*.5 + Math.sin(y/len*Math.PI)*len*.08); } g.computeVertexNormals(); return g;
  }
  const LEAF = [leafGeo(.07, .035), leafGeo(.1, .045), leafGeo(.05, .028), leafGeo(.14, .05)];
  function pot(x, y, z, s, mat){ lathe([[0, 0], [.13*s, 0], [.15*s, .02*s], [.17*s, .22*s], [.19*s, .24*s], [.19*s, .28*s], [.165*s, .28*s]], mat, x, y, z); cyl(.165*s, .165*s, .01, M.soil, x, y + .27*s, z, { cast: false }); }
  // a leafy plant: many short twigs ending in clusters of small leaves (the kitchen's bushes and herbs), or long trailing vines
  function plant(x, y, z, s, kind, potMat){
    if (potMat !== null) pot(x, y, z, s, potMat || M.pot);
    const top = y + .27*s, stems = kind === 'tree' ? 18 : kind === 'trail' ? 10 : 16;
    for (let k = 0; k < stems; k++){
      const a = rnd()*Math.PI*2, lean = kind === 'trail' ? rr(.7, 1.2) : rr(.15, .6), len = (kind === 'tree' ? rr(.5, 1.2) : kind === 'trail' ? rr(.5, 1.3) : rr(.2, .5))*s;
      const pts = []; for (let i = 0; i <= 6; i++){ const t = i/6; const dx = Math.cos(a)*lean*t*len, dz = Math.sin(a)*lean*t*len;
        const dy = kind === 'trail' ? (t < .2 ? t*.4*len : .08*len - (t - .2)*len*1.15) : t*len*(1 - lean*.25*t); pts.push(new C.Vector3(x + dx, top + dy, z + dz)); }
      const curve = new C.CatmullRomCurve3(pts); add(new C.TubeGeometry(curve, 10, .005*s, 4), kind === 'tree' ? std({ color: 0x5a4630 }) : M.leafs[2], 0, 0, 0, { cast: false });
      const nl = kind === 'trail' ? 12 : kind === 'tree' ? 14 : 8;
      for (let i = 1; i <= nl; i++){ const t = kind === 'trail' ? i/nl : .35 + i/nl*.65; const p = curve.getPoint(t);
        for (let q = 0; q < (kind === 'trail' ? 1 : 2); q++){ const lf = add(pick(LEAF), pick(M.leafs), p.x + rr(-.03, .03)*s, p.y + rr(-.02, .03)*s, p.z + rr(-.03, .03)*s, { s: s*rr(.8, 1.4), cast: rnd() < .5 });
          lf.rotation.set(rr(-1.6, .6), rnd()*6.3, rr(-.9, .9)); } }
    }
  }
  function jar(x, y, z, h, r, fill, o = {}){ lathe([[0, 0], [r, 0], [r, h*.85], [r*.8, h*.92], [r*.8, h]], M.glass, x, y, z, Object.assign({ cast: false }, o)); if (fill) cyl(r*.9, r*.9, h*.6, fill, x, y + h*.3, z, Object.assign({ cast: false }, o)); cyl(r*.82, r*.82, .02, M.steel, x, y + h + .01, z, o); }
  function fruit(x, y, z, r, mat, o = {}){ return add(new C.SphereGeometry(r, 12, 10), mat || pick(M.fruit), x, y + r, z, o); }
  function plate(x, y, z, r, o = {}){ lathe([[0, 0], [r*.7, 0], [r, r*.12], [r*1.02, r*.13]], M.ceramic, x, y, z, Object.assign({ cast: false }, o)); }
  function fruitPlate(x, y, z, r, n, o = {}){ plate(x, y, z, r, o); for (let i = 0; i < n; i++){ const a = rnd()*7, d = rnd()*r*.55; fruit(x + Math.cos(a)*d, y + .012, z + Math.sin(a)*d, rr(.025, .04), null, o); } }
  function bowl(x, y, z, r, n, mat, o = {}){ lathe([[0, 0], [r*.5, 0], [r, r*.5], [r*1.03, r*.53]], mat || M.ceramic, x, y, z, o); for (let i = 0; i < n; i++){ const a = rnd()*7, d = rnd()*r*.55; fruit(x + Math.cos(a)*d, y + r*.25 + rr(0, .03), z + Math.sin(a)*d, rr(.028, .042), null, o); } }
  function bread(x, y, z, l, o = {}){ const m = add(new C.SphereGeometry(l*.45, 14, 10), M.bread, x, y + l*.25, z, o); m.scale.set(1.5, .7, .9); m.rotation.y = rnd()*3; return m; }
  function cup(x, y, z, o = {}){ lathe([[0, 0], [.03, 0], [.035, .07], [.033, .075]], M.glass, x, y, z, Object.assign({ cast: false }, o)); }

  /* ---------- the hull wall and the porthole (built in the hull's frame: local x along the wall to the right, z into the room) ---------- */
  function buildHull(){
    parent = hull; const W = WIN, Y = WC.y;
    const L0 = -6, L1 = W.rf + 1.4, ws = new C.Shape(); ws.moveTo(L0, 0); ws.lineTo(L1, 0); ws.lineTo(L1, CEIL); ws.lineTo(L0, CEIL); ws.lineTo(L0, 0);
    const RF = W.rf, rAt = z => RF + (W.r2 - RF)*Math.min(1, -z/W.depth);   // (the sleeve is a funnel: wide at the room, narrowing to the glass)
    const hole = new C.Path(); hole.absarc(0, Y, RF + .06, 0, Math.PI*2, true); ws.holes.push(hole);
    const wg = new C.ExtrudeGeometry(ws, { depth: .3, bevelEnabled: false, curveSegments: 120 });
    { const uv = wg.attributes.uv, p = wg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i)/2.6, p.getY(i)/2.6); }
    add(wg, M.hull, 0, 0, -.3);
    // the olive bulge round it, a dark groove, a chrome rim, the cream bulkhead with bolts
    add(new C.TorusGeometry(RF + .3, .3, 28, 200), M.hull, 0, Y, -.02).scale.set(1, 1, .55); add(new C.TorusGeometry(RF + .62, .05, 10, 200), M.dark, 0, Y, .02, { cast: false });
    add(new C.TorusGeometry(RF + .07, .035, 12, 200), M.dark, 0, Y, .03, { cast: false });
    add(new C.TorusGeometry(RF + .04, .04, 14, 200), M.chrome, 0, Y, .06, { cast: false });
    add(new C.TorusGeometry(RF - .02, .055, 14, 200), M.cream, 0, Y, .03);
    for (let k = 0; k < 56; k++){ const a = k/56*Math.PI*2; cyl(.011, .011, .025, M.dark, Math.cos(a)*(RF - .02), Y + Math.sin(a)*(RF - .02), .085, { rx: Math.PI/2, cast: false, seg: 6 }); }
    for (let k = 0; k < 10; k++){ const a = k/10*Math.PI*2 + .2; const b = box(.18, .08, .06, M.hull, Math.cos(a)*(RF + .5), Y + Math.sin(a)*(RF + .5), .14); b.rotation.z = a; }
    // the sleeve: one cream funnel with ribs, slots and small lamps, a chrome step, a short throat to the glass
    const d1 = W.depth*.8, rb = rAt(-d1), s1 = new C.CylinderGeometry(RF, rb, d1, 120, 1, true); s1.rotateX(Math.PI/2);
    { const uv = s1.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*4, uv.getY(i)); }
    add(s1, std({ map: creamT.map, bumpMap: creamT.bump, bumpScale: .015, roughness: .36, metalness: .25, side: C.BackSide }), 0, Y, -d1/2 + .02);
    for (let k = 0; k < 32; k++){ const a = k/32*Math.PI*2, c = Math.cos(a), sn = Math.sin(a);
      pipe([[c*(RF - .02), Y + sn*(RF - .02), .0], [c*(rb - .015), Y + sn*(rb - .015), -d1 + .04]], .016, M.creamPlain);
      if (k % 4 === 1){ const z = -d1*.45, r = rAt(z) - .006; const sl = box(.12, .008, .2, M.dark, Math.cos(a + .05)*r, Y + Math.sin(a + .05)*r, z, { cast: false }); sl.rotation.z = a; }
      if (k % 8 === 5){ const z = -d1*.75, r = rAt(z) - .008; const lt = box(.07, .01, .1, M.lampGlow, Math.cos(a + .05)*r, Y + Math.sin(a + .05)*r, z, { cast: false }); lt.rotation.z = a; } }
    const d2 = W.depth - d1;
    { const st = new C.RingGeometry(W.r2, rb + .01, 160, 1); add(st, M.creamPlain, 0, Y, -d1 + .02, { cast: false }); }
    add(new C.TorusGeometry(W.r2 + .015, .02, 8, 160), M.chrome, 0, Y, -d1 + .025, { cast: false });
    const s2 = new C.CylinderGeometry(W.r2, W.r2, d2, 120, 1, true); s2.rotateX(Math.PI/2); add(s2, std({ map: creamT.map, roughness: .4, metalness: .25, side: C.BackSide }), 0, Y, -d1 - d2/2 + .02);
    add(new C.TorusGeometry(W.r2 - .01, .025, 8, 160), M.steel, 0, Y, -W.depth + .04, { cast: false });
    const glass = new C.Mesh(new C.CircleGeometry(W.r2, 120), new C.MeshBasicMaterial({ colorWrite: false })); glass.position.set(0, Y, -W.depth + .03); glass.renderOrder = -10; hull.add(glass);   // (drawn first, so it closes the window off before anything behind it)
    // the funnel's outside, closing it against the wall behind
    { const og = new C.CylinderGeometry(RF + .06, W.r2 + .1, W.depth, 64, 1, true); og.rotateX(Math.PI/2); add(og, M.hull, 0, Y, -W.depth/2 - .02, { cast: false }); }
    // plants in the window's foot and climbing the sleeve
    // a flat sill across the funnel's foot, a chrome lip on it, and the pots standing on it
    { const sy = Y - 1.0; box(1.36, .05, .92, M.creamPlain, 0, sy - .025, -.42); box(1.36, .03, .03, M.chrome, 0, sy - .01, .03, { cast: false }); box(1.3, .14, .03, M.cream, 0, sy - .12, .02, { cast: false });
      plant(-.42, sy, -.58, .62, 'tree'); plant(.36, sy, -.62, .5, 'tree'); plant(-.02, sy, -.3, .4, 'herb'); plant(.48, sy, -.18, .36, 'herb', M.steel); plant(-.5, sy, -.14, .34, 'herb'); }
    for (let k = 0; k < 0; k++){ const a = Math.PI*(1.1 + k*.045); const lz = -rr(.05, .45), lr = rAt(lz) - .05; const lf = add(pick(LEAF), pick(M.leafs), Math.cos(a)*lr, Y + Math.sin(a)*lr, lz, { s: rr(1, 1.8) }); lf.rotation.set(rnd()*6, rnd()*6, rnd()*6); }
    // the hull's foot below the window: a cream apron bulging out, chrome pipes with grab handles along it, a latch
    { const ap = new C.CylinderGeometry(.6, .6, 4.2, 28, 1, true, 0, Math.PI/2); ap.rotateZ(Math.PI/2); ap.rotateX(Math.PI/2); add(ap, M.cream, -.6, .02, -.02, { cast: false }); }
    pipe([[-2.6, .32, .1], [-1.2, .3, .12], [-.2, .33, .12], [.6, .45, .1], [1.0, .8, .06]], .02, M.chrome, 0);
    pipe([[-2.6, .16, .14], [-.5, .16, .15], [.7, .2, .12]], .016, M.chrome, 0);
    for (const hx of [-.9, .2]) pipe([[hx - .12, .34, .12], [hx - .1, .48, .17], [hx + .1, .48, .17], [hx + .12, .34, .12]], .012, M.chrome);
    cyl(.03, .03, .1, M.chrome, -.3, .62, .15, { rx: Math.PI/2 }); box(.04, .14, .03, M.chrome, -.3, .54, .2);
    // the round table at the window: a thick wooden top with a lip, a pedestal, breakfast
    parent = G.table;
    const T = { x: -.64, z: -2.27, y: 1.11, r: .6 };   // (bar height: the owner raised it)
    lathe([[0, -.05], [T.r, -.05], [T.r + .025, -.02], [T.r + .025, .02], [T.r, .035], [0, .035]], M.wood, T.x, T.y, T.z, { seg: 56 });
    lathe([[0, 0], [.26, 0], [.28, .05], [.07, .14], [.06, T.y - .14], [.1, T.y - .06], [.14, T.y - .04]], M.dark, T.x, 0, T.z, { seg: 28 });
    const TY = T.y + .035;
    for (let i = 0; i < 34; i++){ const a = rnd()*Math.PI*2, d = Math.sqrt(rnd())*T.r*.86, x = T.x + Math.cos(a)*d, z = T.z + Math.sin(a)*d, k = rnd();
      if (k < .26) fruitPlate(x, TY, z, rr(.09, .13), 5); else if (k < .42) bowl(x, TY, z, rr(.07, .1), 6); else if (k < .58){ plate(x, TY, z, .11); bread(x, TY + .012, z, rr(.08, .12)); bread(x + .03, TY + .03, z + .02, rr(.06, .09)); }
      else if (k < .68) cup(x, TY, z); else if (k < .82) fruit(x, TY, z, rr(.028, .04)); else box(rr(.1, .16), .008, rr(.07, .11), std({ color: pick([0x3f6f7a, 0xd9c9a2, 0x2e2a26, 0xb0884e]) }), x, TY + .004, z, { ry: rnd()*3 }); }
    lathe([[0, 0], [.1, 0], [.13, .09], [.11, .2], [.07, .27], [.08, .29]], M.copper, T.x - .25, TY, T.z - .35);
    lathe([[0, 0], [.09, 0], [.11, .07], [.09, .15], [.035, .17]], M.ceramic, T.x + .32, TY, T.z - .25);
    plant(T.x - .5, TY, T.z - .35, .5, 'tree'); plant(T.x + .38, TY, T.z - .45, .4, 'herb'); plant(T.x + .05, TY, T.z - .52, .35, 'herb', M.steel);
    parent = null;
  }

  /* ---------- the kitchen block (in its own frame: local z = 0 is its back wall, the front at z = .68) ---------- */
  function buildKitchen(){
    parent = kit;
    const X0 = .02, X1 = 4.2, CW = X1 - X0, CX = (X0 + X1)/2, D = .68, TOP = .92, fz = D + .002;
    // the back wall, its left return to the hull, a cream column at the join with a pipe
    const kw = new C.PlaneGeometry(5.1, CEIL); { const uv = kw.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*5.1/2.6, uv.getY(i)*CEIL/2.6); } add(kw, M.hull, 2.25, CEIL/2, 0, { cast: false });
    box(.06, TOP + .8, .1, M.hull, X0 - .03, (TOP + .8)/2, .05, { cast: false });
    // (the steel riser that stood at the counter's left end is gone: it cut the frame in two from this camera)
    // the cabinets: a dark plinth, white enamel body, drawers and a door at the left, knobs and the oven, more doors right
    box(CW, .08, D - .05, M.dark, CX, .04, D/2 - .025, { cast: false });
    add(rbox(CW, TOP - .1, D, .02), M.enamel, CX, .08 + (TOP - .1)/2, D/2);
    add(rbox(.5, .3, .03, .012), M.enamel, X0 + .28, .69, fz); box(.3, .03, .035, M.chrome, X0 + .28, .66, fz + .035);
    add(rbox(.5, .5, .03, .012), M.enamel, X0 + .28, .3, fz); box(.3, .03, .035, M.chrome, X0 + .28, .45, fz + .035);
    add(rbox(.5, .82, .03, .012), M.enamel, X0 + .8, .47, fz); box(.03, .16, .03, M.chrome, X0 + 1.0, .58, fz + .035);
    { const ox = 1.33; box(.56, .62, .03, M.steel, ox, .34, fz); box(.48, .44, .02, M.blackGlass, ox, .34, fz + .02); box(.44, .03, .045, M.chrome, ox, .58, fz + .05);
      cyl(.012, .012, .3, M.chrome, ox, .3, fz + .05, { rz: Math.PI/2, seg: 8 }); box(.56, .08, .03, M.steel, ox, .08, fz);
      for (let k = 0; k < 7; k++){ cyl(.026, .026, .03, M.chrome, 1.08 + k*.085, .78, fz + .02, { rx: Math.PI/2, seg: 16 }); cyl(.012, .012, .035, M.dark, 1.08 + k*.085, .78, fz + .03, { rx: Math.PI/2, seg: 8, cast: false }); }
      box(.12, .045, .01, std({ color: 0x1a1a14, emissive: 0x6aff9a, emissiveIntensity: .25 }), 1.75, .78, fz + .015, { cast: false }); }
    for (let i = 0; i < 4; i++){ const x = 2.0 + i*.55; add(rbox(.52, .82, .03, .012), M.enamel, x, .47, fz); box(.03, .16, .03, M.chrome, x - .2, .58, fz + .035); }
    // the counter's rolled front edge with fine print, the top
    box(CW, .06, .02, M.counterEdge, CX, TOP - .03, D + .012, { cast: false });
    box(CW + .02, .025, D + .02, M.enamel, CX, TOP + .012, D/2);
    // the splash: dark, chrome pipes along it, a rail of ladles and hooks
    { const sp = new C.PlaneGeometry(CW, .74); const uv = sp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*CW/.6, uv.getY(i)*.74/.6); add(sp, M.splash, CX, TOP + .37, .022, { cast: false }); }
    for (let i = 0; i < 4; i++) pipe([[X0, 1.6 - i*.05, .05 + i*.02], [X1, 1.6 - i*.05, .05 + i*.02]], .018 - i*.003, i === 1 ? M.copper : M.chrome, 5);
    pipe([[X0 + .35, 1.62, .06], [X0 + .38, 1.45, .1], [X0 + .55, 1.42, .1], [X0 + .58, 1.0, .08]], .016, M.chrome);
    cyl(.01, .01, CW - .6, M.chrome, CX + .25, 1.42, .16, { rz: Math.PI/2 });
    for (let i = 0; i < 14; i++){ const x = 1.55 + i*.13, l = rr(.14, .3); cyl(.005, .005, l, M.chrome, x, 1.42 - l/2, .165, { seg: 6 });
      if (i % 3 === 0) add(new C.SphereGeometry(.032, 12, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2), M.chrome, x, 1.42 - l, .165); else box(.035, .055, .006, M.chrome, x, 1.42 - l, .165); }
    lathe([[0, 0], [.12, 0], [.13, .11], [.135, .12]], M.chrome, 3.35, 1.18, .22, { rx: -Math.PI/2.3 }); cyl(.01, .01, .22, M.chrome, 3.35, 1.34, .22);
    { const tw = new C.PlaneGeometry(.24, .42, 4, 10); const p = tw.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i)*14)*.012 + p.getX(i)*p.getX(i)*1.4); tw.computeVertexNormals(); add(tw, M.towel, 2.33, 1.24, .19); }
    box(3.9, .018, .03, M.lampGlow, 2.4, 1.64, .5, { cast: false }); { const l = new C.PointLight(0xffc888, .7, 2.4, 2); l.position.set(2.4, 1.5, .45); kit.add(l); }
    box(1.3, .015, .16, M.chrome, 2.95, 1.27, .1); for (const x of [2.32, 3.58]) box(.015, .1, .16, M.chrome, x, 1.22, .1, { cast: false });
    for (let i = 0; i < 11; i++) jar(2.38 + i*.11, 1.28, .1 + (i % 2)*.03, rr(.08, .14), .028, std({ color: pick([0xb06a30, 0x8a5a2a, 0xd8a050, 0x5a7a3a, 0xc94f3b]) }));
    for (const [x, r] of [[3.78, .1], [4.02, .08]]){ lathe([[0, 0], [r, 0], [r*1.05, .04], [r*1.08, .045]], M.copper, x, 1.25, .07, { rx: Math.PI/2 }); cyl(.008, .008, .16, M.dark, x, 1.25 - r - .08, .07, { seg: 6 }); }
    add(rbox(.14, .09, .02, .01), M.creamPlain, 1.0, 1.12, .03); for (const dx of [-.03, .03]) box(.02, .03, .01, M.dark, 1.0 + dx, 1.12, .045, { cast: false });
    for (const x of [.78, 3.66]) cyl(.012, .012, .7, M.steel, x, TOP + .37, .04, { seg: 8 });
    // on the counter: the herb pot in a basket, the big chrome canister, jars, fruit plates, cups, a pan
    plant(.62, TOP + .02, .3, .95, 'herb', M.basket); plant(.62, TOP + .02, .3, .9, 'tree', null); plant(.62, TOP + .02, .3, 1.1, 'herb', null);
    lathe([[0, 0], [.22, 0], [.235, .02], [.235, .44], [.21, .5], [.1, .56], [.1, .6], [.12, .62]], M.chrome, 1.4, TOP + .02, .32); cyl(.18, .18, .3, std({ color: 0xc07a3a, roughness: .5 }), 1.4, TOP + .2, .32, { cast: false });
    pipe([[1.57, TOP + .38, .3], [1.68, TOP + .36, .3], [1.66, TOP + .16, .3]], .014, M.chrome);
    jar(1.0, TOP + .02, .2, .4, .13, std({ color: 0xb06a30 })); jar(1.18, TOP + .02, .14, .28, .09, std({ color: 0x8a5a2a })); jar(1.8, TOP + .02, .18, .22, .08, M.fruit[1]); jar(1.97, TOP + .02, .16, .18, .06, null);
    for (const [x, z] of [[.3, .52], [.75, .55], [1.2, .58], [2.6, .5], [3.3, .5], [1.9, .6], [.95, .6]]) fruitPlate(x, TOP + .025, z, .15, 9);
    for (let i = 0; i < 6; i++) lathe([[0, 0], [.03, 0], [.03, .16], [.013, .22], [.013, .25]], std({ color: pick([0x3f6f7a, 0xc94f3b, 0xe0c27a, 0x6a8a3a]), roughness: .12, transparent: true, opacity: .85 }), 2.7 + i*.08, TOP + .025, .16 + (i % 2)*.07);
    bowl(1.62, TOP + .025, .55, .09, 7); bowl(2.95, TOP + .025, .58, .11, 8, M.wood); fruitPlate(.5, TOP + .025, .25, .1, 4);
    bowl(2.15, TOP + .025, .45, .1, 0, M.steel); cup(2.0, TOP + .025, .5); cup(2.08, TOP + .025, .56); lathe([[0, 0], [.05, 0], [.05, .12], [.045, .13]], M.steel, 2.35, TOP + .025, .32);
    // the capsule appliance: a big rounded cream body, a dark window in a chrome bezel, controls, the orange light strip
    const AY = 1.65, AH = 1.13, AD = .62, AX0 = .4, AX1 = 4.4;
    add(rbox(AX1 - AX0, AH, AD, .4, 8), M.app, (AX0 + AX1)/2, AY + AH/2, AD/2 + .02);
    const az = AD + .02;
    { const wx = 1.14, wy = AY + .42; add(rbox(1.05, .6, .05, .06), M.chrome, wx, wy, az); add(rbox(.96, .5, .05, .05), M.blackGlass, wx, wy, az + .015);
      box(.3, .42, .01, std({ color: 0x1a1915, roughness: .3 }), wx + .3, wy, az + .045, { cast: false });
      for (let k = 0; k < 8; k++) box(.055, .03, .01, M.ceramic, wx + .23 + (k % 2)*.1, wy + .14 - Math.floor(k/2)*.07, az + .05, { cast: false });
      box(.42, .08, .02, M.steel, wx, AY + .06, az + .02); }
    add(rbox(1.35, .1, .03, .03), M.chrome, 1.4, AY + .9, az + .005); box(1.25, .055, .02, M.lampGlow, 1.4, AY + .9, az + .02, { cast: false }); for (let k = 0; k < 3; k++) box(.012, .06, .03, M.dark, 1.0 + k*.42, AY + .9, az + .025, { cast: false });
    add(rbox(.9, .14, .03, .04), M.creamPlain, 1.3, AY + AH - .08, az - .12); box(3.6, .012, .01, M.dark, 2.4, AY + .2, az + .005, { cast: false }); box(.012, AH*.8, .01, M.dark, .78, AY + AH/2, az + .005, { cast: false }); box(.012, AH*.8, .01, M.dark, 3.2, AY + AH/2, az + .005, { cast: false });
    { const l = new C.PointLight(0xffa850, .6, 2.2, 2); l.position.set(1.4, AY + .85, az + .3); kit.add(l); }
    for (let k = 0; k < 7; k++) box(.2, .012, .02, M.dark, .66, AY + .55 + k*.035, az + .002, { cast: false });
    add(rbox(2.2, .16, .03, .05), M.app, 2.5, AY + AH - .2, az + .005); for (let k = 0; k < 9; k++) cyl(.012, .012, .02, M.chrome, 1.5 + k*.22, AY + AH - .2, az + .025, { rx: Math.PI/2, seg: 8, cast: false });
    box(.2, .08, .01, std({ color: 0x14130f, emissive: 0xff9a3a, emissiveIntensity: .35 }), 2.0, AY + .5, az + .01, { cast: false }); for (let k = 0; k < 3; k++) cyl(.03, .03, .03, M.dark, 2.0 + (k - 1)*.09, AY + .36, az + .01, { rx: Math.PI/2, seg: 12 });
    box(.14, .1, .005, std({ color: 0xd6573b }), 2.85, AY + .7, az + .005, { cast: false }); box(.18, .06, .005, std({ color: 0x3f6f7a }), 2.85, AY + .58, az + .005, { cast: false });
    for (let k = 0; k < 4; k++) cyl(.028, .028, .03, k === 3 ? std({ color: 0xd6573b }) : M.chrome, .62, AY + .25 + k*.13, az + .01, { rx: Math.PI/2, seg: 14 });
    cyl(.045, .045, .03, M.chrome, 2.45, AY + .5, az + .01, { rx: Math.PI/2 }); box(.14, .05, .015, std({ color: 0xf08a24, emissive: 0xf08a24, emissiveIntensity: .5 }), .7, AY + .1, az + .01, { cast: false });
    // above it: the hull's ceiling of machinery, tanks and conduits, a box with a vent, a tube light toward the front
    parent = null;
    // the ceiling plane, conduits running toward the camera, the tube light
    box(14, .1, 14, M.darkMetal, 0, CEIL + .05, -3);
    box(.05, .05, 1.8, M.tubeGlow, .8, CEIL - .12, -3.4, { cast: false }); box(.1, .06, 1.9, M.dark, .8, CEIL - .06, -3.4);
    // the hanging plant at the top left
    plant(-.62, 3.85, -.7, .7, 'trail'); cyl(.005, .005, .9, M.dark, -.62, 4.35, -.7, { cast: false });
    // the floor, the striped rug in the sun, petals and crumbs
    const fg = new C.PlaneGeometry(16, 16); fg.rotateX(-Math.PI/2); add(fg, M.floor, 0, 0, -4, { cast: false }).rotation.y = kit.rotation.y;   // (the tile rows run with the kitchen's front)
    parent = G.rug;
    { const rg = new C.PlaneGeometry(1.6, 1.25); rg.rotateX(-Math.PI/2); const m = add(rg, M.rug, .43, .006, -2.8, { cast: false }); m.rotation.y = .583;
      for (let k = 0; k < 34; k++) box(.007, .002, .05, std({ color: 0xead7a8 }), -.2 + k*.046, .008, -2.3, { cast: false }); }
    parent = null;
    for (let k = 0; k < 40; k++){ const lf = add(pick(LEAF), pick([M.fruit[0], M.fruit[4], M.leafs[3], M.bread, M.fruit[2]]), rr(-1.0, 1.2), .01, rr(-5.6, -3.8), { s: rr(.5, 1.0), cast: false }); lf.rotation.set(-Math.PI/2 + rr(-.2, .2), 0, rnd()*6); }
    // the orange chair at the left edge, the brown cabinet at the right with a bowl of fruit, a plant at its foot
    parent = G.chair;
    add(rbox(.85, .18, .8, .08), M.leather, -.4, .48, -1.3, { ry: .6 }); add(rbox(.85, .55, .16, .08), M.leather, -.68, .8, -1.5, { ry: .6 }); cyl(.03, .03, .54, M.chrome, -.4, .16, -1.3, { seg: 8 }); cyl(.2, .22, .03, M.chrome, -.4, -.095, -1.3, { seg: 20 });
    parent = G.cabinet;
    { const bx = 2.15, bz = -3.0; add(rbox(.8, .86, .7, .03), M.brownCab, bx, .43, bz); box(.74, .025, .64, M.wood, bx, .87, bz); for (let k = 0; k < 3; k++){ add(rbox(.02, .24, .62, .01), M.brownCab, bx - .41, .18 + k*.27, bz); box(.03, .02, .2, M.chrome, bx - .43, .26 + k*.27, bz); }
      for (let k = 0; k < 3; k++) box(.02, .02, .55, M.dark, bx - .41, .2 + k*.22, bz, { cast: false });
      bowl(bx - .05, .88, bz + .05, .2, 11, M.wood); plant(bx - .5, 0, bz - .55, .9, 'bush'); }
    parent = null;
    // the title sign (outside the reference's frame; seen in the wide view): on the kitchen wall past the capsule
    kit.add(box(SIGN.w + .1, SIGN.h + .1, .03, std({ color: 0x1b1d1f, roughness: .5, metalness: .4 }), SIGN.lx, SIGN.y, .015));
    const signMat = new C.MeshBasicMaterial({ map: signTex(true), transparent: true, toneMapped: false });
    const sign = new C.Mesh(new C.PlaneGeometry(SIGN.w, SIGN.h), signMat); sign.position.set(SIGN.lx, SIGN.y, .035); kit.add(sign);
    R.signMesh = sign; R.signOn = signMat.map; R.signOff = signTex(false);
    R.signLights = []; for (const [c, y] of [[0xff4fa3, SIGN.y + .1], [0x2bdc6c, SIGN.y - .1]]){ const l = new C.PointLight(c, .8, 1.6, 2); l.position.set(SIGN.lx, y, .35); kit.add(l); R.signLights.push(l); }
  }


  /* ---------- the second pass of detail: the porthole's bulkhead, the wall over the capsule, the ceiling's ribs, the cabinet's face ---------- */
  function buildDetail(){
    const W = WIN, Y = WC.y, RF = W.rf;
    // the porthole: a heavy chrome lip, a ring of cream bulkhead plates with seams, bolts and labels on the bulge, a second fine rim outside
    parent = hull;
    add(new C.TorusGeometry(RF + .02, .075, 16, 220), M.chrome, 0, Y, .1, { cast: false });
    const NP = 18;
    for (let k = 0; k < NP; k++){
      const a0 = k/NP*Math.PI*2 + .012, a1 = (k + 1)/NP*Math.PI*2 - .012;
      add(new C.RingGeometry(RF + .1, RF + .34, 6, 1, a0, a1 - a0), k % 5 === 2 ? M.creamPlain : M.cream, 0, Y, .19, { cast: false });
      const am = (a0 + a1)/2, c = Math.cos(am), sn = Math.sin(am);
      for (const d of [-.08, .08]){ const aa = am + d; cyl(.014, .014, .02, M.dark, Math.cos(aa)*(RF + .3), Y + Math.sin(aa)*(RF + .3), .2, { rx: Math.PI/2, cast: false, seg: 6 }); }
      if (k % 3 === 0){ const lb = box(.16, .045, .006, std({ color: k % 2 ? 0x2c2a26 : 0xd6573b, roughness: .6 }), c*(RF + .2), Y + sn*(RF + .2), .2, { cast: false }); lb.rotation.z = am + Math.PI/2; }
    }
    add(new C.TorusGeometry(RF + .66, .025, 8, 220), M.chrome, 0, Y, .06, { cast: false });
    add(new C.TorusGeometry(RF + .36, .02, 8, 220), M.dark, 0, Y, .2, { cast: false });
    // more of the sleeve's furniture: recessed dark slots and cream brackets between the ribs
    for (let k = 0; k < 32; k++){ if (k % 2) continue; const a = (k + .5)/32*Math.PI*2, z = -W.depth*.3, r = RF + (W.r2 - RF)*.3/.8*.8 - .01;
      const p = box(.14, .012, .16, k % 6 === 0 ? M.lampGlow : M.dark, Math.cos(a)*r, Y + Math.sin(a)*r, z, { cast: false }); p.rotation.z = a + Math.PI/2; }
    // the wall over the capsule: olive plates with seams, a cream housing along the top, vents, risers and a cable run
    parent = kit;
    for (let y = 2.95, row = 0; y < CEIL - .2; y += .62, row++) for (let x = -.25 + (row % 2)*.45; x < 4.8; x += .92){
      const w = Math.min(.88, 4.8 - x); if (w < .2) continue;
      add(rbox(w, .58, .03, .02), rnd() < .2 ? M.darkMetal : M.hull, x + w/2, y + .29, .03, { cast: false });
      if (rnd() < .3) for (let i = 0; i < 6; i++) box(w*.5, .012, .015, M.dark, x + w/2, y + .15 + i*.05, .055, { cast: false });
      if (rnd() < .25) box(.1, .05, .02, M.lampGlow, x + .15, y + .45, .05, { cast: false });
    }
    { const hg = new C.CylinderGeometry(.3, .3, 4.3, 32, 1, false, 0, Math.PI); hg.rotateZ(Math.PI/2); hg.rotateX(Math.PI/2); add(hg, M.cream, 2.4, 2.98, .32);
      for (let x = .5; x < 4.5; x += .5) add(new C.TorusGeometry(.305, .012, 6, 24, Math.PI), M.dark, x, 2.98, .32, { ry: Math.PI/2, cast: false }); }
    for (const [x, m] of [[.22, M.chrome], [.3, M.copper], [4.6, M.steel]]) cyl(.025, .025, CEIL - 1.0, m, x, 1.0 + (CEIL - 1.0)/2, .1, { seg: 10 });
    pipe([[-.2, 3.5, .18], [1.2, 3.35, .2], [2.6, 3.42, .2], [4.8, 3.55, .18]], .03, M.rubber, 4); pipe([[-.2, 3.62, .16], [2.0, 3.5, .18], [4.8, 3.66, .16]], .02, M.copper, 3);
    // the brown cabinet's face: drawers and a dark door panel with chrome pulls; the counter's chrome trims; more fruit along the counter
    parent = G.cabinet; { const cx = 2.15, cz = -3.0;   // (built where the cabinet stood before the arrangement; the pivot then moves it with the rest)
    for (const y of [.62, .74]) box(.72, .012, .012, M.dark, cx, y, cz + .356, { cast: false });
    for (const y of [.68, .8]) box(.22, .025, .03, M.chrome, cx, y, cz + .37);
    box(.6, .44, .012, std({ color: 0x24170f, roughness: .4, metalness: .3 }), cx, .3, cz + .356, { cast: false }); box(.03, .18, .03, M.chrome, cx + .22, .33, cz + .37);
    for (const x of [-.36, .36]) box(.05, .05, .6, M.dark, cx + x, .02, cz, { cast: false }); }
    parent = kit;
    box(4.18, .015, .015, M.chrome, 2.11, .87, .7, { cast: false }); box(4.18, .02, .02, M.chrome, 2.11, .09, .66, { cast: false });
    for (const [x, z] of [[.15, .4], [1.65, .3], [2.3, .58], [3.6, .45], [4.0, .55]]) fruitPlate(x, .945, z, .13, 8);
    parent = null;
  }

  /* ---------- the ceiling: a cove along the porthole wall carrying a bundle of pipes over the window, a conduit arching round
     the ring's top, coffered hull panels crossing the room, and a row of machinery housings along the kitchen wall's top ---------- */
  function buildCeiling(){
    const W = WIN, Y = WC.y, RF = W.rf, L0 = -6, L1 = RF + 1.4;
    parent = hull;
    box(L1 - L0, .05, .75, M.hull, (L0 + L1)/2, CEIL - .26, .26, { cast: false, rx: -Math.PI/4 }); box(L1 - L0, .03, .03, M.dark, (L0 + L1)/2, CEIL - .53, .02, { cast: false });   // (a chamfered soffit where the wall meets the ceiling)
    for (let i = 0; i < 6; i++){ const y = CEIL - .58 - (i % 3)*.11, z = .42 + Math.floor(i/3)*.16 + (i % 3)*.03;
      pipe([[L0, y, z], [-2, y, z], [0, y - .02, z], [2, y, z], [L1, y, z]], [.045, .03, .022, .05, .028, .02][i], [M.cream, M.copper, M.steel, M.darkMetal, M.chrome, M.rubber][i], 7); }
    for (let x = -5.6; x < L1; x += .7) box(.06, .4, .34, M.darkMetal, x, CEIL - .62, .52);
    { const pts = []; for (let k = 0; k <= 24; k++){ const a = .25 + k/24*(Math.PI - .5); pts.push([Math.cos(a)*(RF + .95), Y + Math.sin(a)*(RF + .95), .3]); }
      pipe(pts, .07, M.cream, 0); for (let k = 1; k < 24; k += 2){ const a = .25 + k/24*(Math.PI - .5); add(new C.TorusGeometry(.075, .014, 6, 16), M.dark, Math.cos(a)*(RF + .95), Y + Math.sin(a)*(RF + .95), .3, { cast: false }).rotation.set(0, Math.PI/2, a); } }
    for (const [x, w] of [[-2.9, .5], [2.75, .42], [-4.2, .36]]){ add(rbox(w, .34, .26, .03), M.darkMetal, x, CEIL - .95, .18); box(w*.6, .04, .02, M.lampGlow, x, CEIL - .86, .32, { cast: false }); }
    // coffers: ribs from the porthole wall across the room, panels and vents between them
    for (let x = -5.2; x < L1 + .4; x += .95){ box(.14, .22, 6.2, M.hull, x, CEIL - .11, 3.6, { cast: false }); box(.18, .03, 6.2, M.dark, x, CEIL - .235, 3.6, { cast: false }); }
    for (let x = -4.72; x < L1; x += .95) for (let z = 1.2; z < 6.6; z += .75){
      const r = rnd();
      if (r < .45) box(.72, .025, .6, M.cream, x, CEIL - .03, z, { cast: false });
      else if (r < .7){ box(.6, .02, .5, M.dark, x, CEIL - .02, z, { cast: false }); for (let i = 0; i < 5; i++) box(.56, .015, .03, M.darkMetal, x, CEIL - .05, z - .2 + i*.1, { cast: false }); }
      else if (r < .85){ add(rbox(.5, .14, .4, .03), M.darkMetal, x, CEIL - .1, z); box(.14, .02, .08, M.lampGlow, x, CEIL - .18, z, { cast: false }); }
    }
    // the kitchen wall's top: housings, vents, a dark bay with a lamp, a cable tray
    parent = kit;
    for (let x = -.2, k = 0; x < 4.8; k++){ const w = [.7, .45, .9, .55, .8, .6, .75][k % 7]; if (x + w > 4.8) break;
      add(rbox(w - .04, .5, .55, .04), k % 3 === 1 ? M.creamPlain : M.darkMetal, x + w/2, CEIL - .32, .3);
      if (k % 2 === 0) for (let i = 0; i < 6; i++) box((w - .04)*.7, .012, .01, M.dark, x + w/2, CEIL - .48 + i*.04, .58, { cast: false });
      if (k % 3 === 2){ box(w*.6, .25, .05, M.dark, x + w/2, CEIL - .3, .57, { cast: false }); box(.12, .05, .03, M.lampGlow, x + w/2, CEIL - .34, .6, { cast: false }); }
      x += w; }
    box(5, .04, .3, M.steel, 2.3, CEIL - .62, .62, { cast: false }); pipe([[-.2, CEIL - .66, .7], [2.3, CEIL - .72, .72], [4.8, CEIL - .66, .7]], .025, M.rubber, 5);
    parent = null;
  }
  R.build = sc => {
    scene = sc; seed = 23;
    scene.add(hull); scene.add(kit); for (const g of Object.values(G)) scene.add(g); buildHull(); buildKitchen(); buildDetail(); buildCeiling();
    const pivot = (g, x, z) => { for (const c of g.children){ c.position.x -= x; c.position.z -= z; } g.position.set(x, 0, z); };
    pivot(G.table, -.64, -2.27); pivot(G.chair, -.4, -1.3); pivot(G.cabinet, 2.15, -3.0); pivot(G.rug, .43, -2.8);
    // the owner's arrangement (from the arranging tool), nudged where pieces would clip
    const put = (g, x, y, z, turn, size) => { g.position.set(x, y, z); g.rotation.y = turn*Math.PI/180; g.scale.setScalar(size); g.updateMatrixWorld(true); };
    put(G.chair, -.4, .11, -1.39, 135.5, 1); put(G.cabinet, 2.15, 0, -2.96, -11.5, 1.31); put(G.rug, .12, 0, -4.18, 129.5, 1.05);
    if (R.L) R.reaim();
    R.parts = { kitchen: kit, window: hull, table: G.table, chair: G.chair, cabinet: G.cabinet, rug: G.rug };
    box(.3, 6, 16, M.dark, -4.2, 2, -4); box(16, 6, .3, M.dark, 0, 2, -8.5);   // (the shell outside: the sun only comes in by the window)
  };

  /* ---------- light ---------- */
  R.light = sc => {
    const wc = R.winCenter(), n = R.winNormal();
    const sun = new C.DirectionalLight(0xffd49a, 5.2);
    // from outside, up and to the left of the window's axis, onto the table and the rug
    sun.target.position.set(.5, 0, -2.8); sun.position.copy(wc).add(wc.clone().sub(sun.target.position).normalize().multiplyScalar(9));
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .012;
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .5, far: 30 });
    sc.add(sun, sun.target); R.L = { sun };
    sc.add(new C.HemisphereLight(0xffd8a0, 0x3a4a44, .07)); sc.add(new C.AmbientLight(0x6a5030, .02));
    const b1 = new C.PointLight(0xffc080, 1.2, 4.5, 2); b1.position.set(.43, .3, -2.8); sc.add(b1);
    const b2 = new C.PointLight(0xffd090, .8, 4, 2); b2.position.copy(wc).addScaledVector(n, 1.2).add(new C.Vector3(0, -.7, 0)); sc.add(b2); R.L.b2 = b2;
    const b3 = new C.SpotLight(0xffc888, 3.4, 9, .7, .9, 2); R.L.b3 = b3; b3.position.copy(wc).addScaledVector(n, .6); b3.target.position.set(1.92, 1.0, -4.51); sc.add(b3, b3.target);
    const b4 = new C.PointLight(0xffb870, .9, 4, 2); b4.position.copy(wc).addScaledVector(n, .5).add(new C.Vector3(0, 1.4, 0)); sc.add(b4); R.L.b4 = b4;
    const b5 = new C.PointLight(0xffb070, .9, 3.2, 2); b5.position.set(.8, 4.25, -3.6); b5.intensity = 1.3; b5.distance = 4.5; sc.add(b5);
    // the sunlit room's bounce onto the kitchen's front (it faces away from the window, so the sun never reaches it directly)
    const fill = new C.DirectionalLight(0xfff0d8, .5); fill.position.set(-3, 3.2, -1.5); fill.target.position.set(2, .9, -6); sc.add(fill, fill.target);
    R.reaim(); b1.position.set(G.rug.position.x, .3, G.rug.position.z);
    return sun;
  };
  // re-aims the window's lights after the pieces move (the arranging tool calls it)
  R.reaim = () => {
    if (!R.L) return; const wc = R.winCenter(), n = R.winNormal(), L = R.L;
    L.sun.target.position.set(G.rug.position.x, 0, G.rug.position.z); L.sun.position.copy(wc).add(wc.clone().sub(L.sun.target.position).normalize().multiplyScalar(9));
    L.b2.position.copy(wc).addScaledVector(n, 1.2).add(new C.Vector3(0, -.7, 0)); L.b4.position.copy(wc).addScaledVector(n, .5).add(new C.Vector3(0, 1.4, 0));
    L.b3.position.copy(wc).addScaledVector(n, .6); kit.updateMatrixWorld(true); L.b3.target.position.copy(new C.Vector3(2, 1, .68).applyMatrix4(kit.matrixWorld));
  };
  R.cubeAt = [.6, 1.4, -3.4];
  return R;
})();
