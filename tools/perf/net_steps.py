#!/usr/bin/env python3
"""Round 9, item 3: what the walking network does in each step after one edit, as counts (no timing: the software renderer's clock means nothing). One plot gets a section the way a
player's edit does (staged, made on the page), then the network is built the way the page builds it, one step at a time (syncPeopleNetStep), and after every step the work done in it
is listed: path searches and their heap pops, door-search samples, crossing searches, standing spots made (approach searches), door-mesh doors. The biggest step by each count is named.
   python3 tools/perf/net_steps.py city [--old]      (--old: the test 'walking network: as before', for comparison)"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([old]) => {
  window.__NET_SPLIT = true; if (old) window.__NET_OLD = true;
  const cs = [...cells.values()].filter(c => c.sections.length && !c.mega && !c.lift && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length && c.height < MAX_HEIGHT - 8);
  const c = cs[Math.floor(cs.length/2)]; __randSeed(4242);
  pplReady = true; pplFrame = 1000;   // (past the first second: an edit's upkeep is done in steps)
  buildNetwork();   // (warm caches, as in play)
  addSection(c, 'mid'); stageFinishAll();
  syncPeopleAbort();
  const rows = [], keys = ['paths', 'pops', 'samples', 'cross', 'spots', 'approach', 'meshDoors', 'doorTab', 'doorSearch'];
  const orig = netSlice; let n = 0;
  window.netSlice = function(job){ const b = keys.map(k => NETC[k]); const r = orig(job); rows.push(keys.map((k, i) => NETC[k] - b[i])); return r; };
  while (!syncPeopleNetStep(1)) n++;
  window.netSlice = orig;
  return { keys, rows, cells: cells.size, doors: doorList.length, plot: [c.i, c.j] };
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--old', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('nsteps', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__LOAD_MAIN = true; window.__GEN_MAIN = true;')
        pg.evaluate('() => { __perf.skip = true; }')
        r = pg.evaluate(RUN, [a.old]); br.close()
    srv.shutdown()
    keys, rows = r['keys'], r['rows']
    print('%s%s: %d plots, %d doors, edit at %s, %d steps' % (a.scene, ' (old way)' if a.old else '', r['cells'], r['doors'], r['plot'], len(rows)))
    print('totals  ', {k: sum(x[i] for x in rows) for i, k in enumerate(keys)})
    for i, k in enumerate(keys):
        m = max(range(len(rows)), key=lambda q: rows[q][i]); print('biggest step by %-9s: step %3d of %d, %d' % (k, m, len(rows), rows[m][i]))
    print('page errors', errs[:3])
    json.dump(r, open(os.path.join(H.HERE, 'out', 'net_steps_%s%s.json' % (a.scene, '_old' if a.old else '')), 'w')) if os.path.isdir(os.path.join(H.HERE, 'out')) else None
