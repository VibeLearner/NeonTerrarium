// Walk mode: real 3D plants in place of the game's plant sprites, cloth laundry in place of the laundry sprites, and
// signs drawn in code. Every plant is built from leaves (a small folded diamond, instanced) on stems, sized and placed
// exactly where the game put its sprite.
'use strict';
const PLANTS = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a)*rnd(), pick = a => a[Math.floor(rnd()*a.length)];
  const GREENS = ['#2f4a24', '#3f5a2c', '#4d6e2e', '#6b8a3a', '#7d9a40', '#8fa04a', '#35562e', '#567a34'];
  const GREENS_DARK = ['#22381c', '#2f4a24', '#3a5428'];
  const SUCC = ['#6f9a7a', '#7fae8a', '#9cbf8a', '#5f8a70', '#a8c49a'];
  const FLOWERS = ['#ff7fb0', '#f6b35c', '#ffffff', '#d9534f', '#c97aff', '#ffd23a'];

  // a leaf: base at the origin, tip at +y, folded along its middle (so it has a light and a dark half)
  function leafGeo(){
    const g = new THREE.BufferGeometry();
    const P = [0, 0, 0, -.5, .42, .14, 0, 1, 0,   0, 0, 0, 0, 1, 0, .5, .42, .14];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
  const leaves = [], blooms = [], stems = [];
  // one leaf at p, pointing along (yaw, pitch from straight up), length L, width W
  function leaf(x, y, z, yaw, pitch, L, W, col, roll = 0){ leaves.push([x, y, z, yaw, pitch, roll, L, W, col]); }
  function stem(ax, ay, az, bx, by, bz, r, col){ stems.push([ax, ay, az, bx, by, bz, r, col]); }

  // ---- the kinds ----
  function bush(x, y, z, w, h, flowers){   // a mound of leaves
    const n = Math.min(70, Math.round(16 + w*h*260));
    for (let k = 0; k < n; k++){
      const a = rnd()*Math.PI*2, u = Math.sqrt(rnd()), up = rnd();
      const px = x + Math.cos(a)*u*w*.45, pz = z + Math.sin(a)*u*w*.45, py = y + up*h*.8*(1 - u*.5);
      leaf(px, py, pz, a + rr(-.6, .6), rr(.4, 1.3)*(.5 + u*.6), rr(.045, .08), rr(.03, .05), pick(up > .6 ? GREENS.slice(3) : GREENS), rr(-.4, .4));
    }
    if (flowers) for (let k = 0; k < n/6; k++){ const a = rnd()*Math.PI*2, u = Math.sqrt(rnd()); blooms.push([x + Math.cos(a)*u*w*.42, y + h*rr(.45, .85), z + Math.sin(a)*u*w*.42, rr(.012, .02), flowers === true ? pick(FLOWERS) : flowers]); }
  }
  function fern(x, y, z, w, h){   // fronds arching out of the middle, leaflets in pairs along each
    const n = Math.round(rr(6, 9)), col = pick(GREENS.slice(2));
    for (let f = 0; f < n; f++){
      const a = f/n*Math.PI*2 + rr(-.2, .2), len = h*rr(.8, 1.15), steps = 6;
      let px = x, py = y, pz = z, pitch = rr(.25, .55);
      for (let s = 0; s < steps; s++){
        const t = s/steps, seg = len/steps, dx = Math.cos(a)*Math.sin(pitch), dz = Math.sin(a)*Math.sin(pitch), dy = Math.cos(pitch);
        const nx = px + dx*seg, ny = py + dy*seg, nz = pz + dz*seg; stem(px, py, pz, nx, ny, nz, .004, '#3f5a2c');
        const L = .065*(1 - t*.6) + .02, Wd = L*.45;
        leaf(nx, ny, nz, a + Math.PI/2, Math.PI/2 + .3, L, Wd, col); leaf(nx, ny, nz, a - Math.PI/2, Math.PI/2 + .3, L, Wd, col);
        px = nx; py = ny; pz = nz; pitch += .22;
      }
    }
  }
  function succulent(x, y, z, w){   // a tight rosette of fat leaves
    const n = 14, col = pick(SUCC), r = Math.max(.03, w*.35);
    for (let k = 0; k < n; k++){ const a = k*2.4, t = k/n; leaf(x, y + .005, z, a, .35 + t*.9, r*(1 - t*.45) + .02, r*.55, col); }
  }
  function hanging(x, y, z, w, h, yaw, heart){   // strands falling from a ledge, leafy all the way down
    const strands = Math.max(2, Math.round(w*5)), tx = Math.cos(yaw), tz = -Math.sin(yaw);
    for (let s = 0; s < strands; s++){
      const off = (s/(strands - 1 || 1) - .5)*w, len = h*rr(.4, .8), sx = x + tx*off + rr(-.02, .02), sz = z + tz*off + rr(-.02, .02);
      const steps = Math.max(3, Math.round(len/.055)); let py = y, px = sx, pz = sz, sway = rr(-1, 1), sy0 = y, sx0 = sx, sz0 = sz;
      for (let q = 0; q < steps; q++){
        const ny = py - len/steps, nx = px + Math.sin(q*.7 + sway)*.012, nz = pz + Math.cos(q*.5 + sway)*.012;
        for (let l = 0; l < 2; l++) leaf(nx + rr(-.012, .012), ny, nz + rr(-.012, .012), rnd()*Math.PI*2, Math.PI*rr(.5, .9), heart ? rr(.05, .065) : rr(.045, .065), heart ? .05 : .032, pick(heart ? ['#5f9a3a', '#7fae4a', '#4d7e2e', '#3f6e2a'] : GREENS));
        px = nx; py = ny; pz = nz;
      }
      stem(sx0, sy0, sz0, px, py, pz, .004, '#2f4a24');
    }
  }
  function bonsai(x, y, z, w, h){
    let px = x, py = y, pz = z;
    for (let s = 0; s < 4; s++){ const nx = px + rr(-.04, .04), ny = py + h*.15, nz = pz + rr(-.04, .04); stem(px, py, pz, nx, ny, nz, .018 - s*.003, '#6a4a32'); px = nx; py = ny; pz = nz; }
    for (let c = 0; c < 4; c++) bush(px + rr(-w*.3, w*.3), py + rr(-.05, .08), pz + rr(-w*.3, w*.3), w*.5, h*.35);
  }
  function bamboo(x, y, z, w, h){
    for (let s = 0; s < 5; s++){ const bx = x + rr(-w*.3, w*.3), bz = z + rr(-w*.3, w*.3), H = h*rr(.7, 1);
      stem(bx, y, bz, bx + rr(-.03, .03), y + H, bz + rr(-.03, .03), .012, '#7d9a40');
      for (let q = 0; q < 6; q++) leaf(bx, y + H*rr(.4, 1), bz, rnd()*Math.PI*2, rr(1, 1.6), .07, .02, pick(GREENS)); }
  }

  // ---- laundry: cloth shapes on the line, top at y ----
  const CLOTH = { blue: '#6fa8dc', peach: '#f2b48a', rose: '#e87a9a', sage: '#9cb38a', butter: '#f2dc7a', lilac: '#b8a0e0', pink: '#ff8fb8', cream: '#eee6d0', green: '#5f9a6a' };
  const cloth = [];
  // the clothes lines the game strung (sagging cables and balcony rails), to hang each garment from
  let LINES = [];
  function onLine(x, y, z){
    let best = null, bd = .32;
    for (const L of LINES) for (let i = 0; i < L.length - 1; i++){
      const a = L[i], b = L[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx*dx + dy*dy + dz*dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - a[0])*dx + (y - a[1])*dy + (z - a[2])*dz)/l2));
      const px = a[0] + dx*t, py = a[1] + dy*t, pz = a[2] + dz*t, d = Math.hypot(px - x, (py - y)*.7, pz - z);
      if (d < bd){ bd = d; best = { x: px, y: py, z: pz, yaw: Math.atan2(-dz, dx) }; }
    }
    return best;
  }
  function laundry(kind, x, y, z, yaw, k){
    const L = onLine(x, y, z); if (L){ x = L.x; y = L.y - .008; z = L.z; yaw = L.yaw; }
    const col = CLOTH[(kind.split('_')[2] || '')] || (kind === 'l_jeans' ? '#3f5f8a' : kind === 'l_socks' ? '#e6e6e2' : '#cccccc');
    const shape = /tee|shirt/.test(kind) ? 'tee' : kind === 'l_jeans' ? 'jeans' : kind === 'l_socks' ? 'socks' : 'towel';
    cloth.push({ x, y, z, yaw, s: k*.0556, shape, col, stripe: rnd() < .35 ? pick(['#ffffff', '#2a2f38', '#d9534f', '#3f8f8a']) : null, ph: rr(0, 6.3), amp: rr(.6, 1.2) });
  }
  // a garment as a real piece of cloth: a grid in its outline, folds that deepen toward the hem, a sag, pegs on the line
  function clothGeometry(){
    const P = [], N = [], C = [], I = [], _c2 = new THREE.Color(), _c3 = new THREE.Color();
    const SH = { tee: [10, 9], jeans: [6, 11], socks: [6, 5], towel: [8, 10] };
    const keep = (sh, i, j, W, H) => sh === 'tee' ? (j < 3 || Math.abs(i + .5 - W/2) < 3.2) : sh === 'jeans' ? (j < 2 || Math.abs(i + .5 - W/2) > .8) : sh === 'socks' ? (Math.abs(i + .5 - W/2) > 1.0) : true;
    for (const g of cloth){
      const [W, H] = SH[g.shape], s = g.s, cy = Math.cos(g.yaw), sy = Math.sin(g.yaw);
      const vx = (u, v) => { const lx = (u - W/2)*s, ly = -v*s, f = v/H;
        const dz = Math.sin(u*1.3 + g.ph)*.012*g.amp*(.3 + f) + f*f*.02*g.amp + Math.sin(u*.6 + g.ph*2.)*.006;
        return [g.x + lx*cy + dz*sy, g.y + ly - Math.abs(Math.sin(u/W*Math.PI))*.006, g.z - lx*sy + dz*cy]; };
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){
        if (!keep(g.shape, i, j, W, H)) continue;
        const base = P.length/3, q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        for (const [u, v] of q){ P.push(...vx(u, v));
          _c2.set(g.col); if (g.stripe && Math.floor(v) % 3 === 1) _c2.lerp(_c3.set(g.stripe), .7);
          const fold = .82 + .18*Math.sin(u*1.3 + g.ph + 1.2); _c2.multiplyScalar(fold*(1 - v/H*.12)); C.push(_c2.r, _c2.g, _c2.b); }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      // two pegs on the line
      for (const u of [.6, W - .6]){ const [px, py, pz] = vx(u, 0); const base = P.length/3;
        const pw = .008, ph = .03; for (const [ox, oy] of [[-pw, .008], [pw, .008], [pw, -ph], [-pw, -ph]]){ P.push(px + ox*cy, py + oy, pz - ox*sy); C.push(.55, .38, .22); }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I); geo.computeVertexNormals();
    return geo;
  }

  // ---- signs drawn in code: a pixel font, neon colours ----
  const FONT = { A:'0110 1001 1111 1001 1001', B:'1110 1001 1110 1001 1110', C:'0111 1000 1000 1000 0111', D:'1110 1001 1001 1001 1110', E:'1111 1000 1110 1000 1111', F:'1111 1000 1110 1000 1000', G:'0111 1000 1011 1001 0111', H:'1001 1001 1111 1001 1001', I:'111 010 010 010 111', K:'1001 1010 1100 1010 1001', L:'1000 1000 1000 1000 1111', M:'10001 11011 10101 10001 10001', N:'1001 1101 1011 1001 1001', O:'0110 1001 1001 1001 0110', P:'1110 1001 1110 1000 1000', R:'1110 1001 1110 1010 1001', S:'0111 1000 0110 0001 1110', T:'11111 00100 00100 00100 00100', U:'1001 1001 1001 1001 0110', W:'10001 10001 10101 11011 10001', X:'1001 1001 0110 1001 1001', Y:'10001 01010 00100 00100 00100', ' ':'00 00 00 00 00' };
  const NEON = { pink: '#ff4fa3', cyan: '#38e8e0', amber: '#ffb347', green: '#5aff7a', violet: '#b070ff' };
  const WORDS = { ramen: 'RAMEN', noodles: 'NOODLES', noodlesP: 'NOODLES', plant: 'PLANTS', cocktail: 'BAR', hotel: 'HOTEL', bakery: 'BAKERY', fixit: 'FIX IT', mw: 'MW', bar: 'BAR', import: 'IMPORT', export: 'EXPORT', dome: 'DOME', arakawa: 'ARAKAWA', coffee: 'COFFEE', laundry: 'LAUNDRY', repair: 'REPAIR', music: 'MUSIC', arcade: 'ARCADE', clinic: 'CLINIC', books: 'BOOKS', records: 'RECORDS', games: 'GAMES' };
  function signCanvas(kind, wpx, hpx){
    const c = document.createElement('canvas'); c.width = wpx; c.height = hpx; const g = c.getContext('2d');
    const parts = kind.split('_'), colName = NEON[parts[parts.length - 1]] ? parts[parts.length - 1] : pick(Object.keys(NEON));
    const col = NEON[colName]; g.fillStyle = '#120c1c'; g.fillRect(0, 0, wpx, hpx); g.fillStyle = col;
    const word = WORDS[parts[1]] || WORDS[parts[2]];
    if (word && /^sign_/.test(kind)){
      const glyphs = [...word].map(ch => (FONT[ch] || FONT[' ']).split(' ')), tw = glyphs.reduce((n, gl) => n + gl[0].length + 1, -1);
      const sc = Math.max(1, Math.floor(Math.min((wpx - 2)/tw, (hpx - 2)/5))), ox = Math.floor((wpx - tw*sc)/2), oy = Math.floor((hpx - 5*sc)/2);
      let cx = ox; for (const gl of glyphs){ for (let r = 0; r < 5; r++) for (let q = 0; q < gl[r].length; q++) if (gl[r][q] === '1') g.fillRect(cx + q*sc, oy + r*sc, sc, sc); cx += (gl[0].length + 1)*sc; }
      g.strokeStyle = col; g.strokeRect(.5, .5, wpx - 1, hpx - 1);
    } else {   // made-up script, block by block (the glyph signs)
      const vert = hpx > wpx, n = Math.max(1, Math.floor((vert ? hpx : wpx)/6));
      for (let b = 0; b < n; b++){ const bx = vert ? 1 : 1 + b*6, by = vert ? 1 + b*6 : 1; for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) if (rnd() < .45 || (r === 2 && q < 4)) g.fillRect(bx + q, by + r, 1, 1); }
    }
    return { c, col };
  }
  const signs = [];

  // ---- build from the export ----
  function build(meta){
    LINES = meta.lines || [];
    const PX = meta.PX, out = { };
    const seen = new Set();
    for (const kind in meta.fol){
      const sz = meta.sizes[kind] || [16, 16];
      for (const e of meta.fol[kind]){
        const [x, y, z, sx, sy, yaw, an, fixed] = e;
        const key = kind + (x*50 | 0) + ',' + (y*50 | 0) + ',' + (z*50 | 0); if (seen.has(key)) continue; seen.add(key);   // (the crossed pairs: one plant)
        const w = sz[0]/PX*sx, h = sz[1]/PX*sy;
        const base = an === 1 ? y - h : an === .5 || (an > .2 && an < .8) ? y - h*an : y;   // the bottom of the sprite
        if (/^l_/.test(kind)) laundry(kind, x, an === 1 ? y : base + h, z, yaw, sy);
        else if (/^(sign_|glyph_)/.test(kind)) signs.push({ kind, x, y: base + h/2, z, w, h, yaw, wpx: sz[0], hpx: sz[1], fixed });
        else if (kind === 'succulent') succulent(x, base, z, w);
        else if (/fern/.test(kind)) fern(x, base, z, w, h);
        else if (kind === 'bonsai') bonsai(x, base, z, w, h);
        else if (kind === 'bamboo') bamboo(x, base, z, w, h);
        else if (/^(h_|w_)/.test(kind) || an === 1) hanging(x, base + h, z, w, h, yaw, kind === 'h_heart' || kind === 'pothos');
        else if (kind === 'vines' || kind === 'pothos') hanging(x, base + h, z, w*.6, h, yaw, kind === 'pothos');
        else if (kind === 'bushFlower' || kind === 'g_flowers') bush(x, base, z, w, h, true);
        else bush(x, base, z, w, h);
      }
    }
    return out;
  }
  function meshes(mkMat){
    const group = new THREE.Group();
    // leaves
    const LG = leafGeo(), LM = mkMat({ side: THREE.DoubleSide, vertexColors: false }, 'leaf');
    const IL = new THREE.InstancedMesh(LG, LM, leaves.length); IL.castShadow = true; IL.receiveShadow = true;
    leaves.forEach((l, i) => { const [x, y, z, yaw, pitch, roll, L, W, col] = l;
      _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(W, L, W)); IL.setMatrixAt(i, _m);
      _c.set(col).offsetHSL(rr(-.01, .01), 0, rr(-.04, .04)); IL.setColorAt(i, _c); });
    group.add(IL);
    // flowers and stems
    if (blooms.length){ const IB = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mkMat({}, 'leaf'), blooms.length);
      blooms.forEach((b, i) => { _m.compose(_p.set(b[0], b[1], b[2]), _q.identity(), _s.setScalar(b[3])); IB.setMatrixAt(i, _m); IB.setColorAt(i, _c.set(b[4])); }); group.add(IB); }
    if (stems.length){ const IS = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 4), mkMat({}, 'leaf'), stems.length); IS.castShadow = true;
      const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
      stems.forEach((s, i) => { const [ax, ay, az, bx, by, bz, r, col] = s; d.set(bx - ax, by - ay, bz - az); const L = d.length() || 1e-4; _q.setFromUnitVectors(up, d.normalize());
        _m.compose(_p.set((ax + bx)/2, (ay + by)/2, (az + bz)/2), _q, _s.set(r, L, r)); IS.setMatrixAt(i, _m); IS.setColorAt(i, _c.set(col)); }); group.add(IS); }
    // laundry: real cloth
    if (cloth.length){ const cm = new THREE.Mesh(clothGeometry(), mkMat({ vertexColors: true, side: THREE.DoubleSide }, 'cloth')); cm.castShadow = true; cm.receiveShadow = true; group.add(cm); }
    // signs
    for (const s of signs){
      const { c, col } = signCanvas(s.kind, s.wpx, s.hpx), t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.encoding = THREE.sRGBEncoding;
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), m);
      q.position.set(s.x, s.y, s.z); q.rotation.y = s.fixed ? s.yaw : Math.PI/4; q.userData.sign = col; group.add(q);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ color: 0x120c1c })); back.position.copy(q.position); back.rotation.y = q.rotation.y + Math.PI; group.add(back);
    }
    return group;
  }
  function prune(ok){
    const keep = (arr, f) => { let w = 0; for (const e of arr) if (f(e)) arr[w++] = e; arr.length = w; };
    keep(leaves, l => ok(l[0], l[1], l[2])); keep(blooms, b => ok(b[0], b[1], b[2]));
    keep(stems, s => ok((s[0] + s[3])/2, (s[1] + s[4])/2, (s[2] + s[5])/2));
  }
  return { build, meshes, prune, counts: () => ({ leaves: leaves.length, blooms: blooms.length, stems: stems.length, cloth: cloth.length, signs: signs.length }) };
})();
