// Neon Terrarium: the looks system. Ten looks (each one plain numbers and colors, so they blend, save and edit), the blending
// that follows the time of day and the weather ("Auto"), the weather states, and the hand-off to the sky, light and grade code
// in sky.js. The look editor and the player's menu are in lookui.js.
// All game scripts share one scope and load in order (see index.html). This file is wrapped so only LK and four hooks are global.
'use strict';
(() => {
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = x => { x = clamp01(x); return x*x*(3 - 2*x); };
const hex3 = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255)/255, (n >> 8 & 255)/255, (n & 255)/255]; };
const to2 = x => { const n = Math.round(clamp01(x)*255); return (n < 16 ? '0' : '') + n.toString(16); };
const hexOf = c => '#' + to2(c[0]) + to2(c[1]) + to2(c[2]);
// colors are mixed in linear light (sRGB decoded, mixed, encoded again): two skies half way between don't go muddy
const dec = x => x <= .04045 ? x/12.92 : Math.pow((x + .055)/1.055, 2.4);
const enc = x => x <= .0031308 ? x*12.92 : 1.055*Math.pow(x, 1/2.4) - .055;
const lum3 = c => .299*c[0] + .587*c[1] + .114*c[2];

/* ---------- the knobs ---------- */
// [key, group, label, kind (c color, n number), min, max, step, hint]
const PARAMS = [
  ['skyTop', 'Sky', 'Sky, top', 'c', 0, 0, 0, 'the top of the screen'],
  ['skyHor', 'Sky', 'Sky, horizon', 'c', 0, 0, 0, 'the middle band: where the sky meets the city'],
  ['skyBot', 'Sky', 'Sky, bottom', 'c', 0, 0, 0, 'the lowest band, behind the island'],
  ['cloud', 'Sky', 'Cloud color', 'c', 0, 0, 0, 'the color the clouds lean toward'],
  ['cover', 'Sky', 'Cloud cover', 'n', 0, 1, .01, '.5 is the way it always was'],
  ['stars', 'Sky', 'Stars', 'n', 0, 1, .01, 'how many show'],
  ['sun', 'Light', 'Sun color', 'c', 0, 0, 0, ''],
  ['sunI', 'Light', 'Sun strength', 'n', 0, 2, .01, 'shadows get harder with it'],
  ['hemiSky', 'Light', 'Sky light color', 'c', 0, 0, 0, 'the light that comes from the sky, on tops of things'],
  ['hemiGnd', 'Light', 'Ground bounce color', 'c', 0, 0, 0, 'the light that bounces up from the ground'],
  ['hemiI', 'Light', 'Sky and bounce strength', 'n', 0, 1.5, .01, 'how bright the shade is'],
  ['rim', 'Light', 'Rim light color', 'c', 0, 0, 0, 'the line of light along edges that face the sun'],
  ['rimI', 'Light', 'Rim light strength', 'n', 0, 2, .01, ''],
  ['night', 'Light', 'Lights on', 'n', 0, 1, .01, 'how far into the evening: windows, signs, glow, stars'],
  ['win', 'Light', 'Window brightness', 'n', 0, 3, .01, ''],
  ['neon', 'Light', 'Neon brightness', 'n', 0, 3, .01, ''],
  ['bulb', 'Light', 'Bulb brightness', 'n', 0, 3, .01, ''],
  ['trim', 'Light', 'Trim brightness', 'n', 0, 3, .01, 'light strips'],
  ['haze', 'Air', 'Haze color', 'c', 0, 0, 0, 'distant blocks fade toward it'],
  ['hazeAmt', 'Air', 'Haze amount', 'n', 0, 1, .01, ''],
  ['mist', 'Air', 'Mist color', 'c', 0, 0, 0, 'the tint of steam and ground mist'],
  ['mistAmt', 'Air', 'Mist amount', 'n', 0, 2, .01, ''],
  ['shafts', 'Air', 'Light shafts', 'n', 0, 2, .01, 'sunbeams through the haze'],
  ['wet', 'Wet', 'Wetness', 'n', 0, 1, .01, 'reflections on the ground'],
  ['sparkle', 'Wet', 'Sparkle', 'n', 0, 2, .01, 'glints on wet ground and roofs'],
  ['shadowTint', 'Grade', 'Shadow tint', 'c', 0, 0, 0, 'the color the darks lean toward'],
  ['shadowAmt', 'Grade', 'Shadow tint amount', 'n', 0, .5, .005, ''],
  ['midTint', 'Grade', 'Midtone tint', 'c', 0, 0, 0, ''],
  ['midAmt', 'Grade', 'Midtone tint amount', 'n', 0, 1, .01, ''],
  ['hiTint', 'Grade', 'Highlight tint', 'c', 0, 0, 0, 'the color the lights lean toward'],
  ['hiAmt', 'Grade', 'Highlight tint amount', 'n', 0, 1, .01, ''],
  ['sat', 'Grade', 'Saturation', 'n', 0, 2, .01, ''],
  ['con', 'Grade', 'Contrast', 'n', .5, 1.5, .01, ''],
  ['palBlend', 'Grade', 'Palette blend', 'n', 0, 1, .01, 'the 8 palette colors laid over the picture, dark to light'],
  ['grain', 'Lens and film', 'Film grain', 'n', 0, 1, .01, ''],
  ['grainSize', 'Lens and film', 'Grain size', 'n', 1, 4, 1, 'in pixels'],
  ['fringe', 'Lens and film', 'Color fringing', 'n', 0, 5, .05, 'red and blue slide apart toward the edges'],
  ['flare', 'Lens and film', 'Lens flare and glare', 'n', 0, 2, .01, ''],
  ['vignette', 'Lens and film', 'Vignette', 'n', 0, 1, .01, ''],
  ['bloomK', 'Lens and film', 'Bloom strength', 'n', 0, 3, .01, ''],
  ['bloomTh', 'Lens and film', 'Bloom threshold', 'n', .4, 1.6, .01, 'higher: only the brightest things glow'],
  ['halation', 'Lens and film', 'Halation', 'n', 0, 3, .01, 'the soft red fringe round bright lights'],
];
const PKEY = PARAMS.map(p => p[0]), PDEF = {}; for (const p of PARAMS) PDEF[p[0]] = p;

