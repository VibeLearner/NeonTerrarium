/* Things people carry: a shopping bag, a toolbox, a box, a crate, a plant in a pot, flowers, a cup, a bottle, an envelope, a lamp, a bundle,
   a takeout bag. Each is a sprite of its own in the people sheet with a fixed palette of its own (real colors: a brown paper bag, a red
   toolbox), drawn as a second instance over the person, its grip put at the person's hand on that frame (people.js emitHeld), as the
   umbrella is. How it's held decides the person's frames (peoplegen_poses.js): 'side' hangs from a lowered hand (bags, a toolbox, a lamp),
   'chest' is carried in both arms (a box, a crate, a pot, a bundle), 'hand' is held up in front in one hand (a cup, flowers, a bottle, an
   envelope). Every item cell is 12 x 16 with its grip at (GX, GY). No Math.random. */
(() => {
  const IX = PG.IX, GX = 5, GY = 8;
  // the colors of one item: index -> color, over the base palette (the outline stays the people's dark outline)
  const pal = over => { PG.specialPalette('held', over); return PG.NPAL_MIX + PG.specialPalettes.length - 1; };
  const C = (top, top2, top3, lit, acc, white) => { const o = {}; o[IX.TOP] = top; o[IX.TOP2] = top2; o[IX.TOP3] = top3; o[IX.LIT] = lit; o[IX.ACC] = acc; if (white !== undefined) o[IX.WHITE] = white; return o; };
  const T = IX.TOP, T2 = IX.TOP2, T3 = IX.TOP3, L = IX.LIT, A = IX.ACC, W = IX.WHITE, O = IX.OUT;
  const KINDS = {
    // a paper grocery bag, a loaf sticking out
    bag:     { mode: 'side', pal: C(0xb08a5a, 0x7e6040, 0xd2b07c, 0x7fd36a, 0x5a4330), draw(g){ g.rect(GX - 1, GY + 1, 4, 4, T); g.rect(GX + 2, GY + 1, 1, 4, T2); g.rect(GX - 1, GY + 1, 4, 1, T3); g.set(GX, GY, A); g.set(GX + 1, GY, A); g.set(GX - 1, GY, L); g.set(GX + 2, GY - 1, L); } },
    // a takeout bag, white with a red seal
    food:    { mode: 'side', pal: C(0xe8e2d4, 0xb8b0a0, 0xffffff, 0xff4a5a, 0x8a8478), draw(g){ g.rect(GX - 1, GY + 1, 3, 3, T); g.rect(GX + 1, GY + 1, 1, 3, T2); g.set(GX, GY + 2, L); g.set(GX, GY, A); } },
    // a red toolbox with a steel handle and latch
    tools:   { mode: 'side', pal: C(0xc8402e, 0x8a2a20, 0xe8664a, 0xd8dce4, 0x5a5e68), draw(g){ g.rect(GX - 2, GY + 2, 5, 2, T); g.rect(GX - 2, GY + 3, 5, 1, T2); g.rect(GX - 2, GY + 2, 5, 1, T3); g.set(GX - 1, GY + 1, A); g.set(GX, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX, GY + 3, L); } },
    // a lamp by its stand: a shade with a warm bulb
    lamp:    { mode: 'side', pal: C(0x3a3e4a, 0x22242c, 0x5a5e6c, 0xffd27a, 0xe0a050), draw(g){ g.set(GX, GY + 1, T); g.set(GX, GY + 2, T); g.rect(GX - 1, GY + 3, 3, 2, A); g.set(GX, GY + 5, L); g.rect(GX - 1, GY + 6, 3, 1, T2); } },
    // a cardboard box with tape
    box:     { mode: 'chest', pal: C(0xb98a52, 0x8a6236, 0xd8aa70, 0xe6dccb, 0x6a4a2a), draw(g){ g.rect(GX - 1, GY - 2, 4, 3, T); g.rect(GX - 1, GY - 2, 4, 1, T3); g.rect(GX + 2, GY - 1, 1, 2, T2); g.set(GX, GY - 2, L); g.set(GX, GY - 1, L); } },
    // a wooden crate
    crate:   { mode: 'chest', pal: C(0x9a6a3a, 0x6a4422, 0xc08a50, 0x4a3018, 0x4a3018), draw(g){ g.rect(GX - 1, GY - 3, 4, 4, T); g.rect(GX - 1, GY - 2, 4, 1, A); g.rect(GX - 1, GY, 4, 1, A); g.set(GX + 2, GY - 3, T3); g.set(GX - 1, GY - 3, T3); } },
    // a plant in a terracotta pot
    pot:     { mode: 'chest', pal: C(0xb8603a, 0x84402a, 0xd88058, 0x5ad86a, 0x2e8a44), draw(g){ g.rect(GX - 1, GY - 1, 3, 2, T); g.set(GX + 1, GY, T2); g.rect(GX - 1, GY - 2, 3, 1, T3); g.set(GX - 1, GY - 3, A); g.set(GX, GY - 4, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 3, A); g.set(GX + 2, GY - 4, A); } },
    // a bundle of cloth, tied
    bundle:  { mode: 'chest', pal: C(0x5a6a8a, 0x3a4660, 0x7a8cac, 0xe8d8a8, 0x2a3244), draw(g){ g.rect(GX - 1, GY - 2, 4, 3, T); g.rect(GX - 1, GY - 2, 4, 1, T3); g.rect(GX + 2, GY - 1, 1, 2, T2); g.set(GX, GY - 1, L); g.set(GX + 1, GY - 1, L); } },
    // flowers held up: neon blooms on dark stems, a paper wrap
    flowers: { mode: 'hand', pal: C(0xe8dcc4, 0xb0a68e, 0xffffff, 0xff5ab4, 0x2e8a44), draw(g){ g.set(GX, GY, T); g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, A); g.set(GX + 1, GY - 2, A); g.set(GX - 1, GY - 3, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 4, L); g.set(GX + 2, GY - 4, IX.HAIR); } },
    // a cup with a lid
    cup:     { mode: 'hand', pal: C(0xece6da, 0xb4ac9c, 0xffffff, 0xff8a3a, 0x6a5a48), draw(g){ g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, L); g.set(GX + 1, GY - 2, L); g.set(GX, GY - 3, A); } },
    // a bottle
    bottle:  { mode: 'hand', pal: C(0x2e6a4a, 0x1c4430, 0x5aa078, 0xe8d8a8, 0x14301e), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 2, L); g.set(GX, GY - 4, A); g.set(GX, GY - 5, A); } },
    // an envelope or papers
    paper:   { mode: 'hand', pal: C(0xece6da, 0xb4ac9c, 0xffffff, 0xff5a6a, 0x8a8478), draw(g){ g.rect(GX, GY - 2, 3, 2, T); g.set(GX + 2, GY - 1, T2); g.set(GX + 1, GY - 2, L); } },
  };
  PG.heldBase = PG.shapes.length; PG.heldKinds = Object.keys(KINDS); PG.heldPal = {}; PG.heldMode = {};
  for (const k of PG.heldKinds){
    const K = KINDS[k];
    PG.heldPal[k] = pal(K.pal); PG.heldMode[k] = K.mode;
    PG.addShape({ name: 'held ' + k, body: { H: 14, bw: 4 }, custom: (g, f) => { if (f) return; K.draw(g); g.outline('all', O); } });
  }
  // the code people.js emits for an item: its shape, with its own palette
  PG.heldCode = k => { const i = PG.heldKinds.indexOf(k); return i < 0 ? -1 : (PG.heldBase + i) | (PG.heldPal[k] << 7); };
  // the hand the item hangs from on frame f, for this person's own body: [x, y] in the cell ('chest': between the two hands)
  const cache = new Map();
  PG.heldHand = (shape, f) => {
    const key = shape*256 + f; let h = cache.get(key); if (h) return h;
    const look = PG.shapes[shape], body = look && look.body ? look.body : { H: 14, bw: 4 }, k = PG.skeleton(body, PG.poses[f]);
    h = [Math.round(k.nearHand[0]), Math.round(k.nearHand[1])]; cache.set(key, h); return h;
  };
  PG.heldGrip = [GX, GY];
  // which item a line of the log is about (a story step's text: "comes out with a full bag in each hand")
  const WORDS = [['tools', /\b(tool ?kit|tool ?box|tools|drill|wrench|toolbag)\b/i], ['flowers', /\b(flowers|bouquet|blooms|roses|lilies)\b/i], ['pot', /\b(potted|plant|pot|seedlings?|fern|bonsai|cutting)\b/i],
    ['food', /\b(takeout|to go|noodles|broth|dinner|lunch|soup|bowls?)\b/i], ['bag', /\b(bag|bags|groceries|sack|sacks|tote)\b/i], ['crate', /\b(crates?)\b/i],
    ['box', /\b(box|boxes|parcel|package|carton|delivery)\b/i], ['bottle', /\b(bottle|wine)\b/i], ['cup', /\b(cup|cups|tea|mug)\b/i],
    ['paper', /\b(envelope|letter|papers|document|card|notice|file)\b/i], ['lamp', /\b(lamp)\b/i], ['bundle', /\b(bundle|blanket|coat|jacket|scarf|clothes|laundry)\b/i]];
  PG.heldFromText = t => { for (const [k, re] of WORDS) if (re.test(t)) return k; return null; };
})();
