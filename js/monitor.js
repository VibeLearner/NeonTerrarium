// Neon Terrarium: the monitor. Click someone in the street and a surveillance feed opens in the top right: a live crop of
// the view around them (no face drawn; the player makes up their own), what the feed has logged, and a notebook that
// starts blank and fills only with what was seen or heard (story.js). The camera can follow them. Also the fast forward
// control at the top of the screen, for watching days go by.
// All game scripts share one scope and load in order (see index.html). Loads after story.js.
'use strict';
const MON = (() => {
  const M = { id: null, follow: true, tab: 'log', rev: -1, drawnAt: 0, lastDoor: null };
  const $m = id => document.getElementById(id);
  const el = $m('monitor'), cv = $m('monFeed'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const view = document.getElementById('view');
  const clockText = t => { const d = Math.floor(t/1440) + 1, m = Math.floor(t % 1440); return 'D' + d + ' ' + String(Math.floor(m/60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  /* ---------- picking someone ---------- */
  const _v = new THREE.Vector3();
  M.pick = (cx, cy) => {
    if (typeof pplList === 'undefined') return null;
    const r = view.getBoundingClientRect(), VP = comp.uniforms.VP.value, tall = (16/PX)/zoom*r.height/2, wide = tall*.75;
    let best = null, bd = Infinity;
    for (const p of pplList){
      if (!p._ec || !(p._ea > .5) || p.x === undefined) continue;
      _v.set(p.x, p._ey ?? CURB, p.z).applyMatrix4(VP);
      if (_v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) continue;
      const fx = r.left + (_v.x*.5 + .5)*r.width, fy = r.top + (1 - (_v.y*.5 + .5))*r.height;
      const dx = cx - fx, dy = cy - fy;
      if (Math.abs(dx) > wide/2 + 4 || dy < -tall - 4 || dy > 5) continue;
      const d = dx*dx + (dy + tall/2)**2; if (d < bd){ bd = d; best = p; }
    }
    return best ? best.id : null;
  };

  /* ---------- the person under the cursor: corner brackets round them, so a click picks the one you mean ---------- */
  const hov = document.createElement('div'); hov.id = 'npcHover'; hov.className = 'npc-hover'; hov.hidden = true; document.body.appendChild(hov);
  let hovAt = null; M.hoverId = null;
  M.hoverAt = (cx, cy) => { hovAt = cx === null || cx === undefined ? null : [cx, cy]; if (!hovAt) M.hoverFrame(); };
  M.hoverFrame = () => {
    const id = hovAt ? M.pick(hovAt[0], hovAt[1]) : null, p = id && people.get(id);
    M.hoverId = id; view.style.cursor = id ? 'pointer' : '';
    if (!p){ if (!hov.hidden) hov.hidden = true; return; }
    const r = view.getBoundingClientRect(), tall = (16/PX)/zoom*r.height/2, wide = tall*.75;
    _v.set(p.x, p._ey ?? CURB, p.z).applyMatrix4(comp.uniforms.VP.value);
    const fx = r.left + (_v.x*.5 + .5)*r.width, fy = r.top + (1 - (_v.y*.5 + .5))*r.height, pad = 3;
    hov.hidden = false; hov.classList.toggle('watched', id === M.id);
    hov.style.left = Math.round(fx - wide/2 - pad) + 'px'; hov.style.top = Math.round(fy - tall - pad) + 'px';
    hov.style.width = Math.round(wide + pad*2) + 'px'; hov.style.height = Math.round(tall + pad*2) + 'px';
  };

  /* ---------- open, close, follow ---------- */
  M.open = id => {
    M.id = id; M.follow = true; M.rev = -1; M.lastDoor = null; el.hidden = false; document.body.classList.add('watching');
    $m('monFollow').classList.add('on');
    if (window.STORY) STORY.setWatch(id);
    render(true);
  };
  M.close = () => { M.id = null; el.hidden = true; document.body.classList.remove('watching'); if (window.STORY) STORY.setWatch(null); };
  M.userPan = () => { if (M.id && M.follow){ M.follow = false; $m('monFollow').classList.remove('on'); } };
  $m('monClose').addEventListener('click', M.close);
  $m('monFollow').addEventListener('click', () => { M.follow = !M.follow; $m('monFollow').classList.toggle('on', M.follow); });
  document.querySelectorAll('#monTabs button').forEach(b => b.addEventListener('click', () => { M.tab = b.dataset.tab; document.querySelectorAll('#monTabs button').forEach(x => x.classList.toggle('on', x === b)); render(true); }));

  // where the subject is in the world: on the street, or the door of the place they went into
  function subjectAt(){
    const p = M.id && people.get(M.id); if (!p) return null;
    const out = (p.scene && p.sc && p.sc.mode !== 'in') || p.walk || p.spot || (p.metro) || (p.club);
    if (out && p.x !== undefined) return { x: p.x, z: p.z, y: (p._ey ?? CURB) + .45, inside: false };
    const pl = places.get((p.sc && p.sc.place) || p.at); if (!pl || !pl.doors.length) return p.x !== undefined ? { x: p.x, z: p.z, y: CURB + .45, inside: true } : null;
    if (!M.lastDoor || !pl.doors.includes(M.lastDoor)) M.lastDoor = nearestOf(pl.doors, p.x ?? pl.x, p.z ?? pl.z);
    const d = M.lastDoor; return { x: d.stand.x, z: d.stand.z, y: CURB + .45, inside: true };
  }
  // the camera keeps them in the middle part of the screen
  function followCam(at){
    if (!M.follow || !at) return;
    _v.set(at.x, at.y, at.z).applyMatrix4(comp.uniforms.VP.value);
    if (Math.abs(_v.x) > .3 || Math.abs(_v.y) > .3 || !isFinite(_v.x)){ camGoal.x = at.x; camGoal.z = at.z; }
  }

  /* ---------- the feed: a crop of the frame just drawn ---------- */
  let noiseSeed = 1;
  const rnd = () => (noiseSeed = (noiseSeed*16807) % 2147483647)/2147483647;
  M.blit = () => {
    if (!M.id) return;
    const p = people.get(M.id), W = cv.width, H = cv.height, now = performance.now();
    const at = subjectAt(); followCam(at);
    g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H);
    let shown = false;
    if (at){
      _v.set(at.x, at.y, at.z).applyMatrix4(comp.uniforms.VP.value);
      if (_v.x > -.95 && _v.x < .95 && _v.y > -.95 && _v.y < .95){
        const sh = Math.max(24, (4.4/zoom)*view.height/2), sw = sh*W/H;
        const sx = (_v.x*.5 + .5)*view.width - sw/2, sy = (1 - (_v.y*.5 + .5))*view.height - sh/2;
        try { g.drawImage(view, sx, sy, sw, sh, 0, 0, W, H); shown = true; } catch (e){}
      }
    }
    // the look of a camera feed: a cold tint, scanlines, a vignette, static when there's nothing to see
    g.fillStyle = 'rgba(20,60,70,.18)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    if (!shown || (at && at.inside)){
      noiseSeed = (Math.floor(now/80) % 9973) + 1;
      g.fillStyle = 'rgba(200,220,230,.10)'; for (let k = 0; k < 260; k++) g.fillRect(Math.floor(rnd()*W), Math.floor(rnd()*H), 2, 1);
    }
    const vg = g.createRadialGradient(W/2, H/2, H*.3, W/2, H/2, W*.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.font = '10px "Silkscreen", monospace'; g.textBaseline = 'top';
    g.fillStyle = Math.floor(now/600) % 2 ? '#ff4f6a' : 'rgba(255,79,106,.25)'; g.fillRect(8, 9, 6, 6);
    g.fillStyle = '#e3d6bd'; g.fillText('REC', 18, 7);
    g.textAlign = 'right'; g.fillText('CAM ' + String(1 + (hash(M.id) % 48)).padStart(2, '0'), W - 8, 7); g.textAlign = 'left';
    if (window.STORY) g.fillText(clockText(STORY.clock), 8, H - 16);
    if (!p){ g.textAlign = 'center'; g.fillStyle = '#ffb347'; g.fillText('SUBJECT NOT FOUND', W/2, H/2 - 5); g.textAlign = 'left'; }
    else if (at && at.inside){ g.textAlign = 'center'; g.fillStyle = '#ffb347'; g.fillText('SIGNAL LOST', W/2, H/2 - 5); g.fillStyle = '#8e9bb2'; g.fillText('watching the door', W/2, H/2 + 8); g.textAlign = 'left'; }
    else if (!shown){ g.textAlign = 'center'; g.fillStyle = '#8e9bb2'; g.fillText(M.follow ? 'FINDING SUBJECT' : 'OUT OF VIEW', W/2, H/2 - 5); g.textAlign = 'left'; }
    if (window.STORY && (STORY.rev !== M.rev || now - M.drawnAt > 1500)) render(false);
  };

  /* ---------- the log and the notebook ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VIA = v => !v ? '' : ({ document: 'read on a document', introduction: 'introduced', conversation: 'overheard', phone: 'heard on a comm call', feed: 'posted', seen: 'seen', hearsay: 'heard secondhand' }[v.channel] || v.channel);
  const HOW = { seen: 'Seen', conversation: 'Overheard', phone: 'On the comm', feed: 'Posted', document: 'Read', introduction: 'Introduced' };
  const DETAIL = { job: 'Job', employer: 'Employer', home: 'Home', cohabitants: 'Lives with', 'age-range': 'Age' };
  function render(force){
    if (!M.id || !window.STORY) return;
    M.rev = STORY.rev; M.drawnAt = performance.now();
    const k = STORY.known(M.id) || {};
    $m('monName').textContent = k.first ? (k.first + (k.last ? ' ' + k.last : '')).toUpperCase() : 'SUBJECT';
    $m('monSub').textContent = k.first ? (k.firstVia && k.firstVia.verified ? 'name verified' : 'name unconfirmed') : 'unknown';
    const body = $m('monBody'), atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
    const top = M.tab !== 'log' && force;   // (the notebook opens at its top)
    if (M.tab === 'log'){
      const L = STORY.log(M.id);
      if (!STORY.on) body.innerHTML = '<p class="mon-empty">' + (STORY.failed ? 'The story data did not load: ' + esc(STORY.failed) : 'Loading the city\'s stories...') + '</p>';
      else if (!L.length) body.innerHTML = '<p class="mon-empty">Nothing logged yet.</p>';
      else body.innerHTML = L.map(e => { const t = STORY.render(e), re = e.first && e.first !== t;
        return '<div class="ml ' + (e.kind || '') + '"><time>' + clockText(e.t) + '</time><span>' + esc(t) + (re ? ' <i title="' + esc('first logged as: ' + e.first) + '">rewritten</i>' : '') + '</span></div>'; }).join('');
      fitLog(body);
      if (atBottom || force) body.scrollTop = body.scrollHeight;
      return;
    }
    // the notebook
    $m('monBody').style.maxHeight = '';
    const N = STORY.notes(M.id), parts = [];
    const det = [];
    det.push(row('Name', k.first ? k.first + (k.last ? ' ' + k.last : '') : null, k.first ? (k.lastVia && k.lastVia.verified ? k.lastVia : k.firstVia) : null));
    if (k.nick) det.push(row('Goes by', k.nick, k.nickVia));
    for (const n of N){ const f = (n.fact || '').split('.').slice(1).join('.'); if (n.who === M.id && (n.channel === 'document' || n.channel === 'introduction') && DETAIL[f]) det.push(row(DETAIL[f], STORY.render(n), n)); }
    for (const f of ['Job', 'Home', 'Lives with']) if (!det.some(d => d.includes('>' + f + '<'))) det.push(row(f, null, null));
    parts.push('<h4>Details</h4>' + det.join(''));
    const around = STORY.peopleAround(M.id);
    parts.push('<h4>People around them</h4>' + (around.length ? around.map(id => { const kk = STORY.known(id) || {}, I = STORY.identOf(id);
      const nm = kk.first ? kk.first + (kk.last ? ' ' + kk.last : '') : STORY.descOf(id).replace(/^an? /, '').replace(/^\w/, c => c.toUpperCase()), rl = STORY.relLabel(kk);
      const can = people.has(id);
      return '<div class="mp">' + (can ? '<button data-id="' + esc(id) + '">' + esc(nm) + '</button>' : '<b>' + esc(nm) + '</b>') + (rl ? ' <span>' + esc(rl) + '</span>' : '') +
        '<small>' + [kk.first ? 'name ' + VIA(kk.firstVia) : '', rl ? 'relation ' + VIA(kk.relVia) : ''].filter(Boolean).join(' · ') + '</small></div>'; }).join('') : '<p class="mon-empty">None yet.</p>'));
    const loose = STORY.loose(M.id);
    if (loose.length) parts.push('<h4>Names heard</h4><p class="mon-loose">' + loose.map(esc).join(', ') + ' <small>(no face to put to them yet)</small></p>');
    const obs = [];
    for (const n of N){
      if (n.passing || (n.learned && n.learned.rel)) continue;
      const f = (n.fact || '').split('.').slice(1).join('.');
      if (n.who === M.id && (n.channel === 'document' || n.channel === 'introduction') && DETAIL[f]) continue;
      if (n.fact === 'hearsay'){ obs.push('<div class="mo"><time>' + clockText(n.t) + '</time><span><b>Secondhand</b> ' + esc(n.text) + ' <small>unconfirmed · heard from ' + (n.sources ? n.sources.length : 1) + (n.sources && n.sources.length > 1 ? ' people' : ' person') + '</small></span></div>'); continue; }
      if (n.learned && n.learned.names && n.learned.names.length && /first-name|full-name|last-name|nickname/.test(n.fact)) continue;
      const t = STORY.render(n).replace(/^(Overheard|Posted to the mesh|Comm, one side):\s*/, '');
      obs.push('<div class="mo"><time>' + clockText(n.t) + '</time><span><b>' + (HOW[n.channel] || n.channel) + '</b> ' + esc(t) + ' <small>' + (n.verified ? 'verified' : 'unconfirmed') + '</small></span></div>');
    }
    parts.push('<h4>Observations</h4>' + (obs.length ? obs.join('') : '<p class="mon-empty">Nothing yet.</p>'));
    // for testing: the truth the player isn't meant to have
    const sp = STORY.sp(people.get(M.id)), deg = STORY.degreesOf();
    if (sp){ const p = people.get(M.id);
      parts.push('<details class="mon-key"><summary>Answer key (for testing)</summary><p>' + esc(sp.first + ' ' + sp.last + (sp.nick ? ' ("' + sp.nick + '")' : '') + ', ' + sp.age + ', ' + sp.life + ' life') +
        '<br>' + esc((p.job ? 'works: ' + STORY.placeText(places.get(p.job)) : 'no job') + (STORY.isSick(M.id) ? ' · sick today' : '')) +
        '<br>' + esc(sp.rels.slice(0, 14).map(r => { const I = STORY.identOf(r.who); return I.first + ' (' + r.kind.replace(/-of$/, '') + ')'; }).join(', ')) +
        (deg ? '<br>The web: ' + deg.people + ' people, ' + deg.mean + ' steps apart on average, ' + Math.round(deg.within6*100) + '% within six, farthest ' + deg.max : '') + '</p></details>'); }
    const open = body.querySelector('details.mon-key') && body.querySelector('details.mon-key').open;
    body.innerHTML = parts.join('');
    if (open && body.querySelector('details.mon-key')) body.querySelector('details.mon-key').open = true;
    if (top) body.scrollTop = 0;
    body.querySelectorAll('.mp button').forEach(b => b.addEventListener('click', () => M.open(b.dataset.id)));
  }
  // the log is as tall as its last four entries and scrolls back from there (the notebook keeps the panel's full height)
  function fitLog(body){
    const L = body.querySelectorAll('.ml');
    if (L.length <= 4){ body.style.maxHeight = ''; return; }
    let h = 0; for (let i = L.length - 4; i < L.length; i++) h += L[i].offsetHeight;
    const cs = getComputedStyle(body); body.style.maxHeight = Math.ceil(h + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2) + 'px';
  }
  function row(label, value, via){
    return '<div class="md"><b>' + label + '</b><span>' + (value ? esc(value) : '<i>———</i>') + '</span>' + (value && via ? '<small>' + VIA(via) + ', ' + (via.verified ? 'verified' : 'unconfirmed') + '</small>' : '') + '</div>';
  }

  /* ---------- fast forward ---------- */
  document.querySelectorAll('#ffbar button[data-ff]').forEach(b => b.addEventListener('click', () => {
    FF.set(+b.dataset.ff); document.querySelectorAll('#ffbar button[data-ff]').forEach(x => x.classList.toggle('on', x === b));
  }));
  M.syncBar = () => { if (window.STORY){ const t = STORY.clock, txt = 'Day ' + (Math.floor(t/1440) + 1); if ($m('ffDay').textContent !== txt) $m('ffDay').textContent = txt; } };
  return M;
})();
