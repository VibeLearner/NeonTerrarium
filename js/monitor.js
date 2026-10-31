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
  // a touch screen: the monitor opens as the shared bottom sheet (tsheet.js), and folds to a follow chip; null on a desktop
  const TS = typeof TSHEET !== 'undefined' && TSHEET.on ? TSHEET : null;
  const clockText = t => { const d = Math.floor(t/1440) + 1, m = Math.floor(t % 1440); return 'D' + d + ' ' + String(Math.floor(m/60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  /* ---------- picking someone ---------- */
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  // Only someone the player can actually see: what's drawn under the cursor is read back from the depth of the last frame
  // (one pixel), and a person counts only if they're no further away than it (a building in front is nearer). Their
  // depth is taken at the feet; a sprite standing up off the ground is a little nearer than that, hence the slack.
  let dRT = null, dMat = null, dScene = null, dCam = null; const dBuf = new Uint8Array(4), dAt = { x: NaN, y: NaN, f: -1, d: 1 };
  // The depth is read back from the graphics card. Read at once (a click), the processor waits for the card to finish
  // everything queued, which can be tens of milliseconds when it's busy; so hovering asks for it without waiting
  // (a pixel-pack buffer and a fence) and uses the newest answer that has come back, a frame or two old.
  const dec = b => (255/256)*(b[0]/255/16777216 + b[1]/255/65536 + b[2]/255/256 + b[3]/255);
  let dPbo = null, dPend = null, dLate = null;   // dLate: { x, y, d } the newest depth that has come back
  function depthSoon(cx, cy){
    const glc = renderer.getContext();
    if (!glc.fenceSync || typeof rtC === 'undefined' || !rtC || !rtC.depthTexture) return depthUnder(cx, cy);
    if (dPend && glc.getSyncParameter(dPend.fence, glc.SYNC_STATUS) === glc.SIGNALED){
      glc.bindBuffer(glc.PIXEL_PACK_BUFFER, dPbo); glc.getBufferSubData(glc.PIXEL_PACK_BUFFER, 0, dBuf); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null);
      glc.deleteSync(dPend.fence); dLate = { x: dPend.x, y: dPend.y, d: dec(dBuf) }; dPend = null;
    }
    if (!dPend){
      depthUnder(cx, cy, true);
      if (!dPbo){ dPbo = glc.createBuffer(); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, dPbo); glc.bufferData(glc.PIXEL_PACK_BUFFER, 4, glc.STREAM_READ); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null); }
      const prev = renderer.getRenderTarget(); renderer.setRenderTarget(dRT);
      glc.bindBuffer(glc.PIXEL_PACK_BUFFER, dPbo); glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, 0); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null);
      renderer.setRenderTarget(prev);
      dPend = { fence: glc.fenceSync(glc.SYNC_GPU_COMMANDS_COMPLETE, 0), x: cx, y: cy };
    }
    // the newest answer, if it was for about here; otherwise no depth test this frame (a person behind a wall may outline for a frame)
    return dLate && Math.abs(dLate.x - cx) + Math.abs(dLate.y - cy) < 24 ? dLate.d : 1;
  }
  function depthUnder(cx, cy, drawOnly){
    if (typeof rtC === 'undefined' || !rtC || !rtC.depthTexture) return 1;
    const f = typeof pplFrame !== 'undefined' ? pplFrame : 0;
    if (!drawOnly && dAt.x === cx && dAt.y === cy && dAt.f === f) return dAt.d;
    if (!dRT){
      dRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      dMat = new THREE.ShaderMaterial({ uniforms: { tD: { value: null }, uv: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: '#include <packing>\nuniform sampler2D tD; uniform vec2 uv; void main(){ gl_FragColor = packDepthToRGBA(texture2D(tD, uv).x); }' });
      dScene = new THREE.Scene(); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dMat); q.frustumCulled = false; dScene.add(q); dCam = new THREE.Camera();
    }
    const r = viewRect();
    dMat.uniforms.tD.value = rtC.depthTexture; dMat.uniforms.uv.value.set((cx - r.left)/r.width, 1 - (cy - r.top)/r.height);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(dRT); renderer.render(dScene, dCam);
    if (drawOnly){ renderer.setRenderTarget(prev); return 1; }   // (depthSoon reads it back without waiting)
    renderer.readRenderTargetPixels(dRT, 0, 0, 1, 1, dBuf); renderer.setRenderTarget(prev);
    const d = dec(dBuf);
    dAt.x = cx; dAt.y = cy; dAt.f = f; dAt.d = d; return d;
  }
  M.ready = () => typeof megasOfKind === 'function' && megasOfKind('police').length > 0;   // (people can be watched once the city has a police station)
  // on a touch screen, zoomed out past this (the zoom on the short side, zoomS: 16 is where a phone starts) people are specks: a tap there
  // means the city, never a person, so nobody is picked. Closer in than the starting view: a player zooms in to pick someone, and at the
  // starting view or further out taps on people were mostly accidents. (With a mouse there's no limit: the pointer is precise and the
  // brackets show who first)
  const PICK_ZOOM_TOUCH = 12;
  M.pick = (cx, cy, exact) => {   // (exact: a click, worth waiting for the card; hovering takes the depth a frame or two late)
    if (typeof pplList === 'undefined' || !M.ready()) return null;
    if (TS && typeof zoomS === 'function' && zoomS() > PICK_ZOOM_TOUCH) return null;
    const r = viewRect(), VP = comp.uniforms.VP.value, tall = (16/PX)*PPL_S/zoom*r.height/2, wide = tall*.75;
    // a finger gets at least 44 px round each person, however far out the view is (the nearest one wins where they overlap)
    const hw = TS ? Math.max(wide/2 + 4, 22) : 0, hh = TS ? Math.max(tall/2 + 4.5, 22) : 0;
    const cands = [];
    for (const p of pplList){
      if (!p._ec || !(p._ea > .5) || p.x === undefined) continue;
      _v.set(p.x, p._ey ?? CURB, p.z).applyMatrix4(VP);
      if (_v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) continue;
      const fx = r.left + (_v.x*.5 + .5)*r.width, fy = r.top + (1 - (_v.y*.5 + .5))*r.height;
      const dx = cx - fx, dy = cy - fy;
      if (TS){ if (Math.abs(dx) > hw || Math.abs(dy + tall/2) > hh) continue; }
      else if (Math.abs(dx) > wide/2 + 4 || dy < -tall - 4 || dy > 5) continue;
      cands.push([dx*dx + (dy + tall/2)**2, p, _v.z*.5 + .5]);
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a[0] - b[0]);
    if (exact){   // a click: the depth of what's drawn there, read back from the card (worth the wait once)
      const sd = depthUnder(cx, cy), slack = 1.5/(FAR - NEAR);   // (a unit and a half of slack: a sprite's head is nearer than its feet)
      for (const [, p, pd] of cands) if (sd >= .9999 || pd <= sd + slack) return p.id;
      return null;
    }
    // hovering: the city's own pick along the same ray says how far the nearest building is. Reading the depth back from the card
    // every frame stalled the game on each read (a sixth of the main thread in the Oct 25 trace) and was where its WebGL errors came from.
    let tc = Infinity;
    if (typeof pickAtSoft === 'function'){ const pk = pickAtSoft(cx, cy); if (pk && pk.kind !== 'sky') tc = typeof pk.d === 'number' ? pk.d : pk.p ? _w.copy(pk.p).sub(ray.ray.origin).dot(ray.ray.direction) : Infinity; }
    for (const [, p] of cands){ const tp = _w.set(p.x, p._ey ?? CURB, p.z).sub(ray.ray.origin).dot(ray.ray.direction); if (tp <= tc + 1.5) return p.id; }
    return null;
  };

  /* ---------- the person under the cursor: corner brackets round them, so a click picks the one you mean ---------- */
  const hov = document.createElement('div'); hov.id = 'npcHover'; hov.className = 'npc-hover'; hov.hidden = true; document.body.appendChild(hov);
  let hovAt = null; M.hoverId = null;
  M.hoverAt = (cx, cy) => { hovAt = cx === null || cx === undefined ? null : [cx, cy]; if (!hovAt) M.hoverFrame(); };
  // the brackets: one on whoever is under the cursor, and one that stays on the person being watched until the monitor closes
  const sel = document.createElement('div'); sel.id = 'npcSel'; sel.className = 'npc-hover watched'; sel.hidden = true; document.body.appendChild(sel);
  function bracket(box, p){
    if (!p || p.x === undefined || !p._ec || !(p._ea > .3)){ if (!box.hidden) box.hidden = true; return false; }   // (not drawn: indoors, or away)
    const r = viewRect(), tall = (16/PX)*PPL_S/zoom*r.height/2, wide = tall*.75;
    _v.set(p.x, p._ey ?? CURB, p.z).applyMatrix4(comp.uniforms.VP.value);
    if (_v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2){ if (!box.hidden) box.hidden = true; return false; }
    const fx = r.left + (_v.x*.5 + .5)*r.width, fy = r.top + (1 - (_v.y*.5 + .5))*r.height, pad = 3;
    box.hidden = false;
    box.style.left = Math.round(fx - wide/2 - pad) + 'px'; box.style.top = Math.round(fy - tall - pad) + 'px';
    box.style.width = Math.round(wide + pad*2) + 'px'; box.style.height = Math.round(tall + pad*2) + 'px';
    return true;
  }
  M.hoverFrame = () => {
    const id = hovAt ? M.pick(hovAt[0], hovAt[1]) : null, p = id && people.get(id);
    M.hoverId = id; view.style.cursor = id ? 'pointer' : '';
    bracket(sel, M.id ? people.get(M.id) : null);
    if (!p || id === M.id){ if (!hov.hidden) hov.hidden = true; return; }   // (the watched one has its own)
    hov.classList.remove('watched'); bracket(hov, p);
  };

  /* ---------- open, close, follow ---------- */
  let openSeq = 0;
  // (stay: on a touch screen, switch the cam to them but leave it folded to its chip: a swipe on the chip)
  M.open = (id, stay) => {
    if (!M.ready()) return;
    if (M.id !== id){ FC.init = false; rwOpen.clear(); }   // (a new subject: the feed's camera starts from the view's angle)
    M.id = id; M.rev = -1; M.lastDoor = null; el.hidden = false; openSeq++;
    if (!TS) document.body.classList.add('watching');   // (the room the log and the pins make for it, top right; on touch it's at the bottom)
    if (window.STORY) STORY.setWatch(id);
    if (TS && !stay) sheetUp();
    render(true); drawPins(true);
  };
  const closeNow = () => { M.id = null; sel.hidden = true; el.hidden = true; document.body.classList.remove('watching'); MON_FOCUS.on = false; if (window.STORY) STORY.setWatch(null); if (chip) chipSync(); };
  M.close = () => { closeNow(); if (TS) TS.close(el); };
  M.refresh = () => { if (M.id) render(false); };
  M.userPan = () => {};   // (the main view is the player's own: the feed has its own camera)

  /* ---------- on a touch screen: the monitor is the bottom sheet ----------
     It opens at a height that shows the feed and the newest lines of the log together: the feed gets smaller on a short screen
     so the log still fits under it, and in landscape it sits beside the log. Peek is the feed alone, full the whole sheet.
     The header has arrows either side of the name that go round the starred people, and a minimize next to the ✕.
     Minimized (or a tap on the city that doesn't pick anyone) it folds to the follow chip above the dock, so the whole city shows
     while the cam keeps them: their picture, their name small (a star if they're starred) and the newest log line. There's no ✕
     on the chip: a tap opens the sheet, and the cam closes from there. With no cam running the chip is a starred person waiting
     (a tap opens the cam on them), and with more than one to show it's the top card of a stack: a swipe up brings the next.
     If the log or the music sheet opens over it, the monitor waits as its chip and comes back after. */
  let chip = null, chipCv = null, chipG = null, wrap = null, noise = null, prevB = null, nextB = null;
  const rwOpen = new Set();   // (the "rewritten" marks tapped open, on touch)
  const feedVisible = () => !TS || TS.isOpen(el);
  const topH = () => el.querySelector('header').offsetHeight + (wrap ? wrap.offsetHeight : cv.offsetHeight) + $m('monTrace').offsetHeight;
  // a short screen on its side (a phone in landscape): the feed goes beside the log (the same test as in touch-sheets.css)
  const landMQ = TS && window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 540px)') : null;
  const isLand = () => !!(landMQ && landMQ.matches);
  const LOG_MIN = 96, LOG_MAX = 170;   // (how tall the log is when the sheet opens: about three lines, and five at most)
  let fedW = -1;
  // the feed's width in the sheet: the sheet's whole width when the log still fits under it, narrower when it wouldn't
  function fitFeed(){
    const W = el.clientWidth || Math.min(640, innerWidth), room = TS.room ? TS.room() : innerHeight - 104;
    const hd = el.querySelector('header').offsetHeight, tabs = $m('monTabs').offsetHeight, tr = $m('monTrace').offsetHeight;
    const fh = isLand() ? Math.min(room - hd, W*.56*9/16) : Math.min(W*9/16, room - hd - tabs - tr - LOG_MIN);
    const fw = Math.max(128, Math.floor(Math.min(W, fh*16/9)));
    if (fw !== fedW){ fedW = fw; el.style.setProperty('--mon-fw', fw + 'px'); }
    return room;
  }
  const peekH = () => { fitFeed(); return isLand() ? el.querySelector('header').offsetHeight + wrap.offsetHeight + 2 : topH() + 6; };
  const halfH = () => { const room = fitFeed(); if (isLand()) return peekH();
    const t = topH() + $m('monTabs').offsetHeight; return t + Math.max(LOG_MIN, Math.min(LOG_MAX, room - t)); };
  function sheetUp(){
    if (TS.isOpen(el)) return;
    TS.open(el, { key: 'monitor', title: '', detent: 'half', detents: ['peek', 'half', 'full'], closeBtn: false, scroll: false, parkOnReplace: true,
      peek: peekH, half: halfH,   // (it opens at half: the feed and the log at once)
      onClose: () => { if (M.id) closeNow(); },
      onCover: () => chipSync() });
    chipSync();
  }
  function park(){ if (!M.id || !TS.isOpen(el)) return; TS.park(el); chipSync(); chipPic(); }
  // the chip's picture: the middle of the newest feed frame, a square of it
  // (fresh: a new frame from the feed. Just after the cam switches, the next one can still be of the last person: chipHold skips it)
  let chipHold = 0;
  function chipPic(fresh){ if (!chipG || !off || !FC.shown || !M.id) return; if (chipHold){ if (fresh) chipHold--; return; } chipG.drawImage(off, (RW - RH)/2, 0, RH, RH, 0, 0, chipCv.width, chipCv.height); chipG.fillStyle = 'rgba(20,60,70,.18)'; chipG.fillRect(0, 0, chipCv.width, chipCv.height); }
  // no picture yet (a starred person with no cam on them, or the cam just switched): a dark square with their star
  function chipBlank(){ if (!chipG) return; const W = chipCv.width, H = chipCv.height; chipG.fillStyle = '#05080f'; chipG.fillRect(0, 0, W, H); look(chipG, W, H);
    chipG.fillStyle = 'rgba(255,210,58,.55)'; chipG.font = '18px sans-serif'; chipG.textAlign = 'center'; chipG.textBaseline = 'middle'; chipG.fillText('★', W/2, H/2 + 1); chipG.textAlign = 'left'; chipG.textBaseline = 'alphabetic'; }
  // who the chip shows: the person on the cam, or with no cam running, one of the starred (chipFront, until it's unstarred)
  let chipFront = null, chipSig = '', chipBusy = false;
  const chipWho = () => M.id || (pins.includes(chipFront) ? chipFront : (chipFront = pins[0] || null));
  const deckN = () => { const s = new Set(pins); if (M.id) s.add(M.id); return s.size; };
  // the next starred person after this one (dir -1: the one before), or null when there's nowhere else to go
  function starStep(from, dir){
    const n = pins.length; if (!n) return null;
    const i = pins.indexOf(from); if (i < 0) return dir > 0 ? pins[0] : pins[n - 1];
    return n < 2 ? null : pins[(i + dir + n) % n];
  }
  function chipSync(){
    if (!chip) return;
    const id = chipWho(), ready = typeof pplReady !== 'undefined' && pplReady;
    const show = !!id && ready && (!!M.id || M.ready()) && !TS.covered();
    if (chip.hidden === show) chip.hidden = !show;
    if (prevB){ const can = !!M.id && !!starStep(M.id, 1); if (prevB.hidden === can){ prevB.hidden = nextB.hidden = !can; } }
    if (!show) return;
    const p = typeof people !== 'undefined' && people.get(id), L = window.STORY ? STORY.log(id) : [], last = L[L.length - 1];
    const nm = pinName(id), line = last ? STORY.render(last) : 'Nothing logged yet.', star = pins.includes(id), stack = Math.min(2, deckN() - 1);
    const sig = [id, nm, line, star, stack, !!(p && p.scene), !!M.id].join('|'); if (sig === chipSig) return;
    const wasCam = chipSig && chipSig.endsWith('|true'); chipSig = sig;
    chip.querySelector('.mc-nm').textContent = nm; chip.querySelector('.mc-log').textContent = line;
    chip.classList.toggle('star', star); chip.classList.toggle('live', !!(p && p.scene)); chip.classList.toggle('cam', !!M.id); chip.dataset.stack = String(Math.max(0, stack));
    chip.querySelector('.mc-open').setAttribute('aria-label', (M.id ? 'Open the person cam on ' : 'Watch ') + nm + (stack > 0 ? '. Swipe up for the next starred person' : ''));
    if (!M.id || !wasCam) chipBlank();
    if (M.id) chipPic();
  }
  // a swipe up on the chip: the top card goes and the next starred person comes forward from the stack (the cam switches to them if it's running)
  function chipNext(){
    if (chipBusy || deckN() < 2) return;
    const cur = chipWho(), nx = starStep(cur, 1); if (!nx || nx === cur) return;
    const ob = chip.querySelector('.mc-open');
    const swap = () => { if (M.id){ chipHold = 1; M.open(nx, true); chipSig = ''; chipSync(); chipBlank(); } else { chipFront = nx; chipSync(); } };
    if (!ob.animate || document.documentElement.classList.contains('nt-calm')){ swap(); return; }
    chipBusy = true;
    const out = ob.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-22px)', opacity: 0 }], { duration: 130, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    out.onfinish = () => { swap();
      const inn = ob.animate([{ transform: 'translateY(-7px) scaleX(.94)', opacity: .35 }, { transform: 'none', opacity: 1 }], { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' });
      out.cancel(); inn.onfinish = inn.oncancel = () => { chipBusy = false; }; };
  }
  if (TS){
    chip = document.createElement('div'); chip.id = 'monChip'; chip.className = 'mon-chip'; chip.hidden = true;
    chip.innerHTML = '<button class="mc-open" type="button" aria-label="Open the person cam"><canvas width="44" height="44" aria-hidden="true"></canvas>' +
      '<span class="mc-tx"><b><i class="mc-st" aria-hidden="true">★</i><span class="mc-nm"></span></b><span class="mc-log"></span></span></button>';
    document.body.appendChild(chip);
    chipCv = chip.querySelector('canvas'); chipG = chipCv.getContext('2d'); chipG.imageSmoothingEnabled = false;
    // a tap opens (the cam's sheet, or the cam on the starred person shown); a swipe up goes to the next card
    { const ob = chip.querySelector('.mc-open'); let sw = null, swiped = false;
      ob.addEventListener('pointerdown', e => { swiped = false; sw = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { ob.setPointerCapture(e.pointerId); } catch (er){} });
      ob.addEventListener('pointermove', e => { if (!sw || e.pointerId !== sw.id) return; const dy = e.clientY - sw.y;
        if (Math.abs(dy) > 10 || Math.abs(e.clientX - sw.x) > 10) swiped = true;   // (a drag, not a tap)
        if (dy < -22 && -dy > Math.abs(e.clientX - sw.x)){ sw = null; chipNext(); } });
      const end = e => { if (sw && e.pointerId === sw.id) sw = null; };
      ob.addEventListener('pointerup', end); ob.addEventListener('pointercancel', end);
      ob.addEventListener('click', () => { if (swiped){ swiped = false; return; }
        if (M.id) sheetUp(); else { const id = chipWho(); if (id && typeof people !== 'undefined' && people.has(id)) M.open(id); } }); }
    // (the chip steps aside while any sheet is up, and comes back when the last one goes)
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => chipSync()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // the header in the sheet: arrows round the starred people either side of the name, and minimize beside the ✕
    { const hdr = el.querySelector('header'), ttl = hdr.querySelector('.mon-title');
      const btn = (cls, html, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = html; b.setAttribute('aria-label', label); b.title = label; return b; };
      prevB = btn('mon-cyc', '‹', 'Previous starred person'); nextB = btn('mon-cyc', '›', 'Next starred person'); prevB.hidden = nextB.hidden = true;
      const minB = btn('mon-min', '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>', 'Minimize: keep following from the chip');
      ttl.before(prevB); ttl.after(nextB); $m('monClose').before(minB);
      prevB.addEventListener('click', () => { const id = starStep(M.id, -1); if (id && people.has(id)) M.open(id); });
      nextB.addEventListener('click', () => { const id = starStep(M.id, 1); if (id && people.has(id)) M.open(id); });
      minB.addEventListener('click', () => park()); }
    // the feed in a frame of its own, with the static over it as a baked tile that moves (nothing drawn for it): see M.blit
    wrap = document.createElement('div'); wrap.className = 'mon-feedwrap'; cv.before(wrap); wrap.appendChild(cv);
    noise = document.createElement('div'); noise.className = 'mon-noise'; noise.hidden = true; noise.setAttribute('aria-hidden', 'true'); wrap.appendChild(noise);
    { const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const tg = t.getContext('2d'); let sd = 7;
      const r = () => (sd = (sd*16807) % 2147483647)/2147483647;
      tg.fillStyle = 'rgba(200,220,230,.10)'; for (let k = 0; k < 260; k++) tg.fillRect(Math.floor(r()*t.width), Math.floor(r()*t.height), 2, 1);   // (the desktop's static, baked once)
      noise.style.setProperty('--nz', 'url(' + t.toDataURL() + ')'); }
    // a tap on the city that doesn't pick anyone folds the sheet to the chip (input.js opens the monitor on a person after this runs)
    if (typeof canvas !== 'undefined'){
      let dn = null;
      canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; if (dn){ dn.multi = true; return; } dn = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false }; });
      const up = e => { if (!dn || e.pointerId !== dn.id) return; const d = dn; dn = null;
        if (d.multi || e.type === 'pointercancel' || performance.now() - d.t > 500 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
        const seq = openSeq; setTimeout(() => { if (seq === openSeq) park(); }, 0); };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    }
    // the "rewritten" mark: a tap shows what was first logged (a desktop hovers it for the same words)
    $m('monBody').addEventListener('click', e => { const i = e.target.closest('.ml i[data-k]'); if (!i) return; const k = i.dataset.k; if (rwOpen.has(k)) rwOpen.delete(k); else rwOpen.add(k); render(false); });
  }

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
    if (chip) chipSync();   // (on a touch screen the starred wait in the follow chip, and the sheet's arrows go round them)
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
    const out = (p.scene && p.sc && p.sc.mode !== 'in') || p.walk || p.spot || p.patrol || p.onBike || (p.metro) || (p.club) || (p._ec && p._ea > .3);   // (anyone drawn in the street: on a beat post, on a bike, up on a deck)
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
      if (typeof pplFeedPre === 'function') pplFeedPre(fcam); if (typeof bikeFeedPre === 'function') bikeFeedPre(fcam);   // (people, bikes and drones turned to face this camera, not the main view's)
      renderer.setRenderTarget(rt); renderer.setClearColor(0x05080f, 1); renderer.autoClear = true;
      renderer.render(scene, fcam);
      if (pbo && !FC.fence){
        glc.bindBuffer(glc.PIXEL_PACK_BUFFER, pbo); glc.readPixels(0, 0, RW, RH, glc.RGBA, glc.UNSIGNED_BYTE, 0); glc.bindBuffer(glc.PIXEL_PACK_BUFFER, null);
        FC.fence = glc.fenceSync(glc.SYNC_GPU_COMMANDS_COMPLETE, 0); glc.flush();
      } else if (!pbo){ glc.readPixels(0, 0, RW, RH, glc.RGBA, glc.UNSIGNED_BYTE, pix); FC.ready = true; }
    } finally {
      if (typeof pplFeedPost === 'function') pplFeedPost(); if (typeof bikeFeedPost === 'function') bikeFeedPost();
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
  let noiseSeed = 1, lastT = 0, base = null, bg = null, baseKey = '';
  function look(c, W, H){ c.fillStyle = 'rgba(20,60,70,.18)'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); }
  function vignette(c, W, H){ const vg = c.createRadialGradient(W/2, H/2, H*.3, W/2, H/2, W*.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = vg; c.fillRect(0, 0, W, H); }
  const rnd = () => (noiseSeed = (noiseSeed*16807) % 2147483647)/2147483647;
  M.blit = () => {
    if (!M.id){ MON_FOCUS.on = false; return; }
    const p = people.get(M.id), W = cv.width, H = cv.height, now = performance.now(), dt = Math.min(.1, (now - (lastT || now))/1000); lastT = now;
    const at = subjectAt();
    if (at){ MON_FOCUS.on = true; MON_FOCUS.x = at.x; MON_FOCUS.z = at.z; aim(at, dt); } else MON_FOCUS.on = false;
    pickUp(); let fresh = false; if (FC.ready){ toCanvas(); fresh = true; }
    const vis = feedVisible();
    // (folded to its chip on a touch screen: the cam keeps them at a quarter of the rate, for the chip's picture)
    if (at && ++FC.frame % (vis ? EVERY : EVERY*4) === 0){ try { drawFeed(at); } catch (e){ if (!M.feedErr){ M.feedErr = true; console.warn('monitor feed:', e); } } }
    if (fresh && chip && !chip.hidden) chipPic(true);
    if (!vis){ if (window.STORY && (STORY.rev !== M.rev || now - M.drawnAt > 1500)) render(false); return; }   // (nothing of the panel on screen)
    const shown = !!(at && FC.shown), noisy = !shown || !!(at && at.inside);
    // the look of a camera feed: a cold tint, scanlines, a vignette, static when there's nothing to see.
    // The still part changes only with a new picture from the feed's camera (every third frame or so), so it's put together once
    // per picture in a canvas of its own and copied whole each frame under the moving bits: the same pixels, a third of the work.
    // With static on a desktop it's drawn as before (the static goes under the vignette); a touch screen moves a baked tile of it instead.
    if (noisy && !TS){
      g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H);
      if (shown) g.drawImage(off, 0, 0, W, H);
      look(g, W, H);
      noiseSeed = (Math.floor(now/80) % 9973) + 1;
      g.fillStyle = 'rgba(200,220,230,.10)'; for (let k = 0; k < 260; k++) g.fillRect(Math.floor(rnd()*W), Math.floor(rnd()*H), 2, 1);
      vignette(g, W, H);
    } else {
      const key = W + 'x' + H + (shown ? 's' : '');
      if (!base || fresh || key !== baseKey){
        if (!base){ base = document.createElement('canvas'); bg = base.getContext('2d'); }
        if (base.width !== W || base.height !== H){ base.width = W; base.height = H; }
        bg.imageSmoothingEnabled = false;
        bg.fillStyle = '#05080f'; bg.fillRect(0, 0, W, H);
        if (shown) bg.drawImage(off, 0, 0, W, H);
        look(bg, W, H); vignette(bg, W, H); baseKey = key;
      }
      g.drawImage(base, 0, 0);
    }
    if (noise && noise.hidden !== !noisy) noise.hidden = !noisy;
    g.font = '10px "Silkscreen", monospace'; g.textBaseline = 'top';
    g.fillStyle = Math.floor(now/600) % 2 ? '#ff4f6a' : 'rgba(255,79,106,.25)'; g.fillRect(8, 9, 6, 6);
    g.fillStyle = '#e3d6bd'; g.fillText('REC', 18, 7);
    { const nt = typeof DOSSIER !== 'undefined' && DOSSIER.lastNote(); if (nt && nt.id === M.id){ g.fillStyle = '#5ae8ff'; g.fillText('NOTED: ' + nt.t.toUpperCase(), 8, 21); g.fillStyle = '#e3d6bd'; } }   // (a habit the cam just picked up: lidar.js)
    // a thread nearing its payoff (pacing.js): the CAM label starts to flicker and a faint signal meter fills under it. Visual only, and quiet.
    const hint = window.PACE && PACE.hint ? PACE.hint(M.id) : -1;
    const flick = hint > .55 && rnd() < (hint - .55)*.35;
    g.textAlign = 'right'; if (!flick) g.fillText('CAM ' + String(1 + (hash(M.id) % 48)).padStart(2, '0'), W - 8, 7); g.textAlign = 'left';
    if (hint >= 0){ const bars = Math.min(4, 1 + Math.floor(hint*4));
      for (let k = 0; k < 4; k++){ g.fillStyle = k < bars ? 'rgba(138,216,224,' + (.28 + .4*hint).toFixed(2) + ')' : 'rgba(138,216,224,.1)'; g.fillRect(W - 30 + k*6, 24 - (k + 1)*2, 4, (k + 1)*2); } }
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
    if (chip) chipSync();
    const body = $m('monBody'), atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
    const top = M.tab !== 'log' && force;   // (the notebook opens at its top)
    if (M.tab === 'log'){
      const L = STORY.log(M.id);
      if (!STORY.on) body.innerHTML = '<p class="mon-empty">' + (STORY.failed ? 'The story data did not load: ' + esc(STORY.failed) : 'Loading the city\'s stories...') + '</p>';
      else if (!L.length) body.innerHTML = '<p class="mon-empty">Nothing logged yet.</p>';
      else body.innerHTML = L.map(e => { const t = STORY.render(e), re = e.first && e.first !== t, rk = re && TS ? e.t + '|' + e.first : null;
        return '<div class="ml ' + (e.kind || '') + '"><time>' + clockText(e.t) + '</time><span>' + esc(t) + (re ? ' <i title="' + esc('first logged as: ' + e.first) + '"' + (rk ? ' data-k="' + esc(rk) + '" role="button"' : '') + '>rewritten</i>' : '') +
          (rk && rwOpen.has(rk) ? '<small class="ml-orig">first logged as: ' + esc(e.first) + '</small>' : '') + '</span></div>'; }).join('');
      if (!TS) fitLog(body); else body.style.maxHeight = '';   // (on touch the sheet's height sets how much shows)
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
    if (typeof DOSSIER !== 'undefined'){ try { const h = DOSSIER.notebook(M.id); if (h) parts.push(h); } catch (e) {} }   // (what the person cam and the LIDAR Array have learned: lidar.js)
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
    // for testing: the truth the player isn't meant to have (not in the itch.io build: tools/itch/build.py sets self.ITCH)
    const sp = self.ITCH ? null : STORY.sp(people.get(M.id)), deg = sp ? STORY.degreesOf() : null;
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
