// Neon Terrarium: the player's looks menu (in the settings deck) and the look editor (Shift+L).
// All game scripts share one scope and load in order (see index.html). Works on LK (looks.js); touches no game state besides S.hour and S.cycle.
'use strict';
(() => {
const $ = id => document.getElementById(id);
const el = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) for (const k in props){ if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); } for (const c of kids) if (c != null) e.append(c); return e; };
const WX = [['clear', 'Clear'], ['overcast', 'Overcast'], ['rain', 'Rain']];
const swatches = id => { const d = el('span', { class: 'sws', 'aria-hidden': 'true' }); for (const c of LK.looks[id].pal.slice().sort((a, b) => LK.hex3(a).reduce((s, x, i) => s + x*[.299, .587, .114][i], 0) - LK.hex3(b).reduce((s, x, i) => s + x*[.299, .587, .114][i], 0))) d.append(el('i', { style: 'background:' + c })); return d; };

/* ---------- the player's menu ---------- */
const deck = $('deck');
const menu = el('section', { id: 'looksSec' });
menu.append(el('h2', { text: 'Look and weather' }));
const list = el('div', { class: 'lookmenu', role: 'group', 'aria-label': 'Look' });
const items = {};
function addItem(id, name){
  const b = el('button', { class: 'lookitem', 'aria-pressed': 'false', title: id === 'auto' ? 'Follows the time of day and the weather' : LK.looks[id].note, onclick: () => { LK.setPick(id); refreshMenu(); } });
  b.append(el('b', { text: name })); b.append(id === 'auto' ? el('small', { text: 'follows the time and weather' }) : swatches(id));
  items[id] = b; list.append(b);
}
addItem('auto', 'Auto');
for (const id of LK.order) addItem(id, LK.looks[id].name);
const status = el('p', { class: 'note', id: 'lookStatus', 'aria-live': 'off' });
menu.append(status);
const wxRow = el('div', { class: 'chips', id: 'wxChips', role: 'group', 'aria-label': 'Weather' });
const wxBtn = {};
for (const [k, n] of WX){ const b = el('button', { 'data-w': k, text: n, onclick: () => { LK.setWeather(k); refreshMenu(); } }); wxBtn[k] = b; wxRow.append(b); }
menu.append(wxRow);
const autoWx = el('input', { type: 'checkbox', id: 'autoWeather' });
autoWx.addEventListener('change', () => { LK.setAutoWeather(autoWx.checked); refreshMenu(); });
menu.append(el('label', { class: 'tog', title: 'The weather changes slowly and rarely by itself, the same way every time for this city' }, autoWx, document.createTextNode(' Auto weather')));
menu.append(el('h3', { class: 'subhead', text: 'Look' }), list);
const edBtn = el('button', { class: 'wide', id: 'lookEdBtn', title: 'Shift+L', text: 'Look editor', onclick: () => toggleEditor() });
menu.append(edBtn);
// the old Rain box stays in the page (other code listens to it) but the weather chips replace it
const rainBox = $('rain'); if (rainBox && rainBox.closest('label')) rainBox.closest('label').style.display = 'none';
const firstSec = deck.querySelector('section');
if (firstSec && firstSec.nextSibling) deck.insertBefore(menu, firstSec.nextSibling); else deck.append(menu);
function refreshMenu(){
  for (const id in items){ const on = id === LK.pick; items[id].setAttribute('aria-pressed', on ? 'true' : 'false'); items[id].classList.toggle('on', on); }
  for (const k in wxBtn) wxBtn[k].classList.toggle('on', LK.wx.set === k);
  autoWx.checked = LK.wx.mode === 'auto';
}
LK.onWeather = refreshMenu;
refreshMenu();
setInterval(() => {
  const w = LK.wx, wxn = w.rain > .02 || w.cloud > .02 ? (w.rain > .5 ? 'rain' : 'clouds' + (w.cloud < .98 || w.rain > .02 ? ' (changing)' : '')) : 'clear';
  status.textContent = (LK.pick === 'auto' ? 'Auto: ' : 'Locked: ') + LK.describe() + ' · weather ' + wxn;
}, 400);

