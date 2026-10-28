// Neon Terrarium stage: the film's apartment as it plays in the stage (jumped to just before it), small, with a few looks at the lab's view
// for working out its framing. node tools/stage/apt_live.js <out-dir> [at-seconds]
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), PORT = 8914 + Math.floor(Math.random()*80), OUT = path.resolve(process.argv[2] || 'apt_live'), AT = +(process.argv[3] || 41);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: +(process.env.W || 640), height: +(process.env.H || 360) } });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools/trailer/shim.js') });
  const p = await ctx.newPage(); p.setDefaultTimeout(0);
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { const s = m.text(); if (/\[stage\]|PodContext/.test(s)) console.log('  ', s.slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html#stage&from=32`, { waitUntil: 'load', timeout: 0 });
  for (;;){ await p.evaluate(() => __step(2)); if (await p.evaluate(() => typeof PLAY !== 'undefined' && (PLAY.ready || PLAY.failed))) break; await p.waitForTimeout(15); }
  await p.evaluate(() => PLAY.start());
  while (await p.evaluate(() => PLAY.state().t) < AT){ await p.evaluate(() => __step(1)); }
  const shot = async n => { await p.evaluate(() => __step(3)); await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot', n); };
  await shot('a-as-is');
  const info = await p.evaluate(() => { const w = FURN.frame.contentWindow, B = w.PodBuilder._B; return { cw: B.cw, ch: B.ch, zoom: B.zoom, tx: B.tx, tz: B.tz, az: B.az, pitch: B.pitch, walls: B.walls, frame: [FURN.frame.clientWidth, FURN.frame.clientHeight], root: B.root && B.root.position.toArray(), cam: B.cam.position.toArray(), ctx: !!w.PodContext.active() }; });
  console.log(JSON.stringify(info));
  // LOOKS="zoom,tx,tz;zoom,tx,tz": a picture at each
  for (const lk of (process.env.LOOKS || '1,0,0').split(';')){ const [z, x, zz] = lk.split(',').map(Number);
    await p.evaluate(([z, x, zz]) => { const B = FURN.frame.contentWindow.PodBuilder._B; B.zoom = z; B.tx = x; B.tz = zz; B.camDirty = true; B.needs = true; }, [z, x, zz]);
    await shot('b-' + lk.replace(/,/g, '_')); }
  await p.evaluate(() => { const w = FURN.frame.contentWindow; w.PodContext.exit(); const B = w.PodBuilder._B; B.camDirty = true; B.needs = true; });
  await shot('c-no-context');
  await b.close(); srv.close();
})();
