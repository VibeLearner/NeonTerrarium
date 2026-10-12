#!/usr/bin/env python3
"""The end of a turn, on this machine, in its own Chrome at the screen's full size: the frame times through a fling (Q, or a drag let go) and
especially the frames where it stops, with the picture after the turn drawn the new way (the view first, the ring after) and the old way (whole).
   python3 tools/perf/turn_check.py [--storage mycity.json] [--scene dense] [--hour 22] [--turns 4]
About a minute. Keep the Chrome window in front and don't touch it. Prints, per setup, the worst frame of each turn, the frame where the view came
to rest, and the frames just after it."""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

ap = argparse.ArgumentParser()
ap.add_argument('--scene', default='dense'); ap.add_argument('--hour', type=float, default=22); ap.add_argument('--turns', type=int, default=4)
ap.add_argument('--width', type=int, default=1710); ap.add_argument('--height', type=int, default=876); ap.add_argument('--zoom', type=float, default=20); ap.add_argument('--lines', type=int, default=720); ap.add_argument('--zoomres', default='1')
ap.add_argument('--storage', help='a JSON file of the game\'s saved data (your own city)')
ap.add_argument('--drag', action='store_true', help='a drag-and-release fling with the mouse (as played) instead of a key turn')
a = ap.parse_args()

def open_page(br, url, scene):
    ctx = br.new_context(viewport={'width': a.width, 'height': a.height}, device_scale_factor=2)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = dict(scene.get('storage', {})); st['neonIsland.zoomRes'] = str(a.zoomres); st['neonIsland.autoPerf'] = '0'; st['neonIsland.renderLines'] = str(a.lines); st['neonIsland.idleRest'] = '0'
    pg.add_init_script('window.__uuidRand = window.__uuidRand || Math.random; (() => { try { if (!sessionStorage.getItem("fpsInit")) { localStorage.clear(); const s = ' + json.dumps(st) + '; for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem("fpsInit", "1"); } } catch (e) {} })();')
    pg.goto('http://127.0.0.1:%d%s' % (H.PORT, url))
    pg.wait_for_function('() => { try { return typeof frame === "function" && !!PH && !!renderer; } catch (e) { return false; } }', timeout=120000)
    pg.wait_for_timeout(6000)
    pg.evaluate('([h, z]) => { S.cycle = false; S.hour = h; S.rain = false; zoomT = z; zoom = z; }', [a.hour, a.zoom])
    pg.wait_for_timeout(5000)
    return ctx, pg, errs

# one fling: a quarter turn by key, the frame times recorded until the view has been still for a second
TURN = '''(whole) => new Promise(res => { PH.tests.wholeAfterTurn = whole; if (!PH.on) PH.toggle(); PH.traceStart(); const T = [], S0 = []; let last = performance.now(), still = 0, stopAt = -1;
  yawT += Math.PI/4;
  const f = t => { const dt = t - last; last = t; T.push(dt); S0.push(SC.state);
    const moving = Math.abs(yawT - yaw) > 1e-9; if (!moving && stopAt < 0) stopAt = T.length - 1;
    if (!moving) still += dt; else still = 0;
    if (still < 1000 && T.length < 600) requestAnimationFrame(f); else { const TRc = PH.traceStop(); if (PH.on) PH.toggle(); res({ T, S0, stopAt, TR: TRc }); } };
  requestAnimationFrame(f); })'''
# the trace runs one frame ahead of the timing (a frame's laps are recorded as it is drawn; its time is the gap to the next): the frame k of T is trace k
def worst_frames(d, n=3):
    T, TR = d['T'], d['TR'] or []
    idx = sorted(range(1, len(T)), key=lambda k: -T[k])[:n]
    out = []
    for k in idx:
        if T[k] < 14: continue
        tr = TR[k - 1] if k - 1 < len(TR) else None
        if not tr: out.append('    %.1f ms at frame %d: no trace' % (T[k], k)); continue
        laps = sorted(tr['laps'], key=lambda x: -x[1])[:5]
        gpu = lambda j: (TR[j].get('gpu') if 0 <= j < len(TR) and TR[j].get('gpu') is not None else None)
        gpus = ' '.join('-' if gpu(j) is None else '%.1f' % gpu(j) for j in range(k - 4, k + 2))
        gb = sorted(tr.get('gpuBy') or [], key=lambda x: -x[1])[:3]
        out.append('    %.1f ms at frame %d (%s): script %s ms, sent to the card %s KB, programs linked %s, resources freed %s (%s KB); biggest: %s' % (T[k], k, 'turning' if k <= d['stopAt'] else 'at rest', tr.get('js'), tr.get('up'), tr.get('links'), tr.get('dels'), tr.get('freed'), ', '.join('%s %.1f' % (nm.strip(), ms) for nm, ms in laps)))
        out.append('        the card, frames %d to %d: %s ms%s' % (k - 4, k + 1, gpus, ('; this frame mostly ' + ', '.join('%s %.1f' % (n, ms) for n, ms in gb)) if gb else ''))
    return out

