/* Things people carry. Each kind comes in a few variants (a paper grocery sack, a cloth tote, a string bag of oranges; a red, a yellow toolbox,
   a canvas tool bag), each a sprite of its own in the people sheet with a fixed palette of its own (real colors), drawn as a second instance over
   the person with its grip put at the person's hand on that frame (people.js emitHeld), as the umbrella is. How a kind is held decides the
   person's frames (peoplegen_poses.js): 'side' hangs from a lowered hand, 'chest' is carried in both arms, 'hand' is held up in one hand.
   What's held is written "kind:variant"; a line that names the variant ("a cloth bag", "a single stem") picks it, otherwise the person's own hash
   does, so the same person always has the same tote. Every item cell is 12 x 16 with its grip at (GX, GY). No Math.random. */
(() => {
  const IX = PG.IX, GX = 5, GY = 8;
  const pal = over => { PG.specialPalette('held', over); return PG.NPAL_MIX + PG.specialPalettes.length - 1; };
  // a palette over the base: main, its shade and light, an accent (LIT, kept bright), a dark detail (ACC), and WHITE when given
  const C = (top, top2, top3, lit, acc, white) => { const o = {}; o[IX.TOP] = top; o[IX.TOP2] = top2; o[IX.TOP3] = top3; o[IX.LIT] = lit; o[IX.ACC] = acc; if (white !== undefined) o[IX.WHITE] = white; return o; };
  const T = IX.TOP, T2 = IX.TOP2, T3 = IX.TOP3, L = IX.LIT, A = IX.ACC, W = IX.WHITE, O = IX.OUT;
  // shapes reused by several variants (g: the cell; x, y: the grip)
  const sack = g => { g.rect(GX - 1, GY + 1, 4, 4, T); g.rect(GX + 2, GY + 1, 1, 4, T2); g.rect(GX - 1, GY + 1, 4, 1, T3); g.set(GX, GY, A); g.set(GX + 1, GY, A); };
  const tote = g => { g.rect(GX - 1, GY + 2, 4, 3, T); g.rect(GX + 2, GY + 2, 1, 3, T2); g.set(GX - 1, GY + 1, A); g.set(GX + 2, GY + 1, A); g.set(GX, GY, A); g.set(GX + 1, GY, A); };
  const toolbox = g => { g.rect(GX - 2, GY + 2, 5, 2, T); g.rect(GX - 2, GY + 3, 5, 1, T2); g.rect(GX - 2, GY + 2, 5, 1, T3); g.set(GX - 1, GY + 1, A); g.set(GX, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX, GY + 3, L); };
  const carton = g => { g.rect(GX - 1, GY - 2, 4, 3, T); g.rect(GX - 1, GY - 2, 4, 1, T3); g.rect(GX + 2, GY - 1, 1, 2, T2); };
  const KINDS = {
    bag: { mode: 'side', v: [
      { words: /paper|sack|groceries|produce/i, pal: C(0xb08a5a, 0x7e6040, 0xd2b07c, 0x7fd36a, 0x5a4330), draw(g){ sack(g); g.set(GX - 1, GY, L); g.set(GX + 2, GY - 1, L); } },   // a paper sack, greens at the top
      { words: /cloth|tote|canvas/i, pal: C(0x4a7a8a, 0x2e5260, 0x6aa0b0, 0xf0d070, 0x22343c), draw(g){ tote(g); g.set(GX, GY + 3, L); } },                                // a cloth tote with a printed mark
      { words: /string|net|plastic|oranges/i, pal: C(0xff9a3a, 0xc86a20, 0xffc070, 0xe8e2d4, 0xb4ac9c), draw(g){ g.rect(GX - 1, GY + 2, 3, 3, T); g.set(GX, GY + 3, T2); g.set(GX + 1, GY + 2, T3); g.set(GX - 1, GY + 1, W); g.set(GX + 1, GY + 1, W); g.set(GX, GY, W); } } ] },   // a string bag of oranges
    food: { mode: 'side', v: [
      { pal: C(0xe8e2d4, 0xb8b0a0, 0xffffff, 0xff4a5a, 0x8a8478), draw(g){ g.rect(GX - 1, GY + 1, 3, 3, T); g.rect(GX + 1, GY + 1, 1, 3, T2); g.set(GX, GY + 2, L); g.set(GX, GY, A); } },   // a white takeout bag, a red seal
      { words: /warm paper bag|paper bag/i, pal: C(0xc49a62, 0x8e6c40, 0xe0bc86, 0x5ae8ff, 0x5a4330), draw(g){ g.rect(GX - 1, GY + 1, 3, 4, T); g.rect(GX + 1, GY + 1, 1, 4, T2); g.set(GX, GY + 2, L); g.set(GX, GY, A); } } ] },   // a kraft bag with a neon stamp
    tools: { mode: 'side', v: [
      { pal: C(0xc8402e, 0x8a2a20, 0xe8664a, 0xd8dce4, 0x5a5e68), draw: toolbox },   // red
      { pal: C(0xe8b828, 0xa88018, 0xffd85a, 0x2a2e38, 0x3a3e48), draw: toolbox },   // yellow
      { words: /tool ?bag|canvas/i, pal: C(0x4e5a3a, 0x343c26, 0x6c7a52, 0xc8ccd4, 0x22281a), draw(g){ g.rect(GX - 2, GY + 2, 5, 2, T); g.rect(GX - 2, GY + 3, 5, 1, T2); g.set(GX - 1, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX + 2, GY + 1, L); g.set(GX - 2, GY + 1, L); } } ] },   // a canvas tool bag, handles poking out
    lamp: { mode: 'side', v: [
      { pal: C(0x3a3e4a, 0x22242c, 0x5a5e6c, 0xffd27a, 0xe0a050), draw(g){ g.set(GX, GY + 1, T); g.set(GX, GY + 2, T); g.rect(GX - 1, GY + 3, 3, 2, A); g.set(GX, GY + 5, L); g.rect(GX - 1, GY + 6, 3, 1, T2); } },   // a shaded lamp
      { words: /lantern/i, pal: C(0xd84a3a, 0x9a2e24, 0xff7a5a, 0xffd27a, 0x3a2a20), draw(g){ g.set(GX, GY + 1, A); g.rect(GX - 1, GY + 2, 3, 3, T); g.set(GX, GY + 3, L); g.set(GX + 1, GY + 3, T2); g.set(GX, GY + 5, A); } } ] },   // a paper lantern
    duffel: { mode: 'side', v: [
      { pal: C(0x2e3240, 0x1c1f28, 0x4a5064, 0xff5ab4, 0x14161c), draw(g){ g.rect(GX - 2, GY + 2, 5, 2, T); g.rect(GX - 2, GY + 3, 5, 1, T2); g.set(GX - 1, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX, GY + 2, L); } },   // a dark duffel, a neon zip pull
      { words: /backpack|rucksack/i, pal: C(0x6a3a8a, 0x48265e, 0x8e5ab0, 0x5ae8ff, 0x2a1838), draw(g){ g.rect(GX - 1, GY + 1, 3, 4, T); g.rect(GX + 1, GY + 1, 1, 4, T2); g.set(GX, GY + 3, L); g.set(GX, GY, A); } } ] },   // a backpack by its strap
    bucket: { mode: 'side', v: [
      { pal: C(0x9aa2ae, 0x6a727e, 0xc4ccd6, 0xe8f0f8, 0x4a525e), draw(g){ g.set(GX - 1, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX, GY, A); g.rect(GX - 1, GY + 2, 3, 3, T); g.set(GX + 1, GY + 3, T2); g.rect(GX - 1, GY + 2, 3, 1, L); } },   // a steel bucket, water at the brim
      { pal: C(0xd04040, 0x902828, 0xf06060, 0xe8f0f8, 0x601818), draw(g){ g.set(GX - 1, GY + 1, A); g.set(GX + 1, GY + 1, A); g.set(GX, GY, A); g.rect(GX - 1, GY + 2, 3, 3, T); g.set(GX + 1, GY + 3, T2); } } ] },   // a red plastic bucket
    thermos: { mode: 'hand', v: [
      { pal: C(0xa8b0bc, 0x707884, 0xd0d8e2, 0x5ae8ff, 0x3a404a), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 4, A); g.set(GX + 1, GY - 4, A); g.set(GX, GY - 2, L); } },   // a steel thermos
      { words: /flask/i, pal: C(0xb83a3a, 0x7e2626, 0xe05a5a, 0xe8e2d4, 0x3a2020), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 4, L); } },   // a red flask
      { words: /lunch tin|tin/i, pal: C(0x5a8a6a, 0x3a5e46, 0x7cb08e, 0xf0d070, 0x22382a), draw(g){ g.rect(GX - 1, GY - 2, 3, 2, T); g.rect(GX - 1, GY - 2, 3, 1, T3); g.set(GX, GY - 3, A); g.set(GX + 1, GY - 1, L); } } ] },   // a lunch tin
    box: { mode: 'chest', v: [
      { pal: C(0xb98a52, 0x8a6236, 0xd8aa70, 0xe6dccb, 0x6a4a2a), draw(g){ carton(g); g.set(GX, GY - 2, L); g.set(GX, GY - 1, L); } },   // a cardboard box, taped
      { words: /cake|gift|ribbon|present/i, pal: C(0xece6da, 0xb4ac9c, 0xffffff, 0xff5ab4, 0x8a8478), draw(g){ carton(g); g.rect(GX, GY - 2, 1, 3, L); g.set(GX - 1, GY - 3, L); g.set(GX + 1, GY - 3, L); } },   // a white box with a ribbon
      { words: /parcel|package|wrapped/i, pal: C(0xc8a878, 0x96784e, 0xe4c898, 0x8a5a3a, 0x5a3a24), draw(g){ carton(g); g.rect(GX - 1, GY - 1, 4, 1, L); g.rect(GX + 1, GY - 2, 1, 3, L); } } ] },   // a paper-wrapped parcel, string round it
    crate: { mode: 'chest', v: [
      { pal: C(0x9a6a3a, 0x6a4422, 0xc08a50, 0x4a3018, 0x4a3018), draw(g){ g.rect(GX - 1, GY - 3, 4, 4, T); g.rect(GX - 1, GY - 2, 4, 1, A); g.rect(GX - 1, GY, 4, 1, A); g.set(GX + 2, GY - 3, T3); g.set(GX - 1, GY - 3, T3); } },   // a wooden crate
      { pal: C(0x3a7ab8, 0x26547e, 0x5a9ad8, 0x9ad86a, 0x183858), draw(g){ g.rect(GX - 1, GY - 3, 4, 4, T); g.rect(GX, GY - 2, 2, 2, A); g.set(GX - 1, GY - 4, L); g.set(GX + 1, GY - 4, L); g.set(GX + 2, GY - 2, T2); } } ] },   // a blue plastic crate of greens
    pot: { mode: 'chest', v: [
      { words: /fern|plant|potted/i, pal: C(0xb8603a, 0x84402a, 0xd88058, 0x5ad86a, 0x2e8a44), draw(g){ g.rect(GX - 1, GY - 1, 3, 2, T); g.set(GX + 1, GY, T2); g.rect(GX - 1, GY - 2, 3, 1, T3); g.set(GX - 1, GY - 3, A); g.set(GX, GY - 4, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 3, A); g.set(GX + 2, GY - 4, A); } },   // a terracotta pot, a fern
      { words: /succulent|cactus|bonsai/i, pal: C(0xe8e2d8, 0xb0a898, 0xffffff, 0x8ad8a0, 0x3a7a54), draw(g){ g.rect(GX - 1, GY - 1, 3, 2, T); g.set(GX + 1, GY, T2); g.set(GX - 1, GY - 2, A); g.set(GX, GY - 2, L); g.set(GX + 1, GY - 2, A); g.set(GX, GY - 3, L); } },   // a white pot, a succulent
      { words: /seedling|sprout|tray/i, pal: C(0x5a4030, 0x3a2a20, 0x7a5a44, 0x9aff6a, 0x3aa84a), draw(g){ g.rect(GX - 2, GY - 1, 5, 2, T); g.rect(GX - 2, GY, 5, 1, T2); for (const dx of [-2, 0, 2]){ g.set(GX + dx, GY - 2, L); g.set(GX + dx, GY - 3, A); } } } ] },   // a tray of seedlings
    bundle: { mode: 'chest', v: [
      { pal: C(0x5a6a8a, 0x3a4660, 0x7a8cac, 0xe8d8a8, 0x2a3244), draw(g){ carton(g); g.set(GX, GY - 1, L); g.set(GX + 1, GY - 1, L); } },   // a cloth bundle, tied
      { words: /blanket/i, pal: C(0xb84a4a, 0x7e3030, 0xe07070, 0xf0d8a0, 0x4a1c1c), draw(g){ g.rect(GX - 1, GY - 2, 4, 3, T); g.rect(GX - 1, GY - 1, 4, 1, L); g.rect(GX + 2, GY - 2, 1, 3, T2); } },   // a folded red blanket, a stripe
      { words: /laundry|clothes|shirts/i, pal: C(0xe8e2d4, 0xb4ac9c, 0xffffff, 0x5ae8ff, 0x6a7a9a), draw(g){ g.rect(GX - 1, GY - 1, 4, 2, T); g.rect(GX - 1, GY - 2, 4, 1, A); g.rect(GX - 1, GY - 3, 3, 1, L); g.set(GX + 2, GY, T2); } } ] },   // a stack of folded laundry
    appliance: { mode: 'chest', v: [
      { pal: C(0x8a929e, 0x5e6672, 0xb0b8c4, 0xff7a3a, 0x3a404a), draw(g){ g.rect(GX - 1, GY - 3, 4, 4, T); g.rect(GX, GY - 2, 2, 1, A); g.rect(GX, GY - 1, 2, 1, L); g.set(GX + 2, GY - 3, T2); } },   // a heater, its grille glowing
      { words: /kettle/i, pal: C(0xe8e2d8, 0xb0a898, 0xffffff, 0x5ae8ff, 0x3a3e48), draw(g){ g.rect(GX - 1, GY - 2, 3, 3, T); g.set(GX + 2, GY - 1, A); g.set(GX, GY - 3, A); g.set(GX + 1, GY - 1, T2); g.set(GX - 1, GY, L); } } ] },   // a kettle
    frame: { mode: 'chest', v: [
      { pal: C(0x6a4a2e, 0x4a321e, 0x8e6a44, 0x9ad0ff, 0xe8e2d4), draw(g){ g.rect(GX - 2, GY - 3, 5, 4, T); g.rect(GX - 1, GY - 2, 3, 2, L); g.set(GX, GY - 2, A); } } ] },   // a framed picture
    tray: { mode: 'chest', v: [
      { pal: C(0x8a5a3a, 0x5e3c26, 0xb07a52, 0xe8e2d4, 0xff8a3a), draw(g){ g.rect(GX - 2, GY, 5, 1, T); g.set(GX - 1, GY - 1, L); g.set(GX + 1, GY - 1, L); g.set(GX + 1, GY - 2, A); } } ] },   // a tray with two bowls
    stool: { mode: 'chest', v: [
      { pal: C(0x9a6a3a, 0x6a4422, 0xc08a50, 0x4a3018, 0x4a3018), draw(g){ g.rect(GX - 1, GY - 2, 4, 1, T3); g.set(GX - 1, GY - 1, T); g.set(GX + 2, GY - 1, T); g.set(GX - 1, GY, T2); g.set(GX + 2, GY, T2); } } ] },   // a stool
    flowers: { mode: 'hand', v: [
      { pal: C(0xe8dcc4, 0xb0a68e, 0xffffff, 0xff5ab4, 0x2e8a44), draw(g){ g.set(GX, GY, T); g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, A); g.set(GX + 1, GY - 2, A); g.set(GX - 1, GY - 3, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 4, L); } },   // pink blooms in paper
      { pal: C(0x3a3e4a, 0x22242c, 0x5a5e6c, 0xffd23a, 0x2e8a44), draw(g){ g.set(GX, GY, T); g.set(GX, GY - 1, T); g.set(GX, GY - 2, A); g.set(GX + 1, GY - 2, A); g.set(GX - 1, GY - 3, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 4, L); g.set(GX + 2, GY - 4, L); } },   // yellow blooms in dark paper
      { pal: C(0xc8e8f0, 0x8ab0bc, 0xffffff, 0xf4f4ff, 0x2e8a44), draw(g){ g.set(GX, GY, T); g.set(GX, GY - 1, T2); g.set(GX, GY - 2, A); g.set(GX + 1, GY - 2, A); g.set(GX - 1, GY - 3, L); g.set(GX + 1, GY - 3, L); g.set(GX, GY - 4, L); } },   // white blooms
      { words: /single stem|one stem|a stem|a single flower|one flower/i, pal: C(0xe8dcc4, 0xb0a68e, 0xffffff, 0xff3a5a, 0x2e8a44), draw(g){ g.set(GX, GY - 1, A); g.set(GX, GY - 2, A); g.set(GX, GY - 3, A); g.set(GX, GY - 4, L); g.set(GX + 1, GY - 4, L); } } ] },   // a single red stem
    cup: { mode: 'hand', v: [
      { pal: C(0xece6da, 0xb4ac9c, 0xffffff, 0xff8a3a, 0x6a5a48), draw(g){ g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, L); g.set(GX + 1, GY - 2, L); g.set(GX, GY - 3, A); } },   // a white cup, an orange lid
      { words: /tea/i, pal: C(0x5aa07a, 0x3a7458, 0x7ec89c, 0xe8e2d4, 0x24402e), draw(g){ g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, T3); g.set(GX + 1, GY - 2, T); g.set(GX, GY - 3, L); } },   // a green tea cup, steam
      { pal: C(0xc49a62, 0x8e6c40, 0xe0bc86, 0x2a2e38, 0x5a4330), draw(g){ g.set(GX, GY - 1, T); g.set(GX + 1, GY - 1, T2); g.set(GX, GY - 2, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 3, L); g.set(GX + 1, GY - 3, L); } } ] },   // a kraft paper cup, a black lid
    bottle: { mode: 'hand', v: [
      { words: /wine/i, pal: C(0x2e6a4a, 0x1c4430, 0x5aa078, 0xe8d8a8, 0x14301e), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 2, L); g.set(GX, GY - 4, A); g.set(GX, GY - 5, A); } },   // green glass, a label
      { pal: C(0xa86a2a, 0x744618, 0xd08e48, 0xf0e0b0, 0x3a2410), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 2, T2); g.set(GX, GY - 2, L); g.set(GX, GY - 4, A); } },   // amber
      { words: /water/i, pal: C(0xb8e0f0, 0x84b0c4, 0xe8f8ff, 0x3a8ad8, 0x5a7a8a), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX + 1, GY - 3, T3); g.set(GX, GY - 4, L); } } ] },   // a clear water bottle, a blue cap
    paper: { mode: 'hand', v: [
      { words: /envelope|letter/i, pal: C(0xece6da, 0xb4ac9c, 0xffffff, 0xff5a6a, 0x8a8478), draw(g){ g.rect(GX, GY - 2, 3, 2, T); g.set(GX + 2, GY - 1, T2); g.set(GX + 1, GY - 2, L); } },   // an envelope, a red seal
      { words: /papers|folder|file|documents|paperwork|stack/i, pal: C(0x3a6aa8, 0x26487a, 0x5a8ad0, 0xe8e2d4, 0x182a48), draw(g){ g.rect(GX, GY - 3, 3, 3, T); g.rect(GX, GY - 3, 3, 1, L); g.set(GX + 2, GY - 1, T2); } },   // a blue folder, papers peeking out
      { words: /tablet|clipboard|slate/i, pal: C(0x22262e, 0x16181e, 0x3a404c, 0x5ae8ff, 0x0c0e12), draw(g){ g.rect(GX, GY - 3, 2, 3, T); g.set(GX, GY - 2, L); g.set(GX + 1, GY - 3, L); } } ] },   // a tablet, screen lit
    jar: { mode: 'hand', v: [
      { pal: C(0xd0e8e0, 0x9ab8b0, 0xf0fff8, 0xffb43a, 0x6a8078), draw(g){ g.rect(GX, GY - 2, 2, 2, L); g.set(GX, GY - 3, A); g.set(GX + 1, GY - 3, A); g.set(GX + 1, GY - 1, T2); } } ] },   // a jar of something golden
  };
  PG.heldBase = PG.shapes.length; PG.heldKinds = Object.keys(KINDS); PG.heldModes = {};
  const SHAPE = {};   // "kind:v" -> shape | palette << 7
  for (const k of PG.heldKinds){
    PG.heldModes[k] = KINDS[k].mode;
    KINDS[k].v.forEach((V, i) => {
      const sh = PG.addShape({ name: 'held ' + k + ' ' + i, body: { H: 14, bw: 4 }, custom: (g, f) => { if (f) return; V.draw(g); g.outline('all', O); } });
      SHAPE[k + ':' + i] = sh | (pal(V.pal) << 7);
    });
  }
  if (PG.shapes.length > 128) console.warn('people sheet: more than 128 shapes; the held things past it won\'t draw');
  const kindOf = h => (h || '').split(':')[0];
  PG.heldModeOf = h => PG.heldModes[kindOf(h)] || 'chest';
  PG.heldCode = h => { const c = SHAPE[h]; if (c !== undefined) return c; const k = kindOf(h); return SHAPE[k + ':0'] !== undefined ? SHAPE[k + ':0'] : -1; };
  // a held thing for a person: the variant a line names, else one by the person's hash among the variants no line has to name
  PG.heldPick = (k, text, salt) => {
    const K = KINDS[k]; if (!K) return null;
    if (text) for (let i = 0; i < K.v.length; i++) if (K.v[i].words && K.v[i].words.test(text)) return k + ':' + i;
    const open = K.v.map((V, i) => i).filter(i => !K.v[i].words || i === 0);
    return k + ':' + open[(hash(String(salt || ''), k) >>> 0) % open.length];
  };
  // the hand the item hangs from on frame f, for this person's own body: [x, y] in the cell
  const cache = new Map();
  PG.heldHand = (shape, f) => {
    const key = shape*256 + f; let h = cache.get(key); if (h) return h;
    const look = PG.shapes[shape], body = look && look.body ? look.body : { H: 14, bw: 4 }, k = PG.skeleton(body, PG.poses[f]);
    h = [Math.round(k.nearHand[0]), Math.round(k.nearHand[1])]; cache.set(key, h); return h;
  };
  PG.heldGrip = [GX, GY];
  // which kind of thing a line of the log is about (a story step's text: "comes out with a full bag in each hand"), and its variant
  const WORDS = [['tools', /\b(tool ?kit|tool ?box|tools|tool ?bag|drill|wrench)\b/i], ['flowers', /\b(flowers|bouquet|blooms|roses|lilies|stem)\b/i],
    ['pot', /\b(potted|plant|pot|seedlings?|fern|bonsai|cutting|succulent)\b/i], ['thermos', /\b(thermos|flask|lunch tin)\b/i], ['bucket', /\b(bucket|pail)\b/i],
    ['appliance', /\b(heater|kettle|appliance|unit|fan|radio set)\b/i], ['frame', /\b(frame|framed|picture|painting)\b/i], ['tray', /\b(tray)\b/i], ['stool', /\b(stool)\b/i],
    ['duffel', /\b(duffel|gym bag|holdall|backpack|rucksack|suitcase)\b/i], ['jar', /\b(jar)\b/i],
    ['food', /\b(takeout|to go|noodles|broth|dinner|lunch|soup|warm paper bag)\b/i], ['bag', /\b(bag|bags|groceries|sack|sacks|tote)\b/i], ['crate', /\b(crates?)\b/i],
    ['box', /\b(box|boxes|parcel|package|carton|delivery|cake)\b/i], ['bottle', /\b(bottle|wine)\b/i], ['cup', /\b(cup|cups|mug)\b/i],
    ['paper', /\b(envelope|letter|papers|document|folder|paperwork|tablet|clipboard|file)\b/i], ['lamp', /\b(lamp|lantern)\b/i], ['bundle', /\b(bundle|blanket|laundry|clothes)\b/i]];
  PG.heldFromText = (t, salt) => { for (const [k, re] of WORDS) if (re.test(t)) return PG.heldPick(k, t, salt); return null; };
})();
