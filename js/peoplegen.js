// Neon Terrarium: the people drawn in code (character generator plan, claude/character-generator-plan.md). The core: the look codes, the palette lookup, the skeleton and the gaits (a pose for every
// frame of the sheet), the painter that draws a look on a pose, the sheet, and the switch to the old Craftpix sheet. The parts (hair, tops, bottoms, hats, props) and the shapes (looks) register in
// peoplegen_*.js. Runs after spritegen.js and before people.js, shares their scope. Like spritegen.js it touches no game state, and the plot worker (which loads people.js with stand-ins) never draws:
// everything here that draws is guarded by IN_RECIPE_WORKER. No generator may use Math.random or Date (a person's look comes from a hash of who they are, people.js).
//
// A look code is what a person carries as their `row` (people.js emit): old row | shape << 5 | palette << 12. The old row is the Craftpix sheet's row for this person (what the switch "old people (as
// before)" shows); the shape is a row of the generated sheet, the palette a row of the palette texture. emit writes `code & 31` in the old mode and `code >> 5` (shape | palette << 7) in the new, so every
// site that draws a person stays as it is. A code with no shape bits is a role by its old row (officer, bouncer, archivist, lurkers, emote bubbles): see PG.roleShape.
//
// The sheet holds colour INDICES, not colours (red = index * 16 + 8, alpha 0 or 255); the shader looks each one up in the person's palette row (a row of a 16 x 4096 palette texture): skin, hair, top,
// bottom, shoes and accents come from curated ramps, so one drawing serves any colour combination. The 15 indices (IX below) are fixed; index 11 is a lit accent that keeps its colour at night.
//
// STYLE (the spritegen.js rules apply): true pixel size, 12 x 16 cells, facing right (mirrored for left), feet on the bottom row; light from the upper left (the top shade goes lower right); a clear
// silhouette first; no stray pixels. The WALK RHYTHM is the old sprites' (measured, not copied): contact frames 0 and 3 with the legs spread, passing frames between them with the body a pixel higher.
const PG = (() => {
  const P = { VERSION: 1, sheet: null, pal: null, roleShape: {}, rolePal: {} };
  // is the generated sheet in use (a generator has drawn it, and the old Craftpix sheet is not asked for: window.__OLD_PEOPLE, the overlay test "old people (as before)")
  P.live = () => !!P.sheet && !window.__OLD_PEOPLE;
  // the code of a person: old row (0..31), shape (0..127), palette (0..4095)
  P.code = (oldRow, shape, pal) => oldRow | (shape << 5) | (pal << 12);
  P.oldRowOf = code => code & 31;
  // what the shader gets in the new mode: shape | palette << 7; a code with no shape bits is a role by its old row
  P.shapeOf = code => { const s = code >> 5; return s ? s : (P.roleShape[code & 31] | 0) | ((P.rolePal[code & 31] | 0) << 7); };

  // ---------- the cell, the frames ----------
  const CW = 12, CH = 16;
  // frames: the old ones keep their numbers; 32 on are new (running, the umbrella poses)
  const F = { WALK: 0, IDLE: 6, SPEC: 10, SIT: 16, USE: 20, ANGRY: 26, RUN: 32, UWALK: 38, UIDLE: 44, UOPEN: 48,
    // (the doing frames, peoplegen_poses.js: eating standing and seated, crouching to pick something up, walking and standing with a box, a call on the comm, a wave, a hug, handing something over, watering a plant)
    EAT: 52, SITEAT: 56, CROUCH: 60, CARRY: 64, CARRYIDLE: 70, COMM: 72, WAVE: 76, HUG: 80, GIVE: 82, WATER: 84, N: 88 };
  P.F = F; P.CW = CW; P.CH = CH;
  // the colour indices of the sheet
  const IX = { OUT: 1, SKIN: 2, SKIN2: 3, HAIR: 4, HAIR2: 5, TOP: 6, TOP2: 7, TOP3: 8, BOT: 9, BOT2: 10, LIT: 11, SHOE: 12, ACC: 13, WHITE: 14, EYE: 15 };
  P.IX = IX;

  // ---------- the painter: one cell of the sheet, in local coordinates (x 0..11 from the left, y 0..15 from the top) ----------
  class Cell {
    constructor(buf, stride, ox, oy){ this.b = buf; this.s = stride; this.ox = ox; this.oy = oy; }
    clear(){ for (let y = 0; y < CH; y++) this.b.fill(0, (this.oy + y)*this.s + this.ox, (this.oy + y)*this.s + this.ox + CW); }
    set(x, y, c){ x = Math.round(x); y = Math.round(y); if (x < 1 || y < 1 || x > CW - 2 || y >= CH) return; this.b[(this.oy + y)*this.s + this.ox + x] = c; }   // (column 0, column 11 and row 0 stay free for the outline)
    get(x, y){ x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= CW || y >= CH) return 0; return this.b[(this.oy + y)*this.s + this.ox + x]; }
    // paints only where nothing is yet / only over a given colour
    setIfEmpty(x, y, c){ if (!this.get(x, y)) this.set(x, y, c); }
    setOver(x, y, c, over){ if (this.get(x, y) === over) this.set(x, y, c); }
    rect(x, y, w, h, c){ for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
    // a line of whole pixels, wd 1 or 2 wide (the 2nd pixel to the right)
    line(x0, y0, x1, y1, c, wd = 1){
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (;;){ this.set(x0, y0, c); if (wd > 1) this.set(x0 + 1, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2*e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } }
    }
    // every pixel of the cell that has the colour `a` becomes `b`
    swap(a, b){ for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (this.get(x, y) === a) this.set(x, y, b); }
    // the outline: empty pixels next to a drawn pixel, on the sides asked for ('all', or letters of 'tblr': t = the pixel above the drawn one is empty...)
    outline(sides = 'all', c = IX.OUT){
      const pts = []; const dirs = sides === 'all' ? 'tblr' : sides;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++){ if (this.get(x, y)) continue;
        if ((dirs.includes('t') && this.get(x, y + 1)) || (dirs.includes('b') && this.get(x, y - 1)) || (dirs.includes('l') && this.get(x + 1, y)) || (dirs.includes('r') && this.get(x - 1, y))) pts.push(x, y); }
      for (let k = 0; k < pts.length; k += 2) this.set(pts[k], pts[k + 1], c);
    }
  }
  P.Cell = Cell;

  // ---------- the skeleton: the key points of a body on a frame ----------
  // body: { H (total height, 12 to 15), bw (torso width, 3 slim, 4 average, 5 broad) }. Rows: the head 4, the torso 4, the legs H - 8. cx is the body's centre column.
  // pose (per frame, in pixels relative to standing): bob (the whole body down), up (the upper body up, breathing), lean (the upper body forward), nearFoot / farFoot [dx, lift], nearHand / farHand [dx, dy]
  // from the shoulder, nearElbow / farElbow [dx, dy] from the shoulder (the bend), nod (the head down), swing (the hem trails: -1 back .. 1 forward), sit (seated), extra (props a frame uses)
  const CX = 5;
  P.skeleton = (body, pose) => {
    const H = body.H, bw = body.bw, bob = pose.bob || 0, up = pose.up || 0, lean = pose.lean || 0, sit = pose.sit ? 1 : 0;
    const headTop = CH - H + bob - up + (sit ? 3 : 0), shoulderY = headTop + 4, hipY = shoulderY + 4;   // (sitting: the whole upper body is lower, the legs fold)
    const k = { body, pose, cx: CX, headTop, shoulderY, hipY, lean, bw, footY: CH - 1 };
    k.hx = CX + lean - 1 + (pose.headDx || 0);  // the head's left column (the head is 4 wide: hx .. hx + 3); headDx tilts it (a look up: back one pixel)
    k.torso = { x0: CX - Math.floor(bw/2) + lean, x1: CX - Math.floor(bw/2) + lean + bw - 1 };
    k.nearSh = [CX + lean + 1, shoulderY + 1]; k.farSh = [CX + lean, shoulderY + 1];
    k.hip = [CX, hipY];
    const nf = pose.nearFoot || [1, 0], ff = pose.farFoot || [-1, 0];
    k.nearFoot = [CX + nf[0], CH - 1 - nf[1]]; k.farFoot = [CX + ff[0], CH - 1 - ff[1]];
    if (sit){ k.nearKnee = [CX + 4, hipY]; k.farKnee = [CX + 3, hipY]; k.nearFoot = [CX + 4, CH - 1]; k.farFoot = [CX + 3, CH - 1]; }
    else {
      const bend = pose.bend || 0, ku = pose.kneeUp || [0, 0];   // how far the knees bend forward (a run)
      k.nearKnee = [(k.hip[0] + k.nearFoot[0])/2 + bend, (hipY + k.nearFoot[1])/2 - ku[0]];
      k.farKnee = [(k.hip[0] + k.farFoot[0])/2 + bend, (hipY + k.farFoot[1])/2 - ku[1]]; }
    const nh = pose.nearHand || [0, 3], fh = pose.farHand || [0, 3];
    k.nearHand = [k.nearSh[0] + nh[0], k.nearSh[1] + nh[1]]; k.farHand = [k.farSh[0] + fh[0], k.farSh[1] + fh[1]];
    const ne = pose.nearElbow, fe = pose.farElbow;
    k.nearElbow = ne ? [k.nearSh[0] + ne[0], k.nearSh[1] + ne[1]] : [(k.nearSh[0] + k.nearHand[0])/2, (k.nearSh[1] + k.nearHand[1])/2];
    k.farElbow = fe ? [k.farSh[0] + fe[0], k.farSh[1] + fe[1]] : [(k.farSh[0] + k.farHand[0])/2, (k.farSh[1] + k.farHand[1])/2];
    k.nod = pose.nod || 0; k.swing = pose.swing || 0; k.sit = sit; k.extra = pose.extra || null;
    return k;
  };

  // ---------- the gaits: a pose for every frame ----------
  // (walk: the old rhythm, 6 frames: contact, down, pass, contact, down, pass; the body a pixel lower on the contact frames and the legs spread.)
  const poses = [];
  const walkPose = (k, A, B, lift, bobAmt) => {   // k the frame 0..5, A the stride (feet), B the arm swing
    const c = Math.cos(2*Math.PI*k/6), s = Math.sin(2*Math.PI*k/6);
    return { nearFoot: [1 + Math.round(A*c), Math.max(0, Math.round(-s*lift))], farFoot: [-1 - Math.round(A*c), Math.max(0, Math.round(s*lift))],
             nearHand: [Math.round(-B*c), 3], farHand: [Math.round(B*c), 3], bob: (k % 3 === 0) ? bobAmt : 0, swing: -c };
  };
  for (let k = 0; k < 6; k++) poses[F.WALK + k] = walkPose(k, 2, 2, 1, 1);
  // idle (4): a breath and a shift of weight
  const idle = [{ up: 0 }, { up: 0 }, { up: 1 }, { up: 0 }];
  for (let k = 0; k < 4; k++) poses[F.IDLE + k] = Object.assign({ nearFoot: [1, 0], farFoot: [-1, 0], nearHand: [0, 3], farHand: [0, 3] }, idle[k]);
  // gesture (6): talking: the near arm up and moving, the head nodding
  const gy = [1, -1, 0, -1, 1, 0], gx = [2, 3, 3, 2, 3, 3];
  for (let k = 0; k < 6; k++) poses[F.SPEC + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: [gx[k], gy[k]], nearElbow: [1, 2], farHand: [0, 3], nod: (k % 3 === 2) ? 1 : 0, up: k % 2 };
  // sitting (4): hips down, legs folded, hands on the knees, a breath
  for (let k = 0; k < 4; k++) poses[F.SIT + k] = { sit: true, up: k === 2 ? 1 : 0, nearHand: [2, 3], farHand: [1, 3], nod: k === 3 ? 1 : 0 };
  // using a handheld (6): an arm held out in front with a device, the other hand at the belt (the officer's scanner)
  for (let k = 0; k < 6; k++) poses[F.USE + k] = { nearFoot: [1, 0], farFoot: [-1, 0], nearHand: [4, 1 + (k % 2)], nearElbow: [2, 3], farHand: [0, 3], extra: { device: k } };
  // angry (6): both arms up, the fists shaking, the body leaning in
  for (let k = 0; k < 6; k++) poses[F.ANGRY + k] = { nearFoot: [1, 0], farFoot: [-1, 0], lean: 1, nearHand: [3, -1 + (k % 2)], nearElbow: [2, 2], farHand: [1, -1 + ((k + 1) % 2)], farElbow: [0, 2], nod: 1, bob: k % 2 };
  // running (6): a long stride, both feet in the air on the passing frames, the body leaning forward, the arms bent and pumping, a two pixel bob
  for (let k = 0; k < 6; k++){
    const c = Math.cos(2*Math.PI*k/6), s = Math.sin(2*Math.PI*k/6);
    poses[F.RUN + k] = { nearFoot: [1 + Math.round(3*c), Math.max(0, Math.round(1 - 1.6*Math.abs(c)) + (s < 0 ? 1 : 0))], farFoot: [-1 - Math.round(3*c), Math.max(0, Math.round(1 - 1.6*Math.abs(c)) + (s > 0 ? 1 : 0))],
      nearHand: [Math.round(-2.5*c) + 2, 2 - (c < 0 ? 1 : 0)], nearElbow: [Math.round(-2*c), 2], farHand: [Math.round(2.5*c) + 2, 2 - (c > 0 ? 1 : 0)], farElbow: [Math.round(2*c), 2],
      lean: 1, bend: .5, kneeUp: [s < 0 ? 1 : 0, s > 0 ? 1 : 0], bob: (k % 3 === 0) ? 1 : -1, swing: -1.6*c };
  }
  // (the umbrella poses: placeholders until the umbrella step: the walk and idle poses)
  for (let k = 0; k < 6; k++) poses[F.UWALK + k] = poses[F.WALK + k];
  for (let k = 0; k < 4; k++){ poses[F.UIDLE + k] = poses[F.IDLE + k]; poses[F.UOPEN + k] = poses[F.IDLE + k]; }
  for (let f = F.EAT; f < F.N; f++) poses[f] = poses[F.IDLE + (f % 4)];   // (the doing frames: placeholders until peoplegen_poses.js)
  P.poses = poses;

  // ---------- the looks: parts and shapes (registered by peoplegen_parts.js and the files after it) ----------
  P.parts = { hair: {}, hat: {}, top: {}, bottom: {}, prop: {} };
  P.shapes = [];   // a shape is a look: { name, body: { H, bw }, hair, hat, top, bottom, props: [], tags }
  P.addShape = (look) => { P.shapes.push(look); return P.shapes.length - 1; };

  // the parts of a look, resolved once and kept on the look (no per-cell lookups or allocations)
  const resolve = look => { let r = look._r; if (r) return r;
    const parts = P.parts, back = [], front = [], face = [];
    for (const n of (look.props || [])){ const pr = parts.prop[n]; if (!pr) continue; (pr.layer === 'back' ? back : pr.layer === 'face' ? face : front).push(pr); }
    if (look.face && parts.prop[look.face]) face.push(parts.prop[look.face]);
    r = look._r = { top: parts.top[look.top] || parts.top.tee, bot: parts.bottom[look.bottom] || parts.bottom.trousers, hair: look.hair ? parts.hair[look.hair] : null,
      hat: look.hat ? parts.hat[look.hat] : null, back, front, face, room: 0 };
    r.room = Math.max((r.hair && r.hair.room) || 0, (r.hat && r.hat.room) || 0, look.room || 0);
    return r;
  };
  // the outline: every empty pixel next to a drawn one (4 neighbours) becomes IX.OUT; one scratch buffer, no allocations
  const ob = new Uint8Array(CW*CH);
  const outlineFast = c => {
    const b = c.b, s = c.s, base = c.oy*s + c.ox;
    for (let y = 0; y < CH; y++){ const r = base + y*s;
      for (let x = 0; x < CW; x++){ const i = y*CW + x;
        if (b[r + x]){ ob[i] = 0; continue; }
        ob[i] = ((x > 0 && b[r + x - 1]) || (x < CW - 1 && b[r + x + 1]) || (y > 0 && b[r - s + x]) || (y < CH - 1 && b[r + s + x])) ? 1 : 0; } }
    for (let y = 0; y < CH; y++){ const r = base + y*s; for (let x = 0; x < CW; x++) if (ob[y*CW + x]) b[r + x] = IX.OUT; }
  };
  // the order a figure is painted in (back to front); every part gets (cell, skeleton, look); props say which layer they are ('back', 'front', or 'face': drawn with the head's corner)
  // the head needs `room` rows above it (a hat, a bun) and one more for the outline: if a frame lifts the body too high (a tall body breathing), the upper body stays down instead
  const fitTop = (k, room) => { const d = 1 + room - (k.headTop + k.nod); if (d <= 0) return; k.headTop += d; k.shoulderY += d; k.hipY += d; k.hip[1] += d;
    k.nearSh[1] += d; k.farSh[1] += d; k.nearElbow[1] += d; k.farElbow[1] += d; k.nearHand[1] += d; k.farHand[1] += d; };
  // the things held on the doing frames (pose.extra.item), drawn over the near arm: whole pixels, the person's own palette (WHITE for crockery and water, ACC for
  // a box or a can, LIT for a comm's screen, which keeps its glow at night)
  P.items = {
    // a bowl held at the chest in the far hand, the chopsticks in the near hand (dipping, or up at the mouth)
    bowl(c, k, e){ const b = k.farHand, h = k.nearHand; c.rect(b[0] - 1, b[1], 3, 1, IX.WHITE); c.set(b[0], b[1] + 1, IX.WHITE); c.set(b[0] - 1, b[1] - 1, IX.ACC); c.set(b[0] + 1, b[1] - 1, IX.ACC);
      c.set(h[0] + 1, h[1] - 1, IX.SHOE); c.set(h[0] + 2, h[1] - 2, IX.SHOE); },
    // a box in both hands (the near hand's place), its top lit by a strip of tape
    box(c, k){ const h = k.nearHand; c.rect(h[0] - 1, h[1] - 2, 3, 3, IX.ACC); c.rect(h[0] - 1, h[1] - 2, 3, 1, IX.TOP3); c.set(h[0], h[1] - 1, IX.WHITE); },
    // a small thing being handed over
    small(c, k){ const h = k.nearHand; c.rect(h[0], h[1] - 1, 2, 2, IX.ACC); c.set(h[0] + 1, h[1] - 1, IX.WHITE); },
    // a comm held out in front, its screen lit (posting, reading)
    screen(c, k){ const h = k.nearHand; c.set(h[0] + 1, h[1] - 1, IX.LIT); c.set(h[0] + 1, h[1], IX.OUT); },
    // a comm held to the ear: a lit sliver by the side of the head
    comm(c, k){ const h = k.nearHand; c.set(h[0], h[1] - 1, IX.LIT); c.set(h[0], h[1], IX.OUT); },
    // a watering can in the near hand, tipped forward; drops fall from the spout on the pouring frames
    can(c, k, e){ const h = k.nearHand; c.rect(h[0], h[1], 2, 2, IX.ACC); c.set(h[0], h[1] - 1, IX.TOP3); c.set(h[0] + 2, h[1] + 1, IX.ACC);
      if (e.pour){ c.set(h[0] + 2, h[1] + 2 + (e.pour === 2 ? 1 : 0), IX.WHITE); if (e.pour === 3) c.set(h[0] + 2, h[1] + 4, IX.WHITE); } }
  };
  P.drawFigure = (c, k, look) => {
    const r = resolve(look), top = r.top, bot = r.bot;
    fitTop(k, r.room);
    P.arm(c, k, false, top, look); P.leg(c, k, false, bot, look);   // far arm, far leg
    for (let i = 0; i < r.back.length; i++) r.back[i].draw(c, k, look);
    if (r.hair && r.hair.back) r.hair.back(c, k, look, k.hx, k.headTop + k.nod);
    if (top.back) top.back(c, k, look);
    P.torso(c, k, top, look);
    P.leg(c, k, true, bot, look);
    if (bot.front) bot.front(c, k, look);
    if (top.front) top.front(c, k, look);
    P.head(c, k, look);
    P.arm(c, k, true, top, look);
    for (let i = 0; i < r.front.length; i++) r.front[i].draw(c, k, look);
    for (let i = 0; i < r.back.length; i++) if (r.back[i].over) r.back[i].over(c, k, look);   // (a back prop's part on the front: a strap)
    if (k.extra && k.extra.item && P.items[k.extra.item]) P.items[k.extra.item](c, k, k.extra);   // a thing in the hands on the doing frames (a bowl, a box, a comm, a can)
    if (!look.outline || look.outline === 'all') outlineFast(c); else c.outline(look.outline);
  };
  // the head: skin lit from the upper left (the jaw and chin in the shade), an eye one pixel in from the front edge, then hair, hat, face gear
  P.head = (c, k, look) => {
    const r = resolve(look), x = k.hx, y = k.headTop + k.nod;
    c.rect(x, y, 4, 4, IX.SKIN);
    c.set(x + 3, y + 3, IX.SKIN2); c.set(x + 2, y + 3, IX.SKIN2);   // (the jaw in shade, the chin)
    c.set(x, y + 3, IX.SKIN2);                                       // (the neck side)
    c.set(x + 2, y + 2, IX.EYE);
    if (r.hair && r.hair.draw) r.hair.draw(c, k, look, x, y);
    if (r.hat) r.hat.draw(c, k, look, x, y);
    for (let i = 0; i < r.face.length; i++) r.face[i].draw(c, k, look, x, y);
  };
  // the torso: a block from the shoulders to the hips, lit from the upper left (a light rim top and left, the shade on the right and under the arm), then the top's own details
  P.torso = (c, k, top, look) => {
    const y0 = k.shoulderY, y1 = k.hipY - 1, w = k.bw, rows = y1 - y0 + 1, half = w >> 1;
    for (let j = 0; j < rows; j++){ const x0 = CX - half + Math.round(k.lean*(1 - j/Math.max(1, rows - 1)));
      for (let i = 0; i < w; i++){
        const col = i === w - 1 ? IX.TOP2 : (j === 0 || (i === 0 && j < 2 && w > 3)) ? IX.TOP3 : (j === rows - 1 && i > 0 ? IX.TOP2 : IX.TOP);
        c.set(x0 + i, y0 + j, col); } }
    if (top.neck !== 'none') c.set(k.hx + 1, y0, IX.SKIN2);
    if (top.torso) top.torso(c, k, look);
  };
  // an arm hangs inside the torso (the near arm one column behind the chest edge, the far arm one in from the back) so it reads as an arm and not as part of the body; the sleeve colour to the elbow
  // (short) or the wrist (long), then skin; the near arm is the top's colour with a light shoulder, the far arm its shade
  P.arm = (c, k, near, top, look) => {
    const sh = near ? k.nearSh : k.farSh, el = near ? k.nearElbow : k.farElbow, hd = near ? k.nearHand : k.farHand, sleeve = top.sleeve || 'short';
    const tx = near ? k.torso.x1 - 1 : k.torso.x0 + (k.bw > 3 ? 1 : 0), dx = tx - sh[0];
    const col = near ? (top.armCol || IX.TOP3) : IX.TOP2, skin = near ? IX.SKIN : IX.SKIN2, up = sleeve === 'none' ? skin : col, lo = sleeve === 'long' ? col : skin;
    const sx = sh[0] + dx, ex = Math.max(1, Math.min(10, el[0] + dx)), hx = Math.max(1, Math.min(10, hd[0] + dx));
    c.line(sx, sh[1], ex, el[1], up); c.line(ex, el[1], hx, hd[1], lo);
    c.set(hx, hd[1], skin);
    if (near){ k.nsx = sx; k.nsy = sh[1]; k.nex = ex; k.ney = el[1]; k.nhx = hx; k.nhy = hd[1]; }   // (the near arm's points as drawn, for the props that hold or cover it)
    if (near && sleeve !== 'none' && sleeve !== 'long') c.set(sx, sh[1], IX.TOP3);
    if (top.arm) top.arm(c, k, near, look);
  };
  // a leg: two pixels wide, the thigh and the shin in the bottom's colour (the far leg in the shade), a shoe pointing forward at the foot. The legs stand under the hips (the feet only move away from
  // that stance by the pose), so a standing figure stands straight; sitting folds the thigh forward.
  const LC0 = [[4, 5], [3, 5], [3, 6]];   // left column of the far and the near leg, per build (slim, average, broad)
  P.leg = (c, k, near, bot, look) => {
    const lc0 = LC0[Math.min(2, Math.max(0, k.bw - 3))][near ? 1 : 0], col = near ? IX.BOT : IX.BOT2, short = bot.len === 'short' || bot.len === 'skirt', skin = near ? IX.SKIN : IX.SKIN2;
    const shoes = look.shoes || 'shoe', shc = IX.SHOE, hipY = k.hipY;
    if (k.sit){
      const kx = Math.min(8, lc0 + 3) - (near ? 0 : 1), r1 = Math.min(14, hipY + 1);
      for (let y = hipY; y <= r1; y++) c.rect(lc0, y, kx - lc0 + 2, 1, y === hipY ? col : col);
      if (near) c.rect(lc0, r1, kx - lc0 + 2, 1, IX.BOT2);
      for (let y = r1 + 1; y < CH - 1; y++) c.rect(kx, y, 2, 1, short ? skin : col);
      c.rect(kx, CH - 1, 3, 1, shc); if (shoes === 'sneaker') c.rect(kx + 1, CH - 1, 2, 1, IX.WHITE);
      k.kx = kx; k.ky = r1; k.lcx = kx; k.lcy = CH - 1;
      if (bot.leg) bot.leg(c, k, near, look);
      return;
    }
    const kn = near ? k.nearKnee : k.farKnee, ft = near ? k.nearFoot : k.farFoot, hx = k.hip[0], stand = near ? CX + 1 : CX - 1;
    const lc = Math.max(1, Math.min(8, lc0 + ft[0] - stand)), kl = Math.max(1, Math.min(8, (lc0 + lc)/2 + (kn[0] - (hx + ft[0])/2))), ky = kn[1], fy = ft[1];
    k.kx = kl; k.ky = ky; k.lcx = lc; k.lcy = fy;   // (the knee and the foot as drawn, for the bottoms' details)
    c.line(lc0, hipY, kl, ky, col, 2);
    const lift = CH - 1 - fy > 0 ? 1 : 0, lcs = lift ? Math.max(1, lc - 1) : lc;   // a lifted foot kicks the shin back (the knee bends)
    c.line(kl, ky, lcs, fy - 1, short ? skin : col, 2);
    // the shoe: heel, sole, toe; a boot climbs one row of the shin; a sneaker has a pale toe
    c.rect(lcs, fy, 3, 1, shc);
    if (shoes === 'boot') { c.rect(lcs, fy - 1, 2, 1, shc); }
    else if (shoes === 'sneaker') c.rect(lcs + 1, fy, 2, 1, IX.WHITE);
    if (bot.leg) bot.leg(c, k, near, look);
  };
  P.legCols = LC0;


  // ---------- the palettes ----------
  // A palette row is the 15 colours of one person: skin, hair, top, accent, bottom picked from curated ramps (never fully random colours: a rainy neon city, mostly muted with one accent each). The rows are
  // numbered by the combination (skin, hair, top, accent, bottom), so the same choice is the same row everywhere; the rows after them are special palettes (the officer, the bouncers, the archivist...).
  const hex = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const mixc = (a, b, t) => { const p = hex(a), q = hex(b); return ((Math.round(p[0] + (q[0] - p[0])*t) << 16) | (Math.round(p[1] + (q[1] - p[1])*t) << 8) | Math.round(p[2] + (q[2] - p[2])*t)); };
  // darker goes cooler and more saturated, lighter warmer (the foliage rule)
  const shade = (c, t) => { const [r, g, b] = hex(c); if (t < 0){ const k = -t; return mixc((Math.round(r*(1 - k*.5)) << 16) | (Math.round(g*(1 - k*.45)) << 8) | Math.min(255, Math.round(b*(1 - k*.3) + 14*k)), 0, 0); }
    return (Math.min(255, Math.round(r + (255 - r)*t*.55 + 6*t)) << 16) | (Math.min(255, Math.round(g + (255 - g)*t*.5 + 2*t)) << 8) | Math.min(255, Math.round(b + (255 - b)*t*.4 - 4*t)); };
  P.SKIN = [0xf0c8a0, 0xd9a070, 0xb07848, 0x80502e, 0xf2d6c4];
  P.HAIR = [0x1c1820, 0x3a2418, 0x6a4430, 0xd0b060, 0xa84828, 0x9a9aa4, 0x28a8a0, 0xd8508c];
  P.TOPC = [0x3c4050, 0x2c3868, 0x5a6a3c, 0xc09a34, 0xa8502c, 0x3c7a80, 0xd8cfb8, 0x7a2c40];
  P.ACCC = [0xff4fa3, 0x38e8e0, 0xffb347, 0x9dff6a];
  P.BOTC = [0x3a5a94, 0x26262e, 0x8c7c58];
  P.NPAL_MIX = P.SKIN.length*P.HAIR.length*P.TOPC.length*P.ACCC.length*P.BOTC.length;   // 3840
  P.palIndex = (s, h, t, a, b) => (((s*P.HAIR.length + h)*P.TOPC.length + t)*P.ACCC.length + a)*P.BOTC.length + b;
  // the 15 colours (index 1..15) of a combination, as 0xRRGGBB
  P.palColors = (skin, hair, top, acc, bot) => {
    const S = P.SKIN[skin], Hc = P.HAIR[hair], T = P.TOPC[top], A = P.ACCC[acc], B = P.BOTC[bot];
    const c = new Array(16).fill(0);
    c[IX.OUT] = 0x16121e; c[IX.SKIN] = S; c[IX.SKIN2] = shade(S, -.28); c[IX.HAIR] = Hc; c[IX.HAIR2] = shade(Hc, .3);
    c[IX.TOP] = T; c[IX.TOP2] = shade(T, -.32); c[IX.TOP3] = shade(T, .28); c[IX.BOT] = B; c[IX.BOT2] = shade(B, -.3);
    c[IX.LIT] = A; c[IX.SHOE] = mixc(shade(B, -.5), 0x0c0a12, .4); c[IX.ACC] = shade(A, -.35); c[IX.WHITE] = 0xe6e2da; c[IX.EYE] = 0x1c1620;
    return c;
  };
  // the 15 colours of palette row n (a mix, or a special row after the mixes)
  P.colorsOfRow = n => { if (n >= P.NPAL_MIX) return P.specialPalettes[n - P.NPAL_MIX].colors;
    const nb = P.BOTC.length, na = P.ACCC.length, nt = P.TOPC.length, nh = P.HAIR.length; let m = n; const bo = m % nb; m = (m - bo)/nb; const ac = m % na; m = (m - ac)/na; const to = m % nt; m = (m - to)/nt; const ha = m % nh; m = (m - ha)/nh;
    return P.palColors(m, ha, to, ac, bo); };
  P.specialPalettes = [];   // [{ name, colors: 16 }] , their rows follow the mixes
  P.palRow = (name) => { const i = P.specialPalettes.findIndex(s => s.name === name); return i < 0 ? 0 : P.NPAL_MIX + i; };
  P.specialPalette = (name, over) => { const base = P.palColors(0, 0, 0, 0, 1); for (const k in over) base[+k] = over[k]; P.specialPalettes.push({ name, colors: base }); };
  // the palette texture's pixels: 16 columns (the indices), one row per palette (RGBA)
  P.paletteData = () => {
    const rows = 4096, d = new Uint8Array(16*rows*4); let n = 0;
    for (let s = 0; s < P.SKIN.length; s++) for (let h = 0; h < P.HAIR.length; h++) for (let t = 0; t < P.TOPC.length; t++) for (let a = 0; a < P.ACCC.length; a++) for (let b = 0; b < P.BOTC.length; b++, n++){
      const c = P.palColors(s, h, t, a, b); for (let i = 0; i < 16; i++){ const [r, g, bl] = hex(c[i]); d[(n*16 + i)*4] = r; d[(n*16 + i)*4 + 1] = g; d[(n*16 + i)*4 + 2] = bl; d[(n*16 + i)*4 + 3] = 255; } }
    P.specialPalettes.forEach((sp, j) => { const row = P.NPAL_MIX + j; for (let i = 0; i < 16; i++){ const [r, g, bl] = hex(sp.colors[i]); d[(row*16 + i)*4] = r; d[(row*16 + i)*4 + 1] = g; d[(row*16 + i)*4 + 2] = bl; d[(row*16 + i)*4 + 3] = 255; } });
    return d;
  };
  P.hex = hex; P.mixc = mixc; P.shade = shade;

  // ---------- roles and the look picker ----------
  // a role is a shape (and a palette) for an old row that has no shape bits (the officer 12, the bouncers 15, the archivist 16, the lurkers 9 to 11, the emote bubbles 14)
  P.role = (oldRow, shape, palRow) => { P.roleShape[oldRow] = shape; P.rolePal[oldRow] = palRow || 0; };
  P.citizens = [];   // the shapes a resident can have (indices), with the weights in P.shapes[i].w
  // a resident's look code, from who they are: `h(k)` an integer hash of (their id, k) (people.js hash), ctx = { zone, job, courier }; by hash only, never random
  P.lookFor = (id, oldRow, h, ctx) => {
    if (!P.citizens.length) return oldRow;
    const c = ctx || {}, n = P.citizens.length; let best = -1, bw = -1;
    // weighted pick: each citizen shape has a weight for the person's zone, courier or job (tags); the pick is the one with the highest weight * a hash draw
    for (let i = 0; i < n; i++){ const sh = P.shapes[P.citizens[i]], w = (sh.w ? sh.w(c) : 1); if (w <= 0) continue; const r = (h('shape' + i) % 1000 + 1)/1000, v = Math.pow(r, 1/w); if (v > bw){ bw = v; best = P.citizens[i]; } }
    const pick = (list, key, ws) => { let bi = 0, bv = -1; for (let i = 0; i < list.length; i++){ const w = ws ? ws[i] : 1; if (w <= 0) continue; const r = (h(key + i) % 1000 + 1)/1000, v = Math.pow(r, 1/w); if (v > bv){ bv = v; bi = i; } } return bi; };
    const zl = P.zoneLean ? P.zoneLean(c) : {};
    const skin = pick(P.SKIN, 'skin', zl.skin), hair = pick(P.HAIR, 'hair', zl.hair), top = pick(P.TOPC, 'top', zl.top), acc = pick(P.ACCC, 'acc', zl.acc), bot = pick(P.BOTC, 'bot', zl.bot);
    return P.code(oldRow, best, P.palIndex(skin, hair, top, acc, bot));
  };

  // ---------- the sheet ----------
  const COLS = F.N;
  P.ROWS = 0;
  P.extra = [];   // rows painted straight onto the canvas (not as colour indices): { name, draw(g, x, y) } one row of 16 px each (the emote bubbles)
  // draw every shape in every frame; the sheet is `sheet.cv` (a canvas, 624 wide, (shapes + extra rows) * 16 tall)
  P.build = () => {
    if (window.IN_RECIPE_WORKER || !P.shapes.length || P.sheet) return;
    const rows = P.shapes.length, total = rows + P.extra.length, W = COLS*CW, H = total*CH, buf = new Uint8Array(W*H), t0 = performance.now();
    for (let r = 0; r < rows; r++){
      const look = P.shapes[r];
      for (let f = 0; f < F.N; f++){ const cell = new Cell(buf, W, f*CW, r*CH); if (look.custom) look.custom(cell, f); else P.drawFigure(cell, P.skeleton(look.body, poses[f]), look); }
    }
    P.indexBuf = buf; P.W = W; P.H = H; P.ROWS = total; P.SHAPE_ROWS = rows; P.buildMs = performance.now() - t0;
    // to a canvas as colour indices (red = index*16 + 8), alpha 255 where drawn
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let i = 0; i < buf.length; i++){ const v = buf[i]; if (v){ d[i*4] = v*16 + 8; d[i*4 + 3] = 255; } }
    g.putImageData(img, 0, 0);
    P.extra.forEach((e, j) => { e.row = rows + j; P.roleShape[e.oldRow] = e.row; e.draw(g, 0, (rows + j)*CH); });
    P.sheet = { cv, W, H, rows: total };
  };
  // the palette texture (16 x 4096) and the switch: window.__OLD_PEOPLE (the overlay test "old people (as before)") swaps the Craftpix sheet in and out of PPL_TEX and the shader's settings
  P.palTex = null;
  P.palTexture = () => { if (!P.palTex){ P.palTex = new THREE.DataTexture(P.paletteData(), 16, 4096, THREE.RGBAFormat); P.palTex.magFilter = P.palTex.minFilter = THREE.NearestFilter; P.palTex.generateMipmaps = false; P.palTex.needsUpdate = true; } return P.palTex; };
  P.apply = () => {
    if (typeof PPL_MAT === 'undefined') return;
    const U = PPL_MAT.uniforms, live = !window.__OLD_PEOPLE && (P.sheet || (P.build(), P.sheet));
    if (live){
      PPL_TEX.image = P.sheet.cv; PPL_TEX.needsUpdate = true; U.sheet.value.set(P.sheet.W, P.sheet.H, CW, CH); U.rowsM1.value = P.sheet.rows - 1; U.pal.value = P.palTexture(); U.palRows.value = 4096; U.usePal.value = 1;
    } else {
      const to = img => { PPL_TEX.image = img; PPL_TEX.needsUpdate = true; U.sheet.value.set(384, 272, 12, 16); U.rowsM1.value = 16; U.pal.value = PPL_TEX; U.usePal.value = 0; };
      if (P.oldImg && P.oldImgReady) to(P.oldImg); else if (!P.oldImg){ P.oldImg = new Image(); P.oldImg.onload = () => { P.oldImgReady = true; if (!P.live()) to(P.oldImg); }; P.oldImg.src = 'assets/sprites/people_v2.png'; }
    }
  };
  return P;
})();
