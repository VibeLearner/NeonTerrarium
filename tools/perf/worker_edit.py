#!/usr/bin/env python3
"""Round 9, item 2: edits made through the plot worker end the same as edits made on the page. The same list of edits is played twice from the same place in the
seeded random stream, once with the worker (window.__GEN_WORKER) and once with the test 'generation on the main thread (as before)', and what the edited plots
and their neighbors end up as (geometry hashes, fields, random calls) is compared.
   python3 tools/perf/worker_edit.py city [--edits 8]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

RUN = r"""
async ([mode, n]) => {
  const out = [];
  const cs = [...cells.values()].filter(c => c.sections.length && !c.mega && !c.lift && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length && c.height < MAX_HEIGHT - 8);
  const step = Math.max(1, Math.floor(cs.length / n)), picks = cs.filter((c, i) => i % step === 0).slice(0, n);
  __randSeed(4242);
  const zones = ['mid', 'high', 'low', 'ind'];
  // (no frames: only the staging steps run, so nothing else draws from the random stream between an edit's steps and the two runs draw in the same order)
  const waitDone = async () => { for (let g = 0; g < 100000 && (STAGE_Q.length || STAGE_READY.length); g++){ const j = STAGE_Q[0]; if (j && j.rw && !j.rw.done){ await new Promise(r => setTimeout(r, 1)); continue; } stageStep(1e9); } };
  for (const [k, c] of picks.entries()){
    addSection(c, zones[k % 4]);
    if (k % 3 !== 1) await waitDone();   // (every third edit is followed at once by the next: stageFinishAll then takes the first from the worker and makes it here)
    const near = [c, ...SIDES4.map(([a, b]) => cells.get(ckey(c.i + a, c.j + b))).filter(Boolean)];
    out.push(near.map(x => [x.i, x.j, x.height, x.topY, x.sections.length, x.data ? [...x.data.geo.values()].map(g => g.attributes.position.count + ':' + (g.index ? g.index.count : 0)).join() : '-', JSON.stringify(x.lifts), x.firstFloors, !!airCells.has(x)]));
  }
  await waitDone(); stageFinishAll();
  out.push(['all', [...cells.values()].map(x => x.height).reduce((a, b) => a + b, 0)]);
  // the walking network after all the edits, made in one call: a hash of its nodes, links (with their points), doors and places
  buildNetwork();
  const hh = (a, h = 2166136261) => { const t = String(a); for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  let nh = 0; nh = hh(NG.x.length, nh); for (let i = 0; i < NG.x.length; i++){ nh = hh(NG.x[i] + ',' + NG.z[i], nh); for (const [b, e] of NG.adj[i]) nh = hh(b + ':' + e.len + ':' + e.cost + ':' + JSON.stringify(e.pts), nh); }
  for (const d of doorList.concat(hiddenDoors)) nh = hh(d.key + JSON.stringify(d.stand) + JSON.stringify(d.wall), nh);
  for (const [k, p] of places) nh = hh(k + ':' + p.jobs + ':' + p.fun + ':' + (p.doors || []).length + ':' + (p.spots || []).length, nh);
  out.push(['network', nh, NG.x.length, places.size]);
  out.push(['rand', __randCalls()]);
  out.push(['made', typeof RW !== 'undefined' ? RW.line() : '']);
  return out;
}
"""

def play(mode, scene, edits, srv):
    from playwright.sync_api import sync_playwright
    import harness as HH
    url = HH.make_site('wedit' + mode, None); sc = HH.load_scenes([scene])[0]
    with sync_playwright() as pw:
        br = HH.launch(pw)
        init = 'window.__NV_OFF = true; ' + ('window.__GEN_WORKER = true; window.__LOAD_MAIN = true;' if mode == 'worker' else 'window.__GEN_MAIN = true;')
        ctx, pg, errs = HH.open_game(br, url, sc, HH.VIEWPORTS[0], extra_init=init)
        if mode == 'worker': pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=120000, polling=200)
        pg.evaluate('() => { __perf.skip = true; }')
        r = pg.evaluate(RUN, [mode, edits])
        br.close()
    return r, errs

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--edits', type=int, default=8)
    a = ap.parse_args()
    srv = H.serve()
    A, ea = play('main', a.scene, a.edits, srv)
    B, eb = play('worker', a.scene, a.edits, srv)
    srv.shutdown()
    bad = 0
    for k, (x, y) in enumerate(zip(A, B)):
        if x != y and not (isinstance(x, list) and x and x[0] == 'made'):
            bad += 1; print('DIFF at', k, '\n  main  ', json.dumps(x)[:600], '\n  worker', json.dumps(y)[:600])
    print('worker:', B[-1][1]); print('page errors', ea[:2], eb[:2])
    print('%d edits, %d differ' % (a.edits, bad)); sys.exit(1 if bad else 0)
