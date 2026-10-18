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
  const kit = new C.Group(); kit.position.set(-.05, 0, -5.74); kit.rotation.y = -19.5*Math.PI/180; kit.updateMatrixWorld(true);   // (the owner's placement, slid .3 m along its run so the porthole's bulge clears its left end; pushed back against the far wall, turned to face the window)
  const toWorld = (x, y, z) => { hull.updateMatrixWorld(true); return new C.Vector3(x, y, z).applyMatrix4(hull.matrixWorld); };
  // the movable pieces (the arranging tool moves these groups; each turns about its own centre)
  const G = { table: new C.Group(), chair: new C.Group(), cabinet: new C.Group(), rug: new C.Group() };
  R.WIN = WIN; R.CEIL = CEIL;
  R.winCenter = () => toWorld(0, WC.y, -WIN.depth);
  R.winTop = () => toWorld(0, WC.y + WIN.r2, -WIN.depth);
  R.winNormal = () => new C.Vector3(Math.sin(hull.rotation.y), 0, Math.cos(hull.rotation.y));
  const SIGN = { x: 2.45, y: 3.08, z: .09, w: 1.1, h: .42 };   // (in the kitchen's frame here; turned into world numbers for the bake's anchors below)
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
    for (let k = 0; k < 8; k++){ const x = (k + .5)/8*w; rivet(g, gh, x - 40, 14, 3, 'rgba(120,100,70,.8)'); rivet(g, gh, x + 40, h - 14, 3, 'rgba(120,100,70,.8)'); }
  }, [1, 1]);
  const enamelT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#ebe5d4'; g.fillRect(0, 0, w, h); stains(g, w, h, 8, 'rgba(160,130,90,.07)'); specks(g, w, h, 160, ['rgba(110,90,60,.18)', 'rgba(255,255,255,.3)'], .6, 1.4); scratches(g, w, h, 12, 'rgba(150,130,100,.15)');
    for (let i = 0; i < 0; i++){ g.fillStyle = 'rgba(90,70,45,.55)'; g.beginPath(); g.arc(rnd()*w, rnd()*h, rr(1, 3), 0, 7); g.fill(); }
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
    g.fillStyle = '#2a2d2b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 170){ let x = (y/170) % 2 ? -110 : 0; while (x < w){ const tw = pick([170, 230, 290, 340]);
      g.fillStyle = pick(['#6b716c', '#62695f', '#757a72', '#5c625c', '#6e7468', '#666b63']); g.fillRect(x + 4, y + 4, tw - 8, 162);
      const gr = g.createLinearGradient(x, y, x + tw, y + 170); gr.addColorStop(0, 'rgba(255,255,240,.08)'); gr.addColorStop(1, 'rgba(10,20,20,.12)'); g.fillStyle = gr; g.fillRect(x + 4, y + 4, tw - 8, 162);
      gh.fillStyle = '#909090'; gh.fillRect(x + 4, y + 4, tw - 8, 162); x += tw; } }
    specks(g, w, h, 9000, ['rgba(20,30,28,.3)', 'rgba(230,240,230,.14)', 'rgba(120,100,70,.16)'], 1, 2.6); stains(g, w, h, 70, 'rgba(30,25,15,.2)', 20, 110); stains(g, w, h, 30, 'rgba(90,70,40,.15)', 10, 40); scratches(g, w, h, 140, 'rgba(220,235,225,.22)');
  }, [6, 6]);
  const splashT = texSet(512, 512, (g, gh, w, h) => {
    g.fillStyle = '#1d1c18'; g.fillRect(0, 0, w, h); gh.fillStyle = '#404040'; gh.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y/32) % 2 ? -32 : 0; x < w; x += 64){ g.fillStyle = pick(['#3a3a30', '#353528', '#40402f', '#2f3129', '#45432f']); g.fillRect(x + 2, y + 2, 60, 28);
      g.fillStyle = 'rgba(255,245,215,.07)'; g.fillRect(x + 3, y + 3, 56, 5); gh.fillStyle = '#a0a0a0'; gh.fillRect(x + 2, y + 2, 60, 28); }
    stains(g, w, h, 20, 'rgba(120,90,50,.15)'); specks(g, w, h, 900, ['rgba(220,200,160,.15)', 'rgba(0,0,0,.2)'], .8, 2);
  }, [1, 1]);
  const skinT = texSet(1024, 512, (g, gh, w, h) => {   // the capsule's skin: cream enamel, grime in the seams, chips, fine scratches
    g.fillStyle = '#e2d8bd'; g.fillRect(0, 0, w, h); stains(g, w, h, 50, 'rgba(150,115,70,.13)', 10, 80); stains(g, w, h, 20, 'rgba(255,252,240,.18)', 20, 90);
    specks(g, w, h, 2500, ['rgba(110,85,50,.3)', 'rgba(255,255,250,.35)'], .6, 1.8); scratches(g, w, h, 120, 'rgba(140,115,80,.3)');
    for (let i = 0; i < 40; i++){ g.fillStyle = 'rgba(95,75,50,.55)'; g.beginPath(); g.arc(rnd()*w, rnd()*h, rr(.8, 2.4), 0, 7); g.fill(); }
    drips(g, w, h, 18, 'rgba(120,90,50,.14)');
  }, [1, 3]);
  const dimpleT = texSet(128, 128, (g, gh, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++){ const x = rnd()*w, y = rnd()*h; g.fillStyle = 'rgba(200,160,120,.25)'; g.fillRect(x, y, 1.4, 1.4); gh.fillStyle = '#606060'; gh.fillRect(x, y, 1.5, 1.5); } }, [2, 2]);
  const labelT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
    glyphs(g, 10, 14, 5, 34, 'rgba(60,52,44,.9)'); fineText(g, 220, 18, 120, 2, 'rgba(60,52,44,.8)', 5); g.fillStyle = 'rgba(60,52,44,.9)'; g.fillRect(380, 22, 40, 4); glyphs(g, 430, 14, 2, 30, 'rgba(60,52,44,.9)');
    const t = new C.CanvasTexture(c); t.encoding = C.sRGBEncoding; return t; })();
  const planksT = texSet(1024, 1024, (g, gh, w, h) => {   // the table top: six walnut boards, long grain, knots, worn satin
    const pw = w/6; for (let k = 0; k < 6; k++){ g.fillStyle = pick(['#5a3218', '#633a1d', '#55301a', '#6b3f20']); g.fillRect(k*pw, 0, pw, h);
      for (let i = 0; i < 70; i++){ const x = k*pw + rnd()*pw; g.strokeStyle = i % 2 ? 'rgba(30,14,4,.45)' : 'rgba(170,105,55,.22)'; g.lineWidth = rr(.6, 2.2); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rr(-8, 8), h*.3, x + rr(-8, 8), h*.6, x + rr(-6, 6), h); g.stroke(); gh.strokeStyle = i % 2 ? '#707070' : '#909090'; gh.lineWidth = 1; gh.beginPath(); gh.moveTo(x, 0); gh.lineTo(x, h); gh.stroke(); }
      if (rnd() < .6){ const kx = k*pw + rr(.2, .8)*pw, ky = rnd()*h; for (let r = 14; r > 2; r -= 3){ g.strokeStyle = 'rgba(35,15,5,.35)'; g.beginPath(); g.ellipse(kx, ky, r*.6, r*1.6, 0, 0, 7); g.stroke(); } }
      g.fillStyle = 'rgba(20,8,2,.8)'; g.fillRect(k*pw, 0, 2, h); gh.fillStyle = '#202020'; gh.fillRect(k*pw - 1, 0, 3, h); }
    stains(g, w, h, 10, 'rgba(255,220,170,.06)', 40, 160); stains(g, w, h, 8, 'rgba(20,8,2,.12)', 10, 40);
  }, [1, 1]);
  const topT = texSet(1024, 256, (g, gh, w, h) => { g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h); specks(g, w, h, 1800, ['rgba(160,150,130,.18)', 'rgba(255,255,255,.4)', 'rgba(120,110,95,.12)'], .6, 1.6); }, [3, 1]);
  const lcdT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');   // the oven's screen: a clock, a set temperature, a timer bar, small status marks
    g.fillStyle = '#0c0f0b'; g.fillRect(0, 0, 512, 256);
    const seg = (x, y, s, d) => { const S = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }[d], L = s*.55, T = s*.12;
      const P = { a: [x + T, y, L, T], b: [x + L + T, y + T, T, L], c: [x + L + T, y + L + 2*T, T, L], d: [x + T, y + 2*L + 2*T, L, T], e: [x, y + L + 2*T, T, L], f: [x, y + T, T, L], g: [x + T, y + L + T, L, T] };
      for (const k of 'abcdefg'){ g.fillStyle = S.includes(k) ? '#ffb34a' : 'rgba(255,179,74,.07)'; g.fillRect(...P[k]); } };
    [0, 7].forEach((d, i) => seg(30 + i*70, 40, 100, d)); g.fillStyle = '#ffb34a'; g.fillRect(172, 75, 10, 10); g.fillRect(172, 115, 10, 10); [4, 2].forEach((d, i) => seg(200 + i*70, 40, 100, d));
    g.font = 'bold 30px monospace'; g.fillStyle = '#7fd38a'; g.fillText('180°', 370, 80); g.font = '18px monospace'; g.fillStyle = 'rgba(127,211,138,.7)'; g.fillText('BAKE  FAN', 370, 112);
    g.strokeStyle = 'rgba(255,179,74,.6)'; g.strokeRect(30, 190, 452, 18); g.fillStyle = '#ffb34a'; g.fillRect(33, 193, 300, 12);
    for (let i = 0; i < 6; i++){ g.fillStyle = i < 2 ? '#7fd38a' : 'rgba(127,211,138,.2)'; g.fillRect(370 + i*20, 140, 12, 12); }
    for (let y = 0; y < 256; y += 3){ g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, 512, 1); }
    const t = new C.CanvasTexture(c); t.encoding = C.sRGBEncoding; return t; })();
  // fruit skins, drawn with their own random source (so adding them doesn't reshuffle the room): colour, blush, streaks,
  // lenticels and pores, each with a matching height map for the bump. Canvas top is the fruit's top (stem end).
  const FR = (() => { let q = 7; return () => (q = (q*16807) % 2147483647)/2147483647; })(), fr = (a, b) => a + FR()*(b - a);
  function skin(kind){
    const w = 512, h = 512, cc = document.createElement('canvas'), hc = document.createElement('canvas'); cc.width = hc.width = w; cc.height = hc.height = h;
    const g = cc.getContext('2d'), gh = hc.getContext('2d'); gh.fillStyle = '#808080'; gh.fillRect(0, 0, w, h);
    const band = (n, f) => { const ph = [fr(0, 6.3), fr(0, 6.3), fr(0, 6.3)]; return x => { const u = x/w*Math.PI*2; return Math.max(0, Math.min(1, .5 + .5*(Math.sin(u + ph[0]) + .5*Math.sin(2*u + ph[1]) + .3*Math.sin(3*u + ph[2]))*f)); }; };
    const vgrad = (stops) => { const lg = g.createLinearGradient(0, 0, 0, h); for (const [t, c] of stops) lg.addColorStop(t, c); g.fillStyle = lg; g.fillRect(0, 0, w, h); };
    const streaks = (col, amt, n, wmin, wmax) => { for (let i = 0; i < n; i++){ const x = fr(0, w), a = amt(x); if (a < .05) continue; g.strokeStyle = col(a*fr(.6, 1)); g.lineWidth = fr(wmin, wmax); g.beginPath(); g.moveTo(x, fr(0, h*.15)); g.bezierCurveTo(x + fr(-8, 8), h*.4, x + fr(-8, 8), h*.7, x + fr(-6, 6), fr(h*.85, h)); g.stroke(); } };
    const dots = (n, col, r0, r1, bump, y0 = 0, y1 = 1) => { for (let i = 0; i < n; i++){ const x = fr(0, w), y = fr(y0*h, y1*h), r = fr(r0, r1); g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r*fr(.6, 1), 0, 0, 7); g.fill(); if (bump){ gh.fillStyle = bump; gh.beginPath(); gh.arc(x, y, r*1.1, 0, 7); gh.fill(); } } };
    const blotch = (n, col, r0, r1) => { for (let i = 0; i < n; i++){ const x = fr(0, w), y = fr(0, h), r = fr(r0, r1), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2*r, 2*r); } };
    let rough = .45;
    if (kind === 'apple'){ const red = band(1, 1.3);
      vgrad([[0, '#c9b04a'], [.3, '#d8c060'], [1, '#c8a848']]);
      for (let x = 0; x < w; x += 2){ g.fillStyle = 'rgba(186,48,28,' + (red(x)*.9).toFixed(3) + ')'; g.fillRect(x, 0, 2, h); }
      streaks(a => 'rgba(150,24,14,' + (a*.35).toFixed(3) + ')', red, 140, .6, 2.5); blotch(16, 'rgba(120,20,10,.18)', 20, 70); streaks(a => 'rgba(230,190,80,' + ((1 - a)*.3).toFixed(3) + ')', x => 1 - red(x), 80, 1, 3);
      vgrad([[0, 'rgba(210,190,80,.75)'], [.14, 'rgba(210,190,80,0)'], [.9, 'rgba(120,80,30,0)'], [1, 'rgba(120,80,30,.5)']]);
      dots(260, 'rgba(240,220,150,.85)', .8, 1.8, '#9a9a9a', .1, .95); rough = .32; }
    else if (kind === 'pear'){ const blush = band(1, .9);
      vgrad([[0, '#a8a040'], [.5, '#cdbb58'], [1, '#c8a850']]);
      for (let x = 0; x < w; x += 2){ g.fillStyle = 'rgba(196,90,50,' + (blush(x)*.55).toFixed(3) + ')'; g.fillRect(x, 0, 2, h); }
      blotch(14, 'rgba(140,100,40,.25)', 10, 40); dots(900, 'rgba(110,80,40,.5)', .6, 1.4, '#909090'); dots(30, 'rgba(90,60,30,.6)', 2, 4, '#707070'); rough = .55; }
    else if (kind === 'redpear'){ vgrad([[0, '#7a1a14'], [.5, '#a8281c'], [1, '#8e2018']]); streaks(a => 'rgba(200,90,50,' + (a*.25).toFixed(3) + ')', band(1, 1), 160, 1, 3); dots(500, 'rgba(220,170,120,.45)', .6, 1.3, '#909090'); rough = .38; }
    else if (kind === 'orange'){ vgrad([[0, '#d8620c'], [.5, '#ec7a14'], [1, '#d86810']]); blotch(20, 'rgba(255,170,60,.18)', 20, 60); blotch(10, 'rgba(160,60,10,.15)', 20, 50);
      for (let i = 0; i < 9000; i++){ const x = fr(0, w), y = fr(0, h); gh.fillStyle = FR() < .5 ? '#5a5a5a' : '#a0a0a0'; gh.fillRect(x, y, 2, 2); g.fillStyle = FR() < .5 ? 'rgba(150,60,10,.18)' : 'rgba(255,190,90,.14)'; g.fillRect(x, y, 1.5, 1.5); } rough = .5; }
    else if (kind === 'lemon'){ vgrad([[0, '#c8b420'], [.5, '#ecd23a'], [1, '#d0b828']]); blotch(10, 'rgba(160,170,40,.2)', 20, 50);
      for (let i = 0; i < 8000; i++){ const x = fr(0, w), y = fr(0, h); gh.fillStyle = FR() < .5 ? '#5a5a5a' : '#a8a8a8'; gh.fillRect(x, y, 2, 2); } rough = .42; }
    else if (kind === 'pomegranate'){ vgrad([[0, '#8a1c12'], [.5, '#a82618'], [1, '#801a10']]); blotch(26, 'rgba(200,150,80,.28)', 8, 30); blotch(20, 'rgba(60,8,4,.25)', 10, 40);
      for (let i = 0; i < 7000; i++){ const x = fr(0, w), y = fr(0, h); gh.fillStyle = FR() < .5 ? '#606060' : '#a0a0a0'; gh.fillRect(x, y, 2, 2); } rough = .3; }
    else if (kind === 'mango'){ const red = band(1, 1.4); vgrad([[0, '#7a9a2a'], [.5, '#c8b030'], [1, '#e08a24']]);
      for (let x = 0; x < w; x += 2){ g.fillStyle = 'rgba(200,70,30,' + (red(x)*.6).toFixed(3) + ')'; g.fillRect(x, 0, 2, h); }
      dots(1400, 'rgba(240,220,130,.5)', .5, 1.1, '#909090'); rough = .4; }
    const mk = (c, srgb) => { const t = new C.CanvasTexture(c); if (srgb) t.encoding = C.sRGBEncoding; t.anisotropy = 8; return t; };
    return std({ map: mk(cc, true), bumpMap: mk(hc), bumpScale: kind === 'orange' || kind === 'lemon' || kind === 'pomegranate' ? .0012 : .0006, roughness: rough, metalness: 0 });
  }
  const rugT = texSet(512, 512, (g, gh, w, h) => {
    const cols = ['#ead7a8', '#d9a84a', '#ead7a8', '#c8742e', '#f0e2bc', '#7a4a24'];
    for (let y = 0, k = 0; y < h; k++){ const sw = pick([22, 30, 14, 36]); g.fillStyle = cols[k % cols.length]; g.fillRect(0, y, w, sw); y += sw; }
    for (let x = 0; x < w; x += 3){ g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, 0, 1, h); gh.fillStyle = '#707070'; gh.fillRect(x, 0, 1, h); }
    specks(g, w, h, 2500, ['rgba(70,40,15,.2)', 'rgba(255,245,215,.22)'], 1, 2);
  });
  const woodT = texSet(512, 256, (g, gh, w, h) => {
    g.fillStyle = '#6a3a1c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++){ const y = rnd()*h; g.strokeStyle = i % 2 ? 'rgba(35,15,5,.5)' : 'rgba(200,130,70,.3)'; gh.strokeStyle = i % 2 ? '#606060' : '#a0a0a0'; g.lineWidth = rr(.6, 2.4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w*.3, y + rr(-6, 6), w*.6, y + rr(-6, 6), w, y + rr(-5, 5)); g.stroke(); }
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
  function pom(mat, scale, steps = 32){
    mat.onBeforeCompile = sh => {
      sh.uniforms.pomScale = { value: scale };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float pomScale;\nvec2 pomUv;')
        .replace('#include <bumpmap_pars_fragment>', C.ShaderChunk.bumpmap_pars_fragment.replace(/vUv/g, 'pomUv'))
        .replace('#include <map_fragment>', `{
          vec3 vp = -vViewPosition; vec3 dp1 = dFdx(vp), dp2 = dFdy(vp); vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
          vec3 Nn = normalize(vNormal); vec3 dp2p = cross(dp2, Nn), dp1p = cross(Nn, dp1);
          vec3 Tt = dp2p*du1.x + dp1p*du2.x, Bt = dp2p*du1.y + dp1p*du2.y; float im = inversesqrt(max(max(dot(Tt, Tt), dot(Bt, Bt)), 1e-12)); Tt *= im; Bt *= im;
          vec3 Vv = normalize(vViewPosition); vec3 Vt = vec3(dot(Vv, Tt), dot(Vv, Bt), dot(Vv, Nn));
          const float NS = ${steps}.; vec2 dd = Vt.xy/max(Vt.z, .2)*pomScale/NS; vec2 uv = vUv; float layer = 0.; float hh = 1. - textureGrad(bumpMap, uv, du1, du2).r;
          for (int i = 0; i < ${steps}; i++){ if (layer >= hh) break; uv -= dd; layer += 1./NS; hh = 1. - textureGrad(bumpMap, uv, du1, du2).r; }
          vec2 pv = uv + dd; float af = hh - layer, bf = (1. - textureGrad(bumpMap, pv, du1, du2).r) - layer + 1./NS; pomUv = mix(uv, pv, clamp(af/(af - bf + 1e-5), 0., 1.));
        }\n` + C.ShaderChunk.map_fragment.replace(/vUv/g, 'pomUv'));
    };
    mat.customProgramCacheKey = () => 'pom' + scale + '/' + steps; return mat;
  }
  const M = {
    hull: withBump(hullT, { roughness: .7, metalness: .15 }, .02), cream: withBump(creamT, { roughness: .4, metalness: .25 }, .012), creamPlain: std({ color: 0xe3d8bd, roughness: .42, metalness: .25 }),
    enamel: withBump(enamelT, { roughness: .16, metalness: 0 }, .003), counterEdge: std({ map: counterEdgeT.map, roughness: .3 }), app: withBump(appT, { roughness: .38, metalness: .2 }, .006),
    floor: withBump(floorT, { roughness: .93, metalness: 0 }, .035), rug: withBump(rugT, { roughness: .95 }, .03), wood: withBump(woodT, { roughness: .52, metalness: 0 }, .02), darkMetal: withBump(darkMetalT, { roughness: .55, metalness: .5 }, .02),
    steel: withBump(metalT, { roughness: .3, metalness: .65 }, .002), chrome: std({ color: 0xf0ece0, roughness: .22, metalness: .72 }), copper: std({ color: 0xc0784a, roughness: .28, metalness: .9 }),
    brass: std({ color: 0xc8994e, roughness: .3, metalness: .9 }), dark: std({ color: 0x24201c, roughness: .55, metalness: .4 }), blackGlass: std({ color: 0x14130f, roughness: .06, metalness: .5 }),
    rubber: std({ color: 0x2e2a26, roughness: .85 }), splash: withBump(splashT, { roughness: .25, metalness: .2 }, .01), glass: std({ color: 0xf0f2e8, roughness: .04, metalness: .1, transparent: true, opacity: .32 }), ceramic: std({ color: 0xf1ebdc, roughness: .18 }),
    pot: std({ color: 0xa8583a, roughness: .85 }), soil: std({ color: 0x3a2a1e, roughness: 1 }), basket: std({ color: 0xb0884e, roughness: .95 }),
    towel: std({ map: towelT.map, roughness: .95, side: C.DoubleSide }), leather: withBump(leatherT, { roughness: .55 }, .01), brownCab: std({ map: woodT.map, bumpMap: woodT.bump, bumpScale: .01, color: 0xc49a80, roughness: .45, metalness: .25 }),
    lampGlow: new C.MeshBasicMaterial({ color: 0xffc06a, toneMapped: false }), tubeGlow: new C.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false }),
    leafs: [0x3f6f3a, 0x557f3c, 0x2e5a30, 0x6f9a4a, 0x4d7a3a, 0x86a65a].map(c => std({ color: c, roughness: .55, side: C.DoubleSide })),
    fruit: [0xf08a24, 0xf2a62a, 0xd8432a, 0xe8c547, 0xe07a2a, 0xb84a2a].map(c => std({ color: c, roughness: .38 })),
    pendant: std({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 0, roughness: .4 }), downlight: new C.MeshBasicMaterial({ color: 0x8a8070, toneMapped: false }),
    bread: std({ color: 0xc07a3a, roughness: .75 }), crumb: std({ color: 0xead2a0, roughness: .9 }), calyx: std({ color: 0x5a6a2a, roughness: .8 }), gold: std({ color: 0xc8a050, roughness: .3, metalness: .8 }),
    tableWood: std({ map: planksT.map, bumpMap: planksT.bump, bumpScale: .006, roughness: .74, metalness: 0 }), darkWood: std({ map: woodT.map, color: 0x6a5048, roughness: .7, metalness: 0 }),
    counterTop: std({ map: topT.map, roughness: .28, metalness: 0 }), lcd: new C.MeshBasicMaterial({ map: lcdT, toneMapped: false, color: 0xd8d8d8 }),
    skin: withBump(skinT, { roughness: .42, metalness: .12 }, .004),
    stem: std({ color: 0x5a3a1c, roughness: .8 }), orange: std({ color: 0xe0600a, roughness: .55, bumpMap: dimpleT.bump, bumpScale: .004 }), lemon: std({ color: 0xf0c935, roughness: .5, bumpMap: dimpleT.bump, bumpScale: .004 }),
    juice: std({ color: 0xf59a1e, roughness: .2, transparent: true, opacity: .9 }), jam: std({ color: 0x8e1f1a, roughness: .2 }), butter: std({ color: 0xf3df9a, roughness: .6 }),
    glazeTeal: std({ color: 0x3f6f7a, roughness: .25 }), glazeWhite: std({ color: 0xece6d6, roughness: .2 }), glazeOchre: std({ color: 0xc58a3a, roughness: .3 }),
    barGlow: new C.MeshBasicMaterial({ color: 0xffd896, toneMapped: false }), dimAmber: new C.MeshBasicMaterial({ color: 0x8a5a20, toneMapped: false }), dimGreen: new C.MeshBasicMaterial({ color: 0x3f7a4a, toneMapped: false }),
    label: new C.MeshBasicMaterial({ map: labelT, transparent: true, depthWrite: false }),
    succ: std({ color: 0x8fae94, roughness: .5 }), snake: std({ color: 0x3d6a3c, roughness: .45, side: C.DoubleSide }), cactus: std({ color: 0x5f8a50, roughness: .6 }),
    petal: [0xf2a7b8, 0xf6f0e2, 0xf2c94c, 0xd8573c].map(c => std({ color: c, roughness: .6 })),
  };
  R.M = M;

  const FRUIT = {}; for (const k of ['apple', 'pear', 'redpear', 'orange', 'lemon', 'pomegranate', 'mango']) FRUIT[k] = [skin(k), skin(k), skin(k)];
  pom(M.floor, .006); pom(M.hull, .005); pom(M.cream, .004); pom(M.splash, .01); pom(M.darkMetal, .006); pom(M.rug, .012); pom(M.tableWood, .003); pom(M.leather, .006); pom(M.skin, .002);
  /* ---------- geometry helpers ---------- */
  let scene = null, parent = null;
  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new C.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.s) m.scale.setScalar(o.s);
    m.castShadow = o.cast !== false; m.receiveShadow = true; if (FOL) FOLIAGE.push(m); if (LAMPF) LAMP.push(m); (o.p || parent || scene).add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, o) => add(new C.BoxGeometry(w, h, d), mat, x, y, z, o);
  const cyl = (r0, r1, h, mat, x, y, z, o = {}) => add(new C.CylinderGeometry(r0, r1, h, o.seg || 48, 1, !!o.open), mat, x, y, z, o);
  function rbox(w, h, d, r, bev = 4){
    const s = new C.Shape(), x = -w/2 + r, y = -h/2 + r, ww = w - 2*r, hh = h - 2*r;
    s.absarc(x, y, r, Math.PI, 1.5*Math.PI); s.absarc(x + ww, y, r, 1.5*Math.PI, 2*Math.PI); s.absarc(x + ww, y + hh, r, 0, .5*Math.PI); s.absarc(x, y + hh, r, .5*Math.PI, Math.PI);
    const bt = Math.min(r, d*.45), g = new C.ExtrudeGeometry(s, { depth: Math.max(.001, d - 2*bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt*.9, bevelSegments: Math.max(bev, 6), curveSegments: 18 });
    g.translate(0, 0, -(d - 2*bt)/2); return g;
  }
  const lathe = (pts, mat, x, y, z, o = {}) => add(new C.LatheGeometry(pts.map(([a, b]) => new C.Vector2(a, b)), o.seg || 72), mat, x, y, z, o);
  function pipe(pts, r, mat, clamps = 0, o = {}){
    const curve = new C.CatmullRomCurve3(pts.map(p => new C.Vector3(...p)), false, 'catmullrom', .1);
    add(new C.TubeGeometry(curve, Math.max(24, pts.length*16), r, 10, false), mat, 0, 0, 0, o);
    for (let i = 1; i <= clamps; i++){ const t = i/(clamps + 1), p = curve.getPoint(t), tg = curve.getTangent(t); const m = add(new C.CylinderGeometry(r*1.5, r*1.5, r*1.8, 12), M.dark, p.x, p.y, p.z, o); m.quaternion.setFromUnitVectors(new C.Vector3(0, 1, 0), tg); }
    return curve;
  }
  function leafGeo(len, wid){
    const s = new C.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(wid, len*.35, 0, len); s.quadraticCurveTo(-wid, len*.35, 0, 0);
    const g = new C.ShapeGeometry(s, 12); const p = g.attributes.position; for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i); p.setZ(i, -Math.abs(x)*.5 + Math.sin(y/len*Math.PI)*len*.08); } g.computeVertexNormals(); return g;
  }
  const LEAF = [leafGeo(.07, .035), leafGeo(.1, .045), leafGeo(.05, .028), leafGeo(.14, .05)];
  function pot(x, y, z, s, mat){ lathe([[0, 0], [.13*s, 0], [.15*s, .02*s], [.17*s, .22*s], [.19*s, .24*s], [.19*s, .28*s], [.165*s, .28*s]], mat, x, y, z); cyl(.165*s, .165*s, .01, M.soil, x, y + .27*s, z, { cast: false }); }
  // a leafy plant: many short twigs ending in clusters of small leaves (the kitchen's bushes and herbs), or long trailing vines
  // foliage goes on layer 1: it casts shadows into the room but is baked as its own picture, so the title screen can sway it
  let FOL = 0, LAMPF = 0; const FOLIAGE = R.foliage = [], LAMP = R.lamp = [];
  function plant(x, y, z, s, kind, potMat){ if (potMat !== null) pot(x, y, z, s, potMat || M.pot); FOL++; try { plantBody(x, y, z, s, kind); } finally { FOL--; } }
  function plantBody(x, y, z, s, kind){ const potMat = null;
    const top0 = y + .27*s;
    if (kind === 'succulent'){ for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 9 - ring*2; k++){ const a = k/(9 - ring*2)*Math.PI*2 + ring*.3, l = (.09 - ring*.022)*s*2.2;
        const lf = add(new C.SphereGeometry(1, 10, 8), M.succ, x + Math.cos(a)*l*.45, top0 + .01 + ring*.012*s, z + Math.sin(a)*l*.45, { cast: true }); lf.scale.set(l*.5, l*.16, l*.22); lf.rotation.set(0, -a, .35 + ring*.3); } return; }
    if (kind === 'snake'){ for (let k = 0; k < 9; k++){ const a = rnd()*6.3, d = rr(0, .05)*s, hgt = rr(.35, .6)*s, g = new C.PlaneGeometry(.045*s, hgt, 1, 6); g.translate(0, hgt/2, 0);
        const p = g.attributes.position; for (let i = 0; i < p.count; i++){ const t = p.getY(i)/hgt; p.setX(i, p.getX(i)*(1 - t*.85)); p.setZ(i, t*t*.04*s); } g.computeVertexNormals();
        add(g, M.snake, x + Math.cos(a)*d, top0, z + Math.sin(a)*d, { ry: rnd()*6.3, cast: true }).rotation.z = rr(-.12, .12); } return; }
    if (kind === 'cactus'){ const cg = new C.CylinderGeometry(.06*s, .07*s, .32*s, 12, 4); const p = cg.attributes.position; for (let i = 0; i < p.count; i++){ const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + .08*Math.cos(a*6); p.setX(i, p.getX(i)*k); p.setZ(i, p.getZ(i)*k); } cg.computeVertexNormals();
      add(cg, M.cactus, x, top0 + .16*s, z); add(new C.SphereGeometry(.06*s, 12, 8, 0, 6.3, 0, 1.6), M.cactus, x, top0 + .32*s, z, { cast: false });
      const arm = add(new C.CylinderGeometry(.035*s, .04*s, .14*s, 10), M.cactus, x + .08*s, top0 + .2*s, z); arm.rotation.z = -.5; cyl(.012*s, .012*s, .01, M.petal[0], x, top0 + .38*s, z, { cast: false }); return; }
    if (kind === 'fern'){ for (let k = 0; k < 11; k++){ const a = k/11*Math.PI*2 + rr(-.2, .2), len = rr(.28, .42)*s, pts = [];
        for (let i = 0; i <= 8; i++){ const t = i/8; pts.push(new C.Vector3(x + Math.cos(a)*t*len*.9, top0 + Math.sin(t*2.2)*len*.45 - t*t*len*.35, z + Math.sin(a)*t*len*.9)); }
        const cv = new C.CatmullRomCurve3(pts); add(new C.TubeGeometry(cv, 10, .003*s, 4), M.leafs[3], 0, 0, 0, { cast: false });
        for (let i = 2; i <= 15; i++){ const t = i/16, pp = cv.getPoint(t), tg = cv.getTangent(t); for (const sd of [-1, 1]){ const lf = add(LEAF[2], M.leafs[3], pp.x, pp.y, pp.z, { s: s*(1.1 - t*.7), cast: false }); lf.rotation.set(-1.2, Math.atan2(tg.x, tg.z) + sd*1.4, 0); } } } return; }
    if (kind === 'flower'){ plant(x, y, z, s, 'herb', null); for (let k = 0; k < 9; k++){ const a = rnd()*6.3, d = rr(.02, .1)*s, py = top0 + rr(.12, .3)*s, col = pick(M.petal);
        for (let q = 0; q < 5; q++){ const qa = q/5*6.3; add(new C.SphereGeometry(.011*s, 6, 4), col, x + Math.cos(a)*d + Math.cos(qa)*.012*s, py, z + Math.sin(a)*d + Math.sin(qa)*.012*s, { cast: false }); }
        add(new C.SphereGeometry(.007*s, 6, 4), M.petal[2], x + Math.cos(a)*d, py + .004, z + Math.sin(a)*d, { cast: false }); } return; }
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
  // a fruit: a turned profile per kind (apple with its two dimples, pear's neck, pointed lemon, flat-ended orange, crowned
  // pomegranate, kidney mango), its own painted skin, a stem, calyx or crown; small random lean and turn
  const PROF = {
    apple: [[0, .1], [.25, .03], [.55, .06], [.85, .3], [.98, .6], [1, .9], [.93, 1.25], [.75, 1.5], [.45, 1.62], [.2, 1.55], [.06, 1.42], [0, 1.4]],
    pear: [[0, .05], [.35, 0], [.75, .15], [.93, .45], [.92, .8], [.75, 1.1], [.55, 1.35], [.45, 1.6], [.38, 1.85], [.25, 2.02], [.08, 2.08], [0, 2.06]],
    orange: [[0, .06], [.4, 0], [.8, .18], [.98, .5], [1, .9], [.97, 1.25], [.8, 1.55], [.45, 1.74], [.1, 1.78], [0, 1.76]],
    pomegranate: [[0, .05], [.4, 0], [.82, .2], [1, .55], [1.02, .95], [.92, 1.35], [.7, 1.6], [.4, 1.74], [.2, 1.76], [0, 1.75]],
  };
  PROF.redpear = PROF.pear;
  function fruit(x, y, z, r, mat, o = {}){
    let kind = mat === M.orange ? 'orange' : mat === M.lemon ? 'lemon' : typeof mat === 'string' ? mat : null;
    if (!kind){ const q = rnd(); kind = q < .38 ? 'orange' : q < .6 ? 'apple' : q < .72 ? 'pear' : q < .8 ? 'redpear' : q < .88 ? 'lemon' : q < .95 ? 'pomegranate' : 'mango'; }
    const m = pick(FRUIT[kind]), ry = rnd()*6.3, lean = rr(-.15, .15);
    if (kind === 'lemon'){ const pts = []; for (let i = 0; i <= 24; i++){ const t = i/24, a = t*Math.PI; pts.push([Math.max(.0005, Math.sin(a)*r*(1 - .28*Math.pow(Math.abs(Math.cos(a)), 6))), (1 - Math.cos(a))*r*1.35]); }
      const f = lathe(pts, m, x, y + r*.95, z - r*1.35, Object.assign({ seg: 64 }, o)); f.rotation.set(Math.PI/2, 0, ry); f.position.set(x - Math.sin(ry)*0, y + r*.95, z); f.geometry.translate(0, -r*1.35, 0); return f; }
    if (kind === 'mango'){ const f = add(new C.SphereGeometry(r, 64, 40), m, x, y + r*.82, z, o); f.scale.set(1.45, .82, .95); f.rotation.set(0, ry, .25); cyl(r*.08, r*.06, r*.12, M.stem, x + Math.cos(ry)*r*1.35, y + r*1.2, z - Math.sin(ry)*r*1.35, { seg: 10, cast: false }); return f; }
    const sc = kind === 'pear' || kind === 'redpear' ? .82 : 1, f = lathe(PROF[kind].map(([a, b]) => [a*r*sc, b*r*sc]), m, x, y, z, Object.assign({ seg: 72 }, o)); f.rotation.set(lean, ry, rr(-.15, .15));
    const top = y + PROF[kind][PROF[kind].length - 1][1]*r*sc;
    if (kind === 'apple' || kind === 'pear' || kind === 'redpear'){ const l = kind === 'apple' ? r*.6 : r*.75; pipe([[x, top - r*.1, z], [x + r*.05, top + l*.5, z], [x + r*.18, top + l, z + r*.05]], r*.045, M.stem); if (rnd() < .3){ const lf = add(LEAF[1], M.leafs[0], x + r*.1, top + l*.6, z, { s: r*8, cast: false }); lf.rotation.set(-1.0, rnd()*6.3, 0); } }
    else if (kind === 'orange'){ cyl(r*.1, r*.12, r*.07, M.calyx, x, top, z, { seg: 12, cast: false }); for (let k = 0; k < 5; k++){ const a = k/5*6.3; box(r*.13, r*.02, r*.05, M.calyx, x + Math.cos(a)*r*.11, top - r*.01, z + Math.sin(a)*r*.11, { ry: -a, cast: false }); } }
    else if (kind === 'pomegranate'){ for (let k = 0; k < 6; k++){ const a = k/6*6.3; const c = add(new C.ConeGeometry(r*.07, r*.28, 6), m, x + Math.cos(a)*r*.12, top + r*.1, z + Math.sin(a)*r*.12, { cast: false }); c.rotation.set(Math.sin(a)*.5, 0, -Math.cos(a)*.5); } cyl(r*.15, r*.2, r*.12, m, x, top + .002, z, { seg: 16, cast: false }); }
    return f; }
  function plate(x, y, z, r, o = {}){ lathe([[0, 0], [r*.5, 0], [r*.55, .004], [r*.6, r*.03], [r*.62, r*.035], [r*.95, r*.11], [r, r*.13], [r*1.02, r*.13], [r*.99, r*.115], [r*.6, r*.045], [r*.55, r*.04], [0, r*.04]], M.ceramic, x, y, z, Object.assign({ cast: false }, o)); add(new C.TorusGeometry(r*.97, r*.006, 6, 64), M.gold, x, y + r*.125, z, { rx: Math.PI/2, cast: false }); }
  function fruitPlate(x, y, z, r, n, o = {}){ plate(x, y, z, r, o); for (let i = 0; i < n; i++){ const a = rnd()*7, d = rnd()*r*.55; fruit(x + Math.cos(a)*d, y + .012, z + Math.sin(a)*d, rr(.025, .04), null, o); } }
  function bowl(x, y, z, r, n, mat, o = {}){ lathe([[0, 0], [r*.42, 0], [r*.42, r*.04], [r*.5, r*.05], [r*.8, r*.22], [r, r*.5], [r*1.03, r*.54], [r*1.0, r*.56], [r*.95, r*.52], [r*.75, r*.24], [r*.45, r*.1], [0, r*.1]], mat || M.ceramic, x, y, z, o); for (let i = 0; i < n; i++){ const a = rnd()*7, d = rnd()*r*.55; fruit(x + Math.cos(a)*d, y + r*.25 + rr(0, .03), z + Math.sin(a)*d, rr(.028, .042), null, o); } }
  // a loaf: a lumpy dome, three scored cuts that open paler crumb, flour dust
  function bread(x, y, z, l, o = {}){ const g = new C.SphereGeometry(l*.45, 40, 26), p = g.attributes.position;
    for (let i = 0; i < p.count; i++){ const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), n = 1 + .05*Math.sin(vx*60 + vz*40) + .04*Math.sin(vz*75 - vy*30); p.setXYZ(i, vx*n, Math.max(vy, -l*.05)*n, vz*n); } g.computeVertexNormals();
    const ry = rnd()*3, m = add(g, M.bread, x, y + l*.12, z, o); m.scale.set(1.5, .72, .95); m.rotation.y = ry;
    for (let k = -1; k <= 1; k++){ const c = box(l*.08, l*.02, l*.32, M.crumb, x + Math.cos(ry)*k*l*.2, y + l*.12 + l*.32, z - Math.sin(ry)*k*l*.2, { cast: false }); c.rotation.set(0, ry + .5, 0); }
    return m; }
  function cup(x, y, z, o = {}){ lathe([[0, 0], [.03, 0], [.031, .004], [.035, .07], [.0355, .075], [.033, .075], [.0295, .008], [0, .008]], M.glass, x, y, z, Object.assign({ cast: false }, o)); }

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
      pipe([[c*(RF - .02), Y + sn*(RF - .02), .0], [c*(rb - .015), Y + sn*(rb - .015), -d1 + .04]], .016, M.creamPlain); }
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
    { const sy = Y - 1.0; box(1.9, .16, .92, M.cream, 0, sy - .08, -.42);   // (wide enough to meet the funnel at both ends: no light slips round it) box(1.5, .03, .03, M.chrome, 0, sy - .01, .03, { cast: false }); box(1.9, .9, .03, M.hull, 0, sy - .47, .02); box(1.3, .012, .012, M.dark, 0, sy - .07, .04, { cast: false });   // (an apron closes the sill down to the funnel)
      plant(-.08, sy, -.44, .62, 'herb', M.basket); plant(-.08, sy, -.44, .55, 'tree', null); plant(-.52, sy, -.36, .46, 'snake', M.glazeWhite); plant(.36, sy, -.46, .44, 'fern', M.pot);
      plant(.5, sy, -.14, .38, 'flower', M.glazeTeal); plant(.12, sy, -.1, .34, 'trail', M.glazeWhite); plant(-.45, sy, -.06, .32, 'herb', M.steel); plant(.74, sy, -.58, .55, 'bush'); }
    for (let k = 0; k < 0; k++){ const a = Math.PI*(1.1 + k*.045); const lz = -rr(.05, .45), lr = rAt(lz) - .05; const lf = add(pick(LEAF), pick(M.leafs), Math.cos(a)*lr, Y + Math.sin(a)*lr, lz, { s: rr(1, 1.8) }); lf.rotation.set(rnd()*6, rnd()*6, rnd()*6); }
    // the hull's foot below the window: a cream apron bulging out, chrome pipes with grab handles along it, a latch
    // (the old curved apron at the hull's foot is gone: turned with the wall it lay across the floor as a sliver)
    pipe([[-2.6, .32, .1], [-1.2, .3, .12], [-.2, .33, .12], [.6, .45, .1], [1.0, .8, .06]], .02, M.chrome, 0);
    pipe([[-2.6, .16, .14], [-.5, .16, .15], [.7, .2, .12]], .016, M.chrome, 0);
    for (const hx of [-.9, .2]) pipe([[hx - .12, .34, .12], [hx - .1, .48, .17], [hx + .1, .48, .17], [hx + .12, .34, .12]], .012, M.chrome);
    cyl(.03, .03, .1, M.chrome, -.3, .62, .15, { rx: Math.PI/2 }); box(.04, .14, .03, M.chrome, -.3, .54, .2);
    // the round table at the window: a thick wooden top with a lip, a pedestal, breakfast
    parent = G.table;
    const T = { x: -.45, z: -2.27, y: 1.11, r: .6 };   // (bar height: the owner raised it)
    add(new C.CylinderGeometry(T.r, T.r, .045, 128, 1), M.tableWood, T.x, T.y + .0125, T.z);
    add(new C.TorusGeometry(T.r - .005, .026, 16, 128), M.darkWood, T.x, T.y - .005, T.z, { rx: Math.PI/2 });
    lathe([[0, -.06], [T.r*.92, -.06], [T.r*.92, -.02], [0, -.02]], M.darkWood, T.x, T.y, T.z, { seg: 96 });
    lathe([[0, .02], [.07, .02], [.065, .1], [.05, .18], [.055, .3], [.07, .36], [.05, .42], [.045, T.y - .3], [.06, T.y - .22], [.05, T.y - .14], [.1, T.y - .1], [.16, T.y - .07]], M.darkWood, T.x, 0, T.z, { seg: 64 });
    for (let k = 0; k < 4; k++){ const a = k/4*Math.PI*2 + .4, pts = []; for (let i = 0; i <= 8; i++){ const t = i/8; pts.push([T.x + Math.cos(a)*(.05 + t*.3), .2 - Math.sin(t*1.6)*.17, T.z + Math.sin(a)*(.05 + t*.3)]); } pipe(pts, .028, M.darkWood); cyl(.035, .03, .02, M.darkWood, T.x + Math.cos(a)*.35, .01, T.z + Math.sin(a)*.35, { seg: 24 }); }
    const TY = T.y + .035;
    const croissant = (x, y, z, ry) => { const c = add(new C.TorusGeometry(.04, .022, 8, 14, 2.5), M.bread, x, y + .02, z, { rx: Math.PI/2, cast: false }); c.rotation.z = ry; c.scale.set(1, 1, .75); for (let k = 0; k < 4; k++) add(new C.TorusGeometry(.024, .004, 4, 10), std({ color: 0x9a5a28, roughness: .7 }), x + Math.cos(ry + .4 + k*.5)*.04, y + .02, z + Math.sin(ry + .4 + k*.5)*.04, { ry: -(ry + .4 + k*.5), cast: false }); };
    const juice = (x, y, z) => { lathe([[0, 0], [.028, 0], [.032, .11], [.03, .11]], M.glass, x, y, z, { cast: false }); cyl(.026, .028, .075, M.juice, x, y + .04, z, { cast: false }); };
    for (const a of [-.5, .75, 2.05]){ const px = T.x + Math.cos(a)*.4, pz = T.z + Math.sin(a)*.4, ta = a + Math.PI/2;
      box(.2, .004, .16, std({ color: pick([0xd8c9a0, 0x9fb6b0, 0xe6dccb]), roughness: .95 }), px, TY + .002, pz, { ry: -a, cast: false });   // a placemat
      plate(px, TY + .005, pz, .1); croissant(px, TY + .02, pz, rnd()*6);
      for (const sd of [-1, 1]) box(.012, .004, .14, M.steel, px + Math.cos(ta)*sd*.13, TY + .007, pz + Math.sin(ta)*sd*.13, { ry: -a, cast: false });
      juice(px + Math.cos(a - .5)*.16, TY, pz + Math.sin(a - .5)*.16); box(.07, .01, .07, std({ color: 0xf4efe2, roughness: .95 }), px + Math.cos(ta)*-.2, TY + .005, pz + Math.sin(ta)*-.2, { ry: .3 }); }
    bowl(T.x + .05, TY, T.z + .02, .14, 0, M.glazeTeal); { const K = ['orange', 'apple', 'orange', 'redpear', 'orange', 'apple', 'pomegranate', 'orange', 'lemon']; for (let i = 0; i < 9; i++){ const a = i/9*6.3, d = i < 6 ? .075 : .02; fruit(T.x + .05 + Math.cos(a)*d, TY + .03 + (i < 6 ? 0 : .055), T.z + .02 + Math.sin(a)*d, .036, K[i]); } }
    lathe([[0, 0], [.1, 0], [.13, .07], [.135, .08]], M.basket, T.x - .2, TY, T.z + .2); for (let i = 0; i < 3; i++) bread(T.x - .2 + rr(-.05, .05), TY + .03, T.z + .2 + rr(-.05, .05), .11); croissant(T.x - .17, TY + .05, T.z + .16, 1);
    jar(T.x + .3, TY, T.z - .05, .08, .03, M.jam); add(rbox(.11, .03, .07, .01), M.glazeWhite, T.x + .22, TY + .015, T.z + .2); box(.07, .025, .045, M.butter, T.x + .22, TY + .042, T.z + .2, { cast: false });
    lathe([[0, 0], [.025, 0], [.03, .05], [.015, .1], [.017, .11]], M.glass, T.x + .12, TY, T.z - .2, { cast: false }); for (let k = 0; k < 4; k++){ const fx = T.x + .12 + rr(-.04, .04), fz = T.z - .2 + rr(-.04, .04), fy = TY + rr(.16, .22); pipe([[T.x + .12, TY + .08, T.z - .2], [fx, fy, fz]], .002, M.leafs[0]); for (let q = 0; q < 5; q++){ const qa = q/5*6.3; add(new C.SphereGeometry(.009, 6, 4), M.petal[k % 2 ? 1 : 3], fx + Math.cos(qa)*.01, fy, fz + Math.sin(qa)*.01, { cast: false }); } }
    lathe([[0, 0], [.07, 0], [.09, .06], [.085, .14], [.055, .2], [.05, .24], [.065, .27], [.06, .28]], M.copper, T.x - .25, TY, T.z - .35); pipe([[T.x - .25 - .085, TY + .22, T.z - .35], [T.x - .25 - .14, TY + .2, T.z - .35], [T.x - .25 - .14, TY + .1, T.z - .35], [T.x - .25 - .085, TY + .06, T.z - .35]], .011, M.copper); add(new C.ConeGeometry(.025, .05, 8, 1, true), M.copper, T.x - .25 + .07, TY + .265, T.z - .35, { rz: -1.2, cast: false });
    lathe([[0, 0], [.04, 0], [.045, .05], [.035, .1], [.04, .11]], M.glazeWhite, T.x + .36, TY, T.z - .25); pipe([[T.x + .36 + .04, TY + .08, T.z - .25], [T.x + .36 + .07, TY + .07, T.z - .25], [T.x + .36 + .04, TY + .03, T.z - .25]], .006, M.glazeWhite);
    { const tc = new C.PlaneGeometry(.42, .98); tc.rotateX(-Math.PI/2); add(tc, std({ color: 0xd9cfb4, roughness: .95, side: C.DoubleSide }), T.x + .05, TY + .003, T.z, { cast: false, ry: .3 });   // a linen runner
      lathe([[0, 0], [.07, 0], [.09, .05], [.085, .11], [.05, .14], [.02, .15], [.025, .16]], M.ceramic, T.x - .1, TY, T.z - .3); pipe([[T.x - .02, TY + .07, T.z - .3], [T.x + .06, TY + .12, T.z - .3], [T.x + .1, TY + .14, T.z - .3]], .012, M.ceramic); pipe([[T.x - .18, TY + .12, T.z - .3], [T.x - .24, TY + .1, T.z - .3], [T.x - .23, TY + .04, T.z - .3], [T.x - .18, TY + .03, T.z - .3]], .01, M.ceramic); add(new C.SphereGeometry(.015, 8, 6), M.ceramic, T.x - .1, TY + .165, T.z - .3);   // a teapot with a lid knob and a handle
      for (const [dx, dz] of [[.25, .1], [-.3, .25], [.1, .35]]){ lathe([[0, 0], [.035, 0], [.04, .09], [.037, .09]], std({ color: pick([0xf1ebdc, 0x3f6f7a, 0xc94f3b]), roughness: .3 }), T.x + dx, TY, T.z + dz); add(new C.TorusGeometry(.02, .006, 6, 12), M.ceramic, T.x + dx + .045, TY + .045, T.z + dz, { cast: false }); }
      add(rbox(.32, .025, .2, .01), M.wood, T.x + .2, TY + .012, T.z - .15); bread(T.x + .2, TY + .025, T.z - .15, .2); box(.3, .012, .22, std({ color: 0xe8e0c8, roughness: .9 }), T.x - .28, TY + .006, T.z + .02, { ry: .5, cast: false }); }
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
    { const S0 = 2.56, S1 = 3.16, SZ0 = .14, SZ1 = .56;   // the top in pieces round the sink's hole
      box(S0 - X0 + .01, .03, D + .02, M.counterTop, (X0 - .01 + S0)/2, TOP + .015, D/2); box(X1 + .01 - S1, .03, D + .02, M.counterTop, (S1 + X1 + .01)/2, TOP + .015, D/2);
      box(S1 - S0, .03, SZ0, M.counterTop, (S0 + S1)/2, TOP + .015, SZ0/2 - .01); box(S1 - S0, .03, D + .01 - SZ1, M.counterTop, (S0 + S1)/2, TOP + .015, (SZ1 + D + .01)/2);
      box(CW + .02, .012, .012, M.chrome, CX, TOP + .03, D + .012, { cast: false });
      // the basin: steel walls and floor, a drain, a rolled rim
      const bx = (S0 + S1)/2, bz = (SZ0 + SZ1)/2, bw = S1 - S0, bd = SZ1 - SZ0, bh = .2;
      box(bw, .01, bd, M.steel, bx, TOP - bh, bz); for (const sd of [-1, 1]){ box(.01, bh, bd, M.steel, bx + sd*bw/2, TOP - bh/2, bz, { cast: false }); box(bw, bh, .01, M.steel, bx, TOP - bh/2, bz + sd*bd/2, { cast: false }); }
      cyl(.03, .03, .006, M.dark, bx, TOP - bh + .008, bz, { seg: 24, cast: false }); for (let k = 0; k < 6; k++) box(.05, .007, .004, M.steel, bx, TOP - bh + .012, bz - .015 + k*.006, { cast: false });
      for (const [w, d, x, z] of [[bw + .04, .02, bx, SZ0 - .01], [bw + .04, .02, bx, SZ1 + .01], [.02, bd + .04, S0 - .01, bz], [.02, bd + .04, S1 + .01, bz]]) box(w, .012, d, M.chrome, x, TOP + .034, z, { cast: false });
      // the tap: a swan neck from the back, two cross handles
      pipe([[bx, TOP + .03, .08], [bx, TOP + .26, .08], [bx, TOP + .33, .14], [bx, TOP + .3, .22], [bx, TOP + .24, .24]], .014, M.chrome); cyl(.028, .032, .03, M.chrome, bx, TOP + .045, .08, { seg: 32 });
      for (const sd of [-1, 1]){ cyl(.016, .02, .05, M.chrome, bx + sd*.1, TOP + .055, .08, { seg: 24 }); box(.07, .008, .012, M.chrome, bx + sd*.1, TOP + .085, .08, { ry: .6, cast: false }); box(.07, .008, .012, M.chrome, bx + sd*.1, TOP + .085, .08, { ry: -.6, cast: false }); cyl(.006, .006, .006, sd < 0 ? M.fruit[2] : M.glazeTeal, bx + sd*.1, TOP + .092, .08, { seg: 12, cast: false }); }
      add(rbox(.08, .03, .05, .008), std({ color: 0xd8c040, roughness: .9 }), S0 + .07, TOP + .046, SZ1 - .03); box(.08, .01, .05, std({ color: 0x3a6a3a, roughness: .9 }), S0 + .07, TOP + .066, SZ1 - .03, { cast: false });   // a sponge
      lathe([[0, 0], [.03, 0], [.032, .1], [.012, .13], [.008, .16], [.012, .165]], std({ color: 0x7ab0a0, roughness: .15, transparent: true, opacity: .8 }), S1 - .05, TOP + .03, .1); }   // dish soap
    // the splash: dark, chrome pipes along it, a rail of ladles and hooks
    { const sp = new C.PlaneGeometry(CW, .74); const uv = sp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*CW/.6, uv.getY(i)*.74/.6); add(sp, M.splash, CX, TOP + .37, .022, { cast: false }); }
    for (let i = 0; i < 4; i++) pipe([[X0, 1.6 - i*.05, .05 + i*.02], [X1, 1.6 - i*.05, .05 + i*.02]], .018 - i*.003, i === 1 ? M.copper : M.chrome, 5);
    pipe([[X0 + .35, 1.62, .06], [X0 + .38, 1.45, .1], [X0 + .55, 1.42, .1], [X0 + .58, 1.0, .08]], .016, M.chrome);
    cyl(.01, .01, CW - .6, M.chrome, CX + .25, 1.42, .16, { rz: Math.PI/2 });
    for (let i = 0; i < 12; i++){ const x = 1.5 + i*.14, kind = i % 4, l = kind === 2 ? .2 : rr(.2, .3);
      add(new C.TorusGeometry(.012, .003, 4, 10), M.chrome, x, 1.42 - .01, .165, { ry: Math.PI/2, cast: false }); cyl(.005, .005, l, kind === 3 ? M.wood : M.chrome, x, 1.42 - .02 - l/2, .165, { seg: 6 });
      const hy = 1.42 - .02 - l;
      if (kind === 0) add(new C.SphereGeometry(.042, 14, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2), M.chrome, x, hy, .175, { rx: -.5 });
      else if (kind === 1){ add(rbox(.06, .08, .006, .01), M.chrome, x, hy - .03, .168); for (let k = 0; k < 3; k++) box(.006, .05, .008, M.dark, x - .015 + k*.015, hy - .03, .168, { cast: false }); }
      else if (kind === 2){ for (let k = 0; k < 5; k++){ const w = new C.TorusGeometry(.035, .0025, 4, 18); w.scale(1, 1.8, 1); add(w, M.chrome, x, hy - .06, .165, { ry: k/5*Math.PI, cast: false }); } }
      else box(.05, .07, .008, M.wood, x, hy - .03, .168); }
    lathe([[0, 0], [.12, 0], [.13, .11], [.135, .12]], M.chrome, 3.35, 1.18, .22, { rx: -Math.PI/2.3 }); cyl(.01, .01, .22, M.chrome, 3.35, 1.34, .22);
    { const tw = new C.PlaneGeometry(.24, .42, 4, 10); const p = tw.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i)*14)*.012 + p.getX(i)*p.getX(i)*1.4); tw.computeVertexNormals(); add(tw, M.towel, 2.33, 1.24, .19); }
    for (const x of [1.0, 2.0, 3.0]){ cyl(.045, .05, .018, M.chrome, x, 1.647, .33, { seg: 16, cast: false }); cyl(.035, .035, .004, M.lampGlow, x, 1.637, .33, { seg: 16, cast: false }); } { const l = new C.PointLight(0xffc888, .3, 1.6, 2); l.position.set(1.6, 1.5, .4); kit.add(l); }   // (puck lights under the capsule)
    box(1.3, .015, .16, M.chrome, 2.95, 1.27, .1); for (const x of [2.32, 3.58]) box(.015, .1, .16, M.chrome, x, 1.22, .1, { cast: false });
    for (let i = 0; i < 11; i++) jar(2.38 + i*.11, 1.28, .1 + (i % 2)*.03, rr(.08, .14), .028, std({ color: pick([0xb06a30, 0x8a5a2a, 0xd8a050, 0x5a7a3a, 0xc94f3b]) }));
    for (const [x, r] of [[3.78, .1], [4.02, .08]]){ lathe([[0, 0], [r, 0], [r*1.05, .04], [r*1.08, .045]], M.copper, x, 1.25, .07, { rx: Math.PI/2 }); cyl(.008, .008, .16, M.dark, x, 1.25 - r - .08, .07, { seg: 6 }); }
    add(rbox(.14, .09, .02, .01), M.creamPlain, 1.0, 1.12, .03); for (const dx of [-.03, .03]) box(.02, .03, .01, M.dark, 1.0 + dx, 1.12, .045, { cast: false });
    for (const x of [.78, 3.66]) cyl(.012, .012, .7, M.steel, x, TOP + .37, .04, { seg: 8 });
    // on the counter, left to right as someone would use it: plants and salt by the wall's end; the grain canister; the hob over
    // the oven with the kettle and a pan; the bread board and the fruit; the sink; the dish rack; tins, bowls and a plate of oranges
    const TT = TOP + .03;
    plant(.14, TT, .46, .3, 'cactus', M.glazeOchre); plant(.32, TT, .18, .27, 'succulent', M.pot); plant(.44, TT, .52, .28, 'herb', M.glazeTeal);
    for (const [x, c] of [[.56, 0xf1ebdc], [.62, 0x2c2a26]]) lathe([[0, 0], [.018, 0], [.02, .005], [.018, .07], [.012, .085], [0, .09]], std({ color: c, roughness: .3 }), x, TT, .16);
    { const ux = .68, uz = .5; lathe([[0, 0], [.055, 0], [.06, .005], [.062, .16], [.066, .17], [.058, .17], [.054, .012], [0, .012]], M.glazeTeal, ux, TT, uz);
      for (let k = 0; k < 6; k++){ const a = k/6*6.3, tx = ux + Math.cos(a)*.03, tz = uz + Math.sin(a)*.03; pipe([[tx, TT + .05, tz], [tx + Math.cos(a)*.03, TT + .3, tz + Math.sin(a)*.03]], .006, k % 2 ? M.wood : M.steel);
        if (k % 2) add(rbox(.04, .06, .008, .006), M.wood, tx + Math.cos(a)*.035, TT + .33, tz + Math.sin(a)*.035, { ry: -a, cast: false }); else add(new C.SphereGeometry(.024, 24, 12, 0, 6.3, 0, 1.6), M.steel, tx + Math.cos(a)*.035, TT + .33, tz + Math.sin(a)*.035, { rx: Math.PI, cast: false }); } }
    { const cx = .93, cz = .28, cy = TT;   // the grain canister: glass, chrome lid with a knob, a clip handle
      lathe([[0, 0], [.17, 0], [.18, .02], [.18, .05]], M.chrome, cx, cy, cz); lathe([[.175, .05], [.175, .4]], M.glass, cx, cy, cz, { cast: false, seg: 64 });
      cyl(.165, .165, .27, std({ color: 0xa8763a, roughness: .9, bumpMap: dimpleT.bump, bumpScale: .03 }), cx, cy + .185, cz, { cast: false, seg: 64 });
      lathe([[.185, .4], [.185, .43], [.15, .47], [.05, .5], [.05, .53], [.03, .55], [0, .55]], M.chrome, cx, cy, cz); for (const k of [.05, .28, .4]) add(new C.TorusGeometry(.18, .006, 8, 64), M.chrome, cx, cy + k, cz, { rx: Math.PI/2, cast: false }); }
    { const hx = 1.33, hz = .34;   // the hob over the oven: black glass, two burner rings with grates, the kettle and a pan on them
      add(rbox(.6, .012, .5, .02), M.blackGlass, hx, TT + .006, hz); add(rbox(.62, .008, .52, .02), M.chrome, hx, TT + .001, hz);
      for (const [bx, r] of [[hx - .15, .085], [hx + .15, .07]]){ for (const rr2 of [r, r*.6]) add(new C.TorusGeometry(rr2, .004, 6, 48), std({ color: 0x5a1a10, emissive: 0x401008, roughness: .4 }), bx, TT + .013, hz, { rx: Math.PI/2, cast: false });
        for (let k = 0; k < 4; k++) box(r*2.2, .008, .008, M.dark, bx, TT + .02, hz, { ry: k*Math.PI/4 }); }
      const kx = hx - .15, kz = hz, ky = TT + .024;   // the kettle
      lathe([[0, 0], [.09, 0], [.1, .015], [.105, .1], [.075, .17], [.035, .195], [.04, .2], [.015, .215], [0, .215]], M.chrome, kx, ky, kz);
      pipe([[kx + .08, ky + .05, kz], [kx + .14, ky + .12, kz], [kx + .17, ky + .17, kz]], .012, M.chrome); add(new C.SphereGeometry(.012, 12, 8), M.dark, kx, ky + .22, kz);
      pipe([[kx - .06, ky + .17, kz], [kx - .1, ky + .22, kz], [kx + .02, ky + .25, kz], [kx + .06, ky + .2, kz]], .01, M.dark);
      const px = hx + .15;   // the pan with a lid and a long handle
      lathe([[0, 0], [.075, 0], [.08, .01], [.08, .08], [.083, .085]], M.steel, px, ky, kz); lathe([[0, .1], [.03, .1], [.084, .086], [.086, .082]], M.glass, px, ky, kz, { cast: false }); add(new C.SphereGeometry(.012, 12, 8), M.dark, px, ky + .105, kz);
      pipe([[px + .08, ky + .06, kz], [px + .2, ky + .08, kz + .06], [px + .26, ky + .09, kz + .09]], .009, M.dark); }
    for (const [x, z, h, c] of [[1.72, .12, .26, 0xc9a43a], [1.8, .16, .2, 0x6a3a2a]]){ lathe([[0, 0], [.03, 0], [.032, .006], [.032, h*.7], [.012, h*.85], [.011, h], [.014, h + .01]], M.glass, x, TT, z, { cast: false }); cyl(.028, .028, h*.6, std({ color: c, roughness: .2, transparent: true, opacity: .85 }), x, TT + h*.33, z, { cast: false }); cyl(.013, .013, .02, M.wood, x, TT + h + .02, z, { seg: 16 }); }
    lathe([[0, 0], [.03, 0], [.032, .1], [.022, .13], [.032, .16], [.03, .18], [.012, .2], [.006, .21]], M.darkWood, 1.88, TT, .18);   // pepper mill
    { const bx = 2.08, bz = .38; add(rbox(.44, .025, .28, .012), M.wood, bx, TT + .012, bz, { ry: .12 }); bread(bx - .04, TT + .025, bz - .02, .26);   // the bread board: a loaf, a slice, a knife, crumbs
      box(.1, .012, .08, M.crumb, bx + .14, TT + .03, bz + .05, { ry: .3 }); box(.22, .003, .028, M.steel, bx + .06, TT + .03, bz + .1, { ry: .45 }); add(rbox(.09, .018, .024, .006), M.darkWood, bx - .1, TT + .033, bz + .14, { ry: .45 });
      for (let i = 0; i < 14; i++) box(.006, .004, .006, M.crumb, bx + rr(-.18, .2), TT + .027, bz + rr(-.1, .12), { cast: false }); }
    { bowl(2.38, TT, .56, .12, 0, M.glazeWhite); { const K = ['orange', 'apple', 'pear', 'orange', 'mango', 'lemon', 'orange', 'apple']; for (let i = 0; i < 8; i++){ const a = i/8*6.3, d = i < 5 ? .065 : .015; fruit(2.38 + Math.cos(a)*d, TT + .02 + (i < 5 ? 0 : .05), .56 + Math.sin(a)*d, .036, K[i]); } }
      fruit(2.2, TT, .62, .036, 'apple'); fruit(2.28, TT, .67, .032, 'lemon'); fruit(2.62, TT, .6, .04, 'pomegranate'); }
    { const rx = 3.45, rz = .32;   // the dish rack: a wire frame, plates on edge, a mug upside down, cutlery in a cup
      for (const dz of [-.12, .12]) pipe([[rx - .22, TT + .005, rz + dz], [rx - .22, TT + .1, rz + dz], [rx + .22, TT + .1, rz + dz], [rx + .22, TT + .005, rz + dz]], .004, M.steel);
      for (let k = 0; k < 9; k++) pipe([[rx - .2 + k*.05, TT + .01, rz - .12], [rx - .2 + k*.05, TT + .06, rz], [rx - .2 + k*.05, TT + .01, rz + .12]], .003, M.steel);
      for (let k = 0; k < 4; k++){ const pl = lathe([[0, 0], [.07, 0], [.1, .012], [.11, .015]], M.ceramic, rx - .15 + k*.06, TT + .12, rz, { cast: true }); pl.rotation.z = Math.PI/2 - .1; }
      lathe([[0, 0], [.04, 0], [.042, .09], [.04, .095]], M.glazeTeal, rx + .14, TT + .1, rz + .02).rotation.x = Math.PI; }
    for (let k = 0; k < 3; k++){ const tx = 3.82 + k*.1; cyl(.042, .042, .13 - k*.02, M.steel, tx, TT + .065 - k*.01, .16, { seg: 40 }); cyl(.043, .043, .06, std({ color: [0xd6573b, 0x3f6f7a, 0xe0c27a][k], roughness: .5 }), tx, TT + .06 - k*.01, .16, { seg: 40, cast: false }); add(new C.TorusGeometry(.042, .004, 6, 40), M.steel, tx, TT + .13 - k*.02, .16, { rx: Math.PI/2, cast: false }); }
    for (let k = 0; k < 3; k++) lathe([[0, 0], [.04, 0], [.07, .045], [.072, .05], [.068, .05], [.038, .006], [0, .006]], M.glazeWhite, 4.05, TT + k*.032, .4);
    fruitPlate(3.85, TT, .56, .12, 5);
    add(rbox(.24, .025, .16, .01), M.towel, 4.05, TT + .012, .6, { ry: -.2 });
    // the capsule appliance (after the reference): a horizontal cream cylinder squashed front to back with a rounded left cap,
    // seam rings between its sections, a recessed light bar with three glowing panes, the oven window in a chrome bezel with a
    // screen and a column of buttons, controls and lamps on the left end, a dark slot along the belly, a printed label
    const AY = 1.65, AH = 1.13, AD = .62, AX0 = .4, AX1 = 4.4, AR = AH/2, ACY = AY + AR, AZ = AD/2 + .02, SZ = AD/AH;
    const zf = dy => AZ + SZ*Math.sqrt(Math.max(0, AR*AR - dy*dy)), tilt = dy => Math.atan(dy/Math.sqrt(Math.max(.001, AR*AR - dy*dy))*SZ);
    { const g = new C.CylinderGeometry(AR, AR, AX1 - AX0 - .3, 72, 1, true); g.rotateZ(Math.PI/2); add(g, M.skin, (AX0 + .3 + AX1)/2, ACY, AZ).scale.z = SZ;
      const e = add(new C.SphereGeometry(AR, 48, 32), M.skin, AX0 + .3, ACY, AZ); e.scale.set(.55, 1, SZ); }


    { const dy = .36, y = ACY + dy, z = zf(dy), th = tilt(dy);
      box(1.04, .085, .03, M.dark, 1.45, y, z - .005, { rx: -th, cast: false }); for (const x of [.92, 1.98]) box(.03, .095, .04, M.chrome, x, y, z, { rx: -th, cast: false });
      for (const [x0, x1] of [[.97, 1.3], [1.34, 1.5], [1.54, 1.93]]) box(x1 - x0, .05, .02, M.barGlow, (x0 + x1)/2, y, z + .004, { rx: -th, cast: false });
      const l = new C.PointLight(0xffc878, .35, 1.4, 2); l.position.set(1.45, y + .02, z + .2); kit.add(l);
      // the bar can go dark (the title screen blinks it): its panes dim, its light off; the patch of picture it touches
      const lit = M.barGlow.color.clone(); kit.updateMatrixWorld(true);
      R.flicker = { off(){ M.barGlow.color.set(0x2a2016); l.visible = false; }, on(){ M.barGlow.color.copy(lit); l.visible = true; },
        corners: [[.75, y - .22, z], [2.15, y - .22, z], [.75, y + .2, z], [2.15, y + .2, z]].map(p => new C.Vector3(...p).applyMatrix4(kit.matrixWorld)), center: new C.Vector3(1.45, y, z).applyMatrix4(kit.matrixWorld) };
      const lb = new C.Mesh(new C.PlaneGeometry(.62, .075), M.label); lb.position.set(1.32, ACY + .265, zf(.265) + .004); lb.rotation.x = -tilt(.265); kit.add(lb); }
    { const wx = 1.42, wy = ACY - .08, z = zf(-.08) - .01;
      add(rbox(1.2, .6, .06, .05), M.chrome, wx, wy, z); add(rbox(1.1, .5, .06, .045), M.blackGlass, wx, wy, z + .012);
      box(.72, .36, .01, std({ color: 0x0f0e0b, roughness: .25 }), wx - .14, wy, z + .045, { cast: false });
      add(rbox(.74, .38, .02, .02), M.blackGlass, wx - .14, wy, z + .046);   // the screen, dark and blank
      box(.22, .42, .012, std({ color: 0x1c1a16, roughness: .4 }), wx + .38, wy, z + .045, { cast: false });
      for (let k = 0; k < 14; k++){ const bx = wx + .33 + (k % 2)*.1, by = wy + .16 - Math.floor(k/2)*.05; box(.07, .03, .01, k === 3 || k === 8 ? M.lampGlow : M.creamPlain, bx, by, z + .052, { cast: false }); } }
    { const z = zf(0) - .02;
      for (let k = 0; k < 9; k++) box(.05, .022, .012, k % 4 === 1 ? M.dimAmber : M.creamPlain, .74, ACY + .3 - k*.045, z, { cast: false });
      for (let k = 0; k < 3; k++) cyl(.026, .026, .03, M.chrome, .66, ACY - .05 - k*.1, z - .01, { rx: Math.PI/2, seg: 16 });
      for (const [y, c] of [[ACY - .36, 0xf08a24], [ACY - .36, 0xf0b040]]) box(.07, .04, .02, std({ color: c, emissive: c, emissiveIntensity: .8 }), c === 0xf08a24 ? .7 : .8, y, zf(-.36) - .015, { rx: -tilt(-.36), cast: false });
    }
    // the reference's capsule panelling, all laid on the curved skin: seams, a hatch, a recessed grip, vents, switches, a gauge, screws, stickers
    { const on = (x, dy, w, h, d, mat, lift = 0, o = {}) => box(w, h, d, mat, x, ACY + dy, zf(dy) + lift, Object.assign({ rx: -tilt(dy), cast: false }, o));
      const onR = (x, dy, w, h, d, r, mat, lift = 0) => { const m = add(rbox(w, h, d, r), mat, x, ACY + dy, zf(dy) + lift, { cast: false }); m.rotation.x = -tilt(dy); return m; };
      const screw = (x, dy) => { const m = cyl(.009, .009, .006, M.steel, x, ACY + dy, zf(dy) + .002, { seg: 12, cast: false }); m.rotation.x = Math.PI/2 - tilt(dy); on(x, dy, .012, .002, .002, M.dark, .0055); };
      const vseam = (x, a0, a1) => { const g = new C.TorusGeometry(AR + .001, .0045, 6, 96, a1 - a0); g.rotateZ(Math.PI/2 + a0); g.rotateY(Math.PI/2); add(g, M.dark, x, ACY, AZ, { cast: false }).scale.z = SZ; };
      // seams: the end cap's flat face, between the window bay and the right panels, two more along; the top band and the belly band
      vseam(.83, -.15, Math.PI + .15); vseam(2.3, .05, Math.PI - .05); vseam(3.25, -.05, Math.PI + .05);
      for (const dy of [.43, -.47]) on(2.6, dy, 3.6, .007, .003, M.dark, .001);
      for (const x of [.83, 2.3, 3.25]) for (const dy of [-.35, -.1, .15, .38]) screw(x + .025, dy);
      // the hatch above the light bar
      onR(1.5, .475, .7, .06, .01, .02, M.dark, -.002); onR(1.5, .475, .66, .045, .012, .016, M.skin, .0); screw(1.2, .475); screw(1.8, .475);
      // the recessed grip under the window: a dark well, a chrome bar on two posts
      onR(1.7, -.42, .82, .07, .02, .025, M.dark, -.006); on(1.7, -.42, .74, .016, .022, M.chrome, .01); for (const dx of [-.37, .37]) on(1.7 + dx, -.42, .02, .03, .03, M.chrome, .006);
      // a vent grille to its left, slots in a frame
      onR(1.08, -.42, .2, .06, .008, .01, M.creamPlain, .002); for (let k = 0; k < 6; k++) on(1.0 + k*.032, -.42, .012, .04, .004, M.dark, .006);
      // right of the window: two toggle switches, an orange push lamp, a lever, a round gauge, small plates
      for (const [x, dy] of [[2.12, .06], [2.18, .06]]){ on(x, dy, .03, .06, .008, M.creamPlain, .002); const t = cyl(.005, .005, .035, M.chrome, x, ACY + dy + .015, zf(dy) + .02, { seg: 8, cast: false }); t.rotation.x = .9; }
      onR(2.13, -.07, .06, .035, .02, .01, std({ color: 0xf07a1a, emissive: 0xf07a1a, emissiveIntensity: .7 }), .006); on(2.18, -.16, .08, .012, .02, M.chrome, .008);
      { const gx = 2.75, gy = -.05, z = zf(gy) + .004, rx = -tilt(gy); for (const [r, d, m] of [[.07, .012, M.chrome], [.058, .014, std({ color: 0xe8e0c8, roughness: .3 })]]){ const c = cyl(r, r, d, m, gx, ACY + gy, z + d/2, { seg: 48, cast: false }); c.rotation.x = Math.PI/2 + rx; }
        for (let k = 0; k < 9; k++){ const a = -2.4 + k*.6; on(gx + Math.cos(a)*.045, gy + Math.sin(a)*.045, .004, .012, .002, M.dark, .015, { rz: a + Math.PI/2 }); } on(gx + .015, gy + .01, .04, .004, .003, M.fruit[2], .017, { rz: .6 }); }
      onR(2.75, .2, .22, .1, .006, .01, M.creamPlain, .002); onR(2.75, .2, .1, .04, .004, .006, M.dark, .004);
      // the left end's face: a small screen, a column of buttons, two big knobs, the orange lamps, a slot vent (laid on the skin this time)
      onR(.7, .3, .12, .07, .008, .01, M.blackGlass, .002); on(.7, .3, .08, .012, .002, M.dimGreen, .007);
      for (let k = 0; k < 4; k++) on(.88, .02 - k*.06, .05, .012, .002, M.dark, .002);
      for (const dy of [-.24, -.3, -.36]) on(.88, dy, .1, .008, .004, M.dark, .002); }
    for (const [x, y, w, h, c] of [[3.7, ACY + .22, .18, .1, 0xd6573b], [3.95, ACY + .2, .12, .07, 0x3f6f7a], [3.75, ACY + .05, .25, .04, 0x2c2a26], [4.1, ACY - .1, .1, .1, 0xe0c27a]]){ const dy = y - ACY; box(w, h, .004, std({ color: c, roughness: .5 }), x, y, zf(dy) + .002, { rx: -tilt(dy), cast: false }); }
    { const z = zf(.05); add(rbox(.32, .22, .03, .03), M.creamPlain, 3.0, ACY + .05, z - .005); for (let k = 0; k < 3; k++) cyl(.022, .022, .025, M.dark, 2.9 + k*.1, ACY + .02, z + .012, { rx: Math.PI/2, seg: 12 }); box(.18, .04, .01, M.dimAmber, 3.0, ACY + .11, z + .012, { cast: false }); }
    // the wall beside the capsule, between it and the porthole: olive plates, a conduit with clamps, a cable, a small control box
    for (let y = .98; y < CEIL - .6; y += .56) add(rbox(.62, .52, .03, .02), rnd() < .25 ? M.darkMetal : M.hull, .02, y + .26, .03, { cast: false });
    pipe([[.14, TOP, .12], [.14, 2.4, .12], [.16, 3.4, .14], [.2, CEIL - .7, .3]], .028, M.steel, 7); pipe([[.26, TOP + .2, .07], [.24, 2.0, .09], [.3, 3.6, .1]], .012, M.rubber, 3);
    add(rbox(.2, .3, .08, .02), M.creamPlain, -.04, 2.05, .1); box(.12, .07, .01, M.dimGreen, -.04, 2.13, .145, { cast: false }); for (let k = 0; k < 3; k++) box(.03, .03, .012, k === 1 ? M.lampGlow : M.dark, -.09 + k*.05, 2.0, .145, { cast: false });
    // above it: the hull's ceiling of machinery, tanks and conduits, a box with a vent, a tube light toward the front
    parent = null;
    // the ceiling plane, conduits running toward the camera, the tube light
    add(new C.BoxGeometry(12, .1, 10), M.darkMetal, -1, CEIL + .05, 4.8, { p: hull });   // (the ceiling stops at the porthole wall, so the sun comes in by the window, not over the top)
    box(.05, .05, 1.8, M.tubeGlow, .8, CEIL - .12, -3.4, { cast: false }); box(.1, .06, 1.9, M.dark, .8, CEIL - .06, -3.4);
    // the hanging plant at the top left
    
    // the floor, the striped rug in the sun, petals and crumbs
    const fg = new C.PlaneGeometry(16, 16); fg.rotateX(-Math.PI/2); add(fg, M.floor, 0, 0, -4, { cast: false }).rotation.y = kit.rotation.y;   // (the tile rows run with the kitchen's front)
    parent = G.rug;
    { const rg = new C.PlaneGeometry(1.6, 1.25); rg.rotateX(-Math.PI/2); const m = add(rg, M.rug, .43, .006, -2.8, { cast: false }); m.rotation.y = .583;
      const fr = std({ color: 0xead7a8, roughness: 1 }), ca = Math.cos(.583), sa = Math.sin(.583);   // the fringe on the rug's two short ends
      for (const sd of [-1, 1]) for (let k = 0; k < 27; k++){ const lx = sd*.83, lz = -.6 + k*.046; box(.06, .003, .008, fr, .43 + ca*lx + sa*lz, .007, -2.8 - sa*lx + ca*lz, { ry: .583, cast: false }); } }
    parent = null;
    for (let k = 0; k < 40; k++){ const lf = add(pick(LEAF), pick([M.fruit[0], M.fruit[4], M.leafs[3], M.bread, M.fruit[2]]), rr(-1.0, 1.2), .01, rr(-5.6, -3.8), { s: rr(.5, 1.0), cast: false }); lf.rotation.set(-Math.PI/2 + rr(-.2, .2), 0, rnd()*6); }
    { parent = null;
      for (let k = 0; k < 26; k++){ const a = rnd()*6.3, d = Math.sqrt(rnd())*1.1, lf = add(pick(LEAF), pick([M.leafs[0], M.leafs[3], M.petal[0], M.petal[1], M.leafs[5]]), -.45 + Math.cos(a)*d, .006, -2.27 + Math.sin(a)*d, { s: rr(.8, 1.4), cast: false }); lf.rotation.set(-Math.PI/2 + rr(-.2, .2), 0, rnd()*6.3); }
      for (const sd of [-1, 1]){ const sx = 1.25 + sd*.07, sz = -2.0; add(rbox(.1, .045, .26, .04), std({ color: 0x9a4a3a, roughness: .9 }), sx, .023, sz, { ry: .5 + sd*.12 }); }
      lathe([[0, 0], [.09, 0], [.1, .18], [.07, .2], [0, .2]], M.glazeTeal, .5, 0, -1.25); pipe([[.59, .14, -1.25], [.72, .26, -1.25], [.78, .3, -1.25]], .012, M.glazeTeal); add(new C.TorusGeometry(.07, .01, 6, 16, Math.PI), M.glazeTeal, .5, .2, -1.25, { ry: Math.PI/2 }); }
    // the orange chair at the left edge, the brown cabinet at the right with a bowl of fruit, a plant at its foot
    parent = G.chair;
    { const cx = -.4, cz = -1.3, ca = Math.cos(.6), sa = Math.sin(.6), at = (u, v) => [cx + ca*u + sa*v, cz - sa*u + ca*v];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++){ const [x, z] = at(a*.22, b*.2); add(new C.SphereGeometry(.014, 8, 6), M.dark, x, .575, z, { cast: false }); }
      for (const sd of [-1, 1]){ const [x, z] = at(sd*.48, -.02); add(rbox(.12, .22, .78, .05), M.leather, x, .66, z, { ry: .6 }); }
      const [px, pz] = at(0, .4); box(.86, .02, .02, M.dark, px, .57, pz, { ry: .6, cast: false }); }
    add(rbox(.85, .18, .8, .08), M.leather, -.4, .48, -1.3, { ry: .6 }); add(rbox(.85, .55, .16, .08), M.leather, -.68, .8, -1.5, { ry: .6 }); cyl(.03, .03, .54, M.chrome, -.4, .16, -1.3, { seg: 8 }); cyl(.2, .22, .03, M.chrome, -.4, -.095, -1.3, { seg: 20 });
    parent = G.cabinet;
    { const bx = 2.15, bz = -3.0; add(rbox(.8, .86, .7, .03), M.brownCab, bx, .43, bz); box(.74, .025, .64, M.wood, bx, .87, bz); for (let k = 0; k < 3; k++){ add(rbox(.02, .24, .62, .01), M.brownCab, bx - .41, .18 + k*.27, bz); box(.03, .02, .2, M.chrome, bx - .43, .26 + k*.27, bz); }
      for (let k = 0; k < 3; k++) box(.02, .02, .55, M.dark, bx - .41, .2 + k*.22, bz, { cast: false });
      bowl(bx - .05, .88, bz + .05, .2, 11, M.wood); }
    parent = null;
    // the title sign (outside the reference's frame; seen in the wide view): on the kitchen wall past the capsule
    // the sign is off the wall for now (R.noSign): it is still made, so the bake's on/off swap has something to hold
    const signMat = new C.MeshBasicMaterial({ map: signTex(true), transparent: true, toneMapped: false });
    const sign = new C.Mesh(new C.PlaneGeometry(SIGN.w, SIGN.h), signMat); R.signMesh = sign; R.signOn = signMat.map; R.signOff = signTex(false); R.signLights = []; R.noSign = true;
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
    // the wall over the capsule: olive plates with seams, a cream housing along the top, vents, risers and a cable run
    parent = kit;
    for (let y = 2.95, row = 0; y < CEIL - .2; y += .62, row++) for (let x = -.25 + (row % 2)*.45; x < 4.8; x += .92){
      const w = Math.min(.88, 4.8 - x); if (w < .2) continue;
      add(rbox(w, .58, .03, .02), rnd() < .2 ? M.darkMetal : M.hull, x + w/2, y + .29, .03, { cast: false });
      if (rnd() < .3) for (let i = 0; i < 6; i++) box(w*.5, .012, .015, M.dark, x + w/2, y + .15 + i*.05, .055, { cast: false });
      if (rnd() < .25) box(.1, .05, .02, M.lampGlow, x + .15, y + .45, .05, { cast: false });
    }
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
    // the run over the window (after the reference): bolted cream housings, a ribbed bellows joint between flanged
    // couplings, a grille, drop brackets carrying a lower bar, a round downlight can, a thin conduit down the wall
    { const y = CEIL - .62, z = 1.0, dk = std({ color: 0x5a4a32, roughness: .5, metalness: .4 });
      const housing = (x0, x1, grille) => { const w = x1 - x0, cx = (x0 + x1)/2;
        add(rbox(w, .34, .62, .05), M.cream, cx, y, z);
        for (let x = x0 + .08; x < x1 - .2; x += .48){ add(rbox(.4, .02, .44, .02), M.creamPlain, x + .2, y - .175, z); for (const [dx, dz] of [[.03, .03], [.37, .03], [.03, .41], [.37, .41]]) cyl(.012, .012, .01, M.dark, x + dx, y - .188, z - .22 + dz, { seg: 6, cast: false }); }
        box(w, .03, .03, dk, cx, y - .12, z + .32, { cast: false }); box(w, .03, .03, dk, cx, y - .12, z - .32, { cast: false });
        if (grille) for (let i = 0; i < 9; i++) box(.025, .2, .02, M.dark, x1 - .5 + i*.05, y, z + .315, { cast: false });
      };
      const coupling = x => { cyl(.21, .21, .07, dk, x, y, z, { rz: Math.PI/2, seg: 28 }); for (let k = 0; k < 8; k++){ const a = k/8*Math.PI*2; cyl(.012, .012, .09, M.steel, x, y + Math.cos(a)*.18, z + Math.sin(a)*.18, { rz: Math.PI/2, seg: 6, cast: false }); } };
      housing(-1.6, .75, false); coupling(.79);
      cyl(.13, .13, .9, M.steel, 1.25, y, z, { rz: Math.PI/2, seg: 24 }); for (let x = .85; x <= 1.65; x += .055) add(new C.TorusGeometry(.15, .022, 8, 24), M.chrome, x, y, z, { ry: Math.PI/2, cast: false });
      coupling(1.71); housing(1.75, 2.95, true); coupling(2.99);
      pipe([[3.0, y, z], [3.3, y + .1, z + .3], [3.4, y + .3, z + .9]], .12, M.hull, 0); for (const x of [3.15, 3.3]) add(new C.TorusGeometry(.125, .02, 6, 20), dk, x, y + .03, z - .15, { ry: Math.PI/2, cast: false });
      for (const x of [-1.0, .3, 2.1, 2.7]){ box(.06, .5, .05, dk, x, y + .3, z - .2); box(.66, .05, .07, dk, x, y + .19, z, { cast: false }); }   // (hangers up to the ceiling, straps round the housing)
      
      cyl(.26, .26, .22, M.cream, -2.1, y + .05, z - .05, { seg: 32 }); add(new C.TorusGeometry(.2, .03, 8, 32), M.chrome, -2.1, y - .07, z - .05, { rx: Math.PI/2, cast: false }); cyl(.17, .17, .02, M.downlight, -2.1, y - .05, z - .05, { cast: false, seg: 24 });
      pipe([[2.85, y - .1, z - .3], [2.6, y - .45, .2], [2.68, 3.2, .09], [2.72, 2.0, .08], [2.75, 1.0, .08]], .022, M.steel, 6); }
    // more grooves on the olive bulge round the ring
    for (const r of [RF + .46, RF + .56]) add(new C.TorusGeometry(r, .012, 6, 220), M.dark, 0, Y, .15, { cast: false });
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
    pivot(G.table, -.45, -2.27); pivot(G.chair, -.4, -1.3); pivot(G.cabinet, 2.15, -3.0); pivot(G.rug, .43, -2.8);
    // the owner's arrangement (from the arranging tool), nudged where pieces would clip
    const put = (g, x, y, z, turn, size) => { g.position.set(x, y, z); g.rotation.y = turn*Math.PI/180; g.scale.setScalar(size); g.updateMatrixWorld(true); };
    put(G.chair, -.4, .11, -1.39, 135.5, 1); put(G.cabinet, 2.95, 0, -2.6, -11.5, 1.31); put(G.rug, .12, 0, -4.18, 129.5, 1.05);
    if (R.L) R.reaim();
    R.parts = { kitchen: kit, window: hull, table: G.table, chair: G.chair, cabinet: G.cabinet, rug: G.rug };
    box(16, 6, .3, M.dark, 0, 2, -8.5);   // (the shell outside: the sun only comes in by the window)
    // a pendant lamp over the table: a cord from the ceiling, a brass cap, a cream dome shade, a bulb (lit in the evening and at night)
    LAMPF = 1; { const p = G.table.position; R.lampPivot = new C.Vector3(p.x, CEIL, p.z); cyl(.004, .004, CEIL - 1.95, M.dark, p.x, (CEIL + 1.95)/2, p.z, { seg: 6, cast: false }); cyl(.03, .04, .06, M.brass, p.x, 1.95, p.z, { seg: 24 });
      lathe([[.03, 0], [.06, -.02], [.17, -.12], [.2, -.17], [.205, -.18], [.19, -.18], [.16, -.13], [.05, -.03]], M.cream, p.x, 1.92, p.z, { seg: 64 });
      add(new C.SphereGeometry(.045, 24, 16), M.pendant, p.x, 1.77, p.z, { cast: false }); } LAMPF = 0;
  };

  /* ---------- light ---------- */
  /* ---------- light ----------
     The room turns slowly (the title screen spins the city outside), so the sun comes in at a different angle as it goes.
     R.light makes the lights once; R.setTime picks the hour (morning, day, evening, night: colours, how high the sun is,
     the lamps at night); R.setSun(theta) puts the sun theta radians round from straight out of the window (null: none),
     and lays the first bounce for it. The bake renders a few headings and the title screen blends between them. */
  let SC_ = null, bounce = [], TIME = null;
  // the city's own light at each hour (sampled from the game's looks: its sun, its sky and ground fill), so the pod and
  // the city outside are lit by the same sky. grade: the picture's highlight and shadow tints, from the sun and the sky.
  const TIMES = {
    morning: { sunC: 0xfed9b0, sunI: 5.6, elev: 34, sky: 0xb4cce4, skyI: .38, hemi: [0xb4cce4, 0x7a6a5a, .06], amb: .02, b5: .25, fill: [0xb4cce4, .1], post: [1, .85, .69], density: .28, lamps: 0, grade: [[1.06, 1.0, .9], [.88, .95, 1.02]] },
    day: { sunC: 0xfef0d4, sunI: 5.4, elev: 52, sky: 0xc4dcf0, skyI: .48, hemi: [0xc4dcf0, 0x8a7a66, .08], amb: .03, b5: .2, fill: [0xc4dcf0, .14], post: [1, .94, .83], density: .2, lamps: 0, grade: [[1.03, 1.0, .95], [.9, .97, 1.03]] },
    evening: { sunC: 0xfeb468, sunI: 5.2, elev: 16, sky: 0xb8979a, skyI: .3, hemi: [0xb8979a, 0x5a3a30, .05], amb: .015, b5: .3, fill: [0xb8979a, .08], post: [1, .7, .41], density: .34, lamps: .45, grade: [[1.1, .98, .82], [.92, .86, .92]] },
    night: { sunC: 0x7086c9, sunI: 2.0, elev: 40, sky: 0x34507a, skyI: .14, hemi: [0x34507a, 0x1a1f2e, .05], amb: .012, b5: .12, fill: [0x34507a, .05], post: [.44, .53, .79], density: .1, lamps: 1, grade: [[.98, .96, 1.0], [.82, .9, 1.08]] },
  };
  R.TIMES = Object.keys(TIMES);
  R.light = sc => {
    SC_ = sc;
    const sun = new C.DirectionalLight(0xffc27c, 5.6);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .012;
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .5, far: 30 });
    sc.add(sun, sun.target); R.L = { sun };
    // the sky through the glass: three soft shadowed spots spread over the disc, pointing in
    hull.updateMatrixWorld(true); R.L.sky = []; const n = R.winNormal();
    for (const [lx, ly] of [[-.45, .35], [.45, .35], [0, -.4]]){ const sp = new C.SpotLight(0xffe2bc, .32, 10, 1.25, 1, 1.4);
      sp.position.copy(new C.Vector3(lx, WC.y + ly, -WIN.depth + .08).applyMatrix4(hull.matrixWorld)); sp.target.position.copy(sp.position).addScaledVector(n, 4).add(new C.Vector3(0, -1.2, 0));
      sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -.0006; sp.shadow.normalBias = .02; sc.add(sp, sp.target); R.L.sky.push(sp); }
    R.L.hemi = new C.HemisphereLight(0xffe0b0, 0x3a3428, .04); R.L.amb = new C.AmbientLight(0x5a4a3a, .02); sc.add(R.L.hemi, R.L.amb);
    R.L.b5 = new C.PointLight(0xffb070, .3, 3.5, 2); R.L.b5.position.set(.8, 4.25, -3.6); sc.add(R.L.b5);
    R.L.fill = new C.DirectionalLight(0xd8c8b0, .1); R.L.fill.position.set(-3, 3.2, -1.5); R.L.fill.target.position.set(2, .9, -6); sc.add(R.L.fill, R.L.fill.target);
    // the lamps, for the evening and the night: the puck lights under the capsule, the ceiling downlight, the pendant over the table
    kit.updateMatrixWorld(true); R.L.lamps = [];
    for (const x of [1.0, 2.0, 3.0]){ const l = new C.PointLight(0xffc888, 0, 1.9, 2); l.position.copy(new C.Vector3(x, 1.58, .4).applyMatrix4(kit.matrixWorld)); sc.add(l); R.L.lamps.push([l, .7]); }
    { const l = new C.SpotLight(0xffc890, 0, 7, .9, .8, 1.6); l.position.copy(toWorld(-2.1, CEIL - .72, .95)); l.target.position.copy(l.position).add(new C.Vector3(0, -3, 0)); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.0006; sc.add(l, l.target); R.L.lamps.push([l, 2.2]); }
    { const p = G.table.position; const l = new C.PointLight(0xffb870, 0, 3.2, 2); l.position.set(p.x, 1.72, p.z); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.001; sc.add(l); R.L.lamps.push([l, 1.4]); }
    R.setTime('morning'); R.setSun(0);
    return sun;
  };
  R.setTime = t => {
    const T = TIMES[t]; TIME = T; const L = R.L;
    L.sun.color.set(T.sunC); for (const sp of L.sky){ sp.color.set(T.sky); sp.intensity = T.skyI; }
    L.hemi.color.set(T.hemi[0]); L.hemi.groundColor.set(T.hemi[1]); L.hemi.intensity = T.hemi[2]; L.amb.intensity = T.amb; L.b5.intensity = T.b5;
    L.fill.color.set(T.fill[0]); L.fill.intensity = T.fill[1];
    for (const [l, k] of L.lamps) l.intensity = k*T.lamps; M.pendant.emissiveIntensity = T.lamps*1.6; M.downlight.color.set(T.lamps ? 0xffe8c0 : 0x8a8070);
    return { sunCol: T.post, density: T.density, sunny: T.sunI > 0, grade: T.grade };
  };
  // theta: the sun's heading round from the window's outward normal (radians), at the hour's height; null: no sun
  R.setSun = theta => {
    const L = R.L, wc = R.winCenter(), out = R.winNormal().negate();
    for (const b of bounce) SC_.remove(b); bounce = [];
    const e = TIME.elev*Math.PI/180, th = theta ?? 0, c = Math.cos(th), s_ = Math.sin(th);
    const dir = new C.Vector3(out.x*c - out.z*s_, 0, out.x*s_ + out.z*c).multiplyScalar(Math.cos(e)); dir.y = Math.sin(e);
    L.sun.position.copy(wc).addScaledVector(dir, 9); L.sun.target.position.copy(wc).addScaledVector(dir, -3); L.sun.target.updateMatrixWorld(); L.sun.updateMatrixWorld();
    L.sun.intensity = theta === null ? 0 : TIME.sunI;
    if (theta === null || !TIME.sunI) return;
    // the first bounce: shoot the sun's beam through the glass, and where it lands put a dim light the colour of that surface
    // (instant radiosity: whatever the beam lights throws warm light back into the room)
    SC_.updateMatrixWorld(true);
    const rc = new C.Raycaster(), hits = [], solids = []; SC_.traverse(o => { if (o.isMesh && o.material && o.material.colorWrite !== false && !o.material.transparent && o.visible) solids.push(o); });
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++){ const u = (i + .5)/7*2 - 1, v = (j + .5)/7*2 - 1; if (u*u + v*v > 1) continue;
      const o = new C.Vector3(u*WIN.r2*.95, WC.y + v*WIN.r2*.95, -WIN.depth - .05).applyMatrix4(hull.matrixWorld).addScaledVector(dir, .02);
      rc.set(o, dir.clone().negate()); const h = rc.intersectObjects(solids, false)[0]; if (h && h.distance < 12) hits.push(h); }
    const sunC = new C.Color(TIME.sunC);
    for (const h of hits){ const m = h.object.material, alb = (m.color ? m.color.clone() : new C.Color(1, 1, 1)); if (m.map) alb.multiplyScalar(.75);
      const nrm = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new C.Vector3(0, 1, 0);
      const l = new C.PointLight(alb.multiply(sunC), 1.6/Math.max(8, hits.length)*8*.22*TIME.sunI/5.6, 3.2, 2); l.position.copy(h.point).addScaledVector(nrm, .18); SC_.add(l); bounce.push(l); }
  };
  R.reaim = () => { if (R.L) R.setSun(0); };
  R.cubeAt = [.6, 1.4, -3.4];
  return R;
})();
