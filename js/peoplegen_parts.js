// Neon Terrarium: the parts of the character generator (peoplegen.js): hair, hats, face gear, tops, bottoms and props. Each is a few pixels drawn on the skeleton of the frame, in the 15 colour indices
// (PG.IX), facing right: the back of the head is the left. Runs after peoplegen.js, before peoplegen_shapes.js (the looks) and peoplegen_roles.js. A part draws only what it adds; the body (head, torso,
// arms, legs, the shading and the outline) is the core's. No Math.random, no Date.
//
// The head is 4 x 4 at (x, y) = its top left (x .. x + 3, y .. y + 3): the face is the right column, the eye at (x + 2, y + 2), the back of the head the column x. A hair or hat part that rises above
// the head says how many rows in `room` (the core keeps the body low enough that the part and its outline stay inside the cell). Parts that hang off the body use k (the skeleton): k.torso.x0 / x1
// (the top row of the torso), k.shoulderY, k.hipY, k.hx / k.headTop (the head), k.nsx .. k.nhy (the near arm as drawn), k.kx / k.ky (the knee as drawn).
// Follow-through: long hair, coat tails, scarves and bag swings use lag(k), the swing of the PREVIOUS frame of the gait, so they trail a frame behind the body.
(() => {
  const IX = PG.IX, parts = PG.parts, F = PG.F, CX = 5;
  const H1 = IX.HAIR, H2 = IX.HAIR2;
  // ---------- follow-through: the swing of the previous frame of this gait (walk 0..5, run 32..37) ----------
  const idxOf = new Map(); PG.poses.forEach((p, i) => { if (!idxOf.has(p)) idxOf.set(p, i); });
  const lag = k => { const f = idxOf.get(k.pose); if (f === undefined) return k.swing || 0;
    if (f >= F.WALK && f < F.WALK + 6) return PG.poses[F.WALK + (f - F.WALK + 5) % 6].swing || 0;
    if (f >= F.RUN && f < F.RUN + 6) return PG.poses[F.RUN + (f - F.RUN + 5) % 6].swing || 0;
    return k.swing || 0; };
  const moving = k => k.pose.swing !== undefined;
  // ---------- hair: draw(c, k, look, x, y) over the head, back(c, k, look, x, y) behind the body (long hair, tails) ----------
  const hair = parts.hair;
  hair.short = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.rect(x, y + 1, 2, 1, H1); c.set(x, y + 2, H1); c.set(x + 1, y, H2); } };
  hair.buzz = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.set(x, y + 1, H1); c.set(x + 1, y, H2); } };
  hair.bald = { draw(c, k, look, x, y){ c.set(x, y, 0); c.set(x + 3, y, 0); c.set(x + 1, y, IX.SKIN); } };
  hair.balding = { draw(c, k, look, x, y){ c.set(x, y, 0); c.set(x + 3, y, 0); c.rect(x, y + 1, 1, 2, H1); c.set(x + 1, y, H1); } };
  hair.undercut = { room: 1, draw(c, k, look, x, y){ c.rect(x + 1, y - 1, 3, 1, H1); c.rect(x, y, 4, 1, H1); c.set(x + 2, y - 1, H2); c.set(x, y + 1, IX.SKIN2); } };
  hair.slick = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.rect(x, y + 1, 1, 2, H1); c.set(x + 1, y, H2); c.set(x + 2, y, H2); c.set(x + 3, y + 1, H1); } };
  hair.spiky = { room: 1, draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.set(x, y + 1, H1); c.set(x, y - 1, H1); c.set(x + 2, y - 1, H1); c.set(x + 1, y, H2); c.set(x + 3, y + 1, H1); } };
  hair.mohawk = { room: 2, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, H1); c.rect(x + 1, y, 3, 1, H1); c.set(x + 2, y - 2, H1); c.set(x + 1, y - 1, H2); c.set(x, y, IX.SKIN2); c.set(x, y + 1, IX.SKIN2); } };
  hair.curly = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, H1); c.rect(x - 1, y, 6, 1, H1); c.rect(x - 1, y + 1, 2, 2, H1); c.set(x + 4, y + 1, H1); c.set(x + 1, y - 1, H2); c.set(x - 1, y, H2); } };
  hair.afro = { room: 2, draw(c, k, look, x, y){ c.rect(x, y - 2, 4, 1, H1); c.rect(x - 1, y - 1, 6, 2, H1); c.rect(x - 1, y + 1, 2, 2, H1); c.set(x + 4, y + 1, H1); c.set(x + 1, y - 2, H2); c.set(x, y - 1, H2); } };
  hair.bob = { draw(c, k, look, x, y){ c.rect(x - 1, y, 5, 1, H1); c.rect(x - 1, y + 1, 3, 3, H1); c.set(x + 2, y + 1, H1); c.set(x, y, H2); c.set(x + 1, y, H2); c.set(x + 3, y + 1, H1); } };
  hair.bun = { room: 1, draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.rect(x, y + 1, 2, 1, H1); c.set(x, y + 2, H1); c.rect(x - 1, y - 1, 2, 2, H1); c.set(x - 1, y - 1, H2); c.set(x + 1, y, H2); } };
  hair.ponytail = {
    back(c, k, look, x, y){ const t = Math.round(lag(k)*.8); c.set(x - 1, y + 1, H1); c.set(x - 2 + Math.round(t/2), y + 2, H1); c.set(x - 2 + t, y + 3, H1); c.set(x - 2 + t, y + 4, H2); c.set(x - 3 + t, y + 5, H1); },
    draw(c, k, look, x, y){ c.rect(x, y, 4, 1, H1); c.rect(x, y + 1, 2, 1, H1); c.set(x, y + 2, H1); c.set(x + 1, y, H2); c.set(x - 1, y + 1, IX.ACC); } };
  hair.long = {
    back(c, k, look, x, y){ const t = Math.round(lag(k)*.8); for (let j = 0; j < 7; j++){ const xa = x - 1 - (j > 2 ? 1 : 0) + (j > 4 ? t : 0); c.set(xa, y + 1 + j, H1); c.set(xa + 1, y + 1 + j, H1); } },
    draw(c, k, look, x, y){ c.rect(x - 1, y, 5, 1, H1); c.rect(x - 1, y + 1, 3, 1, H1); c.rect(x - 1, y + 2, 2, 1, H1); c.set(x + 1, y, H2); c.set(x + 2, y, H2); c.set(x + 3, y + 1, H1); } };
  hair.braids = {
    back(c, k, look, x, y){ const t = Math.round(lag(k)*.8); for (let j = 0; j < 8; j++){ const xa = x - 1 - (j > 2 ? 1 : 0) + (j > 5 ? t : 0); c.set(xa, y + 1 + j, j % 2 ? H2 : H1); c.set(xa + 1, y + 1 + j, H1); } c.set(x - 2 + t, y + 9, IX.ACC); },
    draw(c, k, look, x, y){ c.rect(x - 1, y, 5, 1, H1); c.rect(x - 1, y + 1, 2, 1, H1); c.set(x, y + 2, H1); c.set(x + 1, y, H2); } };
  // ---------- hats: draw(c, k, look, x, y), over the hair ----------
  const hat = parts.hat;
  const capShape = (c, x, y, crown, brim, hi, lit) => { c.rect(x + 1, y - 1, 3, 1, crown); c.rect(x, y, 4, 1, crown); c.rect(x + 3, y + 1, 2, 1, brim); c.set(x, y + 1, crown); if (hi) c.set(x + 1, y - 1, hi); if (lit) c.set(x + 3, y, lit); };
  hat.cap = { room: 1, draw(c, k, look, x, y){ capShape(c, x, y, IX.ACC, IX.ACC, 0, IX.LIT); } };            // (the officer's cap: matte accent and a lit badge)
  hat.capT = { room: 1, draw(c, k, look, x, y){ capShape(c, x, y, IX.TOP, IX.TOP2, IX.TOP3, 0); } };       // a cap in the colour of the top
  hat.capL = { room: 1, draw(c, k, look, x, y){ capShape(c, x, y, IX.LIT, IX.ACC, IX.WHITE, 0); } };       // a bright courier cap
  hat.beanie = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 3, 1, IX.ACC); c.rect(x - 1, y, 5, 1, IX.ACC); c.set(x + 1, y - 1, IX.TOP3); c.set(x + 3, y + 1, IX.ACC); c.set(x, y + 1, IX.ACC); } };
  hat.beanieT = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 3, 1, IX.TOP2); c.rect(x - 1, y, 5, 1, IX.TOP2); c.set(x + 1, y - 1, IX.TOP); c.set(x + 3, y, IX.TOP3); c.set(x, y + 1, IX.TOP2); } };
  hat.hood = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP2); c.rect(x - 1, y, 5, 1, IX.TOP2); c.rect(x - 1, y + 1, 2, 3, IX.TOP2); c.set(x + 3, y, IX.TOP); c.set(x + 3, y + 1, IX.OUT); c.set(x + 1, y - 1, IX.TOP); c.set(x - 1, y + 3, IX.TOP2); } };
  hat.helmet = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.ACC); c.rect(x - 1, y, 5, 1, IX.ACC); c.rect(x - 1, y + 1, 1, 2, IX.ACC); c.set(x + 3, y + 1, IX.LIT); c.set(x + 1, y - 1, IX.WHITE); } };
  hat.hardhat = { room: 1, draw(c, k, look, x, y){ c.rect(x + 1, y - 1, 3, 1, IX.LIT); c.rect(x - 1, y, 6, 1, IX.LIT); c.set(x + 2, y - 1, IX.WHITE); c.set(x, y + 1, H1); } };
  hat.visor = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP2); c.rect(x, y, 4, 1, IX.TOP2); c.rect(x + 2, y + 1, 3, 1, IX.LIT); c.set(x + 1, y - 1, IX.TOP); } };
  hat.fedora = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP2); c.rect(x - 1, y, 7, 1, IX.TOP2); c.set(x + 1, y - 1, IX.TOP); c.set(x + 3, y - 1, IX.ACC); c.set(x - 1, y + 1, 0); } };
  hat.bucket = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.TOP3); c.rect(x - 1, y, 6, 1, IX.TOP3); c.set(x + 1, y - 1, IX.WHITE); c.set(x - 1, y, IX.TOP); c.set(x + 4, y, IX.TOP); } };
  hat.beret = { room: 1, draw(c, k, look, x, y){ c.rect(x, y - 1, 4, 1, IX.ACC); c.rect(x - 1, y, 5, 1, IX.ACC); c.set(x + 1, y - 1, IX.TOP3); c.set(x + 3, y + 1, IX.ACC); } };
  hat.headwrap = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.ACC); c.rect(x, y + 1, 2, 1, IX.ACC); c.set(x, y + 2, IX.ACC); c.set(x + 3, y + 1, IX.ACC); c.set(x + 1, y, IX.LIT); } };
  hat.bandana = { draw(c, k, look, x, y){ c.rect(x, y, 4, 1, IX.TOP3); c.set(x - 1, y + 1, IX.TOP3); c.set(x - 1, y + 2, IX.TOP); c.set(x, y + 1, IX.TOP3); } };
  // ---------- face gear: layer 'face', draw(c, k, look, x, y) with the head's top left (drawn over the face, under nothing else) ----------
  const prop = parts.prop;
  prop.mask = { layer: 'face', draw(c, k, look, x, y){ c.set(x + 3, y + 2, IX.WHITE); c.rect(x + 1, y + 3, 3, 1, IX.WHITE); c.set(x, y + 2, IX.ACC); c.set(x + 3, y + 3, IX.ACC); } };
  prop.respirator = { layer: 'face', draw(c, k, look, x, y){ c.set(x + 3, y + 2, IX.ACC); c.rect(x + 1, y + 3, 3, 1, IX.ACC); c.set(x + 4, y + 3, IX.LIT); c.set(x + 4, y + 2, IX.ACC); c.set(x, y + 2, IX.OUT); } };
  prop.goggles = { layer: 'face', draw(c, k, look, x, y){ c.rect(x, y + 2, 2, 1, IX.OUT); c.rect(x + 2, y + 2, 2, 1, IX.LIT); c.set(x + 1, y + 1, IX.OUT); } };
  prop.shades = { layer: 'face', draw(c, k, look, x, y){ c.rect(x + 1, y + 2, 3, 1, IX.OUT); c.set(x, y + 2, IX.OUT); c.set(x + 3, y + 2, IX.EYE); c.set(x + 2, y + 1, IX.WHITE); } };
  prop.cybereye = { layer: 'face', draw(c, k, look, x, y){ c.set(x + 2, y + 2, IX.LIT); c.set(x + 3, y + 1, IX.OUT); } };
  prop.eyepatch = { layer: 'face', draw(c, k, look, x, y){ c.rect(x + 1, y + 2, 2, 1, IX.OUT); c.set(x + 3, y + 1, IX.OUT); c.set(x, y + 1, IX.OUT); } };
  prop.beard = { layer: 'face', draw(c, k, look, x, y){ c.rect(x, y + 3, 4, 1, H1); c.set(x + 3, y + 2, H1); } };
  prop.stache = { layer: 'face', draw(c, k, look, x, y){ c.set(x + 3, y + 2, H1); c.set(x + 2, y + 3, H1); c.set(x + 3, y + 3, H1); } };
  prop.headphones = { layer: 'face', draw(c, k, look, x, y){ c.rect(x, y + 1, 2, 2, IX.ACC); c.set(x + 1, y + 1, IX.LIT); c.rect(x + 1, y, 2, 1, IX.ACC); } };
  prop.earpiece = { layer: 'face', draw(c, k, look, x, y){ c.set(x + 1, y + 2, IX.LIT); c.set(x + 1, y + 3, IX.OUT); } };
  // ---------- tops: sleeve 'short' | 'long' | 'none', neck 'none' (a collar covers the neck), torso(c, k, look) decorates the torso, front(c, k, look) is drawn over the upper legs, back(c, k, look) behind the body ----------
  const top = parts.top;
  // a hem over the upper legs: `rows` rows from the hip, flared and trailing behind the body (a frame late) when it moves; col the hem, shade the fold and the bottom row, edge a trim colour or 0
  const hem = (c, k, rows, col, shade, flare, edge) => {
    const x0 = CX - (k.bw >> 1), x1 = x0 + k.bw - 1, mv = moving(k), sw = lag(k), tr = mv ? -1 + Math.round(sw*.5) : 0;
    for (let j = 0; j < rows; j++){ const y = k.hipY + j, xl = x0 + (j > 0 ? tr : 0) - (flare && j > 0 ? 1 : 0), xr = x1 + (flare && j > 1 ? 1 : 0);
      for (let x = xl; x <= xr; x++) c.set(x, y, (j === rows - 1 && edge) ? edge : (x === xr || j === rows - 1) ? shade : col);
      if (j > 0 && !edge) c.set(xr - 1 - (flare ? 1 : 0), y, shade); }   // (the fold of the coat's front)
  };
  top.tee = { sleeve: 'short' };
  top.tshirt = top.tee;
  top.stripe = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 1, k.bw - 1, 1, IX.TOP2); c.rect(k.torso.x0, k.shoulderY + 3, k.bw - 1, 1, IX.TOP2); } };
  top.graphic = { sleeve: 'short', torso(c, k){ c.set(k.torso.x0 + 1 + (k.bw > 3 ? 1 : 0), k.shoulderY + 2, IX.LIT); c.set(k.torso.x0 + 1, k.shoulderY + 2, IX.WHITE); } };
  top.tank = { sleeve: 'none', armCol: IX.SKIN, torso(c, k){ c.set(k.torso.x0, k.shoulderY, IX.SKIN); c.set(k.torso.x1, k.shoulderY, IX.SKIN2); } };
  top.sweater = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 2, 1, IX.TOP3); c.rect(k.torso.x0, k.hipY - 1, k.bw - 1, 1, IX.TOP3); } };
  top.hoodie = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 3, 1, IX.TOP2); c.rect(k.torso.x0 + 1, k.hipY - 2, k.bw - 2, 1, IX.TOP2); c.set(k.hx + 2, k.shoulderY + 1, IX.WHITE); },
    front(c, k){ c.rect(k.torso.x0 - 1, k.shoulderY, 2, 2, IX.TOP2); c.set(k.torso.x0 - 1, k.shoulderY, IX.TOP); } };
  top.jacket = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 2, 1, IX.TOP3); c.set(k.torso.x1, k.shoulderY, IX.WHITE); c.rect(k.torso.x1 - 1, k.shoulderY + 1, 1, 3, IX.TOP2); }, front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.TOP2); } };
  top.bomber = { sleeve: 'long', neck: 'none', armCol: IX.TOP, torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 2, 1, IX.ACC); c.rect(k.torso.x0, k.hipY - 1, k.bw, 1, IX.ACC); c.rect(k.torso.x1 - 1, k.shoulderY + 1, 1, 2, IX.TOP2); }, front(c, k){ c.rect(k.torso.x0, k.hipY, k.bw, 1, IX.ACC); },
    arm(c, k, near){ const ex = near ? k.nex : k.nex, hx = near ? k.nhx : 0; if (near) c.set(hx, k.nhy - 1, IX.ACC); } };
  top.coat = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 3, 1, IX.TOP3); c.rect(k.torso.x1, k.shoulderY + 1, 1, 3, IX.TOP3); c.set(k.torso.x1 - 1, k.shoulderY + 1, IX.WHITE); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2, true, 0); } };
  top.trench = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 2, k.bw, 1, IX.ACC); c.rect(k.hx + 1, k.shoulderY, 3, 1, IX.TOP3); c.set(k.torso.x1 - 1, k.shoulderY + 1, IX.TOP2); c.set(k.hx + 3, k.shoulderY + 1, IX.TOP3); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2, true, 0); } };
  top.raincoat = { sleeve: 'long', neck: 'none', torso(c, k){ c.rect(k.hx + 1, k.shoulderY, 3, 1, IX.TOP3); c.rect(k.torso.x0, k.shoulderY + 2, k.bw - 1, 1, IX.WHITE); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2, true, IX.WHITE); } };
  top.vest = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0 + 1, k.shoulderY, k.bw - 2, 4, IX.ACC); c.set(k.torso.x0 + 1, k.shoulderY + 1, IX.LIT); c.set(k.torso.x0 + 1, k.shoulderY + 3, IX.LIT); } };
  top.hivis = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0 + 1, k.shoulderY, k.bw - 2, 4, IX.LIT); c.rect(k.torso.x0 + 1, k.shoulderY + 2, k.bw - 2, 1, IX.WHITE); c.set(k.torso.x0, k.shoulderY, IX.TOP3); } };
  top.overalls = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 1, k.bw, 3, IX.BOT); c.rect(k.torso.x0 + 1, k.shoulderY, 1, 1, IX.BOT); c.rect(k.torso.x1, k.shoulderY + 1, 1, 3, IX.BOT2); c.set(k.torso.x0 + 1, k.shoulderY + 1, IX.LIT); c.set(k.torso.x0 + 1 + (k.bw > 3 ? 1 : 0), k.shoulderY + 3, IX.BOT2); } };
  top.apron = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0 + 1, k.shoulderY + 1, k.bw - 1, 3, IX.WHITE); c.rect(k.torso.x1, k.shoulderY + 1, 1, 3, IX.TOP3); c.set(k.torso.x0 + 1, k.shoulderY + 1, IX.TOP3); }, front(c, k){ c.rect(k.torso.x0 + 1, k.hipY, k.bw - 1, 2, IX.WHITE); c.rect(k.torso.x1, k.hipY, 1, 2, IX.TOP3); } };
  top.dress = { sleeve: 'short', torso(c, k){ c.rect(k.torso.x0, k.shoulderY + 2, k.bw - 1, 1, IX.TOP3); }, front(c, k){ hem(c, k, 3, IX.TOP, IX.TOP2, true, 0); } };
  // ---------- bottoms: len 'long' | 'short' | 'skirt' (bare lower legs), leg(c, k, near, look) decorates a leg, front(c, k, look) is drawn over the hips ----------
  const bottom = parts.bottom;
  bottom.trousers = { len: 'long' };
  bottom.cargo = { len: 'long', leg(c, k, near){ if (k.kx !== undefined) c.set(k.kx + (near ? 1 : 0), k.ky, IX.ACC); } };
  bottom.joggers = { len: 'long', leg(c, k, near){ if (near && k.kx !== undefined){ c.set(k.kx, k.ky - 1, IX.LIT); c.set(k.kx, k.ky, IX.LIT); } } };
  bottom.patched = { len: 'long', leg(c, k, near){ if (near && k.kx !== undefined){ c.set(k.kx, k.ky, IX.ACC); c.set(k.kx + 1, k.ky, IX.TOP3); } } };
  bottom.shorts = { len: 'short' };
  bottom.bare = { len: 'short' };
  const skirtRows = (c, k, rows, col, shade, flare) => { const x0 = CX - (k.bw >> 1), x1 = x0 + k.bw - 1, mv = moving(k), tr = mv ? Math.round(lag(k)*.5) - 0 : 0;
    for (let j = 0; j < rows; j++) for (let x = x0 + (j > 0 ? Math.min(0, tr) : 0) - (flare && j > 0 ? 1 : 0); x <= x1 + (flare && j > 1 ? 1 : 0); x++) c.set(x, k.hipY + j, (j === rows - 1 || x === x1 + (flare && j > 1 ? 1 : 0)) ? shade : col); };
  bottom.skirt = { len: 'skirt', front(c, k){ skirtRows(c, k, 2, IX.BOT, IX.BOT2, true); } };
  bottom.longskirt = { len: 'skirt', front(c, k){ skirtRows(c, k, 4, IX.BOT, IX.BOT2, true); } };
  bottom.pleated = { len: 'skirt', front(c, k){ skirtRows(c, k, 3, IX.BOT, IX.BOT2, true); c.set(k.torso.x0 + 1, k.hipY + 1, IX.BOT2); } };
  // ---------- props: layer 'back' (behind the body, with over() on the front), 'front', or 'face' (see above); draw(c, k, look) ----------
  prop.backpack = { layer: 'back', draw(c, k){ const b = Math.round(Math.abs(lag(k))*.5); c.rect(k.torso.x0 - 2, k.shoulderY + 1 + b, 2, 4, IX.ACC); c.set(k.torso.x0 - 2, k.shoulderY + 1 + b, IX.LIT); c.set(k.torso.x0 - 1, k.shoulderY + 3 + b, IX.TOP2); },
    over(c, k){ c.set(k.torso.x0 + 1, k.shoulderY, IX.ACC); c.set(k.torso.x0 + 1, k.shoulderY + 1, IX.ACC); } };
  prop.bag = { layer: 'front', draw(c, k){ const sw = Math.round(lag(k)*.6); c.line(k.torso.x0 + 1, k.shoulderY, k.torso.x1, k.hipY - 1, IX.ACC); c.rect(k.torso.x1 - 1 + sw, k.hipY - 1, 3, 3, IX.ACC); c.set(k.torso.x1 + sw, k.hipY - 1, IX.LIT); c.rect(k.torso.x1 - 1 + sw, k.hipY + 1, 3, 1, IX.TOP2); } };
  prop.satchel = { layer: 'front', draw(c, k){ const sw = Math.round(lag(k)*.5); c.line(k.torso.x0 + 1, k.shoulderY, k.torso.x0 + 1 - 1, k.hipY, IX.ACC); c.rect(k.torso.x0 - 2 + sw, k.hipY - 1, 3, 3, IX.ACC); c.set(k.torso.x0 - 1 + sw, k.hipY, IX.TOP3); } };
  prop.box = { layer: 'front', draw(c, k){ const x = k.torso.x1 - 1, y = k.shoulderY + 1; c.rect(x, y, 4, 4, IX.ACC); c.rect(x + 1, y, 1, 4, IX.LIT); c.rect(x, y + 1, 4, 1, IX.TOP3); c.set(x + 3, y + 3, IX.WHITE); c.set(x + 3, y + 4, IX.SKIN); } };
  prop.briefcase = { layer: 'front', draw(c, k){ const x = k.nhx === undefined ? 6 : k.nhx, y = k.nhy + 1; c.rect(x - 1, y, 3, 2, IX.ACC); c.rect(x - 1, y - 1, 2, 1, IX.TOP2); c.set(x, y, IX.LIT); } };
  prop.cyberarm = { layer: 'front', draw(c, k){ if (k.nsx === undefined) return; c.line(k.nsx, k.nsy, k.nex, k.ney, IX.WHITE); c.line(k.nex, k.ney, k.nhx, k.nhy, IX.WHITE); c.set(k.nex, k.ney, IX.LIT); c.set(k.nhx, k.nhy, IX.LIT); c.set(k.nsx, k.nsy, IX.TOP3); } };
  prop.collar = { layer: 'front', draw(c, k){ c.rect(k.hx + 1, k.headTop + k.nod + 4, 3, 1, IX.LIT); } };
  prop.neonhem = { layer: 'front', draw(c, k){ c.rect(k.torso.x0, k.hipY - 1, k.bw, 1, IX.LIT); } };
  prop.neonlegs = { layer: 'front', draw(c, k){ if (k.kx !== undefined){ c.set(k.kx + 1, k.ky, IX.LIT); c.set(k.lcx + 1, k.lcy - 1, IX.LIT); } } };
  prop.cup = { layer: 'front', draw(c, k){ if (k.nhx === undefined) return; c.set(k.nhx + 1, k.nhy - 1, IX.WHITE); c.set(k.nhx + 1, k.nhy, IX.WHITE); c.set(k.nhx + 1, k.nhy - 2, IX.LIT); } };
  prop.scarf = { layer: 'front', draw(c, k){ const t = Math.round(lag(k)*.8), y = k.shoulderY; c.rect(k.hx + 1, y, 3, 1, IX.ACC); c.set(k.hx + 1, y + 1, IX.ACC); c.set(k.hx + t, y + 2, IX.ACC); c.set(k.hx + t, y + 3, IX.LIT); } };
  prop.toolbelt = { layer: 'front', draw(c, k){ c.rect(k.torso.x0, k.hipY - 1, k.bw, 1, IX.ACC); c.set(k.torso.x1 - 1, k.hipY, IX.ACC); c.set(k.torso.x1 - 1, k.hipY + 1, IX.TOP2); c.set(k.torso.x0 + 1, k.hipY - 1, IX.LIT); } };
})();
