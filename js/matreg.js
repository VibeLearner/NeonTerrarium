// Every material made while the game's scripts load, in the order they were made (round 9, item 2). The plot worker (recipeworker.js) loads the same scripts in the same
// order, so a material has the same place in the list in both; a geometry that comes back from it names its material by that place and the page looks it up here.
// (Not by three's own id: the page's renderer makes a couple of materials of its own first, which the worker's stand-in does not.) The registry closes when the
// last script that makes materials has loaded (recipe.js); a material made later is not in it, and a plot that uses one is made on the page as before.
const MATREG = { list: [], at: new Map(), open: true };
for (const n of Object.keys(THREE)){
  if (!/Material$/.test(n) || n === 'Material' || typeof THREE[n] !== 'function') continue;
  THREE[n] = new Proxy(THREE[n], { construct(t, a, nt){ const o = Reflect.construct(t, a, nt); if (MATREG.open){ MATREG.at.set(o, MATREG.list.length); MATREG.list.push(o); } return o; } });
}
