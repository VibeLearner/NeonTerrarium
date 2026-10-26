// Neon Terrarium: what the city's scanner and the person cam learn about the people in the pods. The LIDAR Array (mega.js)
// reads the bodies in a home: how many, roughly how old, where they badge in and on what shift. Who they are takes watching:
// every so often while the person cam follows someone out in the street it notes one of their habits (outgoing, tidy, into
// music...), and those are what Furnish pod's Residents card shows (furnish.js); the rest stay unknown. Follow someone home
// and the feed loses them at the door: the array offers the pods it thinks they went into, with how sure it is of each, and
// a few seconds later a window lights up in one of them. Pick the right pod and the card has their whole profile; the wrong
// one is a stranger's home. All of it is kept with the city (localStorage 'neonIsland.dossier', one of the city's keys: saveguard.js).
// All game scripts share one scope and load in order (see index.html); this one loads after furnish.js.
'use strict';
const DOSSIER = (() => {
  const D = { raw: false }, KEY = 'neonIsland.dossier';
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.p && typeof s.p === 'object') return s; } catch (e) {} return { v: 1, p: {} }; };
  let S = load(), dirty = false;
  const save = () => { dirty = true; };
  setInterval(() => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 1500);
  addEventListener('storage', e => { if (e.key === KEY) S = load(); });
  const rec = id => S.p[id] || (S.p[id] = { w: 0, tr: [] });
  const has = id => !!S.p[id];
  const hashU = s => { let v = 2166136261; for (let i = 0; i < s.length; i++){ v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return (v >>> 0)/4294967296; };
  const clock = () => (window.STORY && STORY.clock) || 0;
  const SCAN = new Set(['night shift']);   // (what the array reads by itself)
  // their habits that the cam can pick up, in the order it will (its own for each person)
  function hidden(id){
    const f = typeof FURN !== 'undefined' && FURN.profileOf ? FURN.profileOf(id) : null; if (!f) return [];
    return f.traits.filter(t => !SCAN.has(t)).sort((a, b) => hashU(id + a) - hashU(id + b));
  }
  const known = id => { const r = S.p[id]; if (!r) return []; return r.full ? null : r.tr.map(x => x.t); };   // (null: all of it)
  D.full = id => !!(S.p[id] && S.p[id].full);
  D.home = id => S.p[id] && S.p[id].home || null;
  D.markFull = (id, key) => { const r = rec(id); r.full = true; if (key) r.home = key; r.fullAt = clock(); save(); };
  // the Residents card's line for one person: the scan's part, their name if the notebook has it, and only the habits seen
  D.card = (p, full, i) => {
    if (D.raw) return full;
    const fl = D.full(p.id), k = window.STORY && STORY.known(p.id);
    const name = fl ? full.name : k && k.first ? k.first + (k.last ? ' ' + k.last : '') : 'Unknown resident ' + (i + 1);
    const seen = fl ? full.traits : full.traits.filter(t => SCAN.has(t) || (known(p.id) || []).includes(t));
    const left = full.traits.length - seen.length;
    return { name, age: fl ? full.age : Math.round(full.age/5)*5, job: full.job, traits: left > 0 ? seen.concat(left === 1 ? '1 habit unknown' : left + ' habits unknown') : seen };
  };
  /* ---------- watching: the person cam notes a habit now and then ---------- */
  const AT = [25, 55, 95, 145, 210];   // seconds of watching (out in the street) before each new habit is noted
  const SAYS = { outgoing: 'stops to talk to people', private: 'keeps to themself', tidy: 'everything just so', messy: 'leaves things where they drop', warm: 'kind to strangers' };
  let note = null;
  D.lastNote = () => note && performance.now() - note.at < 5000 ? note : null;
  function watch(dt){
    const id = typeof MON !== 'undefined' && MON.id; if (!id || document.hidden || (typeof FURN !== 'undefined' && FURN.open)) return;
    const p = people.get(id); if (!p || !p.pod || !(p._ec && p._ea > .3)) return;   // (only someone in sight, who lives in a pod)
    if (D.full(id)) return;
    const r = rec(id); r.w += dt;
    const n = AT.filter(s => r.w >= s).length;
    if (r.tr.length < n){
      const left = hidden(id).filter(t => !r.tr.some(x => x.t === t));
      if (!left.length){ r.w = AT[AT.length - 1]; return; }
      const t = left[0]; r.tr.push({ t, at: clock() }); save();
      note = { id, t, at: performance.now() };
      try { MON.refresh && MON.refresh(); } catch (e) {}
    }
    if (Math.floor(r.w) % 5 === 0) save();
  }
  /* ---------- the notebook's Profile ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tc = t => { const d = Math.floor(t/1440) + 1, m = Math.floor(t % 1440); return 'D' + d + ' ' + String(Math.floor(m/60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  D.notebook = id => {
    const p = people.get(id); if (!p || !p.pod) return '';
    const r = S.p[id], fl = D.full(id), all = hidden(id), tr = fl ? all.map(t => ({ t, at: r.fullAt || 0 })) : r ? r.tr : [];
    const say = t => SAYS[t] ? t + ': ' + SAYS[t] : 'into ' + t;
    let h = '<h4>Profile <small class="mon-lidar">' + (typeof megasOfKind === 'function' && megasOfKind('lidar').length ? 'LIDAR + cam' : 'cam only') + '</small></h4>';
    h += tr.length ? tr.map(x => '<div class="mo"><time>' + (x.at ? tc(x.at) : '') + '</time><span><b>' + (fl ? 'Profile' : 'Seen') + '</b> ' + esc(say(x.t)) + '</span></div>').join('') : '<p class="mon-empty">No habits noted yet. Keep them on the cam.</p>';
    const left = all.length - tr.length;
    if (left > 0) h += '<p class="mon-empty">' + left + (left === 1 ? ' more habit' : ' more habits') + ' to learn by watching, or follow them home and find their pod.</p>';
    h += '<div class="md"><b>Home pod</b><span>' + (fl && r.home ? esc(podName(r.home)) : '<i>———</i>') + '</span>' + (fl && r.home ? '<small>traced on LIDAR</small>' : '') + '</div>';
    return h;
  };
  const podName = key => { const x = POD_HH.get(key); const row = x && x.row; return row ? (row.kind === 'luxury' ? 'Luxury' : row.kind === 'lift' ? 'Lifted pod' : 'Residential') + ' · pod ' + (row.pod || '?') + (row.pods ? ' of ' + row.pods : '') : 'their pod'; };

  /* ---------- tracing someone home ---------- */
  // when the person being watched goes in at their own door: SIGNAL LOST, and the array's guesses at which pod they went to
  const panel = document.getElementById('monTrace');
  const T = { id: null, cands: null, truth: null, t0: 0, lit: false, objs: [], labels: [], seenOut: 0, done: null, raf: 0 };
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x5ae8ff, transparent: true, opacity: .9, depthTest: false });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false });
  const winGeo = new THREE.PlaneGeometry(.5, .32);
  function clearTrace(keepPanel){
    for (const o of T.objs){ scene.remove(o); if (o.material && o.material !== lineMat && o.material !== winMat) o.material.dispose(); }
    T.objs = []; for (const l of T.labels) l.remove(); T.labels = [];
    T.cands = null; T.truth = null; T.lit = false; T.win = null; T.glow = null;
    if (!keepPanel && panel){ panel.classList.remove('on'); panel.innerHTML = ''; }
  }
  const boxOf = row => { const fp = row.fp || { w: SIDE, d: SIDE, ry: 0 }, cs = Math.abs(Math.cos(fp.ry)), sn = Math.abs(Math.sin(fp.ry));
    return { ex: fp.w*cs + fp.d*sn + .14, ez: fp.w*sn + fp.d*cs + .14, h: Math.max(.2, row.y1 - row.y) }; };
  const keyOf = h => h.cell[0] + ',' + h.cell[1] + '|' + h.section + '|' + h.floor;
  function startTrace(p){
    const x = POD_HH.get(p.pod); if (!x) return false;
    const truth = x.row, c = cells.get(ckey(truth.cell[0], truth.cell[1])); if (!c) return false;
    clearTrace();
    T.id = p.id; T.t0 = performance.now(); T.done = null;
    if (typeof lidarCovers !== 'function' || !megasOfKind('lidar').length || !lidarCovers(truth.x, truth.z)){
      panel.innerHTML = '<b>Signal lost</b> at their building. <span>No LIDAR Array reaches it, so there is no telling which pod they went to.</span>'; panel.classList.add('on'); T.cands = []; return true; }
    const rows = typeof FURN !== 'undefined' ? FURN.homesOf(c) : [];
    const tk = keyOf(truth), tr = rows.find(r => keyOf(r) === tk) || truth;
    const others = rows.filter(r => keyOf(r) !== tk).map(r => ({ r, u: Math.abs(r.y - tr.y) + Math.random()*2.5 })).sort((a, b) => a.u - b.u).slice(0, 2).map(o => o.r);
    // how sure the array is: usually most sure of the right one, not always
    const wt = .3 + .45*Math.random(); let rest = 1 - wt; const ws = others.map((_, k) => { const w = k === others.length - 1 ? rest : rest*(.45 + .4*Math.random()); rest -= w; return w; });
    if (!others.length) ws.length = 0;
    const list = [{ r: tr, w: others.length ? wt : 1, ok: true }].concat(others.map((r, k) => ({ r, w: ws[k], ok: false })));
    let sum = 0; list.forEach(o => { o.pct = Math.max(1, Math.round(o.w*100)); sum += o.pct; }); list[0].pct += 100 - sum;
    list.sort((a, b) => b.pct - a.pct);
    T.cands = list; T.truth = tk;
    for (const o of list){
      const b = boxOf(o.r), ln = new THREE.LineSegments(edges, lineMat.clone()); ln.position.set(o.r.x, o.r.y + b.h/2, o.r.z); ln.scale.set(b.ex, b.h, b.ez); ln.renderOrder = 5; ln.frustumCulled = false;
      scene.add(ln); T.objs.push(ln); o.line = ln;
      const lb = document.createElement('button'); lb.className = 'lid-tag'; lb.textContent = o.pct + '%'; lb.title = 'Scan this pod'; lb.addEventListener('click', () => choose(o)); document.body.appendChild(lb); T.labels.push(lb); o.tag = lb;
    }
    // the clue: a window in the right pod lights up a few seconds after they go in
    const sd = (tr.sides && tr.sides[0]) || 'S', dir = { S: [0, 1], E: [1, 0], N: [0, -1], W: [-1, 0] }[sd] || [0, 1], b = boxOf(tr);
    const w = new THREE.Mesh(winGeo, winMat.clone()); w.position.set(tr.x + dir[0]*(b.ex/2 - .05), tr.y + b.h*.55, tr.z + dir[1]*(b.ez/2 - .05)); w.rotation.y = Math.atan2(dir[0], dir[1]); w.renderOrder = 4;
    const g = new THREE.Sprite(GLOW.warm.clone()); g.position.copy(w.position); g.position.x += dir[0]*.1; g.position.z += dir[1]*.1; g.scale.set(1.4, 1.4, 1); g.material.opacity = 0; g.layers.set(1);
    scene.add(w); scene.add(g); T.objs.push(w, g); T.win = w; T.glow = g; T.litAt = 2500 + Math.random()*3500;
    const bName = (tr.kind === 'luxury' ? 'a luxury tower' : tr.kind === 'lift' ? 'a lifted pod' : 'a residential tower');
    panel.innerHTML = '<b>Signal lost</b> · entered ' + bName + '. <span>LIDAR returns ' + list.length + (list.length === 1 ? ' pod' : ' pods') + '.</span><div class="lid-c">' +
      list.map((o, k) => '<button data-k="' + k + '">Pod ' + o.r.pod + ' <i>' + o.pct + '%</i></button>').join('') + '</div>';
    panel.querySelectorAll('.lid-c button').forEach(bt => bt.addEventListener('click', () => choose(list[+bt.dataset.k])));
    panel.querySelectorAll('.lid-c button').forEach((bt, k) => { bt.addEventListener('mouseenter', () => hi(list[k], true)); bt.addEventListener('mouseleave', () => hi(list[k], false)); });
    panel.classList.add('on');
    if (!T.raf) T.raf = requestAnimationFrame(frame);
    return true;
  }
  const hi = (o, on) => { if (o && o.line){ o.line.material.color.set(on ? 0xffffff : 0x5ae8ff); } if (o && o.tag) o.tag.classList.toggle('hot', on); };
  function choose(o){
    if (!o || !T.cands) return;
    const id = T.id, ok = !!o.ok, key = keyOf(o.r);
    if (ok) D.markFull(id, key);
    clearTrace(true);
    panel.innerHTML = ok ? '<b>Match</b> · their home. <span>Their whole profile is in the Residents card.</span>' : '<b>No match</b> · a stranger\'s home. <span>They live in another pod of that building.</span>';
    T.done = performance.now();
    try { FURN.openKey(key, { id, ok }); } catch (e) { console.warn('trace: could not open the pod', e); }
    try { MON.refresh && MON.refresh(); } catch (e) {}
  }
  const _v = new THREE.Vector3();
  function frame(){
    T.raf = 0; if (!T.cands || !T.cands.length) return;
    const t = performance.now() - T.t0, r = viewRect(), VP = comp.uniforms.VP.value, hide = typeof FURN !== 'undefined' && FURN.open;
    for (const o of T.cands){
      const pulse = .55 + .45*Math.sin(t/260 + o.pct);
      o.line.material.opacity = (.35 + .5*o.pct/100)*pulse + .15;
      _v.set(o.line.position.x, o.line.position.y + o.line.scale.y/2 + .25, o.line.position.z).applyMatrix4(VP);
      const on = !hide && _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      o.tag.hidden = !on; if (on){ o.tag.style.left = Math.round(r.left + (_v.x*.5 + .5)*r.width) + 'px'; o.tag.style.top = Math.round(r.top + (1 - (_v.y*.5 + .5))*r.height) + 'px'; }
    }
    if (T.win){ const u = Math.max(0, Math.min(1, (t - T.litAt)/900)), fl = u >= 1 ? (Math.random() < .03 ? .6 : 1) : u;
      T.win.material.opacity = .95*fl; T.glow.material.opacity = .9*fl; }
    T.raf = requestAnimationFrame(frame);
  }
  // the subject's state, a few times a second: noticed going in at their own door after being seen outside
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min(1, (now - lastT)/1000); lastT = now;
    if (window.STORY && STORY.engine === false){ if (T.id || T.cands){ clearTrace(); T.id = null; } return; }   // (the storylet engine is off: the array learns nothing and traces no one: story.js)
    try { watch(dt); } catch (e) {}
    const id = typeof MON !== 'undefined' && MON.id;
    if (!panel) return;
    if (!id){ if (T.id || T.cands) { clearTrace(); T.id = null; } T.seenOut = 0; return; }
    if (T.id && T.id !== id){ clearTrace(); T.id = null; T.seenOut = 0; }
    const p = people.get(id); if (!p) return;
    if (T.done && now - T.done > 12000){ clearTrace(); T.done = null; }
    const out = !!(p._ec && p._ea > .3) || !!p.walk;
    if (out){ T.seenOut = now; if (T.cands && T.cands.length && now - T.t0 > 1500){ clearTrace(); T.id = null; } if (T.done && now - T.done > 6000){ clearTrace(); T.done = null; } return; }
    const home = p.pod && p.at === p.home;
    if (home && !T.cands && !T.done && T.seenOut && now - T.seenOut < 8000 && !D.full(id)) startTrace(p);
    else if (T.cands && now - T.t0 > 120000){ clearTrace(); T.id = null; }
  }, 250);
  D._trace = T; D._start = p => startTrace(p);   // (for checks)
  return D;
})();
