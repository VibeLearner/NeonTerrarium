// Neon Terrarium stage: writes js/stage_city.js, the city the film is built from, as plain data (every plot, floor, landmark and metro tile, each
// with the moment it appears and its own seed). Run once: `node tools/stage/make_city.js`. From then on js/stage_city.js IS the city: edit it by
// hand; running this again would overwrite those edits.
'use strict';
const fs = require('fs'), path = require('path');
function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
const R = 13, RW = 16, RX = 20, MT_J = 4;
const GARDEN = { i0: -2, i1: 1, j0: -2, j1: 1 };
const MEGAS = [['square', -15, 5, 5, 5, 3.2], ['police', -10, 5, 3, 3, 4.4], ['wirenest', -6, 9, 4, 4, 6.4], ['club', 4, 6, 4, 4, 5.4],
  ['lidar', 10, 9, 3, 3, 7.2], ['market', 2, -11, 4, 4, 4.8], ['foundry', 7, -12, 6, 4, 3.8]];
const LOW_NORTH = { i0: -18, i1: -9, j0: 10, j1: 13 }, LOW_FRONT = { i0: -20, i1: -3, j0: -12, j1: MT_J - 1 };
const inBox = (b, i, j) => i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1;
const megaAt = (i, j) => MEGAS.find(([, mi, mj, w, h]) => i >= mi && i < mi + w && j >= mj && j < mj + h);
// round the garden: low on the sides the two person-cam views look in from (east, north, west), the homes on its south side as tall as usual
const gardenLow = (i, j) => (i === GARDEN.i1 + 1 && j >= GARDEN.j0 - 1 && j <= GARDEN.j1 + 1) || (j === GARDEN.j1 + 1 && i >= GARDEN.i0 - 1 && i <= GARDEN.i1 + 1) || (i === GARDEN.i0 - 1 && j >= GARDEN.j0 && j <= GARDEN.j1 + 1);
function plotOf(i, j, Rnd){
  if (inBox(GARDEN, i, j)) return { kind: 'lawn' };
  const d = Math.max(Math.abs(i + .5), Math.abs(j + .5)), ring = d <= 3;
  let zone = i >= 0 ? (j >= 0 ? 'mid' : 'high') : (j >= 0 ? 'low' : 'ind');
  if (ring) zone = 'low'; else if (Rnd() < .18) zone = ['low', 'mid', 'low', 'ind', 'mid'][Math.floor(Rnd()*5)];
  if (gardenLow(i, j)) return { kind: 'bld', zone: 'low', n: 1, mf: 1 };
  if (j === MT_J) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: 2 };
  if (inBox(LOW_FRONT, i, j) || inBox(LOW_NORTH, i, j)) return { kind: 'bld', zone: zone === 'high' ? 'mid' : zone, n: 1, mf: Rnd() < .5 ? 1 : 2 };
  const edge = d > 10, core = (zone === 'mid' && d < 9) || (d < 6 && !ring), u = Rnd();
  let n = ring ? (u < .5 ? 2 : 3) : edge ? (u < .65 ? 1 : 2) : core ? (u < .25 ? 2 : u < .7 ? 3 : 4) : (u < .4 ? 1 : u < .8 ? 2 : 3);
  if (zone === 'high') n = Math.min(n, 3);
  return { kind: 'bld', zone, n };
}
const Rnd = mulberry32(2026), S = mulberry32(777001), seed = () => 1 + Math.floor(S()*999999998);
const all = [];
for (let i = -RX; i <= R; i++) for (let j = -RW; j <= R; j++){ if (megaAt(i, j)) continue; all.push(Object.assign({ i, j, d: Math.hypot(i + .5, j + .5) + Rnd()*1.6 }, plotOf(i, j, Rnd))); }
all.sort((a, b) => a.d - b.d);
const T0 = .35, T1 = 10.5, r3 = x => Math.round(x*1000)/1000;
all.forEach((b, k) => { b.t = T0 + (T1 - T0)*Math.pow(k/(all.length - 1), .78); });
const lawn = [], plots = [], floors = [];
for (const b of all){
  if (b.kind === 'lawn'){ lawn.push([b.i, b.j, r3(b.t)]); continue; }
  plots.push([b.i, b.j, b.zone, r3(b.t), seed(), b.mf || 0]);
  for (let q = 1; q < b.n; q++) floors.push([b.i, b.j, b.zone, r3(b.t + .32*q), seed(), 0]);
}
const megas = MEGAS.map(([k, i, j, w, h, t]) => [k, i, j, w, h, t, seed()]);
const tiles = []; for (let i = -RW; i <= R; i++) tiles.push([i, MT_J, r3(10.6 + (i + RW)*.09)]);
const metro = { tiles, finish: r3(10.6 + tiles.length*.09 + .7), seed: seed() };
const L = a => '[\n' + a.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]';
const out = `// Neon Terrarium stage: the city the film is built from, every piece of it, as data (js/stage.js builds it; nothing else is placed).
// Made once by tools/stage/make_city.js; from then on this file is the city: edit it by hand. Each entry appears at its time t (seconds into
// the film) with the game's build animation, made with its own seed, so changing one entry changes that piece and nothing else.
//   lawn:   [i, j, t]                        a plot of grass (the garden)
//   plots:  [i, j, zone, t, seed, floors]    a plot with its first building section (zone low | mid | high | ind; floors 0 = as the game likes)
//   floors: [i, j, zone, t, seed, floors]    a further section on top of that plot's building
//   megas:  [kind, i, j, w, h, t, seed]      a landmark on a block of w x h plots from (i, j)
//   metro:  the line's tiles [i, j, t] in order, when it is finished, and its seed
// Plot (i, j) stands at world x = i*LOT, z = j*LOT (LOT = 3.8).
'use strict';
const STAGE_CITY = {
  lawn: ${L(lawn)},
  plots: ${L(plots)},
  floors: ${L(floors)},
  megas: ${L(megas)},
  metro: { tiles: ${L(metro.tiles)}, finish: ${metro.finish}, seed: ${metro.seed} },
};
`;
fs.writeFileSync(path.join(__dirname, '../../js/stage_city.js'), out);
console.log('plots', plots.length, 'floors', floors.length, 'lawn', lawn.length, 'megas', megas.length, 'tiles', tiles.length);
