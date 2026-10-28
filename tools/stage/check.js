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
  if (process.env.DBG) await p.evaluate(() => { for (const C of [THREE.BufferAttribute, THREE.InterleavedBuffer]){ const d = Object.getOwnPropertyDescriptor(C.prototype, 'needsUpdate'); if (!d || !d.set) continue;
      Object.defineProperty(C.prototype, 'needsUpdate', { configurable: true, set(v){ if (v && this.array == null && !this.__told){ this.__told = true; console.error('[stage] null array flagged ' + (new Error().stack || '').split('\n').slice(2, 9).join(' | ')); } d.set.call(this, v); } }); } });
  if (process.env.DBG) await p.evaluate(() => { const d = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function(){ this.__disposed = (new Error().stack || '').split('\n').slice(2, 8).join(' | '); return d.apply(this, arguments); };
    { const r0 = renderer.render.bind(renderer); let told = 0; renderer.render = (sc, c) => { if (sc === scene && told < 3){ const bad = []; sc.traverse(o => { if ((o.isMesh || o.isPoints) && o.geometry && (Object.values(o.geometry.attributes).some(x => x.array == null) || (o.geometry.index && o.geometry.index.array == null)) && !o.__seen){ let v = true, q = o; while (q){ if (!q.visible) v = false; q = q.parent; } if (v){ let pth = [], q2 = o; while (q2){ pth.push(q2.name || q2.type); q2 = q2.parent; } bad.push(pth.slice(0, 5).join('<') + ' ud ' + JSON.stringify(Object.keys(o.userData || {})) + ' cell ' + (o.userData.cell ? o.userData.cell.i + ',' + o.userData.cell.j : '-') + ' disposed ' + String(o.geometry.__disposed || 'never').slice(0, 300) + ' nulls ' + Object.keys(o.geometry.attributes).filter(k => o.geometry.attributes[k].array == null).join(',')); } } }); if (bad.length){ told++; console.error('[stage] DRAWN DISPOSED frame ' + PLAY.frame + ' ' + bad.slice(0, 2).join(' ### ')); } } return r0(sc, c); }; }
    window.__findDisposed = () => { const out = []; const sr = []; for (const [k, g] of superRegions){ let n = 0; g.traverse(o => { if (o.geometry && o.geometry.__disposed) n++; }); if (n) sr.push(k + ':' + n); } out.push('super ' + sr.join(',') + ' dirty ' + [...superDirty].join(',') + ' conn ' + connRegions.size); let inWorld = 0, other = []; scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.__disposed){ let q = o, path = []; while (q){ path.push(q.name || q.type); q = q.parent; } other.push(path.slice(0, 5).join('<')); } }); out.push([...new Set(other)].slice(0, 6).join(' || ')); scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.__disposed && o.visible){ let v = true, q = o; while (q){ if (!q.visible) v = false; q = q.parent; } if (v) out.push((o.name || o.type) + ' parent ' + (o.parent && (o.parent.name || o.parent.type)) + ' :: ' + o.geometry.__disposed); } }); return out.slice(0, 4); }; });
  // FAST (default on): the frames that are not kept are worked out (every person, door, train and camera key still runs) but not drawn
  if (process.env.FAST !== '0') await p.evaluate(() => { window.__CAP = true; const r0 = renderer.render.bind(renderer); renderer.render = (sc, c) => { if (window.__CAP) return r0(sc, c); }; });
  await p.evaluate(() => PLAY.start());
  const hashes = fs.createWriteStream(path.join(OUT, 'hashes.txt'));
  let si = 0; const t0 = Date.now();
  for (let f = 0; f <= UNTIL*60; f++){
    const keep = f >= FROM*60 && (f % EVERY === 0 || (si < STILLS.length && f >= STILLS[si]*60));
    await p.evaluate(k => { window.__CAP = k; }, keep);
    let d0 = await p.evaluate(() => PLAY.drawn), n = 0;
    for (;;){ await p.evaluate(() => __step(1)); if (await p.evaluate(() => PLAY.drawn) !== d0) break; if (++n % 300 === 0) console.log('  held', n); await p.waitForTimeout(4); }
    if (f < FROM*60) continue;
    if (f % EVERY === 0 || (si < STILLS.length && f >= STILLS[si]*60)){
      const png = await grab();
      if (f % EVERY === 0) hashes.write(f + ' ' + crypto.createHash('sha1').update(png).digest('hex') + '\n');
      if (si < STILLS.length && f >= STILLS[si]*60){ fs.writeFileSync(path.join(OUT, 's-' + STILLS[si] + '.png'), png); si++; }
    }
    if (process.env.DBG && f % 30 === 0){ const fd = await p.evaluate(() => window.__findDisposed && __findDisposed()); if (fd && fd.length){ console.log('DISPOSED at', f, JSON.stringify(fd).slice(0, 1500)); } }
    if (f % 300 === 0){ const st = await p.evaluate(() => PLAY.state()); console.log((f/60).toFixed(1) + 's', ((Date.now() - t0)/1000).toFixed(0) + 's real', JSON.stringify(st.info).slice(0, 160)); if (st.done) break; }
  }
  hashes.end(); log.end();
  await b.close(); srv.close();
})();
