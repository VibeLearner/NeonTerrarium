// Neon Terrarium stage: the city of js/stage_city.js built at once (#stage&probe, no film), and what the scene's author needs to know about it
// written to tools/stage/probe.json: every plot's height, the doors, the square, the stations and their lifts, the metro's path, the
// police drones' pads. Run: node tools/stage/probe.js (serves the repo itself on port 8812; Playwright's Chromium, small window).
'use strict';
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), PORT = 8812;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { if (m.type() === 'error' || /\[stage\]/.test(m.text())) console.log('  ', m.text().slice(0, 240)); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html#stage&probe`, { waitUntil: 'load', timeout: 0 }); p.setDefaultTimeout(0);
  const q = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : 'null';
  const out = await p.evaluate(extra => {
    const r2 = v => Math.round(v*100)/100;
    const plots = [...cells.values()].map(c => [c.i, c.j, r2(c.height || 0), c.mega || null]);
    const doors = []; for (const pl of places.values()) for (const d of pl.doors) if (!d.lift && d.wall) doors.push({ place: pl.id, cell: pl.cell ? [pl.cell.i, pl.cell.j] : null, mega: pl.mega ? pl.mega.kind : null, wall: [r2(d.wall.x), r2(d.wall.z)], stand: d.stand ? [r2(d.stand.x), r2(d.stand.z)] : null, inside: d.inside ? [r2(d.inside.x), r2(d.inside.z)] : null, key: d.key });
    const megasOut = [...megas.values()].map(m => ({ id: m.id, kind: m.kind, i: m.i, j: m.j, w: m.w, h: m.h, seed: m.seed, centre: m.centre || null, rot: m.rot || 0 }));
    const L = metros[0], P = L ? mtPath(L) : null;
    const line = L ? { id: L.id, st: L.st, sides: L.sides, tiles: L.tiles.length, len: P.len, stops: P.stops.map(s => ({ k: s.k, s: r2(s.s) })),
      stations: [...(L.stn ? L.stn.values() : [])].map(s => ({ k: s.k, s: r2(s.s), side: s.side, e: s.e, lift: mtW(s, s.side*MT_LIFT_OFF, 0).map(r2), door: mtW(s, s.side*.62, 0).map(r2), inn: mtW(s, s.side*.12, 0).map(r2) })),
      cabs: (L.cabs || []).map(c => ({ k: c.k, x: r2(c.x), z: r2(c.z), y0: r2(c.y0), y1: r2(c.y1) })), MT_Y, MT_PLAT_Y } : null;
    const pts = n => { if (!P) return null; const o = {}; hwAlong(P, n, 0, o); return o; };
    const drones = (typeof POLICE_STATIONS !== 'undefined' ? POLICE_STATIONS : []).map(st => st.drones.map(d => ({ pos: d.g.position.toArray().map(r2), pad: d.st.pad ? [r2(d.st.pad.x), r2(d.st.pad.y), r2(d.st.pad.z)] : null })));
    const homes = []; for (const c of cells.values()) if (!c.mega && c.sections.length) { const hs = FURN.homesOf(c); if (hs.length) homes.push({ cell: [c.i, c.j], pods: hs.map(h => ({ key: h.cell[0] + ',' + h.cell[1] + '|' + h.section + '|' + h.floor, zone: h.zone, floor: h.floor, kind: h.kind })) }); }
    // routes on the walking network between the points asked for (the scene's author bakes the answers into the scene: the stage itself never looks a route up)
    const routes = (extra && extra.routes || []).map(([ax, az, bx, bz]) => { const a = STORY.nearestNode(ax, az), b2 = STORY.nearestNode(bx, bz); const r = route(a, b2); return r ? r.map(n => [r2(NG.x[n]), r2(NG.z[n])]) : null; });
    // the walking network itself, for the scene's author to find ways along (nodes [x, z]; edges [a, b, cost, points])
    const ng = { nodes: NG.x.map((x, k) => [r2(x), r2(NG.z[k])]), edges: [] };
    NG.adj.forEach((m, a) => m.forEach((e, b) => { if (e.a === a && a < NG.x.length) ng.edges.push([a, b, r2(e.cost), e.pts.map(q => [r2(q[0]), r2(q[1])])]); }));
    return { LOT, CURB, ng, plots, doors, megas: megasOut, line, drones, homes, routes, info: PLAY.info, log: PLAY.log.slice(-20) };
  }, JSON.parse(q));
  fs.writeFileSync(path.join(__dirname, 'probe.json'), JSON.stringify(out));
  console.log('plots', out.plots.length, 'doors', out.doors.length, 'megas', out.megas.length, 'line', !!out.line, 'drones', JSON.stringify(out.drones).slice(0, 200), 'homes', out.homes.length);
  await b.close(); srv.close();
})();
