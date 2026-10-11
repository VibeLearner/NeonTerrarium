#!/usr/bin/env python3
"""Garbage collection pauses: a Chrome trace of scripted play, and the JavaScript engine's pauses in it (what the overlay never shows).
   python3 tools/perf/gc_check.py dense [--frames 240] [--storage mycity.json]        (PERF_GPU=1: the machine's own Chrome, much quicker)
Plays: still frames, a slow pan, a turn, three edits, the day cycle on, rain coming in. Reports the GC events (count, longest, total), the frames
with a pause over 4 ms, and the JS heap before and after (allocation per frame from the heap's growth between collections)."""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=240); ap.add_argument('--storage')
a = ap.parse_args()
sc = H.load_scenes([a.scene])[0]
if a.storage: sc = dict(sc); sc['storage'] = json.load(open(a.storage))
PLAY = [('still', 'null'), ('pan', 'keys.add("d")'), ('pan end', 'keys.delete("d")'), ('turn', 'yawT += Math.PI/4'),
        ('edit', "const c = [...cells.values()].find(c => !c.mega && !c.lift && !c.sections.length); if (c) addSection(c, 'mid')"),
        ('edit', "const c = [...cells.values()].filter(c => !c.mega && !c.lift && c.sections.length)[3]; if (c) removeAt({ kind: 'bld', c })"),
        ('day cycle', 'S.cycle = true; S.hour = 18.5'), ('rain', 'S.rain = true; if (typeof LK !== "undefined" && LK.wx) LK.wx.tr = 1')]
from playwright.sync_api import sync_playwright
srv = H.serve(); url = H.make_site('gc', None)
events = []
with sync_playwright() as pw:
    br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
    pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = 14; }')
    pg.evaluate('() => { __perf.skip = true; __step(60); __perf.skip = false; }')
    cdp = ctx.new_cdp_session(pg)
    cdp.on('Tracing.dataCollected', lambda d: events.extend(d.get('value', [])))
    cdp.send('Tracing.start', { 'categories': 'devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing', 'options': 'sampling-frequency=10000' })
    heap0 = pg.evaluate('() => performance.memory ? performance.memory.usedJSHeapSize : 0')
    per = max(1, a.frames//len(PLAY)); marks = []
    for name, js in PLAY:
        pg.evaluate('(js) => { performance.mark("play:" + js.slice(0, 20)); if (js !== "null") new Function(js)(); }', js)
        for f in range(0, per, 5): pg.evaluate('() => { for (let k = 0; k < 5; k++){ performance.mark("f"); __step(1); } }')   # (plain frames, drawn: no captures, which allocate on their own)
        marks.append(name)
    heap1 = pg.evaluate('() => performance.memory ? performance.memory.usedJSHeapSize : 0')
    cdp.send('Tracing.end'); pg.wait_for_timeout(2000)
    try:
        while True: cdp.send('Tracing.getCategories'); break
    except Exception: pass
    br.close()
srv.shutdown()
# main-thread pauses only: MajorGC and MinorGC are the stops of the page's thread; the V8.GC_MC_BACKGROUND_* work runs on other threads and doesn't pause the game
pauses = [e for e in events if e.get('ph') == 'X' and e.get('name') in ('MajorGC', 'MinorGC')]
slices = [e for e in events if e.get('ph') == 'X' and e.get('name') == 'V8.GCIncrementalMarking']
ms = lambda e: e.get('dur', 0)/1000.0
print('scene %s, %d frames of play (%s)' % (a.scene, a.frames, ', '.join(marks)))
for nm in ('MajorGC', 'MinorGC'):
    L = [ms(e) for e in pauses if e['name'] == nm]
    print('  %-8s pauses: %3d   total %6.1f ms   longest %5.1f ms   over 4 ms: %d' % (nm, len(L), sum(L), max(L or [0]), sum(1 for x in L if x > 4)))
L = [ms(e) for e in slices]; print('  incremental marking slices on the main thread: %d, total %.1f ms, longest %.1f ms' % (len(L), sum(L), max(L or [0])))
print('  JS heap: %.0f MB at the start, %.0f MB at the end (before a collection)' % (heap0/1e6, heap1/1e6))
print('  (a MajorGC pause grows with the heap: the whole live heap is marked; building allocates, which is what triggers them)')
print('page errors:', errs[:2] or 'none')
