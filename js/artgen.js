// Neon Terrarium: the rest of the art drawn in code (procedural art plan). The shop icon signs, the police badge, the wanted posters, the radio cassette, the delivery drone, the police bike, the koi,
// the hologram ads, the big hacked holograms and the wall holograms used to be pictures (AI-made, now gone from the game); they are drawn here, at load or the first time they are wanted, from fixed seeds.
// This file is the core: the registry, the textures (one place for the old/new switch), the plain size table, and, in artgen_tools.js, the bitmap fonts and the neon drawers. The assets register their
// drawing in artgen_*.js. Like spritegen.js it touches no game state, and the plot worker loads only this core: its textures are never painted there.
//
// A texture is made with ART.tex(name): the game's own texture, holding a canvas that the generator `name` drew (ART.reg). Sizes, uvs, shaders and geometry are those of the pictures this
// replaced. No generator may use Math.random or Date: a seed in, the same pixels out.
const ART = (() => {
  const A = { VERSION: 1, gens: {}, recs: [], later: [] };
  // sizes of everything this round draws (the textures' pixel sizes; the shaders, uvs and the builders only ever see these): a plain table, the same in the worker and on the page
  A.SIZE = {
    holo_ads: [384, 432], holo_pureair: [512, 384], holo_freeair: [512, 384], holo_aether: [512, 440], holo_sky: [512, 440], holo_synth: [512, 384], holo_watch: [512, 384],
    holo_walls: [544, 658], koi: [1000, 139], wanted: [576, 68], ddrone: [242, 19], cassette: [59, 44],
    // (the police bike's views, pbike_v0 ... pbike_v31, are sized by artgen_vox.js from the generated model)
  };
  // the sprite-atlas kinds drawn in code (sprites.js: SG.has decides): the 15 shop icons in 3 colors, and the police badge
  A.SHOPS = ['ramen', 'coffee', 'laundry', 'noodles', 'plant', 'repair', 'cocktail', 'music', 'arcade', 'clinic', 'books', 'hotel', 'records', 'bakery', 'games'];
  A.COLORS = ['pink', 'cyan', 'amber'];
  A.SIGNS = [].concat(...A.SHOPS.map(s => A.COLORS.map(c => 'sign_' + s + '_' + c)), ['sign_police']);
  // the wall holograms' atlas: the old one (2147 x 2618, the pictures' own) and the code-drawn one, a quarter of its size in each direction (each sign keeps its shape); x, y from the top, width, height.
  // The builders only use the old table (sign shapes and count), the shader the table of the art in use (see airFrag in buildings.js).
  A.WALL_OLD = { atlas: [2147, 2618], cells: [[0, 0, 431, 999], [433, 0, 351, 1254], [786, 0, 656, 1388], [1444, 0, 703, 1467], [0, 1469, 795, 1149]] };
  A.WALL_NEW = { atlas: [544, 658], cells: [[0, 0, 108, 250], [110, 0, 88, 314], [200, 0, 164, 347], [366, 0, 176, 367], [0, 369, 199, 287]] };
  A.wall = () => A.WALL_NEW;
  const inWorker = () => !!window.IN_RECIPE_WORKER;
  // ART.reg(name, fn): the generator of texture `name`: fn(g, w, h, ART) draws into the 2d context g of a w x h canvas (cleared first). opts.defer: drawn a moment after load (the big boards), not in the load itself
  A.reg = (name, fn, opts = {}) => { A.gens[name] = { fn, defer: !!opts.defer }; };
  A.has = name => !!A.gens[name];
  // the canvas of a generator, drawn once (and again after the generator version changes)
  const canvasOf = (rec) => {
    if (rec.cv) return rec.cv;
    const [w, h] = rec.size, cv = document.createElement('canvas'); cv.width = w; cv.height = h; rec.cv = cv; return cv;
  };
  const paint = (rec) => {
    const cv = canvasOf(rec), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    A.gens[rec.name].fn(g, cv.width, cv.height, A); rec.painted = true;
  };
  // the texture of `name`
  A.tex = (name, size) => {
    const rec = { name, size: size || A.SIZE[name], tex: null, cv: null, painted: false };
    A.recs.push(rec);
    if (inWorker()){ rec.tex = new THREE.Texture(); return rec.tex; }   // (the worker draws nothing)
    if (!A.gens[name]) throw new Error('artgen: no generator for ' + name);
    const cv = canvasOf(rec); rec.tex = new THREE.CanvasTexture(cv);
    if (A.gens[name].defer){ A.later.push(() => { paint(rec); rec.tex.needsUpdate = true; }); A.kick(); } else { paint(rec); rec.tex.needsUpdate = true; }
    return rec.tex;
  };
  // deferred drawing: one board a turn, so the load itself does not carry it
  let kicked = false;
  A.kick = () => { if (kicked) return; kicked = true; const step = () => { const f = A.later.shift(); if (f) f(); if (A.later.length) setTimeout(step, 4); else kicked = false; }; setTimeout(step, 30); };
  // the radio cassette: an <img> in index.html with no src; the drawn picture is set here
  A.cassette = () => {
    const el = document.querySelector && document.querySelector('.tape img'); if (!el) return;
    if (!A.cassetteURL){ const rec = { name: 'cassette', size: A.SIZE.cassette }; paint(rec); A.cassetteURL = rec.cv.toDataURL(); }
    el.src = A.cassetteURL;
  };
  document.addEventListener('DOMContentLoaded', () => A.cassette());
  return A;
})();
