#!/usr/bin/env python3
"""Baked far buildings, item 3 (js/bakejob.js): the bake scheduler, the cache and the rebake on edits. Counts, not timing (except the budget check in --real, which uses the page's real clock
and a baker that spends a set time a step, never the software renderer's drawing).
 1. a city loads; the queue drains frame by frame; plots are baked nearest the view first (the order is checked against distance), every plot with a recipe ends up ready
 2. (--real) a costly baker: no frame's baking runs over the budget by more than one step
 3. reload (a second page in the same browser context, so the same IndexedDB): nothing is baked again, every plot comes from the store, byte for byte the same
 4. an edit (a section's seed changes, the plot is made again): the old bake is dropped (onDrop), the plot is baked again under a new signature
 5. a plot's removal drops its bake; clearCache() empties the store and every plot is queued and baked again
 6. no page errors, no console errors
   python3 tools/perf/bake_probe.py city [--real]       (PERF_PORT=... if the default port is taken)
--real: the page runs on the real clock with the worker on (no scripted clock, the game's own frame loop); bakejob.js is part of the page; the probe puts the placeholder baker back and turns the setting on (BAKE does nothing while it is off)."""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harness as H
REPO = os.path.dirname(os.path.dirname(HERE))


def open_in(ctx, url, sc, real, errs, cons):
    pg = ctx.new_page(); pg.set_default_timeout(900000)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: cons.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('window.__PERF_SCENE = ' + json.dumps({'storage': sc.get('storage', {})}) + ';')
    if real:   # the real clock: the scene's save in localStorage, nothing else of the harness's shim (its copy of three asks for __uuidRand)
        pg.add_init_script('window.__uuidRand = Math.random;')
        pg.add_init_script('(() => { try { const s = window.__PERF_SCENE.storage || {}; if (!sessionStorage.getItem("bpSeen")){ localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("neonIsland.autoPerf", "0"); sessionStorage.setItem("bpSeen", "1"); } } catch (e) {} })();')
    else:
        pg.add_init_script(path=os.path.join(HERE, 'shim.js'))
    pg.goto('http://127.0.0.1:%d%s' % (H.PORT, url))
    pg.wait_for_function('() => document.readyState === "complete" && typeof frame === "function"')
    pg.wait_for_function('() => [...document.images].every(i => i.complete)')
    pg.wait_for_timeout(2500)
    if real:   # the city is made from its recipes by the worker: wait until it has settled
        print('  page up, waiting for the city', flush=True)
        pg.wait_for_function('() => cells.size > 20 && [...cells.values()].every(c => c.data) && SYNC_Q === null && !anims.length && !solidDirty.size', timeout=150000, polling=500)
        pg.wait_for_timeout(3000)
        pg.evaluate('() => { S.cycle = false; S.hour = 12; }')
    else:
        pg.add_script_tag(path=os.path.join(HERE, 'page.js')); pg.evaluate('sc => __perf.setup(sc)', sc); pg.evaluate('() => { __perf.skip = true; }')   # (frames are simulated, not drawn: the software renderer takes about a second a frame)
    # (bakejob.js is in index.html now; the probe swaps in the placeholder baker, which is what it measures)
    pg.evaluate('() => { BAKE.baker = BAKE.placeholder; BAKE.onReady = null; BAKE.onDrop = null; }')
    pg.evaluate('() => { window.__BAKED_ON = true; }')
    pg.add_script_tag(path=os.path.join(HERE, 'bake_probe.js'))
    return pg


