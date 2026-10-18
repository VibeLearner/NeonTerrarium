// Neon Terrarium: the title screen. The view from a resident's window at night, in the rain: the player's own city,
// live, through fogged glass. The frame, the sill, the plant and the lamp's warmth are drawn here in pixels at the
// game's own scale; the name is a neon sign hung outside; the menu is written in the fog. Moving the pointer wipes the
// glass clear and the fog creeps back. Continue clears the glass and the view pushes through the window into the city.
// Plan: project doc claude/title-screen-plan.md. Slots and the cloud: slots.js. Loads last.
'use strict';
const TITLE = (() => {
  const T = { on: false };
  const root = document.getElementById('title'); if (!root) return T;
  const $t = id => document.getElementById(id);
  const cvSign = $t('tSign'), cvFog = $t('tFog'), cvFrame = $t('tFrame'), cvGlow = $t('tGlow');
  const gG = cvGlow.getContext('2d'), gS = cvSign.getContext('2d'), gF = cvFog.getContext('2d'), gR = cvFrame.getContext('2d');
  const menu = root.querySelector('.t-menu'), note = $t('tNote'), panel = $t('tCities');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, LH = 360, LW = 640, G = null;   // G: the window's geometry in frame pixels
  const fogMap = document.createElement('canvas'), gM = fogMap.getContext('2d');   // how fogged each bit of glass is (white = fog)
  const tint = document.createElement('canvas'), gT = tint.getContext('2d');       // the fog's own color: lamp-warm low left, neon-lit near the sign
  const FOG_K = 3;   // the fog is drawn at a third of the screen's resolution and scaled up soft
  let drops = [], beads = [], wipes = [], raf = 0, last = 0, clearing = 0, flick = { i: -1, until: 0 };

  /* ---------- layout ---------- */
  function lines(){ let n = 720; try { n = RENDER_LINES || 720; } catch (e) {} return Math.max(220, Math.round(n/2)); }
  function layout(){
    W = innerWidth; H = innerHeight; LH = lines(); LW = Math.round(LH*W/H);
    cvFrame.width = LW; cvFrame.height = LH;
    cvSign.width = Math.round(W/2); cvSign.height = Math.round(H/2); cvGlow.width = Math.round(W/4); cvGlow.height = Math.round(H/4);
    const fw = Math.max(2, Math.round(W/FOG_K)), fh = Math.max(2, Math.round(H/FOG_K));
    const old = fogMap.width ? (() => { const c = document.createElement('canvas'); c.width = fogMap.width; c.height = fogMap.height; c.getContext('2d').drawImage(fogMap, 0, 0); return c; })() : null;
    fogMap.width = cvFog.width = tint.width = fw; fogMap.height = cvFog.height = tint.height = fh;
    gM.fillStyle = '#fff'; gM.fillRect(0, 0, fw, fh); if (old) gM.drawImage(old, 0, 0, fw, fh);
    const tall = H > W*1.1, ft = Math.round(LH*.07), fs = Math.round(Math.min(LH*.085, LW*.07)), sy = LH - Math.round(LH*(tall ? .14 : .19));
    const x0 = fs, x1 = LW - fs, y0 = ft, y1 = sy, tb = Math.max(3, Math.round(LH*.02));
    G = { ft, fs, sy, x0, x1, y0, y1, tb, ty: y0 + Math.round((y1 - y0)*.3), mx: x0 + Math.round((x1 - x0)*(tall ? .86 : .57)), tall, sill: Math.max(4, Math.round(LH*.04)) };
    drawFrame(); drawSign(0); drawTint(); placeDom();
    beads = []; for (let i = 0; i < (reduced ? 40 : 160); i++) beads.push({ x: Math.random()*fw, y: Math.random()*fh, r: .5 + Math.random()*1.3 });
  }
  const px = (x, y) => [x*W/LW, y*H/LH];   // frame pixels to screen
  function placeDom(){
    const s = G, [ax, ay] = px(s.x0, s.ty + s.tb), [bx] = px(s.mx, 0), [, by] = px(0, s.y1);
    menu.style.left = Math.round(ax + (bx - ax)*.12) + 'px'; menu.style.top = Math.round(ay + (by - ay)*.2) + 'px';
    const [nx] = px(s.x1, 0), [, ny] = px(0, s.sy);
    note.style.right = Math.round(W - nx - (W - nx)*.62) + 'px'; note.style.top = Math.round(ny - H*.2) + 'px';
    const [cx] = px(s.mx + s.tb, 0), [cx1] = px(s.x1, 0), [, cy] = px(0, s.ty + s.tb);
    panel.style.left = Math.round(cx + 12) + 'px'; panel.style.width = Math.max(300, Math.round(cx1 - cx - 24)) + 'px';
    panel.style.top = Math.round(cy + 10) + 'px'; panel.style.maxHeight = Math.round(H - cy - 26) + 'px';   // (it may hang down over the sill: the list needs the room)
  }

  /* ---------- the frame, sill, plant, lamp (pixels) ---------- */
  function rect(c, x, y, w, h){ gR.fillStyle = c; gR.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function drawFrame(){
    const s = G; gR.clearRect(0, 0, LW, LH); gR.imageSmoothingEnabled = false;
    const base = '#10151f', mid = '#1a2130', hi = '#2b3446', lo = '#080b12';
    // the frame all round (the panes are left empty: the city shows there)
    rect(base, 0, 0, LW, s.y0); rect(base, 0, 0, s.x0, LH); rect(base, s.x1, 0, LW - s.x1, LH);
    // bars: the transom across, its two thin lights, the casement mullion
    rect(base, s.x0, s.ty, s.x1 - s.x0, s.tb);
    const tl = Math.max(2, Math.round(s.tb*.6));
    for (const f of [1/3, 2/3]) rect(base, Math.round(s.x0 + (s.x1 - s.x0)*f - tl/2), s.y0, tl, s.ty - s.y0);
    rect(base, s.mx, s.ty, s.tb, s.y1 - s.ty);
    // bevels: light on the edges facing the room's lamp (down, left), dark on the others
    const edge = (x, y, w, h) => { rect(hi, x, y + h - 1, w, 1); rect(lo, x, y, w, 1); };
    edge(s.x0, s.ty, s.x1 - s.x0, s.tb); rect(hi, s.mx, s.ty, 1, s.y1 - s.ty); rect(lo, s.mx + s.tb - 1, s.ty, 1, s.y1 - s.ty);
    rect(hi, s.x0 - 1, s.y0, 1, s.y1 - s.y0); rect(lo, s.x1, s.y0, 1, s.y1 - s.y0); rect(lo, s.x0, s.y0 - 1, s.x1 - s.x0, 1);
    // an inner stop round each pane: a second, lighter line a pixel in
    rect(mid, s.x0, s.y0, s.x1 - s.x0, 1); rect(mid, s.x0, s.y0, 1, s.y1 - s.y0); rect(mid, s.x1 - 1, s.y0, 1, s.y1 - s.y0);
    // a latch on the mullion
    rect('#3a4258', s.mx - 2, s.ty + Math.round((s.y1 - s.ty)*.5), s.tb + 4, 3); rect('#8a7a5a', s.mx - 1, s.ty + Math.round((s.y1 - s.ty)*.5), 2, 1);
    // the sill: a ledge proud of the wall, its top face catching the lamp, the wall below
    rect('#1c1416', 0, s.sy, LW, LH - s.sy);
    rect('#3d2c24', 0, s.sy, LW, s.sill); rect('#6b4a34', 0, s.sy, LW, 1); rect('#24181a', 0, s.sy + s.sill, LW, Math.max(2, Math.round(s.sill*.6))); rect('#0c0809', 0, s.sy + s.sill + Math.max(2, Math.round(s.sill*.6)), LW, 1);
    // wall plaster, faintly mottled (fixed pattern, no randomness that changes per load)
    for (let y = s.sy + s.sill + 4; y < LH; y += 3) for (let x = (y*7) % 5; x < LW; x += 5) if (((x*31 + y*17) % 11) < 2) rect('#241a1c', x, y, 1, 1);
    drawPlant(Math.round(s.x0 + (s.x1 - s.x0)*.08), s.sy);
    drawCup(Math.round(s.mx - (s.mx - s.x0)*.1), s.sy);
    // the lamp: off to the left, warming whatever faces it
    gR.globalCompositeOperation = 'source-atop';
    const lg = gR.createRadialGradient(-LW*.05, LH*.95, 0, -LW*.05, LH*.95, LH*1.05);
    lg.addColorStop(0, 'rgba(255,170,80,.55)'); lg.addColorStop(.45, 'rgba(255,150,70,.18)'); lg.addColorStop(1, 'rgba(255,140,60,0)');
    gR.fillStyle = lg; gR.fillRect(0, 0, LW, LH);
    // and the neon outside, a cold rim on the frame's outer edges
    const ng = gR.createLinearGradient(LW, 0, LW*.6, 0); ng.addColorStop(0, 'rgba(255,79,163,.16)'); ng.addColorStop(1, 'rgba(255,79,163,0)');
    gR.fillStyle = ng; gR.fillRect(0, 0, LW, s.sy);
    gR.globalCompositeOperation = 'source-over';
    dither();
  }
  // the gradients stepped to the game's look: every color snapped to a few levels with an ordered dither
  function dither(){
    const im = gR.getImageData(0, 0, LW, LH), d = im.data, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], q = 12;
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++){ const i = (y*LW + x)*4; if (!d[i + 3]) continue; const t = (B[(y & 3)*4 + (x & 3)]/16 - .5)*q;
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round((d[i + k] + t)/q)*q)); }
    gR.putImageData(im, 0, 0);
  }
  function drawPlant(x, sy){
    const u = Math.max(1, Math.round(LH/180));
    const pw = 14*u, ph = 11*u, py = sy - ph;
    // a terracotta pot, narrower at the foot
    for (let r = 0; r < ph; r++){ const inset = Math.round(r*2/ph*u); rect(r < 2*u ? '#b0623a' : '#94502f', x + inset, py + r, pw - 2*inset, 1); }
    rect('#c47a4c', x - u, py, pw + 2*u, 2*u); rect('#6e3a22', x + 2*u, py + ph - u, pw - 4*u, u);
    rect('#2a1a12', x + u, py + u, pw - 2*u, u);
    // pothos: leaves up out of the pot, vines trailing over the sill's edge
    const leaf = (lx, ly, c) => { rect(c, lx, ly, 3*u, 2*u); rect(c, lx + u, ly - u, u, u); rect('#8fd27a', lx, ly, u, u); };
    const greens = ['#2c6b3a', '#3f8f4a', '#4fa255'];
    const ups = [[2, -6], [5, -10], [8, -7], [10, -12], [12, -5], [6, -15], [1, -11], [9, -16]];
    ups.forEach(([a, b], k) => { const sx = x + Math.round(pw/2), ex = x + a*u + u; for (let t = 0; t <= 1; t += 1/Math.max(4, -b)){ rect('#24552f', Math.round(sx + (ex - sx)*t), Math.round(py + b*u*t), u, u); } });
    ups.forEach(([a, b], k) => leaf(x + a*u, py + b*u, greens[k % 3]));
    for (let v = 0; v < 3; v++){
      let vx = x + (3 + v*4)*u, vy = py + 2*u; const len = (16 + v*9)*u, dir = v === 1 ? 1 : -1;
      for (let s = 0; s < len; s += u){ vy += u; vx += Math.round(Math.sin(s/(5*u) + v)*.6)*u*dir*.5; if (vy > sy + G.sill + 6*u){ vx += dir*u; }
        rect('#24552f', vx, vy, u, u); if (s % (5*u) === 0) leaf(vx + (s % (10*u) ? u : -3*u), vy, greens[(s/u + v) % 3]); }
    }
  }
  function drawCup(x, sy){
    const u = Math.max(1, Math.round(LH/180)), w = 7*u, h = 6*u;
    rect('#d9cdb4', x, sy - h, w, h); rect('#a89a80', x, sy - h, w, u); rect('#efe4cc', x + u, sy - h + u, u, h - 2*u);
    rect('#d9cdb4', x + w, sy - h + u, 2*u, u); rect('#d9cdb4', x + w + u, sy - h + u, u, 3*u); rect('#d9cdb4', x + w, sy - h + 3*u, 2*u, u);
    rect('#5a3a26', x + u, sy - h + u, w - 2*u, u);
  }

  /* ---------- the sign outside ---------- */
  function drawSign(t){
    const cw = cvSign.width, ch = cvSign.height; gS.clearRect(0, 0, cw, ch);
    const s = G, [l] = px(s.x0, 0), [r] = px(s.x1, 0), [, top] = px(0, s.y0), [, bot] = px(0, s.ty);
    // centred in the middle light of the transom, sized so TERRARIUM fills most of it
    const ll = s.tall ? l : l + (r - l)/3, lr = s.tall ? r : l + (r - l)*2/3, cx = (ll + lr)/4, cy = ((top + bot)/2)/2;
    gS.font = '100px Silkscreen, monospace'; const k = gS.measureText('TERRARIUM').width/100;
    const size = Math.min(((lr - ll)*.84/2)/(k*1.25), (bot - top)*.3/2);
    // a bracket from the right, a dark backing plate, the tubes
    gS.fillStyle = '#05070c'; gS.fillRect(cx, cy - size*2.1, (r/2) - cx, size*.3); gS.fillRect(cx - size*.15, cy - size*2.1, size*.3, size*.5);
    gS.fillStyle = 'rgba(8,10,18,.85)'; const pw = k*size*1.25 + size*1.6, ph = size*3.4; gS.fillRect(cx - pw/2, cy - ph/2, pw, ph);
    gS.font = Math.round(size*1.25) + 'px Silkscreen, monospace'; gS.textBaseline = 'middle'; gS.textAlign = 'center';
    const word = (txt, y, col, glow, idx0) => {
      const chars = [...txt], wTot = gS.measureText(txt).width; let xx = cx - wTot/2;
      chars.forEach((c, k) => {
        const cwid = gS.measureText(c).width, i = idx0 + k, off = flick.i === i && t < flick.until;
        gS.save(); gS.globalAlpha = off ? .18 : 1;
        gS.shadowColor = glow; gS.shadowBlur = size*1.4; gS.fillStyle = col; gS.fillText(c, xx + cwid/2, y);
        gS.shadowBlur = size*.5; gS.fillText(c, xx + cwid/2, y); gS.restore(); xx += cwid;
      });
    };
    word('NEON', cy - size*.78, '#ffa6d6', '#ff2f96', 0);
    word('TERRARIUM', cy + size*.86, '#5cf08e', '#0f9a45', 4);
    // light thrown on the glass round it
    const rg = gS.createRadialGradient(cx, cy, 0, cx, cy, size*9); rg.addColorStop(0, 'rgba(255,79,163,.12)'); rg.addColorStop(1, 'rgba(255,79,163,0)');
    gS.globalCompositeOperation = 'lighter'; gS.fillStyle = rg; gS.fillRect(cx - size*10, cy - size*10, size*20, size*20); gS.globalCompositeOperation = 'source-over';
    T.signAt = { x: cx*2, y: cy*2 };
  }

  /* ---------- the fogged glass ---------- */
  function drawTint(){
    const fw = tint.width, fh = tint.height;
    gT.fillStyle = '#56627a'; gT.fillRect(0, 0, fw, fh);
    const a = gT.createRadialGradient(0, fh, 0, 0, fh, fh*1.1); a.addColorStop(0, 'rgba(230,150,90,.75)'); a.addColorStop(1, 'rgba(230,150,90,0)'); gT.fillStyle = a; gT.fillRect(0, 0, fw, fh);
    const sp = T.signAt || { x: W*.58, y: H*.18 }, b = gT.createRadialGradient(sp.x/FOG_K, sp.y/FOG_K, 0, sp.x/FOG_K, sp.y/FOG_K, fw*.35);
    b.addColorStop(0, 'rgba(220,90,170,.55)'); b.addColorStop(1, 'rgba(220,90,170,0)'); gT.fillStyle = b; gT.fillRect(0, 0, fw, fh);
    // mottling: condensation is never even
    for (let i = 0; i < fw*fh/40; i++){ const x = (i*97) % fw, y = (i*57 + (i >> 3)*13) % fh; gT.fillStyle = (i % 3) ? 'rgba(255,255,255,.05)' : 'rgba(40,50,70,.06)'; gT.fillRect(x, y, 2, 2); }
  }
  function wipeAt(x, y, r, k = 1){ gM.save(); gM.globalCompositeOperation = 'destination-out'; const g = gM.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,' + k + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); gM.fillStyle = g; gM.beginPath(); gM.arc(x, y, r, 0, 7); gM.fill(); gM.restore(); }
  function step(t, dt){
    const fw = fogMap.width, fh = fogMap.height;
    // the fog creeps back (slower where the lamp warms the glass)
    if (!clearing){ gM.globalAlpha = Math.min(1, dt*.09); gM.fillStyle = '#fff'; gM.fillRect(0, 0, fw, fh); gM.globalAlpha = 1; }
    else { clearing = Math.min(1, clearing + dt*.9); wipeAt(fw*.35, fh*.55, fw*clearing*1.2, .5); }
    for (const w of wipes) wipeAt(w[0]/FOG_K, w[1]/FOG_K, Math.max(10, W*.045)/FOG_K, .55); wipes = [];
    // drops running down the glass leave clear trails
    if (!reduced && Math.random() < dt*3.5 && drops.length < 40) drops.push({ x: Math.random()*fw, y: Math.random()*fh*.6, v: 6 + Math.random()*14, r: .8 + Math.random()*1.4, wob: Math.random()*6 });
    gM.save(); gM.globalCompositeOperation = 'destination-out'; gM.fillStyle = '#000';
    for (const d of drops){ const ny = d.y + d.v*dt*(.6 + Math.random()*.8), nx = d.x + Math.sin((d.y + d.wob)*.3)*.15; gM.beginPath(); gM.lineWidth = d.r*1.4; gM.strokeStyle = 'rgba(0,0,0,.8)'; gM.moveTo(d.x, d.y); gM.lineTo(nx, ny); gM.stroke(); d.x = nx; d.y = ny; }
    gM.restore(); drops = drops.filter(d => d.y < fh + 4);
    // the glass as seen: the fog's color where the fog is, then the drops and beads on top
    gF.clearRect(0, 0, fw, fh); gF.globalCompositeOperation = 'source-over'; gF.drawImage(tint, 0, 0);
    gF.globalCompositeOperation = 'destination-in'; gF.drawImage(fogMap, 0, 0); gF.globalCompositeOperation = 'source-over';
    for (const b of beads){ gF.fillStyle = 'rgba(220,230,240,.35)'; gF.fillRect(b.x, b.y, b.r, b.r); }
    for (const d of drops){ gF.fillStyle = 'rgba(190,205,230,.28)'; gF.beginPath(); gF.arc(d.x, d.y, d.r, 0, 7); gF.fill(); gF.fillStyle = 'rgba(255,240,220,.75)'; gF.fillRect(d.x - d.r*.4, d.y - d.r*.5, .8, .8); }
    if (!reduced && t > flick.until + 1500 && Math.random() < dt*.25) flick = { i: Math.floor(Math.random()*13), until: t + 90 + Math.random()*260 };
    drawSign(t);
    const gw = cvGlow.width, gh = cvGlow.height; gG.clearRect(0, 0, gw, gh); gG.filter = 'blur(' + Math.max(2, Math.round(H/160)) + 'px)'; gG.drawImage(cvSign, 0, 0, gw, gh); gG.filter = 'none';
  }
  function loop(now){
    if (!T.on) return; raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(.1, (now - last)/1000) : 0; last = now;
    try { if (typeof yawT !== 'undefined' && !panel.contains(document.activeElement)) yawT += dt*(reduced ? 0 : .025); } catch (e) {}
    step(now, dt);
    if (now - noteAt > 1500){ noteAt = now; fillNote(); }
  }
  let noteAt = 0;
  function fillNote(){
    const m = (() => { let day = 1, res = 0; try { day = STORY.day() + 1; } catch (e) {} try { for (const p of people.values()) if (!p.visitor && !p.gone) res++; } catch (e) {} return { day, res }; })();
    $t('tNoteLine').textContent = 'Day ' + m.day + ' · ' + m.res.toLocaleString('en-US') + ' residents';
    if (SLOTS.active) SLOTS.list().then(l => { const a = l.find(x => x.active); if (a) $t('tNoteName').textContent = a.name; }).catch(() => {});
  }

  /* ---------- showing and leaving ---------- */
  let was = null;
  function setScene(){
    try {
      was = { hour: S.hour, cycle: S.cycle, wx: typeof LK !== 'undefined' ? { mode: LK.wx.mode, set: LK.wx.set } : null, zoomT };
      S.cycle = false; S.hour = 22.4;
      if (typeof LK !== 'undefined' && LK.setWeather) LK.setWeather('rain', true, true); else S.rain = true;
      zoomT = Math.max(7, Math.min(zoomT, 10.5));
    } catch (e) {}
  }
  function restoreScene(){
    if (!was) return;
    try {
      S.hour = was.hour; S.cycle = was.cycle; zoomT = was.zoomT;
      if (was.wx && typeof LK !== 'undefined'){ if (was.wx.mode === 'auto') LK.setAutoWeather(true, true); else LK.setWeather(was.wx.set, false, true); }
    } catch (e) {}
    was = null;
  }
  T.show = () => {
    if (T.on) return; T.on = true; document.documentElement.classList.add('title-on'); root.hidden = false; root.classList.remove('leaving');
    setScene(); layout(); last = 0; clearing = 0; raf = requestAnimationFrame(loop); fillNote();
    setTimeout(() => { const c = menu.querySelector('[data-act="continue"]'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  T.hide = (instant) => {
    if (!T.on) return;
    closePanel(); document.documentElement.classList.remove('title-deck');
    if (instant || reduced){ finish(); return; }
    clearing = .01; root.classList.add('leaving');
    try { zoomT = Math.max(6, zoomT*.82); } catch (e) {}
    setTimeout(finish, 1300);
  };
  function finish(){ T.on = false; cancelAnimationFrame(raf); root.hidden = true; root.classList.remove('leaving'); document.documentElement.classList.remove('title-on'); restoreScene(); try { LAST_INPUT = performance.now(); } catch (e) {} }

  /* ---------- the menu ---------- */
  menu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'continue') T.hide();
    else if (act === 'new') openPanel(true);
    else if (act === 'cities') openPanel(false);
    else if (act === 'settings'){ const on = document.documentElement.classList.toggle('title-deck'); const deck = $t('deck'), tg = $t('deckToggle'); if (deck && tg && deck.classList.contains('open') !== on) tg.click(); }
  });
  root.addEventListener('pointermove', e => { if (e.target === root || e.target.tagName === 'CANVAS') wipes.push([e.clientX, e.clientY]); });
  // while the title is up, the city's keys (WASD, zones, delete...) are off; typing in the panel still works
  addEventListener('keydown', e => {
    if (!T.on) return;
    if (e.key === 'Escape'){ if (!panel.hidden) closePanel(); else if (document.documentElement.classList.contains('title-deck')){ menu.querySelector('[data-act="settings"]').click(); } e.preventDefault(); }
    const deck = $t('deck'); if (deck && deck.contains(e.target)) return;   // (the settings deck's own keys)
    e.stopImmediatePropagation();
  }, true);
  addEventListener('resize', () => { if (T.on) layout(); });

  /* ---------- the cities panel ---------- */
  function ago(t){ if (!t) return ''; const s = (Date.now() - t)/1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s/60) + ' min ago' : s < 86400*2 ? Math.round(s/3600) + ' h ago' : Math.round(s/86400) + ' days ago'; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(msg, bad){ const el = $t('tMsg'); el.textContent = msg || ''; el.classList.toggle('bad', !!bad); }
  async function render(){
    const list = await SLOTS.list(), box = $t('tList');
    box.innerHTML = list.map(c => {
      const m = c.meta || {}, line = 'Day ' + (m.day || 1) + ' · ' + (m.residents || 0).toLocaleString('en-US') + ' residents';
      const tags = (c.active ? '<i class="tag on">Playing</i>' : '') + (c.cloud ? '<i class="tag">' + (c.local ? 'Cloud' : 'Cloud only') + '</i>' : '') + (c.cloudNewer ? '<i class="tag warn">Newer in cloud</i>' : '');
      return '<li class="tcity' + (c.active ? ' active' : '') + '" data-id="' + esc(c.id) + '">' +
        '<div class="tthumb">' + (c.thumb ? '<img alt="" src="' + c.thumb + '">' : '<span>No picture yet</span>') + '</div>' +
        '<div class="tinfo"><b>' + esc(c.name) + '</b><small>' + line + '</small><small>' + (c.active ? 'Open now' : 'Saved ' + ago(c.updated)) + '</small><div class="ttags">' + tags + '</div></div>' +
        '<div class="tact">' + (c.active ? '' : '<button data-do="open">Open</button>') + '<button data-do="rename">Rename</button>' + (c.local ? '<button data-do="export">Export</button>' : '') + (c.active ? '' : '<button data-do="delete" class="danger">Delete</button>') + '</div></li>';
    }).join('');
    const u = SLOTS.cloudUser; $t('tUser').value = u || ''; $t('tCloudState').textContent = u ? (SLOTS.cloudErr || 'Signed in as ' + u + '. Your cities sync every few minutes.') : 'Not signed in. Cities stay in this browser.';
    $t('tCloudBtn').textContent = u ? 'Sync now' : 'Sign in'; $t('tSignOut').hidden = !u;
  }
  function openPanel(fresh){
    panel.hidden = false; document.documentElement.classList.remove('title-deck'); say('');
    render().then(async () => { const a = (await SLOTS.list()).find(c => c.active); if (a && !a.thumb){ await SLOTS.checkpoint(); render(); } }).catch(e => say(e.message, true));
    if (fresh) setTimeout(() => $t('tNewName').focus(), 30);
  }
  function closePanel(){ panel.hidden = true; const r = $t('tRename'); if (r) r.remove(); }
  $t('tClose').addEventListener('click', closePanel);
  $t('tList').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; const id = b.closest('li').dataset.id, act = b.dataset.do;
    try {
      if (act === 'open'){ say('Opening…'); await SLOTS.open(id); }
      else if (act === 'export'){ await SLOTS.exportFile(id); say('Saved a file of that city to your downloads.'); }
      else if (act === 'delete'){
        if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'Delete for good?'; setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = 'Delete'; } }, 4000); return; }
        await SLOTS.remove(id); say('Deleted.'); render();
      }
      else if (act === 'rename'){
        const li = b.closest('li'), cur = li.querySelector('b').textContent;
        const f = document.createElement('form'); f.id = 'tRename'; f.className = 'trename';
        f.innerHTML = '<input maxlength="40" aria-label="City name"><button type="submit">Save</button>'; f.querySelector('input').value = cur;
        li.querySelector('.tinfo').appendChild(f); f.querySelector('input').select();
        f.addEventListener('submit', async ev => { ev.preventDefault(); await SLOTS.rename(id, f.querySelector('input').value); render(); fillNote(); });
      }
    } catch (err) { say(err.message, true); }
  });
  $t('tNew').addEventListener('submit', async e => { e.preventDefault(); say('Starting a new city…'); try { await SLOTS.create($t('tNewName').value); } catch (err) { say(err.message, true); } });
  $t('tImport').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = await SLOTS.importFile(f); say('Added “' + r.name + '”. Open it from the list.'); render(); } catch (err) { say(err.message, true); } });
  $t('tCloud').addEventListener('submit', async e => {
    e.preventDefault(); const v = $t('tUser').value;
    try { say('Talking to the save server…'); if (v.trim().toLowerCase() !== SLOTS.cloudUser) await SLOTS.setUser(v); else await SLOTS.sync(); say(SLOTS.cloudUser ? 'Synced.' : ''); render(); }
    catch (err) { say(err.message, true); render(); }
  });
  $t('tSignOut').addEventListener('click', async () => { await SLOTS.setUser(''); say('Signed out. Your cities are still here in this browser.'); render(); });

  // the title comes up on load (saveguard.js decides), over the city as it builds
  if (window.NT_TITLE) T.show(); else root.hidden = true;
  return T;
})();
window.TITLE = TITLE;
