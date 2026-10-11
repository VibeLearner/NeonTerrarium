// Neon Terrarium: the rest of the art drawn in code (procedural art plan). The shop icon signs, the police badge, the wanted posters, the radio cassette, the delivery drone, the police bike, the koi,
// the hologram ads, the big hacked holograms and the wall holograms used to be pictures (AI-made, now gone from the game); they are drawn here, at load or the first time they are wanted, from fixed seeds.
// This file is the core: the registry, the textures (one place for the old/new switch), the plain size table, and, in artgen_tools.js, the bitmap fonts and the neon drawers. The assets register their
// drawing in artgen_*.js. Like spritegen.js it touches no game state, and the plot worker loads only this core: its textures are never painted there.
//
// A texture is made with ART.tex(name, path): the game's own texture, which holds a canvas that the generator `name` drew (ART.reg) or, when there is none or the old art is asked for
// (window.__OLD_ART, the overlay test "old art (as before)"), the picture at `path` as it was loaded before. Flipping the test swaps the image in every texture and the cassette; nothing else changes
// (sizes, uvs, shaders, geometry are the pictures' own). No generator may use Math.random or Date: a seed in, the same pixels out.
const ART = (() => {
  const A = { VERSION: 1, gens: {}, recs: [], later: [] };
  // sizes of everything this round draws (the textures' pixel sizes; the shaders, uvs and the builders only ever see these): a plain table, the same in the worker and on the page
  A.SIZE = {
    holo_ads: [384, 432], holo_pureair: [512, 384], holo_freeair: [512, 384], holo_aether: [512, 440], holo_sky: [512, 440], holo_synth: [512, 384], holo_watch: [512, 384],
    holo_walls: [544, 658], koi: [1000, 139], wanted: [576, 68], ddrone: [242, 19], cassette: [59, 44],
    pbike_r1c1: [14, 17], pbike_r1c2: [24, 17], pbike_r1c3: [26, 16], pbike_r1c4: [23, 18], pbike_r2c1: [14, 18], pbike_r2c2: [19, 18], pbike_r2c3: [26, 16], pbike_r2c4: [24, 18],
  };
  // the sprite-atlas kinds drawn in code (sprites.js: SG.has decides, unless the old art is asked for): the 15 shop icons in 3 colors, and the police badge
  A.SHOPS = ['ramen', 'coffee', 'laundry', 'noodles', 'plant', 'repair', 'cocktail', 'music', 'arcade', 'clinic', 'books', 'hotel', 'records', 'bakery', 'games'];
  A.COLORS = ['pink', 'cyan', 'amber'];
  A.SIGNS = [].concat(...A.SHOPS.map(s => A.COLORS.map(c => 'sign_' + s + '_' + c)), ['sign_police']);
  // the wall holograms' atlas: the old one (2147 x 2618, the pictures' own) and the code-drawn one, a quarter of its size in each direction (each sign keeps its shape); x, y from the top, width, height.
  // The builders only use the old table (sign shapes and count), the shader the table of the art in use (see airFrag in buildings.js).
  A.WALL_OLD = { atlas: [2147, 2618], cells: [[0, 0, 431, 999], [433, 0, 351, 1254], [786, 0, 656, 1388], [1444, 0, 703, 1467], [0, 1469, 795, 1149]] };
  A.WALL_NEW = { atlas: [544, 658], cells: [[0, 0, 108, 250], [110, 0, 88, 314], [200, 0, 164, 347], [366, 0, 176, 367], [0, 369, 199, 287]] };
  A.wall = () => (A.gens.holo_walls && !A.old()) ? A.WALL_NEW : A.WALL_OLD;
  A.onFlip = [];
  const isSign = {}; for (const k of A.SIGNS) isSign[k] = true;
  A.isArtKind = k => !!isSign[k];
  A.old = () => !!window.__OLD_ART;
  const inWorker = () => !!window.IN_RECIPE_WORKER;
  // ART.reg(name, fn): the generator of texture `name`: fn(g, w, h, ART) draws into the 2d context g of a w x h canvas (cleared first). opts.defer: drawn a moment after load (the big boards), not in the load itself
  A.reg = (name, fn, opts = {}) => { A.gens[name] = { fn, defer: !!opts.defer }; };
  A.has = name => !!A.gens[name];
  const newArt = name => A.gens[name] && !A.old();
  // the canvas of a generator, drawn once (and again after the generator version changes)
  const canvasOf = (rec) => {
    if (rec.cv) return rec.cv;
    const [w, h] = rec.size, cv = document.createElement('canvas'); cv.width = w; cv.height = h; rec.cv = cv; return cv;
  };
  const paint = (rec) => {
    const cv = canvasOf(rec), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    A.gens[rec.name].fn(g, cv.width, cv.height, A); rec.painted = true;
  };
  const loadOld = (rec) => {   // the picture, as it was loaded before: a THREE.Texture whose image is the loaded file
    if (rec.img){ if (rec.imgReady){ rec.tex.image = rec.img; rec.tex.needsUpdate = true; } return; }
    const img = new Image(); rec.img = img; img.onload = () => { rec.imgReady = true; if (!newArt(rec.name)){ rec.tex.image = img; rec.tex.needsUpdate = true; } }; img.src = rec.path;
  };
  // the texture of `name`: path is the old picture (kept in the repo until the owner approves the new art)
  A.tex = (name, path, size) => {
    const rec = { name, path, size: size || A.SIZE[name], tex: null, cv: null, img: null, painted: false };
    A.recs.push(rec);
    if (inWorker()){ rec.tex = new THREE.Texture(); return rec.tex; }   // (the worker draws nothing and loads nothing)
    if (newArt(name)){
      const cv = canvasOf(rec); rec.tex = new THREE.CanvasTexture(cv);
      if (A.gens[name].defer){ A.later.push(() => { paint(rec); rec.tex.needsUpdate = true; }); A.kick(); } else { paint(rec); rec.tex.needsUpdate = true; }
    } else { rec.tex = new THREE.TextureLoader().load(path); }
    return rec.tex;
  };
  // deferred drawing: one board a turn, so the load itself does not carry it
  let kicked = false;
  A.kick = () => { if (kicked) return; kicked = true; const step = () => { const f = A.later.shift(); if (f) f(); if (A.later.length) setTimeout(step, 4); else kicked = false; }; setTimeout(step, 30); };
  // flip every texture (and the cassette) to the code-drawn or the old picture, after window.__OLD_ART changed
  A.repaintAll = () => {
    for (const rec of A.recs){
      if (inWorker()) break;
      if (newArt(rec.name)){ if (!rec.painted) paint(rec); rec.tex.image = canvasOf(rec); rec.tex.needsUpdate = true; } else loadOld(rec);
    }
    A.cassette(); for (const f of A.onFlip) f();
  };
  // the radio cassette: an <img> in index.html (no src there: the picture is set here, so the old file is fetched only when the old art is asked for)
  A.cassette = () => {
    const el = document.querySelector && document.querySelector('.tape img'); if (!el) return;
    if (newArt('cassette')){ const rec = { name: 'cassette', size: A.SIZE.cassette }; if (!A.cassetteURL){ paint(rec); A.cassetteURL = rec.cv.toDataURL(); } el.src = A.cassetteURL; }
    else el.src = 'assets/ui/cassette.png';
  };
  document.addEventListener('DOMContentLoaded', () => A.cassette());
  return A;
})();
