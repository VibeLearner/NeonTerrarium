#!/usr/bin/env python3
"""Profiles the title screen on this machine's real graphics card and writes a report for diagnosis.

  python3 tools/title/perf.py

A Chrome window opens for about four minutes: leave it alone (don't cover or minimise it, or the browser slows the
page down on purpose). It goes through the title screen's states (loading with the shutter shut, shut at night, open by
day, open at night) and, in each, measures the frame rate, then switches parts off one at a time (the city behind the
porthole, the room's lighting, the plants and lamp, the shutter, the effects, the CSS filters, the sway, ...) to see
which part the time goes to. Last it waits for the graphics card after each part, to time the card's own work.

It writes tools/title/perf-report.json (and prints a short summary). Needs: pip3 install playwright.
"""
import functools, http.server, json, os, platform, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'perf-report.json')
PORT = 8798
SECS = float(os.environ.get('PERF_SECS', '5'))

# in the page: every frame's gap, and any long stall on the main thread
PROBE = """(() => {
  const P = window.__probe = { gaps: [], long: [], on: false, last: 0 };
  (function f(t){ if (P.on && P.last) P.gaps.push(t - P.last); P.last = t; requestAnimationFrame(f); })(performance.now());
  try { new PerformanceObserver(l => { if (P.on) for (const e of l.getEntries()) P.long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();"""

