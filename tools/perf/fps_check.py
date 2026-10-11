#!/usr/bin/env python3
"""Real frame rate on this machine, in its own Google Chrome on its real graphics card, at the screen's full Retina size, with the pass-merging changes on
and off. One command, about 3 minutes; keep the Chrome window that opens in front and don't touch it.
   python3 tools/perf/fps_check.py [--scene dense] [--hour 22] [--secs 10] [--width 1710 --height 876]
(--width/--height are the window's size in points; at 2x that is 3420 x 1752, the size the owner plays at.)
For each setup: frames a second over --secs with the overlay closed (no exact timing, so it's the frame rate you'd see playing, with vsync off so it
can go past 60), then the exact pass times (F3, exact timing) for the main passes.
Setups: now (everything on); soft effects as three passes (PH.tests.softApart); the cache copied by blitting (PH.tests.copyByBlit); and, in a second page,
the see-through canvas as before (window.__CANVAS_ALPHA)."""
import argparse, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

ap = argparse.ArgumentParser()
ap.add_argument('--scene', default='dense'); ap.add_argument('--hour', type=float, default=22); ap.add_argument('--secs', type=float, default=8)
ap.add_argument('--width', type=int, default=1710); ap.add_argument('--height', type=int, default=876); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--lines', type=int, default=720); ap.add_argument('--rounds', type=int, default=2)
ap.add_argument('--storage', help='a JSON file of the game\'s saved data (your own city): in the game\'s tab, open the console and run  copy(JSON.stringify(localStorage))  then paste into a file')
ap.add_argument('--now-only', action='store_true', help='measure only the game as it is (about a minute)')
a = ap.parse_args()

PASSES = ['color', 'night lights', 'clouds', 'soft effects (half resolution)', 'composite', 'bloom and grade']

def open_page(br, url, scene, init=''):
    ctx = br.new_context(viewport={'width': a.width, 'height': a.height}, device_scale_factor=2)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = dict(scene.get('storage', {})); st['neonIsland.capRes'] = '0'; st['neonIsland.autoPerf'] = '0'; st['neonIsland.renderLines'] = str(a.lines)   # (the owner's settings: 720p, both Optimize framerate boxes off)
    import json
    # (the harness's copy of three takes its ids from window.__uuidRand, which the harness's own setup gives it; here ordinary random ids are fine)
    pg.add_init_script('window.__uuidRand = window.__uuidRand || Math.random; (() => { try { if (!sessionStorage.getItem("fpsInit")) { localStorage.clear(); const s = ' + json.dumps(st) + '; for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem("fpsInit", "1"); } } catch (e) {} })();' + init)
    pg.goto('http://127.0.0.1:%d%s' % (H.PORT, url))
    try:
        pg.wait_for_function('() => { try { return typeof frame === "function" && !!PH && !!renderer; } catch (e) { return false; } }', timeout=120000)
    except Exception:
        print('the game did not start; page errors:', errs[:5]); raise
    pg.wait_for_timeout(6000)
    pg.evaluate('([h, z]) => { S.cycle = false; S.hour = h; S.rain = false; zoomT = z; zoom = z; }', [a.hour, a.zoom])
    pg.wait_for_timeout(4000)   # (the cache is drawn, the view settles)
    return ctx, pg, errs

def fps(pg):
    return pg.evaluate('''(secs) => new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
      const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < secs*1000) requestAnimationFrame(f); else res({ fps: n*1000/(t - t0), worst }); };
      requestAnimationFrame(f); })''', a.secs)

