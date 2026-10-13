// Neon Terrarium: the special roles of the character generator (peoplegen.js): the police officer, the club's bouncers, the Data Spire's archivist, the lurkers on the dark streets, and the emote bubbles. Each is
// a shape with a fixed palette (a special palette row), picked by the old row people.js already uses (12, 15, 16, 9 to 11, 14). Runs after peoplegen_parts.js. No Math.random, no Date.
(() => {
  const IX = PG.IX;
  // a special palette: the base colours, with the top, bottom, hair, skin, lit accent and cap colours replaced (shades derived by the same rule as the mixes)
  const pal = (name, o) => {
    const c = PG.palColors(o.skin === undefined ? 0 : o.skin, 0, 0, 0, 1);
    if (o.top !== undefined){ c[IX.TOP] = o.top; c[IX.TOP2] = PG.shade(o.top, -.32); c[IX.TOP3] = PG.shade(o.top, .28); }
    if (o.bot !== undefined){ c[IX.BOT] = o.bot; c[IX.BOT2] = PG.shade(o.bot, -.3); c[IX.SHOE] = PG.mixc(PG.shade(o.bot, -.5), 0x0c0a12, .4); }
    if (o.hair !== undefined){ c[IX.HAIR] = o.hair; c[IX.HAIR2] = PG.shade(o.hair, .3); }
    if (o.lit !== undefined){ c[IX.LIT] = o.lit; c[IX.ACC] = o.acc !== undefined ? o.acc : PG.shade(o.lit, -.4); } else if (o.acc !== undefined) c[IX.ACC] = o.acc;
    PG.specialPalettes.push({ name, colors: c });
    return PG.NPAL_MIX + PG.specialPalettes.length - 1;
  };
  const shape = (name, body, hair, hat, top, bottom, props) => PG.addShape({ name, body, hair, hat, top, bottom, props: props || [] });
  const parts = PG.parts, hy = k => k.headTop + k.nod;
  // ---------- the parts of the roles (registered here, named r_*; the face parts take the head's place from the skeleton, so they work as props) ----------
  // the officer: a peaked cap with a lit badge, a uniform jacket with a badge, shoulder boards and a belt, a handheld scanner (drawn in the scanner frames only)
  parts.hat.r_copcap = { draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP); c.rect(x + 1, y - 2, 2, 1, IX.TOP3); c.rect(x, y, 4, 1, IX.TOP2); c.rect(x + 3, y, 2, 1, IX.SHOE); c.set(x + 2, y - 1, IX.LIT); c.set(x, y + 1, IX.HAIR); c.set(x, y + 2, IX.HAIR); } };
  parts.top.r_uniform = { sleeve: 'long',
    torso(c, k){ const x0 = k.torso.x0, x1 = k.torso.x1, y = k.shoulderY; c.set(x0 + 1, y, IX.TOP3); c.set(x1 - 1, y + 1, IX.LIT); c.set(x1 - 1, y, IX.WHITE); c.rect(x0, k.hipY - 1, k.bw, 1, IX.BOT2); c.set(x1 - 1, k.hipY - 1, IX.WHITE); },
    arm(c, k, near){ const sh = near ? k.nearSh : k.farSh; if (near) c.set(sh[0], sh[1], IX.LIT); },
    front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); } };
  // a bouncer: a black suit jacket over a red shirt and tie, a lit red armband, dark glasses
  parts.top.r_suit = { sleeve: 'long',
    torso(c, k){ const x0 = k.torso.x0, x1 = k.torso.x1, y = k.shoulderY; c.set(x0 + 1, y, IX.TOP3); c.rect(x1 - 2, y, 2, 1, IX.LIT); c.set(x1 - 1, y + 1, IX.LIT); c.set(x1 - 1, y + 2, IX.ACC); c.set(x1 - 2, y + 1, IX.TOP2); },
    arm(c, k, near){ if (near){ const e = k.nearElbow; c.set(Math.round(e[0]), Math.round(e[1]), IX.LIT); } },
    front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); } };
  parts.prop.r_shades = { layer: 'front', draw(c, k){ const x = k.hx, y = hy(k); c.rect(x + 1, y + 2, 3, 1, IX.OUT); c.set(x + 2, y + 2, IX.EYE); c.set(x + 3, y + 1, IX.OUT); c.set(x + 3, y + 2, IX.LIT); c.set(x, y + 1, IX.OUT); } };
  // the handheld scanner: held out in the scanner frames (a lit screen that blinks, a thin beam)
  parts.prop.r_scanner = { layer: 'front', draw(c, k){ if (!k.extra || k.extra.device === undefined) return; const h = k.nearHand, n = k.extra.device;
    c.rect(h[0], h[1] - 2, 2, 2, IX.ACC); c.set(h[0] + 1, h[1] - 2, n % 2 ? IX.WHITE : IX.LIT); c.set(h[0], h[1] - 2, IX.LIT); if (n % 3 === 0) c.set(h[0] + 1, h[1] - 3, IX.LIT); } };
  // the archivist: a hooded cowl with a dark face and one lit eye, a long robe to the ankles, a cord, a book
  parts.hat.r_cowl = { draw(c, k, look, x, y){
    c.rect(x - 1, y - 1, 5, 1, IX.TOP); c.rect(x, y - 2, 3, 1, IX.TOP3); c.rect(x - 1, y, 6, 1, IX.TOP2); c.rect(x - 1, y + 1, 2, 4, IX.TOP2); c.rect(x - 1, y + 4, 4, 1, IX.TOP2);
    c.rect(x + 1, y + 1, 3, 3, IX.OUT); c.set(x + 4, y, IX.TOP); c.set(x + 4, y + 1, IX.TOP2); c.set(x + 3, y + 2, IX.LIT); c.set(x + 3, y + 3, IX.SKIN2); } };
  parts.top.r_robe = { sleeve: 'long',
    torso(c, k){ c.set(k.torso.x0 + 1, k.shoulderY, IX.TOP3); c.rect(k.torso.x0, k.hipY - 1, k.bw, 1, IX.ACC); c.set(k.torso.x1 - 1, k.hipY - 1, IX.LIT); },
    front(c, k){ const sw = Math.round((k.swing || 0)*.8); for (let y = k.hipY; y <= CHm2; y++){ const j = y - k.hipY, w = k.bw + 1 + (j > 1 ? 1 : 0), x0 = k.torso.x0 - (j > 1 ? 1 : 0) + (j > 0 ? sw : 0);
      for (let i = 0; i < w; i++) c.set(x0 + i, y, i === 0 || (j > 2 && i === 2) ? IX.TOP2 : (i === w - 1 ? IX.TOP2 : IX.TOP)); }
      c.set(k.torso.x1, k.hipY, IX.LIT); c.set(k.torso.x1, k.hipY + 1, IX.ACC); } };
  const CHm2 = PG.CH - 2;
  parts.prop.r_book = { layer: 'front', draw(c, k){ const h = k.nearHand; c.rect(h[0], h[1] - 1, 2, 2, IX.ACC); c.set(h[0] + 1, h[1] - 1, IX.WHITE); c.set(h[0], h[1], IX.LIT); } };
  // the lurkers. A: a low hood, a dark face with two lit slits and a mask, a hoodie with a pouch
  parts.hat.r_lurkhood = { draw(c, k, look, x, y){
    c.rect(x - 1, y - 1, 5, 2, IX.TOP2); c.rect(x - 1, y + 1, 2, 4, IX.TOP2); c.set(x + 1, y - 1, IX.TOP3); c.rect(x + 3, y, 2, 1, IX.TOP2);
    c.rect(x + 1, y + 1, 3, 3, IX.OUT); c.set(x + 2, y + 2, IX.LIT); c.set(x + 3, y + 2, IX.LIT); c.set(x + 4, y + 1, IX.TOP2); c.set(x + 3, y + 3, IX.ACC); c.set(x + 2, y + 3, IX.ACC); } };
  parts.top.r_pouch = { sleeve: 'long',
    torso(c, k){ const x0 = k.torso.x0; c.set(x0 + 1, k.shoulderY, IX.TOP3); c.rect(x0 + 1, k.hipY - 2, 2, 1, IX.TOP2); c.set(k.torso.x1 - 1, k.shoulderY + 1, IX.LIT); },
    arm(c, k, near){ const hd = near ? k.nearHand : k.farHand; c.set(hd[0], hd[1], IX.TOP2); },
    front(c, k){ c.rect(k.torso.x0 - 1, k.shoulderY, 2, 2, IX.TOP2); c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); } };
  // B: a flat cap pulled down, a lit scarf over the face, a jacket, a blade that glints when the arm is up
  parts.hat.r_lowcap = { draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP2); c.rect(x - 1, y, 6, 1, IX.TOP); c.rect(x, y + 1, 1, 1, IX.TOP2); c.rect(x + 3, y + 1, 2, 1, IX.OUT); c.set(x + 2, y, IX.TOP3); } };
  parts.prop.r_scarf = { layer: 'front', draw(c, k){ const x = k.hx, y = hy(k), t = Math.round((k.swing || 0)*.6); c.rect(x, y + 3, 4, 1, IX.LIT); c.set(x + 3, y + 2, IX.LIT); c.set(x - 1 + t, y + 4, IX.LIT); c.set(x - 2 + t, y + 5, IX.ACC); c.set(x - 1 + t, y + 5, IX.LIT); } };
  parts.prop.r_blade = { layer: 'front', draw(c, k){ const h = k.nearHand; if (h[1] > k.nearSh[1] + 2) return; c.set(h[0] + 1, h[1] - 1, IX.WHITE); c.set(h[0] + 2, h[1] - 2, IX.WHITE); c.set(h[0] + 3, h[1] - 3, IX.LIT); } };
  parts.top.r_lurkjacket = { sleeve: 'long',
    torso(c, k){ c.rect(k.torso.x0 + 1, k.shoulderY + 1, 1, 3, IX.TOP2); c.set(k.torso.x1 - 1, k.shoulderY + 2, IX.ACC); c.set(k.torso.x0 + 1, k.shoulderY, IX.TOP3); },
    front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); c.set(k.torso.x1, k.hipY, IX.TOP3); } };
  // C: a respirator and lit goggles over slicked hair, a long coat with a popped collar and flared hem
  parts.prop.r_respirator = { layer: 'front', draw(c, k){ const x = k.hx, y = hy(k); c.rect(x + 1, y + 2, 3, 1, IX.OUT); c.set(x + 2, y + 2, IX.LIT); c.set(x + 3, y + 2, IX.LIT); c.rect(x + 1, y + 3, 3, 1, IX.WHITE); c.set(x + 4, y + 3, IX.ACC); c.set(x + 3, y + 3, IX.TOP3); c.set(x, y + 2, IX.OUT); } };
  parts.prop.r_popcollar = { layer: 'front', draw(c, k){ const x = k.hx; c.rect(x - 1, hy(k) + 2, 2, 3, IX.TOP2); c.set(x + 1, hy(k) + 4, IX.TOP2); c.set(x - 1, hy(k) + 2, IX.TOP3); } };
  parts.top.r_longcoat = { sleeve: 'long',
    torso(c, k){ const x1 = k.torso.x1; c.rect(x1, k.shoulderY, 1, 4, IX.TOP3); c.rect(k.torso.x0, k.hipY - 2, k.bw, 1, IX.ACC); c.set(x1 - 1, k.hipY - 2, IX.LIT); },
    front(c, k){ const sw = Math.round(-.5 + (k.swing || 0)*.9); for (let j = 0; j < 4; j++) for (let i = 0; i < k.bw + 1 + (j > 1 ? 1 : 0); i++) c.set(k.torso.x0 + sw*(j > 0 ? 1 : 0) - (j > 1 ? 1 : 0) + i, k.hipY + j, i === 0 || (j > 1 && i === k.bw + 1) ? IX.TOP2 : IX.TOP); } };
  parts.hair.r_slick = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.HAIR); c.rect(x, y + 1, 1, 2, IX.HAIR); c.set(x + 2, y, IX.HAIR2); c.set(x + 3, y - 1, IX.HAIR); c.set(x + 2, y - 1, IX.HAIR2); } };

  // the officer: a dark blue uniform, a cap, a lit blue badge and trim
  const copPal = pal('cop', { top: 0x24386a, bot: 0x1a2644, hair: 0x2a2024, lit: 0x4aa8ff, acc: 0x1a2a52 });
  PG.role(12, shape('officer', { H: 14, bw: 4 }, 'short', 'r_copcap', 'r_uniform', 'trousers', ['r_scanner']), copPal);
  // each officer their own face under the cap (a case follows them one by one: cases.js): four builds and hair, five skins and four hair colors, the uniform the same
  { const sh = [PG.roleShape[12], shape('officer bun', { H: 13, bw: 4 }, 'bun', 'r_copcap', 'r_uniform', 'trousers', ['r_scanner']),
      shape('officer broad', { H: 15, bw: 5 }, 'buzz', 'r_copcap', 'r_uniform', 'trousers', ['r_scanner']), shape('officer tail', { H: 14, bw: 4 }, 'ponytail', 'r_copcap', 'r_uniform', 'trousers', ['r_scanner'])];
    const pals = []; for (let sk = 0; sk < 5; sk++) for (const hc of [0x1c1820, 0x3a2418, 0x6a4430, 0x9a9aa4]) pals.push(pal('cop' + sk + hc, { skin: sk, top: 0x24386a, bot: 0x1a2644, hair: hc, lit: 0x4aa8ff, acc: 0x1a2a52 }));
    PG.copLook = h => PG.code(12, sh[h % sh.length], pals[(h >>> 4) % pals.length]); }
  // the club's bouncers: broad, bald, in black and red
  const bouncerPal = pal('bouncer', { skin: 2, top: 0x22222c, bot: 0x16161c, hair: 0x1c1820, lit: 0xff3a3a, acc: 0x7a1818 });
  PG.role(15, shape('bouncer', { H: 15, bw: 5 }, 'bald', null, 'r_suit', 'trousers', ['r_shades', 'r_scanner']), bouncerPal);
  // the archivist: a long hooded robe
  const robePal = pal('archivist', { top: 0x4a3a66, bot: 0x2a2038, hair: 0x9a9aa4, lit: 0xb49aff, acc: 0x7a6a40 });
  PG.role(16, shape('archivist', { H: 14, bw: 4 }, 'short', 'r_cowl', 'r_robe', 'trousers', ['r_book']), robePal);
  // the lurkers: dark hoods, masks, low collars, a menacing lit accent
  const lurkA = pal('lurker0', { skin: 1, top: 0x30303c, bot: 0x1c1c22, hair: 0x1c1820, lit: 0xff3a52, acc: 0x4a1a24 });
  const lurkB = pal('lurker1', { top: 0x4a3226, bot: 0x22202a, hair: 0x3a2418, lit: 0xffb347, acc: 0x6a4a1c });
  const lurkC = pal('lurker2', { skin: 3, top: 0x2a3c48, bot: 0x1c1c22, hair: 0x1c1820, lit: 0x38e8e0, acc: 0x1c3a44 });
  PG.role(9, shape('lurker hood', { H: 14, bw: 4 }, 'short', 'r_lurkhood', 'r_pouch', 'trousers'), lurkA);
  PG.role(10, shape('lurker cap', { H: 13, bw: 4 }, 'short', 'r_lowcap', 'r_lurkjacket', 'trousers', ['r_scarf', 'r_blade']), lurkB);
  PG.role(11, shape('lurker coat', { H: 15, bw: 4 }, 'r_slick', null, 'r_longcoat', 'trousers', ['r_respirator', 'r_popcollar']), lurkC);
  // ---------- the emote bubbles: row 14, 8 frames (bang, quest, heart, anger, sweat, note, dots, bowl), drawn in direct colours: a white bubble, dark outline, an icon, a tail ----------
  // each bubble: a white round-cornered bubble in x 1..9, y 5..12 with a dark outline, a one pixel tail at the bottom (x 4, y 12..13), and a 5 wide icon inside (letters = colours, '.' empty)
  const ICON = {
    bang: ['.rrr.', '.rrr.', '..r..', '.....', '..R..'], quest: ['.bbb.', 'b...b', '..bb.', '.....', '..B..'], heart: ['pp.pp', 'pppph', '.ppp.', '..p..'],
    anger: ['rr.rr', 'r...r', '.....', 'r...r', 'rr.rr'], sweat: ['..d..', '.ddd.', 'dwddd', 'ddddd', '.ddd.'], note: ['..ggg', '..g.g', '..g..', '.gg..', '.gg..'],
    dots: ['.....', 'k.k.k', 'l.l.l', '.....'], bowl: ['.s.s.', 'yyyyy', 'ooooo', '.ooo.'] };
  const COL = { r: '#e03030', R: '#a81c24', b: '#2a5ad8', B: '#1c3c9c', p: '#e8408c', h: '#ffb0d0', d: '#3a9ae8', w: '#bfe4ff', g: '#2aa860', k: '#3c3c4c', l: '#7c7c90', o: '#e88a2a', y: '#f2d060', s: '#a8b0c8' };
  const NAMES = ['bang', 'quest', 'heart', 'anger', 'sweat', 'note', 'dots', 'bowl'];
  PG.extra.push({ name: 'emotes', oldRow: 14, draw(g, x0, y0){
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    NAMES.forEach((n, f) => {
      const ox = x0 + f*12, oy = y0, O = '#1a1a2e';
      px(ox + 2, oy + 5, 7, 1, O); px(ox + 2, oy + 12, 7, 1, O); px(ox + 1, oy + 6, 1, 6, O); px(ox + 9, oy + 6, 1, 6, O); px(ox + 4, oy + 13, 1, 1, O); px(ox + 5, oy + 12, 1, 1, O);
      px(ox + 2, oy + 6, 7, 6, '#f6f8ff'); px(ox + 2, oy + 11, 7, 1, '#d6dcf0'); px(ox + 4, oy + 12, 1, 1, '#f6f8ff'); px(ox + 2, oy + 6, 1, 1, '#ffffff');
      const ic = ICON[n], y1 = ic.length === 5 ? 6 : 7;
      ic.forEach((row, j) => { for (let i = 0; i < 5; i++){ const ch = row[i]; if (ch !== '.') px(ox + 3 + i, oy + y1 + j, 1, 1, COL[ch]); } });
    });
  } });
})();