# parts the page can switch off; the CSS ones are a style rule
CSS = {
  'css-filters': '.t-layer,.t-live,.t-rt,#tStage canvas{filter:none!important}',
  'stage-sway': '#tStage{translate:none!important;rotate:none!important;scale:none!important}',
  'blend-modes': '#title *{mix-blend-mode:normal!important}',
}


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=REPO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    report = {'machine': {'platform': platform.platform(), 'machine': platform.machine(), 'python': sys.version.split()[0]}, 'runs': []}
    with sync_playwright() as p:
        args = ['--ignore-gpu-blocklist', '--window-size=1470,920', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
        try: b = p.chromium.launch(channel='chrome', headless=False, args=args); report['machine']['browser'] = 'chrome'
        except Exception: b = p.chromium.launch(headless=False, args=args); report['machine']['browser'] = 'chromium'
        ctx = b.new_context(no_viewport=True)   # (the real window and the screen's own pixel density, as in normal play)
        ctx.add_init_script(PROBE)
        pg = ctx.new_page(); pg.set_default_timeout(0)
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:300]) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append('pageerror: ' + str(e)[:300]))
        pg.on('crash', lambda *_: print('THE PAGE CRASHED', flush=True))

        def say(s): print(s, flush=True)

        def measure(name, secs=SECS, sync=False):
            pg.evaluate('s => { TPERF.sync = s; TPERF.reset(); __probe.gaps = []; __probe.long = []; __probe.on = true; }', sync)
            time.sleep(secs)
            r = pg.evaluate("""() => { __probe.on = false; const g = __probe.gaps.slice().sort((a, b) => a - b), n = g.length, q = x => n ? g[Math.min(n - 1, Math.floor(x*n))] : 0, sum = g.reduce((a, b) => a + b, 0);
              const parts = {}; for (const k in TPERF.t) parts[k] = { avgMs: +(TPERF.t[k]/TPERF.n[k]).toFixed(2), perSec: +(TPERF.n[k]/(sum/1000)).toFixed(1), msPerSec: +(TPERF.t[k]/(sum/1000)).toFixed(1) };
              return { fps: n ? +(1000*n/sum).toFixed(1) : 0, frameMs: { p50: +q(.5).toFixed(1), p90: +q(.9).toFixed(1), p99: +q(.99).toFixed(1), max: +(g[n - 1] || 0).toFixed(1) }, over20ms: n ? +(g.filter(x => x > 20).length/n*100).toFixed(1) : 0, over50ms: g.filter(x => x > 50).length, longTasks: __probe.long.length, longTaskMs: __probe.long.reduce((a, b) => a + b, 0), parts, state: { OPEN: TITLE._perf().state.OPEN } }; }""")
            r['name'] = name; r['sync'] = sync; report['runs'].append(r)
            say('  %-34s %5.1f fps   p50 %5.1f ms  p90 %5.1f ms  max %6.1f ms   long tasks %d' % (name, r['fps'], r['frameMs']['p50'], r['frameMs']['p90'], r['frameMs']['max'], r['longTasks']))
            return r

        def ablate(prefix, offs=('city', 'rt', 'live', 'shutter', 'shutterGL', 'fx', 'sway', 'css-filters', 'stage-sway', 'blend-modes', 'rt:shafts', 'rt:bloom', 'rt:sunShadow', 'rt:lampShadow', 'all-title')):
            for k in offs:
                set_off(k, True); time.sleep(.8); measure(prefix + ' without ' + k); set_off(k, False); time.sleep(.5)

        def set_off(k, on):
            if k in CSS:
                pg.evaluate('([k, css, on]) => { let s = document.getElementById("perf-" + k); if (on && !s){ s = document.createElement("style"); s.id = "perf-" + k; s.textContent = css; document.head.appendChild(s); } if (!on && s) s.remove(); }', [k, CSS[k], on])
            elif k.startswith('rt:'):
                pg.evaluate('([k, on]) => { const R = TITLE._rt && TITLE._rt(); if (R) on ? R.off.add(k) : R.off.delete(k); }', [k[3:], on])
            elif k == 'all-title':
                for x in ('rt', 'live', 'shutter', 'fx', 'sway'): pg.evaluate('([k, on]) => on ? TPERF.off.add(k) : TPERF.off.delete(k)', [x, on])
            else:
                pg.evaluate('([k, on]) => on ? TPERF.off.add(k) : TPERF.off.delete(k)', [k, on])

        say('opening the title screen (a Chrome window: leave it be) ...')
        t0 = time.time()
        pg.goto('http://127.0.0.1:%d/index.html?title&perf' % PORT)
        pg.wait_for_function('window.TITLE && TITLE.on && window.TPERF', timeout=120000)
        pg.evaluate('TITLE._hold()')   # (keep the shutter shut while the city loads, as at a real start)
        report['gpu'] = pg.evaluate("""() => { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return null; const d = gl.getExtension('WEBGL_debug_renderer_info');
          return { vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) }; }""")
        report['ua'] = pg.evaluate('navigator.userAgent')
        say('1. while the city loads behind the shut shutter (the start of a real visit)')
        for i in range(4): measure('loading, shut (%ds)' % ((i + 1)*SECS))
        report['loadInfo'] = pg.evaluate('() => ({ loading: typeof LOADP !== "undefined" ? { on: LOADP.on, cool: LOADP.cool } : null, people: typeof pplReady !== "undefined" ? pplReady : null, secs: performance.now()/1000 })')
        # wait for the city to finish loading
        for _ in range(60):
            if pg.evaluate('() => { try { return !LOADP.on && !(LOADP.cool > 0) && (typeof pplReady === "undefined" || pplReady); } catch (e) { return true; } }'): break
            time.sleep(1)
        report['loadedAfterSecs'] = round(time.time() - t0, 1)
        report['info_shut'] = pg.evaluate('TITLE._perf()')

        say('2. shut, the city loaded, at night (the lamps on)')
        pg.evaluate('TITLE._hour(23)'); time.sleep(1.5)
        measure('shut night')
        ablate('shut night', ('city', 'rt', 'live', 'shutter', 'shutterGL', 'fx', 'sway', 'css-filters', 'stage-sway', 'blend-modes', 'rt:lampShadow', 'rt:bloom', 'all-title'))
        pg.evaluate('TITLE._hour(13)'); time.sleep(1.5)
        measure('shut day')

        say('3. opening the shutter')
        pg.evaluate('TITLE._open()'); measure('opening', 3.4)
        time.sleep(1.5)
        report['info_open'] = pg.evaluate('TITLE._perf()')

        say('4. open, by day, the sun straight in')
        pg.evaluate('TITLE._hour(13); TITLE._sunH = 0'); time.sleep(1.5)
        measure('open day')
        ablate('open day')
        say('5. open, at night')
        pg.evaluate('TITLE._hour(23); TITLE._sunH = 0'); time.sleep(1.5)
        measure('open night')
        ablate('open night', ('city', 'rt', 'live', 'rt:lampShadow', 'rt:shafts', 'rt:bloom', 'rt:sunShadow', 'css-filters', 'stage-sway', 'all-title'))
        say('6. timing the graphics card (each part waits for the card to finish: slower overall, but it shows where the card\'s time goes)')
        pg.evaluate('TITLE._hour(13)'); time.sleep(1); measure('GPU-timed open day', sync=True)
        pg.evaluate('TITLE._hour(23)'); time.sleep(1); measure('GPU-timed open night', sync=True)
        pg.evaluate('TPERF.every = 0'); time.sleep(.5); measure('open night, lighting every frame')
        pg.evaluate('TPERF.every = 33')
        report['logs'] = logs[:80]
        try:
            g = ctx.new_page(); g.goto('chrome://gpu'); time.sleep(2)
            report['chromeGpu'] = g.inner_text('body')[:12000]
        except Exception as e: report['chromeGpu'] = 'n/a: ' + str(e)[:200]
        b.close()
    srv.shutdown()
    with open(OUT, 'w') as f: json.dump(report, f, indent=1)
    print('\nwrote', OUT)


if __name__ == '__main__':
    main()