def exact(pg, s, b):   # (exact mode resets the tests, so they are set again once it is on)
    pg.evaluate('([s, b]) => { if (!PH.on) PH.toggle(); PH.setExact(true); PH.tests.softApart = s; PH.tests.copyByBlit = b; }', [s, b])
    pg.wait_for_timeout(int(a.secs*1000))
    txt = pg.evaluate('() => PH.text()')
    pg.evaluate('() => { PH.setExact(false); if (PH.on) PH.toggle(); }')
    out = {}
    for name in PASSES:
        m = re.search(r'^' + re.escape(name) + r'\s+[\d.]+\s+([\d.]+)', txt, re.M)
        out[name] = float(m.group(1)) if m else None
    m = re.search(r'all passes, exact ([\d.]+) ms', txt); out['all passes'] = float(m.group(1)) if m else None
    m = re.search(r'render (\d+x\d+)', txt); out['render'] = m.group(1) if m else '?'
    return out

def setup(pg, soft_apart=False, blit=False):
    pg.evaluate('([s, b]) => { PH.tests.softApart = s; PH.tests.copyByBlit = b; }', [soft_apart, blit])
    pg.wait_for_timeout(1500)

from playwright.sync_api import sync_playwright
if not os.environ.get('PERF_SOFTWARE'): os.environ['PERF_GPU'] = '1'   # (PERF_SOFTWARE=1: the software renderer, only to check the script runs)
sc = H.load_scenes([a.scene])[0]
if a.storage:
    import json as _j
    sc = dict(sc); sc['storage'] = _j.load(open(a.storage)); a.scene = 'your city (' + os.path.basename(a.storage) + ')'
srv = H.serve(); url = H.make_site('fps', None)
rows = []
with sync_playwright() as pw:
    br = H.launch(pw)
    ctx, pg, errs = open_page(br, url, sc)
    print('render size:', pg.evaluate('() => W + "x" + H'), flush=True)
    setup(pg); fps(pg)   # (a warm-up: the card's clocks and caches settle, so the first setup isn't the slowest for that reason alone)
    setups = [('now (all changes on)', False, False)] + ([] if a.now_only else [('soft effects: three passes (before)', True, False), ('now + cache copied by blitting', False, True)])
    acc = {}
    for r in range(a.rounds):   # (the setups take turns, so a drift over the run falls on all of them alike)
        for label, s_, b in setups:
            setup(pg, s_, b); f = fps(pg); e = exact(pg, s_, b)
            acc.setdefault(label, []).append((f, e)); print('measured: %s (round %d)' % (label, r + 1), flush=True)
    for label, s_, b in setups:
        L = acc[label]; f = { 'fps': sum(x[0]['fps'] for x in L)/len(L), 'worst': max(x[0]['worst'] for x in L) }
        e = { k: (sum(x[1][k] for x in L if x[1].get(k) is not None)/len(L) if all(x[1].get(k) is not None for x in L) else None) for k in PASSES + ['all passes'] }; e['render'] = L[0][1].get('render')
        rows.append((label, f, e))
    ctx.close(); errs2 = []
    if not a.now_only:
        ctx, pg, errs2 = open_page(br, url, sc, 'window.__CANVAS_ALPHA = true;')
        setup(pg); fps(pg); F = [fps(pg) for _ in range(a.rounds)]
        rows.append(('see-through canvas (before)', { 'fps': sum(x['fps'] for x in F)/len(F), 'worst': max(x['worst'] for x in F) }, {})); print('measured: see-through canvas', flush=True)
        ctx.close()
    br.close()
srv.shutdown()

print()
print('scene %s, render %s, hour %g, zoom %g, %d rounds   (FPS: overlay closed, vsync off, the mean of the rounds; pass times: exact, in ms; exact timing makes\nevery pass wait for the card, so they add up to more than a real frame: compare them between setups, not with the FPS)' % (a.scene, rows[0][2].get('render', '?'), a.hour, a.zoom, a.rounds))
for label, f, e in rows:
    print('\n%s\n  FPS %.1f   worst frame %.1f ms' % (label, f['fps'], f['worst']))
    if e: print('  ' + '   '.join('%s %s' % (n.split(' (')[0], '%.1f' % e[n] if e.get(n) is not None else '-') for n in PASSES + ['all passes']))
print('\npage errors: %s' % ((errs + errs2)[:2] or 'none'))
