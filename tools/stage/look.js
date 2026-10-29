// Neon Terrarium stage: pictures of one moment of the film from other camera angles, for choosing one (checking only).
// node tools/stage/look.js <out-dir> <jump-to-seconds> <at-seconds> "<yaw,pitchDeg,zoom;...>"   (W, H env: the window size)
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), PORT = 9014 + Math.floor(Math.random()*80), OUT = path.resolve(process.argv[2] || 'look');
const FROM = +process.argv[3], AT = (process.argv[4] || '').split(',').map(Number), LOOKS = (process.argv[5] || '').split(';').filter(Boolean).map(s => s.split(',').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: +(process.env.W || 480), height: +(process.env.H || 270) } });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/trailer/shim.js') });
  const p = await ctx.newPage(); p.setDefaultTimeout(0);
  const cdp = await ctx.newCDPSession(p);
  const snap = async f => fs.writeFileSync(f, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html#stage&from=${FROM}`, { waitUntil: 'load', timeout: 0 });
  for (;;){ await p.evaluate(() => __step(2)); if (await p.evaluate(() => typeof PLAY !== 'undefined' && (PLAY.ready || PLAY.failed))) break; await p.waitForTimeout(15); }
  await p.evaluate(() => PLAY.start());
  for (const at of AT){
    while (await p.evaluate(() => PLAY.state().t) < at) await p.evaluate(() => __step(1));
    for (const [yw, pd, z] of LOOKS.length ? LOOKS : [[NaN]]){
      await p.evaluate(o => { window.__CAM_OVR = o; }, isNaN(yw) ? null : { yaw: yw, pitch: pd*Math.PI/180, zoom: z });
      await p.evaluate(() => __step(1));   // (the next frame, drawn with that camera)
      const n = 't' + at + (isNaN(yw) ? '' : '-y' + yw + '-p' + pd + '-z' + z);
      await snap(path.join(OUT, n + '.png')); console.log('shot', n);
    }
    await p.evaluate(() => { window.__CAM_OVR = null; });
  }
  await b.close(); srv.close();
})();
