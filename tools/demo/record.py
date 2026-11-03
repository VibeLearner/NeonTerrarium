#!/usr/bin/env python3
"""Record the Neon Terrarium demo clip: 15 s, 1920 x 1080, 60 fps, with the game's own sound.

Runs on your own Mac (it needs the graphics card). Two passes, both at index.html?full#demo in headless Chrome (no window):
  1. the picture: the clip runs on a stepped clock (tools/demo/shim.js), every frame captured in turn, so nothing stutters or drops
  2. the sound: the clip plays again in real time (in a hidden browser) and everything the game sends to the speakers (the Grid's Booth loop, the two notes,
     the build sounds) is recorded straight from the game (tools/demo/audio.js).
Then the two are put together.

    python3 tools/demo/record.py --stills      # PNGs at the key moments only -> tools/demo/out/stills/
    python3 tools/demo/record.py --preview     # a quick 720p, 30 fps look
    python3 tools/demo/record.py               # the clip -> tools/demo/out/neon-terrarium-demo.mp4
    python3 tools/demo/record.py --vertical    # the clip, plus a 1080 x 1920 version for phones

Needs: pip3 install playwright && python3 -m playwright install chromium  (it uses Google Chrome if installed), and ffmpeg.
"""
import argparse, base64, functools, http.server, json, os, shutil, struct, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
FPS = 60
STILLS = [.8, 2.0, 3.2, 4.4, 5.6, 7.0, 8.2, 9.3, 10.2, 11.0, 12.2, 13.6, 14.7]


