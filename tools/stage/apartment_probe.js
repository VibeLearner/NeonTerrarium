// Neon Terrarium stage: opens the second person's apartment (tools/stage: HOME pod) in Furnish pod with the city of js/stage_city.js and nothing
// saved for it, so the lab lays out a home of its own, and writes what it made to tools/stage/apartment_base.json: the recipe (rooms, finishes,
// every piece) and the rooms' outlines. The film's apartment (tools/stage/apartment.json) is written by hand from it.
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), PORT = 8813, POD = process.argv[2] || '2,-1|0|1';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 480, height: 270 } })).newPage(); p.setDefaultTimeout(0);
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { if (m.type() === 'error' || /\[stage\]|Furnish pod|PodContext|builder/.test(m.text())) console.log('  ', m.text().slice(0, 200)); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html#stage&probe`, { waitUntil: 'load', timeout: 0 });
  const wait = async (fn, secs, what) => { const t0 = Date.now(); for (;;){ if (await p.evaluate(fn).catch(() => false)) return true; if (Date.now() - t0 > secs*1000){ console.log('timed out:', what); return false; } await p.waitForTimeout(250); } };
  await p.evaluate(() => FURN.preload());
  await wait(() => FURN.warmed() && FURN.frame && FURN.ready, 400, 'lab warm');
  console.log('lab warm; opening', POD);
  console.log('open:', await p.evaluate(pod => FURN.openKey(pod), POD));
  const lab = () => { const f = FURN.frame; return f && f.contentWindow; };
  await wait(() => { const w = FURN.frame.contentWindow, B = w.PodBuilder && w.PodBuilder._B, PB = w.PodBuilder; return !!(B && B.inst && B.inst.size && !(PB.homePending && PB.homePending()) && w.PodContext && !w.PodContext.transitioning); }, 400, 'home built');
  await p.waitForTimeout(2000);
  const out = await p.evaluate(() => { const w = FURN.frame.contentWindow, PB = w.PodBuilder, B = PB._B;
    const rec = PB.recipe(), P = B.P;
    const rooms = P && P.rooms ? P.rooms.map(r => ({ id: r.id, label: r.label, kind: r.kind, x: r.x, z: r.z, w: r.w, d: r.d, rect: r.rect || null, cells: r.cells ? r.cells.length : null })) : null;
    const pieces = [...B.inst.values()].filter(i => i.rec && !i.rec.parent).map(i => ({ id: i.rec.id, arch: i.rec.arch, name: i.name, kind: i.kind, x: +i.rec.x.toFixed(3), z: +i.rec.z.toFixed(3), y: +(i.rec.y || 0).toFixed(3), ry: +(i.rec.ry || 0).toFixed(3),
      box: i.lbox ? [i.lbox.min.x, i.lbox.min.y, i.lbox.min.z, i.lbox.max.x, i.lbox.max.y, i.lbox.max.z].map(v => +v.toFixed(2)) : null, wh: i.rec.wh || 0 }));
    return { pod: B.home && B.home.pod, home: B.home, P: { W: P && P.W, D: P && P.D, TILE: B.TILE, rooms }, recipe: rec, pieces, cam: { az: B.az, zoom: B.zoom } };
  });
  fs.writeFileSync(path.join(__dirname, 'apartment_base.json'), JSON.stringify(out, null, 1));
  await p.screenshot({ path: path.join(__dirname, 'apartment_base.png') });
  console.log('pieces', out.pieces.length, 'rooms', out.P.rooms && out.P.rooms.length, 'W x D', out.P.W, out.P.D);
  await b.close(); srv.close();
})();