# a drag fling: the mouse pressed on the sky, swept across quickly, let go; the frames from the release until the view has rested a second
DRAG_START = '''(whole) => { PH.tests.wholeAfterTurn = whole; if (!PH.on) PH.toggle(); PH.traceStart(); window.__T = []; window.__S0 = []; window.__last = performance.now(); window.__stopAt = -1; window.__still = 0; window.__rec = false; window.__done = null;
  const f = t => { const dt = t - window.__last; window.__last = t; if (window.__rec){ window.__T.push(dt); window.__S0.push(SC.state);
    const moving = Math.abs(yawT - yaw) > 1e-9; if (!moving && window.__stopAt < 0) window.__stopAt = window.__T.length - 1; if (!moving) window.__still += dt; else window.__still = 0;
    if (window.__still >= 1000 || window.__T.length >= 600){ const TRc = PH.traceStop(); if (PH.on) PH.toggle(); window.__done = { T: window.__T, S0: window.__S0, stopAt: window.__stopAt, TR: TRc }; return; } }
    requestAnimationFrame(f); };
  requestAnimationFrame(f); }'''
def drag_turn(pg, whole):
    pg.evaluate(DRAG_START, whole)
    cx, cy = a.width*.62, a.height*.18   # (near the top, right of the middle: sky, clear of the overlay and the speed bar, so the drag turns the view and never paints)
    pg.mouse.move(cx, cy); pg.mouse.down()
    for k in range(1, 9): pg.mouse.move(cx - k*12, cy, steps=1); pg.wait_for_timeout(16)
    for k in range(1, 5): pg.mouse.move(cx - 96 - k*45, cy, steps=1); pg.wait_for_timeout(8)   # (a quick flick at the end: the view lags behind and flings on)
    pg.evaluate('window.__rec = true')
    pg.mouse.up()
    pg.wait_for_function('window.__done !== null', timeout=30000)
    return pg.evaluate('window.__done')

from playwright.sync_api import sync_playwright
if not os.environ.get('PERF_SOFTWARE'): os.environ['PERF_GPU'] = '1'
sc = H.load_scenes([a.scene])[0]
if a.storage: sc = dict(sc); sc['storage'] = json.load(open(a.storage)); a.scene = 'your city (' + os.path.basename(a.storage) + ')'
srv = H.serve(); url = H.make_site('turn', None)
out = {}
with sync_playwright() as pw:
    br = H.launch(pw)
    ctx, pg, errs = open_page(br, url, sc)
    print('render size:', pg.evaluate('() => W + "x" + H'), flush=True)
    turn = (lambda whole: drag_turn(pg, whole)) if a.drag else (lambda whole: pg.evaluate(TURN, whole))
    turn(False); pg.wait_for_timeout(1500)   # (a warm-up turn)
    for r in range(a.turns):
        for label, whole in [('new: the view first, the ring after', False), ('before: the whole picture at once', True)]:
            d = turn(whole); pg.wait_for_timeout(1200)
            out.setdefault(label, []).append(d); print('turn %d, %s' % (r + 1, label), flush=True)
    ctx.close(); br.close()
srv.shutdown()

print('\nscene %s, hour %g, zoom %g%s: frame times in ms through each fling (the frame the view came to rest at, and the five after it; the worst of the turn in brackets)' % (a.scene, a.hour, a.zoom, ', drag and release' if a.drag else ''))
for label, L in out.items():
    print('\n' + label)
    for d in L:
        T, k = d['T'], d['stopAt']
        if k < 0: print('  (never came to rest)'); continue
        if a.drag: print('  frames from the release: %s' % ' '.join('%.1f' % x for x in T[:k + 1]))
        tail = T[k:k + 6]
        print('  stop frame %.1f   then %s   [worst of the turn %.1f, turning frames mean %.1f]   states: %s' % (tail[0], ' '.join('%.1f' % x for x in tail[1:]), max(T[1:]), sum(T[1:k + 1])/max(1, k), ' > '.join(dict.fromkeys(d['S0'][max(0, k - 1):k + 6]))))
        for line in worst_frames(d): print(line)
print('\n(the first frame at rest is where the picture is drawn again after the turn. A frame over about 33 ms is a visible hitch at 60 Hz. Under each turn: its slowest frames, with the parts\nof the frame that took longest (processor time). "script" is the whole frame\'s processor time; "the card" is the graphics card\'s own time per frame (timer queries), for the frames before and after too:\nif the card\'s frames before a slow one run long, the processor was made to wait for it, and the slow part named is only where the wait landed.)')
