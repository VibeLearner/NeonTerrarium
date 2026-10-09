#!/usr/bin/env python3
"""Item 4: what a stall is. Main thread without drawing (the real clock), at night with rain, people and lights on, over a long run. For every frame over 3 times the median
(and 8 ms more) prints the function that took the time, whether the JS heap dropped in that frame (a collection ran), and Chrome's own long-task entries.
Drawing time is not in it (the harness's software renderer can't time a card): a stall on the owner's card needs the trace steps in OVERNIGHT2.md.
   python3 tools/perf/stalls.py city|maxcity [--frames 3000] [--zoom 15] [--hour 22]"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=3000); ap.add_argument('--zoom', type=float, default=15); ap.add_argument('--hour', type=float, default=22); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('stl', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        pg.evaluate('([z, h]) => { zoom = zoomT = z; S.cycle = false; S.rain = true; S.hour = h; window.__lt = []; window.__h = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([+e.startTime.toFixed(0), +e.duration.toFixed(0)]); }).observe({ entryTypes: ["longtask"] }); } catch (e) {} }', [a.zoom, a.hour])
        pg.evaluate('() => __perf.cap(600, 3)')
        rows = []; heap = []
        for k in range(a.frames//250):
            r = pg.evaluate('([n]) => __perf.cpuFrames(n, [], "window.__h.push(performance.memory.usedJSHeapSize)")', [250]); rows += r['rows']
        h = pg.evaluate('() => window.__h'); lt = pg.evaluate('() => window.__lt')
        fr = sorted(x['frame'] for x in rows); med = statistics.median(fr)
        print('%d frames, zoom %g, hour %g, rain on: median %.2f ms, 95%% %.2f, 99%% %.2f, 99.9%% %.2f, max %.2f' % (len(fr), a.zoom, a.hour, med, fr[int(len(fr)*.95)], fr[int(len(fr)*.99)], fr[int(len(fr)*.999)], fr[-1]))
        shown = 0; gc = 0; slow = 0
        for i, row in enumerate(rows):
            t = row['frame']
            if t > max(3*med, med + 8):
                slow += 1; dropped = i > 0 and i < len(h) and h[i] < h[i - 1] - 1e6; gc += dropped
                if shown < 12:
                    shown += 1; parts = sorted(((v, k) for k, v in row.items() if k != 'frame'), reverse=True)[:3]; acc = sum(v for k, v in row.items() if k != 'frame')
                    print('  frame %4d %7.1f ms: %s; other %.1f%s' % (i, t, ', '.join('%s %.1f' % (k, v) for v, k in parts), t - acc, '; heap dropped %.1f MB (a collection)' % ((h[i - 1] - h[i])/1e6) if dropped else ''))
        print('slow frames: %d, of them with a heap drop (collection): %d; Chrome long tasks (>50 ms): %d %s' % (slow, gc, len(lt), lt[:8]))
        print(errs[:2]); br.close()
    srv.shutdown()
