// Neon Terrarium: the monitor. Click someone in the street and a surveillance feed opens in the top right: a live crop of
// the view around them (no face drawn; the player makes up their own), what the feed has logged, and a notebook that
// starts blank and fills only with what was seen or heard (story.js). The camera can follow them. Also the fast forward
// control at the top of the screen, for watching days go by.
// All game scripts share one scope and load in order (see index.html). Loads after story.js.
'use strict';
const MON = (() => {
  const M = { id: null, tab: 'log', rev: -1, drawnAt: 0, lastDoor: null };
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
    if (M.id !== id) FC.init = false;   // (a new subject: the feed's camera starts from the view's angle)
    M.id = id; M.rev = -1; M.lastDoor = null; el.hidden = false; document.body.classList.add('watching');
    if (window.STORY) STORY.setWatch(id);
    render(true); drawPins(true);
  };
  M.close = () => { M.id = null; el.hidden = true; document.body.classList.remove('watching'); MON_FOCUS.on = false; if (window.STORY) STORY.setWatch(null); };
  M.userPan = () => {};   // (the main view is the player's own: the feed has its own camera)

  /* ---------- pins: people kept a click away (a star by the name; chips by the monitor; a chip glows while its person is in a story moment) ---------- */
  const PIN_KEY = 'neonIsland.pins', PIN_MAX = 6;
  let pins = []; try { pins = JSON.parse(localStorage.getItem(PIN_KEY) || '[]').filter(x => typeof x === 'string').slice(0, PIN_MAX); } catch (e){ pins = []; }
  const savePins = () => { try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (e){} };
  const pinBox = $m('monPins'), pinBtn = $m('monPin');
  const pinName = id => { const k = window.STORY && STORY.known(id); if (k && k.first) return k.first + (k.last ? ' ' + k.last[0] + '.' : '');
    const d = window.STORY ? STORY.descOf(id) : 'someone'; return d.replace(/^(an?|the) (unknown )?/i, '').replace(/^\w/, c => c.toUpperCase()); };
  let pinSig = '';
  M.pins = () => pins.slice();
  M.togglePin = id => { if (!id) return; const i = pins.indexOf(id); if (i >= 0) pins.splice(i, 1); else { pins.unshift(id); if (pins.length > PIN_MAX) pins.pop(); } savePins(); drawPins(true); };
  function drawPins(force){
    if (typeof people !== 'undefined' && typeof pplReady !== 'undefined' && pplReady && people.size){ const n = pins.length; pins = pins.filter(id => people.has(id)); if (pins.length !== n) savePins(); }   // (someone gone from the city)
    if (pinBtn){ const on = !!M.id && pins.includes(M.id); pinBtn.classList.toggle('on', on); pinBtn.textContent = on ? '★' : '☆'; pinBtn.title = on ? 'Unpin' : 'Pin: keep them a click away'; }
    const rows = pins.map(id => { const p = typeof people !== 'undefined' && people.get(id); return [id, pinName(id), !!(p && p.scene), id === M.id]; });
    const sig = JSON.stringify(rows); if (!force && sig === pinSig) return; pinSig = sig;
    pinBox.innerHTML = rows.map(([id, nm, live, on]) => '<div class="mon-pin' + (live ? ' live' : '') + (on ? ' on' : '') + '" data-id="' + esc(id) + '" title="' + esc(nm) + (live ? ': something is happening' : '') + '"><span class="st">★</span><b>' + esc(nm) + '</b><button class="x" aria-label="Unpin" title="Unpin">✕</button></div>').join('');
  }
  pinBox.addEventListener('click', e => { const chip = e.target.closest('.mon-pin'); if (!chip) return; const id = chip.dataset.id;
    if (e.target.closest('.x')){ M.togglePin(id); return; } if (typeof people !== 'undefined' && people.has(id)) M.open(id); });
  if (pinBtn) pinBtn.addEventListener('click', () => M.togglePin(M.id));
  setInterval(() => drawPins(false), 700);
  $m('monClose').addEventListener('click', M.close);
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
  /* ---------- the feed: a camera of its own ---------- */
  // The feed is drawn by its own small camera over the subject, wherever the main view is: the scene's color pass into a little target (RW x RH, a few
  // frames a second is enough for a security feed), read back without stalling (a pixel-pack buffer and a fence, picked up a frame or two later) and
  // drawn into the panel's canvas. The camera keeps them in sight: every quarter second it checks the line from them up to the camera against the
  // buildings' heights, and if it's blocked turns to another of eight angles (the nearest clear one), or tilts steeper toward looking straight down.
  const RW = 192, RH = 108, HALF = 2.6, EVERY = 3;   // (render size, the view's half height in world units, a frame drawn every EVERY frames)
  const FC = { init: false, yaw: 0, pitch: PITCH0, tyaw: 0, tpitch: PITCH0, at: null, check: 0, frame: 0, fence: null, ready: false, x: 0, z: 0, y: 0 };
  let rt = null, fcam = null, pbo = null, pix = null, img = null, off = null, og = null;
  const glc = renderer.getContext();
  function setupFeed(){
    rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
    fcam = new THREE.OrthographicCamera(-HALF*RW/RH, HALF*RW/RH, HALF, -HALF, NEAR, FAR); fcam.layers.enableAll(); fcam.layers.disable(6);
    if (glc.PIXEL_PACK_BUFFER){ pbo = glc.createBuffer(); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, pbo); glc.bufferData(glc.PIXEL_PACK_BUFFER, RW*RH*4, glc.STREAM_READ); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null); }
    pix = new Uint8Array(RW*RH*4); off = document.createElement('canvas'); off.width = RW; off.height = RH; og = off.getContext('2d'); img = og.createImageData(RW, RH);
  }
  // how tall the city is at a ground point (0 off the plots and in the lanes round a building's edge)
  function heightAt(x, z){
    const i = Math.round(x/LOT), j = Math.round(z/LOT), c = cells.get(ckey(i, j)); if (!c) return 0;
    if (Math.abs(x - i*LOT) > LOT*.42 || Math.abs(z - j*LOT) > LOT*.42) return 0;
    return c.height || 0;
  }
  // is the line from the point up toward a camera at this angle clear of buildings
  function clear(x, y, z, yw, pt){
    const cp = Math.cos(pt), dx = Math.sin(yw)*cp, dy = Math.sin(pt), dz = Math.cos(yw)*cp;
    for (let t = .35; y + dy*t < 60 && t < 80; t += .3){ const h = heightAt(x + dx*t, z + dz*t); if (h > 0 && y + dy*t < h - .15) return false; }
    return true;
  }
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
  function aim(at, dt){
    if (!FC.init){ FC.init = true; FC.yaw = FC.tyaw = yaw; FC.pitch = FC.tpitch = Math.max(PITCH, PITCH0); FC.check = 0; FC.x = at.x; FC.z = at.z; FC.y = at.y; }
    FC.check -= dt;
    if (FC.check <= 0 && !at.inside){ FC.check = .25;
      const y = at.y + .1;
      if (!clear(at.x, y, at.z, FC.tyaw, FC.tpitch)){
        let found = false;
        for (const pt of [FC.tpitch, PITCH0, 48*PI/180, 62*PI/180, PITCH_MAX]){
          if (pt < FC.tpitch - 1e-3 && pt !== PITCH0) continue;
          for (const dk of [0, 1, -1, 2, -2, 3, -3, 4]){ const yw = Math.round(FC.tyaw/(PI/4))*(PI/4) + dk*PI/4;
            if (clear(at.x, y, at.z, yw, pt)){ FC.tyaw = yw; FC.tpitch = pt; found = true; break; } }
          if (found) break; }
        if (!found) FC.tpitch = PITCH_MAX;
      } else if (FC.tpitch > PITCH0 + .01 && clear(at.x, y, at.z, FC.tyaw, PITCH0)) FC.tpitch = PITCH0;   // (back down to the usual tilt once that's clear)
    }
    const k = Math.min(1, dt*3.5);
    FC.yaw += angDiff(FC.tyaw, FC.yaw)*k; FC.pitch += (FC.tpitch - FC.pitch)*k;
    FC.x += (at.x - FC.x)*Math.min(1, dt*6); FC.z += (at.z - FC.z)*Math.min(1, dt*6); FC.y += (at.y - FC.y)*Math.min(1, dt*6);
  }
  function drawFeed(at){
    if (!rt) setupFeed();
    const cp = Math.cos(FC.pitch), sy = Math.sin(FC.yaw), cy = Math.cos(FC.yaw), sp = Math.sin(FC.pitch);
    fcam.position.set(FC.x + sy*cp*CAM_DIST, FC.y + sp*CAM_DIST, FC.z + cy*cp*CAM_DIST); fcam.lookAt(FC.x, FC.y, FC.z); fcam.updateMatrixWorld();
    const res0 = FOL_UNI.res.value.clone(), rt0 = renderer.getRenderTarget(), all0 = SIDE_ARC.all, ac = renderer.autoClear;
    try {
      FOL_UNI.res.value.set(RW, RH); SIDE_ARC.all = true;   // (every wall, whichever way it faces: the feed turns on its own)
      cullFrame(fcam); CULL.lvl = -1; CULL.sd = false;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x05080f, 1); renderer.autoClear = true;
      renderer.render(scene, fcam);
      if (pbo && !FC.fence){
        glc.bindBuffer(glc.PIXEL_PACK_BUFFER, pbo); glc.readPixels(0, 0, RW, RH, glc.RGBA, glc.UNSIGNED_BYTE, 0); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null);
        FC.fence = glc.fenceSync(glc.SYNC_GPU_COMMANDS_COMPLETE, 0); glc.flush();
      } else if (!pbo){ glc.readPixels(0, 0, RW, RH, glc.RGBA, glc.UNSIGNED_BYTE, pix); FC.ready = true; }
    } finally {
      FOL_UNI.res.value.copy(res0); SIDE_ARC.all = all0; renderer.autoClear = ac; renderer.setRenderTarget(rt0); sideArc(); cullFrame();   // (the main view's culling back as it was)
    }
  }
  function pickUp(){
    if (!FC.fence) return;
    if (glc.getSyncParameter(FC.fence, glc.SYNC_STATUS) !== glc.SIGNALED) return;
    glc.deleteSync(FC.fence); FC.fence = null;
    glc.bindBuffer(glc.PIXEL_PACK_BUFFER, pbo); glc.getBufferSubData(glc.PIXEL_PACK_BUFFER, 0, pix); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null);
    FC.ready = true;
  }
  function toCanvas(){
    const d = img.data;
    for (let y = 0; y < RH; y++){ const src = (RH - 1 - y)*RW*4; d.set(pix.subarray(src, src + RW*4), y*RW*4); }   // (the target's rows are bottom up)
    og.putImageData(img, 0, 0); FC.ready = false; FC.shown = true;
  }
  let noiseSeed = 1, lastT = 0;
  const rnd = () => (noiseSeed = (noiseSeed*16807) % 2147483647)/2147483647;
  M.blit = () => {
    if (!M.id){ MON_FOCUS.on = false; return; }
    const p = people.get(M.id), W = cv.width, H = cv.height, now = performance.now(), dt = Math.min(.1, (now - (lastT || now))/1000); lastT = now;
    const at = subjectAt();
    if (at){ MON_FOCUS.on = true; MON_FOCUS.x = at.x; MON_FOCUS.z = at.z; aim(at, dt); } else MON_FOCUS.on = false;
    pickUp(); if (FC.ready) toCanvas();
    if (at && ++FC.frame % EVERY === 0){ try { drawFeed(at); } catch (e){ if (!M.feedErr){ M.feedErr = true; console.warn('monitor feed:', e); } } }
    g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H);
    let shown = false;
    if (at && FC.shown){ g.drawImage(off, 0, 0, W, H); shown = true; }
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
    else if (!shown){ g.textAlign = 'center'; g.fillStyle = '#8e9bb2'; g.fillText('FINDING SUBJECT', W/2, H/2 - 5); g.textAlign = 'left'; }
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
