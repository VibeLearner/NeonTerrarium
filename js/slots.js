// Neon Terrarium: save slots. Several cities in one browser, each a copy of the city's own saves (saveguard.js lists
// which keys those are), kept in IndexedDB with a name, the day it has reached, how many live there and a small picture.
// The city being played lives in localStorage as it always has; its slot is brought up to date every few minutes, when
// another city is opened, and before it goes to the cloud or to a file.
// Also a placeholder cloud: type a username and the cities go to a small save server (Cloudflare Worker + KV, project
// doc claude/save-server.md) and can be opened from any browser. Not secure on purpose: the username is the only key.
// Loads after main.js (it reads the people, the plots and the stories' day for a slot's card).
'use strict';
const SLOTS = (() => {
  const SL = { active: null, cloudUser: null, cloudErr: null, rev: 0 };
  const ACTIVE_KEY = 'neonTerrarium.activeSlot', USER_KEY = 'neonTerrarium.cloudUser', PUSHED_KEY = 'neonTerrarium.cloudPushed';
  const CLOUD = 'https://neon-terrarium-saves.ashley-jacob165.workers.dev';
  const CHECK_MS = 5*60*1000;
  const ls = window.localStorage;
  const lsGet = k => { try { return ls.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { NT_RAW.set.call(ls, k, v); } catch (e) {} };   // (the raw writes: never dropped by the lock)
  const lsDel = k => { try { NT_RAW.remove.call(ls, k); } catch (e) {} };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const NAME_OK = /^[a-z0-9_-]{2,32}$/;

  /* ---------- the store ---------- */
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    const r = indexedDB.open('neonTerrarium.slots', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('slots', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('slots', mode), st = t.objectStore('slots'); const out = fn(st);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  const getRec = id => tx('readonly', st => st.get(id));
  const putRec = rec => tx('readwrite', st => st.put(rec));
  const delRec = id => tx('readwrite', st => st.delete(id));
  const allRecs = () => tx('readonly', st => st.getAll());

  /* ---------- the city being played ---------- */
  function cityKeysNow(){ const out = []; for (let i = 0; i < ls.length; i++){ const k = ls.key(i); if (NT_isCityKey(k)) out.push(k); } return out; }
  function snapshot(){ const d = {}; for (const k of cityKeysNow()){ const v = lsGet(k); if (v !== null) d[k] = v; } return d; }
  // the systems that only save on the way out are asked to save now (stories, cases, the ledger, the transmission log)
  function flush(){ try { if (typeof save === 'function') save(); } catch (e) {} try { dispatchEvent(new Event('beforeunload')); dispatchEvent(new Event('pagehide')); } catch (e) {} }
  function liveMeta(){
    let day = 1, residents = 0, plots = 0;
    try { day = STORY.day() + 1; } catch (e) {}
    try { for (const p of people.values()) if (!p.visitor && !p.gone) residents++; } catch (e) {}
    try { plots = cells.size; } catch (e) {}
    return { day, residents, plots };
  }
  // a small picture of the city, read from the frame the game has just drawn (the next one, so it's whole)
  function grabThumb(){
    return new Promise(res => {
      let tries = 0;
      const go = () => requestAnimationFrame(() => {
        try {
          const c = renderer.domElement, w = 240, h = Math.max(1, Math.round(w*c.height/c.width));
          const t = document.createElement('canvas'); t.width = w; t.height = h; const g = t.getContext('2d');
          g.drawImage(c, 0, 0, w, h);
          const px = g.getImageData(0, 0, w, h).data; let lit = 0; for (let i = 0; i < px.length; i += 64) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
          if (lit < 20 && ++tries < 6) return go();   // (a skipped frame reads as black: try the next)
          res(lit < 20 ? null : t.toDataURL('image/jpeg', .72));
        } catch (e) { res(null); }
      });
      go();
    });
  }
  // the active city's slot brought up to date: its keys, its card, its picture
  // (a film page, #trailer or #director, reads a city of its own: nothing it shows may ever be copied into a slot, and no slot is opened from it)
  const FILM = () => !!(window.NT_TRAILER || window.NT_DIRECTOR || window.NT_FILM2);
  async function checkpoint(opts = {}){
    if (!SL.active || FILM()) return null;
    if (!opts.noFlush) flush();
    const rec = (await getRec(SL.active)) || { id: SL.active, name: 'My city', created: Date.now() };
    rec.data = snapshot(); rec.meta = liveMeta(); rec.updated = Date.now();
    if (!opts.noThumb){ const th = await grabThumb(); if (th) rec.thumb = th; }
    await putRec(rec); SL.rev++;
    return rec;
  }
  SL.checkpoint = checkpoint;

  /* ---------- switching ---------- */
  // copy the active city away, put the chosen one in its place, and start again from it
  function swapIn(rec){
    if (FILM()) return;
    NT_SAVE_LOCK = true;   // (from here on, the way-out saves of the city just left are dropped: saveguard.js)
    for (const k of cityKeysNow()) lsDel(k);
    if (rec && rec.data) for (const [k, v] of Object.entries(rec.data)) if (NT_isCityKey(k)) lsSet(k, v);
    lsSet(ACTIVE_KEY, rec.id);
    // (the title comes up again, the chosen city loading behind it, named on its first button: title.js)
    try { sessionStorage.setItem('neonTerrarium.opening', rec.name || 'your city'); } catch (e) {}
    location.reload();
  }
  SL.open = async id => {
    if (id === SL.active){ return false; }
    let rec = await getRec(id);
    if (!rec || !rec.data){ if (SL.cloudUser){ rec = await pull(id); } }
    if (!rec) throw new Error('That city could not be found.');
    await checkpoint();
    swapIn(rec);
    return true;
  };
  SL.create = async name => {
    await checkpoint();
    const rec = { id: newId(), name: (name || '').trim().slice(0, 40) || 'New city', created: Date.now(), updated: Date.now(), meta: { day: 1, residents: 0, plots: 0 }, data: {} };
    await putRec(rec);
    swapIn(rec);
  };
  SL.rename = async (id, name) => { const rec = await getRec(id); if (!rec) return; rec.name = (name || '').trim().slice(0, 40) || rec.name; rec.updated = Date.now(); await putRec(rec); SL.rev++; if (SL.cloudUser && rec.data) push(rec).catch(() => {}); };
  SL.remove = async id => {
    if (id === SL.active) throw new Error('The city you are playing can\'t be deleted. Open another one first.');
    await delRec(id); SL.rev++;
    if (SL.cloudUser) fetch(CLOUD + '/saves/' + SL.cloudUser + '/' + id, { method: 'DELETE' }).catch(() => {});
  };
  // every city this browser knows, the active one with its card read live; cloud cities not here yet are listed too
  SL.list = async () => {
    const recs = (await allRecs()).map(r => ({ id: r.id, name: r.name, created: r.created, updated: r.updated, meta: r.meta || {}, thumb: r.thumb || null, local: !!r.data, active: r.id === SL.active }));
    const a = recs.find(r => r.active); if (a){ a.meta = liveMeta(); a.updated = Date.now(); }
    for (const c of cloudIndex) if (!recs.some(r => r.id === c.slot)) recs.push({ id: c.slot, name: c.name || 'A city', updated: c.updated, meta: { day: c.day, residents: c.residents, plots: c.plots }, thumb: null, local: false, cloud: true, active: false });
    for (const r of recs){ const c = cloudIndex.find(x => x.slot === r.id); if (c){ r.cloud = true; r.cloudNewer = r.local && !r.active && c.updated > (r.updated || 0) + 1000; } }
    return recs.sort((a, b) => (b.active - a.active) || ((b.updated || 0) - (a.updated || 0)));
  };

  /* ---------- files ---------- */
  SL.exportFile = async id => {
    const rec = id === SL.active ? await checkpoint() : await getRec(id);
    if (!rec || !rec.data) throw new Error('Nothing saved for that city yet.');
    const file = { format: 'neon-terrarium-city', v: 1, name: rec.name, created: rec.created, updated: rec.updated, meta: rec.meta, thumb: rec.thumb || null, data: rec.data };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (rec.name || 'city').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.neoncity';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  SL.importFile = async file => {
    const f = JSON.parse(await file.text());
    if (!f || f.format !== 'neon-terrarium-city' || !f.data || typeof f.data !== 'object') throw new Error('That file isn\'t a Neon Terrarium city.');
    const data = {}; for (const [k, v] of Object.entries(f.data)) if (NT_isCityKey(k) && typeof v === 'string') data[k] = v;
    const rec = { id: newId(), name: String(f.name || 'Imported city').slice(0, 40), created: f.created || Date.now(), updated: Date.now(), meta: f.meta || {}, thumb: typeof f.thumb === 'string' && f.thumb.startsWith('data:image/') ? f.thumb : null, data };
    await putRec(rec); SL.rev++;
    if (SL.cloudUser) push(rec).catch(() => {});
    return rec;
  };

  /* ---------- the cloud (placeholder) ---------- */
  let cloudIndex = [];
  const pushed = (() => { try { return JSON.parse(lsGet(PUSHED_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const sig = rec => { const s = JSON.stringify(rec.data || {}) + '|' + rec.name; let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };
  async function push(rec){
    if (!SL.cloudUser || !rec || !rec.data) return false;
    const s = sig(rec); if (pushed[rec.id] === s) return false;   // (unchanged since it last went up: the free tier counts writes)
    const body = JSON.stringify({ name: rec.name, created: rec.created, updated: rec.updated, meta: rec.meta, thumb: rec.thumb || null, data: rec.data });
    const meta = Object.assign({ name: String(rec.name).slice(0, 40) }, rec.meta || {});
    const r = await fetch(CLOUD + '/saves/' + SL.cloudUser + '/' + rec.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Meta': JSON.stringify(meta) }, body });
    if (!r.ok) throw new Error('The save server said no (' + r.status + ').');
    pushed[rec.id] = s; lsSet(PUSHED_KEY, JSON.stringify(pushed));
    const c = cloudIndex.find(x => x.slot === rec.id); if (c) c.updated = Date.now(); else cloudIndex.push(Object.assign({ slot: rec.id, updated: Date.now() }, meta));
    return true;
  }
  async function pull(id){
    const r = await fetch(CLOUD + '/saves/' + SL.cloudUser + '/' + id); if (!r.ok) throw new Error('That city is not on the save server.');
    const f = await r.json(); const data = {}; for (const [k, v] of Object.entries(f.data || {})) if (NT_isCityKey(k) && typeof v === 'string') data[k] = v;
    const rec = { id, name: String(f.name || 'A city').slice(0, 40), created: f.created || Date.now(), updated: f.updated || Date.now(), meta: f.meta || {}, thumb: typeof f.thumb === 'string' && f.thumb.startsWith('data:image/') ? f.thumb : null, data };
    await putRec(rec); pushed[id] = sig(rec); lsSet(PUSHED_KEY, JSON.stringify(pushed)); SL.rev++;
    return rec;
  }
  SL.pull = pull;
  SL.cloudRefresh = async () => {
    if (!SL.cloudUser){ cloudIndex = []; return []; }
    try { const r = await fetch(CLOUD + '/saves/' + SL.cloudUser); if (!r.ok) throw new Error(r.status); cloudIndex = await r.json(); SL.cloudErr = null; }
    catch (e) { SL.cloudErr = 'The save server can\'t be reached right now.'; }
    SL.rev++; return cloudIndex;
  };
  // every city here goes up (the ones that changed), and cities that are newer in the cloud come down
  SL.sync = async () => {
    if (!SL.cloudUser) return;
    await SL.cloudRefresh(); if (SL.cloudErr) throw new Error(SL.cloudErr);
    const act = await checkpoint({ noThumb: false });
    const recs = await allRecs();
    for (const r of recs){ if (!r.data) continue; const c = cloudIndex.find(x => x.slot === r.id); if (r.id !== SL.active && c && c.updated > (r.updated || 0) + 1000) await pull(r.id); else await push(r.id === SL.active ? act : r); }
    SL.rev++;
  };
  SL.setUser = async name => {
    const u = String(name || '').trim().toLowerCase();
    if (u && !NAME_OK.test(u)) throw new Error('Use 2 to 32 letters, numbers, - or _.');
    SL.cloudUser = u || null; if (u) lsSet(USER_KEY, u); else lsDel(USER_KEY);
    cloudIndex = []; SL.rev++;
    if (u) await SL.sync();
  };

  /* ---------- start ---------- */
  SL.ready = (async () => {
    SL.cloudUser = lsGet(USER_KEY) || null;
    let id = lsGet(ACTIVE_KEY);
    try {
      if (!FILM() && (!id || !(await getRec(id)))){   // (the first time: the city already here becomes the first slot)
        id = id || newId(); lsSet(ACTIVE_KEY, id);
        await putRec({ id, name: 'My city', created: Date.now(), updated: Date.now(), meta: { day: 1, residents: 0, plots: 0 }, data: snapshot() });
      }
    } catch (e) { console.warn('save slots: the store could not be opened', e); }
    SL.active = id;
    if (SL.cloudUser) SL.cloudRefresh();
  })();
  // every few minutes: the slot catches up with the city, and the cloud with the slot (only what changed goes up)
  setInterval(async () => {
    if (document.hidden || NT_SAVE_LOCK) return;
    try { const rec = await checkpoint(); if (rec && SL.cloudUser) await push(rec); } catch (e) {}
  }, CHECK_MS);
  return SL;
})();
window.SLOTS = SLOTS;
