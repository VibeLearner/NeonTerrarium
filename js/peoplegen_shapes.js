// Neon Terrarium: the citizen shapes (looks) of the character generator (peoplegen.js): about 50 distinct combinations of body, hair, hat, top, bottom, shoes and props, each added with PG.addShape and
// listed in PG.citizens (the shapes a resident can have), then the district's lean in colour (PG.zoneLean). Loads after peoplegen_parts.js (the parts) and before peoplegen_roles.js (which adds the
// roles' own shapes and the emote row after these: the sheet holds at most 62 rows, so at most 55 citizen shapes). A look is a fixed table; the picker (PG.lookFor) uses hashes, never Math.random.
//
// Every shape has `w: ctx => weight` (ctx = { zone, jobZone, courier }): a district weight [low, mid, high, ind] (a resident of that zone), `job: 'ind'` for the work looks that anyone who works in an
// industrial zone leans to (x3), and `courier` for the looks that only couriers wear (and that couriers wear exclusively). zone and jobZone are 'low' (residential), 'mid' (commercial), 'high'
// (luxury) or 'ind' (industrial), or undefined. Dress for the life: overalls, hi-vis and caps in industry, coats and clean looks in luxury, hoodies and patched layers in the low zone.
(() => {
  const ZI = { low: 0, mid: 1, high: 2, ind: 3 };
  // a shape: name, body [H, bw], hair, hat, top, bottom, props, options { z: [low, mid, high, ind] weights, job, courier, shoes, room }
  const S = (name, H, bw, hair, hat, top, bottom, props, o) => {
    o = o || {};
    const z = o.z || [1, 1, 1, 1], job = o.job || null, courier = !!o.courier;
    const w = ctx => {
      if (!!ctx.courier !== courier) return 0;             // couriers wear only courier looks, and nobody else wears them
      if (courier) return z[0];                            // (every courier look is equally likely)
      const zi = ZI[ctx.zone], base = zi === undefined ? (z[0] + z[1] + z[2] + z[3])/4 : z[zi];
      const jz = ctx.jobZone;
      return base*(jz === 'ind' ? (job === 'ind' ? 3 : .7) : jz === 'high' && job === 'ind' ? .5 : 1);
    };
    const i = PG.addShape({ name, body: { H, bw }, hair, hat, top, bottom, props: props || [], shoes: o.shoes || 'shoe', w, tags: { z, job, courier } });
    PG.citizens.push(i); return i;
  };
  // ---------- everyday, commercial and mixed ----------
  S('tee short',        14, 4, 'short',   null,      'tee',      'trousers', [],                       { z: [1.2, 1.4, .8, 1], shoes: 'sneaker' });
  S('graphic buzz',     14, 5, 'buzz',    null,      'graphic',  'cargo',    [],                       { z: [1.2, 1.2, .5, 1.2], shoes: 'boot' });
  S('stripe afro',      14, 4, 'afro',    null,      'stripe',   'trousers', [],                       { z: [1, 1.4, 1, .8], shoes: 'sneaker' });
  S('headphones shorts',13, 4, 'curly',   null,      'tee',      'shorts',   ['headphones'],           { z: [1.3, 1.3, .6, .6], shoes: 'sneaker' });
  S('tank spiky',       13, 3, 'spiky',   null,      'tank',     'shorts',   [],                       { z: [1.2, 1.2, .8, .6], shoes: 'sneaker' });
  S('sweater beard',    14, 5, 'short',   'beanieT', 'sweater',  'trousers', ['beard'],                { z: [1, 1.3, 1, 1] });
  S('jacket undercut',  14, 4, 'undercut',null,      'jacket',   'trousers', [],                       { z: [1, 1.5, 1, .8], shoes: 'boot' });
  S('bomber slick',     15, 4, 'slick',   null,      'bomber',   'trousers', [],                       { z: [.8, 1.3, 1.2, .8], shoes: 'sneaker' });
  S('mask commuter',    14, 4, 'short',   null,      'jacket',   'trousers', ['mask', 'bag'],          { z: [1, 1.4, 1, 1] });
  S('briefcase',        15, 4, 'slick',   null,      'jacket',   'trousers', ['briefcase', 'shades'],  { z: [.3, 1.5, 1.4, .2] });
  S('office cup',       14, 3, 'bob',     null,      'sweater',  'trousers', ['cup'],                  { z: [.6, 1.5, 1.2, .4] });
  S('apron keeper',     13, 5, 'balding', null,      'apron',    'trousers', ['stache'],               { z: [1, 1.7, .5, .8] });
  S('elder coat',       12, 4, 'balding', null,      'coat',     'trousers', ['beard'],                { z: [1.2, 1, .8, .6] });
  S('kid backpack',     12, 3, 'short',   'beanie',  'hoodie',   'shorts',   ['backpack'],             { z: [1.4, 1.2, .5, .4], shoes: 'sneaker' });
  S('artist beret',     14, 3, 'long',    'beret',   'sweater',  'patched',  ['satchel'],              { z: [1, 1.5, 1, .3] });
  S('joggers headband', 14, 3, 'ponytail','bandana', 'tank',     'joggers',  ['neonlegs'],             { z: [1, 1.5, .8, .4], shoes: 'sneaker' });
  // ---------- low zone: hoodies, patched layers, masks and goggles ----------
  S('hoodie up',        13, 4, 'short',   'hood',    'hoodie',   'joggers',  [],                       { z: [1.8, 1, .3, 1], shoes: 'sneaker' });
  S('hoodie beanie',    14, 3, 'curly',   'beanie',  'hoodie',   'trousers', ['backpack'],             { z: [1.7, 1, .4, .8] });
  S('hoodie long hair', 13, 4, 'long',    null,      'hoodie',   'patched',  ['headphones'],           { z: [1.7, 1, .4, .8], shoes: 'sneaker' });
  S('respirator hood',  14, 4, 'short',   'hood',    'hoodie',   'cargo',    ['respirator'],           { z: [1.5, .8, .2, 1.3], shoes: 'boot' });
  S('goggles punk',     14, 4, 'spiky',   null,      'jacket',   'patched',  ['goggles'],              { z: [1.6, .9, .1, .7], shoes: 'boot' });
  S('mohawk cyberarm',  14, 4, 'mohawk',  null,      'vest',     'shorts',   ['cyberarm'],             { z: [1.6, .8, .1, .6], shoes: 'boot' });
  S('tank cyber',       14, 5, 'bald',    null,      'tank',     'cargo',    ['cyberarm', 'cybereye'], { z: [1.3, .8, .2, 1], shoes: 'boot' });
  S('cap graphic',      14, 5, 'short',   'capT',    'graphic',  'shorts',   [],                       { z: [1.5, 1, .4, 1], shoes: 'sneaker' });
  S('bucket raincoat',  14, 4, 'short',   'bucket',  'raincoat', 'trousers', [],                       { z: [1.3, 1.2, .8, 1], shoes: 'boot' });
  S('hood raincoat',    13, 3, 'short',   'hood',    'raincoat', 'trousers', ['mask'],                 { z: [1.2, 1.3, .8, 1.2], shoes: 'boot' });
  // ---------- industrial: overalls, hi-vis, hard hats, tool belts ----------
  S('overalls cap',     14, 5, 'buzz',    'capT',    'overalls', 'trousers', [],                       { z: [.7, .6, .1, 2], job: 'ind', shoes: 'boot' });
  S('overalls hardhat', 15, 5, 'bald',    'hardhat', 'overalls', 'trousers', ['toolbelt'],             { z: [.4, .4, .05, 2], job: 'ind', shoes: 'boot' });
  S('hivis hardhat',    14, 4, 'short',   'hardhat', 'hivis',    'cargo',    [],                       { z: [.4, .4, .05, 2], job: 'ind', shoes: 'boot' });
  S('hivis respirator', 13, 5, 'short',   'beanieT', 'hivis',    'trousers', ['respirator'],           { z: [.5, .4, .05, 1.8], job: 'ind', shoes: 'boot' });
  S('welder',           14, 4, 'short',   'bandana', 'vest',     'cargo',    ['goggles'],              { z: [.6, .5, .05, 1.8], job: 'ind', shoes: 'boot' });
  S('worker cap vest',  14, 4, 'short',   'capT',    'vest',     'trousers', ['toolbelt'],             { z: [.6, .6, .1, 1.8], job: 'ind', shoes: 'boot' });
  S('worker jacket',    14, 5, 'balding', 'cap',     'jacket',   'cargo',    ['beard'],                { z: [.7, .6, .1, 1.6], job: 'ind', shoes: 'boot' });
  S('worker apron',     14, 3, 'ponytail','bandana', 'apron',    'cargo',    ['goggles'],              { z: [.5, .6, .1, 1.5], job: 'ind', shoes: 'boot' });
  // ---------- luxury: coats, trench, dresses, clean lines ----------
  S('coat long hair',   14, 3, 'long',    null,      'coat',     'trousers', [],                       { z: [.4, 1, 1.8, .2], shoes: 'boot' });
  S('trench fedora',    15, 4, 'short',   'fedora',  'trench',   'trousers', [],                       { z: [.4, 1, 1.6, .3] });
  S('trench shades',    14, 3, 'balding', null,      'trench',   'trousers', ['shades'],               { z: [.5, 1.1, 1.6, .3], shoes: 'boot' });
  S('dress ponytail',   13, 3, 'ponytail',null,      'dress',    'bare',     [],                       { z: [.8, 1.3, 1.4, .3], shoes: 'sneaker' });
  S('dress bob bag',    14, 3, 'bob',     null,      'dress',    'bare',     ['bag'],                  { z: [.5, 1.2, 1.8, .2], shoes: 'boot' });
  S('afro dress scarf', 14, 3, 'afro',    null,      'dress',    'bare',     ['scarf'],                { z: [.6, 1.1, 1.5, .2] });
  S('skirt bun satchel',13, 3, 'bun',     null,      'tee',      'skirt',    ['satchel'],              { z: [1, 1.4, 1, .4], shoes: 'sneaker' });
  S('pleated sweater',  14, 3, 'long',    null,      'sweater',  'pleated',  [],                       { z: [.7, 1.3, 1.4, .3], shoes: 'boot' });
  S('longskirt headwrap',14, 4, null,     'headwrap','sweater',  'longskirt',[],                       { z: [1, 1.2, 1.1, .4] });
  S('scarf coat',       14, 4, 'curly',   null,      'coat',     'trousers', ['scarf'],                { z: [.4, 1, 1.7, .3], shoes: 'boot' });
  S('headwrap coat',    14, 4, null,      'headwrap','coat',     'trousers', [],                       { z: [.5, 1, 1.5, .3] });
  S('neon trim coat',   15, 4, 'undercut',null,      'coat',     'trousers', ['neonhem', 'shades'],    { z: [.2, .7, 2, .1], shoes: 'boot' });
  S('neon collar slim', 15, 3, 'slick',   null,      'jacket',   'trousers', ['collar', 'cybereye'],   { z: [.2, .7, 1.6, .1] });
  S('briefcase trench', 14, 5, 'balding', null,      'trench',   'trousers', ['briefcase'],            { z: [.3, 1.2, 1.5, .4] });
  // ---------- couriers (only couriers wear these, all equally likely): a cap, a bag or box, a bright accent ----------
  S('courier backpack', 14, 4, 'short',   'capL',    'jacket',   'cargo',    ['backpack'],             { courier: true, shoes: 'sneaker' });
  S('courier box',      13, 4, 'short',   'capL',    'hoodie',   'joggers',  ['box'],                  { courier: true, shoes: 'sneaker' });
  S('courier bag',      14, 3, 'ponytail','capT',    'tee',      'shorts',   ['bag'],                  { courier: true, shoes: 'sneaker' });
  S('courier hivis',    14, 5, 'buzz',    'capT',    'hivis',    'cargo',    ['backpack', 'shades'],   { courier: true, shoes: 'boot' });
  S('courier raincoat', 14, 4, 'short',   'bucket',  'raincoat', 'trousers', ['satchel'],              { courier: true, shoes: 'boot' });

  // ---------- each district's lean in colour: weights per ramp (skin 5, hair 8, top 8, acc 4, bot 3); a key may be omitted ----------
  // hair: black, dark brown, brown, blond, ginger, grey, teal, pink. top: slate, navy, olive, mustard, rust, teal, cream, wine. acc: pink, cyan, orange, green. bot: blue, black, khaki.
  const LEAN = {
    low:  { hair: [1.2, 1, 1, .7, .7, .8, 1.3, 1.3], top: [1.3, 1, 1, .8, 1.2, .8, .5, .8], acc: [1.2, 1.2, 1, 1], bot: [1.2, .6, .9] },
    mid:  { hair: [1.1, 1, 1, .9, .7, .8, .5, .6],   top: [1, 1, 1, 1, 1, 1, 1, 1],         acc: [1, 1, 1, 1],     bot: [1.2, .6, 1] },
    high: { hair: [1.3, 1.2, 1.2, 1, .7, 1.3, .15, .2], top: [1.2, 1.3, .3, .4, .3, .7, 1.5, 1.3], acc: [.6, 1.4, .5, .3], bot: [1.1, .8, .8] },
    ind:  { hair: [1.3, 1.2, 1.1, .7, .9, 1, .1, .1], top: [.8, .7, 1.6, 1.5, 1.4, .3, .3, .2], acc: [.3, .3, 1.6, 1.2], bot: [.6, .5, 1.6] }
  };
  // a courier wears the bright side of the district; the home zone (or the work zone for people who work in industry) sets the lean
  PG.zoneLean = ctx => { ctx = ctx || {}; const z = ctx.jobZone === 'ind' ? 'ind' : ctx.zone; const L = LEAN[z] || null;
    if (!L) return {};
    if (ctx.courier) return { hair: L.hair, top: L.top, acc: [1.2, 1.2, 1.2, 1.2], bot: L.bot };
    return L; };
})();