// What every look starts from: the picture at midday as it was before the looks (sampled from KEYS and GRADES in sky.js).
const BASE = {
  skyTop: '#7fa4f2', skyHor: '#a0bbf5', skyBot: '#c0d2f8', cloud: '#ffffff', cover: .5, stars: 0,
  sun: '#fff6e6', sunI: 1.1, hemiSky: '#c4dcf0', hemiGnd: '#8a7a66', hemiI: .62, rim: '#ffb361', rimI: .25, night: 0, win: .22, neon: .6, bulb: .3, trim: .45,
  haze: '#c0d2f8', hazeAmt: .35, mist: '#ffffff', mistAmt: .55, shafts: 1, wet: .3, sparkle: 0,
  shadowTint: '#1a3a66', shadowAmt: .05, midTint: '#ffffff', midAmt: 0, hiTint: '#fff8e8', hiAmt: .7, sat: 1.06, con: 1.03, palBlend: 0,
  grain: 0, grainSize: 1, fringe: 0, flare: 0, vignette: 0, bloomK: 1, bloomTh: 1, halation: 1,
};

// The ten looks. Sky, light and grade values start from the keyframe nearest the look's hours in sky.js, then lean toward the
// palette: sky and haze from its light and mid colors, the shadow tint from the darkest, the highlight tint from the lightest warm one.
// The night looks keep a deep palette for sky and shadows and leave the neon itself bright and saturated.
const DEFS = [
  { id: 'morning', name: 'Morning', note: 'Hazy light, grain, dreamy color fringing, soft lens flare. Cream, teal and orange retro.',
    pal: ['#262E26', '#B4501E', '#4F9C96', '#5E8FD0', '#E8B060', '#E9A08A', '#E6A9CF', '#F2E4C8'],
    o: { skyTop: '#6e9ae0', skyHor: '#e6c8bf', skyBot: '#f4dcc2', cloud: '#fff0e0', cover: .5, sun: '#ffd9b0', sunI: .95, hemiSky: '#b4cce4', hemiGnd: '#7a6a5a', hemiI: .6, rim: '#ffb890', rimI: .5, night: .12, win: .35, neon: .62, bulb: .4, trim: .5,
      haze: '#f0d6c4', hazeAmt: .55, mist: '#ffe8d4', mistAmt: .8, shafts: 1.4, wet: .3,
      shadowTint: '#262E26', shadowAmt: 0.07, midTint: '#4F9C96', midAmt: 0.3, hiTint: '#F2E4C8', hiAmt: 0.85, sat: 1.12, con: 1.04, palBlend: 0.14,
      grain: 0.3, grainSize: 1, fringe: 1.5, flare: .7, vignette: .22, bloomK: 1.25, bloomTh: .95, halation: 1.3 } },
  { id: 'rainyMorning', name: 'Rainy morning', note: 'The water-sparkle look. Wet streets glinting, bright and fresh, green-tinted film shadows.',
    pal: ['#393027', '#4F5340', '#865134', '#6A7058', '#918B73', '#7DA4AA', '#B3AB92', '#DED7C4'],
    o: { skyTop: '#8aa9ae', skyHor: '#b8c8c0', skyBot: '#d8dccb', cloud: '#d4dcd4', cover: .85, sun: '#f2e8cc', sunI: .62, hemiSky: '#b4c9c6', hemiGnd: '#6f705a', hemiI: .68, rim: '#f2e0b8', rimI: .1, night: .2, win: .42, neon: .78, bulb: .5, trim: .55,
      haze: '#c9d3c4', hazeAmt: .5, mist: '#e0e8d8', mistAmt: 1, shafts: .5, wet: .85, sparkle: 0.8,
      shadowTint: '#3a4a30', shadowAmt: .1, midTint: '#9ab59a', midAmt: 0.4, hiTint: '#f4efd8', hiAmt: .6, sat: .98, con: 1, palBlend: 0.14,
      grain: 0.25, grainSize: 1, fringe: 0.9, flare: .18, vignette: .22, bloomK: 1.2, bloomTh: .95, halation: 1.1 } },
  { id: 'afternoon', name: 'Mid afternoon', note: 'The clean postcard look, a bit punchier. Clear and saturated, 70s retro postcard.',
    pal: ['#18120E', '#433B2C', '#50676F', '#746240', '#5E95AF', '#8E948B', '#D29A53', '#D8DCD0'],
    o: { skyTop: '#6c9cf0', skyHor: '#9dbef2', skyBot: '#c6d8f6', cloud: '#ffffff', cover: .5, sun: '#fff0d4', sunI: 1.15, hemiSky: '#c4dcf0', hemiGnd: '#8a7a66', hemiI: .62, rim: '#ffc27a', rimI: .3, night: 0,
      haze: '#c6d8f6', hazeAmt: .3, mist: '#ffffff', mistAmt: .45, shafts: 1, wet: .3,
      shadowTint: '#1a3d4a', shadowAmt: .055, midTint: '#E8A860', midAmt: 0.25, hiTint: '#fff4e0', hiAmt: .75, sat: 1.2, con: 1.07, palBlend: 0.12,
      grain: 0.1, grainSize: 1, fringe: 0, flare: .3, vignette: .12, bloomK: 1, bloomTh: 1, halation: 1 } },
  { id: 'rainyAfternoon', name: 'Rainy afternoon', note: 'Warm, cozy, golden rain rather than gray rain. Golden light, deep greens, amber city.',
    pal: ['#34322D', '#2D4544', '#514531', '#745839', '#556A5F', '#967A4C', '#C47A45', '#D2C496'],
    o: { skyTop: '#62786f', skyHor: '#9fa688', skyBot: '#cbba8c', cloud: '#bdb48c', cover: .9, sun: '#f0c27a', sunI: .78, hemiSky: '#9fb4a4', hemiGnd: '#6a5a3a', hemiI: .62, rim: '#ffb060', rimI: .18, night: .3, win: .6, neon: .9, bulb: .8, trim: .7,
      haze: '#c9b27a', hazeAmt: .5, mist: '#e8cf98', mistAmt: 1, shafts: .6, wet: .85, sparkle: .4,
      shadowTint: '#1f3a38', shadowAmt: .1, midTint: '#C47A45', midAmt: 0.4, hiTint: '#f0d9a0', hiAmt: .8, sat: 0.95, con: 1.04, palBlend: 0.14,
      grain: 0.22, grainSize: 1, fringe: .8, flare: .15, vignette: .3, bloomK: 1.3, bloomTh: .9, halation: 1.3 } },
  { id: 'overcast', name: 'Overcast', note: 'Cooler and softer-shadowed, the neon reading stronger: a mood, not a dimmer.',
    pal: ['#12161F', '#2A3345', '#4A5A73', '#6F8099', '#93A3B8', '#B4C0CF', '#D3DAE4', '#EEF2F7'],
    o: { skyTop: '#8a98ad', skyHor: '#a8b3c2', skyBot: '#c3cbd6', cloud: '#c8cfd9', cover: .9, sun: '#e8eef8', sunI: .45, hemiSky: '#aab8cc', hemiGnd: '#6f7480', hemiI: .78, rim: '#cfd8e8', rimI: .05, night: .36, win: .7, neon: 1, bulb: .8, trim: .8,
      haze: '#b8c2d0', hazeAmt: .5, mist: '#cfd8e4', mistAmt: .8, shafts: .1, wet: .35,
      shadowTint: '#2a3f5c', shadowAmt: .08, midTint: '#9fb0cc', midAmt: 0.3, hiTint: '#e8f0ff', hiAmt: .5, sat: .92, con: 1, palBlend: .12,
      grain: 0.15, grainSize: 1, fringe: .4, flare: 0, vignette: .3, bloomK: 1.35, bloomTh: .9, halation: 1.1 } },
  { id: 'golden', name: 'Past golden hour', note: 'Just after golden hour, warm and dusty, long shadows. Amber dust sliding toward navy and coral.',
    pal: ['#2A1211', '#282839', '#692409', '#9A3708', '#6F4F5A', '#CA6010', '#EC8D30', '#EED1AD'],
    o: { skyTop: '#5c6aa8', skyHor: '#d58a78', skyBot: '#e8a478', cloud: '#f0b890', cover: .55, sun: '#ffb468', sunI: .98, hemiSky: '#b8979a', hemiGnd: '#5a3a30', hemiI: .52, rim: '#ff9b40', rimI: 0.8, night: .3, win: .55, neon: .85, bulb: .65, trim: .6,
      haze: '#d9906a', hazeAmt: 0.45, mist: '#e8b078', mistAmt: .9, shafts: 1.3, wet: .3,
      shadowTint: '#2a1d46', shadowAmt: 0.16, midTint: '#CA6010', midAmt: 0.3, hiTint: '#ffcf8a', hiAmt: 0.6, sat: 1.08, con: 1.08, palBlend: 0.12,
      grain: 0.2, grainSize: 1, fringe: 0.5, flare: .6, vignette: .3, bloomK: 1.05, bloomTh: .95, halation: 1.3 } },
  { id: 'dusk', name: 'Dusk', note: 'The hand-off from amber to noir: purple-pink skies, blue shadows, soft haze, the first neon.',
    pal: ['#311D15', '#1D2D51', '#2F5181', '#72533D', '#786992', '#C78545', '#BD9398', '#D8D2BA'],
    o: { skyTop: '#363f8a', skyHor: '#9a6aa8', skyBot: '#e0909e', cloud: '#a888b8', cover: .5, stars: .2, sun: '#d8789a', sunI: .48, hemiSky: '#6a6aa0', hemiGnd: '#3a2f44', hemiI: .5, rim: '#c88098', rimI: 0.35, night: .75, win: .95, neon: 1.25, bulb: 1.0, trim: .9,
      haze: '#b27a9a', hazeAmt: .45, mist: '#b090c0', mistAmt: .85, shafts: .6, wet: .3,
      shadowTint: '#1D2D51', shadowAmt: .22, midTint: '#786992', midAmt: 0.3, hiTint: '#ffc89a', hiAmt: .6, sat: 1.1, con: 1.05, palBlend: 0.14,
      grain: 0.22, grainSize: 1, fringe: 0.7, flare: .3, vignette: .35, bloomK: 1.25, bloomTh: .9, halation: 1.2 } },
  { id: 'night', name: 'Night', note: 'Deep shadows, neon doing the lighting. Teal and magenta with red neon.',
    pal: ['#130B0F', '#0B292D', '#322833', '#5C3854', '#235165', '#A94A4F', '#716687', '#E69A73'],
    o: { skyTop: '#091226', skyHor: '#16264a', skyBot: '#25204f', cloud: '#3d4166', cover: .45, stars: 1, sun: '#7086c9', sunI: .42, hemiSky: '#34507a', hemiGnd: '#1a1f2e', hemiI: .55, rim: '#6e8ee6', rimI: .45, night: 1, win: 1.32, neon: 1.6, bulb: 1.5, trim: 1.35,
      haze: '#232a5a', hazeAmt: .35, mist: '#7a5a9a', mistAmt: .8, shafts: .2, wet: .3,
      shadowTint: '#0B292D', shadowAmt: .22, midTint: '#5C3854', midAmt: 0.3, hiTint: '#E69A73', hiAmt: .25, sat: 1.25, con: 1.1, palBlend: 0.1,
      grain: 0.2, grainSize: 1, fringe: 1, flare: 0, vignette: .4, bloomK: 1.15, bloomTh: .9, halation: 1.1 } },
  { id: 'rainyNight', name: 'Rainy night', note: 'The full Blade Runner moment, reflections everywhere.',
    pal: ['#111017', '#1C1A25', '#262637', '#3F354C', '#524561', '#774A6B', '#63688D', '#A6567F'],
    o: { skyTop: '#0d0d1a', skyHor: '#1a1830', skyBot: '#2a2040', cloud: '#2a2a42', cover: .9, stars: 0, sun: '#5a66a0', sunI: .3, hemiSky: '#2a3050', hemiGnd: '#14141f', hemiI: .5, rim: '#8a60c8', rimI: .2, night: 1, win: 1.4, neon: 1.9, bulb: 1.6, trim: 1.5,
      haze: '#2a2040', hazeAmt: .5, mist: '#a060b0', mistAmt: 1.2, shafts: 0, wet: 1, sparkle: 0.35,
      shadowTint: '#1C1A25', shadowAmt: .2, midTint: '#774A6B', midAmt: 0.35, hiTint: '#A6567F', hiAmt: .3, sat: 1.2, con: 1.12, palBlend: .08,
      grain: 0.2, grainSize: 1, fringe: 1.2, flare: 0, vignette: .45, bloomK: 1.3, bloomTh: .85, halation: 1.2 } },
  { id: 'late', name: 'Late night or pre-dawn', note: 'Quiet and desaturated, a few windows still lit, mist.',
    pal: ['#0E121C', '#1E2638', '#2F3A52', '#4A5870', '#6B7A92', '#8C99AE', '#B4BDCB', '#DCE1E8'],
    o: { skyTop: '#101626', skyHor: '#1e2740', skyBot: '#2c3552', cloud: '#3b4358', cover: .4, stars: .7, sun: '#8a98c0', sunI: .35, hemiSky: '#3c4f6e', hemiGnd: '#1d222c', hemiI: .5, rim: '#8aa0d0', rimI: .3, night: .62, win: 1, neon: 1.1, bulb: .9, trim: .8,
      haze: '#2c3552', hazeAmt: .45, mist: '#8090a8', mistAmt: 1.1, shafts: .1, wet: .3,
      shadowTint: '#16202a', shadowAmt: .12, midTint: '#4A5870', midAmt: 0.25, hiTint: '#c8d0e0', hiAmt: .3, sat: .82, con: 1, palBlend: .12,
      grain: 0.25, grainSize: 1, fringe: .6, flare: 0, vignette: .45, bloomK: 1, bloomTh: 1, halation: 1.1 } },
];
const ORDER = DEFS.map(d => d.id);

