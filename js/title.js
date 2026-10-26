// Neon Terrarium: the title screen. A lived-in flat on a bright morning, the player's own city outside the round
// window. The room is built in 3D and lit for real (a sun through the porthole, soft shadows, reflections, light shafts
// in the air), then baked to pictures (tools/title/bake.py -> assets/title/); here they're laid over the live city,
// with the glass cut out so the city shows through it. Live on top: clouds drifting past the window, the plants on the
// sill swaying a little (baked apart as their own picture), dust turning in the sunbeam, and the capsule's light bar
// blinking now and then (its baked dark state swapped in for a moment). The menu sits at the side; Settings and
// Cities open where they normally do. Continue pushes the view through the window into the city.
// Plan: project doc claude/title-screen-plan.md.
'use strict';
const TITLE = (() => {
  const T = { on: false };
  // ?perf: the profiler's hooks (tools/title/perf.py): time each part of a frame, or switch parts off, to find what costs
  const TP = window.TPERF = /[?&]perf\b/.test(location.search) ? { off: new Set(), sync: false, t: {}, n: {}, gl: [],
    add(k, ms){ this.t[k] = (this.t[k] || 0) + ms; this.n[k] = (this.n[k] || 0) + 1; }, reset(){ this.t = {}; this.n = {}; },
    finish(r){ try { const gl = r.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch (e) {} },   // (wait for the graphics card: so the time includes its work)
    time(k, fn, r){ if (this.off.has(k)) return; const t0 = performance.now(); fn(); if (this.sync && r) this.finish(r); this.add(k, performance.now() - t0); } } : null;
  const root = document.getElementById('title'); if (!root) return T;
  const $t = id => document.getElementById(id);
  const stage = $t('tStage'), imRoom = $t('tRoom'), imGlass = $t('tGlass'), imOff = $t('tSignOff'), cvDust = $t('tDust'), glow = $t('tSignGlow'), cvSky = $t('tSky'), cvPl = $t('tPlants');
  const menu = root.querySelector('.t-menu'), panel = $t('tCities');
  const gD = cvDust.getContext('2d'), gS = cvSky.getContext('2d'), gP = cvPl.getContext('2d');
  let plSrc = null, plOut = null, plBase = null, plW = 0, plH = 0, clouds = [], plantAt = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VER = '2026-10-19b';
  let RAW = null, TOD = 'morning', SUNS = [], sunCv = null, gSun = null, sunH = 0, yaw0 = null, sunW = 1, sway = { x: 0, y: 0, r: 0 };
  let A = null, view = null, W = 0, H = 0, S0 = 1, OX = 0, OY = 0, raf = 0, last = 0, motes = [];
  const anchorsP = fetch('assets/title/anchors.json?v=' + VER).then(r => r.json()).catch(() => null);
  const gbufP = fetch('assets/title/gbuf.json?v=' + VER).then(r => r.ok ? r.json() : null).catch(() => null);   // (the surface bake: the room lit live)
  let GB = null, RTMODE = false, RT = null, rtCv = null, HOUR = 8;

  /* ---------- the picture, fitted to the screen ---------- */
  // the baked room covers the screen; it's placed so the window stays in view whatever the screen's shape
  function layout(){
    if (!A) return;
    W = innerWidth; H = innerHeight;
    const v = W/H < .85 ? 'tall' : 'wide';
    if (v !== view){ view = v; const f = k => 'assets/title/' + k + '-' + v + '-' + TOD + '.png?v=' + VER;
      if (!RTMODE){ imRoom.src = f('room'); imGlass.src = f('glass'); if (A[v].signRect) imOff.src = f('signoff'); } imRoom.hidden = imGlass.hidden = RTMODE; cvPl.hidden = true; live && live.view(v);
      SUNS = (A[v].heads || []).map((h, i) => { const im = new Image(); im.src = 'assets/title/sun-' + v + '-' + TOD + '-' + i + '.jpg?v=' + VER; return im; }); }
    const a = A[v], iw = a.w, ih = a.h; S0 = Math.max(W/iw, H/ih);
    const sw = iw*S0, sh = ih*S0;
    OX = Math.min(0, Math.max(W - sw, W*.5 - a.win[0]*sw)); OY = Math.min(0, Math.max(H - sh, H*.5 - a.win[1]*sh));
    if (v === 'wide') OX = Math.min(0, Math.max(W - sw, (W - sw)/2));   // (wide: centred; the window sits right of centre by design)
    Object.assign(stage.style, { left: OX + 'px', top: OY + 'px', width: sw + 'px', height: sh + 'px' });
    cvDust.width = Math.round(sw/S0); cvDust.height = Math.round(sh/S0); sunCv.width = cvDust.width; sunCv.height = cvDust.height;   // (dust at the picture's own pixels: it scales up crisp with it)
    const P = (k, el, dx = 0, dy = 0) => { el.style.left = (a[k][0]*100 + dx) + '%'; el.style.top = (a[k][1]*100 + dy) + '%'; };
    cvSky.width = cvDust.width; cvSky.height = cvDust.height; seedClouds();
    const r = a.signRect; imOff.hidden = !r; glow.hidden = !r || a.glow === false;
    if (r){ if (a.sign) P('sign', glow); Object.assign(imOff.style, { left: r[0]/iw*100 + '%', top: r[1]/ih*100 + '%', width: r[2]/iw*100 + '%', height: r[3]/ih*100 + '%' }); }
    stage.style.setProperty('--px', S0 + 'px');
    stage.style.transformOrigin = (a.win[0]*100) + '% ' + (a.win[1]*100) + '%';
    seedMotes();
    // the city seen through the window is widened round the window's middle: through an opening seen from the side,
    // at its own proportions it read as squeezed in from the sides
    const vw_ = document.getElementById('view'); if (vw_){ vw_.style.transformOrigin = (OX + a.win[0]*sw) + 'px ' + (OY + a.win[1]*sh) + 'px'; vw_.style.transform = 'scaleX(' + CITY_WIDEN + ')'; }
  }
  const CITY_WIDEN = 1.3;

  /* ---------- the pod turning: the sun swinging round, and a slow sway ---------- */
  // The city outside turns because the pod does, so the sun's beam moves too: the bake has what the sun adds at nine
  // headings (60 degrees either side of straight in); the two nearest are blended and added over the room. Past those,
  // the sun has gone round the hull and the beam fades out until it comes round again.
  sunCv = document.createElement('canvas'); sunCv.className = 't-layer t-sun'; sunCv.setAttribute('aria-hidden', 'true'); gSun = sunCv.getContext('2d');
  stage.insertBefore(sunCv, cvDust);
  function drawSun(){
    if (RTMODE){ sunCv.hidden = true; const d = T._sunH != null ? T._sunH : (((yaw - yaw0)*180/Math.PI - 60) % 360 + 540) % 360 - 180; sunH = d; sunW = Math.max(0, Math.min(1, 1 - Math.max(Math.abs(d) - 62, 0)/25))*OPEN; return; }
    const a = A[view], hs = a.heads || [], w = sunCv.width, h = sunCv.height; gSun.clearRect(0, 0, w, h); sunW = 0;
    if (!hs.length || !SUNS.length) return;
    // which way the beam moves as the city turns: the far side of the city drifts the way the sun does, so the patch on
    // the floor moves against it (the bake's patches tell us which heading moves it which way on the picture)
    const p = a.patches || [], sgn = p.length > 1 && p[p.length - 1][0] > p[0][0] ? -1 : 1; SUNSGN = 1;
    let d = ((sgn*(yaw - yaw0)*180/Math.PI + hs[0]) % 360 + 540) % 360 - 180;   // (degrees, -180..180; starts with the sun just coming in)
    sunH = d;
    const lo = hs[0], hi = hs[hs.length - 1]; let fade = Math.max(0, Math.min(1, 1 - (Math.max(lo - d, d - hi, 0))/25));
    fade *= OPEN; sunW = fade; if (fade <= 0) return; fade *= .8;
    const c = Math.max(lo, Math.min(hi, d)), f = (c - lo)/(hi - lo)*(hs.length - 1), i = Math.min(hs.length - 2, Math.floor(f)), t = f - i;
    gSun.globalCompositeOperation = 'lighter';
    if (SUNS[i].complete){ gSun.globalAlpha = (1 - t)*fade; gSun.drawImage(SUNS[i], 0, 0, w, h); }
    if (SUNS[i + 1].complete){ gSun.globalAlpha = t*fade; gSun.drawImage(SUNS[i + 1], 0, 0, w, h); }
    gSun.globalAlpha = 1; if (imRoom.complete){ gSun.globalCompositeOperation = 'destination-in'; gSun.drawImage(imRoom, 0, 0, w, h); }   // (only over the room: where the glass is, black would hide the city)
    gSun.globalCompositeOperation = 'source-over';
  }
  // the pod is afloat: it drifts a few pixels and leans a fraction of a degree, slowly, never quite repeating
  function drawSway(now){
    if (reduced) return; const t = now/1000;
    const x = Math.sin(t*.21)*2.2 + Math.sin(t*.53 + 1)*.8, y = Math.sin(t*.17 + 2)*2.6 + Math.sin(t*.41)*.9, r = Math.sin(t*.13 + .5)*.16 + Math.sin(t*.37)*.05;
    stage.style.translate = (x*S0/2).toFixed(2) + 'px ' + (y*S0/2).toFixed(2) + 'px'; stage.style.rotate = r.toFixed(3) + 'deg'; stage.style.scale = '1.03';
  }
  // the hour: the city's own, in four looks
  function pickTime(h){ return h >= 5.5 && h < 10 ? 'morning' : h >= 10 && h < 16.5 ? 'day' : h >= 16.5 && h < 19.5 ? 'evening' : 'night'; }

  /* ---------- the things that move, drawn live ---------- */
  // The bake leaves out the plants and the lamp (their shadows stay in it). Here the room's own model is built once
  // (tools/title/kitchen.js, the same one the bake uses, so every leaf matches), everything but those hidden, and they're
  // drawn each frame from the bake's camera on a canvas over the picture: the lamp swings, the leaves stir, the sun
  // turns with the city.
  const CAMS = { wide: { pos: [2.0, 2.33, 1.01], look: [-1.79, 1.28, -8.18], fov: 45.9 }, tall: { pos: [2.0, 2.33, 1.01], look: [-1.75, 1.28, -8.2], fov: 86 } };
  let live = null, liveP = null, liveAt = 0;
  function startLive(){
    if (liveP) return liveP;
    liveP = new Promise(res => { const sc = document.createElement('script'); sc.src = 'tools/title/kitchen.js?v=' + VER; sc.onload = res; sc.onerror = () => res(); document.head.appendChild(sc); }).then(async () => {
      if (typeof ROOM === 'undefined' || !ROOM.movers) return;
      const cv = document.createElement('canvas'); cv.className = 't-layer t-live'; cv.setAttribute('aria-hidden', 'true'); stage.insertBefore(cv, cvDust);
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false }); { const gl = r.getContext(), src = gl.shaderSource.bind(gl); if (r.capabilities.isWebGL2) gl.shaderSource = (sh, t) => src(sh, t.replace('out highp vec4 pc_fragColor;', 'layout(location = 0) out highp vec4 pc_fragColor;\nlayout(location = 1) out highp vec4 pc_fragNormal;')); }   // (the game's shader pieces also write a second image, the normals: declare it here too)
      r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .72; r.setClearColor(0x000000, 0);   // (a little under: the bake's own grade and shading sit lower)
      const scene = new THREE.Scene(), tick = ROOM.movers(scene); ROOM.setTime(TOD); const cam = new THREE.PerspectiveCamera(45, 1, .05, 40);
      ROOM.shutter(scene); shutScene = scene; shutCam = new THREE.PerspectiveCamera(45, 1, .05, 40); shutCam.layers.set(1);
      shutR = new THREE.WebGLRenderer({ canvas: shutCv, alpha: true, antialias: true }); { const gl = shutR.getContext(), src = gl.shaderSource.bind(gl); if (shutR.capabilities.isWebGL2) gl.shaderSource = (sh, t) => src(sh, t.replace('out highp vec4 pc_fragColor;', 'layout(location = 0) out highp vec4 pc_fragColor;\nlayout(location = 1) out highp vec4 pc_fragNormal;')); }
      shutR.outputEncoding = THREE.sRGBEncoding; shutR.toneMapping = THREE.ACESFilmicToneMapping; shutR.toneMappingExposure = .8; shutR.setClearColor(0x000000, 0);
      // the room lit live, when the surface bake is there (else the baked pictures, as before)
      if (GB) await new Promise(res => { const sc = document.createElement('script'); sc.src = 'tools/title/realtime.js?v=' + VER; sc.onload = res; sc.onerror = () => res(); document.head.appendChild(sc); });
      if (GB && typeof TITLE_RT !== 'undefined'){ try { rtCv = document.createElement('canvas'); rtCv.className = 't-layer t-rt'; rtCv.setAttribute('aria-hidden', 'true'); stage.insertBefore(rtCv, imRoom);
        RT = TITLE_RT.create(rtCv, scene, ROOM, 'assets/title/', GB); } catch (e){ try { console.warn('title lighting:', e); } catch (_) {} RT = null; if (rtCv){ rtCv.remove(); rtCv = null; } } }
      if (!RT && RTMODE){ RTMODE = false; A = {}; for (const v of ['wide', 'tall']) A[v] = RAW[v][TOD] || RAW[v].morning; view = null; layout(); }
      let vw = null;
      live = {
        view(v){ vw = v; const a = A[v], c = a.cam || CAMS[v]; r.setPixelRatio(1); r.setSize(a.w, a.h, false); cam.fov = c.fov; cam.aspect = a.w/a.h; cam.position.set(...c.pos); cam.lookAt(...c.look); cam.updateProjectionMatrix();
          if (RT) RT.view(v);
          shutR.setPixelRatio(1); shutR.setSize(a.w*2, a.h*2, false); shutCam.fov = cam.fov; shutCam.aspect = cam.aspect; shutCam.position.copy(cam.position); shutCam.quaternion.copy(cam.quaternion); shutCam.updateProjectionMatrix(); },
        time(){ ROOM.setTime(TOD); const k = { morning: 1.1, day: 1.3, evening: .9, night: .7 }[TOD] || 1; ROOM.shutterLight.lt.intensity = 1.2*k; ROOM.shutterLight.hm.intensity = .45*k; },
        at(x, y, z){ const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x + 1)/2, (1 - v.y)/2]; },
        draw(t){ tick(reduced ? 0 : t);
          if (TP){ if (RT && RTMODE) TP.time('rt', () => RT.draw(lightParams()), RT.renderer); TP.time('live', () => { liveSun(); r.render(scene, cam); }, r); return; }
          if (RT && RTMODE) RT.draw(lightParams()); liveSun(); r.render(scene, cam); },
        renderer: r
      };
      if (view) live.view(view);
    }).catch(e => { try { console.warn('title live layer:', e); } catch (_) {} });
    return liveP;
  }
  let SUNSGN = 1;
  // the live layer's sun (the plants and the lamp drawn over the room): the same light as the room's, the city's at night
  function liveSun(){
    const G = cityGlow(), nK = G.nK || 0; ROOM.aimSun(sunW > 0 || nK > 0 ? sunH*Math.PI/180*SUNSGN : null);
    const Ls = ROOM.L.sun;
    if (nK > 0){ const wc = ROOM.winCenter(), d = Ls.position.clone().sub(wc).normalize().lerp(G.toCity, nK).normalize();
      Ls.position.copy(wc).addScaledVector(d, 9); Ls.target.position.copy(wc).addScaledVector(d, -3); Ls.target.updateMatrixWorld(); Ls.updateMatrixWorld();
      Ls.color.set(ROOM.TIMESDATA[TOD].sunC).lerp(G.col, nK*.85); Ls.intensity *= 1 - nK + nK*.85*G.fl; }
    Ls.intensity *= .6*(sunW*(1 - nK) + OPEN*nK)*sunKNow();
  }
  // the room's light at the city's hour: the four looks the bake knew, blended through the day
  const KEYS = [[-3, 'night'], [5, 'night'], [8, 'morning'], [13, 'day'], [18, 'evening'], [21, 'night'], [29, 'night'], [32, 'morning']];
  // At night the light in the window isn't a sun's: it's the city's, coming up from the streets far below and spread all round, so it lights the
  // ceiling and the undersides rather than the floor, whichever way the pod faces. It takes the signs' colours, drifting slowly between
  // magenta, cyan, violet and amber, and now and then it buzzes, as a failing tube does. Its direction stays put (the shadow map is only
  // drawn again when the light moves: realtime.js), only its colour and strength change
  let NEONC = null;
  function cityGlow(){
    const h = ((HOUR % 24) + 24) % 24; let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const [h0, k0] = KEYS[i], [h1, k1] = KEYS[i + 1], f = h1 > h0 ? (h - h0)/(h1 - h0) : 0, nK = (k0 === 'night' ? 1 - f : 0) + (k1 === 'night' ? f : 0);
    if (nK <= 0) return { nK: 0 };
    NEONC = NEONC || [0xff3fd0, 0x2fd8ff, 0x8a5cff, 0xffa040].map(c => new THREE.Color(c));
    const ph = performance.now()/1000, out = ROOM.winNormal().negate(), e = -26*Math.PI/180;
    const toCity = new THREE.Vector3(out.x, 0, out.z).normalize().multiplyScalar(Math.cos(e)); toCity.y = Math.sin(e);
    const u = (ph*.045) % NEONC.length, k = Math.floor(u), fr = u - k, sm = fr*fr*(3 - 2*fr), col = NEONC[k].clone().lerp(NEONC[(k + 1) % NEONC.length], sm);
    const d = Math.max(0, Math.sin(ph*1.3)*Math.sin(ph*.53 + 2) - .72)/.28, fl = 1 - .45*d*(.5 + .5*Math.sin(ph*37));
    return { nK, toCity, col, fl };
  }
  // how strong the sun comes in at each of the room's hours, against the bake's own numbers: the evening sun is low and weak, far dimmer than
  // the day's (the bake had it nearly as bright, owner Oct 26), the morning a little under the day
  const SUNK = { morning: .8, day: 1, evening: .38, night: 1 };
  function sunKNow(){ const h = ((HOUR % 24) + 24) % 24; let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++; const [h0, k0] = KEYS[i], [h1, k1] = KEYS[i + 1], f = h1 > h0 ? (h - h0)/(h1 - h0) : 0; return (SUNK[k0] ?? 1)*(1 - f) + (SUNK[k1] ?? 1)*f; }
  function lightParams(){
    const T = ROOM.TIMESDATA, h = ((HOUR % 24) + 24) % 24; let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const [h0, k0] = KEYS[i], [h1, k1] = KEYS[i + 1], f = h1 > h0 ? (h - h0)/(h1 - h0) : 0, a = T[k0], b = T[k1];
    const L = (x, y) => x + (y - x)*f, Cl = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);
    const e = L(a.elev, b.elev)*Math.PI/180, th = sunH*Math.PI/180, out = ROOM.winNormal().negate(), c = Math.cos(th), s_ = Math.sin(th);
    const toSun = new THREE.Vector3(out.x*c - out.z*s_, 0, out.x*s_ + out.z*c).multiplyScalar(Math.cos(e)); toSun.y = Math.sin(e);
    const dimK = .35 + .65*OPEN, sunI = L(a.sunI*(SUNK[k0] ?? 1), b.sunI*(SUNK[k1] ?? 1));
    // at night the city's neon drifts the light slowly between blue and purple (how much night there is: the lamps' weight)
    const nk = Math.min(1, L(a.lamps, b.lamps)), ph = performance.now()/1000, drift = .5 + .5*Math.sin(ph*.45) *Math.sin(ph*.17 + 1);
    const neon = c => nk > 0 ? c.lerp(new THREE.Color(drift > .5 ? 0xb04cff : 0x4c7bff), nk*.35*Math.abs(drift - .5)*2) : c;
    const G = cityGlow(), nK = G.nK; let sunC = Cl(a.sunC, b.sunC), sI = sunI, on = sunW;
    if (nK > 0){ toSun.lerp(G.toCity, nK).normalize(); sunC.lerp(G.col, nK*.85); sI = sunI*(1 - nK + nK*.85*G.fl); on = sunW*(1 - nK) + OPEN*nK; }
    return { sunDir: toSun.negate(), sunCol: sunC, sunI: sI, sunOn: on*(sunI > 0 ? 1 : 0), sky: neon(Cl(a.sky, b.sky)), skyI: L(a.skyI, b.skyI),
      hemi: [Cl(a.hemi[0], b.hemi[0]), Cl(a.hemi[1], b.hemi[1]), L(a.hemi[2], b.hemi[2])*dimK], amb: L(a.amb, b.amb)*dimK, fill: [Cl(a.fill[0], b.fill[0]), L(a.fill[1], b.fill[1])*dimK],
      density: L(a.density, b.density)*(1 - .5*nK)*(.4 + .6*sunKNow()), lampsK: L(a.lamps, b.lamps), grade: [0, 1].map(j => [0, 1, 2].map(k => L(a.grade[j][k], b.grade[j][k]))), open: OPEN,
      barOn: BAR_ON, bounceK: (.25 + .75*on)*.45*OPEN*(sunI > 0 ? Math.min(1, sI/5) : .3) };
  }
  let BAR_ON = 1;
  function drawLive(now){ if (!live || now - liveAt < (TP && TP.every != null ? TP.every : 0)) return; liveAt = now; live.draw(now/1000); drawPool(); }
  // the pendant's light on the table at evening and night: a warm pool under the bulb, moving as the lamp swings
  const poolCv = document.createElement('canvas'), gPo = poolCv.getContext('2d'); poolCv.className = 't-layer t-sun'; poolCv.setAttribute('aria-hidden', 'true'); stage.insertBefore(poolCv, cvDust);
  function drawPool(){ if (RTMODE){ poolCv.hidden = true; return; }
    const w = poolCv.width = cvDust.width, h = poolCv.height = cvDust.height, k = typeof ROOM !== 'undefined' ? ROOM.lampsK || 0 : 0;
    if (!live || !k || !ROOM.bulbAt) return;
    const b = ROOM.bulbAt(), y = 1.145, c = live.at(b.x, y, b.z), px = [live.at(b.x + .55, y, b.z), live.at(b.x - .55, y, b.z), live.at(b.x, y, b.z + .55), live.at(b.x, y, b.z - .55)];
    const rx = Math.max(...px.map(p => Math.abs(p[0] - c[0])))*w, ry = Math.max(...px.map(p => Math.abs(p[1] - c[1])))*h;
    gPo.save(); gPo.translate(c[0]*w, c[1]*h); gPo.scale(1, ry/Math.max(1, rx)); const g = gPo.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(255,196,120,' + (.55*k).toFixed(3) + ')'); g.addColorStop(.5, 'rgba(255,170,90,' + (.22*k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,150,70,0)');
    gPo.fillStyle = g; gPo.fillRect(-rx, -rx, 2*rx, 2*rx); gPo.restore();
    // the bulb's own glow round the shade's mouth
    const bc = live.at(b.x, b.y - .02, b.z), br = rx*.35; const g2 = gPo.createRadialGradient(bc[0]*w, bc[1]*h, 0, bc[0]*w, bc[1]*h, br); g2.addColorStop(0, 'rgba(255,220,160,' + (.6*k).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,200,120,0)'); gPo.fillStyle = g2; gPo.fillRect(0, 0, w, h);
    if (imRoom.complete){ gPo.globalCompositeOperation = 'destination-in'; gPo.drawImage(imRoom, 0, 0, w, h); gPo.globalCompositeOperation = 'source-over'; }
  }

  /* ---------- the shutter on the porthole ---------- */
  // An iris of curved plates closes the window while the city loads (it streams in round the camera, nothing to look
  // at); once it's all there the plates swing back into the frame and the sun comes in with them.
  const shutCv = document.createElement('canvas'); shutCv.className = 't-layer'; shutCv.setAttribute('aria-hidden', 'true'); stage.insertBefore(shutCv, imRoom);
  let OPEN = 0, openFrom = null, shownAt = 0, DIM = 1;
  // the light bar's own light, kept bright while the room is dim: its glowing pixels (where the lit picture differs from
  // the one with the bar dark) drawn undimmed over the room, with a soft glow round it, both blinking with it
  const barCv = document.createElement('canvas'), gB = barCv.getContext('2d'); barCv.className = 't-layer t-sun'; barCv.setAttribute('aria-hidden', 'true'); stage.insertBefore(barCv, cvDust);
  let barImg = null, barFor = '';
  function makeBar(){
    const a = A[view], r = a && a.signRect, key = imRoom.src + '|' + imOff.src; if (!r || !imRoom.complete || !imOff.complete || !imOff.naturalWidth || barFor === key) return; barFor = key;
    const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3]; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(imRoom, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); const on = g.getImageData(0, 0, r[2], r[3]); g.clearRect(0, 0, r[2], r[3]); g.drawImage(imOff, 0, 0); const off = g.getImageData(0, 0, r[2], r[3]);
    for (let i = 0; i < on.data.length; i += 4){ const d = on.data[i] + on.data[i + 1] + on.data[i + 2] - off.data[i] - off.data[i + 1] - off.data[i + 2]; if (d < 60) on.data[i + 3] = 0; }
    g.putImageData(on, 0, 0); barImg = c;
  }
  function drawBar(dark){ if (RTMODE){ barCv.hidden = true; return; }
    const w = barCv.width = cvDust.width, h = barCv.height = cvDust.height; makeBar(); const a = A[view], r = a.signRect; if (!barImg || !r || DIM >= .999 || dark) return;
    const k = 1 - DIM; gB.globalAlpha = Math.min(1, k*1.6); gB.drawImage(barImg, r[0], r[1]); gB.globalAlpha = 1;
    const cx = r[0] + r[2]/2, cy = r[1] + r[3]/2, rad = r[2]*1.4, g = gB.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,214,150,' + (.4*k).toFixed(3) + ')'); g.addColorStop(.4, 'rgba(255,190,120,' + (.14*k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,180,110,0)');
    gB.save(); gB.translate(cx, cy); gB.scale(1, .7); gB.translate(-cx, -cy); gB.fillStyle = g; gB.fillRect(cx - rad, cy - rad, 2*rad, 2*rad); gB.restore();
  }
  T.cityHalf = () => false;   // (it drew every other frame behind the porthole: the city stepped against the room's sway)
  T._perf = () => { const out = { renderers: {}, canvases: [] };
    const info = (k, r) => { if (!r) return; const i = r.info, gl = r.getContext(), c = r.domElement; let gpu = ''; try { const d = gl.getExtension('WEBGL_debug_renderer_info'); gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
      out.renderers[k] = { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : null, canvas: [c.width, c.height], css: [c.clientWidth, c.clientHeight], pixelRatio: r.getPixelRatio(), webgl2: r.capabilities.isWebGL2, gpu, antialias: gl.getContextAttributes().antialias }; };
    try { info('game', typeof renderer !== 'undefined' ? renderer : null); } catch (e) {}
    info('live', live && live.renderer); info('shutter', shutR); info('rt', RT && RT.renderer);
    let tris = 0, meshes = 0; try { shutScene.traverse(o => { if (o.isMesh){ meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count)/3; } }); } catch (e) {} out.roomMeshes = meshes; out.roomTriangles = Math.round(tris);
    for (const c of document.querySelectorAll('canvas')){ const cs = getComputedStyle(c); if (c.offsetParent === null && cs.position !== 'fixed') continue; out.canvases.push({ cls: c.className || c.id, size: [c.width, c.height], css: [c.clientWidth, c.clientHeight], filter: cs.filter, blend: cs.mixBlendMode, hidden: c.hidden, display: cs.display }); }
    const st = getComputedStyle(stage); out.stage = { transform: st.transform, translate: st.translate, rotate: st.rotate, scale: st.scale, filter: st.filter, willChange: st.willChange };
    out.state = { OPEN, RTMODE, HOUR, sunH, sunW, view, dpr: devicePixelRatio, inner: [innerWidth, innerHeight], cityWiden: (document.getElementById('view') || {}).style ? document.getElementById('view').style.transform : null };
    return out; };
  T._rt = () => RT;
  T._hold = () => { shownAt = 1e15; openFrom = null; };
  T._open = () => { openFrom = -1e9; }; T._hour = h => { HOUR = h; }; T._dbg = () => ({ TOD, HOUR, OPEN, sunH, sunW, RTMODE, rt: !!RT, p: RT && ROOM ? lightParams() : null });   // (testing: keep the shutter shut)
  const furnReady = () => { try { return typeof FURN === 'undefined' || !FURN.warmed || FURN.warmed(); } catch (e) { return true; } };
  // (a city with nothing built yet has nobody to wait for: a new one, or one just started)
  const builtNone = () => { try { for (const c of cells.values()) if (c.sections.length || c.mega) return false; return true; } catch (e) { return false; } };
  const cityReady = () => { try { return (typeof LOADP === 'undefined' || (!LOADP.on && !(LOADP.cool > 0))) && (typeof pplReady === 'undefined' || pplReady || builtNone()); } catch (e) { return true; } };
  // Loaded: the plots are all in, the people out, and the blocks merged (or ten seconds since the rest, merges can go on a while). The shutter used to give up after 15 s and open
  // on a city still building (owner Oct 26: it opened before the game had loaded); now it waits as long as the load is getting somewhere, and only gives up when nothing has
  // moved on for 20 s
  let progVal = null, progAt = 0, loadedAt = null;
  function stalled(now){
    let v = ''; try { v = [LOADP.on, LOADP.phase, LOADP.placed, LOADP.cool > 0, pplReady].join(); } catch (e) {}
    if (v !== progVal){ progVal = v; progAt = now; } return now - progAt > 20000;
  }
  function settled(now){
    if (!cityReady()){ loadedAt = null; return false; }
    if (loadedAt === null) loadedAt = now;
    let merging = false; try { merging = !!(solidDirty.size || SOLID_JOB); } catch (e) {}
    return (!merging && now - loadedAt > 500) || now - loadedAt > 10000;
  }
  let shutR = null, shutCam = null, shutScene = null;
  function drawShutter(now){
    // the shutter is the loading screen: it opens once the city has loaded and the Furnish page is warm (its shaders compiled), so neither costs anything later
    if (openFrom === null && shutR && now - shownAt > 900){ const ok = settled(now); if ((ok && (furnReady() || now - shownAt > 60000)) || stalled(now)) openFrom = now + 300; }   // (never stuck shut: 60 s at most for the Furnish warm-up once the city has loaded, and a load that stops getting anywhere for 20 s)
    const tt = openFrom === null ? 0 : Math.max(0, Math.min(1, (now - openFrom)/3200)); OPEN = reduced ? (openFrom === null ? 0 : 1) : tt*tt*(3 - 2*tt);
    // the room is dark while it's shut (only what light leaks in, and its own lamps), and the daylight comes up with the plates
    const lit = .3 + .7*Math.pow(OPEN, .8); DIM = lit; if (Math.abs(lit - (drawShutter.lit || 0)) > .004){ drawShutter.lit = lit; const f = lit >= .999 ? '' : 'brightness(' + lit.toFixed(3) + ') saturate(' + (.7 + .3*lit).toFixed(3) + ')'; for (const el of (RTMODE ? [shutCv, stage.querySelector('.t-live')] : [imRoom, imGlass, imOff, shutCv, stage.querySelector('.t-live')])) if (el) el.style.filter = f; }
    if (!shutR) return; shutCv.hidden = OPEN >= 1; if (OPEN >= 1){ if (drawShutter.last !== 1){ ROOM.setShutter(1); drawShutter.last = 1; } return; } drawShutter.last = OPEN;
    ROOM.setShutter(OPEN); if (!(TP && TP.off.has('shutterGL'))) shutR.render(shutScene, shutCam);
  }
  /* ---------- steam from the mug ---------- */
  let steam = [], steamAt = 0;
  function drawSteam(now, dt){
    const a = A[view]; if (!a.mug || reduced) return; const w = cvDust.width, h = cvDust.height, mx = a.mug[0]*w, my = a.mug[1]*h, sc = h/540;
    if (now - steamAt > 140){ steamAt = now; steam.push({ t: 0, ph: Math.random()*6.3, x: (Math.random() - .5)*3*sc }); }
    for (const p of steam) p.t += dt/3.2; steam = steam.filter(p => p.t < 1);
    for (const p of steam){ const y = my - p.t*46*sc, x = mx + p.x + Math.sin(p.t*5 + p.ph)*4*sc*p.t, r = (1 + p.t*4)*sc, al = Math.sin(Math.PI*Math.min(1, p.t*1.4))*.16*(1 - p.t);
      gD.fillStyle = 'rgba(245,240,232,' + al.toFixed(3) + ')'; gD.beginPath(); gD.arc(x, y, r, 0, 7); gD.fill(); }
  }

  /* ---------- the plants on the sill, swaying (old: from a baked cut-out) ---------- */
  // their picture is sheared a pixel or two, more toward the tips: each column measured from its lowest leaf (the pot's rim)
  function loadPlants(v){
    plSrc = null; const a = A[v]; if (!a.plantRect) return;
    const im = new Image(); im.onload = () => { if (view !== v) return;
      plW = cvPl.width = im.width; plH = cvPl.height = im.height; gP.clearRect(0, 0, plW, plH); gP.drawImage(im, 0, 0);
      const d = gP.getImageData(0, 0, plW, plH); plSrc = new Uint32Array(d.data.buffer.slice(0)); plOut = d; plBase = new Int16Array(plW).fill(-1);
      for (let x = 0; x < plW; x++) for (let y = plH - 1; y >= 0; y--) if (plSrc[y*plW + x] >>> 24){ plBase[x] = y; break; } };
    im.src = 'assets/title/plants-' + v + '-' + TOD + '.png?v=' + VER;
  }
  function drawPlants(now){
    if (!plSrc || reduced || now - plantAt < 33) return; plantAt = now;
    const t = now/1000, out = new Uint32Array(plOut.data.buffer); out.fill(0);
    const gust = .6 + .4*Math.sin(t*.23)*Math.sin(t*.11 + 1.3);
    for (let x = 0; x < plW; x++){ const b = plBase[x]; if (b < 0) continue;
      const ph = Math.sin(t*.9 + x*.03)*.7 + Math.sin(t*2.1 + x*.08)*.3;
      for (let y = 0; y <= b; y++){ const hgt = b - y, dx = Math.round(Math.min(2.4, hgt/45*2.4)*ph*gust), sx = x - dx;
        if (sx >= 0 && sx < plW) out[y*plW + x] = plSrc[y*plW + sx]; } }
    gP.putImageData(plOut, 0, 0);
  }

  /* ---------- clouds past the window ---------- */
  // a few soft pixel clouds drifting slowly across the upper half of the glass, over the city's sky
  const CLOUD = { morning: ['214,200,190', '255,247,232', 1], day: ['200,208,218', '255,255,255', 1], evening: ['170,110,120', '255,190,150', 1], night: ['40,48,70', '90,100,130', .7] };
  function seedClouds(){
    clouds = []; if (reduced || !A || !view) return; const a = A[view], r = a.winR;
    for (let i = 0; i < 6; i++){ const puffs = [], n = 5 + Math.floor(Math.random()*6), sz = r*(.08 + Math.random()*.08);
      for (let k = 0; k < n; k++){ const m = 1 - Math.abs(k - (n - 1)/2)/(n/2); puffs.push([(k - n/2)*sz*1.1 + (Math.random() - .5)*sz*.4, -m*sz*.7 - Math.random()*sz*.3, sz*(.5 + m*.5 + Math.random()*.2)]); }
      clouds.push({ x: (Math.random()*2.4 - 1.2)*r, y: -r*(.3 + Math.random()*.55), base: sz*.35, puffs, sp: r*(.004 + Math.random()*.005), a: .22 + Math.random()*.18 }); }
  }
  function drawClouds(dt){
    const w = cvSky.width, h = cvSky.height; gS.clearRect(0, 0, w, h); if (!clouds.length) return;
    const a = A[view], cx = a.win[0]*w, cy = a.win[1]*h, r = a.winR;
    gS.save(); gS.beginPath(); gS.arc(cx, cy, r, 0, Math.PI*2); gS.clip();
    for (const c of clouds){ c.x += c.sp*dt; if (c.x > r*1.4) c.x = -r*1.4;
      const by = Math.round(cy + c.y + c.base), fade = Math.max(0, Math.min(1, (cy + r*.1 - by)/(r*.4))); if (fade <= 0) continue;
      gS.save(); gS.beginPath(); gS.rect(0, 0, w, by); gS.clip();   // (a flat underside, like real fair-weather clouds)
      for (const [dx, dy, pr] of c.puffs){ const x = Math.round(cx + c.x + dx), y = Math.round(cy + c.y + dy);
        const CC = CLOUD[TOD]; gS.fillStyle = 'rgba(' + CC[0] + ',' + (c.a*.8*fade*CC[2]).toFixed(3) + ')'; gS.beginPath(); gS.ellipse(x, y + pr*.18, pr*1.7, pr*.75, 0, 0, Math.PI*2); gS.fill(); }
      for (const [dx, dy, pr] of c.puffs){ const x = Math.round(cx + c.x + dx), y = Math.round(cy + c.y + dy);
        gS.fillStyle = 'rgba(' + CLOUD[TOD][1] + ',' + (c.a*fade*CLOUD[TOD][2]).toFixed(3) + ')'; gS.beginPath(); gS.ellipse(x, y - pr*.08, pr*1.45, pr*.6, 0, 0, Math.PI*2); gS.fill(); }
      gS.restore(); }
    gS.restore();
  }

  /* ---------- dust in the sunbeam ---------- */
  // motes drift in the band of light from the window to the sunlit floor, catching the light as they turn
  function seedMotes(){
    const a = A[view], n = reduced ? 0 : 70; motes = [];
    for (let i = 0; i < n; i++) motes.push({ t: Math.random(), o: Math.random()*2 - 1, z: Math.random(), ph: Math.random()*6.3, sp: .004 + Math.random()*.01 });
  }
  function drawDust(now, dt){
    const a = A[view], w = cvDust.width, h = cvDust.height; gD.clearRect(0, 0, w, h);
    const pt = a.patches && a.patches.length ? a.patches[a.patches.length >> 1] : a.patch; if (!pt) return;   // (the straight-in heading's sunlit patch)
    const x0 = a.win[0]*w, y0 = a.win[1]*h, x1 = Math.min(pt[0], 1.05)*w, y1 = Math.min(pt[1], 1.0)*h, r = a.winR*.8;
    for (const m of motes){
      m.t += m.sp*dt; if (m.t > 1){ m.t = 0; m.o = Math.random()*2 - 1; }
      const t = m.t, bx = x0 + (x1 - x0)*t, by = y0 + (y1 - y0)*t, spread = r*(.8 + t*1.2);
      const x = bx + m.o*spread + Math.sin(now/1700 + m.ph)*6, y = by + Math.cos(now/2100 + m.ph)*5 - m.o*spread*.3;
      const tw = .45 + .55*Math.max(0, Math.sin(now/600 + m.ph*3)), al = tw*(1 - Math.abs(m.o))*Math.sin(Math.PI*t)*.9*sunW;
      if (al < .05) continue;
      gD.fillStyle = 'rgba(255,244,214,' + al.toFixed(2) + ')'; gD.fillRect(Math.round(x), Math.round(y), m.z > .8 ? 2 : 1, m.z > .8 ? 2 : 1);
    }
  }
  let flick = [], flickNext = 0;
  function loop(now){
    if (!T.on) return; raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(.1, (now - last)/1000) : 0; last = now;
    try { if (typeof yawT !== 'undefined' && !reduced) yawT += dt*.02; if (yaw0 === null) yaw0 = yaw; } catch (e) {}
    aimCity();
    if (T.leaving && A && view) flight();
    if (A && view){ if (TP){ TP.time('shutter', () => drawShutter(now), shutR); drawSun(); if (!T.leaving) TP.time('sway', () => drawSway(now)); drawLive(now); TP.time('fx', () => { drawDust(now, dt); drawSteam(now, dt); drawClouds(dt); }); }
      else { drawShutter(now); drawSun(); if (!T.leaving) drawSway(now); drawLive(now); drawDust(now, dt); drawSteam(now, dt); drawClouds(dt); } }
    // the light bar: steady, and now and then it blinks: a stutter of two or three, or one slow dip
    if (!reduced && now > flickNext){ flick = []; let t = now;
      if (Math.random() < .35){ flick.push([t, t + 500 + Math.random()*400]); t += 900; }
      else for (let k = 0, n = 2 + Math.floor(Math.random()*2); k < n; k++){ const d = 60 + Math.random()*120; flick.push([t, t + d]); t += d + 60 + Math.random()*140; }
      flickNext = t + 4000 + Math.random()*6000; }
    const dark = flick.some(([a, b]) => now >= a && now < b);
    glow.classList.toggle('dip', dark); imOff.classList.toggle('on', dark && !RTMODE); BAR_ON = dark ? 0 : 1; if (A && view) drawBar(dark);
    if (now - noteAt > 1500){ noteAt = now; fillNote(); }
  }
  let noteAt = 0;
  function fillNote(){
    let day = 1, res = 0; try { day = STORY.dayOf(STORY.clock); } catch (e) {} try { for (const p of people.values()) if (!p.visitor && !p.gone) res++; } catch (e) {}
    $t('tHoloLine').textContent = 'Day ' + day + ' · ' + res.toLocaleString('en-US') + ' residents';
    if (SLOTS.active) SLOTS.list().then(l => { const a = l.find(x => x.active); if (a) $t('tHoloName').textContent = a.name; }).catch(() => {});
  }

  /* ---------- showing and leaving ---------- */
  let was = null;
  function setScene(){
    try {
      was = { hour: S.hour, cycle: S.cycle, wx: typeof LK !== 'undefined' ? { mode: LK.wx.mode, set: LK.wx.set } : null, zoomT };
      S.cycle = false; TOD = pickTime(S.hour);   // (the city's own hour, held still; the room's light matches it)
      if (typeof LK !== 'undefined' && LK.setWeather) LK.setWeather('clear', true, true); else S.rain = false;
      yaw0 = null;
      was.cam = { goal: camGoal.clone(), pitchT };
      // the player's city, for framing it in the window: the middle of everything built, and how far it reaches
      let x = 0, z = 0, n = 0; for (const c of cells.values()){ x += c.x; z += c.z; n++; } x = n ? x/n : 0; z = n ? z/n : 0;
      let r = 0; for (const c of cells.values()) r = Math.max(r, Math.hypot(c.x - x, c.z - z)); CITY = { x, z, r: r + LOT*.8 };
    } catch (e) { CITY = null; }
  }
  // Each frame while the title is up: the camera dropped to a low, looking-out angle and slid so the city sits in the
  // round window (the picture is placed over the screen, so the window's middle isn't the screen's), zoomed to fill it.
  let CITY = null;
  function aimCity(){
    if (!CITY || !A || !view || root.classList.contains('leaving')) return;
    try {
      const a = A[view], wx = OX + a.win[0]*a.w*S0, wy = OY + a.win[1]*a.h*S0, wr = a.winR*S0;
      const P = 50*Math.PI/180; pitchT = P;   // (high, a bird's-eye look down on the city from the floating pod)
      zoomT = 60;   // (well out: the whole city small below, the island's edge and the water round it)
      const k = 2*zoomT/H, ox = (wx - W/2)*k, oy = -(wy - H/2)*k, sy = Math.sin(yaw), cy = Math.cos(yaw);
      const d = oy/Math.sin(P);   // (the city's middle in the window's middle)
      camGoal.set(CITY.x - cy*ox + sy*d, TARGET_Y, CITY.z + sy*ox + cy*d);
    } catch (e) {}
  }
  function restoreScene(){
    if (!was) return;
    try {
      // (once the story clock is going, the hour stays as it is: it's the saved city's, set while the title was up (story.js restore), and putting
      //  back an earlier one, even a few minutes, the story clock reads as the next day)
      if (typeof STORY !== 'undefined' && STORY.on && STORY.lastHour !== null){ if (STORY.resumeHour != null) STORY.resumeHour = null; } else S.hour = was.hour;
      S.cycle = was.cycle;   // (the camera stays where the title left it: the window's view, now the game's)
      if (was.wx && typeof LK !== 'undefined'){ if (was.wx.mode === 'auto') LK.setAutoWeather(true, true); else LK.setWeather(was.wx.set, false, true); }
    } catch (e) {}
    was = null;
  }
  // the city's hour came back from the save while the title was up (story.js restore: it loads a moment after the title shows): the room is lit
  // for that hour instead, the light through the shutter, the sun's pictures and the clouds, and Continue keeps it
  T.setHour = h => {
    if (!T.on) return; HOUR = h; if (was) was.hour = h;
    const tod = pickTime(h); if (tod === TOD) return; TOD = tod; preload(tod);
    if (!RTMODE && RAW){ A = {}; for (const v of ['wide', 'tall']) A[v] = RAW[v][TOD] || RAW[v].morning; }
    view = null; try { layout(); } catch (e) {} if (live){ live.time(); if (view) live.view(view); }
  };
  T.show = async () => {
    if (T.on) return; T.on = true; try { if (scWas === null){ scWas = SC.mode; SC.mode = 'off'; } } catch (e) {}   // (the city's still-parts cache: it held frames while the pod turned slowly, so the city stepped)
    document.documentElement.classList.add('title-on'); root.hidden = false; root.classList.remove('leaving');
    setScene(); RAW = RAW || await anchorsP;
    if (!RAW){ T.hide(true); return; }   // (the pictures couldn't be had: straight into the city)
    GB = GB || await gbufP; HOUR = was ? was.hour : S.hour; RTMODE = !!GB && (!liveP || !!RT);
    A = {}; for (const v of ['wide', 'tall']) A[v] = RTMODE ? GB[v] : (RAW[v][TOD] || RAW[v].morning); view = null;
    OPEN = 0; openFrom = null; shownAt = performance.now();
    stage.style.visibility = 'hidden';
    T.ready = new Promise(res => { const t0 = performance.now(); (function wait(){ if (((RTMODE ? RT && RT.loaded : imRoom.complete && imRoom.naturalWidth) && shutR && view) || performance.now() - t0 > 9000){ stage.style.visibility = ''; shownAt = performance.now(); res(); } else setTimeout(wait, 60); })(); });
    const boot = document.documentElement.classList.contains('title-boot');
    if (boot){ const ready = () => (RTMODE ? RT && RT.loaded : imRoom.complete && imRoom.naturalWidth) && shutR, t0 = performance.now();
      (function wait(){ if (ready() || performance.now() - t0 > 9000){ shownAt = performance.now(); setTimeout(() => document.documentElement.classList.remove('title-boot'), 120); } else setTimeout(wait, 100); })(); }
    startLive().then(() => { if (live){ live.time(); if (view) live.view(view); } });
    layout(); aimCity(); try { camT.copy(camGoal); } catch (e) {} try { applyRenderRes(zoom); } catch (e) {} last = 0; raf = requestAnimationFrame(loop); fillNote();
    setTimeout(() => { const c = menu.querySelector('[data-act="continue"]'); if (c) c.focus({ preventScroll: true }); }, 60);
  };
  T.hide = (instant) => {
    if (!T.on) return;
    closePanel(); setDeck(false);
    if (instant || reduced){ finish(); return; }
    root.classList.add('leaving'); T.leaving = true; leaveAt = performance.now(); crossed = false;
    try { applyRenderRes(zoom); } catch (e) {}   // (the city at its full size again: it's about to fill the screen)
    const a = A && view && A[view];
    if (!a){ finish(); return; }
    // how far the stage must grow round the window's middle for the round window to cover the whole screen
    const wx = OX + a.win[0]*a.w*S0, wy = OY + a.win[1]*a.h*S0, far = Math.max(Math.hypot(wx, wy), Math.hypot(W - wx, wy), Math.hypot(wx, H - wy), Math.hypot(W - wx, H - wy));
    flightTo = Math.max(2, far/(a.winR*S0*1.03))*1.2; flightC = [wx/W, 1 - wy/H];
    sway0 = { t: stage.style.translate, r: parseFloat(stage.style.rotate) || 0 };
  };
  // From the game back to the title: the city's picture turns into a security feed (grey, scanlines, a REC mark, a
  // timestamp), jitters, then the tube switches off (it collapses to a bright line, then a dot), and the room fades up.
  T.fromGame = () => {
    if (T.on || T.cutting) return; if (reduced){ T.show(); return; } T.cutting = true;
    preload(pickTime(S.hour));
    const ov = document.createElement('div'); ov.id = 'cctv'; const d = new Date(), pad = n => String(n).padStart(2, '0');
    ov.innerHTML = '<span class="cc-rec">\u25CF REC</span><span class="cc-cam">CAM 04 \u00B7 DISTRICT</span><span class="cc-time">' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '</span><canvas class="cc-noise"></canvas>';
    document.documentElement.appendChild(ov); const nz = ov.querySelector('canvas'), gN = nz.getContext('2d'); nz.width = 200; nz.height = 120;
    let on = true; (function noise(){ if (!on) return; const im = gN.createImageData(200, 120); for (let i = 0; i < im.data.length; i += 4){ const v = Math.random()*255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } gN.putImageData(im, 0, 0); requestAnimationFrame(noise); })();
    document.documentElement.classList.add('cctv-out');
    setTimeout(() => { on = false; document.documentElement.classList.remove('cctv-out'); ov.remove();
      const fade = document.createElement('div'); fade.id = 'cctvFade'; fade.className = 'hold'; document.body.appendChild(fade);
      Promise.resolve(T.show()).then(() => T.ready).then(() => { fade.className = ''; setTimeout(() => fade.remove(), 900); }); T.cutting = false; }, 1150);
  };
  // Leaving for the city: the view drifts towards the porthole and through it. The room grows round the window's middle
  // (the city behind stays put: it's far off, so it hardly changes as you near the glass), the glass bends the city as you
  // pass it (a lens ripple in the game's last pass, sky.js), and the city is then the game's own view at the same zoom.
  let scWas = null, leaveAt = 0, flightTo = 4, flightC = [.5, .5], sway0 = null, crossed = false; const FLIGHT = 2600;
  function flight(){
    const t = Math.min(1, (performance.now() - leaveAt)/FLIGHT), e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2.2)/2;   // (slow away, then on through)
    const s = Math.pow(flightTo, e), ec = Math.log(flightTo/1.2)/Math.log(flightTo);   // (ec: where the window's rim passes the screen's edges: the glass)
    stage.style.scale = (1.03*s).toFixed(4); stage.style.rotate = (sway0.r*(1 - e)).toFixed(3) + 'deg';
    // The camera passes the window: the room is all nearer than the glass, so it is gone by the time the rim leaves the screen. The room
    // grows as one picture round the window's middle (every piece keeps its place: the cord on its lamp, the plant in its pot) and the
    // whole of it fades over the last stretch before the glass, then stops drawing. (The fade used to start only after the glass and ran
    // through the stage's CSS transition, a second behind: the cord and a plant, which hang over the window's middle where the zoom never
    // pushes them off screen, were still there once the view was outside.)
    const pass = Math.max(0, Math.min(1, (e - (ec - .14))/.15));
    stage.style.opacity = String(1 - pass*pass*(3 - 2*pass)); stage.style.visibility = pass >= 1 ? 'hidden' : '';
    const vw_ = document.getElementById('view'); if (vw_) vw_.style.transform = 'scaleX(' + (1 + (CITY_WIDEN - 1)*(1 - e)).toFixed(4) + ')';
    try { const w = Math.exp(-Math.pow((e - ec)/.1, 2)); WARP.k.value = w > .01 ? w : 0; WARP.c.value.set(flightC[0], flightC[1]); } catch (_) {}
    // past the glass: carry on a little into the city and let it settle in the middle of the screen (the game's own easing)
    if (!crossed && e > ec){ crossed = true; try { if (CITY) camGoal.set(CITY.x, TARGET_Y, CITY.z); zoomT = 52; } catch (_) {} }
    if (t >= 1){ finish(); settle(); }
  }
  // Over the city: the camera eases from the title's high look down to the game's own: its usual tilt (PITCH0) and the nearest of its
  // eight headings (0.7 radians plus a multiple of 45 degrees, as Q and E turn it). Any input from the player stops it where it is.
  function settle(){
    try {
      const p0 = PITCH, y0 = yaw, step = Math.PI/4, y1 = .7 + Math.round((y0 - .7)/step)*step, t0 = performance.now(), D = 2600;
      let stop = false; const halt = () => { stop = true; }; const evs = ['pointerdown', 'wheel', 'keydown'];
      for (const ev of evs) addEventListener(ev, halt, { once: true, capture: true });
      (function step_(){
        if (stop || T.on){ for (const ev of evs) removeEventListener(ev, halt, { capture: true }); return; }
        const k = Math.min(1, (performance.now() - t0)/D), e = k*k*(3 - 2*k);
        pitchT = p0 + (PITCH0 - p0)*e; yawT = y0 + (y1 - y0)*e;
        if (k < 1) requestAnimationFrame(step_); else for (const ev of evs) removeEventListener(ev, halt, { capture: true });
      })();
    } catch (e) {}
  }
  function unwiden(){ const v = document.getElementById('view'); if (v){ v.style.transition = 'transform 1.2s ease-in-out'; v.style.transform = ''; setTimeout(() => { v.style.transition = ''; }, 1300); } }
  // the pictures for an hour, fetched ahead (they're cached, so the room shows at once when it's needed)
  function preload(t){ const v = innerWidth/innerHeight < .85 ? 'tall' : 'wide'; for (const k of ['room', 'glass', 'signoff']){ const im = new Image(); im.src = 'assets/title/' + k + '-' + v + '-' + t + '.png?v=' + VER; (preload.keep = preload.keep || []).push(im); } }
  function finish(){ T.leaving = false; try { if (scWas !== null){ SC.mode = scWas; scWas = null; } } catch (e) {} try { WARP.k.value = 0; } catch (e) {} stage.style.opacity = ''; stage.style.scale = ''; stage.style.visibility = ''; unwiden(); document.documentElement.classList.remove('title-boot'); T.on = false; cancelAnimationFrame(raf); root.hidden = true; root.classList.remove('leaving'); document.documentElement.classList.remove('title-on'); restoreScene(); try { LAST_INPUT = performance.now(); } catch (e) {} try { applyRenderRes(zoom); } catch (e) {} }

  /* ---------- the menu ---------- */
  function setDeck(on){
    document.documentElement.classList.toggle('title-deck', on);
    const deck = $t('deck'), tg = $t('deckToggle'); if (deck && tg && deck.classList.contains('open') !== on) tg.click();
  }
  // the settings deck's own Close button closes it here too
  { const tg = $t('deckToggle'); if (tg) tg.addEventListener('click', () => { if (T.on && !$t('deck').classList.contains('open')) document.documentElement.classList.remove('title-deck'); }); }
  menu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'continue'){
      // still loading (the shutter's shut): say so, and go when it has opened
      if (!canEnter()){ if (b.dataset.wait) return; b.dataset.wait = '1';   // (clicked before it's ready: it goes in by itself when it is)
        (function wait(){ if (!T.on){ delete b.dataset.wait; return; } if (canEnter()){ setTimeout(() => { delete b.dataset.wait; T.hide(); }, 300); } else setTimeout(wait, 100); })(); }
      else T.hide(); }
    else if (act === 'new') openPanel(true);
    else if (act === 'cities') openPanel(false);
    else if (act === 'settings'){ const on = !document.documentElement.classList.contains('title-deck'); if (on) closePanel(); setDeck(on); }
  });
  // while the title is up, the city's keys (WASD, zones, delete...) are off; typing in the panels still works
  addEventListener('keydown', e => {
    if (!T.on) return;
    if (e.key === 'Escape'){ if (!panel.hidden) closePanel(); else if (document.documentElement.classList.contains('title-deck')) setDeck(false); e.preventDefault(); }
    const deck = $t('deck'); if (deck && deck.contains(e.target)) return;   // (the settings deck's own keys)
    e.stopImmediatePropagation();
  }, true);
  addEventListener('resize', () => { if (T.on) layout(); });

  /* ---------- the city loading behind the title ---------- */
  // Every load (and opening another city, which loads the page again: slots.js) brings the title up over the city as it builds, seen through
  // the window. The first button says how far the loading has got, and only lets the player in once the plots are all in and the people are
  // out; a city just opened from the Cities list is named on it ("Enter Harbor Row")
  let OPENING = null; try { OPENING = sessionStorage.getItem('neonTerrarium.opening'); sessionStorage.removeItem('neonTerrarium.opening'); } catch (e) {}
  const canEnter = () => { const now = performance.now(); return (OPEN >= 1 || reduced) && (settled(now) || stalled(now)); };   // (the same as the shutter: the city loaded, or a load that has stopped getting anywhere)
  function menuState(){
    // (the percentage: the plots are 95 of it; the people, the plants and the merges the rest)
    if (!T.on) return; const b = menu.querySelector('[data-act="continue"]'); if (!b) return; const sp = b.querySelector('span') || b;
    let txt, busy = !canEnter();
    if (!busy) txt = OPENING ? 'Enter ' + OPENING : 'Continue';
    else { let pct = null; try { if (LOADP.on && LOADP.total) pct = Math.min(99, Math.round(LOADP.placed/LOADP.total*95)); else if (!LOADP.on) pct = 99; } catch (e) {} txt = b.dataset.wait ? 'Entering when ready…' : (OPENING ? 'Loading ' + OPENING : 'Loading city') + (pct !== null ? ' · ' + pct + '%' : '…'); }
    if (sp.textContent !== txt) sp.textContent = txt;
    b.classList.toggle('t-busy', busy); if (busy) b.setAttribute('aria-busy', 'true'); else if (b.hasAttribute('aria-busy')){ b.removeAttribute('aria-busy'); if (OPENING && document.activeElement !== b) b.focus({ preventScroll: true }); }
  }
  setInterval(menuState, 200);

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
    // (the cloud form: only on the dev page, the normal one takes it out (playerui.js), so each piece is looked for first)
    const u = SLOTS.cloudUser, fUser = $t('tUser'), fState = $t('tCloudState'), fBtn = $t('tCloudBtn'), fOut = $t('tSignOut');
    if (fUser) fUser.value = u || ''; if (fState) fState.textContent = u ? (SLOTS.cloudErr || 'Signed in as ' + u + '. Your cities sync every few minutes.') : 'Not signed in. Cities stay in this browser.';
    if (fBtn) fBtn.textContent = u ? 'Sync now' : 'Sign in'; if (fOut) fOut.hidden = !u;
  }
  function openPanel(fresh){
    if (document.documentElement.classList.contains('title-deck')) setDeck(false);
    panel.hidden = false; say('');
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
  if ($t('tCloud')) $t('tCloud').addEventListener('submit', async e => {
    e.preventDefault(); const v = $t('tUser').value;
    try { say('Talking to the save server…'); if (v.trim().toLowerCase() !== SLOTS.cloudUser) await SLOTS.setUser(v); else await SLOTS.sync(); say(SLOTS.cloudUser ? 'Synced.' : ''); render(); }
    catch (err) { say(err.message, true); render(); }
  });
  if ($t('tSignOut')) $t('tSignOut').addEventListener('click', async () => { await SLOTS.setUser(''); say('Signed out. Your cities are still here in this browser.'); render(); });

  // the title comes up on load (saveguard.js decides), over the city as it builds
  if (window.NT_TITLE) T.show(); else root.hidden = true;
  return T;
})();
window.TITLE = TITLE;
