#!/usr/bin/env python3
"""Where the JS heap lives: Chrome's sampling heap profiler (live objects only, by the function that allocated them), started before the page loads.
   python3 tools/perf/heapsites.py maxcity [--ref REF] [--top 25]"""
import argparse, collections, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--ref', default=None); ap.add_argument('--top', type=int, default=25)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('hs', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx = br.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1); pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
        ctx.close()
        ctx, pg, errs = None, None, []
        ctx = br.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1); pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
        cdp.send('HeapProfiler.enable'); cdp.send('HeapProfiler.startSampling', {'samplingInterval': 65536})
        import json
        pg.set_default_timeout(1800000)
        pg.add_init_script('window.__PERF_SCENE = ' + json.dumps({'storage': sc.get('storage', {})}) + ';')
        pg.add_init_script(path=os.path.join(H.HERE, 'shim.js'))
        pg.goto('http://127.0.0.1:%d%s' % (H.PORT, url))
        pg.wait_for_function('() => document.readyState === "complete" && typeof frame === "function"')
        pg.wait_for_function('() => [...document.images].every(i => i.complete)'); pg.wait_for_timeout(2500)
        pg.add_script_tag(path=os.path.join(H.HERE, 'page.js')); pg.evaluate('sc => __perf.setup(sc)', sc)
        cdp.send('HeapProfiler.collectGarbage')
        prof = cdp.send('HeapProfiler.getSamplingProfile')['profile']
        tot = collections.Counter(); cnt = 0
        def walk(n, stack):
            global cnt
            f = n['callFrame']; here = stack + [(f['functionName'] or '(anon)', f['url'].split('/')[-1], f['lineNumber'] + 1)]
            if n['selfSize']:
                # blame the innermost function that belongs to the game's own files
                own = [x for x in here if x[1].endswith('.js') and x[1] not in ('three.min.js', 'BufferGeometryUtils.js', 'shim.js', 'page.js')]
                k = own[-1] if own else here[-1]; tot[k] += n['selfSize']
            for c in n['children']: walk(c, here)
        walk(prof['head'], [])
        total = sum(tot.values()); print('live sampled bytes %.0f MB' % (total/1048576))
        for (fn, f, ln), v in tot.most_common(a.top): print('%7.1f MB  %5.1f%%  %s  %s:%d' % (v/1048576, 100*v/total, fn, f, ln))
        br.close()
    srv.shutdown()
