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
        out.append('    %.1f ms at frame %d (%s): script %s ms, sent to the card %s KB; biggest: %s' % (T[k], k, 'turning' if k <= d['stopAt'] else 'at rest', tr.get('js'), tr.get('up'), ', '.join('%s %.1f' % (nm.strip(), ms) for nm, ms in laps)))
    return out

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
    pg.evaluate(TURN, False); pg.wait_for_timeout(1500)   # (a warm-up turn)
    for r in range(a.turns):
        for label, whole in [('new: the view first, the ring after', False), ('before: the whole picture at once', True)]:
            d = pg.evaluate(TURN, whole); pg.wait_for_timeout(1200)
            out.setdefault(label, []).append(d); print('turn %d, %s' % (r + 1, label), flush=True)
    ctx.close(); br.close()
srv.shutdown()

print('\nscene %s, hour %g, zoom %g: frame times in ms through each fling (the frame the view came to rest at, and the five after it; the worst of the turn in brackets)' % (a.scene, a.hour, a.zoom))
for label, L in out.items():
    print('\n' + label)
    for d in L:
        T, k = d['T'], d['stopAt']
        if k < 0: print('  (never came to rest)'); continue
        tail = T[k:k + 6]
        print('  stop frame %.1f   then %s   [worst of the turn %.1f, turning frames mean %.1f]   states: %s' % (tail[0], ' '.join('%.1f' % x for x in tail[1:]), max(T[1:]), sum(T[1:k + 1])/max(1, k), ' > '.join(dict.fromkeys(d['S0'][max(0, k - 1):k + 6]))))
        for line in worst_frames(d): print(line)
print('\n(the first frame at rest is where the picture is drawn again after the turn. A frame over about 33 ms is a visible hitch at 60 Hz. Under each turn: its slowest frames, with the parts\nof the frame that took longest (processor time; the graphics card\'s time is not in these). "script" is the whole frame\'s processor time: a slow frame with little script time waited on the card or the browser.)')
