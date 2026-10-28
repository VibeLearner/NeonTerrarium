// Neon Terrarium stage: plays the film small (320 x 180) and writes a hash of every frame drawn (and stills at the times asked), so two runs
// can be compared frame by frame. node tools/stage/check.js <out-dir> [from-seconds] [until-seconds] [still times, comma separated]
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '../..'), PORT = 8814 + Math.floor(Math.random()*100);
const OUT = path.resolve(process.argv[2] || 'check'), FROM = +(process.argv[3] || 0), UNTIL = +(process.argv[4] || 20), STILLS = (process.argv[5] || '').split(',').filter(Boolean).map(Number);
const W = +(process.env.W || 320), H = +(process.env.H || 180), EVERY = +(process.env.EVERY || 1);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/trailer/shim.js') });
  const p = await ctx.newPage(); p.setDefaultTimeout(0);
  const log = fs.createWriteStream(path.join(OUT, 'log.txt'));
  p.on('pageerror', e => { console.log('ERR', e.message); log.write('ERR ' + e.message + '\n'); });
  p.on('console', m => { const s = m.text(); if (m.type() === 'error' || /\[stage\]/.test(s)){ console.log('  ', s.slice(0, 260)); log.write(s + '\n'); } });
  const cdp = await ctx.newCDPSession(p);
  const grab = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64');
  await p.goto(`http://127.0.0.1:${PORT}/index.html#stage`, { waitUntil: 'load', timeout: 0 });
  for (let i = 0; ; i++){ await p.evaluate(() => __step(2)); const st = await p.evaluate(() => typeof PLAY !== 'undefined' ? { r: PLAY.ready, f: PLAY.failed } : {}); if (st.r || st.f) break; await p.waitForTimeout(15); }
  await p.evaluate(() => PLAY.start());
  const hashes = fs.createWriteStream(path.join(OUT, 'hashes.txt'));
  let si = 0; const t0 = Date.now();
  for (let f = 0; f <= UNTIL*60; f++){
    let d0 = await p.evaluate(() => PLAY.drawn), n = 0;
    for (;;){ await p.evaluate(() => __step(1)); if (await p.evaluate(() => PLAY.drawn) !== d0) break; if (++n % 300 === 0) console.log('  held', n); await p.waitForTimeout(4); }
    if (f < FROM*60) continue;
    if (f % EVERY === 0 || (si < STILLS.length && f >= STILLS[si]*60)){
      const png = await grab();
      if (f % EVERY === 0) hashes.write(f + ' ' + crypto.createHash('sha1').update(png).digest('hex') + '\n');
      if (si < STILLS.length && f >= STILLS[si]*60){ fs.writeFileSync(path.join(OUT, 's-' + STILLS[si] + '.png'), png); si++; }
    }
    if (f % 300 === 0){ const st = await p.evaluate(() => PLAY.state()); console.log((f/60).toFixed(1) + 's', ((Date.now() - t0)/1000).toFixed(0) + 's real', JSON.stringify(st.info).slice(0, 160)); if (st.done) break; }
  }
  hashes.end(); log.end();
  await b.close(); srv.close();
})();
