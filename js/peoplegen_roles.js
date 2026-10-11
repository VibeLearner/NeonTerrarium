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
  // the officer: a dark blue uniform, a cap, a lit blue badge and trim
  const copPal = pal('cop', { top: 0x24386a, bot: 0x1a2644, hair: 0x2a2024, lit: 0x4aa8ff, acc: 0x1a2a52 });
  PG.role(12, shape('officer', { H: 14, bw: 4 }, 'short', 'cap', 'jacket', 'trousers', ['collar']), copPal);
  // the club's bouncers: broad, in red and black
  const bouncerPal = pal('bouncer', { top: 0xa42424, bot: 0x1c1c22, hair: 0x1c1820, lit: 0xff6a5a, acc: 0x601818 });
  PG.role(15, shape('bouncer', { H: 15, bw: 5 }, 'bald', null, 'jacket', 'trousers', ['goggles']), bouncerPal);
  // the archivist: a long hooded robe
  const robePal = pal('archivist', { top: 0x3e3052, bot: 0x2a2038, hair: 0x9a9aa4, lit: 0x9a7aff });
  PG.role(16, shape('archivist', { H: 14, bw: 4 }, 'short', 'hood', 'coat', 'trousers', ['collar']), robePal);
  // the lurkers: dark hoods, masks, low collars
  const lurkA = pal('lurker0', { top: 0x2a2a34, bot: 0x1c1c22, hair: 0x1c1820, lit: 0xff4f6a });
  const lurkB = pal('lurker1', { top: 0x3a2a2a, bot: 0x22202a, hair: 0x3a2418, lit: 0xffb347 });
  const lurkC = pal('lurker2', { top: 0x22303a, bot: 0x1c1c22, hair: 0x1c1820, lit: 0x38e8e0 });
  PG.role(9, shape('lurker hood', { H: 14, bw: 4 }, 'short', 'hood', 'hoodie', 'trousers', ['mask']), lurkA);
  PG.role(10, shape('lurker cap', { H: 13, bw: 4 }, 'short', 'cap', 'jacket', 'trousers', ['mask']), lurkB);
  PG.role(11, shape('lurker coat', { H: 14, bw: 4 }, 'long', null, 'trench', 'trousers', ['goggles']), lurkC);
  // ---------- the emote bubbles: row 14, 8 frames (bang, quest, heart, anger, sweat, note, dots, bowl), drawn in direct colours: a white bubble, dark outline, an icon, a tail ----------
  const BUB = [0xf4f6ff, 0x1a1a2e];
  const ICON = {   // 5 wide x 5 tall icons, pixel strings with a colour per letter
    bang: ['..r..', '..r..', '..r..', '.....', '..r..'], quest: ['.bbb.', 'b...b', '..bb.', '.....', '..b..'], heart: ['.p.p.', 'ppppp', 'ppppp', '.ppp.', '..p..'],
    anger: ['r.r.r', '.rrr.', 'rrrrr', '.rrr.', 'r.r.r'], sweat: ['..d..', '.ddd.', 'ddddd', 'ddddd', '.ddd.'], note: ['..ggg', '..g.g', '..g..', 'gg...', 'gg...'],
    dots: ['.....', '.....', 'k.k.k', '.....', '.....'], bowl: ['.o.o.', '.....', 'ooooo', 'ooooo', '.ooo.'] };
  const COL = { r: '#e03030', b: '#2a5ad8', p: '#e8408c', d: '#3a9ae8', g: '#2aa860', k: '#50505c', o: '#e88a2a' };
  const NAMES = ['bang', 'quest', 'heart', 'anger', 'sweat', 'note', 'dots', 'bowl'];
  PG.extra.push({ name: 'emotes', oldRow: 14, draw(g, x0, y0){
    NAMES.forEach((n, f) => {
      const ox = x0 + f*12, oy = y0;
      g.fillStyle = '#' + BUB[1].toString(16).padStart(6, '0'); g.fillRect(ox + 2, oy + 5, 7, 1); g.fillRect(ox + 2, oy + 12, 7, 1); g.fillRect(ox + 1, oy + 6, 1, 6); g.fillRect(ox + 9, oy + 6, 1, 6); g.fillRect(ox + 4, oy + 13, 3, 1);
      g.fillStyle = '#' + BUB[0].toString(16).padStart(6, '0'); g.fillRect(ox + 2, oy + 6, 7, 6); g.fillRect(ox + 5, oy + 13, 1, 1);
      ICON[n].forEach((row, j) => { for (let i = 0; i < 5; i++){ const ch = row[i]; if (ch !== '.'){ g.fillStyle = COL[ch]; g.fillRect(ox + 3 + i, oy + 7 + j, 1, 1); } } });
    });
  } });
})();
