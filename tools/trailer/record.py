#!/usr/bin/env python3
"""Record the Neon Terrarium trailer: 1920 x 1080, 60 fps, 45 s, with Bytes and the coast sounds laid in.

Runs on your own Mac (it needs the graphics card). It serves this folder, opens the game at #trailer in Chrome
with a stepped clock (tools/trailer/shim.js), waits while the trailer builds its city and warms up, then captures
every frame in turn and hands them to ffmpeg. Because time only moves when a frame is captured, nothing is
dropped or rushed however slow a frame is to draw.

    python3 tools/trailer/record.py                     # the whole film -> tools/trailer/out/neon-terrarium-trailer.mp4
    python3 tools/trailer/record.py --stills            # a contact sheet's worth of stills only (quick look)
    python3 tools/trailer/record.py --until 12          # just the first 12 seconds

Needs: pip install playwright && python3 -m playwright install chromium  (it uses Google Chrome if installed), and ffmpeg.
"""
import argparse, base64, functools, http.server, json, os, shutil, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
LEN, FPS = 45.0, 60
STILLS = [0.5, 5, 9.2, 11.5, 13.8, 16.5, 18.6, 20.4, 22.6, 25, 27.4, 29.6, 31.8, 34.5, 38, 42.4]


def serve(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def launch(pw, headless):
    args = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars']
    try:
        return pw.chromium.launch(channel='chrome', headless=headless, args=args)
    except Exception as e:
        print('Google Chrome not found, using Playwright\'s Chromium:', str(e).splitlines()[0])
        return pw.chromium.launch(headless=headless, args=args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(OUT, 'neon-terrarium-trailer.mp4'))
    ap.add_argument('--until', type=float, default=LEN, help='stop after this many seconds')
    ap.add_argument('--stills', action='store_true', help='only save stills at key moments (PNG) and stop')
    ap.add_argument('--headless', action='store_true', help='no browser window (some Macs draw WebGL slower or not at all headless)')
    ap.add_argument('--port', type=int, default=8793)
    ap.add_argument('--quality', type=int, default=95, help='JPEG quality of the captured frames before encoding')
    ap.add_argument('--crf', type=int, default=16)
    a = ap.parse_args()
    if not shutil.which('ffmpeg') and not a.stills: sys.exit('ffmpeg is needed: brew install ffmpeg')
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    srv = serve(a.port)
    with sync_playwright() as pw:
        browser = launch(pw, a.headless)
        ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
        ctx.add_init_script(path=os.path.join(HERE, 'shim.js'))
        page = ctx.new_page()
        # frames are taken straight from Chrome's compositor: Playwright's own screenshot resets the page size around every shot in a
        # visible window, which the game took for a resize and redrew at the other size (the picture flicked between full and a corner)
        cdp = ctx.new_cdp_session(page)
        def grab(fmt='jpeg'):
            o = {'format': fmt, 'fromSurface': True, 'captureBeyondViewport': False}
            if fmt == 'jpeg': o['quality'] = a.quality
            return base64.b64decode(cdp.send('Page.captureScreenshot', o)['data'])
        page.on('console', lambda m: print('  page:', m.text) if m.text.startswith('[trailer]') or m.type == 'error' else None)
        page.on('pageerror', lambda e: print('  page error:', e))
        page.on('crash', lambda *_: print('  the page crashed (the graphics process may have run out of memory)'))
        url = f'http://127.0.0.1:{a.port}/index.html#trailer'
        navs = []
        page.on('framenavigated', lambda fr: (navs.append(fr.url), print('  the page navigated to', fr.url)) if fr == page.main_frame and navs is not None else None)
        page.goto(url, wait_until='load'); navs.clear()

        def ev(js):
            # the page can be reloaded under us (it should not be): say where it went, wait for it, and carry on
            for attempt in range(4):
                try: return page.evaluate(js)
                except Exception as e:
                    if 'context was destroyed' not in str(e) and 'navigation' not in str(e): raise
                    print(f'  page reloaded while running "{js[:40]}" (now at {page.url})')
                    if attempt == 3: sys.exit('the page keeps reloading; stopping. Last address: ' + page.url)
                    if '#trailer' not in page.url: page.goto(url, wait_until='load')
                    else: page.wait_for_load_state('load')
                    time.sleep(1)

        # setup: keep the clock moving (and give the page real time for its loading work) until it says it is ready
        t0, last = time.time(), ''
        while True:
            ev('__step(2)')
            st = ev('typeof TRAILER !== "undefined" ? TRAILER.state() : null') or {}
            fail = ev('typeof TRAILER !== "undefined" && TRAILER.failed')
            if fail: sys.exit('the trailer could not set up: ' + str(fail) + '\n' + '\n'.join(st.get('log', [])))
            if st.get('stage') != last: last = st.get('stage'); print(f'[{time.time() - t0:5.1f}s] {last}')
            if st.get('ready'): break
            if time.time() - t0 > 900: sys.exit('setup took over 15 minutes; last stage: ' + str(last))
            time.sleep(.015)
        print('ready:', json.dumps(st.get('info')))
        ev('TRAILER.start()')

        frames = int(round(min(a.until, LEN)*FPS))
        enc = None
        if a.stills:
            want = sorted(int(round(s*FPS)) for s in STILLS if s <= a.until)
            sd = os.path.join(OUT, 'stills'); os.makedirs(sd, exist_ok=True)
        else:
            raw = os.path.splitext(a.out)[0] + '.video.mp4'
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                                    '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-r', str(FPS), raw],
                                   stdin=subprocess.PIPE)
        t1 = time.time()
        for f in range(frames):
            ev('__step(1)')
            if a.stills:
                if f in want:
                    p = os.path.join(sd, f'{f/FPS:05.2f}s.png'); open(p, 'wb').write(grab('png')); print('still', os.path.relpath(p, ROOT))
                continue
            enc.stdin.write(grab())
            if f % FPS == 0:
                el = time.time() - t1; eta = el/(f + 1)*(frames - f - 1)
                print(f'  {f/FPS:4.0f}s of {frames/FPS:.0f}s   ({el:4.0f}s elapsed, about {eta/60:.1f} min to go)')
        st = ev('TRAILER.state()')
        browser.close()
    srv.shutdown()
    log = os.path.join(OUT, 'trailer-log.txt')
    with open(log, 'w') as fh: fh.write(json.dumps(st.get('info'), indent=1) + '\n' + '\n'.join(st.get('log', [])) + '\n')
    if a.stills: print('stills in', os.path.relpath(sd, ROOT)); return
    enc.stdin.close(); enc.wait()

    # the sound: Bytes from the top, the coast flash at 19.0 s, faded out over the last 1.8 s
    music = os.path.join(ROOT, 'assets', 'audio', 'music', 'Bytes.mp3')
    sfx = os.path.join(ROOT, 'assets', 'audio', 'trailer', 'coast_flash.wav')
    dur = frames/FPS
    fade = f',afade=t=out:st={dur - 1.8:.2f}:d=1.8' if dur >= LEN - .01 else ''
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-i', music, '-i', sfx, '-filter_complex',
                    f'[2:a]adelay=19000|19000,volume=0.9[s];[1:a]atrim=0:{dur:.3f}[m];[m][s]amix=inputs=2:normalize=0:duration=first{fade}[a]',
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', a.out], check=True)
    os.remove(raw)
    print('done:', os.path.relpath(a.out, ROOT), f'({(time.time() - t1)/60:.1f} min of capture)')


if __name__ == '__main__':
    main()
