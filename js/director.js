// Neon Terrarium: the trailer maker. Open the game with #dev&director at the end of the address.
//
// A trailer is a project: a copy of one of your cities (taken when the project is made) and a timeline over it.
//   - Camera keys: where the camera looks, how far it is zoomed, its turn and tilt, at a moment. Between keys the camera glides
//     (flow: a smooth curve through all the keys; ease: slows into and out of each key; linear: steady; cut: jumps at the next key).
//   - Time keys: the hour of the day at a moment; between them the day runs forward.
//   - Edits: anything you build or remove while recording (plots, floors, pods, megastructures, metro lines, highways, greenery). Each
//     is kept as the game action itself with the random numbers it drew, so playing it back builds exactly the same thing with the
//     game's own build animation.
//   - Effects: fades, flashes, glitches, cinema bars, the logo, text, the city's lights, looks, weather, the person cam, following
//     a train and opening an apartment.
// Nothing here is saved to your city or your settings (saveguard.js locks them and answers the game's reads from the project's copy
// of the city); projects live in this browser's IndexedDB (neonTerrarium.director) and can be exported as a file, which
// tools/trailer/record.py turns into a 1080p, 60 fps film.
'use strict';
const DIRECTOR = (() => {
  const D = { on: !!window.NT_DIRECTOR, ready: false, mode: 'edit', t: 0, stage: 'off', log: [], info: {}, failed: null, done: false, playing: false };
  if (!D.on) return D;
  const CAP = !!window.__TR_CAPTURE;   // (the recorder's stepped clock: no clicks, no sound, it steps the frames)
  const say = (...a) => { D.log.push(a.join(' ')); if (D.log.length > 400) D.log.shift(); console.log('[director]', ...a); };
  const warn = (what, e) => { D.log.push('! ' + what + ': ' + (e && e.message || e)); console.warn('[director] ' + what, e); };
  const safe = (what, f) => { try { return f(); } catch (e) { warn(what, e); return null; } };

  /* ---------- small maths ---------- */
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const clamp01 = x => clamp(x, 0, 1);
  const ss = x => { x = clamp01(x); return x*x*(3 - 2*x); };
  const ease = x => { x = clamp01(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
  const lerp = (a, b, u) => a + (b - a)*u;
  const DEG = Math.PI/180;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const fmt = t => { t = Math.max(0, t); const m = Math.floor(t/60), s = t - m*60; return m + ':' + s.toFixed(2).padStart(5, '0'); };
  const hhmm = h => { h = ((h % 24) + 24) % 24; const H_ = Math.floor(h), M_ = Math.round((h - H_)*60) % 60; return String(H_).padStart(2, '0') + ':' + String(M_).padStart(2, '0'); };
  const uid = () => Date.now().toString(36).slice(-5) + Math.floor(Math.random()*1e9).toString(36);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = n => { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0)/4294967296; };

  /* ---------- the project ---------- */
  const SS = window.sessionStorage;
  const sGet = k => { try { return JSON.parse(SS.getItem(k) || 'null'); } catch (e) { return null; } };
  const sSet = (k, v) => { try { SS.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch (e) { return false; } };
  function norm(p){
    p.cam = Array.isArray(p.cam) ? p.cam : []; p.hour = Array.isArray(p.hour) ? p.hour : []; p.fx = Array.isArray(p.fx) ? p.fx : []; p.edits = Array.isArray(p.edits) ? p.edits : [];
    p.len = clamp(+p.len || 30, 2, 900); if (p.music === undefined) p.music = 'Bytes.mp3'; p.musicStart = +p.musicStart || 0;
    p.fadeOut = p.fadeOut !== false; p.gameSounds = !!p.gameSounds; p.recCam = p.recCam || 'free'; p.name = p.name || 'Trailer';
    return p;
  }
  let P = window.__DIR_PROJ || sGet('ntDirector.proj');
  if (P) norm(P);
  const BOOT = window.__DIR_BOOT || sGet('ntDirector.boot') || { mode: 'edit', at: 0 };
  if (!CAP) try { SS.removeItem('ntDirector.boot'); } catch (e) {}
  const NOTE = sGet('ntDirector.note'); try { SS.removeItem('ntDirector.note'); } catch (e) {}

  // projects in this browser (the city copy is kept with each one)
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    const r = indexedDB.open('neonTerrarium.director', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('projects', mode), st = t.objectStore('projects'); const out = fn(st);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  const idbGet = id => tx('readonly', st => st.get(id));
  const idbPut = rec => tx('readwrite', st => st.put(rec));
  const idbDel = id => tx('readwrite', st => st.delete(id));
  const idbAll = () => tx('readonly', st => st.getAll());
  // the save slots (read only: slots.js stands aside on this page)
  const slotsAll = () => new Promise(res => {
    try {
      const r = indexedDB.open('neonTerrarium.slots', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('slots', { keyPath: 'id' });
      r.onsuccess = () => { try { const q = r.result.transaction('slots', 'readonly').objectStore('slots').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); } };
      r.onerror = () => res([]);
    } catch (e) { res([]); }
  });
  // the city you are playing right now (its own keys, read past the director's copy)
  function liveCity(){ const d = {}, ls = window.localStorage; for (let i = 0; i < ls.length; i++){ const k = ls.key(i); if (NT_isCityKey(k)){ const v = NT_RAW.get.call(ls, k); if (v !== null) d[k] = v; } } return d; }

  let saveTimer = 0;
  async function flush(){
    clearTimeout(saveTimer); if (!P || CAP) return;
    sSet('ntDirector.proj', P);
    try { const rec = (await idbGet(P.id)) || { id: P.id, city: NT_DIR_CITY, created: Date.now() }; rec.proj = P; rec.name = P.name; rec.updated = P.updated; rec.cityName = P.cityName; await idbPut(rec); }
    catch (e) { warn('save', e); }
  }
  function saveP(){ if (!P || CAP) return; P.updated = Date.now(); sSet('ntDirector.proj', P); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }
  const UNDO = [];
  const mark = () => { if (!P) return; UNDO.push(JSON.stringify(P)); if (UNDO.length > 100) UNDO.shift(); };
  function undo(){ const s = UNDO.pop(); if (!s) return toast('Nothing to undo'); P = norm(JSON.parse(s)); if (SEL && !findSel()) SEL = null; changed(); toast('Undone'); }
  function changed(){ saveP(); render(); pathDraw(); }

  // open a project: its city goes into this tab (the game reads it on the next load: saveguard.js), then a fresh start
  function openRec(rec, boot){
    let city = rec.city || {};
    if (!sSet('ntDirector.city', city)){
      const small = {}; for (const k of ['neonIsland.v2', 'neonIsland.megas', 'neonIsland.highways', 'neonIsland.metros', 'neonIsland.megaUnlocked', 'neonIsland.style']) if (city[k] != null) small[k] = city[k];
      if (!sSet('ntDirector.city', small)) return toast('That city is too big to open in a tab');
      sSet('ntDirector.note', 'The city was too big to keep whole in this tab: its buildings are here, its people start fresh.');
    }
    sSet('ntDirector.proj', norm(rec.proj)); sSet('ntDirector.boot', boot || { mode: 'edit', at: 0 }); location.reload();
  }
  async function reloadWith(boot){ await flush(); sSet('ntDirector.boot', boot); location.reload(); }

  /* ---------- the game, for filming ---------- */
  maybeSpawnMegas = () => {};   // (a megastructure arriving on its own would not be on the timeline: place them from the menu)
  { const _p = sfx.play; sfx.play = function (){ if (RUN.kind && RUN.kind !== 'rec' && !(P && P.gameSounds)) return; return _p.apply(this, arguments); }; }
  const _ar = applyRenderRes;
  applyRenderRes = function (z){ return _ar(D.pinRes ? (CAP ? 24 : ZOOM_REF) : z); };   // (one picture size for the whole film)
  function settle(play){
    S.cycle = false; S.idleRest = false; S.autoPerf = false; S.spin = false;
    safe('story', () => { if (STORY.engine === false) STORY.setEngine(true); });
    safe('cases', () => { if (typeof CASES !== 'undefined'){ CASES.paused = true; CASES.noStage = true; } });
    safe('speed', () => { if (typeof FF !== 'undefined' && FF.set) FF.set(1); });
    if (typeof FURN !== 'undefined') FURN.lightCity = false;
    if (play){
      safe('pixels', () => { if (RENDER_LINES !== 720) setRenderLines(720); });
      safe('weather', () => LK.setAutoWeather(false, true));
      safe('resolution', () => { ZOOM_RES = 0; D.pinRes = true; H = 0; applyRenderRes(zoom); });
      if (CAP) window.__FULL_RATE = true;
    }
  }

  /* ---------- recording edits: the game's own actions, kept with the random numbers they drew ---------- */
  const EDIT_FNS = ['applyTarget', 'removeAt', 'removeArea', 'placeFromMenu', 'mtApply', 'hwApply', 'mtCutAt', 'hwCutAt', 'cycleGreen'];
  const VERB = { applyTarget: 'build', removeAt: 'remove', removeArea: 'clear area', placeFromMenu: 'megastructure', mtApply: 'metro', hwApply: 'highway', mtCutAt: 'cut metro', hwCutAt: 'cut highway', cycleGreen: 'greenery' };
  let depth = 0, replaying = 0;
  const APPLIED = new Set();   // the edits the city on screen has in it
  const isPlain = o => { const p = Object.getPrototypeOf(o); return p === Object.prototype || p === null; };
  function ser(v, d = 0){
    if (v === null || v === undefined) return null;
    const ty = typeof v;
    if (ty === 'number') return Number.isFinite(v) ? v : null;
    if (ty === 'string' || ty === 'boolean') return v;
    if (ty !== 'object' || d > 3) return null;
    if (v.isVector3) return { $v: [v.x, v.y, v.z] };
    if (Array.isArray(v)) return v.length > 64 ? null : v.map(x => ser(x, d + 1));
    if (typeof v.i === 'number' && typeof v.j === 'number' && cells.get(ckey(v.i, v.j)) === v) return { $c: [v.i, v.j] };
    if (v.id !== undefined && megas.get(v.id) === v) return { $m: v.id };
    if (metros.includes(v)) return { $l: v.id };
    if (highways.includes(v)) return { $h: v.id };
    if (!isPlain(v)) return null;
    const o = {}; for (const k of Object.keys(v)){ const x = v[k]; if (typeof x !== 'function') o[k] = ser(x, d + 1); } return o;
  }
  class Missing extends Error {}
  function des(v){
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(des);
    if (v.$v) return new THREE.Vector3(v.$v[0], v.$v[1], v.$v[2]);
    if (v.$c){ const c = cells.get(ckey(v.$c[0], v.$c[1])); if (!c) throw new Missing('plot ' + v.$c.join(',') + ' is not there'); return c; }
    if (v.$m !== undefined){ const m = megas.get(v.$m); if (!m) throw new Missing('megastructure ' + v.$m + ' is not there'); return m; }
    if (v.$l !== undefined){ const l = metros.find(x => x.id === v.$l); if (!l) throw new Missing('metro line ' + v.$l + ' is not there'); return l; }
    if (v.$h !== undefined){ const h = highways.find(x => x.id === v.$h); if (!h) throw new Missing('highway ' + v.$h + ' is not there'); return h; }
    const o = {}; for (const k of Object.keys(v)) o[k] = des(v[k]); return o;
  }
  const sig = () => { let s = 0; for (const c of cells.values()) s += c.sections.length*7 + (c.lift ? 3 : 0) + (c.green === 'none' ? 1 : c.green === 'lush' ? 2 : 0);
    let m = 0; for (const l of metros) m += l.tiles.length + l.st.length*3 + (l.done ? 5 : 0); for (const h of highways) m += h.tiles.length + (h.done ? 5 : 0);
    return [cells.size, s, megas.size, metros.length, highways.length, m, SC_EDITS].join('|'); };
  const ctxNow = () => ({ zone: S.zone || null, style: Object.assign({}, STYLE), hwLevel, hwLanes: hwLanesPick });
  function withCtx(x, f){
    const old = ctxNow();
    try { S.zone = x.zone ?? null; Object.assign(STYLE, x.style || {}); if (x.hwLevel != null) hwLevel = x.hwLevel; if (x.hwLanes != null) hwLanesPick = x.hwLanes; return f(); }
    finally { S.zone = old.zone; Object.assign(STYLE, old.style); hwLevel = old.hwLevel; hwLanesPick = old.hwLanes; }
  }
  for (const name of EDIT_FNS){
    const orig = window[name]; if (typeof orig !== 'function'){ warn('hook', name + ' not found'); continue; }
    window[name] = function (...args){
      if (depth || replaying || RUN.kind !== 'rec'){ depth++; try { return orig.apply(this, args); } finally { depth--; } }
      const ev = { id: uid(), t: +clockT().toFixed(3), fn: name, args: args.map(a => ser(a)), ctx: ctxNow(), rnd: [] };
      const s0 = sig(), mr = Math.random;
      Math.random = function (){ const v = mr(); ev.rnd.push(v); return v; };
      depth++; let r;
      try { r = orig.apply(this, args); } finally { depth--; Math.random = mr; }
      if ((r !== null && r !== undefined && r !== false) || sig() !== s0){ P.edits.push(ev); APPLIED.add(ev.id); REC.dirty = true; }
      return r;
    };
  }
  function editLabel(e){
    let where = '';
    const find = v => { if (!v || typeof v !== 'object' || where) return; if (v.$c) where = v.$c.join(','); else if (typeof v.i === 'number' && typeof v.j === 'number') where = v.i + ',' + v.j; else for (const k of Object.keys(v)) find(v[k]); };
    for (const a of e.args || []) find(a);
    let verb = VERB[e.fn] || e.fn;
    if (e.fn === 'placeFromMenu' && typeof e.args[0] === 'string') verb = e.args[0];
    if ((e.fn === 'mtApply' || e.fn === 'hwApply') && e.args[0] && e.args[0].type) verb += ' ' + e.args[0].type;
    if (e.fn === 'applyTarget' && e.ctx && e.ctx.zone && ZONES[e.ctx.zone]) verb += ' ' + (ZONES[e.ctx.zone].name || e.ctx.zone);
    return verb + (where ? ' at ' + where : '');
  }
  function runEdit(e){
    const f = window[e.fn]; if (typeof f !== 'function') return false;
    let args; try { args = e.args.map(des); } catch (er){ warn('skipped ' + editLabel(e), er.message); return false; }
    const tape = e.rnd || []; let k = 0; const mr = Math.random;
    Math.random = function (){ return k < tape.length ? tape[k++] : mr(); };
    replaying++;
    try { withCtx(e.ctx || {}, () => f.apply(null, args)); APPLIED.add(e.id); return true; }
    catch (er){ warn(editLabel(e), er); return false; }
    finally { replaying--; Math.random = mr; }
  }
  function settleAnims(){ safe('finish builds', () => { stageFinishAll(); let n = 0; while (anims.length && n++ < 20000) endAnim(anims.length - 1); }); }
  const editsSorted = () => P.edits.slice().sort((a, b) => a.t - b.t);
  function applyUpTo(at){ let n = 0; for (const e of editsSorted()) if (e.t < at){ runEdit(e); settleAnims(); n++; } if (n) say('applied', n, 'edits before', fmt(at)); }
  const outOfSync = at => P.edits.filter(e => (e.t < at) !== APPLIED.has(e.id)).length;

  /* ---------- the camera path ---------- */
  const keysSorted = arr => arr.slice().sort((a, b) => a.t - b.t);
  function camPose(t){
    const K = keysSorted(P.cam), n = K.length; if (!n) return null;
    const yw = []; K.forEach((k, i) => yw.push(i ? yw[i - 1] + wrapA(k.yaw - yw[i - 1]) : k.yaw));   // (each turn the short way round)
    const val = (i, c) => c === 0 ? K[i].x : c === 1 ? K[i].y : c === 2 ? K[i].z : c === 3 ? yw[i] : c === 4 ? K[i].pitch : Math.log(Math.max(.5, K[i].zoom));
    const out = v => ({ x: v[0], y: v[1], z: v[2], yaw: v[3], pitch: v[4], zoom: Math.exp(v[5]) });
    const at = i => out([0, 1, 2, 3, 4, 5].map(c => val(i, c)));
    if (t <= K[0].t) return at(0);
    if (t >= K[n - 1].t) return at(n - 1);
    let i = 0; while (i < n - 2 && t >= K[i + 1].t) i++;
    const a = K[i], b = K[i + 1], dt = Math.max(1e-6, b.t - a.t), u = clamp01((t - a.t)/dt), mode = a.ease || 'flow';
    if (mode === 'cut') return at(i);
    if (mode === 'linear' || mode === 'ease'){ const w = mode === 'ease' ? ease(u) : u; return out([0, 1, 2, 3, 4, 5].map(c => lerp(val(i, c), val(i + 1, c), w))); }
    // flow: a curve through every key at a steady pace (cubic Hermite, each key's slope from its neighbours; the first and last start and stop gently)
    const tan = (j, c) => (j <= 0 || j >= n - 1 || (K[j - 1].ease || 'flow') === 'cut') ? 0 : (val(j + 1, c) - val(j - 1, c))/Math.max(1e-6, K[j + 1].t - K[j - 1].t);
    const u2 = u*u, u3 = u2*u, h00 = 2*u3 - 3*u2 + 1, h10 = u3 - 2*u2 + u, h01 = -2*u3 + 3*u2, h11 = u3 - u2;
    const endsHere = (b.ease || 'flow') !== 'flow' && i + 1 < n - 1;   // (a key whose next stretch isn't a flow is arrived at gently)
    return out([0, 1, 2, 3, 4, 5].map(c => h00*val(i, c) + h10*dt*tan(i, c) + h01*val(i + 1, c) + h11*dt*(endsHere ? 0 : tan(i + 1, c))));
  }
  const curPose = () => ({ x: camT.x, y: camT.y, z: camT.z, yaw, pitch: PITCH, zoom });
  function applyPose(p){
    camGoal.set(p.x, p.y, p.z); camT.copy(camGoal);
    yaw = yawT = p.yaw; zoom = zoomT = clamp(p.zoom, 1, 400); PITCH = pitchT = clamp(p.pitch, 2*DEG, 89*DEG);
  }
  function hourAt(t){
    const K = keysSorted(P.hour), n = K.length; if (!n) return null;
    if (t <= K[0].t) return K[0].h;
    if (t >= K[n - 1].t) return K[n - 1].h;
    let i = 0; while (i < n - 2 && t >= K[i + 1].t) i++;
    const a = K[i], b = K[i + 1]; let hb = b.h; while (hb < a.h) hb += 24;   // (the day runs forward: 22:00 to 02:00 goes through midnight)
    return (lerp(a.h, hb, ss((t - a.t)/Math.max(1e-6, b.t - a.t))) % 24 + 24) % 24;
  }
  const FLICK = [[0, 0], [.08, .35], [.14, 0], [.3, .55], [.36, .1], [.5, .8], [.56, .35], [.7, 1], [.78, .7], [.86, 1]];
  function lightsAt(t){
    let f = null; for (const x of keysSorted(P.fx.filter(x => x.type === 'lights'))) if (x.t <= t) f = x;
    if (!f || f.mode === 'auto') return null;
    if (f.mode === 'off') return 0;
    if (f.mode === 'on') return 1;
    const u = (t - f.t)/Math.max(.05, f.d); if (u >= 1) return 1;
    if (f.mode === 'rise') return clamp01(u);   // (each light has its own switch-on point: sweeping through them lights the city one by one, as the game does at dusk)
    let v = 0; for (const [k, a] of FLICK) if (u >= k) v = a; return v;
  }
  function personOf(f, used){
    if (RUN.frozen && RUN.frozen.has(f.id)){ const q = people.get(RUN.frozen.get(f.id)); if (q) return q; }
    let p = f.who != null ? people.get(f.who) : null;
    if (!p && f.x != null){ let best = null; for (const q of people.values()){ if (q.x === undefined || (used && used.has(q.id))) continue; const d = Math.hypot(q.x - f.x, q.z - f.z); if (!best || d < best.d) best = { q, d }; } if (best && best.d < 12) p = best.q; }
    return p || null;
  }
  function followPos(f){
    if (f.type === 'person'){ const p = personOf(f); if (!p || p.x === undefined || (p.sc && p.sc.mode === 'in')) return null; return { x: p.x, y: (p._ey ?? CURB) + .5, z: p.z }; }
    if (f.type === 'train'){ const l = metros.find(x => x.id === f.line), cp = l && l.train && l.train.cp && l.train.cp[1]; return cp ? { x: cp[0], y: cp[1], z: cp[2] } : null; }
    return null;
  }
  function driveAt(t){
    const h = hourAt(t); if (h !== null){ if (!CAP && Math.abs(h - S.hour) > 1e-4) window.HOUR_DRAG_AT = performance.now(); S.hour = h; }
    const lv = lightsAt(t); if (lv !== null) LIGHTS_ON.value = lv;
    let p = camPose(t);
    for (const f of P.fx){
      if (!((f.type === 'person' && f.follow) || f.type === 'train') || t < f.t || t > f.t + f.d) continue;
      const g = followPos(f); if (!g) continue;
      const w = ss(Math.min(1, (t - f.t)/.6, (f.t + f.d - t)/.6));
      if (!p) p = curPose();
      p = Object.assign({}, p, { x: lerp(p.x, g.x, w), y: lerp(p.y, g.y, w), z: lerp(p.z, g.z, w) });
    }
    if (p) applyPose(p);
  }
  // a driven train: put on its line from the effect's clock, so where it is at any moment is the same live, in the recorder and when scrubbing
  const _um = updateMetros;
  updateMetros = function (dt, t){
    if (P) safe('drive train', () => {
      const now = RUN.kind && RUN.kind !== 'rec' ? clockT() : D.t;
      for (const f of P.fx){
        if (f.type !== 'train' || f.drive === false || now < f.t || now > f.t + f.d) continue;
        const l = metros.find(x => x.id === f.line); if (!l || !l.train) continue;
        const tr = l.train, Pm = mtPath(l), stops = Pm.stops || [];
        tr.dwell = 0; tr.at = 0; tr.next = Math.max(0, stops.length - 1); tr.dir = 1; tr.v = 0; tr.doors = 0;
        tr.s = clamp(((+f.from || 0) + (+f.speed || 0)*(now - f.t))*LOT, .5, Pm.len - .5);
      }
    });
    return _um(dt, t);
  };
  const _uc = updateCamera;
  updateCamera = function (dt){
    if (RUN.kind === 'play' || RUN.kind === 'preview') safe('drive', () => driveAt(clockT()));
    else if (RUN.kind === 'rec' && P.recCam === 'path'){ const p = camPose(clockT()); if (p) safe('drive', () => applyPose(p)); }
    return _uc(dt);
  };

  /* ---------- the camera path drawn in the city while editing ---------- */
  const PATH = { line: null, marks: [], mat: null, mk: null, geo: null };
  function pathDraw(){
    if (PATH.line){ scene.remove(PATH.line); PATH.line.geometry.dispose(); PATH.line = null; }
    for (const m of PATH.marks) scene.remove(m); PATH.marks = [];
    if (!P || D.mode !== 'edit' || RUN.kind === 'preview' || RUN.kind === 'play' || !P.cam.length || !UI.showPath) return;
    const K = keysSorted(P.cam), t0 = K[0].t, t1 = K[K.length - 1].t, n = Math.max(2, Math.min(600, Math.ceil((t1 - t0)*24)));
    const pts = []; for (let i = 0; i <= n; i++){ const p = camPose(t0 + (t1 - t0)*i/n); pts.push(p.x, p.y, p.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    PATH.mat = PATH.mat || new THREE.LineBasicMaterial({ color: 0x38e8e0, transparent: true, opacity: .95, depthTest: false, depthWrite: false });
    PATH.line = new THREE.Line(g, PATH.mat); PATH.line.layers.set(1); PATH.line.renderOrder = 999; PATH.line.frustumCulled = false; scene.add(PATH.line);
    PATH.geo = PATH.geo || new THREE.OctahedronGeometry(1, 0);
    PATH.mk = PATH.mk || new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: .95, depthTest: false, depthWrite: false });
    PATH.mkSel = PATH.mkSel || new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
    for (const k of K){ const m = new THREE.Mesh(PATH.geo, SEL && SEL.k === 'cam' && SEL.id === k.id ? PATH.mkSel : PATH.mk); m.position.set(k.x, k.y, k.z); m.layers.set(1); m.renderOrder = 1000; m.userData.key = k.id; scene.add(m); PATH.marks.push(m); }
    markScale();
  }
  function markScale(){ const s = zoom*.018; for (const m of PATH.marks) m.scale.setScalar(s); }

  /* ---------- the overlay: fades, flashes, bars, glitches, the logo, text, the person cam's brackets ---------- */
  const OV = {};
  const NEONC = { pink: ['#ffd9ee', '#ff4fa3', 'rgba(255,79,163,'], cyan: ['#d8fffd', '#38e8e0', 'rgba(56,232,224,'], amber: ['#fff0d6', '#ffb347', 'rgba(255,179,71,'], white: ['#ffffff', '#cfe8ff', 'rgba(207,232,255,'] };
  const glow = c => `0 0 6px ${c[1]},0 0 18px ${c[1]},0 0 44px ${c[2]}.7),0 0 90px ${c[2]}.35)`;
  const NEON = [[0, 0], [.05, 1], [.09, .15], [.15, 1], [.22, .35], [.27, 1], [.4, .7], [.46, 1]];
  const neonAt = u => { if (u < 0) return 0; let v = 0; for (const [k, a] of NEON) if (u >= k) v = a; return v; };
  const GLCOL = ['rgba(56,232,224,.85)', 'rgba(255,79,163,.85)', 'rgba(255,255,255,.9)', 'rgba(0,0,0,.9)', 'rgba(140,90,255,.8)'];
  function bands(f){ const n = 3 + Math.floor(hash(f*7 + 3)*5); let y = 0; const out = []; for (let k = 0; k < n && y < 100; k++){ const a = y + hash(f*11 + k)*16, b = Math.min(100, a + 4 + hash(f*13 + k)*22); out.push(`0 ${a}%,100% ${a}%,100% ${b}%,0 ${b}%`); y = b; } return out.length ? 'polygon(' + out.join(',') + ',0 100%,0 0)' : ''; }
  function overlay(){
    const st = document.createElement('style'); st.id = 'drStyle';
    st.textContent = `
      html.dr-clean body > *:not(#view):not(#furnish):not(#drOv):not(#drMini):not(#drCard):not(#drToast):not(.dr-keep){visibility:hidden!important}
      html.dr-clean #cctv, html.dr-clean #cctvFade{display:none!important}
      html.dr-play, html.dr-play *{cursor:none!important}
      html.dr-play #drCard, html.dr-play #drCard *{cursor:pointer!important}
      html.dr-clean #monitor.dr-keep{transform:scale(1.4);transform-origin:top right;top:32px!important;right:36px!important;max-height:calc((100vh - 64px)/1.4)!important;overflow:hidden}
      #drOv{position:fixed;inset:0;z-index:9001;pointer-events:none}
      #drOv > i{position:absolute;inset:0;display:block;opacity:0}
      #drBarT,#drBarB{position:absolute;left:0;right:0;height:0;background:#000}
      #drBarT{top:0} #drBarB{bottom:0}
      #drSel{position:absolute;left:0;top:0;width:0;height:0;display:none;pointer-events:none}
      #drSel b{position:absolute;width:22px;height:22px;border:3px solid #38e8e0;filter:drop-shadow(0 0 6px rgba(56,232,224,.9))}
      #drSel b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #drSel b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #drSel b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #drSel b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #drSel i{position:absolute;left:50%;top:-14px;width:8px;height:8px;margin-left:-4px;background:#ff4fa3;transform:rotate(45deg);box-shadow:0 0 10px #ff4fa3}
      #drLogo,#drText{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:2.04vh;font-family:Silkscreen,ui-monospace,monospace;font-weight:400;text-transform:uppercase;text-align:center}
      #drLogo b,#drText b{display:block;font-weight:400;line-height:1;opacity:0}
      #drLogo .w1{font-size:12.2vh;letter-spacing:.16em;color:#ffd9ee;text-shadow:${glow(NEONC.pink)}}
      #drLogo .w2{font-size:5.4vh;letter-spacing:.42em;margin-right:-.42em;color:#d8fffd;text-shadow:${glow(NEONC.cyan)}}
      #drText b{letter-spacing:.14em;max-width:86vw}
      #drGl{position:absolute;inset:0;pointer-events:none}
      #drGl b{position:absolute;left:0;right:0;display:none}
      #drGl i{position:absolute;inset:0;opacity:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.55) 0 1px,transparent 1px 3px)}
      #drCard{position:fixed;inset:0;z-index:9600;display:grid;place-content:center;justify-items:center;gap:14px;background:rgba(4,6,14,.55);font:13px/1.6 "JetBrains Mono",ui-monospace,monospace;color:#9fdcff;text-align:center;letter-spacing:.06em}
      #drCard[hidden]{display:none}
      #drCard b{font-family:Silkscreen,ui-monospace,monospace;font-weight:400;font-size:22px;letter-spacing:.14em;color:#38e8e0}
      #drCard .row{display:flex;gap:10px}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'drOv';
    ov.innerHTML = '<i id="drBlack"></i><i id="drFlash"></i><div id="drBarT"></div><div id="drBarB"></div><div id="drSel"><b></b><b></b><b></b><b></b><i></i></div><div id="drGl">' + '<b></b>'.repeat(10) + '<i></i></div>'
      + '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="drRGB" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset id="drRo" in="r" dx="6" dy="0" result="ro"/>'
      + '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="gb"/><feOffset id="drGo" in="gb" dx="-6" dy="0" result="gbo"/>'
      + '<feBlend in="ro" in2="gbo" mode="screen"/></filter></svg>'
      + '<div id="drLogo"><b class="w1">Neon</b><b class="w2">Terrarium</b></div><div id="drText"><b></b></div>';
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    Object.assign(OV, { ov, black: q('#drBlack'), flash: q('#drFlash'), barT: q('#drBarT'), barB: q('#drBarB'), sel: q('#drSel'), logo: q('#drLogo'), w1: q('.w1'), w2: q('.w2'),
      text: q('#drText b'), gl: [...ov.querySelectorAll('#drGl b')], scan: q('#drGl i'), ro: q('#drRo'), go: q('#drGo') });
    OV.black.style.background = '#000'; OV.flash.style.background = '#e8fbff';
    const card = document.createElement('div'); card.id = 'drCard'; card.hidden = true; document.body.appendChild(card); OV.card = card;
  }
  let glOn = false;
  function glitchOff(){
    if (!glOn) return; glOn = false;
    for (const b of OV.gl) b.style.display = 'none'; OV.scan.style.opacity = '0';
    for (const el of [document.getElementById('view'), document.getElementById('furnish')]) if (el){ el.style.transform = ''; el.style.filter = ''; el.style.clipPath = ''; }
  }
  function glitchAt(t, g){
    if (g <= 0) return glitchOff();
    glOn = true; const f = Math.floor(t*30);
    const jx = (hash(f*5 + 4) - .5)*110*g, split = (5 + 16*g*hash(f*5 + 6)).toFixed(1), rgb = g > .2 && hash(f*5 + 7) < .8;
    OV.ro.setAttribute('dx', split); OV.go.setAttribute('dx', '-' + split);
    for (const el of [document.getElementById('view'), document.getElementById('furnish')]) if (el){
      el.style.transform = `translateX(${jx.toFixed(1)}px)`; el.style.filter = rgb ? 'url(#drRGB) saturate(1.3)' : ''; el.style.clipPath = hash(f*5 + 8) < .3*g ? bands(f) : ''; }
    OV.gl.forEach((b, k) => {
      const on = hash(f*17 + k*3) < g*.75; b.style.display = on ? 'block' : 'none'; if (!on) return;
      b.style.top = (hash(f*19 + k)*100).toFixed(1) + '%'; b.style.height = (2 + hash(f*23 + k)*Math.max(4, 46*g)).toFixed(0) + 'px';
      b.style.background = GLCOL[Math.floor(hash(f*29 + k)*GLCOL.length)]; b.style.mixBlendMode = hash(f*31 + k) < .5 ? 'difference' : 'screen';
      b.style.transform = `translateX(${((hash(f*37 + k) - .5)*240*g).toFixed(0)}px)`; b.style.opacity = (.35 + .6*hash(f*41 + k)).toFixed(2);
    });
    OV.scan.style.opacity = (.25 + .35*g).toFixed(2);
  }
  const fxOf = type => keysSorted(P.fx.filter(f => f.type === type));
  const within = (f, t) => t >= f.t && t < f.t + f.d;
  function paint(t, on){
    if (!on){
      OV.black.style.opacity = '0'; OV.flash.style.opacity = '0'; OV.barT.style.height = OV.barB.style.height = '0';
      OV.w1.style.opacity = OV.w2.style.opacity = '0'; OV.text.style.opacity = '0'; OV.sel.style.display = 'none'; glitchOff(); return;
    }
    let fade = 0, fcol = '#000';
    for (const f of fxOf('fade')) if (f.t <= t){ const u = clamp01((t - f.t)/Math.max(.01, f.d)); fade = f.dir === 'out' ? ss(u) : 1 - ss(u); fcol = f.color === 'white' ? '#f4fbff' : '#000'; }
    OV.black.style.background = fcol; OV.black.style.opacity = String(fade);
    let fl = 0; for (const f of fxOf('flash')) if (within(f, t)) fl = Math.max(fl, 1 - (t - f.t)/Math.max(.02, f.d));
    OV.flash.style.opacity = String(fl);
    let bars = 0; for (const f of fxOf('bars')) if (within(f, t)){ const k = Math.min(1, (t - f.t)/.6, (f.t + f.d - t)/.6); bars = Math.max(bars, (+f.size || 10)*ss(k)); }
    OV.barT.style.height = OV.barB.style.height = bars.toFixed(2) + 'vh';
    let l1 = 0, l2 = 0;
    for (const f of fxOf('logo')) if (within(f, t)){ const out = f.t + f.d - t < .6 ? ss((f.t + f.d - t)/.6) : 1; l1 = neonAt(t - f.t)*out; l2 = neonAt(t - f.t - .35)*out; }
    OV.w1.style.opacity = String(l1); OV.w2.style.opacity = String(l2);
    let tx = null; for (const f of fxOf('text')) if (within(f, t)) tx = f;
    if (tx){
      const c = NEONC[tx.color] || NEONC.cyan, out = tx.t + tx.d - t < .5 ? ss((tx.t + tx.d - t)/.5) : 1;
      if (OV.text.textContent !== (tx.text || '')) OV.text.textContent = tx.text || '';
      OV.text.style.fontSize = ((+tx.size || 64)/10.8).toFixed(2) + 'vh'; OV.text.style.color = c[0]; OV.text.style.textShadow = glow(c);
      OV.text.style.opacity = String(neonAt(t - tx.t)*out);
    } else OV.text.style.opacity = '0';
    let g = 0; for (const f of fxOf('glitch')) if (within(f, t)) g = Math.max(g, (.3 + .7*Math.sin(Math.PI*clamp01((t - f.t)/f.d)))*clamp(+f.power || 1, .1, 2));
    glitchAt(t, Math.min(1.4, g));
  }
  const _v = new THREE.Vector3();
  function brackets(t){
    let p = null; for (const f of P.fx) if (f.type === 'person' && f.brackets !== false && within(f, t)) p = personOf(f);
    const E = OV.sel;
    if (!p || p.x === undefined || (p.sc && p.sc.mode === 'in')){ E.style.display = 'none'; return; }
    _v.set(p.x, (p._ey ?? CURB) + .42, p.z).project(cam);
    const x = (_v.x + 1)/2*innerWidth, y = (1 - _v.y)/2*innerHeight, hpx = 1.0/(2*zoom)*innerHeight, w = hpx*.72, h = hpx*1.12;
    E.style.display = 'block'; E.style.transform = `translate(${(x - w/2).toFixed(1)}px,${(y - h/2).toFixed(1)}px)`; E.style.width = w.toFixed(0) + 'px'; E.style.height = h.toFixed(0) + 'px';
  }
  const keepEl = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('dr-keep', on); };

  /* ---------- Furnish pod, for the apartment effect ---------- */
  const labWin = () => { const f = FURN.frame || document.querySelector('#furnish iframe'); return f && f.contentWindow; };
  const labB = () => { const w = labWin(); return w && w.PodBuilder && w.PodBuilder._B; };
  function labClean(){
    const w = labWin(); if (!w || !w.document || !w.document.head) return;
    const d = w.document;
    if (!d.getElementById('drLab')){ const st = d.createElement('style'); st.id = 'drLab'; st.textContent = 'body *{visibility:hidden!important}.dr-vis{visibility:visible!important}*{cursor:none!important}'; d.head.appendChild(st); }
    const big = w.innerWidth*w.innerHeight*.45;
    for (const cv of d.querySelectorAll('canvas')){ const r = cv.getBoundingClientRect(); cv.classList.toggle('dr-vis', r.width*r.height > big); }
  }
  function labSharp(){
    const B = labB(); if (!B || !B.dr || B.dr._drSharp) return;
    const R = B.dr, render_ = R.render.bind(R); R._drSharp = true;
    R.render = (sc, c) => { const m = sc && sc.children && sc.children[0] && sc.children[0].material, u = m && m.uniforms;
      if (u && u.kMin && u.range && u.hazeK){ u.kMin.value = 0; u.range.value = 1e6; u.hazeK.value = Math.min(u.hazeK.value, .25); }
      return render_(sc, c); };
  }
  function labExit(){
    const w = labWin(), b = w && w.document && w.document.getElementById('ntExit');
    if (b) b.click(); else FURN.close();
    setTimeout(() => { if (FURN.open || FURN.hold) FURN.close(); }, 900);
  }
  const homeKey = h => h && h.cell ? h.cell[0] + ',' + h.cell[1] + '|' + h.section + '|' + h.floor : null;

  /* ---------- the music ---------- */
  const AU = { ctx: null, buf: null, name: null, src: null, start: null, list: [] };
  async function loadMusic(){
    if (!P || !P.music){ AU.buf = null; AU.name = null; return; }
    if (AU.name === P.music && AU.buf) return;
    AU.ctx = AU.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const r = await fetch('assets/audio/music/' + encodeURIComponent(P.music)); if (!r.ok) throw new Error('no ' + P.music);
    AU.buf = await AU.ctx.decodeAudioData(await r.arrayBuffer()); AU.name = P.music;
  }
  function musicStart(t0){
    musicStop(); if (CAP || !AU.buf || !AU.ctx) return;
    const ctx = AU.ctx; if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = AU.buf; src.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime + .06, off = P.musicStart + t0;
    if (P.fadeOut && RUN.kind !== 'rec'){ const end = now + (P.len - t0); g.gain.setValueAtTime(1, Math.max(now, end - 1.8)); g.gain.linearRampToValueAtTime(0, end); }
    if (off < AU.buf.duration){ src.start(now, Math.max(0, off)); AU.src = src; AU.start = now; }
  }
  function musicStop(){ try { if (AU.src) AU.src.stop(); } catch (e) {} AU.src = null; AU.start = null; }

  /* ---------- running: play (the whole film, every edit), preview (camera, time and effects only), record ---------- */
  const RUN = { kind: null, t0: 0, wall0: 0, ev: [], k: 0, open: new Map() };
  const REC = { open: new Map(), lastCam: -1, lastPose: null, lastHour: 0, lastHourT: -1, movedT: 0, hourOn: false, dirty: false, lastRender: 0 };
  function clockT(){
    if (!RUN.kind) return D.t;
    if (AU.start !== null && AU.ctx && AU.src) return RUN.t0 + Math.max(0, AU.ctx.currentTime - AU.start);
    return RUN.t0 + (performance.now() - RUN.wall0)/1000;
  }
  const STATEFUL = new Set(['person', 'train', 'apartment', 'look', 'weather']);
  function fxStart(f, instant){
    if (f.type === 'look') return safe('look', () => LK.setPick(f.look || 'auto', !!instant));
    if (f.type === 'weather') return safe('weather', () => LK.setWeather(f.weather || 'clear', !!instant, true));
    if (f.type === 'person'){ const p = personOf(f); if (!p) return warn('person cam', 'nobody to watch'); RUN.open.set(f.id, p.id); if (f.panel !== false){ D.self = true; try { MON.open(p.id); } finally { D.self = false; } keepEl('monitor', true); } return; }
    if (f.type === 'apartment'){ if (!f.key) return; D.self = true; try { if (FURN.openKey(f.key)) RUN.open.set(f.id, true); else warn('apartment', 'did not open ' + f.key); } finally { D.self = false; } }
  }
  function fxEnd(f){
    if (f.type === 'person' && RUN.open.has(f.id)){ RUN.open.delete(f.id); if (f.panel !== false){ safe('person cam', () => MON.close()); keepEl('monitor', false); } }
    if (f.type === 'apartment' && RUN.open.has(f.id)){ RUN.open.delete(f.id); safe('apartment', labExit); }
  }
  function buildEvents(at, kind){
    const E = [];
    if (kind === 'play') for (const e of P.edits) if (e.t >= at) E.push({ t: e.t, o: 1, f: () => runEdit(e), name: editLabel(e) });
    for (const f of P.fx){
      if (!STATEFUL.has(f.type) || f.type === 'train') continue;
      if (f.type === 'apartment' && kind !== 'play') continue;
      if (f.type === 'look' || f.type === 'weather'){ E.push({ t: Math.max(at, f.t), o: 1, f: () => fxStart(f, f.t < at), name: f.type }); continue; }
      if (f.t + f.d <= at) continue;
      E.push({ t: Math.max(at, f.t), o: 1, f: () => fxStart(f), name: f.type + ' starts' }); E.push({ t: f.t + f.d, o: 0, f: () => fxEnd(f), name: f.type + ' ends' });
    }
    return E.sort((a, b) => a.t - b.t || a.o - b.o);
  }
  // people held in place for their person cam: picked when the film (or preview) starts, so the same person is there when the cam gets to them
  function freezePick(t0){
    RUN.frozen = new Map(); const used = new Set();
    for (const f of keysSorted(P.fx)){ if (f.type !== 'person' || !f.freeze || f.t + f.d <= t0) continue;
      const p = personOf(f, used); if (!p){ warn('keep in place', 'nobody near ' + (f.who || 'the spot')); continue; }
      RUN.frozen.set(f.id, p.id); used.add(p.id); }
  }
  function freezeTick(t){
    if (!RUN.frozen || !RUN.frozen.size) return;
    for (const f of P.fx){ const id = RUN.frozen.get(f.id); if (id === undefined || t > f.t + f.d) continue;
      const p = people.get(id); if (!p) continue;
      if (p.walk) p.pause = Math.max(p.pause || 0, pplNow + .4);   // (a paused walker stands and idles where it is: people.js)
      p.until = Math.max(p.until || 0, pplNow + 6);                 // (and whoever is standing at a spot stays there)
    }
  }
  function startRun(kind, t0){
    RUN.kind = kind; RUN.t0 = t0; RUN.wall0 = performance.now(); RUN.k = 0; RUN.open = new Map();
    if (kind === 'play' || kind === 'preview') freezePick(t0); else RUN.frozen = null;
    RUN.ev = kind === 'rec' ? [] : buildEvents(t0, kind);
    D.t = t0; D.playing = kind === 'play'; D.done = false;
    document.documentElement.classList.toggle('dr-clean', kind === 'play' || kind === 'preview');
    document.documentElement.classList.toggle('dr-play', kind === 'play');
    safe('game music', () => music.hold(true));
    if (kind !== 'rec') pathDraw();
    musicStart(t0);
    uiMode();
  }
  function stopRun(){
    const kind = RUN.kind; if (!kind) return;
    for (const f of P.fx) if (RUN.open.has(f.id)) fxEnd(f);
    if (kind === 'rec') recStop();
    RUN.kind = null; RUN.frozen = null; D.playing = false; musicStop();
    paint(0, false); OV.sel.style.display = 'none';
    document.documentElement.classList.remove('dr-clean', 'dr-play');
    safe('game music', () => music.hold(false));
    D.mode = 'edit'; pathDraw(); uiMode(); render();
  }
  function endRun(){
    const kind = RUN.kind;
    if (kind === 'play'){
      D.done = true; D.playing = false; say('done');
      for (const f of P.fx) if (RUN.open.has(f.id)) fxEnd(f);
      RUN.kind = null; musicStop(); if (CAP) return;
      card('<b>The end</b><span>' + fmt(P.len) + '</span><div class="row"><button class="dr-btn" data-c="edit">Back to editing</button><button class="dr-btn" data-c="again">Play again</button></div>', a => {
        if (a === 'again') return reloadWith({ mode: 'play', at: 0 });
        document.documentElement.classList.remove('dr-clean', 'dr-play'); paint(0, false); D.mode = 'edit'; D.t = P.len; pathDraw(); uiMode(); render();
      });
      return;
    }
    D.t = P.len; stopRun();
  }
  function tick(){
    requestAnimationFrame(tick);
    if (!P) return;
    if (!RUN.kind){ if (D.mode === 'edit' && PATH.marks.length) markScale(); return; }
    const t = clockT(); D.t = t;
    if (RUN.kind !== 'rec' && t >= P.len){ D.t = P.len; paint(P.len - 1e-3, true); return endRun(); }
    while (RUN.k < RUN.ev.length && RUN.ev[RUN.k].t <= t){ const e = RUN.ev[RUN.k++]; safe(e.name, e.f); if (RUN.kind === 'play') D.log.push(t.toFixed(2) + ' ' + e.name); }
    if (RUN.kind === 'rec') recTick(t);
    else {
      paint(t, true); brackets(t); freezeTick(t);
      if (FURN.open && [...RUN.open.keys()].some(id => (P.fx.find(f => f.id === id) || {}).type === 'apartment')){ safe('lab', labClean); safe('sharp', labSharp); }
    }
    uiTime();
  }

  /* ---------- recording ---------- */
  function recFx(type, params){
    const t = clockT();
    const old = REC.open.get(type); if (old){ old.d = Math.max(.3, t - old.t); REC.open.delete(type); }
    const f = Object.assign({ id: uid(), type, t: +t.toFixed(3), d: .5 }, FX[type].params, params);
    P.fx.push(f); if (type === 'person' || type === 'apartment') REC.open.set(type, f); REC.dirty = true;
    return f;
  }
  { const _mo = MON.open;
    MON.open = function (id){ const r = _mo.apply(this, arguments); if (RUN.kind === 'rec' && !D.self){ const p = people.get(id); recFx('person', { who: id, follow: false, x: p && p.x, z: p && p.z }); } return r; }; }
  { const _sp = LK.setPick; LK.setPick = function (id){ const r = _sp.apply(this, arguments); if (RUN.kind === 'rec' && !D.self && !replaying) recFx('look', { look: id }); return r; }; }
  { const _sw = LK.setWeather; LK.setWeather = function (s, instant, noSave){ const r = _sw.apply(this, arguments); if (RUN.kind === 'rec' && !D.self && !replaying && !noSave) recFx('weather', { weather: s }); return r; }; }
  function recStart(){
    mark();
    REC.open.clear(); REC.lastCam = -1; REC.lastPose = null; REC.lastHour = S.hour; REC.lastHourT = -1; REC.movedT = 0; REC.hourOn = false; REC.dirty = false;
    if (P.recCam === 'record'){ P.cam = P.cam.filter(k => k.t < D.t); }
    startRun('rec', D.t);
    if (P.recCam === 'record') addCamKey(D.t, true);
    say('recording from', fmt(D.t));
  }
  function recTick(t){
    // what was opened while recording closes when the game closes it
    const pf = REC.open.get('person'); if (pf){ pf.d = Math.max(.3, t - pf.t); if (MON.id !== pf.who) REC.open.delete('person'); }
    const af = REC.open.get('apartment'); if (af){ af.d = Math.max(.3, t - af.t); if (!FURN.open && !FURN.hold) REC.open.delete('apartment'); }
    else if (FURN.open && FURN.home) recFx('apartment', { key: homeKey(FURN.home) });
    // the hour, when you change it (a jump from one frame to the next: the game's own clock creeps far slower than that)
    const hk = (tt, hh) => { P.hour.push({ id: uid(), t: +tt.toFixed(3), h: +hh.toFixed(3) }); REC.lastHourT = tt; REC.dirty = true; };
    const dh = Math.abs(wrapA((S.hour - REC.lastHour)/12*Math.PI))*12/Math.PI;
    if (dh > .008){
      if (!REC.hourOn){ REC.hourOn = true; hk(Math.max(RUN.t0, t - .02), REC.lastHour); }
      REC.movedT = t; if (t - REC.lastHourT > .25) hk(t, S.hour);
    } else if (REC.hourOn && t - REC.movedT > .3){ REC.hourOn = false; hk(t, S.hour); }
    REC.lastHour = S.hour;
    // the camera, if it's being recorded
    if (P.recCam === 'record' && t - REC.lastCam > .35){
      const p = curPose(), q = REC.lastPose;
      if (!q || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > .05 || Math.abs(wrapA(p.yaw - q.yaw)) > .004 || Math.abs(p.pitch - q.pitch) > .003 || Math.abs(Math.log(p.zoom/q.zoom)) > .004){ addCamKey(t, true); REC.dirty = true; }
    }
    if (REC.dirty && performance.now() - REC.lastRender > 250){ REC.dirty = false; REC.lastRender = performance.now(); render(); }
  }
  function recStop(){
    const t = clockT();
    for (const f of REC.open.values()) f.d = Math.max(.3, t - f.t); REC.open.clear();
    if (P.recCam === 'record') addCamKey(t, true);
    if (t > P.len) P.len = Math.ceil(t*2)/2;
    D.t = Math.min(t, P.len); saveP(); say('recorded up to', fmt(t));
  }
  function addCamKey(t, quiet){
    const p = curPose(); t = +t.toFixed(3);
    const near = P.cam.find(k => Math.abs(k.t - t) < .02);
    const k = Object.assign(near || { id: uid(), ease: 'flow' }, { t, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), zoom: +p.zoom.toFixed(3) });
    if (!near) P.cam.push(k);
    REC.lastCam = t; REC.lastPose = p;
    if (!quiet){ SEL = { k: 'cam', id: k.id }; changed(); toast('Camera key at ' + fmt(t)); }
    return k;
  }

  /* ---------- effects: what each kind is and what it can be set to ---------- */
  const FX = {
    fade: { name: 'Fade', d: 1, col: '#5c6b86', params: { dir: 'in', color: 'black' } },
    flash: { name: 'Flash', d: .25, col: '#c9e9ff', params: {} },
    glitch: { name: 'Glitch', d: .5, col: '#a05cff', params: { power: 1 } },
    bars: { name: 'Cinema bars', d: 6, col: '#3b4254', params: { size: 10 } },
    logo: { name: 'Logo', d: 4.5, col: '#ff4fa3', params: {} },
    text: { name: 'Text', d: 3, col: '#38e8e0', params: { text: 'Neon Terrarium', size: 64, color: 'cyan' } },
    lights: { name: 'City lights', d: 9.1, col: '#ffcf7a', params: { mode: 'rise' } },
    look: { name: 'Look', d: .6, col: '#c08bff', params: { look: 'night' } },
    weather: { name: 'Weather', d: .6, col: '#7fb2ff', params: { weather: 'rain' } },
    person: { name: 'Person cam', d: 6, col: '#38e8b0', params: { who: null, follow: true, brackets: true, panel: true, freeze: true } },
    train: { name: 'Follow a train', d: 6, col: '#ffb347', params: { line: null, drive: true, from: 0, speed: 2.2 } },
    apartment: { name: 'Apartment', d: 6, col: '#ff8a5c', params: { key: null } },
  };
  function fxLabel(f){
    const n = FX[f.type] ? FX[f.type].name : f.type;
    if (f.type === 'fade') return 'Fade ' + (f.dir === 'out' ? 'out' : 'in');
    if (f.type === 'text') return '"' + (f.text || '') + '"';
    if (f.type === 'lights') return 'Lights ' + (f.mode || '');
    if (f.type === 'look') return 'Look: ' + (f.look || '');
    if (f.type === 'weather') return 'Weather: ' + (f.weather || '');
    if (f.type === 'person'){ const p = f.who != null && people.get(f.who); return 'Person cam' + (p && p.name ? ': ' + p.name : ''); }
    if (f.type === 'train') return 'Train ' + (f.line ?? '?');
    return n;
  }
  function addFx(type){
    const def = FX[type], t = +D.t.toFixed(3);
    const f = Object.assign({ id: uid(), type, t, d: def.d }, JSON.parse(JSON.stringify(def.params)));
    if (type === 'person'){ if (MON.id && people.has(MON.id)){ const p = people.get(MON.id); f.who = MON.id; f.x = p.x; f.z = p.z; } else toast('Open someone in the person cam first, then press "Use the person cam\'s person"'); }
    if (type === 'train'){ let best = null; for (const l of metros){ const cp = l.train && l.train.cp && l.train.cp[1]; if (!cp) continue; const d = Math.hypot(cp[0] - camT.x, cp[2] - camT.z); if (!best || d < best.d) best = { l, d }; } if (best) f.line = best.l.id; else toast('There is no metro train in this city'); }
    if (type === 'apartment'){ const p = MON.id && people.get(MON.id); if (p && p.pod) f.key = p.pod; else toast('Pick a home: open its resident in the person cam, then "Use the person cam\'s home"'); }
    if (f.t + f.d > P.len) f.t = Math.max(0, +(P.len - f.d).toFixed(3));
    mark(); P.fx.push(f); SEL = { k: 'fx', id: f.id }; changed();
  }

  /* ---------- the editor's interface ---------- */
  const UI = { showPath: true, hidden: false, pps: 1 };
  let SEL = null;
  const LBL = 92, PADR = 18;
  function findSel(){
    if (!SEL) return null;
    const arr = SEL.k === 'cam' ? P.cam : SEL.k === 'hour' ? P.hour : SEL.k === 'edit' ? P.edits : P.fx;
    return arr.find(x => x.id === SEL.id) || null;
  }
  function css(){
    const st = document.createElement('style'); st.id = 'drUiStyle';
    st.textContent = `
      #drPanel{position:fixed;left:0;right:0;bottom:0;z-index:9500;background:#070a14;border-top:1px solid rgba(56,232,224,.35);box-shadow:0 -10px 30px rgba(0,0,0,.45);
        font:12px/1.4 "JetBrains Mono",ui-monospace,monospace;color:#cfe3f5;user-select:none;-webkit-user-select:none}
      #drPanel[hidden],#drInspect[hidden],#drMini[hidden],#drModal[hidden]{display:none}
      .dr-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
      .dr-btn,#drPanel select,#drPanel input,#drInspect select,#drInspect input,#drModal select,#drModal input{font:inherit;color:#e6f6ff;background:#111a2c;border:1px solid #26344f;border-radius:4px;padding:4px 8px}
      #drPanel .dr-bar select,#drPanel .dr-bar input{width:auto;flex:none;margin:0}
      #drInspect select,#drInspect input:not([type=checkbox]),#drModal select,#drModal input:not([type=checkbox]){width:100%;box-sizing:border-box;margin:0}
      #drInspect input[type=checkbox],#drModal input[type=checkbox]{width:auto;margin:0 6px 0 0}
      .dr-btn{cursor:pointer;white-space:nowrap}
      .dr-btn:hover{border-color:#38e8e0;color:#fff}
      .dr-btn.on{background:#38e8e0;color:#041014;border-color:#38e8e0}
      .dr-btn.rec{color:#ff6b8f;border-color:#5a2236}
      .dr-btn.rec.on{background:#ff3d6e;color:#fff;border-color:#ff3d6e}
      .dr-btn.pri{border-color:#38e8e0;color:#38e8e0}
      .dr-name{font-family:Silkscreen,ui-monospace,monospace;letter-spacing:.08em;color:#38e8e0}
      .dr-grow{flex:1}
      .dr-sep{width:1px;height:20px;background:rgba(255,255,255,.1);margin:0 2px}
      #drTime{min-width:76px;text-align:right;color:#fff;font-variant-numeric:tabular-nums}
      #drPanel #drLen{width:58px} #drPanel #drMusic{max-width:170px}
      .dr-menu{position:relative}
      .dr-pop{position:absolute;bottom:calc(100% + 6px);right:0;background:#0b1222;border:1px solid #26344f;border-radius:6px;padding:4px;min-width:190px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:grid}
      .dr-pop[hidden]{display:none}
      .dr-pop button{all:unset;cursor:pointer;padding:5px 8px;border-radius:4px;display:flex;gap:8px;align-items:center}
      .dr-pop button:hover{background:#16223a}
      .dr-pop i{width:10px;height:10px;border-radius:2px;display:inline-block}
      #drTracks{position:relative;height:176px;overflow:hidden;cursor:crosshair}
      .dr-lane{position:absolute;left:0;right:0;border-bottom:1px solid rgba(255,255,255,.05)}
      .dr-lbl{position:absolute;left:0;top:0;bottom:0;width:${LBL - 8}px;padding-left:10px;display:flex;align-items:center;color:#7d93b2;font-size:11px;background:rgba(7,10,20,.94);z-index:2}
      .dr-tick{position:absolute;top:0;bottom:0;border-left:1px solid rgba(255,255,255,.08);font-size:10px;color:#6d82a3;padding-left:3px}
      .dr-tick.big{border-left-color:rgba(255,255,255,.18);color:#9fb3d1}
      .dr-it{position:absolute;cursor:grab}
      .dr-cam{width:12px;height:12px;margin-left:-6px;top:7px;background:#38e8e0;transform:rotate(45deg);box-shadow:0 0 6px rgba(56,232,224,.7)}
      .dr-hour{width:12px;height:12px;margin-left:-6px;top:7px;border-radius:50%;background:#ffcf7a}
      .dr-hour span{position:absolute;left:14px;top:-2px;font-size:10px;color:#ffcf7a;white-space:nowrap;pointer-events:none}
      .dr-edit{width:3px;margin-left:-1px;top:5px;height:16px;background:#e9eef7;opacity:.8;border-radius:1px}
      .dr-edit.off{background:#ff6b8f}
      .dr-fx{top:3px;height:18px;border-radius:3px;overflow:hidden;color:#061018;font-size:10px;line-height:18px;padding:0 6px;white-space:nowrap;min-width:6px;box-sizing:border-box}
      .dr-fx u{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(0,0,0,.18)}
      .dr-it.sel{outline:2px solid #fff;outline-offset:1px;z-index:3}
      #drHead{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#ff4fa3;box-shadow:0 0 8px #ff4fa3;pointer-events:none;z-index:4}
      #drHead::before{content:"";position:absolute;top:0;left:-5px;border:6px solid transparent;border-top-color:#ff4fa3}
      #drInspect{position:fixed;right:12px;bottom:236px;z-index:9501;width:300px;background:rgba(9,13,26,.96);border:1px solid #26344f;border-radius:8px;padding:12px;
        font:12px/1.5 "JetBrains Mono",ui-monospace,monospace;color:#cfe3f5;box-shadow:0 12px 34px rgba(0,0,0,.5)}
      #drInspect h4,#drModal h3{margin:0 0 8px;font:13px Silkscreen,ui-monospace,monospace;letter-spacing:.08em;color:#38e8e0;font-weight:400}
      #drInspect label{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:8px;margin:6px 0}
      #drInspect label.ck{grid-template-columns:auto 1fr}
      #drInspect input[type=range]{padding:0}
      #drInspect .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      #drInspect .note{color:#7d93b2;font-size:11px;margin-top:6px}
      #drMini{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9550;display:flex;gap:8px;align-items:center;padding:6px 10px;background:rgba(7,10,20,.88);
        border:1px solid #26344f;border-radius:20px;font:12px "JetBrains Mono",ui-monospace,monospace;color:#e6f6ff}
      #drMini .dot{width:9px;height:9px;border-radius:50%;background:#ff3d6e;box-shadow:0 0 8px #ff3d6e;animation:drBlink 1s steps(2) infinite}
      @keyframes drBlink{50%{opacity:.25}}
      #drModal{position:fixed;inset:0;z-index:9700;background:rgba(3,5,12,.7);display:grid;place-items:center;font:12px/1.5 "JetBrains Mono",ui-monospace,monospace;color:#cfe3f5}
      #drModal .box{width:min(640px,92vw);max-height:84vh;overflow:auto;background:#0a1020;border:1px solid #26344f;border-radius:10px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
      #drModal .item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid #1b263d;border-radius:6px;margin:6px 0}
      #drModal .item small{color:#7d93b2}
      #drModal .item.cur{border-color:#38e8e0}
      #drModal .grid{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin:8px 0}
      #drModal section{margin-top:16px;padding-top:12px;border-top:1px solid #1b263d}
      #drModal p{color:#9fb3d1;margin:6px 0}
      #drToast{position:fixed;left:50%;bottom:250px;transform:translateX(-50%);z-index:9800;background:#0d1730;border:1px solid #38e8e0;color:#e6f6ff;padding:7px 12px;border-radius:6px;
        font:12px "JetBrains Mono",ui-monospace,monospace;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80vw;text-align:center}
      #drToast.on{opacity:1}
      html.dr-clean #drPanel,html.dr-clean #drInspect{display:none}`;
    document.head.appendChild(st);
  }
  let toastT = 0;
  function toast(s, ms = 2600){ const el = document.getElementById('drToast'); if (!el) return; el.textContent = s; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }
  function card(html, onPick){
    const c = OV.card; c.innerHTML = html; c.hidden = false;
    c.onclick = e => { const b = e.target.closest('[data-c]'); if (!b && !c.dataset.any) return; c.hidden = true; c.onclick = null; onPick(b ? b.dataset.c : 'any'); };
  }
  function buildUI(){
    css();
    const panel = document.createElement('div'); panel.id = 'drPanel';
    panel.innerHTML = `
      <div class="dr-bar">
        <button class="dr-btn dr-name" data-a="projects" title="Trailers, film settings, export">&#9776; <span id="drName"></span></button>
        <span class="dr-sep"></span>
        <button class="dr-btn" data-a="home" title="Back to the start">&#9198;</button>
        <button class="dr-btn" data-a="preview" title="Watch the camera, the time of day and the effects from the playhead (the city stays as it is: no edits)">&#9654; Preview</button>
        <button class="dr-btn pri" data-a="play" title="Play the finished film from the start, every edit built as it happens (the city is reloaded first)">&#9654; Play film</button>
        <button class="dr-btn" data-a="playHere" title="Play the finished film from the playhead">&#9654; From here</button>
        <button class="dr-btn rec" data-a="rec" title="Record what you do in the game from the playhead: building, removing, megastructures, metro, highways, the person cam, apartments, looks, weather and the time of day">&#9679; Rec</button>
        <select id="drRecCam" title="What the camera does while you record: free (you move it), on path (it follows the camera keys), record moves (your moves become camera keys)">
          <option value="free">cam: free</option><option value="path">cam: on path</option><option value="record">cam: record moves</option></select>
        <span class="dr-sep"></span>
        <span id="drTime">0:00.00</span><span style="color:#5d7090">/</span>
        <input id="drLen" type="number" min="2" max="900" step="0.5" title="Length of the film, in seconds"><span style="color:#5d7090">s</span>
        <select id="drMusic" title="Music"></select>
        <span class="dr-grow"></span>
        <button class="dr-btn" data-a="camKey" title="A camera key at the playhead, from the view you have now (K)">+ Camera key</button>
        <button class="dr-btn" data-a="hourKey" title="A time-of-day key at the playhead, at the hour the city shows now">+ Time key</button>
        <span class="dr-menu"><button class="dr-btn" data-a="fxMenu">+ Effect &#9662;</button><div class="dr-pop" id="drFxMenu" hidden></div></span>
        <button class="dr-btn" data-a="path" title="Show or hide the camera path in the city">Path</button>
        <button class="dr-btn" data-a="hide" title="Hide the timeline (T)">&#9662;</button>
      </div>
      <div id="drTracks"><div id="drLanes"></div><div id="drHead"></div></div>`;
    document.body.appendChild(panel);
    const insp = document.createElement('div'); insp.id = 'drInspect'; insp.hidden = true; document.body.appendChild(insp);
    const mini = document.createElement('div'); mini.id = 'drMini'; mini.hidden = true; document.body.appendChild(mini);
    const modal = document.createElement('div'); modal.id = 'drModal'; modal.hidden = true; document.body.appendChild(modal);
    const tst = document.createElement('div'); tst.id = 'drToast'; document.body.appendChild(tst);
    const fm = panel.querySelector('#drFxMenu');
    fm.innerHTML = Object.entries(FX).map(([k, v]) => `<button data-fx="${k}"><i style="background:${v.col}"></i>${v.name}</button>`).join('');
    panel.addEventListener('click', e => {
      const fb = e.target.closest('[data-fx]'); if (fb){ fm.hidden = true; addFx(fb.dataset.fx); return; }
      const b = e.target.closest('[data-a]'); if (!b) return; act(b.dataset.a);
    });
    panel.querySelector('#drLen').addEventListener('change', e => { mark(); P.len = clamp(+e.target.value || P.len, 2, 900); changed(); });
    panel.querySelector('#drRecCam').addEventListener('change', e => { P.recCam = e.target.value; saveP(); });
    panel.querySelector('#drMusic').addEventListener('change', e => { P.music = e.target.value; saveP(); loadMusic().catch(er => toast('Could not load ' + P.music)); });
    mini.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
    insp.addEventListener('input', inspInput); insp.addEventListener('change', inspInput);
    insp.addEventListener('click', inspClick);
    tracksInput(panel.querySelector('#drTracks'));
    document.addEventListener('click', e => { if (!e.target.closest('.dr-menu')) fm.hidden = true; });
    fetch('assets/audio/music/playlist.json').then(r => r.json()).then(list => { AU.list = list; render(); }).catch(() => {});
    window.addEventListener('resize', () => render());
    window.addEventListener('keydown', onKey, true);
  }
  function act(a){
    if (!P) return projects();
    const fm = document.getElementById('drFxMenu');
    if (a === 'fxMenu'){ fm.hidden = !fm.hidden; return; }
    if (a === 'projects') return projects();
    if (a === 'stop'){ if (RUN.kind) stopRun(); return; }
    if (RUN.kind && a !== 'hide' && a !== 'show') return;
    if (a === 'home'){ setHead(0); return; }
    if (a === 'preview'){ withMusic(() => startRun('preview', D.t >= P.len - .05 ? 0 : D.t)); return; }
    if (a === 'play') return reloadWith({ mode: 'play', at: 0 });
    if (a === 'playHere') return reloadWith({ mode: 'play', at: +D.t.toFixed(3) });
    if (a === 'rec'){
      const n = outOfSync(D.t);
      if (n){ return modal(`<h3>Set the city to ${fmt(D.t)} first</h3><p>${n} edit${n > 1 ? 's' : ''} on the timeline ${n > 1 ? 'don\'t' : 'doesn\'t'} match the city on screen. To record from ${fmt(D.t)}, the city is reloaded with every edit before ${fmt(D.t)} built and nothing after it.</p>
        <div class="row" style="display:flex;gap:8px;margin-top:12px"><button class="dr-btn pri" data-m="sync">Reload the city at ${fmt(D.t)}</button><button class="dr-btn" data-m="anyway">Record anyway</button><button class="dr-btn" data-m="close">Cancel</button></div>`, m => {
          if (m === 'sync') reloadWith({ mode: 'edit', at: +D.t.toFixed(3) });
          if (m === 'anyway') withMusic(recStart);
        }); }
      return withMusic(recStart);
    }
    if (a === 'camKey') return void addCamKey(D.t);
    if (a === 'hourKey'){ mark(); const t = +D.t.toFixed(3), near = P.hour.find(k => Math.abs(k.t - t) < .02), k = near || { id: uid(), t }; k.h = +S.hour.toFixed(3); if (!near) P.hour.push(k); SEL = { k: 'hour', id: k.id }; changed(); toast('Time key ' + hhmm(k.h) + ' at ' + fmt(t)); return; }
    if (a === 'path'){ UI.showPath = !UI.showPath; pathDraw(); render(); return; }
    if (a === 'hide' || a === 'show'){ UI.hidden = a === 'hide'; uiMode(); return; }
  }
  function withMusic(f){ loadMusic().then(f, e => { if (P.music) toast('Music could not load: playing without it'); f(); }); }
  function onKey(e){
    if (!P || !D.ready) return;
    const tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Escape' && RUN.kind){ e.preventDefault(); e.stopPropagation(); if (RUN.kind === 'play'){ return reloadWith({ mode: 'edit', at: 0 }); } stopRun(); return; }
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || RUN.kind === 'play') return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z'){ e.preventDefault(); e.stopPropagation(); if (!RUN.kind) undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'k' && !RUN.kind){ e.preventDefault(); e.stopPropagation(); addCamKey(D.t); return; }
    if (k === 'k' && RUN.kind === 'rec'){ e.preventDefault(); e.stopPropagation(); addCamKey(clockT()); return; }
    if (k === 't' && !e.repeat){ e.preventDefault(); e.stopPropagation(); UI.hidden = !UI.hidden; uiMode(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEL && !RUN.kind){ e.preventDefault(); e.stopPropagation(); delSel(); return; }
  }
  function delSel(){
    const it = findSel(); if (!it) return; mark();
    if (SEL.k === 'cam') P.cam = P.cam.filter(x => x !== it);
    if (SEL.k === 'hour') P.hour = P.hour.filter(x => x !== it);
    if (SEL.k === 'edit'){ P.edits = P.edits.filter(x => x !== it); if (APPLIED.has(it.id)) toast('Removed from the timeline. The city on screen still has it until it is reloaded (Play film).', 4200); }
    if (SEL.k === 'fx') P.fx = P.fx.filter(x => x !== it);
    SEL = null; changed();
  }
  function uiMode(){
    const panel = document.getElementById('drPanel'), mini = document.getElementById('drMini');
    if (!panel) return;
    const k = RUN.kind;
    panel.hidden = !P || UI.hidden || k === 'rec' || k === 'preview' || k === 'play';
    if (k === 'rec') mini.innerHTML = '<span class="dot"></span><b>REC</b><span id="drMiniT"></span><button class="dr-btn" data-a="camKey" title="K">+ Camera key</button><button class="dr-btn rec on" data-a="stop">&#9632; Stop</button>';
    else if (k === 'preview') mini.innerHTML = '<span>&#9654;</span><span id="drMiniT"></span><button class="dr-btn" data-a="stop">&#9632; Stop (Esc)</button>';
    else if (UI.hidden && P && k !== 'play') mini.innerHTML = '<span id="drMiniT"></span><button class="dr-btn" data-a="show">&#9652; Timeline (T)</button>';
    mini.hidden = !(k === 'rec' || k === 'preview' || (UI.hidden && P && k !== 'play'));
    if (k === 'preview') mini.style.opacity = '.55'; else mini.style.opacity = '';
    renderInspect();
    uiTime();
  }
  const tracksW = () => { const el = document.getElementById('drTracks'); return el ? el.clientWidth : innerWidth; };
  const tX = t => LBL + (t/P.len)*(tracksW() - LBL - PADR);
  const xT = x => clamp((x - LBL)/(tracksW() - LBL - PADR)*P.len, 0, P.len);
  function fxLanes(){
    const L = [], ends = [];
    for (const f of keysSorted(P.fx)){ let k = ends.findIndex(e => e <= f.t + 1e-6); if (k < 0){ k = ends.length < 4 ? ends.length : ends.indexOf(Math.min(...ends)); } ends[k] = f.t + f.d; L.push([f, k]); }
    return L;
  }
  function render(){
    const panel = document.getElementById('drPanel'); if (!panel || !P) return;
    document.getElementById('drName').textContent = P.name;
    const len = document.getElementById('drLen'); if (document.activeElement !== len) len.value = P.len;
    document.getElementById('drRecCam').value = P.recCam;
    const ms = document.getElementById('drMusic');
    const opts = '<option value="">no music</option>' + (AU.list.length ? AU.list : [{ file: P.music, title: P.music }]).filter(x => x.file).map(x => `<option value="${esc(x.file)}">${esc(x.title || x.file)}</option>`).join('');
    if (ms.dataset.n !== String(AU.list.length)){ ms.innerHTML = opts; ms.dataset.n = String(AU.list.length); }
    ms.value = P.music || '';
    panel.querySelector('[data-a="path"]').classList.toggle('on', UI.showPath);
    const W = tracksW(), rows = [['ruler', '', 22], ['cam', 'Camera', 26], ['hour', 'Time of day', 26], ['edit', 'Edits', 26]];
    const lanes = fxLanes(), nfx = Math.max(1, Math.min(4, 1 + Math.max(-1, ...lanes.map(l => l[1]))));
    for (let k = 0; k < nfx; k++) rows.push(['fx' + k, k ? '' : 'Effects', 24]);
    let y = 0, html = '';
    const isSel = (k, id) => SEL && SEL.k === k && SEL.id === id ? ' sel' : '';
    for (const [id, name, h] of rows){
      let inner = '';
      if (id === 'ruler'){
        const span = W - LBL - PADR, per = P.len/Math.max(1, span/70), steps = [.5, 1, 2, 5, 10, 15, 30, 60], st = steps.find(s => s >= per) || 60;
        for (let t = 0; t <= P.len + 1e-6; t += st) inner += `<span class="dr-tick${Math.abs(t/5 - Math.round(t/5)) < 1e-6 ? ' big' : ''}" style="left:${tX(t).toFixed(1)}px">${fmt(t).replace(/\.00$/, '')}</span>`;
      }
      if (id === 'cam') for (const k of P.cam) inner += `<i class="dr-it dr-cam${isSel('cam', k.id)}" data-k="cam" data-id="${k.id}" style="left:${tX(k.t).toFixed(1)}px" title="Camera key ${fmt(k.t)} (${k.ease || 'flow'})"></i>`;
      if (id === 'hour') for (const k of P.hour) inner += `<i class="dr-it dr-hour${isSel('hour', k.id)}" data-k="hour" data-id="${k.id}" style="left:${tX(k.t).toFixed(1)}px"><span>${hhmm(k.h)}</span></i>`;
      if (id === 'edit') for (const e of P.edits) inner += `<i class="dr-it dr-edit${isSel('edit', e.id)}" data-k="edit" data-id="${e.id}" style="left:${tX(e.t).toFixed(1)}px" title="${esc(editLabel(e))} at ${fmt(e.t)}"></i>`;
      if (id.startsWith('fx')){ const lane = +id.slice(2);
        for (const [f, k] of lanes) if (k === lane){ const x = tX(f.t), w = Math.max(6, tX(f.t + f.d) - x), def = FX[f.type] || { col: '#888' };
          inner += `<b class="dr-it dr-fx${isSel('fx', f.id)}" data-k="fx" data-id="${f.id}" style="left:${x.toFixed(1)}px;width:${w.toFixed(1)}px;background:${def.col}" title="${esc(fxLabel(f))} ${fmt(f.t)} to ${fmt(f.t + f.d)}">${w > 40 ? esc(fxLabel(f)) : ''}<u></u></b>`; } }
      html += `<div class="dr-lane" data-lane="${id}" style="top:${y}px;height:${h}px"><span class="dr-lbl">${name}</span>${inner}</div>`;
      y += h;
    }
    const lanesEl = document.getElementById('drLanes'); lanesEl.innerHTML = html;
    document.getElementById('drTracks').style.height = Math.max(150, y + 4) + 'px';
    const ins = document.getElementById('drInspect'); ins.style.bottom = (panel.offsetHeight + 12) + 'px';
    document.getElementById('drToast').style.bottom = (panel.hidden ? 40 : panel.offsetHeight + 16) + 'px';
    renderInspect(); uiTime();
  }
  function uiTime(){
    if (!P) return;
    const t = RUN.kind ? clockT() : D.t;
    const el = document.getElementById('drTime'); if (el) el.textContent = fmt(t);
    const mt = document.getElementById('drMiniT'); if (mt) mt.textContent = fmt(t) + ' / ' + fmt(Math.max(P.len, t));
    const hd = document.getElementById('drHead'); if (hd) hd.style.left = tX(Math.min(t, P.len)).toFixed(1) + 'px';
  }
  function setHead(t){
    D.t = clamp(t, 0, P.len);
    const p = camPose(D.t); if (p) applyPose(p);
    const h = hourAt(D.t); if (h !== null){ window.HOUR_DRAG_AT = performance.now(); S.hour = h; }
    const lv = lightsAt(D.t); if (lv !== null) LIGHTS_ON.value = lv;
    uiTime();
  }
  function tracksInput(el){
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (!P || RUN.kind) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left;
      const it = e.target.closest('.dr-it');
      if (it){
        SEL = { k: it.dataset.k, id: it.dataset.id }; const obj = findSel(); if (!obj){ SEL = null; return; }
        drag = { obj, mode: e.target.tagName === 'U' ? 'len' : 'move', dx: xT(x) - obj.t, t0: obj.t, d0: obj.d, moved: false, marked: false };
        render(); el.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      if (x < LBL) return;
      drag = { mode: 'scrub' }; el.setPointerCapture(e.pointerId); setHead(xT(x)); SEL = null; renderInspect(); render();
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left;
      if (drag.mode === 'scrub'){ setHead(xT(x)); return; }
      const snap = v => e.altKey ? v : Math.round(v*20)/20;
      if (!drag.marked){ mark(); drag.marked = true; }
      drag.moved = true;
      if (drag.mode === 'len') drag.obj.d = Math.max(.05, snap(xT(x) - drag.obj.t));
      else drag.obj.t = clamp(snap(xT(x) - drag.dx), 0, P.len);
      render(); if (SEL.k === 'cam') pathDraw();
    });
    const up = () => { if (!drag) return; const d = drag; drag = null; if (d.mode !== 'scrub'){ if (d.moved) changed(); else if (d.obj && SEL.k === 'cam') pathDraw(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', e => { const it = e.target.closest('.dr-it'); if (it){ const o = findSel(); if (o) setHead(o.t); } });
  }

  /* ---------- the inspector: the picked key, edit or effect ---------- */
  function renderInspect(){
    const el = document.getElementById('drInspect'); if (!el) return;
    const it = P && findSel();
    if (!it || RUN.kind || UI.hidden){ el.hidden = true; return; }
    el.hidden = false;
    const tIn = `<label>Time <input type="number" step="0.05" min="0" data-f="t" value="${it.t}"></label>`;
    let h = '';
    if (SEL.k === 'cam'){
      h = `<h4>Camera key</h4>${tIn}
        <label>Into next <select data-f="ease">${[['flow', 'flow (smooth curve)'], ['ease', 'ease in and out'], ['linear', 'linear'], ['cut', 'cut (jump)']].map(([v, n]) => `<option value="${v}"${(it.ease || 'flow') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Zoom <input type="number" step="0.1" data-f="zoom" value="${it.zoom}"></label>
        <label>Turn <input type="number" step="1" data-f="yawDeg" value="${(it.yaw/DEG).toFixed(1)}"></label>
        <label>Tilt <input type="number" step="1" min="2" max="89" data-f="pitchDeg" value="${(it.pitch/DEG).toFixed(1)}"></label>
        <div class="row"><button class="dr-btn" data-i="camHere">Set to my view</button><button class="dr-btn" data-i="goto">Go to it</button><button class="dr-btn" data-i="del">Delete</button></div>
        <div class="note">Move the camera with the game's controls, then "Set to my view". Double-click a key on the timeline to jump to it.</div>`;
    } else if (SEL.k === 'hour'){
      h = `<h4>Time of day</h4>${tIn}<label>Hour <input type="range" min="0" max="24" step="0.05" data-f="h" value="${it.h}"></label><div class="note" style="text-align:right">${hhmm(it.h)}</div>
        <div class="row"><button class="dr-btn" data-i="hourNow">Use the city's hour</button><button class="dr-btn" data-i="del">Delete</button></div>`;
    } else if (SEL.k === 'edit'){
      const later = P.edits.filter(e => e.t >= it.t).length;
      h = `<h4>Edit</h4><div>${esc(editLabel(it))}</div>${tIn}
        <label>Shift later <input type="number" step="0.1" data-f="shiftBy" value="0" title="Move this edit and every edit after it by this many seconds"></label>
        <div class="row"><button class="dr-btn" data-i="shift">Move ${later} edit${later > 1 ? 's' : ''}</button><button class="dr-btn" data-i="spread">Spread out</button><button class="dr-btn" data-i="del">Delete</button></div>
        <div class="note">${APPLIED.has(it.id) ? 'In the city now.' : 'Not in the city on screen (it is built when the film plays).'} "Spread out" spaces this edit and the ones after it evenly up to the next camera key.</div>`;
    } else {
      const def = FX[it.type] || { name: it.type };
      h = `<h4>${esc(def.name)}</h4>${tIn}<label>Length <input type="number" step="0.05" min="0.05" data-f="d" value="${it.d}"></label>`;
      const sel = (f, list) => `<select data-f="${f}">${list.map(([v, n]) => `<option value="${esc(v)}"${String(it[f]) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
      if (it.type === 'fade') h += `<label>Direction ${sel('dir', [['in', 'fade in (from)'], ['out', 'fade out (to)']])}</label><label>Colour ${sel('color', [['black', 'black'], ['white', 'white']])}</label>`;
      if (it.type === 'glitch') h += `<label>Strength <input type="range" min="0.2" max="2" step="0.05" data-f="power" value="${it.power ?? 1}"></label>`;
      if (it.type === 'bars') h += `<label>Size <input type="range" min="3" max="20" step="0.5" data-f="size" value="${it.size ?? 10}"></label>`;
      if (it.type === 'text') h += `<label>Text <input type="text" data-f="text" value="${esc(it.text)}"></label><label>Size <input type="number" min="12" max="240" data-f="size" value="${it.size ?? 64}"></label><label>Colour ${sel('color', [['cyan', 'cyan'], ['pink', 'pink'], ['amber', 'amber'], ['white', 'white']])}</label>`;
      if (it.type === 'lights') h += `<label>Lights ${sel('mode', [['rise', 'come on one by one'], ['flicker', 'flicker on'], ['on', 'on'], ['off', 'off'], ['auto', 'as the game has them']])}</label><div class="note">Holds until the next lights effect. "One by one" is the game's own way: over the length of the effect every light switches on at its own moment (the game takes about 9 s).</div>`;
      if (it.type === 'look') h += `<label>Look ${sel('look', [['auto', 'auto (by the hour)'], ...((LK.order || []).map(id => [id, (LK.looks[id] && LK.looks[id].name) || id]))])}</label>`;
      if (it.type === 'weather') h += `<label>Weather ${sel('weather', [['clear', 'clear'], ['overcast', 'overcast'], ['rain', 'rain']])}</label>`;
      if (it.type === 'person'){ const p = it.who != null && people.get(it.who);
        h += `<div class="note">${p ? 'Watching ' + esc(p.name || it.who) : it.who ? 'Person ' + esc(it.who) + ' (not in this city: the nearest to where they were is used)' : 'Nobody picked yet'}</div>
          <label class="ck"><input type="checkbox" data-f="freeze"${it.freeze ? ' checked' : ''}> keep them in place</label>
          <label class="ck"><input type="checkbox" data-f="follow"${it.follow ? ' checked' : ''}> camera follows them</label>
          <label class="ck"><input type="checkbox" data-f="brackets"${it.brackets !== false ? ' checked' : ''}> highlight brackets</label>
          <label class="ck"><input type="checkbox" data-f="panel"${it.panel !== false ? ' checked' : ''}> show the person cam panel</label>
          <div class="row"><button class="dr-btn" data-i="whoNow">Use the person cam's person</button></div>
          <div class="note">"Keep them in place": from the start of the film until this ends they don't walk anywhere (they still idle, gesture and turn on the spot), so the same person is waiting there every time it plays.</div>`; }
      if (it.type === 'train') h += `<label>Line ${sel('line', metros.map(l => [l.id, 'line ' + l.id + ' (' + l.tiles.length + ' plots)']))}</label>
          <label class="ck"><input type="checkbox" data-f="drive"${it.drive !== false ? ' checked' : ''}> drive the train (no stops)</label>
          <label>Starts at <input type="number" step="0.5" min="0" data-f="from" value="${it.from ?? 0}" title="How far along the line the train is when the effect starts, in plots"></label>
          <label>Speed <input type="number" step="0.1" min="0" data-f="speed" value="${it.speed ?? 2.2}" title="Plots a second"></label>
          <div class="note">The camera's target rides with the train; zoom, turn and tilt still come from the camera keys. Driven, the train runs from "Starts at" (plots from the start of the line) at a steady speed for the whole effect, wherever it was before; scrub the playhead to see where it is.</div>`;
      if (it.type === 'apartment') h += `<div class="note">${it.key ? 'Home ' + esc(it.key) : 'No home picked yet'}</div><div class="row"><button class="dr-btn" data-i="homeNow">Use the person cam's home</button></div><div class="note">Opens that apartment in Furnish pod for this long (only when the film plays, not in Preview).</div>`;
      h += `<div class="row"><button class="dr-btn" data-i="goto">Go to it</button><button class="dr-btn" data-i="del">Delete</button></div>`;
    }
    el.innerHTML = h;
  }
  let inspMarked = 0;
  function inspInput(e){
    const f = e.target.dataset.f, it = findSel(); if (!f || !it) return;
    if (performance.now() - inspMarked > 800){ mark(); } inspMarked = performance.now();
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' || e.target.type === 'range' ? +e.target.value : e.target.value;
    if (f === 'shiftBy') return;
    if (f === 'yawDeg') it.yaw = v*DEG; else if (f === 'pitchDeg') it.pitch = clamp(v, 2, 89)*DEG;
    else if (f === 'line') it.line = +v; else if (f === 't') it.t = clamp(v, 0, P.len); else it[f] = v;
    if (f === 'h'){ S.hour = v; window.HOUR_DRAG_AT = performance.now(); const n = e.target.closest('#drInspect').querySelector('.note'); if (n) n.textContent = hhmm(v); }
    saveP();
    if (e.type === 'change'){ render(); pathDraw(); }   // (the inspector is drawn again only when a value is settled: a slider being dragged keeps its grip)
    else if (SEL.k === 'cam') pathDraw();
  }
  function inspClick(e){
    const b = e.target.closest('[data-i]'); if (!b) return; const it = findSel(); if (!it) return;
    const a = b.dataset.i;
    if (a === 'del') return delSel();
    if (a === 'goto') return setHead(it.t);
    mark();
    if (a === 'camHere'){ const p = curPose(); Object.assign(it, { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), zoom: +p.zoom.toFixed(3) }); toast('Key set to your view'); }
    if (a === 'hourNow') it.h = +S.hour.toFixed(3);
    if (a === 'whoNow'){ if (!MON.id) return toast('Open someone in the person cam first'); const p = people.get(MON.id); it.who = MON.id; it.x = p && p.x; it.z = p && p.z; }
    if (a === 'homeNow'){ const p = MON.id && people.get(MON.id); if (!p || !p.pod) return toast('Open a resident with a home in the person cam first'); it.key = p.pod; }
    if (a === 'shift'){ const by = +(document.querySelector('#drInspect [data-f="shiftBy"]').value) || 0; for (const e2 of P.edits) if (e2.t >= it.t) e2.t = clamp(+(e2.t + by).toFixed(3), 0, P.len); }
    if (a === 'spread'){ const E = editsSorted().filter(e2 => e2.t >= it.t), nk = keysSorted(P.cam).find(k => k.t > it.t + .05), end = nk ? nk.t : P.len;
      if (E.length > 1) E.forEach((e2, i) => { e2.t = +(it.t + (end - it.t)*i/E.length).toFixed(3); }); }
    changed();
  }

  /* ---------- trailers: pick, make, settings, export, import ---------- */
  function modal(html, onPick){
    const m = document.getElementById('drModal'); m.innerHTML = '<div class="box">' + html + '</div>'; m.hidden = false;
    m.onclick = e => { if (e.target === m && P){ m.hidden = true; return; } const b = e.target.closest('[data-m]'); if (!b) return; const r = onPick ? onPick(b.dataset.m, b, m) : null; if (r !== false) m.hidden = true; };
  }
  async function projects(){
    const [all, slots] = await Promise.all([idbAll().catch(() => []), slotsAll()]);
    all.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const when = t => t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const list = all.map(r => `<div class="item${P && r.id === P.id ? ' cur' : ''}"><div><b>${esc(r.name)}</b><br><small>${esc(r.cityName || 'a city')} &middot; ${when(r.updated)} &middot; ${((r.proj && r.proj.len) || 0)} s</small></div>
      <div style="display:flex;gap:6px">${P && r.id === P.id ? '<small>open</small>' : `<button class="dr-btn pri" data-m="open:${r.id}">Open</button>`}<button class="dr-btn" data-m="copy:${r.id}">Copy</button><button class="dr-btn" data-m="del:${r.id}">Delete</button></div></div>`).join('') || '<p>No trailers yet.</p>';
    const cities = [['live', 'The city you play now']].concat(slots.filter(s => s.data).map(s => ['slot:' + s.id, 'Save slot: ' + (s.name || 'city') + (s.meta && s.meta.plots ? ' (' + s.meta.plots + ' plots)' : '')])).concat([['empty', 'An empty map']]);
    const settings = P ? `<section><h3>This trailer</h3>
      <div class="grid"><span>Name</span><input data-s="name" value="${esc(P.name)}">
      <span>Music starts at</span><input type="number" step="0.1" min="0" data-s="musicStart" value="${P.musicStart}" title="Seconds into the track where the film begins">
      <span>Fade out</span><label><input type="checkbox" data-s="fadeOut"${P.fadeOut ? ' checked' : ''}> the music fades over the last 1.8 s</label>
      <span>Game sounds</span><label><input type="checkbox" data-s="gameSounds"${P.gameSounds ? ' checked' : ''}> build sounds and the rest while it plays</label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="dr-btn pri" data-m="save">Save settings</button><button class="dr-btn" data-m="export">Export file (for the recorder)</button></div>
      <p>The recorder makes the 1080p film from an exported file: <code>python3 tools/trailer/record.py --project path/to/file.trailer.json</code></p></section>` : '';
    modal(`<h3>Trailers</h3>${NOTE ? '<p style="color:#ffcf7a">' + esc(NOTE) + '</p>' : ''}${list}
      <section><h3>New trailer</h3><div class="grid"><span>Name</span><input data-n="name" value="Trailer ${all.length + 1}">
        <span>Film in</span><select data-n="city">${cities.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select></div>
        <p>The trailer keeps its own copy of that city: playing it back never changes the city itself.</p>
        <div style="display:flex;gap:8px"><button class="dr-btn pri" data-m="new">Make it</button><button class="dr-btn" data-m="import">Import a trailer file</button></div></section>
      ${settings}${P ? '<div style="text-align:right;margin-top:10px"><button class="dr-btn" data-m="close">Close</button></div>' : ''}`, (m, b, box) => {
      const [cmd, id] = m.split(':');
      if (cmd === 'close') return true;
      if (cmd === 'open'){ const r = all.find(x => x.id === id); if (r) flush().then(() => openRec(r)); return true; }
      if (cmd === 'copy'){ const r = all.find(x => x.id === id); if (!r) return false; const nid = uid(), pr = norm(JSON.parse(JSON.stringify(r.proj))); pr.id = nid; pr.name = r.name + ' copy';
        idbPut({ id: nid, name: pr.name, cityName: r.cityName, created: Date.now(), updated: Date.now(), proj: pr, city: r.city }).then(projects); return false; }
      if (cmd === 'del'){ const r = all.find(x => x.id === id); if (!r || !confirm('Delete the trailer "' + r.name + '"? This can\'t be undone.')) return false;
        idbDel(id).then(() => { if (P && P.id === id){ P = null; try { SS.removeItem('ntDirector.proj'); } catch (e) {} } projects(); }); return false; }
      if (cmd === 'new'){
        const name = (box.querySelector('[data-n="name"]').value || 'Trailer').trim().slice(0, 60), src = box.querySelector('[data-n="city"]').value;
        let city = {}, cityName = 'an empty map';
        if (src === 'live'){ city = liveCity(); cityName = 'your city'; }
        else if (src.startsWith('slot:')){ const s = slots.find(x => 'slot:' + x.id === src); city = (s && s.data) || {}; cityName = s ? s.name : 'a save slot'; }
        const id2 = uid(), pr = norm({ id: id2, name, cityName, created: Date.now(), updated: Date.now() });
        idbPut({ id: id2, name, cityName, created: Date.now(), updated: Date.now(), proj: pr, city }).then(() => flush()).then(() => openRec({ proj: pr, city }));
        return true;
      }
      if (cmd === 'import'){ const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); if (d.format !== 'neon-terrarium-trailer' || !d.project) throw new Error('not a trailer file');
          const nid = uid(), pr = norm(d.project); pr.id = nid; await idbPut({ id: nid, name: pr.name, cityName: pr.cityName, created: Date.now(), updated: Date.now(), proj: pr, city: d.city || {} }); await flush(); openRec({ proj: pr, city: d.city || {} }); }
          catch (e) { toast('Could not import: ' + (e.message || e)); } };
        inp.click(); return false; }
      if (cmd === 'save' && P){ mark(); for (const el of box.querySelectorAll('[data-s]')){ const k = el.dataset.s; P[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; } P.name = (P.name || 'Trailer').slice(0, 60); changed(); toast('Saved'); return true; }
      if (cmd === 'export' && P){ exportFile(); return false; }
      return false;
    });
  }
  function exportFile(){
    const blob = new Blob([JSON.stringify({ format: 'neon-terrarium-trailer', v: 1, project: P, city: NT_DIR_CITY })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (P.name || 'trailer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.trailer.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported ' + a.download);
  }

  /* ---------- start ---------- */
  const until = (cond, secs) => new Promise((res, rej) => { const t0 = performance.now();
    const tk = () => { let ok = false; try { ok = cond(); } catch (e) {} if (ok) return res(); if (performance.now() - t0 > secs*1000) return rej(new Error('timed out')); requestAnimationFrame(tk); }; tk(); });
  const wait = secs => { const t0 = performance.now(); return until(() => performance.now() - t0 >= secs*1000, secs + 5); };
  const status = s => { D.stage = s; };
  async function setup(){
    overlay();
    const play = !!P && BOOT.mode === 'play';
    if (!CAP) buildUI();
    settle(play);
    status('loading the city');
    if (!CAP) toast('Loading the city...', 60000);
    // (the whole city must be in before a film plays; editing can start while the far parts are still coming in)
    await until(() => typeof pplReady !== 'undefined' && pplReady && !anims.length && !(typeof LOADP !== 'undefined' && LOADP.on), play ? 3600 : 900).catch(e => warn('loading', e));
    await wait(.4);
    if (!P){ toast('Pick or make a trailer'); D.ready = true; status('no trailer'); projects(); return; }
    const at = clamp(+BOOT.at || 0, 0, P.len);
    if (at > 0){ status('building the city as it is at ' + fmt(at)); applyUpTo(at); await wait(.3); }
    if (play){
      D.mode = 'play';
      if (P.fx.some(f => f.type === 'apartment')){ status('waking the apartment lab'); safe('furnish', () => FURN.preload()); await until(() => FURN.warmed(), 240).catch(e => warn('furnish', e)); }
      if (!CAP){ status('loading the music'); await loadMusic().catch(e => warn('music', e)); }
      D.t = at; safe('pose', () => driveAt(at)); paint(at, true);
      document.documentElement.classList.add('dr-clean', 'dr-play');
      await wait(1);
      D.ready = true; status('ready'); say('ready to play from', fmt(at));
      if (!CAP){ toast('', 1);
        OV.card.dataset.any = '1';
        card('<b>' + esc(P.name) + '</b><span>click to play' + (at ? ' from ' + fmt(at) : '') + ' &middot; Esc stops</span>', () => { delete OV.card.dataset.any; go(at); }); }
    } else {
      D.mode = 'edit'; D.ready = true; status('editing');
      setHead(at); render(); pathDraw(); uiMode();
      toast(at ? 'The city as it is at ' + fmt(at) + '. Press Rec to record from here.' : NOTE || 'Ready. Press Rec and build, or add camera keys (K).', 4200);
    }
  }
  function go(at){ if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); startRun('play', at || 0); say('rolling'); }
  D.start = () => { if (!D.ready || !P || D.mode !== 'play') return false; go(+BOOT.at || 0); return true; };
  D.state = () => ({ ready: D.ready, playing: D.playing, done: D.done, t: D.t, stage: D.stage, info: { name: P && P.name, len: P && P.len, edits: P && P.edits.length }, log: D.log.slice(-30) });
  D.project = () => P;
  D.seek = t => { if (P && !RUN.kind) setHead(+t || 0); };   // (jump the playhead: for scripts and the console)
  window.addEventListener('load', () => {
    setup().then(() => requestAnimationFrame(tick)).catch(e => { warn('setup', e); D.failed = String(e && e.message || e); if (!CAP) toast('Could not set up: ' + D.failed, 8000); });
  });
  return D;
})();
