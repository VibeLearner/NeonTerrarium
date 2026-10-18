// Neon Terrarium: the Acoustic Panel's shapes. Each block of the panel draws what its settings do as a piece of geometry,
// so turning a knob shows at once what changed, and every shape also moves with the live broadcast:
//  - the circadian orbit: dots go round once a bar, as many as the footfall cadence cuts it into; the clock rate is
//    how fast; the beat flashes the ring and a ping throws a spark onto it;
//  - the atmosphere coil: canyon resonance loosens and spreads the coil and trails echo loops behind it; smog
//    attenuation dims its upper rings into fog (open, they burn bright to the top);
//  - the carrier polygon: the chord's notes as points round a circle (by pitch, octave outward); carrier output is how
//    bold the shape is, foundation hum the glowing core, hold time how slowly it turns; it morphs when the chord changes;
//  - the dispersion cloud: density is how many grains; Mosaic snaps them to tiles, Haze lets them drift as soft blobs,
//    Glitch-arp bursts them out on the beat; acid-rain static is the speckle and the falling streaks;
//  - the ping field: ping rate is how often the faint ticks along the line come round, trigger depth how big each ping
//    draws; every ping pattern has its own picture (see PINGS), and a ping waiting for the beat gathers in the middle;
//  - the district state, in the middle: all of it at once, the chord's shape ringed by the live spectrum as rays, echo
//    rings from the resonance, the colour warmed or cooled by the smog, a halo of grains, turning with the clock.
// The knobs: every range input of the panel gets a dial over it (grid_panel.js marks them .gk); dragging up or down
// turns it, the wheel nudges it, a double-click puts it back, and the keys still work on the input itself. The dial
// is drawn from the input's value each frame, so when the auto-governor moves a setting the knob moves too.
'use strict';
const GRIDVIZ = (() => {
  const V = {}, $ = id => document.getElementById(id);
  const CY = '#5fd8de', CY2 = '#a6eef0', MG = '#e5379f', YL = '#e8d553', INK = '#d9f6f6', FAINT = '#17414a', DIM = '#4f8c94';
  const num = (id, d) => { const e = $(id); return e ? +e.value : d; };
  const norm = (id, d = .5) => { const e = $(id); if (!e) return d; const lo = +e.min, hi = +e.max; return hi > lo ? (+e.value - lo)/(hi - lo) : d; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const lerp = (a, b, u) => a + (b - a)*u;

  // ---------- canvases: sized to their box, sharp on any screen ----------
  const cvs = {};
  function ctxOf(id){
    const c = $(id); if (!c || c.clientWidth < 20 || c.clientHeight < 20) return null;   // (hidden: the Booth is showing)
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(10, Math.floor(c.clientWidth*dpr)), h = Math.max(10, Math.floor(c.clientHeight*dpr));
    if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = w/dpr, H = h/dpr; g.clearRect(0, 0, W, H);
    return { g, W, H };
  }

  // ---------- what the broadcast is doing: the beat, pings, the chord ----------
  let beat = 0, beatN = 1, lastBeatT = 0;
  const sparks = [];   // { t, kind }: one per ping that played, kind = which pattern (see PINGS)
  // Each ping pattern has its own picture in the ping field, and its colour on the clock and district state:
  //  gutter cascade = drops stepping down and splashing; rivet triplet = three hard bursts punched in a row;
  //  lamp-post chimes = small rings on four lamp heads; twin neon = two tubes flickering on together;
  //  busker riff = a wavering line running across; last train home = a lit train sliding past with its headlight.
  const PINGS = {
    gutter: { style: 'TAPPED', col: CY2, name: 'GUTTER CASCADE' }, rivet: { style: 'HAMMER', col: INK, name: 'RIVET TRIPLET' },
    chime: { style: 'BELLS', col: YL, name: 'LAMP-POST CHIMES' }, twin: { style: 'DOUBLESTOP', col: MG, name: 'TWIN NEON' },
    busker: { style: 'LEAD', col: MG, name: 'BUSKER RIFF' }, train: { style: 'HOMEBOUND', col: CY, name: 'LAST TRAIN HOME' },
    ping: { style: 'MIXED', col: MG, name: "PLANNERS' CHOICE" }
  };
  const kindOfText = x => /GUTTER/.test(x) ? 'gutter' : /RIVET/.test(x) ? 'rivet' : /CHIME|BELL|HARMONIC/.test(x) ? 'chime' : /TWIN/.test(x) ? 'twin' : /BUSKER/.test(x) ? 'busker' : /TRAIN/.test(x) ? 'train' : 'ping';
  const kindOfStyle = st => { for (const k in PINGS) if (PINGS[k].style === st) return k; return 'ping'; };
  const colOf = k => (PINGS[k] || PINGS.ping).col;
  function watch(){
    const badge = $('g-beatCounterBadge');
    if (badge) new MutationObserver(() => { beat = 1; beatN = parseInt(badge.textContent) || 1; lastBeatT = performance.now(); }).observe(badge, { childList: true, characterData: true, subtree: true });
    const led = $('g-motifLed'), st = $('g-motifStatusText');
    if (led) new MutationObserver(() => { if (/cyan/.test(led.className)) sparks.push({ t: performance.now(), kind: kindOfText(st ? st.textContent : '') }); }).observe(led, { attributes: true, attributeFilter: ['class'] });
    // (Fire and Chimes light up through the LED too, when their phrase actually plays)
  }
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const noteOf = n => { const m = /^([A-G])([b#]?)(-?\d+)$/.exec(n || ''); if (!m) return null; return { pc: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, oct: +m[3] }; };
  // the chord's points, eased toward the new chord when it changes
  let polyNow = [], polyKey = '';
  function chordPts(dt){
    const E = music.engine, c = E && E.chord;
    const notes = c && c.notes ? c.notes.map(noteOf).filter(Boolean) : [];
    const key = notes.map(n => n.pc + ':' + n.oct).join(',');
    const target = notes.map(n => ({ a: n.pc/12*Math.PI*2 - Math.PI/2, r: .45 + Math.min(4, Math.max(0, n.oct - 2))*.14 })).sort((p, q) => p.a - q.a);
    if (key !== polyKey){ polyKey = key; while (polyNow.length < target.length) polyNow.push(Object.assign({}, polyNow[polyNow.length - 1] || target[polyNow.length] || { a: 0, r: .5 })); polyNow.length = target.length; }
    const k = Math.min(1, dt*4);
    for (let i = 0; i < target.length; i++){ const p = polyNow[i], q = target[i]; let da = q.a - p.a; if (da > Math.PI) da -= Math.PI*2; if (da < -Math.PI) da += Math.PI*2; p.a += da*k; p.r += (q.r - p.r)*k; }
    return polyNow;
  }
  const loud = bands => { if (!bands) return 0; let s = 0; for (let i = 0; i < bands.length; i++) s += bands[i]; return Math.min(1, s/bands.length*2.2); };

  // ---------- the circadian orbit ----------
  const DOTS = { '1/4': 4, '1/8.': 6, '1/8': 8, '1/8T': 12, '1/16': 16 };
  let orbA = 0;
  function orbit(t, dt, L){
    const o = ctxOf('gvOrbit'); if (!o) return; const { g, W, H } = o, E = music.engine;
    const cx = W/2, cy = H/2, R = Math.min(W, H)/2 - 8, bpm = E ? E.bpm : 82, n = DOTS[E ? E.subdiv : '1/8'] || 8;
    orbA += dt*bpm/60/4*Math.PI*2;   // once round a bar
    g.lineWidth = 4; g.strokeStyle = FAINT; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI*2); g.stroke();
    const u = Math.max(0, Math.min(1, (bpm - 55)/85));
    g.strokeStyle = rgba(CY, .55 + beat*.45); g.beginPath(); g.arc(cx, cy, R, -Math.PI/2, -Math.PI/2 + u*Math.PI*2); g.stroke();
    // the cadence: n dots riding the ring, the one passing the top lit
    for (let i = 0; i < n; i++){
      const a = orbA + i/n*Math.PI*2 - Math.PI/2, x = cx + Math.cos(a)*(R - 11), y = cy + Math.sin(a)*(R - 11);
      const top = Math.cos(a + Math.PI/2) > .97;
      g.fillStyle = top ? YL : i % (n/4 | 0 || 1) === 0 ? CY2 : rgba(CY, .55); g.beginPath(); g.arc(x, y, top ? 3.6 : i % (n/4 | 0 || 1) === 0 ? 2.8 : 2, 0, Math.PI*2); g.fill();
    }
    // the beat: a ring that opens out from the middle, the downbeat in magenta
    if (beat > .02){ g.strokeStyle = rgba(beatN === 1 ? MG : CY, beat*.7); g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, (R - 22)*(1.15 - beat*.35), 0, Math.PI*2); g.stroke(); }
    // pings as sparks thrown off the ring
    const now = performance.now();
    for (const s of sparks){ const age = (now - s.t)/1000; if (age > 1.2) continue; const a = (s.t/37 % 1)*Math.PI*2;
      g.fillStyle = rgba(colOf(s.kind), 1 - age/1.2); g.beginPath(); g.arc(cx + Math.cos(a)*(R + age*10), cy + Math.sin(a)*(R + age*10), 3, 0, Math.PI*2); g.fill(); }
  }

  // ---------- the atmosphere coil ----------
  function coil(t, dt, L){
    const o = ctxOf('gvCoil'); if (!o) return; const { g, W, H } = o;
    const rev = norm('g-spaceReverbSlider', .8), fil = norm('g-warmthFilterSlider', .4);
    const loops = 14, cx = W/2, ry = Math.min(H*.42, W*.3), rx = ry*.38;
    const spread = lerp(.012, .06, rev)*W, x0 = cx - spread*(loops - 1)/2;
    const wob = lerp(.02, .22, rev), lit = Math.round(lerp(3, loops, fil)), breathe = 1 + L*.08;
    // echo loops trailing off to the right, more and fainter as the canyon grows
    const echoes = Math.round(rev*4);
    for (let e = echoes; e >= 0; e--){
      for (let i = 0; i < loops; i++){
        const x = x0 + i*spread + e*spread*1.6, ph = t*1.3 + i*.6, sx = rx*(1 + Math.sin(ph)*wob)*breathe, sy = ry*(1 + Math.cos(ph*.7)*wob*.6)*breathe;
        const bright = i >= loops - lit, col = e ? DIM : bright ? (i % 2 ? YL : MG) : DIM;
        g.strokeStyle = rgba(col, e ? .14/e : bright ? .85 : .35); g.lineWidth = e ? 1 : 1.4;
        g.beginPath(); g.ellipse(x, H/2, sx, sy, Math.sin(t*.4 + i*.2)*wob*.6, 0, Math.PI*2); g.stroke();
      }
    }
    // smog: a haze laid over the upper half when the filter closes
    const fog = (1 - fil)*.5; if (fog > .02){ const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rgba('#0a2530', fog)); gr.addColorStop(.6, rgba('#0a2530', 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    lab(g, W, H, 'LOOSE = RESONANCE', 'BRIGHT RINGS = SMOG OPEN');
  }

  // ---------- the carrier polygon ----------
  let polyRot = 0;
  function poly(t, dt, L, pts){
    const o = ctxOf('gvPoly'); if (!o) return; const { g, W, H } = o;
    const out = norm('g-droneLevelSlider', .8), hum = norm('g-subAnchorSlider', .6), hold = norm('g-chordHoldSlider', .3);
    polyRot += dt*lerp(.5, .05, hold);
    const cx = W/2, cy = H/2, R = Math.min(W, H)/2 - 10;
    // the twelve pitch places, faint
    g.fillStyle = FAINT; for (let i = 0; i < 12; i++){ const a = i/12*Math.PI*2 - Math.PI/2 + polyRot; g.beginPath(); g.arc(cx + Math.cos(a)*R, cy + Math.sin(a)*R, 1.6, 0, Math.PI*2); g.fill(); }
    // the core: the foundation hum, breathing slowly
    const cr = R*lerp(.08, .42, hum)*(1 + Math.sin(t*1.6)*.06 + L*.1);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, cr); gr.addColorStop(0, rgba(MG, .55)); gr.addColorStop(1, rgba(MG, 0)); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI*2); g.fill();
    if (pts.length > 1){
      g.lineJoin = 'round'; g.lineWidth = lerp(1, 4.5, out); g.strokeStyle = rgba(CY, lerp(.45, 1, out)); g.shadowColor = CY; g.shadowBlur = lerp(0, 12, out)*(1 + L);
      g.beginPath(); pts.forEach((p, i) => { const a = p.a + polyRot, r = R*p.r*(1 + L*.06); const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = rgba(CY, .07 + out*.08); g.fill();
      for (const p of pts){ const a = p.a + polyRot, r = R*p.r; g.fillStyle = YL; g.beginPath(); g.arc(cx + Math.cos(a)*r, cy + Math.sin(a)*r, 3, 0, Math.PI*2); g.fill(); }
    }
    lab(g, W, H, 'LINE = OUTPUT · CORE = HUM', 'SPIN = HOLD TIME');
  }

  // ---------- the dispersion cloud ----------
  const grains = Array.from({ length: 220 }, (_, i) => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5)*.04, vy: (Math.random() - .5)*.04, s: Math.random(), b: 0 }));
  let rainT = 0;
  function cloud(t, dt, L){
    const o = ctxOf('gvCloud'); if (!o) return; const { g, W, H } = o, E = music.engine, mode = E ? E.mode : 'MOSAIC';
    const den = norm('g-granularMixSlider', .6), stat = norm('g-lofiTextureSlider', .4), n = Math.round(lerp(8, grains.length, den));
    for (let i = 0; i < n; i++){
      const p = grains[i];
      if (mode === 'ARP'){ if (beat > .95) { p.b = 1; p.vx = (p.x - .5)*.9; p.vy = (p.y - .5)*.9; } p.b *= Math.max(0, 1 - dt*3); p.x += p.vx*dt*p.b; p.y += p.vy*dt*p.b; p.x += (.5 + (p.s - .5)*.3 - p.x)*dt*.6*(1 - p.b); p.y += (.5 + (p.s*7 % 1 - .5)*.3 - p.y)*dt*.6*(1 - p.b); }
      else { p.x += p.vx*dt*(mode === 'HAZE' ? .5 : 1); p.y += p.vy*dt*(mode === 'HAZE' ? .5 : 1); if (p.x < 0 || p.x > 1) p.vx = -p.vx; if (p.y < 0 || p.y > 1) p.vy = -p.vy; }
      const x = Math.max(0, Math.min(1, p.x))*W, y = Math.max(0, Math.min(1, p.y))*H;
      if (mode === 'MOSAIC'){ const c = 9, X = Math.floor(x/c)*c, Y = Math.floor(y/c)*c, on = (Math.sin(t*3 + i) + 1)/2; g.fillStyle = rgba(i % 5 ? CY : YL, .25 + on*.55*(.6 + L)); g.fillRect(X + 1, Y + 1, c - 2, c - 2); }
      else if (mode === 'HAZE'){ const r = 6 + p.s*14; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(i % 4 ? CY : MG, .22 + L*.2)); gr.addColorStop(1, rgba(CY, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r*2, r*2); }
      else { g.fillStyle = rgba(i % 3 ? MG : CY2, .5 + p.b*.5); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
    }
    // the static: speckle and a few streaks of rain falling through
    const sp = Math.round(stat*140); g.fillStyle = rgba(INK, .35); for (let i = 0; i < sp; i++) g.fillRect(Math.random()*W, Math.random()*H, 1, 1);
    rainT += dt; const streaks = Math.round(stat*18); g.strokeStyle = rgba(CY2, .25); g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < streaks; i++){ const x = (i*97.3 % 1)*W + (i*13 % 7), y = ((rainT*(.6 + (i*.37 % .5)) + i*.13) % 1)*H*1.2 - 10; g.moveTo(x, y); g.lineTo(x - 2, y + 9); }
    g.stroke();
    lab(g, W, H, 'GRAINS = DENSITY', 'SPECKLE + RAIN = STATIC');
  }

  // ---------- the ping field ----------
  let pendT = null;
  function drawPing(g, W, H, mid, R, s, u){
    const k = s.kind, c = colOf(k), fade = 1 - u, seed = (s.t*.37) % 1;
    if (k === 'gutter'){   // five drops stepping down a staircase of gutters, a ripple where each lands
      for (let i = 0; i < 5; i++){
        const d = u*2.2 - i*.22; if (d < 0) continue; const x = W*(.18 + i*.16), y0 = mid - R*.9 + i*R*.28;
        const fall = Math.min(1, d*2), y = y0 + fall*R*.35;
        g.strokeStyle = rgba(c, .35*fade); g.lineWidth = 1; g.beginPath(); g.moveTo(x - 12, y0 + R*.35); g.lineTo(x + 12, y0 + R*.35); g.stroke();
        if (fall < 1){ g.fillStyle = rgba(c, fade); g.beginPath(); g.ellipse(x, y, 2.2, 4, 0, 0, Math.PI*2); g.fill(); }
        else { const rp = Math.min(1, (d - .5)*1.6); g.strokeStyle = rgba(c, (1 - rp)*fade); g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, 4 + rp*14, 1.5 + rp*4, 0, 0, Math.PI*2); g.stroke(); }
      }
    } else if (k === 'rivet'){   // three hard bursts punched left to right, quick
      for (let i = 0; i < 3; i++){
        const d = u*3 - i*.35; if (d < 0 || d > 1.4) continue; const x = W*(.3 + i*.2), a = Math.max(0, 1 - d/1.4), r = R*.18 + d*R*.35;
        g.strokeStyle = rgba(c, a); g.lineWidth = 2;
        g.beginPath(); for (let q = 0; q < 8; q++){ const an = q*Math.PI/4 + .4; g.moveTo(x + Math.cos(an)*r*.35, mid + Math.sin(an)*r*.35); g.lineTo(x + Math.cos(an)*r, mid + Math.sin(an)*r); } g.stroke();
        g.fillStyle = rgba(c, a); g.fillRect(x - 3, mid - 3, 6, 6);
      }
    } else if (k === 'chime'){   // small rings on four lamp heads
      for (let q = 0; q < 4; q++){
        const x = W*(.2 + q*.2), y = mid - R*.25 - Math.sin(q*1.7 + 1)*R*.25, d = Math.max(0, u*1.4 - q*.1);
        g.strokeStyle = rgba(c, .3*fade); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x, H - 18); g.stroke();
        g.fillStyle = rgba(c, fade); g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI*2); g.fill();
        for (let m = 0; m < 2; m++){ const rr = R*.35*Math.max(0, d - m*.25); if (rr <= 0) continue; g.strokeStyle = rgba(c, fade*(1 - m*.4)); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, rr, 0, Math.PI*2); g.stroke(); }
      }
    } else if (k === 'twin'){   // two neon tubes flicker on together, magenta and cyan, then fade
      const on = u < .15 ? (Math.sin(u*180) > 0 ? 1 : .2) : fade, len = W*.55;
      [[MG, -R*.28], [CY, R*.28]].forEach(([cc, dy]) => {
        g.strokeStyle = rgba(cc, on); g.lineWidth = 5; g.lineCap = 'round'; g.shadowColor = cc; g.shadowBlur = 12*on;
        g.beginPath(); g.moveTo(W/2 - len/2, mid + dy); g.lineTo(W/2 + len/2, mid + dy); g.stroke(); g.shadowBlur = 0; g.lineCap = 'butt';
      });
    } else if (k === 'busker'){   // a wavering line runs across, like a riff on a street corner
      const head = u*1.3*W; g.strokeStyle = rgba(c, fade); g.lineWidth = 2; g.beginPath();
      for (let x = Math.max(0, head - W*.6); x <= Math.min(W, head); x += 3){ const y = mid + Math.sin(x*.07 + seed*9)*R*.35*Math.sin(x*.013 + 1); x === Math.max(0, head - W*.6) ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke(); if (head < W){ g.fillStyle = rgba(c, fade); g.beginPath(); g.arc(head, mid + Math.sin(head*.07 + seed*9)*R*.35*Math.sin(head*.013 + 1), 3, 0, Math.PI*2); g.fill(); }
    } else if (k === 'train'){   // a lit train slides past, left to right, headlight first
      const x0 = W*.1 + u*W*1.3, cars = 4, cw = W*.12, ch = R*.35;
      for (let i = 0; i < cars; i++){
        const x = x0 - i*(cw + 4); g.strokeStyle = rgba(c, .85); g.lineWidth = 1.5; g.strokeRect(x - cw, mid - ch/2, cw, ch);
        for (let w = 0; w < 3; w++){ g.fillStyle = rgba(YL, .55 + .3*Math.sin(i*2 + w)); g.fillRect(x - cw + 4 + w*cw/3, mid - ch/2 + 4, cw/3 - 6, ch*.35); }
      }
      const grd = g.createRadialGradient(x0 + 4, mid, 0, x0 + 4, mid, R*.6); grd.addColorStop(0, rgba(YL, .7)); grd.addColorStop(1, rgba(YL, 0));
      g.fillStyle = grd; g.beginPath(); g.arc(x0 + 4, mid, R*.6, 0, Math.PI*2); g.fill();
    } else {   // planners' choice before it's known: plain magenta rings
      const x = W*.5 + (seed - .5)*W*.5;
      for (let q = 0; q < 3; q++){ const rr = R*Math.min(1, u*1.6 - q*.2); if (rr <= 0) continue; g.strokeStyle = rgba(c, fade*(1 - q*.25)); g.lineWidth = 2 - q*.5; g.beginPath(); g.arc(x, mid, rr, 0, Math.PI*2); g.stroke(); }
    }
  }
  function pingField(t, dt, L){
    const o = ctxOf('gvPing'); if (!o) return; const { g, W, H } = o;
    const rate = norm('g-motifSparsitySlider', .45), depth = norm('g-motifLevelSlider', .7), mid = H/2;
    g.strokeStyle = FAINT; g.lineWidth = 1; g.beginPath(); g.moveTo(0, mid + .5); g.lineTo(W, mid + .5); g.stroke();
    // the expected ticks: closer together the higher the rate, sliding along
    const gap = lerp(70, 12, rate), off = (t*30) % gap;
    g.fillStyle = rgba(MG, .55); for (let x = -off; x < W; x += gap) g.fillRect(x, mid - 3, 2, 6);
    const now = performance.now(), R = Math.min(H*.45, W*.3)*lerp(.35, 1, depth);
    for (const s of sparks){ const age = (now - s.t)/1000; if (age > 1.8) continue; drawPing(g, W, H, mid, R, s, age/1.8); }
    // a ping waiting for the beat: its colour gathers in the middle as a dashed ring closing in, with an arc filling
    // up to the beat it will land on and its name beside it
    const E = music.engine, pend = E && E.pendingPing;
    if (pend){
      if (!pendT || pendT.style !== pend) pendT = { style: pend, t: now };
      const k = kindOfStyle(pend), c = colOf(k), beatMs = 60000/((E && E.bpm) || 82);
      const into = lastBeatT ? ((now - lastBeatT) % beatMs)/beatMs : ((now - pendT.t) % beatMs)/beatMs;
      const cx = W/2, rr = R*(1.25 - .6*into);
      g.save(); g.setLineDash([4, 5]); g.lineDashOffset = -t*30; g.strokeStyle = rgba(c, .5 + .4*into); g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, mid, rr, 0, Math.PI*2); g.stroke(); g.restore();
      g.strokeStyle = rgba(c, .95); g.lineWidth = 3; g.beginPath(); g.arc(cx, mid, R*.38, -Math.PI/2, -Math.PI/2 + into*Math.PI*2); g.stroke();
      g.fillStyle = rgba(c, .35 + .5*into); g.beginPath(); g.arc(cx, mid, 3 + 3*into, 0, Math.PI*2); g.fill();
      g.font = '10.5px "JetBrains Mono", monospace'; g.textBaseline = 'middle'; const txt = (PINGS[k] || PINGS.ping).name + ' · ON THE BEAT';
      const tw = g.measureText(txt).width; g.fillStyle = 'rgba(3,12,16,.82)'; g.fillRect(cx - tw/2 - 3, 4, tw + 6, 14); g.fillStyle = rgba(c, 1); g.fillText(txt, cx - tw/2, 11);
    } else pendT = null;
    lab(g, W, H, 'TICKS = PING RATE', 'SIZE = DEPTH');
  }

  // ---------- the district state ----------
  let stRot = 0;
  function state(t, dt, L, pts, bands){
    const o = ctxOf('gvState'); if (!o) return; const { g, W, H } = o, E = music.engine;
    const bpm = E ? E.bpm : 82, rev = norm('g-spaceReverbSlider', .8), fil = norm('g-warmthFilterSlider', .4), den = norm('g-granularMixSlider', .6), out = norm('g-droneLevelSlider', .8);
    stRot += dt*bpm/60*.08;
    const cx = W/2, cy = H/2, R = Math.min(W, H)/2 - 14;
    // echo rings: the canyon resonance
    const rings = 2 + Math.round(rev*6);
    for (let i = 0; i < rings; i++){ const rr = R*(.35 + i/rings*.62) + Math.sin(t*.8 + i)*rev*4; g.strokeStyle = rgba(i % 2 ? CY : DIM, .1 + (1 - i/rings)*.25); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI*2); g.stroke(); }
    // rays: the live spectrum all the way round, coloured by the smog (open: hot magenta and yellow; closed: cool cyan)
    if (bands){
      const n = bands.length, warm = fil;
      for (let i = 0; i < n*2; i++){
        const k = i < n ? i : n*2 - 1 - i, v = Math.min(1.2, bands[k]), a = i/(n*2)*Math.PI*2 + stRot;
        const r0 = R*.42, r1 = r0 + R*.5*v + 2;
        g.strokeStyle = rgba(k > n*(1 - warm*.8) ? (k % 2 ? YL : MG) : CY, .35 + v*.6); g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx + Math.cos(a)*r0, cy + Math.sin(a)*r0); g.lineTo(cx + Math.cos(a)*r1, cy + Math.sin(a)*r1); g.stroke();
      }
    }
    // the chord's shape in the middle
    if (pts.length > 1){ g.lineWidth = 1.5 + out*2; g.strokeStyle = rgba(INK, .8); g.shadowColor = CY; g.shadowBlur = 10*(.4 + L);
      g.beginPath(); pts.forEach((p, i) => { const a = p.a - stRot*.5, r = R*.36*p.r*(1 + beat*.08); const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); g.shadowBlur = 0; }
    // a halo of grains: the dispersion
    const hn = Math.round(den*90);
    for (let i = 0; i < hn; i++){ const a = i*2.399 + t*.15*(i % 2 ? 1 : -1), r = R*(.88 + Math.sin(t + i)*.06); g.fillStyle = rgba(i % 6 ? CY2 : MG, .35 + L*.5); g.fillRect(cx + Math.cos(a)*r - 1, cy + Math.sin(a)*r - 1, 2, 2); }
    // the beat: the whole state flashes outward
    if (beat > .02){ g.strokeStyle = rgba(beatN === 1 ? MG : CY, beat*.5); g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R*(1.02 - beat*.12), 0, Math.PI*2); g.stroke(); }
    // pings: sparks off the rim
    const now = performance.now();
    for (const s of sparks){ const age = (now - s.t)/1000; if (age > 1.4) continue; const a = (s.t*.0137 % 1)*Math.PI*2, r = R*(.9 + age*.15);
      g.fillStyle = rgba(colOf(s.kind), 1 - age/1.4); g.beginPath(); g.arc(cx + Math.cos(a)*r, cy + Math.sin(a)*r, 3.5, 0, Math.PI*2); g.fill(); }
  }
  // a block's key, in its corners: what to look for in the shape
  function lab(g, W, H, a, b){
    g.font = '10.5px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    const tag = (txt, x, y) => { const w = g.measureText(txt).width; g.fillStyle = 'rgba(3,12,16,.82)'; g.fillRect(x - 3, y - 7, w + 6, 14); g.fillStyle = rgba(DIM, 1); g.fillText(txt, x, y); return w; };
    const wa = g.measureText(a).width, wb = g.measureText(b).width;
    tag(a, 6, H - 10);
    if (wa + wb + 24 < W) tag(b, W - wb - 6, H - 10); else tag(b, W - wb - 6, 10);   // no room side by side: the second goes up top
  }

  // ---------- the knobs ----------
  const ARC = 270, A0 = 135;   // degrees: the dial sweeps 270 from lower left to lower right
  const polar = (cx, cy, r, deg) => { const a = deg*Math.PI/180; return [cx + Math.cos(a)*r, cy + Math.sin(a)*r]; };
  const arcPath = (cx, cy, r, d0, d1) => { const [x0, y0] = polar(cx, cy, r, d0), [x1, y1] = polar(cx, cy, r, d1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const knobs = [];
  function setVal(r, v){ const st = +r.step || 1, lo = +r.min, hi = +r.max; v = Math.min(hi, Math.max(lo, Math.round((v - lo)/st)*st + lo));
    if (+r.value === v) return; r.value = String(+v.toFixed(4)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }
  function makeKnobs(root){
    root.querySelectorAll('.gk').forEach(k => {
      const r = k.querySelector('input[type=range]'), svg = k.querySelector('svg'); if (!r || !svg) return;
      svg.innerHTML = `<path class="kt" d="${arcPath(24, 24, 19, A0, A0 + ARC)}"/><path class="kv" d=""/><line class="kp" x1="24" y1="24" x2="24" y2="8"/><circle class="kc" cx="24" cy="24" r="12"/>`;
      const K = { r, kv: svg.querySelector('.kv'), kp: svg.querySelector('.kp'), last: null }; knobs.push(K);
      // drag up or down on the dial (150 px is the whole sweep; Shift for fine)
      let drag = null;
      svg.addEventListener('pointerdown', e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); drag = { y: e.clientY, v: +r.value }; k.classList.add('drag'); r.focus({ preventScroll: true }); });
      svg.addEventListener('pointermove', e => { if (!drag) return; const span = +r.max - +r.min, d = (drag.y - e.clientY)/(e.shiftKey ? 600 : 150)*span; setVal(r, drag.v + d); });
      const end = () => { drag = null; k.classList.remove('drag'); };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    });
  }
  const OWN_VAL = { 'g-warmthFilterSlider': v => (v/1000).toFixed(1) + 'kHz', 'g-spaceReverbSlider': v => Math.round(v*100) + '%' };
  function drawKnobs(){
    for (const K of knobs){
      const v = +K.r.value; if (v === K.last) continue; K.last = v;
      const u = (+K.r.max > +K.r.min) ? (v - +K.r.min)/(+K.r.max - +K.r.min) : 0, d = A0 + u*ARC;
      K.kv.setAttribute('d', u > .002 ? arcPath(24, 24, 19, A0, d) : '');
      const [x, y] = polar(24, 24, 11, d); K.kp.setAttribute('x2', x.toFixed(2)); K.kp.setAttribute('y2', y.toFixed(2));
      const f = OWN_VAL[K.r.id], o = f && $(K.r.id.replace(/Slider$/, 'Val')); if (o) o.textContent = f(v);   // the two the engine only shows as a pair
    }
  }

  V.init = root => { makeKnobs(root); watch(); };
  V.draw = (t, dt, bands, level) => {
    if (!GRIDPANEL.open) return;
    beat = Math.max(0, beat - dt*3.2);
    const L = Math.max(loud(bands), 0)*Math.min(1, level*1.5 + .2), pts = chordPts(dt);
    while (sparks.length && performance.now() - sparks[0].t > 2000) sparks.shift();
    drawKnobs();
    orbit(t, dt, L); coil(t, dt, L); poly(t, dt, L, pts); cloud(t, dt, L); pingField(t, dt, L); state(t, dt, L, pts, bands);
  };
  return V;
})();
if (typeof GRIDPANEL !== 'undefined' && GRIDPANEL.el) GRIDVIZ.init(GRIDPANEL.el);
