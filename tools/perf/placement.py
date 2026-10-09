#!/usr/bin/env python3
"""Item 3: where the time goes when a piece is placed. Wraps the generation and merge functions with the real clock (exclusive times: a function's own time without
what it calls among the others), places a house and then a tall tower in the max city, and reports the call itself and each of the next frames (drawing skipped; shader
compiles are counted separately from the programs the first drawn frames add).
   python3 tools/perf/placement.py maxcity [--frames 12]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
NAMES = ['addSection', 'refresh', 'rebuildCell', 'cellView', 'collect', 'prepCovers', 'hideCovered', 'sideLayout', 'bucketGeometry', 'batchGroup', 'mergeCut', 'mergeIndexed', 'rebuildSolid0', 'flushSolid', 'flushSuper',
         'mergeLeaves', 'rebuildRegion', 'rebuildConnections', 'syncAgents', 'startAnim', 'dropView', 'disposeData', 'markSolidRegion', 'maybeSpawnMegas', 'updateAnims', 'makeSteamMap', 'shadowFrame', 'weldOf', 'freezeTree', 'glowOverlay', 'hwCap', 'finishAnimsOn', 'save', 'syncPeople', 'setupSteam', 'neighbors', 'connectPair', 'buildWalkMaps', 'refreshPeopleNav', 'ngBuild', 'plotEdges', 'stepSync', 'syncAgentsA', 'syncAgentsEnd', 'syncPeopleNet', 'syncPeopleRest', 'buildNetwork', 'syncResidents', 'syncJobs', 'syncBots', 'syncLurkers', 'sendHome', 'pickSpot', 'rebuildGround', 'crossing', 'plotDoor', 'makeDoor', 'makeSpots', 'ngAdd', 'ngLink', 'cellGrid', 'pathable', 'crossKey', 'closedMega', 'openMega', 'freeAt', 'patrolRoute', 'buildPlaces', 'stageStep', 'stageTake', 'recipeOf', 'recipeUnpack', 'plotMaps', 'rasterize', 'freeMap', 'netSlice', 'syncPeopleNetStep', 'rebuildDoorMeshes', 'gridPaths', 'plotEdgesGen']
JS = r"""([names]) => {
  const now = __realNow, ex = {}, cnt = {}, stack = []; const orig = {};
  for (const nm of names){ let f; try { f = (0, eval)(nm); } catch (e) { continue; } if (typeof f !== 'function') continue; orig[nm] = f;
    const w = function(...a){ const t0 = now(); stack.push(0); try { return f.apply(this, a); } finally { const inc = now() - t0, child = stack.pop(); ex[nm] = (ex[nm] || 0) + inc - child; cnt[nm] = (cnt[nm] || 0) + 1; if (stack.length) stack[stack.length - 1] += inc; } };
    try { (0, eval)(nm + ' = arguments[0]').call; } catch (e) {}
    window['__w_' + nm] = w; }
  return Object.keys(orig); }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=12); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('place', None); sc = H.load_scenes([a.scene])[0]
    # the wrapper is installed by rewriting the global bindings from inside the page (function declarations are writable globals)
    WRAP = """(names) => { const now = __realNow; window.__EX = {}; window.__CNT = {}; window.__STACK = [];
      for (const nm of names){ let f; try { f = (0, eval)(nm); } catch (e) { continue; } if (typeof f !== 'function') continue;
        const w = function(...args){ const t0 = now(); __STACK.push(0); try { return f.apply(this, args); } finally { const inc = now() - t0, child = __STACK.pop(); __EX[nm] = (__EX[nm] || 0) + inc - child; __CNT[nm] = (__CNT[nm] || 0) + 1; if (__STACK.length) __STACK[__STACK.length - 1] += inc; } };
        (0, eval)(nm + ' = window.__W_' + nm); } }"""
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('() => { zoom = zoomT = 30; S.cycle = false; S.hour = 12; }'); pg.evaluate('() => __perf.cap(120, 3)')
        # install wrappers: each as window.__W_name first
        names = pg.evaluate("""(names) => { const now = __realNow; window.__EX = {}; window.__CNT = {}; window.__STACK = []; const ok = [];
          for (const nm of names){ let f; try { f = (0, eval)(nm); } catch (e) { continue; } if (typeof f !== 'function') continue; ok.push(nm);
            window['__W_' + nm] = function(...args){ const t0 = now(); __STACK.push(0); try { return f.apply(this, args); } finally { const inc = now() - t0, child = __STACK.pop(); __EX[nm] = (__EX[nm] || 0) + inc - child; __CNT[nm] = (__CNT[nm] || 0) + 1; if (__STACK.length) __STACK[__STACK.length - 1] += inc; } };
            try { (0, eval)(nm + ' = window.__W_' + nm); } catch (e) { ok.pop(); } } return ok; }""", NAMES)
        print('timed:', ' '.join(names))
        def report(title):
            r = pg.evaluate('() => { const o = { ex: Object.assign({}, __EX), cnt: Object.assign({}, __CNT) }; for (const k in __EX) delete __EX[k]; for (const k in __CNT) delete __CNT[k]; return o; }')
            tot = sum(r['ex'].values()); print('%s: %.1f ms in the timed functions' % (title, tot))
            for k, v in sorted(r['ex'].items(), key=lambda kv: -kv[1])[:10]:
                if v >= .3: print('    %-18s %7.1f ms  (%d calls)' % (k, v, r['cnt'][k]))
        for label, js in (('a house', "const c = cells.get(ckey(-1, 3)); if (c && !c.mega) { const t0 = __realNow(); addSection(c, 'mid'); window.__CALL = __realNow() - t0; }"),
                          ('a tall tower', "const c = cells.get(ckey(2, 3)); if (c && !c.mega){ const t0 = __realNow(); addSection(c, 'high'); addSection(c, 'high'); window.__CALL = __realNow() - t0; }")):
            pg.evaluate('() => { __perf.cap(30, 3); }'); report('(settling)')
            pg.evaluate('() => { ' + js + ' }'); print('== placing %s: the call took %.1f ms' % (label, pg.evaluate('() => window.__CALL')))
            report('  inside the call')
            for f in range(a.frames):
                t = pg.evaluate('() => { __perf.skip = true; const t0 = __realNow(); __step(1); const d = __realNow() - t0; __perf.skip = false; return d; }')
                r = pg.evaluate('() => { const o = { ex: Object.assign({}, __EX) }; for (const k in __EX) delete __EX[k]; for (const k in __CNT) delete __CNT[k]; return o; }')
                big = sorted(r['ex'].items(), key=lambda kv: -kv[1])[:3]
                print('  frame %2d (no drawing): %6.1f ms   %s' % (f + 1, t, ', '.join('%s %.1f' % (k, v) for k, v in big if v >= .3)))
            p0 = pg.evaluate('() => renderer.info.programs.length'); pg.evaluate('() => __perf.cap(10, 9)'); p1 = pg.evaluate('() => renderer.info.programs.length')
            print('  shader programs added by the first drawn frames: %d' % (p1 - p0))
        print(errs[:2]); br.close()
    srv.shutdown()
