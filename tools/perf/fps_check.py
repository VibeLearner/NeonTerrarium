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
ap.add_argument('--scene', default='dense'); ap.add_argument('--hour', type=float, default=22); ap.add_argument('--secs', type=float, default=10)
ap.add_argument('--width', type=int, default=1710); ap.add_argument('--height', type=int, default=876); ap.add_argument('--zoom', type=float, default=30)
a = ap.parse_args()

PASSES = ['color', 'night lights', 'clouds', 'soft effects (half resolution)', 'composite', 'bloom and grade']

def open_page(br, url, scene, init=''):
    ctx = br.new_context(viewport={'width': a.width, 'height': a.height}, device_scale_factor=2)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    st = dict(scene.get('storage', {})); st['neonIsland.capRes'] = '0'; st['neonIsland.autoPerf'] = '0'
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
os.environ['PERF_GPU'] = '1'
sc = H.load_scenes([a.scene])[0]
srv = H.serve(); url = H.make_site('fps', None)
rows = []
with sync_playwright() as pw:
    br = H.launch(pw)
    ctx, pg, errs = open_page(br, url, sc)
    for label, s, b in [('now (all changes on)', False, False), ('soft effects: three passes (before)', True, False), ('now + cache copied by blitting', False, True)]:
        setup(pg, s, b); f = fps(pg); e = exact(pg, s, b)
        rows.append((label, f, e)); print('measured:', label, flush=True)
    ctx.close()
    ctx, pg, errs2 = open_page(br, url, sc, 'window.__CANVAS_ALPHA = true;')
    f = fps(pg); rows.append(('see-through canvas (before)', f, {})); print('measured: see-through canvas', flush=True)
    ctx.close(); br.close()
srv.shutdown()

print()
print('scene %s, render %s, hour %g, zoom %g   (FPS: overlay closed, vsync off; pass times: exact, in ms)' % (a.scene, rows[0][2].get('render', '?'), a.hour, a.zoom))
for label, f, e in rows:
    print('\n%s\n  FPS %.1f   worst frame %.1f ms' % (label, f['fps'], f['worst']))
    if e: print('  ' + '   '.join('%s %s' % (n.split(' (')[0], '%.1f' % e[n] if e.get(n) is not None else '-') for n in PASSES + ['all passes']))
print('\npage errors: %s' % ((errs + errs2)[:2] or 'none'))