/* ---------- the looks as data ---------- */
const LOOKS = {}, DEFAULTS = {};
for (const d of DEFS){
  const v = Object.assign({}, BASE, d.o);
  DEFAULTS[d.id] = { name: d.name, note: d.note, pal: d.pal.slice(), v: JSON.parse(JSON.stringify(v)) };
  LOOKS[d.id] = { id: d.id, name: d.name, note: d.note, pal: d.pal.slice(), v: Object.assign({}, v), c: null, palC: null };
}
// compiled form of a look: colors as linear triples, the palette sorted by brightness (a gradient map goes dark to light)
function compile(look){
  const c = {};
  for (const k of PKEY){ const val = look.v[k]; c[k] = PDEF[k][3] === 'c' ? hex3(val).map(dec) : +val; }
  look.c = c;
  look.palC = look.pal.map(hex3).sort((a, b) => lum3(a) - lum3(b));
}
for (const id of ORDER) compile(LOOKS[id]);
const defaultC = {};   // the same, from the shipped values (held key: before and after)
for (const id of ORDER){ const l = { v: DEFAULTS[id].v, pal: DEFAULTS[id].pal }; compile(l); defaultC[id] = l; }

/* ---------- state ---------- */
const LK = window.LK = {
  old: false,                 // the overlay test "old grades (as before)": the whole old path, sky.js applyTimeOld
  fx: { grain: true, fringe: true, vignette: true, flare: true, sparkle: true, palette: true },   // each new effect on or off (off: the old way)
  pick: 'auto',               // 'auto', or the id of a look held whatever the time and weather
  editing: null,              // the id being edited (the look editor holds it on screen)
  holdDefault: false,         // held key: show the shipped values, not the edited ones
  overlap: 1,                 // hours of overlap round each hand-off between times of day
  // Auto, by hour of day (the window each look owns; neighbors cross-fade over `overlap` hours centered on the boundary)
  auto: [{ id: 'late', start: 3 }, { id: 'morning', start: 5.5 }, { id: 'afternoon', start: 11 }, { id: 'golden', start: 16.5 }, { id: 'dusk', start: 18.5 }, { id: 'night', start: 20 }],
  fast: { on: false, daySec: 60 },       // "show blends": a whole day in daySec seconds, Auto on
  wx: { mode: 'manual', set: 'clear', rain: 0, cloud: 0, tr: 0, tc: 0, wrote: false, t: 0, seq: [], fadeSec: 30 },
  looks: LOOKS, defaults: DEFAULTS, order: ORDER, params: PARAMS, base: BASE,
  weights: {}, V: null, fade: null, lastW: {}, fadeSec: 3,
  fxChanged: null,
};
// the values being shown right now (blended): colors as sRGB triples, numbers as numbers
const V = LK.V = {};
for (const k of PKEY) V[k] = PDEF[k][3] === 'c' ? [0, 0, 0] : 0;

