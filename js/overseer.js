// Neon Terrarium: the High Overseer. Double-click the Data Spire and the city glitches, a curtain of falling glyphs closes
// over it, and the Overseer's desk boots up: a cinematic terminal after the "Overturn" desk of uispace (near black, grey
// haze, sodium amber, hairline panels): streams of data, a log typing itself out, an isometric plan of the city's sectors
// turning over one by one, tier gauges, a signal trace, a countdown; and in the middle the question, whether to remember.
// Yes: the television switches off, and the coast comes on (coast.html). No: the desk glitches away, back to the city.
// While the desk covers the screen the city stops drawing (OVERSEER.hold; see main.js).
'use strict';
const OVERSEER = (() => {
  const O = { open: false, hold: false };
  const css = `
  #ovs { position: fixed; inset: 0; z-index: 60; color: #b9c8c0; font: 11px/1.35 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .04em;
    background: radial-gradient(120% 90% at 50% 45%, #07110d 0%, #030806 55%, #010302 100%); overflow: hidden; user-select: none; }
  #ovs * { box-sizing: border-box; }
  #ovs .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(150,180,165,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(150,180,165,.05) 1px, transparent 1px);
    background-size: 32px 32px; mask-image: radial-gradient(90% 80% at 50% 50%, #000 40%, transparent 100%); }
  #ovs .scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; z-index: 9; }
  #ovs .sweep { position: absolute; left: 0; right: 0; height: 22%; top: -25%; pointer-events: none; z-index: 9; background: linear-gradient(180deg, transparent, rgba(255,181,71,.035), transparent); animation: ovsSweep 7s linear infinite; }
  @keyframes ovsSweep { to { top: 110%; } }
  #ovs .haze { position: absolute; inset: 0; pointer-events: none; z-index: 8; background: radial-gradient(70% 55% at 50% 50%, transparent 55%, rgba(0,0,0,.65) 100%); }
  #ovs .bar { position: absolute; left: 18px; right: 18px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: #7f9088; font-size: 10px; letter-spacing: .22em; }
  #ovs .bar.top { top: 12px; } #ovs .bar.bot { bottom: 10px; }
  #ovs .bar b { color: #d8e2dc; font-weight: 600; } #ovs .amb { color: #ffb547; } #ovs .red { color: #ff5a3c; } #ovs .dim { color: #55635c; }
  #ovs .blink { animation: ovsBlink 1s steps(2) infinite; } @keyframes ovsBlink { 50% { opacity: .2; } }
  #ovs .panel { position: absolute; border: 1px solid rgba(170,195,182,.18); background: rgba(6,14,11,.55); padding: 22px 12px 10px; }
  #ovs .panel::before, #ovs .panel::after { content: ''; position: absolute; width: 10px; height: 10px; border: 1px solid #ffb547; opacity: .8; }
  #ovs .panel::before { left: -1px; top: -1px; border-right: 0; border-bottom: 0; } #ovs .panel::after { right: -1px; bottom: -1px; border-left: 0; border-top: 0; }
  #ovs .panel h6 { position: absolute; top: 6px; left: 12px; right: 12px; margin: 0; font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: .3em; color: #8fa198; display: flex; justify-content: space-between; }
  #ovs .panel h6 span:last-child { color: #55635c; }
  #ovs canvas { display: block; width: 100%; height: 100%; }
  #ovs .left { left: 18px; top: 42px; bottom: 40px; width: 25%; min-width: 230px; display: flex; flex-direction: column; gap: 12px; padding: 0; border: 0; background: none; }
  #ovs .left::before, #ovs .left::after { display: none; }
  #ovs .left .panel { position: relative; flex: 1; }
  #ovs .log { white-space: pre; overflow: hidden; color: #a9b8b0; font-size: 10.5px; }
  #ovs .log .ok { color: #8fe0b0; } #ovs .log .warn { color: #ffb547; }
  #ovs .right { right: 18px; top: 42px; bottom: 40px; width: 22%; min-width: 210px; display: flex; flex-direction: column; gap: 12px; padding: 0; border: 0; background: none; }
  #ovs .right::before, #ovs .right::after { display: none; }
  #ovs .right .panel { position: relative; }
  #ovs .gauges { display: flex; gap: 12px; height: 132px; align-items: flex-end; padding-top: 6px; }
  #ovs .gauge { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; }
  #ovs .gauge .track { position: relative; flex: 1; width: 14px; border: 1px solid rgba(170,195,182,.25); background: repeating-linear-gradient(0deg, rgba(170,195,182,.12) 0 1px, transparent 1px 6px); }
  #ovs .gauge .fill { position: absolute; left: 1px; right: 1px; bottom: 1px; background: linear-gradient(0deg, #ffb547, #ffd38a); box-shadow: 0 0 10px rgba(255,181,71,.5); transition: height .5s steps(6); }
  #ovs .gauge small { font-size: 9px; color: #7f9088; letter-spacing: .15em; }
  #ovs .readout { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; font-size: 10px; }
  #ovs .readout span:nth-child(even) { color: #d8e2dc; text-align: right; }
  #ovs .countdown { font: 28px/1 'Silkscreen', monospace; color: #ffb547; letter-spacing: .08em; text-shadow: 0 0 14px rgba(255,181,71,.45); }
  #ovs .lever { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 9px; letter-spacing: .25em; }
  #ovs .lever i { width: 46px; height: 14px; border: 1px solid rgba(255,90,60,.6); position: relative; }
  #ovs .lever i::after { content: ''; position: absolute; top: 2px; bottom: 2px; width: 18px; right: 2px; background: #ff5a3c; box-shadow: 0 0 10px #ff5a3c; animation: ovsBlink 1.6s steps(2) infinite; }
  #ovs .center { position: absolute; left: calc(25% + 48px); right: calc(22% + 48px); top: 42px; bottom: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
  #ovs .plan { position: relative; width: 100%; flex: 1; min-height: 160px; }
  #ovs .ask { position: relative; width: min(560px, 100%); padding: 26px 30px 24px; border: 1px solid rgba(255,181,71,.55); background: rgba(10,8,3,.72);
    box-shadow: 0 0 0 4px rgba(2,5,4,.9), 0 0 0 5px rgba(255,181,71,.18), 0 0 60px rgba(255,181,71,.08) inset; text-align: center; }
  #ovs .ask .tag { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); padding: 0 12px; background: #050b08; color: #ffcf7a; font-size: 10px; line-height: 12px; letter-spacing: .4em; z-index: 1; white-space: nowrap; }
  #ovs .ask h1 { margin: 0 0 6px; font: 400 30px/1.05 'Silkscreen', monospace; letter-spacing: .12em; color: #f1ead8; text-shadow: 2px 0 rgba(255,60,60,.35), -2px 0 rgba(60,255,230,.3), 0 0 22px rgba(255,181,71,.35); }
  #ovs .ask h1.glitch { animation: ovsGl 2.8s infinite; }
  @keyframes ovsGl { 0%, 91%, 100% { transform: none; clip-path: none; } 92% { transform: translate(-3px, 1px); clip-path: inset(10% 0 55% 0); } 94% { transform: translate(3px, -1px); clip-path: inset(50% 0 12% 0); } 96% { transform: translate(-1px, 0); clip-path: inset(30% 0 30% 0); } }
  #ovs .ask .sub { color: #7f9088; font-size: 9.5px; letter-spacing: .35em; margin-bottom: 18px; }
  #ovs .ask p { margin: 0 auto 22px; max-width: 420px; color: #cfd9d3; font-size: 13px; line-height: 1.6; min-height: 3.2em; }
  #ovs .ask p .cur { display: inline-block; width: .6em; height: 1em; background: #ffb547; vertical-align: -2px; animation: ovsBlink .8s steps(2) infinite; }
  #ovs .btns { display: flex; justify-content: center; gap: 22px; }
  #ovs .btn { position: relative; min-width: 140px; padding: 11px 18px; border: 1px solid rgba(255,181,71,.7); background: transparent; color: #ffb547; font: 600 13px/1 'JetBrains Mono', monospace; letter-spacing: .45em;
    cursor: pointer; text-indent: .45em; transition: background .12s steps(2), color .12s steps(2); }
  #ovs .btn.no { border-color: rgba(185,200,192,.45); color: #b9c8c0; }
  #ovs .btn:hover, #ovs .btn:focus-visible { background: #ffb547; color: #0a0703; outline: none; animation: ovsJit .25s steps(2) infinite; }
  #ovs .btn.no:hover, #ovs .btn.no:focus-visible { background: #b9c8c0; color: #030806; }
  #ovs .btn small { position: absolute; bottom: -16px; left: 0; right: 0; text-indent: 0; font-size: 8.5px; letter-spacing: .3em; color: #55635c; }
  @keyframes ovsJit { 50% { transform: translate(1px, -1px); } }
  #ovs .ticker { overflow: hidden; white-space: nowrap; flex: 1; mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
  #ovs .ticker span { display: inline-block; padding-left: 100%; animation: ovsTick 38s linear infinite; }
  @keyframes ovsTick { to { transform: translateX(-100%); } }
  /* booting: frames draw in, text types; leaving: it all jitters and drops away */
  #ovs .boot { animation: ovsIn .55s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes ovsIn { 0% { clip-path: inset(50% 50% 50% 50%); opacity: 0; } 60% { clip-path: inset(0 48% 0 48%); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 1; } }
  #ovs.leave { animation: ovsOut .5s steps(6) forwards; }
  @keyframes ovsOut { 0% { filter: none; } 30% { filter: hue-rotate(90deg) contrast(2); transform: translateX(-8px) skewX(-6deg); } 60% { clip-path: inset(40% 0 35% 0); transform: translateX(10px); } 100% { clip-path: inset(50% 0 50% 0); opacity: 0; } }
  /* the city, glitching before the curtain */
  canvas.ovs-glitch { animation: ovsCity .7s steps(8) both; }
  @keyframes ovsCity { 0% { filter: none; transform: none; } 20% { filter: saturate(2.2) contrast(1.4) hue-rotate(25deg) drop-shadow(4px 0 0 rgba(255,0,70,.6)); transform: translate(-6px, 0); }
    45% { filter: invert(.15) saturate(2.6) hue-rotate(-40deg) drop-shadow(-5px 0 0 rgba(0,255,220,.6)); transform: translate(7px, 2px) skewX(3deg); }
    70% { filter: contrast(2.2) brightness(1.4) hue-rotate(80deg); transform: translate(-3px, -2px); } 100% { filter: brightness(.5) contrast(1.6); transform: none; } }
  #ovsCurtain { position: fixed; inset: 0; z-index: 59; pointer-events: none; }
  #ovsBars { position: fixed; inset: 0; z-index: 58; pointer-events: none; mix-blend-mode: screen;
    background: repeating-linear-gradient(0deg, rgba(255,181,71,.0) 0 18px, rgba(255,181,71,.14) 18px 20px, rgba(0,255,220,.0) 20px 46px, rgba(120,255,230,.1) 46px 47px); animation: ovsBarsMove .7s linear both; }
  @keyframes ovsBarsMove { from { background-position: 0 0; opacity: 0; } 20% { opacity: 1; } to { background-position: 0 220px; opacity: .8; } }
  `;
  let built = false, root = null, raf = 0, last = 0, keyH = null, typingT = 0;
  const HEX = '0123456789ABCDEF', GLY = 'アイウエオカキクケコサシスセソ01#%&*+=<>/\\[]{}';
  const $ = (q) => root.querySelector(q);
  const fmt = n => n.toLocaleString('en-US');
  const cityStats = () => ({ plots: typeof cells !== 'undefined' ? cells.size : 0, pop: typeof pplList !== 'undefined' ? pplList.length : 0,
    mega: typeof megas !== 'undefined' ? megas.size : 0, hour: typeof S !== 'undefined' ? S.hour : 12 });
  function build(){
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    built = true;
  }
  function dom(){
    const s = cityStats(), hh = String(Math.floor(s.hour)).padStart(2, '0') + ':' + String(Math.floor((s.hour % 1)*60)).padStart(2, '0');
    root = document.createElement('div'); root.id = 'ovs'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'High Overseer');
    root.innerHTML = `
      <div class="grid"></div>
      <div class="bar top boot"><span>NEON TERRARIUM <span class="dim">/</span> OVERSEER <span class="dim">/</span> <b>CH.07</b></span>
        <span class="amb">HIGH OVERSEER DESK</span><span><span class="dim">LOCAL</span> <b class="clk">${hh}</b> &nbsp; <span class="amb blink">●</span> SYNC</span></div>
      <div class="panel left boot">
        <div class="panel"><h6><span>DATA STREAMS</span><span>RX 12 / TX 4</span></h6><canvas class="streams"></canvas></div>
        <div class="panel" style="flex:.85"><h6><span>SESSION LOG</span><span class="blink">REC</span></h6><div class="log"></div></div>
      </div>
      <div class="center">
        <div class="plan panel boot"><h6><span>SECTOR PLAN // ${fmt(s.plots)} PLOTS</span><span class="planlbl">TURNING S-00</span></h6><canvas class="iso"></canvas></div>
        <div class="ask boot"><span class="tag">ARCHIVE REQUEST</span>
          <h1 class="glitch">HIGH OVERSEER</h1>
          <div class="sub">MEMORY ARCHIVE // COASTAL SECTOR // FRAGMENT 03</div>
          <p class="say"></p>
          <div class="btns"><button class="btn yes" type="button">YES<small>[ Y ]</small></button><button class="btn no" type="button">NO<small>[ N / ESC ]</small></button></div>
        </div>
      </div>
      <div class="panel right boot">
        <div class="panel"><h6><span>TIER LOAD</span><span>4 TIERS</span></h6>
          <div class="gauges">${[1, 2, 3, 4].map(k => `<div class="gauge"><div class="track"><div class="fill" style="height:${30 + k*12}%"></div></div><small>T${k}</small></div>`).join('')}</div></div>
        <div class="panel" style="height:110px"><h6><span>SIGNAL</span><span class="sig">-71 dB</span></h6><canvas class="wave"></canvas></div>
        <div class="panel"><h6><span>ARCHIVE WINDOW</span><span>HOLD ARMED</span></h6>
          <div class="countdown">06:40</div>
          <div class="lever"><i></i><span class="red">HOLD 90 S</span></div>
          <div class="readout" style="margin-top:10px"><span>PLOTS</span><span>${fmt(s.plots)}</span><span>CITIZENS</span><span>${fmt(s.pop)}</span><span>STRUCTURES</span><span>${s.mega}</span><span>FRAGMENT</span><span class="amb">COAST.MEM</span><span>INTEGRITY</span><span class="integ">63%</span></div></div>
      </div>
      <div class="bar bot boot"><span class="dim">SCENE 52</span><div class="ticker"><span>ARCHIVE COASTAL SECTOR · LAST SEEN BEFORE THE LIFT · ${fmt(s.pop)} CITIZENS ON THE SKY PLATFORM · ${s.mega} STRUCTURES STANDING · TIDE TABLE MISSING · MEMORY FRAGMENT 03 RECOVERED, PARTIAL · REQUEST AWAITS THE OVERSEER · DO NOT LEAVE THE DESK UNATTENDED ·</span></div><span>OVERTURN <span class="amb">▮▮▮▮▯</span></span></div>
      <div class="sweep"></div><div class="scan"></div><div class="haze"></div>`;
    document.body.appendChild(root);
    // the panels draw in one after another
    root.querySelectorAll('.boot').forEach((el, k) => { el.style.animationDelay = (.08*k) + 's'; });
    $('.yes').addEventListener('click', yes); $('.no').addEventListener('click', no);
    // the log and the question type themselves out
    const lines = [['> handshake sky.platform', 'ok'], ['> plots ' + fmt(s.plots) + '  citizens ' + fmt(s.pop) + '  structures ' + s.mega, ''], ['> mount /archive/coast.mem', 'ok'],
      ['> fragment 03 .......... partial', 'warn'], ['> integrity 63% / tide table: missing', 'warn'], ['> route via data spire uplink', 'ok'], ['> awaiting overseer', '']];
    const log = $('.log'); let li = 0, ci = 0, txt = '';
    const say = $('.say'), Q = 'A record of the coast survives in the archive. It is incomplete. Would you like to remember?';
    let qi = 0;
    const tick = () => {
      if (!O.open) return;
      if (li < lines.length){ const [L, k] = lines[li]; ci = Math.min(L.length, ci + 3);
        log.innerHTML = txt + L.slice(0, ci) + (ci >= L.length && k ? '  <span class="' + k + '">' + (k === 'ok' ? '[OK]' : '[!!]') + '</span>' : '') + '<span class="blink">_</span>';
        if (ci >= L.length){ txt += L + (k ? '  <span class="' + k + '">' + (k === 'ok' ? '[OK]' : '[!!]') + '</span>' : '') + '\n'; li++; ci = 0; } }
      else if (qi < Q.length){ qi = Math.min(Q.length, qi + 2); say.innerHTML = Q.slice(0, qi) + '<span class="cur"></span>'; }
      typingT = setTimeout(tick, li < lines.length ? 28 : 22);
    };
    typingT = setTimeout(tick, 650);
  }
  /* ---------- the live canvases: data streams, the sector plan turning, the signal trace (30 frames a second while open) ---------- */
  let cv = {}, streams = [], tiles = [], flip = { k: -1, t: 0 }, cd = 400;
  function sizeCanvas(c){ const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.max(1, Math.round(r.width*dpr)); c.height = Math.max(1, Math.round(r.height*dpr)); return c.getContext('2d'); }
  function setupCanvases(){
    cv.s = $('.streams'); cv.i = $('.iso'); cv.w = $('.wave');
    cv.sg = sizeCanvas(cv.s); cv.ig = sizeCanvas(cv.i); cv.wg = sizeCanvas(cv.w);
    const cols = Math.floor(cv.s.width/(13*Math.min(2, devicePixelRatio || 1)));
    streams = Array.from({ length: cols }, (_, k) => ({ y: Math.random()*40, v: .2 + Math.random()*.9, hot: Math.random() < .2, chars: Array.from({ length: 64 }, () => HEX[Math.random()*16 | 0]) }));
    tiles = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) tiles.push({ i, j, f: 0, lit: 0 });
  }
  function drawStreams(t){
    const g = cv.sg, W = cv.s.width, H = cv.s.height, dpr = Math.min(2, devicePixelRatio || 1), fs = 11*dpr, cw = 13*dpr;
    g.fillStyle = 'rgba(3,8,6,.9)'; g.fillRect(0, 0, W, H); g.font = fs + 'px JetBrains Mono, monospace'; g.textBaseline = 'top';
    const rows = Math.ceil(H/fs) + 1;
    streams.forEach((s, c) => { s.y += s.v*.35; if (Math.random() < .08){ const A = s.hot && Math.random() < .3 ? GLY : HEX; s.chars[(Math.random()*64) | 0] = A[(Math.random()*A.length) | 0]; }
      for (let r = 0; r < rows; r++){ const idx = (Math.floor(s.y) + r) % 64, head = r === ((Math.floor(t*6*s.v) + c*7) % rows);
        const a = .18 + .5*((r*7 + c*13) % 10)/10; g.fillStyle = head ? '#ffd38a' : s.hot ? 'rgba(255,181,71,' + a + ')' : 'rgba(170,200,185,' + (a*.7) + ')';
        g.fillText(s.chars[idx], c*cw + 2*dpr, r*fs - (s.y % 1)*fs); } });
    // a packet band sliding down, and the column the overseer is reading
    const py = ((t*60) % (H + 60)) - 30; g.fillStyle = 'rgba(255,181,71,.07)'; g.fillRect(0, py, W, 18*dpr);
  }
  function drawIso(t, dt){
    const g = cv.ig, W = cv.i.width, H = cv.i.height; g.clearRect(0, 0, W, H);
    const n = 8, m = 6, tw = Math.min(W/(n + m)*1.95, H/(n + m)*3.7), th = tw*.5, ox = W/2 - (n - m)*tw/4, oy = H/2 - (n + m)*th/4 + th*.15;
    const at = (i, j) => [ox + (i - j)*tw/2, oy + (i + j)*th/2];
    // the turning: every 0.55 s the next sector flips over like a tile
    flip.t += dt; if (flip.t > .55){ flip.t = 0; flip.k = (flip.k + 1 + ((Math.random()*5) | 0)) % tiles.length; tiles[flip.k].f = 1; tiles[flip.k].lit = 1; const lb = $('.planlbl'); if (lb) lb.textContent = 'TURNING S-' + String(flip.k).padStart(2, '0'); }
    for (const T_ of tiles){
      const [x, y] = at(T_.i, T_.j), f = T_.f, sc = f > 0 ? Math.cos((1 - f)*Math.PI) : 1, h = th*(.15 + .5*((T_.i*7 + T_.j*3) % 5)/5);
      T_.f = Math.max(0, T_.f - dt*1.8); T_.lit = Math.max(0, T_.lit - dt*.35);
      g.save(); g.translate(x, y); g.scale(1, Math.abs(sc) < .05 ? .05 : Math.abs(sc));
      // the block: top face and two sides, hairline
      g.beginPath(); g.moveTo(0, -h); g.lineTo(tw/2, th/2 - h); g.lineTo(0, th - h); g.lineTo(-tw/2, th/2 - h); g.closePath();
      g.fillStyle = T_.lit > 0 ? 'rgba(255,181,71,' + (.12 + .55*T_.lit) + ')' : 'rgba(150,175,162,.05)'; g.fill();
      g.strokeStyle = T_.lit > 0 ? 'rgba(255,200,120,' + (.4 + .6*T_.lit) + ')' : 'rgba(170,195,182,.28)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(-tw/2, th/2 - h); g.lineTo(-tw/2, th/2); g.lineTo(0, th); g.lineTo(tw/2, th/2); g.lineTo(tw/2, th/2 - h); g.moveTo(0, th - h); g.lineTo(0, th);
      g.strokeStyle = 'rgba(170,195,182,.16)'; g.stroke();
      g.restore();
    }
    // the reading head: a crosshair drifting over the plan
    const cx = W/2 + Math.sin(t*.4)*W*.25, cy = H/2 + Math.cos(t*.31)*H*.18;
    g.strokeStyle = 'rgba(255,181,71,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx - 4, cy); g.moveTo(cx + 4, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy - 4); g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 14); g.stroke();
    g.fillStyle = 'rgba(255,181,71,.8)'; g.font = (9*Math.min(2, devicePixelRatio || 1)) + 'px JetBrains Mono, monospace'; g.fillText((cx/W*46).toFixed(2) + ' / ' + (cy/H*66.6).toFixed(2), cx + 16, cy - 8);
  }
  function drawWave(t){
    const g = cv.wg, W = cv.w.width, H = cv.w.height; g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(170,195,182,.12)'; g.lineWidth = 1; for (let x = 0; x < W; x += W/8){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath(); for (let x = 0; x <= W; x += 2){ const u = x/W, y = H/2 + Math.sin(u*28 + t*5)*H*.18*Math.sin(u*3.1 + t*.7) + (Math.random() - .5)*H*.06 + (Math.abs(u - ((t*.25) % 1)) < .03 ? -H*.3 : 0); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = '#ffb547'; g.shadowColor = '#ffb547'; g.shadowBlur = 6; g.stroke(); g.shadowBlur = 0;
  }
  function loop(now){
    if (!O.open) return; raf = requestAnimationFrame(loop);
    if (now - last < 33) return; const dt = Math.min(.1, (now - last)/1000); last = now; const t = now/1000;
    drawStreams(t); drawIso(t, dt); drawWave(t);
    cd = Math.max(0, cd - dt); const c = $('.countdown'); if (c){ const s = Math.ceil(cd); c.textContent = String(Math.floor(s/60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
    if (Math.random() < .05) root.querySelectorAll('.fill').forEach(f => { f.style.height = (20 + Math.random()*75) + '%'; });
    if (Math.random() < .06){ const sg = $('.sig'); if (sg) sg.textContent = (-60 - Math.random()*20).toFixed(0) + ' dB'; }
  }
  /* ---------- in and out ---------- */
  // the curtain: glyphs falling in columns, each column's black following its glyph down, closing over the city
  function curtain(ms, then){
    const c = document.createElement('canvas'); c.id = 'ovsCurtain'; const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth*dpr; c.height = innerHeight*dpr; c.style.width = '100%'; c.style.height = '100%';
    document.body.appendChild(c); const g = c.getContext('2d'), cw = 14*dpr, cols = Math.ceil(c.width/cw), sp = Array.from({ length: cols }, () => .55 + Math.random()*.9), dl = Array.from({ length: cols }, () => Math.random()*.35);
    const t0 = performance.now();
    const step = (now) => { const u = Math.min(1, (now - t0)/ms); g.font = (12*dpr) + 'px JetBrains Mono, monospace';
      for (let k = 0; k < cols; k++){ const p = Math.max(0, Math.min(1.15, (u - dl[k])/(1 - dl[k]*.6)*sp[k])), y = p*c.height;
        g.fillStyle = '#020504'; g.fillRect(k*cw, 0, cw + 1, y - 12*dpr);
        g.fillStyle = Math.random() < .15 ? '#ffd38a' : 'rgba(255,181,71,.85)'; g.fillText(GLY[(Math.random()*GLY.length) | 0], k*cw + 2*dpr, y - 12*dpr);
        g.fillStyle = 'rgba(170,220,200,.5)'; g.fillText(HEX[(Math.random()*16) | 0], k*cw + 2*dpr, y - 26*dpr); }
      if (u < 1) requestAnimationFrame(step); else { g.fillStyle = '#020504'; g.fillRect(0, 0, c.width, c.height); then(c); } };
    requestAnimationFrame(step);
  }
  O.show = () => {
    if (O.open || O.busy) return; O.busy = true; if (!built) build();
    if (typeof MON !== 'undefined' && MON.close) try { MON.close(); } catch (e){}
    const city = canvas; city.classList.add('ovs-glitch');
    const bars = document.createElement('div'); bars.id = 'ovsBars'; document.body.appendChild(bars);
    setTimeout(() => curtain(650, (c) => {
      O.open = true; O.hold = true; dom(); setupCanvases(); last = 0; raf = requestAnimationFrame(loop);
      if (city) city.classList.remove('ovs-glitch'); bars.remove();
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 150, fill: 'forwards' }).onfinish = () => c.remove();
      keyH = e => { if (!O.open) return; e.stopPropagation(); const k = e.key.toLowerCase(); if (k === 'y') yes(); else if (k === 'n' || k === 'escape') no(); };
      addEventListener('keydown', keyH, true);
      setTimeout(() => { const b = $('.yes'); if (b) b.focus({ preventScroll: true }); O.busy = false; }, 700);
    }), 380);
  };
  function closeDesk(){ O.open = false; cancelAnimationFrame(raf); clearTimeout(typingT); if (keyH) removeEventListener('keydown', keyH, true); keyH = null; }
  function no(){
    if (!O.open || O.busy) return; O.busy = true; O.hold = false;   // (the city draws again under the desk as it leaves)
    root.classList.add('leave'); setTimeout(() => { closeDesk(); root.remove(); root = null; O.busy = false; }, 520);
  }
  function yes(){
    if (!O.open || O.busy) return; O.busy = true; $('.say').innerHTML = 'Remembering<span class="cur"></span>';
    setTimeout(() => { if (typeof TV !== 'undefined') TV.go('coast.html'); else location.href = 'coast.html'; }, 350);
  }
  // a double click on the Data Spire: the pointer's ray against each spire's whole height (the plot's own pick box stops at its plinth)
  const _r = new THREE.Raycaster(), _n = new THREE.Vector2(), _b = new THREE.Box3(), _h = new THREE.Vector3();
  function spireAt(cx, cy){
    if (typeof megas === 'undefined') return null; const r = canvas.getBoundingClientRect(); _n.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1); _r.setFromCamera(_n, cam);
    for (const m of megas.values()){ if (m.kind !== 'spire') continue; const hx = m.w*LOT/2 - .4, hz = m.h*LOT/2 - .4;
      _b.min.set(m.x - hx, CURB, m.z - hz); _b.max.set(m.x + hx, (m.top || 30), m.z + hz); if (_r.ray.intersectBox(_b, _h)) return m; }
    return null;
  }
  canvas.addEventListener('dblclick', e => { if (O.open || O.busy) return; if (typeof hwMode !== 'undefined' && (hwMode || mtMode || megaPick || delMode)) return; if (spireAt(e.clientX, e.clientY)){ e.preventDefault(); O.show(); } });
  return O;
})();
// arriving back from the coast: the television comes on once the city has drawn
if (typeof TV !== 'undefined') TV.ready = () => typeof pplReady !== 'undefined' && pplReady;
