// Neon Terrarium: the player's interface, for the public build. Everything here only runs on the normal page: with #dev in the address the
// page stays exactly as it was (the playground deck, fast forward, cloud saves, every render switch).
// It rearranges what the other scripts made (moving their elements keeps their listeners), so the game code doesn't change:
//  - Settings: a dialog in the middle, in tabs: Graphics (presets and a few plain choices), Sound, General, Advanced (every switch, in plain words)
//  - City settings: a small panel next to "Hover for controls": time and weather (both on their own by default), the new buildings' style
//    sliders, and an Advanced tab with the look and the look editor
//  - the music player folds away, the controls list is short, no fast forward, no cloud saves (cities are kept in this browser only)
// All game scripts share one scope and load in order (see index.html).
'use strict';
(() => {
if (location.hash.includes('dev')) return;
const $ = id => document.getElementById(id);
const el = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) for (const k in props){ if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else if (k === 'html') e.innerHTML = props[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); } for (const c of kids) if (c) e.append(c); return e; };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const K = 'neonIsland.pui.';
document.documentElement.classList.add('pui');

const tabs = (names) => {   // a row of tab buttons and their panes
  const bar = el('div', { class: 'pu-tabs', role: 'tablist' }), panes = {}, btns = {};
  const pick = n => { for (const k in panes){ panes[k].hidden = k !== n; btns[k].classList.toggle('on', k === n); btns[k].setAttribute('aria-selected', k === n); } };
  for (const [id, label] of names){ btns[id] = el('button', { role: 'tab', text: label, onclick: () => pick(id) }); bar.append(btns[id]); panes[id] = el('div', { class: 'pu-pane', role: 'tabpanel' }); }
  pick(names[0][0]);
  return { bar, panes, pick };
};
const group = (title, ...kids) => el('section', { class: 'pu-group' }, title ? el('h3', { text: title }) : null, ...kids);
const relabel = (id, text, title) => { const i = $(id); if (!i) return null; const lab = i.closest('label'); if (lab){ for (const n of [...lab.childNodes]) if (n.nodeType === 3) n.remove(); lab.append(document.createTextNode(' ' + text)); if (title) lab.title = title; else lab.removeAttribute('title'); } return lab; };
const chipsRelabel = (id, labels) => { const box = $(id); if (!box) return null; box.querySelectorAll('button').forEach((b, k) => { if (labels[k]){ b.textContent = labels[k][0]; b.title = labels[k][1] || ''; } }); return box; };

/* ---------- Settings: a dialog in the middle ---------- */
const deck = $('deck');
const timeSec = deck.querySelector('section');   // (the first: time of day, the day cycle, wind)
const looksSec = $('looksSec');
const buildSec = $('clutter') && $('clutter').closest('section');
const soundSec = $('musicVol') && $('musicVol').closest('section');
const islandSec = $('reseed') && $('reseed').closest('section');
const renderFold = deck.querySelector('details.fold');
const foot = deck.querySelector('.foot');
const toTitle = $('toTitle');

const head = el('header', { class: 'pu-head' }, el('h2', { text: 'Settings' }), el('button', { class: 'pu-x', 'aria-label': 'Close settings', text: '✕', onclick: () => closeDeck() }));
const T = tabs([['gfx', 'Graphics'], ['sound', 'Sound'], ['general', 'General'], ['adv', 'Advanced']]);