/* ---------- saved edits and the player's choice (this browser only) ---------- */
const EDIT_KEY = 'neonLooks.edits', PICK_KEY = 'neonLooks.pick', WX_KEY = 'neonLooks.weather';
const okHex = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h);
// take one look's saved values (a whole look or part of one) over the current ones; anything that isn't a valid value is ignored
function takeLook(id, src){
  const l = LOOKS[id]; if (!l || !src || typeof src !== 'object') return false;
  const v = src.v && typeof src.v === 'object' ? src.v : src;
  for (const k of PKEY){ const p = PDEF[k]; if (!(k in v)) continue; const x = v[k];
    if (p[3] === 'c'){ if (okHex(x)) l.v[k] = x.toLowerCase(); }
    else if (typeof x === 'number' && isFinite(x)) l.v[k] = Math.min(p[5], Math.max(p[4], x)); }
  if (Array.isArray(src.pal) && src.pal.length === 8 && src.pal.every(okHex)) l.pal = src.pal.map(h => h.toLowerCase());
  compile(l); return true;
}
LK.takeLook = takeLook;
LK.saveEdits = () => { try { const out = {}; for (const id of ORDER){ const l = LOOKS[id], d = DEFAULTS[id];
      if (JSON.stringify([l.v, l.pal]) !== JSON.stringify([d.v, d.pal])) out[id] = { pal: l.pal, v: l.v }; }
    if (Object.keys(out).length) localStorage.setItem(EDIT_KEY, JSON.stringify(out)); else localStorage.removeItem(EDIT_KEY); return true; } catch (e) { return false; } };