/* ---------- the editor ---------- */
const panel = el('aside', { id: 'lookEd', class: 'looked', hidden: '', role: 'dialog', 'aria-label': 'Look editor' });
const refsPane = el('aside', { id: 'lookRefs', class: 'lookrefs', hidden: '', 'aria-label': 'Reference images' });
document.body.append(panel, refsPane);
// typing here must never reach the game's keys (WASD, X, H, Q, E, 1 to 4, Space ...)
panel.addEventListener('keydown', e => { e.stopPropagation(); });
panel.addEventListener('keyup', e => { e.stopPropagation(); });
let open = false, curId = LK.order[0], inContext = false, savedCycle = false, savedPick = 'auto', savedFast = false;
const rows = {};   // key -> { input, out } for the current look
const head = el('header', {}, el('b', { text: 'Look editor' }), el('button', { 'aria-label': 'Close the look editor', text: '✕', onclick: () => toggleEditor(false) }));
const pickSel = el('select', { 'aria-label': 'Look to edit' });
for (const id of LK.order) pickSel.append(el('option', { value: id, text: LK.looks[id].name }));
pickSel.addEventListener('change', () => { curId = pickSel.value; if (!inContext) LK.editing = curId; fillRows(); showRefs(); });
const note = el('p', { class: 'note' });
const ctx = el('input', { type: 'checkbox', id: 'lkCtx' });
ctx.addEventListener('change', () => { inContext = ctx.checked; LK.editing = inContext ? null : curId; });
const hourOut = el('output', {}), hourIn = el('input', { type: 'range', min: 0, max: 24, step: .05, 'aria-label': 'Preview hour' });
hourIn.addEventListener('input', () => { S.hour = +hourIn.value; hourOut.textContent = fmtH(S.hour); });
const fmtH = h => { const m = Math.round(h*60) % 1440; return String(Math.floor(m/60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const wxRow2 = el('div', { class: 'chips' }); const wxBtn2 = {};
for (const [k, n] of WX){ const b = el('button', { text: n, onclick: () => { LK.setWeather(k, true); refreshMenu(); syncEd(); } }); wxBtn2[k] = b; wxRow2.append(b); }
const groups = {};
const body = el('div', { class: 'edbody' });
for (const p of LK.params){
  const g = p[1];
  if (!groups[g]){ const d = el('details', { class: 'edgroup' }); if (g === 'Sky') d.open = true; d.append(el('summary', { text: g })); groups[g] = d; body.append(d); }
}
// palette: eight swatches (they go dark to light in the gradient map, whatever order they are in here)
const palRow = el('div', { class: 'edpal' }), palIn = [];
for (let i = 0; i < 8; i++){ const c = el('input', { type: 'color', 'aria-label': 'Palette color ' + (i + 1) }); c.addEventListener('input', () => { LK.setPal(curId, i, c.value); markDirty(); refreshSwatches(); }); palIn.push(c); palRow.append(c); }
function addRow(p){
  const [key, g, label, kind, min, max, step, hint] = p, d = groups[g];
  if (key === 'palBlend'){ d.append(el('div', { class: 'edlabel', text: 'Palette (8 colors)' }), palRow); }
  const lab = el('label', { text: label }); if (hint) lab.append(el('small', { text: hint }));
  const out = el('output', {});
  let input;
  if (kind === 'c'){
    input = el('input', { type: 'color', 'aria-label': label });
    input.addEventListener('input', () => { LK.set(curId, key, input.value); out.textContent = input.value; markDirty(); });
  } else {
    input = el('input', { type: 'range', min, max, step, 'aria-label': label });
    input.addEventListener('input', () => { LK.set(curId, key, +input.value); out.textContent = (+input.value).toFixed(step < .01 ? 3 : step < 1 ? 2 : 0); markDirty(); });
  }
  const row = el('div', { class: 'edrow' + (kind === 'c' ? ' col' : '') }, lab, input, out);
  d.append(row); rows[key] = { input, out, kind, step };
}
for (const p of LK.params) addRow(p);
function fillRows(){
  const l = LK.looks[curId]; note.textContent = l.note;
  for (const k in rows){ const r = rows[k], v = l.v[k]; r.input.value = v; r.out.textContent = r.kind === 'c' ? v : (+v).toFixed(r.step < .01 ? 3 : r.step < 1 ? 2 : 0); }
  for (let i = 0; i < 8; i++) palIn[i].value = l.pal[i];
  pickSel.value = curId; dirty.textContent = '';
}
const dirty = el('span', { class: 'eddirty' });
function markDirty(){ dirty.textContent = 'edited (not saved)'; }
function refreshSwatches(){ for (const id of LK.order){ const old = items[id].querySelector('.sws'); if (old) old.replaceWith(swatches(id)); } }
// save, reset, copy, paste
const msg = el('p', { class: 'note', role: 'status' });
const say = t => { msg.textContent = t; };
const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } };
const pasteBox = el('textarea', { rows: 4, placeholder: 'Paste a look here (one look, or all ten), then Apply', 'aria-label': 'JSON to paste', spellcheck: 'false' });
const saveBtn = el('button', { text: 'Save', title: 'Keeps your edits in this browser', onclick: () => { say(LK.saveEdits() ? 'Saved in this browser (all looks).' : 'Could not save here (storage is blocked).'); dirty.textContent = ''; } });
const resetBtn = el('button', { text: 'Reset to default', onclick: () => { LK.resetLook(curId); LK.saveEdits(); fillRows(); refreshSwatches(); say(LK.looks[curId].name + ' is back to its shipped values.'); } });
const copyOne = el('button', { text: 'Copy JSON', title: 'This look', onclick: async () => { const t = JSON.stringify(LK.exportLook(curId), null, 1); say(await copyText(t) ? 'Copied ' + LK.looks[curId].name + '.' : 'Copy was blocked: the text is in the box below, select it and copy.'); pasteBox.value = t; } });
const copyAll = el('button', { text: 'Copy all ten', onclick: async () => { const t = JSON.stringify(LK.exportAll(), null, 1); say(await copyText(t) ? 'Copied all ten looks.' : 'Copy was blocked: the text is in the box below, select it and copy.'); pasteBox.value = t; } });
const applyBtn = el('button', { text: 'Apply pasted', onclick: () => { const n = LK.importJSON(pasteBox.value); say(n < 0 ? 'That is not valid JSON.' : n === 0 ? 'No look found in that text.' : 'Took ' + n + ' look' + (n > 1 ? 's' : '') + '. Press Save to keep them.'); if (n > 0){ fillRows(); refreshSwatches(); markDirty(); } } });
// compare with the old way
const cmp = el('div', { class: 'togs' });
const tog = (label, get, set, title) => { const c = el('input', { type: 'checkbox' }); c.checked = get(); c.addEventListener('change', () => set(c.checked)); const l = el('label', { class: 'tog', title: title || '' }, c, document.createTextNode(' ' + label)); cmp.append(l); return c; };
tog('Old grades (as before)', () => LK.old, v => { LK.old = v; }, 'The whole old time of day and grade: no looks, no new effects');
for (const [k, n] of [['grain', 'Film grain'], ['fringe', 'Color fringing'], ['vignette', 'Vignette'], ['flare', 'Lens flare'], ['sparkle', 'Sparkle'], ['palette', 'Palette blend']]) tog(n, () => LK.fx[k], v => { LK.fx[k] = v; }, 'Off: the old way, without this effect');
const holdBtn = el('button', { text: 'Hold to see the shipped look', title: 'Or hold B' });
holdBtn.addEventListener('pointerdown', () => { LK.holdDefault = true; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) holdBtn.addEventListener(ev, () => { LK.holdDefault = false; });
// blends
const fastOn = el('input', { type: 'checkbox', id: 'lkFast' }), fastSel = el('select', { 'aria-label': 'Length of the day' });
for (const [s, n] of [[120, '2 minutes a day'], [60, '1 minute a day'], [30, '30 seconds a day'], [15, '15 seconds a day']]) fastSel.append(el('option', { value: s, text: n }));
fastSel.value = 60;
function applyFast(){
  LK.fast.daySec = +fastSel.value;
  if (fastOn.checked && !LK.fast.on){ savedFast = true; savedPick = LK.pick; LK.setPick('auto', true); LK.editing = null; S.cycle = false; const c = $('cycle'); if (c) c.checked = false; }
  if (!fastOn.checked && LK.fast.on){ LK.setPick(savedPick, true); LK.editing = inContext ? null : curId; }
  LK.fast.on = fastOn.checked; refreshMenu();
}
fastOn.addEventListener('change', applyFast); fastSel.addEventListener('change', applyFast);
const blendsNow = el('p', { class: 'note', 'aria-live': 'off' });
// references
const drop = el('div', { class: 'eddrop', tabindex: '0', role: 'button', 'aria-label': 'Drop reference images here, or press Enter to choose files' }, el('b', { text: 'Reference images' }), el('small', { text: 'Drop the mood board images for this look here, or click to choose. They stay in this browser only.' }));
const fileIn = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });
drop.addEventListener('click', () => fileIn.click()); drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => { addRefs([...fileIn.files]); fileIn.value = ''; });
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', e => { addRefs([...(e.dataTransfer ? e.dataTransfer.files : [])]); });
const refsByLook = {};   // id -> [{ id, name, url, blob }]  (object URLs; the pictures live in memory and, where allowed, in this browser's IndexedDB)
function idb(){ return new Promise((res, rej) => { try { const r = indexedDB.open('neonLooks.refs', 1); r.onupgradeneeded = () => r.result.createObjectStore('refs', { keyPath: 'k', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
async function idbPut(look, name, blob){ try { const db = await idb(); return await new Promise(res => { const tx = db.transaction('refs', 'readwrite'); const rq = tx.objectStore('refs').add({ look, name, blob }); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbDel(k){ try { const db = await idb(); db.transaction('refs', 'readwrite').objectStore('refs').delete(k); } catch (e) {} }
async function idbLoad(){ try { const db = await idb(); const all = await new Promise(res => { const rq = db.transaction('refs').objectStore('refs').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => res([]); });
    for (const r of all){ if (!LK.looks[r.look] || !(r.blob instanceof Blob)) continue; (refsByLook[r.look] = refsByLook[r.look] || []).push({ k: r.k, name: r.name, url: URL.createObjectURL(r.blob) }); } showRefs(); } catch (e) {} }
async function addRefs(files){
  for (const f of files){ if (!f.type.startsWith('image/')) continue;
    const item = { name: f.name, url: URL.createObjectURL(f), k: null }; (refsByLook[curId] = refsByLook[curId] || []).push(item);
    idbPut(curId, f.name, f).then(k => { item.k = k; }); }
  showRefs();
}
function showRefs(){
  refsPane.textContent = '';
  const arr = refsByLook[curId] || [];
  refsPane.append(el('header', {}, el('b', { text: LK.looks[curId].name + ': references' })));
  if (!arr.length) refsPane.append(el('p', { class: 'note', text: 'No images yet. Drop them on the panel at the left.' }));
  for (const it of arr){
    const fig = el('figure', {}, el('img', { src: it.url, alt: it.name, title: it.name }), el('button', { 'aria-label': 'Remove ' + it.name, text: '✕', onclick: () => { arr.splice(arr.indexOf(it), 1); URL.revokeObjectURL(it.url); if (it.k != null) idbDel(it.k); showRefs(); } }));
    fig.querySelector('img').addEventListener('click', () => fig.classList.toggle('big'));
    refsPane.append(fig);
  }
  refsPane.hidden = !open;
}
panel.append(head, el('div', { class: 'edtop' },
  el('div', { class: 'edrow' }, el('label', { text: 'Look' }), pickSel), note,
  el('label', { class: 'tog', title: 'Off: the city shows just this look. On: the look as it blends in Auto at this hour and weather.' }, ctx, document.createTextNode(' Show it blended, as Auto would')),
  el('div', { class: 'edrow' }, el('label', { text: 'Hour' }), hourIn, hourOut), wxRow2,
  el('p', { class: 'note', text: 'Time stands still while the editor is open. Hold B to see the shipped look.' }),
  el('div', { class: 'chips' }, saveBtn, resetBtn, dirty)),
  body,
  el('div', { class: 'edtop' },
    drop, fileIn,
    el('div', { class: 'edlabel', text: 'Save and share' }), el('div', { class: 'chips' }, copyOne, copyAll), pasteBox, el('div', { class: 'chips' }, applyBtn), msg,
    el('div', { class: 'edlabel', text: 'Compare with the old way' }), cmp, el('div', { class: 'chips' }, holdBtn),
    el('div', { class: 'edlabel', text: 'Check the hand-offs' }), el('div', { class: 'edrow' }, el('label', { class: 'tog' }, fastOn, document.createTextNode(' Show blends')), fastSel), blendsNow));
function syncEd(){
  for (const k in wxBtn2) wxBtn2[k].classList.toggle('on', LK.wx.set === k);
}
function toggleEditor(force){
  const want = force === undefined ? !open : !!force; if (want === open) return;
  open = want; panel.hidden = !open; edBtn.classList.toggle('on', open); showRefs();
  if (open){
    savedCycle = S.cycle; S.cycle = false; const c = $('cycle'); if (c) c.checked = false;   // time stands still while editing
    LK.editing = inContext ? null : curId; fillRows(); hourIn.value = S.hour; hourOut.textContent = fmtH(S.hour); syncEd();
  } else {
    LK.editing = null; LK.holdDefault = false;
    if (LK.fast.on){ fastOn.checked = false; applyFast(); }
    S.cycle = savedCycle; const c = $('cycle'); if (c) c.checked = savedCycle;
  }
}
LK.toggleEditor = toggleEditor;
setInterval(() => { if (!open) return; hourOut.textContent = fmtH(S.hour); if (document.activeElement !== hourIn) hourIn.value = S.hour; syncEd(); blendsNow.textContent = LK.fast.on ? 'Now: ' + LK.describe() : ''; }, 400);
// keys: Shift+L opens and closes it (ahead of the game's own keys: L is the highway lanes key); hold B for the shipped look
const typing = t => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t.type === 'range' || t.type === 'color' || t.type === 'checkbox');
addEventListener('keydown', e => {
  if (e.key === 'L' && e.shiftKey && !e.ctrlKey && !e.metaKey && !typing(e.target)){ e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) toggleEditor(); return; }
  if (open && (e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)){ LK.holdDefault = true; }
}, true);
addEventListener('keyup', e => { if (e.key === 'b' || e.key === 'B') LK.holdDefault = false; }, true);
addEventListener('blur', () => { LK.holdDefault = false; });
idbLoad();
})();
