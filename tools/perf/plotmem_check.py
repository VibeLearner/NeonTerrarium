#!/usr/bin/env python3
"""Round 9, item 4: the plots' own arrays are let go once merged, and made again when read. Loads a scene, lets the city merge and the arrays go, then plays edits (a section on a
plot, a pod, a demolition, turns and pans) while counting what had to be made again on the page (each a stall) and by the worker, and reports the JS heap before and after.
   python3 tools/perf/plotmem_check.py city [--frames 600] [--keep]      (--keep: the test 'keep the plots' own geometry': nothing is let go)"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async ([frames, keep]) => {
  const out = {}; const heap = () => { return +(performance.memory.usedJSHeapSize/1048576).toFixed(0); };
  PM.trace = true;
  const wait = async n => { for (let k = 0; k < n; k++){ __step(1); if (k % 20 === 19) await new Promise(r => setTimeout(r, 5)); } };
  out.heapLoad = heap();
  await wait(frames);
  out.afterMerge = PM.line(); out.heapAfter = heap();
  const dropped = [...cells.values()].filter(c => c.data && c.data.pm && c.data.pm.out).length;
  out.plotsOut = dropped + ' of ' + cells.size;
  // play: edits, a pod, a demolition, turns and pans
  const s0 = PM.sync;
  const cs = [...cells.values()].filter(c => c.sections.length && !c.mega && !c.lift && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length && c.height < MAX_HEIGHT - 8);
  const pick = cs[Math.floor(cs.length/3)];
  addSection(pick, 'mid'); await wait(240);
  out.afterAdd = { sync: PM.sync - s0, async: PM.async };
  const tall = cs.find(c => c.height > CURB + FH*3);
  let pod = null; if (tall) for (const [a, b] of SIDES4){ const c = cells.get(ckey(tall.i + a, tall.j + b)); if (c && !c.mega && !c.lift && !c.sections.length && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length){ pod = addLift(c, Math.min(tall.height - 1.2, CURB + FH*2), 'mid'); if (pod) break; } }
  await wait(240); out.afterPod = { made: !!pod, sync: PM.sync - s0 };
  const dem = cs[Math.floor(cs.length/2)]; try { removeAt({ c: dem, kind: 'top' }); } catch (e) { out.demErr = String(e); }
  await wait(240); out.afterDemolish = { sync: PM.sync - s0 };
  yawT += 1.2; await wait(120); camGoal.x += 25; await wait(120); zoomT = 15; await wait(120); zoomT = 30; await wait(120);
  out.afterMoves = { sync: PM.sync - s0 };
  await wait(300);
  out.final = PM.line(); out.why = PM.why; out.stacks = [...(PM.stacks || new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  out.heapEnd = heap(); out.rw = RW.line();
  return out;
}
"""
SAME = r"""
async ([mode]) => {
  // the same edits in either build of the page, then the city left to settle; what comes out is hashed: every plot's arrays (made again where they were let go) and every merged block's
  const hb = (a, h = 2166136261) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i++){ h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const pause = () => new Promise(r => setTimeout(r, 2));
  const waitStage = async () => { for (let g = 0; g < 100000 && (STAGE_Q.length || STAGE_READY.length); g++){ const j = STAGE_Q[0]; if (j && j.rw && !j.rw.done){ await pause(); continue; } stageStep(1e9); } };
  for (let g = 0; g < 500; g++){ __step(1); if (g % 10 === 9) await pause(); }   // (the city merges and the plots' arrays go)
  const cs = [...cells.values()].filter(c => c.sections.length && !c.mega && !c.lift && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length && c.height < MAX_HEIGHT - 8);
  const step = Math.max(1, Math.floor(cs.length/6)), picks = cs.filter((c, i) => i % step === 0).slice(0, 6);
  for (const [k, c] of picks.entries()){ __randSeed(100 + k); addSection(c, ['mid', 'high', 'low', 'ind'][k % 4]); await waitStage(); }
  const tall = cs.filter(c => c.height > CURB + FH*3);
  let pods = 0; for (const t of tall.slice(0, 40)){ if (pods >= 2) break; for (const [a, b] of SIDES4){ const c = cells.get(ckey(t.i + a, t.j + b)); if (c && !c.mega && !c.lift && !c.sections.length && !hwAt(c.i, c.j).length && !mtAt(c.i, c.j).length){ __randSeed(200 + pods); if (addLift(c, Math.min(t.height - 1.2, CURB + FH*2), pods ? 'high' : 'mid')){ pods++; break; } } } }
  stageFinishAll();
  for (let g = 0; g < 4000; g++){ __step(1); if (g % 10 === 9) await pause(); if (g > 120 && !solidDirty.size && !SOLID_JOB && !STAGE_Q.length && !anims.length && !(typeof SYNC_Q !== 'undefined' && SYNC_Q !== null)) break; }
  for (let g = 0; g < 600; g++){ __step(1); if (g % 10 === 9) await pause(); }
  const syncDuring = PM.sync, why = Object.assign({}, PM.why), stacks = PM.stacks ? [...PM.stacks].slice(0, 5) : [];
  // every plot's arrays
  const plots = {}; for (const c of cells.values()){ if (!c.data) continue; const geo = c.data.geo.get(ATLAS); if (!geo) continue; if (c.data.pm && c.data.pm.out) pmRestoreSync(c.data.pm, 'check'); let h = 0; for (const k of PM.keys){ const a = geo.attributes[k]; if (a && a.array) h = hb(a.array, h || 2166136261); } if (geo.index) h = hb(geo.index.array, h); plots[c.i + ',' + c.j] = h; }
  const merged = {}; for (const [k, r] of solidRegions){ let h = 2166136261; for (const g of r.geoms){ for (const n in g.attributes){ const a = g.attributes[n].array; if (a) h = hb(a, h); } if (g.index && g.index.array) h = hb(g.index.array, h); } merged[k] = h; }
  return { syncDuring, why, stacks, plots, merged, line: PM.line(), rw: RW.line(), nPlots: Object.keys(plots).length, nMerged: Object.keys(merged).length };
}
"""
def same(scene, port):
    from playwright.sync_api import sync_playwright
    srv = H.serve(); sc = H.load_scenes([scene])[0]; res = {}

    with sync_playwright() as pw:
        br = H.launch(pw)
        for mode, init in (('keep', 'window.__NV_OFF = true; window.__KEEP_GEO = true; window.__KEEP_CPU = true;'), ('drop+worker', 'window.__NV_OFF = true; window.__KEEP_CPU = true; window.__GEN_WORKER = true;')):
            url = H.make_site('pms' + mode[:2], None)
            ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
            if 'worker' in mode: pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=900000, polling=500)
            pg.evaluate('() => { __perf.skip = true; PM.trace = true; }')
            res[mode] = pg.evaluate(SAME, [mode]); res[mode]['errs'] = errs[:2]; ctx.close()
        br.close()
    srv.shutdown()
    A, B = res['keep'], res['drop+worker']
    bad = [k for k in A['plots'] if A['plots'][k] != B['plots'].get(k)] + ['merged ' + k for k in A['merged'] if A['merged'][k] != B['merged'].get(k)]
    print('plots %d / %d, merged blocks %d / %d; differ: %d %s' % (A['nPlots'], B['nPlots'], A['nMerged'], B['nMerged'], len(bad), bad[:6]))
    print('slow restores on the page during the edits and settling:', B['syncDuring'], B['why'], B['stacks'])
    print('keep:', A['line'], '|', A['rw']); print('drop+worker:', B['line'], '|', B['rw']); print('errors', A['errs'], B['errs'])
    return 1 if bad or A['nPlots'] != B['nPlots'] or A['nMerged'] != B['nMerged'] else 0

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=600); ap.add_argument('--keep', action='store_true'); ap.add_argument('--noworker', action='store_true')
    ap.add_argument('--same', action='store_true', help='the same edits with and without letting go of the arrays: every plot and merged block hashed, compared')
    a = ap.parse_args()
    if a.same: sys.exit(same(a.scene, 0))
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('pm', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw)
        init = 'window.__NV_OFF = true;' + (' window.__KEEP_GEO = true;' if a.keep else '') + ('' if a.noworker else ' window.__GEN_WORKER = true;')
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='--js-flags=--expose-gc' and init)
        if not a.noworker: pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=900000, polling=500)
        pg.evaluate('() => { __perf.skip = true; }')
        r = pg.evaluate(RUN, [a.frames, a.keep])
        print(json.dumps(r, indent=1)); print('page errors', errs[:3])
        br.close()
    srv.shutdown()