def serve(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
    class Server(http.server.ThreadingHTTPServer):
        def handle_error(self, request, address):
            if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)): return
            super().handle_error(request, address)
    srv = Server(('127.0.0.1', port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def launch(pw, headless, soft=False):
    args = (['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] if soft else []) + ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars']
    try:
        return pw.chromium.launch(channel='chrome', headless=headless, args=args)
    except Exception as e:
        print('Google Chrome not found, using Playwright\'s Chromium:', str(e).splitlines()[0])
        return pw.chromium.launch(headless=headless, args=args)


def log_page(page):
    page.on('console', lambda m: print('  page:', m.text[:1500]) if m.text.startswith(('[demo]', 'Furnish pod', 'PodContext', 'PodRender', '[lab')) or m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: print('  page error:', e))
    page.on('crash', lambda *_: print('  the page crashed (the graphics process may have run out of memory)'))


def wait_ready(ev, t0, limit=1500):
    last = ''
    while True:
        st = ev('typeof DEMO !== "undefined" ? DEMO.state() : null') or {}
        fail = ev('typeof DEMO !== "undefined" && DEMO.failed')
        if fail: sys.exit('the demo could not set up: ' + str(fail) + '\n' + '\n'.join(st.get('log', [])))
        if st.get('stage') != last: last = st.get('stage'); print(f'[{time.time() - t0:5.1f}s] {last}')
        if st.get('ready'): return st
        if time.time() - t0 > limit: sys.exit('setup took too long; last stage: ' + str(last))
        yield st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=None)
    ap.add_argument('--preview', action='store_true', help='a quick look: 30 fps, 1280 x 720 (the timing is the same as the real clip)')
    ap.add_argument('--stills', action='store_true', help='only save stills at key moments (PNG) and stop')
    ap.add_argument('--vertical', action='store_true', help='also make a 1080 x 1920 version for phones')
    ap.add_argument('--no-audio', action='store_true', help='skip the sound pass (the clip comes out silent)')
    ap.add_argument('--window', action='store_true', help='film the picture in a visible Chrome window instead of the headless browser (only if headless draws wrong on your Mac)')
    ap.add_argument('--port', type=int, default=8794)
    ap.add_argument('--quality', type=int, default=95)
    ap.add_argument('--crf', type=int, default=16)
    ap.add_argument('--nolab', action='store_true', help='checking only: leave the apartment out')
    ap.add_argument('--test', action='store_true', help='for checking on a machine without a graphics card: a small 640 x 360 picture at 30 fps, software drawing, no sound')
    a = ap.parse_args()
    global FPS
    VW, VH = 1920, 1080
    DSF = 1
    if a.test: VW, VH, DSF, FPS, a.no_audio = 1920, 1080, .5, 30, True   # (the desktop layout of every panel, drawn at half the pixels)
    a.out = a.out or os.path.join(OUT, 'neon-terrarium-demo' + ('-test' if a.test else '-preview' if a.preview else '') + '.mp4')
    if not shutil.which('ffmpeg') and not a.stills: sys.exit('ffmpeg is needed: brew install ffmpeg')
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    srv = serve(a.port)
    url = f'http://127.0.0.1:{a.port}/index.html?full#demo'
    with sync_playwright() as pw:
        # ---------- 1. the picture ----------
        def open_page(headless):
            browser = launch(pw, headless, soft=a.test)
            ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DSF)
            ctx.add_init_script(script=f'window.__DM_FPS = {FPS};' + ('window.__DM_NOLAB = true;' if a.nolab else '') + ('window.__DM_TEST = true;' if a.test else ''))
            ctx.add_init_script(path=os.path.join(HERE, 'shim.js'))
            page = ctx.new_page(); cdp = ctx.new_cdp_session(page); log_page(page)
            page.goto(url, wait_until='load')
            return browser, page, cdp
        # headless by default: the page is exactly 1920 x 1080 whatever the screen, and nothing on the desktop can get in the way
        a.headless = not a.window
        browser, page, cdp = open_page(a.headless)
        def grab(fmt='jpeg', quality=None):
            o = {'format': fmt, 'fromSurface': True, 'captureBeyondViewport': False}
            if fmt == 'jpeg': o['quality'] = quality or a.quality
            return base64.b64decode(cdp.send('Page.captureScreenshot', o)['data'])
        # (--window: a screen too small for a 1920 x 1080 window (a MacBook's) clips it, and the frames would be its top-left part stretched,
        # everything off center. Then it goes headless after all. A Retina window at twice the pixels is fine.)
        if not a.headless:
            png = grab('png'); w, h = struct.unpack('>II', png[16:24])
            if (w, h) != (int(VW*DSF), int(VH*DSF)) and not (w % 1920 == 0 and h % 1080 == 0 and w//1920 == h//1080):
                print(f'  the browser window only shows {w} x {h} of the 1920 x 1080 picture: filming without a window instead, so nothing is off center')
                browser.close(); a.headless = True
                browser, page, cdp = open_page(True)
        ev = page.evaluate
        t0 = time.time()
        for _ in wait_ready(ev, t0, 14400 if a.test else 1500):
            ev(f'__step(2, {1000/FPS})'); time.sleep(.01)
        st = ev('DEMO.state()')
        print('ready:', json.dumps(st.get('info')))
        if not ev('DEMO.start()'): sys.exit('the clip would not start')
        length = float(st.get('len') or 15)
        frames = int(round(length*FPS)); every = 2 if a.preview else 1
        enc = None
        if a.stills:
            want = sorted(int(round(s*FPS)) for s in STILLS if s < length)
            sd = os.path.join(OUT, 'stills'); os.makedirs(sd, exist_ok=True)
        else:
            raw = os.path.splitext(a.out)[0] + '.video.mp4'
            size, fps = ('1280:720', FPS//2) if a.preview else (f'{VW}:{VH}', FPS)
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-c:v', 'mjpeg', '-i', '-',
                                    '-vf', f'scale={size}:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf + (5 if a.preview else 0)),
                                    '-pix_fmt', 'yuv420p', '-r', str(fps), raw], stdin=subprocess.PIPE)
        t1 = time.time()
        # one picture per frame the film draws: while it holds (the apartment lab still working) the clock steps on and no picture is taken
        held_steps = 0
        for f in range(frames):
            d0 = ev('DEMO.drawn'); n = 0
            while True:
                ev(f'__step(1, {1000/FPS})')
                if ev('DEMO.drawn') != d0: break
                n += 1; held_steps += 1; time.sleep(.004)
                if n % 600 == 0: print(f'  the film is holding for the apartment lab ({n} steps so far): ' + str(ev('DEMO.state().info.wait')))
            if n > 2: print(f'  at {f/FPS:.2f}s the film held {n} steps for the lab')
            if a.stills:
                if f in want:
                    p = os.path.join(sd, f'{f/FPS:05.2f}s.png'); open(p, 'wb').write(grab('png')); print('still', os.path.relpath(p, ROOT))
                continue
            if f % every: continue
            enc.stdin.write(grab(**({'quality': 80} if a.preview else {})))
            if f % FPS == 0:
                el = time.time() - t1; eta = el/(f + 1)*(frames - f - 1)
                print(f'  {f/FPS:4.0f}s of {length:.0f}s   ({el:4.0f}s elapsed, about {eta/60:.1f} min to go)')
        st = ev('DEMO.state()')
        browser.close()
        st['info']['heldSteps'] = held_steps
        with open(os.path.join(OUT, 'demo-log.txt'), 'w') as fh: fh.write(json.dumps(st.get('info'), indent=1) + '\n' + '\n'.join(st.get('log', [])) + '\n')
        if a.stills:
            srv.shutdown(); print('stills in', os.path.relpath(sd, ROOT), '(and what happened when in tools/demo/out/demo-log.txt)'); return
        enc.stdin.close(); enc.wait()

        # ---------- 2. the sound ----------
        tracks = []
        if not a.no_audio:
            print('the sound: playing the clip again in real time, in a hidden browser, recording what the game plays')
            try:
                browser = launch(pw, True)
                ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
                ctx.add_init_script(path=os.path.join(HERE, 'audio.js'))
                page = ctx.new_page(); log_page(page); page.goto(url, wait_until='load')
                t0 = time.time()
                for _ in wait_ready(page.evaluate, t0): time.sleep(.25)
                while not page.evaluate('DEMO.state().done'):
                    if time.time() - t0 > 2400: raise RuntimeError('the clip never finished')
                    time.sleep(.2)
                recs = page.evaluate('__dmStop()')
                browser.close()
                for k, r in enumerate(recs):
                    p = os.path.join(OUT, f'demo-audio-{k}.webm'); open(p, 'wb').write(base64.b64decode(r['data'])); tracks.append((p, r['at']/1000))
                print('  recorded', len(tracks), 'sound track(s)')
            except Exception as e:
                print('  the sound pass failed (the clip will be silent):', e)
    srv.shutdown()
    if tracks:
        ins, chains, mix = ['-i', raw], [], ''
        for k, (p, at) in enumerate(tracks):
            ins += ['-i', p]; ms = int(round(at*1000))
            chains.append(f'[{k + 1}:a]aresample=48000,adelay={ms}|{ms}[t{k}]'); mix += f'[t{k}]'
        fc = ';'.join(chains) + ';' + mix + f'amix=inputs={len(tracks)}:normalize=0:duration=longest,atrim=0:{length:.3f},afade=t=in:d=0.2,afade=t=out:st={length - .7:.2f}:d=0.7,alimiter=limit=0.95[a]'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
                        '-t', f'{length:.2f}', '-movflags', '+faststart', a.out], check=True)
        os.remove(raw)
        for p, _ in tracks: os.remove(p)
    else:
        os.replace(raw, a.out)
    print('done:', os.path.relpath(a.out, ROOT))
    if a.vertical:
        vo = os.path.splitext(a.out)[0] + '-vertical.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.out, '-filter_complex',
                        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.18[bg];'
                        '[0:v]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', vo], check=True)
        print('vertical:', os.path.relpath(vo, ROOT))


if __name__ == '__main__':
    main()
