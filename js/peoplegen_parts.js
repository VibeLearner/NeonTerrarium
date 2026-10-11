// Neon Terrarium: the first set of parts for the character generator (peoplegen.js): hair, hats, tops, bottoms and props. Each is a few pixels drawn on the skeleton of the frame, in the 15 colour indices
// (PG.IX), facing right: the back of the head is the left. Runs after peoplegen.js. A part draws only what it adds; the body (head, torso, arms, legs) is the core's. No Math.random, no Date.
(() => {
  const IX = PG.IX, parts = PG.parts;
  // ---------- hair: draw(c, k, look, x, y) with the head's top left; back(c, k, look, x, y) is drawn behind the body (long hair, a tail) ----------
  const trail = k => Math.round((k.swing || 0)*.6);   // long hair and coat tails trail a frame behind the body
  parts.hair.short = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.HAIR); c.rect(x, y + 1, 2, 1, IX.HAIR); c.set(x, y + 2, IX.HAIR); c.set(x + 2, y, IX.HAIR2); } };
  parts.hair.buzz = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.HAIR); c.set(x, y + 1, IX.HAIR); } };
  parts.hair.bald = { draw(c, k, look, x, y){ c.set(x + 1, y, IX.SKIN2); } };
  parts.hair.undercut = { draw(c, k, look, x, y){ c.rect(x + 1, y, 3, 1, IX.HAIR); c.set(x + 2, y - 1, IX.HAIR2); c.set(x + 3, y - 1, IX.HAIR); c.set(x, y + 1, IX.HAIR2); } };
  parts.hair.mohawk = { draw(c, k, look, x, y){ c.rect(x + 1, y - 1, 3, 1, IX.ACC); c.rect(x + 1, y, 3, 1, IX.HAIR); c.set(x, y + 1, IX.HAIR2); } };
  parts.hair.curly = { draw(c, k, look, x, y){ c.rect(x - 1, y - 1, 5, 2, IX.HAIR); c.set(x + 4, y, IX.HAIR); c.set(x - 1, y + 1, IX.HAIR); c.rect(x - 1, y + 1, 2, 2, IX.HAIR); c.set(x + 1, y - 1, IX.HAIR2); } };
  parts.hair.bun = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.HAIR); c.rect(x, y + 1, 2, 1, IX.HAIR); c.set(x, y + 2, IX.HAIR); c.rect(x, y - 1, 2, 1, IX.HAIR); c.set(x, y - 2, IX.HAIR2); c.set(x + 1, y - 2, IX.HAIR); } };
  parts.hair.long = {
    back(c, k, look, x, y){ const t = trail(k); for (let j = 0; j < 6; j++) c.set(x - 1 + (j > 3 ? t : 0), y + 1 + j, IX.HAIR); for (let j = 0; j < 5; j++) c.set(x + (j > 3 ? t : 0), y + 3 + j, IX.HAIR2); },
    draw(c, k, look, x, y){ c.rect(x - 1, y, 5, 1, IX.HAIR); c.rect(x - 1, y + 1, 3, 1, IX.HAIR); c.rect(x - 1, y + 2, 2, 1, IX.HAIR); c.set(x + 2, y, IX.HAIR2); } };
  parts.hair.ponytail = {
    back(c, k, look, x, y){ const t = trail(k); c.set(x - 1, y + 1, IX.HAIR); c.set(x - 1 + t, y + 2, IX.HAIR); c.set(x - 1 + t, y + 3, IX.HAIR2); c.set(x - 2 + t, y + 4, IX.HAIR); },
    draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.HAIR); c.rect(x, y + 1, 2, 1, IX.HAIR); c.set(x, y + 2, IX.HAIR); c.set(x + 2, y, IX.HAIR2); c.set(x - 1, y + 1, IX.ACC); } };
  parts.hair.braids = {
    back(c, k, look, x, y){ const t = trail(k); for (let j = 0; j < 7; j++) c.set(x - 1 + (j > 4 ? t : 0), y + 1 + j, j % 2 ? IX.HAIR2 : IX.HAIR); },
    draw(c, k, look, x, y){ c.rect(x - 1, y, 5, 1, IX.HAIR); c.rect(x, y + 1, 2, 1, IX.HAIR); c.set(x - 1, y + 1, IX.HAIR); c.set(x + 2, y, IX.HAIR2); } };
  // ---------- hats ----------
  parts.hat.cap = { draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 2, IX.ACC); c.rect(x + 3, y + 1, 2, 1, IX.ACC); c.set(x + 1, y - 1, IX.LIT); } };
  parts.hat.beanie = { draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 2, IX.TOP2); c.rect(x - 1, y, 1, 1, IX.TOP2); c.set(x + 1, y - 2, IX.TOP2); c.set(x + 2, y, IX.TOP3); } };
  parts.hat.hood = { draw(c, k, look, x, y){ c.rect(x - 1, y - 1, 5, 2, IX.TOP2); c.rect(x - 1, y + 1, 2, 3, IX.TOP2); c.set(x + 3, y, IX.TOP); c.set(x + 3, y + 1, IX.OUT); c.set(x + 2, y, IX.TOP); } };
  parts.hat.helmet = { draw(c, k, look, x, y){ c.rect(x - 1, y - 1, 5, 2, IX.ACC); c.rect(x - 1, y + 1, 2, 2, IX.ACC); c.set(x + 3, y + 1, IX.LIT); c.set(x + 1, y - 1, IX.WHITE); } };
  parts.hat.visor = { draw(c, k, look, x, y){ c.rect(x, y + 1, 4, 1, IX.OUT); c.rect(x + 2, y + 1, 2, 1, IX.LIT); c.rect(x, y - 1, 4, 2, IX.TOP2); } };
  // ---------- tops: sleeve, torso(c, k, look) decorates the torso, front(c, k, look) is drawn over the legs, hem rows over the thighs ----------
  const hem = (c, k, rows, col, col2) => {   // a coat or dress hem: rows below the hip over the upper legs, swinging with the walk
    const sw = Math.round(-.5 + (k.swing || 0)*.7); for (let j = 0; j < rows; j++) for (let i = 0; i < k.bw + 1; i++){ const x = k.torso.x0 + sw*(j + 1 > 1 ? 1 : 0) + i - (j > 0 ? 0 : 0); c.set(x, k.hipY + j, i === 0 ? col2 : col); } };
  parts.top.tee = { sleeve: 'short', torso(c, k){ c.set(k.torso.x0 + 1, k.shoulderY, IX.TOP3); } };
  parts.top.hoodie = { sleeve: 'long', torso(c, k){ c.rect(k.torso.x0, k.shoulderY, 1, 1, IX.TOP2); c.rect(k.torso.x0 + 1, k.hipY - 2, 2, 1, IX.TOP2); c.set(k.torso.x0 + 1, k.shoulderY, IX.TOP3); }, front(c, k){ c.rect(k.torso.x0 - 1, k.shoulderY, 2, 2, IX.TOP2); } };
  parts.top.jacket = { sleeve: 'long', torso(c, k){ c.set(k.torso.x1, k.shoulderY, IX.WHITE); c.rect(k.torso.x0 + 1, k.shoulderY + 1, 1, 3, IX.TOP3); }, front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); } };
  parts.top.coat = { sleeve: 'long', torso(c, k){ c.rect(k.torso.x1, k.shoulderY, 1, 4, IX.TOP3); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2); } };
  parts.top.trench = { sleeve: 'long', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 2, k.bw, 1, IX.ACC); c.set(k.torso.x1, k.shoulderY, IX.TOP3); }, front(c, k){ hem(c, k, 4, IX.TOP, IX.TOP2); } };
  parts.top.vest = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0 + 1, k.shoulderY, k.bw - 2, 4, IX.ACC); c.set(k.torso.x0 + 1, k.shoulderY + 1, IX.LIT); } };
  parts.top.overalls = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 1, k.bw, 3, IX.BOT); c.rect(k.torso.x0 + 1, k.shoulderY, 1, 1, IX.BOT); c.set(k.torso.x0 + 2, k.shoulderY + 2, IX.LIT); } };
  parts.top.dress = { sleeve: 'short', torso(c, k){ c.set(k.torso.x0 + 1, k.shoulderY, IX.TOP3); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2); } };
  // ---------- bottoms ----------
  parts.bottom.trousers = { len: 'long' };
  parts.bottom.cargo = { len: 'long', leg(c, k, near){ const kn = near ? k.nearKnee : k.farKnee; c.set(kn[0] + 1, kn[1], IX.ACC); } };
  parts.bottom.shorts = { len: 'short' };
  parts.bottom.skirt = { len: 'skirt', front(c, k){ const sw = Math.round(-.5 + (k.swing || 0)*.5); for (let j = 0; j < 2; j++) for (let i = 0; i < k.bw + 1; i++) c.set(k.torso.x0 + sw*j + i, k.hipY + j, i === 0 ? IX.BOT2 : IX.BOT); } };
  // ---------- props: layer 'back' (behind the body) or 'front'; draw(c, k, look [, x, y for the face]) ----------
  parts.prop.backpack = { layer: 'back', draw(c, k){ c.rect(k.torso.x0 - 2, k.shoulderY, 2, 3, IX.ACC); c.set(k.torso.x0 - 2, k.shoulderY, IX.LIT); } };
  parts.prop.bag = { layer: 'front', draw(c, k){ c.line(k.torso.x0 + 1, k.shoulderY, k.torso.x1, k.hipY - 1, IX.ACC); c.rect(k.torso.x1, k.hipY - 1, 2, 2, IX.ACC); } };
  parts.prop.box = { layer: 'front', draw(c, k){ c.rect(k.torso.x1, k.shoulderY + 1, 3, 3, IX.ACC); c.set(k.torso.x1 + 1, k.shoulderY + 1, IX.LIT); c.rect(k.torso.x1, k.shoulderY + 2, 3, 1, IX.TOP3); } };
  parts.prop.cyberarm = { layer: 'front', draw(c, k){ c.line(k.nearSh[0], k.nearSh[1], k.nearHand[0], k.nearHand[1], IX.WHITE); c.set(k.nearHand[0], k.nearHand[1], IX.LIT); c.set(k.nearElbow[0], k.nearElbow[1], IX.LIT); } };
  parts.prop.collar = { layer: 'front', draw(c, k){ c.rect(k.hx + 1, k.headTop + k.nod + 4, 3, 1, IX.LIT); } };
  parts.prop.cup = { layer: 'front', draw(c, k){ c.set(k.nearHand[0] + 1, k.nearHand[1] - 1, IX.WHITE); c.set(k.nearHand[0] + 1, k.nearHand[1], IX.WHITE); } };
  parts.prop.mask = { layer: 'front', draw(c, k, look, x, y){ if (x === undefined) return; c.rect(x + 1, y + 2, 3, 2, IX.WHITE); c.set(x + 3, y + 3, IX.ACC); c.set(x + 2, y + 3, IX.ACC); } };
  parts.prop.goggles = { layer: 'front', draw(c, k, look, x, y){ if (x === undefined) return; c.rect(x + 1, y + 1, 3, 1, IX.OUT); c.set(x + 3, y + 1, IX.LIT); c.set(x + 2, y + 1, IX.LIT); } };
  parts.prop.headphones = { layer: 'front', draw(c, k, look, x, y){ if (x === undefined) return; c.rect(x - 1, y + 1, 1, 2, IX.ACC); c.set(x + 1, y - 1, IX.ACC); c.rect(x, y - 1, 1, 1, IX.ACC); c.set(x + 2, y - 1, IX.ACC); c.set(x - 1, y + 1, IX.LIT); } };

  // ---------- the first shapes (a handful to see the pipeline work; the full table is in peoplegen_shapes.js) ----------
  const A = (name, body, hair, hat, top, bottom, props) => { const i = PG.addShape({ name, body, hair, hat, top, bottom, props: props || [] }); PG.citizens.push(i); return i; };
  A('tee short', { H: 14, bw: 4 }, 'short', null, 'tee', 'trousers');
  A('hoodie hood', { H: 14, bw: 4 }, 'short', 'hood', 'hoodie', 'trousers');
  A('coat long hair', { H: 14, bw: 4 }, 'long', null, 'coat', 'trousers');
  A('dress ponytail', { H: 13, bw: 3 }, 'ponytail', null, 'dress', 'trousers');
  A('courier cap', { H: 14, bw: 4 }, 'short', 'cap', 'jacket', 'cargo', ['backpack']);
  A('broad overalls', { H: 14, bw: 5 }, 'buzz', 'cap', 'overalls', 'trousers');
  A('trench', { H: 15, bw: 4 }, 'short', null, 'trench', 'trousers');
  A('skirt bun', { H: 13, bw: 3 }, 'bun', null, 'tee', 'skirt', ['bag']);
  A('mohawk vest', { H: 14, bw: 4 }, 'mohawk', null, 'vest', 'shorts', ['cyberarm']);
  A('beanie mask', { H: 13, bw: 4 }, 'curly', 'beanie', 'hoodie', 'trousers', ['mask', 'headphones']);
})();