LK.resetLook = id => { const d = DEFAULTS[id], l = LOOKS[id]; if (!d) return; l.v = JSON.parse(JSON.stringify(d.v)); l.pal = d.pal.slice(); compile(l); };
LK.set = (id, k, val) => { const l = LOOKS[id]; if (!l || !(k in PDEF)) return; l.v[k] = val; compile(l); };
LK.setPal = (id, i, hex) => { const l = LOOKS[id]; if (!l || !okHex(hex)) return; l.pal[i] = hex.toLowerCase(); compile(l); };
LK.exportLook = id => ({ id, name: LOOKS[id].name, pal: LOOKS[id].pal.slice(), v: Object.assign({}, LOOKS[id].v) });
LK.exportAll = () => ({ looks: ORDER.map(LK.exportLook) });
// paste: one look ({id, pal, v}) or all ({looks: [...]}); returns how many were taken
LK.importJSON = text => {
  let d; try { d = JSON.parse(text); } catch (e) { return -1; }
  let n = 0;
  if (d && Array.isArray(d.looks)){ for (const x of d.looks) if (x && takeLook(x.id, x)) n++; }
  else if (d && d.id && takeLook(d.id, d)) n = 1;
  return n;
};
try { const e = JSON.parse(localStorage.getItem(EDIT_KEY) || 'null'); if (e && typeof e === 'object') for (const id in e) takeLook(id, e[id]); } catch (e) {}
try { const p = localStorage.getItem(PICK_KEY); if (p && (p === 'auto' || LOOKS[p])) LK.pick = p; } catch (e) {}
try { const w = JSON.parse(localStorage.getItem(WX_KEY) || 'null'); if (w && typeof w === 'object'){
  if (w.set === 'overcast' || w.set === 'rain' || w.set === 'clear') LK.wx.set = w.set;
  if (w.auto === true){ LK.wx.mode = 'auto'; } else if (LK.wx.set !== 'clear'){ LK.wx.mode = 'manual'; } } } catch (e) {}
const saveChoice = () => { try { localStorage.setItem(PICK_KEY, LK.pick); localStorage.setItem(WX_KEY, JSON.stringify({ set: LK.wx.set, auto: LK.wx.mode === 'auto' })); } catch (e) {} };

