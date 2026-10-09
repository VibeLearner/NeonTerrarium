#!/usr/bin/env python3
"""Item 3 check: placing pieces with the upkeep done in the same frame (the default) against the upkeep spread over frames (window.__SYNC_LATER, the overlay test), after everything has settled.
People and vehicles are expected to differ (their random streams shift with the timing), so this compares the city: the cells, bridges, merged regions, ports and emitters, the walking network
(places, doors, graph size), and a hash of the static picture (the cache's color target after a whole redraw: no people, no vehicles).
   python3 tools/perf/placement_check.py city|maxcity"""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
EDITS = ["const c = cells.get(ckey(-1, 3)); if (c && !c.mega) addSection(c, 'mid');", "const c = cells.get(ckey(2, 3)); if (c && !c.mega){ addSection(c, 'high'); __randSeed(77); addSection(c, 'high'); }",
         "const c = [...cells.values()].find(c => c.sections.length && !c.mega && !(c.i === 2 && c.j === 3) && !(c.i === -1 && c.j === 3)); if (c) removeAt({ kind: 'bld', c });",
         "const c = cells.get(ckey(-1, 3)); if (c && c.sections.length) removeAt({ kind: 'bld', c });"]
STATE = """() => { finishSync && finishSync(); const cs = [...cells.values()].map(c => [c.i, c.j, +c.height.toFixed(3), c.sections.length, c.sections.map(s => s.seed).join('.')]).sort();
  const pk = [...pairCache.keys()].sort(); const dl = doorList.map(d => d.key).sort();
  return { cells: cs.length, cellsSig: JSON.stringify(cs).length + ':' + cs.reduce((a, c) => (a*31 + c[0]*7 + c[1]*13 + Math.round(c[2]*100) + c[3]) % 1000003, 7), pairs: pk.length, pairsSig: pk.join('|').length, connRegions: connRegions.size, solidRegions: solidRegions.size, superRegions: superRegions.size,
    ports: ports.length, emitters: emitters.length, vents: VENTS.length, places: places.size, doors: dl.length, doorsSig: dl.join('|').length, ngNodes: NG.x.length, ngEdges: NG.adj.reduce((a, l) => a + l.length, 0), patrol: patrolNodes.length, sky: +skyTop.toFixed(2), anims: anims.length, edits: SC_EDITS }; }"""
HASH = """() => { SC.ok = false; __perf.cap(3, 2); const w = SC.w, h = SC.h, buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(SC.rtS, 0, 0, w, h, buf); let a = 7, b = 11; for (let i = 0; i < buf.length; i += 7){ a = (a*31 + buf[i]) % 1000000007; b = (b*17 + buf[i + 1]) % 1000000009; } return a + ':' + b; }"""
def run(pw, url, sc, init):
    br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
    pg.evaluate('() => { zoom = zoomT = 30; S.cycle = false; S.hour = 12; }'); pg.evaluate('() => __perf.cap(150, 2)')
    worst = []; steps = []
    for k, js in enumerate(EDITS):
        pg.evaluate('() => { __randSeed(%d); ' % (9001 + k) + js + ' }')
        fr = pg.evaluate("""() => { const o = []; for (let i = 0; i < 20; i++){ __perf.skip = true; const t0 = __realNow(); __step(1); o.push(__realNow() - t0); __perf.skip = false; } return o; }""")
        worst.append(max(fr)); pg.evaluate('() => __perf.cap(300, 2)'); steps.append(pg.evaluate(STATE)['cellsSig'] + ' sky ' + str(pg.evaluate('() => +skyTop.toFixed(2)')))
    st = pg.evaluate(STATE); st['perEdit'] = steps; st['staticPicture'] = pg.evaluate(HASH); br.close(); return st, worst, errs
if __name__ == '__main__':
    scene = sys.argv[1] if len(sys.argv) > 1 else 'city'
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('pc', None); sc = H.load_scenes([scene])[0]
    with sync_playwright() as pw:
        a, wa, ea = run(pw, url, sc, None); b, wb, eb = run(pw, url, sc, 'window.__SYNC_LATER = true;')
    srv.shutdown()
    print('upkeep in the same frame :', json.dumps(a)); print('upkeep spread over frames:', json.dumps(b))
    diff = {k: (a[k], b[k]) for k in a if a[k] != b[k]}
    print('DIFFERENT:' if diff else 'the city is the same', diff if diff else '')
    print('worst of the 20 frames after each edit (no drawing; same frame): %s ms; (spread): %s ms' % ([round(x) for x in wa], [round(x) for x in wb])); print(ea[:2], eb[:2])