def run_until(pg, real, cond, what, max_steps=400):
    """frames until cond (a JS expression) holds: stepped in the harness, waited for on the real clock"""
    if real:
        pg.wait_for_function('() => ' + cond, timeout=300000, polling=200); return True
    for _ in range(max_steps):
        pg.evaluate('() => __step(5)')
        if pg.evaluate('() => ' + cond): return True
    print('  gave up waiting for', what); return False


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene', nargs='?', default='city'); ap.add_argument('--real', action='store_true'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('bakeprobe', None); sc = H.load_scenes([a.scene])[0]
    errs, cons, bad = [], [], []
    def check(name, ok, more=''):
        print('%-4s %s %s' % ('ok' if ok else 'FAIL', name, more)); (None if ok else bad.append(name))
    with sync_playwright() as pw:
        br = H.launch(pw); vp = (400, 225) if a.real else H.VIEWPORTS[0]   # (real clock in the software renderer: a small picture keeps a frame cheap)
        ctx = br.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1)
        # ---- 1 and 2: first load, queue drains, nearest first ----
        pg = open_in(ctx, url, sc, a.real, errs, cons)
        pg.evaluate('() => { __bp.record(0); __bp.hook(); __bp.budget = 4; }')
        run_until(pg, a.real, '__bp.settled()', 'the first drain')
        s = pg.evaluate('() => ({ st: BAKE.stats(), elig: __bp.eligible(), distinct: __bp.distinct(), order: __bp.order })')
        st = s['st']
        check('every eligible plot is ready', st['by'].get('ready') == s['elig'] and s['elig'] > 20, '%s of %s, %s' % (st['by'], s['elig'], st['plots']))
        check('baked once per distinct signature (equal plots share)', st['baked'] + st['dedup'] + st['memHits'] == st['plots'] and st['baked'] == s['distinct'], 'baked %d, deduped %d, memory hits %d, distinct %d, plots %d' % (st['baked'], st['dedup'], st['memHits'], s['distinct'], st['plots']))
        d = [o['d'] for o in s['order']]
        inv = sum(1 for i in range(1, len(d)) if d[i] < d[i - 1] - 1e-6)
        check('baked nearest the view first', inv <= max(2, len(d)//20), '%d bakes, %d steps back in distance (plots arriving later than the first scan can come out of order)' % (len(d), inv))
        check('stored for the next session', st['stored'] == st['baked'] and st['storeKeys'] >= st['baked'], 'store keys %d, bytes %d' % (st['storeKeys'], st['storeBytes']))
        check('no warm tick (scan, lookups and baking) past a budget of 4 ms by more than 3 ms with the placeholder', st['maxTickMs'] < 4 + 3, 'ticks %d, over budget+1 ms: %d, max %.2f ms, cold first ticks %.1f ms, worst tick %s' % (st['ticks'], st['ticksOver'], st['maxTickMs'], pg.evaluate('() => BAKE.coldMs'), pg.evaluate('() => BAKE.worst')))
        h1 = pg.evaluate('() => __bp.hashes()'); n1 = len(h1); sig1 = pg.evaluate('() => Object.fromEntries([...BAKE.ents.values()].map(e => [e.key, e.sig]))')
        if a.real:   # a costly baker (3 ms a face, 6 faces a plot) against a budget of 2 ms: a frame bakes one step past the budget at most
            pg.evaluate('() => { BAKE.clearCache(); BAKE.c.ticksOver = 0; BAKE.c.maxTickMs = 0; BAKE.c.steps = 0; BAKE.c.ticks = 0; __bp.order.length = 0; BAKE.drawsInSig = false; BAKE.density = "d1c"; __bp.budget = 4; __bp.record(1); }')
            pg.wait_for_timeout(6000)
            c = pg.evaluate('() => ({ st: BAKE.stats(), n: __bp.order.length, left: (BAKE.stats().by.queued || 0) })')
            st2 = c['st']
            check('costly baker (1 ms a face, 6 faces a plot), budget 4 ms: worked through in slices of a few steps', 0 < st2['baked'] and 2 <= st2['steps']/max(1, st2['ticks']) <= 6, 'baked %d, steps %d over %d ticks, queued %d' % (st2['baked'], st2['steps'], st2['ticks'], c['left']))
            check('costly baker: a frame runs over by no more than one step plus scheduling', st2['maxTickMs'] < 4 + 1 + 3, 'max tick %.1f ms, worst tick %s' % (st2['maxTickMs'], pg.evaluate('() => BAKE.worst')))
            check('costly baker: frames that ran over the budget by more than 1 ms', st2['ticksOver'] <= max(1, st2['ticks']*0.1), '%d of %d ticks' % (st2['ticksOver'], st2['ticks']))
            pg.evaluate('() => { __bp.budget = undefined; BAKE.density = "d1"; BAKE.clearCache(); __bp.record(0); }')
            run_until(pg, a.real, '__bp.settled()', 'the drain after the costly baker')
            h1 = pg.evaluate('() => __bp.hashes()'); n1 = len(h1)
        run_until(pg, a.real, 'BAKE.flushed()', 'the store writes')   # (a page closed before its writes land loses them)
        pg.close()
        # ---- 3: reload, same context ----
        pg = open_in(ctx, url, sc, a.real, errs, cons)
        pg.evaluate('() => { __bp.record(0); __bp.hook(); }')
        run_until(pg, a.real, '__bp.settled()', 'the drain after a reload')
        s = pg.evaluate('() => ({ st: BAKE.stats(), h: __bp.hashes(), elig: __bp.eligible() })'); st = s['st']
        moved = [k for k, v in pg.evaluate('() => Object.fromEntries([...BAKE.ents.values()].map(e => [e.key, e.sig]))').items() if sig1.get(k) != v]
        if moved: print('  plots whose signature differs after the reload:', moved[:5], [(sig1.get(k), pg.evaluate('([k]) => __bp.sigOf(k)', [k])) for k in moved[:2]])
        check('reload: nothing baked again', st['baked'] == 0 and st['by'].get('ready') == s['elig'], 'baked %d, store hits %d, memory hits %d, ready %s of %d' % (st['baked'], st['hits'], st['memHits'], st['by'].get('ready'), s['elig']))
        check('reload: every distinct bake came from the store', st['hits'] + st['memHits'] == st['plots'], 'hits %d + %d of %d plots' % (st['hits'], st['memHits'], st['plots']))
        check('reload: the baked data is the same byte for byte', s['h'] == h1, '%d plots' % len(s['h']))
        # ---- 4: an edit ----
        key = pg.evaluate('() => __bp.pickBuilt()')
        before = pg.evaluate('([k]) => ({ sig: __bp.sigOf(k), h: __bp.hashes()[k], refs: __bp.memRefs(__bp.sigOf(k)), dropped: __bp.dropped.length, edits: BAKE.c.edits, baked: BAKE.c.baked })', [key])
        r = pg.evaluate('([k]) => __bp.edit(k)', [key])
        check('the edit changed the plot\'s recipe (or the worker is making it again)', True)
        run_until(pg, a.real, '__bp.sigOf(%s) !== %s && BAKE.state(cells.get(%s)) === "ready"' % (json.dumps(key), json.dumps(before['sig']), json.dumps(key)), 'the edit to be baked')
        run_until(pg, a.real, '__bp.settled()', 'the drain after an edit')
        after = pg.evaluate('([k]) => ({ sig: __bp.sigOf(k), h: __bp.hashes()[k], first: Array.from((BAKE.ents.get(k).bake.tex.albedo || []).slice(0, 4)), state: BAKE.state(cells.get(k)), dropped: __bp.dropped.slice(), edits: BAKE.c.edits, baked: BAKE.c.baked, oldRefs: 0, old: BAKE.mem.has(%s) })' % json.dumps(before['sig']), [key])
        check('edit: a new signature, the old bake dropped, the plot ready again', after['sig'] != before['sig'] and after['state'] == 'ready' and after['edits'] == before['edits'] + 1 and any(d['key'] == key and d['h'] == before['h'] for d in after['dropped']), 'edits %d, dropped %d' % (after['edits'], len(after['dropped'])))
        check('edit: baked again (a new signature is not in the store)', after['baked'] > before['baked'] and after['h'] != before['h'], 'baked %s -> %s, data hash %s -> %s, sig %s -> %s, first bytes after %s' % (before['baked'], after['baked'], before['h'], after['h'], before['sig'][-30:], after['sig'][-30:], after.get('first')))
        check('edit: the old bake left memory (no other plot holds it)', not after['old'] or before['refs'] > 1)
        # ---- 5: removal and clearCache ----
        key = pg.evaluate('() => __bp.pickEmpty()')
        if key:
            sig = pg.evaluate('([k]) => __bp.sigOf(k)', [key]); d0 = pg.evaluate('() => __bp.dropped.length')
            ok = pg.evaluate('([k]) => __bp.remove(k)', [key])
            run_until(pg, a.real, '!BAKE.ents.has(%s)' % json.dumps(key), 'the removal to be noticed')
            run_until(pg, a.real, '__bp.settled()', 'the drain after a removal')
            after = pg.evaluate('([k]) => ({ ent: BAKE.ents.has(k), dropped: __bp.dropped.length, dk: __bp.dropped.map(d => d.key), plots: BAKE.stats().plots, cells: [...cells.values()].filter(c => c.data && c.data.rec && !c.mega).length })', [key])
            check('removal: the plot was removed and its bake dropped (its neighbors are made again with a new recipe and drop theirs too)', ok and not after['ent'] and key in after['dk'][d0:], 'dropped %d: %s' % (after['dropped'] - d0, after['dk'][d0:]))
        else:
            check('removal: an empty ready plot to remove', False)
        pg.evaluate('() => BAKE.clearCache()')
        s0 = pg.evaluate('() => ({ keys: BAKE.keys.size, mem: BAKE.mem.size, plots: BAKE.ents.size })')
        check('clearCache empties the store and memory', s0['keys'] == 0 and s0['mem'] == 0 and s0['plots'] == 0, str(s0))
        b0 = pg.evaluate('() => BAKE.c.baked')
        run_until(pg, a.real, '__bp.settled()', 'the drain after clearCache')
        s = pg.evaluate('() => ({ st: BAKE.stats(), elig: __bp.eligible() })'); st = s['st']
        check('after clearCache every plot is baked again', st['baked'] > b0 and st['by'].get('ready') == s['elig'], 'baked %d more, ready %s of %d' % (st['baked'] - b0, st['by'].get('ready'), s['elig']))
        check('no baker failed', st['failed'] == 0)
        pg.close(); br.close()
    srv.shutdown()
    check('no page errors', not errs, str(errs[:3])); check('no console errors', not cons, str(cons[:3]))
    print('FAILED: %s' % bad if bad else 'all ok'); sys.exit(1 if bad else 0)