/* ---------- weather ---------- */
// Three states, clear, overcast and rain, set by hand or by Auto weather. rain and cloud are the smoothed amounts the looks use: they
// move toward the state's targets over about fadeSec real seconds, so a change of weather is a slow blend. S.rain stays a plain
// true or false (people, wind and the rain streaks read it): it flips when the rain amount passes half.
// Auto weather: slots of four to nine real minutes, the state of each drawn from a stream seeded by the city's seed (Math.random and
// the game's own stream are never touched), so a city's weather is repeatable. Mostly clear, sometimes overcast, rain now and then, never
// two rainy slots in a row, and always clear to begin with.
const wx = LK.wx;
function wxRng(seed){ let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
let wxR = null, wxSlotEnd = [], wxState = [];
function wxSlot(k){
  if (!wxR){ wxR = wxRng((typeof S !== 'undefined' ? S.seed : 1) ^ 0x7e57a11); wxSlotEnd = []; wxState = []; }
  while (wxState.length <= k){
    const i = wxState.length, len = 240 + wxR()*300, roll = wxR();
    const prev = i ? wxState[i - 1] : 'clear';
    let st = roll < .55 ? 'clear' : roll < .84 ? 'overcast' : 'rain';
    if (i === 0) st = 'clear'; else if (st === 'rain' && prev === 'rain') st = 'overcast';
    wxState.push(st); wxSlotEnd.push((i ? wxSlotEnd[i - 1] : 0) + len);
  }
  return wxState[k];
}
function wxAutoState(t){ let k = 0; while (true){ wxSlot(k); if (t < wxSlotEnd[k]) return wxState[k]; k++; } }
const wxTargets = s => s === 'rain' ? [1, 1] : s === 'overcast' ? [0, 1] : [0, 0];
LK.setWeather = (s, instant, noSave) => {   // by hand: clear, overcast or rain (noSave: a preview, the player's choice is left as it was)
  wx.mode = 'manual'; wx.set = s; const [r, c] = wxTargets(s); wx.tr = r; wx.tc = c;
  if (instant){ wx.rain = r; wx.cloud = c; }
  if (typeof S !== 'undefined'){ S.rain = wx.rain > .5; wx.wrote = S.rain; }
  if (!noSave) saveChoice();
};
LK.setAutoWeather = (on, noSave) => { if (on){ wx.mode = 'auto'; wx.t = 0; const s = wxAutoState(0); wx.set = s; const [r, c] = wxTargets(s); wx.tr = r; wx.tc = c; } else wx.mode = 'manual'; if (!noSave) saveChoice(); };
// jump straight to the state (tests, screenshots): no blend
LK.snapWeather = s => LK.setWeather(s, true);
{ const [r, c] = wxTargets(wx.set); wx.tr = r; wx.tc = c; wx.rain = r; wx.cloud = c; }

/* ---------- picking a look ---------- */
LK.setPick = (id, instant) => {
  if (id !== 'auto' && !LOOKS[id]) return;
  if (id === LK.pick) return;
  LK.fade = instant ? null : { from: Object.assign({}, LK.lastW), t: 0 };
  LK.pick = id; saveChoice();
};

/* ---------- which looks, how much (Auto) ---------- */
function autoWeights(h, out){
  const T = LK.auto, n = T.length, ov = Math.max(.05, LK.overlap), t0 = T[0].start;
  const hh = h < t0 ? h + 24 : h;
  let i = 0; while (i < n - 1 && T[i + 1].start <= hh) i++;
  const cur = T[i].id, nxt = T[(i + 1) % n].id, prv = T[(i + n - 1) % n].id;
  const bN = i + 1 < n ? T[i + 1].start : t0 + 24, bP = T[i].start;
  const tN = smooth((hh - (bN - ov/2))/ov);          // 0 before the next boundary's cross-fade, 1 after
  const tP = 1 - smooth((hh - (bP - ov/2))/ov);      // how much of the previous look is still there
  out[cur] = 1 - tN - tP; if (tN > 0) out[nxt] = (out[nxt] || 0) + tN; if (tP > 0) out[prv] = (out[prv] || 0) + tP;
  return out;
}
// the weather's say: rain turns the day looks into their rainy ones, clouds without rain toward Overcast, and the in-between times
// (dusk, pre-dawn) take a little of the rainy and overcast feel of their neighbors
function weatherWeights(w, r, c, out){
  const cc = c*(1 - r);
  const add = (id, x) => { if (x > 1e-4) out[id] = (out[id] || 0) + x; };
  for (const id in w){ const x = w[id]; if (x <= 0) continue;
    if (id === 'morning'){ add('morning', x*(1 - r)*(1 - cc)); add('rainyMorning', x*r); add('overcast', x*(1 - r)*cc); }
    else if (id === 'afternoon' || id === 'golden'){ add(id, x*(1 - r)*(1 - cc)); add('rainyAfternoon', x*r); add('overcast', x*(1 - r)*cc); }
    else if (id === 'night'){ add('night', x*(1 - r)); add('rainyNight', x*r); }
    else if (id === 'dusk'){ const rr = .35*r, oc = .25*cc; add('dusk', x*(1 - rr - oc)); add('rainyAfternoon', x*rr*.5); add('rainyNight', x*rr*.5); add('overcast', x*oc); }
    else if (id === 'late'){ const rr = .3*r, oc = .2*cc; add('late', x*(1 - rr - oc)); add('rainyNight', x*rr*.5); add('rainyMorning', x*rr*.5); add('overcast', x*oc); }
    else add(id, x); }
  return out;
}
// lookAt(time, weather): the weights of the looks at that hour and weather (at most a handful, usually two or three)
// (A hand-off in mixed weather can hold four or five looks for a moment: each time of day brings its rainy and overcast variants. Cutting it back to
// three was tried and gave jumps where weights tie, so the blend is left whole; it is two or three looks nearly all of the time.)
function lookAt(h, r, c){ return weatherWeights(autoWeights(h, {}), smooth(r), smooth(c), {}); }
LK.lookAt = lookAt;

/* ---------- blending ---------- */
const acc = {}; for (const k of PKEY) acc[k] = PDEF[k][3] === 'c' ? [0, 0, 0] : 0;
function blend(W, useDefaults){
  let tot = 0; for (const id in W) tot += W[id];
  if (tot <= 0){ W = { afternoon: 1 }; tot = 1; }
  for (const k of PKEY){ if (PDEF[k][3] === 'c'){ const a = acc[k]; a[0] = a[1] = a[2] = 0; } else acc[k] = 0; }
  for (const id in W){
    const f = W[id]/tot, l = useDefaults ? defaultC[id] : LOOKS[id]; if (!l || f <= 0) continue;
    const c = l.c;
    for (const k of PKEY){ if (PDEF[k][3] === 'c'){ const a = acc[k], s = c[k]; a[0] += s[0]*f; a[1] += s[1]*f; a[2] += s[2]*f; } else acc[k] += c[k]*f; }
  }
  for (const k of PKEY){ if (PDEF[k][3] === 'c'){ const a = acc[k], o = V[k]; o[0] = enc(a[0]); o[1] = enc(a[1]); o[2] = enc(a[2]); } else V[k] = acc[k]; }
  // the palette: the sorted colors, mixed index by index (in linear light, like everything else)
  for (let q = 0; q < 8; q++){ const o = PAL_V[q]; o[0] = o[1] = o[2] = 0;
    for (const id in W){ const f = W[id]/tot, l = useDefaults ? defaultC[id] : LOOKS[id]; if (!l || f <= 0) continue; const s = l.palC[q]; o[0] += dec(s[0])*f; o[1] += dec(s[1])*f; o[2] += dec(s[2])*f; }
    o[0] = enc(o[0]); o[1] = enc(o[1]); o[2] = enc(o[2]); }
}
const PAL_V = Array.from({ length: 8 }, () => [0, 0, 0]);
LK.PAL_V = PAL_V;

/* ---------- each frame ---------- */
let lastNow = null, wxFrameNow = 0;
function tick(){
  const now = performance.now(), dt = lastNow === null ? 0 : Math.min(1, Math.max(0, (now - lastNow)/1000)); lastNow = now; wxFrameNow = now;
  // the weather: S.rain set from outside (a test, a script) is a manual choice, taken at once
  if (S.rain !== wx.wrote){ const s = S.rain ? 'rain' : 'clear'; wx.mode = 'manual'; wx.set = s; const [r, c] = wxTargets(s); wx.tr = r; wx.tc = c; wx.rain = r; wx.cloud = c; wx.wrote = S.rain; if (LK.onWeather) LK.onWeather(); }
  if (wx.mode === 'auto'){
    wx.t += dt; const s = wxAutoState(wx.t);
    if (s !== wx.set){ wx.set = s; const [r, c] = wxTargets(s); wx.tr = r; wx.tc = c; if (LK.onWeather) LK.onWeather(); }
  }
  const st = dt/Math.max(1, wx.fadeSec);
  wx.rain += Math.max(-st, Math.min(st, wx.tr - wx.rain)); wx.cloud += Math.max(-st, Math.min(st, wx.tc - wx.cloud));
  const sr = wx.rain > .5; if (sr !== S.rain){ S.rain = sr; if (typeof lastLabel !== 'undefined') lastLabel = ''; } wx.wrote = S.rain;
  // "show blends": a whole day in a minute (or so), with Auto on
  if (LK.fast.on) S.hour = (S.hour + dt*24/Math.max(5, LK.fast.daySec)) % 24;
  // a look picked by hand crossfades over fadeSec seconds
  if (LK.fade){ LK.fade.t += dt/LK.fadeSec; if (LK.fade.t >= 1) LK.fade = null; }
  return dt;
}
function wantedWeights(){
  if (LK.editing && LOOKS[LK.editing]) return { [LK.editing]: 1 };
  if (LK.pick !== 'auto' && LOOKS[LK.pick]) return { [LK.pick]: 1 };
  return lookAt(S.hour, wx.rain, wx.cloud);
}
const tmpC = new THREE.Color();
function lkApply(){
  tick();
  let W = wantedWeights();
  if (LK.fade){ const e = smooth(LK.fade.t), m = {}; for (const id in LK.fade.from) m[id] = LK.fade.from[id]*(1 - e); for (const id in W) m[id] = (m[id] || 0) + W[id]*e; W = m; }
  LK.weights = W; LK.lastW = W;
  blend(W, LK.holdDefault);
  const h = S.hour, v = V, night = v.night, u = comp.uniforms, g = glowMix.uniforms;
  cur.top.setRGB(v.skyTop[0], v.skyTop[1], v.skyTop[2]); cur.bot.setRGB(v.skyBot[0], v.skyBot[1], v.skyBot[2]);
  cur.sun.setRGB(v.sun[0], v.sun[1], v.sun[2]); cur.hs.setRGB(v.hemiSky[0], v.hemiSky[1], v.hemiSky[2]); cur.hg.setRGB(v.hemiGnd[0], v.hemiGnd[1], v.hemiGnd[2]);
  cur.cloud.setRGB(v.cloud[0], v.cloud[1], v.cloud[2]); cur.si = v.sunI; cur.hi = v.hemiI; cur.night = night;
  // One continuous path, so shadows never flip (see applyTimeOld): the sun follows the clock whatever the look
  const ang = ((h - 6)/12)*PI;
  SUN_DIR.set(Math.cos(ang)*.9, .32 + Math.abs(Math.sin(ang))*.9, .5).normalize(); placeSun();
  sun.color.copy(cur.sun); sun.intensity = cur.si;
  hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
  M.cloud.color.copy(cur.cloud);
  const tn = FOL_UNI.tint.value.copy(cur.hs).multiplyScalar(cur.hi*.9).add(tmpC.copy(cur.sun).multiplyScalar(cur.si*.55));
  tn.r = Math.min(tn.r, 1.1); tn.g = Math.min(tn.g, 1.1); tn.b = Math.min(tn.b, 1.1);
  FOL_UNI.neonI.value = .8 + .2*night;
  // the light-up strengths come straight from the look (the old way derived them from the night amount): the same path
  // into the materials and the cache's light key (EM_I), so a slow blend is a slow drift to the static cache
  for (const m of ALL_MATS){
    const gl = m.userData.glow; if (!gl) continue;
    m.emissiveIntensity = gl === 'window' ? v.win : gl === 'bulb' ? v.bulb : gl === 'neon' ? v.neon : gl === 'trim' ? v.trim : 1.3;
  }
  LIGHTS_GOAL = night;
  { const e = EM_I.value; e[1] = v.win; e[2] = v.bulb; e[3] = v.neon; e[4] = v.trim; e[5] = 1.3; e[6] = 1.5 + .4*night; }
  for (const k of ['pink', 'cyan', 'amber', 'warm']) GLOW[k].opacity = .1 + .8*night;
  GLOW.red.opacity = .95; GLOW_NIGHT.value = .1 + .8*night; GLOW.blue.opacity = .85;
  // sky, haze and the air
  u.skyTop.value.copy(cur.top); u.skyBot.value.copy(cur.bot); u.skyMid.value.setRGB(v.skyHor[0], v.skyHor[1], v.skyHor[2]); u.skyMidOn.value = 1;
  u.haze.value.setRGB(v.haze[0], v.haze[1], v.haze[2]); u.hazeK.value = v.hazeAmt; u.night.value = night; u.starVis.value = v.stars;
  cloudMat.uniforms.cover.value = v.cover; cloudMat.uniforms.cloudAmt.value = .5; cloudMat.uniforms.cloudCol.value.setRGB(v.cloud[0], v.cloud[1], v.cloud[2]);
  u.rimI.value = S.rim === false ? 0 : v.rimI; u.rimCol.value.setRGB(v.rim[0], v.rim[1], v.rim[2]);
  u.mistI.value = S.mist === false ? 0 : v.mistAmt;
  { const t = v.mist, m = Math.max(t[0], t[1], t[2], .001); u.mistTint.value.setRGB(t[0]/m, t[1]/m, t[2]/m); }
  u.mistSun.value = .35 + .65*(1 - night)*Math.min(1, v.sunI/.9);
  u.mistNight.value = night;
  // the grade (the lens and film part is set after the composite: lkGlow)
  if (S.grade === false){ g.lift.value.set(0, 0, 0); g.gain.value.set(1, 1, 1); g.sat.value = 1; g.con.value = 1; g.midA.value = 0; }
  else {
    const st = v.shadowTint, sa = v.shadowAmt; g.lift.value.set(st[0]*sa, st[1]*sa, st[2]*sa);
    const ht = v.hiTint, hl = Math.max(lum3(ht), .05), ha = v.hiAmt; g.gain.value.set(1 + (ht[0]/hl - 1)*ha, 1 + (ht[1]/hl - 1)*ha, 1 + (ht[2]/hl - 1)*ha);
    g.sat.value = v.sat; g.con.value = v.con;
    const mt = v.midTint, ml = Math.max(lum3(mt), .05); g.midG.value.set(1 + (mt[0]/ml - 1)*v.midAmt, 1 + (mt[1]/ml - 1)*v.midAmt, 1 + (mt[2]/ml - 1)*v.midAmt); g.midA.value = v.midAmt;
  }
  return night;
}
// called from compVariant (sky.js), after main.js has set the frame's own values: what the looks decide about the ground and rain
function lkFrame(){
  const u = comp.uniforms, v = V, r = smooth(wx.rain);
  u.wet.value = S.wetOn ? v.wet : 0;
  u.sparkle.value = LK.fx.sparkle && S.wetOn ? v.sparkle : 0;
  u.rainAmt.value = r; u.rainOn.value = r > .02 ? 1 : 0; u.rainDark.value = r;
  u.rayI.value *= v.shafts;
}
// called from renderGlow (sky.js): the lens and film values, and where the sun is on the sky map
const PI2 = Math.PI*2;
function lkGlow(){
  const g = glowMix.uniforms, v = V, fx = LK.fx;
  const gradeOn = S.grade !== false;
  g.palBlend.value = fx.palette && gradeOn ? v.palBlend : 0;
  for (let q = 0; q < 8; q++) g.pal8.value[q].set(PAL_V[q][0], PAL_V[q][1], PAL_V[q][2]);
  g.grain.value = fx.grain ? v.grain : 0; g.grainSize.value = Math.max(1, Math.round(v.grainSize));
  g.fringe.value = fx.fringe ? v.fringe : 0;
  g.vig.value = fx.vignette ? v.vignette : 0;
  g.bloomK.value = v.bloomK; g.halK.value = v.halation; glowPick.uniforms.thK.value = v.bloomTh;
  // lens flare and sun glare: the sun's place on the sky map the stars use (azimuth across, elevation up), so it comes into view as the camera turns
  g.flare.value = fx.flare ? v.flare : 0;
  if (g.flare.value > 0){
    const az = Math.atan2(SUN_DIR.z, SUN_DIR.x), el = Math.asin(Math.max(-1, Math.min(1, SUN_DIR.y)));
    let da = az - comp.uniforms.skyYaw.value; da -= Math.floor((da + Math.PI)/PI2)*PI2;
    const nx = da/((W/H)*SKY_H), ny = (el - SKY_EL)/SKY_H;
    g.sunUv.value.set(nx*.5 + .5, ny*.5 + .5);
    const ex = Math.max(0, Math.abs(nx) - 1), ey = Math.max(0, Math.abs(ny) - 1), out = Math.hypot(ex, ey)*.5;
    g.flareVis.value = 1 - smooth(out/.5);
    g.flareCol.value.setRGB(Math.min(1, v.sun[0]*.6 + .4), Math.min(1, v.sun[1]*.6 + .4), Math.min(1, v.sun[2]*.6 + .4));
  }
}
window.lkApply = lkApply; window.lkFrame = lkFrame; window.lkGlow = lkGlow;
LK.hex = hexOf; LK.hex3 = hex3;
LK.smooth = smooth;
LK.describe = () => { const W = LK.weights, ids = Object.keys(W).filter(id => W[id] > .02).sort((a, b) => W[b] - W[a]); return ids.map(id => LOOKS[id].name + ' ' + Math.round(W[id]*100) + '%').join(' · '); };
})();