// --- Graphics: presets, then the few choices most players want
const PRESETS = {
  performance: { name: 'Performance', note: 'Smoothest on laptops and older machines', lines: 480, cloudQ: 3, zoomRes: 1, farView: false, autoPerf: true, cap720: true, tiers: true,
    fx: { outlines: true, vclouds: true, rays: false, bloom: true, rim: true, grade: true, lights: true, ao: false, mist: false, wet: false } },
  balanced: { name: 'Balanced', note: 'Recommended', lines: 720, cloudQ: 2, zoomRes: 1, farView: true, autoPerf: true, cap720: true, tiers: true,
    fx: { outlines: true, vclouds: true, rays: true, bloom: true, rim: true, grade: true, lights: true, ao: true, mist: true, wet: true } },
  quality: { name: 'Quality', note: 'Sharper clouds and lighting for a fast graphics card', lines: 720, cloudQ: 1, zoomRes: 1.6, farView: true, autoPerf: false, cap720: false, tiers: true,
    fx: { outlines: true, vclouds: true, rays: true, bloom: true, rim: true, grade: true, lights: true, ao: true, mist: true, wet: true } },
  ultra: { name: 'Ultra', note: 'Smooth, full-resolution picture: the heaviest', lines: 0, cloudQ: 1, zoomRes: 0, farView: true, autoPerf: false, cap720: false, tiers: true,
    fx: { outlines: true, vclouds: true, rays: true, bloom: true, rim: true, grade: true, lights: true, ao: true, mist: true, wet: true } },
};
const FX = ['outlines', 'vclouds', 'rays', 'bloom', 'rim', 'grade', 'lights', 'ao', 'mist', 'wet'];
const setBox = (id, v) => { const b = $(id); if (b && b.checked !== v){ b.checked = v; b.dispatchEvent(new Event('change')); } };
const clickChip = (box, attr, v) => { const b = [...$(box).querySelectorAll('button')].find(x => +x.dataset[attr] === v); if (b && !b.classList.contains('on')) b.click(); };
let applying = false;
function applyPreset(id){
  const p = PRESETS[id]; if (!p) return; applying = true;
  try { clickChip('resChips', 'lines', p.lines); clickChip('cloudChips', 'q', p.cloudQ); clickChip('zoomResChips', 'f', p.zoomRes);
    setBox('farView', p.farView); setBox('autoPerf', p.autoPerf); setBox('cap720', p.cap720); setBox('tiers', p.tiers); for (const f of FX) setBox(f, p.fx[f]); }
  finally { applying = false; }
  lsSet(K + 'preset', id); saveFx(); markPreset();
}
const current = () => ({ lines: RENDER_LINES, cloudQ: S.cloudQ || 2, zoomRes: ZOOM_RES, farView: FARV.on, autoPerf: S.autoPerf !== false, cap720: CAP720, tiers: S.tiers !== false,
  fx: Object.fromEntries(FX.map(f => [f, !!($(f) && $(f).checked)])) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function which(){ const c = current(); for (const id in PRESETS){ const p = PRESETS[id]; if (same({ lines: p.lines, cloudQ: p.cloudQ, zoomRes: p.zoomRes, farView: p.farView, autoPerf: p.autoPerf, cap720: p.cap720, tiers: p.tiers, fx: p.fx }, c)) return id; } return 'custom'; }
const presetRow = el('div', { class: 'pu-presets', role: 'group', 'aria-label': 'Graphics preset' });
const presetBtn = {};
for (const id in PRESETS){ const p = PRESETS[id]; presetBtn[id] = el('button', { onclick: () => applyPreset(id) }, el('b', { text: p.name }), el('small', { text: p.note })); presetRow.append(presetBtn[id]); }
const customNote = el('p', { class: 'note pu-custom', text: 'Custom: you have changed settings below or in Advanced.' });
function markPreset(){ const w = which(); for (const id in presetBtn) presetBtn[id].classList.toggle('on', id === w); customNote.hidden = w !== 'custom'; }
// the effects' switches aren't kept by the game itself: kept here, for the next visit
function saveFx(){ if (!applying) lsSet(K + 'fx', JSON.stringify(Object.fromEntries(FX.map(f => [f, !!($(f) && $(f).checked)])))); }
for (const f of FX){ const b = $(f); if (b) b.addEventListener('change', () => { saveFx(); markPreset(); }); }
for (const id of ['farView', 'autoPerf', 'cap720', 'tiers']){ const b = $(id); if (b) b.addEventListener('change', () => markPreset()); }
for (const box of ['resChips', 'cloudChips', 'zoomResChips']){ const b = $(box); if (b) b.addEventListener('click', () => setTimeout(markPreset, 0)); }
// the clouds' quality isn't kept by the game either
{ const q = +lsGet(K + 'cloudQ'); if (q >= 1 && q <= 3) clickChip('cloudChips', 'q', q);
  $('cloudChips').addEventListener('click', () => setTimeout(() => lsSet(K + 'cloudQ', String(S.cloudQ || 2)), 0)); }

const resBox = chipsRelabel('resChips', [['Chunky', 'Big, chunky pixels: the lightest'], ['Retro', 'Classic pixel art'], ['Crisp', 'Fine pixel art (recommended)'], ['Smooth', 'No pixel look, your screen\'s own resolution: the heaviest']]);
const cloudBox = chipsRelabel('cloudChips', [['Low', 'Clouds refresh more slowly: the lightest'], ['Medium', 'Recommended'], ['High', 'Clouds refresh fastest']]);
const zoomBox = chipsRelabel('zoomResChips', [['Standard', 'The same resolution at every zoom: the lightest'], ['Sharper', 'Up to 1.6 times the resolution when zoomed out'], ['Sharpest', 'Up to your screen\'s own resolution when zoomed out: the heaviest']]);
const farLab = relabel('farView', 'Sharp view when zoomed out', 'Zoomed out, the city sharpens to your screen\'s resolution as the view comes to rest, so distant buildings stay distinct');
const autoLab = relabel('autoPerf', 'Lower the resolution automatically when the game runs slow');
T.panes.gfx.append(
  group('Preset', presetRow, customNote),
  group('Pixel style', resBox),
  group('Clouds', cloudBox));

// --- Sound: the game's own section
if (soundSec){ const h = soundSec.querySelector('h2'); if (h) h.remove(); T.panes.sound.append(group(null, soundSec)); }

// --- General: back to the title, the camera's auto-turn, painting, clearing the island, and where the city is kept
const spinLab = relabel('spin', 'Slowly turn the view by itself');
const paintLab = relabel('paint', 'Drag to build across several plots');
const saveNote = el('p', { class: 'note pu-save', html: 'Your cities are saved automatically, <b>in this browser only</b> (its local storage, on this device). Clearing this site\'s data or browsing privately loses them. To keep a copy or move a city to another device, use <b>Export</b> in <b>Cities</b> on the title screen.' });
if (islandSec){ const h = islandSec.querySelector('h2'); if (h) h.remove(); }
T.panes.general.append(
  group(null, toTitle),
  group('Camera and building', el('div', { class: 'togs' }, spinLab, paintLab)),
  group('Saving', saveNote),
  islandSec ? group('Start over', el('p', { class: 'note', text: 'Removes every building on this island. It can\'t be undone.' }), islandSec) : null);

// --- Advanced: every switch, in plain words
const advLabels = [['outlines', 'Building outlines'], ['vclouds', '3D clouds'], ['rays', 'Sun rays'], ['bloom', 'Glow around lights (bloom)'], ['rim', 'Edge highlights (rim light)'],
  ['grade', 'Color grading'], ['lights', 'Street and window lights at night'], ['ao', 'Soft contact shadows (ambient occlusion)'], ['mist', 'Steam from vents'], ['wet', 'Wet street reflections']];
const fxTogs = el('div', { class: 'togs pu-cols' }); for (const [id, t] of advLabels){ const l = relabel(id, t); if (l) fxTogs.append(l); }
const perfTogs = el('div', { class: 'togs pu-cols' },
  relabel('tiers', 'Simplify distant blocks', 'Blocks far from the view are drawn with fewer small details: less memory, smoother turning'),
  relabel('idleRest', 'Save power when idle', 'After 10 seconds without input, draw at 30 frames a second; any input brings it straight back'),
  relabel('cap720', 'Limit apartments to 720p', 'Inside an apartment, never draw more pixels than a 720p screen: softer on a sharp screen, much lighter'));
T.panes.adv.append(group('Effects', fxTogs), group('Distant view', el('div', { class: 'togs' }, farLab, autoLab)), group('Zoomed-out resolution', zoomBox), group('Performance', perfTogs));

// the rest of the deck goes: the playground's render fold (emptied above), its footnote
if (renderFold) renderFold.remove();
if (foot) foot.remove();
deck.setAttribute('role', 'dialog'); deck.setAttribute('aria-label', 'Settings'); deck.setAttribute('aria-modal', 'true');
const backdrop = el('div', { class: 'pu-backdrop', onclick: () => closeDeck() }); document.body.append(backdrop);
function closeDeck(){ if (deck.classList.contains('open')) $('deckToggle').click(); }
addEventListener('keydown', e => { if (e.key === 'Escape' && deck.classList.contains('open')){ e.stopImmediatePropagation(); e.preventDefault(); closeDeck(); } }, true);
$('deckToggle').addEventListener('click', () => setTimeout(() => { $('deckToggle').textContent = 'Settings'; markPreset(); }, 0));

/* ---------- City settings: a panel next to "Hover for controls" ---------- */
const C = tabs([['city', 'City'], ['adv', 'Advanced']]);
const cityPanel = el('div', { class: 'pu-city', id: 'puCity', role: 'dialog', 'aria-label': 'City settings', hidden: '' },
  el('header', { class: 'pu-head' }, el('h2', { text: 'City settings' }), el('button', { class: 'pu-x', 'aria-label': 'Close city settings', text: '✕', onclick: () => cityOpen(false) })),
  C.bar, C.panes.city, C.panes.adv);
const cityBtn = el('button', { class: 'modehint pu-citybtn', id: 'puCityBtn', 'aria-expanded': 'false', 'aria-controls': 'puCity', text: 'City settings', onclick: () => cityOpen(cityPanel.hidden) });
function cityOpen(on){ cityPanel.hidden = !on; cityBtn.setAttribute('aria-expanded', on); cityBtn.classList.toggle('on', on); if (on) closeDeck(); }
// typing or clicking in it never reaches the game (the sliders take arrow keys)
cityPanel.addEventListener('keydown', e => { if (e.key === 'Escape'){ cityOpen(false); } e.stopPropagation(); });
addEventListener('pointerdown', e => { if (!cityPanel.hidden && !cityPanel.contains(e.target) && !cityBtn.contains(e.target)) cityOpen(false); }, true);
// time and weather
if (timeSec){ const h = timeSec.querySelector('h2'); if (h) h.textContent = 'Time and weather'; }
const cycleLab = relabel('cycle', 'Day and night cycle', 'The clock runs by itself: a whole day in an hour');
const engineLab = relabel('storyEngine', 'Storylet engine', typeof STORY !== 'undefined' && STORY.engineTip || '');
const wx = looksSec ? looksSec.querySelector('#wxChips') : null, autoWxLab = $('autoWeather') ? $('autoWeather').closest('label') : null, wxStatus = $('lookStatus');
if (autoWxLab){ for (const n of [...autoWxLab.childNodes]) if (n.nodeType === 3) n.remove(); autoWxLab.append(document.createTextNode(' Weather changes by itself')); }
if (timeSec){ const togs = timeSec.querySelector('.togs'), wind = $('wind') && $('wind').closest('.slider');
  const timeKids = [...timeSec.children].filter(n => n.tagName !== 'H2' && n !== togs && n !== wind);
  C.panes.city.append(group('Time', el('div', { class: 'togs' }, engineLab, cycleLab), ...timeKids), group('Weather', el('div', { class: 'togs' }, autoWxLab), wx, wind));
  if (togs){ togs.style.display = 'none'; cityPanel.append(togs); } }   // (the old Rain box stays in the page, hidden: the looks read it)
if (buildSec){ const h = buildSec.querySelector('h2'); if (h) h.remove(); C.panes.city.append(group('New buildings', ...buildSec.children)); }
// Advanced: the look (a colour mood for the whole city) and its editor
if (looksSec){ const lookPick = looksSec.querySelector('.lookpick'), ed = $('lookEdBtn');
  C.panes.adv.append(group('Look', el('p', { class: 'note', text: 'A colour mood for the whole city. Auto follows the time of day and the weather.' }), lookPick, wxStatus), group('Look editor', el('p', { class: 'note', text: 'Make your own looks (Shift+L).' }), ed)); looksSec.remove(); }
if (timeSec) timeSec.remove(); if (buildSec) buildSec.remove();
// next to "Hover for controls"
const ctl = document.querySelector('.ctlwrap');
if (ctl){ const row = el('div', { class: 'pu-ctlrow' }); ctl.parentNode.insertBefore(row, ctl); row.append(ctl, cityBtn); }
document.querySelector('.zonebar').append(cityPanel);
// (only now: until the city panel has taken its pieces, they have to stay in the page for getElementById to find them)
deck.replaceChildren(head, T.bar, ...Object.values(T.panes));

/* ---------- defaults for a new player: the day goes by itself, so does the weather ---------- */
if (lsGet(K + 'cycle') === null) setBox('cycle', true); else setBox('cycle', lsGet(K + 'cycle') === '1');
$('cycle').addEventListener('change', e => lsSet(K + 'cycle', e.target.checked ? '1' : '0'));
if (lsGet(K + 'wxset') === null && typeof LK !== 'undefined' && LK.wx && LK.wx.mode !== 'auto'){ LK.setAutoWeather(true); if (LK.onWeather) LK.onWeather(); }
if ($('autoWeather')) $('autoWeather').addEventListener('change', () => lsSet(K + 'wxset', '1'));
if (wx) wx.addEventListener('click', () => lsSet(K + 'wxset', '1'));

/* ---------- graphics: a new player starts on Balanced; the effects' switches come back as they were left ---------- */
{ const fx = (() => { try { return JSON.parse(lsGet(K + 'fx') || 'null'); } catch (e) { return null; } })();
  if (!lsGet(K + 'preset') && !fx) applyPreset('balanced');
  else if (fx){ applying = true; for (const f of FX) if (f in fx) setBox(f, !!fx[f]); applying = false; }
  // (Balanced changed on Oct 25: the same resolution at every zoom, "Standard". Measured on the owner's M2 close in, 1.6 times was 54 fps and the
  //  same pixels a steady 60. Anyone on the old Balanced moves to the new one once)
  if (lsGet(K + 'preset') === 'balanced' && lsGet(K + 'v') !== '2') applyPreset('balanced');
  lsSet(K + 'v', '2');
  markPreset(); }

/* ---------- no fast forward (the day count stays) ---------- */
{ const one = document.querySelector('#ffbar button[data-ff="1"]'); if (one && !one.classList.contains('on')) one.click(); if (typeof FF !== 'undefined' && FF.clock !== 1) FF.set(1);
  document.querySelectorAll('#ffbar button').forEach(b => b.remove()); }

/* ---------- no cloud saves: cities stay in this browser ---------- */
{ const f = $('tCloud'); if (f) f.remove();
  if (typeof SLOTS !== 'undefined') SLOTS.cloudUser = null;   // (the dev page's sign-in is left where it is, unused here)
  const panel = $('tCities'); if (panel){ const msg = $('tMsg'); panel.insertBefore(el('p', { class: 'tnote2 pu-save', html: 'Cities are saved <b>in this browser only</b>. Export a city to keep a copy or move it to another device.' }), msg); } }

/* ---------- the music player folds away ---------- */
{ const gd = $('gridDeck'), gh = gd && gd.querySelector('.gd-head');
  if (gh){ const b = el('button', { class: 'pu-fold', 'aria-label': 'Fold the player away', title: 'Fold away' });
    const set = min => { gd.classList.toggle('pu-min', min); b.textContent = min ? '+' : '−'; b.setAttribute('aria-label', min ? 'Show the player' : 'Fold the player away'); b.title = min ? 'Show' : 'Fold away'; lsSet(K + 'gdMin', min ? '1' : '0'); dispatchEvent(new Event('resize')); };
    b.addEventListener('click', e => { e.stopPropagation(); set(!gd.classList.contains('pu-min')); });
    gh.append(b); set(lsGet(K + 'gdMin') === '1'); } }

/* ---------- the controls, short ---------- */
{ const m = document.querySelector('.ctlpanel dl.mouseonly');
  if (m) m.innerHTML = [['Move', 'WASD · drag'], ['Rotate', 'Q / E · drag the sky'], ['Zoom', 'Scroll'], ['Build', 'Pick a zone (1–4), click'], ['Stack a floor', 'Space'],
    ['Pick a height', 'Shift'], ['Remove', 'Right-click · X'], ['Center view', 'H'], ['Cancel', 'Esc']].map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('');
  const t = document.querySelector('.ctlpanel dl.touchonly');
  if (t) t.innerHTML = [['Move', 'Drag'], ['Zoom', 'Pinch'], ['Rotate', 'Twist two fingers'], ['Build', 'Tap a zone, then a plot'], ['Stack', 'Tap a roof'],
    ['Grow the platform', 'Tap the sky'], ['Remove', 'Press and hold'], ['Delete mode', '✕']].map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join(''); }
})();
